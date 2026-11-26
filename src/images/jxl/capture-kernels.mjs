// SPDX-License-Identifier: MIT
import {wideLevels} from './color-bytes.mjs';
import {kernelModule, compileKernels, kernelsSupported, kernelInstance, arenaHolder, growArena, tryGrowArena, takeArena, SHAPE_END} from './kernel-runtime.mjs';
import {fault, outOfMemory} from './fault.mjs';
import {BitWriter} from './bits.mjs';
import {wasmRefused, wasmRequired} from './capture-wasm-error.mjs';
import {weightedTables} from './weighted-policy.mjs';
import {kernelHooks} from './kernel-hooks.mjs';
import {RGB8_THRESHOLDS} from './rgb8-thresholds.mjs';
import {inCall, onCallEnd} from './call-scope.mjs';
import {U8, I8, U16, I16, U32, I32, F32, F64, U8C, align16, rows2d, rowsOut, lay, drainBits, kernelCaller, into, both, rect, out, outUpTo, room, made} from './kernel-call.mjs';

const outside = () => { throw fault('JXL_INTERNAL', 'capture-kernels:outside-bounds'); };
const copyOut = (C, b, at, n) => new C(b.slice(at, at + n * C.BYTES_PER_ELEMENT));
const pow2 = (n, min = 2) => 1 << 32 - Math.clz32(Math.max(min, n) - 1);
const isRgba = a => a instanceof U8 || a instanceof U8C;
const writerOk = w => !w || w instanceof BitWriter && w.write === BitWriter.prototype.write && w.grow === BitWriter.prototype.grow;

export const WEIGHTED_BANDS = [-200, -100, -50, -25, -12, -6, -3, -1, 0, 2, 4, 7, 13, 26, 51, 101, 201];
export const WEIGHTED_CONTEXT = /* @__PURE__ */ U8.from({length: 511}, (_, i) => WEIGHTED_BANDS.filter(cut => cut < i - 255).length);
export const LOG_MANTISSA = /* @__PURE__ */ U8.of(0, 1, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 22, 23, 24, 25, 26, 27, 27, 28, 29, 30, 31, 31);
export const SCAN_WORDS = 1 << 21;
export const INTEGER_WORDS = [U8, U8C, I8, U16, I16, U32, I32];

const MEMORY_BYTES = 640 * 65536;
const P = 65536, DIV = 16, WEIGHTS = 272, BANDS = 32768, CONTEXTS = 33280, LOG = 33792, HEADS = 262144, SCRATCH = 832;
export const kernelFail = cause => wasmRefused() ? wasmRequired(cause)
  : Object.assign(new Error('capture kernel: unavailable', {cause}), {code: 'JXL_WASM'});

let compiled, engine, simd, resident, holder = null, base = P, held = null, pageIndices = null, aux = null, boxLinesCopy = 0;
let buf, u8, i16, u16, i32, u32, f64;
const LITTLE = new U8(new U32([1]).buffer)[0] === 1;
const sync = () => {
  if (buf !== engine.memory.buffer) {
    buf = engine.memory.buffer;
    u8 = new U8(buf); i16 = new I16(buf); u16 = new U16(buf); i32 = new I32(buf); u32 = new U32(buf); f64 = new F64(buf);
  }
};
const i32s = (at, n) => i32.slice(at >> 2, (at >> 2) + n);
const u32s = (at, n) => u32.slice(at >> 2, (at >> 2) + n);
const u8s = (at, n) => u8.slice(at, at + n);
const set32 = (a, at, n) => i32.set(n == null || n === a.length ? a : a.subarray(0, n), at >> 2);

export async function compileCaptureKernels() {
  try { return await compileKernels() && prepareCaptureKernels(); } catch { return false; }
}
export function prepareCaptureKernels() {
  try { return typeof WebAssembly === 'object' && LITTLE && Boolean((simd ??= kernelsSupported()) && (compiled ||= kernelModule())); }
  catch { return false; }
}
export function requireCaptureKernels() { if (!prepareCaptureKernels()) throw wasmRequired(); }

function tables(memory) {
  const b = new U8(memory.buffer);
  weightedTables(new I32(memory.buffer), DIV, WEIGHTS);
  b.set(WEIGHTED_CONTEXT, BANDS);
  for (let c = 0; c < 16; c++) b[CONTEXTS + 255 + c] = c;
  b.set(LOG_MANTISSA, LOG);
}
export function captureRelease() { resident = null; held = null; base = P; }
export function captureLetGo() { pageIndices = null; aux = null; }
export function releaseMaskArena() { aux = null; }

function ready() {
  if (!engine) {
    const {memory, exports} = kernelInstance();
    tables(memory);
    holder ??= arenaHolder(captureRelease, null, () => tables(engine.memory), () => { engine = buf = null; });
    engine = {...exports, memory};
  }
  takeArena(holder);
  sync();
}
function reserve(bytes) { resident = null; growArena(bytes); sync(); }
const heldAt = words => held && words.buffer === held.b && words.byteOffset >= held.o && words.byteOffset + words.byteLength <= held.e
  ? P + words.byteOffset - held.o : -1;

const fail = e => { throw e?.code ? e : kernelFail(e); };
function run(work) { requireCaptureKernels(); try { ready(); return work(); } catch (e) { fail(e); } }
const shared = fn => { requireCaptureKernels(); ready(); const at = fn(base); reserve(at.end); return {k: engine, at}; };

function getAux(endBytes, maskErr) {
  requireCaptureKernels();
  const pages = Math.max(4, Math.ceil(endBytes / 65536));
  if (maskErr && pages > 65536) throw fault('JXL_MEMORY', 'capture mask arena: too large');
  try {
    boxLinesCopy++;
    if (!aux) {
      const memory = new WebAssembly.Memory({initial: pages});
      aux = {k: {...new WebAssembly.Instance(compiled ??= kernelModule(), {env: {memory}}).exports, memory}, pages};
    } else if (pages > aux.pages) {
      aux.k.memory.grow(pages - aux.pages);
      aux.pages = pages;
    }
    return aux.k;
  } catch (cause) {
    throw maskErr ? (outOfMemory(cause) ? Object.assign(fault('JXL_MEMORY', 'capture mask arena: grow failed'), {cause}) : kernelFail(cause))
      : (!aux ? kernelFail(cause) : Object.assign(fault('JXL_MEMORY', 'auxiliary arena: grow failed'), {cause}));
  }
}
function maskArena(fn) {
  requireCaptureKernels();
  const s = fn(align16(base));
  if (s.end <= MEMORY_BYTES) { ready(); reserve(s.end); return {k: engine, at: s}; }
  const at = fn(P);
  return {k: getAux(at.end, 1), at};
}

const config = c => I32.of(c.split, c.msb, c.lsb, c.splitToken);
const configRows = (configs, n = configs.length) => made(I32, n * 4, to => {
  for (let k = 0; k < n; k++) { const c = configs[k]; to[k * 4] = c.split; to[k * 4 + 1] = c.msb; to[k * 4 + 2] = c.lsb; to[k * 4 + 3] = c.splitToken; }
});
const codeRows = (codes, alphabet) => made(U32, codes.length * alphabet * 2, to => codes.forEach(({lengths, codes: bits}, h) => {
  for (let s = 0, r = h * alphabet * 2; s < alphabet; s++) { const ok = s < lengths.length; to[r + s * 2] = ok ? bits[s] : 0; to[r + s * 2 + 1] = ok ? lengths[s] : 255; }
}));
const stateIn = (st, w, outPtr) => {
  new BigInt64Array(buf, st, 1)[0] = BigInt(w.acc);
  i32[(st >> 2) + 2] = w.pending;
  if (outPtr) i32[(st >> 2) + 3] = outPtr;
};
const stateOut = (st, w) => { w.acc = Number(new BigInt64Array(buf, st, 1)[0]); w.pending = i32[(st >> 2) + 2]; };

export const call = /* @__PURE__ */ kernelCaller(shared, fail);
const callFit = /* @__PURE__ */ kernelCaller(maskArena, fail);
const callOr = /* @__PURE__ */ kernelCaller(shared, e => { if (e?.code === 'JXL_MEMORY') throw e; });
const spaceFit = (args, work) => callFit(k => (...at) => work(k, at, k.memory.buffer), args)[0];
const inSpace = (args, work) => call(k => (...at) => work(k, at), args)[0];

export function captureHold(words) {
  captureRelease();
  if (!(words instanceof U32) || words.length > SCAN_WORDS || !prepareCaptureKernels()) return false;
  try {
    ready(); reserve(P + words.length * 4 + 16);
    u32.set(words, P >> 2);
    held = {b: words.buffer, o: words.byteOffset, e: words.byteOffset + words.byteLength};
    base = P + (words.length * 4 + 16 & ~15);
    return true;
  } catch { captureRelease(); return false; }
}

export function captureWeighted(w, _t, plane, width, height, offset, _c, residuals, properties, keep = false, y0 = 0) {
  const n = width * height;
  if (w || !(plane instanceof I16 || !keep && plane instanceof I32) || width < 1 || height < 1 || width > 16384 ||
      n > 1 << 20 || plane.length < n || Math.abs(offset) > 32768 ||
      !keep && (!(residuals instanceof U32) || residuals.length < n || properties && (!(properties instanceof I32) || properties.length < n)) ||
      !prepareCaptureKernels()) return false;
  try {
    ready();
    if (y0 && !(y0 === 8 && resident?.b === plane.buffer && resident.o === plane.byteOffset && resident.w === width && resident.h === height && resident.base === base)) y0 = 0;
    const cap = keep > 2 ? width * keep : n, res = base + cap * 4, prop = base + cap * 8, st = base + cap * 12,
      sPlane = st + (width + 2) * 40, sVal = align16(sPlane + n * 2), sCtx = align16(sVal + n * 2);
    reserve(keep > 1 ? sCtx + n + 16 : sPlane);
    if (!y0) { set32(plane, base, n); i32.fill(0, st >> 2, (st >> 2) + (width + 2) * 10); }
    else i32.set(plane.subarray(y0 * width, n), (base >> 2) + y0 * width);
    if (y0 < height) engine.captureWeighted(base + y0 * width * 4, width, height, offset, res + y0 * width * 4, prop + y0 * width * 4, y0, 0, 0, DIV, WEIGHTS, st);
    if (!(typeof __RAPIER_JXL_JPEG__ !== 'undefined' && __RAPIER_JXL_JPEG__ === true) && keep > 1) {
      i16.set(plane.subarray(0, n), sPlane >> 1);
      engine.smooth(sPlane, width, 0, height, sVal, sCtx);
      if (keep > 2 && height === 8) resident = {b: plane.buffer, o: plane.byteOffset, w: width, h: keep, base};
      return {residuals: new U32(buf, res, n), properties: new I32(buf, prop, n), values: new U16(buf, sVal, n), contexts: new U8(buf, sCtx, n)};
    }
    if (!keep) {
      residuals.set(i32.subarray(res >> 2, (res >> 2) + n));
      if (properties) properties.set(i32.subarray(prop >> 2, (prop >> 2) + n));
    }
    return true;
  } catch (e) { if (e?.code === 'JXL_MEMORY') throw e; return false; }
}

export function captureStripMargin(plane, width, height, keep = 2) {
  if (!(plane instanceof I16) || width < 1 || width > 16384 || height < 1 || width * height > 1 << 20 || plane.length < width * height ||
      keep < 1 || keep > Math.max(2, height)) outside();
  if (width * height < 4096 || height < 8) return {chooseW: 1, marginBpp: 1};
  if (keep < 2) throw fault('JXL_INTERNAL', 'capture-kernels:smooth-residuals');
  return run(() => {
    const stripN = width * 8, countsOff = (keep > 2 ? width * keep : stripN) * 12 + (width + 2) * 40 + 2 * align16(stripN * 2) + stripN + 31 & ~15;
    if (base + countsOff + 17424 > MEMORY_BYTES) captureRelease();
    const sCnt = base + countsOff, wCnt = sCnt + 8192, totals = wCnt + 9216;
    reserve(totals + 16);
    u8.fill(0, sCnt, totals + 16);
    const last = height - 8;
    let prev = -1;
    for (const y0 of [last, last * 2 / 3 | 0, last / 3 | 0, 0]) if (y0 !== prev) {
      prev = y0;
      const s = captureWeighted(null, null, plane.subarray(y0 * width, (y0 + 8) * width), width, 8, 0, undefined, null, null, y0 ? 2 : keep);
      if (!s) throw kernelFail();
      engine.sampleCounts(s.values.byteOffset, s.contexts.byteOffset, s.residuals.byteOffset, s.properties.byteOffset, width, BANDS, sCnt, wCnt, totals);
    }
    const ti = totals >> 2, wCost = engine.sampleCost(wCnt, 18, u32[ti + 1], LOG), sCost = engine.sampleCost(sCnt, 16, u32[ti], LOG);
    return {chooseW: wCost <= sCost ? 2 : 0, marginBpp: (sCost - wCost) / u32[ti + 2]};
  });
}

export function captureResidualCopies2d(planes, width, height) {
  if (width < 1 || width > 16384 || height < 1 || width * height > 1 << 20 || !Array.isArray(planes) || planes.length !== 3 ||
      planes.some(p => !(p instanceof I16) || p.length < width * height)) outside();
  if (width < 8 || height < 8) return false;
  requireCaptureKernels(); ready();
  const n = width * 8;
  if (base + n * 5 + 64 > MEMORY_BYTES) captureRelease();
  return inSpace([room(n * 2), room(n * 2), room(n), room(8, 1)], (k, [samples, values, contexts, totals]) => {
    for (const p of planes) {
      i16.set(p.subarray(0, n), samples >> 1);
      k.smooth(samples, width, 0, 8, values, contexts);
      k.sampleRepeats(values, width, totals);
    }
    const c0 = u32[totals >> 2];
    return c0 >= 16 && u32[(totals >> 2) + 1] * 4 >= c0 * 3;
  });
}

export const capturePrices = (configs, {values, counts}, distance = false) =>
  (!(values instanceof I32) || !(counts instanceof U32) || values.length !== counts.length || values.length > 1 << 20 ||
    configs.length < 1 || configs.length > 64) ? outside() : call(k => k.prices, [values, counts, values.length, configRows(configs), configs.length, distance ? 1 : 0, room(131072), room(4096), LOG, out(F64, configs.length * 2)])[1];

const searches = [];
onCallEnd(() => {}, () => { searches.length = 0; });
export function captureCopies(values, stride, origin, width, height, contexts, depth, minimum, scale, spatial, lazyUnder = 1 << 30, nice = 1 << 30) {
  try {
    requireCaptureKernels();
    const n = width * height, smooth = !(typeof __RAPIER_JXL_JPEG__ !== 'undefined' && __RAPIER_JXL_JPEG__ === true) && values instanceof I16;
    if (!(values instanceof U16 || smooth && stride === width && !origin && !contexts) ||
        width < 1 || height < 1 || width > 16384 || n > 1 << 20 || stride < width || origin < 0 ||
        origin + (height - 1) * stride + width > values.length || contexts !== null && !(contexts instanceof U8 && contexts.length >= n) ||
        !(spatial instanceof U8) || spatial.length > width * 8 + 64 || depth < 0 || depth > 64 || minimum < 1 || scale < 1 || scale > 2 ||
        lazyUnder < 0 || lazyUnder > 1 << 30 || nice < 1 || nice > 1 << 30)
      outside();
    const hasCtx = smooth || Boolean(contexts), words = n + 1 >> 1;
    const key = hasCtx ? null : `${width},${height},${depth},${minimum},${scale},${lazyUnder},${nice},${spatial.length}`;
    return inSpace([spatial, room(SCRATCH), room(depth ? HEADS : 0), room(n * 2 + 19 & ~3), room(depth ? n * 4 : 0), room(n * 4), room(n * 4), room(n + 20 + words * 4)],
      (k, [flags, scratch, heads, at, chain, val, dist, ctx]) => {
        if (smooth) { i16.set(values.subarray(0, n), val >> 1); k.smooth(val, width, 0, height, at, ctx); }
        else { rows2d(u16, values, stride, origin, 0, width, height, 1, at >> 1); if (contexts) u8.set(contexts.subarray(0, n), ctx); }
        const same = key && inCall() && searches.find(s => s.key === key), kept = ctx + n + 19 & ~3;
        if (same && (u16[(at >> 1) + n] = 0, u16.set(same.values, kept >> 1), k.peelEqual(at, kept, words)))
          return {count: same.count, value: same.value.slice(), distance: same.distance.slice(), context: new U8(same.count)};
        const count = k.copies(at, hasCtx ? ctx : 0, n, width, depth, minimum, scale, flags, spatial.length, heads, chain, scratch, val, dist, ctx, lazyUnder, nice);
        const found = {count, value: i32s(val, count), distance: i32s(dist, count), context: hasCtx ? u8s(ctx, count) : new U8(count)};
        if (key && inCall()) {
          const sv = new U16(words * 2); sv.set(u16.subarray(at >> 1, (at >> 1) + n));
          searches.unshift({key, values: sv, count, value: found.value.slice(), distance: found.distance.slice()});
          if (searches.length > 4) searches.length = 4;
        }
        return found;
      });
  } catch (e) { fail(e); }
}

export function capturePrune(values, distances, count, plane, w, h, stride, origin, minimum, costs) {
  const n = w * h;
  if (!(values instanceof I32) || !(distances instanceof I32) || !(plane instanceof U16) || count < 1 ||
      values.length < count || distances.length < count || count > n || n > 1 << 20 || origin + (h - 1) * stride + w > plane.length) outside();
  return run(() => {
    const [vAt, dAt, at, samp, keep, outAt, end1] = lay(base, [count * 4, count * 4, count * 4, n * 2, count, 16]);
    reserve(end1);
    set32(values, vAt, count); set32(distances, dAt, count);
    rows2d(u16, plane, stride, origin, 0, w, h, 1, samp >> 1);
    engine.pruneScan(vAt, dAt, count, samp, minimum, at, outAt);
    const copies = i32[outAt >> 2], top = i32[(outAt >> 2) + 1], scale = i32[(outAt >> 2) + 2] || 2;
    if (copies < 1000) return null;
    const [lit, freq, bits, tabs, symAt, oVal, oDist, end2] = lay(end1, [(top + 1) * 4, (top + 1) * 4, (top + 1) * 8, 4096, 16, n * 4, n * 4]);
    reserve(end2);
    u8.fill(1, keep, keep + count); u32.fill(0, lit >> 2, (lit >> 2) + top + 1);
    const litCount = engine.pruneLiterals(vAt, dAt, count, lit);
    for (let pass = 0; pass < 2; pass++) {
      u32.copyWithin(freq >> 2, lit >> 2, (lit >> 2) + top + 1);
      const kept = engine.pruneTally(vAt, dAt, count, samp, minimum, scale, at, keep, freq, top, tabs, tabs + 2048, litCount, symAt);
      if (!kept) break;
      costs(new U32(buf, freq, top + 1), top, f64[symAt >> 3], kept, new F64(buf, bits, top + 1), new F64(buf, tabs, 256), new F64(buf, tabs + 2048, 256));
      if (!engine.pruneDecide(vAt, dAt, count, samp, minimum, scale, at, keep, bits, top, tabs, tabs + 2048)) break;
    }
    const total = engine.pruneExpand(vAt, dAt, count, samp, minimum, scale, at, keep, oVal, oDist);
    return total === count ? null : {count: total, value: i32s(oVal, total), distance: i32s(oDist, total)};
  });
}

export const captureNearestWalk = (colours, left, dst, start) => {
  const m = left.length;
  if (!(left instanceof I32) || !(dst instanceof I32) || dst.length < m || m < 1 || m > 1 << 20) outside();
  call(k => k.nearestWalk, [U32.from(left, i => colours[i]), left, m, start >>> 0, out(I32, dst, 0, m), room(32788 + m * 16)]);
};

export const captureRowsModel = (plane, w, h, values, contexts) => {
  const n = w * h;
  if (!(plane instanceof I32) || !(values instanceof I32) || !(contexts instanceof U8) || n < 1 || n > 1 << 20 ||
      plane.length < n || values.length < n || contexts.length < n || h > 1024) outside();
  return call(k => k.rowsModel, [into(I32, plane, n), w, h, out(I32, values, 0, n), out(U8, contexts, 0, n), out(U8, 3 * h),
    room(n * 4), room(n * 4), room(h * 18432), LOG])[3];
};

export const captureRowsBits = (values, distances, contexts, count, classes, copies) =>
  (!(values instanceof I32) || !(distances instanceof I32) || !(contexts instanceof U8) || count < 1 || count > 1 << 20 ||
    values.length < count || distances.length < count || contexts.length < count || classes < 1 || classes > 3072) ? outside() : call(k => k.rowsBits, [into(I32, values, count), into(I32, distances, count), into(U8, contexts, count), count, classes,
    copies ? 1 : 0, room(classes * 2048), LOG])[0];

export function capturePageGroupStats(words, stride, x, y, width, height, rowStep = 32) {
  if (!(words instanceof U32) || ![stride, x, y, width, height, rowStep].every(Number.isInteger) ||
      x < 0 || y < 0 || width < 1 || height < 1 || width > 1024 || height > 1024 ||
      x + width > stride || (y + height - 1) * stride + x + width > words.length || rowStep < 1 || rowStep > 32) outside();
  const at = heldAt(words), direct = at >= 0 && base + 32832 <= MEMORY_BYTES;
  if (!direct && base + width * height * 4 + 32832 > MEMORY_BYTES) captureRelease();
  return call(k => k.pageGroupStats,
    [direct ? at + 4 * (y * stride + x) : made(U32, width * height, to => rows2d(to, words, stride, x, y, width, height)),
      direct ? stride : width, width, height, room(32768), out(U32, 12), rowStep])[1];
}

export function captureBlockHashes(words, width, height) {
  if (width < 8 || height < 8 || words.length < width * height) outside();
  requireCaptureKernels(); ready();
  const blocks = (width >> 3) * (height >> 3), at = heldAt(words);
  return base + (at >= 0 ? 0 : width * height * 4) + blocks * 4 + 32 > MEMORY_BYTES ? null
    : call(k => k.blockHashes, [at >= 0 ? at : into(U32, words, width * height), width, height, out(U32, blocks)])[1];
}

export function captureKeyCounts(keys, hn) {
  if (!(keys instanceof U32) || keys.length > 1 << 24 || hn < 1 || hn > 4096) outside();
  const n = keys.length, [, values, counts, starts] = call(k => k.keyCounts, [keys, n, room(n * 4), room(8192),
    outUpTo(I32, n, d => d), outUpTo(U32, n, d => d), out(I32, hn + 1), hn]);
  return {values, counts, starts};
}

const ANS_WINDOW = 1 << 16;
const captureAnsRegion = (histograms, most, above = 0, raws = most) => {
  const tabs = align16(base), tags = align16(Math.max(tabs + histograms * 9232, above)), bits = tags + most * 4;
  return {tabs, tags, bits, end: align16(bits + raws * 4), most, histograms};
};

export function captureAnsTokens(models, index, configs, copy, histograms, most) {
  const offset = copy ? 1 : 0, sLen = copy?.spatial ? copy.sCodes.length : 0, hn = histograms + offset;
  let win = 1;
  for (const m of models) win = Math.max(win, Math.min(ANS_WINDOW, m.count));
  requireCaptureKernels(); ready();
  return inSpace([into(I32, index), configRows(configs, histograms), copy ? config(copy.lengthConfig) : room(16),
    copy ? config(copy.distanceConfig) : room(16), sLen ? into(I16, copy.sCodes, sLen) : 0,
    room(win * 4), room(win * 4), room(win), room(hn * 1024, 1), room(16)],
    (k, [hmap, cfg, lengthConfig, dCfg, sCodes, vals, dists, ctxs, freqs, cur]) => {
      const region = captureAnsRegion(hn, most, Math.max(SHAPE_END, cur + 16), 0);
      reserve(region.bits + 16);
      i32[cur >> 2] = region.bits;
      let at = 0;
      for (const m of models) for (let from = 0; from < m.count; from += win) {
        const to = Math.min(m.count, from + win);
        if (i32[cur >> 2] + (to - from) * 8 > buf.byteLength) reserve(i32[cur >> 2] + (to - from) * 8);
        i32.set(m.pieceValue.subarray(from, to), vals >> 2); i32.set(m.pieceDistance.subarray(from, to), dists >> 2);
        u8.set(m.pieceContext.subarray(from, to), ctxs);
        const w = k.ansTokens(vals, dists, ctxs, to - from, hmap + m.base * 4, cfg, offset, copy ? Math.min(copy.minSymbol, 256) : 256, lengthConfig,
          dCfg, copy ? copy.minSymbol : 0, copy?.spatial ? 1 : 0, sLen, sCodes, region.tags + at * 4, cur, 0, freqs);
        if (w < 0) return null;
        if ((at += w) > most) outside();
      }
      const counts = u32s(freqs, hn * 256);
      return {n: at, region: {...region, end: align16(i32[cur >> 2])}, freqs: Array.from({length: hn}, (_, h) => counts.subarray(h * 256, (h + 1) * 256))};
    });
}

const localPlane = (plane, w, h) => {
  if (!(plane instanceof I32 || plane instanceof I16) || w < 1 || h < 1 || w * h > 1 << 20 || plane.length < w * h) outside();
};
export const captureLocalResiduals = (plane, w, h, predictor) => localPlane(plane, w, h) ??
  call(k => k.localResiduals, [into(I32, plane, w * h), w, h, predictor, out(U32, w * h), room(32)])[1];

export function captureLocalProperties(plane, w, h, property) {
  localPlane(plane, w, h);
  const [ans, props] = call(k => k.localProperties, [into(I32, plane, w * h), w, h, property, out(I32, w * h), room(32)]);
  return ans < 0 ? null : props;
}
export function captureLocalTokens(values, properties, cuts, residualConfig, lz77, alphabet, contexts, tags = null) {
  const n = values.length, mode = !cuts ? 0 : cuts === 'learned' ? 2 : 1, ncuts = mode === 1 ? cuts.length : 0;
  if (!(values instanceof U32) || n > 1 << 20 || mode && !(properties?.length >= n) || ncuts > 256 || contexts < 1 || contexts > 256) outside();
  const used = u => u, [, a, b] = call(k => k.localTokens, [values, n, mode ? into(I32, properties, n) : 0, mode,
    ncuts ? into(I32, cuts) : 0, ncuts, tags ? 1 : 0, tags ? outUpTo(U32, n * 2, used) : out(U32, contexts * alphabet, 1),
    tags ? outUpTo(U32, n * 2, used) : 0, alphabet, config(residualConfig), config(lz77.lengthConfig), lz77.minLength, lz77.minSymbol,
    tags ? tags.first : 0, tags?.map]);
  return tags ? {tags: a, extra: b, used: a.length} : Array.from({length: contexts}, (_, c) => a.subarray(c * alphabet, (c + 1) * alphabet));
}

const LOCAL_OUT = 1 << 20;
export function captureLocalWrite(writer, values, properties, cuts, codes, mapping, residualConfig, lz77, alphabet) {
  const n = values.length, mode = !cuts ? 0 : cuts === 'learned' ? 2 : 1, ncuts = mode === 1 ? cuts.length : 0;
  if (!(values instanceof U32) || n > 1 << 20 || mode && !(properties?.length >= n) || ncuts > 256 || codes.length < 1 || codes.length > 256) outside();
  inSpace([values, mode ? into(I32, properties, n) : 0, ncuts ? into(I32, cuts) : 0, configRows([residualConfig, lz77.lengthConfig]),
    mapping, room(16), codeRows(codes, alphabet), room(LOCAL_OUT + 64)],
    (k, [at, props, cutsAt, cfg, map, st, table, outAt]) => {
      stateIn(st, writer);
      for (let i = 0; i < n;) {
        i = k.localWrite(at, i, n, props, mode, cutsAt, ncuts, table, alphabet, cfg, cfg + 16, lz77.minLength, lz77.minSymbol, map, outAt, outAt + LOCAL_OUT, st);
        if (i < 0) throw fault('JXL_INTERNAL', 'capture-kernels:token-code');
        drainBits(writer, u8, outAt, i32[(st >> 2) + 3] - outAt, undefined, 0, 16);
      }
      stateOut(st, writer);
    });
}

export function captureChannelCode(w, target, plane, width, height, leaf, raw, residuals, beginY, configs) {
  const n = width * height, short = plane instanceof I16, words = plane instanceof U8 || plane instanceof U16 || plane instanceof I8;
  if (!(plane instanceof I32 || short || words && leaf.multiplier === 1) || width < 1 || height < 1 || plane.length < n ||
      !(leaf.multiplier >= 1) || beginY < 0 || !writerOk(w)) return false;
  const mode = residuals ? 3 : w ? 2 : raw ? 1 : 0, tLen = mode < 2 ? target.length : mode === 2 ? target.lengths.length : n;
  return inSpace([into(I32, plane, n), configRows([leaf.config ?? configs.residual, configs.run]), room(16),
    mode < 2 ? into(U32, target) : mode === 3 ? room(n * 4) : codeRows([target], 257), room(mode === 2 ? n * 6 + 64 : 0)],
    (k, [at, cfg, st, table, outAt]) => {
      if (mode === 2) stateIn(st, w, outAt);
      if (k.channelCode(at, width, height, beginY, leaf.predictor, leaf.offset, leaf.multiplier, short ? 1 : 0, mode, table, tLen, cfg, cfg + 16,
        configs.minSymbol, configs.minLength, table, 257, outAt, st) < 0) return false;
      if (leaf.multiplier !== 1) plane.set(i32.subarray(at >> 2, (at >> 2) + n));
      if (mode < 2) target.set(u32.subarray(table >> 2, (table >> 2) + tLen));
      else if (mode === 3) residuals.set(i32.subarray((table >> 2) + beginY * width, (table >> 2) + n), beginY * width);
      else { drainBits(w, u8, outAt, i32[(st >> 2) + 3] - outAt, undefined, 0, 16); stateOut(st, w); }
      return true;
    });
}

export function captureNativeFill(planes, words, stride, x0, y0, w, h, fill) {
  const n = w * h, {channels, tables: tabs} = fill;
  if (!INTEGER_WORDS.some(T => words instanceof T) || w < 1 || h < 1 || x0 < 0 || y0 < 0 || x0 + w > stride ||
      ((y0 + h - 1) * stride + x0 + w) * 4 > words.length || planes.length < channels || planes.some((p, c) => c < channels && p.length < n)) return false;
  let tBytes = 0;
  if (tabs) for (const t of tabs) if (t) tBytes += t.length * 4;
  return inSpace([made(I32, n * 4, to => rows2d(to, words, stride, x0, y0, w, h, 4)), room(channels * 8), room(tBytes), room(channels * n * 4)],
    (k, [at, list, tAt, outAt]) => {
      if (tabs) for (let c = 0, next = tAt; c < channels; c++) {
        const t = tabs[c];
        i32[(list >> 2) + c * 2] = t ? next : 0; i32[(list >> 2) + c * 2 + 1] = t ? t.length : 0;
        if (t) { set32(t, next); next += t.length * 4; }
      }
      k.nativeFill(at, n, channels, fill.alpha ? 1 : 0, fill.grey ? 1 : 0, fill.rct, ...fill.shifts, fill.qmode, fill.drop, tabs ? list : 0, outAt);
      for (let c = 0; c < channels; c++) planes[c].set(i32.subarray((outAt >> 2) + c * n, (outAt >> 2) + (c + 1) * n));
      return true;
    });
}

const DISTINCT_SLOTS = 1 << 18, DISTINCT_BAND = 1 << 20;
export function captureNativeShape(words, opaqueValue, known, opaque, grey, qmode, drop) {
  let flags = (opaque ? 1 : 0) | (grey ? 2 : 0);
  for (let s = 0; s < words.length && (flags & 2 || !known && flags & 1); s += DISTINCT_BAND) {
    const band = words.subarray(s, s + DISTINCT_BAND);
    flags = call(k => k.nativeShape, [into(I32, band), band.length, opaqueValue, known ? 1 : 0, flags, qmode, drop])[0];
  }
  return {opaque: !!(flags & 1), grey: !!(flags & 2)};
}
export function captureWordsOr(words, n, colour, alpha, channels, float) {
  if (n > words.length || channels < 1 || channels > 4) outside();
  let or = new I32(4), nonNegative = true;
  for (let s = 0; s < n; s += DISTINCT_BAND) {
    const band = words.subarray(s, Math.min(n, s + DISTINCT_BAND));
    const [all, kept] = call(k => k.wordsOr, [into(I32, band), band.length, colour, alpha ? 1 : 0, channels, float, both(I32, or)]);
    if (!all) nonNegative = false;
    or = kept;
  }
  return {or: or.slice(0, channels), nonNegative};
}

export function captureModularAnsWrite(w, tags, extras, n, shapes, offset) {
  if (n < 0 || tags.length < n || extras.length < n) return false;
  return run(() => {
    const region = captureAnsRegion(shapes.length, n, 0, w ? n : 0);
    reserve(region.end);
    set32(tags, region.tags, n);
    if (w) for (let i = 0, at = region.bits >> 2; i < n; i++) if (tags[i] >>> 9 & 63) i32[at++] = extras[i];
    return ansWrite(w, region, n, shapes, offset, n);
  });
}
function wordsBound(freqs, shapes, n) {
  let grown = 5 + 0.1 * n;
  for (let h = 0; h < freqs.length && h < shapes.length; h++) {
    const counts = freqs[h], shape = shapes[h].counts;
    for (let s = 0; s < counts.length; s++) if (counts[s]) grown += counts[s] * (shape[s] ? 12 - (31 - Math.clz32(shape[s])) : 12);
  }
  return Math.min(n, Math.ceil(grown / 16) + 2);
}
export const captureAnsWrite = (w, {region, n, freqs}, shapes) => run(() => ansWrite(w, region, n, shapes, 0, wordsBound(freqs, shapes, n)));
function ansWrite(w, region, n, shapes, offset, most) {
  if (!writerOk(w) || offset < 0 || offset > shapes.length || shapes.length > region.histograms || n > region.most) return false;
  const {tabs, tags, bits: raw, end: floor} = region;
  let top = align16(floor + most * 2), outAt = top + 16;
  reserve(w ? outAt + 64 : outAt);
  shapes.forEach((h, k) => {
    const first = (tabs + k * 9232) >> 1;
    u16.fill(0, first, first + 520); u16.set(h.counts, first); u16.set(h.starts, first + 256); u16.set(h.reverse, first + 520);
  });
  let bits = engine.tokAnsBack(tags, n, tabs + offset * 9232, top, floor);
  if (bits < 0) {
    top = align16(floor + n * 2); outAt = top + 16;
    reserve(w ? outAt + 64 : outAt);
    bits = engine.tokAnsBack(tags, n, tabs + offset * 9232, top, floor);
  }
  if (!w) return bits;
  reserve(outAt + (bits + w.pending >> 3) + 16);
  const written = engine.tokAnsWrite(tags, raw, n, u32[top >> 2], w.acc, w.pending, outAt), whole = written >> 3, rest = written & 7;
  drainBits(w, u8, outAt, whole, rest ? u8[outAt + whole] & (1 << rest) - 1 : 0, rest);
  return bits;
}

export const captureDistinctWords = (words, from, limit) => captureDistinct(words, from, limit, keys => keys.sort())?.table ?? null;
export function captureDistinct(words, from, limit, sort, plane = null) {
  if (!INTEGER_WORDS.some(T => words instanceof T) || limit < 1 || limit > DISTINCT_SLOTS / 2 ||
      plane && !(plane instanceof I16 && plane.length >= words.length / 4 && limit <= 32768)) outside();
  const slots = Math.min(DISTINCT_SLOTS, pow2(4 * (limit + 1), 1024)), bandWords = Math.min(DISTINCT_BAND, words.length + 3 & ~3);
  return inSpace([room(slots * 4), room(slots, 1), room(slots * 4), room(Math.max(bandWords, limit + 1) * 4), room(bandWords / 2 + 8)],
    (k, [keys, used, ranks, at, outAt]) => {
      let count = 0;
      for (let s = 0; s < words.length; s += bandWords) {
        const band = words.subarray(s, Math.min(words.length, s + bandWords));
        set32(band, at);
        if ((count = k.distinctWords(at, band.length, from, keys, used, slots, count, limit)) < 0) return null;
      }
      const n = k.distinctKeys(keys, used, slots, at), table = sort(i32s(at, n));
      if (!plane) return {table};
      set32(table, at);
      k.distinctRank(keys, used, slots, at, n, ranks);
      for (let s = 0; s < words.length; s += bandWords) {
        const band = words.subarray(s, Math.min(words.length, s + bandWords));
        set32(band, at);
        if (k.distinctIndex(at, band.length, from, keys, used, slots, ranks, outAt) < 0) throw fault('JXL_INTERNAL', 'capture-kernels:sample-set');
        plane.set(i16.subarray(outAt >> 1, (outAt >> 1) + (band.length >> 2)), s >> 2);
      }
      return {table, plane};
    });
}

const runPieces = (val, dist, n, min, table, ctx) => {
  const count = engine.runs(val, dist, n, min, table, ctx);
  return {count, value: i32s(val, count), distance: i32s(dist, count), context: u8s(ctx, count)};
};

export function captureWeightedPieces(plane, width, height, minimum, y0 = 0) {
  if (!captureWeighted(null, null, plane, width, height, 0, undefined, null, null, true, y0)) throw kernelFail();
  try {
    const n = width * height, ctx = base + n * 12 + (width + 2) * 40;
    reserve(ctx + n);
    return runPieces(base + n * 4, base + n * 8, n, minimum, BANDS, ctx);
  } catch (e) { throw e?.code === 'JXL_MEMORY' ? e : kernelFail(e); }
}

export function captureWeightedLanes(planes, width, height, minimum, small, gradient = false, answers = null) {
  const n = width * height, lanes = planes.length;
  if (lanes < 1 || lanes > 4 || width < 1 || height < 1 || width > 16384 || n > 1 << 20 || planes.some(p => !(p instanceof I16) || p.length < n)) outside();
  return run(() => {
    const written = lanes === 4 ? 4 : 3, st = base, pl = st + (width + 2) * 160, res = pl + n * 8,
      prop = res + n * 4 * written, ctx = prop + n * 4 * written, end = (ctx + n + 19 & ~3) + (WEIGHTED_BANDS.length + 1) * (small + 1) * 4 + n * 4;
    if (end > MEMORY_BYTES) return null;
    reserve(end);
    if (!(typeof __RAPIER_JXL_CAPTURE_LEAN__ !== 'undefined' && __RAPIER_JXL_CAPTURE_LEAN__ === true) && answers) answers.forEach((a, c) => {
      u32.set(a.residuals.subarray(0, n), (res >> 2) + c * n);
      i32.set(a.properties.subarray(0, n), (prop >> 2) + c * n);
    });
    else {
      u8.fill(0, st, st + (width + 2) * 160);
      for (let c = 0; c < lanes; c++) i16.set(planes[c].subarray(0, n), (res >> 1) + c * n);
      engine.interleave4(res, n, (1 << lanes) - 1, pl);
      if (gradient) engine.gradient4(pl, width, height, written, res, prop);
      else engine.weighted4(pl, width, height, written, res, prop, DIV, WEIGHTS, st);
    }
    return planes.map((_, c) => runPieces(res + c * n * 4, prop + c * n * 4, n, minimum, gradient ? CONTEXTS : BANDS, ctx));
  });
}

export function captureLowestInk(words, width, height, background, stride = width, origin = 0) {
  if (!(words instanceof U32) || width < 1 || width > 32767 || height < 1 || height > 32767 || stride < width || origin < 0 ||
      origin + (height - 1) * stride + width > words.length) outside();
  requireCaptureKernels(); ready();
  const at = heldAt(words.subarray(origin, origin + (height - 1) * stride + width)), rows = at < 0 ? Math.min(height, SCAN_WORDS / width | 0) : height;
  return call(k => (lowest, open, px) => {
    for (let end = height, count = width; end && count;) {
      const s = Math.max(0, end - rows);
      if (at < 0) rows2d(u32, words, stride, origin, s, width, end - s, 1, px >> 2);
      count = k.lowestInk(at < 0 ? px : at + s * stride * 4, width, at < 0 ? width : stride, end - s, s, background, open, count, lowest);
      end = s;
    }
  }, [made(I32, width, to => to.fill(-1), width), made(I32, width, to => to.fill(-1)), room(at < 0 ? rows * width * 4 : 0)])[1];
}

const heldSpan = (words, w, h, stride, origin) => w >= 1 && h >= 1 && stride >= w && origin >= 0
  ? heldAt(words.subarray(origin, origin + (h - 1) * stride + w)) : -1;
export function captureCropEdges(words, width, height, stride = width, origin = 0) {
  const at = heldSpan(words, width, height, stride, origin);
  if (at < 0) return undefined;
  const edges = callOr(k => k.edges, [at, width, height, stride, out(I32, 4)])?.[1];
  return edges && (edges[0] === width * height ? null : Array.from(edges));
}
export function captureRowsUnlike(words, width, height, stride, origin) {
  const at = heldSpan(words, width, height, stride, origin);
  return at < 0 ? undefined : callOr(k => k.rowInk, [at, width, height, stride, out(I32, height)])?.[1];
}
export function captureColumnsUnlike(words, width, height, stride, origin, y0, y1, key) {
  const at = heldSpan(words, width, height, stride, origin);
  return at < 0 || !(y0 >= 0 && y0 <= y1 && y1 <= height) ? undefined : callOr(k => k.colInk, [at, width, y0, y1, stride, key, out(I32, width)])?.[1];
}

export function captureScanColours(rgba, width, height, limit) {
  if (!isRgba(rgba) || width < 1 || height < 1 || rgba.length < width * height * 4 || limit < 1 || limit > 16384 || !prepareCaptureKernels()) return undefined;
  const size = pow2(limit * 2, 1024), total = width * height, rowMode = width <= SCAN_WORDS;
  const w = rowMode ? width : Math.min(total, SCAN_WORDS), h = rowMode ? height : 1;
  const maxBand = rowMode ? Math.min(h, SCAN_WORDS / w | 0) : 1, first = rowMode ? Math.min(h, Math.max(1, 65536 / w | 0)) : Math.min(total, 65536);
  return callOr(k => (keys, colours, staged, indices) => {
    let count = 0;
    for (let pos = 0, lim = rowMode ? h : total, mul = rowMode ? w * 4 : 4; pos < lim;) {
      const step = pos === 0 ? first : Math.min(rowMode ? maxBand : SCAN_WORDS, lim - pos);
      u8.set(rgba.subarray(pos * mul, (pos + step) * mul), staged);
      if ((count = k.scan(staged, rowMode ? w : step, 0, rowMode ? w : step, rowMode ? step : 1, limit, 0, keys, keys + size * 4, size - 1, Math.clz32(size) + 1, colours, indices, 0, 0, count, rowMode ? pos : 0)) < 0) return null;
      pos += step;
    }
    return u32s(colours, count);
  }, [room(size * 6, 1), room(limit * 4), room(w * maxBand * 4), room(w * maxBand * 2 + 3 & ~3)])?.[0];
}

export function captureScan(words, stride, x0, y0, w, h, limit, rows, blank = null) {
  if (!(words instanceof U32) || w < 1 || h < 1 || x0 < 0 || y0 < 0 || x0 + w > stride || (y0 + h) * stride > words.length ||
      limit < 1 || limit > 16384 || !prepareCaptureKernels()) return undefined;
  const size = pow2(limit * 2, 1024), rowsAt = blank ? -1 : heldAt(words.subarray(y0 * stride, (y0 + h) * stride)),
    across = rowsAt < 0 ? Math.min(w, SCAN_WORDS) : stride, bandRows = Math.min(h, Math.max(1, SCAN_WORDS / across | 0)), n = w * h;
  return callOr(k => (keys, colours, first, last, staged, indices) => {
    const at = rowsAt < 0 ? staged : rowsAt;
    let plane, count = 0;
    for (let y = 0; y < h; y += bandRows) {
      const bh = Math.min(bandRows, h - y);
      for (let x = 0; x < w; x += across) {
        const bw = Math.min(across, w - x), left = x0 + x, top = y0 + y;
        if (rowsAt < 0) {
          rows2d(u32, words, stride, left, top, bw, bh, 1, at >> 2);
          if (blank) for (const r of blank) for (let ry = Math.max(r.y, top); ry < Math.min(r.y + r.height, top + bh); ry++) {
            const a = Math.max(r.x, left), b = Math.min(r.x + r.width, left + bw);
            if (a < b) u32.fill(r.fill, (at >> 2) + (ry - top) * bw + a - left, (at >> 2) + (ry - top) * bw + b - left);
          }
        }
        if ((count = k.scan(rowsAt < 0 ? at : at + y * stride * 4, rowsAt < 0 ? bw : stride, rowsAt < 0 ? 0 : left, bw, bh, limit, rows ? 1 : 0,
          keys, keys + size * 4, size - 1, Math.clz32(size) + 1, colours, indices, first, last, count, y)) < 0) return null;
        plane ??= rows && n <= SCAN_WORDS ? ((pageIndices?.length >= n ? pageIndices : (pageIndices = new U16(Math.max(n, 1 << 20)))).subarray(0, n)) : new U16(n);
        plane.set(u16.subarray(indices >> 1, (indices >> 1) + bw * bh), y * w + x);
      }
    }
    return {colours: u32s(colours, count), indices: plane, first: rows ? i32s(first, count) : undefined, last: rows ? i32s(last, count) : undefined};
  }, [room(size * 6, 1), room(limit * 4), room(limit * 4), room(limit * 4), room(rowsAt < 0 ? across * bandRows * 4 : 0), room(Math.min(w, across) * bandRows * 2 + 3 & ~3)])?.[0];
}

export function captureTextDelta(colours, indices, stride, x, y, width, height) {
  const n = width * height, origin = y * stride + x;
  if (colours.length < 1 || colours.length > 16384 || stride < width || width < 1 || height < 1 || n > 1 << 22 || origin < 0 || origin + (height - 1) * stride + width > indices.length) return null;
  const [count, out16, deltas, stats] = callOr(k => k.textDelta, [into(U32, colours), colours.length, into(U16, indices), stride, width, height, origin,
    out(U16, n), room(524288), 65535, outUpTo(I16, 49152, c => c * 3), out(U32, 4), 16384]) ?? [0];
  return count < 1 ? null : {indices: out16, deltas, count, novel: stats[1], l1: stats[2], hits: stats[3]};
}

export const treeArena = (count, span, props = 4, {w = 0, h = 0, colours = 0} = {}) => (count < 1 || count > 1 << 20 || span < 128 || span > 65536 ||
  props < 1 || props > 8 || !(w * h <= 1 << 20) || !(colours <= 65536)) ? outside() : run(() => {
  const [all, counts, order, scratch, tokens, bins, nlog, low, used, perProp, ctx, contexts, records, samples, vals, dists, remapAt, yBins, xBins, binOfAt, end] =
    lay(base, [512, span * props * 4, count * 4, count * 4, count, props * count, count * 4 + 4, 512, 128, 32, 128, count, 32768, w * h * 2, count * 4, count * 4, colours * 4, h, w, colours]);
  reserve(end);
  return {
    bin(source, stride, origin, pVal, pDist, minimum, yBin, xBin, binOf, remap) {
      ready();
      rows2d(u16, source, stride, origin, 0, w, h, 1, samples >> 1);
      set32(pVal, vals, count); set32(pDist, dists, count);
      u8.set(yBin, yBins); u8.set(xBin, xBins); u8.set(binOf, binOfAt);
      if (props > 4) set32(remap, remapAt, colours);
      if (engine.pieceBins(samples, w, vals, dists, count, minimum, yBins, xBins, binOfAt, remapAt, colours, tokens, bins, order, props) < 0)
        throw fault('JXL_INTERNAL', 'capture-kernels:palette-index');
    },
    learn(cuts, split, min, most, context) {
      if (cuts.length !== props || !(context instanceof U8) || context.length < count || most < 1 || most > 4096) outside();
      ready();
      i32.set(cuts.map(c => c.length + 1), perProp >> 2);
      engine.treeNlog(nlog, count, LOG);
      i32.set([order, tokens, bins, count, props, span, all, counts, low, used, nlog, perProp, 32 * split, min, most, contexts, records, 0, 0, 0, scratch, 0], ctx >> 2);
      engine.treeLearn(ctx);
      context.set(u8.subarray(contexts, contexts + count));
      return i32s(records, i32[(ctx >> 2) + 19] * 2);
    },
  };
});

export function captureLiterals(models, n, remap) {
  if (n < 1 || n > 65536 || remap && !(remap instanceof I32 && remap.length >= n)) outside();
  let most = 1;
  for (const {count, pieceValue: v, pieceDistance: d} of models) {
    if (!(v instanceof I32) || !(d instanceof I32) || count < 1 || count > 1 << 20 || v.length < count || d.length < count) outside();
    most = Math.max(most, count);
  }
  return call(k => (table, vals, dists) => {
    for (const m of models) {
      const c = m.count;
      set32(m.pieceValue, vals, c); set32(m.pieceDistance, dists, c);
      k.literals(vals, dists, c, table, remap ? 1 : 0);
      if (remap) m.pieceValue.set(i32.subarray(vals >> 2, (vals >> 2) + c));
    }
  }, [made(U32, n, to => remap ? to.set(remap.subarray(0, n)) : to.fill(0), remap ? null : n), room(most * 4), room(most * 4)])[1];
}

export function capturePieceCounts({count, classes, pieceValue: pv, pieceDistance: pd, pieceContext: pc}, small, key) {
  if (count < 1 || count > 1 << 20 || classes < 1 || classes > 4096 || !(pv instanceof I32) || !(pd instanceof I32) || !(pc instanceof U8) ||
      pv.length < count || pd.length < count || pc.length < count || small < 1 || small > 4096 || classes * small > 1 << 21) outside();
  let copies = 0;
  for (let i = 0; i < count; i++) if (pd[i]) copies++;
  const [, counts, larges, lengths, distances] = call(k => (vals, dists, ctxs, table, lg, len, ds, st) =>
    (k.pieces(vals, dists, ctxs, count, small, table, table + classes * small * 4, table + classes * (small + 1) * 4, key, lg, len, ds, st), [i32[st >> 2], i32[(st >> 2) + 1]]),
    [pv.subarray(0, count), pd.subarray(0, count), pc.subarray(0, count), out(U32, classes * (small + 2), 1),
      outUpTo(U32, count, n => n[0]), outUpTo(U32, copies, n => n[1]), outUpTo(U32, copies, n => n[1]), room(8)]);
  return {counts, literals: counts.subarray(classes * small, classes * (small + 1)), copies: counts.subarray(classes * (small + 1)), larges, lengths, distances};
}

const TOKEN_OUT = 1 << 18;
export function captureTokens(writer, models, index, codes, configs, fastBits, fastLen, copy) {
  const hn = codes.length, syms = new I32(hn);
  let symbols = 0, largest = 1;
  for (let h = 0; h < hn; h++) { syms[h] = symbols; symbols += codes[h].lengths.length; }
  for (const m of models) largest = Math.max(largest, m.count);
  const sLen = copy ? copy.sCodes.length : 0, dSyms = copy ? copy.code.lengths.length : 0;
  inSpace([room(16), room(1024), syms, configRows(configs, hn), copy ? config(copy.lengthConfig) : room(16), copy ? config(copy.distanceConfig) : room(16),
    fastBits.subarray(0, hn << 9), fastLen.subarray(0, hn << 9), made(U16, symbols, to => codes.forEach((c, h) => to.set(c.codes, syms[h]))),
    made(U8, symbols, to => codes.forEach((c, h) => to.set(c.lengths, syms[h]))), copy && copy.code.codes.subarray(0, dSyms),
    copy && copy.code.lengths.subarray(0, dSyms), sLen && copy.sCodes.subarray(0, sLen), room(largest * 4), room(largest * 4), room(largest), room(TOKEN_OUT + 64)],
    (k, [st, hmap, symsAt, cfg, lCfg, dCfg, fast, fastL, cTab, cLen, dCod, dLen, sCod, vals, dists, ctxs, outAt]) => {
      stateIn(st, writer);
      for (const m of models) {
        const c = m.count;
        for (let i = 0; i < m.classes; i++) i32[(hmap >> 2) + i] = index[m.base + i];
        set32(m.pieceValue, vals, c); set32(m.pieceDistance, dists, c); u8.set(m.pieceContext.subarray(0, c), ctxs);
        for (let q = 0; q < c;) {
          q = k.captureTokens(vals, dists, ctxs, q, c, hmap, fast, fastL, symsAt, cTab, cLen, cfg, lCfg, dCfg, dCod, dLen, copy ? copy.minSymbol : 0, copy?.spatial ? 1 : 0, sLen, sCod, outAt, outAt + TOKEN_OUT, st);
          drainBits(writer, u8, outAt, i32[(st >> 2) + 3] - outAt, undefined, 0, 16);
        }
      }
      stateOut(st, writer);
    });
}

const PATCH_RUNS = 1 << 17, PATCH_BAND = 1 << 22, PEEL_MARKS = 1 << 18, PEEL_RUNS = 1 << 20;
export function capturePatchMarks(words, width, height, side, limit, least) {
  if (!prepareCaptureKernels()) return null;
  const n = width * height, at = heldAt(words), band = at < 0 ? Math.max(1, Math.min(height, PATCH_BAND / (4 * width) | 0)) : height;
  return callOr(k => (ink, above, stack, boxes, rows) => {
    if (at >= 0) k.patchInk(at, width, height, 0, height, ink, above);
    else for (let y = 0; y < height; y += band) {
      const from = Math.max(0, y - 1), to = Math.min(height, y + band + 1);
      u32.set(words.subarray(from * width, to * width), rows >> 2);
      k.patchInk(rows + (y - from) * width * 4, width, Math.min(band, height - y), y, height, ink + y * width, above);
    }
    const found = k.patchMarks(ink, width, height, stack, PATCH_RUNS, boxes, limit, side, least);
    return found < 0 ? null : i32s(boxes, found * 4);
  }, [room(n, 1), made(I32, width, to => to.fill(-1)), room(PATCH_RUNS * 12), room(limit * 16), room(at < 0 ? (band + 2) * width * 4 : 0)])?.[0] ?? null;
}

export function capturePeelMarks(words, width, height, bg, side) {
  if (!prepareCaptureKernels()) return null;
  const n = width * height, at = heldAt(words), band = at < 0 ? Math.max(1, Math.min(height, PATCH_BAND / (4 * width) | 0)) : height;
  return callOr(k => (ink, stack, runs, marks, rows) => {
    if (at >= 0) k.peelInk(at, n, bg, ink);
    else for (let y = 0; y < height; y += band) {
      const cnt = Math.min(band, height - y) * width;
      u32.set(words.subarray(y * width, y * width + cnt), rows >> 2);
      k.peelInk(rows, cnt, bg, ink + y * width);
    }
    const found = k.peelMarks(ink, width, height, stack, PATCH_RUNS, runs, PEEL_RUNS, marks, PEEL_MARKS, side);
    if (found < 0) return null;
    const list = i32s(marks, found * 6);
    return {marks: list, runs: i32s(runs, found ? list[found * 6 - 1] : 0)};
  }, [room(n), room(PATCH_RUNS * 12), room(PEEL_RUNS * 12), room(PEEL_MARKS * 24), room(at < 0 ? band * width * 4 : 0)])?.[0] ?? null;
}

export function capturePeelBackground(words) {
  const n = words.length, samples = Math.ceil(n / 61), cap = pow2(samples * 2), at = heldAt(words), band = Math.min(n, SCAN_WORDS);
  return inSpace([room(cap * 8, 1), room(samples * 4), room(16, 1), room(at < 0 ? band * 4 : 0)], (k, [table, order, st, input]) => {
    let bg = 0;
    for (let off = 0; off < n; off += band) {
      const sz = Math.min(band, n - off);
      if (at < 0) u32.set(words.subarray(off, off + sz), input >> 2);
      bg = k.peelBackground(at < 0 ? input : at + off * 4, sz, off, table, cap - 1, order, st, off + sz === n);
    }
    return bg >>> 0;
  });
}

export function capturePeelTools(bg) {
  requireCaptureKernels(); ready();
  const id = bg === 0xffffffff ? 0xffffffff : 0;
  let scratch = base, tpl = null;
  const arena = sizes => { ready(); const p = lay(scratch, sizes); reserve(p.at(-1)); return p; };
  return {
    cells(words, width, m, runs) {
      const sz = m.w * m.h, cnt = m.end - m.start, [inp, sel, outAt, tab] = arena([sz * 4, cnt * 4, sz * 4, 262144]);
      rows2d(u32, words, width, m.x, m.y, m.w, m.h, 1, inp >> 2);
      i32.set(runs.subarray(m.start, m.end), sel >> 2);
      const px = engine.peelCellData(inp, m.w, m.h, m.x, m.y, bg, sel, cnt / 3, outAt, tab);
      return px < 0 ? null : {cells: u32s(outAt, sz), pixels: px};
    },
    info(cells, w, h, ink = false) {
      const [inp, outAt, trip] = arena([cells.byteLength, 16, ink ? cells.length * 12 : 0]);
      u32.set(cells, inp >> 2);
      const cnt = engine.peelGlyphs(inp, w, h, id, ink ? trip : 0, outAt);
      return {hash: i32[outAt >> 2], inkCount: cnt, ink: ink ? i32s(trip, cnt * 3) : null};
    },
    equal(a, b) {
      if (a.length !== b.length) return false;
      const [p, q] = arena([a.byteLength, b.byteLength]);
      u32.set(a, p >> 2); u32.set(b, q >> 2);
      return Boolean(engine.peelEqual(p, q, a.length));
    },
    templates(list) {
      const cap = pow2(list.length * 2), bytes = list.reduce((s, t) => s + t.ink.byteLength, 0);
      const res = align16(scratch) + list.length * 32 + cap * 16 + bytes + 131104 <= MEMORY_BYTES;
      const [rec, tab, ink, end] = arena([list.length * 32, cap * 16, res ? bytes : Math.max(0, ...list.map(t => t.ink.byteLength))]);
      let at = ink;
      list.forEach((t, i) => {
        const a = t.ink.length - 3;
        i32.set([t.w, t.h, res ? at : 0, t.ink.length / 3, t.ink[a], t.ink[a + 1], t.ink[a + 2], 0], (rec >> 2) + i * 8);
        if (res) { set32(t.ink, at); at += t.ink.byteLength; }
      });
      engine.peelTemplates(rec, list.length, tab, cap - 1);
      tpl = {rec, tab, mask: cap - 1, ink, list}; scratch = end;
    },
    factor(g) {
      const [inp, outAt, bnd, st] = arena([g.cells.byteLength, (g.cells.length / 12 | 0) * 12, 16, 16]);
      u32.set(g.cells, inp >> 2); i32.fill(0, st >> 2, (st >> 2) + 4);
      for (let loaded = 0, next; (next = engine.peelFactor(inp, g.w, g.h, id, tpl.rec, tpl.tab, tpl.mask, outAt, bnd, st, loaded, tpl.ink)); loaded = next)
        set32(tpl.list[next - 1].ink, tpl.ink);
      const matches = i32s(outAt, i32[(st >> 2) + 2] * 3), [x, y, x1, y1] = i32.subarray(bnd >> 2, (bnd >> 2) + 4);
      if (x1 < 0) return {matches};
      const width = x1 - x + 1, height = y1 - y + 1, cells = new U32(width * height);
      rows2d(cells, u32.subarray(inp >> 2, (inp >> 2) + g.cells.length), g.w, x, y, width, height);
      return {matches, cells, width, height, x, y};
    },
    contain(groups) {
      scratch = base; tpl = null;
      const space = (cnt, cells, ink) => { const cap = pow2(ink * 2); return {cap, end: scratch + cnt * 16 + cells * 4 + cap * 16 + ink * 12 + 65548}; };
      for (let first = 0; first < groups.length;) {
        let last = first + 1, cells = groups[first].cells.length, ink = groups[first].inkCount, lo = space(1, cells, ink);
        while (last < groups.length) {
          const g = groups[last], next = space(last - first + 1, cells + g.cells.length, ink + g.inkCount);
          if (next.end > MEMORY_BYTES) break;
          cells += g.cells.length; ink += g.inkCount; lo = next; last++;
        }
        const [rec, inp, tab, nodes, tgt, outAt] = arena([(last - first) * 16, cells * 4, lo.cap * 16, ink * 12, 65536, 16]);
        let at = inp, maxA = 0, maxW = 0, maxH = 0;
        for (let i = first; i < last; i++) {
          const g = groups[i];
          u32.set([g.w, g.h, at, g.cells.length], (rec >> 2) + (i - first) * 4);
          u32.set(g.cells, at >> 2); at += g.cells.byteLength;
          maxA = Math.max(maxA, g.cells.length); maxW = Math.max(maxW, g.w); maxH = Math.max(maxH, g.h);
        }
        engine.peelContainIndex(rec, last - first, id, tab, lo.cap - 1, nodes);
        for (let i = 0; i < groups.length; i++) {
          const t = groups[i];
          if (t.in || t.cells.length >= maxA || t.w > maxW || t.h > maxH) continue;
          const ptr = i >= first && i < last ? u32[(rec >> 2) + (i - first) * 4 + 2] : (u32.set(t.cells, tgt >> 2), tgt);
          if (engine.peelContain(ptr, t.w, t.h, id, rec, tab, lo.cap - 1, nodes, outAt)) {
            const bi = outAt >> 2; t.in = groups[first + i32[bi] - 1]; t.ox = i32[bi + 1]; t.oy = i32[bi + 2];
          }
        }
        first = last;
      }
    },
    body(words, width, height, marks, runs) {
      const cnt = marks.reduce((s, m) => s + m.end - m.start, 0), band = Math.max(1, Math.min(height, PATCH_BAND / (4 * width) | 0));
      const [sel, inp] = arena([cnt * 4, band * width * 4]), outBody = new U32(words.length);
      outBody.set(words.subarray(width * height), width * height);
      let next = sel >> 2;
      for (const m of marks) { i32.set(runs.subarray(m.start, m.end), next); next += m.end - m.start; }
      for (let y = 0; y < height; y += band) {
        const rows = Math.min(band, height - y), sz = rows * width;
        u32.set(words.subarray(y * width, y * width + sz), inp >> 2);
        engine.peelBody(inp, width, y, rows, sel, cnt / 3, bg);
        outBody.set(u32.subarray(inp >> 2, (inp >> 2) + sz), y * width);
      }
      return outBody;
    },
  };
}

export function captureResiduals(plane, width, height, residuals, properties) {
  if (!captureWeighted(null, null, plane, width, height, 0, undefined, residuals, properties)) throw kernelFail();
}

export function capturePlaneHash(plane) {
  const jpeg = typeof __RAPIER_JXL_JPEG__ !== 'undefined' && __RAPIER_JXL_JPEG__;
  return (!jpeg && !(plane instanceof I16)
    ? callFit(k => k.treeNumbersHash, [into(F64, plane), plane.length, out(U32, 2)], true)[1]
    : callFit(k => k.treePlaneHash, [into(I16, plane), plane.length, out(U32, 4)], true)[1]).join(':');
}

export function capturePlanesEqual(a, b) {
  const n = a.length;
  if (n !== b.length) return false;
  if ((typeof __RAPIER_JXL_JPEG__ === 'undefined' || !__RAPIER_JXL_JPEG__) && (!(a instanceof I16) || !(b instanceof I16)))
    return Boolean(callFit(k => k.treeNumbersEqual, [into(F64, a), into(F64, b), n], true)[0]);
  if (n & 1 && a[n - 1] !== b[n - 1]) return false;
  const words = n >> 1;
  return !words || Boolean(callFit(k => k.peelEqual, [new U8(a.buffer, a.byteOffset, words * 4), new U8(b.buffer, b.byteOffset, words * 4), words], true)[0]);
}

function treeQuantiles(k, vals, len, bins, counts, span, map, cuts, idx) {
  const sz = k.treeQuantize(vals, len, bins, counts, span, map, cuts, idx), b = k.memory.buffer;
  return {cuts: Array.from(new I32(b, cuts, sz)), indices: idx ? copyOut(U8, b, idx, len) : null};
}

export function captureQuantize(values, bins, weightedCuts = false) {
  const m = values.length;
  if (!m) return {cuts: [], indices: weightedCuts ? null : new U8(0)};
  const maxSpan = Math.min(65536, Math.max(256, m * 4));
  return spaceFit([into(I32, values), room(bins * 4), weightedCuts ? 0 : room(m), room(Math.max(m, maxSpan) * 4), weightedCuts ? 0 : room(maxSpan)],
    (k, [vals, cuts, idx, counts, map]) => treeQuantiles(k, vals, m, bins, counts, maxSpan, map, cuts, idx));
}

export function captureTreeSample(plane, width, height, positions, properties, predictors, residuals, wp, references, bins = 0) {
  const m = positions.length, P0 = properties.length, K = predictors.length, R = references.length;
  requireCaptureKernels(); ready();
  const perRow = width * (10 + 2 * R), halo = width * (4 + 2 * R) + 16 * (R + 6), strideOf = cap => cap + 16;
  const startOf = cap => align16(base) + align16(cap * 4) + align16(Math.max(1, P0) * 4) + align16(Math.max(1, K) * 4) +
    align16(Math.max(1, P0 * strideOf(cap) * 4)) + align16(Math.max(1, K * strideOf(cap)));
  const qHead = align16(bins * 4) + align16(m) + 64, qBytes = qHead + Math.max(327680, m * 4);
  const layout = budget => {
    let cap = bins > 0 && m <= 262144 ? m : Math.min(m, 131072);
    const rowsFor = c => Math.min(height, (budget - startOf(c) - halo) / perRow | 0);
    if (cap > 131072 && rowsFor(cap) < Math.min(height, 64)) cap = 131072;
    if (cap > 65536 && rowsFor(cap) < Math.min(height, 64)) cap = 65536;
    while (cap > 1 && rowsFor(cap) < 1) cap = Math.ceil(cap / 2);
    const s = startOf(cap), rows = rowsFor(cap);
    if (rows < 1) return null;
    const single = bins > 0 && cap === m && P0 > 0 && s + qBytes <= budget;
    const win = align16((2 + rows) * width * 2) + align16(R * (1 + rows) * width * 2) + rows * width * 8 + 16;
    const room16 = Math.max(win, single ? Math.min(budget - s, Math.max(qBytes, qHead + Math.max(256, m * 4) * 5)) : 0);
    return {cap, rows, single, room16, end: s + room16};
  };
  let plan = layout(MEMORY_BYTES);
  if (!plan) throw fault('JXL_MEMORY', 'capture tree sample: row too wide');
  if (!tryGrowArena(plan.end)) { growArena(startOf(Math.min(m, 1)) + halo + perRow); sync(); plan = layout(buf.byteLength); }
  const {cap, rows, single, room16} = plan;
  const cols = single ? null : Array.from({length: P0}, (_, p) => ({property: properties[p], values: new I32(m)}));
  const quant = single ? new Array(P0) : null, symsOut = Array.from({length: K}, () => new U8(m));
  inSpace([room(cap * 4), P0 ? properties : new I32(1), K ? predictors : new I32(1), room(Math.max(1, P0 * strideOf(cap) * 4)), room(Math.max(1, K * strideOf(cap))), room(room16)],
    (k, [posAt, propsAt, predsAt, valsAt, symsAt, winAt]) => {
      let loadedAll = false;
      for (let b0 = 0; b0 < m; b0 += cap) {
        const b1 = Math.min(m, b0 + cap), bm = b1 - b0, cs = strideOf(bm);
        u32.set(positions.subarray(b0, b1), posAt >> 2);
        for (let s0 = 0; s0 < bm;) {
          const y0 = rows === height ? 0 : positions[b0 + s0] / width | 0, y1 = Math.min(height, y0 + rows), endPos = y1 * width;
          let s1 = rows === height ? bm : s0 + 1;
          while (s1 < bm && positions[b0 + s1] < endPos) s1++;
          const cnt = (y1 - y0) * width, ab = Math.min(y0, 2), rab = Math.min(y0, 1), span = (rab + y1 - y0) * width;
          const refAt = winAt + align16((ab + y1 - y0) * width * 2), resAt = refAt + align16(R * span * 2), wpAt = resAt + cnt * 4;
          if (!loadedAll) {
            i16.set(plane.subarray((y0 - ab) * width, y1 * width), winAt >> 1);
            for (let q = 0; q < R; q++) i16.set(references[q].subarray((y0 - rab) * width, y1 * width), (refAt >> 1) + q * span);
            u32.set(residuals.subarray(y0 * width, y1 * width), resAt >> 2);
            i32.set(wp.subarray(y0 * width, y1 * width), wpAt >> 2);
            if (rows === height) loadedAll = true;
          }
          k.treeSample(winAt + ab * width * 2, width, y0, posAt, s0, s1, cs, resAt, wpAt, refAt + rab * width * 2, span, propsAt, P0, predsAt, K, valsAt, symsAt);
          s0 = s1;
        }
        for (let c = 0; c < K; c++) symsOut[c].set(u8.subarray(symsAt + c * cs, symsAt + c * cs + bm), b0);
        if (!single) for (let p = 0; p < P0; p++) cols[p].values.set(i32.subarray((valsAt >> 2) + p * cs, (valsAt >> 2) + p * cs + bm), b0);
      }
      if (single) {
        const idxAt = winAt + align16(bins * 4), cntAt = idxAt + align16(m), maxS = (winAt + room16 - cntAt - 16) / 5 & ~15;
        for (let p = 0; p < P0; p++) quant[p] = {property: properties[p], ...treeQuantiles(k, valsAt + p * strideOf(m) * 4, m, bins, cntAt, maxS, cntAt + maxS * 4, winAt, idxAt)};
      }
    });
  if (bins > 0 && !single) return {quantized: cols.map(c => ({property: c.property, ...captureQuantize(c.values, bins)})), symbolSets: symsOut};
  return single ? {quantized: quant, symbolSets: symsOut} : {columns: cols, symbolSets: symsOut};
}

const sixteen = a => a instanceof I16 || a.every(v => v >= -32768 && v <= 32767);
function treeWalkCheck(plane, width, height, residuals, wp, references) {
  const n = width * height;
  if (!(width >= 1 && height >= 1 && plane.length >= n && residuals.length >= n && wp.length >= n &&
    references.every(r => r.length >= n) && sixteen(plane) && references.every(sixteen))) outside();
  requireCaptureKernels(); ready();
}
function stageTreeBand(b, winAt, plane, width, y0, y1, residuals, wp, references) {
  const s16 = new I16(b), s32 = new I32(b), su32 = new U32(b);
  const R = references.length, br = y1 - y0, m = br * width, ab = Math.min(y0, 2), rab = Math.min(y0, 1), span = (rab + br) * width;
  const refsAt = winAt + align16((ab + br) * width * 2), resAt = refsAt + align16(R * span * 2), propsAt = resAt + align16(m * 4), tail = propsAt + align16(m * 4);
  s16.set(plane.subarray((y0 - ab) * width, y1 * width), winAt >> 1);
  for (let q = 0; q < R; q++) s16.set(references[q].subarray((y0 - rab) * width, y1 * width), (refsAt >> 1) + q * span);
  su32.set(residuals.subarray(y0 * width, y1 * width), resAt >> 2);
  s32.set(wp.subarray(y0 * width, y1 * width), propsAt >> 2);
  return [winAt + ab * width * 2, br, m, resAt, propsAt, refsAt + rab * width * 2, span, tail];
}

export function captureTreeWalk(nodes, plane, width, height, residuals, wp, references) {
  treeWalkCheck(plane, width, height, residuals, wp, references);
  const n = width * height, R = references.length, start = base + align16(nodes.length * 4) + 64;
  const perRow = width * (15 + 2 * R), halo = width * (4 + 2 * R) + 16 * (R + 8);
  const have = Math.min(MEMORY_BYTES, Math.max(buf.byteLength, start + halo + perRow * 128));
  const rows = Math.min(height, (have - start - halo) / perRow | 0);
  if (rows < 1) throw kernelFail();
  const values = new I32(n), contexts = new U8(n), maxM = rows * width;
  const winBytes = align16((2 + rows) * width * 2) + align16(R * (1 + rows) * width * 2) + 3 * align16(maxM * 4) + align16(maxM) + 64;
  inSpace([into(I32, nodes), room(64), room(winBytes)], (k, [tree, scratch, winAt]) => {
    for (let y0 = 0; y0 < height; y0 += rows) {
      const [pPtr, br, m, resAt, propsAt, rPtr, span, codedAt] = stageTreeBand(buf, winAt, plane, width, y0, Math.min(height, y0 + rows), residuals, wp, references);
      const ctxAt = codedAt + align16(m * 4);
      k.treeWalk(pPtr, width, y0, br, tree, resAt, propsAt, rPtr, span, codedAt, ctxAt, scratch);
      values.set(i32.subarray(codedAt >> 2, (codedAt >> 2) + m), y0 * width);
      contexts.set(u8.subarray(ctxAt, ctxAt + m), y0 * width);
    }
  });
  return {values, contexts};
}

export function captureTreeWalkHist(nodes, numLeaves, plane, width, height, residuals, wp, references, hSmall, hLarge) {
  if (numLeaves < 1 || numLeaves > 65536 || hSmall.length < numLeaves * 256) outside();
  treeWalkCheck(plane, width, height, residuals, wp, references);
  const R = references.length, rows = Math.min(height, Math.max(16, Math.min(256, (8 << 20) / Math.max(1, width * (18 + 2 * R)) | 0)));
  const maxM = rows * width, winBytes = align16((2 + rows) * width * 2) + align16(R * (1 + rows) * width * 2) + 2 * align16(maxM * 4) + align16(maxM * 8) + 64;
  spaceFit([into(I32, nodes), room(64), both(U32, hSmall, numLeaves * 256), room(winBytes)], (k, [tree, scratch, histsAt, winAt], b) => {
    const s32 = new I32(b), su32 = new U32(b);
    for (let y0 = 0; y0 < height; y0 += rows) {
      const [pPtr, br, , resAt, propsAt, rPtr, span, overAt] = stageTreeBand(b, winAt, plane, width, y0, Math.min(height, y0 + rows), residuals, wp, references);
      const over = k.treeWalkHist16(pPtr, width, y0, br, tree, resAt, propsAt, rPtr, span, histsAt, overAt, scratch);
      for (let j = 0, p = overAt >> 2; j < over * 2; j += 2) { const mp = hLarge[s32[p + j]], rv = su32[p + j + 1]; mp.set(rv, (mp.get(rv) ?? 0) + 1); }
    }
    hSmall.set(su32.subarray(histsAt >> 2, (histsAt >> 2) + numLeaves * 256));
  });
}

export function captureDenseTiles(words, stride, x, y, width, height) {
  if (!(words instanceof U32) || x < 0 || y < 0 || width < 1 || height < 1 ||
      width > 32767 || height > 32767 || x + width > stride || (y + height - 1) * stride + x + width > words.length) outside();
  requireCaptureKernels(); ready();
  const tx = Math.ceil(width / 16), mask = new U8(tx * Math.ceil(height / 16)), h = heldAt(words);
  return inSpace([room(h >= 0 ? 0 : 17 * width * 4), room(tx)], (k, [px, outAt]) => {
    for (let by = 0; by * 16 < height; by++) {
      const s = Math.max(0, by * 16 - 1), e = Math.min(height, (by + 1) * 16);
      if (h < 0) rows2d(u32, words, stride, x, y + s, width, e - s, 1, px >> 2);
      k.denseTiles(h >= 0 ? h + ((y + s) * stride + x) * 4 : px, h >= 0 ? stride : width, width, e - s, outAt);
      mask.set(u8.subarray(outAt, outAt + tx), by * tx);
    }
    return mask;
  });
}

export function captureCutHistogram(cuts, residuals, properties) {
  const n = residuals.length, c = cuts.length + 1;
  if (!(residuals instanceof U32) || !(properties instanceof I32) || properties.length !== n || c > 64) outside();
  requireCaptureKernels(); ready();
  if (base + n * 8 + 256 + c * 200 > MEMORY_BYTES) outside();
  const [, hist, raw] = call(k => k.cutHistogram, [residuals, properties, n, into(I32, cuts), cuts.length, out(U32, c * 48), out(F64, c)], true);
  return {hist: F64.from(hist), raw: raw.slice()};
}

export function captureSmoothCells(data, exact, width, height) {
  if (!isRgba(data) || !(exact instanceof U8) || width < 1 || height < 1 || data.length < width * height * 4 || exact.length < width * height) outside();
  const cw = Math.ceil(width / 16), grid = new U8(cw * Math.ceil(height / 16));
  return inSpace([room(width * 64), room(width * 16), room(80), room(cw)], (k, [px, mask, seen, outAt]) => {
    for (let cy = 0, y = 0; y < height; cy++, y += 16) {
      const rows = Math.min(16, height - y);
      u8.set(data.subarray(y * width * 4, (y + rows) * width * 4), px);
      u8.set(exact.subarray(y * width, (y + rows) * width), mask);
      k.smoothCells(px, mask, width, rows, outAt, seen);
      grid.set(u8.subarray(outAt, outAt + cw), cy * cw);
    }
    return grid;
  });
}

export function captureMergePhotoHints(rects) {
  const n = rects.length;
  if (n < 2) return rects;
  if (n > 65536) outside();
  const words = new U32(n * 6);
  for (let i = 0; i < n; i++) {
    const r = rects[i], rx = r.x + r.width, by = r.y + r.height;
    if (!([r.x, r.y, rx, by].every(v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff) && rx > r.x && by > r.y)) outside();
    words.set([r.x, r.y, rx, by, r.rescued ? 1 : 0, i], i * 6);
  }
  const [cnt, m] = call(k => k.mergePhotoHints, [words, n, outUpTo(U32, n * 6, c => c * 6)], true), ord = new Array(n);
  for (let i = 0; i < cnt; i++) {
    const a = i * 6, x = m[a], y = m[a + 1], r = {x, y, width: m[a + 2] - x, height: m[a + 3] - y};
    if (m[a + 4]) r.rescued = true;
    ord[m[a + 5]] = r;
  }
  return ord.filter(Boolean);
}

export const captureMaskRuns = (px, w, h) => maskRunsOf(w, h, to => to.set(px));
export const captureRectangleRuns = (words, width, r) => maskRunsOf(r.width, r.height, to => rows2d(to, words, width, r.x, r.y, r.width, r.height));
function maskRunsOf(w, h, write) {
  const n = w * h;
  return spaceFit([made(I32, n, write), room(n, 1), room(n * 4), room((n >> 1) * 12 + 12), room(8)], (k, [words, mark, px, runs, outAt], b) => {
    const cnt = k.maskRuns(words, w, h, mark, px, runs, outAt), list = copyOut(I32, b, runs, cnt * 3);
    const last = cnt ? list[cnt * 3 - 3] + list[cnt * 3 - 2] : 0;
    return {pixels: copyOut(I32, b, px, last), runs: list, transparent: new I32(b, outAt, 1)[0]};
  });
}

export function capturePhotoMasks(words, width, height, regions, found, exactRects) {
  let count = 0, need = 0;
  for (let i = 0; i < regions.length; i++) {
    const n = regions[i].width * regions[i].height, f = found[i];
    count += f.runs.length / 3;
    need = Math.max(need, n * 4 + f.pixels.length * 4 + f.runs.length / 3 * 8 + exactRects.length * 16 + 3 * (n + 8) + 64);
  }
  const cap = pow2(count * 2, 64), rows = Math.max(1, Math.min(height + 1 >> 1, (1 << 22) / (width * 4) | 0));
  const {k, at: {tab, all, after}} = maskArena(s => {
    const all = s + cap * 12, after = all + count * 12 + 7 & ~7;
    return {tab: s, all, after, end: after + Math.max(need, regions.length * 16 + rows * width * 4)};
  });
  try {
    const b = k.memory.buffer, s32 = new I32(b), offs = [];
    for (let i = 0, at = all >> 2; i < regions.length; i++) { offs.push(at << 2); s32.set(found[i].runs, at); at += found[i].runs.length; }
    k.maskColours(tab, cap, all, count);
    if (count) {
      const ord = [...regions].sort((a, b) => a.x - b.x), band = after + ord.length * 16;
      ord.forEach((r, q) => s32.set([r.x, r.y, r.width, r.height], (after >> 2) + q * 4));
      for (let y0 = 0; y0 < height; y0 += rows * 2) {
        const r = Math.min(rows, height - y0 + 1 >> 1);
        for (let q = 0; q < r; q++) s32.set(words.subarray((y0 + 2 * q) * width, (y0 + 2 * q + 1) * width), (band >> 2) + q * width);
        k.maskOutside(tab, cap, band, width, r, y0, after, ord.length);
      }
    }
    return regions.map((r, i) => {
      const {pixels, runs, transparent} = found[i], w = r.width, h = r.height, n = w * h;
      const px = after, pix = px + n * 4, keep = pix + (pixels.length * 4 + 7 & ~7), boxes = keep + runs.length / 3 * 8,
        exact = boxes + exactRects.length * 16, border = exact + (n + 7 & ~7), only = border + (n + 7 & ~7), outAt = only + (n + 7 & ~7);
      rows2d(s32, words, width, r.x, r.y, w, h, 1, px >> 2);
      s32.set(pixels, pix >> 2);
      let rc = 0;
      for (const e of exactRects) {
        const x0 = Math.max(0, e.x - r.x), y0 = Math.max(0, e.y - r.y), x1 = Math.min(w, e.x + e.width - r.x), y1 = Math.min(h, e.y + e.height - r.y);
        if (x1 > x0 && y1 > y0) s32.set([x0, y0, x1, y1], (boxes >> 2) + 4 * rc++);
      }
      k.maskExact(px, w, h, pix, offs[i], runs.length / 3, keep, exact, border, only, boxes, rc, transparent ? 1 : 0, outAt, tab, cap, Math.max(192, n >> 12));
      const bi = outAt >> 2;
      return {exact: copyOut(U8, b, exact, n), list: s32[bi], ring: s32[bi + 1], flat: s32[bi + 2], fill: s32[bi + 3]};
    });
  } catch (e) { fail(e); }
}

export function captureInkKeep(data, width, {x, y, w, h}, ground) {
  const n = w * h, cap = pow2(n + 1, 64);
  const [kept, keep, o] = callFit(k => k.inkKeep, [rect(U8, data, width, x, y, w, h, 4), w, h, into(U8, ground),
    room(n * 4), room(cap * 12), cap, room(n), room(n), room(n), out(U8, n), out(I32, 4)]);
  return kept ? {c: o[0], strong: o[2] === 1, keep} : null;
}

const LOG2_1P = /* @__PURE__ */ F64.from({length: 256}, (_, r) => Math.log2(1 + r));
export function captureInkBits(data, width, {x, y, w, h}, parts) {
  const boxes = new I32(parts.length * 4);
  parts.forEach((r, q) => { const y0 = Math.max(0, r.y - y); boxes.set([r.x - x, y0, r.w, Math.max(0, Math.min(h, r.y - y + r.h) - y0)], q * 4); });
  const [, o] = callFit(k => k.inkBits, [rect(U8, data, width, x, y, w, h, 4), w, h, room(w * h), boxes, parts.length, LOG2_1P, out(I32, 4)], true);
  return {bits: new F64(o.buffer, o.byteOffset, 1)[0], out: o[2], off: o[3]};
}

export function captureBoxLines(data, width, covered, {x: X, y: Y, w, h}) {
  const n = w * h, layout = s => ({rgba: s, cover: s + n * 4, out: s + n * 4 + (n + 7 & ~7), end: s + n * 4 + (n + 7 & ~7) + Math.max(w, h) * 4});
  let k, at, copy = -1, b = null;
  return (x, y, len, rows, cnt) => {
    try {
      if (copy !== boxLinesCopy || k.memory.buffer !== b) {
        ({k, at} = maskArena(layout)); b = k.memory.buffer;
        const bytes = new U8(b);
        rows2d(bytes, data, width, X, Y, w, h, 4, at.rgba);
        rows2d(bytes, covered, width, X, Y, w, h, 1, at.cover);
        copy = ++boxLinesCopy;
      }
      k.lineKinds(at.rgba, at.cover, (y - Y) * w + x - X, len, rows ? 1 : w, cnt, rows ? w : 1, at.out);
      return copyOut(I32, b, at.out, cnt);
    } catch (e) { fail(e); }
  };
}

export function captureProtectedBoxes(width, height, regions, masks, union) {
  const n = width * height, largest = Math.max(union ? union.box.width * union.box.height : 0, ...regions.map(r => r.width * r.height));
  return spaceFit([room(n), room(largest), room(1 << 20), room((width + 2) * 24), room((width + 2) * 24)], (k, [exact, mask, boxes, prev, cur], b) => {
    const bytes = new U8(b); bytes.fill(1, exact, exact + n);
    let photo = 0;
    regions.forEach((r, i) => { if (masks[i]) { bytes.set(masks[i].exact, mask); photo += k.protectedCompose(exact, width, mask, r.x, r.y, r.width, r.height, 0); } });
    if (photo && union) { bytes.set(union.mask.exact, mask); photo -= k.protectedCompose(exact, width, mask, union.box.x, union.box.y, union.box.width, union.box.height, 1); }
    if (!photo) return {photo: 0};
    const cnt = k.protectedBoxes(exact, width, height, boxes, 1 << 16, prev, cur);
    if (cnt < 0) return {boxes: null};
    const w = new I32(b, boxes, cnt * 4);
    return {boxes: Array.from({length: cnt}, (_, q) => ({x: w[4 * q], y: w[4 * q + 1], w: w[4 * q + 2], h: w[4 * q + 3]}))};
  });
}

export function captureMarkStrokes(data, width, height, y0, h, marks) {
  const cnt = marks.length >> 2, from = Math.max(0, y0 - 1), to = Math.min(height, y0 + h + 1), rec = new I32(cnt * 6);
  for (let q = 0; q < cnt; q++) rec.set(marks.subarray(4 * q, 4 * q + 4), 6 * q);
  return spaceFit([data.subarray(from * width * 4, to * width * 4), rec, room(cnt * 4 + 8), room(cnt * 4 + 8), room(98320)],
    (k, [band, at, list, tmp, tab], b) => {
      const n = k.markStrokes(band, width, height, from, at, cnt, list, tmp, tab), s32 = new I32(b), ord = new I32(b, list, n);
      return Array.from({length: n}, (_, q) => { const r = (at >> 2) + 6 * ord[q]; return {x: s32[r], y: s32[r + 1], w: s32[r + 2], h: s32[r + 3], ground: s32[r + 4]}; });
    });
}

export function captureMaskComponents(mask, w, h, counts = false) {
  const n = w * h, parts = lim => callFit(k => k.components, [
    into(U8, mask, n), w, h, room(lim * 20 + 16), lim, outUpTo(I32, lim * 4, c => Math.max(0, c) * 4),
    counts ? outUpTo(I32, lim, c => Math.max(0, c)) : 0], true);
  let res = parts((n >> 5) + 16);
  if (res[0] < 0) res = parts(-1 - res[0]);
  const [cnt, b, cells] = res;
  return Array.from({length: cnt}, (_, q) => ({x: b[4 * q], y: b[4 * q + 1], width: b[4 * q + 2], height: b[4 * q + 3], ...(counts && {cells: cells[q]})}));
}

export function captureUnionExact(r, lossy) {
  const n = r.width * r.height, largest = Math.max(0, ...lossy.map(q => q.masked ? q.r.width * q.r.height : 0));
  return spaceFit([room(n), room(largest)], (k, [exact, mask], b) => {
    const bytes = new U8(b); bytes.fill(1, exact, exact + n);
    let photo = 0;
    for (const q of lossy) {
      if (q.masked) bytes.set(q.exact.subarray(0, q.r.width * q.r.height), mask);
      photo += k.unionClear(exact, r.width, q.masked ? mask : 0, q.r.x - r.x, q.r.y - r.y, q.r.width, q.r.height);
    }
    return {exact: copyOut(U8, b, exact, n), photo};
  });
}

export function captureFillUnder(words, width, kept) {
  for (const {r, exact, fill, masked} of kept) {
    const n = r.width * r.height, [, px] = callFit(k => k.fillUnder, [made(I32, n, to => rows2d(to, words, width, r.x, r.y, r.width, r.height), n),
      n, masked ? into(U8, exact, n) : 0, fill | 0], true);
    rowsOut(words, px, width, r.x, r.y, r.width, r.height);
  }
}

export function captureTextDiff(data, under, n) {
  const [count, diff] = callFit(k => k.diffMask, [into(U8, data, n * 4), into(U8, under, n * 4), n, out(U8, n)]);
  return {diff, count};
}

export function captureMarkFacts(data, width, y0, h, boxed, marks) {
  const cnt = marks.length, list = new I32(cnt * 4);
  marks.forEach((m, q) => list.set([m.x, m.y, m.w, m.h], 4 * q));
  const [, o] = callFit(k => k.markFacts, [data.subarray(y0 * width * 4, (y0 + h) * width * 4),
    boxed.length === h * width ? boxed : boxed.subarray(y0 * width, (y0 + h) * width), width, y0, list, cnt, out(I32, cnt * 7)], true);
  return {
    facts: marks.map((_, q) => ({open: o[7 * q] === 1, lo: [o[7 * q + 1], o[7 * q + 2], o[7 * q + 3]], hi: [o[7 * q + 4], o[7 * q + 5], o[7 * q + 6]]})),
    grounded: ({x, y, w, h: mh}) => groundedIn(data, width, y0, h, x, y, w, mh),
  };
}
export const captureGrounded = (data, width, x, y, w, h) => groundedIn(data, width, y, h, x, y, w, h);
function groundedIn(data, width, y0, rows, x, y, w, h) {
  const cap = pow2(2 * w * h, 64);
  return callFit(k => k.markGrounded, [data.subarray(y0 * width * 4, (y0 + rows) * width * 4), width, y0, x, y, w, h, room(cap * 8), cap])[0] === 1;
}

export function captureGroundCells(data, width, height, box, text) {
  const y0 = Math.max(0, box.y - 2), y1 = Math.min(height, box.y + box.h + 2), cap = pow2(2 * Math.max(0, y1 - y0) * Math.min(width, box.w + 4), 64);
  const [ring, cells] = callFit(k => k.groundRing, [data.subarray(y0 * width * 4, y1 * width * 4),
    text && text.subarray(y0 * width, y1 * width), width, height, y0, box.x, box.y, box.w, box.h, room(cap * 8), cap, out(U8, 32768)]);
  return ring < 16 ? null : cells;
}

export function captureTextMask(data, under, w, h) {
  const n = w * h;
  return spaceFit([into(U8, data, n * 4), into(U8, under, n * 4), room(n), room(n)], (k, [a, b, diff, mask], buf2) => {
    const count = k.diffMask(a, b, n, diff), ring = count && count * 2 <= n;
    if (ring) k.textRing(diff, w, h, mask);
    return {mask: ring ? copyOut(U8, buf2, mask, n) : null, count};
  });
}

export function captureBoxBound(data, width, {x, y, width: w, height: h}, regions) {
  const pairs = Math.max(0, h + 2 >> 2), rects = new I32(regions.length * 4);
  regions.forEach((r, q) => rects.set([r.x - x, r.y - y, r.width, r.height], 4 * q));
  const [, o] = callFit(k => k.boxBound, [made(U8, pairs * w * 8, to => {
    for (let q = 0; q < pairs; q++) rows2d(to, data, width, x, y + 4 * q, w, 2, 4, q * w * 8);
  }), w, h, rects, regions.length, out(I32, 2)], true);
  return {samples: o[0], bound: o[1]};
}

export function captureLinearPlanes(planes) {
  const n = planes[0].length, wide = planes.every(p => p instanceof F32) ? 0 : 1;
  return planes.map(p => callFit(k => k.linearRows, [into(wide ? F64 : F32, p, n), out(F64, n), n, wide])[1]);
}

let STEP_LEVELS = null;
export function captureLinearRGBA(planes, width, height) {
  const n = width * height, wide = planes.every(p => p instanceof F32) ? 0 : 1;
  const levels = wide ? wideLevels() : F64.from(RGB8_THRESHOLDS);
  const steps = wide ? null : STEP_LEVELS ??= (() => {
    const s = new U8(65536);
    for (let i = 0, k = 0; i < 65536; i++) { while (k < 255 && i / 65536 >= RGB8_THRESHOLDS[k + 1]) k++; s[i] = k; }
    return s;
  })();
  return callFit(k => k.rgbaLinear, [...planes.slice(0, 3).map(p => into(wide ? F64 : F32, p, n)), n, wide, into(F64, levels, 256),
    steps || room(65536), out(U8C, n * 4)])[1];
}
export function captureLinearRGBAInto(linear, from, count, outBuf, at) {
  for (let i = 0; i < count; i += 16384) {
    const m = Math.min(16384, count - i);
    outBuf.set(captureLinearRGBA(linear.slice(0, 3).map(p => p.subarray(from + i, from + i + m)), m, 1), (at + i) * 4);
  }
  return outBuf;
}

export function captureFrameRows({colours, indices, stride, x = 0, y = 0}, w, h) {
  stride ??= w;
  const from = y * stride + x, span = h ? (h - 1) * stride + w : 0, n = w * h;
  const head = () => [into(U32, colours), indices.subarray(from, from + span), stride, 0, w, h];
  return {
    soft: () => call(k => k.frameSoft, head())[0],
    remap: table => { const [, plane, alpha] = call(k => k.frameRemap, [...head(), into(U16, table), out(U16, n), out(I16, n)]); return {plane, alpha}; },
  };
}

function squeezeOn(data, w, h, horizontal, C, step) {
  const sz = C.BYTES_PER_ELEMENT, avg = horizontal ? (w + 1 >> 1) * h : w * (h + 1 >> 1), res = w * h - avg;
  const outAt = align16(w * h * sz), resAt = align16(outAt + avg * sz);
  const k = getAux(resAt + res * sz, 0), b = k.memory.buffer;
  new C(b).set(data.length === w * h ? data : data.subarray(0, w * h));
  const status = step(k)(0, w, h, horizontal ? 1 : 0, outAt, resAt);
  return [copyOut(C, b, outAt, avg), copyOut(C, b, resAt, res), status];
}
export const captureSqueezeStep = (data, w, h, horizontal) => squeezeOn(data, w, h, horizontal, I16, k => k.squeezeStep);
export function capturePlanarSqueezeStep(data, w, h, horizontal) {
  const [averages, residuals, status] = squeezeOn(data, w, h, horizontal, I32, k => k.squeezeStep32);
  if (status < 0) throw fault('JXL_INPUT', 'squeeze: 32-bit range; disable');
  return {averages, residuals, wide: status === 1};
}

export function captureFillHoles(rgba, w, h, exact) {
  const n = w * h, [cnt] = callFit(k => k.maskOnes, [into(U8, exact, n), n]);
  rgba.set(callFit(k => k.fillHoles, [both(U8, rgba, n * 4), w, h, into(U8, exact, n), room(cnt * 16), room(w * 4)], true)[1]);
}

export function captureFillClear(rgba, w, h) {
  if (!isRgba(rgba) || !prepareCaptureKernels()) return rgba;
  const fit = Math.min(h, (MEMORY_BYTES - (base + 7 & ~7) - 16 - w * 4) / (w * 20) | 0), rows = fit >= h ? h : fit & ~7 || fit;
  if (rows < 1) return rgba;
  return callOr(k => at => {
    let dst = null;
    for (let y = 0; y < h; y += rows) {
      const r = Math.min(rows, h - y), n = w * r;
      u8.set(rgba.subarray(y * w * 4, (y + r) * w * 4), at);
      if (!k.fillClear(at, w, r, at + n * 4, at + n * 20)) continue;
      (dst ??= rgba.slice()).set(u8.subarray(at, at + n * 4), y * w * 4);
    }
    return dst ?? rgba;
  }, [room(rows * w * 20 + w * 4)])?.[0] ?? rgba;
}

export function captureComposeOver(dst, src, w, h, bg) {
  if (!isRgba(dst) || !isRgba(src) || !prepareCaptureKernels()) return false;
  const rows = Math.min(h, (MEMORY_BYTES - base - 32) / (w * 8) | 0);
  if (rows < 1) return false;
  return callOr(k => (at, under) => {
    for (let y = 0; y < h; y += rows) {
      const n = w * Math.min(rows, h - y), a = y * w * 4;
      u8.set(dst.subarray(a, a + n * 4), at); u8.set(src.subarray(a, a + n * 4), under);
      k.composeOver(at, under, n, bg);
      dst.set(u8.subarray(at, at + n * 4), a);
    }
    return true;
  }, [room(rows * w * 4), room(rows * w * 4)])?.[0] ?? false;
}

export const photoKernels = () => {
  if (!kernelHooks.capturePhoto) throw wasmRequired();
  return kernelHooks.capturePhoto;
};

function stageRct(words, stride, x, y, width, height, rankBytes) {
  const n = width * height, staging = align16(n * 4);
  let h = heldAt(words);
  if (rankBytes && base + (h < 0 ? staging : 0) + rankBytes > MEMORY_BYTES) { captureRelease(); h = -1; }
  const wPtr = h < 0 ? base : h, after = base + (h < 0 ? staging : 0), pb = align16(n * 2 + 16), p2 = after + pb * 2;
  if (p2 + pb > MEMORY_BYTES) throw kernelFail();
  reserve(Math.max(p2 + pb, rankBytes ? after + rankBytes : 0));
  if (h < 0) rows2d(u32, words, stride, x, y, width, height, 1, wPtr >> 2);
  return [wPtr, h < 0 ? width : stride, h < 0 ? 0 : x, h < 0 ? 0 : y, after, after + pb, p2];
}

const rgbGroup = (words, stride, x, y, width, height) => !(words instanceof U32) || width < 1 || height < 1 || width * height > 1 << 20 ||
  stride < width || x < 0 || y < 0 || x + width > stride || (y + height - 1) * stride + x + width > words.length;
export const captureColourGroup = (words, stride, x, y, width, height, rct = -1, minimumGain = 0.02) =>
  rgbGroup(words, stride, x, y, width, height) || rct < -1 || rct > 41 || !Number.isFinite(minimumGain) || minimumGain < 0 ? outside() : run(() => {
  const n = width * height, rank = rct < 0 && width >= 4 && height >= 4 && n >= 1024;
  const [wPtr, sStr, sx, sy, p0, p1, p2] = stageRct(words, stride, x, y, width, height, rank ? 4848 : 0);
  if (rank) {
    const smp = engine.rctRank(wPtr, sStr, sx, sy, width, height, p0, p0 + 4608);
    if (!smp) throw kernelFail();
    rct = engine.rctRankFinish(p0, p0 + 4608, smp, p0 + 4688, p0 + 4832, LOG) >= minimumGain ? u32[(p0 + 4832) >> 2] : 10;
  } else if (rct < 0) rct = 10;
  const mask = engine.rctUnpack(wPtr, sStr, sx, sy, width, height, rct, p0, p1, p2);
  const planes = [p0, p1, p2].map(at => i16.slice(at >> 1, (at >> 1) + n));
  for (let c = 0; c < 3; c++) Object.defineProperty(planes[c], 'constant', {value: Boolean(mask & 1 << c)});
  return {rct, planes};
});

export const captureColourChain = (words, stride, x, y, width, height, chain) => rgbGroup(words, stride, x, y, width, height) || !Array.isArray(chain) ||
  chain.length < 1 || chain.length > 4 || chain.some(r => !Number.isInteger(r) || r < 0 || r > 41) ? outside() : run(() => {
  const n = width * height, [wPtr, sStr, sx, sy, p0, p1, p2] = stageRct(words, stride, x, y, width, height, 0);
  const mask0 = engine.rctUnpack(wPtr, sStr, sx, sy, width, height, chain[0], p0, p1, p2);
  for (let s = 1; s < chain.length; s++) engine.rctStep16(p0, p1, p2, n, chain[s]);
  const planes = [p0, p1, p2].map(at => i16.slice(at >> 1, (at >> 1) + n));
  planes.forEach((p, c) => Object.defineProperty(p, 'constant', {value: chain.length === 1 ? Boolean(mask0 & 1 << c) : p.every(v => v === p[0])}));
  return planes;
});

export function captureDeepLeaves(data, width, height) {
  const row = data.byteLength / height;
  return inSpace([room(2 * row)], (k, [at]) => {
    let leaves = 0x7fff;
    for (let y = 1; leaves && y < height - 1; y += 4) {
      u8.set(new U8(data.buffer, data.byteOffset + y * row, 2 * row), at);
      leaves = k.deepLeaves(at, width, data instanceof F32, leaves);
    }
    return leaves > 0;
  });
}

export function captureWindowVulnerability(data, width, x, y, w, h, overlaps) {
  if (!isRgba(data) || ![width, x, y, w, h].every(Number.isInteger) || width < 1 ||
      x < 0 || y < 0 || w < 0 || h < 0 || x + w > width || ((y + h - 1) * width + x + w) * 4 > data.length) outside();
  const count = overlaps?.length ?? 0, rects = new F64(count * 4);
  for (let k = 0; k < count; k++) { const r = overlaps[k]; rects.set([r.x - x, r.y - y, r.x + r.width - x, r.y + r.height - y], k * 4); }
  const [sum, hits] = call(k => k.windowVulnerability, [rect(U8, data, width, x, y, w, h, 4), w, h, rects, count, out(U32, 1, 1)]);
  return {sum, hits: hits[0]};
}

export function captureCustomWeighted(plane, width, height, parameters) {
  if (!(plane instanceof I16) || width < 1 || height < 1 || width * height > 1 << 20 || plane.length < width * height || parameters.length !== 11) outside();
  const n = width * height, [, residuals, properties] = call(k => (p, par, st, res, prop) => k.customWeighted(p, width, 0, 0, 0, height, par, DIV, st, res, prop),
    [into(I16, plane, n), I32.from(parameters), room((width + 2) * 40), out(U32, n), out(I32, n)]);
  return {residuals, properties};
}

const WP_SCORE_CUTS = /* @__PURE__ */ I32.of(-160, -80, -40, -20, -10, -4, 0, 4, 10, 20, 40, 80, 160);
export function captureCustomWeightedBins(plane, width, _height, parameters, strips, scoreCuts = WP_SCORE_CUTS) {
  let rows = 0, most = 1, raw = 0;
  for (const [y0, y1] of strips) { rows = Math.max(rows, y1 - Math.max(0, y0 - 4)); most = Math.max(most, (y1 - y0) * width); }
  const [, bins] = call(k => (par, cuts, st, p, res, prop, hist) => {
    for (const [y0, y1] of strips) {
      const warm = y0 ? Math.max(0, y0 - 2) : 0, row0 = Math.max(0, warm - 2);
      i16.set(plane.subarray(row0 * width, y1 * width), p >> 1);
      k.customWeighted(p, width, row0, warm, y0, y1, par, DIV, st, res, prop);
      raw += k.wpStripBins(res, prop, (y1 - y0) * width, cuts, hist);
    }
  }, [I32.from(parameters), into(I32, scoreCuts, 13), room((width + 2) * 40), room(rows * width * 2), room(most * 4), room(most * 4), out(U32, 672, 1)]);
  return {bins, raw};
}
const rctMode = src => src instanceof Uint8Array || src instanceof Uint8ClampedArray ? 0 : src instanceof Uint16Array ? 1 : src instanceof Int16Array ? 2
  : (() => { throw fault('JXL_INTERNAL', 'transformRanking: samples of ' + (src?.constructor?.name ?? typeof src)); })();
export const captureRctPrices = (src, pos, w, g, tab) => call(k => (s, p, t, pl, h, pr) => k.rctRankAll(s, p, pos.length, w, g ? 1 : 0, rctMode(src), t, pl, h, pr), [new Uint8Array(src.buffer, src.byteOffset, src.byteLength), pos instanceof Uint32Array ? pos : Uint32Array.from(pos), tab, room(pos.length * 144 + 16), room(512), out(Float64Array, 18)])[1];
