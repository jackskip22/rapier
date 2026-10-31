// SPDX-License-Identifier: AGPL-3.0-only

const immutable = value => {
 if (value && typeof value === 'object') { for (const item of Object.values(value)) immutable(item); Object.freeze(value); }
 return value;
};
import {PAPER_KINDS, PRO_PAPER_KINDS, paperKindById, WATER_PAPER_PERIOD, WATER_PAPER_LEVELS} from './paper-field.mjs';
export {PAPER_KINDS, PRO_PAPER_KINDS};

const brushDefaults = {
 aspect:1,rotation:'fixed',angle:0,angleJitter:0,size:[.011,.05],pressureSize:1,speedThin:0,
 spacing:.3,scatter:0,dabs:1,sizeJitter:0,splay:0,water:1,load:1,flow:1,capacity:1,grain:0,wetRound:.6
};
const profiles = [
 ['round','Round',{}],
 ['detail','Detail',{size:[.0025,.014],pressureSize:.9,water:.7,load:1.15,capacity:.6,spacing:.28,wetRound:.8}],
 ['rigger','Rigger',{size:[.0015,.0065],pressureSize:.7,speedThin:.08,water:.55,load:1.3,capacity:1.8,spacing:.25,wetRound:.9}],
 ['flat','Flat',{aspect:.26,angle:40,angleJitter:1.5,size:[.02,.038],pressureSize:1.4,spacing:.14,water:.8,wetRound:.25}],
 ['hake','Hake',{aspect:.2,rotation:'follow',angle:90,angleJitter:2,size:[.05,.08],pressureSize:1.6,spacing:.1,water:1.6,load:.75,flow:1.2,capacity:2.2,wetRound:.5}],
 ['filbert','Filbert',{aspect:.55,angle:25,angleJitter:2,size:[.012,.036],spacing:.18,wetRound:.5}],
 ['mop','Mop',{size:[.03,.075],pressureSize:.8,spacing:.25,water:1.8,load:.8,flow:1.3,capacity:2.6,wetRound:.7}],
 ['dry','Dry Brush',{aspect:.75,rotation:'follow',angleJitter:8,size:[.012,.036],spacing:.12,splay:.25,water:.2,load:1.1,capacity:.6,grain:.9,wetRound:0}],
 ['fan','Fan',{aspect:.5,rotation:'follow',angle:90,angleJitter:3,size:[.02,.045],pressureSize:1.2,spacing:.1,water:.3,capacity:.8,grain:.5,wetRound:0}],
 ['sponge','Sponge',{rotation:'random',size:[.025,.05],pressureSize:.7,spacing:.55,scatter:.3,sizeJitter:.3,water:.5,load:.9,capacity:1.2,grain:.45,wetRound:.1}],
 ['spatter','Spatter',{rotation:'random',size:[.003,.008],pressureSize:.8,spacing:4.5,scatter:10,dabs:5,sizeJitter:.75,water:1.3,load:1.1,capacity:1.5,wetRound:0}],
 ['sumi','Sumi',{size:[.002,.052],pressureSize:1.3,speedThin:.12,spacing:.22,water:.8,load:1.3,capacity:1.2,wetRound:.75}],
 ['dagger','Dagger',{aspect:.38,angle:55,angleJitter:1,size:[.006,.03],pressureSize:1.1,speedThin:.06,spacing:.15,load:1.1,capacity:1.4,wetRound:.3}],
 ['stipple','Stipple',{rotation:'random',size:[.015,.035],pressureSize:.8,spacing:.7,scatter:.2,sizeJitter:.2,water:.35,load:1.1,grain:.3,wetRound:0}]
];
export const BRUSHES = immutable(profiles.map(([shape,name,changes])=>({id:`water/${shape}`,name,shape,params:{...brushDefaults,...changes}})));
export const CUSTOM_PARAMS = immutable({...brushDefaults,rotation:'follow',angleJitter:4,spacing:.2,wetRound:.4});
export const getPaper = paperKindById;
export const getBrush = id => BRUSHES.find(b=>b.id===id)||null;
const unit = x => Math.max(0,Math.min(1,x));
const ramp = (x,low,high) => {const t=unit((x-low)/(high-low));return t*t*(3-2*t);};
const disc = (distance,core) => 1-ramp(distance,core,1);

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
  const value=Math.round(255*unit(Math.fround(unit(sample(x,y,Math.hypot(x,y),Math.atan2(y,x))))));
  rgba[pixel*4]=rgba[pixel*4+1]=rgba[pixel*4+2]=value;rgba[pixel*4+3]=255;sum+=value;
 }
 return {width:size,height:size,rgba,mean:Math.max(.01,sum/(255*size*size))};
}

export const PAPER_WGSL = `
const wp_period=${WATER_PAPER_PERIOD.toFixed(1)};
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
fn wp_wrap(cell:vec2<f32>,n:vec2<f32>)->vec2<f32>{return cell-n*floor(cell/n);}
fn wp_noise(point:vec2<f32>,n:vec2<f32>,stream:u32,seed:u32)->f32 {
 let p=point*n/wp_period;let cell=floor(p);let fraction=p-cell;
 let weight=fraction*fraction*(3.0-2.0*fraction);
 let c0=wp_wrap(cell,n);let c1=wp_wrap(cell+1.0,n);
 let lower=mix(wp_hash(c0,stream,seed),wp_hash(vec2<f32>(c1.x,c0.y),stream,seed),weight.x);
 let upper=mix(wp_hash(vec2<f32>(c0.x,c1.y),stream,seed),wp_hash(c1,stream,seed),weight.x);
 return mix(lower,upper,weight.y);
}
fn wp_fractal(point:vec2<f32>,n:vec2<f32>,octaves:u32,stream:u32,seed:u32)->f32 {
 var sum=0.0;var scale=0.5;var total=0.0;var cells=n;
 for(var octave=0u;octave<octaves;octave++) {
  sum+=scale*wp_noise(point+vec2<f32>(37.3,19.7)*f32(octave),cells,stream+13u*octave,seed);total+=scale;scale*=0.5;cells*=2.0;
 }
 return sum/total;
}
fn wp_displace(point:vec2<f32>,n:f32,amplitude:f32,stream:u32,seed:u32)->vec2<f32> {
 let offset=vec2<f32>(wp_fractal(point,vec2<f32>(n),3u,stream,seed),wp_fractal(point,vec2<f32>(n),3u,stream+50u,seed));
 return point+(offset-0.5)*amplitude;
}
fn wp_cells(point:vec2<f32>,n:f32,jitter:f32,stream:u32,seed:u32)->f32 {
 let p=point*n/wp_period;let cell=floor(p);let local=p-cell;var nearest=9.0;
 for(var y:i32=-1;y<=1;y++) {for(var x:i32=-1;x<=1;x++) {
  let offset=vec2<f32>(f32(x),f32(y));let identity=wp_wrap(cell+offset,vec2<f32>(n));
  nearest=min(nearest,length(offset+0.5+(wp_pair(identity,stream,seed)-0.5)*jitter-local));
 }}
 return nearest;
}
fn wp_hills(point:vec2<f32>,n:f32,stream:u32,seed:u32)->f32 {
 let p=point*n/wp_period;let cell=floor(p);let local=p-cell;var sum=0.0;
 for(var y:i32=-1;y<=1;y++){for(var x:i32=-1;x<=1;x++){
  let offset=vec2<f32>(f32(x),f32(y));let identity=wp_wrap(cell+offset,vec2<f32>(n));
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
fn wp_fibers(point:vec2<f32>,n:f32,span:f32,width:f32,density:f32,alignment:f32,stream:u32,seed:u32)->f32 {
 let pitch=wp_period/n;let p=point/pitch;let grid=floor(p);var coverage=0.0;
 for(var y:i32=-2;y<=2;y++){for(var x:i32=-2;x<=2;x++){for(var fiber=0u;fiber<2u;fiber++){
  let cell=grid+vec2<f32>(f32(x),f32(y));let identity=wp_wrap(cell,vec2<f32>(n));let lane=stream+31u*fiber;
  let origin=wp_pair(identity,lane,seed);let choice=wp_pair(identity,lane+2u,seed);
  if(choice.y<density){
   let angle=(choice.x-0.5)*3.14159265*(1.0-alignment);
   let radius=span*(0.35+0.65*wp_hash(identity,lane+4u,seed))*0.5;
   let endpoint=vec2<f32>(cos(angle),sin(angle))*radius;
   let distance=wp_segment(p,cell+origin-endpoint,cell+origin+endpoint)*pitch;
   coverage=max(coverage,(1.0-smoothstep(width*0.5,width*0.5+0.9,distance))*(0.55+0.45*wp_hash(identity,lane+5u,seed)));
  }
 }}}
 return coverage;
}
fn wp_specks(point:vec2<f32>,n:f32,radius:f32,density:f32,stream:u32,seed:u32)->f32 {
 let pitch=wp_period/n;let cell=floor(point/pitch);let local=point/pitch-cell;var coverage=0.0;
 for(var y:i32=-1;y<=1;y++){for(var x:i32=-1;x<=1;x++){
  let offset=vec2<f32>(f32(x),f32(y));let identity=wp_wrap(cell+offset,vec2<f32>(n));
  if(wp_hash(identity,stream+2u,seed)<density){
   let size=radius*(0.4+0.6*wp_hash(identity,stream+3u,seed));
   let distance=length(offset+wp_pair(identity,stream,seed)-local)*pitch;
   coverage=max(coverage,1.0-smoothstep(0.6*size,size+0.6,distance));
  }
 }}
 return coverage;
}
fn wp_ragged(point:vec2<f32>,n:f32,radius:f32,density:f32,stream:u32,seed:u32)->f32 {
 return wp_specks(wp_displace(point,160.0,3.0,stream+7u,seed),n,radius,density,stream,seed);
}
fn wp_repeat(point:vec2<f32>,period:vec2<f32>)->vec2<f32>{return point-period*floor(point/period);}
fn wp_hexagonal(point:vec2<f32>)->f32 {
 let period=vec2<f32>(1.0,1.7320508);
 let first=wp_repeat(point,period)-0.5*period;
 let second=wp_repeat(point-0.5*period,period)-0.5*period;
 return min(length(first),length(second));
}
fn wp_thread(t:f32,width:f32)->f32{let r=2.0*t/width;return sqrt(max(0.0,1.0-r*r));}
// The raw height, formation and inclusions at a point of one period (paper-field.mjs paperRaw notes each paper's sizes).
fn waterPaperRaw(point:vec2<f32>,seed:u32,kind:u32)->vec3<f32> {
 var raw=0.5;var formation=0.5;var inclusions=0.5;let x=point.x;let y=point.y;
 switch kind {
  case 1u: {
   let fiber=wp_fibers(point,90.0,1.4,0.45,0.35,0.0,220u,seed);
   raw=0.55*wp_fractal(point,vec2<f32>(160.0),3u,200u,seed)+0.3*wp_noise(point,vec2<f32>(560.0),210u,seed)+0.15*fiber;
   formation=wp_fractal(point,vec2<f32>(9.0),4u,230u,seed);
  }
  case 2u: {
   let c=wp_displace(point,10.0,16.0,300u,seed);let large=smoothstep(0.3,0.7,wp_fractal(point,vec2<f32>(6.0),3u,305u,seed));
   let h=wp_hills(c,36.0,310u,seed)*(0.35+0.4*large)+wp_hills(c,70.0,315u,seed)*(0.45-0.25*large);
   raw=0.65*h+0.25*wp_fractal(c,vec2<f32>(44.0),5u,320u,seed)+0.1*wp_noise(point,vec2<f32>(300.0),325u,seed);
   formation=wp_fractal(point,vec2<f32>(10.0),4u,330u,seed);
  }
  case 3u: {
   let c=wp_displace(point,8.0,40.0,400u,seed);let knobs=1.0-smoothstep(0.0,0.9,wp_cells(c,26.0,1.0,420u,seed));
   let fiber=wp_fibers(wp_displace(point,40.0,6.0,430u,seed),50.0,2.2,0.9,0.6,0.0,440u,seed);
   let fleck=max(wp_ragged(point,14.0,1.8,0.35,460u,seed),0.7*wp_fibers(wp_displace(point,30.0,8.0,465u,seed),10.0,0.25,0.8,0.35,0.0,470u,seed));
   raw=0.45*wp_fractal(c,vec2<f32>(18.0),5u,410u,seed)+0.33*knobs+0.14*wp_fractal(point,vec2<f32>(110.0),3u,450u,seed)+0.015*fiber;
   formation=0.7*wp_fractal(point,vec2<f32>(5.0),4u,480u,seed)+0.1*fiber;inclusions=0.5-0.4*fleck+0.02*fiber;
  }
  case 4u: {
   let longFiber=wp_fibers(wp_displace(point,20.0,24.0,500u,seed),14.0,1.7,0.8,0.75,0.0,510u,seed)*(0.6+0.4*wp_noise(point,vec2<f32>(12.0),512u,seed));
   let fine=wp_fibers(wp_displace(point,40.0,8.0,515u,seed),40.0,1.8,0.5,0.6,0.0,520u,seed);
   raw=0.8*wp_fractal(point,vec2<f32>(30.0),4u,530u,seed)+0.1*longFiber+0.04*fine;
   formation=0.7*wp_fractal(point,vec2<f32>(6.0),5u,540u,seed)+0.3*max(longFiber,0.6*fine);
   inclusions=0.5+0.2*longFiber+0.07*fine-0.35*wp_ragged(point,10.0,1.1,0.3,550u,seed);
  }
  case 5u: {
   let wobble=(wp_fractal(point,vec2<f32>(4.0,20.0),3u,600u,seed)-0.5)*2.5;
   let laid=pow(0.5+0.5*cos(2.0*3.14159265*(y+wobble)*100.0/wp_period),2.0);
   let across=(x+(wp_fractal(point,vec2<f32>(20.0,4.0),3u,610u,seed)-0.5)*4.0)*4.0/wp_period;
   let distance=abs(fract(across)-0.5)*wp_period/4.0;let chain=1.0-smoothstep(1.0,3.0,distance);
   raw=0.12*laid+0.08*chain+0.6*wp_fractal(point,vec2<f32>(100.0),4u,620u,seed);
   formation=0.5-0.2*exp(-distance/10.0)-0.07*laid+(wp_fractal(point,vec2<f32>(10.0),3u,630u,seed)-0.5)*0.6;
   inclusions=0.5-0.14*wp_fibers(wp_displace(point,30.0,6.0,645u,seed),16.0,0.3,0.6,0.2,0.0,640u,seed);
  }
  case 6u: {
   let q=wp_displace(point,24.0,2.0,700u,seed);let u=q*160.0/wp_period;let slot=floor(u);let t=u-slot-0.5;
   let warpWidth=0.68+0.32*wp_noise(vec2<f32>(slot.x*wp_period/160.0,q.y),vec2<f32>(160.0,16.0),702u,seed);
   let weftWidth=0.68+0.32*wp_noise(vec2<f32>(q.x,slot.y*wp_period/160.0),vec2<f32>(16.0,160.0),704u,seed);
   let warpLift=0.78+0.44*wp_hash(vec2<f32>(wp_wrap(slot,vec2<f32>(160.0)).x,0.0),709u,seed);let weftLift=0.78+0.44*wp_hash(vec2<f32>(0.0,wp_wrap(slot,vec2<f32>(160.0)).y),710u,seed);
   let warp=warpLift*wp_thread(t.x,warpWidth)*(0.55+0.45*cos(3.14159265*(u.y-0.5-slot.x)))*(1.0+0.08*cos(2.0*3.14159265*(3.0*u.y+2.0*t.x)));
   let weft=weftLift*wp_thread(t.y,weftWidth)*(0.55-0.45*cos(3.14159265*(u.x-0.5-slot.y)))*(1.0+0.08*cos(2.0*3.14159265*(3.0*u.x+2.0*t.y)));
   raw=0.78*max(max(warp,weft),0.32)+0.14*wp_fractal(point,vec2<f32>(60.0),3u,706u,seed)+0.08*wp_noise(point,vec2<f32>(500.0),707u,seed);
   formation=wp_fractal(point,vec2<f32>(8.0),3u,708u,seed);
  }
  case 7u: {
   let d=wp_displace(point,40.0,4.0,800u,seed);
   let radius=wp_hexagonal(vec2<f32>(d.x*110.0,d.y*64.0*1.7320508)/wp_period)*(0.85+0.3*wp_noise(point,vec2<f32>(110.0),805u,seed));let rims=smoothstep(0.12,0.55,radius);
   raw=0.3*rims+0.58*wp_fractal(point,vec2<f32>(80.0),4u,810u,seed)+0.05*wp_fibers(point,60.0,1.6,0.6,0.35,0.0,820u,seed);
   formation=wp_fractal(point,vec2<f32>(10.0),4u,830u,seed);
   inclusions=0.5-0.3*wp_ragged(point,24.0,1.1,0.25,840u,seed)+0.12*wp_fibers(wp_displace(point,30.0,6.0,845u,seed),14.0,0.35,0.7,0.3,0.0,850u,seed);
  }
  case 8u: {
   let shive=max(0.7*wp_fibers(wp_displace(point,30.0,6.0,935u,seed),18.0,0.35,0.7,0.25,0.6,940u,seed),wp_ragged(point,30.0,1.2,0.15,950u,seed));
   let light=wp_fibers(wp_displace(point,30.0,6.0,955u,seed),16.0,0.4,0.9,0.3,0.5,960u,seed);
   raw=0.6*wp_fractal(point,vec2<f32>(60.0),4u,900u,seed)+0.3*wp_noise(point,vec2<f32>(240.0),910u,seed)+0.06*wp_fibers(point,120.0,2.0,0.5,0.6,0.7,920u,seed);
   formation=0.75*wp_fractal(point,vec2<f32>(4.0,32.0),5u,930u,seed)+0.25*wp_fractal(point,vec2<f32>(12.0),3u,970u,seed);
   inclusions=0.5-0.3*shive+0.12*light;
  }
  case 9u: {
   let bumps=1.0-smoothstep(0.0,0.7,wp_cells(wp_displace(point,30.0,2.0,995u,seed),100.0,0.85,1000u,seed));
   raw=0.62*bumps+0.3*wp_fractal(point,vec2<f32>(150.0),3u,1010u,seed)+0.08*wp_noise(point,vec2<f32>(500.0),1015u,seed);
   formation=wp_fractal(point,vec2<f32>(14.0),3u,1020u,seed);
  }
  case 10u: {
   raw=0.6*wp_noise(point,vec2<f32>(520.0),1100u,seed)+0.4*wp_fractal(point,vec2<f32>(110.0),3u,1108u,seed);
   formation=0.5+(wp_fractal(point,vec2<f32>(10.0),3u,1116u,seed)-0.5)*0.55;
  }
  case 11u: {
   let c=wp_displace(point,12.0,14.0,1200u,seed);let basins=1.0-smoothstep(0.08,0.85,wp_cells(c,28.0,1.0,1210u,seed));
   raw=0.55*basins+0.25*wp_hills(c,60.0,1225u,seed)+0.2*wp_fractal(c,vec2<f32>(40.0),4u,1220u,seed)+0.08*wp_noise(point,vec2<f32>(300.0),1230u,seed);
   formation=wp_fractal(point,vec2<f32>(9.0),3u,1240u,seed);
  }
  case 12u: {
   let fiber=wp_fibers(point,30.0,1.6,0.55,0.35,0.15,1300u,seed);
   raw=0.7*wp_fractal(point,vec2<f32>(110.0),4u,1310u,seed)+0.22*wp_noise(point,vec2<f32>(320.0),1320u,seed)+0.06*fiber;
   formation=wp_fractal(point,vec2<f32>(10.0),3u,1330u,seed);inclusions=0.5+0.12*fiber-0.25*wp_ragged(point,22.0,1.1,0.2,1340u,seed);
  }
  case 13u: {
   let c=wp_displace(point,10.0,30.0,1400u,seed);
   let longFiber=wp_fibers(c,20.0,1.6,0.9,0.6,0.08,1410u,seed);let fine=wp_fibers(point,50.0,2.0,0.55,0.45,0.0,1420u,seed);
   let lumps=1.0-smoothstep(0.0,0.9,wp_cells(c,34.0,1.0,1435u,seed));
   raw=0.45*wp_fractal(c,vec2<f32>(16.0),4u,1430u,seed)+0.2*lumps+0.22*wp_fractal(point,vec2<f32>(90.0),3u,1440u,seed)+0.08*longFiber+0.04*fine;
   formation=0.75*wp_fractal(c,vec2<f32>(6.0),4u,1450u,seed)+0.25*longFiber;
   inclusions=0.5+0.12*longFiber-0.35*wp_ragged(point,12.0,1.6,0.28,1460u,seed);
  }
  default: {
   let c=wp_displace(point,20.0,6.0,100u,seed);
   let felt=0.6*wp_hills(c,80.0,110u,seed)+0.4*wp_hills(c,140.0,115u,seed);
   raw=0.55*felt+0.3*wp_fractal(c,vec2<f32>(48.0),4u,120u,seed)+0.07*wp_noise(point,vec2<f32>(520.0),130u,seed);
   formation=wp_fractal(point,vec2<f32>(10.0),4u,140u,seed);
  }
 }
 return vec3<f32>(raw,formation,inclusions);
}
// Height, formation and inclusions: every lattice has a whole number of cells in a period, so the sheet repeats without a
// seam and the paper background (paper-field.mjs, paperTiled) can be one tile.
fn waterPaperTile(point:vec2<f32>,seedValue:f32,kind:u32)->vec3<f32> {
 var levels=array<vec2<f32>,${WATER_PAPER_LEVELS.length}>(${WATER_PAPER_LEVELS.map(([c,g])=>'vec2<f32>('+c.toFixed(3)+','+g.toFixed(3)+')').join(',')});
 let known=select(0u,kind,kind<${WATER_PAPER_LEVELS.length}u);let level=levels[known];
 let field=waterPaperRaw(wp_repeat(point,vec2<f32>(wp_period)),u32(seedValue*7919.0),known);
 return clamp(vec3<f32>(0.5+(field.x-level.x)*level.y,field.y,field.z),vec3<f32>(0.0),vec3<f32>(1.0));
}
`;
