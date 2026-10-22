// SPDX-License-Identifier: AGPL-3.0-only
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
// Reconstruction in f32 on every GPU. A sampler's filter weighs texels at the hardware's own sub-texel precision, so a
// journal would replay to different pixels with and without one; a phone that cannot filter float textures must not
// invent rows or a one-pixel lattice.
fn sample(image:texture_2d<f32>,p:vec2<f32>) -> vec4<f32> {
 let size=vec2<f32>(textureDimensions(image));
 let xy=vec2<f32>(p.x,1.0-p.y)*size-0.5;
 let origin=vec2<i32>(floor(xy));
 let weight=fract(xy);
 let a=loadTexel(image,origin);
 var top=a;
 if(weight.x!=0.0){top=mix(a,loadTexel(image,origin+vec2<i32>(1,0)),weight.x);}
 if(weight.y==0.0){return top;}
 var bottom=loadTexel(image,origin+vec2<i32>(0,1));
 if(weight.x!=0.0){bottom=mix(bottom,loadTexel(image,origin+vec2<i32>(1,1)),weight.x);}
 return mix(top,bottom,weight.y);
}
fn nearest(image:texture_2d<f32>,p:vec2<f32>) -> vec4<f32> {
 let size=vec2<f32>(textureDimensions(image));
 return loadTexel(image,vec2<i32>(floor(vec2<f32>(p.x,1.0-p.y)*size)));
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
 return (p-u.v[4].xy)*vec2<f32>(u.v[0].x/u.v[0].y,1);
}
fn footprint(p:vec2<f32>) -> f32 {
 let d=brushDistance(p); let axis=u.v[5].xy;
 var q=vec2<f32>(dot(d,axis),dot(d,vec2<f32>(-axis.y,axis.x)))/u.v[4].z;
 q.y/=u.v[4].w;
 if(any(abs(q)>vec2<f32>(1))) { return 0; }
 let tip=textureSampleLevel(t0,linearSampler,q*0.5+0.5,0).r;
 let wet=1-smoothstep(0.15,1.0,dot(q,q));
 let height=sample(t1,p).g;let tooth=smoothstep(u.v[6].x-0.08,u.v[6].x+0.08,height);
 let contact=mix(tip,wet,u.v[5].z)*mix(1.0,tooth,u.v[5].w);
 // A nearly dry brush (grain above 0.6: Dry Brush, and Fan, Sponge or Stipple running out) also catches on the tooth's own
 // peaks (the paper's fine relief, nudged by the bristle streaks): a light sparkle where the bristles are full, a broken edge
 // where they thin out (J95b). Wet brushes never reach 0.6 and keep this contact exactly.
 if(u.v[5].w<=0.6){return contact;}
 let o=3.0/u.v[0].xy;let local=0.25*(sample(t1,p+vec2<f32>(o.x,0)).g+sample(t1,p-vec2<f32>(o.x,0)).g+sample(t1,p+vec2<f32>(0,o.y)).g+sample(t1,p-vec2<f32>(0,o.y)).g);
 let fine=smoothstep(-0.03,0.03,(height-local)+0.12*(tip-0.5)+(0.5-u.v[6].x)*0.15);
 let rim=1.0-smoothstep(0.2,0.65,tip);
 return mix(contact,contact*mix(1.0,fine,0.3+0.6*rim),smoothstep(0.6,0.9,u.v[5].w));
}
fn gaussian(p:vec2<f32>) -> f32 { let d=brushDistance(p); return exp(-pow(dot(d,d)/(u.v[4].z*u.v[4].z),u.v[6].z)); }
// Full erasure clears the contact's centre, with one native pixel of antialiasing at its edge.
// The same passes still carry Water Lift's gradual pigment removal when the erase flag is absent.
fn liftAmount(p:vec2<f32>) -> f32 {
 if(u.v[6].w>0) {
  let radius=u.v[4].z*u.v[0].y;
  return 1.0-smoothstep(radius-0.5,radius+0.5,length((p-u.v[4].xy)*u.v[0].xy));
 }
 return u.v[6].y*gaussian(p);
}
fn mineralCapture(p:vec2<f32>)->f32 {
 if(u.v[13].z<=0.0){return 0.0;}
 let valley=1.0-smoothstep(0.2,0.8,sample(t1,p).g);
 return clamp(u.v[13].z*(0.15+0.85*valley),0.0,0.95);
}
fn mineralPhase(p:vec2<f32>)->f32 {
 let capture=mineralCapture(p);return select(1.0-capture,capture,u.v[13].w>0.0);
}
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
 present: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { let color=textureLoad(t0,vec2<i32>(p.xy),0);return vec4<f32>(color.rgb*color.a,color.a); }`,
 stampInk: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair { let q=uv(p);let contact=footprint(q)*max(0.0,1.0+u.v[6].w*2.0*(0.5-sample(t1,q).g));let f=contact*mineralPhase(q);return Pair(u.v[7]*f,vec4<f32>(u.v[8].rgb*f,u.v[8].a*contact)); }`,
 stampWet: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { return vec4<f32>(u.v[6].y*footprint(uv(p)),0,0,0); }`,
 splatInk: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair { let q=uv(p);let contact=gaussian(q);let f=contact*mineralPhase(q);return Pair(u.v[7]*f,vec4<f32>(u.v[8].rgb*f,u.v[8].a*contact)); }`,
 splat: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { return u.v[7]*gaussian(uv(p)); }`,
 fillInk: fillFront+`@fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair { let contact=fillWeight(p,false);let amount=contact*mineralPhase(uv(p));return Pair(u.v[7]*amount,vec4<f32>(u.v[8].rgb*amount,u.v[8].a*contact)); }`,
 stampFinish: `@fragment fn fragment(@builtin(position) p:vec4<f32>)->@location(0) vec4<f32>{let q=uv(p);var f=footprint(q);if(u.v[13].w>0.0){f=gaussian(q);}return u.v[7]*f*(0.6+0.4*sample(t1,q).g);}`,
 fillFinish: fillFront+`@fragment fn fragment(@builtin(position) p:vec4<f32>)->@location(0) vec4<f32>{return u.v[7]*fillWeight(p,false)*(0.6+0.4*sample(t1,uv(p)).g);}`,
 fillWet: fillFront+`@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { return vec4<f32>(u.v[14].w*fillWeight(p,true),0,0,0); }`,
 liftInk: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair { let f=vec4<f32>(liftAmount(uv(p))); return Pair(f,f); }`,
 liftWet: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> { return vec4<f32>(liftAmount(uv(p))); }`,
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
 let h=vec2<f32>(1.6*u.v[3].w*u.v[12].x)/u.v[0].xy;
 var sum=0.0;for(var i=0u;i<4u;i++){sum+=sample(t1,q+cardinal(i,h)).r;}
 let w=mix(sample(t1,q).r,0.25*sum,0.12*clamp(u.v[1].x*60.0,0.0,1.0))*u.v[2].x;
 // Wetness is kept in 16 bits: one fast frame's evaporation can be under half a step, and the wash would round back to the same
 // wetness every frame and never dry. The rounding is made stochastic, by a hash of the paper's own texel and the frame, so a
 // replay rounds as the painting did.
 let at=vec2<i32>(floor(px(p)));let cell=vec2<u32>(bitcast<u32>(at.x+i32(u.v[4].y)),bitcast<u32>(i32(u.v[0].y)-1-at.y+i32(u.v[4].z)));
 var n=cell.x*1664525u+cell.y*1013904223u+u32(u.v[4].x)*2654435769u;n=(n^(n>>16u))*2246822519u;n=(n^(n>>13u))*3266489917u;n^=n>>16u;
 let unit=exp2(floor(log2(max(w,0.0001)))-10.0);
 return vec4<f32>(select(w,max(0.0,w+(f32(n>>8u)/16777216.0-0.5)*unit),w>0.0),0,0,1);
 }`,
 fix: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> Pair {
 let q=uv(p);return Pair(sample(t0,q)*u.v[2].z,sample(t1,q)*u.v[2].z);
 }`,
 pigment: `
 fn mobility(w:f32)->f32{return smoothstep(0.02,0.45,w);}
 fn bounded(v:vec4<f32>)->vec4<f32>{return select(vec4<f32>(0),clamp(v,vec4<f32>(-48),vec4<f32>(48)),v==v);}
 fn pigment(p:vec4<f32>) -> Pair {
  let q=uv(p);let pix=vec2<i32>(px(p));
  let water=loadTexel(t3,pix).r;let m=mobility(water);
  let a=loadTexel(t1,pix);let b=loadTexel(t2,pix);let keep=u.v[2].w;
  if(m<0.002){return Pair(a*keep,b*keep);}
  let back=q-u.v[1].x*sample(t0,q).xy/u.v[0].zw*m;
  let advectedA=sample(t1,back);let advectedB=sample(t2,back);
  var resultA=mix(a,advectedA,m);var resultB=mix(b,advectedB,m);
  // Advection and bleeding may not create an extreme: what they write stays within the pigment they drew from (this texel, the
  // one it was carried from, the faces it exchanged with). Together they can overshoot, and where the flow is fast the overshoot
  // alternates in sign and grows each frame. The drying-edge flow stays inside that bound: on a sheet finer than the reference it
  // carries up to the reach's multiple per face, and unbounded it piled pigment into beads one dab apart.
  var lowA=min(a,advectedA);var highA=max(a,advectedA);var lowB=min(b,advectedB);var highB=max(b,advectedB);
  var driftA=vec4<f32>(0);var driftB=vec4<f32>(0);
  // The reference applies bleeding and the drying-edge flow once per 60 Hz display frame. A shorter step applies its
  // share, so a step rate above 60 Hz never bleeds or piles pigment faster; longer steps keep the reference's per-frame cap.
  let pace=clamp(u.v[1].x*60.0,0.0,1.0);
  // Bleeding and the drying-edge flow keep the reference texel's reach on a finer sheet. Exchanges stay
  // between whole texels, paired in both directions, so pigment that leaves one texel arrives at another.
  let reach=u.v[3].w;let near=floor(reach);var spread=vec2<f32>(0.0,reach*reach);var carry=vec2<f32>(0.0,reach);
  if(near>=1.0){let far=(reach*reach-near*near)/(2.0*near+1.0);spread=vec2<f32>(1.0-far,far);carry=vec2<f32>(near+1.0-reach,reach-near);}
  for(var j=0u;j<2u;j++){
   let distance=near+f32(j);
   if(distance<1.0||(spread[j]<=0.0&&carry[j]<=0.0)){continue;}
   for(var i=0u;i<4u;i++){
    let step=vec2<i32>(i32(i==1u)-i32(i==0u),i32(i==3u)-i32(i==2u))*i32(distance);
    // A texel too dry to move (the early return above) exchanges with nothing, from either side.
    let nw=loadTexel(t3,pix+step).r;let gate=select(0.0,m*mobility(nw),mobility(nw)>=0.002);
    let na=loadTexel(t1,pix+step);let nb=loadTexel(t2,pix+step);
    // The brush's nearness is read at the face the pair shares, so both texels of a pair bleed at one rate.
    var proximity=0.0;
    if(u.v[3].z>0){let d=(q+0.5*vec2<f32>(f32(step.x),-f32(step.y))/u.v[0].xy-u.v[3].xy)*vec2<f32>(u.v[0].x/u.v[0].y,1)/u.v[3].z;proximity=exp(-dot(d,d));}
    let diffusion=clamp(u.v[1].z*(0.25+1.3*proximity)*0.3,0.0,0.15)*pace;
    let drift=carry[j]*clamp(u.v[1].w*(water-nw)*reach/distance,-0.08,0.08)*gate*pace;
    resultA+=spread[j]*diffusion*gate*(na-a);driftA-=drift*select(na,a,drift>0);
    resultB+=spread[j]*diffusion*gate*(nb-b);driftB-=drift*select(nb,b,drift>0);
    lowA=min(lowA,na);highA=max(highA,na);lowB=min(lowB,nb);highB=max(highB,nb);
   }
  }
  resultA=bounded(clamp(resultA+driftA,lowA,highA));resultB=bounded(clamp(resultB+driftB,lowB,highB));resultB.a=max(resultB.a,0.0);
  return Pair(resultA*keep,resultB*keep);
 }`,
 mask: `@fragment fn fragment(@builtin(position) p:vec4<f32>) -> @location(0) vec4<f32> {
 let block=1.0/u.v[0].xy;let origin=uv(p)-0.5*block;var peak=0.0;
 for(var y=0u;y<8u;y++){for(var x=0u;x<8u;x++){
  peak=max(peak,sample(t0,origin+block*(vec2<f32>(f32(x),f32(y))+0.5)/8).r);
 }}
 return vec4<f32>(select(0.0,1.0,peak>0.004),0,0,1);
 }`,
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
 fn flakeHash(point:vec2<i32>,salt:u32)->f32 {
  var value=bitcast<u32>(point.x)*747796405u+bitcast<u32>(point.y)*2891336453u+salt;
  value=(value^(value>>16u))*2246822519u;return f32(value^(value>>13u))/4294967296.0;
 }
 fn mineralReflection(q:vec2<f32>,pixel:vec2<i32>,flakes:vec4<f32>,cover:f32)->vec4<f32>{
  let mass=max(flakes.r,max(flakes.g,flakes.b));if(mass<=0.0){return vec4<f32>(0);}
  let point=vec2<i32>(floor((vec2<f32>(f32(pixel.x),u.v[14].w-f32(pixel.y))+u.v[14].xy)*u.v[12].z));
  let grain=vec2<f32>(flakeHash(point,1193u),flakeHash(point,4799u))-0.5;
  let h=1.0/u.v[0].xy;
  let tooth=vec2<f32>(sample(t5,q-vec2<f32>(h.x,0)).g-sample(t5,q+vec2<f32>(h.x,0)).g,sample(t5,q-vec2<f32>(0,h.y)).g-sample(t5,q+vec2<f32>(0,h.y)).g);
  let normal=normalize(vec3<f32>(tooth*1.8+grain*0.75,1.0));let halfLight=normalize(u.v[13].xyz+vec3<f32>(0,0,1));
  let facing=max(0.0,dot(normal,halfLight));let specular=0.13+0.6*pow(facing,24.0)+0.27*pow(facing,96.0);
  let iridescence=clamp(flakes.a/max(mass,0.0001),0.0,1.0);
  let shift=clamp((1.0-dot(normal,u.v[13].xyz))*2.0,0.0,1.0);
  let tint=clamp(flakes.rgb/mass,vec3<f32>(0),vec3<f32>(1));
  let reflection=mix(tint,mix(tint,tint.zxy,shift),iridescence);
  let alpha=(1.0-exp(-mass*1.6))*specular*(1.0-cover);
  return vec4<f32>(reflection,alpha);
 }
 fn display(p:vec4<f32>) -> vec4<f32> {
  let q=uv(p);let flat=u.v[9].w;let pixel=vec2<i32>(px(p));let paper=mix(textureLoad(t5,pixel,0),vec4<f32>(0.5),flat);
  let wetRead=textureLoad(t4,pixel,0).r;let a=textureLoad(t0,pixel,0)+textureLoad(t2,pixel,0);let b=textureLoad(t1,pixel,0)+textureLoad(t3,pixel,0);
  var flakes=vec4<f32>(0);if(u.v[12].y>0.0){flakes=textureLoad(t7,pixel,0);}
  // The live view shows wet paper a little darker and cooler, as the reference sheet does; kept pixels never carry it.
  let wetness=select(0.0,smoothstep(0.02,0.7,wetRead)*u.v[12].x,u.v[12].x>0.0);
  if(u.v[9].z==2 && wetness<=0.0 && all(a==vec4<f32>(0)) && all(b==vec4<f32>(0)) && all(flakes==vec4<f32>(0))){return textureLoad(t6,pixel,0);}
  // Edge darkening reads the density gradient across one reference texel. A slow live frame (its own pipeline, quickEdge) reads it from whole texels.
  var gradient=vec2<f32>(0);
  if(quickEdge){
   let k=i32(max(1.0,round(u.v[3].w)));let side=vec2<i32>(k,0);let up=vec2<i32>(0,k);
   gradient=vec2<f32>(loadTexel(t0,pixel+side).r+loadTexel(t2,pixel+side).r-loadTexel(t0,pixel-side).r-loadTexel(t2,pixel-side).r,
    loadTexel(t0,pixel-up).r+loadTexel(t2,pixel-up).r-loadTexel(t0,pixel+up).r-loadTexel(t2,pixel+up).r);
  }else{
   let h=u.v[3].w/u.v[0].xy;
   gradient=vec2<f32>(density(q+vec2<f32>(h.x,0))-density(q-vec2<f32>(h.x,0)),density(q+vec2<f32>(0,h.y))-density(q-vec2<f32>(0,h.y)));
  }
  let edge=min(length(gradient)/(a.x+1.0),1.0);
  let strength=mix((1+u.v[9].x*(0.5-paper.g)*2.2)*(1+u.v[9].y*edge),1.0,flat);
  let transmission=waterColor(a*strength,b*strength);
  // White gouache settles into the paper's valleys and lies thin on its peaks. Thick, it hides what is under it; thin, a dark
  // ground shows through it cool, as a turbid layer over dark reads blue.
  let cover=clamp(1-exp(-2.2*b.a*max(0.0,1+1.8*(0.5-paper.g)+1.2*(paper.b-0.5))),0.0,1.0);
  let under=dot(transmission,vec3<f32>(0.2126,0.7152,0.0722));
  let white=vec3<f32>(0.96,0.955,0.94)*(1+0.1*(paper.r-0.5)*u.v[10].w)*mix(vec3<f32>(1),vec3<f32>(0.8,0.87,1.0),(1-cover)*(1-clamp(under,0.0,1.0)));
  var reflection=vec4<f32>(0);if(u.v[12].y>0.0 && flat<1.0){reflection=mineralReflection(q,pixel,flakes,cover);}
  if(u.v[9].z==2){
   // Transparent paint multiplies the saved raster under it (its colour over white), as it multiplies the paper; the result keeps
   // the raster's alpha where the paint adds none. White gouache lies on top.
   let base=textureLoad(t6,pixel,0);let t=srgb(transmission);let held=base.rgb*base.a+vec3<f32>(1-base.a);
   let glazed=srgb(transmission*select(held/12.92,pow((held+0.055)/1.055,vec3<f32>(2.4)),held>vec3<f32>(0.04045)));
   let alpha=base.a+(1-min(t.x,min(t.y,t.z)))*(1-base.a);
   let pigmentAlpha=cover+alpha*(1-cover);
   let pigmentRGB=srgb(white)*cover+clamp(glazed-vec3<f32>(1-alpha),vec3<f32>(0),vec3<f32>(1))*(1-cover);
   let layered=reflection.a+pigmentAlpha*(1-reflection.a);
   let under=srgb(reflection.rgb)*reflection.a+pigmentRGB*(1-reflection.a);
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
  let base=textureLoad(t6,pixel,0);let baseLinear=select(base.rgb/12.92,pow((base.rgb+0.055)/1.055,vec3<f32>(2.4)),base.rgb>vec3<f32>(0.04045));
  backing=mix(backing,baseLinear,base.a);
  var color=mix(transmission*backing,select(white,vec3<f32>(1),u.v[9].z==3),cover);
  let damp=select(smoothstep(0.02,0.7,wetRead)*(1-flat),0.0,u.v[9].z==3);
  color*=vec3<f32>(1)-damp*vec3<f32>(0.12,0.11,0.08);
  color=mix(color,reflection.rgb,reflection.a);
  return vec4<f32>(srgb(color),1);
 }`,
};

export function waterShaderSources(){
 const common = head + manualSample + rest;
 const sources=Object.fromEntries(Object.entries(body).filter(([name])=>name!=='pigment'&&name!=='display').map(([name,source])=>[name,common+source]));
 sources.displayCompute=common+`override quickEdge:bool=false;`+body.display+`
 @group(0) @binding(11) var output:texture_storage_2d<rgba8unorm,write>;
 @compute @workgroup_size(8,8) fn compute(@builtin(global_invocation_id) id:vec3<u32>){
  let coord=id.xy+vec2<u32>(u.v[2].xy);
  if(any(coord>=vec2<u32>(u.v[2].zw))){return;}
  textureStore(output,coord,display(vec4<f32>(vec2<f32>(coord)+0.5,0,1)));
 }`;
 sources.pigmentTiles=head+`
 @group(0) @binding(11) var<storage,read_write> tiles:array<u32>;
 @group(0) @binding(12) var<storage,read_write> dispatch:array<atomic<u32>>;
 var<workgroup> changed:atomic<u32>;
 @compute @workgroup_size(8,8) fn compute(@builtin(global_invocation_id) id:vec3<u32>,
  @builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_index) local:u32){
  if(local==0u){atomicStore(&changed,0u);}workgroupBarrier();
  var dirty=false;
  for(var i=0u;i<4u;i++){
   let coord=id.xy*2u+vec2<u32>(u.v[15].xy)+vec2<u32>(i&1u,i>>1u);
   if(any(coord<vec2<u32>(u.v[14].xy))||any(coord>=vec2<u32>(u.v[14].zw))){continue;}
   let p=vec2<i32>(coord);let water=textureLoad(t3,p,0).r;
   // Mobile water can change pigment through the flow even when its own half-float value is unchanged.
   dirty=!(smoothstep(0.02,0.45,water)<0.002);
   if(!dirty){
    let a=textureLoad(t1,p,0);let b=textureLoad(t2,p,0);
    dirty=any(bitcast<vec4<u32>>(a)!=bitcast<vec4<u32>>(textureLoad(t4,p-vec2<i32>(u.v[15].zw),0)))||
     any(bitcast<vec4<u32>>(b)!=bitcast<vec4<u32>>(textureLoad(t5,p-vec2<i32>(u.v[15].zw),0)))||
     (u.v[2].w!=1.0&&(any(a!=vec4<f32>(0))||any(b!=vec4<f32>(0))));
   }
   if(dirty){break;}
  }
  if(dirty){atomicStore(&changed,1u);}
  workgroupBarrier();
  if(local==0u&&atomicLoad(&changed)!=0u){
   let origin=group.xy*16u+vec2<u32>(u.v[15].xy);
   tiles[atomicAdd(&dispatch[0],1u)]=origin.x|(origin.y<<16u);
  }
 }`;
 sources.pigmentCompute=common+body.pigment+`
 @group(0) @binding(11) var<storage,read> tiles:array<u32>;
 @group(0) @binding(12) var ink0:texture_storage_2d<rgba16float,write>;
 @group(0) @binding(13) var ink1:texture_storage_2d<rgba16float,write>;
 @compute @workgroup_size(16,16) fn compute(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_id) local:vec3<u32>){
  let tile=tiles[group.x];let coord=vec2<u32>(tile&65535u,tile>>16u)+local.xy;
  if(any(coord<vec2<u32>(u.v[14].xy))||any(coord>=vec2<u32>(u.v[14].zw))){return;}
  let result=pigment(vec4<f32>(vec2<f32>(coord)+0.5-u.v[15].xy,0,1));
  let output=coord-vec2<u32>(u.v[15].zw);textureStore(ink0,output,result.a);textureStore(ink1,output,result.b);
 }`;
 return Object.freeze(sources);
}
