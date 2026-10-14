// SPDX-License-Identifier: AGPL-3.0-only
import {waterShaderSources} from './water-shaders.mjs';
import {getPaper,makeTip,getBrush,WATER_TIP_SIZE} from './water-materials.mjs';
import {waterTimeFits} from './water-data.mjs';
import {WATER_FINISH_LIGHT,waterFinishLight,admitWaterFinish} from './water-specialty.mjs';

export const WATER_GPU_MAX_BYTES=384*1024*1024;
const UNIFORM_SLOTS=2048,UNIFORM_BYTES=64*UNIFORM_SLOTS*4;
function sheetLayout(w,h){
 const aspect=w/h,sw=aspect>=1?Math.round(256*aspect):256,sh=aspect>=1?256:Math.round(256/aspect);
 return {sw,sh,bytes:w*h*64+sw*sh*16+Math.ceil(w/16)*Math.ceil(h/16)*4};
}
export function waterHandSheetFits(w,h,growth,tip=null,maxBytes=WATER_GPU_MAX_BYTES){
 if(![w,h,growth].every(Number.isSafeInteger)||w<1||h<1||growth<0)return false;
 const W=w+growth,H=h+growth,old=sheetLayout(w,h),next=growth?sheetLayout(W,H):{bytes:0};
 const tipBytes=tip?tip.width*tip.height:WATER_TIP_SIZE*WATER_TIP_SIZE;
 const rollback=w*h*38+old.sw*old.sh*6;
 const scratch=Math.max(W*H*8,Math.ceil(W*8/256)*256*H);
 const pigmentWork=Math.ceil(W/16)*Math.ceil(H/16)*4+12;
 const presentation=w*h*4+W*H*8;
 return UNIFORM_BYTES+4+tipBytes+old.bytes+rollback+next.bytes+scratch+pigmentWork+presentation<=maxBytes;
}

const bytesPerPixel={r16float:2,rg16float:4,rg32float:8,rgba16float:8,rgba8unorm:4,r8unorm:1};
const FULL=GPU=>GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST;
const union=(a,b)=>a?[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])]:b.slice();
const failure=(code,message)=>Object.assign(new Error(message),{code,recoverable:true});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const WATER_IDLE_SECONDS=1;
const PAPER_BAND_PIXELS=196608;
const PAPER_CACHE_BYTES=16*1024*1024;
export const WATER_REFERENCE_TEXEL=1100/900;
const linearHex=hex=>[1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
let deviceTask=null,deviceOwner=null;
const libraries=new WeakMap();
const paperCaches=new WeakMap();
function trimPaperCache(cache,limit){
 while(cache.bytes>limit&&cache.entries.size){const [key,entry]=cache.entries.entries().next().value;cache.entries.delete(key);cache.bytes-=entry.bytes;entry.texture.destroy();}
}
function paperCache(device){
 let cache=paperCaches.get(device);if(cache)return cache;
 cache={entries:new Map(),bytes:0};paperCaches.set(device,cache);
 device.lost.then(()=>trimPaperCache(cache,0));return cache;
}
function paperKey(target,settings){return JSON.stringify([target.w,target.h,settings.id,getPaper(settings.id)?.params,settings.paperScale,settings.seed,...settings.paperOrigin]);}
function uncoveredPaper(rect,kept){
 const x0=Math.max(rect[0],kept[0]),y0=Math.max(rect[1],kept[1]),x1=Math.min(rect[2],kept[2]),y1=Math.min(rect[3],kept[3]);
 if(x1<=x0||y1<=y0)return [rect];
 return [[rect[0],rect[1],rect[2],y0],[rect[0],y1,rect[2],rect[3]],[rect[0],y0,x0,y1],[x1,y0,rect[2],y1]].filter(r=>r[2]>r[0]&&r[3]>r[1]);
}
function keepPaperRegion(regions,rect){
 for(let i=0;i<regions.length;){
  const r=regions[i],horizontal=r[1]===rect[1]&&r[3]===rect[3]&&(r[2]===rect[0]||r[0]===rect[2]),vertical=r[0]===rect[0]&&r[2]===rect[2]&&(r[3]===rect[1]||r[1]===rect[3]);
  if(horizontal||vertical){rect=union(rect,r);regions.splice(i,1);i=0;}else i++;
 }
 regions.push(rect);
}
const watchLoss=(device,reference)=>device.lost.then(info=>{const surface=reference.deref();if(surface)surface.lost=info;});
const watchErrors=reference=>event=>{reference.deref()?._poison(event.error);};

let unfilteredTest=false;
export function waterUnfilteredTest(on){if(on===unfilteredTest)return;unfilteredTest=on;deviceTask=null;}
export const waterTiming={on:false,presents:0,gpu:0,gpuFrames:0,stamp:0,stampBuffers:0,stampSkipped:0};
export function waterTimingOn(on){if(on===waterTiming.on)return;waterTiming.on=on;deviceTask=null;}
export async function waterReady(){
 const owner=globalThis.navigator?.gpu;
 if(!owner)throw failure('water_webgpu_unavailable','Water needs WebGPU. Open this document in a browser with WebGPU enabled.');
 if(owner!==deviceOwner){deviceOwner=owner;deviceTask=null;}
 if(!deviceTask)deviceTask=(async()=>{
  const adapter=await owner.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw failure('water_webgpu_unavailable','Water could not obtain a WebGPU adapter. Enable GPU acceleration and reopen the document.');
  const features=['float32-filterable','float32-blendable',...(waterTiming.on?['timestamp-query']:[])].filter(name=>adapter.features.has(name)&&!(unfilteredTest&&name==='float32-filterable'));
  const device=await adapter.requestDevice(features.length?{requiredFeatures:features}:{});
  device.lost.then(()=>{deviceTask=null;});return device;
 })().catch(error=>{deviceTask=null;throw error?.code?error:failure('water_webgpu_unavailable','Water could not start WebGPU: '+error.message);});
 return deviceTask;
}

async function programLibrary(device,firstPaper){
 if(libraries.has(device))return libraries.get(device);
 const task=(async()=>{
  const bindingEntries=(firstSampleType,visibility=GPUShaderStage.FRAGMENT)=>[
   {binding:0,visibility,buffer:{type:'uniform',hasDynamicOffset:true,minBindingSize:256}},
   {binding:1,visibility,sampler:{type:'filtering'}},{binding:2,visibility,sampler:{type:'non-filtering'}},
   ...Array.from({length:8},(_,i)=>({binding:i+3,visibility,texture:{sampleType:i?'float':firstSampleType}}))
  ];
  const layout=device.createBindGroupLayout({entries:bindingEntries('float')});
  const fillLayout=device.createBindGroupLayout({entries:bindingEntries('unfilterable-float')});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const fillPipelineLayout=device.createPipelineLayout({bindGroupLayouts:[fillLayout]});
  const compute=GPUShaderStage.COMPUTE,computeEntries=bindingEntries('float',compute);
  const tileLayout=device.createBindGroupLayout({entries:[...computeEntries,
   {binding:11,visibility:compute,buffer:{type:'storage'}},{binding:12,visibility:compute,buffer:{type:'storage'}}]});
  const pigmentLayout=device.createBindGroupLayout({entries:[...computeEntries,
   {binding:11,visibility:compute,buffer:{type:'read-only-storage'}},
   ...[12,13].map(binding=>({binding,visibility:compute,storageTexture:{access:'write-only',format:'rgba16float'}}))]});
  const displayLayout=device.createBindGroupLayout({entries:[...computeEntries,{binding:11,visibility:compute,storageTexture:{access:'write-only',format:'rgba8unorm'}}]});
  const linear=device.createSampler({minFilter:'linear',magFilter:'linear'}),nearest=device.createSampler();
  const descriptions={stampInk:['rgba16float','rgba16float','add'],stampWet:['r16float','max'],splatInk:['rgba16float','rgba16float','add'],
   velocitySplat:['rg16float','add'],wetSplat:['r16float','max'],fillInk:['rgba16float','rgba16float','add'],fillWet:['r16float','max'],liftInk:['rgba16float','rgba16float','lift'],liftWet:['r16float','lift'],
   eraseFixed:['rgba16float','rgba16float','lift'],eraseBase:['rgba8unorm','lift','alpha'],
   stampFinish:['rgba16float','add'],fillFinish:['rgba16float','add'],liftFinish:['rgba16float','lift'],
   velocity:['rg16float'],curl:['r16float'],vorticity:['rg16float'],divergence:['r16float'],pressureDecay:['r16float'],pressure:['r16float'],project:['rg16float'],
   wet:['r16float'],bleach:['rgba16float','rgba16float','multiply'],fix:['rgba16float','rgba16float','add'],
   mask:['rgba8unorm'],paperField:['rgba16float'],paperLight:['rgba8unorm'],present:['rgba8unorm']};
  const blend={add:{srcFactor:'one',dstFactor:'one',operation:'add'},max:{srcFactor:'one',dstFactor:'one',operation:'max'},
   lift:{srcFactor:'zero',dstFactor:'one-minus-src',operation:'add'},multiply:{srcFactor:'zero',dstFactor:'src',operation:'add'}};
  const modules=new Map(),pipelines={},loadOps={};let paperDescription;
  const sources=waterShaderSources(!device.features.has('float32-filterable'));
  for(const [name,source] of Object.entries(sources))modules.set(name,device.createShaderModule({label:'Water '+name,code:source}));
  const compile=await Promise.allSettled(Object.entries(descriptions).map(async([name,settings])=>{
   const kind=name==='paperField'?firstPaper:null;
   const alphaOnly=settings.at(-1)==='alpha',blendSettings=alphaOnly?settings.slice(0,-1):settings;
   const mode=blend[blendSettings.at(-1)]?blendSettings.at(-1):null;
   const formats=mode?blendSettings.slice(0,-1):blendSettings;
   loadOps[name]=mode||alphaOnly?'load':'clear';
   const module=modules.get(name==='velocitySplat'||name==='wetSplat'?'splat':name==='eraseFixed'?'liftInk':name==='eraseBase'||name==='liftFinish'?'liftWet':name);
   const description={label:'Water '+name,layout:name.startsWith('fill')?fillPipelineLayout:pipelineLayout,vertex:{module,entryPoint:'vertex'},
    fragment:{module,entryPoint:'fragment',...(kind===null?{}:{constants:{paperKind:kind}}),targets:formats.map(format=>({format,...(mode?{blend:{color:blend[mode],alpha:blend[mode]}}:{}),...(alphaOnly?{writeMask:8}:{})}))},primitive:{topology:'triangle-list'}};
   if(name==='paperField')paperDescription=description;
   const pipeline=await device.createRenderPipelineAsync(description);
   if(kind===null)pipelines[name]=pipeline;else (pipelines[name]??=[])[kind]=pipeline;
  }));
  const bad=compile.find(r=>r.status==='rejected');if(bad)throw bad.reason;
  await Promise.all([['pigmentTiles',tileLayout],['pigmentCompute',pigmentLayout],['displayCompute',displayLayout]].map(async([name,bindLayout])=>{
   pipelines[name]=await device.createComputePipelineAsync({label:'Water '+name,layout:device.createPipelineLayout({bindGroupLayouts:[bindLayout]}),compute:{module:modules.get(name),entryPoint:'compute'}});
  }));
  return {layout,fillLayout,tileLayout,pigmentLayout,displayLayout,linear,nearest,pipelines,loadOps,paperDescription};
 })();
 libraries.set(device,task);try{return await task;}catch(error){libraries.delete(device);throw error;}
}

export class WaterGPU {
 constructor(width,height,options={}){
  this.width=width;this.height=height;this.maxBytes=options.maxBytes??WATER_GPU_MAX_BYTES;
  this.paperId=options.paper??'cold-press';this.seed=options.seed??1;this.paperScale=options.paperScale??1100/height;
  this.paperOrigin=options.paperOrigin?.slice()??[0,0];this.texelScale=options.texelScale??null;
  this.params={flow:.45,bleed:.5,dry:.4,edge:.5,granulation:.45,...options.params};this.finish=null;this.light=WATER_FINISH_LIGHT.slice();this.lightDirty=false;
  this.active=null;this.dirty=null;this.painted=null;this.wetPeak=0;this.fixTimer=0;this.elapsed=0;this.lastWet=0;this.awakeUntil=0;
  this.flowSpeed=0;this.flowMayMove=false;this.growCarry=0;this.frame=0;this.brushNow=[0,0,0];this.bytes=0;this.presentationBytes=0;this.transaction=null;this.lost=null;this.disposed=false;
  this.tips=new Map();this.targets=new Set();this.buffers=new Map();this.bindings=new Map();this.targetSequence=0;this.fill=null;
  this.pendingErrors=new Set();this.gpuError=null;this.errorListener=null;this.simBox=null;this.painting=false;this._scratch=new Float32Array(64);
  this.pendingRetire=[];this.encoder=null;this.slots=0;this.uniformData=new Float32Array(UNIFORM_BYTES/4);
  this.queued=new Map();this.scratch=new Map();this.inFlight=[];this.maskRead=null;this.trimEpoch=0;this.recovery=null;
  this.ready=this._initialize(options.device);
 }
 async _initialize(given){
  try{
   this.device=given??await waterReady();this._check();const reference=new WeakRef(this);watchLoss(this.device,reference);
   this.errorListener=watchErrors(reference);this.device.addEventListener('uncapturederror',this.errorListener);
   this.library=await programLibrary(this.device,getPaper(this.paperId)?.params?.kind??0);this._check();
   this.uniforms=this._buffer(this.uniformData.byteLength,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
   this.dummy=this._texture(1,1,'rgba8unorm');
   this._allocate(this.width,this.height);this._paper();await this._settleErrors();return this;
  }catch(error){this.encoder=null;this.slots=0;this.pendingRetire=[];this._release(false);this.disposed=true;throw error;}
 }
 _check(){if(this.disposed)throw failure('WATER_CLOSED','The Water surface is closed.');if(this.lost)throw failure('WATER_DEVICE_LOST','The GPU stopped. The last published painting is safe; reopen Water to continue.');if(this.gpuError)throw this.gpuError;}
 _poison(error,kind){
  if(this.disposed||this.gpuError)return;
  const memory=kind==='out-of-memory'||error?.constructor?.name==='GPUOutOfMemoryError';
  this.gpuError=failure(memory?'WATER_GPU_MEMORY':'WATER_GPU_FAILED',memory?
   'Water ran out of GPU memory. The last published painting is safe; reopen Water on a smaller layer.':
   'The GPU could not complete the Water edit. The last published painting is safe; reopen Water to continue.');
  this.gpuError.cause=error;
 }
 _watchError(task,kind){
  const pending=this.pendingErrors,reference=new WeakRef(this);let settled;
  const finish=(error,filter)=>{if(error)reference.deref()?._poison(error,filter);pending.delete(settled);};
  settled=Promise.resolve(task).then(error=>finish(error,kind),error=>finish(error));pending.add(settled);
 }
 _guard(action){
  let scopes=0;
  try{
   this.device.pushErrorScope('out-of-memory');scopes++;
   this.device.pushErrorScope('validation');scopes++;
   return action();
  }catch(error){this._poison(error);throw this.gpuError??error;}
  finally{while(scopes){const kind=scopes--===2?'validation':'out-of-memory';try{this._watchError(this.device.popErrorScope(),kind);}catch(error){this._poison(error);}}}
 }
 async _settleErrors(){while(this.pendingErrors.size)await Promise.all([...this.pendingErrors]);this._check();}
 _reclaimScratch(bytes,credit=0){
  if(this.bytes+bytes-credit>this.maxBytes){this._dropScratch();this._submitEncoder();}
 }
 _reserve(bytes,keepScratch=false){
  const cache=paperCaches.get(this.device);if(cache)trimPaperCache(cache,Math.max(0,this.maxBytes-this.bytes-bytes));
  if(!keepScratch)this._reclaimScratch(bytes);
  if(this.bytes+bytes>this.maxBytes)throw failure('WATER_BUDGET','Water cannot keep this whole edit in GPU memory. Use a new or smaller layer.');
 }
 _reservePresentation(bytes){
  const delta=bytes-this.presentationBytes;
  if(delta>0){this._check();this._reserve(delta);}
  this.presentationBytes=bytes;this.bytes+=delta;
 }
 _dimensions(w,h){
  if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w>this.device.limits.maxTextureDimension2D||h>this.device.limits.maxTextureDimension2D)throw failure('WATER_BUDGET','This Water sheet exceeds the GPU texture dimensions. Use a smaller layer.');
 }
 _texture(w,h,format,usage,keepScratch=false){
  this._check();this._dimensions(w,h);
  const bytes=w*h*bytesPerPixel[format];this._reserve(bytes,keepScratch);
  const target=this._guard(()=>{
   const texture=this.device.createTexture({label:'Water '+format,size:[w,h],format,usage:usage??FULL()});
   try{return {texture,view:texture.createView(),w,h,format,bytes,id:++this.targetSequence,written:null};}catch(error){texture.destroy();throw error;}
  });
  this.targets.add(target);this.bytes+=bytes;return target;
 }
 _drop(t,keepPaper=true){
  if(!t||t.dead)return;t.dead=true;this.targets.delete(t);this.bytes-=t.bytes;this.bindings.clear();
  if(keepPaper&&t.field?.regions.length&&!this.gpuError&&!this.lost&&!this.pendingErrors.size&&t.bytes<=PAPER_CACHE_BYTES){
   const cache=paperCache(this.device),key=paperKey(t,t.field),old=cache.entries.get(key);
   if(old){cache.entries.delete(key);cache.bytes-=old.bytes;old.texture.destroy();}
   trimPaperCache(cache,Math.max(0,Math.min(PAPER_CACHE_BYTES,this.maxBytes-this.bytes)-t.bytes));
   if(this.bytes+cache.bytes+t.bytes<=this.maxBytes){cache.entries.set(key,{texture:t.texture,view:t.view,field:t.field,written:t.written,bytes:t.bytes});cache.bytes+=t.bytes;return;}
  }
  t.texture.destroy();
 }
 _buffer(size,usage){
  this._check();
  if(size>this.device.limits.maxBufferSize)throw failure('WATER_BUDGET','The Water transfer exceeds the GPU buffer size.');
  this._reserve(size);const buffer=this._guard(()=>this.device.createBuffer({size,usage}));this.buffers.set(buffer,size);this.bytes+=size;return buffer;
 }
 _dropBuffer(buffer){const bytes=this.buffers.get(buffer);if(bytes===undefined)return;this.buffers.delete(buffer);this.bytes-=bytes;buffer.destroy();}
 _release(keepPaper=true){
  this._reservePresentation(0);
  if(this.errorListener)this.device.removeEventListener('uncapturederror',this.errorListener);this.errorListener=null;
  for(const t of this.targets)this._drop(t,keepPaper);for(const buffer of this.buffers.keys())this._dropBuffer(buffer);
  this.pendingErrors.clear();this.tips.clear();this.bindings.clear();this.uniformData=new Float32Array(0);this.pendingRetire=[];
  this.uniforms=null;this.library=null;this.encoder=null;this.slots=0;this.pigmentWork=null;this.recovery=null;
 }
 _pair(w,h,formats,make=(...args)=>this._texture(...args),storage=false){const usage=storage?FULL()|GPUTextureUsage.STORAGE_BINDING:undefined;return {read:formats.map(f=>make(w,h,f,usage)),write:formats.map(f=>make(w,h,f,usage))};}
 _allocate(w,h,withFinish=!!this.finish){
  const {sw,sh,bytes}=sheetLayout(w,h);
  this._dimensions(w,h);this._dimensions(sw,sh);
  this._reserve(bytes+w*h*(withFinish?8:0));
  const made=[],make=(...args)=>{const t=this._texture(...args);made.push(t);return t;};
  try{
   const sheet={width:w,height:h,sw,sh,velocity:this._pair(sw,sh,['rg16float'],make),pressure:this._pair(sw,sh,['r16float'],make),
    curl:make(sw,sh,'r16float'),divergence:make(sw,sh,'r16float'),ink:this._pair(w,h,['rgba16float','rgba16float'],make,true),
    wet:this._pair(w,h,['r16float'],make),fixed:[make(w,h,'rgba16float'),make(w,h,'rgba16float')],
    paper:make(w,h,'rgba8unorm'),base:make(w,h,'rgba8unorm'),output:make(w,h,'rgba8unorm',FULL()|GPUTextureUsage.STORAGE_BINDING),mask:make(Math.ceil(w/16),Math.ceil(h/16),'rgba8unorm'),finish:withFinish?make(w,h,'rgba16float'):null};
   Object.assign(this,sheet);this.flowMayMove=false;return sheet;
  }catch(error){made.forEach(t=>this._drop(t));throw error;}
 }
 _sheet(){return Object.fromEntries(['width','height','sw','sh','velocity','pressure','curl','divergence','ink','wet','fixed','paper','base','output','mask','finish'].map(key=>[key,this[key]]));}
 _sheetTextures(sheet){return [...sheet.velocity.read,...sheet.velocity.write,...sheet.pressure.read,...sheet.pressure.write,sheet.curl,sheet.divergence,...sheet.ink.read,...sheet.ink.write,...sheet.wet.read,...sheet.wet.write,...sheet.fixed,sheet.paper,sheet.base,sheet.output,sheet.mask,...(sheet.finish?[sheet.finish]:[])].filter(Boolean);}
 _compactSheet(sheet,pairs=true){
  if(pairs)for(const pair of [sheet.ink,sheet.wet,sheet.velocity,sheet.pressure]){pair.write.forEach(t=>this._drop(t,false));pair.write=[];}
  for(const key of ['curl','divergence','output','mask']){this._drop(sheet[key],false);sheet[key]=null;}
 }
 _expandSheet(sheet){
  const pairs=[sheet.ink,sheet.wet,sheet.velocity,sheet.pressure],missing=pairs.filter(pair=>!pair.write.length);
  const descriptions=[['curl',sheet.sw,sheet.sh,'r16float'],['divergence',sheet.sw,sheet.sh,'r16float'],
   ['output',sheet.width,sheet.height,'rgba8unorm',FULL()|GPUTextureUsage.STORAGE_BINDING],['mask',Math.ceil(sheet.width/16),Math.ceil(sheet.height/16),'rgba8unorm']].filter(([key])=>!sheet[key]);
  const bytes=missing.reduce((sum,pair)=>sum+pair.read.reduce((n,t)=>n+t.bytes,0),0)+descriptions.reduce((sum,[,w,h,format])=>sum+w*h*bytesPerPixel[format],0);
  this._reserve(bytes);const made=[],writes=[],fields={};
  const make=(...args)=>{const target=this._texture(...args);made.push(target);return target;};
  try{
   for(const pair of missing)writes.push([pair,pair.read.map(t=>make(t.w,t.h,t.format,pair===sheet.ink?FULL()|GPUTextureUsage.STORAGE_BINDING:undefined))]);
   for(const [key,...args]of descriptions)fields[key]=make(...args);
  }catch(error){made.forEach(t=>this._drop(t,false));throw error;}
  for(const [pair,targets]of writes){pair.write=targets;pair.read.forEach((t,i)=>this._copy(t,targets[i]));}
  Object.assign(sheet,fields);return sheet;
 }
 async _finishMaterial(){this.submit();try{await this.device.queue.onSubmittedWorkDone();}catch(error){this._poison(error);}await this._settleErrors();}
 async _keepCheckpointSheet(tx,sheet){
  const retired=[];
  if(sheet.paper!==tx.paper){retired.push(sheet.paper);sheet.paper=tx.paper;}
  if(sheet.finish!==tx.finish){if(sheet.finish)retired.push(sheet.finish);sheet.finish=tx.finish;}
  const targets=[...sheet.ink.read,...sheet.fixed,...sheet.wet.read,sheet.base,...(sheet.finish?[sheet.finish]:[])];
  for(const {r,layers}of tx.tiles.values())for(const [i,target]of layers){this._copy(target,targets[i],null,r);retired.push(target);}
  targets.forEach((target,i)=>{target.written=tx.materialRects[i]?.slice()??null;});
  for(const [i,pair]of [sheet.velocity,sheet.pressure].entries()){retired.push(...pair.read);pair.read=[tx.sim[i]];}
  await this._finishMaterial();this._compactSheet(sheet);tx.sheet=sheet;tx.tiles.clear();tx.sim=[];tx.paper=sheet.paper;tx.finish=sheet.finish;
  retired.forEach(t=>this._drop(t,false));
 }
 _ensureFinish(){return this.finish??=this._texture(this.width,this.height,'rgba16float');}
 _command(){
  this._check();if(this.encoder)return this.encoder;
  this.encoder=this.device.createCommandEncoder({label:'Water material'});
  if(waterTiming.on&&this.device.features.has('timestamp-query'))this._timeBegin(this.encoder);
  return this.encoder;
 }
 _timeBegin(encoder){
  const free=(this.timeStamps??=[]).find(stamp=>stamp.free);
  if(!free&&this.timeStamps.length>=8){waterTiming.stampSkipped++;return;}
  const stamp=free??{set:this.device.createQuerySet({type:'timestamp',count:2}),resolve:this.device.createBuffer({size:16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),read:this.device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ})};
  if(!free)this.timeStamps.push(stamp);
  stamp.free=false;this.timeStamp=stamp;
  encoder.beginComputePass({timestampWrites:{querySet:stamp.set,beginningOfPassWriteIndex:0}}).end();
 }
 _timeEnd(encoder){
  const stamp=this.timeStamp;this.timeStamp=null;if(!stamp)return null;
  encoder.beginComputePass({timestampWrites:{querySet:stamp.set,endOfPassWriteIndex:1}}).end();
  encoder.resolveQuerySet(stamp.set,0,2,stamp.resolve,0);encoder.copyBufferToBuffer(stamp.resolve,0,stamp.read,0,16);
  return stamp;
 }
 _timeRead(stamp){
  stamp.read.mapAsync(GPUMapMode.READ).then(()=>{
   const [begin,end]=new BigUint64Array(stamp.read.getMappedRange());stamp.read.unmap();
   if(end>begin){waterTiming.stamp+=Number(end-begin)/1e6;waterTiming.stampBuffers++;}
   stamp.free=true;
  },()=>{});
 }
 submit(){
  this._flushStamps();this._submitEncoder();
 }
 _submitEncoder(){
  if(!this.encoder)return;
  const encoder=this.encoder,slots=this.slots;this.encoder=null;this.slots=0;
  const stamp=this.timeStamp?this._timeEnd(encoder):null;
  try{this._guard(()=>{
   if(slots)this.device.queue.writeBuffer(this.uniforms,0,this.uniformData.buffer,0,slots*256);
   this.device.queue.submit([encoder.finish()]);
  });if(stamp)this._timeRead(stamp);}finally{for(const t of this.pendingRetire)this._drop(t);this.pendingRetire=[];}
 }
 _markWritten(target,rect=null){
  const r=rect??[0,0,target.w,target.h],R=[clamp(Math.floor(r[0]),0,target.w),clamp(Math.floor(r[1]),0,target.h),clamp(Math.ceil(r[2]),0,target.w),clamp(Math.ceil(r[3]),0,target.h)];
  if(R[2]<=R[0]||R[3]<=R[1])return;
  target.written=target.written===undefined?[0,0,target.w,target.h]:union(target.written,R);
 }
 _writeTexture(destination,data,layout,size){
  this._guard(()=>this.device.queue.writeTexture(destination,data,layout,size));
  for(const target of this.targets)if(target.texture===destination.texture){
   const [x,y]=destination.origin??[0,0];this._markWritten(target,[x,y,x+size[0],y+size[1]]);break;
  }
 }
 _retire(target){if(this.encoder)this.pendingRetire.push(target);else this._drop(target);}
 get reach(){return this.texelScale??clamp(WATER_REFERENCE_TEXEL/this.paperScale,.5,4);}
 get dryingTime(){return (2+16*(1-this.params.dry))/(getPaper(this.paperId).params.absorbency??1);}
 _parameters(w=this.width,h=this.height){
  const data=this._scratch;data.fill(0);data.set([w,h,this.sw,this.sh],0);
  const paper=getPaper(this.paperId).params;
  data.set([0,this.params.flow,this.params.bleed*(paper.spread??1),this.params.edge*1.4],4);data.set(this.brushNow,12);data[15]=this.reach;data[48]=paper.spread??1;return data;
 }
 _draw(name,destinations,inputs=[],data=this._parameters(),rect=null){
  if(name!=='paperField')this._flushStamps();
  if(this.slots===UNIFORM_SLOTS)this._submitEncoder();
  if(name==='paperField'&&!this.library.pipelines.paperField[data[50]]){
   const description=this.library.paperDescription;
   this.library.pipelines.paperField[data[50]]=this._guard(()=>this.device.createRenderPipeline({...description,fragment:{...description.fragment,constants:{paperKind:data[50]}}}));
  }
  const encoder=this._command(),targets=Array.isArray(destinations)?destinations:[destinations],target=targets[0];
  data[0]=target.w;data[1]=target.h;
  const slot=this.slots++;this.uniformData.set(data,slot*64);
  const group=this._group(name,inputs);
  const full=!rect||(Math.floor(rect[0])<=0&&Math.floor(rect[1])<=0&&Math.ceil(rect[2])>=target.w&&Math.ceil(rect[3])>=target.h);
  const loadOp=full?this.library.loadOps[name]:'load';
  const pass=encoder.beginRenderPass({colorAttachments:targets.map(t=>({view:t.view,loadOp,storeOp:'store'}))});
  pass.setPipeline(name==='paperField'?this.library.pipelines[name][data[50]]:this.library.pipelines[name]);pass.setBindGroup(0,group,[slot*256]);
  if(rect){const x0=clamp(Math.floor(rect[0]),0,target.w),y0=clamp(Math.floor(rect[1]),0,target.h),x1=clamp(Math.ceil(rect[2]),x0,target.w),y1=clamp(Math.ceil(rect[3]),y0,target.h);if(x1===x0||y1===y0){pass.end();return;}pass.setScissorRect(x0,y0,x1-x0,y1-y0);}
  pass.draw(3);pass.end();
  for(const t of targets){if(loadOp==='clear')t.written=null;this._markWritten(t,rect);}
 }
 _group(name,inputs){
  const resources=Array.from({length:8},(_,i)=>inputs[i]??this.dummy);
  const filling=name.startsWith('fill'),key=(filling?'f:':'s:')+resources.map(t=>t.id).join(',');
  let group=this.bindings.get(key);
  if(!group){
   group=this.device.createBindGroup({layout:filling?this.library.fillLayout:this.library.layout,entries:[{binding:0,resource:{buffer:this.uniforms,size:256}},
    {binding:1,resource:this.library.linear},{binding:2,resource:this.library.nearest},...resources.map((t,i)=>({binding:i+3,resource:t.view}))]});
   if(this.bindings.size>=256)this.bindings.clear();this.bindings.set(key,group);
  }
  return group;
 }
 _scratchFor(format,w,h,index,maxArea){
  const key=format+':'+index,W=Math.ceil(w/64)*64,H=Math.ceil(h/64)*64;let pool=this.scratch.get(key);
  if(!pool)this.scratch.set(key,pool=[]);
  for(let i=pool.length-1;i>=0;i--)if(pool[i].dead)pool.splice(i,1);
  let best=null;for(const t of pool)if(t.w>=w&&t.h>=h&&t.w*t.h<=4*W*H&&(!best||t.w*t.h<best.w*best.h))best=t;
  if(best&&best.w*best.h<maxArea){pool.splice(pool.indexOf(best),1);pool.push(best);return best;}
  const width=Math.min(Math.max(W,Math.ceil(W*1.25/64)*64),Math.max(W,this.width)),height=Math.min(Math.max(H,Math.ceil(H*1.25/64)*64),Math.max(H,this.height));
  if(width*height>=maxArea)return null;
  const t=this._texture(width,height,format,undefined,true);
  pool.push(t);while(pool.length>3)this._retire(pool.shift());return t;
 }
 _regionPass(entries,destinations,rect){
  const targets=Array.isArray(destinations)?destinations:[destinations],target=targets[0];
  const R=[clamp(Math.floor(rect[0]),0,target.w),clamp(Math.floor(rect[1]),0,target.h),clamp(Math.ceil(rect[2]),0,target.w),clamp(Math.ceil(rect[3]),0,target.h)];
  const rw=R[2]-R[0],rh=R[3]-R[1];if(rw<=0||rh<=0)return;
  if(this.slots+entries.length>UNIFORM_SLOTS)this._submitEncoder();
  const blended=entries.some(e=>this.library.loadOps[e.name]==='load');
  const full=R[0]===0&&R[1]===0&&R[2]===target.w&&R[3]===target.h;
  const directArea=target.w*target.h*(full&&!blended?1:2),maxArea=directArea/(blended?2:1)-2*rw*rh;
  let scratch=null;
  if(maxArea>rw*rh)try{scratch=targets.map((t,i)=>this._scratchFor(t.format,rw,rh,i,maxArea));if(scratch.some(t=>!t))scratch=null;}
  catch(error){
   if(error?.code!=='WATER_BUDGET')throw error;
   this._dropScratch();
   for(const e of entries){e.data[60]=0;e.data[61]=0;this._draw(e.name,targets,e.inputs,e.data,e.rect??R);}
   return;
  }
  const clear=!scratch&&!blended&&entries.some(e=>!e.rect)&&targets.every(t=>t.written===null||
   t.written&&R[0]<=t.written[0]&&R[1]<=t.written[1]&&R[2]>=t.written[2]&&R[3]>=t.written[3]);
  const encoder=this._command();
  if(scratch&&blended)targets.forEach((t,i)=>encoder.copyTextureToTexture({texture:t.texture,origin:[R[0],R[1]]},{texture:scratch[i].texture,origin:[0,0]},[rw,rh]));
  const origin=scratch?R:[0,0],loadOp=scratch?(blended?'load':'clear'):(full||clear)&&!blended?'clear':'load';
  const pass=encoder.beginRenderPass({colorAttachments:(scratch??targets).map(t=>({view:t.view,loadOp,clearValue:[0,0,0,0],storeOp:'store'}))});
  for(const e of entries){
   const r=e.rect?[Math.max(R[0],Math.floor(e.rect[0])),Math.max(R[1],Math.floor(e.rect[1])),Math.min(R[2],Math.ceil(e.rect[2])),Math.min(R[3],Math.ceil(e.rect[3]))]:R;
   if(r[2]<=r[0]||r[3]<=r[1])continue;
   const data=e.data;data[0]=target.w;data[1]=target.h;data[60]=origin[0];data[61]=origin[1];
   const slot=this.slots++;this.uniformData.set(data,slot*64);
   pass.setPipeline(this.library.pipelines[e.name]);pass.setBindGroup(0,this._group(e.name,e.inputs),[slot*256]);
   pass.setScissorRect(r[0]-origin[0],r[1]-origin[1],r[2]-r[0],r[3]-r[1]);pass.draw(3);
  }
  pass.end();
  for(const t of scratch??targets){if(loadOp==='clear')t.written=null;this._markWritten(t,scratch?[0,0,rw,rh]:R);}
  if(scratch)targets.forEach((t,i)=>{encoder.copyTextureToTexture({texture:scratch[i].texture,origin:[0,0]},{texture:t.texture,origin:[R[0],R[1]]},[rw,rh]);this._markWritten(t,R);});
 }
 _dropScratch(){for(const pool of this.scratch.values())for(const t of pool)this._retire(t);this.scratch.clear();}
 _region(name,destinations,inputs,data,rect){
  if(name!=='paperLight')this._flushStamps();
  this._regionPass([{name,inputs,data:Float32Array.from(data),rect:null}],destinations,rect);
 }
 _pigment(data,rect){
  this._flushStamps();
  const size=Math.ceil(this.width/16)*Math.ceil(this.height/16)*4;
  if(!this.pigmentWork||this.pigmentWork.size<size){
   this._reserve(size+12);this._submitEncoder();
   if(this.pigmentWork){this._dropBuffer(this.pigmentWork.tiles);this._dropBuffer(this.pigmentWork.dispatch);}
   const tiles=this._buffer(size,GPUBufferUsage.STORAGE);
   let dispatch;
   try{dispatch=this._buffer(12,GPUBufferUsage.STORAGE|GPUBufferUsage.INDIRECT|GPUBufferUsage.COPY_DST);}
   catch(error){this._dropBuffer(tiles);this.pigmentWork=null;throw error;}
   this.device.queue.writeBuffer(dispatch,0,new Uint32Array([0,1,1]));
   this.pigmentWork={size,tiles,dispatch};this.bindings.clear();
  }
  if(this.slots===UNIFORM_SLOTS)this.submit();
  const {tiles,dispatch}=this.pigmentWork,resources=[this.velocity.read[0],...this.ink.read,this.wet.read[0],...this.ink.write,this.dummy,this.dummy];
  const key='pigment:'+resources.map(t=>t.id).join(',');let groups=this.bindings.get(key);
  if(!groups){
   const entries=[{binding:0,resource:{buffer:this.uniforms,size:256}},{binding:1,resource:this.library.linear},{binding:2,resource:this.library.nearest}];
   const sampled=resources.map((t,i)=>({binding:i+3,resource:t.view}));
   groups=[this.device.createBindGroup({layout:this.library.tileLayout,entries:[...entries,...sampled,{binding:11,resource:{buffer:tiles}},{binding:12,resource:{buffer:dispatch}}]}),
    this.device.createBindGroup({layout:this.library.pigmentLayout,entries:[...entries,...sampled.map((entry,i)=>i===4||i===5?{...entry,resource:this.dummy.view}:entry),
     {binding:11,resource:{buffer:tiles}},...this.ink.write.map((t,i)=>({binding:12+i,resource:t.view}))]})];
   if(this.bindings.size>=256)this.bindings.clear();this.bindings.set(key,groups);
  }
  data[0]=this.width;data[1]=this.height;data.set(rect,56);data[60]=Math.floor(rect[0]/16)*16;data[61]=Math.floor(rect[1]/16)*16;
  const slot=this.slots++;this.uniformData.set(data,slot*64);
  const encoder=this._command();encoder.clearBuffer(dispatch,0,4);
  const classify=encoder.beginComputePass();classify.setPipeline(this.library.pipelines.pigmentTiles);classify.setBindGroup(0,groups[0],[slot*256]);
  classify.dispatchWorkgroups(Math.ceil((rect[2]-data[60])/16),Math.ceil((rect[3]-data[61])/16));classify.end();
  const pigment=encoder.beginComputePass();pigment.setPipeline(this.library.pipelines.pigmentCompute);pigment.setBindGroup(0,groups[1],[slot*256]);pigment.dispatchWorkgroupsIndirect(dispatch,0);pigment.end();
  this.ink.write.forEach(t=>this._markWritten(t,rect));
 }
 _display(inputs,data,box){
  this._flushStamps();if(this.slots===UNIFORM_SLOTS)this.submit();
  const rect=box?[clamp(Math.floor(box[0]),0,this.width),clamp(Math.floor(box[1]),0,this.height),clamp(Math.ceil(box[2]),0,this.width),clamp(Math.ceil(box[3]),0,this.height)]:[0,0,this.width,this.height];
  if(rect[2]<=rect[0]||rect[3]<=rect[1])return;
  const key='display:'+inputs.map(t=>t.id).join(',')+':'+this.output.id;let group=this.bindings.get(key);
  if(!group){
   group=this.device.createBindGroup({layout:this.library.displayLayout,entries:[{binding:0,resource:{buffer:this.uniforms,size:256}},
    {binding:1,resource:this.library.linear},{binding:2,resource:this.library.nearest},
    ...Array.from({length:8},(_,i)=>({binding:3+i,resource:(inputs[i]??this.dummy).view})),{binding:11,resource:this.output.view}]});
   if(this.bindings.size>=256)this.bindings.clear();this.bindings.set(key,group);
  }
  data[0]=this.width;data[1]=this.height;data.set(rect,8);data[60]=0;data[61]=0;
  const slot=this.slots++;this.uniformData.set(data,slot*64);
  const pass=this._command().beginComputePass();pass.setPipeline(this.library.pipelines.displayCompute);pass.setBindGroup(0,group,[slot*256]);
  pass.dispatchWorkgroups(Math.ceil((rect[2]-rect[0])/8),Math.ceil((rect[3]-rect[1])/8));pass.end();this._markWritten(this.output,rect);
 }
 _queue(name,destinations,inputs,data,rect){
  const targets=Array.isArray(destinations)?destinations:[destinations],key=targets.map(t=>t.id).join(',');
  let group=this.queued.get(key);if(!group)this.queued.set(key,group={targets,entries:[],rect:null});
  group.entries.push({name,inputs,data:Float32Array.from(data),rect:rect.slice()});group.rect=union(group.rect,rect);
  if(group.entries.length>=512)this._flushStamps();
 }
 _flushStamps(){
  if(!this.queued.size)return;
  const groups=[...this.queued.values()];this.queued.clear();
  for(const {targets,entries,rect} of groups)this._regionPass(entries,targets,rect);
 }
 _copy(source,destination,rect=null,offset=null){
  this._flushStamps();this._copyRaw(source,destination,rect,offset);
 }
 _copyRaw(source,destination,rect=null,offset=null){
  const r=rect??[0,0,source.w,source.h],to=offset??r;
  this._command().copyTextureToTexture({texture:source.texture,origin:[r[0],r[1]]},{texture:destination.texture,origin:[to[0],to[1]]},[r[2]-r[0],r[3]-r[1]]);
  const d=[to[0],to[1],to[0]+r[2]-r[0],to[1]+r[3]-r[1]],prior=destination.written;
  if(d[0]===0&&d[1]===0&&d[2]===destination.w&&d[3]===destination.h||prior&&d[0]<=prior[0]&&d[1]<=prior[1]&&d[2]>=prior[2]&&d[3]>=prior[3])destination.written=null;
  const written=source.written===undefined?[0,0,source.w,source.h]:source.written;
  if(written){const kept=[Math.max(r[0],written[0]),Math.max(r[1],written[1]),Math.min(r[2],written[2]),Math.min(r[3],written[3])];
   if(kept[2]>kept[0]&&kept[3]>kept[1])this._markWritten(destination,[to[0]+kept[0]-r[0],to[1]+kept[1]-r[1],to[0]+kept[2]-r[0],to[1]+kept[3]-r[1]]);}
 }
 _swap(pair){[pair.read,pair.write]=[pair.write,pair.read];}
 _clear(target){this._flushStamps();const pass=this._command().beginRenderPass({colorAttachments:[{view:target.view,loadOp:'clear',clearValue:[0,0,0,0],storeOp:'store'}]});pass.end();target.written=null;}
 _material(){return [...this.ink.read,...this.fixed,...this.wet.read,this.base,...(this.finish?[this.finish]:[])];}
 _meta(){return {active:this.active?.slice()??null,dirty:this.dirty?.slice()??null,painted:this.painted?.slice()??null,wetPeak:this.wetPeak,fixTimer:this.fixTimer,elapsed:this.elapsed,lastWet:this.lastWet,awakeUntil:this.awakeUntil,flowSpeed:this.flowSpeed,growCarry:this.growCarry,frame:this.frame,brushNow:this.brushNow.slice(),params:{...this.params},paperId:this.paperId,paperOrigin:this.paperOrigin.slice(),paperScale:this.paperScale,seed:this.seed};}
 beginTransaction(){
  this._check();if(this.transaction)throw failure('WATER_BUSY','A Water gesture is already open.');
  this.endFill();this._flushStamps();const tx={tiles:new Map(),span:0,meta:this._meta(),width:this.width,height:this.height,sim:[],paper:this.paper,finish:this.finish,sheet:null,simBox:this.simBox?.slice()??null,
   materialRects:this._material().map(t=>t.written===undefined?[0,0,t.w,t.h]:t.written?.slice()??null)};
  const sim=[...this.velocity.read,...this.pressure.read];this._reserve(sim.reduce((n,t)=>n+t.bytes,0));
  try{for(const t of sim){const copy=this._texture(t.w,t.h,t.format);tx.sim.push(copy);this._copy(t,copy);}}
  catch(error){this.submit();tx.sim.forEach(t=>this._drop(t));throw error;}
  this.transaction=tx;return tx;
 }
 _protectPlan(rect,indices){
  const tx=this.transaction,material=this._material(),pending=[];indices=indices.filter(i=>material[i]&&(i!==6||tx.finish));let bytes=0;
  for(let y=Math.floor(rect[1]/128)*128;y<rect[3];y+=128)for(let x=Math.floor(rect[0]/128)*128;x<rect[2];x+=128){
   const key=x+','+y,existing=tx.tiles.get(key),missing=indices.filter(i=>!existing?.layers.has(i));if(!missing.length)continue;
   const r=existing?.r??[x,y,Math.min(this.width,x+128),Math.min(this.height,y+128)];
   if(r[0]<0||r[1]<0||r[2]<=r[0]||r[3]<=r[1])continue;
   bytes+=(r[2]-x)*(r[3]-y)*missing.reduce((sum,i)=>sum+bytesPerPixel[material[i].format],0);pending.push({key,r,existing,missing,copies:new Map()});
  }
  return {material,pending,bytes};
 }
 _protect(rect,indices=[0,1,2,3,4,5,6]){
  const tx=this.transaction;if(!tx||tx.sheet||tx.cpu)return;
  tx.span=Math.max(tx.span,rect[2]-rect[0],rect[3]-rect[1]);
  const {material,pending,bytes}=this._protectPlan(rect,indices);
  this._reserve(bytes);
  const made=[];
  try{for(const {r,missing,copies} of pending)for(const i of missing){const t=material[i],copy=this._texture(r[2]-r[0],r[3]-r[1],t.format);made.push(copy);copies.set(i,copy);this._copyRaw(t,copy,r,[0,0]);}}
  catch(error){this.submit();made.forEach(t=>this._drop(t));throw error;}
  for(const {key,r,existing,copies} of pending){const layers=existing?.layers??new Map();for(const [i,copy]of copies)layers.set(i,copy);tx.tiles.set(key,{r,layers});}
 }
 async _roomForRollback(){
  const tx=this.transaction;if(!tx||tx.sheet||tx.cpu||!this.active)return;
  const grow=Math.ceil(this.growCarry+3.4*this.reach)+1,a=this.active,front=[Math.max(0,a[0]-grow),Math.max(0,a[1]-grow),Math.min(this.width,a[2]+grow),Math.min(this.height,a[3]+grow)];
  const side=2*tx.span+256,next=Math.min(this.width,side)*Math.min(this.height,side)*(tx.finish?46:38);
  if(this.bytes+this._protectPlan(front,[0,1,2,3,4]).bytes+next<=this.maxBytes)return;
  this._flushStamps();this.submit();
  const sheet=this._sheet(),capture=await this._captureCheckpoint(tx,await this._captureSheet(sheet,tx.meta),sheet);
  const retired=[...tx.sim];for(const {layers}of tx.tiles.values())retired.push(...layers.values());
  if(tx.paper!==this.paper)retired.push(tx.paper);if(tx.finish&&tx.finish!==this.finish)retired.push(tx.finish);
  this._retainCapture(tx,capture);retired.forEach(t=>this._drop(t));
 }
 async endTransaction(tx,cancel=false){
  if(tx!==this.transaction)throw failure('WATER_INPUT','The Water checkpoint is not current.');
  this.endFill();const retired=[];
  if(tx.cpu){
   this.submit();
   if(cancel){
    const retired=this._sheetTextures(this._sheet()),need=sheetLayout(tx.cpu.width,tx.cpu.height).bytes+tx.cpu.width*tx.cpu.height*(tx.cpu.layers.length>6?8:0);
    const credit=retired.reduce((sum,t)=>sum+t.bytes,0);this._reclaimScratch(need,credit);
    if(this.bytes-credit+need>this.maxBytes)throw failure('WATER_GPU_MEMORY','Water cannot restore this sheet in GPU memory. The last published painting is safe; reopen Water to continue.');
    try{await this.device.queue.onSubmittedWorkDone();}catch(error){this._poison(error);}await this._settleErrors();
    retired.forEach(t=>this._drop(t));await this._restoreCapture(tx.cpu);
   }
   this.transaction=null;tx.cpu=null;return;
  }
  if(cancel){
   if(tx.sheet){
    const current=this._sheetTextures(this._sheet()),credit=current.reduce((sum,t)=>sum+t.bytes,0);
    const kept=this._sheetTextures(tx.sheet).reduce((sum,t)=>sum+t.bytes,0),missing=sheetLayout(tx.sheet.width,tx.sheet.height).bytes+(tx.sheet.finish?tx.sheet.width*tx.sheet.height*8:0)-kept;
    this._reclaimScratch(missing,credit);
    if(this.bytes-credit+missing>this.maxBytes)throw failure('WATER_GPU_MEMORY','Water cannot restore this sheet in GPU memory. The last published painting is safe; reopen Water to continue.');
    await this._finishMaterial();current.forEach(t=>this._drop(t,false));Object.assign(this,tx.sheet);this.outputCanonical=false;
    Object.assign(this,this._expandSheet(tx.sheet));
   }
   if(this.paper!==tx.paper){retired.push(this.paper);this.paper=tx.paper;}
   if(this.finish!==tx.finish){if(this.finish)retired.push(this.finish);this.finish=tx.finish;}
   const targets=this._material();for(const {r,layers} of tx.tiles.values())layers.forEach((t,i)=>this._copy(t,targets[i],null,r));
   targets.forEach((target,i)=>{target.written=tx.materialRects[i]?.slice()??null;});
   for(let i=0;i<tx.sim.length;i++){this._copy(tx.sim[i],i?this.pressure.read[0]:this.velocity.read[0]);}
   for(const [key,value] of Object.entries(tx.meta))this[key]=value;
   this.simBox=tx.simBox?tx.simBox.slice():null;this.painting=false;this.flowMayMove=true;
   for(const pair of [this.ink,this.wet,this.velocity,this.pressure])pair.read.forEach((t,i)=>this._copy(t,pair.write[i]));
  }else if(tx.sheet)retired.push(...this._sheetTextures(tx.sheet));
  if(tx.paper!==this.paper)retired.push(tx.paper);
  if(tx.finish&&tx.finish!==this.finish)retired.push(tx.finish);
  this.transaction=null;this.submit();retired.forEach(t=>this._drop(t));
  for(const {layers} of tx.tiles.values())layers.forEach(t=>this._drop(t));tx.sim.forEach(t=>this._drop(t));
 }
 _paper(target=this.paper,id=this.paperId,settings=this,kept=null){
  if(!getPaper(id))throw failure('WATER_INPUT','The Water paper is not available.');
  target.field={id,paperScale:settings.paperScale,seed:settings.seed,paperOrigin:settings.paperOrigin.slice(),regions:kept?.map(r=>r.slice())??[],unknown:false};
  if(kept)return;
  const cache=paperCaches.get(this.device),key=paperKey(target,target.field),entry=cache?.entries.get(key);
  if(!entry)return;
  cache.entries.delete(key);cache.bytes-=entry.bytes;target.texture.destroy();
  Object.assign(target,{texture:entry.texture,view:entry.view,field:entry.field,written:entry.written});this.bindings.clear();
 }
 _ensurePaper(rect=null,target=this.paper,expand=true){
  const settings=target.field;if(!settings)return;
  const w=target.w,h=target.h,pad=expand?1:0,tile=expand?128:1;
  const requested=rect?[Math.max(0,Math.floor((rect[0]-pad)/tile)*tile),Math.max(0,Math.floor((rect[1]-pad)/tile)*tile),Math.min(w,Math.ceil((rect[2]+pad)/tile)*tile),Math.min(h,Math.ceil((rect[3]+pad)/tile)*tile)]:[0,0,w,h];
  if(requested[2]<=requested[0]||requested[3]<=requested[1])return;
  let regions=[requested];for(const kept of settings.regions){regions=regions.flatMap(r=>uncoveredPaper(r,kept));if(!regions.length)break;}
  if(!regions.length){if(!rect)settings.unknown=false;return;}
  const profile=getPaper(settings.id),p=profile.params??profile,data=this._parameters();
  data.set([settings.paperScale,settings.seed,profile.kind??p.kind??0,1.4*(p.bump??1)/settings.paperScale],48);data.set(settings.paperOrigin,52);
  const bands=[];
  for(const region of regions){
   const rows=Math.max(1,Math.floor(PAPER_BAND_PIXELS/(region[2]-region[0])));
   for(let top=region[1];top<region[3];top+=rows)bands.push([region[0],top,region[2],Math.min(region[3],top+rows)]);
  }
  for(const band of bands){
   const x=Math.max(0,band[0]-1),y=Math.max(0,band[1]-1),right=Math.min(w,band[2]+1),bottom=Math.min(h,band[3]+1);
   if(this.pendingRetire.length||bands.length>1)this._submitEncoder();
   const field=this._texture(right-x,bottom-y,'rgba16float');
   data.set([x,y,w,h],56);
   try{this._draw('paperField',field,[],data);this._region('paperLight',target,[field],data,band);keepPaperRegion(settings.regions,band);}finally{this._retire(field);}
  }
  if(bands.length>1)this._submitEncoder();
  if(requested[0]===0&&requested[1]===0&&requested[2]===w&&requested[3]===h)settings.unknown=false;
 }
 async _bakePaper(target=this.paper,rect=[0,0,target.w,target.h],expand=true){
  const rows=Math.max(128,Math.floor(PAPER_BAND_PIXELS/Math.max(1,rect[2]-rect[0])/128)*128);
  for(let top=rect[1];top<rect[3];top+=rows){
   this._ensurePaper([rect[0],top,rect[2],Math.min(rect[3],top+rows)],target,expand);this.submit();
   if(top+rows<rect[3]){await this.device.queue.onSubmittedWorkDone();this._check();}
  }
 }
 async setPaper(id,fields={}){
  this._check();
  if(!getPaper(id)||!fields||typeof fields!=='object'||Array.isArray(fields)||Object.keys(fields).some(key=>!['paperScale','paperOrigin','seed'].includes(key)))throw failure('WATER_INPUT','The Water paper is not available.');
  const {paperScale=this.paperScale,paperOrigin=this.paperOrigin,seed=this.seed}=fields;
  if(!Number.isFinite(paperScale)||paperScale<=0||!Array.isArray(paperOrigin)||paperOrigin.length!==2||!paperOrigin.every(Number.isFinite)||!Number.isFinite(seed)||seed<0||seed>1)throw failure('WATER_INPUT','The Water paper field is invalid.');
  const ticket=this.paperTicket=(this.paperTicket??0)+1;
  if(id===this.paperId&&paperScale===this.paperScale&&seed===this.seed&&paperOrigin.every((value,i)=>value===this.paperOrigin[i]))return;
  this.submit();
  this._reserve(this.width*this.height*12);const next=this._texture(this.width,this.height,'rgba8unorm');
  try{
   this._paper(next,id,{paperScale,paperOrigin:paperOrigin.slice(),seed});next.field.unknown=this.paper.field.unknown;
   for(const rect of this.paper.field.regions.map(r=>r.slice()))await this._bakePaper(next,rect,false);
   if(ticket!==this.paperTicket){this._retire(next);return;}
   if(next.w!==this.paper.w||next.h!==this.paper.h){this._retire(next);return this.setPaper(id,fields);}
   next.field.unknown=this.paper.field.unknown;for(const rect of this.paper.field.regions)this._ensurePaper(rect,next,false);
  }catch(error){this._retire(next);throw error;}
  const old=this.paper;this.paper=next;this.paperId=id;this.paperScale=paperScale;this.paperOrigin=paperOrigin.slice();this.seed=seed;this.dirty=[0,0,this.width,this.height];
  if(old!==this.transaction?.paper && old!==this.transaction?.sheet?.paper)this._retire(old);
 }
 setPaperField(fields){return this.setPaper(this.paperId,fields);}
 _tip(brush){
  const id=brush.id??brush.brush;let t=this.tips.get(id);if(t)return t;
  const mask=brush.tip?{width:brush.tip.width,height:brush.tip.height,rgba:brush.tip.mask}:makeTip(brush);
  t=this._texture(mask.width,mask.height,'r8unorm',GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST);
  const bytes=mask.rgba.length===mask.width*mask.height?Uint8Array.from(mask.rgba):Uint8Array.from({length:mask.width*mask.height},(_,i)=>mask.rgba[i*4]);
  this._writeTexture({texture:t.texture},bytes,{bytesPerRow:mask.width},[mask.width,mask.height]);this.tips.set(id,t);return t;
 }
 _rect(x,y,r,extent=1.5,w=this.width,h=this.height){const size=Math.ceil(r*extent*h)+2,cx=Math.round(x*w),cy=Math.round((1-y)*h);return [Math.max(0,cx-size),Math.max(0,cy-size),Math.min(w,cx+size),Math.min(h,cy+size)];}
 _simRect(rect){
  const pad=40,sw=this.sw,sh=this.sh;
  const x0=clamp(Math.floor(rect[0]*sw/this.width)-pad,0,sw),y0=clamp(Math.floor(rect[1]*sh/this.height)-pad,0,sh);
  const x1=clamp(Math.ceil(rect[2]*sw/this.width)+pad,0,sw),y1=clamp(Math.ceil(rect[3]*sh/this.height)+pad,0,sh);
  return [x0,y0,Math.max(x0,x1),Math.max(y0,y1)];
 }
 _touch(rect,indices){if(rect[0]>=rect[2]||rect[1]>=rect[3])return;this.trimEpoch++;this._ensurePaper(rect);this._protect(rect,indices);this.active=union(this.active,rect);this.dirty=union(this.dirty,rect);this.painted=union(this.painted,rect);this.awakeUntil=Math.max(this.awakeUntil,this.elapsed+.25);}
 stamp({x,y,r,angle=0,brush='water/round',coefficients=null,finish=null,dose=1,water=0,round=0,grain=0,threshold=.5,velocity=null,lift=0,erase=false,circular=false,hardness=2,settle=0}){
  this._check();const profile=typeof brush==='string'?getBrush(brush):brush;
  const settings=profile.params??profile;
  if(finish&&(!admitWaterFinish(finish)||!Number.isFinite(dose)||dose<0))throw failure('WATER_INPUT','The Water mineral dose is invalid.');
  const sheen=coefficients&&finish?.sheen.some(v=>v>0);if(sheen)this._ensureFinish();
  const rect=this._rect(x,y,r,circular?3.2:1.5);this._touch(rect,lift?(erase?undefined:[0,1,4,...(this.finish?[6]:[])]):[...(coefficients?[0,1]:[]),...(coefficients&&finish?.settling>0?[2,3]:[]),...(sheen?[6]:[]),...(water>0?[4]:[])]);
  const data=this._parameters();data.set([x,y,r,settings.aspect??1],16);data.set([Math.cos(angle),Math.sin(angle),round,grain],20);data.set([threshold,water,hardness,finish?0:settle],24);
  data[54]=(finish?.settling??0)*(getPaper(this.paperId).params.tooth??1);
  if(lift){data[25]=lift;data[26]=2;data[27]=erase?1:0;this._queue('liftInk',this.ink.read,[],data,rect);data[25]=lift*.8;this._queue('liftWet',this.wet.read,[],data,rect);
   if(this.finish){data[25]=lift;this._queue('liftFinish',this.finish,[],data,rect);}
   if(erase){data[25]=lift;this._queue('eraseFixed',this.fixed,[],data,rect);this._queue('eraseBase',this.base,[],data,rect);}return;}
  const tip=circular?null:this._tip(profile),inputs=tip?[tip,this.paper]:finish?[this.dummy,this.paper]:[];
  if(coefficients){
   data.set(coefficients.slice(0,4),28);data.set(coefficients.slice(4,8),32);this._queue(circular?'splatInk':'stampInk',this.ink.read,inputs,data,rect);
   if(finish?.settling>0){data[55]=1;data[35]=0;this._queue(circular?'splatInk':'stampInk',this.fixed,inputs,data,rect);data[55]=0;}
   if(sheen){data.set([...finish.sheen,finish.iridescence].map(v=>v*dose),28);data[55]=circular?1:0;this._queue('stampFinish',this.finish,inputs,data,rect);data[55]=0;}
  }
  if(water>0){
   if(circular){data.set([water,0,0,0],28);this._queue('wetSplat',this.wet.read,[],data,rect);}
   else this._queue('stampWet',this.wet.read,inputs,data,rect);
   const tau=this.fixTimer>0?.25:this.dryingTime;
   this.wetPeak=Math.max(this.wetPeak*Math.exp(-(this.elapsed-this.lastWet)/tau),water);this.lastWet=this.elapsed;
  }
  if(velocity)this.splatVelocity(x,y,r,velocity[0],velocity[1]);
 }
 splatVelocity(x,y,r,vx,vy,track=true){
  if(vx||vy)this.flowMayMove=true;
  if(track)this.flowSpeed=Math.max(this.flowSpeed,Math.hypot(vx,vy));
  const data=this._parameters();data.set([x,y,r,1],16);data[26]=1;data.set([vx,vy,0,0],28);
  this._queue('velocitySplat',this.velocity.read,[],data,this._rect(x,y,r,3,this.sw,this.sh));
 }
 beginFill(field,box){
  this._check();
  if(!(field instanceof Float32Array)||field.length!==this.width*this.height*2||!Array.isArray(box)||box.length!==4||
   !box.every(Number.isSafeInteger)||box[0]<0||box[1]<0||box[2]>this.width||box[3]>this.height||box[2]<=box[0]||box[3]<=box[1])
   throw failure('WATER_INPUT','The Water fill field does not fit the sheet.');
  this.endFill();const texture=this._texture(this.width,this.height,'rg32float',GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST);
  try{this._writeTexture({texture:texture.texture},field,{bytesPerRow:this.width*8},[this.width,this.height]);}
  catch(error){this._drop(texture);throw error;}
  this.fill={texture,box:box.slice()};return true;
 }
 fillStep({from,to,coefficients=null,finish=null,dose=1,water,soft=0}){
  this._check();if(!this.fill)return false;
  if(![from,to,water,soft].every(Number.isFinite)||to<from||water<0||soft<0||coefficients&&coefficients.length!==8)
   throw failure('WATER_INPUT','The Water fill step is invalid.');
  if(finish&&(!admitWaterFinish(finish)||!Number.isFinite(dose)||dose<0))throw failure('WATER_INPUT','The Water mineral dose is invalid.');
  const sheen=coefficients&&finish?.sheen.some(v=>v>0);if(sheen)this._ensureFinish();
  const {texture,box}=this.fill;this._touch(box,[...(coefficients?[0,1]:[]),...(coefficients&&finish?.settling>0?[2,3]:[]),...(sheen?[6]:[]),...(water>0?[4]:[])]);
  const data=this._parameters();data.set([from,to,soft,water],56);data[54]=(finish?.settling??0)*(getPaper(this.paperId).params.tooth??1);
  if(coefficients){
   data.set(coefficients.slice(0,4),28);data.set(coefficients.slice(4,8),32);this._region('fillInk',this.ink.read,[texture,this.paper],data,box);
   if(finish?.settling>0){data[55]=1;data[35]=0;this._region('fillInk',this.fixed,[texture,this.paper],data,box);data[55]=0;}
   if(sheen){data.set([...finish.sheen,finish.iridescence].map(v=>v*dose),28);this._region('fillFinish',this.finish,[texture,this.paper],data,box);}
  }
  if(water>0){
   this._region('fillWet',this.wet.read,[texture,this.paper],data,box);
   const tau=this.fixTimer>0?.25:this.dryingTime;
   this.wetPeak=Math.max(this.wetPeak*Math.exp(-(this.elapsed-this.lastWet)/tau),water);this.lastWet=this.elapsed;
  }
  return true;
 }
 endFill(){if(this.fill){this._retire(this.fill.texture);this.fill=null;}}
 _age(seconds){const next=this.elapsed+seconds;if(!waterTimeFits(seconds)||seconds<=0||!waterTimeFits(next)||next<=this.elapsed)throw failure('WATER_INPUT','The Water frame time is not valid.');return seconds;}
 async step(seconds=1/60){
  this._check();const age=this._age(seconds);await this._trimFinish();
  if(!this.active){this.brushNow=[0,0,0];return false;}
  await this._roomForRollback();
  const dt=clamp(age,1/240,1/30),aged=age>WATER_IDLE_SECONDS?age:dt,fixing=this.fixTimer>0,fixedAge=Math.min(aged,this.fixTimer);
  this.elapsed+=age;this.frame++;this.fixTimer=Math.max(0,this.fixTimer-aged);
  this.flowSpeed*=Math.exp(-aged*(3-2.4*this.params.flow));
  this.growCarry+=.4*this.reach+Math.min(3*this.reach,.15*this.flowSpeed*dt*this.width/this.sw);const grow=Math.floor(this.growCarry);this.growCarry-=grow;
  this.active=[Math.max(0,this.active[0]-grow),Math.max(0,this.active[1]-grow),Math.min(this.width,this.active[2]+grow),Math.min(this.height,this.active[3]+grow)];
  this._flushStamps();
  const rect=this.active;this._ensurePaper(rect);this._protect(rect,fixing?[0,1,2,3,4]:[0,1,4]);
  const data=this._parameters();data[4]=dt;const settle=1-Math.exp(-5*fixedAge);
  const decay=Math.exp(-fixedAge/.25-(aged-fixedAge)/this.dryingTime);
  const damping=Math.exp(-aged*(3-2.4*this.params.flow)-7*fixedAge);data.set([decay,damping,settle,1-settle],8);
  const sim=this.simBox=union(this.simBox,this._simRect(rect));
  if(this.flowMayMove){
  this._region('velocity',this.velocity.write,[this.velocity.read[0],this.wet.read[0]],data,sim);this._swap(this.velocity);
  this._region('curl',this.curl,this.velocity.read,data,[Math.max(0,sim[0]-1),Math.max(0,sim[1]-1),Math.min(this.sw,sim[2]+1),Math.min(this.sh,sim[3]+1)]);
  this._region('vorticity',this.velocity.write,[this.velocity.read[0],this.curl],data,sim);this._swap(this.velocity);
  this._region('divergence',this.divergence,this.velocity.read,data,sim);
  this._region('pressureDecay',this.pressure.write,this.pressure.read,data,sim);this._swap(this.pressure);
  for(let i=0;i<20;i++){this._region('pressure',this.pressure.write,[this.pressure.read[0],this.divergence],data,sim);this._swap(this.pressure);}
  this._region('project',this.velocity.write,[this.velocity.read[0],this.pressure.read[0]],data,sim);this._swap(this.velocity);
  }
  this._region('wet',this.wet.write,[this.velocity.read[0],this.wet.read[0]],data,rect);this._swap(this.wet);
  if(fixing)this._regionPass([
   {name:'bleach',inputs:[this.ink.read[1]],data:Float32Array.from(data),rect:null},
   {name:'fix',inputs:this.ink.read,data:Float32Array.from(data),rect:null}
  ],this.fixed,rect);
  this._pigment(data,rect);this._swap(this.ink);
  this.brushNow=[0,0,0];
  this.dirty=union(this.dirty,rect);this.painted=union(this.painted,rect);
  if(fixing&&!this.fixTimer){this.wetPeak=0;this.awakeUntil=0;this.painted=null;}
  const until=this.lastWet+this.dryingTime*Math.log(Math.max(.004,this.wetPeak)/.004);
  if(!this.fixTimer&&this.elapsed>=this.awakeUntil&&this.elapsed>=until)this.sleep();
  else if(!this.painting&&this.frame%16===0&&!fixing&&!this.maskRead)this._trimStart();
  this.submit();await this._pace();return true;
 }
 _trimStart(){
  this._draw('mask',this.mask,this.wet.read,this._parameters(this.mask.w,this.mask.h));
  const w=this.mask.w,h=this.mask.h,stride=w*4,pitch=Math.ceil(stride/256)*256,buffer=this._buffer(pitch*h,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
  this._command().copyTextureToBuffer({texture:this.mask.texture},{buffer,bytesPerRow:pitch},[w,h]);this.submit();
  const read=this.maskRead={buffer,w,h,stride,pitch,epoch:this.trimEpoch,state:'pending',due:this.frame+2};
  read.mapped=buffer.mapAsync(GPUMapMode.READ).then(()=>{read.state='ready';},()=>{read.state='failed';});
 }
 _trimPixels(read){
  if(read.state!=='ready')return null;
  if(read.pixels)return read.pixels.slice();
  const source=new Uint8Array(read.buffer.getMappedRange()),pixels=new Uint8Array(read.stride*read.h);
  for(let y=0;y<read.h;y++)pixels.set(source.subarray(y*read.pitch,y*read.pitch+read.stride),y*read.stride);
  read.pixels=pixels;return pixels.slice();
 }
 async _trimFinish(){
  const read=this.maskRead;if(!read||this.frame<read.due)return;
  if(read.state==='pending')await read.mapped;
  if(this.maskRead!==read)return;this.maskRead=null;
  let pixels=null;
  try{if(read.epoch===this.trimEpoch&&!this.painting&&this.active)pixels=this._trimPixels(read);}
  finally{if(read.buffer){if(read.buffer.mapState==='mapped')read.buffer.unmap();this._dropBuffer(read.buffer);}}
  if(pixels)this._trim(pixels);
 }
 _trim(pixels){
  const previous=this.active;if(!previous)return;
  let x0=this.mask.w,y0=this.mask.h,x1=-1,y1=-1;
  for(let y=0;y<this.mask.h;y++)for(let x=0;x<this.mask.w;x++)if(pixels[(y*this.mask.w+x)*4]){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  const next=x1>=0?[Math.max(previous[0],x0*16-24),Math.max(previous[1],y0*16-24),Math.min(previous[2],(x1+1)*16+24),Math.min(previous[3],(y1+1)*16+24)]:null;
  if(next&&next.every((v,i)=>v===previous[i]))return;
  for(const pair of [this.ink,this.wet])pair.read.forEach((t,i)=>this._copy(t,pair.write[i],previous));
  if(next&&next[2]>next[0]&&next[3]>next[1])this.active=next;else this.sleep();
 }
 sleep(){
  this.trimEpoch++;
  if(this.active)for(const pair of [this.ink,this.wet])pair.read.forEach((t,i)=>this._copy(t,pair.write[i],this.active));
  for(const pair of [this.velocity,this.pressure])for(const t of [...pair.read,...pair.write])this._clear(t);
  this.active=null;this.wetPeak=0;this.flowSpeed=0;this.flowMayMove=false;this.simBox=null;
 }
 dry(){this.trimEpoch++;if(this.painted){this.active=union(this.active,this.painted);this.fixTimer=1.2;this.awakeUntil=this.elapsed+1.2;}}
 async upload(data,width=this.width,height=this.height,x=0,y=0){
  this._check();if(data.length!==width*height*4||x<0||y<0||x+width>this.width||y+height>this.height)throw failure('WATER_INPUT','The saved Water pixels do not fit the sheet.');
  this._protect([x,y,x+width,y+height],[5]);this.submit();
  this._writeTexture({texture:this.base.texture,origin:[x,y]},data,{bytesPerRow:width*4},[width,height]);
  this.dirty=union(this.dirty,[x,y,x+width,y+height]);await this._settleErrors();return this;
 }
 async _readTexture(target,box=null){
  return (await this._readMany([{target,box}]))[0];
 }
 async _readMany(requests){
  this._check();
  const transfers=requests.map(({target,box,cacheOnly=false})=>{
   const r=box??[0,0,target.w,target.h];
   if(!Array.isArray(r)||r.length!==4||!r.every(Number.isSafeInteger)||r[0]<0||r[1]<0||r[2]>target.w||r[3]>target.h||r[2]<=r[0]||r[3]<=r[1])throw failure('WATER_INPUT','The Water readback rectangle is invalid.');
   if(target.field&&!cacheOnly)this._ensurePaper(r,target,false);
   const w=r[2]-r[0],h=r[3]-r[1],stride=w*bytesPerPixel[target.format],pitch=Math.ceil(stride/256)*256;
   return {target,r,w,h,stride,pitch,size:pitch*h,row:0};
  });
  const result=new Array(transfers.length);let index=0;
  while(index<transfers.length){
   const batch=[];
   try{
    while(index<transfers.length){
     const item=transfers[index];
     if(this.bytes+item.size>this.maxBytes&&this.pendingRetire.length)this.submit();
     this._reclaimScratch(item.size);
     const available=Math.min(this.maxBytes-this.bytes,this.device.limits.maxBufferSize);
     if(batch.length&&item.size>available)break;
     const rows=Math.min(item.h-item.row,Math.max(1,Math.floor(available/item.pitch)));
     const out=result[index]??=new Uint8Array(item.stride*item.h),buffer=this._buffer(item.pitch*rows,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
     batch.push({...item,buffer,out,rows});
     this._command().copyTextureToBuffer({texture:item.target.texture,origin:[item.r[0],item.r[1]+item.row]},{buffer,bytesPerRow:item.pitch},[item.w,rows]);
     item.row+=rows;if(item.row===item.h)index++;else break;
    }
    this.submit();
    const mapped=await Promise.allSettled(batch.map(({buffer})=>buffer.mapAsync(GPUMapMode.READ)));
    await this._settleErrors();
    const failed=mapped.find(item=>item.status==='rejected');if(failed){this._poison(failed.reason);this._check();}
    for(const {buffer,stride,pitch,rows,row,out} of batch){
     const source=new Uint8Array(buffer.getMappedRange());
     for(let y=0;y<rows;y++)out.set(source.subarray(y*pitch,y*pitch+stride),(row+y)*stride);
    }
   }catch(error){this.submit();throw error;}
   finally{for(const {buffer} of batch){if(buffer.mapState==='mapped')buffer.unmap();this._dropBuffer(buffer);}}
  }
  await this._settleErrors();return result;
 }
 tilt(x,y){
  const next=waterFinishLight(x,y);if(next.every((value,i)=>Math.abs(value-this.light[i])<.003))return false;
  this.light=next;if(!this.finish)return false;
  this.lightDirty=true;return true;
 }
 render({paper=false,white=false,flat=false,box=null,live=false}={}){
  this._check();const profile=getPaper(this.paperId),p=profile.params??profile;
  const lightMode=live?'live':'fixed';if(this.finish&&(this.outputLight!==lightMode||live&&this.lightDirty))box=null;
  if(paper||white||this.paper.field.unknown)this._ensurePaper(box);
  const data=this._parameters();data.set([live?1:0,this.finish?1:0,this.paperScale,0],48);data.set(live?this.light:WATER_FINISH_LIGHT,52);data.set([...this.paperOrigin,this.seed,this.height],56);
  data.set([this.params.granulation*.55*(p.tooth??1),.8,paper?1:white?3:2,flat?1:0],36);
  data.set([...linearHex(p.tint??'#ffffff'),1],40);data.set([...linearHex(p.fleck??'#665544'),p.mottle??.05],44);
  const inputs=[...this.ink.read,...this.fixed,this.wet.read[0],this.paper,this.base,...(this.finish?[this.finish]:[])];
  this._display(inputs,data,box);
  if(paper||white||flat)this.outputCanonical=false;else if(!box)this.outputCanonical=true;
  this.outputLight=lightMode;if(live)this.lightDirty=false;
 }
 async present(texture,box=null,capture=null){
  this.render({box:this.outputCanonical?box:null,live:true});
  this._draw('present',{view:texture.createView(),w:this.width,h:this.height},[this.output]);
  this.submit();
  const frame=capture?.();
  if(waterTiming.on){const submitted=performance.now();waterTiming.presents++;this.device.queue.onSubmittedWorkDone().then(()=>{waterTiming.gpu+=performance.now()-submitted;waterTiming.gpuFrames++;},()=>{});}
  try{
   if(capture){await this.device.queue.onSubmittedWorkDone();await this._settleErrors();}
   else await this._pace();
   return frame;
  }catch(error){frame?.close();throw error;}
 }
 async _pace(){
  this.inFlight.push(this.device.queue.onSubmittedWorkDone().catch(error=>this._poison(error)));
  while(this.inFlight.length>2)await this.inFlight.shift();
  this._check();
 }
 async read(options={}){
  this.render(options);const box=options.box??null;
  return this._readTexture(this.output,box);
 }
 _snapshotPlanes(checkpoint,finish=this.finish){
  const targets={ink0:this.ink.read[0],ink1:this.ink.read[1],fixed0:this.fixed[0],fixed1:this.fixed[1],wet:this.wet.read[0],base:this.base,velocity:this.velocity.read[0],pressure:this.pressure.read[0],...(finish?{finish}:{}),...(checkpoint?{paper:this.paper}:{})};
  return Object.entries(targets).map(([name,target])=>{
   const box=checkpoint&&target.written===null?null:checkpoint&&target.written?target.written.slice():[0,0,target.w,target.h];
   return {name,target,box,bytes:box?(box[2]-box[0])*(box[3]-box[1])*bytesPerPixel[target.format]:0};
  });
 }
 checkpointBytes(){
  this._check();this._flushStamps();
  return this._snapshotPlanes(true).reduce((sum,p)=>sum+p.bytes,0)+(this.maskRead?this.maskRead.w*this.maskRead.h*4:0);
 }
 async snapshot({checkpoint=false}={}){
  this._check();if(checkpoint)this._flushStamps();
  const state={width:this.width,height:this.height,paperScale:this.paperScale,paperOrigin:this.paperOrigin.slice(),meta:this._meta()},entries=this._snapshotPlanes(checkpoint);
  const pending=checkpoint?this.maskRead:null;
  const transient=checkpoint?{paper:{regions:this.paper.field.regions.map(r=>r.slice()),unknown:this.paper.field.unknown},simBox:this.simBox?.slice()??null,flowMayMove:this.flowMayMove,trimEpoch:this.trimEpoch}:null;
  const requests=entries.filter(p=>p.box).map(({target,box})=>({target,box,cacheOnly:checkpoint}));
  if(!requests.length)this.submit();
  const values=await this._readMany(requests);let index=0;
  const layers=Object.fromEntries(entries.map(({name,box})=>[name,box?values[index++]:new Uint8Array(0)]));
  if(checkpoint){
   if(pending?.state==='pending')await pending.mapped;
   transient.layerRects=Object.fromEntries(entries.map(({name,box})=>[name,box]));
   transient.paper.bytes=layers.paper;delete layers.paper;
   transient.trim=pending?{pixels:this._trimPixels(pending),width:pending.w,height:pending.h,due:pending.due,epoch:pending.epoch}:null;state.checkpoint=transient;
  }
  return {...state,layers};
 }
 _restoreMetadata(state){
  const input=state?.meta,meta={};
  if(!input||typeof input!=='object')throw failure('WATER_INPUT','The Water checkpoint metadata is incomplete.');
  const controls=['flow','bleed','dry','edge','granulation'];
  if(!input.params||Object.keys(input.params).length!==controls.length||controls.some(key=>!Number.isFinite(input.params[key])||input.params[key]<0||input.params[key]>1))throw failure('WATER_INPUT','The Water checkpoint controls are invalid.');
  meta.params={...input.params};
  for(const key of ['active','dirty','painted']){
   const r=input[key];
   if(r==null){meta[key]=null;continue;}
   if(!Array.isArray(r)||r.length!==4||!r.every(Number.isSafeInteger)||r[0]<0||r[1]<0||r[2]>this.width||r[3]>this.height||r[2]<r[0]||r[3]<r[1])throw failure('WATER_INPUT','The Water checkpoint bounds are invalid.');
   meta[key]=r.slice();
  }
  for(const key of ['wetPeak','fixTimer','elapsed','lastWet','awakeUntil','flowSpeed','growCarry']){
   if(!Number.isFinite(input[key])||input[key]<0)throw failure('WATER_INPUT','The Water checkpoint timing is invalid.');meta[key]=input[key];
  }
  if(!waterTimeFits(meta.elapsed))throw failure('WATER_INPUT','The Water checkpoint timing is invalid.');
  if(!Number.isSafeInteger(input.frame)||input.frame<0||!Array.isArray(input.brushNow)||input.brushNow.length!==3||!input.brushNow.every(Number.isFinite)||input.brushNow[2]<0||!getPaper(input.paperId))throw failure('WATER_INPUT','The Water checkpoint material is invalid.');
  meta.frame=input.frame;meta.brushNow=input.brushNow.slice();meta.paperId=input.paperId;
  meta.paperScale=state.paperScale;meta.paperOrigin=Array.isArray(state.paperOrigin)?state.paperOrigin.slice():null;meta.seed=input.seed??this.seed;
  if(!Number.isFinite(meta.paperScale)||meta.paperScale<=0||!Array.isArray(meta.paperOrigin)||meta.paperOrigin.length!==2||!meta.paperOrigin.every(Number.isFinite)||!Number.isFinite(meta.seed)||meta.seed<0||meta.seed>1)throw failure('WATER_INPUT','The Water checkpoint paper is invalid.');
  return meta;
 }
 async restore(state){
  this._check();if(state?.width!==this.width||state?.height!==this.height)throw failure('WATER_INPUT','The Water checkpoint dimensions differ.');
  const meta=this._restoreMetadata(state),checkpoint=state.checkpoint,hasFinish=Object.hasOwn(state.layers??{},'finish');
  const finishLayout=hasFinish?{w:this.width,h:this.height,format:'rgba16float',written:null}:null;
  const planes=this._snapshotPlanes(checkpoint!==undefined,finishLayout);
  const rect=(r,w,h)=>Array.isArray(r)&&r.length===4&&r.every(Number.isSafeInteger)&&r[0]>=0&&r[1]>=0&&r[2]<=w&&r[3]<=h&&r[2]>r[0]&&r[3]>r[1];
  if(checkpoint!==undefined){
   if(!checkpoint||typeof checkpoint!=='object'||!checkpoint.layerRects||Object.keys(checkpoint.layerRects).length!==planes.length||!Array.isArray(checkpoint.paper?.regions)||checkpoint.paper.regions.some(r=>!rect(r,this.width,this.height))||typeof checkpoint.paper.unknown!=='boolean'||typeof checkpoint.flowMayMove!=='boolean'||!Number.isSafeInteger(checkpoint.trimEpoch)||checkpoint.trimEpoch<0||checkpoint.simBox!==null&&!rect(checkpoint.simBox,this.sw,this.sh))throw failure('WATER_INPUT','The Water continuation checkpoint is invalid.');
   const trim=checkpoint.trim;
   const maskLimit=Math.ceil(this.device.limits.maxTextureDimension2D/16);
   if(trim!==null&&(!trim||!Number.isSafeInteger(trim.due)||trim.due<0||!Number.isSafeInteger(trim.epoch)||trim.epoch<0||![trim.width,trim.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=maskLimit)||trim.pixels!==null&&(!ArrayBuffer.isView(trim.pixels)||trim.pixels.byteLength!==trim.width*trim.height*4)))throw failure('WATER_INPUT','The Water continuation mask is invalid.');
  }
  for(const plane of planes){
   const {name,target}=plane,r=checkpoint?checkpoint.layerRects[name]:plane.box,bytes=name==='paper'?checkpoint.paper.bytes:state.layers?.[name];
   if(r!==null&&!rect(r,target.w,target.h)||!ArrayBuffer.isView(bytes)||bytes.byteLength!==(r?(r[2]-r[0])*(r[3]-r[1])*bytesPerPixel[target.format]:0))throw failure('WATER_INPUT','The Water checkpoint is incomplete.');
   plane.box=r?.slice()??null;plane.data=bytes;
  }
  if(checkpoint?.paper.regions.some(r=>{const kept=checkpoint.layerRects.paper;return !kept||r[0]<kept[0]||r[1]<kept[1]||r[2]>kept[2]||r[3]>kept[3];}))throw failure('WATER_INPUT','The Water continuation paper bounds are invalid.');
  const targets=planes.filter(p=>p.name!=='paper');
  const write=({target,box,data})=>{if(box)this._writeTexture({texture:target.texture,origin:[box[0],box[1]]},data,{bytesPerRow:(box[2]-box[0])*bytesPerPixel[target.format]},[box[2]-box[0],box[3]-box[1]]);target.written=box?.slice()??null;};
  const fresh=!this.transaction&&[...this._material(),...this.velocity.read,...this.velocity.write,...this.pressure.read,...this.pressure.write,this.paper].every(t=>t.written===null)&&!this.paper.field.regions.length;
  this.endFill();this.submit();this._protect([0,0,this.width,this.height]);this._reserve(this.width*this.height*((checkpoint?0:8)+(fresh?0:4)+(hasFinish&&!(fresh&&this.finish)?8:0)));
  const paper=fresh?this.paper:this._texture(this.width,this.height,'rgba8unorm');let finish=null;
  try{
   if(hasFinish){finish=fresh&&this.finish?this.finish:this._texture(this.width,this.height,'rgba16float');targets.find(plane=>plane.name==='finish').target=finish;}
   this._paper(paper,meta.paperId,meta,checkpoint?.paper.regions??null);paper.field.unknown=checkpoint?.paper.unknown??true;
   if(checkpoint)write({...planes.at(-1),target:paper});
   this.submit();await this._settleErrors();
  }catch(error){if(paper!==this.paper)this._retire(paper);if(finish&&finish!==this.finish)this._retire(finish);throw error;}
  if(checkpoint){for(const {target}of targets)if(target.written!==null)this._clear(target);this.submit();}
  for(const plane of targets)write(plane);
  const old=this.paper,oldFinish=this.finish;this.paper=paper;this.finish=finish;Object.assign(this,meta);this.painting=false;this.outputCanonical=false;
  this.flowMayMove=checkpoint?.flowMayMove??true;this.simBox=checkpoint?checkpoint.simBox?.slice()??null:this.active?[0,0,this.sw,this.sh]:null;
  if(checkpoint){
   if(this.maskRead?.buffer){if(this.maskRead.buffer.mapState==='mapped')this.maskRead.buffer.unmap();this._dropBuffer(this.maskRead.buffer);}
   this.maskRead=checkpoint.trim?{...checkpoint.trim,w:checkpoint.trim.width,h:checkpoint.trim.height,pixels:checkpoint.trim.pixels?.slice()??null,state:checkpoint.trim.pixels?'ready':'failed'}:null;
   this.trimEpoch=checkpoint.trimEpoch;
  }
  if(old!==paper&&old!==this.transaction?.paper && old!==this.transaction?.sheet?.paper)this._retire(old);
  if(oldFinish&&oldFinish!==finish&&oldFinish!==this.transaction?.finish&&oldFinish!==this.transaction?.sheet?.finish)this._retire(oldFinish);
  for(const pair of [this.ink,this.wet,this.velocity,this.pressure])pair.read.forEach((t,i)=>{
   const destination=pair.write[i];
   if(!checkpoint){this._copy(t,destination);return;}
   if(destination.written!==null)this._clear(destination);
   if(t.written)this._copy(t,destination,t.written);destination.written=t.written?.slice()??null;
  });this.submit();await this._settleErrors();
 }
 async grow(left,top,right,bottom){
  this._check();
  if(![left,top,right,bottom].every(v=>Number.isSafeInteger(v)&&v>=0))throw failure('WATER_INPUT','The Water sheet growth is not valid.');
  return this.reframe(this.width+left+right,this.height+top+bottom,left,top);
 }
 async _capturePlane(target){
  const rect=target.written===undefined?[0,0,target.w,target.h]:target.written?.slice()??null;
  return {rect,bytes:rect?(await this._readMany([{target,box:rect,cacheOnly:true}]))[0]:new Uint8Array(0)};
 }
 async _captureSheet(sheet,meta,paper=sheet.paper,simulation=[...sheet.velocity.read,...sheet.pressure.read]){
  const material=[...sheet.ink.read,...sheet.fixed,...sheet.wet.read,sheet.base,...(sheet.finish?[sheet.finish]:[])];
  const planes=[...material,...simulation,paper].map(target=>({target,rect:target.written===null?null:target.written?.slice()??[0,0,target.w,target.h]}));
  const values=await this._readMany(planes.filter(p=>p.rect).map(({target,rect})=>({target,box:rect,cacheOnly:true})));let index=0;
  const captured=planes.map(({rect})=>({rect,bytes:rect?values[index++]:new Uint8Array(0)}));
  return {width:sheet.width,height:sheet.height,meta,layers:captured.slice(0,material.length),sim:captured.slice(material.length,-1),paper:{...captured.at(-1),field:structuredClone(paper.field)}};
 }
 _uploadCaptured(target,plane,width,height,rect=null,offset=null){
  if(!plane.rect)return;
  const r=rect??[0,0,width,height],to=offset??r,kept=plane.rect;
  const source=[Math.max(r[0],kept[0]),Math.max(r[1],kept[1]),Math.min(r[2],kept[2]),Math.min(r[3],kept[3])];
  if(source[2]<=source[0]||source[3]<=source[1])return;
  const stride=(kept[2]-kept[0])*bytesPerPixel[target.format],start=(source[1]-kept[1])*stride+(source[0]-kept[0])*bytesPerPixel[target.format];
  this._writeTexture({texture:target.texture,origin:[to[0]+source[0]-r[0],to[1]+source[1]-r[1]]},plane.bytes,{offset:start,bytesPerRow:stride},[source[2]-source[0],source[3]-source[1]]);
 }
 async _restoreCapture(state){
  this._allocate(state.width,state.height,state.layers.length>6);
  this._material().forEach((target,i)=>this._uploadCaptured(target,state.layers[i],state.width,state.height));
  for(const [i,target]of [...this.velocity.read,...this.pressure.read].entries())this._uploadCaptured(target,state.sim[i],target.w,target.h);
  this._uploadCaptured(this.paper,state.paper,state.width,state.height);this.paper.field=structuredClone(state.paper.field);
  Object.assign(this,state.meta);this.outputCanonical=false;this.painting=false;this.flowMayMove=true;
  this.simBox=this.active?[0,0,this.sw,this.sh]:null;
  for(const pair of [this.ink,this.wet,this.velocity,this.pressure])pair.read.forEach((t,i)=>this._copy(t,pair.write[i]));
  this.submit();await this._settleErrors();
 }
 async _captureCheckpoint(tx,current,old){
  if(!tx||tx.cpu)return null;
  const state=tx.sheet?await this._captureSheet(tx.sheet,tx.meta):{...current,layers:current.layers.slice(),meta:tx.meta,sim:[],paper:current.paper};
  const patches=[];
  for(const {r,layers}of tx.tiles.values())for(const [index,target]of layers){
   const original=tx.materialRects[index];if(!original)continue;
   const kept=[Math.max(r[0],original[0]),Math.max(r[1],original[1]),Math.min(r[2],original[2]),Math.min(r[3],original[3])];
   if(kept[2]>kept[0]&&kept[3]>kept[1])patches.push({r:kept,index,target,box:[kept[0]-r[0],kept[1]-r[1],kept[2]-r[0],kept[3]-r[1]],bytes:null});
  }
  const reads=patches.filter(p=>p.target.written!==null),values=await this._readMany(reads.map(({target,box})=>({target,box,cacheOnly:true})));
  reads.forEach((patch,i)=>{patch.bytes=values[i];});
  if(!tx.sheet)for(const target of tx.sim)state.sim.push(await this._capturePlane(target));
  if(!tx.sheet&&tx.paper!==old.paper)state.paper={...await this._capturePlane(tx.paper),field:structuredClone(tx.paper.field)};
  if(!tx.sheet&&tx.finish&&tx.finish!==old.finish)state.layers[6]=await this._capturePlane(tx.finish);
  const layers=tx.materialRects.map((rect,index)=>{
   if(!rect)return {rect:null,bytes:new Uint8Array(0)};
   const original=state.layers[index],bpp=index===4?2:index===5?4:8,stride=(rect[2]-rect[0])*bpp;
   if(original.rect&&rect.every((v,i)=>v===original.rect[i]))return {rect:rect.slice(),bytes:original.bytes};
   const bytes=new Uint8Array(stride*(rect[3]-rect[1])),r=original.rect;
   if(r){const x0=Math.max(rect[0],r[0]),y0=Math.max(rect[1],r[1]),x1=Math.min(rect[2],r[2]),y1=Math.min(rect[3],r[3]),row=(r[2]-r[0])*bpp;
    if(x1>x0)for(let y=y0;y<y1;y++)bytes.set(original.bytes.subarray((y-r[1])*row+(x0-r[0])*bpp,(y-r[1])*row+(x1-r[0])*bpp),(y-rect[1])*stride+(x0-rect[0])*bpp);}
   return {rect:rect.slice(),bytes};
  });
  return {state,patches,layers};
 }
 _retainCapture(tx,capture){
  if(!capture)return;
  const {state,patches,layers}=capture;
  for(const {index,r,bytes:patch}of patches){const target=layers[index],bpp=index===4?2:index===5?4:8,row=(r[2]-r[0])*bpp,stride=(target.rect[2]-target.rect[0])*bpp;
   for(let y=r[1];y<r[3];y++){const offset=(y-target.rect[1])*stride+(r[0]-target.rect[0])*bpp;if(patch)target.bytes.set(patch.subarray((y-r[1])*row,(y-r[1]+1)*row),offset);else target.bytes.fill(0,offset,offset+row);}}
  state.layers=layers;
  tx.cpu=state;tx.sheet=null;tx.paper=null;tx.finish=null;tx.tiles.clear();tx.sim=[];
 }
 async reframe(w,h,x=0,y=0){
  this._check();this._dimensions(w,h);
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y))throw failure('WATER_INPUT','The Water sheet offset is not valid.');
  if(w===this.width&&h===this.height&&!x&&!y)return;
  this.endFill();this.submit();this._dropScratch();
  const previous=this._material(),old=this._sheet(),meta=this._meta(),tx=this.transaction;
  const nextLayout=sheetLayout(w,h);this._dimensions(nextLayout.sw,nextLayout.sh);
  const disposable=[old.curl,old.divergence,old.output,old.mask];
  const need=nextLayout.bytes+w*h*(this.finish?8:0),pressure=this.bytes-disposable.reduce((sum,t)=>sum+t.bytes,0)+need>this.maxBytes;
  const retired=new Set(this._sheetTextures(old));
  if(pressure&&tx){if(tx.sheet)this._sheetTextures(tx.sheet).forEach(t=>retired.add(t));if(tx.paper)retired.add(tx.paper);if(tx.finish)retired.add(tx.finish);tx.sim.forEach(t=>retired.add(t));for(const {layers}of tx.tiles.values())layers.forEach(t=>retired.add(t));}
  if(pressure&&this.bytes-[...retired].reduce((sum,t)=>sum+(t.dead?0:t.bytes),0)+need>this.maxBytes)this._reserve(need);
  let current=null,checkpoint=null,grown,released=false;
  await this._finishMaterial();this._compactSheet(old,false);
  try{
   if(pressure){
    current=await this._captureSheet(old,meta);checkpoint=await this._captureCheckpoint(tx,current,old);
    this.recovery={current,checkpoint};retired.forEach(t=>this._drop(t,false));released=true;
   }
   grown=this._allocate(w,h);const next=this._material();
   const sx=Math.max(0,-x),sy=Math.max(0,-y),dx=Math.max(0,x),dy=Math.max(0,y);
   const cw=Math.min(old.width-sx,w-dx),ch=Math.min(old.height-sy,h-dy);
   if(cw>0&&ch>0)previous.forEach((t,i)=>current?this._uploadCaptured(next[i],current.layers[i],old.width,old.height,[sx,sy,sx+cw,sy+ch],[dx,dy]):this._copy(t,next[i],[sx,sy,sx+cw,sy+ch],[dx,dy]));
   for(const pair of [this.ink,this.wet])pair.read.forEach((t,i)=>this._copy(t,pair.write[i]));
   const bottom=h-old.height-y;
   this.paperOrigin=[meta.paperOrigin[0]-x,meta.paperOrigin[1]-bottom];
   this.brushNow=[(meta.brushNow[0]*old.width+x)/w,(meta.brushNow[1]*old.height+bottom)/h,meta.brushNow[2]*old.height/h];
   for(const key of ['active','painted'])if(this[key]){
    const r=this[key],shifted=[Math.max(0,r[0]+x),Math.max(0,r[1]+y),Math.min(w,r[2]+x),Math.min(h,r[3]+y)];
    this[key]=shifted[2]>shifted[0]&&shifted[3]>shifted[1]?shifted:null;
   }
   const kept=[],required=old.paper.field.regions.map(r=>[Math.max(0,r[0]+x),Math.max(0,r[1]+y),Math.min(w,r[2]+x),Math.min(h,r[3]+y)]).filter(r=>r[2]>r[0]&&r[3]>r[1]);
   if([...meta.paperOrigin,...this.paperOrigin].every(value=>Number.isSafeInteger(value)&&Math.abs(value)<=16777216))for(const region of required){
    const r=[Math.max(region[0],dx+1),Math.max(region[1],dy+1),Math.min(region[2],dx+cw-1),Math.min(region[3],dy+ch-1)];
    if(r[2]>r[0]&&r[3]>r[1]){kept.push(r);if(current)this._uploadCaptured(this.paper,current.paper,old.width,old.height,[r[0]-x,r[1]-y,r[2]-x,r[3]-y],r);else this._copy(old.paper,this.paper,[r[0]-x,r[1]-y,r[2]-x,r[3]-y],r);}
   }
   this.dirty=[0,0,w,h];this._paper(this.paper,this.paperId,this,kept);this.paper.field.unknown=old.paper.field.unknown;
   for(const rect of required)this._ensurePaper(rect,this.paper,false);
   this.simBox=this.active?this._simRect(this.active):null;
   this.submit();await this._settleErrors();
   if(current){this._retainCapture(tx,checkpoint);this.recovery=null;}
   else if(tx&&!tx.sheet&&!tx.cpu)await this._keepCheckpointSheet(tx,old);
   else {await this._finishMaterial();this._sheetTextures(old).forEach(t=>{if(t!==tx?.paper)this._drop(t,false);});}
  }catch(error){
   this.encoder=null;this.slots=0;this.pendingRetire.forEach(t=>this._drop(t,false));this.pendingRetire=[];
   try{await this.device.queue.onSubmittedWorkDone();}catch(cause){this._poison(cause);}
   if(grown)this._sheetTextures(grown).forEach(t=>this._drop(t,false));
   if(this.gpuError||this.lost){if(!released)this.recovery={sheet:old,meta,transaction:tx};throw error;}
   if(released){let restored=false;try{await this._restoreCapture(current);restored=true;}finally{this._retainCapture(tx,checkpoint);if(restored)this.recovery=null;}}
   else {Object.assign(this,old,meta);this.outputCanonical=false;this.recovery={sheet:old,meta};Object.assign(this,this._expandSheet(old));this.recovery=null;}
   this.simBox=null;this.flowMayMove=true;
   throw error;
  }
 }
 stats(){return {backend:'webgpu',bytes:this.bytes,presentationBytes:this.presentationBytes,width:this.width,height:this.height,simulation:[this.sw,this.sh],active:this.active?.slice()??null,frames:this.frame};}
 dispose(){
  if(this.disposed)return;
  try{this.submit();}finally{this._release();for(const stamp of this.timeStamps??[]){stamp.set.destroy();stamp.resolve.destroy();stamp.read.destroy();}this.timeStamps=null;this.transaction=null;this.fill=null;this.disposed=true;}
 }
}
