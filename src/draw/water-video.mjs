// SPDX-License-Identifier: AGPL-3.0-only
import {admitPaintReplay} from './paint-history.mjs';
import {replayWaterFrames} from './agent-paint.mjs';
import {WaterMP4,WATER_VIDEO_MAX_BYTES} from './water-mp4.mjs';
export {WATER_VIDEO_MAX_BYTES};
const failure=(code,message)=>Object.assign(new Error(message),{code});
const stopped=signal=>{if(signal?.aborted)throw Object.assign(new Error('Video export canceled.'),{name:'AbortError'});};
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const sameScale=(a,b)=>Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(a),Math.abs(b));

export function waterVideoPlan(raw,{framing='square',duration=15}={}){
 const replay=admitPaintReplay(raw);
 if(!replay||replay.mode!=='water'||!replay.entries.length||replay.entries.some(entry=>entry.mode!=='water'))throw failure('water_video_source','This layer has no complete Water replay.');
 if(!['square','portrait'].includes(framing)||!Number.isFinite(duration)||duration<3||duration>59)throw failure('water_video_options','Choose a video from 3 to 59 seconds, square or 9:16.');
 let x=0,y=0,width=replay.px[0],height=replay.px[1],live=null,viewIndex=0,total=0;
 const entries=[];
 for(let index=0;index<=replay.entries.length;index++){
  const view=replay.views?.[viewIndex];
  if(view?.at===index){const crop=view.crop;if(crop[2]>=width||crop[3]>=height)throw failure('water_video_source','The replay crop leaves its painting.');x+=crop[0];y+=crop[1];width=crop[2]-crop[0]+1;height=crop[3]-crop[1]+1;live=null;viewIndex++;}
  const entry=replay.entries[index];if(!entry)break;
  if(entry.resume){if(entry.resume.px[0]!==width||entry.resume.px[1]!==height||!sameScale(entry.resume.scale,replay.scale))throw failure('water_video_source','The saved Water boundary does not fit the replay.');live=null;}
  if(entry.actor==='agent'){
   const [left,top,right,bottom]=entry.grow;x-=left;y-=top;width+=left+right;height+=top+bottom;
   if(width!==entry.px[0]||height!==entry.px[1]||!sameScale(entry.scale,replay.scale))throw failure('water_video_source','The replay growth does not match its painting.');
   live={id:null,x,y,width,height};
  }else{
   const sheet=entry.sheet;
   if(!live||live.id!==sheet.id){
    if(sheet.offset[0]<0||sheet.offset[1]<0||sheet.offset[0]+width>sheet.width||sheet.offset[1]+height>sheet.height||!sameScale(sheet.scale*3,replay.scale))throw failure('water_video_source','The replay sheet does not hold its painting.');
    live={id:sheet.id,x:x-sheet.offset[0],y:y-sheet.offset[1],width:sheet.width,height:sheet.height};
   }
   const crop=entry.crop;if(crop[2]>=live.width||crop[3]>=live.height)throw failure('water_video_source','The replay crop leaves its sheet.');
   x=live.x+crop[0];y=live.y+crop[1];width=crop[2]-crop[0]+1;height=crop[3]-crop[1]+1;
  }
  const actions=(entry.removed?entry.actions.filter(action=>action.kind==='tip'):entry.actions).map(action=>{
   const paths=action.paths?.map(path=>path.length)??[],units=action.kind==='stroke'?paths.reduce((n,count)=>n+count,0):action.kind==='fill'?1:0;
   const planned={start:total,units,paths};total+=units;return planned;
  });
  entries.push({x:live.x,y:live.y,actions});
 }
 if(!total)throw failure('water_video_source','This layer has no kept Water strokes to replay.');
 const fps=30,frames=Math.round(duration*fps),intro=12,outro=30;
 return {replay,entries,total,view:{x,y,width,height},width:framing==='square'?720:540,height:framing==='square'?720:960,fps,frames,intro,outro,duration:frames/fps};
}

const FRAMES={square:[[1080,1080,'avc1.420028',8e6],[720,720,'avc1.42001f',6e6]],portrait:[[1080,1920,'avc1.420028',8e6],[540,960,'avc1.42001f',6e6]]};
async function videoConfig(framing,fps=30){
 if(typeof VideoEncoder!=='function'||typeof VideoFrame!=='function'||typeof OffscreenCanvas!=='function')throw failure('water_video_unavailable','This Android WebView cannot encode a video. Update Android System WebView and try again.');
 for(const [width,height,codec,bitrate] of FRAMES[framing]??[]){
  const config={codec,width,height,framerate:fps,bitrate,bitrateMode:'variable',latencyMode:'quality',avc:{format:'avc'},alpha:'discard'};
  for(const hardwareAcceleration of ['prefer-hardware','no-preference'])if((await VideoEncoder.isConfigSupported({...config,hardwareAcceleration})).supported)return {...config,hardwareAcceleration};
 }
 throw failure('water_video_unavailable','This Android WebView cannot encode H.264 video. Update Android System WebView and try again.');
}
export async function waterVideoFrame(framing){const {width,height}=await videoConfig(framing);return {width,height};}

export async function exportDrawingVideo({steps=[],ground,final,framing='square',duration=15,signal,onProgress}={}){
 stopped(signal);
 if(!['square','portrait'].includes(framing)||!Number.isFinite(duration)||duration<3||duration>59)throw failure('water_video_options','Choose a video from 3 to 59 seconds, square or 9:16.');
 if(!steps.length)throw failure('water_video_source','Draw or paint something first.');
 const fps=30,config=await videoConfig(framing,fps),plan={fps,frames:Math.round(duration*fps),width:config.width,height:config.height},intro=12,outro=30,fade=12;stopped(signal);
 const weights=steps.map(step=>{
  if(step.kind==='water')step.plan=waterVideoPlan(step.replay);
  return Math.max(24,step.kind==='water'?Math.max(step.plan.total*6,Math.hypot(step.matrix[0],step.matrix[1])*step.plan.view.width):step.kind==='mark'?step.line.reduce((n,p,i)=>i?n+Math.hypot(p[0]-step.line[i-1][0],p[1]-step.line[i-1][1]):0,0):step.box.w);
 }),total=weights.reduce((a,b)=>a+b,0),body=plan.frames-intro-outro;
 const muxer=new WaterMP4(plan),surface=()=>{const c=new OffscreenCanvas(plan.width,plan.height);return [c,c.getContext('2d',{alpha:false})];};
 const [canvas,context]=surface(),[done,doneContext]=surface(),readout=new OffscreenCanvas(1,1),readContext=readout.getContext('2d');
 if(!context||!doneContext||!readContext)throw failure('water_video_unavailable','Video export could not open its drawing surface.');
 let encoder=null,error=null,frame=0,encoded=0;
 const check=()=>{stopped(signal);if(error)throw error;};
 const abort=()=>{if(encoder&&encoder.state!=='closed')encoder.close();};
 const progress=phase=>onProgress?.({phase,completed:frame,total:plan.frames,fraction:Math.min(.99,frame/plan.frames)});
 async function drain(){
  try{await encoder.flush();}catch(cause){check();throw cause;}
  check();if(encoded!==frame)throw failure('water_video_invalid','The video encoder omitted a frame.');
 }
 async function encodeTo(count){
  while(frame<count){
   check();
   if(frame-encoded>=4)await drain();
   const timestamp=Math.round(frame*1000000/plan.fps),end=Math.round((frame+1)*1000000/plan.fps),image=new VideoFrame(canvas,{timestamp,duration:end-timestamp});
   try{encoder.encode(image,{keyFrame:frame%(plan.fps*2)===0});}finally{image.close();}
   frame++;progress('encoding');if(frame%4===0)await pause();
  }
 }
 const begin=()=>{context.globalAlpha=1;context.drawImage(done,0,0);};
 async function water(step,first,last){
  const plan_=step.plan;let entryIndex=0,entryAnchor=null;
  async function draw(live){
   check();begin();
   const placement=plan_.entries[entryIndex],x=placement.x+live.origin[0]-entryAnchor[0]-plan_.view.x,y=placement.y+live.origin[1]-entryAnchor[1]-plan_.view.y;
   const x0=Math.max(0,-x),y0=Math.max(0,-y),x1=Math.min(live.width,plan_.view.width-x),y1=Math.min(live.height,plan_.view.height-y);
   if(x1<=x0||y1<=y0)return;
   const pixels=await live.gpu.read({box:[x0,y0,x1,y1]});check();
   readout.width=x1-x0;readout.height=y1-y0;readContext.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer,pixels.byteOffset,pixels.byteLength),x1-x0,y1-y0),0,0);
   context.setTransform(...step.matrix);context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(readout,x+x0,y+y0);context.resetTransform();
  }
  await replayWaterFrames(step.replay,{signal,
   async onEntry({surface:live,index}){check();entryIndex=index;entryAnchor=live.origin.slice();},
   async onStep({surface:live,index,action,step:at,complete}){
    check();const laid=plan_.entries[index].actions[action];if(!laid.units)return;
    const units=complete?laid.units:Number.isSafeInteger(at?.path)&&Number.isSafeInteger(at?.point)?laid.paths.slice(0,at.path).reduce((n,count)=>n+count,0)+at.point+1:0;
    const count=first+Math.floor((laid.start+units)/plan_.total*(last-first));
    if(count>frame){await draw(live);await encodeTo(count);}
   }});
 }
 try{
  encoder=new VideoEncoder({output(chunk,metadata){
   if(error||signal?.aborted)return;
   try{if(chunk.byteLength+65536>WATER_VIDEO_MAX_BYTES-muxer.bytes)throw failure('water_video_budget','Video too long to share. Choose a shorter one.');const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);muxer.add(data,{timestamp:chunk.timestamp,key:chunk.type==='key',description:metadata?.decoderConfig?.description});encoded++;}
   catch(cause){error=cause;abort();}
  },error(cause){error=cause;}});
  signal?.addEventListener('abort',abort,{once:true});check();encoder.configure(config);progress('preparing');
  doneContext.drawImage(await ground(),0,0);check();begin();await encodeTo(intro);
  let reached=0;
  for(const [index,step]of steps.entries()){
   const first=intro+Math.round(reached/total*body),last=intro+Math.round((reached+=weights[index])/total*body),image=await step.image();check();
   if(step.kind==='water')await water(step,first,last);
   else for(let at=frame;at<last;at++){
    const t=(at-first+1)/Math.max(1,last-first);begin();
    if(step.kind==='reveal'){context.save();context.beginPath();context.rect(step.box.x,step.box.y,step.box.w*t,step.box.h);context.clip();context.drawImage(image,0,0);context.restore();}
    else{
     const line=step.line,length=weights[index]*t;context.beginPath();context.moveTo(...line[0]);
     for(let i=1,run=0;i<line.length;i++){const a=line[i-1],b=line[i],span=Math.hypot(b[0]-a[0],b[1]-a[1]);if(run+span>=length){const k=span?(length-run)/span:1;context.lineTo(a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k);break;}context.lineTo(...b);run+=span;}
     context.lineCap=context.lineJoin='round';context.lineWidth=step.width;context.strokeStyle=step.colour;context.stroke();
    }
    await encodeTo(at+1);
   }
   doneContext.drawImage(image,0,0);begin();await encodeTo(last);
  }
  const kept=await final();check();
  for(let at=0;frame<plan.frames;at++){begin();context.globalAlpha=Math.min(1,(at+1)/fade);context.drawImage(kept,0,0);await encodeTo(frame+1);}
  check();progress('finishing');await drain();const blob=muxer.finish(plan.frames);
  onProgress?.({phase:'complete',completed:plan.frames,total:plan.frames,fraction:1});
  return {blob,type:'video/mp4',width:plan.width,height:plan.height,duration:plan.frames/fps,frames:plan.frames};
 }finally{
  signal?.removeEventListener('abort',abort);try{if(encoder&&encoder.state!=='closed')encoder.close();}finally{muxer.close();for(const c of [canvas,done,readout])c.width=c.height=1;}
 }
}
