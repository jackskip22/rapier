// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {mkdir, readFile, writeFile, chmod, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.RAPIER_PLAYWRIGHT||'playwright-core');
const repo=fileURLToPath(new URL('../../../',import.meta.url));
const root=resolve(process.argv[2]);
assert(process.env.DBUS_SESSION_BUS_ADDRESS,'Run in an isolated dbus-run-session');
await mkdir(root);await mkdir(join(root,'portal'));
const browserBin=process.env.RAPIER_CHROMIUM||'/usr/bin/chromium';
const port=process.env.RAPIER_CDP_PORT||'9335';assert(/^\d+$/.test(port));
const endpoint='http://127.0.0.1:'+port;
const shellQuote=s=>"'"+s.replaceAll("'","'\\''")+"'";
await writeFile(join(root,'browser'),'#!/bin/sh\nexec '+shellQuote(browserBin)+' --headless --no-sandbox --disable-dev-shm-usage --remote-debugging-port='+port+' "$@"\n');
await chmod(join(root,'browser'),0o755);
const env={...process.env,PORTAL_FIXTURE:join(root,'portal'),RAPIER_BROWSER:join(root,'browser'),
  XDG_DATA_HOME:join(root,'data'),XDG_CACHE_HOME:join(root,'cache'),RAPIER_RUNTIME:root,RAPIER_CDP:endpoint};
const elf=join(repo,'dist/linux/rapier-linux'),built=JSON.parse(await readFile(join(repo,'dist/linux/BUILT.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
const portal=spawn(join(repo,'dist/linux/cargo-target/debug/examples/fixture-portal'),[],{env,stdio:['ignore','inherit','inherit']});
let app,browser;
async function start(paths=[]){
  app=spawn('strace',['-f','-e','trace=execve','-o',join(root,paths.length?'reopen-execve.txt':'execve.txt'),elf,...paths],{env,stdio:['ignore','inherit','inherit']});
  for(let i=0;i<150;i++){
    try{browser=await chromium.connectOverCDP(endpoint);break;}catch{}
    assert(app.exitCode===null,'ELF exited before browser connection');
    await new Promise(r=>setTimeout(r,100));
  }
  assert(browser,'No Chromium endpoint');
  const page=browser.contexts()[0].pages()[0];
  await page.waitForFunction(()=>globalThis.RapierPlatform?.environment?.id==='linux'&&globalThis.Rapier,null,{timeout:60000});
  return page;
}
async function stop(){
  if(browser){const session=await browser.newBrowserCDPSession();await session.send('Browser.close').catch(()=>{});await browser.close().catch(()=>{});browser=null;}
  if(app&&app.exitCode===null&&app.signalCode===null)await once(app,'exit');
}
try {
  for(let i=0;i<100;i++){try{await stat(join(root,'portal/ready'));break;}catch{}await new Promise(r=>setTimeout(r,50));}
  const page=await start();
  await page.waitForFunction(()=>document.querySelector('#filename-btn')?.textContent==='welcome');
  await page.setViewportSize({width:1280,height:900});
  await page.screenshot({path:join(root,'welcome.png')});
  const journey=spawn(process.execPath,[fileURLToPath(new URL('./runtime.mjs',import.meta.url))],{env,stdio:'inherit'});
  const [code]=await once(journey,'exit');assert.equal(code,0,'runtime journey failed');
  await stop();
  const cache=join(root,'cache/rapier',built.payload);
  await writeFile(join(cache,'rapier.html'),'deliberately corrupted fixture cache\n');
  await writeFile(join(cache,built.resources[0][0]),'deliberately corrupted resource\n');
  const reopened=await start([join(root,'document.md')]);
  await reopened.waitForFunction(()=>document.querySelector('#filename-btn')?.textContent==='document');
  await reopened.waitForFunction(()=>!document.querySelector('#view-btn-source').disabled);
  if(!await reopened.locator('#source-textarea').isVisible())await reopened.keyboard.press('Control+/');
  const expected=await readFile(join(root,'document.md'),'utf8');
  await reopened.waitForFunction(text=>document.querySelector('#source-textarea')?.value===text,expected);
  for(const [name,,digest] of [built.page[0],built.resources[0]])assert.equal(hash(await readFile(join(cache,name))),digest);
  await reopened.screenshot({path:join(root,'reopened.png')});
  {const done=once(portal,'exit');portal.kill();await done;}
  const refused=await reopened.evaluate(async()=>{try{return {result:await RapierPlatform.files.exportArtifact(new Blob(['never written']),'nowhere.md')};}catch(error){return {error:String(error.message||error)};}});
  assert.match(refused.error||'',/No file chooser is available/,JSON.stringify(refused));
  await reopened.keyboard.press('Control+Shift+S');
  await reopened.waitForFunction(()=>/no file chooser/.test(document.querySelector('#toast-root')?.textContent||''),null,{timeout:15000});
  await reopened.screenshot({path:join(root,'no-chooser.png')});
  const unchosen={export:refused.error,saveAs:'the page shows the sentence'};
  await stop();
  const report=JSON.parse(await readFile(join(root,'runtime.json')));
  report.checks.push({name:'new process reopens exact saved bytes and repairs tampered page/resource cache',detail:{sha256:hash(expected),repaired:[built.page[0][0],built.resources[0][0]]}});
  report.checks.push({name:'without a file chooser a save fails in words, never as a cancel',detail:unchosen});
  for(const flag of ['--version','--install','--licenses','--uninstall']){
    const run=spawnSync(elf,[flag],{env,encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(run.status,0,run.stderr);
    if(flag==='--install'){const desktop=await readFile(join(root,'data/applications/rapier.desktop'),'utf8');assert(desktop.includes(elf));}
    if(flag==='--licenses')assert.equal(run.stdout,await readFile(join(repo,'dist/linux/LICENSES.txt'),'utf8'));
    if(flag==='--uninstall')await assert.rejects(stat(join(root,'data/applications/rapier.desktop')),/ENOENT/);
    report.checks.push({name:flag+' in isolated XDG directories',detail:{status:run.status,outputSha256:hash(run.stdout)}});
  }
  const trace=await readFile(join(root,'execve.txt'),'utf8')+await readFile(join(root,'reopen-execve.txt'),'utf8');
  const executables=[...new Set([...trace.matchAll(/execve\("([^"]+)"/g)].map(m=>m[1]))].sort();
  assert(!executables.some(p=>/\/python(?:[\d.]*)?$/.test(p)));
  report.checks.push({name:'actual process execution contains no Python',detail:{executables}});
  await writeFile(join(root,'runtime.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PASS fresh restart, cache repair, installation commands and no Python execution');
} finally {
  await stop().catch(()=>{});
  if(portal.exitCode===null&&portal.signalCode===null){const done=once(portal,'exit');portal.kill();await done;}
}
