// SPDX-License-Identifier: MIT
export function cosine(numerator, denominator) {
  let n = numerator % (denominator * 2);
  if (n > denominator) n -= denominator * 2;
  if (n < -denominator) n += denominator * 2;
  let sign = 1;
  if (n > denominator / 2) { n = denominator - n; sign = -1; }
  if (n < -denominator / 2) { n = -denominator - n; sign = -1; }
  const x = n * 3.141592653589793 / denominator, square = x * x;
  let term = 1, sum = 1;
  for (let i = 1; i < 15; i++) sum += term *= -square / ((2 * i - 1) * (2 * i));
  return sign * sum;
}

export function fillScaledDCTBasis(size, out, from = 0, to = size) {
  for (let k = from; k < to; k++) for (let x = 0; x < size; x++) out[k * size + x] =
    k ? 1.4142135623730951 * cosine((2 * x + 1) * k, 2 * size) / size : 1 / size;
  return out;
}

const scaledBases = /* @__PURE__ */ new Map();
export function scaledBasis(n) {
  let b = scaledBases.get(n);
  if (!b) {
    b = fillScaledDCTBasis(n, new Float64Array(n * n));
    for (let i = 0; i < b.length; i++) b[i] *= n;
    scaledBases.set(n, b);
  }
  return b;
}
