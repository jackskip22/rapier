// SPDX-License-Identifier: AGPL-3.0-only
// The paper's tooth: three octaves of value noise, each [cell size in paper units, weight, seed
// mask]. `paper.mjs` samples them for wet media (toothAt); the pressed letter (text.mjs) lays the
// same three scales into its SVG filter, so type pressed into the sheet shows the sheet's own grain.
export const PAPER_OCTAVES = Object.freeze([Object.freeze([2, .55, 0]), Object.freeze([5, .3, 2871]), Object.freeze([13, .15, 8191])]);
