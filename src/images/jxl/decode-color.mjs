// SPDX-License-Identifier: MIT
import {xybKernelConstants} from './vardct-render-base.mjs';
import {requireDecode} from './decode-bits.mjs';
import {signature, nativeEncoding} from './color-encoding.mjs';
export {nativeEncoding};
import {part} from './decode-parts.mjs';
import {decodeKernels} from './decode-kernels.mjs';
import {D50,SRGB_D50,D50_SRGB,IDENTITY3,adaptWhite,whiteXYZ,primariesXYZ,floatColorMatrix,inverse3,multiply3,transferCurve,hlgScale} from './decode-color-math.mjs';
import {OP,convertPixels,throughKernels,curveTable} from './decode-color-program.mjs';

const SRGB={space:'rgb',wantICC:false,whitePoint:'d65',primaries:'srgb',transferFunction:'srgb',renderingIntent:1};
const LINEAR_SRGB={...SRGB,transferFunction:'linear'};
export function targetEncoding(option) {
  if(option&&typeof option==='object') {
    requireDecode(!Array.isArray(option)&&['rgb','gray','xyb'].includes(option.space),'Invalid structured JPEG XL output color space.');
    requireDecode(!option.wantICC&&option.iccSpace==null,'A structured output encoding cannot supply an ICC profile.');
    const gamma=option.gamma!==undefined;
    requireDecode(!gamma||Number.isFinite(option.gamma)&&option.gamma>0,'Invalid JPEG XL output gamma.');
    requireDecode(!gamma||option.transferFunction===undefined||option.transferFunction==='gamma','JPEG XL output gamma conflicts with its transfer function.');
    requireDecode(option.transferFunction!=='gamma'||gamma,'JPEG XL gamma output needs an exponent.');
    requireDecode(option.renderingIntent===undefined||Number.isInteger(option.renderingIntent)&&option.renderingIntent>=0&&option.renderingIntent<=3,'Invalid JPEG XL output rendering intent.');
    if(option.space==='xyb') {
      requireDecode((!gamma||option.gamma===1/3)&&(option.transferFunction===undefined||option.transferFunction==='gamma'),'XYB output has an implicit transfer function.');
      return {wantICC:false,whitePoint:'d65',renderingIntent:0,...option,transferFunction:'gamma',gamma:1/3};
    }
    return {wantICC:false,whitePoint:'d65',primaries:'srgb',renderingIntent:1,...option,transferFunction:option.transferFunction??(gamma?'gamma':'srgb')};
  }
  if(option==='srgb')return {...SRGB};
  if(option==='linear-srgb')return {...LINEAR_SRGB};
  if(option==='display-p3'||option==='rec2020')return {...SRGB,primaries:option};
  if(option==='xyb')return {space:'xyb',wantICC:false,whitePoint:'d65',transferFunction:'gamma',gamma:1/3,renderingIntent:0};
  requireDecode(false,'Unknown JPEG XL output color space.');
}
function finish(frame,planes,encoding,icc=undefined,extraChannels=frame.extraChannels) {
  return {...frame,planes,widths:planes.map(()=>frame.width),heights:planes.map(()=>frame.height),extraChannels,colorEncoding:encoding,icc,ctDone:true};
}
function xybConstants(h,transform) {
  const f=Math.fround,{inverseMatrix,opsinBiases}=h.opsinInverseMatrix;
  return xybKernelConstants(transform===IDENTITY3?inverseMatrix.map(f):multiply3(transform,inverseMatrix.map(f)).map(f),opsinBiases,h.toneMapping.intensityTarget);
}
export function xybSrgbConstants(h,encoding=nativeEncoding(h)) {
  let transform=IDENTITY3;
  if(encoding.primaries!=='srgb'||encoding.whitePoint!=='d65')
    transform=multiply3(inverse3(floatColorMatrix(encoding.primaries,encoding.whitePoint).pcs).map(Math.fround),floatColorMatrix().pcs).map(Math.fround);
  return xybConstants(h,transform);
}
export function xybToRGBA8(planes,srcWidth,sx0,sy0,width,height,h,dst,dstWidth,dx0,dy0,constants=xybSrgbConstants(h)) {
  if(width<=0||height<=0)return dst;
  const kernels=decodeKernels(),contiguous=sx0===0&&width===srcWidth&&dx0===0&&width===dstWidth;
  if(contiguous) {
    const total=width*height,chunk=Math.min(total,65536),at=kernels.reserve([chunk*4,chunk*4,chunk*4,chunk*4]);
    const kx=new Float32Array(kernels.buffer,at[0],chunk),ky=new Float32Array(kernels.buffer,at[1],chunk),kb=new Float32Array(kernels.buffer,at[2],chunk);
    const out=new Uint8Array(kernels.buffer,at[3],chunk*4),sBase=sy0*srcWidth,dBase=dy0*dstWidth*4;
    for(let i=0;i<total;i+=chunk) {
      const m=Math.min(chunk,total-i);
      kx.set(planes[0].subarray(sBase+i,sBase+i+m));
      ky.set(planes[1].subarray(sBase+i,sBase+i+m));
      kb.set(planes[2].subarray(sBase+i,sBase+i+m));
      kernels.xyb(m,kx.subarray(0,m),ky.subarray(0,m),kb.subarray(0,m),constants,out.subarray(0,m*4));
      dst.set(out.subarray(0,m*4),dBase+i*4);
    }
    return dst;
  }
  const rowsPerChunk=Math.max(1,Math.min(height,Math.floor(65536/width))),maxSamples=rowsPerChunk*width;
  const at=kernels.reserve([maxSamples*4,maxSamples*4,maxSamples*4,maxSamples*4]);
  const kx=new Float32Array(kernels.buffer,at[0],maxSamples),ky=new Float32Array(kernels.buffer,at[1],maxSamples),kb=new Float32Array(kernels.buffer,at[2],maxSamples);
  const out=new Uint8Array(kernels.buffer,at[3],maxSamples*4);
  for(let y=0;y<height;y+=rowsPerChunk) {
    const rows=Math.min(rowsPerChunk,height-y),m=rows*width;
    for(let r=0;r<rows;r++) {
      const sOff=(sy0+y+r)*srcWidth+sx0,kOff=r*width;
      kx.set(planes[0].subarray(sOff,sOff+width),kOff);
      ky.set(planes[1].subarray(sOff,sOff+width),kOff);
      kb.set(planes[2].subarray(sOff,sOff+width),kOff);
    }
    kernels.xyb(m,kx.subarray(0,m),ky.subarray(0,m),kb.subarray(0,m),constants,out.subarray(0,m*4));
    for(let r=0;r<rows;r++)dst.set(out.subarray(r*width*4,(r+1)*width*4),((dy0+y+r)*dstWidth+dx0)*4);
  }
  return dst;
}
export function materializePostColor(ref,h) {
  if(ref&&!ref.planes&&ref.xybPlanes) {
    ref.planes=xybToEnum({width:ref.width,height:ref.height,planes:ref.xybPlanes,extraChannels:ref.extraChannels},h,ref.colorEncoding,true).planes;
    ref.xybPlanes=null;ref.rgba8=null;
  }
  return ref;
}
function xybInverse(h,transform=IDENTITY3) {
  const {bias,root,m}=xybConstants(h,transform);
  return {op:OP.xybInverse,data:Float64Array.of(...bias,...root,...m)};
}
const curveOp=(c,curve,gammaZero=false)=>({op:OP.curve,a:c,b:gammaZero?1:0,curve});
function xybToEnum(frame,h,encoding,inPlace=false,rgba8=null) {
  const gray=encoding.space==='gray',n=frame.width*frame.height,native=primariesXYZ(gray?'srgb':encoding.primaries,encoding.whitePoint);
  let transform=IDENTITY3;
  if(gray) {
    const y=encoding.whitePoint==='d65'?[0.2126,0.7152,0.0722]:multiply3(adaptWhite(whiteXYZ(),whiteXYZ(encoding.whitePoint)),primariesXYZ()).slice(3,6);
    transform=[...y,...y,...y];
  } else if(encoding.primaries!=='srgb'||encoding.whitePoint!=='d65')transform=multiply3(inverse3(floatColorMatrix(encoding.primaries,encoding.whitePoint).pcs).map(Math.fround),floatColorMatrix().pcs).map(Math.fround);
  const fast=!gray&&(encoding.transferFunction??(encoding.gamma===undefined?'srgb':'gamma'))==='srgb',kernels=decodeKernels();
  if(fast) {
    const constants=xybConstants(h,transform);
    if(inPlace&&frame.planes.every(p=>p.buffer===kernels.buffer)) {
      const planes=frame.planes;
      if(rgba8){requireDecode(rgba8.buffer===kernels.buffer,'RGBA8 rows are outside the kernels.');kernels.xyb(n,planes[0],planes[1],planes[2],constants,rgba8);return {...finish(frame,planes,encoding),rgba8};}
      kernels.xyb(n,planes[0],planes[1],planes[2],constants);
      for(const p of planes)kernels.srgb(p.subarray(0,n));
      return finish(frame,planes,encoding);
    }
    const planes=inPlace?frame.planes.slice(0,3):[0,1,2].map(()=>new Float32Array(n));
    throughKernels(n,frame.planes.slice(0,3),planes,(count,[x,y,b])=>{kernels.xyb(count,x,y,b,constants);kernels.srgb(x);kernels.srgb(y);kernels.srgb(b);});
    return finish(frame,planes,encoding);
  }
  const curve=transferCurve(encoding,false,h.toneMapping.intensityTarget),gamma=encoding.transferFunction==='gamma'||encoding.transferFunction==='dci';
  const exponent=encoding.transferFunction==='hlg'?hlgScale(h.toneMapping.intensityTarget,true):0,luminance=native.slice(3,6);
  const planes=inPlace?frame.planes.slice(0,gray?1:3):Array.from({length:gray?1:3},()=>new Float32Array(n));
  const to=[xybInverse(h,transform),...(exponent?[{op:OP.hlgOotf,data:Float64Array.of(...luminance,exponent)}]:[]),...planes.map((_,c)=>curveOp(c,curve,gamma))];
  convertPixels(n,{inputs:frame.planes.slice(0,3),outputs:planes,to});
  return finish(frame,planes,encoding);
}
function xybForward(h) {
  const m=inverse3(h.opsinInverseMatrix.inverseMatrix),bias=h.opsinInverseMatrix.opsinBiases,root=bias.map(Math.cbrt),scale=h.toneMapping.intensityTarget/255;
  return {op:OP.xybForward,data:Float64Array.of(...m,...bias,...root,scale)};
}
function enumToPCS(encoding,h) {
  if(encoding.space==='xyb')return [{op:OP.xybUnscale},xybInverse(h),{op:OP.vector3,data:Float64Array.from(SRGB_D50)}];
  requireDecode(encoding.space==='rgb'||encoding.space==='gray','Cannot convert unspecified native JPEG XL channels.');
  const gray=encoding.space==='gray',white=whiteXYZ(encoding.whitePoint),native=primariesXYZ(gray?'srgb':encoding.primaries,encoding.whitePoint),matrix=multiply3(adaptWhite(white,D50),native);
  const curve=transferCurve(encoding,true,h.toneMapping.intensityTarget),ootf=encoding.transferFunction==='hlg'?hlgScale(h.toneMapping.intensityTarget):0,luminance=native.slice(3,6);
  return [curveOp(0,curve),...(gray?[{op:OP.grayAll}]:[curveOp(1,curve),curveOp(2,curve)]),...(ootf?[{op:OP.hlgOotf,data:Float64Array.of(...luminance,ootf)}]:[]),{op:OP.vector3,data:Float64Array.from(matrix)}];
}
function enumFromPCS(encoding,h) {
  if(encoding.space==='xyb')return [{op:OP.vector3,data:Float64Array.from(D50_SRGB)},xybForward(h)];
  requireDecode(encoding.space==='rgb'||encoding.space==='gray','Cannot convert to unspecified JPEG XL channels.');
  const gray=encoding.space==='gray',white=whiteXYZ(encoding.whitePoint),native=primariesXYZ(gray?'srgb':encoding.primaries,encoding.whitePoint),adapt=adaptWhite(D50,white),matrix=gray?adapt:multiply3(inverse3(native),adapt);
  const curve=transferCurve(encoding,false,h.toneMapping.intensityTarget),ootf=encoding.transferFunction==='hlg'?hlgScale(h.toneMapping.intensityTarget,true):0,luminance=native.slice(3,6);
  return [{op:OP.vector3,data:Float64Array.from(matrix)},...(gray?[{op:OP.grayFromY}]:[]),...(ootf?[{op:OP.hlgOotf,data:Float64Array.of(...luminance,ootf)}]:[]),
    curveOp(0,curve),...(gray?[]:[curveOp(1,curve),curveOp(2,curve)])];
}
export function sameEncoding(a,b) {
  return !a.wantICC&&!b.wantICC&&a.space===b.space&&a.transferFunction===b.transferFunction&&a.gamma===b.gamma&&JSON.stringify(a.whitePoint??'d65')===JSON.stringify(b.whitePoint??'d65')&&(a.space==='gray'||JSON.stringify(a.primaries??'srgb')===JSON.stringify(b.primaries??'srgb'));
}

const STEPS=65536,kept=[];
function keptTable(curve,key) {
  const at=kept.findIndex(t=>t.key===key);
  if(at>=0){const [table]=kept.splice(at,1);kept.push(table);return table;}
  const table={key,...curveTable(curve)};
  kept.push(table);if(kept.length>2)kept.shift();
  return table;
}
function enumModel(encoding,h,toLinear) {
  const tf=encoding.transferFunction??(encoding.gamma===undefined?'srgb':'gamma');
  if(encoding.wantICC||encoding.space!=='rgb'||tf==='hlg'||tf==='unknown')return null;
  const key=JSON.stringify([tf,encoding.gamma,toLinear,h.toneMapping.intensityTarget]),curve=transferCurve(encoding,toLinear,h.toneMapping.intensityTarget);
  const white=whiteXYZ(encoding.whitePoint),native=primariesXYZ(encoding.primaries,encoding.whitePoint);
  return {matrix:toLinear?multiply3(adaptWhite(white,D50),native):multiply3(inverse3(native),adaptWhite(D50,white)),curves:[curve,curve,curve],keys:[key,key,key]};
}
function quantizedJob(from,to,maximum) {
  const inTables=from.curves.map((c,i)=>keptTable(c,from.keys[i])),outTables=to.curves.map((c,i)=>keptTable(c,to.keys[i])),m=multiply3(to.matrix,from.matrix);
  const input=Math.max(...inTables.map(t=>t.error));
  return {tables:[...inTables,...outTables].map(t=>t.values),curves:from.curves,errors:outTables.map(t=>t.error),
    bounds:[0,3,6].map(r=>(Math.abs(m[r])+Math.abs(m[r+1])+Math.abs(m[r+2]))*input+1e-12),matrix:m,maximum};
}

const HDR_TF = new Set(['pq', 'hlg']);
const SDR_PEAK = 255;
const PQ_M1 = 2610 / 16384, PQ_M2 = (2523 / 4096) * 128;
const PQ_C1 = 3424 / 4096, PQ_C2 = (2413 / 4096) * 32, PQ_C3 = (2392 / 4096) * 32;
function pqEncoded(nits) {
  if (nits === 0) return 0;
  const s = nits < 0 ? -1 : 1, xp = Math.pow(Math.abs(nits) / 10000, PQ_M1);
  return s * Math.pow((PQ_C1 + xp * PQ_C2) / (1 + xp * PQ_C3), PQ_M2);
}
function pqDisplay(e) {
  if (e === 0) return 0;
  const s = e < 0 ? -1 : 1, xp = Math.pow(Math.abs(e), 1 / PQ_M2);
  return s * Math.pow(Math.max(xp - PQ_C1, 0) / (PQ_C2 - PQ_C3 * xp), 1 / PQ_M1) * 10000;
}
function gamutMapPixel(r, g, b, l0, l1, l2) {
  const L = l0 * r + l1 * g + l2 * b;
  let gSat = 0, gLum = 0;
  for (let k = 0; k < 3; k++) {
    const v = k === 0 ? r : k === 1 ? g : b, d = v - L, inv = 1 / (d === 0 ? 1 : d), vo = v * inv;
    if (d < 0 && vo > gSat) gSat = vo;
    const gl = d <= 0 ? gSat : vo - inv;
    if (gl > gLum) gLum = gl;
  }
  const mix = Math.max(0, Math.min(1, 0.1 * (gSat - gLum) + gLum));
  r += mix * (L - r); g += mix * (L - g); b += mix * (L - b);
  const invMax = 1 / Math.max(1, r, g, b);
  return [r * invMax, g * invMax, b * invMax];
}
function toneMapHDR(frame, h, source, target, preserveAssociation) {
  const n = frame.width * frame.height, grayIn = source.space === 'gray', grayOut = target.space === 'gray';
  const origPeak = h.toneMapping.intensityTarget > 0 ? h.toneMapping.intensityTarget : source.transferFunction === 'pq' ? 10000 : 1000;
  const srcXYZ = primariesXYZ(grayIn ? 'srgb' : source.primaries, source.whitePoint);
  const dstXYZ = primariesXYZ(grayOut ? 'srgb' : target.primaries, target.whitePoint);
  const [sl0, sl1, sl2] = srcXYZ.slice(3, 6), [dl0, dl1, dl2] = dstXYZ.slice(3, 6);
  const toLinear = [curveOp(0, transferCurve(source, true, origPeak)), ...(grayIn ? [{op: OP.grayAll}] : [curveOp(1, transferCurve(source, true, origPeak)), curveOp(2, transferCurve(source, true, origPeak))]),
    ...(source.transferFunction === 'hlg' ? [{op: OP.hlgOotf, data: Float64Array.of(sl0, sl1, sl2, hlgScale(origPeak))}] : [])];
  const lin = [0, 1, 2].map(() => new Float32Array(n));
  const firstAlpha = preserveAssociation ? frame.extraChannels?.find(c => c.type === 0) : null;
  const alpha = firstAlpha?.associated ? firstAlpha.data : null;
  convertPixels(n, {inputs: frame.planes.slice(0, grayIn ? 1 : 3), alpha, outputs: lin, to: toLinear});
  const srcToDst = multiply3(multiply3(inverse3(dstXYZ), adaptWhite(whiteXYZ(source.whitePoint), whiteXYZ(target.whitePoint))), srcXYZ);
  const samePrimaries = JSON.stringify(grayIn ? 'srgb' : source.primaries ?? 'srgb') === JSON.stringify(grayOut ? 'srgb' : target.primaries ?? 'srgb') &&
    JSON.stringify(source.whitePoint ?? 'd65') === JSON.stringify(target.whitePoint ?? 'd65');
  const isPQ = source.transferFunction === 'pq', needRec2408 = isPQ && SDR_PEAK < origPeak;
  const pqMax = needRec2408 ? pqEncoded(origPeak) : 1, maxLum = needRec2408 ? pqEncoded(SDR_PEAK) / pqMax : 1;
  const ks = 1.5 * maxLum - 0.5, inv1mKs = 1 / Math.max(1e-6, 1 - ks), norm = origPeak / SDR_PEAK;
  const hlgExp = !isPQ ? Math.pow(1.111, Math.log(SDR_PEAK / origPeak) / Math.LN2) - 1 : 0;
  const needHlg = !isPQ && (hlgExp < -0.01 || hlgExp > 0.01), hlgGamut = needHlg && hlgExp < 0;
  const [p0, p1, p2] = lin;
  for (let i = 0; i < n; i++) {
    let r = p0[i], g = p1[i], b = p2[i];
    const a = alpha ? alpha[i] : 1;
    if (alpha) {
      if (a <= 0) { p0[i] = p1[i] = p2[i] = 0; continue; }
      r /= a; g /= a; b /= a;
    }
    if (needRec2408) {
      const L = origPeak * (sl0 * r + sl1 * g + sl2 * b);
      const e1 = Math.min(1, pqEncoded(L) / pqMax);
      let e2 = e1;
      if (e1 >= ks) {
        const t = (e1 - ks) * inv1mKs, t2 = t * t, t3 = t2 * t;
        e2 = (2 * t3 - 3 * t2 + 1) * ks + (t3 - 2 * t2 + t) * (1 - ks) + (-2 * t3 + 3 * t2) * maxLum;
      }
      const newL = Math.max(0, Math.min(SDR_PEAK, pqDisplay(e2 * pqMax)));
      if (L <= 1e-6) r = g = b = newL / SDR_PEAK;
      else { const mult = (newL / L) * norm; r *= mult; g *= mult; b *= mult; }
      [r, g, b] = gamutMapPixel(r, g, b, sl0, sl1, sl2);
    } else if (isPQ) {
      r *= norm; g *= norm; b *= norm;
    } else if (needHlg) {
      const L = sl0 * r + sl1 * g + sl2 * b;
      const ratio = L <= 0 ? 0 : Math.min(Math.pow(L, hlgExp), 1e9);
      r *= ratio; g *= ratio; b *= ratio;
      if (hlgGamut) [r, g, b] = gamutMapPixel(r, g, b, sl0, sl1, sl2);
    }
    if (!samePrimaries) {
      const nr = srcToDst[0] * r + srcToDst[1] * g + srcToDst[2] * b;
      const ng = srcToDst[3] * r + srcToDst[4] * g + srcToDst[5] * b;
      const nb = srcToDst[6] * r + srcToDst[7] * g + srcToDst[8] * b;
      [r, g, b] = gamutMapPixel(nr, ng, nb, dl0, dl1, dl2);
    }
    if (grayOut) r = g = b = dl0 * r + dl1 * g + dl2 * b;
    if (alpha) { r *= a; g *= a; b *= a; }
    p0[i] = r; p1[i] = g; p2[i] = b;
  }
  const outPlanes = grayOut ? [new Float32Array(n)] : lin;
  const curve = transferCurve(target, false, SDR_PEAK);
  const fromLinear = grayOut ? [curveOp(0, curve)] : [curveOp(0, curve), curveOp(1, curve), curveOp(2, curve)];
  convertPixels(n, {inputs: grayOut ? [p0] : lin, alpha, outputs: outPlanes, to: fromLinear});
  return finish(frame, outPlanes, target);
}

function convert(frame,h,source,target,sourceICC,targetICC,preserveAssociation=false,quantize=0) {
  if(sameEncoding(source,target)||sourceICC&&sourceICC===targetICC)return finish(frame,frame.planes,target,targetICC);
  if(!sourceICC&&!targetICC&&HDR_TF.has(source.transferFunction)&&!HDR_TF.has(target.transferFunction)&&target.space!=='xyb')
    return toneMapHDR(frame,h,source,target,preserveAssociation);
  const intent=target.renderingIntent??source.renderingIntent;
  const inputProfile=sourceICC?part('iccColor').readICCColor(sourceICC,{intent}):null,outputProfile=targetICC?part('iccColor').readICCColor(targetICC,{intent}):null;
  const toPCS=inputProfile?inputProfile.toPCS?.ops:!sourceICC?enumToPCS(source,h):null,fromPCS=outputProfile?outputProfile.fromPCS?.ops:!targetICC?enumFromPCS(target,h):null;
  requireDecode(toPCS&&fromPCS,'ICC profile does not provide the requested color transform.');
  const n=frame.width*frame.height,inputCount=inputProfile?.channels??(source.space==='gray'?1:3),outputCount=outputProfile?.channels??(target.space==='gray'?1:3);
  const black=frame.extraChannels?.findIndex(c=>c.type===4)??-1;
  requireDecode(inputCount!==4||black>=0,'CMYK JPEG XL image is missing its black channel.');
  requireDecode(inputCount!==4||frame.extraChannels[black].data?.length===n,'CMYK JPEG XL black channel is not the frame\'s size.');
  const planes=Array.from({length:Math.min(3,outputCount)},()=>new Float32Array(n)),k=outputCount===4?new Float32Array(n):null;
  const inputInk=inputCount===4&&source.invertedCMYK!==false,outputInk=outputCount===4&&target.invertedCMYK!==false;
  const firstAlpha=preserveAssociation?frame.extraChannels?.find(c=>c.type===0):null,alpha=firstAlpha?.associated?firstAlpha.data:null;
  const inputXYB=!sourceICC&&source.space==='xyb',outputXYB=!targetICC&&target.space==='xyb';
  const from=quantize&&inputCount===3&&n>=STEPS&&(sourceICC?inputProfile.toModel:enumModel(source,h,true)),to=from&&outputCount===3&&(targetICC?outputProfile.fromModel:enumModel(target,h,false));
  convertPixels(n,{inputs:frame.planes.slice(0,Math.min(3,inputCount)),black:inputCount===4?frame.extraChannels[black].data:null,alpha,outputs:planes,blackOut:k,
    flags:(inputInk?1:0)|(outputInk?2:0)|(inputXYB?4:0)|(outputXYB?8:0),to:toPCS,from:fromPCS,quantized:to?quantizedJob(from,to,quantize):null});
  let extras=frame.extraChannels;
  if(k){requireDecode(black>=0,'CMYK output needs a black extra channel.');extras=extras.map((c,i)=>i===black?{...c,data:k}:c);}
  return finish(frame,planes,target,targetICC,extras);
}

export function convertOutputColor(frame,h,{colorSpace='original',icc,quantize=0}={}) {
  const source=frame.colorEncoding??nativeEncoding(h),sourceICC=frame.icc??(source.wantICC?h.icc:undefined);
  if(colorSpace==='original'&&!icc)return finish(frame,frame.planes,source,sourceICC);
  const target=icc?{space:signature(icc)==='GRAY'?'gray':signature(icc)==='CMYK'?'cmyk':'rgb',wantICC:true,transferFunction:'icc',iccSpace:signature(icc),invertedCMYK:signature(icc)==='CMYK',renderingIntent:icc.length>=68?new DataView(icc.buffer,icc.byteOffset,icc.byteLength).getUint32(64):undefined}:targetEncoding(colorSpace);
  return convert(frame,h,source,target,sourceICC,icc,true,quantize);
}

export function transformColor(frame,h,f,{colorSpace='original',icc,inPlace=false,rgba8=null}={}) {
  if(frame.ctDone||frame.colorEncoding)return convertOutputColor(frame,h,{colorSpace,icc});
  const original=nativeEncoding(h),n=frame.width*frame.height;
  requireDecode(frame.planes.every(p=>p.length===n),'JPEG XL color planes have different extents.');
  const pixels=(count,ops)=>{const planes=inPlace?frame.planes.slice(0,count):Array.from({length:count},()=>new Float32Array(n));convertPixels(n,{inputs:frame.planes.slice(0,3),outputs:planes,to:ops});return planes;};
  let decoded;
  if(f.ycbcr) {
    requireDecode(frame.planes.length===3,'JPEG XL YCbCr needs three planes.');
    const count=original.space==='gray'?1:3;
    decoded=finish(frame,pixels(count,[{op:OP.ycbcr,a:count}]),original,h.icc);
  } else if(!h.xyb)decoded=finish(frame,frame.planes,original,h.icc);
  else if(original.space==='xyb')decoded=finish(frame,pixels(3,[{op:OP.xybNative}]),original,h.icc);
  else {
    requireDecode(frame.planes.length===3,'JPEG XL XYB needs three planes.');
    if(!original.wantICC&&(original.space==='rgb'||original.space==='gray')&&original.transferFunction!=='unknown') {
      if(colorSpace==='original'&&!icc)return xybToEnum(frame,h,original,inPlace,rgba8);
      return convertOutputColor(xybToEnum(frame,h,original,inPlace),h,{colorSpace,icc});
    }
    const planes=pixels(3,[xybInverse(h)]);
    decoded=finish(frame,planes,{...LINEAR_SRGB});
    let canOriginal=original.space==='rgb'||original.space==='gray';
    if(original.wantICC){const {readICCColor}=part('iccColor');try{canOriginal=!!readICCColor(h.icc).fromPCS;}catch{canOriginal=false;}}
    else if(original.transferFunction==='unknown')canOriginal=false;
    if(canOriginal)decoded=convert(decoded,h,decoded.colorEncoding,original,undefined,h.icc);
  }
  return colorSpace==='original'&&!icc?decoded:convertOutputColor(decoded,h,{colorSpace,icc});
}
