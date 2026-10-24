// SPDX-License-Identifier: MIT
import {ZIGZAG} from '../jfif.mjs';
import {zeroDensityContext} from '../vardct.mjs';
import {hybridToken, uintConfig} from '../prefix.mjs';

const SCAN = ZIGZAG.map(n => ((n & 7) << 3) | (n >> 3));
const ONE = [1 - 0.05465007330715401, 1 - 0.07005449891748593, 1 - 0.049935103337343655];
const CONFIG = uintConfig(4, 1, 0), ZD = 458, NZ = 37, TOKENS = 64;
const packSigned = v => v < 0 ? -2 * v - 1 : 2 * v;
export const nzBucket = p => { p = Math.min(p, 64); return p < 8 ? p : 4 + (p >> 1); };
const slots = [0, 0, 0];
export function token(value) { hybridToken(CONFIG, value, slots); return [Math.min(TOKENS - 1, slots[0]), slots[1]]; }

function walk(stride, rows, visit) {
  const row = [0, 1, 2].map(() => new Int32Array(32 * 32));
  for (let gy = 0; gy < Math.ceil(rows / 32); gy++) for (let gx = 0; gx < Math.ceil(stride / 32); gx++) {
    const bw = Math.min(32, stride - gx * 32), bh = Math.min(32, rows - gy * 32);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) for (const c of [1, 0, 2]) {
      const r = row[c], predicted = bx === 0 ? (by === 0 ? 32 : r[(by - 1) * 32]) : by === 0 ? r[bx - 1] : (r[(by - 1) * 32 + bx] + r[by * 32 + bx - 1] + 1) >> 1;
      r[by * 32 + bx] = visit(c, (gy * 32 + by) * stride + gx * 32 + bx, predicted);
    }
  }
}

export function rateModel(image, stride, rows, smoothing) {
  const zd = [0, 1, 2].map(() => new Float64Array(ZD * TOKENS)), nz = [0, 1, 2].map(() => new Float64Array(NZ * TOKENS));
  walk(stride, rows, (c, b, predicted) => {
    const coeffs = image.components[c].coeffs, at = b * 64;
    let count = 0;
    for (let k = 1; k < 64; k++) if (coeffs[at + k]) count++;
    nz[c][nzBucket(predicted) * TOKENS + token(count)[0]]++;
    let prev = count > 4 ? 0 : 1, left = count;
    for (let k = 1; k < 64 && left; k++) {
      const q = coeffs[at + SCAN[k]];
      zd[c][zeroDensityContext(left, k, prev) * TOKENS + token(packSigned(q))[0]]++;
      prev = q ? 1 : 0; left -= prev;
    }
    return count;
  });
  const bits = (table, contexts) => {
    const all = new Float64Array(TOKENS).fill(0.5);
    for (let i = 0; i < contexts; i++) for (let t = 0; t < TOKENS; t++) all[t] += table[i * TOKENS + t];
    let total = 0; for (const v of all) total += v;
    const out = new Float64Array(contexts * TOKENS);
    for (let i = 0; i < contexts; i++) {
      let n = 0; for (let t = 0; t < TOKENS; t++) n += table[i * TOKENS + t];
      for (let t = 0; t < TOKENS; t++) out[i * TOKENS + t] = -Math.log2((table[i * TOKENS + t] + smoothing * all[t] / total) / (n + smoothing));
    }
    return out;
  };
  return {zd: zd.map(t => bits(t, ZD)), nz: nz.map(t => bits(t, NZ))};
}

const recon = (m, c) => m === 0 ? 0 : m === 1 ? ONE[c] : m - 0.145 / m;

export function trellisQuantize(image, {lambda = 0.15, passes = 2, smoothing = 8, weights = [1, 1, 1], shrinkOnly = false} = {}) {
  const {values} = image, stride = image.components[0].stride, rows = image.components[0].rows;
  const lam = Array.isArray(lambda) ? lambda : [lambda, lambda, lambda];
  const V = new Float64Array(65 * 65 * 2), choice = new Int32Array(65 * 65 * 2), tail = new Float64Array(66);
  const mag = new Float64Array(64), sign = new Int8Array(64), cost = new Float64Array(64 * 3 * 2), cand = new Int32Array(64 * 3), nc = new Int8Array(64);
  const vix = (k, left, prev) => (k * 65 + left) * 2 + prev;
  const original = image.components.map(comp => comp.coeffs.slice());
  for (let pass = 0; pass < passes; pass++) {
    const rate = rateModel(image, stride, rows, smoothing);
    walk(stride, rows, (c, b, predicted) => {
      const coeffs = image.components[c].coeffs, start = original[c], val = values[c], at = b * 64, w = weights[c], L = lam[c];
      const zdBits = rate.zd[c], nzBits = rate.nz[c];
      if (!L) { let n = 0; for (let k = 1; k < 64; k++) if (coeffs[at + k]) n++; return n; }
      let maxRound = 0;
      for (let k = 1; k < 64; k++) {
        const v = val[at + SCAN[k]], a = Math.abs(v), r = shrinkOnly ? Math.abs(start[at + SCAN[k]]) : Math.round(a);
        mag[k] = a; sign[k] = v < 0 ? -1 : 1;
        let n = 0;
        cand[k * 3 + n++] = r;
        if (r >= 1) cand[k * 3 + n++] = r - 1;
        if (r >= 2) cand[k * 3 + n++] = 0;
        nc[k] = n; if (r) maxRound = k;
      }
      tail[64] = 0;
      for (let k = 63; k >= 1; k--) tail[k] = tail[k + 1] + w * mag[k] * mag[k];
      if (!maxRound) { for (let k = 1; k < 64; k++) coeffs[at + SCAN[k]] = 0; return 0; }
      for (let left = 0; left <= 64; left++) for (let prev = 0; prev < 2; prev++) V[vix(64, left, prev)] = left ? Infinity : 0;
      for (let k = 63; k >= 1; k--) {
        const room = 64 - k;
        V[vix(k, 0, 0)] = V[vix(k, 0, 1)] = tail[k];
        for (let left = 1; left <= 64; left++) {
          if (left > room) { V[vix(k, left, 0)] = V[vix(k, left, 1)] = Infinity; continue; }
          for (let prev = 0; prev < 2; prev++) {
            const ctx = zeroDensityContext(left, k, prev) * TOKENS;
            let best = Infinity, pick = 0;
            for (let i = 0; i < nc[k]; i++) {
              const m = cand[k * 3 + i], nzv = m ? 1 : 0;
              const next = V[vix(k + 1, left - nzv, nzv)];
              if (next === Infinity) continue;
              const [t, extra] = token(m ? 2 * m - (sign[k] < 0 ? 1 : 0) : 0);
              const e = mag[k] - recon(m, c), j = w * e * e + L * (zdBits[ctx + t] + extra) + next;
              if (j < best) { best = j; pick = m; }
            }
            V[vix(k, left, prev)] = best; choice[vix(k, left, prev)] = pick;
          }
        }
      }
      const bucket = nzBucket(predicted) * TOKENS;
      let bestN = 0, bestJ = L * nzBits[bucket + token(0)[0]] + tail[1];
      for (let N = 1; N <= 63; N++) {
        const v = V[vix(1, N, N > 4 ? 0 : 1)];
        if (v === Infinity) continue;
        const [t, extra] = token(N), j = L * (nzBits[bucket + t] + extra) + v;
        if (j < bestJ) { bestJ = j; bestN = N; }
      }
      let left = bestN, prev = bestN > 4 ? 0 : 1;
      for (let k = 1; k < 64; k++) {
        const m = left ? choice[vix(k, left, prev)] : 0;
        coeffs[at + SCAN[k]] = sign[k] * m;
        prev = m ? 1 : 0; left -= prev;
      }
      return bestN;
    });
  }
  return image;
}
