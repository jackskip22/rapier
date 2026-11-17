// SPDX-License-Identifier: AGPL-3.0-only
// Packaged proof only. CDP reads the user's view and sends trusted keyboard/pointer input.
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
export const original = '# Installed Markdown\n\nThe file is a native test fixture.\n';
export const addition = 'RAPIER-INSTALLED-NATIVE-SAVE-WITNESS';
export const expected = original + '\n' + addition + '\n';
export function checkDisk(input, output) {
  if (!Buffer.from(input).equals(Buffer.from(original))) throw Error('ORIGINAL_CHANGED');
  if (!Buffer.from(output).equals(Buffer.from(expected))) throw Error('SAVED_BYTES_DIFFER');
  return true;
}
const norm = s => typeof s === 'string' ? s.replace(/\r\n/g, '\n') : null;
function fail(code) { throw Error(code); }
async function poll(job, code, ms = 30000) {
  const until = Date.now()+ms;
  do { const found = await job(); if (found) return found; await delay(240); } while(Date.now()<until);
  fail(code);
}
async function pages(port) {
  const res = await fetch('http://127.0.0.1:'+port+'/json/list', {signal:AbortSignal.timeout(2000)});
  if (!res.ok) return [];
  return (await res.json()).filter(x => {
    if (x.type !== 'page' || !x.id) return false;
    try {
      const u = new URL(x.url), ws = new URL(x.webSocketDebuggerUrl);
      return u.origin==='https://rapier.local' && u.pathname==='/rapier.html' &&
        ws.protocol==='ws:' && ws.hostname==='127.0.0.1' && ws.port===String(port);
    } catch { return false; }
  });
}
async function connect(url) {
  const ws = new WebSocket(url), calls=new Map();
  let sequence=0;
  ws.addEventListener('message', e=>{
    const m=JSON.parse(e.data), call=calls.get(m.id);
    if (!call) return;
    calls.delete(m.id); clearTimeout(call.timeout);
    if(m.error) call.reject(Error('CDP_COMMAND_REFUSED')); else call.resolve(m.result);
  });
  await new Promise((resolve,reject)=>{
    const t=setTimeout(()=>{ws.close();reject(Error('CDP_CONNECT_TIMEOUT'));},3000);
    ws.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});
    ws.addEventListener('error',()=>{clearTimeout(t);reject(Error('CDP_CONNECT_FAILED'));},{once:true});
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence;
    const timeout=setTimeout(()=>{calls.delete(id);reject(Error('CDP_COMMAND_TIMEOUT'));},4000);
    calls.set(id,{resolve,reject,timeout});
    try {ws.send(JSON.stringify({id,method,params}));}
    catch {clearTimeout(timeout);calls.delete(id);reject(Error('CDP_SEND_FAILED'));}
  });
  return {send,close:()=>ws.close()};
}
async function evalPage(cdp,expression) {
  const value=await cdp.send('Runtime.evaluate',{expression,returnByValue:true});
  if (value.exceptionDetails) fail('CDP_EVAL_FAILED');
  return value.result?.value;
}
const ready="window.RapierAgentBrowser?.status().ready === true && !!document.querySelector('#editor-blocks')";
const current="document.querySelector('#source-textarea')?.value";
async function click(cdp,selector,code='EDITOR_CONTROL_NOT_VISIBLE') {
  const p=await poll(()=>evalPage(cdp,`(() => {
    const el=document.querySelector(${JSON.stringify(selector)}),r=el?.getBoundingClientRect();
    if(!r?.width||!r.height||el.disabled) return null;
    const x=r.x+r.width/2,y=r.y+r.height/2,top=document.elementFromPoint(x,y);
    return top&&(el===top||el.contains(top))?{x,y}:null;
  })()`),code,6500);
  for(const type of ['mousePressed','mouseReleased'])
    await cdp.send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1,buttons:type==='mousePressed'?1:0});
}
async function chord(cdp,key,code,windowsVirtualKeyCode,modifiers=0) {
  await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code,windowsVirtualKeyCode,modifiers});
  await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode,modifiers});
}
async function settingsButton(cdp,selector,code) {
  const menuOpen="document.querySelector('#settings-overlay')?.getAttribute('aria-hidden')==='false'";
  if (!await evalPage(cdp,menuOpen)) await click(cdp,'#btn-overflow','SETTINGS_CONTROL_NOT_VISIBLE');
  await poll(()=>evalPage(cdp,menuOpen),'SETTINGS_DID_NOT_OPEN',6000);
  await click(cdp,selector,code);
}
async function sourceMode(cdp) {
  const visible="!!document.querySelector('#source-textarea')?.getClientRects().length";
  if (!await evalPage(cdp,visible)) await chord(cdp,'/','Slash',191,2);
  await poll(()=>evalPage(cdp,visible),'SOURCE_MODE_NOT_VISIBLE',8000);
}
async function select(port,{want,exclude='',single=false,mustBeNew=''}={}) {
  return poll(async()=>{
    let list;
    try{list=await pages(port);}catch{return null;}
    const hits=[];
    for(const page of list) {
      if(page.id===exclude) continue;
      let cdp;
      try {
        cdp=await connect(page.webSocketDebuggerUrl);
        if(!await evalPage(cdp,ready))continue;
        if(mustBeNew&&(norm(await evalPage(cdp,current))===mustBeNew || await evalPage(cdp, 'String(document.querySelector("#editor-blocks")?.textContent||"").includes('+JSON.stringify(addition)+')'))) fail('COLD_START_ALREADY_HAS_SAVED_TEXT');
        if(want!==undefined){
          // Page DOM source carries exact authoritative text when Source view is active.
          // Passively screen visible text before changing view to avoid touching unrelated targets.
          const needle=want.includes(addition)?addition:'The file is a native test fixture.';
          const content=await evalPage(cdp,`String(document.getElementById('editor-blocks')?.textContent||'').includes(${JSON.stringify(needle)})||String(document.getElementById('source-textarea')?.value||'').includes(${JSON.stringify(needle)})`);
          if(!content)continue;
          await sourceMode(cdp);
          if(norm(await evalPage(cdp,current))!==want)continue;
        }
        hits.push(page); if(hits.length>1)fail('MULTIPLE_MATCHING_PAGES');
      } catch(e){if(['MULTIPLE_MATCHING_PAGES','COLD_START_ALREADY_HAS_SAVED_TEXT'].includes(e.message))throw e;}
      finally{cdp?.close();}
    }
    return hits.length===1&&(!single||list.length===1)?hits[0]:null;
  },'EDITOR_TARGET_NOT_UNIQUE_OR_TEXT_DIFFERS');
}
async function main(args) {
  const [portText, op, previous='']=args,port=Number(portText);
  if (!Number.isInteger(port)||port<1024||port>65535) fail('INVALID_PORT');
  const row={};
  let page;
  if (op==='count') {
    try {row.pages=(await pages(port)).length;}
    catch {row.pages=0; row.endpointMissing=true;}
    return row;
  }
  if (op==='open') page=await select(port,{single:true});
  else if(op==='reopen') page=await select(port,{single:true,exclude:previous,mustBeNew:expected});
  else if(op==='edit') page=await select(port,{want:original});
  else if(op==='save') page=await select(port,{want:expected});
  else if(op==='verify') page=await select(port,{want:expected,exclude:previous});
  else fail('INVALID_STEP');
  const cdp=await connect(page.webSocketDebuggerUrl);
  try {
    if(op==='open'||op==='reopen') await settingsButton(cdp,'#settings-open-pair [data-action="open-document"]','OPEN_CONTROL_NOT_VISIBLE');
    if(op==='save') await settingsButton(cdp,'#settings-save-as-btn','SAVE_AS_CONTROL_NOT_VISIBLE');
    if(op==='edit'){
      await click(cdp,'#source-textarea');
      await chord(cdp,'End','End',35,2);
      await cdp.send('Input.insertText',{text:'\n'+addition+'\n'});
      await poll(async()=>norm(await evalPage(cdp,current))===expected,'EDIT_TEXT_DIFFERS',8000);
    }
    return {target:page.id};
  } finally {cdp.close();}
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  try {
    const args=process.argv.slice(2);
    if(args[0]==='verify-bytes'){
      const {readFile}=await import('node:fs/promises');
      checkDisk(await readFile(args[1]),await readFile(args[2]));console.log('{"disk":true}');
    } else console.log(JSON.stringify(await main(args)));
  } catch(e){
    console.log(JSON.stringify({error:/^[A-Z_]+$/.test(e.message)?e.message:'EDITOR_PROBE_FAILED'}));
    process.exitCode=1;
  }
}
