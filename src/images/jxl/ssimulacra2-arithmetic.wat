;; SPDX-License-Identifier: BSD-3-Clause
;; Generated from ssimulacra2-simd.c and metric-float.h by build-jxl-kernels.mjs.
;; C inputs sha256 5118f107f2b8d780d6abae2847230a16305aa1eb0d9235e8e20b2bdf23bf0c6d
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
  (type $t4 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (type $t5 (func (param v128 v128 v128) (result v128)))
  (type $t6 (func (param f32 f32 f32 i32)))
  (type $t7 (func (param i32 i32 i32 i32 i32)))
  (type $t8 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
  (type $t9 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (type $t10 (func (param f32) (result f32)))
  (type $t11 (func))
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
        (i32.const 0))))
  (func $metric_scale_rows (type $t4) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (param $p16 i32) (param $p17 i32) (param $p18 i32) (param $p19 i32) (param $p20 i32) (param $p21 i32) (param $p22 i32) (param $p23 i32) (result i32)
    (local $l24 i32) (local $l25 i32) (local $l26 i32) (local $l27 i32) (local $l28 i32) (local $l29 i32) (local $l30 i32) (local $l31 i32) (local $l32 i32) (local $l33 i32) (local $l34 i32) (local $l35 i32) (local $l36 i32) (local $l37 i32) (local $l38 i32) (local $l39 i32) (local $l40 i32) (local $l41 i32) (local $l42 i32) (local $l43 i32) (local $l44 i32) (local $l45 i32) (local $l46 i32) (local $l47 i32) (local $l48 i32) (local $l49 i32) (local $l50 i32) (local $l51 i32) (local $l52 i32) (local $l53 i32) (local $l54 v128) (local $l55 i32) (local $l56 i32) (local $l57 i32) (local $l58 i32) (local $l59 i32) (local $l60 i32) (local $l61 i32) (local $l62 i32) (local $l63 i32) (local $l64 i32) (local $l65 i32) (local $l66 i32) (local $l67 i32) (local $l68 i32) (local $l69 i32) (local $l70 i32) (local $l71 i32) (local $l72 i32) (local $l73 i32) (local $l74 i32) (local $l75 i32) (local $l76 i32) (local $l77 i32) (local $l78 i32) (local $l79 i32) (local $l80 i32) (local $l81 v128) (local $l82 v128) (local $l83 i32) (local $l84 i32) (local $l85 i32) (local $l86 i32) (local $l87 i32) (local $l88 i32) (local $l89 i32) (local $l90 i32) (local $l91 i32) (local $l92 i32) (local $l93 i32) (local $l94 i32) (local $l95 i32) (local $l96 i32) (local $l97 i32) (local $l98 i32) (local $l99 i32) (local $l100 i32) (local $l101 i32) (local $l102 i32) (local $l103 i32) (local $l104 i32) (local $l105 i32) (local $l106 i32) (local $l107 i32) (local $l108 i32) (local $l109 i32) (local $l110 i32) (local $l111 i32) (local $l112 i32) (local $l113 v128) (local $l114 v128) (local $l115 i32) (local $l116 i32) (local $l117 i32) (local $l118 i32) (local $l119 i32) (local $l120 i32) (local $l121 i32) (local $l122 i32) (local $l123 i32) (local $l124 i32) (local $l125 i32) (local $l126 i32) (local $l127 i32) (local $l128 i32) (local $l129 i32) (local $l130 v128) (local $l131 v128) (local $l132 v128) (local $l133 v128) (local $l134 v128) (local $l135 v128) (local $l136 v128) (local $l137 v128) (local $l138 v128) (local $l139 v128) (local $l140 v128) (local $l141 v128) (local $l142 v128) (local $l143 v128) (local $l144 v128) (local $l145 v128) (local $l146 v128) (local $l147 v128) (local $l148 v128) (local $l149 v128) (local $l150 v128) (local $l151 v128) (local $l152 v128) (local $l153 v128) (local $l154 v128) (local $l155 v128) (local $l156 v128) (local $l157 v128) (local $l158 v128) (local $l159 v128) (local $l160 v128) (local $l161 v128) (local $l162 v128) (local $l163 f32) (local $l164 f32) (local $l165 f32) (local $l166 i32) (local $l167 i32) (local $l168 i32) (local $l169 i32) (local $l170 i32) (local $l171 i32) (local $l172 i32) (local $l173 i32) (local $l174 i32) (local $l175 i32) (local $l176 i32) (local $l177 i32) (local $l178 i32) (local $l179 i32) (local $l180 f32) (local $l181 f64) (local $l182 f64) (local $l183 f64) (local $l184 f64) (local $l185 f64) (local $l186 f64) (local $l187 f64) (local $l188 f64) (local $l189 f64) (local $l190 f64)
    (global.set $__stack_pointer
      (local.tee $l24
        (i32.sub
          (global.get $__stack_pointer)
          (i32.const 1728))))
    (i32.store offset=268
      (local.get $l24)
      (local.get $p11))
    (i32.store offset=264
      (local.get $l24)
      (local.get $p10))
    (i32.store offset=260
      (local.get $l24)
      (local.get $p9))
    (local.set $l25
      (i32.shl
        (local.get $p0)
        (i32.const 4)))
    (block $B0
      (block $B1
        (br_if $B1
          (i32.eqz
            (local.tee $p11
              (i32.and
                (local.get $p2)
                (i32.xor
                  (local.get $p12)
                  (i32.const -1))))))
        (i32.store offset=248
          (local.get $l24)
          (local.get $p13))
        (i32.store offset=252
          (local.get $l24)
          (local.tee $l26
            (i32.add
              (local.get $p13)
              (local.tee $p10
                (i32.shl
                  (local.get $l25)
                  (i32.const 2))))))
        (i32.store offset=256
          (local.get $l24)
          (local.tee $l27
            (i32.add
              (local.get $l26)
              (local.get $p10))))
        (local.set $p13
          (i32.add
            (local.get $l27)
            (local.get $p10)))
        (br $B0))
      (i32.store offset=256
        (local.get $l24)
        (i32.const 0))
      (i64.store offset=248 align=4
        (local.get $l24)
        (i64.const 0))
      (local.set $l27
        (i32.const 0))
      (local.set $l26
        (i32.const 0)))
    (local.set $l28
      (i32.mul
        (local.get $p1)
        (local.get $p0)))
    (local.set $l29
      (i32.ne
        (local.get $p11)
        (i32.const 0)))
    (i32.store offset=236
      (local.get $l24)
      (local.get $p13))
    (i32.store offset=240
      (local.get $l24)
      (local.tee $l31
        (i32.add
          (local.get $p13)
          (local.tee $l30
            (i32.shl
              (local.get $l25)
              (i32.const 2))))))
    (i32.store offset=244
      (local.get $l24)
      (local.tee $l32
        (i32.add
          (local.get $l31)
          (local.get $l30))))
    (local.set $l35
      (i32.or
        (local.tee $l33
          (i32.ne
            (local.get $p19)
            (i32.const -4)))
        (local.tee $l34
          (i32.lt_s
            (local.get $p0)
            (i32.const 1)))))
    (local.set $l38
      (i32.and
        (local.tee $l37
          (select
            (local.tee $l36
              (i32.mul
                (local.get $p0)
                (i32.const 6)))
            (i32.const 1)
            (i32.gt_s
              (local.get $l36)
              (i32.const 1))))
        (i32.const 2147483644)))
    (local.set $l41
      (i32.add
        (local.tee $l40
          (i32.add
            (local.tee $l39
              (i32.add
                (local.get $l32)
                (local.get $l30)))
            (local.tee $p11
              (i32.shl
                (local.get $p0)
                (i32.const 4)))))
        (local.get $p11)))
    (local.set $l42
      (i32.mul
        (local.get $p0)
        (i32.const 432)))
    (local.set $l43
      (i32.mul
        (local.get $p0)
        (i32.const 340)))
    (local.set $l44
      (i32.mul
        (local.get $p0)
        (i32.const 248)))
    (local.set $l45
      (i32.mul
        (local.get $p0)
        (i32.const 156)))
    (local.set $l46
      (i32.shl
        (local.get $p0)
        (i32.const 6)))
    (local.set $l47
      (i32.shl
        (local.get $p0)
        (i32.const 2)))
    (local.set $l48
      (i32.const 0))
    (loop $L2
      (local.set $p9
        (i32.add
          (i32.add
            (local.get $l24)
            (i32.const 176))
          (local.tee $p11
            (i32.mul
              (local.get $l48)
              (i32.const 20)))))
      (block $B3
        (block $B4
          (br_if $B4
            (i32.and
              (local.tee $p10
                (i32.shl
                  (i32.const 1)
                  (local.get $l48)))
              (local.get $p2)))
          (i32.store offset=16
            (local.get $p9)
            (i32.const 0))
          (v128.store align=4
            (local.get $p9)
            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
          (br $B3))
        (local.set $l49
          (i32.add
            (i32.add
              (local.get $l24)
              (i32.const 48))
            (local.get $p11)))
        (local.set $l50
          (i32.add
            (i32.add
              (local.get $l24)
              (i32.const 112))
            (local.get $p11)))
        (block $B5
          (block $B6
            (br_if $B6
              (i32.and
                (local.get $p10)
                (local.get $p12)))
            (i32.store
              (local.get $p9)
              (local.get $l41))
            (i32.store
              (local.get $l50)
              (local.tee $p11
                (i32.add
                  (local.get $l41)
                  (local.get $l30))))
            (i32.store
              (local.get $l49)
              (local.tee $p10
                (i32.add
                  (local.get $p11)
                  (local.tee $l51
                    (i32.shl
                      (local.get $l36)
                      (i32.const 2))))))
            (local.set $l52
              (i32.add
                (local.get $p10)
                (local.get $l47)))
            (br_if $B5
              (local.get $l33))
            (block $B7
              (br_if $B7
                (local.get $l34))
              (local.set $p10
                (i32.const 0))
              (block $B8
                (block $B9
                  (br_if $B9
                    (local.tee $l53
                      (i32.lt_s
                        (local.get $l36)
                        (i32.const 4))))
                  (local.set $p10
                    (local.get $l38))
                  (loop $L10
                    (v128.store align=4
                      (local.get $p11)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const 16)))
                    (br_if $L10
                      (local.tee $p10
                        (i32.add
                          (local.get $p10)
                          (i32.const -4)))))
                  (local.set $p10
                    (local.get $l38))
                  (br_if $B8
                    (i32.eq
                      (local.get $l37)
                      (local.get $l38))))
                (local.set $p11
                  (i32.add
                    (i32.add
                      (local.get $l41)
                      (local.get $l46))
                    (i32.shl
                      (local.get $p10)
                      (i32.const 2))))
                (local.set $p10
                  (i32.sub
                    (local.get $l37)
                    (local.get $p10)))
                (loop $L11
                  (i32.store
                    (local.get $p11)
                    (i32.const 0))
                  (local.set $p11
                    (i32.add
                      (local.get $p11)
                      (i32.const 4)))
                  (br_if $L11
                    (local.tee $p10
                      (i32.add
                        (local.get $p10)
                        (i32.const -1))))))
              (i32.store offset=4
                (local.get $p9)
                (local.get $l52))
              (i32.store offset=4
                (local.get $l50)
                (local.tee $p11
                  (i32.add
                    (local.get $l52)
                    (local.get $l30))))
              (i32.store offset=4
                (local.get $l49)
                (local.tee $p10
                  (i32.add
                    (local.get $p11)
                    (local.get $l51))))
              (local.set $l52
                (i32.add
                  (local.get $p10)
                  (local.get $l47)))
              (local.set $p10
                (i32.const 0))
              (block $B12
                (block $B13
                  (br_if $B13
                    (local.get $l53))
                  (local.set $p10
                    (local.get $l38))
                  (loop $L14
                    (v128.store align=4
                      (local.get $p11)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const 16)))
                    (br_if $L14
                      (local.tee $p10
                        (i32.add
                          (local.get $p10)
                          (i32.const -4)))))
                  (local.set $p10
                    (local.get $l38))
                  (br_if $B12
                    (i32.eq
                      (local.get $l37)
                      (local.get $l38))))
                (local.set $p11
                  (i32.add
                    (i32.add
                      (local.get $l41)
                      (local.get $l45))
                    (i32.shl
                      (local.get $p10)
                      (i32.const 2))))
                (local.set $p10
                  (i32.sub
                    (local.get $l37)
                    (local.get $p10)))
                (loop $L15
                  (i32.store
                    (local.get $p11)
                    (i32.const 0))
                  (local.set $p11
                    (i32.add
                      (local.get $p11)
                      (i32.const 4)))
                  (br_if $L15
                    (local.tee $p10
                      (i32.add
                        (local.get $p10)
                        (i32.const -1))))))
              (i32.store offset=8
                (local.get $p9)
                (local.get $l52))
              (i32.store offset=8
                (local.get $l50)
                (local.tee $p11
                  (i32.add
                    (local.get $l52)
                    (local.get $l30))))
              (i32.store offset=8
                (local.get $l49)
                (local.tee $p10
                  (i32.add
                    (local.get $p11)
                    (local.get $l51))))
              (local.set $l52
                (i32.add
                  (local.get $p10)
                  (local.get $l47)))
              (local.set $p10
                (i32.const 0))
              (block $B16
                (block $B17
                  (br_if $B17
                    (local.get $l53))
                  (local.set $p10
                    (local.get $l38))
                  (loop $L18
                    (v128.store align=4
                      (local.get $p11)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const 16)))
                    (br_if $L18
                      (local.tee $p10
                        (i32.add
                          (local.get $p10)
                          (i32.const -4)))))
                  (local.set $p10
                    (local.get $l38))
                  (br_if $B16
                    (i32.eq
                      (local.get $l37)
                      (local.get $l38))))
                (local.set $p11
                  (i32.add
                    (i32.add
                      (local.get $l41)
                      (local.get $l44))
                    (i32.shl
                      (local.get $p10)
                      (i32.const 2))))
                (local.set $p10
                  (i32.sub
                    (local.get $l37)
                    (local.get $p10)))
                (loop $L19
                  (i32.store
                    (local.get $p11)
                    (i32.const 0))
                  (local.set $p11
                    (i32.add
                      (local.get $p11)
                      (i32.const 4)))
                  (br_if $L19
                    (local.tee $p10
                      (i32.add
                        (local.get $p10)
                        (i32.const -1))))))
              (i32.store offset=12
                (local.get $p9)
                (local.get $l52))
              (i32.store offset=12
                (local.get $l50)
                (local.tee $p11
                  (i32.add
                    (local.get $l52)
                    (local.get $l30))))
              (i32.store offset=12
                (local.get $l49)
                (local.tee $p10
                  (i32.add
                    (local.get $p11)
                    (local.get $l51))))
              (local.set $l52
                (i32.add
                  (local.get $p10)
                  (local.get $l47)))
              (local.set $p10
                (i32.const 0))
              (block $B20
                (block $B21
                  (br_if $B21
                    (local.get $l53))
                  (local.set $p10
                    (local.get $l38))
                  (loop $L22
                    (v128.store align=4
                      (local.get $p11)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const 16)))
                    (br_if $L22
                      (local.tee $p10
                        (i32.add
                          (local.get $p10)
                          (i32.const -4)))))
                  (local.set $p10
                    (local.get $l38))
                  (br_if $B20
                    (i32.eq
                      (local.get $l37)
                      (local.get $l38))))
                (local.set $p11
                  (i32.add
                    (i32.add
                      (local.get $l41)
                      (local.get $l43))
                    (i32.shl
                      (local.get $p10)
                      (i32.const 2))))
                (local.set $p10
                  (i32.sub
                    (local.get $l37)
                    (local.get $p10)))
                (loop $L23
                  (i32.store
                    (local.get $p11)
                    (i32.const 0))
                  (local.set $p11
                    (i32.add
                      (local.get $p11)
                      (i32.const 4)))
                  (br_if $L23
                    (local.tee $p10
                      (i32.add
                        (local.get $p10)
                        (i32.const -1))))))
              (i32.store offset=16
                (local.get $p9)
                (local.get $l52))
              (i32.store offset=16
                (local.get $l50)
                (local.tee $p11
                  (i32.add
                    (local.get $l52)
                    (local.get $l30))))
              (i32.store offset=16
                (local.get $l49)
                (local.tee $p11
                  (i32.add
                    (local.get $p11)
                    (local.get $l51))))
              (local.set $p9
                (i32.add
                  (local.get $p11)
                  (local.get $l47)))
              (local.set $p10
                (i32.const 0))
              (block $B24
                (br_if $B24
                  (local.get $l53))
                (local.set $p11
                  (i32.add
                    (local.get $l41)
                    (local.get $l42)))
                (local.set $p10
                  (local.get $l38))
                (loop $L25
                  (v128.store align=4
                    (local.get $p11)
                    (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                  (local.set $p11
                    (i32.add
                      (local.get $p11)
                      (i32.const 16)))
                  (br_if $L25
                    (local.tee $p10
                      (i32.add
                        (local.get $p10)
                        (i32.const -4)))))
                (local.set $p10
                  (local.get $l38))
                (br_if $B24
                  (i32.ne
                    (local.get $l37)
                    (local.get $l38)))
                (local.set $l41
                  (local.get $p9))
                (br $B3))
              (local.set $p11
                (i32.add
                  (i32.add
                    (local.get $l41)
                    (local.get $l42))
                  (i32.shl
                    (local.get $p10)
                    (i32.const 2))))
              (local.set $p10
                (i32.sub
                  (local.get $l37)
                  (local.get $p10)))
              (loop $L26
                (i32.store
                  (local.get $p11)
                  (i32.const 0))
                (local.set $p11
                  (i32.add
                    (local.get $p11)
                    (i32.const 4)))
                (br_if $L26
                  (local.tee $p10
                    (i32.add
                      (local.get $p10)
                      (i32.const -1)))))
              (local.set $l41
                (local.get $p9))
              (br $B3))
            (i32.store offset=4
              (local.get $p9)
              (local.get $l52))
            (i32.store offset=4
              (local.get $l50)
              (local.tee $p11
                (i32.add
                  (local.get $l52)
                  (local.get $l30))))
            (i32.store offset=4
              (local.get $l49)
              (local.tee $p11
                (i32.add
                  (local.get $p11)
                  (local.get $l51))))
            (i32.store offset=8
              (local.get $p9)
              (local.tee $p11
                (i32.add
                  (local.get $p11)
                  (local.get $l47))))
            (i32.store offset=8
              (local.get $l50)
              (local.tee $p11
                (i32.add
                  (local.get $p11)
                  (local.get $l30))))
            (i32.store offset=8
              (local.get $l49)
              (local.tee $p11
                (i32.add
                  (local.get $p11)
                  (local.get $l51))))
            (i32.store offset=12
              (local.get $p9)
              (local.tee $p11
                (i32.add
                  (local.get $p11)
                  (local.get $l47))))
            (i32.store offset=12
              (local.get $l50)
              (local.tee $p11
                (i32.add
                  (local.get $p11)
                  (local.get $l30))))
            (i32.store offset=12
              (local.get $l49)
              (local.tee $p11
                (i32.add
                  (local.get $p11)
                  (local.get $l51))))
            (i32.store offset=16
              (local.get $p9)
              (local.tee $p11
                (i32.add
                  (local.get $p11)
                  (local.get $l47))))
            (i32.store offset=16
              (local.get $l50)
              (local.tee $p11
                (i32.add
                  (local.get $p11)
                  (local.get $l30))))
            (i32.store offset=16
              (local.get $l49)
              (local.tee $p11
                (i32.add
                  (local.get $p11)
                  (local.get $l51))))
            (local.set $l41
              (i32.add
                (local.get $p11)
                (local.get $l47)))
            (br $B3))
          (i32.store offset=4
            (local.get $p9)
            (local.get $l41))
          (i32.store
            (local.get $p9)
            (i32.const 0))
          (i32.store offset=4
            (local.get $l50)
            (local.tee $p11
              (i32.add
                (local.get $l41)
                (local.get $l30))))
          (i32.store offset=4
            (local.get $l49)
            (local.tee $p10
              (i32.add
                (local.get $p11)
                (local.tee $l51
                  (i32.shl
                    (local.get $l36)
                    (i32.const 2))))))
          (local.set $l52
            (i32.add
              (local.get $p10)
              (local.get $l47)))
          (block $B27
            (br_if $B27
              (local.get $l35))
            (local.set $p10
              (i32.const 0))
            (block $B28
              (br_if $B28
                (i32.lt_s
                  (local.get $l36)
                  (i32.const 4)))
              (local.set $p10
                (local.get $l38))
              (loop $L29
                (v128.store align=4
                  (local.get $p11)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $p11
                  (i32.add
                    (local.get $p11)
                    (i32.const 16)))
                (br_if $L29
                  (local.tee $p10
                    (i32.add
                      (local.get $p10)
                      (i32.const -4)))))
              (local.set $p10
                (local.get $l38))
              (br_if $B27
                (i32.eq
                  (local.get $l37)
                  (local.get $l38))))
            (local.set $p11
              (i32.add
                (i32.add
                  (local.get $l41)
                  (local.get $l46))
                (i32.shl
                  (local.get $p10)
                  (i32.const 2))))
            (local.set $p10
              (i32.sub
                (local.get $l37)
                (local.get $p10)))
            (loop $L30
              (i32.store
                (local.get $p11)
                (i32.const 0))
              (local.set $p11
                (i32.add
                  (local.get $p11)
                  (i32.const 4)))
              (br_if $L30
                (local.tee $p10
                  (i32.add
                    (local.get $p10)
                    (i32.const -1))))))
          (i32.store offset=12
            (local.get $p9)
            (local.get $l52))
          (i32.store offset=8
            (local.get $p9)
            (i32.const 0))
          (i32.store offset=12
            (local.get $l50)
            (local.tee $p11
              (i32.add
                (local.get $l52)
                (local.get $l30))))
          (i32.store offset=12
            (local.get $l49)
            (local.tee $p10
              (i32.add
                (local.get $p11)
                (local.get $l51))))
          (local.set $l52
            (i32.add
              (local.get $p10)
              (local.get $l47)))
          (block $B31
            (br_if $B31
              (local.get $l35))
            (local.set $p10
              (i32.const 0))
            (block $B32
              (br_if $B32
                (i32.lt_s
                  (local.get $l36)
                  (i32.const 4)))
              (local.set $p10
                (local.get $l38))
              (loop $L33
                (v128.store align=4
                  (local.get $p11)
                  (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                (local.set $p11
                  (i32.add
                    (local.get $p11)
                    (i32.const 16)))
                (br_if $L33
                  (local.tee $p10
                    (i32.add
                      (local.get $p10)
                      (i32.const -4)))))
              (local.set $p10
                (local.get $l38))
              (br_if $B31
                (i32.eq
                  (local.get $l37)
                  (local.get $l38))))
            (local.set $p11
              (i32.add
                (i32.add
                  (local.get $l41)
                  (local.get $l45))
                (i32.shl
                  (local.get $p10)
                  (i32.const 2))))
            (local.set $p10
              (i32.sub
                (local.get $l37)
                (local.get $p10)))
            (loop $L34
              (i32.store
                (local.get $p11)
                (i32.const 0))
              (local.set $p11
                (i32.add
                  (local.get $p11)
                  (i32.const 4)))
              (br_if $L34
                (local.tee $p10
                  (i32.add
                    (local.get $p10)
                    (i32.const -1))))))
          (i32.store offset=16
            (local.get $p9)
            (local.get $l52))
          (i32.store offset=16
            (local.get $l50)
            (local.tee $p11
              (i32.add
                (local.get $l52)
                (local.get $l30))))
          (i32.store offset=16
            (local.get $l49)
            (local.tee $p10
              (i32.add
                (local.get $p11)
                (local.get $l51))))
          (local.set $p9
            (i32.add
              (local.get $p10)
              (local.get $l47)))
          (block $B35
            (br_if $B35
              (i32.eqz
                (local.get $l35)))
            (local.set $l41
              (local.get $p9))
            (br $B3))
          (local.set $p10
            (i32.const 0))
          (block $B36
            (br_if $B36
              (i32.lt_s
                (local.get $l36)
                (i32.const 4)))
            (local.set $p10
              (local.get $l38))
            (loop $L37
              (v128.store align=4
                (local.get $p11)
                (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
              (local.set $p11
                (i32.add
                  (local.get $p11)
                  (i32.const 16)))
              (br_if $L37
                (local.tee $p10
                  (i32.add
                    (local.get $p10)
                    (i32.const -4)))))
            (local.set $p10
              (local.get $l38))
            (br_if $B36
              (i32.ne
                (local.get $l37)
                (local.get $l38)))
            (local.set $l41
              (local.get $p9))
            (br $B3))
          (local.set $p11
            (i32.add
              (i32.add
                (local.get $l41)
                (local.get $l44))
              (i32.shl
                (local.get $p10)
                (i32.const 2))))
          (local.set $p10
            (i32.sub
              (local.get $l37)
              (local.get $p10)))
          (loop $L38
            (i32.store
              (local.get $p11)
              (i32.const 0))
            (local.set $p11
              (i32.add
                (local.get $p11)
                (i32.const 4)))
            (br_if $L38
              (local.tee $p10
                (i32.add
                  (local.get $p10)
                  (i32.const -1)))))
          (local.set $l41
            (local.get $p9))
          (br $B3))
        (i32.store offset=4
          (local.get $p9)
          (local.get $l52))
        (i32.store offset=4
          (local.get $l50)
          (local.tee $p11
            (i32.add
              (local.get $l52)
              (local.get $l30))))
        (i32.store offset=4
          (local.get $l49)
          (local.tee $p11
            (i32.add
              (local.get $p11)
              (local.get $l51))))
        (i32.store offset=8
          (local.get $p9)
          (local.tee $p11
            (i32.add
              (local.get $p11)
              (local.get $l47))))
        (i32.store offset=8
          (local.get $l50)
          (local.tee $p11
            (i32.add
              (local.get $p11)
              (local.get $l30))))
        (i32.store offset=8
          (local.get $l49)
          (local.tee $p11
            (i32.add
              (local.get $p11)
              (local.get $l51))))
        (i32.store offset=12
          (local.get $p9)
          (local.tee $p11
            (i32.add
              (local.get $p11)
              (local.get $l47))))
        (i32.store offset=12
          (local.get $l50)
          (local.tee $p11
            (i32.add
              (local.get $p11)
              (local.get $l30))))
        (i32.store offset=12
          (local.get $l49)
          (local.tee $p11
            (i32.add
              (local.get $p11)
              (local.get $l51))))
        (i32.store offset=16
          (local.get $p9)
          (local.tee $p11
            (i32.add
              (local.get $p11)
              (local.get $l47))))
        (i32.store offset=16
          (local.get $l50)
          (local.tee $p11
            (i32.add
              (local.get $p11)
              (local.get $l30))))
        (i32.store offset=16
          (local.get $l49)
          (local.tee $p11
            (i32.add
              (local.get $p11)
              (local.get $l51))))
        (local.set $l41
          (i32.add
            (local.get $p11)
            (local.get $l47))))
      (br_if $L2
        (i32.ne
          (local.tee $l48
            (i32.add
              (local.get $l48)
              (i32.const 1)))
          (i32.const 3))))
    (block $B39
      (br_if $B39
        (i32.ne
          (local.get $p19)
          (i32.const -4)))
      (v128.store offset=112 align=8
        (local.get $p16)
        (local.tee $l54
          (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
      (v128.store offset=96 align=8
        (local.get $p16)
        (local.get $l54))
      (v128.store offset=80 align=8
        (local.get $p16)
        (local.get $l54))
      (v128.store offset=64 align=8
        (local.get $p16)
        (local.get $l54))
      (v128.store offset=48 align=8
        (local.get $p16)
        (local.get $l54))
      (v128.store offset=32 align=8
        (local.get $p16)
        (local.get $l54))
      (v128.store offset=16 align=8
        (local.get $p16)
        (local.get $l54))
      (v128.store align=8
        (local.get $p16)
        (local.get $l54))
      (v128.store offset=128 align=8
        (local.get $p16)
        (local.get $l54)))
    (block $B40
      (br_if $B40
        (i32.ge_s
          (local.get $p19)
          (local.get $p20)))
      (local.set $l55
        (i32.sub
          (i32.shl
            (local.get $p22)
            (i32.const 3))
          (local.tee $p11
            (i32.shl
              (local.get $p21)
              (i32.const 2)))))
      (local.set $l56
        (i32.sub
          (i32.shl
            (local.get $p22)
            (i32.const 2))
          (local.get $p11)))
      (local.set $l57
        (i32.mul
          (local.get $p0)
          (i32.add
            (local.tee $p11
              (i32.shl
                (local.get $p19)
                (i32.const 2)))
            (i32.shl
              (local.get $p1)
              (i32.const 2)))))
      (local.set $l58
        (select
          (local.get $p0)
          (i32.const 8)
          (i32.lt_s
            (local.get $p0)
            (i32.const 8))))
      (local.set $l59
        (i32.add
          (local.get $p8)
          (i32.const 24)))
      (local.set $l60
        (i32.sub
          (i32.const 0)
          (local.get $p21)))
      (local.set $l61
        (i32.and
          (local.get $p0)
          (i32.const 1)))
      (local.set $l62
        (i32.and
          (local.get $p0)
          (i32.const 2147483644)))
      (local.set $l63
        (i32.shl
          (local.get $l28)
          (i32.const 3)))
      (local.set $l64
        (i32.mul
          (local.get $p0)
          (i32.const 20)))
      (local.set $l65
        (i32.mul
          (local.get $p0)
          (i32.const 12)))
      (local.set $l66
        (i32.shl
          (local.get $p0)
          (i32.const 3)))
      (local.set $l42
        (i32.add
          (local.get $p0)
          (i32.const -7)))
      (local.set $l68
        (i32.sub
          (local.tee $l67
            (i32.and
              (local.get $p0)
              (i32.const 3)))
          (local.get $p0)))
      (local.set $l69
        (i32.shl
          (local.tee $p10
            (i32.mul
              (local.get $p22)
              (local.get $p0)))
          (i32.const 2)))
      (local.set $l71
        (i32.sub
          (i32.const 0)
          (local.tee $l70
            (i32.shl
              (local.get $p0)
              (i32.const 2)))))
      (local.set $l72
        (i32.shl
          (local.get $p10)
          (i32.const 3)))
      (local.set $l73
        (i32.add
          (local.get $p14)
          (local.tee $p10
            (i32.shl
              (i32.mul
                (local.get $p19)
                (local.get $p0))
              (i32.const 3)))))
      (local.set $l74
        (i32.add
          (local.get $p15)
          (local.get $p10)))
      (local.set $l76
        (i32.add
          (local.tee $l75
            (i32.add
              (local.get $p13)
              (i32.mul
                (local.get $p0)
                (i32.const 192))))
          (i32.const 64)))
      (local.set $l77
        (i32.add
          (local.get $l75)
          (i32.const -160)))
      (local.set $l79
        (i32.add
          (local.tee $l78
            (i32.add
              (local.get $p13)
              (i32.mul
                (local.get $p0)
                (i32.const 208))))
          (i32.const -64)))
      (local.set $l80
        (i32.shl
          (i32.mul
            (i32.add
              (local.get $p19)
              (local.get $p1))
            (local.get $p0))
          (i32.const 2)))
      (local.set $l81
        (i32x4.splat
          (local.get $l40)))
      (local.set $l82
        (i32x4.splat
          (local.get $p0)))
      (local.set $l83
        (i32.add
          (local.get $l24)
          (i32.const 1220)))
      (local.set $l84
        (i32.add
          (local.get $l24)
          (i32.const 1188)))
      (local.set $l85
        (i32.add
          (local.get $l24)
          (i32.const 1156)))
      (local.set $l86
        (i32.add
          (local.get $l24)
          (i32.const 1124)))
      (local.set $l87
        (i32.add
          (local.get $l24)
          (i32.const 1092)))
      (local.set $l88
        (i32.add
          (local.get $l24)
          (i32.const 1060)))
      (local.set $l89
        (i32.add
          (local.get $l24)
          (i32.const 1028)))
      (local.set $l90
        (i32.add
          (local.get $l24)
          (i32.const 996)))
      (local.set $l91
        (i32.add
          (local.get $l24)
          (i32.const 964)))
      (local.set $l92
        (i32.add
          (local.get $l24)
          (i32.const 932)))
      (local.set $l93
        (i32.add
          (local.get $l24)
          (i32.const 900)))
      (local.set $l94
        (i32.add
          (local.get $l24)
          (i32.const 868)))
      (local.set $l95
        (i32.add
          (local.get $l24)
          (i32.const 836)))
      (local.set $l96
        (i32.add
          (local.get $l24)
          (i32.const 804)))
      (local.set $l97
        (i32.add
          (local.get $l24)
          (i32.const 772)))
      (local.set $l98
        (i32.add
          (local.get $l24)
          (i32.const 740)))
      (local.set $l99
        (i32.add
          (local.get $l24)
          (i32.const 708)))
      (local.set $l100
        (i32.add
          (local.get $l24)
          (i32.const 676)))
      (local.set $l101
        (i32.add
          (local.get $l24)
          (i32.const 644)))
      (local.set $l102
        (i32.add
          (local.get $l24)
          (i32.const 612)))
      (local.set $l103
        (i32.add
          (local.get $l24)
          (i32.const 580)))
      (local.set $l104
        (i32.add
          (local.get $l24)
          (i32.const 548)))
      (local.set $l105
        (i32.add
          (local.get $l24)
          (i32.const 516)))
      (local.set $l106
        (i32.add
          (local.get $l24)
          (i32.const 484)))
      (local.set $l107
        (i32.add
          (local.get $l24)
          (i32.const 452)))
      (local.set $l108
        (i32.add
          (local.get $l24)
          (i32.const 420)))
      (local.set $l109
        (i32.add
          (local.get $l24)
          (i32.const 388)))
      (local.set $l110
        (i32.add
          (local.get $l24)
          (i32.const 356)))
      (local.set $l111
        (i32.add
          (local.get $l24)
          (i32.const 324)))
      (local.set $l112
        (i32.or
          (i32.add
            (local.get $l24)
            (i32.const 288))
          (i32.const 4)))
      (local.set $l113
        (f64x2.promote_low_f32x4
          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
            (local.tee $l54
              (v128.const i32x4 0xbe1fb275 0xbe1fb275 0xbe1fb275 0xbe1fb275))
            (local.get $l54))))
      (local.set $l114
        (f64x2.promote_low_f32x4
          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
            (local.tee $l54
              (v128.const i32x4 0x3b789536 0x3b789536 0x3b789536 0x3b789536))
            (local.get $l54))))
      (local.set $l115
        (i32.lt_s
          (local.get $p0)
          (i32.const -3)))
      (local.set $l117
        (i32.lt_u
          (i32.add
            (local.tee $l116
              (i32.shl
                (local.get $l28)
                (i32.const 2)))
            (i32.const -1))
          (i32.const 15)))
      (local.set $l118
        (local.get $p19))
      (local.set $l120
        (local.tee $l119
          (i32.mul
            (local.get $p0)
            (i32.add
              (i32.shl
                (local.get $p1)
                (i32.const 3))
              (local.get $p11)))))
      (local.set $l121
        (i32.const 0))
      (loop $L41
        (local.set $l122
          (i32.add
            (local.get $p19)
            (i32.const 4)))
        (block $B42
          (br_if $B42
            (i32.ge_s
              (local.get $p23)
              (local.get $p1)))
          (br_if $B42
            (i32.gt_s
              (local.get $p23)
              (local.get $l122)))
          (loop $L43
            (local.set $l123
              (select
                (local.tee $p11
                  (i32.sub
                    (local.get $p1)
                    (local.get $p23)))
                (i32.const 4)
                (i32.lt_s
                  (local.get $p11)
                  (i32.const 4))))
            (block $B44
              (block $B45
                (br_if $B45
                  (local.tee $l124
                    (i32.lt_s
                      (local.get $p11)
                      (i32.const 1))))
                (local.set $l125
                  (i32.mul
                    (local.get $p0)
                    (local.tee $p11
                      (i32.add
                        (local.get $l60)
                        (local.get $p23)))))
                (local.set $l126
                  (i32.mul
                    (local.get $l70)
                    (local.get $p11)))
                (local.set $l127
                  (i32.mul
                    (local.get $p0)
                    (i32.add
                      (local.get $l55)
                      (local.tee $p11
                        (i32.shl
                          (local.get $p23)
                          (i32.const 2))))))
                (local.set $l128
                  (i32.mul
                    (local.get $p0)
                    (i32.add
                      (local.get $l56)
                      (local.get $p11))))
                (local.set $l129
                  (i32.const 0))
                (loop $L46
                  (local.set $p15
                    (i32.mul
                      (i32.rem_s
                        (i32.add
                          (local.get $l129)
                          (local.get $p23))
                        (i32.const 16))
                      (local.get $p0)))
                  (local.set $p11
                    (local.get $l29))
                  (loop $L47
                    (local.set $l50
                      (select
                        (local.get $p4)
                        (local.get $p6)
                        (local.tee $p22
                          (i32.and
                            (local.get $p11)
                            (i32.const 1)))))
                    (local.set $p21
                      (select
                        (local.get $p3)
                        (local.get $p5)
                        (local.get $p22)))
                    (local.set $l28
                      (select
                        (i32.add
                          (local.get $l24)
                          (i32.const 248))
                        (i32.add
                          (local.get $l24)
                          (i32.const 236))
                        (local.get $p22)))
                    (local.set $p10
                      (i32.const 0))
                    (block $B48
                      (br_if $B48
                        (i32.lt_s
                          (local.get $p0)
                          (i32.const 4)))
                      (local.set $l52
                        (i32.add
                          (select
                            (local.get $l27)
                            (local.get $l32)
                            (local.get $p22))
                          (local.tee $p11
                            (i32.shl
                              (local.get $p15)
                              (i32.const 2)))))
                      (local.set $l53
                        (i32.add
                          (select
                            (local.get $l26)
                            (local.get $l31)
                            (local.get $p22))
                          (local.get $p11)))
                      (local.set $l33
                        (i32.add
                          (local.get $p21)
                          (local.get $l126)))
                      (local.set $l34
                        (i32.add
                          (local.get $p21)
                          (local.get $l127)))
                      (local.set $l43
                        (i32.add
                          (local.get $p21)
                          (local.get $l128)))
                      (local.set $l44
                        (i32.add
                          (i32.load
                            (local.get $l28))
                          (local.get $p11)))
                      (local.set $p10
                        (i32.const 0))
                      (local.set $p11
                        (i32.const 0))
                      (loop $L49
                        (local.set $l49
                          (local.get $p10))
                        (block $B50
                          (block $B51
                            (block $B52
                              (br_if $B52
                                (local.get $l50))
                              (local.set $l130
                                (v128.load32_lane 3
                                  (i32.add
                                    (local.get $p7)
                                    (i32.shl
                                      (local.tee $p9
                                        (i32.load8_u
                                          (i32.add
                                            (local.tee $p10
                                              (i32.add
                                                (local.get $l33)
                                                (local.get $p11)))
                                            (i32.const 12))))
                                      (i32.const 2)))
                                  (v128.load32_lane 2
                                    (i32.add
                                      (local.get $p7)
                                      (i32.shl
                                        (local.tee $l48
                                          (i32.load8_u
                                            (i32.add
                                              (local.get $p10)
                                              (i32.const 8))))
                                        (i32.const 2)))
                                    (v128.load32_lane 1
                                      (i32.add
                                        (local.get $p7)
                                        (i32.shl
                                          (local.tee $l41
                                            (i32.load8_u
                                              (i32.add
                                                (local.get $p10)
                                                (i32.const 4))))
                                          (i32.const 2)))
                                      (v128.load32_zero
                                        (i32.add
                                          (local.get $p7)
                                          (i32.shl
                                            (local.tee $l30
                                              (i32.load8_u
                                                (local.get $p10)))
                                            (i32.const 2))))))))
                              (local.set $l131
                                (v128.load32_lane 3
                                  (i32.add
                                    (local.get $p7)
                                    (i32.shl
                                      (local.tee $l36
                                        (i32.load8_u
                                          (i32.add
                                            (local.get $p10)
                                            (i32.const 14))))
                                      (i32.const 2)))
                                  (v128.load32_lane 2
                                    (i32.add
                                      (local.get $p7)
                                      (i32.shl
                                        (local.tee $l37
                                          (i32.load8_u
                                            (i32.add
                                              (local.get $p10)
                                              (i32.const 10))))
                                        (i32.const 2)))
                                    (v128.load32_lane 1
                                      (i32.add
                                        (local.get $p7)
                                        (i32.shl
                                          (local.tee $l35
                                            (i32.load8_u
                                              (i32.add
                                                (local.get $p10)
                                                (i32.const 6))))
                                          (i32.const 2)))
                                      (v128.load32_zero
                                        (i32.add
                                          (local.get $p7)
                                          (i32.shl
                                            (local.tee $l38
                                              (i32.load8_u
                                                (i32.add
                                                  (local.get $p10)
                                                  (i32.const 2))))
                                            (i32.const 2))))))))
                              (local.set $l132
                                (v128.load32_lane 3
                                  (i32.add
                                    (local.get $p7)
                                    (i32.shl
                                      (local.tee $l46
                                        (i32.load8_u
                                          (i32.add
                                            (local.get $p10)
                                            (i32.const 13))))
                                      (i32.const 2)))
                                  (v128.load32_lane 2
                                    (i32.add
                                      (local.get $p7)
                                      (i32.shl
                                        (local.tee $p13
                                          (i32.load8_u
                                            (i32.add
                                              (local.get $p10)
                                              (i32.const 9))))
                                        (i32.const 2)))
                                    (v128.load32_lane 1
                                      (i32.add
                                        (local.get $p7)
                                        (i32.shl
                                          (local.tee $l51
                                            (i32.load8_u
                                              (i32.add
                                                (local.get $p10)
                                                (i32.const 5))))
                                          (i32.const 2)))
                                      (v128.load32_zero
                                        (i32.add
                                          (local.get $p7)
                                          (i32.shl
                                            (local.tee $p10
                                              (i32.load8_u
                                                (i32.add
                                                  (local.get $p10)
                                                  (i32.const 1))))
                                            (i32.const 2))))))))
                              (local.set $l38
                                (i32.shr_u
                                  (i32.mul
                                    (local.tee $l45
                                      (i32.or
                                        (i32.or
                                          (i32.shl
                                            (local.get $p10)
                                            (i32.const 8))
                                          (i32.shl
                                            (local.get $l30)
                                            (i32.const 16)))
                                        (local.get $l38)))
                                    (i32.const -1640531535))
                                  (i32.const 15)))
                              (local.set $l30
                                (i32.shr_u
                                  (i32.mul
                                    (local.tee $l51
                                      (i32.or
                                        (i32.or
                                          (i32.shl
                                            (local.get $l51)
                                            (i32.const 8))
                                          (i32.shl
                                            (local.get $l41)
                                            (i32.const 16)))
                                        (local.get $l35)))
                                    (i32.const -1640531535))
                                  (i32.const 15)))
                              (local.set $l41
                                (i32.shr_u
                                  (i32.mul
                                    (local.tee $l35
                                      (i32.or
                                        (i32.or
                                          (i32.shl
                                            (local.get $p13)
                                            (i32.const 8))
                                          (i32.shl
                                            (local.get $l48)
                                            (i32.const 16)))
                                        (local.get $l37)))
                                    (i32.const -1640531535))
                                  (i32.const 15)))
                              (br_if $B51
                                (i32.ne
                                  (i32.load
                                    (i32.add
                                      (local.get $p17)
                                      (i32.shl
                                        (local.tee $l36
                                          (i32.shr_u
                                            (i32.mul
                                              (local.tee $l37
                                                (i32.or
                                                  (i32.or
                                                    (i32.shl
                                                      (local.get $l46)
                                                      (i32.const 8))
                                                    (i32.shl
                                                      (local.get $p9)
                                                      (i32.const 16)))
                                                  (local.get $l36)))
                                              (i32.const -1640531535))
                                            (i32.const 15)))
                                        (i32.const 2))))
                                  (local.get $l37)))
                              (br_if $B51
                                (i32.ne
                                  (i32.load
                                    (i32.add
                                      (local.get $p17)
                                      (i32.shl
                                        (local.get $l41)
                                        (i32.const 2))))
                                  (local.get $l35)))
                              (br_if $B51
                                (i32.ne
                                  (i32.load
                                    (i32.add
                                      (local.get $p17)
                                      (i32.shl
                                        (local.get $l30)
                                        (i32.const 2))))
                                  (local.get $l51)))
                              (br_if $B51
                                (i32.ne
                                  (i32.load
                                    (i32.add
                                      (local.get $p17)
                                      (i32.shl
                                        (local.get $l38)
                                        (i32.const 2))))
                                  (local.get $l45)))
                              (f32.store
                                (local.tee $p10
                                  (i32.add
                                    (local.get $l44)
                                    (local.get $p11)))
                                (f32.load
                                  (local.tee $l46
                                    (i32.add
                                      (local.get $p18)
                                      (i32.mul
                                        (local.get $l38)
                                        (i32.const 12))))))
                              (f32.store
                                (local.tee $p9
                                  (i32.add
                                    (local.get $l53)
                                    (local.get $p11)))
                                (f32.load
                                  (i32.add
                                    (local.get $l46)
                                    (i32.const 4))))
                              (f32.store
                                (local.tee $l48
                                  (i32.add
                                    (local.get $l52)
                                    (local.get $p11)))
                                (f32.load
                                  (i32.add
                                    (local.get $l46)
                                    (i32.const 8))))
                              (f32.store
                                (i32.add
                                  (local.get $p10)
                                  (i32.const 4))
                                (f32.load
                                  (local.tee $l46
                                    (i32.add
                                      (local.get $p18)
                                      (i32.mul
                                        (local.get $l30)
                                        (i32.const 12))))))
                              (f32.store
                                (i32.add
                                  (local.get $p9)
                                  (i32.const 4))
                                (f32.load
                                  (i32.add
                                    (local.get $l46)
                                    (i32.const 4))))
                              (f32.store
                                (i32.add
                                  (local.get $l48)
                                  (i32.const 4))
                                (f32.load
                                  (i32.add
                                    (local.get $l46)
                                    (i32.const 8))))
                              (f32.store
                                (i32.add
                                  (local.get $p10)
                                  (i32.const 8))
                                (f32.load
                                  (local.tee $l46
                                    (i32.add
                                      (local.get $p18)
                                      (i32.mul
                                        (local.get $l41)
                                        (i32.const 12))))))
                              (f32.store
                                (i32.add
                                  (local.get $p9)
                                  (i32.const 8))
                                (f32.load
                                  (i32.add
                                    (local.get $l46)
                                    (i32.const 4))))
                              (f32.store
                                (i32.add
                                  (local.get $l48)
                                  (i32.const 8))
                                (f32.load
                                  (i32.add
                                    (local.get $l46)
                                    (i32.const 8))))
                              (f32.store
                                (i32.add
                                  (local.get $p10)
                                  (i32.const 12))
                                (f32.load
                                  (local.tee $p10
                                    (i32.add
                                      (local.get $p18)
                                      (i32.mul
                                        (local.get $l36)
                                        (i32.const 12))))))
                              (f32.store
                                (i32.add
                                  (local.get $p9)
                                  (i32.const 12))
                                (f32.load
                                  (i32.add
                                    (local.get $p10)
                                    (i32.const 4))))
                              (f32.store
                                (i32.add
                                  (local.get $l48)
                                  (i32.const 12))
                                (f32.load
                                  (i32.add
                                    (local.get $p10)
                                    (i32.const 8))))
                              (br $B50))
                            (local.set $l131
                              (v128.load align=4
                                (i32.add
                                  (local.get $l34)
                                  (local.get $p11))))
                            (local.set $l132
                              (v128.load align=4
                                (i32.add
                                  (local.get $l43)
                                  (local.get $p11))))
                            (local.set $l130
                              (v128.load align=4
                                (i32.add
                                  (local.get $l33)
                                  (local.get $p11)))))
                          (local.set $l138
                            (v128.and
                              (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                (local.tee $l135
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.tee $l133
                                        (f64x2.promote_low_f32x4
                                          (local.get $l131)))
                                      (local.tee $l54
                                        (v128.const i32x4 0xe0000000 0x3fb3f7ce 0xe0000000 0x3fb3f7ce)))
                                    (local.tee $l134
                                      (v128.const i32x4 0xc0000000 0x3f6f12a6 0xc0000000 0x3f6f12a6))))
                                (local.tee $l137
                                  (f64x2.add
                                    (f64x2.mul
                                      (local.tee $l136
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l131)
                                            (local.get $l131))))
                                      (local.get $l54))
                                    (local.get $l114))))
                              (local.tee $l54
                                (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
                          (local.set $l140
                            (local.tee $l139
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                (f32x4.demote_f64x2_zero
                                  (local.get $l135))
                                (f32x4.demote_f64x2_zero
                                  (local.get $l137)))))
                          (block $B53
                            (br_if $B53
                              (i32.eqz
                                (local.tee $p10
                                  (v128.any_true
                                    (i32x4.eq
                                      (v128.and
                                        (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                          (local.get $l135)
                                          (local.get $l137))
                                        (local.tee $l135
                                          (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                                      (local.tee $l137
                                        (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))))
                            (local.set $l140
                              (call $fma4_tie
                                (v128.const i32x4 0x3d9fbe77 0x3d9fbe77 0x3d9fbe77 0x3d9fbe77)
                                (local.get $l131)
                                (v128.const i32x4 0x3b789536 0x3b789536 0x3b789536 0x3b789536))))
                          (local.set $l146
                            (i32x4.max_u
                              (local.get $l138)
                              (local.tee $l145
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l143
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.tee $l141
                                            (f64x2.promote_low_f32x4
                                              (local.get $l132)))
                                          (local.tee $l142
                                            (v128.const i32x4 0x80000000 0x3fe3e76c 0x80000000 0x3fe3e76c)))
                                        (f64x2.promote_low_f32x4
                                          (local.get $l140))))
                                    (local.tee $l142
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.tee $l144
                                            (f64x2.promote_low_f32x4
                                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                (local.get $l132)
                                                (local.get $l132))))
                                          (local.get $l142))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l140)
                                            (local.get $l140))))))
                                  (local.get $l54)))))
                          (local.set $l145
                            (i32x4.min_u
                              (local.get $l138)
                              (local.get $l145)))
                          (block $B54
                            (block $B55
                              (br_if $B55
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l143)
                                        (local.get $l142))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l140
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l143))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l142))))
                              (br $B54))
                            (local.set $l140
                              (call $fma4_tie
                                (v128.const i32x4 0x3f1f3b64 0x3f1f3b64 0x3f1f3b64 0x3f1f3b64)
                                (local.get $l132)
                                (local.get $l140))))
                          (local.set $l150
                            (i32x4.max_u
                              (local.get $l146)
                              (local.tee $l149
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l143
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.tee $l147
                                            (f64x2.promote_low_f32x4
                                              (local.get $l130)))
                                          (local.tee $l142
                                            (v128.const i32x4 0x40000000 0x3fd33333 0x40000000 0x3fd33333)))
                                        (f64x2.promote_low_f32x4
                                          (local.get $l140))))
                                    (local.tee $l142
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.tee $l148
                                            (f64x2.promote_low_f32x4
                                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                (local.get $l130)
                                                (local.get $l130))))
                                          (local.get $l142))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l140)
                                            (local.get $l140))))))
                                  (local.get $l54)))))
                          (local.set $l151
                            (i32x4.min_u
                              (local.get $l145)
                              (local.get $l149)))
                          (block $B56
                            (block $B57
                              (br_if $B57
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l143)
                                        (local.get $l142))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l140
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l143))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l142))))
                              (br $B56))
                            (local.set $l140
                              (call $fma4_tie
                                (v128.const i32x4 0x3e99999a 0x3e99999a 0x3e99999a 0x3e99999a)
                                (local.get $l130)
                                (local.get $l140))))
                          (local.set $l150
                            (i32x4.max_u
                              (local.get $l150)
                              (local.tee $l160
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l157
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.tee $l153
                                            (f64x2.promote_low_f32x4
                                              (local.tee $l142
                                                (f32x4.mul
                                                  (local.tee $l143
                                                    (v128.andnot
                                                      (local.get $l140)
                                                      (f32x4.le
                                                        (local.get $l140)
                                                        (local.tee $l149
                                                          (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))))
                                                  (local.tee $l152
                                                    (v128.const i32x4 0xbeaaaaab 0xbeaaaaab 0xbeaaaaab 0xbeaaaaab))))))
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l145
                                              (f32x4.mul
                                                (local.tee $l140
                                                  (f32x4.mul
                                                    (local.tee $l146
                                                      (v128.and
                                                        (i32x4.ne
                                                          (local.get $l143)
                                                          (local.tee $l154
                                                            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                                                        (i32x4.add
                                                          (i32x4.mul
                                                            (i32x4.shr_u
                                                              (local.get $l143)
                                                              (i32.const 23))
                                                            (local.tee $l155
                                                              (v128.const i32x4 0xffd55556 0xffd55556 0xffd55556 0xffd55556)))
                                                          (local.tee $l156
                                                            (v128.const i32x4 0x54800000 0x54800000 0x54800000 0x54800000)))))
                                                    (local.get $l146)))
                                                (local.get $l140)))))
                                        (f64x2.promote_low_f32x4
                                          (local.tee $l146
                                            (f32x4.mul
                                              (local.get $l146)
                                              (local.tee $l140
                                                (v128.const i32x4 0x3faaaaab 0x3faaaaab 0x3faaaaab 0x3faaaaab)))))))
                                    (local.tee $l159
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.tee $l158
                                            (f64x2.promote_low_f32x4
                                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                (local.get $l142)
                                                (local.get $l142))))
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l145)
                                              (local.get $l145))))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l146)
                                            (local.get $l146))))))
                                  (local.get $l54)))))
                          (local.set $l151
                            (i32x4.min_u
                              (local.get $l151)
                              (local.get $l160)))
                          (block $B58
                            (block $B59
                              (br_if $B59
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l157)
                                        (local.get $l159))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l145
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l157))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l159))))
                              (br $B58))
                            (local.set $l145
                              (call $fma4_tie
                                (local.get $l142)
                                (local.get $l145)
                                (local.get $l146))))
                          (local.set $l150
                            (i32x4.max_u
                              (local.get $l150)
                              (local.tee $l160
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l157
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l153)
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l146
                                              (f32x4.mul
                                                (local.tee $l146
                                                  (f32x4.mul
                                                    (local.get $l145)
                                                    (local.get $l145)))
                                                (local.get $l146)))))
                                        (f64x2.promote_low_f32x4
                                          (local.tee $l145
                                            (f32x4.mul
                                              (local.get $l145)
                                              (local.get $l140))))))
                                    (local.tee $l159
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l158)
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l146)
                                              (local.get $l146))))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l145)
                                            (local.get $l145))))))
                                  (local.get $l54)))))
                          (local.set $l151
                            (i32x4.min_u
                              (local.get $l151)
                              (local.get $l160)))
                          (block $B60
                            (block $B61
                              (br_if $B61
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l157)
                                        (local.get $l159))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l145
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l157))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l159))))
                              (br $B60))
                            (local.set $l145
                              (call $fma4_tie
                                (local.get $l142)
                                (local.get $l146)
                                (local.get $l145))))
                          (local.set $l150
                            (i32x4.max_u
                              (local.get $l150)
                              (local.tee $l157
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l153
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l153)
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l146
                                              (f32x4.mul
                                                (local.tee $l146
                                                  (f32x4.mul
                                                    (local.get $l145)
                                                    (local.get $l145)))
                                                (local.get $l146)))))
                                        (f64x2.promote_low_f32x4
                                          (local.tee $l145
                                            (f32x4.mul
                                              (local.get $l145)
                                              (local.get $l140))))))
                                    (local.tee $l158
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l158)
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l146)
                                              (local.get $l146))))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l145)
                                            (local.get $l145))))))
                                  (local.get $l54)))))
                          (local.set $l160
                            (i32x4.min_u
                              (local.get $l151)
                              (local.get $l157)))
                          (block $B62
                            (block $B63
                              (br_if $B63
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l153)
                                        (local.get $l158))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l142
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l153))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l158))))
                              (br $B62))
                            (local.set $l142
                              (call $fma4_tie
                                (local.get $l142)
                                (local.get $l146)
                                (local.get $l145))))
                          (local.set $l151
                            (i32x4.max_u
                              (local.get $l150)
                              (local.tee $l161
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l153
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l145
                                              (f32x4.neg
                                                (local.get $l143))))
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l146
                                              (f32x4.mul
                                                (local.tee $l146
                                                  (f32x4.mul
                                                    (local.get $l142)
                                                    (local.get $l142)))
                                                (local.get $l146)))))
                                        (local.tee $l157
                                          (f64x2.promote_low_f32x4
                                            (local.get $l142)))))
                                    (local.tee $l158
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l145)
                                              (local.get $l145)))
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l146)
                                              (local.get $l146))))
                                        (local.tee $l159
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l142)
                                              (local.get $l142)))))))
                                  (local.get $l54)))))
                          (local.set $l150
                            (i32x4.min_u
                              (local.get $l160)
                              (local.get $l161)))
                          (block $B64
                            (block $B65
                              (br_if $B65
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l153)
                                        (local.get $l158))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l146
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l153))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l158))))
                              (br $B64))
                            (local.set $l146
                              (call $fma4_tie
                                (local.get $l145)
                                (local.get $l146)
                                (local.get $l142))))
                          (local.set $l159
                            (i32x4.max_u
                              (local.get $l151)
                              (local.tee $l157
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l153
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (local.get $l146))
                                          (local.tee $l145
                                            (v128.const i32x4 0x60000000 0x3fd55555 0x60000000 0x3fd55555)))
                                        (local.get $l157)))
                                    (local.tee $l158
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l146)
                                              (local.get $l146)))
                                          (local.get $l145))
                                        (local.get $l159))))
                                  (local.get $l54)))))
                          (local.set $l157
                            (i32x4.min_u
                              (local.get $l150)
                              (local.get $l157)))
                          (block $B66
                            (block $B67
                              (br_if $B67
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l153)
                                        (local.get $l158))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l142
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l153))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l158))))
                              (br $B66))
                            (local.set $l142
                              (call $fma4_tie
                                (v128.const i32x4 0x3eaaaaab 0x3eaaaaab 0x3eaaaaab 0x3eaaaaab)
                                (local.get $l146)
                                (local.get $l142))))
                          (local.set $l159
                            (i32x4.max_u
                              (local.get $l159)
                              (local.tee $l150
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l153
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (local.get $l143))
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l142
                                              (f32x4.mul
                                                (local.get $l142)
                                                (local.get $l142)))))
                                        (local.tee $l146
                                          (v128.const i32x4 0xa0000000 0xbfc3f64e 0xa0000000 0xbfc3f64e))))
                                    (local.tee $l158
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l143)
                                              (local.get $l143)))
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l142)
                                              (local.get $l142))))
                                        (local.get $l113))))
                                  (local.get $l54)))))
                          (local.set $l157
                            (i32x4.min_u
                              (local.get $l157)
                              (local.get $l150)))
                          (block $B68
                            (block $B69
                              (br_if $B69
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l153)
                                        (local.get $l158))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l162
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l153))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l158))))
                              (br $B68))
                            (local.set $l162
                              (call $fma4_tie
                                (local.get $l142)
                                (local.get $l143)
                                (v128.const i32x4 0xbe1fb275 0xbe1fb275 0xbe1fb275 0xbe1fb275))))
                          (local.set $l153
                            (i32x4.max_u
                              (local.get $l159)
                              (local.get $l138)))
                          (local.set $l138
                            (i32x4.min_u
                              (local.get $l157)
                              (local.get $l138)))
                          (block $B70
                            (br_if $B70
                              (i32.eqz
                                (local.get $p10)))
                            (local.set $l139
                              (call $fma4_tie
                                (v128.const i32x4 0x3d9fbe77 0x3d9fbe77 0x3d9fbe77 0x3d9fbe77)
                                (local.get $l131)
                                (v128.const i32x4 0x3b789536 0x3b789536 0x3b789536 0x3b789536))))
                          (local.set $l153
                            (i32x4.max_u
                              (local.get $l153)
                              (local.tee $l158
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l143
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l141)
                                          (local.tee $l142
                                            (v128.const i32x4 0x20000000 0x3fe624dd 0x20000000 0x3fe624dd)))
                                        (f64x2.promote_low_f32x4
                                          (local.get $l139))))
                                    (local.tee $l142
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l144)
                                          (local.get $l142))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l139)
                                            (local.get $l139))))))
                                  (local.get $l54)))))
                          (local.set $l138
                            (i32x4.min_u
                              (local.get $l138)
                              (local.get $l158)))
                          (block $B71
                            (block $B72
                              (br_if $B72
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l143)
                                        (local.get $l142))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l143
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l143))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l142))))
                              (br $B71))
                            (local.set $l143
                              (call $fma4_tie
                                (v128.const i32x4 0x3f3126e9 0x3f3126e9 0x3f3126e9 0x3f3126e9)
                                (local.get $l132)
                                (local.get $l139))))
                          (local.set $l150
                            (i32x4.max_u
                              (local.get $l153)
                              (local.tee $l158
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l142
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l147)
                                          (local.tee $l139
                                            (v128.const i32x4 0xe0000000 0x3fcd70a3 0xe0000000 0x3fcd70a3)))
                                        (f64x2.promote_low_f32x4
                                          (local.get $l143))))
                                    (local.tee $l139
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l148)
                                          (local.get $l139))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l143)
                                            (local.get $l143))))))
                                  (local.get $l54)))))
                          (local.set $l151
                            (i32x4.min_u
                              (local.get $l138)
                              (local.get $l158)))
                          (block $B73
                            (block $B74
                              (br_if $B74
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l142)
                                        (local.get $l139))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l143
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l142))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l139))))
                              (br $B73))
                            (local.set $l143
                              (call $fma4_tie
                                (v128.const i32x4 0x3e6b851f 0x3e6b851f 0x3e6b851f 0x3e6b851f)
                                (local.get $l130)
                                (local.get $l143))))
                          (local.set $l150
                            (i32x4.max_u
                              (local.get $l150)
                              (local.tee $l160
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l157
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.tee $l153
                                            (f64x2.promote_low_f32x4
                                              (local.tee $l142
                                                (f32x4.mul
                                                  (local.tee $l143
                                                    (v128.andnot
                                                      (local.get $l143)
                                                      (f32x4.le
                                                        (local.get $l143)
                                                        (local.get $l149))))
                                                  (local.get $l152)))))
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l139
                                              (f32x4.mul
                                                (local.tee $l139
                                                  (f32x4.mul
                                                    (local.tee $l138
                                                      (v128.and
                                                        (i32x4.ne
                                                          (local.get $l143)
                                                          (local.get $l154))
                                                        (i32x4.add
                                                          (i32x4.mul
                                                            (i32x4.shr_u
                                                              (local.get $l143)
                                                              (i32.const 23))
                                                            (local.get $l155))
                                                          (local.get $l156))))
                                                    (local.get $l138)))
                                                (local.get $l139)))))
                                        (f64x2.promote_low_f32x4
                                          (local.tee $l138
                                            (f32x4.mul
                                              (local.get $l138)
                                              (local.get $l140))))))
                                    (local.tee $l159
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.tee $l158
                                            (f64x2.promote_low_f32x4
                                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                (local.get $l142)
                                                (local.get $l142))))
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l139)
                                              (local.get $l139))))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l138)
                                            (local.get $l138))))))
                                  (local.get $l54)))))
                          (local.set $l151
                            (i32x4.min_u
                              (local.get $l151)
                              (local.get $l160)))
                          (block $B75
                            (block $B76
                              (br_if $B76
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l157)
                                        (local.get $l159))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l139
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l157))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l159))))
                              (br $B75))
                            (local.set $l139
                              (call $fma4_tie
                                (local.get $l142)
                                (local.get $l139)
                                (local.get $l138))))
                          (local.set $l150
                            (i32x4.max_u
                              (local.get $l150)
                              (local.tee $l160
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l157
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l153)
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l138
                                              (f32x4.mul
                                                (local.tee $l138
                                                  (f32x4.mul
                                                    (local.get $l139)
                                                    (local.get $l139)))
                                                (local.get $l138)))))
                                        (f64x2.promote_low_f32x4
                                          (local.tee $l139
                                            (f32x4.mul
                                              (local.get $l139)
                                              (local.get $l140))))))
                                    (local.tee $l159
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l158)
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l138)
                                              (local.get $l138))))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l139)
                                            (local.get $l139))))))
                                  (local.get $l54)))))
                          (local.set $l151
                            (i32x4.min_u
                              (local.get $l151)
                              (local.get $l160)))
                          (block $B77
                            (block $B78
                              (br_if $B78
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l157)
                                        (local.get $l159))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l139
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l157))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l159))))
                              (br $B77))
                            (local.set $l139
                              (call $fma4_tie
                                (local.get $l142)
                                (local.get $l138)
                                (local.get $l139))))
                          (local.set $l150
                            (i32x4.max_u
                              (local.get $l150)
                              (local.tee $l157
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l153
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l153)
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l138
                                              (f32x4.mul
                                                (local.tee $l138
                                                  (f32x4.mul
                                                    (local.get $l139)
                                                    (local.get $l139)))
                                                (local.get $l138)))))
                                        (f64x2.promote_low_f32x4
                                          (local.tee $l139
                                            (f32x4.mul
                                              (local.get $l139)
                                              (local.get $l140))))))
                                    (local.tee $l158
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l158)
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l138)
                                              (local.get $l138))))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l139)
                                            (local.get $l139))))))
                                  (local.get $l54)))))
                          (local.set $l160
                            (i32x4.min_u
                              (local.get $l151)
                              (local.get $l157)))
                          (block $B79
                            (block $B80
                              (br_if $B80
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l153)
                                        (local.get $l158))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l142
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l153))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l158))))
                              (br $B79))
                            (local.set $l142
                              (call $fma4_tie
                                (local.get $l142)
                                (local.get $l138)
                                (local.get $l139))))
                          (local.set $l151
                            (i32x4.max_u
                              (local.get $l150)
                              (local.tee $l161
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l153
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l139
                                              (f32x4.neg
                                                (local.get $l143))))
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l138
                                              (f32x4.mul
                                                (local.tee $l138
                                                  (f32x4.mul
                                                    (local.get $l142)
                                                    (local.get $l142)))
                                                (local.get $l138)))))
                                        (local.tee $l157
                                          (f64x2.promote_low_f32x4
                                            (local.get $l142)))))
                                    (local.tee $l158
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l139)
                                              (local.get $l139)))
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l138)
                                              (local.get $l138))))
                                        (local.tee $l159
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l142)
                                              (local.get $l142)))))))
                                  (local.get $l54)))))
                          (local.set $l150
                            (i32x4.min_u
                              (local.get $l160)
                              (local.get $l161)))
                          (block $B81
                            (block $B82
                              (br_if $B82
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l153)
                                        (local.get $l158))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l139
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l153))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l158))))
                              (br $B81))
                            (local.set $l139
                              (call $fma4_tie
                                (local.get $l139)
                                (local.get $l138)
                                (local.get $l142))))
                          (local.set $l157
                            (i32x4.max_u
                              (local.get $l151)
                              (local.tee $l158
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l138
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (local.get $l139))
                                          (local.get $l145))
                                        (local.get $l157)))
                                    (local.tee $l153
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l139)
                                              (local.get $l139)))
                                          (local.get $l145))
                                        (local.get $l159))))
                                  (local.get $l54)))))
                          (local.set $l158
                            (i32x4.min_u
                              (local.get $l150)
                              (local.get $l158)))
                          (block $B83
                            (block $B84
                              (br_if $B84
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l138)
                                        (local.get $l153))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l142
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l138))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l153))))
                              (br $B83))
                            (local.set $l142
                              (call $fma4_tie
                                (v128.const i32x4 0x3eaaaaab 0x3eaaaaab 0x3eaaaaab 0x3eaaaaab)
                                (local.get $l139)
                                (local.get $l142))))
                          (local.set $l157
                            (i32x4.max_u
                              (local.get $l157)
                              (local.tee $l153
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l139
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (local.get $l143))
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l142
                                              (f32x4.mul
                                                (local.get $l142)
                                                (local.get $l142)))))
                                        (local.get $l146)))
                                    (local.tee $l138
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l143)
                                              (local.get $l143)))
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l142)
                                              (local.get $l142))))
                                        (local.get $l113))))
                                  (local.get $l54)))))
                          (local.set $l153
                            (i32x4.min_u
                              (local.get $l158)
                              (local.get $l153)))
                          (block $B85
                            (block $B86
                              (br_if $B86
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l139)
                                        (local.get $l138))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l159
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l139))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l138))))
                              (br $B85))
                            (local.set $l159
                              (call $fma4_tie
                                (local.get $l142)
                                (local.get $l143)
                                (v128.const i32x4 0xbe1fb275 0xbe1fb275 0xbe1fb275 0xbe1fb275))))
                          (local.set $l138
                            (i32x4.max_u
                              (local.get $l157)
                              (local.tee $l139
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l143
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l133)
                                          (local.tee $l142
                                            (v128.const i32x4 0x20000000 0x3fe1a86d 0x20000000 0x3fe1a86d)))
                                        (local.get $l134)))
                                    (local.tee $l142
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l136)
                                          (local.get $l142))
                                        (local.get $l114))))
                                  (local.get $l54)))))
                          (local.set $l153
                            (i32x4.min_u
                              (local.get $l153)
                              (local.get $l139)))
                          (block $B87
                            (block $B88
                              (br_if $B88
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l143)
                                        (local.get $l142))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l143
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l143))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l142))))
                              (br $B87))
                            (local.set $l143
                              (call $fma4_tie
                                (v128.const i32x4 0x3f0d4369 0x3f0d4369 0x3f0d4369 0x3f0d4369)
                                (local.get $l131)
                                (v128.const i32x4 0x3b789536 0x3b789536 0x3b789536 0x3b789536))))
                          (local.set $l138
                            (i32x4.max_u
                              (local.get $l138)
                              (local.tee $l141
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l142
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l141)
                                          (local.tee $l139
                                            (v128.const i32x4 0xe0000000 0x3fca35d1 0xe0000000 0x3fca35d1)))
                                        (f64x2.promote_low_f32x4
                                          (local.get $l143))))
                                    (local.tee $l139
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l144)
                                          (local.get $l139))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l143)
                                            (local.get $l143))))))
                                  (local.get $l54)))))
                          (local.set $l141
                            (i32x4.min_u
                              (local.get $l153)
                              (local.get $l141)))
                          (block $B89
                            (block $B90
                              (br_if $B90
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l142)
                                        (local.get $l139))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l143
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l142))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l139))))
                              (br $B89))
                            (local.set $l143
                              (call $fma4_tie
                                (v128.const i32x4 0x3e51ae8f 0x3e51ae8f 0x3e51ae8f 0x3e51ae8f)
                                (local.get $l132)
                                (local.get $l143))))
                          (local.set $l153
                            (i32x4.max_u
                              (local.get $l138)
                              (local.tee $l144
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l142
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l147)
                                          (local.tee $l139
                                            (v128.const i32x4 0x80000000 0x3fcf2879 0x80000000 0x3fcf2879)))
                                        (f64x2.promote_low_f32x4
                                          (local.get $l143))))
                                    (local.tee $l139
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l148)
                                          (local.get $l139))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l143)
                                            (local.get $l143))))))
                                  (local.get $l54)))))
                          (local.set $l158
                            (i32x4.min_u
                              (local.get $l141)
                              (local.get $l144)))
                          (block $B91
                            (block $B92
                              (br_if $B92
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l142)
                                        (local.get $l139))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l143
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l142))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l139))))
                              (br $B91))
                            (local.set $l143
                              (call $fma4_tie
                                (v128.const i32x4 0x3e7943cc 0x3e7943cc 0x3e7943cc 0x3e7943cc)
                                (local.get $l130)
                                (local.get $l143))))
                          (local.set $l152
                            (i32x4.max_u
                              (local.get $l153)
                              (local.tee $l149
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l147
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.tee $l141
                                            (f64x2.promote_low_f32x4
                                              (local.tee $l142
                                                (f32x4.mul
                                                  (local.tee $l143
                                                    (v128.andnot
                                                      (local.get $l143)
                                                      (f32x4.le
                                                        (local.get $l143)
                                                        (local.get $l149))))
                                                  (local.get $l152)))))
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l139
                                              (f32x4.mul
                                                (local.tee $l139
                                                  (f32x4.mul
                                                    (local.tee $l138
                                                      (v128.and
                                                        (i32x4.ne
                                                          (local.get $l143)
                                                          (local.get $l154))
                                                        (i32x4.add
                                                          (i32x4.mul
                                                            (i32x4.shr_u
                                                              (local.get $l143)
                                                              (i32.const 23))
                                                            (local.get $l155))
                                                          (local.get $l156))))
                                                    (local.get $l138)))
                                                (local.get $l139)))))
                                        (f64x2.promote_low_f32x4
                                          (local.tee $l138
                                            (f32x4.mul
                                              (local.get $l138)
                                              (local.get $l140))))))
                                    (local.tee $l148
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.tee $l144
                                            (f64x2.promote_low_f32x4
                                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                (local.get $l142)
                                                (local.get $l142))))
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l139)
                                              (local.get $l139))))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l138)
                                            (local.get $l138))))))
                                  (local.get $l54)))))
                          (local.set $l149
                            (i32x4.min_u
                              (local.get $l158)
                              (local.get $l149)))
                          (block $B93
                            (block $B94
                              (br_if $B94
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l147)
                                        (local.get $l148))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l139
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l147))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l148))))
                              (br $B93))
                            (local.set $l139
                              (call $fma4_tie
                                (local.get $l142)
                                (local.get $l139)
                                (local.get $l138))))
                          (local.set $l152
                            (i32x4.max_u
                              (local.get $l152)
                              (local.tee $l153
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l147
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l141)
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l138
                                              (f32x4.mul
                                                (local.tee $l138
                                                  (f32x4.mul
                                                    (local.get $l139)
                                                    (local.get $l139)))
                                                (local.get $l138)))))
                                        (f64x2.promote_low_f32x4
                                          (local.tee $l139
                                            (f32x4.mul
                                              (local.get $l139)
                                              (local.get $l140))))))
                                    (local.tee $l148
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l144)
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l138)
                                              (local.get $l138))))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l139)
                                            (local.get $l139))))))
                                  (local.get $l54)))))
                          (local.set $l149
                            (i32x4.min_u
                              (local.get $l149)
                              (local.get $l153)))
                          (block $B95
                            (block $B96
                              (br_if $B96
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l147)
                                        (local.get $l148))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l139
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l147))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l148))))
                              (br $B95))
                            (local.set $l139
                              (call $fma4_tie
                                (local.get $l142)
                                (local.get $l138)
                                (local.get $l139))))
                          (local.set $l148
                            (i32x4.max_u
                              (local.get $l152)
                              (local.tee $l144
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l139
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l141)
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l138
                                              (f32x4.mul
                                                (local.tee $l138
                                                  (f32x4.mul
                                                    (local.get $l139)
                                                    (local.get $l139)))
                                                (local.get $l138)))))
                                        (f64x2.promote_low_f32x4
                                          (local.tee $l140
                                            (f32x4.mul
                                              (local.get $l139)
                                              (local.get $l140))))))
                                    (local.tee $l141
                                      (f64x2.add
                                        (f64x2.mul
                                          (local.get $l144)
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l138)
                                              (local.get $l138))))
                                        (f64x2.promote_low_f32x4
                                          (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                            (local.get $l140)
                                            (local.get $l140))))))
                                  (local.get $l54)))))
                          (local.set $l152
                            (i32x4.min_u
                              (local.get $l149)
                              (local.get $l144)))
                          (block $B97
                            (block $B98
                              (br_if $B98
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l139)
                                        (local.get $l141))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l140
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l139))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l141))))
                              (br $B97))
                            (local.set $l140
                              (call $fma4_tie
                                (local.get $l142)
                                (local.get $l138)
                                (local.get $l140))))
                          (local.set $l149
                            (i32x4.max_u
                              (local.get $l148)
                              (local.tee $l153
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l138
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l142
                                              (f32x4.neg
                                                (local.get $l143))))
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l139
                                              (f32x4.mul
                                                (local.tee $l139
                                                  (f32x4.mul
                                                    (local.get $l140)
                                                    (local.get $l140)))
                                                (local.get $l139)))))
                                        (local.tee $l144
                                          (f64x2.promote_low_f32x4
                                            (local.get $l140)))))
                                    (local.tee $l141
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l142)
                                              (local.get $l142)))
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l139)
                                              (local.get $l139))))
                                        (local.tee $l147
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l140)
                                              (local.get $l140)))))))
                                  (local.get $l54)))))
                          (local.set $l148
                            (i32x4.min_u
                              (local.get $l152)
                              (local.get $l153)))
                          (block $B99
                            (block $B100
                              (br_if $B100
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l138)
                                        (local.get $l141))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l142
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l138))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l141))))
                              (br $B99))
                            (local.set $l142
                              (call $fma4_tie
                                (local.get $l142)
                                (local.get $l139)
                                (local.get $l140))))
                          (local.set $l141
                            (i32x4.max_u
                              (local.get $l149)
                              (local.tee $l138
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l139
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (local.get $l142))
                                          (local.get $l145))
                                        (local.get $l144)))
                                    (local.tee $l145
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l142)
                                              (local.get $l142)))
                                          (local.get $l145))
                                        (local.get $l147))))
                                  (local.get $l54)))))
                          (local.set $l138
                            (i32x4.min_u
                              (local.get $l148)
                              (local.get $l138)))
                          (block $B101
                            (block $B102
                              (br_if $B102
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l139)
                                        (local.get $l145))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l140
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l139))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l145))))
                              (br $B101))
                            (local.set $l140
                              (call $fma4_tie
                                (v128.const i32x4 0x3eaaaaab 0x3eaaaaab 0x3eaaaaab 0x3eaaaaab)
                                (local.get $l142)
                                (local.get $l140))))
                          (local.set $l139
                            (i32x4.max_u
                              (local.get $l141)
                              (local.tee $l54
                                (v128.and
                                  (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                    (local.tee $l142
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (local.get $l143))
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l140
                                              (f32x4.mul
                                                (local.get $l140)
                                                (local.get $l140)))))
                                        (local.get $l146)))
                                    (local.tee $l145
                                      (f64x2.add
                                        (f64x2.mul
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l143)
                                              (local.get $l143)))
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l140)
                                              (local.get $l140))))
                                        (local.get $l113))))
                                  (local.get $l54)))))
                          (local.set $l54
                            (i32x4.min_u
                              (local.get $l138)
                              (local.get $l54)))
                          (block $B103
                            (block $B104
                              (br_if $B104
                                (v128.any_true
                                  (i32x4.eq
                                    (v128.and
                                      (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                        (local.get $l142)
                                        (local.get $l145))
                                      (local.get $l135))
                                    (local.get $l137))))
                              (local.set $l140
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l142))
                                  (f32x4.demote_f64x2_zero
                                    (local.get $l145))))
                              (br $B103))
                            (local.set $l140
                              (call $fma4_tie
                                (local.get $l140)
                                (local.get $l143)
                                (v128.const i32x4 0xbe1fb275 0xbe1fb275 0xbe1fb275 0xbe1fb275))))
                          (block $B105
                            (block $B106
                              (br_if $B106
                                (i32.eqz
                                  (v128.any_true
                                    (v128.or
                                      (i32x4.lt_u
                                        (local.get $l54)
                                        (v128.const i32x4 0x38100000 0x38100000 0x38100000 0x38100000))
                                      (i32x4.gt_u
                                        (local.get $l139)
                                        (v128.const i32x4 0x47e00000 0x47e00000 0x47e00000 0x47e00000))))))
                              (call $positive
                                (f32x4.extract_lane 0
                                  (local.get $l130))
                                (f32x4.extract_lane 0
                                  (local.get $l132))
                                (f32x4.extract_lane 0
                                  (local.get $l131))
                                (i32.add
                                  (local.get $l24)
                                  (i32.const 288)))
                              (local.set $l54
                                (v128.load32_zero offset=288
                                  (local.get $l24)))
                              (local.set $l135
                                (v128.load32_zero offset=292
                                  (local.get $l24)))
                              (local.set $l137
                                (v128.load32_zero offset=296
                                  (local.get $l24)))
                              (call $positive
                                (f32x4.extract_lane 1
                                  (local.get $l130))
                                (f32x4.extract_lane 1
                                  (local.get $l132))
                                (f32x4.extract_lane 1
                                  (local.get $l131))
                                (i32.add
                                  (local.get $l24)
                                  (i32.const 288)))
                              (local.set $l137
                                (v128.load32_lane offset=296 1
                                  (local.get $l24)
                                  (local.get $l137)))
                              (local.set $l135
                                (v128.load32_lane offset=292 1
                                  (local.get $l24)
                                  (local.get $l135)))
                              (local.set $l54
                                (v128.load32_lane offset=288 1
                                  (local.get $l24)
                                  (local.get $l54)))
                              (call $positive
                                (f32x4.extract_lane 2
                                  (local.get $l130))
                                (f32x4.extract_lane 2
                                  (local.get $l132))
                                (f32x4.extract_lane 2
                                  (local.get $l131))
                                (i32.add
                                  (local.get $l24)
                                  (i32.const 288)))
                              (local.set $l140
                                (v128.load32_lane offset=288 2
                                  (local.get $l24)
                                  (local.get $l54)))
                              (local.set $l135
                                (v128.load32_lane offset=292 2
                                  (local.get $l24)
                                  (local.get $l135)))
                              (local.set $l54
                                (v128.load32_lane offset=296 2
                                  (local.get $l24)
                                  (local.get $l137)))
                              (call $positive
                                (f32x4.extract_lane 3
                                  (local.get $l130))
                                (f32x4.extract_lane 3
                                  (local.get $l132))
                                (f32x4.extract_lane 3
                                  (local.get $l131))
                                (i32.add
                                  (local.get $l24)
                                  (i32.const 288)))
                              (local.set $l54
                                (v128.load32_lane offset=296 3
                                  (local.get $l24)
                                  (local.get $l54)))
                              (local.set $l135
                                (v128.load32_lane offset=292 3
                                  (local.get $l24)
                                  (local.get $l135)))
                              (local.set $l137
                                (v128.load32_lane offset=288 3
                                  (local.get $l24)
                                  (local.get $l140)))
                              (br $B105))
                            (local.set $l135
                              (f32x4.add
                                (local.tee $l130
                                  (f32x4.mul
                                    (f32x4.add
                                      (local.get $l162)
                                      (local.get $l159))
                                    (local.tee $l54
                                      (v128.const i32x4 0x3f000000 0x3f000000 0x3f000000 0x3f000000))))
                                (v128.const i32x4 0x3c23d70a 0x3c23d70a 0x3c23d70a 0x3c23d70a)))
                            (local.set $l137
                              (f32x4.add
                                (f32x4.mul
                                  (f32x4.mul
                                    (f32x4.sub
                                      (local.get $l162)
                                      (local.get $l159))
                                    (local.get $l54))
                                  (v128.const i32x4 0x41600000 0x41600000 0x41600000 0x41600000))
                                (v128.const i32x4 0x3ed70a3d 0x3ed70a3d 0x3ed70a3d 0x3ed70a3d)))
                            (local.set $l54
                              (f32x4.add
                                (f32x4.sub
                                  (local.get $l140)
                                  (local.get $l130))
                                (v128.const i32x4 0x3f0ccccd 0x3f0ccccd 0x3f0ccccd 0x3f0ccccd))))
                          (f32.store
                            (local.tee $p10
                              (i32.add
                                (local.get $l44)
                                (local.get $p11)))
                            (local.tee $l163
                              (f32x4.extract_lane 0
                                (local.get $l137))))
                          (f32.store
                            (local.tee $p9
                              (i32.add
                                (local.get $l53)
                                (local.get $p11)))
                            (local.tee $l164
                              (f32x4.extract_lane 0
                                (local.get $l135))))
                          (f32.store
                            (local.tee $l48
                              (i32.add
                                (local.get $l52)
                                (local.get $p11)))
                            (local.tee $l165
                              (f32x4.extract_lane 0
                                (local.get $l54))))
                          (block $B107
                            (br_if $B107
                              (i32.eqz
                                (local.get $l50)))
                            (f32.store
                              (i32.add
                                (local.get $p10)
                                (i32.const 4))
                              (f32x4.extract_lane 1
                                (local.get $l137)))
                            (f32.store
                              (i32.add
                                (local.get $p9)
                                (i32.const 4))
                              (f32x4.extract_lane 1
                                (local.get $l135)))
                            (f32.store
                              (i32.add
                                (local.get $l48)
                                (i32.const 4))
                              (f32x4.extract_lane 1
                                (local.get $l54)))
                            (f32.store
                              (i32.add
                                (local.get $p10)
                                (i32.const 8))
                              (f32x4.extract_lane 2
                                (local.get $l137)))
                            (f32.store
                              (i32.add
                                (local.get $p9)
                                (i32.const 8))
                              (f32x4.extract_lane 2
                                (local.get $l135)))
                            (f32.store
                              (i32.add
                                (local.get $l48)
                                (i32.const 8))
                              (f32x4.extract_lane 2
                                (local.get $l54)))
                            (f32.store
                              (i32.add
                                (local.get $p10)
                                (i32.const 12))
                              (f32x4.extract_lane 3
                                (local.get $l137)))
                            (f32.store
                              (i32.add
                                (local.get $p9)
                                (i32.const 12))
                              (f32x4.extract_lane 3
                                (local.get $l135)))
                            (f32.store
                              (i32.add
                                (local.get $l48)
                                (i32.const 12))
                              (f32x4.extract_lane 3
                                (local.get $l54)))
                            (br $B50))
                          (f32.store
                            (local.tee $l46
                              (i32.add
                                (local.get $p18)
                                (i32.mul
                                  (local.get $l38)
                                  (i32.const 12))))
                            (local.get $l163))
                          (f32.store
                            (i32.add
                              (local.get $l46)
                              (i32.const 8))
                            (local.get $l165))
                          (f32.store
                            (i32.add
                              (local.get $l46)
                              (i32.const 4))
                            (local.get $l164))
                          (f32.store
                            (i32.add
                              (local.get $p10)
                              (i32.const 4))
                            (local.tee $l163
                              (f32x4.extract_lane 1
                                (local.get $l137))))
                          (f32.store
                            (i32.add
                              (local.get $p9)
                              (i32.const 4))
                            (local.tee $l164
                              (f32x4.extract_lane 1
                                (local.get $l135))))
                          (f32.store
                            (i32.add
                              (local.get $l48)
                              (i32.const 4))
                            (local.tee $l165
                              (f32x4.extract_lane 1
                                (local.get $l54))))
                          (f32.store
                            (i32.add
                              (local.tee $l46
                                (i32.add
                                  (local.get $p18)
                                  (i32.mul
                                    (local.get $l30)
                                    (i32.const 12))))
                              (i32.const 8))
                            (local.get $l165))
                          (f32.store
                            (i32.add
                              (local.get $l46)
                              (i32.const 4))
                            (local.get $l164))
                          (f32.store
                            (local.get $l46)
                            (local.get $l163))
                          (f32.store
                            (i32.add
                              (local.get $p10)
                              (i32.const 8))
                            (local.tee $l163
                              (f32x4.extract_lane 2
                                (local.get $l137))))
                          (f32.store
                            (i32.add
                              (local.get $p9)
                              (i32.const 8))
                            (local.tee $l164
                              (f32x4.extract_lane 2
                                (local.get $l135))))
                          (f32.store
                            (i32.add
                              (local.get $l48)
                              (i32.const 8))
                            (local.tee $l165
                              (f32x4.extract_lane 2
                                (local.get $l54))))
                          (i32.store
                            (i32.add
                              (local.get $p17)
                              (i32.shl
                                (local.get $l38)
                                (i32.const 2)))
                            (local.get $l45))
                          (f32.store
                            (i32.add
                              (local.tee $l46
                                (i32.add
                                  (local.get $p18)
                                  (i32.mul
                                    (local.get $l41)
                                    (i32.const 12))))
                              (i32.const 8))
                            (local.get $l165))
                          (f32.store
                            (i32.add
                              (local.get $l46)
                              (i32.const 4))
                            (local.get $l164))
                          (f32.store
                            (local.get $l46)
                            (local.get $l163))
                          (i32.store
                            (i32.add
                              (local.get $p17)
                              (i32.shl
                                (local.get $l30)
                                (i32.const 2)))
                            (local.get $l51))
                          (f32.store
                            (i32.add
                              (local.get $p10)
                              (i32.const 12))
                            (local.tee $l163
                              (f32x4.extract_lane 3
                                (local.get $l137))))
                          (f32.store
                            (i32.add
                              (local.get $p9)
                              (i32.const 12))
                            (local.tee $l164
                              (f32x4.extract_lane 3
                                (local.get $l135))))
                          (i32.store
                            (i32.add
                              (local.get $p17)
                              (i32.shl
                                (local.get $l41)
                                (i32.const 2)))
                            (local.get $l35))
                          (f32.store
                            (i32.add
                              (local.get $l48)
                              (i32.const 12))
                            (local.tee $l165
                              (f32x4.extract_lane 3
                                (local.get $l54))))
                          (i32.store
                            (i32.add
                              (local.get $p17)
                              (i32.shl
                                (local.get $l36)
                                (i32.const 2)))
                            (local.get $l37))
                          (f32.store
                            (i32.add
                              (local.tee $p10
                                (i32.add
                                  (local.get $p18)
                                  (i32.mul
                                    (local.get $l36)
                                    (i32.const 12))))
                              (i32.const 8))
                            (local.get $l165))
                          (f32.store
                            (i32.add
                              (local.get $p10)
                              (i32.const 4))
                            (local.get $l164))
                          (f32.store
                            (local.get $p10)
                            (local.get $l163)))
                        (local.set $p11
                          (i32.add
                            (local.get $p11)
                            (i32.const 16)))
                        (local.set $p10
                          (i32.add
                            (local.get $l49)
                            (i32.const 4)))
                        (br_if $L49
                          (i32.le_s
                            (i32.add
                              (local.get $l49)
                              (i32.const 8))
                            (local.get $p0)))))
                    (block $B108
                      (br_if $B108
                        (i32.le_s
                          (local.get $p0)
                          (local.get $p10)))
                      (local.set $l30
                        (select
                          (local.get $l27)
                          (local.get $l32)
                          (local.get $p22)))
                      (local.set $l49
                        (select
                          (local.get $l26)
                          (local.get $l31)
                          (local.get $p22)))
                      (local.set $l48
                        (i32.load
                          (local.get $l28)))
                      (block $B109
                        (br_if $B109
                          (i32.eqz
                            (local.get $l50)))
                        (local.set $p9
                          (i32.sub
                            (local.get $p0)
                            (local.get $p10)))
                        (local.set $l48
                          (i32.add
                            (local.get $l48)
                            (local.tee $p11
                              (i32.shl
                                (i32.add
                                  (local.get $p15)
                                  (local.get $p10))
                                (i32.const 2)))))
                        (local.set $l49
                          (i32.add
                            (local.get $l49)
                            (local.get $p11)))
                        (local.set $l50
                          (i32.add
                            (local.get $l30)
                            (local.get $p11)))
                        (local.set $l41
                          (i32.add
                            (local.tee $p10
                              (i32.add
                                (local.get $p21)
                                (i32.shl
                                  (i32.add
                                    (local.get $l125)
                                    (local.get $p10))
                                  (i32.const 2))))
                            (local.get $l69)))
                        (local.set $l30
                          (i32.add
                            (local.get $p10)
                            (local.get $l72)))
                        (local.set $p11
                          (i32.const 0))
                        (loop $L110
                          (call $positive
                            (f32.load
                              (i32.add
                                (local.get $p10)
                                (local.get $p11)))
                            (f32.load
                              (i32.add
                                (local.get $l41)
                                (local.get $p11)))
                            (f32.load
                              (i32.add
                                (local.get $l30)
                                (local.get $p11)))
                            (i32.add
                              (local.get $l24)
                              (i32.const 288)))
                          (f32.store
                            (i32.add
                              (local.get $l48)
                              (local.get $p11))
                            (f32.load offset=288
                              (local.get $l24)))
                          (f32.store
                            (i32.add
                              (local.get $l49)
                              (local.get $p11))
                            (f32.load offset=292
                              (local.get $l24)))
                          (f32.store
                            (i32.add
                              (local.get $l50)
                              (local.get $p11))
                            (f32.load offset=296
                              (local.get $l24)))
                          (local.set $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const 4)))
                          (br_if $L110
                            (local.tee $p9
                              (i32.add
                                (local.get $p9)
                                (i32.const -1))))
                          (br $B108)))
                      (local.set $l41
                        (i32.sub
                          (local.get $p0)
                          (local.get $p10)))
                      (local.set $p11
                        (i32.add
                          (local.get $p21)
                          (i32.shl
                            (i32.add
                              (local.get $l125)
                              (local.get $p10))
                            (i32.const 2))))
                      (local.set $p9
                        (i32.add
                          (local.get $l48)
                          (local.tee $p10
                            (i32.shl
                              (i32.add
                                (local.get $p15)
                                (local.get $p10))
                              (i32.const 2)))))
                      (local.set $l48
                        (i32.add
                          (local.get $l49)
                          (local.get $p10)))
                      (local.set $l49
                        (i32.add
                          (local.get $l30)
                          (local.get $p10)))
                      (loop $L111
                        (local.set $p10
                          (i32.add
                            (local.get $p18)
                            (i32.mul
                              (local.tee $l30
                                (i32.shr_u
                                  (i32.mul
                                    (local.tee $l50
                                      (i32.or
                                        (i32.or
                                          (i32.shl
                                            (local.tee $l38
                                              (i32.load8_u
                                                (i32.add
                                                  (local.get $p11)
                                                  (i32.const 1))))
                                            (i32.const 8))
                                          (i32.shl
                                            (local.tee $l36
                                              (i32.load8_u
                                                (local.get $p11)))
                                            (i32.const 16)))
                                        (local.tee $l37
                                          (i32.load8_u
                                            (i32.add
                                              (local.get $p11)
                                              (i32.const 2))))))
                                    (i32.const -1640531535))
                                  (i32.const 15)))
                              (i32.const 12))))
                        (block $B112
                          (br_if $B112
                            (i32.eq
                              (i32.load
                                (local.tee $l30
                                  (i32.add
                                    (local.get $p17)
                                    (i32.shl
                                      (local.get $l30)
                                      (i32.const 2)))))
                              (local.get $l50)))
                          (call $positive
                            (f32.load
                              (i32.add
                                (local.get $p7)
                                (i32.shl
                                  (local.get $l36)
                                  (i32.const 2))))
                            (f32.load
                              (i32.add
                                (local.get $p7)
                                (i32.shl
                                  (local.get $l38)
                                  (i32.const 2))))
                            (f32.load
                              (i32.add
                                (local.get $p7)
                                (i32.shl
                                  (local.get $l37)
                                  (i32.const 2))))
                            (local.get $p10))
                          (i32.store
                            (local.get $l30)
                            (local.get $l50)))
                        (f32.store
                          (local.get $p9)
                          (f32.load
                            (local.get $p10)))
                        (f32.store
                          (local.get $l48)
                          (f32.load offset=4
                            (local.get $p10)))
                        (f32.store
                          (local.get $l49)
                          (f32.load offset=8
                            (local.get $p10)))
                        (local.set $p11
                          (i32.add
                            (local.get $p11)
                            (i32.const 4)))
                        (local.set $p9
                          (i32.add
                            (local.get $p9)
                            (i32.const 4)))
                        (local.set $l48
                          (i32.add
                            (local.get $l48)
                            (i32.const 4)))
                        (local.set $l49
                          (i32.add
                            (local.get $l49)
                            (i32.const 4)))
                        (br_if $L111
                          (local.tee $l41
                            (i32.add
                              (local.get $l41)
                              (i32.const -1))))))
                    (local.set $p11
                      (i32.const 0))
                    (br_if $L47
                      (local.get $p22)))
                  (local.set $l125
                    (i32.add
                      (local.get $l125)
                      (local.get $p0)))
                  (local.set $l126
                    (i32.add
                      (local.get $l126)
                      (local.get $l70)))
                  (local.set $l127
                    (i32.add
                      (local.get $l127)
                      (local.get $l70)))
                  (local.set $l128
                    (i32.add
                      (local.get $l128)
                      (local.get $l70)))
                  (br_if $L46
                    (i32.ne
                      (local.tee $l129
                        (i32.add
                          (local.get $l129)
                          (i32.const 1)))
                      (local.get $l123))))
                (local.set $l166
                  (local.get $l123))
                (br $B44))
              (local.set $l166
                (select
                  (local.get $l123)
                  (i32.const 1)
                  (i32.gt_s
                    (local.get $l123)
                    (i32.const 1)))))
            (local.set $l167
              (i32.or
                (local.get $l124)
                (i32.lt_s
                  (local.get $p0)
                  (i32.const 1))))
            (local.set $l169
              (i32.add
                (i32.add
                  (local.get $l24)
                  (i32.const 32))
                (local.tee $l168
                  (i32.shl
                    (select
                      (local.tee $l33
                        (i32.add
                          (local.get $l123)
                          (i32.const -1)))
                      (i32.const 2)
                      (i32.lt_s
                        (local.get $l33)
                        (i32.const 2)))
                    (i32.const 2)))))
            (local.set $l171
              (i32.add
                (i32.add
                  (local.get $l24)
                  (i32.const 32))
                (local.tee $l170
                  (i32.shl
                    (select
                      (local.get $l33)
                      (i32.const 1)
                      (i32.lt_s
                        (local.get $l33)
                        (i32.const 1)))
                    (i32.const 2)))))
            (local.set $l173
              (i32.add
                (i32.add
                  (local.get $l24)
                  (i32.const 32))
                (local.tee $l172
                  (i32.shl
                    (i32.and
                      (local.get $l33)
                      (i32.shr_s
                        (local.get $l33)
                        (i32.const 31)))
                    (i32.const 2)))))
            (local.set $p22
              (i32.add
                (i32.add
                  (local.get $l24)
                  (i32.const 16))
                (local.get $l168)))
            (local.set $p21
              (i32.add
                (i32.add
                  (local.get $l24)
                  (i32.const 16))
                (local.get $l170)))
            (local.set $l28
              (i32.add
                (i32.add
                  (local.get $l24)
                  (i32.const 16))
                (local.get $l172)))
            (local.set $l34
              (i32.and
                (local.get $l123)
                (i32.const 3)))
            (local.set $l35
              (i32.and
                (local.get $l123)
                (i32.const -2)))
            (local.set $l43
              (i32.and
                (local.get $l123)
                (i32.const 1)))
            (local.set $l174
              (i32.and
                (local.get $l166)
                (i32.const -4)))
            (local.set $l175
              (i32.mul
                (local.get $l70)
                (local.get $p23)))
            (local.set $l176
              (i32.const 0))
            (local.set $l51
              (i32.sub
                (i32.const 0)
                (i32.and
                  (local.get $l123)
                  (i32.const -4))))
            (local.set $l178
              (i32.add
                (i32.add
                  (local.get $l24)
                  (i32.const 32))
                (local.tee $l177
                  (i32.shl
                    (local.get $l33)
                    (i32.const 2)))))
            (local.set $p15
              (i32.add
                (i32.add
                  (local.get $l24)
                  (i32.const 16))
                (local.get $l177)))
            (local.set $l136
              (i32x4.splat
                (local.get $p23)))
            (loop $L113
              (block $B114
                (br_if $B114
                  (i32.eqz
                    (i32.and
                      (local.tee $p11
                        (i32.shl
                          (i32.const 1)
                          (local.get $l176)))
                      (local.get $p2))))
                (block $B115
                  (br_if $B115
                    (local.get $l124))
                  (local.set $l49
                    (i32.load
                      (i32.add
                        (i32.add
                          (local.get $l24)
                          (i32.const 236))
                        (local.tee $l30
                          (i32.shl
                            (local.get $l176)
                            (i32.const 2))))))
                  (block $B116
                    (br_if $B116
                      (i32.and
                        (local.get $p11)
                        (local.get $p12)))
                    (local.set $l41
                      (i32.load
                        (i32.add
                          (i32.add
                            (local.get $l24)
                            (i32.const 248))
                          (local.get $l30))))
                    (local.set $p10
                      (i32.const 0))
                    (block $B117
                      (block $B118
                        (br_if $B118
                          (i32.lt_u
                            (local.get $l166)
                            (i32.const 4)))
                        (local.set $l135
                          (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                        (local.set $p11
                          (i32.add
                            (local.get $l24)
                            (i32.const 16)))
                        (local.set $p10
                          (i32.add
                            (local.get $l24)
                            (i32.const 32)))
                        (local.set $p9
                          (local.get $l174))
                        (loop $L119
                          (v128.store
                            (local.get $p11)
                            (i32x4.add
                              (i32x4.splat
                                (local.get $l49))
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
                                                    (local.get $l135)
                                                    (local.get $l136))))
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
                                    (local.get $l82))
                                  (i32.const 2)))))
                          (v128.store
                            (local.get $p10)
                            (i32x4.add
                              (i32x4.splat
                                (local.get $l41))
                              (local.get $l54)))
                          (local.set $p10
                            (i32.add
                              (local.get $p10)
                              (i32.const 16)))
                          (local.set $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const 16)))
                          (local.set $l135
                            (i32x4.add
                              (local.get $l135)
                              (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                          (br_if $L119
                            (local.tee $p9
                              (i32.add
                                (local.get $p9)
                                (i32.const -4)))))
                        (local.set $p10
                          (local.get $l174))
                        (br_if $B117
                          (i32.eq
                            (local.get $l166)
                            (local.get $l174))))
                      (local.set $p11
                        (i32.add
                          (local.get $p23)
                          (local.get $p10)))
                      (local.set $l48
                        (i32.sub
                          (local.get $l166)
                          (local.get $p10)))
                      (local.set $p10
                        (i32.add
                          (i32.add
                            (local.get $l24)
                            (i32.const 32))
                          (local.tee $p9
                            (i32.shl
                              (local.get $p10)
                              (i32.const 2)))))
                      (local.set $p9
                        (i32.add
                          (i32.add
                            (local.get $l24)
                            (i32.const 16))
                          (local.get $p9)))
                      (loop $L120
                        (i32.store
                          (local.get $p9)
                          (i32.add
                            (local.get $l49)
                            (local.tee $l50
                              (i32.shl
                                (i32.mul
                                  (i32.rem_s
                                    (local.get $p11)
                                    (i32.const 16))
                                  (local.get $p0))
                                (i32.const 2)))))
                        (i32.store
                          (local.get $p10)
                          (i32.add
                            (local.get $l41)
                            (local.get $l50)))
                        (local.set $p11
                          (i32.add
                            (local.get $p11)
                            (i32.const 1)))
                        (local.set $p10
                          (i32.add
                            (local.get $p10)
                            (i32.const 4)))
                        (local.set $p9
                          (i32.add
                            (local.get $p9)
                            (i32.const 4)))
                        (br_if $L120
                          (local.tee $l48
                            (i32.add
                              (local.get $l48)
                              (i32.const -1))))))
                    (br_if $B115
                      (i32.or
                        (i32.eqz
                          (local.tee $p11
                            (i32.load
                              (i32.add
                                (i32.add
                                  (local.get $l24)
                                  (i32.const 260))
                                (local.get $l30)))))
                        (local.get $l167)))
                    (local.set $l41
                      (i32.const 0))
                    (local.set $l48
                      (local.tee $l30
                        (i32.add
                          (local.get $l175)
                          (local.get $p11))))
                    (loop $L121
                      (local.set $l49
                        (i32.load
                          (i32.add
                            (i32.add
                              (local.get $l24)
                              (i32.const 32))
                            (i32.shl
                              (local.get $l41)
                              (i32.const 2)))))
                      (local.set $p9
                        (i32.const 0))
                      (block $B122
                        (block $B123
                          (br_if $B123
                            (i32.lt_u
                              (local.get $p0)
                              (i32.const 4)))
                          (local.set $p9
                            (i32.const 0))
                          (br_if $B123
                            (i32.gt_u
                              (i32.sub
                                (local.get $l49)
                                (i32.add
                                  (local.get $l30)
                                  (i32.mul
                                    (local.get $l70)
                                    (local.get $l41))))
                              (i32.const -16)))
                          (local.set $p11
                            (local.get $l49))
                          (local.set $p10
                            (local.get $l48))
                          (local.set $p9
                            (local.get $l62))
                          (loop $L124
                            (v128.store align=4
                              (local.get $p10)
                              (v128.load align=4
                                (local.get $p11)))
                            (local.set $p11
                              (i32.add
                                (local.get $p11)
                                (i32.const 16)))
                            (local.set $p10
                              (i32.add
                                (local.get $p10)
                                (i32.const 16)))
                            (br_if $L124
                              (local.tee $p9
                                (i32.add
                                  (local.get $p9)
                                  (i32.const -4)))))
                          (local.set $p9
                            (local.get $l62))
                          (br_if $B122
                            (i32.eq
                              (local.get $p0)
                              (local.get $l62))))
                        (local.set $l50
                          (local.get $p9))
                        (block $B125
                          (br_if $B125
                            (i32.eqz
                              (local.get $l67)))
                          (local.set $l50
                            (i32.add
                              (local.get $l67)
                              (local.get $p9)))
                          (local.set $p11
                            (i32.shl
                              (local.get $p9)
                              (i32.const 2)))
                          (local.set $p10
                            (local.get $l67))
                          (loop $L126
                            (f32.store
                              (i32.add
                                (local.get $l48)
                                (local.get $p11))
                              (f32.load
                                (i32.add
                                  (local.get $l49)
                                  (local.get $p11))))
                            (local.set $p11
                              (i32.add
                                (local.get $p11)
                                (i32.const 4)))
                            (br_if $L126
                              (local.tee $p10
                                (i32.add
                                  (local.get $p10)
                                  (i32.const -1))))))
                        (br_if $B122
                          (i32.gt_u
                            (i32.sub
                              (local.get $p9)
                              (local.get $p0))
                            (i32.const -4)))
                        (local.set $p11
                          (i32.shl
                            (local.get $l50)
                            (i32.const 2)))
                        (local.set $l50
                          (i32.sub
                            (local.get $p0)
                            (local.get $l50)))
                        (loop $L127
                          (f32.store
                            (local.tee $p10
                              (i32.add
                                (local.get $l48)
                                (local.get $p11)))
                            (f32.load
                              (local.tee $p9
                                (i32.add
                                  (local.get $l49)
                                  (local.get $p11)))))
                          (f32.store
                            (i32.add
                              (local.get $p10)
                              (i32.const 4))
                            (f32.load
                              (i32.add
                                (local.get $p9)
                                (i32.const 4))))
                          (f32.store
                            (i32.add
                              (local.get $p10)
                              (i32.const 8))
                            (f32.load
                              (i32.add
                                (local.get $p9)
                                (i32.const 8))))
                          (f32.store
                            (i32.add
                              (local.get $p10)
                              (i32.const 12))
                            (f32.load
                              (i32.add
                                (local.get $p9)
                                (i32.const 12))))
                          (local.set $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const 16)))
                          (br_if $L127
                            (local.tee $l50
                              (i32.add
                                (local.get $l50)
                                (i32.const -4))))))
                      (local.set $l48
                        (i32.add
                          (local.get $l48)
                          (local.get $l70)))
                      (br_if $L121
                        (i32.ne
                          (local.tee $l41
                            (i32.add
                              (local.get $l41)
                              (i32.const 1)))
                          (local.get $l166)))
                      (br $B115)))
                  (local.set $l48
                    (i32.load
                      (i32.add
                        (i32.add
                          (local.get $l24)
                          (i32.const 260))
                        (local.get $l30))))
                  (local.set $p9
                    (i32.const 0))
                  (block $B128
                    (br_if $B128
                      (i32.lt_u
                        (local.get $l166)
                        (i32.const 4)))
                    (local.set $l135
                      (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                    (local.set $p11
                      (i32.add
                        (local.get $l24)
                        (i32.const 16)))
                    (local.set $p10
                      (i32.add
                        (local.get $l24)
                        (i32.const 32)))
                    (local.set $p9
                      (local.get $l174))
                    (loop $L129
                      (v128.store
                        (local.get $p10)
                        (i32x4.add
                          (i32x4.splat
                            (local.get $l48))
                          (i32x4.shl
                            (i32x4.mul
                              (local.tee $l54
                                (i32x4.add
                                  (local.get $l135)
                                  (local.get $l136)))
                              (local.get $l82))
                            (i32.const 2))))
                      (v128.store
                        (local.get $p11)
                        (i32x4.add
                          (i32x4.splat
                            (local.get $l49))
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
                              (local.get $l82))
                            (i32.const 2))))
                      (local.set $p10
                        (i32.add
                          (local.get $p10)
                          (i32.const 16)))
                      (local.set $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const 16)))
                      (local.set $l135
                        (i32x4.add
                          (local.get $l135)
                          (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                      (br_if $L129
                        (local.tee $p9
                          (i32.add
                            (local.get $p9)
                            (i32.const -4)))))
                    (local.set $p9
                      (local.get $l174))
                    (br_if $B115
                      (i32.eq
                        (local.get $l166)
                        (local.get $l174))))
                  (local.set $l50
                    (i32.sub
                      (local.get $l166)
                      (local.get $p9)))
                  (local.set $p10
                    (i32.add
                      (local.get $l48)
                      (i32.mul
                        (local.get $l70)
                        (local.tee $p11
                          (i32.add
                            (local.get $p23)
                            (local.get $p9))))))
                  (local.set $p9
                    (i32.add
                      (i32.add
                        (local.get $l24)
                        (i32.const 16))
                      (local.tee $l48
                        (i32.shl
                          (local.get $p9)
                          (i32.const 2)))))
                  (local.set $l48
                    (i32.add
                      (i32.add
                        (local.get $l24)
                        (i32.const 32))
                      (local.get $l48)))
                  (loop $L130
                    (i32.store
                      (local.get $l48)
                      (local.get $p10))
                    (i32.store
                      (local.get $p9)
                      (i32.add
                        (local.get $l49)
                        (i32.shl
                          (i32.mul
                            (i32.rem_s
                              (local.get $p11)
                              (i32.const 16))
                            (local.get $p0))
                          (i32.const 2))))
                    (local.set $p9
                      (i32.add
                        (local.get $p9)
                        (i32.const 4)))
                    (local.set $l48
                      (i32.add
                        (local.get $l48)
                        (i32.const 4)))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const 1)))
                    (local.set $p10
                      (i32.add
                        (local.get $p10)
                        (local.get $l70)))
                    (br_if $L130
                      (local.tee $l50
                        (i32.add
                          (local.get $l50)
                          (i32.const -1))))))
                (local.set $l179
                  (i32.add
                    (i32.add
                      (local.get $l24)
                      (i32.const 176))
                    (i32.mul
                      (local.get $l176)
                      (i32.const 20))))
                (local.set $p13
                  (i32.const 0))
                (loop $L131
                  (block $B132
                    (br_if $B132
                      (i32.eqz
                        (local.tee $l48
                          (i32.load
                            (i32.add
                              (local.get $l179)
                              (i32.shl
                                (local.get $p13)
                                (i32.const 2)))))))
                    (block $B133
                      (br_if $B133
                        (local.get $l124))
                      (local.set $p10
                        (i32.const 0))
                      (block $B134
                        (br_if $B134
                          (i32.lt_u
                            (local.get $l166)
                            (i32.const 4)))
                        (local.set $l135
                          (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                        (local.set $p11
                          (local.get $l24))
                        (local.set $p10
                          (local.get $l174))
                        (loop $L135
                          (v128.store
                            (local.get $p11)
                            (i32x4.add
                              (i32x4.splat
                                (local.get $l48))
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
                                                  (local.get $l135)
                                                  (local.get $l136))))
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
                                  (local.get $l82))
                                (i32.const 2))))
                          (local.set $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const 16)))
                          (local.set $l135
                            (i32x4.add
                              (local.get $l135)
                              (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                          (br_if $L135
                            (local.tee $p10
                              (i32.add
                                (local.get $p10)
                                (i32.const -4)))))
                        (local.set $p10
                          (local.get $l174))
                        (br_if $B133
                          (i32.eq
                            (local.get $l166)
                            (local.get $l174))))
                      (local.set $p11
                        (i32.add
                          (local.get $p23)
                          (local.get $p10)))
                      (local.set $p9
                        (i32.sub
                          (local.get $l166)
                          (local.get $p10)))
                      (local.set $p10
                        (i32.add
                          (local.get $l24)
                          (i32.shl
                            (local.get $p10)
                            (i32.const 2))))
                      (loop $L136
                        (i32.store
                          (local.get $p10)
                          (i32.add
                            (local.get $l48)
                            (i32.shl
                              (i32.mul
                                (i32.rem_s
                                  (local.get $p11)
                                  (i32.const 16))
                                (local.get $p0))
                              (i32.const 2))))
                        (local.set $p10
                          (i32.add
                            (local.get $p10)
                            (i32.const 4)))
                        (local.set $p11
                          (i32.add
                            (local.get $p11)
                            (i32.const 1)))
                        (br_if $L136
                          (local.tee $p9
                            (i32.add
                              (local.get $p9)
                              (i32.const -1))))))
                    (local.set $l38
                      (i32.and
                        (local.get $p13)
                        (i32.const 6)))
                    (local.set $l36
                      (select
                        (i32.add
                          (local.get $l24)
                          (i32.const 16))
                        (i32.add
                          (local.get $l24)
                          (i32.const 32))
                        (i32.eq
                          (i32.and
                            (local.get $p13)
                            (i32.const 5))
                          (i32.const 1))))
                    (local.set $l48
                      (i32.const 0))
                    (block $B137
                      (br_if $B137
                        (local.tee $l129
                          (i32.lt_s
                            (local.get $p0)
                            (i32.const 4))))
                      (local.set $l49
                        (i32.add
                          (local.get $l36)
                          (local.get $l177)))
                      (local.set $l50
                        (i32.add
                          (local.get $l36)
                          (local.get $l168)))
                      (local.set $l41
                        (i32.add
                          (local.get $l36)
                          (local.get $l170)))
                      (local.set $l30
                        (i32.load
                          (i32.add
                            (local.get $l36)
                            (local.get $l172))))
                      (local.set $l48
                        (i32.const 0))
                      (local.set $p10
                        (local.get $l39))
                      (local.set $p11
                        (i32.const 0))
                      (loop $L138
                        (local.set $p9
                          (local.get $l48))
                        (local.set $l48
                          (i32.add
                            (local.get $l30)
                            (local.get $p11)))
                        (block $B139
                          (block $B140
                            (br_if $B140
                              (i32.ne
                                (local.get $p13)
                                (i32.const 4)))
                            (local.set $l54
                              (f32x4.mul
                                (v128.load align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $l49))
                                    (local.get $p11)))
                                (v128.load align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $p15))
                                    (local.get $p11)))))
                            (local.set $l135
                              (f32x4.mul
                                (v128.load align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $l50))
                                    (local.get $p11)))
                                (v128.load align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $p22))
                                    (local.get $p11)))))
                            (local.set $l137
                              (f32x4.mul
                                (v128.load align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $l41))
                                    (local.get $p11)))
                                (v128.load align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $p21))
                                    (local.get $p11)))))
                            (local.set $l140
                              (f32x4.mul
                                (v128.load align=1
                                  (local.get $l48))
                                (v128.load align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $l28))
                                    (local.get $p11)))))
                            (br $B139))
                          (block $B141
                            (br_if $B141
                              (i32.ne
                                (local.get $l38)
                                (i32.const 2)))
                            (local.set $l54
                              (f32x4.mul
                                (local.tee $l54
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l49))
                                      (local.get $p11))))
                                (local.get $l54)))
                            (local.set $l135
                              (f32x4.mul
                                (local.tee $l135
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l50))
                                      (local.get $p11))))
                                (local.get $l135)))
                            (local.set $l137
                              (f32x4.mul
                                (local.tee $l137
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l41))
                                      (local.get $p11))))
                                (local.get $l137)))
                            (local.set $l140
                              (f32x4.mul
                                (local.tee $l140
                                  (v128.load align=1
                                    (local.get $l48)))
                                (local.get $l140)))
                            (br $B139))
                          (local.set $l54
                            (v128.load align=1
                              (i32.add
                                (i32.load
                                  (local.get $l49))
                                (local.get $p11))))
                          (local.set $l135
                            (v128.load align=1
                              (i32.add
                                (i32.load
                                  (local.get $l50))
                                (local.get $p11))))
                          (local.set $l137
                            (v128.load align=1
                              (i32.add
                                (i32.load
                                  (local.get $l41))
                                (local.get $p11))))
                          (local.set $l140
                            (v128.load align=1
                              (local.get $l48))))
                        (v128.store align=1
                          (i32.add
                            (local.get $p10)
                            (i32.const 48))
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
                            (local.tee $l130
                              (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                                (local.get $l140)
                                (local.get $l137)))
                            (local.tee $l131
                              (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                                (local.get $l135)
                                (local.get $l54)))))
                        (v128.store align=1
                          (i32.add
                            (local.get $p10)
                            (i32.const 32))
                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                            (local.get $l130)
                            (local.get $l131)))
                        (v128.store align=1
                          (i32.add
                            (local.get $p10)
                            (i32.const 16))
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
                            (local.tee $l137
                              (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                                (local.get $l140)
                                (local.get $l137)))
                            (local.tee $l54
                              (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                                (local.get $l135)
                                (local.get $l54)))))
                        (v128.store align=1
                          (local.get $p10)
                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                            (local.get $l137)
                            (local.get $l54)))
                        (local.set $p10
                          (i32.add
                            (local.get $p10)
                            (i32.const 64)))
                        (local.set $p11
                          (i32.add
                            (local.get $p11)
                            (i32.const 16)))
                        (local.set $l48
                          (i32.add
                            (local.get $p9)
                            (i32.const 4)))
                        (br_if $L138
                          (i32.le_s
                            (i32.add
                              (local.get $p9)
                              (i32.const 8))
                            (local.get $p0)))))
                    (block $B142
                      (br_if $B142
                        (i32.le_s
                          (local.get $p0)
                          (local.get $l48)))
                      (local.set $l52
                        (i32.sub
                          (local.get $p0)
                          (local.get $l48)))
                      (block $B143
                        (br_if $B143
                          (i32.ne
                            (local.get $p13)
                            (i32.const 4)))
                        (local.set $p9
                          (i32.load
                            (local.get $p15)))
                        (local.set $l49
                          (i32.load
                            (local.get $l178)))
                        (local.set $l50
                          (i32.load
                            (local.get $p22)))
                        (local.set $l41
                          (i32.load
                            (local.get $l169)))
                        (local.set $l30
                          (i32.load
                            (local.get $p21)))
                        (local.set $l38
                          (i32.load
                            (local.get $l171)))
                        (local.set $l36
                          (i32.load
                            (local.get $l28)))
                        (local.set $l37
                          (i32.load
                            (local.get $l173)))
                        (block $B144
                          (br_if $B144
                            (i32.lt_u
                              (local.get $l52)
                              (i32.const 4)))
                          (br_if $B144
                            (v128.any_true
                              (v128.and
                                (i8x16.shuffle 0 1 4 5 8 9 12 13 16 17 20 21 24 25 28 29
                                  (i32x4.lt_u
                                    (local.tee $l54
                                      (i32x4.splat
                                        (local.tee $p10
                                          (i32.add
                                            (local.get $l75)
                                            (i32.shl
                                              (local.get $l48)
                                              (i32.const 4))))))
                                    (i32x4.replace_lane 3
                                      (i32x4.replace_lane 2
                                        (i32x4.replace_lane 1
                                          (i32x4.splat
                                            (i32.add
                                              (local.get $l37)
                                              (local.get $l47)))
                                          (i32.add
                                            (local.get $l36)
                                            (local.get $l47)))
                                        (i32.add
                                          (local.get $l38)
                                          (local.get $l47)))
                                      (i32.add
                                        (local.get $l30)
                                        (local.get $l47))))
                                  (i32x4.lt_u
                                    (local.get $l54)
                                    (i32x4.replace_lane 3
                                      (i32x4.replace_lane 2
                                        (i32x4.replace_lane 1
                                          (i32x4.splat
                                            (i32.add
                                              (local.get $l41)
                                              (local.get $l47)))
                                          (i32.add
                                            (local.get $l50)
                                            (local.get $l47)))
                                        (i32.add
                                          (local.get $l49)
                                          (local.get $l47)))
                                      (i32.add
                                        (local.get $p9)
                                        (local.get $l47)))))
                                (i8x16.shuffle 0 1 4 5 8 9 12 13 16 17 20 21 24 25 28 29
                                  (i32x4.lt_u
                                    (i32x4.replace_lane 3
                                      (i32x4.replace_lane 2
                                        (i32x4.replace_lane 1
                                          (i32x4.splat
                                            (i32.add
                                              (local.get $l37)
                                              (local.tee $p11
                                                (i32.shl
                                                  (local.get $l48)
                                                  (i32.const 2)))))
                                          (i32.add
                                            (local.get $l36)
                                            (local.get $p11)))
                                        (i32.add
                                          (local.get $l38)
                                          (local.get $p11)))
                                      (i32.add
                                        (local.get $l30)
                                        (local.get $p11)))
                                    (local.get $l81))
                                  (i32x4.lt_u
                                    (i32x4.replace_lane 3
                                      (i32x4.replace_lane 2
                                        (i32x4.replace_lane 1
                                          (i32x4.splat
                                            (i32.add
                                              (local.get $l41)
                                              (local.get $p11)))
                                          (i32.add
                                            (local.get $l50)
                                            (local.get $p11)))
                                        (i32.add
                                          (local.get $l49)
                                          (local.get $p11)))
                                      (i32.add
                                        (local.get $p9)
                                        (local.get $p11)))
                                    (local.get $l81))))))
                          (local.set $l128
                            (i32.add
                              (local.get $l68)
                              (local.get $l48)))
                          (local.set $l48
                            (i32.add
                              (local.get $l48)
                              (i32.sub
                                (local.get $l52)
                                (local.get $l67))))
                          (local.set $l52
                            (local.get $l37))
                          (local.set $l53
                            (local.get $l36))
                          (local.set $l44
                            (local.get $l38))
                          (local.set $l45
                            (local.get $l30))
                          (local.set $l46
                            (local.get $l41))
                          (local.set $l125
                            (local.get $l50))
                          (local.set $l126
                            (local.get $l49))
                          (local.set $l127
                            (local.get $p9))
                          (loop $L145
                            (v128.store offset=48 align=4
                              (local.get $p10)
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                (i8x16.shuffle 12 13 14 15 28 29 30 31 0 1 2 3 0 1 2 3
                                  (local.tee $l54
                                    (f32x4.mul
                                      (v128.load align=4
                                        (i32.add
                                          (local.get $l52)
                                          (local.get $p11)))
                                      (v128.load align=4
                                        (i32.add
                                          (local.get $l53)
                                          (local.get $p11)))))
                                  (local.tee $l135
                                    (f32x4.mul
                                      (v128.load align=4
                                        (i32.add
                                          (local.get $l44)
                                          (local.get $p11)))
                                      (v128.load align=4
                                        (i32.add
                                          (local.get $l45)
                                          (local.get $p11))))))
                                (i8x16.shuffle 0 1 2 3 0 1 2 3 12 13 14 15 28 29 30 31
                                  (local.tee $l137
                                    (f32x4.mul
                                      (v128.load align=4
                                        (i32.add
                                          (local.get $l46)
                                          (local.get $p11)))
                                      (v128.load align=4
                                        (i32.add
                                          (local.get $l125)
                                          (local.get $p11)))))
                                  (local.tee $l140
                                    (f32x4.mul
                                      (v128.load align=4
                                        (i32.add
                                          (local.get $l126)
                                          (local.get $p11)))
                                      (v128.load align=4
                                        (i32.add
                                          (local.get $l127)
                                          (local.get $p11))))))))
                            (v128.store offset=32 align=4
                              (local.get $p10)
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                (i8x16.shuffle 8 9 10 11 24 25 26 27 0 1 2 3 0 1 2 3
                                  (local.get $l54)
                                  (local.get $l135))
                                (i8x16.shuffle 0 1 2 3 0 1 2 3 8 9 10 11 24 25 26 27
                                  (local.get $l137)
                                  (local.get $l140))))
                            (v128.store offset=16 align=4
                              (local.get $p10)
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                (i8x16.shuffle 4 5 6 7 20 21 22 23 0 1 2 3 0 1 2 3
                                  (local.get $l54)
                                  (local.get $l135))
                                (i8x16.shuffle 0 1 2 3 0 1 2 3 4 5 6 7 20 21 22 23
                                  (local.get $l137)
                                  (local.get $l140))))
                            (v128.store align=4
                              (local.get $p10)
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                (i8x16.shuffle 0 1 2 3 16 17 18 19 0 1 2 3 0 1 2 3
                                  (local.get $l54)
                                  (local.get $l135))
                                (i8x16.shuffle 0 1 2 3 0 1 2 3 0 1 2 3 16 17 18 19
                                  (local.get $l137)
                                  (local.get $l140))))
                            (local.set $p10
                              (i32.add
                                (local.get $p10)
                                (i32.const 64)))
                            (local.set $l52
                              (i32.add
                                (local.get $l52)
                                (i32.const 16)))
                            (local.set $l53
                              (i32.add
                                (local.get $l53)
                                (i32.const 16)))
                            (local.set $l44
                              (i32.add
                                (local.get $l44)
                                (i32.const 16)))
                            (local.set $l45
                              (i32.add
                                (local.get $l45)
                                (i32.const 16)))
                            (local.set $l46
                              (i32.add
                                (local.get $l46)
                                (i32.const 16)))
                            (local.set $l125
                              (i32.add
                                (local.get $l125)
                                (i32.const 16)))
                            (local.set $l126
                              (i32.add
                                (local.get $l126)
                                (i32.const 16)))
                            (local.set $l127
                              (i32.add
                                (local.get $l127)
                                (i32.const 16)))
                            (br_if $L145
                              (local.tee $l128
                                (i32.add
                                  (local.get $l128)
                                  (i32.const 4)))))
                          (br_if $B142
                            (i32.eqz
                              (local.get $l67))))
                        (local.set $p11
                          (i32.shl
                            (local.get $l48)
                            (i32.const 2)))
                        (local.set $l52
                          (i32.sub
                            (local.get $p0)
                            (local.get $l48)))
                        (local.set $p10
                          (i32.add
                            (local.get $l75)
                            (i32.shl
                              (local.get $l48)
                              (i32.const 4))))
                        (loop $L146
                          (f32.store
                            (local.get $p10)
                            (f32.mul
                              (f32.load
                                (i32.add
                                  (local.get $l37)
                                  (local.get $p11)))
                              (f32.load
                                (i32.add
                                  (local.get $l36)
                                  (local.get $p11)))))
                          (f32.store
                            (i32.add
                              (local.get $p10)
                              (i32.const 4))
                            (f32.mul
                              (f32.load
                                (i32.add
                                  (local.get $l38)
                                  (local.get $p11)))
                              (f32.load
                                (i32.add
                                  (local.get $l30)
                                  (local.get $p11)))))
                          (f32.store
                            (i32.add
                              (local.get $p10)
                              (i32.const 8))
                            (f32.mul
                              (f32.load
                                (i32.add
                                  (local.get $l41)
                                  (local.get $p11)))
                              (f32.load
                                (i32.add
                                  (local.get $l50)
                                  (local.get $p11)))))
                          (f32.store
                            (i32.add
                              (local.get $p10)
                              (i32.const 12))
                            (f32.mul
                              (f32.load
                                (i32.add
                                  (local.get $l49)
                                  (local.get $p11)))
                              (f32.load
                                (i32.add
                                  (local.get $p9)
                                  (local.get $p11)))))
                          (local.set $p10
                            (i32.add
                              (local.get $p10)
                              (i32.const 16)))
                          (local.set $l37
                            (i32.add
                              (local.get $l37)
                              (i32.const 4)))
                          (local.set $l36
                            (i32.add
                              (local.get $l36)
                              (i32.const 4)))
                          (local.set $l38
                            (i32.add
                              (local.get $l38)
                              (i32.const 4)))
                          (local.set $l30
                            (i32.add
                              (local.get $l30)
                              (i32.const 4)))
                          (local.set $l41
                            (i32.add
                              (local.get $l41)
                              (i32.const 4)))
                          (local.set $l50
                            (i32.add
                              (local.get $l50)
                              (i32.const 4)))
                          (local.set $l49
                            (i32.add
                              (local.get $l49)
                              (i32.const 4)))
                          (local.set $p9
                            (i32.add
                              (local.get $p9)
                              (i32.const 4)))
                          (br_if $L146
                            (local.tee $l52
                              (i32.add
                                (local.get $l52)
                                (i32.const -1))))
                          (br $B142)))
                      (local.set $l44
                        (i32.load
                          (i32.add
                            (local.get $l36)
                            (local.get $l177))))
                      (local.set $l53
                        (i32.load
                          (i32.add
                            (local.get $l36)
                            (local.get $l168))))
                      (local.set $l37
                        (i32.load
                          (i32.add
                            (local.get $l36)
                            (local.get $l170))))
                      (local.set $l30
                        (i32.load
                          (i32.add
                            (local.get $l36)
                            (local.get $l172))))
                      (block $B147
                        (br_if $B147
                          (i32.eq
                            (local.get $l38)
                            (i32.const 2)))
                        (block $B148
                          (br_if $B148
                            (i32.lt_u
                              (local.get $l52)
                              (i32.const 12)))
                          (br_if $B148
                            (i32.and
                              (i32.lt_u
                                (local.tee $p11
                                  (i32.add
                                    (local.get $l75)
                                    (i32.shl
                                      (local.get $l48)
                                      (i32.const 4))))
                                (i32.add
                                  (local.get $l30)
                                  (local.get $l47)))
                              (i32.lt_u
                                (local.tee $p10
                                  (i32.add
                                    (local.get $l30)
                                    (local.tee $l50
                                      (i32.shl
                                        (local.get $l48)
                                        (i32.const 2)))))
                                (local.get $l40))))
                          (br_if $B148
                            (i32.and
                              (i32.lt_u
                                (local.get $p11)
                                (i32.add
                                  (local.get $l37)
                                  (local.get $l47)))
                              (i32.lt_u
                                (local.tee $p9
                                  (i32.add
                                    (local.get $l37)
                                    (local.get $l50)))
                                (local.get $l40))))
                          (br_if $B148
                            (i32.and
                              (i32.lt_u
                                (local.get $p11)
                                (i32.add
                                  (local.get $l53)
                                  (local.get $l47)))
                              (i32.lt_u
                                (local.tee $l49
                                  (i32.add
                                    (local.get $l53)
                                    (local.get $l50)))
                                (local.get $l40))))
                          (br_if $B148
                            (i32.and
                              (i32.lt_u
                                (local.get $p11)
                                (i32.add
                                  (local.get $l44)
                                  (local.get $l47)))
                              (i32.lt_u
                                (local.tee $l50
                                  (i32.add
                                    (local.get $l44)
                                    (local.get $l50)))
                                (local.get $l40))))
                          (local.set $l41
                            (i32.add
                              (local.get $l68)
                              (local.get $l48)))
                          (local.set $l48
                            (i32.add
                              (local.get $l48)
                              (i32.sub
                                (local.get $l52)
                                (local.get $l67))))
                          (loop $L149
                            (v128.store offset=48 align=4
                              (local.get $p11)
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                (i8x16.shuffle 12 13 14 15 28 29 30 31 0 1 2 3 0 1 2 3
                                  (local.tee $l54
                                    (v128.load align=4
                                      (local.get $p10)))
                                  (local.tee $l135
                                    (v128.load align=4
                                      (local.get $p9))))
                                (i8x16.shuffle 0 1 2 3 0 1 2 3 12 13 14 15 28 29 30 31
                                  (local.tee $l137
                                    (v128.load align=4
                                      (local.get $l49)))
                                  (local.tee $l140
                                    (v128.load align=4
                                      (local.get $l50))))))
                            (v128.store offset=32 align=4
                              (local.get $p11)
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                (i8x16.shuffle 8 9 10 11 24 25 26 27 0 1 2 3 0 1 2 3
                                  (local.get $l54)
                                  (local.get $l135))
                                (i8x16.shuffle 0 1 2 3 0 1 2 3 8 9 10 11 24 25 26 27
                                  (local.get $l137)
                                  (local.get $l140))))
                            (v128.store offset=16 align=4
                              (local.get $p11)
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                (i8x16.shuffle 4 5 6 7 20 21 22 23 0 1 2 3 0 1 2 3
                                  (local.get $l54)
                                  (local.get $l135))
                                (i8x16.shuffle 0 1 2 3 0 1 2 3 4 5 6 7 20 21 22 23
                                  (local.get $l137)
                                  (local.get $l140))))
                            (v128.store align=4
                              (local.get $p11)
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                (i8x16.shuffle 0 1 2 3 16 17 18 19 0 1 2 3 0 1 2 3
                                  (local.get $l54)
                                  (local.get $l135))
                                (i8x16.shuffle 0 1 2 3 0 1 2 3 0 1 2 3 16 17 18 19
                                  (local.get $l137)
                                  (local.get $l140))))
                            (local.set $p11
                              (i32.add
                                (local.get $p11)
                                (i32.const 64)))
                            (local.set $p10
                              (i32.add
                                (local.get $p10)
                                (i32.const 16)))
                            (local.set $p9
                              (i32.add
                                (local.get $p9)
                                (i32.const 16)))
                            (local.set $l49
                              (i32.add
                                (local.get $l49)
                                (i32.const 16)))
                            (local.set $l50
                              (i32.add
                                (local.get $l50)
                                (i32.const 16)))
                            (br_if $L149
                              (local.tee $l41
                                (i32.add
                                  (local.get $l41)
                                  (i32.const 4)))))
                          (br_if $B142
                            (i32.eqz
                              (local.get $l67))))
                        (local.set $l50
                          (i32.sub
                            (local.get $p0)
                            (local.get $l48)))
                        (local.set $p11
                          (i32.add
                            (local.get $l75)
                            (i32.shl
                              (local.get $l48)
                              (i32.const 4))))
                        (local.set $p10
                          (i32.add
                            (local.get $l30)
                            (local.tee $l49
                              (i32.shl
                                (local.get $l48)
                                (i32.const 2)))))
                        (local.set $p9
                          (i32.add
                            (local.get $l37)
                            (local.get $l49)))
                        (local.set $l48
                          (i32.add
                            (local.get $l53)
                            (local.get $l49)))
                        (local.set $l49
                          (i32.add
                            (local.get $l44)
                            (local.get $l49)))
                        (loop $L150
                          (f32.store
                            (local.get $p11)
                            (f32.load
                              (local.get $p10)))
                          (f32.store
                            (i32.add
                              (local.get $p11)
                              (i32.const 4))
                            (f32.load
                              (local.get $p9)))
                          (f32.store
                            (i32.add
                              (local.get $p11)
                              (i32.const 8))
                            (f32.load
                              (local.get $l48)))
                          (f32.store
                            (i32.add
                              (local.get $p11)
                              (i32.const 12))
                            (f32.load
                              (local.get $l49)))
                          (local.set $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const 16)))
                          (local.set $p10
                            (i32.add
                              (local.get $p10)
                              (i32.const 4)))
                          (local.set $p9
                            (i32.add
                              (local.get $p9)
                              (i32.const 4)))
                          (local.set $l48
                            (i32.add
                              (local.get $l48)
                              (i32.const 4)))
                          (local.set $l49
                            (i32.add
                              (local.get $l49)
                              (i32.const 4)))
                          (br_if $L150
                            (local.tee $l50
                              (i32.add
                                (local.get $l50)
                                (i32.const -1))))
                          (br $B142)))
                      (block $B151
                        (br_if $B151
                          (i32.lt_u
                            (local.get $l52)
                            (i32.const 4)))
                        (br_if $B151
                          (i32.and
                            (i32.lt_u
                              (local.tee $p11
                                (i32.add
                                  (local.get $l75)
                                  (i32.shl
                                    (local.get $l48)
                                    (i32.const 4))))
                              (i32.add
                                (local.get $l30)
                                (local.get $l47)))
                            (i32.lt_u
                              (local.tee $p10
                                (i32.add
                                  (local.get $l30)
                                  (local.tee $l50
                                    (i32.shl
                                      (local.get $l48)
                                      (i32.const 2)))))
                              (local.get $l40))))
                        (br_if $B151
                          (i32.and
                            (i32.lt_u
                              (local.get $p11)
                              (i32.add
                                (local.get $l37)
                                (local.get $l47)))
                            (i32.lt_u
                              (local.tee $p9
                                (i32.add
                                  (local.get $l37)
                                  (local.get $l50)))
                              (local.get $l40))))
                        (br_if $B151
                          (i32.and
                            (i32.lt_u
                              (local.get $p11)
                              (i32.add
                                (local.get $l53)
                                (local.get $l47)))
                            (i32.lt_u
                              (local.tee $l49
                                (i32.add
                                  (local.get $l53)
                                  (local.get $l50)))
                              (local.get $l40))))
                        (br_if $B151
                          (i32.and
                            (i32.lt_u
                              (local.get $p11)
                              (i32.add
                                (local.get $l44)
                                (local.get $l47)))
                            (i32.lt_u
                              (local.tee $l50
                                (i32.add
                                  (local.get $l44)
                                  (local.get $l50)))
                              (local.get $l40))))
                        (local.set $l41
                          (i32.add
                            (local.get $l68)
                            (local.get $l48)))
                        (local.set $l48
                          (i32.add
                            (local.get $l48)
                            (i32.sub
                              (local.get $l52)
                              (local.get $l67))))
                        (loop $L152
                          (v128.store offset=48 align=4
                            (local.get $p11)
                            (f32x4.mul
                              (local.tee $l130
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                  (i8x16.shuffle 12 13 14 15 28 29 30 31 0 1 2 3 0 1 2 3
                                    (local.tee $l54
                                      (v128.load align=4
                                        (local.get $p10)))
                                    (local.tee $l135
                                      (v128.load align=4
                                        (local.get $p9))))
                                  (i8x16.shuffle 0 1 2 3 0 1 2 3 12 13 14 15 28 29 30 31
                                    (local.tee $l137
                                      (v128.load align=4
                                        (local.get $l49)))
                                    (local.tee $l140
                                      (v128.load align=4
                                        (local.get $l50))))))
                              (local.get $l130)))
                          (v128.store offset=32 align=4
                            (local.get $p11)
                            (f32x4.mul
                              (local.tee $l130
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                  (i8x16.shuffle 8 9 10 11 24 25 26 27 0 1 2 3 0 1 2 3
                                    (local.get $l54)
                                    (local.get $l135))
                                  (i8x16.shuffle 0 1 2 3 0 1 2 3 8 9 10 11 24 25 26 27
                                    (local.get $l137)
                                    (local.get $l140))))
                              (local.get $l130)))
                          (v128.store offset=16 align=4
                            (local.get $p11)
                            (f32x4.mul
                              (local.tee $l130
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                  (i8x16.shuffle 4 5 6 7 20 21 22 23 0 1 2 3 0 1 2 3
                                    (local.get $l54)
                                    (local.get $l135))
                                  (i8x16.shuffle 0 1 2 3 0 1 2 3 4 5 6 7 20 21 22 23
                                    (local.get $l137)
                                    (local.get $l140))))
                              (local.get $l130)))
                          (v128.store align=4
                            (local.get $p11)
                            (f32x4.mul
                              (local.tee $l54
                                (i8x16.shuffle 0 1 2 3 4 5 6 7 24 25 26 27 28 29 30 31
                                  (i8x16.shuffle 0 1 2 3 16 17 18 19 0 1 2 3 0 1 2 3
                                    (local.get $l54)
                                    (local.get $l135))
                                  (i8x16.shuffle 0 1 2 3 0 1 2 3 0 1 2 3 16 17 18 19
                                    (local.get $l137)
                                    (local.get $l140))))
                              (local.get $l54)))
                          (local.set $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const 64)))
                          (local.set $p10
                            (i32.add
                              (local.get $p10)
                              (i32.const 16)))
                          (local.set $p9
                            (i32.add
                              (local.get $p9)
                              (i32.const 16)))
                          (local.set $l49
                            (i32.add
                              (local.get $l49)
                              (i32.const 16)))
                          (local.set $l50
                            (i32.add
                              (local.get $l50)
                              (i32.const 16)))
                          (br_if $L152
                            (local.tee $l41
                              (i32.add
                                (local.get $l41)
                                (i32.const 4)))))
                        (br_if $B142
                          (i32.eqz
                            (local.get $l67))))
                      (local.set $l50
                        (i32.sub
                          (local.get $p0)
                          (local.get $l48)))
                      (local.set $p11
                        (i32.add
                          (local.get $l75)
                          (i32.shl
                            (local.get $l48)
                            (i32.const 4))))
                      (local.set $p10
                        (i32.add
                          (local.get $l30)
                          (local.tee $l49
                            (i32.shl
                              (local.get $l48)
                              (i32.const 2)))))
                      (local.set $p9
                        (i32.add
                          (local.get $l37)
                          (local.get $l49)))
                      (local.set $l48
                        (i32.add
                          (local.get $l53)
                          (local.get $l49)))
                      (local.set $l49
                        (i32.add
                          (local.get $l44)
                          (local.get $l49)))
                      (loop $L153
                        (f32.store
                          (local.get $p11)
                          (f32.mul
                            (local.tee $l163
                              (f32.load
                                (local.get $p10)))
                            (local.get $l163)))
                        (f32.store
                          (i32.add
                            (local.get $p11)
                            (i32.const 4))
                          (f32.mul
                            (local.tee $l163
                              (f32.load
                                (local.get $p9)))
                            (local.get $l163)))
                        (f32.store
                          (i32.add
                            (local.get $p11)
                            (i32.const 8))
                          (f32.mul
                            (local.tee $l163
                              (f32.load
                                (local.get $l48)))
                            (local.get $l163)))
                        (f32.store
                          (i32.add
                            (local.get $p11)
                            (i32.const 12))
                          (f32.mul
                            (local.tee $l163
                              (f32.load
                                (local.get $l49)))
                            (local.get $l163)))
                        (local.set $p11
                          (i32.add
                            (local.get $p11)
                            (i32.const 16)))
                        (local.set $p10
                          (i32.add
                            (local.get $p10)
                            (i32.const 4)))
                        (local.set $p9
                          (i32.add
                            (local.get $p9)
                            (i32.const 4)))
                        (local.set $l48
                          (i32.add
                            (local.get $l48)
                            (i32.const 4)))
                        (local.set $l49
                          (i32.add
                            (local.get $l49)
                            (i32.const 4)))
                        (br_if $L153
                          (local.tee $l50
                            (i32.add
                              (local.get $l50)
                              (i32.const -1))))))
                    (i64.store align=4
                      (local.get $l112)
                      (i64.const 0))
                    (i32.store offset=8
                      (local.get $l112)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l111)
                      (i64.const 0))
                    (i32.store offset=8
                      (local.get $l111)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l110)
                      (i64.const 0))
                    (i32.store offset=8
                      (local.get $l110)
                      (i32.const 0))
                    (v128.store offset=1680
                      (local.get $l24)
                      (local.tee $l137
                        (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                    (v128.store offset=1632
                      (local.get $l24)
                      (local.get $l137))
                    (f32.store offset=288
                      (local.get $l24)
                      (local.tee $l163
                        (f32.load offset=24
                          (local.get $p8))))
                    (f32.store offset=320
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=28
                          (local.get $p8))))
                    (f32.store offset=352
                      (local.get $l24)
                      (local.tee $l165
                        (f32.load offset=32
                          (local.get $p8))))
                    (v128.store offset=304
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l163))))
                    (v128.store offset=336
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (v128.store offset=368
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l165))))
                    (local.set $l163
                      (f32.load offset=36
                        (local.get $p8)))
                    (i64.store align=4
                      (local.get $l109)
                      (i64.const 0))
                    (i32.store offset=8
                      (local.get $l109)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l108)
                      (i64.const 0))
                    (i32.store offset=8
                      (local.get $l108)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l107)
                      (i64.const 0))
                    (i32.store offset=8
                      (local.get $l107)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l106)
                      (i64.const 0))
                    (i32.store offset=8
                      (local.get $l106)
                      (i32.const 0))
                    (f32.store offset=384
                      (local.get $l24)
                      (local.get $l163))
                    (v128.store offset=400
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l163))))
                    (f32.store offset=416
                      (local.get $l24)
                      (local.tee $l163
                        (f32.load offset=40
                          (local.get $p8))))
                    (f32.store offset=448
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=44
                          (local.get $p8))))
                    (f32.store offset=480
                      (local.get $l24)
                      (local.tee $l165
                        (f32.load offset=48
                          (local.get $p8))))
                    (v128.store offset=432
                      (local.get $l24)
                      (local.tee $l159
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l163)))))
                    (v128.store offset=464
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (i32.store offset=8
                      (local.get $l105)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l105)
                      (i64.const 0))
                    (i32.store offset=8
                      (local.get $l104)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l104)
                      (i64.const 0))
                    (i32.store offset=8
                      (local.get $l103)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l103)
                      (i64.const 0))
                    (i64.store align=4
                      (local.get $l102)
                      (i64.const 0))
                    (i32.store offset=8
                      (local.get $l102)
                      (i32.const 0))
                    (v128.store offset=496
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l165))))
                    (f32.store offset=512
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=52
                          (local.get $p8))))
                    (f32.store offset=544
                      (local.get $l24)
                      (local.tee $l163
                        (f32.load offset=56
                          (local.get $p8))))
                    (f32.store offset=576
                      (local.get $l24)
                      (local.tee $l165
                        (f32.load offset=60
                          (local.get $p8))))
                    (f32.store offset=608
                      (local.get $l24)
                      (local.tee $l180
                        (f32.load offset=64
                          (local.get $p8))))
                    (v128.store offset=528
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (v128.store offset=560
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l163))))
                    (v128.store offset=592
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l165))))
                    (v128.store offset=624
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l180))))
                    (f32.store offset=640
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=68
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l101)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l101)
                      (i64.const 0))
                    (v128.store offset=656
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (v128.store offset=1648
                      (local.get $l24)
                      (local.get $l137))
                    (v128.store offset=1696
                      (local.get $l24)
                      (local.get $l137))
                    (f32.store offset=672
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=72
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l100)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l100)
                      (i64.const 0))
                    (v128.store offset=688
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (f32.store offset=704
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=76
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l99)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l99)
                      (i64.const 0))
                    (v128.store offset=720
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (f32.store offset=736
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=80
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l98)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l98)
                      (i64.const 0))
                    (v128.store offset=752
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (f32.store offset=768
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=84
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l97)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l97)
                      (i64.const 0))
                    (v128.store offset=784
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (f32.store offset=800
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=88
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l96)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l96)
                      (i64.const 0))
                    (v128.store offset=816
                      (local.get $l24)
                      (local.tee $l133
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l164)))))
                    (f32.store offset=832
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=92
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l95)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l95)
                      (i64.const 0))
                    (v128.store offset=848
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (f32.store offset=864
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=96
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l94)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l94)
                      (i64.const 0))
                    (v128.store offset=880
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (f32.store offset=896
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=100
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l93)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l93)
                      (i64.const 0))
                    (v128.store offset=912
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (f32.store offset=928
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=104
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l92)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l92)
                      (i64.const 0))
                    (v128.store offset=944
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (f32.store offset=960
                      (local.get $l24)
                      (local.tee $l165
                        (f32.load offset=108
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l91)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l91)
                      (i64.const 0))
                    (v128.store offset=976
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l165))))
                    (f32.store offset=992
                      (local.get $l24)
                      (local.tee $l165
                        (f32.load offset=112
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l90)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l90)
                      (i64.const 0))
                    (v128.store offset=1008
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l165))))
                    (f32.store offset=1024
                      (local.get $l24)
                      (local.tee $l165
                        (f32.load offset=116
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l89)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l89)
                      (i64.const 0))
                    (v128.store offset=1040
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l165))))
                    (v128.store64_lane offset=272 0
                      (local.get $l24)
                      (v128.and
                        (f32x4.eq
                          (f32x4.replace_lane 1
                            (f32x4.splat
                              (local.get $l163))
                            (local.get $l164))
                          (v128.const i32x4 0xbf800000 0xbf800000 0xbf800000 0xbf800000))
                        (v128.const i32x4 0x00000001 0x00000001 0x00000001 0x00000001)))
                    (v128.store offset=1664
                      (local.get $l24)
                      (local.get $l137))
                    (v128.store offset=1712
                      (local.get $l24)
                      (local.get $l137))
                    (f32.store offset=1056
                      (local.get $l24)
                      (local.tee $l163
                        (f32.load offset=120
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l88)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l88)
                      (i64.const 0))
                    (v128.store offset=1072
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l163))))
                    (f32.store offset=1088
                      (local.get $l24)
                      (local.tee $l163
                        (f32.load offset=124
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l87)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l87)
                      (i64.const 0))
                    (v128.store offset=1104
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l163))))
                    (f32.store offset=1120
                      (local.get $l24)
                      (local.tee $l163
                        (f32.load offset=128
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l86)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l86)
                      (i64.const 0))
                    (v128.store offset=1136
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l163))))
                    (f32.store offset=1152
                      (local.get $l24)
                      (local.tee $l163
                        (f32.load offset=132
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l85)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l85)
                      (i64.const 0))
                    (v128.store offset=1168
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l163))))
                    (f32.store offset=1184
                      (local.get $l24)
                      (local.tee $l163
                        (f32.load offset=136
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l84)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l84)
                      (i64.const 0))
                    (v128.store offset=1200
                      (local.get $l24)
                      (local.tee $l134
                        (f64x2.splat
                          (f64.promote_f32
                            (local.get $l163)))))
                    (f32.store offset=1216
                      (local.get $l24)
                      (local.tee $l163
                        (f32.load offset=140
                          (local.get $p8))))
                    (i32.store offset=8
                      (local.get $l83)
                      (i32.const 0))
                    (i64.store align=4
                      (local.get $l83)
                      (i64.const 0))
                    (v128.store offset=1232
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l163))))
                    (f32.store offset=1248
                      (local.get $l24)
                      (local.tee $l163
                        (f32.load offset=144
                          (local.get $p8))))
                    (v128.store offset=1264
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l163))))
                    (f32.store offset=1280
                      (local.get $l24)
                      (local.tee $l163
                        (f32.load offset=148
                          (local.get $p8))))
                    (v128.store offset=1296
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l163))))
                    (f32.store offset=1312
                      (local.get $l24)
                      (local.tee $l163
                        (f32.load offset=152
                          (local.get $p8))))
                    (v128.store offset=1328
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l163))))
                    (f32.store offset=1344
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=156
                          (local.get $p8))))
                    (v128.store offset=1360
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (f32.store offset=1376
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=160
                          (local.get $p8))))
                    (v128.store offset=1392
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (f32.store offset=1408
                      (local.get $l24)
                      (local.tee $l164
                        (f32.load offset=164
                          (local.get $p8))))
                    (v128.store offset=1424
                      (local.get $l24)
                      (f64x2.splat
                        (f64.promote_f32
                          (local.get $l164))))
                    (i32.store offset=280
                      (local.get $l24)
                      (f32.eq
                        (local.get $l163)
                        (f32.const -0x1p+0 (;=-1;))))
                    (block $B154
                      (block $B155
                        (br_if $B155
                          (i32.eqz
                            (local.get $l115)))
                        (local.set $l52
                          (i32.const -4))
                        (local.set $l54
                          (v128.const i32x4 0x7fffffff 0x7fffffff 0x7fffffff 0x7fffffff))
                        (local.set $l140
                          (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                        (local.set $l135
                          (local.get $l137))
                        (br $B154))
                      (local.set $l54
                        (v128.const i32x4 0x7fffffff 0x7fffffff 0x7fffffff 0x7fffffff))
                      (local.set $p11
                        (i32.const -4))
                      (local.set $l130
                        (v128.load offset=1680
                          (local.get $l24)))
                      (local.set $l149
                        (v128.load32_splat offset=1184
                          (local.get $l24)))
                      (local.set $l152
                        (v128.load32_splat offset=800
                          (local.get $l24)))
                      (local.set $l153
                        (v128.load32_splat offset=416
                          (local.get $l24)))
                      (local.set $p10
                        (local.get $l77))
                      (local.set $p9
                        (local.get $l79))
                      (local.set $l147
                        (local.tee $l144
                          (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                      (local.set $l131
                        (local.tee $l137
                          (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                      (local.set $l135
                        (local.get $l137))
                      (loop $L156
                        (local.set $l140
                          (local.get $l137))
                        (local.set $l137
                          (local.get $l144))
                        (block $B157
                          (br_if $B157
                            (i32.lt_s
                              (local.get $p11)
                              (i32.const 6)))
                          (local.set $l137
                            (v128.load align=1
                              (local.get $p10))))
                        (local.set $l132
                          (local.get $l144))
                        (block $B158
                          (br_if $B158
                            (i32.ge_s
                              (i32.add
                                (local.get $p11)
                                (i32.const 4))
                              (local.get $p0)))
                          (local.set $l132
                            (v128.load align=1
                              (i32.add
                                (local.get $p10)
                                (i32.const 160)))))
                        (local.set $l146
                          (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                            (local.tee $l145
                              (f64x2.add
                                (f64x2.mul
                                  (local.get $l159)
                                  (f64x2.promote_low_f32x4
                                    (local.get $l130)))
                                (f64x2.promote_low_f32x4
                                  (local.tee $l137
                                    (f32x4.sub
                                      (f32x4.mul
                                        (local.tee $l132
                                          (f32x4.add
                                            (local.get $l137)
                                            (local.get $l132)))
                                        (v128.load32_splat offset=24
                                          (local.get $p8)))
                                      (v128.load offset=1632
                                        (local.get $l24)))))))
                            (local.tee $l139
                              (f64x2.add
                                (f64x2.mul
                                  (local.get $l159)
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l130)
                                      (local.get $l130))))
                                (f64x2.promote_low_f32x4
                                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                    (local.get $l137)
                                    (local.get $l137)))))))
                        (block $B159
                          (block $B160
                            (br_if $B160
                              (v128.any_true
                                (i32x4.eq
                                  (v128.and
                                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                      (local.get $l145)
                                      (local.get $l139))
                                    (local.tee $l143
                                      (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                                  (local.tee $l142
                                    (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
                            (local.set $l138
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                (f32x4.demote_f64x2_zero
                                  (local.get $l145))
                                (f32x4.demote_f64x2_zero
                                  (local.get $l139))))
                            (br $B159))
                          (local.set $l138
                            (call $fma4_tie
                              (local.get $l153)
                              (local.get $l130)
                              (local.get $l137))))
                        (local.set $l139
                          (v128.and
                            (local.get $l146)
                            (local.tee $l145
                              (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
                        (local.set $l148
                          (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                            (local.tee $l146
                              (f64x2.add
                                (f64x2.mul
                                  (local.get $l133)
                                  (f64x2.promote_low_f32x4
                                    (local.get $l131)))
                                (f64x2.promote_low_f32x4
                                  (local.tee $l137
                                    (f32x4.sub
                                      (f32x4.mul
                                        (local.get $l132)
                                        (v128.load32_splat offset=72
                                          (local.get $p8)))
                                      (v128.load offset=1648
                                        (local.get $l24)))))))
                            (local.tee $l141
                              (f64x2.add
                                (f64x2.mul
                                  (local.get $l133)
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l131)
                                      (local.get $l131))))
                                (f64x2.promote_low_f32x4
                                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                    (local.get $l137)
                                    (local.get $l137)))))))
                        (block $B161
                          (block $B162
                            (br_if $B162
                              (v128.any_true
                                (i32x4.eq
                                  (v128.and
                                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                      (local.get $l146)
                                      (local.get $l141))
                                    (local.get $l143))
                                  (local.get $l142))))
                            (local.set $l146
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                (f32x4.demote_f64x2_zero
                                  (local.get $l146))
                                (f32x4.demote_f64x2_zero
                                  (local.get $l141))))
                            (br $B161))
                          (local.set $l146
                            (call $fma4_tie
                              (local.get $l152)
                              (local.get $l131)
                              (local.get $l137))))
                        (local.set $l141
                          (i32x4.max_s
                            (local.get $l135)
                            (local.get $l139)))
                        (local.set $l139
                          (i32x4.min_s
                            (local.get $l54)
                            (local.get $l139)))
                        (local.set $l135
                          (v128.and
                            (local.get $l148)
                            (local.get $l145)))
                        (local.set $l147
                          (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                            (local.tee $l137
                              (f64x2.add
                                (f64x2.mul
                                  (local.get $l134)
                                  (f64x2.promote_low_f32x4
                                    (local.get $l140)))
                                (f64x2.promote_low_f32x4
                                  (local.tee $l54
                                    (f32x4.sub
                                      (f32x4.mul
                                        (local.get $l132)
                                        (v128.load32_splat offset=120
                                          (local.get $p8)))
                                      (local.get $l147))))))
                            (local.tee $l132
                              (f64x2.add
                                (f64x2.mul
                                  (local.get $l134)
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l140)
                                      (local.get $l140))))
                                (f64x2.promote_low_f32x4
                                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                    (local.get $l54)
                                    (local.get $l54)))))))
                        (block $B163
                          (block $B164
                            (br_if $B164
                              (v128.any_true
                                (i32x4.eq
                                  (v128.and
                                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                      (local.get $l137)
                                      (local.get $l132))
                                    (local.get $l143))
                                  (local.get $l142))))
                            (local.set $l137
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                (f32x4.demote_f64x2_zero
                                  (local.get $l137))
                                (f32x4.demote_f64x2_zero
                                  (local.get $l132))))
                            (br $B163))
                          (local.set $l137
                            (call $fma4_tie
                              (local.get $l149)
                              (local.get $l140)
                              (local.get $l54))))
                        (local.set $l132
                          (i32x4.max_u
                            (local.get $l141)
                            (local.get $l135)))
                        (local.set $l143
                          (i32x4.min_s
                            (local.get $l139)
                            (local.get $l135)))
                        (local.set $l54
                          (v128.and
                            (local.get $l147)
                            (local.get $l145)))
                        (block $B165
                          (br_if $B165
                            (i32.lt_s
                              (local.get $p11)
                              (i32.const 0)))
                          (v128.store align=1
                            (local.get $p9)
                            (f32x4.add
                              (f32x4.add
                                (local.get $l146)
                                (local.get $l137))
                              (local.get $l138))))
                        (local.set $l135
                          (i32x4.max_u
                            (local.get $l132)
                            (local.get $l54)))
                        (local.set $l54
                          (i32x4.min_s
                            (local.get $l143)
                            (local.get $l54)))
                        (v128.store offset=1648
                          (local.get $l24)
                          (local.get $l131))
                        (v128.store offset=1632
                          (local.get $l24)
                          (local.get $l130))
                        (local.set $p10
                          (i32.add
                            (local.get $p10)
                            (i32.const 16)))
                        (local.set $p9
                          (i32.add
                            (local.get $p9)
                            (i32.const 16)))
                        (local.set $l147
                          (local.get $l140))
                        (local.set $l131
                          (local.get $l146))
                        (local.set $l130
                          (local.get $l138))
                        (br_if $L156
                          (i32.ne
                            (local.tee $p11
                              (i32.add
                                (local.get $p11)
                                (i32.const 1)))
                            (local.get $l58))))
                      (v128.store offset=1680
                        (local.get $l24)
                        (local.get $l138))
                      (v128.store offset=1664
                        (local.get $l24)
                        (local.get $l140))
                      (v128.store offset=1440
                        (local.get $l24)
                        (local.get $l138))
                      (v128.store offset=1696
                        (local.get $l24)
                        (local.get $l146))
                      (v128.store offset=1504
                        (local.get $l24)
                        (local.get $l146))
                      (v128.store offset=1712
                        (local.get $l24)
                        (local.get $l137))
                      (v128.store offset=1568
                        (local.get $l24)
                        (local.get $l137))
                      (local.set $l52
                        (local.get $l58)))
                    (block $B166
                      (br_if $B166
                        (i32.ge_s
                          (local.get $l52)
                          (local.get $l42)))
                      (loop $L167
                        (local.set $l145
                          (f32x4.add
                            (v128.load align=1
                              (i32.add
                                (local.tee $p11
                                  (i32.add
                                    (local.get $l39)
                                    (local.tee $l53
                                      (i32.shl
                                        (local.get $l52)
                                        (i32.const 4)))))
                                (i32.const -96)))
                            (v128.load align=1
                              (i32.add
                                (local.get $p11)
                                (i32.const 64)))))
                        (local.set $l147
                          (f32x4.mul
                            (local.tee $l152
                              (f32x4.add
                                (v128.load align=1
                                  (i32.add
                                    (local.tee $p11
                                      (i32.add
                                        (local.get $l39)
                                        (local.tee $l44
                                          (i32.add
                                            (local.get $l53)
                                            (i32.const 16)))))
                                    (i32.const -96)))
                                (v128.load align=1
                                  (i32.add
                                    (local.get $p11)
                                    (i32.const 64)))))
                            (local.tee $l137
                              (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))))
                        (local.set $l141
                          (f32x4.mul
                            (local.tee $l155
                              (f32x4.add
                                (v128.load align=1
                                  (i32.add
                                    (local.tee $p11
                                      (i32.add
                                        (local.get $l39)
                                        (local.tee $l45
                                          (i32.add
                                            (local.get $l53)
                                            (i32.const 32)))))
                                    (i32.const -96)))
                                (v128.load align=1
                                  (i32.add
                                    (local.get $p11)
                                    (i32.const 64)))))
                            (local.get $l137)))
                        (local.set $l139
                          (f32x4.mul
                            (local.tee $l157
                              (f32x4.add
                                (v128.load align=1
                                  (i32.add
                                    (local.tee $p11
                                      (i32.add
                                        (local.get $l39)
                                        (local.tee $l46
                                          (i32.add
                                            (local.get $l53)
                                            (i32.const 48)))))
                                    (i32.const -96)))
                                (v128.load align=1
                                  (i32.add
                                    (local.get $p11)
                                    (i32.const 64)))))
                            (local.get $l137)))
                        (local.set $l156
                          (f64x2.promote_low_f32x4
                            (local.get $l157)))
                        (local.set $l153
                          (f64x2.promote_low_f32x4
                            (local.get $l155)))
                        (local.set $l148
                          (f64x2.promote_low_f32x4
                            (local.get $l152)))
                        (local.set $l158
                          (f64x2.promote_low_f32x4
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                              (local.get $l157)
                              (local.get $l157))))
                        (local.set $l154
                          (f64x2.promote_low_f32x4
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                              (local.get $l155)
                              (local.get $l155))))
                        (local.set $l149
                          (f64x2.promote_low_f32x4
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                              (local.get $l152)
                              (local.get $l152))))
                        (local.set $l49
                          (i32.add
                            (local.get $l24)
                            (i32.const 288)))
                        (local.set $l36
                          (i32.const 0))
                        (local.set $l37
                          (local.get $l59))
                        (local.set $l38
                          (i32.const 0))
                        (loop $L168
                          (local.set $l41
                            (i32.add
                              (i32.add
                                (local.get $l24)
                                (i32.const 1632))
                              (local.tee $p11
                                (i32.shl
                                  (local.get $l38)
                                  (i32.const 4)))))
                          (local.set $l30
                            (i32.add
                              (i32.add
                                (local.get $l24)
                                (i32.const 272))
                              (i32.shl
                                (local.get $l38)
                                (i32.const 2))))
                          (local.set $l143
                            (f64x2.promote_low_f32x4
                              (local.tee $l144
                                (v128.load
                                  (i32.add
                                    (i32.add
                                      (local.get $l24)
                                      (i32.const 1680))
                                    (local.get $p11))))))
                          (local.set $l142
                            (f64x2.promote_low_f32x4
                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                (local.get $l144)
                                (local.get $l144))))
                          (local.set $p11
                            (i32.const -128))
                          (local.set $p10
                            (local.get $l36))
                          (local.set $p9
                            (local.get $l37))
                          (local.set $l48
                            (i32.const 0))
                          (loop $L169
                            (local.set $l137
                              (f32x4.mul
                                (local.get $l145)
                                (v128.load32_splat
                                  (local.get $p9))))
                            (block $B170
                              (block $B171
                                (block $B172
                                  (block $B173
                                    (block $B174
                                      (br_if $B174
                                        (i32.eq
                                          (local.get $p11)
                                          (i32.const -128)))
                                      (local.set $l140
                                        (v128.and
                                          (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                            (local.tee $l130
                                              (f64x2.add
                                                (f64x2.mul
                                                  (local.tee $l140
                                                    (v128.load
                                                      (i32.add
                                                        (local.tee $l50
                                                          (i32.add
                                                            (local.get $l49)
                                                            (local.get $p11)))
                                                        (i32.const 112))))
                                                  (local.get $l148))
                                                (f64x2.promote_low_f32x4
                                                  (local.get $l137))))
                                            (local.tee $l131
                                              (f64x2.add
                                                (f64x2.mul
                                                  (local.get $l140)
                                                  (local.get $l149))
                                                (f64x2.promote_low_f32x4
                                                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                    (local.get $l137)
                                                    (local.get $l137))))))
                                          (local.tee $l132
                                            (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
                                      (br_if $B173
                                        (v128.any_true
                                          (i32x4.eq
                                            (v128.and
                                              (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                                (local.get $l130)
                                                (local.get $l131))
                                              (local.tee $l138
                                                (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                                            (local.tee $l146
                                              (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
                                      (local.set $l137
                                        (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                          (f32x4.demote_f64x2_zero
                                            (local.get $l130))
                                          (f32x4.demote_f64x2_zero
                                            (local.get $l131))))
                                      (br $B172))
                                    (local.set $l137
                                      (f32x4.add
                                        (local.get $l139)
                                        (f32x4.add
                                          (local.get $l141)
                                          (f32x4.add
                                            (local.get $l147)
                                            (local.get $l137)))))
                                    (br_if $B171
                                      (i32.eqz
                                        (i32.load
                                          (local.get $l30))))
                                    (local.set $l137
                                      (f32x4.sub
                                        (local.get $l137)
                                        (v128.load
                                          (local.get $l41))))
                                    (br $B170))
                                  (local.set $l137
                                    (call $fma4_tie
                                      (v128.load32_splat
                                        (i32.add
                                          (local.get $l50)
                                          (i32.const 96)))
                                      (local.get $l152)
                                      (local.get $l137))))
                                (local.set $l135
                                  (i32x4.max_s
                                    (local.get $l135)
                                    (local.get $l140)))
                                (local.set $l54
                                  (i32x4.min_s
                                    (local.get $l54)
                                    (local.get $l140)))
                                (block $B175
                                  (block $B176
                                    (br_if $B176
                                      (i32.eq
                                        (local.get $p11)
                                        (i32.const -96)))
                                    (local.set $l140
                                      (v128.and
                                        (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                          (local.tee $l130
                                            (f64x2.add
                                              (f64x2.mul
                                                (local.tee $l140
                                                  (v128.load
                                                    (i32.add
                                                      (local.get $l50)
                                                      (i32.const 80))))
                                                (local.get $l153))
                                              (f64x2.promote_low_f32x4
                                                (local.get $l137))))
                                          (local.tee $l131
                                            (f64x2.add
                                              (f64x2.mul
                                                (local.get $l140)
                                                (local.get $l154))
                                              (f64x2.promote_low_f32x4
                                                (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                  (local.get $l137)
                                                  (local.get $l137))))))
                                        (local.get $l132)))
                                    (block $B177
                                      (block $B178
                                        (br_if $B178
                                          (v128.any_true
                                            (i32x4.eq
                                              (v128.and
                                                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                                  (local.get $l130)
                                                  (local.get $l131))
                                                (local.get $l138))
                                              (local.get $l146))))
                                        (local.set $l137
                                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                            (f32x4.demote_f64x2_zero
                                              (local.get $l130))
                                            (f32x4.demote_f64x2_zero
                                              (local.get $l131))))
                                        (br $B177))
                                      (local.set $l137
                                        (call $fma4_tie
                                          (v128.load32_splat
                                            (i32.add
                                              (local.get $l50)
                                              (i32.const 64)))
                                          (local.get $l155)
                                          (local.get $l137))))
                                    (local.set $l135
                                      (i32x4.max_u
                                        (local.get $l135)
                                        (local.get $l140)))
                                    (local.set $l54
                                      (i32x4.min_s
                                        (local.get $l54)
                                        (local.get $l140)))
                                    (block $B179
                                      (br_if $B179
                                        (i32.gt_u
                                          (local.get $l48)
                                          (i32.const 2)))
                                      (local.set $l137
                                        (f32x4.add
                                          (local.get $l139)
                                          (local.get $l137)))
                                      (br $B171))
                                    (local.set $l135
                                      (i32x4.max_u
                                        (local.get $l135)
                                        (local.tee $l131
                                          (v128.and
                                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                              (local.tee $l140
                                                (f64x2.add
                                                  (f64x2.mul
                                                    (local.tee $l130
                                                      (v128.load
                                                        (i32.add
                                                          (local.get $l50)
                                                          (i32.const 48))))
                                                    (local.get $l156))
                                                  (f64x2.promote_low_f32x4
                                                    (local.get $l137))))
                                              (local.tee $l130
                                                (f64x2.add
                                                  (f64x2.mul
                                                    (local.get $l130)
                                                    (local.get $l158))
                                                  (f64x2.promote_low_f32x4
                                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                      (local.get $l137)
                                                      (local.get $l137))))))
                                            (local.get $l132)))))
                                    (local.set $l54
                                      (i32x4.min_s
                                        (local.get $l54)
                                        (local.get $l131)))
                                    (br_if $B175
                                      (v128.any_true
                                        (i32x4.eq
                                          (v128.and
                                            (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                              (local.get $l140)
                                              (local.get $l130))
                                            (local.get $l138))
                                          (local.get $l146))))
                                    (local.set $l137
                                      (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                        (f32x4.demote_f64x2_zero
                                          (local.get $l140))
                                        (f32x4.demote_f64x2_zero
                                          (local.get $l130))))
                                    (br $B171))
                                  (local.set $l137
                                    (f32x4.add
                                      (local.get $l139)
                                      (f32x4.add
                                        (local.get $l141)
                                        (local.get $l137))))
                                  (br $B171))
                                (local.set $l137
                                  (call $fma4_tie
                                    (v128.load32_splat
                                      (i32.add
                                        (local.get $l50)
                                        (i32.const 32)))
                                    (local.get $l157)
                                    (local.get $l137))))
                              (local.set $l135
                                (i32x4.max_s
                                  (local.get $l135)
                                  (local.tee $l132
                                    (v128.and
                                      (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                        (local.tee $l130
                                          (f64x2.add
                                            (f64x2.mul
                                              (local.tee $l131
                                                (v128.load
                                                  (i32.add
                                                    (local.tee $l50
                                                      (i32.add
                                                        (local.get $l49)
                                                        (local.get $p11)))
                                                    (i32.const 400))))
                                              (f64x2.promote_low_f32x4
                                                (local.tee $l140
                                                  (v128.load
                                                    (local.get $l41)))))
                                            (f64x2.promote_low_f32x4
                                              (local.get $l137))))
                                        (local.tee $l131
                                          (f64x2.add
                                            (f64x2.mul
                                              (local.get $l131)
                                              (f64x2.promote_low_f32x4
                                                (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                  (local.get $l140)
                                                  (local.get $l140))))
                                            (f64x2.promote_low_f32x4
                                              (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                                (local.get $l137)
                                                (local.get $l137))))))
                                      (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000)))))
                              (local.set $l54
                                (i32x4.min_s
                                  (local.get $l54)
                                  (local.get $l132)))
                              (block $B180
                                (br_if $B180
                                  (v128.any_true
                                    (i32x4.eq
                                      (v128.and
                                        (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                          (local.get $l130)
                                          (local.get $l131))
                                        (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff))
                                      (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000))))
                                (local.set $l137
                                  (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                    (f32x4.demote_f64x2_zero
                                      (local.get $l130))
                                    (f32x4.demote_f64x2_zero
                                      (local.get $l131))))
                                (br $B170))
                              (local.set $l137
                                (call $fma4_tie
                                  (v128.load32_splat
                                    (i32.add
                                      (local.get $l50)
                                      (i32.const 384)))
                                  (local.get $l140)
                                  (local.get $l137))))
                            (local.set $l140
                              (v128.and
                                (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                                  (local.tee $l130
                                    (f64x2.add
                                      (f64x2.mul
                                        (local.tee $l140
                                          (v128.load
                                            (i32.add
                                              (local.tee $l50
                                                (i32.add
                                                  (local.get $l49)
                                                  (local.get $p11)))
                                              (i32.const 272))))
                                        (local.get $l143))
                                      (f64x2.promote_low_f32x4
                                        (local.get $l137))))
                                  (local.tee $l131
                                    (f64x2.add
                                      (f64x2.mul
                                        (local.get $l140)
                                        (local.get $l142))
                                      (f64x2.promote_low_f32x4
                                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                          (local.get $l137)
                                          (local.get $l137))))))
                                (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000)))
                            (block $B181
                              (block $B182
                                (br_if $B182
                                  (v128.any_true
                                    (i32x4.eq
                                      (v128.and
                                        (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                          (local.get $l130)
                                          (local.get $l131))
                                        (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff))
                                      (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000))))
                                (local.set $l137
                                  (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                    (f32x4.demote_f64x2_zero
                                      (local.get $l130))
                                    (f32x4.demote_f64x2_zero
                                      (local.get $l131))))
                                (br $B181))
                              (local.set $l137
                                (call $fma4_tie
                                  (v128.load32_splat
                                    (i32.add
                                      (local.get $l50)
                                      (i32.const 256)))
                                  (local.get $l144)
                                  (local.get $l137))))
                            (local.set $l135
                              (i32x4.max_s
                                (local.get $l135)
                                (local.get $l140)))
                            (local.set $l54
                              (i32x4.min_s
                                (local.get $l54)
                                (local.get $l140)))
                            (v128.store
                              (i32.add
                                (i32.add
                                  (local.get $l24)
                                  (i32.const 1440))
                                (local.get $p10))
                              (local.get $l137))
                            (local.set $p10
                              (i32.add
                                (local.get $p10)
                                (i32.const 16)))
                            (local.set $p9
                              (i32.add
                                (local.get $p9)
                                (i32.const 4)))
                            (local.set $l48
                              (i32.add
                                (local.get $l48)
                                (i32.const 1)))
                            (br_if $L169
                              (local.tee $p11
                                (i32.add
                                  (local.get $p11)
                                  (i32.const 32)))))
                          (local.set $l36
                            (i32.add
                              (local.get $l36)
                              (i32.const 64)))
                          (local.set $l37
                            (i32.add
                              (local.get $l37)
                              (i32.const 48)))
                          (local.set $l49
                            (i32.add
                              (local.get $l49)
                              (i32.const 384)))
                          (br_if $L168
                            (i32.ne
                              (local.tee $l38
                                (i32.add
                                  (local.get $l38)
                                  (i32.const 1)))
                              (i32.const 3))))
                        (v128.store align=1
                          (i32.add
                            (local.get $l40)
                            (local.get $l53))
                          (f32x4.add
                            (v128.load offset=1440
                              (local.get $l24))
                            (f32x4.add
                              (v128.load offset=1504
                                (local.get $l24))
                              (v128.load offset=1568
                                (local.get $l24)))))
                        (v128.store align=1
                          (i32.add
                            (local.get $l40)
                            (local.get $l44))
                          (f32x4.add
                            (v128.load offset=1456
                              (local.get $l24))
                            (f32x4.add
                              (v128.load offset=1520
                                (local.get $l24))
                              (v128.load offset=1584
                                (local.get $l24)))))
                        (v128.store align=1
                          (i32.add
                            (local.get $l40)
                            (local.get $l45))
                          (f32x4.add
                            (local.tee $l130
                              (v128.load offset=1472
                                (local.get $l24)))
                            (f32x4.add
                              (local.tee $l131
                                (v128.load offset=1536
                                  (local.get $l24)))
                              (local.tee $l140
                                (v128.load offset=1600
                                  (local.get $l24))))))
                        (v128.store align=1
                          (i32.add
                            (local.get $l40)
                            (local.get $l46))
                          (f32x4.add
                            (local.tee $l132
                              (v128.load offset=1488
                                (local.get $l24)))
                            (f32x4.add
                              (local.tee $l143
                                (v128.load offset=1552
                                  (local.get $l24)))
                              (local.tee $l137
                                (v128.load offset=1616
                                  (local.get $l24))))))
                        (v128.store offset=1632
                          (local.get $l24)
                          (local.get $l130))
                        (v128.store offset=1648
                          (local.get $l24)
                          (local.get $l131))
                        (v128.store offset=1680
                          (local.get $l24)
                          (local.get $l132))
                        (v128.store offset=1696
                          (local.get $l24)
                          (local.get $l143))
                        (v128.store offset=1664
                          (local.get $l24)
                          (local.get $l140))
                        (v128.store offset=1712
                          (local.get $l24)
                          (local.get $l137))
                        (br_if $L167
                          (i32.lt_s
                            (local.tee $l52
                              (i32.add
                                (local.get $l52)
                                (i32.const 4)))
                            (local.get $l42)))))
                    (block $B183
                      (br_if $B183
                        (i32.ge_s
                          (local.get $l52)
                          (local.get $p0)))
                      (local.set $p11
                        (i32.add
                          (local.get $l78)
                          (local.tee $p10
                            (i32.shl
                              (local.get $l52)
                              (i32.const 4)))))
                      (local.set $p10
                        (i32.add
                          (local.get $l76)
                          (local.get $p10)))
                      (local.set $l130
                        (v128.load offset=1696
                          (local.get $l24)))
                      (local.set $l131
                        (v128.load offset=1680
                          (local.get $l24)))
                      (local.set $l147
                        (v128.load32_splat offset=1184
                          (local.get $l24)))
                      (local.set $l148
                        (v128.load32_splat offset=800
                          (local.get $l24)))
                      (local.set $l149
                        (v128.load32_splat offset=416
                          (local.get $l24)))
                      (loop $L184
                        (local.set $l143
                          (local.tee $l132
                            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                        (block $B185
                          (br_if $B185
                            (i32.lt_s
                              (local.get $l52)
                              (i32.const 6)))
                          (local.set $l143
                            (v128.load align=1
                              (i32.add
                                (local.get $p10)
                                (i32.const -160)))))
                        (block $B186
                          (br_if $B186
                            (i32.ge_s
                              (local.tee $p9
                                (i32.add
                                  (local.get $l52)
                                  (i32.const 4)))
                              (local.get $p0)))
                          (local.set $l132
                            (v128.load align=1
                              (local.get $p10))))
                        (local.set $l145
                          (v128.and
                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                              (local.tee $l146
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l159)
                                    (f64x2.promote_low_f32x4
                                      (local.get $l131)))
                                  (f64x2.promote_low_f32x4
                                    (local.tee $l132
                                      (f32x4.sub
                                        (f32x4.mul
                                          (local.tee $l143
                                            (f32x4.add
                                              (local.get $l143)
                                              (local.get $l132)))
                                          (v128.load32_splat offset=24
                                            (local.get $p8)))
                                        (v128.load offset=1632
                                          (local.get $l24)))))))
                              (local.tee $l141
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l159)
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l131)
                                        (local.get $l131))))
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l132)
                                      (local.get $l132))))))
                            (local.tee $l142
                              (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
                        (block $B187
                          (block $B188
                            (br_if $B188
                              (v128.any_true
                                (i32x4.eq
                                  (v128.and
                                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                      (local.get $l146)
                                      (local.get $l141))
                                    (local.tee $l139
                                      (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                                  (local.tee $l138
                                    (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
                            (local.set $l132
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                (f32x4.demote_f64x2_zero
                                  (local.get $l146))
                                (f32x4.demote_f64x2_zero
                                  (local.get $l141))))
                            (br $B187))
                          (local.set $l132
                            (call $fma4_tie
                              (local.get $l149)
                              (local.get $l131)
                              (local.get $l132))))
                        (local.set $l141
                          (i32x4.max_s
                            (local.get $l135)
                            (local.get $l145)))
                        (local.set $l144
                          (i32x4.min_s
                            (local.get $l54)
                            (local.get $l145)))
                        (local.set $l135
                          (v128.and
                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                              (local.tee $l145
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l133)
                                    (f64x2.promote_low_f32x4
                                      (local.get $l130)))
                                  (f64x2.promote_low_f32x4
                                    (local.tee $l54
                                      (f32x4.sub
                                        (f32x4.mul
                                          (local.get $l143)
                                          (v128.load32_splat offset=72
                                            (local.get $p8)))
                                        (v128.load offset=1648
                                          (local.get $l24)))))))
                              (local.tee $l146
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l133)
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l130)
                                        (local.get $l130))))
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l54)
                                      (local.get $l54))))))
                            (local.get $l142)))
                        (block $B189
                          (block $B190
                            (br_if $B190
                              (v128.any_true
                                (i32x4.eq
                                  (v128.and
                                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                      (local.get $l145)
                                      (local.get $l146))
                                    (local.get $l139))
                                  (local.get $l138))))
                            (local.set $l145
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                (f32x4.demote_f64x2_zero
                                  (local.get $l145))
                                (f32x4.demote_f64x2_zero
                                  (local.get $l146))))
                            (br $B189))
                          (local.set $l145
                            (call $fma4_tie
                              (local.get $l148)
                              (local.get $l130)
                              (local.get $l54))))
                        (local.set $l146
                          (i32x4.max_u
                            (local.get $l141)
                            (local.get $l135)))
                        (local.set $l141
                          (i32x4.min_s
                            (local.get $l144)
                            (local.get $l135)))
                        (local.set $l140
                          (v128.and
                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                              (local.tee $l135
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l134)
                                    (f64x2.promote_low_f32x4
                                      (local.get $l137)))
                                  (f64x2.promote_low_f32x4
                                    (local.tee $l54
                                      (f32x4.sub
                                        (f32x4.mul
                                          (local.get $l143)
                                          (v128.load32_splat offset=120
                                            (local.get $p8)))
                                        (local.get $l140))))))
                              (local.tee $l143
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l134)
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l137)
                                        (local.get $l137))))
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l54)
                                      (local.get $l54))))))
                            (local.get $l142)))
                        (block $B191
                          (block $B192
                            (br_if $B192
                              (v128.any_true
                                (i32x4.eq
                                  (v128.and
                                    (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                      (local.get $l135)
                                      (local.get $l143))
                                    (local.get $l139))
                                  (local.get $l138))))
                            (local.set $l143
                              (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                                (f32x4.demote_f64x2_zero
                                  (local.get $l135))
                                (f32x4.demote_f64x2_zero
                                  (local.get $l143))))
                            (br $B191))
                          (local.set $l143
                            (call $fma4_tie
                              (local.get $l147)
                              (local.get $l137)
                              (local.get $l54))))
                        (local.set $l135
                          (i32x4.max_u
                            (local.get $l146)
                            (local.get $l140)))
                        (local.set $l54
                          (i32x4.min_s
                            (local.get $l141)
                            (local.get $l140)))
                        (v128.store align=1
                          (local.get $p11)
                          (f32x4.add
                            (f32x4.add
                              (local.get $l145)
                              (local.get $l143))
                            (local.get $l132)))
                        (v128.store offset=1648
                          (local.get $l24)
                          (local.get $l130))
                        (v128.store offset=1632
                          (local.get $l24)
                          (local.get $l131))
                        (local.set $p11
                          (i32.add
                            (local.get $p11)
                            (i32.const 16)))
                        (local.set $p10
                          (i32.add
                            (local.get $p10)
                            (i32.const 16)))
                        (local.set $l140
                          (local.get $l137))
                        (local.set $l137
                          (local.get $l143))
                        (local.set $l130
                          (local.get $l145))
                        (local.set $l131
                          (local.get $l132))
                        (br_if $L184
                          (i32.ne
                            (local.tee $l52
                              (i32.add
                                (local.get $p9)
                                (i32.const -3)))
                            (local.get $p0)))))
                    (block $B193
                      (br_if $B193
                        (i32.eqz
                          (v128.any_true
                            (v128.or
                              (i32x4.lt_s
                                (local.get $l54)
                                (v128.const i32x4 0x38100000 0x38100000 0x38100000 0x38100000))
                              (i32x4.gt_u
                                (local.get $l135)
                                (v128.const i32x4 0x47e00000 0x47e00000 0x47e00000 0x47e00000))))))
                      (call $blur_lane
                        (local.get $l39)
                        (local.get $l40)
                        (local.get $p0)
                        (local.get $p8)
                        (i32.const 0))
                      (call $blur_lane
                        (local.get $l39)
                        (local.get $l40)
                        (local.get $p0)
                        (local.get $p8)
                        (i32.const 1))
                      (call $blur_lane
                        (local.get $l39)
                        (local.get $l40)
                        (local.get $p0)
                        (local.get $p8)
                        (i32.const 2))
                      (call $blur_lane
                        (local.get $l39)
                        (local.get $l40)
                        (local.get $p0)
                        (local.get $p8)
                        (i32.const 3)))
                    (local.set $l48
                      (i32.const 0))
                    (block $B194
                      (br_if $B194
                        (local.get $l129))
                      (local.set $l50
                        (i32.const 0))
                      (local.set $p11
                        (i32.const 4))
                      (loop $L195
                        (local.set $l48
                          (local.get $p11))
                        (v128.store offset=336
                          (local.get $l24)
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
                            (local.tee $l137
                              (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                                (local.tee $l54
                                  (v128.load align=1
                                    (local.tee $p11
                                      (i32.add
                                        (local.get $l40)
                                        (i32.shl
                                          (local.get $l50)
                                          (i32.const 4))))))
                                (local.tee $l135
                                  (v128.load offset=16 align=1
                                    (local.get $p11)))))
                            (local.tee $l131
                              (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                                (local.tee $l140
                                  (v128.load offset=32 align=1
                                    (local.get $p11)))
                                (local.tee $l130
                                  (v128.load offset=48 align=1
                                    (local.get $p11)))))))
                        (v128.store offset=320
                          (local.get $l24)
                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                            (local.get $l137)
                            (local.get $l131)))
                        (v128.store offset=304
                          (local.get $l24)
                          (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
                            (local.tee $l54
                              (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                                (local.get $l54)
                                (local.get $l135)))
                            (local.tee $l135
                              (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                                (local.get $l140)
                                (local.get $l130)))))
                        (v128.store offset=288
                          (local.get $l24)
                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                            (local.get $l54)
                            (local.get $l135)))
                        (local.set $p9
                          (i32.const 0))
                        (block $B196
                          (block $B197
                            (br_if $B197
                              (i32.eqz
                                (local.get $l33)))
                            (local.set $p9
                              (i32.const 0))
                            (local.set $p11
                              (local.get $l24))
                            (local.set $p10
                              (i32.add
                                (local.get $l24)
                                (i32.const 288)))
                            (loop $L198
                              (v128.store align=1
                                (i32.add
                                  (i32.load
                                    (local.get $p11))
                                  (local.tee $l49
                                    (i32.shl
                                      (local.get $l50)
                                      (i32.const 2))))
                                (v128.load
                                  (local.get $p10)))
                              (v128.store align=1
                                (i32.add
                                  (i32.load
                                    (i32.add
                                      (local.get $p11)
                                      (i32.const 4)))
                                  (local.get $l49))
                                (v128.load
                                  (i32.add
                                    (local.get $p10)
                                    (i32.const 16))))
                              (local.set $p10
                                (i32.add
                                  (local.get $p10)
                                  (i32.const 32)))
                              (local.set $p11
                                (i32.add
                                  (local.get $p11)
                                  (i32.const 8)))
                              (br_if $L198
                                (i32.ne
                                  (local.get $l35)
                                  (local.tee $p9
                                    (i32.add
                                      (local.get $p9)
                                      (i32.const 2))))))
                            (br_if $B196
                              (i32.eqz
                                (local.get $l43))))
                          (v128.store align=1
                            (i32.add
                              (i32.load
                                (i32.add
                                  (local.get $l24)
                                  (i32.shl
                                    (local.get $p9)
                                    (i32.const 2))))
                              (i32.shl
                                (local.get $l50)
                                (i32.const 2)))
                            (v128.load
                              (i32.add
                                (i32.add
                                  (local.get $l24)
                                  (i32.const 288))
                                (i32.shl
                                  (local.get $p9)
                                  (i32.const 4))))))
                        (local.set $l50
                          (local.get $l48))
                        (br_if $L195
                          (i32.le_s
                            (local.tee $p11
                              (i32.add
                                (local.get $l48)
                                (i32.const 4)))
                            (local.get $p0)))))
                    (br_if $B132
                      (i32.ge_s
                        (local.get $l48)
                        (local.get $p0)))
                    (local.set $l50
                      (i32.add
                        (local.get $l78)
                        (i32.shl
                          (local.get $l48)
                          (i32.const 4))))
                    (loop $L199
                      (local.set $p11
                        (i32.const 0))
                      (block $B200
                        (block $B201
                          (br_if $B201
                            (i32.lt_u
                              (local.get $l33)
                              (i32.const 3)))
                          (local.set $l49
                            (i32.const 0))
                          (local.set $p11
                            (local.get $l24))
                          (local.set $p10
                            (local.get $l50))
                          (loop $L202
                            (f32.store
                              (i32.add
                                (i32.load
                                  (local.get $p11))
                                (local.tee $p9
                                  (i32.shl
                                    (local.get $l48)
                                    (i32.const 2))))
                              (f32.load
                                (local.get $p10)))
                            (f32.store
                              (i32.add
                                (i32.load
                                  (i32.add
                                    (local.get $p11)
                                    (i32.const 4)))
                                (local.get $p9))
                              (f32.load
                                (i32.add
                                  (local.get $p10)
                                  (i32.const 4))))
                            (f32.store
                              (i32.add
                                (i32.load
                                  (i32.add
                                    (local.get $p11)
                                    (i32.const 8)))
                                (local.get $p9))
                              (f32.load
                                (i32.add
                                  (local.get $p10)
                                  (i32.const 8))))
                            (f32.store
                              (i32.add
                                (i32.load
                                  (i32.add
                                    (local.get $p11)
                                    (i32.const 12)))
                                (local.get $p9))
                              (f32.load
                                (i32.add
                                  (local.get $p10)
                                  (i32.const 12))))
                            (local.set $p10
                              (i32.add
                                (local.get $p10)
                                (i32.const 16)))
                            (local.set $p11
                              (i32.add
                                (local.get $p11)
                                (i32.const 16)))
                            (br_if $L202
                              (i32.ne
                                (local.get $l51)
                                (local.tee $l49
                                  (i32.add
                                    (local.get $l49)
                                    (i32.const -4))))))
                          (br_if $B200
                            (i32.eqz
                              (local.get $l34)))
                          (local.set $p11
                            (i32.sub
                              (i32.const 0)
                              (local.get $l49))))
                        (local.set $p11
                          (i32.shl
                            (local.get $p11)
                            (i32.const 2)))
                        (local.set $p10
                          (local.get $l34))
                        (loop $L203
                          (f32.store
                            (i32.add
                              (i32.load
                                (i32.add
                                  (local.get $l24)
                                  (local.get $p11)))
                              (i32.shl
                                (local.get $l48)
                                (i32.const 2)))
                            (f32.load
                              (i32.add
                                (local.get $l50)
                                (local.get $p11))))
                          (local.set $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const 4)))
                          (br_if $L203
                            (local.tee $p10
                              (i32.add
                                (local.get $p10)
                                (i32.const -1))))))
                      (local.set $l50
                        (i32.add
                          (local.get $l50)
                          (i32.const 16)))
                      (br_if $L199
                        (i32.ne
                          (local.tee $l48
                            (i32.add
                              (local.get $l48)
                              (i32.const 1)))
                          (local.get $p0)))))
                  (br_if $L131
                    (i32.ne
                      (local.tee $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 1)))
                      (i32.const 5)))))
              (br_if $L113
                (i32.ne
                  (local.tee $l176
                    (i32.add
                      (local.get $l176)
                      (i32.const 1)))
                  (i32.const 3))))
            (br_if $B42
              (i32.ge_s
                (local.tee $p23
                  (i32.add
                    (local.get $l123)
                    (local.get $p23)))
                (local.get $p1)))
            (br_if $L43
              (i32.le_s
                (local.get $p23)
                (local.get $l122)))))
        (local.set $p11
          (i32.mul
            (i32.and
              (i32.add
                (local.get $p19)
                (i32.const 10))
              (i32.const 15))
            (local.get $p0)))
        (local.set $l38
          (i32.const -1))
        (block $B204
          (br_if $B204
            (i32.ge_s
              (local.get $l122)
              (local.get $p1)))
          (local.set $l38
            (i32.mul
              (i32.rem_s
                (local.get $l122)
                (i32.const 16))
              (local.get $p0))))
        (local.set $l179
          (i32.mul
            (local.get $l71)
            (local.get $l121)))
        (local.set $l124
          (i32.add
            (local.get $l119)
            (local.tee $p10
              (i32.mul
                (local.get $l70)
                (local.get $l121)))))
        (local.set $l166
          (i32.add
            (local.get $l80)
            (local.get $p10)))
        (local.set $l127
          (i32.mul
            (local.get $l70)
            (i32.and
              (local.get $l118)
              (i32.const 15))))
        (local.set $l51
          (select
            (local.get $p11)
            (i32.const -1)
            (i32.gt_s
              (local.get $p19)
              (i32.const 5))))
        (local.set $l126
          (i32.mul
            (local.get $p19)
            (local.get $p0)))
        (local.set $l52
          (i32.shr_u
            (i32.xor
              (local.get $p19)
              (i32.const -1))
            (i32.const 31)))
        (local.set $p15
          (i32.const 0))
        (local.set $l129
          (i32.shl
            (i32.mul
              (i32.and
                (local.get $p19)
                (i32.const 15))
              (local.get $p0))
            (i32.const 2)))
        (local.set $l128
          (i32.shl
            (i32.mul
              (i32.add
                (local.get $p19)
                (local.get $p1))
              (local.get $p0))
            (i32.const 2)))
        (loop $L205
          (block $B206
            (br_if $B206
              (i32.eqz
                (i32.and
                  (local.tee $l125
                    (i32.shl
                      (i32.const 1)
                      (local.get $p15)))
                  (local.get $p2))))
            (local.set $p22
              (i32.add
                (i32.add
                  (local.get $l24)
                  (i32.const 48))
                (local.tee $p11
                  (i32.mul
                    (local.get $p15)
                    (i32.const 20)))))
            (local.set $l28
              (i32.add
                (i32.add
                  (local.get $l24)
                  (i32.const 112))
                (local.get $p11)))
            (local.set $p21
              (i32.add
                (i32.add
                  (local.get $l24)
                  (i32.const 176))
                (local.get $p11)))
            (local.set $l43
              (i32.const 0))
            (loop $L207
              (block $B208
                (br_if $B208
                  (i32.eqz
                    (local.tee $l35
                      (i32.load
                        (i32.add
                          (local.get $p21)
                          (local.tee $p11
                            (i32.shl
                              (local.get $l43)
                              (i32.const 2))))))))
                (local.set $l48
                  (i32.add
                    (local.tee $p9
                      (i32.load
                        (i32.add
                          (local.get $l28)
                          (local.get $p11))))
                    (local.get $l70)))
                (local.set $l49
                  (i32.add
                    (local.get $p9)
                    (local.get $l64)))
                (local.set $l50
                  (i32.add
                    (local.get $p9)
                    (local.get $l25)))
                (local.set $l41
                  (i32.add
                    (local.get $p9)
                    (local.get $l65)))
                (local.set $l30
                  (i32.add
                    (local.get $p9)
                    (local.get $l66)))
                (local.set $l37
                  (i32.load
                    (i32.add
                      (local.get $p22)
                      (local.get $p11))))
                (local.set $l36
                  (i32.const 0))
                (block $B209
                  (br_if $B209
                    (i32.lt_s
                      (local.get $p0)
                      (i32.const 4)))
                  (local.set $p13
                    (i32.add
                      (local.get $l35)
                      (i32.shl
                        (local.get $l38)
                        (i32.const 2))))
                  (local.set $l34
                    (i32.add
                      (local.get $l35)
                      (i32.shl
                        (local.get $l51)
                        (i32.const 2))))
                  (local.set $l158
                    (f32x4.splat
                      (local.tee $l163
                        (f32.load offset=8
                          (local.get $p8)))))
                  (local.set $l157
                    (f32x4.splat
                      (local.tee $l164
                        (f32.load offset=4
                          (local.get $p8)))))
                  (local.set $l159
                    (f32x4.splat
                      (local.tee $l165
                        (f32.load
                          (local.get $p8)))))
                  (local.set $l141
                    (f64x2.splat
                      (f64.promote_f32
                        (local.get $l163))))
                  (local.set $l133
                    (f32x4.splat
                      (local.tee $l163
                        (f32.neg
                          (f32.load offset=20
                            (local.get $p8))))))
                  (local.set $l144
                    (f64x2.splat
                      (f64.promote_f32
                        (local.get $l164))))
                  (local.set $l134
                    (f32x4.splat
                      (local.tee $l164
                        (f32.neg
                          (f32.load offset=16
                            (local.get $p8))))))
                  (local.set $l147
                    (f64x2.splat
                      (f64.promote_f32
                        (local.get $l165))))
                  (local.set $l136
                    (f32x4.splat
                      (local.tee $l165
                        (f32.neg
                          (f32.load offset=12
                            (local.get $p8))))))
                  (local.set $l148
                    (f64x2.splat
                      (f64.promote_f32
                        (local.get $l163))))
                  (local.set $l149
                    (f64x2.splat
                      (f64.promote_f32
                        (local.get $l164))))
                  (local.set $l152
                    (f64x2.splat
                      (f64.promote_f32
                        (local.get $l165))))
                  (local.set $p10
                    (i32.const 0))
                  (local.set $p11
                    (i32.const 0))
                  (loop $L210
                    (local.set $l137
                      (local.tee $l135
                        (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                    (block $B211
                      (br_if $B211
                        (i32.lt_s
                          (local.get $p19)
                          (i32.const 6)))
                      (local.set $l137
                        (v128.load align=1
                          (i32.add
                            (local.get $l34)
                            (local.get $p11)))))
                    (block $B212
                      (br_if $B212
                        (i32.lt_s
                          (local.get $l38)
                          (i32.const 0)))
                      (local.set $l135
                        (v128.load align=1
                          (i32.add
                            (local.get $p13)
                            (local.get $p11)))))
                    (local.set $l142
                      (v128.and
                        (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                          (local.tee $l145
                            (f64x2.add
                              (f64x2.mul
                                (local.get $l152)
                                (f64x2.promote_low_f32x4
                                  (local.tee $l143
                                    (v128.load align=1
                                      (local.tee $l36
                                        (i32.add
                                          (local.get $p9)
                                          (local.get $p11)))))))
                              (f64x2.promote_low_f32x4
                                (local.tee $l132
                                  (f32x4.neg
                                    (v128.load align=1
                                      (local.tee $l53
                                        (i32.add
                                          (local.get $l48)
                                          (local.get $p11)))))))))
                          (local.tee $l139
                            (f64x2.add
                              (f64x2.mul
                                (local.get $l152)
                                (f64x2.promote_low_f32x4
                                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                    (local.get $l143)
                                    (local.get $l143))))
                              (f64x2.promote_low_f32x4
                                (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                  (local.get $l132)
                                  (local.get $l132))))))
                        (local.tee $l54
                          (v128.const i32x4 0x7ff00000 0x7ff00000 0x7ff00000 0x7ff00000))))
                    (local.set $l140
                      (f32x4.add
                        (local.get $l137)
                        (local.get $l135)))
                    (local.set $l130
                      (v128.load align=1
                        (local.tee $l33
                          (i32.add
                            (local.get $l50)
                            (local.get $p11)))))
                    (local.set $l131
                      (v128.load align=1
                        (local.tee $l44
                          (i32.add
                            (local.get $l30)
                            (local.get $p11)))))
                    (block $B213
                      (block $B214
                        (br_if $B214
                          (v128.any_true
                            (i32x4.eq
                              (v128.and
                                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                  (local.get $l145)
                                  (local.get $l139))
                                (local.tee $l135
                                  (v128.const i32x4 0x1fffffff 0x1fffffff 0x1fffffff 0x1fffffff)))
                              (local.tee $l137
                                (v128.const i32x4 0x10000000 0x10000000 0x10000000 0x10000000)))))
                        (local.set $l132
                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                            (f32x4.demote_f64x2_zero
                              (local.get $l145))
                            (f32x4.demote_f64x2_zero
                              (local.get $l139))))
                        (br $B213))
                      (local.set $l132
                        (call $fma4_tie
                          (local.get $l136)
                          (local.get $l143)
                          (local.get $l132))))
                    (local.set $l154
                      (i32x4.max_u
                        (local.get $l142)
                        (local.tee $l153
                          (v128.and
                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                              (local.tee $l138
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l147)
                                    (local.tee $l145
                                      (f64x2.promote_low_f32x4
                                        (local.get $l140))))
                                  (f64x2.promote_low_f32x4
                                    (local.get $l132))))
                              (local.tee $l146
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l147)
                                    (local.tee $l139
                                      (f64x2.promote_low_f32x4
                                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                          (local.get $l140)
                                          (local.get $l140)))))
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l132)
                                      (local.get $l132))))))
                            (local.get $l54)))))
                    (local.set $l153
                      (i32x4.min_u
                        (local.get $l142)
                        (local.get $l153)))
                    (block $B215
                      (block $B216
                        (br_if $B216
                          (v128.any_true
                            (i32x4.eq
                              (v128.and
                                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                  (local.get $l138)
                                  (local.get $l146))
                                (local.get $l135))
                              (local.get $l137))))
                        (local.set $l155
                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                            (f32x4.demote_f64x2_zero
                              (local.get $l138))
                            (f32x4.demote_f64x2_zero
                              (local.get $l146))))
                        (br $B215))
                      (local.set $l155
                        (call $fma4_tie
                          (local.get $l159)
                          (local.get $l140)
                          (local.get $l132))))
                    (local.set $l154
                      (i32x4.max_u
                        (local.get $l154)
                        (local.tee $l146
                          (v128.and
                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                              (local.tee $l142
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l149)
                                    (f64x2.promote_low_f32x4
                                      (local.get $l131)))
                                  (f64x2.promote_low_f32x4
                                    (local.tee $l132
                                      (f32x4.neg
                                        (v128.load align=1
                                          (local.tee $l45
                                            (i32.add
                                              (local.get $l41)
                                              (local.get $p11)))))))))
                              (local.tee $l138
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l149)
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l131)
                                        (local.get $l131))))
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l132)
                                      (local.get $l132))))))
                            (local.get $l54)))))
                    (local.set $l146
                      (i32x4.min_u
                        (local.get $l153)
                        (local.get $l146)))
                    (block $B217
                      (block $B218
                        (br_if $B218
                          (v128.any_true
                            (i32x4.eq
                              (v128.and
                                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                  (local.get $l142)
                                  (local.get $l138))
                                (local.get $l135))
                              (local.get $l137))))
                        (local.set $l132
                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                            (f32x4.demote_f64x2_zero
                              (local.get $l142))
                            (f32x4.demote_f64x2_zero
                              (local.get $l138))))
                        (br $B217))
                      (local.set $l132
                        (call $fma4_tie
                          (local.get $l134)
                          (local.get $l131)
                          (local.get $l132))))
                    (local.set $l154
                      (i32x4.max_u
                        (local.get $l154)
                        (local.tee $l153
                          (v128.and
                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                              (local.tee $l142
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l144)
                                    (local.get $l145))
                                  (f64x2.promote_low_f32x4
                                    (local.get $l132))))
                              (local.tee $l138
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l144)
                                    (local.get $l139))
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l132)
                                      (local.get $l132))))))
                            (local.get $l54)))))
                    (local.set $l146
                      (i32x4.min_u
                        (local.get $l146)
                        (local.get $l153)))
                    (block $B219
                      (block $B220
                        (br_if $B220
                          (v128.any_true
                            (i32x4.eq
                              (v128.and
                                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                  (local.get $l142)
                                  (local.get $l138))
                                (local.get $l135))
                              (local.get $l137))))
                        (local.set $l156
                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                            (f32x4.demote_f64x2_zero
                              (local.get $l142))
                            (f32x4.demote_f64x2_zero
                              (local.get $l138))))
                        (br $B219))
                      (local.set $l156
                        (call $fma4_tie
                          (local.get $l157)
                          (local.get $l140)
                          (local.get $l132))))
                    (local.set $l154
                      (i32x4.max_u
                        (local.get $l154)
                        (local.tee $l153
                          (v128.and
                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                              (local.tee $l142
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l148)
                                    (f64x2.promote_low_f32x4
                                      (local.get $l130)))
                                  (f64x2.promote_low_f32x4
                                    (local.tee $l132
                                      (f32x4.neg
                                        (v128.load align=1
                                          (local.tee $l46
                                            (i32.add
                                              (local.get $l49)
                                              (local.get $p11)))))))))
                              (local.tee $l138
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l148)
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l130)
                                        (local.get $l130))))
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l132)
                                      (local.get $l132))))))
                            (local.get $l54)))))
                    (local.set $l146
                      (i32x4.min_u
                        (local.get $l146)
                        (local.get $l153)))
                    (block $B221
                      (block $B222
                        (br_if $B222
                          (v128.any_true
                            (i32x4.eq
                              (v128.and
                                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                  (local.get $l142)
                                  (local.get $l138))
                                (local.get $l135))
                              (local.get $l137))))
                        (local.set $l132
                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                            (f32x4.demote_f64x2_zero
                              (local.get $l142))
                            (f32x4.demote_f64x2_zero
                              (local.get $l138))))
                        (br $B221))
                      (local.set $l132
                        (call $fma4_tie
                          (local.get $l133)
                          (local.get $l130)
                          (local.get $l132))))
                    (local.set $l139
                      (i32x4.max_u
                        (local.get $l154)
                        (local.tee $l54
                          (v128.and
                            (i8x16.shuffle 4 5 6 7 12 13 14 15 20 21 22 23 28 29 30 31
                              (local.tee $l142
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l141)
                                    (local.get $l145))
                                  (f64x2.promote_low_f32x4
                                    (local.get $l132))))
                              (local.tee $l145
                                (f64x2.add
                                  (f64x2.mul
                                    (local.get $l141)
                                    (local.get $l139))
                                  (f64x2.promote_low_f32x4
                                    (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                      (local.get $l132)
                                      (local.get $l132))))))
                            (local.get $l54)))))
                    (local.set $l54
                      (i32x4.min_u
                        (local.get $l146)
                        (local.get $l54)))
                    (block $B223
                      (block $B224
                        (br_if $B224
                          (v128.any_true
                            (i32x4.eq
                              (v128.and
                                (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27
                                  (local.get $l142)
                                  (local.get $l145))
                                (local.get $l135))
                              (local.get $l137))))
                        (local.set $l135
                          (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                            (f32x4.demote_f64x2_zero
                              (local.get $l142))
                            (f32x4.demote_f64x2_zero
                              (local.get $l145))))
                        (br $B223))
                      (local.set $l135
                        (call $fma4_tie
                          (local.get $l158)
                          (local.get $l140)
                          (local.get $l132))))
                    (block $B225
                      (block $B226
                        (br_if $B226
                          (i32.eqz
                            (v128.any_true
                              (v128.or
                                (i32x4.lt_u
                                  (local.get $l54)
                                  (v128.const i32x4 0x38100000 0x38100000 0x38100000 0x38100000))
                                (i32x4.gt_u
                                  (local.get $l139)
                                  (v128.const i32x4 0x47e00000 0x47e00000 0x47e00000 0x47e00000))))))
                        (call $vertical_column
                          (local.get $l35)
                          (local.get $p9)
                          (local.get $l48)
                          (local.get $l30)
                          (local.get $l41)
                          (local.get $l50)
                          (local.get $l49)
                          (local.get $l37)
                          (local.get $p10)
                          (local.get $l51)
                          (local.get $l38)
                          (local.get $l52)
                          (local.get $p8))
                        (call $vertical_column
                          (local.get $l35)
                          (local.get $p9)
                          (local.get $l48)
                          (local.get $l30)
                          (local.get $l41)
                          (local.get $l50)
                          (local.get $l49)
                          (local.get $l37)
                          (i32.add
                            (local.get $p10)
                            (i32.const 1))
                          (local.get $l51)
                          (local.get $l38)
                          (local.get $l52)
                          (local.get $p8))
                        (call $vertical_column
                          (local.get $l35)
                          (local.get $p9)
                          (local.get $l48)
                          (local.get $l30)
                          (local.get $l41)
                          (local.get $l50)
                          (local.get $l49)
                          (local.get $l37)
                          (i32.add
                            (local.get $p10)
                            (i32.const 2))
                          (local.get $l51)
                          (local.get $l38)
                          (local.get $l52)
                          (local.get $p8))
                        (call $vertical_column
                          (local.get $l35)
                          (local.get $p9)
                          (local.get $l48)
                          (local.get $l30)
                          (local.get $l41)
                          (local.get $l50)
                          (local.get $l49)
                          (local.get $l37)
                          (i32.add
                            (local.get $p10)
                            (i32.const 3))
                          (local.get $l51)
                          (local.get $l38)
                          (local.get $l52)
                          (local.get $p8))
                        (br $B225))
                      (block $B227
                        (br_if $B227
                          (i32.lt_s
                            (local.get $p19)
                            (i32.const 0)))
                        (v128.store align=1
                          (i32.add
                            (local.get $l37)
                            (local.get $p11))
                          (f32x4.add
                            (f32x4.add
                              (local.get $l156)
                              (local.get $l135))
                            (local.get $l155))))
                      (v128.store align=1
                        (local.get $l53)
                        (local.get $l143))
                      (v128.store align=1
                        (local.get $l36)
                        (local.get $l155))
                      (v128.store align=1
                        (local.get $l45)
                        (local.get $l131))
                      (v128.store align=1
                        (local.get $l44)
                        (local.get $l156))
                      (v128.store align=1
                        (local.get $l46)
                        (local.get $l130))
                      (v128.store align=1
                        (local.get $l33)
                        (local.get $l135)))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const 16)))
                    (local.set $l53
                      (i32.add
                        (local.get $p10)
                        (i32.const 8)))
                    (local.set $p10
                      (local.tee $l36
                        (i32.add
                          (local.get $p10)
                          (i32.const 4))))
                    (br_if $L210
                      (i32.le_s
                        (local.get $l53)
                        (local.get $p0)))))
                (br_if $B208
                  (i32.ge_s
                    (local.get $l36)
                    (local.get $p0)))
                (loop $L228
                  (call $vertical_column
                    (local.get $l35)
                    (local.get $p9)
                    (local.get $l48)
                    (local.get $l30)
                    (local.get $l41)
                    (local.get $l50)
                    (local.get $l49)
                    (local.get $l37)
                    (local.get $l36)
                    (local.get $l51)
                    (local.get $l38)
                    (local.get $l52)
                    (local.get $p8))
                  (br_if $L228
                    (i32.ne
                      (local.get $p0)
                      (local.tee $l36
                        (i32.add
                          (local.get $l36)
                          (i32.const 1)))))))
              (br_if $L207
                (i32.ne
                  (local.tee $l43
                    (i32.add
                      (local.get $l43)
                      (i32.const 1)))
                  (i32.const 5))))
            (br_if $B206
              (i32.lt_s
                (local.get $p19)
                (i32.const 0)))
            (local.set $l41
              (i32.load
                (i32.add
                  (i32.add
                    (local.get $l24)
                    (i32.const 260))
                  (local.tee $l35
                    (i32.shl
                      (local.get $p15)
                      (i32.const 2))))))
            (block $B229
              (block $B230
                (br_if $B230
                  (i32.and
                    (local.get $l125)
                    (local.get $p12)))
                (block $B231
                  (br_if $B231
                    (i32.eqz
                      (local.get $l41)))
                  (br_if $B231
                    (i32.lt_s
                      (local.get $p0)
                      (i32.const 1)))
                  (local.set $p9
                    (i32.load offset=8
                      (local.get $p22)))
                  (local.set $p10
                    (i32.load
                      (local.get $p22)))
                  (local.set $l50
                    (i32.const 0))
                  (block $B232
                    (br_if $B232
                      (i32.lt_u
                        (local.get $p0)
                        (i32.const 12)))
                    (br_if $B232
                      (local.get $l117))
                    (br_if $B232
                      (i32.gt_u
                        (i32.sub
                          (local.get $p10)
                          (i32.add
                            (local.get $l166)
                            (local.get $l41)))
                        (i32.const -16)))
                    (br_if $B232
                      (i32.gt_u
                        (i32.sub
                          (i32.add
                            (local.get $l80)
                            (local.get $l41))
                          (i32.add
                            (local.get $l179)
                            (local.get $p9)))
                        (i32.const -16)))
                    (br_if $B232
                      (i32.gt_u
                        (i32.sub
                          (local.get $p10)
                          (local.tee $p11
                            (i32.add
                              (local.get $l124)
                              (local.get $l41))))
                        (i32.const -16)))
                    (br_if $B232
                      (i32.gt_u
                        (i32.sub
                          (local.get $p9)
                          (local.get $p11))
                        (i32.const -16)))
                    (local.set $p11
                      (i32.add
                        (local.get $l41)
                        (local.get $l57)))
                    (local.set $l48
                      (i32.add
                        (local.get $l41)
                        (local.get $l120)))
                    (local.set $l49
                      (local.get $p10))
                    (local.set $l50
                      (local.get $p9))
                    (local.set $l30
                      (local.get $l62))
                    (loop $L233
                      (v128.store align=4
                        (local.get $p11)
                        (v128.load align=4
                          (local.get $l49)))
                      (v128.store align=4
                        (local.get $l48)
                        (v128.load align=4
                          (local.get $l50)))
                      (local.set $l49
                        (i32.add
                          (local.get $l49)
                          (i32.const 16)))
                      (local.set $p11
                        (i32.add
                          (local.get $p11)
                          (i32.const 16)))
                      (local.set $l50
                        (i32.add
                          (local.get $l50)
                          (i32.const 16)))
                      (local.set $l48
                        (i32.add
                          (local.get $l48)
                          (i32.const 16)))
                      (br_if $L233
                        (local.tee $l30
                          (i32.add
                            (local.get $l30)
                            (i32.const -4)))))
                    (local.set $l50
                      (local.get $l62))
                    (br_if $B231
                      (i32.eq
                        (local.get $p0)
                        (local.get $l62))))
                  (local.set $p11
                    (i32.or
                      (local.get $l50)
                      (i32.const 1)))
                  (block $B234
                    (br_if $B234
                      (i32.eqz
                        (local.get $l61)))
                    (f32.store
                      (i32.add
                        (i32.add
                          (i32.add
                            (local.get $l41)
                            (local.get $l116))
                          (local.tee $l49
                            (i32.shl
                              (local.get $l126)
                              (i32.const 2))))
                        (local.tee $l48
                          (i32.shl
                            (local.get $l50)
                            (i32.const 2))))
                      (f32.load
                        (i32.add
                          (local.get $p10)
                          (local.get $l48))))
                    (f32.store
                      (i32.add
                        (i32.add
                          (i32.add
                            (local.get $l41)
                            (local.get $l63))
                          (local.get $l49))
                        (local.get $l48))
                      (f32.load
                        (i32.add
                          (local.get $p9)
                          (local.get $l48))))
                    (local.set $l50
                      (local.get $p11)))
                  (br_if $B231
                    (i32.eq
                      (local.get $p0)
                      (local.get $p11)))
                  (local.set $l48
                    (i32.add
                      (local.get $l41)
                      (local.get $l57)))
                  (local.set $l49
                    (i32.add
                      (local.get $l41)
                      (local.get $l120)))
                  (local.set $p11
                    (i32.shl
                      (local.get $l50)
                      (i32.const 2)))
                  (local.set $l50
                    (i32.sub
                      (local.get $p0)
                      (local.get $l50)))
                  (loop $L235
                    (f32.store
                      (local.tee $l41
                        (i32.add
                          (local.get $l48)
                          (local.get $p11)))
                      (f32.load
                        (local.tee $l30
                          (i32.add
                            (local.get $p10)
                            (local.get $p11)))))
                    (f32.store
                      (local.tee $l36
                        (i32.add
                          (local.get $l49)
                          (local.get $p11)))
                      (f32.load
                        (local.tee $l37
                          (i32.add
                            (local.get $p9)
                            (local.get $p11)))))
                    (f32.store
                      (i32.add
                        (local.get $l41)
                        (i32.const 4))
                      (f32.load
                        (i32.add
                          (local.get $l30)
                          (i32.const 4))))
                    (f32.store
                      (i32.add
                        (local.get $l36)
                        (i32.const 4))
                      (f32.load
                        (i32.add
                          (local.get $l37)
                          (i32.const 4))))
                    (local.set $p10
                      (i32.add
                        (local.get $p10)
                        (i32.const 8)))
                    (local.set $l48
                      (i32.add
                        (local.get $l48)
                        (i32.const 8)))
                    (local.set $p9
                      (i32.add
                        (local.get $p9)
                        (i32.const 8)))
                    (local.set $l49
                      (i32.add
                        (local.get $l49)
                        (i32.const 8)))
                    (br_if $L235
                      (local.tee $l50
                        (i32.add
                          (local.get $l50)
                          (i32.const -2))))))
                (local.set $l30
                  (i32.add
                    (i32.load
                      (i32.add
                        (i32.add
                          (local.get $l24)
                          (i32.const 248))
                        (local.get $l35)))
                    (local.get $l129)))
                (local.set $l41
                  (i32.const 0))
                (br $B229))
              (local.set $l30
                (i32.add
                  (local.get $l41)
                  (i32.shl
                    (local.get $l126)
                    (i32.const 2)))))
            (local.set $l181
              (f64.load offset=40
                (local.tee $l45
                  (i32.add
                    (local.get $p16)
                    (i32.mul
                      (local.get $p15)
                      (i32.const 48))))))
            (local.set $l182
              (f64.load offset=32
                (local.get $l45)))
            (local.set $l183
              (f64.load offset=24
                (local.get $l45)))
            (local.set $l184
              (f64.load offset=16
                (local.get $l45)))
            (local.set $l185
              (f64.load offset=8
                (local.get $l45)))
            (local.set $l186
              (f64.load
                (local.get $l45)))
            (local.set $l46
              (i32.load
                (i32.add
                  (i32.add
                    (local.get $l24)
                    (i32.const 236))
                  (local.get $l35))))
            (local.set $l50
              (i32.const 0))
            (block $B236
              (br_if $B236
                (i32.lt_s
                  (local.get $p0)
                  (i32.const 4)))
              (local.set $l36
                (i32.add
                  (i32.add
                    (local.get $l41)
                    (local.get $l63))
                  (local.tee $p11
                    (i32.shl
                      (local.get $l126)
                      (i32.const 2)))))
              (local.set $l37
                (i32.add
                  (i32.add
                    (local.get $l41)
                    (local.get $l116))
                  (local.get $p11)))
              (local.set $l35
                (i32.add
                  (local.get $l46)
                  (local.get $l127)))
              (local.set $l53
                (i32.load offset=12
                  (local.get $p22)))
              (local.set $l33
                (i32.load offset=16
                  (local.get $p22)))
              (local.set $l44
                (i32.load offset=4
                  (local.get $p22)))
              (local.set $l48
                (i32.const 0))
              (local.set $p10
                (local.get $l73))
              (local.set $p9
                (local.get $l74))
              (local.set $p11
                (i32.const 0))
              (loop $L237
                (local.set $l49
                  (local.get $l37))
                (local.set $l50
                  (local.get $l36))
                (block $B238
                  (br_if $B238
                    (local.get $l41))
                  (local.set $l50
                    (i32.load offset=8
                      (local.get $p22)))
                  (local.set $l49
                    (i32.load
                      (local.get $p22))))
                (local.set $l142
                  (f64x2.mul
                    (local.tee $l132
                      (f64x2.mul
                        (local.tee $l130
                          (v128.andnot
                            (local.tee $l130
                              (f64x2.sub
                                (local.tee $l54
                                  (v128.const i32x4 0x00000000 0x3ff00000 0x00000000 0x3ff00000))
                                (f64x2.promote_low_f32x4
                                  (local.tee $l131
                                    (f32x4.div
                                      (f32x4.mul
                                        (f32x4.sub
                                          (v128.const i32x4 0x3f800000 0x3f800000 0x3f800000 0x3f800000)
                                          (f32x4.mul
                                            (local.tee $l135
                                              (f32x4.sub
                                                (local.tee $l137
                                                  (v128.load align=1
                                                    (i32.add
                                                      (local.get $l49)
                                                      (local.get $p11))))
                                                (local.tee $l140
                                                  (v128.load align=1
                                                    (i32.add
                                                      (local.get $l44)
                                                      (local.get $p11))))))
                                            (local.get $l135)))
                                        (f32x4.add
                                          (f32x4.add
                                            (local.tee $l135
                                              (f32x4.sub
                                                (v128.load align=1
                                                  (i32.add
                                                    (local.get $l33)
                                                    (local.get $p11)))
                                                (f32x4.mul
                                                  (local.get $l137)
                                                  (local.get $l140))))
                                            (local.get $l135))
                                          (local.tee $l135
                                            (v128.const i32x4 0x3a6bedfa 0x3a6bedfa 0x3a6bedfa 0x3a6bedfa))))
                                      (f32x4.add
                                        (f32x4.add
                                          (f32x4.sub
                                            (v128.load align=1
                                              (i32.add
                                                (local.get $l50)
                                                (local.get $p11)))
                                            (f32x4.mul
                                              (local.get $l137)
                                              (local.get $l137)))
                                          (f32x4.sub
                                            (v128.load align=1
                                              (i32.add
                                                (local.get $l53)
                                                (local.get $p11)))
                                            (f32x4.mul
                                              (local.get $l140)
                                              (local.get $l140))))
                                        (local.get $l135)))))))
                            (f64x2.le
                              (local.get $l130)
                              (local.tee $l135
                                (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))))
                        (local.get $l130)))
                    (local.get $l132)))
                (local.set $l145
                  (f64x2.mul
                    (local.tee $l132
                      (f64x2.mul
                        (local.tee $l131
                          (v128.andnot
                            (local.tee $l131
                              (f64x2.sub
                                (local.get $l54)
                                (f64x2.promote_low_f32x4
                                  (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                    (local.get $l131)
                                    (local.get $l131)))))
                            (f64x2.le
                              (local.get $l131)
                              (local.get $l135))))
                        (local.get $l131)))
                    (local.get $l132)))
                (local.set $l138
                  (f64x2.mul
                    (local.tee $l132
                      (f64x2.mul
                        (local.tee $l140
                          (v128.andnot
                            (f64x2.neg
                              (local.tee $l137
                                (f64x2.add
                                  (f64x2.div
                                    (f64x2.add
                                      (f64x2.promote_low_f32x4
                                        (local.tee $l143
                                          (f32x4.abs
                                            (f32x4.sub
                                              (v128.load align=1
                                                (i32.add
                                                  (local.get $l35)
                                                  (local.get $p11)))
                                              (local.get $l140)))))
                                      (local.get $l54))
                                    (f64x2.add
                                      (f64x2.promote_low_f32x4
                                        (local.tee $l139
                                          (f32x4.abs
                                            (f32x4.sub
                                              (v128.load align=1
                                                (i32.add
                                                  (local.get $l30)
                                                  (local.get $p11)))
                                              (local.get $l137)))))
                                      (local.get $l54)))
                                  (local.tee $l141
                                    (v128.const i32x4 0x00000000 0xbff00000 0x00000000 0xbff00000)))))
                            (f64x2.ge
                              (local.get $l137)
                              (local.get $l135))))
                        (local.get $l140)))
                    (local.get $l132)))
                (local.set $l146
                  (f64x2.mul
                    (local.tee $l146
                      (f64x2.mul
                        (local.tee $l132
                          (v128.andnot
                            (local.get $l137)
                            (f64x2.le
                              (local.get $l137)
                              (local.get $l135))))
                        (local.get $l132)))
                    (local.get $l146)))
                (local.set $l139
                  (f64x2.mul
                    (local.tee $l139
                      (f64x2.mul
                        (local.tee $l143
                          (v128.andnot
                            (f64x2.neg
                              (local.tee $l54
                                (f64x2.add
                                  (f64x2.div
                                    (f64x2.add
                                      (f64x2.promote_low_f32x4
                                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                          (local.get $l143)
                                          (local.get $l143)))
                                      (local.get $l54))
                                    (f64x2.add
                                      (f64x2.promote_low_f32x4
                                        (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                          (local.get $l139)
                                          (local.get $l139)))
                                      (local.get $l54)))
                                  (local.get $l141))))
                            (f64x2.ge
                              (local.get $l54)
                              (local.get $l135))))
                        (local.get $l143)))
                    (local.get $l139)))
                (local.set $l141
                  (f64x2.mul
                    (local.tee $l141
                      (f64x2.mul
                        (local.tee $l135
                          (v128.andnot
                            (local.get $l54)
                            (f64x2.le
                              (local.get $l54)
                              (local.get $l135))))
                        (local.get $l135)))
                    (local.get $l141)))
                (block $B239
                  (block $B240
                    (br_if $B240
                      (local.get $p14))
                    (local.set $l187
                      (f64x2.extract_lane 1
                        (local.get $l131)))
                    (local.set $l188
                      (f64x2.extract_lane 0
                        (local.get $l131)))
                    (local.set $l189
                      (f64x2.extract_lane 1
                        (local.get $l130)))
                    (local.set $l190
                      (f64x2.extract_lane 0
                        (local.get $l130)))
                    (br $B239))
                  (f64.store
                    (local.get $p10)
                    (local.tee $l190
                      (f64x2.extract_lane 0
                        (local.get $l130))))
                  (f64.store
                    (local.get $p9)
                    (f64x2.extract_lane 0
                      (local.get $l137)))
                  (f64.store
                    (i32.add
                      (local.get $p10)
                      (i32.const 8))
                    (local.tee $l189
                      (f64x2.extract_lane 1
                        (local.get $l130))))
                  (f64.store
                    (i32.add
                      (local.get $p9)
                      (i32.const 8))
                    (f64x2.extract_lane 1
                      (local.get $l137)))
                  (f64.store
                    (i32.add
                      (local.get $p10)
                      (i32.const 16))
                    (local.tee $l188
                      (f64x2.extract_lane 0
                        (local.get $l131))))
                  (f64.store
                    (i32.add
                      (local.get $p9)
                      (i32.const 16))
                    (f64x2.extract_lane 0
                      (local.get $l54)))
                  (f64.store
                    (i32.add
                      (local.get $p10)
                      (i32.const 24))
                    (local.tee $l187
                      (f64x2.extract_lane 1
                        (local.get $l131))))
                  (f64.store
                    (i32.add
                      (local.get $p9)
                      (i32.const 24))
                    (f64x2.extract_lane 1
                      (local.get $l54))))
                (local.set $p10
                  (i32.add
                    (local.get $p10)
                    (i32.const 32)))
                (local.set $p9
                  (i32.add
                    (local.get $p9)
                    (i32.const 32)))
                (local.set $p11
                  (i32.add
                    (local.get $p11)
                    (i32.const 16)))
                (local.set $l186
                  (f64.add
                    (local.get $l187)
                    (f64.add
                      (local.get $l188)
                      (f64.add
                        (local.get $l189)
                        (f64.add
                          (local.get $l186)
                          (local.get $l190))))))
                (local.set $l181
                  (f64.add
                    (f64x2.extract_lane 1
                      (local.get $l139))
                    (f64.add
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l138))
                        (f64.add
                          (local.get $l181)
                          (f64x2.extract_lane 0
                            (local.get $l138))))
                      (f64x2.extract_lane 0
                        (local.get $l139)))))
                (local.set $l182
                  (f64.add
                    (f64x2.extract_lane 1
                      (local.get $l143))
                    (f64.add
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l140))
                        (f64.add
                          (local.get $l182)
                          (f64x2.extract_lane 0
                            (local.get $l140))))
                      (f64x2.extract_lane 0
                        (local.get $l143)))))
                (local.set $l183
                  (f64.add
                    (f64x2.extract_lane 1
                      (local.get $l141))
                    (f64.add
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l146))
                        (f64.add
                          (local.get $l183)
                          (f64x2.extract_lane 0
                            (local.get $l146))))
                      (f64x2.extract_lane 0
                        (local.get $l141)))))
                (local.set $l184
                  (f64.add
                    (f64x2.extract_lane 1
                      (local.get $l135))
                    (f64.add
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l132))
                        (f64.add
                          (local.get $l184)
                          (f64x2.extract_lane 0
                            (local.get $l132))))
                      (f64x2.extract_lane 0
                        (local.get $l135)))))
                (local.set $l185
                  (f64.add
                    (f64x2.extract_lane 1
                      (local.get $l145))
                    (f64.add
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l142))
                        (f64.add
                          (local.get $l185)
                          (f64x2.extract_lane 0
                            (local.get $l142))))
                      (f64x2.extract_lane 0
                        (local.get $l145)))))
                (local.set $l49
                  (i32.add
                    (local.get $l48)
                    (i32.const 8)))
                (local.set $l48
                  (local.tee $l50
                    (i32.add
                      (local.get $l48)
                      (i32.const 4))))
                (br_if $L237
                  (i32.le_s
                    (local.get $l49)
                    (local.get $p0)))))
            (block $B241
              (br_if $B241
                (i32.le_s
                  (local.get $p0)
                  (local.get $l50)))
              (local.set $l36
                (i32.add
                  (i32.add
                    (local.get $l41)
                    (local.get $l63))
                  (i32.shl
                    (local.get $l126)
                    (i32.const 2))))
              (local.set $l37
                (i32.add
                  (local.get $l46)
                  (local.get $l127)))
              (local.set $p11
                (i32.shl
                  (local.get $l50)
                  (i32.const 2)))
              (local.set $p10
                (i32.shl
                  (local.get $l50)
                  (i32.const 3)))
              (local.set $l49
                (i32.sub
                  (local.get $p0)
                  (local.get $l50)))
              (local.set $l50
                (i32.add
                  (local.get $l41)
                  (local.get $l128)))
              (local.set $l35
                (i32.load offset=12
                  (local.get $p22)))
              (local.set $l53
                (i32.load offset=16
                  (local.get $p22)))
              (local.set $l33
                (i32.load offset=4
                  (local.get $p22)))
              (loop $L242
                (local.set $p9
                  (local.get $l50))
                (local.set $l48
                  (local.get $l36))
                (block $B243
                  (br_if $B243
                    (local.get $l41))
                  (local.set $l48
                    (i32.load offset=8
                      (local.get $p22)))
                  (local.set $p9
                    (i32.load
                      (local.get $p22))))
                (local.set $l188
                  (select
                    (f64.const 0x0p+0 (;=0;))
                    (local.tee $l187
                      (f64.sub
                        (f64.const 0x1p+0 (;=1;))
                        (f64.promote_f32
                          (f32.div
                            (f32.mul
                              (f32.sub
                                (f32.const 0x1p+0 (;=1;))
                                (f32.mul
                                  (local.tee $l165
                                    (f32.sub
                                      (local.tee $l163
                                        (f32.load
                                          (i32.add
                                            (local.get $p9)
                                            (local.get $p11))))
                                      (local.tee $l164
                                        (f32.load
                                          (i32.add
                                            (local.get $l33)
                                            (local.get $p11))))))
                                  (local.get $l165)))
                              (f32.add
                                (f32.add
                                  (local.tee $l165
                                    (f32.sub
                                      (f32.load
                                        (i32.add
                                          (local.get $l53)
                                          (local.get $p11)))
                                      (f32.mul
                                        (local.get $l163)
                                        (local.get $l164))))
                                  (local.get $l165))
                                (f32.const 0x1.d7dbf4p-11 (;=0.0009;))))
                            (f32.add
                              (f32.add
                                (f32.sub
                                  (f32.load
                                    (i32.add
                                      (local.get $l48)
                                      (local.get $p11)))
                                  (f32.mul
                                    (local.get $l163)
                                    (local.get $l163)))
                                (f32.sub
                                  (f32.load
                                    (i32.add
                                      (local.get $l35)
                                      (local.get $p11)))
                                  (f32.mul
                                    (local.get $l164)
                                    (local.get $l164))))
                              (f32.const 0x1.d7dbf4p-11 (;=0.0009;)))))))
                    (f64.le
                      (local.get $l187)
                      (f64.const 0x0p+0 (;=0;)))))
                (local.set $l187
                  (f64.add
                    (f64.div
                      (f64.add
                        (f64.promote_f32
                          (f32.abs
                            (f32.sub
                              (f32.load
                                (i32.add
                                  (local.get $l37)
                                  (local.get $p11)))
                              (local.get $l164))))
                        (f64.const 0x1p+0 (;=1;)))
                      (f64.add
                        (f64.promote_f32
                          (f32.abs
                            (f32.sub
                              (f32.load
                                (i32.add
                                  (local.get $l30)
                                  (local.get $p11)))
                              (local.get $l163))))
                        (f64.const 0x1p+0 (;=1;))))
                    (f64.const -0x1p+0 (;=-1;))))
                (block $B244
                  (br_if $B244
                    (i32.eqz
                      (local.get $p14)))
                  (f64.store
                    (i32.add
                      (local.get $l73)
                      (local.get $p10))
                    (local.get $l188))
                  (f64.store
                    (i32.add
                      (local.get $l74)
                      (local.get $p10))
                    (local.get $l187)))
                (local.set $p11
                  (i32.add
                    (local.get $p11)
                    (i32.const 4)))
                (local.set $p10
                  (i32.add
                    (local.get $p10)
                    (i32.const 8)))
                (local.set $l186
                  (f64.add
                    (local.get $l186)
                    (local.get $l188)))
                (local.set $l182
                  (f64.add
                    (local.get $l182)
                    (local.tee $l189
                      (select
                        (f64.const 0x0p+0 (;=0;))
                        (f64.neg
                          (local.get $l187))
                        (f64.ge
                          (local.get $l187)
                          (f64.const 0x0p+0 (;=0;)))))))
                (local.set $l184
                  (f64.add
                    (local.get $l184)
                    (local.tee $l187
                      (select
                        (f64.const 0x0p+0 (;=0;))
                        (local.get $l187)
                        (f64.le
                          (local.get $l187)
                          (f64.const 0x0p+0 (;=0;)))))))
                (local.set $l185
                  (f64.add
                    (local.get $l185)
                    (f64.mul
                      (local.tee $l188
                        (f64.mul
                          (local.get $l188)
                          (local.get $l188)))
                      (local.get $l188))))
                (local.set $l181
                  (f64.add
                    (local.get $l181)
                    (f64.mul
                      (local.tee $l188
                        (f64.mul
                          (local.get $l189)
                          (local.get $l189)))
                      (local.get $l188))))
                (local.set $l183
                  (f64.add
                    (local.get $l183)
                    (f64.mul
                      (local.tee $l187
                        (f64.mul
                          (local.get $l187)
                          (local.get $l187)))
                      (local.get $l187))))
                (br_if $L242
                  (local.tee $l49
                    (i32.add
                      (local.get $l49)
                      (i32.const -1))))))
            (f64.store offset=40
              (local.get $l45)
              (local.get $l181))
            (f64.store offset=32
              (local.get $l45)
              (local.get $l182))
            (f64.store offset=24
              (local.get $l45)
              (local.get $l183))
            (f64.store offset=16
              (local.get $l45)
              (local.get $l184))
            (f64.store offset=8
              (local.get $l45)
              (local.get $l185))
            (f64.store
              (local.get $l45)
              (local.get $l186)))
          (br_if $L205
            (i32.ne
              (local.tee $p15
                (i32.add
                  (local.get $p15)
                  (i32.const 1)))
              (i32.const 3))))
        (local.set $l73
          (i32.add
            (local.get $l73)
            (local.get $l66)))
        (local.set $l74
          (i32.add
            (local.get $l74)
            (local.get $l66)))
        (local.set $l118
          (i32.add
            (local.get $l118)
            (i32.const 1)))
        (local.set $l57
          (i32.add
            (local.get $l57)
            (local.get $l70)))
        (local.set $l120
          (i32.add
            (local.get $l120)
            (local.get $l70)))
        (local.set $l121
          (i32.add
            (local.get $l121)
            (i32.const 1)))
        (br_if $L41
          (i32.ne
            (local.tee $p19
              (i32.add
                (local.get $p19)
                (i32.const 1)))
            (local.get $p20)))))
    (global.set $__stack_pointer
      (i32.add
        (local.get $l24)
        (i32.const 1728)))
    (local.get $p23))
  (func $fma4_tie (type $t5) (param $p0 v128) (param $p1 v128) (param $p2 v128) (result v128)
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
  (func $positive (type $t6) (param $p0 f32) (param $p1 f32) (param $p2 f32) (param $p3 i32)
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
      (local.get $p4)))
  (func $cube_root_bias (type $t10) (param $p0 f32) (result f32)
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
  (func $dummy (type $t11))
  (func $__wasm_call_dtors (type $t11)
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
  (table $T0 1 1 funcref)
  (global $__stack_pointer (mut i32) (i32.const 65536))
  (export "s2MetricFma" (func $s2_metric_fma.command_export))
  (export "s2MetricInit" (func $s2_metric_init.command_export))
  (export "s2MetricDown" (func $s2_metric_down.command_export))
  (export "s2MetricScale" (func $s2_metric_scale.command_export))
  (export "s2MetricBand" (func $s2_metric_band.command_export)))
