// SPDX-License-Identifier: MIT
import {TRANSFORMS} from './vardct-strategies.mjs';

export const CELL_FEATURES = 5;
const ilog = v => { if (v <= 0) return 0; const b = 31 - Math.clz32(v); return (b << 4) | (b >= 4 ? (v >> (b - 4)) & 15 : (v << (4 - b)) & 15); };

export function cellStatistics(rgba, width, height) {
  const stride = Math.ceil(width / 8), rows = Math.ceil(height / 8), n = stride * rows;
  const feats = new Int32Array(n * CELL_FEATURES), means = new Int32Array(n);
  const Y = new Int32Array(width * height), C = new Int32Array(width * height);
  for (let i = 0, o = 0; i < width * height; i++, o += 4) {
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2];
    Y[i] = r + 2 * g + b; C[i] = (b - g) * 2 + (r - g);
  }
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < stride; cx++) {
    const x0 = cx * 8, y0 = cy * 8, x1 = Math.min(width, x0 + 8), y1 = Math.min(height, y0 + 8);
    let sum = 0, gx = 0, gy = 0, lap = 0, csum = 0, count = 0;
    const quad = [0, 0, 0, 0], qn = [0, 0, 0, 0];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * width + x, v = Y[i];
      sum += v; csum += C[i]; count++;
      const q = (y - y0 >= 4 ? 2 : 0) + (x - x0 >= 4 ? 1 : 0); quad[q] += v; qn[q]++;
      if (x + 1 < x1) gx += Math.abs(Y[i + 1] - v);
      if (y + 1 < y1) gy += Math.abs(Y[i + width] - v);
      if (x > x0 && x + 1 < x1 && y > y0 && y + 1 < y1) lap += Math.abs(4 * v - Y[i - 1] - Y[i + 1] - Y[i - width] - Y[i + width]);
    }
    const mean = Math.trunc(sum / count), cmean = Math.trunc(csum / count);
    let cact = 0, qmin = Infinity, qmax = -Infinity;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cact += Math.abs(C[y * width + x] - cmean);
    for (let q = 0; q < 4; q++) if (qn[q]) { const m = Math.trunc(quad[q] / qn[q]); if (m < qmin) qmin = m; if (m > qmax) qmax = m; }
    const k = (cy * stride + cx) * CELL_FEATURES;
    feats[k] = ilog(gx); feats[k + 1] = ilog(gy); feats[k + 2] = ilog(lap); feats[k + 3] = ilog(qmax - qmin); feats[k + 4] = ilog(cact);
    means[cy * stride + cx] = mean;
  }
  return {stride, rows, feats, means};
}

export const REGION_INPUTS = 16 * CELL_FEATURES + 5 + 5 + 5 + 5 + 1;
export function regionInputs({stride, rows, feats, means}, quality) {
  const rw = Math.ceil(stride / 4), rh = Math.ceil(rows / 4), own = new Int32Array(rw * rh * 5);
  const cell = (x, y) => Math.min(rows - 1, y) * stride + Math.min(stride - 1, x);
  for (let ry = 0; ry < rh; ry++) for (let rx = 0; rx < rw; rx++) {
    const m = (dx, dy) => means[cell(rx * 4 + dx, ry * 4 + dy)];
    let spread = [0, 0, 0, 0], all = [Infinity, -Infinity], hor = 0, ver = 0, act = 0;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const v = m(dx, dy), q = (dy >= 2 ? 2 : 0) + (dx >= 2 ? 1 : 0);
      if (v < all[0]) all[0] = v; if (v > all[1]) all[1] = v;
      if (dx < 3) hor += Math.abs(m(dx + 1, dy) - v);
      if (dy < 3) ver += Math.abs(m(dx, dy + 1) - v);
      act += feats[cell(rx * 4 + dx, ry * 4 + dy) * CELL_FEATURES + 2];
    }
    for (let q = 0; q < 4; q++) {
      const qx = (q & 1) * 2, qy = (q >> 1) * 2, vs = [m(qx, qy), m(qx + 1, qy), m(qx, qy + 1), m(qx + 1, qy + 1)];
      spread[q] = Math.max(...vs) - Math.min(...vs);
    }
    const k = (ry * rw + rx) * 5;
    own[k] = ilog(spread[0] + spread[1] + spread[2] + spread[3]); own[k + 1] = ilog(all[1] - all[0]); own[k + 2] = ilog(hor); own[k + 3] = ilog(ver); own[k + 4] = act >> 4;
  }
  const global = new Int32Array(5);
  for (let i = 0; i < rw * rh; i++) for (let j = 0; j < 5; j++) global[j] += own[i * 5 + j];
  for (let j = 0; j < 5; j++) global[j] = Math.trunc(global[j] / (rw * rh));
  const out = new Int32Array(rw * rh * REGION_INPUTS);
  for (let ry = 0; ry < rh; ry++) for (let rx = 0; rx < rw; rx++) {
    let o = (ry * rw + rx) * REGION_INPUTS;
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) {
      const c = cell(rx * 4 + dx, ry * 4 + dy) * CELL_FEATURES;
      for (let j = 0; j < CELL_FEATURES; j++) out[o++] = feats[c + j];
    }
    for (let j = 0; j < 5; j++) out[o++] = own[(ry * rw + rx) * 5 + j];
    const around = [0, 0, 0, 0, 0], most = [0, 0, 0, 0, 0];
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = rx + dx, y = ry + dy;
      if (x < 0 || y < 0 || x >= rw || y >= rh) continue;
      count++;
      for (let j = 0; j < 5; j++) { const v = own[(y * rw + x) * 5 + j]; around[j] += v; if (v > most[j]) most[j] = v; }
    }
    for (let j = 0; j < 5; j++) out[o++] = Math.trunc(around[j] / count);
    for (let j = 0; j < 5; j++) out[o++] = most[j];
    for (let j = 0; j < 5; j++) out[o++] = global[j];
    out[o++] = Math.round(quality * 4);
  }
  return {rw, rh, inputs: out};
}

const DCT8 = 0, DCT16 = 4, DCT32 = 5, TALL8 = 6, WIDE8 = 7, TALL16 = 10, WIDE16 = 11;
export const REGION_OUTPUTS = 20;
export function regionLayout(scores, rw, rh, stride, rows) {
  const layout = [];
  const fits = (bx, by, id) => bx + (TRANSFORMS[id].width >> 3) <= stride && by + (TRANSFORMS[id].height >> 3) <= rows;
  const put = (bx, by, id) => { if (bx < stride && by < rows) layout.push({id, bx, by}); };
  const quadrant = (bx, by, s) => {
    const choice = argmax(s, 4);
    if (choice === 0 && fits(bx, by, DCT16)) return put(bx, by, DCT16);
    if (choice === 1 && fits(bx, by, TALL8) && fits(bx + 1, by, TALL8)) { put(bx, by, TALL8); put(bx + 1, by, TALL8); return; }
    if (choice === 2 && fits(bx, by, WIDE8) && fits(bx, by + 1, WIDE8)) { put(bx, by, WIDE8); put(bx, by + 1, WIDE8); return; }
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) put(bx + dx, by + dy, DCT8);
  };
  for (let ry = 0; ry < rh; ry++) for (let rx = 0; rx < rw; rx++) {
    const s = scores.subarray((ry * rw + rx) * REGION_OUTPUTS), bx = rx * 4, by = ry * 4, choice = argmax(s, 4);
    if (choice === 0 && fits(bx, by, DCT32)) { put(bx, by, DCT32); continue; }
    if (choice === 1 && fits(bx, by, TALL16) && fits(bx + 2, by, TALL16)) { put(bx, by, TALL16); put(bx + 2, by, TALL16); continue; }
    if (choice === 2 && fits(bx, by, WIDE16) && fits(bx, by + 2, WIDE16)) { put(bx, by, WIDE16); put(bx, by + 2, WIDE16); continue; }
    for (let q = 0; q < 4; q++) quadrant(bx + (q & 1) * 2, by + (q >> 1) * 2, s.subarray(4 + q * 4));
  }
  return layout.sort((a, b) => (a.by - b.by) || (a.bx - b.bx));
}
function argmax(s, n) { let k = 0; for (let i = 1; i < n; i++) if (s[i] > s[k]) k = i; return k; }

export function layoutTargets(blocks, stride, rows) {
  const rw = Math.ceil(stride / 4), rh = Math.ceil(rows / 4), out = new Int8Array(rw * rh * 5).fill(-1);
  const at = (x, y) => x < stride && y < rows ? blocks[y * stride + x] : 255;
  const quadrant = (bx, by) => { const id = at(bx, by); return id === DCT16 ? 0 : id === TALL8 ? 1 : id === WIDE8 ? 2 : 3; };
  for (let ry = 0; ry < rh; ry++) for (let rx = 0; rx < rw; rx++) {
    const bx = rx * 4, by = ry * 4, id = at(bx, by), k = (ry * rw + rx) * 5;
    if (bx + 4 > stride || by + 4 > rows) { for (let q = 0; q < 4; q++) out[k + 1 + q] = quadrant(bx + (q & 1) * 2, by + (q >> 1) * 2); continue; }
    out[k] = id === DCT32 || id === 18 ? 0 : id === TALL16 ? 1 : id === WIDE16 ? 2 : 3;
    if (out[k] === 3) for (let q = 0; q < 4; q++) out[k + 1 + q] = quadrant(bx + (q & 1) * 2, by + (q >> 1) * 2);
  }
  return out;
}

export const REGION_INPUTS_2 = 16 + 16 + 12 + 3 + 2 + 1;
const cosines = new Map();
const cosine = n => cosines.get(n) ?? cosines.set(n, Float64Array.from({length: n * n}, (_, i) => {
  const k = (i / n) | 0, x = i % n; return Math.sqrt((k ? 2 : 1) / n) * Math.cos(Math.PI * (2 * x + 1) * k / (2 * n));
})).get(n);
function rate(Y, width, height, x0, y0, w, h, step) {
  const cw = cosine(w), ch = cosine(h), rows = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    const yy = Math.min(height - 1, y0 + y) * width;
    for (let u = 0; u < w; u++) { let s = 0; for (let x = 0; x < w; x++) s += cw[u * w + x] * Y[yy + Math.min(width - 1, x0 + x)]; rows[y * w + u] = s; }
  }
  let bits = 0;
  for (let u = 0; u < w; u++) for (let v = 0; v < h; v++) {
    if (!u && !v) continue;
    let s = 0; for (let y = 0; y < h; y++) s += ch[v * h + y] * rows[y * w + u];
    bits += Math.log2(1 + Math.abs(s) / (step * (1 + 4 * (u / w + v / h))));
  }
  return bits;
}
export function regionInputs2(rgba, width, height, quality) {
  const stride = Math.ceil(width / 8), rows = Math.ceil(height / 8), rw = Math.ceil(stride / 4), rh = Math.ceil(rows / 4);
  const Y = new Float64Array(width * height), C = new Int32Array(width * height);
  for (let i = 0, o = 0; i < width * height; i++, o += 4) { Y[i] = (rgba[o] + 2 * rgba[o + 1] + rgba[o + 2]) / 4; C[i] = (rgba[o + 2] - rgba[o + 1]) * 2 + (rgba[o] - rgba[o + 1]); }
  const step = 3 * Math.max(0.1, (100 - quality) / 10), q = v => Math.round(v * 16);
  const own = new Float64Array(rw * rh), out = new Int32Array(rw * rh * REGION_INPUTS_2);
  for (let ry = 0; ry < rh; ry++) for (let rx = 0; rx < rw; rx++) {
    const x0 = rx * 32, y0 = ry * 32, R = (x, y, w, h) => rate(Y, width, height, x0 + x, y0 + y, w, h, step);
    let o = (ry * rw + rx) * REGION_INPUTS_2, total = 0;
    for (let c = 0; c < 16; c++) { const b = R((c & 3) * 8, (c >> 2) * 8, 8, 8); total += b; out[o++] = q(b); }
    for (let c = 0; c < 16; c++) {
      const cx = x0 + (c & 3) * 8, cy = y0 + (c >> 2) * 8; let s = 0, m = 0, n = 0;
      for (let y = cy; y < Math.min(height, cy + 8); y++) for (let x = cx; x < Math.min(width, cx + 8); x++) { m += C[y * width + x]; n++; }
      m = n ? m / n : 0;
      for (let y = cy; y < Math.min(height, cy + 8); y++) for (let x = cx; x < Math.min(width, cx + 8); x++) s += Math.abs(C[y * width + x] - m);
      out[o++] = q(Math.log2(1 + s / Math.max(1, n)));
    }
    for (let k = 0; k < 4; k++) {
      const qx = (k & 1) * 16, qy = (k >> 1) * 16;
      out[o++] = q(R(qx, qy, 16, 16)); out[o++] = q(R(qx, qy, 8, 16) + R(qx + 8, qy, 8, 16)); out[o++] = q(R(qx, qy, 16, 8) + R(qx, qy + 8, 16, 8));
    }
    out[o++] = q(R(0, 0, 32, 32)); out[o++] = q(R(0, 0, 16, 32) + R(16, 0, 16, 32)); out[o++] = q(R(0, 0, 32, 16) + R(0, 16, 32, 16));
    own[ry * rw + rx] = total;
  }
  for (let ry = 0; ry < rh; ry++) for (let rx = 0; rx < rw; rx++) {
    let s = 0, n = 0, most = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = rx + dx, y = ry + dy; if (x < 0 || y < 0 || x >= rw || y >= rh) continue; s += own[y * rw + x]; n++; most = Math.max(most, own[y * rw + x]); }
    const o = (ry * rw + rx + 1) * REGION_INPUTS_2 - 3;
    out[o] = q(s / n / 16); out[o + 1] = q(most / 16); out[o + 2] = Math.round(quality * 4);
  }
  return {rw, rh, inputs: out};
}
