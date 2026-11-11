;; SPDX-License-Identifier: BSD-3-Clause
;; Generated from ssimulacra2-simd.c and metric-float.h by build-jxl-kernels.mjs.
;; C inputs sha256 805c405b75b175a374fb6c5f7d1a5d55bf67ec4cbe31a6eb03bb64cbcb4f3231
;; /*!
;;  * Copyright (c) the JPEG XL Project Authors.
;;  * All rights reserved.
;;  *
;;  * Redistribution and use in source and binary forms, with or without
;;  * modification, are permitted provided that the following conditions are met:
;;  *
;;  * 1. Redistributions of source code must retain the above copyright notice, this
;;  *    list of conditions and the following disclaimer.
;;  *
;;  * 2. Redistributions in binary form must reproduce the above copyright notice,
;;  *    this list of conditions and the following disclaimer in the documentation
;;  *    and/or other materials provided with the distribution.
;;  *
;;  * 3. Neither the name of the copyright holder nor the names of its
;;  *    contributors may be used to endorse or promote products derived from
;;  *    this software without specific prior written permission.
;;  *
;;  * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
;;  * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
;;  * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
;;  * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
;;  * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
;;  * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
;;  * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
;;  * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
;;  * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
;;  * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
;;  */
(module $ssimulacra2-arithmetic.wasm
  (type $t0 (func (param f32 f32 f32) (result f32)))
  (type $t1 (func (param i32)))
  (type $t2 (func (param i32 i32 i32 i32 i32 i32)))
  (type $t3 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
  (type $t4 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (type $t5 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
  (type $t6 (func (param v128 v128 v128) (result v128)))
  (type $t7 (func (param i32 i32 i32 i32 i32)))
  (type $t8 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
  (type $t9 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (type $t10 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (type $t11 (func (param v128 i32) (result v128)))
  (type $t12 (func (param f32 f32 f32 i32)))
  (type $t13 (func (param f32) (result f32)))
  (type $t14 (func))
  (import "env" "memory" (memory $env.memory 2))
  (func $s2_metric_fma (type $t0) (param $p0 f32) (param $p1 f32) (param $p2 f32) (result f32)
    (local $l3 f64) (local $l4 f64) (local $l5 f64) (local $l6 f64) (local $l7 i64) (local $l8 f64) (local $l9 i32) (local $l10 i32) (local $l11 i32)
    (block $B0
      (br_if $B0
        (f64.eq
          (local.tee $l5
            (f64.add
              (local.tee $l3
                (f64.mul
                  (f64.promote_f32
                    (local.get $p0))
                  (f64.promote_f32
                    (local.get $p1))))
              (local.tee $l4
                (f64.promote_f32
                  (local.get $p2)))))
          (local.tee $l6
            (f64.promote_f32
              (local.tee $p1
                (f32.demote_f64
                  (local.get $l5)))))))
      (block $B1
        (br_if $B1
          (i64.eq
            (i64.and
              (local.tee $l7
                (i64.reinterpret_f64
                  (local.get $l5)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B0
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l7)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B0
        (i64.gt_u
          (i64.shl
            (local.get $l7)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B0
        (f64.eq
          (local.tee $l3
            (f64.add
              (f64.sub
                (local.get $l4)
                (local.tee $l8
                  (f64.sub
                    (local.get $l5)
                    (local.get $l3))))
              (f64.sub
                (local.get $l3)
                (f64.sub
                  (local.get $l5)
                  (local.get $l8)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B2
        (br_if $B2
          (i32.lt_u
            (i32.shl
              (local.tee $l9
                (i32.reinterpret_f32
                  (local.get $p1)))
              (i32.const 1))
            (i32.const -16777216)))
        (return
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $p1
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $p1)
                    (f64.gt
                      (local.get $l3)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $p1)
                  (f64.eq
                    (local.get $l5)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l3)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $p1)
            (f64.eq
              (local.get $l5)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;))))))
      (br_if $B0
        (f64.le
          (f64.mul
            (local.get $l3)
            (f64.convert_i32_s
              (local.tee $l11
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l10
                    (f64.gt
                      (local.get $l5)
                      (local.get $l6)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B3
        (block $B4
          (br_if $B4
            (f32.ne
              (local.get $p1)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $p0
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l10)))
          (br $B3))
        (local.set $p0
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l11)
                (i32.sub
                  (i32.const 0)
                  (local.get $l11))
                (f64.gt
                  (local.get $l5)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l9)))))
      (local.set $p1
        (select
          (local.get $p0)
          (local.get $p1)
          (f64.eq
            (local.get $l5)
            (f64.mul
              (f64.add
                (local.get $l6)
                (f64.promote_f32
                  (local.get $p0)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (local.get $p1))
  (func $s2_metric_init (type $t1) (param $p0 i32)
    (local $l1 i32) (local $l2 f32) (local $l3 f64) (local $l4 f64) (local $l5 f64) (local $l6 f32) (local $l7 f64) (local $l8 i64) (local $l9 f64) (local $l10 i32) (local $l11 i32) (local $l12 i32) (local $l13 f32)
    (local.set $l1
      (i32.const 0))
    (loop $L0
      (block $B1
        (block $B2
          (br_if $B2
            (f32.gt
              (local.tee $l2
                (f32.mul
                  (f32.convert_i32_u
                    (local.get $l1))
                  (f32.const 0x1.010102p-8 (;=0.00392157;))))
              (f32.const 0x1.4b5dccp-5 (;=0.04045;))))
          (local.set $l2
            (f32.mul
              (local.get $l2)
              (f32.const 0x1.3d0722p-4 (;=0.0773994;))))
          (br $B1))
        (block $B3
          (br_if $B3
            (f64.eq
              (local.tee $l5
                (f64.add
                  (local.tee $l4
                    (f64.mul
                      (local.tee $l3
                        (f64.promote_f32
                          (local.get $l2)))
                      (f64.const 0x1.a45c1ep-1 (;=0.821015;))))
                  (f64.const 0x1.97a1d4p-1 (;=0.796157;))))
              (local.tee $l7
                (f64.promote_f32
                  (local.tee $l6
                    (f32.demote_f64
                      (local.get $l5)))))))
          (block $B4
            (br_if $B4
              (i64.eq
                (i64.and
                  (local.tee $l8
                    (i64.reinterpret_f64
                      (local.get $l5)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B3
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l8)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B3
            (f64.eq
              (local.get $l5)
              (f64.const inf (;=inf;))))
          (br_if $B3
            (f64.eq
              (local.tee $l4
                (f64.add
                  (f64.sub
                    (f64.const 0x1.97a1d4p-1 (;=0.796157;))
                    (local.tee $l9
                      (f64.sub
                        (local.get $l5)
                        (local.get $l4))))
                  (f64.add
                    (local.get $l4)
                    (f64.sub
                      (local.get $l9)
                      (local.get $l5)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B5
            (br_if $B5
              (f32.lt
                (local.get $l6)
                (f32.const inf (;=inf;))))
            (local.set $l6
              (select
                (select
                  (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                  (f32.const inf (;=inf;))
                  (f64.lt
                    (local.get $l4)
                    (f64.const 0x0p+0 (;=0;))))
                (f32.const inf (;=inf;))
                (f64.eq
                  (local.get $l5)
                  (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
            (br $B3))
          (br_if $B3
            (f64.le
              (f64.mul
                (local.get $l4)
                (f64.convert_i32_s
                  (local.tee $l11
                    (select
                      (i32.const 1)
                      (i32.const -1)
                      (local.tee $l10
                        (f64.gt
                          (local.get $l5)
                          (local.get $l7)))))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B6
            (block $B7
              (br_if $B7
                (f32.ne
                  (local.get $l6)
                  (f32.const 0x0p+0 (;=0;))))
              (local.set $l2
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l10)))
              (br $B6))
            (local.set $l2
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l11)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l11))
                    (f64.gt
                      (local.get $l5)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (i32.reinterpret_f32
                    (local.get $l6))))))
          (local.set $l6
            (select
              (local.get $l2)
              (local.get $l6)
              (f64.eq
                (local.get $l5)
                (f64.mul
                  (f64.add
                    (local.get $l7)
                    (f64.promote_f32
                      (local.get $l2)))
                  (f64.const 0x1p-1 (;=0.5;)))))))
        (block $B8
          (br_if $B8
            (f64.eq
              (local.tee $l5
                (f64.add
                  (local.tee $l4
                    (f64.mul
                      (local.get $l3)
                      (f64.const 0x1.ab5fbcp-8 (;=0.00652121;))))
                  (f64.const -0x1.c39578p-5 (;=-0.055125;))))
              (local.tee $l7
                (f64.promote_f32
                  (local.tee $l2
                    (f32.demote_f64
                      (local.get $l5)))))))
          (block $B9
            (br_if $B9
              (i64.eq
                (i64.and
                  (local.tee $l8
                    (i64.reinterpret_f64
                      (local.get $l5)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B8
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l8)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B8
            (i64.gt_u
              (i64.shl
                (local.get $l8)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B8
            (f64.eq
              (local.tee $l4
                (f64.add
                  (f64.sub
                    (f64.const -0x1.c39578p-5 (;=-0.055125;))
                    (local.tee $l9
                      (f64.sub
                        (local.get $l5)
                        (local.get $l4))))
                  (f64.add
                    (local.get $l4)
                    (f64.sub
                      (local.get $l9)
                      (local.get $l5)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B10
            (br_if $B10
              (i32.lt_u
                (i32.shl
                  (local.tee $l11
                    (i32.reinterpret_f32
                      (local.get $l2)))
                  (i32.const 1))
                (i32.const -16777216)))
            (local.set $l2
              (select
                (select
                  (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                  (local.tee $l2
                    (select
                      (select
                        (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                        (local.get $l2)
                        (f64.gt
                          (local.get $l4)
                          (f64.const 0x0p+0 (;=0;))))
                      (local.get $l2)
                      (f64.eq
                        (local.get $l5)
                        (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                  (f64.lt
                    (local.get $l4)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l2)
                (f64.eq
                  (local.get $l5)
                  (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
            (br $B8))
          (br_if $B8
            (f64.le
              (f64.mul
                (local.get $l4)
                (f64.convert_i32_s
                  (local.tee $l10
                    (select
                      (i32.const 1)
                      (i32.const -1)
                      (local.tee $l12
                        (f64.gt
                          (local.get $l5)
                          (local.get $l7)))))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B11
            (block $B12
              (br_if $B12
                (f32.ne
                  (local.get $l2)
                  (f32.const 0x0p+0 (;=0;))))
              (local.set $l13
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l12)))
              (br $B11))
            (local.set $l13
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l10)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l10))
                    (f64.gt
                      (local.get $l5)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l11)))))
          (local.set $l2
            (select
              (local.get $l13)
              (local.get $l2)
              (f64.eq
                (local.get $l5)
                (f64.mul
                  (f64.add
                    (local.get $l7)
                    (f64.promote_f32
                      (local.get $l13)))
                  (f64.const 0x1p-1 (;=0.5;)))))))
        (block $B13
          (br_if $B13
            (f64.eq
              (local.tee $l5
                (f64.add
                  (local.tee $l4
                    (f64.mul
                      (local.get $l3)
                      (f64.promote_f32
                        (local.get $l6))))
                  (f64.const 0x1.4cc362p-3 (;=0.162482;))))
              (local.tee $l7
                (f64.promote_f32
                  (local.tee $l6
                    (f32.demote_f64
                      (local.get $l5)))))))
          (block $B14
            (br_if $B14
              (i64.eq
                (i64.and
                  (local.tee $l8
                    (i64.reinterpret_f64
                      (local.get $l5)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B13
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l8)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B13
            (i64.gt_u
              (i64.shl
                (local.get $l8)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B13
            (f64.eq
              (local.tee $l4
                (f64.add
                  (f64.sub
                    (f64.const 0x1.4cc362p-3 (;=0.162482;))
                    (local.tee $l9
                      (f64.sub
                        (local.get $l5)
                        (local.get $l4))))
                  (f64.sub
                    (local.get $l4)
                    (f64.sub
                      (local.get $l5)
                      (local.get $l9)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B15
            (br_if $B15
              (i32.lt_u
                (i32.shl
                  (local.tee $l11
                    (i32.reinterpret_f32
                      (local.get $l6)))
                  (i32.const 1))
                (i32.const -16777216)))
            (local.set $l6
              (select
                (select
                  (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                  (local.tee $l6
                    (select
                      (select
                        (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                        (local.get $l6)
                        (f64.gt
                          (local.get $l4)
                          (f64.const 0x0p+0 (;=0;))))
                      (local.get $l6)
                      (f64.eq
                        (local.get $l5)
                        (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                  (f64.lt
                    (local.get $l4)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l6)
                (f64.eq
                  (local.get $l5)
                  (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
            (br $B13))
          (br_if $B13
            (f64.le
              (f64.mul
                (local.get $l4)
                (f64.convert_i32_s
                  (local.tee $l10
                    (select
                      (i32.const 1)
                      (i32.const -1)
                      (local.tee $l12
                        (f64.gt
                          (local.get $l5)
                          (local.get $l7)))))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B16
            (block $B17
              (br_if $B17
                (f32.ne
                  (local.get $l6)
                  (f32.const 0x0p+0 (;=0;))))
              (local.set $l13
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l12)))
              (br $B16))
            (local.set $l13
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l10)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l10))
                    (f64.gt
                      (local.get $l5)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l11)))))
          (local.set $l6
            (select
              (local.get $l13)
              (local.get $l6)
              (f64.eq
                (local.get $l5)
                (f64.mul
                  (f64.add
                    (local.get $l7)
                    (f64.promote_f32
                      (local.get $l13)))
                  (f64.const 0x1p-1 (;=0.5;)))))))
        (block $B18
          (br_if $B18
            (f64.eq
              (local.tee $l5
                (f64.add
                  (local.tee $l4
                    (f64.mul
                      (local.get $l3)
                      (f64.promote_f32
                        (local.get $l2))))
                  (f64.const 0x1.feb91p-2 (;=0.498753;))))
              (local.tee $l7
                (f64.promote_f32
                  (local.tee $l2
                    (f32.demote_f64
                      (local.get $l5)))))))
          (block $B19
            (br_if $B19
              (i64.eq
                (i64.and
                  (local.tee $l8
                    (i64.reinterpret_f64
                      (local.get $l5)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B18
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l8)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B18
            (i64.gt_u
              (i64.shl
                (local.get $l8)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B18
            (f64.eq
              (local.tee $l4
                (f64.add
                  (f64.sub
                    (f64.const 0x1.feb91p-2 (;=0.498753;))
                    (local.tee $l9
                      (f64.sub
                        (local.get $l5)
                        (local.get $l4))))
                  (f64.sub
                    (local.get $l4)
                    (f64.sub
                      (local.get $l5)
                      (local.get $l9)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B20
            (br_if $B20
              (i32.lt_u
                (i32.shl
                  (local.tee $l11
                    (i32.reinterpret_f32
                      (local.get $l2)))
                  (i32.const 1))
                (i32.const -16777216)))
            (local.set $l2
              (select
                (select
                  (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                  (local.tee $l2
                    (select
                      (select
                        (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                        (local.get $l2)
                        (f64.gt
                          (local.get $l4)
                          (f64.const 0x0p+0 (;=0;))))
                      (local.get $l2)
                      (f64.eq
                        (local.get $l5)
                        (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                  (f64.lt
                    (local.get $l4)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l2)
                (f64.eq
                  (local.get $l5)
                  (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
            (br $B18))
          (br_if $B18
            (f64.le
              (f64.mul
                (local.get $l4)
                (f64.convert_i32_s
                  (local.tee $l10
                    (select
                      (i32.const 1)
                      (i32.const -1)
                      (local.tee $l12
                        (f64.gt
                          (local.get $l5)
                          (local.get $l7)))))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B21
            (block $B22
              (br_if $B22
                (f32.ne
                  (local.get $l2)
                  (f32.const 0x0p+0 (;=0;))))
              (local.set $l13
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l12)))
              (br $B21))
            (local.set $l13
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l10)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l10))
                    (f64.gt
                      (local.get $l5)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l11)))))
          (local.set $l2
            (select
              (local.get $l13)
              (local.get $l2)
              (f64.eq
                (local.get $l5)
                (f64.mul
                  (f64.add
                    (local.get $l7)
                    (f64.promote_f32
                      (local.get $l13)))
                  (f64.const 0x1p-1 (;=0.5;)))))))
        (block $B23
          (br_if $B23
            (f64.eq
              (local.tee $l5
                (f64.add
                  (local.tee $l4
                    (f64.mul
                      (local.get $l3)
                      (f64.promote_f32
                        (local.get $l6))))
                  (f64.const 0x1.55faaap-7 (;=0.0104364;))))
              (local.tee $l7
                (f64.promote_f32
                  (local.tee $l6
                    (f32.demote_f64
                      (local.get $l5)))))))
          (block $B24
            (br_if $B24
              (i64.eq
                (i64.and
                  (local.tee $l8
                    (i64.reinterpret_f64
                      (local.get $l5)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B23
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l8)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B23
            (i64.gt_u
              (i64.shl
                (local.get $l8)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B23
            (f64.eq
              (local.tee $l4
                (f64.add
                  (f64.sub
                    (f64.const 0x1.55faaap-7 (;=0.0104364;))
                    (local.tee $l9
                      (f64.sub
                        (local.get $l5)
                        (local.get $l4))))
                  (f64.sub
                    (local.get $l4)
                    (f64.sub
                      (local.get $l5)
                      (local.get $l9)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B25
            (br_if $B25
              (i32.lt_u
                (i32.shl
                  (local.tee $l11
                    (i32.reinterpret_f32
                      (local.get $l6)))
                  (i32.const 1))
                (i32.const -16777216)))
            (local.set $l6
              (select
                (select
                  (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                  (local.tee $l6
                    (select
                      (select
                        (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                        (local.get $l6)
                        (f64.gt
                          (local.get $l4)
                          (f64.const 0x0p+0 (;=0;))))
                      (local.get $l6)
                      (f64.eq
                        (local.get $l5)
                        (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                  (f64.lt
                    (local.get $l4)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l6)
                (f64.eq
                  (local.get $l5)
                  (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
            (br $B23))
          (br_if $B23
            (f64.le
              (f64.mul
                (local.get $l4)
                (f64.convert_i32_s
                  (local.tee $l10
                    (select
                      (i32.const 1)
                      (i32.const -1)
                      (local.tee $l12
                        (f64.gt
                          (local.get $l5)
                          (local.get $l7)))))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B26
            (block $B27
              (br_if $B27
                (f32.ne
                  (local.get $l6)
                  (f32.const 0x0p+0 (;=0;))))
              (local.set $l13
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l12)))
              (br $B26))
            (local.set $l13
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l10)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l10))
                    (f64.gt
                      (local.get $l5)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l11)))))
          (local.set $l6
            (select
              (local.get $l13)
              (local.get $l6)
              (f64.eq
                (local.get $l5)
                (f64.mul
                  (f64.add
                    (local.get $l7)
                    (f64.promote_f32
                      (local.get $l13)))
                  (f64.const 0x1p-1 (;=0.5;)))))))
        (block $B28
          (br_if $B28
            (f64.eq
              (local.tee $l5
                (f64.add
                  (local.tee $l4
                    (f64.mul
                      (local.get $l3)
                      (f64.promote_f32
                        (local.get $l2))))
                  (f64.const 0x1.13b4bcp+0 (;=1.07698;))))
              (local.tee $l7
                (f64.promote_f32
                  (local.tee $l2
                    (f32.demote_f64
                      (local.get $l5)))))))
          (block $B29
            (br_if $B29
              (i64.eq
                (i64.and
                  (local.tee $l8
                    (i64.reinterpret_f64
                      (local.get $l5)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B28
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l8)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B28
            (i64.gt_u
              (i64.shl
                (local.get $l8)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B28
            (f64.eq
              (local.tee $l4
                (f64.add
                  (f64.sub
                    (f64.const 0x1.13b4bcp+0 (;=1.07698;))
                    (local.tee $l9
                      (f64.sub
                        (local.get $l5)
                        (local.get $l4))))
                  (f64.sub
                    (local.get $l4)
                    (f64.sub
                      (local.get $l5)
                      (local.get $l9)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B30
            (br_if $B30
              (i32.lt_u
                (i32.shl
                  (local.tee $l11
                    (i32.reinterpret_f32
                      (local.get $l2)))
                  (i32.const 1))
                (i32.const -16777216)))
            (local.set $l2
              (select
                (select
                  (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                  (local.tee $l2
                    (select
                      (select
                        (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                        (local.get $l2)
                        (f64.gt
                          (local.get $l4)
                          (f64.const 0x0p+0 (;=0;))))
                      (local.get $l2)
                      (f64.eq
                        (local.get $l5)
                        (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                  (f64.lt
                    (local.get $l4)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l2)
                (f64.eq
                  (local.get $l5)
                  (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
            (br $B28))
          (br_if $B28
            (f64.le
              (f64.mul
                (local.get $l4)
                (f64.convert_i32_s
                  (local.tee $l10
                    (select
                      (i32.const 1)
                      (i32.const -1)
                      (local.tee $l12
                        (f64.gt
                          (local.get $l5)
                          (local.get $l7)))))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B31
            (block $B32
              (br_if $B32
                (f32.ne
                  (local.get $l2)
                  (f32.const 0x0p+0 (;=0;))))
              (local.set $l13
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l12)))
              (br $B31))
            (local.set $l13
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l10)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l10))
                    (f64.gt
                      (local.get $l5)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l11)))))
          (local.set $l2
            (select
              (local.get $l13)
              (local.get $l2)
              (f64.eq
                (local.get $l5)
                (f64.mul
                  (f64.add
                    (local.get $l7)
                    (f64.promote_f32
                      (local.get $l13)))
                  (f64.const 0x1p-1 (;=0.5;)))))))
        (block $B33
          (br_if $B33
            (f64.eq
              (local.tee $l5
                (f64.add
                  (local.tee $l4
                    (f64.mul
                      (local.get $l3)
                      (f64.promote_f32
                        (local.get $l6))))
                  (f64.const 0x1.cd6ceep-13 (;=0.000220025;))))
              (local.tee $l7
                (f64.promote_f32
                  (local.tee $l6
                    (f32.demote_f64
                      (local.get $l5)))))))
          (block $B34
            (br_if $B34
              (i64.eq
                (i64.and
                  (local.tee $l8
                    (i64.reinterpret_f64
                      (local.get $l5)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B33
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l8)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B33
            (i64.gt_u
              (i64.shl
                (local.get $l8)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B33
            (f64.eq
              (local.tee $l4
                (f64.add
                  (f64.sub
                    (f64.const 0x1.cd6ceep-13 (;=0.000220025;))
                    (local.tee $l9
                      (f64.sub
                        (local.get $l5)
                        (local.get $l4))))
                  (f64.sub
                    (local.get $l4)
                    (f64.sub
                      (local.get $l5)
                      (local.get $l9)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B35
            (br_if $B35
              (i32.lt_u
                (i32.shl
                  (local.tee $l11
                    (i32.reinterpret_f32
                      (local.get $l6)))
                  (i32.const 1))
                (i32.const -16777216)))
            (local.set $l6
              (select
                (select
                  (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                  (local.tee $l6
                    (select
                      (select
                        (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                        (local.get $l6)
                        (f64.gt
                          (local.get $l4)
                          (f64.const 0x0p+0 (;=0;))))
                      (local.get $l6)
                      (f64.eq
                        (local.get $l5)
                        (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                  (f64.lt
                    (local.get $l4)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l6)
                (f64.eq
                  (local.get $l5)
                  (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
            (br $B33))
          (br_if $B33
            (f64.le
              (f64.mul
                (local.get $l4)
                (f64.convert_i32_s
                  (local.tee $l10
                    (select
                      (i32.const 1)
                      (i32.const -1)
                      (local.tee $l12
                        (f64.gt
                          (local.get $l5)
                          (local.get $l7)))))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B36
            (block $B37
              (br_if $B37
                (f32.ne
                  (local.get $l6)
                  (f32.const 0x0p+0 (;=0;))))
              (local.set $l13
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l12)))
              (br $B36))
            (local.set $l13
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l10)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l10))
                    (f64.gt
                      (local.get $l5)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l11)))))
          (local.set $l6
            (select
              (local.get $l13)
              (local.get $l6)
              (f64.eq
                (local.get $l5)
                (f64.mul
                  (f64.add
                    (local.get $l7)
                    (f64.promote_f32
                      (local.get $l13)))
                  (f64.const 0x1p-1 (;=0.5;)))))))
        (block $B38
          (br_if $B38
            (f64.eq
              (local.tee $l3
                (f64.add
                  (local.tee $l5
                    (f64.mul
                      (local.get $l3)
                      (f64.promote_f32
                        (local.get $l2))))
                  (f64.const 0x1.0d804ap-2 (;=0.263185;))))
              (local.tee $l4
                (f64.promote_f32
                  (local.tee $l2
                    (f32.demote_f64
                      (local.get $l3)))))))
          (block $B39
            (br_if $B39
              (i64.eq
                (i64.and
                  (local.tee $l8
                    (i64.reinterpret_f64
                      (local.get $l3)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B38
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l8)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B38
            (i64.gt_u
              (i64.shl
                (local.get $l8)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B38
            (f64.eq
              (local.tee $l5
                (f64.add
                  (f64.sub
                    (f64.const 0x1.0d804ap-2 (;=0.263185;))
                    (local.tee $l7
                      (f64.sub
                        (local.get $l3)
                        (local.get $l5))))
                  (f64.sub
                    (local.get $l5)
                    (f64.sub
                      (local.get $l3)
                      (local.get $l7)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B40
            (br_if $B40
              (i32.lt_u
                (i32.shl
                  (local.tee $l11
                    (i32.reinterpret_f32
                      (local.get $l2)))
                  (i32.const 1))
                (i32.const -16777216)))
            (local.set $l2
              (select
                (select
                  (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                  (local.tee $l2
                    (select
                      (select
                        (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                        (local.get $l2)
                        (f64.gt
                          (local.get $l5)
                          (f64.const 0x0p+0 (;=0;))))
                      (local.get $l2)
                      (f64.eq
                        (local.get $l3)
                        (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                  (f64.lt
                    (local.get $l5)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l2)
                (f64.eq
                  (local.get $l3)
                  (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
            (br $B38))
          (br_if $B38
            (f64.le
              (f64.mul
                (local.get $l5)
                (f64.convert_i32_s
                  (local.tee $l10
                    (select
                      (i32.const 1)
                      (i32.const -1)
                      (local.tee $l12
                        (f64.gt
                          (local.get $l3)
                          (local.get $l4)))))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B41
            (block $B42
              (br_if $B42
                (f32.ne
                  (local.get $l2)
                  (f32.const 0x0p+0 (;=0;))))
              (local.set $l13
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l12)))
              (br $B41))
            (local.set $l13
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l10)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l10))
                    (f64.gt
                      (local.get $l3)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l11)))))
          (local.set $l2
            (select
              (local.get $l13)
              (local.get $l2)
              (f64.eq
                (local.get $l3)
                (f64.mul
                  (f64.add
                    (local.get $l4)
                    (f64.promote_f32
                      (local.get $l13)))
                  (f64.const 0x1p-1 (;=0.5;)))))))
        (local.set $l2
          (f32.div
            (local.get $l6)
            (local.get $l2))))
      (f32.store
        (local.get $p0)
        (local.get $l2))
      (local.set $p0
        (i32.add
          (local.get $p0)
          (i32.const 4)))
      (br_if $L0
        (i32.ne
          (local.tee $l1
            (i32.add
              (local.get $l1)
              (i32.const 1)))
          (i32.const 256)))))
  (func $s2_metric_down (type $t2) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32)
    (local $l6 i32) (local $l7 i32) (local $l8 i32) (local $l9 i32) (local $l10 i32) (local $l11 i32) (local $l12 i32) (local $l13 i32) (local $l14 i32) (local $l15 i32) (local $l16 i32) (local $l17 i32) (local $l18 i32) (local $l19 i32) (local $l20 i32) (local $l21 i32) (local $l22 i32) (local $l23 i32) (local $l24 i32) (local $l25 i32)
    (block $B0
      (br_if $B0
        (i32.lt_s
          (local.tee $l7
            (i32.shr_s
              (local.tee $l6
                (i32.add
                  (local.get $p1)
                  (i32.const 1)))
              (i32.const 1)))
          (i32.const 1)))
      (br_if $B0
        (i32.lt_s
          (local.tee $l8
            (i32.shr_s
              (i32.add
                (local.get $p0)
                (i32.const 1))
              (i32.const 1)))
          (i32.const 1)))
      (local.set $l9
        (i32.add
          (local.get $p0)
          (i32.const -1)))
      (local.set $l10
        (i32.add
          (local.get $p1)
          (i32.const -1)))
      (block $B1
        (br_if $B1
          (i32.eqz
            (local.get $p3)))
        (local.set $l11
          (i32.mul
            (local.get $p1)
            (local.get $p0)))
        (local.set $l12
          (i32.shl
            (local.get $l8)
            (i32.const 2)))
        (local.set $l13
          (i32.shl
            (local.get $p0)
            (i32.const 2)))
        (local.set $l14
          (i32.shl
            (local.get $p0)
            (i32.const 3)))
        (local.set $l15
          (i32.const 0))
        (local.set $l16
          (local.get $p5))
        (local.set $l17
          (i32.const 1))
        (local.set $l18
          (local.get $p2))
        (loop $L2
          (local.set $l19
            (i32.add
              (local.get $p2)
              (i32.shl
                (i32.mul
                  (select
                    (local.tee $p3
                      (i32.or
                        (local.tee $p4
                          (i32.shl
                            (local.get $l15)
                            (i32.const 1)))
                        (i32.const 1)))
                    (local.get $l10)
                    (i32.lt_s
                      (local.get $p3)
                      (local.get $l10)))
                  (local.get $p0))
                (i32.const 2))))
          (local.set $l20
            (i32.add
              (local.get $p2)
              (i32.shl
                (i32.mul
                  (local.get $p4)
                  (local.get $p0))
                (i32.const 2))))
          (local.set $p3
            (i32.add
              (local.get $p2)
              (i32.mul
                (local.get $l13)
                (select
                  (local.get $l17)
                  (local.get $l10)
                  (i32.lt_s
                    (local.get $l17)
                    (local.get $l10))))))
          (local.set $l21
            (local.get $l16))
          (local.set $p4
            (i32.const 1))
          (local.set $l22
            (local.get $l18))
          (local.set $l23
            (local.get $l8))
          (loop $L3
            (f32.store
              (local.get $l21)
              (f32.mul
                (f32.add
                  (f32.add
                    (f32.add
                      (f32.load
                        (i32.add
                          (local.get $l20)
                          (local.tee $l24
                            (i32.shl
                              (select
                                (local.get $p4)
                                (local.get $l9)
                                (i32.lt_s
                                  (local.get $p4)
                                  (local.get $l9)))
                              (i32.const 2)))))
                      (f32.load
                        (local.get $l22)))
                    (f32.load
                      (local.get $p3)))
                  (f32.load
                    (i32.add
                      (local.get $l19)
                      (local.get $l24))))
                (f32.const 0x1p-2 (;=0.25;))))
            (local.set $l21
              (i32.add
                (local.get $l21)
                (i32.const 4)))
            (local.set $p4
              (i32.add
                (local.get $p4)
                (i32.const 2)))
            (local.set $p3
              (i32.add
                (local.get $p3)
                (i32.const 8)))
            (local.set $l22
              (i32.add
                (local.get $l22)
                (i32.const 8)))
            (br_if $L3
              (local.tee $l23
                (i32.add
                  (local.get $l23)
                  (i32.const -1)))))
          (local.set $l16
            (i32.add
              (local.get $l16)
              (local.get $l12)))
          (local.set $l17
            (i32.add
              (local.get $l17)
              (i32.const 2)))
          (local.set $l18
            (i32.add
              (local.get $l18)
              (local.get $l14)))
          (br_if $L2
            (i32.ne
              (local.tee $l15
                (i32.add
                  (local.get $l15)
                  (i32.const 1)))
              (local.get $l7))))
        (local.set $l13
          (i32.shl
            (local.get $p1)
            (i32.const 2)))
        (local.set $l14
          (i32.shl
            (local.get $p0)
            (i32.const 3)))
        (local.set $l25
          (i32.shl
            (local.get $l8)
            (i32.const 2)))
        (local.set $l15
          (i32.add
            (local.get $p5)
            (i32.shl
              (i32.mul
                (local.get $l7)
                (local.get $l8))
              (i32.const 2))))
        (local.set $l16
          (i32.const 0))
        (local.set $l17
          (i32.const 1))
        (local.set $l18
          (local.tee $l12
            (i32.add
              (local.get $p2)
              (i32.shl
                (local.get $l11)
                (i32.const 2)))))
        (loop $L4
          (local.set $l19
            (i32.add
              (local.get $l12)
              (i32.shl
                (i32.mul
                  (select
                    (local.tee $p3
                      (i32.or
                        (local.tee $p4
                          (i32.shl
                            (local.get $l16)
                            (i32.const 1)))
                        (i32.const 1)))
                    (local.get $l10)
                    (i32.lt_s
                      (local.get $p3)
                      (local.get $l10)))
                  (local.get $p0))
                (i32.const 2))))
          (local.set $l20
            (i32.add
              (local.get $l12)
              (i32.shl
                (i32.mul
                  (local.get $p4)
                  (local.get $p0))
                (i32.const 2))))
          (local.set $p3
            (i32.add
              (local.get $p2)
              (i32.mul
                (local.get $p0)
                (i32.add
                  (local.get $l13)
                  (i32.shl
                    (select
                      (local.get $l17)
                      (local.get $l10)
                      (i32.lt_s
                        (local.get $l17)
                        (local.get $l10)))
                    (i32.const 2))))))
          (local.set $p4
            (i32.const 1))
          (local.set $l21
            (local.get $l18))
          (local.set $l22
            (local.get $l15))
          (local.set $l23
            (local.get $l8))
          (loop $L5
            (f32.store
              (local.get $l22)
              (f32.mul
                (f32.add
                  (f32.add
                    (f32.add
                      (f32.load
                        (i32.add
                          (local.get $l20)
                          (local.tee $l24
                            (i32.shl
                              (select
                                (local.get $p4)
                                (local.get $l9)
                                (i32.lt_s
                                  (local.get $p4)
                                  (local.get $l9)))
                              (i32.const 2)))))
                      (f32.load
                        (local.get $l21)))
                    (f32.load
                      (local.get $p3)))
                  (f32.load
                    (i32.add
                      (local.get $l19)
                      (local.get $l24))))
                (f32.const 0x1p-2 (;=0.25;))))
            (local.set $p4
              (i32.add
                (local.get $p4)
                (i32.const 2)))
            (local.set $p3
              (i32.add
                (local.get $p3)
                (i32.const 8)))
            (local.set $l21
              (i32.add
                (local.get $l21)
                (i32.const 8)))
            (local.set $l22
              (i32.add
                (local.get $l22)
                (i32.const 4)))
            (br_if $L5
              (local.tee $l23
                (i32.add
                  (local.get $l23)
                  (i32.const -1)))))
          (local.set $l17
            (i32.add
              (local.get $l17)
              (i32.const 2)))
          (local.set $l18
            (i32.add
              (local.get $l18)
              (local.get $l14)))
          (local.set $l15
            (i32.add
              (local.get $l15)
              (local.get $l25)))
          (br_if $L4
            (i32.ne
              (local.tee $l16
                (i32.add
                  (local.get $l16)
                  (i32.const 1)))
              (local.get $l7))))
        (local.set $l13
          (i32.shl
            (local.get $p1)
            (i32.const 3)))
        (local.set $l14
          (i32.shl
            (local.get $p0)
            (i32.const 3)))
        (local.set $l25
          (i32.shl
            (local.get $l8)
            (i32.const 2)))
        (local.set $l15
          (i32.add
            (local.get $p5)
            (i32.shl
              (i32.mul
                (local.get $l8)
                (i32.shr_u
                  (local.get $l6)
                  (i32.const 1)))
              (i32.const 3))))
        (local.set $l16
          (i32.const 0))
        (local.set $l17
          (i32.const 1))
        (local.set $l18
          (local.tee $l12
            (i32.add
              (local.get $p2)
              (i32.shl
                (local.get $l11)
                (i32.const 3)))))
        (loop $L6
          (local.set $l19
            (i32.add
              (local.get $l12)
              (i32.shl
                (i32.mul
                  (select
                    (local.tee $p3
                      (i32.or
                        (local.tee $p4
                          (i32.shl
                            (local.get $l16)
                            (i32.const 1)))
                        (i32.const 1)))
                    (local.get $l10)
                    (i32.lt_s
                      (local.get $p3)
                      (local.get $l10)))
                  (local.get $p0))
                (i32.const 2))))
          (local.set $l20
            (i32.add
              (local.get $l12)
              (i32.shl
                (i32.mul
                  (local.get $p4)
                  (local.get $p0))
                (i32.const 2))))
          (local.set $p3
            (i32.add
              (local.get $p2)
              (i32.mul
                (local.get $p0)
                (i32.add
                  (local.get $l13)
                  (i32.shl
                    (select
                      (local.get $l17)
                      (local.get $l10)
                      (i32.lt_s
                        (local.get $l17)
                        (local.get $l10)))
                    (i32.const 2))))))
          (local.set $p4
            (i32.const 1))
          (local.set $l21
            (local.get $l18))
          (local.set $l22
            (local.get $l15))
          (local.set $l23
            (local.get $l8))
          (loop $L7
            (f32.store
              (local.get $l22)
              (f32.mul
                (f32.add
                  (f32.add
                    (f32.add
                      (f32.load
                        (i32.add
                          (local.get $l20)
                          (local.tee $l24
                            (i32.shl
                              (select
                                (local.get $p4)
                                (local.get $l9)
                                (i32.lt_s
                                  (local.get $p4)
                                  (local.get $l9)))
                              (i32.const 2)))))
                      (f32.load
                        (local.get $l21)))
                    (f32.load
                      (local.get $p3)))
                  (f32.load
                    (i32.add
                      (local.get $l19)
                      (local.get $l24))))
                (f32.const 0x1p-2 (;=0.25;))))
            (local.set $p4
              (i32.add
                (local.get $p4)
                (i32.const 2)))
            (local.set $p3
              (i32.add
                (local.get $p3)
                (i32.const 8)))
            (local.set $l21
              (i32.add
                (local.get $l21)
                (i32.const 8)))
            (local.set $l22
              (i32.add
                (local.get $l22)
                (i32.const 4)))
            (br_if $L7
              (local.tee $l23
                (i32.add
                  (local.get $l23)
                  (i32.const -1)))))
          (local.set $l17
            (i32.add
              (local.get $l17)
              (i32.const 2)))
          (local.set $l18
            (i32.add
              (local.get $l18)
              (local.get $l14)))
          (local.set $l15
            (i32.add
              (local.get $l15)
              (local.get $l25)))
          (br_if $L6
            (i32.ne
              (local.tee $l16
                (i32.add
                  (local.get $l16)
                  (i32.const 1)))
              (local.get $l7)))
          (br $B0)))
      (local.set $l13
        (i32.shl
          (local.get $p0)
          (i32.const 3)))
      (local.set $l14
        (i32.shl
          (local.get $p0)
          (i32.const 2)))
      (local.set $l25
        (i32.shl
          (local.get $l8)
          (i32.const 2)))
      (local.set $l16
        (i32.const 0))
      (local.set $l18
        (local.get $p2))
      (local.set $l15
        (i32.const 1))
      (local.set $l12
        (local.get $p5))
      (loop $L8
        (local.set $l20
          (i32.mul
            (select
              (local.tee $l21
                (i32.or
                  (local.tee $p3
                    (i32.shl
                      (local.get $l16)
                      (i32.const 1)))
                  (i32.const 1)))
              (local.get $l10)
              (i32.lt_s
                (local.get $l21)
                (local.get $l10)))
            (local.get $p0)))
        (local.set $l17
          (i32.mul
            (local.get $p3)
            (local.get $p0)))
        (local.set $l21
          (i32.add
            (local.get $p2)
            (i32.mul
              (local.get $l14)
              (select
                (local.get $l15)
                (local.get $l10)
                (i32.lt_s
                  (local.get $l15)
                  (local.get $l10))))))
        (local.set $p3
          (i32.const 1))
        (local.set $l22
          (local.get $l18))
        (local.set $l23
          (local.get $l12))
        (local.set $l24
          (local.get $l8))
        (loop $L9
          (f32.store
            (local.get $l23)
            (f32.mul
              (f32.add
                (f32.add
                  (f32.add
                    (f32.load
                      (i32.add
                        (local.get $p4)
                        (i32.shl
                          (i32.load8_u
                            (i32.add
                              (local.get $p2)
                              (i32.shl
                                (i32.add
                                  (local.tee $l19
                                    (select
                                      (local.get $p3)
                                      (local.get $l9)
                                      (i32.lt_s
                                        (local.get $p3)
                                        (local.get $l9))))
                                  (local.get $l17))
                                (i32.const 2))))
                          (i32.const 2))))
                    (f32.load
                      (i32.add
                        (local.get $p4)
                        (i32.shl
                          (i32.load8_u
                            (local.get $l22))
                          (i32.const 2)))))
                  (f32.load
                    (i32.add
                      (local.get $p4)
                      (i32.shl
                        (i32.load8_u
                          (local.get $l21))
                        (i32.const 2)))))
                (f32.load
                  (i32.add
                    (local.get $p4)
                    (i32.shl
                      (i32.load8_u
                        (i32.add
                          (local.get $p2)
                          (i32.shl
                            (i32.add
                              (local.get $l19)
                              (local.get $l20))
                            (i32.const 2))))
                      (i32.const 2)))))
              (f32.const 0x1p-2 (;=0.25;))))
          (local.set $p3
            (i32.add
              (local.get $p3)
              (i32.const 2)))
          (local.set $l22
            (i32.add
              (local.get $l22)
              (i32.const 8)))
          (local.set $l21
            (i32.add
              (local.get $l21)
              (i32.const 8)))
          (local.set $l23
            (i32.add
              (local.get $l23)
              (i32.const 4)))
          (br_if $L9
            (local.tee $l24
              (i32.add
                (local.get $l24)
                (i32.const -1)))))
        (local.set $l18
          (i32.add
            (local.get $l18)
            (local.get $l13)))
        (local.set $l15
          (i32.add
            (local.get $l15)
            (i32.const 2)))
        (local.set $l12
          (i32.add
            (local.get $l12)
            (local.get $l25)))
        (br_if $L8
          (i32.ne
            (local.tee $l16
              (i32.add
                (local.get $l16)
                (i32.const 1)))
            (local.get $l7))))
      (local.set $l14
        (i32.shl
          (local.get $p0)
          (i32.const 3)))
      (local.set $l25
        (i32.shl
          (local.get $p0)
          (i32.const 2)))
      (local.set $p1
        (i32.shl
          (local.get $l8)
          (i32.const 2)))
      (local.set $l18
        (i32.add
          (local.get $p5)
          (i32.shl
            (i32.mul
              (local.get $l7)
              (local.get $l8))
            (i32.const 2))))
      (local.set $l12
        (i32.const 0))
      (local.set $l13
        (local.tee $l24
          (i32.add
            (local.get $p2)
            (i32.const 1))))
      (local.set $l16
        (i32.const 1))
      (loop $L10
        (local.set $l17
          (i32.mul
            (select
              (local.tee $l21
                (i32.or
                  (local.tee $p3
                    (i32.shl
                      (local.get $l12)
                      (i32.const 1)))
                  (i32.const 1)))
              (local.get $l10)
              (i32.lt_s
                (local.get $l21)
                (local.get $l10)))
            (local.get $p0)))
        (local.set $l15
          (i32.mul
            (local.get $p3)
            (local.get $p0)))
        (local.set $l21
          (i32.add
            (local.get $l24)
            (i32.mul
              (local.get $l25)
              (select
                (local.get $l16)
                (local.get $l10)
                (i32.lt_s
                  (local.get $l16)
                  (local.get $l10))))))
        (local.set $p3
          (i32.const 1))
        (local.set $l22
          (local.get $l13))
        (local.set $l23
          (local.get $l18))
        (local.set $l19
          (local.get $l8))
        (loop $L11
          (f32.store
            (local.get $l23)
            (f32.mul
              (f32.add
                (f32.add
                  (f32.add
                    (f32.load
                      (i32.add
                        (local.get $p4)
                        (i32.shl
                          (i32.load8_u
                            (i32.add
                              (local.get $l24)
                              (i32.shl
                                (i32.add
                                  (local.tee $l20
                                    (select
                                      (local.get $p3)
                                      (local.get $l9)
                                      (i32.lt_s
                                        (local.get $p3)
                                        (local.get $l9))))
                                  (local.get $l15))
                                (i32.const 2))))
                          (i32.const 2))))
                    (f32.load
                      (i32.add
                        (local.get $p4)
                        (i32.shl
                          (i32.load8_u
                            (local.get $l22))
                          (i32.const 2)))))
                  (f32.load
                    (i32.add
                      (local.get $p4)
                      (i32.shl
                        (i32.load8_u
                          (local.get $l21))
                        (i32.const 2)))))
                (f32.load
                  (i32.add
                    (local.get $p4)
                    (i32.shl
                      (i32.load8_u
                        (i32.add
                          (local.get $l24)
                          (i32.shl
                            (i32.add
                              (local.get $l20)
                              (local.get $l17))
                            (i32.const 2))))
                      (i32.const 2)))))
              (f32.const 0x1p-2 (;=0.25;))))
          (local.set $p3
            (i32.add
              (local.get $p3)
              (i32.const 2)))
          (local.set $l22
            (i32.add
              (local.get $l22)
              (i32.const 8)))
          (local.set $l21
            (i32.add
              (local.get $l21)
              (i32.const 8)))
          (local.set $l23
            (i32.add
              (local.get $l23)
              (i32.const 4)))
          (br_if $L11
            (local.tee $l19
              (i32.add
                (local.get $l19)
                (i32.const -1)))))
        (local.set $l13
          (i32.add
            (local.get $l13)
            (local.get $l14)))
        (local.set $l16
          (i32.add
            (local.get $l16)
            (i32.const 2)))
        (local.set $l18
          (i32.add
            (local.get $l18)
            (local.get $p1)))
        (br_if $L10
          (i32.ne
            (local.tee $l12
              (i32.add
                (local.get $l12)
                (i32.const 1)))
            (local.get $l7))))
      (local.set $l13
        (i32.shl
          (local.get $p0)
          (i32.const 3)))
      (local.set $l14
        (i32.shl
          (local.get $p0)
          (i32.const 2)))
      (local.set $l25
        (i32.shl
          (local.get $l8)
          (i32.const 2)))
      (local.set $l16
        (i32.add
          (local.get $p5)
          (i32.shl
            (i32.mul
              (local.get $l8)
              (i32.shr_u
                (local.get $l6)
                (i32.const 1)))
            (i32.const 3))))
      (local.set $l18
        (i32.const 0))
      (local.set $l12
        (local.tee $l24
          (i32.add
            (local.get $p2)
            (i32.const 2))))
      (local.set $l15
        (i32.const 1))
      (loop $L12
        (local.set $l20
          (i32.mul
            (select
              (local.tee $l21
                (i32.or
                  (local.tee $p3
                    (i32.shl
                      (local.get $l18)
                      (i32.const 1)))
                  (i32.const 1)))
              (local.get $l10)
              (i32.lt_s
                (local.get $l21)
                (local.get $l10)))
            (local.get $p0)))
        (local.set $l17
          (i32.mul
            (local.get $p3)
            (local.get $p0)))
        (local.set $l21
          (i32.add
            (local.get $l24)
            (i32.mul
              (local.get $l14)
              (select
                (local.get $l15)
                (local.get $l10)
                (i32.lt_s
                  (local.get $l15)
                  (local.get $l10))))))
        (local.set $p3
          (i32.const 1))
        (local.set $l22
          (local.get $l12))
        (local.set $l23
          (local.get $l16))
        (local.set $p2
          (local.get $l8))
        (loop $L13
          (f32.store
            (local.get $l23)
            (f32.mul
              (f32.add
                (f32.add
                  (f32.add
                    (f32.load
                      (i32.add
                        (local.get $p4)
                        (i32.shl
                          (i32.load8_u
                            (i32.add
                              (local.get $l24)
                              (i32.shl
                                (i32.add
                                  (local.tee $l19
                                    (select
                                      (local.get $p3)
                                      (local.get $l9)
                                      (i32.lt_s
                                        (local.get $p3)
                                        (local.get $l9))))
                                  (local.get $l17))
                                (i32.const 2))))
                          (i32.const 2))))
                    (f32.load
                      (i32.add
                        (local.get $p4)
                        (i32.shl
                          (i32.load8_u
                            (local.get $l22))
                          (i32.const 2)))))
                  (f32.load
                    (i32.add
                      (local.get $p4)
                      (i32.shl
                        (i32.load8_u
                          (local.get $l21))
                        (i32.const 2)))))
                (f32.load
                  (i32.add
                    (local.get $p4)
                    (i32.shl
                      (i32.load8_u
                        (i32.add
                          (local.get $l24)
                          (i32.shl
                            (i32.add
                              (local.get $l19)
                              (local.get $l20))
                            (i32.const 2))))
                      (i32.const 2)))))
              (f32.const 0x1p-2 (;=0.25;))))
          (local.set $p3
            (i32.add
              (local.get $p3)
              (i32.const 2)))
          (local.set $l22
            (i32.add
              (local.get $l22)
              (i32.const 8)))
          (local.set $l21
            (i32.add
              (local.get $l21)
              (i32.const 8)))
          (local.set $l23
            (i32.add
              (local.get $l23)
              (i32.const 4)))
          (br_if $L13
            (local.tee $p2
              (i32.add
                (local.get $p2)
                (i32.const -1)))))
        (local.set $l12
          (i32.add
            (local.get $l12)
            (local.get $l13)))
        (local.set $l15
          (i32.add
            (local.get $l15)
            (i32.const 2)))
        (local.set $l16
          (i32.add
            (local.get $l16)
            (local.get $l25)))
        (br_if $L12
          (i32.ne
            (local.tee $l18
              (i32.add
                (local.get $l18)
                (i32.const 1)))
            (local.get $l7))))))
  (func $s2_metric_scale (type $t3) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (param $p16 i32) (param $p17 i32) (param $p18 i32)
    (drop
      (call $metric_scale_rows
        (local.get $p0)
        (local.get $p1)
        (local.get $p2)
        (local.get $p3)
        (local.get $p4)
        (local.get $p5)
        (local.get $p6)
        (local.get $p7)
        (local.get $p8)
        (local.get $p9)
        (local.get $p10)
        (local.get $p11)
        (local.get $p12)
        (local.get $p13)
        (local.get $p14)
        (local.get $p15)
        (local.get $p16)
        (local.get $p17)
        (local.get $p18)
        (i32.const -4)
        (local.get $p1)
        (i32.const 0)
        (local.get $p1)
        (i32.const 0)
        (i32.const 0)
        (i32.const 0)
        (i32.const 0)
        (i32.const 0))))
  (func $metric_scale_rows (type $t4) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (param $p16 i32) (param $p17 i32) (param $p18 i32) (param $p19 i32) (param $p20 i32) (param $p21 i32) (param $p22 i32) (param $p23 i32) (param $p24 i32) (param $p25 i32) (param $p26 i32) (param $p27 i32) (result i32)
    (local $l28 i32) (local $l29 i32) (local $l30 i32) (local $l31 i32) (local $l32 i32) (local $l33 i32) (local $l34 i32) (local $l35 i32) (local $l36 i32) (local $l37 i32) (local $l38 i32) (local $l39 i32) (local $l40 i32) (local $l41 i32) (local $l42 i32) (local $l43 i32) (local $l44 i32) (local $l45 i32) (local $l46 i32) (local $l47 i32) (local $l48 i32) (local $l49 i32) (local $l50 i32) (local $l51 i32) (local $l52 v128) (local $l53 i32) (local $l54 i32) (local $l55 i32) (local $l56 i32) (local $l57 i32) (local $l58 i32) (local $l59 i32) (local $l60 i32) (local $l61 i32) (local $l62 i32) (local $l63 i32) (local $l64 i32) (local $l65 i32) (local $l66 i32) (local $l67 v128) (local $l68 i32) (local $l69 i32) (local $l70 i32) (local $l71 i32) (local $l72 i32) (local $l73 i32) (local $l74 i32) (local $l75 i32) (local $l76 i32) (local $l77 i32) (local $l78 i32) (local $l79 i32) (local $l80 i32) (local $l81 i32) (local $l82 i32) (local $l83 i32) (local $l84 i32) (local $l85 i32) (local $l86 i32) (local $l87 i32) (local $l88 i32) (local $l89 i32) (local $l90 i32) (local $l91 i32) (local $l92 i32) (local $l93 i32) (local $l94 i32) (local $l95 i32) (local $l96 i32) (local $l97 i32) (local $l98 i32) (local $l99 i32) (local $l100 i32) (local $l101 i32) (local $l102 i32) (local $l103 i32) (local $l104 i32) (local $l105 i32) (local $l106 i32) (local $l107 i32) (local $l108 i32) (local $l109 i32) (local $l110 i32) (local $l111 i32) (local $l112 i32) (local $l113 i32) (local $l114 i32) (local $l115 i32) (local $l116 i32) (local $l117 i32) (local $l118 i32) (local $l119 i32) (local $l120 i32) (local $l121 v128) (local $l122 i32) (local $l123 i32) (local $l124 i32) (local $l125 i32) (local $l126 i32) (local $l127 i32) (local $l128 v128) (local $l129 i32) (local $l130 i32) (local $l131 i32) (local $l132 i32) (local $l133 v128) (local $l134 v128) (local $l135 v128) (local $l136 v128) (local $l137 i32) (local $l138 i32) (local $l139 i32) (local $l140 f32) (local $l141 f32) (local $l142 f32) (local $l143 v128) (local $l144 f32) (local $l145 v128) (local $l146 v128) (local $l147 v128) (local $l148 v128) (local $l149 v128) (local $l150 v128) (local $l151 v128) (local $l152 v128) (local $l153 v128) (local $l154 v128) (local $l155 v128) (local $l156 v128) (local $l157 v128) (local $l158 v128) (local $l159 v128) (local $l160 v128) (local $l161 v128) (local $l162 v128) (local $l163 v128) (local $l164 v128) (local $l165 v128) (local $l166 f64) (local $l167 f64) (local $l168 f64) (local $l169 f64) (local $l170 f64) (local $l171 f64) (local $l172 f64) (local $l173 f64) (local $l174 f64) (local $l175 f64)
    (global.set $__stack_pointer
      (local.tee $l28
        (i32.sub
          (global.get $__stack_pointer)
          (i32.const 1984))))
    (i32.store offset=524
      (local.get $l28)
      (local.get $p11))
    (i32.store offset=520
      (local.get $l28)
      (local.get $p10))
    (i32.store offset=516
      (local.get $l28)
      (local.get $p9))
    (i32.store offset=72
      (local.get $l28)
      (local.get $p5))
    (i32.store offset=76
      (local.get $l28)
      (local.get $p24))
    (i32.store offset=68
      (local.get $l28)
      (local.get $p25))
    (i32.store offset=64
      (local.get $l28)
      (local.get $p6))
    (i32.store offset=60
      (local.get $l28)
      (local.get $p27))
    (i32.store offset=56
      (local.get $l28)
      (local.get $p16))
    (local.set $l31
      (select
        (local.tee $p11
          (i32.add
            (local.get $p13)
            (local.tee $l29
              (i32.shl
                (local.get $p0)
                (i32.const 6)))))
        (i32.const 0)
        (local.tee $l30
          (i32.and
            (local.get $p2)
            (i32.xor
              (local.get $p12)
              (i32.const -1))))))
    (local.set $l32
      (select
        (local.tee $p11
          (i32.add
            (local.get $p11)
            (local.get $l29)))
        (i32.const 0)
        (local.get $l30)))
    (local.set $l33
      (select
        (i32.add
          (local.get $p11)
          (local.get $l29))
        (local.get $p13)
        (local.get $l30)))
    (local.set $l34
      (select
        (i32.const 2)
        (i32.const 1)
        (local.get $p24)))
    (local.set $l37
      (i32.and
        (local.tee $l36
          (select
            (local.tee $l35
              (i32.mul
                (local.get $p0)
                (i32.const 6)))
            (i32.const 1)
            (i32.gt_s
              (local.get $l35)
              (i32.const 1))))
        (i32.const 2147483644)))
    (local.set $l38
      (i32.add
        (local.get $p26)
        (select
          (i32.mul
            (local.get $p0)
            (i32.const 192))
          (i32.const 0)
          (local.get $l30))))
    (local.set $l39
      (select
        (local.get $p13)
        (i32.const 0)
        (local.get $l30)))
    (local.set $l40
      (i32.mul
        (local.get $p0)
        (i32.const 156)))
    (local.set $l41
      (i32.shl
        (local.get $p0)
        (i32.const 4)))
    (local.set $l42
      (i32.shl
        (local.tee $p27
          (i32.shl
            (local.get $p0)
            (i32.const 2)))
        (i32.const 2)))
    (local.set $l43
      (i32.ne
        (local.get $p19)
        (i32.const -4)))
    (local.set $l44
      (i32.const 0))
    (loop $L0
      (local.set $p13
        (local.get $l38))
      (block $B1
        (br_if $B1
          (local.get $l44))
        (local.set $p13
          (local.get $l33)))
      (i32.store offset=4
        (local.tee $p24
          (i32.add
            (i32.add
              (local.get $l28)
              (i32.const 480))
            (i32.mul
              (local.get $l44)
              (i32.const 12))))
        (local.tee $p11
          (i32.add
            (local.get $p13)
            (local.tee $p6
              (i32.shl
                (local.get $l41)
                (i32.const 2))))))
      (i32.store
        (local.get $p24)
        (local.get $p13))
      (i32.store offset=8
        (local.get $p24)
        (local.tee $p13
          (i32.add
            (local.get $p11)
            (local.get $p6))))
      (i32.store
        (i32.add
          (i32.add
            (local.get $l28)
            (i32.const 88))
          (local.tee $l45
            (i32.shl
              (local.get $l44)
              (i32.const 2))))
        (local.tee $p13
          (i32.add
            (local.get $p13)
            (local.get $p6))))
      (i32.store
        (i32.add
          (i32.add
            (local.get $l28)
            (i32.const 80))
          (local.get $l45))
        (local.tee $p13
          (i32.add
            (local.get $p13)
            (local.get $l42))))
      (local.set $p10
        (i32.const 0))
      (local.set $l47
        (i32.or
          (i32.ne
            (local.get $l44)
            (i32.const 0))
          (local.tee $l46
            (i32.lt_s
              (local.get $p0)
              (i32.const 1)))))
      (local.set $p25
        (i32.add
          (local.get $p13)
          (local.get $l42)))
      (local.set $l48
        (i32.add
          (i32.add
            (local.get $l28)
            (i32.const 96))
          (local.tee $p13
            (i32.mul
              (local.get $l44)
              (i32.const 60)))))
      (local.set $l49
        (i32.add
          (i32.add
            (local.get $l28)
            (i32.const 224))
          (local.get $p13)))
      (local.set $l50
        (i32.add
          (i32.add
            (local.get $l28)
            (i32.const 352))
          (local.get $p13)))
      (loop $L2
        (local.set $p11
          (i32.add
            (local.get $l50)
            (local.tee $p13
              (i32.mul
                (local.get $p10)
                (i32.const 20)))))
        (block $B3
          (block $B4
            (br_if $B4
              (i32.and
                (local.tee $p24
                  (i32.shl
                    (i32.const 1)
                    (local.get $p10)))
                (local.get $p2)))
            (i32.store offset=16
              (local.get $p11)
              (i32.const 0))
            (v128.store align=4
              (local.get $p11)
              (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
            (br $B3))
          (local.set $p9
            (i32.add
              (local.get $l48)
              (local.get $p13)))
          (local.set $p5
            (i32.add
              (local.get $l49)
              (local.get $p13)))
          (local.set $p26
            (i32.and
              (local.get $p24)
              (local.get $p12)))
          (block $B5
            (br_if $B5
              (local.get $l43))
            (block $B6
              (block $B7
                (br_if $B7
                  (local.get $p26))
                (i32.store
                  (local.get $p11)
                  (local.get $p25))
                (i32.store
                  (local.get $p5)
                  (local.tee $p13
                    (i32.add
                      (local.get $p25)
                      (local.get $p6))))
                (i32.store
                  (local.get $p9)
                  (local.tee $p24
                    (i32.add
                      (local.get $p13)
                      (i32.shl
                        (local.get $l35)
                        (i32.const 2)))))
                (local.set $p16
                  (i32.add
                    (local.get $p24)
                    (local.get $p27)))
                (block $B8
                  (br_if $B8
                    (i32.eqz
                      (local.get $l47)))
                  (local.set $p25
                    (local.get $p16))
                  (br $B6))
                (local.set $p24
                  (i32.const 0))
                (block $B9
                  (br_if $B9
                    (i32.lt_s
                      (local.get $l35)
                      (i32.const 4)))
                  (local.set $p24
                    (local.get $l37))
                  (loop $L10
                    (v128.store align=4
                      (local.get $p13)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 16)))
                    (br_if $L10
                      (local.tee $p24
                        (i32.add
                          (local.get $p24)
                          (i32.const -4)))))
                  (local.set $p24
                    (local.get $l37))
                  (br_if $B9
                    (i32.ne
                      (local.get $l36)
                      (local.get $l37)))
                  (local.set $p25
                    (local.get $p16))
                  (br $B6))
                (local.set $p13
                  (i32.add
                    (i32.add
                      (local.get $p25)
                      (local.get $l29))
                    (i32.shl
                      (local.get $p24)
                      (i32.const 2))))
                (local.set $p24
                  (i32.sub
                    (local.get $l36)
                    (local.get $p24)))
                (loop $L11
                  (i32.store
                    (local.get $p13)
                    (i32.const 0))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 4)))
                  (br_if $L11
                    (local.tee $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const -1)))))
                (local.set $p25
                  (local.get $p16))
                (br $B6))
              (i32.store
                (local.get $p11)
                (i32.const 0)))
            (i32.store offset=4
              (local.get $p11)
              (local.get $p25))
            (i32.store offset=4
              (local.get $p5)
              (local.tee $p13
                (i32.add
                  (local.get $p25)
                  (local.get $p6))))
            (i32.store offset=4
              (local.get $p9)
              (local.tee $p16
                (i32.add
                  (local.get $p13)
                  (local.tee $l51
                    (i32.shl
                      (local.get $l35)
                      (i32.const 2))))))
            (block $B12
              (br_if $B12
                (local.get $l46))
              (local.set $p24
                (i32.const 0))
              (block $B13
                (br_if $B13
                  (i32.lt_s
                    (local.get $l35)
                    (i32.const 4)))
                (local.set $p24
                  (local.get $l37))
                (loop $L14
                  (v128.store align=4
                    (local.get $p13)
                    (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 16)))
                  (br_if $L14
                    (local.tee $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const -4)))))
                (local.set $p24
                  (local.get $l37))
                (br_if $B12
                  (i32.eq
                    (local.get $l36)
                    (local.get $l37))))
              (local.set $p13
                (i32.add
                  (i32.add
                    (local.get $p25)
                    (local.get $l29))
                  (i32.shl
                    (local.get $p24)
                    (i32.const 2))))
              (local.set $p24
                (i32.sub
                  (local.get $l36)
                  (local.get $p24)))
              (loop $L15
                (i32.store
                  (local.get $p13)
                  (i32.const 0))
                (local.set $p13
                  (i32.add
                    (local.get $p13)
                    (i32.const 4)))
                (br_if $L15
                  (local.tee $p24
                    (i32.add
                      (local.get $p24)
                      (i32.const -1))))))
            (local.set $p16
              (i32.add
                (local.get $p16)
                (local.get $p27)))
            (block $B16
              (block $B17
                (br_if $B17
                  (local.get $p26))
                (i32.store offset=8
                  (local.get $p11)
                  (local.get $p16))
                (i32.store offset=8
                  (local.get $p5)
                  (local.tee $p13
                    (i32.add
                      (local.get $p16)
                      (local.get $p6))))
                (i32.store offset=8
                  (local.get $p9)
                  (local.tee $p24
                    (i32.add
                      (local.get $p13)
                      (local.get $l51))))
                (local.set $p16
                  (i32.add
                    (local.get $p24)
                    (local.get $p27)))
                (br_if $B16
                  (local.get $l47))
                (local.set $p24
                  (i32.const 0))
                (block $B18
                  (br_if $B18
                    (i32.lt_s
                      (local.get $l35)
                      (i32.const 4)))
                  (local.set $p24
                    (local.get $l37))
                  (loop $L19
                    (v128.store align=4
                      (local.get $p13)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 16)))
                    (br_if $L19
                      (local.tee $p24
                        (i32.add
                          (local.get $p24)
                          (i32.const -4)))))
                  (local.set $p24
                    (local.get $l37))
                  (br_if $B16
                    (i32.eq
                      (local.get $l36)
                      (local.get $l37))))
                (local.set $p13
                  (i32.add
                    (i32.add
                      (local.get $p25)
                      (local.get $l40))
                    (i32.shl
                      (local.get $p24)
                      (i32.const 2))))
                (local.set $p24
                  (i32.sub
                    (local.get $l36)
                    (local.get $p24)))
                (loop $L20
                  (i32.store
                    (local.get $p13)
                    (i32.const 0))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 4)))
                  (br_if $L20
                    (local.tee $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const -1))))
                  (br $B16)))
              (i32.store offset=8
                (local.get $p11)
                (i32.const 0)))
            (i32.store offset=12
              (local.get $p11)
              (local.get $p16))
            (i32.store offset=12
              (local.get $p5)
              (local.tee $p13
                (i32.add
                  (local.get $p16)
                  (local.get $p6))))
            (i32.store offset=12
              (local.get $p9)
              (local.tee $p24
                (i32.add
                  (local.get $p13)
                  (local.get $l51))))
            (local.set $p25
              (i32.add
                (local.get $p24)
                (local.get $p27)))
            (block $B21
              (br_if $B21
                (local.get $l46))
              (local.set $p24
                (i32.const 0))
              (block $B22
                (br_if $B22
                  (i32.lt_s
                    (local.get $l35)
                    (i32.const 4)))
                (local.set $p24
                  (local.get $l37))
                (loop $L23
                  (v128.store align=4
                    (local.get $p13)
                    (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 16)))
                  (br_if $L23
                    (local.tee $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const -4)))))
                (local.set $p24
                  (local.get $l37))
                (br_if $B21
                  (i32.eq
                    (local.get $l36)
                    (local.get $l37))))
              (local.set $p13
                (i32.add
                  (i32.add
                    (local.get $p16)
                    (local.get $l29))
                  (i32.shl
                    (local.get $p24)
                    (i32.const 2))))
              (local.set $p24
                (i32.sub
                  (local.get $l36)
                  (local.get $p24)))
              (loop $L24
                (i32.store
                  (local.get $p13)
                  (i32.const 0))
                (local.set $p13
                  (i32.add
                    (local.get $p13)
                    (i32.const 4)))
                (br_if $L24
                  (local.tee $p24
                    (i32.add
                      (local.get $p24)
                      (i32.const -1))))))
            (i32.store offset=16
              (local.get $p11)
              (local.get $p25))
            (i32.store offset=16
              (local.get $p5)
              (local.tee $p13
                (i32.add
                  (local.get $p25)
                  (local.get $p6))))
            (i32.store offset=16
              (local.get $p9)
              (local.tee $p24
                (i32.add
                  (local.get $p13)
                  (local.get $l51))))
            (local.set $p25
              (i32.add
                (local.get $p24)
                (local.get $p27)))
            (br_if $B3
              (local.get $l46))
            (local.set $p24
              (i32.const 0))
            (block $B25
              (br_if $B25
                (i32.lt_s
                  (local.get $l35)
                  (i32.const 4)))
              (local.set $p24
                (local.get $l37))
              (loop $L26
                (v128.store align=4
                  (local.get $p13)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $p13
                  (i32.add
                    (local.get $p13)
                    (i32.const 16)))
                (br_if $L26
                  (local.tee $p24
                    (i32.add
                      (local.get $p24)
                      (i32.const -4)))))
              (local.set $p24
                (local.get $l37))
              (br_if $B3
                (i32.eq
                  (local.get $l36)
                  (local.get $l37))))
            (local.set $p13
              (i32.add
                (i32.add
                  (local.get $p16)
                  (local.get $l40))
                (i32.shl
                  (local.get $p24)
                  (i32.const 2))))
            (local.set $p24
              (i32.sub
                (local.get $l36)
                (local.get $p24)))
            (loop $L27
              (i32.store
                (local.get $p13)
                (i32.const 0))
              (local.set $p13
                (i32.add
                  (local.get $p13)
                  (i32.const 4)))
              (br_if $L27
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (i32.const -1))))
              (br $B3)))
          (block $B28
            (br_if $B28
              (local.get $p26))
            (i32.store
              (local.get $p11)
              (local.get $p25))
            (i32.store
              (local.get $p5)
              (local.tee $p24
                (i32.add
                  (local.get $p25)
                  (local.get $p6))))
            (i32.store
              (local.get $p9)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.tee $p13
                    (i32.shl
                      (local.get $l35)
                      (i32.const 2))))))
            (i32.store offset=4
              (local.get $p11)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p27))))
            (i32.store offset=4
              (local.get $p5)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p6))))
            (i32.store offset=4
              (local.get $p9)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p13))))
            (i32.store offset=8
              (local.get $p11)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p27))))
            (i32.store offset=8
              (local.get $p5)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p6))))
            (i32.store offset=8
              (local.get $p9)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p13))))
            (i32.store offset=12
              (local.get $p11)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p27))))
            (i32.store offset=12
              (local.get $p5)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p6))))
            (i32.store offset=12
              (local.get $p9)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p13))))
            (i32.store offset=16
              (local.get $p11)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p27))))
            (i32.store offset=16
              (local.get $p5)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p6))))
            (i32.store offset=16
              (local.get $p9)
              (local.tee $p13
                (i32.add
                  (local.get $p24)
                  (local.get $p13))))
            (local.set $p25
              (i32.add
                (local.get $p13)
                (local.get $p27)))
            (br $B3))
          (i32.store offset=4
            (local.get $p11)
            (local.get $p25))
          (i32.store
            (local.get $p11)
            (i32.const 0))
          (i32.store offset=8
            (local.get $p11)
            (i32.const 0))
          (i32.store offset=4
            (local.get $p5)
            (local.tee $p24
              (i32.add
                (local.get $p25)
                (local.get $p6))))
          (i32.store offset=4
            (local.get $p9)
            (local.tee $p24
              (i32.add
                (local.get $p24)
                (local.tee $p13
                  (i32.shl
                    (local.get $l35)
                    (i32.const 2))))))
          (i32.store offset=12
            (local.get $p11)
            (local.tee $p24
              (i32.add
                (local.get $p24)
                (local.get $p27))))
          (i32.store offset=12
            (local.get $p5)
            (local.tee $p24
              (i32.add
                (local.get $p24)
                (local.get $p6))))
          (i32.store offset=12
            (local.get $p9)
            (local.tee $p24
              (i32.add
                (local.get $p24)
                (local.get $p13))))
          (i32.store offset=16
            (local.get $p11)
            (local.tee $p24
              (i32.add
                (local.get $p24)
                (local.get $p27))))
          (i32.store offset=16
            (local.get $p5)
            (local.tee $p24
              (i32.add
                (local.get $p24)
                (local.get $p6))))
          (i32.store offset=16
            (local.get $p9)
            (local.tee $p13
              (i32.add
                (local.get $p24)
                (local.get $p13))))
          (local.set $p25
            (i32.add
              (local.get $p13)
              (local.get $p27))))
        (br_if $L2
          (i32.ne
            (local.tee $p10
              (i32.add
                (local.get $p10)
                (i32.const 1)))
            (i32.const 3))))
      (block $B29
        (br_if $B29
          (local.get $l43))
        (v128.store offset=112 align=8
          (local.tee $p13
            (i32.load
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 56))
                (local.get $l45))))
          (local.tee $l52
            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
        (v128.store offset=96 align=8
          (local.get $p13)
          (local.get $l52))
        (v128.store offset=80 align=8
          (local.get $p13)
          (local.get $l52))
        (v128.store offset=64 align=8
          (local.get $p13)
          (local.get $l52))
        (v128.store offset=48 align=8
          (local.get $p13)
          (local.get $l52))
        (v128.store offset=32 align=8
          (local.get $p13)
          (local.get $l52))
        (v128.store offset=16 align=8
          (local.get $p13)
          (local.get $l52))
        (v128.store align=8
          (local.get $p13)
          (local.get $l52))
        (v128.store offset=128 align=8
          (local.get $p13)
          (local.get $l52)))
      (br_if $L0
        (i32.ne
          (local.tee $l44
            (i32.add
              (local.get $l44)
              (i32.const 1)))
          (local.get $l34))))
    (i32.store offset=512
      (local.get $l28)
      (local.get $l32))
    (i32.store offset=508
      (local.get $l28)
      (local.get $l31))
    (i32.store offset=504
      (local.get $l28)
      (local.get $l39))
    (block $B30
      (br_if $B30
        (i32.ge_s
          (local.get $p19)
          (local.get $p20)))
      (local.set $l53
        (i32.mul
          (local.get $p0)
          (i32.add
            (local.tee $p13
              (i32.shl
                (local.get $p19)
                (i32.const 2)))
            (i32.shl
              (local.get $p1)
              (i32.const 2)))))
      (local.set $l45
        (select
          (local.get $p0)
          (i32.const 8)
          (i32.lt_s
            (local.get $p0)
            (i32.const 8))))
      (local.set $l42
        (i32.add
          (local.get $p8)
          (i32.const 24)))
      (local.set $l54
        (i32.and
          (local.get $p0)
          (i32.const 1)))
      (local.set $l55
        (i32.and
          (local.get $p0)
          (i32.const 2147483644)))
      (local.set $l56
        (i32.shl
          (local.tee $p24
            (i32.mul
              (local.get $p1)
              (local.get $p0)))
          (i32.const 3)))
      (local.set $l57
        (i32.mul
          (local.get $p0)
          (i32.const 20)))
      (local.set $l58
        (i32.mul
          (local.get $p0)
          (i32.const 12)))
      (local.set $l59
        (i32.shl
          (local.get $p0)
          (i32.const 3)))
      (local.set $l40
        (i32.add
          (local.get $p0)
          (i32.const -7)))
      (local.set $l61
        (i32.sub
          (local.tee $l60
            (i32.and
              (local.get $p0)
              (i32.const 3)))
          (local.get $p0)))
      (local.set $l63
        (i32.sub
          (i32.const 0)
          (local.tee $l62
            (i32.shl
              (local.get $p0)
              (i32.const 2)))))
      (local.set $l64
        (i32.add
          (local.get $p14)
          (local.tee $p11
            (i32.shl
              (i32.mul
                (local.get $p19)
                (local.get $p0))
              (i32.const 3)))))
      (local.set $l65
        (i32.add
          (local.get $p15)
          (local.get $p11)))
      (local.set $l66
        (i32.shl
          (i32.mul
            (i32.add
              (local.get $p19)
              (local.get $p1))
            (local.get $p0))
          (i32.const 2)))
      (local.set $l67
        (i32x4.splat
          (local.get $p0)))
      (local.set $l68
        (i32.add
          (local.get $l28)
          (i32.const 1476)))
      (local.set $l69
        (i32.add
          (local.get $l28)
          (i32.const 1444)))
      (local.set $l70
        (i32.add
          (local.get $l28)
          (i32.const 1412)))
      (local.set $l71
        (i32.add
          (local.get $l28)
          (i32.const 1380)))
      (local.set $l72
        (i32.add
          (local.get $l28)
          (i32.const 1348)))
      (local.set $l73
        (i32.add
          (local.get $l28)
          (i32.const 1316)))
      (local.set $l74
        (i32.add
          (local.get $l28)
          (i32.const 1284)))
      (local.set $l75
        (i32.add
          (local.get $l28)
          (i32.const 1252)))
      (local.set $l76
        (i32.add
          (local.get $l28)
          (i32.const 1220)))
      (local.set $l77
        (i32.add
          (local.get $l28)
          (i32.const 1188)))
      (local.set $l78
        (i32.add
          (local.get $l28)
          (i32.const 1156)))
      (local.set $l79
        (i32.add
          (local.get $l28)
          (i32.const 1124)))
      (local.set $l80
        (i32.add
          (local.get $l28)
          (i32.const 1092)))
      (local.set $l81
        (i32.add
          (local.get $l28)
          (i32.const 1060)))
      (local.set $l82
        (i32.add
          (local.get $l28)
          (i32.const 1028)))
      (local.set $l83
        (i32.add
          (local.get $l28)
          (i32.const 996)))
      (local.set $l84
        (i32.add
          (local.get $l28)
          (i32.const 964)))
      (local.set $l85
        (i32.add
          (local.get $l28)
          (i32.const 932)))
      (local.set $l86
        (i32.add
          (local.get $l28)
          (i32.const 900)))
      (local.set $l87
        (i32.add
          (local.get $l28)
          (i32.const 868)))
      (local.set $l88
        (i32.add
          (local.get $l28)
          (i32.const 836)))
      (local.set $l89
        (i32.add
          (local.get $l28)
          (i32.const 804)))
      (local.set $l90
        (i32.add
          (local.get $l28)
          (i32.const 772)))
      (local.set $l91
        (i32.add
          (local.get $l28)
          (i32.const 740)))
      (local.set $l92
        (i32.add
          (local.get $l28)
          (i32.const 708)))
      (local.set $l93
        (i32.add
          (local.get $l28)
          (i32.const 676)))
      (local.set $l94
        (i32.add
          (local.get $l28)
          (i32.const 644)))
      (local.set $l95
        (i32.add
          (local.get $l28)
          (i32.const 612)))
      (local.set $l96
        (i32.add
          (local.get $l28)
          (i32.const 580)))
      (local.set $l97
        (i32.or
          (i32.add
            (local.get $l28)
            (i32.const 544))
          (i32.const 4)))
      (local.set $l98
        (i32.lt_s
          (local.get $p0)
          (i32.const -3)))
      (local.set $l100
        (i32.lt_u
          (i32.add
            (local.tee $l99
              (i32.shl
                (local.get $p24)
                (i32.const 2)))
            (i32.const -1))
          (i32.const 15)))
      (local.set $l101
        (local.get $p19))
      (local.set $l103
        (local.tee $l102
          (i32.mul
            (local.get $p0)
            (i32.add
              (i32.shl
                (local.get $p1)
                (i32.const 3))
              (local.get $p13)))))
      (local.set $l104
        (i32.const 0))
      (loop $L31
        (local.set $l105
          (i32.add
            (local.get $p19)
            (i32.const 4)))
        (block $B32
          (br_if $B32
            (i32.ge_s
              (local.get $p23)
              (local.get $p1)))
          (br_if $B32
            (i32.gt_s
              (local.get $p23)
              (local.get $l105)))
          (loop $L33
            (local.set $l106
              (select
                (local.tee $p13
                  (i32.sub
                    (local.get $p1)
                    (local.get $p23)))
                (i32.const 4)
                (i32.lt_s
                  (local.get $p13)
                  (i32.const 4))))
            (block $B34
              (block $B35
                (br_if $B35
                  (local.tee $l107
                    (i32.lt_s
                      (local.get $p13)
                      (i32.const 1))))
                (local.set $p25
                  (i32.const 0))
                (loop $L36
                  (local.set $p9
                    (i32.sub
                      (local.tee $p13
                        (i32.add
                          (local.get $p25)
                          (local.get $p23)))
                      (local.get $p21)))
                  (local.set $p5
                    (i32.mul
                      (i32.rem_s
                        (local.get $p13)
                        (i32.const 16))
                      (local.get $p0)))
                  (block $B37
                    (br_if $B37
                      (i32.eqz
                        (local.get $l30)))
                    (call $positive_row
                      (local.get $p3)
                      (local.get $p4)
                      (local.get $p9)
                      (local.get $p0)
                      (local.get $p22)
                      (i32.add
                        (local.get $l28)
                        (i32.const 504))
                      (local.get $p5)
                      (local.get $p7)
                      (local.get $p17)
                      (local.get $p18)))
                  (local.set $p13
                    (i32.add
                      (local.get $l28)
                      (i32.const 72)))
                  (local.set $p24
                    (i32.add
                      (local.get $l28)
                      (i32.const 64)))
                  (local.set $p11
                    (i32.add
                      (local.get $l28)
                      (i32.const 480)))
                  (local.set $p10
                    (local.get $l34))
                  (loop $L38
                    (call $positive_row
                      (i32.load
                        (local.get $p13))
                      (i32.load
                        (local.get $p24))
                      (local.get $p9)
                      (local.get $p0)
                      (local.get $p22)
                      (local.get $p11)
                      (local.get $p5)
                      (local.get $p7)
                      (local.get $p17)
                      (local.get $p18))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const 12)))
                    (local.set $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const 4)))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 4)))
                    (br_if $L38
                      (local.tee $p10
                        (i32.add
                          (local.get $p10)
                          (i32.const -1)))))
                  (br_if $L36
                    (i32.ne
                      (local.tee $p25
                        (i32.add
                          (local.get $p25)
                          (i32.const 1)))
                      (local.get $l106))))
                (local.set $l108
                  (local.get $l106))
                (br $B34))
              (local.set $l108
                (select
                  (local.get $l106)
                  (i32.const 1)
                  (i32.gt_s
                    (local.get $l106)
                    (i32.const 1)))))
            (local.set $l109
              (i32.or
                (local.get $l107)
                (i32.lt_s
                  (local.get $p0)
                  (i32.const 1))))
            (local.set $l111
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 32))
                (local.tee $l110
                  (i32.shl
                    (select
                      (local.tee $l43
                        (i32.add
                          (local.get $l106)
                          (i32.const -1)))
                      (i32.const 2)
                      (i32.lt_s
                        (local.get $l43)
                        (i32.const 2)))
                    (i32.const 2)))))
            (local.set $l113
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 32))
                (local.tee $l112
                  (i32.shl
                    (select
                      (local.get $l43)
                      (i32.const 1)
                      (i32.lt_s
                        (local.get $l43)
                        (i32.const 1)))
                    (i32.const 2)))))
            (local.set $l115
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 32))
                (local.tee $l114
                  (i32.shl
                    (i32.and
                      (local.get $l43)
                      (i32.shr_s
                        (local.get $l43)
                        (i32.const 31)))
                    (i32.const 2)))))
            (local.set $l33
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 16))
                (local.get $l110)))
            (local.set $l31
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 16))
                (local.get $l112)))
            (local.set $l32
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 16))
                (local.get $l114)))
            (local.set $l44
              (i32.and
                (local.get $l106)
                (i32.const 3)))
            (local.set $l35
              (i32.and
                (local.get $l106)
                (i32.const -2)))
            (local.set $l38
              (i32.and
                (local.get $l106)
                (i32.const 1)))
            (local.set $l116
              (i32.and
                (local.get $l108)
                (i32.const -4)))
            (local.set $l117
              (i32.mul
                (local.get $l62)
                (local.get $p23)))
            (local.set $l118
              (i32.const 0))
            (local.set $l37
              (i32.sub
                (i32.const 0)
                (i32.and
                  (local.get $l106)
                  (i32.const -4))))
            (local.set $l120
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 32))
                (local.tee $l119
                  (i32.shl
                    (local.get $l43)
                    (i32.const 2)))))
            (local.set $l39
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 16))
                (local.get $l119)))
            (local.set $l121
              (i32x4.splat
                (local.get $p23)))
            (loop $L39
              (block $B40
                (br_if $B40
                  (i32.eqz
                    (i32.and
                      (local.tee $p13
                        (i32.shl
                          (i32.const 1)
                          (local.get $l118)))
                      (local.get $p2))))
                (local.set $l122
                  (i32.and
                    (local.get $p13)
                    (local.get $p12)))
                (local.set $l123
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (i32.const 504))
                    (local.tee $p13
                      (i32.shl
                        (local.get $l118)
                        (i32.const 2)))))
                (local.set $l124
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (i32.const 516))
                    (local.get $p13)))
                (local.set $l125
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (i32.const 352))
                    (i32.mul
                      (local.get $l118)
                      (i32.const 20))))
                (local.set $l126
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (i32.const 480))
                    (local.get $p13)))
                (local.set $l127
                  (i32.const 0))
                (loop $L41
                  (block $B42
                    (br_if $B42
                      (local.get $l107))
                    (local.set $p9
                      (i32.load
                        (i32.add
                          (local.get $l126)
                          (i32.mul
                            (local.get $l127)
                            (i32.const 12)))))
                    (block $B43
                      (br_if $B43
                        (local.get $l122))
                      (local.set $p25
                        (i32.load
                          (local.get $l123)))
                      (local.set $p24
                        (i32.const 0))
                      (block $B44
                        (br_if $B44
                          (i32.lt_u
                            (local.get $l108)
                            (i32.const 4)))
                        (local.set $l128
                          (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                        (local.set $p13
                          (i32.add
                            (local.get $l28)
                            (i32.const 16)))
                        (local.set $p24
                          (i32.add
                            (local.get $l28)
                            (i32.const 32)))
                        (local.set $p11
                          (local.get $l116))
                        (loop $L45
                          (v128.store
                            (local.get $p13)
                            (i32x4.add
                              (i32x4.splat
                                (local.get $p9))
                              (local.tee $l52
                                (i32x4.shl
                                  (i32x4.mul
                                    (i32x4.replace_lane 3
                                      (i32x4.replace_lane 2
                                        (i32x4.replace_lane 1
                                          (i32x4.splat
                                            (i32.rem_s
                                              (i32x4.extract_lane 0
                                                (local.tee $l52
                                                  (i32x4.add
                                                    (local.get $l128)
                                                    (local.get $l121))))
                                              (i32.const 16)))
                                          (i32.rem_s
                                            (i32x4.extract_lane 1
                                              (local.get $l52))
                                            (i32.const 16)))
                                        (i32.rem_s
                                          (i32x4.extract_lane 2
                                            (local.get $l52))
                                          (i32.const 16)))
                                      (i32.rem_s
                                        (i32x4.extract_lane 3
                                          (local.get $l52))
                                        (i32.const 16)))
                                    (local.get $l67))
                                  (i32.const 2)))))
                          (v128.store
                            (local.get $p24)
                            (i32x4.add
                              (i32x4.splat
                                (local.get $p25))
                              (local.get $l52)))
                          (local.set $p24
                            (i32.add
                              (local.get $p24)
                              (i32.const 16)))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 16)))
                          (local.set $l128
                            (i32x4.add
                              (local.get $l128)
                              (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                          (br_if $L45
                            (local.tee $p11
                              (i32.add
                                (local.get $p11)
                                (i32.const -4)))))
                        (local.set $p24
                          (local.get $l116))
                        (br_if $B42
                          (i32.eq
                            (local.get $l108)
                            (local.get $l116))))
                      (local.set $p13
                        (i32.add
                          (local.get $p23)
                          (local.get $p24)))
                      (local.set $p10
                        (i32.sub
                          (local.get $l108)
                          (local.get $p24)))
                      (local.set $p24
                        (i32.add
                          (i32.add
                            (local.get $l28)
                            (i32.const 32))
                          (local.tee $p11
                            (i32.shl
                              (local.get $p24)
                              (i32.const 2)))))
                      (local.set $p11
                        (i32.add
                          (i32.add
                            (local.get $l28)
                            (i32.const 16))
                          (local.get $p11)))
                      (loop $L46
                        (i32.store
                          (local.get $p11)
                          (i32.add
                            (local.get $p9)
                            (local.tee $p5
                              (i32.shl
                                (i32.mul
                                  (i32.rem_s
                                    (local.get $p13)
                                    (i32.const 16))
                                  (local.get $p0))
                                (i32.const 2)))))
                        (i32.store
                          (local.get $p24)
                          (i32.add
                            (local.get $p25)
                            (local.get $p5)))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 1)))
                        (local.set $p24
                          (i32.add
                            (local.get $p24)
                            (i32.const 4)))
                        (local.set $p11
                          (i32.add
                            (local.get $p11)
                            (i32.const 4)))
                        (br_if $L46
                          (local.tee $p10
                            (i32.add
                              (local.get $p10)
                              (i32.const -1))))
                        (br $B42)))
                    (local.set $p10
                      (i32.load
                        (local.get $l124)))
                    (local.set $p11
                      (i32.const 0))
                    (block $B47
                      (br_if $B47
                        (i32.lt_u
                          (local.get $l108)
                          (i32.const 4)))
                      (local.set $l128
                        (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                      (local.set $p13
                        (i32.add
                          (local.get $l28)
                          (i32.const 16)))
                      (local.set $p24
                        (i32.add
                          (local.get $l28)
                          (i32.const 32)))
                      (local.set $p11
                        (local.get $l116))
                      (loop $L48
                        (v128.store
                          (local.get $p24)
                          (i32x4.add
                            (i32x4.splat
                              (local.get $p10))
                            (i32x4.shl
                              (i32x4.mul
                                (local.tee $l52
                                  (i32x4.add
                                    (local.get $l128)
                                    (local.get $l121)))
                                (local.get $l67))
                              (i32.const 2))))
                        (v128.store
                          (local.get $p13)
                          (i32x4.add
                            (i32x4.splat
                              (local.get $p9))
                            (i32x4.shl
                              (i32x4.mul
                                (i32x4.replace_lane 3
                                  (i32x4.replace_lane 2
                                    (i32x4.replace_lane 1
                                      (i32x4.splat
                                        (i32.rem_s
                                          (i32x4.extract_lane 0
                                            (local.get $l52))
                                          (i32.const 16)))
                                      (i32.rem_s
                                        (i32x4.extract_lane 1
                                          (local.get $l52))
                                        (i32.const 16)))
                                    (i32.rem_s
                                      (i32x4.extract_lane 2
                                        (local.get $l52))
                                      (i32.const 16)))
                                  (i32.rem_s
                                    (i32x4.extract_lane 3
                                      (local.get $l52))
                                    (i32.const 16)))
                                (local.get $l67))
                              (i32.const 2))))
                        (local.set $p24
                          (i32.add
                            (local.get $p24)
                            (i32.const 16)))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 16)))
                        (local.set $l128
                          (i32x4.add
                            (local.get $l128)
                            (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                        (br_if $L48
                          (local.tee $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const -4)))))
                      (local.set $p11
                        (local.get $l116))
                      (br_if $B42
                        (i32.eq
                          (local.get $l108)
                          (local.get $l116))))
                    (local.set $p5
                      (i32.sub
                        (local.get $l108)
                        (local.get $p11)))
                    (local.set $p24
                      (i32.add
                        (local.get $p10)
                        (i32.mul
                          (local.get $l62)
                          (local.tee $p13
                            (i32.add
                              (local.get $p23)
                              (local.get $p11))))))
                    (local.set $p11
                      (i32.add
                        (i32.add
                          (local.get $l28)
                          (i32.const 16))
                        (local.tee $p10
                          (i32.shl
                            (local.get $p11)
                            (i32.const 2)))))
                    (local.set $p10
                      (i32.add
                        (i32.add
                          (local.get $l28)
                          (i32.const 32))
                        (local.get $p10)))
                    (loop $L49
                      (i32.store
                        (local.get $p10)
                        (local.get $p24))
                      (i32.store
                        (local.get $p11)
                        (i32.add
                          (local.get $p9)
                          (i32.shl
                            (i32.mul
                              (i32.rem_s
                                (local.get $p13)
                                (i32.const 16))
                              (local.get $p0))
                            (i32.const 2))))
                      (local.set $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const 4)))
                      (local.set $p10
                        (i32.add
                          (local.get $p10)
                          (i32.const 4)))
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 1)))
                      (local.set $p24
                        (i32.add
                          (local.get $p24)
                          (local.get $l62)))
                      (br_if $L49
                        (local.tee $p5
                          (i32.add
                            (local.get $p5)
                            (i32.const -1))))))
                  (block $B50
                    (br_if $B50
                      (i32.or
                        (local.get $l127)
                        (local.get $l122)))
                    (br_if $B50
                      (i32.or
                        (i32.eqz
                          (local.tee $p13
                            (i32.load
                              (local.get $l124))))
                        (local.get $l109)))
                    (local.set $p25
                      (i32.const 0))
                    (local.set $p10
                      (local.tee $p6
                        (i32.add
                          (local.get $l117)
                          (local.get $p13))))
                    (loop $L51
                      (local.set $p9
                        (i32.load
                          (i32.add
                            (i32.add
                              (local.get $l28)
                              (i32.const 32))
                            (i32.shl
                              (local.get $p25)
                              (i32.const 2)))))
                      (local.set $p11
                        (i32.const 0))
                      (block $B52
                        (block $B53
                          (br_if $B53
                            (i32.lt_u
                              (local.get $p0)
                              (i32.const 4)))
                          (local.set $p11
                            (i32.const 0))
                          (br_if $B53
                            (i32.gt_u
                              (i32.sub
                                (local.get $p9)
                                (i32.add
                                  (local.get $p6)
                                  (i32.mul
                                    (local.get $l62)
                                    (local.get $p25))))
                              (i32.const -16)))
                          (local.set $p13
                            (local.get $p9))
                          (local.set $p24
                            (local.get $p10))
                          (local.set $p11
                            (local.get $l55))
                          (loop $L54
                            (v128.store align=4
                              (local.get $p24)
                              (v128.load align=4
                                (local.get $p13)))
                            (local.set $p13
                              (i32.add
                                (local.get $p13)
                                (i32.const 16)))
                            (local.set $p24
                              (i32.add
                                (local.get $p24)
                                (i32.const 16)))
                            (br_if $L54
                              (local.tee $p11
                                (i32.add
                                  (local.get $p11)
                                  (i32.const -4)))))
                          (local.set $p11
                            (local.get $l55))
                          (br_if $B52
                            (i32.eq
                              (local.get $p0)
                              (local.get $l55))))
                        (local.set $p5
                          (local.get $p11))
                        (block $B55
                          (br_if $B55
                            (i32.eqz
                              (local.get $l60)))
                          (local.set $p5
                            (i32.add
                              (local.get $l60)
                              (local.get $p11)))
                          (local.set $p13
                            (i32.shl
                              (local.get $p11)
                              (i32.const 2)))
                          (local.set $p24
                            (local.get $l60))
                          (loop $L56
                            (f32.store
                              (i32.add
                                (local.get $p10)
                                (local.get $p13))
                              (f32.load
                                (i32.add
                                  (local.get $p9)
                                  (local.get $p13))))
                            (local.set $p13
                              (i32.add
                                (local.get $p13)
                                (i32.const 4)))
                            (br_if $L56
                              (local.tee $p24
                                (i32.add
                                  (local.get $p24)
                                  (i32.const -1))))))
                        (br_if $B52
                          (i32.gt_u
                            (i32.sub
                              (local.get $p11)
                              (local.get $p0))
                            (i32.const -4)))
                        (local.set $p13
                          (i32.shl
                            (local.get $p5)
                            (i32.const 2)))
                        (local.set $p5
                          (i32.sub
                            (local.get $p0)
                            (local.get $p5)))
                        (loop $L57
                          (f32.store
                            (local.tee $p24
                              (i32.add
                                (local.get $p10)
                                (local.get $p13)))
                            (f32.load
                              (local.tee $p11
                                (i32.add
                                  (local.get $p9)
                                  (local.get $p13)))))
                          (f32.store
                            (i32.add
                              (local.get $p24)
                              (i32.const 4))
                            (f32.load
                              (i32.add
                                (local.get $p11)
                                (i32.const 4))))
                          (f32.store
                            (i32.add
                              (local.get $p24)
                              (i32.const 8))
                            (f32.load
                              (i32.add
                                (local.get $p11)
                                (i32.const 8))))
                          (f32.store
                            (i32.add
                              (local.get $p24)
                              (i32.const 12))
                            (f32.load
                              (i32.add
                                (local.get $p11)
                                (i32.const 12))))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 16)))
                          (br_if $L57
                            (local.tee $p5
                              (i32.add
                                (local.get $p5)
                                (i32.const -4))))))
                      (local.set $p10
                        (i32.add
                          (local.get $p10)
                          (local.get $l62)))
                      (br_if $L51
                        (i32.ne
                          (local.tee $p25
                            (i32.add
                              (local.get $p25)
                              (i32.const 1)))
                          (local.get $l108)))))
                  (local.set $l129
                    (i32.add
                      (local.get $l125)
                      (i32.mul
                        (local.get $l127)
                        (i32.const 60))))
                  (local.set $l130
                    (i32.add
                      (i32.add
                        (local.get $l28)
                        (i32.const 80))
                      (local.tee $p13
                        (i32.shl
                          (local.get $l127)
                          (i32.const 2)))))
                  (local.set $l131
                    (i32.add
                      (i32.add
                        (local.get $l28)
                        (i32.const 88))
                      (local.get $p13)))
                  (local.set $l47
                    (i32.const 0))
                  (loop $L58
                    (block $B59
                      (br_if $B59
                        (i32.eqz
                          (local.tee $p10
                            (i32.load
                              (i32.add
                                (local.get $l129)
                                (i32.shl
                                  (local.get $l47)
                                  (i32.const 2)))))))
                      (local.set $p9
                        (i32.and
                          (local.get $l47)
                          (i32.const 5)))
                      (block $B60
                        (br_if $B60
                          (i32.eqz
                            (local.get $l127)))
                        (br_if $B59
                          (i32.eqz
                            (local.get $p9))))
                      (block $B61
                        (br_if $B61
                          (local.get $l107))
                        (local.set $p24
                          (i32.const 0))
                        (block $B62
                          (br_if $B62
                            (i32.lt_u
                              (local.get $l108)
                              (i32.const 4)))
                          (local.set $l128
                            (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                          (local.set $p13
                            (local.get $l28))
                          (local.set $p24
                            (local.get $l116))
                          (loop $L63
                            (v128.store
                              (local.get $p13)
                              (i32x4.add
                                (i32x4.splat
                                  (local.get $p10))
                                (i32x4.shl
                                  (i32x4.mul
                                    (i32x4.replace_lane 3
                                      (i32x4.replace_lane 2
                                        (i32x4.replace_lane 1
                                          (i32x4.splat
                                            (i32.rem_s
                                              (i32x4.extract_lane 0
                                                (local.tee $l52
                                                  (i32x4.add
                                                    (local.get $l128)
                                                    (local.get $l121))))
                                              (i32.const 16)))
                                          (i32.rem_s
                                            (i32x4.extract_lane 1
                                              (local.get $l52))
                                            (i32.const 16)))
                                        (i32.rem_s
                                          (i32x4.extract_lane 2
                                            (local.get $l52))
                                          (i32.const 16)))
                                      (i32.rem_s
                                        (i32x4.extract_lane 3
                                          (local.get $l52))
                                        (i32.const 16)))
                                    (local.get $l67))
                                  (i32.const 2))))
                            (local.set $p13
                              (i32.add
                                (local.get $p13)
                                (i32.const 16)))
                            (local.set $l128
                              (i32x4.add
                                (local.get $l128)
                                (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                            (br_if $L63
                              (local.tee $p24
                                (i32.add
                                  (local.get $p24)
                                  (i32.const -4)))))
                          (local.set $p24
                            (local.get $l116))
                          (br_if $B61
                            (i32.eq
                              (local.get $l108)
                              (local.get $l116))))
                        (local.set $p13
                          (i32.add
                            (local.get $p23)
                            (local.get $p24)))
                        (local.set $p11
                          (i32.sub
                            (local.get $l108)
                            (local.get $p24)))
                        (local.set $p24
                          (i32.add
                            (local.get $l28)
                            (i32.shl
                              (local.get $p24)
                              (i32.const 2))))
                        (loop $L64
                          (i32.store
                            (local.get $p24)
                            (i32.add
                              (local.get $p10)
                              (i32.shl
                                (i32.mul
                                  (i32.rem_s
                                    (local.get $p13)
                                    (i32.const 16))
                                  (local.get $p0))
                                (i32.const 2))))
                          (local.set $p24
                            (i32.add
                              (local.get $p24)
                              (i32.const 4)))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 1)))
                          (br_if $L64
                            (local.tee $p11
                              (i32.add
                                (local.get $p11)
                                (i32.const -1))))))
                      (local.set $p27
                        (i32.and
                          (local.get $l47)
                          (i32.const 6)))
                      (local.set $p16
                        (select
                          (i32.add
                            (local.get $l28)
                            (i32.const 16))
                          (i32.add
                            (local.get $l28)
                            (i32.const 32))
                          (i32.eq
                            (local.get $p9)
                            (i32.const 1))))
                      (local.set $l50
                        (i32.load
                          (local.get $l130)))
                      (local.set $l36
                        (i32.load
                          (local.get $l131)))
                      (local.set $p10
                        (i32.const 0))
                      (block $B65
                        (br_if $B65
                          (local.tee $l132
                            (i32.lt_s
                              (local.get $p0)
                              (i32.const 4))))
                        (local.set $p9
                          (i32.add
                            (local.get $p16)
                            (local.get $l119)))
                        (local.set $p5
                          (i32.add
                            (local.get $p16)
                            (local.get $l110)))
                        (local.set $p25
                          (i32.add
                            (local.get $p16)
                            (local.get $l112)))
                        (local.set $p6
                          (i32.load
                            (i32.add
                              (local.get $p16)
                              (local.get $l114))))
                        (local.set $p10
                          (i32.const 0))
                        (local.set $p24
                          (local.get $l36))
                        (local.set $p13
                          (i32.const 0))
                        (loop $L66
                          (local.set $p11
                            (local.get $p10))
                          (local.set $p10
                            (i32.add
                              (local.get $p6)
                              (local.get $p13)))
                          (block $B67
                            (block $B68
                              (br_if $B68
                                (i32.ne
                                  (local.get $l47)
                                  (i32.const 4)))
                              (local.set $l52
                                (f32x4.mul
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $p9))
                                      (local.get $p13)))
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l39))
                                      (local.get $p13)))))
                              (local.set $l128
                                (f32x4.mul
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $p5))
                                      (local.get $p13)))
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l33))
                                      (local.get $p13)))))
                              (local.set $l133
                                (f32x4.mul
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $p25))
                                      (local.get $p13)))
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l31))
                                      (local.get $p13)))))
                              (local.set $l134
                                (f32x4.mul
                                  (v128.load align=1
                                    (local.get $p10))
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l32))
                                      (local.get $p13)))))
                              (br $B67))
                            (block $B69
                              (br_if $B69
                                (i32.ne
                                  (local.get $p27)
                                  (i32.const 2)))
                              (local.set $l52
                                (f32x4.mul
                                  (local.tee $l52
                                    (v128.load align=1
                                      (i32.add
                                        (i32.load
                                          (local.get $p9))
                                        (local.get $p13))))
                                  (local.get $l52)))
                              (local.set $l128
                                (f32x4.mul
                                  (local.tee $l128
                                    (v128.load align=1
                                      (i32.add
                                        (i32.load
                                          (local.get $p5))
                                        (local.get $p13))))
                                  (local.get $l128)))
                              (local.set $l133
                                (f32x4.mul
                                  (local.tee $l133
                                    (v128.load align=1
                                      (i32.add
                                        (i32.load
                                          (local.get $p25))
                                        (local.get $p13))))
                                  (local.get $l133)))
                              (local.set $l134
                                (f32x4.mul
                                  (local.tee $l134
                                    (v128.load align=1
                                      (local.get $p10)))
                                  (local.get $l134)))
                              (br $B67))
                            (local.set $l52
                              (v128.load align=1
                                (i32.add
                                  (i32.load
                                    (local.get $p9))
                                  (local.get $p13))))
                            (local.set $l128
                              (v128.load align=1
                                (i32.add
                                  (i32.load
                                    (local.get $p5))
                                  (local.get $p13))))
                            (local.set $l133
                              (v128.load align=1
                                (i32.add
                                  (i32.load
                                    (local.get $p25))
                                  (local.get $p13))))
                            (local.set $l134
                              (v128.load align=1
                                (local.get $p10))))
                          (v128.store align=1
                            (i32.add
                              (local.get $p24)
                              (i32.const 48))
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
                              (local.tee $l135
                                (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                                  (local.get $l134)
                                  (local.get $l133)))
                              (local.tee $l136
                                (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                                  (local.get $l128)
                                  (local.get $l52)))))
                          (v128.store align=1
                            (i32.add
                              (local.get $p24)
                              (i32.const 32))
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (local.get $l135)
                              (local.get $l136)))
                          (v128.store align=1
                            (i32.add
                              (local.get $p24)
                              (i32.const 16))
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
                              (local.tee $l133
                                (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                                  (local.get $l134)
                                  (local.get $l133)))
                              (local.tee $l52
                                (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                                  (local.get $l128)
                                  (local.get $l52)))))
                          (v128.store align=1
                            (local.get $p24)
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (local.get $l133)
                              (local.get $l52)))
                          (local.set $p24
                            (i32.add
                              (local.get $p24)
                              (i32.const 64)))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 16)))
                          (local.set $p10
                            (i32.add
                              (local.get $p11)
                              (i32.const 4)))
                          (br_if $L66
                            (i32.le_s
                              (i32.add
                                (local.get $p11)
                                (i32.const 8))
                              (local.get $p0)))))
                      (block $B70
                        (br_if $B70
                          (i32.le_s
                            (local.get $p0)
                            (local.get $p10)))
                        (local.set $l51
                          (i32.sub
                            (local.get $p0)
                            (local.get $p10)))
                        (block $B71
                          (br_if $B71
                            (i32.ne
                              (local.get $l47)
                              (i32.const 4)))
                          (local.set $p26
                            (i32.load
                              (local.get $l39)))
                          (local.set $p16
                            (i32.load
                              (local.get $l120)))
                          (local.set $p27
                            (i32.load
                              (local.get $l33)))
                          (local.set $p6
                            (i32.load
                              (local.get $l111)))
                          (local.set $p25
                            (i32.load
                              (local.get $l31)))
                          (local.set $p5
                            (i32.load
                              (local.get $l113)))
                          (local.set $p9
                            (i32.load
                              (local.get $l32)))
                          (local.set $p11
                            (i32.load
                              (local.get $l115)))
                          (block $B72
                            (br_if $B72
                              (i32.lt_u
                                (local.get $l51)
                                (i32.const 4)))
                            (br_if $B72
                              (i32.and
                                (i32.lt_u
                                  (local.tee $p24
                                    (i32.add
                                      (local.get $l36)
                                      (i32.shl
                                        (local.get $p10)
                                        (i32.const 4))))
                                  (i32.add
                                    (local.get $p11)
                                    (local.get $l62)))
                                (i32.lt_u
                                  (i32.add
                                    (local.get $p11)
                                    (local.tee $p13
                                      (i32.shl
                                        (local.get $p10)
                                        (i32.const 2))))
                                  (local.tee $l46
                                    (i32.add
                                      (local.get $l36)
                                      (local.get $l41))))))
                            (br_if $B72
                              (i32.and
                                (i32.lt_u
                                  (local.get $p24)
                                  (i32.add
                                    (local.get $p9)
                                    (local.get $l62)))
                                (i32.lt_u
                                  (i32.add
                                    (local.get $p9)
                                    (local.get $p13))
                                  (local.get $l46))))
                            (br_if $B72
                              (i32.and
                                (i32.lt_u
                                  (local.get $p24)
                                  (i32.add
                                    (local.get $p5)
                                    (local.get $l62)))
                                (i32.lt_u
                                  (i32.add
                                    (local.get $p5)
                                    (local.get $p13))
                                  (local.get $l46))))
                            (br_if $B72
                              (i32.and
                                (i32.lt_u
                                  (local.get $p24)
                                  (i32.add
                                    (local.get $p25)
                                    (local.get $l62)))
                                (i32.lt_u
                                  (i32.add
                                    (local.get $p25)
                                    (local.get $p13))
                                  (local.get $l46))))
                            (br_if $B72
                              (i32.and
                                (i32.lt_u
                                  (local.get $p24)
                                  (i32.add
                                    (local.get $p6)
                                    (local.get $l62)))
                                (i32.lt_u
                                  (i32.add
                                    (local.get $p6)
                                    (local.get $p13))
                                  (local.get $l46))))
                            (br_if $B72
                              (i32.and
                                (i32.lt_u
                                  (local.get $p24)
                                  (i32.add
                                    (local.get $p27)
                                    (local.get $l62)))
                                (i32.lt_u
                                  (i32.add
                                    (local.get $p27)
                                    (local.get $p13))
                                  (local.get $l46))))
                            (br_if $B72
                              (i32.and
                                (i32.lt_u
                                  (local.get $p24)
                                  (i32.add
                                    (local.get $p16)
                                    (local.get $l62)))
                                (i32.lt_u
                                  (i32.add
                                    (local.get $p16)
                                    (local.get $p13))
                                  (local.get $l46))))
                            (br_if $B72
                              (i32.and
                                (i32.lt_u
                                  (local.get $p24)
                                  (i32.add
                                    (local.get $p26)
                                    (local.get $l62)))
                                (i32.lt_u
                                  (i32.add
                                    (local.get $p26)
                                    (local.get $p13))
                                  (local.get $l46))))
                            (local.set $l137
                              (i32.add
                                (local.get $l61)
                                (local.get $p10)))
                            (local.set $p10
                              (i32.add
                                (local.get $p10)
                                (i32.sub
                                  (local.get $l51)
                                  (local.get $l60))))
                            (local.set $l51
                              (local.get $p11))
                            (local.set $l46
                              (local.get $p9))
                            (local.set $l48
                              (local.get $p5))
                            (local.set $l49
                              (local.get $p25))
                            (local.set $l29
                              (local.get $p6))
                            (local.set $p15
                              (local.get $p27))
                            (local.set $l138
                              (local.get $p16))
                            (local.set $l139
                              (local.get $p26))
                            (loop $L73
                              (v128.store offset=48 align=4
                                (local.get $p24)
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                  (i8x16.shuffle 12 13 14 15 28 29 30 31 0 1 2 3 0 1 2 3
                                    (local.tee $l52
                                      (f32x4.mul
                                        (v128.load align=4
                                          (i32.add
                                            (local.get $l51)
                                            (local.get $p13)))
                                        (v128.load align=4
                                          (i32.add
                                            (local.get $l46)
                                            (local.get $p13)))))
                                    (local.tee $l128
                                      (f32x4.mul
                                        (v128.load align=4
                                          (i32.add
                                            (local.get $l48)
                                            (local.get $p13)))
                                        (v128.load align=4
                                          (i32.add
                                            (local.get $l49)
                                            (local.get $p13))))))
                                  (i8x16.shuffle 0 1 2 3 0 1 2 3 12 13 14 15 28 29 30 31
                                    (local.tee $l133
                                      (f32x4.mul
                                        (v128.load align=4
                                          (i32.add
                                            (local.get $l29)
                                            (local.get $p13)))
                                        (v128.load align=4
                                          (i32.add
                                            (local.get $p15)
                                            (local.get $p13)))))
                                    (local.tee $l134
                                      (f32x4.mul
                                        (v128.load align=4
                                          (i32.add
                                            (local.get $l138)
                                            (local.get $p13)))
                                        (v128.load align=4
                                          (i32.add
                                            (local.get $l139)
                                            (local.get $p13))))))))
                              (v128.store offset=32 align=4
                                (local.get $p24)
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                  (i8x16.shuffle 8 9 10 11 24 25 26 27 0 1 2 3 0 1 2 3
                                    (local.get $l52)
                                    (local.get $l128))
                                  (i8x16.shuffle 0 1 2 3 0 1 2 3 8 9 10 11 24 25 26 27
                                    (local.get $l133)
                                    (local.get $l134))))
                              (v128.store offset=16 align=4
                                (local.get $p24)
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                  (i8x16.shuffle 4 5 6 7 20 21 22 23 0 1 2 3 0 1 2 3
                                    (local.get $l52)
                                    (local.get $l128))
                                  (i8x16.shuffle 0 1 2 3 0 1 2 3 4 5 6 7 20 21 22 23
                                    (local.get $l133)
                                    (local.get $l134))))
                              (v128.store align=4
                                (local.get $p24)
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                  (i8x16.shuffle 0 1 2 3 16 17 18 19 0 1 2 3 0 1 2 3
                                    (local.get $l52)
                                    (local.get $l128))
                                  (i8x16.shuffle 0 1 2 3 0 1 2 3 0 1 2 3 16 17 18 19
                                    (local.get $l133)
                                    (local.get $l134))))
                              (local.set $p24
                                (i32.add
                                  (local.get $p24)
                                  (i32.const 64)))
                              (local.set $l51
                                (i32.add
                                  (local.get $l51)
                                  (i32.const 16)))
                              (local.set $l46
                                (i32.add
                                  (local.get $l46)
                                  (i32.const 16)))
                              (local.set $l48
                                (i32.add
                                  (local.get $l48)
                                  (i32.const 16)))
                              (local.set $l49
                                (i32.add
                                  (local.get $l49)
                                  (i32.const 16)))
                              (local.set $l29
                                (i32.add
                                  (local.get $l29)
                                  (i32.const 16)))
                              (local.set $p15
                                (i32.add
                                  (local.get $p15)
                                  (i32.const 16)))
                              (local.set $l138
                                (i32.add
                                  (local.get $l138)
                                  (i32.const 16)))
                              (local.set $l139
                                (i32.add
                                  (local.get $l139)
                                  (i32.const 16)))
                              (br_if $L73
                                (local.tee $l137
                                  (i32.add
                                    (local.get $l137)
                                    (i32.const 4)))))
                            (br_if $B70
                              (i32.eqz
                                (local.get $l60))))
                          (local.set $p13
                            (i32.shl
                              (local.get $p10)
                              (i32.const 2)))
                          (local.set $l51
                            (i32.sub
                              (local.get $p0)
                              (local.get $p10)))
                          (local.set $p24
                            (i32.add
                              (local.get $l36)
                              (i32.shl
                                (local.get $p10)
                                (i32.const 4))))
                          (loop $L74
                            (f32.store
                              (local.get $p24)
                              (f32.mul
                                (f32.load
                                  (i32.add
                                    (local.get $p11)
                                    (local.get $p13)))
                                (f32.load
                                  (i32.add
                                    (local.get $p9)
                                    (local.get $p13)))))
                            (f32.store
                              (i32.add
                                (local.get $p24)
                                (i32.const 4))
                              (f32.mul
                                (f32.load
                                  (i32.add
                                    (local.get $p5)
                                    (local.get $p13)))
                                (f32.load
                                  (i32.add
                                    (local.get $p25)
                                    (local.get $p13)))))
                            (f32.store
                              (i32.add
                                (local.get $p24)
                                (i32.const 8))
                              (f32.mul
                                (f32.load
                                  (i32.add
                                    (local.get $p6)
                                    (local.get $p13)))
                                (f32.load
                                  (i32.add
                                    (local.get $p27)
                                    (local.get $p13)))))
                            (f32.store
                              (i32.add
                                (local.get $p24)
                                (i32.const 12))
                              (f32.mul
                                (f32.load
                                  (i32.add
                                    (local.get $p16)
                                    (local.get $p13)))
                                (f32.load
                                  (i32.add
                                    (local.get $p26)
                                    (local.get $p13)))))
                            (local.set $p24
                              (i32.add
                                (local.get $p24)
                                (i32.const 16)))
                            (local.set $p11
                              (i32.add
                                (local.get $p11)
                                (i32.const 4)))
                            (local.set $p9
                              (i32.add
                                (local.get $p9)
                                (i32.const 4)))
                            (local.set $p5
                              (i32.add
                                (local.get $p5)
                                (i32.const 4)))
                            (local.set $p25
                              (i32.add
                                (local.get $p25)
                                (i32.const 4)))
                            (local.set $p6
                              (i32.add
                                (local.get $p6)
                                (i32.const 4)))
                            (local.set $p27
                              (i32.add
                                (local.get $p27)
                                (i32.const 4)))
                            (local.set $p16
                              (i32.add
                                (local.get $p16)
                                (i32.const 4)))
                            (local.set $p26
                              (i32.add
                                (local.get $p26)
                                (i32.const 4)))
                            (br_if $L74
                              (local.tee $l51
                                (i32.add
                                  (local.get $l51)
                                  (i32.const -1))))
                            (br $B70)))
                        (local.set $l48
                          (i32.load
                            (i32.add
                              (local.get $p16)
                              (local.get $l119))))
                        (local.set $l46
                          (i32.load
                            (i32.add
                              (local.get $p16)
                              (local.get $l110))))
                        (local.set $p26
                          (i32.load
                            (i32.add
                              (local.get $p16)
                              (local.get $l112))))
                        (local.set $p6
                          (i32.load
                            (i32.add
                              (local.get $p16)
                              (local.get $l114))))
                        (block $B75
                          (br_if $B75
                            (i32.eq
                              (local.get $p27)
                              (i32.const 2)))
                          (block $B76
                            (br_if $B76
                              (i32.lt_u
                                (local.get $l51)
                                (i32.const 12)))
                            (br_if $B76
                              (i32.and
                                (i32.lt_u
                                  (local.tee $p13
                                    (i32.add
                                      (local.get $l36)
                                      (i32.shl
                                        (local.get $p10)
                                        (i32.const 4))))
                                  (i32.add
                                    (local.get $p6)
                                    (local.get $l62)))
                                (i32.lt_u
                                  (local.tee $p24
                                    (i32.add
                                      (local.get $p6)
                                      (local.tee $p5
                                        (i32.shl
                                          (local.get $p10)
                                          (i32.const 2)))))
                                  (local.tee $p25
                                    (i32.add
                                      (local.get $l36)
                                      (local.get $l41))))))
                            (br_if $B76
                              (i32.and
                                (i32.lt_u
                                  (local.get $p13)
                                  (i32.add
                                    (local.get $p26)
                                    (local.get $l62)))
                                (i32.lt_u
                                  (local.tee $p11
                                    (i32.add
                                      (local.get $p26)
                                      (local.get $p5)))
                                  (local.get $p25))))
                            (br_if $B76
                              (i32.and
                                (i32.lt_u
                                  (local.get $p13)
                                  (i32.add
                                    (local.get $l46)
                                    (local.get $l62)))
                                (i32.lt_u
                                  (local.tee $p9
                                    (i32.add
                                      (local.get $l46)
                                      (local.get $p5)))
                                  (local.get $p25))))
                            (br_if $B76
                              (i32.and
                                (i32.lt_u
                                  (local.get $p13)
                                  (i32.add
                                    (local.get $l48)
                                    (local.get $l62)))
                                (i32.lt_u
                                  (local.tee $p5
                                    (i32.add
                                      (local.get $l48)
                                      (local.get $p5)))
                                  (local.get $p25))))
                            (local.set $p25
                              (i32.add
                                (local.get $l61)
                                (local.get $p10)))
                            (local.set $p10
                              (i32.add
                                (local.get $p10)
                                (i32.sub
                                  (local.get $l51)
                                  (local.get $l60))))
                            (loop $L77
                              (v128.store offset=48 align=4
                                (local.get $p13)
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                  (i8x16.shuffle 12 13 14 15 28 29 30 31 0 1 2 3 0 1 2 3
                                    (local.tee $l52
                                      (v128.load align=4
                                        (local.get $p24)))
                                    (local.tee $l128
                                      (v128.load align=4
                                        (local.get $p11))))
                                  (i8x16.shuffle 0 1 2 3 0 1 2 3 12 13 14 15 28 29 30 31
                                    (local.tee $l133
                                      (v128.load align=4
                                        (local.get $p9)))
                                    (local.tee $l134
                                      (v128.load align=4
                                        (local.get $p5))))))
                              (v128.store offset=32 align=4
                                (local.get $p13)
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                  (i8x16.shuffle 8 9 10 11 24 25 26 27 0 1 2 3 0 1 2 3
                                    (local.get $l52)
                                    (local.get $l128))
                                  (i8x16.shuffle 0 1 2 3 0 1 2 3 8 9 10 11 24 25 26 27
                                    (local.get $l133)
                                    (local.get $l134))))
                              (v128.store offset=16 align=4
                                (local.get $p13)
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                  (i8x16.shuffle 4 5 6 7 20 21 22 23 0 1 2 3 0 1 2 3
                                    (local.get $l52)
                                    (local.get $l128))
                                  (i8x16.shuffle 0 1 2 3 0 1 2 3 4 5 6 7 20 21 22 23
                                    (local.get $l133)
                                    (local.get $l134))))
                              (v128.store align=4
                                (local.get $p13)
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                  (i8x16.shuffle 0 1 2 3 16 17 18 19 0 1 2 3 0 1 2 3
                                    (local.get $l52)
                                    (local.get $l128))
                                  (i8x16.shuffle 0 1 2 3 0 1 2 3 0 1 2 3 16 17 18 19
                                    (local.get $l133)
                                    (local.get $l134))))
                              (local.set $p13
                                (i32.add
                                  (local.get $p13)
                                  (i32.const 64)))
                              (local.set $p24
                                (i32.add
                                  (local.get $p24)
                                  (i32.const 16)))
                              (local.set $p11
                                (i32.add
                                  (local.get $p11)
                                  (i32.const 16)))
                              (local.set $p9
                                (i32.add
                                  (local.get $p9)
                                  (i32.const 16)))
                              (local.set $p5
                                (i32.add
                                  (local.get $p5)
                                  (i32.const 16)))
                              (br_if $L77
                                (local.tee $p25
                                  (i32.add
                                    (local.get $p25)
                                    (i32.const 4)))))
                            (br_if $B70
                              (i32.eqz
                                (local.get $l60))))
                          (local.set $p5
                            (i32.sub
                              (local.get $p0)
                              (local.get $p10)))
                          (local.set $p13
                            (i32.add
                              (local.get $l36)
                              (i32.shl
                                (local.get $p10)
                                (i32.const 4))))
                          (local.set $p24
                            (i32.add
                              (local.get $p6)
                              (local.tee $p9
                                (i32.shl
                                  (local.get $p10)
                                  (i32.const 2)))))
                          (local.set $p11
                            (i32.add
                              (local.get $p26)
                              (local.get $p9)))
                          (local.set $p10
                            (i32.add
                              (local.get $l46)
                              (local.get $p9)))
                          (local.set $p9
                            (i32.add
                              (local.get $l48)
                              (local.get $p9)))
                          (loop $L78
                            (f32.store
                              (local.get $p13)
                              (f32.load
                                (local.get $p24)))
                            (f32.store
                              (i32.add
                                (local.get $p13)
                                (i32.const 4))
                              (f32.load
                                (local.get $p11)))
                            (f32.store
                              (i32.add
                                (local.get $p13)
                                (i32.const 8))
                              (f32.load
                                (local.get $p10)))
                            (f32.store
                              (i32.add
                                (local.get $p13)
                                (i32.const 12))
                              (f32.load
                                (local.get $p9)))
                            (local.set $p13
                              (i32.add
                                (local.get $p13)
                                (i32.const 16)))
                            (local.set $p24
                              (i32.add
                                (local.get $p24)
                                (i32.const 4)))
                            (local.set $p11
                              (i32.add
                                (local.get $p11)
                                (i32.const 4)))
                            (local.set $p10
                              (i32.add
                                (local.get $p10)
                                (i32.const 4)))
                            (local.set $p9
                              (i32.add
                                (local.get $p9)
                                (i32.const 4)))
                            (br_if $L78
                              (local.tee $p5
                                (i32.add
                                  (local.get $p5)
                                  (i32.const -1))))
                            (br $B70)))
                        (block $B79
                          (br_if $B79
                            (i32.lt_u
                              (local.get $l51)
                              (i32.const 4)))
                          (br_if $B79
                            (i32.and
                              (i32.lt_u
                                (local.tee $p13
                                  (i32.add
                                    (local.get $l36)
                                    (i32.shl
                                      (local.get $p10)
                                      (i32.const 4))))
                                (i32.add
                                  (local.get $p6)
                                  (local.get $l62)))
                              (i32.lt_u
                                (local.tee $p24
                                  (i32.add
                                    (local.get $p6)
                                    (local.tee $p5
                                      (i32.shl
                                        (local.get $p10)
                                        (i32.const 2)))))
                                (local.tee $p25
                                  (i32.add
                                    (local.get $l36)
                                    (local.get $l41))))))
                          (br_if $B79
                            (i32.and
                              (i32.lt_u
                                (local.get $p13)
                                (i32.add
                                  (local.get $p26)
                                  (local.get $l62)))
                              (i32.lt_u
                                (local.tee $p11
                                  (i32.add
                                    (local.get $p26)
                                    (local.get $p5)))
                                (local.get $p25))))
                          (br_if $B79
                            (i32.and
                              (i32.lt_u
                                (local.get $p13)
                                (i32.add
                                  (local.get $l46)
                                  (local.get $l62)))
                              (i32.lt_u
                                (local.tee $p9
                                  (i32.add
                                    (local.get $l46)
                                    (local.get $p5)))
                                (local.get $p25))))
                          (br_if $B79
                            (i32.and
                              (i32.lt_u
                                (local.get $p13)
                                (i32.add
                                  (local.get $l48)
                                  (local.get $l62)))
                              (i32.lt_u
                                (local.tee $p5
                                  (i32.add
                                    (local.get $l48)
                                    (local.get $p5)))
                                (local.get $p25))))
                          (local.set $p25
                            (i32.add
                              (local.get $l61)
                              (local.get $p10)))
                          (local.set $p10
                            (i32.add
                              (local.get $p10)
                              (i32.sub
                                (local.get $l51)
                                (local.get $l60))))
                          (loop $L80
                            (v128.store offset=48 align=4
                              (local.get $p13)
                              (f32x4.mul
                                (local.tee $l135
                                  (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                    (i8x16.shuffle 12 13 14 15 28 29 30 31 0 1 2 3 0 1 2 3
                                      (local.tee $l52
                                        (v128.load align=4
                                          (local.get $p24)))
                                      (local.tee $l128
                                        (v128.load align=4
                                          (local.get $p11))))
                                    (i8x16.shuffle 0 1 2 3 0 1 2 3 12 13 14 15 28 29 30 31
                                      (local.tee $l133
                                        (v128.load align=4
                                          (local.get $p9)))
                                      (local.tee $l134
                                        (v128.load align=4
                                          (local.get $p5))))))
                                (local.get $l135)))
                            (v128.store offset=32 align=4
                              (local.get $p13)
                              (f32x4.mul
                                (local.tee $l135
                                  (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                    (i8x16.shuffle 8 9 10 11 24 25 26 27 0 1 2 3 0 1 2 3
                                      (local.get $l52)
                                      (local.get $l128))
                                    (i8x16.shuffle 0 1 2 3 0 1 2 3 8 9 10 11 24 25 26 27
                                      (local.get $l133)
                                      (local.get $l134))))
                                (local.get $l135)))
                            (v128.store offset=16 align=4
                              (local.get $p13)
                              (f32x4.mul
                                (local.tee $l135
                                  (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                    (i8x16.shuffle 4 5 6 7 20 21 22 23 0 1 2 3 0 1 2 3
                                      (local.get $l52)
                                      (local.get $l128))
                                    (i8x16.shuffle 0 1 2 3 0 1 2 3 4 5 6 7 20 21 22 23
                                      (local.get $l133)
                                      (local.get $l134))))
                                (local.get $l135)))
                            (v128.store align=4
                              (local.get $p13)
                              (f32x4.mul
                                (local.tee $l52
                                  (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                    (i8x16.shuffle 0 1 2 3 16 17 18 19 0 1 2 3 0 1 2 3
                                      (local.get $l52)
                                      (local.get $l128))
                                    (i8x16.shuffle 0 1 2 3 0 1 2 3 0 1 2 3 16 17 18 19
                                      (local.get $l133)
                                      (local.get $l134))))
                                (local.get $l52)))
                            (local.set $p13
                              (i32.add
                                (local.get $p13)
                                (i32.const 64)))
                            (local.set $p24
                              (i32.add
                                (local.get $p24)
                                (i32.const 16)))
                            (local.set $p11
                              (i32.add
                                (local.get $p11)
                                (i32.const 16)))
                            (local.set $p9
                              (i32.add
                                (local.get $p9)
                                (i32.const 16)))
                            (local.set $p5
                              (i32.add
                                (local.get $p5)
                                (i32.const 16)))
                            (br_if $L80
                              (local.tee $p25
                                (i32.add
                                  (local.get $p25)
                                  (i32.const 4)))))
                          (br_if $B70
                            (i32.eqz
                              (local.get $l60))))
                        (local.set $p5
                          (i32.sub
                            (local.get $p0)
                            (local.get $p10)))
                        (local.set $p13
                          (i32.add
                            (local.get $l36)
                            (i32.shl
                              (local.get $p10)
                              (i32.const 4))))
                        (local.set $p24
                          (i32.add
                            (local.get $p6)
                            (local.tee $p9
                              (i32.shl
                                (local.get $p10)
                                (i32.const 2)))))
                        (local.set $p11
                          (i32.add
                            (local.get $p26)
                            (local.get $p9)))
                        (local.set $p10
                          (i32.add
                            (local.get $l46)
                            (local.get $p9)))
                        (local.set $p9
                          (i32.add
                            (local.get $l48)
                            (local.get $p9)))
                        (loop $L81
                          (f32.store
                            (local.get $p13)
                            (f32.mul
                              (local.tee $l140
                                (f32.load
                                  (local.get $p24)))
                              (local.get $l140)))
                          (f32.store
                            (i32.add
                              (local.get $p13)
                              (i32.const 4))
                            (f32.mul
                              (local.tee $l140
                                (f32.load
                                  (local.get $p11)))
                              (local.get $l140)))
                          (f32.store
                            (i32.add
                              (local.get $p13)
                              (i32.const 8))
                            (f32.mul
                              (local.tee $l140
                                (f32.load
                                  (local.get $p10)))
                              (local.get $l140)))
                          (f32.store
                            (i32.add
                              (local.get $p13)
                              (i32.const 12))
                            (f32.mul
                              (local.tee $l140
                                (f32.load
                                  (local.get $p9)))
                              (local.get $l140)))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 16)))
                          (local.set $p24
                            (i32.add
                              (local.get $p24)
                              (i32.const 4)))
                          (local.set $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const 4)))
                          (local.set $p10
                            (i32.add
                              (local.get $p10)
                              (i32.const 4)))
                          (local.set $p9
                            (i32.add
                              (local.get $p9)
                              (i32.const 4)))
                          (br_if $L81
                            (local.tee $p5
                              (i32.add
                                (local.get $p5)
                                (i32.const -1))))))
                      (i64.store align=4
                        (local.get $l97)
                        (i64.const 0))
                      (i32.store offset=8
                        (local.get $l97)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l96)
                        (i64.const 0))
                      (i32.store offset=8
                        (local.get $l96)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l95)
                        (i64.const 0))
                      (i32.store offset=8
                        (local.get $l95)
                        (i32.const 0))
                      (v128.store offset=1936
                        (local.get $l28)
                        (local.tee $l133
                          (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                      (v128.store offset=1888
                        (local.get $l28)
                        (local.get $l133))
                      (f32.store offset=544
                        (local.get $l28)
                        (local.tee $l140
                          (f32.load offset=24
                            (local.get $p8))))
                      (f32.store offset=576
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=28
                            (local.get $p8))))
                      (f32.store offset=608
                        (local.get $l28)
                        (local.tee $l142
                          (f32.load offset=32
                            (local.get $p8))))
                      (v128.store offset=560
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l140))))
                      (v128.store offset=592
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (v128.store offset=624
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l142))))
                      (local.set $l140
                        (f32.load offset=36
                          (local.get $p8)))
                      (i64.store align=4
                        (local.get $l94)
                        (i64.const 0))
                      (i32.store offset=8
                        (local.get $l94)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l93)
                        (i64.const 0))
                      (i32.store offset=8
                        (local.get $l93)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l92)
                        (i64.const 0))
                      (i32.store offset=8
                        (local.get $l92)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l91)
                        (i64.const 0))
                      (i32.store offset=8
                        (local.get $l91)
                        (i32.const 0))
                      (f32.store offset=640
                        (local.get $l28)
                        (local.get $l140))
                      (v128.store offset=656
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l140))))
                      (f32.store offset=672
                        (local.get $l28)
                        (local.tee $l140
                          (f32.load offset=40
                            (local.get $p8))))
                      (f32.store offset=704
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=44
                            (local.get $p8))))
                      (f32.store offset=736
                        (local.get $l28)
                        (local.tee $l142
                          (f32.load offset=48
                            (local.get $p8))))
                      (v128.store offset=688
                        (local.get $l28)
                        (local.tee $l143
                          (f64x2.splat
                            (f64.promote_f32
                              (local.get $l140)))))
                      (v128.store offset=720
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (i32.store offset=8
                        (local.get $l90)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l90)
                        (i64.const 0))
                      (i32.store offset=8
                        (local.get $l89)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l89)
                        (i64.const 0))
                      (i32.store offset=8
                        (local.get $l88)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l88)
                        (i64.const 0))
                      (i64.store align=4
                        (local.get $l87)
                        (i64.const 0))
                      (i32.store offset=8
                        (local.get $l87)
                        (i32.const 0))
                      (v128.store offset=752
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l142))))
                      (f32.store offset=768
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=52
                            (local.get $p8))))
                      (f32.store offset=800
                        (local.get $l28)
                        (local.tee $l140
                          (f32.load offset=56
                            (local.get $p8))))
                      (f32.store offset=832
                        (local.get $l28)
                        (local.tee $l142
                          (f32.load offset=60
                            (local.get $p8))))
                      (f32.store offset=864
                        (local.get $l28)
                        (local.tee $l144
                          (f32.load offset=64
                            (local.get $p8))))
                      (v128.store offset=784
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (v128.store offset=816
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l140))))
                      (v128.store offset=848
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l142))))
                      (v128.store offset=880
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l144))))
                      (f32.store offset=896
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=68
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l86)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l86)
                        (i64.const 0))
                      (v128.store offset=912
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (v128.store offset=1904
                        (local.get $l28)
                        (local.get $l133))
                      (v128.store offset=1952
                        (local.get $l28)
                        (local.get $l133))
                      (f32.store offset=928
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=72
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l85)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l85)
                        (i64.const 0))
                      (v128.store offset=944
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (f32.store offset=960
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=76
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l84)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l84)
                        (i64.const 0))
                      (v128.store offset=976
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (f32.store offset=992
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=80
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l83)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l83)
                        (i64.const 0))
                      (v128.store offset=1008
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (f32.store offset=1024
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=84
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l82)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l82)
                        (i64.const 0))
                      (v128.store offset=1040
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (f32.store offset=1056
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=88
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l81)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l81)
                        (i64.const 0))
                      (v128.store offset=1072
                        (local.get $l28)
                        (local.tee $l145
                          (f64x2.splat
                            (f64.promote_f32
                              (local.get $l141)))))
                      (f32.store offset=1088
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=92
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l80)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l80)
                        (i64.const 0))
                      (v128.store offset=1104
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (f32.store offset=1120
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=96
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l79)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l79)
                        (i64.const 0))
                      (v128.store offset=1136
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (f32.store offset=1152
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=100
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l78)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l78)
                        (i64.const 0))
                      (v128.store offset=1168
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (f32.store offset=1184
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=104
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l77)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l77)
                        (i64.const 0))
                      (v128.store offset=1200
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (f32.store offset=1216
                        (local.get $l28)
                        (local.tee $l142
                          (f32.load offset=108
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l76)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l76)
                        (i64.const 0))
                      (v128.store offset=1232
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l142))))
                      (f32.store offset=1248
                        (local.get $l28)
                        (local.tee $l142
                          (f32.load offset=112
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l75)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l75)
                        (i64.const 0))
                      (v128.store offset=1264
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l142))))
                      (f32.store offset=1280
                        (local.get $l28)
                        (local.tee $l142
                          (f32.load offset=116
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l74)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l74)
                        (i64.const 0))
                      (v128.store offset=1296
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l142))))
                      (v128.store64_lane offset=528 0
                        (local.get $l28)
                        (v128.and
                          (f32x4.eq
                            (f32x4.replace_lane 1
                              (f32x4.splat
                                (local.get $l140))
                              (local.get $l141))
                            (v128.const i32x4 0xbf800000 0xbf800000 0xbf800000 0xbf800000))
                          (v128.const i32x4 0x00000001 0x00000001 0x00000001 0x00000001)))
                      (v128.store offset=1920
                        (local.get $l28)
                        (local.get $l133))
                      (v128.store offset=1968
                        (local.get $l28)
                        (local.get $l133))
                      (f32.store offset=1312
                        (local.get $l28)
                        (local.tee $l140
                          (f32.load offset=120
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l73)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l73)
                        (i64.const 0))
                      (v128.store offset=1328
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l140))))
                      (f32.store offset=1344
                        (local.get $l28)
                        (local.tee $l140
                          (f32.load offset=124
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l72)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l72)
                        (i64.const 0))
                      (v128.store offset=1360
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l140))))
                      (f32.store offset=1376
                        (local.get $l28)
                        (local.tee $l140
                          (f32.load offset=128
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l71)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l71)
                        (i64.const 0))
                      (v128.store offset=1392
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l140))))
                      (f32.store offset=1408
                        (local.get $l28)
                        (local.tee $l140
                          (f32.load offset=132
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l70)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l70)
                        (i64.const 0))
                      (v128.store offset=1424
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l140))))
                      (f32.store offset=1440
                        (local.get $l28)
                        (local.tee $l140
                          (f32.load offset=136
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l69)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l69)
                        (i64.const 0))
                      (v128.store offset=1456
                        (local.get $l28)
                        (local.tee $l146
                          (f64x2.splat
                            (f64.promote_f32
                              (local.get $l140)))))
                      (f32.store offset=1472
                        (local.get $l28)
                        (local.tee $l140
                          (f32.load offset=140
                            (local.get $p8))))
                      (i32.store offset=8
                        (local.get $l68)
                        (i32.const 0))
                      (i64.store align=4
                        (local.get $l68)
                        (i64.const 0))
                      (v128.store offset=1488
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l140))))
                      (f32.store offset=1504
                        (local.get $l28)
                        (local.tee $l140
                          (f32.load offset=144
                            (local.get $p8))))
                      (v128.store offset=1520
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l140))))
                      (f32.store offset=1536
                        (local.get $l28)
                        (local.tee $l140
                          (f32.load offset=148
                            (local.get $p8))))
                      (v128.store offset=1552
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l140))))
                      (f32.store offset=1568
                        (local.get $l28)
                        (local.tee $l140
                          (f32.load offset=152
                            (local.get $p8))))
                      (v128.store offset=1584
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l140))))
                      (f32.store offset=1600
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=156
                            (local.get $p8))))
                      (v128.store offset=1616
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (f32.store offset=1632
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=160
                            (local.get $p8))))
                      (v128.store offset=1648
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (f32.store offset=1664
                        (local.get $l28)
                        (local.tee $l141
                          (f32.load offset=164
                            (local.get $p8))))
                      (v128.store offset=1680
                        (local.get $l28)
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l141))))
                      (i32.store offset=536
                        (local.get $l28)
                        (f32.eq
                          (local.get $l140)
                          (f32.const -0x1p+0 (;=-1;))))
                      (block $B82
                        (block $B83
                          (br_if $B83
                            (i32.eqz
                              (local.get $l98)))
                          (local.set $l51
                            (i32.const -4))
                          (local.set $l52
                            (v128.const i32x4 0x7fffffff 0x7fffffff 0x7fffffff 0x7fffffff))
                          (local.set $l134
                            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                          (local.set $l128
                            (local.get $l133))
                          (br $B82))
                        (local.set $p24
                          (i32.add
                            (local.get $l36)
                            (i32.const -160)))
                        (local.set $p11
                          (i32.add
                            (local.get $l50)
                            (i32.const -64)))
                        (local.set $l52
                          (v128.const i32x4 0x7fffffff 0x7fffffff 0x7fffffff 0x7fffffff))
                        (local.set $p13
                          (i32.const -4))
                        (local.set $l135
                          (v128.load offset=1936
                            (local.get $l28)))
                        (local.set $l147
                          (v128.load32_splat offset=1440
                            (local.get $l28)))
                        (local.set $l148
                          (v128.load32_splat offset=1056
                            (local.get $l28)))
                        (local.set $l149
                          (v128.load32_splat offset=672
                            (local.get $l28)))
                        (local.set $l151
                          (local.tee $l150
                            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                        (local.set $l136
                          (local.tee $l133
                            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                        (local.set $l128
                          (local.get $l133))
                        (loop $L84
                          (local.set $l134
                            (local.get $l133))
                          (local.set $l133
                            (local.get $l150))
                          (block $B85
                            (br_if $B85
                              (i32.lt_s
                                (local.get $p13)
                                (i32.const 6)))
                            (local.set $l133
                              (v128.load align=1
                                (local.get $p24))))
                          (local.set $l152
                            (local.get $l150))
                          (block $B86
                            (br_if $B86
                              (i32.ge_s
                                (i32.add
                                  (local.get $p13)
                                  (i32.const 4))
                                (local.get $p0)))
                            (local.set $l152
                              (v128.load align=1
                                (i32.add
                                  (local.get $p24)
                                  (i32.const 160)))))
                          (local.set $l155
                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                              (local.tee $l153
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l143)
                                    (f64x2.promote_low_f32x4
                                      (local.get $l135)))
                                  (f64x2.promote_low_f32x4
                                    (local.tee $l133
                                      (f32x4.sub
                                        (f32x4.mul
                                          (local.tee $l152
                                            (f32x4.add
                                              (local.get $l133)
                                              (local.get $l152)))
                                          (v128.load32_splat offset=24
                                            (local.get $p8)))
                                        (v128.load offset=1888
                                          (local.get $l28)))))))
                              (local.tee $l154
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l143)
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l135)
                                        (local.get $l135))))
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l133)
                                      (local.get $l133)))))))
                          (block $B87
                            (block $B88
                              (br_if $B88
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l153)
                                        (local.get $l154))
                                      (local.tee $l156
                                        (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                                    (local.tee $l157
                                      (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
                              (local.set $l158
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l153))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l154))))
                              (br $B87))
                            (local.set $l158
                              (call $fma4_tie
                                (local.get $l149)
                                (local.get $l135)
                                (local.get $l133))))
                          (local.set $l154
                            (v128.and
                              (local.get $l155)
                              (local.tee $l153
                                (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
                          (local.set $l160
                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                              (local.tee $l155
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l145)
                                    (f64x2.promote_low_f32x4
                                      (local.get $l136)))
                                  (f64x2.promote_low_f32x4
                                    (local.tee $l133
                                      (f32x4.sub
                                        (f32x4.mul
                                          (local.get $l152)
                                          (v128.load32_splat offset=72
                                            (local.get $p8)))
                                        (v128.load offset=1904
                                          (local.get $l28)))))))
                              (local.tee $l159
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l145)
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l136)
                                        (local.get $l136))))
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l133)
                                      (local.get $l133)))))))
                          (block $B89
                            (block $B90
                              (br_if $B90
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l155)
                                        (local.get $l159))
                                      (local.get $l156))
                                    (local.get $l157))))
                              (local.set $l155
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l155))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l159))))
                              (br $B89))
                            (local.set $l155
                              (call $fma4_tie
                                (local.get $l148)
                                (local.get $l136)
                                (local.get $l133))))
                          (local.set $l159
                            (i32x4.max_s
                              (local.get $l128)
                              (local.get $l154)))
                          (local.set $l154
                            (i32x4.min_s
                              (local.get $l52)
                              (local.get $l154)))
                          (local.set $l128
                            (v128.and
                              (local.get $l160)
                              (local.get $l153)))
                          (local.set $l151
                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                              (local.tee $l133
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l146)
                                    (f64x2.promote_low_f32x4
                                      (local.get $l134)))
                                  (f64x2.promote_low_f32x4
                                    (local.tee $l52
                                      (f32x4.sub
                                        (f32x4.mul
                                          (local.get $l152)
                                          (v128.load32_splat offset=120
                                            (local.get $p8)))
                                        (local.get $l151))))))
                              (local.tee $l152
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l146)
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l134)
                                        (local.get $l134))))
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l52)
                                      (local.get $l52)))))))
                          (block $B91
                            (block $B92
                              (br_if $B92
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l133)
                                        (local.get $l152))
                                      (local.get $l156))
                                    (local.get $l157))))
                              (local.set $l133
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l133))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l152))))
                              (br $B91))
                            (local.set $l133
                              (call $fma4_tie
                                (local.get $l147)
                                (local.get $l134)
                                (local.get $l52))))
                          (local.set $l152
                            (i32x4.max_u
                              (local.get $l159)
                              (local.get $l128)))
                          (local.set $l156
                            (i32x4.min_s
                              (local.get $l154)
                              (local.get $l128)))
                          (local.set $l52
                            (v128.and
                              (local.get $l151)
                              (local.get $l153)))
                          (block $B93
                            (br_if $B93
                              (i32.lt_s
                                (local.get $p13)
                                (i32.const 0)))
                            (v128.store align=1
                              (local.get $p11)
                              (f32x4.add
                                (f32x4.add
                                  (local.get $l155)
                                  (local.get $l133))
                                (local.get $l158))))
                          (local.set $l128
                            (i32x4.max_u
                              (local.get $l152)
                              (local.get $l52)))
                          (local.set $l52
                            (i32x4.min_s
                              (local.get $l156)
                              (local.get $l52)))
                          (v128.store offset=1904
                            (local.get $l28)
                            (local.get $l136))
                          (v128.store offset=1888
                            (local.get $l28)
                            (local.get $l135))
                          (local.set $p24
                            (i32.add
                              (local.get $p24)
                              (i32.const 16)))
                          (local.set $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const 16)))
                          (local.set $l151
                            (local.get $l134))
                          (local.set $l136
                            (local.get $l155))
                          (local.set $l135
                            (local.get $l158))
                          (br_if $L84
                            (i32.ne
                              (local.tee $p13
                                (i32.add
                                  (local.get $p13)
                                  (i32.const 1)))
                              (local.get $l45))))
                        (v128.store offset=1936
                          (local.get $l28)
                          (local.get $l158))
                        (v128.store offset=1920
                          (local.get $l28)
                          (local.get $l134))
                        (v128.store offset=1696
                          (local.get $l28)
                          (local.get $l158))
                        (v128.store offset=1952
                          (local.get $l28)
                          (local.get $l155))
                        (v128.store offset=1760
                          (local.get $l28)
                          (local.get $l155))
                        (v128.store offset=1968
                          (local.get $l28)
                          (local.get $l133))
                        (v128.store offset=1824
                          (local.get $l28)
                          (local.get $l133))
                        (local.set $l51
                          (local.get $l45)))
                      (block $B94
                        (br_if $B94
                          (i32.ge_s
                            (local.get $l51)
                            (local.get $l40)))
                        (loop $L95
                          (local.set $l153
                            (f32x4.add
                              (v128.load align=1
                                (i32.add
                                  (local.tee $p13
                                    (i32.add
                                      (local.get $l36)
                                      (local.tee $l46
                                        (i32.shl
                                          (local.get $l51)
                                          (i32.const 4)))))
                                  (i32.const -96)))
                              (v128.load align=1
                                (i32.add
                                  (local.get $p13)
                                  (i32.const 64)))))
                          (local.set $l151
                            (f32x4.mul
                              (local.tee $l148
                                (f32x4.add
                                  (v128.load align=1
                                    (i32.add
                                      (local.tee $p13
                                        (i32.add
                                          (local.get $l36)
                                          (local.tee $l48
                                            (i32.add
                                              (local.get $l46)
                                              (i32.const 16)))))
                                      (i32.const -96)))
                                  (v128.load align=1
                                    (i32.add
                                      (local.get $p13)
                                      (i32.const 64)))))
                              (local.tee $l133
                                (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))))
                          (local.set $l159
                            (f32x4.mul
                              (local.tee $l161
                                (f32x4.add
                                  (v128.load align=1
                                    (i32.add
                                      (local.tee $p13
                                        (i32.add
                                          (local.get $l36)
                                          (local.tee $l49
                                            (i32.add
                                              (local.get $l46)
                                              (i32.const 32)))))
                                      (i32.const -96)))
                                  (v128.load align=1
                                    (i32.add
                                      (local.get $p13)
                                      (i32.const 64)))))
                              (local.get $l133)))
                          (local.set $l154
                            (f32x4.mul
                              (local.tee $l162
                                (f32x4.add
                                  (v128.load align=1
                                    (i32.add
                                      (local.tee $p13
                                        (i32.add
                                          (local.get $l36)
                                          (local.tee $l29
                                            (i32.add
                                              (local.get $l46)
                                              (i32.const 48)))))
                                      (i32.const -96)))
                                  (v128.load align=1
                                    (i32.add
                                      (local.get $p13)
                                      (i32.const 64)))))
                              (local.get $l133)))
                          (local.set $l163
                            (f64x2.promote_low_f32x4
                              (local.get $l162)))
                          (local.set $l149
                            (f64x2.promote_low_f32x4
                              (local.get $l161)))
                          (local.set $l160
                            (f64x2.promote_low_f32x4
                              (local.get $l148)))
                          (local.set $l164
                            (f64x2.promote_low_f32x4
                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                (local.get $l162)
                                (local.get $l162))))
                          (local.set $l165
                            (f64x2.promote_low_f32x4
                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                (local.get $l161)
                                (local.get $l161))))
                          (local.set $l147
                            (f64x2.promote_low_f32x4
                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                (local.get $l148)
                                (local.get $l148))))
                          (local.set $p9
                            (i32.add
                              (local.get $l28)
                              (i32.const 544)))
                          (local.set $p16
                            (i32.const 0))
                          (local.set $p26
                            (local.get $l42))
                          (local.set $p27
                            (i32.const 0))
                          (loop $L96
                            (local.set $p25
                              (i32.add
                                (i32.add
                                  (local.get $l28)
                                  (i32.const 1888))
                                (local.tee $p13
                                  (i32.shl
                                    (local.get $p27)
                                    (i32.const 4)))))
                            (local.set $p6
                              (i32.add
                                (i32.add
                                  (local.get $l28)
                                  (i32.const 528))
                                (i32.shl
                                  (local.get $p27)
                                  (i32.const 2))))
                            (local.set $l156
                              (f64x2.promote_low_f32x4
                                (local.tee $l150
                                  (v128.load
                                    (i32.add
                                      (i32.add
                                        (local.get $l28)
                                        (i32.const 1936))
                                      (local.get $p13))))))
                            (local.set $l157
                              (f64x2.promote_low_f32x4
                                (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                  (local.get $l150)
                                  (local.get $l150))))
                            (local.set $p13
                              (i32.const -128))
                            (local.set $p24
                              (local.get $p16))
                            (local.set $p11
                              (local.get $p26))
                            (local.set $p10
                              (i32.const 0))
                            (loop $L97
                              (local.set $l133
                                (f32x4.mul
                                  (local.get $l153)
                                  (v128.load32_splat
                                    (local.get $p11))))
                              (block $B98
                                (block $B99
                                  (block $B100
                                    (block $B101
                                      (block $B102
                                        (br_if $B102
                                          (i32.eq
                                            (local.get $p13)
                                            (i32.const -128)))
                                        (local.set $l134
                                          (v128.and
                                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                              (local.tee $l135
                                                (f64x2.add
                                                  (f64x2.mul
                                                    (local.tee $l134
                                                      (v128.load
                                                        (i32.add
                                                          (local.tee $p5
                                                            (i32.add
                                                              (local.get $p9)
                                                              (local.get $p13)))
                                                          (i32.const 112))))
                                                    (local.get $l160))
                                                  (f64x2.promote_low_f32x4
                                                    (local.get $l133))))
                                              (local.tee $l136
                                                (f64x2.add
                                                  (f64x2.mul
                                                    (local.get $l134)
                                                    (local.get $l147))
                                                  (f64x2.promote_low_f32x4
                                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                      (local.get $l133)
                                                      (local.get $l133))))))
                                            (local.tee $l152
                                              (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
                                        (br_if $B101
                                          (v128.any_true
                                            (i32x4.eq
                                              (v128.and
                                                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                                  (local.get $l135)
                                                  (local.get $l136))
                                                (local.tee $l158
                                                  (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                                              (local.tee $l155
                                                (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
                                        (local.set $l133
                                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                            (f32x4.demote_f64x2_zero
                                              (local.get $l135))
                                            (f32x4.demote_f64x2_zero
                                              (local.get $l136))))
                                        (br $B100))
                                      (local.set $l133
                                        (f32x4.add
                                          (local.get $l154)
                                          (f32x4.add
                                            (local.get $l159)
                                            (f32x4.add
                                              (local.get $l151)
                                              (local.get $l133)))))
                                      (br_if $B99
                                        (i32.eqz
                                          (i32.load
                                            (local.get $p6))))
                                      (local.set $l133
                                        (f32x4.sub
                                          (local.get $l133)
                                          (v128.load
                                            (local.get $p25))))
                                      (br $B98))
                                    (local.set $l133
                                      (call $fma4_tie
                                        (v128.load32_splat
                                          (i32.add
                                            (local.get $p5)
                                            (i32.const 96)))
                                        (local.get $l148)
                                        (local.get $l133))))
                                  (local.set $l128
                                    (i32x4.max_s
                                      (local.get $l128)
                                      (local.get $l134)))
                                  (local.set $l52
                                    (i32x4.min_s
                                      (local.get $l52)
                                      (local.get $l134)))
                                  (block $B103
                                    (block $B104
                                      (br_if $B104
                                        (i32.eq
                                          (local.get $p13)
                                          (i32.const -96)))
                                      (local.set $l134
                                        (v128.and
                                          (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                            (local.tee $l135
                                              (f64x2.add
                                                (f64x2.mul
                                                  (local.tee $l134
                                                    (v128.load
                                                      (i32.add
                                                        (local.get $p5)
                                                        (i32.const 80))))
                                                  (local.get $l149))
                                                (f64x2.promote_low_f32x4
                                                  (local.get $l133))))
                                            (local.tee $l136
                                              (f64x2.add
                                                (f64x2.mul
                                                  (local.get $l134)
                                                  (local.get $l165))
                                                (f64x2.promote_low_f32x4
                                                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                    (local.get $l133)
                                                    (local.get $l133))))))
                                          (local.get $l152)))
                                      (block $B105
                                        (block $B106
                                          (br_if $B106
                                            (v128.any_true
                                              (i32x4.eq
                                                (v128.and
                                                  (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                                    (local.get $l135)
                                                    (local.get $l136))
                                                  (local.get $l158))
                                                (local.get $l155))))
                                          (local.set $l133
                                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                              (f32x4.demote_f64x2_zero
                                                (local.get $l135))
                                              (f32x4.demote_f64x2_zero
                                                (local.get $l136))))
                                          (br $B105))
                                        (local.set $l133
                                          (call $fma4_tie
                                            (v128.load32_splat
                                              (i32.add
                                                (local.get $p5)
                                                (i32.const 64)))
                                            (local.get $l161)
                                            (local.get $l133))))
                                      (local.set $l128
                                        (i32x4.max_u
                                          (local.get $l128)
                                          (local.get $l134)))
                                      (local.set $l52
                                        (i32x4.min_s
                                          (local.get $l52)
                                          (local.get $l134)))
                                      (block $B107
                                        (br_if $B107
                                          (i32.gt_u
                                            (local.get $p10)
                                            (i32.const 2)))
                                        (local.set $l133
                                          (f32x4.add
                                            (local.get $l154)
                                            (local.get $l133)))
                                        (br $B99))
                                      (local.set $l128
                                        (i32x4.max_u
                                          (local.get $l128)
                                          (local.tee $l136
                                            (v128.and
                                              (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                                (local.tee $l134
                                                  (f64x2.add
                                                    (f64x2.mul
                                                      (local.tee $l135
                                                        (v128.load
                                                          (i32.add
                                                            (local.get $p5)
                                                            (i32.const 48))))
                                                      (local.get $l163))
                                                    (f64x2.promote_low_f32x4
                                                      (local.get $l133))))
                                                (local.tee $l135
                                                  (f64x2.add
                                                    (f64x2.mul
                                                      (local.get $l135)
                                                      (local.get $l164))
                                                    (f64x2.promote_low_f32x4
                                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                        (local.get $l133)
                                                        (local.get $l133))))))
                                              (local.get $l152)))))
                                      (local.set $l52
                                        (i32x4.min_s
                                          (local.get $l52)
                                          (local.get $l136)))
                                      (br_if $B103
                                        (v128.any_true
                                          (i32x4.eq
                                            (v128.and
                                              (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                                (local.get $l134)
                                                (local.get $l135))
                                              (local.get $l158))
                                            (local.get $l155))))
                                      (local.set $l133
                                        (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                          (f32x4.demote_f64x2_zero
                                            (local.get $l134))
                                          (f32x4.demote_f64x2_zero
                                            (local.get $l135))))
                                      (br $B99))
                                    (local.set $l133
                                      (f32x4.add
                                        (local.get $l154)
                                        (f32x4.add
                                          (local.get $l159)
                                          (local.get $l133))))
                                    (br $B99))
                                  (local.set $l133
                                    (call $fma4_tie
                                      (v128.load32_splat
                                        (i32.add
                                          (local.get $p5)
                                          (i32.const 32)))
                                      (local.get $l162)
                                      (local.get $l133))))
                                (local.set $l128
                                  (i32x4.max_s
                                    (local.get $l128)
                                    (local.tee $l152
                                      (v128.and
                                        (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                          (local.tee $l135
                                            (f64x2.add
                                              (f64x2.mul
                                                (local.tee $l136
                                                  (v128.load
                                                    (i32.add
                                                      (local.tee $p5
                                                        (i32.add
                                                          (local.get $p9)
                                                          (local.get $p13)))
                                                      (i32.const 400))))
                                                (f64x2.promote_low_f32x4
                                                  (local.tee $l134
                                                    (v128.load
                                                      (local.get $p25)))))
                                              (f64x2.promote_low_f32x4
                                                (local.get $l133))))
                                          (local.tee $l136
                                            (f64x2.add
                                              (f64x2.mul
                                                (local.get $l136)
                                                (f64x2.promote_low_f32x4
                                                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                    (local.get $l134)
                                                    (local.get $l134))))
                                              (f64x2.promote_low_f32x4
                                                (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                  (local.get $l133)
                                                  (local.get $l133))))))
                                        (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000)))))
                                (local.set $l52
                                  (i32x4.min_s
                                    (local.get $l52)
                                    (local.get $l152)))
                                (block $B108
                                  (br_if $B108
                                    (v128.any_true
                                      (i32x4.eq
                                        (v128.and
                                          (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                            (local.get $l135)
                                            (local.get $l136))
                                          (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff))
                                        (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000))))
                                  (local.set $l133
                                    (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                      (f32x4.demote_f64x2_zero
                                        (local.get $l135))
                                      (f32x4.demote_f64x2_zero
                                        (local.get $l136))))
                                  (br $B98))
                                (local.set $l133
                                  (call $fma4_tie
                                    (v128.load32_splat
                                      (i32.add
                                        (local.get $p5)
                                        (i32.const 384)))
                                    (local.get $l134)
                                    (local.get $l133))))
                              (local.set $l134
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l135
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.tee $l134
                                            (v128.load
                                              (i32.add
                                                (local.tee $p5
                                                  (i32.add
                                                    (local.get $p9)
                                                    (local.get $p13)))
                                                (i32.const 272))))
                                          (local.get $l156))
                                        (f64x2.promote_low_f32x4
                                          (local.get $l133))))
                                    (local.tee $l136
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l134)
                                          (local.get $l157))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l133)
                                            (local.get $l133))))))
                                  (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000)))
                              (block $B109
                                (block $B110
                                  (br_if $B110
                                    (v128.any_true
                                      (i32x4.eq
                                        (v128.and
                                          (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                            (local.get $l135)
                                            (local.get $l136))
                                          (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff))
                                        (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000))))
                                  (local.set $l133
                                    (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                      (f32x4.demote_f64x2_zero
                                        (local.get $l135))
                                      (f32x4.demote_f64x2_zero
                                        (local.get $l136))))
                                  (br $B109))
                                (local.set $l133
                                  (call $fma4_tie
                                    (v128.load32_splat
                                      (i32.add
                                        (local.get $p5)
                                        (i32.const 256)))
                                    (local.get $l150)
                                    (local.get $l133))))
                              (local.set $l128
                                (i32x4.max_s
                                  (local.get $l128)
                                  (local.get $l134)))
                              (local.set $l52
                                (i32x4.min_s
                                  (local.get $l52)
                                  (local.get $l134)))
                              (v128.store
                                (i32.add
                                  (i32.add
                                    (local.get $l28)
                                    (i32.const 1696))
                                  (local.get $p24))
                                (local.get $l133))
                              (local.set $p24
                                (i32.add
                                  (local.get $p24)
                                  (i32.const 16)))
                              (local.set $p11
                                (i32.add
                                  (local.get $p11)
                                  (i32.const 4)))
                              (local.set $p10
                                (i32.add
                                  (local.get $p10)
                                  (i32.const 1)))
                              (br_if $L97
                                (local.tee $p13
                                  (i32.add
                                    (local.get $p13)
                                    (i32.const 32)))))
                            (local.set $p16
                              (i32.add
                                (local.get $p16)
                                (i32.const 64)))
                            (local.set $p26
                              (i32.add
                                (local.get $p26)
                                (i32.const 48)))
                            (local.set $p9
                              (i32.add
                                (local.get $p9)
                                (i32.const 384)))
                            (br_if $L96
                              (i32.ne
                                (local.tee $p27
                                  (i32.add
                                    (local.get $p27)
                                    (i32.const 1)))
                                (i32.const 3))))
                          (v128.store align=1
                            (i32.add
                              (local.get $l50)
                              (local.get $l46))
                            (f32x4.add
                              (v128.load offset=1696
                                (local.get $l28))
                              (f32x4.add
                                (v128.load offset=1760
                                  (local.get $l28))
                                (v128.load offset=1824
                                  (local.get $l28)))))
                          (v128.store align=1
                            (i32.add
                              (local.get $l50)
                              (local.get $l48))
                            (f32x4.add
                              (v128.load offset=1712
                                (local.get $l28))
                              (f32x4.add
                                (v128.load offset=1776
                                  (local.get $l28))
                                (v128.load offset=1840
                                  (local.get $l28)))))
                          (v128.store align=1
                            (i32.add
                              (local.get $l50)
                              (local.get $l49))
                            (f32x4.add
                              (local.tee $l135
                                (v128.load offset=1728
                                  (local.get $l28)))
                              (f32x4.add
                                (local.tee $l136
                                  (v128.load offset=1792
                                    (local.get $l28)))
                                (local.tee $l134
                                  (v128.load offset=1856
                                    (local.get $l28))))))
                          (v128.store align=1
                            (i32.add
                              (local.get $l50)
                              (local.get $l29))
                            (f32x4.add
                              (local.tee $l152
                                (v128.load offset=1744
                                  (local.get $l28)))
                              (f32x4.add
                                (local.tee $l156
                                  (v128.load offset=1808
                                    (local.get $l28)))
                                (local.tee $l133
                                  (v128.load offset=1872
                                    (local.get $l28))))))
                          (v128.store offset=1888
                            (local.get $l28)
                            (local.get $l135))
                          (v128.store offset=1904
                            (local.get $l28)
                            (local.get $l136))
                          (v128.store offset=1936
                            (local.get $l28)
                            (local.get $l152))
                          (v128.store offset=1952
                            (local.get $l28)
                            (local.get $l156))
                          (v128.store offset=1920
                            (local.get $l28)
                            (local.get $l134))
                          (v128.store offset=1968
                            (local.get $l28)
                            (local.get $l133))
                          (br_if $L95
                            (i32.lt_s
                              (local.tee $l51
                                (i32.add
                                  (local.get $l51)
                                  (i32.const 4)))
                              (local.get $l40)))))
                      (block $B111
                        (br_if $B111
                          (i32.ge_s
                            (local.get $l51)
                            (local.get $p0)))
                        (local.set $p13
                          (i32.add
                            (local.get $l50)
                            (local.tee $p24
                              (i32.shl
                                (local.get $l51)
                                (i32.const 4)))))
                        (local.set $p24
                          (i32.add
                            (i32.add
                              (local.get $l36)
                              (local.get $p24))
                            (i32.const 64)))
                        (local.set $l135
                          (v128.load offset=1952
                            (local.get $l28)))
                        (local.set $l136
                          (v128.load offset=1936
                            (local.get $l28)))
                        (local.set $l151
                          (v128.load32_splat offset=1440
                            (local.get $l28)))
                        (local.set $l160
                          (v128.load32_splat offset=1056
                            (local.get $l28)))
                        (local.set $l147
                          (v128.load32_splat offset=672
                            (local.get $l28)))
                        (loop $L112
                          (local.set $l156
                            (local.tee $l152
                              (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                          (block $B113
                            (br_if $B113
                              (i32.lt_s
                                (local.get $l51)
                                (i32.const 6)))
                            (local.set $l156
                              (v128.load align=1
                                (i32.add
                                  (local.get $p24)
                                  (i32.const -160)))))
                          (block $B114
                            (br_if $B114
                              (i32.ge_s
                                (local.tee $p11
                                  (i32.add
                                    (local.get $l51)
                                    (i32.const 4)))
                                (local.get $p0)))
                            (local.set $l152
                              (v128.load align=1
                                (local.get $p24))))
                          (local.set $l153
                            (v128.and
                              (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                (local.tee $l155
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l143)
                                      (f64x2.promote_low_f32x4
                                        (local.get $l136)))
                                    (f64x2.promote_low_f32x4
                                      (local.tee $l152
                                        (f32x4.sub
                                          (f32x4.mul
                                            (local.tee $l156
                                              (f32x4.add
                                                (local.get $l156)
                                                (local.get $l152)))
                                            (v128.load32_splat offset=24
                                              (local.get $p8)))
                                          (v128.load offset=1888
                                            (local.get $l28)))))))
                                (local.tee $l159
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l143)
                                      (f64x2.promote_low_f32x4
                                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                          (local.get $l136)
                                          (local.get $l136))))
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l152)
                                        (local.get $l152))))))
                              (local.tee $l157
                                (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
                          (block $B115
                            (block $B116
                              (br_if $B116
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l155)
                                        (local.get $l159))
                                      (local.tee $l154
                                        (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                                    (local.tee $l158
                                      (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
                              (local.set $l152
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l155))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l159))))
                              (br $B115))
                            (local.set $l152
                              (call $fma4_tie
                                (local.get $l147)
                                (local.get $l136)
                                (local.get $l152))))
                          (local.set $l159
                            (i32x4.max_s
                              (local.get $l128)
                              (local.get $l153)))
                          (local.set $l150
                            (i32x4.min_s
                              (local.get $l52)
                              (local.get $l153)))
                          (local.set $l128
                            (v128.and
                              (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                (local.tee $l153
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l145)
                                      (f64x2.promote_low_f32x4
                                        (local.get $l135)))
                                    (f64x2.promote_low_f32x4
                                      (local.tee $l52
                                        (f32x4.sub
                                          (f32x4.mul
                                            (local.get $l156)
                                            (v128.load32_splat offset=72
                                              (local.get $p8)))
                                          (v128.load offset=1904
                                            (local.get $l28)))))))
                                (local.tee $l155
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l145)
                                      (f64x2.promote_low_f32x4
                                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                          (local.get $l135)
                                          (local.get $l135))))
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l52)
                                        (local.get $l52))))))
                              (local.get $l157)))
                          (block $B117
                            (block $B118
                              (br_if $B118
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l153)
                                        (local.get $l155))
                                      (local.get $l154))
                                    (local.get $l158))))
                              (local.set $l153
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l153))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l155))))
                              (br $B117))
                            (local.set $l153
                              (call $fma4_tie
                                (local.get $l160)
                                (local.get $l135)
                                (local.get $l52))))
                          (local.set $l155
                            (i32x4.max_u
                              (local.get $l159)
                              (local.get $l128)))
                          (local.set $l159
                            (i32x4.min_s
                              (local.get $l150)
                              (local.get $l128)))
                          (local.set $l134
                            (v128.and
                              (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                (local.tee $l128
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l146)
                                      (f64x2.promote_low_f32x4
                                        (local.get $l133)))
                                    (f64x2.promote_low_f32x4
                                      (local.tee $l52
                                        (f32x4.sub
                                          (f32x4.mul
                                            (local.get $l156)
                                            (v128.load32_splat offset=120
                                              (local.get $p8)))
                                          (local.get $l134))))))
                                (local.tee $l156
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l146)
                                      (f64x2.promote_low_f32x4
                                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                          (local.get $l133)
                                          (local.get $l133))))
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l52)
                                        (local.get $l52))))))
                              (local.get $l157)))
                          (block $B119
                            (block $B120
                              (br_if $B120
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l128)
                                        (local.get $l156))
                                      (local.get $l154))
                                    (local.get $l158))))
                              (local.set $l156
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l128))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l156))))
                              (br $B119))
                            (local.set $l156
                              (call $fma4_tie
                                (local.get $l151)
                                (local.get $l133)
                                (local.get $l52))))
                          (local.set $l128
                            (i32x4.max_u
                              (local.get $l155)
                              (local.get $l134)))
                          (local.set $l52
                            (i32x4.min_s
                              (local.get $l159)
                              (local.get $l134)))
                          (v128.store align=1
                            (local.get $p13)
                            (f32x4.add
                              (f32x4.add
                                (local.get $l153)
                                (local.get $l156))
                              (local.get $l152)))
                          (v128.store offset=1904
                            (local.get $l28)
                            (local.get $l135))
                          (v128.store offset=1888
                            (local.get $l28)
                            (local.get $l136))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 16)))
                          (local.set $p24
                            (i32.add
                              (local.get $p24)
                              (i32.const 16)))
                          (local.set $l134
                            (local.get $l133))
                          (local.set $l133
                            (local.get $l156))
                          (local.set $l135
                            (local.get $l153))
                          (local.set $l136
                            (local.get $l152))
                          (br_if $L112
                            (i32.ne
                              (local.tee $l51
                                (i32.add
                                  (local.get $p11)
                                  (i32.const -3)))
                              (local.get $p0)))))
                      (block $B121
                        (br_if $B121
                          (i32.eqz
                            (v128.any_true
                              (v128.or
                                (i32x4.lt_s
                                  (local.get $l52)
                                  (v128.const i32x4 0x38100000 0x38100000 0x38100000 0x38100000))
                                (i32x4.gt_u
                                  (local.get $l128)
                                  (v128.const i32x4 0x47e00000 0x47e00000 0x47e00000 0x47e00000))))))
                        (call $blur_lane
                          (local.get $l36)
                          (local.get $l50)
                          (local.get $p0)
                          (local.get $p8)
                          (i32.const 0))
                        (call $blur_lane
                          (local.get $l36)
                          (local.get $l50)
                          (local.get $p0)
                          (local.get $p8)
                          (i32.const 1))
                        (call $blur_lane
                          (local.get $l36)
                          (local.get $l50)
                          (local.get $p0)
                          (local.get $p8)
                          (i32.const 2))
                        (call $blur_lane
                          (local.get $l36)
                          (local.get $l50)
                          (local.get $p0)
                          (local.get $p8)
                          (i32.const 3)))
                      (local.set $p10
                        (i32.const 0))
                      (block $B122
                        (br_if $B122
                          (local.get $l132))
                        (local.set $p5
                          (i32.const 0))
                        (local.set $p13
                          (i32.const 4))
                        (loop $L123
                          (local.set $p10
                            (local.get $p13))
                          (v128.store offset=592
                            (local.get $l28)
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
                              (local.tee $l133
                                (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                                  (local.tee $l52
                                    (v128.load align=1
                                      (local.tee $p13
                                        (i32.add
                                          (local.get $l50)
                                          (i32.shl
                                            (local.get $p5)
                                            (i32.const 4))))))
                                  (local.tee $l128
                                    (v128.load offset=16 align=1
                                      (local.get $p13)))))
                              (local.tee $l136
                                (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                                  (local.tee $l134
                                    (v128.load offset=32 align=1
                                      (local.get $p13)))
                                  (local.tee $l135
                                    (v128.load offset=48 align=1
                                      (local.get $p13)))))))
                          (v128.store offset=576
                            (local.get $l28)
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (local.get $l133)
                              (local.get $l136)))
                          (v128.store offset=560
                            (local.get $l28)
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
                              (local.tee $l52
                                (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                                  (local.get $l52)
                                  (local.get $l128)))
                              (local.tee $l128
                                (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                                  (local.get $l134)
                                  (local.get $l135)))))
                          (v128.store offset=544
                            (local.get $l28)
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (local.get $l52)
                              (local.get $l128)))
                          (local.set $p11
                            (i32.const 0))
                          (block $B124
                            (block $B125
                              (br_if $B125
                                (i32.eqz
                                  (local.get $l43)))
                              (local.set $p11
                                (i32.const 0))
                              (local.set $p13
                                (local.get $l28))
                              (local.set $p24
                                (i32.add
                                  (local.get $l28)
                                  (i32.const 544)))
                              (loop $L126
                                (v128.store align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $p13))
                                    (local.tee $p9
                                      (i32.shl
                                        (local.get $p5)
                                        (i32.const 2))))
                                  (v128.load
                                    (local.get $p24)))
                                (v128.store align=1
                                  (i32.add
                                    (i32.load
                                      (i32.add
                                        (local.get $p13)
                                        (i32.const 4)))
                                    (local.get $p9))
                                  (v128.load
                                    (i32.add
                                      (local.get $p24)
                                      (i32.const 16))))
                                (local.set $p24
                                  (i32.add
                                    (local.get $p24)
                                    (i32.const 32)))
                                (local.set $p13
                                  (i32.add
                                    (local.get $p13)
                                    (i32.const 8)))
                                (br_if $L126
                                  (i32.ne
                                    (local.get $l35)
                                    (local.tee $p11
                                      (i32.add
                                        (local.get $p11)
                                        (i32.const 2))))))
                              (br_if $B124
                                (i32.eqz
                                  (local.get $l38))))
                            (v128.store align=1
                              (i32.add
                                (i32.load
                                  (i32.add
                                    (local.get $l28)
                                    (i32.shl
                                      (local.get $p11)
                                      (i32.const 2))))
                                (i32.shl
                                  (local.get $p5)
                                  (i32.const 2)))
                              (v128.load
                                (i32.add
                                  (i32.add
                                    (local.get $l28)
                                    (i32.const 544))
                                  (i32.shl
                                    (local.get $p11)
                                    (i32.const 4))))))
                          (local.set $p5
                            (local.get $p10))
                          (br_if $L123
                            (i32.le_s
                              (local.tee $p13
                                (i32.add
                                  (local.get $p10)
                                  (i32.const 4)))
                              (local.get $p0)))))
                      (br_if $B59
                        (i32.ge_s
                          (local.get $p10)
                          (local.get $p0)))
                      (local.set $p5
                        (i32.add
                          (local.get $l50)
                          (i32.shl
                            (local.get $p10)
                            (i32.const 4))))
                      (loop $L127
                        (local.set $p13
                          (i32.const 0))
                        (block $B128
                          (block $B129
                            (br_if $B129
                              (i32.lt_u
                                (local.get $l43)
                                (i32.const 3)))
                            (local.set $p9
                              (i32.const 0))
                            (local.set $p13
                              (local.get $l28))
                            (local.set $p24
                              (local.get $p5))
                            (loop $L130
                              (f32.store
                                (i32.add
                                  (i32.load
                                    (local.get $p13))
                                  (local.tee $p11
                                    (i32.shl
                                      (local.get $p10)
                                      (i32.const 2))))
                                (f32.load
                                  (local.get $p24)))
                              (f32.store
                                (i32.add
                                  (i32.load
                                    (i32.add
                                      (local.get $p13)
                                      (i32.const 4)))
                                  (local.get $p11))
                                (f32.load
                                  (i32.add
                                    (local.get $p24)
                                    (i32.const 4))))
                              (f32.store
                                (i32.add
                                  (i32.load
                                    (i32.add
                                      (local.get $p13)
                                      (i32.const 8)))
                                  (local.get $p11))
                                (f32.load
                                  (i32.add
                                    (local.get $p24)
                                    (i32.const 8))))
                              (f32.store
                                (i32.add
                                  (i32.load
                                    (i32.add
                                      (local.get $p13)
                                      (i32.const 12)))
                                  (local.get $p11))
                                (f32.load
                                  (i32.add
                                    (local.get $p24)
                                    (i32.const 12))))
                              (local.set $p24
                                (i32.add
                                  (local.get $p24)
                                  (i32.const 16)))
                              (local.set $p13
                                (i32.add
                                  (local.get $p13)
                                  (i32.const 16)))
                              (br_if $L130
                                (i32.ne
                                  (local.get $l37)
                                  (local.tee $p9
                                    (i32.add
                                      (local.get $p9)
                                      (i32.const -4))))))
                            (br_if $B128
                              (i32.eqz
                                (local.get $l44)))
                            (local.set $p13
                              (i32.sub
                                (i32.const 0)
                                (local.get $p9))))
                          (local.set $p13
                            (i32.shl
                              (local.get $p13)
                              (i32.const 2)))
                          (local.set $p24
                            (local.get $l44))
                          (loop $L131
                            (f32.store
                              (i32.add
                                (i32.load
                                  (i32.add
                                    (local.get $l28)
                                    (local.get $p13)))
                                (i32.shl
                                  (local.get $p10)
                                  (i32.const 2)))
                              (f32.load
                                (i32.add
                                  (local.get $p5)
                                  (local.get $p13))))
                            (local.set $p13
                              (i32.add
                                (local.get $p13)
                                (i32.const 4)))
                            (br_if $L131
                              (local.tee $p24
                                (i32.add
                                  (local.get $p24)
                                  (i32.const -1))))))
                        (local.set $p5
                          (i32.add
                            (local.get $p5)
                            (i32.const 16)))
                        (br_if $L127
                          (i32.ne
                            (local.tee $p10
                              (i32.add
                                (local.get $p10)
                                (i32.const 1)))
                            (local.get $p0)))))
                    (br_if $L58
                      (i32.ne
                        (local.tee $l47
                          (i32.add
                            (local.get $l47)
                            (i32.const 1)))
                        (i32.const 5))))
                  (br_if $L41
                    (i32.ne
                      (local.tee $l127
                        (i32.add
                          (local.get $l127)
                          (i32.const 1)))
                      (local.get $l34)))))
              (br_if $L39
                (i32.ne
                  (local.tee $l118
                    (i32.add
                      (local.get $l118)
                      (i32.const 1)))
                  (i32.const 3))))
            (br_if $B32
              (i32.ge_s
                (local.tee $p23
                  (i32.add
                    (local.get $l106)
                    (local.get $p23)))
                (local.get $p1)))
            (br_if $L33
              (i32.le_s
                (local.get $p23)
                (local.get $l105)))))
        (local.set $p13
          (i32.mul
            (i32.and
              (i32.add
                (local.get $p19)
                (i32.const 10))
              (i32.const 15))
            (local.get $p0)))
        (local.set $p27
          (i32.const -1))
        (block $B132
          (br_if $B132
            (i32.ge_s
              (local.get $l105)
              (local.get $p1)))
          (local.set $p27
            (i32.mul
              (i32.rem_s
                (local.get $l105)
                (i32.const 16))
              (local.get $p0))))
        (local.set $l110
          (i32.mul
            (local.get $l63)
            (local.get $l104)))
        (local.set $l112
          (i32.add
            (local.get $l102)
            (local.tee $p24
              (i32.mul
                (local.get $l62)
                (local.get $l104)))))
        (local.set $l116
          (i32.add
            (local.get $l66)
            (local.get $p24)))
        (local.set $l108
          (i32.mul
            (local.get $l62)
            (i32.and
              (local.get $l101)
              (i32.const 15))))
        (local.set $l37
          (select
            (local.get $p13)
            (i32.const -1)
            (i32.gt_s
              (local.get $p19)
              (i32.const 5))))
        (local.set $p15
          (i32.mul
            (local.get $p19)
            (local.get $p0)))
        (local.set $l51
          (i32.shr_u
            (i32.xor
              (local.get $p19)
              (i32.const -1))
            (i32.const 31)))
        (local.set $l130
          (i32.const 0))
        (local.set $l131
          (i32.shl
            (i32.mul
              (i32.and
                (local.get $p19)
                (i32.const 15))
              (local.get $p0))
            (i32.const 2)))
        (local.set $l132
          (i32.shl
            (i32.mul
              (i32.add
                (local.get $p19)
                (local.get $p1))
              (local.get $p0))
            (i32.const 2)))
        (loop $L133
          (block $B134
            (br_if $B134
              (i32.eqz
                (i32.and
                  (local.tee $p13
                    (i32.shl
                      (i32.const 1)
                      (local.get $l130)))
                  (local.get $p2))))
            (local.set $l137
              (i32.mul
                (local.get $l130)
                (i32.const 48)))
            (local.set $l39
              (i32.and
                (local.get $p13)
                (local.get $p12)))
            (local.set $l107
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 504))
                (local.tee $p13
                  (i32.shl
                    (local.get $l130)
                    (i32.const 2)))))
            (local.set $l129
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 516))
                (local.get $p13)))
            (local.set $l127
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 480))
                (local.get $p13)))
            (local.set $l32
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 96))
                (local.tee $p13
                  (i32.mul
                    (local.get $l130)
                    (i32.const 20)))))
            (local.set $l138
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 224))
                (local.get $p13)))
            (local.set $l139
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 352))
                (local.get $p13)))
            (local.set $l38
              (i32.const 0))
            (loop $L135
              (local.set $l33
                (i32.add
                  (local.get $l32)
                  (local.tee $p13
                    (i32.mul
                      (local.get $l38)
                      (i32.const 60)))))
              (local.set $l31
                (i32.add
                  (local.get $l138)
                  (local.get $p13)))
              (local.set $l44
                (i32.add
                  (local.get $l139)
                  (local.get $p13)))
              (local.set $l49
                (i32.const 0))
              (loop $L136
                (block $B137
                  (br_if $B137
                    (i32.eqz
                      (local.tee $l35
                        (i32.load
                          (i32.add
                            (local.get $l44)
                            (local.tee $p13
                              (i32.shl
                                (local.get $l49)
                                (i32.const 2))))))))
                  (block $B138
                    (br_if $B138
                      (i32.eqz
                        (local.get $l38)))
                    (br_if $B137
                      (i32.eqz
                        (i32.and
                          (local.get $l49)
                          (i32.const 5)))))
                  (local.set $p10
                    (i32.add
                      (local.tee $p11
                        (i32.load
                          (i32.add
                            (local.get $l31)
                            (local.get $p13))))
                      (local.get $l62)))
                  (local.set $p9
                    (i32.add
                      (local.get $p11)
                      (local.get $l57)))
                  (local.set $p5
                    (i32.add
                      (local.get $p11)
                      (local.get $l41)))
                  (local.set $p25
                    (i32.add
                      (local.get $p11)
                      (local.get $l58)))
                  (local.set $p6
                    (i32.add
                      (local.get $p11)
                      (local.get $l59)))
                  (local.set $p26
                    (i32.load
                      (i32.add
                        (local.get $l33)
                        (local.get $p13))))
                  (local.set $p16
                    (i32.const 0))
                  (block $B139
                    (br_if $B139
                      (i32.lt_s
                        (local.get $p0)
                        (i32.const 4)))
                    (local.set $l29
                      (i32.add
                        (local.get $l35)
                        (i32.shl
                          (local.get $p27)
                          (i32.const 2))))
                    (local.set $l47
                      (i32.add
                        (local.get $l35)
                        (i32.shl
                          (local.get $l37)
                          (i32.const 2))))
                    (local.set $l164
                      (f32x4.splat
                        (local.tee $l140
                          (f32.load offset=8
                            (local.get $p8)))))
                    (local.set $l162
                      (f32x4.splat
                        (local.tee $l141
                          (f32.load offset=4
                            (local.get $p8)))))
                    (local.set $l143
                      (f32x4.splat
                        (local.tee $l142
                          (f32.load
                            (local.get $p8)))))
                    (local.set $l159
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l140))))
                    (local.set $l145
                      (f32x4.splat
                        (local.tee $l140
                          (f32.neg
                            (f32.load offset=20
                              (local.get $p8))))))
                    (local.set $l150
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l141))))
                    (local.set $l146
                      (f32x4.splat
                        (local.tee $l141
                          (f32.neg
                            (f32.load offset=16
                              (local.get $p8))))))
                    (local.set $l151
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l142))))
                    (local.set $l121
                      (f32x4.splat
                        (local.tee $l142
                          (f32.neg
                            (f32.load offset=12
                              (local.get $p8))))))
                    (local.set $l160
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l140))))
                    (local.set $l147
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l141))))
                    (local.set $l148
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l142))))
                    (local.set $p24
                      (i32.const 0))
                    (local.set $p13
                      (i32.const 0))
                    (loop $L140
                      (local.set $l133
                        (local.tee $l128
                          (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                      (block $B141
                        (br_if $B141
                          (i32.lt_s
                            (local.get $p19)
                            (i32.const 6)))
                        (local.set $l133
                          (v128.load align=1
                            (i32.add
                              (local.get $l47)
                              (local.get $p13)))))
                      (block $B142
                        (br_if $B142
                          (i32.lt_s
                            (local.get $p27)
                            (i32.const 0)))
                        (local.set $l128
                          (v128.load align=1
                            (i32.add
                              (local.get $l29)
                              (local.get $p13)))))
                      (local.set $l157
                        (v128.and
                          (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                            (local.tee $l153
                              (f64x2.add
                                (f64x2.mul
                                  (local.get $l148)
                                  (f64x2.promote_low_f32x4
                                    (local.tee $l156
                                      (v128.load align=1
                                        (local.tee $p16
                                          (i32.add
                                            (local.get $p11)
                                            (local.get $p13)))))))
                                (f64x2.promote_low_f32x4
                                  (local.tee $l152
                                    (f32x4.neg
                                      (v128.load align=1
                                        (local.tee $l50
                                          (i32.add
                                            (local.get $p10)
                                            (local.get $p13)))))))))
                            (local.tee $l154
                              (f64x2.add
                                (f64x2.mul
                                  (local.get $l148)
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l156)
                                      (local.get $l156))))
                                (f64x2.promote_low_f32x4
                                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                    (local.get $l152)
                                    (local.get $l152))))))
                          (local.tee $l52
                            (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
                      (local.set $l134
                        (f32x4.add
                          (local.get $l133)
                          (local.get $l128)))
                      (local.set $l135
                        (v128.load align=1
                          (local.tee $l46
                            (i32.add
                              (local.get $p5)
                              (local.get $p13)))))
                      (local.set $l136
                        (v128.load align=1
                          (local.tee $l36
                            (i32.add
                              (local.get $p6)
                              (local.get $p13)))))
                      (block $B143
                        (block $B144
                          (br_if $B144
                            (v128.any_true
                              (i32x4.eq
                                (v128.and
                                  (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                    (local.get $l153)
                                    (local.get $l154))
                                  (local.tee $l128
                                    (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                                (local.tee $l133
                                  (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
                          (local.set $l152
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (f32x4.demote_f64x2_zero
                                (local.get $l153))
                              (f32x4.demote_f64x2_zero
                                (local.get $l154))))
                          (br $B143))
                        (local.set $l152
                          (call $fma4_tie
                            (local.get $l121)
                            (local.get $l156)
                            (local.get $l152))))
                      (local.set $l165
                        (i32x4.max_u
                          (local.get $l157)
                          (local.tee $l149
                            (v128.and
                              (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                (local.tee $l158
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l151)
                                      (local.tee $l153
                                        (f64x2.promote_low_f32x4
                                          (local.get $l134))))
                                    (f64x2.promote_low_f32x4
                                      (local.get $l152))))
                                (local.tee $l155
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l151)
                                      (local.tee $l154
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l134)
                                            (local.get $l134)))))
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l152)
                                        (local.get $l152))))))
                              (local.get $l52)))))
                      (local.set $l149
                        (i32x4.min_u
                          (local.get $l157)
                          (local.get $l149)))
                      (block $B145
                        (block $B146
                          (br_if $B146
                            (v128.any_true
                              (i32x4.eq
                                (v128.and
                                  (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                    (local.get $l158)
                                    (local.get $l155))
                                  (local.get $l128))
                                (local.get $l133))))
                          (local.set $l161
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (f32x4.demote_f64x2_zero
                                (local.get $l158))
                              (f32x4.demote_f64x2_zero
                                (local.get $l155))))
                          (br $B145))
                        (local.set $l161
                          (call $fma4_tie
                            (local.get $l143)
                            (local.get $l134)
                            (local.get $l152))))
                      (local.set $l165
                        (i32x4.max_u
                          (local.get $l165)
                          (local.tee $l155
                            (v128.and
                              (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                (local.tee $l157
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l147)
                                      (f64x2.promote_low_f32x4
                                        (local.get $l136)))
                                    (f64x2.promote_low_f32x4
                                      (local.tee $l152
                                        (f32x4.neg
                                          (v128.load align=1
                                            (local.tee $l43
                                              (i32.add
                                                (local.get $p25)
                                                (local.get $p13)))))))))
                                (local.tee $l158
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l147)
                                      (f64x2.promote_low_f32x4
                                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                          (local.get $l136)
                                          (local.get $l136))))
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l152)
                                        (local.get $l152))))))
                              (local.get $l52)))))
                      (local.set $l155
                        (i32x4.min_u
                          (local.get $l149)
                          (local.get $l155)))
                      (block $B147
                        (block $B148
                          (br_if $B148
                            (v128.any_true
                              (i32x4.eq
                                (v128.and
                                  (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                    (local.get $l157)
                                    (local.get $l158))
                                  (local.get $l128))
                                (local.get $l133))))
                          (local.set $l152
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (f32x4.demote_f64x2_zero
                                (local.get $l157))
                              (f32x4.demote_f64x2_zero
                                (local.get $l158))))
                          (br $B147))
                        (local.set $l152
                          (call $fma4_tie
                            (local.get $l146)
                            (local.get $l136)
                            (local.get $l152))))
                      (local.set $l165
                        (i32x4.max_u
                          (local.get $l165)
                          (local.tee $l149
                            (v128.and
                              (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                (local.tee $l157
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l150)
                                      (local.get $l153))
                                    (f64x2.promote_low_f32x4
                                      (local.get $l152))))
                                (local.tee $l158
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l150)
                                      (local.get $l154))
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l152)
                                        (local.get $l152))))))
                              (local.get $l52)))))
                      (local.set $l155
                        (i32x4.min_u
                          (local.get $l155)
                          (local.get $l149)))
                      (block $B149
                        (block $B150
                          (br_if $B150
                            (v128.any_true
                              (i32x4.eq
                                (v128.and
                                  (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                    (local.get $l157)
                                    (local.get $l158))
                                  (local.get $l128))
                                (local.get $l133))))
                          (local.set $l163
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (f32x4.demote_f64x2_zero
                                (local.get $l157))
                              (f32x4.demote_f64x2_zero
                                (local.get $l158))))
                          (br $B149))
                        (local.set $l163
                          (call $fma4_tie
                            (local.get $l162)
                            (local.get $l134)
                            (local.get $l152))))
                      (local.set $l165
                        (i32x4.max_u
                          (local.get $l165)
                          (local.tee $l149
                            (v128.and
                              (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                (local.tee $l157
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l160)
                                      (f64x2.promote_low_f32x4
                                        (local.get $l135)))
                                    (f64x2.promote_low_f32x4
                                      (local.tee $l152
                                        (f32x4.neg
                                          (v128.load align=1
                                            (local.tee $l48
                                              (i32.add
                                                (local.get $p9)
                                                (local.get $p13)))))))))
                                (local.tee $l158
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l160)
                                      (f64x2.promote_low_f32x4
                                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                          (local.get $l135)
                                          (local.get $l135))))
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l152)
                                        (local.get $l152))))))
                              (local.get $l52)))))
                      (local.set $l155
                        (i32x4.min_u
                          (local.get $l155)
                          (local.get $l149)))
                      (block $B151
                        (block $B152
                          (br_if $B152
                            (v128.any_true
                              (i32x4.eq
                                (v128.and
                                  (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                    (local.get $l157)
                                    (local.get $l158))
                                  (local.get $l128))
                                (local.get $l133))))
                          (local.set $l152
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (f32x4.demote_f64x2_zero
                                (local.get $l157))
                              (f32x4.demote_f64x2_zero
                                (local.get $l158))))
                          (br $B151))
                        (local.set $l152
                          (call $fma4_tie
                            (local.get $l145)
                            (local.get $l135)
                            (local.get $l152))))
                      (local.set $l154
                        (i32x4.max_u
                          (local.get $l165)
                          (local.tee $l52
                            (v128.and
                              (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                (local.tee $l157
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l159)
                                      (local.get $l153))
                                    (f64x2.promote_low_f32x4
                                      (local.get $l152))))
                                (local.tee $l153
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.get $l159)
                                      (local.get $l154))
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l152)
                                        (local.get $l152))))))
                              (local.get $l52)))))
                      (local.set $l52
                        (i32x4.min_u
                          (local.get $l155)
                          (local.get $l52)))
                      (block $B153
                        (block $B154
                          (br_if $B154
                            (v128.any_true
                              (i32x4.eq
                                (v128.and
                                  (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                    (local.get $l157)
                                    (local.get $l153))
                                  (local.get $l128))
                                (local.get $l133))))
                          (local.set $l128
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (f32x4.demote_f64x2_zero
                                (local.get $l157))
                              (f32x4.demote_f64x2_zero
                                (local.get $l153))))
                          (br $B153))
                        (local.set $l128
                          (call $fma4_tie
                            (local.get $l164)
                            (local.get $l134)
                            (local.get $l152))))
                      (block $B155
                        (block $B156
                          (br_if $B156
                            (i32.eqz
                              (v128.any_true
                                (v128.or
                                  (i32x4.lt_u
                                    (local.get $l52)
                                    (v128.const i32x4 0x38100000 0x38100000 0x38100000 0x38100000))
                                  (i32x4.gt_u
                                    (local.get $l154)
                                    (v128.const i32x4 0x47e00000 0x47e00000 0x47e00000 0x47e00000))))))
                          (call $vertical_column
                            (local.get $l35)
                            (local.get $p11)
                            (local.get $p10)
                            (local.get $p6)
                            (local.get $p25)
                            (local.get $p5)
                            (local.get $p9)
                            (local.get $p26)
                            (local.get $p24)
                            (local.get $l37)
                            (local.get $p27)
                            (local.get $l51)
                            (local.get $p8))
                          (call $vertical_column
                            (local.get $l35)
                            (local.get $p11)
                            (local.get $p10)
                            (local.get $p6)
                            (local.get $p25)
                            (local.get $p5)
                            (local.get $p9)
                            (local.get $p26)
                            (i32.add
                              (local.get $p24)
                              (i32.const 1))
                            (local.get $l37)
                            (local.get $p27)
                            (local.get $l51)
                            (local.get $p8))
                          (call $vertical_column
                            (local.get $l35)
                            (local.get $p11)
                            (local.get $p10)
                            (local.get $p6)
                            (local.get $p25)
                            (local.get $p5)
                            (local.get $p9)
                            (local.get $p26)
                            (i32.add
                              (local.get $p24)
                              (i32.const 2))
                            (local.get $l37)
                            (local.get $p27)
                            (local.get $l51)
                            (local.get $p8))
                          (call $vertical_column
                            (local.get $l35)
                            (local.get $p11)
                            (local.get $p10)
                            (local.get $p6)
                            (local.get $p25)
                            (local.get $p5)
                            (local.get $p9)
                            (local.get $p26)
                            (i32.add
                              (local.get $p24)
                              (i32.const 3))
                            (local.get $l37)
                            (local.get $p27)
                            (local.get $l51)
                            (local.get $p8))
                          (br $B155))
                        (block $B157
                          (br_if $B157
                            (i32.lt_s
                              (local.get $p19)
                              (i32.const 0)))
                          (v128.store align=1
                            (i32.add
                              (local.get $p26)
                              (local.get $p13))
                            (f32x4.add
                              (f32x4.add
                                (local.get $l163)
                                (local.get $l128))
                              (local.get $l161))))
                        (v128.store align=1
                          (local.get $l50)
                          (local.get $l156))
                        (v128.store align=1
                          (local.get $p16)
                          (local.get $l161))
                        (v128.store align=1
                          (local.get $l43)
                          (local.get $l136))
                        (v128.store align=1
                          (local.get $l36)
                          (local.get $l163))
                        (v128.store align=1
                          (local.get $l48)
                          (local.get $l135))
                        (v128.store align=1
                          (local.get $l46)
                          (local.get $l128)))
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 16)))
                      (local.set $l50
                        (i32.add
                          (local.get $p24)
                          (i32.const 8)))
                      (local.set $p24
                        (local.tee $p16
                          (i32.add
                            (local.get $p24)
                            (i32.const 4))))
                      (br_if $L140
                        (i32.le_s
                          (local.get $l50)
                          (local.get $p0)))))
                  (br_if $B137
                    (i32.ge_s
                      (local.get $p16)
                      (local.get $p0)))
                  (loop $L158
                    (call $vertical_column
                      (local.get $l35)
                      (local.get $p11)
                      (local.get $p10)
                      (local.get $p6)
                      (local.get $p25)
                      (local.get $p5)
                      (local.get $p9)
                      (local.get $p26)
                      (local.get $p16)
                      (local.get $l37)
                      (local.get $p27)
                      (local.get $l51)
                      (local.get $p8))
                    (br_if $L158
                      (i32.ne
                        (local.get $p0)
                        (local.tee $p16
                          (i32.add
                            (local.get $p16)
                            (i32.const 1)))))))
                (br_if $L136
                  (i32.ne
                    (local.tee $l49
                      (i32.add
                        (local.get $l49)
                        (i32.const 1)))
                    (i32.const 5))))
              (block $B159
                (br_if $B159
                  (i32.lt_s
                    (local.get $p19)
                    (i32.const 0)))
                (block $B160
                  (block $B161
                    (br_if $B161
                      (i32.eqz
                        (i32.or
                          (local.get $l38)
                          (local.get $l39))))
                    (local.set $l44
                      (i32.load offset=8
                        (local.get $l32)))
                    (local.set $l47
                      (i32.load
                        (local.get $l32)))
                    (br $B160))
                  (local.set $l44
                    (i32.load offset=8
                      (local.get $l32)))
                  (local.set $l47
                    (i32.load
                      (local.get $l32)))
                  (br_if $B160
                    (i32.eqz
                      (local.tee $p9
                        (i32.load
                          (local.get $l129)))))
                  (br_if $B160
                    (i32.lt_s
                      (local.get $p0)
                      (i32.const 1)))
                  (local.set $p10
                    (i32.const 0))
                  (block $B162
                    (br_if $B162
                      (i32.lt_u
                        (local.get $p0)
                        (i32.const 16)))
                    (br_if $B162
                      (local.get $l100))
                    (br_if $B162
                      (i32.gt_u
                        (i32.sub
                          (local.get $l47)
                          (i32.add
                            (local.get $l116)
                            (local.get $p9)))
                        (i32.const -16)))
                    (br_if $B162
                      (i32.gt_u
                        (i32.sub
                          (i32.add
                            (local.get $l66)
                            (local.get $p9))
                          (i32.add
                            (local.get $l110)
                            (local.get $l44)))
                        (i32.const -16)))
                    (br_if $B162
                      (i32.gt_u
                        (i32.sub
                          (local.get $l47)
                          (local.tee $p13
                            (i32.add
                              (local.get $l112)
                              (local.get $p9))))
                        (i32.const -16)))
                    (br_if $B162
                      (i32.gt_u
                        (i32.sub
                          (local.get $l44)
                          (local.get $p13))
                        (i32.const -16)))
                    (local.set $p11
                      (i32.add
                        (local.get $p9)
                        (local.get $l53)))
                    (local.set $p10
                      (i32.add
                        (local.get $p9)
                        (local.get $l103)))
                    (local.set $p13
                      (i32.const 0))
                    (local.set $p24
                      (local.get $l55))
                    (loop $L163
                      (v128.store align=4
                        (i32.add
                          (local.get $p11)
                          (local.get $p13))
                        (v128.load align=4
                          (i32.add
                            (local.get $l47)
                            (local.get $p13))))
                      (v128.store align=4
                        (i32.add
                          (local.get $p10)
                          (local.get $p13))
                        (v128.load align=4
                          (i32.add
                            (local.get $l44)
                            (local.get $p13))))
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 16)))
                      (br_if $L163
                        (local.tee $p24
                          (i32.add
                            (local.get $p24)
                            (i32.const -4)))))
                    (local.set $p10
                      (local.get $l55))
                    (br_if $B160
                      (i32.eq
                        (local.get $p0)
                        (local.get $l55))))
                  (local.set $p13
                    (i32.or
                      (local.get $p10)
                      (i32.const 1)))
                  (block $B164
                    (br_if $B164
                      (i32.eqz
                        (local.get $l54)))
                    (f32.store
                      (i32.add
                        (i32.add
                          (i32.add
                            (local.get $p9)
                            (local.get $l99))
                          (local.tee $p11
                            (i32.shl
                              (local.get $p15)
                              (i32.const 2))))
                        (local.tee $p24
                          (i32.shl
                            (local.get $p10)
                            (i32.const 2))))
                      (f32.load
                        (i32.add
                          (local.get $l47)
                          (local.get $p24))))
                    (f32.store
                      (i32.add
                        (i32.add
                          (i32.add
                            (local.get $p9)
                            (local.get $l56))
                          (local.get $p11))
                        (local.get $p24))
                      (f32.load
                        (i32.add
                          (local.get $l44)
                          (local.get $p24))))
                    (local.set $p10
                      (local.get $p13)))
                  (br_if $B160
                    (i32.eq
                      (local.get $p0)
                      (local.get $p13)))
                  (local.set $p24
                    (i32.add
                      (local.get $p9)
                      (local.get $l103)))
                  (local.set $p11
                    (i32.add
                      (local.get $p9)
                      (local.get $l53)))
                  (local.set $p13
                    (i32.shl
                      (local.get $p10)
                      (i32.const 2)))
                  (local.set $p5
                    (i32.sub
                      (local.get $p0)
                      (local.get $p10)))
                  (local.set $p10
                    (local.get $l47))
                  (local.set $p9
                    (local.get $l44))
                  (loop $L165
                    (f32.store
                      (local.tee $p25
                        (i32.add
                          (local.get $p11)
                          (local.get $p13)))
                      (f32.load
                        (local.tee $p6
                          (i32.add
                            (local.get $p10)
                            (local.get $p13)))))
                    (f32.store
                      (local.tee $p16
                        (i32.add
                          (local.get $p24)
                          (local.get $p13)))
                      (f32.load
                        (local.tee $p26
                          (i32.add
                            (local.get $p9)
                            (local.get $p13)))))
                    (f32.store
                      (i32.add
                        (local.get $p25)
                        (i32.const 4))
                      (f32.load
                        (i32.add
                          (local.get $p6)
                          (i32.const 4))))
                    (f32.store
                      (i32.add
                        (local.get $p16)
                        (i32.const 4))
                      (f32.load
                        (i32.add
                          (local.get $p26)
                          (i32.const 4))))
                    (local.set $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const 8)))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const 8)))
                    (local.set $p10
                      (i32.add
                        (local.get $p10)
                        (i32.const 8)))
                    (local.set $p9
                      (i32.add
                        (local.get $p9)
                        (i32.const 8)))
                    (br_if $L165
                      (local.tee $p5
                        (i32.add
                          (local.get $p5)
                          (i32.const -2))))))
                (block $B166
                  (block $B167
                    (br_if $B167
                      (local.get $l39))
                    (local.set $p11
                      (i32.add
                        (i32.load
                          (local.get $l107))
                        (local.get $l131)))
                    (local.set $l29
                      (i32.const 0))
                    (br $B166))
                  (local.set $p11
                    (i32.add
                      (local.tee $l29
                        (i32.load
                          (local.get $l129)))
                      (i32.shl
                        (local.get $p15)
                        (i32.const 2)))))
                (local.set $p10
                  (i32.load offset=16
                    (local.get $l33)))
                (local.set $p9
                  (i32.load offset=12
                    (local.get $l33)))
                (local.set $p5
                  (i32.load offset=4
                    (local.get $l33)))
                (local.set $l33
                  (i32.load
                    (i32.add
                      (local.get $l127)
                      (i32.mul
                        (local.get $l38)
                        (i32.const 12)))))
                (local.set $l166
                  (f64.load offset=40
                    (local.tee $l49
                      (i32.add
                        (i32.load
                          (i32.add
                            (i32.add
                              (local.get $l28)
                              (i32.const 56))
                            (i32.shl
                              (local.get $l38)
                              (i32.const 2))))
                        (local.get $l137)))))
                (local.set $l167
                  (f64.load offset=32
                    (local.get $l49)))
                (local.set $l168
                  (f64.load offset=24
                    (local.get $l49)))
                (local.set $l169
                  (f64.load offset=16
                    (local.get $l49)))
                (local.set $l170
                  (f64.load offset=8
                    (local.get $l49)))
                (local.set $l171
                  (f64.load
                    (local.get $l49)))
                (local.set $l48
                  (i32.const 0))
                (block $B168
                  (br_if $B168
                    (i32.lt_s
                      (local.get $p0)
                      (i32.const 4)))
                  (local.set $p25
                    (select
                      (i32.add
                        (i32.add
                          (local.get $l29)
                          (local.get $l56))
                        (local.tee $p13
                          (i32.shl
                            (local.get $p15)
                            (i32.const 2))))
                      (local.get $l44)
                      (local.get $l29)))
                  (local.set $p6
                    (select
                      (i32.add
                        (i32.add
                          (local.get $l29)
                          (local.get $l99))
                        (local.get $p13))
                      (local.get $l47)
                      (local.get $l29)))
                  (local.set $p16
                    (i32.add
                      (local.get $l33)
                      (local.get $l108)))
                  (local.set $p26
                    (i32.const 0))
                  (local.set $l35
                    (local.get $p10))
                  (local.set $l50
                    (local.get $p9))
                  (local.set $p13
                    (local.get $l64))
                  (local.set $p24
                    (local.get $l65))
                  (local.set $l46
                    (local.get $p11))
                  (local.set $l36
                    (local.get $p5))
                  (loop $L169
                    (local.set $l157
                      (f64x2.mul
                        (local.tee $l152
                          (f64x2.mul
                            (local.tee $l135
                              (v128.andnot
                                (local.tee $l135
                                  (f64x2.sub
                                    (local.tee $l52
                                      (v128.const i32x4 0x00000000 0x3ff00000 0x00000000 0x3ff00000))
                                    (f64x2.promote_low_f32x4
                                      (local.tee $l136
                                        (f32x4.div
                                          (f32x4.mul
                                            (f32x4.sub
                                              (v128.const i32x4 0x3f800000 0x3f800000 0x3f800000 0x3f800000)
                                              (f32x4.mul
                                                (local.tee $l128
                                                  (f32x4.sub
                                                    (local.tee $l133
                                                      (v128.load align=1
                                                        (local.get $p6)))
                                                    (local.tee $l134
                                                      (v128.load align=1
                                                        (local.get $l36)))))
                                                (local.get $l128)))
                                            (f32x4.add
                                              (f32x4.add
                                                (local.tee $l128
                                                  (f32x4.sub
                                                    (v128.load align=1
                                                      (local.get $l35))
                                                    (f32x4.mul
                                                      (local.get $l133)
                                                      (local.get $l134))))
                                                (local.get $l128))
                                              (local.tee $l128
                                                (v128.const i32x4 0x3a6bedfa 0x3a6bedfa 0x3a6bedfa 0x3a6bedfa))))
                                          (f32x4.add
                                            (f32x4.add
                                              (f32x4.sub
                                                (v128.load align=1
                                                  (local.get $p25))
                                                (f32x4.mul
                                                  (local.get $l133)
                                                  (local.get $l133)))
                                              (f32x4.sub
                                                (v128.load align=1
                                                  (local.get $l50))
                                                (f32x4.mul
                                                  (local.get $l134)
                                                  (local.get $l134))))
                                            (local.get $l128)))))))
                                (f64x2.le
                                  (local.get $l135)
                                  (local.tee $l128
                                    (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))))
                            (local.get $l135)))
                        (local.get $l152)))
                    (local.set $l153
                      (f64x2.mul
                        (local.tee $l152
                          (f64x2.mul
                            (local.tee $l136
                              (v128.andnot
                                (local.tee $l136
                                  (f64x2.sub
                                    (local.get $l52)
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l136)
                                        (local.get $l136)))))
                                (f64x2.le
                                  (local.get $l136)
                                  (local.get $l128))))
                            (local.get $l136)))
                        (local.get $l152)))
                    (local.set $l158
                      (f64x2.mul
                        (local.tee $l152
                          (f64x2.mul
                            (local.tee $l134
                              (v128.andnot
                                (f64x2.neg
                                  (local.tee $l133
                                    (f64x2.add
                                      (f64x2.div
                                        (f64x2.add
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l156
                                              (f32x4.abs
                                                (f32x4.sub
                                                  (v128.load align=1
                                                    (local.get $p16))
                                                  (local.get $l134)))))
                                          (local.get $l52))
                                        (f64x2.add
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l154
                                              (f32x4.abs
                                                (f32x4.sub
                                                  (v128.load align=1
                                                    (local.get $l46))
                                                  (local.get $l133)))))
                                          (local.get $l52)))
                                      (local.tee $l159
                                        (v128.const i32x4 0x00000000 0xbff00000 0x00000000 0xbff00000)))))
                                (f64x2.ge
                                  (local.get $l133)
                                  (local.get $l128))))
                            (local.get $l134)))
                        (local.get $l152)))
                    (local.set $l155
                      (f64x2.mul
                        (local.tee $l155
                          (f64x2.mul
                            (local.tee $l152
                              (v128.andnot
                                (local.get $l133)
                                (f64x2.le
                                  (local.get $l133)
                                  (local.get $l128))))
                            (local.get $l152)))
                        (local.get $l155)))
                    (local.set $l154
                      (f64x2.mul
                        (local.tee $l154
                          (f64x2.mul
                            (local.tee $l156
                              (v128.andnot
                                (f64x2.neg
                                  (local.tee $l52
                                    (f64x2.add
                                      (f64x2.div
                                        (f64x2.add
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l156)
                                              (local.get $l156)))
                                          (local.get $l52))
                                        (f64x2.add
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l154)
                                              (local.get $l154)))
                                          (local.get $l52)))
                                      (local.get $l159))))
                                (f64x2.ge
                                  (local.get $l52)
                                  (local.get $l128))))
                            (local.get $l156)))
                        (local.get $l154)))
                    (local.set $l159
                      (f64x2.mul
                        (local.tee $l159
                          (f64x2.mul
                            (local.tee $l128
                              (v128.andnot
                                (local.get $l52)
                                (f64x2.le
                                  (local.get $l52)
                                  (local.get $l128))))
                            (local.get $l128)))
                        (local.get $l159)))
                    (block $B170
                      (block $B171
                        (br_if $B171
                          (local.get $p14))
                        (local.set $l172
                          (f64x2.extract_lane 1
                            (local.get $l136)))
                        (local.set $l173
                          (f64x2.extract_lane 0
                            (local.get $l136)))
                        (local.set $l174
                          (f64x2.extract_lane 1
                            (local.get $l135)))
                        (local.set $l175
                          (f64x2.extract_lane 0
                            (local.get $l135)))
                        (br $B170))
                      (f64.store
                        (local.get $p13)
                        (local.tee $l175
                          (f64x2.extract_lane 0
                            (local.get $l135))))
                      (f64.store
                        (local.get $p24)
                        (f64x2.extract_lane 0
                          (local.get $l133)))
                      (f64.store
                        (i32.add
                          (local.get $p13)
                          (i32.const 8))
                        (local.tee $l174
                          (f64x2.extract_lane 1
                            (local.get $l135))))
                      (f64.store
                        (i32.add
                          (local.get $p24)
                          (i32.const 8))
                        (f64x2.extract_lane 1
                          (local.get $l133)))
                      (f64.store
                        (i32.add
                          (local.get $p13)
                          (i32.const 16))
                        (local.tee $l173
                          (f64x2.extract_lane 0
                            (local.get $l136))))
                      (f64.store
                        (i32.add
                          (local.get $p24)
                          (i32.const 16))
                        (f64x2.extract_lane 0
                          (local.get $l52)))
                      (f64.store
                        (i32.add
                          (local.get $p13)
                          (i32.const 24))
                        (local.tee $l172
                          (f64x2.extract_lane 1
                            (local.get $l136))))
                      (f64.store
                        (i32.add
                          (local.get $p24)
                          (i32.const 24))
                        (f64x2.extract_lane 1
                          (local.get $l52))))
                    (local.set $l35
                      (i32.add
                        (local.get $l35)
                        (i32.const 16)))
                    (local.set $l50
                      (i32.add
                        (local.get $l50)
                        (i32.const 16)))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 32)))
                    (local.set $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const 32)))
                    (local.set $p16
                      (i32.add
                        (local.get $p16)
                        (i32.const 16)))
                    (local.set $l46
                      (i32.add
                        (local.get $l46)
                        (i32.const 16)))
                    (local.set $l36
                      (i32.add
                        (local.get $l36)
                        (i32.const 16)))
                    (local.set $p25
                      (i32.add
                        (local.get $p25)
                        (i32.const 16)))
                    (local.set $p6
                      (i32.add
                        (local.get $p6)
                        (i32.const 16)))
                    (local.set $l171
                      (f64.add
                        (local.get $l172)
                        (f64.add
                          (local.get $l173)
                          (f64.add
                            (local.get $l174)
                            (f64.add
                              (local.get $l171)
                              (local.get $l175))))))
                    (local.set $l166
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l154))
                        (f64.add
                          (f64.add
                            (f64x2.extract_lane 1
                              (local.get $l158))
                            (f64.add
                              (local.get $l166)
                              (f64x2.extract_lane 0
                                (local.get $l158))))
                          (f64x2.extract_lane 0
                            (local.get $l154)))))
                    (local.set $l167
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l156))
                        (f64.add
                          (f64.add
                            (f64x2.extract_lane 1
                              (local.get $l134))
                            (f64.add
                              (local.get $l167)
                              (f64x2.extract_lane 0
                                (local.get $l134))))
                          (f64x2.extract_lane 0
                            (local.get $l156)))))
                    (local.set $l168
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l159))
                        (f64.add
                          (f64.add
                            (f64x2.extract_lane 1
                              (local.get $l155))
                            (f64.add
                              (local.get $l168)
                              (f64x2.extract_lane 0
                                (local.get $l155))))
                          (f64x2.extract_lane 0
                            (local.get $l159)))))
                    (local.set $l169
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l128))
                        (f64.add
                          (f64.add
                            (f64x2.extract_lane 1
                              (local.get $l152))
                            (f64.add
                              (local.get $l169)
                              (f64x2.extract_lane 0
                                (local.get $l152))))
                          (f64x2.extract_lane 0
                            (local.get $l128)))))
                    (local.set $l170
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l153))
                        (f64.add
                          (f64.add
                            (f64x2.extract_lane 1
                              (local.get $l157))
                            (f64.add
                              (local.get $l170)
                              (f64x2.extract_lane 0
                                (local.get $l157))))
                          (f64x2.extract_lane 0
                            (local.get $l153)))))
                    (local.set $l43
                      (i32.add
                        (local.get $p26)
                        (i32.const 8)))
                    (local.set $p26
                      (local.tee $l48
                        (i32.add
                          (local.get $p26)
                          (i32.const 4))))
                    (br_if $L169
                      (i32.le_s
                        (local.get $l43)
                        (local.get $p0)))))
                (block $B172
                  (br_if $B172
                    (i32.le_s
                      (local.get $p0)
                      (local.get $l48)))
                  (local.set $p25
                    (select
                      (i32.add
                        (i32.add
                          (local.get $l29)
                          (local.get $l56))
                        (i32.shl
                          (local.get $p15)
                          (i32.const 2)))
                      (local.get $l44)
                      (local.get $l29)))
                  (local.set $p6
                    (select
                      (i32.add
                        (local.get $l29)
                        (local.get $l132))
                      (local.get $l47)
                      (local.get $l29)))
                  (local.set $p16
                    (i32.add
                      (local.get $l33)
                      (local.get $l108)))
                  (local.set $p13
                    (i32.shl
                      (local.get $l48)
                      (i32.const 2)))
                  (local.set $p24
                    (i32.shl
                      (local.get $l48)
                      (i32.const 3)))
                  (local.set $p26
                    (i32.sub
                      (local.get $p0)
                      (local.get $l48)))
                  (loop $L173
                    (local.set $l173
                      (select
                        (f64.const 0x0p+0 (;=0;))
                        (local.tee $l172
                          (f64.sub
                            (f64.const 0x1p+0 (;=1;))
                            (f64.promote_f32
                              (f32.div
                                (f32.mul
                                  (f32.sub
                                    (f32.const 0x1p+0 (;=1;))
                                    (f32.mul
                                      (local.tee $l142
                                        (f32.sub
                                          (local.tee $l140
                                            (f32.load
                                              (i32.add
                                                (local.get $p6)
                                                (local.get $p13))))
                                          (local.tee $l141
                                            (f32.load
                                              (i32.add
                                                (local.get $p5)
                                                (local.get $p13))))))
                                      (local.get $l142)))
                                  (f32.add
                                    (f32.add
                                      (local.tee $l142
                                        (f32.sub
                                          (f32.load
                                            (i32.add
                                              (local.get $p10)
                                              (local.get $p13)))
                                          (f32.mul
                                            (local.get $l140)
                                            (local.get $l141))))
                                      (local.get $l142))
                                    (f32.const 0x1.d7dbf4p-11 (;=0.0009;))))
                                (f32.add
                                  (f32.add
                                    (f32.sub
                                      (f32.load
                                        (i32.add
                                          (local.get $p25)
                                          (local.get $p13)))
                                      (f32.mul
                                        (local.get $l140)
                                        (local.get $l140)))
                                    (f32.sub
                                      (f32.load
                                        (i32.add
                                          (local.get $p9)
                                          (local.get $p13)))
                                      (f32.mul
                                        (local.get $l141)
                                        (local.get $l141))))
                                  (f32.const 0x1.d7dbf4p-11 (;=0.0009;)))))))
                        (f64.le
                          (local.get $l172)
                          (f64.const 0x0p+0 (;=0;)))))
                    (local.set $l172
                      (f64.add
                        (f64.div
                          (f64.add
                            (f64.promote_f32
                              (f32.abs
                                (f32.sub
                                  (f32.load
                                    (i32.add
                                      (local.get $p16)
                                      (local.get $p13)))
                                  (local.get $l141))))
                            (f64.const 0x1p+0 (;=1;)))
                          (f64.add
                            (f64.promote_f32
                              (f32.abs
                                (f32.sub
                                  (f32.load
                                    (i32.add
                                      (local.get $p11)
                                      (local.get $p13)))
                                  (local.get $l140))))
                            (f64.const 0x1p+0 (;=1;))))
                        (f64.const -0x1p+0 (;=-1;))))
                    (block $B174
                      (br_if $B174
                        (i32.eqz
                          (local.get $p14)))
                      (f64.store
                        (i32.add
                          (local.get $l64)
                          (local.get $p24))
                        (local.get $l173))
                      (f64.store
                        (i32.add
                          (local.get $l65)
                          (local.get $p24))
                        (local.get $l172)))
                    (local.set $p6
                      (i32.add
                        (local.get $p6)
                        (i32.const 4)))
                    (local.set $p25
                      (i32.add
                        (local.get $p25)
                        (i32.const 4)))
                    (local.set $p5
                      (i32.add
                        (local.get $p5)
                        (i32.const 4)))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const 4)))
                    (local.set $p16
                      (i32.add
                        (local.get $p16)
                        (i32.const 4)))
                    (local.set $p10
                      (i32.add
                        (local.get $p10)
                        (i32.const 4)))
                    (local.set $p9
                      (i32.add
                        (local.get $p9)
                        (i32.const 4)))
                    (local.set $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const 8)))
                    (local.set $l171
                      (f64.add
                        (local.get $l171)
                        (local.get $l173)))
                    (local.set $l167
                      (f64.add
                        (local.get $l167)
                        (local.tee $l174
                          (select
                            (f64.const 0x0p+0 (;=0;))
                            (f64.neg
                              (local.get $l172))
                            (f64.ge
                              (local.get $l172)
                              (f64.const 0x0p+0 (;=0;)))))))
                    (local.set $l169
                      (f64.add
                        (local.get $l169)
                        (local.tee $l172
                          (select
                            (f64.const 0x0p+0 (;=0;))
                            (local.get $l172)
                            (f64.le
                              (local.get $l172)
                              (f64.const 0x0p+0 (;=0;)))))))
                    (local.set $l170
                      (f64.add
                        (local.get $l170)
                        (f64.mul
                          (local.tee $l173
                            (f64.mul
                              (local.get $l173)
                              (local.get $l173)))
                          (local.get $l173))))
                    (local.set $l166
                      (f64.add
                        (local.get $l166)
                        (f64.mul
                          (local.tee $l173
                            (f64.mul
                              (local.get $l174)
                              (local.get $l174)))
                          (local.get $l173))))
                    (local.set $l168
                      (f64.add
                        (local.get $l168)
                        (f64.mul
                          (local.tee $l172
                            (f64.mul
                              (local.get $l172)
                              (local.get $l172)))
                          (local.get $l172))))
                    (br_if $L173
                      (local.tee $p26
                        (i32.add
                          (local.get $p26)
                          (i32.const -1))))))
                (f64.store offset=40
                  (local.get $l49)
                  (local.get $l166))
                (f64.store offset=32
                  (local.get $l49)
                  (local.get $l167))
                (f64.store offset=24
                  (local.get $l49)
                  (local.get $l168))
                (f64.store offset=16
                  (local.get $l49)
                  (local.get $l169))
                (f64.store offset=8
                  (local.get $l49)
                  (local.get $l170))
                (f64.store
                  (local.get $l49)
                  (local.get $l171)))
              (br_if $L135
                (i32.ne
                  (local.tee $l38
                    (i32.add
                      (local.get $l38)
                      (i32.const 1)))
                  (local.get $l34)))))
          (br_if $L133
            (i32.ne
              (local.tee $l130
                (i32.add
                  (local.get $l130)
                  (i32.const 1)))
              (i32.const 3))))
        (local.set $l64
          (i32.add
            (local.get $l64)
            (local.get $l59)))
        (local.set $l65
          (i32.add
            (local.get $l65)
            (local.get $l59)))
        (local.set $l101
          (i32.add
            (local.get $l101)
            (i32.const 1)))
        (local.set $l53
          (i32.add
            (local.get $l53)
            (local.get $l62)))
        (local.set $l103
          (i32.add
            (local.get $l103)
            (local.get $l62)))
        (local.set $l104
          (i32.add
            (local.get $l104)
            (i32.const 1)))
        (br_if $L31
          (i32.ne
            (local.tee $p19
              (i32.add
                (local.get $p19)
                (i32.const 1)))
            (local.get $p20)))))
    (global.set $__stack_pointer
      (i32.add
        (local.get $l28)
        (i32.const 1984)))
    (local.get $p23))
  (func $positive_row (type $t5) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32)
    (local $l10 i32) (local $l11 i32) (local $l12 i32) (local $l13 i32) (local $l14 i32) (local $l15 i32) (local $l16 i32) (local $l17 v128) (local $l18 v128) (local $l19 i32) (local $l20 v128) (local $l21 v128) (local $l22 i32) (local $l23 i32) (local $l24 i32) (local $l25 i32) (local $l26 i32) (local $l27 i32) (local $l28 i32) (local $l29 i32) (local $l30 i32) (local $l31 i32) (local $l32 i32) (local $l33 i32) (local $l34 v128) (local $l35 v128) (local $l36 v128) (local $l37 v128) (local $l38 v128) (local $l39 v128) (local $l40 v128) (local $l41 v128) (local $l42 v128) (local $l43 v128) (local $l44 v128) (local $l45 v128) (local $l46 v128) (local $l47 v128) (local $l48 v128) (local $l49 v128) (local $l50 v128) (local $l51 v128) (local $l52 f32) (local $l53 f32) (local $l54 f32)
    (global.set $__stack_pointer
      (local.tee $l10
        (i32.sub
          (global.get $__stack_pointer)
          (i32.const 48))))
    (local.set $l11
      (i32.const 0))
    (block $B0
      (br_if $B0
        (i32.lt_s
          (local.get $p3)
          (i32.const 4)))
      (local.set $l13
        (i32.add
          (local.get $p0)
          (i32.mul
            (local.get $p3)
            (i32.add
              (i32.shl
                (local.get $p4)
                (i32.const 2))
              (local.tee $l12
                (i32.shl
                  (local.get $p2)
                  (i32.const 2)))))))
      (local.set $l14
        (i32.add
          (local.get $p0)
          (i32.mul
            (local.get $p3)
            (i32.add
              (i32.shl
                (local.get $p4)
                (i32.const 3))
              (local.get $l12)))))
      (local.set $l15
        (i32.shl
          (local.get $p6)
          (i32.const 2)))
      (local.set $l16
        (i32.add
          (local.get $p0)
          (i32.shl
            (i32.mul
              (local.get $p3)
              (local.get $p2))
            (i32.const 2))))
      (local.set $l18
        (f64x2.promote_low_f32x4
          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
            (local.tee $l17
              (v128.const i32x4 0x3b789536 0x3b789536 0x3b789536 0x3b789536))
            (local.get $l17))))
      (local.set $l19
        (i32.const 0))
      (local.set $l12
        (i32.const 0))
      (loop $L1
        (block $B2
          (block $B3
            (block $B4
              (block $B5
                (br_if $B5
                  (i32.eqz
                    (local.get $p1)))
                (local.set $l17
                  (v128.load align=4
                    (i32.add
                      (local.get $l14)
                      (local.get $l12))))
                (local.set $l20
                  (v128.load align=4
                    (i32.add
                      (local.get $l13)
                      (local.get $l12))))
                (local.set $l21
                  (v128.load align=4
                    (i32.add
                      (local.get $l16)
                      (local.get $l12))))
                (br $B4))
              (local.set $l21
                (v128.load32_lane 3
                  (i32.add
                    (local.get $p7)
                    (i32.shl
                      (local.tee $l11
                        (i32.load8_u
                          (i32.add
                            (local.tee $l22
                              (i32.add
                                (local.get $l16)
                                (local.get $l12)))
                            (i32.const 12))))
                      (i32.const 2)))
                  (v128.load32_lane 2
                    (i32.add
                      (local.get $p7)
                      (i32.shl
                        (local.tee $l23
                          (i32.load8_u
                            (i32.add
                              (local.get $l22)
                              (i32.const 8))))
                        (i32.const 2)))
                    (v128.load32_lane 1
                      (i32.add
                        (local.get $p7)
                        (i32.shl
                          (local.tee $l24
                            (i32.load8_u
                              (i32.add
                                (local.get $l22)
                                (i32.const 4))))
                          (i32.const 2)))
                      (v128.load32_zero
                        (i32.add
                          (local.get $p7)
                          (i32.shl
                            (local.tee $l25
                              (i32.load8_u
                                (local.get $l22)))
                            (i32.const 2))))))))
              (local.set $l17
                (v128.load32_lane 3
                  (i32.add
                    (local.get $p7)
                    (i32.shl
                      (local.tee $l26
                        (i32.load8_u
                          (i32.add
                            (local.get $l22)
                            (i32.const 14))))
                      (i32.const 2)))
                  (v128.load32_lane 2
                    (i32.add
                      (local.get $p7)
                      (i32.shl
                        (local.tee $l27
                          (i32.load8_u
                            (i32.add
                              (local.get $l22)
                              (i32.const 10))))
                        (i32.const 2)))
                    (v128.load32_lane 1
                      (i32.add
                        (local.get $p7)
                        (i32.shl
                          (local.tee $l28
                            (i32.load8_u
                              (i32.add
                                (local.get $l22)
                                (i32.const 6))))
                          (i32.const 2)))
                      (v128.load32_zero
                        (i32.add
                          (local.get $p7)
                          (i32.shl
                            (local.tee $l29
                              (i32.load8_u
                                (i32.add
                                  (local.get $l22)
                                  (i32.const 2))))
                            (i32.const 2))))))))
              (local.set $l20
                (v128.load32_lane 3
                  (i32.add
                    (local.get $p7)
                    (i32.shl
                      (local.tee $l30
                        (i32.load8_u
                          (i32.add
                            (local.get $l22)
                            (i32.const 13))))
                      (i32.const 2)))
                  (v128.load32_lane 2
                    (i32.add
                      (local.get $p7)
                      (i32.shl
                        (local.tee $l31
                          (i32.load8_u
                            (i32.add
                              (local.get $l22)
                              (i32.const 9))))
                        (i32.const 2)))
                    (v128.load32_lane 1
                      (i32.add
                        (local.get $p7)
                        (i32.shl
                          (local.tee $l32
                            (i32.load8_u
                              (i32.add
                                (local.get $l22)
                                (i32.const 5))))
                          (i32.const 2)))
                      (v128.load32_zero
                        (i32.add
                          (local.get $p7)
                          (i32.shl
                            (local.tee $l22
                              (i32.load8_u
                                (i32.add
                                  (local.get $l22)
                                  (i32.const 1))))
                            (i32.const 2))))))))
              (local.set $l29
                (i32.shr_u
                  (i32.mul
                    (local.tee $l33
                      (i32.or
                        (i32.or
                          (i32.shl
                            (local.get $l22)
                            (i32.const 8))
                          (i32.shl
                            (local.get $l25)
                            (i32.const 16)))
                        (local.get $l29)))
                    (i32.const -1640531535))
                  (i32.const 15)))
              (local.set $l25
                (i32.shr_u
                  (i32.mul
                    (local.tee $l32
                      (i32.or
                        (i32.or
                          (i32.shl
                            (local.get $l32)
                            (i32.const 8))
                          (i32.shl
                            (local.get $l24)
                            (i32.const 16)))
                        (local.get $l28)))
                    (i32.const -1640531535))
                  (i32.const 15)))
              (local.set $l24
                (i32.shr_u
                  (i32.mul
                    (local.tee $l28
                      (i32.or
                        (i32.or
                          (i32.shl
                            (local.get $l31)
                            (i32.const 8))
                          (i32.shl
                            (local.get $l23)
                            (i32.const 16)))
                        (local.get $l27)))
                    (i32.const -1640531535))
                  (i32.const 15)))
              (br_if $B3
                (i32.ne
                  (i32.load
                    (i32.add
                      (local.get $p8)
                      (i32.shl
                        (local.tee $l26
                          (i32.shr_u
                            (i32.mul
                              (local.tee $l27
                                (i32.or
                                  (i32.or
                                    (i32.shl
                                      (local.get $l30)
                                      (i32.const 8))
                                    (i32.shl
                                      (local.get $l11)
                                      (i32.const 16)))
                                  (local.get $l26)))
                              (i32.const -1640531535))
                            (i32.const 15)))
                        (i32.const 2))))
                  (local.get $l27)))
              (br_if $B3
                (i32.ne
                  (i32.load
                    (i32.add
                      (local.get $p8)
                      (i32.shl
                        (local.get $l24)
                        (i32.const 2))))
                  (local.get $l28)))
              (br_if $B3
                (i32.ne
                  (i32.load
                    (i32.add
                      (local.get $p8)
                      (i32.shl
                        (local.get $l25)
                        (i32.const 2))))
                  (local.get $l32)))
              (br_if $B3
                (i32.ne
                  (i32.load
                    (i32.add
                      (local.get $p8)
                      (i32.shl
                        (local.get $l29)
                        (i32.const 2))))
                  (local.get $l33))))
            (br_if $B3
              (local.get $p1))
            (f32.store
              (local.tee $l22
                (i32.add
                  (i32.add
                    (i32.load
                      (local.get $p5))
                    (local.get $l15))
                  (local.get $l12)))
              (f32.load
                (local.tee $l30
                  (i32.add
                    (local.get $p9)
                    (i32.mul
                      (local.get $l29)
                      (i32.const 12))))))
            (f32.store
              (local.tee $l11
                (i32.add
                  (i32.add
                    (i32.load offset=4
                      (local.get $p5))
                    (local.get $l15))
                  (local.get $l12)))
              (f32.load
                (i32.add
                  (local.get $l30)
                  (i32.const 4))))
            (f32.store
              (local.tee $l23
                (i32.add
                  (i32.add
                    (i32.load offset=8
                      (local.get $p5))
                    (local.get $l15))
                  (local.get $l12)))
              (f32.load
                (i32.add
                  (local.get $l30)
                  (i32.const 8))))
            (f32.store
              (i32.add
                (local.get $l22)
                (i32.const 4))
              (f32.load
                (local.tee $l30
                  (i32.add
                    (local.get $p9)
                    (i32.mul
                      (local.get $l25)
                      (i32.const 12))))))
            (f32.store
              (i32.add
                (local.get $l11)
                (i32.const 4))
              (f32.load
                (i32.add
                  (local.get $l30)
                  (i32.const 4))))
            (f32.store
              (i32.add
                (local.get $l23)
                (i32.const 4))
              (f32.load
                (i32.add
                  (local.get $l30)
                  (i32.const 8))))
            (f32.store
              (i32.add
                (local.get $l22)
                (i32.const 8))
              (f32.load
                (local.tee $l30
                  (i32.add
                    (local.get $p9)
                    (i32.mul
                      (local.get $l24)
                      (i32.const 12))))))
            (f32.store
              (i32.add
                (local.get $l11)
                (i32.const 8))
              (f32.load
                (i32.add
                  (local.get $l30)
                  (i32.const 4))))
            (f32.store
              (i32.add
                (local.get $l23)
                (i32.const 8))
              (f32.load
                (i32.add
                  (local.get $l30)
                  (i32.const 8))))
            (f32.store
              (i32.add
                (local.get $l22)
                (i32.const 12))
              (f32.load
                (local.tee $l22
                  (i32.add
                    (local.get $p9)
                    (i32.mul
                      (local.get $l26)
                      (i32.const 12))))))
            (f32.store
              (i32.add
                (local.get $l11)
                (i32.const 12))
              (f32.load
                (i32.add
                  (local.get $l22)
                  (i32.const 4))))
            (f32.store
              (i32.add
                (local.get $l23)
                (i32.const 12))
              (f32.load
                (i32.add
                  (local.get $l22)
                  (i32.const 8))))
            (br $B2))
          (local.set $l40
            (v128.and
              (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                (local.tee $l37
                  (f64x2.add
                    (f64x2.mul
                      (local.tee $l34
                        (f64x2.promote_low_f32x4
                          (local.get $l17)))
                      (local.tee $l35
                        (v128.const i32x4 0xe0000000 0x3fb3f7ce 0xe0000000 0x3fb3f7ce)))
                    (local.tee $l36
                      (v128.const i32x4 0xc0000000 0x3f6f12a6 0xc0000000 0x3f6f12a6))))
                (local.tee $l39
                  (f64x2.add
                    (f64x2.mul
                      (local.tee $l38
                        (f64x2.promote_low_f32x4
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                            (local.get $l17)
                            (local.get $l17))))
                      (local.get $l35))
                    (local.get $l18))))
              (local.tee $l35
                (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
          (local.set $l42
            (local.tee $l41
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l37))
                (f32x4.demote_f64x2_zero
                  (local.get $l39)))))
          (block $B6
            (br_if $B6
              (i32.eqz
                (local.tee $l22
                  (v128.any_true
                    (i32x4.eq
                      (v128.and
                        (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                          (local.get $l37)
                          (local.get $l39))
                        (local.tee $l37
                          (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                      (local.tee $l39
                        (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))))
            (local.set $l42
              (call $fma4_tie
                (v128.const i32x4 0x3d9fbe77 0x3d9fbe77 0x3d9fbe77 0x3d9fbe77)
                (local.get $l17)
                (v128.const i32x4 0x3b789536 0x3b789536 0x3b789536 0x3b789536))))
          (local.set $l48
            (i32x4.max_u
              (local.get $l40)
              (local.tee $l47
                (v128.and
                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                    (local.tee $l45
                      (f64x2.add
                        (f64x2.mul
                          (local.tee $l43
                            (f64x2.promote_low_f32x4
                              (local.get $l20)))
                          (local.tee $l44
                            (v128.const i32x4 0x80000000 0x3fe3e76c 0x80000000 0x3fe3e76c)))
                        (f64x2.promote_low_f32x4
                          (local.get $l42))))
                    (local.tee $l44
                      (f64x2.add
                        (f64x2.mul
                          (local.tee $l46
                            (f64x2.promote_low_f32x4
                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                (local.get $l20)
                                (local.get $l20))))
                          (local.get $l44))
                        (f64x2.promote_low_f32x4
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                            (local.get $l42)
                            (local.get $l42))))))
                  (local.get $l35)))))
          (local.set $l49
            (i32x4.min_u
              (local.get $l40)
              (local.get $l47)))
          (block $B7
            (block $B8
              (br_if $B8
                (v128.any_true
                  (i32x4.eq
                    (v128.and
                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                        (local.get $l45)
                        (local.get $l44))
                      (local.get $l37))
                    (local.get $l39))))
              (local.set $l42
                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                  (f32x4.demote_f64x2_zero
                    (local.get $l45))
                  (f32x4.demote_f64x2_zero
                    (local.get $l44))))
              (br $B7))
            (local.set $l42
              (call $fma4_tie
                (v128.const i32x4 0x3f1f3b64 0x3f1f3b64 0x3f1f3b64 0x3f1f3b64)
                (local.get $l20)
                (local.get $l42))))
          (v128.store offset=32
            (local.get $l10)
            (i32x4.max_u
              (local.get $l48)
              (local.tee $l51
                (v128.and
                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                    (local.tee $l47
                      (f64x2.add
                        (f64x2.mul
                          (local.tee $l45
                            (f64x2.promote_low_f32x4
                              (local.get $l21)))
                          (local.tee $l50
                            (v128.const i32x4 0x40000000 0x3fd33333 0x40000000 0x3fd33333)))
                        (f64x2.promote_low_f32x4
                          (local.get $l42))))
                    (local.tee $l50
                      (f64x2.add
                        (f64x2.mul
                          (local.tee $l44
                            (f64x2.promote_low_f32x4
                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                (local.get $l21)
                                (local.get $l21))))
                          (local.get $l50))
                        (f64x2.promote_low_f32x4
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                            (local.get $l42)
                            (local.get $l42))))))
                  (local.get $l35)))))
          (v128.store offset=16
            (local.get $l10)
            (i32x4.min_u
              (local.get $l49)
              (local.get $l51)))
          (block $B9
            (block $B10
              (br_if $B10
                (v128.any_true
                  (i32x4.eq
                    (v128.and
                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                        (local.get $l47)
                        (local.get $l50))
                      (local.get $l37))
                    (local.get $l39))))
              (local.set $l42
                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                  (f32x4.demote_f64x2_zero
                    (local.get $l47))
                  (f32x4.demote_f64x2_zero
                    (local.get $l50))))
              (br $B9))
            (local.set $l42
              (call $fma4_tie
                (v128.const i32x4 0x3e99999a 0x3e99999a 0x3e99999a 0x3e99999a)
                (local.get $l21)
                (local.get $l42))))
          (local.set $l51
            (call $cube_root_bias4
              (v128.andnot
                (local.get $l42)
                (f32x4.le
                  (local.get $l42)
                  (local.tee $l47
                    (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))))
              (i32.add
                (local.get $l10)
                (i32.const 16))))
          (local.set $l50
            (i32x4.max_s
              (v128.load offset=32
                (local.get $l10))
              (local.get $l40)))
          (local.set $l48
            (i32x4.min_s
              (v128.load offset=16
                (local.get $l10))
              (local.get $l40)))
          (block $B11
            (br_if $B11
              (i32.eqz
                (local.get $l22)))
            (local.set $l41
              (call $fma4_tie
                (v128.const i32x4 0x3d9fbe77 0x3d9fbe77 0x3d9fbe77 0x3d9fbe77)
                (local.get $l17)
                (v128.const i32x4 0x3b789536 0x3b789536 0x3b789536 0x3b789536))))
          (local.set $l50
            (i32x4.max_u
              (local.get $l50)
              (local.tee $l49
                (v128.and
                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                    (local.tee $l42
                      (f64x2.add
                        (f64x2.mul
                          (local.get $l43)
                          (local.tee $l40
                            (v128.const i32x4 0x20000000 0x3fe624dd 0x20000000 0x3fe624dd)))
                        (f64x2.promote_low_f32x4
                          (local.get $l41))))
                    (local.tee $l40
                      (f64x2.add
                        (f64x2.mul
                          (local.get $l46)
                          (local.get $l40))
                        (f64x2.promote_low_f32x4
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                            (local.get $l41)
                            (local.get $l41))))))
                  (local.get $l35)))))
          (local.set $l48
            (i32x4.min_s
              (local.get $l48)
              (local.get $l49)))
          (block $B12
            (block $B13
              (br_if $B13
                (v128.any_true
                  (i32x4.eq
                    (v128.and
                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                        (local.get $l42)
                        (local.get $l40))
                      (local.get $l37))
                    (local.get $l39))))
              (local.set $l41
                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                  (f32x4.demote_f64x2_zero
                    (local.get $l42))
                  (f32x4.demote_f64x2_zero
                    (local.get $l40))))
              (br $B12))
            (local.set $l41
              (call $fma4_tie
                (v128.const i32x4 0x3f3126e9 0x3f3126e9 0x3f3126e9 0x3f3126e9)
                (local.get $l20)
                (local.get $l41))))
          (v128.store offset=32
            (local.get $l10)
            (i32x4.max_u
              (local.get $l50)
              (local.tee $l49
                (v128.and
                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                    (local.tee $l42
                      (f64x2.add
                        (f64x2.mul
                          (local.get $l45)
                          (local.tee $l40
                            (v128.const i32x4 0xe0000000 0x3fcd70a3 0xe0000000 0x3fcd70a3)))
                        (f64x2.promote_low_f32x4
                          (local.get $l41))))
                    (local.tee $l40
                      (f64x2.add
                        (f64x2.mul
                          (local.get $l44)
                          (local.get $l40))
                        (f64x2.promote_low_f32x4
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                            (local.get $l41)
                            (local.get $l41))))))
                  (local.get $l35)))))
          (v128.store offset=16
            (local.get $l10)
            (i32x4.min_s
              (local.get $l48)
              (local.get $l49)))
          (block $B14
            (block $B15
              (br_if $B15
                (v128.any_true
                  (i32x4.eq
                    (v128.and
                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                        (local.get $l42)
                        (local.get $l40))
                      (local.get $l37))
                    (local.get $l39))))
              (local.set $l41
                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                  (f32x4.demote_f64x2_zero
                    (local.get $l42))
                  (f32x4.demote_f64x2_zero
                    (local.get $l40))))
              (br $B14))
            (local.set $l41
              (call $fma4_tie
                (v128.const i32x4 0x3e6b851f 0x3e6b851f 0x3e6b851f 0x3e6b851f)
                (local.get $l21)
                (local.get $l41))))
          (local.set $l48
            (call $cube_root_bias4
              (v128.andnot
                (local.get $l41)
                (f32x4.le
                  (local.get $l41)
                  (local.get $l47)))
              (i32.add
                (local.get $l10)
                (i32.const 16))))
          (local.set $l50
            (i32x4.max_s
              (v128.load offset=32
                (local.get $l10))
              (local.tee $l40
                (v128.and
                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                    (local.tee $l41
                      (f64x2.add
                        (f64x2.mul
                          (local.get $l34)
                          (local.tee $l42
                            (v128.const i32x4 0x20000000 0x3fe1a86d 0x20000000 0x3fe1a86d)))
                        (local.get $l36)))
                    (local.tee $l42
                      (f64x2.add
                        (f64x2.mul
                          (local.get $l38)
                          (local.get $l42))
                        (local.get $l18))))
                  (local.get $l35)))))
          (local.set $l34
            (i32x4.min_s
              (v128.load offset=16
                (local.get $l10))
              (local.get $l40)))
          (block $B16
            (block $B17
              (br_if $B17
                (v128.any_true
                  (i32x4.eq
                    (v128.and
                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                        (local.get $l41)
                        (local.get $l42))
                      (local.get $l37))
                    (local.get $l39))))
              (local.set $l41
                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                  (f32x4.demote_f64x2_zero
                    (local.get $l41))
                  (f32x4.demote_f64x2_zero
                    (local.get $l42))))
              (br $B16))
            (local.set $l41
              (call $fma4_tie
                (v128.const i32x4 0x3f0d4369 0x3f0d4369 0x3f0d4369 0x3f0d4369)
                (local.get $l17)
                (v128.const i32x4 0x3b789536 0x3b789536 0x3b789536 0x3b789536))))
          (local.set $l46
            (i32x4.max_u
              (local.get $l50)
              (local.tee $l43
                (v128.and
                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                    (local.tee $l42
                      (f64x2.add
                        (f64x2.mul
                          (local.get $l43)
                          (local.tee $l40
                            (v128.const i32x4 0xe0000000 0x3fca35d1 0xe0000000 0x3fca35d1)))
                        (f64x2.promote_low_f32x4
                          (local.get $l41))))
                    (local.tee $l40
                      (f64x2.add
                        (f64x2.mul
                          (local.get $l46)
                          (local.get $l40))
                        (f64x2.promote_low_f32x4
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                            (local.get $l41)
                            (local.get $l41))))))
                  (local.get $l35)))))
          (local.set $l43
            (i32x4.min_s
              (local.get $l34)
              (local.get $l43)))
          (block $B18
            (block $B19
              (br_if $B19
                (v128.any_true
                  (i32x4.eq
                    (v128.and
                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                        (local.get $l42)
                        (local.get $l40))
                      (local.get $l37))
                    (local.get $l39))))
              (local.set $l41
                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                  (f32x4.demote_f64x2_zero
                    (local.get $l42))
                  (f32x4.demote_f64x2_zero
                    (local.get $l40))))
              (br $B18))
            (local.set $l41
              (call $fma4_tie
                (v128.const i32x4 0x3e51ae8f 0x3e51ae8f 0x3e51ae8f 0x3e51ae8f)
                (local.get $l20)
                (local.get $l41))))
          (v128.store offset=32
            (local.get $l10)
            (i32x4.max_u
              (local.get $l46)
              (local.tee $l35
                (v128.and
                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                    (local.tee $l42
                      (f64x2.add
                        (f64x2.mul
                          (local.get $l45)
                          (local.tee $l40
                            (v128.const i32x4 0x80000000 0x3fcf2879 0x80000000 0x3fcf2879)))
                        (f64x2.promote_low_f32x4
                          (local.get $l41))))
                    (local.tee $l40
                      (f64x2.add
                        (f64x2.mul
                          (local.get $l44)
                          (local.get $l40))
                        (f64x2.promote_low_f32x4
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                            (local.get $l41)
                            (local.get $l41))))))
                  (local.get $l35)))))
          (v128.store offset=16
            (local.get $l10)
            (i32x4.min_s
              (local.get $l43)
              (local.get $l35)))
          (block $B20
            (block $B21
              (br_if $B21
                (v128.any_true
                  (i32x4.eq
                    (v128.and
                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                        (local.get $l42)
                        (local.get $l40))
                      (local.get $l37))
                    (local.get $l39))))
              (local.set $l35
                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                  (f32x4.demote_f64x2_zero
                    (local.get $l42))
                  (f32x4.demote_f64x2_zero
                    (local.get $l40))))
              (br $B20))
            (local.set $l35
              (call $fma4_tie
                (v128.const i32x4 0x3e7943cc 0x3e7943cc 0x3e7943cc 0x3e7943cc)
                (local.get $l21)
                (local.get $l41))))
          (local.set $l35
            (call $cube_root_bias4
              (v128.andnot
                (local.get $l35)
                (f32x4.le
                  (local.get $l35)
                  (local.get $l47)))
              (i32.add
                (local.get $l10)
                (i32.const 16))))
          (block $B22
            (block $B23
              (br_if $B23
                (i32.eqz
                  (v128.any_true
                    (v128.or
                      (i32x4.lt_s
                        (v128.load offset=16
                          (local.get $l10))
                        (v128.const i32x4 0x38100000 0x38100000 0x38100000 0x38100000))
                      (i32x4.gt_s
                        (v128.load offset=32
                          (local.get $l10))
                        (v128.const i32x4 0x47e00000 0x47e00000 0x47e00000 0x47e00000))))))
              (call $positive
                (f32x4.extract_lane 0
                  (local.get $l21))
                (f32x4.extract_lane 0
                  (local.get $l20))
                (f32x4.extract_lane 0
                  (local.get $l17))
                (i32.add
                  (local.get $l10)
                  (i32.const 4)))
              (local.set $l35
                (v128.load32_zero offset=4
                  (local.get $l10)))
              (local.set $l37
                (v128.load32_zero offset=8
                  (local.get $l10)))
              (local.set $l39
                (v128.load32_zero offset=12
                  (local.get $l10)))
              (call $positive
                (f32x4.extract_lane 1
                  (local.get $l21))
                (f32x4.extract_lane 1
                  (local.get $l20))
                (f32x4.extract_lane 1
                  (local.get $l17))
                (i32.add
                  (local.get $l10)
                  (i32.const 4)))
              (local.set $l39
                (v128.load32_lane offset=12 1
                  (local.get $l10)
                  (local.get $l39)))
              (local.set $l37
                (v128.load32_lane offset=8 1
                  (local.get $l10)
                  (local.get $l37)))
              (local.set $l35
                (v128.load32_lane offset=4 1
                  (local.get $l10)
                  (local.get $l35)))
              (call $positive
                (f32x4.extract_lane 2
                  (local.get $l21))
                (f32x4.extract_lane 2
                  (local.get $l20))
                (f32x4.extract_lane 2
                  (local.get $l17))
                (i32.add
                  (local.get $l10)
                  (i32.const 4)))
              (local.set $l35
                (v128.load32_lane offset=4 2
                  (local.get $l10)
                  (local.get $l35)))
              (local.set $l37
                (v128.load32_lane offset=8 2
                  (local.get $l10)
                  (local.get $l37)))
              (local.set $l39
                (v128.load32_lane offset=12 2
                  (local.get $l10)
                  (local.get $l39)))
              (call $positive
                (f32x4.extract_lane 3
                  (local.get $l21))
                (f32x4.extract_lane 3
                  (local.get $l20))
                (f32x4.extract_lane 3
                  (local.get $l17))
                (i32.add
                  (local.get $l10)
                  (i32.const 4)))
              (local.set $l17
                (v128.load32_lane offset=12 3
                  (local.get $l10)
                  (local.get $l39)))
              (local.set $l20
                (v128.load32_lane offset=8 3
                  (local.get $l10)
                  (local.get $l37)))
              (local.set $l21
                (v128.load32_lane offset=4 3
                  (local.get $l10)
                  (local.get $l35)))
              (br $B22))
            (local.set $l20
              (f32x4.add
                (local.tee $l37
                  (f32x4.mul
                    (f32x4.add
                      (local.get $l51)
                      (local.get $l48))
                    (local.tee $l17
                      (v128.const i32x4 0x3f000000 0x3f000000 0x3f000000 0x3f000000))))
                (v128.const i32x4 0x3c23d70a 0x3c23d70a 0x3c23d70a 0x3c23d70a)))
            (local.set $l21
              (f32x4.add
                (f32x4.mul
                  (f32x4.mul
                    (f32x4.sub
                      (local.get $l51)
                      (local.get $l48))
                    (local.get $l17))
                  (v128.const i32x4 0x41600000 0x41600000 0x41600000 0x41600000))
                (v128.const i32x4 0x3ed70a3d 0x3ed70a3d 0x3ed70a3d 0x3ed70a3d)))
            (local.set $l17
              (f32x4.add
                (f32x4.sub
                  (local.get $l35)
                  (local.get $l37))
                (v128.const i32x4 0x3f0ccccd 0x3f0ccccd 0x3f0ccccd 0x3f0ccccd))))
          (f32.store
            (local.tee $l22
              (i32.add
                (i32.add
                  (i32.load
                    (local.get $p5))
                  (local.get $l15))
                (local.get $l12)))
            (local.tee $l52
              (f32x4.extract_lane 0
                (local.get $l21))))
          (f32.store
            (local.tee $l11
              (i32.add
                (i32.add
                  (i32.load offset=4
                    (local.get $p5))
                  (local.get $l15))
                (local.get $l12)))
            (local.tee $l53
              (f32x4.extract_lane 0
                (local.get $l20))))
          (f32.store
            (local.tee $l23
              (i32.add
                (i32.add
                  (i32.load offset=8
                    (local.get $p5))
                  (local.get $l15))
                (local.get $l12)))
            (local.tee $l54
              (f32x4.extract_lane 0
                (local.get $l17))))
          (block $B24
            (br_if $B24
              (i32.eqz
                (local.get $p1)))
            (f32.store
              (i32.add
                (local.get $l22)
                (i32.const 4))
              (f32x4.extract_lane 1
                (local.get $l21)))
            (f32.store
              (i32.add
                (local.get $l11)
                (i32.const 4))
              (f32x4.extract_lane 1
                (local.get $l20)))
            (f32.store
              (i32.add
                (local.get $l23)
                (i32.const 4))
              (f32x4.extract_lane 1
                (local.get $l17)))
            (f32.store
              (i32.add
                (local.get $l22)
                (i32.const 8))
              (f32x4.extract_lane 2
                (local.get $l21)))
            (f32.store
              (i32.add
                (local.get $l11)
                (i32.const 8))
              (f32x4.extract_lane 2
                (local.get $l20)))
            (f32.store
              (i32.add
                (local.get $l23)
                (i32.const 8))
              (f32x4.extract_lane 2
                (local.get $l17)))
            (f32.store
              (i32.add
                (local.get $l22)
                (i32.const 12))
              (f32x4.extract_lane 3
                (local.get $l21)))
            (f32.store
              (i32.add
                (local.get $l11)
                (i32.const 12))
              (f32x4.extract_lane 3
                (local.get $l20)))
            (f32.store
              (i32.add
                (local.get $l23)
                (i32.const 12))
              (f32x4.extract_lane 3
                (local.get $l17)))
            (br $B2))
          (f32.store
            (local.tee $l30
              (i32.add
                (local.get $p9)
                (i32.mul
                  (local.get $l29)
                  (i32.const 12))))
            (local.get $l52))
          (f32.store
            (i32.add
              (local.get $l30)
              (i32.const 8))
            (local.get $l54))
          (f32.store
            (i32.add
              (local.get $l30)
              (i32.const 4))
            (local.get $l53))
          (f32.store
            (i32.add
              (local.get $l22)
              (i32.const 4))
            (local.tee $l52
              (f32x4.extract_lane 1
                (local.get $l21))))
          (f32.store
            (i32.add
              (local.get $l11)
              (i32.const 4))
            (local.tee $l53
              (f32x4.extract_lane 1
                (local.get $l20))))
          (f32.store
            (i32.add
              (local.get $l23)
              (i32.const 4))
            (local.tee $l54
              (f32x4.extract_lane 1
                (local.get $l17))))
          (f32.store
            (i32.add
              (local.tee $l30
                (i32.add
                  (local.get $p9)
                  (i32.mul
                    (local.get $l25)
                    (i32.const 12))))
              (i32.const 8))
            (local.get $l54))
          (f32.store
            (i32.add
              (local.get $l30)
              (i32.const 4))
            (local.get $l53))
          (f32.store
            (local.get $l30)
            (local.get $l52))
          (f32.store
            (i32.add
              (local.get $l22)
              (i32.const 8))
            (local.tee $l52
              (f32x4.extract_lane 2
                (local.get $l21))))
          (f32.store
            (i32.add
              (local.get $l11)
              (i32.const 8))
            (local.tee $l53
              (f32x4.extract_lane 2
                (local.get $l20))))
          (f32.store
            (i32.add
              (local.get $l23)
              (i32.const 8))
            (local.tee $l54
              (f32x4.extract_lane 2
                (local.get $l17))))
          (i32.store
            (i32.add
              (local.get $p8)
              (i32.shl
                (local.get $l29)
                (i32.const 2)))
            (local.get $l33))
          (f32.store
            (i32.add
              (local.tee $l30
                (i32.add
                  (local.get $p9)
                  (i32.mul
                    (local.get $l24)
                    (i32.const 12))))
              (i32.const 8))
            (local.get $l54))
          (f32.store
            (i32.add
              (local.get $l30)
              (i32.const 4))
            (local.get $l53))
          (f32.store
            (local.get $l30)
            (local.get $l52))
          (i32.store
            (i32.add
              (local.get $p8)
              (i32.shl
                (local.get $l25)
                (i32.const 2)))
            (local.get $l32))
          (f32.store
            (i32.add
              (local.get $l22)
              (i32.const 12))
            (local.tee $l52
              (f32x4.extract_lane 3
                (local.get $l21))))
          (f32.store
            (i32.add
              (local.get $l11)
              (i32.const 12))
            (local.tee $l53
              (f32x4.extract_lane 3
                (local.get $l20))))
          (i32.store
            (i32.add
              (local.get $p8)
              (i32.shl
                (local.get $l24)
                (i32.const 2)))
            (local.get $l28))
          (f32.store
            (i32.add
              (local.get $l23)
              (i32.const 12))
            (local.tee $l54
              (f32x4.extract_lane 3
                (local.get $l17))))
          (i32.store
            (i32.add
              (local.get $p8)
              (i32.shl
                (local.get $l26)
                (i32.const 2)))
            (local.get $l27))
          (f32.store
            (i32.add
              (local.tee $l22
                (i32.add
                  (local.get $p9)
                  (i32.mul
                    (local.get $l26)
                    (i32.const 12))))
              (i32.const 8))
            (local.get $l54))
          (f32.store
            (i32.add
              (local.get $l22)
              (i32.const 4))
            (local.get $l53))
          (f32.store
            (local.get $l22)
            (local.get $l52)))
        (local.set $l12
          (i32.add
            (local.get $l12)
            (i32.const 16)))
        (local.set $l22
          (i32.add
            (local.get $l19)
            (i32.const 8)))
        (local.set $l19
          (local.tee $l11
            (i32.add
              (local.get $l19)
              (i32.const 4))))
        (br_if $L1
          (i32.le_s
            (local.get $l22)
            (local.get $p3)))))
    (block $B25
      (br_if $B25
        (i32.le_s
          (local.get $p3)
          (local.get $l11)))
      (local.set $l22
        (i32.mul
          (local.get $p3)
          (local.get $p2)))
      (block $B26
        (br_if $B26
          (local.get $p1))
        (local.set $l23
          (i32.sub
            (local.get $p3)
            (local.get $l11)))
        (local.set $l12
          (i32.shl
            (i32.add
              (local.get $l11)
              (local.get $p6))
            (i32.const 2)))
        (local.set $l22
          (i32.add
            (local.get $p0)
            (i32.shl
              (i32.add
                (local.get $l11)
                (local.get $l22))
              (i32.const 2))))
        (loop $L27
          (local.set $l15
            (i32.add
              (local.get $p9)
              (i32.mul
                (local.tee $l11
                  (i32.shr_u
                    (i32.mul
                      (local.tee $l19
                        (i32.or
                          (i32.or
                            (i32.shl
                              (local.tee $p1
                                (i32.load8_u
                                  (i32.add
                                    (local.get $l22)
                                    (i32.const 1))))
                              (i32.const 8))
                            (i32.shl
                              (local.tee $l24
                                (i32.load8_u
                                  (local.get $l22)))
                              (i32.const 16)))
                          (local.tee $l25
                            (i32.load8_u
                              (i32.add
                                (local.get $l22)
                                (i32.const 2))))))
                      (i32.const -1640531535))
                    (i32.const 15)))
                (i32.const 12))))
          (block $B28
            (br_if $B28
              (i32.eq
                (i32.load
                  (local.tee $l11
                    (i32.add
                      (local.get $p8)
                      (i32.shl
                        (local.get $l11)
                        (i32.const 2)))))
                (local.get $l19)))
            (call $positive
              (f32.load
                (i32.add
                  (local.get $p7)
                  (i32.shl
                    (local.get $l24)
                    (i32.const 2))))
              (f32.load
                (i32.add
                  (local.get $p7)
                  (i32.shl
                    (local.get $p1)
                    (i32.const 2))))
              (f32.load
                (i32.add
                  (local.get $p7)
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2))))
              (local.get $l15))
            (i32.store
              (local.get $l11)
              (local.get $l19)))
          (f32.store
            (i32.add
              (i32.load
                (local.get $p5))
              (local.get $l12))
            (f32.load
              (local.get $l15)))
          (f32.store
            (i32.add
              (i32.load offset=4
                (local.get $p5))
              (local.get $l12))
            (f32.load offset=4
              (local.get $l15)))
          (f32.store
            (i32.add
              (i32.load offset=8
                (local.get $p5))
              (local.get $l12))
            (f32.load offset=8
              (local.get $l15)))
          (local.set $l22
            (i32.add
              (local.get $l22)
              (i32.const 4)))
          (local.set $l12
            (i32.add
              (local.get $l12)
              (i32.const 4)))
          (br_if $L27
            (local.tee $l23
              (i32.add
                (local.get $l23)
                (i32.const -1))))
          (br $B25)))
      (local.set $l22
        (i32.add
          (local.get $p0)
          (i32.add
            (i32.shl
              (local.tee $l23
                (i32.mul
                  (local.get $p4)
                  (local.get $p3)))
              (i32.const 2))
            (local.tee $l12
              (i32.shl
                (i32.add
                  (local.get $l11)
                  (local.get $l22))
                (i32.const 2))))))
      (local.set $p7
        (i32.sub
          (local.get $p3)
          (local.get $l11)))
      (local.set $l15
        (i32.add
          (local.get $p0)
          (local.get $l12)))
      (local.set $l19
        (i32.add
          (i32.load
            (local.get $p5))
          (local.tee $l11
            (i32.shl
              (i32.add
                (local.get $l11)
                (local.get $p6))
              (i32.const 2)))))
      (local.set $p8
        (i32.add
          (i32.load offset=4
            (local.get $p5))
          (local.get $l11)))
      (local.set $p5
        (i32.add
          (i32.load offset=8
            (local.get $p5))
          (local.get $l11)))
      (local.set $l11
        (i32.add
          (local.get $p0)
          (i32.add
            (i32.shl
              (local.get $l23)
              (i32.const 3))
            (local.get $l12))))
      (local.set $l12
        (i32.const 0))
      (loop $L29
        (call $positive
          (f32.load
            (i32.add
              (local.get $l15)
              (local.get $l12)))
          (f32.load
            (i32.add
              (local.get $l22)
              (local.get $l12)))
          (f32.load
            (i32.add
              (local.get $l11)
              (local.get $l12)))
          (i32.add
            (local.get $l10)
            (i32.const 16)))
        (f32.store
          (i32.add
            (local.get $l19)
            (local.get $l12))
          (f32.load offset=16
            (local.get $l10)))
        (f32.store
          (i32.add
            (local.get $p8)
            (local.get $l12))
          (f32.load offset=20
            (local.get $l10)))
        (f32.store
          (i32.add
            (local.get $p5)
            (local.get $l12))
          (f32.load offset=24
            (local.get $l10)))
        (local.set $l12
          (i32.add
            (local.get $l12)
            (i32.const 4)))
        (br_if $L29
          (local.tee $p7
            (i32.add
              (local.get $p7)
              (i32.const -1))))))
    (global.set $__stack_pointer
      (i32.add
        (local.get $l10)
        (i32.const 48))))
  (func $fma4_tie (type $t6) (param $p0 v128) (param $p1 v128) (param $p2 v128) (result v128)
    (local $l3 v128) (local $l4 v128) (local $l5 v128) (local $l6 v128) (local $l7 v128) (local $l8 v128) (local $l9 v128) (local $l10 f64) (local $l11 f64) (local $l12 f64) (local $l13 f32) (local $l14 f64) (local $l15 i64) (local $l16 f64) (local $l17 i32) (local $l18 i32) (local $l19 i32) (local $l20 f32)
    (block $B0
      (br_if $B0
        (v128.any_true
          (v128.and
            (i32x4.eq
              (v128.and
                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                  (local.tee $l5
                    (f64x2.add
                      (local.tee $l3
                        (f64x2.mul
                          (f64x2.promote_low_f32x4
                            (local.get $p0))
                          (f64x2.promote_low_f32x4
                            (local.get $p1))))
                      (local.tee $l4
                        (f64x2.promote_low_f32x4
                          (local.get $p2)))))
                  (local.tee $l8
                    (f64x2.add
                      (local.tee $l6
                        (f64x2.mul
                          (f64x2.promote_low_f32x4
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                              (local.get $p0)
                              (local.get $p0)))
                          (f64x2.promote_low_f32x4
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                              (local.get $p1)
                              (local.get $p1)))))
                      (local.tee $l7
                        (f64x2.promote_low_f32x4
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                            (local.get $p2)
                            (local.get $p2)))))))
                (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff))
              (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000))
            (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
              (f64x2.ne
                (f64x2.add
                  (f64x2.sub
                    (local.get $l4)
                    (local.tee $l9
                      (f64x2.sub
                        (local.get $l5)
                        (local.get $l3))))
                  (f64x2.sub
                    (local.get $l3)
                    (f64x2.sub
                      (local.get $l5)
                      (local.get $l9))))
                (local.tee $l3
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
              (f64x2.ne
                (f64x2.add
                  (f64x2.sub
                    (local.get $l7)
                    (local.tee $l4
                      (f64x2.sub
                        (local.get $l8)
                        (local.get $l6))))
                  (f64x2.sub
                    (local.get $l6)
                    (f64x2.sub
                      (local.get $l8)
                      (local.get $l4))))
                (local.get $l3))))))
      (return
        (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
          (f32x4.demote_f64x2_zero
            (local.get $l5))
          (f32x4.demote_f64x2_zero
            (local.get $l8)))))
    (block $B1
      (br_if $B1
        (f64.eq
          (local.tee $l12
            (f64.add
              (local.tee $l10
                (f64.mul
                  (f64.promote_f32
                    (f32x4.extract_lane 0
                      (local.get $p0)))
                  (f64.promote_f32
                    (f32x4.extract_lane 0
                      (local.get $p1)))))
              (local.tee $l11
                (f64.promote_f32
                  (f32x4.extract_lane 0
                    (local.get $p2))))))
          (local.tee $l14
            (f64.promote_f32
              (local.tee $l13
                (f32.demote_f64
                  (local.get $l12)))))))
      (block $B2
        (br_if $B2
          (i64.eq
            (i64.and
              (local.tee $l15
                (i64.reinterpret_f64
                  (local.get $l12)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B1
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l15)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B1
        (i64.gt_u
          (i64.shl
            (local.get $l15)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B1
        (f64.eq
          (local.tee $l10
            (f64.add
              (f64.sub
                (local.get $l11)
                (local.tee $l16
                  (f64.sub
                    (local.get $l12)
                    (local.get $l10))))
              (f64.sub
                (local.get $l10)
                (f64.sub
                  (local.get $l12)
                  (local.get $l16)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B3
        (br_if $B3
          (i32.lt_u
            (i32.shl
              (local.tee $l17
                (i32.reinterpret_f32
                  (local.get $l13)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l13
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l13
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $l13)
                    (f64.gt
                      (local.get $l10)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $l13)
                  (f64.eq
                    (local.get $l12)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l10)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l13)
            (f64.eq
              (local.get $l12)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B1))
      (br_if $B1
        (f64.le
          (f64.mul
            (local.get $l10)
            (f64.convert_i32_s
              (local.tee $l19
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l18
                    (f64.gt
                      (local.get $l12)
                      (local.get $l14)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B4
        (block $B5
          (br_if $B5
            (f32.ne
              (local.get $l13)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $l20
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l18)))
          (br $B4))
        (local.set $l20
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l19)
                (i32.sub
                  (i32.const 0)
                  (local.get $l19))
                (f64.gt
                  (local.get $l12)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l17)))))
      (local.set $l13
        (select
          (local.get $l20)
          (local.get $l13)
          (f64.eq
            (local.get $l12)
            (f64.mul
              (f64.add
                (local.get $l14)
                (f64.promote_f32
                  (local.get $l20)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (local.set $l5
      (f32x4.splat
        (local.get $l13)))
    (block $B6
      (br_if $B6
        (f64.eq
          (local.tee $l12
            (f64.add
              (local.tee $l10
                (f64.mul
                  (f64.promote_f32
                    (f32x4.extract_lane 1
                      (local.get $p0)))
                  (f64.promote_f32
                    (f32x4.extract_lane 1
                      (local.get $p1)))))
              (local.tee $l11
                (f64.promote_f32
                  (f32x4.extract_lane 1
                    (local.get $p2))))))
          (local.tee $l14
            (f64.promote_f32
              (local.tee $l13
                (f32.demote_f64
                  (local.get $l12)))))))
      (block $B7
        (br_if $B7
          (i64.eq
            (i64.and
              (local.tee $l15
                (i64.reinterpret_f64
                  (local.get $l12)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B6
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l15)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B6
        (i64.gt_u
          (i64.shl
            (local.get $l15)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B6
        (f64.eq
          (local.tee $l10
            (f64.add
              (f64.sub
                (local.get $l11)
                (local.tee $l16
                  (f64.sub
                    (local.get $l12)
                    (local.get $l10))))
              (f64.sub
                (local.get $l10)
                (f64.sub
                  (local.get $l12)
                  (local.get $l16)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B8
        (br_if $B8
          (i32.gt_u
            (i32.shl
              (local.tee $l17
                (i32.reinterpret_f32
                  (local.get $l13)))
              (i32.const 1))
            (i32.const -16777217)))
        (br_if $B6
          (f64.le
            (f64.mul
              (local.get $l10)
              (f64.convert_i32_s
                (local.tee $l19
                  (select
                    (i32.const 1)
                    (i32.const -1)
                    (local.tee $l18
                      (f64.gt
                        (local.get $l12)
                        (local.get $l14)))))))
            (f64.const 0x0p+0 (;=0;))))
        (block $B9
          (block $B10
            (br_if $B10
              (f32.eq
                (local.get $l13)
                (f32.const 0x0p+0 (;=0;))))
            (local.set $l20
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l19)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l19))
                    (f64.gt
                      (local.get $l12)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l17))))
            (br $B9))
          (local.set $l20
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l18))))
        (local.set $l13
          (select
            (local.get $l20)
            (local.get $l13)
            (f64.eq
              (local.get $l12)
              (f64.mul
                (f64.add
                  (local.get $l14)
                  (f64.promote_f32
                    (local.get $l20)))
                (f64.const 0x1p-1 (;=0.5;))))))
        (br $B6))
      (local.set $l13
        (select
          (select
            (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
            (local.tee $l13
              (select
                (select
                  (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                  (local.get $l13)
                  (f64.gt
                    (local.get $l10)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l13)
                (f64.eq
                  (local.get $l12)
                  (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
            (f64.lt
              (local.get $l10)
              (f64.const 0x0p+0 (;=0;))))
          (local.get $l13)
          (f64.eq
            (local.get $l12)
            (f64.const 0x1.ffffffp+127 (;=3.40282e+38;))))))
    (local.set $l5
      (f32x4.replace_lane 1
        (local.get $l5)
        (local.get $l13)))
    (block $B11
      (br_if $B11
        (f64.eq
          (local.tee $l12
            (f64.add
              (local.tee $l10
                (f64.mul
                  (f64.promote_f32
                    (f32x4.extract_lane 2
                      (local.get $p0)))
                  (f64.promote_f32
                    (f32x4.extract_lane 2
                      (local.get $p1)))))
              (local.tee $l11
                (f64.promote_f32
                  (f32x4.extract_lane 2
                    (local.get $p2))))))
          (local.tee $l14
            (f64.promote_f32
              (local.tee $l13
                (f32.demote_f64
                  (local.get $l12)))))))
      (block $B12
        (br_if $B12
          (i64.eq
            (i64.and
              (local.tee $l15
                (i64.reinterpret_f64
                  (local.get $l12)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B11
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l15)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B11
        (i64.gt_u
          (i64.shl
            (local.get $l15)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B11
        (f64.eq
          (local.tee $l10
            (f64.add
              (f64.sub
                (local.get $l11)
                (local.tee $l16
                  (f64.sub
                    (local.get $l12)
                    (local.get $l10))))
              (f64.sub
                (local.get $l10)
                (f64.sub
                  (local.get $l12)
                  (local.get $l16)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B13
        (br_if $B13
          (i32.gt_u
            (i32.shl
              (local.tee $l17
                (i32.reinterpret_f32
                  (local.get $l13)))
              (i32.const 1))
            (i32.const -16777217)))
        (br_if $B11
          (f64.le
            (f64.mul
              (local.get $l10)
              (f64.convert_i32_s
                (local.tee $l19
                  (select
                    (i32.const 1)
                    (i32.const -1)
                    (local.tee $l18
                      (f64.gt
                        (local.get $l12)
                        (local.get $l14)))))))
            (f64.const 0x0p+0 (;=0;))))
        (block $B14
          (block $B15
            (br_if $B15
              (f32.eq
                (local.get $l13)
                (f32.const 0x0p+0 (;=0;))))
            (local.set $l20
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l19)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l19))
                    (f64.gt
                      (local.get $l12)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l17))))
            (br $B14))
          (local.set $l20
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l18))))
        (local.set $l13
          (select
            (local.get $l20)
            (local.get $l13)
            (f64.eq
              (local.get $l12)
              (f64.mul
                (f64.add
                  (local.get $l14)
                  (f64.promote_f32
                    (local.get $l20)))
                (f64.const 0x1p-1 (;=0.5;))))))
        (br $B11))
      (local.set $l13
        (select
          (select
            (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
            (local.tee $l13
              (select
                (select
                  (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                  (local.get $l13)
                  (f64.gt
                    (local.get $l10)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l13)
                (f64.eq
                  (local.get $l12)
                  (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
            (f64.lt
              (local.get $l10)
              (f64.const 0x0p+0 (;=0;))))
          (local.get $l13)
          (f64.eq
            (local.get $l12)
            (f64.const 0x1.ffffffp+127 (;=3.40282e+38;))))))
    (local.set $l5
      (f32x4.replace_lane 2
        (local.get $l5)
        (local.get $l13)))
    (block $B16
      (br_if $B16
        (f64.eq
          (local.tee $l12
            (f64.add
              (local.tee $l10
                (f64.mul
                  (f64.promote_f32
                    (f32x4.extract_lane 3
                      (local.get $p0)))
                  (f64.promote_f32
                    (f32x4.extract_lane 3
                      (local.get $p1)))))
              (local.tee $l11
                (f64.promote_f32
                  (f32x4.extract_lane 3
                    (local.get $p2))))))
          (local.tee $l14
            (f64.promote_f32
              (local.tee $l13
                (f32.demote_f64
                  (local.get $l12)))))))
      (block $B17
        (br_if $B17
          (i64.eq
            (i64.and
              (local.tee $l15
                (i64.reinterpret_f64
                  (local.get $l12)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B16
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l15)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B16
        (i64.gt_u
          (i64.shl
            (local.get $l15)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B16
        (f64.eq
          (local.tee $l10
            (f64.add
              (f64.sub
                (local.get $l11)
                (local.tee $l16
                  (f64.sub
                    (local.get $l12)
                    (local.get $l10))))
              (f64.sub
                (local.get $l10)
                (f64.sub
                  (local.get $l12)
                  (local.get $l16)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B18
        (br_if $B18
          (i32.gt_u
            (i32.shl
              (local.tee $l17
                (i32.reinterpret_f32
                  (local.get $l13)))
              (i32.const 1))
            (i32.const -16777217)))
        (br_if $B16
          (f64.le
            (f64.mul
              (local.get $l10)
              (f64.convert_i32_s
                (local.tee $l19
                  (select
                    (i32.const 1)
                    (i32.const -1)
                    (local.tee $l18
                      (f64.gt
                        (local.get $l12)
                        (local.get $l14)))))))
            (f64.const 0x0p+0 (;=0;))))
        (block $B19
          (block $B20
            (br_if $B20
              (f32.eq
                (local.get $l13)
                (f32.const 0x0p+0 (;=0;))))
            (local.set $l20
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l19)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l19))
                    (f64.gt
                      (local.get $l12)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l17))))
            (br $B19))
          (local.set $l20
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l18))))
        (return
          (f32x4.replace_lane 3
            (local.get $l5)
            (select
              (local.get $l20)
              (local.get $l13)
              (f64.eq
                (local.get $l12)
                (f64.mul
                  (f64.add
                    (local.get $l14)
                    (f64.promote_f32
                      (local.get $l20)))
                  (f64.const 0x1p-1 (;=0.5;))))))))
      (local.set $l13
        (select
          (select
            (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
            (local.tee $l13
              (select
                (select
                  (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                  (local.get $l13)
                  (f64.gt
                    (local.get $l10)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l13)
                (f64.eq
                  (local.get $l12)
                  (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
            (f64.lt
              (local.get $l10)
              (f64.const 0x0p+0 (;=0;))))
          (local.get $l13)
          (f64.eq
            (local.get $l12)
            (f64.const 0x1.ffffffp+127 (;=3.40282e+38;))))))
    (f32x4.replace_lane 3
      (local.get $l5)
      (local.get $l13)))
  (func $blur_lane (type $t7) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32)
    (local $l5 i32) (local $l6 i32) (local $l7 i32) (local $l8 i32) (local $l9 f32) (local $l10 f32) (local $l11 f32) (local $l12 f32) (local $l13 f32) (local $l14 f32) (local $l15 i32) (local $l16 i32) (local $l17 f32) (local $l18 f32) (local $l19 f32) (local $l20 f64) (local $l21 f64) (local $l22 f64) (local $l23 f64) (local $l24 i64) (local $l25 f64) (local $l26 i32) (local $l27 i32) (local $l28 i32) (local $l29 i32) (local $l30 i32) (local $l31 i32) (local $l32 i32) (local $l33 i32) (local $l34 i32) (local $l35 f64) (local $l36 f64) (local $l37 f64) (local $l38 f64) (local $l39 f64) (local $l40 i32) (local $l41 i32) (local $l42 i32) (local $l43 v128) (local $l44 v128) (local $l45 v128) (local $l46 v128)
    (i32.store offset=68
      (local.tee $l5
        (i32.sub
          (global.get $__stack_pointer)
          (i32.const 80)))
      (i32.const 0))
    (i64.store offset=72 align=4
      (local.get $l5)
      (i64.const 0))
    (i32.store offset=56
      (local.get $l5)
      (i32.const 0))
    (i64.store offset=60 align=4
      (local.get $l5)
      (i64.const 0))
    (local.set $l7
      (i32.add
        (local.get $p1)
        (local.tee $l6
          (i32.shl
            (local.get $p4)
            (i32.const 2)))))
    (block $B0
      (block $B1
        (br_if $B1
          (i32.ge_s
            (local.get $p2)
            (i32.const -3)))
        (local.set $l8
          (i32.const -4))
        (local.set $l9
          (f32.const 0x0p+0 (;=0;)))
        (local.set $l10
          (f32.const 0x0p+0 (;=0;)))
        (local.set $l11
          (f32.const 0x0p+0 (;=0;)))
        (local.set $l12
          (f32.const 0x0p+0 (;=0;)))
        (local.set $l13
          (f32.const 0x0p+0 (;=0;)))
        (local.set $l14
          (f32.const 0x0p+0 (;=0;)))
        (br $B0))
      (local.set $l8
        (select
          (local.get $p2)
          (i32.const 8)
          (i32.lt_s
            (local.get $p2)
            (i32.const 8))))
      (local.set $l15
        (i32.add
          (i32.add
            (local.get $l6)
            (local.get $p0))
          (i32.const -160)))
      (local.set $l16
        (i32.add
          (local.get $l7)
          (i32.const -64)))
      (local.set $l6
        (i32.const -4))
      (local.set $l9
        (f32.const 0x0p+0 (;=0;)))
      (local.set $l10
        (f32.const 0x0p+0 (;=0;)))
      (local.set $l11
        (f32.const 0x0p+0 (;=0;)))
      (local.set $l17
        (f32.const 0x0p+0 (;=0;)))
      (local.set $l18
        (f32.const 0x0p+0 (;=0;)))
      (local.set $l19
        (f32.const 0x0p+0 (;=0;)))
      (loop $L2
        (local.set $l14
          (local.get $l11))
        (local.set $l13
          (local.get $l10))
        (local.set $l12
          (local.get $l9))
        (local.set $l9
          (f32.const 0x0p+0 (;=0;)))
        (block $B3
          (br_if $B3
            (i32.lt_s
              (local.get $l6)
              (i32.const 6)))
          (local.set $l9
            (f32.load
              (local.get $l15))))
        (local.set $l10
          (f32.const 0x0p+0 (;=0;)))
        (block $B4
          (br_if $B4
            (i32.ge_s
              (i32.add
                (local.get $l6)
                (i32.const 4))
              (local.get $p2)))
          (local.set $l10
            (f32.load
              (i32.add
                (local.get $l15)
                (i32.const 160)))))
        (block $B5
          (br_if $B5
            (f64.eq
              (local.tee $l22
                (f64.add
                  (local.tee $l20
                    (f64.mul
                      (f64.promote_f32
                        (f32.load offset=40
                          (local.get $p3)))
                      (f64.promote_f32
                        (local.get $l14))))
                  (local.tee $l21
                    (f64.promote_f32
                      (f32.sub
                        (f32.mul
                          (local.tee $l9
                            (f32.add
                              (local.get $l9)
                              (local.get $l10)))
                          (f32.load offset=24
                            (local.get $p3)))
                        (local.get $l19))))))
              (local.tee $l23
                (f64.promote_f32
                  (local.tee $l11
                    (f32.demote_f64
                      (local.get $l22)))))))
          (block $B6
            (br_if $B6
              (i64.eq
                (i64.and
                  (local.tee $l24
                    (i64.reinterpret_f64
                      (local.get $l22)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B5
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l24)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B5
            (i64.gt_u
              (i64.shl
                (local.get $l24)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B5
            (f64.eq
              (local.tee $l20
                (f64.add
                  (f64.sub
                    (local.get $l21)
                    (local.tee $l25
                      (f64.sub
                        (local.get $l22)
                        (local.get $l20))))
                  (f64.sub
                    (local.get $l20)
                    (f64.sub
                      (local.get $l22)
                      (local.get $l25)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B7
            (br_if $B7
              (i32.lt_u
                (i32.shl
                  (local.tee $l26
                    (i32.reinterpret_f32
                      (local.get $l11)))
                  (i32.const 1))
                (i32.const -16777216)))
            (local.set $l11
              (select
                (select
                  (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                  (local.tee $l10
                    (select
                      (select
                        (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                        (local.get $l11)
                        (f64.gt
                          (local.get $l20)
                          (f64.const 0x0p+0 (;=0;))))
                      (local.get $l11)
                      (f64.eq
                        (local.get $l22)
                        (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                  (f64.lt
                    (local.get $l20)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l10)
                (f64.eq
                  (local.get $l22)
                  (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
            (br $B5))
          (br_if $B5
            (f64.le
              (f64.mul
                (local.get $l20)
                (f64.convert_i32_s
                  (local.tee $l28
                    (select
                      (i32.const 1)
                      (i32.const -1)
                      (local.tee $l27
                        (f64.gt
                          (local.get $l22)
                          (local.get $l23)))))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B8
            (block $B9
              (br_if $B9
                (f32.ne
                  (local.get $l11)
                  (f32.const 0x0p+0 (;=0;))))
              (local.set $l10
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l27)))
              (br $B8))
            (local.set $l10
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l28)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l28))
                    (f64.gt
                      (local.get $l22)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l26)))))
          (local.set $l11
            (select
              (local.get $l10)
              (local.get $l11)
              (f64.eq
                (local.get $l22)
                (f64.mul
                  (f64.add
                    (local.get $l23)
                    (f64.promote_f32
                      (local.get $l10)))
                  (f64.const 0x1p-1 (;=0.5;)))))))
        (block $B10
          (br_if $B10
            (f64.eq
              (local.tee $l22
                (f64.add
                  (local.tee $l20
                    (f64.mul
                      (f64.promote_f32
                        (f32.load offset=88
                          (local.get $p3)))
                      (f64.promote_f32
                        (local.get $l13))))
                  (local.tee $l21
                    (f64.promote_f32
                      (f32.sub
                        (f32.mul
                          (local.get $l9)
                          (f32.load offset=72
                            (local.get $p3)))
                        (local.get $l18))))))
              (local.tee $l23
                (f64.promote_f32
                  (local.tee $l10
                    (f32.demote_f64
                      (local.get $l22)))))))
          (block $B11
            (br_if $B11
              (i64.eq
                (i64.and
                  (local.tee $l24
                    (i64.reinterpret_f64
                      (local.get $l22)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B10
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l24)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B10
            (i64.gt_u
              (i64.shl
                (local.get $l24)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B10
            (f64.eq
              (local.tee $l20
                (f64.add
                  (f64.sub
                    (local.get $l21)
                    (local.tee $l25
                      (f64.sub
                        (local.get $l22)
                        (local.get $l20))))
                  (f64.sub
                    (local.get $l20)
                    (f64.sub
                      (local.get $l22)
                      (local.get $l25)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B12
            (br_if $B12
              (i32.gt_u
                (i32.shl
                  (local.tee $l26
                    (i32.reinterpret_f32
                      (local.get $l10)))
                  (i32.const 1))
                (i32.const -16777217)))
            (br_if $B10
              (f64.le
                (f64.mul
                  (local.get $l20)
                  (f64.convert_i32_s
                    (local.tee $l28
                      (select
                        (i32.const 1)
                        (i32.const -1)
                        (local.tee $l27
                          (f64.gt
                            (local.get $l22)
                            (local.get $l23)))))))
                (f64.const 0x0p+0 (;=0;))))
            (block $B13
              (block $B14
                (br_if $B14
                  (f32.eq
                    (local.get $l10)
                    (f32.const 0x0p+0 (;=0;))))
                (local.set $l18
                  (f32.reinterpret_i32
                    (i32.add
                      (select
                        (local.get $l28)
                        (i32.sub
                          (i32.const 0)
                          (local.get $l28))
                        (f64.gt
                          (local.get $l22)
                          (f64.const 0x1p-150 (;=7.00649e-46;))))
                      (local.get $l26))))
                (br $B13))
              (local.set $l18
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l27))))
            (local.set $l10
              (select
                (local.get $l18)
                (local.get $l10)
                (f64.eq
                  (local.get $l22)
                  (f64.mul
                    (f64.add
                      (local.get $l23)
                      (f64.promote_f32
                        (local.get $l18)))
                    (f64.const 0x1p-1 (;=0.5;))))))
            (br $B10))
          (local.set $l10
            (select
              (select
                (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                (local.tee $l10
                  (select
                    (select
                      (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                      (local.get $l10)
                      (f64.gt
                        (local.get $l20)
                        (f64.const 0x0p+0 (;=0;))))
                    (local.get $l10)
                    (f64.eq
                      (local.get $l22)
                      (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                (f64.lt
                  (local.get $l20)
                  (f64.const 0x0p+0 (;=0;))))
              (local.get $l10)
              (f64.eq
                (local.get $l22)
                (f64.const 0x1.ffffffp+127 (;=3.40282e+38;))))))
        (block $B15
          (br_if $B15
            (f64.eq
              (local.tee $l22
                (f64.add
                  (local.tee $l20
                    (f64.mul
                      (f64.promote_f32
                        (f32.load offset=136
                          (local.get $p3)))
                      (f64.promote_f32
                        (local.get $l12))))
                  (local.tee $l21
                    (f64.promote_f32
                      (f32.sub
                        (f32.mul
                          (local.get $l9)
                          (f32.load offset=120
                            (local.get $p3)))
                        (local.get $l17))))))
              (local.tee $l23
                (f64.promote_f32
                  (local.tee $l9
                    (f32.demote_f64
                      (local.get $l22)))))))
          (block $B16
            (br_if $B16
              (i64.eq
                (i64.and
                  (local.tee $l24
                    (i64.reinterpret_f64
                      (local.get $l22)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B15
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l24)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B15
            (i64.gt_u
              (i64.shl
                (local.get $l24)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B15
            (f64.eq
              (local.tee $l20
                (f64.add
                  (f64.sub
                    (local.get $l21)
                    (local.tee $l25
                      (f64.sub
                        (local.get $l22)
                        (local.get $l20))))
                  (f64.sub
                    (local.get $l20)
                    (f64.sub
                      (local.get $l22)
                      (local.get $l25)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B17
            (br_if $B17
              (i32.gt_u
                (i32.shl
                  (local.tee $l26
                    (i32.reinterpret_f32
                      (local.get $l9)))
                  (i32.const 1))
                (i32.const -16777217)))
            (br_if $B15
              (f64.le
                (f64.mul
                  (local.get $l20)
                  (f64.convert_i32_s
                    (local.tee $l28
                      (select
                        (i32.const 1)
                        (i32.const -1)
                        (local.tee $l27
                          (f64.gt
                            (local.get $l22)
                            (local.get $l23)))))))
                (f64.const 0x0p+0 (;=0;))))
            (block $B18
              (block $B19
                (br_if $B19
                  (f32.eq
                    (local.get $l9)
                    (f32.const 0x0p+0 (;=0;))))
                (local.set $l17
                  (f32.reinterpret_i32
                    (i32.add
                      (select
                        (local.get $l28)
                        (i32.sub
                          (i32.const 0)
                          (local.get $l28))
                        (f64.gt
                          (local.get $l22)
                          (f64.const 0x1p-150 (;=7.00649e-46;))))
                      (local.get $l26))))
                (br $B18))
              (local.set $l17
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l27))))
            (local.set $l9
              (select
                (local.get $l17)
                (local.get $l9)
                (f64.eq
                  (local.get $l22)
                  (f64.mul
                    (f64.add
                      (local.get $l23)
                      (f64.promote_f32
                        (local.get $l17)))
                    (f64.const 0x1p-1 (;=0.5;))))))
            (br $B15))
          (local.set $l9
            (select
              (select
                (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                (local.tee $l9
                  (select
                    (select
                      (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                      (local.get $l9)
                      (f64.gt
                        (local.get $l20)
                        (f64.const 0x0p+0 (;=0;))))
                    (local.get $l9)
                    (f64.eq
                      (local.get $l22)
                      (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                (f64.lt
                  (local.get $l20)
                  (f64.const 0x0p+0 (;=0;))))
              (local.get $l9)
              (f64.eq
                (local.get $l22)
                (f64.const 0x1.ffffffp+127 (;=3.40282e+38;))))))
        (block $B20
          (br_if $B20
            (i32.lt_s
              (local.get $l6)
              (i32.const 0)))
          (f32.store
            (local.get $l16)
            (f32.add
              (local.get $l11)
              (f32.add
                (local.get $l10)
                (local.get $l9)))))
        (local.set $l15
          (i32.add
            (local.get $l15)
            (i32.const 16)))
        (local.set $l16
          (i32.add
            (local.get $l16)
            (i32.const 16)))
        (local.set $l17
          (local.get $l12))
        (local.set $l18
          (local.get $l13))
        (local.set $l19
          (local.get $l14))
        (br_if $L2
          (i32.ne
            (local.tee $l6
              (i32.add
                (local.get $l6)
                (i32.const 1)))
            (local.get $l8))))
      (f32.store offset=8
        (local.get $l5)
        (local.get $l9))
      (f32.store offset=4
        (local.get $l5)
        (local.get $l10))
      (f32.store
        (local.get $l5)
        (local.get $l11))
      (f32.store offset=56
        (local.get $l5)
        (local.get $l14))
      (f32.store offset=68
        (local.get $l5)
        (local.get $l11))
      (f32.store offset=60
        (local.get $l5)
        (local.get $l13))
      (f32.store offset=72
        (local.get $l5)
        (local.get $l10))
      (f32.store offset=64
        (local.get $l5)
        (local.get $l12))
      (f32.store offset=76
        (local.get $l5)
        (local.get $l9)))
    (block $B21
      (br_if $B21
        (i32.ge_s
          (local.get $l8)
          (local.tee $l29
            (i32.add
              (local.get $p2)
              (i32.const -7)))))
      (local.set $l30
        (i32.shl
          (local.get $p4)
          (i32.const 2)))
      (loop $L22
        (local.set $l11
          (f32.add
            (f32.load
              (i32.add
                (local.tee $l6
                  (i32.add
                    (i32.add
                      (local.get $p0)
                      (local.tee $l31
                        (i32.shl
                          (local.get $l8)
                          (i32.const 4))))
                    (local.get $l30)))
                (i32.const -96)))
            (f32.load
              (i32.add
                (local.get $l6)
                (i32.const 64)))))
        (local.set $l12
          (f32.mul
            (local.tee $l9
              (f32.add
                (f32.load
                  (i32.add
                    (local.tee $l6
                      (i32.add
                        (i32.add
                          (local.get $p0)
                          (local.tee $l32
                            (i32.add
                              (local.get $l31)
                              (i32.const 48))))
                        (local.get $l30)))
                    (i32.const -96)))
                (f32.load
                  (i32.add
                    (local.get $l6)
                    (i32.const 64)))))
            (f32.const 0x0p+0 (;=0;))))
        (local.set $l13
          (f32.mul
            (local.tee $l10
              (f32.add
                (f32.load
                  (i32.add
                    (local.tee $l6
                      (i32.add
                        (i32.add
                          (local.get $p0)
                          (local.tee $l33
                            (i32.add
                              (local.get $l31)
                              (i32.const 32))))
                        (local.get $l30)))
                    (i32.const -96)))
                (f32.load
                  (i32.add
                    (local.get $l6)
                    (i32.const 64)))))
            (f32.const 0x0p+0 (;=0;))))
        (local.set $l14
          (f32.mul
            (local.tee $l17
              (f32.add
                (f32.load
                  (i32.add
                    (local.tee $l6
                      (i32.add
                        (i32.add
                          (local.get $p0)
                          (local.tee $l34
                            (i32.add
                              (local.get $l31)
                              (i32.const 16))))
                        (local.get $l30)))
                    (i32.const -96)))
                (f32.load
                  (i32.add
                    (local.get $l6)
                    (i32.const 64)))))
            (f32.const 0x0p+0 (;=0;))))
        (local.set $l35
          (f64.promote_f32
            (local.get $l9)))
        (local.set $l36
          (f64.promote_f32
            (local.get $l10)))
        (local.set $l37
          (f64.promote_f32
            (local.get $l17)))
        (local.set $l26
          (local.get $l5))
        (local.set $l28
          (local.get $p3))
        (local.set $l27
          (i32.const 0))
        (loop $L23
          (local.set $l25
            (f64.promote_f32
              (f32.load
                (i32.add
                  (i32.add
                    (local.get $l5)
                    (i32.const 68))
                  (local.tee $l6
                    (i32.shl
                      (local.get $l27)
                      (i32.const 2)))))))
          (local.set $l38
            (f64.promote_f32
              (f32.load
                (i32.add
                  (i32.add
                    (local.get $l5)
                    (i32.const 56))
                  (local.get $l6)))))
          (local.set $l6
            (i32.const 0))
          (local.set $l16
            (i32.const 0))
          (loop $L24
            (local.set $l9
              (f32.mul
                (local.get $l11)
                (f32.load
                  (i32.add
                    (local.tee $l15
                      (i32.add
                        (local.get $l28)
                        (local.get $l6)))
                    (i32.const 24)))))
            (block $B25
              (block $B26
                (block $B27
                  (block $B28
                    (block $B29
                      (block $B30
                        (br_if $B30
                          (i32.eqz
                            (local.get $l6)))
                        (block $B31
                          (br_if $B31
                            (f64.eq
                              (local.tee $l22
                                (f64.add
                                  (local.tee $l20
                                    (f64.mul
                                      (f64.promote_f32
                                        (f32.load
                                          (i32.add
                                            (local.get $l15)
                                            (i32.const 20))))
                                      (local.get $l37)))
                                  (local.tee $l21
                                    (f64.promote_f32
                                      (local.get $l9)))))
                              (local.tee $l23
                                (f64.promote_f32
                                  (local.tee $l9
                                    (f32.demote_f64
                                      (local.get $l22)))))))
                          (block $B32
                            (br_if $B32
                              (i64.eq
                                (i64.and
                                  (local.tee $l24
                                    (i64.reinterpret_f64
                                      (local.get $l22)))
                                  (i64.const 536870911))
                                (i64.const 268435456)))
                            (br_if $B31
                              (i32.gt_u
                                (i32.add
                                  (i32.and
                                    (i32.wrap_i64
                                      (i64.shr_u
                                        (local.get $l24)
                                        (i64.const 52)))
                                    (i32.const 2047))
                                  (i32.const -1151))
                                (i32.const -255))))
                          (br_if $B31
                            (i64.gt_u
                              (i64.shl
                                (local.get $l24)
                                (i64.const 1))
                              (i64.const -9007199254740993)))
                          (br_if $B31
                            (f64.eq
                              (local.tee $l20
                                (f64.add
                                  (f64.sub
                                    (local.get $l21)
                                    (local.tee $l39
                                      (f64.sub
                                        (local.get $l22)
                                        (local.get $l20))))
                                  (f64.sub
                                    (local.get $l20)
                                    (f64.sub
                                      (local.get $l22)
                                      (local.get $l39)))))
                              (f64.const 0x0p+0 (;=0;))))
                          (block $B33
                            (br_if $B33
                              (i32.lt_u
                                (i32.shl
                                  (local.tee $l40
                                    (i32.reinterpret_f32
                                      (local.get $l9)))
                                  (i32.const 1))
                                (i32.const -16777216)))
                            (local.set $l9
                              (select
                                (select
                                  (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                                  (local.tee $l9
                                    (select
                                      (select
                                        (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                                        (local.get $l9)
                                        (f64.gt
                                          (local.get $l20)
                                          (f64.const 0x0p+0 (;=0;))))
                                      (local.get $l9)
                                      (f64.eq
                                        (local.get $l22)
                                        (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                                  (f64.lt
                                    (local.get $l20)
                                    (f64.const 0x0p+0 (;=0;))))
                                (local.get $l9)
                                (f64.eq
                                  (local.get $l22)
                                  (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
                            (br $B31))
                          (br_if $B31
                            (f64.le
                              (f64.mul
                                (local.get $l20)
                                (f64.convert_i32_s
                                  (local.tee $l42
                                    (select
                                      (i32.const 1)
                                      (i32.const -1)
                                      (local.tee $l41
                                        (f64.gt
                                          (local.get $l22)
                                          (local.get $l23)))))))
                              (f64.const 0x0p+0 (;=0;))))
                          (block $B34
                            (block $B35
                              (br_if $B35
                                (f32.ne
                                  (local.get $l9)
                                  (f32.const 0x0p+0 (;=0;))))
                              (local.set $l10
                                (select
                                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                                  (local.get $l41)))
                              (br $B34))
                            (local.set $l10
                              (f32.reinterpret_i32
                                (i32.add
                                  (select
                                    (local.get $l42)
                                    (i32.sub
                                      (i32.const 0)
                                      (local.get $l42))
                                    (f64.gt
                                      (local.get $l22)
                                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                                  (local.get $l40)))))
                          (local.set $l9
                            (select
                              (local.get $l10)
                              (local.get $l9)
                              (f64.eq
                                (local.get $l22)
                                (f64.mul
                                  (f64.add
                                    (local.get $l23)
                                    (f64.promote_f32
                                      (local.get $l10)))
                                  (f64.const 0x1p-1 (;=0.5;)))))))
                        (br_if $B29
                          (i32.eq
                            (local.get $l6)
                            (i32.const 4)))
                        (br_if $B27
                          (f64.eq
                            (local.tee $l22
                              (f64.add
                                (local.tee $l20
                                  (f64.mul
                                    (f64.promote_f32
                                      (f32.load
                                        (i32.add
                                          (local.get $l15)
                                          (i32.const 16))))
                                    (local.get $l36)))
                                (local.tee $l21
                                  (f64.promote_f32
                                    (local.get $l9)))))
                            (local.tee $l23
                              (f64.promote_f32
                                (local.tee $l9
                                  (f32.demote_f64
                                    (local.get $l22)))))))
                        (block $B36
                          (br_if $B36
                            (i64.eq
                              (i64.and
                                (local.tee $l24
                                  (i64.reinterpret_f64
                                    (local.get $l22)))
                                (i64.const 536870911))
                              (i64.const 268435456)))
                          (br_if $B27
                            (i32.gt_u
                              (i32.add
                                (i32.and
                                  (i32.wrap_i64
                                    (i64.shr_u
                                      (local.get $l24)
                                      (i64.const 52)))
                                  (i32.const 2047))
                                (i32.const -1151))
                              (i32.const -255))))
                        (br_if $B27
                          (i64.gt_u
                            (i64.shl
                              (local.get $l24)
                              (i64.const 1))
                            (i64.const -9007199254740993)))
                        (br_if $B27
                          (f64.eq
                            (local.tee $l20
                              (f64.add
                                (f64.sub
                                  (local.get $l21)
                                  (local.tee $l39
                                    (f64.sub
                                      (local.get $l22)
                                      (local.get $l20))))
                                (f64.sub
                                  (local.get $l20)
                                  (f64.sub
                                    (local.get $l22)
                                    (local.get $l39)))))
                            (f64.const 0x0p+0 (;=0;))))
                        (br_if $B28
                          (i32.gt_u
                            (i32.shl
                              (local.tee $l40
                                (i32.reinterpret_f32
                                  (local.get $l9)))
                              (i32.const 1))
                            (i32.const -16777217)))
                        (br_if $B27
                          (f64.le
                            (f64.mul
                              (local.get $l20)
                              (f64.convert_i32_s
                                (local.tee $l42
                                  (select
                                    (i32.const 1)
                                    (i32.const -1)
                                    (local.tee $l41
                                      (f64.gt
                                        (local.get $l22)
                                        (local.get $l23)))))))
                            (f64.const 0x0p+0 (;=0;))))
                        (block $B37
                          (block $B38
                            (br_if $B38
                              (f32.eq
                                (local.get $l9)
                                (f32.const 0x0p+0 (;=0;))))
                            (local.set $l10
                              (f32.reinterpret_i32
                                (i32.add
                                  (select
                                    (local.get $l42)
                                    (i32.sub
                                      (i32.const 0)
                                      (local.get $l42))
                                    (f64.gt
                                      (local.get $l22)
                                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                                  (local.get $l40))))
                            (br $B37))
                          (local.set $l10
                            (select
                              (f32.const 0x1.p-149 (;=1.4013e-45;))
                              (f32.const -0x1.p-149 (;=-1.4013e-45;))
                              (local.get $l41))))
                        (local.set $l9
                          (select
                            (local.get $l10)
                            (local.get $l9)
                            (f64.eq
                              (local.get $l22)
                              (f64.mul
                                (f64.add
                                  (local.get $l23)
                                  (f64.promote_f32
                                    (local.get $l10)))
                                (f64.const 0x1p-1 (;=0.5;))))))
                        (br $B27))
                      (local.set $l9
                        (f32.add
                          (local.get $l9)
                          (local.get $l14))))
                    (local.set $l9
                      (f32.add
                        (local.get $l9)
                        (local.get $l13)))
                    (br $B26))
                  (local.set $l9
                    (select
                      (select
                        (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                        (local.tee $l9
                          (select
                            (select
                              (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                              (local.get $l9)
                              (f64.gt
                                (local.get $l20)
                                (f64.const 0x0p+0 (;=0;))))
                            (local.get $l9)
                            (f64.eq
                              (local.get $l22)
                              (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                        (f64.lt
                          (local.get $l20)
                          (f64.const 0x0p+0 (;=0;))))
                      (local.get $l9)
                      (f64.eq
                        (local.get $l22)
                        (f64.const 0x1.ffffffp+127 (;=3.40282e+38;))))))
                (br_if $B26
                  (i32.lt_u
                    (local.get $l16)
                    (i32.const 3)))
                (br_if $B25
                  (f64.eq
                    (local.tee $l22
                      (f64.add
                        (local.tee $l20
                          (f64.mul
                            (f64.promote_f32
                              (f32.load
                                (i32.add
                                  (local.get $l15)
                                  (i32.const 12))))
                            (local.get $l35)))
                        (local.tee $l21
                          (f64.promote_f32
                            (local.get $l9)))))
                    (local.tee $l23
                      (f64.promote_f32
                        (local.tee $l9
                          (f32.demote_f64
                            (local.get $l22)))))))
                (block $B39
                  (br_if $B39
                    (i64.eq
                      (i64.and
                        (local.tee $l24
                          (i64.reinterpret_f64
                            (local.get $l22)))
                        (i64.const 536870911))
                      (i64.const 268435456)))
                  (br_if $B25
                    (i32.gt_u
                      (i32.add
                        (i32.and
                          (i32.wrap_i64
                            (i64.shr_u
                              (local.get $l24)
                              (i64.const 52)))
                          (i32.const 2047))
                        (i32.const -1151))
                      (i32.const -255))))
                (br_if $B25
                  (i64.gt_u
                    (i64.shl
                      (local.get $l24)
                      (i64.const 1))
                    (i64.const -9007199254740993)))
                (br_if $B25
                  (f64.eq
                    (local.tee $l20
                      (f64.add
                        (f64.sub
                          (local.get $l21)
                          (local.tee $l39
                            (f64.sub
                              (local.get $l22)
                              (local.get $l20))))
                        (f64.sub
                          (local.get $l20)
                          (f64.sub
                            (local.get $l22)
                            (local.get $l39)))))
                    (f64.const 0x0p+0 (;=0;))))
                (block $B40
                  (br_if $B40
                    (i32.gt_u
                      (i32.shl
                        (local.tee $l40
                          (i32.reinterpret_f32
                            (local.get $l9)))
                        (i32.const 1))
                      (i32.const -16777217)))
                  (br_if $B25
                    (f64.le
                      (f64.mul
                        (local.get $l20)
                        (f64.convert_i32_s
                          (local.tee $l42
                            (select
                              (i32.const 1)
                              (i32.const -1)
                              (local.tee $l41
                                (f64.gt
                                  (local.get $l22)
                                  (local.get $l23)))))))
                      (f64.const 0x0p+0 (;=0;))))
                  (block $B41
                    (block $B42
                      (br_if $B42
                        (f32.eq
                          (local.get $l9)
                          (f32.const 0x0p+0 (;=0;))))
                      (local.set $l10
                        (f32.reinterpret_i32
                          (i32.add
                            (select
                              (local.get $l42)
                              (i32.sub
                                (i32.const 0)
                                (local.get $l42))
                              (f64.gt
                                (local.get $l22)
                                (f64.const 0x1p-150 (;=7.00649e-46;))))
                            (local.get $l40))))
                      (br $B41))
                    (local.set $l10
                      (select
                        (f32.const 0x1.p-149 (;=1.4013e-45;))
                        (f32.const -0x1.p-149 (;=-1.4013e-45;))
                        (local.get $l41))))
                  (local.set $l9
                    (select
                      (local.get $l10)
                      (local.get $l9)
                      (f64.eq
                        (local.get $l22)
                        (f64.mul
                          (f64.add
                            (local.get $l23)
                            (f64.promote_f32
                              (local.get $l10)))
                          (f64.const 0x1p-1 (;=0.5;))))))
                  (br $B25))
                (local.set $l9
                  (select
                    (select
                      (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                      (local.tee $l9
                        (select
                          (select
                            (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                            (local.get $l9)
                            (f64.gt
                              (local.get $l20)
                              (f64.const 0x0p+0 (;=0;))))
                          (local.get $l9)
                          (f64.eq
                            (local.get $l22)
                            (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                      (f64.lt
                        (local.get $l20)
                        (f64.const 0x0p+0 (;=0;))))
                    (local.get $l9)
                    (f64.eq
                      (local.get $l22)
                      (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
                (br $B25))
              (local.set $l9
                (f32.add
                  (local.get $l9)
                  (local.get $l12))))
            (local.set $l10
              (f32.load
                (i32.add
                  (local.get $l15)
                  (i32.const 40))))
            (block $B43
              (br_if $B43
                (f64.eq
                  (local.tee $l22
                    (f64.add
                      (local.tee $l20
                        (f64.mul
                          (f64.promote_f32
                            (f32.load
                              (i32.add
                                (local.get $l15)
                                (i32.const 56))))
                          (local.get $l38)))
                      (local.tee $l21
                        (f64.promote_f32
                          (local.get $l9)))))
                  (local.tee $l23
                    (f64.promote_f32
                      (local.tee $l9
                        (f32.demote_f64
                          (local.get $l22)))))))
              (block $B44
                (br_if $B44
                  (i64.eq
                    (i64.and
                      (local.tee $l24
                        (i64.reinterpret_f64
                          (local.get $l22)))
                      (i64.const 536870911))
                    (i64.const 268435456)))
                (br_if $B43
                  (i32.gt_u
                    (i32.add
                      (i32.and
                        (i32.wrap_i64
                          (i64.shr_u
                            (local.get $l24)
                            (i64.const 52)))
                        (i32.const 2047))
                      (i32.const -1151))
                    (i32.const -255))))
              (br_if $B43
                (i64.gt_u
                  (i64.shl
                    (local.get $l24)
                    (i64.const 1))
                  (i64.const -9007199254740993)))
              (br_if $B43
                (f64.eq
                  (local.tee $l20
                    (f64.add
                      (f64.sub
                        (local.get $l21)
                        (local.tee $l39
                          (f64.sub
                            (local.get $l22)
                            (local.get $l20))))
                      (f64.sub
                        (local.get $l20)
                        (f64.sub
                          (local.get $l22)
                          (local.get $l39)))))
                  (f64.const 0x0p+0 (;=0;))))
              (block $B45
                (br_if $B45
                  (i32.lt_u
                    (i32.shl
                      (local.tee $l15
                        (i32.reinterpret_f32
                          (local.get $l9)))
                      (i32.const 1))
                    (i32.const -16777216)))
                (local.set $l9
                  (select
                    (select
                      (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                      (local.tee $l9
                        (select
                          (select
                            (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                            (local.get $l9)
                            (f64.gt
                              (local.get $l20)
                              (f64.const 0x0p+0 (;=0;))))
                          (local.get $l9)
                          (f64.eq
                            (local.get $l22)
                            (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                      (f64.lt
                        (local.get $l20)
                        (f64.const 0x0p+0 (;=0;))))
                    (local.get $l9)
                    (f64.eq
                      (local.get $l22)
                      (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
                (br $B43))
              (br_if $B43
                (f64.le
                  (f64.mul
                    (local.get $l20)
                    (f64.convert_i32_s
                      (local.tee $l40
                        (select
                          (i32.const 1)
                          (i32.const -1)
                          (local.tee $l42
                            (f64.gt
                              (local.get $l22)
                              (local.get $l23)))))))
                  (f64.const 0x0p+0 (;=0;))))
              (block $B46
                (block $B47
                  (br_if $B47
                    (f32.ne
                      (local.get $l9)
                      (f32.const 0x0p+0 (;=0;))))
                  (local.set $l17
                    (select
                      (f32.const 0x1.p-149 (;=1.4013e-45;))
                      (f32.const -0x1.p-149 (;=-1.4013e-45;))
                      (local.get $l42)))
                  (br $B46))
                (local.set $l17
                  (f32.reinterpret_i32
                    (i32.add
                      (select
                        (local.get $l40)
                        (i32.sub
                          (i32.const 0)
                          (local.get $l40))
                        (f64.gt
                          (local.get $l22)
                          (f64.const 0x1p-150 (;=7.00649e-46;))))
                      (local.get $l15)))))
              (local.set $l9
                (select
                  (local.get $l17)
                  (local.get $l9)
                  (f64.eq
                    (local.get $l22)
                    (f64.mul
                      (f64.add
                        (local.get $l23)
                        (f64.promote_f32
                          (local.get $l17)))
                      (f64.const 0x1p-1 (;=0.5;)))))))
            (block $B48
              (br_if $B48
                (f64.eq
                  (local.tee $l22
                    (f64.add
                      (local.tee $l20
                        (f64.mul
                          (f64.promote_f32
                            (local.get $l10))
                          (local.get $l25)))
                      (local.tee $l21
                        (f64.promote_f32
                          (local.get $l9)))))
                  (local.tee $l23
                    (f64.promote_f32
                      (local.tee $l9
                        (f32.demote_f64
                          (local.get $l22)))))))
              (block $B49
                (br_if $B49
                  (i64.eq
                    (i64.and
                      (local.tee $l24
                        (i64.reinterpret_f64
                          (local.get $l22)))
                      (i64.const 536870911))
                    (i64.const 268435456)))
                (br_if $B48
                  (i32.gt_u
                    (i32.add
                      (i32.and
                        (i32.wrap_i64
                          (i64.shr_u
                            (local.get $l24)
                            (i64.const 52)))
                        (i32.const 2047))
                      (i32.const -1151))
                    (i32.const -255))))
              (br_if $B48
                (i64.gt_u
                  (i64.shl
                    (local.get $l24)
                    (i64.const 1))
                  (i64.const -9007199254740993)))
              (br_if $B48
                (f64.eq
                  (local.tee $l20
                    (f64.add
                      (f64.sub
                        (local.get $l21)
                        (local.tee $l39
                          (f64.sub
                            (local.get $l22)
                            (local.get $l20))))
                      (f64.sub
                        (local.get $l20)
                        (f64.sub
                          (local.get $l22)
                          (local.get $l39)))))
                  (f64.const 0x0p+0 (;=0;))))
              (block $B50
                (br_if $B50
                  (i32.lt_u
                    (i32.shl
                      (local.tee $l15
                        (i32.reinterpret_f32
                          (local.get $l9)))
                      (i32.const 1))
                    (i32.const -16777216)))
                (local.set $l9
                  (select
                    (select
                      (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                      (local.tee $l9
                        (select
                          (select
                            (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                            (local.get $l9)
                            (f64.gt
                              (local.get $l20)
                              (f64.const 0x0p+0 (;=0;))))
                          (local.get $l9)
                          (f64.eq
                            (local.get $l22)
                            (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                      (f64.lt
                        (local.get $l20)
                        (f64.const 0x0p+0 (;=0;))))
                    (local.get $l9)
                    (f64.eq
                      (local.get $l22)
                      (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
                (br $B48))
              (br_if $B48
                (f64.le
                  (f64.mul
                    (local.get $l20)
                    (f64.convert_i32_s
                      (local.tee $l40
                        (select
                          (i32.const 1)
                          (i32.const -1)
                          (local.tee $l42
                            (f64.gt
                              (local.get $l22)
                              (local.get $l23)))))))
                  (f64.const 0x0p+0 (;=0;))))
              (block $B51
                (block $B52
                  (br_if $B52
                    (f32.ne
                      (local.get $l9)
                      (f32.const 0x0p+0 (;=0;))))
                  (local.set $l10
                    (select
                      (f32.const 0x1.p-149 (;=1.4013e-45;))
                      (f32.const -0x1.p-149 (;=-1.4013e-45;))
                      (local.get $l42)))
                  (br $B51))
                (local.set $l10
                  (f32.reinterpret_i32
                    (i32.add
                      (select
                        (local.get $l40)
                        (i32.sub
                          (i32.const 0)
                          (local.get $l40))
                        (f64.gt
                          (local.get $l22)
                          (f64.const 0x1p-150 (;=7.00649e-46;))))
                      (local.get $l15)))))
              (local.set $l9
                (select
                  (local.get $l10)
                  (local.get $l9)
                  (f64.eq
                    (local.get $l22)
                    (f64.mul
                      (f64.add
                        (local.get $l23)
                        (f64.promote_f32
                          (local.get $l10)))
                      (f64.const 0x1p-1 (;=0.5;)))))))
            (f32.store
              (i32.add
                (local.get $l26)
                (local.get $l6))
              (local.get $l9))
            (local.set $l16
              (i32.add
                (local.get $l16)
                (i32.const 1)))
            (br_if $L24
              (i32.ne
                (local.tee $l6
                  (i32.add
                    (local.get $l6)
                    (i32.const 4)))
                (i32.const 16))))
          (local.set $l26
            (i32.add
              (local.get $l26)
              (i32.const 16)))
          (local.set $l28
            (i32.add
              (local.get $l28)
              (i32.const 48)))
          (br_if $L23
            (i32.ne
              (local.tee $l27
                (i32.add
                  (local.get $l27)
                  (i32.const 1)))
              (i32.const 3))))
        (f32.store
          (i32.add
            (local.get $l7)
            (local.get $l31))
          (f32x4.extract_lane 0
            (local.tee $l46
              (f32x4.add
                (local.tee $l43
                  (v128.load
                    (local.get $l5)))
                (f32x4.add
                  (local.tee $l44
                    (v128.load offset=16
                      (local.get $l5)))
                  (local.tee $l45
                    (v128.load offset=32
                      (local.get $l5))))))))
        (f32.store
          (i32.add
            (local.get $l7)
            (local.get $l34))
          (f32x4.extract_lane 1
            (local.get $l46)))
        (f32.store
          (i32.add
            (local.get $l7)
            (local.get $l33))
          (f32x4.extract_lane 2
            (local.get $l46)))
        (f32.store
          (i32.add
            (local.get $l7)
            (local.get $l32))
          (f32x4.extract_lane 3
            (local.get $l46)))
        (f32.store offset=56
          (local.get $l5)
          (local.tee $l14
            (f32x4.extract_lane 2
              (local.get $l43))))
        (f32.store offset=68
          (local.get $l5)
          (local.tee $l11
            (f32x4.extract_lane 3
              (local.get $l43))))
        (f32.store offset=60
          (local.get $l5)
          (local.tee $l13
            (f32x4.extract_lane 2
              (local.get $l44))))
        (f32.store offset=72
          (local.get $l5)
          (local.tee $l10
            (f32x4.extract_lane 3
              (local.get $l44))))
        (f32.store offset=64
          (local.get $l5)
          (local.tee $l12
            (f32x4.extract_lane 2
              (local.get $l45))))
        (f32.store offset=76
          (local.get $l5)
          (local.tee $l9
            (f32x4.extract_lane 3
              (local.get $l45))))
        (br_if $L22
          (i32.lt_s
            (local.tee $l8
              (i32.add
                (local.get $l8)
                (i32.const 4)))
            (local.get $l29)))))
    (block $B53
      (br_if $B53
        (i32.ge_s
          (local.get $l8)
          (local.get $p2)))
      (local.set $l6
        (i32.add
          (local.get $p1)
          (local.tee $l15
            (i32.add
              (i32.shl
                (local.get $l8)
                (i32.const 4))
              (i32.shl
                (local.get $p4)
                (i32.const 2))))))
      (local.set $l15
        (i32.add
          (i32.add
            (local.get $l15)
            (local.get $p0))
          (i32.const 64)))
      (loop $L54
        (local.set $l17
          (local.get $l14))
        (local.set $l18
          (local.get $l13))
        (local.set $l19
          (local.get $l12))
        (local.set $l14
          (local.get $l11))
        (local.set $l13
          (local.get $l10))
        (local.set $l12
          (local.get $l9))
        (local.set $l9
          (f32.const 0x0p+0 (;=0;)))
        (block $B55
          (br_if $B55
            (i32.lt_s
              (local.get $l8)
              (i32.const 6)))
          (local.set $l9
            (f32.load
              (i32.add
                (local.get $l15)
                (i32.const -160)))))
        (local.set $l10
          (f32.const 0x0p+0 (;=0;)))
        (block $B56
          (br_if $B56
            (i32.ge_s
              (local.tee $l16
                (i32.add
                  (local.get $l8)
                  (i32.const 4)))
              (local.get $p2)))
          (local.set $l10
            (f32.load
              (local.get $l15))))
        (block $B57
          (br_if $B57
            (f64.eq
              (local.tee $l22
                (f64.add
                  (local.tee $l20
                    (f64.mul
                      (f64.promote_f32
                        (f32.load offset=40
                          (local.get $p3)))
                      (f64.promote_f32
                        (local.get $l14))))
                  (local.tee $l21
                    (f64.promote_f32
                      (f32.sub
                        (f32.mul
                          (local.tee $l9
                            (f32.add
                              (local.get $l9)
                              (local.get $l10)))
                          (f32.load offset=24
                            (local.get $p3)))
                        (local.get $l17))))))
              (local.tee $l23
                (f64.promote_f32
                  (local.tee $l11
                    (f32.demote_f64
                      (local.get $l22)))))))
          (block $B58
            (br_if $B58
              (i64.eq
                (i64.and
                  (local.tee $l24
                    (i64.reinterpret_f64
                      (local.get $l22)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B57
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l24)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B57
            (i64.gt_u
              (i64.shl
                (local.get $l24)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B57
            (f64.eq
              (local.tee $l20
                (f64.add
                  (f64.sub
                    (local.get $l21)
                    (local.tee $l25
                      (f64.sub
                        (local.get $l22)
                        (local.get $l20))))
                  (f64.sub
                    (local.get $l20)
                    (f64.sub
                      (local.get $l22)
                      (local.get $l25)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B59
            (br_if $B59
              (i32.lt_u
                (i32.shl
                  (local.tee $l26
                    (i32.reinterpret_f32
                      (local.get $l11)))
                  (i32.const 1))
                (i32.const -16777216)))
            (local.set $l11
              (select
                (select
                  (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                  (local.tee $l10
                    (select
                      (select
                        (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                        (local.get $l11)
                        (f64.gt
                          (local.get $l20)
                          (f64.const 0x0p+0 (;=0;))))
                      (local.get $l11)
                      (f64.eq
                        (local.get $l22)
                        (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                  (f64.lt
                    (local.get $l20)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l10)
                (f64.eq
                  (local.get $l22)
                  (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
            (br $B57))
          (br_if $B57
            (f64.le
              (f64.mul
                (local.get $l20)
                (f64.convert_i32_s
                  (local.tee $l28
                    (select
                      (i32.const 1)
                      (i32.const -1)
                      (local.tee $l27
                        (f64.gt
                          (local.get $l22)
                          (local.get $l23)))))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B60
            (block $B61
              (br_if $B61
                (f32.ne
                  (local.get $l11)
                  (f32.const 0x0p+0 (;=0;))))
              (local.set $l10
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l27)))
              (br $B60))
            (local.set $l10
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l28)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l28))
                    (f64.gt
                      (local.get $l22)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l26)))))
          (local.set $l11
            (select
              (local.get $l10)
              (local.get $l11)
              (f64.eq
                (local.get $l22)
                (f64.mul
                  (f64.add
                    (local.get $l23)
                    (f64.promote_f32
                      (local.get $l10)))
                  (f64.const 0x1p-1 (;=0.5;)))))))
        (block $B62
          (br_if $B62
            (f64.eq
              (local.tee $l22
                (f64.add
                  (local.tee $l20
                    (f64.mul
                      (f64.promote_f32
                        (f32.load offset=88
                          (local.get $p3)))
                      (f64.promote_f32
                        (local.get $l13))))
                  (local.tee $l21
                    (f64.promote_f32
                      (f32.sub
                        (f32.mul
                          (local.get $l9)
                          (f32.load offset=72
                            (local.get $p3)))
                        (local.get $l18))))))
              (local.tee $l23
                (f64.promote_f32
                  (local.tee $l10
                    (f32.demote_f64
                      (local.get $l22)))))))
          (block $B63
            (br_if $B63
              (i64.eq
                (i64.and
                  (local.tee $l24
                    (i64.reinterpret_f64
                      (local.get $l22)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B62
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l24)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B62
            (i64.gt_u
              (i64.shl
                (local.get $l24)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B62
            (f64.eq
              (local.tee $l20
                (f64.add
                  (f64.sub
                    (local.get $l21)
                    (local.tee $l25
                      (f64.sub
                        (local.get $l22)
                        (local.get $l20))))
                  (f64.sub
                    (local.get $l20)
                    (f64.sub
                      (local.get $l22)
                      (local.get $l25)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B64
            (br_if $B64
              (i32.gt_u
                (i32.shl
                  (local.tee $l26
                    (i32.reinterpret_f32
                      (local.get $l10)))
                  (i32.const 1))
                (i32.const -16777217)))
            (br_if $B62
              (f64.le
                (f64.mul
                  (local.get $l20)
                  (f64.convert_i32_s
                    (local.tee $l28
                      (select
                        (i32.const 1)
                        (i32.const -1)
                        (local.tee $l27
                          (f64.gt
                            (local.get $l22)
                            (local.get $l23)))))))
                (f64.const 0x0p+0 (;=0;))))
            (block $B65
              (block $B66
                (br_if $B66
                  (f32.eq
                    (local.get $l10)
                    (f32.const 0x0p+0 (;=0;))))
                (local.set $l17
                  (f32.reinterpret_i32
                    (i32.add
                      (select
                        (local.get $l28)
                        (i32.sub
                          (i32.const 0)
                          (local.get $l28))
                        (f64.gt
                          (local.get $l22)
                          (f64.const 0x1p-150 (;=7.00649e-46;))))
                      (local.get $l26))))
                (br $B65))
              (local.set $l17
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l27))))
            (local.set $l10
              (select
                (local.get $l17)
                (local.get $l10)
                (f64.eq
                  (local.get $l22)
                  (f64.mul
                    (f64.add
                      (local.get $l23)
                      (f64.promote_f32
                        (local.get $l17)))
                    (f64.const 0x1p-1 (;=0.5;))))))
            (br $B62))
          (local.set $l10
            (select
              (select
                (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                (local.tee $l10
                  (select
                    (select
                      (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                      (local.get $l10)
                      (f64.gt
                        (local.get $l20)
                        (f64.const 0x0p+0 (;=0;))))
                    (local.get $l10)
                    (f64.eq
                      (local.get $l22)
                      (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                (f64.lt
                  (local.get $l20)
                  (f64.const 0x0p+0 (;=0;))))
              (local.get $l10)
              (f64.eq
                (local.get $l22)
                (f64.const 0x1.ffffffp+127 (;=3.40282e+38;))))))
        (block $B67
          (br_if $B67
            (f64.eq
              (local.tee $l22
                (f64.add
                  (local.tee $l20
                    (f64.mul
                      (f64.promote_f32
                        (f32.load offset=136
                          (local.get $p3)))
                      (f64.promote_f32
                        (local.get $l12))))
                  (local.tee $l21
                    (f64.promote_f32
                      (f32.sub
                        (f32.mul
                          (local.get $l9)
                          (f32.load offset=120
                            (local.get $p3)))
                        (local.get $l19))))))
              (local.tee $l23
                (f64.promote_f32
                  (local.tee $l9
                    (f32.demote_f64
                      (local.get $l22)))))))
          (block $B68
            (br_if $B68
              (i64.eq
                (i64.and
                  (local.tee $l24
                    (i64.reinterpret_f64
                      (local.get $l22)))
                  (i64.const 536870911))
                (i64.const 268435456)))
            (br_if $B67
              (i32.gt_u
                (i32.add
                  (i32.and
                    (i32.wrap_i64
                      (i64.shr_u
                        (local.get $l24)
                        (i64.const 52)))
                    (i32.const 2047))
                  (i32.const -1151))
                (i32.const -255))))
          (br_if $B67
            (i64.gt_u
              (i64.shl
                (local.get $l24)
                (i64.const 1))
              (i64.const -9007199254740993)))
          (br_if $B67
            (f64.eq
              (local.tee $l20
                (f64.add
                  (f64.sub
                    (local.get $l21)
                    (local.tee $l25
                      (f64.sub
                        (local.get $l22)
                        (local.get $l20))))
                  (f64.sub
                    (local.get $l20)
                    (f64.sub
                      (local.get $l22)
                      (local.get $l25)))))
              (f64.const 0x0p+0 (;=0;))))
          (block $B69
            (br_if $B69
              (i32.gt_u
                (i32.shl
                  (local.tee $l26
                    (i32.reinterpret_f32
                      (local.get $l9)))
                  (i32.const 1))
                (i32.const -16777217)))
            (br_if $B67
              (f64.le
                (f64.mul
                  (local.get $l20)
                  (f64.convert_i32_s
                    (local.tee $l28
                      (select
                        (i32.const 1)
                        (i32.const -1)
                        (local.tee $l27
                          (f64.gt
                            (local.get $l22)
                            (local.get $l23)))))))
                (f64.const 0x0p+0 (;=0;))))
            (block $B70
              (block $B71
                (br_if $B71
                  (f32.eq
                    (local.get $l9)
                    (f32.const 0x0p+0 (;=0;))))
                (local.set $l17
                  (f32.reinterpret_i32
                    (i32.add
                      (select
                        (local.get $l28)
                        (i32.sub
                          (i32.const 0)
                          (local.get $l28))
                        (f64.gt
                          (local.get $l22)
                          (f64.const 0x1p-150 (;=7.00649e-46;))))
                      (local.get $l26))))
                (br $B70))
              (local.set $l17
                (select
                  (f32.const 0x1.p-149 (;=1.4013e-45;))
                  (f32.const -0x1.p-149 (;=-1.4013e-45;))
                  (local.get $l27))))
            (local.set $l9
              (select
                (local.get $l17)
                (local.get $l9)
                (f64.eq
                  (local.get $l22)
                  (f64.mul
                    (f64.add
                      (local.get $l23)
                      (f64.promote_f32
                        (local.get $l17)))
                    (f64.const 0x1p-1 (;=0.5;))))))
            (br $B67))
          (local.set $l9
            (select
              (select
                (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
                (local.tee $l9
                  (select
                    (select
                      (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                      (local.get $l9)
                      (f64.gt
                        (local.get $l20)
                        (f64.const 0x0p+0 (;=0;))))
                    (local.get $l9)
                    (f64.eq
                      (local.get $l22)
                      (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
                (f64.lt
                  (local.get $l20)
                  (f64.const 0x0p+0 (;=0;))))
              (local.get $l9)
              (f64.eq
                (local.get $l22)
                (f64.const 0x1.ffffffp+127 (;=3.40282e+38;))))))
        (f32.store
          (local.get $l6)
          (f32.add
            (local.get $l11)
            (f32.add
              (local.get $l10)
              (local.get $l9))))
        (local.set $l6
          (i32.add
            (local.get $l6)
            (i32.const 16)))
        (local.set $l15
          (i32.add
            (local.get $l15)
            (i32.const 16)))
        (br_if $L54
          (i32.ne
            (local.tee $l8
              (i32.add
                (local.get $l16)
                (i32.const -3)))
            (local.get $p2))))))
  (func $vertical_column (type $t8) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32)
    (local $l13 f32) (local $l14 f32) (local $l15 f32) (local $l16 f32) (local $l17 f64) (local $l18 f64) (local $l19 f64) (local $l20 f64) (local $l21 i64) (local $l22 f64) (local $l23 f32) (local $l24 f64) (local $l25 f32)
    (local.set $l13
      (f32.const 0x0p+0 (;=0;)))
    (local.set $l14
      (f32.const 0x0p+0 (;=0;)))
    (block $B0
      (br_if $B0
        (i32.lt_s
          (local.get $p9)
          (i32.const 0)))
      (local.set $l14
        (f32.load
          (i32.add
            (i32.add
              (local.get $p0)
              (i32.shl
                (local.get $p9)
                (i32.const 2)))
            (i32.shl
              (local.get $p8)
              (i32.const 2))))))
    (block $B1
      (br_if $B1
        (i32.lt_s
          (local.get $p10)
          (i32.const 0)))
      (local.set $l13
        (f32.load
          (i32.add
            (i32.add
              (local.get $p0)
              (i32.shl
                (local.get $p10)
                (i32.const 2)))
            (i32.shl
              (local.get $p8)
              (i32.const 2))))))
    (local.set $l14
      (f32.add
        (local.get $l14)
        (local.get $l13)))
    (local.set $l15
      (f32.load
        (local.get $p12)))
    (block $B2
      (br_if $B2
        (f64.eq
          (local.tee $l19
            (f64.add
              (local.tee $l17
                (f64.mul
                  (f64.promote_f32
                    (f32.neg
                      (f32.load offset=12
                        (local.get $p12))))
                  (f64.promote_f32
                    (local.tee $l16
                      (f32.load
                        (local.tee $p10
                          (i32.add
                            (local.get $p1)
                            (local.tee $p9
                              (i32.shl
                                (local.get $p8)
                                (i32.const 2))))))))))
              (local.tee $l18
                (f64.promote_f32
                  (f32.neg
                    (f32.load
                      (local.tee $p0
                        (i32.add
                          (local.get $p2)
                          (local.get $p9)))))))))
          (local.tee $l20
            (f64.promote_f32
              (local.tee $l13
                (f32.demote_f64
                  (local.get $l19)))))))
      (block $B3
        (br_if $B3
          (i64.eq
            (i64.and
              (local.tee $l21
                (i64.reinterpret_f64
                  (local.get $l19)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B2
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l21)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B2
        (i64.gt_u
          (i64.shl
            (local.get $l21)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B2
        (f64.eq
          (local.tee $l17
            (f64.add
              (f64.sub
                (local.get $l18)
                (local.tee $l22
                  (f64.sub
                    (local.get $l19)
                    (local.get $l17))))
              (f64.sub
                (local.get $l17)
                (f64.sub
                  (local.get $l19)
                  (local.get $l22)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B4
        (br_if $B4
          (i32.lt_u
            (i32.shl
              (local.tee $p9
                (i32.reinterpret_f32
                  (local.get $l13)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l13
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l13
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $l13)
                    (f64.gt
                      (local.get $l17)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $l13)
                  (f64.eq
                    (local.get $l19)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l17)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l13)
            (f64.eq
              (local.get $l19)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B2))
      (br_if $B2
        (f64.le
          (f64.mul
            (local.get $l17)
            (f64.convert_i32_s
              (local.tee $p2
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $p1
                    (f64.gt
                      (local.get $l19)
                      (local.get $l20)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B5
        (block $B6
          (br_if $B6
            (f32.ne
              (local.get $l13)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $l23
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $p1)))
          (br $B5))
        (local.set $l23
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $p2)
                (i32.sub
                  (i32.const 0)
                  (local.get $p2))
                (f64.gt
                  (local.get $l19)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $p9)))))
      (local.set $l13
        (select
          (local.get $l23)
          (local.get $l13)
          (f64.eq
            (local.get $l19)
            (f64.mul
              (f64.add
                (local.get $l20)
                (f64.promote_f32
                  (local.get $l23)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B7
      (br_if $B7
        (f64.eq
          (local.tee $l17
            (f64.add
              (local.tee $l18
                (f64.mul
                  (f64.promote_f32
                    (local.get $l15))
                  (local.tee $l19
                    (f64.promote_f32
                      (local.get $l14)))))
              (local.tee $l20
                (f64.promote_f32
                  (local.get $l13)))))
          (local.tee $l22
            (f64.promote_f32
              (local.tee $l13
                (f32.demote_f64
                  (local.get $l17)))))))
      (block $B8
        (br_if $B8
          (i64.eq
            (i64.and
              (local.tee $l21
                (i64.reinterpret_f64
                  (local.get $l17)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B7
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l21)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B7
        (i64.gt_u
          (i64.shl
            (local.get $l21)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B7
        (f64.eq
          (local.tee $l18
            (f64.add
              (f64.sub
                (local.get $l20)
                (local.tee $l24
                  (f64.sub
                    (local.get $l17)
                    (local.get $l18))))
              (f64.sub
                (local.get $l18)
                (f64.sub
                  (local.get $l17)
                  (local.get $l24)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B9
        (br_if $B9
          (i32.lt_u
            (i32.shl
              (local.tee $p9
                (i32.reinterpret_f32
                  (local.get $l13)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l13
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l13
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $l13)
                    (f64.gt
                      (local.get $l18)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $l13)
                  (f64.eq
                    (local.get $l17)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l18)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l13)
            (f64.eq
              (local.get $l17)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B7))
      (br_if $B7
        (f64.le
          (f64.mul
            (local.get $l18)
            (f64.convert_i32_s
              (local.tee $p2
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $p1
                    (f64.gt
                      (local.get $l17)
                      (local.get $l22)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B10
        (block $B11
          (br_if $B11
            (f32.ne
              (local.get $l13)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $l14
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $p1)))
          (br $B10))
        (local.set $l14
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $p2)
                (i32.sub
                  (i32.const 0)
                  (local.get $p2))
                (f64.gt
                  (local.get $l17)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $p9)))))
      (local.set $l13
        (select
          (local.get $l14)
          (local.get $l13)
          (f64.eq
            (local.get $l17)
            (f64.mul
              (f64.add
                (local.get $l22)
                (f64.promote_f32
                  (local.get $l14)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (local.set $l15
      (f32.load offset=4
        (local.get $p12)))
    (block $B12
      (br_if $B12
        (f64.eq
          (local.tee $l17
            (f64.add
              (local.tee $l18
                (f64.mul
                  (f64.promote_f32
                    (f32.neg
                      (f32.load offset=16
                        (local.get $p12))))
                  (f64.promote_f32
                    (f32.load
                      (local.tee $p9
                        (i32.add
                          (local.get $p3)
                          (local.tee $p2
                            (i32.shl
                              (local.get $p8)
                              (i32.const 2)))))))))
              (local.tee $l20
                (f64.promote_f32
                  (f32.neg
                    (f32.load
                      (local.tee $p4
                        (i32.add
                          (local.get $p4)
                          (local.get $p2)))))))))
          (local.tee $l22
            (f64.promote_f32
              (local.tee $l14
                (f32.demote_f64
                  (local.get $l17)))))))
      (block $B13
        (br_if $B13
          (i64.eq
            (i64.and
              (local.tee $l21
                (i64.reinterpret_f64
                  (local.get $l17)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B12
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l21)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B12
        (i64.gt_u
          (i64.shl
            (local.get $l21)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B12
        (f64.eq
          (local.tee $l18
            (f64.add
              (f64.sub
                (local.get $l20)
                (local.tee $l24
                  (f64.sub
                    (local.get $l17)
                    (local.get $l18))))
              (f64.sub
                (local.get $l18)
                (f64.sub
                  (local.get $l17)
                  (local.get $l24)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B14
        (br_if $B14
          (i32.lt_u
            (i32.shl
              (local.tee $p3
                (i32.reinterpret_f32
                  (local.get $l14)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l14
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l14
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $l14)
                    (f64.gt
                      (local.get $l18)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $l14)
                  (f64.eq
                    (local.get $l17)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l18)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l14)
            (f64.eq
              (local.get $l17)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B12))
      (br_if $B12
        (f64.le
          (f64.mul
            (local.get $l18)
            (f64.convert_i32_s
              (local.tee $p2
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $p1
                    (f64.gt
                      (local.get $l17)
                      (local.get $l22)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B15
        (block $B16
          (br_if $B16
            (f32.ne
              (local.get $l14)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $l23
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $p1)))
          (br $B15))
        (local.set $l23
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $p2)
                (i32.sub
                  (i32.const 0)
                  (local.get $p2))
                (f64.gt
                  (local.get $l17)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $p3)))))
      (local.set $l14
        (select
          (local.get $l23)
          (local.get $l14)
          (f64.eq
            (local.get $l17)
            (f64.mul
              (f64.add
                (local.get $l22)
                (f64.promote_f32
                  (local.get $l23)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B17
      (br_if $B17
        (f64.eq
          (local.tee $l17
            (f64.add
              (local.tee $l18
                (f64.mul
                  (local.get $l19)
                  (f64.promote_f32
                    (local.get $l15))))
              (local.tee $l20
                (f64.promote_f32
                  (local.get $l14)))))
          (local.tee $l22
            (f64.promote_f32
              (local.tee $l14
                (f32.demote_f64
                  (local.get $l17)))))))
      (block $B18
        (br_if $B18
          (i64.eq
            (i64.and
              (local.tee $l21
                (i64.reinterpret_f64
                  (local.get $l17)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B17
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l21)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B17
        (i64.gt_u
          (i64.shl
            (local.get $l21)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B17
        (f64.eq
          (local.tee $l18
            (f64.add
              (f64.sub
                (local.get $l20)
                (local.tee $l24
                  (f64.sub
                    (local.get $l17)
                    (local.get $l18))))
              (f64.sub
                (local.get $l18)
                (f64.sub
                  (local.get $l17)
                  (local.get $l24)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B19
        (br_if $B19
          (i32.lt_u
            (i32.shl
              (local.tee $p3
                (i32.reinterpret_f32
                  (local.get $l14)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l14
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l14
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $l14)
                    (f64.gt
                      (local.get $l18)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $l14)
                  (f64.eq
                    (local.get $l17)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l18)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l14)
            (f64.eq
              (local.get $l17)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B17))
      (br_if $B17
        (f64.le
          (f64.mul
            (local.get $l18)
            (f64.convert_i32_s
              (local.tee $p2
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $p1
                    (f64.gt
                      (local.get $l17)
                      (local.get $l22)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B20
        (block $B21
          (br_if $B21
            (f32.ne
              (local.get $l14)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $l15
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $p1)))
          (br $B20))
        (local.set $l15
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $p2)
                (i32.sub
                  (i32.const 0)
                  (local.get $p2))
                (f64.gt
                  (local.get $l17)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $p3)))))
      (local.set $l14
        (select
          (local.get $l15)
          (local.get $l14)
          (f64.eq
            (local.get $l17)
            (f64.mul
              (f64.add
                (local.get $l22)
                (f64.promote_f32
                  (local.get $l15)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (local.set $l23
      (f32.load offset=8
        (local.get $p12)))
    (block $B22
      (br_if $B22
        (f64.eq
          (local.tee $l17
            (f64.add
              (local.tee $l18
                (f64.mul
                  (f64.promote_f32
                    (f32.neg
                      (f32.load offset=20
                        (local.get $p12))))
                  (f64.promote_f32
                    (f32.load
                      (local.tee $p12
                        (i32.add
                          (local.get $p5)
                          (local.tee $p3
                            (i32.shl
                              (local.get $p8)
                              (i32.const 2)))))))))
              (local.tee $l20
                (f64.promote_f32
                  (f32.neg
                    (f32.load
                      (local.tee $p6
                        (i32.add
                          (local.get $p6)
                          (local.get $p3)))))))))
          (local.tee $l22
            (f64.promote_f32
              (local.tee $l15
                (f32.demote_f64
                  (local.get $l17)))))))
      (block $B23
        (br_if $B23
          (i64.eq
            (i64.and
              (local.tee $l21
                (i64.reinterpret_f64
                  (local.get $l17)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B22
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l21)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B22
        (i64.gt_u
          (i64.shl
            (local.get $l21)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B22
        (f64.eq
          (local.tee $l18
            (f64.add
              (f64.sub
                (local.get $l20)
                (local.tee $l24
                  (f64.sub
                    (local.get $l17)
                    (local.get $l18))))
              (f64.sub
                (local.get $l18)
                (f64.sub
                  (local.get $l17)
                  (local.get $l24)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B24
        (br_if $B24
          (i32.lt_u
            (i32.shl
              (local.tee $p5
                (i32.reinterpret_f32
                  (local.get $l15)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l15
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l15
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $l15)
                    (f64.gt
                      (local.get $l18)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $l15)
                  (f64.eq
                    (local.get $l17)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l18)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l15)
            (f64.eq
              (local.get $l17)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B22))
      (br_if $B22
        (f64.le
          (f64.mul
            (local.get $l18)
            (f64.convert_i32_s
              (local.tee $p3
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $p2
                    (f64.gt
                      (local.get $l17)
                      (local.get $l22)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B25
        (block $B26
          (br_if $B26
            (f32.ne
              (local.get $l15)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $l25
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $p2)))
          (br $B25))
        (local.set $l25
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $p3)
                (i32.sub
                  (i32.const 0)
                  (local.get $p3))
                (f64.gt
                  (local.get $l17)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $p5)))))
      (local.set $l15
        (select
          (local.get $l25)
          (local.get $l15)
          (f64.eq
            (local.get $l17)
            (f64.mul
              (f64.add
                (local.get $l22)
                (f64.promote_f32
                  (local.get $l25)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B27
      (br_if $B27
        (f64.eq
          (local.tee $l19
            (f64.add
              (local.tee $l17
                (f64.mul
                  (local.get $l19)
                  (f64.promote_f32
                    (local.get $l23))))
              (local.tee $l18
                (f64.promote_f32
                  (local.get $l15)))))
          (local.tee $l20
            (f64.promote_f32
              (local.tee $l15
                (f32.demote_f64
                  (local.get $l19)))))))
      (block $B28
        (br_if $B28
          (i64.eq
            (i64.and
              (local.tee $l21
                (i64.reinterpret_f64
                  (local.get $l19)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B27
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l21)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B27
        (i64.gt_u
          (i64.shl
            (local.get $l21)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B27
        (f64.eq
          (local.tee $l17
            (f64.add
              (f64.sub
                (local.get $l18)
                (local.tee $l22
                  (f64.sub
                    (local.get $l19)
                    (local.get $l17))))
              (f64.sub
                (local.get $l17)
                (f64.sub
                  (local.get $l19)
                  (local.get $l22)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B29
        (br_if $B29
          (i32.lt_u
            (i32.shl
              (local.tee $p5
                (i32.reinterpret_f32
                  (local.get $l15)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l15
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l15
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $l15)
                    (f64.gt
                      (local.get $l17)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $l15)
                  (f64.eq
                    (local.get $l19)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l17)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l15)
            (f64.eq
              (local.get $l19)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B27))
      (br_if $B27
        (f64.le
          (f64.mul
            (local.get $l17)
            (f64.convert_i32_s
              (local.tee $p3
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $p2
                    (f64.gt
                      (local.get $l19)
                      (local.get $l20)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B30
        (block $B31
          (br_if $B31
            (f32.ne
              (local.get $l15)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $l23
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $p2)))
          (br $B30))
        (local.set $l23
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $p3)
                (i32.sub
                  (i32.const 0)
                  (local.get $p3))
                (f64.gt
                  (local.get $l19)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $p5)))))
      (local.set $l15
        (select
          (local.get $l23)
          (local.get $l15)
          (f64.eq
            (local.get $l19)
            (f64.mul
              (f64.add
                (local.get $l20)
                (f64.promote_f32
                  (local.get $l23)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B32
      (br_if $B32
        (i32.eqz
          (local.get $p11)))
      (f32.store
        (i32.add
          (local.get $p7)
          (i32.shl
            (local.get $p8)
            (i32.const 2)))
        (f32.add
          (local.get $l13)
          (f32.add
            (local.get $l14)
            (local.get $l15))))
      (local.set $l16
        (f32.load
          (local.get $p10))))
    (f32.store
      (local.get $p0)
      (local.get $l16))
    (f32.store
      (local.get $p10)
      (local.get $l13))
    (f32.store
      (local.get $p4)
      (f32.load
        (local.get $p9)))
    (f32.store
      (local.get $p9)
      (local.get $l14))
    (f32.store
      (local.get $p6)
      (f32.load
        (local.get $p12)))
    (f32.store
      (local.get $p12)
      (local.get $l15)))
  (func $s2_metric_band (type $t9) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (result i32)
    (call $metric_scale_rows
      (local.get $p0)
      (local.get $p1)
      (i32.const 7)
      (local.get $p6)
      (local.get $p7)
      (local.get $p8)
      (local.get $p9)
      (local.get $p10)
      (local.get $p11)
      (i32.const 0)
      (i32.const 0)
      (i32.const 0)
      (i32.const 0)
      (local.get $p12)
      (i32.const 0)
      (i32.const 0)
      (local.get $p13)
      (local.get $p14)
      (local.get $p15)
      (local.get $p2)
      (local.get $p3)
      (local.get $p4)
      (local.get $p5)
      (local.get $p4)
      (i32.const 0)
      (i32.const 0)
      (i32.const 0)
      (i32.const 0)))
  (func $s2_metric_band2 (type $t10) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (param $p16 i32) (param $p17 i32) (param $p18 i32) (param $p19 i32) (result i32)
    (call $metric_scale_rows
      (local.get $p0)
      (local.get $p1)
      (i32.const 7)
      (local.get $p6)
      (local.get $p7)
      (local.get $p8)
      (local.get $p9)
      (local.get $p12)
      (local.get $p13)
      (i32.const 0)
      (i32.const 0)
      (i32.const 0)
      (i32.const 0)
      (local.get $p14)
      (i32.const 0)
      (i32.const 0)
      (local.get $p15)
      (local.get $p18)
      (local.get $p19)
      (local.get $p2)
      (local.get $p3)
      (local.get $p4)
      (local.get $p5)
      (local.get $p4)
      (local.get $p10)
      (local.get $p11)
      (local.get $p16)
      (local.get $p17)))
  (func $cube_root_bias4 (type $t11) (param $p0 v128) (param $p1 i32) (result v128)
    (local $l2 v128) (local $l3 v128) (local $l4 v128) (local $l5 v128) (local $l6 v128) (local $l7 v128) (local $l8 v128) (local $l9 v128) (local $l10 v128) (local $l11 v128) (local $l12 v128) (local $l13 v128) (local $l14 v128) (local $l15 v128)
    (local.set $l12
      (i32x4.max_s
        (v128.load offset=16
          (local.get $p1))
        (local.tee $l5
          (v128.and
            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
              (local.tee $l9
                (f64x2.add
                  (f64x2.mul
                    (local.tee $l3
                      (f64x2.promote_low_f32x4
                        (local.tee $l2
                          (f32x4.mul
                            (local.get $p0)
                            (v128.const i32x4 0xbeaaaaab 0xbeaaaaab 0xbeaaaaab 0xbeaaaaab)))))
                    (f64x2.promote_low_f32x4
                      (local.tee $l6
                        (f32x4.mul
                          (local.tee $l5
                            (f32x4.mul
                              (local.tee $l4
                                (v128.and
                                  (i32x4.ne
                                    (local.get $p0)
                                    (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                                  (i32x4.add
                                    (i32x4.mul
                                      (i32x4.shr_u
                                        (local.get $p0)
                                        (i32.const 23))
                                      (v128.const i32x4 0xffd55556 0xffd55556 0xffd55556 0xffd55556))
                                    (v128.const i32x4 0x54800000 0x54800000 0x54800000 0x54800000))))
                              (local.get $l4)))
                          (local.get $l5)))))
                  (f64x2.promote_low_f32x4
                    (local.tee $l8
                      (f32x4.mul
                        (local.get $l4)
                        (local.tee $l7
                          (v128.const i32x4 0x3faaaaab 0x3faaaaab 0x3faaaaab 0x3faaaaab)))))))
              (local.tee $l11
                (f64x2.add
                  (f64x2.mul
                    (local.tee $l10
                      (f64x2.promote_low_f32x4
                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                          (local.get $l2)
                          (local.get $l2))))
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $l6)
                        (local.get $l6))))
                  (f64x2.promote_low_f32x4
                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                      (local.get $l8)
                      (local.get $l8))))))
            (local.tee $l4
              (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))))
    (local.set $l13
      (i32x4.min_s
        (v128.load
          (local.get $p1))
        (local.get $l5)))
    (block $B0
      (block $B1
        (br_if $B1
          (v128.any_true
            (i32x4.eq
              (v128.and
                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                  (local.get $l9)
                  (local.get $l11))
                (local.tee $l5
                  (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
              (local.tee $l14
                (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
        (local.set $l6
          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
            (f32x4.demote_f64x2_zero
              (local.get $l9))
            (f32x4.demote_f64x2_zero
              (local.get $l11))))
        (br $B0))
      (local.set $l6
        (call $fma4_tie
          (local.get $l2)
          (local.get $l6)
          (local.get $l8))))
    (local.set $l12
      (i32x4.max_u
        (local.get $l12)
        (local.tee $l15
          (v128.and
            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
              (local.tee $l9
                (f64x2.add
                  (f64x2.mul
                    (local.get $l3)
                    (f64x2.promote_low_f32x4
                      (local.tee $l8
                        (f32x4.mul
                          (local.tee $l8
                            (f32x4.mul
                              (local.get $l6)
                              (local.get $l6)))
                          (local.get $l8)))))
                  (f64x2.promote_low_f32x4
                    (local.tee $l6
                      (f32x4.mul
                        (local.get $l6)
                        (local.get $l7))))))
              (local.tee $l11
                (f64x2.add
                  (f64x2.mul
                    (local.get $l10)
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $l8)
                        (local.get $l8))))
                  (f64x2.promote_low_f32x4
                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                      (local.get $l6)
                      (local.get $l6))))))
            (local.get $l4)))))
    (local.set $l13
      (i32x4.min_s
        (local.get $l13)
        (local.get $l15)))
    (block $B2
      (block $B3
        (br_if $B3
          (v128.any_true
            (i32x4.eq
              (v128.and
                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                  (local.get $l9)
                  (local.get $l11))
                (local.get $l5))
              (local.get $l14))))
        (local.set $l6
          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
            (f32x4.demote_f64x2_zero
              (local.get $l9))
            (f32x4.demote_f64x2_zero
              (local.get $l11))))
        (br $B2))
      (local.set $l6
        (call $fma4_tie
          (local.get $l2)
          (local.get $l8)
          (local.get $l6))))
    (local.set $l11
      (i32x4.max_u
        (local.get $l12)
        (local.tee $l10
          (v128.and
            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
              (local.tee $l3
                (f64x2.add
                  (f64x2.mul
                    (local.get $l3)
                    (f64x2.promote_low_f32x4
                      (local.tee $l8
                        (f32x4.mul
                          (local.tee $l8
                            (f32x4.mul
                              (local.get $l6)
                              (local.get $l6)))
                          (local.get $l8)))))
                  (f64x2.promote_low_f32x4
                    (local.tee $l6
                      (f32x4.mul
                        (local.get $l6)
                        (local.get $l7))))))
              (local.tee $l7
                (f64x2.add
                  (f64x2.mul
                    (local.get $l10)
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $l8)
                        (local.get $l8))))
                  (f64x2.promote_low_f32x4
                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                      (local.get $l6)
                      (local.get $l6))))))
            (local.get $l4)))))
    (local.set $l13
      (i32x4.min_s
        (local.get $l13)
        (local.get $l10)))
    (block $B4
      (block $B5
        (br_if $B5
          (v128.any_true
            (i32x4.eq
              (v128.and
                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                  (local.get $l3)
                  (local.get $l7))
                (local.get $l5))
              (local.get $l14))))
        (local.set $l2
          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
            (f32x4.demote_f64x2_zero
              (local.get $l3))
            (f32x4.demote_f64x2_zero
              (local.get $l7))))
        (br $B4))
      (local.set $l2
        (call $fma4_tie
          (local.get $l2)
          (local.get $l8)
          (local.get $l6))))
    (local.set $l12
      (i32x4.max_u
        (local.get $l11)
        (local.tee $l15
          (v128.and
            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
              (local.tee $l3
                (f64x2.add
                  (f64x2.mul
                    (f64x2.promote_low_f32x4
                      (local.tee $l6
                        (f32x4.neg
                          (local.get $p0))))
                    (f64x2.promote_low_f32x4
                      (local.tee $l8
                        (f32x4.mul
                          (local.tee $l8
                            (f32x4.mul
                              (local.get $l2)
                              (local.get $l2)))
                          (local.get $l8)))))
                  (local.tee $l10
                    (f64x2.promote_low_f32x4
                      (local.get $l2)))))
              (local.tee $l7
                (f64x2.add
                  (f64x2.mul
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $l6)
                        (local.get $l6)))
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $l8)
                        (local.get $l8))))
                  (local.tee $l9
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $l2)
                        (local.get $l2)))))))
            (local.get $l4)))))
    (local.set $l11
      (i32x4.min_s
        (local.get $l13)
        (local.get $l15)))
    (block $B6
      (block $B7
        (br_if $B7
          (v128.any_true
            (i32x4.eq
              (v128.and
                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                  (local.get $l3)
                  (local.get $l7))
                (local.get $l5))
              (local.get $l14))))
        (local.set $l6
          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
            (f32x4.demote_f64x2_zero
              (local.get $l3))
            (f32x4.demote_f64x2_zero
              (local.get $l7))))
        (br $B6))
      (local.set $l6
        (call $fma4_tie
          (local.get $l6)
          (local.get $l8)
          (local.get $l2))))
    (local.set $l10
      (i32x4.max_u
        (local.get $l12)
        (local.tee $l7
          (v128.and
            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
              (local.tee $l8
                (f64x2.add
                  (f64x2.mul
                    (f64x2.promote_low_f32x4
                      (local.get $l6))
                    (local.tee $l3
                      (v128.const i32x4 0x60000000 0x3fd55555 0x60000000 0x3fd55555)))
                  (local.get $l10)))
              (local.tee $l3
                (f64x2.add
                  (f64x2.mul
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $l6)
                        (local.get $l6)))
                    (local.get $l3))
                  (local.get $l9))))
            (local.get $l4)))))
    (local.set $l7
      (i32x4.min_s
        (local.get $l11)
        (local.get $l7)))
    (block $B8
      (block $B9
        (br_if $B9
          (v128.any_true
            (i32x4.eq
              (v128.and
                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                  (local.get $l8)
                  (local.get $l3))
                (local.get $l5))
              (local.get $l14))))
        (local.set $l2
          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
            (f32x4.demote_f64x2_zero
              (local.get $l8))
            (f32x4.demote_f64x2_zero
              (local.get $l3))))
        (br $B8))
      (local.set $l2
        (call $fma4_tie
          (v128.const i32x4 0x3eaaaaab 0x3eaaaaab 0x3eaaaaab 0x3eaaaaab)
          (local.get $l6)
          (local.get $l2))))
    (v128.store offset=16
      (local.get $p1)
      (i32x4.max_u
        (local.get $l10)
        (local.tee $l4
          (v128.and
            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
              (local.tee $l6
                (f64x2.add
                  (f64x2.mul
                    (f64x2.promote_low_f32x4
                      (local.get $p0))
                    (f64x2.promote_low_f32x4
                      (local.tee $l2
                        (f32x4.mul
                          (local.get $l2)
                          (local.get $l2)))))
                  (v128.const i32x4 0xa0000000 0xbfc3f64e 0xa0000000 0xbfc3f64e)))
              (local.tee $l8
                (f64x2.add
                  (f64x2.mul
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $p0)
                        (local.get $p0)))
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $l2)
                        (local.get $l2))))
                  (f64x2.promote_low_f32x4
                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                      (local.tee $l8
                        (v128.const i32x4 0xbe1fb275 0xbe1fb275 0xbe1fb275 0xbe1fb275))
                      (local.get $l8))))))
            (local.get $l4)))))
    (v128.store
      (local.get $p1)
      (i32x4.min_s
        (local.get $l7)
        (local.get $l4)))
    (block $B10
      (br_if $B10
        (v128.any_true
          (i32x4.eq
            (v128.and
              (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                (local.get $l6)
                (local.get $l8))
              (local.get $l5))
            (local.get $l14))))
      (return
        (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
          (f32x4.demote_f64x2_zero
            (local.get $l6))
          (f32x4.demote_f64x2_zero
            (local.get $l8)))))
    (call $fma4_tie
      (local.get $l2)
      (local.get $p0)
      (v128.const i32x4 0xbe1fb275 0xbe1fb275 0xbe1fb275 0xbe1fb275)))
  (func $positive (type $t12) (param $p0 f32) (param $p1 f32) (param $p2 f32) (param $p3 i32)
    (local $l4 f64) (local $l5 f64) (local $l6 f64) (local $l7 f32) (local $l8 f64) (local $l9 i32) (local $l10 i64) (local $l11 f64) (local $l12 i32) (local $l13 i32) (local $l14 i32) (local $l15 f64) (local $l16 f64) (local $l17 f64) (local $l18 f64) (local $l19 f64) (local $l20 f64) (local $l21 v128)
    (local.set $l7
      (local.tee $p2
        (f32.demote_f64
          (local.tee $l6
            (f64.add
              (local.tee $l5
                (f64.mul
                  (local.tee $l4
                    (f64.promote_f32
                      (local.get $p2)))
                  (f64.const 0x1.3f7ceep-4 (;=0.078;))))
              (f64.const 0x1.f12a6cp-9 (;=0.00379307;)))))))
    (block $B0
      (br_if $B0
        (local.tee $l9
          (f64.eq
            (local.get $l6)
            (local.tee $l8
              (f64.promote_f32
                (local.get $p2))))))
      (block $B1
        (br_if $B1
          (i64.eq
            (i64.and
              (local.tee $l10
                (i64.reinterpret_f64
                  (local.get $l6)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (local.set $l7
          (local.get $p2))
        (br_if $B0
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l10)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (local.set $l7
        (local.get $p2))
      (br_if $B0
        (i64.gt_u
          (i64.shl
            (local.get $l10)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (local.set $l7
        (local.get $p2))
      (br_if $B0
        (f64.eq
          (local.tee $l11
            (f64.add
              (f64.sub
                (f64.const 0x1.f12a6cp-9 (;=0.00379307;))
                (local.tee $l11
                  (f64.sub
                    (local.get $l6)
                    (local.get $l5))))
              (f64.sub
                (local.get $l5)
                (f64.sub
                  (local.get $l6)
                  (local.get $l11)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B2
        (br_if $B2
          (i32.lt_u
            (i32.shl
              (local.tee $l12
                (i32.reinterpret_f32
                  (local.get $p2)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l7
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l7
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $p2)
                    (f64.gt
                      (local.get $l11)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $p2)
                  (f64.eq
                    (local.get $l6)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l11)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l7)
            (f64.eq
              (local.get $l6)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B0))
      (local.set $l7
        (local.get $p2))
      (br_if $B0
        (f64.le
          (f64.mul
            (local.get $l11)
            (f64.convert_i32_s
              (local.tee $l14
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l13
                    (f64.gt
                      (local.get $l6)
                      (local.get $l8)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B3
        (block $B4
          (br_if $B4
            (f32.ne
              (local.get $p2)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $l7
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l13)))
          (br $B3))
        (local.set $l7
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l14)
                (i32.sub
                  (i32.const 0)
                  (local.get $l14))
                (f64.gt
                  (local.get $l6)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l12)))))
      (local.set $l7
        (select
          (local.get $l7)
          (local.get $p2)
          (f64.eq
            (local.get $l6)
            (f64.mul
              (f64.add
                (local.get $l8)
                (f64.promote_f32
                  (local.get $l7)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B5
      (br_if $B5
        (f64.eq
          (local.tee $l17
            (f64.add
              (local.tee $l15
                (f64.mul
                  (local.tee $l11
                    (f64.promote_f32
                      (local.get $p1)))
                  (f64.const 0x1.3e76c8p-1 (;=0.622;))))
              (local.tee $l16
                (f64.promote_f32
                  (local.get $l7)))))
          (local.tee $l18
            (f64.promote_f32
              (local.tee $l7
                (f32.demote_f64
                  (local.get $l17)))))))
      (block $B6
        (br_if $B6
          (i64.eq
            (i64.and
              (local.tee $l10
                (i64.reinterpret_f64
                  (local.get $l17)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B5
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l10)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B5
        (i64.gt_u
          (i64.shl
            (local.get $l10)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B5
        (f64.eq
          (local.tee $l15
            (f64.add
              (f64.sub
                (local.get $l16)
                (local.tee $l19
                  (f64.sub
                    (local.get $l17)
                    (local.get $l15))))
              (f64.sub
                (local.get $l15)
                (f64.sub
                  (local.get $l17)
                  (local.get $l19)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B7
        (br_if $B7
          (i32.lt_u
            (i32.shl
              (local.tee $l12
                (i32.reinterpret_f32
                  (local.get $l7)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l7
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l7
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $l7)
                    (f64.gt
                      (local.get $l15)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $l7)
                  (f64.eq
                    (local.get $l17)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l15)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l7)
            (f64.eq
              (local.get $l17)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B5))
      (br_if $B5
        (f64.le
          (f64.mul
            (local.get $l15)
            (f64.convert_i32_s
              (local.tee $l14
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l13
                    (f64.gt
                      (local.get $l17)
                      (local.get $l18)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B8
        (block $B9
          (br_if $B9
            (f32.ne
              (local.get $l7)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $p1
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l13)))
          (br $B8))
        (local.set $p1
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l14)
                (i32.sub
                  (i32.const 0)
                  (local.get $l14))
                (f64.gt
                  (local.get $l17)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l12)))))
      (local.set $l7
        (select
          (local.get $p1)
          (local.get $l7)
          (f64.eq
            (local.get $l17)
            (f64.mul
              (f64.add
                (local.get $l18)
                (f64.promote_f32
                  (local.get $p1)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B10
      (br_if $B10
        (f64.eq
          (local.tee $l15
            (f64.add
              (local.tee $l16
                (f64.mul
                  (local.tee $l17
                    (f64.promote_f32
                      (local.get $p0)))
                  (f64.const 0x1.333334p-2 (;=0.3;))))
              (local.tee $l18
                (f64.promote_f32
                  (local.get $l7)))))
          (local.tee $l19
            (f64.promote_f32
              (local.tee $l7
                (f32.demote_f64
                  (local.get $l15)))))))
      (block $B11
        (br_if $B11
          (i64.eq
            (i64.and
              (local.tee $l10
                (i64.reinterpret_f64
                  (local.get $l15)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B10
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l10)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B10
        (i64.gt_u
          (i64.shl
            (local.get $l10)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B10
        (f64.eq
          (local.tee $l16
            (f64.add
              (f64.sub
                (local.get $l18)
                (local.tee $l20
                  (f64.sub
                    (local.get $l15)
                    (local.get $l16))))
              (f64.sub
                (local.get $l16)
                (f64.sub
                  (local.get $l15)
                  (local.get $l20)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B12
        (br_if $B12
          (i32.lt_u
            (i32.shl
              (local.tee $l12
                (i32.reinterpret_f32
                  (local.get $l7)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l7
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l7
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $l7)
                    (f64.gt
                      (local.get $l16)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $l7)
                  (f64.eq
                    (local.get $l15)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l16)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l7)
            (f64.eq
              (local.get $l15)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B10))
      (br_if $B10
        (f64.le
          (f64.mul
            (local.get $l16)
            (f64.convert_i32_s
              (local.tee $l14
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l13
                    (f64.gt
                      (local.get $l15)
                      (local.get $l19)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B13
        (block $B14
          (br_if $B14
            (f32.ne
              (local.get $l7)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $p1
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l13)))
          (br $B13))
        (local.set $p1
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l14)
                (i32.sub
                  (i32.const 0)
                  (local.get $l14))
                (f64.gt
                  (local.get $l15)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l12)))))
      (local.set $l7
        (select
          (local.get $p1)
          (local.get $l7)
          (f64.eq
            (local.get $l15)
            (f64.mul
              (f64.add
                (local.get $l19)
                (f64.promote_f32
                  (local.get $p1)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B15
      (br_if $B15
        (local.get $l9))
      (block $B16
        (br_if $B16
          (i64.eq
            (i64.and
              (local.tee $l10
                (i64.reinterpret_f64
                  (local.get $l6)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B15
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l10)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B15
        (i64.gt_u
          (i64.shl
            (local.get $l10)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B15
        (f64.eq
          (local.tee $l15
            (f64.add
              (f64.sub
                (f64.const 0x1.f12a6cp-9 (;=0.00379307;))
                (local.tee $l15
                  (f64.sub
                    (local.get $l6)
                    (local.get $l5))))
              (f64.sub
                (local.get $l5)
                (f64.sub
                  (local.get $l6)
                  (local.get $l15)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B17
        (br_if $B17
          (i32.lt_u
            (i32.shl
              (local.tee $l9
                (i32.reinterpret_f32
                  (local.get $p2)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $p2
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $p2
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $p2)
                    (f64.gt
                      (local.get $l15)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $p2)
                  (f64.eq
                    (local.get $l6)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l15)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $p2)
            (f64.eq
              (local.get $l6)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B15))
      (br_if $B15
        (f64.le
          (f64.mul
            (local.get $l15)
            (f64.convert_i32_s
              (local.tee $l12
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l14
                    (f64.gt
                      (local.get $l6)
                      (local.get $l8)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B18
        (block $B19
          (br_if $B19
            (f32.ne
              (local.get $p2)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $p1
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l14)))
          (br $B18))
        (local.set $p1
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l12)
                (i32.sub
                  (i32.const 0)
                  (local.get $l12))
                (f64.gt
                  (local.get $l6)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l9)))))
      (local.set $p2
        (select
          (local.get $p1)
          (local.get $p2)
          (f64.eq
            (local.get $l6)
            (f64.mul
              (f64.add
                (local.get $l8)
                (f64.promote_f32
                  (local.get $p1)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B20
      (br_if $B20
        (f64.eq
          (local.tee $l6
            (f64.add
              (local.tee $l15
                (f64.mul
                  (local.get $l11)
                  (f64.const 0x1.624dd2p-1 (;=0.692;))))
              (local.tee $l5
                (f64.promote_f32
                  (local.get $p2)))))
          (local.tee $l16
            (f64.promote_f32
              (local.tee $p2
                (f32.demote_f64
                  (local.get $l6)))))))
      (block $B21
        (br_if $B21
          (i64.eq
            (i64.and
              (local.tee $l10
                (i64.reinterpret_f64
                  (local.get $l6)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B20
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l10)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B20
        (i64.gt_u
          (i64.shl
            (local.get $l10)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B20
        (f64.eq
          (local.tee $l15
            (f64.add
              (f64.sub
                (local.get $l5)
                (local.tee $l8
                  (f64.sub
                    (local.get $l6)
                    (local.get $l15))))
              (f64.sub
                (local.get $l15)
                (f64.sub
                  (local.get $l6)
                  (local.get $l8)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B22
        (br_if $B22
          (i32.lt_u
            (i32.shl
              (local.tee $l9
                (i32.reinterpret_f32
                  (local.get $p2)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $p2
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $p2
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $p2)
                    (f64.gt
                      (local.get $l15)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $p2)
                  (f64.eq
                    (local.get $l6)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l15)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $p2)
            (f64.eq
              (local.get $l6)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B20))
      (br_if $B20
        (f64.le
          (f64.mul
            (local.get $l15)
            (f64.convert_i32_s
              (local.tee $l12
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l14
                    (f64.gt
                      (local.get $l6)
                      (local.get $l16)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B23
        (block $B24
          (br_if $B24
            (f32.ne
              (local.get $p2)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $p1
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l14)))
          (br $B23))
        (local.set $p1
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l12)
                (i32.sub
                  (i32.const 0)
                  (local.get $l12))
                (f64.gt
                  (local.get $l6)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l9)))))
      (local.set $p2
        (select
          (local.get $p1)
          (local.get $p2)
          (f64.eq
            (local.get $l6)
            (f64.mul
              (f64.add
                (local.get $l16)
                (f64.promote_f32
                  (local.get $p1)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B25
      (br_if $B25
        (f64.eq
          (local.tee $l6
            (f64.add
              (local.tee $l15
                (f64.mul
                  (local.get $l17)
                  (f64.const 0x1.d70a3ep-3 (;=0.23;))))
              (local.tee $l5
                (f64.promote_f32
                  (local.get $p2)))))
          (local.tee $l16
            (f64.promote_f32
              (local.tee $p2
                (f32.demote_f64
                  (local.get $l6)))))))
      (block $B26
        (br_if $B26
          (i64.eq
            (i64.and
              (local.tee $l10
                (i64.reinterpret_f64
                  (local.get $l6)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B25
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l10)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B25
        (i64.gt_u
          (i64.shl
            (local.get $l10)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B25
        (f64.eq
          (local.tee $l15
            (f64.add
              (f64.sub
                (local.get $l5)
                (local.tee $l8
                  (f64.sub
                    (local.get $l6)
                    (local.get $l15))))
              (f64.sub
                (local.get $l15)
                (f64.sub
                  (local.get $l6)
                  (local.get $l8)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B27
        (br_if $B27
          (i32.lt_u
            (i32.shl
              (local.tee $l9
                (i32.reinterpret_f32
                  (local.get $p2)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $p2
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $p2
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $p2)
                    (f64.gt
                      (local.get $l15)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $p2)
                  (f64.eq
                    (local.get $l6)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l15)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $p2)
            (f64.eq
              (local.get $l6)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B25))
      (br_if $B25
        (f64.le
          (f64.mul
            (local.get $l15)
            (f64.convert_i32_s
              (local.tee $l12
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l14
                    (f64.gt
                      (local.get $l6)
                      (local.get $l16)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B28
        (block $B29
          (br_if $B29
            (f32.ne
              (local.get $p2)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $p1
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l14)))
          (br $B28))
        (local.set $p1
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l12)
                (i32.sub
                  (i32.const 0)
                  (local.get $l12))
                (f64.gt
                  (local.get $l6)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l9)))))
      (local.set $p2
        (select
          (local.get $p1)
          (local.get $p2)
          (f64.eq
            (local.get $l6)
            (f64.mul
              (f64.add
                (local.get $l16)
                (f64.promote_f32
                  (local.get $p1)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B30
      (br_if $B30
        (f64.eq
          (local.tee $l6
            (f64.add
              (local.tee $l15
                (f64.mul
                  (local.get $l4)
                  (f64.const 0x1.1a86d2p-1 (;=0.55181;))))
              (f64.const 0x1.f12a6cp-9 (;=0.00379307;))))
          (local.tee $l4
            (f64.promote_f32
              (local.tee $p1
                (f32.demote_f64
                  (local.get $l6)))))))
      (block $B31
        (br_if $B31
          (i64.eq
            (i64.and
              (local.tee $l10
                (i64.reinterpret_f64
                  (local.get $l6)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B30
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l10)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B30
        (i64.gt_u
          (i64.shl
            (local.get $l10)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B30
        (f64.eq
          (local.tee $l15
            (f64.add
              (f64.sub
                (f64.const 0x1.f12a6cp-9 (;=0.00379307;))
                (local.tee $l5
                  (f64.sub
                    (local.get $l6)
                    (local.get $l15))))
              (f64.sub
                (local.get $l15)
                (f64.sub
                  (local.get $l6)
                  (local.get $l5)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B32
        (br_if $B32
          (i32.lt_u
            (i32.shl
              (local.tee $l9
                (i32.reinterpret_f32
                  (local.get $p1)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $p1
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $p1
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $p1)
                    (f64.gt
                      (local.get $l15)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $p1)
                  (f64.eq
                    (local.get $l6)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l15)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $p1)
            (f64.eq
              (local.get $l6)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B30))
      (br_if $B30
        (f64.le
          (f64.mul
            (local.get $l15)
            (f64.convert_i32_s
              (local.tee $l12
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l14
                    (f64.gt
                      (local.get $l6)
                      (local.get $l4)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B33
        (block $B34
          (br_if $B34
            (f32.ne
              (local.get $p1)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $p0
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l14)))
          (br $B33))
        (local.set $p0
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l12)
                (i32.sub
                  (i32.const 0)
                  (local.get $l12))
                (f64.gt
                  (local.get $l6)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l9)))))
      (local.set $p1
        (select
          (local.get $p0)
          (local.get $p1)
          (f64.eq
            (local.get $l6)
            (f64.mul
              (f64.add
                (local.get $l4)
                (f64.promote_f32
                  (local.get $p0)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B35
      (br_if $B35
        (f64.eq
          (local.tee $l6
            (f64.add
              (local.tee $l11
                (f64.mul
                  (local.get $l11)
                  (f64.const 0x1.a35d1ep-3 (;=0.204767;))))
              (local.tee $l15
                (f64.promote_f32
                  (local.get $p1)))))
          (local.tee $l4
            (f64.promote_f32
              (local.tee $p1
                (f32.demote_f64
                  (local.get $l6)))))))
      (block $B36
        (br_if $B36
          (i64.eq
            (i64.and
              (local.tee $l10
                (i64.reinterpret_f64
                  (local.get $l6)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B35
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l10)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B35
        (i64.gt_u
          (i64.shl
            (local.get $l10)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B35
        (f64.eq
          (local.tee $l11
            (f64.add
              (f64.sub
                (local.get $l15)
                (local.tee $l5
                  (f64.sub
                    (local.get $l6)
                    (local.get $l11))))
              (f64.sub
                (local.get $l11)
                (f64.sub
                  (local.get $l6)
                  (local.get $l5)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B37
        (br_if $B37
          (i32.lt_u
            (i32.shl
              (local.tee $l9
                (i32.reinterpret_f32
                  (local.get $p1)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $p1
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $p1
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $p1)
                    (f64.gt
                      (local.get $l11)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $p1)
                  (f64.eq
                    (local.get $l6)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l11)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $p1)
            (f64.eq
              (local.get $l6)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B35))
      (br_if $B35
        (f64.le
          (f64.mul
            (local.get $l11)
            (f64.convert_i32_s
              (local.tee $l12
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l14
                    (f64.gt
                      (local.get $l6)
                      (local.get $l4)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B38
        (block $B39
          (br_if $B39
            (f32.ne
              (local.get $p1)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $p0
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l14)))
          (br $B38))
        (local.set $p0
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l12)
                (i32.sub
                  (i32.const 0)
                  (local.get $l12))
                (f64.gt
                  (local.get $l6)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l9)))))
      (local.set $p1
        (select
          (local.get $p0)
          (local.get $p1)
          (f64.eq
            (local.get $l6)
            (f64.mul
              (f64.add
                (local.get $l4)
                (f64.promote_f32
                  (local.get $p0)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B40
      (br_if $B40
        (f64.eq
          (local.tee $l6
            (f64.add
              (local.tee $l11
                (f64.mul
                  (local.get $l17)
                  (f64.const 0x1.f28798p-3 (;=0.243423;))))
              (local.tee $l17
                (f64.promote_f32
                  (local.get $p1)))))
          (local.tee $l15
            (f64.promote_f32
              (local.tee $p1
                (f32.demote_f64
                  (local.get $l6)))))))
      (block $B41
        (br_if $B41
          (i64.eq
            (i64.and
              (local.tee $l10
                (i64.reinterpret_f64
                  (local.get $l6)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B40
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l10)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B40
        (i64.gt_u
          (i64.shl
            (local.get $l10)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B40
        (f64.eq
          (local.tee $l11
            (f64.add
              (f64.sub
                (local.get $l17)
                (local.tee $l4
                  (f64.sub
                    (local.get $l6)
                    (local.get $l11))))
              (f64.sub
                (local.get $l11)
                (f64.sub
                  (local.get $l6)
                  (local.get $l4)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B42
        (br_if $B42
          (i32.lt_u
            (i32.shl
              (local.tee $l9
                (i32.reinterpret_f32
                  (local.get $p1)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $p1
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $p1
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $p1)
                    (f64.gt
                      (local.get $l11)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $p1)
                  (f64.eq
                    (local.get $l6)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l11)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $p1)
            (f64.eq
              (local.get $l6)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B40))
      (br_if $B40
        (f64.le
          (f64.mul
            (local.get $l11)
            (f64.convert_i32_s
              (local.tee $l12
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l14
                    (f64.gt
                      (local.get $l6)
                      (local.get $l15)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B43
        (block $B44
          (br_if $B44
            (f32.ne
              (local.get $p1)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $p0
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l14)))
          (br $B43))
        (local.set $p0
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l12)
                (i32.sub
                  (i32.const 0)
                  (local.get $l12))
                (f64.gt
                  (local.get $l6)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l9)))))
      (local.set $p1
        (select
          (local.get $p0)
          (local.get $p1)
          (f64.eq
            (local.get $l6)
            (f64.mul
              (f64.add
                (local.get $l15)
                (f64.promote_f32
                  (local.get $p0)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (v128.store64_lane align=4 0
      (local.get $p3)
      (f32x4.add
        (local.tee $l21
          (f32x4.mul
            (f32x4.replace_lane 1
              (f32x4.splat
                (f32.mul
                  (f32.sub
                    (local.tee $l7
                      (call $cube_root_bias
                        (select
                          (f32.const 0x0p+0 (;=0;))
                          (local.get $l7)
                          (f32.le
                            (local.get $l7)
                            (f32.const 0x0p+0 (;=0;))))))
                    (local.tee $p2
                      (call $cube_root_bias
                        (select
                          (f32.const 0x0p+0 (;=0;))
                          (local.get $p2)
                          (f32.le
                            (local.get $p2)
                            (f32.const 0x0p+0 (;=0;)))))))
                  (f32.const 0x1p-1 (;=0.5;))))
              (f32.add
                (local.get $l7)
                (local.get $p2)))
            (v128.const i32x4 0x41600000 0x3f000000 0x00000000 0x00000000)))
        (v128.const i32x4 0x3ed70a3d 0x3c23d70a 0x00000000 0x00000000)))
    (f32.store offset=8
      (local.get $p3)
      (f32.add
        (f32.sub
          (call $cube_root_bias
            (select
              (f32.const 0x0p+0 (;=0;))
              (local.get $p1)
              (f32.le
                (local.get $p1)
                (f32.const 0x0p+0 (;=0;)))))
          (f32x4.extract_lane 1
            (local.get $l21)))
        (f32.const 0x1.19999ap-1 (;=0.55;)))))
  (func $cube_root_bias (type $t13) (param $p0 f32) (result f32)
    (local $l1 f64) (local $l2 i32) (local $l3 f32) (local $l4 f32) (local $l5 f64) (local $l6 f64) (local $l7 f64) (local $l8 f64) (local $l9 i64) (local $l10 f64) (local $l11 i32) (local $l12 i32)
    (block $B0
      (br_if $B0
        (f64.eq
          (local.tee $l7
            (f64.add
              (local.tee $l5
                (f64.mul
                  (local.tee $l1
                    (f64.promote_f32
                      (f32.mul
                        (local.get $p0)
                        (f32.const -0x1.555556p-2 (;=-0.333333;)))))
                  (f64.promote_f32
                    (f32.mul
                      (local.tee $l4
                        (f32.mul
                          (local.tee $l3
                            (select
                              (f32.reinterpret_i32
                                (i32.add
                                  (i32.mul
                                    (i32.shr_u
                                      (local.tee $l2
                                        (i32.reinterpret_f32
                                          (local.get $p0)))
                                      (i32.const 23))
                                    (i32.const -2796202))
                                  (i32.const 1417674752)))
                              (f32.const 0x0p+0 (;=0;))
                              (local.get $l2)))
                          (local.get $l3)))
                      (local.get $l4)))))
              (local.tee $l6
                (f64.promote_f32
                  (f32.mul
                    (local.get $l3)
                    (f32.const 0x1.555556p+0 (;=1.33333;)))))))
          (local.tee $l8
            (f64.promote_f32
              (local.tee $l3
                (f32.demote_f64
                  (local.get $l7)))))))
      (block $B1
        (br_if $B1
          (i64.eq
            (i64.and
              (local.tee $l9
                (i64.reinterpret_f64
                  (local.get $l7)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B0
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l9)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B0
        (i64.gt_u
          (i64.shl
            (local.get $l9)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B0
        (f64.eq
          (local.tee $l5
            (f64.add
              (f64.sub
                (local.get $l6)
                (local.tee $l10
                  (f64.sub
                    (local.get $l7)
                    (local.get $l5))))
              (f64.sub
                (local.get $l5)
                (f64.sub
                  (local.get $l7)
                  (local.get $l10)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B2
        (br_if $B2
          (i32.lt_u
            (i32.shl
              (local.tee $l2
                (i32.reinterpret_f32
                  (local.get $l3)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l3
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l3
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $l3)
                    (f64.gt
                      (local.get $l5)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $l3)
                  (f64.eq
                    (local.get $l7)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l5)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l3)
            (f64.eq
              (local.get $l7)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B0))
      (br_if $B0
        (f64.le
          (f64.mul
            (local.get $l5)
            (f64.convert_i32_s
              (local.tee $l12
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l11
                    (f64.gt
                      (local.get $l7)
                      (local.get $l8)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B3
        (block $B4
          (br_if $B4
            (f32.ne
              (local.get $l3)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $l4
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l11)))
          (br $B3))
        (local.set $l4
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l12)
                (i32.sub
                  (i32.const 0)
                  (local.get $l12))
                (f64.gt
                  (local.get $l7)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l2)))))
      (local.set $l3
        (select
          (local.get $l4)
          (local.get $l3)
          (f64.eq
            (local.get $l7)
            (f64.mul
              (f64.add
                (local.get $l8)
                (f64.promote_f32
                  (local.get $l4)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B5
      (br_if $B5
        (f64.eq
          (local.tee $l7
            (f64.add
              (local.tee $l5
                (f64.mul
                  (local.get $l1)
                  (f64.promote_f32
                    (f32.mul
                      (local.tee $l4
                        (f32.mul
                          (local.get $l3)
                          (local.get $l3)))
                      (local.get $l4)))))
              (local.tee $l6
                (f64.promote_f32
                  (f32.mul
                    (local.get $l3)
                    (f32.const 0x1.555556p+0 (;=1.33333;)))))))
          (local.tee $l8
            (f64.promote_f32
              (local.tee $l3
                (f32.demote_f64
                  (local.get $l7)))))))
      (block $B6
        (br_if $B6
          (i64.eq
            (i64.and
              (local.tee $l9
                (i64.reinterpret_f64
                  (local.get $l7)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B5
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l9)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B5
        (i64.gt_u
          (i64.shl
            (local.get $l9)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B5
        (f64.eq
          (local.tee $l5
            (f64.add
              (f64.sub
                (local.get $l6)
                (local.tee $l10
                  (f64.sub
                    (local.get $l7)
                    (local.get $l5))))
              (f64.sub
                (local.get $l5)
                (f64.sub
                  (local.get $l7)
                  (local.get $l10)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B7
        (br_if $B7
          (i32.gt_u
            (i32.shl
              (local.tee $l2
                (i32.reinterpret_f32
                  (local.get $l3)))
              (i32.const 1))
            (i32.const -16777217)))
        (br_if $B5
          (f64.le
            (f64.mul
              (local.get $l5)
              (f64.convert_i32_s
                (local.tee $l12
                  (select
                    (i32.const 1)
                    (i32.const -1)
                    (local.tee $l11
                      (f64.gt
                        (local.get $l7)
                        (local.get $l8)))))))
            (f64.const 0x0p+0 (;=0;))))
        (block $B8
          (block $B9
            (br_if $B9
              (f32.eq
                (local.get $l3)
                (f32.const 0x0p+0 (;=0;))))
            (local.set $l4
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l12)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l12))
                    (f64.gt
                      (local.get $l7)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l2))))
            (br $B8))
          (local.set $l4
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l11))))
        (local.set $l3
          (select
            (local.get $l4)
            (local.get $l3)
            (f64.eq
              (local.get $l7)
              (f64.mul
                (f64.add
                  (local.get $l8)
                  (f64.promote_f32
                    (local.get $l4)))
                (f64.const 0x1p-1 (;=0.5;))))))
        (br $B5))
      (local.set $l3
        (select
          (select
            (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
            (local.tee $l3
              (select
                (select
                  (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                  (local.get $l3)
                  (f64.gt
                    (local.get $l5)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l3)
                (f64.eq
                  (local.get $l7)
                  (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
            (f64.lt
              (local.get $l5)
              (f64.const 0x0p+0 (;=0;))))
          (local.get $l3)
          (f64.eq
            (local.get $l7)
            (f64.const 0x1.ffffffp+127 (;=3.40282e+38;))))))
    (block $B10
      (br_if $B10
        (f64.eq
          (local.tee $l1
            (f64.add
              (local.tee $l7
                (f64.mul
                  (local.get $l1)
                  (f64.promote_f32
                    (f32.mul
                      (local.tee $l4
                        (f32.mul
                          (local.get $l3)
                          (local.get $l3)))
                      (local.get $l4)))))
              (local.tee $l5
                (f64.promote_f32
                  (f32.mul
                    (local.get $l3)
                    (f32.const 0x1.555556p+0 (;=1.33333;)))))))
          (local.tee $l6
            (f64.promote_f32
              (local.tee $l3
                (f32.demote_f64
                  (local.get $l1)))))))
      (block $B11
        (br_if $B11
          (i64.eq
            (i64.and
              (local.tee $l9
                (i64.reinterpret_f64
                  (local.get $l1)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B10
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l9)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B10
        (i64.gt_u
          (i64.shl
            (local.get $l9)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B10
        (f64.eq
          (local.tee $l7
            (f64.add
              (f64.sub
                (local.get $l5)
                (local.tee $l8
                  (f64.sub
                    (local.get $l1)
                    (local.get $l7))))
              (f64.sub
                (local.get $l7)
                (f64.sub
                  (local.get $l1)
                  (local.get $l8)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B12
        (br_if $B12
          (i32.gt_u
            (i32.shl
              (local.tee $l2
                (i32.reinterpret_f32
                  (local.get $l3)))
              (i32.const 1))
            (i32.const -16777217)))
        (br_if $B10
          (f64.le
            (f64.mul
              (local.get $l7)
              (f64.convert_i32_s
                (local.tee $l12
                  (select
                    (i32.const 1)
                    (i32.const -1)
                    (local.tee $l11
                      (f64.gt
                        (local.get $l1)
                        (local.get $l6)))))))
            (f64.const 0x0p+0 (;=0;))))
        (block $B13
          (block $B14
            (br_if $B14
              (f32.eq
                (local.get $l3)
                (f32.const 0x0p+0 (;=0;))))
            (local.set $l4
              (f32.reinterpret_i32
                (i32.add
                  (select
                    (local.get $l12)
                    (i32.sub
                      (i32.const 0)
                      (local.get $l12))
                    (f64.gt
                      (local.get $l1)
                      (f64.const 0x1p-150 (;=7.00649e-46;))))
                  (local.get $l2))))
            (br $B13))
          (local.set $l4
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l11))))
        (local.set $l3
          (select
            (local.get $l4)
            (local.get $l3)
            (f64.eq
              (local.get $l1)
              (f64.mul
                (f64.add
                  (local.get $l6)
                  (f64.promote_f32
                    (local.get $l4)))
                (f64.const 0x1p-1 (;=0.5;))))))
        (br $B10))
      (local.set $l3
        (select
          (select
            (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
            (local.tee $l3
              (select
                (select
                  (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                  (local.get $l3)
                  (f64.gt
                    (local.get $l7)
                    (f64.const 0x0p+0 (;=0;))))
                (local.get $l3)
                (f64.eq
                  (local.get $l1)
                  (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
            (f64.lt
              (local.get $l7)
              (f64.const 0x0p+0 (;=0;))))
          (local.get $l3)
          (f64.eq
            (local.get $l1)
            (f64.const 0x1.ffffffp+127 (;=3.40282e+38;))))))
    (block $B15
      (br_if $B15
        (f64.eq
          (local.tee $l1
            (f64.add
              (local.tee $l5
                (f64.mul
                  (f64.promote_f32
                    (f32.neg
                      (local.get $p0)))
                  (f64.promote_f32
                    (f32.mul
                      (local.tee $l4
                        (f32.mul
                          (local.get $l3)
                          (local.get $l3)))
                      (local.get $l4)))))
              (local.tee $l7
                (f64.promote_f32
                  (local.get $l3)))))
          (local.tee $l6
            (f64.promote_f32
              (local.tee $l3
                (f32.demote_f64
                  (local.get $l1)))))))
      (block $B16
        (br_if $B16
          (i64.eq
            (i64.and
              (local.tee $l9
                (i64.reinterpret_f64
                  (local.get $l1)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B15
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l9)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B15
        (i64.gt_u
          (i64.shl
            (local.get $l9)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B15
        (f64.eq
          (local.tee $l5
            (f64.add
              (f64.sub
                (local.get $l7)
                (local.tee $l8
                  (f64.sub
                    (local.get $l1)
                    (local.get $l5))))
              (f64.sub
                (local.get $l5)
                (f64.sub
                  (local.get $l1)
                  (local.get $l8)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B17
        (br_if $B17
          (i32.lt_u
            (i32.shl
              (local.tee $l2
                (i32.reinterpret_f32
                  (local.get $l3)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l3
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l3
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $l3)
                    (f64.gt
                      (local.get $l5)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $l3)
                  (f64.eq
                    (local.get $l1)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l5)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l3)
            (f64.eq
              (local.get $l1)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B15))
      (br_if $B15
        (f64.le
          (f64.mul
            (local.get $l5)
            (f64.convert_i32_s
              (local.tee $l12
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l11
                    (f64.gt
                      (local.get $l1)
                      (local.get $l6)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B18
        (block $B19
          (br_if $B19
            (f32.ne
              (local.get $l3)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $l4
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l11)))
          (br $B18))
        (local.set $l4
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l12)
                (i32.sub
                  (i32.const 0)
                  (local.get $l12))
                (f64.gt
                  (local.get $l1)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l2)))))
      (local.set $l3
        (select
          (local.get $l4)
          (local.get $l3)
          (f64.eq
            (local.get $l1)
            (f64.mul
              (f64.add
                (local.get $l6)
                (f64.promote_f32
                  (local.get $l4)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B20
      (br_if $B20
        (f64.eq
          (local.tee $l1
            (f64.add
              (local.tee $l5
                (f64.mul
                  (f64.promote_f32
                    (local.get $l3))
                  (f64.const 0x1.555556p-2 (;=0.333333;))))
              (local.get $l7)))
          (local.tee $l6
            (f64.promote_f32
              (local.tee $l3
                (f32.demote_f64
                  (local.get $l1)))))))
      (block $B21
        (br_if $B21
          (i64.eq
            (i64.and
              (local.tee $l9
                (i64.reinterpret_f64
                  (local.get $l1)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B20
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l9)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B20
        (i64.gt_u
          (i64.shl
            (local.get $l9)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B20
        (f64.eq
          (local.tee $l7
            (f64.add
              (f64.sub
                (local.get $l7)
                (local.tee $l8
                  (f64.sub
                    (local.get $l1)
                    (local.get $l5))))
              (f64.sub
                (local.get $l5)
                (f64.sub
                  (local.get $l1)
                  (local.get $l8)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B22
        (br_if $B22
          (i32.lt_u
            (i32.shl
              (local.tee $l2
                (i32.reinterpret_f32
                  (local.get $l3)))
              (i32.const 1))
            (i32.const -16777216)))
        (local.set $l3
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $l3
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $l3)
                    (f64.gt
                      (local.get $l7)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $l3)
                  (f64.eq
                    (local.get $l1)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l7)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $l3)
            (f64.eq
              (local.get $l1)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;)))))
        (br $B20))
      (br_if $B20
        (f64.le
          (f64.mul
            (local.get $l7)
            (f64.convert_i32_s
              (local.tee $l12
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l11
                    (f64.gt
                      (local.get $l1)
                      (local.get $l6)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B23
        (block $B24
          (br_if $B24
            (f32.ne
              (local.get $l3)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $l4
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l11)))
          (br $B23))
        (local.set $l4
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l12)
                (i32.sub
                  (i32.const 0)
                  (local.get $l12))
                (f64.gt
                  (local.get $l1)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l2)))))
      (local.set $l3
        (select
          (local.get $l4)
          (local.get $l3)
          (f64.eq
            (local.get $l1)
            (f64.mul
              (f64.add
                (local.get $l6)
                (f64.promote_f32
                  (local.get $l4)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (block $B25
      (br_if $B25
        (f64.eq
          (local.tee $l1
            (f64.add
              (local.tee $l7
                (f64.mul
                  (f64.promote_f32
                    (local.get $p0))
                  (f64.promote_f32
                    (f32.mul
                      (local.get $l3)
                      (local.get $l3)))))
              (f64.const -0x1.3f64eap-3 (;=-0.155954;))))
          (local.tee $l5
            (f64.promote_f32
              (local.tee $p0
                (f32.demote_f64
                  (local.get $l1)))))))
      (block $B26
        (br_if $B26
          (i64.eq
            (i64.and
              (local.tee $l9
                (i64.reinterpret_f64
                  (local.get $l1)))
              (i64.const 536870911))
            (i64.const 268435456)))
        (br_if $B25
          (i32.gt_u
            (i32.add
              (i32.and
                (i32.wrap_i64
                  (i64.shr_u
                    (local.get $l9)
                    (i64.const 52)))
                (i32.const 2047))
              (i32.const -1151))
            (i32.const -255))))
      (br_if $B25
        (i64.gt_u
          (i64.shl
            (local.get $l9)
            (i64.const 1))
          (i64.const -9007199254740993)))
      (br_if $B25
        (f64.eq
          (local.tee $l7
            (f64.add
              (f64.sub
                (f64.const -0x1.3f64eap-3 (;=-0.155954;))
                (local.tee $l6
                  (f64.sub
                    (local.get $l1)
                    (local.get $l7))))
              (f64.sub
                (local.get $l7)
                (f64.sub
                  (local.get $l1)
                  (local.get $l6)))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B27
        (br_if $B27
          (i32.lt_u
            (i32.shl
              (local.tee $l2
                (i32.reinterpret_f32
                  (local.get $p0)))
              (i32.const 1))
            (i32.const -16777216)))
        (return
          (select
            (select
              (f32.const 0x1.fffffep+127 (;=3.40282e+38;))
              (local.tee $p0
                (select
                  (select
                    (f32.const -0x1.fffffep+127 (;=-3.40282e+38;))
                    (local.get $p0)
                    (f64.gt
                      (local.get $l7)
                      (f64.const 0x0p+0 (;=0;))))
                  (local.get $p0)
                  (f64.eq
                    (local.get $l1)
                    (f64.const -0x1.ffffffp+127 (;=-3.40282e+38;)))))
              (f64.lt
                (local.get $l7)
                (f64.const 0x0p+0 (;=0;))))
            (local.get $p0)
            (f64.eq
              (local.get $l1)
              (f64.const 0x1.ffffffp+127 (;=3.40282e+38;))))))
      (br_if $B25
        (f64.le
          (f64.mul
            (local.get $l7)
            (f64.convert_i32_s
              (local.tee $l12
                (select
                  (i32.const 1)
                  (i32.const -1)
                  (local.tee $l11
                    (f64.gt
                      (local.get $l1)
                      (local.get $l5)))))))
          (f64.const 0x0p+0 (;=0;))))
      (block $B28
        (block $B29
          (br_if $B29
            (f32.ne
              (local.get $p0)
              (f32.const 0x0p+0 (;=0;))))
          (local.set $l3
            (select
              (f32.const 0x1.p-149 (;=1.4013e-45;))
              (f32.const -0x1.p-149 (;=-1.4013e-45;))
              (local.get $l11)))
          (br $B28))
        (local.set $l3
          (f32.reinterpret_i32
            (i32.add
              (select
                (local.get $l12)
                (i32.sub
                  (i32.const 0)
                  (local.get $l12))
                (f64.gt
                  (local.get $l1)
                  (f64.const 0x1p-150 (;=7.00649e-46;))))
              (local.get $l2)))))
      (local.set $p0
        (select
          (local.get $l3)
          (local.get $p0)
          (f64.eq
            (local.get $l1)
            (f64.mul
              (f64.add
                (local.get $l5)
                (f64.promote_f32
                  (local.get $l3)))
              (f64.const 0x1p-1 (;=0.5;)))))))
    (local.get $p0))
  (func $dummy (type $t14))
  (func $__wasm_call_dtors (type $t14)
    (call $dummy)
    (call $dummy))
  (func $s2_metric_fma.command_export (type $t0) (param $p0 f32) (param $p1 f32) (param $p2 f32) (result f32)
    (call $s2_metric_fma
      (local.get $p0)
      (local.get $p1)
      (local.get $p2))
    (call $__wasm_call_dtors))
  (func $s2_metric_init.command_export (type $t1) (param $p0 i32)
    (call $s2_metric_init
      (local.get $p0))
    (call $__wasm_call_dtors))
  (func $s2_metric_down.command_export (type $t2) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32)
    (call $s2_metric_down
      (local.get $p0)
      (local.get $p1)
      (local.get $p2)
      (local.get $p3)
      (local.get $p4)
      (local.get $p5))
    (call $__wasm_call_dtors))
  (func $s2_metric_scale.command_export (type $t3) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (param $p16 i32) (param $p17 i32) (param $p18 i32)
    (call $s2_metric_scale
      (local.get $p0)
      (local.get $p1)
      (local.get $p2)
      (local.get $p3)
      (local.get $p4)
      (local.get $p5)
      (local.get $p6)
      (local.get $p7)
      (local.get $p8)
      (local.get $p9)
      (local.get $p10)
      (local.get $p11)
      (local.get $p12)
      (local.get $p13)
      (local.get $p14)
      (local.get $p15)
      (local.get $p16)
      (local.get $p17)
      (local.get $p18))
    (call $__wasm_call_dtors))
  (func $s2_metric_band.command_export (type $t9) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (result i32)
    (call $s2_metric_band
      (local.get $p0)
      (local.get $p1)
      (local.get $p2)
      (local.get $p3)
      (local.get $p4)
      (local.get $p5)
      (local.get $p6)
      (local.get $p7)
      (local.get $p8)
      (local.get $p9)
      (local.get $p10)
      (local.get $p11)
      (local.get $p12)
      (local.get $p13)
      (local.get $p14)
      (local.get $p15))
    (call $__wasm_call_dtors))
  (func $s2_metric_band2.command_export (type $t10) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (param $p16 i32) (param $p17 i32) (param $p18 i32) (param $p19 i32) (result i32)
    (call $s2_metric_band2
      (local.get $p0)
      (local.get $p1)
      (local.get $p2)
      (local.get $p3)
      (local.get $p4)
      (local.get $p5)
      (local.get $p6)
      (local.get $p7)
      (local.get $p8)
      (local.get $p9)
      (local.get $p10)
      (local.get $p11)
      (local.get $p12)
      (local.get $p13)
      (local.get $p14)
      (local.get $p15)
      (local.get $p16)
      (local.get $p17)
      (local.get $p18)
      (local.get $p19))
    (call $__wasm_call_dtors))
  (table $T0 1 1 funcref)
  (global $__stack_pointer (mut i32) (i32.const 65536))
  (export "s2MetricFma" (func $s2_metric_fma.command_export))
  (export "s2MetricInit" (func $s2_metric_init.command_export))
  (export "s2MetricDown" (func $s2_metric_down.command_export))
  (export "s2MetricScale" (func $s2_metric_scale.command_export))
  (export "s2MetricBand" (func $s2_metric_band.command_export))
  (export "s2MetricBand2" (func $s2_metric_band2.command_export)))
