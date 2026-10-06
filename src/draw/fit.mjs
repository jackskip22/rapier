// SPDX-License-Identifier: AGPL-3.0-only
// The Pen's candidate bank. No DOM, templates, downloads or recognition cascade.
import {_rapierDrawBBox as bbox, _rapierDrawDist as dist,
 _rapierDrawPerimeter as perimeter, _rapierDrawResamplePolyline as resample,
 _rapierDrawIsClosedStroke as closedStroke, _rapierDrawRDPClosed as simplifyClosed,
 _rapierDrawClosestOnSeg as closest, _rapierDrawShapePolygon as polygon,
 _rapierDrawEllipseEdgePoint as ellipsePoint, _rapierDrawSpatial as spatial} from './core.mjs';

const TAU = Math.PI * 2;
// One spatial allowance; the brief's existing 5-unit / 3.5% straightness law also supplies
// the noise scale. Shape accuracy uses diameter, never a scribble's arbitrarily long travel.
const tolerance = size => Math.max(5, size * .035);
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const segDistance = (p,a,b) => dist(p,closest(p,a,b));
function frame(points) {
 const n=points.length, cx=points.reduce((s,p)=>s+p[0],0)/n, cy=points.reduce((s,p)=>s+p[1],0)/n;
 let xx=0,xy=0,yy=0;
 for(const p of points) {const x=p[0]-cx,y=p[1]-cy;xx+=x*x;xy+=x*y;yy+=y*y;}
 return {cx,cy,theta:.5*Math.atan2(2*xy,xx-yy),xx,xy,yy};
}
// Existing Kasa and covariance/radii estimators, now on a centred, unit-size,
// arc-length sample. Pointer dwell and large page offsets cannot bias their sums.
function _rapierDrawFitCircleTo(points) {
	const n = points.length;
	if (n < 5) return null;
	let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
	for (const [x, y] of points) {
		const z = x * x + y * y;
		sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
	}
	const a11 = 2 * (sxx - sx * sx / n), a12 = 2 * (sxy - sx * sy / n), a22 = 2 * (syy - sy * sy / n);
	const b1 = sxz - sx * sz / n, b2 = syz - sy * sz / n;
	const det = a11 * a22 - a12 * a12;
	if (!det || !isFinite(det)) return null;
	const cx = (b1 * a22 - b2 * a12) / det, cy = (a11 * b2 - a12 * b1) / det;
	if (!isFinite(cx) || !isFinite(cy)) return null;
	let total = 0;
	for (const [x, y] of points) total += Math.hypot(x - cx, y - cy);
	const r = total / n;
	if (!(r > 0) || !isFinite(r)) return null;
	return { cx, cy, r };
}

function _rapierDrawFitEllipseTo(points) {
	const n = points.length;
	if (n < 6) return null;
	let cx = 0, cy = 0;
	for (const [x, y] of points) { cx += x / n; cy += y / n; }
	let sxx = 0, syy = 0, sxy = 0;
	for (const [x, y] of points) { const dx = x - cx, dy = y - cy; sxx += dx * dx / n; syy += dy * dy / n; sxy += dx * dy / n; }
	const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy), co = Math.cos(theta), si = Math.sin(theta);
	let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
	for (const [x, y] of points) {
		const u = (x - cx) * co + (y - cy) * si, v = -(x - cx) * si + (y - cy) * co;
		const p = u * u, q = v * v;
		a11 += p * p; a12 += p * q; a22 += q * q; b1 += p; b2 += q;
	}
	const det = a11 * a22 - a12 * a12;
	if (!det || !isFinite(det)) return null;
	const ia = (b1 * a22 - b2 * a12) / det, ib = (a11 * b2 - a12 * b1) / det;
	if (!(ia > 0) || !(ib > 0)) return null;
	const ra = 1 / Math.sqrt(ia), rb = 1 / Math.sqrt(ib);
	if (!isFinite(ra) || !isFinite(rb) || !(ra > 0) || !(rb > 0)) return null;
	return { cx, cy, ra, rb, theta };
}

// The original regular-figure estimator: angle-weighted Fourier phase, then the
// hand's radial extrema. Each supported harmonic now gets its own candidate;
// the loudest harmonic no longer prevents another figure from competing.
function _rapierDrawFitRegularTo(points, k, star=false) {
 const {cx,cy}=frame(points), n=points.length;
 const angles=points.map(p=>Math.atan2(p[1]-cy,p[0]-cx)), radii=points.map(p=>dist(p,[cx,cy]));
 const mean=radii.reduce((s,r)=>s+r,0)/n;
 let re=0,im=0,weight=0;
 for(let i=0;i<n;i++) {
  const dw=Math.abs(wrap(angles[(i+1)%n]-angles[(i+n-1)%n]))/2;
  re+=(radii[i]-mean)*Math.cos(k*angles[i])*dw;
  im+=(radii[i]-mean)*Math.sin(k*angles[i])*dw;weight+=dw;
 }
 if(!weight || !(Math.hypot(re,im)>1e-12)) return null;
 const phase=Math.atan2(im,re)/k, count=star?k*2:k, outer=[], inner=[];
 for(let j=0;j<count;j++) {
  const out=!star || j%2===0, a=phase+j*TAU/count;
  const sector=radii.filter((_,i)=>Math.abs(wrap(angles[i]-a))<=Math.PI/(2*k));
  if(!sector.length) return null;
  (out?outer:inner).push(out?Math.max(...sector):Math.min(...sector));
 }
 let radius=outer.reduce((s,r)=>s+r,0)/outer.length;
 const depth=star?inner.reduce((s,r)=>s+r,0)/inner.length/radius:0;
 // This is the recipe's geometric domain, not an acceptance threshold. Convex
 // polygons do not become barely-indented stars, nor are inadmissible depths clamped.
 if(!(radius>0) || star && !(depth>=.15 && depth<=.75)) return null;
 const kind=star?'star':({3:'triangle',4:'diamond',5:'pentagon',6:'hexagon',8:'octagon'})[k];
 const local=Array.from({length:count},(_,i)=>{
  const a=i*TAU/count-Math.PI/2,r=star&&i%2?depth:1;return [Math.cos(a)*r,Math.sin(a)*r];
 });
 let rot=phase+Math.PI/2,co=Math.cos(rot),si=Math.sin(rot),center=[cx,cy];
 let vertices=local.map(([x,y])=>[cx+radius*(x*co-y*si),cy+radius*(x*si+y*co)]);
 // Radial extrema seed the figure; all edge samples fit its final similarity.
 // Otherwise a single corner's tremor beats the cheaper regular model on score.
 const target=frame(points);
 for(let pass=0;pass<12;pass++) {
  const matches=points.map(p=>{
   let nearest=null,best=Infinity;
   vertices.forEach((a,i)=>{const q=closest(p,a,vertices[(i+1)%vertices.length]),d=dist(p,q);if(d<best){best=d;nearest=q;}});
   return nearest;
  });
  const source=frame(matches);let dot=0,cross=0,den=0;
  matches.forEach((q,i)=>{const x=q[0]-source.cx,y=q[1]-source.cy,u=points[i][0]-target.cx,v=points[i][1]-target.cy;dot+=x*u+y*v;cross+=x*v-y*u;den+=x*x+y*y;});
  if(!(den>1e-12)) return null;
  const a=dot/den,b=cross/den,move=p=>[target.cx+a*(p[0]-source.cx)-b*(p[1]-source.cy),target.cy+b*(p[0]-source.cx)+a*(p[1]-source.cy)];
  center=move(center);vertices=vertices.map(move);radius*=Math.hypot(a,b);rot+=Math.atan2(b,a);
 }
 co=Math.cos(rot);si=Math.sin(rot);
 const b=bbox(local),ox=(b.minX+b.w/2)*radius,oy=(b.minY+b.h/2)*radius;
 const geom=kind==='triangle'?{p:vertices}:{cx:center[0]+ox*co-oy*si,cy:center[1]+ox*si+oy*co,w:b.w*radius,h:b.h*radius,rot,
  ...(star?{inner:depth,...(k===6?{points:6}:{})}:{})};
 return {kind,geom,parameters:star?5:4};
}

function winding(points,cx,cy) {
 let sweep=0,travel=0;
 for(let i=1;i<points.length;i++) {
  const a=Math.atan2(points[i-1][1]-cy,points[i-1][0]-cx),b=Math.atan2(points[i][1]-cy,points[i][0]-cx),d=wrap(b-a);
  sweep+=d;travel+=Math.abs(d);
 }
 return {sweep,coherent:Math.abs(sweep)<=TAU+.6 && travel<=Math.abs(sweep)+.6};
}
function monotone(points,co,si,slack) {
 const first=points[0][0]*co+points[0][1]*si,last=points.at(-1)[0]*co+points.at(-1)[1]*si;
 let travel=0;
 for(let i=1;i<points.length;i++) travel+=Math.abs((points[i][0]-points[i-1][0])*co+(points[i][1]-points[i-1][1])*si);
 return Math.abs(last-first)>1e-9 && travel<=Math.abs(last-first)+2*slack;
}
function solve3(a,b) {
 const rows=a.map((row,i)=>row.concat(b[i]));
 for(let i=0;i<3;i++) {
  let best=i;for(let j=i+1;j<3;j++) if(Math.abs(rows[j][i])>Math.abs(rows[best][i])) best=j;
  if(Math.abs(rows[best][i])<1e-12) return null;
  [rows[i],rows[best]]=[rows[best],rows[i]];
  const div=rows[i][i];for(let k=i;k<4;k++) rows[i][k]/=div;
  for(let j=0;j<3;j++) if(j!==i) {const mul=rows[j][i];for(let k=i;k<4;k++) rows[j][k]-=mul*rows[i][k];}
 }
 const out=rows.map(row=>row[3]);return out.every(Number.isFinite)?out:null;
}
function parabola(points,theta,slack) {
 const f=frame(points),co=Math.cos(theta),si=Math.sin(theta);
 if(!monotone(points,co,si,slack)) return null;
 const local=points.map(([x,y])=>[(x-f.cx)*co+(y-f.cy)*si,-(x-f.cx)*si+(y-f.cy)*co]);
 const sums=[0,0,0,0,0],rhs=[0,0,0];
 for(const [x,y] of local) {let p=1;for(let i=0;i<5;i++){sums[i]+=p;if(i<3)rhs[i]+=p*y;p*=x;}}
 const fit=solve3([[sums[0],sums[1],sums[2]],[sums[1],sums[2],sums[3]],[sums[2],sums[3],sums[4]]],rhs);
 if(!fit) return null;
 const [c,b,a]=fit,x0=local[0][0],x1=local.at(-1)[0],dx=x1-x0,y=x=>a*x*x+b*x+c;
 const p=[[x0,y(x0)],[x0+dx/2,y(x0)+dx*(2*a*x0+b)/2],[x1,y(x1)]];
 return {p:p.map(([x,y])=>[f.cx+x*co-y*si,f.cy+x*si+y*co])};
}
// Orthogonal edge fits square the rectangle without taking the noisiest point as
// a dimension. For fixed side membership the orientation is one covariance solve.
function rectangle(points,theta) {
 let co=Math.cos(theta),si=Math.sin(theta),local=points.map(([x,y])=>[x*co+y*si,-x*si+y*co]);
 const b=bbox(local);let sides=[b.minX,b.maxX,b.minY,b.maxY];
 for(let pass=0;pass<6;pass++) {
  const groups=[[],[],[],[]];
  points.forEach((p,i)=>{
   const [x,y]=local[i],d=[Math.abs(x-sides[0]),Math.abs(x-sides[1]),Math.abs(y-sides[2]),Math.abs(y-sides[3])];
   groups[d.indexOf(Math.min(...d))].push(p);
  });
  if(groups.some(g=>g.length<2)) return null;
  const stats=groups.map(frame);
  let xx=0,xy=0;
  stats.forEach((f,i)=>{const sign=i<2?1:-1;xx+=sign*(f.xx-f.yy);xy+=sign*2*f.xy;});
  let next=.5*Math.atan2(xy,xx)+Math.PI/2;
  while(next-theta>Math.PI/2) next-=Math.PI;
  while(next-theta< -Math.PI/2) next+=Math.PI;
  theta=next;co=Math.cos(theta);si=Math.sin(theta);
  sides=stats.map((f,i)=>i<2?f.cx*co+f.cy*si:-f.cx*si+f.cy*co);
  local=points.map(([x,y])=>[x*co+y*si,-x*si+y*co]);
 }
 const x=(sides[0]+sides[1])/2,y=(sides[2]+sides[3])/2,w=sides[1]-sides[0],h=sides[3]-sides[2];
 if(!(w>0&&h>0)) return null;
 return {cx:x*co-y*si,cy:x*si+y*co,w,h,rot:theta};
}
function triangle(points,poly) {
 if(poly.length<3) return null;
 const turns=poly.map((p,i)=>{
  const a=poly[(i+poly.length-1)%poly.length],b=poly[(i+1)%poly.length];
  return [Math.abs(wrap(Math.atan2(b[1]-p[1],b[0]-p[0])-Math.atan2(p[1]-a[1],p[0]-a[0]))),i];
 });
 const indices=turns.sort((a,b)=>b[0]-a[0]).slice(0,3).map(a=>a[1]).sort((a,b)=>a-b);
 let vertices=indices.map(i=>poly[i]);
 for(let pass=0;pass<3;pass++) {
  const groups=[[],[],[]];
  for(const p of points) {const d=vertices.map((a,i)=>segDistance(p,a,vertices[(i+1)%3]));groups[d.indexOf(Math.min(...d))].push(p);}
  if(groups.some(g=>g.length<2)) return null;
  const lines=groups.map(g=>{const f=frame(g);return {...f,nx:-Math.sin(f.theta),ny:Math.cos(f.theta)};});
  const next=[];
  for(let i=0;i<3;i++) {
   const a=lines[(i+2)%3],b=lines[i],det=a.nx*b.ny-a.ny*b.nx;
   if(Math.abs(det)<1e-9) return null;
   const u=a.nx*a.cx+a.ny*a.cy,v=b.nx*b.cx+b.ny*b.cy;
   next.push([(u*b.ny-a.ny*v)/det,(a.nx*v-u*b.nx)/det]);
  }
  vertices=next;
 }
 return {p:vertices};
}
// The existing hook estimate (last 18% of travel), followed by the actual turning
// point. The arrow ends at its tip, never at the free end of its backward hook.
function arrow(points,length,slack) {
 if(points.length<6 || length<slack*2) return null;
 let acc=0,split=1;
 while(split<points.length-2 && acc<length*.82) {acc+=dist(points[split-1],points[split]);split++;}
 const first=points[0],last=points.at(-1),dir=Math.atan2(points[split][1]-first[1],points[split][0]-first[0]);
 const diff=Math.abs(wrap(Math.atan2(last[1]-points[split][1],last[0]-points[split][0])-dir));
 if(!(diff>.45 && diff<2.8)) return null;
 const co=Math.cos(dir),si=Math.sin(dir);
 let at=0,best=-Infinity;
 points.forEach((p,i)=>{const t=(p[0]-first[0])*co+(p[1]-first[1])*si;if(t>best){best=t;at=i;}});
 const tip=points[at],chord=dist(first,tip),tail=dist(tip,last);
 if(at<2 || at>=points.length-2 || tail<=slack || tail>chord*.35 || (last[0]-tip[0])*co+(last[1]-tip[1])*si>=0) return null;
 if(!monotone(points.slice(0,at+1),co,si,slack)) return null;
 return {kind:'arrow',geom:{x1:first[0],y1:first[1],x2:tip[0],y2:tip[1]},style:'arrow',parameters:6,outline:[first,tip,last]};
}
function quadraticPoints(p) {
 return Array.from({length:65},(_,i)=>{const t=i/64,u=1-t;return [u*u*p[0][0]+2*u*t*p[1][0]+t*t*p[2][0],u*u*p[0][1]+2*u*t*p[1][1]+t*t*p[2][1]];});
}
// Every candidate pays for Euclidean distance to its own finite geometry. In
// particular an ellipse's scaled algebraic residual is NOT comparable to a circle.
function residual(points,candidate) {
 const {kind,geom:g}=candidate;
 let outline=candidate.outline;
 if(!outline) {
  if(kind==='line') outline=[[g.x1,g.y1],[g.x2,g.y2]];
  else if(kind==='parabola') outline=quadraticPoints(g.p);
  else if(!['circle','ellipse','arc'].includes(kind)) {const p=polygon({recognized:kind,geom:g});if(p)outline=p.concat([p[0]]);}
 }
 let squared=0;
 for(const p of points) {
  let d=Infinity;
  if(kind==='circle') d=Math.abs(dist(p,[g.cx,g.cy])-g.r);
  else if(kind==='ellipse') d=dist(p,ellipsePoint(g.cx,g.cy,g.rx,g.ry,g.rot,p[0],p[1]));
  else if(kind==='arc') {
   const angle=Math.atan2(p[1]-g.cy,p[0]-g.cx),sign=Math.sign(g.a1-g.a0),span=Math.abs(g.a1-g.a0);
   const t=((angle-g.a0)*sign%TAU+TAU)%TAU;
   d=t<=span?Math.abs(dist(p,[g.cx,g.cy])-g.r):Math.min(...[g.a0,g.a1].map(a=>dist(p,[g.cx+g.r*Math.cos(a),g.cy+g.r*Math.sin(a)])));
  } else if(outline) for(let i=1;i<outline.length;i++) d=Math.min(d,segDistance(p,outline[i-1],outline[i]));
  squared+=d*d;
 }
 return Math.sqrt(squared/points.length);
}
function worldGeometry(g,origin,scale) {
 const out={...g};
 if(g.p) out.p=g.p.map(p=>[origin[0]+p[0]*scale,origin[1]+p[1]*scale]);
 for(const key of ['cx','x1','x2']) if(key in g) out[key]=origin[0]+g[key]*scale;
 for(const key of ['cy','y1','y2']) if(key in g) out[key]=origin[1]+g[key]*scale;
 for(const key of ['r','rx','ry','w','h']) if(key in g) out[key]=g[key]*scale;
 return Object.entries(out).every(([k,v])=>k==='p'?v.every(p=>p.every(spatial)):['rot','a0','a1','inner','points'].includes(k)?Number.isFinite(v):spatial(v))?out:null;
}

export function fitCandidates(raw) {
 if(!Array.isArray(raw)||raw.length<2||!raw.every(p=>Array.isArray(p)&&spatial(p[0])&&spatial(p[1]))) return [];
 const b=bbox(raw),scale=Math.hypot(b.w,b.h),length=perimeter(raw,false);
 if(!(scale>1e-6) || length<6 && raw.length<4) return [];
 const origin=[b.minX+b.w/2,b.minY+b.h/2];
 const points=resample(raw,128).map(p=>[(p[0]-origin[0])/scale,(p[1]-origin[1])/scale]);
 const f=frame(points),nearClosed=closedStroke(raw),loop=winding(points,f.cx,f.cy);
 const closed=nearClosed && loop.coherent && Math.abs(loop.sweep)>=4;
 const allowance=tolerance(scale)/scale,straight=tolerance(length)/scale,bank=[];
 const offer=candidate=>{
  if(!candidate?.geom) return;
  const error=residual(points,candidate),geom=worldGeometry(candidate.geom,origin,scale);
  if(!geom || !Number.isFinite(error)) return;
  // Per-sample BIC: log squared residual + parameter charge. Ink is the zero
  // score at the shared spatial allowance. The tiny floor only makes log(0) finite;
  // exact fits still pay for freedom. No shape owns an acceptance threshold.
  const score=Math.log(Math.max(error*error,1e-24)/(allowance*allowance))+candidate.parameters*Math.log(points.length)/points.length;
  bank.push({kind:candidate.kind,geom,...(candidate.style?{style:candidate.style}:{}),residual:error*scale,parameters:candidate.parameters,score});
 };
 const circle=_rapierDrawFitCircleTo(points);
 if(circle) {
  const turn=winding(points,circle.cx,circle.cy),sweep=Math.abs(turn.sweep);
  if(turn.coherent && nearClosed && sweep>=4) offer({kind:'circle',geom:{cx:circle.cx,cy:circle.cy,r:circle.r},parameters:3});
  if(!nearClosed && turn.coherent && sweep>=.6 && sweep<TAU) {
   const a0=Math.atan2(points[0][1]-circle.cy,points[0][0]-circle.cx);
   offer({kind:'arc',geom:{cx:circle.cx,cy:circle.cy,r:circle.r,a0,a1:a0+turn.sweep},parameters:5});
  }
 }
 if(closed) {
  const ellipse=_rapierDrawFitEllipseTo(points);
  if(ellipse) {const turn=winding(points,ellipse.cx,ellipse.cy);if(turn.coherent&&Math.abs(turn.sweep)>=4) offer({kind:'ellipse',geom:{cx:ellipse.cx,cy:ellipse.cy,rx:ellipse.ra,ry:ellipse.rb,rot:ellipse.theta},parameters:5});}
  const poly=simplifyClosed(points,straight);
  let re=0,im=0;
  poly.forEach((p,i)=>{const q=poly[(i+1)%poly.length],a=Math.atan2(q[1]-p[1],q[0]-p[0]),w=dist(p,q);re+=w*Math.cos(4*a);im+=w*Math.sin(4*a);});
  for(const theta of [.25*Math.atan2(im,re),f.theta]) offer({kind:'rect',geom:rectangle(points,theta),parameters:5});
  offer({kind:'triangle',geom:triangle(points,poly),parameters:6});
  for(const k of [3,4,5,6,8]) offer(_rapierDrawFitRegularTo(points,k));
  for(const k of [5,6]) offer(_rapierDrawFitRegularTo(points,k,true));
 } else {
  const first=points[0],last=points.at(-1),angle=Math.atan2(last[1]-first[1],last[0]-first[0]);
  if(monotone(points,Math.cos(angle),Math.sin(angle),straight)) offer({kind:'line',geom:{x1:first[0],y1:first[1],x2:last[0],y2:last[1]},style:'plain',parameters:4});
  offer(arrow(points,length/scale,straight));
  // Nested-model guard from the brief: a bend within the existing straightness
  // allowance is not evidence for a parabola, even when its residual is smaller.
  if(points.some(p=>segDistance(p,first,last)>straight)) for(const theta of [f.theta,f.theta+Math.PI/2]) offer({kind:'parabola',geom:parabola(points,theta,straight),parameters:6});
 }
 return bank.sort((a,b)=>a.score-b.score || a.parameters-b.parameters || a.kind.localeCompare(b.kind));
}
export function fitStroke(raw) {
 if(!Array.isArray(raw)||raw.length<2) return null;
 const best=fitCandidates(raw)[0];
 if(!best || !(best.score<0)) return {kind:'ink'};
 const {kind,geom,style}=best;return {kind,geom,...(style?{style}:{})};
}
