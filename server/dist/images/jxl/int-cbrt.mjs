// SPDX-License-Identifier: MIT
const Q20 = 1 << 20, BIAS = 0.0037930732552754493;
export const IS_BIAS = Math.round(BIAS * Q20);

const R = (s, k) => Math.floor((s + 2 ** (k - 1)) / 2 ** k);
const cubeSign = (t, v) => {
  const n8 = v * 8796093022208, c = t * t * t, d = c - n8;
  if (Math.abs(d) > Math.abs(c) * 2 ** -50) return d > 0 ? 1 : -1;
  const e = BigInt(t) ** 3n - 8n * BigInt(v) * (1n << 40n);
  return e > 0n ? 1 : e < 0n ? -1 : 0;
};
const exactRoot = v => {
  let r = Math.round(Math.cbrt(v / Q20) * Q20);
  for (;;) { if (v && cubeSign(2 * r - 1, v) > 0) r--; else if (cubeSign(2 * r + 1, v) <= 0) r++; else return r; }
};
let roots;
export const cbrtTables = () => roots ||= {
  lo: Int32Array.from({length: 1 << 16}, (_, v) => exactRoot(v)),
  hi: Int32Array.from({length: ((Q20 + IS_BIAS + 2) >> 4) + 2}, (_, i) => exactRoot(i * 16)),
};
export const BLACK = /* @__PURE__ */ (() => IS_BIAS < 1 << 16 ? exactRoot(IS_BIAS) : exactRoot(R(IS_BIAS, 4) * 16))();
