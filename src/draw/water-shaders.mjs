// SPDX-License-Identifier: AGPL-3.0-only
// All transport reads one material state and writes another; signed absorbance stays signed.
import {COLOR_WGSL} from './water-color.mjs';
import {PAPER_WGSL} from './water-materials.mjs';

const common = `
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
fn uv(p:vec4<f32>) -> vec2<f32> { return vec2<f32>(p.x/u.v[0].x,1-p.y/u.v[0].y); }
fn sample(image:texture_2d<f32>,p:vec2<f32>) -> vec4<f32> {
 return textureSampleLevel(image,linearSampler,vec2<f32>(p.x,1-p.y),0);
}
fn nearest(image:texture_2d<f32>,p:vec2<f32>) -> vec4<f32> {
 return textureSampleLevel(image,nearestSampler,vec2<f32>(p.x,1-p.y),0);
}
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
 let distance=textureLoad(t0,vec2<i32>(p.xy),0).rg;
 if(distance.x<0){return 0;}
 let height=sample(t1,uv(p)).g;
 let radius=max(0.0,distance.x+(height-0.5)*3.0);
 let ahead=select(0.0,10.0,cumulative);
 var amount=smoothstep(0.0,1.0,clamp((u.v[14].y+ahead-radius)/24.0,0.0,1.0));
 if(!cumulative){amount-=smoothstep(0.0,1.0,clamp((u.v[14].x-radius)/24.0,0.0,1.0));}
 if(u.v[14].z>0){amount*=smoothstep(0.0,u.v[14].z,distance.y+0.5);}
 if(!cumulative){amount*=mix(1.0,smoothstep(0.42,0.58,height),0.12);}
 return max(0.0,amount);
}
`;

const body = {
 // The retained output is straight sRGB; a transparent canvas receives premultiplied sRGB.
 present: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { let color=textureLoad(t0,vec2<i32>(p.xy),0);return vec4<f32>(color.rgb*color.a,color.a); }`,
 stampInk: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair { let f=footprint(uv(p));return Pair(u.v[7]*f,u.v[8]*f); }`,
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
 let dx=sample(t0,q+cardinal(1u,h)).y-sample(t0,q+cardinal(0u,h)).y;
 let dy=sample(t0,q+cardinal(3u,h)).x-sample(t0,q+cardinal(2u,h)).x;
 return vec4<f32>(0.5*(dx-dy),0,0,1);
 }`,
 vorticity: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let q=uv(p);let n=neighbors(t1,q);
 let direction=0.5*vec2<f32>(abs(n.w)-abs(n.z),abs(n.y)-abs(n.x));
 let force=direction/(length(direction)+0.0001)*(4+22*u.v[1].y)*nearest(t1,q).r*vec2<f32>(1,-1);
 return vec4<f32>(clamp(sample(t0,q).xy+u.v[1].x*force,vec2<f32>(-1000),vec2<f32>(1000)),0,1);
 }`,
 divergence: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let q=uv(p);let h=1.0/u.v[0].zw;
 let dx=sample(t0,q+cardinal(1u,h)).x-sample(t0,q+cardinal(0u,h)).x;
 let dy=sample(t0,q+cardinal(3u,h)).y-sample(t0,q+cardinal(2u,h)).y;
 return vec4<f32>(0.5*(dx+dy),0,0,1);
 }`,
 pressureDecay: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { return nearest(t0,uv(p))*0.8; }`,
 pressure: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let q=uv(p);return vec4<f32>((dot(neighbors(t0,q),vec4<f32>(1))-nearest(t1,q).r)*0.25,0,0,1);
 }`,
 project: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let q=uv(p);let n=neighbors(t1,q);
 return vec4<f32>(sample(t0,q).xy-0.5*vec2<f32>(n.y-n.x,n.w-n.z),0,1);
 }`,
 wet: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let q=uv(p)-0.6*u.v[1].x*sample(t0,uv(p)).xy/u.v[0].zw;
 let h=vec2<f32>(1.6)/u.v[0].xy;
 var sum=0.0;for(var i=0u;i<4u;i++){sum+=sample(t1,q+cardinal(i,h)).r;}
 return vec4<f32>(mix(sample(t1,q).r,0.25*sum,0.12)*u.v[2].x,0,0,1);
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
 @fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair {
  let q=uv(p);let water=sample(t3,q).r;let m=mobility(water);
  let a=sample(t1,q);let b=sample(t2,q);let keep=u.v[2].w;
  if(m<0.002){return Pair(a*keep,b*keep);}
  let back=q-u.v[1].x*sample(t0,q).xy/u.v[0].zw*m;
  var resultA=mix(a,sample(t1,back),m);var resultB=mix(b,sample(t2,back),m);
  var proximity=0.0;
  if(u.v[3].z>0){let d=(q-u.v[3].xy)*vec2<f32>(u.v[0].x/u.v[0].y,1)/u.v[3].z;proximity=exp(-dot(d,d));}
  let diffusion=clamp(u.v[1].z*(0.25+1.3*proximity)*0.3,0.0,0.15);
  for(var i=0u;i<4u;i++){
   let neighbor=q+cardinal(i,1.0/u.v[0].xy);let w=sample(t3,neighbor).r;let gate=m*mobility(w);
   let na=sample(t1,neighbor);let nb=sample(t2,neighbor);
   let drift=clamp(u.v[1].w*(water-w),-0.08,0.08)*gate;
   resultA+=diffusion*gate*(na-a)-drift*select(na,a,drift>0);
   resultB+=diffusion*gate*(nb-b)-drift*select(nb,b,drift>0);
  }
  return Pair(resultA*keep,vec4<f32>(resultB.rgb,max(0.0,resultB.a))*keep);
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
 return vec4<f32>(clamp(waterPaperField(point,u.v[12].y,paperKind),vec3<f32>(0),vec3<f32>(1)),1);
 }`,
 paperLight: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let pixel=vec2<i32>(p.xy)-vec2<i32>(u.v[14].xy);let last=vec2<i32>(textureDimensions(t0))-1;
 let field=textureLoad(t0,clamp(pixel,vec2<i32>(0),last),0);
 let dx=textureLoad(t0,clamp(pixel+vec2<i32>(-1,0),vec2<i32>(0),last),0).r-textureLoad(t0,clamp(pixel+vec2<i32>(1,0),vec2<i32>(0),last),0).r;
 let dy=textureLoad(t0,clamp(pixel+vec2<i32>(0,1),vec2<i32>(0),last),0).r-textureLoad(t0,clamp(pixel+vec2<i32>(0,-1),vec2<i32>(0),last),0).r;
 let normal=normalize(vec3<f32>(vec2<f32>(dx,dy)*u.v[12].w,1));let light=normalize(vec3<f32>(-0.5,0.6,0.62));
 let relief=0.5+1.3*(dot(normal,light)-light.z)+0.25*(field.x-0.5);
 return vec4<f32>(clamp(relief,0.0,1.0),field.rgb);
 }`,
 display: COLOR_WGSL+`
 fn density(q:vec2<f32>)->f32{return sample(t0,q).r+sample(t2,q).r;}
 @fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
  let q=uv(p);let flat=u.v[9].w;let paper=mix(sample(t5,q),vec4<f32>(0.5),flat);
  let pixel=vec2<i32>(p.xy);let inkB=textureLoad(t1,pixel,0);let a=textureLoad(t0,pixel,0)+textureLoad(t2,pixel,0);let b=inkB+textureLoad(t3,pixel,0);
  if(u.v[9].z==2 && all(a==vec4<f32>(0)) && all(b.rgb==vec3<f32>(0)) && inkB.a==0){return textureLoad(t6,vec2<i32>(p.xy),0);}
  let h=1.0/u.v[0].xy;
  let gradient=vec2<f32>(density(q+cardinal(1u,h))-density(q+cardinal(0u,h)),density(q+cardinal(3u,h))-density(q+cardinal(2u,h)));
  let edge=min(length(gradient)/(a.x+1),1.0);
  let strength=mix((1+u.v[9].x*(0.5-paper.g)*2.2)*(1+u.v[9].y*edge),1.0,flat);
  let transmission=waterColor(a*strength,b*strength);
  let cover=clamp((1-exp(-2.2*inkB.a))*(1+0.5*(paper.g-0.5)),0.0,1.0);
  let white=vec3<f32>(0.96,0.955,0.94)*(1+0.1*(paper.r-0.5)*u.v[10].w);
  if(u.v[9].z==2){
   let t=srgb(transmission);let alpha=1-min(t.x,min(t.y,t.z));
   let premul=(t-vec3<f32>(1-alpha))*(1-cover)+srgb(white)*cover;
   let total=cover+alpha*(1-cover);
   let coat=vec4<f32>(select(vec3<f32>(0),premul/max(total,0.0001),total>0.0001),total);
   let base=sample(t6,q);let resultAlpha=coat.a+base.a*(1-coat.a);
   let result=coat.rgb*coat.a+base.rgb*base.a*(1-coat.a);
   return vec4<f32>(select(vec3<f32>(0),result/max(resultAlpha,0.0001),resultAlpha>0.0001),resultAlpha);
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

export const WATER_SHADER_SOURCES = Object.freeze(Object.fromEntries(Object.entries(body).map(([name,source])=>[name,common+source])));
