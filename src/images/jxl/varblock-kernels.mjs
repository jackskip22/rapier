// SPDX-License-Identifier: MIT
const P = 65536, R = 327680;
export function varblockKernels(current, stamp, enter) {
  let engine;
  const VB_LOG2 = P, VB_BASES = P + 32768, VB_PIX = P + 54272, VB_TMP = P + 62464, VB_TR = P + 70656, VB_TABLES = P + 95232,
    VB_TABLES_END = P + 160768, VB_LEVELS = P + 160768, VB_OUT = P + 173056, VB_REGION = P + 173120, VB_STRIP = 4194304, VB_STRIP_ROWS = 32;
  let vbRegionNext = VB_REGION;
  let vbLoaded = -1, vbSlots = null, vbNext = 0, vbBuffer = null, vbF64 = null, vbI32 = null, vbU8 = null, vbStrip = null;
  const vbViewCache = new Map();
  function vbViews() {
    if (vbBuffer !== engine.memory.buffer) { vbBuffer = engine.memory.buffer; vbF64 = new Float64Array(vbBuffer); vbI32 = new Int32Array(vbBuffer); vbU8 = new Uint8Array(vbBuffer); vbViewCache.clear(); }
  };
  function vbEnter(log2, bases) {
    vbViews();
    if (vbLoaded !== stamp()) {
      vbF64.set(log2, VB_LOG2 >> 3);
      let at = VB_BASES >> 3;
      for (const size of [8, 16, 32]) { const {basis, basisT} = bases(size); vbF64.set(basis, at); vbF64.set(basisT, at + size * size); at += 2 * size * size; }
      vbSlots = new Map(); vbNext = VB_TABLES; vbStrip = null;
      vbLoaded = enter();
    }
  };
  const vbBasis = size => VB_BASES + 8 * (size === 8 ? 0 : size === 16 ? 128 : 640);
  const varblock = function varblock(log2, bases) {
    engine = current();
    if (!engine?.simd.vbDct || !engine.simd.vbQuant || !(log2 instanceof Float64Array) || log2.length !== 4096) return null;
    return {
      table(id, table, size, order, high) {
        vbEnter(log2, bases);
        let slot = vbSlots.get(id);
        if (slot?.table === table && slot.epoch === vbLoaded) return slot;
        if (size > 1024 || table.planes.some(p => p.length !== size) || order.length !== size || high.length !== size) return null;
        if (!slot || slot.size !== size) {
          const bytes = size * 29 + 7 & ~7;
          if (vbNext + bytes > VB_TABLES_END) return null;
          slot = {size, steps: vbNext, order: vbNext + size * 24, high: vbNext + size * 28};
          vbNext += bytes;
          vbSlots.set(id, slot);
        }
        slot.table = table; slot.epoch = vbLoaded;
        for (let c = 0; c < 3; c++) vbF64.set(table.planes[c], (slot.steps >> 3) + c * size);
        vbI32.set(order, slot.order >> 2); vbU8.set(high, slot.high);
        return slot;
      },
      block(planes, top, x, y, W, w, h, from, to) {
        vbEnter(log2, bases);
        const available = planes[0].length / W - (y - top);
        if (!vbStrip || !vbStrip.planes.has(planes) || vbStrip.W !== W || y < vbStrip.y || y + h > vbStrip.y + vbStrip.rows) {
          const rows = Math.min(available, Math.max(h, VB_STRIP_ROWS)), end = VB_STRIP + 3 * rows * W * 8;
          vbStrip = null;
          let room = end <= engine.memory.buffer.byteLength;
          if (!room) try {
            engine.memory.grow(Math.ceil((end - engine.memory.buffer.byteLength) / 65536)); room = true;
            engine.u8 = new Uint8Array(engine.memory.buffer); engine.i32 = new Int32Array(engine.memory.buffer);
          } catch {}
          if (room) {
            vbViews();
            for (let c = 0; c < 3; c++) vbF64.set(planes[c].subarray((y - top) * W, (y - top + rows) * W), (VB_STRIP >> 3) + c * rows * W);
            vbStrip = {planes: new WeakSet([planes]), W, y, rows};
          }
        }
        for (let c = from; c <= to; c++) {
          if (vbStrip) engine.simd.vbDct(VB_STRIP + 8 * (c * vbStrip.rows * W + (y - vbStrip.y) * W + x), W, w, h, vbBasis(w) + 8 * w * w, vbBasis(h), VB_TMP, VB_TR + c * 8192);
          else {
            for (let r = 0; r < h; r++) vbF64.set(planes[c].subarray((y - top + r) * W + x, (y - top + r) * W + x + w), (VB_PIX >> 3) + r * w);
            engine.simd.vbDct(VB_PIX, w, w, h, vbBasis(w) + 8 * w * w, vbBasis(h), VB_TMP, VB_TR + c * 8192);
          }
        }
      },
      coefficients(c, size) {
        vbViews();
        const key = c * 4096 + size;
        let view = vbViewCache.get(key);
        if (!view) vbViewCache.set(key, view = vbF64.subarray((VB_TR >> 3) + c * 1024, (VB_TR >> 3) + c * 1024 + size));
        return view;
      },
      region() { vbRegionNext = VB_REGION; },
      reserve(size) {
        if (vbRegionNext + 12 * size > R) return -1;
        const at = vbRegionNext;
        vbRegionNext += 12 * size;
        return at;
      },
      unreserve(at) { if (at >= 0) vbRegionNext = at; },
      epoch() { return vbLoaded === stamp() ? vbLoaded : -1; },
      levels(at, c, size) { vbViews(); return vbI32.subarray((at >> 2) + c * size, (at >> 2) + (c + 1) * size); },
      copyLevels(at, size, dst) { vbViews(); dst.set(vbI32.subarray(at >> 2, (at >> 2) + 3 * size)); },
      quant(c, slot, area, size, fc, lo, hi, fine, unit, one, detail, rc1, rc2, R, plane, sums, at = -1) {
        vbEnter(log2, bases);
        if (slot.epoch !== vbLoaded) return false;
        const base = at >= 0 ? at + c * size * 4 : VB_LEVELS;
        if (at >= 0 || plane) {
          const b32 = base >> 2, o32 = slot.order >> 2;
          for (let k = 0; k < area; k++) vbI32[b32 + vbI32[o32 + k]] = 0;
        }
        if (engine.simd.vbQuant(VB_TR + c * 8192, c === 1 ? 0 : VB_TR + 8192, slot.order, slot.steps + c * size * 8, slot.high, area, size,
          base, VB_LOG2, fc, lo, hi, fine, unit, one, detail, rc1, rc2, R, VB_OUT)) return false;
        if (plane) plane.set(vbI32.subarray(base >> 2, (base >> 2) + size));
        sums[0] = vbF64[VB_OUT >> 3]; sums[1] = vbF64[(VB_OUT >> 3) + 1]; sums[2] = vbI32[(VB_OUT >> 2) + 4];
        return true;
      },
    };
  };
  varblock.overwriteRows = () => {
    const keep = vbLoaded === stamp();
    vbStrip = null;
    const epoch = enter();
    if (keep) vbLoaded = epoch;
  };
  return varblock;
}
