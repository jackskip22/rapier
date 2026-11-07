// SPDX-License-Identifier: MIT
import {compileKernels, kernelModule} from './kernel-runtime.mjs';
import {ssimulacra2, ssimulacra2Reference} from './ssimulacra2.mjs';
import {compileFusedMetric} from './ssimulacra2-arithmetic.mjs';
import {s2Dimensions} from './ssimulacra2-input.mjs';
import {dct8Basis} from './photo-dct.mjs';
import {fault} from './fault.mjs';

export const prepareScorer = async () => { const ready = await compileKernels(); await compileFusedMetric(); return ready; };

let shared;
function instance() {
  if (!shared) {
    const memory = new WebAssembly.Memory({initial: 16, maximum: 32767});
    shared = {memory, k: new WebAssembly.Instance(kernelModule(), {env: {memory}}).exports};
  }
  return shared;
}

export function scorer(reference, width, height) {
  s2Dimensions(width, height);
  let cacheBytes = 0, w = Math.max(8, width), h = Math.max(8, height);
  for (let s = 0; s < 6; s++) {
    if (w < 8 || h < 8) break;
    if (s) { w = Math.ceil(w / 2); h = Math.ceil(h / 2); }
    cacheBytes += w * h * 36;
  }
  const held = ssimulacra2Reference({rgba: reference}, width, height, {cacheBytes: Math.min(64 * 1024 * 1024, cacheBytes)});
  return rgba => ssimulacra2(held, {rgba}, width, height).score;
}

const DEQUANT_BIAS = Float32Array.of(1 - .05465007330715401, 1 - .07005449891748593, 1 - .049935103337343655);

export function reconstruct(jpeg) {
  const {width: w, height: h, components, quantScale: qs, cfl, quantFieldBase: F = 1, quantFields: fields} = jpeg;
  s2Dimensions(w, h);
  const stride = components[0].stride, rows = components[0].rows, blocks = stride * rows, values = new Map(), which = new Uint8Array(blocks);
  for (let i = 0; i < blocks; i++) {
    const v = fields ? fields[i] : F;
    if (!values.has(v)) values.set(v, values.size);
    which[i] = values.get(v);
  }
  const steps = new Float32Array(192 * values.size);
  for (const [v, n] of values) for (let c = 0; c < 3; c++) for (let q = 0; q < 64; q++) steps[n * 192 + c * 64 + q] = components[c].quant[q] * (q ? F / v : 1) / qs;
  const tiles = cfl.x.length, factors = new Float32Array(2 * tiles);
  for (let t = 0; t < tiles; t++) { factors[2 * t] = 1 + cfl.x[t] / 84; factors[2 * t + 1] = 1 + cfl.b[t] / 84; }
  const sizes = [blocks * 64 * 3 * 2, blocks, steps.length * 4, factors.length * 4, 256, 12, w * h * 4];
  const at = []; let total = 0;
  for (const n of sizes) { at.push(total); if (!Number.isSafeInteger(n) || n < 0 || total + n > 0x7fff0000 - 70032)
      throw fault('JXL_MEMORY', 'Photo reconstruction exceeds its memory allowance.');
    total += Math.ceil(n / 16) * 16; }
  const {k, memory} = instance(), scratch = k.s2Scratch(total);
  if (!scratch) throw fault('JXL_MEMORY', 'Not enough memory for photo reconstruction.');
  const mem = memory.buffer, coeffs = new Int16Array(mem, scratch + at[0], blocks * 64 * 3);
  for (let c = 0; c < 3; c++) coeffs.set(components[c].coeffs.subarray(0, blocks * 64), c * blocks * 64);
  new Uint8Array(mem, scratch + at[1], blocks).set(which);
  new Float32Array(mem, scratch + at[2], steps.length).set(steps);
  new Float32Array(mem, scratch + at[3], factors.length).set(factors);
  new Float32Array(mem, scratch + at[4], 64).set(dct8Basis);
  new Float32Array(mem, scratch + at[5], 3).set(DEQUANT_BIAS);
  k.s2Reconstruct(w, h, stride, rows, scratch + at[0], scratch + at[1], scratch + at[2], scratch + at[3], cfl.width, scratch + at[4], scratch + at[5], scratch + at[6]);
  return new Uint8Array(memory.buffer, scratch + at[6], w * h * 4);
}
