// SPDX-License-Identifier: MIT
import {fault} from './fault.mjs';
import {wasmModule, compileWasm} from './wasm-modules.mjs';
import {wasmBytes} from './wasm-text.mjs';
import {JPEG_KERNELS} from './jpeg-kernels-bytes.mjs';
import {JPEG_GENERAL_ROWS} from './jpeg-general-rows-bytes.mjs';
import {hybridToken} from './prefix.mjs';
import {drainBits} from './kernel-call.mjs';

const ROWS = 524288, BITS = 589824, OWN = 591872, ALIVE = 592128, SCRATCH = 592384;
const VALUES = 1261568, IDS = 2048000, CMAP = 2637824, HISTOGRAMS = 2646016, TABLE_SIZE = 12576, OUT = 5853184;
const FILL = 5853184, FMAP = 5853440, FORDER = 5863680, FDENSITY = 5864448, FBUCKETS = 5880832, FCOUNTS = 5881856;
const FCOEFFS = 5897216, FCTXS = 6290432, FVALUES = 6683648;
const JSCAN = 2637824, JCODES = 2638080, JZIGZAG = 2646304, JZEROS = 2646560, JPADS = 3170848, JBAND = 3236384, BAND_BLOCKS = 3072;
const LHIST = 5853184, LBITS = 5951488, LALIVE = 5952000, LOWNER = 5952064;
const DPARAMS = 1048576, DBAND = 1049600, DIN = 1261568, BAND_BYTES = DIN - DBAND;
const CTAB = 7426048, CTAB_END = 9523200, DYNAMIC = 11882496;
const GROUP_VALUES = 3 * 1024 * 64, WCOEFFS = DYNAMIC, WCTXS = WCOEFFS + GROUP_VALUES * 4, WVALUES = WCTXS + GROUP_VALUES * 2;
const DECODE_CAP = 64 * 1048576;

let engine, limit = Infinity, tokenFlush = null;

export function jpegKernels(flushTokens) {
  if (flushTokens) tokenFlush = flushTokens;
  if (engine) return engine;
  engine = null;
  try {
    const {exports} = new WebAssembly.Instance(wasmModule('jpeg', () => wasmBytes(JPEG_KERNELS)));
    const {memory} = exports;
    let buf, f64, f32, u32, i32, u16, i16, u8;
    const views = () => {
      if (buf === memory.buffer) return;
      buf = memory.buffer;
      f64 = new Float64Array(buf); f32 = new Float32Array(buf); u32 = new Uint32Array(buf);
      i32 = new Int32Array(buf); u16 = new Uint16Array(buf); i16 = new Int16Array(buf); u8 = new Uint8Array(buf);
    };
    views();
    const grow = end => {
      if (end > limit) throw fault('JXL_MEMORY', 'arena: too large');
      try { memory.grow(Math.ceil((end - buf.byteLength) / 65536)); }
      catch (cause) { throw Object.assign(fault('JXL_MEMORY', 'entropy arena: grow failed'), {cause}); }
      views();
    };
    let fixedUsed = false, scratchLow = false, loaded = null, priceStamp = null, priceMore = null, lastFillWide = false;
    let tableEnd = CTAB, listsEnd = CTAB;
    const reserve = end => { fixedUsed = true; if (end > buf.byteLength) grow(end); };
    const clearCtab = end => { if (end > CTAB) { u8.fill(0, CTAB, Math.min(CTAB_END, end)); priceStamp = priceMore = null; } };
    const scratchAt = bytes => {
      const low = !fixedUsed && CMAP + bytes <= CTAB;
      if (low !== scratchLow) { priceStamp = priceMore = null; scratchLow = low; }
      if (low) loaded = null;
      return low ? CMAP : listsEnd;
    };
    const alloc = (sizes, keepPrice) => {
      if (!keepPrice) priceStamp = priceMore = null;
      let total = 16;
      for (const s of sizes) total += (s + 7) & ~7;
      let at = (scratchAt(total) + 7) & ~7;
      const offs = sizes.map(s => { const p = at; at += (s + 7) & ~7; return p; });
      if (at > buf.byteLength) { grow(at); if (keepPrice) priceStamp = null; }
      return offs;
    };
    const put = (a, off) => {
      if (a instanceof Float64Array) f64.set(a, off >> 3);
      else if (a instanceof Float32Array) f32.set(a, off >> 2);
      else if (a.BYTES_PER_ELEMENT === 4) i32.set(a, off >> 2);
      else if (a.BYTES_PER_ELEMENT === 2) i16.set(a, off >> 1);
      else u8.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), off);
      return off;
    };
    const loadPrice = (cands, more, bits, logs, cAt, symbolBits, logLengths) => {
      if (priceStamp !== cands || priceMore !== more) {
        f64.set(symbolBits, bits >> 3); u8.set(logLengths, logs);
        (more ? [...cands, ...more] : cands).forEach((k, i) => u32.set([k.split, k.msb, k.lsb, k.splitToken], (cAt >> 2) + i * 4));
        priceStamp = cands; priceMore = more;
      }
    };
    const scanSlots = scan => {
      const single = scan.length === 1, tables = [], slot = t => { let i = tables.indexOf(t); if (i < 0) i = tables.push(t) - 1; return i; };
      const entries = scan.map(s => ({c: s.component, h: single ? 1 : s.component.h, v: single ? 1 : s.component.v, dc: s.dc, ac: s.ac}));
      if (scan.length > 4 || entries.some(e => !e.dc || !e.ac)) return null;
      const slots = entries.map(e => [slot(e.dc), slot(e.ac)]);
      return tables.length > 8 ? null : {single, first: scan[0].component, tables, entries, slots};
    };
    const runIdctBands = !(typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true) && (typeof __RAPIER_JXL_JPEG_PIXELS__ === 'undefined' || __RAPIER_JXL_JPEG_PIXELS__ === true) ? (items, plan, totalRows, rowBlocks, startAt, orient, onBand, loadRow) => {
      const {mxY, myY, mxC, myC, outW, outH, mode, clampW, clampH, yBias, cBias} = plan;
      const bandMcus = Math.max(2, Math.min(totalRows, Math.min(16, Math.max(2, 16384 / Math.max(1, rowBlocks) | 0))));
      const colsY = items[0].colsY, yStride = colsY * mxY + 15 & ~3, cStride = items.length > 1 ? items[1].colsC * mxC + 15 & ~3 : 16;
      const maxYRows = bandMcus * items[0].v * myY + 4, maxCRows = items.length > 1 ? bandMcus * items[1].v * myC + 4 : 4;
      const bandAt = startAt, quantAt = bandAt + bandMcus * rowBlocks * 128 + 63 & ~63, yPlane = quantAt + 1024;
      const cbPlane = yPlane + maxYRows * yStride * 4, crPlane = cbPlane + (items.length > 1 ? maxCRows * cStride * 4 : 64);
      const vScratch = crPlane + (items.length > 1 ? maxCRows * cStride * 4 : 64), rgbaAt = vScratch + (clampW + 32) * 8 + 63 & ~63;
      const rgbaBytes = maxYRows * outW * 4, useOrient = orient > 1 && rgbaAt + 2 * rgbaBytes + 64 <= DECODE_CAP;
      const orientDst = useOrient ? rgbaAt + rgbaBytes + 63 & ~63 : 0, end = useOrient ? orientDst + rgbaBytes : rgbaAt + rgbaBytes;
      if (orient !== null) {
        if (end > buf.byteLength) { if (end > DECODE_CAP) return null; fixedUsed = true; try { grow(end); } catch { return null; } }
      } else reserve(end);
      loaded = null;
      const oriented = useOrient ? new Uint8Array(outW * outH * 4) : null;
      try {
        items.forEach((it, i) => { for (let k = 0; k < 64; k++) f32[((quantAt + i * 256) >> 2) + k] = it.c.quant[k]; });
        if (orient !== null) loadRow(-1, 0, bandAt);
        const needOverlap = mode === 2 || mode === 4;
        let heldY = 0, heldC = 0, emittedY = 0;
        for (let row0 = 0; row0 < totalRows; row0 += bandMcus) {
          const mcuRows = Math.min(bandMcus, totalRows - row0), bases = loadRow(row0, mcuRows, bandAt);
          if (!bases) return null;
          exports.idctPlane(bases[0], quantAt, items[0].c.blocksW, mcuRows * items[0].v, items[0].c.stride, mxY, myY, yPlane + heldY * yStride * 4, yStride, yBias);
          if (items.length === 3) for (let q = 1; q < 3; q++)
            exports.idctPlane(bases[q], quantAt + q * 256, items[q].c.blocksW, mcuRows * items[q].v, items[q].c.stride, mxC, myC, (q === 1 ? cbPlane : crPlane) + heldC * cStride * 4, cStride, cBias);
          const cRowBase = row0 * (items[1]?.v ?? 1) * myC - heldC, availY = Math.min(heldY + mcuRows * items[0].v * myY, outH - emittedY);
          if (availY <= 0) break;
          const holdOne = needOverlap && row0 + mcuRows < totalRows && emittedY + availY < outH, emitRows = holdOne ? availY - 1 : availY;
          if (emitRows > 0) {
            exports.jpegRgbaRows(yPlane, cbPlane, crPlane, yStride, cStride, outW, emitRows, mode, clampW, 0, emittedY, cRowBase, clampH, vScratch, rgbaAt);
            if (useOrient) {
              exports.orientBandRgba(rgbaAt, orientDst, outW, emitRows, 0, emitRows, orient);
              if (orient < 5) oriented.set(u8.subarray(orientDst, orientDst + emitRows * outW * 4), (orient >= 3 ? outH - emittedY - emitRows : emittedY) * outW * 4);
              else for (let r = 0, s = orientDst, d = (orient === 6 || orient === 7 ? outH - emittedY - emitRows : emittedY) * 4; r < outW; r++, s += emitRows * 4, d += outH * 4)
                oriented.set(u8.subarray(s, s + emitRows * 4), d);
            } else onBand(emittedY, emitRows, u8.subarray(rgbaAt, rgbaAt + emitRows * outW * 4));
            emittedY += emitRows;
          }
          if (holdOne) {
            u8.copyWithin(yPlane, yPlane + emitRows * yStride * 4, yPlane + (emitRows + 1) * yStride * 4);
            const lastC = heldC + mcuRows * items[1].v * myC - 1;
            u8.copyWithin(cbPlane, cbPlane + lastC * cStride * 4, cbPlane + (lastC + 1) * cStride * 4);
            u8.copyWithin(crPlane, crPlane + lastC * cStride * 4, crPlane + (lastC + 1) * cStride * 4);
            heldY = heldC = 1;
          } else heldY = heldC = 0;
        }
        return {oriented};
      } finally { clearCtab(end); }
    } : null;

    exports.initTable();
    engine = {
      memoryBytes: (typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true) ? null : () => buf.byteLength,
      ...((typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true) ? {} : {fitCfl(y, c, qy, qc, width, rows, stride, map, known) {
        const [quant, scales, multiples, costs, yp, cp, mp] = alloc([512, 256, 256, 32769 * 8, y.byteLength, c.byteLength, map.length]);
        u32.set(qy, quant >> 2); u32.set(qc, (quant >> 2) + 64);
        put(y, yp); put(c, cp); put(map, mp);
        exports.fitCfl(yp, cp, quant, scales, multiples, costs, mp, width, rows, stride, known);
        c.set(i16.subarray(cp >> 1, (cp >> 1) + c.length));
        map.set(new Int8Array(buf, mp, map.length));
      }}),
      ...((!(typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true) && !(typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) && (typeof __RAPIER_JXL_RECOMPRESS__ === 'undefined' || __RAPIER_JXL_RECOMPRESS__ === true)) ? {
        cflHistogram(y, c, multiples, seeds, scan, width, rows, stride, nzHist, posHist, magHist) {
          const [mp, sp, nz, pos, mag, yp, cp, seed] = alloc([multiples, scan, nzHist, posHist, magHist, y, c, seeds].map(a => a.byteLength));
          [multiples, scan, nzHist, posHist, magHist, y, c, seeds].forEach((a, i) => put(a, [mp, sp, nz, pos, mag, yp, cp, seed][i]));
          const total = exports.cflHistogram(yp, cp, mp, seed, sp, width, rows, stride, nz, pos, mag);
          nzHist.set(u32.subarray(nz >> 2, (nz >> 2) + nzHist.length));
          posHist.set(u32.subarray(pos >> 2, (pos >> 2) + posHist.length));
          magHist.set(u32.subarray(mag >> 2, (mag >> 2) + magHist.length));
          return total;
        },
        cflEobBand(y, c, model, visit) {
          const {multiples, order, scales, nzBits, zeroCostByNz, nzBaseByNz, magBits, width, rows, stride} = model;
          const arrs = [multiples, order, scales, nzBits, zeroCostByNz, nzBaseByNz, magBits, y, c];
          const [mp, op, sc, nz, zero, base, mag, yp, cp, out] = alloc([...arrs.map(a => a.byteLength), 16]);
          arrs.forEach((a, i) => put(a, [mp, op, sc, nz, zero, base, mag, yp, cp][i]));
          return visit({
            cost: (tx, fi) => exports.cflEobCost(yp, cp, mp, op, nz, zero, base, mag, width, rows, stride, tx, fi),
            moments: tx => (exports.cflMoments(yp, cp, sc, op, width, rows, stride, tx, out), [f64[out >> 3], f64[(out >> 3) + 1]]),
          });
        },
        jpegSignatureHistogram(coeffs, width, rows, stride, dcValues, {dim, buckets, low, histograms}) {
          const [cp, dc, bp, out] = alloc([coeffs, dcValues, buckets, histograms].map(a => a.byteLength));
          put(coeffs, cp); put(dcValues, dc); put(buckets, bp); put(histograms, out);
          exports.jpegSignatureHistogram(cp, width, rows, stride, dim, dc, bp, low, out);
          histograms.set(f64.subarray(out >> 3, (out >> 3) + histograms.length));
        },
        jpegHistograms(coeffs, width, rows, stride, buckets, lumaWidth, hshift, vshift, histograms) {
          const [cp, bp, out] = alloc([coeffs.byteLength, buckets.byteLength, histograms.byteLength]);
          put(coeffs, cp); put(buckets, bp); put(histograms, out);
          exports.jpegHistograms(cp, width, rows, stride, bp, lumaWidth, hshift, vshift, out);
          histograms.set(f64.subarray(out >> 3, (out >> 3) + histograms.length));
        },
      } : {}),
      clusters: 256, flatten: flattenSparse,
      row(i, freqs, bits) { u32.set(freqs, (ROWS >> 2) + i * 64); f64[(BITS >> 3) + i] = bits; exports.terms(i); },
      alive(i, live) { u8[ALIVE + i] = live ? 1 : 0; },
      priceConfigs(values, weights, candidates, {symbolBits, logLengths}) {
        const n = values.length, c = candidates.length;
        const [bits, logs, cands, scratch, best, out, vals, wts] = alloc([symbolBits.byteLength, 16, c * 16, 768, 512, 16, n * 4, n * 4], 1);
        loadPrice(candidates, null, bits, logs, cands, symbolBits, logLengths);
        u32.set(values, vals >> 2); u32.set(weights, wts >> 2);
        const index = exports.priceConfigs(vals, wts, n, cands, c, bits, logs, scratch, best, out);
        return index < 0 ? null : {index, tokens: u32.slice(best >> 2, (best >> 2) + 128), raw: f64[out >> 3], cost: f64[(out >> 3) + 1]};
      },
      ...((typeof __RAPIER_JXL_UPLOAD__ !== 'undefined' && __RAPIER_JXL_UPLOAD__ === true) ? {} : {priceEvery(values, weights, candidates, more, largest, {symbolBits, logLengths}) {
        const n = values.length, c = candidates.length, mc = more.length, works = c * 528 + (c + mc) * 8 + 512 + mc * 1048 + (c + 6) * 12 + c + 6 + mc;
        const [bits, logs, cands, vals, wts, work, out] = alloc([symbolBits.byteLength, 16, (c + mc) * 16, n * 4, n * 4, works, 120], 1);
        loadPrice(candidates, more, bits, logs, cands, symbolBits, logLengths);
        u32.set(values, vals >> 2); u32.set(weights, wts >> 2);
        const f = exports.priceEvery(vals, wts, n, cands, c, cands + c * 16, mc, largest, bits, logs, work, out), list = [];
        for (let k = 0; k < f; k++) {
          const at = (out >> 2) + k * 6, from = u32[at] >> 2, i = u32[at + 2];
          list.push({candidate: i < c ? candidates[i] : more[i - c], tokens: u32.slice(from, from + u32[at + 1]), raw: f64[(out >> 3) + k * 3 + 2]});
        }
        return list;
      }}),
      seedAll(used, counts, tokenOf, seeds, threshold, prior = []) {
        const n = used.length;
        let pairs = 0;
        for (const ctx of used) if (counts.large[ctx]) pairs += counts.large[ctx].size;
        const [small, tok, loff, runs, offs, assign, lpairs] = alloc([n * 256, 256, (n + 1) * 4, n * 512, (n + 1) * 4, n * 4, pairs * 8]);
        for (let v = 0; v < 64; v++) u32[(tok >> 2) + v] = tokenOf(v);
        let at = 0;
        for (let t = 0; t < n; t++) {
          const ctx = used[t];
          u32.set(counts.small.subarray(ctx * 64, ctx * 64 + 64), (small >> 2) + t * 64);
          u32[(loff >> 2) + t] = at;
          if (counts.large[ctx]) for (const [v, cnt] of counts.large[ctx]) { u32[(lpairs >> 2) + 2 * at] = tokenOf(v); u32[(lpairs >> 2) + 2 * at + 1] = cnt; at++; }
        }
        u32[(loff >> 2) + n] = at;
        const k = exports.seedAll(n, small, loff, lpairs, tok, seeds, threshold, runs, offs, assign, prior.length), clusters = prior.slice();
        for (let t = 0; t < n; t++) {
          const i = u32[(assign >> 2) + t];
          if (i === clusters.length) clusters.push({contexts: [used[t]], freqs: null, bits: 0, last: 0, cost: -1});
          else clusters[i].contexts.push(used[t]);
        }
        for (let i = 0; i < k; i++) { clusters[i].freqs = u32.slice((ROWS >> 2) + i * 64, (ROWS >> 2) + i * 64 + 64); clusters[i].bits = f64[(BITS >> 3) + i]; }
        const offsets = u32.slice(offs >> 2, (offs >> 2) + n + 1);
        return {clusters, offsets, runs: u32.slice(runs >> 2, (runs >> 2) + 2 * offsets[n])};
      },
      pairsInit: length => { u8.fill(1, ALIVE, ALIVE + length); exports.pairsInit(length); },
      pairsUpdate: (length, left) => exports.pairsUpdate(length, left),
      pairMin: length => [exports.pairMin(length), u32[SCRATCH >> 2], f64[(SCRATCH >> 3) + 1]],
      assign(sparse, costs, switchCost) {
        const n = sparse.offsets.length - 1, k = costs.length;
        const [tables, best, next, offsets, pairs, back] = alloc([k * 512, k * 8, k * 8, (n + 1) * 4, sparse.pairs.byteLength, n * k * 2]);
        for (let i = 0; i < k; i++) f64.set(costs[i], (tables >> 3) + i * 64);
        f64.fill(0, best >> 3, (best >> 3) + 2 * k);
        u32.set(sparse.offsets, offsets >> 2); u32.set(sparse.pairs, pairs >> 2);
        return [exports.assign(n, k, switchCost, offsets, pairs, tables, back, best, next), i16.subarray(back >> 1, (back >> 1) + n * k)];
      },
      fill: (typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true) ? null : function fill(state, g, pass, density) {
        const {authoredOrderPasses, groupsX, progression, contexts, lumaBuckets, lumaW, xsizeBlocks, ysizeBlocks, comps, grey,
          orders, counted, blockCounts, nonZero, hshifts, vshifts} = state;
        if (progression || nonZero || contexts.map.length > 2560) return null;
        const wide = comps.some((comp, c) => !(grey && c !== 1) && comp.coeffs instanceof Int32Array) ? 1 : 0;
        const coeffBase = wide ? WCOEFFS : FCOEFFS, ctxBase = wide ? WCTXS : FCTXS, valueBase = wide ? WVALUES : FVALUES;
        reserve(wide ? WVALUES + GROUP_VALUES * 4 : CTAB);
        const plane = wide ? i32 : i16, authored = authoredOrderPasses?.[pass];
        i32.set(density, FDENSITY >> 2); i32.set(contexts.map, FMAP >> 2);
        const bx0 = g % groupsX * 32, by0 = (g / groupsX | 0) * 32, bw = Math.min(32, xsizeBlocks - bx0), bh = Math.min(32, ysizeBlocks - by0);
        const widths = [0, 1, 2].map(c => Math.ceil(bw / (1 << hshifts[c]))), rowsC = [0, 1, 2].map(c => Math.ceil(bh / (1 << vshifts[c])));
        i32.set([bw, bh, contexts.numCtxs, contexts.numDc, contexts.thresholds.length > 0 ? 1 : 0, counted ? 1 : 0, grey ? 1 : 0,
          ...hshifts, ...vshifts, widths[1], ...widths], FILL >> 2);
        for (let c = 0; c < 3; c++) {
          i32.set(authored?.ordinary?.[c] || orders[c], (FORDER >> 2) + c * 64);
          if (grey && c !== 1) continue;
          const {coeffs, stride, row0} = comps[c], w = widths[c], x = bx0 >> hshifts[c], y = by0 >> vshifts[c], base = (coeffBase >> 1 + wide) + c * 65536;
          const first = row0 > 0 ? row0 * stride : 0;
          for (let r = 0; r < rowsC[c]; r++) {
            const at = (y + r) * stride + x;
            plane.set(coeffs.subarray((at - first) * 64, (at - first + w) * 64), base + r * w * 64);
            if (counted) u8.set(blockCounts[c].subarray(at, at + w), FCOUNTS + c * 1024 + r * w);
          }
        }
        if (contexts.thresholds.length > 0) {
          const x = bx0 >> hshifts[1], y = by0 >> vshifts[1], w = widths[1];
          for (let r = 0; r < rowsC[1]; r++) u8.set(lumaBuckets.subarray((y + r) * lumaW + x, (y + r) * lumaW + x + w), FBUCKETS + r * w);
        }
        const n = exports.fill(coeffBase, ctxBase, valueBase, wide);
        if (!counted) for (let c = 0; c < 3; c++) if (!grey || c === 1) {
          const {stride} = comps[c], w = widths[c], x = bx0 >> hshifts[c], y = by0 >> vshifts[c];
          for (let r = 0; r < rowsC[c]; r++) blockCounts[c].set(u8.subarray(FCOUNTS + c * 1024 + r * w, FCOUNTS + c * 1024 + (r + 1) * w), (y + r) * stride + x);
        }
        lastFillWide = wide === 1;
        const filled = [n, u16.subarray(ctxBase >> 1, (ctxBase >> 1) + n), wide ? u32.subarray(valueBase >> 2, (valueBase >> 2) + n) : u16.subarray(valueBase >> 1, (valueBase >> 1) + n)];
        if (wide) filled.wide = true;
        return filled;
      },
      ...((typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true) ? {} : {
      sequentialScan(out, entries, nx, ny, restart, zeros, pad, zigzag, loadBand = null, per = 0) {
        const rowBlocks = entries.reduce((n, e) => n + e.v * e.stride, 0);
        if (entries.length > 4 || rowBlocks > BAND_BLOCKS || zeros.size > 65536 || pad && pad.bits.length > 65536 || out.pending) return false;
        reserve(CTAB);
        const runs = [...zeros].sort((a, b) => a[0] - b[0]);
        runs.forEach(([block, count], i) => { u32[(JZEROS >> 2) + 2 * i] = block; u32[(JZEROS >> 2) + 2 * i + 1] = count; });
        if (pad) pad.bits.forEach((bit, i) => { u8[JPADS + i] = bit === 0 || bit === 1 ? bit : 255; });
        i32.set(zigzag, JZIGZAG >> 2);
        entries.forEach((e, i) => { i32.set(e.dc, (JCODES >> 2) + i * 514); i32.set(e.ac, (JCODES >> 2) + i * 514 + 257); });
        loaded = null;
        exports.scanStart(pad ? pad.at : 0);
        const band = BAND_BLOCKS / rowBlocks | 0;
        for (let y0 = 0; y0 < ny;) {
          const limitY = loadBand ? Math.min(ny, ((y0 / per | 0) + 1) * per) : ny;
          const rows = Math.min(band, limitY - y0);
          if (loadBand) loadBand(y0);
          i32.set([entries.length, nx, rows, restart, pad ? pad.bits.length : -1, 0, runs.length], JSCAN >> 2);
          let at = JBAND;
          entries.forEach((e, i) => {
            const baseRow = y0 * e.v - (e.row0 || 0);
            const from = baseRow * e.stride * 64, to = Math.min(e.co.length, (baseRow + rows * e.v) * e.stride * 64);
            i16.set(e.co.subarray(from, to), at >> 1);
            i32.set([e.h, e.v, e.stride, at, e.index], (JSCAN >> 2) + 8 + i * 8);
            at += rows * e.v * e.stride * 128;
          });
          const bytes = exports.scanBand();
          if (bytes < 0) return null;
          out.chunk(u8.subarray(OUT, OUT + bytes));
          y0 += rows;
        }
        out.acc = u32[(JSCAN >> 2) + 56]; out.pending = u32[(JSCAN >> 2) + 57];
        if (pad) pad.at = u32[(JSCAN >> 2) + 7];
        return true;
      },
      sequentialDecode(bytes, start, frame, scan, restartInterval, zigzag) {
        const s = scanSlots(scan);
        if (!s) return null;
        const {single, first, tables, entries, slots} = s, length = bytes.length - start;
        const rowBlocks = entries.reduce((n, e) => n + e.v * e.c.stride, 0);
        const total = single ? first.blocksW * first.blocksH : frame.mcusX * frame.mcusY, perRow = single ? first.blocksW : frame.mcusX;
        const zerosAt = DIN + length + 15 & ~15;
        const banded = !!frame.bands;
        if (banded && (frame.packed === false || !(frame.packedLimit > 0))) return null;
        const bandRows = banded ? (single ? 32 * first.v : 32) / frame.vmax : BAND_BYTES / 128 / rowBlocks | 0;
        if (banded ? !Number.isInteger(bandRows) || bandRows < 1 : !bandRows) return null;
        const bandAt = banded ? zerosAt + 524288 + 15 & ~15 : DBAND, maxCB = banded ? Math.max(...entries.map(e => bandRows * e.v * e.c.stride)) : 0;
        const dcOut = banded ? bandAt + bandRows * rowBlocks * 128 + 15 & ~15 : 0, natAt = banded ? dcOut + maxCB * 2 + 15 & ~15 : 0;
        const countsOut = banded ? natAt + entries.length * 256 + 15 & ~15 : 0, atOut = banded ? countsOut + maxCB + 15 & ~15 : 0;
        const levelsOut = banded ? atOut + maxCB * 64 + 15 & ~15 : 0, end = banded ? levelsOut + maxCB * 128 : zerosAt + 524288;
        if (end > buf.byteLength) { if (end > DECODE_CAP) return null; fixedUsed = true; try { grow(end); } catch { return null; } }
        loaded = null;
        try {
          tables.forEach((t, i) => u16.set(t, i * 65536));
          u8.set(bytes.subarray(start), DIN);
          i32.set(zigzag, (DPARAMS + 256) >> 2);
          i32.set([entries.length, frame.mcusX, total, restartInterval, single ? 1 : 0, length, first.blocksW, 0, zerosAt], DPARAMS >> 2);
          exports.decodeStart();
          const setDesc = (row0, mcuRows, bAt) => {
            i32[(DPARAMS >> 2) + 7] = row0;
            let at = bAt;
            const bases = entries.map((e, i) => {
              const p = at;
              i32.set([e.h, e.v, e.c.stride, slots[i][0] * 131072, slots[i][1] * 131072, i, at], (DPARAMS >> 2) + 16 + i * 8);
              at += mcuRows * e.v * e.c.stride * 128;
              return p;
            });
            return exports.decodeBand(Math.min(total, (row0 + bandRows) * perRow), at - bAt) ? bases : null;
          };
          if (!banded) {
            for (let row0 = 0; row0 * perRow < total; row0 += bandRows) {
              const bases = setDesc(row0, bandRows, DBAND);
              if (!bases) return null;
              entries.forEach((e, i) => {
                const from = row0 * e.v * e.c.stride * 64, to = Math.min(e.c.coeffs.length, (row0 + bandRows) * e.v * e.c.stride * 64);
                e.c.coeffs.set(i16.subarray(bases[i] >> 1, (bases[i] >> 1) + to - from), from);
              });
            }
          } else {
            const per = bandRows * perRow, points = [], packedComp = [], dcList = entries.map(e => Int16Array.from(e.c.dc));
            entries.forEach((e, i) => u32.set(e.c.natural, (natAt + i * 256) >> 2));
            let addedBytes = 0;
            for (let row0 = 0, unit = 0; unit < total; row0 += bandRows, unit += per) {
              const mcuRows = Math.min(bandRows, Math.ceil((total - unit) / perRow)), bases = setDesc(row0, mcuRows, bandAt);
              if (!bases) return null;
              const compRows = [];
              for (let i = 0; i < entries.length; i++) {
                const e = entries[i], width = single ? e.c.blocksW : e.c.stride, eRows = single ? Math.min(bandRows, e.c.blocksH - row0) : mcuRows * e.v;
                u8.fill(0, dcOut, dcOut + eRows * e.c.stride * 2);
                const nz = exports.packBand(bases[i], width, eRows, e.c.stride, dcOut, natAt + i * 256, countsOut, atOut, levelsOut);
                dcList[i].set(i16.subarray(dcOut >> 1, (dcOut >> 1) + eRows * e.c.stride), (single ? row0 : row0 * e.v) * e.c.stride);
                if ((frame.packedBytes || 0) + (addedBytes += width * eRows + nz * 3) > frame.packedLimit) return null;
                compRows.push({width, rows: eRows, counts: u8.slice(countsOut, countsOut + width * eRows),
                  at: u8.slice(atOut, atOut + nz), levels: i16.slice(levelsOut >> 1, (levelsOut >> 1) + nz)});
              }
              points.push({unit}); packedComp.push(compRows);
            }
            entries.forEach((e, i) => { e.c.dc.set(dcList[i]); e.c.natural.set(u32.subarray((natAt + i * 256) >> 2, ((natAt + i * 256) >> 2) + 64)); });
            frame.packedBytes = (frame.packedBytes || 0) + addedBytes;
            frame.bands.push({scan, restartInterval, points, total, packed: null, packedComp});
          }
          entries.forEach((e, i) => { e.c.pred = i32[((DPARAMS + 224) >> 2) + i]; });
          const zeros = [];
          for (let i = 0, n = u32[(DPARAMS >> 2) + 11]; i < n; i++) zeros.push([u32[(zerosAt >> 2) + 2 * i], u32[(zerosAt >> 2) + 2 * i + 1]]);
          return {pos: start + u32[(DPARAMS >> 2) + 10], zeros, canonical: u32[(DPARAMS >> 2) + 12] === 0};
        } finally { exports.initTable(); clearCtab(end); }
      },
      ...((typeof __RAPIER_JXL_JPEG_PIXELS__ === 'undefined' || __RAPIER_JXL_JPEG_PIXELS__ === true) ? {
      scaledDecode(bytes, start, frame, scan, restartInterval, zigzag, plan, onBand, orient = 1) {
        const s = scanSlots(scan);
        if (!s) return null;
        const {single, first, tables, entries, slots} = s, length = bytes.length - start, mcusX = frame.mcusX;
        const total = single ? first.blocksW * first.blocksH : mcusX * frame.mcusY, perRow = single ? first.blocksW : mcusX;
        const totalRows = single ? first.blocksH : frame.mcusY, rowBlocks = entries.reduce((n, e) => n + e.v * e.c.stride, 0);
        const huffAt = DIN + length + 63 & ~63, bandStart = huffAt + tables.length * 131072 + 63 & ~63;
        const items = entries.map(e => ({c: e.c, h: e.h, v: e.v, colsY: single ? first.blocksW : mcusX * e.h, colsC: mcusX * e.h}));
        const got = runIdctBands(items, plan, totalRows, rowBlocks, bandStart, orient, onBand, (row0, mcuRows, bandAt) => {
          if (row0 < 0) {
            tables.forEach((t, i) => u16.set(t, (huffAt >> 1) + i * 65536));
            u8.set(bytes.subarray(start), DIN);
            i32.set(zigzag, (DPARAMS + 256) >> 2);
            i32.set([entries.length, mcusX, total, restartInterval, single ? 1 : 0, length, first.blocksW, 0, 0], DPARAMS >> 2);
            exports.decodeStart();
            return null;
          }
          i32[(DPARAMS >> 2) + 7] = row0;
          let at = bandAt;
          const bases = entries.map((e, i) => {
            const p = at;
            i32.set([e.h, e.v, e.c.stride, huffAt + slots[i][0] * 131072, huffAt + slots[i][1] * 131072, i, at], (DPARAMS >> 2) + 16 + i * 8);
            at += mcuRows * e.v * e.c.stride * 128;
            return p;
          });
          return exports.decodeBand(Math.min(total, (row0 + mcuRows) * perRow), at - bandAt) ? bases : null;
        });
        return got && {pos: start + u32[(DPARAMS >> 2) + 10], oriented: got.oriented};
      },
      async renderGeneralBands(parsed, onBand) {
        const comps = parsed.components, count = comps.length;
        const hmax = Math.max(...comps.map(c => c.h)), vmax = Math.max(...comps.map(c => c.v));
        const {width, height} = parsed, mcusY = Math.ceil(height / (8 * vmax));
        const bandMcus = Math.max(1, Math.min(8, 131072 / Math.max(1, width * vmax * 8) | 0));
        let render;
        try {
          const binary = () => Uint8Array.from(atob(JPEG_GENERAL_ROWS), c => c.charCodeAt(0));
          if (!await compileWasm('general', binary)) throw 0;
          render = new WebAssembly.Instance(wasmModule('general', binary), {env: {memory}}).exports.jpegGeneralRows;
        } catch {
          throw fault('JXL_WASM', 'JPEG layout: ' + comps.map(c => c.h + 'x' + c.v).join('/') + (count === 4 ? ' CMYK/YCCK' : '') + ': kernel unavailable');
        }
        const mode = count === 1 ? 0 : count === 3 ? (parsed.ycbcr ? 1 : 2) : parsed.adobeTransform === 2 ? 5 : parsed.adobeTransform === 0 ? 3 : 4;
        loaded = priceStamp = null;
        for (let row0 = 0; row0 < mcusY; row0 += bandMcus) {
          const rows = Math.min(bandMcus, mcusY - row0), first = Math.max(0, row0 - 1), decodedMcus = Math.min(mcusY, row0 + rows + 1) - first;
          const y0 = row0 * vmax * 8, emittedRows = Math.min(height - y0, rows * vmax * 8);
          let at = DPARAMS;
          const coff = comps.map(c => { const p = at; at += decodedMcus * c.v * c.stride * 128; return p; });
          const quantAt = at + 63 & ~63;
          at = quantAt + 256 * count;
          const plane = comps.map(c => { const stride = c.stride * 8 + 15 & ~3, p = {base: at, stride}; at += decodedMcus * c.v * 8 * stride * 4; return p; });
          const descAt = at + 63 & ~63, rgbaAt = descAt + 28 * count + 63 & ~63;
          reserve(rgbaAt + emittedRows * width * 4);
          comps.forEach((c, i) => {
            const base = coff[i], n = decodedMcus * c.v * c.stride * 64, from = first * c.v * c.stride * 64, to = Math.min(c.coeffs.length, from + n);
            u8.fill(0, base, base + n * 2);
            if (to > from) i16.set(c.coeffs.subarray(from, to), base >> 1);
            for (let k = 0; k < 64; k++) f32[((quantAt + i * 256) >> 2) + k] = c.quant[k];
            exports.idctPlane(base, quantAt + i * 256, c.blocksW, decodedMcus * c.v, c.stride, 8, 8, plane[i].base, plane[i].stride, 128);
            i32.set([plane[i].base, plane[i].stride, c.h, c.v, Math.ceil(width * c.h / hmax), Math.ceil(height * c.v / vmax), first * c.v * 8], (descAt >> 2) + i * 7);
          });
          render(descAt, width, height, y0, emittedRows, hmax, vmax, count, mode, rgbaAt);
          onBand(y0, emittedRows, u8.subarray(rgbaAt, rgbaAt + emittedRows * width * 4));
        }
      },
      renderParsedBands(parsed, plan, onBand) {
        const comps = parsed.components, items = comps.map(c => ({c, h: c.h, v: c.v, colsY: plan.mcusX * c.h, colsC: plan.mcusX * c.h}));
        runIdctBands(items, plan, plan.mcusY, comps.reduce((n, c) => n + c.v * c.stride, 0), DPARAMS, null, onBand, (row0, mcuRows, bandAt) => {
          let at = bandAt;
          return comps.map(c => {
            const p = at, rFrom = row0 * c.v * c.stride * 64, rTo = Math.min(c.coeffs.length, (row0 + mcuRows) * c.v * c.stride * 64);
            u8.fill(0, at, at + mcuRows * c.v * c.stride * 128);
            if (rTo > rFrom) i16.set(c.coeffs.subarray(rFrom, rTo), at >> 1);
            at += mcuRows * c.v * c.stride * 128;
            return p;
          });
        });
      },
      } : {}),
      }),
      prefixFilled: (typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true) ? null : function prefixFilled(model) {
        const {contextMap, histograms} = model;
        if (histograms.length > 255 || contextMap.length > 8192 || histograms.some(h => h.code.lengths.length > 256)) return null;
        return (w, n) => {
          if (loaded !== model) {
            reserve(CTAB);
            const slots = [0, 0, 0];
            u8.set(contextMap, CMAP);
            histograms.forEach(({code, config}, id) => {
              const base = HISTOGRAMS + id * TABLE_SIZE;
              u8.fill(0, base, base + TABLE_SIZE);
              for (let v = 0; v < 64; v++) {
                hybridToken(config, v, slots);
                const len = code.lengths[slots[0]], total = len + slots[1], gen = len === undefined || total > 24;
                i32[(base >> 2) + v] = gen ? -1 : total;
                i32[((base + 256) >> 2) + v] = gen ? 0 : code.codes[slots[0]] | slots[2] << len;
              }
              u8.set(code.lengths, base + 512); u16.set(code.codes, (base + 768) >> 1);
              i32.set([config.split, config.msb, config.lsb], (base + 10000) >> 2);
            });
            loaded = model;
          }
          exports.tokensIn(0, n);
          drainBits(w, u8, OUT, exports.prefixWrite(n, w.acc, w.pending), u32[SCRATCH >> 2], u32[(SCRATCH >> 2) + 1]);
        };
      },
      ...((typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true) ? {} : {
      brotliParse(data, start, end, windowBits, model) {
        priceStamp = priceMore = null;
        const reach = (1 << windowBits) - 16, origin = Math.max(0, start - reach), bytes = data.subarray(origin, end);
        const n = end - start, base = 1 << 32 - Math.clz32(n), input = DYNAMIC, heads = input + bytes.length + 11 & -4;
        const previous = heads + 262144, prefix = previous + bytes.length * 4, records = prefix + (n + 1) * 4;
        const mins = records + (n + 1) * 16, copies = mins + base * 8, choices = copies + base * 32, prices = choices + 192, out = prices + model.length;
        reserve(out + Math.ceil(n / 2) * 12 + 16);
        u8.set(bytes, input); u8.fill(0, input + bytes.length, heads); u8.set(model, prices);
        const words = exports.brotliParse(input, start - origin, n, reach, heads, previous, prefix, records, mins, copies, base, prices, choices, out, origin);
        return i32.slice(out >> 2, (out >> 2) + words);
      },
      literalClusters(clusters) {
        const n = clusters.length, kept = [], rank = new Int32Array(n);
        reserve(OUT + 131072);
        clusters.forEach((c, i) => u32.set(c.freqs, (LHIST >> 2) + i * 256));
        exports.literalClusters(n);
        for (let i = 0; i < n; i++) if (u8[LALIVE + i]) {
          rank[i] = kept.length;
          kept.push({freqs: u32.slice((LHIST >> 2) + i * 256, (LHIST >> 2) + (i + 1) * 256), contexts: [], bits: f64[(LBITS >> 3) + i]});
        }
        for (let i = 0; i < n; i++) kept[rank[u32[(LOWNER >> 2) + i]]].contexts.push(...clusters[i].contexts);
        return kept;
      },
      acLowerBound(parsed) {
        if (!exports.acHist || parsed.progression || parsed.progressive || parsed.bandFrame) return 0;
        const comps = parsed.components;
        if (!comps || comps.length !== 1 && comps.length !== 3 || comps.some(c => !(c.coeffs instanceof Int16Array))) return 0;
        const maxH = Math.max(...comps.map(c => c.h)), maxV = Math.max(...comps.map(c => c.v));
        const active = comps.length === 1 || comps.some(c => c.h !== maxH || c.v !== maxV) ? comps : [parsed.colorSpace === 'rgb' ? comps[1] : comps[0]];
        const histAt = SCRATCH, bufAt = SCRATCH + 8192, roomBytes = VALUES - bufAt;
        u32.fill(0, histAt >> 2, (histAt >> 2) + 2048);
        const totalW = Math.ceil(parsed.width / 8), totalH = Math.ceil(parsed.height / 8);
        let maxTokens = 0, nPos = 0, sumHLogH = 0;
        for (const c of active) {
          const bw = Math.ceil(totalW * c.h / maxH), bh = Math.ceil(totalH * c.v / maxV), stride = c.stride;
          if (bw < 1 || bh < 1 || stride < bw) return 0;
          const rowBytes = stride * 128, batch = Math.max(1, roomBytes / rowBytes | 0);
          if (rowBytes > roomBytes) reserve(bufAt + rowBytes);
          for (let y = 0; y < bh; y += batch) {
            const h = Math.min(batch, bh - y);
            i16.set(c.coeffs.subarray(y * stride * 64, (y + h) * stride * 64), bufAt >> 1);
            exports.acHist(bufAt, bw, h, stride, histAt);
          }
          maxTokens += bw * bh * 64;
        }
        for (let v = 1; v < 2048; v++) {
          const count = u32[(histAt >> 2) + v];
          if (count > 0) { nPos += count; if (count > 1) sumHLogH += count * Math.log2(count); }
        }
        if (nPos <= 1) return 0;
        const bits = nPos * Math.log2(nPos) - sumHLogH - maxTokens * 0.02273;
        return bits > 0 ? Math.floor(bits / 8) : 0;
      },
      }),
      countFilled: (typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true) ? null : function countFilled(into, n) {
        if (into.contexts > 8192 || lastFillWide) return false;
        const table = CTAB + into.contexts * 256;
        if (table > tableEnd) { reserve(table); u8.fill(0, tableEnd, table); tableEnd = table; }
        const unique = tableEnd, larges = unique + Math.min(n, into.contexts * 64) * 4, end = larges + n * 8 + 15 & ~15;
        if (end > listsEnd || listsEnd < tableEnd) { listsEnd = Math.max(end, tableEnd); priceStamp = priceMore = null; }
        reserve(end);
        const m = exports.countFilled(n, unique, larges), large = u32[SCRATCH >> 2], {small, totals} = into;
        for (let i = 0; i < m; i++) { const at = u32[(unique >> 2) + i], count = u32[(CTAB >> 2) + at]; small[at] += count; totals[at >> 6] += count; }
        exports.countClear(m, unique);
        for (let i = 0; i < large; i++) into.add(u32[(larges >> 2) + 2 * i], u32[(larges >> 2) + 2 * i + 1]);
        u32.fill(0, unique >> 2, (unique >> 2) + m); u32.fill(0, larges >> 2, (larges >> 2) + 2 * large);
        return true;
      },
      ansWriter: (typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true) ? () => ({write: true, flush: true}) : function ansWriter(model) {
        const {contextMap, histograms} = model;
        if (histograms.length > 255 || contextMap.length > 8192 || histograms.some(h => h.counts.length > 256)) return null;
        if (CMAP > buf.byteLength) grow(CMAP);
        let length = 0;
        return {
          write(_w, ctx, value) { u32[(VALUES >> 2) + length] = value; u8[IDS + length++] = contextMap[ctx]; },
          writeTokens(_w, ctxs, tokens, n) { for (let i = 0, at = VALUES >> 2; i < n; i++) { u32[at + length] = tokens[i]; u8[IDS + length++] = contextMap[ctxs[i]]; } },
          writeFilled(_w, n) {
            reserve(CTAB);
            if (loaded !== model) {
              const slots = [0, 0, 0];
              u8.set(contextMap, CMAP);
              histograms.forEach((h, id) => {
                const base = HISTOGRAMS + id * TABLE_SIZE;
                u8.fill(0, base, base + TABLE_SIZE);
                u16.set(h.counts, base >> 1); u16.set(h.starts, (base + 512) >> 1); u16.set(h.reverse, (base + 1040) >> 1);
                for (let v = 0; v < 64; v++) {
                  hybridToken(h.config, v, slots);
                  i32[((base + 9232) >> 2) + v] = slots[1] << 6 | slots[2];
                  i32[((base + 9488) >> 2) + v] = h.counts[slots[0]] || 0; i32[((base + 9744) >> 2) + v] = h.starts[slots[0]] || 0;
                }
                i32.set([h.config.split, h.config.msb, h.config.lsb], (base + 10000) >> 2);
              });
              exports.recips(histograms.length);
              loaded = model;
            }
            exports.tokensIn(length, n); length += n;
          },
          flush(w) {
            if (!tokenFlush) throw fault('JXL_INTERNAL', 'jpeg-kernels:ans-writer');
            tokenFlush(w, model, u32.subarray(VALUES >> 2, (VALUES >> 2) + length), u8.subarray(IDS, IDS + length), length); length = 0;
          },
          reset() { length = 0; },
        };
      },
    };
  } catch { engine = null; }
  return engine;
}

export const compileJpegKernels = () => compileWasm('jpeg', () => wasmBytes(JPEG_KERNELS));
export function capJpegKernels(bytes, flushTokens) {
  if ((typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true)) return null;
  const kernels = jpegKernels(flushTokens);
  if (!kernels || kernels.memoryBytes() > bytes) return null;
  limit = bytes;
  return kernels;
}
export function retireJpegKernels() { if (limit === Infinity) engine = undefined; }
export function releaseJpegKernels() { if ((typeof __RAPIER_JXL_CAPTURE_PHOTO__ !== 'undefined' && __RAPIER_JXL_CAPTURE_PHOTO__ === true)) return; engine = undefined; limit = Infinity; }

function flattenSparse(ordered) {
  let total = 0, at = 0;
  for (const {sparse} of ordered) total += sparse.length;
  const offsets = new Uint32Array(ordered.length + 1), pairs = new Uint32Array(total);
  ordered.forEach(({sparse}, t) => { offsets[t] = at; pairs.set(sparse, at); at += sparse.length; });
  offsets[ordered.length] = at;
  return {offsets, pairs};
}
