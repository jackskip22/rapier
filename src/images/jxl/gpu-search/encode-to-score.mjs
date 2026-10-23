// SPDX-License-Identifier: MIT
import {encodeWithField} from './search.mjs';
import {SETTINGS} from './settings.mjs';
import {ssimulacra2, linearFromRGBA} from './ssimulacra2.mjs';
import {butteraugli, butteraugliReference} from './butteraugli.mjs';

export function meets(scores, target) {
  return (target.ssimulacra2 === undefined || scores.ssimulacra2 >= target.ssimulacra2)
    && (target.butteraugli3 === undefined || scores.butteraugli3 <= target.butteraugli3)
    && (target.butteraugli === undefined || scores.butteraugli <= target.butteraugli);
}

function margin(scores, target) {
  const m = [];
  if (target.ssimulacra2 !== undefined) m.push((scores.ssimulacra2 - target.ssimulacra2) / 1.0);
  if (target.butteraugli3 !== undefined) m.push((target.butteraugli3 - scores.butteraugli3) / (0.04 * target.butteraugli3));
  if (target.butteraugli !== undefined) m.push((target.butteraugli - scores.butteraugli) / (0.04 * target.butteraugli));
  return Math.min(...m);
}

export function cpuMeasure(rgba, width, height, decode, target) {
  const n = width * height, ref = linearFromRGBA(rgba, n);
  const ba = target.butteraugli3 !== undefined || target.butteraugli !== undefined ? butteraugliReference(ref, width, height) : null;
  return async bytes => {
    const lin = linearFromRGBA(await decode(bytes), n), out = {};
    if (target.ssimulacra2 !== undefined) out.ssimulacra2 = ssimulacra2(ref, lin, width, height).score;
    if (ba) { const r = butteraugli(ba, lin); out.butteraugli = r.score; out.butteraugli3 = r.pnorm3; }
    return out;
  };
}

export async function encodeToScore(rgba, width, height, {target, measure, settings = ['v6tuned2', 'v6tuned3', 'v6tuned4'], effort = 7,
  probes = 7, low = 30, high = 99, onProbe = () => {}} = {}) {
  if (!target || !measure) throw new Error('encodeToScore needs a target and a measure');
  let best = null;
  const all = [];
  for (const name of settings) {
    const {tune, ...extra} = SETTINGS[name];
    const tried = new Map();
    const probe = async quality => {
      quality = Math.round(quality * 100) / 100;
      if (tried.has(quality)) return tried.get(quality);
      const started = performance.now(), {bytes} = encodeWithField(rgba, width, height, quality, null, effort, tune, extra);
      const encodeMs = performance.now() - started, scores = await measure(bytes), measureMs = performance.now() - started - encodeMs;
      const row = {setting: name, quality, bytes: bytes.length, ...scores, pass: meets(scores, target), encodeMs, measureMs};
      tried.set(quality, row); all.push(row); onProbe(row);
      if (row.pass && (!best || bytes.length < best.bytes.length)) best = {bytes, row};
      return row;
    };
    let lo = low, hi = high, q = 85;
    for (let i = 0; i < probes; i++) {
      const row = await probe(q), m = margin(row, target);
      if (row.pass) hi = q; else lo = q;
      if (row.pass && m < 0.15) break;
      const step = Math.max(-12, Math.min(12, -m * 1.5));
      let next = q + step;
      if (next <= lo || next >= hi) next = (lo + hi) / 2;
      if (hi - lo < 0.05) break;
      q = next;
    }
    if (!tried.size || ![...tried.values()].some(r => r.pass)) await probe(high);
  }
  if (!best) throw new Error('No probed setting met the target');
  return {...best.row, size: best.row.bytes, bytes: best.bytes, probes: all};
}
