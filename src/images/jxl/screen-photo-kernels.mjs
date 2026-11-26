// SPDX-License-Identifier: MIT
import {kernelCall, room, rows2d, rowsOut} from './kernel-call.mjs';
import {wasmRequired} from './capture-wasm-error.mjs';
import {fault} from './fault.mjs';

const BASE = 65536, BAND_CELLS = 256, BAND_PIXELS = 262144, AUX = BASE + BAND_PIXELS * 4;
const OUTPUT = BASE + 4224 * BAND_CELLS, SCRATCH = OUTPUT + BAND_CELLS;

function withArena(end, work) {
  try { return kernelCall(k => () => work(k, new Uint8Array(k.memory.buffer)), [room(end - BASE)])[0]; }
  catch (e) { throw e?.code ? e : wasmRequired(e); }
}

function runCells(label, pad, needScratch, data, width, minX, minY, maxX, maxY, classified, outStride, invoke) {
  if (minX > maxX || minY > maxY) return 0;
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
      ![width, minX, minY, maxX, maxY].every(Number.isSafeInteger) || width < 1 || minX < 0 || minY < 0 ||
      (maxX + 1) * 32 > width || ((maxY + 1) * 32 - 1) * width * 4 + (maxX + 1) * 128 > data.length)
    throw fault('JXL_INTERNAL', 'screen-photo-kernels:cells ' + label);
  const spanX = maxX - minX + 1, spanY = maxY - minY + 1, strideOut = outStride ?? spanX;
  if (classified !== undefined && (!(classified instanceof Int8Array) ||
      (outStride === undefined ? classified.length !== spanX * spanY
        : !Number.isSafeInteger(outStride) || outStride < spanX || (spanY - 1) * outStride + spanX > classified.length)))
    throw fault('JXL_INTERNAL', 'screen-photo-kernels:output ' + label);
  return withArena(needScratch ? SCRATCH + 8200 : OUTPUT + BAND_CELLS, (k, bytes) => {
    const stepY = Math.max(1, BAND_CELLS / spanX | 0);
    let total = 0;
    for (let ty = minY; ty <= maxY; ty += stepY) {
      const rows = Math.min(maxY - ty + 1, stepY);
      for (let tx = minX; tx <= maxX; tx += BAND_CELLS) {
        const cols = Math.min(BAND_CELLS, maxX - tx + 1), stride = cols * 128 + pad;
        for (let py = 0, from = (ty * 32 * width + tx * 32) * 4; py < rows * 32; py++, from += width * 4)
          bytes.set(data.subarray(from, Math.min(data.length, from + stride)), BASE + py * stride);
        total += invoke(k, stride, cols, rows, classified ? OUTPUT : 0);
        if (classified) rowsOut(classified, bytes, strideOut, tx - minX, ty - minY, cols, rows, 1, OUTPUT);
      }
    }
    return total;
  });
}

export const textTiles = (data, width, minX, minY, maxX, maxY, classified, outStride) =>
  runCells('Text classification', 0, 0, data, width, minX, minY, maxX, maxY, classified, outStride,
    (k, stride, cols, rows, out) => k.photoTextTiles(BASE, stride, cols, rows, out));

export const supportTiles = (data, width, minX, minY, maxX, maxY, classified, outStride) =>
  runCells('Photo support classification', 4, 1, data, width, minX, minY, maxX, maxY, classified, outStride,
    (k, stride, cols, rows, out) => k.photoSupportTiles(BASE, stride, cols, rows, out, SCRATCH));

function pixelBands(data, width, x0, y0, w, h, end, maxCols, rowAlign, each) {
  return withArena(end, (k, bytes) => {
    for (let cx = 0; cx < w; cx += maxCols) {
      const cols = Math.min(maxCols, w - cx), stepY = Math.max(rowAlign, (BAND_PIXELS / cols | 0) & ~(rowAlign - 1));
      for (let cy = 0; cy < h; cy += stepY) {
        const rows = Math.min(stepY, h - cy);
        rows2d(bytes, data, width, x0 + cx, y0 + cy, cols, rows, 4, BASE);
        if (each(k, bytes, cx, cy, cols, rows)) return;
      }
    }
  });
}

export function hiddenColor(data, width, x0, y0, w, h) {
  let hit = false;
  if (w > 0 && h > 0) pixelBands(data, width, x0, y0, w, h, AUX, BAND_PIXELS, 1, (k, _, _cx, _cy, cols, rows) =>
    hit = Boolean(k.photoHiddenColor(BASE, cols * 4, cols, rows)));
  return hit;
}

export function paletteKind(data, width, x0, y0, w, h) {
  let init = 1, kind = -1;
  if (w > 0 && h > 0) pixelBands(data, width, x0, y0, w, h, AUX + 5128, BAND_PIXELS, 1, (k, _, _cx, _cy, cols, rows) =>
    (kind = k.photoPaletteBand(BASE, cols * 4, cols, rows, AUX, init), init = 0, kind === 0));
  return kind;
}

export function flattenGutter(rgba, width, height, exact, r, g, b) {
  if (width < 1 || height < 1) return;
  const rgb = (r & 255) | (g & 255) << 8 | (b & 255) << 16;
  pixelBands(rgba, width, 0, 0, width, height, AUX + BAND_PIXELS, 32768, 8, (k, bytes, cx, cy, cols, rows) => {
    rows2d(bytes, exact, width, cx, cy, cols, rows, 1, AUX);
    k.photoFlattenGutter(BASE, AUX, cols, rows, rgb);
    rowsOut(rgba, bytes, width, cx, cy, cols, rows, 4, BASE);
  });
}

export function grayTiles(data, width, height) {
  const tilesX = Math.ceil(width / 64), tilesY = Math.ceil(height / 64), out = new Uint8Array(tilesX * tilesY);
  if (width < 1 || height < 1) return out;
  return withArena(AUX + 64, (k, bytes) => {
    for (let tx = 0; tx < tilesX; tx += 64) {
      const tCols = Math.min(64, tilesX - tx), stepY = Math.max(1, 64 / tCols | 0);
      for (let ty = 0; ty < tilesY; ty += stepY) {
        const tRows = Math.min(stepY, tilesY - ty), px0 = tx * 64, py0 = ty * 64;
        const bw = Math.min(width - px0, tCols * 64), bh = Math.min(height - py0, tRows * 64);
        rows2d(bytes, data, width, px0, py0, bw, bh, 4, BASE);
        k.photoGrayTiles(BASE, bw * 4, bw, bh, tCols, tRows, AUX);
        rowsOut(out, bytes, tilesX, tx, ty, tCols, tRows, 1, AUX);
      }
    }
    return out;
  });
}
