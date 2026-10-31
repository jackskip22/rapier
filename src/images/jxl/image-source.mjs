// SPDX-License-Identifier: MIT
import {boundedDimensions, codecError} from './worker-input.mjs';

export async function readImage(source, keepJpeg) {
  if (source && typeof source === 'object' && ArrayBuffer.isView(source.data) && !(typeof ImageData === 'function' && source instanceof ImageData))
    return {data: source.data, width: source.width, height: source.height, ...(source.colorSpace === undefined ? {} : {colorSpace: source.colorSpace})};
  if (typeof ImageData === 'function' && source instanceof ImageData) {
    if (!(source.data instanceof Uint8ClampedArray)) throw codecError('JXL_INPUT', 'Browser ImageData must use RGBA8; use the core entry for native-precision pixels.');
    const colorSpace = source.colorSpace ?? 'srgb';
    if (colorSpace !== 'srgb' && colorSpace !== 'display-p3') throw codecError('JXL_INPUT', 'Unsupported browser ImageData color space.');
    return {data: new Uint8Array(source.data.buffer, source.data.byteOffset, source.data.byteLength), width: source.width, height: source.height, colorSpace};
  }
  if (keepJpeg && typeof Blob === 'function' && source instanceof Blob) {
    const head = new Uint8Array(await source.slice(0, 3).arrayBuffer());
    if (head[0] === 255 && head[1] === 216 && head[2] === 255) return {jpeg: new Uint8Array(await source.arrayBuffer())};
  }
  const borrowed = typeof ImageBitmap === 'function' && source instanceof ImageBitmap;
  const bitmap = borrowed ? source : await createImageBitmap(source);
  let canvas;
  try {
    boundedDimensions(bitmap.width, bitmap.height);
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', {willReadFrequently: true, colorSpace: 'srgb'});
    if (!context) throw codecError('JXL_MEMORY', 'The browser could not allocate an image canvas.');
    context.drawImage(bitmap, 0, 0);
    const {data, width, height} = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return {data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width, height, colorSpace: 'srgb'};
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    if (!borrowed) bitmap.close();
  }
}
