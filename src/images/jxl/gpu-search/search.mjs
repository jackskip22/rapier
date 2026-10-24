// SPDX-License-Identifier: MIT
import {photoXYBSteps, preferXYB} from '../photo-xyb.mjs';
import {coefficientEffortSteps} from '../coefficient-effort.mjs';
import {coefficientAnsSteps} from '../coefficient-ans.mjs';
import {complete} from '../bits.mjs';
import {ssimulacra2, linearFromRGBA} from './ssimulacra2.mjs';

export function encodeWithField(rgba, width, height, quality, fieldScale, effort = 7, tune, extra = {}) {
  const image = complete(photoXYBSteps(rgba, width, height, quality, {fieldScale, tune, ...extra}));
  const stride = Math.ceil(width / 8), rows = Math.ceil(height / 8), nonzero = new Uint16Array(stride * rows), cost = new Float32Array(stride * rows);
  for (const comp of image.components) for (let b = 0; b < stride * rows; b++) {
    const at = b * 64;
    for (let k = 1; k < 64; k++) { const v = comp.coeffs[at + k]; if (v) { nonzero[b]++; cost[b] += 2 + 2 * Math.log2(1 + Math.abs(v)); } }
  }
  const bytes = complete(effort >= 5 ? coefficientAnsSteps(image, effort) : coefficientEffortSteps(image, effort));
  return {bytes, nonzero, cost};
}

export function cpuMetric(reference, width, height) {
  const n = width * height, ref = linearFromRGBA(reference, n);
  return decoded => ssimulacra2(ref, linearFromRGBA(decoded, n), width, height, {wantMap: true});
}

function blockSums(map, width, height) {
  const stride = Math.ceil(width / 8), rows = Math.ceil(height / 8), out = new Float64Array(stride * rows);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[(y >> 3) * stride + (x >> 3)] += map[y * width + x];
  return out;
}

function nextQuality(trials, target) {
  const sorted = [...trials].sort((a, b) => a.quality - b.quality);
  let lo = null, hi = null;
  for (const t of sorted) { if (t.score < target) lo = t; else if (!hi) hi = t; }
  if (lo && hi) return lo.quality + (target - lo.score) * (hi.quality - lo.quality) / (hi.score - lo.score);
  const [a, b] = sorted.length > 1 ? (lo ? sorted.slice(-2) : sorted.slice(0, 2)) : [sorted[0], {quality: sorted[0].quality + 5, score: sorted[0].score + 4}];
  const slope = Math.max(0.2, (b.score - a.score) / (b.quality - a.quality || 1));
  return Math.max(5, Math.min(99, a.quality + (target - a.score) / slope));
}

export function encodeToScore(rgba, width, height, {target = 80, decode, metric = cpuMetric(rgba, width, height), effort = 7,
  rounds = 6, exponent = 0.3, floor = 1.5, min = 0.4, max = 2.5, quality = 80, log = () => {}} = {}) {
  if (!preferXYB(rgba, width, height)) throw new Error('encodeToScore covers XYB photographs');
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
  let field = null, best = null;
  const trials = [], history = [];
  const measure = (q, f) => {
    const {bytes, nonzero} = encodeWithField(rgba, width, height, q, f, effort), result = metric(decode(bytes));
    const row = {quality: q, score: result.score, bytes: bytes.length};
    history.push({...row, field: !!f});
    if (row.score >= target && (!best || bytes.length < best.bytes.length)) best = {bytes, quality: q, score: row.score, field: f};
    log(row);
    return {row, result, nonzero};
  };
  for (let round = 0; round < rounds; round++) {
    const roundTrials = trials.filter(t => t.round === round);
    let q = roundTrials.length ? nextQuality(roundTrials, target) : quality;
    let m = measure(q, field);
    trials.push({...m.row, round});
    for (let tries = 0; tries < 2 && Math.abs(m.row.score - target) > 0.4; tries++) {
      q = nextQuality(trials.filter(t => t.round === round), target);
      m = measure(q, field); trials.push({...m.row, round});
    }
    const e = blockSums(m.result.map, width, height), n = m.nonzero;
    let se = 0, sn = 0;
    for (let b = 0; b < blocks; b++) { se += e[b]; sn += Math.max(floor, n[b]); }
    const lambda = se / sn, next = new Float64Array(blocks);
    for (let b = 0; b < blocks; b++) {
      const ratio = e[b] / (lambda * Math.max(floor, n[b]));
      const current = field ? field[b] : 1;
      next[b] = Math.max(min, Math.min(max, current * Math.pow(Math.max(1e-3, ratio), exponent)));
    }
    let logSum = 0;
    for (let b = 0; b < blocks; b++) logSum += Math.log(next[b]);
    const mean = Math.exp(logSum / blocks);
    for (let b = 0; b < blocks; b++) next[b] = Math.max(min, Math.min(max, next[b] / mean));
    field = next;
    trials.push(...[]);
    quality = q;
  }
  const finalTrials = [];
  let q = quality;
  for (let i = 0; i < 4; i++) {
    const m = measure(q, field); finalTrials.push(m.row);
    if (m.row.score >= target && m.row.score - target < 0.15) break;
    q = nextQuality(finalTrials, target + 0.05);
  }
  return {best, history};
}
