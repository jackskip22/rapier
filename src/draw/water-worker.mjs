// SPDX-License-Identifier: AGPL-3.0-only
// The worker transfers readout copies. Authoritative pigment and rollback buffers stay owned here.
import {WaterSurface,WaterBrush,waterError,waterReady} from './water.mjs';
import {sha256Yielding} from '../notes/integrity.mjs';
import {paintAgentStrokes,replayAgentPainting,sampleAgentPainting,agentPaintReplayRun,restoreWaterReplay} from './agent-paint.mjs';
const hash=data=>sha256Yielding(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
const integer=n=>Number.isSafeInteger(n)&&n>0;
const transferOf=value=>{const result=new Set();const walk=v=>{if(!v||typeof v!=='object')return;if(ArrayBuffer.isView(v)){if(v.buffer instanceof ArrayBuffer)result.add(v.buffer);return;}for(const item of Object.values(v))walk(item);};walk(value);return [...result];};
const brushState=b=>b.snapshot();
const restoreBrushes=(checkpoint,brushes)=>{for(const [id,state]of checkpoint.brushes||[])brushes.get(id)?.fromSnapshot(state);};
const yieldWork=()=>new Promise(resolve=>setTimeout(resolve,0));
export function createWaterWorker({postMessage}={}){
 const surfaces=new Map(),brushes=new Map(),checkpoints=new Map(),runs=new Map(),jobs=new Map(),queued=new Set(),displayed=new Map();let serial=0,chain=Promise.resolve(),completed=0;
 const need=(map,id)=>{if(!integer(id)||!map.has(id))throw waterError('WATER_INPUT','The Water object is not live');return map.get(id);};
 const metadata=s=>{const stats=s.stats();return {width:s.width,height:s.height,revision:s.revision,bounds:s.bounds(),growBox:s.growBox,toothOX:s.toothOX,toothOY:s.toothOY,wetState:!!s.wetState,wet:s.wet,_wetWork:!!s._wetWork,wetPending:s.wetPending,opStats:stats,stats,tick:s.tick,mode:'water'};};
 const state=async(id,full=false,display=true)=>{
  const s=need(surfaces,id);await s._finishWetWork();let box=display?s.takeDirty():null;
  if(display&&full){
   // Canonical display covers the cubic support and every earlier dirty pixel, including clears and rollback.
   const kept=s.bounds();if(kept)box=box?{x0:Math.min(box.x0,kept.x0),y0:Math.min(box.y0,kept.y0),x1:Math.max(box.x1,kept.x1),y1:Math.max(box.y1,kept.y1)}:kept;
  }
  // Every changed material cell influences the surrounding cubic readout, including live patches.
  if(box){const pad=(s.cell || 1)*2+2;box={x0:Math.max(0,box.x0-pad),y0:Math.max(0,box.y0-pad),x1:Math.min(s.width-1,box.x1+pad),y1:Math.min(s.height-1,box.y1+pad)};}
  const patch=box?{...await s.toRGBA8(box,true,full?'final':'live'),box}:null;if(patch)displayed.set(id,performance.now());
  return {surfaceId:id,meta:metadata(s),patch};
 };
 const nextRedraws=id=>{const next=queued.values().next().value;return next?.operation==='batch'&&Array.isArray(next.commands)&&(next.include?.includes(id)||next.commands.some(c=>c?.target==='stroke'&&c.surfaceId===id||c?.target==='surface'&&c.id===id));};
 const methods=new Set(['clear','fromRGBA8','grow','tilt','settleWet','_finishWetWork','stepWet','composeWet','advanceWet','applyWater','takeWaterReplay','fromSnapshot']);
 const brushMethods=new Set(['seed','setColor','setPigment','setBaseValue','reset','newStroke','rebase','setHead']);
 async function command(c,changed,used,progress=null){
  if(!c||typeof c!=='object'||!Array.isArray(c.args))throw waterError('WATER_INPUT','The Water command is not valid');
  if(c.target==='brush'){if(!brushMethods.has(c.method))throw waterError('WATER_INPUT','The brush command is not valid');await need(brushes,c.id)[c.method](...c.args);return {surface:false};}
  if(c.target==='stroke'){const s=need(surfaces,c.surfaceId),b=need(brushes,c.brushId),cp=checkpoints.get(c.surfaceId);if(cp&&!cp.brushes.has(c.brushId))cp.brushes.set(c.brushId,brushState(b));await b.strokeTo(s,...c.args);changed.add(c.surfaceId);used.add(c.brushId);return {surface:false};}
  if(c.target!=='surface')throw waterError('WATER_INPUT','The Water command target is not valid');
  const s=need(surfaces,c.id);let value;
  if(c.method==='set'){
   const [name,v]=c.args;if(!['paper','scale','toothOX','toothOY','wetPending'].includes(name))throw waterError('WATER_INPUT','The Water property is not valid');
   if(name==='scale'&&(!(v>0)||!Number.isFinite(v)))throw waterError('WATER_INPUT','The Water scale is not valid');
   s[name]=v;
  }else if(c.method==='fromWaterMaterial'){
   const [replay,session,offset]=c.args;
   if(checkpoints.has(c.id)||!Array.isArray(offset)||offset.length!==2||!offset.every(Number.isSafeInteger)||replay?.session!==session||Math.abs(replay.scale-s.pixelScale)>1e-9)throw waterError('WATER_INPUT','The Water material does not match this sheet');
   let restored;
   try{restored=await restoreWaterReplay(replay,{waterSession:session,surface:true});const material=restored.surface;
    await material.reframe(s.width,s.height,offset[0]-restored.crop[0],offset[1]-restored.crop[1]);material.takeWaterReplay();
    material.revision=Math.max(material.revision,s.revision+1);material._dirty={x0:0,y0:0,x1:material.width-1,y1:material.height-1};
    value={width:material.width,height:material.height,toothOX:material.toothOX,toothOY:material.toothOY};surfaces.set(c.id,material);s.dispose();
   }catch(error){restored?.surface.dispose();throw error;}
  }else if(c.method==='beginStroke'){
   if(checkpoints.has(c.id))throw waterError('WATER_BUSY','A Water gesture is already open');checkpoints.set(c.id,{id:c.args[0],value:await s.beginStroke(),brushes:new Map()});
  }else if(c.method==='endStroke'){
   const cp=checkpoints.get(c.id);if(!cp&&c.args[1]===true)value=false;else{if(!cp||cp.id!==c.args[0])throw waterError('WATER_INPUT','The Water gesture does not match its checkpoint');value=await s.endStroke(cp.value,c.args[1]===true);if(c.args[1]===true)restoreBrushes(cp,brushes);checkpoints.delete(c.id);}if(c.args[1]===true)s._dirty={x0:0,y0:0,x1:s.width-1,y1:s.height-1};
  }else if(c.method==='applyWater'){for await(const step of s.applyWaterSteps(c.args[0])){await progress?.(c.id);await yieldWork();}value=true;}
  else if(c.method==='dryWet'){value=await s.dryWet(0,c.args[0]??8,c.args[1]??8);}
  else {if(!methods.has(c.method))throw waterError('WATER_INPUT','The Water surface command is not valid');value=await s[c.method](...c.args);if(value===s)value=true;}
  changed.add(c.id);return {surface:true,value};
 }
 async function execute(request){
  const op=request.operation;
  if(op==='configure'){await waterReady();return {helpers:0,backend:'webgpu'};}
  if(op==='create'){
   if(!integer(request.surfaceId)||surfaces.has(request.surfaceId))throw waterError('WATER_INPUT','The Water surface identity is not valid');
   const surface=new WaterSurface(request.width,request.height,request.options||{});await surface.ready;surfaces.set(request.surfaceId,surface);return state(request.surfaceId);
  }
  if(op==='brush'){
   if(!integer(request.brushId)||brushes.has(request.brushId))throw waterError('WATER_INPUT','The Water brush identity is not valid');brushes.set(request.brushId,new WaterBrush(request.definition));return {};
  }
  if(op==='batch'){
   if(!Array.isArray(request.commands))throw waterError('WATER_INPUT','The Water batch is not valid');
   const changed=new Set(request.include||[]),used=new Set(),values=[],replayWork=[];let done=0;
   for(const c of request.commands){const out=await command(c,changed,used,request.progress?async id=>{if(displayed.has(id)&&performance.now()-displayed.get(id)<32)return;const value={completed:0,surfaces:[await state(id)],values:[],replayWork:[],brushes:{}};postMessage({id:request.id,progress:true,value},transferOf(value));}:null);if(out.surface){values.push(out.value);replayWork.push(null);}done++;completed++;}
   const structural=request.commands.some(c=>c.target==='surface'&&['grow','clear','fromRGBA8','fromSnapshot','fromWaterMaterial','endStroke'].includes(c.method));
   const liveStroke=request.final!==true&&!structural&&request.commands.some(c=>c.target==='stroke');
   // Input and material remain ordered. Only superseded display patches wait; dirty pixels survive until a later readout.
   if(liveStroke&&!queued.size)await yieldWork();
   const now=performance.now();
   const states=[];for(const id of changed)states.push(await state(id,request.final===true,!(liveStroke&&displayed.has(id)&&now-displayed.get(id)<32&&nextRedraws(id))));
   return {completed:done,surfaces:states,values,replayWork,brushes:Object.fromEntries([...used].map(id=>[id,{loadFuel:brushes.get(id).loadFuel}])),stats:{backend:'webgpu',commands:completed}};
  }
  if(op==='read'){
   const s=need(surfaces,request.surfaceId),box=request.bounds?s.bounds():request.box||null;
   if(request.sample)return {sample:await s.samplePigment(...request.sample),meta:metadata(s)};
   const pixels=request.bounds&&!box?null:await s.toRGBA8(box,true,request.quality==='live'?'live':'final'),meta=metadata(s);
   return {pixels,box,digest:pixels&&request.verify!==false?await hash(pixels.data):null,meta,stats:meta.stats,waterReplay:s.waterReplay(),...(request.snapshot||request.material?{waterState:await s.snapshot(box)}:{})};
  }
  if(op==='stats'){const s=need(surfaces,request.surfaceId),meta=metadata(s);return {...meta.stats,meta,commands:completed};}
  if(op==='preview'){
   const s=new WaterSurface(request.width,request.height,{pixelScale:1,seed:request.options?.seed??request.seed??1,paper:request.definition?.water?.paper??'cold-press'}),b=new WaterBrush(request.definition),options=request.options||request;
   await s.ready;
   try{b.seed(options.seed??1);if(options.radiusOffset!=null)b.setBaseValue('radius_logarithmic',b.getBaseValue('radius_logarithmic')+options.radiusOffset);
   if(request.initial)await s.fromRGBA8(request.initial.data,request.initial.width,request.initial.height);
   b.newStroke();for(const [x,y,p,dt]of request.points||[])await b.strokeTo(s,x*3,y*3,p,0,0,dt??.016);if(request.settle)await s.settleWet();const pixels=await s.toRGBA8();return {...pixels,pixels};}finally{s.dispose();}
  }
  if(op==='footprint'){
   const b=new WaterBrush(request.definition);if(request.radius!=null)b.setBaseValue('radius_logarithmic',request.radius);b.setHead(request.held??null,false);const aspect=1;return {radius:b.radius*3,aspect,angle:request.held??0};
  }
  if(op==='sampleAgent')return sampleAgentPainting(request.shape,request.point,{...request.options,signal:jobs.get(request.id)?.signal});
  if(op==='agent')return paintAgentStrokes(request.strokes,request.seed,request.target,{...request.options,signal:jobs.get(request.id)?.signal,contribution:request.contribution??request.contributionId,recipe:request.recipe,mode:'water',actions:request.actions,paper:request.paper,waterSession:request.waterSession,waterAuthorized:request.waterAuthorized===true,onProgress:request.progress?value=>postMessage({id:request.id,progress:true,value}):undefined});
  if(op==='replayAgent')return replayAgentPainting(request.shape,request.omitIds,{...request.options,signal:jobs.get(request.id)?.signal,requireEmptyBase:request.requireEmptyBase===true,waterSession:request.waterSession,waterAuthorized:request.waterAuthorized===true});
  if(op==='replayCreate'){
   const frame=request.frame;if(!frame||!integer(request.surfaceId)||surfaces.has(request.surfaceId))throw waterError('WATER_INPUT','The Water replay frame is not valid');
   const run=await agentPaintReplayRun({mode:'water',paper:request.paper,actions:request.actions,strokes:request.strokes,px:[frame.w,frame.h],scale:request.scale,seed:request.seed,replay:request.replay});
   if(!run)throw waterError('WATER_INPUT','The Water replay cannot be restored');surfaces.set(request.surfaceId,run.surface);runs.set(request.surfaceId,run);return state(request.surfaceId);
  }
  if(op==='replay'){const run=need(runs,request.surfaceId),count=await run.run((stroke,point)=>stroke>request.stroke||stroke===request.stroke&&point>=request.point);return {count,done:run.done,surface:await state(request.surfaceId)};}
  if(op==='drop'){for(const id of request.surfaceIds||[]){surfaces.get(id)?.dispose();surfaces.delete(id);checkpoints.delete(id);runs.delete(id);displayed.delete(id);}for(const id of request.brushIds||[])brushes.delete(id);return {};}
  throw waterError('WATER_INPUT','The Water operation is not valid');
 }
 const receive=request=>{
  if(request?.operation==='cancel'){jobs.get(request.requestId)?.abort();return Promise.resolve(true);}
  if(['agent','replayAgent','sampleAgent'].includes(request?.operation))jobs.set(request.id,new AbortController());
  queued.add(request);
  const run=async()=>{
   queued.delete(request);const id=request?.id;
   try{
    if(!integer(id)||id<=serial)throw waterError('WATER_INPUT','The Water request is out of order');serial=id;
    if(jobs.get(id)?.signal.aborted)throw Object.assign(new Error('Water painting cancelled'),{name:'AbortError',code:'WATER_CANCELLED'});
    const value=await execute(request);
    if(jobs.get(id)?.signal.aborted)throw Object.assign(new Error('Water painting cancelled'),{name:'AbortError',code:'WATER_CANCELLED'});
    postMessage({id,value},transferOf(value));
   }catch(error){
    for(const [sid,cp]of checkpoints){const s=surfaces.get(sid);try{if(s)await s.endStroke(cp.value,true);}catch(_){}restoreBrushes(cp,brushes);if(s)s._dirty={x0:0,y0:0,x1:s.width-1,y1:s.height-1};checkpoints.delete(sid);}
    const reopen=['WATER_GPU_MEMORY','WATER_GPU_FAILED','WATER_DEVICE_LOST'].includes(error.code);
    // A poisoned GPU cannot roll back a live sheet. The page's existing painter-loss owner
    // restores its last publication and starts a fresh painter on the next gesture.
    if(reopen){for(const surface of surfaces.values())surface.dispose();surfaces.clear();brushes.clear();runs.clear();displayed.clear();}
    postMessage({id,error:{name:error.name||'Error',code:error.code||'WATER_INPUT',message:String(error.message||error)},recoverable:!reopen&&error.recoverable!==false});
   }finally{jobs.delete(id);}
  };
  chain=chain.then(run,run);return chain;
 };
 receive.close=async()=>{await Promise.resolve();for(const job of jobs.values())job.abort();await chain;for(const surface of surfaces.values())surface.dispose();surfaces.clear();brushes.clear();checkpoints.clear();runs.clear();displayed.clear();};
 return receive;
}
export function createWaterWorkerClient({postMessage,terminate=()=>{}}){
 let serial=0,closed=false;const pending=new Map();
 const fail=error=>{for(const job of pending.values()){job.cleanup?.();job.reject(error);}pending.clear();};
 return {
  request(operation,payload={},transfer=[],onProgress=null,{signal}={}){
   if(closed)return Promise.reject(new Error('Water is closed'));
   if(signal?.aborted)return Promise.reject(Object.assign(new Error('Water painting cancelled'),{name:'AbortError'}));
   const id=++serial;return new Promise((resolve,reject)=>{
    const abort=()=>postMessage({operation:'cancel',requestId:id}),cleanup=()=>signal?.removeEventListener('abort',abort);
    pending.set(id,{resolve,reject,onProgress,cleanup,abort});signal?.addEventListener('abort',abort,{once:true});
    try{postMessage({...payload,id,operation,progress:typeof onProgress==='function'},transfer);}catch(error){pending.delete(id);cleanup();reject(error);}
   });
  },
  receive(message){const job=pending.get(message?.id);if(!job)return false;if(message.progress){job.onProgress?.(message.value);return true;}pending.delete(message.id);job.cleanup?.();if(message.error)job.reject(Object.assign(new Error(message.error.message),message.error,{recoverable:message.recoverable===true}));else job.resolve(message.value);return true;},
  fail,async close(){closed=true;for(const job of pending.values())job.abort?.();fail(new Error('Water is closed'));await terminate();}
 };
}
export function createLocalWaterClient(){
 let client;const deliver=(fn,message,transfer=[])=>{const value=structuredClone(message,transfer.length?{transfer}:undefined);queueMicrotask(()=>fn(value));};
 const receive=createWaterWorker({postMessage:(m,t)=>deliver(value=>client.receive(value),m,t)});
 client=createWaterWorkerClient({postMessage:(m,t)=>deliver(value=>receive(value),m,t),terminate:()=>receive.close()});return client;
}
export function installWaterWorker(scope=globalThis){if(typeof scope.document!=='undefined')throw new Error('Water needs a dedicated worker');const receive=createWaterWorker({postMessage:(m,t)=>scope.postMessage(m,t)});scope.onmessage=({data})=>receive(data);}
