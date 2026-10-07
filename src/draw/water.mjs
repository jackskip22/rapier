// SPDX-License-Identifier: AGPL-3.0-only
// Water owns pigment and contact in paper coordinates. Scheduling changes neither a tick nor a dab.
import {toothAt} from './paper.mjs';
const encoder=new TextEncoder(),sourceBytes=value=>encoder.encode(JSON.stringify(value)).byteLength;
import {WATER_TICK_HZ,WATER_BANDS,WATER_ACTION_MAX_POINTS,WATER_TIP_MAX_PIXELS,WATER_SOURCE_MAX_BYTES,WATER_PAPERS,WATER_PIGMENTS,WATER_BRUSHES,WATER_TOOLS,WATER_CONTROLS,waterBrushById,waterPigmentById,waterPaperById,waterError,waterRadius,admitWaterPigment,admitWaterTip,admitWaterControls,admitWaterBrush,waterBrushDefinition,admitWaterAction,admitWaterActions,admitWaterState} from './water-data.mjs';
export {WATER_TICK_HZ,WATER_BANDS,WATER_ACTION_MAX_POINTS,WATER_TIP_MAX_PIXELS,WATER_SOURCE_MAX_BYTES,WATER_PAPERS,WATER_PIGMENTS,WATER_BRUSHES,WATER_TOOLS,WATER_CONTROLS,waterBrushById,waterPigmentById,waterPaperById,waterError,waterRadius,admitWaterPigment,admitWaterTip,admitWaterControls,admitWaterBrush,waterBrushDefinition,admitWaterAction,admitWaterActions,admitWaterState};
const N=32,NN=N*N,D=64,DD=D*D,Q=1048576,MAX=Number.MAX_SAFE_INTEGER/64;
const clip=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const key=(x,y)=>x+','+y;
const hash=(seed,x,y=0)=>{let v=(seed+Math.imul(x|0,1597334677)+Math.imul(y|0,3812015801))|0;v=Math.imul(v^(v>>>16),2246822519);v=Math.imul(v^(v>>>13),3266489917);return ((v^(v>>>16))>>>0)/4294967296;};
const encode=v=>v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055;
const decode=v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);
const clone=value=>structuredClone(value);
// Broad overlapping receptor lobes integrate an original piecewise-linear absorbance spectrum.
const OPTICS=(()=>{
 const rows=[],sums=[0,0,0];
 for(let j=0;j<25;j++){
  const nm=410+j*10,t=clip((nm-410)/46,0,5),i=Math.min(4,Math.floor(t)),f=t-i;
  const weights=[Math.exp(-(((nm-612)/48)**2)),Math.exp(-(((nm-544)/37)**2)),Math.exp(-(((nm-454)/32)**2))];
  weights.forEach((w,c)=>sums[c]+=w);rows.push({i,f,weights});
 }
 return rows.map(r=>({...r,weights:r.weights.map((w,c)=>w/sums[c])}));
})();
export function waterPigmentRGB(coefficients){
 const out=[0,0,0];
 for(const row of OPTICS){const a=coefficients[row.i]*(1-row.f)+coefficients[row.i+1]*row.f,t=Math.exp(-Math.max(0,a));for(let c=0;c<3;c++)out[c]+=t*row.weights[c];}
 return out.map(v=>clip(encode(v)));
}
export function waterPigmentFromRGB(r,g,b){
 const a=[r,g,b].map(v=>-Math.log(Math.max(1/65536,decode(clip(v)))));
 return {coefficients:[a[2],a[2]*.84+a[1]*.16,a[1]*.88+a[2]*.12,a[1]*.87+a[0]*.13,a[0]*.84+a[1]*.16,a[0]],granulation:.35,staining:.6,source:'raster'};
}
function newTile(x,y){return {x,y,w:new Float64Array(NN),d:new Float64Array(NN),m:new Float64Array(NN*6),f:new Float64Array(NN*6),g:new Float32Array(NN),s:new Float32Array(NN),h:new Float32Array(NN)};}
const tileBytes=NN*(8*14+4*3);
function copyTile(t){return {x:t.x,y:t.y,w:t.w.slice(),d:t.d.slice(),m:t.m.slice(),f:t.f.slice(),g:t.g.slice(),s:t.s.slice(),h:t.h.slice()};}
const sum6=(a,i)=>a[i]+a[i+1]+a[i+2]+a[i+3]+a[i+4]+a[i+5];
const mixProperties=(t,i,pigment,added,prior)=>{if(!added)return;const f=added/(prior+added);t.g[i]+=(pigment.granulation-t.g[i])*f;t.s[i]+=(pigment.staining-t.s[i])*f;};
function dimensions(width,height){if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>12000000)throw waterError('WATER_BUDGET','The layer is too large for Water; use a new layer');}
const sorted=map=>[...map.values()].sort((a,b)=>a.y-b.y||a.x-b.x);
const validTick=t=>Number.isSafeInteger(t)&&t>=0;
export class WaterSurface{
 constructor(width,height,options={}){
  dimensions(width,height);this.width=width;this.height=height;this.scale=(options.pixelScale??3)/3;
  this.origin=(options.origin??[0,0]).slice();this.seed=options.seed??1;this.paperId=options.paper??'cold-press';
  if(!waterPaperById(this.paperId)||!this.origin.every(Number.isSafeInteger)||!Number.isInteger(this.seed)||this.seed<0||this.seed>0xffffffff)throw waterError('WATER_INPUT','The Water sheet is not valid');
  this.cell=options.cell??6;if(!Number.isSafeInteger(this.cell)||this.cell<1||this.cell>64)throw waterError('WATER_INPUT','The water cell size is not valid');
  this.maxBytes=options.maxBytes??96*1024*1024;if(!Number.isSafeInteger(this.maxBytes)||this.maxBytes<0)throw waterError('WATER_BUDGET','The Water memory budget is not valid');
  this.tiles=new Map();this.details=new Map();this.base=new Map();this.tick=0;this.revision=0;this._dirty=null;this._bounds=null;this.growBox=undefined;
  this.toothOX=this.origin[0];this.toothOY=this.origin[1];this.paper=null;this.wetPending=0;this._wetWork=null;this._wet=false;this._visits=0;this._elapsed=0;this._transaction=null;this._actions=[];this._bytes=2;this._tips=new Map();this._actionStart=0;this._raster=false;this._active=new Set();this._record=true;this._toothTiles=new Map();this._toothKey=null;
  this._checkMemory(0);if(options.state)this.fromState(options.state);if(options.pixels)this.fromRGBA8(options.pixels.data,options.pixels.width,options.pixels.height);
 }
 get wetState(){return this._wet?{tick:this.tick}:null;}
 get wet(){return this._wet;}
 get pixelScale(){return this.scale*3;}
 _frame(){return {width:this.width,height:this.height,scale:this.pixelScale,origin:this.origin.slice(),seed:this.seed,paper:this.paperId,cell:this.cell};}
 _memory(){let bytes=this.width*this.height*4;const seen=new Set();for(const source of [this,this._transaction]){if(!source)continue;for(const t of source.tiles?.values()||[])if(!seen.has(t)){seen.add(t);bytes+=tileBytes;}for(const m of [source.details,source.base,source._toothTiles])for(const t of m?.values()||[])if(!seen.has(t)){seen.add(t);bytes+=t.data.byteLength;}}return bytes;}
 _checkMemory(extra){if(this._memory()+extra>this.maxBytes)throw waterError('WATER_BUDGET','Water cannot keep this whole gesture in memory; start a new layer');}
 _tile(cx,cy,write=false){
  const tx=Math.floor(cx/N),ty=Math.floor(cy/N),k=key(tx,ty);let t=this.tiles.get(k);
  if(!t&&write){this._checkMemory(tileBytes);t=newTile(tx,ty);this.tiles.set(k,t);}
  else if(t&&write&&this._transaction?.tiles.get(k)===t){this._checkMemory(tileBytes);t=copyTile(t);this.tiles.set(k,t);}
  return t?{t,i:(cy-ty*N)*N+cx-tx*N,k}:null;
 }
 _detail(x,y,write=false,base=false){
  const tx=Math.floor(x/D),ty=Math.floor(y/D),k=key(tx,ty),map=base?this.base:this.details;let t=map.get(k);
  if(!t&&write){this._checkMemory(DD*(base?4:4));t={x:tx,y:ty,data:base?new Uint8ClampedArray(DD*4):new Float32Array(DD)};map.set(k,t);}
  else if(t&&write&&(base?this._transaction?.base:this._transaction?.details)?.get(k)===t){this._checkMemory(t.data.byteLength);t={x:tx,y:ty,data:t.data.slice()};map.set(k,t);}
  return t?{t,i:(y-ty*D)*D+x-tx*D}:null;
 }
 _touch(x0,y0,x1,y1){
  const box={x0:Math.max(0,Math.floor(x0-this.origin[0])),y0:Math.max(0,Math.floor(y0-this.origin[1])),x1:Math.min(this.width-1,Math.ceil(x1-this.origin[0])),y1:Math.min(this.height-1,Math.ceil(y1-this.origin[1]))};
  if(box.x0>box.x1||box.y0>box.y1)return;
  for(const name of ['_dirty','_bounds']){const old=this[name];this[name]=old?{x0:Math.min(old.x0,box.x0),y0:Math.min(old.y0,box.y0),x1:Math.max(old.x1,box.x1),y1:Math.max(old.y1,box.y1)}:{...box};}
 }
 _wake(cx,cy){this._active.add(key(cx,cy));this._wet=true;}
 bounds(){return this._bounds?{...this._bounds}:null;}
 takeDirty(){const b=this._dirty;this._dirty=null;return b?{...b}:null;}
 beginStroke(){
  if(this._transaction)throw waterError('WATER_BUSY','A Water gesture is already open');
  const cp={tiles:new Map(this.tiles),details:new Map(this.details),base:new Map(this.base),width:this.width,height:this.height,origin:this.origin.slice(),toothOX:this.toothOX,toothOY:this.toothOY,scale:this.scale,paperId:this.paperId,tick:this.tick,revision:this.revision,dirty:this._dirty&&{...this._dirty},bounds:this._bounds&&{...this._bounds},active:new Set(this._active),wet:this._wet,elapsed:this._elapsed,actionLength:this._actions.length,actions:clone(this._actions),bytes:this._bytes,tips:new Map(this._tips),raster:this._raster};
  this._transaction=cp;return cp;
 }
 endStroke(cp,cancel=false){
  if(!cp||this._transaction!==cp)throw waterError('WATER_INPUT','The Water gesture checkpoint is no longer live');
  if(cancel){this.tiles=cp.tiles;this.details=cp.details;this.base=cp.base;for(const p of ['width','height','origin','toothOX','toothOY','scale','paperId','tick','revision'])this[p]=cp[p];this._dirty=cp.dirty;this._bounds=cp.bounds;this._active=cp.active;this._wet=cp.wet;this._elapsed=cp.elapsed;this._actions=cp.actions;this._bytes=cp.bytes;this._tips=cp.tips;this._raster=cp.raster;}
  this._transaction=null;return !cancel;
 }
 _atomic(fn){const own=!this._transaction,cp=own?this.beginStroke():this._transaction;try{const out=fn();if(own)this.endStroke(cp);return out;}catch(error){if(this._transaction===cp)this.endStroke(cp,true);throw error;}}
 // The recorded source's UTF-8 size is kept as a running count (exactly the serialised list's length), never measured again whole.
 _appendAction(action){if(!this._record)return;const last=this._actions.at(-1);if(action.kind==='advance'&&last?.kind==='advance'){if(!Number.isSafeInteger(last.ticks+action.ticks))throw waterError('WATER_INPUT','The water time is not representable');const was=sourceBytes(last);last.ticks+=action.ticks;this._bytes+=sourceBytes(last)-was;return;}const add=sourceBytes(action)+(this._actions.length?1:0);if(this._bytes+add>WATER_SOURCE_MAX_BYTES)throw waterError('WATER_REPLAY_BUDGET','The Water source is full; start a new layer to keep Undo');this._actions.push(clone(action));this._bytes+=add;}
 get sourceBytes(){return this._bytes;}
 // A tip is stored once per layer under its own name (the digest of its mask); strokes and fills name it and the engine reads it from here.
 _declareTip(brush){const known=this._tips.get(brush.brush);if(known){if(JSON.stringify(known)!==JSON.stringify(brush.tip))throw waterError('WATER_INPUT','This brush name already holds another tip');return false;}this._tips.set(brush.brush,clone(brush.tip));return true;}
 _needTip(id){if(id.startsWith('water/own-')&&!this._tips.has(id))throw waterError('WATER_INPUT','This layer does not hold that brush tip');}
 _recordTip(water){if(!water.tip||this._tips.has(water.brush))return;const action=admitWaterAction({kind:'tip',brush:{brush:water.brush,tip:water.tip}});if(!action)throw waterError('WATER_INPUT','The brush tip is not valid');this._appendAction(action);this._declareTip(action.brush);}
 waterReplay(){return {from:this._actionStart,to:this._actionStart+this._actions.length,frame:this._frame(),actions:clone(this._actions)};}
 takeWaterReplay(to=this._actionStart+this._actions.length){if(!validTick(to)||to<this._actionStart||to>this._actionStart+this._actions.length)throw waterError('WATER_INPUT','The Water source cursor is not valid');const n=to-this._actionStart;const actions=this._actions.splice(0,n);this._actionStart=to;this._bytes=sourceBytes(this._actions);return actions;}
 tilt(gx,gy){if(!Number.isFinite(gx)||!Number.isFinite(gy))throw waterError('WATER_INPUT','The paper tilt is not valid');this.gravity=[gx,gy];}
 fromRGBA8(data,width,height,x=0,y=0){
  dimensions(width,height);if(!ArrayBuffer.isView(data)||data.length!==width*height*4||![x,y].every(Number.isSafeInteger)||x<0||y<0||x+width>this.width||y+height>this.height)throw waterError('WATER_INPUT','The source picture does not fit the Water layer');
  return this._atomic(()=>{for(let py=0;py<height;py++)for(let px=0;px<width;px++){const at=(py*width+px)*4;const ax=x+px+this.origin[0],ay=y+py+this.origin[1];if(!data[at]&&!data[at+1]&&!data[at+2]&&!data[at+3]&&!this._detail(ax,ay,false,true))continue;const d=this._detail(ax,ay,true,true);d.t.data.set(data.subarray(at,at+4),d.i*4);this._touch(ax,ay,ax,ay);}this._raster=true;this.revision++;return true;});
 }
 grow(left=0,top=0,right=0,bottom=0){
  if(![left,top,right,bottom].every(n=>Number.isSafeInteger(n)&&n>=0))throw waterError('WATER_INPUT','The Water growth is not valid');
  const w=this.width+left+right,h=this.height+top+bottom;dimensions(w,h);this._checkMemory((w*h-this.width*this.height)*4);
  this.width=w;this.height=h;this.origin[0]-=left;this.origin[1]-=top;this.toothOX=this.origin[0];this.toothOY=this.origin[1];
  if(this._bounds)this._bounds={x0:this._bounds.x0+left,y0:this._bounds.y0+top,x1:this._bounds.x1+left,y1:this._bounds.y1+top};
  this._dirty={x0:0,y0:0,x1:w-1,y1:h-1};this.growBox={left,top,right,bottom};this.revision++;return {dx:left,dy:top};
 }
 _paperAt(x,y){
  const signature=this.paperId+':'+this.seed+':'+this.pixelScale;
  if(signature!==this._toothKey){this._toothTiles.clear();this._toothKey=signature;}
  const ix=Math.floor(x),iy=Math.floor(y),tx=Math.floor(ix/D),ty=Math.floor(iy/D),k=key(tx,ty);let tile=this._toothTiles.get(k);
  if(!tile){this._checkMemory(DD*4);tile={data:new Float32Array(DD)};tile.data.fill(NaN);this._toothTiles.set(k,tile);}
  const i=(iy-ty*D)*D+ix-tx*D;if(Number.isNaN(tile.data[i])){const p=waterPaperById(this.paperId);tile.data[i]=toothAt(this.seed,ix/this.pixelScale,iy/this.pixelScale,1,p.grain);}
  return tile.data[i];
 }
 _deposit(x,y,coverage,water,pigment,erase=false,lift=false,contact=coverage){
  if(coverage<=0||x<this.origin[0]||y<this.origin[1]||x>=this.origin[0]+this.width||y>=this.origin[1]+this.height)return;
  const cx=Math.floor(x/this.cell),cy=Math.floor(y/this.cell),at=this._tile(cx,cy,true),{t,i}=at,k=i*6;
  if(erase||lift){
   const amount=clip(coverage*(erase?.58:.24));for(let c=0;c<6;c++){t.m[k+c]-=Math.floor(t.m[k+c]*amount/this.cell**2);if(erase)t.f[k+c]-=Math.floor(t.f[k+c]*amount/this.cell**2);}
   t.w[i]=Math.max(0,t.w[i]-Math.ceil(t.w[i]*amount/this.cell**2));
   if(erase){const base=this._detail(x,y,true,true),bi=base.i*4;base.t.data[bi+3]=Math.round(base.t.data[bi+3]*(1-amount));}
  }else{
   if(water>0){t.w[i]=Math.min(Q*4,t.w[i]+Math.round(water*coverage*Q/this.cell**2));t.d[i]=Math.max(t.d[i],Math.floor(t.w[i]*.2));this._wake(cx,cy);}
   if(pigment){
    const prior=sum6(t.m,k)+sum6(t.f,k);for(let c=0;c<6;c++){const n=Math.round(pigment.coefficients[c]*coverage*Q/this.cell**2);if(t.m[k+c]+t.f[k+c]+n>MAX)throw waterError('WATER_BUDGET','This pigment concentration cannot be retained');if(water<.08)t.f[k+c]+=n;else t.m[k+c]+=n;}
    mixProperties(t,i,pigment,sum6(t.m,k)+sum6(t.f,k)-prior,prior);
   }
  }
  const d=this._detail(x,y,true);d.t.data[d.i]=Math.max(d.t.data[d.i],Math.min(1,contact));this._touch(x,y,x,y);
 }
 _liftRaster(x,y,amount){
  const found=this._detail(x,y,false,true);if(!found||!found.t.data[found.i*4+3])return;
  const d=this._detail(x,y,true,true),j=d.i*4,alpha=d.t.data[j+3]/255,fraction=clip(amount*.22),moved=alpha*fraction;
  if(!moved)return;
  const p=waterPigmentFromRGB(1-moved+moved*d.t.data[j]/255,1-moved+moved*d.t.data[j+1]/255,1-moved+moved*d.t.data[j+2]/255);
  const at=this._tile(Math.floor(x/this.cell),Math.floor(y/this.cell),true),k=at.i*6,prior=sum6(at.t.m,k)+sum6(at.t.f,k);for(let c=0;c<6;c++)at.t.m[k+c]+=Math.round(p.coefficients[c]*Q/this.cell**2);mixProperties(at.t,at.i,p,sum6(at.t.m,k)+sum6(at.t.f,k)-prior,prior);
  d.t.data[j+3]=Math.round(alpha*(1-fraction)*255);
 }
 _stamp(brush,x,y,pressure,angle,index,travel=0,dwell=1){
  const def=brush.water,preset=waterBrushById(def.brush)||WATER_BRUSHES[0],p=clip(pressure)*(def.firm?1:.72);if(!p||!dwell)return;
  const scale=this.pixelScale,baseRadius=brush.radius*scale,pressureRadius=def.brush==='water/sumi'?.12+.88*p**1.25:.28+.72*Math.sqrt(p);
  const radius=Math.max(.45,baseRadius*pressureRadius),aspect=def.tip?def.tip.height/def.tip.width:preset.aspect,radY=Math.max(.5,radius*aspect);
  const c=Math.cos(angle),s=Math.sin(angle),extent=def.brush==='water/spatter'?radius*1.9:radius*1.15;
  const x0=Math.max(this.origin[0],Math.floor(x-extent)),x1=Math.min(this.origin[0]+this.width-1,Math.ceil(x+extent)),y0=Math.max(this.origin[1],Math.floor(y-extent)),y1=Math.min(this.origin[1]+this.height-1,Math.ceil(y+extent));
  if(x1<x0||y1<y0)return;if((x1-x0+1)*(y1-y0+1)>12000000)throw waterError('WATER_BUDGET','The brush footprint is too large');
  const reservoir=.32+.68*Math.exp(-travel/(Math.max(1,brush.radius)*55*preset.capacity));
  const pigment=typeof def.pigment==='string'?waterPigmentById(def.pigment):def.pigment;
  const dose=.91*def.load*def.light*reservoir*preset.spacing*.9*dwell*(def.brush==='water/dry'?.55:1);
  const paper=waterPaperById(def.paper||this.paperId),dry=def.brush==='water/dry',lift=def.tool==='lift',erase=def.erase,water=def.water*(def.tool==='water'?1.2:1);
  const cell=this.cell,cx0=Math.floor(x0/cell),cy0=Math.floor(y0/cell),cols=Math.floor(x1/cell)-cx0+1,rows=Math.floor(y1/cell)-cy0+1,doses=new Float64Array(cols*rows),wetDoses=new Float64Array(cols*rows);
  const drops=[];if(def.brush==='water/spatter'||def.brush==='water/stipple'){const n=def.brush==='water/spatter'?9:29;for(let j=0;j<n;j++){const a=hash(brush.seedValue,index*41+j)*Math.PI*2,rr=Math.sqrt(hash(brush.seedValue^701,index*41+j)),span=def.brush==='water/spatter'?1.8:.87;drops.push([Math.cos(a)*rr*span,Math.sin(a)*rr*span,(def.brush==='water/spatter'?.045:.032)+hash(brush.seedValue^911,j,index)*.09]);}}
  // The native contact mask is independent of the transport lattice. A dab sums its dose before one conservative cell write.
  let touched=false;
  for(let py=y0;py<=y1;py++){
   const cellRow=(Math.floor(py/cell)-cy0)*cols;let detail=null,detailEnd=-Infinity,detailStart=0,detailRow=0;
   for(let px=x0;px<=x1;px++){
    const dx=px+.5-x,dy=py+.5-y,u=(dx*c+dy*s)/radius,v=(-dx*s+dy*c)/radY;let mask=0;
    if(def.tip){const ix=Math.floor((u*.5+.5)*def.tip.width),iy=Math.floor((v*.5+.5)*def.tip.height);if(ix>=0&&iy>=0&&ix<def.tip.width&&iy<def.tip.height)mask=def.tip.mask[iy*def.tip.width+ix]/255;}
    else if(def.brush==='water/flat'||def.brush==='water/hake'){mask=clip((1-Math.max(Math.abs(u),Math.abs(v)))*8);if(def.brush==='water/hake')mask*=.25+.75*clip((Math.sin(u*35+.3*Math.sin(v*4))+.55)*1.3);}
    else if(def.brush==='water/fan'){const ang=Math.atan2(u,v+.9);mask=Math.abs(ang)<1.02&&v>-.85&&v<.85?clip((Math.cos(ang*27)+.35)*3)*clip((1-Math.hypot(u,v))*6):0;}
    else if(def.brush==='water/dagger'){const width=Math.sqrt(Math.max(0,1-u*u))*(.75-.36*u);mask=clip((width-Math.abs(v))*9);}
    else if(drops.length){for(const drop of drops)mask=Math.max(mask,clip((drop[2]-Math.hypot(u-drop[0],v-drop[1]))*radius));}
    else{const r=Math.hypot(u,v),edge=r>.74&&r<1.2?(this._paperAt(px,py)-.5)*.15:0;mask=clip((1+edge-r)*5);if(def.brush==='water/mop')mask*=.67+.33*clip((1-r)*2);if(def.brush==='water/sponge')mask*=clip((hash(brush.seedValue,Math.floor(u*9),Math.floor(v*9))-.36)*3);if(def.brush==='water/sumi')mask*=.65+.35*clip((Math.sin(u*45+v*3)+.4)*2);}
    if(!mask)continue;
    if(dry){const raised=.22+.78*clip((this._paperAt(px,py)-(.48-.2*p))*4),bristles=clip((Math.sin(v*59+Math.sin(u*7)*1.4)+.46)*1.8),fibre=.35+.65*hash(this.seed,Math.floor(px/scale*2),Math.floor(py/scale*2));mask*=raised*bristles*fibre;}else if(def.water<.23)mask*=.35+.65*clip((this._paperAt(px,py)-.24)*5);
    if(!mask)continue;
    if(!detail||px>=detailEnd){const at=this._detail(px,py,true);detail=at.t.data;detailStart=at.t.x*D;detailEnd=detailStart+D;detailRow=(py-at.t.y*D)*D;}
    const di=detailRow+px-detailStart;if(erase){detail[di]=mask>.94?-1:Math.max(0,detail[di])*(1-mask);const old=this._detail(px,py,false,true);if(old){const out=this._detail(px,py,true,true),bi=out.i*4;out.t.data[bi+3]=Math.round(out.t.data[bi+3]*(1-mask));}}
    else detail[di]=Math.max(detail[di],mask);
    if(def.tool==='water')this._liftRaster(px,py,mask);
    const doseAt=cellRow+Math.floor(px/cell)-cx0;doses[doseAt]+=mask*(erase||lift?dwell:def.tool==='brush'?dose:1);wetDoses[doseAt]+=mask*(def.tool==='brush'?preset.spacing*.9*dwell*reservoir:1);touched=true;
   }
  }
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   const coverage=doses[row*cols+col]/(cell*cell),wetCoverage=wetDoses[row*cols+col]/(cell*cell);if(!coverage&&!wetCoverage)continue;const cx=cx0+col,cy=cy0+row,{t,i}=this._tile(cx,cy,true),k=i*6;
   if(erase||lift){const amount=clip(coverage*(erase?1:.24));for(let band=0;band<6;band++){t.m[k+band]-=Math.floor(t.m[k+band]*amount);if(erase)t.f[k+band]-=Math.floor(t.f[k+band]*amount);}t.w[i]=Math.max(0,t.w[i]-Math.ceil(t.w[i]*amount));if(erase&&amount>.94)t.h[i]=0;}
   else{
    const previousWater=t.w[i];if(water>0){t.w[i]=Math.min(Q*4,t.w[i]+Math.round(water*wetCoverage*Q));t.d[i]=Math.max(t.d[i],Math.floor(t.w[i]*.2));this._wake(cx,cy);}
    if(def.tool==='water'&&water>0){
     // Fresh water loosens an existing deposit; staining resists release. Every loosened quantum remains pigment.
     const release=.1*clip(water*wetCoverage)*(1-.96*clip(t.s[i]));
     for(let band=0;band<6;band++){const moved=Math.floor(t.f[k+band]*release);t.f[k+band]-=moved;t.m[k+band]+=moved;}
    }
    if(def.tool==='brush'){
     const prior=sum6(t.m,k)+sum6(t.f,k),crisp=dry||def.brush==='water/stipple'?.92:def.brush==='water/detail'||def.brush==='water/rigger'?.7:def.brush==='water/spatter'?.7:def.brush==='water/fan'?.38:.12+pigment.staining*.3;
     const fixed=water<.08?1:crisp*(1-.75*clip(previousWater/(Q*.3)));
     for(let band=0;band<6;band++){const n=Math.round(pigment.coefficients[band]*coverage*Q),bound=Math.floor(n*fixed);if(t.m[k+band]+t.f[k+band]+n>MAX)throw waterError('WATER_BUDGET','This pigment concentration cannot be retained');t.f[k+band]+=bound;t.m[k+band]+=n-bound;}mixProperties(t,i,pigment,sum6(t.m,k)+sum6(t.f,k)-prior,prior);
    }
   }
  }
  if(touched)this._touch(x0,y0,x1,y1);this.revision++;
 }
 _physicalStep(){
  if(!this._wet)return 0;
  const cells=[...this._active].map(name=>{const at=name.indexOf(',');return {x:Number(name.slice(0,at)),y:Number(name.slice(at+1))};}).sort((a,b)=>a.y-b.y||a.x-b.x);
  const entries=new Map(),tiles=new Map(),faces=[],next=[],paper=waterPaperById(this.paperId),cellSize=this.cell;
  const minX=this.origin[0],minY=this.origin[1],maxX=minX+this.width,maxY=minY+this.height;
  // A face keeps its original insertion order. Cell references share one writable tile, including rollback copies.
  const at=(x,y)=>{
   const name=key(x,y);let entry=entries.get(name);if(entry)return entry;
   const tx=Math.floor(x/N),ty=Math.floor(y/N),tileKey=key(tx,ty);let tile=tiles.get(tileKey);
   if(!tile){tile={t:this.tiles.get(tileKey),x:tx*N,y:ty*N,writable:false};tiles.set(tileKey,tile);}
   const i=(y-tile.y)*N+x-tile.x;entry={x,y,name,tile,i,k:i*6,faces:0,queued:false,height:NaN};entries.set(name,entry);return entry;
  };
  const writable=entry=>{const tile=entry.tile;if(!tile.writable){tile.t=this._tile(entry.x,entry.y,true).t;tile.writable=true;}return tile.t;};
  const height=entry=>Number.isNaN(entry.height)?(entry.height=this._paperAt((entry.x+.5)*cellSize,(entry.y+.5)*cellSize)):entry.height;
  const face=(entry,axis)=>{const bit=1<<axis;if(!(entry.faces&bit)){entry.faces|=bit;faces.push(entry,axis);}};
  for(const {x,y}of cells){const entry=at(x,y);face(entry,0);face(at(x-1,y),0);face(entry,1);face(at(x,y-1),1);}
  for(let j=0;j<faces.length;j+=2){
   const a=faces[j],axis=faces[j+1],x=a.x,y=a.y,nx=x+(axis===0?1:0),ny=y+(axis===1?1:0),b=at(nx,ny),ia=a.i,ib=b.i,ka=a.k,kb=b.k;
   const wa=a.tile.t?.w[ia]||0,wb=b.tile.t?.w[ib]||0;if(!wa&&!wb)continue;
   if(x*cellSize<minX-cellSize||y*cellSize<minY-cellSize||nx*cellSize>=maxX||ny*cellSize>=maxY)continue;
   const ta=writable(a),tb=writable(b),heightA=height(a),heightB=height(b);
   // The porous front moves water gradually; pigment exchange reads the previous water on both sides.
   const flux=Math.trunc((wa-wb)*.015*(.7+.6*(1-(heightA+heightB)/2)));
   if(flux>0){const n=Math.min(flux,Math.floor(ta.w[ia]*.16));ta.w[ia]-=n;tb.w[ib]+=n;}
   else if(flux<0){const n=Math.min(-flux,Math.floor(tb.w[ib]*.16));tb.w[ib]-=n;ta.w[ia]+=n;}
   const wetBoth=Math.min(wa,wb)/Q;
   if(wetBoth>.0003){
    const massA=sum6(ta.m,ka)+sum6(ta.f,ka),massB=sum6(tb.m,kb)+sum6(tb.f,kb),granA=ta.g[ia],granB=tb.g[ib],stainA=ta.s[ia],stainB=tb.s[ib];let sentA=0,sentB=0;
    const head=clip((wa-wb)/Math.max(Q*.08,Math.max(wa,wb)),-1,1),migration=Math.sign(head)*Math.min(.15,.015+Math.abs(head)*.115);
    for(let c=0;c<6;c++){
     const ma=ta.m[ka+c],mb=tb.m[kb+c];
     let transfer=Math.trunc((ma-mb)*Math.min(.038,wetBoth*.035)+(migration>0?ma:mb)*migration);
     transfer=Math.max(-Math.floor(mb*.2),Math.min(Math.floor(ma*.2),transfer));
     ta.m[ka+c]-=transfer;tb.m[kb+c]+=transfer;if(transfer>0)sentA+=transfer;else sentB-=transfer;if(transfer>0)tb.h[ib]=Math.min(1,tb.h[ib]+transfer/Math.max(1,mb+transfer));else if(transfer<0)ta.h[ia]=Math.min(1,ta.h[ia]-transfer/Math.max(1,ma-transfer));
     // A drying edge fixes incoming mobile density instead of letting a rim diffuse away.
     if(transfer>0&&wb<wa*.55){const n=Math.floor(transfer*(.12+.35*ta.g[ia]));tb.m[kb+c]-=n;tb.f[kb+c]+=n;}
     if(transfer<0&&wa<wb*.55){const n=Math.floor(-transfer*(.12+.35*tb.g[ib]));ta.m[ka+c]-=n;ta.f[ka+c]+=n;}
    }
    if(sentB)mixProperties(ta,ia,{granulation:granB,staining:stainB},sentB,Math.max(0,massA-sentA));if(sentA)mixProperties(tb,ib,{granulation:granA,staining:stainA},sentA,Math.max(0,massB-sentB));
   }
   if(ta.w[ia]>0&&!a.queued){a.queued=true;next.push(a);}if(tb.w[ib]>0&&!b.queued){b.queued=true;next.push(b);}
  }
  const active=new Set();let visits=0,x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const entry of next){
   const {x,y,i,k}=entry,t=writable(entry),w=t.w[i],paperHeight=height(entry);visits++;
   const loss=Math.max(768,Math.ceil(w*(.018+.016*paper.absorbency))),absorbed=Math.floor(loss*.28);t.w[i]=Math.max(0,w-loss);t.d[i]=Math.max(0,Math.min(Q,t.d[i]+absorbed)-Math.ceil(460+paper.absorbency*400));
   const dryness=1-clip(t.w[i]/(Q*.32));const fraction=t.w[i]===0?1:Math.min(.4,.004+dryness*.015+(1-paperHeight)*paper.tooth*t.g[i]*.016);
   for(let c=0;c<6;c++){const settle=t.w[i]===0?t.m[k+c]:Math.floor(t.m[k+c]*fraction);t.m[k+c]-=settle;t.f[k+c]+=settle;}
   if(t.w[i]>0)active.add(entry.name);
   x0=Math.min(x0,x*cellSize-1);y0=Math.min(y0,y*cellSize-1);x1=Math.max(x1,(x+1)*cellSize+1);y1=Math.max(y1,(y+1)*cellSize+1);
  }
  if(visits)this._touch(x0,y0,x1,y1);
  this._active=active;this._wet=active.size>0;this._visits+=visits;this.revision++;return visits;
 }
 step(ticks=1){
  if(!validTick(ticks)||!Number.isSafeInteger(this.tick+ticks))throw waterError('WATER_INPUT','The water time is not representable');
  const end=this.tick+ticks;let visits=0;while(this.tick<end&&this._wet){visits+=this._physicalStep();this.tick++;}this.tick=end;return {ticks,visits,wet:this._wet};
 }
 stepWet(ms=1000/WATER_TICK_HZ){if(!Number.isFinite(ms)||ms<0)throw waterError('WATER_INPUT','The drying feed is not valid');this._elapsed+=ms*WATER_TICK_HZ/1000;const ticks=Math.floor(this._elapsed);this._elapsed-=ticks;if(ticks){this.step(ticks);this._appendAction({kind:'advance',ticks});}return !this._wet;}
 advanceWet(ms){return this.stepWet(ms);}
 composeWet(){return !!this._dirty;}
 dryWet(_deadline,feed=8){this.stepWet(feed);return !this._wet;}
 settleWet(){const first=this.tick;while(this._wet)this.step(1);if(this.tick>first)this._appendAction({kind:'advance',ticks:this.tick-first});this.wetPending=0;return true;}
 _finishWetWork(){return true;}
 *settle(){while(this._wet){this.step(1);yield {tick:this.tick,wet:this._wet};}return this;}
 _dry(){while(this._wet)this.step(1);return true;}
 apply(action){return this.applyWater(action);}
 applyWater(raw){const run=this.applyWaterSteps(raw);let step=run.next();while(!step.done)step=run.next();return step.value;}
 *applyWaterSteps(raw){
  const action=admitWaterAction(raw);if(!action)throw waterError('WATER_INPUT','The Water action is not valid');
  const own=!this._transaction,cp=own?this.beginStroke():this._transaction;let complete=false,record=true;
  try{
   if(action.kind==='advance')this.step(action.ticks);
   else if(action.kind==='dry')this._dry();
   else if(action.kind==='paper'){this.paperId=action.paper;this._dirty={x0:0,y0:0,x1:this.width-1,y1:this.height-1};this.revision++;}
   else if(action.kind==='tip')record=this._declareTip(action.brush);
   else if(action.kind==='fill'){this._needTip(action.brush);yield* this._fillSteps(action);}
   else{this._needTip(action.brush);yield* this._strokeSteps(action);}
   if(record)this._appendAction(action);if(own)this.endStroke(cp);complete=true;return {changed:!!this._dirty,tick:this.tick,wet:this._wet,bounds:this.bounds()};
  }finally{if(!complete&&this._transaction===cp)this.endStroke(cp,true);}
 }
 *_strokeSteps(action){
  const tip=this._tips.get(action.brush),data={brush:action.brush,tool:action.tool,pigment:action.pigment,paper:action.paper||this.paperId,...action.controls,...(tip?{tip}:{})};
  const brush=new WaterBrush({water:data,settings:[]});brush.seed(action.seed);this.paperId=data.paper;let processed=0;
  for(const path of action.paths){brush.reset();let previous=path[0][3];for(const p of path){if(p[3]>this.tick)this.step(p[3]-this.tick);brush._point(this,p[0]*this.pixelScale,p[1]*this.pixelScale,p[2],p[4]||0,p[5]||0,(p[3]-previous)/WATER_TICK_HZ,false);previous=p[3];if(++processed%64===0)yield {kind:'stroke',points:processed,tick:this.tick};} }
 }
 *_fillSteps(action){
  const image=this.toRGBA8(),w=image.width,h=image.height,x=Math.floor(action.at[0]*this.pixelScale-this.origin[0]),y=Math.floor(action.at[1]*this.pixelScale-this.origin[1]);
  if(x<0||y<0||x>=w||y>=h)throw waterError('WATER_INPUT','The fill starts outside the layer');
  this._checkMemory(w*h*5);const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),source=(y*w+x)*4,colour=image.data.slice(source,source+4),limit=action.tolerance*255;
  let head=0,tail=1,front=1,distance=0;queue[0]=y*w+x;seen[queue[0]]=1;
  const pigment=typeof action.pigment==='string'?waterPigmentById(action.pigment):action.pigment,cell=this.cell,pace=cell*2;
  // Each spatial wave deposits fresh water. Earlier waves diffuse and settle while the wet front advances.
  while(head<tail){
   const doses=new Map();let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
   while(head<front){const i=queue[head++],px=i%w,py=Math.floor(i/w),j=i*4;let difference=0;for(let c=0;c<4;c++)difference=Math.max(difference,Math.abs(image.data[j+c]-colour[c]));if(difference>limit)continue;
    const ax=px+this.origin[0],ay=py+this.origin[1],cx=Math.floor(ax/cell),cy=Math.floor(ay/cell),name=key(cx,cy),density=.56*action.controls.load*action.controls.light;
    let dose=doses.get(name);if(!dose){dose={cx,cy,mass:0,area:0};doses.set(name,dose);}dose.mass+=density;dose.area++;
    const contact=this._detail(ax,ay,true);contact.t.data[contact.i]=1;x0=Math.min(x0,ax);y0=Math.min(y0,ay);x1=Math.max(x1,ax);y1=Math.max(y1,ay);
    for(const n of [px>0?i-1:-1,px<w-1?i+1:-1,py>0?i-w:-1,py<h-1?i+w:-1])if(n>=0&&!seen[n]){seen[n]=1;queue[tail++]=n;}
   }
   for(const dose of doses.values()){const {t,i}=this._tile(dose.cx,dose.cy,true),k=i*6,prior=sum6(t.m,k)+sum6(t.f,k),coverage=dose.mass/(cell*cell);t.w[i]=Math.min(Q*4,t.w[i]+Math.round(action.controls.water*dose.area/(cell*cell)*Q));t.d[i]=Math.max(t.d[i],Math.floor(t.w[i]*.2));for(let band=0;band<6;band++){const n=Math.round(pigment.coefficients[band]*coverage*Q),fixed=action.controls.water<.08?n:Math.floor(n*.08);if(t.m[k+band]+t.f[k+band]+n>MAX)throw waterError('WATER_BUDGET','This pigment concentration cannot be retained');t.f[k+band]+=fixed;t.m[k+band]+=n-fixed;}mixProperties(t,i,pigment,sum6(t.m,k)+sum6(t.f,k)-prior,prior);if(t.w[i])this._wake(dose.cx,dose.cy);}
   if(x0!==Infinity)this._touch(x0,y0,x1,y1);front=tail;distance++;
   if(distance%pace===0){this.step(1);yield {kind:'fill',distance,tick:this.tick,visited:head};}
  }
  this.revision++;yield {kind:'fill',distance,tick:this.tick,visited:head};
 }
 _coeffAt(x,y,out){
  const cx=Math.floor(x/this.cell),cy=Math.floor(y/this.cell),a=this._tile(cx,cy);out.fill(0);if(!a)return out;const k=a.i*6;
  for(let c=0;c<6;c++)out[c]=(a.t.m[k+c]+a.t.f[k+c])/Q;
  return out;
 }
 samplePigment(x,y){
  const ax=x*this.pixelScale,ay=y*this.pixelScale,cx=Math.floor(ax/this.cell),cy=Math.floor(ay/this.cell),a=this._tile(cx,cy);if(!a)return null;
  const k=a.i*6,m=Array.from(a.t.m.subarray(k,k+6),v=>v/Q),f=Array.from(a.t.f.subarray(k,k+6),v=>v/Q),coefficients=m.map((v,c)=>v+f[c]),mass=coefficients.reduce((a,b)=>a+b,0);
  if(!mass&&!a.t.w[a.i])return null;
  return {coefficients,mobileCoefficients:m,fixedCoefficients:f,mass,mobile:m.reduce((a,b)=>a+b,0),fixed:f.reduce((a,b)=>a+b,0),water:a.t.w[a.i]/Q,tooth:this._paperAt(ax,ay),granulation:a.t.g[a.i],staining:a.t.s[a.i],source:this._raster?'raster':'pigment'};
 }
 toRGBA8(box=null,_straight=true,quality='final'){
  box=box||{x0:0,y0:0,x1:this.width-1,y1:this.height-1};const {x0,y0,x1,y1}=box;
  if(![x0,y0,x1,y1].every(Number.isSafeInteger)||x0<0||y0<0||x1<x0||y1<y0||x1>=this.width||y1>=this.height)throw waterError('WATER_INPUT','The Water read box is not valid');
  const width=x1-x0+1,height=y1-y0+1,data=new Uint8ClampedArray(width*height*4),cell=this.cell,paper=waterPaperById(this.paperId),left=x0+this.origin[0],topEdge=y0+this.origin[1];
  const gx0=Math.floor(left/cell-.5)-1,gy0=Math.floor(topEdge/cell-.5)-1,gw=Math.ceil(width/cell)+6,gh=Math.ceil(height/cell)+6;
  const field=new Float32Array(gw*gh*9),spectrum=new Array(6),renderTiles=new Set([...this.base.keys(),...this.details.keys()]),renderRows=new Set();
  for(let gy=0;gy<gh;gy++)for(let gx=0;gx<gw;gx++){
   const cx=gx+gx0,cy=gy+gy0,a=this._tile(cx,cy);if(!a)continue;const k=a.i*6,total=sum6(a.t.m,k)+sum6(a.t.f,k);if(!total)continue;
   let cover=0;for(let py=0;py<cell;py++){const ay=cy*cell+py,ty=Math.floor(ay/D);let tile=null,end=-Infinity,start=0,row=0;for(let px=0;px<cell;px++){const ax=cx*cell+px;if(ax>=end){const tx=Math.floor(ax/D);tile=this.details.get(key(tx,ty));start=tx*D;end=start+D;row=(ay-ty*D)*D;}if(tile)cover+=Math.max(0,tile.data[row+ax-start]);}}cover/=cell*cell;
   const halo=a.t.h[a.i],support=Math.max(cover,halo*.24),normal=.16+.84*support,f=(gy*gw+gx)*9;
   for(let c=0;c<6;c++)spectrum[c]=(a.t.m[k+c]+a.t.f[k+c])/Q*2.3/normal;
   for(let ty=Math.floor((cy-2)*cell/D);ty<=Math.floor((cy+3)*cell/D);ty++)for(let tx=Math.floor((cx-2)*cell/D);tx<=Math.floor((cx+3)*cell/D);tx++)renderTiles.add(key(tx,ty));
   const rgb=waterPigmentRGB(spectrum),alpha=1-Math.min(...rgb);
   for(let c=0;c<3;c++)field[f+c]=rgb[c]-1+alpha;field[f+3]=alpha;field[f+4]=support;field[f+5]=halo;field[f+6]=a.t.g[a.i];field[f+7]=this._paperAt((cx+.5)*cell,(cy+.5)*cell);field[f+8]=1;
  }
  // A compact cubic reconstruction joins the transport cells with continuous slope. Native contact and tooth still resolve every saved pixel.
  for(const name of renderTiles)renderRows.add(Number(name.slice(name.indexOf(',')+1)));
  const stride=quality==='live'?Math.max(1,Math.min(3,Math.round(this.pixelScale))):1,rowStep=gw*9,scale=this.pixelScale,vertical=new Float32Array(rowStep);
  for(let by=Math.floor(topEdge/D)*D;by<topEdge+height;by+=D){
   const ty=by/D;if(!renderRows.has(ty))continue;const firstY=Math.max(topEdge,by),lastY=Math.min(topEdge+height,by+D);
   for(let ay=firstY;ay<lastY;ay+=stride){
    const sy=(ay+.5)/cell-.5,cy=Math.floor(sy),fy=sy-cy,y2=fy*fy,y3=y2*fy,wy0=(1-fy)**3/6,wy1=(3*y3-6*y2+4)/6,wy2=(-3*y3+3*y2+3*fy+1)/6,wy3=y3/6,firstRow=(cy-gy0-1)*rowStep;
    for(let i=0;i<rowStep;i++)vertical[i]=field[firstRow+i]*wy0+field[firstRow+rowStep+i]*wy1+field[firstRow+rowStep*2+i]*wy2+field[firstRow+rowStep*3+i]*wy3;
    for(let bx=Math.floor(left/D)*D;bx<left+width;bx+=D){
     const tx=bx/D,tileKey=key(tx,ty);if(!renderTiles.has(tileKey))continue;const native=this.details.get(tileKey)?.data,base=this.base.get(tileKey)?.data;let tooth=this._toothTiles.get(tileKey)?.data;
     const firstX=Math.max(left,bx),lastX=Math.min(left+width,bx+D);
     for(let ax=firstX;ax<lastX;ax+=stride){
      const nativeAt=(ay-by)*D+ax-bx,contact=native?.[nativeAt]||0,sx=(ax+.5)/cell-.5,cx=Math.floor(sx),fx=sx-cx,x2=fx*fx,x3=x2*fx,at=(cx-gx0-1)*9,a1=at+9,a2=at+18,a3=at+27,w0=(1-fx)**3/6,w1=(3*x3-6*x2+4)/6,w2=(-3*x3+3*x2+3*fx+1)/6,w3=x3/6;
      let alpha=vertical[at+3]*w0+vertical[a1+3]*w1+vertical[a2+3]*w2+vertical[a3+3]*w3,r=0,g=0,b=0;
      if(alpha>0&&contact>=0){
       const present=vertical[at+8]*w0+vertical[a1+8]*w1+vertical[a2+8]*w2+vertical[a3+8]*w3;
       const support=vertical[at+4]*w0+vertical[a1+4]*w1+vertical[a2+4]*w2+vertical[a3+4]*w3,halo=vertical[at+5]*w0+vertical[a1+5]*w1+vertical[a2+5]*w2+vertical[a3+5]*w3,gran=(vertical[at+6]*w0+vertical[a1+6]*w1+vertical[a2+6]*w2+vertical[a3+6]*w3)/Math.max(.01,present),mean=(vertical[at+7]*w0+vertical[a1+7]*w1+vertical[a2+7]*w2+vertical[a3+7]*w3)/Math.max(.01,present);
       if(!tooth){this._paperAt(ax,ay);tooth=this._toothTiles.get(tileKey).data;}if(Number.isNaN(tooth[nativeAt]))tooth[nativeAt]=toothAt(this.seed,ax/scale,ay/scale,1,paper.grain);
       const coverage=clip(Math.max(contact,support*halo*.38)*(1+paper.tooth*(.22+.78*gran)*(mean-tooth[nativeAt])*1.6)),normal=contact>0?Math.max(.01,present):1,factor=coverage/normal;
       alpha*=factor;r=(vertical[at]*w0+vertical[a1]*w1+vertical[a2]*w2+vertical[a3]*w3)*factor;g=(vertical[at+1]*w0+vertical[a1+1]*w1+vertical[a2+1]*w2+vertical[a3+1]*w3)*factor;b=(vertical[at+2]*w0+vertical[a1+2]*w1+vertical[a2+2]*w2+vertical[a3+2]*w3)*factor;
      }else alpha=0;
      const bi=nativeAt*4,oldA=base?base[bi+3]/255:0,newA=alpha+oldA*(1-alpha);let red=base?base[bi]:0,green=base?base[bi+1]:0,blue=base?base[bi+2]:0,opacity=base?base[bi+3]:0;
      if(alpha&&newA){red=Math.round((r+red/255*oldA*(1-alpha))/newA*255);green=Math.round((g+green/255*oldA*(1-alpha))/newA*255);blue=Math.round((b+blue/255*oldA*(1-alpha))/newA*255);opacity=Math.round(newA*255);}
      for(let dy=0;dy<stride&&ay+dy<lastY;dy++)for(let dx=0;dx<stride&&ax+dx<lastX;dx++){const j=((ay+dy-topEdge)*width+ax+dx-left)*4;data[j]=red;data[j+1]=green;data[j+2]=blue;data[j+3]=opacity;}
     }
    }
   }
  }
  return {width,height,data};
 }
 render({quality='final',dirty=true}={}){const box=dirty?this.takeDirty():{x0:0,y0:0,x1:this.width-1,y1:this.height-1};return {patches:box?[{x:box.x0,y:box.y0,...this.toRGBA8(box,true,quality)}]:[],tick:this.tick,revision:this.revision,wet:this._wet};}
 snapshot(box=null){
  let frame=this._frame();if(box){const w=box.x1-box.x0+1,h=box.y1-box.y0+1;dimensions(w,h);frame={...frame,width:w,height:h,origin:[frame.origin[0]+box.x0,frame.origin[1]+box.y0]};}
  const tiles=[];for(const t of sorted(this.tiles)){const cells=[];for(let i=0;i<NN;i++){const k=i*6;if(!t.w[i]&&!t.d[i]&&!sum6(t.m,k)&&!sum6(t.f,k))continue;cells.push([i,t.w[i],t.d[i],...t.m.subarray(k,k+6),...t.f.subarray(k,k+6),t.g[i],t.s[i],t.h[i]]);}if(cells.length)tiles.push({x:t.x,y:t.y,cells});}
  return {kind:'water',frame,tick:this.tick,elapsed:this._elapsed,raster:this._raster,tips:[...this._tips].map(([id,tip])=>[id,clone(tip)]),tiles,details:sorted(this.details).map(t=>({x:t.x,y:t.y,values:Array.from(t.data)})),base:sorted(this.base).map(t=>({x:t.x,y:t.y,data:Array.from(t.data)}))};
 }
 fromState(raw,{offset=[0,0]}={}){
  const state=admitWaterState(raw);if(!state||!Array.isArray(offset)||offset.length!==2||!offset.every(Number.isSafeInteger))throw waterError('WATER_INPUT','The Water material state is not valid');
  const required=state.tiles.length*tileBytes+state.details.length*DD*4+state.base.length*DD*4+this.width*this.height*4;if(required>this.maxBytes)throw waterError('WATER_BUDGET','The Water material cannot fit this layer');
  const tiles=new Map(),details=new Map(),base=new Map(),active=new Set();
  for(const row of state.tiles){const t=newTile(row.x,row.y);for(const c of row.cells){const i=c[0],k=i*6;t.w[i]=c[1];t.d[i]=c[2];t.m.set(c.slice(3,9),k);t.f.set(c.slice(9,15),k);t.g[i]=c[15];t.s[i]=c[16];t.h[i]=c[17];if(c[1])active.add(key(row.x*N+i%N,row.y*N+Math.floor(i/N)));}tiles.set(key(t.x,t.y),t);}
  for(const row of state.details)details.set(key(row.x,row.y),{x:row.x,y:row.y,data:Float32Array.from(row.values)});
  for(const row of state.base)base.set(key(row.x,row.y),{x:row.x,y:row.y,data:Uint8ClampedArray.from(row.data)});
  this.tiles=tiles;this.details=details;this.base=base;this._active=active;this._wet=active.size>0;this.tick=state.tick;this.seed=state.frame.seed;this.cell=state.frame.cell;this.paperId=state.frame.paper;this.scale=state.frame.scale/3;this.origin=[state.frame.origin[0]-offset[0],state.frame.origin[1]-offset[1]];this.toothOX=this.origin[0];this.toothOY=this.origin[1];this._elapsed=state.elapsed||0;this._raster=!!state.raster;this._actions=[];this._bytes=2;this._tips=new Map(state.tips||[]);this._actionStart=0;this._bounds=null;
  for(const t of this.tiles.values())for(let i=0;i<NN;i++)if(sum6(t.m,i*6)+sum6(t.f,i*6)){const x=(t.x*N+i%N)*this.cell,y=(t.y*N+Math.floor(i/N))*this.cell;this._touch(x,y,x+this.cell-1,y+this.cell-1);}
  for(const t of this.base.values())for(let i=0;i<DD;i++)if(t.data[i*4+3])this._touch(t.x*D+i%D,t.y*D+Math.floor(i/D),t.x*D+i%D,t.y*D+Math.floor(i/D));
  this._dirty={x0:0,y0:0,x1:this.width-1,y1:this.height-1};this.revision++;return this;
 }
 fromWaterState(state,offset=[0,0]){return this.fromState(state,{offset});}
 stats(){const pigmentMass=new Array(6).fill(0);let mobile=0,fixed=0;for(const t of this.tiles.values())for(let i=0;i<NN*6;i++){pigmentMass[i%6]+=(t.m[i]+t.f[i])/Q;mobile+=t.m[i]/Q;fixed+=t.f[i]/Q;}return {bytes:this._memory(),tiles:this.tiles.size,detailTiles:this.details.size,wetCells:this._active.size,pigmentMass,mobile,fixed,tick:this.tick,solverVisits:this._visits,backend:'cpu'};}
 clear(){this.tiles.clear();this.details.clear();this.base.clear();this._active.clear();this._wet=false;this._bounds=null;this._dirty={x0:0,y0:0,x1:this.width-1,y1:this.height-1};this.revision++;}
 dispose(){this.clear();this._actions=[];this._bytes=2;this._tips=new Map();this._transaction=null;}
}
export class WaterBrush{
 constructor(definition){const water=admitWaterBrush(definition);if(!water)throw waterError('WATER_INPUT','The Water brush is not valid');this.water=water;this.radius=water.radius??waterRadius(water.size);this.seedValue=1;this.wet={water:water.water};this.loadFuel=1;this.held=water.follow?null:water.angle;this.reset();}
 seed(value){if(!Number.isInteger(value)||value<0||value>0xffffffff)throw waterError('WATER_INPUT','The brush seed is not valid');this.seedValue=value;}
 setColor(r,g,b){if(![r,g,b].every(Number.isFinite))throw waterError('WATER_INPUT','The brush colour is not valid');}
 setPigment(pigment){const p=admitWaterPigment(pigment);if(!p)throw waterError('WATER_INPUT','The selected pigment is not valid');this.water.pigment=p;}
 setBaseValue(name,value){if(!Number.isFinite(value))throw waterError('WATER_INPUT','The brush control is not valid');if(name==='radius_logarithmic')this.radius=Math.exp(value)/3;}
 getBaseValue(name){return name==='radius_logarithmic'?Math.log(this.radius*3):0;}
 setHead(held,erase=false){if(held!==null&&!Number.isFinite(held))throw waterError('WATER_INPUT','The brush angle is not valid');this.held=held;this.water.erase=!!erase;}
 reset(){this.last=null;this.carry=0;this.travel=0;this.dab=0;this.timeCarry=0;this.action=null;}
 newStroke(){this.reset();}
 rebase(dx,dy){if(!Number.isFinite(dx)||!Number.isFinite(dy))throw waterError('WATER_INPUT','The brush offset is not valid');}
 _point(surface,x,y,p,xtilt=0,ytilt=0,dtime=0,record=true){
  const preset=waterBrushById(this.water.brush)||WATER_BRUSHES[0],spacing=Math.max(.35,this.radius*surface.pixelScale*preset.spacing*Math.sqrt(preset.aspect));
  if(!this.last){const angle=(this.held??0)*Math.PI/180;surface._stamp(this,x,y,p,angle,this.dab++,this.travel);this.last={x,y,p};return;}
  const dx=x-this.last.x,dy=y-this.last.y,len=Math.hypot(dx,dy),angle=this.held==null?Math.atan2(dy,dx):this.held*Math.PI/180,previousAngle=this.last.angle??angle,turn=Math.atan2(Math.sin(angle-previousAngle),Math.cos(angle-previousAngle));
  if(len>0){let at=spacing-this.carry;while(at<=len){const t=at/len,pr=this.last.p+(p-this.last.p)*t;surface._stamp(this,this.last.x+dx*t,this.last.y+dy*t,pr,this.held==null?previousAngle+turn*t:angle,this.dab++,this.travel+at);at+=spacing;}this.carry=(this.carry+len)%spacing;this.travel+=len;}
  else if(dtime>0&&p>0)surface._stamp(this,x,y,p,angle,this.dab++,this.travel,Math.min(1,dtime*10));
  this.last={x,y,p,angle};this.loadFuel=.32+.68*Math.exp(-this.travel/(Math.max(1,this.radius)*surface.pixelScale*55*preset.capacity));
 }
 strokeTo(surface,x,y,p,xtilt=0,ytilt=0,dtime=.001){
  if(![x,y,p,xtilt,ytilt,dtime].every(Number.isFinite)||p<0||p>1||dtime<0)throw waterError('WATER_INPUT','The Water input sample is not valid');
  return surface._atomic(()=>{
   const ax=x*surface.scale+surface.origin[0],ay=y*surface.scale+surface.origin[1];if(Math.abs(ax/surface.pixelScale)>1e6||Math.abs(ay/surface.pixelScale)>1e6||this.action?.paths[0].length>=WATER_ACTION_MAX_POINTS)throw waterError('WATER_LIMIT','The Water gesture exceeds its complete-source limit');
   this.timeCarry+=dtime*WATER_TICK_HZ;const ticks=Math.floor(this.timeCarry);this.timeCarry-=ticks;if(ticks)surface.step(ticks);
   if(!this.action){surface._recordTip(this.water);this.action={kind:'stroke',seed:this.seedValue,tool:this.water.tool,brush:this.water.brush,pigment:clone(this.water.pigment),controls:{size:this.water.size,water:this.water.water,load:this.water.load,firm:this.water.firm,light:this.water.light,angle:this.held??this.water.angle,follow:this.held==null,radius:this.radius,erase:this.water.erase},paper:this.water.paper,paths:[[]]};surface._actions.push(this.action);surface._bytes+=sourceBytes(this.action)+(surface._actions.length>1?1:0);}
   const point=[ax/surface.pixelScale,ay/surface.pixelScale,p,surface.tick,xtilt,ytilt],path=this.action.paths[0];
   surface._bytes+=sourceBytes(point)+(path.length?1:0);path.push(point);
   if(surface._bytes>WATER_SOURCE_MAX_BYTES)throw waterError('WATER_REPLAY_BUDGET','The Water source is full; start a new layer');
   surface.paperId=this.water.paper;this._point(surface,ax,ay,p,xtilt,ytilt,ticks/WATER_TICK_HZ);return true;
  });
 }
}
export function replayWater({frame,pixels=null,state=null,actions=[]}){
 const surface=new WaterSurface(frame.width,frame.height,{pixelScale:frame.scale??3,origin:frame.origin??[0,0],seed:frame.seed??1,paper:frame.paper??'cold-press',cell:frame.cell??6,maxBytes:frame.maxBytes??96*1024*1024});
 if(state)surface.fromState(state);else if(pixels)surface.fromRGBA8(pixels.data,pixels.width,pixels.height);
 const admitted=admitWaterActions(actions);if(!admitted)throw waterError('WATER_INPUT','The Water source cannot be replayed');
 for(const action of admitted)surface.applyWater(action);return surface;
}
