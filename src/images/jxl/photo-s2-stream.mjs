// SPDX-License-Identifier: MIT
import {fault} from './fault.mjs';
import {scaleBand, scaleBandPair, pairState, bandState, residentScratch, downsample, referenceArena, useReferenceArena, clearReferenceProbe, releaseReferenceArena} from './ssimulacra2-arithmetic.mjs';
import {GAUSS32, scaleNorm, scoreNorms} from './ssimulacra2.mjs';
import {SCALES} from './ssimulacra2-reference.mjs';

const rowsOf = (held, y, rows, w) => held.rgba
  ? {rgba: held.rgba.subarray((y - held.y) * w * 4, (y - held.y + rows) * w * 4), ...(held.transform && {transform: held.transform})}
  : held.xyb ? {xyb: held.xyb.map(p => p.subarray((y - held.y) * w, (y - held.y + rows) * w))}
  : held.planes ? held.planes.map(p => p.subarray((y - held.y) * w, (y - held.y + rows) * w)) : {};
const ROOM = 32;
function append(held, more, rows, w, keep, room = ROOM) {
  const per = more.rgba ? w * 4 : w, drop = Math.max(0, keep - held.y), left = held.rows - drop, need = (left + rows) * per;
  const join = (old, add) => {
    const out = held.own && old.length >= need ? old : new add.constructor(need + room * per);
    if (left > 0 && out !== old) out.set(old.subarray(drop * per, held.rows * per));
    else if (left > 0 && drop > 0) out.copyWithin(0, drop * per, held.rows * per);
    out.set(add.subarray(0, rows * per), left * per);
    return out;
  };
  return more.rgba ? {y: held.y + drop, rows: left + rows, own: true, rgba: join(held.rgba ?? new Uint8Array(0), more.rgba), ...(more.transform && {transform: more.transform})}
    : more.xyb ? {y: held.y + drop, rows: left + rows, own: true, xyb: more.xyb.map((p, i) => join(held.xyb?.[i] ?? new Float32Array(0), p))}
    : {y: held.y + drop, rows: left + rows, own: true, planes: [0, 1, 2].map(c => join(held.planes?.[c] ?? new Float32Array(0), more[c]))};
}

export const s2Dims = (width, height) => {
  const dims = [];
  for (let s = 0, w = width, h = height; s < SCALES; s++) {
    if (s) { if (w < 8 || h < 8) break; w = (w + 1) >> 1; h = (h + 1) >> 1; }
    dims.push({w, h});
  }
  return dims;
};

export function scoresFromSums(dims, sumsByOutput, useBound = false) {
  return sumsByOutput.map(perScale => {
    const norms = dims.map(({w, h}, s) => {
      const per = {ssim: new Float64Array(6), edge: new Float64Array(12)}, sums = perScale[s];
      if (sums) for (let c = 0; c < 3; c++) scaleNorm(per, c, sums.subarray(c * 6, c * 6 + 6), w * h);
      return per;
    });
    if (!useBound) return scoreNorms(norms).score;
    const e0 = norms[0].edge.slice();
    e0[0] = 0; e0[1] = 0; e0[8] = 0; e0[9] = 0;
    return [scoreNorms(norms).score - 1e-11, scoreNorms([{ssim: norms[0].ssim, edge: e0}, ...norms.slice(1)]).score + 1e-11];
  });
}

const AGAIN = 12;
function uploadS2Stream(reference, width, height) {
  if (width < 8 || height < 8) throw fault('JXL_INTERNAL', 'photo-s2-stream:size');
  const viewRef = ArrayBuffer.isView(reference.rgba), scales = [];
  for (let s = 0, w = width, h = height; s < SCALES; s++) {
    if (s) { if (w < 8 || h < 8) break; w = (w + 1) >> 1; h = (h + 1) >> 1; }
    scales.push({w, h, have: 0, ref: {y: 0, rows: 0}, out: {y: 0, rows: 0}, first: -4, sums: null, odd: null, h0: null, h1: null});
  }
  const sparse0 = scales.length === SCALES, arena = referenceArena([], scales.map(sc => -sc.w));
  const feed = (s, ref, out, rows) => {
    const sc = scales[s], {w, h} = sc, from = sc.have, keep = Math.min(h, Math.ceil((sc.first + 4) / 4) * 4);
    sc.ref = !s && viewRef ? {y: 0, rows: from + rows, rgba: reference.rgba} : append(sc.ref, ref, rows, w, keep, 4);
    sc.out = append(sc.out, out, rows, w, keep, 4);
    sc.have += rows;
    const end = sc.have >= h ? h : Math.floor(sc.have / 4) * 4 - 4;
    if (end > sc.first) {
      const y0 = Math.min(h, Math.ceil((sc.first + 4) / 4) * 4), y1 = Math.min(h, Math.ceil((end + 4) / 4) * 4);
      sc.sums = scaleBand(rowsOf(sc.ref, y0, y1 - y0, w), rowsOf(sc.out, y0, y1 - y0, w), w, h, GAUSS32, sc.first, end, arena.places[s], !s && sparse0);
      sc.first = end;
    }
    if (s + 1 >= scales.length) return;
    let y = from, n = rows;
    if (sc.odd !== null) { y -= 1; n += 1; }
    const pairRows = sc.have >= h ? n : n & ~1;
    if (pairRows > 0) {
      const w1 = (w + 1) >> 1, r1 = (pairRows + 1) >> 1, m = w1 * r1;
      if (!sc.h0 || sc.h0[0].length < m) { sc.h0 = [0, 1, 2].map(() => new Float32Array(m + 4 * w1)); sc.h1 = [0, 1, 2].map(() => new Float32Array(m + 4 * w1)); }
      feed(s + 1, downsample(rowsOf(sc.ref, y, pairRows, w), w, pairRows, sc.h0).planes, downsample(rowsOf(sc.out, y, pairRows, w), w, pairRows, sc.h1).planes, r1);
    }
    sc.odd = pairRows < n ? y + pairRows : null;
  };
  return {
    push(y, rows, [pic]) {
      if (y !== scales[0].have) throw fault('JXL_INTERNAL', 'photo-s2-stream:order');
      const close = useReferenceArena(arena, false);
      try { feed(0, viewRef ? reference : {rgba: reference.rgba.subarray(y * width * 4, (y + rows) * width * 4)}, {rgba: pic}, rows); } finally { close(); }
    },
    finish() {
      if (scales[0].have !== height) throw fault('JXL_INTERNAL', 'photo-s2-stream:missing');
      return [scoreNorms(scales.map(({w, h, sums}) => {
        const per = {ssim: new Float64Array(6), edge: new Float64Array(12)};
        for (let c = 0; c < 3; c++) scaleNorm(per, c, sums.subarray(c * 6, c * 6 + 6), w * h);
        return per;
      })).score];
    },
    release() { releaseReferenceArena(arena); for (const sc of scales) sc.ref = sc.out = sc.sums = sc.h0 = sc.h1 = null; },
  };
}
export const s2Stream = (typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) ? uploadS2Stream : function s2Stream(reference, width, height, outputs, resumable = false, libjxl = false, refCache = null, bounded = false, minScore = undefined, part = null) {
  if (width < 8 || height < 8) throw fault('JXL_INTERNAL', 'photo-s2-stream:size');
  const room = !(typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) && resumable ? ROOM : 4;
  const viewRef = !!reference.rgba && ArrayBuffer.isView(reference.rgba);
  const scales = s2Dims(width, height).map(({w, h}) => ({w, h, have: 0, ref: {y: 0, rows: 0}, out: Array.from({length: outputs}, () => ({y: 0, rows: 0})),
    first: -4, state: new Array(outputs).fill(null), odd: null, halves: Array.from({length: outputs + 1}, () => null)}));
  const [chMask, sFrom, sEnd] = part ?? [7, 0, SCALES - 1], sTo = Math.min(sEnd, scales.length - 1), pKey = chMask | (sFrom << 3) | (sTo << 6);
  const pairs = outputs <= 2 ? scales.map((sc, s) => s < sFrom || s > sTo ? 0 : outputs === 1 ? -sc.w : sc.w) : [];
  if (!(typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) && refCache && !resumable && (!refCache.arena || refCache.outputs !== outputs || Boolean(libjxl) !== Boolean(refCache.libjxl) || refCache.pKey !== pKey)) {
    if (refCache.arena) releaseReferenceArena(refCache.arena);
    const s0Keep = refCache.keepFull ? true : refCache.keepY ? (libjxl ? 'p1' : 'y-ms') : refCache.keepP1 === false ? false : 'p1';
    const p1All = !!part && s0Keep === 'p1';
    refCache.arena = referenceArena(scales.map((sc, s) => ({width: sc.w, height: sc.h, keep: s < sFrom || s > sTo ? false : s > 0 ? (p1All ? 'p1' : true) : s0Keep})), pairs, chMask);
    refCache.outputs = outputs; refCache.ready = 0; refCache.s0Keep = s0Keep; refCache.p1Only = p1All; refCache.libjxl = !!libjxl; refCache.pKey = pKey;
  }
  const sharedArena = !(typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) && !resumable && !!refCache?.arena && refCache.outputs === outputs;
  const filling = sharedArena && !refCache.ready, ready = sharedArena && refCache.ready === 1;
  const sparse0 = ((typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) || !resumable) && scales.length === SCALES;
  const useBound = !(typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) && bounded && !libjxl && sparse0 && !(filling && refCache?.s0Keep === true);
  const arena = sharedArena ? refCache.arena : referenceArena([], pairs, chMask);
  let stopped = false, upperAtStop = null;
  const readSums = (partial = false) => {
    if (!partial && scales[0].have !== height) throw fault('JXL_INTERNAL', 'photo-s2-stream:missing');
    if (!partial && filling) refCache.ready = 1;
    return Array.from({length: outputs}, (_, k) => {
      const out = [];
      for (let s = sFrom; s <= sTo; s++) out.push(!partial || scales[s].first > 0 ? scales[s].state[k]?.sums ?? null : null);
      return out;
    });
  };
  const checkPartialBound = () => {
    if ((typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) || minScore === undefined || filling || scales[0].first < 64 || scales[0].have >= height) return;
    const uppers = scoresFromSums(scales, readSums(true), useBound).map(v => useBound ? v[1] : v + 1e-11);
    if (Math.min(...uppers) < minScore) { stopped = true; upperAtStop = uppers; }
  };
  const feed = (s, ref, outs, rows) => {
    const sc = scales[s], {w, h} = sc, from = sc.have;
    const planeAt = (filling || ready) ? arena.planes[s] : null, s0Keep = refCache?.s0Keep;
    const cacheMode = ready && planeAt ? (refCache.p1Only ? 'p1' : !s && s0Keep !== true ? s0Keep : true)
      : filling && planeAt ? (refCache.p1Only ? 'fill-p1' : !s && s0Keep !== true ? (s0Keep === 'y-ms' ? 'fill-y-ms' : 'fill-p1') : false) : false;
    const useCache = cacheMode === true || cacheMode === 'y-ms' || cacheMode === 'p1' || (s < sFrom && ready && !!arena.planes[sFrom]);
    const keep = s < sFrom ? (sc.odd ?? from) : Math.min(h, Math.ceil((sc.first + 4) / 4) * 4), kept = !(typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) && resumable ? Math.max(0, keep - AGAIN) : keep;
    sc.ref = useCache ? {y: 0, rows: from + rows}
      : ((typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) || !resumable) && !s && viewRef && !ref?.xyb ? {y: 0, rows: from + rows, rgba: reference.rgba, ...(reference.transform && {transform: reference.transform})}
      : append(sc.ref, ref, rows, w, kept, room);
    sc.out = sc.out.map((held, k) => !(typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) && !resumable && !s && outs[k]?.fullRgba ? {y: 0, rows: from + rows, rgba: outs[k].fullRgba, ...(outs[k].transform && {transform: outs[k].transform})} : append(held, outs[k], rows, w, kept, room));
    sc.have += rows;
    const end = sc.have >= h ? h : Math.floor(sc.have / 4) * 4 - 4;
    if (s >= sFrom && end > sc.first) {
      const again = !(typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) && sc.state[0]?.states !== undefined, next = Math.ceil((sc.first + 4) / 4) * 4, inputY = again ? Math.max(0, next - AGAIN) : Math.min(h, next);
      const inputEnd = Math.min(h, Math.ceil((end + 4) / 4) * 4), a = useCache ? null : rowsOf(sc.ref, inputY, inputEnd - inputY, w);
      const place = arena.places[s] ?? null, bMask = (!s && useBound ? 1 : 0) | (!s && sparse0 ? 2 : 0);
      const pair = !(typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) && outputs === 2 ? scaleBandPair(a, rowsOf(sc.out[0], inputY, inputEnd - inputY, w), rowsOf(sc.out[1], inputY, inputEnd - inputY, w),
        w, h, GAUSS32, sc.first, end, sc.state[0], sc.state[1], again ? inputY : null, place, libjxl, planeAt, cacheMode, bMask, chMask) : null;
      if (pair) sc.state = pair;
      else for (let k = 0; k < outputs; k++) sc.state[k] = scaleBand(a, rowsOf(sc.out[k], inputY, inputEnd - inputY, w), w, h, GAUSS32, sc.first, end, sc.state[k], again ? inputY : null, libjxl, outputs === 1 ? place : null, planeAt, cacheMode, bMask, chMask);
      sc.first = end;
    }
    if (s >= sTo || s + 1 >= scales.length) return;
    let y = from, n = rows;
    if (sc.odd !== null) { y -= 1; n += 1; }
    const pairRows = sc.have >= h ? n : n & ~1;
    if (pairRows > 0) {
      const w1 = w + 1 >> 1, r1 = pairRows + 1 >> 1, m = w1 * r1, down = (image, k) => {
        if (!sc.halves[k] || sc.halves[k][0].length < m) sc.halves[k] = [0, 1, 2].map(() => new Float32Array(m + room * w1));
        return downsample(rowsOf(image, y, pairRows, w), w, pairRows, sc.halves[k], libjxl).planes;
      };
      const dRef = ready && arena.planes[s + 1] ? {} : down(sc.ref, 0);
      feed(s + 1, dRef, sc.out.map((image, k) => down(image, k + 1)), r1);
    }
    sc.odd = pairRows < n ? y + pairRows : null;
  };
  const baseStream = {
    push(y, rows, pictures, refOverride = null) {
      if (y !== scales[0].have || pictures.length !== outputs) throw fault('JXL_INTERNAL', 'photo-s2-stream:order');
      if (stopped) return;
      const close = useReferenceArena(arena, false);
      try {
        const refIn = refOverride ?? (ready ? {} : ((typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) || !resumable) && viewRef ? reference : reference.rgba ? {rgba: reference.rgba.subarray(y * width * 4, (y + rows) * width * 4), ...(reference.transform && {transform: reference.transform})} : reference(y, rows));
        feed(0, refIn, pictures.map(p => Array.isArray(p) || p?.rgba || p?.xyb ? p : {rgba: p}), rows);
        checkPartialBound();
      } finally { close(); }
    },
    finish() {
      if (stopped) return upperAtStop.map(u => u - 1e-11);
      return scoresFromSums(scales, readSums());
    },
    release() { if (sharedArena) clearReferenceProbe(arena); else releaseReferenceArena(arena); for (const sc of scales) { sc.ref = sc.out = sc.state = sc.halves = null; } },
  };
  return (typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) ? baseStream : {
    ...baseStream,
    readSums,
    finishBounds() {
      if (stopped) return upperAtStop.map(u => [u - 1e-11, u]);
      if (!useBound) return this.finish().map(v => [v, v]);
      return scoresFromSums(scales, readSums(), true);
    },
    save() {
      return scales.map(({w, have, ref, out, first, state, odd}, s) => {
        const keep = Math.min(have, Math.max(0, Math.ceil((first + 4) / 4) * 4 - AGAIN), odd ?? Infinity), trim = held => {
          const drop = Math.max(0, keep - held.y);
          if (!held.rgba && !held.planes) return held;
          const per = held.rgba ? w * 4 : w, cut = a => a.slice(drop * per, held.rows * per);
          return held.rgba ? {y: held.y + drop, rows: held.rows - drop, rgba: cut(held.rgba)} : {y: held.y + drop, rows: held.rows - drop, planes: held.planes.map(cut)};
        };
        const places = state.map((st, k) => st && (st.states ? st : bandState(st.resident ? {scratch: residentScratch(arena, arena.places[s], st.output), sums: st.sums} : st, w)));
        if (state[1]?.pair) places[1] = pairState(places[0], places[1], w);
        return {have, ref: trim(ref), out: out.map(trim), first, state: places, odd};
      });
    },
    restore(saved) {
      if (!Array.isArray(saved) || saved.length !== scales.length) throw fault('JXL_INTERNAL', 'photo-s2-stream:place');
      saved.forEach(({have, ref, out, first, state, odd}, s) => Object.assign(scales[s], {have, ref, out: out.slice(), first, state: state.slice(), odd}));
    },
    get rows() { return scales[0].have; },
    get done() { return stopped; },
  };
}