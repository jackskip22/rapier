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
// Exact binary32 fused multiply-add shared by the perceptual metrics.
#ifndef JXL_METRIC_FLOAT_H
#define JXL_METRIC_FLOAT_H
#include <stdint.h>
static inline float metric_fma(float a, float b, float c) {
  const double product = (double)a * b, sum = product + c;
  const float rounded = (float)sum;
  if ((double)rounded == sum) return rounded;
  // A double can change binary32 rounding only when it lands exactly on a binary32 midpoint.
  // For normal binary32 values this is the low 29 significand bits == 0x10000000.
  union {double f; uint64_t u;} value = {.f = sum};
  const uint32_t exponent = (uint32_t)(value.u >> 52) & 2047;
  if (exponent - 897u <= 253u && (value.u & 0x1fffffffu) != 0x10000000u) return rounded;
  const double z = sum - product, error = (product - (sum - z)) + ((double)c - z);
  if (error == 0 || !__builtin_isfinite(sum)) return rounded;
  if (!__builtin_isfinite(rounded)) {
    const double overflow = 0x1.ffffffp127;
    return sum == overflow && error < 0 ? 0x1.fffffep127f
      : sum == -overflow && error > 0 ? -0x1.fffffep127f : rounded;
  }
  const int direction = sum > rounded ? 1 : -1;
  if ((double)direction * error <= 0) return rounded;
  union {float f; uint32_t u;} next = {.f = rounded};
  if (rounded == 0) next.u = direction > 0 ? 1 : 0x80000001u;
  else next.u += (rounded > 0 ? 1 : -1) * direction;
  return sum == ((double)rounded + next.f) * .5 ? next.f : rounded;
}
#endif
