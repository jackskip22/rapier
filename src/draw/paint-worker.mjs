// SPDX-License-Identifier: AGPL-3.0-only
import {PaintSurface, PaintBrush, paintStroke} from './paint.mjs';
import {PaintStrokeHistory, copyPaintState, snapshotPaintState} from './paint-history.mjs';
import {AgentPaintRun, admitAgentStrokes, prepareAgentPainting, prepareAgentLayerPainting, encodeAgentPainting, agentPaintReplayRun, replayAgentPainting, setPaintReplayGpu} from './agent-paint.mjs';
import {sha256Yielding} from '../notes/integrity.mjs';
import {createPaintRowPool, PAINT_SPLIT_PIXELS} from './paint-parallel.mjs';
import {createWorkerClient} from './worker-client.mjs';
import {_rapierDrawBuildSVG} from './core.mjs';
import {paperTile} from './paper-field.mjs';
import {openPaintDevice, GpuPaintSurface, writeCommit, paintGpuFits, warmPaintEngines} from './paint-gpu.mjs';
import './paint-gpu-flat.mjs';
import {installWetState, wetProgramsReady, wetBandsFor} from './paint-gpu-wet.mjs';
export {createWorkerClient};
const hash = data => sha256Yielding(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
const surfaceMethods = new Set(['clear','fromRGBA8','grow','tilt','settleWet','_finishWetWork','stepWet','composeWet','advanceWet']);
const brushMethods = new Set(['seed','setColor','setBaseValue','reset','newStroke','rebase','setHead']);
const properties = new Set(['paper','scale','toothOX','toothOY','wetPending']);
const idOf = id => { if(!Number.isSafeInteger(id)||id<1) throw new Error('Paint identity must be a positive integer'); return id; };
const need = (map,id) => { const value=map.get(idOf(id)); if(!value) throw new Error('Paint identity is not live'); return value; };
const PAINT_SLICE_MS = 12, PAINT_PREVIEW_MS = 120;
const paintAbort = () => Object.assign(new Error('The agent painting was canceled'), {name:'AbortError'});
const yieldPaint = () => new Promise(resolve => {
 const channel=new MessageChannel();
 channel.port1.onmessage=()=> { channel.port1.close(); channel.port2.close(); resolve(); };
 channel.port2.postMessage(null);
});
export function createPaintWorker({postMessage, spawnRows, isolated = false} = {}) {
 const surfaces=new Map(), brushes=new Map(), runs=new Map(), checkpoints=new Map();
 const agentJobs=new Map(), displays=new Map(), histories=new Map(), definitions=new Map(), historyBrushes=new Map(), resumedBrushes=new Map();
 const gpuSheets=new Map(); let gpuMode='off', gpuDevice=null, gpuTask=null;
 const gpuReady=(attempt=0)=>{ if(gpuMode==='off')return Promise.resolve(null); return gpuTask??=openPaintDevice({software:gpuMode==='software',timeoutMs:20000}).then(d=>{gpuDevice=d;setPaintReplayGpu(d);d.lost?.then(()=>{gpuDevice=null;setPaintReplayGpu(null);for(const g of gpuSheets.values())g.lost=true;});return d;},error=>{
  if(attempt>=3||gpuMode==='off'||['No WebGPU.','Only a software adapter.'].includes(error?.message))return null;
  return new Promise(r=>setTimeout(r,2000*(attempt+1))).then(()=>{gpuTask=null;return gpuReady(attempt+1);}); }); };
 const copyState=value=>{
  const out=copyPaintState(value);
  for(const brush of [...out.brushes.values(),...(out.resumed?[out.resumed.brush]:[])]) {
   brush.holdDab.adjust=color=>{const d=brush.holdDab;brush._colourDab(color,d.smudge,d.legacy,d.paint,d.linear);if(d.tint){color[0]*=d.tint.tr;color[1]*=d.tint.tg;color[2]*=d.tint.tb;}};
  }
  return out;
 };
 const historyFor=id=>{
  if(!histories.has(id))histories.set(id,new PaintStrokeHistory({
   capture:previous=>snapshotPaintState({surface:need(surfaces,id),brushes,definitions,brushId:historyBrushes.get(id),resumed:resumedBrushes.get(id)||null},previous),restore:copyState,canCapture:()=>!need(surfaces,id)._wetWork,
   apply:(state,c)=>{
    const s=state.surface,a=c.args||[];
    if(c.target==='read'){s.readCommitted(c.box);return;}
    if(c.target==='commit'){if(c.covered)throw new Error('The painting history checkpoint is no longer retained');if(s.wetFromGpu){s.wetState=null;s.wetWindow=null;s.wetRasterBase=null;s.wetCover=null;s.wetDeposited=null;s.wetTouched=null;s.wetPending=0;s.wetFromGpu=false;delete s.drawDab;}writeCommit(s,c);return;}
    if(c.target==='wash'){installWetState(s,c.snapshot);return;}
    if(c.target==='define'){state.brushes.set(c.id,c.restore?state.resumed.brush:new PaintBrush(c.definition));if(c.restore)state.resumed=null;state.definitions.set(c.id,c.definition);return;}
    if(c.target==='brush'){state.brushes.get(c.id)[c.method](...a);return;}
    if(c.target==='stroke'){state.brushes.get(c.brushId).strokeTo(s,...a);state.brushId=c.brushId;return;}
    if(c.method==='set')s[a[0]]=a[1];
    else if(c.method==='beginStroke')s.beginStroke();
    else if(c.method==='endStroke')s.endStroke(s.strokeCheckpoint,a[1]===true);
    else if(c.method==='dryWet'){let left=c.iterations;s.dryWet(Infinity,a[0]??8,a[1]??8,()=>left--<=0);}
    else s[c.method](...a);
   },
   read:({surface:s},point)=>{const box=point.before?s.bounds():point.box;return {box,pixels:box?s.readCommitted(box):null,meta:metaOf(s)};}
  }));
  return histories.get(id);
 };
 const wetMethods=new Set(['settleWet','_finishWetWork','stepWet','composeWet','advanceWet','dryWet','tilt']);
 function wetOnSheet(id,method,args){const g=gpuSheets.get(id);if(!g||g.lost||!(g.wetState||g.wetPending))return false;return wetMethods.has(method);}
 function sheetFor(id,surface){let sheet=gpuSheets.get(id);if(!sheet&&gpuDevice&&!gpuDevice.paintError&&paintGpuFits(gpuDevice,surface.width,surface.height)){sheet=new GpuPaintSurface(gpuDevice,surface);gpuSheets.set(id,sheet);warmPaintEngines(gpuDevice,surface);}return sheet;}
 async function settleSheet(id){
  const sheet=gpuSheets.get(id); if(!sheet?.stroke)return;
  let commit;
  try{commit=await sheet.settle();}
  catch(error){ if(error?.code!=='paint_gpu_lost')throw error; sheet.cancel(); gpuSheets.delete(id); return; }
  globalThis.rapierPaintGpuStrokes=(globalThis.rapierPaintGpuStrokes||0)+1;
  const h=histories.get(id); if(!commit||!h)return;
  const last=h.checkpoints.at(-1)?.at??-1;
  for(let i=0;i<h.commands.length;i++){const k=h.commands[i],at=h.offset+i;if(k.target!=='commit'||!k.tiles)continue;
   const next=h.strokes.find(st=>st.at>at)?.at; if(next===undefined)continue;
   if(h.checkpoints.some(cp=>cp.at>at&&cp.at<=next)){k.tiles=null;k.covered=true;}}
  const fresh=new Set((commit.tiles||[]).map(t=>t.x+','+t.y+','+t.w+','+t.h));
  const stepStart=Math.max(last,h.strokes.at(-1)?.at??0);
  for(let i=Math.max(0,stepStart-h.offset);i<h.commands.length;i++){const k=h.commands[i];if(k.target==='commit'&&k.tiles)k.tiles=k.tiles.filter(t=>!fresh.has(t.x+','+t.y+','+t.w+','+t.h));}
  h.commands.push({target:'commit',box:commit.box,tiles:commit.tiles});
 }
 let lastId=0, failed=null, pool=null, chain=Promise.resolve();
 const releaseDisplay=bound=>{if(bound){bound.canvas.width=bound.canvas.height=0;}};
 const dropDisplay=id=>{const bound=displays.get(id);if(bound){releaseDisplay(bound.previous);releaseDisplay(bound);displays.delete(id);}};
 const transfer = value => {
  const buffers=new Set();
  const walk=v=> { if(!v || typeof v!=='object') return; if(ArrayBuffer.isView(v)) { if(v.buffer instanceof ArrayBuffer) buffers.add(v.buffer); return; } for(const x of Object.values(v)) walk(x); };
  walk(value); return [...buffers];
 };
 async function state(id, full=false, final=false) {
  const surface=need(surfaces,id), bound=displays.get(id);
  const replace=bound?.submitted&&(bound.invalid||bound.width!==surface.width||bound.height!==surface.height||bound.toothOX!==surface.toothOX||bound.toothOY!==surface.toothOY);
  const unavailable=bound&&(bound.lost||replace)?{generation:bound.generation,canvasGeneration:bound.canvasGeneration,submitted:false,...(bound.lost?{lost:true}:{replace:true})}:null;
  if(unavailable&&!final)return {surfaceId:id,meta:metaOf(surface),patch:null,display:unavailable};
  const sheet=gpuSheets.get(id), live=sheet?.stroke&&!full&&!final;
  const box=live?sheet.takeDirty():surface.takeDirty();
  const change = (full || final) ? {x0:0,y0:0,x1:surface.width-1,y1:surface.height-1} : box && {x0:Math.max(0,box.x0-1),y0:Math.max(0,box.y0-1),x1:Math.min(surface.width-1,box.x1+1),y1:Math.min(surface.height-1,box.y1+1)};
  const shown = live && change ? await sheet.readDisplay(change) : null;
  const patch = change ? live ? shown && {...shown,box:change} : {...surface.toRGBA8(change,true,final ? 'final' : 'live'),box:change} : null;
  const result={surfaceId:id,meta:metaOf(surface),patch,...(final ? {digest:await hash(patch.data)} : {})};
  if(unavailable)return {...result,display:unavailable};
  if(bound){
   if(patch){const pixels=bound.context.createImageData(patch.width,patch.height);pixels.data.set(patch.data);bound.context.putImageData(pixels,patch.box.x0,patch.box.y0);}
   bound.submitted=true;
   if(!final)result.patch=null;
   result.display={generation:bound.generation,canvasGeneration:bound.canvasGeneration,submitted:!!patch,revision:surface.revision};
  }
  return result;
 }
 function metaOf(surface) {
  const sheet=[...gpuSheets].find(([id,g])=>surfaces.get(id)===surface&&!g.lost)?.[1]||null, wetSheet=sheet?.wetState?sheet:null;
  return {width:surface.width,height:surface.height,revision:surface.revision,bounds:surface.bounds(),growBox:surface.growBox,gpu:!!sheet,
   toothOX:surface.toothOX,toothOY:surface.toothOY,wetState:!!(surface.wetState||wetSheet),wet:!!(surface.wet||wetSheet?.wet),_wetWork:!!surface._wetWork,wetPending:(surface.wetPending||0)+(sheet?.wetPending||0),opStats:surface.opStats || null};
 }
 async function execute(request) {
  const {operation}=request;
  if(operation==='drawingSVG') {
   if(!request.recipe?.frame) throw new Error('A framed drawing is required');
   return _rapierDrawBuildSVG(request.recipe,undefined,true,request.renderOptions);
  }
  if(operation==='configure') {
   if(pool || surfaces.size) throw new Error('Configure the painter before opening a surface');
   pool=await createPaintRowPool({count:request.helpers || 0,threshold:request.threshold ?? PAINT_SPLIT_PIXELS,isolated,spawn:init=>spawnRows(init,request.helperSource)});
   gpuMode=['on','software'].includes(request.gpu)?request.gpu:'off';
   if(gpuMode!=='off')void gpuReady().then(()=>{globalThis.rapierPaintGpu={mode:gpuMode,device:!!gpuDevice,adapter:gpuDevice?.paintAdapter||null};for(const [id,surface]of surfaces)sheetFor(id,surface);});
   globalThis.rapierPaintGpu={mode:gpuMode,device:!!gpuDevice,adapter:gpuDevice?.paintAdapter||null};
   return {helpers:isolated ? request.helpers || 0 : 0};
  }
  if(operation==='create') {
   const id=idOf(request.surfaceId), {width,height}=request;
   if(surfaces.has(id)||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>12000000) throw new Error('Invalid paint surface');
   const surface=new PaintSurface(width,height,request.options); surfaces.set(id,surface); pool?.attach(surface);
   sheetFor(id,surface);
   return state(id);
  }
  if(operation==='brush') {
   const id=idOf(request.brushId);if(brushes.has(id))throw new Error('Brush identity already live');
   const held=resumedBrushes.get(request.historySurfaceId);resumedBrushes.delete(request.historySurfaceId);
   const restore=!!held&&JSON.stringify(held.definition)===JSON.stringify(request.definition),brush=restore?held.brush:new PaintBrush(request.definition);
   brushes.set(id,brush);definitions.set(id,structuredClone(request.definition));
   for(const [sid,h]of histories)if(surfaces.has(sid))h.record({target:'define',id,definition:request.definition,...(restore&&sid===request.historySurfaceId?{restore:true}:{})});return {};
  }
  if(operation==='bindDisplay') {
   const surface=need(surfaces,request.surfaceId), current=displays.get(request.surfaceId);
   if(!Number.isSafeInteger(request.generation)||request.generation<1||typeof request.canvas?.getContext!=='function'||current&&request.generation<=current.generation)throw new Error('Paint display identity is not current');
   const context=request.canvas.getContext('2d');if(!context)throw new Error('The painter could not open its display');
   const previous=current?.adopted?current:current?.previous;
   if(current&&!current.adopted)releaseDisplay(current);
   const bound={canvas:request.canvas,context,generation:request.generation,canvasGeneration:request.generation,width:surface.width,height:surface.height,toothOX:surface.toothOX,toothOY:surface.toothOY,submitted:false,adopted:false,previous};
   bound.canvas.width=surface.width;bound.canvas.height=surface.height;
   const notifyDisplay=async()=>{if(displays.get(request.surfaceId)===bound)postMessage({displayState:await state(request.surfaceId,true)});};
   bound.canvas.addEventListener?.('contextlost',()=>{if(displays.get(request.surfaceId)!==bound)return;bound.lost=true;chain=chain.then(notifyDisplay);});
   bound.canvas.addEventListener?.('contextrestored',()=>{if(displays.get(request.surfaceId)!==bound)return;bound.lost=false;chain=chain.then(notifyDisplay);});
   displays.set(request.surfaceId,bound);return state(request.surfaceId,true);
  }
  if(operation==='display') {
   const bound=need(displays,request.surfaceId);
   if(!Number.isSafeInteger(request.generation)||request.generation<bound.generation)throw new Error('Paint display identity is not current');
   bound.generation=request.generation;bound.invalid=true;return state(request.surfaceId,true);
  }
  if(operation==='adoptDisplay') {
   const bound=displays.get(request.surfaceId);
   if(bound?.canvasGeneration===request.canvasGeneration&&!bound.adopted){bound.adopted=true;releaseDisplay(bound.previous);bound.previous=null;}
   return {};
  }
  if(operation==='historyReplay'){const h=need(histories,request.surfaceId),point=request.point;const result=await h.replay(point.before&&point.at!=null?{...point,before:false}:point);return {...result,digest:result.pixels?await hash(result.pixels.data):null};}
  if(operation==='historyStats')return need(histories,request.surfaceId).stats();
  if(operation==='historyKeep'){
   const kept=new Map(request.keep.map(row=>[row.surfaceId,row.points]));
   for(const [id,h]of histories){const points=kept.get(id)||[];h.retained=!!points.length;if(!points.length&&!surfaces.has(id)){histories.delete(id);continue;}const at=points.map(p=>h.resolve(p)).filter(Number.isFinite);if(at.length)h.trim(Math.min(...at));}
   return {};
  }
  if(operation==='batch') {
   if(!Array.isArray(request.commands)||request.commands.length>32768) throw new Error('Invalid paint batch');
   const changed=new Map(), used=new Set();
   let values=[], replayWork=[], completed=0, turn=performance.now(), shown=turn-PAINT_PREVIEW_MS;
   const reply = async (final, render = true) => ({completed,surfaces:await Promise.all([...changed].map(([id,full])=>render ? state(id,full,final) : {surfaceId:id,meta:metaOf(need(surfaces,id)),patch:null,materialOnly:true})),values,replayWork,
    brushes:Object.fromEntries([...used].map(id=>[id,{loadFuel:brushes.get(id)?.loadFuel ?? null}])),stats:pool?.stats || null});
   const apply = async c => {
    const args=c.args || [];
    if(c.target==='brush') { if(!brushMethods.has(c.method)) throw new Error('Unknown brush command'); need(brushes,c.id)[c.method](...args); for(const [id,h]of histories)if(surfaces.has(id))h.record(c); return; }
    if(c.target==='stroke') {
     if(args.length<3||args.length>11||args.some((v,i)=> i<10 ? !Number.isFinite(v) : typeof v!=='boolean')) throw new Error('Invalid input sample');
     const surface=need(surfaces,c.surfaceId), brush=need(brushes,c.brushId), sheet=gpuSheets.get(c.surfaceId);
     const onGpu=!!sheet&&!sheet.lost&&checkpoints.get(c.surfaceId)?.gpu===true&&(brush.gpuCapable||brush.gpuWetCapable&&!surface.wetState&&wetProgramsReady(sheet.device,wetBandsFor(surface)))&&!(brush.op==='posterize'&&(surface.volume||surface.oil));
     if(!onGpu&&sheet?.wetState){sheet.attach(surface);sheet.open();sheet.settleWet();await settleSheet(c.surfaceId);}
     if(onGpu&&surface.wetState&&!brush.wetStroke){surface.settleWet();histories.get(c.surfaceId)?.record({target:'surface',id:c.surfaceId,method:'settleWet',args:[]});}
     let onGpuNow=onGpu;
     if(onGpu){try{sheet.attach(surface);sheet.open();}catch(error){if(error?.code!=='paint_gpu_lost')throw error;sheet.lost=true;onGpuNow=false;}}
     else if(sheet?.stroke)await settleSheet(c.surfaceId);
     brush.strokeTo(onGpuNow?sheet:surface,...args); changed.set(c.surfaceId,changed.get(c.surfaceId)||false); used.add(c.brushId);historyBrushes.set(c.surfaceId,c.brushId); if(!onGpuNow)histories.get(c.surfaceId)?.record(c); return;
    }
    if(c.target!=='surface') throw new Error('Unknown paint command target');
    if(gpuSheets.get(c.id)?.stroke&&!['endStroke','set'].includes(c.method))await settleSheet(c.id);
    {const ws=gpuSheets.get(c.id); if(ws?.wetState){
     if(['fromHistory','clear'].includes(c.method))ws.discardWet();
     else if(c.method==='fromRGBA8'){ws.attach(need(surfaces,c.id));ws.open();ws.settleWet();await settleSheet(c.id);}
     else if(c.method==='grow')ws._wetEngine.shift(Math.max(0,Math.ceil(args[0]||0)),Math.max(0,Math.ceil(args[1]||0)));
    }}
    const surface=need(surfaces,c.id); let full=changed.get(c.id)||false, value, recorded=null;
    if(c.method==='historyStart'){await historyFor(c.id).begin(args[0],c.history);values.push(null);replayWork.push(null);return;}
    if(c.method==='set') { if(!properties.has(args[0])) throw new Error('Unknown paint property'); surface[args[0]]=args[1]; }
    else if(c.method==='fromHistory') {const restored=await need(histories,args[0]).material(args[1]);pool?.detach(surface);surfaces.set(c.id,restored.surface);pool?.attach(restored.surface);gpuSheets.get(c.id)?.attach(restored.surface);restored.surface.revision=Math.max(restored.surface.revision,surface.revision+1);const held=restored.resumed||(restored.brushId!=null?{brush:restored.brushes.get(restored.brushId),definition:restored.definitions.get(restored.brushId)}:null);if(held)resumedBrushes.set(c.id,held);value=metaOf(restored.surface);full=true;}
    else if(c.method==='beginStroke') {
     if(checkpoints.has(c.id))throw new Error('Stroke already open');
     if(surface._wetWork){surface._finishWetWork();histories.get(c.id)?.record({target:'surface',id:c.id,method:'_finishWetWork',args:[]});}
     {const ws=gpuSheets.get(c.id); if(ws?.wetState&&!ws.lost){const snap=await ws._wetEngine.snapshot(); if(snap){
      if(c.history&&histories.has(c.id))histories.get(c.id).record({target:'wash',snapshot:snap});
      installWetState(surface,snap,false); ws.discardWet();
     }}}
     if(c.history)await historyFor(c.id).begin(args[0],c.history);
     checkpoints.set(c.id,{id:args[0],value:surface.beginStroke(),gpu:c.gpu===true});
    }
    else if(c.method==='endStroke') { const cp=checkpoints.get(c.id); if(!cp||cp.id!==args[0]) throw new Error('Stroke checkpoint does not match');
     const sheet=gpuSheets.get(c.id); if(sheet?.stroke){ if(args[1]===true){sheet.cancel();sheet.discardWet();} else await settleSheet(c.id); } value=surface.endStroke(cp.value,args[1]===true); checkpoints.delete(c.id); full=args[1]===true; }
    else if(wetOnSheet(c.id,c.method)) {
     const sheet=gpuSheets.get(c.id); sheet.attach(surface); sheet.open();
     try{value=c.method==='_finishWetWork'?undefined:await sheet[c.method](...args);}
     finally{await settleSheet(c.id);}
     const work=c.method==='dryWet'&&c.record===true?(sheet._wetEngine?.work||[]).map(([method,a])=>({target:'surface',id:c.id,method,args:a})):null;
     values.push(value); replayWork.push(work); changed.set(c.id,full); return;
    }
    else if(c.method==='dryWet') {
     if(c.record===true){recorded=[];surface.recordWetWork=(method,args)=>recorded.push({target:'surface',id:c.id,method,args});}
     try {value=surface.dryWet(performance.now()+8,args[0]??8,args[1]??8);}
     finally {surface.recordWetWork=null;}
     if(histories.has(c.id))c={...c,iterations:surface.dryIterations};
    }
    else { if(!surfaceMethods.has(c.method)) throw new Error('Unknown surface command'); value=surface[c.method](...args); if(c.method==='grow') full=true; }
    if(c.method==='endStroke'&&args[1]===true){if(!c.keepHistory)await histories.get(c.id)?.cancel(args[0]);}
    else histories.get(c.id)?.record(c);
    values.push(value); replayWork.push(recorded); changed.set(c.id,full);
   };
   for(const c of request.commands) {
    await apply(c); completed++;
    if(request.progress===true && completed<request.commands.length && performance.now()-turn>=PAINT_SLICE_MS) {
     if(performance.now()-shown>=PAINT_PREVIEW_MS) {
      const value=await reply(false); postMessage({id:request.id,progress:true,value},transfer(value));
      values=[]; replayWork=[]; for(const id of changed.keys()) changed.set(id,false);
      shown=performance.now();
     }
     await yieldPaint(); turn=performance.now();
    }
   }
   for(const id of request.include || []) if(!changed.has(id)) changed.set(id,false);
   return reply(request.final===true,request.final===true || request.materialOnly!==true || request.commands.length!==0);
  }
  if(operation==='read') {
   if(gpuSheets.get(request.surfaceId)?.stroke)await settleSheet(request.surfaceId);
   if(request.observation===true) {
    const result=need(surfaces,request.surfaceId).observe();
    return {...result,digest:result.pixels ? await hash(result.pixels.data) : null};
   }
   const surface=need(surfaces,request.surfaceId), box=request.bounds ? surface.bounds() : request.box || null;
   const quality=request.quality==='live' ? 'live' : 'final', read=quality==='final' ? b=>{const p=surface.readCommitted(b);return {width:p.width,height:p.height,data:p.data.slice()};} : b=>surface.toRGBA8(b,true,quality);
   const pixels=request.bounds && !box ? null : read(box || undefined);
   if(pixels)histories.get(request.surfaceId)?.record({target:'read',box:box||{x0:0,y0:0,x1:surface.width-1,y1:surface.height-1}});
   return {pixels,box,history:await histories.get(request.surfaceId)?.mark(box,{pixels,meta:metaOf(surface)}),digest:pixels && request.verify !== false ? await hash(pixels.data) : null,meta:metaOf(surface),...(request.material ? {material:new Float32Array(surface.data),volume:surface.volume ? new Uint8Array(surface.volume) : null,oil:surface.oil ? new Uint16Array(surface.oil) : null} : {})};
  }
  if(operation==='agent') {
   const signal=agentJobs.get(request.id)?.signal;
   const alive=()=> {if(signal?.aborted)throw paintAbort();};
   alive();
   const prepared=request.target
    ? await prepareAgentLayerPainting(request.strokes,request.target,request.seed,{contribution:request.contribution,signal,picture:request.picture})
    : prepareAgentPainting(request.strokes,request.seed,{contribution:request.contribution,signal,picture:request.picture});
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
   const value=await replayAgentPainting(request.shape,request.omitIds,{signal,requireEmptyBase:request.requireEmptyBase===true,picture:request.picture,
    onProgress:request.progress===true?value=>postMessage({id:request.id,progress:true,value}):undefined});
   if(signal?.aborted)throw paintAbort();
   return value;
  }
  if(operation==='footprint') {
   const brush=new PaintBrush(request.definition); brush.setBaseValue('radius_logarithmic',request.radius); brush.setHead(request.held,false);
   return brush.footprint(false);
  }
  if(operation==='preview') {
   if(!Number.isSafeInteger(request.width)||!Number.isSafeInteger(request.height)||request.width<1||request.height<1||request.width*request.height>12000000) throw new Error('Invalid preview surface');
   const surface=new PaintSurface(request.width,request.height,{wet:request.wet || {}}); pool?.attach(surface);
   try {
    if(request.initial) surface.fromRGBA8(request.initial.data,request.initial.width,request.initial.height,0,0);
    paintStroke(surface,new PaintBrush(request.definition),request.points,request.options);
    if(request.settle && surface.wetState) { surface.wetPending=0; surface.settleWet(); }
    return surface.toRGBA8();
   }
   finally { pool?.detach(surface); }
  }
  if(operation==='paperTile') {
   const tile=await paperTile(request.paper,{density:request.density,strength:request.strength});
   return tile&&{width:tile.width,height:tile.height,paper:tile.paper,rgb:tile.rgb,strength:tile.strength};
  }
  if(operation==='drop') { for(const id of request.surfaceIds||[]) { const surface=surfaces.get(id); if(surface) pool?.detach(surface); dropDisplay(id); gpuSheets.get(id)?.destroy(); gpuSheets.delete(id); surfaces.delete(id); checkpoints.delete(id); runs.delete(id);historyBrushes.delete(id);resumedBrushes.delete(id); if(!histories.get(id)?.retained)histories.delete(id); } for(const id of request.brushIds||[]){brushes.delete(id);definitions.delete(id);} return {}; }
  throw new Error('Unknown paint operation');
 }
 const receive = request => {
  if(request?.operation==='cancel') {
   const job=agentJobs.get(request.requestId);
   if(job)job.abort();
   return Promise.resolve(!!job);
  }
  if(['agent','replayAgent'].includes(request?.operation)&&Number.isSafeInteger(request.id)&&request.id>0&&!agentJobs.has(request.id))agentJobs.set(request.id,new AbortController());
  const run=async()=> {
   const id=request?.id;
   let observing=false;
   try {
    if(failed) throw failed;
    if(!Number.isSafeInteger(id)||id<=lastId) throw new Error('Paint request is out of order');
    lastId=id;
    observing=request.operation==='read'&&request.observation===true;
    const value=await execute(request); postMessage({id,value},transfer(value));
   } catch(error) {
    const cancelled=error.name==='AbortError'&&agentJobs.get(id)?.signal.aborted;
    const recoverable=observing||cancelled||request.operation==='drawingSVG'||error.code==='paint_history_full';
    if(!recoverable)failed=error;
    postMessage({id,error:{name:error.name,message:String(error.message||error),...(typeof error.code==='string'?{code:error.code}:{})},...(recoverable?{recoverable:true}:{})});
   } finally {agentJobs.delete(id);}
  };
  chain=chain.then(run); return chain;
 };
 receive.close=async()=>{failed=paintAbort();for(const job of agentJobs.values())job.abort();await chain;await pool?.close();for(const id of displays.keys())dropDisplay(id);surfaces.clear();brushes.clear();runs.clear();checkpoints.clear();histories.clear();definitions.clear();historyBrushes.clear();resumedBrushes.clear();};
 return receive;
}

export function createLocalPaintClient() {
 let client=null;
 const deliver=(target,message,transfer=[])=> { const copy=structuredClone(message,transfer.length ? {transfer} : undefined); queueMicrotask(()=>target(copy)); };
 const receive=createPaintWorker({isolated:false,postMessage:(message,transfer)=>deliver(reply=>client.receive(reply),message,transfer)});
 client=createWorkerClient({postMessage:(message,transfer)=>deliver(request=>{ void receive(request); },message,transfer)});
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
 return () => receive.close();
}
