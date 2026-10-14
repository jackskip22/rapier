// SPDX-License-Identifier: AGPL-3.0-only
export const WATER_VIDEO_MAX_BYTES=64*1024*1024;
const fail=message=>Object.assign(new Error(message),{code:'water_video_invalid'});
const u16=value=>Uint8Array.of(value>>>8,value&255);
const u32=value=>Uint8Array.of(value>>>24,(value>>>16)&255,(value>>>8)&255,value&255);
const ascii=value=>Uint8Array.from(value,letter=>letter.charCodeAt(0));
const zeros=count=>new Uint8Array(count);
function join(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;}
const box=(type,...parts)=>join([u32(8+parts.reduce((n,p)=>n+p.length,0)),ascii(type),...parts]);
const full=(type,flags,...parts)=>box(type,u32(flags),...parts);
const matrix=join([u32(65536),u32(0),u32(0),u32(0),u32(65536),u32(0),u32(0),u32(0),u32(1073741824)]);
const ftyp=box('ftyp',ascii('isom'),u32(512),ascii('isomiso2avc1mp41'));

function configuration(raw){
 const bytes=raw instanceof ArrayBuffer?new Uint8Array(raw):ArrayBuffer.isView(raw)?new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength):null;
 if(!bytes||bytes.length<7||bytes.length>65536||bytes[0]!==1||bytes[1]!==66)throw fail('The video encoder did not return baseline AVC.');
 const lengthSize=(bytes[4]&3)+1;if(lengthSize===3)throw fail('The AVC sample length is not valid.');
 let at=6,sps=bytes[5]&31;if(!sps)throw fail('The AVC sequence configuration is missing.');
 for(const [count,type]of [[sps,7],[null,8]]){
  const n=count??bytes[at++];if(!n)throw fail('The AVC picture configuration is missing.');
  for(let i=0;i<n;i++){const size=bytes[at]*256+bytes[at+1];at+=2;if(!size||at+size>bytes.length||(bytes[at]&31)!==type)throw fail('The AVC configuration is incomplete.');at+=size;}
 }
 if(at!==bytes.length)throw fail('The AVC configuration has trailing data.');
 return {bytes:bytes.slice(),lengthSize};
}
function validateSample(bytes,lengthSize,key){
 let at=0,picture=false,idr=false;
 while(at<bytes.length){
  if(at+lengthSize>bytes.length)throw fail('The video sample length is incomplete.');
  let size=0;for(let i=0;i<lengthSize;i++)size=size*256+bytes[at++];
  if(!size||at+size>bytes.length)throw fail('The video sample is incomplete.');
  const type=bytes[at]&31;if(type===1||type===5)picture=true;if(type===5)idr=true;at+=size;
 }
 if(!picture||idr!==key)throw fail('The video sample does not match its sync marker.');
}
function movie({width,height,fps,sizes,keys,description},offset){
 const duration=sizes.length*1000,timescale=fps*1000;
 const mvhd=full('mvhd',0,u32(0),u32(0),u32(timescale),u32(duration),u32(65536),u16(256),zeros(10),matrix,zeros(24),u32(2));
 const tkhd=full('tkhd',7,u32(0),u32(0),u32(1),u32(0),u32(duration),zeros(8),zeros(8),matrix,u32(width*65536),u32(height*65536));
 const mdhd=full('mdhd',0,u32(0),u32(0),u32(timescale),u32(duration),u16(0x55c4),u16(0));
 const hdlr=full('hdlr',0,u32(0),ascii('vide'),zeros(12),ascii('Video\0'));
 const avc1=box('avc1',zeros(6),u16(1),zeros(16),u16(width),u16(height),u32(72*65536),u32(72*65536),u32(0),u16(1),zeros(32),u16(24),u16(65535),box('avcC',description));
 const stbl=box('stbl',full('stsd',0,u32(1),avc1),full('stts',0,u32(1),u32(sizes.length),u32(1000)),
  full('stsc',0,u32(1),u32(1),u32(sizes.length),u32(1)),full('stsz',0,u32(0),u32(sizes.length),...sizes.map(u32)),
  full('stco',0,u32(1),u32(offset)),full('stss',0,u32(keys.length),...keys.map(u32)));
 const minf=box('minf',full('vmhd',1,zeros(8)),box('dinf',full('dref',0,u32(1),full('url ',1))),stbl);
 return box('moov',mvhd,box('trak',tkhd,box('mdia',mdhd,hdlr,minf)));
}

export class WaterMP4 {
 constructor({width,height,fps=30,maxBytes=WATER_VIDEO_MAX_BYTES}){
  if(![width,height].every(n=>Number.isSafeInteger(n)&&n>=2&&n<=4096&&n%2===0)||!Number.isSafeInteger(fps)||fps<1||fps>60||!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>WATER_VIDEO_MAX_BYTES)throw fail('The video dimensions or budget are not valid.');
  Object.assign(this,{width,height,fps,maxBytes,bytes:0,parts:[],sizes:[],keys:[],description:null,lengthSize:0,closed:false});
 }
 add(data,{timestamp,key,description}={}){
  if(this.closed)throw fail('The video writer is closed.');
  if(description){const next=configuration(description);if(this.description&&(next.bytes.length!==this.description.length||next.bytes.some((value,index)=>value!==this.description[index])))throw fail('The video encoder changed its configuration.');this.description=next.bytes;this.lengthSize=next.lengthSize;}
  if(!this.description)throw fail('The video encoder omitted its AVC configuration.');
  if(!(data instanceof Uint8Array)||!data.length||this.sizes.length>=3600||typeof key!=='boolean'||timestamp!==Math.round(this.sizes.length*1000000/this.fps)||!this.sizes.length&&!key)throw fail('The video encoder omitted or reordered a frame.');
  if(this.bytes+data.length+65536>this.maxBytes)throw Object.assign(new Error('The video exceeds the app’s share limit. Choose a shorter duration.'),{code:'water_video_budget'});
  validateSample(data,this.lengthSize,key);
  this.parts.push(new Blob([data]));this.sizes.push(data.length);this.bytes+=data.length;if(key)this.keys.push(this.sizes.length);
 }
 finish(expectedFrames=this.sizes.length){
  if(this.closed||!this.sizes.length||this.sizes.length!==expectedFrames)throw fail('The video encoder did not return every frame.');
  const head=movie(this,0),moov=movie(this,ftyp.length+head.length+8),mdat=join([u32(this.bytes+8),ascii('mdat')]);
  if(ftyp.length+moov.length+8+this.bytes>this.maxBytes)throw fail('The video file exceeds its budget.');
  const blob=new Blob([ftyp,moov,mdat,...this.parts],{type:'video/mp4'});this.close();return blob;
 }
 close(){this.closed=true;this.parts.length=0;this.sizes.length=0;this.keys.length=0;this.description=null;this.bytes=0;}
}
