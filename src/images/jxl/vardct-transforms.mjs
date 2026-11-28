// SPDX-License-Identifier: MIT
export const NAMES = ['dct8', 'identity', 'dct2', 'dct4', 'dct16', 'dct32', 'dct16x8', 'dct8x16',
  'dct32x8', 'dct8x32', 'dct32x16', 'dct16x32', 'dct4x8', 'dct8x4', 'afv0', 'afv1', 'afv2', 'afv3',
  'dct64', 'dct64x32', 'dct32x64', 'dct128', 'dct128x64', 'dct64x128', 'dct256', 'dct256x128', 'dct128x256'];
export const WIDTHS = [1, 1, 1, 1, 2, 4, 1, 2, 1, 4, 2, 4, 1, 1, 1, 1, 1, 1, 8, 4, 8, 16, 8, 16, 32, 16, 32];
export const HEIGHTS = [1, 1, 1, 1, 2, 4, 2, 1, 4, 1, 4, 2, 1, 1, 1, 1, 1, 1, 8, 8, 4, 16, 16, 8, 32, 32, 16];
export const TABLES = [0, 1, 2, 3, 4, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 10, 10, 11, 12, 12, 13, 14, 14, 15, 16, 16];
export const TRANSFORMS = /* @__PURE__ */ Object.freeze(NAMES.map((name, id) => /* @__PURE__ */ Object.freeze({name, id, width: WIDTHS[id] * 8,
  height: HEIGHTS[id] * 8, table: TABLES[id]})));
