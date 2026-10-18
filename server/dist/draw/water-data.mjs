// SPDX-License-Identifier: AGPL-3.0-only
export const WATER_TICK_HZ = 60;
export const WATER_BANDS = 8;
export const WATER_TIME_MAX_SECONDS = Number.MAX_SAFE_INTEGER / 256;
export const waterTimeFits = seconds => Number.isFinite(seconds) && seconds >= 0 && seconds <= WATER_TIME_MAX_SECONDS;
import {WATER_PIGMENT_DATA} from './water-pigments.mjs';
import {PAPER_KINDS,PRO_PAPER_KINDS,BRUSHES,CUSTOM_PARAMS} from './water-materials.mjs';
import {WATER_SPECIALTY_PIGMENTS,waterSpecialtyById,admitWaterFinish,waterPigmentFinish,isWaterSpecialtyPigment} from './water-specialty.mjs';
export {WATER_SPECIALTY_PIGMENTS,waterSpecialtyById,waterPigmentFinish,isWaterSpecialtyPigment};
import {WATER_PAPER_UNITS} from './paper-field.mjs';
export const WATER_ACTION_MAX_POINTS = 131072;
export const WATER_TIP_MAX_PIXELS = 1048576;
import {PAINT_REPLAY_MAX_BYTES,paintReplayFits} from './paint-limits.mjs';
export const WATER_SOURCE_MAX_BYTES = PAINT_REPLAY_MAX_BYTES;
const freeze = rows => Object.freeze(rows.map(row => Object.freeze(row)));
export const WATER_PAPERS = PAPER_KINDS;
export const WATER_PRO_PAPERS = PRO_PAPER_KINDS;
export const WATER_PIGMENTS = freeze(WATER_PIGMENT_DATA.map(row=>({...row,coefficients:row.coefficients.slice()})));
export const WATER_BRUSHES = freeze(BRUSHES.map(b=>({id:b.id,name:b.name,size:50,water:.6,load:.5,
 aspect:b.params.aspect,spacing:b.params.spacing,capacity:b.params.capacity,angle:b.params.angle,follow:b.params.rotation==='follow',params:b.params,description:b.name+' contact with spectral pigment and paper response.'})));
export const WATER_STRENGTHS = freeze([
 {id:'tea',name:'Tea',load:.15,water:.6},
 {id:'milk',name:'Milk',load:.3,water:.6},
 {id:'cream',name:'Cream',load:.5,water:.6},
 {id:'butter',name:'Butter',load:.75,water:.45}
]);
export function waterStrengthOf(load,water){return WATER_STRENGTHS.find(s=>Math.abs(s.load-load)<.005&&Math.abs(s.water-water)<.005)||null;}
export const WATER_TOOLS = freeze([
 {id:'brush',name:'Brush',description:'Lay the selected pigment with the current head.'},
 {id:'water',name:'Water',description:'Wet, soften and push pigment already on the paper.'},
 {id:'lift',name:'Lift',description:'Blot water and suspended pigment from a wash.'},
 {id:'pen',name:'Pen',description:'A thin loaded line with a little water beside it.'},
 {id:'dry',name:'Dry',description:'Settle the wash and fix its pigment.'},
 {id:'fill',name:'Fill',description:'Wet a connected region with a traveling wash.'},
 {id:'trace',name:'Trace',description:'Paint the captured paths of a drawing shape.'},
 {id:'text',name:'Text',description:'Write captured single-stroke letter paths with the brush.'}
]);
export const WATER_CONTROLS = Object.freeze({size:{min:0,max:100,default:50},water:{min:0,max:1,default:.6},load:{min:0,max:1,default:.5},flow:{min:0,max:1,default:.45},bleed:{min:0,max:1,default:.5},edge:{min:0,max:1,default:.5},granulation:{min:0,max:1,default:.45},dry:{min:0,max:1,default:.4},firm:{type:'boolean',default:true},light:{min:0,max:1,default:1},angle:{min:0,max:179,default:45},follow:{type:'boolean',default:false},paper:WATER_PAPERS.map(p=>p.id),pigment:WATER_PIGMENTS.map(p=>p.id)});
export const waterBrushById = id => WATER_BRUSHES.find(b=>b.id===id)||null;
export const waterPigmentById = id => WATER_PIGMENTS.find(p=>p.id===id)||waterSpecialtyById(id);
export const waterPaperById = id => WATER_PAPERS.find(p=>p.id===id)||WATER_PRO_PAPERS.find(p=>p.id===id)||null;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const unit=v=>finite(v)&&v>=0&&v<=1;
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const ownKeys=(v,allowed)=>Object.keys(v).every(k=>allowed.includes(k));
const frameGeometry=v=>object(v)&&integer(v.width)&&integer(v.height)&&v.width>0&&v.height>0&&v.width*v.height<=12000000&&Array.isArray(v.origin)&&v.origin.length===2&&v.origin.every(Number.isSafeInteger);
const jsonFits=paintReplayFits;
export function waterError(code,message){return Object.assign(new RangeError(message),{code,recoverable:true});}
export function waterRadius(size=50){return 1100*.04/WATER_PAPER_UNITS*Math.pow(3,2*(size/100-.5));}
export const WATER_HAND_SIZE_MAX=100;
export function waterHandSize(size){const n=Number(size);return Number.isFinite(n)?Math.min(WATER_HAND_SIZE_MAX,Math.max(0,n)):null;}
export function waterHandUi(size){const hand=waterHandSize(size);return hand==null?null:hand*100/WATER_HAND_SIZE_MAX;}
export function waterHandFromUi(ui){const n=Number(ui);return Number.isFinite(n)?waterHandSize(n*WATER_HAND_SIZE_MAX/100):null;}
export function admitWaterPigment(raw){
 if(typeof raw==='string')return waterPigmentById(raw)?raw:null;
 if(!object(raw)||!ownKeys(raw,['coefficients','granulation','staining','source','finish'])||!Array.isArray(raw.coefficients)||raw.coefficients.length!==WATER_BANDS||!raw.coefficients.every((n,i)=>finite(n)&&Math.abs(n)<=10000&&(i<7||n>=0)))return null;
 if(raw.granulation!=null&&!unit(raw.granulation)||raw.staining!=null&&!unit(raw.staining))return null;
 if(raw.source!=null&&!['pigment','raster'].includes(raw.source))return null;
 const finish=raw.finish==null?null:admitWaterFinish(raw.finish);if(raw.finish!=null&&!finish)return null;
 return {coefficients:raw.coefficients.slice(),granulation:raw.granulation??.4,staining:raw.staining??.5,...(raw.source?{source:raw.source}:{}),...(finish?{finish}:{})};
}
export function mixWaterPigments(left,right,amount=.5){
 const a=admitWaterPigment(left),b=admitWaterPigment(right);if(!a||!b||!unit(amount))throw waterError('WATER_INPUT','The pigment mixture is invalid.');
 const x=typeof a==='string'?waterPigmentById(a):a,y=typeof b==='string'?waterPigmentById(b):b,mix=(u,v)=>u*(1-amount)+v*amount;
 const out={coefficients:x.coefficients.map((value,i)=>mix(value,y.coefficients[i])),granulation:mix(x.granulation,y.granulation),staining:mix(x.staining,y.staining),source:'pigment'};
 const f=waterPigmentFinish(x),g=waterPigmentFinish(y);
 if(f||g)out.finish={settling:mix(f?.settling??0,g?.settling??0),sheen:[0,1,2].map(i=>mix(f?.sheen[i]??0,g?.sheen[i]??0)),iridescence:mix(f?.iridescence??0,g?.iridescence??0)};
 return out;
}
export function admitWaterTip(raw){
 if(!object(raw)||!ownKeys(raw,['width','height','mask'])||!integer(raw.width)||!integer(raw.height)||!raw.width||!raw.height||raw.width*raw.height>WATER_TIP_MAX_PIXELS)return null;
 if(!(Array.isArray(raw.mask)||raw.mask instanceof Uint8Array||raw.mask instanceof Uint8ClampedArray)||raw.mask.length!==raw.width*raw.height||!Array.from(raw.mask).every(n=>integer(n)&&n<=255))return null;
 if(!raw.mask.some(n=>n>0))return null;
 return {width:raw.width,height:raw.height,mask:Array.from(raw.mask)};
}
export function admitWaterControls(raw={},brush='water/round'){
 if(!object(raw)||!ownKeys(raw,['size','water','load','firm','light','angle','follow','radius','erase','flow','bleed','edge','granulation','dry']))return null;
 const preset=waterBrushById(brush)||{...WATER_BRUSHES[0],angle:CUSTOM_PARAMS.angle,follow:CUSTOM_PARAMS.rotation==='follow'};
 const out={size:raw.size??preset.size,water:raw.water??preset.water,load:raw.load??preset.load,firm:raw.firm??true,light:raw.light??1,angle:raw.angle??preset.angle,follow:raw.follow??preset.follow,erase:raw.erase??false};
 if(!finite(out.size)||out.size<0||out.size>100||!unit(out.water)||!unit(out.load)||!unit(out.light)||typeof out.firm!=='boolean'||typeof out.follow!=='boolean'||typeof out.erase!=='boolean'||!finite(out.angle)||out.angle<0||out.angle>179)return null;
 for(const key of ['flow','bleed','edge','granulation','dry']){if(raw[key]==null)continue;if(!unit(raw[key]))return null;out[key]=raw[key];}
 if(raw.radius!=null){if(!finite(raw.radius)||raw.radius<=0||raw.radius>10000)return null;out.radius=raw.radius;}
 return out;
}
export function admitWaterBrush(raw){
 if(!object(raw))return null;
 const data=object(raw.water)?raw.water:raw;
 if(!object(data)||!ownKeys(data,['brush','tool','pigment','paper','water','load','firm','light','angle','follow','size','radius','erase','tip','name','flow','bleed','edge','granulation','dry']))return null;
 const brush=data.brush??'water/round',tip=data.tip==null?null:admitWaterTip(data.tip);
 if(!waterBrushById(brush)&&!(typeof brush==='string'&&/^water\/own-[a-z0-9_-]+$/.test(brush)&&tip))return null;
 if(data.tip!=null&&!tip||tip&&waterBrushById(brush)||!['brush','water','lift','pen'].includes(data.tool??'brush')||!waterPaperById(data.paper??'cold-press'))return null;
 const pigment=admitWaterPigment(data.pigment??'ultramarine');
 const controls=admitWaterControls(Object.fromEntries(['size','water','load','firm','light','angle','follow','radius','erase','flow','bleed','edge','granulation','dry'].filter(k=>data[k]!=null).map(k=>[k,data[k]])),brush);
 if(!pigment||!controls)return null;
 return {brush,tool:data.tool??'brush',pigment,paper:data.paper??'cold-press',...controls,...(tip?{tip}:{}),...(typeof data.name==='string'?{name:data.name}: {})};
}
export function waterBrushDefinition(id='water/round',options={}){
 const water=admitWaterBrush({brush:id,...options});
 if(!water)throw waterError('WATER_INPUT','The Water brush settings are not valid');
 const radius=water.radius??waterRadius(water.size);
 return {settings:[{base:1},{base:1},{base:0},{base:Math.log(radius*3)},{base:.8}],wet:{water:water.water},water};
}
export function admitWaterAction(raw){
 if(!object(raw)||typeof raw.kind!=='string')return null;
 if(raw.kind==='advance'){const dt=raw.dt??1/60;if(!ownKeys(raw,['kind','ticks','dt'])||!integer(raw.ticks)||!waterTimeFits(dt)||dt<=0||!waterTimeFits(dt*raw.ticks))return null;return {kind:'advance',ticks:raw.ticks,...(raw.dt!=null?{dt:raw.dt}:{})};}
 if(raw.kind==='dry')return ownKeys(raw,['kind'])?{kind:'dry'}:null;
 if(raw.kind==='paper')return ownKeys(raw,['kind','paper'])&&waterPaperById(raw.paper)?{kind:'paper',paper:raw.paper}:null;
 if(raw.kind==='tip'){
  if(!ownKeys(raw,['kind','brush'])||!object(raw.brush))return null;
  const brush=admitWaterBrush(raw.brush);return brush&&brush.tip&&brush.brush.startsWith('water/own-')?{kind:'tip',brush}:null;
 }
 if(!['stroke','fill'].includes(raw.kind))return null;
 const allowed=['kind','seed','tool','brush','pigment','controls','paper','source','erase',...(raw.kind==='stroke'?['paths','frames','frame','inputKind','direction']:['at','tolerance'])];
 if(!ownKeys(raw,allowed)||!integer(raw.seed??1)||(raw.seed??1)>0xffffffff)return null;
 const brush=raw.brush??'water/round';
 if(!waterBrushById(brush)&&!(typeof brush==='string'&&/^water\/own-[a-z0-9_-]+$/.test(brush)))return null;
 const controls=admitWaterControls({...raw.controls,...(raw.erase!=null?{erase:raw.erase}:{})},brush),pigment=admitWaterPigment(raw.pigment??'ultramarine');
 const tool=raw.tool??'brush';if(!controls||!pigment||!(raw.kind==='fill'?['brush','water']:['brush','water','lift','pen']).includes(tool)||raw.paper!=null&&!waterPaperById(raw.paper)||raw.source!=null&&!['hand','trace','text'].includes(raw.source))return null;
 const out={kind:raw.kind,seed:raw.seed??1,tool,brush,pigment,controls,...(raw.paper?{paper:raw.paper}:{}),...(raw.source?{source:raw.source}:{})};
 if(raw.kind==='fill'){
  if(tool==='lift'||tool==='pen'||controls.erase)return null;
  if(!Array.isArray(raw.at)||raw.at.length!==2||!raw.at.every(n=>finite(n)&&Math.abs(n)<=1e6)||raw.tolerance!=null&&!unit(raw.tolerance))return null;
  out.at=raw.at.slice();out.tolerance=raw.tolerance??.25;
 }else{
  if(!Array.isArray(raw.paths)||!raw.paths.length)return null;
  let count=0,last=-1;out.paths=[];
  for(const path of raw.paths){
   if(!Array.isArray(path)||!path.length||(count+=path.length)>WATER_ACTION_MAX_POINTS)return null;
   const points=[];
   for(const p of path){
    if(!Array.isArray(p)||p.length<4||p.length>7||!p.slice(0,2).every(n=>finite(n)&&Math.abs(n)<=1e6)||!unit(p[2])||!integer(p[3])||p[3]<last||p.slice(4,6).some(n=>!finite(n)||Math.abs(n)>1)||p[6]!=null&&(!finite(p[6])||p[6]<0))return null;
    last=p[3];points.push(p.slice());
   }out.paths.push(points);
  }
  if(raw.frames==null&&!waterTimeFits((last-out.paths[0][0][3]+1)/WATER_TICK_HZ))return null;
  if(raw.inputKind!=null){if(!['script','mouse','touch','pen'].includes(raw.inputKind))return null;out.inputKind=raw.inputKind;}
  if(raw.direction!=null){if(!Array.isArray(raw.direction)||raw.direction.length!==2||!raw.direction.every(v=>finite(v)&&Math.abs(v)<=1)||Math.hypot(...raw.direction)===0)return null;out.direction=raw.direction.slice();}
  if(raw.frame!=null){const f=raw.frame;if(!frameGeometry(f)||!ownKeys(f,['width','height','origin','scale','paperScale','paperOrigin','paperSeed'])||!finite(f.scale)||f.scale<=0||f.scale>16||!finite(f.paperScale)||f.paperScale<=0||!Array.isArray(f.paperOrigin)||f.paperOrigin.length!==2||!f.paperOrigin.every(Number.isSafeInteger)||!unit(f.paperSeed))return null;out.frame=structuredClone(f);}
  if(raw.frames!=null){
   if(!Array.isArray(raw.frames)||raw.paths.length!==1)return null;
   let consumed=0,finished=false;
   out.frames=[];
   for(const f of raw.frames){
    if(finished||!Array.isArray(f))return null;
    if(f.length===4){if(!raw.frame||f[0]!==0||f[1]!==0||f[2]!==false||!frameGeometry(f[3])||!ownKeys(f[3],['width','height','origin']))return null;out.frames.push(structuredClone(f));continue;}
    if(f.length!==3||!finite(f[0])||f[0]<1/240||f[0]>1/30||!integer(f[1])||typeof f[2]!=='boolean'||(consumed+=f[1])>count)return null;finished=f[2];out.frames.push(f.slice());
   }
   if(consumed!==count)return null;
  }
 }
 return jsonFits(out)?out:null;
}
export function admitWaterActions(raw){
 if(!Array.isArray(raw)||!jsonFits(raw))return null;
 const out=raw.map(admitWaterAction);return out.every(Boolean)?out:null;
}
export function waterProFeature(actions, paper = null){
 const named = value => isWaterSpecialtyPigment(value?.pigment) ? 'pigments' : waterPaperById(value?.paper)?.pro ? 'papers' :
  value?.kind === 'trace' || value?.source === 'trace' ? 'trace' : null;
 if (waterPaperById(paper)?.pro) return 'papers';
 for (const action of Array.isArray(actions) ? actions : []) {
  const feature = named(action) || (action?.kind === 'tip' ? named(action.brush?.water) || named(action.brush) : null);
  if (feature) return feature;
 }
 return null;
}
export function waterActionsFault(raw, prefix = 'actions'){
 if(!Array.isArray(raw)||!jsonFits(raw))return {field: prefix};
 for(let index = 0; index < raw.length; index++){
  const at = prefix + '[' + index + ']', action = raw[index];
  if(admitWaterAction(action)||['text','trace'].includes(action?.kind))continue;
  if(!object(action)||typeof action.kind!=='string')return {field: at};
  if(action.kind==='stroke'&&Array.isArray(action.paths)){
   let last=-1;
   for(let pathIndex=0;pathIndex<action.paths.length;pathIndex++){
    const path=action.paths[pathIndex];
    if(!Array.isArray(path)||!path.length)return {field: at + '.paths[' + pathIndex + ']', hint: 'Each path needs at least one [x,y,pressure,tick] point.'};
    for(let pointIndex=0;pointIndex<path.length;pointIndex++){
     const p=path[pointIndex], field=at + '.paths[' + pathIndex + '][' + pointIndex + ']';
     const point={field, hint: 'A point is [x,y,pressure,tick]: pressure from 0 to 1, tick a whole number.'};
     if(!Array.isArray(p)||p.length<4||p.length>7)return point;
     if(!p.slice(0,2).every(n=>finite(n)&&Math.abs(n)<=1e6)||!unit(p[2])||!integer(p[3]))return point;
     if(p[3]<last)return {field: field + '[3]', hint: 'ticks must not decrease across all paths of one action'};
     last=p[3];
     if(p.slice(4,6).some(n=>!finite(n)||Math.abs(n)>1)||p[6]!=null&&(!finite(p[6])||p[6]<0))return {field};
    }
   }
  }
  if(['stroke','fill'].includes(action.kind)){
   const brush=action.brush??'water/round',controls=object(action.controls)?action.controls:{};
   if(!waterBrushById(brush)&&!(typeof brush==='string'&&/^water\/own-[a-z0-9_-]+$/.test(brush)))return {field: at + '.brush', hint: 'Use a Water brush id from read {guide:"water"}, for example water/round.'};
   if(!admitWaterPigment(action.pigment??'ultramarine'))return {field: at + '.pigment', hint: 'Use a pigment id from read {guide:"water"}, for example ultramarine.'};
   if(controls.size!=null&&!(finite(controls.size)&&controls.size>=0&&controls.size<=100))return {field: at + '.controls.size', hint: 'Use a size from 0 to 100, or omit it for the brush default.'};
   if(action.controls!=null&&!admitWaterControls({...action.controls,...(action.erase!=null?{erase:action.erase}:{})},brush))return {field: at + '.controls', hint: 'Use the controls the Water registry lists, each within its range.'};
   if(action.paper!=null&&!waterPaperById(action.paper))return {field: at + '.paper', hint: 'Use a paper id from read {guide:"water"}, for example cold-press.'};
   if(action.kind==='stroke'&&(!Array.isArray(action.paths)||!action.paths.length))return {field: at + '.paths', hint: 'Give paths: a list of paths, each a list of [x,y,pressure,tick] points.'};
  }
  return {field: at};
 }
 return null;
}
export function admitWaterState(raw){
 if(!object(raw)||!ownKeys(raw,['kind','frame','material','tick','tips','bounds'])||raw.kind!=='water-gpu'||!object(raw.frame)||!object(raw.material)||!integer(raw.tick))return null;
 const f=raw.frame,m=raw.material;
 if(!ownKeys(f,['width','height','scale','origin','seed','paper','cell','paperScale','paperOrigin','paperSeed'])||!integer(f.width)||!integer(f.height)||!f.width||!f.height||f.width*f.height>12000000||!finite(f.scale)||f.scale<=0||f.scale>16||!Array.isArray(f.origin)||f.origin.length!==2||!f.origin.every(Number.isSafeInteger)||!integer(f.seed)||f.seed>0xffffffff||!waterPaperById(f.paper)||f.cell!==1)return null;
 if(!ownKeys(m,['width','height','paperScale','paperOrigin','layers','meta','checkpoint'])||m.width!==f.width||m.height!==f.height||!finite(m.paperScale)||m.paperScale<=0||!Array.isArray(m.paperOrigin)||m.paperOrigin.length!==2||!m.paperOrigin.every(Number.isSafeInteger)||!object(m.layers)||!object(m.meta))return null;
 const pixels=f.width*f.height,sw=f.width>=f.height?Math.round(256*f.width/f.height):256,sh=f.width>=f.height?256:Math.round(256*f.height/f.width),c=m.checkpoint;
 const layouts={ink0:[f.width,f.height,8],ink1:[f.width,f.height,8],fixed0:[f.width,f.height,8],fixed1:[f.width,f.height,8],wet:[f.width,f.height,2],base:[f.width,f.height,4],velocity:[sw,sh,4],pressure:[sw,sh,2],...(Object.hasOwn(m.layers,'finish')?{finish:[f.width,f.height,8]}:{}),paper:[f.width,f.height,4]};
 const rect=(r,w,h)=>Array.isArray(r)&&r.length===4&&r.every(integer)&&r[0]<r[2]&&r[1]<r[3]&&r[2]<=w&&r[3]<=h;
 if(!ownKeys(m.layers,['ink0','ink1','fixed0','fixed1','wet','base','velocity','pressure','finish']))return null;
 if(c!==undefined){
  const p=c?.paper,t=c?.trim;
  if(!object(c)||!ownKeys(c,['paper','trim','simBox','flowMayMove','trimEpoch','layerRects'])||!object(c.layerRects)||!ownKeys(c.layerRects,Object.keys(layouts))||typeof c.flowMayMove!=='boolean'||!integer(c.trimEpoch)||c.simBox!==null&&!rect(c.simBox,sw,sh))return null;
  if(!object(p)||!ownKeys(p,['bytes','regions','unknown'])||typeof p.unknown!=='boolean'||!Array.isArray(p.regions)||p.regions.length>pixels||!p.regions.every(r=>rect(r,f.width,f.height)))return null;
  if(t!==null&&(!object(t)||!ownKeys(t,['pixels','width','height','due','epoch'])||!integer(t.width)||!t.width||!integer(t.height)||!t.height||t.width*t.height>12000000||!integer(t.due)||!integer(t.epoch)||t.pixels!==null&&(!(t.pixels instanceof Uint8Array)||t.pixels.byteLength!==t.width*t.height*4)))return null;
 }
 for(const [name,[w,h,size]]of Object.entries(layouts)){
  if(name==='paper'&&c===undefined)continue;
  const r=c===undefined?[0,0,w,h]:c.layerRects[name],bytes=name==='paper'?c.paper.bytes:m.layers[name];
  if(r!==null&&!rect(r,w,h)||!(bytes instanceof Uint8Array)||bytes.byteLength!==(r?(r[2]-r[0])*(r[3]-r[1])*size:0))return null;
 }
 if(c?.paper.regions.some(r=>{const kept=c.layerRects.paper;return !kept||r[0]<kept[0]||r[1]<kept[1]||r[2]>kept[2]||r[3]>kept[3];}))return null;
 const meta=m.meta,nonnegative=['wetPeak','fixTimer','elapsed','lastWet','awakeUntil','flowSpeed','growCarry'];
 if(!ownKeys(meta,['active','dirty','painted',...nonnegative,'frame','brushNow','params','paperId','paperOrigin','paperScale','seed'])||!object(meta.params)||!ownKeys(meta.params,['flow','bleed','dry','edge','granulation'])||!['flow','bleed','dry','edge','granulation'].every(key=>unit(meta.params[key]))||!nonnegative.every(k=>finite(meta[k])&&meta[k]>=0)||!integer(meta.frame)||meta.paperId!==f.paper||!Array.isArray(meta.brushNow)||meta.brushNow.length!==3||!meta.brushNow.every(finite)||meta.brushNow[2]<0||!unit(meta.seed)||meta.paperScale!==m.paperScale||!Array.isArray(meta.paperOrigin)||meta.paperOrigin.length!==2||meta.paperOrigin.some((v,i)=>v!==m.paperOrigin[i])||f.paperScale!==m.paperScale||f.paperSeed!==meta.seed||!Array.isArray(f.paperOrigin)||f.paperOrigin.length!==2||f.paperOrigin.some((v,i)=>v!==m.paperOrigin[i]))return null;
 for(const key of ['active','dirty','painted']){const r=meta[key];if(r!=null&&(!Array.isArray(r)||r.length!==4||!r.every(integer)||r[0]>=r[2]||r[1]>=r[3]||r[2]>f.width||r[3]>f.height))return null;}
 if(raw.bounds!=null){const b=raw.bounds;if(!object(b)||!ownKeys(b,['x0','y0','x1','y1'])||![b.x0,b.y0,b.x1,b.y1].every(integer)||b.x0>b.x1||b.y0>b.y1||b.x1>=f.width||b.y1>=f.height)return null;}
 if(raw.tips!=null){if(!Array.isArray(raw.tips))return null;const seen=new Set();for(const entry of raw.tips){if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||!/^water\/own-[a-z0-9_-]+$/.test(entry[0])||seen.has(entry[0])||!admitWaterTip(entry[1]))return null;seen.add(entry[0]);}}
 return structuredClone(raw);
}
