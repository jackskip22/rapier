// SPDX-License-Identifier: MIT
import {fault} from './admit.mjs';
import {TRANSFORMS} from './vardct-strategies.mjs';
import {prefetchTyped} from './typed-views.mjs';

const bad = () => { throw fault('JXL_INPUT', 'Invalid packed VarDCT strategy image.'); };
const integer = (v, lo, hi) => Number.isSafeInteger(v) && v >= lo && v <= hi;

export function strategyStorageShape(data, stride, rows, groups) {
  const cells = stride * rows, orders = data?.orders;
  if (!data || data.stride !== stride || data.rows !== rows || !Number.isSafeInteger(cells) ||
      !integer(data.blockCount, 1, cells) || !(data.catalog instanceof Uint32Array) ||
      data.catalog.length % 4 || data.catalog.length < 4 * data.blockCount || data.catalog.length > 4 * cells ||
      !(data.groupStarts instanceof Uint32Array) || data.groupStarts.length !== groups + 1 ||
      !(data.at instanceof Int32Array) || data.at.length !== cells ||
      !Array.isArray(data.coefficients) || data.coefficients.length !== 3 ||
      data.coefficients.some(v => !(v instanceof Int32Array) || v.length !== cells * 64) ||
      !Array.isArray(data.lowFrequencies) || data.lowFrequencies.length !== 3 ||
      data.lowFrequencies.some(v => !(v instanceof Int32Array) || v.length !== cells) ||
      !Array.isArray(data.tables) || data.tables.length !== 17 ||
      !Array.isArray(orders) || orders.length !== TRANSFORMS.length) bad();
  for (let id = 0; id < orders.length; id++) if (orders[id] !== null &&
      (!(orders[id] instanceof Uint32Array) || orders[id].length !== TRANSFORMS[id].width * TRANSFORMS[id].height)) bad();
  return cells;
}

export function strategyGroupRange(data, group) {
  const starts = data.groupStarts, last = starts.length - 1;
  if (!integer(group, 0, last - 1)) bad();
  prefetchTyped([starts, [0, group, group + 1, last]]);
  const from = starts[group], to = starts[group + 1];
  if (starts[0] !== 0 || starts[last] !== data.blockCount || !integer(from, 0, data.blockCount) || !integer(to, from, data.blockCount)) bad();
  return {from, to};
}

export function strategyBlockRecord(data, index) {
  if (!integer(index, 0, data.blockCount - 1)) bad();
  const at = index * 4;
  prefetchTyped([data.catalog, [at, at + 1, at + 2, at + 3]]);
  const id = data.catalog[at], bx = data.catalog[at + 1], by = data.catalog[at + 2], cellOffset = data.catalog[at + 3], transform = TRANSFORMS[id];
  if (!transform) bad();
  const bw = transform.width / 8, bh = transform.height / 8, area = bw * bh;
  if (!integer(bx, 0, data.stride - bw) || !integer(by, 0, data.rows - bh) ||
      !integer(cellOffset, 0, data.stride * data.rows - area)) bad();
  return {id, bx, by, bw, bh, area, size: area * 64, cellOffset};
}

export function strategyBlockView(data, index) {
  const block = strategyBlockRecord(data, index), {cellOffset, area, size, id} = block, order = data.orders[id];
  if (!(order instanceof Uint32Array) || order.length !== size) bad();
  return {...block, order,
    coeffs: data.coefficients.map(v => v.subarray(cellOffset * 64, (cellOffset + area) * 64)),
    dc: data.lowFrequencies.map(v => v.subarray(cellOffset, cellOffset + area))};
}
