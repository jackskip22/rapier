// SPDX-License-Identifier: MIT
import {parentPort, workerData} from 'node:worker_threads';
import {encode, fit} from 'rapier-jxl';
import {recompress, restore} from 'rapier-jxl/jpeg';
import {verify, configureDecoder} from 'rapier-jxl/verify';
import {decode} from 'rapier-jxl/decode';
import {header} from 'rapier-jxl/metadata';
import {jpegPixels, pixelColor} from './jpeg-source.mjs';

const {name, input, options, bytes, candidate} = workerData;
try {
  configureDecoder(decode, restore);
  const operation = {encode, fit, recompress}[name];
  if (!operation && name !== 'verify') throw Object.assign(new Error("operation: encode, fit, recompress, verify"), {code: 'JXL_OPTIONS'});
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  const jpeg = bytes[0] === 255 && bytes[1] === 216;
  const maxPixels = options?.maxPixels ?? input.maxPixels;
  const prepared = input.kind === 'file' && jpeg && ['encode', 'fit'].includes(name)
    ? await jpegPixels(bytes, input, {maxPixels}) : null;
  const samples = prepared?.input ?? input, data = prepared?.data ?? bytes;
  const icc = prepared ? prepared.icc : typeof input.iccBase64 === 'string' ? new Uint8Array(Buffer.from(input.iccBase64, 'base64')) : null;
  const source = () => samples.kind === 'pixels' ? {data: data.slice(), width: samples.width, height: samples.height,
      ...(icc ? {icc} : pixelColor(samples)),
      ...(!icc && samples.transferFunction && {transferFunction: samples.transferFunction}),
      ...(typeof samples.intensityTarget === 'number' && {intensityTarget: samples.intensityTarget})}
    : name === 'recompress' || name === 'verify' || !png ? data.slice() : new Blob([bytes], {type: 'image/png'});
  let last = -1;
  const report = (from, span) => fraction => {
    const value = Math.round(100 * (from + span * Math.max(0, Math.min(1, fraction)))) / 100;
    if (value > last) { last = value; parentPort.postMessage({progress: value}); }
  };
  if (name === 'verify') {
    const photo = bytes[0] === 255 && bytes[1] === 216 ||
      [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
    if (!photo) throw Object.assign(new Error("original: JPEG or PNG"), {code: 'JXL_UNSUPPORTED'});
    if (options.result.format !== 'jxl' || header(candidate).animation)
      throw Object.assign(new Error("candidate: still JPEG XL"), {code: 'JXL_UNSUPPORTED'});
    const receipt = await verify(source(), {...options.result, bytes: candidate},
      {maxPixels: options.maxPixels, onProgress: report(0, 1)});
    parentPort.postMessage({receipt});
  } else {
    const {bytes: file, ...result} = await operation(source(), {...(maxPixels && {maxPixels}), ...options, onProgress: report(0, 0.85)});
    const verification = await verify(prepared ? bytes.slice() : source(), {...result, bytes: file}, {...(maxPixels && {maxPixels}), onProgress: report(0.85, 0.15)});
    const out = new Uint8Array(file);
    parentPort.postMessage({bytes: out, record: {...result, source: verification.source, verification}}, [out.buffer]);
  }
} catch (error) {
  parentPort.postMessage({error: {code: String(error?.code ?? 'JXL_INTERNAL'), message: String(error?.message ?? error),
    ...(error?.verification && {verification: error.verification})}});
}
