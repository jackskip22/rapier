// SPDX-License-Identifier: AGPL-3.0-only
// WebGPU owns live water and pigment. A document owns its published straight RGBA bytes.
import {WaterGPU,waterReady,waterHandSheetFits,WATER_GPU_MAX_BYTES} from './water-gpu.mjs';
import {WaterContact} from './water-contact.mjs';
import {getBrush,makeTip,CUSTOM_PARAMS} from './water-materials.mjs';
import {encodeRgb,toLinear} from './water-color.mjs';
import {buildWaterFill} from './water-fill.mjs';
import {waterTimeFits} from './water-data.mjs';
import {WATER_TICK_HZ,WATER_BANDS,WATER_ACTION_MAX_POINTS,WATER_TIP_MAX_PIXELS,WATER_SOURCE_MAX_BYTES,WATER_PAPERS,WATER_PIGMENTS,WATER_BRUSHES,WATER_TOOLS,WATER_CONTROLS,waterBrushById,waterPigmentById,waterPaperById,waterError,waterRadius,admitWaterPigment,admitWaterTip,admitWaterControls,admitWaterBrush,waterBrushDefinition,admitWaterAction,admitWaterActions,admitWaterState} from './water-data.mjs';
export {WATER_TICK_HZ,WATER_BANDS,WATER_ACTION_MAX_POINTS,WATER_TIP_MAX_PIXELS,WATER_SOURCE_MAX_BYTES,WATER_PAPERS,WATER_PIGMENTS,WATER_BRUSHES,WATER_TOOLS,WATER_CONTROLS,waterBrushById,waterPigmentById,waterPaperById,waterError,waterRadius,admitWaterPigment,admitWaterTip,admitWaterControls,admitWaterBrush,waterBrushDefinition,admitWaterAction,admitWaterActions,admitWaterState};
export {waterReady,waterHandSheetFits};
const clone=value=>structuredClone(value);
const clip=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const seconds=v=>clip(v,1/240,1/30);
const sourceBytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const union=(a,b)=>!b?a:!a?{...b}:{x0:Math.min(a.x0,b.x0),y0:Math.min(a.y0,b.y0),x1:Math.max(a.x1,b.x1),y1:Math.max(a.y1,b.y1)};
const boxOf=r=>r?{x0:r[0],y0:r[1],x1:r[2]-1,y1:r[3]-1}:null;
const rectOf=b=>b?[b.x0,b.y0,b.x1+1,b.y1+1]:null;
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const rgbChannel=v=>clip(v<=.0031308?12.92*v:1.055*Math.max(0,v)**(1/2.4)-.055);
function dimensions(w,h){if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w*h>12000000)throw waterError('WATER_BUDGET','This Water sheet is too large. Use a new or smaller layer.');}
function randomStream(seed){let state=seed>>>0;const random=()=>{state=(state+0x6d2b79f5)>>>0;let n=Math.imul(state^state>>>15,1|state);n^=n+Math.imul(n^n>>>7,61|n);return ((n^n>>>14)>>>0)/4294967296;};random.get=()=>state;random.set=value=>{state=value>>>0;};return random;}
function coefficients(pigment){return (typeof pigment==='string'?waterPigmentById(pigment):pigment).coefficients;}
function halfValue(bits){const sign=bits&0x8000?-1:1,exponent=(bits>>>10)&31,mantissa=bits&1023;return sign*(exponent===0?mantissa*2**-24:exponent===31?mantissa?NaN:Infinity:(1+mantissa/1024)*2**(exponent-15));}
function reframeContact(contact,oldWidth,oldHeight,width,height,x,y){if(!contact)return;const s=contact.state;if(s){s.x=(s.x*oldWidth+x)/width;s.cx=(s.cx*oldWidth+x)/width;s.y=1-((1-s.y)*oldHeight+y)/height;s.cy=1-((1-s.cy)*oldHeight+y)/height;s.carry*=oldHeight/height;s.distance*=oldHeight/height;}contact.radiusScale*=oldHeight/height;}
export function waterPigmentRGB(value){const linear=toLinear(value),white=1-Math.exp(-2.2*Math.max(0,value[7]??0));return linear.map((v,i)=>rgbChannel(v*(1-white)+[.96,.955,.94][i]*white));}
export function waterPigmentFromRGB(r,g,b){return {coefficients:Array.from(encodeRgb([r,g,b].map(v=>clip(v)))),granulation:.45,staining:0,source:'raster'};}

export class WaterSurface {
 constructor(width,height,options={}){
  dimensions(width,height);this.width=width;this.height=height;this.scale=(options.pixelScale??3)/3;
  this.origin=(options.origin??[0,0]).slice();this.seed=options.seed??1;this.paperId=options.paper??'cold-press';
  if(!(this.scale>0)||this.scale>16/3||this.origin.length!==2||!this.origin.every(Number.isSafeInteger)||!integer(this.seed)||this.seed>0xffffffff||!waterPaperById(this.paperId))throw waterError('WATER_INPUT','The Water sheet is not valid.');
  this.cell=1;this.tick=0;this.revision=0;this.toothOX=this.origin[0];this.toothOY=this.origin[1];this.paper=null;
  this.maxBytes=options.maxBytes??WATER_GPU_MAX_BYTES;this.wetPending=0;this._wetWork=null;this._dirty=null;this._bounds=null;this.growBox=null;
  this._actions=[];this._bytes=2;this._actionStart=0;this._tips=new Map();this._transaction=null;this._brush=null;this._pendingDt=0;this._disposed=false;
  this.gpu=new WaterGPU(width,height,{...options,paper:this.paperId,seed:options.paperSeed??randomStream(this.seed)(),paperScale:options.paperScale??1100/(options.paperHeight??height),paperOrigin:options.paperOrigin??[this.origin[0],-this.origin[1]]});
  this.ready=this.gpu.ready.then(async()=>{
   if(options.state)await this._restore(options.state);
   else if(options.pixels){await this.gpu.upload(options.pixels.data,options.pixels.width,options.pixels.height);this._rasterBounds(options.pixels.data,options.pixels.width,options.pixels.height,0,0);}
   this._sync();return this;
  }).catch(error=>{try{this.gpu.dispose();}catch(_){}this._disposed=true;throw error;});
 }
 get pixelScale(){return this.scale*3;}
 get wet(){return !!this.gpu.active;}
 get wetState(){return this.wet?{tick:this.tick}:null;}
 get sourceBytes(){return this._bytes;}
 _contactFrame(){return {width:this.width,height:this.height,scale:this.pixelScale,origin:this.origin.slice(),paperScale:this.gpu.paperScale,paperOrigin:this.gpu.paperOrigin.slice(),paperSeed:this.gpu.seed};}
 _frame(){return {...this._contactFrame(),seed:this.seed,paper:this.paperId,cell:1};}
 _sync(){
  this.width=this.gpu.width;this.height=this.gpu.height;this.paperId=this.gpu.paperId;
  if(this.gpu.dirty){this._dirty=union(this._dirty,boxOf(this.gpu.dirty));this.gpu.dirty=null;}
  this._bounds=union(this._bounds,boxOf(this.gpu.painted));this._bounds=union(this._bounds,boxOf(this.gpu.active));
  this.growBox=this._bounds?{...this._bounds}:null;
 }
 bounds(){this._sync();return this._bounds?{...this._bounds}:null;}
 takeDirty(){this._sync();const box=this._dirty;this._dirty=null;return box?{...box}:null;}
 _sourceRoom(bytes){if(this._bytes+bytes>WATER_SOURCE_MAX_BYTES)throw waterError('WATER_REPLAY_BUDGET','The complete Water journal is full. Start a new layer to keep contribution Undo.');}
 _appendAction(action){
  const last=this._actions.at(-1);
  if(action.kind==='advance'&&last?.kind==='advance'&&last.dt===action.dt){const next={...last,ticks:last.ticks+action.ticks};if(!integer(next.ticks)||!waterTimeFits(next.ticks*(next.dt??1/60)))throw waterError('WATER_INPUT','The Water time is not representable.');const extra=sourceBytes(next)-sourceBytes(last);this._sourceRoom(extra);Object.assign(last,next);this._bytes+=extra;return last;}
  const extra=sourceBytes(action)+(this._actions.length?1:0);this._sourceRoom(extra);const saved=clone(action);this._actions.push(saved);this._bytes+=extra;return saved;
 }
 _appendFrame(brush,dt,count,end){const frame=[dt,count,end],extra=sourceBytes(frame)+(brush.action.frames.length?1:0);this._sourceRoom(extra);brush.action.frames.push(frame);this._bytes+=extra;}
 _declareTip(brush){const old=this._tips.get(brush.brush);if(old){if(JSON.stringify(old)!==JSON.stringify(brush.tip))throw waterError('WATER_INPUT','This brush name already holds another tip.');return false;}this._tips.set(brush.brush,clone(brush.tip));return true;}
 _restoreTips(tips){for(const [id,target]of this.gpu.tips)if(id.startsWith('water/own-')){this.gpu.tips.delete(id);this.gpu._retire(target);}this._tips=new Map(tips);}
 _recordTip(brush){if(!brush.tip)return;if(this._tips.has(brush.brush)){this._declareTip(brush);return;}const action=admitWaterAction({kind:'tip',brush});if(!action)throw waterError('WATER_INPUT','The brush tip is not valid.');this._appendAction(action);this._declareTip(action.brush);}
 waterReplay(){return {from:this._actionStart,to:this._actionStart+this._actions.length,frame:this._frame(),actions:clone(this._actions)};}
 takeWaterReplay(to=this._actionStart+this._actions.length){
  if(!integer(to)||to<this._actionStart||to>this._actionStart+this._actions.length)throw waterError('WATER_INPUT','The Water source cursor is not valid.');
  const removed=this._actions.splice(0,to-this._actionStart);this._actionStart=to;this._bytes=sourceBytes(this._actions);return removed;
 }
 async beginStroke(){
  await this.ready;await this._finishContact();
  if(this._transaction)throw waterError('WATER_BUSY','A Water gesture is already open.');
  const checkpoint={gpu:this.gpu.beginTransaction(),frame:this._frame(),tick:this.tick,revision:this.revision,dirty:clone(this._dirty),bounds:clone(this._bounds),actions:clone(this._actions),bytes:this._bytes,start:this._actionStart,tips:clone([...this._tips])};
  this._transaction=checkpoint;return checkpoint;
 }
 async endStroke(checkpoint,cancel=false){
  await this.ready;if(checkpoint!==this._transaction)throw waterError('WATER_INPUT','The Water checkpoint is not current.');
  if(!cancel)await this._finishContact();
  await this.gpu.endTransaction(checkpoint.gpu,cancel);this._transaction=null;this.gpu.painting=false;
  if(cancel){const f=checkpoint.frame;this.width=f.width;this.height=f.height;this.origin=f.origin.slice();this.scale=f.scale/3;this.paperId=f.paper;this.toothOX=this.origin[0];this.toothOY=this.origin[1];this.tick=checkpoint.tick;this.revision=checkpoint.revision;this._bounds=checkpoint.bounds;this._actions=checkpoint.actions;this._bytes=checkpoint.bytes;this._actionStart=checkpoint.start;this._restoreTips(checkpoint.tips);this._brush=null;this._pendingDt=0;this._dirty={x0:0,y0:0,x1:this.width-1,y1:this.height-1};}
  this._sync();return true;
 }
 async _atomic(work){const own=!this._transaction,checkpoint=own?await this.beginStroke():this._transaction;try{const value=await work();if(own)await this.endStroke(checkpoint);return value;}catch(error){if(this._transaction===checkpoint)await this.endStroke(checkpoint,true);throw error;}}
 async _flushContact(dt=null,finish=false){
  const brush=this._brush;if(!brush?.contact)return false;
  const contact=brush.contact,count=contact.queue.length;if(!count&&!finish&&dt==null)return false;
  const elapsed=seconds(dt??(this._pendingDt||1/60));
  this.gpu._age(elapsed);
  // Reserve the complete frame record before submitting a material change.
  this._appendFrame(brush,elapsed,count,finish);
  this.gpu.painting=true;
  if(finish)contact.finish();contact.frame(elapsed);await this.gpu.step(elapsed);this.tick++;this.revision++;this._pendingDt=0;brush.loadFuel=contact.loadFuel;this._sync();
  if(finish){brush.lastDirection=contact.lastDirection.slice();brush.contact=null;brush.action=null;this._brush=null;this.gpu.painting=false;}
  return true;
 }
 async _finishContact(){if(this._brush?.contact)await this._flushContact(null,true);}
 async _advance(dt){const ran=await this.gpu.step(dt);this.tick++;if(ran)this.revision++;this._sync();return ran;}
 async step(ticks=1,dt=1/60){
  await this.ready;if(!integer(ticks)||!integer(this.tick+ticks))throw waterError('WATER_INPUT','The Water time is not representable.');
  if(ticks)this.gpu._age(dt*ticks);
  for(let i=0;i<ticks;i++)await this._advance(dt);return {ticks,wet:this.wet};
 }
 async stepWet(ms=1000/60){
  await this.ready;if(!Number.isFinite(ms)||ms<0)throw waterError('WATER_INPUT','The Water frame time is not valid.');
  if(!ms)return !this.wet;const dt=ms/1000;
  if(this._brush?.contact){if(!this._brush.absoluteInputTime)this._brush.time+=ms;await this._flushContact(seconds(dt));}
  else if(this.wet){this.gpu._age(dt);this._appendAction({kind:'advance',ticks:1,dt});await this._advance(dt);}
  return !this.wet;
 }
 async advanceWet(ms){return this.stepWet(ms);}
 composeWet(){this._sync();return !!this._dirty;}
 async dryWet(_deadline,feed=1000/60){return this.stepWet(feed);}
 async settleWet(){await this.ready;await this._finishContact();if(this.wet)this._sourceRoom(sourceBytes({kind:'advance',ticks:Number.MAX_SAFE_INTEGER,dt:1/60})+1);let frames=0;while(this.wet){await this._advance(1/60);frames++;}if(frames)this._appendAction({kind:'advance',ticks:frames,dt:1/60});this.wetPending=0;return true;}
 async _finishWetWork(){await this.ready;await this._flushContact();this.gpu.submit();return true;}
 async *settle(){while(this.wet){await this.stepWet(1000/60);yield {tick:this.tick,wet:this.wet};}return this;}
 tilt(gx,gy){if(![gx,gy].every(Number.isFinite))throw waterError('WATER_INPUT','The paper tilt is not valid.');}
 _rasterBounds(data,width,height,x,y){let x0=width,y0=height,x1=-1,y1=-1;for(let py=0;py<height;py++)for(let px=0;px<width;px++){const i=(py*width+px)*4;if(data[i]||data[i+1]||data[i+2]||data[i+3]){x0=Math.min(x0,px);y0=Math.min(y0,py);x1=Math.max(x1,px);y1=Math.max(y1,py);}}if(x1>=0)this._bounds=union(this._bounds,{x0:x+x0,y0:y+y0,x1:x+x1,y1:y+y1});}
 async fromRGBA8(data,width=this.width,height=this.height,x=0,y=0){await this.ready;await this._finishContact();await this.gpu.upload(data,width,height,x,y);this._rasterBounds(data,width,height,x,y);this.revision++;this._sync();return this;}
 async grow(left=0,top=0,right=0,bottom=0){
  if(![left,top,right,bottom].every(integer))throw waterError('WATER_INPUT','The Water sheet growth is not valid.');
  return this.reframe(this.width+left+right,this.height+top+bottom,left,top);
 }
 async reframe(width,height,x=0,y=0){
  await this.ready;dimensions(width,height);if(![x,y].every(Number.isSafeInteger))throw waterError('WATER_INPUT','The Water frame offset is not valid.');await this._flushContact();
  const change=this._brush?.action?[0,0,false,{width,height,origin:[this.origin[0]-x,this.origin[1]-y]}]:null,extra=change?sourceBytes(change)+1:0;if(change)this._sourceRoom(extra);
  const oldWidth=this.width,oldHeight=this.height;await this.gpu.reframe(width,height,x,y);this.width=width;this.height=height;
  this.origin[0]-=x;this.origin[1]-=y;this.toothOX=this.origin[0];this.toothOY=this.origin[1];
  if(this._bounds){const b=this._bounds;this._bounds={x0:Math.max(0,b.x0+x),y0:Math.max(0,b.y0+y),x1:Math.min(width-1,b.x1+x),y1:Math.min(height-1,b.y1+y)};if(this._bounds.x0>this._bounds.x1||this._bounds.y0>this._bounds.y1)this._bounds=null;}
  reframeContact(this._brush?.contact,oldWidth,oldHeight,width,height,x,y);
  if(change){this._brush.action.frames.push(change);this._bytes+=extra;}
  this.revision++;this._sync();return this;
 }
 async _replayFrame(frame,offset,contact=null){
  const oldWidth=this.width,oldHeight=this.height,x=this.origin[0]-frame.origin[0]-offset[0],y=this.origin[1]-frame.origin[1]-offset[1];
  await this.reframe(frame.width,frame.height,x,y);reframeContact(contact,oldWidth,oldHeight,frame.width,frame.height,x,y);
  if(frame.paperScale!=null)this.gpu.setPaperField({paperScale:frame.paperScale,paperOrigin:frame.paperOrigin,seed:frame.paperSeed});
 }
 _brushFor(action){const tip=this._tips.get(action.brush);if(action.brush.startsWith('water/own-')&&!tip)throw waterError('WATER_INPUT','This layer does not hold that brush tip.');return new WaterBrush({water:{brush:action.brush,tool:action.tool,pigment:action.pigment,paper:action.paper??this.paperId,...action.controls,...(tip?{tip}:{})}});}
 async apply(raw){return this.applyWater(raw);}
 async applyWater(raw,options={}){let result;for await(const step of this.applyWaterSteps(raw,options))result=step;return result??true;}
 async *applyWaterSteps(raw,{replayFrames=false,frameOffset=[0,0]}={}){
  const action=admitWaterAction(raw);if(!action)throw waterError('WATER_INPUT','The Water action is not valid.');
  if(!replayFrames&&(action.frame||action.frames?.some(frame=>frame.length===4)))throw waterError('WATER_INPUT','Stored Water frame changes can only be used by the current session journal.');
  if(!Array.isArray(frameOffset)||frameOffset.length!==2||!frameOffset.every(Number.isSafeInteger))throw waterError('WATER_INPUT','The Water journal frame offset is not valid.');
  await this.ready;await this._finishContact();const own=!this._transaction,checkpoint=own?await this.beginStroke():this._transaction;let complete=false,record=true;
  try{
   this._sourceRoom(sourceBytes(action)+1);
   if(action.kind==='advance'){if(action.ticks)this.gpu._age((action.dt??1/60)*action.ticks);for(let i=0;i<action.ticks;i++){await this._advance(action.dt??1/60);yield {kind:'advance',tick:this.tick};}}
   else if(action.kind==='dry'){this.gpu.dry();while(this.gpu.fixTimer>0){await this._advance(1/60);yield {kind:'dry',tick:this.tick};}}
   else if(action.kind==='paper'){this.gpu.setPaper(action.paper);this.revision++;this._sync();}
   else if(action.kind==='tip')record=this._declareTip(action.brush);
   else if(action.kind==='fill'){yield* this._fillSteps(action);}
   else {
    if(action.paper)this.gpu.setPaper(action.paper);
    if(action.frame){if(action.frame.scale!==this.pixelScale)throw waterError('WATER_INPUT','The Water journal pixel scale does not match its sheet.');await this._replayFrame(action.frame,frameOffset);}
    const brush=this._brushFor(action);brush.seed(action.seed);if(action.direction)brush.lastDirection=action.direction.slice();let time=0;
    this.gpu.painting=true;
    try{
    for(let pathIndex=0;pathIndex<action.paths.length;pathIndex++){
     const path=action.paths[pathIndex],contact=brush._contactFor(this,action.inputKind??'script');let pointIndex=0;
     const sample=point=>{time=point[6]??point[3]*1000/60;contact.sample((point[0]*this.pixelScale-this.origin[0])/this.width,1-(point[1]*this.pixelScale-this.origin[1])/this.height,(action.inputKind??'script')==='script'?clip(point[2],.02,1):point[2],time,(point[4]??0)*90,(point[5]??0)*90);};
     if(action.frames){
      for(const [dt,count,finish,change] of action.frames){if(change){await this._replayFrame(change,frameOffset,contact);continue;}const first=pointIndex;for(let i=0;i<count;i++)sample(path[pointIndex++]);if(finish)contact.finish();contact.frame(dt);await this._advance(dt);for(let point=first;point<pointIndex;point++)yield {path:pathIndex,point,tick:this.tick};}
      if(contact.state){contact.finish();contact.frame(1/60);await this._advance(1/60);}
     }else {
      let previous=path[0][3];
      for(const point of path){const gap=point[3]-previous;for(let i=1;i<gap;i++){contact.frame(1/60);await this._advance(1/60);}sample(point);contact.frame(1/60);await this._advance(1/60);yield {path:pathIndex,point:pointIndex++,tick:this.tick};previous=point[3];}
      contact.finish();contact.frame(1/60);await this._advance(1/60);
     }
     brush.lastDirection=contact.lastDirection.slice();
    }
    }finally{this.gpu.painting=false;}
   }
   if(record)this._appendAction(action);this._sync();if(own)await this.endStroke(checkpoint);complete=true;return {tick:this.tick,wet:this.wet,bounds:this.bounds()};
  }finally{if(!complete&&this._transaction===checkpoint)await this.endStroke(checkpoint,true);}
 }
 async *_fillSteps(action){
  if(action.paper)this.gpu.setPaper(action.paper);const image={width:this.width,height:this.height,data:await this.gpu.read({paper:true,flat:true})},random=randomStream(action.seed),x=Math.floor(action.at[0]*this.pixelScale-this.origin[0]),y=Math.floor(action.at[1]*this.pixelScale-this.origin[1]);
  if(x<0||y<0||x>=this.width||y>=this.height)throw waterError('WATER_INPUT','The fill starts outside the layer.');
  const fill=buildWaterFill(image,x,y,Math.round(Math.max(0,Math.min(1,action.tolerance))*255),random),color=coefficients(action.pigment),amount=.15*Math.exp(2.8*action.controls.load)*.84*action.controls.light;
  if(fill.count<4)return;
  const pigment=Array.from(color,(v,i)=>v*amount*(i===7?1.6:1)),water=(.25+.75*action.controls.water)*.9;
  this.gpu.beginFill(fill.field,fill.box);
  try{let front=-.5;const end=fill.maxDistance+28;while(front<end){const next=Math.min(end,front+600/60);this.gpu.fillStep({from:front,to:next,coefficients:action.tool==='water'?null:pigment,water,soft:12});front=next;await this._advance(1/60);yield {kind:'fill',front,tick:this.tick};}}
  finally{this.gpu.endFill();}
 }
 async toRGBA8(box=null,_straight=true,_quality='final'){
  await this.ready;await this._flushContact();
  const b=box??{x0:0,y0:0,x1:this.width-1,y1:this.height-1};if(![b.x0,b.y0,b.x1,b.y1].every(Number.isSafeInteger)||b.x0<0||b.y0<0||b.x1>=this.width||b.y1>=this.height||b.x1<b.x0||b.y1<b.y0)throw waterError('WATER_INPUT','The Water readout frame is not valid.');
  const data=await this.gpu.read({box:rectOf(b)});this._sync();return {width:b.x1-b.x0+1,height:b.y1-b.y0+1,data:new Uint8ClampedArray(data.buffer,data.byteOffset,data.byteLength)};
 }
 async render({dirty=true}={}){await this._flushContact();const box=dirty?this.takeDirty():{x0:0,y0:0,x1:this.width-1,y1:this.height-1};return {patches:box?[{x:box.x0,y:box.y0,...await this.toRGBA8(box)}]:[],tick:this.tick,revision:this.revision,wet:this.wet};}
 async samplePigment(x,y){
  await this.ready;await this._flushContact();x=Math.floor(x*this.pixelScale-this.origin[0]);y=Math.floor(y*this.pixelScale-this.origin[1]);if(x<0||y<0||x>=this.width||y>=this.height)return null;
  const region=[x,y,x+1,y+1],values=new Float32Array(8);for(const [n,t] of [...this.gpu.ink.read,...this.gpu.fixed].entries()){const bytes=await this.gpu._readTexture(t,region),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<4;i++)values[(n%2)*4+i]+=halfValue(view.getUint16(i*2,true));}
  const pixels=await this.toRGBA8({x0:x,y0:y,x1:x,y1:y}),rgba=Array.from(pixels.data),hasMaterial=values.some(v=>Math.abs(v)>1e-8);
  if(!hasMaterial){if(!rgba[3])return null;const alpha=rgba[3]/255,pigment=waterPigmentFromRGB(...rgba.slice(0,3).map(v=>v/255*alpha+1-alpha));return {...pigment,rgba,colour:'#'+rgba.slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('')};}
  return {coefficients:Array.from(values),granulation:.45,staining:0,source:'pigment',rgba,colour:'#'+waterPigmentRGB(values).map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('')};
 }
 async snapshot(_box=null){await this.ready;await this._flushContact();return {kind:'water-gpu',frame:this._frame(),tick:this.tick,material:await this.gpu.snapshot(),tips:clone([...this._tips]),bounds:clone(this._bounds)};}
 async _restore(raw){const state=admitWaterState(raw);if(!state||state.frame.width!==this.width||state.frame.height!==this.height)throw waterError('WATER_INPUT','The Water material checkpoint does not fit this sheet.');await this.gpu.restore(state.material);this.scale=state.frame.scale/3;this.origin=state.frame.origin.slice();this.toothOX=this.origin[0];this.toothOY=this.origin[1];this.seed=state.frame.seed;this.paperId=state.frame.paper;this.tick=state.tick;this._restoreTips(state.tips??[]);this._bounds=state.bounds??null;this._brush=null;this._actions=[];this._bytes=2;this._actionStart=0;this._dirty={x0:0,y0:0,x1:this.width-1,y1:this.height-1};this.revision++;this._sync();return this;}
 async fromSnapshot(raw){await this.ready;await this._finishContact();return this._restore(raw);}
 async clear(){await this.ready;await this._finishContact();this.gpu._protect([0,0,this.width,this.height]);for(const t of this.gpu._material())this.gpu._clear(t);for(const pair of [this.gpu.ink,this.gpu.wet])pair.read.forEach((t,i)=>this.gpu._copy(t,pair.write[i]));this.gpu.sleep();this.gpu.painted=null;this.gpu.dirty=[0,0,this.width,this.height];this.gpu.submit();this._bounds=null;this.revision++;this._sync();}
 stats(){return {...this.gpu.stats(),tick:this.tick,sourceBytes:this._bytes};}
 dispose(){if(this._disposed)return;this.gpu.dispose();this._brush=null;this._actions=[];this._tips.clear();this._disposed=true;}
}

export class WaterBrush {
 constructor(definition){const water=admitWaterBrush(definition);if(!water)throw waterError('WATER_INPUT','The Water brush is not valid.');this.water=water;this.radius=water.radius??waterRadius(water.size);this.seedValue=1;this.random=randomStream(1);this.wet={water:water.water};this.loadFuel=1;this.held=water.follow?null:water.angle;this.lastDirection=[1,0];this.reset();}
 seed(value){if(!integer(value)||value>0xffffffff)throw waterError('WATER_INPUT','The Water brush seed is not valid.');this.seedValue=value;this.random=randomStream(value);}
 setColor(r,g,b){if(![r,g,b].every(Number.isFinite))throw waterError('WATER_INPUT','The brush colour is not valid.');}
 setPigment(raw){const pigment=admitWaterPigment(raw);if(!pigment)throw waterError('WATER_INPUT','The selected pigment is not valid.');this.water.pigment=pigment;if(this.contact)this.contact.coefficients=Float32Array.from(coefficients(pigment),v=>v*this.water.light);}
 setBaseValue(name,value){if(!Number.isFinite(value))throw waterError('WATER_INPUT','The brush control is not valid.');if(name==='radius_logarithmic')this.radius=Math.exp(value)/3;}
 getBaseValue(name){return name==='radius_logarithmic'?Math.log(this.radius*3):0;}
 setHead(held,erase=false){if(held!==null&&!Number.isFinite(held))throw waterError('WATER_INPUT','The brush angle is not valid.');this.held=held;this.water.erase=!!erase;}
 reset(){if(this.contact)this.contact.finish();this.contact=null;this.action=null;this.last=null;this.time=0;this.absoluteInputTime=false;this.timeCarry=0;this.loadFuel=1;}
 newStroke(){this.reset();}
 rebase(dx,dy){if(![dx,dy].every(Number.isFinite))throw waterError('WATER_INPUT','The brush offset is not valid.');}
 _contactFor(surface,inputKind='script'){
  for(const key of ['flow','bleed','edge','granulation','dry'])if(this.water[key]!=null)surface.gpu.params[key]=this.water[key];
  const brush=this.water.tip?{id:this.water.brush,tip:this.water.tip,params:CUSTOM_PARAMS}:getBrush(this.water.brush);
  return new WaterContact(surface.gpu,{brush,tool:this.water.erase?'erase':this.water.tool,coefficients:Float32Array.from(coefficients(this.water.pigment),v=>v*this.water.light),
   params:{size:this.water.size/100,water:this.water.water,load:this.water.load,flow:surface.gpu.params.flow,firm:this.water.firm},radiusScale:1100*surface.pixelScale/surface.height*this.radius/waterRadius(this.water.size),
   angle:this.held,follow:this.held===null,script:inputKind==='script',inputKind,random:this.random,lastDirection:this.lastDirection});
 }
 async strokeTo(surface,x,y,p,xtilt=0,ytilt=0,dtime=.001,_viewZoom=1,_viewRotation=0,_barrel=0,inputKind='script',inputTime=null){
  await surface.ready;if(![x,y,p,xtilt,ytilt,dtime].every(Number.isFinite)||p<0||p>1||dtime<0||!['script','pen','mouse','touch'].includes(inputKind)||inputTime!=null&&(!Number.isFinite(inputTime)||inputTime<0))throw waterError('WATER_INPUT','The Water sample is not valid.');
  if(p===0&&inputKind!=='script'){if(surface._brush===this)await surface._finishContact();return true;}
  if(surface._brush&&surface._brush!==this)await surface._finishContact();
  const ax=x*surface.scale+surface.origin[0],ay=y*surface.scale+surface.origin[1];if(Math.abs(ax/surface.pixelScale)>1e6||Math.abs(ay/surface.pixelScale)>1e6||this.action?.paths[0].length>=WATER_ACTION_MAX_POINTS)throw waterError('WATER_LIMIT','The Water gesture exceeds its complete-source limit.');
  if(!this.contact){
   surface._recordTip(this.water);surface.gpu.setPaper(this.water.paper);this.random=randomStream(this.seedValue);this.contact=this._contactFor(surface,inputKind);surface._brush=this;
   this.action=surface._appendAction({kind:'stroke',seed:this.seedValue,tool:this.water.tool,brush:this.water.brush,pigment:clone(this.water.pigment),controls:{size:this.water.size,water:this.water.water,load:this.water.load,firm:this.water.firm,light:this.water.light,angle:this.held??this.water.angle,follow:this.held===null,radius:this.radius,erase:this.water.erase,...Object.fromEntries(['flow','bleed','edge','granulation','dry'].filter(key=>this.water[key]!=null).map(key=>[key,this.water[key]]))},paper:this.water.paper,source:'hand',inputKind,direction:this.lastDirection.slice(),frame:surface._contactFrame(),paths:[[]],frames:[]});
  }
  if(inputTime!=null){this.absoluteInputTime=true;this.time=inputTime;}else this.time+=dtime*1000;
  const pressure=inputKind==='pen'?p**.8:p,point=[ax/surface.pixelScale,ay/surface.pixelScale,pressure,surface.tick,clip(xtilt,-1,1),clip(ytilt,-1,1),this.time],path=this.action.paths[0];
  const extra=sourceBytes(point)+(path.length?1:0);surface._sourceRoom(extra);path.push(point);surface._bytes+=extra;
  this.contact.sample(x*surface.scale/surface.width,1-y*surface.scale/surface.height,inputKind==='script'?clip(pressure,.02,1):pressure,this.time,point[4]*90,point[5]*90);surface._pendingDt+=dtime;this.last={x,y,p:pressure};return true;
 }
 snapshot(){return {seedValue:this.seedValue,randomState:this.random.get(),water:clone(this.water),radius:this.radius,held:this.held,lastDirection:this.lastDirection.slice(),last:clone(this.last),time:this.time,absoluteInputTime:this.absoluteInputTime,loadFuel:this.loadFuel,contact:this.contact?.snapshot()??null,action:clone(this.action)};}
 fromSnapshot(state){this.seedValue=state.seedValue;this.random=randomStream(state.seedValue);this.random.set(state.randomState);for(const key of ['water','radius','held','lastDirection','last','time','absoluteInputTime','loadFuel','action'])this[key]=clone(state[key]);if(this.contact&&state.contact){this.contact.restore(state.contact);this.contact.rng=this.random;}else this.contact=null;}
}

const previewTips=new Map();
// Brush choice shows the actual contact profile and tip without allocating or advancing wet material.
export function paintWaterBrushPreview(canvas,definition){
 const brush=new WaterBrush(definition),water=brush.water,profile=water.tip?{id:water.brush,tip:water.tip,params:CUSTOM_PARAMS}:getBrush(water.brush);
 let tip=water.tip;
 if(!tip){
  if(!previewTips.has(profile.id)){const made=makeTip(profile);previewTips.set(profile.id,{width:made.width,height:made.height,mask:Uint8Array.from({length:made.width*made.height},(_,i)=>made.rgba[i*4])});}
  tip=previewTips.get(profile.id);
 }
 const head=canvas.ownerDocument?canvas.ownerDocument.createElement('canvas'):new OffscreenCanvas(tip.width,tip.height);
 head.width=tip.width;head.height=tip.height;
 const color=waterPigmentRGB(coefficients(water.pigment)).map(v=>Math.round(v*255)),pixels=new Uint8ClampedArray(tip.width*tip.height*4);
 for(let i=0;i<tip.mask.length;i++){pixels.set(color,i*4);pixels[i*4+3]=tip.mask[i];}
 head.getContext('2d').putImageData(new ImageData(pixels,tip.width,tip.height),0,0);
 const ctx=canvas.getContext('2d'),width=canvas.width,height=canvas.height;
 ctx.clearRect(0,0,width,height);
 const base=coefficients(water.pigment),mass=Math.hypot(...base)||1;
 const contactSink={width,height,params:{flow:water.flow??.45},splatVelocity(){},stamp({x,y,r,angle=0,coefficients:ink}){
  if(!ink)return;
  ctx.save();ctx.translate(x*width,(1-y)*height);ctx.rotate(-angle);
  ctx.globalAlpha=1-Math.exp(-Math.hypot(...ink)/mass);
  const radius=r*height;ctx.drawImage(head,-radius,-radius*profile.params.aspect,radius*2,radius*2*profile.params.aspect);ctx.restore();
 }};
 brush.seed(7);brush.radius*=Math.exp(-1.1);
 const contact=brush._contactFor({gpu:contactSink,width,height,pixelScale:1});
 for(let i=0;i<=32;i++){const t=i/32;contact.sample((12+72*t)/96,1-(30+10*Math.sin(t*Math.PI*2))/60,.12+.7*Math.sin(t*Math.PI),i*12);}
 contact.finish();contact.frame(1/60);
}

export async function replayWater({frame,pixels=null,state=null,actions=[]}){
 const admitted=admitWaterActions(actions);if(!admitted)throw waterError('WATER_INPUT','The Water source cannot be replayed.');
 const surface=new WaterSurface(frame.width,frame.height,{pixelScale:frame.scale??3,origin:frame.origin??[0,0],seed:frame.seed??1,paper:frame.paper??'cold-press',paperScale:frame.paperScale,paperOrigin:frame.paperOrigin,paperSeed:frame.paperSeed,...(frame.maxBytes?{maxBytes:frame.maxBytes}:{})});
 try{await surface.ready;if(state)await surface.fromSnapshot(state);else if(pixels)await surface.fromRGBA8(pixels.data,pixels.width,pixels.height);for(const action of admitted)await surface.applyWater(action,{replayFrames:true});return surface;}catch(error){surface.dispose();throw error;}
}
