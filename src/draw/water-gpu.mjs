// SPDX-License-Identifier: AGPL-3.0-only
// GPU material is transient. The retained document owns the last published straight RGBA pixels.
import {WATER_SHADER_SOURCES} from './water-shaders.mjs';
import {getPaper,makeTip,getBrush,WATER_TIP_SIZE} from './water-materials.mjs';

export const WATER_GPU_MAX_BYTES=384*1024*1024;
const UNIFORM_SLOTS=2048,UNIFORM_BYTES=64*UNIFORM_SLOTS*4;
function sheetLayout(w,h){
 const aspect=w/h,sw=aspect>=1?Math.round(256*aspect):256,sh=aspect>=1?256:Math.round(256/aspect);
 return {sw,sh,bytes:w*h*64+sw*sh*16+Math.ceil(w/16)*Math.ceil(h/16)*4};
}
// Reserve a blank hand's full reachable sheet only when its first transaction and one
// existing growth stride also fit. Later work still uses the live allocator's admission.
export function waterHandSheetFits(w,h,growth,tip=null,maxBytes=WATER_GPU_MAX_BYTES){
 if(![w,h,growth].every(Number.isSafeInteger)||w<1||h<1||growth<0)return false;
 const W=w+growth,H=h+growth,old=sheetLayout(w,h),next=sheetLayout(W,H);
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
const linearHex=hex=>[1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
let deviceTask=null,deviceOwner=null;
const libraries=new WeakMap();
const watchLoss=(device,reference)=>device.lost.then(info=>{const surface=reference.deref();if(surface)surface.lost=info;});
const watchErrors=reference=>event=>{reference.deref()?._poison(event.error);};

export async function waterReady(){
 const owner=globalThis.navigator?.gpu;
 if(!owner)throw failure('water_webgpu_unavailable','Water needs WebGPU. Open this document in a browser with WebGPU enabled.');
 if(owner!==deviceOwner){deviceOwner=owner;deviceTask=null;}
 if(!deviceTask)deviceTask=(async()=>{
  const adapter=await owner.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw failure('water_webgpu_unavailable','Water could not obtain a WebGPU adapter. Enable GPU acceleration and reopen the document.');
  const device=await adapter.requestDevice();
  device.lost.then(()=>{deviceTask=null;});return device;
 })().catch(error=>{deviceTask=null;throw error?.code?error:failure('water_webgpu_unavailable','Water could not start WebGPU: '+error.message);});
 return deviceTask;
}

async function programLibrary(device){
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
  const modules=new Map(),pipelines={},loadOps={};
  for(const [name,source] of Object.entries(WATER_SHADER_SOURCES))modules.set(name,device.createShaderModule({label:'Water '+name,code:source}));
  const compile=await Promise.allSettled(Object.entries(descriptions).map(async([name,settings])=>{
   const alphaOnly=settings.at(-1)==='alpha',blendSettings=alphaOnly?settings.slice(0,-1):settings;
   const mode=blend[blendSettings.at(-1)]?blendSettings.at(-1):null;
   const formats=mode?blendSettings.slice(0,-1):blendSettings;
   loadOps[name]=mode||alphaOnly?'load':'clear';
   const module=modules.get(name==='velocitySplat'||name==='wetSplat'?'splat':name==='eraseFixed'?'liftInk':name==='eraseBase'?'liftWet':name);
   pipelines[name]=await device.createRenderPipelineAsync({label:'Water '+name,layout:name.startsWith('fill')?fillPipelineLayout:pipelineLayout,vertex:{module,entryPoint:'vertex'},
    fragment:{module,entryPoint:'fragment',targets:formats.map(format=>({format,...(mode?{blend:{color:blend[mode],alpha:blend[mode]}}:{}),...(alphaOnly?{writeMask:8}:{})}))},primitive:{topology:'triangle-list'}});
  }));
  const bad=compile.find(r=>r.status==='rejected');if(bad)throw bad.reason;
  return {layout,fillLayout,linear,nearest,pipelines,loadOps};
 })();
 libraries.set(device,task);try{return await task;}catch(error){libraries.delete(device);throw error;}
}

export class WaterGPU {
 constructor(width,height,options={}){
  this.width=width;this.height=height;this.maxBytes=options.maxBytes??WATER_GPU_MAX_BYTES;
  this.paperId=options.paper??'cold-press';this.seed=options.seed??1;this.paperScale=options.paperScale??1100/height;
  this.paperOrigin=options.paperOrigin?.slice()??[0,0];
  this.params={flow:.45,bleed:.5,dry:.4,edge:.5,granulation:.45,...options.params};
  this.active=null;this.dirty=null;this.painted=null;this.wetPeak=0;this.fixTimer=0;this.elapsed=0;this.lastWet=0;this.awakeUntil=0;
  this.flowSpeed=0;this.growCarry=0;this.frame=0;this.brushNow=[0,0,0];this.bytes=0;this.transaction=null;this.lost=null;this.disposed=false;
  this.tips=new Map();this.targets=new Set();this.buffers=new Map();this.bindings=new Map();this.targetSequence=0;this.fill=null;
  this.pendingErrors=new Set();this.gpuError=null;this.errorListener=null;
  this.pendingRetire=[];this.encoder=null;this.slots=0;this.uniformData=new Float32Array(UNIFORM_BYTES/4);
  this.ready=this._initialize(options.device);
 }
 async _initialize(given){
  try{
   this.device=given??await waterReady();this._check();const reference=new WeakRef(this);watchLoss(this.device,reference);
   this.errorListener=watchErrors(reference);this.device.addEventListener('uncapturederror',this.errorListener);
   this.library=await programLibrary(this.device);this._check();
   this.uniforms=this._buffer(this.uniformData.byteLength,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
   this.dummy=this._texture(1,1,'rgba8unorm');
   this._allocate(this.width,this.height);this._paper();this.submit();await this._settleErrors();return this;
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
 _reserve(bytes){if(this.bytes+bytes>this.maxBytes)throw failure('WATER_BUDGET','Water cannot keep this whole edit in GPU memory. Use a new or smaller layer.');}
 _dimensions(w,h){
  if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w>this.device.limits.maxTextureDimension2D||h>this.device.limits.maxTextureDimension2D)throw failure('WATER_BUDGET','This Water sheet exceeds the GPU texture dimensions. Use a smaller layer.');
 }
 _texture(w,h,format,usage){
  this._check();this._dimensions(w,h);
  const bytes=w*h*bytesPerPixel[format];this._reserve(bytes);
  const target=this._guard(()=>{
   const texture=this.device.createTexture({label:'Water '+format,size:[w,h],format,usage:usage??FULL()});
   try{return {texture,view:texture.createView(),w,h,format,bytes,id:++this.targetSequence};}catch(error){texture.destroy();throw error;}
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
  if(!this.encoder)return;
  const encoder=this.encoder,slots=this.slots;this.encoder=null;this.slots=0;
  try{this._guard(()=>{
   if(slots)this.device.queue.writeBuffer(this.uniforms,0,this.uniformData.buffer,0,slots*256);
   this.device.queue.submit([encoder.finish()]);
  });}finally{for(const t of this.pendingRetire)this._drop(t);this.pendingRetire=[];}
 }
 _writeTexture(destination,data,layout,size){this._guard(()=>this.device.queue.writeTexture(destination,data,layout,size));}
 _retire(target){if(this.encoder)this.pendingRetire.push(target);else this._drop(target);}
 _parameters(w=this.width,h=this.height){
  const data=new Float32Array(64);data.set([w,h,this.sw,this.sh],0);
  data.set([0,this.params.flow,this.params.bleed,this.params.edge*1.4],4);data.set(this.brushNow,12);return data;
 }
 _draw(name,destinations,inputs=[],data=this._parameters(),rect=null){
  if(this.slots===UNIFORM_SLOTS)this.submit();
  const encoder=this._command(),targets=Array.isArray(destinations)?destinations:[destinations],target=targets[0];
  data[0]=target.w;data[1]=target.h;
  const slot=this.slots++;this.uniformData.set(data,slot*64);
  const resources=Array.from({length:8},(_,i)=>inputs[i]??this.dummy);
  const filling=name.startsWith('fill'),key=(filling?'f:':'s:')+resources.map(t=>t.id).join(',');
  let group=this.bindings.get(key);
  if(!group){
   group=this.device.createBindGroup({layout:filling?this.library.fillLayout:this.library.layout,entries:[{binding:0,resource:{buffer:this.uniforms,size:256}},
    {binding:1,resource:this.library.linear},{binding:2,resource:this.library.nearest},...resources.map((t,i)=>({binding:i+3,resource:t.view}))]});
   if(this.bindings.size>=256)this.bindings.clear();this.bindings.set(key,group);
  }
  // Full-screen unblended shaders overwrite every channel; clipped or blended draws keep the prior material.
  const loadOp=rect?'load':this.library.loadOps[name];
  const pass=encoder.beginRenderPass({colorAttachments:targets.map(t=>({view:t.view,loadOp,storeOp:'store'}))});
  pass.setPipeline(this.library.pipelines[name]);pass.setBindGroup(0,group,[slot*256]);
  if(rect){const x0=clamp(Math.floor(rect[0]),0,target.w),y0=clamp(Math.floor(rect[1]),0,target.h),x1=clamp(Math.ceil(rect[2]),x0,target.w),y1=clamp(Math.ceil(rect[3]),y0,target.h);if(x1===x0||y1===y0){pass.end();return;}pass.setScissorRect(x0,y0,x1-x0,y1-y0);}
  pass.draw(3);pass.end();
 }
 _copy(source,destination,rect=null,offset=null){
  const r=rect??[0,0,source.w,source.h],to=offset??r;
  this._command().copyTextureToTexture({texture:source.texture,origin:[r[0],r[1]]},{texture:destination.texture,origin:[to[0],to[1]]},[r[2]-r[0],r[3]-r[1]]);
 }
 _swap(pair){[pair.read,pair.write]=[pair.write,pair.read];}
 _clear(target){const pass=this._command().beginRenderPass({colorAttachments:[{view:target.view,loadOp:'clear',clearValue:[0,0,0,0],storeOp:'store'}]});pass.end();}
 _material(){return [...this.ink.read,...this.fixed,...this.wet.read,this.base];}
 _meta(){return {active:this.active?.slice()??null,dirty:this.dirty?.slice()??null,painted:this.painted?.slice()??null,wetPeak:this.wetPeak,fixTimer:this.fixTimer,elapsed:this.elapsed,lastWet:this.lastWet,awakeUntil:this.awakeUntil,flowSpeed:this.flowSpeed,growCarry:this.growCarry,frame:this.frame,brushNow:this.brushNow.slice(),params:{...this.params},paperId:this.paperId,paperOrigin:this.paperOrigin.slice(),paperScale:this.paperScale,seed:this.seed};}
 beginTransaction(){
  this._check();if(this.transaction)throw failure('WATER_BUSY','A Water gesture is already open.');
  this.endFill();const tx={tiles:new Map(),meta:this._meta(),width:this.width,height:this.height,sim:[],paper:this.paper,sheet:null};
  const sim=[...this.velocity.read,...this.pressure.read];this._reserve(sim.reduce((n,t)=>n+t.bytes,0));
  try{for(const t of sim){const copy=this._texture(t.w,t.h,t.format);tx.sim.push(copy);this._copy(t,copy);}}
  catch(error){this.submit();tx.sim.forEach(t=>this._drop(t));throw error;}
  this.transaction=tx;return tx;
 }
 _protect(rect,indices=[0,1,2,3,4,5]){
  const tx=this.transaction;if(!tx||tx.sheet)return;
  const material=this._material(),pending=[];let bytes=0;
  for(let y=Math.floor(rect[1]/128)*128;y<rect[3];y+=128)for(let x=Math.floor(rect[0]/128)*128;x<rect[2];x+=128){
   const key=x+','+y,existing=tx.tiles.get(key),missing=indices.filter(i=>!existing?.layers.has(i));if(!missing.length)continue;
   const r=existing?.r??[x,y,Math.min(this.width,x+128),Math.min(this.height,y+128)];
   if(r[0]<0||r[1]<0||r[2]<=r[0]||r[3]<=r[1])continue;
   bytes+=(r[2]-x)*(r[3]-y)*missing.reduce((sum,i)=>sum+bytesPerPixel[material[i].format],0);pending.push({key,r,existing,missing,copies:new Map()});
  }
  this._reserve(bytes);
  const made=[];
  try{for(const {r,missing,copies} of pending)for(const i of missing){const t=material[i],copy=this._texture(r[2]-r[0],r[3]-r[1],t.format);made.push(copy);copies.set(i,copy);this._copy(t,copy,r,[0,0]);}}
  catch(error){this.submit();made.forEach(t=>this._drop(t));throw error;}
  // The first write of each material layer takes its own original bytes, including a later Dry or eraser.
  for(const {key,r,existing,copies} of pending){const layers=existing?.layers??new Map();for(const [i,copy]of copies)layers.set(i,copy);tx.tiles.set(key,{r,layers});}
 }
 endTransaction(tx,cancel=false){
  if(tx!==this.transaction)throw failure('WATER_INPUT','The Water checkpoint is not current.');
  this.endFill();const retired=[];
  if(cancel){
   if(tx.sheet){retired.push(...this._sheetTextures(this._sheet()));Object.assign(this,tx.sheet);}
   if(this.paper!==tx.paper){retired.push(this.paper);this.paper=tx.paper;}
   const targets=this._material();for(const {r,layers} of tx.tiles.values())layers.forEach((t,i)=>this._copy(t,targets[i],null,r));
   for(let i=0;i<2;i++){this._copy(tx.sim[i],i?this.pressure.read[0]:this.velocity.read[0]);}
   for(const [key,value] of Object.entries(tx.meta))this[key]=value;
   for(const pair of [this.ink,this.wet,this.velocity,this.pressure])pair.read.forEach((t,i)=>this._copy(t,pair.write[i]));
  }else if(tx.sheet)retired.push(...this._sheetTextures(tx.sheet));
  if(tx.paper!==this.paper)retired.push(tx.paper);
  this.transaction=null;this.submit();retired.forEach(t=>this._drop(t));
  for(const {layers} of tx.tiles.values())layers.forEach(t=>this._drop(t));tx.sim.forEach(t=>this._drop(t));
 }
 _paper(target=this.paper,id=this.paperId,settings=this){
  const profile=getPaper(id),p=profile?.params??profile;
  if(!p)throw failure('WATER_INPUT','The Water paper is not available.');
  const data=this._parameters();data.set([settings.paperScale,settings.seed,profile.kind??p.kind??0,1.4*(p.bump??1)/settings.paperScale],48);data.set(settings.paperOrigin,52);
  const field=this._texture(this.width,this.height,'rgba16float');
  try{this._draw('paperField',field,[],data);this._draw('paperLight',target,[field],data);}finally{this._retire(field);}
 }
 setPaper(id,fields={}){
  this._check();
  if(!getPaper(id)||!fields||typeof fields!=='object'||Array.isArray(fields)||Object.keys(fields).some(key=>!['paperScale','paperOrigin','seed'].includes(key)))throw failure('WATER_INPUT','The Water paper is not available.');
  const {paperScale=this.paperScale,paperOrigin=this.paperOrigin,seed=this.seed}=fields;
  if(!Number.isFinite(paperScale)||paperScale<=0||!Array.isArray(paperOrigin)||paperOrigin.length!==2||!paperOrigin.every(Number.isFinite)||!Number.isFinite(seed)||seed<0||seed>1)throw failure('WATER_INPUT','The Water paper field is invalid.');
  if(id===this.paperId&&paperScale===this.paperScale&&seed===this.seed&&paperOrigin.every((value,i)=>value===this.paperOrigin[i]))return;
  if(this.pendingRetire.length)this.submit();
  this._reserve(this.width*this.height*12);const next=this._texture(this.width,this.height,'rgba8unorm');
  try{this._paper(next,id,{paperScale,paperOrigin,seed});}catch(error){this._retire(next);throw error;}
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
 _touch(rect,indices){if(rect[0]>=rect[2]||rect[1]>=rect[3])return;this._protect(rect,indices);this.active=union(this.active,rect);this.dirty=union(this.dirty,rect);this.painted=union(this.painted,rect);this.awakeUntil=Math.max(this.awakeUntil,this.elapsed+.25);}
 stamp({x,y,r,angle=0,brush='water/round',coefficients=null,water=0,round=0,grain=0,threshold=.5,velocity=null,lift=0,erase=false,circular=false,hardness=2}){
  this._check();const profile=typeof brush==='string'?getBrush(brush):brush;
  const settings=profile.params??profile;
  const rect=this._rect(x,y,r,circular?3.2:1.5);this._touch(rect,lift?(erase?undefined:[0,1,4]):[...(coefficients?[0,1]:[]),...(water>0?[4]:[])]);
  const data=this._parameters();data.set([x,y,r,settings.aspect??1],16);data.set([Math.cos(angle),Math.sin(angle),round,grain],20);data.set([threshold,water,hardness,0],24);
  if(lift){data[25]=lift;data[26]=2;this._draw('liftInk',this.ink.read,[],data,rect);data[25]=lift*.8;this._draw('liftWet',this.wet.read,[],data,rect);
   if(erase){data[25]=lift;this._draw('eraseFixed',this.fixed,[],data,rect);this._draw('eraseBase',this.base,[],data,rect);}return;}
  const tip=circular?null:this._tip(profile),inputs=tip?[tip,this.paper]:[];
  if(coefficients){data.set(coefficients.slice(0,4),28);data.set(coefficients.slice(4,8),32);this._draw(circular?'splatInk':'stampInk',this.ink.read,inputs,data,rect);}
  if(water>0){
   if(circular){data.set([water,0,0,0],28);this._draw('wetSplat',this.wet.read,[],data,rect);}
   else this._draw('stampWet',this.wet.read,inputs,data,rect);
   const tau=this.fixTimer>0?.25:2+16*(1-this.params.dry);
   this.wetPeak=Math.max(this.wetPeak*Math.exp(-(this.elapsed-this.lastWet)/tau),water);this.lastWet=this.elapsed;
  }
  if(velocity)this.splatVelocity(x,y,r,velocity[0],velocity[1]);
 }
 splatVelocity(x,y,r,vx,vy,track=true){
  if(track)this.flowSpeed=Math.max(this.flowSpeed,Math.hypot(vx,vy));
  const data=this._parameters();data.set([x,y,r,1],16);data[26]=1;data.set([vx,vy,0,0],28);
  this._draw('velocitySplat',this.velocity.read,[],data,this._rect(x,y,r,3,this.sw,this.sh));
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
  if(coefficients){data.set(coefficients.slice(0,4),28);data.set(coefficients.slice(4,8),32);this._draw('fillInk',this.ink.read,[texture,this.paper],data,box);}
  if(water>0){
   this._draw('fillWet',this.wet.read,[texture,this.paper],data,box);
   const tau=this.fixTimer>0?.25:2+16*(1-this.params.dry);
   this.wetPeak=Math.max(this.wetPeak*Math.exp(-(this.elapsed-this.lastWet)/tau),water);this.lastWet=this.elapsed;
  }
  return true;
 }
 endFill(){if(this.fill){this._retire(this.fill.texture);this.fill=null;}}
 async step(seconds=1/60){
  this._check();if(!this.active){this.brushNow=[0,0,0];return false;}
  const dt=clamp(seconds,1/240,1/30),fixing=this.fixTimer>0;
  this.elapsed+=dt;this.frame++;this.fixTimer=Math.max(0,this.fixTimer-dt);
  this.flowSpeed*=Math.exp(-dt*(3-2.4*this.params.flow));
  this.growCarry+=.4+Math.min(3,.15*this.flowSpeed*dt*this.width/this.sw);const grow=Math.floor(this.growCarry);this.growCarry-=grow;
  this.active=[Math.max(0,this.active[0]-grow),Math.max(0,this.active[1]-grow),Math.min(this.width,this.active[2]+grow),Math.min(this.height,this.active[3]+grow)];
  const rect=this.active;this._protect(rect,fixing?[0,1,2,3,4]:[0,1,4]);
  const data=this._parameters();data[4]=dt;const settle=fixing?1-Math.exp(-5*dt):0;
  const decay=Math.exp(-dt/(this.fixTimer>0?.25:2+16*(1-this.params.dry)));
  const damping=Math.exp(-dt*(3-2.4*this.params.flow)-(fixing?7*dt:0));data.set([decay,damping,settle,1-settle],8);
  this._draw('velocity',this.velocity.write,[this.velocity.read[0],this.wet.read[0]],data);this._swap(this.velocity);
  this._draw('curl',this.curl,this.velocity.read,data);
  this._draw('vorticity',this.velocity.write,[this.velocity.read[0],this.curl],data);this._swap(this.velocity);
  this._draw('divergence',this.divergence,this.velocity.read,data);
  this._draw('pressureDecay',this.pressure.write,this.pressure.read,data);this._swap(this.pressure);
  for(let i=0;i<20;i++){this._draw('pressure',this.pressure.write,[this.pressure.read[0],this.divergence],data);this._swap(this.pressure);}
  this._draw('project',this.velocity.write,[this.velocity.read[0],this.pressure.read[0]],data);this._swap(this.velocity);
  this._draw('wet',this.wet.write,[this.velocity.read[0],this.wet.read[0]],data,rect);this._swap(this.wet);
  if(fixing){this._draw('bleach',this.fixed,[this.ink.read[1]],data,rect);this._draw('fix',this.fixed,this.ink.read,data,rect);}
  this._draw('pigment',this.ink.write,[this.velocity.read[0],...this.ink.read,this.wet.read[0]],data,rect);this._swap(this.ink);
  this.brushNow=[0,0,0];
  this.dirty=union(this.dirty,rect);this.painted=union(this.painted,rect);
  if(fixing&&!this.fixTimer){this.wetPeak=0;this.awakeUntil=0;this.painted=null;}
  const until=this.lastWet+(2+16*(1-this.params.dry))*Math.log(Math.max(.004,this.wetPeak)/.004);
  if(!this.fixTimer&&this.elapsed>=this.awakeUntil&&this.elapsed>=until)this.sleep();
  else if(this.frame%10===0&&!fixing)await this._trim();
  this.submit();return true;
 }
 async _trim(){
  const previous=this.active;if(!previous)return;
  this._draw('mask',this.mask,this.wet.read,this._parameters(this.mask.w,this.mask.h));
  const pixels=await this._readTexture(this.mask);let x0=this.mask.w,y0=this.mask.h,x1=-1,y1=-1;
  for(let y=0;y<this.mask.h;y++)for(let x=0;x<this.mask.w;x++)if(pixels[(y*this.mask.w+x)*4]){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  const next=x1>=0?[Math.max(previous[0],x0*16-24),Math.max(previous[1],y0*16-24),Math.min(previous[2],(x1+1)*16+24),Math.min(previous[3],(y1+1)*16+24)]:null;
  if(next&&next.every((v,i)=>v===previous[i]))return;
  for(const pair of [this.ink,this.wet])pair.read.forEach((t,i)=>this._copy(t,pair.write[i],previous));
  if(next&&next[2]>next[0]&&next[3]>next[1])this.active=next;else this.sleep();
 }
 sleep(){
  if(this.active)for(const pair of [this.ink,this.wet])pair.read.forEach((t,i)=>this._copy(t,pair.write[i],this.active));
  for(const pair of [this.velocity,this.pressure])for(const t of [...pair.read,...pair.write])this._clear(t);
  this.active=null;this.wetPeak=0;this.flowSpeed=0;
 }
 dry(){if(this.painted){this.active=union(this.active,this.painted);this.fixTimer=1.2;this.awakeUntil=this.elapsed+1.2;}}
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
  const transfers=requests.map(({target,box})=>{
   const r=box??[0,0,target.w,target.h];
   if(!Array.isArray(r)||r.length!==4||!r.every(Number.isSafeInteger)||r[0]<0||r[1]<0||r[2]>target.w||r[3]>target.h||r[2]<=r[0]||r[3]<=r[1])throw failure('WATER_INPUT','The Water readback rectangle is invalid.');
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
     if(batch.length&&this.bytes+item.size>this.maxBytes)break;
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
 render({paper=false,white=false,flat=false,box=null}={}){
  this._check();const profile=getPaper(this.paperId),p=profile.params??profile,data=this._parameters();
  data.set([this.params.granulation*.55,.8,paper?1:white?3:2,flat?1:0],36);
  data.set([...linearHex(p.tint??'#ffffff'),1],40);data.set([...linearHex(p.fleck??'#665544'),p.mottle??.05],44);
  this._draw('display',this.output,[...this.ink.read,...this.fixed,this.wet.read[0],this.paper,this.base],data,box);
  // Flood-fill reads a paper-composited image. It cannot become the retained transparent display.
  if(paper||white||flat)this.outputCanonical=false;else if(!box)this.outputCanonical=true;
 }
 async present(texture,box=null){
  this.render({box:this.outputCanonical?box:null});
  // A canvas texture is newly acquired each frame. Its complete image comes from the retained output.
  this._draw('present',{view:texture.createView(),w:this.width,h:this.height},[this.output]);
  this.submit();
  // Keep one completed GPU frame in flight, and surface loss without a live pixel readback.
  try{await this.device.queue.onSubmittedWorkDone();}catch(error){this._poison(error);}
  await this._settleErrors();
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
  try{this._paper(paper,meta.paperId,meta);this.submit();await this._settleErrors();}catch(error){this._retire(paper);throw error;}
  for(const [name,target] of Object.entries(targets))this._writeTexture({texture:target.texture},state.layers[name],{bytesPerRow:target.w*bytesPerPixel[target.format]},[target.w,target.h]);
  const old=this.paper;this.paper=paper;Object.assign(this,meta);
  if(old!==this.transaction?.paper && old!==this.transaction?.sheet?.paper)this._retire(old);
  for(const pair of [this.ink,this.wet,this.velocity,this.pressure])pair.read.forEach((t,i)=>this._copy(t,pair.write[i]));this.submit();await this._settleErrors();
 }
 async grow(left,top,right,bottom){
  this._check();
  if(![left,top,right,bottom].every(v=>Number.isSafeInteger(v)&&v>=0))throw failure('WATER_INPUT','The Water sheet growth is not valid.');
  return this.reframe(this.width+left+right,this.height+top+bottom,left,top);
 }
 async reframe(w,h,x=0,y=0){
  this._check();this._dimensions(w,h);
  if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y))throw failure('WATER_INPUT','The Water sheet offset is not valid.');
  if(w===this.width&&h===this.height&&!x&&!y)return;
  this.endFill();this.submit();
  const previous=this._material(),old=this._sheet(),meta=this._meta();
  let grown;
  try{
   grown=this._allocate(w,h);const next=this._material();
   const sx=Math.max(0,-x),sy=Math.max(0,-y),dx=Math.max(0,x),dy=Math.max(0,y);
   const cw=Math.min(old.width-sx,w-dx),ch=Math.min(old.height-sy,h-dy);
   if(cw>0&&ch>0)previous.forEach((t,i)=>this._copy(t,next[i],[sx,sy,sx+cw,sy+ch],[dx,dy]));
   for(const pair of [this.ink,this.wet])pair.read.forEach((t,i)=>this._copy(t,pair.write[i]));
   const bottom=h-old.height-y;
   this.paperOrigin=[meta.paperOrigin[0]-x,meta.paperOrigin[1]-bottom];
   this.brushNow=[(meta.brushNow[0]*old.width+x)/w,(meta.brushNow[1]*old.height+bottom)/h,meta.brushNow[2]*old.height/h];
   for(const key of ['active','painted'])if(this[key]){
    const r=this[key],shifted=[Math.max(0,r[0]+x),Math.max(0,r[1]+y),Math.min(w,r[2]+x),Math.min(h,r[3]+y)];
    this[key]=shifted[2]>shifted[0]&&shifted[3]>shifted[1]?shifted:null;
   }
   this.dirty=[0,0,w,h];this._paper();this.submit();await this._settleErrors();
  }catch(error){
   this.encoder=null;this.slots=0;this.pendingRetire.forEach(t=>this._drop(t));this.pendingRetire=[];
   if(grown)this._sheetTextures(grown).forEach(t=>this._drop(t));Object.assign(this,old,meta);throw error;
  }
  if(this.transaction&&!this.transaction.sheet)this.transaction.sheet=old;
  else this._sheetTextures(old).forEach(t=>{if(t!==this.transaction?.paper)this._drop(t);});
 }
 stats(){return {backend:'webgpu',bytes:this.bytes,width:this.width,height:this.height,simulation:[this.sw,this.sh],active:this.active?.slice()??null,frames:this.frame};}
 dispose(){
  if(this.disposed)return;
  try{this.submit();}finally{this._release();this.transaction=null;this.fill=null;this.disposed=true;}
 }
}
