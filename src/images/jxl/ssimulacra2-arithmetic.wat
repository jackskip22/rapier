;; SPDX-License-Identifier: BSD-3-Clause
;; Generated from ssimulacra2-simd.c and metric-float.h by build-jxl-kernels.mjs.
;; C inputs sha256 984d388f5243166ba0f4350202348cb31378d005da746203f768b55969d39d68
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
  (type $t4 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
  (type $t5 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32)))
  (type $t6 (func (param i32 i32 i32 i32 i32 i32 i32 i32)))
  (type $t7 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (type $t8 (func (param v128 v128 v128) (result v128)))
  (type $t9 (func (param v128 i32) (result v128)))
  (type $t10 (func (param f32 f32 f32 i32)))
  (type $t11 (func (param i32 i32 i32 i32 i32)))
  (type $t12 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
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
    (local $l19 i32) (local $l20 i32) (local $l21 i32) (local $l22 i32) (local $l23 i32) (local $l24 i32) (local $l25 i32) (local $l26 i32) (local $l27 i32) (local $l28 i32) (local $l29 i32) (local $l30 i32) (local $l31 i32) (local $l32 i32) (local $l33 i32) (local $l34 i32) (local $l35 i32) (local $l36 i32) (local $l37 i32) (local $l38 i32) (local $l39 i32) (local $l40 v128) (local $l41 i32) (local $l42 i32) (local $l43 i32) (local $l44 i32) (local $l45 i32) (local $l46 i32) (local $l47 i32) (local $l48 i32) (local $l49 i32) (local $l50 i32) (local $l51 i32) (local $l52 v128) (local $l53 v128) (local $l54 v128) (local $l55 i32) (local $l56 i32) (local $l57 i32) (local $l58 i32) (local $l59 i32)
    (global.set $__stack_pointer
      (local.tee $l19
        (i32.sub
          (global.get $__stack_pointer)
          (i32.const 272))))
    (i32.store offset=268
      (local.get $l19)
      (local.get $p11))
    (i32.store offset=264
      (local.get $l19)
      (local.get $p10))
    (i32.store offset=260
      (local.get $l19)
      (local.get $p9))
    (local.set $p11
      (i32.shl
        (local.get $p0)
        (i32.const 4)))
    (block $B0
      (block $B1
        (br_if $B1
          (i32.eqz
            (local.tee $l20
              (i32.and
                (local.get $p2)
                (i32.xor
                  (local.get $p12)
                  (i32.const -1))))))
        (i32.store offset=248
          (local.get $l19)
          (local.get $p13))
        (i32.store offset=252
          (local.get $l19)
          (local.tee $p13
            (i32.add
              (local.get $p13)
              (local.tee $p10
                (i32.shl
                  (local.get $p11)
                  (i32.const 2))))))
        (i32.store offset=256
          (local.get $l19)
          (local.tee $p13
            (i32.add
              (local.get $p13)
              (local.get $p10))))
        (local.set $p13
          (i32.add
            (local.get $p13)
            (local.get $p10)))
        (br $B0))
      (i32.store offset=256
        (local.get $l19)
        (i32.const 0))
      (i64.store offset=248 align=4
        (local.get $l19)
        (i64.const 0)))
    (local.set $l21
      (i32.mul
        (local.get $p1)
        (local.get $p0)))
    (local.set $l24
      (i32.and
        (local.tee $l23
          (select
            (local.tee $l22
              (i32.mul
                (local.get $p0)
                (i32.const 6)))
            (i32.const 1)
            (i32.gt_s
              (local.get $l22)
              (i32.const 1))))
        (i32.const 2147483644)))
    (i32.store offset=236
      (local.get $l19)
      (local.get $p13))
    (i32.store offset=240
      (local.get $l19)
      (local.tee $p13
        (i32.add
          (local.get $p13)
          (local.tee $l25
            (i32.shl
              (local.get $p11)
              (i32.const 2))))))
    (i32.store offset=244
      (local.get $l19)
      (local.tee $p13
        (i32.add
          (local.get $p13)
          (local.get $l25))))
    (local.set $l28
      (i32.add
        (local.tee $l27
          (i32.add
            (local.tee $l26
              (i32.add
                (local.get $p13)
                (local.get $l25)))
            (local.tee $p13
              (i32.shl
                (local.get $p0)
                (i32.const 4)))))
        (local.get $p13)))
    (local.set $l29
      (i32.mul
        (local.get $p0)
        (i32.const 432)))
    (local.set $l30
      (i32.mul
        (local.get $p0)
        (i32.const 340)))
    (local.set $l31
      (i32.mul
        (local.get $p0)
        (i32.const 248)))
    (local.set $l32
      (i32.mul
        (local.get $p0)
        (i32.const 156)))
    (local.set $l33
      (i32.shl
        (local.get $p0)
        (i32.const 6)))
    (local.set $p9
      (i32.const 0))
    (loop $L2
      (local.set $p10
        (i32.add
          (i32.add
            (local.get $l19)
            (i32.const 176))
          (local.tee $p13
            (i32.mul
              (local.get $p9)
              (i32.const 20)))))
      (block $B3
        (block $B4
          (br_if $B4
            (i32.and
              (local.tee $p11
                (i32.shl
                  (i32.const 1)
                  (local.get $p9)))
              (local.get $p2)))
          (i32.store offset=16
            (local.get $p10)
            (i32.const 0))
          (v128.store align=4
            (local.get $p10)
            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
          (br $B3))
        (local.set $l34
          (i32.add
            (i32.add
              (local.get $l19)
              (i32.const 48))
            (local.get $p13)))
        (local.set $l35
          (i32.add
            (i32.add
              (local.get $l19)
              (i32.const 112))
            (local.get $p13)))
        (block $B5
          (block $B6
            (block $B7
              (br_if $B7
                (i32.and
                  (local.get $p11)
                  (local.get $p12)))
              (i32.store
                (local.get $p10)
                (local.get $l28))
              (i32.store
                (local.get $l35)
                (local.tee $p13
                  (i32.add
                    (local.get $l28)
                    (local.get $l25))))
              (i32.store
                (local.get $l34)
                (local.tee $l37
                  (i32.add
                    (local.get $p13)
                    (local.tee $l36
                      (i32.shl
                        (local.get $l22)
                        (i32.const 2))))))
              (br_if $B6
                (i32.lt_s
                  (local.get $p0)
                  (i32.const 1)))
              (local.set $p11
                (i32.const 0))
              (block $B8
                (block $B9
                  (br_if $B9
                    (local.tee $l38
                      (i32.lt_s
                        (local.get $l22)
                        (i32.const 4))))
                  (local.set $p11
                    (local.get $l24))
                  (loop $L10
                    (v128.store align=4
                      (local.get $p13)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 16)))
                    (br_if $L10
                      (local.tee $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const -4)))))
                  (local.set $p11
                    (local.get $l24))
                  (br_if $B8
                    (i32.eq
                      (local.get $l23)
                      (local.get $l24))))
                (local.set $p13
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (local.get $l33))
                    (i32.shl
                      (local.get $p11)
                      (i32.const 2))))
                (local.set $p11
                  (i32.sub
                    (local.get $l23)
                    (local.get $p11)))
                (loop $L11
                  (i32.store
                    (local.get $p13)
                    (i32.const 0))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 4)))
                  (br_if $L11
                    (local.tee $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const -1))))))
              (i32.store offset=4
                (local.get $p10)
                (local.tee $p13
                  (i32.add
                    (local.get $l37)
                    (local.tee $l39
                      (i32.shl
                        (local.get $p0)
                        (i32.const 2))))))
              (i32.store offset=4
                (local.get $l35)
                (local.tee $p13
                  (i32.add
                    (local.get $p13)
                    (local.get $l25))))
              (i32.store offset=4
                (local.get $l34)
                (local.tee $l37
                  (i32.add
                    (local.get $p13)
                    (local.get $l36))))
              (local.set $p11
                (i32.const 0))
              (block $B12
                (block $B13
                  (br_if $B13
                    (local.get $l38))
                  (local.set $p11
                    (local.get $l24))
                  (loop $L14
                    (v128.store align=4
                      (local.get $p13)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 16)))
                    (br_if $L14
                      (local.tee $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const -4)))))
                  (local.set $p11
                    (local.get $l24))
                  (br_if $B12
                    (i32.eq
                      (local.get $l23)
                      (local.get $l24))))
                (local.set $p13
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (local.get $l32))
                    (i32.shl
                      (local.get $p11)
                      (i32.const 2))))
                (local.set $p11
                  (i32.sub
                    (local.get $l23)
                    (local.get $p11)))
                (loop $L15
                  (i32.store
                    (local.get $p13)
                    (i32.const 0))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 4)))
                  (br_if $L15
                    (local.tee $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const -1))))))
              (i32.store offset=8
                (local.get $p10)
                (local.tee $p13
                  (i32.add
                    (local.get $l37)
                    (local.get $l39))))
              (i32.store offset=8
                (local.get $l35)
                (local.tee $p13
                  (i32.add
                    (local.get $p13)
                    (local.get $l25))))
              (i32.store offset=8
                (local.get $l34)
                (local.tee $l37
                  (i32.add
                    (local.get $p13)
                    (local.get $l36))))
              (local.set $p11
                (i32.const 0))
              (block $B16
                (block $B17
                  (br_if $B17
                    (local.get $l38))
                  (local.set $p11
                    (local.get $l24))
                  (loop $L18
                    (v128.store align=4
                      (local.get $p13)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 16)))
                    (br_if $L18
                      (local.tee $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const -4)))))
                  (local.set $p11
                    (local.get $l24))
                  (br_if $B16
                    (i32.eq
                      (local.get $l23)
                      (local.get $l24))))
                (local.set $p13
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (local.get $l31))
                    (i32.shl
                      (local.get $p11)
                      (i32.const 2))))
                (local.set $p11
                  (i32.sub
                    (local.get $l23)
                    (local.get $p11)))
                (loop $L19
                  (i32.store
                    (local.get $p13)
                    (i32.const 0))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 4)))
                  (br_if $L19
                    (local.tee $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const -1))))))
              (i32.store offset=12
                (local.get $p10)
                (local.tee $p13
                  (i32.add
                    (local.get $l37)
                    (local.get $l39))))
              (i32.store offset=12
                (local.get $l35)
                (local.tee $p13
                  (i32.add
                    (local.get $p13)
                    (local.get $l25))))
              (i32.store offset=12
                (local.get $l34)
                (local.tee $l37
                  (i32.add
                    (local.get $p13)
                    (local.get $l36))))
              (local.set $p11
                (i32.const 0))
              (block $B20
                (block $B21
                  (br_if $B21
                    (local.get $l38))
                  (local.set $p11
                    (local.get $l24))
                  (loop $L22
                    (v128.store align=4
                      (local.get $p13)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 16)))
                    (br_if $L22
                      (local.tee $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const -4)))))
                  (local.set $p11
                    (local.get $l24))
                  (br_if $B20
                    (i32.eq
                      (local.get $l23)
                      (local.get $l24))))
                (local.set $p13
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (local.get $l30))
                    (i32.shl
                      (local.get $p11)
                      (i32.const 2))))
                (local.set $p11
                  (i32.sub
                    (local.get $l23)
                    (local.get $p11)))
                (loop $L23
                  (i32.store
                    (local.get $p13)
                    (i32.const 0))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 4)))
                  (br_if $L23
                    (local.tee $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const -1))))))
              (i32.store offset=16
                (local.get $p10)
                (local.tee $p13
                  (i32.add
                    (local.get $l37)
                    (local.get $l39))))
              (i32.store offset=16
                (local.get $l35)
                (local.tee $p13
                  (i32.add
                    (local.get $p13)
                    (local.get $l25))))
              (i32.store offset=16
                (local.get $l34)
                (local.tee $p10
                  (i32.add
                    (local.get $p13)
                    (local.get $l36))))
              (local.set $p11
                (i32.const 0))
              (block $B24
                (block $B25
                  (br_if $B25
                    (local.get $l38))
                  (local.set $p13
                    (i32.add
                      (local.get $l28)
                      (local.get $l29)))
                  (local.set $p11
                    (local.get $l24))
                  (loop $L26
                    (v128.store align=4
                      (local.get $p13)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 16)))
                    (br_if $L26
                      (local.tee $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const -4)))))
                  (local.set $p11
                    (local.get $l24))
                  (br_if $B24
                    (i32.eq
                      (local.get $l23)
                      (local.get $l24))))
                (local.set $p13
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (local.get $l29))
                    (i32.shl
                      (local.get $p11)
                      (i32.const 2))))
                (local.set $p11
                  (i32.sub
                    (local.get $l23)
                    (local.get $p11)))
                (loop $L27
                  (i32.store
                    (local.get $p13)
                    (i32.const 0))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 4)))
                  (br_if $L27
                    (local.tee $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const -1))))))
              (local.set $l28
                (i32.add
                  (local.get $p10)
                  (local.get $l39)))
              (br $B3))
            (i32.store offset=4
              (local.get $p10)
              (local.get $l28))
            (i32.store
              (local.get $p10)
              (i32.const 0))
            (i32.store offset=4
              (local.get $l35)
              (local.tee $p13
                (i32.add
                  (local.get $l28)
                  (local.get $l25))))
            (i32.store offset=4
              (local.get $l34)
              (local.tee $p11
                (i32.add
                  (local.get $p13)
                  (local.tee $l36
                    (i32.shl
                      (local.get $l22)
                      (i32.const 2))))))
            (local.set $l39
              (i32.add
                (local.get $p11)
                (local.tee $l38
                  (i32.shl
                    (local.get $p0)
                    (i32.const 2)))))
            (block $B28
              (br_if $B28
                (local.tee $l37
                  (i32.lt_s
                    (local.get $p0)
                    (i32.const 1))))
              (local.set $p11
                (i32.const 0))
              (block $B29
                (br_if $B29
                  (i32.lt_s
                    (local.get $l22)
                    (i32.const 4)))
                (local.set $p11
                  (local.get $l24))
                (loop $L30
                  (v128.store align=4
                    (local.get $p13)
                    (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 16)))
                  (br_if $L30
                    (local.tee $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const -4)))))
                (local.set $p11
                  (local.get $l24))
                (br_if $B28
                  (i32.eq
                    (local.get $l23)
                    (local.get $l24))))
              (local.set $p13
                (i32.add
                  (i32.add
                    (local.get $l28)
                    (local.get $l33))
                  (i32.shl
                    (local.get $p11)
                    (i32.const 2))))
              (local.set $p11
                (i32.sub
                  (local.get $l23)
                  (local.get $p11)))
              (loop $L31
                (i32.store
                  (local.get $p13)
                  (i32.const 0))
                (local.set $p13
                  (i32.add
                    (local.get $p13)
                    (i32.const 4)))
                (br_if $L31
                  (local.tee $p11
                    (i32.add
                      (local.get $p11)
                      (i32.const -1))))))
            (i32.store offset=12
              (local.get $p10)
              (local.get $l39))
            (i32.store offset=8
              (local.get $p10)
              (i32.const 0))
            (i32.store offset=12
              (local.get $l35)
              (local.tee $p13
                (i32.add
                  (local.get $l39)
                  (local.get $l25))))
            (i32.store offset=12
              (local.get $l34)
              (local.tee $p11
                (i32.add
                  (local.get $p13)
                  (local.get $l36))))
            (local.set $l39
              (i32.add
                (local.get $p11)
                (local.get $l38)))
            (br_if $B5
              (local.get $l37))
            (local.set $p11
              (i32.const 0))
            (block $B32
              (block $B33
                (br_if $B33
                  (local.tee $l37
                    (i32.lt_s
                      (local.get $l22)
                      (i32.const 4))))
                (local.set $p11
                  (local.get $l24))
                (loop $L34
                  (v128.store align=4
                    (local.get $p13)
                    (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 16)))
                  (br_if $L34
                    (local.tee $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const -4)))))
                (local.set $p11
                  (local.get $l24))
                (br_if $B32
                  (i32.eq
                    (local.get $l23)
                    (local.get $l24))))
              (local.set $p13
                (i32.add
                  (i32.add
                    (local.get $l28)
                    (local.get $l32))
                  (i32.shl
                    (local.get $p11)
                    (i32.const 2))))
              (local.set $p11
                (i32.sub
                  (local.get $l23)
                  (local.get $p11)))
              (loop $L35
                (i32.store
                  (local.get $p13)
                  (i32.const 0))
                (local.set $p13
                  (i32.add
                    (local.get $p13)
                    (i32.const 4)))
                (br_if $L35
                  (local.tee $p11
                    (i32.add
                      (local.get $p11)
                      (i32.const -1))))))
            (i32.store offset=16
              (local.get $p10)
              (local.get $l39))
            (i32.store offset=16
              (local.get $l35)
              (local.tee $p13
                (i32.add
                  (local.get $l39)
                  (local.get $l25))))
            (i32.store offset=16
              (local.get $l34)
              (local.tee $p11
                (i32.add
                  (local.get $p13)
                  (local.get $l36))))
            (local.set $p10
              (i32.add
                (local.get $p11)
                (local.get $l38)))
            (local.set $p11
              (i32.const 0))
            (block $B36
              (br_if $B36
                (local.get $l37))
              (local.set $p11
                (local.get $l24))
              (loop $L37
                (v128.store align=4
                  (local.get $p13)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $p13
                  (i32.add
                    (local.get $p13)
                    (i32.const 16)))
                (br_if $L37
                  (local.tee $p11
                    (i32.add
                      (local.get $p11)
                      (i32.const -4)))))
              (local.set $p11
                (local.get $l24))
              (br_if $B36
                (i32.ne
                  (local.get $l23)
                  (local.get $l24)))
              (local.set $l28
                (local.get $p10))
              (br $B3))
            (local.set $p13
              (i32.add
                (i32.add
                  (local.get $l28)
                  (local.get $l31))
                (i32.shl
                  (local.get $p11)
                  (i32.const 2))))
            (local.set $p11
              (i32.sub
                (local.get $l23)
                (local.get $p11)))
            (loop $L38
              (i32.store
                (local.get $p13)
                (i32.const 0))
              (local.set $p13
                (i32.add
                  (local.get $p13)
                  (i32.const 4)))
              (br_if $L38
                (local.tee $p11
                  (i32.add
                    (local.get $p11)
                    (i32.const -1)))))
            (local.set $l28
              (local.get $p10))
            (br $B3))
          (i32.store offset=4
            (local.get $p10)
            (local.tee $p11
              (i32.add
                (local.get $l37)
                (local.tee $p13
                  (i32.shl
                    (local.get $p0)
                    (i32.const 2))))))
          (i32.store offset=4
            (local.get $l35)
            (local.tee $p11
              (i32.add
                (local.get $p11)
                (local.get $l25))))
          (i32.store offset=4
            (local.get $l34)
            (local.tee $p11
              (i32.add
                (local.get $p11)
                (local.get $l36))))
          (i32.store offset=8
            (local.get $p10)
            (local.tee $p11
              (i32.add
                (local.get $p11)
                (local.get $p13))))
          (i32.store offset=8
            (local.get $l35)
            (local.tee $p11
              (i32.add
                (local.get $p11)
                (local.get $l25))))
          (i32.store offset=8
            (local.get $l34)
            (local.tee $p11
              (i32.add
                (local.get $p11)
                (local.get $l36))))
          (i32.store offset=12
            (local.get $p10)
            (local.tee $p11
              (i32.add
                (local.get $p11)
                (local.get $p13))))
          (i32.store offset=12
            (local.get $l35)
            (local.tee $p11
              (i32.add
                (local.get $p11)
                (local.get $l25))))
          (i32.store offset=12
            (local.get $l34)
            (local.tee $p11
              (i32.add
                (local.get $p11)
                (local.get $l36))))
          (i32.store offset=16
            (local.get $p10)
            (local.tee $p11
              (i32.add
                (local.get $p11)
                (local.get $p13))))
          (i32.store offset=16
            (local.get $l35)
            (local.tee $p11
              (i32.add
                (local.get $p11)
                (local.get $l25))))
          (i32.store offset=16
            (local.get $l34)
            (local.tee $p11
              (i32.add
                (local.get $p11)
                (local.get $l36))))
          (local.set $l28
            (i32.add
              (local.get $p11)
              (local.get $p13)))
          (br $B3))
        (i32.store offset=16
          (local.get $p10)
          (local.get $l39))
        (i32.store offset=16
          (local.get $l35)
          (local.tee $p13
            (i32.add
              (local.get $l39)
              (local.get $l25))))
        (i32.store offset=16
          (local.get $l34)
          (local.tee $p13
            (i32.add
              (local.get $p13)
              (local.get $l36))))
        (local.set $l28
          (i32.add
            (local.get $p13)
            (local.get $l38))))
      (br_if $L2
        (i32.ne
          (local.tee $p9
            (i32.add
              (local.get $p9)
              (i32.const 1)))
          (i32.const 3))))
    (v128.store offset=112 align=8
      (local.get $p16)
      (local.tee $l40
        (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
    (v128.store offset=96 align=8
      (local.get $p16)
      (local.get $l40))
    (v128.store offset=80 align=8
      (local.get $p16)
      (local.get $l40))
    (v128.store offset=64 align=8
      (local.get $p16)
      (local.get $l40))
    (v128.store offset=48 align=8
      (local.get $p16)
      (local.get $l40))
    (v128.store offset=32 align=8
      (local.get $p16)
      (local.get $l40))
    (v128.store offset=16 align=8
      (local.get $p16)
      (local.get $l40))
    (v128.store align=8
      (local.get $p16)
      (local.get $l40))
    (v128.store offset=128 align=8
      (local.get $p16)
      (local.get $l40))
    (block $B39
      (br_if $B39
        (i32.le_s
          (local.get $p1)
          (i32.const -4)))
      (local.set $l33
        (select
          (local.get $p4)
          (local.get $p6)
          (local.get $l20)))
      (local.set $l29
        (select
          (local.get $p3)
          (local.get $p5)
          (local.get $l20)))
      (local.set $l41
        (i32.and
          (local.get $p0)
          (i32.const 1)))
      (local.set $l37
        (i32.and
          (local.get $p0)
          (i32.const 2147483644)))
      (local.set $l23
        (i32.and
          (local.get $p0)
          (i32.const 3)))
      (local.set $l42
        (i32.shl
          (local.get $l21)
          (i32.const 3)))
      (local.set $l43
        (i32.sub
          (i32.const 0)
          (local.tee $l35
            (i32.shl
              (local.get $p0)
              (i32.const 2)))))
      (local.set $l40
        (i32x4.splat
          (local.get $p0)))
      (local.set $l30
        (select
          (i32.add
            (local.get $l19)
            (i32.const 248))
          (i32.add
            (local.get $l19)
            (i32.const 236))
          (local.get $l20)))
      (local.set $l45
        (i32.lt_u
          (i32.add
            (local.tee $l44
              (i32.shl
                (local.get $l21)
                (i32.const 2)))
            (i32.const -1))
          (i32.const 15)))
      (local.set $l47
        (local.tee $l46
          (i32.mul
            (local.get $p0)
            (i32.add
              (i32.shl
                (local.get $p1)
                (i32.const 2))
              (i32.const -16)))))
      (local.set $l49
        (local.tee $l48
          (i32.mul
            (local.get $p0)
            (i32.add
              (i32.shl
                (local.get $p1)
                (i32.const 3))
              (i32.const -16)))))
      (local.set $l50
        (i32.const 0))
      (local.set $l31
        (i32.const 0))
      (local.set $p3
        (i32.const -4))
      (loop $L40
        (local.set $l51
          (i32.add
            (local.get $p3)
            (i32.const 4)))
        (block $B41
          (br_if $B41
            (i32.ge_s
              (local.get $l31)
              (local.get $p1)))
          (br_if $B41
            (i32.gt_s
              (local.get $l31)
              (local.get $l51)))
          (loop $L42
            (local.set $p11
              (local.tee $l39
                (select
                  (local.tee $p10
                    (i32.sub
                      (local.get $p1)
                      (local.get $l31)))
                  (i32.const 4)
                  (i32.lt_s
                    (local.get $p10)
                    (i32.const 4)))))
            (local.set $p13
              (local.get $l31))
            (block $B43
              (block $B44
                (br_if $B44
                  (i32.eqz
                    (local.tee $l36
                      (i32.lt_s
                        (local.get $p10)
                        (i32.const 1)))))
                (local.set $l24
                  (select
                    (local.get $l39)
                    (i32.const 1)
                    (i32.gt_s
                      (local.get $l39)
                      (i32.const 1))))
                (br $B43))
              (loop $L45
                (call $positive_row
                  (local.get $l29)
                  (local.get $l33)
                  (local.get $p13)
                  (local.get $p0)
                  (local.get $p1)
                  (local.get $l30)
                  (local.tee $p10
                    (i32.mul
                      (i32.rem_s
                        (local.get $p13)
                        (i32.const 16))
                      (local.get $p0)))
                  (local.get $p7)
                  (local.get $p17)
                  (local.get $p18))
                (block $B46
                  (br_if $B46
                    (i32.eqz
                      (local.get $l20)))
                  (call $positive_row
                    (local.get $p5)
                    (local.get $p6)
                    (local.get $p13)
                    (local.get $p0)
                    (local.get $p1)
                    (i32.add
                      (local.get $l19)
                      (i32.const 236))
                    (local.get $p10)
                    (local.get $p7)
                    (local.get $p17)
                    (local.get $p18)))
                (local.set $p13
                  (i32.add
                    (local.get $p13)
                    (i32.const 1)))
                (br_if $L45
                  (local.tee $p11
                    (i32.add
                      (local.get $p11)
                      (i32.const -1)))))
              (local.set $l24
                (local.get $l39)))
            (local.set $l21
              (i32.or
                (local.get $l36)
                (i32.lt_s
                  (local.get $p0)
                  (i32.const 1))))
            (local.set $l38
              (i32.and
                (local.get $l24)
                (i32.const -4)))
            (local.set $p4
              (i32.mul
                (local.get $l35)
                (local.get $l31)))
            (local.set $l52
              (i32x4.splat
                (local.get $l31)))
            (local.set $l22
              (i32.const 0))
            (loop $L47
              (block $B48
                (br_if $B48
                  (i32.eqz
                    (i32.and
                      (local.tee $p13
                        (i32.shl
                          (i32.const 1)
                          (local.get $l22)))
                      (local.get $p2))))
                (block $B49
                  (br_if $B49
                    (local.get $l36))
                  (local.set $l28
                    (i32.load
                      (i32.add
                        (i32.add
                          (local.get $l19)
                          (i32.const 236))
                        (local.tee $l32
                          (i32.shl
                            (local.get $l22)
                            (i32.const 2))))))
                  (block $B50
                    (br_if $B50
                      (i32.and
                        (local.get $p13)
                        (local.get $p12)))
                    (local.set $l25
                      (i32.load
                        (i32.add
                          (i32.add
                            (local.get $l19)
                            (i32.const 248))
                          (local.get $l32))))
                    (local.set $p11
                      (i32.const 0))
                    (block $B51
                      (block $B52
                        (br_if $B52
                          (i32.lt_u
                            (local.get $l24)
                            (i32.const 4)))
                        (local.set $l53
                          (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                        (local.set $p13
                          (i32.add
                            (local.get $l19)
                            (i32.const 16)))
                        (local.set $p11
                          (i32.add
                            (local.get $l19)
                            (i32.const 32)))
                        (local.set $p10
                          (local.get $l38))
                        (loop $L53
                          (v128.store
                            (local.get $p13)
                            (i32x4.add
                              (i32x4.splat
                                (local.get $l28))
                              (local.tee $l54
                                (i32x4.shl
                                  (i32x4.mul
                                    (i32x4.replace_lane 3
                                      (i32x4.replace_lane 2
                                        (i32x4.replace_lane 1
                                          (i32x4.splat
                                            (i32.rem_s
                                              (i32x4.extract_lane 0
                                                (local.tee $l54
                                                  (i32x4.add
                                                    (local.get $l53)
                                                    (local.get $l52))))
                                              (i32.const 16)))
                                          (i32.rem_s
                                            (i32x4.extract_lane 1
                                              (local.get $l54))
                                            (i32.const 16)))
                                        (i32.rem_s
                                          (i32x4.extract_lane 2
                                            (local.get $l54))
                                          (i32.const 16)))
                                      (i32.rem_s
                                        (i32x4.extract_lane 3
                                          (local.get $l54))
                                        (i32.const 16)))
                                    (local.get $l40))
                                  (i32.const 2)))))
                          (v128.store
                            (local.get $p11)
                            (i32x4.add
                              (i32x4.splat
                                (local.get $l25))
                              (local.get $l54)))
                          (local.set $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const 16)))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 16)))
                          (local.set $l53
                            (i32x4.add
                              (local.get $l53)
                              (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                          (br_if $L53
                            (local.tee $p10
                              (i32.add
                                (local.get $p10)
                                (i32.const -4)))))
                        (local.set $p11
                          (local.get $l38))
                        (br_if $B51
                          (i32.eq
                            (local.get $l24)
                            (local.get $l38))))
                      (local.set $p13
                        (i32.add
                          (local.get $l31)
                          (local.get $p11)))
                      (local.set $p9
                        (i32.sub
                          (local.get $l24)
                          (local.get $p11)))
                      (local.set $p11
                        (i32.add
                          (i32.add
                            (local.get $l19)
                            (i32.const 32))
                          (local.tee $p10
                            (i32.shl
                              (local.get $p11)
                              (i32.const 2)))))
                      (local.set $p10
                        (i32.add
                          (i32.add
                            (local.get $l19)
                            (i32.const 16))
                          (local.get $p10)))
                      (loop $L54
                        (i32.store
                          (local.get $p10)
                          (i32.add
                            (local.get $l28)
                            (local.tee $l34
                              (i32.shl
                                (i32.mul
                                  (i32.rem_s
                                    (local.get $p13)
                                    (i32.const 16))
                                  (local.get $p0))
                                (i32.const 2)))))
                        (i32.store
                          (local.get $p11)
                          (i32.add
                            (local.get $l25)
                            (local.get $l34)))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 1)))
                        (local.set $p11
                          (i32.add
                            (local.get $p11)
                            (i32.const 4)))
                        (local.set $p10
                          (i32.add
                            (local.get $p10)
                            (i32.const 4)))
                        (br_if $L54
                          (local.tee $p9
                            (i32.add
                              (local.get $p9)
                              (i32.const -1))))))
                    (br_if $B49
                      (i32.or
                        (i32.eqz
                          (local.tee $p13
                            (i32.load
                              (i32.add
                                (i32.add
                                  (local.get $l19)
                                  (i32.const 260))
                                (local.get $l32)))))
                        (local.get $l21)))
                    (local.set $l25
                      (i32.const 0))
                    (local.set $p9
                      (local.tee $l32
                        (i32.add
                          (local.get $p4)
                          (local.get $p13))))
                    (loop $L55
                      (local.set $l28
                        (i32.load
                          (i32.add
                            (i32.add
                              (local.get $l19)
                              (i32.const 32))
                            (i32.shl
                              (local.get $l25)
                              (i32.const 2)))))
                      (local.set $p10
                        (i32.const 0))
                      (block $B56
                        (block $B57
                          (br_if $B57
                            (i32.lt_u
                              (local.get $p0)
                              (i32.const 4)))
                          (local.set $p10
                            (i32.const 0))
                          (br_if $B57
                            (i32.gt_u
                              (i32.sub
                                (local.get $l28)
                                (i32.add
                                  (local.get $l32)
                                  (i32.mul
                                    (local.get $l35)
                                    (local.get $l25))))
                              (i32.const -16)))
                          (local.set $p13
                            (local.get $l28))
                          (local.set $p11
                            (local.get $p9))
                          (local.set $p10
                            (local.get $l37))
                          (loop $L58
                            (v128.store align=4
                              (local.get $p11)
                              (v128.load align=4
                                (local.get $p13)))
                            (local.set $p13
                              (i32.add
                                (local.get $p13)
                                (i32.const 16)))
                            (local.set $p11
                              (i32.add
                                (local.get $p11)
                                (i32.const 16)))
                            (br_if $L58
                              (local.tee $p10
                                (i32.add
                                  (local.get $p10)
                                  (i32.const -4)))))
                          (local.set $p10
                            (local.get $l37))
                          (br_if $B56
                            (i32.eq
                              (local.get $p0)
                              (local.get $l37))))
                        (local.set $l34
                          (local.get $p10))
                        (block $B59
                          (br_if $B59
                            (i32.eqz
                              (local.get $l23)))
                          (local.set $l34
                            (i32.add
                              (local.get $l23)
                              (local.get $p10)))
                          (local.set $p13
                            (i32.shl
                              (local.get $p10)
                              (i32.const 2)))
                          (local.set $p11
                            (local.get $l23))
                          (loop $L60
                            (f32.store
                              (i32.add
                                (local.get $p9)
                                (local.get $p13))
                              (f32.load
                                (i32.add
                                  (local.get $l28)
                                  (local.get $p13))))
                            (local.set $p13
                              (i32.add
                                (local.get $p13)
                                (i32.const 4)))
                            (br_if $L60
                              (local.tee $p11
                                (i32.add
                                  (local.get $p11)
                                  (i32.const -1))))))
                        (br_if $B56
                          (i32.gt_u
                            (i32.sub
                              (local.get $p10)
                              (local.get $p0))
                            (i32.const -4)))
                        (local.set $p13
                          (i32.shl
                            (local.get $l34)
                            (i32.const 2)))
                        (local.set $l34
                          (i32.sub
                            (local.get $p0)
                            (local.get $l34)))
                        (loop $L61
                          (f32.store
                            (local.tee $p11
                              (i32.add
                                (local.get $p9)
                                (local.get $p13)))
                            (f32.load
                              (local.tee $p10
                                (i32.add
                                  (local.get $l28)
                                  (local.get $p13)))))
                          (f32.store
                            (i32.add
                              (local.get $p11)
                              (i32.const 4))
                            (f32.load
                              (i32.add
                                (local.get $p10)
                                (i32.const 4))))
                          (f32.store
                            (i32.add
                              (local.get $p11)
                              (i32.const 8))
                            (f32.load
                              (i32.add
                                (local.get $p10)
                                (i32.const 8))))
                          (f32.store
                            (i32.add
                              (local.get $p11)
                              (i32.const 12))
                            (f32.load
                              (i32.add
                                (local.get $p10)
                                (i32.const 12))))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 16)))
                          (br_if $L61
                            (local.tee $l34
                              (i32.add
                                (local.get $l34)
                                (i32.const -4))))))
                      (local.set $p9
                        (i32.add
                          (local.get $p9)
                          (local.get $l35)))
                      (br_if $L55
                        (i32.ne
                          (local.tee $l25
                            (i32.add
                              (local.get $l25)
                              (i32.const 1)))
                          (local.get $l24)))
                      (br $B49)))
                  (local.set $p9
                    (i32.load
                      (i32.add
                        (i32.add
                          (local.get $l19)
                          (i32.const 260))
                        (local.get $l32))))
                  (local.set $p10
                    (i32.const 0))
                  (block $B62
                    (br_if $B62
                      (i32.lt_u
                        (local.get $l24)
                        (i32.const 4)))
                    (local.set $l53
                      (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                    (local.set $p13
                      (i32.add
                        (local.get $l19)
                        (i32.const 16)))
                    (local.set $p11
                      (i32.add
                        (local.get $l19)
                        (i32.const 32)))
                    (local.set $p10
                      (local.get $l38))
                    (loop $L63
                      (v128.store
                        (local.get $p11)
                        (i32x4.add
                          (i32x4.splat
                            (local.get $p9))
                          (i32x4.shl
                            (i32x4.mul
                              (local.tee $l54
                                (i32x4.add
                                  (local.get $l53)
                                  (local.get $l52)))
                              (local.get $l40))
                            (i32.const 2))))
                      (v128.store
                        (local.get $p13)
                        (i32x4.add
                          (i32x4.splat
                            (local.get $l28))
                          (i32x4.shl
                            (i32x4.mul
                              (i32x4.replace_lane 3
                                (i32x4.replace_lane 2
                                  (i32x4.replace_lane 1
                                    (i32x4.splat
                                      (i32.rem_s
                                        (i32x4.extract_lane 0
                                          (local.get $l54))
                                        (i32.const 16)))
                                    (i32.rem_s
                                      (i32x4.extract_lane 1
                                        (local.get $l54))
                                      (i32.const 16)))
                                  (i32.rem_s
                                    (i32x4.extract_lane 2
                                      (local.get $l54))
                                    (i32.const 16)))
                                (i32.rem_s
                                  (i32x4.extract_lane 3
                                    (local.get $l54))
                                  (i32.const 16)))
                              (local.get $l40))
                            (i32.const 2))))
                      (local.set $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const 16)))
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 16)))
                      (local.set $l53
                        (i32x4.add
                          (local.get $l53)
                          (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                      (br_if $L63
                        (local.tee $p10
                          (i32.add
                            (local.get $p10)
                            (i32.const -4)))))
                    (local.set $p10
                      (local.get $l38))
                    (br_if $B49
                      (i32.eq
                        (local.get $l24)
                        (local.get $l38))))
                  (local.set $l34
                    (i32.sub
                      (local.get $l24)
                      (local.get $p10)))
                  (local.set $p11
                    (i32.add
                      (local.get $p9)
                      (i32.mul
                        (local.get $l35)
                        (local.tee $p13
                          (i32.add
                            (local.get $l31)
                            (local.get $p10))))))
                  (local.set $p10
                    (i32.add
                      (i32.add
                        (local.get $l19)
                        (i32.const 16))
                      (local.tee $p9
                        (i32.shl
                          (local.get $p10)
                          (i32.const 2)))))
                  (local.set $p9
                    (i32.add
                      (i32.add
                        (local.get $l19)
                        (i32.const 32))
                      (local.get $p9)))
                  (loop $L64
                    (i32.store
                      (local.get $p9)
                      (local.get $p11))
                    (i32.store
                      (local.get $p10)
                      (i32.add
                        (local.get $l28)
                        (i32.shl
                          (i32.mul
                            (i32.rem_s
                              (local.get $p13)
                              (i32.const 16))
                            (local.get $p0))
                          (i32.const 2))))
                    (local.set $p10
                      (i32.add
                        (local.get $p10)
                        (i32.const 4)))
                    (local.set $p9
                      (i32.add
                        (local.get $p9)
                        (i32.const 4)))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 1)))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (local.get $l35)))
                    (br_if $L64
                      (local.tee $l34
                        (i32.add
                          (local.get $l34)
                          (i32.const -1))))))
                (block $B65
                  (br_if $B65
                    (i32.eqz
                      (local.tee $p9
                        (i32.load
                          (local.tee $l28
                            (i32.add
                              (i32.add
                                (local.get $l19)
                                (i32.const 176))
                              (i32.mul
                                (local.get $l22)
                                (i32.const 20))))))))
                  (block $B66
                    (br_if $B66
                      (local.get $l36))
                    (local.set $p11
                      (i32.const 0))
                    (block $B67
                      (br_if $B67
                        (i32.lt_u
                          (local.get $l24)
                          (i32.const 4)))
                      (local.set $l53
                        (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                      (local.set $p13
                        (local.get $l19))
                      (local.set $p11
                        (local.get $l38))
                      (loop $L68
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
                                            (local.tee $l54
                                              (i32x4.add
                                                (local.get $l53)
                                                (local.get $l52))))
                                          (i32.const 16)))
                                      (i32.rem_s
                                        (i32x4.extract_lane 1
                                          (local.get $l54))
                                        (i32.const 16)))
                                    (i32.rem_s
                                      (i32x4.extract_lane 2
                                        (local.get $l54))
                                      (i32.const 16)))
                                  (i32.rem_s
                                    (i32x4.extract_lane 3
                                      (local.get $l54))
                                    (i32.const 16)))
                                (local.get $l40))
                              (i32.const 2))))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 16)))
                        (local.set $l53
                          (i32x4.add
                            (local.get $l53)
                            (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                        (br_if $L68
                          (local.tee $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const -4)))))
                      (local.set $p11
                        (local.get $l38))
                      (br_if $B66
                        (i32.eq
                          (local.get $l24)
                          (local.get $l38))))
                    (local.set $p10
                      (i32.sub
                        (local.get $l24)
                        (local.get $p11)))
                    (local.set $p13
                      (i32.add
                        (local.get $l31)
                        (local.get $p11)))
                    (local.set $p11
                      (i32.add
                        (local.get $l19)
                        (i32.shl
                          (local.get $p11)
                          (i32.const 2))))
                    (loop $L69
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
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 1)))
                      (br_if $L69
                        (local.tee $p10
                          (i32.add
                            (local.get $p10)
                            (i32.const -1))))))
                  (call $blur_rows
                    (i32.add
                      (local.get $l19)
                      (i32.const 32))
                    (i32.const 0)
                    (i32.const 0)
                    (local.get $l19)
                    (local.get $l39)
                    (local.get $p0)
                    (local.get $l26)
                    (local.get $l27)
                    (local.get $p8)))
                (block $B70
                  (br_if $B70
                    (i32.eqz
                      (local.tee $p9
                        (i32.load offset=4
                          (local.get $l28)))))
                  (block $B71
                    (br_if $B71
                      (local.get $l36))
                    (local.set $p11
                      (i32.const 0))
                    (block $B72
                      (br_if $B72
                        (i32.lt_u
                          (local.get $l24)
                          (i32.const 4)))
                      (local.set $l53
                        (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                      (local.set $p13
                        (local.get $l19))
                      (local.set $p11
                        (local.get $l38))
                      (loop $L73
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
                                            (local.tee $l54
                                              (i32x4.add
                                                (local.get $l53)
                                                (local.get $l52))))
                                          (i32.const 16)))
                                      (i32.rem_s
                                        (i32x4.extract_lane 1
                                          (local.get $l54))
                                        (i32.const 16)))
                                    (i32.rem_s
                                      (i32x4.extract_lane 2
                                        (local.get $l54))
                                      (i32.const 16)))
                                  (i32.rem_s
                                    (i32x4.extract_lane 3
                                      (local.get $l54))
                                    (i32.const 16)))
                                (local.get $l40))
                              (i32.const 2))))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 16)))
                        (local.set $l53
                          (i32x4.add
                            (local.get $l53)
                            (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                        (br_if $L73
                          (local.tee $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const -4)))))
                      (local.set $p11
                        (local.get $l38))
                      (br_if $B71
                        (i32.eq
                          (local.get $l24)
                          (local.get $l38))))
                    (local.set $p13
                      (i32.add
                        (local.get $l31)
                        (local.get $p11)))
                    (local.set $p10
                      (i32.sub
                        (local.get $l24)
                        (local.get $p11)))
                    (local.set $p11
                      (i32.add
                        (local.get $l19)
                        (i32.shl
                          (local.get $p11)
                          (i32.const 2))))
                    (loop $L74
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
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 1)))
                      (local.set $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const 4)))
                      (br_if $L74
                        (local.tee $p10
                          (i32.add
                            (local.get $p10)
                            (i32.const -1))))))
                  (call $blur_rows
                    (i32.add
                      (local.get $l19)
                      (i32.const 16))
                    (i32.const 0)
                    (i32.const 0)
                    (local.get $l19)
                    (local.get $l39)
                    (local.get $p0)
                    (local.get $l26)
                    (local.get $l27)
                    (local.get $p8)))
                (block $B75
                  (br_if $B75
                    (i32.eqz
                      (local.tee $p9
                        (i32.load offset=8
                          (local.get $l28)))))
                  (block $B76
                    (br_if $B76
                      (local.get $l36))
                    (local.set $p11
                      (i32.const 0))
                    (block $B77
                      (br_if $B77
                        (i32.lt_u
                          (local.get $l24)
                          (i32.const 4)))
                      (local.set $l53
                        (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                      (local.set $p13
                        (local.get $l19))
                      (local.set $p11
                        (local.get $l38))
                      (loop $L78
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
                                            (local.tee $l54
                                              (i32x4.add
                                                (local.get $l53)
                                                (local.get $l52))))
                                          (i32.const 16)))
                                      (i32.rem_s
                                        (i32x4.extract_lane 1
                                          (local.get $l54))
                                        (i32.const 16)))
                                    (i32.rem_s
                                      (i32x4.extract_lane 2
                                        (local.get $l54))
                                      (i32.const 16)))
                                  (i32.rem_s
                                    (i32x4.extract_lane 3
                                      (local.get $l54))
                                    (i32.const 16)))
                                (local.get $l40))
                              (i32.const 2))))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 16)))
                        (local.set $l53
                          (i32x4.add
                            (local.get $l53)
                            (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                        (br_if $L78
                          (local.tee $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const -4)))))
                      (local.set $p11
                        (local.get $l38))
                      (br_if $B76
                        (i32.eq
                          (local.get $l24)
                          (local.get $l38))))
                    (local.set $p13
                      (i32.add
                        (local.get $l31)
                        (local.get $p11)))
                    (local.set $p10
                      (i32.sub
                        (local.get $l24)
                        (local.get $p11)))
                    (local.set $p11
                      (i32.add
                        (local.get $l19)
                        (i32.shl
                          (local.get $p11)
                          (i32.const 2))))
                    (loop $L79
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
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 1)))
                      (local.set $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const 4)))
                      (br_if $L79
                        (local.tee $p10
                          (i32.add
                            (local.get $p10)
                            (i32.const -1))))))
                  (call $blur_rows
                    (i32.add
                      (local.get $l19)
                      (i32.const 32))
                    (i32.const 0)
                    (i32.const 1)
                    (local.get $l19)
                    (local.get $l39)
                    (local.get $p0)
                    (local.get $l26)
                    (local.get $l27)
                    (local.get $p8)))
                (block $B80
                  (br_if $B80
                    (i32.eqz
                      (local.tee $p9
                        (i32.load offset=12
                          (local.get $l28)))))
                  (block $B81
                    (br_if $B81
                      (local.get $l36))
                    (local.set $p11
                      (i32.const 0))
                    (block $B82
                      (br_if $B82
                        (i32.lt_u
                          (local.get $l24)
                          (i32.const 4)))
                      (local.set $l53
                        (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                      (local.set $p13
                        (local.get $l19))
                      (local.set $p11
                        (local.get $l38))
                      (loop $L83
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
                                            (local.tee $l54
                                              (i32x4.add
                                                (local.get $l53)
                                                (local.get $l52))))
                                          (i32.const 16)))
                                      (i32.rem_s
                                        (i32x4.extract_lane 1
                                          (local.get $l54))
                                        (i32.const 16)))
                                    (i32.rem_s
                                      (i32x4.extract_lane 2
                                        (local.get $l54))
                                      (i32.const 16)))
                                  (i32.rem_s
                                    (i32x4.extract_lane 3
                                      (local.get $l54))
                                    (i32.const 16)))
                                (local.get $l40))
                              (i32.const 2))))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 16)))
                        (local.set $l53
                          (i32x4.add
                            (local.get $l53)
                            (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                        (br_if $L83
                          (local.tee $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const -4)))))
                      (local.set $p11
                        (local.get $l38))
                      (br_if $B81
                        (i32.eq
                          (local.get $l24)
                          (local.get $l38))))
                    (local.set $p13
                      (i32.add
                        (local.get $l31)
                        (local.get $p11)))
                    (local.set $p10
                      (i32.sub
                        (local.get $l24)
                        (local.get $p11)))
                    (local.set $p11
                      (i32.add
                        (local.get $l19)
                        (i32.shl
                          (local.get $p11)
                          (i32.const 2))))
                    (loop $L84
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
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 1)))
                      (local.set $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const 4)))
                      (br_if $L84
                        (local.tee $p10
                          (i32.add
                            (local.get $p10)
                            (i32.const -1))))))
                  (call $blur_rows
                    (i32.add
                      (local.get $l19)
                      (i32.const 16))
                    (i32.const 0)
                    (i32.const 1)
                    (local.get $l19)
                    (local.get $l39)
                    (local.get $p0)
                    (local.get $l26)
                    (local.get $l27)
                    (local.get $p8)))
                (br_if $B48
                  (i32.eqz
                    (local.tee $p9
                      (i32.load offset=16
                        (local.get $l28)))))
                (block $B85
                  (br_if $B85
                    (local.get $l36))
                  (local.set $p11
                    (i32.const 0))
                  (block $B86
                    (br_if $B86
                      (i32.lt_u
                        (local.get $l24)
                        (i32.const 4)))
                    (local.set $l53
                      (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                    (local.set $p13
                      (local.get $l19))
                    (local.set $p11
                      (local.get $l38))
                    (loop $L87
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
                                          (local.tee $l54
                                            (i32x4.add
                                              (local.get $l53)
                                              (local.get $l52))))
                                        (i32.const 16)))
                                    (i32.rem_s
                                      (i32x4.extract_lane 1
                                        (local.get $l54))
                                      (i32.const 16)))
                                  (i32.rem_s
                                    (i32x4.extract_lane 2
                                      (local.get $l54))
                                    (i32.const 16)))
                                (i32.rem_s
                                  (i32x4.extract_lane 3
                                    (local.get $l54))
                                  (i32.const 16)))
                              (local.get $l40))
                            (i32.const 2))))
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 16)))
                      (local.set $l53
                        (i32x4.add
                          (local.get $l53)
                          (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                      (br_if $L87
                        (local.tee $p11
                          (i32.add
                            (local.get $p11)
                            (i32.const -4)))))
                    (local.set $p11
                      (local.get $l38))
                    (br_if $B85
                      (i32.eq
                        (local.get $l24)
                        (local.get $l38))))
                  (local.set $p13
                    (i32.add
                      (local.get $l31)
                      (local.get $p11)))
                  (local.set $p10
                    (i32.sub
                      (local.get $l24)
                      (local.get $p11)))
                  (local.set $p11
                    (i32.add
                      (local.get $l19)
                      (i32.shl
                        (local.get $p11)
                        (i32.const 2))))
                  (loop $L88
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
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 1)))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const 4)))
                    (br_if $L88
                      (local.tee $p10
                        (i32.add
                          (local.get $p10)
                          (i32.const -1))))))
                (call $blur_rows
                  (i32.add
                    (local.get $l19)
                    (i32.const 32))
                  (i32.add
                    (local.get $l19)
                    (i32.const 16))
                  (i32.const 0)
                  (local.get $l19)
                  (local.get $l39)
                  (local.get $p0)
                  (local.get $l26)
                  (local.get $l27)
                  (local.get $p8)))
              (br_if $L47
                (i32.ne
                  (local.tee $l22
                    (i32.add
                      (local.get $l22)
                      (i32.const 1)))
                  (i32.const 3))))
            (br_if $B41
              (i32.ge_s
                (local.tee $l31
                  (i32.add
                    (local.get $l39)
                    (local.get $l31)))
                (local.get $p1)))
            (br_if $L42
              (i32.le_s
                (local.get $l31)
                (local.get $l51)))))
        (local.set $p13
          (i32.mul
            (i32.and
              (i32.add
                (local.get $p3)
                (i32.const 10))
              (i32.const 15))
            (local.get $p0)))
        (local.set $l32
          (i32.const -1))
        (block $B89
          (br_if $B89
            (i32.ge_s
              (local.get $l51)
              (local.get $p1)))
          (local.set $l32
            (i32.mul
              (i32.rem_s
                (local.get $l51)
                (i32.const 16))
              (local.get $p0))))
        (local.set $l55
          (i32.mul
            (local.get $l43)
            (local.get $l50)))
        (local.set $l56
          (i32.add
            (local.get $l48)
            (local.tee $p11
              (i32.mul
                (local.get $l35)
                (local.get $l50)))))
        (local.set $l57
          (i32.add
            (local.get $l46)
            (local.get $p11)))
        (local.set $l21
          (select
            (local.get $p13)
            (i32.const -1)
            (i32.gt_s
              (local.get $p3)
              (i32.const 5))))
        (local.set $l58
          (i32.mul
            (local.get $p3)
            (local.get $p0)))
        (local.set $l59
          (i32.mul
            (i32.and
              (local.get $p3)
              (i32.const 15))
            (local.get $p0)))
        (local.set $p4
          (i32.shr_u
            (i32.xor
              (local.get $p3)
              (i32.const -1))
            (i32.const 31)))
        (local.set $p13
          (i32.const 0))
        (loop $L90
          (block $B91
            (br_if $B91
              (i32.eqz
                (i32.and
                  (local.tee $p9
                    (i32.shl
                      (i32.const 1)
                      (local.get $p13)))
                  (local.get $p2))))
            (local.set $l28
              (i32.add
                (i32.add
                  (local.get $l19)
                  (i32.const 48))
                (local.tee $p11
                  (i32.mul
                    (local.get $p13)
                    (i32.const 20)))))
            (local.set $p10
              (i32.add
                (i32.add
                  (local.get $l19)
                  (i32.const 112))
                (local.get $p11)))
            (block $B92
              (br_if $B92
                (i32.eqz
                  (local.tee $l34
                    (i32.load
                      (local.tee $p11
                        (i32.add
                          (i32.add
                            (local.get $l19)
                            (i32.const 176))
                          (local.get $p11)))))))
              (call $vertical_row
                (local.get $l34)
                (i32.load
                  (local.get $p10))
                (i32.load
                  (local.get $l28))
                (local.get $p0)
                (local.get $l21)
                (local.get $l32)
                (local.get $p4)
                (local.get $p8)))
            (block $B93
              (br_if $B93
                (i32.eqz
                  (local.tee $l34
                    (i32.load offset=4
                      (local.get $p11)))))
              (call $vertical_row
                (local.get $l34)
                (i32.load offset=4
                  (local.get $p10))
                (i32.load offset=4
                  (local.get $l28))
                (local.get $p0)
                (local.get $l21)
                (local.get $l32)
                (local.get $p4)
                (local.get $p8)))
            (block $B94
              (br_if $B94
                (i32.eqz
                  (local.tee $l34
                    (i32.load offset=8
                      (local.get $p11)))))
              (call $vertical_row
                (local.get $l34)
                (i32.load offset=8
                  (local.get $p10))
                (i32.load offset=8
                  (local.get $l28))
                (local.get $p0)
                (local.get $l21)
                (local.get $l32)
                (local.get $p4)
                (local.get $p8)))
            (block $B95
              (br_if $B95
                (i32.eqz
                  (local.tee $l34
                    (i32.load offset=12
                      (local.get $p11)))))
              (call $vertical_row
                (local.get $l34)
                (i32.load offset=12
                  (local.get $p10))
                (i32.load offset=12
                  (local.get $l28))
                (local.get $p0)
                (local.get $l21)
                (local.get $l32)
                (local.get $p4)
                (local.get $p8)))
            (block $B96
              (br_if $B96
                (i32.eqz
                  (local.tee $p11
                    (i32.load offset=16
                      (local.get $p11)))))
              (call $vertical_row
                (local.get $p11)
                (i32.load offset=16
                  (local.get $p10))
                (i32.load offset=16
                  (local.get $l28))
                (local.get $p0)
                (local.get $l21)
                (local.get $l32)
                (local.get $p4)
                (local.get $p8)))
            (br_if $B91
              (i32.lt_s
                (local.get $p3)
                (i32.const 0)))
            (local.set $l22
              (i32.load
                (i32.add
                  (i32.add
                    (local.get $l19)
                    (i32.const 260))
                  (local.tee $l51
                    (i32.shl
                      (local.get $p13)
                      (i32.const 2))))))
            (block $B97
              (block $B98
                (br_if $B98
                  (i32.and
                    (local.get $p9)
                    (local.get $p12)))
                (block $B99
                  (br_if $B99
                    (i32.eqz
                      (local.get $l22)))
                  (br_if $B99
                    (i32.lt_s
                      (local.get $p0)
                      (i32.const 1)))
                  (local.set $p9
                    (i32.load offset=8
                      (local.get $l28)))
                  (local.set $p10
                    (i32.load
                      (local.get $l28)))
                  (local.set $l24
                    (i32.const 0))
                  (block $B100
                    (br_if $B100
                      (i32.lt_u
                        (local.get $p0)
                        (i32.const 12)))
                    (br_if $B100
                      (local.get $l45))
                    (br_if $B100
                      (i32.gt_u
                        (i32.sub
                          (local.get $p10)
                          (i32.add
                            (local.get $l57)
                            (local.get $l22)))
                        (i32.const -16)))
                    (br_if $B100
                      (i32.gt_u
                        (i32.sub
                          (i32.add
                            (local.get $l46)
                            (local.get $l22))
                          (i32.add
                            (local.get $l55)
                            (local.get $p9)))
                        (i32.const -16)))
                    (br_if $B100
                      (i32.gt_u
                        (i32.sub
                          (local.get $p10)
                          (local.tee $p11
                            (i32.add
                              (local.get $l56)
                              (local.get $l22))))
                        (i32.const -16)))
                    (br_if $B100
                      (i32.gt_u
                        (i32.sub
                          (local.get $p9)
                          (local.get $p11))
                        (i32.const -16)))
                    (local.set $p11
                      (i32.add
                        (local.get $l22)
                        (local.get $l47)))
                    (local.set $l34
                      (i32.add
                        (local.get $l22)
                        (local.get $l49)))
                    (local.set $l25
                      (local.get $p10))
                    (local.set $l24
                      (local.get $p9))
                    (local.set $l36
                      (local.get $l37))
                    (loop $L101
                      (v128.store align=4
                        (local.get $p11)
                        (v128.load align=4
                          (local.get $l25)))
                      (v128.store align=4
                        (local.get $l34)
                        (v128.load align=4
                          (local.get $l24)))
                      (local.set $l25
                        (i32.add
                          (local.get $l25)
                          (i32.const 16)))
                      (local.set $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const 16)))
                      (local.set $l24
                        (i32.add
                          (local.get $l24)
                          (i32.const 16)))
                      (local.set $l34
                        (i32.add
                          (local.get $l34)
                          (i32.const 16)))
                      (br_if $L101
                        (local.tee $l36
                          (i32.add
                            (local.get $l36)
                            (i32.const -4)))))
                    (local.set $l24
                      (local.get $l37))
                    (br_if $B99
                      (i32.eq
                        (local.get $p0)
                        (local.get $l37))))
                  (local.set $p11
                    (i32.or
                      (local.get $l24)
                      (i32.const 1)))
                  (block $B102
                    (br_if $B102
                      (i32.eqz
                        (local.get $l41)))
                    (f32.store
                      (i32.add
                        (i32.add
                          (i32.add
                            (local.get $l22)
                            (local.get $l44))
                          (local.tee $l25
                            (i32.shl
                              (local.get $l58)
                              (i32.const 2))))
                        (local.tee $l34
                          (i32.shl
                            (local.get $l24)
                            (i32.const 2))))
                      (f32.load
                        (i32.add
                          (local.get $p10)
                          (local.get $l34))))
                    (f32.store
                      (i32.add
                        (i32.add
                          (i32.add
                            (local.get $l22)
                            (local.get $l42))
                          (local.get $l25))
                        (local.get $l34))
                      (f32.load
                        (i32.add
                          (local.get $p9)
                          (local.get $l34))))
                    (local.set $l24
                      (local.get $p11)))
                  (br_if $B99
                    (i32.eq
                      (local.get $p0)
                      (local.get $p11)))
                  (local.set $l34
                    (i32.add
                      (local.get $l22)
                      (local.get $l49)))
                  (local.set $l25
                    (i32.add
                      (local.get $l22)
                      (local.get $l47)))
                  (local.set $p11
                    (i32.shl
                      (local.get $l24)
                      (i32.const 2)))
                  (local.set $l24
                    (i32.sub
                      (local.get $p0)
                      (local.get $l24)))
                  (loop $L103
                    (f32.store
                      (local.tee $l22
                        (i32.add
                          (local.get $l25)
                          (local.get $p11)))
                      (f32.load
                        (local.tee $l36
                          (i32.add
                            (local.get $p10)
                            (local.get $p11)))))
                    (f32.store
                      (local.tee $l38
                        (i32.add
                          (local.get $l34)
                          (local.get $p11)))
                      (f32.load
                        (local.tee $l39
                          (i32.add
                            (local.get $p9)
                            (local.get $p11)))))
                    (f32.store
                      (i32.add
                        (local.get $l22)
                        (i32.const 4))
                      (f32.load
                        (i32.add
                          (local.get $l36)
                          (i32.const 4))))
                    (f32.store
                      (i32.add
                        (local.get $l38)
                        (i32.const 4))
                      (f32.load
                        (i32.add
                          (local.get $l39)
                          (i32.const 4))))
                    (local.set $l34
                      (i32.add
                        (local.get $l34)
                        (i32.const 8)))
                    (local.set $p9
                      (i32.add
                        (local.get $p9)
                        (i32.const 8)))
                    (local.set $l25
                      (i32.add
                        (local.get $l25)
                        (i32.const 8)))
                    (local.set $p10
                      (i32.add
                        (local.get $p10)
                        (i32.const 8)))
                    (br_if $L103
                      (local.tee $l24
                        (i32.add
                          (local.get $l24)
                          (i32.const -2))))))
                (local.set $p11
                  (i32.add
                    (i32.load
                      (i32.add
                        (i32.add
                          (local.get $l19)
                          (i32.const 248))
                        (local.get $l51)))
                    (i32.shl
                      (local.get $l59)
                      (i32.const 2))))
                (local.set $l22
                  (i32.const 0))
                (br $B97))
              (local.set $p11
                (i32.add
                  (local.get $l22)
                  (i32.shl
                    (local.get $l58)
                    (i32.const 2)))))
            (call $row_sums
              (local.get $p11)
              (i32.add
                (i32.load
                  (i32.add
                    (i32.add
                      (local.get $l19)
                      (i32.const 236))
                    (local.get $l51)))
                (i32.shl
                  (local.get $l59)
                  (i32.const 2)))
              (local.get $l28)
              (local.get $l22)
              (local.get $p3)
              (local.get $p0)
              (local.get $p1)
              (i32.add
                (local.get $p16)
                (i32.mul
                  (local.get $p13)
                  (i32.const 48)))
              (local.get $p14)
              (local.get $p15)))
          (br_if $L90
            (i32.ne
              (local.tee $p13
                (i32.add
                  (local.get $p13)
                  (i32.const 1)))
              (i32.const 3))))
        (local.set $l47
          (i32.add
            (local.get $l47)
            (local.get $l35)))
        (local.set $l49
          (i32.add
            (local.get $l49)
            (local.get $l35)))
        (local.set $l50
          (i32.add
            (local.get $l50)
            (i32.const 1)))
        (br_if $L40
          (i32.ne
            (local.tee $p3
              (i32.add
                (local.get $p3)
                (i32.const 1)))
            (local.get $p1)))))
    (global.set $__stack_pointer
      (i32.add
        (local.get $l19)
        (i32.const 272))))
  (func $positive_row (type $t4) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32)
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
  (func $blur_rows (type $t5) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32)
    (local $l9 i32) (local $l10 i32) (local $l11 v128) (local $l12 i32) (local $l13 i32) (local $l14 i32) (local $l15 i32) (local $l16 i32) (local $l17 i32) (local $l18 i32) (local $l19 i32) (local $l20 i32) (local $l21 i32) (local $l22 i32) (local $l23 v128) (local $l24 v128) (local $l25 v128) (local $l26 v128) (local $l27 v128) (local $l28 i32) (local $l29 i32) (local $l30 i32) (local $l31 i32) (local $l32 i32) (local $l33 i32) (local $l34 f32) (local $l35 f32) (local $l36 f32) (local $l37 v128) (local $l38 f32) (local $l39 v128) (local $l40 v128) (local $l41 v128) (local $l42 v128) (local $l43 v128) (local $l44 v128) (local $l45 v128) (local $l46 v128) (local $l47 v128) (local $l48 v128) (local $l49 v128) (local $l50 v128) (local $l51 v128) (local $l52 v128) (local $l53 v128) (local $l54 v128) (local $l55 v128) (local $l56 v128) (local $l57 v128) (local $l58 v128) (local $l59 v128)
    (global.set $__stack_pointer
      (local.tee $l9
        (i32.sub
          (global.get $__stack_pointer)
          (i32.const 1456))))
    (local.set $l10
      (i32.const 0))
    (block $B0
      (br_if $B0
        (i32.lt_s
          (local.get $p5)
          (i32.const 4)))
      (local.set $l13
        (i32.add
          (local.get $p0)
          (local.tee $l12
            (i32.shl
              (i32x4.extract_lane 3
                (local.tee $l11
                  (i32x4.min_s
                    (i32x4.splat
                      (i32.add
                        (local.get $p4)
                        (i32.const -1)))
                    (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))))
              (i32.const 2)))))
      (local.set $l15
        (i32.add
          (local.get $p0)
          (local.tee $l14
            (i32.shl
              (i32x4.extract_lane 2
                (local.get $l11))
              (i32.const 2)))))
      (local.set $l17
        (i32.add
          (local.get $p0)
          (local.tee $l16
            (i32.shl
              (i32x4.extract_lane 1
                (local.get $l11))
              (i32.const 2)))))
      (local.set $l18
        (i32.add
          (local.get $p0)
          (local.tee $l10
            (i32.shl
              (i32x4.extract_lane 0
                (local.get $l11))
              (i32.const 2)))))
      (local.set $l19
        (i32.add
          (local.get $p1)
          (local.get $l12)))
      (local.set $l20
        (i32.add
          (local.get $p1)
          (local.get $l14)))
      (local.set $l21
        (i32.add
          (local.get $p1)
          (local.get $l16)))
      (local.set $l22
        (i32.add
          (local.get $p1)
          (local.get $l10)))
      (local.set $l10
        (i32.const 0))
      (local.set $l12
        (i32.const 0))
      (local.set $l14
        (local.get $p6))
      (loop $L1
        (local.set $l16
          (local.get $l10))
        (block $B2
          (block $B3
            (br_if $B3
              (i32.eqz
                (local.get $p1)))
            (local.set $l11
              (f32x4.mul
                (v128.load align=1
                  (i32.add
                    (i32.load
                      (local.get $l13))
                    (local.get $l12)))
                (v128.load align=1
                  (i32.add
                    (i32.load
                      (local.get $l19))
                    (local.get $l12)))))
            (local.set $l23
              (f32x4.mul
                (v128.load align=1
                  (i32.add
                    (i32.load
                      (local.get $l15))
                    (local.get $l12)))
                (v128.load align=1
                  (i32.add
                    (i32.load
                      (local.get $l20))
                    (local.get $l12)))))
            (local.set $l24
              (f32x4.mul
                (v128.load align=1
                  (i32.add
                    (i32.load
                      (local.get $l17))
                    (local.get $l12)))
                (v128.load align=1
                  (i32.add
                    (i32.load
                      (local.get $l21))
                    (local.get $l12)))))
            (local.set $l25
              (f32x4.mul
                (v128.load align=1
                  (i32.add
                    (i32.load
                      (local.get $l18))
                    (local.get $l12)))
                (v128.load align=1
                  (i32.add
                    (i32.load
                      (local.get $l22))
                    (local.get $l12)))))
            (br $B2))
          (block $B4
            (br_if $B4
              (i32.eqz
                (local.get $p2)))
            (local.set $l11
              (f32x4.mul
                (local.tee $l11
                  (v128.load align=1
                    (i32.add
                      (i32.load
                        (local.get $l13))
                      (local.get $l12))))
                (local.get $l11)))
            (local.set $l23
              (f32x4.mul
                (local.tee $l23
                  (v128.load align=1
                    (i32.add
                      (i32.load
                        (local.get $l15))
                      (local.get $l12))))
                (local.get $l23)))
            (local.set $l24
              (f32x4.mul
                (local.tee $l24
                  (v128.load align=1
                    (i32.add
                      (i32.load
                        (local.get $l17))
                      (local.get $l12))))
                (local.get $l24)))
            (local.set $l25
              (f32x4.mul
                (local.tee $l25
                  (v128.load align=1
                    (i32.add
                      (i32.load
                        (local.get $l18))
                      (local.get $l12))))
                (local.get $l25)))
            (br $B2))
          (local.set $l11
            (v128.load align=1
              (i32.add
                (i32.load
                  (local.get $l13))
                (local.get $l12))))
          (local.set $l23
            (v128.load align=1
              (i32.add
                (i32.load
                  (local.get $l15))
                (local.get $l12))))
          (local.set $l24
            (v128.load align=1
              (i32.add
                (i32.load
                  (local.get $l17))
                (local.get $l12))))
          (local.set $l25
            (v128.load align=1
              (i32.add
                (i32.load
                  (local.get $l18))
                (local.get $l12)))))
        (v128.store align=1
          (i32.add
            (local.get $l14)
            (i32.const 48))
          (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
            (local.tee $l26
              (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                (local.get $l25)
                (local.get $l24)))
            (local.tee $l27
              (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                (local.get $l23)
                (local.get $l11)))))
        (v128.store align=1
          (i32.add
            (local.get $l14)
            (i32.const 32))
          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
            (local.get $l26)
            (local.get $l27)))
        (v128.store align=1
          (i32.add
            (local.get $l14)
            (i32.const 16))
          (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
            (local.tee $l24
              (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                (local.get $l25)
                (local.get $l24)))
            (local.tee $l11
              (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                (local.get $l23)
                (local.get $l11)))))
        (v128.store align=1
          (local.get $l14)
          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
            (local.get $l24)
            (local.get $l11)))
        (local.set $l12
          (i32.add
            (local.get $l12)
            (i32.const 16)))
        (local.set $l14
          (i32.add
            (local.get $l14)
            (i32.const 64)))
        (local.set $l10
          (i32.add
            (local.get $l16)
            (i32.const 4)))
        (br_if $L1
          (i32.le_s
            (i32.add
              (local.get $l16)
              (i32.const 8))
            (local.get $p5)))))
    (block $B5
      (br_if $B5
        (i32.le_s
          (local.get $p5)
          (local.get $l10)))
      (local.set $l12
        (i32.add
          (local.get $p4)
          (i32.const -1)))
      (block $B6
        (br_if $B6
          (i32.eqz
            (local.get $p1)))
        (local.set $l20
          (i32.load
            (i32.add
              (local.get $p1)
              (local.tee $l12
                (i32.shl
                  (i32x4.extract_lane 3
                    (local.tee $l11
                      (i32x4.min_s
                        (i32x4.splat
                          (local.get $l12))
                        (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))))
                  (i32.const 2))))))
        (local.set $l19
          (i32.load
            (i32.add
              (local.get $p0)
              (local.get $l12))))
        (local.set $l18
          (i32.load
            (i32.add
              (local.get $p1)
              (local.tee $l12
                (i32.shl
                  (i32x4.extract_lane 2
                    (local.get $l11))
                  (i32.const 2))))))
        (local.set $l17
          (i32.load
            (i32.add
              (local.get $p0)
              (local.get $l12))))
        (local.set $l15
          (i32.load
            (i32.add
              (local.get $p1)
              (local.tee $l12
                (i32.shl
                  (i32x4.extract_lane 1
                    (local.get $l11))
                  (i32.const 2))))))
        (local.set $l13
          (i32.load
            (i32.add
              (local.get $p0)
              (local.get $l12))))
        (local.set $p1
          (i32.load
            (i32.add
              (local.get $p1)
              (local.tee $l12
                (i32.shl
                  (i32x4.extract_lane 0
                    (local.get $l11))
                  (i32.const 2))))))
        (local.set $l16
          (i32.load
            (i32.add
              (local.get $p0)
              (local.get $l12))))
        (block $B7
          (br_if $B7
            (i32.lt_u
              (local.tee $p2
                (i32.sub
                  (local.get $p5)
                  (local.get $l10)))
              (i32.const 24)))
          (br_if $B7
            (i32.and
              (i32.lt_u
                (local.tee $l12
                  (i32.add
                    (local.get $p6)
                    (i32.shl
                      (local.get $l10)
                      (i32.const 4))))
                (i32.add
                  (local.get $l16)
                  (local.tee $l14
                    (i32.shl
                      (local.get $p5)
                      (i32.const 2)))))
              (i32.lt_u
                (i32.add
                  (local.get $l16)
                  (local.tee $l21
                    (i32.shl
                      (local.get $l10)
                      (i32.const 2))))
                (local.tee $l22
                  (i32.add
                    (local.get $p6)
                    (i32.shl
                      (local.get $p5)
                      (i32.const 4)))))))
          (br_if $B7
            (i32.and
              (i32.lt_u
                (local.get $l12)
                (i32.add
                  (local.get $p1)
                  (local.get $l14)))
              (i32.lt_u
                (i32.add
                  (local.get $p1)
                  (local.get $l21))
                (local.get $l22))))
          (br_if $B7
            (i32.and
              (i32.lt_u
                (local.get $l12)
                (i32.add
                  (local.get $l13)
                  (local.get $l14)))
              (i32.lt_u
                (i32.add
                  (local.get $l13)
                  (local.get $l21))
                (local.get $l22))))
          (br_if $B7
            (i32.and
              (i32.lt_u
                (local.get $l12)
                (i32.add
                  (local.get $l15)
                  (local.get $l14)))
              (i32.lt_u
                (i32.add
                  (local.get $l15)
                  (local.get $l21))
                (local.get $l22))))
          (br_if $B7
            (i32.and
              (i32.lt_u
                (local.get $l12)
                (i32.add
                  (local.get $l17)
                  (local.get $l14)))
              (i32.lt_u
                (i32.add
                  (local.get $l17)
                  (local.get $l21))
                (local.get $l22))))
          (br_if $B7
            (i32.and
              (i32.lt_u
                (local.get $l12)
                (i32.add
                  (local.get $l18)
                  (local.get $l14)))
              (i32.lt_u
                (i32.add
                  (local.get $l18)
                  (local.get $l21))
                (local.get $l22))))
          (br_if $B7
            (i32.and
              (i32.lt_u
                (local.get $l12)
                (i32.add
                  (local.get $l19)
                  (local.get $l14)))
              (i32.lt_u
                (i32.add
                  (local.get $l19)
                  (local.get $l21))
                (local.get $l22))))
          (br_if $B7
            (i32.and
              (i32.lt_u
                (local.get $l12)
                (i32.add
                  (local.get $l20)
                  (local.get $l14)))
              (i32.lt_u
                (i32.add
                  (local.get $l20)
                  (local.get $l21))
                (local.get $l22))))
          (local.set $l12
            (i32.shl
              (local.get $l10)
              (i32.const 2)))
          (local.set $l14
            (i32.add
              (local.get $p6)
              (i32.shl
                (local.get $l10)
                (i32.const 4))))
          (local.set $l29
            (i32.sub
              (i32.add
                (local.get $l10)
                (local.tee $l28
                  (i32.and
                    (local.get $p5)
                    (i32.const 3))))
              (local.get $p5)))
          (local.set $l10
            (i32.add
              (local.get $l10)
              (i32.sub
                (local.get $p2)
                (local.get $l28))))
          (local.set $l21
            (local.get $l16))
          (local.set $l22
            (local.get $p1))
          (local.set $p2
            (local.get $l13))
          (local.set $p0
            (local.get $l15))
          (local.set $l30
            (local.get $l17))
          (local.set $l31
            (local.get $l18))
          (local.set $l32
            (local.get $l19))
          (local.set $l33
            (local.get $l20))
          (loop $L8
            (v128.store offset=48 align=4
              (local.get $l14)
              (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                (i8x16.shuffle 12 13 14 15 28 29 30 31 0 1 2 3 0 1 2 3
                  (local.tee $l11
                    (f32x4.mul
                      (v128.load align=4
                        (i32.add
                          (local.get $l21)
                          (local.get $l12)))
                      (v128.load align=4
                        (i32.add
                          (local.get $l22)
                          (local.get $l12)))))
                  (local.tee $l23
                    (f32x4.mul
                      (v128.load align=4
                        (i32.add
                          (local.get $p2)
                          (local.get $l12)))
                      (v128.load align=4
                        (i32.add
                          (local.get $p0)
                          (local.get $l12))))))
                (i8x16.shuffle 0 1 2 3 0 1 2 3 12 13 14 15 28 29 30 31
                  (local.tee $l24
                    (f32x4.mul
                      (v128.load align=4
                        (i32.add
                          (local.get $l30)
                          (local.get $l12)))
                      (v128.load align=4
                        (i32.add
                          (local.get $l31)
                          (local.get $l12)))))
                  (local.tee $l25
                    (f32x4.mul
                      (v128.load align=4
                        (i32.add
                          (local.get $l32)
                          (local.get $l12)))
                      (v128.load align=4
                        (i32.add
                          (local.get $l33)
                          (local.get $l12))))))))
            (v128.store offset=32 align=4
              (local.get $l14)
              (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                (i8x16.shuffle 8 9 10 11 24 25 26 27 0 1 2 3 0 1 2 3
                  (local.get $l11)
                  (local.get $l23))
                (i8x16.shuffle 0 1 2 3 0 1 2 3 8 9 10 11 24 25 26 27
                  (local.get $l24)
                  (local.get $l25))))
            (v128.store offset=16 align=4
              (local.get $l14)
              (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                (i8x16.shuffle 4 5 6 7 20 21 22 23 0 1 2 3 0 1 2 3
                  (local.get $l11)
                  (local.get $l23))
                (i8x16.shuffle 0 1 2 3 0 1 2 3 4 5 6 7 20 21 22 23
                  (local.get $l24)
                  (local.get $l25))))
            (v128.store align=4
              (local.get $l14)
              (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                (i8x16.shuffle 0 1 2 3 16 17 18 19 0 1 2 3 0 1 2 3
                  (local.get $l11)
                  (local.get $l23))
                (i8x16.shuffle 0 1 2 3 0 1 2 3 0 1 2 3 16 17 18 19
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l14
              (i32.add
                (local.get $l14)
                (i32.const 64)))
            (local.set $l21
              (i32.add
                (local.get $l21)
                (i32.const 16)))
            (local.set $l22
              (i32.add
                (local.get $l22)
                (i32.const 16)))
            (local.set $p2
              (i32.add
                (local.get $p2)
                (i32.const 16)))
            (local.set $p0
              (i32.add
                (local.get $p0)
                (i32.const 16)))
            (local.set $l30
              (i32.add
                (local.get $l30)
                (i32.const 16)))
            (local.set $l31
              (i32.add
                (local.get $l31)
                (i32.const 16)))
            (local.set $l32
              (i32.add
                (local.get $l32)
                (i32.const 16)))
            (local.set $l33
              (i32.add
                (local.get $l33)
                (i32.const 16)))
            (br_if $L8
              (local.tee $l29
                (i32.add
                  (local.get $l29)
                  (i32.const 4)))))
          (br_if $B5
            (i32.eqz
              (local.get $l28))))
        (local.set $l21
          (i32.sub
            (local.get $p5)
            (local.get $l10)))
        (local.set $l12
          (i32.shl
            (local.get $l10)
            (i32.const 2)))
        (local.set $l14
          (i32.add
            (local.get $p6)
            (i32.shl
              (local.get $l10)
              (i32.const 4))))
        (loop $L9
          (f32.store
            (local.get $l14)
            (f32.mul
              (f32.load
                (i32.add
                  (local.get $l16)
                  (local.get $l12)))
              (f32.load
                (i32.add
                  (local.get $p1)
                  (local.get $l12)))))
          (f32.store
            (i32.add
              (local.get $l14)
              (i32.const 4))
            (f32.mul
              (f32.load
                (i32.add
                  (local.get $l13)
                  (local.get $l12)))
              (f32.load
                (i32.add
                  (local.get $l15)
                  (local.get $l12)))))
          (f32.store
            (i32.add
              (local.get $l14)
              (i32.const 8))
            (f32.mul
              (f32.load
                (i32.add
                  (local.get $l17)
                  (local.get $l12)))
              (f32.load
                (i32.add
                  (local.get $l18)
                  (local.get $l12)))))
          (f32.store
            (i32.add
              (local.get $l14)
              (i32.const 12))
            (f32.mul
              (f32.load
                (i32.add
                  (local.get $l19)
                  (local.get $l12)))
              (f32.load
                (i32.add
                  (local.get $l20)
                  (local.get $l12)))))
          (local.set $l14
            (i32.add
              (local.get $l14)
              (i32.const 16)))
          (local.set $l16
            (i32.add
              (local.get $l16)
              (i32.const 4)))
          (local.set $p1
            (i32.add
              (local.get $p1)
              (i32.const 4)))
          (local.set $l13
            (i32.add
              (local.get $l13)
              (i32.const 4)))
          (local.set $l15
            (i32.add
              (local.get $l15)
              (i32.const 4)))
          (local.set $l17
            (i32.add
              (local.get $l17)
              (i32.const 4)))
          (local.set $l18
            (i32.add
              (local.get $l18)
              (i32.const 4)))
          (local.set $l19
            (i32.add
              (local.get $l19)
              (i32.const 4)))
          (local.set $l20
            (i32.add
              (local.get $l20)
              (i32.const 4)))
          (br_if $L9
            (local.tee $l21
              (i32.add
                (local.get $l21)
                (i32.const -1))))
          (br $B5)))
      (local.set $l21
        (i32.sub
          (local.get $p5)
          (local.get $l10)))
      (local.set $l20
        (i32.load
          (i32.add
            (local.get $p0)
            (i32.shl
              (i32x4.extract_lane 3
                (local.tee $l11
                  (i32x4.min_s
                    (i32x4.splat
                      (local.get $l12))
                    (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))))
              (i32.const 2)))))
      (local.set $l19
        (i32.load
          (i32.add
            (local.get $p0)
            (i32.shl
              (i32x4.extract_lane 2
                (local.get $l11))
              (i32.const 2)))))
      (local.set $l18
        (i32.load
          (i32.add
            (local.get $p0)
            (i32.shl
              (i32x4.extract_lane 1
                (local.get $l11))
              (i32.const 2)))))
      (local.set $l17
        (i32.load
          (i32.add
            (local.get $p0)
            (i32.shl
              (i32x4.extract_lane 0
                (local.get $l11))
              (i32.const 2)))))
      (block $B10
        (br_if $B10
          (i32.eqz
            (local.get $p2)))
        (block $B11
          (br_if $B11
            (i32.lt_u
              (local.get $l21)
              (i32.const 16)))
          (br_if $B11
            (i32.and
              (i32.lt_u
                (local.tee $l12
                  (i32.add
                    (local.get $p6)
                    (i32.shl
                      (local.get $l10)
                      (i32.const 4))))
                (i32.add
                  (local.get $l17)
                  (local.tee $l14
                    (i32.shl
                      (local.get $p5)
                      (i32.const 2)))))
              (i32.lt_u
                (i32.add
                  (local.get $l17)
                  (local.tee $l16
                    (i32.shl
                      (local.get $l10)
                      (i32.const 2))))
                (local.tee $p1
                  (i32.add
                    (local.get $p6)
                    (i32.shl
                      (local.get $p5)
                      (i32.const 4)))))))
          (br_if $B11
            (i32.and
              (i32.lt_u
                (local.get $l12)
                (i32.add
                  (local.get $l18)
                  (local.get $l14)))
              (i32.lt_u
                (i32.add
                  (local.get $l18)
                  (local.get $l16))
                (local.get $p1))))
          (br_if $B11
            (i32.and
              (i32.lt_u
                (local.get $l12)
                (i32.add
                  (local.get $l19)
                  (local.get $l14)))
              (i32.lt_u
                (i32.add
                  (local.get $l19)
                  (local.get $l16))
                (local.get $p1))))
          (br_if $B11
            (i32.and
              (i32.lt_u
                (local.get $l12)
                (i32.add
                  (local.get $l20)
                  (local.get $l14)))
              (i32.lt_u
                (i32.add
                  (local.get $l20)
                  (local.get $l16))
                (local.get $p1))))
          (local.set $l12
            (i32.add
              (local.get $p6)
              (i32.shl
                (local.get $l10)
                (i32.const 4))))
          (local.set $l14
            (i32.add
              (local.get $l17)
              (local.tee $l13
                (i32.shl
                  (local.get $l10)
                  (i32.const 2)))))
          (local.set $l16
            (i32.add
              (local.get $l18)
              (local.get $l13)))
          (local.set $p1
            (i32.add
              (local.get $l19)
              (local.get $l13)))
          (local.set $l13
            (i32.add
              (local.get $l20)
              (local.get $l13)))
          (local.set $l15
            (i32.sub
              (i32.add
                (local.get $l10)
                (local.tee $l22
                  (i32.and
                    (local.get $p5)
                    (i32.const 3))))
              (local.get $p5)))
          (local.set $l10
            (i32.add
              (local.get $l10)
              (i32.sub
                (local.get $l21)
                (local.get $l22))))
          (loop $L12
            (v128.store offset=48 align=4
              (local.get $l12)
              (f32x4.mul
                (local.tee $l26
                  (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                    (i8x16.shuffle 12 13 14 15 28 29 30 31 0 1 2 3 0 1 2 3
                      (local.tee $l11
                        (v128.load align=4
                          (local.get $l14)))
                      (local.tee $l23
                        (v128.load align=4
                          (local.get $l16))))
                    (i8x16.shuffle 0 1 2 3 0 1 2 3 12 13 14 15 28 29 30 31
                      (local.tee $l24
                        (v128.load align=4
                          (local.get $p1)))
                      (local.tee $l25
                        (v128.load align=4
                          (local.get $l13))))))
                (local.get $l26)))
            (v128.store offset=32 align=4
              (local.get $l12)
              (f32x4.mul
                (local.tee $l26
                  (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                    (i8x16.shuffle 8 9 10 11 24 25 26 27 0 1 2 3 0 1 2 3
                      (local.get $l11)
                      (local.get $l23))
                    (i8x16.shuffle 0 1 2 3 0 1 2 3 8 9 10 11 24 25 26 27
                      (local.get $l24)
                      (local.get $l25))))
                (local.get $l26)))
            (v128.store offset=16 align=4
              (local.get $l12)
              (f32x4.mul
                (local.tee $l26
                  (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                    (i8x16.shuffle 4 5 6 7 20 21 22 23 0 1 2 3 0 1 2 3
                      (local.get $l11)
                      (local.get $l23))
                    (i8x16.shuffle 0 1 2 3 0 1 2 3 4 5 6 7 20 21 22 23
                      (local.get $l24)
                      (local.get $l25))))
                (local.get $l26)))
            (v128.store align=4
              (local.get $l12)
              (f32x4.mul
                (local.tee $l11
                  (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                    (i8x16.shuffle 0 1 2 3 16 17 18 19 0 1 2 3 0 1 2 3
                      (local.get $l11)
                      (local.get $l23))
                    (i8x16.shuffle 0 1 2 3 0 1 2 3 0 1 2 3 16 17 18 19
                      (local.get $l24)
                      (local.get $l25))))
                (local.get $l11)))
            (local.set $l12
              (i32.add
                (local.get $l12)
                (i32.const 64)))
            (local.set $l14
              (i32.add
                (local.get $l14)
                (i32.const 16)))
            (local.set $l16
              (i32.add
                (local.get $l16)
                (i32.const 16)))
            (local.set $p1
              (i32.add
                (local.get $p1)
                (i32.const 16)))
            (local.set $l13
              (i32.add
                (local.get $l13)
                (i32.const 16)))
            (br_if $L12
              (local.tee $l15
                (i32.add
                  (local.get $l15)
                  (i32.const 4)))))
          (br_if $B5
            (i32.eqz
              (local.get $l22))))
        (local.set $l13
          (i32.sub
            (local.get $p5)
            (local.get $l10)))
        (local.set $l12
          (i32.add
            (local.get $p6)
            (i32.shl
              (local.get $l10)
              (i32.const 4))))
        (local.set $l14
          (i32.add
            (local.get $l17)
            (local.tee $p1
              (i32.shl
                (local.get $l10)
                (i32.const 2)))))
        (local.set $l16
          (i32.add
            (local.get $l18)
            (local.get $p1)))
        (local.set $l10
          (i32.add
            (local.get $l19)
            (local.get $p1)))
        (local.set $p1
          (i32.add
            (local.get $l20)
            (local.get $p1)))
        (loop $L13
          (f32.store
            (local.get $l12)
            (f32.mul
              (local.tee $l34
                (f32.load
                  (local.get $l14)))
              (local.get $l34)))
          (f32.store
            (i32.add
              (local.get $l12)
              (i32.const 4))
            (f32.mul
              (local.tee $l34
                (f32.load
                  (local.get $l16)))
              (local.get $l34)))
          (f32.store
            (i32.add
              (local.get $l12)
              (i32.const 8))
            (f32.mul
              (local.tee $l34
                (f32.load
                  (local.get $l10)))
              (local.get $l34)))
          (f32.store
            (i32.add
              (local.get $l12)
              (i32.const 12))
            (f32.mul
              (local.tee $l34
                (f32.load
                  (local.get $p1)))
              (local.get $l34)))
          (local.set $l12
            (i32.add
              (local.get $l12)
              (i32.const 16)))
          (local.set $l14
            (i32.add
              (local.get $l14)
              (i32.const 4)))
          (local.set $l16
            (i32.add
              (local.get $l16)
              (i32.const 4)))
          (local.set $l10
            (i32.add
              (local.get $l10)
              (i32.const 4)))
          (local.set $p1
            (i32.add
              (local.get $p1)
              (i32.const 4)))
          (br_if $L13
            (local.tee $l13
              (i32.add
                (local.get $l13)
                (i32.const -1))))
          (br $B5)))
      (block $B14
        (br_if $B14
          (i32.lt_u
            (local.get $l21)
            (i32.const 60)))
        (br_if $B14
          (i32.and
            (i32.lt_u
              (local.tee $l12
                (i32.add
                  (local.get $p6)
                  (i32.shl
                    (local.get $l10)
                    (i32.const 4))))
              (i32.add
                (local.get $l17)
                (local.tee $l14
                  (i32.shl
                    (local.get $p5)
                    (i32.const 2)))))
            (i32.lt_u
              (i32.add
                (local.get $l17)
                (local.tee $l16
                  (i32.shl
                    (local.get $l10)
                    (i32.const 2))))
              (local.tee $p1
                (i32.add
                  (local.get $p6)
                  (i32.shl
                    (local.get $p5)
                    (i32.const 4)))))))
        (br_if $B14
          (i32.and
            (i32.lt_u
              (local.get $l12)
              (i32.add
                (local.get $l18)
                (local.get $l14)))
            (i32.lt_u
              (i32.add
                (local.get $l18)
                (local.get $l16))
              (local.get $p1))))
        (br_if $B14
          (i32.and
            (i32.lt_u
              (local.get $l12)
              (i32.add
                (local.get $l19)
                (local.get $l14)))
            (i32.lt_u
              (i32.add
                (local.get $l19)
                (local.get $l16))
              (local.get $p1))))
        (br_if $B14
          (i32.and
            (i32.lt_u
              (local.get $l12)
              (i32.add
                (local.get $l20)
                (local.get $l14)))
            (i32.lt_u
              (i32.add
                (local.get $l20)
                (local.get $l16))
              (local.get $p1))))
        (local.set $l12
          (i32.add
            (local.get $p6)
            (i32.shl
              (local.get $l10)
              (i32.const 4))))
        (local.set $l14
          (i32.add
            (local.get $l17)
            (local.tee $l13
              (i32.shl
                (local.get $l10)
                (i32.const 2)))))
        (local.set $l16
          (i32.add
            (local.get $l18)
            (local.get $l13)))
        (local.set $p1
          (i32.add
            (local.get $l19)
            (local.get $l13)))
        (local.set $l13
          (i32.add
            (local.get $l20)
            (local.get $l13)))
        (local.set $l15
          (i32.sub
            (i32.add
              (local.get $l10)
              (local.tee $l22
                (i32.and
                  (local.get $p5)
                  (i32.const 3))))
            (local.get $p5)))
        (local.set $l10
          (i32.add
            (local.get $l10)
            (i32.sub
              (local.get $l21)
              (local.get $l22))))
        (loop $L15
          (v128.store offset=48 align=4
            (local.get $l12)
            (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
              (i8x16.shuffle 12 13 14 15 28 29 30 31 0 1 2 3 0 1 2 3
                (local.tee $l11
                  (v128.load align=4
                    (local.get $l14)))
                (local.tee $l23
                  (v128.load align=4
                    (local.get $l16))))
              (i8x16.shuffle 0 1 2 3 0 1 2 3 12 13 14 15 28 29 30 31
                (local.tee $l24
                  (v128.load align=4
                    (local.get $p1)))
                (local.tee $l25
                  (v128.load align=4
                    (local.get $l13))))))
          (v128.store offset=32 align=4
            (local.get $l12)
            (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
              (i8x16.shuffle 8 9 10 11 24 25 26 27 0 1 2 3 0 1 2 3
                (local.get $l11)
                (local.get $l23))
              (i8x16.shuffle 0 1 2 3 0 1 2 3 8 9 10 11 24 25 26 27
                (local.get $l24)
                (local.get $l25))))
          (v128.store offset=16 align=4
            (local.get $l12)
            (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
              (i8x16.shuffle 4 5 6 7 20 21 22 23 0 1 2 3 0 1 2 3
                (local.get $l11)
                (local.get $l23))
              (i8x16.shuffle 0 1 2 3 0 1 2 3 4 5 6 7 20 21 22 23
                (local.get $l24)
                (local.get $l25))))
          (v128.store align=4
            (local.get $l12)
            (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
              (i8x16.shuffle 0 1 2 3 16 17 18 19 0 1 2 3 0 1 2 3
                (local.get $l11)
                (local.get $l23))
              (i8x16.shuffle 0 1 2 3 0 1 2 3 0 1 2 3 16 17 18 19
                (local.get $l24)
                (local.get $l25))))
          (local.set $l12
            (i32.add
              (local.get $l12)
              (i32.const 64)))
          (local.set $l14
            (i32.add
              (local.get $l14)
              (i32.const 16)))
          (local.set $l16
            (i32.add
              (local.get $l16)
              (i32.const 16)))
          (local.set $p1
            (i32.add
              (local.get $p1)
              (i32.const 16)))
          (local.set $l13
            (i32.add
              (local.get $l13)
              (i32.const 16)))
          (br_if $L15
            (local.tee $l15
              (i32.add
                (local.get $l15)
                (i32.const 4)))))
        (br_if $B5
          (i32.eqz
            (local.get $l22))))
      (local.set $l13
        (i32.sub
          (local.get $p5)
          (local.get $l10)))
      (local.set $l12
        (i32.add
          (local.get $p6)
          (i32.shl
            (local.get $l10)
            (i32.const 4))))
      (local.set $l14
        (i32.add
          (local.get $l17)
          (local.tee $p1
            (i32.shl
              (local.get $l10)
              (i32.const 2)))))
      (local.set $l16
        (i32.add
          (local.get $l18)
          (local.get $p1)))
      (local.set $l10
        (i32.add
          (local.get $l19)
          (local.get $p1)))
      (local.set $p1
        (i32.add
          (local.get $l20)
          (local.get $p1)))
      (loop $L16
        (f32.store
          (local.get $l12)
          (f32.load
            (local.get $l14)))
        (f32.store
          (i32.add
            (local.get $l12)
            (i32.const 4))
          (f32.load
            (local.get $l16)))
        (f32.store
          (i32.add
            (local.get $l12)
            (i32.const 8))
          (f32.load
            (local.get $l10)))
        (f32.store
          (i32.add
            (local.get $l12)
            (i32.const 12))
          (f32.load
            (local.get $p1)))
        (local.set $l12
          (i32.add
            (local.get $l12)
            (i32.const 16)))
        (local.set $l14
          (i32.add
            (local.get $l14)
            (i32.const 4)))
        (local.set $l16
          (i32.add
            (local.get $l16)
            (i32.const 4)))
        (local.set $l10
          (i32.add
            (local.get $l10)
            (i32.const 4)))
        (local.set $p1
          (i32.add
            (local.get $p1)
            (i32.const 4)))
        (br_if $L16
          (local.tee $l13
            (i32.add
              (local.get $l13)
              (i32.const -1))))))
    (v128.store offset=1408
      (local.get $l9)
      (local.tee $l11
        (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
    (v128.store offset=1360
      (local.get $l9)
      (local.get $l11))
    (i64.store offset=20 align=4
      (local.get $l9)
      (i64.const 0))
    (i32.store offset=28
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=52 align=4
      (local.get $l9)
      (i64.const 0))
    (i32.store offset=60
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=84 align=4
      (local.get $l9)
      (i64.const 0))
    (i32.store offset=92
      (local.get $l9)
      (i32.const 0))
    (f32.store offset=16
      (local.get $l9)
      (local.tee $l34
        (f32.load offset=24
          (local.get $p8))))
    (f32.store offset=48
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=28
          (local.get $p8))))
    (f32.store offset=80
      (local.get $l9)
      (local.tee $l36
        (f32.load offset=32
          (local.get $p8))))
    (v128.store offset=32
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l34))))
    (v128.store offset=64
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (v128.store offset=96
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l36))))
    (local.set $l34
      (f32.load offset=36
        (local.get $p8)))
    (i64.store offset=116 align=4
      (local.get $l9)
      (i64.const 0))
    (f32.store offset=112
      (local.get $l9)
      (local.get $l34))
    (i32.store offset=124
      (local.get $l9)
      (i32.const 0))
    (v128.store offset=128
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l34))))
    (i64.store offset=148 align=4
      (local.get $l9)
      (i64.const 0))
    (i32.store offset=156
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=180 align=4
      (local.get $l9)
      (i64.const 0))
    (i32.store offset=188
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=212 align=4
      (local.get $l9)
      (i64.const 0))
    (i32.store offset=220
      (local.get $l9)
      (i32.const 0))
    (f32.store offset=144
      (local.get $l9)
      (local.tee $l34
        (f32.load offset=40
          (local.get $p8))))
    (f32.store offset=176
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=44
          (local.get $p8))))
    (f32.store offset=208
      (local.get $l9)
      (local.tee $l36
        (f32.load offset=48
          (local.get $p8))))
    (v128.store offset=160
      (local.get $l9)
      (local.tee $l37
        (f64x2.splat
          (f64.promote_f32
            (local.get $l34)))))
    (v128.store offset=192
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (v128.store offset=224
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l36))))
    (i32.store offset=252
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=244 align=4
      (local.get $l9)
      (i64.const 0))
    (i32.store offset=284
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=276 align=4
      (local.get $l9)
      (i64.const 0))
    (i32.store offset=316
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=308 align=4
      (local.get $l9)
      (i64.const 0))
    (i32.store offset=348
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=340 align=4
      (local.get $l9)
      (i64.const 0))
    (f32.store offset=240
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=52
          (local.get $p8))))
    (f32.store offset=272
      (local.get $l9)
      (local.tee $l34
        (f32.load offset=56
          (local.get $p8))))
    (f32.store offset=304
      (local.get $l9)
      (local.tee $l36
        (f32.load offset=60
          (local.get $p8))))
    (f32.store offset=336
      (local.get $l9)
      (local.tee $l38
        (f32.load offset=64
          (local.get $p8))))
    (v128.store offset=256
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (v128.store offset=288
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l34))))
    (v128.store offset=320
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l36))))
    (v128.store offset=352
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l38))))
    (f32.store offset=368
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=68
          (local.get $p8))))
    (i32.store offset=380
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=372 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=384
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (v128.store offset=1376
      (local.get $l9)
      (local.get $l11))
    (v128.store offset=1424
      (local.get $l9)
      (local.get $l11))
    (f32.store offset=400
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=72
          (local.get $p8))))
    (i32.store offset=412
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=404 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=416
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (f32.store offset=432
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=76
          (local.get $p8))))
    (i32.store offset=444
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=436 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=448
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (f32.store offset=464
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=80
          (local.get $p8))))
    (i32.store offset=476
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=468 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=480
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (f32.store offset=496
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=84
          (local.get $p8))))
    (i32.store offset=508
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=500 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=512
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (f32.store offset=528
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=88
          (local.get $p8))))
    (i32.store offset=540
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=532 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=544
      (local.get $l9)
      (local.tee $l39
        (f64x2.splat
          (f64.promote_f32
            (local.get $l35)))))
    (f32.store offset=560
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=92
          (local.get $p8))))
    (i32.store offset=572
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=564 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=576
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (f32.store offset=592
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=96
          (local.get $p8))))
    (i32.store offset=604
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=596 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=608
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (f32.store offset=624
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=100
          (local.get $p8))))
    (i32.store offset=636
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=628 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=640
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (f32.store offset=656
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=104
          (local.get $p8))))
    (i32.store offset=668
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=660 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=672
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (f32.store offset=688
      (local.get $l9)
      (local.tee $l36
        (f32.load offset=108
          (local.get $p8))))
    (i32.store offset=700
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=692 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=704
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l36))))
    (f32.store offset=720
      (local.get $l9)
      (local.tee $l36
        (f32.load offset=112
          (local.get $p8))))
    (i32.store offset=732
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=724 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=736
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l36))))
    (f32.store offset=752
      (local.get $l9)
      (local.tee $l36
        (f32.load offset=116
          (local.get $p8))))
    (i32.store offset=764
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=756 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=768
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l36))))
    (v128.store64_lane 0
      (local.get $l9)
      (v128.and
        (f32x4.eq
          (f32x4.replace_lane 1
            (f32x4.splat
              (local.get $l34))
            (local.get $l35))
          (v128.const i32x4 0xbf800000 0xbf800000 0xbf800000 0xbf800000))
        (v128.const i32x4 0x00000001 0x00000001 0x00000001 0x00000001)))
    (v128.store offset=1392
      (local.get $l9)
      (local.get $l11))
    (v128.store offset=1440
      (local.get $l9)
      (local.get $l11))
    (f32.store offset=784
      (local.get $l9)
      (local.tee $l34
        (f32.load offset=120
          (local.get $p8))))
    (i32.store offset=796
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=788 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=800
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l34))))
    (f32.store offset=816
      (local.get $l9)
      (local.tee $l34
        (f32.load offset=124
          (local.get $p8))))
    (i32.store offset=828
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=820 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=832
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l34))))
    (f32.store offset=848
      (local.get $l9)
      (local.tee $l34
        (f32.load offset=128
          (local.get $p8))))
    (i32.store offset=860
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=852 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=864
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l34))))
    (f32.store offset=880
      (local.get $l9)
      (local.tee $l34
        (f32.load offset=132
          (local.get $p8))))
    (i32.store offset=892
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=884 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=896
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l34))))
    (f32.store offset=912
      (local.get $l9)
      (local.tee $l34
        (f32.load offset=136
          (local.get $p8))))
    (i32.store offset=924
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=916 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=928
      (local.get $l9)
      (local.tee $l40
        (f64x2.splat
          (f64.promote_f32
            (local.get $l34)))))
    (f32.store offset=944
      (local.get $l9)
      (local.tee $l34
        (f32.load offset=140
          (local.get $p8))))
    (i32.store offset=956
      (local.get $l9)
      (i32.const 0))
    (i64.store offset=948 align=4
      (local.get $l9)
      (i64.const 0))
    (v128.store offset=960
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l34))))
    (f32.store offset=976
      (local.get $l9)
      (local.tee $l34
        (f32.load offset=144
          (local.get $p8))))
    (v128.store offset=992
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l34))))
    (f32.store offset=1008
      (local.get $l9)
      (local.tee $l34
        (f32.load offset=148
          (local.get $p8))))
    (v128.store offset=1024
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l34))))
    (f32.store offset=1040
      (local.get $l9)
      (local.tee $l34
        (f32.load offset=152
          (local.get $p8))))
    (v128.store offset=1056
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l34))))
    (f32.store offset=1072
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=156
          (local.get $p8))))
    (v128.store offset=1088
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (f32.store offset=1104
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=160
          (local.get $p8))))
    (v128.store offset=1120
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (f32.store offset=1136
      (local.get $l9)
      (local.tee $l35
        (f32.load offset=164
          (local.get $p8))))
    (v128.store offset=1152
      (local.get $l9)
      (f64x2.splat
        (f64.promote_f32
          (local.get $l35))))
    (i32.store offset=8
      (local.get $l9)
      (f32.eq
        (local.get $l34)
        (f32.const -0x1p+0 (;=-1;))))
    (block $B17
      (block $B18
        (br_if $B18
          (i32.ge_s
            (local.get $p5)
            (i32.const -3)))
        (local.set $l21
          (i32.const -4))
        (local.set $l23
          (v128.const i32x4 0x7fffffff 0x7fffffff 0x7fffffff 0x7fffffff))
        (br $B17))
      (local.set $l21
        (select
          (local.get $p5)
          (i32.const 8)
          (i32.lt_s
            (local.get $p5)
            (i32.const 8))))
      (local.set $l14
        (i32.add
          (local.get $p6)
          (i32.const -160)))
      (local.set $l16
        (i32.add
          (local.get $p7)
          (i32.const -64)))
      (local.set $l23
        (v128.const i32x4 0x7fffffff 0x7fffffff 0x7fffffff 0x7fffffff))
      (local.set $l11
        (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
      (local.set $l12
        (i32.const -4))
      (local.set $l24
        (v128.load offset=1440
          (local.get $l9)))
      (local.set $l25
        (v128.load offset=1424
          (local.get $l9)))
      (local.set $l26
        (v128.load offset=1408
          (local.get $l9)))
      (local.set $l41
        (v128.load32_splat offset=912
          (local.get $l9)))
      (local.set $l42
        (v128.load32_splat offset=528
          (local.get $l9)))
      (local.set $l43
        (v128.load32_splat offset=144
          (local.get $l9)))
      (loop $L19
        (local.set $l44
          (local.tee $l27
            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
        (block $B20
          (br_if $B20
            (i32.lt_s
              (local.get $l12)
              (i32.const 6)))
          (local.set $l44
            (v128.load align=1
              (local.get $l14))))
        (block $B21
          (br_if $B21
            (i32.ge_s
              (i32.add
                (local.get $l12)
                (i32.const 4))
              (local.get $p5)))
          (local.set $l27
            (v128.load align=1
              (i32.add
                (local.get $l14)
                (i32.const 160)))))
        (local.set $l47
          (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
            (local.tee $l45
              (f64x2.add
                (f64x2.mul
                  (local.get $l37)
                  (f64x2.promote_low_f32x4
                    (local.get $l26)))
                (f64x2.promote_low_f32x4
                  (local.tee $l27
                    (f32x4.sub
                      (f32x4.mul
                        (local.tee $l44
                          (f32x4.add
                            (local.get $l44)
                            (local.get $l27)))
                        (v128.load32_splat offset=24
                          (local.get $p8)))
                      (v128.load offset=1360
                        (local.get $l9)))))))
            (local.tee $l46
              (f64x2.add
                (f64x2.mul
                  (local.get $l37)
                  (f64x2.promote_low_f32x4
                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                      (local.get $l26)
                      (local.get $l26))))
                (f64x2.promote_low_f32x4
                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                    (local.get $l27)
                    (local.get $l27)))))))
        (block $B22
          (block $B23
            (br_if $B23
              (v128.any_true
                (i32x4.eq
                  (v128.and
                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                      (local.get $l45)
                      (local.get $l46))
                    (local.tee $l48
                      (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                  (local.tee $l49
                    (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
            (local.set $l50
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l45))
                (f32x4.demote_f64x2_zero
                  (local.get $l46))))
            (br $B22))
          (local.set $l50
            (call $fma4_tie
              (local.get $l43)
              (local.get $l26)
              (local.get $l27))))
        (local.set $l46
          (v128.and
            (local.get $l47)
            (local.tee $l45
              (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
        (local.set $l52
          (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
            (local.tee $l47
              (f64x2.add
                (f64x2.mul
                  (local.get $l39)
                  (f64x2.promote_low_f32x4
                    (local.get $l25)))
                (f64x2.promote_low_f32x4
                  (local.tee $l27
                    (f32x4.sub
                      (f32x4.mul
                        (local.get $l44)
                        (v128.load32_splat offset=72
                          (local.get $p8)))
                      (v128.load offset=1376
                        (local.get $l9)))))))
            (local.tee $l51
              (f64x2.add
                (f64x2.mul
                  (local.get $l39)
                  (f64x2.promote_low_f32x4
                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                      (local.get $l25)
                      (local.get $l25))))
                (f64x2.promote_low_f32x4
                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                    (local.get $l27)
                    (local.get $l27)))))))
        (block $B24
          (block $B25
            (br_if $B25
              (v128.any_true
                (i32x4.eq
                  (v128.and
                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                      (local.get $l47)
                      (local.get $l51))
                    (local.get $l48))
                  (local.get $l49))))
            (local.set $l27
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l47))
                (f32x4.demote_f64x2_zero
                  (local.get $l51))))
            (br $B24))
          (local.set $l27
            (call $fma4_tie
              (local.get $l42)
              (local.get $l25)
              (local.get $l27))))
        (local.set $l47
          (i32x4.max_s
            (local.get $l11)
            (local.get $l46)))
        (local.set $l51
          (i32x4.min_s
            (local.get $l23)
            (local.get $l46)))
        (local.set $l23
          (v128.and
            (local.get $l52)
            (local.get $l45)))
        (local.set $l52
          (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
            (local.tee $l44
              (f64x2.add
                (f64x2.mul
                  (local.get $l40)
                  (f64x2.promote_low_f32x4
                    (local.get $l24)))
                (f64x2.promote_low_f32x4
                  (local.tee $l11
                    (f32x4.sub
                      (f32x4.mul
                        (local.get $l44)
                        (v128.load32_splat offset=120
                          (local.get $p8)))
                      (v128.load offset=1392
                        (local.get $l9)))))))
            (local.tee $l46
              (f64x2.add
                (f64x2.mul
                  (local.get $l40)
                  (f64x2.promote_low_f32x4
                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                      (local.get $l24)
                      (local.get $l24))))
                (f64x2.promote_low_f32x4
                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                    (local.get $l11)
                    (local.get $l11)))))))
        (block $B26
          (block $B27
            (br_if $B27
              (v128.any_true
                (i32x4.eq
                  (v128.and
                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                      (local.get $l44)
                      (local.get $l46))
                    (local.get $l48))
                  (local.get $l49))))
            (local.set $l44
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l44))
                (f32x4.demote_f64x2_zero
                  (local.get $l46))))
            (br $B26))
          (local.set $l44
            (call $fma4_tie
              (local.get $l41)
              (local.get $l24)
              (local.get $l11))))
        (local.set $l11
          (i32x4.max_u
            (local.get $l47)
            (local.get $l23)))
        (local.set $l48
          (i32x4.min_s
            (local.get $l51)
            (local.get $l23)))
        (local.set $l23
          (v128.and
            (local.get $l52)
            (local.get $l45)))
        (block $B28
          (br_if $B28
            (i32.lt_s
              (local.get $l12)
              (i32.const 0)))
          (v128.store align=1
            (local.get $l16)
            (f32x4.add
              (f32x4.add
                (local.get $l27)
                (local.get $l44))
              (local.get $l50))))
        (local.set $l11
          (i32x4.max_u
            (local.get $l11)
            (local.get $l23)))
        (local.set $l23
          (i32x4.min_s
            (local.get $l48)
            (local.get $l23)))
        (v128.store offset=1392
          (local.get $l9)
          (local.get $l24))
        (v128.store offset=1376
          (local.get $l9)
          (local.get $l25))
        (v128.store offset=1360
          (local.get $l9)
          (local.get $l26))
        (local.set $l14
          (i32.add
            (local.get $l14)
            (i32.const 16)))
        (local.set $l16
          (i32.add
            (local.get $l16)
            (i32.const 16)))
        (local.set $l24
          (local.get $l44))
        (local.set $l25
          (local.get $l27))
        (local.set $l26
          (local.get $l50))
        (br_if $L19
          (i32.ne
            (local.tee $l12
              (i32.add
                (local.get $l12)
                (i32.const 1)))
            (local.get $l21))))
      (v128.store offset=1168
        (local.get $l9)
        (local.get $l50))
      (v128.store offset=1408
        (local.get $l9)
        (local.get $l50))
      (v128.store offset=1424
        (local.get $l9)
        (local.get $l27))
      (v128.store offset=1232
        (local.get $l9)
        (local.get $l27))
      (v128.store offset=1440
        (local.get $l9)
        (local.get $l44))
      (v128.store offset=1296
        (local.get $l9)
        (local.get $l44)))
    (block $B29
      (br_if $B29
        (i32.ge_s
          (local.get $l21)
          (local.tee $l31
            (i32.add
              (local.get $p5)
              (i32.const -7)))))
      (local.set $l32
        (i32.add
          (local.get $p8)
          (i32.const 24)))
      (loop $L30
        (local.set $l45
          (f32x4.add
            (v128.load align=1
              (i32.add
                (local.tee $l12
                  (i32.add
                    (local.get $p6)
                    (local.tee $l22
                      (i32.shl
                        (local.get $l21)
                        (i32.const 4)))))
                (i32.const -96)))
            (v128.load align=1
              (i32.add
                (local.get $l12)
                (i32.const 64)))))
        (local.set $l41
          (f32x4.mul
            (local.tee $l53
              (f32x4.add
                (v128.load align=1
                  (i32.add
                    (local.tee $l12
                      (i32.add
                        (local.get $p6)
                        (local.tee $p2
                          (i32.add
                            (local.get $l22)
                            (i32.const 16)))))
                    (i32.const -96)))
                (v128.load align=1
                  (i32.add
                    (local.get $l12)
                    (i32.const 64)))))
            (local.tee $l24
              (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))))
        (local.set $l51
          (f32x4.mul
            (local.tee $l54
              (f32x4.add
                (v128.load align=1
                  (i32.add
                    (local.tee $l12
                      (i32.add
                        (local.get $p6)
                        (local.tee $p0
                          (i32.add
                            (local.get $l22)
                            (i32.const 32)))))
                    (i32.const -96)))
                (v128.load align=1
                  (i32.add
                    (local.get $l12)
                    (i32.const 64)))))
            (local.get $l24)))
        (local.set $l46
          (f32x4.mul
            (local.tee $l55
              (f32x4.add
                (v128.load align=1
                  (i32.add
                    (local.tee $l12
                      (i32.add
                        (local.get $p6)
                        (local.tee $l30
                          (i32.add
                            (local.get $l22)
                            (i32.const 48)))))
                    (i32.const -96)))
                (v128.load align=1
                  (i32.add
                    (local.get $l12)
                    (i32.const 64)))))
            (local.get $l24)))
        (local.set $l56
          (f64x2.promote_low_f32x4
            (local.get $l55)))
        (local.set $l57
          (f64x2.promote_low_f32x4
            (local.get $l54)))
        (local.set $l42
          (f64x2.promote_low_f32x4
            (local.get $l53)))
        (local.set $l58
          (f64x2.promote_low_f32x4
            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
              (local.get $l55)
              (local.get $l55))))
        (local.set $l59
          (f64x2.promote_low_f32x4
            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
              (local.get $l54)
              (local.get $l54))))
        (local.set $l43
          (f64x2.promote_low_f32x4
            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
              (local.get $l53)
              (local.get $l53))))
        (local.set $p1
          (i32.add
            (local.get $l9)
            (i32.const 16)))
        (local.set $l19
          (i32.const 0))
        (local.set $l20
          (local.get $l32))
        (local.set $l18
          (i32.const 0))
        (loop $L31
          (local.set $l15
            (i32.add
              (i32.add
                (local.get $l9)
                (i32.const 1360))
              (local.tee $l12
                (i32.shl
                  (local.get $l18)
                  (i32.const 4)))))
          (local.set $l17
            (i32.add
              (local.get $l9)
              (i32.shl
                (local.get $l18)
                (i32.const 2))))
          (local.set $l48
            (f64x2.promote_low_f32x4
              (local.tee $l52
                (v128.load
                  (i32.add
                    (i32.add
                      (local.get $l9)
                      (i32.const 1408))
                    (local.get $l12))))))
          (local.set $l49
            (f64x2.promote_low_f32x4
              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                (local.get $l52)
                (local.get $l52))))
          (local.set $l12
            (i32.const -128))
          (local.set $l14
            (local.get $l19))
          (local.set $l16
            (local.get $l20))
          (local.set $l10
            (i32.const 0))
          (loop $L32
            (local.set $l24
              (f32x4.mul
                (local.get $l45)
                (v128.load32_splat
                  (local.get $l16))))
            (block $B33
              (block $B34
                (block $B35
                  (block $B36
                    (block $B37
                      (br_if $B37
                        (i32.eq
                          (local.get $l12)
                          (i32.const -128)))
                      (local.set $l25
                        (v128.and
                          (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                            (local.tee $l26
                              (f64x2.add
                                (f64x2.mul
                                  (local.tee $l25
                                    (v128.load
                                      (i32.add
                                        (local.tee $l13
                                          (i32.add
                                            (local.get $p1)
                                            (local.get $l12)))
                                        (i32.const 112))))
                                  (local.get $l42))
                                (f64x2.promote_low_f32x4
                                  (local.get $l24))))
                            (local.tee $l27
                              (f64x2.add
                                (f64x2.mul
                                  (local.get $l25)
                                  (local.get $l43))
                                (f64x2.promote_low_f32x4
                                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                    (local.get $l24)
                                    (local.get $l24))))))
                          (local.tee $l44
                            (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
                      (br_if $B36
                        (v128.any_true
                          (i32x4.eq
                            (v128.and
                              (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                (local.get $l26)
                                (local.get $l27))
                              (local.tee $l50
                                (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                            (local.tee $l47
                              (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
                      (local.set $l24
                        (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                          (f32x4.demote_f64x2_zero
                            (local.get $l26))
                          (f32x4.demote_f64x2_zero
                            (local.get $l27))))
                      (br $B35))
                    (local.set $l24
                      (f32x4.add
                        (local.get $l46)
                        (f32x4.add
                          (local.get $l51)
                          (f32x4.add
                            (local.get $l41)
                            (local.get $l24)))))
                    (br_if $B34
                      (i32.eqz
                        (i32.load
                          (local.get $l17))))
                    (local.set $l24
                      (f32x4.sub
                        (local.get $l24)
                        (v128.load
                          (local.get $l15))))
                    (br $B33))
                  (local.set $l24
                    (call $fma4_tie
                      (v128.load32_splat
                        (i32.add
                          (local.get $l13)
                          (i32.const 96)))
                      (local.get $l53)
                      (local.get $l24))))
                (local.set $l11
                  (i32x4.max_s
                    (local.get $l11)
                    (local.get $l25)))
                (local.set $l23
                  (i32x4.min_s
                    (local.get $l23)
                    (local.get $l25)))
                (block $B38
                  (block $B39
                    (br_if $B39
                      (i32.eq
                        (local.get $l12)
                        (i32.const -96)))
                    (local.set $l25
                      (v128.and
                        (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                          (local.tee $l26
                            (f64x2.add
                              (f64x2.mul
                                (local.tee $l25
                                  (v128.load
                                    (i32.add
                                      (local.get $l13)
                                      (i32.const 80))))
                                (local.get $l57))
                              (f64x2.promote_low_f32x4
                                (local.get $l24))))
                          (local.tee $l27
                            (f64x2.add
                              (f64x2.mul
                                (local.get $l25)
                                (local.get $l59))
                              (f64x2.promote_low_f32x4
                                (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                  (local.get $l24)
                                  (local.get $l24))))))
                        (local.get $l44)))
                    (block $B40
                      (block $B41
                        (br_if $B41
                          (v128.any_true
                            (i32x4.eq
                              (v128.and
                                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                  (local.get $l26)
                                  (local.get $l27))
                                (local.get $l50))
                              (local.get $l47))))
                        (local.set $l24
                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                            (f32x4.demote_f64x2_zero
                              (local.get $l26))
                            (f32x4.demote_f64x2_zero
                              (local.get $l27))))
                        (br $B40))
                      (local.set $l24
                        (call $fma4_tie
                          (v128.load32_splat
                            (i32.add
                              (local.get $l13)
                              (i32.const 64)))
                          (local.get $l54)
                          (local.get $l24))))
                    (local.set $l11
                      (i32x4.max_u
                        (local.get $l11)
                        (local.get $l25)))
                    (local.set $l23
                      (i32x4.min_s
                        (local.get $l23)
                        (local.get $l25)))
                    (block $B42
                      (br_if $B42
                        (i32.gt_u
                          (local.get $l10)
                          (i32.const 2)))
                      (local.set $l24
                        (f32x4.add
                          (local.get $l46)
                          (local.get $l24)))
                      (br $B34))
                    (local.set $l11
                      (i32x4.max_u
                        (local.get $l11)
                        (local.tee $l27
                          (v128.and
                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                              (local.tee $l25
                                (f64x2.add
                                  (f64x2.mul
                                    (local.tee $l26
                                      (v128.load
                                        (i32.add
                                          (local.get $l13)
                                          (i32.const 48))))
                                    (local.get $l56))
                                  (f64x2.promote_low_f32x4
                                    (local.get $l24))))
                              (local.tee $l26
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l26)
                                    (local.get $l58))
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l24)
                                      (local.get $l24))))))
                            (local.get $l44)))))
                    (local.set $l23
                      (i32x4.min_s
                        (local.get $l23)
                        (local.get $l27)))
                    (br_if $B38
                      (v128.any_true
                        (i32x4.eq
                          (v128.and
                            (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                              (local.get $l25)
                              (local.get $l26))
                            (local.get $l50))
                          (local.get $l47))))
                    (local.set $l24
                      (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                        (f32x4.demote_f64x2_zero
                          (local.get $l25))
                        (f32x4.demote_f64x2_zero
                          (local.get $l26))))
                    (br $B34))
                  (local.set $l24
                    (f32x4.add
                      (local.get $l46)
                      (f32x4.add
                        (local.get $l51)
                        (local.get $l24))))
                  (br $B34))
                (local.set $l24
                  (call $fma4_tie
                    (v128.load32_splat
                      (i32.add
                        (local.get $l13)
                        (i32.const 32)))
                    (local.get $l55)
                    (local.get $l24))))
              (local.set $l11
                (i32x4.max_s
                  (local.get $l11)
                  (local.tee $l44
                    (v128.and
                      (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                        (local.tee $l26
                          (f64x2.add
                            (f64x2.mul
                              (local.tee $l27
                                (v128.load
                                  (i32.add
                                    (local.tee $l13
                                      (i32.add
                                        (local.get $p1)
                                        (local.get $l12)))
                                    (i32.const 400))))
                              (f64x2.promote_low_f32x4
                                (local.tee $l25
                                  (v128.load
                                    (local.get $l15)))))
                            (f64x2.promote_low_f32x4
                              (local.get $l24))))
                        (local.tee $l27
                          (f64x2.add
                            (f64x2.mul
                              (local.get $l27)
                              (f64x2.promote_low_f32x4
                                (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                  (local.get $l25)
                                  (local.get $l25))))
                            (f64x2.promote_low_f32x4
                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                (local.get $l24)
                                (local.get $l24))))))
                      (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000)))))
              (local.set $l23
                (i32x4.min_s
                  (local.get $l23)
                  (local.get $l44)))
              (block $B43
                (br_if $B43
                  (v128.any_true
                    (i32x4.eq
                      (v128.and
                        (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                          (local.get $l26)
                          (local.get $l27))
                        (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff))
                      (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000))))
                (local.set $l24
                  (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                    (f32x4.demote_f64x2_zero
                      (local.get $l26))
                    (f32x4.demote_f64x2_zero
                      (local.get $l27))))
                (br $B33))
              (local.set $l24
                (call $fma4_tie
                  (v128.load32_splat
                    (i32.add
                      (local.get $l13)
                      (i32.const 384)))
                  (local.get $l25)
                  (local.get $l24))))
            (local.set $l25
              (v128.and
                (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                  (local.tee $l26
                    (f64x2.add
                      (f64x2.mul
                        (local.tee $l25
                          (v128.load
                            (i32.add
                              (local.tee $l13
                                (i32.add
                                  (local.get $p1)
                                  (local.get $l12)))
                              (i32.const 272))))
                        (local.get $l48))
                      (f64x2.promote_low_f32x4
                        (local.get $l24))))
                  (local.tee $l27
                    (f64x2.add
                      (f64x2.mul
                        (local.get $l25)
                        (local.get $l49))
                      (f64x2.promote_low_f32x4
                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                          (local.get $l24)
                          (local.get $l24))))))
                (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000)))
            (block $B44
              (block $B45
                (br_if $B45
                  (v128.any_true
                    (i32x4.eq
                      (v128.and
                        (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                          (local.get $l26)
                          (local.get $l27))
                        (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff))
                      (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000))))
                (local.set $l24
                  (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                    (f32x4.demote_f64x2_zero
                      (local.get $l26))
                    (f32x4.demote_f64x2_zero
                      (local.get $l27))))
                (br $B44))
              (local.set $l24
                (call $fma4_tie
                  (v128.load32_splat
                    (i32.add
                      (local.get $l13)
                      (i32.const 256)))
                  (local.get $l52)
                  (local.get $l24))))
            (local.set $l11
              (i32x4.max_s
                (local.get $l11)
                (local.get $l25)))
            (local.set $l23
              (i32x4.min_s
                (local.get $l23)
                (local.get $l25)))
            (v128.store
              (i32.add
                (i32.add
                  (local.get $l9)
                  (i32.const 1168))
                (local.get $l14))
              (local.get $l24))
            (local.set $l14
              (i32.add
                (local.get $l14)
                (i32.const 16)))
            (local.set $l16
              (i32.add
                (local.get $l16)
                (i32.const 4)))
            (local.set $l10
              (i32.add
                (local.get $l10)
                (i32.const 1)))
            (br_if $L32
              (local.tee $l12
                (i32.add
                  (local.get $l12)
                  (i32.const 32)))))
          (local.set $l19
            (i32.add
              (local.get $l19)
              (i32.const 64)))
          (local.set $l20
            (i32.add
              (local.get $l20)
              (i32.const 48)))
          (local.set $p1
            (i32.add
              (local.get $p1)
              (i32.const 384)))
          (br_if $L31
            (i32.ne
              (local.tee $l18
                (i32.add
                  (local.get $l18)
                  (i32.const 1)))
              (i32.const 3))))
        (v128.store align=1
          (i32.add
            (local.get $p7)
            (local.get $l22))
          (f32x4.add
            (v128.load offset=1168
              (local.get $l9))
            (f32x4.add
              (v128.load offset=1232
                (local.get $l9))
              (v128.load offset=1296
                (local.get $l9)))))
        (v128.store align=1
          (i32.add
            (local.get $p7)
            (local.get $p2))
          (f32x4.add
            (v128.load offset=1184
              (local.get $l9))
            (f32x4.add
              (v128.load offset=1248
                (local.get $l9))
              (v128.load offset=1312
                (local.get $l9)))))
        (v128.store align=1
          (i32.add
            (local.get $p7)
            (local.get $p0))
          (f32x4.add
            (local.tee $l24
              (v128.load offset=1200
                (local.get $l9)))
            (f32x4.add
              (local.tee $l25
                (v128.load offset=1264
                  (local.get $l9)))
              (local.tee $l26
                (v128.load offset=1328
                  (local.get $l9))))))
        (v128.store align=1
          (i32.add
            (local.get $p7)
            (local.get $l30))
          (f32x4.add
            (local.tee $l27
              (v128.load offset=1216
                (local.get $l9)))
            (f32x4.add
              (local.tee $l44
                (v128.load offset=1280
                  (local.get $l9)))
              (local.tee $l48
                (v128.load offset=1344
                  (local.get $l9))))))
        (v128.store offset=1360
          (local.get $l9)
          (local.get $l24))
        (v128.store offset=1376
          (local.get $l9)
          (local.get $l25))
        (v128.store offset=1408
          (local.get $l9)
          (local.get $l27))
        (v128.store offset=1424
          (local.get $l9)
          (local.get $l44))
        (v128.store offset=1392
          (local.get $l9)
          (local.get $l26))
        (v128.store offset=1440
          (local.get $l9)
          (local.get $l48))
        (br_if $L30
          (i32.lt_s
            (local.tee $l21
              (i32.add
                (local.get $l21)
                (i32.const 4)))
            (local.get $l31)))))
    (block $B46
      (br_if $B46
        (i32.ge_s
          (local.get $l21)
          (local.get $p5)))
      (local.set $l12
        (i32.add
          (local.get $p7)
          (local.tee $l14
            (i32.shl
              (local.get $l21)
              (i32.const 4)))))
      (local.set $l14
        (i32.add
          (i32.add
            (local.get $l14)
            (local.get $p6))
          (i32.const 64)))
      (local.set $l24
        (v128.load offset=1440
          (local.get $l9)))
      (local.set $l25
        (v128.load offset=1424
          (local.get $l9)))
      (local.set $l26
        (v128.load offset=1408
          (local.get $l9)))
      (local.set $l52
        (v128.load32_splat offset=912
          (local.get $l9)))
      (local.set $l41
        (v128.load32_splat offset=528
          (local.get $l9)))
      (local.set $l42
        (v128.load32_splat offset=144
          (local.get $l9)))
      (loop $L47
        (local.set $l44
          (local.tee $l27
            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
        (block $B48
          (br_if $B48
            (i32.lt_s
              (local.get $l21)
              (i32.const 6)))
          (local.set $l44
            (v128.load align=1
              (i32.add
                (local.get $l14)
                (i32.const -160)))))
        (block $B49
          (br_if $B49
            (i32.ge_s
              (local.tee $l16
                (i32.add
                  (local.get $l21)
                  (i32.const 4)))
              (local.get $p5)))
          (local.set $l27
            (v128.load align=1
              (local.get $l14))))
        (local.set $l49
          (v128.and
            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
              (local.tee $l50
                (f64x2.add
                  (f64x2.mul
                    (local.get $l37)
                    (f64x2.promote_low_f32x4
                      (local.get $l26)))
                  (f64x2.promote_low_f32x4
                    (local.tee $l27
                      (f32x4.sub
                        (f32x4.mul
                          (local.tee $l44
                            (f32x4.add
                              (local.get $l44)
                              (local.get $l27)))
                          (v128.load32_splat offset=24
                            (local.get $p8)))
                        (v128.load offset=1360
                          (local.get $l9)))))))
              (local.tee $l47
                (f64x2.add
                  (f64x2.mul
                    (local.get $l37)
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $l26)
                        (local.get $l26))))
                  (f64x2.promote_low_f32x4
                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                      (local.get $l27)
                      (local.get $l27))))))
            (local.tee $l48
              (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
        (block $B50
          (block $B51
            (br_if $B51
              (v128.any_true
                (i32x4.eq
                  (v128.and
                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                      (local.get $l50)
                      (local.get $l47))
                    (local.tee $l45
                      (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                  (local.tee $l46
                    (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
            (local.set $l27
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l50))
                (f32x4.demote_f64x2_zero
                  (local.get $l47))))
            (br $B50))
          (local.set $l27
            (call $fma4_tie
              (local.get $l42)
              (local.get $l26)
              (local.get $l27))))
        (local.set $l47
          (i32x4.max_s
            (local.get $l11)
            (local.get $l49)))
        (local.set $l51
          (i32x4.min_s
            (local.get $l23)
            (local.get $l49)))
        (local.set $l23
          (v128.and
            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
              (local.tee $l49
                (f64x2.add
                  (f64x2.mul
                    (local.get $l39)
                    (f64x2.promote_low_f32x4
                      (local.get $l25)))
                  (f64x2.promote_low_f32x4
                    (local.tee $l11
                      (f32x4.sub
                        (f32x4.mul
                          (local.get $l44)
                          (v128.load32_splat offset=72
                            (local.get $p8)))
                        (v128.load offset=1376
                          (local.get $l9)))))))
              (local.tee $l50
                (f64x2.add
                  (f64x2.mul
                    (local.get $l39)
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $l25)
                        (local.get $l25))))
                  (f64x2.promote_low_f32x4
                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                      (local.get $l11)
                      (local.get $l11))))))
            (local.get $l48)))
        (block $B52
          (block $B53
            (br_if $B53
              (v128.any_true
                (i32x4.eq
                  (v128.and
                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                      (local.get $l49)
                      (local.get $l50))
                    (local.get $l45))
                  (local.get $l46))))
            (local.set $l49
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l49))
                (f32x4.demote_f64x2_zero
                  (local.get $l50))))
            (br $B52))
          (local.set $l49
            (call $fma4_tie
              (local.get $l41)
              (local.get $l25)
              (local.get $l11))))
        (local.set $l47
          (i32x4.max_u
            (local.get $l47)
            (local.get $l23)))
        (local.set $l51
          (i32x4.min_s
            (local.get $l51)
            (local.get $l23)))
        (local.set $l23
          (v128.and
            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
              (local.tee $l44
                (f64x2.add
                  (f64x2.mul
                    (local.get $l40)
                    (f64x2.promote_low_f32x4
                      (local.get $l24)))
                  (f64x2.promote_low_f32x4
                    (local.tee $l11
                      (f32x4.sub
                        (f32x4.mul
                          (local.get $l44)
                          (v128.load32_splat offset=120
                            (local.get $p8)))
                        (v128.load offset=1392
                          (local.get $l9)))))))
              (local.tee $l50
                (f64x2.add
                  (f64x2.mul
                    (local.get $l40)
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $l24)
                        (local.get $l24))))
                  (f64x2.promote_low_f32x4
                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                      (local.get $l11)
                      (local.get $l11))))))
            (local.get $l48)))
        (block $B54
          (block $B55
            (br_if $B55
              (v128.any_true
                (i32x4.eq
                  (v128.and
                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                      (local.get $l44)
                      (local.get $l50))
                    (local.get $l45))
                  (local.get $l46))))
            (local.set $l44
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l44))
                (f32x4.demote_f64x2_zero
                  (local.get $l50))))
            (br $B54))
          (local.set $l44
            (call $fma4_tie
              (local.get $l52)
              (local.get $l24)
              (local.get $l11))))
        (local.set $l11
          (i32x4.max_u
            (local.get $l47)
            (local.get $l23)))
        (local.set $l23
          (i32x4.min_s
            (local.get $l51)
            (local.get $l23)))
        (v128.store align=1
          (local.get $l12)
          (f32x4.add
            (f32x4.add
              (local.get $l49)
              (local.get $l44))
            (local.get $l27)))
        (v128.store offset=1392
          (local.get $l9)
          (local.get $l24))
        (v128.store offset=1376
          (local.get $l9)
          (local.get $l25))
        (v128.store offset=1360
          (local.get $l9)
          (local.get $l26))
        (local.set $l12
          (i32.add
            (local.get $l12)
            (i32.const 16)))
        (local.set $l14
          (i32.add
            (local.get $l14)
            (i32.const 16)))
        (local.set $l24
          (local.get $l44))
        (local.set $l25
          (local.get $l49))
        (local.set $l26
          (local.get $l27))
        (br_if $L47
          (i32.ne
            (local.tee $l21
              (i32.add
                (local.get $l16)
                (i32.const -3)))
            (local.get $p5)))))
    (block $B56
      (br_if $B56
        (i32.eqz
          (v128.any_true
            (v128.or
              (i32x4.lt_s
                (local.get $l23)
                (v128.const i32x4 0x38100000 0x38100000 0x38100000 0x38100000))
              (i32x4.gt_u
                (local.get $l11)
                (v128.const i32x4 0x47e00000 0x47e00000 0x47e00000 0x47e00000))))))
      (call $blur_lane
        (local.get $p6)
        (local.get $p7)
        (local.get $p5)
        (local.get $p8)
        (i32.const 0))
      (call $blur_lane
        (local.get $p6)
        (local.get $p7)
        (local.get $p5)
        (local.get $p8)
        (i32.const 1))
      (call $blur_lane
        (local.get $p6)
        (local.get $p7)
        (local.get $p5)
        (local.get $p8)
        (i32.const 2))
      (call $blur_lane
        (local.get $p6)
        (local.get $p7)
        (local.get $p5)
        (local.get $p8)
        (i32.const 3)))
    (local.set $l10
      (i32.const 0))
    (block $B57
      (br_if $B57
        (i32.lt_s
          (local.get $p5)
          (i32.const 4)))
      (local.set $l15
        (i32.and
          (local.get $p4)
          (i32.const 2147483646)))
      (local.set $l17
        (i32.and
          (local.get $p4)
          (i32.const 1)))
      (local.set $l10
        (i32.const 0))
      (local.set $l12
        (i32.const 4))
      (loop $L58
        (local.set $l13
          (local.get $l10))
        (local.set $l10
          (local.get $l12))
        (v128.store offset=64
          (local.get $l9)
          (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
            (local.tee $l24
              (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                (local.tee $l11
                  (v128.load align=1
                    (local.tee $l12
                      (i32.add
                        (local.get $p7)
                        (i32.shl
                          (local.get $l13)
                          (i32.const 4))))))
                (local.tee $l23
                  (v128.load offset=16 align=1
                    (local.get $l12)))))
            (local.tee $l27
              (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                (local.tee $l25
                  (v128.load offset=32 align=1
                    (local.get $l12)))
                (local.tee $l26
                  (v128.load offset=48 align=1
                    (local.get $l12)))))))
        (v128.store offset=48
          (local.get $l9)
          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
            (local.get $l24)
            (local.get $l27)))
        (v128.store offset=32
          (local.get $l9)
          (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
            (local.tee $l11
              (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                (local.get $l11)
                (local.get $l23)))
            (local.tee $l23
              (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                (local.get $l25)
                (local.get $l26)))))
        (v128.store offset=16
          (local.get $l9)
          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
            (local.get $l11)
            (local.get $l23)))
        (block $B59
          (br_if $B59
            (i32.lt_s
              (local.get $p4)
              (i32.const 1)))
          (local.set $l16
            (i32.const 0))
          (block $B60
            (br_if $B60
              (i32.eq
                (local.get $p4)
                (i32.const 1)))
            (local.set $l16
              (i32.const 0))
            (local.set $l12
              (i32.add
                (local.get $l9)
                (i32.const 16)))
            (local.set $l14
              (local.get $p3))
            (loop $L61
              (v128.store align=1
                (i32.add
                  (i32.load
                    (local.get $l14))
                  (local.tee $p1
                    (i32.shl
                      (local.get $l13)
                      (i32.const 2))))
                (v128.load
                  (local.get $l12)))
              (v128.store align=1
                (i32.add
                  (i32.load
                    (i32.add
                      (local.get $l14)
                      (i32.const 4)))
                  (local.get $p1))
                (v128.load
                  (i32.add
                    (local.get $l12)
                    (i32.const 16))))
              (local.set $l12
                (i32.add
                  (local.get $l12)
                  (i32.const 32)))
              (local.set $l14
                (i32.add
                  (local.get $l14)
                  (i32.const 8)))
              (br_if $L61
                (i32.ne
                  (local.get $l15)
                  (local.tee $l16
                    (i32.add
                      (local.get $l16)
                      (i32.const 2))))))
            (br_if $B59
              (i32.eqz
                (local.get $l17))))
          (v128.store align=1
            (i32.add
              (i32.load
                (i32.add
                  (local.get $p3)
                  (i32.shl
                    (local.get $l16)
                    (i32.const 2))))
              (i32.shl
                (local.get $l13)
                (i32.const 2)))
            (v128.load
              (i32.add
                (i32.add
                  (local.get $l9)
                  (i32.const 16))
                (i32.shl
                  (local.get $l16)
                  (i32.const 4))))))
        (br_if $L58
          (i32.le_s
            (local.tee $l12
              (i32.add
                (local.get $l10)
                (i32.const 4)))
            (local.get $p5)))))
    (block $B62
      (br_if $B62
        (i32.ge_s
          (local.get $l10)
          (local.get $p5)))
      (br_if $B62
        (i32.lt_s
          (local.get $p4)
          (i32.const 1)))
      (local.set $l17
        (i32.and
          (local.get $p4)
          (i32.const 3)))
      (local.set $l13
        (i32.add
          (local.get $p7)
          (i32.shl
            (local.get $l10)
            (i32.const 4))))
      (local.set $l15
        (i32.sub
          (i32.const 0)
          (i32.and
            (local.get $p4)
            (i32.const 2147483644))))
      (loop $L63
        (local.set $l12
          (i32.const 0))
        (block $B64
          (block $B65
            (br_if $B65
              (i32.lt_u
                (local.get $p4)
                (i32.const 4)))
            (local.set $p1
              (i32.const 0))
            (local.set $l12
              (local.get $l13))
            (local.set $l14
              (local.get $p3))
            (loop $L66
              (f32.store
                (i32.add
                  (i32.load
                    (local.get $l14))
                  (local.tee $l16
                    (i32.shl
                      (local.get $l10)
                      (i32.const 2))))
                (f32.load
                  (local.get $l12)))
              (f32.store
                (i32.add
                  (i32.load
                    (i32.add
                      (local.get $l14)
                      (i32.const 4)))
                  (local.get $l16))
                (f32.load
                  (i32.add
                    (local.get $l12)
                    (i32.const 4))))
              (f32.store
                (i32.add
                  (i32.load
                    (i32.add
                      (local.get $l14)
                      (i32.const 8)))
                  (local.get $l16))
                (f32.load
                  (i32.add
                    (local.get $l12)
                    (i32.const 8))))
              (f32.store
                (i32.add
                  (i32.load
                    (i32.add
                      (local.get $l14)
                      (i32.const 12)))
                  (local.get $l16))
                (f32.load
                  (i32.add
                    (local.get $l12)
                    (i32.const 12))))
              (local.set $l12
                (i32.add
                  (local.get $l12)
                  (i32.const 16)))
              (local.set $l14
                (i32.add
                  (local.get $l14)
                  (i32.const 16)))
              (br_if $L66
                (i32.ne
                  (local.get $l15)
                  (local.tee $p1
                    (i32.add
                      (local.get $p1)
                      (i32.const -4))))))
            (br_if $B64
              (i32.eqz
                (local.get $l17)))
            (local.set $l12
              (i32.sub
                (i32.const 0)
                (local.get $p1))))
          (local.set $l12
            (i32.shl
              (local.get $l12)
              (i32.const 2)))
          (local.set $l14
            (local.get $l17))
          (loop $L67
            (f32.store
              (i32.add
                (i32.load
                  (i32.add
                    (local.get $p3)
                    (local.get $l12)))
                (i32.shl
                  (local.get $l10)
                  (i32.const 2)))
              (f32.load
                (i32.add
                  (local.get $l13)
                  (local.get $l12))))
            (local.set $l12
              (i32.add
                (local.get $l12)
                (i32.const 4)))
            (br_if $L67
              (local.tee $l14
                (i32.add
                  (local.get $l14)
                  (i32.const -1))))))
        (local.set $l13
          (i32.add
            (local.get $l13)
            (i32.const 16)))
        (br_if $L63
          (i32.ne
            (local.tee $l10
              (i32.add
                (local.get $l10)
                (i32.const 1)))
            (local.get $p5)))))
    (global.set $__stack_pointer
      (i32.add
        (local.get $l9)
        (i32.const 1456))))
  (func $vertical_row (type $t6) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32)
    (local $l8 i32) (local $l9 i32) (local $l10 i32) (local $l11 i32) (local $l12 i32) (local $l13 i32) (local $l14 i32) (local $l15 i32) (local $l16 f32) (local $l17 v128) (local $l18 f32) (local $l19 v128) (local $l20 f32) (local $l21 v128) (local $l22 v128) (local $l23 v128) (local $l24 v128) (local $l25 v128) (local $l26 v128) (local $l27 v128) (local $l28 v128) (local $l29 v128) (local $l30 v128) (local $l31 i32) (local $l32 i32) (local $l33 v128) (local $l34 v128) (local $l35 v128) (local $l36 i32) (local $l37 v128) (local $l38 v128) (local $l39 v128) (local $l40 v128) (local $l41 v128) (local $l42 v128) (local $l43 i32) (local $l44 v128) (local $l45 i32) (local $l46 v128) (local $l47 v128) (local $l48 v128) (local $l49 v128) (local $l50 v128) (local $l51 v128) (local $l52 i32) (local $l53 v128) (local $l54 i32)
    (local.set $l8
      (i32.add
        (local.get $p1)
        (i32.mul
          (local.get $p3)
          (i32.const 20))))
    (local.set $l9
      (i32.add
        (local.get $p1)
        (i32.shl
          (local.get $p3)
          (i32.const 4))))
    (local.set $l10
      (i32.add
        (local.get $p1)
        (i32.mul
          (local.get $p3)
          (i32.const 12))))
    (local.set $l11
      (i32.add
        (local.get $p1)
        (i32.shl
          (local.get $p3)
          (i32.const 3))))
    (local.set $l12
      (i32.add
        (local.get $p1)
        (i32.shl
          (local.get $p3)
          (i32.const 2))))
    (local.set $l13
      (i32.const 0))
    (block $B0
      (br_if $B0
        (i32.lt_s
          (local.get $p3)
          (i32.const 4)))
      (local.set $l14
        (i32.add
          (local.get $p0)
          (i32.shl
            (local.get $p5)
            (i32.const 2))))
      (local.set $l15
        (i32.add
          (local.get $p0)
          (i32.shl
            (local.get $p4)
            (i32.const 2))))
      (local.set $l17
        (f32x4.splat
          (local.tee $l16
            (f32.load offset=8
              (local.get $p7)))))
      (local.set $l19
        (f32x4.splat
          (local.tee $l18
            (f32.load offset=4
              (local.get $p7)))))
      (local.set $l21
        (f32x4.splat
          (local.tee $l20
            (f32.load
              (local.get $p7)))))
      (local.set $l22
        (f64x2.splat
          (f64.promote_f32
            (local.get $l16))))
      (local.set $l23
        (f32x4.splat
          (local.tee $l16
            (f32.neg
              (f32.load offset=20
                (local.get $p7))))))
      (local.set $l24
        (f64x2.splat
          (f64.promote_f32
            (local.get $l18))))
      (local.set $l25
        (f32x4.splat
          (local.tee $l18
            (f32.neg
              (f32.load offset=16
                (local.get $p7))))))
      (local.set $l26
        (f64x2.splat
          (f64.promote_f32
            (local.get $l20))))
      (local.set $l27
        (f32x4.splat
          (local.tee $l20
            (f32.neg
              (f32.load offset=12
                (local.get $p7))))))
      (local.set $l28
        (f64x2.splat
          (f64.promote_f32
            (local.get $l16))))
      (local.set $l29
        (f64x2.splat
          (f64.promote_f32
            (local.get $l18))))
      (local.set $l30
        (f64x2.splat
          (f64.promote_f32
            (local.get $l20))))
      (local.set $l31
        (i32.const 0))
      (local.set $l32
        (i32.const 0))
      (loop $L1
        (local.set $l34
          (local.tee $l33
            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
        (block $B2
          (br_if $B2
            (i32.lt_s
              (local.get $p4)
              (i32.const 0)))
          (local.set $l34
            (v128.load align=1
              (i32.add
                (local.get $l15)
                (local.get $l31)))))
        (block $B3
          (br_if $B3
            (i32.lt_s
              (local.get $p5)
              (i32.const 0)))
          (local.set $l33
            (v128.load align=1
              (i32.add
                (local.get $l14)
                (local.get $l31)))))
        (local.set $l41
          (v128.and
            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
              (local.tee $l38
                (f64x2.add
                  (f64x2.mul
                    (local.get $l30)
                    (f64x2.promote_low_f32x4
                      (local.tee $l35
                        (v128.load align=1
                          (local.tee $l13
                            (i32.add
                              (local.get $p1)
                              (local.get $l31)))))))
                  (f64x2.promote_low_f32x4
                    (local.tee $l37
                      (f32x4.neg
                        (v128.load align=1
                          (local.tee $l36
                            (i32.add
                              (local.get $l12)
                              (local.get $l31)))))))))
              (local.tee $l39
                (f64x2.add
                  (f64x2.mul
                    (local.get $l30)
                    (f64x2.promote_low_f32x4
                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                        (local.get $l35)
                        (local.get $l35))))
                  (f64x2.promote_low_f32x4
                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                      (local.get $l37)
                      (local.get $l37))))))
            (local.tee $l40
              (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
        (local.set $l42
          (f32x4.add
            (local.get $l34)
            (local.get $l33)))
        (local.set $l44
          (v128.load align=1
            (local.tee $l43
              (i32.add
                (local.get $l9)
                (local.get $l31)))))
        (local.set $l46
          (v128.load align=1
            (local.tee $l45
              (i32.add
                (local.get $l11)
                (local.get $l31)))))
        (block $B4
          (block $B5
            (br_if $B5
              (v128.any_true
                (i32x4.eq
                  (v128.and
                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                      (local.get $l38)
                      (local.get $l39))
                    (local.tee $l33
                      (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                  (local.tee $l34
                    (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
            (local.set $l37
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l38))
                (f32x4.demote_f64x2_zero
                  (local.get $l39))))
            (br $B4))
          (local.set $l37
            (call $fma4_tie
              (local.get $l27)
              (local.get $l35)
              (local.get $l37))))
        (local.set $l50
          (i32x4.max_u
            (local.get $l41)
            (local.tee $l49
              (v128.and
                (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                  (local.tee $l47
                    (f64x2.add
                      (f64x2.mul
                        (local.get $l26)
                        (local.tee $l38
                          (f64x2.promote_low_f32x4
                            (local.get $l42))))
                      (f64x2.promote_low_f32x4
                        (local.get $l37))))
                  (local.tee $l48
                    (f64x2.add
                      (f64x2.mul
                        (local.get $l26)
                        (local.tee $l39
                          (f64x2.promote_low_f32x4
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                              (local.get $l42)
                              (local.get $l42)))))
                      (f64x2.promote_low_f32x4
                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                          (local.get $l37)
                          (local.get $l37))))))
                (local.get $l40)))))
        (local.set $l49
          (i32x4.min_u
            (local.get $l41)
            (local.get $l49)))
        (block $B6
          (block $B7
            (br_if $B7
              (v128.any_true
                (i32x4.eq
                  (v128.and
                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                      (local.get $l47)
                      (local.get $l48))
                    (local.get $l33))
                  (local.get $l34))))
            (local.set $l51
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l47))
                (f32x4.demote_f64x2_zero
                  (local.get $l48))))
            (br $B6))
          (local.set $l51
            (call $fma4_tie
              (local.get $l21)
              (local.get $l42)
              (local.get $l37))))
        (local.set $l50
          (i32x4.max_u
            (local.get $l50)
            (local.tee $l48
              (v128.and
                (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                  (local.tee $l41
                    (f64x2.add
                      (f64x2.mul
                        (local.get $l29)
                        (f64x2.promote_low_f32x4
                          (local.get $l46)))
                      (f64x2.promote_low_f32x4
                        (local.tee $l37
                          (f32x4.neg
                            (v128.load align=1
                              (local.tee $l52
                                (i32.add
                                  (local.get $l10)
                                  (local.get $l31)))))))))
                  (local.tee $l47
                    (f64x2.add
                      (f64x2.mul
                        (local.get $l29)
                        (f64x2.promote_low_f32x4
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                            (local.get $l46)
                            (local.get $l46))))
                      (f64x2.promote_low_f32x4
                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                          (local.get $l37)
                          (local.get $l37))))))
                (local.get $l40)))))
        (local.set $l48
          (i32x4.min_u
            (local.get $l49)
            (local.get $l48)))
        (block $B8
          (block $B9
            (br_if $B9
              (v128.any_true
                (i32x4.eq
                  (v128.and
                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                      (local.get $l41)
                      (local.get $l47))
                    (local.get $l33))
                  (local.get $l34))))
            (local.set $l37
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l41))
                (f32x4.demote_f64x2_zero
                  (local.get $l47))))
            (br $B8))
          (local.set $l37
            (call $fma4_tie
              (local.get $l25)
              (local.get $l46)
              (local.get $l37))))
        (local.set $l50
          (i32x4.max_u
            (local.get $l50)
            (local.tee $l49
              (v128.and
                (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                  (local.tee $l41
                    (f64x2.add
                      (f64x2.mul
                        (local.get $l24)
                        (local.get $l38))
                      (f64x2.promote_low_f32x4
                        (local.get $l37))))
                  (local.tee $l47
                    (f64x2.add
                      (f64x2.mul
                        (local.get $l24)
                        (local.get $l39))
                      (f64x2.promote_low_f32x4
                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                          (local.get $l37)
                          (local.get $l37))))))
                (local.get $l40)))))
        (local.set $l48
          (i32x4.min_u
            (local.get $l48)
            (local.get $l49)))
        (block $B10
          (block $B11
            (br_if $B11
              (v128.any_true
                (i32x4.eq
                  (v128.and
                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                      (local.get $l41)
                      (local.get $l47))
                    (local.get $l33))
                  (local.get $l34))))
            (local.set $l53
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l41))
                (f32x4.demote_f64x2_zero
                  (local.get $l47))))
            (br $B10))
          (local.set $l53
            (call $fma4_tie
              (local.get $l19)
              (local.get $l42)
              (local.get $l37))))
        (local.set $l50
          (i32x4.max_u
            (local.get $l50)
            (local.tee $l49
              (v128.and
                (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                  (local.tee $l41
                    (f64x2.add
                      (f64x2.mul
                        (local.get $l28)
                        (f64x2.promote_low_f32x4
                          (local.get $l44)))
                      (f64x2.promote_low_f32x4
                        (local.tee $l37
                          (f32x4.neg
                            (v128.load align=1
                              (local.tee $l54
                                (i32.add
                                  (local.get $l8)
                                  (local.get $l31)))))))))
                  (local.tee $l47
                    (f64x2.add
                      (f64x2.mul
                        (local.get $l28)
                        (f64x2.promote_low_f32x4
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                            (local.get $l44)
                            (local.get $l44))))
                      (f64x2.promote_low_f32x4
                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                          (local.get $l37)
                          (local.get $l37))))))
                (local.get $l40)))))
        (local.set $l48
          (i32x4.min_u
            (local.get $l48)
            (local.get $l49)))
        (block $B12
          (block $B13
            (br_if $B13
              (v128.any_true
                (i32x4.eq
                  (v128.and
                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                      (local.get $l41)
                      (local.get $l47))
                    (local.get $l33))
                  (local.get $l34))))
            (local.set $l37
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l41))
                (f32x4.demote_f64x2_zero
                  (local.get $l47))))
            (br $B12))
          (local.set $l37
            (call $fma4_tie
              (local.get $l23)
              (local.get $l44)
              (local.get $l37))))
        (local.set $l39
          (i32x4.max_u
            (local.get $l50)
            (local.tee $l40
              (v128.and
                (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                  (local.tee $l41
                    (f64x2.add
                      (f64x2.mul
                        (local.get $l22)
                        (local.get $l38))
                      (f64x2.promote_low_f32x4
                        (local.get $l37))))
                  (local.tee $l38
                    (f64x2.add
                      (f64x2.mul
                        (local.get $l22)
                        (local.get $l39))
                      (f64x2.promote_low_f32x4
                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                          (local.get $l37)
                          (local.get $l37))))))
                (local.get $l40)))))
        (local.set $l40
          (i32x4.min_u
            (local.get $l48)
            (local.get $l40)))
        (block $B14
          (block $B15
            (br_if $B15
              (v128.any_true
                (i32x4.eq
                  (v128.and
                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                      (local.get $l41)
                      (local.get $l38))
                    (local.get $l33))
                  (local.get $l34))))
            (local.set $l33
              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                (f32x4.demote_f64x2_zero
                  (local.get $l41))
                (f32x4.demote_f64x2_zero
                  (local.get $l38))))
            (br $B14))
          (local.set $l33
            (call $fma4_tie
              (local.get $l17)
              (local.get $l42)
              (local.get $l37))))
        (block $B16
          (block $B17
            (br_if $B17
              (i32.eqz
                (v128.any_true
                  (v128.or
                    (i32x4.lt_u
                      (local.get $l40)
                      (v128.const i32x4 0x38100000 0x38100000 0x38100000 0x38100000))
                    (i32x4.gt_u
                      (local.get $l39)
                      (v128.const i32x4 0x47e00000 0x47e00000 0x47e00000 0x47e00000))))))
            (call $vertical_column
              (local.get $p0)
              (local.get $p1)
              (local.get $l12)
              (local.get $l11)
              (local.get $l10)
              (local.get $l9)
              (local.get $l8)
              (local.get $p2)
              (local.get $l32)
              (local.get $p4)
              (local.get $p5)
              (local.get $p6)
              (local.get $p7))
            (call $vertical_column
              (local.get $p0)
              (local.get $p1)
              (local.get $l12)
              (local.get $l11)
              (local.get $l10)
              (local.get $l9)
              (local.get $l8)
              (local.get $p2)
              (i32.add
                (local.get $l32)
                (i32.const 1))
              (local.get $p4)
              (local.get $p5)
              (local.get $p6)
              (local.get $p7))
            (call $vertical_column
              (local.get $p0)
              (local.get $p1)
              (local.get $l12)
              (local.get $l11)
              (local.get $l10)
              (local.get $l9)
              (local.get $l8)
              (local.get $p2)
              (i32.add
                (local.get $l32)
                (i32.const 2))
              (local.get $p4)
              (local.get $p5)
              (local.get $p6)
              (local.get $p7))
            (call $vertical_column
              (local.get $p0)
              (local.get $p1)
              (local.get $l12)
              (local.get $l11)
              (local.get $l10)
              (local.get $l9)
              (local.get $l8)
              (local.get $p2)
              (i32.add
                (local.get $l32)
                (i32.const 3))
              (local.get $p4)
              (local.get $p5)
              (local.get $p6)
              (local.get $p7))
            (br $B16))
          (block $B18
            (br_if $B18
              (i32.eqz
                (local.get $p6)))
            (v128.store align=1
              (i32.add
                (local.get $p2)
                (local.get $l31))
              (f32x4.add
                (f32x4.add
                  (local.get $l53)
                  (local.get $l33))
                (local.get $l51))))
          (v128.store align=1
            (local.get $l36)
            (local.get $l35))
          (v128.store align=1
            (local.get $l13)
            (local.get $l51))
          (v128.store align=1
            (local.get $l52)
            (local.get $l46))
          (v128.store align=1
            (local.get $l45)
            (local.get $l53))
          (v128.store align=1
            (local.get $l54)
            (local.get $l44))
          (v128.store align=1
            (local.get $l43)
            (local.get $l33)))
        (local.set $l31
          (i32.add
            (local.get $l31)
            (i32.const 16)))
        (local.set $l36
          (i32.add
            (local.get $l32)
            (i32.const 8)))
        (local.set $l32
          (local.tee $l13
            (i32.add
              (local.get $l32)
              (i32.const 4))))
        (br_if $L1
          (i32.le_s
            (local.get $l36)
            (local.get $p3)))))
    (block $B19
      (br_if $B19
        (i32.ge_s
          (local.get $l13)
          (local.get $p3)))
      (loop $L20
        (call $vertical_column
          (local.get $p0)
          (local.get $p1)
          (local.get $l12)
          (local.get $l11)
          (local.get $l10)
          (local.get $l9)
          (local.get $l8)
          (local.get $p2)
          (local.get $l13)
          (local.get $p4)
          (local.get $p5)
          (local.get $p6)
          (local.get $p7))
        (br_if $L20
          (i32.ne
            (local.get $p3)
            (local.tee $l13
              (i32.add
                (local.get $l13)
                (i32.const 1))))))))
  (func $row_sums (type $t4) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32)
    (local $l10 i32) (local $l11 f64) (local $l12 f64) (local $l13 f64) (local $l14 f64) (local $l15 f64) (local $l16 f64) (local $l17 i32) (local $l18 i32) (local $l19 i32) (local $l20 i32) (local $l21 i32) (local $l22 i32) (local $l23 i32) (local $l24 i32) (local $l25 i32) (local $l26 i32) (local $l27 i32) (local $l28 i32) (local $l29 i32) (local $l30 v128) (local $l31 v128) (local $l32 v128) (local $l33 v128) (local $l34 v128) (local $l35 v128) (local $l36 v128) (local $l37 v128) (local $l38 v128) (local $l39 v128) (local $l40 v128) (local $l41 v128) (local $l42 v128) (local $l43 v128) (local $l44 f64) (local $l45 f64) (local $l46 f64) (local $l47 f64) (local $l48 f32) (local $l49 f32) (local $l50 f32)
    (local.set $l10
      (i32.mul
        (local.get $p6)
        (local.get $p5)))
    (local.set $l11
      (f64.load offset=40
        (local.get $p7)))
    (local.set $l12
      (f64.load offset=32
        (local.get $p7)))
    (local.set $l13
      (f64.load offset=24
        (local.get $p7)))
    (local.set $l14
      (f64.load offset=16
        (local.get $p7)))
    (local.set $l15
      (f64.load offset=8
        (local.get $p7)))
    (local.set $l16
      (f64.load
        (local.get $p7)))
    (local.set $l17
      (i32.const 0))
    (block $B0
      (br_if $B0
        (i32.lt_s
          (local.get $p5)
          (i32.const 4)))
      (local.set $l20
        (i32.add
          (i32.add
            (local.get $p3)
            (i32.shl
              (local.get $l10)
              (i32.const 3)))
          (local.tee $l19
            (i32.shl
              (local.tee $l18
                (i32.mul
                  (local.get $p5)
                  (local.get $p4)))
              (i32.const 2)))))
      (local.set $l21
        (i32.add
          (i32.add
            (local.get $p3)
            (i32.shl
              (local.get $l10)
              (i32.const 2)))
          (local.get $l19)))
      (local.set $l22
        (i32.shl
          (local.get $l18)
          (i32.const 3)))
      (local.set $l23
        (i32.load offset=12
          (local.get $p2)))
      (local.set $l24
        (i32.load offset=16
          (local.get $p2)))
      (local.set $l25
        (i32.load offset=4
          (local.get $p2)))
      (local.set $l19
        (i32.const 0))
      (local.set $l26
        (local.get $p9))
      (local.set $l27
        (local.get $p8))
      (local.set $l18
        (i32.const 0))
      (loop $L1
        (local.set $l28
          (local.get $l21))
        (local.set $l29
          (local.get $l20))
        (block $B2
          (br_if $B2
            (local.get $p3))
          (local.set $l29
            (i32.load offset=8
              (local.get $p2)))
          (local.set $l28
            (i32.load
              (local.get $p2))))
        (local.set $l37
          (f64x2.mul
            (local.tee $l36
              (f64x2.mul
                (local.tee $l35
                  (v128.and
                    (v128.not
                      (f64x2.le
                        (local.tee $l35
                          (f64x2.sub
                            (local.tee $l30
                              (v128.const i32x4 0x00000000 0x3ff00000 0x00000000 0x3ff00000))
                            (f64x2.promote_low_f32x4
                              (local.tee $l34
                                (f32x4.div
                                  (f32x4.mul
                                    (f32x4.sub
                                      (v128.const i32x4 0x3f800000 0x3f800000 0x3f800000 0x3f800000)
                                      (f32x4.mul
                                        (local.tee $l33
                                          (f32x4.sub
                                            (local.tee $l31
                                              (v128.load align=1
                                                (i32.add
                                                  (local.get $l28)
                                                  (local.get $l18))))
                                            (local.tee $l32
                                              (v128.load align=1
                                                (i32.add
                                                  (local.get $l25)
                                                  (local.get $l18))))))
                                        (local.get $l33)))
                                    (f32x4.add
                                      (f32x4.add
                                        (local.tee $l33
                                          (f32x4.sub
                                            (v128.load align=1
                                              (i32.add
                                                (local.get $l24)
                                                (local.get $l18)))
                                            (f32x4.mul
                                              (local.get $l31)
                                              (local.get $l32))))
                                        (local.get $l33))
                                      (local.tee $l33
                                        (v128.const i32x4 0x3a6bedfa 0x3a6bedfa 0x3a6bedfa 0x3a6bedfa))))
                                  (f32x4.add
                                    (f32x4.add
                                      (f32x4.sub
                                        (v128.load align=1
                                          (i32.add
                                            (local.get $l29)
                                            (local.get $l18)))
                                        (f32x4.mul
                                          (local.get $l31)
                                          (local.get $l31)))
                                      (f32x4.sub
                                        (v128.load align=1
                                          (i32.add
                                            (local.get $l23)
                                            (local.get $l18)))
                                        (f32x4.mul
                                          (local.get $l32)
                                          (local.get $l32))))
                                    (local.get $l33)))))))
                        (local.tee $l33
                          (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))))
                    (local.get $l35)))
                (local.get $l35)))
            (local.get $l36)))
        (local.set $l38
          (f64x2.mul
            (local.tee $l36
              (f64x2.mul
                (local.tee $l34
                  (v128.and
                    (v128.not
                      (f64x2.le
                        (local.tee $l34
                          (f64x2.sub
                            (local.get $l30)
                            (f64x2.promote_low_f32x4
                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                (local.get $l34)
                                (local.get $l34)))))
                        (local.get $l33)))
                    (local.get $l34)))
                (local.get $l34)))
            (local.get $l36)))
        (local.set $l42
          (f64x2.mul
            (local.tee $l36
              (f64x2.mul
                (local.tee $l32
                  (v128.and
                    (v128.not
                      (f64x2.ge
                        (local.tee $l31
                          (f64x2.add
                            (f64x2.div
                              (f64x2.add
                                (f64x2.promote_low_f32x4
                                  (local.tee $l39
                                    (f32x4.abs
                                      (f32x4.sub
                                        (v128.load align=1
                                          (i32.add
                                            (local.get $p1)
                                            (local.get $l18)))
                                        (local.get $l32)))))
                                (local.get $l30))
                              (f64x2.add
                                (f64x2.promote_low_f32x4
                                  (local.tee $l40
                                    (f32x4.abs
                                      (f32x4.sub
                                        (v128.load align=1
                                          (i32.add
                                            (local.get $p0)
                                            (local.get $l18)))
                                        (local.get $l31)))))
                                (local.get $l30)))
                            (local.tee $l41
                              (v128.const i32x4 0x00000000 0xbff00000 0x00000000 0xbff00000))))
                        (local.get $l33)))
                    (f64x2.neg
                      (local.get $l31))))
                (local.get $l32)))
            (local.get $l36)))
        (local.set $l43
          (f64x2.mul
            (local.tee $l43
              (f64x2.mul
                (local.tee $l36
                  (v128.and
                    (v128.not
                      (f64x2.le
                        (local.get $l31)
                        (local.get $l33)))
                    (local.get $l31)))
                (local.get $l36)))
            (local.get $l43)))
        (local.set $l40
          (f64x2.mul
            (local.tee $l40
              (f64x2.mul
                (local.tee $l39
                  (v128.and
                    (v128.not
                      (f64x2.ge
                        (local.tee $l30
                          (f64x2.add
                            (f64x2.div
                              (f64x2.add
                                (f64x2.promote_low_f32x4
                                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                    (local.get $l39)
                                    (local.get $l39)))
                                (local.get $l30))
                              (f64x2.add
                                (f64x2.promote_low_f32x4
                                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                    (local.get $l40)
                                    (local.get $l40)))
                                (local.get $l30)))
                            (local.get $l41)))
                        (local.get $l33)))
                    (f64x2.neg
                      (local.get $l30))))
                (local.get $l39)))
            (local.get $l40)))
        (local.set $l41
          (f64x2.mul
            (local.tee $l41
              (f64x2.mul
                (local.tee $l33
                  (v128.and
                    (v128.not
                      (f64x2.le
                        (local.get $l30)
                        (local.get $l33)))
                    (local.get $l30)))
                (local.get $l33)))
            (local.get $l41)))
        (block $B3
          (block $B4
            (br_if $B4
              (local.get $p8))
            (local.set $l44
              (f64x2.extract_lane 1
                (local.get $l34)))
            (local.set $l45
              (f64x2.extract_lane 0
                (local.get $l34)))
            (local.set $l46
              (f64x2.extract_lane 1
                (local.get $l35)))
            (local.set $l47
              (f64x2.extract_lane 0
                (local.get $l35)))
            (br $B3))
          (f64.store
            (local.tee $l28
              (i32.add
                (local.get $l27)
                (local.get $l22)))
            (local.tee $l47
              (f64x2.extract_lane 0
                (local.get $l35))))
          (f64.store
            (local.tee $l29
              (i32.add
                (local.get $l26)
                (local.get $l22)))
            (f64x2.extract_lane 0
              (local.get $l31)))
          (f64.store
            (i32.add
              (local.get $l28)
              (i32.const 8))
            (local.tee $l46
              (f64x2.extract_lane 1
                (local.get $l35))))
          (f64.store
            (i32.add
              (local.get $l29)
              (i32.const 8))
            (f64x2.extract_lane 1
              (local.get $l31)))
          (f64.store
            (i32.add
              (local.get $l28)
              (i32.const 16))
            (local.tee $l45
              (f64x2.extract_lane 0
                (local.get $l34))))
          (f64.store
            (i32.add
              (local.get $l29)
              (i32.const 16))
            (f64x2.extract_lane 0
              (local.get $l30)))
          (f64.store
            (i32.add
              (local.get $l28)
              (i32.const 24))
            (local.tee $l44
              (f64x2.extract_lane 1
                (local.get $l34))))
          (f64.store
            (i32.add
              (local.get $l29)
              (i32.const 24))
            (f64x2.extract_lane 1
              (local.get $l30))))
        (local.set $l26
          (i32.add
            (local.get $l26)
            (i32.const 32)))
        (local.set $l27
          (i32.add
            (local.get $l27)
            (i32.const 32)))
        (local.set $l18
          (i32.add
            (local.get $l18)
            (i32.const 16)))
        (local.set $l16
          (f64.add
            (f64.add
              (f64.add
                (f64.add
                  (local.get $l16)
                  (local.get $l47))
                (local.get $l46))
              (local.get $l45))
            (local.get $l44)))
        (local.set $l11
          (f64.add
            (f64.add
              (f64.add
                (f64.add
                  (local.get $l11)
                  (f64x2.extract_lane 0
                    (local.get $l42)))
                (f64x2.extract_lane 1
                  (local.get $l42)))
              (f64x2.extract_lane 0
                (local.get $l40)))
            (f64x2.extract_lane 1
              (local.get $l40))))
        (local.set $l12
          (f64.add
            (f64.add
              (f64.add
                (f64.add
                  (local.get $l12)
                  (f64x2.extract_lane 0
                    (local.get $l32)))
                (f64x2.extract_lane 1
                  (local.get $l32)))
              (f64x2.extract_lane 0
                (local.get $l39)))
            (f64x2.extract_lane 1
              (local.get $l39))))
        (local.set $l13
          (f64.add
            (f64.add
              (f64.add
                (f64.add
                  (local.get $l13)
                  (f64x2.extract_lane 0
                    (local.get $l43)))
                (f64x2.extract_lane 1
                  (local.get $l43)))
              (f64x2.extract_lane 0
                (local.get $l41)))
            (f64x2.extract_lane 1
              (local.get $l41))))
        (local.set $l14
          (f64.add
            (f64.add
              (f64.add
                (f64.add
                  (local.get $l14)
                  (f64x2.extract_lane 0
                    (local.get $l36)))
                (f64x2.extract_lane 1
                  (local.get $l36)))
              (f64x2.extract_lane 0
                (local.get $l33)))
            (f64x2.extract_lane 1
              (local.get $l33))))
        (local.set $l15
          (f64.add
            (f64.add
              (f64.add
                (f64.add
                  (local.get $l15)
                  (f64x2.extract_lane 0
                    (local.get $l37)))
                (f64x2.extract_lane 1
                  (local.get $l37)))
              (f64x2.extract_lane 0
                (local.get $l38)))
            (f64x2.extract_lane 1
              (local.get $l38))))
        (local.set $l28
          (i32.add
            (local.get $l19)
            (i32.const 8)))
        (local.set $l19
          (local.tee $l17
            (i32.add
              (local.get $l19)
              (i32.const 4))))
        (br_if $L1
          (i32.le_s
            (local.get $l28)
            (local.get $p5)))))
    (block $B5
      (br_if $B5
        (i32.le_s
          (local.get $p5)
          (local.get $l17)))
      (local.set $l22
        (i32.add
          (i32.add
            (local.get $p3)
            (i32.shl
              (local.get $l10)
              (i32.const 3)))
          (i32.shl
            (local.tee $l19
              (i32.mul
                (local.get $p5)
                (local.get $p4)))
            (i32.const 2))))
      (local.set $l18
        (i32.shl
          (local.get $l17)
          (i32.const 2)))
      (local.set $l29
        (i32.sub
          (local.get $p5)
          (local.get $l17)))
      (local.set $l19
        (i32.add
          (local.get $p8)
          (local.tee $l26
            (i32.shl
              (i32.add
                (local.get $l17)
                (local.get $l19))
              (i32.const 3)))))
      (local.set $l26
        (i32.add
          (local.get $p9)
          (local.get $l26)))
      (local.set $p5
        (i32.add
          (local.get $p3)
          (i32.shl
            (i32.mul
              (i32.add
                (local.get $p6)
                (local.get $p4))
              (local.get $p5))
            (i32.const 2))))
      (local.set $l17
        (i32.load offset=12
          (local.get $p2)))
      (local.set $l20
        (i32.load offset=16
          (local.get $p2)))
      (local.set $l21
        (i32.load offset=4
          (local.get $p2)))
      (loop $L6
        (local.set $l27
          (local.get $p5))
        (local.set $l28
          (local.get $l22))
        (block $B7
          (br_if $B7
            (local.get $p3))
          (local.set $l28
            (i32.load offset=8
              (local.get $p2)))
          (local.set $l27
            (i32.load
              (local.get $p2))))
        (local.set $l45
          (select
            (f64.const 0x0p+0 (;=0;))
            (local.tee $l44
              (f64.sub
                (f64.const 0x1p+0 (;=1;))
                (f64.promote_f32
                  (f32.div
                    (f32.mul
                      (f32.sub
                        (f32.const 0x1p+0 (;=1;))
                        (f32.mul
                          (local.tee $l50
                            (f32.sub
                              (local.tee $l48
                                (f32.load
                                  (i32.add
                                    (local.get $l27)
                                    (local.get $l18))))
                              (local.tee $l49
                                (f32.load
                                  (i32.add
                                    (local.get $l21)
                                    (local.get $l18))))))
                          (local.get $l50)))
                      (f32.add
                        (f32.add
                          (local.tee $l50
                            (f32.sub
                              (f32.load
                                (i32.add
                                  (local.get $l20)
                                  (local.get $l18)))
                              (f32.mul
                                (local.get $l48)
                                (local.get $l49))))
                          (local.get $l50))
                        (f32.const 0x1.d7dbf4p-11 (;=0.0009;))))
                    (f32.add
                      (f32.add
                        (f32.sub
                          (f32.load
                            (i32.add
                              (local.get $l28)
                              (local.get $l18)))
                          (f32.mul
                            (local.get $l48)
                            (local.get $l48)))
                        (f32.sub
                          (f32.load
                            (i32.add
                              (local.get $l17)
                              (local.get $l18)))
                          (f32.mul
                            (local.get $l49)
                            (local.get $l49))))
                      (f32.const 0x1.d7dbf4p-11 (;=0.0009;)))))))
            (f64.le
              (local.get $l44)
              (f64.const 0x0p+0 (;=0;)))))
        (local.set $l44
          (f64.add
            (f64.div
              (f64.add
                (f64.promote_f32
                  (f32.abs
                    (f32.sub
                      (f32.load
                        (i32.add
                          (local.get $p1)
                          (local.get $l18)))
                      (local.get $l49))))
                (f64.const 0x1p+0 (;=1;)))
              (f64.add
                (f64.promote_f32
                  (f32.abs
                    (f32.sub
                      (f32.load
                        (i32.add
                          (local.get $p0)
                          (local.get $l18)))
                      (local.get $l48))))
                (f64.const 0x1p+0 (;=1;))))
            (f64.const -0x1p+0 (;=-1;))))
        (block $B8
          (br_if $B8
            (i32.eqz
              (local.get $p8)))
          (f64.store
            (local.get $l19)
            (local.get $l45))
          (f64.store
            (local.get $l26)
            (local.get $l44)))
        (local.set $l18
          (i32.add
            (local.get $l18)
            (i32.const 4)))
        (local.set $l19
          (i32.add
            (local.get $l19)
            (i32.const 8)))
        (local.set $l26
          (i32.add
            (local.get $l26)
            (i32.const 8)))
        (local.set $l16
          (f64.add
            (local.get $l16)
            (local.get $l45)))
        (local.set $l12
          (f64.add
            (local.get $l12)
            (local.tee $l46
              (select
                (f64.const 0x0p+0 (;=0;))
                (f64.neg
                  (local.get $l44))
                (f64.ge
                  (local.get $l44)
                  (f64.const 0x0p+0 (;=0;)))))))
        (local.set $l14
          (f64.add
            (local.get $l14)
            (local.tee $l44
              (select
                (f64.const 0x0p+0 (;=0;))
                (local.get $l44)
                (f64.le
                  (local.get $l44)
                  (f64.const 0x0p+0 (;=0;)))))))
        (local.set $l15
          (f64.add
            (local.get $l15)
            (f64.mul
              (local.tee $l45
                (f64.mul
                  (local.get $l45)
                  (local.get $l45)))
              (local.get $l45))))
        (local.set $l11
          (f64.add
            (local.get $l11)
            (f64.mul
              (local.tee $l45
                (f64.mul
                  (local.get $l46)
                  (local.get $l46)))
              (local.get $l45))))
        (local.set $l13
          (f64.add
            (local.get $l13)
            (f64.mul
              (local.tee $l44
                (f64.mul
                  (local.get $l44)
                  (local.get $l44)))
              (local.get $l44))))
        (br_if $L6
          (local.tee $l29
            (i32.add
              (local.get $l29)
              (i32.const -1))))))
    (f64.store offset=40
      (local.get $p7)
      (local.get $l11))
    (f64.store offset=32
      (local.get $p7)
      (local.get $l12))
    (f64.store offset=24
      (local.get $p7)
      (local.get $l13))
    (f64.store offset=16
      (local.get $p7)
      (local.get $l14))
    (f64.store offset=8
      (local.get $p7)
      (local.get $l15))
    (f64.store
      (local.get $p7)
      (local.get $l16)))
  (func $s2_metric_band (type $t7) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (result i32)
    (local $l16 i32) (local $l17 i32) (local $l18 i32) (local $l19 i32) (local $l20 i32) (local $l21 i32) (local $l22 i32) (local $l23 i32) (local $l24 i32) (local $l25 i32) (local $l26 v128) (local $l27 i32) (local $l28 i32) (local $l29 i32) (local $l30 i32) (local $l31 i32) (local $l32 i32) (local $l33 i32) (local $l34 i32) (local $l35 v128) (local $l36 i32) (local $l37 i32) (local $l38 i32) (local $l39 i32) (local $l40 i32) (local $l41 i32) (local $l42 i32) (local $l43 i32) (local $l44 i32) (local $l45 i32) (local $l46 i32) (local $l47 i32) (local $l48 i32) (local $l49 i32) (local $l50 i32) (local $l51 v128) (local $l52 v128) (local $l53 i32) (local $l54 i32) (local $l55 i32) (local $l56 i32)
    (global.set $__stack_pointer
      (local.tee $l16
        (i32.sub
          (global.get $__stack_pointer)
          (i32.const 272))))
    (i32.store offset=268
      (local.get $l16)
      (i32.const 0))
    (i64.store offset=260 align=4
      (local.get $l16)
      (i64.const 0))
    (i32.store offset=248
      (local.get $l16)
      (local.get $p12))
    (i32.store offset=252
      (local.get $l16)
      (local.tee $l18
        (i32.add
          (local.get $p12)
          (local.tee $l17
            (i32.shl
              (local.get $p0)
              (i32.const 6))))))
    (i32.store offset=256
      (local.get $l16)
      (local.tee $l18
        (i32.add
          (local.get $l18)
          (local.get $l17))))
    (i32.store offset=236
      (local.get $l16)
      (local.tee $l18
        (i32.add
          (local.get $l18)
          (local.get $l17))))
    (i32.store offset=240
      (local.get $l16)
      (local.tee $l18
        (i32.add
          (local.get $l18)
          (local.get $l17))))
    (i32.store offset=244
      (local.get $l16)
      (local.tee $l18
        (i32.add
          (local.get $l18)
          (local.get $l17))))
    (local.set $l18
      (i32.add
        (local.tee $l21
          (i32.add
            (local.tee $l19
              (i32.add
                (local.get $l18)
                (local.get $l17)))
            (local.tee $l20
              (i32.shl
                (local.get $p0)
                (i32.const 4)))))
        (local.get $l20)))
    (local.set $l22
      (i32.mul
        (local.get $p0)
        (i32.const 6)))
    (block $B0
      (block $B1
        (br_if $B1
          (i32.ne
            (local.get $p2)
            (i32.const -4)))
        (block $B2
          (block $B3
            (br_if $B3
              (i32.gt_s
                (local.get $p0)
                (i32.const 0)))
            (i32.store offset=176
              (local.get $l16)
              (local.get $l18))
            (i32.store offset=112
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $l18)
                  (local.tee $l17
                    (i32.shl
                      (local.get $l20)
                      (i32.const 2))))))
            (i32.store offset=48
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.tee $l18
                    (i32.shl
                      (local.get $l22)
                      (i32.const 2))))))
            (i32.store offset=180
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.tee $l22
                    (i32.shl
                      (local.get $p0)
                      (i32.const 2))))))
            (i32.store offset=116
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=52
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=184
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=120
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=56
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=188
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=124
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=60
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=192
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=128
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=64
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=196
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=132
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=68
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=200
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=136
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=72
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=204
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=140
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=76
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=208
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=144
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=80
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=212
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=148
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=84
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=216
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=152
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=88
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=220
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=156
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=92
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=224
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=160
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=96
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=228
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=164
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l17))))
            (i32.store offset=100
              (local.get $l16)
              (local.tee $p12
                (i32.add
                  (local.get $p12)
                  (local.get $l18))))
            (i32.store offset=232
              (local.get $l16)
              (local.tee $l22
                (i32.add
                  (local.get $p12)
                  (local.get $l22))))
            (i32.store offset=168
              (local.get $l16)
              (local.tee $l17
                (i32.add
                  (local.get $l22)
                  (local.get $l17))))
            (i32.store offset=104
              (local.get $l16)
              (i32.add
                (local.get $l17)
                (local.get $l18)))
            (br $B2))
          (i32.store offset=176
            (local.get $l16)
            (local.get $l18))
          (i32.store offset=112
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l18)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=48
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l24
            (select
              (local.get $l22)
              (i32.const 1)
              (i32.gt_s
                (local.get $l22)
                (i32.const 1))))
          (local.set $l25
            (i32.const 0))
          (block $B4
            (block $B5
              (br_if $B5
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L6
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L6
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B4
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 480))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L7
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L7
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=180
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=116
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=52
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B8
            (block $B9
              (br_if $B9
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 572))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L10
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L10
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B8
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 572))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L11
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L11
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=184
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=120
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=56
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B12
            (block $B13
              (br_if $B13
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 664))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L14
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L14
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B12
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 664))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L15
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L15
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=188
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=124
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=60
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B16
            (block $B17
              (br_if $B17
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 756))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L18
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L18
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B16
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 756))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L19
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L19
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=192
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=128
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=64
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B20
            (block $B21
              (br_if $B21
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 848))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L22
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L22
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B20
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 848))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L23
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L23
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=196
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=132
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=68
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B24
            (block $B25
              (br_if $B25
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 940))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L26
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L26
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B24
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 940))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L27
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L27
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=200
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=136
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=72
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B28
            (block $B29
              (br_if $B29
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1032))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L30
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L30
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B28
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1032))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L31
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L31
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=204
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=140
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=76
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B32
            (block $B33
              (br_if $B33
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1124))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L34
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L34
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B32
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1124))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L35
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L35
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=208
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=144
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=80
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B36
            (block $B37
              (br_if $B37
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1216))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L38
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L38
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B36
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1216))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L39
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L39
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=212
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=148
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=84
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B40
            (block $B41
              (br_if $B41
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1308))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L42
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L42
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B40
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1308))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L43
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L43
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=216
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=152
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=88
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B44
            (block $B45
              (br_if $B45
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1400))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L46
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L46
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B44
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1400))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L47
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L47
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=220
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=156
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=92
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B48
            (block $B49
              (br_if $B49
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1492))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L50
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L50
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B48
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1492))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L51
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L51
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=224
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=160
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=96
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B52
            (block $B53
              (br_if $B53
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1584))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L54
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L54
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B52
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1584))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L55
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L55
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=228
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=164
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=100
            (local.get $l16)
            (local.tee $l23
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l22)
                  (i32.const 2)))))
          (local.set $l25
            (i32.const 0))
          (block $B56
            (block $B57
              (br_if $B57
                (i32.lt_s
                  (local.get $l22)
                  (i32.const 4)))
              (local.set $l17
                (i32.add
                  (local.get $p12)
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1676))))
              (local.set $l18
                (local.tee $l25
                  (i32.and
                    (local.get $l24)
                    (i32.const 2147483644))))
              (loop $L58
                (v128.store align=4
                  (local.get $l17)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 16)))
                (br_if $L58
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -4)))))
              (br_if $B56
                (i32.eq
                  (local.get $l24)
                  (local.get $l25))))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.add
                  (i32.mul
                    (local.get $p0)
                    (i32.const 1676))
                  (i32.shl
                    (local.get $l25)
                    (i32.const 2)))))
            (local.set $l18
              (i32.sub
                (local.get $l24)
                (local.get $l25)))
            (loop $L59
              (i32.store
                (local.get $l17)
                (i32.const 0))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 4)))
              (br_if $L59
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -1))))))
          (i32.store offset=232
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l23)
                (i32.shl
                  (local.get $p0)
                  (i32.const 2)))))
          (i32.store offset=168
            (local.get $l16)
            (local.tee $l17
              (i32.add
                (local.get $l17)
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (i32.store offset=104
            (local.get $l16)
            (i32.add
              (local.get $l17)
              (i32.shl
                (local.get $l22)
                (i32.const 2))))
          (local.set $l20
            (i32.const 0))
          (block $B60
            (br_if $B60
              (i32.lt_s
                (local.get $l22)
                (i32.const 4)))
            (local.set $l17
              (i32.add
                (local.get $p12)
                (i32.mul
                  (local.get $p0)
                  (i32.const 1768))))
            (local.set $l18
              (local.tee $l20
                (i32.and
                  (local.get $l24)
                  (i32.const 2147483644))))
            (loop $L61
              (v128.store align=4
                (local.get $l17)
                (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
              (local.set $l17
                (i32.add
                  (local.get $l17)
                  (i32.const 16)))
              (br_if $L61
                (local.tee $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const -4)))))
            (br_if $B2
              (i32.eq
                (local.get $l24)
                (local.get $l20))))
          (local.set $l17
            (i32.add
              (local.get $p12)
              (i32.add
                (i32.mul
                  (local.get $p0)
                  (i32.const 1768))
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))))
          (local.set $l18
            (i32.sub
              (local.get $l24)
              (local.get $l20)))
          (loop $L62
            (i32.store
              (local.get $l17)
              (i32.const 0))
            (local.set $l17
              (i32.add
                (local.get $l17)
                (i32.const 4)))
            (br_if $L62
              (local.tee $l18
                (i32.add
                  (local.get $l18)
                  (i32.const -1))))))
        (v128.store offset=112 align=8
          (local.get $p13)
          (local.tee $l26
            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
        (v128.store offset=96 align=8
          (local.get $p13)
          (local.get $l26))
        (v128.store offset=80 align=8
          (local.get $p13)
          (local.get $l26))
        (v128.store offset=64 align=8
          (local.get $p13)
          (local.get $l26))
        (v128.store offset=48 align=8
          (local.get $p13)
          (local.get $l26))
        (v128.store offset=32 align=8
          (local.get $p13)
          (local.get $l26))
        (v128.store offset=16 align=8
          (local.get $p13)
          (local.get $l26))
        (v128.store align=8
          (local.get $p13)
          (local.get $l26))
        (v128.store offset=128 align=8
          (local.get $p13)
          (local.get $l26))
        (br $B0))
      (i32.store offset=176
        (local.get $l16)
        (local.get $l18))
      (i32.store offset=112
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $l18)
            (local.tee $l17
              (i32.shl
                (local.get $l20)
                (i32.const 2))))))
      (i32.store offset=48
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.tee $l18
              (i32.shl
                (local.get $l22)
                (i32.const 2))))))
      (i32.store offset=180
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.tee $l22
              (i32.shl
                (local.get $p0)
                (i32.const 2))))))
      (i32.store offset=116
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=52
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=184
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=120
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=56
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=188
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=124
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=60
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=192
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=128
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=64
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=196
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=132
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=68
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=200
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=136
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=72
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=204
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=140
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=76
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=208
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=144
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=80
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=212
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=148
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=84
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=216
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=152
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=88
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=220
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=156
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=92
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=224
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=160
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=96
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=228
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=164
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l17))))
      (i32.store offset=100
        (local.get $l16)
        (local.tee $p12
          (i32.add
            (local.get $p12)
            (local.get $l18))))
      (i32.store offset=232
        (local.get $l16)
        (local.tee $l22
          (i32.add
            (local.get $p12)
            (local.get $l22))))
      (i32.store offset=168
        (local.get $l16)
        (local.tee $l17
          (i32.add
            (local.get $l22)
            (local.get $l17))))
      (i32.store offset=104
        (local.get $l16)
        (i32.add
          (local.get $l17)
          (local.get $l18))))
    (block $B63
      (br_if $B63
        (i32.ge_s
          (local.get $p2)
          (local.get $p3)))
      (local.set $l27
        (i32.mul
          (local.get $p0)
          (i32.add
            (local.tee $l17
              (i32.shl
                (local.get $p2)
                (i32.const 2)))
            (i32.shl
              (local.get $p1)
              (i32.const 2)))))
      (local.set $l28
        (i32.sub
          (i32.const 0)
          (local.get $p4)))
      (local.set $l29
        (i32.and
          (local.get $p0)
          (i32.const 1)))
      (local.set $l30
        (i32.and
          (local.get $p0)
          (i32.const 2147483644)))
      (local.set $l23
        (i32.and
          (local.get $p0)
          (i32.const 3)))
      (local.set $l31
        (i32.shl
          (local.tee $l18
            (i32.mul
              (local.get $p1)
              (local.get $p0)))
          (i32.const 3)))
      (local.set $l33
        (i32.sub
          (i32.const 0)
          (local.tee $l32
            (i32.shl
              (local.get $p0)
              (i32.const 2)))))
      (local.set $l34
        (i32.shl
          (i32.mul
            (i32.add
              (local.get $p2)
              (local.get $p1))
            (local.get $p0))
          (i32.const 2)))
      (local.set $l35
        (i32x4.splat
          (local.get $p0)))
      (local.set $l37
        (i32.lt_u
          (i32.add
            (local.tee $l36
              (i32.shl
                (local.get $l18)
                (i32.const 2)))
            (i32.const -1))
          (i32.const 15)))
      (local.set $l39
        (local.tee $l38
          (i32.mul
            (local.get $p0)
            (i32.add
              (i32.shl
                (local.get $p1)
                (i32.const 3))
              (local.get $l17)))))
      (local.set $l40
        (i32.const 0))
      (loop $L64
        (local.set $l41
          (i32.add
            (local.get $p2)
            (i32.const 4)))
        (block $B65
          (br_if $B65
            (i32.ge_s
              (local.get $p4)
              (local.get $p1)))
          (br_if $B65
            (i32.gt_s
              (local.get $p4)
              (local.get $l41)))
          (loop $L66
            (local.set $l18
              (local.tee $l42
                (select
                  (local.tee $l22
                    (i32.sub
                      (local.get $p1)
                      (local.get $p4)))
                  (i32.const 4)
                  (i32.lt_s
                    (local.get $l22)
                    (i32.const 4)))))
            (local.set $l17
              (local.get $p4))
            (block $B67
              (block $B68
                (br_if $B68
                  (i32.eqz
                    (local.tee $l43
                      (i32.lt_s
                        (local.get $l22)
                        (i32.const 1)))))
                (local.set $l44
                  (select
                    (local.get $l42)
                    (i32.const 1)
                    (i32.gt_s
                      (local.get $l42)
                      (i32.const 1))))
                (br $B67))
              (loop $L69
                (call $positive_row
                  (local.get $p6)
                  (local.get $p7)
                  (local.tee $l22
                    (i32.add
                      (local.get $l28)
                      (local.get $l17)))
                  (local.get $p0)
                  (local.get $p5)
                  (i32.add
                    (local.get $l16)
                    (i32.const 248))
                  (local.tee $p12
                    (i32.mul
                      (i32.rem_s
                        (local.get $l17)
                        (i32.const 16))
                      (local.get $p0)))
                  (local.get $p10)
                  (local.get $p14)
                  (local.get $p15))
                (call $positive_row
                  (local.get $p8)
                  (local.get $p9)
                  (local.get $l22)
                  (local.get $p0)
                  (local.get $p5)
                  (i32.add
                    (local.get $l16)
                    (i32.const 236))
                  (local.get $p12)
                  (local.get $p10)
                  (local.get $p14)
                  (local.get $p15))
                (local.set $l17
                  (i32.add
                    (local.get $l17)
                    (i32.const 1)))
                (br_if $L69
                  (local.tee $l18
                    (i32.add
                      (local.get $l18)
                      (i32.const -1)))))
              (local.set $l44
                (local.get $l42)))
            (local.set $l45
              (i32.or
                (local.get $l43)
                (i32.lt_s
                  (local.get $p0)
                  (i32.const 1))))
            (local.set $l46
              (i32.and
                (local.get $l44)
                (i32.const -4)))
            (local.set $l47
              (i32.mul
                (local.get $l32)
                (local.get $p4)))
            (local.set $l26
              (i32x4.splat
                (local.get $p4)))
            (local.set $l48
              (i32.const 0))
            (loop $L70
              (block $B71
                (block $B72
                  (block $B73
                    (block $B74
                      (block $B75
                        (block $B76
                          (block $B77
                            (block $B78
                              (block $B79
                                (block $B80
                                  (block $B81
                                    (block $B82
                                      (block $B83
                                        (block $B84
                                          (block $B85
                                            (block $B86
                                              (br_if $B86
                                                (local.get $l43))
                                              (local.set $l20
                                                (i32.load
                                                  (i32.add
                                                    (i32.add
                                                      (local.get $l16)
                                                      (i32.const 236))
                                                    (local.tee $l49
                                                      (i32.shl
                                                        (local.get $l48)
                                                        (i32.const 2))))))
                                              (local.set $l25
                                                (i32.load
                                                  (i32.add
                                                    (i32.add
                                                      (local.get $l16)
                                                      (i32.const 248))
                                                    (local.get $l49))))
                                              (local.set $l18
                                                (i32.const 0))
                                              (block $B87
                                                (block $B88
                                                  (br_if $B88
                                                    (local.tee $l50
                                                      (i32.lt_u
                                                        (local.get $l44)
                                                        (i32.const 4))))
                                                  (local.set $l51
                                                    (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                                                  (local.set $l17
                                                    (i32.add
                                                      (local.get $l16)
                                                      (i32.const 16)))
                                                  (local.set $l18
                                                    (i32.add
                                                      (local.get $l16)
                                                      (i32.const 32)))
                                                  (local.set $l22
                                                    (local.get $l46))
                                                  (loop $L89
                                                    (v128.store
                                                      (local.get $l17)
                                                      (i32x4.add
                                                        (i32x4.splat
                                                          (local.get $l20))
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
                                                                              (local.get $l51)
                                                                              (local.get $l26))))
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
                                                              (local.get $l35))
                                                            (i32.const 2)))))
                                                    (v128.store
                                                      (local.get $l18)
                                                      (i32x4.add
                                                        (i32x4.splat
                                                          (local.get $l25))
                                                        (local.get $l52)))
                                                    (local.set $l18
                                                      (i32.add
                                                        (local.get $l18)
                                                        (i32.const 16)))
                                                    (local.set $l17
                                                      (i32.add
                                                        (local.get $l17)
                                                        (i32.const 16)))
                                                    (local.set $l51
                                                      (i32x4.add
                                                        (local.get $l51)
                                                        (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                                                    (br_if $L89
                                                      (local.tee $l22
                                                        (i32.add
                                                          (local.get $l22)
                                                          (i32.const -4)))))
                                                  (local.set $l18
                                                    (local.get $l46))
                                                  (br_if $B87
                                                    (i32.eq
                                                      (local.get $l44)
                                                      (local.get $l46))))
                                                (local.set $p12
                                                  (i32.sub
                                                    (local.get $l44)
                                                    (local.get $l18)))
                                                (local.set $l17
                                                  (i32.add
                                                    (local.get $p4)
                                                    (local.get $l18)))
                                                (local.set $l18
                                                  (i32.add
                                                    (i32.add
                                                      (local.get $l16)
                                                      (i32.const 16))
                                                    (local.tee $l22
                                                      (i32.shl
                                                        (local.get $l18)
                                                        (i32.const 2)))))
                                                (local.set $l22
                                                  (i32.add
                                                    (i32.add
                                                      (local.get $l16)
                                                      (i32.const 32))
                                                    (local.get $l22)))
                                                (loop $L90
                                                  (i32.store
                                                    (local.get $l18)
                                                    (i32.add
                                                      (local.get $l20)
                                                      (local.tee $l24
                                                        (i32.shl
                                                          (i32.mul
                                                            (i32.rem_s
                                                              (local.get $l17)
                                                              (i32.const 16))
                                                            (local.get $p0))
                                                          (i32.const 2)))))
                                                  (i32.store
                                                    (local.get $l22)
                                                    (i32.add
                                                      (local.get $l25)
                                                      (local.get $l24)))
                                                  (local.set $l18
                                                    (i32.add
                                                      (local.get $l18)
                                                      (i32.const 4)))
                                                  (local.set $l22
                                                    (i32.add
                                                      (local.get $l22)
                                                      (i32.const 4)))
                                                  (local.set $l17
                                                    (i32.add
                                                      (local.get $l17)
                                                      (i32.const 1)))
                                                  (br_if $L90
                                                    (local.tee $p12
                                                      (i32.add
                                                        (local.get $p12)
                                                        (i32.const -1))))))
                                              (block $B91
                                                (br_if $B91
                                                  (i32.or
                                                    (i32.eqz
                                                      (local.tee $l17
                                                        (i32.load
                                                          (i32.add
                                                            (i32.add
                                                              (local.get $l16)
                                                              (i32.const 260))
                                                            (local.get $l49)))))
                                                    (local.get $l45)))
                                                (local.set $l25
                                                  (i32.const 0))
                                                (local.set $p12
                                                  (local.tee $l49
                                                    (i32.add
                                                      (local.get $l47)
                                                      (local.get $l17))))
                                                (loop $L92
                                                  (local.set $l24
                                                    (i32.load
                                                      (i32.add
                                                        (i32.add
                                                          (local.get $l16)
                                                          (i32.const 32))
                                                        (i32.shl
                                                          (local.get $l25)
                                                          (i32.const 2)))))
                                                  (local.set $l22
                                                    (i32.const 0))
                                                  (block $B93
                                                    (block $B94
                                                      (br_if $B94
                                                        (i32.lt_u
                                                          (local.get $p0)
                                                          (i32.const 4)))
                                                      (local.set $l22
                                                        (i32.const 0))
                                                      (br_if $B94
                                                        (i32.gt_u
                                                          (i32.sub
                                                            (local.get $l24)
                                                            (i32.add
                                                              (local.get $l49)
                                                              (i32.mul
                                                                (local.get $l32)
                                                                (local.get $l25))))
                                                          (i32.const -16)))
                                                      (local.set $l17
                                                        (local.get $l24))
                                                      (local.set $l18
                                                        (local.get $p12))
                                                      (local.set $l22
                                                        (local.get $l30))
                                                      (loop $L95
                                                        (v128.store align=4
                                                          (local.get $l18)
                                                          (v128.load align=4
                                                            (local.get $l17)))
                                                        (local.set $l17
                                                          (i32.add
                                                            (local.get $l17)
                                                            (i32.const 16)))
                                                        (local.set $l18
                                                          (i32.add
                                                            (local.get $l18)
                                                            (i32.const 16)))
                                                        (br_if $L95
                                                          (local.tee $l22
                                                            (i32.add
                                                              (local.get $l22)
                                                              (i32.const -4)))))
                                                      (local.set $l22
                                                        (local.get $l30))
                                                      (br_if $B93
                                                        (i32.eq
                                                          (local.get $p0)
                                                          (local.get $l30))))
                                                    (local.set $l20
                                                      (local.get $l22))
                                                    (block $B96
                                                      (br_if $B96
                                                        (i32.eqz
                                                          (local.get $l23)))
                                                      (local.set $l20
                                                        (i32.add
                                                          (local.get $l23)
                                                          (local.get $l22)))
                                                      (local.set $l17
                                                        (i32.shl
                                                          (local.get $l22)
                                                          (i32.const 2)))
                                                      (local.set $l18
                                                        (local.get $l23))
                                                      (loop $L97
                                                        (f32.store
                                                          (i32.add
                                                            (local.get $p12)
                                                            (local.get $l17))
                                                          (f32.load
                                                            (i32.add
                                                              (local.get $l24)
                                                              (local.get $l17))))
                                                        (local.set $l17
                                                          (i32.add
                                                            (local.get $l17)
                                                            (i32.const 4)))
                                                        (br_if $L97
                                                          (local.tee $l18
                                                            (i32.add
                                                              (local.get $l18)
                                                              (i32.const -1))))))
                                                    (br_if $B93
                                                      (i32.gt_u
                                                        (i32.sub
                                                          (local.get $l22)
                                                          (local.get $p0))
                                                        (i32.const -4)))
                                                    (local.set $l17
                                                      (i32.shl
                                                        (local.get $l20)
                                                        (i32.const 2)))
                                                    (local.set $l20
                                                      (i32.sub
                                                        (local.get $p0)
                                                        (local.get $l20)))
                                                    (loop $L98
                                                      (f32.store
                                                        (local.tee $l18
                                                          (i32.add
                                                            (local.get $p12)
                                                            (local.get $l17)))
                                                        (f32.load
                                                          (local.tee $l22
                                                            (i32.add
                                                              (local.get $l24)
                                                              (local.get $l17)))))
                                                      (f32.store
                                                        (i32.add
                                                          (local.get $l18)
                                                          (i32.const 4))
                                                        (f32.load
                                                          (i32.add
                                                            (local.get $l22)
                                                            (i32.const 4))))
                                                      (f32.store
                                                        (i32.add
                                                          (local.get $l18)
                                                          (i32.const 8))
                                                        (f32.load
                                                          (i32.add
                                                            (local.get $l22)
                                                            (i32.const 8))))
                                                      (f32.store
                                                        (i32.add
                                                          (local.get $l18)
                                                          (i32.const 12))
                                                        (f32.load
                                                          (i32.add
                                                            (local.get $l22)
                                                            (i32.const 12))))
                                                      (local.set $l17
                                                        (i32.add
                                                          (local.get $l17)
                                                          (i32.const 16)))
                                                      (br_if $L98
                                                        (local.tee $l20
                                                          (i32.add
                                                            (local.get $l20)
                                                            (i32.const -4))))))
                                                  (local.set $p12
                                                    (i32.add
                                                      (local.get $p12)
                                                      (local.get $l32)))
                                                  (br_if $L92
                                                    (i32.ne
                                                      (local.tee $l25
                                                        (i32.add
                                                          (local.get $l25)
                                                          (i32.const 1)))
                                                      (local.get $l44))))
                                                (br_if $B83
                                                  (i32.eqz
                                                    (local.tee $p12
                                                      (i32.load
                                                        (local.tee $l24
                                                          (i32.add
                                                            (i32.add
                                                              (local.get $l16)
                                                              (i32.const 176))
                                                            (i32.mul
                                                              (local.get $l48)
                                                              (i32.const 20))))))))
                                                (br $B85))
                                              (br_if $B85
                                                (local.tee $p12
                                                  (i32.load
                                                    (local.tee $l24
                                                      (i32.add
                                                        (i32.add
                                                          (local.get $l16)
                                                          (i32.const 176))
                                                        (i32.mul
                                                          (local.get $l48)
                                                          (i32.const 20)))))))
                                              (br_if $B82
                                                (local.tee $p12
                                                  (i32.load offset=4
                                                    (local.get $l24))))
                                              (br_if $B79
                                                (local.tee $p12
                                                  (i32.load offset=8
                                                    (local.get $l24))))
                                              (br_if $B76
                                                (local.tee $p12
                                                  (i32.load offset=12
                                                    (local.get $l24))))
                                              (br_if $B73
                                                (local.tee $p12
                                                  (i32.load offset=16
                                                    (local.get $l24))))
                                              (br $B71))
                                            (br_if $B84
                                              (i32.load
                                                (local.tee $l24
                                                  (i32.add
                                                    (i32.add
                                                      (local.get $l16)
                                                      (i32.const 176))
                                                    (i32.mul
                                                      (local.get $l48)
                                                      (i32.const 20))))))
                                            (br_if $B81
                                              (i32.load offset=4
                                                (local.get $l24)))
                                            (br_if $B78
                                              (i32.load offset=8
                                                (local.get $l24)))
                                            (br_if $B75
                                              (i32.load offset=12
                                                (local.get $l24)))
                                            (br_if $B71
                                              (i32.eqz
                                                (i32.load offset=16
                                                  (local.get $l24))))
                                            (br $B72))
                                          (local.set $l18
                                            (i32.const 0))
                                          (block $B99
                                            (br_if $B99
                                              (local.get $l50))
                                            (local.set $l51
                                              (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                                            (local.set $l17
                                              (local.get $l16))
                                            (local.set $l18
                                              (local.get $l46))
                                            (loop $L100
                                              (v128.store
                                                (local.get $l17)
                                                (i32x4.add
                                                  (i32x4.splat
                                                    (local.get $p12))
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
                                                                      (local.get $l51)
                                                                      (local.get $l26))))
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
                                                      (local.get $l35))
                                                    (i32.const 2))))
                                              (local.set $l17
                                                (i32.add
                                                  (local.get $l17)
                                                  (i32.const 16)))
                                              (local.set $l51
                                                (i32x4.add
                                                  (local.get $l51)
                                                  (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                                              (br_if $L100
                                                (local.tee $l18
                                                  (i32.add
                                                    (local.get $l18)
                                                    (i32.const -4)))))
                                            (local.set $l18
                                              (local.get $l46))
                                            (br_if $B84
                                              (i32.eq
                                                (local.get $l44)
                                                (local.get $l46))))
                                          (local.set $l22
                                            (i32.sub
                                              (local.get $l44)
                                              (local.get $l18)))
                                          (local.set $l17
                                            (i32.add
                                              (local.get $p4)
                                              (local.get $l18)))
                                          (local.set $l18
                                            (i32.add
                                              (local.get $l16)
                                              (i32.shl
                                                (local.get $l18)
                                                (i32.const 2))))
                                          (loop $L101
                                            (i32.store
                                              (local.get $l18)
                                              (i32.add
                                                (local.get $p12)
                                                (i32.shl
                                                  (i32.mul
                                                    (i32.rem_s
                                                      (local.get $l17)
                                                      (i32.const 16))
                                                    (local.get $p0))
                                                  (i32.const 2))))
                                            (local.set $l18
                                              (i32.add
                                                (local.get $l18)
                                                (i32.const 4)))
                                            (local.set $l17
                                              (i32.add
                                                (local.get $l17)
                                                (i32.const 1)))
                                            (br_if $L101
                                              (local.tee $l22
                                                (i32.add
                                                  (local.get $l22)
                                                  (i32.const -1))))))
                                        (call $blur_rows
                                          (i32.add
                                            (local.get $l16)
                                            (i32.const 32))
                                          (i32.const 0)
                                          (i32.const 0)
                                          (local.get $l16)
                                          (local.get $l42)
                                          (local.get $p0)
                                          (local.get $l19)
                                          (local.get $l21)
                                          (local.get $p11)))
                                      (br_if $B80
                                        (i32.eqz
                                          (local.tee $p12
                                            (i32.load offset=4
                                              (local.get $l24)))))
                                      (br_if $B81
                                        (local.get $l43)))
                                    (local.set $l18
                                      (i32.const 0))
                                    (block $B102
                                      (br_if $B102
                                        (i32.lt_u
                                          (local.get $l44)
                                          (i32.const 4)))
                                      (local.set $l51
                                        (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                                      (local.set $l17
                                        (local.get $l16))
                                      (local.set $l18
                                        (local.get $l46))
                                      (loop $L103
                                        (v128.store
                                          (local.get $l17)
                                          (i32x4.add
                                            (i32x4.splat
                                              (local.get $p12))
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
                                                                (local.get $l51)
                                                                (local.get $l26))))
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
                                                (local.get $l35))
                                              (i32.const 2))))
                                        (local.set $l17
                                          (i32.add
                                            (local.get $l17)
                                            (i32.const 16)))
                                        (local.set $l51
                                          (i32x4.add
                                            (local.get $l51)
                                            (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                                        (br_if $L103
                                          (local.tee $l18
                                            (i32.add
                                              (local.get $l18)
                                              (i32.const -4)))))
                                      (local.set $l18
                                        (local.get $l46))
                                      (br_if $B81
                                        (i32.eq
                                          (local.get $l44)
                                          (local.get $l46))))
                                    (local.set $l17
                                      (i32.add
                                        (local.get $p4)
                                        (local.get $l18)))
                                    (local.set $l22
                                      (i32.sub
                                        (local.get $l44)
                                        (local.get $l18)))
                                    (local.set $l18
                                      (i32.add
                                        (local.get $l16)
                                        (i32.shl
                                          (local.get $l18)
                                          (i32.const 2))))
                                    (loop $L104
                                      (i32.store
                                        (local.get $l18)
                                        (i32.add
                                          (local.get $p12)
                                          (i32.shl
                                            (i32.mul
                                              (i32.rem_s
                                                (local.get $l17)
                                                (i32.const 16))
                                              (local.get $p0))
                                            (i32.const 2))))
                                      (local.set $l17
                                        (i32.add
                                          (local.get $l17)
                                          (i32.const 1)))
                                      (local.set $l18
                                        (i32.add
                                          (local.get $l18)
                                          (i32.const 4)))
                                      (br_if $L104
                                        (local.tee $l22
                                          (i32.add
                                            (local.get $l22)
                                            (i32.const -1))))))
                                  (call $blur_rows
                                    (i32.add
                                      (local.get $l16)
                                      (i32.const 16))
                                    (i32.const 0)
                                    (i32.const 0)
                                    (local.get $l16)
                                    (local.get $l42)
                                    (local.get $p0)
                                    (local.get $l19)
                                    (local.get $l21)
                                    (local.get $p11)))
                                (br_if $B77
                                  (i32.eqz
                                    (local.tee $p12
                                      (i32.load offset=8
                                        (local.get $l24)))))
                                (br_if $B78
                                  (local.get $l43)))
                              (local.set $l18
                                (i32.const 0))
                              (block $B105
                                (br_if $B105
                                  (i32.lt_u
                                    (local.get $l44)
                                    (i32.const 4)))
                                (local.set $l51
                                  (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                                (local.set $l17
                                  (local.get $l16))
                                (local.set $l18
                                  (local.get $l46))
                                (loop $L106
                                  (v128.store
                                    (local.get $l17)
                                    (i32x4.add
                                      (i32x4.splat
                                        (local.get $p12))
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
                                                          (local.get $l51)
                                                          (local.get $l26))))
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
                                          (local.get $l35))
                                        (i32.const 2))))
                                  (local.set $l17
                                    (i32.add
                                      (local.get $l17)
                                      (i32.const 16)))
                                  (local.set $l51
                                    (i32x4.add
                                      (local.get $l51)
                                      (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                                  (br_if $L106
                                    (local.tee $l18
                                      (i32.add
                                        (local.get $l18)
                                        (i32.const -4)))))
                                (local.set $l18
                                  (local.get $l46))
                                (br_if $B78
                                  (i32.eq
                                    (local.get $l44)
                                    (local.get $l46))))
                              (local.set $l17
                                (i32.add
                                  (local.get $p4)
                                  (local.get $l18)))
                              (local.set $l22
                                (i32.sub
                                  (local.get $l44)
                                  (local.get $l18)))
                              (local.set $l18
                                (i32.add
                                  (local.get $l16)
                                  (i32.shl
                                    (local.get $l18)
                                    (i32.const 2))))
                              (loop $L107
                                (i32.store
                                  (local.get $l18)
                                  (i32.add
                                    (local.get $p12)
                                    (i32.shl
                                      (i32.mul
                                        (i32.rem_s
                                          (local.get $l17)
                                          (i32.const 16))
                                        (local.get $p0))
                                      (i32.const 2))))
                                (local.set $l17
                                  (i32.add
                                    (local.get $l17)
                                    (i32.const 1)))
                                (local.set $l18
                                  (i32.add
                                    (local.get $l18)
                                    (i32.const 4)))
                                (br_if $L107
                                  (local.tee $l22
                                    (i32.add
                                      (local.get $l22)
                                      (i32.const -1))))))
                            (call $blur_rows
                              (i32.add
                                (local.get $l16)
                                (i32.const 32))
                              (i32.const 0)
                              (i32.const 1)
                              (local.get $l16)
                              (local.get $l42)
                              (local.get $p0)
                              (local.get $l19)
                              (local.get $l21)
                              (local.get $p11)))
                          (br_if $B74
                            (i32.eqz
                              (local.tee $p12
                                (i32.load offset=12
                                  (local.get $l24)))))
                          (br_if $B75
                            (local.get $l43)))
                        (local.set $l18
                          (i32.const 0))
                        (block $B108
                          (br_if $B108
                            (i32.lt_u
                              (local.get $l44)
                              (i32.const 4)))
                          (local.set $l51
                            (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                          (local.set $l17
                            (local.get $l16))
                          (local.set $l18
                            (local.get $l46))
                          (loop $L109
                            (v128.store
                              (local.get $l17)
                              (i32x4.add
                                (i32x4.splat
                                  (local.get $p12))
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
                                                    (local.get $l51)
                                                    (local.get $l26))))
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
                                    (local.get $l35))
                                  (i32.const 2))))
                            (local.set $l17
                              (i32.add
                                (local.get $l17)
                                (i32.const 16)))
                            (local.set $l51
                              (i32x4.add
                                (local.get $l51)
                                (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                            (br_if $L109
                              (local.tee $l18
                                (i32.add
                                  (local.get $l18)
                                  (i32.const -4)))))
                          (local.set $l18
                            (local.get $l46))
                          (br_if $B75
                            (i32.eq
                              (local.get $l44)
                              (local.get $l46))))
                        (local.set $l17
                          (i32.add
                            (local.get $p4)
                            (local.get $l18)))
                        (local.set $l22
                          (i32.sub
                            (local.get $l44)
                            (local.get $l18)))
                        (local.set $l18
                          (i32.add
                            (local.get $l16)
                            (i32.shl
                              (local.get $l18)
                              (i32.const 2))))
                        (loop $L110
                          (i32.store
                            (local.get $l18)
                            (i32.add
                              (local.get $p12)
                              (i32.shl
                                (i32.mul
                                  (i32.rem_s
                                    (local.get $l17)
                                    (i32.const 16))
                                  (local.get $p0))
                                (i32.const 2))))
                          (local.set $l17
                            (i32.add
                              (local.get $l17)
                              (i32.const 1)))
                          (local.set $l18
                            (i32.add
                              (local.get $l18)
                              (i32.const 4)))
                          (br_if $L110
                            (local.tee $l22
                              (i32.add
                                (local.get $l22)
                                (i32.const -1))))))
                      (call $blur_rows
                        (i32.add
                          (local.get $l16)
                          (i32.const 16))
                        (i32.const 0)
                        (i32.const 1)
                        (local.get $l16)
                        (local.get $l42)
                        (local.get $p0)
                        (local.get $l19)
                        (local.get $l21)
                        (local.get $p11)))
                    (br_if $B71
                      (i32.eqz
                        (local.tee $p12
                          (i32.load offset=16
                            (local.get $l24)))))
                    (br_if $B72
                      (local.get $l43)))
                  (local.set $l18
                    (i32.const 0))
                  (block $B111
                    (br_if $B111
                      (i32.lt_u
                        (local.get $l44)
                        (i32.const 4)))
                    (local.set $l51
                      (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                    (local.set $l17
                      (local.get $l16))
                    (local.set $l18
                      (local.get $l46))
                    (loop $L112
                      (v128.store
                        (local.get $l17)
                        (i32x4.add
                          (i32x4.splat
                            (local.get $p12))
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
                                              (local.get $l51)
                                              (local.get $l26))))
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
                              (local.get $l35))
                            (i32.const 2))))
                      (local.set $l17
                        (i32.add
                          (local.get $l17)
                          (i32.const 16)))
                      (local.set $l51
                        (i32x4.add
                          (local.get $l51)
                          (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                      (br_if $L112
                        (local.tee $l18
                          (i32.add
                            (local.get $l18)
                            (i32.const -4)))))
                    (local.set $l18
                      (local.get $l46))
                    (br_if $B72
                      (i32.eq
                        (local.get $l44)
                        (local.get $l46))))
                  (local.set $l17
                    (i32.add
                      (local.get $p4)
                      (local.get $l18)))
                  (local.set $l22
                    (i32.sub
                      (local.get $l44)
                      (local.get $l18)))
                  (local.set $l18
                    (i32.add
                      (local.get $l16)
                      (i32.shl
                        (local.get $l18)
                        (i32.const 2))))
                  (loop $L113
                    (i32.store
                      (local.get $l18)
                      (i32.add
                        (local.get $p12)
                        (i32.shl
                          (i32.mul
                            (i32.rem_s
                              (local.get $l17)
                              (i32.const 16))
                            (local.get $p0))
                          (i32.const 2))))
                    (local.set $l17
                      (i32.add
                        (local.get $l17)
                        (i32.const 1)))
                    (local.set $l18
                      (i32.add
                        (local.get $l18)
                        (i32.const 4)))
                    (br_if $L113
                      (local.tee $l22
                        (i32.add
                          (local.get $l22)
                          (i32.const -1))))))
                (call $blur_rows
                  (i32.add
                    (local.get $l16)
                    (i32.const 32))
                  (i32.add
                    (local.get $l16)
                    (i32.const 16))
                  (i32.const 0)
                  (local.get $l16)
                  (local.get $l42)
                  (local.get $p0)
                  (local.get $l19)
                  (local.get $l21)
                  (local.get $p11)))
              (br_if $L70
                (i32.ne
                  (local.tee $l48
                    (i32.add
                      (local.get $l48)
                      (i32.const 1)))
                  (i32.const 3))))
            (br_if $B65
              (i32.ge_s
                (local.tee $p4
                  (i32.add
                    (local.get $l42)
                    (local.get $p4)))
                (local.get $p1)))
            (br_if $L66
              (i32.le_s
                (local.get $p4)
                (local.get $l41)))))
        (local.set $l17
          (i32.mul
            (i32.and
              (i32.add
                (local.get $p2)
                (i32.const 10))
              (i32.const 15))
            (local.get $p0)))
        (local.set $l42
          (i32.const -1))
        (block $B114
          (br_if $B114
            (i32.ge_s
              (local.get $l41)
              (local.get $p1)))
          (local.set $l42
            (i32.mul
              (i32.rem_s
                (local.get $l41)
                (i32.const 16))
              (local.get $p0))))
        (local.set $l53
          (i32.mul
            (local.get $l33)
            (local.get $l40)))
        (local.set $l54
          (i32.add
            (local.get $l38)
            (local.tee $l18
              (i32.mul
                (local.get $l32)
                (local.get $l40)))))
        (local.set $l55
          (i32.add
            (local.get $l34)
            (local.get $l18)))
        (local.set $l50
          (select
            (local.get $l17)
            (i32.const -1)
            (i32.gt_s
              (local.get $p2)
              (i32.const 5))))
        (local.set $l45
          (i32.shr_u
            (i32.xor
              (local.get $p2)
              (i32.const -1))
            (i32.const 31)))
        (local.set $l43
          (i32.const 0))
        (local.set $l41
          (i32.shl
            (i32.mul
              (i32.and
                (local.get $p2)
                (i32.const 15))
              (local.get $p0))
            (i32.const 2)))
        (local.set $l56
          (i32.shl
            (i32.mul
              (local.get $p2)
              (local.get $p0))
            (i32.const 2)))
        (loop $L115
          (local.set $l48
            (i32.add
              (i32.add
                (local.get $l16)
                (i32.const 48))
              (local.tee $l17
                (i32.mul
                  (local.get $l43)
                  (i32.const 20)))))
          (local.set $l18
            (i32.add
              (i32.add
                (local.get $l16)
                (i32.const 112))
              (local.get $l17)))
          (block $B116
            (br_if $B116
              (i32.eqz
                (local.tee $l22
                  (i32.load
                    (local.tee $l17
                      (i32.add
                        (i32.add
                          (local.get $l16)
                          (i32.const 176))
                        (local.get $l17)))))))
            (call $vertical_row
              (local.get $l22)
              (i32.load
                (local.get $l18))
              (i32.load
                (local.get $l48))
              (local.get $p0)
              (local.get $l50)
              (local.get $l42)
              (local.get $l45)
              (local.get $p11)))
          (block $B117
            (br_if $B117
              (i32.eqz
                (local.tee $l22
                  (i32.load offset=4
                    (local.get $l17)))))
            (call $vertical_row
              (local.get $l22)
              (i32.load offset=4
                (local.get $l18))
              (i32.load offset=4
                (local.get $l48))
              (local.get $p0)
              (local.get $l50)
              (local.get $l42)
              (local.get $l45)
              (local.get $p11)))
          (block $B118
            (br_if $B118
              (i32.eqz
                (local.tee $l22
                  (i32.load offset=8
                    (local.get $l17)))))
            (call $vertical_row
              (local.get $l22)
              (i32.load offset=8
                (local.get $l18))
              (i32.load offset=8
                (local.get $l48))
              (local.get $p0)
              (local.get $l50)
              (local.get $l42)
              (local.get $l45)
              (local.get $p11)))
          (block $B119
            (br_if $B119
              (i32.eqz
                (local.tee $l22
                  (i32.load offset=12
                    (local.get $l17)))))
            (call $vertical_row
              (local.get $l22)
              (i32.load offset=12
                (local.get $l18))
              (i32.load offset=12
                (local.get $l48))
              (local.get $p0)
              (local.get $l50)
              (local.get $l42)
              (local.get $l45)
              (local.get $p11)))
          (block $B120
            (br_if $B120
              (i32.eqz
                (local.tee $l17
                  (i32.load offset=16
                    (local.get $l17)))))
            (call $vertical_row
              (local.get $l17)
              (i32.load offset=16
                (local.get $l18))
              (i32.load offset=16
                (local.get $l48))
              (local.get $p0)
              (local.get $l50)
              (local.get $l42)
              (local.get $l45)
              (local.get $p11)))
          (block $B121
            (br_if $B121
              (i32.lt_s
                (local.get $p2)
                (i32.const 0)))
            (block $B122
              (br_if $B122
                (i32.eqz
                  (local.tee $l44
                    (i32.load
                      (i32.add
                        (i32.add
                          (local.get $l16)
                          (i32.const 260))
                        (local.tee $l47
                          (i32.shl
                            (local.get $l43)
                            (i32.const 2))))))))
              (br_if $B122
                (i32.lt_s
                  (local.get $p0)
                  (i32.const 1)))
              (local.set $l22
                (i32.load offset=8
                  (local.get $l48)))
              (local.set $l18
                (i32.load
                  (local.get $l48)))
              (local.set $l20
                (i32.const 0))
              (block $B123
                (br_if $B123
                  (i32.lt_u
                    (local.get $p0)
                    (i32.const 12)))
                (br_if $B123
                  (local.get $l37))
                (br_if $B123
                  (i32.gt_u
                    (i32.sub
                      (local.get $l18)
                      (i32.add
                        (local.get $l55)
                        (local.get $l44)))
                    (i32.const -16)))
                (br_if $B123
                  (i32.gt_u
                    (i32.sub
                      (i32.add
                        (local.get $l34)
                        (local.get $l44))
                      (i32.add
                        (local.get $l53)
                        (local.get $l22)))
                    (i32.const -16)))
                (br_if $B123
                  (i32.gt_u
                    (i32.sub
                      (local.get $l18)
                      (local.tee $l17
                        (i32.add
                          (local.get $l54)
                          (local.get $l44))))
                    (i32.const -16)))
                (br_if $B123
                  (i32.gt_u
                    (i32.sub
                      (local.get $l22)
                      (local.get $l17))
                    (i32.const -16)))
                (local.set $l17
                  (i32.add
                    (local.get $l44)
                    (local.get $l27)))
                (local.set $p12
                  (i32.add
                    (local.get $l44)
                    (local.get $l39)))
                (local.set $l24
                  (local.get $l18))
                (local.set $l20
                  (local.get $l22))
                (local.set $l25
                  (local.get $l30))
                (loop $L124
                  (v128.store align=4
                    (local.get $l17)
                    (v128.load align=4
                      (local.get $l24)))
                  (v128.store align=4
                    (local.get $p12)
                    (v128.load align=4
                      (local.get $l20)))
                  (local.set $l24
                    (i32.add
                      (local.get $l24)
                      (i32.const 16)))
                  (local.set $l17
                    (i32.add
                      (local.get $l17)
                      (i32.const 16)))
                  (local.set $l20
                    (i32.add
                      (local.get $l20)
                      (i32.const 16)))
                  (local.set $p12
                    (i32.add
                      (local.get $p12)
                      (i32.const 16)))
                  (br_if $L124
                    (local.tee $l25
                      (i32.add
                        (local.get $l25)
                        (i32.const -4)))))
                (local.set $l20
                  (local.get $l30))
                (br_if $B122
                  (i32.eq
                    (local.get $p0)
                    (local.get $l30))))
              (local.set $l17
                (i32.or
                  (local.get $l20)
                  (i32.const 1)))
              (block $B125
                (br_if $B125
                  (i32.eqz
                    (local.get $l29)))
                (f32.store
                  (i32.add
                    (i32.add
                      (i32.add
                        (local.get $l44)
                        (local.get $l36))
                      (local.get $l56))
                    (local.tee $p12
                      (i32.shl
                        (local.get $l20)
                        (i32.const 2))))
                  (f32.load
                    (i32.add
                      (local.get $l18)
                      (local.get $p12))))
                (f32.store
                  (i32.add
                    (i32.add
                      (i32.add
                        (local.get $l44)
                        (local.get $l31))
                      (local.get $l56))
                    (local.get $p12))
                  (f32.load
                    (i32.add
                      (local.get $l22)
                      (local.get $p12))))
                (local.set $l20
                  (local.get $l17)))
              (br_if $B122
                (i32.eq
                  (local.get $p0)
                  (local.get $l17)))
              (local.set $p12
                (i32.add
                  (local.get $l44)
                  (local.get $l39)))
              (local.set $l24
                (i32.add
                  (local.get $l44)
                  (local.get $l27)))
              (local.set $l17
                (i32.shl
                  (local.get $l20)
                  (i32.const 2)))
              (local.set $l20
                (i32.sub
                  (local.get $p0)
                  (local.get $l20)))
              (loop $L126
                (f32.store
                  (local.tee $l25
                    (i32.add
                      (local.get $l24)
                      (local.get $l17)))
                  (f32.load
                    (local.tee $l44
                      (i32.add
                        (local.get $l18)
                        (local.get $l17)))))
                (f32.store
                  (local.tee $l49
                    (i32.add
                      (local.get $p12)
                      (local.get $l17)))
                  (f32.load
                    (local.tee $l46
                      (i32.add
                        (local.get $l22)
                        (local.get $l17)))))
                (f32.store
                  (i32.add
                    (local.get $l25)
                    (i32.const 4))
                  (f32.load
                    (i32.add
                      (local.get $l44)
                      (i32.const 4))))
                (f32.store
                  (i32.add
                    (local.get $l49)
                    (i32.const 4))
                  (f32.load
                    (i32.add
                      (local.get $l46)
                      (i32.const 4))))
                (local.set $p12
                  (i32.add
                    (local.get $p12)
                    (i32.const 8)))
                (local.set $l22
                  (i32.add
                    (local.get $l22)
                    (i32.const 8)))
                (local.set $l24
                  (i32.add
                    (local.get $l24)
                    (i32.const 8)))
                (local.set $l18
                  (i32.add
                    (local.get $l18)
                    (i32.const 8)))
                (br_if $L126
                  (local.tee $l20
                    (i32.add
                      (local.get $l20)
                      (i32.const -2))))))
            (call $row_sums
              (i32.add
                (i32.load
                  (i32.add
                    (i32.add
                      (local.get $l16)
                      (i32.const 248))
                    (local.get $l47)))
                (local.get $l41))
              (i32.add
                (i32.load
                  (i32.add
                    (i32.add
                      (local.get $l16)
                      (i32.const 236))
                    (local.get $l47)))
                (local.get $l41))
              (local.get $l48)
              (i32.const 0)
              (local.get $p2)
              (local.get $p0)
              (local.get $p1)
              (i32.add
                (local.get $p13)
                (i32.mul
                  (local.get $l43)
                  (i32.const 48)))
              (i32.const 0)
              (i32.const 0)))
          (br_if $L115
            (i32.ne
              (local.tee $l43
                (i32.add
                  (local.get $l43)
                  (i32.const 1)))
              (i32.const 3))))
        (local.set $l27
          (i32.add
            (local.get $l27)
            (local.get $l32)))
        (local.set $l39
          (i32.add
            (local.get $l39)
            (local.get $l32)))
        (local.set $l40
          (i32.add
            (local.get $l40)
            (i32.const 1)))
        (br_if $L64
          (i32.ne
            (local.tee $p2
              (i32.add
                (local.get $p2)
                (i32.const 1)))
            (local.get $p3)))))
    (global.set $__stack_pointer
      (i32.add
        (local.get $l16)
        (i32.const 272)))
    (local.get $p4))
  (func $fma4_tie (type $t8) (param $p0 v128) (param $p1 v128) (param $p2 v128) (result v128)
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
  (func $cube_root_bias4 (type $t9) (param $p0 v128) (param $p1 i32) (result v128)
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
  (func $positive (type $t10) (param $p0 f32) (param $p1 f32) (param $p2 f32) (param $p3 i32)
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
  (func $blur_lane (type $t11) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32)
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
  (func $vertical_column (type $t12) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32)
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
  (func $s2_metric_band.command_export (type $t7) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (result i32)
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
  (table $T0 1 1 funcref)
  (global $__stack_pointer (mut i32) (i32.const 65536))
  (export "s2MetricFma" (func $s2_metric_fma.command_export))
  (export "s2MetricInit" (func $s2_metric_init.command_export))
  (export "s2MetricDown" (func $s2_metric_down.command_export))
  (export "s2MetricScale" (func $s2_metric_scale.command_export))
  (export "s2MetricBand" (func $s2_metric_band.command_export)))
