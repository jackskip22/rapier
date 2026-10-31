// SPDX-License-Identifier: AGPL-3.0-only
// RAPIER_PLAYWRIGHT=/absolute/path/to/playwright-core/index.mjs
// RAPIER_RUNTIME=<fresh runner directory> node linux/app/tests/runtime.mjs
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const {chromium} = await import(process.env.RAPIER_PLAYWRIGHT || 'playwright-core');
const root = process.env.RAPIER_RUNTIME;
assert(root, 'RAPIER_RUNTIME is required');
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const built = JSON.parse(await readFile(repo+'dist/linux/BUILT.json'));
const browser = await chromium.connectOverCDP(process.env.RAPIER_CDP || 'http://127.0.0.1:9334');
const context = browser.contexts()[0], page = context.pages().find(p=>p.url().startsWith('https://rapier.local/'));
assert(page);
const report = {elf:built.sha256, browser:browser.version(), portal:'isolated fixture FileChooser over real session D-Bus; no desktop UI', checks:[], externalRequests:[], pageErrors:[]};
context.on('request', r=>{if(!/^(https:\/\/rapier\.local\/|data:|blob:)/.test(r.url()))report.externalRequests.push(r.url());});
page.on('pageerror', e=>report.pageErrors.push(e.message));
const hash = b=>createHash('sha256').update(b).digest('hex');
async function record(name, detail) {
  report.checks.push({name, detail});
  await writeFile(root+'/runtime.json',JSON.stringify(report,null,2)+'\n');
  console.log('PASS',name,JSON.stringify(detail).slice(0,350));
}
async function pick(path){await writeFile(root+'/portal/next',path+'\n');}
async function settings(){if(await page.locator('#settings-overlay').getAttribute('aria-hidden')!=='false')await page.locator('#btn-overflow').click();}
async function source(){if(!await page.locator('#source-textarea').isVisible())await page.keyboard.press('Control+/');await page.locator('#source-textarea').waitFor({state:'visible'});}
try {
  await page.waitForFunction(()=>globalThis.RapierPlatform?.environment?.id==='linux'&&globalThis.Rapier);
  assert.equal(await page.evaluate(()=>RapierPlatform.environment.native),true);
  await record('actual native host startup',{platform:'linux',native:true});
  const parts=await page.evaluate(async()=>{const out={};for(const id of ['document','presets','drawing','notes']){await RapierParts.need(id);out[id]=RapierParts.status(id);}return out;});
  await record('all bundled editor parts load offline',parts);
  const resourceResult=await page.evaluate(async rows=>{
    let total=0;const failures=[];
    for(const [name,size,expected] of rows){
      const response=await fetch('/'+name);const bytes=await response.arrayBuffer();
      const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
      if(!response.ok||bytes.byteLength!==size||actual!==expected)failures.push({name,status:response.status,bytes:bytes.byteLength,actual});
      total+=bytes.byteLength;
    }
    return {count:rows.length,bytes:total,failures};
  },built.resources);
  assert.deepEqual(resourceResult.failures,[]);
  await record('every pinned resource served by actual ELF',resourceResult);
  const plugins=await page.evaluate(async()=>{
    const out={};
    for(const [key,plugin] of Object.entries(_rapierProviders)){
      if(!plugin)continue;
      try {await Promise.race([plugin.install(),new Promise((_,reject)=>setTimeout(()=>reject(Error('plugin timed out')),120000))]);}
      catch(error){out[key]={status:plugin.status,error:String(error.message||error)};continue;}
      out[key]={status:plugin.status,error:plugin.error||null};
    }
    return out;
  });
  await record('offline provider installation outcomes',plugins);
  assert(Object.values(plugins).every(p=>!p.error),JSON.stringify(plugins));
  const pdf=await page.evaluate(async()=>{await RapierPdfPlugin.ensureLoaded();return RapierPdfPlugin.state();});
  assert.equal(pdf.loaded,true);
  await record('bundled PDF reader initializes offline',pdf);
  const original='# Linux runtime\n\nOriginal UTF-8: café 🌿.\n';
  const edited='# Linux runtime\n\nSaved through the Rust host: café 🌿.\n';
  const path=root+'/document.md';await writeFile(path,original);
  await pick(path);await settings();await page.locator('[data-action="open-document"]').click();
  await page.waitForFunction(()=>document.querySelector('#filename-btn').textContent==='document');
  await page.waitForFunction(()=>!document.querySelector('#view-btn-source').disabled);
  await page.waitForFunction(()=>document.querySelector('#settings-overlay').getAttribute('aria-hidden')==='true');
  await source();assert.equal(await page.locator('#source-textarea').inputValue(),original);
  await page.locator('#source-textarea').fill(edited);
  await page.waitForFunction(()=>!document.querySelector('#filename-dirty').hidden);
  await page.keyboard.press('Control+s');
  await page.waitForFunction(()=>document.querySelector('#filename-dirty').hidden);
  assert.equal(await readFile(path,'utf8'),edited);
  await record('edit and Save through normal page UI',{bytes:Buffer.byteLength(edited),sha256:hash(edited)});
  const result=spawnSync(repo+'dist/linux/rapier-linux',[path],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  await page.waitForFunction(()=>RapierPlatform.files.hasWritable(Rapier.document.authority()));
  assert.equal(await page.locator('#source-textarea').inputValue(),edited);
  await record('second executable launch reopens the saved file',{status:result.status});
  const exported=root+'/export.md';await pick(exported);
  const exportResult=await page.evaluate(async text=>{
    const result=await RapierPlatform.files.exportArtifact(new Blob([text],{type:'text/markdown'}),'export.md');
    return {confirmed:result.confirmed,verified:result.verified,status:result.status};
  },edited);
  assert.equal(exportResult.confirmed,true);assert.equal(exportResult.verified,true);
  assert.equal(await readFile(exported,'utf8'),edited);
  await record('native artifact export over real portal protocol',exportResult);
  await pick('CANCEL');
  const canceled=await page.evaluate(async()=>{const r=await RapierPlatform.files.exportArtifact(new Blob(['never written']),'cancel.md');return{status:r.status,confirmed:r.confirmed};});
  assert.equal(canceled.status,'cancelled');assert.equal(canceled.confirmed,false);
  await record('portal cancellation is not save success',canceled);
  const folder=root+'/selected-'+Date.now();await mkdir(folder,{recursive:true});
  await writeFile(folder+'/note.md','original\n');await writeFile(root+'/outside.md','outside\n');
  await symlink('../outside.md',folder+'/link.md');
  await pick(folder);
  const hello=await page.evaluate(async()=>{globalThis.linuxTestFolder=await RapierPlatform.host.originalFolder.choose();return linuxTestFolder;});
  assert.equal(hello.capabilities.provider,'linux');
  const call=(method,args={})=>page.evaluate(async({method,args})=>{
    const r=await RapierPlatform.host.originalFolder.call(linuxTestFolder.token,method,args);
    if(r.error)throw Error(r.error);return r.value;
  },{method,args});
  const row=await call('lookup',{path:'note.md'});
  const save=async(row,before,after,interference)=>{
    const write=await call('writeStart',{id:row.id,size:Buffer.byteLength(after),digest:hash(after),expected:{size:Buffer.byteLength(before),version:row.version,digest:hash(before)}});
    await call('writeChunk',{write,offset:0,data:Buffer.from(after).toString('base64')});
    if(interference)await interference();
    const result=await call('writeFinish',{write});await call('writeClose',{write});return result;
  };
  const saved=await save(row,'original\n','folder saved\n');
  assert.equal(await readFile(folder+'/note.md','utf8'),'folder saved\n');
  await record('in-process original-folder checked save',{hello,result:saved});
  const again=await call('lookup',{path:'note.md'});
  const conflict=await save(again,'folder saved\n','draft copy\n',()=>writeFile(folder+'/note.md','other editor\n'));
  assert.equal(conflict.status,'kept-both');
  assert.equal(await readFile(folder+'/note.md','utf8'),'other editor\n');
  assert.equal(await readFile(folder+'/'+conflict.destinationName,'utf8'),'draft copy\n');
  await record('outside edit preserved with exclusive draft copy',conflict);
  for(const bad of ['../outside.md','/etc/passwd','link.md']){
    await assert.rejects(call('lookup',{path:bad}),/invalid_path|symlink_refused/);
  }
  assert.equal(await readFile(root+'/outside.md','utf8'),'outside\n');
  await record('native host path and symlink refusal',{outsidePreserved:true});
  await page.evaluate(()=>RapierPlatform.host.originalFolder.close(linuxTestFolder.token));
  await assert.rejects(call('lookup',{path:'note.md'}),/revoked/);
  await record('closed folder authority revoked',true);
  await writeFile(root+'/runtime.json',JSON.stringify(report,null,2)+'\n');
} catch(error) {
  report.failure=String(error.stack||error);
  await writeFile(root+'/runtime.json',JSON.stringify(report,null,2)+'\n');
  await page.screenshot({path:root+'/failure.png'}).catch(()=>{});
  throw error;
} finally {await browser.close();}
