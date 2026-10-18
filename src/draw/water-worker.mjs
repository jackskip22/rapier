// SPDX-License-Identifier: AGPL-3.0-only
import {WaterSurface,WaterBrush,paintWaterBrushPreview,waterError,waterReady,waterSoftwareAdmitted,waterWarm,waterUnfilteredTest,waterTiming,waterTimingOn,waterCapture,waterCaptureOn,waterNote} from './water.mjs';
import {sha256Yielding} from '../notes/integrity.mjs';
import {paintAgentStrokes,replayAgentPainting,sampleAgentPainting,agentPaintReplayRun,restoreWaterReplay,waterReplayAt} from './agent-paint.mjs';
import {createWorkerClient} from './worker-client.mjs';
export {createWorkerClient};
const hash=data=>sha256Yielding(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
const integer=n=>Number.isSafeInteger(n)&&n>0;
const transferOf=value=>{const result=new Set();const walk=v=>{if(!v||typeof v!=='object')return;if(typeof ImageBitmap==='function'&&v instanceof ImageBitmap){result.add(v);return;}if(ArrayBuffer.isView(v)){if(v.buffer instanceof ArrayBuffer)result.add(v.buffer);return;}for(const item of Object.values(v))walk(item);};walk(value);return [...result];};
const brushState=b=>b.snapshot();
const restoreBrushes=(checkpoint,brushes)=>{for(const [id,state]of checkpoint.brushes||[])brushes.get(id)?.fromSnapshot(state);};
const yieldWork=()=>new Promise(resolve=>setTimeout(resolve,0));
const WATER_CHECKPOINT_BYTES=128*1024*1024;
const publicationKey=replay=>JSON.stringify(replay,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function createWaterWorker({postMessage}={}){
 const surfaces=new Map(),brushes=new Map(),checkpoints=new Map(),runs=new Map(),jobs=new Map(),queued=new Set(),displayed=new Map(),displays=new Map(),controls=[];let serial=0,chain=Promise.resolve(),completed=0,closed=false,device=null,slowTest=1,wakeDisplay=null,displayWork=0;
 const publications=new Map();let publicationBytes=0;
 const forgetPublication=key=>{const row=publications.get(key);if(row){publicationBytes-=row.bytes;publications.delete(key);}};
 const capturePublication=async(s,request,capture,box)=>{
  if(!request.waterCheckpoint||!box)return;
  const sheet=request.waterSheet;
  if(!sheet||sheet.width!==s.width||sheet.height!==s.height||sheet.scale*3!==s.pixelScale||typeof sheet.options?.waterSession!=='string')throw waterError('WATER_INPUT','The Water checkpoint sheet is not current');
  const replay=waterReplayAt(request.waterPrior,capture,box,{px:[sheet.width,sheet.height],scale:s.pixelScale,sheet}),key=publicationKey(replay);
  if(publications.has(key)){const held=publications.get(key);publications.delete(key);publications.set(key,held);return;}
  const tips=[...s._tips].reduce((bytes,[id,tip])=>bytes+id.length*2+tip.mask.length*8+256,0);
  const bytes=s.gpu.checkpointBytes()+key.length*2+tips+s.gpu.paper.field.regions.length*128+4096;
  if(bytes>WATER_CHECKPOINT_BYTES)return;
  while(publicationBytes+bytes>WATER_CHECKPOINT_BYTES)forgetPublication(publications.keys().next().value);
  const restore=await s._retainCheckpoint();
  publications.set(key,{bytes,restore,crop:[box.x0,box.y0,box.x1,box.y1]});publicationBytes+=bytes;
 };
 const restorePublication=async(replay,session,maxBytes)=>{
  const key=publicationKey(replay),held=publications.get(key);if(!held||replay.session!==session)return null;
  publications.delete(key);publications.set(key,held);
  const surface=await held.restore(maxBytes);return {surface,crop:held.crop.slice()};
 };
 const restoreMaterial=async(width,height,options,raw,presentationBytes=0)=>{
  const frame=WaterSurface._admitFrame(width,height,options),{replay,session,offset}=raw??{};
  if(!Array.isArray(offset)||offset.length!==2||!offset.every(Number.isSafeInteger)||replay?.session!==session||Math.abs(replay.scale-frame.scale*3)>1e-9)throw waterError('WATER_INPUT','The Water material does not match this sheet');
  let restored;
  try{
   restored=await restorePublication(replay,session,options.maxBytes)??await restoreWaterReplay(replay,{waterSession:session,surface:true,...(options.maxBytes==null?{}:{maxBytes:options.maxBytes})});
   const material=restored.surface;material.gpu._reservePresentation(presentationBytes);
   await material.reframe(width,height,offset[0]-restored.crop[0],offset[1]-restored.crop[1]);material.takeWaterReplay();return material;
  }catch(error){restored?.surface.dispose();throw error;}
 };
 const lostCapture=()=>waterCapture.on?{capture:waterCapture.rows.slice()}:{};
 const watchDevice=next=>{if(device===next)return;device=next;next.lost.then(()=>{if(!closed&&device===next)postMessage({failure:{name:'Error',code:'WATER_DEVICE_LOST',message:'The GPU stopped. The last published painting is safe; reopen Water to continue.'},...lostCapture()});});};
 const releaseDisplay=(display,keepShown=false)=>{if(display){if(waterCapture.on)waterNote({ev:'release',generation:display.generation,keepShown});display.context.unconfigure();display.canvas.width=display.canvas.height=0;display.gpu?._reservePresentation(keepShown?display.shown?.bytes||0:0);}};
 const dropDisplay=id=>{releaseDisplay(displays.get(id));displays.delete(id);};
 const reserveDisplay=(bound,gpu,bytes)=>{gpu._reservePresentation(bytes);if(bound.gpu!==gpu)bound.gpu?._reservePresentation(0);bound.gpu=gpu;};
 const sendValue=(id,value,progress=false)=>{
  const reply={id,...(progress?{progress:true}:{}),value};
  try{postMessage(reply,transferOf(value));}
  catch(error){
   let refused=false;
   for(const row of value?.surfaces??[value]){
    const frame=row?.display;if(!frame?.bitmap)continue;
    refused=true;frame.bitmap.close();
    const bound=displays.get(row.surfaceId);
    if(bound?.pending?.frame===frame.frame){bound.pending=null;bound.full=true;bound.gpu?._reservePresentation((bound.shown?.bytes||0)+(bound.producerBytes||0));}
    row.display={generation:frame.generation,submitted:false,refused:'WATER_DISPLAY'};
   }
   if(!refused)throw error;
   postMessage(reply,transferOf(value));
  }
 };
 const need=(map,id)=>{if(!integer(id)||!map.has(id))throw waterError('WATER_INPUT','The Water object is not live');return map.get(id);};
 const metadata=s=>{const stats=s.stats();return {width:s.width,height:s.height,revision:s.revision,bounds:s.bounds(),growBox:s.growBox,toothOX:s.toothOX,toothOY:s.toothOY,wetState:!!s.wetState,wet:s.wet,_wetWork:!!s._wetWork,wetPending:s.wetPending,opStats:stats,stats,tick:s.tick,mode:'water',...(waterTiming.on?{timing:{...waterTiming}}:{})};};
 const state=async(id,full=false,display=true,presentationOnly=false)=>{
  if(!presentationOnly)await need(surfaces,id)._finishWetWork();
  await drainDisplays();
  return displayState(id,full,display,presentationOnly);
 };
 const displayState=async(id,full=false,display=true,presentationOnly=false)=>{
  const s=need(surfaces,id);watchDevice(s.gpu.device);
  const bound=displays.get(id);
  if(bound){
   if(!display)return {surfaceId:id,meta:metadata(s),patch:null};
   const changed=bound.material!==s||bound.width!==s.width||bound.height!==s.height||bound.toothOX!==s.toothOX||bound.toothOY!==s.toothOY;
   bound.full ||= full||changed;
   if(bound.pending)return {surfaceId:id,meta:metadata(s),patch:null};
   full=bound.full;
  }
  let box=display&&!presentationOnly?s.takeDirty():null;
  if(display&&full){
   const kept=s.bounds();if(kept)box=box?{x0:Math.min(box.x0,kept.x0),y0:Math.min(box.y0,kept.y0),x1:Math.max(box.x1,kept.x1),y1:Math.max(box.y1,kept.y1)}:kept;
  }
  if(box){const pad=(s.cell || 1)*2+2;box={x0:Math.max(0,box.x0-pad),y0:Math.max(0,box.y0-pad),x1:Math.min(s.width-1,box.x1+pad),y1:Math.min(s.height-1,box.y1+pad)};}
  if(bound){
   const relight=!!s.gpu.finish&&s.gpu.lightDirty;
   if(!(box||full||relight))return {surfaceId:id,meta:metadata(s),patch:null};
   const bytes=s.width*s.height*4;
   try{
    reserveDisplay(bound,s.gpu,(bound.shown?.bytes||0)+bytes*2);
    if(bound.material!==s||bound.width!==s.width||bound.height!==s.height){
     bound.canvas.width=s.width;bound.canvas.height=s.height;bound.width=s.width;bound.height=s.height;
     const configuration={format:'rgba8unorm',alphaMode:'premultiplied',colorSpace:'srgb'};
     bound.producerBytes=bytes;bound.context.configure({device:s.gpu.device,...configuration});bound.material=s;
     if(waterCapture.on)waterNote({ev:'configure',surface:id,generation:bound.generation,canvas:[bound.canvas.width,bound.canvas.height],...configuration,usage:bound.context.getConfiguration?.()?.usage});
    }
    if(waterCapture.on&&(bound.canvas.width!==s.width||bound.canvas.height!==s.height))waterNote({ev:'mismatch',canvas:[bound.canvas.width,bound.canvas.height],sheet:[s.width,s.height]});
    const bitmap=await s.gpu.present(bound.context.getCurrentTexture(),full||relight?null:[box.x0,box.y0,box.x1+1,box.y1+1],()=>bound.canvas.transferToImageBitmap());
    if(!bitmap||bitmap.width!==s.width||bitmap.height!==s.height){bitmap?.close();throw waterError('WATER_DISPLAY','The Water frame is unavailable');}
    bound.toothOX=s.toothOX;bound.toothOY=s.toothOY;bound.full=false;
    const meta=metadata(s),frame={generation:bound.generation,canvasGeneration:bound.canvasGeneration,frame:++bound.sequence,revision:meta.revision,width:meta.width,height:meta.height,bytes};
    bound.pending=frame;displayed.set(id,performance.now());
    if(waterCapture.on)waterNote({ev:'send',surface:id,frame:frame.frame,generation:frame.generation,revision:frame.revision,full:!!full});
    return {surfaceId:id,meta,patch:null,display:{...frame,submitted:true,complete:true,bitmap}};
   }catch(error){
    bound.full=true;
    if(waterCapture.on)waterNote({ev:'refused',surface:id,code:error.code,message:String(error?.message??error)});
    bound.gpu?._reservePresentation((bound.shown?.bytes||0)+(bound.producerBytes||0));
    s.gpu._check();
    return {surfaceId:id,meta:metadata(s),patch:null,display:{generation:bound.generation,submitted:false,refused:error.code||'WATER_DISPLAY'}};
   }
  }
  let patch=null;
  if(s.gpu.finish&&(box||s.gpu.lightDirty)){
   const frame=s.gpu.lightDirty?{x0:0,y0:0,x1:s.width-1,y1:s.height-1}:box;
   const data=await s.gpu.read({live:true,box:[frame.x0,frame.y0,frame.x1+1,frame.y1+1]});
   patch={width:frame.x1-frame.x0+1,height:frame.y1-frame.y0+1,data:new Uint8ClampedArray(data.buffer,data.byteOffset,data.byteLength),box:frame};
  }else if(box)patch={...await s.toRGBA8(box,true,full?'final':'live'),box};
  if(patch)displayed.set(id,performance.now());
  return {surfaceId:id,meta:metadata(s),patch};
 };
 const nextRedraws=id=>{const next=queued.values().next().value;return next?.operation==='batch'&&Array.isArray(next.commands)&&(next.include?.includes(id)||next.commands.some(c=>c?.target==='stroke'&&c.surfaceId===id||c?.target==='surface'&&c.id===id));};
 const methods=new Set(['clear','fromRGBA8','grow','tilt','settleWet','_finishWetWork','stepWet','composeWet','advanceWet','applyWater','takeWaterReplay','fromSnapshot']);
 const brushMethods=new Set(['seed','setColor','setPigment','setBaseValue','reset','newStroke','rebase','setHead']);
 async function command(c,changed,used,progress=null,lights=null){
  if(!c||typeof c!=='object'||!Array.isArray(c.args))throw waterError('WATER_INPUT','The Water command is not valid');
  if(c.target==='brush'){if(!brushMethods.has(c.method))throw waterError('WATER_INPUT','The brush command is not valid');await need(brushes,c.id)[c.method](...c.args);return {surface:false};}
  if(c.target==='stroke'){const s=need(surfaces,c.surfaceId),b=need(brushes,c.brushId),cp=checkpoints.get(c.surfaceId);if(cp?.error)throw cp.error;if(cp&&!cp.brushes.has(c.brushId))cp.brushes.set(c.brushId,brushState(b));await b.strokeTo(s,...c.args);changed.add(c.surfaceId);used.add(c.brushId);return {surface:false};}
  if(c.target!=='surface')throw waterError('WATER_INPUT','The Water command target is not valid');
  const s=need(surfaces,c.id),checkpoint=checkpoints.get(c.id);let value;
  if(checkpoint?.error&&c.method!=='endStroke')throw checkpoint.error;
  if(c.method==='tilt'){
   value=s.tilt(...c.args);if(value)lights?.add(c.id);
   return {surface:true,value};
  }
  if(c.method==='set'){
   const [name,v]=c.args;if(!['paper','scale','toothOX','toothOY','wetPending'].includes(name))throw waterError('WATER_INPUT','The Water property is not valid');
   if(name==='scale'&&(!(v>0)||!Number.isFinite(v)))throw waterError('WATER_INPUT','The Water scale is not valid');
   s[name]=v;
  }else if(c.method==='fromWaterMaterial'){
   const [replay,session,offset]=c.args;
   if(checkpoints.has(c.id))throw waterError('WATER_INPUT','The Water material does not match this sheet');
   let material;
   try{material=await restoreMaterial(s.width,s.height,{pixelScale:s.pixelScale,paper:s.paperId,seed:s.seed,origin:s.origin,maxBytes:s.maxBytes},{replay,session,offset},s.gpu.presentationBytes);
    material.revision=Math.max(material.revision,s.revision+1);material._dirty={x0:0,y0:0,x1:material.width-1,y1:material.height-1};
    value={width:material.width,height:material.height,toothOX:material.toothOX,toothOY:material.toothOY};surfaces.set(c.id,material);
    const display=displays.get(c.id);if(display)display.gpu=material.gpu;
    s.dispose();
   }catch(error){material?.dispose();throw error;}
  }else if(c.method==='beginStroke'){
   if(checkpoints.has(c.id))throw waterError('WATER_BUSY','A Water gesture is already open');checkpoints.set(c.id,{id:c.args[0],value:await s.beginStroke(),brushes:new Map()});
  }else if(c.method==='endStroke'){
   const cp=checkpoint,cancel=c.args[1]===true;
   if(!cp&&cancel)value=false;
   else {
    if(!cp||cp.id!==c.args[0])throw waterError('WATER_INPUT','The Water gesture does not match its checkpoint');
    if(cp.error){if(!cancel)throw cp.error;value=false;}
    else {value=await s.endStroke(cp.value,cancel);if(cancel)restoreBrushes(cp,brushes);}
    checkpoints.delete(c.id);
   }
   if(cancel)s._dirty={x0:0,y0:0,x1:s.width-1,y1:s.height-1};
  }else if(c.method==='applyWater'){for await(const step of s.applyWaterSteps(c.args[0])){await progress?.(c.id);await yieldWork();}value=true;}
  else if(c.method==='dryWet'){value=await s.dryWet(0,c.args[0]??8,c.args[1]??8);}
  else {if(!methods.has(c.method))throw waterError('WATER_INPUT','The Water surface command is not valid');value=await s[c.method](...c.args);if(value===s)value=true;}
  changed.add(c.id);return {surface:true,value};
 }
 async function execute(request){
  const op=request.operation;
  if(op==='configure'){if(request.preview===true)return {helpers:0,backend:'contact'};waterSoftwareAdmitted(request.software===true);waterUnfilteredTest(request.unfilteredTest===true);slowTest=Number.isFinite(request.slowTest)&&request.slowTest>1?request.slowTest:1;waterTimingOn(request.stats===true);waterCaptureOn(request.capture===true);const ready=await waterReady();watchDevice(ready);waterWarm().catch(()=>{});return {helpers:0,backend:'webgpu',filterable:ready.features.has('float32-filterable'),features:[...ready.features].sort()};}
  if(op==='preview'){
   if(!integer(request.width)||!integer(request.height))throw waterError('WATER_INPUT','The Water preview size is not valid');
   const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(request.width,request.height):globalThis.document?.createElement('canvas');
   if(!canvas)throw waterError('WATER_INPUT','This host cannot draw a brush preview');
   canvas.width=request.width;canvas.height=request.height;paintWaterBrushPreview(canvas,request.definition);
   return {pixels:{width:canvas.width,height:canvas.height,data:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data}};
  }
  if(op==='bindDisplay'){
   const s=need(surfaces,request.surfaceId);await s.ready;
   if(!integer(request.generation)||typeof request.canvas?.getContext!=='function'||typeof request.canvas?.transferToImageBitmap!=='function'||displays.has(request.surfaceId)&&request.generation<=displays.get(request.surfaceId).generation)throw waterError('WATER_INPUT','The Water display identity is not current');
   if(!Number.isSafeInteger(request.shownGeneration)||request.shownGeneration<0)throw waterError('WATER_INPUT','The shown Water display is not valid');
   const current=displays.get(request.surfaceId);
   if(current?.pending)throw waterError('WATER_BUSY','The Water frame is still held by its receiver');
   if(request.shownGeneration!==(current?.shown?.canvasGeneration||0))throw waterError('WATER_INPUT','The shown Water display is no longer held');
   const context=request.canvas.getContext('webgpu');if(!context)throw waterError('water_webgpu_unavailable','Water could not create its GPU display.');
   releaseDisplay(current,true);
   const bound={canvas:request.canvas,context,generation:request.generation,canvasGeneration:request.generation,material:null,full:true,sequence:current?.sequence||0,shown:current?.shown||null,pending:null,producerBytes:0,gpu:current?.gpu||null};
   displays.set(request.surfaceId,bound);
   if(waterCapture.on)waterNote({ev:'bind',surface:request.surfaceId,generation:request.generation,canvas:[request.canvas.width,request.canvas.height]});
   return displayState(request.surfaceId,true);
  }
  if(op==='display'){
   const bound=displays.get(request.surfaceId);
   if(!bound||!integer(request.generation)||request.generation<bound.generation)throw waterError('WATER_INPUT','The Water display identity is not current');
   bound.generation=request.generation;bound.full=true;return state(request.surfaceId,true,true,true);
  }
  if(op==='adoptDisplay'){
   const bound=displays.get(request.surfaceId),frame=bound?.pending;
   if(!frame||request.canvasGeneration!==frame.canvasGeneration||request.frame!==frame.frame||typeof request.accepted!=='boolean')return {};
   bound.pending=null;
   if(waterCapture.on)waterNote({ev:'adopt',surface:request.surfaceId,frame:frame.frame,accepted:request.accepted});
   if(request.accepted)bound.shown=frame;else bound.full=true;
   bound.gpu?._reservePresentation((bound.shown?.bytes||0)+(bound.producerBytes||0));
   return request.accepted||frame.generation!==bound.generation?displayState(request.surfaceId):{};
  }
  if(op==='create'){
   if(!integer(request.surfaceId)||surfaces.has(request.surfaceId))throw waterError('WATER_INPUT','The Water surface identity is not valid');
   const options=request.options||{},initial=request.waterMaterial;let surface;
   try{
    if(initial!==undefined&&(options.state||options.pixels||initial?.display!==undefined&&typeof initial.display!=='boolean'))throw waterError('WATER_INPUT','The Water material creation is not valid');
    surface=initial===undefined?new WaterSurface(request.width,request.height,options):await restoreMaterial(request.width,request.height,options,initial);
    await surface.ready;surfaces.set(request.surfaceId,surface);return await state(request.surfaceId,false,initial?.display!==false);
   }catch(error){if(surfaces.get(request.surfaceId)===surface)surfaces.delete(request.surfaceId);surface?.dispose();throw error;}
  }
  if(op==='brush'){
   if(!integer(request.brushId)||brushes.has(request.brushId))throw waterError('WATER_INPUT','The Water brush identity is not valid');brushes.set(request.brushId,new WaterBrush(request.definition));return {};
  }
  if(op==='batch'){
   if(!Array.isArray(request.commands))throw waterError('WATER_INPUT','The Water batch is not valid');
   const changed=new Set(request.include||[]),used=new Set(),lights=new Set(),values=[],replayWork=[];let done=0;
   for(const c of request.commands){const out=await command(c,changed,used,request.progress?async id=>{if(displayed.has(id)&&performance.now()-displayed.get(id)<32)return;const value={completed:0,surfaces:[await state(id)],values:[],replayWork:[],brushes:{}};sendValue(request.id,value,true);}:null,lights);if(out.surface){values.push(out.value);replayWork.push(null);}done++;completed++;}
   for(const id of request.include||[])if(checkpoints.get(id)?.error)throw checkpoints.get(id).error;
   const structural=request.commands.some(c=>c.target==='surface'&&['grow','clear','fromRGBA8','fromSnapshot','fromWaterMaterial','endStroke'].includes(c.method));
   const liveStroke=request.final!==true&&!structural&&request.commands.some(c=>c.target==='stroke');
   if(liveStroke&&!queued.size)await yieldWork();
   const now=performance.now();
   const states=[];for(const id of changed)states.push(await state(id,request.final===true,!(liveStroke&&displayed.has(id)&&now-displayed.get(id)<32&&nextRedraws(id))));
   for(const id of lights)if(!changed.has(id))states.push(await state(id,false,true,true));
   return {completed:done,surfaces:states,values,replayWork,brushes:Object.fromEntries([...used].map(id=>[id,{loadFuel:brushes.get(id).loadFuel}])),stats:{backend:'webgpu',commands:completed}};
  }
  if(op==='read'){
   const s=need(surfaces,request.surfaceId);
   if(checkpoints.get(request.surfaceId)?.error)throw checkpoints.get(request.surfaceId).error;
   if(request.observation===true){const result=await s.observe();return {...result,digest:result.pixels?await hash(result.pixels.data):null};}
   if(request.metadataOnly===true){await s._finishWetWork();const meta=metadata(s);return {box:meta.bounds,meta,stats:meta.stats,waterReplay:s.waterReplay()};}
   const box=request.bounds?s.bounds():request.box||null;
   if(request.sample)return {sample:await s.samplePigment(...request.sample),meta:metadata(s)};
   const pixels=request.bounds&&!box?null:await s.toRGBA8(box,true,request.quality==='live'?'live':'final'),meta=metadata(s),waterReplay=s.waterReplay();
   await capturePublication(s,request,waterReplay,box);
   return {pixels,box,digest:pixels&&request.verify!==false?await hash(pixels.data):null,meta,stats:meta.stats,waterReplay,...(request.snapshot||request.material?{waterState:await s.snapshot(box)}:{})};
  }
  if(op==='capture')return {rows:waterCapture.rows.slice()};
  if(op==='stats'){const s=need(surfaces,request.surfaceId),meta=metadata(s);return {...meta.stats,meta,commands:completed};}
  if(op==='footprint'){
   const b=new WaterBrush(request.definition);if(request.radius!=null)b.setBaseValue('radius_logarithmic',request.radius);b.setHead(request.held??null,false);const aspect=1;return {radius:b.radius*3,aspect,angle:request.held??0};
  }
  if(op==='sampleAgent')return sampleAgentPainting(request.shape,request.point,{...request.options,signal:jobs.get(request.id)?.signal});
  if(op==='agent')return paintAgentStrokes(request.strokes,request.seed,request.target,{...request.options,signal:jobs.get(request.id)?.signal,contribution:request.contribution??request.contributionId,recipe:request.recipe,mode:'water',actions:request.actions,paper:request.paper,picture:request.picture,waterSession:request.waterSession,waterAuthorized:request.waterAuthorized===true,onProgress:request.progress?value=>postMessage({id:request.id,progress:true,value}):undefined});
  if(op==='replayAgent')return replayAgentPainting(request.shape,request.omitIds,{...request.options,signal:jobs.get(request.id)?.signal,requireEmptyBase:request.requireEmptyBase===true,picture:request.picture,waterSession:request.waterSession,waterAuthorized:request.waterAuthorized===true});
  if(op==='replayCreate'){
   const frame=request.frame;if(!frame||!integer(request.surfaceId)||surfaces.has(request.surfaceId))throw waterError('WATER_INPUT','The Water replay frame is not valid');
   const run=await agentPaintReplayRun({mode:'water',paper:request.paper,actions:request.actions,strokes:request.strokes,px:[frame.w,frame.h],scale:request.scale,seed:request.seed,replay:request.replay});
   if(!run)throw waterError('WATER_INPUT','The Water replay cannot be restored');surfaces.set(request.surfaceId,run.surface);runs.set(request.surfaceId,run);return state(request.surfaceId);
  }
  if(op==='replay'){const run=need(runs,request.surfaceId),count=await run.run((stroke,point)=>stroke>request.stroke||stroke===request.stroke&&point>=request.point);return {count,done:run.done,surface:await state(request.surfaceId)};}
  if(op==='drop'){for(const id of request.surfaceIds||[]){dropDisplay(id);surfaces.get(id)?.dispose();surfaces.delete(id);checkpoints.delete(id);runs.delete(id);displayed.delete(id);}for(const id of request.brushIds||[])brushes.delete(id);return {};}
  throw waterError('WATER_INPUT','The Water operation is not valid');
 }
 const displayControl=request=>request.operation==='bindDisplay'||request.operation==='adoptDisplay';
 async function drainDisplays(){
  while(controls.length){const {request,resolve}=controls.shift();await run(request);resolve();}
 }
 async function delayMaterial(milliseconds){
  const until=performance.now()+milliseconds;
  while(true){
   await drainDisplays();
   const left=until-performance.now();if(left<=0)return;
   let timer;await new Promise(resolve=>{wakeDisplay=resolve;timer=setTimeout(resolve,left);});
   wakeDisplay=null;clearTimeout(timer);
  }
 }
 const run=async request=>{
   queued.delete(request);const id=request.id,control=displayControl(request),started=performance.now();
   try{
    if(jobs.get(id)?.signal.aborted)throw Object.assign(new Error('Water painting canceled'),{name:'AbortError',code:'WATER_CANCELLED'});
    const displayBefore=displayWork,value=await execute(request);
    const elapsed=performance.now()-started-(control?0:displayWork-displayBefore);
    if(waterTiming.on)waterTiming.busy=(waterTiming.busy||0)+elapsed;
    if(slowTest>1){const held=elapsed*(slowTest-1);if(control)await new Promise(resolve=>setTimeout(resolve,held));else await delayMaterial(held);}
    if(jobs.get(id)?.signal.aborted)throw Object.assign(new Error('Water painting canceled'),{name:'AbortError',code:'WATER_CANCELLED'});
    sendValue(id,value);
   }catch(error){
    if(!control&&request.operation!=='display'&&!(request.operation==='read'&&request.observation===true))for(const [sid,cp]of checkpoints){
     if(cp.error)continue;
     const s=surfaces.get(sid);try{if(s)await s.endStroke(cp.value,true);}catch(restoreError){if(['WATER_GPU_MEMORY','WATER_GPU_FAILED','WATER_DEVICE_LOST'].includes(restoreError.code)){restoreError.cause??=error;error=restoreError;}}restoreBrushes(cp,brushes);
     if(s)s._dirty={x0:0,y0:0,x1:s.width-1,y1:s.height-1};
     checkpoints.set(sid,{id:cp.id,error});
    }
    const reopen=['WATER_GPU_MEMORY','WATER_GPU_FAILED','WATER_DEVICE_LOST'].includes(error.code);
    if(reopen){for(const id of displays.keys())dropDisplay(id);for(const surface of surfaces.values())surface.dispose();surfaces.clear();brushes.clear();checkpoints.clear();runs.clear();displayed.clear();}
    postMessage({id,error:{name:error.name||'Error',code:error.code||'WATER_INPUT',message:String(error.message||error)},recoverable:!reopen&&error.recoverable!==false,...(reopen?lostCapture():{})});
   }finally{if(control)displayWork+=performance.now()-started;jobs.delete(id);}
 };
 const receive=request=>{
  if(request?.operation==='cancel'){jobs.get(request.requestId)?.abort();return Promise.resolve(true);}
  const id=request?.id;
  if(!integer(id)||id<=serial){postMessage({id,error:{name:'Error',code:'WATER_INPUT',message:'The Water request is out of order'},recoverable:true});return Promise.resolve();}
  serial=id;
  if(['agent','replayAgent','sampleAgent'].includes(request.operation))jobs.set(id,new AbortController());
  const surfaceId=request.surfaceId;
  const barrier=()=>[...queued].some(row=>row.surfaceId===surfaceId&&['create','replayCreate','bindDisplay','display'].includes(row.operation)||row.operation==='drop'&&row.surfaceIds?.includes(surfaceId));
  if(displayControl(request)&&displays.has(surfaceId)&&!barrier()){
   const done=new Promise(resolve=>controls.push({request,resolve}));
   wakeDisplay?.();
   chain=chain.then(drainDisplays,drainDisplays);return done;
  }
  queued.add(request);
  const next=async()=>{await drainDisplays();await run(request);await drainDisplays();};
  chain=chain.then(next,next);return chain;
 };
 receive.close=async()=>{closed=true;await Promise.resolve();for(const job of jobs.values())job.abort();await chain;for(const id of displays.keys())dropDisplay(id);for(const surface of surfaces.values())surface.dispose();surfaces.clear();brushes.clear();checkpoints.clear();runs.clear();displayed.clear();publications.clear();publicationBytes=0;};
 return receive;
}
export function createLocalWaterClient(){
 let client;const deliver=(fn,message,transfer=[])=>{const value=structuredClone(message,transfer.length?{transfer}:undefined);queueMicrotask(()=>fn(value));};
 const receive=createWaterWorker({postMessage:(m,t)=>deliver(value=>client.receive(value),m,t)});
 client=createWorkerClient({postMessage:(m,t)=>deliver(value=>receive(value),m,t),terminate:()=>receive.close()});return client;
}
export function installWaterWorker(scope=globalThis){if(typeof scope.document!=='undefined')throw new Error('Water needs a dedicated worker');const receive=createWaterWorker({postMessage:(m,t)=>scope.postMessage(m,t)});scope.onmessage=({data})=>receive(data);return ()=>receive.close();}
