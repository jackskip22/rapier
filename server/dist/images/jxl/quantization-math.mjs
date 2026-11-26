// SPDX-License-Identifier: MIT
import {float16Bits} from './bits.mjs';
import {fault} from './fault.mjs';

export function quantParamHalfValue(bits) {
  const sign = bits & 32768 ? -1 : 1, exponent = (bits >>> 10) & 31, mantissa = bits & 1023;
  let value = exponent ? 1024 + mantissa : mantissa, shift = exponent ? exponent - 25 : -24;
  while (shift < 0) { value /= 2; shift++; }
  while (shift > 0) { value *= 2; shift--; }
  return sign * value;
}

export function quantParamNumber(value, divisor, positive, library) {
  if (typeof value !== 'number' || !Number.isFinite(value) || positive && value <= 0)
    throw fault('JXL_INPUT', 'quantization params: finite positive');
  if (library) return value;
  if (Math.abs(value / divisor) >= 65520) throw fault('JXL_INPUT', 'quantization param: overflows float16');
  const decoded = quantParamHalfValue(float16Bits(value / divisor)) * divisor;
  if (positive && decoded <= 0) throw fault('JXL_INPUT', 'quantization param: underflows float16');
  return decoded;
}

export function quantParamInterpolate(bands, position) {
  if (bands.length === 1) return bands[0];
  const index = Math.min(bands.length - 2, Math.floor(position)), a = bands[index], b = bands[index + 1];
  return a * Math.pow(b / a, position - index);
}

export function quantParamVector(value, count, convert) {
  if ((!Array.isArray(value) && !ArrayBuffer.isView(value)) || value.length !== count)
    throw fault('JXL_INPUT', 'quantization vector length');
  return Array.from(value, convert);
}

export function quantParamTriplet(value, count, convert) {
  if (!Array.isArray(value) || value.length !== 3)
    throw fault('JXL_INPUT', 'quantization params: 3 vectors');
  return [0, 1, 2].map(i => quantParamVector(value[i], count, convert));
}

export function quantParamBands(value, library) {
  const count = value?.[0]?.length;
  if (!Number.isInteger(count) || count < 1 || count > 16)
    throw fault('JXL_INPUT', 'bands: 1-16 per channel');
  return quantParamTriplet(value, count, (v, i) => quantParamNumber(v, i ? 1 : 64, !i, library));
}

export function quantParamWeight(value) {
  if (!Number.isFinite(value) || value < 1e-8 || value >= 1e8)
    throw fault('JXL_INPUT', 'weights: 1e-8 to 1e8');
  return value;
}

export function quantParamExpandBands(parameters) {
  const bands = [quantParamWeight(parameters[0])];
  for (let i = 1; i < parameters.length; i++) {
    const delta = parameters[i];
    bands.push(quantParamWeight(bands.at(-1) * (delta > 0 ? 1 + delta : 1 / (1 - delta))));
  }
  return bands;
}

export const COEFF_LOOK_PACKET = /* @__PURE__ */ Uint8Array.of(1,67,41,16,4,0,0,0,6,8,24,31,32,34,39,41,47,54,56,57,114,115,116,122,123,125,127,128,129,130,136,144,155,156,157,159,163,169,172,173,177,180,181,182,183,184,185,188,192,0,0,0,30,44,150,63,197,155,181,64,140,59,62,64,34,41,41,66,150,212,57,66,115,189,219,65,59,245,179,64,240,156,60,65,165,93,185,63,145,119,28,63,77,4,186,63,77,172,154,63,60,208,11,63,82,48,67,63,13,145,88,65,216,100,153,64,180,160,110,64,49,85,94,64,68,72,98,66,241,244,62,65,141,65,150,66,129,16,47,62,88,80,60,65,129,230,0,63,60,241,197,66,123,196,47,65,253,255,142,67,122,251,29,67,53,143,215,64,89,251,203,66,157,193,30,66,187,199,55,67,167,237,101,68,136,120,167,62,205,105,70,67,35,4,132,66,82,229,156,67,169,194,224,66,79,18,17,60,55,173,154,62,241,27,130,64,54,205,177,181,201,8,41,58,84,66,188,58,181,93,255,58,32,191,129,58,110,237,25,59,102,39,250,183,57,104,63,187,40,143,140,58,81,157,200,58,60,230,110,186,13,177,71,186,51,153,112,185,61,191,7,59,150,209,176,56,72,115,198,186,101,198,63,59,46,213,138,58,156,223,135,59,88,191,55,59,89,97,131,59,205,5,16,58,135,77,53,59,226,72,27,186,238,234,178,185,196,62,218,57,251,148,179,59,47,166,153,58,96,111,221,56,55,247,114,185,21,195,90,59,150,50,136,58,219,167,11,59,106,169,24,59,91,143,254,186,55,241,229,58,221,103,148,56,166,171,249,186,37,99,167,58,50,244,122,57,102,57,124,185,31,98,200,184,211,221,47,59,10,245,52,185,13,221,65,187,144,111,93,59,186,77,244,186,128,132,136,185,101,28,183,58,253,205,124,187,29,211,187,186,19,63,41,59,238,102,52,185,53,92,206,185,207,112,163,56,14,237,234,186,12,199,25,57,255,118,187,186,102,28,77,187,180,173,198,58,235,15,231,185,219,159,229,57,102,96,203,185,171,197,47,59,48,114,2,181,141,208,204,58,235,86,192,57,50,212,30,57,5,16,13,57,18,223,157,58,77,4,93,186,253,113,233,57,173,210,224,189);

let unpackedCoeffModel = null;
function coeffModel() {
  if (unpackedCoeffModel) return unpackedCoeffModel;
  const p = COEFF_LOOK_PACKET;
  if (p[0] !== 1 || p[1] !== 0x43) throw fault('JXL_INTERNAL', 'quantization-math:coeff-packet');
  const nnz = p[2], Dm = p[3], H = p[4];
  const idxEnd = 8 + ((nnz + 3) & ~3);
  const idx = p.subarray(8, 8 + nnz);
  const f32 = new Float32Array(p.buffer, p.byteOffset + idxEnd, nnz + Dm * H + 2 * H + 1);
  unpackedCoeffModel = {
    nnz, Dm, H, idx,
    wp: f32.subarray(0, nnz),
    W1: f32.subarray(nnz, nnz + Dm * H),
    b1: f32.subarray(nnz + Dm * H, nnz + Dm * H + H),
    W2: f32.subarray(nnz + Dm * H + H, nnz + Dm * H + 2 * H),
    b2: f32[nnz + Dm * H + 2 * H],
  };
  return unpackedCoeffModel;
}

const GRP5 = [[0, 1], [1, 3], [3, 5], [5, 7], [7, 10]];
const F32 = Math.fround;

function f32Log1pPos(x) {
  let v = F32(1 + x);
  if (!(v > 1)) return F32(0);
  const u = new Int32Array(Float32Array.of(v).buffer)[0];
  const e = ((u >>> 23) & 255) - 127;
  const m = new Float32Array(Int32Array.of((u & 0x7fffff) | 0x3f800000).buffer)[0];
  const t = F32(F32(m - 1) / F32(m + 1)), t2 = F32(t * t);
  const lg2 = F32(F32(e) + F32(F32(F32(2.88539004) * t) * F32(1 + F32(t2 * F32(F32(0.33333334) + F32(t2 * F32(F32(0.2) + F32(t2 * F32(0.1445)))))))));
  return F32(lg2 * F32(0.6931472));
}

function f32Log2Pos(x) {
  const u = new Int32Array(Float32Array.of(F32(x)).buffer)[0];
  const e = ((u >>> 23) & 255) - 127;
  const m = new Float32Array(Int32Array.of((u & 0x7fffff) | 0x3f800000).buffer)[0];
  const t = F32(F32(m - 1) / F32(m + 1)), t2 = F32(t * t);
  return F32(F32(e) + F32(F32(F32(2.88539004) * t) * F32(1 + F32(t2 * F32(F32(0.33333334) + F32(t2 * F32(F32(0.2) + F32(t2 * F32(0.1445)))))))));
}

export function evalCoeffLookFromAcc(acc64, width, height, flat, is90, epf, powFn) {
  const m = coeffModel();
  const nBlocks = acc64[390], n2x2 = acc64[391], n4x4 = acc64[392];
  if (!(nBlocks > 0 && n2x2 > 0 && n4x4 > 0)) return 100;
  const invB = 1 / nBlocks, inv2 = 1 / n2x2, inv4 = 1 / n4x4;
  const p4 = (sum, inv) => F32(Math.sqrt(Math.sqrt(sum * inv)));

  const rsig = new Float32Array(30);
  const bz1 = new Float32Array(30), bz4 = new Float32Array(30);
  const br1 = new Float32Array(30), br4 = new Float32Array(30);
  const bt1 = new Float32Array(30), bt4 = new Float32Array(30);
  const bn1 = new Float32Array(30), bn4 = new Float32Array(30);
  const ur4 = new Float32Array(30);
  for (let i = 0; i < 30; i++) {
    rsig[i] = F32(acc64[i] * invB);
    bz1[i]  = F32(acc64[30 + i] * invB);
    bz4[i]  = p4(acc64[60 + i], invB);
    br1[i]  = F32(acc64[90 + i] * invB);
    br4[i]  = p4(acc64[120 + i], invB);
    bt1[i]  = F32(acc64[150 + i] * invB);
    bt4[i]  = p4(acc64[180 + i], invB);
    bn1[i]  = F32(acc64[210 + i] * invB);
    bn4[i]  = p4(acc64[240 + i], invB);
    ur4[i]  = p4(acc64[270 + i], invB);
  }
  const blk = new Float32Array(54), c2 = new Float32Array(18), c4 = new Float32Array(18);
  for (let i = 0; i < 54; i += 2) { blk[i] = F32(acc64[300 + i] * invB); blk[i + 1] = p4(acc64[301 + i], invB); }
  for (let i = 0; i < 18; i += 2) { c2[i]  = F32(acc64[354 + i] * inv2); c2[i + 1]  = p4(acc64[355 + i], inv2); }
  for (let i = 0; i < 18; i += 2) { c4[i]  = F32(acc64[372 + i] * inv4); c4[i + 1]  = p4(acc64[373 + i], inv4); }

  const xl = new Float32Array(193);
  let o1 = 0, o2 = 15, o3 = 30, o4 = 45, o5 = 60, o6 = 75;
  for (let c = 0; c < 3; c++) {
    for (let g = 0; g < 5; g++) {
      const a = c * 10 + GRP5[g][0], b = c * 10 + GRP5[g][1], invN = F32(1 / (b - a));
      let sZ1 = F32(0), sZ4 = F32(0), sR1 = F32(0), sR4 = F32(0), sU4 = F32(0), sC1 = F32(0), sC4 = F32(0);
      for (let k = a; k < b; k++) {
        sZ1 = F32(sZ1 + bz1[k]); sZ4 = F32(sZ4 + bz4[k]);
        sR1 = F32(sR1 + br1[k]); sR4 = F32(sR4 + br4[k]);
        sU4 = F32(sU4 + ur4[k]);
        if (c !== 1) {
          const d1 = F32(bt1[k] - bn1[k]), d4 = F32(bt4[k] - bn4[k]);
          if (d1 > 0) sC1 = F32(sC1 + d1);
          if (d4 > 0) sC4 = F32(sC4 + d4);
        }
      }
      xl[o1++] = F32(sZ1 * invN); xl[o2++] = F32(sZ4 * invN);
      xl[o3++] = F32(sR1 * invN); xl[o4++] = F32(sR4 * invN);
      xl[o5++] = F32(sU4 * invN);
      if (c !== 1) { xl[o6++] = F32(sC1 * invN); xl[o6++] = F32(sC4 * invN); }
    }
  }
  xl.set(blk, 95); xl.set(c2, 149); xl.set(c4, 167);

  let yAc = F32(0), yHf = F32(0), yMid = F32(0), xAc = F32(0), bAc = F32(0);
  for (let k = 11; k < 20; k++) yAc = F32(yAc + rsig[k]);
  for (let k = 16; k < 20; k++) yHf = F32(yHf + rsig[k]);
  for (let k = 11; k < 16; k++) yMid = F32(yMid + rsig[k]);
  for (let k = 1; k < 10; k++) xAc = F32(xAc + rsig[k]);
  for (let k = 21; k < 30; k++) bAc = F32(bAc + rsig[k]);
  const acSqrt = F32(Math.sqrt(yAc)), denY = F32(F32(2040) + acSqrt);
  const hfY = F32(F32(Math.sqrt(yHf)) / denY);
  const midY = F32(F32(Math.sqrt(yMid)) / denY);
  const chS = F32(F32(F32(F32(Math.sqrt(xAc)) * F32(14)) + F32(Math.sqrt(bAc))) / denY);
  const fFlat = flat ? F32(1) : F32(0), f90 = is90 ? F32(1) : F32(0), fNot90 = F32(1 - f90);
  const fEpf = F32(epf);

  xl[185] = F32(1);
  xl[186] = fNot90;
  xl[187] = fFlat;
  xl[188] = hfY;
  xl[189] = F32(hfY * fNot90);
  xl[190] = F32(hfY * fFlat);
  xl[191] = F32(fEpf * F32(0.01));
  xl[192] = F32(F32(fEpf * hfY) * F32(0.01));

  let u = F32(0);
  for (let j = 0; j < m.nnz; j++) u = F32(u + F32(xl[m.idx[j]] * m.wp[j]));
  if (u < 0) u = F32(0);
  const s0 = F32(u * F32(0.95623826));
  const s02 = F32(s0 * s0);
  const s = F32(F32(F32(2.3267656) * s0) - F32(F32(0.020884521) * s02) + F32(F32(6.2484966e-5) * F32(s02 * s0)));
  const baseScore = s <= F32(1e-20) ? F32(100) : F32(F32(100) - F32(F32(10) * F32(powFn(s))));

  let urHi = F32(0);
  for (let k = 15; k < 20; k++) urHi = F32(urHi + ur4[k]);
  urHi = F32(urHi * F32(0.2));
  const logArea = F32(F32(0.5) * f32Log2Pos(F32((width * height) / 589824)));
  const xm = Float32Array.of(
    F32(blk[19] * F32(20)), F32(blk[21] * F32(50)),
    F32(blk[25] * F32(20)), F32(blk[31] * F32(20)),
    F32(c2[6] * F32(100)),  F32(c2[7] * F32(40)),
    F32(c4[7] * F32(40)),   F32(c4[17] * F32(100)),
    F32(urHi * F32(10)),
    hfY, midY, chS,
    F32(f32Log1pPos(fEpf) * F32(0.25)),
    f90, fFlat, logArea
  );

  let ds = m.b2;
  for (let h = 0; h < m.H; h++) {
    let pre = m.b1[h];
    for (let d = 0; d < m.Dm; d++) pre = F32(pre + F32(xm[d] * m.W1[d * m.H + h]));
    if (pre > 0) ds = F32(ds + F32(pre * m.W2[h]));
  }
  return F32(baseScore + ds);
}
