// SPDX-License-Identifier: AGPL-3.0-only
import {admitPaintReplay} from './paint-history.mjs';
import {replayWaterFrames} from './agent-paint.mjs';
import {paperTileFromGPU} from './water.mjs';
import {decodePaintRaster} from '../images/paint-raster.mjs';
import {WaterMP4,WATER_VIDEO_MAX_BYTES} from './water-mp4.mjs';
export {WATER_VIDEO_MAX_BYTES};
const failure=(code,message)=>Object.assign(new Error(message),{code});
const stopped=signal=>{if(signal?.aborted)throw Object.assign(new Error('Video export cancelled.'),{name:'AbortError'});};
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

async function videoConfig(plan){
 if(typeof VideoEncoder!=='function'||typeof VideoFrame!=='function'||typeof OffscreenCanvas!=='function')throw failure('water_video_unavailable','This Android WebView cannot encode a video. Update Android System WebView and try again.');
 const config={codec:'avc1.42001f',width:plan.width,height:plan.height,framerate:plan.fps,bitrate:6000000,bitrateMode:'variable',latencyMode:'quality',hardwareAcceleration:'prefer-hardware',avc:{format:'avc'},alpha:'discard'};
 const supported=await VideoEncoder.isConfigSupported(config);
 if(!supported.supported)throw failure('water_video_unavailable','This Android WebView cannot encode H.264 video. Update Android System WebView and try again.');
 return config;
}

export async function exportWaterVideo({replay,raster,framing='square',duration=15,signal,onProgress}={}){
 stopped(signal);const plan=waterVideoPlan(replay,{framing,duration}),config=await videoConfig(plan);stopped(signal);
 if(typeof raster!=='string'||!/^data:image\/(png|jxl);base64,/.test(raster))throw failure('water_video_source','The finished painting is required to export its video.');
 const muxer=new WaterMP4(plan),canvas=new OffscreenCanvas(plan.width,plan.height),context=canvas.getContext('2d',{alpha:false});
 const readout=new OffscreenCanvas(1,1),readContext=readout.getContext('2d',{alpha:false});
 if(!context||!readContext)throw failure('water_video_unavailable','Video export could not open its drawing surface.');
 const scale=Math.min(plan.width/plan.view.width,plan.height/plan.view.height),left=(plan.width-plan.view.width*scale)/2,top=(plan.height-plan.view.height*scale)/2;
 let encoder=null,error=null,frame=0,encoded=0,paperId=null,tile=null,pattern=null,entryAnchor=null,entryIndex=0,initial=false;
 const check=()=>{stopped(signal);if(error)throw error;};
 const abort=()=>{if(encoder&&encoder.state!=='closed')encoder.close();};
 const progress=phase=>onProgress?.({phase,completed:frame,total:plan.frames,fraction:Math.min(.99,frame/plan.frames)});
 async function drain(){
  try{await encoder.flush();}catch(cause){check();throw cause;}
  check();if(encoded!==frame)throw failure('water_video_invalid','The video encoder omitted a frame.');
 }
 async function paper(surface){
  if(paperId===surface.paperId)return;
  check();const pixels=await paperTileFromGPU(surface.paperId);check();
  tile ||= new OffscreenCanvas(pixels.width,pixels.height);const rgba=new Uint8ClampedArray(pixels.width*pixels.height*4);
  for(let index=0;index<pixels.width*pixels.height;index++){rgba[index*4]=pixels.rgb[index*3];rgba[index*4+1]=pixels.rgb[index*3+1];rgba[index*4+2]=pixels.rgb[index*3+2];rgba[index*4+3]=255;}
  tile.getContext('2d',{alpha:false}).putImageData(new ImageData(rgba,pixels.width,pixels.height),0,0);pattern=context.createPattern(tile,'repeat');paperId=surface.paperId;
 }
 async function draw(surface){
  check();await paper(surface);
  const placement=plan.entries[entryIndex],x=placement.x+surface.origin[0]-entryAnchor[0],y=placement.y+surface.origin[1]-entryAnchor[1];
  const dx=left+(x-plan.view.x)*scale,dy=top+(y-plan.view.y)*scale,paperScale=surface.gpu.paperScale,unit=scale/paperScale;
  const tx=dx-surface.gpu.paperOrigin[0]*scale,ty=dy+(surface.height+surface.gpu.paperOrigin[1])*scale;
  context.setTransform(unit,0,0,unit,tx,ty);context.fillStyle=pattern;context.fillRect(-tx/unit,-ty/unit,plan.width/unit,plan.height/unit);context.resetTransform();
  const x0=Math.max(0,plan.view.x-x),y0=Math.max(0,plan.view.y-y),x1=Math.min(surface.width,plan.view.x+plan.view.width-x),y1=Math.min(surface.height,plan.view.y+plan.view.height-y);
  if(x1>x0&&y1>y0){
   const pixels=await surface.gpu.read({paper:true,box:[x0,y0,x1,y1]});check();
   const width=x1-x0,height=y1-y0;readout.width=width;readout.height=height;readContext.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer,pixels.byteOffset,pixels.byteLength),width,height),0,0);
   context.save();context.beginPath();context.rect(left,top,plan.view.width*scale,plan.view.height*scale);context.clip();context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(readout,dx+x0*scale,dy+y0*scale,width*scale,height*scale);context.restore();
  }
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
 try{
  encoder=new VideoEncoder({output(chunk,metadata){
   if(error||signal?.aborted)return;
   try{if(chunk.byteLength+65536>WATER_VIDEO_MAX_BYTES-muxer.bytes)throw failure('water_video_budget','The video exceeds the app’s share limit. Choose a shorter duration.');const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);muxer.add(data,{timestamp:chunk.timestamp,key:chunk.type==='key',description:metadata?.decoderConfig?.description});encoded++;}
   catch(cause){error=cause;abort();}
  },error(cause){error=cause;}});
  signal?.addEventListener('abort',abort,{once:true});check();encoder.configure(config);progress('preparing');
  await replayWaterFrames(plan.replay,{signal,
   async onEntry({surface,index}){check();entryIndex=index;entryAnchor=surface.origin.slice();if(!initial){await draw(surface);await encodeTo(plan.intro);initial=true;}},
   async onStep({surface,index,action,step,complete}){
    check();const progress=plan.entries[index].actions[action];if(!progress.units)return;
    const laid=complete?progress.units:Number.isSafeInteger(step?.path)&&Number.isSafeInteger(step?.point)?progress.paths.slice(0,step.path).reduce((n,count)=>n+count,0)+step.point+1:0;
    const count=plan.intro+Math.floor((progress.start+laid)/plan.total*(plan.frames-plan.intro-plan.outro));
    if(count>frame){await draw(surface);await encodeTo(count);}
   },
   async onFinish({surface,crop}){
    const pixels=await decodePaintRaster(raster,{signal});check();
    if(!pixels||pixels.width!==plan.view.width||pixels.height!==plan.view.height)throw failure('water_video_source','The finished painting does not match its replay.');
    await surface.clear();await surface.reframe(pixels.width,pixels.height,-crop[0],-crop[1]);await surface.fromRGBA8(pixels.data,pixels.width,pixels.height);
    entryAnchor=surface.origin.slice();const last=plan.entries[entryIndex];last.x=plan.view.x;last.y=plan.view.y;
    await draw(surface);await encodeTo(plan.frames);
   }
  });
  check();progress('finishing');await drain();const blob=muxer.finish(plan.frames);
  onProgress?.({phase:'complete',completed:plan.frames,total:plan.frames,fraction:1});
  return {blob,type:'video/mp4',width:plan.width,height:plan.height,duration:plan.duration,frames:plan.frames};
 }finally{
  signal?.removeEventListener('abort',abort);try{if(encoder&&encoder.state!=='closed')encoder.close();}finally{muxer.close();canvas.width=canvas.height=readout.width=readout.height=1;if(tile)tile.width=tile.height=1;}
 }
}
