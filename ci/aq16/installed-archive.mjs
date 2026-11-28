// SPDX-License-Identifier: AGPL-3.0-only
// Observes the installed converter's real WebView2. No native answers, encoder outputs, or file operations are substituted.
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';

const [portText, root, out, removeText] = process.argv.slice(2);
if (!/^\d{4,5}$/.test(portText || '') || !root || !out || !['keep', 'remove'].includes(removeText)) throw Error('usage: PORT ROOT OUT keep/remove');
const port = Number(portText), remove = removeText === 'remove';
mkdirSync(out, {recursive:true});
const receipt = {schema:1, scope:'installed MSIX, actual Archive, controlled prior-purchase cache', root, remove, status:'NOT PROVEN', observations:[], exceptions:[], responses:[], files:[]};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket, serial = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial, timer = setTimeout(() => {pending.delete(id); reject(Error('CDP timeout: ' + method));}, 30000);
    pending.set(id, {resolve, reject, timer}); socket.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression) {
  const answer = await send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
  if (answer.exceptionDetails) throw Error(JSON.stringify(answer.exceptionDetails));
  return answer.result?.value;
}
async function until(get, accept, label, ms = 120000) {
  const deadline = Date.now() + ms;
  do { const value = await get(); if (accept(value)) return value; await delay(200); } while (Date.now() < deadline);
  throw Error('Timed out: ' + label);
}
async function screenshot(name) {
  const image = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false});
  const path = join(out, name + '.png'); writeFileSync(path, Buffer.from(image.data, 'base64'));
}
try {
  const target = await until(async () => {
    try { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page' && t.url.startsWith('https://rapier.local/rapier.html')); } catch { return null; }
  }, Boolean, 'installed WebView2 target');
  receipt.target = {id:target.id, url:target.url, title:target.title};
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { const call=pending.get(message.id);pending.delete(message.id);clearTimeout(call.timer);message.error?call.reject(Error(JSON.stringify(message.error))):call.resolve(message.result); }
    else if (message.method === 'Runtime.exceptionThrown') receipt.exceptions.push(message.params.exceptionDetails);
    else if (message.method === 'Network.responseReceived' && message.params.response.url.includes('/archive/')) receipt.responses.push({url:message.params.response.url,status:message.params.response.status});
  });
  await new Promise((resolve,reject) => {socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await evaluate(`(() => {window.__aq16ArchiveObserved=[];chrome.webview.addEventListener('message',e=>{if(e.data?.op==='archive')window.__aq16ArchiveObserved.push(e.data)});chrome.webview.postMessage({op:'ready'});return true})()`);
  const state = () => evaluate('window.__aq16ArchiveObserved.at(-1)');
  const initial = await until(state, s => s?.licence === 'owned' || s?.licence === 'locked', 'actual Store/cache answer');
  receipt.initial = initial;
  if (initial.licence !== 'owned') throw Error('Controlled cached ownership was not retained. No entitlement bypass is allowed.');
  if (initial.root !== root || initial.remove || initial.watch) throw Error('Initial folder, consent, or watch differs from isolated fixture');
  await until(() => evaluate(`!!document.querySelector('#rapier-jxl-tab-archive')`), Boolean, 'Archive tab');
  await evaluate(`document.querySelector('#rapier-jxl-tab-archive').click()`);
  if (remove) {
    await evaluate(`(() => {const b=document.querySelector('#rapier-jxl-panel-archive [aria-label="Remove originals"] [role="switch"]');if(!b || b.getAttribute('aria-checked')!=='false')throw Error('fresh removal consent missing');b.click()})()`);
    await until(state, s=>s?.remove===true && s.root===root, 'fresh native removal grant');
  }
  await screenshot('installed-before');
  await evaluate(`(() => {const b=[...document.querySelectorAll('#rapier-jxl-panel-archive button')].find(b=>b.textContent==='Start'&&!b.hidden&&!b.disabled);if(!b)throw Error('Start unavailable');b.click()})()`);
  const ended = await until(state, s=>s?.state==='done' && s.run?.processed>0, 'real Archive completion', 240000);
  receipt.ended = ended;
  receipt.observations = await evaluate('window.__aq16ArchiveObserved');
  await screenshot('installed-after');
  if (ended.run.failed || ended.run.saved < 1 || ended.run.processed !== ended.run.total) throw Error('Archive did not save every prepared JPEG');
  if (receipt.exceptions.length) throw Error('WebView reported an uncaught exception');
  if (remove && !ended.recent.some(r=>r.recycled && !r.originalKept)) throw Error('No affirmative native recycled outcome');
  if (!remove && ended.recent.some(r=>r.recycled)) throw Error('Archive recycled without consent');
  receipt.csv = readFileSync(ended.receipt, 'utf8'); writeFileSync(join(out,'archive-receipt.csv'),receipt.csv);
  // Read the actual saved JPEG XL outside the app, then restore it with a fresh client of the exact installed codec.
  // Filesystem custody and real Bin Restore are checked separately by the native helper.
  const rows = ended.recent.filter(r=>r.result==='saved');
  const originals=JSON.parse(readFileSync(join(out,'originals.json'),'utf8'));
  for(const row of rows){
    const path=join(root,row.name.replace(/\.[^.]+$/,'.jxl')),bytes=readFileSync(path);
    const original=originals.find(o=>o.name===row.name);
    if(!original)throw Error('Unexpected saved file: '+row.name);
    const restored=await evaluate(`(async()=>{
      await _rapierWhenRuntime('rapier-jxl-worker');
      const files=await _rapierInflateVendor('rapier-jxl-worker');
      const source=name=>files.find(row=>row.name===name)?.source;
      if(!source('jpeg.mjs')||!source('jpeg.browser.mjs'))throw Error('Installed JPEG codec missing');
      const workerUrl=URL.createObjectURL(new Blob([source('jpeg.mjs')],{type:'text/javascript'}));
      const clientUrl=URL.createObjectURL(new Blob([source('jpeg.browser.mjs')],{type:'text/javascript'}));
      let client;
      try{client=await import(clientUrl);client.configure({workerFactory:()=>new Worker(workerUrl,{type:'module',name:'rapier-jxl/jpeg worker'})});
        const input=Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0));
        const result=await client.restore(input);
        const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',result.bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
        return {sha256,bytes:result.bytes.length};
      }finally{await client?.close?.();URL.revokeObjectURL(workerUrl);URL.revokeObjectURL(clientUrl)}
    })()`);
    if(restored.sha256!==original.sha256||restored.bytes!==original.bytes)throw Error('Saved JPEG XL does not restore exact original: '+row.name);
    receipt.files.push({name:row.name,jxl:path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),restored,recycled:row.recycled,originalKept:row.originalKept});
  }
  if (!receipt.files.length) throw Error('No actual JPEG XL bytes on disk');
  receipt.status='PASS';
} catch (error) {
  receipt.status='FAIL';receipt.error=String(error.stack || error);process.exitCode=1;
  if(socket?.readyState===WebSocket.OPEN){try{receipt.observations=await evaluate('window.__aq16ArchiveObserved || []');await screenshot('failure');}catch{}}
} finally {
  writeFileSync(join(out,'installed-archive.json'),JSON.stringify(receipt,null,2)+'\n');
  for(const call of pending.values()){clearTimeout(call.timer);call.reject(Error('closed'));} pending.clear();
  socket?.close();
}
