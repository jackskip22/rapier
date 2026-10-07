// SPDX-License-Identifier: AGPL-3.0-only
// Water's portable material vocabulary. Admission never loads a painter or a codec.
export const WATER_TICK_HZ = 60;
export const WATER_BANDS = 6;
export const WATER_ACTION_MAX_POINTS = 131072;
export const WATER_TIP_MAX_PIXELS = 1048576;
import {PAINT_REPLAY_MAX_BYTES,paintReplayFits} from './paint-limits.mjs';
export const WATER_SOURCE_MAX_BYTES = PAINT_REPLAY_MAX_BYTES;
const freeze = rows => Object.freeze(rows.map(row => Object.freeze(row)));
// A paper is how the paint behaves on it: tooth, grain scale and absorbency. It has no tone or texture of its own; the paper a
// person sees is the canvas colour and the background tool's, under the transparent layer.
export const WATER_PAPERS = freeze([
 {id:'hot-press',name:'Hot press',tooth:.16,grain:1.1,absorbency:.64},
 {id:'cold-press',name:'Cold press',tooth:.58,grain:1.55,absorbency:.48},
 {id:'rough',name:'Rough',tooth:.92,grain:2.1,absorbency:.38},
 {id:'cotton',name:'Cotton',tooth:.75,grain:2.9,absorbency:.72}
]);
// Absorbance at six overlapping wavelength knots, authored for transparent washes.
export const WATER_PIGMENTS = freeze([
 {id:'hansa-yellow',name:'Hansa yellow',colour:'#edca25',coefficients:[5.2,3.3,.24,.035,.02,.025],granulation:.12,staining:.58},
 {id:'yellow-ochre',name:'Yellow ochre',colour:'#c39b45',coefficients:[3.3,2.8,1.05,.42,.17,.12],granulation:.75,staining:.28},
 {id:'earth-red',name:'Earth red',colour:'#a74e3d',coefficients:[2.9,3.5,3.15,1.5,.32,.12],granulation:.67,staining:.45},
 {id:'burnt-sienna',name:'Burnt sienna',colour:'#a65d3c',coefficients:[3.4,3.6,2.1,.92,.24,.17],granulation:.7,staining:.35},
 {id:'quinacridone-rose',name:'Quinacridone rose',colour:'#cf4374',coefficients:[.78,1.5,4.1,3.8,.6,.12],granulation:.08,staining:.86},
 {id:'ultramarine',name:'Ultramarine',colour:'#465baf',coefficients:[.18,.12,.68,1.85,4.15,4.5],granulation:.9,staining:.27},
 {id:'phthalo-blue',name:'Phthalo blue',colour:'#147ca1',coefficients:[.5,.12,.28,1.15,4.7,5.6],granulation:.06,staining:.94},
 {id:'viridian',name:'Viridian',colour:'#238869',coefficients:[2.6,1.65,.16,.19,2.8,3.8],granulation:.7,staining:.43},
 {id:'burnt-umber',name:'Burnt umber',colour:'#70503a',coefficients:[3.15,3.05,2.45,1.72,1.06,.65],granulation:.77,staining:.4},
 {id:'ivory-black',name:'Ivory black',colour:'#3f4142',coefficients:[2.75,2.8,2.85,2.87,2.91,2.92],granulation:.6,staining:.53}
]);
export const WATER_BRUSHES = freeze([
 {id:'water/round',name:'Round',size:44,water:.68,load:.65,aspect:1,spacing:.19,capacity:1.3,description:'A pointed round for flowing lines and everyday washes.'},
 {id:'water/flat',name:'Flat',size:49,water:.6,load:.65,aspect:.34,spacing:.12,capacity:1.15,description:'A broad chisel for directional strokes and sharp turns.'},
 {id:'water/rigger',name:'Rigger',size:20,water:.47,load:.68,aspect:1,spacing:.17,capacity:2.1,description:'A fine long line with a generous reservoir.'},
 {id:'water/hake',name:'Hake',size:64,water:.9,load:.48,aspect:.3,spacing:.12,capacity:2.4,description:'A broad, streaked wash with separated soft hairs.'},
 {id:'water/mop',name:'Mop',size:63,water:.95,load:.52,aspect:1,spacing:.18,capacity:2.8,description:'A full soft head for generous pools and broad washes.'},
 {id:'water/fan',name:'Fan',size:49,water:.42,load:.63,aspect:.66,spacing:.13,capacity:.95,description:'Splayed separated hairs for grasses and fine texture.'},
 {id:'water/dry',name:'Dry brush',size:44,water:.12,load:.71,aspect:.72,spacing:.13,capacity:.72,description:'Broken bristle contact that follows the raised paper tooth.'},
 {id:'water/sponge',name:'Sponge',size:50,water:.5,load:.6,aspect:.94,spacing:.39,capacity:1.3,description:'A porous head for foliage and irregular dabs.'},
 {id:'water/spatter',name:'Spatter',size:51,water:.72,load:.72,aspect:1,spacing:.72,capacity:1.8,description:'Separate seeded droplets flicked around the stroke.'},
 {id:'water/stipple',name:'Stipple',size:43,water:.28,load:.67,aspect:1,spacing:.42,capacity:1.3,description:'A cluster of small separated pigment marks.'},
 {id:'water/sumi',name:'Sumi',size:48,water:.67,load:.82,aspect:1,spacing:.15,capacity:1.05,description:'A pressure-sensitive pointed head with fibrous edges.'},
 {id:'water/detail',name:'Detail',size:27,water:.48,load:.62,aspect:1,spacing:.16,capacity:.8,description:'A small round for deliberate fine marks.'},
 {id:'water/filbert',name:'Filbert',size:45,water:.6,load:.63,aspect:.55,spacing:.13,capacity:1.2,description:'A rounded oval with a broad belly and soft ends.'},
 {id:'water/dagger',name:'Dagger',size:42,water:.57,load:.68,aspect:.4,spacing:.12,capacity:1.15,description:'A tapered blade for calligraphic edges and pointed leaves.'}
]);
export const WATER_TOOLS = freeze([
 {id:'brush',name:'Brush',description:'Lay the selected pigment with the current head.'},
 {id:'water',name:'Water',description:'Wet, soften and push pigment already on the paper.'},
 {id:'lift',name:'Lift',description:'Blot water and suspended pigment from a wash.'},
 {id:'dry',name:'Dry',description:'Settle the wash and fix its pigment.'},
 {id:'fill',name:'Fill',description:'Wet a connected region with a travelling wash.'},
 {id:'trace',name:'Trace',description:'Paint the captured paths of a drawing shape.'},
 {id:'text',name:'Text',description:'Write captured single-stroke letter paths with the brush.'}
]);
export const WATER_CONTROLS = Object.freeze({size:{min:0,max:100,default:44},water:{min:0,max:1,default:.68},load:{min:0,max:1,default:.65},firm:{type:'boolean',default:true},light:{min:0,max:1,default:1},angle:{min:0,max:179,default:45},follow:{type:'boolean',default:false},paper:WATER_PAPERS.map(p=>p.id),pigment:WATER_PIGMENTS.map(p=>p.id)});
export const waterBrushById = id => WATER_BRUSHES.find(b=>b.id===id)||null;
export const waterPigmentById = id => WATER_PIGMENTS.find(p=>p.id===id)||null;
export const waterPaperById = id => WATER_PAPERS.find(p=>p.id===id)||null;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const unit=v=>finite(v)&&v>=0&&v<=1;
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const ownKeys=(v,allowed)=>Object.keys(v).every(k=>allowed.includes(k));
const jsonFits=paintReplayFits;
export function waterError(code,message){return Object.assign(new RangeError(message),{code,recoverable:true});}
export function waterRadius(size=44){return 1.1*Math.exp(size*.047);}
export function admitWaterPigment(raw){
 if(typeof raw==='string')return waterPigmentById(raw)?raw:null;
 if(!object(raw)||!ownKeys(raw,['coefficients','granulation','staining','source'])||!Array.isArray(raw.coefficients)||raw.coefficients.length!==WATER_BANDS||!raw.coefficients.every(n=>finite(n)&&n>=0&&n<=10000))return null;
 if(raw.granulation!=null&&!unit(raw.granulation)||raw.staining!=null&&!unit(raw.staining))return null;
 if(raw.source!=null&&!['pigment','raster'].includes(raw.source))return null;
 return {coefficients:raw.coefficients.slice(),granulation:raw.granulation??.4,staining:raw.staining??.5,...(raw.source?{source:raw.source}:{})};
}
export function admitWaterTip(raw){
 if(!object(raw)||!ownKeys(raw,['width','height','mask'])||!integer(raw.width)||!integer(raw.height)||!raw.width||!raw.height||raw.width*raw.height>WATER_TIP_MAX_PIXELS)return null;
 if(!(Array.isArray(raw.mask)||raw.mask instanceof Uint8Array||raw.mask instanceof Uint8ClampedArray)||raw.mask.length!==raw.width*raw.height||!Array.from(raw.mask).every(n=>integer(n)&&n<=255))return null;
 if(!raw.mask.some(n=>n>0))return null;
 return {width:raw.width,height:raw.height,mask:Array.from(raw.mask)};
}
export function admitWaterControls(raw={},brush='water/round'){
 if(!object(raw)||!ownKeys(raw,['size','water','load','firm','light','angle','follow','radius','erase']))return null;
 const preset=waterBrushById(brush)||WATER_BRUSHES[0];
 const out={size:raw.size??preset.size,water:raw.water??preset.water,load:raw.load??preset.load,firm:raw.firm??true,light:raw.light??1,angle:raw.angle??45,follow:raw.follow??false,erase:raw.erase??false};
 if(!finite(out.size)||out.size<0||out.size>100||!unit(out.water)||!unit(out.load)||!unit(out.light)||typeof out.firm!=='boolean'||typeof out.follow!=='boolean'||typeof out.erase!=='boolean'||!finite(out.angle)||out.angle<0||out.angle>179)return null;
 if(raw.radius!=null){if(!finite(raw.radius)||raw.radius<=0||raw.radius>10000)return null;out.radius=raw.radius;}
 return out;
}
export function admitWaterBrush(raw){
 if(!object(raw))return null;
 const data=object(raw.water)?raw.water:raw;
 if(!object(data)||!ownKeys(data,['brush','tool','pigment','paper','water','load','firm','light','angle','follow','size','radius','erase','tip','name']))return null;
 const brush=data.brush??'water/round',tip=data.tip==null?null:admitWaterTip(data.tip);
 if(!waterBrushById(brush)&&!(typeof brush==='string'&&/^water\/own-[a-z0-9_-]+$/.test(brush)&&tip))return null;
 if(data.tip!=null&&!tip||tip&&waterBrushById(brush)||!['brush','water','lift'].includes(data.tool??'brush')||!waterPaperById(data.paper??'cold-press'))return null;
 const pigment=admitWaterPigment(data.pigment??'ultramarine');
 const controls=admitWaterControls(Object.fromEntries(['size','water','load','firm','light','angle','follow','radius','erase'].filter(k=>data[k]!=null).map(k=>[k,data[k]])),brush);
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
 if(raw.kind==='advance')return ownKeys(raw,['kind','ticks'])&&integer(raw.ticks)?{kind:'advance',ticks:raw.ticks}:null;
 if(raw.kind==='dry')return ownKeys(raw,['kind'])?{kind:'dry'}:null;
 if(raw.kind==='paper')return ownKeys(raw,['kind','paper'])&&waterPaperById(raw.paper)?{kind:'paper',paper:raw.paper}:null;
 if(raw.kind==='tip'){
  if(!ownKeys(raw,['kind','brush'])||!object(raw.brush))return null;
  const brush=admitWaterBrush(raw.brush);return brush&&brush.tip&&brush.brush.startsWith('water/own-')?{kind:'tip',brush}:null;
 }
 if(!['stroke','fill'].includes(raw.kind))return null;
 const allowed=['kind','seed','tool','brush','pigment','controls','paper','source','erase',...(raw.kind==='stroke'?['paths']:['at','tolerance'])];
 if(!ownKeys(raw,allowed)||!integer(raw.seed??1)||(raw.seed??1)>0xffffffff)return null;
 const brush=raw.brush??'water/round';
 if(!waterBrushById(brush)&&!(typeof brush==='string'&&/^water\/own-[a-z0-9_-]+$/.test(brush)))return null;
 const controls=admitWaterControls({...raw.controls,...(raw.erase!=null?{erase:raw.erase}:{})},brush),pigment=admitWaterPigment(raw.pigment??'ultramarine');
 const tool=raw.tool??'brush';if(!controls||!pigment||!['brush','water','lift'].includes(tool)||raw.paper!=null&&!waterPaperById(raw.paper)||raw.source!=null&&!['hand','trace','text'].includes(raw.source))return null;
 const out={kind:raw.kind,seed:raw.seed??1,tool,brush,pigment,controls,...(raw.paper?{paper:raw.paper}:{}),...(raw.source?{source:raw.source}:{})};
 if(raw.kind==='fill'){
  if(!Array.isArray(raw.at)||raw.at.length!==2||!raw.at.every(n=>finite(n)&&Math.abs(n)<=1e6)||raw.tolerance!=null&&!unit(raw.tolerance))return null;
  out.at=raw.at.slice();out.tolerance=raw.tolerance??.12;
 }else{
  if(!Array.isArray(raw.paths)||!raw.paths.length)return null;
  let count=0,last=-1;out.paths=[];
  for(const path of raw.paths){
   if(!Array.isArray(path)||!path.length||(count+=path.length)>WATER_ACTION_MAX_POINTS)return null;
   const points=[];
   for(const p of path){
    if(!Array.isArray(p)||p.length<4||p.length>6||!p.slice(0,2).every(n=>finite(n)&&Math.abs(n)<=1e6)||!unit(p[2])||!integer(p[3])||p[3]<last||p.slice(4).some(n=>!finite(n)||Math.abs(n)>1))return null;
    last=p[3];points.push(p.slice());
   }out.paths.push(points);
  }
 }
 return jsonFits(out)?out:null;
}
export function admitWaterActions(raw){
 if(!Array.isArray(raw)||!jsonFits(raw))return null;
 const out=raw.map(admitWaterAction);return out.every(Boolean)?out:null;
}
export function admitWaterState(raw){
 if(!object(raw)||raw.kind!=='water'||!object(raw.frame)||!integer(raw.tick)||!Array.isArray(raw.tiles)||!Array.isArray(raw.details)||!Array.isArray(raw.base))return null;
 const f=raw.frame;
 if(!integer(f.width)||!integer(f.height)||!f.width||!f.height||f.width*f.height>12000000||!finite(f.scale)||f.scale<=0||f.scale>16||!Array.isArray(f.origin)||f.origin.length!==2||!f.origin.every(Number.isSafeInteger)||!integer(f.seed)||!waterPaperById(f.paper)||!integer(f.cell)||f.cell<1)return null;
 const coord=row=>object(row)&&Number.isSafeInteger(row.x)&&Number.isSafeInteger(row.y);
 for(const t of raw.tiles){if(!coord(t)||!Array.isArray(t.cells)||!t.cells.every(c=>Array.isArray(c)&&c.length===18&&c.every(n=>finite(n)&&n>=0)))return null;}
 for(const d of raw.details){if(!coord(d)||!Array.isArray(d.values)||d.values.length!==4096||!d.values.every(n=>finite(n)&&n>=-1&&n<=1))return null;}
 for(const b of raw.base){if(!coord(b)||!Array.isArray(b.data)||b.data.length!==16384||!b.data.every(n=>integer(n)&&n<=255))return null;}
 // The layer's custom tips travel with its material: each stored once under its own name.
 if(raw.tips!==undefined&&(!Array.isArray(raw.tips)||!raw.tips.every(row=>Array.isArray(row)&&row.length===2&&typeof row[0]==='string'&&/^water\/own-[a-z0-9_-]+$/.test(row[0])&&admitWaterTip(row[1]))))return null;
 return structuredClone(raw);
}
