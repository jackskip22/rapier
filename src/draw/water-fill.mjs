// SPDX-License-Identifier: AGPL-3.0-only
// Connected RGB regions and weighted grid distances; rows follow retained RGBA order.
const moves = [
 [-1,0,5],[1,0,5],[0,-1,5],[0,1,5],
 [-1,-1,7],[1,-1,7],[-1,1,7],[1,1,7],
 [-1,-2,11],[1,-2,11],[-1,2,11],[1,2,11],
 [-2,-1,11],[-2,1,11],[2,-1,11],[2,1,11]
];
const smooth = t => t*t*(3-2*t);

// Twelve circular buckets suffice because every edge weighs at most eleven.
// Each pixel owns one queue link, so decreases never allocate duplicate entries.
function distances(mask,width,height,links,addSources,limit=Infinity) {
 const count=width*height, result=new Int32Array(count).fill(-1);
 const next=links.subarray(0,count), previous=links.subarray(count);
 const heads=new Int32Array(12).fill(-1);links.fill(-1);
 let queued=0,cursor=0;
 const offer=(pixel,value)=>{
  if(mask[pixel]!==1 || (result[pixel]>=0 && result[pixel]<=value))return;
  const old=result[pixel];
  if(old>=0){
   if(previous[pixel]<0)heads[old%12]=next[pixel];
   else next[previous[pixel]]=next[pixel];
   if(next[pixel]>=0)previous[next[pixel]]=previous[pixel];
  }else queued++;
  const bucket=value%12,head=heads[bucket];
  next[pixel]=head;previous[pixel]=-1;
  if(head>=0)previous[head]=pixel;
  heads[bucket]=pixel;result[pixel]=value;
 };
 addSources(pixel=>offer(pixel,0));
 while(queued){
  while(heads[cursor%12]<0 && cursor<=limit)cursor++;
  if(cursor>limit)break;
  const bucket=cursor%12,pixel=heads[bucket];
  heads[bucket]=next[pixel];
  if(next[pixel]>=0)previous[next[pixel]]=-1;
  queued--;
  const x=pixel%width,y=(pixel-x)/width;
  for(const [dx,dy,cost] of moves){
   const nx=x+dx,ny=y+dy;
   if(nx>=0 && nx<width && ny>=0 && ny<height)offer(ny*width+nx,cursor+cost);
  }
 }
 return result;
}

function noiseGrid(width,height,cell,random) {
 const stride=Math.ceil(width/cell)+2,rows=Math.ceil(height/cell)+2;
 const values=new Float32Array(stride*rows);
 for(let i=0;i<values.length;i++)values[i]=random();
 return (x,y)=>{
  const gx=Math.floor(x/cell),gy=Math.floor(y/cell);
  const tx=smooth(x/cell-gx),ty=smooth(y/cell-gy),index=gy*stride+gx;
  const lower=values[index]+(values[index+1]-values[index])*tx;
  const upper=values[index+stride]+(values[index+stride+1]-values[index+stride])*tx;
  return lower+(upper-lower)*ty;
 };
}

/** Tolerance is the admitted 0..1 control; its square selects an RGB byte difference. The source raster is opaque. */
export function buildWaterFill({width,height,data},x,y,tolerance=0,random=Math.random) {
 const count=width*height;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||count>0x3fffffff||data?.length!==count*4)
  throw new RangeError('The fill raster dimensions are invalid.');
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=width||y>=height)return null;
 if(!Number.isFinite(tolerance))throw new RangeError('The fill tolerance is invalid.');
 const draw=typeof random==='function'?random:random?.random?.bind(random);
 if(!draw)throw new TypeError('The fill random source is invalid.');
 x=Math.floor(x);y=Math.floor(y);tolerance=Math.min(254,Math.round(Math.max(0,Math.min(1,tolerance))**2*255));
 const mask=new Uint8Array(count),links=new Int32Array(count*2),queue=links.subarray(0,count);
 const seed=y*width+x,red=data[seed*4],green=data[seed*4+1],blue=data[seed*4+2];
 let head=0,tail=0;const box=[width,height,0,0];
 const visit=pixel=>{
  if(mask[pixel])return;
  const offset=pixel*4;mask[pixel]=2;
  if(Math.abs(data[offset]-red)>tolerance||Math.abs(data[offset+1]-green)>tolerance||Math.abs(data[offset+2]-blue)>tolerance)return;
  mask[pixel]=1;queue[tail++]=pixel;
 };
 visit(seed);
 while(head<tail){
  const pixel=queue[head++],px=pixel%width,py=(pixel-px)/width;
  box[0]=Math.min(box[0],px);box[1]=Math.min(box[1],py);
  box[2]=Math.max(box[2],px+1);box[3]=Math.max(box[3],py+1);
  if(px)visit(pixel-1);if(px+1<width)visit(pixel+1);
  if(py)visit(pixel-width);if(py+1<height)visit(pixel+width);
 }
 const fromSeed=distances(mask,width,height,links,add=>add(seed));
 const fromEdge=distances(mask,width,height,links,add=>{
  for(let py=box[1];py<box[3];py++)for(let px=box[0];px<box[2];px++){
   const pixel=py*width+px;if(mask[pixel]!==1)continue;
   if((px>0&&mask[pixel-1]!==1)||(px+1<width&&mask[pixel+1]!==1)||
      (py>0&&mask[pixel-width]!==1)||(py+1<height&&mask[pixel+width]!==1))add(pixel);
  }
 },240);
 const coarse=noiseGrid(width,height,48,draw),fine=noiseGrid(width,height,24,draw);
 const field=new Float32Array(count*2);let maxDistance=0;
 for(let py=0;py<height;py++)for(let px=0;px<width;px++){
  const pixel=py*width+px;
  if(fromSeed[pixel]<0){field[pixel*2]=-1;continue;}
  const noise=Math.fround(Math.fround(Math.fround(.5*coarse(px,py))+.25*fine(px,py))/.75);
  const distance=Math.max(0,fromSeed[pixel]/5+(noise-.5)*16);
  field[pixel*2]=distance;field[pixel*2+1]=fromEdge[pixel]<0?48:fromEdge[pixel]/5;
  maxDistance=Math.max(maxDistance,distance);
 }
 return {field,box,maxDistance,count:tail};
}
