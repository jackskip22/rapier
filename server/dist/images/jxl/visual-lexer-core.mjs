// SPDX-License-Identifier: MIT
import {fault} from './fault.mjs';
import {ensureKernels} from './kernels.mjs';
import {kernelInstance, arenaHolder, takeArena, growArena} from './kernel-runtime.mjs';
import {TRANSFORMS} from './vardct-bases.mjs';

const cl = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) | 0;

export const OPSIN_LUT = /* @__PURE__ */ new Int32Array(256);
for (let i = 0, m = 0; i < 256; i++) {
  while (511 * (2 * m + 1) ** 3 <= 2 ** 33 * (2 * i + 1)) m++;
  OPSIN_LUT[i] = m;
}

function parseVisualLexerPacket(pkt) {
  if (!(pkt instanceof Uint8Array) || pkt.byteLength < 32 || pkt[0] !== 0 || pkt[1] !== 0x56 ||
      (pkt[2] !== 1 && pkt[2] !== 2) || pkt[2] === 2 && pkt.byteLength < 40)
    throw fault('JXL_INTERNAL', 'visual-lexer:packet');
  const version = pkt[2], shift = version === 2 ? 8 : 0, dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  return {
    version, C: pkt[3], offG: dv.getUint32(4, true),
    ...(shift && {off256: dv.getUint32(8, true), off128: dv.getUint32(12, true)}),
    off64: dv.getUint32(8 + shift, true), off32: dv.getUint32(12 + shift, true),
    off16: dv.getUint32(16 + shift, true), off8: dv.getUint32(20 + shift, true),
    readLine: dv.getUint16(24 + shift, true), minEdge: shift ? dv.getUint16(34, true) : 0,
  };
}

export function visualLexerPacketShape(pkt) { if (typeof __RAPIER_JXL_VERSION__ !== 'undefined') return parseVisualLexerPacket(pkt);
  const parsed = parseVisualLexerPacket(pkt);
  const {version, C} = parsed, v2 = version === 2;
  const bad = what => { throw fault('JXL_INTERNAL', 'visual-lexer:shape:' + what); };
  if (C < 1 || C > (v2 ? 96 : 112)) bad('C');
  for (let i = v2 ? 36 : 26; i < (v2 ? 40 : 32); i++) if (pkt[i] !== 0) bad('reserved');
  const {subpackets} = verifyVisualLexerFanIn(pkt);
  const want = {
    offG: [v2 ? 20 : 16, [v2 ? 6 + C : 6]], off64: [v2 ? 16 + C : 16, [v2 ? C : C + 4]],
    off32: [16 + C, [C + 4]], off16: [16 + C, v2 ? [C + 8] : [C + 4, C + 8]], off8: [16 + C, [v2 ? 2 : 8]],
    off256: [16 + C, [C]], off128: [16 + C, [C]],
  };
  for (const [name, {d, n1, n2, no, s1, s2, s1b}] of Object.entries(subpackets)) {
    const [inputs, outputs] = want[name];
    if (d !== inputs || !outputs.includes(no) || n1 < 1 || (s1b && !n2) || s1 < 1 || s1 > 30 || s2 < 1 || s2 > 30) bad(name);
  }
  return {...parsed, subpackets};
}

function verifyVisualLexerFanIn(pkt) {
  const parsed = parseVisualLexerPacket(pkt);
  const wv = new Int8Array(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  const INT32_MAX = 2147483647;
  let worstBound = 0;
  const subpackets = {};
  const entries = Object.entries(parsed).filter(([name]) => name.startsWith('off'));
  const minOff = parsed.version === 1 ? 32 : 40;
  for (const [name, off] of entries) {
    if ((off & 1) || off < minOff || off + 8 > pkt.byteLength) throw fault('JXL_INTERNAL', 'visual-lexer:subpacket:' + name);
    if (pkt[off] > 30 || pkt[off + 1] !== 0x4d) throw fault('JXL_INTERNAL', 'visual-lexer:subpacket:' + name);
    const d = pkt[off + 2], n1 = pkt[off + 3], n2 = pkt[off + 4], no = pkt[off + 5], s1 = pkt[off + 6], s2 = pkt[off + 7], s1b = pkt[off] || s1;
    const w1 = off + 8, w2 = w1 + n1 * d, lastH = n2 > 0 ? n2 : n1, wo = w2 + n2 * n1;
    const b1 = off + ((8 + n1 * d + n2 * n1 + no * lastH + 1) & ~1), b2 = b1 + n1 * 2, bo = b2 + n2 * 2;
    if (bo + no * 2 > pkt.byteLength) throw fault('JXL_INTERNAL', 'visual-lexer:subpacket:' + name);
    let subWorst = 0;
    const checkRows = (wOff, bOff, rows, cols, xMax, sh) => {
      const half = 1 << (sh - 1);
      for (let i = 0; i < rows; i++) {
        let rowAbs = Math.abs(dv.getInt16(bOff + i * 2, true) << 6) + half;
        for (let j = 0; j < cols; j++) {
          const w = wv[wOff + i * cols + j];
          if (w === -128) throw fault('JXL_INTERNAL', 'visual-lexer:weight-128:' + name);
          rowAbs += Math.abs(w) * xMax;
        }
        if (rowAbs >= INT32_MAX) throw fault('JXL_INTERNAL', 'visual-lexer:overflow:' + name);
        if (rowAbs > subWorst) subWorst = rowAbs;
        if (rowAbs > worstBound) worstBound = rowAbs;
      }
    };
    checkRows(w1, b1, n1, d, 8192, s1);
    if (n2 > 0) checkRows(w2, b2, n2, n1, 1024, s1b);
    checkRows(wo, bo, no, lastH, 1024, s2);
    subpackets[name] = {d, n1, n2, no, s1, s2, s1b: pkt[off], maxAccumulatorBound: subWorst};
  }
  return {verified: true, maxAccumulatorBound: worstBound, headroomRatio: Number((INT32_MAX / Math.max(1, worstBound)).toFixed(2)), subpackets};
}

let vlHolder = null;
function vlScratchBytes(n8, n16, n32, n64, C, bw, bh, v2) {
  const extra = v2 ? (Math.ceil(bw / 16) * Math.ceil(bh / 16) + Math.ceil(bw / 32) * Math.ceil(bh / 32)) * (16 + C) + C : 0;
  return (
    (n8 + n16 + n32 + n64) * 16 +
    (n64 + n32 + n16) * (C + 1) +
    n8 * 2 + (16 + C) * 2 + 1024 + extra
  ) * 4 + 16384;
}

const vlLexemeScratch = bw => 60 * (((bw << 3) + 9) & ~7) + 16;

export function extractVisualLexemes8Wasm(rgba, width, height, bw, bh, qIntentInt) {
  ensureKernels();
  const {memory, exports} = kernelInstance();
  vlHolder ||= arenaHolder(() => {});
  takeArena(vlHolder);
  const n8 = bw * bh, rgbaBytes = width * height * 4, outLen = n8 * 12;
  const lutPtr = 65536;
  const rgbaPtr = lutPtr + 1024;
  const outPtr = (rgbaPtr + rgbaBytes + 15) & ~15;
  const tilePtr = (outPtr + outLen * 4 + 15) & ~15;
  const end = tilePtr + vlLexemeScratch(bw);
  if (memory.buffer.byteLength < end) growArena(end);
  new Int32Array(memory.buffer, lutPtr, 256).set(OPSIN_LUT);
  const src = rgba.byteLength === rgbaBytes ? rgba : rgba.subarray(0, rgbaBytes);
  new Uint8Array(memory.buffer, rgbaPtr, src.byteLength).set(src);
  exports.vlLexemes8(rgbaPtr, lutPtr, width | 0, height | 0, bw | 0, bh | 0, qIntentInt | 0, outPtr, tilePtr);
  return new Int32Array(memory.buffer).slice(outPtr >> 2, (outPtr >> 2) + outLen);
}

export function evalVisualLexerWasm(pkt, feat8, bw, bh, qIntent, wide) {
  if (!(pkt instanceof Uint8Array) || pkt.byteLength < 32 || pkt[1] !== 0x56)
    throw fault('JXL_INTERNAL', 'visual-lexer:packet');
  ensureKernels();
  const {memory, exports} = kernelInstance();
  vlHolder ||= arenaHolder(() => {});
  takeArena(vlHolder);
  const C = pkt[3], n8 = bw * bh, outLen = 6 + n8 * 6;
  const pw16 = (bw + 1) >> 1, ph16 = (bh + 1) >> 1, n16 = pw16 * ph16;
  const pw32 = (pw16 + 1) >> 1, ph32 = (ph16 + 1) >> 1, n32 = pw32 * ph32;
  const pw64 = (pw32 + 1) >> 1, ph64 = (ph32 + 1) >> 1, n64 = pw64 * ph64;
  const at = 65536;
  const featPtr = (at + pkt.byteLength + 15) & ~15;
  const outPtr = (featPtr + feat8.byteLength + 15) & ~15;
  const scratchPtr = (outPtr + outLen * 4 + 15) & ~15;
  const end = scratchPtr + vlScratchBytes(n8, n16, n32, n64, C, bw, bh, pkt[2] === 2);
  if (memory.buffer.byteLength < end) growArena(end);
  new Uint8Array(memory.buffer).set(pkt, at);
  const i32 = new Int32Array(memory.buffer);
  i32.set(feat8, featPtr >> 2);
  if (!exports.visualLex(at, featPtr, bw | 0, bh | 0, qIntent | 0, wide ? 1 : 0, outPtr, scratchPtr))
    throw fault('JXL_INTERNAL', 'visual-lexer:exec');
  return i32.slice(outPtr >> 2, (outPtr >> 2) + outLen);
}

export function evalVisualLexerFromRgbaWasm(pkt, rgba, width, height, qIntent, wide) {
  if (!(pkt instanceof Uint8Array) || pkt.byteLength < 32 || pkt[1] !== 0x56)
    throw fault('JXL_INTERNAL', 'visual-lexer:packet');
  const bw = Math.ceil(width / 8), bh = Math.ceil(height / 8);
  return evalVisualLexerWasm(pkt, extractVisualLexemes8Wasm(rgba, width, height, bw, bh, qIntent), bw, bh, qIntent, wide);
}

function anchorCoderQuality(readingIntent, wide = false) {
  const r = Math.max(0.1, Math.min(0.995, readingIntent ?? 0.85));
  let q;
  if (r <= 0.75) q = 58.0 * (r / 0.75);
  else if (r <= 0.85) q = 58.0 + (r - 0.75) * 145.0;
  else if (r <= 0.92) q = 72.5 + (r - 0.85) * 185.0;
  else q = 85.45 + (r - 0.92) * 175.0;
  if (wide && r <= 0.90) q += 1.2;
  return Math.max(8, Math.min(98.5, q));
}

export function pruneRareTransforms(layout) {
  if (!layout || !layout.length) return layout;
  const counts = new Map();
  for (const b of layout) {
    const f = TRANSFORMS[b.id]?.table;
    if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const drop = new Set();
  for (const [f, c] of counts) if (c > 0 && c < 8) drop.add(f);
  if (!drop.size) return layout;
  const out = [];
  for (const b of layout) {
    const tr = TRANSFORMS[b.id];
    if (!tr || !drop.has(tr.table)) { out.push(b); continue; }
    const tw = Math.max(1, tr.width >> 3), th = Math.max(1, tr.height >> 3);
    for (let dy = 0; dy < th; dy++) for (let dx = 0; dx < tw; dx++) out.push({id: 0, bx: b.bx + dx, by: b.by + dy});
  }
  return out.sort((a, b) => (a.by - b.by) || (a.bx - b.bx));
}

const AQ_LEVELS_11 = [0.60, 0.75, 0.85, 0.95, 1.00, 1.05, 1.15, 1.30, 1.50, 1.75, 2.00];
const DZ_SCALES_5 = [0.72, 0.82, 1.00, 1.22, 1.44];
let POW2_256 = null;
function pow2Table() {
  if (POW2_256) return POW2_256;
  const t = new Float64Array(256);
  t[0] = 1;
  for (let k = 1, m = 2 ** 52; k < 256; k++) {
    const p = 1n << BigInt(53 * 256 + k);
    m = Math.round(m * 1.0027112750502025);
    while ((2n * BigInt(m) + 1n) ** 256n < p) m++;
    while ((2n * BigInt(m) - 1n) ** 256n > p) m--;
    t[k] = m / 2 ** 52;
  }
  return (POW2_256 = t);
}
const WHOLE_POW2 = [0.25, 0.5, 1, 2];
const pow2of256 = (t, e) => t[e & 255] * WHOLE_POW2[(e >> 8) + 2];

const MERGE_MARGIN = -119, GUARD_MARGIN = -100;
function splitAtEdges(layout, rawOut, bw, bh) {
  const out = [];
  let split = false;
  for (const b of layout) {
    const t = TRANSFORMS[b.id], tw = Math.max(1, t.width >> 3), th = Math.max(1, t.height >> 3);
    let calm = true;
    for (let dy = 0; dy < th && calm; dy++) for (let dx = 0; dx < tw; dx++) {
      const x = b.bx + dx, y = b.by + dy;
      if (x < bw && y < bh && (rawOut[6 + (y * bw + x) * 6 + 5] | 0) < GUARD_MARGIN) { calm = false; break; }
    }
    if (calm || tw * th === 1) { out.push(b); continue; }
    split = true;
    for (let dy = 0; dy < th; dy++) for (let dx = 0; dx < tw; dx++) if (b.bx + dx < bw && b.by + dy < bh) out.push({id: 0, bx: b.bx + dx, by: b.by + dy});
  }
  return split ? out.sort((a, c) => (a.by - c.by) || (a.bx - c.bx)) : out;
}

export function readVisualLexerVote(rawOut, n8, decoupledDeltaQ = false) {
  let hiMarginCells = 0;
  for (let i = 0; i < n8; i++) if ((rawOut[6 + i * 6 + 5] | 0) >= MERGE_MARGIN) hiMarginCells++;
  const g0 = rawOut[0] | 0, hiMarginShare = hiMarginCells / Math.max(1, n8);
  const pays = (decoupledDeltaQ || g0 >= -8) && hiMarginShare >= 0.2435;
  return {hiMarginCells, pays};
}

function readVisualLexerConfidence(rawOut, n8, decoupledDeltaQ = false) {
  const denom = Math.max(1, n8), vote = readVisualLexerVote(rawOut, n8, decoupledDeltaQ);
  let marginSum = 0, flatSum = 0;
  for (let i = 0; i < n8; i++) {
    const off = 6 + i * 6;
    marginSum += rawOut[off + 5] | 0;
    flatSum += rawOut[off + 4] | 0;
  }
  return {
    g0: rawOut[0] | 0,
    cells: n8,
    hiMarginCells: vote.hiMarginCells,
    hiMarginShare: vote.hiMarginCells / denom,
    meanMargin: marginSum / denom,
    meanFlatness: flatSum / denom,
    pays: vote.pays,
  };
}

export function decodeVisualLexerRecipe(rawOut, width, height, readingIntent, wide, fallbackQuality, fineQuant = false) {
  const bw = Math.ceil(width / 8), bh = Math.ceil(height / 8), n8 = bw * bh;
  const anchorQ = anchorCoderQuality(readingIntent ?? (fallbackQuality / 100), wide);
  const deltaQ = rawOut[0] / 128;
  const quality = Math.max(8, Math.min(98.8, Math.round((anchorQ + deltaQ) * 100) / 100));
  const slope = Math.max(0.30, Math.min(1.90, Math.round((0.75 + rawOut[1] / 128) * 1000) / 1000));
  const e0 = rawOut[2], e1 = rawOut[3], e2 = rawOut[4];
  const epfScale = e0 > e1 && e0 >= e2 && e0 > 8 ? 0.74 : e2 > e1 && e2 > e0 && e2 > 8 ? 1.24 : 1.0;

  const rawLayout = [];
  const f0 = n8 > 0 ? rawOut[7] : 0;
  let uniformField = true, allUnitDz = true, nonDefaultSharp = 0;

  for (let i = 0; i < n8; i++) {
    const off = 6 + i * 6, tid = rawOut[off];
    if (tid >= 0) rawLayout.push({id: tid, bx: i % bw, by: (i / bw) | 0});
    if (rawOut[off + 1] !== f0) uniformField = false;
    if (Math.abs(rawOut[off + 2]) >= 23) allUnitDz = false;
    if (cl(rawOut[off + 3], 0, 7) !== 7) nonDefaultSharp++;
  }

  const layout = pruneRareTransforms(splitAtEdges(rawLayout, rawOut, bw, bh));
  let sharpness = null;
  if (nonDefaultSharp >= 6 && quality <= 90) {
    sharpness = new Int16Array(n8);
    for (let i = 0; i < n8; i++) sharpness[i] = cl(rawOut[6 + i * 6 + 3], 0, 7);
  }

  let outField = null, outDz = null;
  if (!uniformField || !allUnitDz) {
    const fieldLog = new Int32Array(n8);
    const dzRaw = new Float64Array(n8);
    let logSum = 0;
    for (let i = 0; i < n8; i++) {
      const off = 6 + i * 6;
      fieldLog[i] = cl(rawOut[off + 1], -190, 256);
      logSum += fieldLog[i];
      dzRaw[i] = Math.max(0.72, Math.min(1.44, 1.0 + rawOut[off + 2] / 256));
    }
    const meanLog = Math.round(logSum / Math.max(1, n8)), p2 = pow2Table();
    const fieldScale = new Float64Array(n8).fill(1.0);
    const dzMap = new Float64Array(n8).fill(1.0);
    let nonUnitField = 0, nonUnitDz = 0;
    for (const b of layout) {
      const t = TRANSFORMS[b.id], tw = Math.max(1, t.width >> 3), th = Math.max(1, t.height >> 3);
      let fAcc = 0, dzAcc = 0, cnt = 0;
      for (let dy = 0; dy < th && b.by + dy < bh; dy++) {
        for (let dx = 0; dx < tw && b.bx + dx < bw; dx++) {
          const c = (b.by + dy) * bw + b.bx + dx;
          fAcc += pow2of256(p2, fieldLog[c] - meanLog);
          dzAcc += dzRaw[c];
          cnt++;
        }
      }
      const fMean = fAcc / Math.max(1, cnt), dzMean = dzAcc / Math.max(1, cnt);
      let fSnap = 1.0;
      if (fineQuant) {
        fSnap = Math.max(0.60, Math.min(2.00, Math.round(fMean * 50) / 50));
        if (Math.abs(fSnap - 1.0) < 0.03) fSnap = 1.0;
      } else {
        let bestF = Infinity;
        for (const lv of AQ_LEVELS_11) { const d = Math.abs(fMean - lv); if (d < bestF) { bestF = d; fSnap = lv; } }
      }
      let dzSnap = 1.0;
      if (fineQuant) {
        dzSnap = Math.max(0.72, Math.min(1.44, Math.round(dzMean * 50) / 50));
        if (Math.abs(dzSnap - 1.0) < 0.03) dzSnap = 1.0;
      } else {
        let bestD = Infinity;
        for (const lv of DZ_SCALES_5) { const d = Math.abs(dzMean - lv); if (d < bestD) { bestD = d; dzSnap = lv; } }
      }
      if (fSnap !== 1.0) nonUnitField += cnt;
      if (dzSnap !== 1.0) nonUnitDz += cnt;
      for (let dy = 0; dy < th && b.by + dy < bh; dy++) {
        for (let dx = 0; dx < tw && b.bx + dx < bw; dx++) {
          const c = (b.by + dy) * bw + b.bx + dx;
          fieldScale[c] = fSnap;
          dzMap[c] = dzSnap;
        }
      }
    }
    if (nonUnitField >= 4) outField = fieldScale;
    if (nonUnitDz >= 2) outDz = dzMap;
  }

  return {quality, slope, epfScale, layout, fieldScale: outField, deadzoneMap: outDz, sharpness};
}

export function decodeVisualLexerPlan(rawOut, width, height, readingIntent, wide, fallbackQuality, fineQuant = false, decoupledDeltaQ = false) {
  const plan = decodeVisualLexerRecipe(rawOut, width, height, readingIntent, wide, fallbackQuality, fineQuant);
  const n8 = Math.ceil(width / 8) * Math.ceil(height / 8), flatness = new Int32Array(n8);
  for (let i = 0; i < n8; i++) flatness[i] = rawOut[6 + i * 6 + 4];
  const effIntent = readingIntent ?? (fallbackQuality / 100);
  return {
    quality: plan.quality,
    slope: plan.slope,
    epfScale: plan.epfScale,
    cflScale: Math.abs(rawOut[5]) >= 6 ? Math.max(0.75, Math.min(1.25, Math.round((1.0 + rawOut[5] / 256) * 100) / 100)) : 1.0,
    layout: plan.layout,
    fieldScale: plan.fieldScale,
    deadzoneMap: plan.deadzoneMap,
    sharpness: plan.sharpness,
    compactDct8: effIntent <= 0.90 || fallbackQuality <= 88,
    tableBands: 6,
    dct8Bands: 8,
    gentleChromaDz: effIntent > 0.84 || fallbackQuality > 85,
    flatness,
    confidence: readVisualLexerConfidence(rawOut, n8, decoupledDeltaQ),
  };
}
