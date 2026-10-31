// SPDX-License-Identifier: MIT
import {complete} from '../bits.mjs';
import {readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, basename} from 'node:path';
import {distanceMap, closedLoopField} from './aq.mjs';
import {photoXYBSteps} from '../photo-xyb.mjs';
import {scaledDCT, smallTransform, naturalOrder, lowFrequencies, TRANSFORMS} from '../vardct-strategies.mjs';
import {varDCTSteps} from '../vardct.mjs';
import {buildAnsCoding, writeModularAnsHistograms} from '../ans.mjs';
import {prepareCoefficientOrders, COEFFICIENT_ORDER_BUCKETS} from '../coefficient-orders.mjs';
import {zeroDensityContext} from '../vardct.mjs';
import {prepareQuantParams, quantParamSteps} from '../quantization-params.mjs';
import {rateModel, token, nzBucket} from './trellis.mjs';

const ONE = [1 - 0.05465007330715401, 1 - 0.07005449891748593, 1 - 0.049935103337343655];
const recon = (m, c) => m === 0 ? 0 : m === 1 ? ONE[c] : m - 0.145 / m;
const QS = 256;

const SMALL = new Set([3, 12, 13]);
function freqOf(id, pos, sizeScale) {
  if (id === 3) {
    if (pos === 1 || pos === 8 || pos === 9) return [pos & 1, pos >> 3, SMALL_SCALE];
    return [2 * ((pos & 7) >> 1), 2 * ((pos >> 3) >> 1), 2 * SMALL_SCALE];
  }
  if (id === 12 || id === 13) {
    if (pos === 8) return [0, 1, SMALL_SCALE];
    return [pos & 7, 2 * ((pos >> 3) >> 1), 8 / Math.sqrt(32) * SMALL_SCALE];
  }
  const t = TRANSFORMS[id], w = t.width, h = t.height, L = Math.max(w, h), S = Math.min(w, h), wide = w > h;
  const fl = (pos % L) * 8 / L, fs = Math.floor(pos / L) * 8 / S;
  return [wide ? fl : fs, wide ? fs : fl, 8 / Math.sqrt(w * h) * (w * h > 64 ? sizeScale : 1)];
}
function stepAt(quant, id, pos, sizeScale) {
  const [fx, fy, scale] = freqOf(id, pos, sizeScale);
  const x0 = Math.min(7, Math.floor(fx)), y0 = Math.min(7, Math.floor(fy)), x1 = Math.min(7, x0 + 1), y1 = Math.min(7, y0 + 1);
  const ax = fx - x0, ay = fy - y0, q = (y, x) => quant[y * 8 + x];
  const v = (q(y0, x0) * (1 - ax) + q(y0, x1) * ax) * (1 - ay) + (q(y1, x0) * (1 - ax) + q(y1, x1) * ax) * ay;
  return id === 0 ? Math.max(1, Math.round(v * scale)) : v * scale;
}

let FIELD = 32, SMALL_SCALE = 1;
const BANDS = 12;

function fitBands(target, L, S) {
  const B = BANDS, scale = (B - 1) / (1.4142135623730951 + .000001), A = new Float64Array(B * B), y = new Float64Array(B);
  for (let k = 1; k < L * S; k++) {
    const x = (k % L) / (L - 1), yy = Math.floor(k / L) / (S - 1), p = Math.sqrt(x * x + yy * yy) * scale;
    const i = Math.min(B - 2, Math.floor(p)), t = p - i, lw = Math.log(8 * 255 * QS / (FIELD * target[k]));
    const a = [[i, 1 - t], [i + 1, t]];
    for (const [r, wr] of a) { y[r] += wr * lw; for (const [c2, wc] of a) A[r * B + c2] += wr * wc; }
  }
  for (let i = 0; i < B; i++) A[i * B + i] += 1e-6;
  for (let i = 0; i < B; i++) {
    for (let r = i + 1; r < B; r++) { const f = A[r * B + i] / A[i * B + i]; for (let c2 = i; c2 < B; c2++) A[r * B + c2] -= f * A[i * B + c2]; y[r] -= f * y[i]; }
  }
  const beta = new Float64Array(B);
  for (let i = B - 1; i >= 0; i--) { let v = y[i]; for (let c2 = i + 1; c2 < B; c2++) v -= A[i * B + c2] * beta[c2]; beta[i] = v / A[i * B + i]; }
  const bands = [Math.exp(beta[0])];
  for (let i = 1; i < B; i++) { const r = Math.exp(beta[i] - beta[i - 1]); bands.push(r >= 1 ? r - 1 : 1 - 1 / r); }
  return bands;
}

function tableFor(id, components, sizeScale, cache) {
  if (cache.has(TRANSFORMS[id].table)) return cache.get(TRANSFORMS[id].table);
  const t = TRANSFORMS[id], w = t.width, h = t.height, L = Math.max(w, h), S = Math.min(w, h);
  const targets = components.map(comp => Float64Array.from({length: L * S}, (_, k) => stepAt(comp.quant, id, k, sizeScale)));
  const weight = step => 8 * 255 * QS / (FIELD * step);
  let table, input;
  if (id === 0) table = {w: L, h: S, planes: targets.map(p => Int32Array.from(p))};
  else if (id === 3) {
    const bands = targets.map(p => fitBands(Float64Array.from({length: 16}, (_, k) => p[2 * (k >> 2) * 8 + 2 * (k & 3)]), 4, 4));
    input = {mode: 'dct4', bands, multipliers: targets.map((p, c) => [bands[c][0] / weight(p[1]), bands[c][0] / weight(p[9])])};
  } else if (id === 12 || id === 13) {
    const bands = targets.map(p => fitBands(Float64Array.from({length: 32}, (_, k) => p[2 * (k >> 3) * 8 + (k & 7)]), 8, 4));
    input = {mode: 'dct4x8', bands, multipliers: targets.map((p, c) => bands[c][0] / weight(p[8]))};
  } else input = {mode: 'dct', bands: targets.map(p => fitBands(p, L, S))};
  if (input) {
    const parameters = prepareQuantParams(input, L, S, t.table);
    table = {w: L, h: S, parameters, planes: quantParamSteps(parameters, QS, FIELD, [0, 1, 2])};
  }
  cache.set(t.table, table);
  return table;
}

export function xybStrategies(base, width, height, options = {}) {
  const {lambda = 1, sizeScale = 1, ids = [5, 10, 11, 4, 6, 7], rate: rc = [4, 3, 2, 0.6], deadzone, weights = [1, 1, 1]} = options;
  const comps = base.components, stride = comps[0].stride, rows = comps[0].rows, W = stride * 8, planes = base.planes;
  FIELD = base.quantFields ? base.quantFieldBase : 32; SMALL_SCALE = options.smallScale ?? 1;
  const fineOf = (bx, by) => base.quantFields ? base.quantFields[by * stride + bx] / base.quantFieldBase : 1;
  const tables = new Map(), cfl = base.cfl, dead = deadzone;
  const yStep = comps[1].quant[1] / QS, norm = [0, 1, 2].map(c => weights[c] * (yStep / (comps[c].quant[1] / QS)) ** 2 / (yStep * yStep));
  tableFor(0, comps, sizeScale, tables);
  const allowed = new Set(ids);
  const tokens = options.model !== 'simple' && rateModel(base, stride, rows, 8);
  const tokenBits = (c, plane, order, area, size) => {
    let count = 0;
    for (let k = area; k < size; k++) if (plane[order[k]]) count++;
    const [ct, ce] = token(count);
    let bits = tokens.nz[c][nzBucket(Math.ceil(count / area)) * 64 + ct] + ce;
    let prev = count > size / 16 ? 0 : 1, left = count;
    for (let k = area; k < size && left; k++) {
      const q = plane[order[k]], [t, e] = token(q < 0 ? -2 * q - 1 : 2 * q);
      bits += tokens.zd[c][zeroDensityContext(Math.ceil(left / area), Math.floor(k / area), prev) * 64 + t] + e;
      prev = q ? 1 : 0; left -= prev;
    }
    return bits;
  };
  const candidateRate = (bx, by) => { const m = maps; maps = null; const r = candidate(0, bx, by).R; maps = m; return r; };
  const candidate = (id, bx, by) => {
    const t = TRANSFORMS[id], w = t.width, h = t.height, bw = w / 8, bh = h / 8, area = bw * bh, size = w * h;
    const table = tableFor(id, comps, sizeScale, tables), order = naturalOrder(bw, bh), L = Math.max(w, h);
    const ti = (by >> 3) * cfl.width + (bx >> 3), factor = [cfl.x[ti] / 84, 0, cfl.b[ti] / 84];
    const pixels = new Float64Array(size), transformed = [];
    for (let c = 0; c < 3; c++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pixels[y * w + x] = planes[c][(by * 8 + y) * W + bx * 8 + x];
      transformed.push(SMALL.has(id) ? smallTransform(pixels, id) : scaledDCT(pixels, w, h));
    }
    const coeffs = [], dc = [], fine = fineOf(bx, by);
    let D = 0, R = 0;
    for (const c of [1, 0, 2]) {
      const tr = transformed[c], plane = new Int32Array(size), steps = table.planes[c];
      const low = lowFrequencies(tr, bw, bh), dcStep = comps[c].quant[0] / QS;
      dc[c] = Int32Array.from(low, v => Math.round(v * 8 / dcStep));
      let nz = 0, zeros = 0, run = 0, d = 0;
      const R0 = R;
      for (let k = area; k < size; k++) {
        const pos = order[k], step = steps[pos], [fx, fy] = freqOf(id, pos, sizeScale);
        const coefficient = tr[pos] - (c !== 1 ? factor[c] * transformed[1][pos] : 0);
        const v = coefficient * 8 * QS / step * fine, a = Math.abs(v);
        const high = fx >= 4 || fy >= 4, threshold = dead ? dead[c * 2 + (high ? 1 : 0)] : 0.5;
        const q = a < threshold ? 0 : Math.round(a);
        plane[pos] = v < 0 ? -q : q;
        const e = (a - recon(q, c)) * step / (8 * QS * fine);
        d += e * e;
        if (q) { nz++; R += rc[1] + rc[2] * Math.log2(q); zeros += run; run = 0; } else run++;
      }
      D += norm[c] * d * w * h;
      if (tokens) R += tokenBits(c, plane, order, area, size) - (R - R0);
      else R += rc[0] + rc[3] * zeros;
      coeffs[c] = plane;
    }
    if (maps) {
      let m = 0;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) m += maps[id][(by + y) * stride + bx + x];
      return {id, bx, by, bw, bh, area, size, order, coeffs, dc, J: m / mapTotal + lambda * R / rateTotal};
    }
    return {id, bx, by, bw, bh, area, size, order, coeffs, dc, R, J: D + lambda * R};
  };
  let maps = options.maps;
  let mapTotal = 1, rateTotal = 1;
  if (maps) {
    mapTotal = maps[0].reduce((a, b) => a + b, 0);
    rateTotal = 0;
    for (let by = 0; by < rows; by++) for (let bx = 0; bx < stride; bx++) rateTotal += candidateRate(bx, by);
  }
  const fits = (id, bx, by) => bx + TRANSFORMS[id].width / 8 <= stride && by + TRANSFORMS[id].height / 8 <= rows;
  const force = options.force;
  const best8 = (bx, by) => {
    if (force !== undefined) return candidate(SMALL.has(force) ? force : 0, bx, by);
    let best = candidate(0, bx, by);
    for (const id of [3, 12, 13]) if (allowed.has(id)) { const c = candidate(id, bx, by); if (c.J < best.J) best = c; }
    return best;
  };
  const best16 = (bx, by) => {
    if (force !== undefined && [4, 6, 7].includes(force) && fits(force, bx, by) && (force === 4 || fits(force, force === 6 ? bx + 1 : bx, force === 6 ? by : by + 1))) return {list: force === 4 ? [candidate(4, bx, by)] : force === 6 ? [candidate(6, bx, by), candidate(6, bx + 1, by)] : [candidate(7, bx, by), candidate(7, bx, by + 1)], J: -Infinity};
    let best = [0, 1, 2, 3].filter(i => bx + (i & 1) < stride && by + (i >> 1) < rows).map(i => best8(bx + (i & 1), by + (i >> 1)));
    let J = best.reduce((s, b) => s + b.J, 0);
    if (force !== undefined) return {list: best, J};
    const tryOne = list => { const j = list.reduce((s, b) => s + b.J, 0); if (j < J) { J = j; best = list; } };
    if (allowed.has(4) && fits(4, bx, by)) tryOne([candidate(4, bx, by)]);
    if (allowed.has(6) && fits(6, bx, by) && fits(6, bx + 1, by)) tryOne([candidate(6, bx, by), candidate(6, bx + 1, by)]);
    if (allowed.has(7) && fits(7, bx, by) && fits(7, bx, by + 1)) tryOne([candidate(7, bx, by), candidate(7, bx, by + 1)]);
    return {list: best, J};
  };
  const chosen = [];
  if (options.layout) for (const {id, bx, by} of options.layout) chosen.push(candidate(id, bx, by));
  else for (let cy = 0; cy < rows; cy += 4) for (let cx = 0; cx < stride; cx += 4) {
    const quads = [[0, 0], [2, 0], [0, 2], [2, 2]].filter(([x, y]) => cx + x < stride && cy + y < rows).map(([x, y]) => best16(cx + x, cy + y));
    let list = quads.flatMap(q => q.list), J = quads.reduce((s, q) => s + q.J, 0);
    if (force !== undefined && [5, 10, 11].includes(force)) J = Infinity;
    const tryOne = l => { const j = l.reduce((s, b) => s + b.J, 0); if (j < J) { J = j; list = l; } };
    const allow32 = id => force === undefined ? allowed.has(id) : force === id;
    if (allow32(5) && fits(5, cx, cy)) tryOne([candidate(5, cx, cy)]);
    if (allow32(10) && fits(10, cx, cy) && fits(10, cx + 2, cy)) tryOne([candidate(10, cx, cy), candidate(10, cx + 2, cy)]);
    if (allow32(11) && fits(11, cx, cy) && fits(11, cx, cy + 2)) tryOne([candidate(11, cx, cy), candidate(11, cx, cy + 2)]);
    chosen.push(...list);
  }
  const at = new Int32Array(stride * rows).fill(-1), byFirst = new Map();
  const components = comps.map(comp => ({h: 1, v: 1, stride, rows, quant: comp.quant, coeffs: new Int16Array(0), dc: new Int32Array(stride * rows)}));
  let wideCoefficients = false;
  for (const block of chosen) {
    byFirst.set(block.by * stride + block.bx, block);
    for (let y = 0; y < block.bh; y++) for (let x = 0; x < block.bw; x++) {
      const pos = (block.by + y) * stride + block.bx + x;
      at[pos] = -2;
      for (let c = 0; c < 3; c++) components[c].dc[pos] = block.dc[c][y * block.bw + x];
    }
    for (const plane of block.coeffs) for (const v of plane) if (v < -32768 || v > 32767) wideCoefficients = true;
    delete block.J; delete block.R;
  }
  const groups = [], blocks = [];
  for (let gy = 0; gy < Math.ceil(rows / 32); gy++) for (let gx = 0; gx < Math.ceil(stride / 32); gx++) {
    const group = [];
    for (let by = gy * 32; by < Math.min(rows, gy * 32 + 32); by++) for (let bx = gx * 32; bx < Math.min(stride, gx * 32 + 32); bx++) {
      const block = byFirst.get(by * stride + bx);
      if (block) { at[by * stride + bx] = blocks.length; blocks.push(block); group.push(block); }
    }
    groups.push(group);
  }
  const used = new Set(blocks.map(b => TRANSFORMS[b.id].table));
  for (const family of tables.keys()) if (!used.has(family)) tables.delete(family);
  const counts = {};
  for (const b of blocks) counts[TRANSFORMS[b.id].name] = (counts[TRANSFORMS[b.id].name] || 0) + 1;
  const {planes: _p, values: _v, ...rest} = base;
  return {image: {...rest, components, wideCoefficients, strategyData: {groups, blocks, at, tables, stride}}, counts,
    layout: blocks.map(({id, bx, by}) => ({id, bx, by}))};
}

function learnedOrders(image) {
  const counts = new Map();
  for (const block of image.strategyData.blocks) {
    const bucket = COEFFICIENT_ORDER_BUCKETS.find(b => b.strategies.includes(TRANSFORMS[block.id].name));
    if (!bucket || bucket.name === 'small') continue;
    let c3 = counts.get(bucket.name);
    if (!c3) counts.set(bucket.name, c3 = [0, 1, 2].map(() => new Float64Array(block.size)));
    for (let c = 0; c < 3; c++) for (let k = block.area; k < block.size; k++) if (block.coeffs[c][block.order[k]]) c3[c][k]++;
  }
  const value = {};
  for (const [name, c3] of counts) {
    const bucket = COEFFICIENT_ORDER_BUCKETS.find(b => b.name === name), skip = bucket.lowFrequencyCount, size = c3[0].length;
    value[name] = c3.map(n => {
      const rest = Array.from({length: size - skip}, (_, i) => i + skip).sort((a, b) => Math.floor(n[b] / 4) - Math.floor(n[a] / 4) || a - b);
      return [...Array.from({length: skip}, (_, i) => i), ...rest];
    });
  }
  return prepareCoefficientOrders(value, 1);
}

export function encodeStrategyImage(image, orders = true) {
  let best = null;
  for (const authored of orders ? [null, learnedOrders(image)] : [null]) {
    const img = {...image, authoredOrderPasses: authored}, shared = {}, plan = {clusters: {maxClusters: 32, newClusterCost: 160}};
    for (const p of [plan, {...plan, coding: buildAnsCoding, modularAns: writeModularAnsHistograms}]) {
      const bytes = complete(varDCTSteps(img, p, shared));
      if (!best || bytes.length < best.length) best = bytes;
    }
  }
  return best;
}

export function encodeXYBStrategies(rgba, width, height, quality, photoOptions, strategyOptions = {}) {
  const base = complete(photoXYBSteps(rgba, width, height, quality, {...photoOptions, keepPlanes: true}));
  const {image, counts, layout} = xybStrategies(base, width, height, {deadzone: photoOptions.deadzone, ...strategyOptions});
  return {bytes: encodeStrategyImage(image), counts, layout};
}

const FORCED = [0, 4, 6, 7, 5, 10, 11, 3, 12, 13];
export function strategyMaps(png, rgba, width, height, quality, photoOptions, options = {}) {
  const {p = 3, cache, tag = ''} = options;
  const key = cache && join(cache, basename(png) + '.' + quality + '.' + p + tag + '.maps');
  if (key && existsSync(key)) { const all = new Float64Array(readFileSync(key).buffer.slice(0)), n = all.length / FORCED.length;
    const maps = []; FORCED.forEach((id, i) => { maps[id] = all.subarray(i * n, (i + 1) * n); }); return maps; }
  const base = complete(photoXYBSteps(rgba, width, height, quality, {...photoOptions, keepPlanes: true}));
  const work = mkdtempSync(join(tmpdir(), 'xs-')), maps = [], stride = Math.ceil(width / 8), rows = Math.ceil(height / 8);
  try {
    for (const id of FORCED) {
      const {image} = xybStrategies(base, width, height, {deadzone: photoOptions.deadzone, force: id, smallScale: options.smallScale, sizeScale: options.sizeScale});
      const d = distanceMap(png, encodeStrategyImage(image, false), work), m = new Float64Array(stride * rows);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) m[(y >> 3) * stride + (x >> 3)] += d.map[y * width + x] ** p;
      maps[id] = m;
    }
  } finally { rmSync(work, {recursive: true}); }
  if (key) { const all = new Float64Array(maps[0].length * FORCED.length); FORCED.forEach((id, i) => all.set(maps[id], i * maps[0].length)); writeFileSync(key, new Uint8Array(all.buffer)); }
  return maps;
}

export function encodeClosedLoop(png, rgba, width, height, quality, photoOptions, options = {}) {
  const maps = strategyMaps(png, rgba, width, height, quality, photoOptions, options);
  const chosen = encodeXYBStrategies(rgba, width, height, quality, photoOptions, {...options, maps});
  if (!options.refine || !photoOptions.fieldScale) return chosen;
  const layout = chosen.layout, encode = field => encodeXYBStrategies(rgba, width, height, quality, {...photoOptions, fieldScale: field}, {...options, maps: null, layout}).bytes;
  const {field} = closedLoopField(png, width, height, encode, {...options.refine, start: photoOptions.fieldScale});
  return {bytes: encode(field), counts: chosen.counts, layout};
}
