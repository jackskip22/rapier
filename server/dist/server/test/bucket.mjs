// SPDX-License-Identifier: AGPL-3.0-only
// Cells of mcp-create-isolation, not another row. The only fake is the packet's
// S3 protocol peer: the HTTP server, store adapter, MCP kernel and Notes search are real.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createServer} from '../index.mjs';
import {FileStore} from '../store.mjs';
import {BucketStore} from '../bucket-store.mjs';
import {main} from '../cli.mjs';
import {fakeS3,witnessKey,witnessSecret,witnessSession} from './fake-s3.mjs';
const named=document=>({document,operation_id:randomUUID()});
async function call(server,name,args={},scope='') {
  const response=await fetch(server.origin+'/mcp'+scope,{method:'POST',headers:{
    'Content-Type':'application/json','Accept':'application/json, text/event-stream',
    'MCP-Protocol-Version':'2025-11-25',Authorization:'Bearer '+server.token},
    body:JSON.stringify({jsonrpc:'2.0',id:randomUUID(),method:'tools/call',params:{name,arguments:args}})});
  const wire=await response.json(),result=wire.result || wire.error || wire;
  return result.structuredContent || result;
}
function applied(result) {assert.equal(result.outcome,'applied',JSON.stringify(result));}
function safe(value) {
  const text=typeof value==='string' ? value : JSON.stringify(value,Object.getOwnPropertyNames(value));
  for(const secret of [witnessKey,witnessSecret,witnessSession])assert(!text.includes(secret),'bucket credentials never reach a diagnostic or retained state');
}
export async function bucketCells() {
  const vars={RAPIER_BUCKET_KEY_ID:witnessKey,RAPIER_BUCKET_SECRET:witnessSecret,RAPIER_BUCKET_REGION:'us-east-1',RAPIER_BUCKET_SESSION_TOKEN:witnessSession};
  const before=Object.fromEntries(Object.keys(vars).map(key=>[key,process.env[key]]));Object.assign(process.env,vars);
  const peer=await fakeS3(),folder=await mkdtemp(join(tmpdir(),'rapier-bucket-'));
  const bucket={bucket:peer.bucket,endpoint:peer.endpoint};
  const browser={port:0,chromium:process.env.RAPIER_SERVER_CHROMIUM,chromiumVersion:process.env.RAPIER_SERVER_CHROMIUM_VERSION,noSandbox:process.env.RAPIER_SERVER_NO_SANDBOX==='1'};
  const live=new Set(),stores=new Set();let crash=false;
  const start=async options=>{const server=await createServer({...browser,...options});live.add(server);await server.listen();return server;};
  const stop=async server=>{await server.close();live.delete(server);};
  const openStore=async(options,isFile=false)=>{const store=await new (isFile ? FileStore : BucketStore)(options).open();stores.add(store);return store;};
  try {
    let disk=await start({root:folder}),cloud=await start(bucket);
    const source='\ufeff# Harbour\r\n\r\nKeep **these exact words** and λ.\r\n',changed=source.replace('these exact words','the revised passage');
    const identities=[];
    for(const server of [disk,cloud]) {
      const opened=await call(server,'rapier.open',{filename:'harbour.md',text:source});assert(opened.document,JSON.stringify(opened));
      const context=await call(server,'document.read_context',{...named(opened.document),start:0,end:source.length});assert.equal(context.text,source);
      const operation_id=randomUUID(),args={document:opened.document,operation_id,edits:[{context_handle:context.handle,text:changed}]};
      const edit=await call(server,'document.apply_edits',args);applied(edit);identities.push({opened,context,args,edit});
    }
    assert.deepEqual(Buffer.from((await cloud.store.read('harbour.md')).text),await readFile(join(folder,'harbour.md')),'edit bytes match the actual folder');
    const token=cloud.token;await stop(cloud);await stop(disk);disk=await start({root:folder});cloud=await start(bucket);assert.equal(cloud.token,token);
    for(const [index,server] of [disk,cloud].entries()) {
      const {opened,args,edit}=identities[index];applied(await call(server,'document.apply_edits',args));
      assert.equal((await server.store.read('harbour.md')).text,changed,'restart retry is exactly once');
      applied(await call(server,'document.undo_agent_change',{...named(opened.document),change_id:edit.changeId}));
      assert.equal((await server.store.read('harbour.md')).text,source,'durable kernel Undo restores BOM, CRLF and Unicode');
    }
    assert.deepEqual(Buffer.from((await cloud.store.read('harbour.md')).text),await readFile(join(folder,'harbour.md')));
    const strange="nested λ/space +%#&'().md";
    await mkdir(dirname(join(folder,strange)));await writeFile(join(folder,strange),'# Nested\nA unique nestedneedle.\n');
    await cloud.store.publishDocument(strange,'# Nested\nA unique nestedneedle.\n',null);
    for(let n=0;n<5;n++) {const name='page-'+n+'.md',text='Document '+n+'\n';await writeFile(join(folder,name),text);await cloud.store.publishDocument(name,text,null);}
    peer.seed('.rapier-server/never-list.md','not a document head');peer.seed('ignored.txt','ordinary non-Markdown object');
    const diskRows=await disk.store.scan(),cloudRows=await cloud.store.scan();
    assert.deepEqual(cloudRows.map(({name,text,hash,bytes})=>({name,text,hash,bytes})),diskRows.map(({name,text,hash,bytes})=>({name,text,hash,bytes})),'paged bucket paths and bytes equal the folder');
    for(const query of ['"these exact words"','nestedneedle']) {
      const results=[];
      for(const server of [disk,cloud]) {const response=await fetch(server.origin+'/search?q='+encodeURIComponent(query));assert.equal(response.status,200,await response.clone().text());results.push(await response.json());}
      // Creation/mtime are storage facts, not part of source/search-result parity.
      const comparable=answer=>JSON.stringify(answer,(key,value)=>['created','modified'].includes(key) ? undefined : value);
      assert.equal(comparable(results[1]),comparable(results[0]),'the complete Notes answer is identical apart from store timestamps');
    }
    const scoped=await call(cloud,'rapier.open',{},'?document='+encodeURIComponent(strange));assert(scoped.document,JSON.stringify(scoped));
    assert.equal((await call(cloud,'document.read_context',{...named(scoped.document),start:0,end:'# Nested\nA unique nestedneedle.\n'.length})).text,'# Nested\nA unique nestedneedle.\n');
    assert.equal((await fetch(cloud.origin+'/d/.rapier-server/credentials.json')).status,403);
    assert(!peer.requests.some(row=>row.list && row.prefix?.startsWith('.rapier-server/parts/')),'search never walks the private part tree');

    // Two independent server/kernel caches race after both have read the same ETag.
    const other=await start(bucket),original='One original.\r\n';
    const opened=await call(cloud,'rapier.open',{filename:'parallel.md',text:original});assert(opened.document,JSON.stringify(opened));
    const context=await call(cloud,'document.read_context',{...named(opened.document),start:0,end:original.length});
    const release=peer.barrier('parallel.md');
    const edits=await Promise.all([cloud,other].map((server,index)=>call(server,'document.apply_edits',{...named(opened.document),edits:[{context_handle:context.handle,text:'Writer '+index+' won.\r\n'}]})));
    release();assert.equal(edits.filter(row=>row.outcome==='applied').length,1,JSON.stringify(edits));
    assert.match(JSON.stringify(edits.find(row=>row.outcome!=='applied')),/FILE_CONFLICT|WORKSPACE_UNAVAILABLE/);
    assert(peer.requests.some(row=>row.key==='parallel.md' && row.status===412),'the loser was refused at S3, not just a local queue');
    const winner=edits.findIndex(row=>row.outcome==='applied');assert.equal((await cloud.store.read('parallel.md')).text,'Writer '+winner+' won.\r\n');
    applied(await call([cloud,other][winner],'document.undo_agent_change',{...named(opened.document),change_id:edits[winner].changeId}));
    assert.equal((await cloud.store.read('parallel.md')).text,original);
    // Same content but a newer kernel snapshot also invalidates a cached writer.
    const firstContext=await call(cloud,'document.read_context',{...named(opened.document),start:0,end:original.length});
    if(!firstContext.handle)assert((await call(cloud,'document.read_context',{...named(opened.document),start:0,end:original.length})).handle);
    const newer=await call(other,'document.read_context',{...named(opened.document),start:0,end:original.length});
    // A cache evicted by the losing race may require one explicit reopen/retry.
    if(!newer.handle)assert((await call(other,'document.read_context',{...named(opened.document),start:0,end:original.length})).handle);
    const stale=await call(cloud,'document.read_context',{...named(opened.document),start:0,end:original.length});
    assert.match(JSON.stringify(stale),/FILE_CONFLICT|WORKSPACE_UNAVAILABLE/,'state-only publication cannot be overwritten by a cached owner');

    // Create-only CAS has the same refusal code as a stale folder publication.
    const releaseCreate=peer.barrier('create-race.md');
    const creates=await Promise.allSettled([cloud.store.publishDocument('create-race.md','A',null),other.store.publishDocument('create-race.md','B',null)]);
    releaseCreate();assert.equal(creates.filter(row=>row.status==='fulfilled').length,1);assert.equal(creates.find(row=>row.status==='rejected').reason.code,'FILE_CONFLICT');
    await assert.rejects(disk.store.publishDocument('harbour.md','stale',null),{code:'FILE_CONFLICT'});
    await stop(other);

    // Durable parts and locator are written, but no head is published at the crash cut.
    await stop(cloud);cloud=await start({...bucket,onCommitStep:step=>{if(crash && step==='prepared'){crash=false;throw new Error('simulated process cut before head');}}});
    const crashOpen=await call(cloud,'rapier.open',{filename:'crash.md',text:original});assert(crashOpen.document,JSON.stringify(crashOpen));
    const crashContext=await call(cloud,'document.read_context',{...named(crashOpen.document),start:0,end:original.length});
    const headBefore=Buffer.from(peer.objects.get('crash.md').body),partCount=[...peer.objects.keys()].filter(key=>key.startsWith('.rapier-server/parts/')).length;
    const crashArgs={...named(crashOpen.document),edits:[{context_handle:crashContext.handle,text:'After crash.\r\n'}]};
    crash=true;assert.notEqual((await call(cloud,'document.apply_edits',crashArgs)).outcome,'applied');
    assert.deepEqual(peer.objects.get('crash.md').body,headBefore,'crash cannot move the head before parts are complete');
    assert([...peer.objects.keys()].filter(key=>key.startsWith('.rapier-server/parts/')).length>partCount,'the cut really occurred after new parts were stored');
    assert.equal((await cloud.store.read('crash.md')).text,original);
    await stop(cloud);cloud=await start(bucket);assert.equal((await cloud.store.read('crash.md')).text,original);
    const retried=await call(cloud,'document.apply_edits',crashArgs);applied(retried);
    applied(await call(cloud,'document.undo_agent_change',{...named(crashOpen.document),change_id:retried.changeId}));assert.equal((await cloud.store.read('crash.md')).text,original);
    // A lost response after the head is durable replays the accepted operation on restart.
    const lostContext=await call(cloud,'document.read_context',{...named(crashOpen.document),start:0,end:original.length});
    const lostArgs={...named(crashOpen.document),edits:[{context_handle:lostContext.handle,text:'Committed without a response.\r\n'}]};
    peer.after=(row,response)=>{if(row.method==='PUT' && row.key==='crash.md'){peer.after=null;response.destroy();}};
    assert.notEqual((await call(cloud,'document.apply_edits',lostArgs)).outcome,'applied');
    await stop(cloud);cloud=await start(bucket);assert.equal((await cloud.store.read('crash.md')).text,'Committed without a response.\r\n');
    const lostRetry=await call(cloud,'document.apply_edits',lostArgs);applied(lostRetry);
    applied(await call(cloud,'document.undo_agent_change',{...named(crashOpen.document),change_id:lostRetry.changeId}));assert.equal((await cloud.store.read('crash.md')).text,original);

    // Identical configured refusal limits, including a bounded streamed object read.
    await stop(disk);
    for(const [limits,code,operation] of [[{maxDocumentBytes:1},'FILE_TOO_LARGE',store=>store.read('harbour.md')],[{maxDocuments:1},'FOLDER_TOO_LARGE',store=>store.scan()],[{maxFolderBytes:1},'FOLDER_TOO_LARGE',store=>store.scan()]]) {
      for(const isFile of [true,false]) {const store=await openStore({...limits,...(isFile ? {root:folder} : bucket)},isFile);await assert.rejects(operation(store),{code});await store.close();stores.delete(store);}
    }
    const tiny=await openStore({...bucket,maxDocumentBytes:1});await assert.rejects(tiny.publishDocument('too-big.md','XX',null),{code:'FILE_TOO_LARGE'});await tiny.close();stores.delete(tiny);
    const corrupt='broken.md',sourceHash=JSON.parse(peer.objects.get('harbour.md').body).source.hash;
    peer.seed(corrupt,JSON.stringify({...JSON.parse(peer.objects.get('harbour.md').body),name:corrupt,source:{hash:'0'.repeat(64),bytes:1}}));
    await assert.rejects(cloud.store.read(corrupt),{code:'STATE_DAMAGED'});peer.objects.delete(corrupt);
    const preserved=peer.objects.get('.rapier-server/parts/'+sourceHash);peer.seed('.rapier-server/parts/'+sourceHash,'damaged source');
    await assert.rejects(cloud.store.read('harbour.md'),{code:'STATE_DAMAGED'});peer.objects.set('.rapier-server/parts/'+sourceHash,preserved);
    peer.listPage=text=>text.replace(/<NextContinuationToken>[^<]+<\/NextContinuationToken>/,'');
    await assert.rejects(cloud.store.scan(),{code:'BUCKET_RESPONSE_INVALID'});peer.listPage=null;

    // Provider error bodies/redirects and thrown transport errors cannot disclose keys.
    const logs=[],oldLog=console.log,oldError=console.error;
    try {
      console.log=(...args)=>logs.push(args.join(' '));console.error=(...args)=>logs.push(args.join(' '));
      for(const status of [403,307]) {
        peer.before=(row,response)=>{if(row.key==='harbour.md'){row.status=status;response.writeHead(status,status===307 ? {location:peer.endpoint+'/'+witnessSecret} : {});response.end(witnessKey+' '+witnessSecret+' '+witnessSession);}};
        await assert.rejects(cloud.store.read('harbour.md'),error=>{safe(error);return error.code==='BUCKET_REQUEST_FAILED';});peer.before=null;
      }
      await assert.rejects(main(['serve','--bucket',peer.bucket,'--endpoint',peer.endpoint,'--'+witnessSecret]),error=>{safe(error);return error instanceof TypeError;});
      assert.throws(()=>new BucketStore({...bucket,endpoint:'https://'+witnessKey+':'+witnessSecret+'@example.test'}),error=>{safe(error);return error instanceof TypeError;});
      const signalListeners=new Map(['SIGINT','SIGTERM'].map(signal=>[signal,new Set(process.listeners(signal))]));
      const cli=await main(['serve','--bucket',peer.bucket,'--endpoint',peer.endpoint,'--port','0','--chromium',browser.chromium,'--chromium-version',browser.chromiumVersion,...(browser.noSandbox ? ['--no-sandbox'] : [])],{log:line=>logs.push(line)});
      live.add(cli);await stop(cli);
      // The CLI's process-signal hooks are installed once by an executable, not by the package test process.
      for(const signal of ['SIGINT','SIGTERM'])for(const listener of process.listeners(signal))if(!signalListeners.get(signal).has(listener))process.removeListener(signal,listener);
      logs.forEach(safe);assert(logs.some(line=>line.includes('private bucket storage')));
    } finally {console.log=oldLog;console.error=oldError;peer.before=null;}
    for(const {body} of peer.objects.values())safe(body.toString());
    safe(JSON.stringify(peer.requests));assert.deepEqual(peer.faults,[],'all requests were independently signature-verified');
    const puts=peer.requests.filter(row=>row.method==='PUT');assert(puts.every(row=>row.condition),'not one unconditional PUT');
    const summary='bucket: folder-byte parity, real MCP edit/restart/retry/Undo/search, encoded paged listing, stale/state-only/create races, parts/head crash cuts, lost-response replay, limits, corruption and credential-safe CLI; '+puts.length+' conditional PUTs';
    console.log('PASS X8 '+summary);return summary;
  } finally {
    peer.before=null;peer.after=null;
    for(const server of live)await server.close();for(const store of stores)await store.close();await peer.close();await rm(folder,{recursive:true,force:true});
    for(const [key,value] of Object.entries(before))if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
}
