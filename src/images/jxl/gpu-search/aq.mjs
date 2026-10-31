// SPDX-License-Identifier: MIT
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const tools = process.env.JXL_TOOLS || '/home/user/tools/libjxl/tools';

export function readPfm(bytes) {
  let at = 0;
  const line = () => { const end = bytes.indexOf(0x0a, at), text = bytes.subarray(at, end).toString().trim(); at = end + 1; return text; };
  line();
  const [width, height] = line().split(/\s+/).map(Number);
  line();
  const floats = new Float32Array(bytes.buffer.slice(bytes.byteOffset + at, bytes.byteOffset + at + width * height * 4));
  const map = new Float64Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) map[y * width + x] = floats[(height - 1 - y) * width + x];
  return {width, height, map};
}

export function distanceMap(png, jxlBytes, work) {
  const file = join(work, 'aq.jxl'), pfm = join(work, 'aq.pfm');
  writeFileSync(file, jxlBytes);
  const out = execFileSync(join(tools, 'butteraugli_main'), [png, file, '--pnorm', '3', '--rawdistmap', pfm]).toString();
  return {ba3: Number(/3-norm: ([\d.]+)/.exec(out)[1]), max: Number(out.split('\n')[0]), ...readPfm(readFileSync(pfm))};
}

export function blockDistances({map, width, height}, margin = 2) {
  const stride = Math.ceil(width / 8), rows = Math.ceil(height / 8), out = new Float64Array(stride * rows);
  for (let by = 0; by < rows; by++) for (let bx = 0; bx < stride; bx++) {
    let m = 0;
    for (let y = Math.max(0, by * 8 - margin); y < Math.min(height, by * 8 + 8 + margin); y++)
      for (let x = Math.max(0, bx * 8 - margin); x < Math.min(width, bx * 8 + 8 + margin); x++) m = Math.max(m, map[y * width + x]);
    out[by * stride + bx] = m;
  }
  return out;
}

export function smoothField(field, levels, switchCost) {
  const n = field.length, L = levels.length, logs = levels.map(Math.log);
  const cost = new Float64Array(L), next = new Float64Array(L), back = new Uint8Array(n * L);
  for (let i = 0; i < n; i++) {
    const lf = Math.log(field[i]);
    let bestPrev = 0;
    for (let j = 1; j < L; j++) if (cost[j] < cost[bestPrev]) bestPrev = j;
    for (let j = 0; j < L; j++) {
      const stay = cost[j], move = cost[bestPrev] + switchCost;
      const from = i === 0 || stay <= move ? j : bestPrev;
      back[i * L + j] = from;
      next[j] = (i === 0 ? 0 : Math.min(stay, move)) + (lf - logs[j]) ** 2;
    }
    cost.set(next);
  }
  let j = 0;
  for (let k = 1; k < L; k++) if (cost[k] < cost[j]) j = k;
  const out = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { out[i] = levels[j]; j = back[i * L + j]; }
  return out;
}

export function closedLoopField(png, width, height, encode, {rounds = 3, gamma = 0.5, aimQuantile = 0.7, min = 0.6, max = 2,
  levels = [0.6, 0.7, 0.8, 0.9, 1, 1.12, 1.25, 1.4, 1.6, 1.8, 2], switchCost = 0.05, margin = 2, tie = false, normalize = true, gammaDown = gamma, start = null} = {}) {
  const work = mkdtempSync(join(tmpdir(), 'aq-')), blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
  let field = start ? Float64Array.from(start) : new Float64Array(blocks).fill(1), sharpness = null;
  const sharpOf = f => Int16Array.from(f, v => Math.max(0, Math.min(7, Math.round(7 * v))));
  try {
    for (let round = 0; round < rounds; round++) {
      const d = blockDistances(distanceMap(png, encode(round || start ? field : null, sharpness), work), margin);
      const sorted = Float64Array.from(d).sort(), aim = sorted[Math.min(blocks - 1, Math.floor(aimQuantile * blocks))];
      let raw = new Float64Array(blocks);
      for (let b = 0; b < blocks; b++) raw[b] = Math.max(min, Math.min(max, field[b] * Math.pow(Math.max(1e-3, d[b]) / aim, d[b] > aim ? gamma : gammaDown)));
      if (normalize) {
        let s = 0; for (const v of raw) s += Math.log(v);
        const mean = Math.exp(s / blocks); for (let b = 0; b < blocks; b++) raw[b] = Math.max(min, Math.min(max, raw[b] / mean));
      }
      field = smoothField(raw, levels, switchCost);
      if (tie) sharpness = sharpOf(field);
    }
  } finally { rmSync(work, {recursive: true}); }
  return {field, sharpness};
}
