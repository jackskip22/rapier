// SPDX-License-Identifier: MIT
import {wasmRequired} from './capture-wasm-error.mjs';
import {fault} from './fault.mjs';

const BLOCK = 524288, OUT = 3 * BLOCK, TMP = 4 * BLOCK, ROWS = 5 * BLOCK;
const BASES = ROWS + 4096, TABLES = BASES + 786432, CONSTANTS = TABLES + 81944, SRGB8 = CONSTANTS + 64, ARENA = BASES + 1048576;

export function createKernelEngine(module) {
  let exports;
  try { ({exports} = new WebAssembly.Instance(module())); }
  catch (error) { throw error?.code === 'JXL_WASM' ? error : wasmRequired(error); }
  const {memory} = exports, bases = new Map();
  let next = BASES;
  const engine = {...exports,
    arena: ARENA, args: ARENA - 256,
    views() {
      const b = engine.buffer = memory.buffer;
      engine.f64 = new Float64Array(b); engine.i32 = new Int32Array(b);
      engine.coefficients = [0, 1, 2].map(c => new Float64Array(b, c * BLOCK, 65536));
      engine.output = new Float64Array(b, OUT, 65536);
    },
    reserve(sizes, at = ARENA) {
      const offsets = sizes.map(s => { const p = at; at += s + (-s & 15); return p; });
      const err = msg => Object.assign(new RangeError(msg), {code: 'JXL_MEMORY'});
      if (!(at <= 0x80000000)) throw err('kernel memory: over 2 GiB');
      if (at > memory.buffer.byteLength) {
        try { memory.grow(Math.ceil((at - memory.buffer.byteLength) / 65536)); }
        catch (cause) { throw Object.assign(err('kernel memory grow failed'), {cause}); }
        engine.views();
      }
      return offsets;
    },
    basis(n, values) {
      let at = bases.get(n);
      if (at === undefined) { bases.set(n, at = next); next += n * n * 8; engine.f64.set(values(), at / 8); }
      return at;
    },
    idct: (c, w, h, bx, by) => w === 8 && h === 8 ? exports.idct8(c, bx, OUT, TMP) : exports.idct(c, w, h, bx, by, OUT, TMP, ROWS),
    store: (w, p, at, s, xs, ys) => exports.store(OUT, w, p.byteOffset + at * 4, s * 4, xs, ys),
    xyb(n, x, y, b, {root, bias, m}, rgba8 = null) {
      new Float32Array(memory.buffer, CONSTANTS, 15).set([...root, ...bias, ...m]);
      exports.xyb(n, x.byteOffset, y.byteOffset, b.byteOffset, CONSTANTS, rgba8 ? engine.srgb8Table() : 0, rgba8 ? rgba8.byteOffset : 0);
    },
    srgbTables() { if (!engine.tablesBuilt) { exports.srgbTables(TABLES); engine.tablesBuilt = true; } return TABLES; },
    srgb8Table() { if (!engine.srgb8Built) { if (exports.srgb8Build(SRGB8)) throw fault('JXL_INTERNAL', 'kernel-engine:srgb8'); engine.srgb8Built = true; } return SRGB8; },
    srgb: p => exports.srgb(p.length, p.byteOffset, engine.srgbTables()),
    srgb8: (n, r, g, b, out) => exports.srgb8(n, r.byteOffset, g.byteOffset, b.byteOffset, engine.srgb8Table(), out.byteOffset),
  };
  engine.views();
  return engine;
}
