// SPDX-License-Identifier: MIT
import {fault} from './admit.mjs';
import {ORDER_STRATEGY_BUCKETS} from './coefficient-orders.mjs';
import {TRANSFORMS} from './vardct-strategies.mjs';
import {strategyStorageShape, strategyGroupRange, strategyBlockRecord, strategyBlockView} from './vardct-blocks.mjs';
import {NONZERO_BUCKETS, ZERO_DENSITY_CONTEXTS, ORDERS} from './dct8-contexts.mjs';
import {countACRanks, emitACRanks, predictDCT8NonZero, predictStrategyNonZero} from './vardct-ranks.mjs';
import {prefetchTyped} from './typed-views.mjs';

export const VARDCT_RANK_UNIT = 256;
const bad = () => { throw fault('JXL_INPUT', 'Invalid finite VarDCT token shape or cursor.'); };
const integer = (v, lo, hi) => Number.isSafeInteger(v) && v >= lo && v <= hi;
const samples = v => v instanceof Int16Array || v instanceof Int32Array;
const indices = (from, to) => Array.from({length: to - from}, (_, i) => from + i);
const orderShape = (v, size) => (Array.isArray(v) || v instanceof Uint32Array || v instanceof Uint16Array || v instanceof Uint8Array || v instanceof Int32Array) && v.length === size;
const length = (v, minimum) => v != null && integer(v.length, minimum, Number.MAX_SAFE_INTEGER);

function shape(input, group, pass) {
  if (!input || !integer(input.groupsX, 1, 0x4000000) || !integer(input.xsizeBlocks, 1, 0x40000000) ||
      !integer(input.ysizeBlocks, 1, 0x40000000) || input.groupsX !== Math.ceil(input.xsizeBlocks / 32)) bad();
  const groups = input.groupsX * Math.ceil(input.ysizeBlocks / 32), passes = input.progression?.count ?? 1;
  if (!integer(groups, 1, Number.MAX_SAFE_INTEGER) || !integer(group, 0, groups - 1) || !integer(passes, 1, 11) || !integer(pass, 0, passes - 1)) bad();
  const {contexts, progression} = input;
  if (!contexts || !integer(contexts.numDc, 1, 8) || !integer(contexts.numCtxs, 1, 256) ||
      !length(contexts.map, 3 * ORDERS * contexts.numDc) || contexts.map.length !== 3 * ORDERS * contexts.numDc ||
      !length(contexts.thresholds, 0) || contexts.thresholds.length !== contexts.numDc - 1) bad();
  if (progression) {
    if (!Array.isArray(progression.passes) || progression.passes.length !== passes) bad();
    for (let i = 0; i < passes; i++) {
      const p = progression.passes[i], previous = progression.passes[i - 1];
      if (!p || ![1, 2, 4, 8].includes(p.downsample) || !integer(p.shift, 0, 3) || p.scale !== 2 ** p.shift ||
          previous && (p.downsample > previous.downsample || p.shift > previous.shift)) bad();
    }
    if (progression.passes.at(-1).downsample !== 1 || progression.passes.at(-1).shift !== 0) bad();
  }
  if (!Array.isArray(input.comps) || input.comps.length !== 3 || !Array.isArray(input.map) || input.map.length !== 3 ||
      !Array.isArray(input.hshifts) || input.hshifts.length !== 3 || !Array.isArray(input.vshifts) || input.vshifts.length !== 3) bad();
  for (let c = 0; c < 3; c++) {
    if (!integer(input.map[c], 0, input.grey ? 0 : 2) || !integer(input.hshifts[c], 0, 1) || !integer(input.vshifts[c], 0, 1)) bad();
    const component = input.comps[c], w = input.xsizeBlocks / 2 ** input.hshifts[c], h = input.ysizeBlocks / 2 ** input.vshifts[c];
    if (!Number.isInteger(w) || !Number.isInteger(h) || !component || !integer(component.stride, w, Number.MAX_SAFE_INTEGER)) bad();
    if (!input.strategyData && !(input.grey && c !== 1)) {
      const row0 = component.row0 ?? 0, rows = h - row0;
      if (!integer(row0, 0, h - 1) || !samples(component.coeffs) || !length(component.coeffs, component.stride * rows * 64)) bad();
      if (input.counted && !length(input.blockCounts?.[c], component.stride * h)) bad();
      if (input.blockCounts?.[c] && !length(input.blockCounts[c], component.stride * h)) bad();
      if (input.nonZero && !progression && !length(input.nonZero[c], component.stride * h)) bad();
    }
  }
  if (input.lumaW !== input.xsizeBlocks / 2 ** input.hshifts[1] || contexts.numDc > 1 &&
      !length(input.lumaBuckets, input.lumaW * input.ysizeBlocks / 2 ** input.vshifts[1])) bad();
  if (input.authoredOrderPasses && (!Array.isArray(input.authoredOrderPasses) || input.authoredOrderPasses.length !== passes)) bad();
  if (input.strategyData) {
    if (input.grey || input.hshifts.some(Boolean) || input.vshifts.some(Boolean)) bad();
    strategyStorageShape(input.strategyData, input.xsizeBlocks, input.ysizeBlocks, groups);
    if (input.authoredOrderPasses) for (const authored of input.authoredOrderPasses) {
      if (!authored || !authored.byStrategy || typeof authored.byStrategy !== 'object') bad();
      const ids = Object.keys(authored.byStrategy);
      if (ids.length > TRANSFORMS.length) bad();
      for (const key of ids) {
        const id = Number(key), orders = authored.byStrategy[key], transform = TRANSFORMS[id];
        if (!transform || String(id) !== key || !Array.isArray(orders) || orders.length !== 3 ||
            orders.some(v => v && !orderShape(v, transform.width * transform.height))) bad();
      }
    }
  } else {
    if (!Array.isArray(input.orders) || input.orders.length !== 3 || input.orders.some(v => !orderShape(v, 64))) bad();
    if (input.authoredOrderPasses) for (const authored of input.authoredOrderPasses)
      if (!authored || authored.ordinary && (!Array.isArray(authored.ordinary) || authored.ordinary.length !== 3 || authored.ordinary.some(v => v && !orderShape(v, 64)))) bad();
  }
  return groups;
}

export function startVarDCTTokens(input, group, pass = 0) {
  const groups = shape(input, group, pass);
  return {version: 1, phase: 'admit', group, pass, groups, admitGroup: 0, admitBlock: 0,
    cover: new Array(1024).fill(0), lastAnchor: -1, first: 0, limit: 0,
    block: 0, channel: 0, rank: 0, count: 0, left: 0, prev: 0,
    nzeros: [new Int32Array(1024), new Int32Array(1024), new Int32Array(1024)]};
}

function groupRect(input, g) {
  const x = g % input.groupsX * 32, y = Math.floor(g / input.groupsX) * 32;
  return {x, y, w: Math.min(32, input.xsizeBlocks - x), h: Math.min(32, input.ysizeBlocks - y)};
}

function admitBlock(input, state) {
  if (!input.strategyData) {
    const rect = groupRect(input, state.group);
    state.limit = rect.w * rect.h; state.admitGroup = state.groups; state.phase = 'block'; return;
  }
  const data = input.strategyData, g = state.admitGroup, {from, to} = strategyGroupRange(data, g), rect = groupRect(input, g), count = to - from;
  if (!integer(count, 1, rect.w * rect.h) || !integer(state.admitBlock, 0, count)) bad();
  if (state.admitBlock === count) {
    for (let y = 0; y < rect.h; y++) for (let x = 0; x < rect.w; x++) if (state.cover[y * 32 + x] !== 1) bad();
    if (g === state.group) { state.first = from; state.limit = count; }
    state.admitGroup++; state.admitBlock = 0; state.lastAnchor = -1; state.cover.fill(0);
    if (state.admitGroup === state.groups) state.phase = 'block';
    return;
  }
  const index = from + state.admitBlock, block = strategyBlockRecord(data, index), x = block.bx - rect.x, y = block.by - rect.y, anchor = y * 32 + x;
  if (x < 0 || y < 0 || x + block.bw > rect.w || y + block.bh > rect.h || anchor <= state.lastAnchor ||
      !orderShape(input.strategyData.orders[block.id], block.size)) bad();
  const mapIndices = [];
  for (let by = 0; by < block.bh; by++) for (let bx = 0; bx < block.bw; bx++) mapIndices.push((block.by + by) * data.stride + block.bx + bx);
  prefetchTyped([data.at, mapIndices]);
  for (let by = 0; by < block.bh; by++) for (let bx = 0; bx < block.bw; bx++) if (state.cover[(y + by) * 32 + x + bx] ||
      data.at[(block.by + by) * data.stride + block.bx + bx] !== (bx || by ? -2 : index)) bad();
  for (let by = 0; by < block.bh; by++) for (let bx = 0; bx < block.bw; bx++) state.cover[(y + by) * 32 + x + bx] = 1;
  state.lastAnchor = anchor; state.admitBlock++;
}

function blockData(input, state) {
  const c = state.channel === 0 ? 1 : state.channel === 1 ? 0 : 2, rect = groupRect(input, state.group), authored = input.authoredOrderPasses?.[state.pass];
  if (input.strategyData) {
    const b = strategyBlockView(input.strategyData, state.first + state.block);
    return {c, coeffs: b.coeffs[input.map[c]], base: 0, order: authored?.byStrategy?.[b.id]?.[c] ?? b.order,
      x: b.bx - rect.x, y: b.by - rect.y, bw: b.bw, bh: b.bh, area: b.area, size: b.size,
      width: Math.max(b.bw, b.bh) * 8, height: Math.min(b.bw, b.bh) * 8, ord: ORDER_STRATEGY_BUCKETS[b.id],
      bucket: b.by * input.lumaW + b.bx, transpose: false};
  }
  const bx = state.block % rect.w, by = Math.floor(state.block / rect.w), hs = input.hshifts[c], vs = input.vshifts[c], x = bx >> hs, y = by >> vs;
  if (x << hs !== bx || y << vs !== by) return null;
  const component = input.comps[c], at = input.grey && c !== 1 ? -1 : ((rect.y >> vs) + y) * component.stride + (rect.x >> hs) + x;
  return {c, coeffs: component.coeffs, base: at * 64 - (component.row0 ?? 0) * component.stride * 64,
    order: authored?.ordinary?.[c] ?? input.orders[c], x, y, bw: 1, bh: 1, area: 1, size: 64, width: 8, height: 8, ord: 0,
    bucket: ((rect.y + by) >> input.vshifts[1]) * input.lumaW + ((rect.x + bx) >> input.hshifts[1]), transpose: true, at};
}

function nextBlock(state) {
  state.channel++;
  if (state.channel === 3) { state.channel = 0; state.block++; }
  state.rank = 0; state.count = 0; state.left = 0; state.prev = 0;
  state.phase = state.block === state.limit ? 'done' : 'block';
}

function rankViews(block, from, to, ordered) {
  if (ordered) prefetchTyped([block.order, indices(from, to)]);
  const positions = [];
  for (let k = from; k < to; k++) {
    const pos = ordered ? block.order[k] : k;
    if (!integer(pos, 0, block.size - 1)) bad();
    positions.push(block.base + pos);
  }
  if (positions.some(pos => !integer(pos, 0, block.coeffs.length - 1))) bad();
  return [block.coeffs, positions];
}

export function advanceVarDCTTokens(input, state, ctxs, values) {
  if (state?.version !== 1 || !['admit', 'block', 'count', 'prefix', 'ranks', 'done'].includes(state.phase) ||
      shape(input, state.group, state.pass) !== state.groups || !integer(state.block, 0, 1024) || !integer(state.channel, 0, 2) ||
      !integer(state.rank, 0, 65536) || !integer(state.count, 0, 65535) || !integer(state.left, 0, state.count) ||
      !integer(state.first, 0, input.strategyData?.blockCount ?? 0) || !integer(state.limit, 0, 1024) ||
      !integer(state.prev, 0, 1) || !Array.isArray(state.nzeros) || state.nzeros.length !== 3 ||
      state.nzeros.some(v => !(v instanceof Int32Array) || v.length !== 1024) ||
      !(ctxs instanceof Int32Array) || !(values instanceof Uint32Array) || ctxs.length < VARDCT_RANK_UNIT || values.length < VARDCT_RANK_UNIT) bad();
  if (state.phase !== 'admit' && state.admitGroup !== state.groups) bad();
  if (state.phase === 'done') {
    if (state.block !== state.limit || state.channel !== 0 || state.rank || state.count || state.left || state.prev) bad();
    return {done: true, work: 0, n: 0, ranks: 0};
  }
  if (state.phase === 'admit') {
    if (!integer(state.admitGroup, 0, state.groups - 1) || !integer(state.admitBlock, 0, 1024) ||
        !integer(state.lastAnchor, -1, 1023) || !Array.isArray(state.cover) || state.cover.length !== 1024 ||
        state.cover.some(v => v !== 0 && v !== 1)) bad();
    admitBlock(input, state); return {done: false, work: 1, n: 0, ranks: 0};
  }
  if (!integer(state.block, 0, state.limit - 1) || input.strategyData && state.first + state.limit > input.strategyData.blockCount) bad();
  if (input.strategyData) {
    const range = strategyGroupRange(input.strategyData, state.group);
    if (state.first !== range.from || state.limit !== range.to - range.from) bad();
  } else {
    const rect = groupRect(input, state.group);
    if (state.first !== 0 || state.limit !== rect.w * rect.h) bad();
  }
  const block = blockData(input, state);
  if (state.phase === 'block') {
    if (state.rank || state.count || state.left || state.prev) bad();
    if (!block) nextBlock(state);
    else { state.rank = block.area; state.phase = block.at === -1 ? 'prefix' : 'count'; }
    return {done: state.phase === 'done', work: 1, n: 0, ranks: 0};
  }
  if (!block || !integer(state.rank, block.area, block.size) || state.count > block.size - block.area ||
      state.phase === 'count' && (state.count > state.rank - block.area || state.left || state.prev) ||
      state.phase === 'prefix' && (state.rank !== (block.at === -1 ? block.area : block.size) || state.left || state.prev) ||
      state.phase === 'ranks' && state.left > block.size - state.rank) bad();
  if (state.phase === 'count') {
    if (!input.strategyData && (input.counted || input.nonZero && !input.progression)) {
      const source = input.counted ? input.blockCounts[block.c] : input.nonZero[block.c], dest = input.blockCounts?.[block.c];
      prefetchTyped([source, [block.at]], ...(dest ? [[dest, [block.at]]] : []));
      const count = source[block.at]; if (!integer(count, 0, 63)) bad();
      if (dest) dest[block.at] = count;
      state.count = count; state.rank = block.size; state.phase = 'prefix';
      return {done: false, work: 1, n: 0, ranks: 0};
    }
    const to = Math.min(block.size, state.rank + VARDCT_RANK_UNIT), from = state.rank;
    const dest = !input.strategyData && to === block.size && input.blockCounts?.[block.c];
    prefetchTyped(rankViews(block, from, to, !!input.strategyData), ...(dest ? [[dest, [block.at]]] : []));
    const count = state.count + countACRanks(block.coeffs, block.base, input.strategyData ? block.order : null,
      from, to, input.progression, state.pass, block.width, block.height, block.transpose);
    if (dest) dest[block.at] = count;
    state.count = count; state.rank = to; if (to === block.size) state.phase = 'prefix';
    return {done: false, work: 1, n: 0, ranks: to - from};
  }
  if (state.phase === 'prefix') {
    const {contexts} = input, row = state.nzeros[block.c], writes = [];
    for (let y = 0; y < block.bh; y++) for (let x = 0; x < block.bw; x++) writes.push((block.y + y) * 32 + block.x + x);
    if (block.y) writes.push((block.y - 1) * 32 + block.x);
    if (block.x) writes.push(block.y * 32 + block.x - 1);
    prefetchTyped([row, writes], [contexts.map, indices(0, contexts.map.length)], [ctxs, [0]], [values, [0]],
      ...(contexts.numDc > 1 ? [[input.lumaBuckets, [block.bucket]]] : []));
    const bucket = contexts.numDc > 1 ? input.lumaBuckets[block.bucket] : 0;
    if (!integer(bucket, 0, contexts.numDc - 1)) bad();
    const blockCtx = contexts.map[((block.c < 2 ? block.c ^ 1 : 2) * ORDERS + block.ord) * contexts.numDc + bucket];
    if (!integer(blockCtx, 0, contexts.numCtxs - 1)) bad();
    const predicted = input.strategyData ? predictStrategyNonZero(row, block.x, block.y, state.count, block.bw, block.bh, block.area) :
      predictDCT8NonZero(row, block.x, block.y, state.count), capped = Math.min(predicted, 64);
    ctxs[0] = (capped < 8 ? capped : 4 + (capped >> 1)) * contexts.numCtxs + blockCtx; values[0] = state.count;
    state.offset = contexts.numCtxs * NONZERO_BUCKETS + ZERO_DENSITY_CONTEXTS * blockCtx;
    state.left = state.count; state.prev = state.count > block.size / 16 ? 0 : 1; state.rank = block.area;
    if (state.left) state.phase = 'ranks'; else nextBlock(state);
    return {done: state.phase === 'done', work: 1, n: 1, ranks: 0};
  }
  if (!integer(state.offset, 0, input.contexts.numCtxs * (NONZERO_BUCKETS + ZERO_DENSITY_CONTEXTS) - 1) || !state.left) bad();
  const from = state.rank, to = Math.min(block.size, from + VARDCT_RANK_UNIT);
  prefetchTyped(rankViews(block, from, to, true), [ctxs, indices(0, to - from)], [values, indices(0, to - from)]);
  const tail = {}, n = emitACRanks(block.coeffs, block.base, block.order, from, to, state.left, state.prev, state.offset,
    block.area, ctxs, values, 0, input.progression, state.pass, block.width, block.height, block.transpose, tail);
  if (tail.rank === block.size && tail.left) bad();
  state.rank = tail.rank; state.left = tail.left; state.prev = tail.prev;
  if (!state.left) nextBlock(state);
  return {done: state.phase === 'done', work: 1, n, ranks: tail.rank - from};
}

export function nextVarDCTTokens(input, state, group, pass = 0) {
  const groups = shape(input, group, pass);
  if (state?.version !== 1 || state.phase !== 'done' || state.groups !== groups || state.admitGroup !== groups ||
      state.block !== state.limit || state.channel !== 0 || state.rank || state.count || state.left || state.prev ||
      !Array.isArray(state.nzeros) || state.nzeros.length !== 3 || state.nzeros.some(v => !(v instanceof Int32Array) || v.length !== 1024)) bad();
  const rect = groupRect(input, group), range = input.strategyData ? strategyGroupRange(input.strategyData, group) : {from: 0, to: rect.w * rect.h};
  return {...state, phase: 'block', group, pass, first: range.from, limit: range.to - range.from, block: 0};
}
