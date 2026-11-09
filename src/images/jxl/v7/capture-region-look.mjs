// SPDX-License-Identifier: MIT
import {complete} from '../bits.mjs';
import {photoCoefficientSteps} from '../photo-dct.mjs';
import {gammaPicture} from '../photo-region-score.mjs';
import {gammaRGBA} from '../photo-output.mjs';
import {ssimulacra2} from '../ssimulacra2.mjs';
import {webpTarget} from '../photo-quality-table.mjs';

export const LOOK_FROM = 3;
const WINDOW = 128, SIDE = 128, AIM = 1.25, STEP_DOWN = 1.2, STEP_UP = 0.6, CEILING = 99.99;

function cut(data, width, height, r) {
  let x = Math.max(0, r.x), y = Math.max(0, r.y), w = Math.min(width, r.x + r.width) - x, h = Math.min(height, r.y + r.height) - y;
  if (w <= 0 || h <= 0) return null;
  if (w > WINDOW) { x += (w - WINDOW) >> 4 << 3; w = WINDOW; }
  if (h > WINDOW) { y += (h - WINDOW) >> 4 << 3; h = WINDOW; }
  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) out.set(data.subarray(((y + row) * width + x) * 4, ((y + row) * width + x + w) * 4), row * w * 4);
  return {pixels: out, width: w, height: h};
}

export function lookReading(q, data, width, rect, reading, colorSpace = 'srgb') {
  if (q >= 1 || reading >= 100 || Math.min(rect.width, rect.height) < SIDE) return reading;
  const crop = cut(data, width, data.length / 4 / width, rect);
  if (!crop || Math.min(crop.width, crop.height) < SIDE) return reading;
  const {pixels, width: w, height: h} = crop;
  const image = complete(photoCoefficientSteps(pixels, w, h, reading, colorSpace, false, true));
  const decoded = gammaRGBA(gammaPicture(image, {reference: pixels, exact: null, pixels, mask: false}), w, h);
  const score = ssimulacra2({rgba: pixels}, {rgba: decoded}, w, h).score;
  if (score === undefined || !Number.isFinite(score)) return reading;
  const aim = webpTarget(q) + AIM;
  const next = score >= aim ? reading - (score - aim) / STEP_DOWN : reading + (aim - score) / STEP_UP;
  return Math.min(CEILING, Math.max(1, next));
}

export function lookingReader(q, read) {
  const seen = new Map();
  return (data, width, rect, offGrid, colorSpace, ...more) => {
    const reading = read(data, width, rect, offGrid, colorSpace, ...more);
    const key = `${rect.x},${rect.y},${rect.width},${rect.height},${offGrid === true},${reading}`;
    if (!seen.has(key)) seen.set(key, lookReading(q, data, width, rect, reading, colorSpace));
    return seen.get(key);
  };
}
