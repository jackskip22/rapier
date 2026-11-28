// SPDX-License-Identifier: MIT
import {kernelHooks, ensured, missing} from './kernel-hooks.mjs';

export function colourTransform(type, channels) {
  return {type, fill(planes, rgba, stride, x0, y0, w, h) {
    (kernelHooks.rct ?? ensured().rct ?? missing())(rgba, stride, x0, y0, w, h, type, channels, planes);
  }};
}

export function transformKeys(type) {
  const permutation = Math.floor(type / 7), custom = type % 7;
  const a = permutation % 3, b = (permutation + 1 + Math.floor(permutation / 3)) % 3;
  const c = (permutation + 2 - Math.floor(permutation / 3)) % 3;
  if (custom === 6) return [15 + b, 3 + 3 * a + c, 12 + b];
  return [a, (custom >> 1) === 1 ? 3 + 3 * b + a : (custom >> 1) === 2 ? 12 + b : b,
    custom & 1 ? 3 + 3 * c + a : c];
}
