// SPDX-License-Identifier: AGPL-3.0-only
// All transport reads one material state and writes another; signed absorbance stays signed.
import {COLOR_WGSL} from './water-color.mjs';
import {PAPER_WGSL} from './water-materials.mjs';

const head = `
struct Parameters { v: array<vec4<f32>,16> };
@group(0) @binding(0) var<uniform> u: Parameters;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var nearestSampler: sampler;
@group(0) @binding(3) var t0: texture_2d<f32>;
@group(0) @binding(4) var t1: texture_2d<f32>;
@group(0) @binding(5) var t2: texture_2d<f32>;
@group(0) @binding(6) var t3: texture_2d<f32>;
@group(0) @binding(7) var t4: texture_2d<f32>;
@group(0) @binding(8) var t5: texture_2d<f32>;
@group(0) @binding(9) var t6: texture_2d<f32>;
@group(0) @binding(10) var t7: texture_2d<f32>;
struct Pair { @location(0) a: vec4<f32>, @location(1) b: vec4<f32> };
@vertex fn vertex(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
 let p = array<vec2<f32>,3>(vec2<f32>(-1,-1),vec2<f32>(3,-1),vec2<f32>(-1,3));
 return vec4<f32>(p[i],0,1);
}
// A region pass renders a rectangle of the sheet into scratch: u.v[15].xy is that rectangle's sheet origin.
fn px(p:vec4<f32>) -> vec2<f32> { return p.xy+u.v[15].xy; }
fn uv(p:vec4<f32>) -> vec2<f32> { let q=px(p); return vec2<f32>(q.x/u.v[0].x,1-q.y/u.v[0].y); }
fn loadTexel(image:texture_2d<f32>, coord:vec2<i32>) -> vec4<f32> {
 let last=vec2<i32>(textureDimensions(image))-vec2<i32>(1);
 return textureLoad(image,clamp(coord,vec2<i32>(0),last),0);
}
`;

const manualSample = `
// Reconstruction without a float filter. A phone that cannot filter float textures
// must not invent rows or a one-pixel lattice.
fn sample(image:texture_2d<f32>,p:vec2<f32>) -> vec4<f32> {
 let size=vec2<f32>(textureDimensions(image));
 let xy=vec2<f32>(p.x,1.0-p.y)*size-0.5;
 let origin=vec2<i32>(floor(xy));
 let weight=fract(xy);
 let a=loadTexel(image,origin);
 let b=loadTexel(image,origin+vec2<i32>(1,0));
 let c=loadTexel(image,origin+vec2<i32>(0,1));
 let d=loadTexel(image,origin+vec2<i32>(1,1));
 return mix(mix(a,b,weight.x),mix(c,d,weight.x),weight.y);
}
fn nearest(image:texture_2d<f32>,p:vec2<f32>) -> vec4<f32> {
 let size=vec2<f32>(textureDimensions(image));
 return loadTexel(image,vec2<i32>(floor(vec2<f32>(p.x,1.0-p.y)*size)));
}
`;

const filteredSample = `
fn sample(image:texture_2d<f32>,p:vec2<f32>) -> vec4<f32> {
 return textureSampleLevel(image, linearSampler, vec2<f32>(p.x,1.0-p.y), 0.0);
}
fn nearest(image:texture_2d<f32>,p:vec2<f32>) -> vec4<f32> {
 return textureSampleLevel(image, nearestSampler, vec2<f32>(p.x,1.0-p.y), 0.0);
}
`;

const rest = `
fn cardinal(i:u32, texel:vec2<f32>) -> vec2<f32> {
 let offsets = array<vec2<f32>,4>(vec2<f32>(-1,0),vec2<f32>(1,0),vec2<f32>(0,-1),vec2<f32>(0,1));
 return offsets[i]*texel;
}
fn neighbors(image:texture_2d<f32>,p:vec2<f32>) -> vec4<f32> {
 let h=1.0/u.v[0].zw;
 return vec4<f32>(nearest(image,p+cardinal(0u,h)).r,nearest(image,p+cardinal(1u,h)).r,
                 nearest(image,p+cardinal(2u,h)).r,nearest(image,p+cardinal(3u,h)).r);
}
fn srgb(rgb:vec3<f32>) -> vec3<f32> {
 let c=clamp(rgb,vec3<f32>(0),vec3<f32>(1));
 return select(12.92*c,1.055*pow(c,vec3<f32>(1.0/2.4))-0.055,c>=vec3<f32>(0.0031308));
}
fn brushDistance(p:vec2<f32>) -> vec2<f32> {
 return (p-u.v[4].xy)*vec2<f32>(u.v[0].x/u.v[0].y,1)/u.v[4].z;
}
fn footprint(p:vec2<f32>) -> f32 {
 let d=brushDistance(p); let axis=u.v[5].xy;
 let q=vec2<f32>(dot(d,axis),dot(d,vec2<f32>(-axis.y,axis.x))/u.v[4].w);
 if(any(abs(q)>vec2<f32>(1))) { return 0; }
 let tip=textureSampleLevel(t0,linearSampler,q*0.5+0.5,0).r;
 let wet=1-smoothstep(0.15,1.0,dot(q,q));
 let tooth=smoothstep(u.v[6].x-0.08,u.v[6].x+0.08,sample(t1,p).g);
 return mix(tip,wet,u.v[5].z)*mix(1.0,tooth,u.v[5].w);
}
fn gaussian(p:vec2<f32>) -> f32 { let d=brushDistance(p); return exp(-pow(dot(d,d),u.v[6].z)); }
`;

const fillFront = `
fn fillWeight(p:vec4<f32>,cumulative:bool)->f32 {
 let distance=textureLoad(t0,vec2<i32>(px(p)),0).rg;
 if(distance.x<0){return 0;}
 let height=sample(t1,uv(p)).g;
 let reach=u.v[3].w;let radius=max(0.0,distance.x+(height-0.5)*3.0*reach);
 let ahead=select(0.0,10.0*reach,cumulative);
 var amount=smoothstep(0.0,1.0,clamp((u.v[14].y+ahead-radius)/(24.0*reach),0.0,1.0));
 if(!cumulative){amount-=smoothstep(0.0,1.0,clamp((u.v[14].x-radius)/(24.0*reach),0.0,1.0));}
 if(u.v[14].z>0){amount*=smoothstep(0.0,u.v[14].z,distance.y+0.5);}
 if(!cumulative){amount*=mix(1.0,smoothstep(0.42,0.58,height),0.12);}
 return max(0.0,amount);
}
`;

const body = {
 // The retained output is straight sRGB; a transparent canvas receives premultiplied sRGB.
 present: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { let color=textureLoad(t0,vec2<i32>(p.xy),0);return vec4<f32>(color.rgb*color.a,color.a); }`,
 // A granulating pigment settles into the hollows of the paper and leaves its peaks: its deposit follows the tooth, by as much as
 // the pigment granulates (u.v[6].w), so the same stroke of two pigments shows two textures.
 stampInk: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair { let f=footprint(uv(p))*max(0.0,1.0+u.v[6].w*2.0*(0.5-sample(t1,uv(p)).g));return Pair(u.v[7]*f,u.v[8]*f); }`,
 stampWet: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { return vec4<f32>(u.v[6].y*footprint(uv(p)),0,0,0); }`,
 splatInk: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair { let f=gaussian(uv(p));return Pair(u.v[7]*f,u.v[8]*f); }`,
 splat: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { return u.v[7]*gaussian(uv(p)); }`,
 fillInk: fillFront+`@fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair { let amount=fillWeight(p,false);return Pair(u.v[7]*amount,u.v[8]*amount); }`,
 fillWet: fillFront+`@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { return vec4<f32>(u.v[14].w*fillWeight(p,true),0,0,0); }`,
 liftInk: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair { let f=vec4<f32>(u.v[6].y*gaussian(uv(p))); return Pair(f,f); }`,
 liftWet: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { return vec4<f32>(u.v[6].y*gaussian(uv(p))); }`,
 velocity: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let q=uv(p);let displacement=u.v[1].x*sample(t0,q).xy/u.v[0].zw;
 let v=sample(t0,q-displacement).xy*u.v[2].y*smoothstep(0.005,0.2,sample(t1,q).r);
 return vec4<f32>(v,0,1);
 }`,
 curl: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let q=uv(p);let h=1.0/u.v[0].zw;
 let dx=nearest(t0,q+cardinal(1u,h)).y-nearest(t0,q+cardinal(0u,h)).y;
 let dy=nearest(t0,q+cardinal(3u,h)).x-nearest(t0,q+cardinal(2u,h)).x;
 return vec4<f32>(0.5*(dx-dy),0,0,1);
 }`,
 vorticity: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let q=uv(p);let n=neighbors(t1,q);
 let direction=0.5*vec2<f32>(abs(n.w)-abs(n.z),abs(n.y)-abs(n.x));
 let force=direction/(length(direction)+0.0001)*(4+22*u.v[1].y)*nearest(t1,q).r*vec2<f32>(1,-1);
 return vec4<f32>(clamp(nearest(t0,q).xy+u.v[1].x*force,vec2<f32>(-1000),vec2<f32>(1000)),0,1);
 }`,
 divergence: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let q=uv(p);let h=1.0/u.v[0].zw;
 let dx=nearest(t0,q+cardinal(1u,h)).x-nearest(t0,q+cardinal(0u,h)).x;
 let dy=nearest(t0,q+cardinal(3u,h)).y-nearest(t0,q+cardinal(2u,h)).y;
 return vec4<f32>(0.5*(dx+dy),0,0,1);
 }`,
 pressureDecay: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { return nearest(t0,uv(p))*0.8; }`,
 pressure: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let q=uv(p);return vec4<f32>((dot(neighbors(t0,q),vec4<f32>(1))-nearest(t1,q).r)*0.25,0,0,1);
 }`,
 project: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let q=uv(p);let n=neighbors(t1,q);
 return vec4<f32>(nearest(t0,q).xy-0.5*vec2<f32>(n.y-n.x,n.w-n.z),0,1);
 }`,
 wet: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let origin=uv(p);
 let q=origin-0.6*u.v[1].x*sample(t0,origin).xy/u.v[0].zw;
 let h=vec2<f32>(1.6*u.v[3].w)/u.v[0].xy;
 var sum=0.0;for(var i=0u;i<4u;i++){sum+=sample(t1,q+cardinal(i,h)).r;}
 return vec4<f32>(mix(sample(t1,q).r,0.25*sum,0.12*clamp(u.v[1].x*60.0,0.0,1.0))*u.v[2].x,0,0,1);
 }`,
 bleach: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair {
 let k=vec4<f32>(1-(1-exp(-2.2*sample(t0,uv(p)).a))*u.v[2].z);return Pair(k,k);
 }`,
 fix: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair {
 let q=uv(p);let a=sample(t0,q);let b=sample(t1,q);
 let fraction=u.v[2].z*(1-(1-exp(-2.2*b.a))*u.v[2].z);
 return Pair(a*fraction,vec4<f32>(b.rgb*fraction,0));
 }`,
 pigment: `
 fn mobility(w:f32)->f32{return smoothstep(0.02,0.45,w);}
 fn bounded(v:vec4<f32>)->vec4<f32>{return select(vec4<f32>(0),clamp(v,vec4<f32>(-48),vec4<f32>(48)),v==v);}
 @fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair {
  let q=uv(p);let pix=vec2<i32>(px(p));
  let water=loadTexel(t3,pix).r;let m=mobility(water);
  let a=loadTexel(t1,pix);let b=loadTexel(t2,pix);let keep=u.v[2].w;
  if(m<0.002){return Pair(a*keep,b*keep);}
  let back=q-u.v[1].x*sample(t0,q).xy/u.v[0].zw*m;
  let advectedA=sample(t1,back);let advectedB=sample(t2,back);
  var resultA=mix(a,advectedA,m);var resultB=mix(b,advectedB,m);
  // The step may not create an extreme: what it writes stays within the pigment it drew from (this texel, the one it was carried
  // from, the faces it exchanged with). Advection and exchange together can overshoot, and where the flow is fast the overshoot
  // alternates in sign and grows each frame.
  var lowA=min(a,advectedA);var highA=max(a,advectedA);var lowB=min(b,advectedB);var highB=max(b,advectedB);
  var proximity=0.0;
  if(u.v[3].z>0){let d=(q-u.v[3].xy)*vec2<f32>(u.v[0].x/u.v[0].y,1)/u.v[3].z;proximity=exp(-dot(d,d));}
  // The reference applies bleeding and the drying-edge flow once per 60 Hz display frame. A shorter step applies its
  // share, so a step rate above 60 Hz never bleeds or piles pigment faster; longer steps keep the reference's per-frame cap.
  let pace=clamp(u.v[1].x*60.0,0.0,1.0);
  let diffusion=clamp(u.v[1].z*(0.25+1.3*proximity)*0.3,0.0,0.15)*pace;
  // Bleeding and the drying-edge flow keep the reference texel's reach on a finer sheet. Exchanges stay
  // between whole texels, paired in both directions, so pigment that leaves one texel arrives at another.
  let reach=u.v[3].w;let near=floor(reach);var spread=vec2<f32>(0.0,reach*reach);var carry=vec2<f32>(0.0,reach);
  if(near>=1.0){let far=(reach*reach-near*near)/(2.0*near+1.0);spread=vec2<f32>(1.0-far,far);carry=vec2<f32>(near+1.0-reach,reach-near);}
  for(var j=0u;j<2u;j++){
   let distance=near+f32(j);
   if(distance<1.0||(spread[j]<=0.0&&carry[j]<=0.0)){continue;}
   for(var i=0u;i<4u;i++){
    let step=vec2<i32>(i32(i==1u)-i32(i==0u),i32(i==3u)-i32(i==2u))*i32(distance);
    let nw=loadTexel(t3,pix+step).r;let gate=m*mobility(nw);
    let na=loadTexel(t1,pix+step);let nb=loadTexel(t2,pix+step);
    let drift=carry[j]*clamp(u.v[1].w*(water-nw)*reach/distance,-0.08,0.08)*gate*pace;
    resultA+=spread[j]*diffusion*gate*(na-a)-drift*select(na,a,drift>0);
    resultB+=spread[j]*diffusion*gate*(nb-b)-drift*select(nb,b,drift>0);
    lowA=min(lowA,na);highA=max(highA,na);lowB=min(lowB,nb);highB=max(highB,nb);
   }
  }
  resultA=bounded(clamp(resultA,lowA,highA));resultB=bounded(clamp(resultB,lowB,highB));resultB.a=max(resultB.a,0.0);
  return Pair(resultA*keep,resultB*keep);
 }`,
 mask: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let block=1.0/u.v[0].xy;let origin=uv(p)-0.5*block;var peak=0.0;
 for(var y=0u;y<8u;y++){for(var x=0u;x<8u;x++){
  peak=max(peak,sample(t0,origin+block*(vec2<f32>(f32(x),f32(y))+0.5)/8).r);
 }}
 return vec4<f32>(select(0.0,1.0,peak>0.004),0,0,1);
 }`,
 // Native pixel coordinates keep procedural grain independent of the allocated rectangle.
 paperField: PAPER_WGSL+`override paperKind:u32=0u;
 @fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let point=(vec2<f32>(p.x+u.v[14].x,u.v[14].w-(p.y+u.v[14].y))+u.v[13].xy)*u.v[12].x;
 return vec4<f32>(waterPaperTile(point,u.v[12].y,paperKind),1);
 }`,
 paperLight: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let pixel=vec2<i32>(px(p))-vec2<i32>(u.v[14].xy);let last=vec2<i32>(textureDimensions(t0))-1;
 let field=textureLoad(t0,clamp(pixel,vec2<i32>(0),last),0);
 let dx=textureLoad(t0,clamp(pixel+vec2<i32>(-1,0),vec2<i32>(0),last),0).r-textureLoad(t0,clamp(pixel+vec2<i32>(1,0),vec2<i32>(0),last),0).r;
 let dy=textureLoad(t0,clamp(pixel+vec2<i32>(0,1),vec2<i32>(0),last),0).r-textureLoad(t0,clamp(pixel+vec2<i32>(0,-1),vec2<i32>(0),last),0).r;
 let normal=normalize(vec3<f32>(vec2<f32>(dx,dy)*u.v[12].w,1));let light=normalize(vec3<f32>(-0.5,0.6,0.62));
 let relief=0.5+1.3*(dot(normal,light)-light.z)+0.25*(field.x-0.5);
 return vec4<f32>(clamp(relief,0.0,1.0),field.rgb);
 }`,
 display: COLOR_WGSL+`
 fn density(p:vec2<f32>)->f32{return sample(t0,p).r+sample(t2,p).r;}
 @fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
  let q=uv(p);let flat=u.v[9].w;let paper=mix(sample(t5,q),vec4<f32>(0.5),flat);
  let pixel=vec2<i32>(px(p));let inkB=textureLoad(t1,pixel,0);let a=textureLoad(t0,pixel,0)+textureLoad(t2,pixel,0);let b=inkB+textureLoad(t3,pixel,0);
  // The live view shows wet paper a little darker and cooler, as the reference sheet does; kept pixels never carry it.
  let wetness=select(0.0,smoothstep(0.02,0.7,sample(t4,q).r)*u.v[12].x,u.v[12].x>0.0);
  if(u.v[9].z==2 && wetness<=0.0 && all(a==vec4<f32>(0)) && all(b.rgb==vec3<f32>(0)) && inkB.a==0){return textureLoad(t6,pixel,0);}
  // Edge darkening reads the density gradient across one reference texel.
  let h=u.v[3].w/u.v[0].xy;
  let gradient=vec2<f32>(density(q+vec2<f32>(h.x,0))-density(q-vec2<f32>(h.x,0)),density(q+vec2<f32>(0,h.y))-density(q-vec2<f32>(0,h.y)));
  let edge=min(length(gradient)/(a.x+1.0),1.0);
  let strength=mix((1+u.v[9].x*(0.5-paper.g)*2.2)*(1+u.v[9].y*edge),1.0,flat);
  let transmission=waterColor(a*strength,b*strength);
  let cover=clamp((1-exp(-2.2*inkB.a))*(1+0.5*(paper.g-0.5)),0.0,1.0);
  let white=vec3<f32>(0.96,0.955,0.94)*(1+0.1*(paper.r-0.5)*u.v[10].w);
  if(u.v[9].z==2){
   let t=srgb(transmission);let alpha=1-min(t.x,min(t.y,t.z));
   let premul=(t-vec3<f32>(1-alpha))*(1-cover)+srgb(white)*cover;
   let total=cover+alpha*(1-cover);
   let coat=vec4<f32>(select(vec3<f32>(0),premul/max(total,0.0001),total>0.0001),total);
   let base=sample(t6,q);let layered=coat.a+base.a*(1-coat.a);
   let under=coat.rgb*coat.a+base.rgb*base.a*(1-coat.a);
   if(wetness<=0.0){return vec4<f32>(select(vec3<f32>(0),under/max(layered,0.0001),layered>0.0001),layered);}
   // Wet paper reads darker and cooler: the layer over white takes the reference's factor in linear light, then splits
   // back into colour and alpha. Multiplied over the sheet (the Paper background) it is the reference's product.
   let over=under+vec3<f32>(1-layered);
   let overLinear=select(over/12.92,pow((over+0.055)/1.055,vec3<f32>(2.4)),over>vec3<f32>(0.04045));
   let wet=srgb(overLinear*(vec3<f32>(1)-wetness*vec3<f32>(0.12,0.11,0.08)));
   let wetAlpha=1-min(wet.x,min(wet.y,wet.z));
   return vec4<f32>(select(vec3<f32>(0),(wet-vec3<f32>(1-wetAlpha))/max(wetAlpha,0.0001),wetAlpha>0.0001),wetAlpha);
  }
  let tint=select(u.v[10].xyz,vec3<f32>(1),u.v[9].z==3);
  var backing=tint*(1+u.v[10].w*((paper.r-0.5)*0.32+(paper.b-0.5)*u.v[11].w*2));
  let fleck=(paper.a-0.5)*2*u.v[10].w;
  backing=select(mix(backing,u.v[11].xyz,-fleck),mix(backing,min(tint*1.1+0.02,vec3<f32>(1)),fleck),fleck>=0);
  let base=sample(t6,q);let baseLinear=select(base.rgb/12.92,pow((base.rgb+0.055)/1.055,vec3<f32>(2.4)),base.rgb>vec3<f32>(0.04045));
  backing=mix(backing,baseLinear,base.a);
  var color=mix(transmission*backing,select(white,vec3<f32>(1),u.v[9].z==3),cover);
  let damp=select(smoothstep(0.02,0.7,sample(t4,q).r)*(1-flat),0.0,u.v[9].z==3);
  color*=vec3<f32>(1)-damp*vec3<f32>(0.12,0.11,0.08);
  return vec4<f32>(srgb(color),1);
 }`,
};

export function waterShaderSources(manualFilter){
 const common = head + (manualFilter ? manualSample : filteredSample) + rest;
 return Object.freeze(Object.fromEntries(Object.entries(body).map(([name,source])=>[name,common+source])));
}
