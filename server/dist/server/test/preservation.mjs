// SPDX-License-Identifier: AGPL-3.0-only
// Existing mcp-create-isolation cells: actual filesystem publication boundaries and killed writers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,open,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {FileStore,sha256,stateText} from '../store.mjs';
import {Renderer} from '../chromium.mjs';
const first='\ufeff# Original\r\nKeep λ.\r\n',mine='# Proposed\r\nMy exact revision.\r\n',external='# External\r\nTheir exact revision.\r\n';
const metadata={filename:'Note.md',docKind:'markdown'};
const record=(text=mine,before=sha256(first))=>({version:1,kind:'document',document:'Note.md',fileHash:before,alarm:null,values:[
 ['head',{parts:1,stateFormat:'rapier-workspace/2'}],['state:0',JSON.stringify({format:'rapier-workspace/2',metadata:{start:metadata,head:metadata},
  state:{text,...metadata,revision:0,journal:[]}})]]});
const key='a'.repeat(64),self=fileURLToPath(import.meta.url);
async function allBytes(root) {
 let found=[];for(const row of await readdir(root,{withFileTypes:true})){const path=join(root,row.name);if(row.isDirectory())found.push(...await allBytes(path));else if(row.isFile()){const text=await readFile(path,'utf8');found.push(text);try{const value=JSON.parse(text);if(typeof value.text==='string')found.push(value.text);}catch{}}}return found;
}
async function keepCase(name,run) {const root=await mkdtemp(join(tmpdir(),'rapier-preserve-'));try{await writeFile(join(root,'Note.md'),first);await run(root);console.log('PASS store: '+name);}finally{await rm(root,{recursive:true,force:true});}}
export async function rendererFailureCell() {
 // Node rejects Chromium's arguments and exits with unread DevTools pipes. This uses a real
 // child failure, without a browser; failed exports must reject rather than kill the server.
 const renderer=new Renderer({chromium:process.execPath,chromiumVersion:'0.0.0.0'});
 try {await assert.rejects(renderer.render(first,'Note.md'),error=>['BROWSER_EXITED','ECONNRESET','EPIPE'].includes(error.code));}
 finally {await renderer.close();}
}
export async function preservationCells() {
 const failures=[];const cell=async(name,fn)=>{try{await keepCase(name,fn);}catch(e){failures.push(name+': '+e.stack);console.log('FAIL store: '+name);}};
 await cell('failed export rejects without terminating the server',rendererFailureCell);
 await cell('unsupported workspace keeps source and private recovery bytes',async root=>{
  const store=await new FileStore({root}).open();
  const old={...record(),values:[['head',{parts:1}],['state:0',JSON.stringify({text:mine,...metadata})]]};
  const raw=JSON.stringify(old);await store.writePrivate('workspaces/'+key+'.json',old);
  try {
   assert.throws(()=>stateText(old),error=>error.code==='UNSUPPORTED_WORKSPACE_FORMAT');
   await assert.rejects(store.commit(key,old),error=>error.code==='UNSUPPORTED_WORKSPACE_FORMAT');
   assert.equal(await readFile(join(root,'Note.md'),'utf8'),first);
   assert.equal(JSON.stringify(await store.readPrivate('workspaces/'+key+'.json')),raw);
  } finally {await store.close();}
 });
 for(const edit of ['before-final','late-in-place','late-rename','recreated','held-descriptor']) await cell(edit,async root=>{
  const path=join(root,'Note.md'),originalRename=fs.promises.rename,originalLink=fs.promises.link;let injected=false,handle=null;
  const store=await new FileStore({root,onCommitStep:async step=>{
   if(edit==='before-final'&&step==='prepared'){injected=true;await writeFile(path,external);}
   if(edit==='recreated'&&step==='displaced'){injected=true;await writeFile(path,external);}
   if(edit==='held-descriptor'&&step==='linked'){injected=true;await handle.truncate(0);await handle.writeFile(external);await handle.sync();}
  }}).open();
  if(edit==='held-descriptor')handle=await open(path,'r+');
  fs.promises.rename=async(from,to)=>{
   const boundary=(to===path && from!==path)||(from===path && to!==path);
   if(boundary&&!injected&&['late-in-place','late-rename'].includes(edit)) {
    injected=true;if(edit==='late-in-place')await writeFile(path,external);else{await writeFile(join(root,'editor.tmp'),external);await originalRename(join(root,'editor.tmp'),path);}
   }
   return originalRename(from,to);
  };syncBuiltinESMExports();
  let error;try{await store.commit(key,record());}catch(e){error=e;}finally{fs.promises.rename=originalRename;fs.promises.link=originalLink;syncBuiltinESMExports();await handle?.close();await store.close();}
  assert.equal(injected,true,'the boundary was exercised');
  const bytes=await allBytes(root);
  assert.ok(bytes.includes(external),'external authored version disappeared');
  if(edit==='before-final'){assert.equal(error?.code,'FILE_CONFLICT');assert.equal(await readFile(path,'utf8'),external);}
  else {assert.ok(bytes.includes(mine),'proposed version must remain recoverable even when publication is refused');if(!error)assert.equal(await readFile(path,'utf8'),mine);}
 });
 for(const create of [false,true])for(const step of ['prepared','candidate','rename-return','displaced','link-return','linked','unlink-return','document','state']) {
  if(create&&['rename-return','displaced'].includes(step))continue;
  await cell((create?'create':'replace')+'/SIGKILL/'+step,async root=>{
   if(create)await rm(join(root,'Note.md'));
   const child=spawnSync(process.execPath,[self,'--cut',root,step,create?'create':'replace'],{encoding:'utf8'});
   assert.equal(child.signal,'SIGKILL','the process reached the requested cut: '+child.stderr);
   for(let n=0;n<2;n++){const store=await new FileStore({root}).open();try{assert.equal((await store.read('Note.md')).text,mine);const restored=await store.readPrivate('workspaces/'+key+'.json');assert.equal(stateText(restored),mine);assert.equal(await store.readPrivate('pending.json',true),null);}finally{await store.close();}}
   assert.deepEqual(await readdir(join(root,'.rapier-server','preserved')),[],'a publication no external edit touched retains nothing');
  });
 }
 await cell('external replacement after crash is not overwritten by recovery',async root=>{
  const child=spawnSync(process.execPath,[self,'--cut',root,'linked','replace'],{encoding:'utf8'});assert.equal(child.signal,'SIGKILL');
  await writeFile(join(root,'foreign.tmp'),external);await rename(join(root,'foreign.tmp'),join(root,'Note.md'));
  await assert.rejects(new FileStore({root}).open(),e=>e.code==='RECOVERY_CONFLICT');
  const bytes=await allBytes(root);for(const text of [first,mine,external])assert.ok(bytes.includes(text));assert.equal(await readFile(join(root,'Note.md'),'utf8'),external);
 });
 assert.deepEqual(failures,[],failures.join('\n'));return 'external races and real killed-process publication cuts';
}
if(process.argv[2]==='--cut') {
 const [root,step,kind]=process.argv.slice(3),path=join(root,'Note.md');
 // Kill after the kernel changed a name but before the caller can synchronize the directory.
 for(const [method,cut,match] of [['rename','rename-return',(from,to)=>from===path&&to.endsWith('.before')],['link','link-return',(_from,to)=>to===path],['unlink','unlink-return',from=>from.endsWith('.next')]]) {
  const original=fs.promises[method];fs.promises[method]=async(...args)=>{const value=await original(...args);if(step===cut&&match(...args))process.kill(process.pid,'SIGKILL');return value;};
 }syncBuiltinESMExports();
 const store=await new FileStore({root,onCommitStep:at=>{if(at===step)process.kill(process.pid,'SIGKILL');}}).open();
 await store.commit(key,record(mine,kind==='create'?null:sha256(first)));await store.close();
} else if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await preservationCells();
