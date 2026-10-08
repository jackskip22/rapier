// SPDX-License-Identifier: AGPL-3.0-only
// One engine owner. Browser and worker_threads install this identical protocol. Commands are
// ordered; replies transfer only readout copies, never the authoritative material or rollback.
import {PaintSurface, PaintBrush, paintStroke} from './paint.mjs';
import {AgentPaintRun, admitAgentStrokes, prepareAgentPainting, prepareAgentLayerPainting, encodeAgentPainting, agentPaintReplayRun, replayAgentPainting} from './agent-paint.mjs';
import {sha256Yielding} from '../notes/integrity.mjs';
import {createPaintRowPool, PAINT_SPLIT_PIXELS} from './paint-parallel.mjs';
const hash = data => sha256Yielding(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
const surfaceMethods = new Set(['clear','fromRGBA8','grow','tilt','settleWet','_finishWetWork','stepWet','composeWet','advanceWet']);
const brushMethods = new Set(['seed','setColor','setBaseValue','reset','newStroke','rebase','setHead']);
const properties = new Set(['paper','scale','toothOX','toothOY','wetPending']);
const idOf = id => { if(!Number.isSafeInteger(id)||id<1) throw new Error('Paint identity must be a positive integer'); return id; };
const need = (map,id) => { const value=map.get(idOf(id)); if(!value) throw new Error('Paint identity is not live'); return value; };
const PAINT_SLICE_MS = 12, PAINT_PREVIEW_MS = 120;
const paintAbort = () => Object.assign(new Error('The agent painting was cancelled'), {name:'AbortError'});
// A message gives another task a turn without nesting timers. Close both ports after each yield
// so the in-process painter does not retain a live channel when its work is finished.
const yieldPaint = () => new Promise(resolve => {
 const channel=new MessageChannel();
 channel.port1.onmessage=()=> { channel.port1.close(); channel.port2.close(); resolve(); };
 channel.port2.postMessage(null);
});
export function createPaintWorker({postMessage, spawnRows, isolated = false} = {}) {
 const surfaces=new Map(), brushes=new Map(), runs=new Map(), checkpoints=new Map();
 const agentJobs=new Map();
 let lastId=0, failed=null, pool=null, chain=Promise.resolve();
 const transfer = value => {
  const buffers=new Set();
  const walk=v=> { if(!v || typeof v!=='object') return; if(ArrayBuffer.isView(v)) { if(v.buffer instanceof ArrayBuffer) buffers.add(v.buffer); return; } for(const x of Object.values(v)) walk(x); };
  walk(value); return [...buffers];
 };
 async function state(id, full=false, final=false) {
  const surface=need(surfaces,id), box=surface.takeDirty();
  const change = (full || final) ? {x0:0,y0:0,x1:surface.width-1,y1:surface.height-1} : box && {x0:Math.max(0,box.x0-1),y0:Math.max(0,box.y0-1),x1:Math.min(surface.width-1,box.x1+1),y1:Math.min(surface.height-1,box.y1+1)};
  const patch = change ? {...surface.toRGBA8(change,true,final ? 'final' : 'live'),box:change} : null;
  return {surfaceId:id,meta:metaOf(surface),patch,...(final ? {digest:await hash(patch.data)} : {})};
 }
 // What the page mirrors of a surface: its shape, its painted box and the state of its water.
 function metaOf(surface) {
  return {width:surface.width,height:surface.height,revision:surface.revision,bounds:surface.bounds(),growBox:surface.growBox,
   toothOX:surface.toothOX,toothOY:surface.toothOY,wetState:!!surface.wetState,wet:!!surface.wet,_wetWork:!!surface._wetWork,wetPending:surface.wetPending,opStats:surface.opStats || null};
 }
 async function execute(request) {
  const {operation}=request;
  if(operation==='configure') {
   if(pool || surfaces.size) throw new Error('Configure the painter before opening a surface');
   pool=await createPaintRowPool({count:request.helpers || 0,threshold:request.threshold ?? PAINT_SPLIT_PIXELS,isolated,spawn:init=>spawnRows(init,request.helperSource)});
   return {helpers:isolated ? request.helpers || 0 : 0};
  }
  if(operation==='create') {
   const id=idOf(request.surfaceId), {width,height}=request;
   if(surfaces.has(id)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>12000000) throw new Error('Invalid paint surface');
   const surface=new PaintSurface(width,height,request.options); surfaces.set(id,surface); pool?.attach(surface);
   return state(id);
  }
  if(operation==='brush') { const id=idOf(request.brushId); if(brushes.has(id)) throw new Error('Brush identity already live'); brushes.set(id,new PaintBrush(request.definition)); return {}; }
  if(operation==='batch') {
   if(!Array.isArray(request.commands)||request.commands.length>32768) throw new Error('Invalid paint batch');
   const changed=new Map(), used=new Set();
   let values=[], replayWork=[], completed=0, turn=performance.now(), shown=turn-PAINT_PREVIEW_MS;
   const reply = async final => ({completed,surfaces:await Promise.all([...changed].map(([id,full])=>state(id,full,final))),values,replayWork,
    brushes:Object.fromEntries([...used].map(id=>[id,{loadFuel:brushes.get(id)?.loadFuel ?? null}])),stats:pool?.stats || null});
   const apply = c => {
    const args=c.args || [];
    if(c.target==='brush') { if(!brushMethods.has(c.method)) throw new Error('Unknown brush command'); need(brushes,c.id)[c.method](...args); return; }
    if(c.target==='stroke') {
     if(args.length<3||args.length>11||args.some((v,i)=> i<10 ? !Number.isFinite(v) : typeof v!=='boolean')) throw new Error('Invalid input sample');
     const surface=need(surfaces,c.surfaceId); need(brushes,c.brushId).strokeTo(surface,...args); changed.set(c.surfaceId,changed.get(c.surfaceId)||false); used.add(c.brushId); return;
    }
    if(c.target!=='surface') throw new Error('Unknown paint command target');
    const surface=need(surfaces,c.id); let full=changed.get(c.id)||false, value, recorded=null;
    if(c.method==='set') { if(!properties.has(args[0])) throw new Error('Unknown paint property'); surface[args[0]]=args[1]; }
    else if(c.method==='beginStroke') { if(checkpoints.has(c.id)) throw new Error('Stroke already open'); checkpoints.set(c.id,{id:args[0],value:surface.beginStroke()}); }
    else if(c.method==='endStroke') { const cp=checkpoints.get(c.id); if(!cp||cp.id!==args[0]) throw new Error('Stroke checkpoint does not match'); value=surface.endStroke(cp.value,args[1]===true); checkpoints.delete(c.id); full=args[1]===true; }
    else if(c.method==='dryWet') {
     if(c.record===true){recorded=[];surface.recordWetWork=(method,args)=>recorded.push({target:'surface',id:c.id,method,args});}
     try {value=surface.dryWet(performance.now()+8,args[0]??8,args[1]??8);}
     finally {surface.recordWetWork=null;}
    }
    else { if(!surfaceMethods.has(c.method)) throw new Error('Unknown surface command'); value=surface[c.method](...args); if(c.method==='grow') full=true; }
    values.push(value); replayWork.push(recorded); changed.set(c.id,full);
   };
   for(const c of request.commands) {
    apply(c); completed++;
    if(request.progress===true && completed<request.commands.length && performance.now()-turn>=PAINT_SLICE_MS) {
     // Publish only completed commands. Readout has its own cadence so a costly brush spends
     // its time painting. The serial chain remains owned across every yield and preview.
     if(performance.now()-shown>=PAINT_PREVIEW_MS) {
      const value=await reply(false); postMessage({id:request.id,progress:true,value},transfer(value));
      values=[]; replayWork=[]; for(const id of changed.keys()) changed.set(id,false);
      shown=performance.now();
     }
     await yieldPaint(); turn=performance.now();
    }
   }
   // A surface the page asked about is answered even when nothing in the batch touched it (a barrier).
   for(const id of request.include || []) if(!changed.has(id)) changed.set(id,false);
   return reply(request.final===true);
  }
  if(operation==='read') {
   // The whole surface, a box of it, or (`bounds`) its painted box: the box and its pixels are read at this point of
   // the order, so nothing queued afterwards can change what comes back.
   const surface=need(surfaces,request.surfaceId), box=request.bounds ? surface.bounds() : request.box || null;
   const quality=request.quality==='live' ? 'live' : 'final', pixels=request.bounds && !box ? null : box ? surface.toRGBA8(box,true,quality) : surface.toRGBA8(undefined,true,quality);
   return {pixels,box,digest:pixels && request.verify !== false ? await hash(pixels.data) : null,meta:metaOf(surface),...(request.material ? {material:new Float32Array(surface.data),volume:surface.volume ? new Uint8Array(surface.volume) : null,oil:surface.oil ? new Uint16Array(surface.oil) : null} : {})};
  }
  if(operation==='agent') {
   const signal=agentJobs.get(request.id)?.signal;
   const alive=()=> {if(signal?.aborted)throw paintAbort();};
   alive();
   const prepared=request.target
    ? await prepareAgentLayerPainting(request.strokes,request.target,request.seed,{contribution:request.contribution,signal})
    : prepareAgentPainting(request.strokes,request.seed,{contribution:request.contribution,signal});
   alive();
   if(!prepared) return null;
   const run=prepared.run,total=run.strokes.reduce((n,stroke)=>n+stroke.points.length,0);
   let completed=0;
   const progress=phase=> {if(request.progress===true)postMessage({id:request.id,progress:true,value:{phase,completed,total,stroke:run.stroke,point:run.point}});};
   pool?.attach(run.surface);
   try {
    run.deferSettle=true;
    progress('painting'); await yieldPaint(); alive();
    while(!run.done) {
     let visited=0;
     const laid=run.run(()=>visited++>=1); completed+=laid;
     if(laid)progress('painting');
     await yieldPaint(); alive();
    }
    while(!run.finishSlice(performance.now()+PAINT_SLICE_MS,64)) {
     progress('settling'); await yieldPaint(); alive();
    }
    progress('encoding'); await yieldPaint(); alive();
    const result=await encodeAgentPainting(prepared);
    alive(); return result;
   }
   finally { pool?.detach(run.surface); }
  }
  if(operation==='replayCreate') {
   const strokes=admitAgentStrokes(request.strokes,true),id=idOf(request.surfaceId),frame=request.frame;
   if(!strokes||!frame||!Number.isSafeInteger(frame.w)||!Number.isSafeInteger(frame.h)||frame.w<1||frame.h<1||frame.w*frame.h>12000000||!Number.isFinite(frame.x)||!Number.isFinite(frame.y)||surfaces.has(id)) throw new Error('Invalid paint replay');
   const run=request.replay ? await agentPaintReplayRun({strokes,px:[frame.w,frame.h],seed:request.seed,scale:request.scale,replay:request.replay}) : new AgentPaintRun(strokes,frame,request.seed);
   if(!run)throw new Error('Invalid paint replay material');
   surfaces.set(id,run.surface); pool?.attach(run.surface); runs.set(id,run); return state(id);
  }
  if(operation==='replay') { const run=need(runs,request.surfaceId),count=run.run((s,p)=>s>request.stroke||s===request.stroke&&p>=request.point); return {count,done:run.done,surface:await state(request.surfaceId)}; }
  if(operation==='replayAgent') {
   const signal=agentJobs.get(request.id)?.signal;
   if(signal?.aborted)throw paintAbort();
   const value=await replayAgentPainting(request.shape,request.omitIds,{signal,requireEmptyBase:request.requireEmptyBase===true,
    onProgress:request.progress===true?value=>postMessage({id:request.id,progress:true,value}):undefined});
   if(signal?.aborted)throw paintAbort();
   return value;
  }
  if(operation==='footprint') {
   // The outline's footprint of a brush at a held angle (null: turning with the hand) and a size: a brush of this owner, never the page's.
   const brush=new PaintBrush(request.definition); brush.setBaseValue('radius_logarithmic',request.radius); brush.setHead(request.held,false);
   return brush.footprint(false);
  }
  if(operation==='preview') {
   if(!Number.isSafeInteger(request.width)||!Number.isSafeInteger(request.height)||request.width<1||request.height<1||request.width*request.height>12000000) throw new Error('Invalid preview surface');
   const surface=new PaintSurface(request.width,request.height,{wet:request.wet || {}}); pool?.attach(surface);
   try {
    // A tile of a brush that works paint already there is shown working a band of it (`initial`); a wet one is shown as
    // it is laid, the water not yet travelled (`settle`).
    if(request.initial) surface.fromRGBA8(request.initial.data,request.initial.width,request.initial.height,0,0);
    paintStroke(surface,new PaintBrush(request.definition),request.points,request.options);
    if(request.settle && surface.wetState) { surface.wetPending=0; surface.settleWet(); }
    return surface.toRGBA8();
   }
   finally { pool?.detach(surface); }
  }
  if(operation==='drop') { for(const id of request.surfaceIds||[]) { const surface=surfaces.get(id); if(surface) pool?.detach(surface); surfaces.delete(id); checkpoints.delete(id); runs.delete(id); } for(const id of request.brushIds||[]) brushes.delete(id); return {}; }
  throw new Error('Unknown paint operation');
 }
 return request => {
  // Cancellation is a control message, not material work. It must reach an agent while the
  // ordered executor yields; queuing it behind that agent would make cancellation impossible.
  if(request?.operation==='cancel') {
   const job=agentJobs.get(request.requestId);
   if(job)job.abort();
   return Promise.resolve(!!job);
  }
  if(['agent','replayAgent'].includes(request?.operation)&&Number.isSafeInteger(request.id)&&request.id>0&&!agentJobs.has(request.id))agentJobs.set(request.id,new AbortController());
  const run=async()=> {
   const id=request?.id;
   try {
    if(failed) throw failed;
    if(!Number.isSafeInteger(id)||id<=lastId) throw new Error('Paint request is out of order');
    lastId=id;
    const value=await execute(request); postMessage({id,value},transfer(value));
   } catch(error) {
    const cancelled=error.name==='AbortError'&&agentJobs.get(id)?.signal.aborted;
    const recoverable=cancelled||error.code==='paint_history_full';
    if(!recoverable)failed=error;
    postMessage({id,error:{name:error.name,message:String(error.message||error),...(typeof error.code==='string'?{code:error.code}:{})},...(recoverable?{recoverable:true}:{})});
   } finally {agentJobs.delete(id);}
  };
  chain=chain.then(run); return chain;
 };
}

export function createPaintWorkerClient({postMessage,terminate=()=>{}}) {
 let serial=0, failure=null, closed=false;
 const pending=new Map();
 const fail=error=> { failure=error instanceof Error ? error : new Error(String(error)); for(const job of pending.values()){job.cleanup?.();job.reject(failure);} pending.clear(); };
 return {
  request(operation,payload={},transfer=[],onProgress=null,{signal}={}) {
   if(failure||closed)return Promise.reject(failure||new Error('Paint worker is closed'));
   if(signal&&!['agent','replayAgent'].includes(operation))return Promise.reject(new Error('Only independent agent material can be cancelled'));
   if(signal?.aborted)return Promise.reject(paintAbort());
   const id=++serial;
   return new Promise((resolve,reject)=> {
    const abort=()=>{try{postMessage({operation:'cancel',requestId:id});}catch(error){fail(error);}};
    const cleanup=()=>signal?.removeEventListener('abort',abort);
    pending.set(id,{resolve,reject,onProgress,cleanup,cancel:['agent','replayAgent'].includes(operation)?abort:null});
    try {
     signal?.addEventListener('abort',abort,{once:true});
     postMessage({...payload,id,operation,progress:typeof onProgress==='function'},transfer);
     if(signal?.aborted)abort();
    } catch(error) {fail(error);}
   });
  },
  receive(message) {
   const job=pending.get(message?.id); if(!job) return false;
   if(message.error) {
    const error=Object.assign(new Error(message.error.message),{name:message.error.name||'Error',...(typeof message.error.code==='string'?{code:message.error.code}:{})});
    if(message.recoverable===true&&(error.name==='AbortError'||error.code==='paint_history_full')){pending.delete(message.id);job.cleanup?.();job.reject(error);}
    else fail(error);
   }
   else if(message.progress===true) { try { job.onProgress?.(message.value); } catch(error) { fail(error); } }
   else { pending.delete(message.id); job.cleanup?.(); job.resolve(message.value); }
   return true;
  },
  fail, async close() { closed=true; for(const job of [...pending.values()])job.cancel?.(); fail(new Error('Paint worker is closed')); await terminate(); }
 };
}
// The painter run in this realm, for a page that cannot start a worker (no Worker, a host that refuses a Blob worker, a
// file: page): the same ordered protocol, the same code, the same bytes. A message is delivered on a microtask and is
// cloned as a real worker's would be, so nothing here shares memory with the page that a worker would not.
export function createLocalPaintClient() {
 let client=null;
 const deliver=(target,message,transfer=[])=> { const copy=structuredClone(message,transfer.length ? {transfer} : undefined); queueMicrotask(()=>target(copy)); };
 const receive=createPaintWorker({isolated:false,postMessage:(message,transfer)=>deliver(reply=>client.receive(reply),message,transfer)});
 client=createPaintWorkerClient({postMessage:(message,transfer)=>deliver(request=>{ void receive(request); },message,transfer)});
 return client;
}
export function installPaintWorker(scope=globalThis) {
 if(typeof scope.document!=='undefined') throw new Error('Painting needs a dedicated worker');
 const receive=createPaintWorker({isolated:scope.crossOriginIsolated===true,postMessage:(m,t)=>scope.postMessage(m,t),spawnRows:(init,source)=>new Promise((resolve,reject)=>{
  if(typeof source!=='string'||!source) { reject(new Error('Paint row source is missing')); return; }
  const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),worker=new Worker(url);
  const timer=setTimeout(()=>{worker.terminate();URL.revokeObjectURL(url);reject(new Error('Paint row startup timed out'));},15000);
  worker.onmessage=({data})=> { if(data.ready) {clearTimeout(timer); URL.revokeObjectURL(url); resolve(worker);} else if(data.error) {clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);reject(new Error(data.error));} };
  worker.onerror=error=> {clearTimeout(timer);worker.terminate();URL.revokeObjectURL(url);reject(new Error(error.message||'Paint row failed'));};
  worker.postMessage({operation:'init',...init});
 })});
 scope.onmessage=({data})=>receive(data);
}
