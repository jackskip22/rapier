// SPDX-License-Identifier: MIT

export {NAMES, WIDTHS, HEIGHTS, TABLES, TRANSFORMS} from './vardct-transforms.mjs';
import {cosine, fillScaledDCTBasis} from './vardct-dct8-basis.mjs';
export {cosine, fillScaledDCTBasis};
const dctBases = /* @__PURE__ */ new Map();
export function transposeScaledDCTBasis(size, input, out, from = 0, to = size) {
  for (let k = from; k < to; k++) for (let x = 0; x < size; x++) out[x * size + k] = input[k * size + x];
  return out;
}
export function basis(size) {
  let b = dctBases.get(size);
  if (!b) dctBases.set(size, b = fillScaledDCTBasis(size, new Float64Array(size * size)));
  return b;
}
const dctBasesT = /* @__PURE__ */ new Map();
export function basisT(size) {
  let t = dctBasesT.get(size);
  if (!t) {
    dctBasesT.set(size, t = transposeScaledDCTBasis(size, basis(size), new Float64Array(size * size)));
  }
  return t;
}
export function inverseScaledDCT(coeffs, width, height) {
  const tmp = new Float64Array(width * height);
  return inverseScaledDCTInto(coeffs, width, height, tmp, new Float64Array(tmp.length));
}
export function inverseScaledDCTInto(coeffs, width, height, tmp, out) {
  const bx = basis(width), by = basis(height);
  for (let v = 0; v < height; v++) for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let u = 0; u < width; u++) sum += coeffs[height >= width ? u * height + v : v * width + u] * bx[u * width + x] * width;
    tmp[v * width + x] = sum;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let v = 0; v < height; v++) sum += tmp[v * width + x] * by[v * height + y] * height;
    out[y * width + x] = sum;
  }
  return out;
}

const RC_COS = (n, d) => Math.cos(Math.PI * n / d);
const RC_LLF_DIVISORS = new Map();
export function llfDivisors(w, h) {
  let d = RC_LLF_DIVISORS.get(w * 64 + h);
  if (!d) {
    const scale = (k, size) => RC_COS(k, 2 * size) * RC_COS(k, size) * RC_COS(2 * k, size);
    d = new Float64Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = scale(x, w * 8) * scale(y, h * 8);
    RC_LLF_DIVISORS.set(w * 64 + h, d);
  }
  return d;
}
