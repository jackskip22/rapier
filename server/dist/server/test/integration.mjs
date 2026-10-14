// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, symlink, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {inflateSync} from 'node:zlib';
import {createServer} from '../index.mjs';
import {renderCorpusCells} from './render-corpus.mjs';
import {UI_RESOURCE} from '../../mcp/worker.mjs';
import {mcpDescriptors} from '../../agent/catalog.mjs';
import {parseReply} from '../../agent/page-result.mjs';
import {unsealForEditor} from '../../agent/door-identity.mjs';
import {unwrap} from '../../skills/rapier-html/wrap.mjs';
import {readRapierWord} from './word.mjs';

function attachedSource(bytes) {
  const text = bytes.toString('latin1'), start = text.indexOf('/Type /EmbeddedFile');
  assert(start >= 0, 'PDF carries an embedded source stream');
  const stream = text.indexOf('stream\n', start), header = text.slice(start, stream);
  const length = Number(/\/Length (\d+)/.exec(header)?.[1]);
  assert(Number.isSafeInteger(length) && length > 0 && /\/FlateDecode/.test(header));
  return inflateSync(bytes.subarray(stream + 7, stream + 7 + length));
}

export async function serverCells({rendering=true}={}) {
  const folder = await mkdtemp(join(tmpdir(), 'rapier-server-'));
  const root = join(folder, 'documents'); await mkdir(root); await mkdir(join(root, 'nested'));
  const source = '\ufeff# Harbour\r\n\r\nKeep **these exact words** and λ.\r\n';
  await writeFile(join(root, 'harbour.md'), source);
  await writeFile(join(root, 'nested', 'second.md'), '# Other\n\nthese words exact\n');
  await writeFile(join(folder, 'outside.md'), 'OUTSIDE THE DOCUMENT ROOT');
  await symlink(join(folder, 'outside.md'), join(root, 'outside.md'));
  const chromium = process.env.RAPIER_SERVER_CHROMIUM || '/usr/bin/chromium';
  const chromiumVersion = process.env.RAPIER_SERVER_CHROMIUM_VERSION;
  assert(chromiumVersion, 'Set RAPIER_SERVER_CHROMIUM_VERSION to the exact locally qualified Chromium version; rendering is not silently skipped');
  const options = {root, port: 0, chromium, chromiumVersion, timeoutMs: 120000,
    noSandbox: process.env.RAPIER_SERVER_NO_SANDBOX === '1'};
  let server;
  const descriptors=mcpDescriptors({auth:'server-bearer',uiResource:UI_RESOURCE}),editorTransports=new Map();
  const retainTransport = wire => {
    const privateResult=wire._meta?.rapier;
    if(privateResult)assert.equal(Object.hasOwn(privateResult,'live'),false,'the server only advertises its implemented private editor transport');
    if(privateResult?.editorDocument && privateResult.editorTransport) {
      assert.equal(privateResult.editorTransport.url,server.origin+'/editor','the private ticket names the actual server editor endpoint');
      editorTransports.set(privateResult.editorDocument,privateResult.editorTransport);
    }
    return wire;
  };
  const start = async extra => { server = await createServer({...options, ...extra}); await server.listen(); return server; };
  const rpc = async (method, params = {}, scope = '') => {
    const response = await fetch(server.origin + '/mcp' + scope, {method:'POST', headers:{
      'Content-Type':'application/json', 'Accept':'application/json, text/event-stream',
      'MCP-Protocol-Version':'2025-11-25', 'Authorization':'Bearer '+server.token,
    }, body:JSON.stringify({jsonrpc:'2.0', id:randomUUID(), method,params})});
    assert.equal(response.status,200,await response.clone().text());
    const wire=await response.json(),result=wire.result || wire.error || wire;
    const descriptor=method==='tools/call' ? descriptors.find(tool=>tool.name===params.name) : null;
    if(descriptor && !wire.error) {
      assert.equal(result.structuredContent,undefined,params.name+': a six-tool result is a compact receipt');
      receipt(result);
    }
    return retainTransport(result);
  };
  const receipt = result => parseReply(result.content.find(item=>item.type==='text').text);
  const call = async (name,args={},scope='') => {const wire=await rpc('tools/call',{name,arguments:args},scope);return wire.content ? receipt(wire) : wire;};
  const editorCall = async (name,args) => {
    const transport=editorTransports.get(args.document);assert(transport,'the editor uses its workspace-bound private transport');
    const response=await fetch(new URL(new URL(transport.url).pathname,server.origin),{method:'POST',headers:{
      'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25',
      'Authorization':'Bearer '+transport.ticket,
    },body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name,arguments:args,_meta:{'rapier/editorKey':args.editorKey}}})});
    assert.equal(response.status,200,await response.clone().text());
    const reply=await response.json(),wire=retainTransport(reply.result || reply.error || reply);return wire.structuredContent || wire;
  };
  const named = document => ({document, operation_id:randomUUID()});
  try {
    await start();
    assert.equal((await fetch(server.origin+'/mcp',{method:'POST',body:'{}'})).status,401,'transport bearer is required before tool dispatch');
    const listing=await rpc('tools/list');
    assert.deepEqual(listing.tools,descriptors,'the served server contract matches its source schema and effects');
    for(const tool of listing.tools) {
      assert.equal(Object.hasOwn(tool,'securitySchemes'),false,'the local transport does not advertise an OAuth flow');
      assert.equal(Object.hasOwn(tool._meta || {},'securitySchemes'),false,'host metadata does not claim another authentication path');
    }
    assert(!JSON.stringify(listing).includes(server.token),'the transport credential stays outside tool descriptors');
    for(const name of ['rapier.open','document.read','document.export'])
      assert.equal((await call(name)).code,-32602,'retired public entry points remain inaccessible');
    assert.equal((await fetch(server.origin+'/d/outside.md')).status,403,'a symlink cannot disclose an outside file');
    assert.equal((await fetch(server.origin+'/d/%2e%2e/outside.md')).status,404,'parent paths never become file access');
    assert.equal((await fetch(server.origin+'/d/.rapier-server/credentials.json')).status,403,'private state is not a document');
    const page=await fetch(server.origin+'/d/harbour.md'+(rendering ? '' : '?format=html')); assert.equal(page.status,200,await page.clone().text());
    await writeFile(join(folder,'page.html'),await page.text());
    if(rendering) {
      execFileSync(process.execPath,[fileURLToPath(new URL('../../tools/read-shared-page.mjs',import.meta.url)),join(folder,'page.html'),join(folder,'reopened.md')]);
      assert.equal(await readFile(join(folder,'reopened.md'),'utf8'),source,'HTTP page recovers every original source byte including BOM/CRLF');
    } else assert.equal(unwrap(await readFile(join(folder,'page.html'),'utf8')).text,source,'HTTP offline HTML recovers every original source byte including BOM/CRLF');
    const search=await (await fetch(server.origin+'/search?q='+encodeURIComponent('"these exact words"'))).json();
    assert.deepEqual(search.results.map(row=>row.file),['harbour.md']); assert.deepEqual(search.confirm,[],'the server confirms literals against exact disk text');
    assert((await readdir(join(root,'.rapier-server'))).includes('search.json'),'the Notes projection is persisted');
    if(rendering) {
      const docx=await fetch(server.origin+'/d/harbour.md.docx'); assert.equal(docx.status,200,await docx.clone().text());
      const word=await readRapierWord(server.renderer,Buffer.from(await docx.arrayBuffer()),source);
      assert.match(word, /Harbour/); assert.match(word,/these exact words/);
      const pdf=await fetch(server.origin+'/d/harbour.md.pdf'); assert.equal(pdf.status,200,await pdf.clone().text());
      const pdfBytes=Buffer.from(await pdf.arrayBuffer());
      assert.equal(pdfBytes.subarray(0,5).toString(),'%PDF-');
      assert.deepEqual(attachedSource(pdfBytes),Buffer.from(source),'native PDF recovers exact BOM/CRLF source');
    }
    for(const format of rendering ? ['markdown','html','page','txt','docx','pdf'] : ['markdown','html']) {
      const response=await fetch(server.origin+'/d/harbour.md?format='+format);
      assert.equal(response.status,200,format+': '+(response.status===200 ? '' : await response.clone().text()));
      const bytes=Buffer.from(await response.arrayBuffer());
      if(format==='markdown')assert.deepEqual(bytes,Buffer.from(source));
      else if(format==='html')assert.equal(unwrap(bytes.toString()).text,source);
      else if(format==='page')assert.match(bytes.toString(),/type="text\/markdown"/);
      else if(format==='txt')assert.match(bytes.toString(),/Keep these exact words and λ\./);
      else if(format==='docx')assert.match(await readRapierWord(server.renderer,bytes,source),/Harbour/);
      else assert.deepEqual(attachedSource(bytes),Buffer.from(source));
    }
    const unknown=server.store.binding('document',{});
    for(let n=0;n<140;n++)await unknown.get('unallocated-'+n).fetch(new Request('https://rapier.internal/operation',{method:'POST',body:JSON.stringify({operation:"document.read",args:{start:0,end:0},capabilityHash:'0'.repeat(64)})}));
    assert(server.store.entries.size<=128,'unallocated workspaces cannot grow the live owner cache without bound');
    if(rendering) {
      const exited=server.renderer.process;
      const stopped=new Promise(resolve=>exited.once('exit',resolve));exited.kill('SIGKILL');await stopped;
      const restarted=await server.renderer.render('After the browser restarted.','restart.md');
      assert.match(restarted.bytes.toString(),/After the browser restarted/);
      const corpus=await renderCorpusCells(server.renderer);
      assert.equal(corpus.wordRoundTrips+corpus.codecRefusals.length,126);
      assert(corpus.wordRoundTrips>=125);
      if(corpus.codecRefusals.length)console.log('CODEC REFUSAL (not a Word round trip): '+JSON.stringify(corpus.codecRefusals));
    }
    const original='Original agent document.\r\n';
    const opening=await rpc('tools/call',{name:'open',arguments:{text:original,filename:'agent.md'}});
    const opened=receipt(opening); assert(opened.document,JSON.stringify(opened));
    assert.equal(Object.hasOwn(opened,'editor_url'),false,'the server does not advertise an unavailable top-level editor page');
    assert.equal(await readFile(join(root,'agent.md'),'utf8'),original);
    const scoped=await call('open',{},'?document=nested%2Fsecond.md'); assert(scoped.document,JSON.stringify(scoped));
    const read=await call('read',named(opened.document)); assert.equal(read.text,original);
    const exported=await rpc('tools/call',{name:'export',arguments:{...named(opened.document),format:'markdown'}});
    const file=exported.content.find(value=>value.type==='resource_link');assert(file,JSON.stringify(exported));
    assert(!JSON.stringify(exported).includes(server.token),'the transport credential stays outside file results');
    for(const headers of [{},{Authorization:'Bearer '+'A'.repeat(43)}])
      assert.equal((await fetch(file.uri,{headers})).status,401,'an export address alone or with a foreign bearer grants no access');
    const downloaded=await fetch(file.uri,{headers:{Authorization:'Bearer '+server.token}});
    assert.equal(downloaded.status,200);assert.equal(await downloaded.text(),original,'the authenticated export retains exact source');
    const fileHead=await fetch(file.uri,{method:'HEAD',headers:{Authorization:'Bearer '+server.token}});
    assert.equal(fileHead.status,200);assert.equal((await fileHead.arrayBuffer()).byteLength,0);
    assert.equal(Number(fileHead.headers.get('Content-Length')),Buffer.byteLength(original));
    for(const format of rendering ? ['html','page','txt','docx','pdf'] : ['html']) {
      const result=await rpc('tools/call',{name:'export',arguments:{...named(opened.document),format}});
      const done=receipt(result);assert.equal(done.outcome,'ok',format+': '+JSON.stringify(done));
      const link=result.content.find(value=>value.type==='resource_link');assert(link,format+' grants the completed file');
      const response=await fetch(link.uri,{headers:{Authorization:'Bearer '+server.token}});
      assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length,done.bytes,format+' receipt names exact byte count');
      if(format==='html')assert.equal(unwrap(bytes.toString()).text,original);
      else if(format==='page')assert.match(bytes.toString(),/type="text\/markdown"/);
      else if(format==='txt')assert.equal(bytes.toString(),'Original agent document.\n');
      else if(format==='docx')assert.match(await readRapierWord(server.renderer,bytes,original),/Original agent document/);
      else assert.deepEqual(attachedSource(bytes),Buffer.from(original));
    }
    assert.equal(await readFile(join(root,'agent.md'),'utf8'),original,'exports preserve exact disk source');
    const changed='Revised agent document.\r\n',operation_id=randomUUID();
    const editArgs={document:opened.document,operation_id,revision:read.revision,changes:[{old:original,new:changed}]};
    const edit=await call('edit',editArgs);
    assert.equal(edit.outcome,'applied',JSON.stringify(edit)); assert.equal(await readFile(join(root,'agent.md'),'utf8'),changed);
    const token=server.token; await server.close(); await start(); assert.equal(server.token,token,'the transport identity survives restart');
    const retry=await call('edit',editArgs);
    assert.equal(retry.outcome,'applied',JSON.stringify(retry)); assert.equal(await readFile(join(root,'agent.md'),'utf8'),changed,'retry cannot duplicate an acknowledged write');
    assert.equal(typeof edit.act,'string','an applied edit names its committed act');
    const undo=await call('undo',{act:edit.act,...named(opened.document)}); assert.equal(undo.outcome,'applied',JSON.stringify(undo));
    const inverse=(await call('read',{...named(opened.document),history:true})).history?.acts?.find(act=>act.id===undo.act);
    assert.deepEqual(inverse?.reverses,[edit.act],'the inverse names the original committed act');
    assert.equal(await readFile(join(root,'agent.md'),'utf8'),original,'the actual persisted kernel undoes to the exact original');
    const resource=await rpc('resources/read',{uri:UI_RESOURCE});
    assert.doesNotMatch(resource.contents?.[0]?.text || '',/globalThis\.RAPIER_EDITOR_KEY\s*=\s*["']/,'the served resource grants no editor key');
    const editorKey=opening._meta?.rapier?.editorKey;
    assert(editorKey,'the workspace tool result delivers its key through private metadata');
    assert.equal(opening._meta.rapier.editorDocument,opened.document);
    const {_meta:privateResult,...modelVisible}=opening;
    assert(!JSON.stringify(modelVisible).includes(editorKey),'model-visible results keep no editor key');
    assert(!JSON.stringify(modelVisible).includes(privateResult.rapier.editorTransport.ticket),'model-visible results keep no editor transport ticket');
    const forged=await call("document.rotate_capability",{document:opened.document,editorKey:'not-an-editor-key'});
    assert.equal(forged.code,-32602,'an agent cannot invoke private rotation with invented editor authority');
    const argumentOnly=await call("document.rotate_capability",{document:opened.document,editorKey});
    assert.equal(argumentOnly.code,-32602,'a model-filled key argument cannot expose the private editor operation');
    const metadataOnly=await rpc('tools/call',{name:'document.rotate_capability',arguments:{document:opened.document,editorKey},_meta:{'rapier/editorKey':editorKey}});
    assert.equal(metadataOnly.code,-32602,'forged Apps metadata cannot expose a private operation on the model route');
    for(const headers of [{},{Authorization:'Bearer '+server.token}]) {
      const refused=await fetch(server.origin+'/editor',{method:'POST',headers:{'Content-Type':'application/json',...headers},
        body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name:'document.rotate_capability',arguments:{document:opened.document,editorKey},_meta:{'rapier/editorKey':editorKey}}})});
      assert.equal(refused.status,401,'forged Apps metadata and the server bearer cannot replace the private editor ticket');
    }
    const foreignKey=await editorCall("document.sync",{document:scoped.document,editorKey});
    assert.match(JSON.stringify(foreignKey),/HUMAN_AUTHORITY_REQUIRED/,'one document key cannot authorize another workspace');
    const rotation=await editorCall("document.rotate_capability",{document:opened.document,editorKey});
    assert.equal(rotation.rotated,true,JSON.stringify(rotation));assert(!rotation.document,'the successor is not exposed as agent-readable text');
    const successor=await unsealForEditor(editorKey,rotation.sealed);assert.match(successor,/^rpr_/);
    const synced=await editorCall("document.sync",{document:successor,editorKey});
    const shared=await editorCall("document.connect_agents",{document:successor,editorKey,expectedRevision:synced.documentRevision,expectedVersion:synced.version,operation_id:'share-again'});
    assert.equal(shared.outcome,'ok',JSON.stringify(shared));
    const returned=await call('show',{...named(successor),target:'return'});
    assert.equal(new URL(returned.return_url).origin,server.origin,'a returned file belongs to this business server, not the public deployment');
    const returnedSource='\ufeffReturned from the local client.\r\n😀\r\n';
    for(const headers of [{},{Authorization:'Bearer '+'A'.repeat(43)}])
      assert.equal((await fetch(returned.return_url,{method:'POST',headers:{'Content-Type':'text/markdown',...headers},body:returnedSource})).status,401,'a public return address never authorizes an upload');
    assert.equal((await fetch(returned.return_url,{headers:{Authorization:'Bearer '+server.token}})).status,405,'the local service exposes no OAuth browser-return flow');
    const received=await fetch(returned.return_url,{method:'POST',headers:{'Content-Type':'text/markdown',Authorization:'Bearer '+server.token},body:returnedSource});
    assert.equal(received.status,200);assert.equal((await received.json()).accepted,true);
    assert.equal((await call('read',{return_id:returned.return_id,...named(successor),limit:4096})).text,returnedSource);
    assert.equal(await readFile(join(root,'agent.md'),'utf8'),original,'an authenticated return keeps the working file unchanged');

    const old=await call('read',named(opened.document)); assert.notEqual(old.text,original,'retired bearer has no read authority');
    assert.equal((await call('read',named(successor))).text,original);
    await writeFile(join(root,'agent.md'),'Edited outside the service.\n');
    const stale=await call('read',named(successor));
    assert.notEqual(stale.text,original); assert.equal(await readFile(join(root,'agent.md'),'utf8'),'Edited outside the service.\n','stale workspace does not overwrite external changes');
    const refresh=await (await fetch(server.origin+'/search?q=outside')).json(); assert(refresh.results.some(row=>row.file==='agent.md'));
    const colliding=await call('open',{text:'Do not overwrite',filename:'harbour.md'}); assert(!colliding.document,'a new workspace cannot overwrite a named existing file');
    assert.equal(await readFile(join(root,'harbour.md'),'utf8'),source);
    const scopedRead=await call('read',{...named(scoped.document),limit:7}); assert.equal(scopedRead.text,'# Other');
    await assert.rejects(createServer(options),error=>error.code==='ROOT_LOCKED');
    const health=await (await fetch(server.origin+'/health')).json(); assert.equal(health.ready,true);
    const guarded='<!-- will/1 keep -->\nApproved clause.\n<!-- /will -->\n';
    const will=await call('open',{text:guarded,filename:'governed.md'});assert(will.document);
    const willRead=await call('read',named(will.document));
    const willEdit=await call('edit',{...named(will.document),revision:willRead.revision,changes:[{text:'Unapproved replacement.\n'}]});
    assert.notEqual(willEdit.outcome,'applied','the filesystem door cannot bypass Will keep');
    assert.equal(await readFile(join(root,'governed.md'),'utf8'),guarded);
    const directOpening=await rpc('tools/call',{name:'open',arguments:{text:'Before edit.\n',filename:'direct.md'}});
    const direct=receipt(directOpening);assert(direct.document);
    const directKey=directOpening._meta?.rapier?.editorKey;assert(directKey);
    assert.equal(directOpening._meta.rapier.editorDocument,direct.document);
    const beforeDirect=await call('read',named(direct.document));
    const applied=await call('edit',{...named(direct.document),revision:beforeDirect.revision,changes:[{old:beforeDirect.text,new:'After edit.\n'}]});
    assert.equal(applied.outcome,'applied',JSON.stringify(applied));assert(typeof applied.act==='string' && applied.act,'a direct edit identifies its committed act');
    assert.equal(await readFile(join(root,'direct.md'),'utf8'),'After edit.\n','an ordinary agent edit immediately publishes the exact inspected replacement');
    const deleting=await editorCall("document.delete",{document:direct.document,editorKey:directKey});
    assert(!deleting.isError,JSON.stringify(deleting));assert.equal(await readFile(join(root,'direct.md'),'utf8'),'After edit.\n','workspace deletion never deletes the business file');
    for(const point of ['prepared','document','state']) {
      await server.close();let fired=false;
      await start({onCommitStep:step=>{if(step===point && !fired){fired=true;throw new Error('injected commit interruption');}}});
      const createToken=randomUUID().replaceAll('-',''),filename='recovery-'+point+'.md',text='Recovered '+point+'.\r\n';
      const interrupted=await call('open',{text,filename,createToken});
      assert(fired);assert(!interrupted.document,'an interrupted persistence is not acknowledged');
      assert.equal((await fetch(server.origin+'/health')).status,503,'a prepared uncertain write requires recovery');
      assert((await readdir(join(root,'.rapier-server'))).includes('pending.json'));
      await server.close();await start();
      assert.equal(await readFile(join(root,filename),'utf8'),text);
      const replay=await call('open',{text,filename,createToken});assert(replay.document,JSON.stringify(replay));
      assert.equal((await call('read',named(replay.document))).text,text);
      assert(!(await readdir(join(root,'.rapier-server'))).includes('pending.json'),'recovery clears the WAL only after both records are durable');
    }

    return 'filesystem: isolated HTTP create/read/edit/Undo/rotation, exact source across restart, stale-file refusal, scoped open, Notes disk search, path/symlink/private-state refusal; Will keep, immediate canonical act, workspace deletion keeps the file, recovery at all three durable cuts; exact Markdown/offline HTML; '+(rendering ? 'actual rendered page/Word/PDF via Chromium '+chromiumVersion : 'rendered page/Word/PDF and rendering corpus unrun');
  } finally { await server?.close(); await rm(folder,{recursive:true,force:true}); }
}
