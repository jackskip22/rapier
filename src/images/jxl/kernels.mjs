// SPDX-License-Identifier: MIT
import {compileKernels, kernelsSupported, kernelInstance, arenaHolder, heldExports, takeArena, growArena, tryGrowArena, retireKernels,
  SH_ARGS, SH_LOG2, SH_SYM, SH_LOGLEN, SH_REPEATS, SH_FREQS, SH_SCRATCH, SH_BEST} from './kernel-runtime.mjs';
import {align16, drainBits, rows2d, rowsOut} from './kernel-call.mjs';
import {kernelHooks, declined} from './kernel-hooks.mjs';
import {ARENA_BYTES} from './arena.mjs';
import {jpegKernels, capJpegKernels, releaseJpegKernels} from './jpeg-kernels.mjs';
import {WEIGHTED_BUCKET, weightedTables} from './weighted-policy.mjs';
import {BitWriter} from './bits.mjs';
import {hybridToken} from './prefix.mjs';
import {fault} from './admit.mjs';
import {inCall, onCallEnd, arenaLeased} from './call-scope.mjs';

export const {ensureKernels, disableEntropyKernels, prepareKernels, arenaKernels, releaseArena, lendEntropy, orientBlock, pngRow, sampleTable, sampleBands, writeAnsTokens} = (() => {
const UPLOAD = typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true;
const JPEG = typeof __RAPIER_JXL_JPEG__ !== 'undefined' && __RAPIER_JXL_JPEG__ === true;
const SAMPLE = typeof __RAPIER_JXL_SAMPLE__ !== 'undefined' && __RAPIER_JXL_SAMPLE__ === true;
const CAPTURE_PHOTO = typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true;
const TREE_STEPS = typeof __RAPIER_JXL_UNSTEPPED__ === 'undefined' || !__RAPIER_JXL_UNSTEPPED__;
const CLUSTERED_TREES = !UPLOAD && !JPEG && !CAPTURE_PHOTO;
const TREE_DEVICE = typeof __RAPIER_JXL_TEN_DEVICE__ === 'undefined' || __RAPIER_JXL_TEN_DEVICE__ === true;
const CLI = typeof __RAPIER_JXL_CLI__ !== 'undefined' && __RAPIER_JXL_CLI__ === true;
const PROG = typeof __RAPIER_JXL_PROGRESSIVE__ === 'undefined' || __RAPIER_JXL_PROGRESSIVE__ === true;

const P = 65536, R = 327680, PROPERTY = 589824, CONTEXT = 851968, OUTPUT = 1114128, TABLE = 1642496, SOURCE = 1769472, STATE = 2097152;
const DIV = 16, WEIGHTS = 272, BUCKET = 16656, MAP = 20672, ALPHABET = 257, RAW_BINS = 4129;
const PLAIN = {split: 0, msb: 0, lsb: 0}, GROUP_PLANES = [P, PROPERTY, CONTEXT, STATE], FILL_OUT = [P, R, PROPERTY, CONTEXT];
const isInt = Number.isInteger, isSafe = Number.isSafeInteger;
const isU8Like = a => a instanceof Uint8Array || a instanceof Uint8ClampedArray;
const acceptableWriter = w => !w || (w instanceof BitWriter && w.write === BitWriter.prototype.write && w.grow === BitWriter.prototype.grow);
const acceptableConfig = c => isInt(c.split) && isInt(c.msb) && isInt(c.lsb) && c.split >= 0 && c.split <= 15 && c.msb >= 0 && c.lsb >= 0 && c.msb + c.lsb <= c.split && (1 << c.split) + ((19 - c.split) << (c.msb + c.lsb)) <= 224;

let memory, simd, buf, u8, i8, i16, u16, i32, u32, f32, f64, active = 'off', entropyAllowed = true, holder = null;
let acClean = false, acCleanBytes = 0, ansStamp = null, zdLoaded = false, acBucketsZero = false, tileTables = null, tileBand = null, acResident = null, acDeferred = null;
let retainEpoch = 0, heldSampleTable = null, sampleTableEpoch = -1, heldLevels = null, heldSafe = null, heldLevelsKey = '';
let shapeEpoch = -1, shapeTables = null, s2cPrepLoaded = -1, vbLoaded = -1, vbSlots = null, vbNext = 0, vbStrip = null, bandLast = null, vbRegionNext = R + 12352;
const vbViewCache = new Map(), enteredOf = new Map();
const entered = f => enteredOf.get(f) ?? enteredOf.set(f, function (...a) { takeArena(holder); return f.apply(this, a); }).get(f);
const OWN_HOOKS = ['weighted', 'fill', 'palette', 'rct', 'tuple', 'passLevels', 'group', 'screen', 'sampled', 'dct', 'dctFast', 'ycbcrTile', 'ycbcrTiles', 'rgbTiles', 'rgbBand', 'photoTile', 'acGroup', 'acGroupPair', 'acDeferred', 'opaque', 'nonzero', 'entropy', 'varblock', 'gaborish', 'strategyFill', 'strategyWrite', 'xybPlanes', 'gabBand', 'dcEvents', 'dcPlan', 'planTokens', 'shape', 's2cChannel', 's2cPrep', 'vbRateModel', 'vbTokenBits'];

const sync = () => {
  if (buf !== memory.buffer) {
    buf = memory.buffer; u8 = new Uint8Array(buf); i8 = new Int8Array(buf); i16 = new Int16Array(buf); u16 = new Uint16Array(buf);
    i32 = new Int32Array(buf); u32 = new Uint32Array(buf); f32 = new Float32Array(buf); f64 = new Float64Array(buf);
    vbViewCache.clear();
  }
  return buf;
};
const grow = end => { if (end > memory.buffer.byteLength) growArena(end); return sync(); };
const tryGrow = end => (end <= memory.buffer.byteLength || tryGrowArena(end)) && (sync(), true);
const set32 = (vals, at) => { sync(); vals.forEach((v, k) => { i32[(at >> 2) + k] = v; }); };
const dirty = (keepAns, keepVb, keepPrep) => {
  const kv = keepVb && vbLoaded === retainEpoch, kp = keepPrep && s2cPrepLoaded === retainEpoch;
  acClean = false; if (!keepAns) ansStamp = null; zdLoaded = false; acBucketsZero = false; tileBand = null; acResident = null;
  if (keepVb) vbStrip = null;
  retainEpoch++;
  if (kv) vbLoaded = retainEpoch;
  if (kp) s2cPrepLoaded = retainEpoch;
  sync();
};

const initializeTables = (SAMPLE || CAPTURE_PHOTO || JPEG) ? null : v => { weightedTables(v, DIV, WEIGHTS); v.set(WEIGHTED_BUCKET, BUCKET >> 2); };

function createEngine() {
  const inst = kernelInstance();
  memory = inst.memory;
  holder ??= arenaHolder(() => {
    if (acDeferred) throw fault('JXL_INTERNAL', 'kernels:arena-deferred-ac');
    acClean = false; ansStamp = null; zdLoaded = false; acBucketsZero = false; tileBand = null; tileTables = null; acResident = null;
    vbStrip = null; vbLoaded = -1; s2cPrepLoaded = -1; shapeEpoch = -1; sampleTableEpoch = -1; heldLevelsKey = ''; retainEpoch++;
  }, sync, () => { sync(); initializeTables?.(i32); });
  simd = heldExports(inst.exports, holder);
  buf = null; sync();
  initializeTables?.(i32);
}

const SAMPLE_TABLE = P, SAMPLE_LEVELS = P + 524288, SAMPLE_SAFE = SAMPLE_LEVELS + 32768 + 4097 * 4 + 7 & ~7, SAMPLE_BAND_AT = SAMPLE_SAFE + 131072;
const sampleScratch = (JPEG || CAPTURE_PHOTO) ? null : function sampleScratch(end = SAMPLE_BAND_AT + 524288) {
  if (active !== 'simd' || !simd.sampleBand) throw fault('JXL_WASM', 'resampling kernel: unavailable');
  const held = sampleTableEpoch === retainEpoch;
  dirty();
  if (held) sampleTableEpoch = retainEpoch;
  return grow(end);
};

const pngRow = (JPEG || CAPTURE_PHOTO) ? null : function pngRow(row, n, above, raw, at, filter, bpp, out, outAt, w, channels) {
  sampleScratch(P + n * 3 + w * 4);
  u8.set(row.subarray(0, n), P);
  if (out) return simd.pngWiden(P, w, channels, P + n), out.set(u8.subarray(P + n, P + n + w * 4), outAt);
  u8.set(above.subarray(0, n), P + n); u8.set(raw.subarray(at, at + n), P + 2 * n);
  simd.pngUnfilter(filter, P + 2 * n, P, P + n, n, bpp);
  row.set(u8.subarray(P, P + n));
};

const orientBlock = CAPTURE_PHOTO ? null : function orientBlock(from, to, stride, outStride, x, y, width, height, ox, oy, pixelBytes, orientation) {
  if (active !== 'simd' || !simd.orientRGBA) throw fault('JXL_WASM', 'orientation kernel: unavailable');
  if (!(from instanceof Uint8Array) || !(to instanceof Uint8Array) || ![4, 8, 16].includes(pixelBytes) ||
      !isInt(width) || !isInt(height) || width < 1 || height < 1 || width > 256 || height > 256 || !isInt(orientation) || orientation < 1 || orientation > 8)
    throw fault('JXL_INTERNAL', 'kernels:orientation-block');
  dirty();
  const dst = P + width * height * pixelBytes;
  rows2d(u8, from, stride, x, y, width, height, pixelBytes, P);
  simd.orientRGBA(P, width, height, pixelBytes, orientation, dst);
  rowsOut(to, u8, outStride, ox, oy, orientation >= 5 ? height : width, orientation >= 5 ? width : height, pixelBytes, dst);
};

const sampleTable = (JPEG || CAPTURE_PHOTO) ? null : function sampleTable(maximum, transfer) {
  if (![255, 1023, 4095, 65535].includes(maximum) || !(isInt(transfer) && (transfer >= 0 && transfer <= 4 || transfer >= 1221 && transfer <= 1e7)))
    throw fault('JXL_INTERNAL', 'kernels:sample-transfer-table');
  sampleScratch(); simd.sampleTable(transfer, maximum, SAMPLE_TABLE, 0);
  sampleTableEpoch = retainEpoch;
  return heldSampleTable = f64.slice(SAMPLE_TABLE >> 3, (SAMPLE_TABLE >> 3) + maximum + 1);
};

const sampleBands = (JPEG || CAPTURE_PHOTO) ? null : function sampleBands(width, height, target, rows, config, table, levels, bytesPerSample) {
  if (![width, height, target, rows].every(n => isInt(n) && n >= 1) || ![1, 2, 4].includes(bytesPerSample) ||
      levels && !(config[0] < 2 && [255, 1023, 4095].includes(config[1]) && !config[3] && config[4] === 1))
    throw fault('JXL_INTERNAL', 'kernels:resample-band-config');
  const stride = Math.max(width, target) * 32, rowBytes = width * 4 * bytesPerSample, outBytes = target * 4 * bytesPerSample;
  const sourceRows = Math.max(1, Math.min(height, Math.floor(262144 / width))), outRows = Math.max(1, Math.min(rows, Math.floor(262144 / target)));
  const scratch = SAMPLE_BAND_AT, sum = scratch + stride * 3, index = scratch + stride * 4, weights = index + target * 12 + 7 & ~7;
  const input = weights + (width + 2 * target) * 8, output = input + sourceRows * rowBytes, end = output + outRows * outBytes;
  return {sourceRows, outRows, run(data, first, last, y0, y1, out, outY, carry, open, base = 0) {
    if (last - first > sourceRows || last <= first || y1 - y0 > outRows || y0 < 0 || y1 > rows || y0 >= y1 || first < 0 || last > height || carry && carry.length !== target * 4)
      throw fault('JXL_INTERNAL', 'kernels:resample-band-carry');
    sampleScratch(end);
    if (table && (heldSampleTable !== table || sampleTableEpoch !== retainEpoch)) {
      f64.set(table, SAMPLE_TABLE >> 3); heldSampleTable = table; sampleTableEpoch = retainEpoch;
    }
    const key = config[1] + ':' + config[2];
    if (levels && heldLevelsKey !== key) {
      simd.sampleTable(config[2], config[1], SAMPLE_BAND_AT, SAMPLE_LEVELS);
      simd.sampleSafe(SAMPLE_LEVELS, config[1], SAMPLE_SAFE);
      heldLevels = u8.slice(SAMPLE_LEVELS, SAMPLE_LEVELS + 32768 + 4097 * 4);
      heldSafe = u8.slice(SAMPLE_SAFE, SAMPLE_SAFE + 131072); heldLevelsKey = key;
    } else if (levels) { u8.set(heldLevels, SAMPLE_LEVELS); u8.set(heldSafe, SAMPLE_SAFE); }
    u8.set(new Uint8Array(data.buffer, data.byteOffset + (first - base) * rowBytes, (last - first) * rowBytes), input);
    if (carry) f64.set(carry, sum >> 3);
    simd.samplePlan(width, target, index, weights);
    const st = simd.sampleBand(input, first, last, carry ? 1 : 0, width, height, target, rows, y0, y1, ...config,
      table ? SAMPLE_TABLE : 0, levels ? SAMPLE_LEVELS : 0, levels ? SAMPLE_SAFE : 0, index, weights, scratch, stride, output);
    if (st) throw fault('JXL_INPUT', [null, 'alpha: finite 0-1', 'color samples: finite', 'PQ samples: 0-1', 'HLG samples: nonnegative', 'resampled value: out of range'][st]);
    const done = y1 - y0 - (open ? 1 : 0);
    new Uint8Array(out.buffer, out.byteOffset + outY * outBytes, done * outBytes).set(u8.subarray(output, output + done * outBytes));
    return open ? f64.slice(sum >> 3, (sum >> 3) + target * 4) : null;
  }};
};

const SMALL_TOKENS = SAMPLE ? null : {residual: R, table: TABLE, output: OUTPUT};
const tokens = SAMPLE ? null : function tokens(w, targets, count, contexts, config = PLAIN, rawLength = 0, at = SMALL_TOKENS) {
  dirty();
  const stride = rawLength || ALPHABET, {residual, table, output} = at;
  if (!acceptableWriter(w) || !targets.length || targets.length > 34) return false;
  if (w) {
    i32.fill(0, table >> 2, (table >> 2) + targets.length * ALPHABET * 2);
    for (let c = 0; c < targets.length; c++) {
      const code = targets[c];
      if (!code?.lengths || !code?.codes || code.lengths.length > ALPHABET) return false;
      for (let s = 0; s < code.lengths.length; s++) { i32[(table >> 2) + (c * ALPHABET + s) * 2] = code.lengths[s]; i32[(table >> 2) + (c * ALPHABET + s) * 2 + 1] = code.codes[s]; }
    }
  } else for (let c = 0; c < targets.length; c++) {
    if (!(targets[c] instanceof Uint32Array) || targets[c].length !== stride) return false;
    i32.set(targets[c], (table >> 2) + c * stride);
  }
  const written = simd.tokens(residual, contexts, count, table, output, w ? 1 : 0, w ? w.acc : 0, w ? w.pending : 0, config.split, config.msb, config.lsb, rawLength);
  if (w) drainBits(w, u8, output, written, i32[(output - 8) >> 2], i32[(output - 4) >> 2]);
  else for (let c = 0; c < targets.length; c++) targets[c].set(i32.subarray((table >> 2) + c * stride, (table >> 2) + (c + 1) * stride));
  return true;
};

const weighted = SAMPLE ? null : function weighted(w, targets, plane, width, height, offset, contextOf, residuals, properties) {
  dirty();
  if (!(plane instanceof Int16Array && isInt(width) && isInt(height) && width > 0 && height > 0 && plane.length >= width * height && isInt(offset) && Math.abs(offset) <= 32768) || !acceptableWriter(w)) return false;
  const n = width * height;
  if (w && w.at + n * 8 + 32 > 0x7fffffff) throw fault('JXL_MEMORY', 'weighted predictor: output >2GB');
  if (residuals && (!(residuals instanceof Uint32Array) || residuals.length < n)) return false;
  if (properties && (!(properties instanceof Int32Array) || properties.length < n)) return false;
  if (contextOf.length !== 34 || contextOf.some(c => !isInt(c) || c < 0 || c >= (residuals ? 34 : targets.length))) return false;
  if (residuals && (n > 1048576 || width > 16384)) {
    const rows = Math.max(1, Math.min(height, Math.floor(1048576 / width))), band = rows * width;
    const first = P + width * 4, res = first + band * 4, prop = res + band * 4, st = prop + band * 4;
    grow(st + (width + 2) * 40);
    i32.fill(0, st >> 2, (st >> 2) + (width + 2) * 10);
    for (let y0 = 0; y0 < height; y0 += rows) {
      const y1 = Math.min(height, y0 + rows), count = (y1 - y0) * width;
      i32.set(plane.subarray(Math.max(0, y0 - 1) * width, y1 * width), (y0 ? P : first) >> 2);
      simd.captureWeighted(first, width, y1, offset, res, prop, y0, 0, 0, DIV, WEIGHTS, st);
      residuals.set(i32.subarray(res >> 2, (res >> 2) + count), y0 * width);
      if (properties) properties.set(i32.subarray(prop >> 2, (prop >> 2) + count), y0 * width);
    }
    return true;
  }
  const large = n > 65536, residual = large ? P + n * 4 : R, property = large ? P + n * 8 : PROPERTY;
  const context = large ? P + n * 12 : CONTEXT, state = large ? P + n * 16 : STATE;
  const table = large ? align16(state + (width + 2) * 40) : TABLE, output = large ? table + 34 * ALPHABET * 8 + 16 : OUTPUT;
  grow(large && !residuals ? output + n * 8 + 64 : state + (width + 2) * 40);
  i32.set(plane.subarray(0, n), P >> 2); i32.set(contextOf, MAP >> 2);
  i32.fill(0, state >> 2, (state >> 2) + (width + 2) * 10);
  if (!UPLOAD && residuals && properties && !offset) simd.wpDc(P, width, height, residual, property, DIV, WEIGHTS, state);
  else simd.weighted(P, width, height, offset, residual, property, context, MAP, BUCKET, DIV, WEIGHTS, state);
  if (properties) properties.set(i32.subarray(property >> 2, (property >> 2) + n));
  if (residuals) return residuals.set(i32.subarray(residual >> 2, (residual >> 2) + n)), true;
  return tokens(w, targets, n, context, PLAIN, 0, large ? {residual, table, output} : SMALL_TOKENS);
};

const rgbaBands = SAMPLE || JPEG ? null : function rgbaBands(rgba, imageWidth, x0, y0, w, h, count, planes, run) {
  dirty();
  const wide = rgba instanceof Int16Array, view = wide ? i16 : u8, to = wide ? SOURCE >> 1 : SOURCE;
  const limit = wide ? 32768 : 65536, rows = Math.max(1, Math.floor(limit / w)), span = Math.min(w, limit);
  for (let y = 0; y < h; y += rows) for (let x = 0; x < w; x += span) {
    const r = Math.min(rows, h - y), n = Math.min(span, w - x);
    rows2d(view, rgba, imageWidth, x0 + x, y0 + y, n, r, 4, to);
    run(r * n);
    for (let c = 0; c < count; c++) planes[c].set(i32.subarray(FILL_OUT[c] >> 2, (FILL_OUT[c] >> 2) + r * n), y * w + x);
  }
  return true;
};
const fill = SAMPLE || JPEG ? null : (rgba, imageWidth, x0, y0, w, h, channels, planes) =>
  rgbaBands(rgba, imageWidth, x0, y0, w, h, channels, planes, n => simd.fill(SOURCE, n, channels, ...FILL_OUT));

const tupleTables = new WeakMap();
const tupleIndex = SAMPLE || JPEG ? null : function tupleIndex(planes, n, keys, out) {
  const k = planes.length;
  let t = tupleTables.get(keys);
  if (!t) {
    const bits = Math.max(4, 32 - Math.clz32(keys.length * 2 - 1)), mask = (1 << bits) - 1, slots = new Int32Array(5 << bits);
    keys.forEach((key, at) => {
      if (key.length !== k) throw declined('tupleIndex');
      let h = 2166136261 | 0, slot;
      for (const v of key) h = Math.imul(h ^ v, 16777619);
      for (slot = h & mask; slots[slot * 5 + 4] && !key.every((v, c) => slots[slot * 5 + c] === (v | 0)); slot = slot + 1 & mask);
      slots.set(key, slot * 5); slots[slot * 5 + 4] = at + 1;
    });
    tupleTables.set(keys, t = {slots, mask});
  }
  dirty();
  i32.set(t.slots, TABLE >> 2);
  for (let at = 0; at < n; at += 65536) {
    const m = Math.min(65536, n - at);
    for (let c = 0; c < k; c++) i32.set(planes[c].subarray(at, at + m), (P >> 2) + c * m);
    simd.tupleIndex(P, m * 4, m, k, TABLE, t.mask, SOURCE);
    out.set(i32.subarray(SOURCE >> 2, (SOURCE >> 2) + m), at);
  }
  return true;
};

const passLevels = SAMPLE || JPEG || !PROG ? null : function passLevels(coeffs, passes, pass) {
  dirty();
  const out = new Int16Array(coeffs.length);
  i32.set(passes.flatMap(({downsample, shift}) => [downsample, shift]), P >> 2);
  for (let at = 0; at < coeffs.length; at += 131072) {
    const n = Math.min(131072, coeffs.length - at);
    i16.set(coeffs.subarray(at, at + n), R >> 1);
    simd.passLevels(R, n, P, pass, PROPERTY);
    out.set(i16.subarray(PROPERTY >> 1, (PROPERTY >> 1) + n), at);
  }
  return out;
};

const rctFill = SAMPLE || JPEG ? null : function rctFill(rgba, imageWidth, x0, y0, w, h, type, channels, planes) {
  const p = Math.floor(type / 7), q = Math.floor(p / 3);
  return rgbaBands(rgba, imageWidth, x0, y0, w, h, channels, planes,
    n => simd.rctFill(SOURCE, n, p % 3, (p + 1 + q) % 3, (p + 2 - q) % 3, type % 7, channels, rgba instanceof Int16Array ? 1 : 0, ...FILL_OUT));
};

const paletteTables = new WeakMap();
const paletteFill = SAMPLE || JPEG ? null : function paletteFill(rgba, imageWidth, x0, y0, w, h, palette, grey, alpha, plane) {
  let t = paletteTables.get(palette);
  if (!t) {
    const bits = Math.max(4, 32 - Math.clz32(palette.length * 2 - 1)), mask = (1 << bits) - 1, slots = new Uint32Array(2 << bits);
    palette.forEach((key, at) => {
      let slot = Math.imul(key >>> 0, 0x9e3779b1) >>> (32 - bits);
      while (slots[slot * 2 + 1] && slots[slot * 2] !== key >>> 0) slot = slot + 1 & mask;
      slots[slot * 2] = key >>> 0; slots[slot * 2 + 1] = at + 1;
    });
    paletteTables.set(palette, t = {slots, mask, shift: 32 - bits});
  }
  sync(); i32.set(t.slots, R >> 2);
  return rgbaBands(rgba, imageWidth, x0, y0, w, h, 1, [plane], n => simd.paletteFill(SOURCE, n, grey ? 1 : 0, alpha ? 1 : 0, R, t.mask, t.shift, P));
};

const loadBasis = JPEG || SAMPLE ? null : function loadBasis(basis, base = R) {
  const pair = base + 512;
  f64.set(basis, base >> 3);
  for (let u = 0; u < 8; u += 2) for (let x = 0; x < 8; x++) {
    f64[(pair >> 3) + u * 8 + x * 2] = basis[u * 8 + x];
    f64[(pair >> 3) + u * 8 + x * 2 + 1] = basis[(u + 1) * 8 + x];
  }
  return pair;
};

const dct = JPEG || SAMPLE ? null : function dct(blocks, count, basis) {
  dirty();
  if (active !== 'simd' || !(blocks instanceof Float64Array) || !isInt(count) || count < 1 || count > 64 || blocks.length < count * 192 || !(basis instanceof Float64Array) || basis.length !== 64) return false;
  f64.set(blocks.subarray(0, count * 192), P >> 3);
  simd.dct(P, count, R, loadBasis(basis), P + 98304);
  blocks.set(f64.subarray(P >> 3, (P >> 3) + count * 192));
  return true;
};

const dctFast = JPEG || SAMPLE ? null : function dctFast(blocks, count, scale) {
  dirty();
  if (active !== 'simd' || !(blocks instanceof Float64Array) || !isInt(count) || count < 1 || blocks.length < count * 192 || !(scale instanceof Float64Array) || scale.length !== 64) return false;
  f64.set(scale, R >> 3);
  for (let off = 0; off < count; off += 64) {
    const n = Math.min(64, count - off);
    f64.set(blocks.subarray(off * 192, (off + n) * 192), P >> 3);
    simd.xybTile(0, 0, n, 1, P, 0, 0, R, 0, 0, 0, 0, 0);
    blocks.set(f64.subarray(P >> 3, (P >> 3) + n * 192), off * 192);
  }
  return true;
};

const padTileRows = (data, width, height, bx0, by0, bw, rows, dst, rowAt) => {
  const rowBytes = bw * 32, from = bx0 * 32, inside = Math.min(rowBytes, width * 4 - from);
  for (let y = 0; y < rows; y++) {
    const at = (rowAt ? rowAt[y] : Math.min(height - 1, by0 * 8 + y) * width * 4) + from, row = dst + y * rowBytes;
    u8.set(data.subarray(at, at + inside), row);
    for (let x = inside; x < rowBytes; x += 4) u8.copyWithin(row + x, row + inside - 4, row + inside);
  }
  return rowBytes;
};

const ycbcrTile = JPEG || SAMPLE ? null : function ycbcrTile(data, width, rowAt, x0, count, tables, coeffs, offset, basis) {
  if (active !== 'simd' || !simd.ycbcrTile) return false;
  const YT_SCRATCH = P + 98304, YT_SRC = YT_SCRATCH + 512, YT_OUT = YT_SRC + 16384, YT_TABLES = YT_OUT + 24576;
  dirty();
  const rowBytes = padTileRows(data, width, 0, x0, 0, count, 8, YT_SRC, rowAt), planes = coeffs.length;
  f64.set(tables, YT_TABLES >> 3);
  simd.ycbcrTile(YT_SRC, rowBytes, count, P, R, loadBasis(basis), YT_SCRATCH, YT_TABLES, YT_TABLES + 1536, YT_TABLES + 3072, planes, YT_OUT, 16);
  for (let c = 0; c < planes; c++) coeffs[c].set(i16.subarray((YT_OUT >> 1) + c * count * 64, (YT_OUT >> 1) + (c + 1) * count * 64), offset);
  return true;
};

const YCBCR_WIRE_MAP = [1, 0, 2], ycbcrWireTables = new WeakMap();
function ycbcrWireTable(t) {
  let wire = ycbcrWireTables.get(t);
  if (!wire) {
    wire = new Float64Array(396);
    for (let wc = 0; wc < 3; wc++) {
      const sc0 = YCBCR_WIRE_MAP[wc] * 64;
      for (let k = 0; k < 64; k++) { wire[wc * 64 + k] = 16 / t[sc0 + k]; wire[192 + wc * 64 + k] = t[192 + sc0 + k]; }
    }
    wire.set(t.subarray(388, 392), 384); wire.set(t.subarray(384, 388), 388); wire.set(t.subarray(392, 396), 392);
    ycbcrWireTables.set(t, wire);
  }
  return wire;
}

const ycbcrTiles = JPEG || SAMPLE ? null : function ycbcrTiles(data, width, height, bx0, by0, bw, bh, tableOf, cflOf, planes, nonZero, stride, basis) {
  if (active !== 'simd' || !simd.ycbcrRegion || !simd.ycbcrQuant || !isU8Like(data) || !(bw >= 1 && bw <= 8 && bh >= 1 && bh <= 8)) return false;
  const SCRATCH = P + 98304, SRC = SCRATCH + 512, OUT = SRC + 16384, COUNTS = OUT + 24576, SUMS = COUNTS + 192, WTS = SUMS + 32, TABS = WTS + 96, TABLES = R + 1024;
  dirty();
  const count = bw * bh, slots = new Map();
  let firstWire = null;
  for (let n = 0; n < count; n++) {
    const t = tableOf(by0 + (n / bw | 0), bx0 + n % bw);
    let at = slots.get(t);
    if (at === undefined) {
      const w = ycbcrWireTable(t);
      firstWire ??= w;
      at = TABLES + slots.size * 3072;
      f64.set(w.subarray(0, 384), at >> 3); slots.set(t, at);
    }
    i32[(TABS >> 2) + n] = at;
  }
  f64.set(firstWire.subarray(384, 396), WTS >> 3);
  const rowBytes = padTileRows(data, width, height, bx0, by0, bw, bh * 8, SRC);
  simd.ycbcrRegion(SRC, rowBytes, bw, bh, P, R, loadBasis(basis), SCRATCH, TABS, WTS, OUT, COUNTS, SUMS);
  const [rx, rb] = cflOf(f64[SUMS >> 3], f64[(SUMS >> 3) + 1], f64[(SUMS >> 3) + 2]);
  simd.ycbcrQuant(P, count, TABS, rx, rb, OUT, COUNTS);
  for (let wc = 0; wc < 3; wc++) {
    const dst = planes[YCBCR_WIRE_MAP[wc]], nz = nonZero?.[YCBCR_WIRE_MAP[wc]];
    for (let y = 0; y < bh; y++) {
      const fb = wc * count + y * bw, block = (by0 + y) * stride + bx0;
      dst.set(i16.subarray((OUT >> 1) + fb * 64, (OUT >> 1) + (fb + bw) * 64), block * 64);
      if (nz) nz.set(u8.subarray(COUNTS + fb, COUNTS + fb + bw), block);
    }
  }
  return true;
};

const rgbTile = JPEG || SAMPLE ? null : function rgbTile(data, width, height, bx0, by0, bw, bh, tableOf, cflOf, planes, stride, basis, quantScale, resident = null) {
  if (active !== 'simd' || !simd.rgbTile || !isU8Like(data) || !(bw >= 1 && bw <= 8 && bh >= 1 && bh <= 8)) return false;
  const SCRATCH = P + 98304, SRC = SCRATCH + 512, OUT = SRC + 16384, SUMS = OUT + 24576, TABS = SUMS + 32, TABLES = R + 1024;
  dirty();
  const count = bw * bh, slots = new Map();
  for (let n = 0; n < count; n++) {
    const t = tableOf(by0 + (n / bw | 0), bx0 + n % bw);
    let at = slots.get(t);
    if (at === undefined) {
      if (t.length !== 384) return false;
      at = TABLES + slots.size * 3072;
      f64.set(t, at >> 3); slots.set(t, at);
    }
    i32[(TABS >> 2) + n] = at;
  }
  const rowBytes = resident ? stride * 32 : padTileRows(data, width, height, bx0, by0, bw, bh * 8, SRC);
  simd.rgbTile(resident ? resident.pixels + by0 * 8 * rowBytes + bx0 * 32 : SRC, rowBytes, bw, bh, P, R, loadBasis(basis), SCRATCH, TABS, OUT, quantScale, SUMS);
  const [ax, ab] = cflOf(f64[SUMS >> 3], f64[(SUMS >> 3) + 1], f64[(SUMS >> 3) + 2]);
  simd.rgbQuant(P, count, TABS, ax, ab, OUT, quantScale);
  for (let c = 0; c < 3; c++) for (let y = 0; y < bh; y++) {
    const fb = c * count + y * bw, block = (by0 + y) * stride + bx0;
    if (resident) u8.copyWithin(resident.levels + ((c * 8 + y) * stride + bx0) * 128, OUT + fb * 128, OUT + (fb + bw) * 128);
    else planes[c].set(i16.subarray((OUT >> 1) + fb * 64, (OUT >> 1) + (fb + bw) * 64), block * 64);
  }
  return true;
};

const TILE_ROOTS = 20816, TILE_LINEAR = 53728, TILE_MIX = 59872, TILE_SCALE = 59952, TILE_STEPS = 60464, TILE_LIMITS = 62000;
const TILE_F64 = P + 16384, TILE_BAND = 12582912, TILE_SUMS = P + 150160, TILE_OUT = P + 153256, TILE_COUNTS = P + 177832;
const sampleLayout = (data, samples = null, signed = false) => {
  if (isU8Like(data)) return {mode: signed ? 1 : 0, bpe: 4, bytes: data, curve: null, lift: 1};
  const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
  if ((data instanceof Uint16Array || typeof Float16Array === 'function' && data instanceof Float16Array) && samples?.exponentBits === 5)
    return {mode: 3, bpe: 8, bytes, curve: null, lift: samples.lift ?? 1};
  if (data instanceof Uint16Array) {
    const curve = samples?.curve;
    return curve instanceof Float64Array && curve.length === 1 << (samples.bitDepth ?? 16) ? {mode: 2, bpe: 8, bytes, curve, lift: samples.lift ?? 1} : null;
  }
  return data instanceof Float32Array ? {mode: 4, bpe: 16, bytes, curve: null, lift: samples?.lift ?? 1} : null;
};

const acIdentities = new WeakMap();
const acIdentity = s => { let id = acIdentities.get(s); if (!id) acIdentities.set(s, id = {}); return id; };

const photoTile = JPEG || SAMPLE ? null : function photoTile(data, width, height, bx0, by0, bw, bh, tables, cfl, components, stride, nonZero) {
  retainEpoch++;
  const layout = sampleLayout(data, tables.samples, tables.signed);
  const lin = layout?.mode <= 1 ? (Array.isArray(tables.linear) ? tables.linear : [tables.linear, tables.linear, tables.linear]) : null;
  if (active !== 'simd' || !layout || data.length !== width * height * 4 || !isInt(bw) || !isInt(bh) || bw < 1 || bw > 8 || bh < 1 || bh > 8 ||
      tables.roots.length !== 4113 || (lin && (lin.length !== 3 || lin.some(t => t.length !== 256))) || tables.mix.length !== 9) return false;
  const bpe = layout.bpe, bandAt = TILE_BAND + (layout.mode === 2 ? layout.curve.byteLength : 0), padded = stride * 8 * bpe, end = bandAt + 64 * padded;
  if (end > memory.buffer.byteLength) { if (data.buffer === memory.buffer) data = data.slice(); grow(end); } else sync();
  const source = acIdentity(data);
  if (tileBand?.tables !== tables || tileBand.source !== source || tileBand.width !== width || tileBand.height !== height || tileBand.stride !== stride || tileBand.by0 !== by0 || tileBand.bh !== bh) {
    acClean = false; ansStamp = null; zdLoaded = false; acBucketsZero = false; acResident = null;
    if (layout.mode === 2) f64.set(layout.curve, TILE_BAND >> 3);
    const rowWidth = width * bpe, padCols = stride * 8 - width;
    for (let y = 0; y < bh * 8; y++) {
      const at = Math.min(height - 1, by0 * 8 + y) * rowWidth, row = bandAt + y * padded;
      u8.set(layout.bytes.subarray(at, at + rowWidth), row);
      for (let p = 0; p < padCols; p++) u8.set(layout.bytes.subarray(at + rowWidth - bpe, at + rowWidth), row + rowWidth + p * bpe);
    }
    tileBand = {tables, source, width, height, stride, by0, bh};
  }
  const count = bw * bh;
  if (tileTables !== tables) {
    f64.set(tables.roots, TILE_ROOTS >> 3); f64.set(tables.mix, TILE_MIX >> 3); f64[(TILE_MIX + 72) >> 3] = layout.lift; f64.set(tables.scale, TILE_SCALE >> 3);
    for (let c = 0; c < 3; c++) {
      if (lin) f64.set(lin[c], (TILE_LINEAR >> 3) + c * 256);
      f64.set(tables.steps[c], (TILE_STEPS >> 3) + c * 64); f64.set(tables.limits[c], (TILE_LIMITS >> 3) + c * 64);
    }
    tileTables = tables;
  }
  simd.xybTile(bandAt + bx0 * 8 * bpe, padded, bw, bh, TILE_F64, TILE_ROOTS, layout.mode === 2 ? TILE_BAND : TILE_LINEAR, TILE_SCALE, tables.bias, tables.rootBias, TILE_SUMS, TILE_MIX, layout.mode);
  const [fx, fb] = cfl(f64[(TILE_SUMS >> 3) + 1], f64[TILE_SUMS >> 3], f64[(TILE_SUMS >> 3) + 2]);
  if (simd.quantTile(TILE_F64, count, TILE_STEPS, TILE_LIMITS, fx / 84, fb / 84, TILE_OUT, TILE_COUNTS, tables.strict ? 1 : 0)) return 'overflow';
  for (let c = 0; c < 3; c++) for (let y = 0; y < bh; y++) {
    const fb0 = c * count + y * bw, block = (by0 + y) * stride + bx0;
    components[c].coeffs.set(i16.subarray((TILE_OUT >> 1) + fb0 * 64, (TILE_OUT >> 1) + (fb0 + bw) * 64), block * 64);
    nonZero[c].set(u8.subarray(TILE_COUNTS + fb0, TILE_COUNTS + fb0 + bw), block);
  }
  return true;
};

const AC = 4194304, AC_COEFFS = AC + 128, AC_STRIDE = 131072, AC_COUNTS = AC_COEFFS + 3 * AC_STRIDE, AC_BUCKETS = AC_COUNTS + 3072;
const AC_BLOCK_CTX = AC_BUCKETS + 1024, AC_ORDERS = AC_BLOCK_CTX + 1024, AC_ZD = AC_ORDERS + 256, AC_NZ = AC_ZD + 8192;
const AC_MAP = AC_NZ + 12288, AC_CONFIGS = AC_MAP + 8192, AC_CODES = AC_CONFIGS + 4096, RECIPS_BYTES = 4097 * 8;
const ansTables = new WeakMap();
let reciprocalTable = null;
const reciprocals = SAMPLE ? null : () => {
  if (reciprocalTable) return reciprocalTable;
  const table = new Int32Array(4097 * 2);
  for (let d = 1; d <= 4096; d++) {
    const l = 32 - Math.clz32(d - 1), n = 2 ** (32 + l);
    let q = Math.floor(n / d), r = n - q * d;
    if (r < 0) { q--; r += d; } else if (r >= d) { q++; r -= d; }
    table[d * 2] = (q + (r ? 1 : 0) - 2 ** 32) | 0; table[d * 2 + 1] = l;
  }
  return reciprocalTable = table;
};
const ansTablesOf = SAMPLE ? null : model => {
  let t = ansTables.get(model);
  if (t) return t;
  const {histograms} = model, ids = histograms.length, slots = [0, 0, 0], alphabet = Math.max(...histograms.map(h => Math.max(h.counts.length, h.starts.length)));
  t = {ids, alphabet, small: new Int32Array(ids * 64), freqs: new Int32Array(ids * 64), starts: new Int32Array(ids * 64),
    reverse: new Uint16Array(ids * 4096), configs: new Int32Array(ids * 4), counts: new Int32Array(ids * alphabet), symbolStarts: new Int32Array(ids * alphabet)};
  histograms.forEach((h, id) => {
    for (let v = 0; v < 64; v++) {
      hybridToken(h.config, v, slots);
      t.small[id * 64 + v] = slots[1] << 6 | slots[2]; t.freqs[id * 64 + v] = h.counts[slots[0]]; t.starts[id * 64 + v] = h.starts[slots[0]];
    }
    t.reverse.set(h.reverse, id * 4096);
    t.configs.set([h.config.splitToken, h.config.split, h.config.msb, h.config.lsb], id * 4);
    t.counts.set(h.counts, id * alphabet);
    t.symbolStarts.set(h.starts, id * alphabet);
  });
  ansTables.set(model, t);
  return t;
};
const ansLayout = (ans, n) => {
  const S = AC_CODES, F = S + ans.ids * 256, ST = F + ans.ids * 256, RV = ST + ans.ids * 256, CF = RV + ans.ids * 8192,
    CN = CF + ans.ids * 16, SS = CN + ans.ids * ans.alphabet * 4, RC = SS + ans.ids * ans.alphabet * 4 + 7 & ~7,
    VL = RC + RECIPS_BYTES, ID = VL + n * 4, RW = ID + n + 8 & ~7, MT = RW + n * 4, EM = MT + n + 8 & ~7, OUT = EM + n * 2 + 8 & ~7;
  return {S, F, ST, RV, CF, CN, SS, RC, VL, ID, RW, MT, EM, OUT, end: OUT + n * 8 + 16, tables: [S, F, ST, RV, CF, CN, SS, ans.alphabet]};
};
const loadAns = (model, ans, L) => {
  if (ansStamp === model) return;
  i32.set(ans.small, L.S >> 2); i32.set(ans.freqs, L.F >> 2); i32.set(ans.starts, L.ST >> 2); u16.set(ans.reverse, L.RV >> 1);
  i32.set(ans.configs, L.CF >> 2); i32.set(ans.counts, L.CN >> 2); i32.set(ans.symbolStarts, L.SS >> 2); i32.set(reciprocals(), L.RC >> 2);
  ansStamp = model;
};
const takeFlushed = SAMPLE ? null : (w, args, out) => { sync(); drainBits(w, u8, out, i32[(args >> 2) + 17], i32[(args >> 2) + 15], i32[(args >> 2) + 16]); };
const takePrefix = SAMPLE ? null : (w, out) => { sync(); drainBits(w, u8, out, i32[(AC >> 2) + 25], i32[(AC >> 2) + 23], i32[(AC >> 2) + 24]); };
const loadPrefix = SAMPLE ? null : (model, codes, alphabet) => {
  sync(); u8.set(model.contextMap, AC_MAP);
  i32.fill(0, AC_CODES >> 2, (AC_CODES >> 2) + codes.length * alphabet * 2);
  codes.forEach(({config, code}, h) => {
    set32([config.splitToken, config.split, config.msb, config.lsb], AC_CONFIGS + h * 16);
    for (let s = 0; s < code.lengths.length; s++) { i32[(AC_CODES >> 2) + (h * alphabet + s) * 2] = code.lengths[s]; i32[(AC_CODES >> 2) + (h * alphabet + s) * 2 + 1] = code.codes[s]; }
  });
};

const parkAt = values => align16(values + 23 * 3 * 1024 * 64 + 256);
const acGroupPair = SAMPLE || JPEG ? null : function acGroupPair(state, g0, g1, pass, sink0, sink1, zd) {
  if (sink0.counts || sink1.counts || !sink0.coding || sink0.coding.model !== sink1.coding?.model || sink0.coding.model?.kind !== 'ans') return false;
  const pair = {};
  if (acGroup(state, g0, pass, sink0, zd, pair) !== 3) return false;
  if (acGroup(state, g1, pass, sink1, zd, pair) === 2) return 2;
  const args = AC_CONFIGS + 4096 - 256;
  set32(pair.args, args); simd.ansFlush(args); takeFlushed(pair.w, args, pair.out);
  return 1;
};

const flushTokens = (SAMPLE || CAPTURE_PHOTO) ? null : function flushTokens(w, model, values, ids, n) {
  if (!memory) createEngine();
  takeArena(holder);
  dirty(1);
  const ans = ansTablesOf(model), L = ansLayout(ans, n);
  if (L.end > memory.buffer.byteLength) {
    if (values.buffer === memory.buffer) values = values.slice(0, n);
    if (ids.buffer === memory.buffer) ids = ids.slice(0, n);
    grow(L.end);
  }
  loadAns(model, ans, L);
  u32.set(values.subarray(0, n), L.VL >> 2); u8.set(ids.subarray(0, n), L.ID);
  const args = AC_CONFIGS + 4096 - 128;
  set32([L.VL, L.ID, n, ...L.tables, L.RW, L.MT, L.EM, L.OUT, w.acc, w.pending, 0, L.RC], args);
  simd.ansFlush(args);
  takeFlushed(w, args, L.OUT);
};
const entropyKernels = (SAMPLE || CLI) ? null : () => jpegKernels(CAPTURE_PHOTO ? null : flushTokens);

let keptPool = null, keptScoped = false;
onCallEnd(() => { if (keptPool) keptPool.at = 0; }, () => {
  keptPool = null;
  if (active !== 'simd' || acDeferred || arenaLeased() || memory.buffer.byteLength <= (4 << 20)) return;
  retireKernels(); createEngine();
});
const keptScope = SAMPLE ? null : mode => {
  if (mode === 'enter') keptScoped = true;
  else if (mode === 'rewind') { if (keptPool) keptPool.at = 0; }
  else { keptScoped = false; keptPool = null; }
};
const keptTokens = SAMPLE ? null : (values, ctxs) => {
  if (!inCall() && !keptScoped) return {values: values.slice(), ctxs: ctxs.slice()};
  const n = values.length;
  if (!keptPool) keptPool = {values: new Int32Array(Math.max(n, 65536)), ctxs: new Uint16Array(Math.max(n, 65536)), at: 0};
  else if (keptPool.at + n > keptPool.values.length) {
    const size = Math.max(keptPool.at + n, 2 * keptPool.values.length), gv = new Int32Array(size), gc = new Uint16Array(size);
    gv.set(keptPool.values.subarray(0, keptPool.at)); gc.set(keptPool.ctxs.subarray(0, keptPool.at));
    keptPool.values = gv; keptPool.ctxs = gc;
  }
  const pool = keptPool, at = pool.at;
  pool.values.set(values, at); pool.ctxs.set(ctxs, at); pool.at = at + n;
  return {get values() { return pool.values.subarray(at, at + n); }, get ctxs() { return pool.ctxs.subarray(at, at + n); }};
};

const acRowStart = SAMPLE ? null : ({groupStarts, starts, segment}, counts, row, bx0, stride) => {
  if (groupStarts) return groupStarts[row * Math.ceil(stride / 32) + bx0 / 32];
  const s0 = Math.floor(bx0 / segment);
  let from = starts[row * Math.ceil(stride / segment) + s0];
  for (let b = row * stride + s0 * segment; b < row * stride + bx0; b++) from += counts[b];
  return from;
};

const acGroupRow = SAMPLE ? null : function acGroupRow(comps, source, by0, xsizeBlocks, ysizeBlocks, stride, at) {
  const kept = acResident?.held;
  if (kept && kept.offs >= at && kept.by0 === by0 && kept.stride === stride && kept.packs.every((p, c) => p === comps[c].packed) && kept.counts.every((s, c) => s === source[c])) return kept;
  const AC_ROWS_AT = at + 256, rows = Math.min(32, ysizeBlocks - by0), groups = Math.ceil(stride / 32), across = Math.ceil(xsizeBlocks / 32);
  const lows = new Int32Array(3 * rows), highs = new Int32Array(3 * rows);
  for (let c = 0; c < 3; c++) {
    const packed = comps[c].packed, counts = source[c], gs = packed.groupStarts, seg = packed.segment;
    for (let y = 0; y < rows; y++) {
      const row = by0 + y, rowOff = row * stride, gsRow = gs ? row * groups : 0;
      let low = 0x7fffffff, high = 0;
      for (let g = 0; g < across; g++) {
        const bx0 = g * 32, start = gs ? gs[gsRow + g] : acRowStart(packed, counts, row, bx0, stride);
        let end = start;
        if (gs && g + 1 < across && (bx0 + 32) % seg) end = gs[gsRow + g + 1];
        else for (let b = rowOff + bx0, stop = b + Math.min(32, xsizeBlocks - bx0); b < stop; b++) end += counts[b];
        if (start < low) low = start;
        if (end > high) high = end;
      }
      lows[c * rows + y] = low; highs[c * rows + y] = high;
    }
  }
  const size = (c, y0, y1) => { const n = highs[c * rows + y1 - 1] - lows[c * rows + y0]; return align16(n) + align16(2 * n) + align16((y1 - y0) * stride); };
  const room = 368 * 65536 - 256, chunks = [[], [], []], whole = size(0, 0, rows) + size(1, 0, rows) + size(2, 0, rows) <= room;
  let next = AC_ROWS_AT;
  for (let c = 0; c < 3; c++) for (let y0 = 0; y0 < rows;) {
    let y1 = rows;
    while (y1 - y0 > 1 && size(c, y0, y1) > room) y1 = y0 + (y1 - y0 >> 1);
    const from = lows[c * rows + y0], to = highs[c * rows + y1 - 1], n = to - from, base = whole ? next : AC_ROWS_AT;
    chunks[c].push({y0, y1, from, to, at: base, val: base + align16(n), cnt: base + align16(n) + align16(2 * n), loaded: false});
    if (whole) next += size(c, y0, y1);
    y0 = y1;
  }
  grow(whole ? next : AC_ROWS_AT + Math.max(...chunks.flat().map(k => k.cnt - k.at + (k.y1 - k.y0) * stride)) + 16);
  return {by0, stride, packs: comps.map(cp => cp.packed), counts: [source[0], source[1], source[2]], chunks, whole, offs: at, current: null};
};

const takeCounts = SAMPLE ? null : (counts, at, list, touched) => {
  sync();
  for (let i = 0; i < touched; i++) {
    const index = i32[(list >> 2) + i], n = u32[(at >> 2) + index];
    counts.small[index] += n; counts.totals[index >> 6] += n; u32[(at >> 2) + index] = 0;
  }
};
const deferredCounts = SAMPLE || JPEG ? null : function deferredCounts() {
  if (!acDeferred) return;
  const {counts, at, list, touched} = acDeferred;
  acDeferred = null;
  if (!acClean) throw fault('JXL_INTERNAL', 'kernels:ac-counts-release');
  takeCounts(counts, at, list, touched);
};

const acGroup = SAMPLE ? null : function acGroup(state, g, pass, sink, zd, pair = null) {
  retainEpoch++;
  const {authoredOrderPasses, groupsX, strategyData, progression, contexts, lumaBuckets, lumaW, xsizeBlocks, ysizeBlocks, comps, grey,
    orders, counted, blockCounts, nonZero, hshifts, vshifts} = state;
  if (active !== 'simd' || strategyData || progression || authoredOrderPasses?.[pass] || grey || (!nonZero && (!counted || !entropyAllowed)) ||
      hshifts.some(Boolean) || vshifts.some(Boolean) || comps.some(comp => !(comp.coeffs instanceof Int16Array || !comp.coeffs && comp.packed?.starts)) ||
      contexts.contexts > 65536 || contexts.map.length > 8192) return false;
  tileBand = null;
  let codes = null, alphabet = 0, w = null, ans = null;
  if (!sink.counts) {
    const model = sink.coding.model;
    if (!model || model.histograms.length > 256 || model.contextMap.length > 8192 || !acceptableWriter(sink.w)) return false;
    if (model.kind === 'ans') {
      if (!sink.coding.flush || model.histograms.some(h => !(h.reverse instanceof Uint16Array) || h.reverse.length !== 4096)) return false;
      ans = ansTablesOf(model);
    } else if (model.kind === 'prefix') { codes = model.histograms; alphabet = Math.max(...codes.map(h => h.code.lengths.length)); }
    else return false;
    w = sink.w;
  }
  const gx = g % groupsX, gy = g / groupsX | 0, bx0 = gx * 32, by0 = gy * 32;
  const bw = Math.min(32, xsizeBlocks - bx0), bh = Math.min(32, ysizeBlocks - by0), blocks = bw * bh, stride = comps[0].stride;
  const source = counted ? blockCounts : nonZero, packed = !comps[0].coeffs;
  if (packed && !nonZero) return false;
  if (!nonZero) {
    if (bw < 1 || bh < 1 || !isInt(stride) || stride < bx0 + bw || !isInt(contexts.numDc) || contexts.numDc < 1 || contexts.numDc > 16 ||
        !isInt(contexts.numCtxs) || contexts.numCtxs < 1 || contexts.numCtxs > 16 || zd.length !== 4096) return false;
    const stop = (by0 + bh - 1) * stride + bx0 + bw;
    for (let c = 0; c < 3; c++) {
      if (comps[c].stride !== stride || comps[c].coeffs.length < stop * 64 || !(source[c] instanceof Uint8Array) || source[c].length < stop || orders[c].length !== 64 ||
          orders[c].some(k => !isInt(k) || k < 0 || k > 63)) return false;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (source[c][(by0 + y) * stride + bx0 + x] > 63) return false;
    }
  }
  const nTok = 3 * blocks * 64, histBytes = contexts.contexts * 256, HIST = AC_CODES + Math.max(8, codes ? codes.length * alphabet * 8 : 8);
  const defer = !!(sink.counts && sink.defer);
  if (acDeferred && (!defer || acDeferred.counts !== sink.counts || acDeferred.hist !== contexts.contexts)) throw fault('JXL_INTERNAL', 'kernels:ac-counts-missing');
  const TOUCHED = HIST + histBytes, OVERFLOW = TOUCHED + (defer ? Math.max(nTok * 4, histBytes) : nTok * 4);
  const L = ans ? ansLayout(ans, nTok) : null;
  let OUT = L ? L.OUT : OVERFLOW + nTok * 8, end = L ? L.end : OUT + nTok * 8 + 16;
  const STAGE_AT = packed ? align16(end) : 0, STAGE_VAL = STAGE_AT + nTok;
  if (packed) end = STAGE_VAL + 2 * nTok;
  const held = packed && !(ans && sink.kept) ? acGroupRow(comps, source, by0, xsizeBlocks, ysizeBlocks, stride,
    align16(pair && ans ? Math.max(end, parkAt(L.VL) + 20 * nTok + 64) : end)) : null;
  grow(end);
  if (!sink.counts) acClean = false;
  else {
    if (!acClean || acCleanBytes < histBytes) {
      if (acDeferred) throw fault('JXL_INTERNAL', 'kernels:ac-counts-zeroing');
      u8.fill(0, HIST, HIST + histBytes); acClean = true;
    }
    acCleanBytes = histBytes;
  }
  if (!ans) ansStamp = null; else loadAns(sink.coding.model, ans, L);
  const kept = ans ? sink.kept ?? null : null, keep = !!(sink.counts && sink.keep);
  if (kept) {
    if (!(kept.values instanceof Int32Array) || !(kept.ctxs instanceof Uint16Array) || kept.values.length !== kept.ctxs.length || kept.values.length > nTok) return false;
    acResident = null;
    u8.set(sink.coding.model.contextMap, AC_MAP);
    i32.set(kept.values, L.VL >> 2); u16.set(kept.ctxs, L.RW >> 1);
    simd.ctxIds(L.RW, L.ID, kept.values.length, AC_MAP);
  } else {
    const ids = [comps[0], comps[1], comps[2]].map(cp => acIdentity(cp.coeffs ?? cp.packed)).concat([0, 1, 2].map(c => acIdentity(source[c])));
    const sameGroup = acResident?.g === g && acResident.bw === bw && acResident.bh === bh && acResident.ids.every((v, i) => v === ids[i]);
    let staged = 0;
    for (let c = 0; c < 3; c++) {
      if (!sameGroup && packed) {
        for (const chunk of held.chunks[c]) {
          if (!(held.whole ? chunk.loaded : held.current === chunk)) {
            u8.set(comps[c].packed.at.subarray(chunk.from, chunk.to), chunk.at);
            i16.set(comps[c].packed.levels.subarray(chunk.from, chunk.to), chunk.val >> 1);
            u8.set(source[c].subarray((held.by0 + chunk.y0) * stride, (held.by0 + chunk.y1) * stride), chunk.cnt);
            chunk.loaded = true; held.current = chunk;
          }
          const rows = Math.min(chunk.y1, bh) - chunk.y0;
          if (rows <= 0) continue;
          for (let y = 0; y < rows; y++) i32[(held.offs >> 2) + y] = acRowStart(comps[c].packed, source[c], by0 + chunk.y0 + y, bx0, stride) - chunk.from;
          staged += simd.stageRows(chunk.at, chunk.val, chunk.cnt, held.offs, bw, rows, stride, bx0, STAGE_AT + staged, STAGE_VAL + 2 * staged, AC_COUNTS + c * blocks + chunk.y0 * bw);
        }
      } else if (!sameGroup) {
        rows2d(i16, comps[c].coeffs, stride, bx0, by0, bw, bh, 64, (AC_COEFFS + c * AC_STRIDE) >> 1);
        rows2d(u8, source[c], stride, bx0, by0, bw, bh, 1, AC_COUNTS + c * blocks);
      }
      if (!counted && blockCounts[c] !== nonZero[c]) for (let y = 0; y < bh; y++) { const at = (by0 + y) * stride + bx0; blockCounts[c].set(nonZero[c].subarray(at, at + bw), at); }
      u8.set(orders[c], AC_ORDERS + c * 64);
      for (let b = 0; b < contexts.numDc; b++) i32[(AC_BLOCK_CTX >> 2) + c * contexts.numDc + b] = contexts.contextOf(c, b);
    }
    if (!sameGroup && packed) simd.unpackGroup(AC_COEFFS, AC_STRIDE, bw, bh, AC_COUNTS, STAGE_AT, STAGE_VAL);
    acResident = {g, bw, bh, ids, held: held ?? (sameGroup ? acResident.held : null)};
    if (contexts.thresholds.length) { acBucketsZero = false; rows2d(u8, lumaBuckets, lumaW, bx0, by0, bw, bh, 1, AC_BUCKETS); }
    else if (!acBucketsZero) { u8.fill(0, AC_BUCKETS, AC_BUCKETS + 1024); acBucketsZero = true; }
    if (!zdLoaded) { u16.set(zd, AC_ZD >> 1); zdLoaded = true; }
    if (ans) u8.set(sink.coding.model.contextMap, AC_MAP);
    if (codes) loadPrefix(sink.coding.model, codes, alphabet);
    set32([AC_COEFFS, AC_STRIDE, bw, bh, AC_COUNTS, AC_BUCKETS, AC_BLOCK_CTX, contexts.numDc, contexts.numCtxs, AC_ORDERS, AC_ZD, AC_NZ,
      ans ? 2 : codes ? 1 : keep ? 3 : 0, HIST, TOUCHED + 4 * (acDeferred?.touched ?? 0), OVERFLOW, 0, 0, AC_MAP, AC_CONFIGS, AC_CODES, alphabet, OUT, w ? w.acc : 0, w ? w.pending : 0, 0,
      ans ? L.VL : keep ? OUT : 0, ans ? L.ID : keep ? OUT + nTok * 4 : 0, 0], AC);
    simd.acGroup(AC);
    if (keep) { const n = i32[(AC >> 2) + 28]; sink.kept = keptTokens(i32.subarray(OUT >> 2, (OUT >> 2) + n), u16.subarray((OUT + nTok * 4) >> 1, ((OUT + nTok * 4) >> 1) + n)); }
  }
  if (ans) {
    const args = AC_CONFIGS + 4096 - 128, n = kept ? kept.values.length : i32[(AC >> 2) + 28];
    if (pair && !pair.args) {
      const park = parkAt(L.VL), P_IDS = park + n * 4, P_RAWS = P_IDS + n + 8 & ~7, P_META = P_RAWS + n * 4,
        P_EMITTED = P_META + n + 8 & ~7, P_OUT = P_EMITTED + n * 2 + 8 & ~7, P_END = P_OUT + n * 8 + 16;
      if (P_END > 272 * 65536) return false;
      grow(P_END);
      u8.copyWithin(park, L.VL, L.VL + n * 4); u8.copyWithin(P_IDS, L.ID, L.ID + n);
      pair.args = [park, P_IDS, n, ...L.tables, P_RAWS, P_META, P_EMITTED, P_OUT, w.acc, w.pending, 0, L.RC];
      pair.w = w; pair.out = P_OUT; pair.model = sink.coding.model;
      return 3;
    }
    set32([L.VL, L.ID, n, ...L.tables, L.RW, L.MT, L.EM, OUT, w.acc, w.pending, 0, L.RC], args);
    if (pair) {
      if (pair.model !== sink.coding.model) throw fault('JXL_INTERNAL', 'kernels:ac-group-model');
      const first = AC_CONFIGS + 4096 - 256;
      set32(pair.args, first); simd.ansFlush2(first, args);
      takeFlushed(pair.w, first, pair.out); takeFlushed(w, args, OUT);
      return 2;
    }
    simd.ansFlush(args); takeFlushed(w, args, OUT);
    return 2;
  }
  if (codes) return takePrefix(w, OUT), true;
  const counts = sink.counts, touched = i32[(AC >> 2) + 16], overflow = i32[(AC >> 2) + 17];
  if (defer) acDeferred = {counts, hist: contexts.contexts, at: HIST, list: TOUCHED, touched: (acDeferred?.touched ?? 0) + touched};
  else takeCounts(counts, HIST, TOUCHED, touched);
  for (let i = 0; i < overflow; i++) counts.add(i32[(OVERFLOW >> 2) + 2 * i], i32[(OVERFLOW >> 2) + 2 * i + 1]);
  return true;
};

const GE_PLANE = P, GE_COUNTS = P + 131072, GE_TOUCHED = GE_COUNTS + 4 * 131105 + 12, GE_STATS = GE_TOUCHED + 262144;
const GE_TAGS = GE_STATS + 16, GE_EXTRA = GE_TAGS + 262144, GE_FREQ = GE_EXTRA + 262144, GE_WIDE = align16(GE_FREQ + 4 * ALPHABET), GE_HASH = GE_WIDE + 262144, GE_END = GE_HASH + 1048576;

const dcEvents = SAMPLE ? null : function dcEvents(planes) {
  if (active !== 'simd' || planes.some(p => !(p.data instanceof Int16Array) || !(p.w > 0 && p.h > 0) || p.w * p.h > 65536 || p.data.length < p.w * p.h)) return null;
  dirty();
  return planes.map(({data, w, h}) => {
    u32.fill(0, GE_COUNTS >> 2, (GE_COUNTS >> 2) + 131105);
    i16.set(data.subarray(0, w * h), GE_PLANE >> 1);
    simd.gradEvents(GE_PLANE, w, h, GE_COUNTS, GE_TOUCHED, GE_STATS, 0, 0, 0, 0, 0);
    const touched = u32[(GE_STATS >> 2) + 2], literalPairs = new Uint32Array(2 * touched);
    for (let i = 0; i < touched; i++) { const v = u32[(GE_TOUCHED >> 2) + i]; literalPairs[2 * i] = v; literalPairs[2 * i + 1] = u32[(GE_COUNTS >> 2) + v]; }
    return {literalPairs, literalPairsLen: 2 * touched, lengths: u32.slice((GE_COUNTS >> 2) + 131072, (GE_COUNTS >> 2) + 131105)};
  });
};

const dcPlan = SAMPLE ? null : function dcPlan(data, w, h, freq) {
  if (active !== 'simd' || !(data instanceof Int16Array || data instanceof Int32Array) || !(w > 0 && h > 0) || w * h > 65536 || data.length < w * h || freq.length !== ALPHABET) return null;
  const n = w * h;
  let lo = data[0], hi = data[0];
  for (let i = 1; i < n; i++) { const v = data[i]; if (v < lo) lo = v; else if (v > hi) hi = v; }
  const wide = lo < -32768 || hi > 32767 ? 1 : 0;
  dirty();
  if (wide && GE_END > memory.buffer.byteLength) { if (data.buffer === memory.buffer) data = data.slice(0, n); grow(GE_END); }
  u32.fill(0, GE_COUNTS >> 2, (GE_COUNTS >> 2) + (wide ? 131072 : Math.min(131072, Math.max(2 * (hi - lo), 2 * Math.abs(data[0])) + 2)));
  u32.fill(0, (GE_COUNTS >> 2) + 131072, (GE_COUNTS >> 2) + 131105);
  u32.fill(0, GE_FREQ >> 2, (GE_FREQ >> 2) + ALPHABET);
  if (wide) { u32.fill(0, GE_HASH >> 2, GE_END >> 2); i32.set(data.subarray(0, n), GE_WIDE >> 2); }
  else i16.set(data.subarray(0, n), GE_PLANE >> 1);
  simd.gradEvents(wide ? GE_WIDE : GE_PLANE, w, h, GE_COUNTS, GE_TOUCHED, GE_STATS, GE_TAGS, GE_EXTRA, GE_FREQ, wide, GE_HASH);
  const touched = u32[(GE_STATS >> 2) + 2], used = u32[(GE_STATS >> 2) + 3], literalPairs = new Uint32Array(2 * touched);
  let p = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < touched; i++) {
    const v = u32[(GE_TOUCHED >> 2) + i];
    if ((v < 4096) === !pass) {
      literalPairs[p++] = v;
      let cnt = v < 131072 ? u32[(GE_COUNTS >> 2) + v] : 0;
      if (v >= 131072) for (let s = Math.imul(v, 0x9e3779b1) >>> 15; ; s = s + 1 & 131071) if (u32[(GE_HASH >> 2) + 2 * s] === v) { cnt = u32[(GE_HASH >> 2) + 2 * s + 1]; break; }
      literalPairs[p++] = cnt;
    }
  }
  for (let s = 0; s < ALPHABET; s++) freq[s] += u32[(GE_FREQ >> 2) + s];
  return {tags: u32.slice(GE_TAGS >> 2, (GE_TAGS >> 2) + used), extra: u32.slice(GE_EXTRA >> 2, (GE_EXTRA >> 2) + used), used,
    literalPairs, literalPairsLen: p, lengths: u32.slice((GE_COUNTS >> 2) + 131072, (GE_COUNTS >> 2) + 131105)};
};

const planTokens = SAMPLE ? null : function planTokens(plan, config) {
  const {tags, extra, used} = plan;
  if (active !== 'simd' || !(tags instanceof Uint32Array) || !(extra instanceof Uint32Array) || !isInt(used) || used < 0 || used > 65536 ||
      tags.length < used || extra.length < used || !(config.split >= 0 && config.split <= 30) || config.splitToken !== 2 ** config.split || !(config.msb >= 0 && config.lsb >= 0 && config.msb + config.lsb <= config.split)) return false;
  dirty();
  u32.set(tags.subarray(0, used), P >> 2); u32.set(extra.subarray(0, used), (P + 262144) >> 2);
  set32([config.splitToken, config.split, config.msb, config.lsb], P + 526336);
  simd.hpTokens(P, P + 262144, used, P + 526336);
  tags.set(u32.subarray(P >> 2, (P >> 2) + used)); extra.set(u32.subarray((P + 262144) >> 2, ((P + 262144) >> 2) + used));
  return true;
};

const shape = SAMPLE ? null : function shape(freqs, last, total, omit, tables, headerAware) {
  if (active !== 'simd' || !(last >= 3 && last <= 512) || !(total >= 1 && total <= 0xffffffff) || !(omit >= 0 && omit < last) || freqs.length < last) return null;
  sync();
  if (shapeEpoch !== retainEpoch || shapeTables !== tables) {
    f64.set(tables.log2, SH_LOG2 >> 3); f64.set(tables.symbolBits, SH_SYM >> 3);
    i32.set(tables.logLengths, SH_LOGLEN >> 2); i32.set(tables.repeats, SH_REPEATS >> 2);
    shapeTables = tables;
  }
  dirty(); shapeEpoch = retainEpoch;
  for (let i = 0; i < last; i++) u32[(SH_FREQS >> 2) + i] = freqs[i];
  set32([SH_FREQS, last, total, omit, SH_LOG2, SH_SYM, SH_LOGLEN, SH_REPEATS, SH_SCRATCH, 0, 0, 0, headerAware ? 1 : 0], SH_ARGS);
  simd.shape(SH_ARGS);
  const shift = i32[(SH_ARGS >> 2) + 9];
  return shift < 0 ? {none: true} : {counts: Uint16Array.from(i32.subarray(SH_BEST >> 2, (SH_BEST >> 2) + last)), shift, omit, bits: f64[(SH_ARGS + 40) >> 3]};
};

const opaqueBytes = SAMPLE || JPEG ? null : function opaqueBytes(rgba, samples = null) {
  if (active !== 'simd') return undefined;
  dirty();
  if (isU8Like(rgba)) {
    for (let at = 0, band = R - P; at < rgba.length; at += band) {
      const n = Math.min(band, rgba.length - at);
      u8.set(rgba.subarray(at, at + n), P);
      if (!simd.opaque(P, n)) return false;
    }
    return true;
  }
  const mode = rgba instanceof Float32Array ? 2 : (rgba instanceof Uint16Array || typeof Float16Array === 'function' && rgba instanceof Float16Array) ? 1 : 0;
  if (!mode) return undefined;
  i32[P >> 2] = mode === 2 ? 0x3f800000 : samples?.exponentBits === 5 ? 0x3c00 : (1 << (samples?.bitDepth ?? 16)) - 1;
  const bytes = new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength), band = (R - P - 16) & ~15;
  for (let at = 0; at < bytes.length; at += band) {
    const n = Math.min(band, bytes.length - at);
    u8.set(bytes.subarray(at, at + n), P + 4);
    if (!simd.opaque(P + 4, n | mode)) return false;
  }
  return true;
};

const captureOpaque = SAMPLE || JPEG ? null : function captureOpaque(data, width, x, y, w, h) {
  for (let row = y, rows = w === width ? h : 1; row < y + h; row += rows) {
    const at = (row * width + x) * 4, op = opaqueBytes(data.subarray(at, at + rows * w * 4));
    if (op === undefined) throw fault('JXL_WASM', 'photo: SIMD kernels');
    if (!op) return false;
  }
  return true;
};

const nonzero = SAMPLE ? null : function nonzero(coeffs, from, end, natural) {
  if (active !== 'simd' || !(coeffs instanceof Int16Array) || from % 64 || (end - from) % 64) return false;
  dirty();
  const out = R + 131072;
  i32.fill(0, out >> 2, (out >> 2) + 64);
  for (let at = from; at < end; at += 65536) {
    const stop = Math.min(end, at + 65536);
    i16.set(coeffs.subarray(at, stop), P >> 1);
    simd.nonzeroCounts(P, (stop - at) >> 6, out);
  }
  for (let i = 0; i < 64; i++) natural[i] += i32[(out >> 2) + i];
  return true;
};

const group = SAMPLE || JPEG ? null : function group(w, targets, rgba, imageWidth, x0, y0, width, height, setup) {
  dirty();
  const {channels, leaves, picture} = setup, n = width * height;
  if (setup.palette || setup.samples || setup.rct !== undefined || !isU8Like(rgba) || !isInt(channels) || channels < 1 || channels > 4 ||
      leaves.length !== channels || picture.length !== channels || targets.length !== channels || !isInt(width) || !isInt(height) ||
      width < 1 || height < 1 || width > 256 || height > 256 || !isSafe(imageWidth) || !isSafe(x0) || !isSafe(y0) || x0 < 0 || y0 < 0 ||
      imageWidth < x0 + width || ((y0 + height - 1) * imageWidth + x0 + width) * 4 > rgba.length || !acceptableWriter(w) || w && w.at + n * channels * 8 + 32 > 0x7fffffff) return false;
  for (let c = 0; c < channels; c++) {
    const l = leaves[c], target = targets[c];
    if (picture[c] !== c || l.multiplier !== 1 || !isInt(l.predictor) || l.predictor < 0 || l.predictor > 5 || !isInt(l.offset) || Math.abs(l.offset) > 32768 || !acceptableConfig(l.config || PLAIN)) return false;
    if (w) {
      if (!(target?.lengths instanceof Uint8Array) || !(target?.codes instanceof Uint16Array) || target.lengths.length > ALPHABET || target.codes.length !== target.lengths.length ||
          target.lengths.some((len, s) => len > 15 || target.codes[s] >= 1 << len)) return false;
    } else {
      if (!(target instanceof Uint32Array) || target.length < 34 || target.length > RAW_BINS) return false;
      for (let k = 0; k < c; k++) if (target.buffer === targets[k].buffer && target.byteOffset < targets[k].byteOffset + targets[k].byteLength && targets[k].byteOffset < target.byteOffset + target.byteLength) return false;
    }
  }
  rows2d(u8, rgba, imageWidth, x0, y0, width, height, 4, SOURCE);
  simd.fill(SOURCE, n, channels, ...GROUP_PLANES);
  if (!w) {
    for (let c = 0; c < channels; c++) i32.set(targets[c], (TABLE >> 2) + c * RAW_BINS);
    for (let c = 0; c < channels; c++) {
      const l = leaves[c], cfg = l.config || PLAIN;
      simd.residual(GROUP_PLANES[c], width, height, l.predictor, l.offset, R);
      simd.tokens(R, 0, n, TABLE + c * RAW_BINS * 4, OUTPUT, 0, 0, 0, cfg.split, cfg.msb, cfg.lsb, targets[c].length);
    }
    for (let c = 0; c < channels; c++) targets[c].set(i32.subarray((TABLE >> 2) + c * RAW_BINS, (TABLE >> 2) + c * RAW_BINS + targets[c].length));
  } else {
    const {at, acc, pending, bytes} = w;
    try {
      for (let c = 0; c < channels; c++) {
        simd.residual(GROUP_PLANES[c], width, height, leaves[c].predictor, leaves[c].offset, R);
        tokens(w, [targets[c]], n, 0, leaves[c].config || PLAIN);
      }
    } catch (error) { w.at = at; w.acc = acc; w.pending = pending; w.bytes = bytes; throw error; }
  }
  return true;
};

const screen = SAMPLE || JPEG ? null : function screen(plane, width, height, predictor, depth, emit, minLength = 7) {
  dirty();
  const n = width * height;
  if (!(plane instanceof Int16Array || plane instanceof Int32Array) || !isInt(width) || !isInt(height) || width < 1 || height < 1 || plane.length < n ||
      ![0, 1, 2, 3, 5].includes(predictor) || ![4, 7].includes(minLength) || !isInt(depth) || depth < 0 || depth > 2147483647) return false;
  const residual = P + n * 4, output = P + n * 8, head = P + n * 16, rows = head + 262144, map = rows + height * 4, capacity = 1 << (32 - Math.clz32(height * 2 - 1));
  grow(map + capacity * 8);
  i32.set(plane.subarray(0, n), P >> 2);
  simd.residual(P, width, height, predictor, 0, residual);
  i32.fill(-1, head >> 2, (head + 262144) >> 2);
  i32.fill(-1, map >> 2, (map + capacity * 8) >> 2);
  const count = simd.screen(residual, n, width, depth, head, P, rows, map, capacity - 1, output, minLength);
  for (let i = output >> 2, stop = i + count * 2; i < stop; i += 2) {
    const v = i32[i] >>> 0, d = i32[i + 1];
    if (d) emit(0, v, d); else emit(v, 0, 0);
  }
  return true;
};

const align8 = n => n + (-n & 7), RETAIN_BUDGET = 64 * 1048576;
let residentTree = 0, trees = 0;
const UNSPLIT = SAMPLE ? null : {live: () => true, peak: 0, allocate: () => null, release() {}, propose: (m, h, cb, keep = null) => (keep && (keep.handle = null), null)};
const sampled = SAMPLE ? null : function sampled(count, kinds, alphabet, columns, symbolSets, table, rawPrice) {
  if (!memory || !isSafe(count) || count < 0 || !kinds || kinds > 16 || symbolSets.length !== kinds || !isInt(alphabet) || alphabet < 1 || alphabet > 256 ||
      !(table instanceof Float64Array) || table.length < count + 1 || !(rawPrice instanceof Float64Array) || rawPrice.length !== alphabet ||
      symbolSets.some(s => !(s instanceof Uint8Array) || s.length !== count)) return null;
  let maxCuts = 0;
  for (const col of columns) {
    if (!(col.indices instanceof Uint8Array) || col.indices.length !== count || col.cuts.length > 255) return null;
    maxCuts = Math.max(maxCuts, col.cuts.length);
  }
  const arena = () => {
    takeArena(holder);
    acClean = false; ansStamp = null; zdLoaded = false; acBucketsZero = false; tileBand = null; acResident = null; vbStrip = null; s2cPrepLoaded = -1; shapeEpoch = -1;
    sync();
  };
  if (count < 64 || !maxCuts) return {...UNSPLIT, rootHistograms() {
    arena(); retainEpoch++;
    const band = 32768, binsAt = P + band;
    return symbolSets.map(symbols => {
      const bins = i32.subarray(binsAt >>> 2, (binsAt >>> 2) + 256);
      bins.fill(0);
      for (let at = 0; at < count; at += band) { const part = symbols.subarray(at, at + band); u8.set(part, P); simd.bytesMax(P, part.length, binsAt); }
      return Uint32Array.from(bins.subarray(0, alphabet));
    });
  }};
  const C = columns.length, bins = maxCuts + 1, cells = kinds * alphabet, histBytes = align8(cells * 4);
  const resSym = align16(P), resIdx = resSym + 16 * count, cutsAt = align8(resIdx + C * count), tableAt = align8(cutsAt + C * 4);
  const rawAt = tableAt + (count + 1) * 8, membersAt = align8(rawAt + alphabet * 8), arenaMembersAt = align8(membersAt + count * 4);
  const symbolsAt = align16(arenaMembersAt + count * 4), lowAt = symbolsAt, highAt = lowAt + count * 4;
  const indicesAt = align16(symbolsAt + 16 * count), histAt = align8(indicesAt + count), outAt = align8(histAt + cells * 4);
  const scratch = align16(outAt + 64 + kinds * 36), stateBytes = kinds * 32 + align16(cells * 4);
  const splitAt = align8(scratch + stateBytes + align16(bins * cells * 4) + (2 * bins + 2) * 4);
  const clMetaAt = align8(splitAt + cells * 8), clFreqAt = clMetaAt + 6144, clParamsAt = clFreqAt + 1024 * alphabet;
  const clPropMetaAt = clParamsAt + 64, clNzValAt = clPropMetaAt + 1152, clNzSymAt = clNzValAt + 144 * alphabet;
  const histPoolAt = align16(CLUSTERED_TREES ? clNzSymAt + 36 * alphabet : clMetaAt);
  let arenaSlots = 0, needed = histPoolAt, blockBytes = 0;
  columns.forEach(c => { blockBytes += c.cuts.length ? (c.cuts.length + 1) * cells * 4 : 0; });
  const id = ++trees, slots = Math.floor(RETAIN_BUDGET / blockBytes);
  let base = Math.ceil(needed / 64) * 64, epoch = -1, generation = 0, free = [], siblingSlot = 0, siblingBusy = false, peak = 0, clusterEpoch = -1, lastSplitProp = null, freeHistSlots = [], identityMembers = false;
  const ensureLive = () => {
    if (tree.live()) return;
    if (!tryGrow(needed)) throw fault('JXL_MEMORY', 'learned tree: grow failed');
    for (let c = 0; c < kinds; c++) u8.set(symbolSets[c], symbolsAt + c * count);
    for (let k = 0; k < C; k++) { u8.set(columns[k].indices, resIdx + k * count); i32[(cutsAt >>> 2) + k] = columns[k].cuts.length; }
    if (simd.bytesMax(symbolsAt, kinds * count, 0) >= alphabet || columns.some((c, k) => simd.bytesMax(resIdx + k * count, count, 0) > c.cuts.length)) throw declined('sampled');
    simd.sampledSplit(resSym, symbolsAt, count, 0, 0, kinds, 0, -1, 0, 0, 0, 0, 0, 0);
    f64.set(table.subarray(0, count + 1), tableAt >>> 3); f64.set(rawPrice, rawAt >>> 3);
    residentTree = id; epoch = retainEpoch; generation++; clusterEpoch = -1; lastSplitProp = null; siblingBusy = false;
    siblingSlot = slots >= 2 ? base : 0;
    const nFree = slots >= 2 ? slots - 1 : slots;
    free = Array.from({length: nFree}, (_, s) => base + (slots - 1 - s) * blockBytes);
  };
  const resident = () => { arena(); ensureLive(); };
  const writeStatEntry = (idx, st, nz) => {
    const m32 = (clPropMetaAt >>> 2) + idx * 8, m64 = (clPropMetaAt >>> 3) + idx * 4, len = st.nzSym.length;
    f64[m64] = st.bits; f64[m64 + 1] = st.raw; i32[m32 + 4] = st.total; i32[m32 + 5] = st.used; i32[m32 + 6] = nz; i32[m32 + 7] = len;
    if (len) { u8.set(st.nzSym, clNzSymAt + nz); i32.set(st.nzVal, (clNzValAt >>> 2) + nz); }
    return nz + len;
  };
  const sweep = (nm, tot, nh, par, sib, sav, sides, lim) =>
    simd.sampledNode(resSym, resIdx, count, nm, tot, kinds, alphabet, C, cutsAt, nh, tableAt, rawAt, symbolsAt, indicesAt, scratch, outAt, par, sib, sav, sides, lim);
  const searchNode = (nm, tot, nh, keep, resNode, lim) => {
    if (keep) keep.handle = null;
    const parent = keep?.parent, sibling = keep?.sibling;
    const derive = parent?.generation === generation && (sibling?.generation === generation || resNode && !sibling);
    let save = !!keep?.save && slots > 0;
    if (save && !derive && !(resNode && keep.transient)) for (const col of columns) if (col.cuts.length && tot * 4 <= (col.cuts.length + 1) * alphabet) { save = false; break; }
    const inherited = save && derive && keep.reuseParent && !parent.transient ? parent : null;
    const handle = inherited || (save ? tree.allocate(!!keep.transient) || (resNode && keep.forSibling ? tree.allocate(true) : null) : null);
    const k = sweep(nm, tot, nh, derive ? parent.at : 0, derive && sibling ? sibling.at : 0, handle ? handle.at : 0, splitAt, lim);
    if (k === -2) { if (!inherited) tree.release(handle); throw declined('sampled'); }
    if (keep) keep.handle = handle;
    return k;
  };
  const uploadNode = (members, histograms, choiceBits) => {
    const total = members.length;
    if (!(members instanceof Uint32Array) || total < 64 || total > count || histograms.length !== kinds ||
        histograms.some(h => !(h instanceof Uint32Array) || h.length !== alphabet) || !isSafe(choiceBits)) throw declined('sampled');
    resident();
    u32.set(members, membersAt >>> 2);
    for (let c = 0; c < kinds; c++) i32.set(histograms[c], (histAt >>> 2) + c * alphabet);
  };
  const splitResult = (k, bin, loS, hiS, loB, hiB, cb) => ({gain: cb - loB - hiB, column: columns[k], k, bin, lo: {selected: loS, bits: loB}, hi: {selected: hiS, bits: hiB}});
  const sweepResult = (k, cb) => k < 0 ? null : (sync(), splitResult(k, i32[(outAt + 4) >>> 2], i32[(outAt + 8) >>> 2], i32[(outAt + 12) >>> 2], f64[(outAt + 16) >>> 3], f64[(outAt + 24) >>> 3], cb));
  const taken = (total, best, fresh) => {
    if (best.gain <= 0) return best;
    const below = simd.sampledSplit(resSym, resIdx, count, membersAt, total, kinds, alphabet, best.k, best.bin, lowAt, highAt, fresh ? histAt : 0, fresh ? splitAt : 0, fresh);
    sync();
    const ids = u32.slice(lowAt >>> 2, (lowAt >>> 2) + total), slab = u32.slice(splitAt >>> 2, (splitAt >>> 2) + 2 * cells);
    best.lowIds = ids.subarray(0, below); best.highIds = ids.subarray(below);
    best.low = Array.from({length: kinds}, (_, c) => slab.subarray(c * alphabet, (c + 1) * alphabet));
    best.high = Array.from({length: kinds}, (_, c) => slab.subarray((kinds + c) * alphabet, (kinds + c + 1) * alphabet));
    return lastSplitProp = best;
  };
  const tree = {
    cells: blockBytes >>> 2,
    live: () => residentTree === id && epoch === retainEpoch,
    get peak() { return peak; },
    allocate(transient = false) {
      if (!tree.live()) return null;
      const usedBase = slots >= 2 ? slots - 1 : slots;
      if (transient && siblingSlot && !siblingBusy) {
        if (!tryGrow(siblingSlot + blockBytes)) return null;
        siblingBusy = true; peak = Math.max(peak, usedBase - free.length + 1);
        return {at: siblingSlot, generation, transient: true};
      }
      if (!free.length) return null;
      const at = free.pop();
      if (!tryGrow(at + blockBytes)) return free.push(at), null;
      peak = Math.max(peak, usedBase - free.length + (siblingBusy ? 1 : 0));
      return {at, generation, transient: false};
    },
    release(handle) { if (handle && handle.generation === generation && tree.live()) { if (handle.transient) siblingBusy = false; else free.push(handle.at); } },
    initArena(maxLeaves) {
      arenaSlots = Math.max(8, maxLeaves * 3 + 8); needed = histPoolAt + arenaSlots * histBytes; base = Math.ceil(needed / 64) * 64;
      residentTree = 0; resident(); freeHistSlots = [];
      for (let s = arenaSlots - 1; s >= 1; s--) freeHistSlots.push(s);
      simd.sampledSplit(resSym, 0, count, 0, 0, kinds, alphabet, -2, 0, arenaMembersAt, 0, 0, histPoolAt, 0);
      identityMembers = true; return 0;
    },
    freeHistSlot(slot) { if (slot >= 0) freeHistSlots.push(slot); },
    histSlotSubarray(slot, c) { sync(); const s = ((histPoolAt + slot * histBytes) >>> 2) + c * alphabet; return u32.subarray(s, s + alphabet); },
    readArenaMembers: TREE_STEPS || TREE_DEVICE ? (off, len) => (sync(), u32.slice((arenaMembersAt >>> 2) + off, (arenaMembersAt >>> 2) + off + len)) : undefined,
    readArenaHistograms: TREE_STEPS || TREE_DEVICE ? slot => {
      sync(); const s = (histPoolAt + slot * histBytes) >>> 2;
      return Array.from({length: kinds}, (_, c) => u32.slice(s + c * alphabet, s + (c + 1) * alphabet));
    } : undefined,
    loadArenaState: !TREE_STEPS ? undefined : items => {
      identityMembers = false; freeHistSlots = []; sync();
      let cursor = 0, nextSlot = 0;
      const putHist = h => { const slot = nextSlot++; for (let c = 0; c < kinds; c++) i32.set(h[c], ((histPoolAt + slot * histBytes) >>> 2) + c * alphabet); return slot; };
      for (const item of items) {
        u32.set(item.ids, (arenaMembersAt >>> 2) + cursor);
        item.offset = cursor; item.length = item.ids.length; cursor += item.length;
        item.histSlot = putHist(item.hist);
        if (item.proposal) { item.proposal.loSlot = putHist(item.proposal.low); item.proposal.hiSlot = putHist(item.proposal.high); }
      }
      for (let s = arenaSlots - 1; s >= nextSlot; s--) freeHistSlots.push(s);
    },
    proposeArena(offset, total, histSlot, choiceBits, keep = null, maxPrice = choiceBits) {
      resident();
      const k = searchNode(identityMembers && !offset && total === count ? 0 : arenaMembersAt + offset * 4, total, histPoolAt + histSlot * histBytes, keep, true, maxPrice);
      const prop = sweepResult(k, choiceBits);
      if (!prop || prop.gain <= 0) return null;
      const loSlot = freeHistSlots.pop(), hiSlot = freeHistSlots.pop();
      u8.copyWithin(histPoolAt + loSlot * histBytes, splitAt, splitAt + cells * 4);
      u8.copyWithin(histPoolAt + hiSlot * histBytes, splitAt + cells * 4, splitAt + cells * 8);
      prop.loSlot = loSlot; prop.hiSlot = hiSlot;
      return lastSplitProp = prop;
    },
    partitionArena(offset, total, k, bin) {
      identityMembers = false; resident();
      return simd.sampledSplit(resSym, resIdx, count, arenaMembersAt + offset * 4, total, kinds, alphabet, k, bin, arenaMembersAt + offset * 4, highAt, 0, 0, 0);
    },
    peelArena(parentHandle, offset, total, histSlot) {
      if (parentHandle?.generation === generation && total > 0) { resident(); sweep(arenaMembersAt + offset * 4, total, histPoolAt + histSlot * histBytes, parentHandle.at, 0, 0, -1, 0); }
    },
    propose: !TREE_DEVICE ? undefined : (members, histograms, choiceBits, keep = null) => {
      uploadNode(members, histograms, choiceBits); lastSplitProp = null;
      const best = sweepResult(searchNode(membersAt, members.length, histAt, keep, false, Infinity), choiceBits);
      return best ? taken(members.length, best, 0) : null;
    },
    split: !TREE_DEVICE ? undefined : (members, histograms, choiceBits, record) => {
      uploadNode(members, histograms, choiceBits);
      if (!record) return null;
      const {column: k, bin, loSelected, hiSelected, loBits, hiBits} = record;
      if (!(k >= 0 && k < C && columns[k].cuts.length && bin >= 0 && bin < columns[k].cuts.length && loSelected >= 0 && loSelected < kinds &&
          hiSelected >= 0 && hiSelected < kinds && isSafe(loBits) && isSafe(hiBits))) throw declined('sampled');
      return taken(members.length, splitResult(k, bin, loSelected, hiSelected, loBits, hiBits, choiceBits), 1);
    },
    finish: !TREE_DEVICE ? undefined : (members, histograms, choiceBits, counts) => {
      resident();
      if (!(counts instanceof Uint32Array) || counts.length * 4 !== blockBytes) throw declined('sampled');
      const parent = tree.allocate(), zero = parent && tree.allocate();
      if (!zero) { tree.release(parent); return tree.propose(members, histograms, choiceBits); }
      try {
        sync();
        let at = 0;
        for (const {cuts} of columns) {
          const nb = cuts.length ? cuts.length + 1 : 0;
          for (let c = 0; c < kinds; c++) for (let b = 0; b < nb; b++)
            u32.set(counts.subarray(at + (c * nb + b) * alphabet, at + (c * nb + b + 1) * alphabet), (parent.at >>> 2) + at + (b * kinds + c) * alphabet);
          at += nb * cells;
        }
        u8.fill(0, zero.at, zero.at + blockBytes);
        return tree.propose(members, histograms, choiceBits, {parent, sibling: zero});
      } finally { tree.release(parent); tree.release(zero); }
    },
    scoreCluster: !CLUSTERED_TREES ? null : (st, item, prop, getPairStats) => {
      resident();
      const {clusters, maxClusters, scale, histBase, histSym, splitCost} = st, K = clusters.length;
      if (clusterEpoch !== st.epoch) {
        clusters.forEach((cl, g) => {
          const m64 = (clMetaAt + g * 24) >>> 3, m32 = (clMetaAt + g * 24) >>> 2;
          f64[m64] = cl.sumT; f64[m64 + 1] = cl.ent; i32[m32 + 4] = cl.total; i32[m32 + 5] = cl.used;
          i32.set(cl.freq, (clFreqAt >>> 2) + g * alphabet);
        });
        clusterEpoch = st.epoch;
      }
      const g0 = item.cluster, hasRem = clusters[g0].members > 1 ? 1 : 0, freeSlots = maxClusters - K + (hasRem ? 0 : 1);
      const itemHistPtr = hasRem ? (item.histSlot !== undefined ? histPoolAt + item.histSlot * histBytes + item.choice.selected * alphabet * 4
        : (i32.set(item.hist[item.choice.selected], histAt >>> 2), histAt)) : histAt;
      const p64 = clParamsAt >>> 3, p32 = clParamsAt >>> 2;
      f64[p64] = scale; f64[p64 + 1] = histBase; f64[p64 + 2] = histSym; f64[p64 + 3] = prop.hi.bits; f64[p64 + 4] = prop.lo.bits;
      const nz0 = writeStatEntry(0, item.curStats, 0);
      if (prop !== lastSplitProp) {
        if (prop.loSlot !== undefined) {
          u8.copyWithin(splitAt, histPoolAt + prop.loSlot * histBytes, histPoolAt + prop.loSlot * histBytes + cells * 4);
          u8.copyWithin(splitAt + cells * 4, histPoolAt + prop.hiSlot * histBytes, histPoolAt + prop.hiSlot * histBytes + cells * 4);
        } else for (let c = 0; c < kinds; c++) { i32.set(prop.low[c], (splitAt >>> 2) + c * alphabet); i32.set(prop.high[c], (splitAt >>> 2) + (kinds + c) * alphabet); }
        lastSplitProp = prop;
      }
      i32[p32 + 10] = rawAt; i32[p32 + 11] = splitAt; i32[p32 + 12] = nz0;
      simd.sampledClusters(clFreqAt, clMetaAt, K, g0, freeSlots, kinds, alphabet, hasRem, itemHistPtr, tableAt, clParamsAt, clPropMetaAt, clNzSymAt, clNzValAt, outAt, prop.hi.selected, prop.lo.selected, 2);
      const o32 = outAt >>> 2, o64 = outAt >>> 3, hi1 = i32[o32 + 9], lo1 = i32[o32 + 10];
      if (hi1 >= 0 && lo1 >= 0 && (hi1 !== prop.hi.selected || lo1 !== prop.lo.selected)) {
        const bs = getPairStats(hi1, lo1);
        if (bs.bits * scale < f64[o64 + 1]) {
          writeStatEntry(0, bs, 0);
          simd.sampledClusters(clFreqAt, clMetaAt, K, g0, freeSlots, kinds, alphabet, hasRem, histAt, tableAt, clParamsAt, clPropMetaAt, clNzSymAt, clNzValAt, outAt, hi1, lo1, 1);
        }
      }
      prop.epoch = st.epoch; prop.score = f64[o64] - (f64[o64 + 1] + splitCost);
      prop.hiChoice = i32[o32 + 4] >= 0 ? {pred: i32[o32 + 4], cl: i32[o32 + 5]} : null;
      prop.loChoice = i32[o32 + 6] >= 0 ? {pred: i32[o32 + 6], cl: i32[o32 + 7]} : null;
      prop.shared = !!i32[o32 + 8];
      return prop.score;
    },
  };
  return tree;
};

const SG = 4194304, sgOrderAt = new Int32Array(81), SG_CH = [1, 0, 2];
const strategyLayout = SAMPLE || UPLOAD || JPEG ? null : function strategyLayout(state, g, pass, nzContext, freqContext, orderOf, base) {
  const {authoredOrderPasses, groupsX, strategyData, map, contexts, lumaBuckets, lumaW} = state;
  const blocks = strategyData?.groups[g], passes = CAPTURE_PHOTO ? null : state.progression?.passes;
  if (active !== 'simd' || !blocks || nzContext.length !== 64 || freqContext.length !== 64 || blocks.length * 3 > 3072) return null;
  const authored = authoredOrderPasses?.[pass], bucketed = contexts.thresholds.length > 0, bx0 = g % groupsX * 32, by0 = (g / groupsX | 0) * 32;
  const NZ = base + 512, RECS = NZ + 12288, ORDERS = RECS + 3072 * 44;
  sgOrderAt.fill(0);
  const orders = [], meta = blocks._meta, slab = blocks._slab, natOrders = blocks._orders;
  let at = ORDERS, levels = 0;
  const regOrders = (id, fallback) => {
    const id3 = id * 3;
    if (sgOrderAt[id3]) return;
    const byStrat = authored?.byStrategy[id];
    for (let c = 0; c < 3; c++) {
      const order = byStrat?.[c] || fallback;
      let off = 0;
      for (let k = 0; k < orders.length; k += 2) if (orders[k] === order) { off = orders[k + 1]; break; }
      if (!off) { off = at; at += order.length * 4; orders.push(order, off); }
      sgOrderAt[id3 + c] = off;
    }
  };
  if (meta && slab && natOrders) {
    levels = slab.length;
    for (let p = 0; p < meta.length; p += 7) regOrders(meta[p], natOrders[meta[p]]);
  } else for (const b of blocks) { levels += b.size * 3; regOrders(b.id, b.order); }
  if (levels > 196608) return null;
  const LV = at, CTX = LV + levels * 4, VAL = CTX + levels * 4 + 12288, PASSES = VAL + levels * 4 + 12288;
  grow(PASSES + 96);
  const ctxMap = contexts.map, numDc = contexts.numDc, fastCtx = ctxMap instanceof Uint8Array && ctxMap.length === 39 * numDc;
  const zdBase = contexts.zeroDensityOffset(0), zdStep = contexts.zeroDensityOffset(1) - zdBase;
  i32.set(nzContext, base >> 2); i32.set(freqContext, (base >> 2) + 64);
  if (passes) for (let p = 0; p <= pass; p++) { i32[(PASSES >> 2) + 2 * p] = passes[p].downsample; i32[(PASSES >> 2) + 2 * p + 1] = passes[p].scale; }
  for (let k = 0; k < orders.length; k += 2) i32.set(orders[k], orders[k + 1] >> 2);
  let rec = RECS >> 2, lv = LV, count = 0;
  const putRec = (size, area, bw, bh, rbx, rby, lvAt, ordAt, bctx, c) => {
    i32[rec] = size; i32[rec + 1] = area; i32[rec + 2] = bw; i32[rec + 3] = bh; i32[rec + 4] = rbx; i32[rec + 5] = rby;
    i32[rec + 6] = lvAt; i32[rec + 7] = ordAt; i32[rec + 8] = bctx; i32[rec + 9] = zdBase + zdStep * bctx; i32[rec + 10] = c;
    rec += 11; count++;
  };
  const ctxOf = (c, bucket, ordId) => fastCtx ? ctxMap[((c < 2 ? c ^ 1 : 2) * 13 + ordId) * numDc + bucket] : contexts.contextOf(c, bucket, ordId);
  if (meta && slab && natOrders) {
    i32.set(slab, LV >> 2);
    for (let p = 0; p < meta.length; p += 7) {
      const id = meta[p], bx = meta[p + 1], by = meta[p + 2], bw = meta[p + 3], bh = meta[p + 4], area = meta[p + 5], size = meta[p + 6];
      const id3 = id * 3, ordId = orderOf[id], bucket = bucketed ? lumaBuckets[by * lumaW + bx] : 0;
      for (const c of SG_CH) putRec(size, area, bw, bh, bx - bx0, by - by0, lv + map[c] * (size << 2), sgOrderAt[id3 + c], ctxOf(c, bucket, ordId), c);
      lv += size * 12;
    }
  } else for (const b of blocks) {
    const {id, size, area, bw, bh, bx, by} = b, id3 = id * 3, ordId = orderOf[id], bucket = bucketed ? lumaBuckets[by * lumaW + bx] : 0;
    if (b.levels) {
      i32.set(b.levels, lv >> 2);
      for (const c of SG_CH) putRec(size, area, bw, bh, bx - bx0, by - by0, lv + map[c] * size * 4, sgOrderAt[id3 + c], ctxOf(c, bucket, ordId), c);
      lv += size * 12;
    } else for (const c of SG_CH) {
      const coeffs = b.coeffs[map[c]];
      if (coeffs.length !== size) return null;
      i32.set(coeffs, lv >> 2);
      putRec(size, area, bw, bh, bx - bx0, by - by0, lv, sgOrderAt[id3 + c], ctxOf(c, bucket, ordId), c);
      lv += size * 4;
    }
  }
  return {n: simd.sgFill(RECS, count, contexts.numCtxs, base, NZ, CTX, VAL, passes ? PASSES : 0, pass), ctx: CTX, val: VAL, levels};
};

const strategyFill = SAMPLE || UPLOAD || JPEG ? null : function strategyFill(state, g, pass, nzContext, freqContext, orderOf, ctxs, values) {
  dirty();
  const laid = strategyLayout(state, g, pass, nzContext, freqContext, orderOf, SG);
  if (!laid || laid.n > ctxs.length) return null;
  ctxs.set(i32.subarray(laid.ctx >> 2, (laid.ctx >> 2) + laid.n)); values.set(i32.subarray(laid.val >> 2, (laid.val >> 2) + laid.n));
  return laid.n;
};

const strategyWrite = SAMPLE || UPLOAD || JPEG ? null : function strategyWrite(state, g, pass, nzContext, freqContext, orderOf, coding, w) {
  const model = coding.model, blocks = state.strategyData?.groups[g], kind = model?.kind;
  if (active !== 'simd' || !blocks || (kind !== 'ans' && kind !== 'prefix') || model.histograms.length > 256 || model.contextMap.length > 8192 ||
      !acceptableWriter(w) || kind === 'ans' && model.histograms.some(h => !(h.reverse instanceof Uint16Array) || h.reverse.length !== 4096)) return false;
  let levels = 0;
  for (const b of blocks) levels += 3 * b.size;
  const nTok = levels + 3072;
  if (kind === 'prefix') {
    const codes = model.histograms, alphabet = Math.max(...codes.map(h => h.code.lengths.length));
    const OUT = AC_CODES + Math.max(8, codes.length * alphabet * 8) + 7 & ~7, base = OUT + nTok * 8 + 24 & ~7;
    dirty();
    const laid = strategyLayout(state, g, pass, nzContext, freqContext, orderOf, base);
    if (!laid || laid.n > nTok) return false;
    loadPrefix(model, codes, alphabet);
    i32.fill(0, AC >> 2, (AC >> 2) + 29);
    set32([1, 0, 0, 0, 0, 0, AC_MAP, AC_CONFIGS, AC_CODES, alphabet, OUT, w.acc, w.pending], AC + 48);
    simd.acTokens(AC, laid.ctx, laid.val, laid.n);
    return takePrefix(w, OUT), true;
  }
  const ans = ansTablesOf(model), L = ansLayout(ans, nTok), base = L.end + 8 & ~7;
  dirty(1);
  const laid = strategyLayout(state, g, pass, nzContext, freqContext, orderOf, base);
  if (!laid || laid.n > nTok) return false;
  loadAns(model, ans, L);
  u8.set(model.contextMap, AC_MAP);
  i32.fill(0, AC >> 2, (AC >> 2) + 29);
  i32[(AC >> 2) + 12] = 2; i32[(AC >> 2) + 18] = AC_MAP; i32[(AC >> 2) + 26] = L.VL; i32[(AC >> 2) + 27] = L.ID;
  simd.acTokens(AC, laid.ctx, laid.val, laid.n);
  const args = AC_CONFIGS + 4096 - 128;
  set32([L.VL, L.ID, i32[(AC >> 2) + 28], ...L.tables, L.RW, L.MT, L.EM, L.OUT, w.acc, w.pending, 0, L.RC], args);
  simd.ansFlush(args);
  return takeFlushed(w, args, L.OUT), 2;
};

const XYB_AT = 4194304, XY_LIN = XYB_AT + 4113 * 8, XY_MIX = XY_LIN + 6144, XY_KEYS = XY_MIX + 128, XY_VALS = XY_KEYS + 524288, XY_ROWS = XY_VALS + 24 * 131072;
const setupXyb = (roots, lin, mix, layout, curveAt, lumaWeights, weightsAt) => {
  f64.set(roots, XYB_AT >> 3);
  if (lin) for (let c = 0; c < 3; c++) f64.set(lin[c], (XY_LIN >> 3) + c * 256);
  else if (layout.mode === 2) f64.set(layout.curve, curveAt >> 3);
  if (lumaWeights) f64.set(lumaWeights, weightsAt >> 3);
  f64.set(mix, XY_MIX >> 3); f64[(XY_MIX + 72) >> 3] = layout.lift; f64[(XY_MIX + 80) >> 3] = 0;
  i32[(XY_MIX + 88) >> 2] = lumaWeights ? weightsAt : 0;
  i32.fill(-1, XY_KEYS >> 2, (XY_KEYS >> 2) + 131072);
  return [layout.mode | (lumaWeights ? 8 : 0), layout.mode === 2 ? curveAt : XY_LIN];
};

const xybPlanesKernel = SAMPLE || JPEG ? null : function xybPlanesKernel(data, width, height, W, H, planes, roots, linear, mix, bias, rootBias, gab = null, signed = false, samples = null) {
  const layout = sampleLayout(data, samples, signed);
  const lin = layout?.mode <= 1 ? (Array.isArray(linear) ? linear : [linear, linear, linear]) : null;
  if (active !== 'simd' || !layout || data.length !== width * height * 4 || roots.length !== 4113 || (lin && (lin.length !== 3 || lin.some(t => t.length !== 256))) ||
      mix.length !== 9 || W < width || H < height || (planes ? planes.some(p => !(p instanceof Float64Array) || p.length !== W * H) : !samples?.weights)) return false;
  const bpe = layout.bpe, curveBytes = layout.mode === 2 ? layout.curve.byteLength : 0, lumaWeights = samples?.weights ?? null;
  const curveAt = XY_ROWS, weightsAt = curveAt + curveBytes, stripsAt = weightsAt + (lumaWeights ? 8192 : 0);
  if (gab) {
    const {weights, iterations, boost} = gab;
    if (!planes || boost !== 1 && !simd.gabBoost || W < 8 || W % 2 || !isInt(iterations) || iterations < 1 || iterations > 16 || weights.length !== 3) return false;
    const rowBytes = W * 8, perRow = width * bpe + 4 * rowBytes, ringBytes = 2 * rowBytes;
    const rows = Math.min(H, Math.max(16 + 2 * iterations, Math.floor((272 * 65536 - stripsAt - ringBytes - 32) / perRow))), keep = rows === H ? H : rows - 2 * iterations;
    const planesAt = align16(stripsAt + rows * width * bpe), workAt = planesAt + 3 * rows * rowBytes, ringAt = workAt + rows * rowBytes, end = ringAt + ringBytes;
    if (end > memory.buffer.byteLength && data.buffer === memory.buffer) { data = data.slice(); layout.bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength); }
    grow(end); dirty(0, 1);
    const last = layout.bytes.subarray((height - 1) * width * bpe, height * width * bpe);
    const [mode, linPtr] = setupXyb(roots, lin, mix, layout, curveAt, lumaWeights, weightsAt);
    for (let a = 0; a < H; a += keep) {
      const b = Math.min(H, a + keep), from = Math.max(0, a - iterations), to = Math.min(H, b + iterations), n = to - from, real = Math.max(0, Math.min(height, to) - from);
      if (real) u8.set(layout.bytes.subarray(from * width * bpe, (from + real) * width * bpe), stripsAt);
      for (let y = from + real; y < to; y++) u8.set(last, stripsAt + (y - from) * width * bpe);
      if (lumaWeights) { i32[(XY_MIX + 92) >> 2] = a - from; i32[(XY_MIX + 96) >> 2] = Math.max(a - from, Math.min(height, b) - from); }
      simd.xybRows(stripsAt, width, n, W, XYB_AT, linPtr, XY_MIX, bias, rootBias, XY_KEYS, XY_VALS, planesAt, mode);
      for (let c = 0; c < 3; c++) {
        const orig = planesAt + c * n * rowBytes, [w1, w2] = weights[c], norm = 1 / (1 + 4 * w1 + 4 * w2);
        u8.copyWithin(workAt, orig, orig + n * rowBytes);
        for (let i = 0; i < iterations; i++) {
          simd.gab(workAt, orig, ringAt, W, n, w1, w2, norm);
          if (!i && boost !== 1) simd.gabBoost(workAt, orig, n * W, boost);
        }
        planes[c].set(f64.subarray((workAt >> 3) + (a - from) * W, (workAt >> 3) + (b - from) * W), a * W);
      }
    }
    if (lumaWeights) samples.reading = f64[(XY_MIX + 80) >> 3];
    return true;
  }
  const perRow = width * bpe + (planes ? 3 * W * 8 : 0), rows = Math.min(height, Math.max(1, Math.floor((272 * 65536 - stripsAt - 16) / perRow)));
  const end = stripsAt + align16(rows * width * bpe) + (planes ? 3 * rows * W * 8 : 0) + 16;
  if (end > memory.buffer.byteLength && data.buffer === memory.buffer) { data = data.slice(); layout.bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength); }
  grow(end); dirty(0, 1);
  const [mode, linPtr] = setupXyb(roots, lin, mix, layout, curveAt, lumaWeights, weightsAt);
  for (let y = 0; y < height; y += rows) {
    const n = Math.min(rows, height - y), out = planes ? stripsAt + align16(n * width * bpe) : 0;
    u8.set(layout.bytes.subarray(y * width * bpe, (y + n) * width * bpe), stripsAt);
    if (lumaWeights) { i32[(XY_MIX + 92) >> 2] = 0; i32[(XY_MIX + 96) >> 2] = n; }
    simd.xybRows(stripsAt, width, n, W, XYB_AT, linPtr, XY_MIX, bias, rootBias, XY_KEYS, XY_VALS, out, mode);
    if (planes) for (let c = 0; c < 3; c++) planes[c].set(f64.subarray((out >> 3) + c * n * W, (out >> 3) + (c + 1) * n * W), y * W);
  }
  if (lumaWeights) samples.reading = f64[(XY_MIX + 80) >> 3];
  return true;
};

const GAB = 4194304, GAB_LIMIT = 272 * 65536;
const gaborish = SAMPLE || UPLOAD || JPEG ? null : function gaborish(t, source, W, H, weights, iterations, start = source, boost = 1) {
  if (boost !== 1 && (start !== source || !simd.gabBoost)) return false;
  if (active !== 'simd' || !(t instanceof Float64Array) || !(source instanceof Float64Array) || source.length < W * H || !(start instanceof Float64Array) ||
      start.length < W * H || start === t && start !== source || !isInt(W) || !isInt(H) || W < 8 || W % 2 || H < 1 || t.length !== W * H || !isInt(iterations) || iterations < 1 || iterations > 16) return false;
  const rowBytes = W * 8, rows = Math.min(H, Math.max((Math.floor((GAB_LIMIT - GAB) / rowBytes) - 2) >> 1, 16 + 2 * iterations)), keep = rows === H ? H : rows - 2 * iterations;
  grow(GAB + (2 * rows + 2) * rowBytes); dirty(0, 1);
  const orig = GAB + rows * rowBytes, ring = orig + rows * rowBytes, [w1, w2] = weights, norm = 1 / (1 + 4 * w1 + 4 * w2);
  for (let a = 0; a < H; a += keep) {
    const b = Math.min(H, a + keep), from = Math.max(0, a - iterations), to = Math.min(H, b + iterations), rowsOf = source.subarray(from * W, to * W);
    f64.set(start === source ? rowsOf : start.subarray(from * W, to * W), GAB >> 3); f64.set(rowsOf, orig >> 3);
    for (let i = 0; i < iterations; i++) {
      simd.gab(GAB, orig, ring, W, to - from, w1, w2, norm);
      if (!i && boost !== 1) simd.gabBoost(GAB, orig, (to - from) * W, boost);
    }
    t.set(f64.subarray((GAB >> 3) + (a - from) * W, (GAB >> 3) + (b - from) * W), a * W);
  }
  return true;
};

const S2C = 4194304, S2C_LIMIT = 640 * 65536, S2C_PREP_TAB = S2C, S2C_PREP_WORK = S2C + 540672;
const s2cChannel = SAMPLE || UPLOAD || JPEG ? null : function s2cChannel(P1, P2, w, h, sh, stride, acc1, acc4, span, taps) {
  if (active !== 'simd' || !(P1 instanceof Int16Array) || !(P2 instanceof Int16Array) || P1.length !== P2.length) return false;
  const y0 = span ? span.y0 : 0, y1 = span ? span.y1 : h, from = span ? span.from : 0, cell0 = span ? span.cellRow0 : 0;
  const base = S2C_PREP_WORK, sums = [...acc1, ...acc4], ringAt = base + 128, qAt = ringAt + 180 * w, accAt = qAt + 12 * w;
  let at = accAt + 112;
  const places = sums.map(s => { if (!s) return 0; const p = at; at += s.byteLength + 7 & ~7; return p; });
  const planesAt = at, room = Math.max(24, Math.floor((S2C_LIMIT - planesAt) / (4 * w))), rows = room - 8;
  grow(planesAt + Math.min(room, P1.length / w) * 4 * w); dirty(0, 1, 1);
  i32.set(taps, base >> 2); i32.set(places, (base + 64) >> 2);
  places.forEach((p, k) => { if (p) u8.fill(0, p, p + sums[k].byteLength); });
  for (let a = y0; a < y1; a += rows) {
    const b = Math.min(y1, a + rows), lo = Math.max(from, a - 4), hi = Math.min(h, b + 4, from + P1.length / w), n = (hi - lo) * w;
    i16.set(P1.subarray((lo - from) * w, (hi - from) * w), planesAt >> 1); i16.set(P2.subarray((lo - from) * w, (hi - from) * w), (planesAt >> 1) + n);
    simd.s2cChannel(planesAt, planesAt + 2 * n, w, h, sh, stride, a, b, lo, cell0, base, ringAt, qAt, accAt, base + 64);
  }
  sums.forEach((s, k) => { if (s) s.set(u32.subarray(places[k] >> 2, (places[k] >> 2) + s.length)); });
  return true;
};

const s2cPrep = SAMPLE || UPLOAD || JPEG ? null : function s2cPrep(op, tables, a0, a1, a2, a3, a4) {
  if (active !== 'simd') return false;
  const CHUNK = 1048576, badAt = S2C_PREP_WORK;
  const ensureMem = end => {
    grow(end); dirty(0, 1, 1);
    if (s2cPrepLoaded !== retainEpoch) {
      i32[S2C_PREP_TAB >> 2] = tables.bias; i32[(S2C_PREP_TAB + 4) >> 2] = tables.black;
      i32.set(tables.mix, (S2C_PREP_TAB + 8) >> 2); i32.set(tables.lin, (S2C_PREP_TAB + 64) >> 2);
      for (let j = 0; j < 9; j++) i32.set(tables.cones[j], (S2C_PREP_TAB + 1088 + j * 1024) >> 2);
      i32.set(tables.lo, (S2C_PREP_TAB + 10304) >> 2); i32.set(tables.hi, (S2C_PREP_TAB + 272448) >> 2);
      s2cPrepLoaded = retainEpoch;
    }
  };
  if (op === 'rgba3' || op === 'lin3') {
    const n = a1, X = new Int16Array(n), Y = new Int16Array(n), B = new Int16Array(n), step = Math.min(n || 1, CHUNK), inAt = badAt + 16;
    const xAt = inAt + step * (op === 'rgba3' ? 4 : 6), yAt = xAt + step * 2, bAt = yAt + step * 2;
    ensureMem(bAt + step * 2 + 16);
    for (let off = 0; off < n; off += step) {
      const m = Math.min(step, n - off);
      if (op === 'rgba3') {
        u8.set(a0.subarray(off * 4, (off + m) * 4), inAt);
        simd.s2cChannel(inAt, 0, m, -1, -2, 0, 0, 0, 0, 0, S2C_PREP_TAB, xAt, yAt, bAt, badAt);
      } else {
        for (let c = 0; c < 3; c++) u16.set(a0[c].subarray(off, off + m), (inAt + c * step * 2) >> 1);
        simd.s2cChannel(inAt, inAt + step * 2, m, 0, -3, 0, inAt + step * 4, 0, 0, 0, S2C_PREP_TAB, xAt, yAt, bAt, badAt);
      }
      if (i32[badAt >> 2]) throw fault('JXL_INTERNAL', op === 'rgba3' ? 's2-cells:xyb-2' : 's2-cells:xyb-1');
      X.set(i16.subarray(xAt >> 1, (xAt >> 1) + m), off); Y.set(i16.subarray(yAt >> 1, (yAt >> 1) + m), off); B.set(i16.subarray(bAt >> 1, (bAt >> 1) + m), off);
    }
    return [X, Y, B];
  }
  if (op === 'rgba1') {
    const step = Math.min(a1 || 1, CHUNK), inAt = badAt + 16, outAt = inAt + step * 4;
    ensureMem(outAt + step * 2 + 16);
    for (let off = 0; off < a1; off += step) {
      const m = Math.min(step, a1 - off);
      u8.set(a0.subarray(off * 4, (off + m) * 4), inAt);
      simd.s2cChannel(inAt, 0, m, a2, -2, 0, 0, 0, 0, 0, S2C_PREP_TAB, outAt, 0, 0, badAt);
      if (i32[badAt >> 2]) throw fault('JXL_INTERNAL', 's2-cells:xyb-2');
      a3.set(i16.subarray(outAt >> 1, (outAt >> 1) + m), off);
    }
    return a3;
  }
  if (op === 'down') {
    const pic = a0, pw = a1, ph = a2, w = a3, h = a4, outs = [new Uint16Array(w * h), new Uint16Array(w * h), new Uint16Array(w * h)];
    const rowStep = Math.max(1, Math.min(h || 1, Math.floor(CHUNK / Math.max(1, pw)))), inBytes = 2 * rowStep * pw * 2, inAt = badAt + 16;
    const o0 = inAt + (pic.rgba ? 2 * rowStep * pw * 4 : 3 * inBytes), o1 = o0 + rowStep * w * 2, o2 = o1 + rowStep * w * 2;
    ensureMem(o2 + rowStep * w * 2 + 16);
    for (let y = 0; y < h; y += rowStep) {
      const dh = Math.min(rowStep, h - y), sy0 = 2 * y, shRows = Math.max(1, Math.min(ph - sy0, 2 * dh)), m = dh * w;
      if (pic.rgba) {
        u8.set(pic.rgba.subarray(sy0 * pw * 4, (sy0 + shRows) * pw * 4), inAt);
        simd.s2cChannel(inAt, 0, pw, shRows, -4, w, dh, 0, 0, 0, S2C_PREP_TAB, o0, o1, o2, badAt);
      } else {
        for (let c = 0; c < 3; c++) u16.set(pic.lin[c].subarray(sy0 * pw, (sy0 + shRows) * pw), (inAt + c * inBytes) >> 1);
        simd.s2cChannel(inAt, inAt + inBytes, pw, shRows, -5, w, dh, 0, inAt + 2 * inBytes, 0, S2C_PREP_TAB, o0, o1, o2, badAt);
      }
      outs[0].set(u16.subarray(o0 >> 1, (o0 >> 1) + m), y * w); outs[1].set(u16.subarray(o1 >> 1, (o1 >> 1) + m), y * w); outs[2].set(u16.subarray(o2 >> 1, (o2 >> 1) + m), y * w);
    }
    return {lin: outs};
  }
  return false;
};

const GB = 4194304, GB_LIMIT = 272 * 65536, GB_INTO = [3, 0, 1];
const GB_ROOTS = GB, GB_LIN = GB + 32912, GB_MIX = GB_LIN + 6144, GB_BASIS = GB_MIX + 80, GB_PAIRED = GB_BASIS + 512, GB_QUANT = GB_PAIRED + 512,
  GB_THR = GB_QUANT + 1536, GB_SCRATCH = GB_THR + 1536, GB_TILE = GB_SCRATCH + 512, GB_CFL = GB_TILE + 98304,
  GB_PACK = GB_CFL + 1024, GB_NAT = GB_PACK + 6144, GB_KEYS = GB_NAT + 768, GB_VALS = GB_KEYS + 524288, GB_CHUNK = GB_VALS + 24 * 131072;
let packTable;
const getPackTable = () => {
  if (!packTable) {
    packTable = new Uint8Array(6144);
    for (let m = 0; m < 256; m++) for (let l = 0, j = 0; l < 8; l++) if (m >> l & 1) {
      packTable[m * 16 + 2 * j] = 2 * l; packTable[m * 16 + 2 * j + 1] = 2 * l + 1; packTable[4096 + m * 8 + j++] = l;
    }
  }
  return packTable;
};

const packTileRow = SAMPLE ? null : function packTileRow(packed, levels, counts, bh, blocks, stride, first) {
  const entries = 24 * blocks, starts = counts + entries + 3 & ~3, dc = starts + 4 * entries, at = dc + 2 * entries, val = at + 63 * entries + 9 & ~1;
  if (val + 126 * entries + 16 > memory.buffer.byteLength) throw fault('JXL_INTERNAL', 'kernels:tile-row-arena');
  const n = simd.packLevels(levels, counts, bh, blocks, at, val, starts, dc, GB_NAT, 0, GB_PACK);
  sync();
  for (let c = 0; c < 3; c++) {
    const from = bh ? i32[(starts >> 2) + c * 8 * blocks] : 0, to = c < 2 && bh ? i32[(starts >> 2) + (c + 1) * 8 * blocks] : n, channel = packed.channels[c], base = channel.total - from;
    if (channel.total + to - from > channel.at.length) {
      const size = Math.max(channel.total + to - from, channel.at.length * 2), ga = new Uint8Array(size), gv = new Int16Array(size);
      ga.set(channel.at.subarray(0, channel.total)); gv.set(channel.levels.subarray(0, channel.total));
      channel.at = ga; channel.levels = gv;
    }
    channel.at.set(u8.subarray(at + from, at + to), channel.total);
    channel.levels.set(i16.subarray((val >> 1) + from, (val >> 1) + to), channel.total);
    channel.total += to - from;
    for (let by = 0; by < bh; by++) {
      const row = (c * 8 + by) * blocks, block = first + by * stride;
      channel.dc.set(i16.subarray((dc >> 1) + row, (dc >> 1) + row + blocks), block);
      channel.counts.set(u8.subarray(counts + row, counts + row + blocks), block);
      channel.starts[(Math.floor(first / stride) + by) * packed.segments + (first % stride) / packed.segment] = base + i32[(starts >> 2) + row];
      for (let k = 0, gAt = (Math.floor(first / stride) + by) * Math.ceil(stride / 32) + (first % stride) / 32; k * 32 < blocks; k++) channel.groupStarts[gAt + k] = base + i32[(starts >> 2) + row + k * 32];
    }
  }
};

const gabBand = SAMPLE || JPEG ? null : function gabBand(data, width, total, top, height, job) {
  const {linear, mix, bias, rootBias, weights, iterations, thresholds, c84, components, cfl, nonZero, fast, quantFields = null, signed = false, samples = null} = job;
  const pre = fast ? null : job.pre ?? null, layout = pre ? null : sampleLayout(data, samples, signed);
  const lin = !pre && !fast && layout?.mode <= 1 ? (Array.isArray(linear) ? linear : [linear, linear, linear]) : null;
  const stride = Math.ceil(width / 8), rows = Math.ceil(height / 8), W = stride * 8, Hpad = Math.ceil(total / 8) * 8;
  if (pre && (pre.length !== 3 || pre.some(p => !(p instanceof Float64Array) || p.length < W * Hpad))) return false;
  if (active !== 'simd' || (!pre && (!layout || data.length !== total * width * 4)) || (fast && layout?.mode !== 0) ||
      !isInt(top) || top < 0 || top + rows * 8 > Hpad || (fast ? linear.length !== 256 : lin && (lin.length !== 3 || lin.some(t => t.length !== 256))) || mix.length !== 9 ||
      !isInt(iterations) || iterations < (fast ? 1 : 0) || iterations > 16 || !fast && job.roots.length !== 4113 ||
      (fast ? job.steps.length !== 3 || job.scale.length !== 64 : job.basis.length !== 64)) return false;
  const S = fast ? 4 : 8, bpe = pre ? 0 : layout.bpe, halo = iterations ? iterations + (iterations & 1) : 0, packed = !pre && layout.mode <= 1 ? job.packed : null;
  const tileRows = Math.ceil(rows / 8), tileCols = Math.ceil(stride / 8), chunkRows = Math.min(tileRows, 4) * 64 + 2 * iterations;
  const perColumn = chunkRows * (bpe + 4 * S) + 2 * S + 387 + (packed ? 585 : 0);
  const fieldsBytes = !fast && quantFields ? align16(stride * rows * 4) : 0, curveAt = GB_CHUNK + fieldsBytes;
  const chunkAt = fast ? GB_KEYS + 1024 : curveAt + (!pre && layout.mode === 2 ? layout.curve.byteLength : 0), held = Math.min(GB_LIMIT, memory.buffer.byteLength) - chunkAt;
  const room = fast ? (held >= perColumn * (256 + 2 * halo) ? held : 4 << 20) : Math.max(held, perColumn * (64 + 2 * halo));
  let across = Math.min(tileCols, Math.floor((Math.floor(room / perColumn) - 2 * halo) / 64));
  if (packed && across < tileCols) across &= ~3;
  if (across < 1) across = packed ? Math.min(tileCols, 4) : 1;
  const need = chunkAt + (Math.min(W, across * 64) + 2 * halo) * perColumn + 128;
  if (need > memory.buffer.byteLength && data?.buffer === memory.buffer) { data = data.slice(); if (layout) layout.bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength); }
  grow(need); dirty();
  if (fast) {
    f32.set(linear, GB_LIN >> 2); f32.set(mix, GB_MIX >> 2); f32.set(job.scale, GB_PAIRED >> 2);
    for (let c = 0; c < 3; c++) { f32.set(job.steps[c], (GB_QUANT >> 2) + c * 64); f32.set(thresholds[c], (GB_THR >> 2) + c * 64); }
  } else {
    f64.set(job.roots, GB_ROOTS >> 3);
    if (lin) for (let c = 0; c < 3; c++) f64.set(lin[c], (GB_LIN >> 3) + c * 256);
    else if (!pre && layout.mode === 2) f64.set(layout.curve, curveAt >> 3);
    f64.set(mix, GB_MIX >> 3); f64[(GB_MIX + 72) >> 3] = pre ? 1 : layout.lift;
    loadBasis(job.basis, GB_BASIS);
    if (fieldsBytes) i32.set(quantFields.subarray(0, stride * rows), GB_CHUNK >> 2);
    for (let c = 0; c < 3; c++) { for (let k = 0; k < 64; k++) f64[(GB_QUANT >> 3) + c * 64 + k] = job.quant[c][k]; f64.set(thresholds[c], (GB_THR >> 3) + c * 64); }
    i32.fill(-1, GB_KEYS >> 2, (GB_KEYS >> 2) + 131072);
  }
  const norms = weights.map(([w1, w2]) => 1 / (1 + 4 * w1 + 4 * w2)), linPtr = !pre && layout.mode === 2 ? curveAt : GB_LIN;
  if (packed) {
    i32.fill(0, GB_NAT >> 2, (GB_NAT >> 2) + 192); u8.set(getPackTable(), GB_PACK);
    packed.segment = across * 8; packed.segments = Math.ceil(stride / packed.segment);
    for (const ch of packed.channels) { ch.starts = new Uint32Array(rows * packed.segments); ch.groupStarts = new Uint32Array(rows * Math.ceil(stride / 32)); }
  }
  for (let ty0 = 0; ty0 < tileRows; ty0 += 4) {
    const ty1 = Math.min(tileRows, ty0 + 4), s0 = Math.max(0, top + ty0 * 64 - iterations), s1 = Math.min(Hpad, top + Math.min(ty1 * 64, rows * 8) + iterations), n = s1 - s0;
    for (let tx0 = 0; tx0 < tileCols; tx0 += across) {
      const tx1 = Math.min(tileCols, tx0 + across), x0 = tx0 * 64, c0 = Math.max(0, x0 - halo), c1 = Math.min(W, Math.min(tx1 * 64, W) + halo), Wc = c1 - c0, real = Math.min(c1, width) - c0;
      const rgba = chunkAt, planes = rgba + (pre ? 0 : align16(n * real * bpe)), plane = n * Wc * S, orig = planes + 3 * plane, ring = orig + plane;
      const levels = ring + 2 * Wc * S, blocks = (tx1 - tx0 - 1) * 8 + Math.min(8, stride - (tx1 - 1) * 8), counts = levels + 3072 * blocks;
      if (pre) for (let c = 0; c < 3; c++) rows2d(f64, pre[c], W, c0, s0, Wc, n, 1, (planes + c * plane) >> 3);
      else {
        if (!c0 && real === width) {
          const direct = Math.min(s1, total) - s0, rb = width * bpe;
          if (direct > 0) u8.set(layout.bytes.subarray(s0 * rb, (s0 + direct) * rb), rgba);
          const last = layout.bytes.subarray((total - 1) * rb, total * rb);
          for (let y = Math.max(s0, total); y < s1; y++) u8.set(last, rgba + (y - s0) * rb);
        } else if (!((real * bpe | c0 * bpe | width * bpe | rgba | layout.bytes.byteOffset) & 3)) {
          const words = real * bpe >> 2, from32 = new Int32Array(layout.bytes.buffer, layout.bytes.byteOffset, layout.bytes.length >> 2);
          for (let y = s0; y < s1; y++) { const s = (Math.min(y, total - 1) * width + c0) * bpe >> 2, d = (rgba >> 2) + (y - s0) * words; for (let i = 0; i < words; i++) i32[d + i] = from32[s + i]; }
        } else for (let y = s0; y < s1; y++) { const from = (Math.min(y, total - 1) * width + c0) * bpe; u8.set(layout.bytes.subarray(from, from + real * bpe), rgba + (y - s0) * real * bpe); }
        if (packed?.opaque) packed.opaque = simd.opaque(rgba, n * real * 4) === 1;
        if (fast) simd.fgXyb(rgba, real, n, Wc, GB_LIN, GB_MIX, Math.fround(bias), Math.fround(rootBias), planes);
        else simd.xybRows(rgba, real, n, Wc, GB_ROOTS, linPtr, GB_MIX, bias, rootBias, GB_KEYS, GB_VALS, planes, layout.mode);
      }
      for (let c = 0; c < 3 && !pre && iterations > 0; c++) {
        const p = planes + c * plane, [w1, w2] = weights[c];
        if (fast) {
          const to = planes + GB_INTO[c] * plane;
          simd.gab32From(p, to, Wc, n, Math.fround(w1), Math.fround(w2), Math.fround(norms[c]), Math.fround(job.boost ?? 1));
          for (let i = 1; i < iterations; i++) simd.gab32(to, p, ring, Wc, n, Math.fround(w1), Math.fround(w2), Math.fround(norms[c]));
        } else {
          u8.copyWithin(orig, p, p + plane);
          for (let i = 0; i < iterations; i++) simd.gab(p, orig, ring, Wc, n, w1, w2, norms[c]);
        }
      }
      for (let ty = ty0; ty < ty1; ty++) {
        const bh = Math.min(8, rows - ty * 8), bwLast = Math.min(8, stride - (tx1 - 1) * 8);
        if (fast) simd.fgTiles(planes + GB_INTO[0] * plane, n, Wc, top + ty * 64 - s0, x0 - c0, tx1 - tx0, bwLast, bh, GB_TILE, GB_PAIRED, GB_QUANT, GB_THR, c84, levels, counts, GB_CFL, blocks, planes + GB_INTO[1] * plane, planes + GB_INTO[2] * plane);
        else simd.gabTiles(planes, n, Wc, top + ty * 64 - s0, x0 - c0, tx1 - tx0, bwLast, bh, GB_TILE, GB_BASIS, GB_PAIRED, GB_SCRATCH, GB_QUANT, GB_THR, c84, levels, counts, GB_CFL, blocks, fieldsBytes ? GB_CHUNK : 0, stride, ty * 8, tx0 * 8);
        if (packed) packTileRow(packed, levels, counts, bh, blocks, stride, ty * 8 * stride + tx0 * 8);
        else for (let c = 0; c < 3; c++) for (let by = 0; by < bh; by++) {
          const fb = (c * 8 + by) * blocks, block = (ty * 8 + by) * stride + tx0 * 8;
          components[c].coeffs.set(i16.subarray((levels >> 1) + fb * 64, (levels >> 1) + (fb + blocks) * 64), block * 64);
          nonZero[c].set(u8.subarray(counts + fb, counts + fb + blocks), block);
        }
        for (let t = 0; t < tx1 - tx0; t++) { cfl.x[ty * cfl.width + tx0 + t] = i8[GB_CFL + t]; cfl.b[ty * cfl.width + tx0 + t] = i8[GB_CFL + tx1 - tx0 + t]; }
      }
    }
  }
  if (packed) packed.natural.set(u32.subarray(GB_NAT >> 2, (GB_NAT >> 2) + 192));
  return true;
};

const rgbBand = SAMPLE || JPEG || UPLOAD ? null : function rgbBand(data, width, height, {components, tableOf, cflOf, basis, quantScale}) {
  if (active !== 'simd' || !simd.rgbTile || !simd.rgbQuant || !simd.captureSelect || !simd.packLevels || !isU8Like(data) || !isSafe(width) || width < 1 || !isInt(height) || height < 1 || height > 256 || data.length !== width * height * 4) return false;
  const stride = Math.ceil(width / 8), rows = Math.ceil(height / 8), W = stride * 8, H = rows * 8, entries = 24 * stride;
  const levels = GB_KEYS + 1024, counts = levels + entries * 128, starts = counts + entries + 3 & ~3, dc = starts + entries * 4, at = dc + entries * 2, val = at + entries * 63 + 9 & ~1, pixels = align16(val + entries * 126 + 16), end = pixels + W * H * 4;
  if (end > GB_LIMIT) return false;
  if (data.buffer === memory.buffer) data = Uint8Array.from(data);
  grow(end); s2cPrepLoaded = -1;
  for (let y = 0; y < H; y++) {
    const src = Math.min(height - 1, y) * width * 4, dst = pixels + y * W * 4;
    u8.set(data.subarray(src, src + width * 4), dst);
    if (W > width) u32.fill(u32[(dst >> 2) + width - 1], (dst >> 2) + width, (dst >> 2) + W);
  }
  u8.set(getPackTable(), GB_PACK); i32.fill(0, GB_NAT >> 2, (GB_NAT >> 2) + 192);
  const packed = {segment: stride, segments: 1, channels: [0, 1, 2].map(() => ({at: new Uint8Array(stride * rows * 4), levels: new Int16Array(stride * rows * 4),
    total: 0, counts: new Uint8Array(stride * rows), dc: new Int16Array(stride * rows), starts: new Uint32Array(rows), groupStarts: new Uint32Array(rows * Math.ceil(stride / 32))}))};
  const resident = {pixels, levels}, tiled = Math.ceil(stride / 8);
  for (let by = 0; by < rows; by += 8) {
    const bh = Math.min(8, rows - by);
    for (let bx = 0; bx < stride; bx += 8)
      if (!rgbTile(data, width, height, bx, by, Math.min(8, stride - bx), bh, tableOf, (rg, bg, gg) => cflOf((by >> 3) * tiled + (bx >> 3), rg, bg, gg), null, stride, basis, quantScale, resident)) return false;
    for (let c = 0; c < 3; c++) simd.captureSelect(levels + c * 8 * stride * 128, counts + c * 8 * stride, bh * stride, 128, 3);
    packTileRow(packed, levels, counts, bh, stride, stride, by * stride);
  }
  const natural = u32.slice(GB_NAT >> 2, (GB_NAT >> 2) + 192);
  for (let c = 0; c < 3; c++) {
    const ch = packed.channels[c], n = ch.total;
    components[c].coeffs = null;
    components[c].packed = {at: ch.at.slice(0, n), levels: ch.levels.slice(0, n), counts: ch.counts, starts: ch.starts, groupStarts: ch.groupStarts, segment: stride, dc: ch.dc, natural: natural.subarray(c * 64, c * 64 + 64), length: stride * rows * 64};
  }
  return true;
};

const VB_LOG2 = P, VB_BASES = P + 32768, VB_PIX = P + 54272, VB_TMP = P + 62464, VB_TR = P + 70656, VB_TABLES = P + 95232,
  VB_TABLES_END = R, VB_LEVELS = R, VB_OUT = R + 12288, VB_REGION = R + 12352, VB_REGION_END = PROPERTY, VB_STRIP = 4194304;
const vbBasis = size => VB_BASES + 8 * (size === 8 ? 0 : size === 16 ? 128 : 640);
const vbEnter = SAMPLE || UPLOAD || JPEG ? null : (log2, bases) => {
  sync();
  if (vbLoaded !== retainEpoch) {
    dirty();
    f64.set(log2, VB_LOG2 >> 3);
    let at = VB_BASES >> 3;
    for (const size of [8, 16, 32]) { const {basis, basisT} = bases(size); f64.set(basis, at); f64.set(basisT, at + size * size); at += 2 * size * size; }
    const b4 = bases(4); f64.set(b4.basis, VB_TABLES >> 3); f64.set(b4.basisT, (VB_TABLES >> 3) + 16);
    vbSlots = new Map(); vbNext = VB_TABLES + 256; vbStrip = null; vbLoaded = retainEpoch;
  }
};
const vbSamePlanes = (strip, planes, top, W) => {
  if (strip.planes.has(planes)) return true;
  if (!planes[0]?.buffer?.wholePlane || strip.b0?.deref() !== planes[0].buffer || strip.b1?.deref() !== planes[1].buffer || strip.b2?.deref() !== planes[2].buffer) return false;
  const shift = top * W * 8;
  if (planes[0].byteOffset - shift !== strip.o0 || planes[1].byteOffset - shift !== strip.o1 || planes[2].byteOffset - shift !== strip.o2) return false;
  strip.planes.add(planes);
  return true;
};
const vbStripAt = SAMPLE || UPLOAD || JPEG ? null : (planes, top, y, W, h) => {
  if (!vbStrip || !vbSamePlanes(vbStrip, planes, top, W) || vbStrip.W !== W || y < vbStrip.y || y + h > vbStrip.y + vbStrip.rows) {
    const rows = Math.min(planes[0].length / W - (y - top), Math.max(h, 32));
    vbStrip = null; s2cPrepLoaded = -1;
    if (tryGrow(VB_STRIP + 3 * rows * W * 8)) {
      for (let c = 0; c < 3; c++) f64.set(planes[c].subarray((y - top) * W, (y - top + rows) * W), (VB_STRIP >> 3) + c * rows * W);
      const whole = !!planes[0]?.buffer?.wholePlane, shift = top * W * 8;
      vbStrip = {planes: new WeakSet([planes]), W, y, rows,
        b0: whole ? new WeakRef(planes[0].buffer) : null, b1: whole ? new WeakRef(planes[1].buffer) : null, b2: whole ? new WeakRef(planes[2].buffer) : null,
        o0: planes[0].byteOffset - shift, o1: planes[1].byteOffset - shift, o2: planes[2].byteOffset - shift};
    }
  }
};

const vbRateModelBuild = SAMPLE || UPLOAD || JPEG || CAPTURE_PHOTO ? null : function vbRateModelBuild(c0, c1, c2, stride, rows, scan, zdLut) {
  vbStrip = null; s2cPrepLoaded = -1;
  const n = stride * rows * 64, p0 = VB_STRIP, p1 = p0 + n * 2, p2 = p1 + n * 2, scAt = (p2 + n * 2 + 15) & ~15;
  const lutAt = scAt + 64, rowAt = lutAt + 16384, nzAt = rowAt + 12288, zdAt = nzAt + 28416, endAt = zdAt + 351744 + 16;
  const buf = grow(endAt);
  new Int16Array(buf, p0, n).set(c0.subarray(0, n));
  new Int16Array(buf, p1, n).set(c1.subarray(0, n));
  new Int16Array(buf, p2, n).set(c2.subarray(0, n));
  new Uint8Array(buf, scAt, 64).set(scan);
  new Uint16Array(buf, lutAt, 8192).set(zdLut);
  simd.vbRateWalk(p0, p1, p2, stride, rows, scAt, lutAt, rowAt, nzAt, zdAt);
  return [new Uint32Array(buf, nzAt, 7104), new Uint32Array(buf, zdAt, 87936)];
};
const vbTokenBitsCalc = SAMPLE || UPLOAD || JPEG ? null : function vbTokenBitsCalc(plane, order, area, size, nzTable, zdTable, zdLut) {
  vbStrip = null; s2cPrepLoaded = -1;
  const nzAt = VB_STRIP, zdAt = nzAt + 18944, plAt = zdAt + 234496, ordAt = plAt + size * 4, lutAt = ordAt + size * 4, endAt = (lutAt + 16384 + 15) & ~15;
  const buf = grow(endAt);
  new Float64Array(buf, nzAt, 2368).set(nzTable);
  new Float64Array(buf, zdAt, 29312).set(zdTable);
  new Int32Array(buf, plAt, size).set(plane.subarray(0, size));
  new Int32Array(buf, ordAt, size).set(order.subarray(0, size));
  new Uint16Array(buf, lutAt, 8192).set(zdLut);
  return simd.vbTokenBits(plAt, ordAt, area, size, nzAt, zdAt, lutAt);
};
const varblock = SAMPLE || UPLOAD || JPEG ? null : function varblock(log2, bases) {
  if (active !== 'simd' || !(log2 instanceof Float64Array) || log2.length !== 4096) return null;
  return {
    table(id, table, size, order, high, weights = null) {
      vbEnter(log2, bases);
      let slot = vbSlots.get(id);
      if (slot?.table === table && slot.epoch === vbLoaded) return slot;
      if (size > 1024 || table.planes.some(p => p.length !== size) || order.length !== size || high.length !== size) return null;
      const wBytes = weights ? size * 8 : 0;
      if (!slot || slot.size !== size || !!slot.weights !== !!weights) {
        const bytes = size * 29 + wBytes + 7 & ~7;
        if (vbNext + bytes > VB_TABLES_END) { vbSlots.clear(); vbNext = VB_TABLES + 256; }
        if (vbNext + bytes > VB_TABLES_END) return null;
        slot = {size, steps: vbNext, weights: weights ? vbNext + size * 24 : 0, order: vbNext + size * 24 + wBytes, high: vbNext + size * 28 + wBytes};
        vbNext += bytes; vbSlots.set(id, slot);
      }
      slot.table = table; slot.epoch = vbLoaded;
      for (let c = 0; c < 3; c++) f64.set(table.planes[c], (slot.steps >> 3) + c * size);
      if (weights) f64.set(weights, slot.weights >> 3);
      i32.set(order, slot.order >> 2); u8.set(high, slot.high);
      return slot;
    },
    block(planes, top, x, y, W, w, h, from, to, id = 0) {
      vbEnter(log2, bases); vbStripAt(planes, top, y, W, h);
      const small = id === 3 || id === 12 || id === 13;
      for (let c = from; c <= to; c++) {
        const src = vbStrip ? VB_STRIP + 8 * (c * vbStrip.rows * W + (y - vbStrip.y) * W + x) : VB_PIX;
        if (!vbStrip) rows2d(f64, planes[c], W, x, y - top, w, h, 1, VB_PIX >> 3);
        simd.vbDct(src, vbStrip ? W : w, small ? 0 : w, small ? -id : h, small ? VB_TABLES : vbBasis(w) + 8 * w * w, vbBasis(small ? 8 : h), VB_TMP, VB_TR + c * 8192);
      }
    },
    load(planes, at, size) { vbEnter(log2, bases); for (let c = 0; c < 3; c++) f64.set(planes[c].subarray(at, at + size), (VB_TR >> 3) + c * 1024); },
    row8: CAPTURE_PHOTO ? null : (planes, top, x, y, W, n, slot, params, dead, ones, rc1, rc2, rates = null) => {
      if (!simd.vbRow8) return null;
      vbEnter(log2, bases);
      if (slot.epoch !== vbLoaded || slot.size !== 64) return null;
      if (W) { vbStripAt(planes, top, y, W, 8); if (!vbStrip) return null; }
      else { vbStrip = null; s2cPrepLoaded = -1; }
      const at = VB_STRIP + (W ? 3 * vbStrip.rows * W * 8 : 3 * n * 512), deadAt = at + n * 32, onesAt = deadAt + 48, dcAt = onesAt + 32, levelsAt = dcAt + n * 24, ratesAt = levelsAt + n * 768;
      if (!tryGrow(ratesAt + (rates ? n * 8 : 0))) return null;
      if (!W) for (let c = 0; c < 3; c++) f64.set(planes[c].subarray(x, x + n * 64), (VB_STRIP >> 3) + c * n * 64);
      f64.set(params.subarray(0, n * 4), at >> 3); f64.set(dead, deadAt >> 3); f64.set(ones, onesAt >> 3);
      const done = simd.vbRow8(W ? VB_STRIP + 8 * ((y - vbStrip.y) * W + x) : VB_STRIP, W ? 8 * vbStrip.rows * W : n * 512, W, n, vbBasis(8) + 512, vbBasis(8), VB_TMP, VB_TR,
        slot.order, slot.steps, slot.high, VB_LOG2, at, deadAt, onesAt, rc1, rc2, levelsAt, dcAt, VB_OUT, rates ? rates[0] : 0, rates ? rates[1] : 0, rates ? ratesAt : 0);
      return {done, levels: i32.subarray(levelsAt >> 2, (levelsAt >> 2) + n * 192), dc: f64.subarray(dcAt >> 3, (dcAt >> 3) + n * 3),
        ...(rates && {rates: f64.subarray(ratesAt >> 3, (ratesAt >> 3) + n)})};
    },
    band: CAPTURE_PHOTO ? null : (planes, top, y, W, h, jobs, count, levelCount, slots, maxRun, ones, rc1, rc2) => {
      if (!simd.vbBand) return null;
      vbEnter(log2, bases);
      for (const [id, slot] of slots) if (slot.epoch !== vbLoaded || vbSlots.get(id) !== slot) return null;
      vbStripAt(planes, top, y, W, h);
      if (!vbStrip || y + h > vbStrip.y + vbStrip.rows) return null;
      const jobsAt = VB_STRIP + 3 * vbStrip.rows * W * 8, onesAt = jobsAt + (jobs.length + 7 & ~7), levelsAt = onesAt + 32,
        dcsAt = levelsAt + 4 * levelCount, dcTmpAt = dcsAt + 4 * (levelCount >> 6) + 7 & ~7, lowAt = dcTmpAt + 24 * maxRun, stopAt = lowAt + 512,
        bound = (levelCount / 192 | 0) + 1, sizesAt = stopAt + 8, endsAt = sizesAt + 4 * bound, packAt = endsAt + 4 * bound;
      if (!tryGrow(packAt + 8 * levelCount + 16 * bound)) return null;
      u8.set(jobs, jobsAt);
      for (let j = 0, b32 = jobsAt >> 2; j < count; j++, b32 += 48) {
        const w = i32[b32] ? i32[b32 + 3] : 8, hh = i32[b32] ? i32[b32 + 4] : 8;
        i32[b32 + 15] = vbBasis(w) + 8 * w * w; i32[b32 + 22] = vbBasis(hh);
      }
      f64.set(ones, onesAt >> 3); i32[stopAt >> 2] = 0;
      const done = simd.vbBand(jobsAt, count, VB_STRIP + 8 * (y - vbStrip.y) * W, 8 * vbStrip.rows * W, W, VB_TMP, VB_TR, VB_LOG2, onesAt, rc1, rc2, levelsAt, dcsAt, dcTmpAt, lowAt, VB_OUT, stopAt);
      bandLast = {levelsAt, sizesAt, endsAt, packAt, bound, epoch: vbLoaded};
      return {done, stop: i32[stopAt >> 2], levels: i32.subarray(levelsAt >> 2, (levelsAt >> 2) + levelCount), dcs: i32.subarray(dcsAt >> 2, (dcsAt >> 2) + (levelCount >> 6))};
    },
    pack: CAPTURE_PHOTO ? null : (sizes, n) => {
      if (!simd.vbPack || !bandLast || bandLast.epoch !== vbLoaded || vbLoaded !== retainEpoch || n > bandLast.bound) return null;
      sync();
      const {levelsAt, sizesAt, endsAt, packAt} = bandLast;
      i32.set(sizes.subarray(0, n), sizesAt >> 2);
      const total = simd.vbPack(levelsAt, sizesAt, n, packAt, endsAt);
      return {bytes: u8.subarray(packAt, packAt + total), ends: i32.subarray(endsAt >> 2, (endsAt >> 2) + n)};
    },
    priceRow8(planes, top, x, y, W, n, slot, params, dead, ones, rc0, rc1, rc2, rc3) {
      if (!simd.vbPriceRow8) return null;
      vbEnter(log2, bases);
      if (slot.epoch !== vbLoaded || slot.size !== 64) return null;
      vbStripAt(planes, top, y, W, 8);
      if (!vbStrip) return null;
      const at = VB_STRIP + 3 * vbStrip.rows * W * 8, deadAt = at + n * 40, onesAt = deadAt + 48, drAt = onesAt + 56;
      if (!tryGrow(drAt + n * 16)) return null;
      f64.set(params.subarray(0, n * 5), at >> 3); f64.set(dead, deadAt >> 3); f64.set(ones, onesAt >> 3);
      const done = simd.vbPriceRow8(VB_STRIP + 8 * ((y - vbStrip.y) * W + x), 8 * vbStrip.rows * W, W, n, vbBasis(8) + 512, vbBasis(8), VB_TMP, VB_TR,
        slot.order, slot.steps, slot.high, VB_LOG2, at, deadAt, onesAt, rc0, rc1, rc2, rc3, VB_OUT, drAt);
      return {done, dr: f64.subarray(drAt >> 3, (drAt >> 3) + done * 2)};
    },
    coefficients(c, size) {
      sync(); const key = c * 4096 + size;
      let view = vbViewCache.get(key);
      if (!view) vbViewCache.set(key, view = f64.subarray((VB_TR >> 3) + c * 1024, (VB_TR >> 3) + c * 1024 + size));
      return view;
    },
    region() { vbRegionNext = VB_REGION; },
    reserve(size) { if (vbRegionNext + 12 * size > VB_REGION_END) return -1; const at = vbRegionNext; vbRegionNext += 12 * size; return at; },
    unreserve(at) { if (at >= 0) vbRegionNext = at; },
    epoch() { return vbLoaded === retainEpoch ? vbLoaded : -1; },
    levels(at, c, size) { sync(); return i32.subarray((at >> 2) + c * size, (at >> 2) + (c + 1) * size); },
    copyLevels(at, size, dst) { sync(); dst.set(i32.subarray(at >> 2, (at >> 2) + 3 * size)); },
    quant(c, slot, area, size, fc, lo, hi, fine, unit, one, detail, rc1, rc2, R0, plane, sums = null, at = -1) {
      vbEnter(log2, bases);
      if (slot.epoch !== vbLoaded) return 0;
      const base = at >= 0 ? at + c * size * 4 : plane || !sums ? VB_LEVELS : 0;
      if (at >= 0 || plane) {
        const b32 = base >> 2, o32 = slot.order >> 2;
        if (area === 1) i32[b32] = 0; else for (let k = 0; k < area; k++) i32[b32 + i32[o32 + k]] = 0;
      }
      i32[(VB_TMP >> 2) + 6] = slot.weights || 0; i32[(VB_TMP >> 2) + 7] = 0;
      const made = simd.vbQuant(VB_TR + c * 8192, c === 1 ? 0 : VB_TR + 8192, slot.order, slot.steps + c * size * 8, slot.high, area,
        size | 0x40000000, base, VB_LOG2, fc, lo, hi, fine, unit, one, detail, rc1, rc2, R0, sums ? VB_TMP : 0);
      if (made === 1) return 0;
      if (plane) plane.set(i32.subarray(base >> 2, (base >> 2) + size));
      if (!sums) return made === 2 ? 2 : 1;
      sums[0] = f64[VB_TMP >> 3]; sums[1] = f64[(VB_TMP >> 3) + 1]; sums[2] = i32[(VB_TMP >> 2) + 4];
      const wide = i32[(VB_TMP >> 2) + 7];
      for (let i = 0; i < wide; i++) sums[1] += rc2 * Math.log2(i32[(VB_TMP >> 2) + 8 + i]);
      return wide ? 2 : 1;
    },
  };
};

function disableEntropyKernels() { entropyAllowed = false; kernelHooks.entropy = null; }
function ensureKernels() {
  if (active === 'simd') return true;
  try {
    if (!kernelsSupported()) return false;
    if (!memory) createEngine();
    active = 'simd';
    if (!SAMPLE && !JPEG) {
      kernelHooks.weighted = weighted; kernelHooks.fill = fill; if (kernelHooks.fill) kernelHooks.group = group;
      kernelHooks.palette = paletteFill; kernelHooks.rct = rctFill; kernelHooks.tuple = tupleIndex;
      if (PROG) kernelHooks.passLevels = passLevels;
      kernelHooks.screen = screen; kernelHooks.dct = dct; kernelHooks.dctFast = dctFast;
      kernelHooks.xybPlanes = xybPlanesKernel; kernelHooks.ycbcrTile = ycbcrTile; kernelHooks.ycbcrTiles = ycbcrTiles;
      kernelHooks.rgbTiles = rgbTile; kernelHooks.rgbBand = rgbBand; kernelHooks.photoTile = photoTile;
      kernelHooks.opaque = opaqueBytes; kernelHooks.gabBand = gabBand;
    }
    if (!SAMPLE) {
      kernelHooks.sampled = sampled; kernelHooks.acGroup = acGroup; kernelHooks.acGroupPair = acGroupPair;
      kernelHooks.acDeferred = deferredCounts; kernelHooks.nonzero = nonzero;
      kernelHooks.dcEvents = dcEvents; kernelHooks.dcPlan = dcPlan; kernelHooks.planTokens = planTokens; kernelHooks.shape = shape;
    }
    if (!SAMPLE && !UPLOAD && !JPEG) {
      kernelHooks.varblock = varblock; kernelHooks.gaborish = gaborish; kernelHooks.s2cChannel = s2cChannel;
      kernelHooks.s2cPrep = s2cPrep; kernelHooks.strategyFill = strategyFill; kernelHooks.strategyWrite = strategyWrite;
      kernelHooks.vbRateModel = vbRateModelBuild; kernelHooks.vbTokenBits = vbTokenBitsCalc;
    }
    if (!SAMPLE && !CLI && entropyAllowed) kernelHooks.entropy = entropyKernels;
    for (const name of OWN_HOOKS) if (kernelHooks[name]) kernelHooks[name] = entered(kernelHooks[name]);
  } catch { active = 'off'; for (const name of OWN_HOOKS) kernelHooks[name] = null; }
  return active === 'simd';
}
async function prepareKernels() { return kernelsSupported() && compileKernels(); }
const lendEntropy = (SAMPLE || CLI || CAPTURE_PHOTO) ? () => null : /* @__PURE__ */ Object.assign(() => capJpegKernels(ARENA_BYTES, flushTokens), {release: releaseJpegKernels});
const arenaKernels = (SAMPLE || CLI || CAPTURE_PHOTO) ? null : capJpegKernels;
const releaseArena = (SAMPLE || CLI || CAPTURE_PHOTO) ? null : releaseJpegKernels;
if (!SAMPLE) kernelHooks.keptScope = keptScope;
kernelHooks.ensure = ensureKernels;
if (!SAMPLE && !JPEG) kernelHooks.capturePhoto = {prepare: prepareKernels, ready: ensureKernels, opaque: captureOpaque};
return {ensureKernels, disableEntropyKernels, prepareKernels, arenaKernels, releaseArena, lendEntropy, orientBlock, pngRow, sampleTable, sampleBands, writeAnsTokens: flushTokens};
})();
