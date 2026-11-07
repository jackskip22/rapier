// SPDX-License-Identifier: MIT

export const CAPTURE_PROPERTIES = Object.freeze([2, 3, 4, 5, 10, 11, 12, 13, 14, 15]), CAPTURE_CUTS = 31;
const token = v => v < 16 ? v : Math.min(63, 16 + ((31 - Math.clz32(v) - 4) << 2 | (v >> (30 - Math.clz32(v)) & 1) << 1 | v & 1));
const packed = r => r >= 0 ? 2 * r : -2 * r - 1;
export const featureStride = n => n + 3 & ~3;
export function captureFeatures({plane, width, height, wpRes, wpProp, cuts}, from = 0, to = width * height) {
  const n = width * height, stride = featureStride(n), props = CAPTURE_PROPERTIES.length, bin = new Uint8Array(props * stride), tok = new Uint32Array(n), value = new Int32Array(props);
  for (let i = from; i < to; i++) {
    const x = i % width, y = (i - x) / width;
    const w = x ? plane[i - 1] : y ? plane[i - width] : 0, nn = y ? plane[i - width] : w, nw = x && y ? plane[i - width - 1] : w;
    const ne = y && x + 1 < width ? plane[i - width + 1] : nn, n2 = y > 1 ? plane[i - 2 * width] : nn, ww = x > 1 ? plane[i - 2] : w;
    value[0] = y; value[1] = x; value[2] = Math.abs(nn); value[3] = Math.abs(w); value[4] = w - nw; value[5] = nw - nn;
    value[6] = nn - ne; value[7] = nn - n2; value[8] = w - ww; value[9] = wpProp[i];
    for (let p = 0; p < props; p++) {
      let b = 0;
      while (b < CAPTURE_CUTS && cuts[p * CAPTURE_CUTS + b] < value[p]) b++;
      bin[p * stride + i] = b;
    }
    const v = plane[i], gradient = Math.max(Math.min(w, nn), Math.min(Math.max(w, nn), w + nn - nw));
    tok[i] = token(packed(v - w)) | token(packed(v - nn)) << 6 | token(packed(v - gradient)) << 12 | token(wpRes[i]) << 18;
  }
  return {bin, tok};
}

export function captureTally({n, props, bins, preds, toks, slots, bin, tok, node}, only = -1) {
  const out = new Uint32Array(props * slots * bins * preds * toks), stride = featureStride(n);
  for (let prop = 0; prop < props; prop++) {
    if (only >= 0 && prop !== only) continue;
    for (let i = 0; i < n; i++) {
      const slot = node[i], b = bin[prop * stride + i];
      if (slot >= slots || b >= bins) continue;
      const base = ((prop * slots + slot) * bins + b) * preds * toks, t = tok[i];
      for (let k = 0; k < preds; k++) out[base + k * toks + (t >>> 6 * k & 63)]++;
    }
  }
  return out;
}
