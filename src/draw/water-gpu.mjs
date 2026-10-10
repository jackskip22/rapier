// SPDX-License-Identifier: AGPL-3.0-only
// GPU material is transient. The retained document owns the last published straight RGBA pixels.
import {waterShaderSources} from './water-shaders.mjs';
import {getPaper,makeTip,getBrush,WATER_TIP_SIZE} from './water-materials.mjs';
import {waterTimeFits} from './water-data.mjs';

export const WATER_GPU_MAX_BYTES=384*1024*1024;
const UNIFORM_SLOTS=2048,UNIFORM_BYTES=64*UNIFORM_SLOTS*4;
function sheetLayout(w,h){
 const aspect=w/h,sw=aspect>=1?Math.round(256*aspect):256,sh=aspect>=1?256:Math.round(256/aspect);
 return {sw,sh,bytes:w*h*64+sw*sh*16+Math.ceil(w/16)*Math.ceil(h/16)*4};
}
// Reserve a blank hand's full reachable sheet only when its first transaction (and a growth
// stride, when one is named) also fit. Later work still uses the live allocator's admission.
export function waterHandSheetFits(w,h,growth,tip=null,maxBytes=WATER_GPU_MAX_BYTES){
 if(![w,h,growth].every(Number.isSafeInteger)||w<1||h<1||growth<0)return false;
 const W=w+growth,H=h+growth,old=sheetLayout(w,h),next=growth?sheetLayout(W,H):{bytes:0};
 const tipBytes=tip?tip.width*tip.height:WATER_TIP_SIZE*WATER_TIP_SIZE;
 const rollback=w*h*38+old.sw*old.sh*6;
 const scratch=Math.max(W*H*8,Math.ceil(W*8/256)*256*H);
 return UNIFORM_BYTES+4+tipBytes+old.bytes+rollback+next.bytes+scratch<=maxBytes;
}

const bytesPerPixel={r16float:2,rg16float:4,rg32float:8,rgba16float:8,rgba8unorm:4,r8unorm:1};
const FULL=GPU=>GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST;
const union=(a,b)=>a?[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])]:b.slice();
const failure=(code,message)=>Object.assign(new Error(message),{code,recoverable:true});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// A step longer than this is idle time, not an animation frame: the wash dries through it in full.
const WATER_IDLE_SECONDS=1;
// Paper pixels baked in one GPU submission at most.
const PAPER_BAND_PIXELS=196608;
// Paper units spanned by one reference-engine texel on the owner's target screenshots (1100 units over 900 texels).
// Per-texel transport and edge terms act across this distance, so a sheet's resolution does not change its look.
export const WATER_REFERENCE_TEXEL=1100/900;
const linearHex=hex=>[1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
let deviceTask=null,deviceOwner=null;
const libraries=new WeakMap();
const watchLoss=(device,reference)=>device.lost.then(info=>{const surface=reference.deref();if(surface)surface.lost=info;});
const watchErrors=reference=>event=>{reference.deref()?._poison(event.error);};

// A test switch: the witness runs a desktop adapter with the phone's unfiltered float path (`waterShaderSources`).
let unfilteredTest=false;
export function waterUnfilteredTest(on){if(on===unfilteredTest)return;unfilteredTest=on;deviceTask=null;}
export async function waterReady(){
 const owner=globalThis.navigator?.gpu;
 if(!owner)throw failure('water_webgpu_unavailable','Water needs WebGPU. Open this document in a browser with WebGPU enabled.');
 if(owner!==deviceOwner){deviceOwner=owner;deviceTask=null;}
 if(!deviceTask)deviceTask=(async()=>{
  const adapter=await owner.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw failure('water_webgpu_unavailable','Water could not obtain a WebGPU adapter. Enable GPU acceleration and reopen the document.');
  // Float filtering and blending are requested only when the adapter has them. Sampling in the
  // shaders does not depend on filtering; stamps still blend when the device can.
  const features=['float32-filterable','float32-blendable'].filter(name=>adapter.features.has(name)&&!(unfilteredTest&&name==='float32-filterable'));
  const device=await adapter.requestDevice(features.length?{requiredFeatures:features}:{});
  device.lost.then(()=>{deviceTask=null;});return device;
 })().catch(error=>{deviceTask=null;throw error?.code?error:failure('water_webgpu_unavailable','Water could not start WebGPU: '+error.message);});
 return deviceTask;
}

async function programLibrary(device,firstPaper){
 if(libraries.has(device))return libraries.get(device);
 const task=(async()=>{
  const visibility=GPUShaderStage.FRAGMENT;
  const bindingEntries=firstSampleType=>[
   {binding:0,visibility,buffer:{type:'uniform',hasDynamicOffset:true,minBindingSize:256}},
   {binding:1,visibility,sampler:{type:'filtering'}},{binding:2,visibility,sampler:{type:'non-filtering'}},
   ...Array.from({length:8},(_,i)=>({binding:i+3,visibility,texture:{sampleType:i?'float':firstSampleType}}))
  ];
  const layout=device.createBindGroupLayout({entries:bindingEntries('float')});
  const fillLayout=device.createBindGroupLayout({entries:bindingEntries('unfilterable-float')});
  const pipelineLayout=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const fillPipelineLayout=device.createPipelineLayout({bindGroupLayouts:[fillLayout]});
  const linear=device.createSampler({minFilter:'linear',magFilter:'linear'}),nearest=device.createSampler();
  const descriptions={stampInk:['rgba16float','rgba16float','add'],stampWet:['r16float','max'],splatInk:['rgba16float','rgba16float','add'],
   velocitySplat:['rg16float','add'],wetSplat:['r16float','max'],fillInk:['rgba16float','rgba16float','add'],fillWet:['r16float','max'],liftInk:['rgba16float','rgba16float','lift'],liftWet:['r16float','lift'],
   eraseFixed:['rgba16float','rgba16float','lift'],eraseBase:['rgba8unorm','lift','alpha'],
   velocity:['rg16float'],curl:['r16float'],vorticity:['rg16float'],divergence:['r16float'],pressureDecay:['r16float'],pressure:['r16float'],project:['rg16float'],
   wet:['r16float'],bleach:['rgba16float','rgba16float','multiply'],fix:['rgba16float','rgba16float','add'],pigment:['rgba16float','rgba16float'],
   mask:['rgba8unorm'],paperField:['rgba16float'],paperLight:['rgba8unorm'],display:['rgba8unorm'],present:['rgba8unorm']};
  const blend={add:{srcFactor:'one',dstFactor:'one',operation:'add'},max:{srcFactor:'one',dstFactor:'one',operation:'max'},
   lift:{srcFactor:'zero',dstFactor:'one-minus-src',operation:'add'},multiply:{srcFactor:'zero',dstFactor:'src',operation:'add'}};
  const modules=new Map(),pipelines={},loadOps={};let paperDescription;
  const sources=waterShaderSources(!device.features.has('float32-filterable'));
  for(const [name,source] of Object.entries(sources))modules.set(name,device.createShaderModule({label:'Water '+name,code:source}));
  // Compile the first paper with the material pipelines; later papers compile on demand.
  const compile=await Promise.allSettled(Object.entries(descriptions).map(async([name,settings])=>{
   const kind=name==='paperField'?firstPaper:null;
   const alphaOnly=settings.at(-1)==='alpha',blendSettings=alphaOnly?settings.slice(0,-1):settings;
   const mode=blend[blendSettings.at(-1)]?blendSettings.at(-1):null;
   const formats=mode?blendSettings.slice(0,-1):blendSettings;
   loadOps[name]=mode||alphaOnly?'load':'clear';
   const module=modules.get(name==='velocitySplat'||name==='wetSplat'?'splat':name==='eraseFixed'?'liftInk':name==='eraseBase'?'liftWet':name);
   const description={label:'Water '+name,layout:name.startsWith('fill')?fillPipelineLayout:pipelineLayout,vertex:{module,entryPoint:'vertex'},
    fragment:{module,entryPoint:'fragment',...(kind===null?{}:{constants:{paperKind:kind}}),targets:formats.map(format=>({format,...(mode?{blend:{color:blend[mode],alpha:blend[mode]}}:{}),...(alphaOnly?{writeMask:8}:{})}))},primitive:{topology:'triangle-list'}};
   if(name==='paperField')paperDescription=description;
   const pipeline=await device.createRenderPipelineAsync(description);
   if(kind===null)pipelines[name]=pipeline;else (pipelines[name]??=[])[kind]=pipeline;
  }));
  const bad=compile.find(r=>r.status==='rejected');if(bad)throw bad.reason;
  return {layout,fillLayout,linear,nearest,pipelines,loadOps,paperDescription};
 })();
 libraries.set(device,task);try{return await task;}catch(error){libraries.delete(device);throw error;}
}

export class WaterGPU {
 constructor(width,height,options={}){
  this.width=width;this.height=height;this.maxBytes=options.maxBytes??WATER_GPU_MAX_BYTES;
  this.paperId=options.paper??'cold-press';this.seed=options.seed??1;this.paperScale=options.paperScale??1100/height;
  this.paperOrigin=options.paperOrigin?.slice()??[0,0];this.texelScale=options.texelScale??null;
  this.params={flow:.45,bleed:.5,dry:.4,edge:.5,granulation:.45,...options.params};
  this.active=null;this.dirty=null;this.painted=null;this.wetPeak=0;this.fixTimer=0;this.elapsed=0;this.lastWet=0;this.awakeUntil=0;
  this.flowSpeed=0;this.growCarry=0;this.frame=0;this.brushNow=[0,0,0];this.bytes=0;this.transaction=null;this.lost=null;this.disposed=false;
  this.tips=new Map();this.targets=new Set();this.buffers=new Map();this.bindings=new Map();this.targetSequence=0;this.fill=null;
  this.pendingErrors=new Set();this.gpuError=null;this.errorListener=null;this.simBox=null;this.painting=false;this._scratch=new Float32Array(64);
  this.pendingRetire=[];this.encoder=null;this.slots=0;this.uniformData=new Float32Array(UNIFORM_BYTES/4);
  this.queued=new Map();this.scratch=new Map();this.inFlight=[];this.maskRead=null;this.trimEpoch=0;
  this.ready=this._initialize(options.device);
 }
 async _initialize(given){
  try{
   this.device=given??await waterReady();this._check();const reference=new WeakRef(this);watchLoss(this.device,reference);
   this.errorListener=watchErrors(reference);this.device.addEventListener('uncapturederror',this.errorListener);
   this.library=await programLibrary(this.device,getPaper(this.paperId)?.params?.kind??0);this._check();
   this.uniforms=this._buffer(this.uniformData.byteLength,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
   this.dummy=this._texture(1,1,'rgba8unorm');
   this._allocate(this.width,this.height);this._paper();await this._bakePaper();await this._settleErrors();return this;
  }catch(error){this.encoder=null;this.slots=0;this.pendingRetire=[];this._release();this.disposed=true;throw error;}
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
  // Scopes close in this same synchronous call, so surfaces sharing a device cannot interleave them.
  let scopes=0;
  try{
   this.device.pushErrorScope('out-of-memory');scopes++;
   this.device.pushErrorScope('validation');scopes++;
   return action();
  }catch(error){this._poison(error);throw this.gpuError??error;}
  finally{while(scopes){const kind=scopes--===2?'validation':'out-of-memory';try{this._watchError(this.device.popErrorScope(),kind);}catch(error){this._poison(error);}}}
 }
 async _settleErrors(){while(this.pendingErrors.size)await Promise.all([...this.pendingErrors]);this._check();}
 // Regional targets are disposable. Submit their encoded uses before reclaiming their storage.
 _reclaimScratch(bytes,credit=0){
  if(this.bytes+bytes-credit>this.maxBytes){this._dropScratch();this._submitEncoder();}
 }
 _reserve(bytes,keepScratch=false){
  if(!keepScratch)this._reclaimScratch(bytes);
  if(this.bytes+bytes>this.maxBytes)throw failure('WATER_BUDGET','Water cannot keep this whole edit in GPU memory. Use a new or smaller layer.');
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
 _drop(t){if(!t||t.dead)return;t.dead=true;this.targets.delete(t);this.bytes-=t.bytes;t.texture.destroy();this.bindings.clear();}
 _buffer(size,usage){
  this._check();
  if(size>this.device.limits.maxBufferSize)throw failure('WATER_BUDGET','The Water transfer exceeds the GPU buffer size.');
  this._reserve(size);const buffer=this._guard(()=>this.device.createBuffer({size,usage}));this.buffers.set(buffer,size);this.bytes+=size;return buffer;
 }
 _dropBuffer(buffer){const bytes=this.buffers.get(buffer);if(bytes===undefined)return;this.buffers.delete(buffer);this.bytes-=bytes;buffer.destroy();}
 _release(){
  if(this.errorListener)this.device.removeEventListener('uncapturederror',this.errorListener);this.errorListener=null;this.pendingErrors.clear();
  for(const t of this.targets)this._drop(t);for(const buffer of this.buffers.keys())this._dropBuffer(buffer);
  this.tips.clear();this.bindings.clear();this.uniformData=new Float32Array(0);this.pendingRetire=[];
  this.uniforms=null;this.library=null;this.encoder=null;this.slots=0;
 }
 _pair(w,h,formats,make=(...args)=>this._texture(...args)){return {read:formats.map(f=>make(w,h,f)),write:formats.map(f=>make(w,h,f))};}
 _allocate(w,h){
  const {sw,sh,bytes}=sheetLayout(w,h);
  this._dimensions(w,h);this._dimensions(sw,sh);
  this._reserve(bytes+w*h*8);
  const made=[],make=(...args)=>{const t=this._texture(...args);made.push(t);return t;};
  try{
   const sheet={width:w,height:h,sw,sh,velocity:this._pair(sw,sh,['rg16float'],make),pressure:this._pair(sw,sh,['r16float'],make),
    curl:make(sw,sh,'r16float'),divergence:make(sw,sh,'r16float'),ink:this._pair(w,h,['rgba16float','rgba16float'],make),
    wet:this._pair(w,h,['r16float'],make),fixed:[make(w,h,'rgba16float'),make(w,h,'rgba16float')],
    paper:make(w,h,'rgba8unorm'),base:make(w,h,'rgba8unorm'),output:make(w,h,'rgba8unorm'),mask:make(Math.ceil(w/16),Math.ceil(h/16),'rgba8unorm')};
   Object.assign(this,sheet);return sheet;
  }catch(error){made.forEach(t=>this._drop(t));throw error;}
 }
 _sheet(){return Object.fromEntries(['width','height','sw','sh','velocity','pressure','curl','divergence','ink','wet','fixed','paper','base','output','mask'].map(key=>[key,this[key]]));}
 _sheetTextures(sheet){return [...sheet.velocity.read,...sheet.velocity.write,...sheet.pressure.read,...sheet.pressure.write,sheet.curl,sheet.divergence,...sheet.ink.read,...sheet.ink.write,...sheet.wet.read,...sheet.wet.write,...sheet.fixed,sheet.paper,sheet.base,sheet.output,sheet.mask];}
 _command(){this._check();return this.encoder??=this.device.createCommandEncoder({label:'Water material'});}
 submit(){
  this._flushStamps();this._submitEncoder();
 }
 _submitEncoder(){
  if(!this.encoder)return;
  const encoder=this.encoder,slots=this.slots;this.encoder=null;this.slots=0;
  try{this._guard(()=>{
   if(slots)this.device.queue.writeBuffer(this.uniforms,0,this.uniformData.buffer,0,slots*256);
   this.device.queue.submit([encoder.finish()]);
  });}finally{for(const t of this.pendingRetire)this._drop(t);this.pendingRetire=[];}
 }
 // Outside recorded writes, a new or cleared texture retains positive zero.
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
 // Sheet pixels per reference texel.
 get reach(){return this.texelScale??clamp(WATER_REFERENCE_TEXEL/this.paperScale,.5,4);}
 _parameters(w=this.width,h=this.height){
  const data=this._scratch;data.fill(0);data.set([w,h,this.sw,this.sh],0);
  data.set([0,this.params.flow,this.params.bleed,this.params.edge*1.4],4);data.set(this.brushNow,12);data[15]=this.reach;return data;
 }
 _draw(name,destinations,inputs=[],data=this._parameters(),rect=null){
  this._flushStamps();
  if(this.slots===UNIFORM_SLOTS)this.submit();
  if(name==='paperField'&&!this.library.pipelines.paperField[data[50]]){
   const description=this.library.paperDescription;
   this.library.pipelines.paperField[data[50]]=this._guard(()=>this.device.createRenderPipeline({...description,fragment:{...description.fragment,constants:{paperKind:data[50]}}}));
  }
  const encoder=this._command(),targets=Array.isArray(destinations)?destinations:[destinations],target=targets[0];
  data[0]=target.w;data[1]=target.h;
  const slot=this.slots++;this.uniformData.set(data,slot*64);
  const group=this._group(name,inputs);
  // Full-screen unblended shaders overwrite every channel; clipped or blended draws keep the prior material.
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
 // The attachment-cost model charges a pass's whole attachment. A small region uses scratch
 // only when its attachment and copies transfer fewer bytes than drawing in place.
 // Dabs, the step and the display want different sizes: a few scratch sizes stay pooled per format.
 _scratchFor(format,w,h,index,maxArea){
  const key=format+':'+index,W=Math.ceil(w/64)*64,H=Math.ceil(h/64)*64;let pool=this.scratch.get(key);
  if(!pool)this.scratch.set(key,pool=[]);
  for(let i=pool.length-1;i>=0;i--)if(pool[i].dead)pool.splice(i,1);
  let best=null;for(const t of pool)if(t.w>=w&&t.h>=h&&t.w*t.h<=4*W*H&&(!best||t.w*t.h<best.w*best.h))best=t;
  if(best&&best.w*best.h<maxArea){pool.splice(pool.indexOf(best),1);pool.push(best);return best;}
  // A growing rectangle takes a size with room to spare, never past the sheet.
  const width=Math.min(Math.max(W,Math.ceil(W*1.25/64)*64),Math.max(W,this.width)),height=Math.min(Math.max(H,Math.ceil(H*1.25/64)*64),Math.max(H,this.height));
  if(width*height>=maxArea)return null;
  // Sibling attachments already selected for this pass must survive the remaining allocations.
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
  // Scratch stores its area and copies the rectangle back; blending also loads and copies in.
  // Use it only when those transfers cost less than drawing into the complete attachment.
  const directArea=target.w*target.h*(full&&!blended?1:2),maxArea=directArea/(blended?2:1)-2*rw*rh;
  let scratch=null;
  if(maxArea>rw*rh)try{scratch=targets.map((t,i)=>this._scratchFor(t.format,rw,rh,i,maxArea));if(scratch.some(t=>!t))scratch=null;}
  catch(error){
   if(error?.code!=='WATER_BUDGET')throw error;
   // When scratch does not fit, each entry keeps its own attachment store.
   this._dropScratch();
   for(const e of entries){e.data[60]=0;e.data[61]=0;this._draw(e.name,targets,e.inputs,e.data,e.rect??R);}
   return;
  }
  // Keep the scratch plan. Only clear outside prior writes covered by a complete unblended draw.
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
  this._flushStamps();
  this._regionPass([{name,inputs,data:Float32Array.from(data),rect:null}],destinations,rect);
 }
 // A frame's dabs land in one region pass per material plane: each plane's blend commutes with
 // itself, and a dab reads only its tip, the paper and the fill field, never another dab's plane.
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
  this._markWritten(destination,[to[0],to[1],to[0]+r[2]-r[0],to[1]+r[3]-r[1]]);
 }
 _swap(pair){[pair.read,pair.write]=[pair.write,pair.read];}
 _clear(target){this._flushStamps();const pass=this._command().beginRenderPass({colorAttachments:[{view:target.view,loadOp:'clear',clearValue:[0,0,0,0],storeOp:'store'}]});pass.end();target.written=null;}
 _material(){return [...this.ink.read,...this.fixed,...this.wet.read,this.base];}
 _meta(){return {active:this.active?.slice()??null,dirty:this.dirty?.slice()??null,painted:this.painted?.slice()??null,wetPeak:this.wetPeak,fixTimer:this.fixTimer,elapsed:this.elapsed,lastWet:this.lastWet,awakeUntil:this.awakeUntil,flowSpeed:this.flowSpeed,growCarry:this.growCarry,frame:this.frame,brushNow:this.brushNow.slice(),params:{...this.params},paperId:this.paperId,paperOrigin:this.paperOrigin.slice(),paperScale:this.paperScale,seed:this.seed};}
 beginTransaction(){
  this._check();if(this.transaction)throw failure('WATER_BUSY','A Water gesture is already open.');
  this.endFill();const tx={tiles:new Map(),meta:this._meta(),width:this.width,height:this.height,sim:[],paper:this.paper,sheet:null,simBox:this.simBox?.slice()??null};
  const sim=[...this.velocity.read,...this.pressure.read];this._reserve(sim.reduce((n,t)=>n+t.bytes,0));
  try{for(const t of sim){const copy=this._texture(t.w,t.h,t.format);tx.sim.push(copy);this._copy(t,copy);}}
  catch(error){this.submit();tx.sim.forEach(t=>this._drop(t));throw error;}
  this.transaction=tx;return tx;
 }
 _protect(rect,indices=[0,1,2,3,4,5]){
  const tx=this.transaction;if(!tx||tx.sheet||tx.cpu)return;
  const material=this._material(),pending=[];let bytes=0;
  for(let y=Math.floor(rect[1]/128)*128;y<rect[3];y+=128)for(let x=Math.floor(rect[0]/128)*128;x<rect[2];x+=128){
   const key=x+','+y,existing=tx.tiles.get(key),missing=indices.filter(i=>!existing?.layers.has(i));if(!missing.length)continue;
   const r=existing?.r??[x,y,Math.min(this.width,x+128),Math.min(this.height,y+128)];
   if(r[0]<0||r[1]<0||r[2]<=r[0]||r[3]<=r[1])continue;
   bytes+=(r[2]-x)*(r[3]-y)*missing.reduce((sum,i)=>sum+bytesPerPixel[material[i].format],0);pending.push({key,r,existing,missing,copies:new Map()});
  }
  this._reserve(bytes);
  const made=[];
  try{for(const {r,missing,copies} of pending)for(const i of missing){const t=material[i],copy=this._texture(r[2]-r[0],r[3]-r[1],t.format);made.push(copy);copies.set(i,copy);this._copyRaw(t,copy,r,[0,0]);}}
  catch(error){this.submit();made.forEach(t=>this._drop(t));throw error;}
  // The first write of each material layer takes its own original bytes, including a later Dry or eraser.
  for(const {key,r,existing,copies} of pending){const layers=existing?.layers??new Map();for(const [i,copy]of copies)layers.set(i,copy);tx.tiles.set(key,{r,layers});}
 }
 async endTransaction(tx,cancel=false){
  if(tx!==this.transaction)throw failure('WATER_INPUT','The Water checkpoint is not current.');
  this.endFill();const retired=[];
  if(tx.cpu){
   this.submit();
   if(cancel){
    const retired=this._sheetTextures(this._sheet()),need=sheetLayout(tx.cpu.width,tx.cpu.height).bytes+tx.cpu.width*tx.cpu.height*8;
    const credit=retired.reduce((sum,t)=>sum+t.bytes,0);this._reclaimScratch(need,credit);
    if(this.bytes-credit+need>this.maxBytes)throw failure('WATER_GPU_MEMORY','Water cannot restore this sheet in GPU memory. The last published painting is safe; reopen Water to continue.');
    try{await this.device.queue.onSubmittedWorkDone();}catch(error){this._poison(error);}await this._settleErrors();
    retired.forEach(t=>this._drop(t));await this._restoreCapture(tx.cpu);
   }
   this.transaction=null;tx.cpu=null;return;
  }
  if(cancel){
   if(tx.sheet){retired.push(...this._sheetTextures(this._sheet()));Object.assign(this,tx.sheet);}
   if(this.paper!==tx.paper){retired.push(this.paper);this.paper=tx.paper;}
   const targets=this._material();for(const {r,layers} of tx.tiles.values())layers.forEach((t,i)=>this._copy(t,targets[i],null,r));
   for(let i=0;i<2;i++){this._copy(tx.sim[i],i?this.pressure.read[0]:this.velocity.read[0]);}
   for(const [key,value] of Object.entries(tx.meta))this[key]=value;
   this.simBox=tx.simBox?tx.simBox.slice():null;this.painting=false;
   for(const pair of [this.ink,this.wet,this.velocity,this.pressure])pair.read.forEach((t,i)=>this._copy(t,pair.write[i]));
  }else if(tx.sheet)retired.push(...this._sheetTextures(tx.sheet));
  if(tx.paper!==this.paper)retired.push(tx.paper);
  this.transaction=null;this.submit();retired.forEach(t=>this._drop(t));
  for(const {layers} of tx.tiles.values())layers.forEach(t=>this._drop(t));tx.sim.forEach(t=>this._drop(t));
 }
 _paper(target=this.paper,id=this.paperId,settings=this,kept=null){
  if(!getPaper(id))throw failure('WATER_INPUT','The Water paper is not available.');
  // Coverage is a disposable texture cache, outside material checkpoints and Undo.
  target.field={id,paperScale:settings.paperScale,seed:settings.seed,paperOrigin:settings.paperOrigin.slice(),rect:kept?.slice()??null,unknown:false};
 }
 _ensurePaper(rect=null,target=this.paper,expand=true){
  const settings=target.field;if(!settings)return;
  // Amortize moving contacts; keep a filtered-sampling halo at native resolution.
  const w=target.w,h=target.h,pad=expand?1:0,tile=expand?128:1;
  const requested=rect?[Math.max(0,Math.floor((rect[0]-pad)/tile)*tile),Math.max(0,Math.floor((rect[1]-pad)/tile)*tile),Math.min(w,Math.ceil((rect[2]+pad)/tile)*tile),Math.min(h,Math.ceil((rect[3]+pad)/tile)*tile)]:[0,0,w,h];
  if(requested[2]<=requested[0]||requested[3]<=requested[1])return;
  const kept=settings.rect,needed=union(kept,requested);
  if(kept&&needed.every((value,index)=>value===kept[index]))return;
  const regions=kept?[[needed[0],needed[1],needed[2],kept[1]],[needed[0],kept[3],needed[2],needed[3]],[needed[0],kept[1],kept[0],kept[3]],[kept[2],kept[1],needed[2],kept[3]]].filter(r=>r[2]>r[0]&&r[3]>r[1]):[needed];
  const profile=getPaper(settings.id),p=profile.params??profile,data=this._parameters();
  data.set([settings.paperScale,settings.seed,profile.kind??p.kind??0,1.4*(p.bump??1)/settings.paperScale],48);data.set(settings.paperOrigin,52);
  // The field costs tens of operations a pixel. A large area bakes in bands, each its own submission, so no single
  // GPU task runs long enough to trip a watchdog on a slow or software GPU.
  const bands=[];
  for(const region of regions){
   const rows=Math.max(1,Math.floor(PAPER_BAND_PIXELS/(region[2]-region[0])));
   for(let top=region[1];top<region[3];top+=rows)bands.push([region[0],top,region[2],Math.min(region[3],top+rows)]);
  }
  for(const band of bands){
   // Relief lighting reads one neighbouring field texel on each side.
   const x=Math.max(0,band[0]-1),y=Math.max(0,band[1]-1),right=Math.min(w,band[2]+1),bottom=Math.min(h,band[3]+1);
   if(this.pendingRetire.length||bands.length>1)this.submit();
   const field=this._texture(right-x,bottom-y,'rgba16float');
   data.set([x,y,w,h],56);
   try{this._draw('paperField',field,[],data);this._region('paperLight',target,[field],data,band);}finally{this._retire(field);}
  }
  if(bands.length>1)this.submit();
  settings.rect=needed;
  if(needed[0]===0&&needed[1]===0&&needed[2]===w&&needed[3]===h)settings.unknown=false;
 }
 // A paper bakes band by band. Each band is flushed and finished before the next is encoded, so the GPU process never
 // runs a whole sheet's bake as one task, which a watchdog on a slow or software GPU stops as a hang.
 async _bakePaper(target=this.paper,rect=[0,0,target.w,target.h],expand=true){
  const rows=Math.max(128,Math.floor(PAPER_BAND_PIXELS/Math.max(1,rect[2]-rect[0])/128)*128);
  for(let top=rect[1];top<rect[3];top+=rows){
   this._ensurePaper([rect[0],top,rect[2],Math.min(rect[3],top+rows)],target,expand);this.submit();
   if(top+rows<rect[3]){await this.device.queue.onSubmittedWorkDone();this._check();}
  }
 }
 // Switching paper bakes the new field in bands while the old one stays in use; the newest switch wins.
 async setPaper(id,fields={}){
  this._check();
  if(!getPaper(id)||!fields||typeof fields!=='object'||Array.isArray(fields)||Object.keys(fields).some(key=>!['paperScale','paperOrigin','seed'].includes(key)))throw failure('WATER_INPUT','The Water paper is not available.');
  const {paperScale=this.paperScale,paperOrigin=this.paperOrigin,seed=this.seed}=fields;
  if(!Number.isFinite(paperScale)||paperScale<=0||!Array.isArray(paperOrigin)||paperOrigin.length!==2||!paperOrigin.every(Number.isFinite)||!Number.isFinite(seed)||seed<0||seed>1)throw failure('WATER_INPUT','The Water paper field is invalid.');
  const ticket=this.paperTicket=(this.paperTicket??0)+1;
  if(id===this.paperId&&paperScale===this.paperScale&&seed===this.seed&&paperOrigin.every((value,i)=>value===this.paperOrigin[i]))return;
  if(this.pendingRetire.length)this.submit();
  this._reserve(this.width*this.height*12);const next=this._texture(this.width,this.height,'rgba8unorm');
  try{
   this._paper(next,id,{paperScale,paperOrigin:paperOrigin.slice(),seed});next.field.unknown=this.paper.field.unknown;
   if(this.paper.field.rect)await this._bakePaper(next,this.paper.field.rect,false);
   if(ticket!==this.paperTicket){this._retire(next);return;}
   if(next.w!==this.paper.w||next.h!==this.paper.h){this._retire(next);return this.setPaper(id,fields);}
   // The old field may have grown while the bands baked.
   next.field.unknown=this.paper.field.unknown;if(this.paper.field.rect)this._ensurePaper(this.paper.field.rect,next,false);
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
 // Document pixels (y down) share normalized position with the simulation grid.
 // Forty texels covers one step of clamped advection and twenty Jacobi steps of boundary error.
 _simRect(rect){
  const pad=40,sw=this.sw,sh=this.sh;
  const x0=clamp(Math.floor(rect[0]*sw/this.width)-pad,0,sw),y0=clamp(Math.floor(rect[1]*sh/this.height)-pad,0,sh);
  const x1=clamp(Math.ceil(rect[2]*sw/this.width)+pad,0,sw),y1=clamp(Math.ceil(rect[3]*sh/this.height)+pad,0,sh);
  return [x0,y0,Math.max(x0,x1),Math.max(y0,y1)];
 }
 _touch(rect,indices){if(rect[0]>=rect[2]||rect[1]>=rect[3])return;this.trimEpoch++;this._ensurePaper(rect);this._protect(rect,indices);this.active=union(this.active,rect);this.dirty=union(this.dirty,rect);this.painted=union(this.painted,rect);this.awakeUntil=Math.max(this.awakeUntil,this.elapsed+.25);}
 stamp({x,y,r,angle=0,brush='water/round',coefficients=null,water=0,round=0,grain=0,threshold=.5,velocity=null,lift=0,erase=false,circular=false,hardness=2,settle=0}){
  this._check();const profile=typeof brush==='string'?getBrush(brush):brush;
  const settings=profile.params??profile;
  const rect=this._rect(x,y,r,circular?3.2:1.5);this._touch(rect,lift?(erase?undefined:[0,1,4]):[...(coefficients?[0,1]:[]),...(water>0?[4]:[])]);
  const data=this._parameters();data.set([x,y,r,settings.aspect??1],16);data.set([Math.cos(angle),Math.sin(angle),round,grain],20);data.set([threshold,water,hardness,settle],24);
  if(lift){data[25]=lift;data[26]=2;this._queue('liftInk',this.ink.read,[],data,rect);data[25]=lift*.8;this._queue('liftWet',this.wet.read,[],data,rect);
   if(erase){data[25]=lift;this._queue('eraseFixed',this.fixed,[],data,rect);this._queue('eraseBase',this.base,[],data,rect);}return;}
  const tip=circular?null:this._tip(profile),inputs=tip?[tip,this.paper]:[];
  if(coefficients){data.set(coefficients.slice(0,4),28);data.set(coefficients.slice(4,8),32);this._queue(circular?'splatInk':'stampInk',this.ink.read,inputs,data,rect);}
  if(water>0){
   if(circular){data.set([water,0,0,0],28);this._queue('wetSplat',this.wet.read,[],data,rect);}
   else this._queue('stampWet',this.wet.read,inputs,data,rect);
   const tau=this.fixTimer>0?.25:2+16*(1-this.params.dry);
   this.wetPeak=Math.max(this.wetPeak*Math.exp(-(this.elapsed-this.lastWet)/tau),water);this.lastWet=this.elapsed;
  }
  if(velocity)this.splatVelocity(x,y,r,velocity[0],velocity[1]);
 }
 splatVelocity(x,y,r,vx,vy,track=true){
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
 fillStep({from,to,coefficients=null,water,soft=0}){
  this._check();if(!this.fill)return false;
  if(![from,to,water,soft].every(Number.isFinite)||to<from||water<0||soft<0||coefficients&&coefficients.length!==8)
   throw failure('WATER_INPUT','The Water fill step is invalid.');
  const {texture,box}=this.fill;this._touch(box,[...(coefficients?[0,1]:[]),...(water>0?[4]:[])]);
  const data=this._parameters();data.set([from,to,soft,water],56);
  if(coefficients){data.set(coefficients.slice(0,4),28);data.set(coefficients.slice(4,8),32);this._region('fillInk',this.ink.read,[texture,this.paper],data,box);}
  if(water>0){
   this._region('fillWet',this.wet.read,[texture,this.paper],data,box);
   const tau=this.fixTimer>0?.25:2+16*(1-this.params.dry);
   this.wetPeak=Math.max(this.wetPeak*Math.exp(-(this.elapsed-this.lastWet)/tau),water);this.lastWet=this.elapsed;
  }
  return true;
 }
 endFill(){if(this.fill){this._retire(this.fill.texture);this.fill=null;}}
 _age(seconds){const next=this.elapsed+seconds;if(!waterTimeFits(seconds)||seconds<=0||!waterTimeFits(next)||next<=this.elapsed)throw failure('WATER_INPUT','The Water frame time is not valid.');return seconds;}
 async step(seconds=1/60){
  this._check();const age=this._age(seconds);await this._trimFinish();
  if(!this.active){this.brushNow=[0,0,0];return false;}
  // The reference steps its whole sheet by one clamped frame: on a slow device drying, damping and fixing slow down with
  // transport, so a wash reaches its drying edge after the same flow at any frame rate. The material ages by that step;
  // only an interval longer than WATER_IDLE_SECONDS (a hidden page, a long recorded pause) is idle time and dries in
  // full. The clock (elapsed, sleep and wetness) keeps recorded time, as the reference's wall clock does.
  const dt=clamp(age,1/240,1/30),aged=age>WATER_IDLE_SECONDS?age:dt,fixing=this.fixTimer>0,fixedAge=Math.min(aged,this.fixTimer);
  this.elapsed+=age;this.frame++;this.fixTimer=Math.max(0,this.fixTimer-aged);
  this.flowSpeed*=Math.exp(-aged*(3-2.4*this.params.flow));
  // The box creeps with the wet front. A stroke does not trim it, so a mask read cannot freeze a ledge.
  this.growCarry+=.4*this.reach+Math.min(3*this.reach,.15*this.flowSpeed*dt*this.width/this.sw);const grow=Math.floor(this.growCarry);this.growCarry-=grow;
  this.active=[Math.max(0,this.active[0]-grow),Math.max(0,this.active[1]-grow),Math.min(this.width,this.active[2]+grow),Math.min(this.height,this.active[3]+grow)];
  this._flushStamps();
  // A cancelled gesture restores every plane its frames changed, so a gesture's checkpoint holds the active area.
  const rect=this.active;this._ensurePaper(rect);this._protect(rect,fixing?[0,1,2,3,4]:[0,1,4]);
  const data=this._parameters();data[4]=dt;const settle=1-Math.exp(-5*fixedAge);
  const decay=Math.exp(-fixedAge/.25-(aged-fixedAge)/(2+16*(1-this.params.dry)));
  const damping=Math.exp(-aged*(3-2.4*this.params.flow)-7*fixedAge);data.set([decay,damping,settle,1-settle],8);
  const sim=this.simBox=union(this.simBox,this._simRect(rect));
  this._region('velocity',this.velocity.write,[this.velocity.read[0],this.wet.read[0]],data,sim);this._swap(this.velocity);
  // Vorticity reads curl one texel beyond the box, so curl covers that ring: stale curl from a cancelled or slept
  // stroke never reaches the flow.
  this._region('curl',this.curl,this.velocity.read,data,[Math.max(0,sim[0]-1),Math.max(0,sim[1]-1),Math.min(this.sw,sim[2]+1),Math.min(this.sh,sim[3]+1)]);
  this._region('vorticity',this.velocity.write,[this.velocity.read[0],this.curl],data,sim);this._swap(this.velocity);
  this._region('divergence',this.divergence,this.velocity.read,data,sim);
  this._region('pressureDecay',this.pressure.write,this.pressure.read,data,sim);this._swap(this.pressure);
  for(let i=0;i<20;i++){this._region('pressure',this.pressure.write,[this.pressure.read[0],this.divergence],data,sim);this._swap(this.pressure);}
  this._region('project',this.velocity.write,[this.velocity.read[0],this.pressure.read[0]],data,sim);this._swap(this.velocity);
  this._region('wet',this.wet.write,[this.velocity.read[0],this.wet.read[0]],data,rect);this._swap(this.wet);
  // Both blends keep their order and 16-bit attachment representation inside one pass.
  if(fixing)this._regionPass([
   {name:'bleach',inputs:[this.ink.read[1]],data:Float32Array.from(data),rect:null},
   {name:'fix',inputs:this.ink.read,data:Float32Array.from(data),rect:null}
  ],this.fixed,rect);
  this._region('pigment',this.ink.write,[this.velocity.read[0],...this.ink.read,this.wet.read[0]],data,rect);this._swap(this.ink);
  this.brushNow=[0,0,0];
  this.dirty=union(this.dirty,rect);this.painted=union(this.painted,rect);
  if(fixing&&!this.fixTimer){this.wetPeak=0;this.awakeUntil=0;this.painted=null;}
  const until=this.lastWet+(2+16*(1-this.params.dry))*Math.log(Math.max(.004,this.wetPeak)/.004);
  if(!this.fixTimer&&this.elapsed>=this.awakeUntil&&this.elapsed>=until)this.sleep();
  // No frame waits on a mask read: it is collected on a later frame. A stroke starts none.
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
 // The mask lands exactly two frames after it was rendered, so replay trims where the live sheet did; by
 // then the GPU has finished it. Material touched, slept, restored or reframed since makes it stale.
 async _trimFinish(){
  const read=this.maskRead;if(!read||this.frame<read.due)return;
  if(read.state==='pending')await read.mapped;
  if(this.maskRead!==read)return;this.maskRead=null;
  let pixels=null;
  try{if(read.state==='ready'&&read.epoch===this.trimEpoch&&!this.painting&&this.active){const source=new Uint8Array(read.buffer.getMappedRange());pixels=new Uint8Array(read.stride*read.h);for(let y=0;y<read.h;y++)pixels.set(source.subarray(y*read.pitch,y*read.pitch+read.stride),y*read.stride);}}
  finally{if(read.buffer.mapState==='mapped')read.buffer.unmap();this._dropBuffer(read.buffer);}
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
  this.active=null;this.wetPeak=0;this.flowSpeed=0;this.simBox=null;
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
   return {target,r,w,h,stride,pitch,size:pitch*h};
  });
  const result=[];let index=0;
  while(index<transfers.length){
   const batch=[];
   try{
    while(index<transfers.length){
     const item=transfers[index];
     if(this.bytes+item.size>this.maxBytes&&this.pendingRetire.length)this.submit();
     this._reclaimScratch(item.size);
     if(batch.length&&this.bytes+item.size>this.maxBytes)break;
     const available=Math.min(this.maxBytes-this.bytes,this.device.limits.maxBufferSize);
     if(!batch.length&&item.size>available){
      // A kept sheet can leave less staging room than one plane. Read exact row bands
      // without charging another whole plane to its GPU budget.
      const rows=Math.floor(available/item.pitch);
      if(rows>0){
       const out=new Uint8Array(item.stride*item.h);
       for(let y=0;y<item.h;y+=rows){
        const h=Math.min(rows,item.h-y),box=[item.r[0],item.r[1]+y,item.r[2],item.r[1]+y+h];
        const part=(await this._readMany([{target:item.target,box,cacheOnly:true}]))[0];out.set(part,y*item.stride);
       }
       result.push(out);index++;continue;
      }
     }
     const buffer=this._buffer(item.size,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);batch.push({...item,buffer});index++;
     this._command().copyTextureToBuffer({texture:item.target.texture,origin:[item.r[0],item.r[1]]},{buffer,bytesPerRow:item.pitch},[item.w,item.h]);
    }
    this.submit();
    const mapped=await Promise.allSettled(batch.map(({buffer})=>buffer.mapAsync(GPUMapMode.READ)));
    await this._settleErrors();
    const failed=mapped.find(item=>item.status==='rejected');if(failed){this._poison(failed.reason);this._check();}
    for(const {buffer,stride,pitch,h} of batch){
     const source=new Uint8Array(buffer.getMappedRange()),out=new Uint8Array(stride*h);
     for(let y=0;y<h;y++)out.set(source.subarray(y*pitch,y*pitch+stride),y*stride);
     result.push(out);
    }
   }catch(error){this.submit();throw error;}
   finally{for(const {buffer} of batch){if(buffer.mapState==='mapped')buffer.unmap();this._dropBuffer(buffer);}}
  }
  await this._settleErrors();return result;
 }
 render({paper=false,white=false,flat=false,box=null,live=false}={}){
  this._check();const profile=getPaper(this.paperId),p=profile.params??profile;
  // Untouched transparent pixels return their saved raster unchanged.
  if(paper||white||this.paper.field.unknown)this._ensurePaper(box);
  // Paper baking reuses the parameter scratch, so the display's parameters are written after it.
  const data=this._parameters();data[48]=live?1:0;
  data.set([this.params.granulation*.55,.8,paper?1:white?3:2,flat?1:0],36);
  data.set([...linearHex(p.tint??'#ffffff'),1],40);data.set([...linearHex(p.fleck??'#665544'),p.mottle??.05],44);
  const inputs=[...this.ink.read,...this.fixed,this.wet.read[0],this.paper,this.base];
  if(box)this._region('display',this.output,inputs,data,box);else this._draw('display',this.output,inputs,data);
  // Flood-fill reads a paper-composited image. It cannot become the retained transparent display.
  if(paper||white||flat)this.outputCanonical=false;else if(!box)this.outputCanonical=true;
 }
 async present(texture,box=null){
  this.render({box:this.outputCanonical?box:null,live:true});
  // A canvas texture is newly acquired each frame. Its complete image comes from the retained output.
  this._draw('present',{view:texture.createView(),w:this.width,h:this.height},[this.output]);
  this.submit();
  await this._pace();
 }
 // At most two frames queue on the GPU: no frame waits for its own, and a run of frames (settling, Dry,
 // replay) cannot outpace the GPU. Loss and errors surface on the next call.
 async _pace(){
  this.inFlight.push(this.device.queue.onSubmittedWorkDone().catch(error=>this._poison(error)));
  while(this.inFlight.length>2)await this.inFlight.shift();
  this._check();
 }
 async read(options={}){
  this.render(options);const box=options.box??null;
  return this._readTexture(this.output,box);
 }
 async snapshot(){
  this._check();const state={width:this.width,height:this.height,paperScale:this.paperScale,paperOrigin:this.paperOrigin.slice(),meta:this._meta()};
  const entries=Object.entries({ink0:this.ink.read[0],ink1:this.ink.read[1],fixed0:this.fixed[0],fixed1:this.fixed[1],wet:this.wet.read[0],base:this.base,velocity:this.velocity.read[0],pressure:this.pressure.read[0]});
  const values=await this._readMany(entries.map(([,target])=>({target})));
  return {...state,layers:Object.fromEntries(entries.map(([name],i)=>[name,values[i]]))};
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
  const meta=this._restoreMetadata(state),targets={ink0:this.ink.read[0],ink1:this.ink.read[1],fixed0:this.fixed[0],fixed1:this.fixed[1],wet:this.wet.read[0],base:this.base,velocity:this.velocity.read[0],pressure:this.pressure.read[0]};
  for(const [name,target] of Object.entries(targets)){const bytes=state.layers?.[name];if(!ArrayBuffer.isView(bytes)||bytes.byteLength!==target.bytes)throw failure('WATER_INPUT','The Water checkpoint is incomplete.');}
  this.endFill();this.submit();this._protect([0,0,this.width,this.height]);this._reserve(this.width*this.height*12);
  const paper=this._texture(this.width,this.height,'rgba8unorm');
  // Fixed pigment in a native checkpoint can lie outside its active bounds.
  try{this._paper(paper,meta.paperId,meta);paper.field.unknown=true;this.submit();await this._settleErrors();}catch(error){this._retire(paper);throw error;}
  for(const [name,target] of Object.entries(targets))this._writeTexture({texture:target.texture},state.layers[name],{bytesPerRow:target.w*bytesPerPixel[target.format]},[target.w,target.h]);
  const old=this.paper;this.paper=paper;Object.assign(this,meta);this.painting=false;
  this.simBox=this.active?[0,0,this.sw,this.sh]:null;
  if(old!==this.transaction?.paper && old!==this.transaction?.sheet?.paper)this._retire(old);
  for(const pair of [this.ink,this.wet,this.velocity,this.pressure])pair.read.forEach((t,i)=>this._copy(t,pair.write[i]));this.submit();await this._settleErrors();
 }
 async grow(left,top,right,bottom){
  this._check();
  if(![left,top,right,bottom].every(v=>Number.isSafeInteger(v)&&v>=0))throw failure('WATER_INPUT','The Water sheet growth is not valid.');
  return this.reframe(this.width+left+right,this.height+top+bottom,left,top);
 }
 async _capturePlane(target){
  const stride=target.w*bytesPerPixel[target.format],pitch=Math.ceil(stride/256)*256,band=Math.min(4*1024*1024,pitch*target.h,this.device.limits.maxBufferSize);
  this._reclaimScratch(band);this._reserve(pitch);
  const rows=Math.max(1,Math.floor(Math.min(band,this.maxBytes-this.bytes)/pitch));
  const bytes=new Uint8Array(stride*target.h);
  for(let y=0;y<target.h;y+=rows){const h=Math.min(rows,target.h-y),part=(await this._readMany([{target,box:[0,y,target.w,y+h],cacheOnly:true}]))[0];bytes.set(part,y*stride);}
  return bytes;
 }
 async _captureSheet(sheet,meta,paper=sheet.paper,simulation=[...sheet.velocity.read,...sheet.pressure.read]){
  const layers=[];for(const target of [...sheet.ink.read,...sheet.fixed,...sheet.wet.read,sheet.base])layers.push(await this._capturePlane(target));
  const sim=[];for(const target of simulation)sim.push(await this._capturePlane(target));
  return {width:sheet.width,height:sheet.height,meta,layers,sim,paper:{bytes:await this._capturePlane(paper),field:structuredClone(paper.field)}};
 }
 _uploadPlane(target,bytes,width,height,rect=null,offset=null){
  const r=rect??[0,0,width,height],to=offset??r,bpp=bytesPerPixel[target.format];
  this._writeTexture({texture:target.texture,origin:[to[0],to[1]]},bytes,{offset:(r[1]*width+r[0])*bpp,bytesPerRow:width*bpp},[r[2]-r[0],r[3]-r[1]]);
 }
 async _restoreCapture(state){
  this._allocate(state.width,state.height);
  this._material().forEach((target,i)=>this._uploadPlane(target,state.layers[i],state.width,state.height));
  for(const [i,target]of [...this.velocity.read,...this.pressure.read].entries())this._uploadPlane(target,state.sim[i],target.w,target.h);
  this._uploadPlane(this.paper,state.paper.bytes,state.width,state.height);this.paper.field=structuredClone(state.paper.field);
  Object.assign(this,state.meta);this.outputCanonical=false;this.painting=false;
  this.simBox=this.active?[0,0,this.sw,this.sh]:null;
  for(const pair of [this.ink,this.wet,this.velocity,this.pressure])pair.read.forEach((t,i)=>this._copy(t,pair.write[i]));
  this.submit();await this._settleErrors();
 }
 async _captureCheckpoint(tx,current,old){
  if(!tx||tx.cpu)return null;
  const state=tx.sheet?await this._captureSheet(tx.sheet,tx.meta,tx.paper,tx.sim):{...current,meta:tx.meta,sim:[],paper:current.paper};
  const patches=[];
  for(const {r,layers}of tx.tiles.values())for(const [index,target]of layers)patches.push({r,index,bytes:await this._capturePlane(target)});
  if(!tx.sheet)for(const target of tx.sim)state.sim.push(await this._capturePlane(target));
  if(!tx.sheet&&tx.paper!==old.paper)state.paper={bytes:await this._capturePlane(tx.paper),field:structuredClone(tx.paper.field)};
  return {state,patches};
 }
 _retainCapture(tx,capture){
  if(!capture)return;
  const {state,patches}=capture;
  for(const {r,index,bytes}of patches){const bpp=index===4?2:index===5?4:8,stride=(r[2]-r[0])*bpp;for(let y=r[1];y<r[3];y++)state.layers[index].set(bytes.subarray((y-r[1])*stride,(y-r[1]+1)*stride),(y*state.width+r[0])*bpp);}
  tx.cpu=state;tx.sheet=null;tx.paper=null;tx.tiles.clear();tx.sim=[];
 }
 async reframe(w,h,x=0,y=0){
  this._check();this._dimensions(w,h);
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y))throw failure('WATER_INPUT','The Water sheet offset is not valid.');
  if(w===this.width&&h===this.height&&!x&&!y)return;
  this.endFill();this.submit();this._dropScratch();
  const previous=this._material(),old=this._sheet(),meta=this._meta(),tx=this.transaction;
  const nextLayout=sheetLayout(w,h);this._dimensions(nextLayout.sw,nextLayout.sh);
  const need=nextLayout.bytes+w*h*8,pressure=this.bytes+need>this.maxBytes;
  let current=null,checkpoint=null;
  if(pressure){
   const retired=new Set(this._sheetTextures(old));
   if(tx){if(tx.sheet)this._sheetTextures(tx.sheet).forEach(t=>retired.add(t));if(tx.paper)retired.add(tx.paper);tx.sim.forEach(t=>retired.add(t));for(const {layers}of tx.tiles.values())layers.forEach(t=>retired.add(t));}
   const retained=this.bytes-[...retired].reduce((sum,t)=>sum+(t.dead?0:t.bytes),0);
   if(retained+need>this.maxBytes)this._reserve(need);
   // Only a growth transition reads material back. The final native sheet keeps the same budget.
   current=await this._captureSheet(old,meta);checkpoint=await this._captureCheckpoint(tx,current,old);
   retired.forEach(t=>this._drop(t));
  }
  let grown;
  try{
   grown=this._allocate(w,h);const next=this._material();
   const sx=Math.max(0,-x),sy=Math.max(0,-y),dx=Math.max(0,x),dy=Math.max(0,y);
   const cw=Math.min(old.width-sx,w-dx),ch=Math.min(old.height-sy,h-dy);
   if(cw>0&&ch>0)previous.forEach((t,i)=>current?this._uploadPlane(next[i],current.layers[i],old.width,old.height,[sx,sy,sx+cw,sy+ch],[dx,dy]):this._copy(t,next[i],[sx,sy,sx+cw,sy+ch],[dx,dy]));
   for(const pair of [this.ink,this.wet])pair.read.forEach((t,i)=>this._copy(t,pair.write[i]));
   const bottom=h-old.height-y;
   this.paperOrigin=[meta.paperOrigin[0]-x,meta.paperOrigin[1]-bottom];
   this.brushNow=[(meta.brushNow[0]*old.width+x)/w,(meta.brushNow[1]*old.height+bottom)/h,meta.brushNow[2]*old.height/h];
   for(const key of ['active','painted'])if(this[key]){
    const r=this[key],shifted=[Math.max(0,r[0]+x),Math.max(0,r[1]+y),Math.min(w,r[2]+x),Math.min(h,r[3]+y)];
    this[key]=shifted[2]>shifted[0]&&shifted[3]>shifted[1]?shifted:null;
   }
   let kept=null,required=null;const valid=old.paper.field.rect;
   if(valid){const r=[Math.max(0,valid[0]+x),Math.max(0,valid[1]+y),Math.min(w,valid[2]+x),Math.min(h,valid[3]+y)];if(r[2]>r[0]&&r[3]>r[1])required=r;}
   // Integer origins in the exact float32 range keep the same world-coordinate sum.
   if(required&&[...meta.paperOrigin,...this.paperOrigin].every(value=>Number.isSafeInteger(value)&&Math.abs(value)<=16777216)){
    const r=[Math.max(required[0],dx+1),Math.max(required[1],dy+1),Math.min(required[2],dx+cw-1),Math.min(required[3],dy+ch-1)];
    if(r[2]>r[0]&&r[3]>r[1]){kept=r;if(current)this._uploadPlane(this.paper,current.paper.bytes,old.width,old.height,[r[0]-x,r[1]-y,r[2]-x,r[3]-y],r);else this._copy(old.paper,this.paper,[r[0]-x,r[1]-y,r[2]-x,r[3]-y],r);}
   }
   this.dirty=[0,0,w,h];this._paper(this.paper,this.paperId,this,kept);this.paper.field.unknown=old.paper.field.unknown;
   if(required)this._ensurePaper(required,this.paper,false);
   this.simBox=this.active?this._simRect(this.active):null;
   this.submit();await this._settleErrors();
  }catch(error){
   this.encoder=null;this.slots=0;this.pendingRetire.forEach(t=>this._drop(t));this.pendingRetire=[];
   if(grown)this._sheetTextures(grown).forEach(t=>this._drop(t));
   if(current){try{await this._restoreCapture(current);}finally{this._retainCapture(tx,checkpoint);}}
   else Object.assign(this,old,meta);
   this.simBox=null;
   throw error;
  }
  if(current)this._retainCapture(tx,checkpoint);
  else if(tx&&!tx.sheet&&!tx.cpu)tx.sheet=old;
  else this._sheetTextures(old).forEach(t=>{if(t!==tx?.paper)this._drop(t);});
 }
 stats(){return {backend:'webgpu',bytes:this.bytes,width:this.width,height:this.height,simulation:[this.sw,this.sh],active:this.active?.slice()??null,frames:this.frame};}
 dispose(){
  if(this.disposed)return;
  try{this.submit();}finally{this._release();this.transaction=null;this.fill=null;this.disposed=true;}
 }
}
