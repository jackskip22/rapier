// SPDX-License-Identifier: BSD-3-Clause
/*!
 * Copyright (c) the JPEG XL Project Authors.
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 
 * 3. Neither the name of the copyright holder nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
// The shared SSIMULACRA2 arithmetic, translated from this repository's AS1 implementation.
// No fast math or implicit contraction. All fused binary32 steps are explicit in metric_fma.
// No static data or allocator: the caller supplies tables, scratch, reference caches and outputs.
#include <stdint.h>
#include <stddef.h>
#if defined(__wasm__)
#define EXPORT(name) __attribute__((export_name(name)))
#else
#define EXPORT(name)
#endif

#include "metric-float.h"
#include <wasm_simd128.h>
// S2_FUSED builds the same arithmetic with relaxed SIMD's madd, a true fused multiply-add where the engine lowers it to
// one (x86 FMA3, ARM64): exactly metric_fma. Every madd is inside s2MetricScale or s2MetricBand, each of which first checks a madd whose
// unfused result differs and reports a failure instead of computing; the caller then uses the exact build.
#ifdef S2_FUSED
#define FUSED_INLINE __attribute__((always_inline)) inline
#define EXACT_EXPORT(name)
// The fused build's two exports share one copy of the rows (the madd probe is its first step), not one inlined copy each.
#define ROWS_INLINE __attribute__((noinline))
#else
#define FUSED_INLINE
#define EXACT_EXPORT(name) EXPORT(name)
#define ROWS_INLINE __attribute__((noinline))
#endif

EXACT_EXPORT("s2MetricFma") float s2_metric_fma(float a, float b, float c) { return metric_fma(a, b, c); }

// Four binary32 lanes of metric_fma. The double product of two binary32 values is exact, and the double sum rounds to
// binary32 as one fused rounding would, except on a binary32 midpoint (low 29 bits 0x10000000, about one sum in 200
// here) or outside binary32's normal range (zero included). A midpoint sends its four lanes to metric_fma at once;
// the range is recorded in a check, and a block whose check is set is computed again with metric_fma, so every result
// is metric_fma's.
typedef struct { v128_t low, high; } fma_check;
static inline void check_start(fma_check *k) { k->low = wasm_i32x4_splat(0x7fffffff); k->high = wasm_i32x4_splat(0); }
#ifdef S2_FUSED
static inline int check_rare(const fma_check *k) { (void)k; return 0; }
#else
static inline int check_rare(const fma_check *k) {
  return wasm_v128_any_true(wasm_v128_or(wasm_i32x4_lt(k->low, wasm_i32x4_splat(897 << 20)),
    wasm_i32x4_gt(k->high, wasm_i32x4_splat(1150 << 20))));
}
#endif
// A binary32 midpoint whose double sum is exact (its TwoSum error zero, as every midpoint in the Kodak photos) is a
// true tie, and the double's round-to-even is metric_fma's; any other midpoint lane goes to metric_fma.
static inline v128_t midpoint_mask(v128_t low, v128_t high) {
  const v128_t bits = wasm_i32x4_shuffle(low, high, 0, 2, 4, 6);
  return wasm_i32x4_eq(wasm_v128_and(bits, wasm_i32x4_splat(0x1fffffff)), wasm_i32x4_splat(0x10000000));
}
static inline v128_t two_sum_error(v128_t product, v128_t c, v128_t sum) {
  const v128_t z = wasm_f64x2_sub(sum, product);
  return wasm_f64x2_add(wasm_f64x2_sub(product, wasm_f64x2_sub(sum, z)), wasm_f64x2_sub(c, z));
}
static __attribute__((noinline)) v128_t fma4_tie(v128_t a, v128_t b, v128_t c) {
  const v128_t pl = wasm_f64x2_mul(wasm_f64x2_promote_low_f32x4(a), wasm_f64x2_promote_low_f32x4(b));
  const v128_t ph = wasm_f64x2_mul(wasm_f64x2_promote_low_f32x4(wasm_i64x2_shuffle(a, a, 1, 0)),
    wasm_f64x2_promote_low_f32x4(wasm_i64x2_shuffle(b, b, 1, 0)));
  const v128_t cl = wasm_f64x2_promote_low_f32x4(c), ch = wasm_f64x2_promote_low_f32x4(wasm_i64x2_shuffle(c, c, 1, 0));
  const v128_t sl = wasm_f64x2_add(pl, cl), sh = wasm_f64x2_add(ph, ch);
  const v128_t inexact = wasm_i32x4_shuffle(wasm_f64x2_ne(two_sum_error(pl, cl, sl), wasm_f64x2_splat(0)),
    wasm_f64x2_ne(two_sum_error(ph, ch, sh), wasm_f64x2_splat(0)), 0, 2, 4, 6);
  if (!wasm_v128_any_true(wasm_v128_and(inexact, midpoint_mask(sl, sh))))
    return wasm_i64x2_shuffle(wasm_f32x4_demote_f64x2_zero(sl), wasm_f32x4_demote_f64x2_zero(sh), 0, 2);
  float x[4], y[4], z[4];
  wasm_v128_store(x, a); wasm_v128_store(y, b); wasm_v128_store(z, c);
  for (int i = 0; i < 4; ++i) x[i] = metric_fma(x[i], y[i], z[i]);
  return wasm_v128_load(x);
}
static inline v128_t rounded4(v128_t low, v128_t high, fma_check *k, int *midpoint) {
  const v128_t top = wasm_i32x4_shuffle(low, high, 1, 3, 5, 7);
  const v128_t exponent = wasm_v128_and(top, wasm_i32x4_splat(0x7ff00000));
  k->low = wasm_i32x4_min(k->low, exponent); k->high = wasm_i32x4_max(k->high, exponent);
  *midpoint = wasm_v128_any_true(midpoint_mask(low, high));
  return wasm_i64x2_shuffle(wasm_f32x4_demote_f64x2_zero(low), wasm_f32x4_demote_f64x2_zero(high), 0, 2);
}
static inline v128_t high_half(v128_t v) { return wasm_f64x2_promote_low_f32x4(wasm_i64x2_shuffle(v, v, 1, 0)); }
// metric_fma of three vectors.
static inline v128_t fma4v(v128_t a, v128_t b, v128_t c, fma_check *k) {
#ifdef S2_FUSED
  (void)k; return wasm_f32x4_relaxed_madd(a, b, c);
#endif
  int midpoint;
  const v128_t r = rounded4(wasm_f64x2_add(wasm_f64x2_mul(wasm_f64x2_promote_low_f32x4(a), wasm_f64x2_promote_low_f32x4(b)),
    wasm_f64x2_promote_low_f32x4(c)), wasm_f64x2_add(wasm_f64x2_mul(high_half(a), high_half(b)), high_half(c)), k, &midpoint);
  return midpoint ? fma4_tie(a, b, c) : r;
}
// A binary32 constant and its widened copy.
typedef struct { float f; v128_t d; } constant;
static inline constant wide(float a) { constant k = {a, wasm_f64x2_splat(a)}; return k; }
// metric_fma of a constant and two vectors.
static inline v128_t fma4(constant a, v128_t b, v128_t c, fma_check *k) {
#ifdef S2_FUSED
  (void)k; return wasm_f32x4_relaxed_madd(wasm_f32x4_splat(a.f), b, c);
#endif
  int midpoint;
  const v128_t r = rounded4(wasm_f64x2_add(wasm_f64x2_mul(a.d, wasm_f64x2_promote_low_f32x4(b)), wasm_f64x2_promote_low_f32x4(c)),
    wasm_f64x2_add(wasm_f64x2_mul(a.d, high_half(b)), high_half(c)), k, &midpoint);
  return midpoint ? fma4_tie(wasm_f32x4_splat(a.f), b, c) : r;
}


EXACT_EXPORT("s2MetricInit") void s2_metric_init(float *linear) {
  for (int i = 0; i < 256; ++i) {
    const float x = i * (float)(1.0 / 255);
    if (x <= .04045f) { linear[i] = x * (float)(1.0 / 12.92); continue; }
    float p = .8210152774f, q = .006521209011f;
    p = metric_fma(p, x, .7961564959f); q = metric_fma(q, x, -.05512498495f);
    p = metric_fma(p, x, .1624820318f); q = metric_fma(q, x, .4987528350f);
    p = metric_fma(p, x, .01043637593f); q = metric_fma(q, x, 1.076976492f);
    p = metric_fma(p, x, .0002200248328f); q = metric_fma(q, x, .2631846970f);
    linear[i] = p / q;
  }
}
static inline float cube_root_bias(float x) {
  union {float f; uint32_t u;} start = {.f = x};
  start.u = start.u == 0 ? 0 : 0x54800000u - (start.u >> 23) * 0x002aaaaau;
  float r = start.f;
  const float third = (float)(1.0 / 3), x3 = third * x;
  for (int i = 0; i < 3; ++i) {
    const float r2 = r * r;
    r = metric_fma(-x3, r2 * r2, (float)(4.0 / 3) * r);
  }
  float r2 = r * r;
  r = metric_fma(third, metric_fma(-x, r2 * r2, r), r);
  r2 = r * r;
  return metric_fma(r2, x, -0.15595419704914093f);
}
static inline float positive_value(float x) { return x <= 0 ? 0 : x; }
static inline void positive(float r, float g, float b, float *out) {
  const float bias = .0037930732552754493f;
  const float l = cube_root_bias(positive_value(metric_fma(.30f, r, metric_fma(.622f, g, metric_fma(.078f, b, bias)))));
  const float m = cube_root_bias(positive_value(metric_fma(.23f, r, metric_fma(.692f, g, metric_fma(.078f, b, bias)))));
  const float x = .5f * (l - m), y = .5f * (l + m);
  const float s = cube_root_bias(positive_value(metric_fma(.24342268924547819f, r,
    metric_fma(.20476744424496821f, g, metric_fma(.5518098665095536f, b, bias)))));
  out[0] = x * 14.0f + .42f; out[1] = y + .01f; out[2] = (s - y) + .55f;
}
// cube_root_bias and positive for four pixels. A check set by any of their sums sends the pixels to positive.
static inline v128_t cube_root_bias4(v128_t x, fma_check *k) {
  const v128_t u = x;
  v128_t r = wasm_v128_andnot(wasm_i32x4_sub(wasm_i32x4_splat(0x54800000), wasm_i32x4_mul(wasm_u32x4_shr(u, 23),
    wasm_i32x4_splat(0x002aaaaa))), wasm_i32x4_eq(u, wasm_i32x4_splat(0)));
  const v128_t third = wasm_f32x4_splat((float)(1.0 / 3)), x3 = wasm_f32x4_mul(third, x);
  const v128_t nx3 = wasm_f32x4_neg(x3), four = wasm_f32x4_splat((float)(4.0 / 3));
  for (int i = 0; i < 3; ++i) {
    const v128_t r2 = wasm_f32x4_mul(r, r);
    r = fma4v(nx3, wasm_f32x4_mul(r2, r2), wasm_f32x4_mul(four, r), k);
  }
  v128_t r2 = wasm_f32x4_mul(r, r);
  r = fma4(wide((float)(1.0 / 3)), fma4v(wasm_f32x4_neg(x), wasm_f32x4_mul(r2, r2), r, k), r, k);
  r2 = wasm_f32x4_mul(r, r);
  return fma4v(r2, x, wasm_f32x4_splat(-0.15595419704914093f), k);
}
static inline v128_t positive_value4(v128_t x) { return wasm_v128_andnot(x, wasm_f32x4_le(x, wasm_f32x4_splat(0))); }
static inline void positive4(v128_t r, v128_t g, v128_t b, v128_t *out, fma_check *k) {
  const v128_t bias = wasm_f32x4_splat(.0037930732552754493f);
  const v128_t l = cube_root_bias4(positive_value4(fma4(wide(.30f), r, fma4(wide(.622f), g, fma4(wide(.078f), b, bias, k), k), k)), k);
  const v128_t m = cube_root_bias4(positive_value4(fma4(wide(.23f), r, fma4(wide(.692f), g, fma4(wide(.078f), b, bias, k), k), k)), k);
  const v128_t half = wasm_f32x4_splat(.5f);
  const v128_t x = wasm_f32x4_mul(half, wasm_f32x4_sub(l, m)), y = wasm_f32x4_mul(half, wasm_f32x4_add(l, m));
  const v128_t s = cube_root_bias4(positive_value4(fma4(wide(.24342268924547819f), r,
    fma4(wide(.20476744424496821f), g, fma4(wide(.5518098665095536f), b, bias, k), k), k)), k);
  out[0] = wasm_f32x4_add(wasm_f32x4_mul(x, wasm_f32x4_splat(14.0f)), wasm_f32x4_splat(.42f));
  out[1] = wasm_f32x4_add(y, wasm_f32x4_splat(.01f));
  out[2] = wasm_f32x4_add(wasm_f32x4_sub(s, y), wasm_f32x4_splat(.55f));
}
static inline float sample(const void *input, int kind, int i, int channel, int pixels, const float *linear) {
  return kind == 0 ? linear[((const uint8_t *)input)[i * 4 + channel]] : ((const float *)input)[channel * pixels + i];
}
// Byte pictures keep a table of converted colors; four pixels with any new color are converted together.
static FUSED_INLINE void positive_row(const void *input, int kind, int y, int w, int h, float **out, int at,
                         const float *linear, int32_t *keys, float *values) {
  const int pixels = w * h;
  int x = 0;
  for (; x + 4 <= w; x += 4) {
    const int i = y * w + x;
    uint32_t key[4], slot[4];
#ifdef S2_FUSED
    // Converting four pixels costs less than looking up their colors.
    int fresh = 1;
#else
    int fresh = kind != 0;
#endif
    float rgb[3][4];
    for (int j = 0; j < 4; ++j) {
      if (kind == 0) {
        const uint8_t *rgba = (const uint8_t *)input + (i + j) * 4;
        key[j] = ((uint32_t)rgba[0] << 16) | ((uint32_t)rgba[1] << 8) | rgba[2];
        slot[j] = (key[j] * 0x9e3779b1u) >> 15;
#ifndef S2_FUSED
        if ((uint32_t)keys[slot[j]] != key[j]) fresh = 1;
#endif
        for (int c = 0; c < 3; ++c) rgb[c][j] = linear[rgba[c]];
      } else for (int c = 0; c < 3; ++c) rgb[c][j] = ((const float *)input)[c * pixels + i + j];
    }
    if (!fresh) {
      for (int j = 0; j < 4; ++j) for (int c = 0; c < 3; ++c) out[c][at + x + j] = values[slot[j] * 3 + c];
      continue;
    }
    fma_check k; check_start(&k);
    v128_t v[3];
    positive4(wasm_v128_load(rgb[0]), wasm_v128_load(rgb[1]), wasm_v128_load(rgb[2]), v, &k);
    float result[3][4];
    if (check_rare(&k)) for (int j = 0; j < 4; ++j) {
      float one[3]; positive(rgb[0][j], rgb[1][j], rgb[2][j], one);
      for (int c = 0; c < 3; ++c) result[c][j] = one[c];
    } else for (int c = 0; c < 3; ++c) wasm_v128_store(result[c], v[c]);
    for (int j = 0; j < 4; ++j) {
      for (int c = 0; c < 3; ++c) out[c][at + x + j] = result[c][j];
#ifndef S2_FUSED
      if (kind == 0) {
        for (int c = 0; c < 3; ++c) values[slot[j] * 3 + c] = result[c][j];
        keys[slot[j]] = (int32_t)key[j];
      }
#endif
    }
  }
  for (; x < w; ++x) {
    float value[3]; const float *v = value; const int i = y * w + x;
    if (kind == 0) {
      const uint8_t *rgba = (const uint8_t *)input + i * 4;
      const uint32_t key = ((uint32_t)rgba[0] << 16) | ((uint32_t)rgba[1] << 8) | rgba[2];
      const uint32_t slot = (key * 0x9e3779b1u) >> 15;
      v = values + slot * 3;
      if ((uint32_t)keys[slot] != key) {
        positive(linear[rgba[0]], linear[rgba[1]], linear[rgba[2]], values + slot * 3);
        keys[slot] = (int32_t)key;
      }
    } else {
      const float *p = input;
      positive(p[i], p[pixels + i], p[2 * pixels + i], value);
    }
    out[0][at + x] = v[0]; out[1][at + x] = v[1]; out[2][at + x] = v[2];
  }
}

// Planar binary32 output. Four taps are rounded after each left-associated addition, including repeated edges.
EXACT_EXPORT("s2MetricDown") void s2_metric_down(int width, int height, const void *input, int kind,
                                          const float *linear, float *output) {
  const int w = (width + 1) >> 1, h = (height + 1) >> 1, pixels = width * height;
  for (int c = 0; c < 3; ++c) for (int y = 0; y < h; ++y) {
    const int row0 = 2 * y * width, row1 = (2 * y + 1 < height ? 2 * y + 1 : height - 1) * width;
    for (int x = 0; x < w; ++x) {
      const int x0 = 2 * x, x1 = x0 + 1 < width ? x0 + 1 : width - 1;
      const float a = sample(input, kind, row0 + x0, c, pixels, linear);
      const float b = sample(input, kind, row0 + x1, c, pixels, linear);
      const float d = sample(input, kind, row1 + x0, c, pixels, linear);
      const float e = sample(input, kind, row1 + x1, c, pixels, linear);
      output[(c * h + y) * w + x] = ((a + b) + d + e) * .25f;
    }
  }
}

// One row of the recursive Gaussian with metric_fma, lane `lane` of four interleaved rows: the arithmetic every lane of
// blur4 reproduces. g: n2[3], d1[3], then input[4], previous[4], previous2[4] for each recurrence component. Four taps
// are rounded after each left-associated addition, including repeated edges.
static __attribute__((noinline)) void blur_lane(const float *in, float *out, int count, const float *g, int lane) {
  float previous[3], previous2[3], next[12], sums[4];
  for (int i = 0; i < 3; ++i) previous[i] = previous2[i] = 0;
#define IN(n) in[4 * (n) + lane]
  int n = -4;
  for (; n < (count < 8 ? count : 8); ++n) {
    const float sum = (n - 6 >= 0 ? IN(n - 6) : 0) + (n + 4 < count ? IN(n + 4) : 0);
    for (int i = 0; i < 3; ++i) {
      const float *p = g + 6 + i * 12;
      next[i] = metric_fma(p[4], previous[i], -previous2[i] + sum * p[0]);
    }
    if (n >= 0) out[4 * n + lane] = next[0] + (next[1] + next[2]);
    for (int i = 0; i < 3; ++i) { previous2[i] = previous[i]; previous[i] = next[i]; }
  }
  for (; n < count - 7; n += 4) {
    for (int l = 0; l < 4; ++l) sums[l] = IN(n + l - 6) + IN(n + l + 4);
    for (int i = 0; i < 3; ++i) {
      const float *p = g + 6 + i * 12;
      for (int l = 0; l < 4; ++l) {
        float v = sums[0] * p[l];
        for (int j = 1; j < 4; ++j) v = l >= j ? metric_fma(p[l - j], sums[j], v) : 0.0f * sums[j] + v;
        next[i * 4 + l] = metric_fma(p[4 + l], previous[i], metric_fma(p[8 + l], previous2[i], v));
      }
    }
    for (int l = 0; l < 4; ++l) out[4 * (n + l) + lane] = next[l] + (next[4 + l] + next[8 + l]);
    for (int i = 0; i < 3; ++i) { previous2[i] = next[i * 4 + 2]; previous[i] = next[i * 4 + 3]; }
  }
  for (; n < count; ++n) {
    const float sum = (n - 6 >= 0 ? IN(n - 6) : 0) + (n + 4 < count ? IN(n + 4) : 0);
    for (int i = 0; i < 3; ++i) {
      const float *p = g + 6 + i * 12;
      next[i] = metric_fma(p[4], previous[i], -previous2[i] + sum * p[0]);
    }
    out[4 * n + lane] = next[0] + (next[1] + next[2]);
    for (int i = 0; i < 3; ++i) { previous2[i] = previous[i]; previous[i] = next[i]; }
  }
#undef IN
}
// Four rows' recursive Gaussian at once: lane r of each vector is row r, doing blur_lane's arithmetic. A row with a
// rare sum anywhere is computed again by blur_lane.
static FUSED_INLINE void blur4(const float *in, float *out, int count, const float *g) {
  v128_t previous[3], previous2[3], next[3][4], sums[4];
  constant p[3][12];
  const v128_t zero = wasm_f32x4_splat(0);
  fma_check k; check_start(&k);
  int unit[3];
  for (int i = 0; i < 3; ++i) {
    previous[i] = previous2[i] = zero;
    for (int j = 0; j < 12; ++j) p[i][j] = wide(g[6 + i * 12 + j]);
    unit[i] = g[6 + i * 12 + 8] == -1.0f;
  }
  int n = -4;
  for (; n < (count < 8 ? count : 8); ++n) {
    const v128_t sum = wasm_f32x4_add(n - 6 >= 0 ? wasm_v128_load(in + 4 * (n - 6)) : zero,
      n + 4 < count ? wasm_v128_load(in + 4 * (n + 4)) : zero);
    for (int i = 0; i < 3; ++i)
      next[i][0] = fma4(p[i][4], previous[i], wasm_f32x4_add(wasm_f32x4_neg(previous2[i]),
        wasm_f32x4_mul(sum, wasm_f32x4_splat(g[6 + i * 12]))), &k);
    if (n >= 0) wasm_v128_store(out + 4 * n, wasm_f32x4_add(next[0][0], wasm_f32x4_add(next[1][0], next[2][0])));
    for (int i = 0; i < 3; ++i) { previous2[i] = previous[i]; previous[i] = next[i][0]; }
  }
  for (; n < count - 7; n += 4) {
    for (int lane = 0; lane < 4; ++lane)
      sums[lane] = wasm_f32x4_add(wasm_v128_load(in + 4 * (n + lane - 6)), wasm_v128_load(in + 4 * (n + lane + 4)));
    for (int i = 0; i < 3; ++i) for (int lane = 0; lane < 4; ++lane) {
      v128_t v = wasm_f32x4_mul(sums[0], wasm_f32x4_splat(g[6 + i * 12 + lane]));
      for (int j = 1; j < 4; ++j) v = lane >= j ? fma4(p[i][lane - j], sums[j], v, &k)
        : wasm_f32x4_add(wasm_f32x4_mul(zero, sums[j]), v);
      // metric_fma(-1, b, c) is the binary32 difference c - b: one rounding of the same exact value.
      const v128_t inner = lane == 0 && unit[i] ? wasm_f32x4_sub(v, previous2[i]) : fma4(p[i][8 + lane], previous2[i], v, &k);
      next[i][lane] = fma4(p[i][4 + lane], previous[i], inner, &k);
    }
    for (int lane = 0; lane < 4; ++lane)
      wasm_v128_store(out + 4 * (n + lane), wasm_f32x4_add(next[0][lane], wasm_f32x4_add(next[1][lane], next[2][lane])));
    for (int i = 0; i < 3; ++i) { previous2[i] = next[i][2]; previous[i] = next[i][3]; }
  }
  for (; n < count; ++n) {
    const v128_t sum = wasm_f32x4_add(n - 6 >= 0 ? wasm_v128_load(in + 4 * (n - 6)) : zero,
      n + 4 < count ? wasm_v128_load(in + 4 * (n + 4)) : zero);
    for (int i = 0; i < 3; ++i)
      next[i][0] = fma4(p[i][4], previous[i], wasm_f32x4_add(wasm_f32x4_neg(previous2[i]),
        wasm_f32x4_mul(sum, wasm_f32x4_splat(g[6 + i * 12]))), &k);
    wasm_v128_store(out + 4 * n, wasm_f32x4_add(next[0][0], wasm_f32x4_add(next[1][0], next[2][0])));
    for (int i = 0; i < 3; ++i) { previous2[i] = previous[i]; previous[i] = next[i][0]; }
  }
  if (check_rare(&k)) for (int lane = 0; lane < 4; ++lane) blur_lane(in, out, count, g, lane);
}
// One line kind of four rows (fewer at the bottom: the spare lanes repeat the last row and are not written back):
// the line is a, a*a or a*b, interleaved into in, blurred into out and spread back to the rows. Four columns of the
// four rows move as one 4x4 transpose.
static inline void transpose4(v128_t *v) {
  const v128_t t0 = wasm_i32x4_shuffle(v[0], v[1], 0, 4, 1, 5), t1 = wasm_i32x4_shuffle(v[0], v[1], 2, 6, 3, 7);
  const v128_t t2 = wasm_i32x4_shuffle(v[2], v[3], 0, 4, 1, 5), t3 = wasm_i32x4_shuffle(v[2], v[3], 2, 6, 3, 7);
  v[0] = wasm_i64x2_shuffle(t0, t2, 0, 2); v[1] = wasm_i64x2_shuffle(t0, t2, 1, 3);
  v[2] = wasm_i64x2_shuffle(t1, t3, 0, 2); v[3] = wasm_i64x2_shuffle(t1, t3, 1, 3);
}
static FUSED_INLINE void blur_rows(const float *const *a, const float *const *b, int square, float *const *outputs, int rows,
                      int w, float *in, float *out, const float *g) {
  int x = 0;
  for (; x + 4 <= w; x += 4) {
    v128_t v[4];
    for (int r = 0; r < 4; ++r) {
      const int k = r < rows ? r : rows - 1;
      const v128_t u = wasm_v128_load(a[k] + x);
      v[r] = b ? wasm_f32x4_mul(u, wasm_v128_load(b[k] + x)) : square ? wasm_f32x4_mul(u, u) : u;
    }
    transpose4(v);
    for (int j = 0; j < 4; ++j) wasm_v128_store(in + 4 * (x + j), v[j]);
  }
  for (; x < w; ++x) for (int r = 0; r < 4; ++r) {
    const int k = r < rows ? r : rows - 1;
    const float u = a[k][x];
    in[4 * x + r] = b ? u * b[k][x] : square ? u * u : u;
  }
  blur4(in, out, w, g);
  x = 0;
  for (; x + 4 <= w; x += 4) {
    v128_t v[4];
    for (int j = 0; j < 4; ++j) v[j] = wasm_v128_load(out + 4 * (x + j));
    transpose4(v);
    for (int r = 0; r < rows; ++r) wasm_v128_store(outputs[r] + x, v[r]);
  }
  for (; x < w; ++x) for (int r = 0; r < rows; ++r) outputs[r][x] = out[4 * x + r];
}
// The vertical recurrence at one column with metric_fma. state holds six planes of w floats.
static __attribute__((noinline)) void vertical_column(const float *src, float *s0, float *s1, float *s2, float *s3, float *s4, float *s5,
                                   float *out, int x, int lo, int ro, int emit, const float *g) {
  const float sum = (lo >= 0 ? src[lo + x] : 0) + (ro >= 0 ? src[ro + x] : 0);
  const float o1 = metric_fma(g[0], sum, metric_fma(-g[3], s0[x], -s1[x]));
  const float o3 = metric_fma(g[1], sum, metric_fma(-g[4], s2[x], -s3[x]));
  const float o5 = metric_fma(g[2], sum, metric_fma(-g[5], s4[x], -s5[x]));
  if (emit) out[x] = o1 + (o3 + o5);
  s1[x] = s0[x]; s0[x] = o1; s3[x] = s2[x]; s2[x] = o3; s5[x] = s4[x]; s4[x] = o5;
}
// Four columns at a time; four columns with a rare sum are computed again by vertical_column.
static FUSED_INLINE void vertical_row(const float *src, float *state, float *out, int w, int lo, int ro, int emit, const float *g) {
  float *s0 = state, *s1 = state + w, *s2 = state + 2 * w, *s3 = state + 3 * w, *s4 = state + 4 * w, *s5 = state + 5 * w;
  const v128_t zero = wasm_f32x4_splat(0);
  const constant g0 = wide(g[0]), g1 = wide(g[1]), g2 = wide(g[2]), d0 = wide(-g[3]), d1 = wide(-g[4]), d2 = wide(-g[5]);
  int x = 0;
  for (; x + 4 <= w; x += 4) {
    fma_check k; check_start(&k);
    const v128_t sum = wasm_f32x4_add(lo >= 0 ? wasm_v128_load(src + lo + x) : zero, ro >= 0 ? wasm_v128_load(src + ro + x) : zero);
    const v128_t a0 = wasm_v128_load(s0 + x), a2 = wasm_v128_load(s2 + x), a4 = wasm_v128_load(s4 + x);
    const v128_t o1 = fma4(g0, sum, fma4(d0, a0, wasm_f32x4_neg(wasm_v128_load(s1 + x)), &k), &k);
    const v128_t o3 = fma4(g1, sum, fma4(d1, a2, wasm_f32x4_neg(wasm_v128_load(s3 + x)), &k), &k);
    const v128_t o5 = fma4(g2, sum, fma4(d2, a4, wasm_f32x4_neg(wasm_v128_load(s5 + x)), &k), &k);
    if (check_rare(&k)) {
      for (int c = x; c < x + 4; ++c) vertical_column(src, s0, s1, s2, s3, s4, s5, out, c, lo, ro, emit, g);
      continue;
    }
    if (emit) wasm_v128_store(out + x, wasm_f32x4_add(o1, wasm_f32x4_add(o3, o5)));
    wasm_v128_store(s1 + x, a0); wasm_v128_store(s0 + x, o1); wasm_v128_store(s3 + x, a2); wasm_v128_store(s2 + x, o3);
    wasm_v128_store(s5 + x, a4); wasm_v128_store(s4 + x, o5);
  }
  for (; x < w; ++x) vertical_column(src, s0, s1, s2, s3, s4, s5, out, x, lo, ro, emit, g);
}
static void row_sums(const float *p1, const float *p2, float **down, const float *cached,
                     int y, int w, int h, double *sums, double *terms, double *edge_terms) {
  const int pixels = w * h;
  double ss1 = sums[0], ss4 = sums[1], a1 = sums[2], a4 = sums[3], l1 = sums[4], l4 = sums[5];
  int x = 0;
  // Four pixels' maps at a time; the six sums still add one pixel at a time, in order.
  for (; x + 4 <= w; x += 4) {
    const v128_t m1 = wasm_v128_load(cached ? cached + pixels + y * w + x : down[0] + x);
    const v128_t v11 = wasm_v128_load(cached ? cached + 2 * pixels + y * w + x : down[2] + x);
    const v128_t m2 = wasm_v128_load(down[1] + x), q1 = wasm_v128_load(p1 + x), q2 = wasm_v128_load(p2 + x);
    const v128_t delta = wasm_f32x4_sub(m1, m2), small = wasm_f32x4_splat(.0009f);
    const v128_t num_m = wasm_f32x4_sub(wasm_f32x4_splat(1.0f), wasm_f32x4_mul(delta, delta));
    const v128_t num_s = wasm_f32x4_add(wasm_f32x4_mul(wasm_f32x4_splat(2.0f),
      wasm_f32x4_sub(wasm_v128_load(down[4] + x), wasm_f32x4_mul(m1, m2))), small);
    const v128_t den_s = wasm_f32x4_add(wasm_f32x4_add(wasm_f32x4_sub(v11, wasm_f32x4_mul(m1, m1)),
      wasm_f32x4_sub(wasm_v128_load(down[3] + x), wasm_f32x4_mul(m2, m2))), small);
    const v128_t ratio = wasm_f32x4_div(wasm_f32x4_mul(num_m, num_s), den_s);
    const v128_t q = wasm_f32x4_abs(wasm_f32x4_sub(q2, m2)), r = wasm_f32x4_abs(wasm_f32x4_sub(q1, m1));
    // Per pixel: e, e^4, the artifact a (dd above 0), a^4, the detail l (-dd above 0), l^4; each sum adds in pixel order.
    double terms6[6][4], dd[4];
    for (int half = 0; half < 2; ++half) {
      const v128_t one = wasm_f64x2_splat(1.0), zero = wasm_f64x2_splat(0);
      const v128_t ra = half ? wasm_i64x2_shuffle(ratio, ratio, 1, 0) : ratio;
      const v128_t qa = half ? wasm_i64x2_shuffle(q, q, 1, 0) : q, rr = half ? wasm_i64x2_shuffle(r, r, 1, 0) : r;
      const v128_t raw = wasm_f64x2_sub(one, wasm_f64x2_promote_low_f32x4(ra));
      const v128_t e = wasm_v128_andnot(raw, wasm_f64x2_le(raw, zero));
      const v128_t d = wasm_f64x2_sub(wasm_f64x2_div(wasm_f64x2_add(one, wasm_f64x2_promote_low_f32x4(qa)),
        wasm_f64x2_add(one, wasm_f64x2_promote_low_f32x4(rr))), one);
      const v128_t artifact = wasm_v128_andnot(d, wasm_f64x2_le(d, zero));
      const v128_t detail = wasm_v128_andnot(wasm_f64x2_neg(d), wasm_f64x2_ge(d, zero));
      const v128_t e2 = wasm_f64x2_mul(e, e), a2 = wasm_f64x2_mul(artifact, artifact), l2 = wasm_f64x2_mul(detail, detail);
      wasm_v128_store(terms6[0] + 2 * half, e); wasm_v128_store(terms6[1] + 2 * half, wasm_f64x2_mul(e2, e2));
      wasm_v128_store(terms6[2] + 2 * half, artifact); wasm_v128_store(terms6[3] + 2 * half, wasm_f64x2_mul(a2, a2));
      wasm_v128_store(terms6[4] + 2 * half, detail); wasm_v128_store(terms6[5] + 2 * half, wasm_f64x2_mul(l2, l2));
      wasm_v128_store(dd + 2 * half, d);
    }
    if (terms) for (int j = 0; j < 4; ++j) { terms[y * w + x + j] = terms6[0][j]; edge_terms[y * w + x + j] = dd[j]; }
    for (int j = 0; j < 4; ++j) {
      ss1 += terms6[0][j]; ss4 += terms6[1][j]; a1 += terms6[2][j]; a4 += terms6[3][j]; l1 += terms6[4][j]; l4 += terms6[5][j];
    }
  }
  for (; x < w; ++x) {
    const float m1 = cached ? cached[pixels + y * w + x] : down[0][x];
    const float v11 = cached ? cached[2 * pixels + y * w + x] : down[2][x];
    const float m2 = down[1][x], q1 = p1[x], q2 = p2[x], delta = m1 - m2;
    const float num_m = 1.0f - delta * delta;
    const float num_s = 2.0f * (down[4][x] - m1 * m2) + .0009f;
    const float den_s = ((v11 - m1 * m1) + (down[3][x] - m2 * m2)) + .0009f;
    const double raw = 1.0 - (float)((num_m * num_s) / den_s), e = raw <= 0 ? 0 : raw;
    const double dd = (1.0 + (double)__builtin_fabsf(q2 - m2)) / (1.0 + (double)__builtin_fabsf(q1 - m1)) - 1.0;
    if (terms) { terms[y * w + x] = e; edge_terms[y * w + x] = dd; }
    ss1 += e; const double e2 = e * e; ss4 += e2 * e2;
    const double artifact = dd <= 0 ? 0 : dd, detail = dd >= 0 ? 0 : -dd;
    a1 += artifact; const double a2 = artifact * artifact; a4 += a2 * a2;
    l1 += detail; const double l2 = detail * detail; l4 += l2 * l2;
  }
  sums[0] = ss1; sums[1] = ss4; sums[2] = a1; sums[3] = a4; sums[4] = l1; sums[5] = l4;
}

// mask selects channels. cache pointers hold p1/mu1/s11, each width*height floats: cached_mask denotes prepared input;
// any other nonnull cache receives freshly prepared reference values. At most one channel may request term planes.
// Rows are made four at a time into rings of RING rows. Scratch requirement in floats:
// ((needReference ? 48 : 0) + 56 + 23*activeBlurs) * width.
#define RING 16
// Whole scores and checkpointed scores take the same rows in the same order. Input contains [input_y,input_y+input_h)
// of the scale; scratch and sums are the continuation. The whole wrapper specializes these bounds at compile time.
static ROWS_INLINE int metric_scale_rows(int w, int h, int mask, const void *reference, int reference_kind,
  const void *distorted, int distorted_kind, const float *linear, const float *g,
  float *cache0, float *cache1, float *cache2, int cached_mask, float *scratch,
  double *terms, double *edge_terms, double *sums, int32_t *color_keys, float *color_values,
  int first, int end, int input_y, int input_h, int made) {
#ifdef S2_FUSED
  // g + 44 holds a madd probe (a, b, c and the fused result, four lanes each); g + 60 receives 1 if it fails.
  if (!wasm_i32x4_all_true(wasm_i32x4_eq(wasm_f32x4_relaxed_madd(wasm_v128_load(g + 44), wasm_v128_load(g + 48),
      wasm_v128_load(g + 52)), wasm_v128_load(g + 56)))) { *(int32_t *)(g + 60) = 1; return made; }
#endif
  const int ring = RING * w, pixels = w * h, make_reference = (mask & ~cached_mask) != 0;
  float *cache[3]; cache[0] = cache0; cache[1] = cache1; cache[2] = cache2;
  float *p1[3], *p2[3], *across[3][5], *state[3][5], *down[3][5];
  float *cursor = scratch;
  for (int c = 0; c < 3; ++c) { p1[c] = make_reference ? cursor : 0; if (make_reference) cursor += ring; }
  for (int c = 0; c < 3; ++c) { p2[c] = cursor; cursor += ring; }
  float *lanes_in = cursor; cursor += 4 * w;
  float *lanes_out = cursor; cursor += 4 * w;
  for (int c = 0; c < 3; ++c) for (int k = 0; k < 5; ++k) {
    const int active = (mask & (1 << c)) && (!(cached_mask & (1 << c)) || (k != 0 && k != 2));
    across[c][k] = active ? cursor : 0;
    if (active) {
      cursor += ring; state[c][k] = cursor; cursor += 6 * w; down[c][k] = cursor; cursor += w;
      if (first == -4) for (int x = 0; x < 6 * w; ++x) state[c][k][x] = 0;
    }
  }
  if (first == -4) for (int i = 0; i < 18; ++i) sums[i] = 0;
  for (int y = first; y < end; ++y) {
    while (made < h && made <= y + 4) {
      const int rows = h - made < 4 ? h - made : 4;
      for (int r = 0; r < rows; ++r) {
        const int at = ((made + r) % RING) * w;
        for (int side = make_reference ? 0 : 1; side < 2; ++side)
          positive_row(side ? distorted : reference, side ? distorted_kind : reference_kind, made + r - input_y, w, input_h, side ? p2 : p1, at,
            linear, color_keys, color_values);
      }
      for (int c = 0; c < 3; ++c) if (mask & (1 << c)) {
        const int held = cached_mask & (1 << c);
        const float *a[4], *b[4]; float *o[4];
        for (int r = 0; r < rows; ++r) {
          const int at = ((made + r) % RING) * w;
          a[r] = held ? cache[c] + (made + r) * w : p1[c] + at; b[r] = p2[c] + at;
        }
        if (!held && cache[c]) for (int r = 0; r < rows; ++r) for (int x = 0; x < w; ++x) cache[c][(made + r) * w + x] = a[r][x];
        // The five lines: mu1 (a), mu2 (b), sigma11 (a*a), sigma22 (b*b), sigma12 (a*b); a held channel has mu1, sigma11.
        for (int k = 0; k < 5; ++k) if (across[c][k]) {
          for (int r = 0; r < rows; ++r) o[r] = across[c][k] + ((made + r) % RING) * w;
          blur_rows(k == 1 || k == 3 ? b : a, k == 4 ? b : 0, k == 2 || k == 3, o, rows, w, lanes_in, lanes_out, g);
        }
      }
      made += rows;
    }
    const int left = y - 6, right = y + 4;
    const int lo = left >= 0 ? (left % RING) * w : -1, ro = right < h ? (right % RING) * w : -1;
    for (int c = 0; c < 3; ++c) if (mask & (1 << c)) {
      for (int k = 0; k < 5; ++k) if (across[c][k]) vertical_row(across[c][k], state[c][k], down[c][k], w, lo, ro, y >= 0, g);
      if (y < 0) continue;
      const int held = cached_mask & (1 << c), at = (y % RING) * w;
      if (!held && cache[c]) for (int x = 0; x < w; ++x) {
        cache[c][pixels + y * w + x] = down[c][0][x]; cache[c][2 * pixels + y * w + x] = down[c][2][x];
      }
      row_sums(held ? cache[c] + y * w : p1[c] + at, p2[c] + at, down[c], held ? cache[c] : 0,
        y, w, h, sums + 6 * c, terms, edge_terms);
    }
  }
  return made;
}

EXPORT("s2MetricScale") void s2_metric_scale(int w, int h, int mask, const void *reference, int reference_kind,
  const void *distorted, int distorted_kind, const float *linear, const float *g,
  float *cache0, float *cache1, float *cache2, int cached_mask, float *scratch,
  double *terms, double *edge_terms, double *sums, int32_t *color_keys, float *color_values) {
  metric_scale_rows(w, h, mask, reference, reference_kind, distorted, distorted_kind, linear, g,
    cache0, cache1, cache2, cached_mask, scratch, terms, edge_terms, sums, color_keys, color_values, -4, h, 0, h, 0);
}

// A resumed score keeps no whole-plane cache or error map: only the row rings, recurrence state and ordered sums.
// Both builds export it: a banded score on the fused build checks its madd probe first, as s2MetricScale does.
EXPORT("s2MetricBand") int s2_metric_band(int w, int h, int first, int end, int input_y, int input_h,
  const void *reference, int reference_kind, const void *distorted, int distorted_kind,
  const float *linear, const float *g, float *scratch, double *sums, int32_t *color_keys, float *color_values) {
  return metric_scale_rows(w, h, 7, reference, reference_kind, distorted, distorted_kind, linear, g,
    0, 0, 0, 0, scratch, 0, 0, sums, color_keys, color_values, first, end, input_y, input_h, input_y);
}
