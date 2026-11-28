// SPDX-License-Identifier: MIT

export const blockTables = (tables, cfl) => ({tables, cfl, next: tables + 2048, bases: new Map(), maps: new Map()});

export function prepareLF(kernels, at, lengths, {dcWidth, dcHeight, hshift, vshift, cflBlock, correlation, steps, smooth}) {
  const planes = from => [0, 1, 2].map(c => new Float32Array(kernels.buffer, at[from + c], lengths[c]));
  kernels.i32.set([...at, ...dcWidth, ...dcHeight, ...hshift, ...vshift], kernels.args / 4);
  kernels.lfPrepare(kernels.args, cflBlock ? 1 : 0, correlation.baseX + (correlation.lfX - 128) / correlation.factor,
    correlation.baseB + (correlation.lfB - 128) / correlation.factor, smooth ? 1 : 0, ...steps);
  return smooth ? planes(6) : planes(0);
}

export const epfSigma = (epf, globalScale, multiplier, sharp) =>
  (epf.quantMul ?? .46) * 65536 / globalScale / multiplier * (epf.sharpLut || [0, 1 / 7, 2 / 7, 3 / 7, 4 / 7, 5 / 7, 6 / 7, 1])[sharp];

export function xybKernelConstants(raw, opsinBiases, intensityTarget) {
  const f = Math.fround, bias = opsinBiases.map(f), root = bias.map(v => f(Math.cbrt(v))), scale = f(255 / intensityTarget);
  return {bias, root, m: raw.map(v => f(v * scale))};
}
