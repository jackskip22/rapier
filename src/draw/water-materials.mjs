// SPDX-License-Identifier: AGPL-3.0-only
// Material coordinates stay attached to the sheet when its viewport changes.

const immutable = value => {
 if (value && typeof value === 'object') { for (const item of Object.values(value)) immutable(item); Object.freeze(value); }
 return value;
};
// The papers and their periodic field live with the paper background's CPU twin (paper-field.mjs).
import {PAPER_KINDS, WATER_PAPER_PERIOD, WATER_PAPER_BAND} from './paper-field.mjs';
export {PAPER_KINDS};

const brushDefaults = {
 aspect:1,rotation:'fixed',angle:0,angleJitter:0,size:[.011,.05],pressureSize:1,speedThin:0,
 spacing:.3,scatter:0,dabs:1,sizeJitter:0,water:1,load:1,flow:1,capacity:1,grain:0,wetRound:.6
};
const profiles = [
 ['round','Round',{}],
 ['detail','Detail',{size:[.0025,.014],pressureSize:.9,water:.7,load:1.15,capacity:.6,spacing:.28,wetRound:.8}],
 ['rigger','Rigger',{size:[.0015,.0065],pressureSize:.7,speedThin:.08,water:.55,load:1.3,capacity:1.8,spacing:.25,wetRound:.9}],
 ['flat','Flat',{aspect:.26,angle:40,angleJitter:1.5,size:[.02,.038],pressureSize:1.4,spacing:.14,water:.8,wetRound:.25}],
 ['hake','Hake',{aspect:.2,rotation:'follow',angle:90,angleJitter:2,size:[.05,.08],pressureSize:1.6,spacing:.1,water:1.6,load:.75,flow:1.2,capacity:2.2,wetRound:.5}],
 ['filbert','Filbert',{aspect:.55,angle:25,angleJitter:2,size:[.012,.036],spacing:.18,wetRound:.5}],
 ['mop','Mop',{size:[.03,.075],pressureSize:.8,spacing:.25,water:1.8,load:.8,flow:1.3,capacity:2.6,wetRound:.7}],
 ['dry','Dry Brush',{aspect:.75,rotation:'follow',angleJitter:8,size:[.012,.036],spacing:.12,water:.2,load:1.1,capacity:.6,grain:.9,wetRound:0}],
 ['fan','Fan',{aspect:.5,rotation:'follow',angle:90,angleJitter:3,size:[.02,.045],pressureSize:1.2,spacing:.1,water:.3,capacity:.8,grain:.5,wetRound:0}],
 ['sponge','Sponge',{rotation:'random',size:[.025,.05],pressureSize:.7,spacing:.55,scatter:.3,sizeJitter:.3,water:.5,load:.9,capacity:1.2,grain:.45,wetRound:.1}],
 ['spatter','Spatter',{rotation:'random',size:[.003,.008],pressureSize:.8,spacing:4.5,scatter:10,dabs:5,sizeJitter:.75,water:1.3,load:1.1,capacity:1.5,wetRound:0}],
 ['sumi','Sumi',{size:[.002,.052],pressureSize:1.3,speedThin:.12,spacing:.22,water:.8,load:1.3,capacity:1.2,wetRound:.75}],
 ['dagger','Dagger',{aspect:.38,angle:55,angleJitter:1,size:[.006,.03],pressureSize:1.1,speedThin:.06,spacing:.15,load:1.1,capacity:1.4,wetRound:.3}],
 ['stipple','Stipple',{rotation:'random',size:[.015,.035],pressureSize:.8,spacing:.7,scatter:.2,sizeJitter:.2,water:.35,load:1.1,grain:.3,wetRound:0}]
];
export const BRUSHES = immutable(profiles.map(([shape,name,changes])=>({id:`water/${shape}`,name,shape,params:{...brushDefaults,...changes}})));
export const CUSTOM_PARAMS = immutable({...brushDefaults,rotation:'follow',angleJitter:4,spacing:.2,wetRound:.4});
export const getPaper = id => PAPER_KINDS.find(p=>p.id===id)||null;
export const getBrush = id => BRUSHES.find(b=>b.id===id)||null;
const unit = x => Math.max(0,Math.min(1,x));
const ramp = (x,low,high) => {const t=unit((x-low)/(high-low));return t*t*(3-2*t);};
const disc = (distance,core) => 1-ramp(distance,core,1);

// Integer hashing and a repeatable stream give a tip stable identity in saved drawings.
function materialNoise(shape,seed) {
 let identity=2166136261;
 for(let i=0;i<shape.length;i++)identity=Math.imul(identity^shape.charCodeAt(i),16777619);
 const salt=seed+(identity>>>0);
 let state=(salt|0)||1;
 const next=()=>{
  state=(state+0x6d2b79f5)|0;
  let bits=Math.imul(state^(state>>>15),state|1);
  bits^=bits+Math.imul(bits^(bits>>>7),bits|61);
  return ((bits^(bits>>>14))>>>0)/4294967296;
 };
 const hash=(x,y)=>{
  let bits=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(salt,982451653))|0;
  bits=Math.imul(bits^(bits>>>13),1274126177);
  return ((bits^(bits>>>16))>>>0)/4294967296;
 };
 const lattice=(x,y)=>{
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
 };
 const grain=(x,y,count=4)=>{
  let sum=0,total=0,gain=.5;
  for(let octave=0;octave<count;octave++) {
   sum+=gain*lattice(x,y);total+=gain;
   x=x*2.03+17.1;y=y*2.01+9.7;gain*=.5;
  }
  return sum/total;
 };
 const pore=(x,y)=>{
  const ix=Math.floor(x),iy=Math.floor(y);let first=9,second=9;
  for(let j=iy-1;j<=iy+1;j++)for(let i=ix-1;i<=ix+1;i++){
   const distance=Math.hypot(i+hash(i,j)-x,j+hash(i+71,j+13)-y);
   if(distance<first){second=first;first=distance;}else second=Math.min(second,distance);
  }
  return second-first;
 };
 return {next,grain,pore};
}

function footprint(shape,noise) {
 const g=noise.grain;
 const cores={detail:.55,rigger:.65,spatter:.72};
 if(shape in cores)return (x,y,r)=>disc(r,cores[shape]);
 const circles=[];
 const segments=[];
 if(shape==='stipple')while(circles.length<46){
  const x=2*noise.next()-1,y=2*noise.next()-1;
  if(Math.hypot(x,y)<.86)circles.push([x,y,.06+.08*noise.next()]);
 }
 if(shape==='fan')for(let i=0;i<13;i++){
  const x=-.95+1.9*i/12+(noise.next()-.5)*.08;
  segments.push([x*.25,-1.3,x,.75+noise.next()*.25]);
 }
 return (x,y,r,angle)=>{
  if(shape==='stipple')return circles.reduce((a,[cx,cy,cr])=>Math.max(a,disc(Math.hypot(x-cx,y-cy)/cr,.6)),0);
  if(shape==='fan'){
   let density=0;
   for(const [ax,ay,bx,by] of segments){
    const vx=bx-ax,vy=by-ay,t=unit(((x-ax)*vx+(y-ay)*vy)/(vx*vx+vy*vy));
    const d=Math.hypot(x-ax-vx*t,y-ay-vy*t);
    density+=Math.exp(-(d*d)/(.045*.045));
   }
   return Math.min(1,density)*(1-ramp(Math.abs(y),.85,1));
  }
  if(shape==='dagger'){
   const t=(x+1)*.5,width=Math.sqrt(Math.max(0,4*t*(1-t)))*(1-.5*t);
   return 1-ramp(Math.abs(y),.8*width,width);
  }
  if(shape==='sponge')return disc(r,.55)*ramp(noise.pore(4.5*x,4.5*y),.03,.14)*(.55+.45*g(7*x,7*y,3));
  if(shape==='dry')return disc(r,.2)*ramp(g(5.5*x,5.5*y,5),.42,.62)*(1-.3*g(14*x,1.2*y,3));
  if(shape==='filbert')return disc(r,.45)*(1-.25*g(8*x,.7,3));
  if(shape==='flat'||shape==='hake'){
   const wash=shape==='hake';
   const wobble=wash?.1*(2*g(2*y+4,1,3)-1):.06*(2*g(3*y+9,2,3)-1);
   const along=1-ramp(Math.abs(x)+wobble,wash?.72:.8,wash?1:.98);
   const across=1-ramp(Math.abs(y),wash?.55:.8,1);
   const strands=wash?1-.65*ramp(g(16*x,.9*y,3),.35,.7):1-.4*ramp(g(10*x,.7*y,3),.4,.75);
   return along*across*strands*(wash?.4+.6*ramp(g(7*x+20,.4*y,2),.25,.45):1);
  }
  const sumi=shape==='sumi',mop=shape==='mop';
  const wobble=sumi?g(2.5*angle+2*r,1,3):mop?g(1.2*angle,1.7,3):g(.8*angle+3,2.5*r);
  const outline=r*(1+(sumi?.35:mop?.22:.08)*(2*wobble-1));
  const contact=disc(outline,sumi?.25:mop?.1:.3);
  const texture=sumi?1-.3*g(8*r,3*angle,3):mop?1-.25*g(3*x,3*y):1-.12*g(5*x,5*y);
  return Math.pow(contact,sumi?1.5:mop?1.3:1)*texture;
 };
}

export const WATER_TIP_SIZE=192;
export function makeTip(brush,size=WATER_TIP_SIZE,seed=7) {
 const material=typeof brush==='string'?getBrush(brush):brush;
 if(!material||!Number.isSafeInteger(size)||size<1)throw new RangeError('Invalid watercolor footprint');
 const shape=material.shape||material.id?.slice(6);
 if(!BRUSHES.some(item=>item.shape===shape))throw new RangeError('Unknown watercolor footprint');
 const sample=footprint(shape,materialNoise(shape,seed));
 const rgba=new Uint8Array(size*size*4);let sum=0;
 for(let pixel=0;pixel<size*size;pixel++){
  const x=2*((pixel%size+.5)/size)-1,y=2*((Math.floor(pixel/size)+.5)/size)-1;
  // Field generation first rounds to float32; the uploaded mask is then 8-bit.
  const value=Math.round(255*unit(Math.fround(unit(sample(x,y,Math.hypot(x,y),Math.atan2(y,x))))));
  rgba[pixel*4]=rgba[pixel*4+1]=rgba[pixel*4+2]=value;rgba[pixel*4+3]=255;sum+=value;
 }
 return {width:size,height:size,rgba,mean:Math.max(.01,sum/(255*size*size))};
}

// The scalar fields encode height, formation and inclusions; lighting is a separate pass.
export const PAPER_WGSL = `
fn wp_permute(value:u32)->u32 {
 let state=value*747796405u+2891336453u;
 let bits=((state>>((state>>28u)+4u))^state)*277803737u;
 return (bits>>22u)^bits;
}
fn wp_hash(cell:vec2<f32>,stream:u32,seed:u32)->f32 {
 let grid=vec2<u32>(vec2<i32>(floor(cell)));
 return f32(wp_permute(grid.x+wp_permute(grid.y+wp_permute(stream+seed))))*(1.0/4294967296.0);
}
fn wp_pair(cell:vec2<f32>,stream:u32,seed:u32)->vec2<f32> {
 return vec2<f32>(wp_hash(cell,stream,seed),wp_hash(cell,stream+1u,seed));
}
fn wp_noise(point:vec2<f32>,stream:u32,seed:u32)->f32 {
 let cell=floor(point);let fraction=fract(point);
 let weight=fraction*fraction*(3.0-2.0*fraction);
 let lower=mix(wp_hash(cell,stream,seed),wp_hash(cell+vec2<f32>(1.0,0.0),stream,seed),weight.x);
 let upper=mix(wp_hash(cell+vec2<f32>(0.0,1.0),stream,seed),wp_hash(cell+vec2<f32>(1.0),stream,seed),weight.x);
 return mix(lower,upper,weight.y);
}
fn wp_fractal(point:vec2<f32>,octaves:u32,stream:u32,seed:u32)->f32 {
 var p=point;var sum=0.0;var scale=0.5;var total=0.0;
 for(var octave=0u;octave<octaves;octave++) {
  sum+=scale*wp_noise(p,stream+13u*octave,seed);total+=scale;
  p=vec2<f32>(0.8*p.x+0.6*p.y,-0.6*p.x+0.8*p.y)*2.03+17.1;scale*=0.5;
 }
 return sum/total;
}
fn wp_displace(point:vec2<f32>,frequency:f32,amplitude:f32,stream:u32,seed:u32)->vec2<f32> {
 let offset=vec2<f32>(wp_fractal(point*frequency,3u,stream,seed),wp_fractal(point*frequency,3u,stream+50u,seed));
 return point+(offset-0.5)*amplitude;
}
fn wp_neighbors(point:vec2<f32>,jitter:f32,stream:u32,seed:u32)->vec2<f32> {
 let cell=floor(point);let local=fract(point);var nearest=vec2<f32>(9.0);
 for(var y:i32=-1;y<=1;y++) {for(var x:i32=-1;x<=1;x++) {
  let offset=vec2<f32>(f32(x),f32(y));
  let delta=offset+0.5+(wp_pair(cell+offset,stream,seed)-0.5)*jitter-local;
  let distance=length(delta);
  if(distance<nearest.x){nearest=vec2<f32>(distance,nearest.x);}else{nearest.y=min(nearest.y,distance);}
 }}
 return nearest;
}
fn wp_hills(point:vec2<f32>,stream:u32,seed:u32)->f32 {
 let cell=floor(point);let local=fract(point);var sum=0.0;
 for(var y:i32=-1;y<=1;y++){for(var x:i32=-1;x<=1;x++){
  let offset=vec2<f32>(f32(x),f32(y));let identity=cell+offset;
  let center=wp_pair(identity,stream,seed);let shape=wp_pair(identity,stream+2u,seed);
  let delta=offset+center-local;let radius=0.35+0.4*shape.x;
  sum+=(0.5+0.5*shape.y)*exp(-dot(delta,delta)/(radius*radius));
 }}
 return 0.75*sum;
}
fn wp_segment(point:vec2<f32>,a:vec2<f32>,b:vec2<f32>)->f32 {
 let direction=b-a;let local=point-a;
 return length(local-direction*clamp(dot(local,direction)/dot(direction,direction),0.0,1.0));
}
fn wp_fibers(point:vec2<f32>,pitch:f32,span:f32,width:f32,density:f32,alignment:f32,stream:u32,seed:u32)->f32 {
 let p=point/pitch;let grid=floor(p);var coverage=0.0;
 for(var y:i32=-2;y<=2;y++){for(var x:i32=-2;x<=2;x++){for(var fiber=0u;fiber<2u;fiber++){
  let cell=grid+vec2<f32>(f32(x),f32(y));let lane=stream+31u*fiber;
  let origin=wp_pair(cell,lane,seed);let choice=wp_pair(cell,lane+2u,seed);
  if(choice.y<density){
   let angle=(choice.x-0.5)*3.14159265*(1.0-alignment);
   let radius=span*(0.35+0.65*wp_hash(cell,lane+4u,seed))*0.5;
   let endpoint=vec2<f32>(cos(angle),sin(angle))*radius;
   let distance=wp_segment(p,cell+origin-endpoint,cell+origin+endpoint)*pitch;
   let opacity=(1.0-smoothstep(width*0.5,width*0.5+0.9,distance))*(0.55+0.45*wp_hash(cell,lane+5u,seed));
   coverage=max(coverage,opacity);
  }
 }}}
 return coverage;
}
fn wp_specks(point:vec2<f32>,pitch:f32,radius:f32,density:f32,stream:u32,seed:u32)->f32 {
 let cell=floor(point/pitch);let local=point/pitch-cell;var coverage=0.0;
 for(var y:i32=-1;y<=1;y++){for(var x:i32=-1;x<=1;x++){
  let offset=vec2<f32>(f32(x),f32(y));let identity=cell+offset;
  if(wp_hash(identity,stream+2u,seed)<density){
   let size=radius*(0.4+0.6*wp_hash(identity,stream+3u,seed));
   let distance=length(offset+wp_pair(identity,stream,seed)-local)*pitch;
   coverage=max(coverage,1.0-smoothstep(0.6*size,size+0.6,distance));
  }
 }}
 return coverage;
}
fn wp_repeat(point:vec2<f32>,period:vec2<f32>)->vec2<f32>{return point-period*floor(point/period);}
fn wp_hexagonal(point:vec2<f32>)->f32 {
 let period=vec2<f32>(1.0,1.7320508);
 let first=wp_repeat(point,period)-0.5*period;
 let second=wp_repeat(point-0.5*period,period)-0.5*period;
 return min(length(first),length(second));
}
fn waterPaperField(point:vec2<f32>,seedValue:f32,kind:u32)->vec3<f32> {
 let seed=u32(seedValue*7919.0);var height=0.5;var formation=0.5;var inclusions=0.5;
 switch kind {
  case 1u: {
   let felt=0.6*wp_fractal(point*0.06,4u,200u,seed)+0.25*wp_noise(point*0.4,210u,seed);
   let fiber=wp_fibers(point,16.0,2.5,0.8,0.3,0.0,220u,seed);
   height=0.5+(felt+0.05*fiber-0.4)*0.45;formation=wp_fractal(point*0.01,4u,230u,seed);
  }
  case 2u: {
   let coarse=wp_displace(point,0.01,40.0,300u,seed);
   let large=smoothstep(0.3,0.7,wp_fractal(point*0.006,3u,305u,seed));
   let hills=wp_hills(coarse/26.0,310u,seed)*(0.35+0.4*large)+wp_hills(coarse/12.0,315u,seed)*(0.45-0.25*large);
   height=0.5+(0.65*hills+0.25*wp_fractal(coarse*0.06,5u,320u,seed)+0.1*wp_noise(point*0.45,325u,seed)-0.52)*1.5;
   formation=wp_fractal(point*0.01,4u,330u,seed);
  }
  case 3u: {
   let coarse=wp_displace(point,0.008,60.0,400u,seed);
   let hills=1.0-smoothstep(0.0,0.9,wp_neighbors(coarse/13.0,1.0,420u,seed).x);
   let fiber=wp_fibers(wp_displace(point,0.05,8.0,430u,seed),9.0,3.0,1.1,0.6,0.0,440u,seed);
   let felt=0.5*wp_fractal(coarse*0.035,5u,410u,seed)+0.3*hills+0.16*wp_fractal(point*0.2,3u,450u,seed)+0.03*fiber;
   let fleck=max(wp_specks(point,60.0,2.0,0.3,460u,seed),0.6*wp_fibers(wp_displace(point,0.06,10.0,465u,seed),110.0,0.4,0.9,0.3,0.0,470u,seed));
   height=0.5+(felt-0.5)*1.6;formation=0.7*wp_fractal(point*0.006,4u,480u,seed)+0.25*fiber;inclusions=0.5-0.35*fleck+0.06*fiber;
  }
  case 4u: {
   let longFiber=wp_fibers(wp_displace(point,0.025,28.0,500u,seed),42.0,3.4,1.3,0.4,0.0,510u,seed)*(0.6+0.4*wp_noise(point*0.05,512u,seed));
   let fineFiber=wp_fibers(wp_displace(point,0.05,10.0,515u,seed),14.0,3.0,0.6,0.45,0.0,520u,seed);
   height=0.5+(0.8*wp_fractal(point*0.05,4u,530u,seed)+0.08*longFiber+0.03*fineFiber-0.42)*0.7;
   formation=0.85*wp_fractal(point*0.005,5u,540u,seed)+0.15*longFiber;
   inclusions=0.5+0.16*longFiber+0.05*fineFiber-0.4*wp_specks(point,70.0,1.6,0.18,550u,seed);
  }
  case 5u: {
   let horizontal=(wp_fractal(point*vec2<f32>(0.004,0.02),3u,600u,seed)-0.5)*6.0;
   let laid=pow(0.5+0.5*cos(2.0*3.14159265*(point.y+horizontal)/5.6),2.0);
   let vertical=point.x+(wp_fractal(point*vec2<f32>(0.02,0.004),3u,610u,seed)-0.5)*8.0;
   let distance=abs(fract(vertical/140.0)-0.5)*140.0;
   let chain=1.0-smoothstep(1.0,3.5,distance);
   height=0.5+(0.1*laid+0.05*chain+0.6*wp_fractal(point*0.08,4u,620u,seed)-0.36)*1.1;
   formation=0.5-0.12*exp(-distance/12.0)-0.06*laid+(wp_fractal(point*0.01,3u,630u,seed)-0.5)*0.6;
  }
  case 6u: {
   let p=point+(vec2<f32>(wp_noise(point*0.02,700u,seed),wp_noise(point*0.02,701u,seed))-0.5)*8.0*1.2;
   let cell=p/8.0;let slot=floor(cell);let center=fract(cell)-0.5;
   let warp=0.8+0.2*wp_hash(vec2<f32>(slot.x,0.0),702u,seed)+0.3*(wp_noise(vec2<f32>(slot.x*5.0,cell.y*0.35),703u,seed)-0.5);
   let weft=0.8+0.2*wp_hash(vec2<f32>(0.0,slot.y),704u,seed)+0.3*(wp_noise(vec2<f32>(cell.x*0.35,slot.y*5.0),705u,seed)-0.5);
   let parity=slot.x+slot.y-2.0*floor((slot.x+slot.y)/2.0);let raised=parity>0.5;
   let ellipse=center*select(vec2<f32>(1.15,2.3),vec2<f32>(2.3,1.15),raised);
   let thread=max(0.0,1.0-dot(ellipse,ellipse))*select(weft,warp,raised);
   height=0.5+(0.75*sqrt(thread)+0.25*wp_fractal(p*0.15,3u,706u,seed)-0.55)*1.1;
   formation=wp_fractal(p*0.01,3u,707u,seed);
  }
  case 7u: {
   let coarse=wp_displace(point,0.05,7.0,800u,seed)/9.0;
   let radius=wp_hexagonal(coarse)*(0.8+0.4*wp_noise(coarse*2.0,805u,seed));
   let rims=smoothstep(0.1,0.55,radius);
   height=0.5+(0.28*rims+0.6*wp_fractal(point*0.09,4u,810u,seed)+0.04*wp_fibers(point,12.0,2.0,0.9,0.35,0.0,820u,seed)-0.42)*1.2;
   formation=wp_fractal(point*0.012,4u,830u,seed);inclusions=0.5-0.3*wp_specks(point,60.0,1.2,0.2,840u,seed);
  }
  case 8u: {
   let felt=0.6*wp_fractal(point*0.07,4u,900u,seed)+0.32*wp_noise(point*0.35,910u,seed)+0.04*wp_fibers(point,10.0,2.5,0.9,0.6,0.7,920u,seed);
   let fleck=max(0.6*wp_fibers(wp_displace(point,0.08,10.0,935u,seed),60.0,0.35,0.7,0.2,0.6,940u,seed),wp_specks(point,40.0,1.3,0.35,950u,seed));
   let light=wp_fibers(wp_displace(point,0.08,10.0,955u,seed),70.0,0.4,1.0,0.25,0.5,960u,seed);
   height=0.5+(felt-0.45)*0.7;formation=0.8*wp_fractal(point*vec2<f32>(0.004,0.03),5u,930u,seed)+0.2*wp_fractal(point*0.01,3u,970u,seed);
   inclusions=0.5-0.28*fleck+0.12*light;
  }
  case 9u: {
   let coarse=wp_displace(point,0.03,3.0,995u,seed);
   let bumps=1.0-smoothstep(0.0,0.7,wp_neighbors(coarse/7.0,0.7,1000u,seed).x);
   height=0.5+(0.6*bumps+0.4*wp_fractal(point*0.12,3u,1010u,seed)-0.48)*1.1;
   formation=wp_fractal(point*0.015,3u,1020u,seed);
  }
  default: {
   let coarse=wp_displace(point,0.02,10.0,100u,seed);
   let hills=0.6*wp_hills(coarse/11.0,110u,seed)+0.4*wp_hills(coarse/5.5,115u,seed);
   height=0.5+(0.5*hills+0.38*wp_fractal(coarse*0.09,5u,120u,seed)+0.12*wp_noise(point*0.5,130u,seed)-0.5)*1.3;
   formation=wp_fractal(point*0.012,4u,140u,seed);
  }
 }
 return clamp(vec3<f32>(height,formation,inclusions),vec3<f32>(0.0),vec3<f32>(1.0));
}
// The sheet repeats every period. Across a period's last band the field fades into the one a period earlier, keeping
// its variance, so the edges meet without a seam and the paper background (paper-field.mjs) can be one tile.
fn waterPaperTile(point:vec2<f32>,seedValue:f32,kind:u32)->vec3<f32> {
 let period=${WATER_PAPER_PERIOD.toFixed(1)};let q=point-period*floor(point/period);
 let w=smoothstep(vec2<f32>(period-${WATER_PAPER_BAND.toFixed(1)}),vec2<f32>(period),q);
 var sum=vec3<f32>(0.0);var norm=0.0;
 for(var i=0u;i<4u;i++){
  let shift=vec2<f32>(f32(i&1u),f32(i>>1u));
  let weight=mix(1.0-w.x,w.x,shift.x)*mix(1.0-w.y,w.y,shift.y);
  if(weight<=0.0){continue;}
  sum+=weight*(waterPaperField(q-shift*period,seedValue,kind)-0.5);norm+=weight*weight;
 }
 return clamp(0.5+sum/sqrt(norm),vec3<f32>(0.0),vec3<f32>(1.0));
}
`;
