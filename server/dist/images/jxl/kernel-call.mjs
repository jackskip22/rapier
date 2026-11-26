// SPDX-License-Identifier: MIT
import {kernelFlat, kernelBuffer, arenaHolder, takeArena, growArena} from './kernel-runtime.mjs';

export const U8 = Uint8Array, I8 = Int8Array, U16 = Uint16Array, I16 = Int16Array,
  U32 = Uint32Array, I32 = Int32Array, F32 = Float32Array, F64 = Float64Array, U8C = Uint8ClampedArray;

export const align16 = n => n + (-n & 15);

export const rows2d = (dst, src, stride, x, y, w, h, size = 1, at = 0) => {
  if (!x && w === stride) dst.set(src.subarray(y * w * size, (y + h) * w * size), at);
  else for (let r = 0, s = (y * stride + x) * size; r < h; r++, s += stride * size) dst.set(src.subarray(s, s + w * size), at + r * w * size);
};
export const rowsOut = (dst, src, stride, x, y, w, h, size = 1, from = 0) => {
  if (!x && w === stride) dst.set(src.subarray(from, from + w * h * size), y * w * size);
  else for (let r = 0; r < h; r++) dst.set(src.subarray(from + r * w * size, from + (r + 1) * w * size), ((y + r) * stride + x) * size);
};
export const lay = (at, sizes) => {
  const offs = sizes.map(b => { const p = align16(at); at = p + b; return p; });
  offs.push(align16(at));
  return offs;
};
export const drainBits = (w, u8, from, written, acc, pending, pad = 8) => {
  if (w.at + written + pad >= w.bytes.length) w.grow(written + pad);
  w.bytes.set(u8.subarray(from, from + written), w.at);
  w.at += written;
  if (acc !== undefined) { w.acc = acc; w.pending = pending; }
};

export const into = (T, a, n, back, sink) => {
  if (!a) return 0;
  const len = n ?? a.length, kb = kernelBuffer();
  const src = kb && a.buffer === kb ? a.slice(0, len) : len === a.length ? a : a.subarray(0, len);
  return !back && !sink && src.constructor === T ? src : [T, len, src, back ? len : null, sink];
};
export const both = (T, a, n, sink) => into(T, a, n, 1, sink);
export const rect = (T, a, stride, x, y, w, h, size = 1, back = null) => {
  const kb = kernelBuffer(), copy = kb && a.buffer === kb && new a.constructor(w * h * size);
  if (copy) rows2d(copy, a, stride, x, y, w, h, size);
  return [T, w * h * size, copy || (to => rows2d(to, a, stride, x, y, w, h, size)), back];
};
export const out = (T, target, zero, n) => ArrayBuffer.isView(target)
  ? [target.constructor, n ?? target.length, zero ? 1 : 0, n ?? target.length, target]
  : [T, target, zero ? 1 : 0, target];
export const outUpTo = (T, most, count, zero) => [T, most, zero ? 1 : 0, count];
export const room = (n, zero) => [U8, n, zero ? 1 : 0];
export const made = (T, n, put, back = null) => [T, n, put, back];

export const kernelCaller = (place, fail) => (pick, args, views) => {
  try {
    const kb = kernelBuffer(), len = args.length, specs = new Array(len);
    for (let i = 0; i < len; i++) {
      const a = args[i];
      specs[i] = !a || typeof a === 'number' ? null
        : ArrayBuffer.isView(a) ? [a.constructor, a.length, kb && a.buffer === kb ? a.slice() : a]
        : Array.isArray(a) ? a : a.T ? [a.T, a.size, a.put, a.back] : [a[0], a[1], a[2], a.back];
    }
    const {k, at} = place(end => {
      const offsets = new Array(len);
      for (let i = 0; i < len; i++) {
        const s = specs[i];
        if (s) { offsets[i] = end = align16(end); end += s[1] * s[0].BYTES_PER_ELEMENT; }
      }
      return {offsets, end};
    });
    const buf = k.memory.buffer, offs = at.offsets, callArgs = new Array(len);
    for (let i = 0; i < len; i++) {
      const s = specs[i];
      if (s) {
        const p = s[2];
        if (p) {
          const v = new s[0](buf, offs[i], s[1]);
          if (p === 1) v.fill(0); else if (typeof p === 'function') p(v); else v.set(p);
        }
        callArgs[i] = offs[i];
      } else callArgs[i] = args[i] ?? 0;
    }
    const res = [pick(k)(...callArgs)];
    for (let i = 0; i < len; i++) {
      const s = specs[i];
      if (!s || s[3] == null) continue;
      const got = new s[0](buf, offs[i], typeof s[3] === 'function' ? s[3](res[0]) : s[3]);
      res.push(s[4] ? (s[4].set(got), s[4]) : views ? got : got.slice());
    }
    return res;
  } catch (error) { return fail(error); }
};

export const BAND = {};
export const part = (T, a, size = 1) => (at, n) => into(T, a.subarray(at * size, (at + n) * size));
export const partOut = (T, a, size = 1) => Object.assign((at, n) => out(T, n * size), {to: a, size});
export const bands = (call, most) => (pick, pixels, args) => {
  for (let at = 0; at < pixels; at += most) {
    const n = Math.min(most, pixels - at), built = args.map(a => a === BAND ? n : typeof a === 'function' ? a(at, n) : a),
      got = call(pick, built, true);
    let r = 1;
    built.forEach((m, i) => { if (m && (Array.isArray(m) ? m[3] : m.back) != null) { if (args[i]?.to) args[i].to.set(got[r], at * args[i].size); r++; } });
  }
};

const shared = /* @__PURE__ */ arenaHolder(() => {});
export const kernelCall = /* @__PURE__ */ kernelCaller(fn => {
  const k = kernelFlat();
  takeArena(shared);
  const at = fn(65536);
  growArena(at.end);
  return {k, at};
}, error => { throw error; });
