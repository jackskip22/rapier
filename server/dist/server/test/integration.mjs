// SPDX-License-Identifier: AGPL-3.0-only
// Cells of mcp-create-isolation: real HTTP, files, persisted kernel, restart and exports.
// No DOM double, screenshot, appearance assertion or extra witness row.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm, symlink, readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createServer} from '../index.mjs';
import {renderCorpusCells} from './render-corpus.mjs';
import {UI_RESOURCE} from '../../mcp/worker.mjs';
import {unsealForEditor} from '../../agent/door-identity.mjs';

export async function serverCells() {
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
  const options = {root, port: 0, chromium, chromiumVersion,
    noSandbox: process.env.RAPIER_SERVER_NO_SANDBOX === '1'};
  let server;
  const start = async extra => { server = await createServer({...options, ...extra}); await server.listen(); return server; };
  const rpc = async (method, params = {}, scope = '') => {
    const response = await fetch(server.origin + '/mcp' + scope, {method:'POST', headers:{
      'Content-Type':'application/json', 'Accept':'application/json, text/event-stream',
      'MCP-Protocol-Version':'2025-11-25', 'Authorization':'Bearer '+server.token,
    }, body:JSON.stringify({jsonrpc:'2.0', id:randomUUID(), method,params})});
    assert.equal(response.status,200,await response.clone().text());
    const wire=await response.json(); return wire.result || wire.error || wire;
  };
  const call = async (name,args={},scope='') => {const wire=await rpc('tools/call',{name,arguments:args},scope);return wire.structuredContent || wire;};
  const named = document => ({document, operation_id:randomUUID()});
  try {
    await start();
    assert.equal((await fetch(server.origin+'/mcp',{method:'POST',body:'{}'})).status,401,'transport bearer is required before tool dispatch');
    assert.equal((await fetch(server.origin+'/d/outside.md')).status,403,'a symlink cannot disclose an outside file');
    assert.equal((await fetch(server.origin+'/d/%2e%2e/outside.md')).status,404,'parent paths never become file access');
    assert.equal((await fetch(server.origin+'/d/.rapier-server/credentials.json')).status,403,'private state is not a document');
    const page=await fetch(server.origin+'/d/harbour.md'); assert.equal(page.status,200,await page.clone().text());
    await writeFile(join(folder,'page.html'),await page.text());
    execFileSync(process.execPath,[fileURLToPath(new URL('../../tools/read-shared-page.mjs',import.meta.url)),join(folder,'page.html'),join(folder,'reopened.md')]);
    assert.equal(await readFile(join(folder,'reopened.md'),'utf8'),source,'HTTP page recovers every original source byte including BOM/CRLF');
    const search=await (await fetch(server.origin+'/search?q='+encodeURIComponent('"these exact words"'))).json();
    assert.deepEqual(search.results.map(row=>row.file),['harbour.md']); assert.deepEqual(search.confirm,[],'the server confirms literals against exact disk text');
    assert((await readdir(join(root,'.rapier-server'))).includes('search.json'),'the Notes projection is persisted');
    const docx=await fetch(server.origin+'/d/harbour.md.docx'); assert.equal(docx.status,200,await docx.clone().text());
    const word=await server.renderer.readWord(Buffer.from(await docx.arrayBuffer()));
    assert.match(word.html, /Harbour/); assert.match(word.html,/these exact words/);
    const pdf=await fetch(server.origin+'/d/harbour.md.pdf'); assert.equal(pdf.status,200,await pdf.clone().text());
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
    const unknown=server.store.binding('document',{});
    for(let n=0;n<140;n++)await unknown.get('unallocated-'+n).fetch(new Request('https://rapier.internal/operation',{method:'POST',body:JSON.stringify({operation:'document.read_context',args:{start:0,end:0},capabilityHash:'0'.repeat(64)})}));
    assert(server.store.entries.size<=128,'unallocated workspaces cannot grow the live owner cache without bound');
    const exited=server.renderer.process;
    const stopped=new Promise(resolve=>exited.once('exit',resolve));exited.kill('SIGKILL');await stopped;
    const restarted=await server.renderer.render('After the browser restarted.','restart.md');
    assert.match(restarted.bytes.toString(),/After the browser restarted/);
    const corpus=await renderCorpusCells(server.renderer);
    assert.equal(corpus.wordRoundTrips+corpus.codecRefusals.length,126);
    assert(corpus.wordRoundTrips>=125);
    if(corpus.codecRefusals.length)console.log('CODEC REFUSAL (not a Word round trip): '+JSON.stringify(corpus.codecRefusals));
    const original='Original agent document.\r\n';
    const opened=await call('rapier.open',{text:original,filename:'agent.md'}); assert(opened.document,JSON.stringify(opened));
    assert.equal(await readFile(join(root,'agent.md'),'utf8'),original);
    const scoped=await call('rapier.open',{},'?document=nested%2Fsecond.md'); assert(scoped.document,JSON.stringify(scoped));
    const read=await call('document.read_context',{...named(opened.document),start:0,end:original.length}); assert.equal(read.text,original);
    const changed='Revised agent document.\r\n',operation_id=randomUUID();
    const edit=await call('document.apply_edits',{document:opened.document,operation_id,edits:[{context_handle:read.handle,text:changed}]});
    assert.equal(edit.outcome,'applied',JSON.stringify(edit)); assert.equal(await readFile(join(root,'agent.md'),'utf8'),changed);
    const token=server.token; await server.close(); await start(); assert.equal(server.token,token,'the transport identity survives restart');
    const retry=await call('document.apply_edits',{document:opened.document,operation_id,edits:[{context_handle:read.handle,text:changed}]});
    assert.equal(retry.outcome,'applied',JSON.stringify(retry)); assert.equal(await readFile(join(root,'agent.md'),'utf8'),changed,'retry cannot duplicate an acknowledged write');
    const undo=await call('document.undo_agent_change',{...named(opened.document),change_id:edit.changeId}); assert.equal(undo.outcome,'applied',JSON.stringify(undo));
    assert.equal(await readFile(join(root,'agent.md'),'utf8'),original,'the actual persisted kernel undoes to the exact original');
    const resource=await rpc('resources/read',{uri:UI_RESOURCE});
    const editorKey=/globalThis\.RAPIER_EDITOR_KEY = "([^"]+)"/.exec(resource.contents?.[0]?.text || '')?.[1];
    assert(editorKey,'the actual served MCP App mints an editor key');
    const forged=await call('document.rotate_capability',{document:opened.document,editorKey:'not-an-editor-key'});
    assert.match(JSON.stringify(forged),/HUMAN_AUTHORITY_REQUIRED/,'an agent cannot rotate with invented editor authority');
    const rotation=await call('document.rotate_capability',{document:opened.document,editorKey});
    assert.equal(rotation.rotated,true,JSON.stringify(rotation));assert(!rotation.document,'the successor is not exposed as agent-readable text');
    const successor=await unsealForEditor(editorKey,rotation.sealed);assert.match(successor,/^rpr_/);
    const returned=await call('document.create_return',named(successor));
    assert.equal(new URL(returned.return_url).origin,server.origin,'a returned file belongs to this business server, not the public deployment');

    const old=await call('document.read_context',{...named(opened.document),start:0,end:original.length}); assert.notEqual(old.text,original,'retired bearer has no read authority');
    assert.equal((await call('document.read_context',{...named(successor),start:0,end:original.length})).text,original);
    await writeFile(join(root,'agent.md'),'Edited outside the service.\n');
    const stale=await call('document.read_context',{...named(successor),start:0,end:original.length});
    assert.notEqual(stale.text,original); assert.equal(await readFile(join(root,'agent.md'),'utf8'),'Edited outside the service.\n','stale workspace does not overwrite external changes');
    const refresh=await (await fetch(server.origin+'/search?q=outside')).json(); assert(refresh.results.some(row=>row.file==='agent.md'));
    const colliding=await call('rapier.open',{text:'Do not overwrite',filename:'harbour.md'}); assert(!colliding.document,'a new workspace cannot overwrite a named existing file');
    assert.equal(await readFile(join(root,'harbour.md'),'utf8'),source);
    const scopedRead=await call('document.read_context',{...named(scoped.document),start:0,end:7}); assert.equal(scopedRead.text,'# Other');
    // The root cannot be opened for writing by a second process/server instance.
    await assert.rejects(createServer(options),error=>error.code==='ROOT_LOCKED');
    const health=await (await fetch(server.origin+'/health')).json(); assert.equal(health.ready,true);
    const guarded='<!-- will/1 keep -->\nApproved clause.\n<!-- /will -->\n';
    const will=await call('rapier.open',{text:guarded,filename:'governed.md'});assert(will.document);
    const willRead=await call('document.read_context',{...named(will.document),start:0,end:guarded.length});
    const willEdit=await call('document.apply_edits',{...named(will.document),edits:[{context_handle:willRead.handle,text:'Unapproved replacement.\n'}]});
    assert.notEqual(willEdit.outcome,'applied','the filesystem door cannot bypass Will keep');
    assert.equal(await readFile(join(root,'governed.md'),'utf8'),guarded);
    const review=await call('rapier.open',{text:'Before review.\n',filename:'review.md'});assert(review.document);
    const editorState=()=>call('document.sync',{document:review.document,editorKey});
    const position=value=>({expectedRevision:value.documentRevision,expectedVersion:value.version ?? value.acceptedVersion});
    let state=await editorState();
    const policy=await call('document.set_policy',{document:review.document,editorKey,...position(state),posture:'ask',decisionId:randomUUID()});
    assert(['ok','applied','unchanged'].includes(policy.outcome),JSON.stringify(policy));
    const beforeReview=await call('document.read_context',{...named(review.document),start:0,end:15});
    const staged=await call('document.apply_edits',{...named(review.document),edits:[{context_handle:beforeReview.handle,text:'After approval.\n'}]});
    assert.equal(staged.outcome,'pending',JSON.stringify(staged));
    assert.equal(await readFile(join(root,'review.md'),'utf8'),'Before review.\n','ASK cannot publish an unapproved proposal to disk');
    state=await editorState();
    const approved=await call('document.review_decide',{document:review.document,editorKey,...position(state),
      reviewId:staged.pending.reviewId ?? staged.pending.proposalId ?? staged.pending.requestId,action:'approve',decisionId:randomUUID()});
    assert(['ok','applied','rebased','unchanged'].includes(approved.outcome),JSON.stringify(approved));
    assert.equal(await readFile(join(root,'review.md'),'utf8'),'After approval.\n','the person approves the exact staged words');
    const deleting=await call('document.delete',{document:review.document,editorKey});
    assert(!deleting.isError,JSON.stringify(deleting));assert.equal(await readFile(join(root,'review.md'),'utf8'),'After approval.\n','workspace deletion never deletes the business file');
    // A fault after each durable cut leaves the same recoverable kernel snapshot. The
    // production adapter is exercised; only the crash moment is injected.
    for(const point of ['prepared','document','state']) {
      await server.close();let fired=false;
      await start({onCommitStep:step=>{if(step===point && !fired){fired=true;throw new Error('injected commit interruption');}}});
      const createToken=randomUUID().replaceAll('-',''),filename='recovery-'+point+'.md',text='Recovered '+point+'.\r\n';
      const interrupted=await call('rapier.open',{text,filename,createToken});
      assert(fired);assert(!interrupted.document,'an interrupted persistence is not acknowledged');
      assert.equal((await fetch(server.origin+'/health')).status,503,'a prepared uncertain write requires recovery');
      assert((await readdir(join(root,'.rapier-server'))).includes('pending.json'));
      await server.close();await start();
      assert.equal(await readFile(join(root,filename),'utf8'),text);
      const replay=await call('rapier.open',{text,filename,createToken});assert(replay.document,JSON.stringify(replay));
      assert.equal((await call('document.read_context',{...named(replay.document),start:0,end:text.length})).text,text);
      assert(!(await readdir(join(root,'.rapier-server'))).includes('pending.json'),'recovery clears the WAL only after both records are durable');
    }

    return 'filesystem: isolated HTTP create/read/edit/Undo/rotation, exact source across restart, stale-file refusal, scoped open, Notes disk search, path/symlink/private-state refusal; Will keep, human ASK/approval, workspace deletion keeps the file, recovery at all three durable cuts; actual shared HTML/Word/PDF via Chromium '+chromiumVersion;
  } finally { await server?.close(); await rm(folder,{recursive:true,force:true}); }
}
