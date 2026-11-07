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

EXPORT("s2MetricFma") float s2_metric_fma(float a, float b, float c) { return metric_fma(a, b, c); }

EXPORT("s2MetricInit") void s2_metric_init(float *linear) {
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
static inline float sample(const void *input, int kind, int i, int channel, int pixels, const float *linear) {
  return kind == 0 ? linear[((const uint8_t *)input)[i * 4 + channel]] : ((const float *)input)[channel * pixels + i];
}
static void positive_row(const void *input, int kind, int y, int w, int h, float **out, int at,
                         const float *linear, int32_t *keys, float *values) {
  const int pixels = w * h;
  for (int x = 0; x < w; ++x) {
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
EXPORT("s2MetricDown") void s2_metric_down(int width, int height, const void *input, int kind,
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

// g: n2[3], d1[3], then input[4], previous[4], previous2[4] for each recurrence component.
static void blur_line(const float *input, float *out, int count, const float *g) {
  float previous[3], previous2[3], next[12], sums[4];
  for (int i = 0; i < 3; ++i) previous[i] = previous2[i] = 0;
  int n = -4;
  for (; n < (count < 8 ? count : 8); ++n) {
    const float sum = (n - 6 >= 0 ? input[n - 6] : 0) + (n + 4 < count ? input[n + 4] : 0);
    for (int i = 0; i < 3; ++i) {
      const float *p = g + 6 + i * 12;
      next[i] = metric_fma(p[4], previous[i], -previous2[i] + sum * p[0]);
    }
    if (n >= 0) out[n] = next[0] + (next[1] + next[2]);
    for (int i = 0; i < 3; ++i) { previous2[i] = previous[i]; previous[i] = next[i]; }
  }
  for (; n < count - 7; n += 4) {
    for (int lane = 0; lane < 4; ++lane) sums[lane] = input[n + lane - 6] + input[n + lane + 4];
    for (int i = 0; i < 3; ++i) {
      const float *p = g + 6 + i * 12;
      for (int lane = 0; lane < 4; ++lane) {
        float v = sums[0] * p[lane];
        for (int j = 1; j < 4; ++j) v = lane >= j ? metric_fma(p[lane - j], sums[j], v) : 0.0f * sums[j] + v;
        next[i * 4 + lane] = metric_fma(p[4 + lane], previous[i], metric_fma(p[8 + lane], previous2[i], v));
      }
    }
    for (int lane = 0; lane < 4; ++lane) out[n + lane] = next[lane] + (next[4 + lane] + next[8 + lane]);
    for (int i = 0; i < 3; ++i) { previous2[i] = next[i * 4 + 2]; previous[i] = next[i * 4 + 3]; }
  }
  for (; n < count; ++n) {
    const float sum = (n - 6 >= 0 ? input[n - 6] : 0) + (n + 4 < count ? input[n + 4] : 0);
    for (int i = 0; i < 3; ++i) {
      const float *p = g + 6 + i * 12;
      next[i] = metric_fma(p[4], previous[i], -previous2[i] + sum * p[0]);
    }
    out[n] = next[0] + (next[1] + next[2]);
    for (int i = 0; i < 3; ++i) { previous2[i] = previous[i]; previous[i] = next[i]; }
  }
}
static void vertical_row(const float *src, float *state, float *out, int w, int lo, int ro, int emit, const float *g) {
  for (int x = 0; x < w; ++x) {
    float *s = state + 6 * x;
    const float sum = (lo >= 0 ? src[lo + x] : 0) + (ro >= 0 ? src[ro + x] : 0);
    const float o1 = metric_fma(g[0], sum, metric_fma(-g[3], s[0], -s[1]));
    const float o3 = metric_fma(g[1], sum, metric_fma(-g[4], s[2], -s[3]));
    const float o5 = metric_fma(g[2], sum, metric_fma(-g[5], s[4], -s[5]));
    if (emit) out[x] = o1 + (o3 + o5);
    s[1] = s[0]; s[0] = o1; s[3] = s[2]; s[2] = o3; s[5] = s[4]; s[4] = o5;
  }
}
static void row_sums(const float *p1, const float *p2, float **down, const float *cached,
                     int y, int w, int h, double *sums, double *terms, double *edge_terms) {
  const int pixels = w * h;
  double ss1 = sums[0], ss4 = sums[1], a1 = sums[2], a4 = sums[3], l1 = sums[4], l4 = sums[5];
  for (int x = 0; x < w; ++x) {
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
// Scratch requirement in floats: ((needReference ? 33 : 0) + 44 + 18*activeBlurs) * width.
EXPORT("s2MetricScale") void s2_metric_scale(int w, int h, int mask, const void *reference, int reference_kind,
  const void *distorted, int distorted_kind, const float *linear, const float *g,
  float *cache0, float *cache1, float *cache2, int cached_mask, float *scratch,
  double *terms, double *edge_terms, double *sums, int32_t *color_keys, float *color_values) {
  const int ring = 11 * w, pixels = w * h, make_reference = (mask & ~cached_mask) != 0;
  float *cache[3]; cache[0] = cache0; cache[1] = cache1; cache[2] = cache2;
  float *p1[3], *p2[3], *across[3][5], *state[3][5], *down[3][5];
  float *cursor = scratch;
  for (int c = 0; c < 3; ++c) { p1[c] = make_reference ? cursor : 0; if (make_reference) cursor += ring; }
  for (int c = 0; c < 3; ++c) { p2[c] = cursor; cursor += ring; }
  float *product = cursor; cursor += ring;
  for (int c = 0; c < 3; ++c) for (int k = 0; k < 5; ++k) {
    const int active = (mask & (1 << c)) && (!(cached_mask & (1 << c)) || (k != 0 && k != 2));
    across[c][k] = active ? cursor : 0;
    if (active) {
      cursor += ring; state[c][k] = cursor; cursor += 6 * w; down[c][k] = cursor; cursor += w;
      for (int x = 0; x < 6 * w; ++x) state[c][k][x] = 0;
    }
  }
  for (int i = 0; i < 18; ++i) sums[i] = 0;
  int made = 0;
  for (int y = -4; y < h; ++y) {
    while (made < h && made <= y + 4) {
      const int at = (made % 11) * w;
      if (make_reference) positive_row(reference, reference_kind, made, w, h, p1, at, linear, color_keys, color_values);
      positive_row(distorted, distorted_kind, made, w, h, p2, at, linear, color_keys, color_values);
      for (int c = 0; c < 3; ++c) if (mask & (1 << c)) {
        const int held = cached_mask & (1 << c);
        const float *a = held ? cache[c] + made * w : p1[c] + at, *b = p2[c] + at;
        if (!held) {
          blur_line(a, across[c][0] + at, w, g);
          for (int x = 0; x < w; ++x) product[at + x] = a[x] * a[x];
          blur_line(product + at, across[c][2] + at, w, g);
          if (cache[c]) for (int x = 0; x < w; ++x) cache[c][made * w + x] = a[x];
        }
        blur_line(b, across[c][1] + at, w, g);
        for (int x = 0; x < w; ++x) product[at + x] = b[x] * b[x];
        blur_line(product + at, across[c][3] + at, w, g);
        for (int x = 0; x < w; ++x) product[at + x] = a[x] * b[x];
        blur_line(product + at, across[c][4] + at, w, g);
      }
      ++made;
    }
    const int left = y - 6, right = y + 4;
    const int lo = left >= 0 ? (left % 11) * w : -1, ro = right < h ? (right % 11) * w : -1;
    for (int c = 0; c < 3; ++c) if (mask & (1 << c)) {
      for (int k = 0; k < 5; ++k) if (across[c][k]) vertical_row(across[c][k], state[c][k], down[c][k], w, lo, ro, y >= 0, g);
      if (y < 0) continue;
      const int held = cached_mask & (1 << c), at = (y % 11) * w;
      if (!held && cache[c]) for (int x = 0; x < w; ++x) {
        cache[c][pixels + y * w + x] = down[c][0][x]; cache[c][2 * pixels + y * w + x] = down[c][2][x];
      }
      row_sums(held ? cache[c] + y * w : p1[c] + at, p2[c] + at, down[c], held ? cache[c] : 0,
        y, w, h, sums + 6 * c, terms, edge_terms);
    }
  }
}
