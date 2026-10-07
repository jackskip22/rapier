// SPDX-License-Identifier: AGPL-3.0-only
// One distance-resampled contact writer serves pointer samples and scripted paths.
import {getBrush,makeTip,CUSTOM_PARAMS} from './water-materials.mjs';
const clip=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const TAU=2*Math.PI,DEG=Math.PI/180;
const tipMeans=new Map();
export class WaterContact {
 constructor(gpu,options={}){
  this.gpu=gpu;this.brush=typeof options.brush==='string'?getBrush(options.brush):options.brush??getBrush('water/round');
  this.profile=this.brush.params??CUSTOM_PARAMS;
  if(this.brush.tip)this.tipMean=this.brush.tip.mask.reduce((sum,value)=>sum+value,0)/(255*this.brush.tip.mask.length);
  else {if(!tipMeans.has(this.brush.id))tipMeans.set(this.brush.id,makeTip(this.brush).mean);this.tipMean=tipMeans.get(this.brush.id);}
  this.tool=options.tool??'brush';this.coefficients=options.coefficients??new Float32Array(8);
  this.params={size:.5,water:.6,load:.5,flow:.45,...options.params};this.radiusScale=options.radiusScale??1;
  this.fixedAngle=options.angle??null;this.follow=options.follow??null;this.script=options.script!==false;
  this.inputKind=options.inputKind??'script';
  this.rng=options.random??Math.random;this.lastDirection=options.lastDirection?.slice()??[1,0];
  this.queue=[];this.state=null;this.ending=false;this.loadFuel=1;
 }
 sample(x,y,pressure,time,tiltX=0,tiltY=0){this.queue.push({x,y,pressure,time,tiltX,tiltY});}
 finish(){this.ending=true;}
 radius(pressure,speed){
  if(this.params.firm===false)pressure*=.72;
  const p=this.profile,m=3**(2*(this.params.size-.5))*this.radiusScale;
  if(this.tool==='lift'||this.tool==='erase')return (.012+.03*pressure)*m;
  if(this.tool==='pen')return (.0016+.0042*pressure)*clip(1.12-.3*speed,.55,1.12)*m;
  const radius=.8*m*(p.size[0]+(p.size[1]-p.size[0])*clip(pressure)**p.pressureSize)*clip(1-speed*p.speedThin,.4,1);
  return this.tool==='water'?radius*1.3*(1+.12*Math.min(speed,2.5)):radius;
 }
 _angle(s){
  const p=this.profile,rotation=p.rotation==='random'?'random':this.follow===null?p.rotation:this.follow?'follow':'fixed';
  let angle=rotation==='random'?this.rng()*TAU:rotation==='follow'?Math.atan2(s.dy,s.dx)+p.angle*DEG:s.azimuth??(this.fixedAngle??p.angle)*DEG;
  if(p.angleJitter)angle+=(2*this.rng()-1)*p.angleJitter*DEG;return angle;
 }
 _each(s,x,y,r,deposit){
  const p=this.profile,aspect=this.gpu.width/this.gpu.height;
  for(let i=0;i<p.dabs;i++){
   let dx=x,dy=y,dr=r;
   if(p.scatter){const angle=this.rng()*TAU,length=Math.sqrt(this.rng())*p.scatter*r;dx+=Math.cos(angle)*length/aspect;dy+=Math.sin(angle)*length;}
   if(p.sizeJitter)dr*=clip(1+(2*this.rng()-1)*p.sizeJitter,.15,2);
   deposit(dx,dy,dr,this._angle(s));
  }
 }
 _velocity(x,y,r,vx,vy,strength){
  let fx=vx*strength,fy=vy*strength;const length=Math.hypot(fx,fy);if(length>240){fx*=240/length;fy*=240/length;}
  this.gpu.splatVelocity(x,y,r,fx,fy);
 }
 _dab(s,x,y,pressure,vx,vy,dwell=1,moving=true){
  const p=this.profile,P=this.params,r=this.radius(pressure,s.speed),gpu=this.gpu;
  if(P.firm===false)pressure*=.72;
  if(this.tool==='lift'||this.tool==='erase'){gpu.stamp({x,y,r,brush:this.brush,lift:Math.min(.9,.22*dwell),circular:true,erase:this.tool==='erase'});return;}
  if(this.tool==='pen'){
   const dose=(.9+1.6*pressure)*clip(1.25-.45*s.speed,.6,1.25)*(.5+P.load)*.5/1.8*dwell;
   const color=Float32Array.from(this.coefficients,(c,i)=>c*dose*(i===7?3:1));
   gpu.stamp({x,y,r,brush:this.brush,coefficients:color,circular:true,hardness:2});
   gpu.stamp({x,y,r:r*2.6,brush:this.brush,water:.13,circular:true,hardness:1});return;
  }
  const isWater=this.tool==='water';
  const reservoir=.25+.75*Math.exp(-s.distance/((isWater?3+4*P.water:1.5+3*P.water)*p.capacity));this.loadFuel=reservoir;
  const grain=isWater?.7*p.grain:clip(p.grain+(1-p.grain)*clip((.5-reservoir)*2.5)*.6);
  const threshold=isWater?.55-.3*pressure:.74-.45*pressure-.05*P.water;
  const strength=isWater?(.35+.65*P.water)*(.5+.5*pressure)*clip(p.water,.6,1.5)*(.7+.3*reservoir)
   :(.25+.75*P.water)*(.7+.3*pressure)*p.water*(.4+.6*reservoir);
  const round=isWater?Math.max(.3,p.wetRound):p.wetRound;
  const dose=.15*Math.exp(2.8*P.load)*reservoir*(.6+.4*pressure)*p.load*Math.min(p.spacing,1)/1.8*clip(Math.sqrt(.5/this.tipMean),.7,2.2)*dwell;
  const coefficients=isWater?null:Float32Array.from(this.coefficients,(c,i)=>c*dose*(i===7?1.6:1));
  this._each(s,x,y,r,(dx,dy,dr,angle)=>{
   if(coefficients)gpu.stamp({x:dx,y:dy,r:dr,angle,brush:this.brush,coefficients,grain,threshold});
   gpu.stamp({x:dx,y:dy,r:dr*(isWater?1:1+.12*p.wetRound),angle,brush:this.brush,water:strength,round,grain,threshold});
  });
  if(isWater)gpu.brushNow=[x,y,r];
  if(moving)this._velocity(x,y,r*(isWater?1.15:1.2),vx,vy,(15+95*P.flow)*p.flow*(isWater?1:.25));
  else if(isWater){const angle=this.rng()*TAU,magnitude=(6+26*P.flow)*pressure;gpu.splatVelocity(x,y,.9*r,Math.cos(angle)*magnitude,Math.sin(angle)*magnitude,false);}
 }
 _trace(controlX,controlY,endX,endY,pressure,vx,vy){
  const s=this.state,aspect=this.gpu.width/this.gpu.height,startX=s.x,startY=s.y,startP=s.pressure;
  const approximate=Math.hypot((controlX-startX)*aspect,controlY-startY)+Math.hypot((endX-controlX)*aspect,endY-controlY);
  if(approximate<1e-7)return;
  const spacingFactor=['brush','water'].includes(this.tool)?this.profile.spacing*Math.sqrt(this.profile.aspect):.5;
  const fine=this.radius(Math.max(startP,pressure),s.speed)*spacingFactor;
  const count=clip(Math.ceil(approximate/Math.max(fine,1e-5)),1,48);
  let previousX=startX,previousY=startY;
  for(let i=1;i<=count;i++){
   const t=i/count,v=1-t,x=v*v*startX+2*v*t*controlX+t*t*endX,y=v*v*startY+2*v*t*controlY+t*t*endY;
   const dx=(x-previousX)*aspect,dy=y-previousY,length=Math.hypot(dx,dy),pr=startP+(pressure-startP)*t;
   if(length>1e-5){const blend=1-Math.exp(-length/(1.5*this.radius(pr,s.speed)+1e-4));s.dx+=(dx/length-s.dx)*blend;s.dy+=(dy/length-s.dy)*blend;const norm=Math.hypot(s.dx,s.dy)||1;s.dx/=norm;s.dy/=norm;this.lastDirection=[s.dx,s.dy];}
   const spacing=this.radius(pr,s.speed)*spacingFactor;let distance=0;
   while(length-distance>=spacing-s.carry){distance+=spacing-s.carry;s.carry=0;const along=distance/length;this._dab(s,previousX+(x-previousX)*along,previousY+(y-previousY)*along,pr,vx,vy);}
   s.carry+=length-distance;s.distance+=length;previousX=x;previousY=y;
  }
  s.x=endX;s.y=endY;s.pressure=pressure;
 }
 frame(dt){
  this.gpu.brushNow=[0,0,0];
  let moved=false;
  for(const q of this.queue){
   if(!this.state){const pressure=this.inputKind==='mouse'||this.inputKind==='touch'?.45:q.pressure;this.state={x:q.x,y:q.y,cx:q.x,cy:q.y,pressure,time:q.time,speed:0,synthetic:.45,carry:0,distance:0,dx:this.lastDirection[0],dy:this.lastDirection[1],azimuth:null};
    if(Math.hypot(q.tiltX,q.tiltY)>12)this.state.azimuth=Math.atan2(-q.tiltY,q.tiltX);
    this._dab(this.state,q.x,q.y,pressure,0,0);continue;}
   const s=this.state;if(Math.hypot(q.tiltX,q.tiltY)>12)s.azimuth=Math.atan2(-q.tiltY,q.tiltX);
   const elapsed=Math.max(1,q.time-s.time)/1000;s.time=q.time;
   const smoothing=this.inputKind==='mouse'?.5:.65;
   const x=s.cx+smoothing*(q.x-s.cx),y=s.cy+smoothing*(q.y-s.cy),distance=Math.hypot((x-s.cx)*this.gpu.width/this.gpu.height,y-s.cy);
   s.speed+=(distance/elapsed-s.speed)*(1-Math.exp(-10*elapsed));s.synthetic+=(clip(1.18-.95*s.speed,.12,1)-s.synthetic)*(1-Math.exp(-6*elapsed));
   const vx=(x-s.cx)/elapsed,vy=(y-s.cy)/elapsed;
   const pressure=this.inputKind==='mouse'||this.inputKind==='touch'?s.synthetic:q.pressure;
   if(this.script)this._trace(x,y,x,y,pressure,vx,vy);else this._trace(s.cx,s.cy,(s.cx+x)/2,(s.cy+y)/2,pressure,vx,vy);
   s.cx=x;s.cy=y;if(distance>0)moved=true;
  }
  this.queue=[];const s=this.state;if(!s)return;
  if((!moved||this.ending)&&(s.x!==s.cx||s.y!==s.cy))this._trace(s.cx,s.cy,s.cx,s.cy,s.pressure,0,0);
  if(!moved&&!this.ending)this._dab(s,s.x,s.y,s.synthetic,0,0,dt*8,false);
  if(this.ending){this.state=null;this.ending=false;}
 }
 snapshot(){return {state:structuredClone(this.state),queue:structuredClone(this.queue),ending:this.ending,lastDirection:this.lastDirection.slice(),loadFuel:this.loadFuel};}
 restore(value){Object.assign(this,structuredClone(value));}
}
