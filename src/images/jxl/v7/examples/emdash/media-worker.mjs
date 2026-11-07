import {recompress} from 'rapier-jxl/jpeg';
import {encode, fit} from 'rapier-jxl/upload';
import {deliveryCopies} from './deliver.mjs';
import {browserTools} from './browser-tools.mjs';
import {digest} from './digest.mjs';

export function isArt(data) {
  const step = Math.max(1, Math.floor(data.length / 4 / 65536)), colors = new Set();
  for (let i = 0; i < data.length; i += 4 * step) {
    if (data[i + 3] !== 255) return true;
    colors.add(data[i] << 16 | data[i + 1] << 8 | data[i + 2]);
  }
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  return colors.size <= 4096;
}
async function pixelsOf(file) {
  const bitmap = await createImageBitmap(file);
  let canvas;
  try {
    if (bitmap.width * bitmap.height > 40e6) throw Object.assign(new Error('Picture exceeds 40 MP'), {code: 'JXL_LIMIT'});
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally { bitmap.close(); if (canvas) { canvas.width = 0; canvas.height = 0; } }
}

export async function make(file, {quality, exact, effort, maxKilobytes, widths}, progress) {
  const input = new Uint8Array(await file.arrayBuffer()), source = await digest(input), pixels = await pixelsOf(file);
  const art = exact || isArt(pixels.data), fidelity = art ? 'exact' : {quality}, jpeg = file.type === 'image/jpeg';
  const kind = jpeg ? 'jpeg' : art ? 'exact' : 'photo';
  let result;
  if (maxKilobytes > 0) {
    result = await fit(file, {maxBytes: maxKilobytes * 1024,
      fidelity: jpeg || art ? 'exact' : {quality: {min: 1, max: quality}}, effort});
  } else if (jpeg) {
    result = await recompress(input, {effort});
  } else {
    result = await encode(file, {fidelity, effort});
  }
  progress(0.5);
  if (!result.fits) {
    progress(1);
    return {kind, over: result.reason?.code === 'JXL_TARGET', result, source, bytes: input.byteLength, copies: []};
  }
  const copies = await deliveryCopies(file, result, widths, browserTools(effort),
    {...(art && {fidelity: 'exact'}), onProgress: f => progress(0.5 + f / 2)});
  return {kind, over: false, result, source, bytes: input.byteLength, copies};
}

if (typeof self !== 'undefined') self.onmessage = async ({data: {file, settings}}) => {
  try {
    const started = performance.now(), made = await make(file, settings, value => self.postMessage({progress: value}));
    const buffers = [made.result, ...made.copies].flatMap(result => result.bytes === null ? [] : [result.bytes.buffer]);
    self.postMessage({...made, ms: performance.now() - started}, [...new Set(buffers)]);
  } catch (error) {
    self.postMessage({error: {message: error.message, code: error.code}});
  }
};
