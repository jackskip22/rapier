// SPDX-License-Identifier: MIT
import {fault} from './fault.mjs';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const aimPow = (v, aim, g, gd) => Math.pow(Math.max(1e-3, v / aim), v > aim ? g : gd);

export function fieldValues(d, field, raw, active, aim, gamma, gammaDown, min, max, from, to) {
  for (let b = from; b < to; b++) if (!active || active[b]) raw[b] = clamp(field[b] * aimPow(d[b], aim, gamma, gammaDown), min, max);
}
export function fieldLogSum(raw, active, from, to, sum = 0) {
  for (let b = from; b < to; b++) if (!active || active[b]) sum += Math.log(raw[b]);
  return sum;
}
export function normalizeField(raw, active, mean, min, max, from, to) {
  for (let b = from; b < to; b++) if (!active || active[b]) raw[b] = clamp(raw[b] / mean, min, max);
}
export function smoothForward(field, levels, logs, switchCost, active, cost, next, back, from, to) {
  const L = levels.length;
  for (let i = from; i < to; i++) {
    const fixed = active && !active[i], lf = fixed ? 0 : Math.log(field[i]);
    let best = 0;
    for (let j = 1; j < L; j++) if (cost[j] < cost[best]) best = j;
    for (let j = 0; j < L; j++) {
      const stay = cost[j], move = cost[best] + switchCost, d = lf - logs[j];
      back[i * L + j] = !i || stay <= move ? j : best;
      next[j] = fixed && levels[j] !== 1 ? Infinity : (i ? Math.min(stay, move) : 0) + d * d;
    }
    cost.set(next);
  }
}
export function smoothBacktrack(out, levels, back, from, to, j) {
  for (let i = from; i >= to; i--) { out[i] = levels[j]; j = back[i * levels.length + j]; }
  return j;
}
export function distanceBounds(d, doubt, active, low, high, from, to) {
  for (let b = from; b < to; b++) if (!active || active[b]) { low[b] = d[b] * (1 - doubt[b]); high[b] = d[b] * (1 + doubt[b]); }
}
export function fieldRangeValues(dLow, dHigh, field, active, low, high, aimLo, aimHi, gamma, gammaDown, min, max, from, to) {
  for (let b = from; b < to; b++) if (!active || active[b]) {
    const lr = Math.max(1e-3, dLow[b] / aimHi), hr = Math.max(1e-3, dHigh[b] / aimLo);
    const a = dHigh[b] <= aimLo ? gammaDown : gamma, c = dLow[b] > aimHi ? gamma : gammaDown;
    low[b] = clamp(field[b] * Math.min(Math.pow(lr, a), Math.pow(lr, c)), min, max);
    high[b] = clamp(field[b] * Math.max(Math.pow(hr, a), Math.pow(hr, c)), min, max);
  }
}
export function centralLogSum(d, field, aim, gamma, gammaDown, min, max, from, to, sum = 0) {
  for (let b = from; b < to; b++) sum += Math.log(clamp(field[b] * aimPow(d[b], aim, gamma, gammaDown), min, max));
  return sum;
}
export function intervalLogSums(low, high, active, from, to, sl = 0, sh = 0) {
  for (let b = from; b < to; b++) if (!active || active[b]) { sl += Math.log(low[b]); sh += Math.log(high[b]); }
  return [sl, sh];
}
export function normalizeRanges(low, high, active, meanLo, meanHi, min, max, from, to) {
  for (let b = from; b < to; b++) if (!active || active[b]) {
    const l = clamp(low[b] / meanHi, min, max), h = clamp(high[b] / meanLo, min, max);
    low[b] = l; high[b] = h;
  }
}
export function logRanges(low, high, active, lo, hi, from, to) {
  for (let b = from; b < to; b++) if (!active || active[b]) { lo[b] = Math.log(low[b]) - 1e-12; hi[b] = Math.log(high[b]) + 1e-12; }
}
export function appendAimOpen(low, high, doubt, active, aimLo, aimHi, from, to, output) {
  if (aimLo < aimHi) for (let b = from; b < to; b++)
    if ((!active || active[b]) && doubt[b] && low[b] <= aimHi && high[b] >= aimLo) output.push(b);
}
export function pathLevels(path, levels, active, level, from, to) {
  for (let i = from; i < to; i++) {
    if (active && !active[i] && path[i] !== 1) throw fault('JXL_INTERNAL', 'aq-cursor-kernels:inactive');
    level[i] = levels.indexOf(path[i]);
  }
}
function pathTerm(lo, hi, level, levels, logs, active, i, j) {
  if (active && !active[i]) return levels[j] === 1 ? 0 : Infinity;
  const a = lo[i] - logs[j], b = hi[i] - logs[j], a2 = a * a, b2 = b * b;
  return j === level[i] ? Math.max(a2, b2) : a <= 0 && b >= 0 ? 0 : Math.min(a2, b2);
}
function pathSweep(lo, hi, level, levels, logs, active, switchCost, M, from, to, step, edge) {
  const L = levels.length;
  for (let i = from; step > 0 ? i < to : i >= to; i += step) {
    let best = Infinity, p = (i - step) * L;
    if (i !== edge) for (let j = 0; j < L; j++) if (M[p + j] < best) best = M[p + j];
    for (let j = 0; j < L; j++) M[i * L + j] = pathTerm(lo, hi, level, levels, logs, active, i, j) + (i !== edge ? Math.min(M[p + j], best + switchCost) : 0);
  }
}
export const pathForward = (lo, hi, level, levels, logs, active, switchCost, F, from, to) =>
  pathSweep(lo, hi, level, levels, logs, active, switchCost, F, from, to, 1, 0);
export const pathBackward = (lo, hi, level, levels, logs, active, switchCost, B, n, from, to) =>
  pathSweep(lo, hi, level, levels, logs, active, switchCost, B, from, to, -1, n - 1);
export function pathOwnCost(lo, hi, level, levels, logs, active, switchCost, from, to, own = 0) {
  for (let i = from; i < to; i++) own += pathTerm(lo, hi, level, levels, logs, active, i, level[i]) + (i && level[i] !== level[i - 1] ? switchCost : 0);
  return own;
}
export function appendPathOpen(lo, hi, level, levels, logs, active, F, B, own, margin, from, to, output) {
  const L = levels.length;
  for (let i = from; i < to; i++) if (!active || active[i]) for (let j = 0; j < L; j++)
    if (j !== level[i] && F[i * L + j] + B[i * L + j] - pathTerm(lo, hi, level, levels, logs, active, i, j) <= own + margin) { output.push(i); break; }
}
export function smoothWinner(cost) {
  let j = 0;
  for (let k = 1; k < cost.length; k++) if (cost[k] < cost[j]) j = k;
  return j;
}
export function fieldPointRange(field, active, point, from, to) {
  for (let b = from; b < to; b++) point[b] = active[b] ? Math.log(field[b]) : 0;
}
