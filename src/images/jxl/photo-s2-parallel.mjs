// SPDX-License-Identifier: MIT
import {sharing} from './offload.mjs';
import {s2Dims, scoresFromSums} from './photo-s2-stream.mjs';

let nextId = 0;
const ctl = u => ({offload: 'run', task: {kind: 'm', u}});

export function* openParallelS2(reference, width, height, outputs, libjxl, rc, minScore) {
  if (width < 16 || height < 16 || !sharing('score-band') || !reference?.rgba) return null;
  let leased = yield ctl();
  if (!leased || leased.length < 2) { if (leased?.length) yield ctl(leased); return null; }
  const dims = s2Dims(width, height), nS = dims.length, w = leased.length, o2 = outputs > 1;
  const defs = o2 ? (w >= 5 ? [2, 10, 21, 0, 8] : w >= 3 ? [7, 15, 16] : [23, 16]) : w >= 3 ? [2, 5, 0] : [7, 0];
  const parts = defs.map((v, i) => [v > 15 ? [0, 1] : [v >> 3], (v & 7) || 7, v & 7 ? 0 : 1, leased[i]]);
  const tr = reference.transform, maxR = Math.min(height, 128), nImg = 1 + outputs, px = width * maxR, srcB = px * 4, per = nImg * 16 * px;
  const rcKey = rc ? [width, height, outputs, +libjxl, ...parts.map(p => p[3].member.id)].join() : '';
  const warm = !!(rc && rc._k === rcKey), rcId = rc ? (rc._i ??= ++nextId) : 0;
  const buf = rc?._b?.byteLength >= 2 * per ? rc._b : new SharedArrayBuffer(2 * per);
  if (rc) rc._b = buf;
  const send = (h, d) => h.send({ticket: ++nextId, task: {kind: 'm', d}}, []);
  let si = 0, open = 0, prev = null, state = 0, up = null, sums = null;
  function* wait() {
    if (!prev) return 1;
    const p = prev; prev = null;
    const r = yield {await: Promise.all(p)};
    return !r || r.some(v => !v?.r) ? (state = -1, 0) : r;
  }
  function* end(u) {
    yield* wait();
    if (open) { open = 0; yield {await: Promise.all(parts.map(p => send(p[3], [0, 0, 0, 0, 0, 1])))}; }
    if (u && leased) { yield ctl(leased); leased = null; }
  }
  return {
    *push(y, rows, pictures) {
      if (state) return state > 0;
      const w4 = width * 4;
      for (let off = 0; off < rows && !state; ) {
        const subR = Math.min(maxR, rows - off), subY = y + off, last = subY + subR === height, n0 = subR * width, at = si * per;
        const srcs = [], xybs = [], q = [];
        const inp = (k, a, b) => tr ? {rgba: srcs[k].subarray(a * 4, b * 4), transform: tr} : {rgba: srcs[k].subarray(a * 4, b * 4)};
        for (let k = warm ? 1 : 0; k < nImg; k++) {
          const src = k ? (pictures[k - 1]?.rgba ?? pictures[k - 1]) : reference.rgba, base = k ? off : subY;
          (srcs[k] = new Uint8Array(buf, at + k * srcB, n0 * 4)).set(src.subarray(base * w4, (base + subR) * w4));
          xybs[k] = [0, 1, 2].map(c => new Float32Array(buf, at + (nImg + k * 3 + c) * srcB, n0));
          for (let i = 0, n = Math.min(w, subR); i < n; i++) {
            const r0 = (i * subR / n) | 0, r1 = ((i + 1) * subR / n) | 0;
            if (r1 > r0) q.push([width, r1 - r0, inp(k, r0 * width, r1 * width), xybs[k].map(p => p.subarray(r0 * width, r1 * width)), libjxl]);
          }
        }
        const cur = prev; prev = null;
        const ok = yield {await: Promise.all(leased.map(async (h, i) => {
          try {
            if (cur?.[i] && !(await cur[i])?.r) return q.length = 0;
            while (q.length) if (!(await send(h, q.pop()))?.r) return q.length = 0;
            return 1;
          } catch { return q.length = 0; }
        }))};
        if (!ok || ok.some(v => !v)) return state = -1, false;
        const want = last || (off + subR === rows && minScore !== undefined && (warm || !rc) && subY + subR >= 68), first = !open;
        open = 1;
        const xOf = (k, m) => ({xyb: [0, 1, 2].filter(c => m & (1 << c)).map(c => xybs[k][c])});
        prev = parts.map(([os, m, a, h]) => send(h, [
          subY, subR, warm ? null : a ? inp(0, 0, n0) : xOf(0, m), os.map(o => a ? inp(1 + o, 0, n0) : xOf(1 + o, m)), want, last,
          first && [width, height, os.length, libjxl, [m, a, a ? nS - 1 : 0]], first && rcId,
        ]));
        si ^= 1; off += subR;
        if (want) {
          const br = yield* wait();
          if (!br) return false;
          const merged = pictures.map(() => dims.map(() => new Float64Array(18)));
          parts.forEach(([os, m, a], i) => os.forEach((o, oi) => br[i].r[oi].forEach((src, j) => {
            if (src) for (let c = 0; c < 3; c++) if (m & (1 << c)) merged[o][a + j].set(src.subarray(c * 6, c * 6 + 6), c * 6);
          })));
          const sc = scoresFromSums(dims, merged);
          if (last) { open = 0; sums = merged; up = sc; if (rc) rc._k = rcKey; }
          else if (Math.min(...sc) + 1e-11 < minScore) { state = 1; up = sc; yield* end(); }
        }
      }
      return state >= 0;
    },
    *finish() { return state < 0 ? null : up; },
    get sums() { return sums; },
    get done() { return state > 0; },
    *release() { yield* end(1); },
  };
}
