// SPDX-License-Identifier: MIT
import {reconstructRGB, reconstructYCbCr} from './reconstruct-planes.mjs';
import {askedLook, measuredLook} from './photo-quality-table.mjs';

export const PHOTO_PAD_SIDE = 256;
const PHOTO_REGION_OFFSETS = /* @__PURE__ */ Object.freeze([
  [0.50, 6.27, 4.21, 2.46],
  [0.60, 5.81, 3.44, 2.77],
  [0.70, 5.00, 3.37, 2.22],
  [0.80, 3.33, 3.13, 1.85],
  [0.85, 2.00, 2.37, 1.77],
  [0.90, 0.39, 1.35, 0.99],
  [0.92, 0.21, 1.294, 0.922],
].map(row => /* @__PURE__ */ Object.freeze(row)));
export function photoRegionTarget(quality, side = PHOTO_PAD_SIDE, measured = false) {
  const base = measured ? measuredLook(quality) : askedLook(quality);
  if (quality >= 1 || !(side < PHOTO_PAD_SIDE)) return base;
  const col = (side < 64 ? 0 : side < 128 ? 1 : 2) + 1, rows = PHOTO_REGION_OFFSETS;
  if (quality <= rows[0][0]) return Math.min(100, base + rows[0][col]);
  if (quality >= rows[rows.length - 1][0]) return Math.min(100, base + rows[rows.length - 1][col]);
  let i = 0;
  while (i + 2 < rows.length && quality >= rows[i + 1][0]) i++;
  const [q0] = rows[i], [q1] = rows[i + 1], v0 = rows[i][col], v1 = rows[i + 1][col];
  return Math.min(100, base + v0 + (v1 - v0) * (quality - q0) / (q1 - q0));
}
export function padPhotoCrop(src, w, h, side = PHOTO_PAD_SIDE) {
  const pw = Math.max(side, w), ph = Math.max(side, h);
  if (pw === w && ph === h) return {rgba: src, width: w, height: h};
  const ox = (pw - w) >> 1, oy = (ph - h) >> 1;
  const out = new Uint32Array(pw * ph);
  const s32 = src.byteOffset & 3 ? new Uint32Array(src.slice().buffer) : new Uint32Array(src.buffer, src.byteOffset, w * h);
  const fold = (i, n) => {
    if (n <= 1) return 0;
    const p = 2 * n;
    i = ((i % p) + p) % p;
    return i < n ? i : p - 1 - i;
  };
  const xMap = new Int32Array(pw);
  for (let x = 0; x < pw; x++) xMap[x] = fold(x - ox, w);
  for (let y = 0; y < ph; y++) {
    const sy = fold(y - oy, h) * w, dy = y * pw;
    for (let x = 0; x < pw; x++) out[dy + x] = s32[sy + xMap[x]];
  }
  return {rgba: new Uint8Array(out.buffer), width: pw, height: ph};
}

export function gammaPicture(image, {reference, exact, pixels, mask}) {
  const n = image.width * image.height;
  image = image.lazyStrategy ? image.lazyStrategy.materialize() : image;
  const planes = (image.ycbcr ? reconstructYCbCr : reconstructRGB)(image, {planes: true});
  for (let p = 0; p < n; p++) if (exact?.[p] || mask && pixels[p * 4 + 3] < 128)
    for (let c = 0; c < 3; c++) planes[c][p] = reference[p * 4 + c] / 255;
  return planes;
}

export const clipPhotoRect = (r, width, height, x0 = 0, y0 = 0) => {
  const x = Math.max(x0, r.x), y = Math.max(y0, r.y);
  return {x, y, width: Math.min(width, r.x + r.width) - x, height: Math.min(height, r.y + r.height) - y};
};
export const cutPhotoRGBA = (src, sw, x0, y0, w, h, dst = new Uint8Array(w * h * 4), dx = 0, dy = 0, dw = w) => {
  for (let y = 0; y < h; y++) dst.set(src.subarray(((y0 + y) * sw + x0) * 4, ((y0 + y) * sw + x0 + w) * 4), ((dy + y) * dw + dx) * 4);
  return dst;
};
