// SPDX-License-Identifier: MIT
import {kernelHooks, ensured, missing, declined} from './kernel-hooks.mjs';
import {fault} from './fault.mjs';
import {calibration} from './quality-calibration.mjs';
import {float16Bits} from './bits.mjs';
import {quantFieldValue, quantFieldBase} from './vardct-planes.mjs';
import {grayTiles} from './screen-photo-kernels.mjs';
import {bandScratch} from './band-scratch.mjs';

export const bandCoefficients = (options, c, length) => options?.bandScratch ? bandScratch(Int16Array, 'band-coeffs' + c, length).fill(0) : new Int16Array(length);

const COSINES = /* @__PURE__ */ Float64Array.of(0.3535533905932738, 0.3535533905932738, 0.3535533905932738, 0.3535533905932738,
  0.3535533905932738, 0.3535533905932738, 0.3535533905932738, 0.3535533905932738, 0.4903926402016152,
  0.4157348061512726, 0.27778511650980114, 0.09754516100806417, -0.0975451610080641, -0.277785116509801,
  -0.4157348061512727, -0.4903926402016152, 0.46193976625564337, 0.19134171618254492, -0.19134171618254486,
  -0.46193976625564337, -0.4619397662556434, -0.19134171618254517, 0.191341716182545, 0.46193976625564326,
  0.4157348061512726, -0.0975451610080641, -0.4903926402016152, -0.2777851165098011, 0.2777851165098009,
  0.4903926402016152, 0.09754516100806439, -0.41573480615127256, 0.3535533905932738, -0.35355339059327373,
  -0.35355339059327384, 0.3535533905932737, 0.35355339059327384, -0.35355339059327334, -0.35355339059327356,
  0.3535533905932733, 0.27778511650980114, -0.4903926402016152, 0.09754516100806415, 0.4157348061512728,
  -0.41573480615127256, -0.09754516100806401, 0.4903926402016153, -0.27778511650980076, 0.19134171618254492,
  -0.4619397662556434, 0.46193976625564326, -0.19134171618254495, -0.19134171618254528, 0.46193976625564337,
  -0.4619397662556432, 0.19134171618254478, 0.09754516100806417, -0.2777851165098011, 0.4157348061512728,
  -0.4903926402016153, 0.4903926402016152, -0.4157348061512725, 0.27778511650980076, -0.09754516100806429);
export {COSINES as dct8Basis};
const radial = (position, rate) => Float64Array.from({length: 64}, (_, k) => {
  const y = Math.max(0, position(Math.sqrt((k & 7) * (k & 7) + (k >> 3) * (k >> 3))) - 1) * rate;
  let term = 1, sum = 1;
  for (let n = 1; n < 30; n++) sum += term = term * y / n;
  return sum;
});
export const QUANT_SHAPE = /* @__PURE__ */ radial(r => r * 5 / Math.sqrt(98), 0.26236426446749106);

export function transformDCT8(block, sums, offset = 0) {
  sums.set(block.subarray(offset, offset + 192));
  transformDCT8Blocks(sums, 1);
  return sums;
}

export function transformDCT8Blocks(blocks, count) {
  if (!(kernelHooks.dct ?? ensured().dct ?? missing())(blocks, count, COSINES)) throw declined('dct');
}

const FAST_S = /* @__PURE__ */ Float64Array.of(1, 0.7209598223816907, 0.7653668647301796, 0.8504300941521988, 1, 1.2727585826345942, 1.8477590650225744, 3.6245097377961106);
export const FAST_SCALE = /* @__PURE__ */ Float64Array.from({length: 64}, (_, k) => FAST_S[k & 7] * FAST_S[k >> 3] / 8);

const TABLE_FIELD = 2;
export const AREA_FIELD = 16;
const half = b => (b & 0x8000 ? -1 : 1) * (b & 0x7c00 ? (1024 + (b & 1023)) * 2 ** (((b >> 10) & 31) - 25) : (b & 1023) * 2 ** -24);
const regionTable = rows => rows.map(([first, falls, dc]) => {
    const bits = falls.map(float16Bits), rate = bits.map(b => { const v = half(b); return v < 0 ? Math.log(1 - v) : -Math.log(1 + v); });
    const shape = Float64Array.from({length: 64}, (_, k) => {
      const at = Math.sqrt((k & 7) * (k & 7) + (k >> 3) * (k >> 3)) / 7 * 5 / (Math.SQRT2 + 1e-6), i = Math.min(4, Math.floor(at));
      let sum = 0;
      for (let j = 0; j < i; j++) sum += rate[j];
      return Math.exp(sum + (at - i) * rate[i]);
    });
    return {first, bits, shape, dc};
  });
const REGION_TABLE = /* @__PURE__ */ regionTable([[10, [0, -0.3, -0.3, -0.3, -0.3], 2.5], [18, [0, -0.3, -0.3, -0.3, -0.3], 4.5], [18, [0, -0.3, -0.3, -0.3, -0.3], 4.5]]);
const RGB_TABLE = /* @__PURE__ */ regionTable([[30, [0, -0.3, -0.3, -0.3, -0.3], 4.5], [10, [0, -0.3, -0.3, -0.3, -0.3], 2.5], [30, [0, -0.3, -0.3, -0.3, -0.3], 4.5]]);
export const strengthOf = quality => Math.max(0, Math.min(1, (90 - quality) / 15));
const distanceOf = (quality, kind) => Math.max(0.1, calibration(quality, kind) * (quality >= 30 ? 0.1 + (100 - quality) * 0.09 : 53 / 3000 * quality * quality - 23 / 20 * quality + 25));
export const photoQualityStep = (quality, kind) => distanceOf(quality, kind) * (1 - 0.1 * strengthOf(quality));
export const areaFieldValue = (base, quality, kind, FIELD) => quantFieldValue(FIELD * base / photoQualityStep(quality, kind));
export function areaFieldQuality(base, value, kind, FIELD) {
  const step = FIELD * base / value;
  let lo = 0, hi = 100;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) * 0.5;
    if (photoQualityStep(mid, kind) <= step) hi = mid; else lo = mid;
  }
  return hi;
}
export function areaFieldBase(areas, quality, kind, perBlock) {
  if (!perBlock) return {FIELD: TABLE_FIELD, peak: TABLE_FIELD};
  const base = photoQualityStep(quality, kind);
  let finest = 1;
  for (const a of areas ?? []) { const ratio = base / photoQualityStep(a.quality, kind); if (ratio > finest) finest = ratio; }
  const FIELD = Math.max(TABLE_FIELD, quantFieldBase(AREA_FIELD, finest));
  let peak = FIELD;
  for (const a of areas ?? []) { const value = areaFieldValue(base, a.quality, kind, FIELD); if (value > peak) peak = value; }
  return {FIELD, peak};
}
function applyAreaField(fields, stride, rows, a, value, from = 0, to = fields.length, areaQualities = null) {
  for (let by = Math.max(0, Math.ceil((a.y - 4) / 8), Math.floor(from / stride)); by < rows && by * 8 + 4 < a.y + a.height && by * stride < to; by++)
    for (let bx = Math.max(0, Math.ceil((a.x - 4) / 8), from - by * stride); bx < stride && bx * 8 + 4 < a.x + a.width && by * stride + bx < to; bx++) {
      const i = by * stride + bx;
      if (value > fields[i]) { fields[i] = value; if (areaQualities) areaQualities[i] = a.quality; }
      else if (areaQualities && value === fields[i] && a.quality > areaQualities[i]) areaQualities[i] = a.quality;
    }
}
function finishAreaFields(fields, FIELD, from = 0, to = fields.length) {
  for (let i = from; i < to; i++) if (!fields[i]) fields[i] = FIELD;
  return fields;
}
function areaFields(areas, quality, kind, stride, rows, FIELD) {
  const fields = new Uint16Array(stride * rows), areaQualities = areas ? new Float32Array(stride * rows) : null;
  if (areas) {
    const base = photoQualityStep(quality, kind);
    for (const a of areas) applyAreaField(fields, stride, rows, a, areaFieldValue(base, a.quality, kind, FIELD), 0, fields.length, areaQualities);
  }
  finishAreaFields(fields, FIELD);
  return {fields, qualities: null, areaQualities};
}
export function* photoCoefficientSteps(data, width, height, quality, colorSpace, gray = false, table = false, areas = null, options = {}) {
  const stride = Math.ceil(width / 8), rows = Math.ceil(height / 8), quantScale = 16, kind = table && !gray ? 'regions' : 'ycbcr';
  const distance = distanceOf(quality, kind), strength = strengthOf(quality), stepScale = 1 - 0.1 * strength;
  const perBlock = options.fieldPlan ? options.fieldPlan.perBlock : table && !gray && areas?.some(a => a.quality !== quality), {FIELD} = areaFieldBase(areas, quality, kind, perBlock);
  const {fields, qualities, areaQualities} = options.fieldPlan ?? areaFields(perBlock ? areas : null, quality, kind, stride, rows, FIELD);
  const components = (gray ? [0] : [0, 1, 2]).map(c => ({h: 1, v: 1, stride, rows,
    quant: Int32Array.from(QUANT_SHAPE, (shape, k) => Math.max(1, Math.round(quantScale * distance * stepScale * (c ? 18 : 10) * (k ? shape : 0.25)))),
    coeffs: bandCoefficients(options, c, stride * rows * 64)}));
  let quantTable = null;
  if (table && !gray) quantTable = components.map((component, c) => {
    const {first: ratio, bits, shape, dc} = REGION_TABLE[c], base = quantScale * distance * stepScale, first = float16Bits(8 * 255 * quantScale / (FIELD * base * ratio) / 64);
    const quant = component.quant = shape.map(value => 8 * 255 * quantScale / (FIELD * half(first) * 64) * value);
    quant[0] = Math.max(1, Math.round(base * dc));
    return [first, ...bits];
  });
  const rowAt = new Int32Array(8);
  const zonesOf = strength => Float64Array.from({length: 192}, (_, i) => (i & 63) && i < 64 ? 0.5 + strength * ((i & 7) >= 4 || (i >> 3) >= 4 ? 0.14 : 0.08) : (i & 63) && quantTable ? 0.65 : 0.5);
  const zones = zonesOf(strength);
  const tables = Float64Array.from({length: 396}, (_, i) => i < 192 ? components[i >> 6]?.quant[i & 63] ?? 1 : i < 384 ? zones[i - 192]
    : (gray ? [1, 0, 0, -128] : [0.299, 0.587, 0.114, -128, -0.168735892, -0.331264108, 0.5, 0, 0.5, -0.418687589, -0.081312411, 0])[i - 384] ?? 0);
  const baseStep = distance * stepScale;
  const scaled = new Map();
  const tablesFor = (v, q) => {
    const s = v === FIELD && !qualities?.has(FIELD) ? strength : strengthOf(q);
    const key = v + s * 65536;
    let t = scaled.get(key);
    if (!t) {
      if (v === FIELD && s === strength) t = tables;
      else {
        t = tables.slice(); t.set(zonesOf(s), 192);
        for (let i = 0; i < 192; i++) if (i & 63) t[i] = tables[i] * FIELD / v;
      }
      scaled.set(key, t);
    }
    return t;
  };
  const blockTable = i => {
    const v = fields[i];
    const q = areaQualities && areaQualities[i] ? areaQualities[i] : qualities?.get(v) ?? (v === FIELD ? quality : areaFieldQuality(baseStep, v, kind, FIELD));
    return tablesFor(v, q);
  };
  const coeffs = components.map(c => c.coeffs);
  if (quantTable ? !kernelHooks.ycbcrTiles : !kernelHooks.ycbcrTile) kernelHooks.ensure?.();
  let cfl = null, nonZero = null;
  if (quantTable) {
    if (!kernelHooks.ycbcrTiles)
      throw fault('JXL_WASM', 'WebAssembly SIMD required');
    const tilesX = Math.ceil(stride / 8);
    cfl = {width: tilesX, x: new Int16Array(tilesX * Math.ceil(rows / 8)), b: new Int16Array(tilesX * Math.ceil(rows / 8))};
    nonZero = [0, 1, 2].map(() => new Uint8Array(stride * rows));
    const grayTile = grayTiles(data, width, height), crops = options.crops;
    if (crops?.length > 1) for (let ty = 0; ty * 8 < rows; ty++) for (let tx = 0; tx * 64 < width; tx++) {
      const i = ty * tilesX + tx; if (grayTile[i]) continue;
      let first = null;
      for (const c of crops) if (c.x < tx * 64 + 64 && c.x + c.width > tx * 64 && c.y < ty * 64 + 64 && c.y + c.height > ty * 64) {
        if (!first) first = c;
        else if (c.x >= first.x + first.width || c.x + c.width <= first.x || c.y >= first.y + first.height || c.y + c.height <= first.y) { grayTile[i] = 1; break; }
      }
    }
    const cflOf = (index, xy, bySum, yy) => {
      const off = grayTile[index] === 1;
      const fx = off ? 0 : Math.max(-128, Math.min(127, Math.round(84 * xy / (yy + 1)))), fb = off ? 0 : Math.max(-128, Math.min(127, Math.round(84 * bySum / (yy + 1))));
      cfl.x[index] = fx; cfl.b[index] = fb;
      return [fx / 84, fb / 84];
    };
    const tableOf = (by, bx) => blockTable(by * stride + bx);
    for (let from = 0; from < rows; from += 32) {
      const to = Math.min(rows, from + 32);
      for (let ty = from >> 3; ty * 8 < to; ty++) for (let tx = 0; tx < tilesX; tx++)
        if (!kernelHooks.ycbcrTiles?.(data, width, height, tx * 8, ty * 8, Math.min(stride, tx * 8 + 8) - tx * 8, Math.min(to, ty * 8 + 8) - ty * 8,
          tableOf, (xy, bySum, yy) => cflOf(ty * tilesX + tx, xy, bySum, yy), coeffs, nonZero, stride, COSINES))
          throw fault('JXL_WASM', 'WebAssembly SIMD required');
      yield to / rows;
    }
  } else {
    const run = (by, x0, count, t) => {
      if (!kernelHooks.ycbcrTile?.(data, width, rowAt, x0, count, t, coeffs, (by * stride + x0) * 64, COSINES))
        throw fault('JXL_WASM', 'WebAssembly SIMD required');
    };
    const band = (from, to) => {
      for (let by = from; by < to; by++) {
        for (let y = 0; y < 8; y++) rowAt[y] = Math.min(height - 1, by * 8 + y) * width * 4;
        for (let x0 = 0; x0 < stride; x0 += 64) {
          const count = Math.min(64, stride - x0);
          for (let n = 0; n < count;) {
            const tbl = blockTable(by * stride + x0 + n);
            let end = n + 1;
            while (end < count && blockTable(by * stride + x0 + end) === tbl) end++;
            run(by, x0 + n, end - n, tbl); n = end;
          }
        }
      }
    };
    for (let by = 0; by < rows; by += 32) { band(by, Math.min(rows, by + 32)); yield Math.min(rows, by + 32) / rows; }
  }
  const opaque = (kernelHooks.opaque ?? ensured().opaque ?? missing())(data);
  if (opaque === undefined) throw fault('JXL_PLATFORM', 'opaque: declined');
  const alpha = opaque ? null : Uint8Array.from(data);
  return {width, height, components, quantScale, ycbcr: true, orientation: 1, alpha, colorSpace, ...quantTable && {quantTable, quantFieldBase: FIELD, cfl, nonZero}, ...perBlock && {quantFields: fields}};
}

export function* rgbCoefficientSteps(data, width, height, quality, colorSpace, areas = null, options = {}) {
  const stride = Math.ceil(width / 8), rows = Math.ceil(height / 8), quantScale = 16, kind = 'regions';
  const distance = distanceOf(quality, kind), strength = strengthOf(quality), stepScale = 1 - 0.1 * strength;
  const perBlock = options.fieldPlan ? options.fieldPlan.perBlock : areas?.some(a => a.quality !== quality), {FIELD} = areaFieldBase(areas, quality, kind, perBlock);
  const {fields, qualities, areaQualities} = options.fieldPlan ?? areaFields(perBlock ? areas : null, quality, kind, stride, rows, FIELD);
  const components = [0, 1, 2].map(() => ({h: 1, v: 1, stride, rows, quant: null, coeffs: options.packed && kernelHooks.rgbBand ? null : new Int16Array(stride * rows * 64)}));
  const quantTable = components.map((component, c) => {
    const {first: ratio, bits, shape, dc} = RGB_TABLE[c], base = quantScale * distance * stepScale, first = float16Bits(8 * 255 * quantScale / (FIELD * base * ratio) / 64);
    const quant = component.quant = shape.map(value => 8 * 255 * quantScale / (FIELD * half(first) * 64) * value);
    quant[0] = Math.max(1, Math.round(base * dc));
    return [first, ...bits];
  });
  const zonesOf = strength => Float64Array.from({length: 192}, (_, i) => !(i & 63) ? 0.5 : i >= 64 && i < 128 ? 0.5 + strength * ((i & 7) >= 4 || ((i & 63) >> 3) >= 4 ? 0.14 : 0.08) : 0.65);
  const steps = Float64Array.from({length: 192}, (_, i) => components[i >> 6].quant[i & 63]);
  const baseStep = distance * stepScale;
  const scaled = new Map();
  const tablesFor = (v, q) => {
    const s = v === FIELD && !qualities?.has(FIELD) ? strength : strengthOf(q);
    const key = v + s * 65536;
    let t = scaled.get(key);
    if (!t) {
      t = new Float64Array(384); t.set(steps); t.set(zonesOf(s), 192);
      for (let i = 0; i < 192; i++) if (i & 63) t[i] = steps[i] * FIELD / v;
      scaled.set(key, t);
    }
    return t;
  };
  const blockTable = i => {
    const v = fields[i];
    const q = areaQualities && areaQualities[i] ? areaQualities[i] : qualities?.get(v) ?? (v === FIELD ? quality : areaFieldQuality(baseStep, v, kind, FIELD));
    return tablesFor(v, q);
  };
  const tilesX = Math.ceil(stride / 8);
  const cfl = {width: tilesX, x: new Int16Array(tilesX * Math.ceil(rows / 8)), b: new Int16Array(tilesX * Math.ceil(rows / 8))};
  if (!kernelHooks.rgbTiles && !(options.packed && kernelHooks.rgbBand)) kernelHooks.ensure?.();
  if (!kernelHooks.rgbTiles && !(options.packed && kernelHooks.rgbBand))
    throw fault('JXL_WASM', 'WebAssembly SIMD required');
  const gray = grayTiles(data, width, height);
  const cflOf = (index, rg, bg, gg) => {
    const off = gray[index] === 1;
    const fx = off ? 0 : Math.max(-128, Math.min(127, Math.round(84 * rg / (gg + 1)))), fb = off ? 0 : Math.max(-128, Math.min(127, Math.round(84 * bg / (gg + 1))));
    cfl.x[index] = fx; cfl.b[index] = fb;
    return [1 + fx / 84, 1 + fb / 84];
  };
  const tableOf = (by, bx) => blockTable(by * stride + bx);
  const result = () => ({width, height, components, quantScale, ycbcr: false, cflBase: 1, cfl, orientation: 1, alpha: null, colorSpace, quantTable, quantFieldBase: FIELD, ...perBlock && {quantFields: fields}});
  if (options.packed && kernelHooks.rgbBand?.(data, width, height, {components, tableOf, cflOf, basis: COSINES, quantScale})) {
    yield 1; return result();
  }
  for (const component of components) component.coeffs ??= new Int16Array(stride * rows * 64);
  if (!kernelHooks.rgbTiles) kernelHooks.ensure?.();
  for (let from = 0; from < rows; from += 32) {
    const to = Math.min(rows, from + 32);
    for (let ty = from >> 3; ty * 8 < to; ty++) for (let tx = 0; tx < tilesX; tx++)
      if (!kernelHooks.rgbTiles?.(data, width, height, tx * 8, ty * 8, Math.min(stride, tx * 8 + 8) - tx * 8, Math.min(to, ty * 8 + 8) - ty * 8,
        tableOf, (rg, bg, gg) => cflOf(ty * tilesX + tx, rg, bg, gg), components.map(c => c.coeffs), stride, COSINES, quantScale))
        throw fault('JXL_WASM', 'WebAssembly SIMD required');
    yield to / rows;
  }
  return result();
}

import {kernelInstance, arenaHolder, takeArena, growArena} from './kernel-runtime.mjs';
import {fitRawSteps} from './vardct-planes.mjs';
import {evalCoeffLookFromAcc} from './quantization-math.mjs';

export const BAND_OF_K = /* @__PURE__ */ (() => {
  const cuts = [0, 2, 5, 10, 17, 25, 34, 45, 61, 98], out = new Uint8Array(64);
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
    const r2 = u * u + v * v;
    let b = 9;
    for (let m = 0; m < 10; m++) if (r2 <= cuts[m]) { b = m; break; }
    out[v * 8 + u] = b;
  }
  return out;
})();

const CL_BIAS = 0.0037930732552754493;
const CL_ROOT_BIAS = /* @__PURE__ */ (() => {
  let r = Math.sqrt(Math.sqrt(CL_BIAS));
  for (let i = 0; i < 7; i++) r = (2 * r + CL_BIAS / (r * r)) / 3;
  return r;
})();
const CL_LINEAR = /* @__PURE__ */ Float32Array.from({length: 256}, (_, i) => {
  const v = i / 255;
  if (i <= 10) return Math.fround(v / 12.92);
  const base = (v + 0.055) / 1.055, sq = base * base;
  let fifth = Math.sqrt(Math.sqrt(sq));
  for (let n = 0; n < 12; n++) fifth = (4 * fifth + sq / (fifth * fifth * fifth * fifth)) / 5;
  return Math.fround(sq * fifth);
});
const CL_MIX = /* @__PURE__ */ Float32Array.of(0.3, 0.622, 0.078, 0.23, 0.692, 0.078, 0.24342268924547819, 0.20476744424496821, 0.5518098665095536);
const CL_GAB_DEF = [0.115169525, 0.061248592];
const CL_GAB_90 = [0.075, 0.028];
const CL_COS8 = /* @__PURE__ */ Float64Array.of(1, 0.9238795325112867, 0.7071067811865476, 0.38268343236508984, 0, -0.3826834323650898, -0.7071067811865475, -0.9238795325112867);

let clHolder = null, clTablesReady = false;
function clQuantSpec(q, pictureOpts) {
  const F = Math.fround, qc = Math.min(q, 99.9);
  const distance = Math.max(0.0248, calibration(qc, pictureOpts.calibrationRow ?? false) *
    (qc >= 99 ? 0.19 - 0.16 * (qc - 99) : qc >= 30 ? 0.1 + (100 - qc) * 0.09 : 53 / 3000 * qc * qc - 23 / 20 * qc + 25));
  const strength = Math.max(0, Math.min(1, (90 - qc) / 15));
  const stepScale = 1 - 0.1 * strength, acScale = 1.175 + 0.075 * strength;
  const tune = pictureOpts.tune;
  const ramp = pictureOpts.dcRamp && qc < 70 ? Math.min(1, (70 - qc) / 20) : 0;
  const dcScale = c => ramp ? pictureOpts.dcScale[c] + ramp * (pictureOpts.dcRamp[c] - pictureOpts.dcScale[c]) : pictureOpts.dcScale[c];
  const gabTilt = (c, k) => {
    if (!pictureOpts.gaborish?.tilt) return 1;
    const [w1, w2] = pictureOpts.gaborish.weights?.[c] ?? CL_GAB_DEF;
    const a = CL_COS8[k & 7], b = CL_COS8[k >> 3];
    return (1 + 4 * w1 + 4 * w2) / (1 + 2 * w1 * (a + b) + 4 * w2 * a * b);
  };
  const quantScale = 256;
  const quantOf = c => Int32Array.from(QUANT_SHAPE, (shape, k) => Math.max(1, Math.round(quantScale * distance * stepScale *
    (k ? acScale * [0.84, 7, 5.6][c] * shape * (1 + [1, 0, 5][c] * Math.sqrt(((k & 7) * (k & 7) + (k >> 3) * (k >> 3)) / 98)) * tune(c, k, qc) * gabTilt(c, k)
       : [1.05, 7, 12.6][c] * 0.25 * dcScale(c)))));
  const quants = fitRawSteps([0, 1, 2].map(quantOf));
  const dead = pictureOpts.deadzone;
  const steps = new Float32Array(192), invSteps = new Float32Array(192), thr = new Float32Array(192);
  for (let c = 0; c < 3; c++) {
    for (let k = 0; k < 64; k++) {
      const st = F(quantScale / quants[c][k]);
      steps[c * 64 + k] = st;
      invSteps[c * 64 + k] = F(1 / st);
      const high = (k & 7) >= 4 || (k >> 3) >= 4;
      thr[c * 64 + k] = F(k ? dead[c * 2 + (high ? 1 : 0)] : 0.5);
    }
  }
  const epf = ((qc <= 90 || pictureOpts.filterAlways) && pictureOpts.filter !== 'off' ? 20 * distance : 0) * (pictureOpts.epfScale ?? 1);
  const is90 = !!(pictureOpts.gaborish?.weights);
  return { q, steps, invSteps, thr, epf, is90 };
}

export function coeffLookBatch(data, width, height, candidates, makePictureOpts, flat, samplePixels = 1048576) {
  const {memory, exports} = kernelInstance();
  if (!exports.coeffLookTile || !exports.coeffGatherTile || !exports.coeffLookPow) return null;
  clHolder ||= arenaHolder(() => { clTablesReady = false; });
  takeArena(clHolder);

  const F = Math.fround, P = candidates.length;
  const specs = candidates.map(q => clQuantSpec(q, makePictureOpts(q)));
  const needLow = specs.some(s => !s.is90), needHigh = specs.some(s => s.is90);
  const c84 = (flat ? 0.7 : 0.75) * 84;

  const stride = Math.ceil(width / 8), rows = Math.ceil(height / 8);
  const tileCols = Math.ceil(stride / 8), tileRows = Math.ceil(rows / 8);
  let rowStep = 1, colStep = 1;
  if (samplePixels < 1048576) {
    rowStep = tileRows > 4 ? Math.max(1, Math.floor(tileRows / 4)) : 1;
    const sampledRows = Math.ceil(tileRows / rowStep);
    colStep = Math.max(1, Math.round(tileCols / Math.max(4, samplePixels / (sampledRows * 4096))));
  } else if (width * height > 1650000) {
    rowStep = Math.max(1, Math.floor(tileRows / Math.max(4, Math.floor(1048576 / (width * 64)))));
  }

  const BASE = 65536;
  const LIN = BASE, MIX = LIN + 1024, SCALE = MIX + 64, BMAP = SCALE + 256, CFL_OUT = BMAP + 64;
  const TABLES_AT = CFL_OUT + 16;
  const ACC_AT = TABLES_AT + P * 2304;
  const SCRATCH_AT = ((ACC_AT + P * 3152) + 15) & ~15;
  const TILE_AT = ((SCRATCH_AT + 42240 + 256) + 15) & ~15;
  const WORK_AT = TILE_AT + 49152;

  const W = stride * 8, maxN = 68;
  const rgbaBytes = Math.ceil((maxN * width * 4) / 16) * 16;
  const planeBytes = maxN * W * 4;
  const totalNeed = WORK_AT + rgbaBytes + (needLow && needHigh ? 9 : 6) * planeBytes + W * 16 + 4096;
  if (memory.buffer.byteLength < totalNeed) growArena(totalNeed);

  const u8 = new Uint8Array(memory.buffer);
  const i32 = new Int32Array(memory.buffer);
  const f32 = new Float32Array(memory.buffer);
  const f64 = new Float64Array(memory.buffer);

  f32.set(CL_LINEAR, LIN >> 2);
  f32.set(CL_MIX, MIX >> 2);
  for (let k = 0; k < 64; k++) f32[(SCALE >> 2) + k] = F(FAST_SCALE[k]);
  u8.set(BAND_OF_K, BMAP);

  for (let p = 0; p < P; p++) {
    const tBase = (TABLES_AT + p * 2304) >> 2;
    f32.set(specs[p].steps, tBase);
    f32.set(specs[p].invSteps, tBase + 192);
    f32.set(specs[p].thr, tBase + 384);
    const aBase = (ACC_AT + p * 3152) >> 3;
    f64.fill(0, aBase, aBase + 393);
  }

  const rgbaAt = WORK_AT, planesAt = rgbaAt + rgbaBytes;
  const lowInto = planesAt + 3 * planeBytes;
  const highInto = needLow && needHigh ? planesAt + 6 * planeBytes : lowInto;
  const ringAt = (needLow && needHigh ? planesAt + 9 * planeBytes : planesAt + 6 * planeBytes);
  const rowBytes = width * 4;
  const lastRow = data.subarray((height - 1) * rowBytes, height * rowBytes);

  const normLow = F(1 / (1 + 4 * CL_GAB_DEF[0] + 4 * CL_GAB_DEF[1]));
  const normHigh = F(1 / (1 + 4 * CL_GAB_90[0] + 4 * CL_GAB_90[1]));

  for (let ty = 0; ty < tileRows; ty += rowStep) {
    const bh = Math.min(8, rows - ty * 8);
    const y0 = ty * 64, y1 = y0 + bh * 8;
    const s0 = Math.max(0, y0 - 2), s1 = Math.min(rows * 8, y1 + 2), n = s1 - s0;
    const direct = Math.min(s1, height) - s0;
    if (direct > 0) u8.set(data.subarray(s0 * rowBytes, (s0 + direct) * rowBytes), rgbaAt);
    for (let y = Math.max(s0, height); y < s1; y++) u8.set(lastRow, rgbaAt + (y - s0) * rowBytes);

    const curPlane = n * W * 4;
    exports.fgXyb(rgbaAt, width, n, W, LIN, MIX, F(CL_BIAS), F(CL_ROOT_BIAS), planesAt);
    if (needLow) {
      for (let c = 0; c < 3; c++) {
        const src = planesAt + c * curPlane, dst = lowInto + c * planeBytes;
        exports.gab32From(src, dst, W, n, F(CL_GAB_DEF[0]), F(CL_GAB_DEF[1]), normLow, F(1.6));
        exports.gab32(dst, src, ringAt, W, n, F(CL_GAB_DEF[0]), F(CL_GAB_DEF[1]), normLow);
      }
    }
    if (needHigh) {
      for (let c = 0; c < 3; c++) {
        const src = planesAt + c * curPlane, dst = highInto + c * planeBytes;
        exports.gab32From(src, dst, W, n, F(CL_GAB_90[0]), F(CL_GAB_90[1]), normHigh, F(1.4));
        exports.gab32(dst, src, ringAt, W, n, F(CL_GAB_90[0]), F(CL_GAB_90[1]), normHigh);
      }
    }

    for (let tx = 0; tx < tileCols; tx += colStep) {
      const bw = Math.min(8, stride - tx * 8);
      if (needLow) {
        exports.coeffGatherTile(lowInto, lowInto + planeBytes, lowInto + 2 * planeBytes, W, y0 - s0, tx * 64, bw, bh, TILE_AT, SCALE, c84, CFL_OUT);
        const fx = i32[CFL_OUT >> 2], fb = i32[(CFL_OUT >> 2) + 1];
        for (let p = 0; p < P; p++) if (!specs[p].is90) {
          const tPtr = TABLES_AT + p * 2304, aPtr = ACC_AT + p * 3152;
          exports.coeffLookTile(TILE_AT, bw, bh, fx, fb, tPtr, tPtr + 768, tPtr + 1536, BMAP, SCRATCH_AT, aPtr);
        }
      }
      if (needHigh) {
        exports.coeffGatherTile(highInto, highInto + planeBytes, highInto + 2 * planeBytes, W, y0 - s0, tx * 64, bw, bh, TILE_AT, SCALE, c84, CFL_OUT);
        const fx = i32[CFL_OUT >> 2], fb = i32[(CFL_OUT >> 2) + 1];
        for (let p = 0; p < P; p++) if (specs[p].is90) {
          const tPtr = TABLES_AT + p * 2304, aPtr = ACC_AT + p * 3152;
          exports.coeffLookTile(TILE_AT, bw, bh, fx, fb, tPtr, tPtr + 768, tPtr + 1536, BMAP, SCRATCH_AT, aPtr);
        }
      }
    }
  }

  return specs.map((sp, p) => {
    const aBase = (ACC_AT + p * 3152) >> 3;
    const score = evalCoeffLookFromAcc(f64.subarray(aBase, aBase + 393), width, height, flat, sp.is90, sp.epf, exports.coeffLookPow);
    return { q: sp.q, score };
  });
}

export function coeffLookSettle(data, width, height, aim, startQ, makePictureOpts, flat, samplePixels = 1048576) {
  const qMid = Math.max(58, Math.min(95.5, Math.round((startQ - 2.5) * 100) / 100));
  const qLo = Math.max(50, Math.round((qMid - 8.0) * 100) / 100);
  const qHi = Math.min(99.2, Math.round((qMid + 6.5) * 100) / 100);
  const pts = coeffLookBatch(data, width, height, [qLo, qMid, qHi], makePictureOpts, flat, samplePixels);
  if (!pts) return null;

  const q0 = pts[0].q, q1 = pts[1].q, q2 = pts[2].q;
  const s0 = pts[0].score, s1 = Math.max(s0 + 0.02, pts[1].score), s2 = Math.max(s1 + 0.02, pts[2].score);
  const localSlope = Math.max(0.35, Math.min(2.2, (s2 - s0) / Math.max(0.5, q2 - q0)));

  let settled;
  if (aim <= s0) {
    const slope0 = Math.max(0.35, (s1 - s0) / Math.max(0.5, q1 - q0));
    settled = Math.max(36, q0 - Math.min(14, (s0 - aim) / slope0));
  } else if (aim <= s1) {
    const t = (aim - s0) / Math.max(0.02, s1 - s0);
    settled = q0 + t * (q1 - q0);
  } else if (aim <= s2) {
    const t = (aim - s1) / Math.max(0.02, s2 - s1);
    settled = q1 + t * (q2 - q1);
  } else {
    const slope2 = Math.max(0.30, (s2 - s1) / Math.max(0.5, q2 - q1));
    settled = Math.min(99.3, q2 + Math.min(6.5, (aim - s2) / slope2));
  }
  if (!flat && q0 >= 85 && settled < 85) settled = 85;
  settled = Math.max(36, Math.min(99.3, Math.round(settled * 100) / 100));
  return { quality: settled, slope: localSlope, nodes: [[q0, s0], [q1, s1], [q2, s2]] };
}
