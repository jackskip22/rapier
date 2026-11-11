;; SPDX-License-Identifier: BSD-3-Clause
;; Generated from ssimulacra2-simd.c (-mrelaxed-simd -DS2_FUSED) and metric-float.h by build-jxl-kernels.mjs.
;; C inputs sha256 60a01cacc065bdc1d0b7e062276c78879c9cb7d40ac62c2920120b7531d8a234
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
(module $ssimulacra2-fused.wasm
  (type $t0 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
  (type $t1 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (type $t2 (func (param f32 f32 f32 i32)))
  (type $t3 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32)))
  (type $t4 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (type $t5 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (type $t6 (func (param f32) (result f32)))
  (type $t7 (func))
  (import "env" "memory" (memory $env.memory 2))
  (func $s2_metric_scale (type $t0) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (param $p16 i32) (param $p17 i32) (param $p18 i32)
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
  (func $metric_scale_rows (type $t1) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (param $p16 i32) (param $p17 i32) (param $p18 i32) (param $p19 i32) (param $p20 i32) (param $p21 i32) (param $p22 i32) (param $p23 i32) (param $p24 i32) (param $p25 i32) (param $p26 i32) (param $p27 i32) (result i32)
    (local $l28 i32) (local $l29 i32) (local $l30 i32) (local $l31 i32) (local $l32 i32) (local $l33 i32) (local $l34 i32) (local $l35 i32) (local $l36 i32) (local $l37 i32) (local $l38 i32) (local $l39 i32) (local $l40 i32) (local $l41 i32) (local $l42 i32) (local $l43 i32) (local $l44 i32) (local $l45 i32) (local $l46 i32) (local $l47 i32) (local $l48 i32) (local $l49 i32) (local $l50 i32) (local $l51 i32) (local $l52 v128) (local $l53 i32) (local $l54 i32) (local $l55 i32) (local $l56 i32) (local $l57 i32) (local $l58 i32) (local $l59 i32) (local $l60 i32) (local $l61 i32) (local $l62 i32) (local $l63 i32) (local $l64 i32) (local $l65 i32) (local $l66 i32) (local $l67 i32) (local $l68 i32) (local $l69 i32) (local $l70 i32) (local $l71 i32) (local $l72 i32) (local $l73 v128) (local $l74 i32) (local $l75 i32) (local $l76 i32) (local $l77 i32) (local $l78 i32) (local $l79 i32) (local $l80 i32) (local $l81 i32) (local $l82 v128) (local $l83 v128) (local $l84 v128) (local $l85 v128) (local $l86 v128) (local $l87 v128) (local $l88 v128) (local $l89 v128) (local $l90 v128) (local $l91 v128) (local $l92 v128) (local $l93 v128) (local $l94 v128) (local $l95 v128) (local $l96 v128) (local $l97 v128) (local $l98 i32) (local $l99 i32) (local $l100 i32) (local $l101 i32) (local $l102 i32) (local $l103 v128) (local $l104 i32) (local $l105 i32) (local $l106 i32) (local $l107 i32) (local $l108 v128) (local $l109 i32) (local $l110 i32) (local $l111 i32) (local $l112 i32) (local $l113 i32) (local $l114 i32) (local $l115 i32) (local $l116 i32) (local $l117 f32) (local $l118 f32) (local $l119 f32) (local $l120 f32) (local $l121 f32) (local $l122 f32) (local $l123 f32) (local $l124 f32) (local $l125 f32) (local $l126 f32) (local $l127 f32) (local $l128 f32) (local $l129 f32) (local $l130 f32) (local $l131 f32) (local $l132 f32) (local $l133 f32) (local $l134 f32) (local $l135 f32) (local $l136 f32) (local $l137 f32) (local $l138 f32) (local $l139 f32) (local $l140 f32) (local $l141 f32) (local $l142 f32) (local $l143 f32) (local $l144 f32) (local $l145 f32) (local $l146 f32) (local $l147 f32) (local $l148 f32) (local $l149 f32) (local $l150 v128) (local $l151 v128) (local $l152 v128) (local $l153 v128) (local $l154 v128) (local $l155 v128) (local $l156 v128) (local $l157 v128) (local $l158 v128) (local $l159 v128) (local $l160 v128) (local $l161 v128) (local $l162 v128) (local $l163 v128) (local $l164 v128) (local $l165 v128) (local $l166 v128) (local $l167 v128) (local $l168 v128) (local $l169 v128) (local $l170 v128) (local $l171 v128) (local $l172 v128) (local $l173 v128) (local $l174 v128) (local $l175 v128) (local $l176 v128) (local $l177 v128) (local $l178 v128) (local $l179 v128) (local $l180 v128) (local $l181 v128) (local $l182 v128) (local $l183 v128) (local $l184 v128) (local $l185 v128) (local $l186 v128) (local $l187 v128) (local $l188 v128) (local $l189 v128) (local $l190 v128) (local $l191 f64) (local $l192 f64) (local $l193 f64) (local $l194 f64) (local $l195 f64) (local $l196 f64) (local $l197 f64) (local $l198 f64) (local $l199 f64) (local $l200 f64)
    (global.set $__stack_pointer
      (local.tee $l28
        (i32.sub
          (global.get $__stack_pointer)
          (i32.const 592))))
    (block $B0
      (block $B1
        (br_if $B1
          (i32x4.all_true
            (i32x4.eq
              (v128.load offset=224 align=1
                (local.get $p8))
              (f32x4.relaxed_madd
                (v128.load offset=176 align=1
                  (local.get $p8))
                (v128.load offset=192 align=1
                  (local.get $p8))
                (v128.load offset=208 align=1
                  (local.get $p8))))))
        (i32.store offset=240
          (local.get $p8)
          (i32.const 1))
        (br $B0))
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
          (local.tee $p27
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
          (local.tee $p27
            (i32.add
              (local.get $p27)
              (local.get $l29)))
          (i32.const 0)
          (local.get $l30)))
      (local.set $l33
        (select
          (i32.add
            (local.get $p27)
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
          (local.tee $p9
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
      (loop $L2
        (local.set $p13
          (local.get $l38))
        (block $B3
          (br_if $B3
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
          (local.tee $p27
            (i32.add
              (local.get $p13)
              (local.tee $p10
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
              (local.get $p27)
              (local.get $p10))))
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
              (local.get $p10))))
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
        (local.set $p26
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
        (local.set $p11
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
        (loop $L4
          (local.set $p27
            (i32.add
              (local.get $l50)
              (local.tee $p13
                (i32.mul
                  (local.get $p26)
                  (i32.const 20)))))
          (block $B5
            (block $B6
              (br_if $B6
                (i32.and
                  (local.tee $p24
                    (i32.shl
                      (i32.const 1)
                      (local.get $p26)))
                  (local.get $p2)))
              (i32.store offset=16
                (local.get $p27)
                (i32.const 0))
              (v128.store align=4
                (local.get $p27)
                (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
              (br $B5))
            (local.set $p25
              (i32.add
                (local.get $l48)
                (local.get $p13)))
            (local.set $p16
              (i32.add
                (local.get $l49)
                (local.get $p13)))
            (local.set $p5
              (i32.and
                (local.get $p24)
                (local.get $p12)))
            (block $B7
              (br_if $B7
                (local.get $l43))
              (block $B8
                (block $B9
                  (br_if $B9
                    (local.get $p5))
                  (i32.store
                    (local.get $p27)
                    (local.get $p11))
                  (i32.store
                    (local.get $p16)
                    (local.tee $p13
                      (i32.add
                        (local.get $p11)
                        (local.get $p10))))
                  (i32.store
                    (local.get $p25)
                    (local.tee $p24
                      (i32.add
                        (local.get $p13)
                        (i32.shl
                          (local.get $l35)
                          (i32.const 2)))))
                  (local.set $p6
                    (i32.add
                      (local.get $p24)
                      (local.get $p9)))
                  (block $B10
                    (br_if $B10
                      (i32.eqz
                        (local.get $l47)))
                    (local.set $p11
                      (local.get $p6))
                    (br $B8))
                  (local.set $p24
                    (i32.const 0))
                  (block $B11
                    (br_if $B11
                      (i32.lt_s
                        (local.get $l35)
                        (i32.const 4)))
                    (local.set $p24
                      (local.get $l37))
                    (loop $L12
                      (v128.store align=4
                        (local.get $p13)
                        (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 16)))
                      (br_if $L12
                        (local.tee $p24
                          (i32.add
                            (local.get $p24)
                            (i32.const -4)))))
                    (local.set $p24
                      (local.get $l37))
                    (br_if $B11
                      (i32.ne
                        (local.get $l36)
                        (local.get $l37)))
                    (local.set $p11
                      (local.get $p6))
                    (br $B8))
                  (local.set $p13
                    (i32.add
                      (i32.add
                        (local.get $p11)
                        (local.get $l29))
                      (i32.shl
                        (local.get $p24)
                        (i32.const 2))))
                  (local.set $p24
                    (i32.sub
                      (local.get $l36)
                      (local.get $p24)))
                  (loop $L13
                    (i32.store
                      (local.get $p13)
                      (i32.const 0))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 4)))
                    (br_if $L13
                      (local.tee $p24
                        (i32.add
                          (local.get $p24)
                          (i32.const -1)))))
                  (local.set $p11
                    (local.get $p6))
                  (br $B8))
                (i32.store
                  (local.get $p27)
                  (i32.const 0)))
              (i32.store offset=4
                (local.get $p27)
                (local.get $p11))
              (i32.store offset=4
                (local.get $p16)
                (local.tee $p13
                  (i32.add
                    (local.get $p11)
                    (local.get $p10))))
              (i32.store offset=4
                (local.get $p25)
                (local.tee $p6
                  (i32.add
                    (local.get $p13)
                    (local.tee $l51
                      (i32.shl
                        (local.get $l35)
                        (i32.const 2))))))
              (block $B14
                (br_if $B14
                  (local.get $l46))
                (local.set $p24
                  (i32.const 0))
                (block $B15
                  (br_if $B15
                    (i32.lt_s
                      (local.get $l35)
                      (i32.const 4)))
                  (local.set $p24
                    (local.get $l37))
                  (loop $L16
                    (v128.store align=4
                      (local.get $p13)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 16)))
                    (br_if $L16
                      (local.tee $p24
                        (i32.add
                          (local.get $p24)
                          (i32.const -4)))))
                  (local.set $p24
                    (local.get $l37))
                  (br_if $B14
                    (i32.eq
                      (local.get $l36)
                      (local.get $l37))))
                (local.set $p13
                  (i32.add
                    (i32.add
                      (local.get $p11)
                      (local.get $l29))
                    (i32.shl
                      (local.get $p24)
                      (i32.const 2))))
                (local.set $p24
                  (i32.sub
                    (local.get $l36)
                    (local.get $p24)))
                (loop $L17
                  (i32.store
                    (local.get $p13)
                    (i32.const 0))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 4)))
                  (br_if $L17
                    (local.tee $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const -1))))))
              (local.set $p6
                (i32.add
                  (local.get $p6)
                  (local.get $p9)))
              (block $B18
                (block $B19
                  (br_if $B19
                    (local.get $p5))
                  (i32.store offset=8
                    (local.get $p27)
                    (local.get $p6))
                  (i32.store offset=8
                    (local.get $p16)
                    (local.tee $p13
                      (i32.add
                        (local.get $p6)
                        (local.get $p10))))
                  (i32.store offset=8
                    (local.get $p25)
                    (local.tee $p24
                      (i32.add
                        (local.get $p13)
                        (local.get $l51))))
                  (local.set $p6
                    (i32.add
                      (local.get $p24)
                      (local.get $p9)))
                  (br_if $B18
                    (local.get $l47))
                  (local.set $p24
                    (i32.const 0))
                  (block $B20
                    (br_if $B20
                      (i32.lt_s
                        (local.get $l35)
                        (i32.const 4)))
                    (local.set $p24
                      (local.get $l37))
                    (loop $L21
                      (v128.store align=4
                        (local.get $p13)
                        (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 16)))
                      (br_if $L21
                        (local.tee $p24
                          (i32.add
                            (local.get $p24)
                            (i32.const -4)))))
                    (local.set $p24
                      (local.get $l37))
                    (br_if $B18
                      (i32.eq
                        (local.get $l36)
                        (local.get $l37))))
                  (local.set $p13
                    (i32.add
                      (i32.add
                        (local.get $p11)
                        (local.get $l40))
                      (i32.shl
                        (local.get $p24)
                        (i32.const 2))))
                  (local.set $p24
                    (i32.sub
                      (local.get $l36)
                      (local.get $p24)))
                  (loop $L22
                    (i32.store
                      (local.get $p13)
                      (i32.const 0))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 4)))
                    (br_if $L22
                      (local.tee $p24
                        (i32.add
                          (local.get $p24)
                          (i32.const -1))))
                    (br $B18)))
                (i32.store offset=8
                  (local.get $p27)
                  (i32.const 0)))
              (i32.store offset=12
                (local.get $p27)
                (local.get $p6))
              (i32.store offset=12
                (local.get $p16)
                (local.tee $p13
                  (i32.add
                    (local.get $p6)
                    (local.get $p10))))
              (i32.store offset=12
                (local.get $p25)
                (local.tee $p24
                  (i32.add
                    (local.get $p13)
                    (local.get $l51))))
              (local.set $p11
                (i32.add
                  (local.get $p24)
                  (local.get $p9)))
              (block $B23
                (br_if $B23
                  (local.get $l46))
                (local.set $p24
                  (i32.const 0))
                (block $B24
                  (br_if $B24
                    (i32.lt_s
                      (local.get $l35)
                      (i32.const 4)))
                  (local.set $p24
                    (local.get $l37))
                  (loop $L25
                    (v128.store align=4
                      (local.get $p13)
                      (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 16)))
                    (br_if $L25
                      (local.tee $p24
                        (i32.add
                          (local.get $p24)
                          (i32.const -4)))))
                  (local.set $p24
                    (local.get $l37))
                  (br_if $B23
                    (i32.eq
                      (local.get $l36)
                      (local.get $l37))))
                (local.set $p13
                  (i32.add
                    (i32.add
                      (local.get $p6)
                      (local.get $l29))
                    (i32.shl
                      (local.get $p24)
                      (i32.const 2))))
                (local.set $p24
                  (i32.sub
                    (local.get $l36)
                    (local.get $p24)))
                (loop $L26
                  (i32.store
                    (local.get $p13)
                    (i32.const 0))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 4)))
                  (br_if $L26
                    (local.tee $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const -1))))))
              (i32.store offset=16
                (local.get $p27)
                (local.get $p11))
              (i32.store offset=16
                (local.get $p16)
                (local.tee $p13
                  (i32.add
                    (local.get $p11)
                    (local.get $p10))))
              (i32.store offset=16
                (local.get $p25)
                (local.tee $p24
                  (i32.add
                    (local.get $p13)
                    (local.get $l51))))
              (local.set $p11
                (i32.add
                  (local.get $p24)
                  (local.get $p9)))
              (br_if $B5
                (local.get $l46))
              (local.set $p24
                (i32.const 0))
              (block $B27
                (br_if $B27
                  (i32.lt_s
                    (local.get $l35)
                    (i32.const 4)))
                (local.set $p24
                  (local.get $l37))
                (loop $L28
                  (v128.store align=4
                    (local.get $p13)
                    (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))
                  (local.set $p13
                    (i32.add
                      (local.get $p13)
                      (i32.const 16)))
                  (br_if $L28
                    (local.tee $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const -4)))))
                (local.set $p24
                  (local.get $l37))
                (br_if $B5
                  (i32.eq
                    (local.get $l36)
                    (local.get $l37))))
              (local.set $p13
                (i32.add
                  (i32.add
                    (local.get $p6)
                    (local.get $l40))
                  (i32.shl
                    (local.get $p24)
                    (i32.const 2))))
              (local.set $p24
                (i32.sub
                  (local.get $l36)
                  (local.get $p24)))
              (loop $L29
                (i32.store
                  (local.get $p13)
                  (i32.const 0))
                (local.set $p13
                  (i32.add
                    (local.get $p13)
                    (i32.const 4)))
                (br_if $L29
                  (local.tee $p24
                    (i32.add
                      (local.get $p24)
                      (i32.const -1))))
                (br $B5)))
            (block $B30
              (br_if $B30
                (local.get $p5))
              (i32.store
                (local.get $p27)
                (local.get $p11))
              (i32.store
                (local.get $p16)
                (local.tee $p24
                  (i32.add
                    (local.get $p11)
                    (local.get $p10))))
              (i32.store
                (local.get $p25)
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (local.tee $p13
                      (i32.shl
                        (local.get $l35)
                        (i32.const 2))))))
              (i32.store offset=4
                (local.get $p27)
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (local.get $p9))))
              (i32.store offset=4
                (local.get $p16)
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (local.get $p10))))
              (i32.store offset=4
                (local.get $p25)
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (local.get $p13))))
              (i32.store offset=8
                (local.get $p27)
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (local.get $p9))))
              (i32.store offset=8
                (local.get $p16)
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (local.get $p10))))
              (i32.store offset=8
                (local.get $p25)
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (local.get $p13))))
              (i32.store offset=12
                (local.get $p27)
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (local.get $p9))))
              (i32.store offset=12
                (local.get $p16)
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (local.get $p10))))
              (i32.store offset=12
                (local.get $p25)
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (local.get $p13))))
              (i32.store offset=16
                (local.get $p27)
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (local.get $p9))))
              (i32.store offset=16
                (local.get $p16)
                (local.tee $p24
                  (i32.add
                    (local.get $p24)
                    (local.get $p10))))
              (i32.store offset=16
                (local.get $p25)
                (local.tee $p13
                  (i32.add
                    (local.get $p24)
                    (local.get $p13))))
              (local.set $p11
                (i32.add
                  (local.get $p13)
                  (local.get $p9)))
              (br $B5))
            (i32.store offset=4
              (local.get $p27)
              (local.get $p11))
            (i32.store
              (local.get $p27)
              (i32.const 0))
            (i32.store offset=8
              (local.get $p27)
              (i32.const 0))
            (i32.store offset=4
              (local.get $p16)
              (local.tee $p24
                (i32.add
                  (local.get $p11)
                  (local.get $p10))))
            (i32.store offset=4
              (local.get $p25)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.tee $p13
                    (i32.shl
                      (local.get $l35)
                      (i32.const 2))))))
            (i32.store offset=12
              (local.get $p27)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p9))))
            (i32.store offset=12
              (local.get $p16)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p10))))
            (i32.store offset=12
              (local.get $p25)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p13))))
            (i32.store offset=16
              (local.get $p27)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p9))))
            (i32.store offset=16
              (local.get $p16)
              (local.tee $p24
                (i32.add
                  (local.get $p24)
                  (local.get $p10))))
            (i32.store offset=16
              (local.get $p25)
              (local.tee $p13
                (i32.add
                  (local.get $p24)
                  (local.get $p13))))
            (local.set $p11
              (i32.add
                (local.get $p13)
                (local.get $p9))))
          (br_if $L4
            (i32.ne
              (local.tee $p26
                (i32.add
                  (local.get $p26)
                  (i32.const 1)))
              (i32.const 3))))
        (block $B31
          (br_if $B31
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
        (br_if $L2
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
      (br_if $B0
        (i32.ge_s
          (local.get $p19)
          (local.get $p20)))
      (local.set $l53
        (i32.sub
          (i32.shl
            (local.get $p22)
            (i32.const 2))
          (local.tee $p13
            (i32.shl
              (local.get $p21)
              (i32.const 2)))))
      (local.set $l54
        (i32.sub
          (i32.shl
            (local.get $p22)
            (i32.const 3))
          (local.get $p13)))
      (local.set $l55
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
      (local.set $l50
        (select
          (local.get $p0)
          (i32.const 8)
          (i32.lt_s
            (local.get $p0)
            (i32.const 8))))
      (local.set $l56
        (i32.sub
          (i32.const 0)
          (local.get $p21)))
      (local.set $l57
        (i32.and
          (local.get $p0)
          (i32.const 1)))
      (local.set $l58
        (i32.and
          (local.get $p0)
          (i32.const 2147483644)))
      (local.set $l59
        (i32.and
          (local.get $p0)
          (i32.const 3)))
      (local.set $l60
        (i32.shl
          (local.tee $p24
            (i32.mul
              (local.get $p1)
              (local.get $p0)))
          (i32.const 3)))
      (local.set $l61
        (i32.mul
          (local.get $p0)
          (i32.const 20)))
      (local.set $l62
        (i32.mul
          (local.get $p0)
          (i32.const 12)))
      (local.set $l63
        (i32.shl
          (local.get $p0)
          (i32.const 3)))
      (local.set $l51
        (i32.add
          (local.get $p0)
          (i32.const -7)))
      (local.set $l65
        (i32.sub
          (i32.const 0)
          (local.tee $l64
            (i32.shl
              (local.get $p0)
              (i32.const 2)))))
      (local.set $l66
        (i32.add
          (local.get $p14)
          (local.tee $p27
            (i32.shl
              (i32.mul
                (local.get $p19)
                (local.get $p0))
              (i32.const 3)))))
      (local.set $l67
        (i32.add
          (local.get $p15)
          (local.get $p27)))
      (local.set $l69
        (i32.add
          (local.get $p3)
          (local.tee $l68
            (i32.shl
              (local.tee $p27
                (i32.mul
                  (local.get $p22)
                  (local.get $p0)))
              (i32.const 2)))))
      (local.set $l71
        (i32.add
          (local.get $p3)
          (local.tee $l70
            (i32.shl
              (local.get $p27)
              (i32.const 3)))))
      (local.set $l72
        (i32.shl
          (i32.mul
            (i32.add
              (local.get $p19)
              (local.get $p1))
            (local.get $p0))
          (i32.const 2)))
      (local.set $l73
        (i32x4.splat
          (local.get $p0)))
      (local.set $l75
        (i32.lt_u
          (i32.add
            (local.tee $l74
              (i32.shl
                (local.get $p24)
                (i32.const 2)))
            (i32.const -1))
          (i32.const 15)))
      (local.set $l76
        (local.get $p19))
      (local.set $l78
        (local.tee $l77
          (i32.mul
            (local.get $p0)
            (i32.add
              (i32.shl
                (local.get $p1)
                (i32.const 3))
              (local.get $p13)))))
      (local.set $l79
        (i32.const 0))
      (loop $L32
        (local.set $l80
          (i32.add
            (local.get $p19)
            (i32.const 4)))
        (block $B33
          (br_if $B33
            (i32.ge_s
              (local.get $p23)
              (local.get $p1)))
          (br_if $B33
            (i32.gt_s
              (local.get $p23)
              (local.get $l80)))
          (loop $L34
            (local.set $l81
              (select
                (local.tee $p13
                  (i32.sub
                    (local.get $p1)
                    (local.get $p23)))
                (i32.const 4)
                (i32.lt_s
                  (local.get $p13)
                  (i32.const 4))))
            (block $B35
              (block $B36
                (br_if $B36
                  (local.tee $l37
                    (i32.lt_s
                      (local.get $p13)
                      (i32.const 1))))
                (local.set $l49
                  (i32.mul
                    (local.get $p0)
                    (local.tee $p13
                      (i32.add
                        (local.get $l56)
                        (local.get $p23)))))
                (local.set $l40
                  (i32.add
                    (local.get $p3)
                    (local.tee $l29
                      (i32.mul
                        (local.get $l64)
                        (local.get $p13)))))
                (local.set $l45
                  (i32.add
                    (local.get $p3)
                    (local.tee $l47
                      (i32.mul
                        (local.get $p0)
                        (i32.add
                          (local.get $l53)
                          (local.tee $p13
                            (i32.shl
                              (local.get $p23)
                              (i32.const 2))))))))
                (local.set $l42
                  (i32.add
                    (local.get $p3)
                    (local.tee $l44
                      (i32.mul
                        (local.get $p0)
                        (i32.add
                          (local.get $l54)
                          (local.get $p13))))))
                (local.set $l38
                  (i32.const 0))
                (loop $L37
                  (local.set $l48
                    (i32.mul
                      (local.tee $p9
                        (i32.rem_s
                          (i32.add
                            (local.get $l38)
                            (local.get $p23))
                          (i32.const 16)))
                      (local.get $p0)))
                  (block $B38
                    (br_if $B38
                      (i32.eqz
                        (local.get $l30)))
                    (local.set $p27
                      (i32.const 0))
                    (block $B39
                      (br_if $B39
                        (i32.lt_s
                          (local.get $p0)
                          (i32.const 4)))
                      (local.set $p16
                        (i32.add
                          (local.get $l32)
                          (local.tee $p13
                            (i32.shl
                              (local.get $l48)
                              (i32.const 2)))))
                      (local.set $p11
                        (i32.add
                          (local.get $l31)
                          (local.get $p13)))
                      (local.set $p10
                        (i32.add
                          (local.get $l39)
                          (local.get $p13)))
                      (local.set $p25
                        (i32.const 0))
                      (local.set $p13
                        (i32.const 0))
                      (loop $L40
                        (block $B41
                          (block $B42
                            (br_if $B42
                              (i32.eqz
                                (local.get $p4)))
                            (local.set $l82
                              (v128.load align=4
                                (i32.add
                                  (local.get $l42)
                                  (local.get $p13))))
                            (local.set $l83
                              (v128.load align=4
                                (i32.add
                                  (local.get $l45)
                                  (local.get $p13))))
                            (local.set $l84
                              (v128.load align=4
                                (i32.add
                                  (local.get $l40)
                                  (local.get $p13))))
                            (br $B41))
                          (local.set $l84
                            (v128.load32_lane 3
                              (i32.add
                                (local.get $p7)
                                (i32.shl
                                  (i32.load8_u
                                    (i32.add
                                      (local.tee $p24
                                        (i32.add
                                          (local.get $l40)
                                          (local.get $p13)))
                                      (i32.const 12)))
                                  (i32.const 2)))
                              (v128.load32_lane 2
                                (i32.add
                                  (local.get $p7)
                                  (i32.shl
                                    (i32.load8_u
                                      (i32.add
                                        (local.get $p24)
                                        (i32.const 8)))
                                    (i32.const 2)))
                                (v128.load32_lane 1
                                  (i32.add
                                    (local.get $p7)
                                    (i32.shl
                                      (i32.load8_u
                                        (i32.add
                                          (local.get $p24)
                                          (i32.const 4)))
                                      (i32.const 2)))
                                  (v128.load32_zero
                                    (i32.add
                                      (local.get $p7)
                                      (i32.shl
                                        (i32.load8_u
                                          (local.get $p24))
                                        (i32.const 2))))))))
                          (local.set $l82
                            (v128.load32_lane 3
                              (i32.add
                                (local.get $p7)
                                (i32.shl
                                  (i32.load8_u
                                    (i32.add
                                      (local.get $p24)
                                      (i32.const 14)))
                                  (i32.const 2)))
                              (v128.load32_lane 2
                                (i32.add
                                  (local.get $p7)
                                  (i32.shl
                                    (i32.load8_u
                                      (i32.add
                                        (local.get $p24)
                                        (i32.const 10)))
                                    (i32.const 2)))
                                (v128.load32_lane 1
                                  (i32.add
                                    (local.get $p7)
                                    (i32.shl
                                      (i32.load8_u
                                        (i32.add
                                          (local.get $p24)
                                          (i32.const 6)))
                                      (i32.const 2)))
                                  (v128.load32_zero
                                    (i32.add
                                      (local.get $p7)
                                      (i32.shl
                                        (i32.load8_u
                                          (i32.add
                                            (local.get $p24)
                                            (i32.const 2)))
                                        (i32.const 2))))))))
                          (local.set $l83
                            (v128.load32_lane 3
                              (i32.add
                                (local.get $p7)
                                (i32.shl
                                  (i32.load8_u
                                    (i32.add
                                      (local.get $p24)
                                      (i32.const 13)))
                                  (i32.const 2)))
                              (v128.load32_lane 2
                                (i32.add
                                  (local.get $p7)
                                  (i32.shl
                                    (i32.load8_u
                                      (i32.add
                                        (local.get $p24)
                                        (i32.const 9)))
                                    (i32.const 2)))
                                (v128.load32_lane 1
                                  (i32.add
                                    (local.get $p7)
                                    (i32.shl
                                      (i32.load8_u
                                        (i32.add
                                          (local.get $p24)
                                          (i32.const 5)))
                                      (i32.const 2)))
                                  (v128.load32_zero
                                    (i32.add
                                      (local.get $p7)
                                      (i32.shl
                                        (i32.load8_u
                                          (i32.add
                                            (local.get $p24)
                                            (i32.const 1)))
                                        (i32.const 2)))))))))
                        (f32.store
                          (local.tee $p24
                            (i32.add
                              (local.get $p10)
                              (local.get $p13)))
                          (f32x4.extract_lane 0
                            (local.tee $l91
                              (f32x4.add
                                (f32x4.mul
                                  (f32x4.mul
                                    (f32x4.sub
                                      (local.tee $l97
                                        (f32x4.relaxed_madd
                                          (f32x4.mul
                                            (local.tee $l91
                                              (f32x4.relaxed_madd
                                                (local.tee $l85
                                                  (v128.const i32x4 0x3eaaaaab 0x3eaaaaab 0x3eaaaaab 0x3eaaaaab))
                                                (f32x4.relaxed_madd
                                                  (f32x4.neg
                                                    (local.tee $l89
                                                      (v128.andnot
                                                        (local.tee $l52
                                                          (f32x4.relaxed_madd
                                                            (v128.const i32x4 0x3e99999a 0x3e99999a 0x3e99999a 0x3e99999a)
                                                            (local.get $l84)
                                                            (f32x4.relaxed_madd
                                                              (v128.const i32x4 0x3f1f3b64 0x3f1f3b64 0x3f1f3b64 0x3f1f3b64)
                                                              (local.get $l83)
                                                              (local.tee $l87
                                                                (f32x4.relaxed_madd
                                                                  (v128.const i32x4 0x3d9fbe77 0x3d9fbe77 0x3d9fbe77 0x3d9fbe77)
                                                                  (local.get $l82)
                                                                  (local.tee $l86
                                                                    (v128.const i32x4 0x3b789536 0x3b789536 0x3b789536 0x3b789536)))))))
                                                        (f32x4.le
                                                          (local.get $l52)
                                                          (local.tee $l88
                                                            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))))))
                                                  (f32x4.mul
                                                    (local.tee $l95
                                                      (f32x4.mul
                                                        (local.tee $l91
                                                          (f32x4.relaxed_madd
                                                            (local.tee $l91
                                                              (f32x4.mul
                                                                (local.get $l89)
                                                                (local.tee $l90
                                                                  (v128.const i32x4 0xbeaaaaab 0xbeaaaaab 0xbeaaaaab 0xbeaaaaab))))
                                                            (f32x4.mul
                                                              (local.tee $l95
                                                                (f32x4.mul
                                                                  (local.tee $l91
                                                                    (f32x4.relaxed_madd
                                                                      (local.get $l91)
                                                                      (f32x4.mul
                                                                        (local.tee $l96
                                                                          (f32x4.mul
                                                                            (local.tee $l95
                                                                              (f32x4.relaxed_madd
                                                                                (local.get $l91)
                                                                                (f32x4.mul
                                                                                  (local.tee $l52
                                                                                    (f32x4.mul
                                                                                      (local.tee $l95
                                                                                        (v128.and
                                                                                          (i32x4.ne
                                                                                            (local.get $l89)
                                                                                            (local.tee $l92
                                                                                              (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                                                                                          (i32x4.add
                                                                                            (i32x4.mul
                                                                                              (i32x4.shr_u
                                                                                                (local.get $l89)
                                                                                                (i32.const 23))
                                                                                              (local.tee $l93
                                                                                                (v128.const i32x4 0xffd55556 0xffd55556 0xffd55556 0xffd55556)))
                                                                                            (local.tee $l94
                                                                                              (v128.const i32x4 0x54800000 0x54800000 0x54800000 0x54800000)))))
                                                                                      (local.get $l95)))
                                                                                  (local.get $l52))
                                                                                (f32x4.mul
                                                                                  (local.get $l95)
                                                                                  (local.tee $l52
                                                                                    (v128.const i32x4 0x3faaaaab 0x3faaaaab 0x3faaaaab 0x3faaaaab)))))
                                                                            (local.get $l95)))
                                                                        (local.get $l96))
                                                                      (f32x4.mul
                                                                        (local.get $l95)
                                                                        (local.get $l52))))
                                                                  (local.get $l91)))
                                                              (local.get $l95))
                                                            (f32x4.mul
                                                              (local.get $l91)
                                                              (local.get $l52))))
                                                        (local.get $l91)))
                                                    (local.get $l95))
                                                  (local.get $l91))
                                                (local.get $l91)))
                                            (local.get $l91))
                                          (local.get $l89)
                                          (local.tee $l96
                                            (v128.const i32x4 0xbe1fb275 0xbe1fb275 0xbe1fb275 0xbe1fb275))))
                                      (local.tee $l89
                                        (f32x4.relaxed_madd
                                          (f32x4.mul
                                            (local.tee $l91
                                              (f32x4.relaxed_madd
                                                (local.get $l85)
                                                (f32x4.relaxed_madd
                                                  (f32x4.neg
                                                    (local.tee $l89
                                                      (v128.andnot
                                                        (local.tee $l89
                                                          (f32x4.relaxed_madd
                                                            (v128.const i32x4 0x3e6b851f 0x3e6b851f 0x3e6b851f 0x3e6b851f)
                                                            (local.get $l84)
                                                            (f32x4.relaxed_madd
                                                              (v128.const i32x4 0x3f3126e9 0x3f3126e9 0x3f3126e9 0x3f3126e9)
                                                              (local.get $l83)
                                                              (local.get $l87))))
                                                        (f32x4.le
                                                          (local.get $l89)
                                                          (local.get $l88)))))
                                                  (f32x4.mul
                                                    (local.tee $l95
                                                      (f32x4.mul
                                                        (local.tee $l91
                                                          (f32x4.relaxed_madd
                                                            (local.tee $l91
                                                              (f32x4.mul
                                                                (local.get $l89)
                                                                (local.get $l90)))
                                                            (f32x4.mul
                                                              (local.tee $l95
                                                                (f32x4.mul
                                                                  (local.tee $l91
                                                                    (f32x4.relaxed_madd
                                                                      (local.get $l91)
                                                                      (f32x4.mul
                                                                        (local.tee $l87
                                                                          (f32x4.mul
                                                                            (local.tee $l95
                                                                              (f32x4.relaxed_madd
                                                                                (local.get $l91)
                                                                                (f32x4.mul
                                                                                  (local.tee $l87
                                                                                    (f32x4.mul
                                                                                      (local.tee $l95
                                                                                        (v128.and
                                                                                          (i32x4.ne
                                                                                            (local.get $l89)
                                                                                            (local.get $l92))
                                                                                          (i32x4.add
                                                                                            (i32x4.mul
                                                                                              (i32x4.shr_u
                                                                                                (local.get $l89)
                                                                                                (i32.const 23))
                                                                                              (local.get $l93))
                                                                                            (local.get $l94))))
                                                                                      (local.get $l95)))
                                                                                  (local.get $l87))
                                                                                (f32x4.mul
                                                                                  (local.get $l95)
                                                                                  (local.get $l52))))
                                                                            (local.get $l95)))
                                                                        (local.get $l87))
                                                                      (f32x4.mul
                                                                        (local.get $l95)
                                                                        (local.get $l52))))
                                                                  (local.get $l91)))
                                                              (local.get $l95))
                                                            (f32x4.mul
                                                              (local.get $l91)
                                                              (local.get $l52))))
                                                        (local.get $l91)))
                                                    (local.get $l95))
                                                  (local.get $l91))
                                                (local.get $l91)))
                                            (local.get $l91))
                                          (local.get $l89)
                                          (local.get $l96))))
                                    (local.tee $l95
                                      (v128.const i32x4 0x3f000000 0x3f000000 0x3f000000 0x3f000000)))
                                  (v128.const i32x4 0x41600000 0x41600000 0x41600000 0x41600000))
                                (v128.const i32x4 0x3ed70a3d 0x3ed70a3d 0x3ed70a3d 0x3ed70a3d)))))
                        (f32.store
                          (local.tee $p27
                            (i32.add
                              (local.get $p11)
                              (local.get $p13)))
                          (f32x4.extract_lane 0
                            (local.tee $l95
                              (f32x4.add
                                (local.tee $l87
                                  (f32x4.mul
                                    (f32x4.add
                                      (local.get $l97)
                                      (local.get $l89))
                                    (local.get $l95)))
                                (v128.const i32x4 0x3c23d70a 0x3c23d70a 0x3c23d70a 0x3c23d70a)))))
                        (f32.store
                          (local.tee $p26
                            (i32.add
                              (local.get $p16)
                              (local.get $p13)))
                          (f32x4.extract_lane 0
                            (local.tee $l52
                              (f32x4.add
                                (f32x4.sub
                                  (f32x4.relaxed_madd
                                    (f32x4.mul
                                      (local.tee $l52
                                        (f32x4.relaxed_madd
                                          (local.get $l85)
                                          (f32x4.relaxed_madd
                                            (f32x4.neg
                                              (local.tee $l89
                                                (v128.andnot
                                                  (local.tee $l89
                                                    (f32x4.relaxed_madd
                                                      (v128.const i32x4 0x3e7943cc 0x3e7943cc 0x3e7943cc 0x3e7943cc)
                                                      (local.get $l84)
                                                      (f32x4.relaxed_madd
                                                        (v128.const i32x4 0x3e51ae8f 0x3e51ae8f 0x3e51ae8f 0x3e51ae8f)
                                                        (local.get $l83)
                                                        (f32x4.relaxed_madd
                                                          (v128.const i32x4 0x3f0d4369 0x3f0d4369 0x3f0d4369 0x3f0d4369)
                                                          (local.get $l82)
                                                          (local.get $l86)))))
                                                  (f32x4.le
                                                    (local.get $l89)
                                                    (local.get $l88)))))
                                            (f32x4.mul
                                              (local.tee $l83
                                                (f32x4.mul
                                                  (local.tee $l52
                                                    (f32x4.relaxed_madd
                                                      (local.tee $l83
                                                        (f32x4.mul
                                                          (local.get $l89)
                                                          (local.get $l90)))
                                                      (f32x4.mul
                                                        (local.tee $l84
                                                          (f32x4.mul
                                                            (local.tee $l83
                                                              (f32x4.relaxed_madd
                                                                (local.get $l83)
                                                                (f32x4.mul
                                                                  (local.tee $l82
                                                                    (f32x4.mul
                                                                      (local.tee $l84
                                                                        (f32x4.relaxed_madd
                                                                          (local.get $l83)
                                                                          (f32x4.mul
                                                                            (local.tee $l82
                                                                              (f32x4.mul
                                                                                (local.tee $l84
                                                                                  (v128.and
                                                                                    (i32x4.ne
                                                                                      (local.get $l89)
                                                                                      (local.get $l92))
                                                                                    (i32x4.add
                                                                                      (i32x4.mul
                                                                                        (i32x4.shr_u
                                                                                          (local.get $l89)
                                                                                          (i32.const 23))
                                                                                        (local.get $l93))
                                                                                      (local.get $l94))))
                                                                                (local.get $l84)))
                                                                            (local.get $l82))
                                                                          (f32x4.mul
                                                                            (local.get $l84)
                                                                            (local.get $l52))))
                                                                      (local.get $l84)))
                                                                  (local.get $l82))
                                                                (f32x4.mul
                                                                  (local.get $l84)
                                                                  (local.get $l52))))
                                                            (local.get $l83)))
                                                        (local.get $l84))
                                                      (f32x4.mul
                                                        (local.get $l83)
                                                        (local.get $l52))))
                                                  (local.get $l52)))
                                              (local.get $l83))
                                            (local.get $l52))
                                          (local.get $l52)))
                                      (local.get $l52))
                                    (local.get $l89)
                                    (local.get $l96))
                                  (local.get $l87))
                                (v128.const i32x4 0x3f0ccccd 0x3f0ccccd 0x3f0ccccd 0x3f0ccccd)))))
                        (f32.store
                          (i32.add
                            (local.get $p24)
                            (i32.const 4))
                          (f32x4.extract_lane 1
                            (local.get $l91)))
                        (f32.store
                          (i32.add
                            (local.get $p27)
                            (i32.const 4))
                          (f32x4.extract_lane 1
                            (local.get $l95)))
                        (f32.store
                          (i32.add
                            (local.get $p26)
                            (i32.const 4))
                          (f32x4.extract_lane 1
                            (local.get $l52)))
                        (f32.store
                          (i32.add
                            (local.get $p24)
                            (i32.const 8))
                          (f32x4.extract_lane 2
                            (local.get $l91)))
                        (f32.store
                          (i32.add
                            (local.get $p27)
                            (i32.const 8))
                          (f32x4.extract_lane 2
                            (local.get $l95)))
                        (f32.store
                          (i32.add
                            (local.get $p26)
                            (i32.const 8))
                          (f32x4.extract_lane 2
                            (local.get $l52)))
                        (f32.store
                          (i32.add
                            (local.get $p24)
                            (i32.const 12))
                          (f32x4.extract_lane 3
                            (local.get $l91)))
                        (f32.store
                          (i32.add
                            (local.get $p27)
                            (i32.const 12))
                          (f32x4.extract_lane 3
                            (local.get $l95)))
                        (f32.store
                          (i32.add
                            (local.get $p26)
                            (i32.const 12))
                          (f32x4.extract_lane 3
                            (local.get $l52)))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 16)))
                        (local.set $p24
                          (i32.add
                            (local.get $p25)
                            (i32.const 8)))
                        (local.set $p25
                          (local.tee $p27
                            (i32.add
                              (local.get $p25)
                              (i32.const 4))))
                        (br_if $L40
                          (i32.le_s
                            (local.get $p24)
                            (local.get $p0)))))
                    (br_if $B38
                      (i32.le_s
                        (local.get $p0)
                        (local.get $p27)))
                    (block $B43
                      (br_if $B43
                        (i32.eqz
                          (local.get $p4)))
                      (local.set $p24
                        (i32.sub
                          (local.get $p0)
                          (local.get $p27)))
                      (local.set $p26
                        (i32.add
                          (local.get $l39)
                          (local.tee $p13
                            (i32.shl
                              (i32.add
                                (local.get $p27)
                                (local.get $l48))
                              (i32.const 2)))))
                      (local.set $p25
                        (i32.add
                          (local.get $l31)
                          (local.get $p13)))
                      (local.set $p16
                        (i32.add
                          (local.get $l32)
                          (local.get $p13)))
                      (local.set $p27
                        (i32.add
                          (local.get $p3)
                          (local.tee $p13
                            (i32.shl
                              (i32.add
                                (local.get $p27)
                                (local.get $l49))
                              (i32.const 2)))))
                      (local.set $p11
                        (i32.add
                          (local.get $l69)
                          (local.get $p13)))
                      (local.set $p10
                        (i32.add
                          (local.get $l71)
                          (local.get $p13)))
                      (local.set $p13
                        (i32.const 0))
                      (loop $L44
                        (call $positive
                          (f32.load
                            (i32.add
                              (local.get $p27)
                              (local.get $p13)))
                          (f32.load
                            (i32.add
                              (local.get $p11)
                              (local.get $p13)))
                          (f32.load
                            (i32.add
                              (local.get $p10)
                              (local.get $p13)))
                          (i32.add
                            (local.get $l28)
                            (i32.const 528)))
                        (f32.store
                          (i32.add
                            (local.get $p26)
                            (local.get $p13))
                          (f32.load offset=528
                            (local.get $l28)))
                        (f32.store
                          (i32.add
                            (local.get $p25)
                            (local.get $p13))
                          (f32.load offset=532
                            (local.get $l28)))
                        (f32.store
                          (i32.add
                            (local.get $p16)
                            (local.get $p13))
                          (f32.load offset=536
                            (local.get $l28)))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 4)))
                        (br_if $L44
                          (local.tee $p24
                            (i32.add
                              (local.get $p24)
                              (i32.const -1))))
                        (br $B38)))
                    (local.set $p13
                      (i32.shl
                        (local.get $p27)
                        (i32.const 2)))
                    (local.set $p26
                      (i32.sub
                        (local.get $p0)
                        (local.get $p27)))
                    (local.set $p9
                      (i32.add
                        (local.get $l39)
                        (local.tee $p24
                          (i32.mul
                            (local.get $l64)
                            (local.get $p9)))))
                    (local.set $p6
                      (i32.add
                        (local.get $l31)
                        (local.get $p24)))
                    (local.set $p5
                      (i32.add
                        (local.get $l32)
                        (local.get $p24)))
                    (loop $L45
                      (local.set $p24
                        (i32.add
                          (local.get $p18)
                          (i32.mul
                            (local.tee $p25
                              (i32.shr_u
                                (i32.mul
                                  (local.tee $p27
                                    (i32.or
                                      (i32.or
                                        (i32.shl
                                          (local.tee $p16
                                            (i32.load8_u
                                              (i32.add
                                                (local.tee $p24
                                                  (i32.add
                                                    (local.get $l40)
                                                    (local.get $p13)))
                                                (i32.const 1))))
                                          (i32.const 8))
                                        (i32.shl
                                          (local.tee $p11
                                            (i32.load8_u
                                              (local.get $p24)))
                                          (i32.const 16)))
                                      (local.tee $p10
                                        (i32.load8_u
                                          (i32.add
                                            (local.get $p24)
                                            (i32.const 2))))))
                                  (i32.const -1640531535))
                                (i32.const 15)))
                            (i32.const 12))))
                      (block $B46
                        (br_if $B46
                          (i32.eq
                            (i32.load
                              (local.tee $p25
                                (i32.add
                                  (local.get $p17)
                                  (i32.shl
                                    (local.get $p25)
                                    (i32.const 2)))))
                            (local.get $p27)))
                        (call $positive
                          (f32.load
                            (i32.add
                              (local.get $p7)
                              (i32.shl
                                (local.get $p11)
                                (i32.const 2))))
                          (f32.load
                            (i32.add
                              (local.get $p7)
                              (i32.shl
                                (local.get $p16)
                                (i32.const 2))))
                          (f32.load
                            (i32.add
                              (local.get $p7)
                              (i32.shl
                                (local.get $p10)
                                (i32.const 2))))
                          (local.get $p24))
                        (i32.store
                          (local.get $p25)
                          (local.get $p27)))
                      (f32.store
                        (i32.add
                          (local.get $p9)
                          (local.get $p13))
                        (f32.load
                          (local.get $p24)))
                      (f32.store
                        (i32.add
                          (local.get $p6)
                          (local.get $p13))
                        (f32.load offset=4
                          (local.get $p24)))
                      (f32.store
                        (i32.add
                          (local.get $p5)
                          (local.get $p13))
                        (f32.load offset=8
                          (local.get $p24)))
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 4)))
                      (br_if $L45
                        (local.tee $p26
                          (i32.add
                            (local.get $p26)
                            (i32.const -1))))))
                  (local.set $l46
                    (i32.const 0))
                  (loop $L47
                    (local.set $l36
                      (i32.add
                        (i32.add
                          (local.get $l28)
                          (i32.const 480))
                        (i32.mul
                          (local.get $l46)
                          (i32.const 12))))
                    (local.set $p16
                      (i32.load
                        (i32.add
                          (i32.add
                            (local.get $l28)
                            (i32.const 64))
                          (local.tee $p13
                            (i32.shl
                              (local.get $l46)
                              (i32.const 2))))))
                    (local.set $l43
                      (i32.load
                        (i32.add
                          (i32.add
                            (local.get $l28)
                            (i32.const 72))
                          (local.get $p13))))
                    (local.set $p27
                      (i32.const 0))
                    (block $B48
                      (br_if $B48
                        (i32.lt_s
                          (local.get $p0)
                          (i32.const 4)))
                      (local.set $p5
                        (i32.add
                          (local.get $l43)
                          (local.get $l44)))
                      (local.set $p11
                        (i32.add
                          (local.get $l43)
                          (local.get $l29)))
                      (local.set $l35
                        (i32.add
                          (local.get $l43)
                          (local.get $l47)))
                      (local.set $p10
                        (i32.add
                          (i32.load offset=8
                            (local.get $l36))
                          (local.tee $p13
                            (i32.shl
                              (local.get $l48)
                              (i32.const 2)))))
                      (local.set $p9
                        (i32.add
                          (i32.load offset=4
                            (local.get $l36))
                          (local.get $p13)))
                      (local.set $p6
                        (i32.add
                          (i32.load
                            (local.get $l36))
                          (local.get $p13)))
                      (local.set $p25
                        (i32.const 0))
                      (local.set $p13
                        (i32.const 0))
                      (loop $L49
                        (block $B50
                          (block $B51
                            (br_if $B51
                              (i32.eqz
                                (local.get $p16)))
                            (local.set $l82
                              (v128.load align=4
                                (i32.add
                                  (local.get $p5)
                                  (local.get $p13))))
                            (local.set $l83
                              (v128.load align=4
                                (i32.add
                                  (local.get $l35)
                                  (local.get $p13))))
                            (local.set $l84
                              (v128.load align=4
                                (i32.add
                                  (local.get $p11)
                                  (local.get $p13))))
                            (br $B50))
                          (local.set $l84
                            (v128.load32_lane 3
                              (i32.add
                                (local.get $p7)
                                (i32.shl
                                  (i32.load8_u
                                    (i32.add
                                      (local.tee $p24
                                        (i32.add
                                          (local.get $p11)
                                          (local.get $p13)))
                                      (i32.const 12)))
                                  (i32.const 2)))
                              (v128.load32_lane 2
                                (i32.add
                                  (local.get $p7)
                                  (i32.shl
                                    (i32.load8_u
                                      (i32.add
                                        (local.get $p24)
                                        (i32.const 8)))
                                    (i32.const 2)))
                                (v128.load32_lane 1
                                  (i32.add
                                    (local.get $p7)
                                    (i32.shl
                                      (i32.load8_u
                                        (i32.add
                                          (local.get $p24)
                                          (i32.const 4)))
                                      (i32.const 2)))
                                  (v128.load32_zero
                                    (i32.add
                                      (local.get $p7)
                                      (i32.shl
                                        (i32.load8_u
                                          (local.get $p24))
                                        (i32.const 2))))))))
                          (local.set $l82
                            (v128.load32_lane 3
                              (i32.add
                                (local.get $p7)
                                (i32.shl
                                  (i32.load8_u
                                    (i32.add
                                      (local.get $p24)
                                      (i32.const 14)))
                                  (i32.const 2)))
                              (v128.load32_lane 2
                                (i32.add
                                  (local.get $p7)
                                  (i32.shl
                                    (i32.load8_u
                                      (i32.add
                                        (local.get $p24)
                                        (i32.const 10)))
                                    (i32.const 2)))
                                (v128.load32_lane 1
                                  (i32.add
                                    (local.get $p7)
                                    (i32.shl
                                      (i32.load8_u
                                        (i32.add
                                          (local.get $p24)
                                          (i32.const 6)))
                                      (i32.const 2)))
                                  (v128.load32_zero
                                    (i32.add
                                      (local.get $p7)
                                      (i32.shl
                                        (i32.load8_u
                                          (i32.add
                                            (local.get $p24)
                                            (i32.const 2)))
                                        (i32.const 2))))))))
                          (local.set $l83
                            (v128.load32_lane 3
                              (i32.add
                                (local.get $p7)
                                (i32.shl
                                  (i32.load8_u
                                    (i32.add
                                      (local.get $p24)
                                      (i32.const 13)))
                                  (i32.const 2)))
                              (v128.load32_lane 2
                                (i32.add
                                  (local.get $p7)
                                  (i32.shl
                                    (i32.load8_u
                                      (i32.add
                                        (local.get $p24)
                                        (i32.const 9)))
                                    (i32.const 2)))
                                (v128.load32_lane 1
                                  (i32.add
                                    (local.get $p7)
                                    (i32.shl
                                      (i32.load8_u
                                        (i32.add
                                          (local.get $p24)
                                          (i32.const 5)))
                                      (i32.const 2)))
                                  (v128.load32_zero
                                    (i32.add
                                      (local.get $p7)
                                      (i32.shl
                                        (i32.load8_u
                                          (i32.add
                                            (local.get $p24)
                                            (i32.const 1)))
                                        (i32.const 2)))))))))
                        (f32.store
                          (local.tee $p24
                            (i32.add
                              (local.get $p6)
                              (local.get $p13)))
                          (f32x4.extract_lane 0
                            (local.tee $l91
                              (f32x4.add
                                (f32x4.mul
                                  (f32x4.mul
                                    (f32x4.sub
                                      (local.tee $l97
                                        (f32x4.relaxed_madd
                                          (f32x4.mul
                                            (local.tee $l91
                                              (f32x4.relaxed_madd
                                                (local.tee $l85
                                                  (v128.const i32x4 0x3eaaaaab 0x3eaaaaab 0x3eaaaaab 0x3eaaaaab))
                                                (f32x4.relaxed_madd
                                                  (f32x4.neg
                                                    (local.tee $l89
                                                      (v128.andnot
                                                        (local.tee $l52
                                                          (f32x4.relaxed_madd
                                                            (v128.const i32x4 0x3e99999a 0x3e99999a 0x3e99999a 0x3e99999a)
                                                            (local.get $l84)
                                                            (f32x4.relaxed_madd
                                                              (v128.const i32x4 0x3f1f3b64 0x3f1f3b64 0x3f1f3b64 0x3f1f3b64)
                                                              (local.get $l83)
                                                              (local.tee $l87
                                                                (f32x4.relaxed_madd
                                                                  (v128.const i32x4 0x3d9fbe77 0x3d9fbe77 0x3d9fbe77 0x3d9fbe77)
                                                                  (local.get $l82)
                                                                  (local.tee $l86
                                                                    (v128.const i32x4 0x3b789536 0x3b789536 0x3b789536 0x3b789536)))))))
                                                        (f32x4.le
                                                          (local.get $l52)
                                                          (local.tee $l88
                                                            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))))))
                                                  (f32x4.mul
                                                    (local.tee $l95
                                                      (f32x4.mul
                                                        (local.tee $l91
                                                          (f32x4.relaxed_madd
                                                            (local.tee $l91
                                                              (f32x4.mul
                                                                (local.get $l89)
                                                                (local.tee $l90
                                                                  (v128.const i32x4 0xbeaaaaab 0xbeaaaaab 0xbeaaaaab 0xbeaaaaab))))
                                                            (f32x4.mul
                                                              (local.tee $l95
                                                                (f32x4.mul
                                                                  (local.tee $l91
                                                                    (f32x4.relaxed_madd
                                                                      (local.get $l91)
                                                                      (f32x4.mul
                                                                        (local.tee $l96
                                                                          (f32x4.mul
                                                                            (local.tee $l95
                                                                              (f32x4.relaxed_madd
                                                                                (local.get $l91)
                                                                                (f32x4.mul
                                                                                  (local.tee $l52
                                                                                    (f32x4.mul
                                                                                      (local.tee $l95
                                                                                        (v128.and
                                                                                          (i32x4.ne
                                                                                            (local.get $l89)
                                                                                            (local.tee $l92
                                                                                              (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                                                                                          (i32x4.add
                                                                                            (i32x4.mul
                                                                                              (i32x4.shr_u
                                                                                                (local.get $l89)
                                                                                                (i32.const 23))
                                                                                              (local.tee $l93
                                                                                                (v128.const i32x4 0xffd55556 0xffd55556 0xffd55556 0xffd55556)))
                                                                                            (local.tee $l94
                                                                                              (v128.const i32x4 0x54800000 0x54800000 0x54800000 0x54800000)))))
                                                                                      (local.get $l95)))
                                                                                  (local.get $l52))
                                                                                (f32x4.mul
                                                                                  (local.get $l95)
                                                                                  (local.tee $l52
                                                                                    (v128.const i32x4 0x3faaaaab 0x3faaaaab 0x3faaaaab 0x3faaaaab)))))
                                                                            (local.get $l95)))
                                                                        (local.get $l96))
                                                                      (f32x4.mul
                                                                        (local.get $l95)
                                                                        (local.get $l52))))
                                                                  (local.get $l91)))
                                                              (local.get $l95))
                                                            (f32x4.mul
                                                              (local.get $l91)
                                                              (local.get $l52))))
                                                        (local.get $l91)))
                                                    (local.get $l95))
                                                  (local.get $l91))
                                                (local.get $l91)))
                                            (local.get $l91))
                                          (local.get $l89)
                                          (local.tee $l96
                                            (v128.const i32x4 0xbe1fb275 0xbe1fb275 0xbe1fb275 0xbe1fb275))))
                                      (local.tee $l89
                                        (f32x4.relaxed_madd
                                          (f32x4.mul
                                            (local.tee $l91
                                              (f32x4.relaxed_madd
                                                (local.get $l85)
                                                (f32x4.relaxed_madd
                                                  (f32x4.neg
                                                    (local.tee $l89
                                                      (v128.andnot
                                                        (local.tee $l89
                                                          (f32x4.relaxed_madd
                                                            (v128.const i32x4 0x3e6b851f 0x3e6b851f 0x3e6b851f 0x3e6b851f)
                                                            (local.get $l84)
                                                            (f32x4.relaxed_madd
                                                              (v128.const i32x4 0x3f3126e9 0x3f3126e9 0x3f3126e9 0x3f3126e9)
                                                              (local.get $l83)
                                                              (local.get $l87))))
                                                        (f32x4.le
                                                          (local.get $l89)
                                                          (local.get $l88)))))
                                                  (f32x4.mul
                                                    (local.tee $l95
                                                      (f32x4.mul
                                                        (local.tee $l91
                                                          (f32x4.relaxed_madd
                                                            (local.tee $l91
                                                              (f32x4.mul
                                                                (local.get $l89)
                                                                (local.get $l90)))
                                                            (f32x4.mul
                                                              (local.tee $l95
                                                                (f32x4.mul
                                                                  (local.tee $l91
                                                                    (f32x4.relaxed_madd
                                                                      (local.get $l91)
                                                                      (f32x4.mul
                                                                        (local.tee $l87
                                                                          (f32x4.mul
                                                                            (local.tee $l95
                                                                              (f32x4.relaxed_madd
                                                                                (local.get $l91)
                                                                                (f32x4.mul
                                                                                  (local.tee $l87
                                                                                    (f32x4.mul
                                                                                      (local.tee $l95
                                                                                        (v128.and
                                                                                          (i32x4.ne
                                                                                            (local.get $l89)
                                                                                            (local.get $l92))
                                                                                          (i32x4.add
                                                                                            (i32x4.mul
                                                                                              (i32x4.shr_u
                                                                                                (local.get $l89)
                                                                                                (i32.const 23))
                                                                                              (local.get $l93))
                                                                                            (local.get $l94))))
                                                                                      (local.get $l95)))
                                                                                  (local.get $l87))
                                                                                (f32x4.mul
                                                                                  (local.get $l95)
                                                                                  (local.get $l52))))
                                                                            (local.get $l95)))
                                                                        (local.get $l87))
                                                                      (f32x4.mul
                                                                        (local.get $l95)
                                                                        (local.get $l52))))
                                                                  (local.get $l91)))
                                                              (local.get $l95))
                                                            (f32x4.mul
                                                              (local.get $l91)
                                                              (local.get $l52))))
                                                        (local.get $l91)))
                                                    (local.get $l95))
                                                  (local.get $l91))
                                                (local.get $l91)))
                                            (local.get $l91))
                                          (local.get $l89)
                                          (local.get $l96))))
                                    (local.tee $l95
                                      (v128.const i32x4 0x3f000000 0x3f000000 0x3f000000 0x3f000000)))
                                  (v128.const i32x4 0x41600000 0x41600000 0x41600000 0x41600000))
                                (v128.const i32x4 0x3ed70a3d 0x3ed70a3d 0x3ed70a3d 0x3ed70a3d)))))
                        (f32.store
                          (local.tee $p27
                            (i32.add
                              (local.get $p9)
                              (local.get $p13)))
                          (f32x4.extract_lane 0
                            (local.tee $l95
                              (f32x4.add
                                (local.tee $l87
                                  (f32x4.mul
                                    (f32x4.add
                                      (local.get $l97)
                                      (local.get $l89))
                                    (local.get $l95)))
                                (v128.const i32x4 0x3c23d70a 0x3c23d70a 0x3c23d70a 0x3c23d70a)))))
                        (f32.store
                          (local.tee $p26
                            (i32.add
                              (local.get $p10)
                              (local.get $p13)))
                          (f32x4.extract_lane 0
                            (local.tee $l52
                              (f32x4.add
                                (f32x4.sub
                                  (f32x4.relaxed_madd
                                    (f32x4.mul
                                      (local.tee $l52
                                        (f32x4.relaxed_madd
                                          (local.get $l85)
                                          (f32x4.relaxed_madd
                                            (f32x4.neg
                                              (local.tee $l89
                                                (v128.andnot
                                                  (local.tee $l89
                                                    (f32x4.relaxed_madd
                                                      (v128.const i32x4 0x3e7943cc 0x3e7943cc 0x3e7943cc 0x3e7943cc)
                                                      (local.get $l84)
                                                      (f32x4.relaxed_madd
                                                        (v128.const i32x4 0x3e51ae8f 0x3e51ae8f 0x3e51ae8f 0x3e51ae8f)
                                                        (local.get $l83)
                                                        (f32x4.relaxed_madd
                                                          (v128.const i32x4 0x3f0d4369 0x3f0d4369 0x3f0d4369 0x3f0d4369)
                                                          (local.get $l82)
                                                          (local.get $l86)))))
                                                  (f32x4.le
                                                    (local.get $l89)
                                                    (local.get $l88)))))
                                            (f32x4.mul
                                              (local.tee $l83
                                                (f32x4.mul
                                                  (local.tee $l52
                                                    (f32x4.relaxed_madd
                                                      (local.tee $l83
                                                        (f32x4.mul
                                                          (local.get $l89)
                                                          (local.get $l90)))
                                                      (f32x4.mul
                                                        (local.tee $l84
                                                          (f32x4.mul
                                                            (local.tee $l83
                                                              (f32x4.relaxed_madd
                                                                (local.get $l83)
                                                                (f32x4.mul
                                                                  (local.tee $l82
                                                                    (f32x4.mul
                                                                      (local.tee $l84
                                                                        (f32x4.relaxed_madd
                                                                          (local.get $l83)
                                                                          (f32x4.mul
                                                                            (local.tee $l82
                                                                              (f32x4.mul
                                                                                (local.tee $l84
                                                                                  (v128.and
                                                                                    (i32x4.ne
                                                                                      (local.get $l89)
                                                                                      (local.get $l92))
                                                                                    (i32x4.add
                                                                                      (i32x4.mul
                                                                                        (i32x4.shr_u
                                                                                          (local.get $l89)
                                                                                          (i32.const 23))
                                                                                        (local.get $l93))
                                                                                      (local.get $l94))))
                                                                                (local.get $l84)))
                                                                            (local.get $l82))
                                                                          (f32x4.mul
                                                                            (local.get $l84)
                                                                            (local.get $l52))))
                                                                      (local.get $l84)))
                                                                  (local.get $l82))
                                                                (f32x4.mul
                                                                  (local.get $l84)
                                                                  (local.get $l52))))
                                                            (local.get $l83)))
                                                        (local.get $l84))
                                                      (f32x4.mul
                                                        (local.get $l83)
                                                        (local.get $l52))))
                                                  (local.get $l52)))
                                              (local.get $l83))
                                            (local.get $l52))
                                          (local.get $l52)))
                                      (local.get $l52))
                                    (local.get $l89)
                                    (local.get $l96))
                                  (local.get $l87))
                                (v128.const i32x4 0x3f0ccccd 0x3f0ccccd 0x3f0ccccd 0x3f0ccccd)))))
                        (f32.store
                          (i32.add
                            (local.get $p24)
                            (i32.const 4))
                          (f32x4.extract_lane 1
                            (local.get $l91)))
                        (f32.store
                          (i32.add
                            (local.get $p27)
                            (i32.const 4))
                          (f32x4.extract_lane 1
                            (local.get $l95)))
                        (f32.store
                          (i32.add
                            (local.get $p26)
                            (i32.const 4))
                          (f32x4.extract_lane 1
                            (local.get $l52)))
                        (f32.store
                          (i32.add
                            (local.get $p24)
                            (i32.const 8))
                          (f32x4.extract_lane 2
                            (local.get $l91)))
                        (f32.store
                          (i32.add
                            (local.get $p27)
                            (i32.const 8))
                          (f32x4.extract_lane 2
                            (local.get $l95)))
                        (f32.store
                          (i32.add
                            (local.get $p26)
                            (i32.const 8))
                          (f32x4.extract_lane 2
                            (local.get $l52)))
                        (f32.store
                          (i32.add
                            (local.get $p24)
                            (i32.const 12))
                          (f32x4.extract_lane 3
                            (local.get $l91)))
                        (f32.store
                          (i32.add
                            (local.get $p27)
                            (i32.const 12))
                          (f32x4.extract_lane 3
                            (local.get $l95)))
                        (f32.store
                          (i32.add
                            (local.get $p26)
                            (i32.const 12))
                          (f32x4.extract_lane 3
                            (local.get $l52)))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 16)))
                        (local.set $p24
                          (i32.add
                            (local.get $p25)
                            (i32.const 8)))
                        (local.set $p25
                          (local.tee $p27
                            (i32.add
                              (local.get $p25)
                              (i32.const 4))))
                        (br_if $L49
                          (i32.le_s
                            (local.get $p24)
                            (local.get $p0)))))
                    (block $B52
                      (br_if $B52
                        (i32.le_s
                          (local.get $p0)
                          (local.get $p27)))
                      (local.set $p10
                        (i32.load offset=8
                          (local.get $l36)))
                      (local.set $p25
                        (i32.load offset=4
                          (local.get $l36)))
                      (local.set $p26
                        (i32.load
                          (local.get $l36)))
                      (block $B53
                        (br_if $B53
                          (i32.eqz
                            (local.get $p16)))
                        (local.set $p24
                          (i32.sub
                            (local.get $p0)
                            (local.get $p27)))
                        (local.set $p26
                          (i32.add
                            (local.get $p26)
                            (local.tee $p13
                              (i32.shl
                                (i32.add
                                  (local.get $l48)
                                  (local.get $p27))
                                (i32.const 2)))))
                        (local.set $p25
                          (i32.add
                            (local.get $p25)
                            (local.get $p13)))
                        (local.set $p16
                          (i32.add
                            (local.get $p10)
                            (local.get $p13)))
                        (local.set $p11
                          (i32.add
                            (local.tee $p27
                              (i32.add
                                (local.get $l43)
                                (i32.shl
                                  (i32.add
                                    (local.get $l49)
                                    (local.get $p27))
                                  (i32.const 2))))
                            (local.get $l68)))
                        (local.set $p10
                          (i32.add
                            (local.get $p27)
                            (local.get $l70)))
                        (local.set $p13
                          (i32.const 0))
                        (loop $L54
                          (call $positive
                            (f32.load
                              (i32.add
                                (local.get $p27)
                                (local.get $p13)))
                            (f32.load
                              (i32.add
                                (local.get $p11)
                                (local.get $p13)))
                            (f32.load
                              (i32.add
                                (local.get $p10)
                                (local.get $p13)))
                            (i32.add
                              (local.get $l28)
                              (i32.const 528)))
                          (f32.store
                            (i32.add
                              (local.get $p26)
                              (local.get $p13))
                            (f32.load offset=528
                              (local.get $l28)))
                          (f32.store
                            (i32.add
                              (local.get $p25)
                              (local.get $p13))
                            (f32.load offset=532
                              (local.get $l28)))
                          (f32.store
                            (i32.add
                              (local.get $p16)
                              (local.get $p13))
                            (f32.load offset=536
                              (local.get $l28)))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 4)))
                          (br_if $L54
                            (local.tee $p24
                              (i32.add
                                (local.get $p24)
                                (i32.const -1))))
                          (br $B52)))
                      (local.set $p11
                        (i32.sub
                          (local.get $p0)
                          (local.get $p27)))
                      (local.set $p13
                        (i32.add
                          (local.get $l43)
                          (i32.shl
                            (i32.add
                              (local.get $l49)
                              (local.get $p27))
                            (i32.const 2))))
                      (local.set $p27
                        (i32.add
                          (local.get $p26)
                          (local.tee $p24
                            (i32.shl
                              (i32.add
                                (local.get $l48)
                                (local.get $p27))
                              (i32.const 2)))))
                      (local.set $p26
                        (i32.add
                          (local.get $p25)
                          (local.get $p24)))
                      (local.set $p25
                        (i32.add
                          (local.get $p10)
                          (local.get $p24)))
                      (loop $L55
                        (local.set $p24
                          (i32.add
                            (local.get $p18)
                            (i32.mul
                              (local.tee $p10
                                (i32.shr_u
                                  (i32.mul
                                    (local.tee $p16
                                      (i32.or
                                        (i32.or
                                          (i32.shl
                                            (local.tee $p9
                                              (i32.load8_u
                                                (i32.add
                                                  (local.get $p13)
                                                  (i32.const 1))))
                                            (i32.const 8))
                                          (i32.shl
                                            (local.tee $p6
                                              (i32.load8_u
                                                (local.get $p13)))
                                            (i32.const 16)))
                                        (local.tee $p5
                                          (i32.load8_u
                                            (i32.add
                                              (local.get $p13)
                                              (i32.const 2))))))
                                    (i32.const -1640531535))
                                  (i32.const 15)))
                              (i32.const 12))))
                        (block $B56
                          (br_if $B56
                            (i32.eq
                              (i32.load
                                (local.tee $p10
                                  (i32.add
                                    (local.get $p17)
                                    (i32.shl
                                      (local.get $p10)
                                      (i32.const 2)))))
                              (local.get $p16)))
                          (call $positive
                            (f32.load
                              (i32.add
                                (local.get $p7)
                                (i32.shl
                                  (local.get $p6)
                                  (i32.const 2))))
                            (f32.load
                              (i32.add
                                (local.get $p7)
                                (i32.shl
                                  (local.get $p9)
                                  (i32.const 2))))
                            (f32.load
                              (i32.add
                                (local.get $p7)
                                (i32.shl
                                  (local.get $p5)
                                  (i32.const 2))))
                            (local.get $p24))
                          (i32.store
                            (local.get $p10)
                            (local.get $p16)))
                        (f32.store
                          (local.get $p27)
                          (f32.load
                            (local.get $p24)))
                        (f32.store
                          (local.get $p26)
                          (f32.load offset=4
                            (local.get $p24)))
                        (f32.store
                          (local.get $p25)
                          (f32.load offset=8
                            (local.get $p24)))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 4)))
                        (local.set $p27
                          (i32.add
                            (local.get $p27)
                            (i32.const 4)))
                        (local.set $p26
                          (i32.add
                            (local.get $p26)
                            (i32.const 4)))
                        (local.set $p25
                          (i32.add
                            (local.get $p25)
                            (i32.const 4)))
                        (br_if $L55
                          (local.tee $p11
                            (i32.add
                              (local.get $p11)
                              (i32.const -1))))))
                    (br_if $L47
                      (i32.ne
                        (local.tee $l46
                          (i32.add
                            (local.get $l46)
                            (i32.const 1)))
                        (local.get $l34))))
                  (local.set $l44
                    (i32.add
                      (local.get $l44)
                      (local.get $l64)))
                  (local.set $l29
                    (i32.add
                      (local.get $l29)
                      (local.get $l64)))
                  (local.set $l47
                    (i32.add
                      (local.get $l47)
                      (local.get $l64)))
                  (local.set $l49
                    (i32.add
                      (local.get $l49)
                      (local.get $p0)))
                  (local.set $l45
                    (i32.add
                      (local.get $l45)
                      (local.get $l64)))
                  (local.set $l42
                    (i32.add
                      (local.get $l42)
                      (local.get $l64)))
                  (local.set $l40
                    (i32.add
                      (local.get $l40)
                      (local.get $l64)))
                  (br_if $L37
                    (i32.ne
                      (local.tee $l38
                        (i32.add
                          (local.get $l38)
                          (i32.const 1)))
                      (local.get $l81))))
                (local.set $l98
                  (local.get $l81))
                (br $B35))
              (local.set $l98
                (select
                  (local.get $l81)
                  (i32.const 1)
                  (i32.gt_s
                    (local.get $l81)
                    (i32.const 1)))))
            (local.set $l99
              (i32.or
                (i32.lt_s
                  (local.get $p0)
                  (i32.const 1))
                (local.get $l37)))
            (local.set $p5
              (i32.and
                (local.get $l98)
                (i32.const 3)))
            (local.set $p10
              (i32.and
                (local.get $l98)
                (i32.const -2)))
            (local.set $l38
              (i32.and
                (local.get $l98)
                (i32.const 1)))
            (local.set $p6
              (i32.add
                (local.get $l98)
                (i32.const -1)))
            (local.set $l100
              (i32.mul
                (local.get $l64)
                (local.get $p23)))
            (local.set $l101
              (i32.const 0))
            (local.set $p11
              (i32.sub
                (i32.const 0)
                (local.tee $l102
                  (i32.and
                    (local.get $l98)
                    (i32.const -4)))))
            (local.set $l46
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 16))
                (local.tee $l104
                  (i32.shl
                    (i32x4.extract_lane 3
                      (local.tee $l52
                        (i32x4.min_s
                          (i32x4.splat
                            (i32.add
                              (local.get $l81)
                              (i32.const -1)))
                          (local.tee $l103
                            (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003)))))
                    (i32.const 2)))))
            (local.set $l36
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 32))
                (local.get $l104)))
            (local.set $l43
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 16))
                (local.tee $l105
                  (i32.shl
                    (i32x4.extract_lane 2
                      (local.get $l52))
                    (i32.const 2)))))
            (local.set $l48
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 32))
                (local.get $l105)))
            (local.set $l49
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 16))
                (local.tee $l106
                  (i32.shl
                    (i32x4.extract_lane 1
                      (local.get $l52))
                    (i32.const 2)))))
            (local.set $l29
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 32))
                (local.get $l106)))
            (local.set $l47
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 16))
                (local.tee $l107
                  (i32.shl
                    (i32x4.extract_lane 0
                      (local.get $l52))
                    (i32.const 2)))))
            (local.set $l44
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 32))
                (local.get $l107)))
            (local.set $l108
              (i32x4.splat
                (local.get $p23)))
            (loop $L57
              (block $B58
                (br_if $B58
                  (i32.eqz
                    (i32.and
                      (local.tee $p13
                        (i32.shl
                          (i32.const 1)
                          (local.get $l101)))
                      (local.get $p2))))
                (local.set $l109
                  (i32.and
                    (local.get $p13)
                    (local.get $p12)))
                (local.set $l110
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (i32.const 504))
                    (local.tee $p13
                      (i32.shl
                        (local.get $l101)
                        (i32.const 2)))))
                (local.set $l111
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (i32.const 516))
                    (local.get $p13)))
                (local.set $l112
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (i32.const 352))
                    (i32.mul
                      (local.get $l101)
                      (i32.const 20))))
                (local.set $l113
                  (i32.add
                    (i32.add
                      (local.get $l28)
                      (i32.const 480))
                    (local.get $p13)))
                (local.set $p15
                  (i32.const 0))
                (loop $L59
                  (block $B60
                    (br_if $B60
                      (local.get $l37))
                    (local.set $p25
                      (i32.load
                        (i32.add
                          (local.get $l113)
                          (i32.mul
                            (local.get $p15)
                            (i32.const 12)))))
                    (block $B61
                      (br_if $B61
                        (local.get $l109))
                      (local.set $p9
                        (i32.load
                          (local.get $l110)))
                      (local.set $p24
                        (i32.const 0))
                      (block $B62
                        (br_if $B62
                          (i32.lt_u
                            (local.get $l98)
                            (i32.const 4)))
                        (local.set $l89
                          (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                        (local.set $p13
                          (i32.add
                            (local.get $l28)
                            (i32.const 16)))
                        (local.set $p24
                          (i32.add
                            (local.get $l28)
                            (i32.const 32)))
                        (local.set $p27
                          (local.get $l102))
                        (loop $L63
                          (v128.store
                            (local.get $p13)
                            (i32x4.add
                              (i32x4.splat
                                (local.get $p25))
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
                                                    (local.get $l89)
                                                    (local.get $l108))))
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
                                    (local.get $l73))
                                  (i32.const 2)))))
                          (v128.store
                            (local.get $p24)
                            (i32x4.add
                              (i32x4.splat
                                (local.get $p9))
                              (local.get $l52)))
                          (local.set $p24
                            (i32.add
                              (local.get $p24)
                              (i32.const 16)))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 16)))
                          (local.set $l89
                            (i32x4.add
                              (local.get $l89)
                              (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                          (br_if $L63
                            (local.tee $p27
                              (i32.add
                                (local.get $p27)
                                (i32.const -4)))))
                        (local.set $p24
                          (local.get $l102))
                        (br_if $B60
                          (i32.eq
                            (local.get $l98)
                            (local.get $l102))))
                      (local.set $p13
                        (i32.add
                          (local.get $p23)
                          (local.get $p24)))
                      (local.set $p26
                        (i32.sub
                          (local.get $l98)
                          (local.get $p24)))
                      (local.set $p24
                        (i32.add
                          (i32.add
                            (local.get $l28)
                            (i32.const 32))
                          (local.tee $p27
                            (i32.shl
                              (local.get $p24)
                              (i32.const 2)))))
                      (local.set $p27
                        (i32.add
                          (i32.add
                            (local.get $l28)
                            (i32.const 16))
                          (local.get $p27)))
                      (loop $L64
                        (i32.store
                          (local.get $p27)
                          (i32.add
                            (local.get $p25)
                            (local.tee $p16
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
                            (local.get $p9)
                            (local.get $p16)))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 1)))
                        (local.set $p24
                          (i32.add
                            (local.get $p24)
                            (i32.const 4)))
                        (local.set $p27
                          (i32.add
                            (local.get $p27)
                            (i32.const 4)))
                        (br_if $L64
                          (local.tee $p26
                            (i32.add
                              (local.get $p26)
                              (i32.const -1))))
                        (br $B60)))
                    (local.set $p26
                      (i32.load
                        (local.get $l111)))
                    (local.set $p27
                      (i32.const 0))
                    (block $B65
                      (br_if $B65
                        (i32.lt_u
                          (local.get $l98)
                          (i32.const 4)))
                      (local.set $l89
                        (v128.const i32x4 0x00000000 0x00000001 0x00000002 0x00000003))
                      (local.set $p13
                        (i32.add
                          (local.get $l28)
                          (i32.const 16)))
                      (local.set $p24
                        (i32.add
                          (local.get $l28)
                          (i32.const 32)))
                      (local.set $p27
                        (local.get $l102))
                      (loop $L66
                        (v128.store
                          (local.get $p24)
                          (i32x4.add
                            (i32x4.splat
                              (local.get $p26))
                            (i32x4.shl
                              (i32x4.mul
                                (local.tee $l52
                                  (i32x4.add
                                    (local.get $l89)
                                    (local.get $l108)))
                                (local.get $l73))
                              (i32.const 2))))
                        (v128.store
                          (local.get $p13)
                          (i32x4.add
                            (i32x4.splat
                              (local.get $p25))
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
                                (local.get $l73))
                              (i32.const 2))))
                        (local.set $p24
                          (i32.add
                            (local.get $p24)
                            (i32.const 16)))
                        (local.set $p13
                          (i32.add
                            (local.get $p13)
                            (i32.const 16)))
                        (local.set $l89
                          (i32x4.add
                            (local.get $l89)
                            (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                        (br_if $L66
                          (local.tee $p27
                            (i32.add
                              (local.get $p27)
                              (i32.const -4)))))
                      (local.set $p27
                        (local.get $l102))
                      (br_if $B60
                        (i32.eq
                          (local.get $l98)
                          (local.get $l102))))
                    (local.set $p16
                      (i32.sub
                        (local.get $l98)
                        (local.get $p27)))
                    (local.set $p24
                      (i32.add
                        (local.get $p26)
                        (i32.mul
                          (local.get $l64)
                          (local.tee $p13
                            (i32.add
                              (local.get $p23)
                              (local.get $p27))))))
                    (local.set $p27
                      (i32.add
                        (i32.add
                          (local.get $l28)
                          (i32.const 16))
                        (local.tee $p26
                          (i32.shl
                            (local.get $p27)
                            (i32.const 2)))))
                    (local.set $p26
                      (i32.add
                        (i32.add
                          (local.get $l28)
                          (i32.const 32))
                        (local.get $p26)))
                    (loop $L67
                      (i32.store
                        (local.get $p26)
                        (local.get $p24))
                      (i32.store
                        (local.get $p27)
                        (i32.add
                          (local.get $p25)
                          (i32.shl
                            (i32.mul
                              (i32.rem_s
                                (local.get $p13)
                                (i32.const 16))
                              (local.get $p0))
                            (i32.const 2))))
                      (local.set $p27
                        (i32.add
                          (local.get $p27)
                          (i32.const 4)))
                      (local.set $p26
                        (i32.add
                          (local.get $p26)
                          (i32.const 4)))
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 1)))
                      (local.set $p24
                        (i32.add
                          (local.get $p24)
                          (local.get $l64)))
                      (br_if $L67
                        (local.tee $p16
                          (i32.add
                            (local.get $p16)
                            (i32.const -1))))))
                  (block $B68
                    (br_if $B68
                      (i32.or
                        (local.get $p15)
                        (local.get $l109)))
                    (br_if $B68
                      (i32.or
                        (i32.eqz
                          (local.tee $p13
                            (i32.load
                              (local.get $l111))))
                        (local.get $l99)))
                    (local.set $p9
                      (i32.const 0))
                    (local.set $p26
                      (local.tee $l35
                        (i32.add
                          (local.get $l100)
                          (local.get $p13))))
                    (loop $L69
                      (local.set $p25
                        (i32.load
                          (i32.add
                            (i32.add
                              (local.get $l28)
                              (i32.const 32))
                            (i32.shl
                              (local.get $p9)
                              (i32.const 2)))))
                      (local.set $p27
                        (i32.const 0))
                      (block $B70
                        (block $B71
                          (br_if $B71
                            (i32.lt_u
                              (local.get $p0)
                              (i32.const 4)))
                          (local.set $p27
                            (i32.const 0))
                          (br_if $B71
                            (i32.gt_u
                              (i32.sub
                                (local.get $p25)
                                (i32.add
                                  (local.get $l35)
                                  (i32.mul
                                    (local.get $l64)
                                    (local.get $p9))))
                              (i32.const -16)))
                          (local.set $p13
                            (local.get $p25))
                          (local.set $p24
                            (local.get $p26))
                          (local.set $p27
                            (local.get $l58))
                          (loop $L72
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
                            (br_if $L72
                              (local.tee $p27
                                (i32.add
                                  (local.get $p27)
                                  (i32.const -4)))))
                          (local.set $p27
                            (local.get $l58))
                          (br_if $B70
                            (i32.eq
                              (local.get $p0)
                              (local.get $l58))))
                        (local.set $p16
                          (local.get $p27))
                        (block $B73
                          (br_if $B73
                            (i32.eqz
                              (local.get $l59)))
                          (local.set $p16
                            (i32.add
                              (local.get $l59)
                              (local.get $p27)))
                          (local.set $p13
                            (i32.shl
                              (local.get $p27)
                              (i32.const 2)))
                          (local.set $p24
                            (local.get $l59))
                          (loop $L74
                            (f32.store
                              (i32.add
                                (local.get $p26)
                                (local.get $p13))
                              (f32.load
                                (i32.add
                                  (local.get $p25)
                                  (local.get $p13))))
                            (local.set $p13
                              (i32.add
                                (local.get $p13)
                                (i32.const 4)))
                            (br_if $L74
                              (local.tee $p24
                                (i32.add
                                  (local.get $p24)
                                  (i32.const -1))))))
                        (br_if $B70
                          (i32.gt_u
                            (i32.sub
                              (local.get $p27)
                              (local.get $p0))
                            (i32.const -4)))
                        (local.set $p13
                          (i32.shl
                            (local.get $p16)
                            (i32.const 2)))
                        (local.set $p16
                          (i32.sub
                            (local.get $p0)
                            (local.get $p16)))
                        (loop $L75
                          (f32.store
                            (local.tee $p24
                              (i32.add
                                (local.get $p26)
                                (local.get $p13)))
                            (f32.load
                              (local.tee $p27
                                (i32.add
                                  (local.get $p25)
                                  (local.get $p13)))))
                          (f32.store
                            (i32.add
                              (local.get $p24)
                              (i32.const 4))
                            (f32.load
                              (i32.add
                                (local.get $p27)
                                (i32.const 4))))
                          (f32.store
                            (i32.add
                              (local.get $p24)
                              (i32.const 8))
                            (f32.load
                              (i32.add
                                (local.get $p27)
                                (i32.const 8))))
                          (f32.store
                            (i32.add
                              (local.get $p24)
                              (i32.const 12))
                            (f32.load
                              (i32.add
                                (local.get $p27)
                                (i32.const 12))))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 16)))
                          (br_if $L75
                            (local.tee $p16
                              (i32.add
                                (local.get $p16)
                                (i32.const -4))))))
                      (local.set $p26
                        (i32.add
                          (local.get $p26)
                          (local.get $l64)))
                      (br_if $L69
                        (i32.ne
                          (local.tee $p9
                            (i32.add
                              (local.get $p9)
                              (i32.const 1)))
                          (local.get $l98)))))
                  (local.set $p21
                    (i32.add
                      (local.get $l112)
                      (i32.mul
                        (local.get $p15)
                        (i32.const 60))))
                  (local.set $l114
                    (i32.add
                      (i32.add
                        (local.get $l28)
                        (i32.const 80))
                      (local.tee $p13
                        (i32.shl
                          (local.get $p15)
                          (i32.const 2)))))
                  (local.set $l115
                    (i32.add
                      (i32.add
                        (local.get $l28)
                        (i32.const 88))
                      (local.get $p13)))
                  (local.set $p9
                    (i32.const 0))
                  (loop $L76
                    (block $B77
                      (br_if $B77
                        (i32.eqz
                          (local.tee $p26
                            (i32.load
                              (i32.add
                                (local.get $p21)
                                (i32.shl
                                  (local.get $p9)
                                  (i32.const 2)))))))
                      (local.set $p16
                        (i32.and
                          (local.get $p9)
                          (i32.const 5)))
                      (block $B78
                        (br_if $B78
                          (i32.eqz
                            (local.get $p15)))
                        (br_if $B77
                          (i32.eqz
                            (local.get $p16))))
                      (block $B79
                        (br_if $B79
                          (local.get $l37))
                        (local.set $p24
                          (i32.const 0))
                        (block $B80
                          (br_if $B80
                            (i32.lt_u
                              (local.get $l98)
                              (i32.const 4)))
                          (local.set $p13
                            (local.get $l28))
                          (local.set $p24
                            (local.get $l102))
                          (local.set $l89
                            (local.get $l103))
                          (loop $L81
                            (v128.store
                              (local.get $p13)
                              (i32x4.add
                                (i32x4.splat
                                  (local.get $p26))
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
                                                    (local.get $l89)
                                                    (local.get $l108))))
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
                                    (local.get $l73))
                                  (i32.const 2))))
                            (local.set $p13
                              (i32.add
                                (local.get $p13)
                                (i32.const 16)))
                            (local.set $l89
                              (i32x4.add
                                (local.get $l89)
                                (v128.const i32x4 0x00000004 0x00000004 0x00000004 0x00000004)))
                            (br_if $L81
                              (local.tee $p24
                                (i32.add
                                  (local.get $p24)
                                  (i32.const -4)))))
                          (local.set $p24
                            (local.get $l102))
                          (br_if $B79
                            (i32.eq
                              (local.get $l98)
                              (local.get $l102))))
                        (local.set $p13
                          (i32.add
                            (local.get $p23)
                            (local.get $p24)))
                        (local.set $p27
                          (i32.sub
                            (local.get $l98)
                            (local.get $p24)))
                        (local.set $p24
                          (i32.add
                            (local.get $l28)
                            (i32.shl
                              (local.get $p24)
                              (i32.const 2))))
                        (loop $L82
                          (i32.store
                            (local.get $p24)
                            (i32.add
                              (local.get $p26)
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
                          (br_if $L82
                            (local.tee $p27
                              (i32.add
                                (local.get $p27)
                                (i32.const -1))))))
                      (local.set $p25
                        (i32.and
                          (local.get $p9)
                          (i32.const 6)))
                      (local.set $l33
                        (select
                          (i32.add
                            (local.get $l28)
                            (i32.const 16))
                          (i32.add
                            (local.get $l28)
                            (i32.const 32))
                          (i32.eq
                            (local.get $p16)
                            (i32.const 1))))
                      (local.set $l35
                        (i32.load
                          (local.get $l114)))
                      (local.set $p22
                        (i32.load
                          (local.get $l115)))
                      (local.set $p26
                        (i32.const 0))
                      (block $B83
                        (br_if $B83
                          (local.tee $l116
                            (i32.lt_s
                              (local.get $p0)
                              (i32.const 4))))
                        (local.set $p16
                          (i32.add
                            (local.get $l33)
                            (local.get $l104)))
                        (local.set $l40
                          (i32.add
                            (local.get $l33)
                            (local.get $l105)))
                        (local.set $l45
                          (i32.add
                            (local.get $l33)
                            (local.get $l106)))
                        (local.set $l42
                          (i32.add
                            (local.get $l33)
                            (local.get $l107)))
                        (local.set $p26
                          (i32.const 0))
                        (local.set $p13
                          (i32.const 0))
                        (local.set $p24
                          (local.get $p22))
                        (loop $L84
                          (local.set $p27
                            (local.get $p26))
                          (block $B85
                            (block $B86
                              (br_if $B86
                                (i32.ne
                                  (local.get $p9)
                                  (i32.const 4)))
                              (local.set $l52
                                (f32x4.mul
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l36))
                                      (local.get $p13)))
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l46))
                                      (local.get $p13)))))
                              (local.set $l89
                                (f32x4.mul
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l48))
                                      (local.get $p13)))
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l43))
                                      (local.get $p13)))))
                              (local.set $l83
                                (f32x4.mul
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l29))
                                      (local.get $p13)))
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l49))
                                      (local.get $p13)))))
                              (local.set $l84
                                (f32x4.mul
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l44))
                                      (local.get $p13)))
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l47))
                                      (local.get $p13)))))
                              (br $B85))
                            (block $B87
                              (br_if $B87
                                (i32.eq
                                  (local.get $p25)
                                  (i32.const 2)))
                              (local.set $l52
                                (v128.load align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $p16))
                                    (local.get $p13))))
                              (local.set $l89
                                (v128.load align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $l40))
                                    (local.get $p13))))
                              (local.set $l83
                                (v128.load align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $l45))
                                    (local.get $p13))))
                              (local.set $l84
                                (v128.load align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $l42))
                                    (local.get $p13))))
                              (br $B85))
                            (local.set $l52
                              (f32x4.mul
                                (local.tee $l52
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $p16))
                                      (local.get $p13))))
                                (local.get $l52)))
                            (local.set $l89
                              (f32x4.mul
                                (local.tee $l89
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l40))
                                      (local.get $p13))))
                                (local.get $l89)))
                            (local.set $l83
                              (f32x4.mul
                                (local.tee $l83
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l45))
                                      (local.get $p13))))
                                (local.get $l83)))
                            (local.set $l84
                              (f32x4.mul
                                (local.tee $l84
                                  (v128.load align=1
                                    (i32.add
                                      (i32.load
                                        (local.get $l42))
                                      (local.get $p13))))
                                (local.get $l84))))
                          (v128.store align=1
                            (i32.add
                              (local.get $p24)
                              (i32.const 48))
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
                              (local.tee $l91
                                (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                                  (local.get $l84)
                                  (local.get $l83)))
                              (local.tee $l95
                                (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                                  (local.get $l89)
                                  (local.get $l52)))))
                          (v128.store align=1
                            (i32.add
                              (local.get $p24)
                              (i32.const 32))
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (local.get $l91)
                              (local.get $l95)))
                          (v128.store align=1
                            (i32.add
                              (local.get $p24)
                              (i32.const 16))
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
                              (local.tee $l83
                                (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                                  (local.get $l84)
                                  (local.get $l83)))
                              (local.tee $l52
                                (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                                  (local.get $l89)
                                  (local.get $l52)))))
                          (v128.store align=1
                            (local.get $p24)
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (local.get $l83)
                              (local.get $l52)))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 16)))
                          (local.set $p24
                            (i32.add
                              (local.get $p24)
                              (i32.const 64)))
                          (local.set $p26
                            (i32.add
                              (local.get $p27)
                              (i32.const 4)))
                          (br_if $L84
                            (i32.le_s
                              (i32.add
                                (local.get $p27)
                                (i32.const 8))
                              (local.get $p0)))))
                      (block $B88
                        (br_if $B88
                          (i32.le_s
                            (local.get $p0)
                            (local.get $p26)))
                        (local.set $p27
                          (i32.sub
                            (local.get $p0)
                            (local.get $p26)))
                        (local.set $p13
                          (i32.shl
                            (local.get $p26)
                            (i32.const 2)))
                        (local.set $p24
                          (i32.add
                            (local.get $p22)
                            (i32.shl
                              (local.get $p26)
                              (i32.const 4))))
                        (local.set $p26
                          (i32.add
                            (local.get $l33)
                            (local.get $l104)))
                        (local.set $p16
                          (i32.add
                            (local.get $l33)
                            (local.get $l105)))
                        (local.set $l40
                          (i32.add
                            (local.get $l33)
                            (local.get $l106)))
                        (local.set $l45
                          (i32.add
                            (local.get $l33)
                            (local.get $l107)))
                        (loop $L89
                          (block $B90
                            (block $B91
                              (br_if $B91
                                (i32.ne
                                  (local.get $p9)
                                  (i32.const 4)))
                              (f32.store
                                (local.get $p24)
                                (f32.mul
                                  (f32.load
                                    (i32.add
                                      (i32.load
                                        (local.get $l44))
                                      (local.get $p13)))
                                  (f32.load
                                    (i32.add
                                      (i32.load
                                        (local.get $l47))
                                      (local.get $p13)))))
                              (f32.store
                                (i32.add
                                  (local.get $p24)
                                  (i32.const 4))
                                (f32.mul
                                  (f32.load
                                    (i32.add
                                      (i32.load
                                        (local.get $l29))
                                      (local.get $p13)))
                                  (f32.load
                                    (i32.add
                                      (i32.load
                                        (local.get $l49))
                                      (local.get $p13)))))
                              (f32.store
                                (i32.add
                                  (local.get $p24)
                                  (i32.const 8))
                                (f32.mul
                                  (f32.load
                                    (i32.add
                                      (i32.load
                                        (local.get $l48))
                                      (local.get $p13)))
                                  (f32.load
                                    (i32.add
                                      (i32.load
                                        (local.get $l43))
                                      (local.get $p13)))))
                              (local.set $l117
                                (f32.mul
                                  (f32.load
                                    (i32.add
                                      (i32.load
                                        (local.get $l36))
                                      (local.get $p13)))
                                  (f32.load
                                    (i32.add
                                      (i32.load
                                        (local.get $l46))
                                      (local.get $p13)))))
                              (br $B90))
                            (block $B92
                              (br_if $B92
                                (i32.eq
                                  (local.get $p25)
                                  (i32.const 2)))
                              (f32.store
                                (local.get $p24)
                                (f32.load
                                  (i32.add
                                    (i32.load
                                      (local.get $l45))
                                    (local.get $p13))))
                              (f32.store
                                (i32.add
                                  (local.get $p24)
                                  (i32.const 4))
                                (f32.load
                                  (i32.add
                                    (i32.load
                                      (local.get $l40))
                                    (local.get $p13))))
                              (f32.store
                                (i32.add
                                  (local.get $p24)
                                  (i32.const 8))
                                (f32.load
                                  (i32.add
                                    (i32.load
                                      (local.get $p16))
                                    (local.get $p13))))
                              (local.set $l117
                                (f32.load
                                  (i32.add
                                    (i32.load
                                      (local.get $p26))
                                    (local.get $p13))))
                              (br $B90))
                            (f32.store
                              (local.get $p24)
                              (f32.mul
                                (local.tee $l117
                                  (f32.load
                                    (i32.add
                                      (i32.load
                                        (local.get $l45))
                                      (local.get $p13))))
                                (local.get $l117)))
                            (f32.store
                              (i32.add
                                (local.get $p24)
                                (i32.const 4))
                              (f32.mul
                                (local.tee $l117
                                  (f32.load
                                    (i32.add
                                      (i32.load
                                        (local.get $l40))
                                      (local.get $p13))))
                                (local.get $l117)))
                            (f32.store
                              (i32.add
                                (local.get $p24)
                                (i32.const 8))
                              (f32.mul
                                (local.tee $l117
                                  (f32.load
                                    (i32.add
                                      (i32.load
                                        (local.get $p16))
                                      (local.get $p13))))
                                (local.get $l117)))
                            (local.set $l117
                              (f32.mul
                                (local.tee $l117
                                  (f32.load
                                    (i32.add
                                      (i32.load
                                        (local.get $p26))
                                      (local.get $p13))))
                                (local.get $l117))))
                          (f32.store
                            (i32.add
                              (local.get $p24)
                              (i32.const 12))
                            (local.get $l117))
                          (local.set $p24
                            (i32.add
                              (local.get $p24)
                              (i32.const 16)))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 4)))
                          (br_if $L89
                            (local.tee $p27
                              (i32.add
                                (local.get $p27)
                                (i32.const -1))))))
                      (local.set $p24
                        (i32.const -4))
                      (local.set $l118
                        (f32.load offset=164
                          (local.get $p8)))
                      (local.set $l119
                        (f32.load offset=160
                          (local.get $p8)))
                      (local.set $l120
                        (f32.load offset=156
                          (local.get $p8)))
                      (local.set $l117
                        (f32.load offset=152
                          (local.get $p8)))
                      (local.set $l121
                        (f32.load offset=148
                          (local.get $p8)))
                      (local.set $l122
                        (f32.load offset=144
                          (local.get $p8)))
                      (local.set $l123
                        (f32.load offset=140
                          (local.get $p8)))
                      (local.set $l124
                        (f32.load offset=136
                          (local.get $p8)))
                      (local.set $l125
                        (f32.load offset=128
                          (local.get $p8)))
                      (local.set $l126
                        (f32.load offset=124
                          (local.get $p8)))
                      (local.set $l127
                        (f32.load offset=120
                          (local.get $p8)))
                      (local.set $l128
                        (f32.load offset=116
                          (local.get $p8)))
                      (local.set $l129
                        (f32.load offset=112
                          (local.get $p8)))
                      (local.set $l130
                        (f32.load offset=108
                          (local.get $p8)))
                      (local.set $l131
                        (f32.load offset=104
                          (local.get $p8)))
                      (local.set $l132
                        (f32.load offset=100
                          (local.get $p8)))
                      (local.set $l133
                        (f32.load offset=96
                          (local.get $p8)))
                      (local.set $l134
                        (f32.load offset=92
                          (local.get $p8)))
                      (local.set $l135
                        (f32.load offset=88
                          (local.get $p8)))
                      (local.set $l136
                        (f32.load offset=80
                          (local.get $p8)))
                      (local.set $l137
                        (f32.load offset=76
                          (local.get $p8)))
                      (local.set $l138
                        (f32.load offset=72
                          (local.get $p8)))
                      (local.set $l139
                        (f32.load offset=68
                          (local.get $p8)))
                      (local.set $l140
                        (f32.load offset=64
                          (local.get $p8)))
                      (local.set $l141
                        (f32.load offset=60
                          (local.get $p8)))
                      (local.set $l142
                        (f32.load offset=56
                          (local.get $p8)))
                      (local.set $l143
                        (f32.load offset=52
                          (local.get $p8)))
                      (local.set $l144
                        (f32.load offset=48
                          (local.get $p8)))
                      (local.set $l145
                        (f32.load offset=44
                          (local.get $p8)))
                      (local.set $l146
                        (f32.load offset=40
                          (local.get $p8)))
                      (local.set $l147
                        (f32.load offset=32
                          (local.get $p8)))
                      (local.set $l148
                        (f32.load offset=28
                          (local.get $p8)))
                      (local.set $l149
                        (f32.load offset=24
                          (local.get $p8)))
                      (block $B93
                        (block $B94
                          (br_if $B94
                            (i32.gt_s
                              (local.get $p0)
                              (i32.const -4)))
                          (local.set $l85
                            (local.tee $l82
                              (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                          (local.set $l88
                            (local.get $l82))
                          (local.set $l84
                            (local.get $l82))
                          (local.set $l91
                            (local.get $l82))
                          (local.set $l95
                            (local.get $l82))
                          (br $B93))
                        (local.set $p24
                          (i32.add
                            (local.get $p22)
                            (i32.const -160)))
                        (local.set $p27
                          (i32.add
                            (local.get $l35)
                            (i32.const -64)))
                        (local.set $l94
                          (f32x4.splat
                            (local.get $l124)))
                        (local.set $l96
                          (f32x4.splat
                            (local.get $l135)))
                        (local.set $l86
                          (f32x4.splat
                            (local.get $l146)))
                        (local.set $p13
                          (i32.const -4))
                        (local.set $l90
                          (local.tee $l83
                            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                        (local.set $l95
                          (local.get $l83))
                        (local.set $l92
                          (local.get $l83))
                        (local.set $l91
                          (local.get $l83))
                        (local.set $l93
                          (local.get $l83))
                        (local.set $l84
                          (local.get $l83))
                        (loop $L95
                          (local.set $l82
                            (local.get $l84))
                          (local.set $l85
                            (local.get $l91))
                          (local.set $l88
                            (local.get $l95))
                          (local.set $l52
                            (local.get $l83))
                          (block $B96
                            (br_if $B96
                              (i32.lt_s
                                (local.get $p13)
                                (i32.const 6)))
                            (local.set $l52
                              (v128.load align=1
                                (local.get $p24))))
                          (local.set $l89
                            (local.get $l83))
                          (block $B97
                            (br_if $B97
                              (i32.ge_s
                                (i32.add
                                  (local.get $p13)
                                  (i32.const 4))
                                (local.get $p0)))
                            (local.set $l89
                              (v128.load align=1
                                (i32.add
                                  (local.get $p24)
                                  (i32.const 160)))))
                          (local.set $l95
                            (f32x4.relaxed_madd
                              (local.get $l94)
                              (local.get $l88)
                              (f32x4.sub
                                (f32x4.mul
                                  (local.tee $l52
                                    (f32x4.add
                                      (local.get $l52)
                                      (local.get $l89)))
                                  (v128.load32_splat offset=120
                                    (local.get $p8)))
                                (local.get $l90))))
                          (local.set $l91
                            (f32x4.relaxed_madd
                              (local.get $l96)
                              (local.get $l85)
                              (f32x4.sub
                                (f32x4.mul
                                  (local.get $l52)
                                  (v128.load32_splat offset=72
                                    (local.get $p8)))
                                (local.get $l92))))
                          (local.set $l84
                            (f32x4.relaxed_madd
                              (local.get $l86)
                              (local.get $l82)
                              (f32x4.sub
                                (f32x4.mul
                                  (local.get $l52)
                                  (v128.load32_splat offset=24
                                    (local.get $p8)))
                                (local.get $l93))))
                          (block $B98
                            (br_if $B98
                              (i32.lt_s
                                (local.get $p13)
                                (i32.const 0)))
                            (v128.store align=1
                              (local.get $p27)
                              (f32x4.add
                                (local.get $l84)
                                (f32x4.add
                                  (local.get $l91)
                                  (local.get $l95)))))
                          (local.set $p24
                            (i32.add
                              (local.get $p24)
                              (i32.const 16)))
                          (local.set $p27
                            (i32.add
                              (local.get $p27)
                              (i32.const 16)))
                          (local.set $l90
                            (local.get $l88))
                          (local.set $l92
                            (local.get $l85))
                          (local.set $l93
                            (local.get $l82))
                          (br_if $L95
                            (i32.ne
                              (local.tee $p13
                                (i32.add
                                  (local.get $p13)
                                  (i32.const 1)))
                              (local.get $l50))))
                        (local.set $p24
                          (local.get $l50)))
                      (block $B99
                        (br_if $B99
                          (i32.ge_s
                            (local.get $p24)
                            (local.get $l51)))
                        (local.set $p16
                          (i32.shl
                            (local.get $p24)
                            (i32.const 4)))
                        (local.set $l150
                          (f32x4.splat
                            (local.get $l121)))
                        (local.set $l151
                          (f32x4.splat
                            (local.get $l118)))
                        (local.set $l97
                          (f32x4.splat
                            (local.get $l127)))
                        (local.set $l152
                          (f32x4.splat
                            (local.get $l126)))
                        (local.set $l153
                          (f32x4.splat
                            (local.get $l125)))
                        (local.set $l154
                          (f32x4.splat
                            (local.get $l122)))
                        (local.set $l155
                          (f32x4.splat
                            (local.get $l119)))
                        (local.set $l156
                          (f32x4.splat
                            (local.get $l123)))
                        (local.set $l157
                          (f32x4.splat
                            (local.get $l120)))
                        (local.set $l158
                          (f32x4.splat
                            (local.get $l124)))
                        (local.set $l159
                          (f32x4.splat
                            (local.get $l117)))
                        (local.set $l160
                          (f32x4.splat
                            (local.get $l132)))
                        (local.set $l161
                          (f32x4.splat
                            (local.get $l128)))
                        (local.set $l162
                          (f32x4.splat
                            (local.get $l138)))
                        (local.set $l163
                          (f32x4.splat
                            (local.get $l137)))
                        (local.set $l164
                          (f32x4.splat
                            (local.get $l136)))
                        (local.set $l165
                          (f32x4.splat
                            (local.get $l133)))
                        (local.set $l166
                          (f32x4.splat
                            (local.get $l129)))
                        (local.set $l167
                          (f32x4.splat
                            (local.get $l134)))
                        (local.set $l168
                          (f32x4.splat
                            (local.get $l130)))
                        (local.set $l169
                          (f32x4.splat
                            (local.get $l135)))
                        (local.set $l170
                          (f32x4.splat
                            (local.get $l131)))
                        (local.set $l171
                          (f32x4.splat
                            (local.get $l143)))
                        (local.set $l172
                          (f32x4.splat
                            (local.get $l139)))
                        (local.set $l173
                          (f32x4.splat
                            (local.get $l149)))
                        (local.set $l174
                          (f32x4.splat
                            (local.get $l148)))
                        (local.set $l175
                          (f32x4.splat
                            (local.get $l147)))
                        (local.set $l176
                          (f32x4.splat
                            (local.get $l144)))
                        (local.set $l177
                          (f32x4.splat
                            (local.get $l140)))
                        (local.set $l178
                          (f32x4.splat
                            (local.get $l145)))
                        (local.set $l179
                          (f32x4.splat
                            (local.get $l141)))
                        (local.set $l180
                          (f32x4.splat
                            (local.get $l146)))
                        (local.set $l181
                          (f32x4.splat
                            (local.get $l142)))
                        (local.set $p26
                          (local.get $l35))
                        (local.set $p25
                          (local.get $p22))
                        (loop $L100
                          (local.set $l182
                            (v128.load32_splat offset=24
                              (local.get $p8)))
                          (local.set $l183
                            (v128.load32_splat offset=72
                              (local.get $p8)))
                          (local.set $l184
                            (v128.load32_splat offset=120
                              (local.get $p8)))
                          (local.set $l185
                            (v128.load32_splat offset=28
                              (local.get $p8)))
                          (local.set $l186
                            (v128.load32_splat offset=76
                              (local.get $p8)))
                          (local.set $l187
                            (v128.load32_splat offset=124
                              (local.get $p8)))
                          (local.set $l188
                            (v128.load32_splat offset=32
                              (local.get $p8)))
                          (local.set $l189
                            (v128.load32_splat offset=80
                              (local.get $p8)))
                          (local.set $l190
                            (v128.load32_splat offset=128
                              (local.get $p8)))
                          (v128.store align=1
                            (i32.add
                              (local.tee $p27
                                (i32.add
                                  (local.get $p26)
                                  (local.get $p16)))
                              (i32.const 48))
                            (f32x4.add
                              (local.tee $l84
                                (f32x4.relaxed_madd
                                  (local.get $l171)
                                  (local.tee $l96
                                    (local.get $l84))
                                  (f32x4.relaxed_madd
                                    (local.get $l172)
                                    (local.tee $l92
                                      (local.get $l82))
                                    (f32x4.relaxed_madd
                                      (local.get $l173)
                                      (local.tee $l83
                                        (f32x4.add
                                          (v128.load align=1
                                            (i32.add
                                              (local.tee $p13
                                                (i32.add
                                                  (local.get $p25)
                                                  (local.get $p16)))
                                              (i32.const -48)))
                                          (v128.load align=1
                                            (i32.add
                                              (local.get $p13)
                                              (i32.const 112)))))
                                      (f32x4.relaxed_madd
                                        (local.get $l174)
                                        (local.tee $l90
                                          (f32x4.add
                                            (v128.load align=1
                                              (i32.add
                                                (local.get $p13)
                                                (i32.const -64)))
                                            (v128.load align=1
                                              (i32.add
                                                (local.get $p13)
                                                (i32.const 96)))))
                                        (f32x4.relaxed_madd
                                          (local.get $l175)
                                          (local.tee $l89
                                            (f32x4.add
                                              (v128.load align=1
                                                (i32.add
                                                  (local.get $p13)
                                                  (i32.const -80)))
                                              (v128.load align=1
                                                (i32.add
                                                  (local.get $p13)
                                                  (i32.const 80)))))
                                          (f32x4.mul
                                            (local.tee $l52
                                              (f32x4.add
                                                (v128.load align=1
                                                  (i32.add
                                                    (local.get $p13)
                                                    (i32.const -96)))
                                                (v128.load align=1
                                                  (i32.add
                                                    (local.get $p13)
                                                    (i32.const 64)))))
                                            (v128.load32_splat offset=36
                                              (local.get $p8)))))))))
                              (f32x4.add
                                (local.tee $l91
                                  (f32x4.relaxed_madd
                                    (local.get $l160)
                                    (local.tee $l86
                                      (local.get $l91))
                                    (f32x4.relaxed_madd
                                      (local.get $l161)
                                      (local.tee $l93
                                        (local.get $l85))
                                      (f32x4.relaxed_madd
                                        (local.get $l162)
                                        (local.get $l83)
                                        (f32x4.relaxed_madd
                                          (local.get $l163)
                                          (local.get $l90)
                                          (f32x4.relaxed_madd
                                            (local.get $l164)
                                            (local.get $l89)
                                            (f32x4.mul
                                              (local.get $l52)
                                              (v128.load32_splat offset=84
                                                (local.get $p8)))))))))
                                (local.tee $l95
                                  (f32x4.relaxed_madd
                                    (local.get $l150)
                                    (local.tee $l87
                                      (local.get $l95))
                                    (f32x4.relaxed_madd
                                      (local.get $l151)
                                      (local.tee $l94
                                        (local.get $l88))
                                      (f32x4.relaxed_madd
                                        (local.get $l97)
                                        (local.get $l83)
                                        (f32x4.relaxed_madd
                                          (local.get $l152)
                                          (local.get $l90)
                                          (f32x4.relaxed_madd
                                            (local.get $l153)
                                            (local.get $l89)
                                            (f32x4.mul
                                              (local.get $l52)
                                              (v128.load32_splat offset=132
                                                (local.get $p8))))))))))))
                          (v128.store align=1
                            (i32.add
                              (local.get $p27)
                              (i32.const 32))
                            (f32x4.add
                              (local.tee $l82
                                (f32x4.relaxed_madd
                                  (local.get $l176)
                                  (local.get $l96)
                                  (f32x4.relaxed_madd
                                    (local.get $l177)
                                    (local.get $l92)
                                    (f32x4.add
                                      (f32x4.relaxed_madd
                                        (local.get $l173)
                                        (local.get $l90)
                                        (f32x4.relaxed_madd
                                          (local.get $l174)
                                          (local.get $l89)
                                          (f32x4.mul
                                            (local.get $l52)
                                            (local.get $l188))))
                                      (local.tee $l83
                                        (f32x4.mul
                                          (local.get $l83)
                                          (local.tee $l188
                                            (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000))))))))
                              (f32x4.add
                                (local.tee $l85
                                  (f32x4.relaxed_madd
                                    (local.get $l165)
                                    (local.get $l86)
                                    (f32x4.relaxed_madd
                                      (local.get $l166)
                                      (local.get $l93)
                                      (f32x4.add
                                        (f32x4.relaxed_madd
                                          (local.get $l162)
                                          (local.get $l90)
                                          (f32x4.relaxed_madd
                                            (local.get $l163)
                                            (local.get $l89)
                                            (f32x4.mul
                                              (local.get $l52)
                                              (local.get $l189))))
                                        (local.get $l83)))))
                                (local.tee $l88
                                  (f32x4.relaxed_madd
                                    (local.get $l154)
                                    (local.get $l87)
                                    (f32x4.relaxed_madd
                                      (local.get $l155)
                                      (local.get $l94)
                                      (f32x4.add
                                        (f32x4.relaxed_madd
                                          (local.get $l97)
                                          (local.get $l90)
                                          (f32x4.relaxed_madd
                                            (local.get $l152)
                                            (local.get $l89)
                                            (f32x4.mul
                                              (local.get $l52)
                                              (local.get $l190))))
                                        (local.get $l83))))))))
                          (v128.store align=1
                            (i32.add
                              (local.get $p27)
                              (i32.const 16))
                            (f32x4.add
                              (f32x4.relaxed_madd
                                (local.get $l178)
                                (local.get $l96)
                                (f32x4.relaxed_madd
                                  (local.get $l179)
                                  (local.get $l92)
                                  (f32x4.add
                                    (f32x4.add
                                      (f32x4.relaxed_madd
                                        (local.get $l173)
                                        (local.get $l89)
                                        (f32x4.mul
                                          (local.get $l52)
                                          (local.get $l185)))
                                      (local.tee $l90
                                        (f32x4.mul
                                          (local.get $l90)
                                          (local.get $l188))))
                                    (local.get $l83))))
                              (f32x4.add
                                (f32x4.relaxed_madd
                                  (local.get $l167)
                                  (local.get $l86)
                                  (f32x4.relaxed_madd
                                    (local.get $l168)
                                    (local.get $l93)
                                    (f32x4.add
                                      (f32x4.add
                                        (f32x4.relaxed_madd
                                          (local.get $l162)
                                          (local.get $l89)
                                          (f32x4.mul
                                            (local.get $l52)
                                            (local.get $l186)))
                                        (local.get $l90))
                                      (local.get $l83))))
                                (f32x4.relaxed_madd
                                  (local.get $l156)
                                  (local.get $l87)
                                  (f32x4.relaxed_madd
                                    (local.get $l157)
                                    (local.get $l94)
                                    (f32x4.add
                                      (f32x4.add
                                        (f32x4.relaxed_madd
                                          (local.get $l97)
                                          (local.get $l89)
                                          (f32x4.mul
                                            (local.get $l52)
                                            (local.get $l187)))
                                        (local.get $l90))
                                      (local.get $l83)))))))
                          (v128.store align=1
                            (local.get $p27)
                            (f32x4.add
                              (f32x4.relaxed_madd
                                (local.get $l180)
                                (local.get $l96)
                                (select
                                  (f32x4.relaxed_madd
                                    (local.get $l181)
                                    (local.get $l92)
                                    (local.tee $l188
                                      (f32x4.add
                                        (f32x4.add
                                          (f32x4.add
                                            (f32x4.mul
                                              (local.get $l52)
                                              (local.get $l182))
                                            (local.tee $l89
                                              (f32x4.mul
                                                (local.get $l89)
                                                (local.get $l188))))
                                          (local.get $l90))
                                        (local.get $l83))))
                                  (f32x4.sub
                                    (local.get $l188)
                                    (local.get $l92))
                                  (f32.ne
                                    (local.get $l142)
                                    (f32.const -0x1p+0 (;=-1;)))))
                              (f32x4.add
                                (f32x4.relaxed_madd
                                  (local.get $l169)
                                  (local.get $l86)
                                  (select
                                    (f32x4.relaxed_madd
                                      (local.get $l170)
                                      (local.get $l93)
                                      (local.tee $l92
                                        (f32x4.add
                                          (f32x4.add
                                            (f32x4.add
                                              (f32x4.mul
                                                (local.get $l52)
                                                (local.get $l183))
                                              (local.get $l89))
                                            (local.get $l90))
                                          (local.get $l83))))
                                    (f32x4.sub
                                      (local.get $l92)
                                      (local.get $l93))
                                    (f32.ne
                                      (local.get $l131)
                                      (f32.const -0x1p+0 (;=-1;)))))
                                (f32x4.relaxed_madd
                                  (local.get $l158)
                                  (local.get $l87)
                                  (select
                                    (f32x4.relaxed_madd
                                      (local.get $l159)
                                      (local.get $l94)
                                      (local.tee $l52
                                        (f32x4.add
                                          (f32x4.add
                                            (f32x4.add
                                              (f32x4.mul
                                                (local.get $l52)
                                                (local.get $l184))
                                              (local.get $l89))
                                            (local.get $l90))
                                          (local.get $l83))))
                                    (f32x4.sub
                                      (local.get $l52)
                                      (local.get $l94))
                                    (f32.ne
                                      (local.get $l117)
                                      (f32.const -0x1p+0 (;=-1;))))))))
                          (local.set $p26
                            (i32.add
                              (local.get $p26)
                              (i32.const 64)))
                          (local.set $p25
                            (i32.add
                              (local.get $p25)
                              (i32.const 64)))
                          (br_if $L100
                            (i32.lt_s
                              (local.tee $p24
                                (i32.add
                                  (local.get $p24)
                                  (i32.const 4)))
                              (local.get $l51)))))
                      (block $B101
                        (br_if $B101
                          (i32.ge_s
                            (local.get $p24)
                            (local.get $p0)))
                        (local.set $p13
                          (i32.add
                            (local.get $l35)
                            (local.tee $p27
                              (i32.shl
                                (local.get $p24)
                                (i32.const 4)))))
                        (local.set $p27
                          (i32.add
                            (i32.add
                              (local.get $p22)
                              (local.get $p27))
                            (i32.const 64)))
                        (local.set $l90
                          (f32x4.splat
                            (local.get $l124)))
                        (local.set $l92
                          (f32x4.splat
                            (local.get $l135)))
                        (local.set $l93
                          (f32x4.splat
                            (local.get $l146)))
                        (loop $L102
                          (local.set $l89
                            (local.tee $l52
                              (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                          (block $B103
                            (br_if $B103
                              (i32.lt_s
                                (local.get $p24)
                                (i32.const 6)))
                            (local.set $l89
                              (v128.load align=1
                                (i32.add
                                  (local.get $p27)
                                  (i32.const -160)))))
                          (block $B104
                            (br_if $B104
                              (i32.ge_s
                                (local.tee $p24
                                  (i32.add
                                    (local.get $p24)
                                    (i32.const 4)))
                                (local.get $p0)))
                            (local.set $l52
                              (v128.load align=1
                                (local.get $p27))))
                          (v128.store align=1
                            (local.get $p13)
                            (f32x4.add
                              (local.tee $l89
                                (f32x4.relaxed_madd
                                  (local.get $l93)
                                  (local.get $l84)
                                  (f32x4.sub
                                    (f32x4.mul
                                      (local.tee $l52
                                        (f32x4.add
                                          (local.get $l89)
                                          (local.get $l52)))
                                      (v128.load32_splat offset=24
                                        (local.get $p8)))
                                    (local.get $l82))))
                              (f32x4.add
                                (local.tee $l83
                                  (f32x4.relaxed_madd
                                    (local.get $l92)
                                    (local.get $l91)
                                    (f32x4.sub
                                      (f32x4.mul
                                        (local.get $l52)
                                        (v128.load32_splat offset=72
                                          (local.get $p8)))
                                      (local.get $l85))))
                                (local.tee $l52
                                  (f32x4.relaxed_madd
                                    (local.get $l90)
                                    (local.get $l95)
                                    (f32x4.sub
                                      (f32x4.mul
                                        (local.get $l52)
                                        (v128.load32_splat offset=120
                                          (local.get $p8)))
                                      (local.get $l88)))))))
                          (local.set $p13
                            (i32.add
                              (local.get $p13)
                              (i32.const 16)))
                          (local.set $p27
                            (i32.add
                              (local.get $p27)
                              (i32.const 16)))
                          (local.set $l88
                            (local.get $l95))
                          (local.set $l95
                            (local.get $l52))
                          (local.set $l85
                            (local.get $l91))
                          (local.set $l91
                            (local.get $l83))
                          (local.set $l82
                            (local.get $l84))
                          (local.set $l84
                            (local.get $l89))
                          (br_if $L102
                            (i32.ne
                              (local.tee $p24
                                (i32.add
                                  (local.get $p24)
                                  (i32.const -3)))
                              (local.get $p0)))))
                      (local.set $p26
                        (i32.const 0))
                      (block $B105
                        (br_if $B105
                          (local.get $l116))
                        (local.set $p26
                          (i32.const 0))
                        (local.set $p13
                          (i32.const 4))
                        (loop $L106
                          (local.set $p16
                            (local.get $p26))
                          (local.set $p26
                            (local.get $p13))
                          (v128.store offset=576
                            (local.get $l28)
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
                              (local.tee $l83
                                (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                                  (local.tee $l52
                                    (v128.load align=1
                                      (local.tee $p13
                                        (i32.add
                                          (local.get $l35)
                                          (i32.shl
                                            (local.get $p16)
                                            (i32.const 4))))))
                                  (local.tee $l89
                                    (v128.load offset=16 align=1
                                      (local.get $p13)))))
                              (local.tee $l95
                                (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31
                                  (local.tee $l84
                                    (v128.load offset=32 align=1
                                      (local.get $p13)))
                                  (local.tee $l91
                                    (v128.load offset=48 align=1
                                      (local.get $p13)))))))
                          (v128.store offset=560
                            (local.get $l28)
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (local.get $l83)
                              (local.get $l95)))
                          (v128.store offset=544
                            (local.get $l28)
                            (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31
                              (local.tee $l52
                                (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                                  (local.get $l52)
                                  (local.get $l89)))
                              (local.tee $l89
                                (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23
                                  (local.get $l84)
                                  (local.get $l91)))))
                          (v128.store offset=528
                            (local.get $l28)
                            (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23
                              (local.get $l52)
                              (local.get $l89)))
                          (block $B107
                            (br_if $B107
                              (local.get $l37))
                            (block $B108
                              (block $B109
                                (br_if $B109
                                  (local.get $p6))
                                (local.set $p27
                                  (i32.const 0))
                                (br $B108))
                              (local.set $p27
                                (i32.const 0))
                              (local.set $p13
                                (local.get $l28))
                              (local.set $p24
                                (i32.add
                                  (local.get $l28)
                                  (i32.const 528)))
                              (loop $L110
                                (v128.store align=1
                                  (i32.add
                                    (i32.load
                                      (local.get $p13))
                                    (local.tee $p25
                                      (i32.shl
                                        (local.get $p16)
                                        (i32.const 2))))
                                  (v128.load
                                    (local.get $p24)))
                                (v128.store align=1
                                  (i32.add
                                    (i32.load
                                      (i32.add
                                        (local.get $p13)
                                        (i32.const 4)))
                                    (local.get $p25))
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
                                (br_if $L110
                                  (i32.ne
                                    (local.get $p10)
                                    (local.tee $p27
                                      (i32.add
                                        (local.get $p27)
                                        (i32.const 2))))))
                              (br_if $B107
                                (i32.eqz
                                  (local.get $l38))))
                            (v128.store align=1
                              (i32.add
                                (i32.load
                                  (i32.add
                                    (local.get $l28)
                                    (i32.shl
                                      (local.get $p27)
                                      (i32.const 2))))
                                (i32.shl
                                  (local.get $p16)
                                  (i32.const 2)))
                              (v128.load
                                (i32.add
                                  (i32.add
                                    (local.get $l28)
                                    (i32.const 528))
                                  (i32.shl
                                    (local.get $p27)
                                    (i32.const 4))))))
                          (br_if $L106
                            (i32.le_s
                              (local.tee $p13
                                (i32.add
                                  (local.get $p26)
                                  (i32.const 4)))
                              (local.get $p0)))))
                      (br_if $B77
                        (i32.ge_s
                          (local.get $p26)
                          (local.get $p0)))
                      (br_if $B77
                        (local.get $l37))
                      (local.set $p16
                        (i32.add
                          (local.get $l35)
                          (i32.shl
                            (local.get $p26)
                            (i32.const 4))))
                      (loop $L111
                        (local.set $p13
                          (i32.const 0))
                        (block $B112
                          (block $B113
                            (br_if $B113
                              (i32.lt_u
                                (local.get $p6)
                                (i32.const 3)))
                            (local.set $p25
                              (i32.const 0))
                            (local.set $p13
                              (local.get $l28))
                            (local.set $p24
                              (local.get $p16))
                            (loop $L114
                              (f32.store
                                (i32.add
                                  (i32.load
                                    (local.get $p13))
                                  (local.tee $p27
                                    (i32.shl
                                      (local.get $p26)
                                      (i32.const 2))))
                                (f32.load
                                  (local.get $p24)))
                              (f32.store
                                (i32.add
                                  (i32.load
                                    (i32.add
                                      (local.get $p13)
                                      (i32.const 4)))
                                  (local.get $p27))
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
                                  (local.get $p27))
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
                                  (local.get $p27))
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
                              (br_if $L114
                                (i32.ne
                                  (local.get $p11)
                                  (local.tee $p25
                                    (i32.add
                                      (local.get $p25)
                                      (i32.const -4))))))
                            (br_if $B112
                              (i32.eqz
                                (local.get $p5)))
                            (local.set $p13
                              (i32.sub
                                (i32.const 0)
                                (local.get $p25))))
                          (local.set $p13
                            (i32.shl
                              (local.get $p13)
                              (i32.const 2)))
                          (local.set $p24
                            (local.get $p5))
                          (loop $L115
                            (f32.store
                              (i32.add
                                (i32.load
                                  (i32.add
                                    (local.get $l28)
                                    (local.get $p13)))
                                (i32.shl
                                  (local.get $p26)
                                  (i32.const 2)))
                              (f32.load
                                (i32.add
                                  (local.get $p16)
                                  (local.get $p13))))
                            (local.set $p13
                              (i32.add
                                (local.get $p13)
                                (i32.const 4)))
                            (br_if $L115
                              (local.tee $p24
                                (i32.add
                                  (local.get $p24)
                                  (i32.const -1))))))
                        (local.set $p16
                          (i32.add
                            (local.get $p16)
                            (i32.const 16)))
                        (br_if $L111
                          (i32.ne
                            (local.tee $p26
                              (i32.add
                                (local.get $p26)
                                (i32.const 1)))
                            (local.get $p0)))))
                    (br_if $L76
                      (i32.ne
                        (local.tee $p9
                          (i32.add
                            (local.get $p9)
                            (i32.const 1)))
                        (i32.const 5))))
                  (br_if $L59
                    (i32.ne
                      (local.tee $p15
                        (i32.add
                          (local.get $p15)
                          (i32.const 1)))
                      (local.get $l34)))))
              (br_if $L57
                (i32.ne
                  (local.tee $l101
                    (i32.add
                      (local.get $l101)
                      (i32.const 1)))
                  (i32.const 3))))
            (br_if $B33
              (i32.ge_s
                (local.tee $p23
                  (i32.add
                    (local.get $l81)
                    (local.get $p23)))
                (local.get $p1)))
            (br_if $L34
              (i32.le_s
                (local.get $p23)
                (local.get $l80)))))
        (local.set $p13
          (i32.mul
            (i32.and
              (i32.add
                (local.get $p19)
                (i32.const 10))
              (i32.const 15))
            (local.get $p0)))
        (local.set $p6
          (i32.const -1))
        (block $B116
          (br_if $B116
            (i32.ge_s
              (local.get $l80)
              (local.get $p1)))
          (local.set $p6
            (i32.mul
              (i32.rem_s
                (local.get $l80)
                (i32.const 16))
              (local.get $p0))))
        (local.set $l111
          (i32.mul
            (local.get $l65)
            (local.get $l79)))
        (local.set $l113
          (i32.add
            (local.get $l77)
            (local.tee $p24
              (i32.mul
                (local.get $l64)
                (local.get $l79)))))
        (local.set $l112
          (i32.add
            (local.get $l72)
            (local.get $p24)))
        (local.set $l104
          (i32.mul
            (local.get $l64)
            (i32.and
              (local.get $l76)
              (i32.const 15))))
        (local.set $p5
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
        (local.set $l29
          (i32.shr_u
            (i32.xor
              (local.get $p19)
              (i32.const -1))
            (i32.const 31)))
        (local.set $l107
          (i32.const 0))
        (local.set $l109
          (i32.shl
            (i32.mul
              (i32.and
                (local.get $p19)
                (i32.const 15))
              (local.get $p0))
            (i32.const 2)))
        (local.set $l105
          (i32.shl
            (i32.mul
              (i32.add
                (local.get $p19)
                (local.get $p1))
              (local.get $p0))
            (i32.const 2)))
        (loop $L117
          (block $B118
            (br_if $B118
              (i32.eqz
                (i32.and
                  (local.tee $p13
                    (i32.shl
                      (i32.const 1)
                      (local.get $l107)))
                  (local.get $p2))))
            (local.set $l114
              (i32.mul
                (local.get $l107)
                (i32.const 48)))
            (local.set $p21
              (i32.and
                (local.get $p13)
                (local.get $p12)))
            (local.set $l106
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 504))
                (local.tee $p13
                  (i32.shl
                    (local.get $l107)
                    (i32.const 2)))))
            (local.set $l115
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 516))
                (local.get $p13)))
            (local.set $l102
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 480))
                (local.get $p13)))
            (local.set $p22
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 96))
                (local.tee $p13
                  (i32.mul
                    (local.get $l107)
                    (i32.const 20)))))
            (local.set $l98
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 224))
                (local.get $p13)))
            (local.set $l116
              (i32.add
                (i32.add
                  (local.get $l28)
                  (i32.const 352))
                (local.get $p13)))
            (local.set $l42
              (i32.const 0))
            (loop $L119
              (local.set $l38
                (i32.add
                  (local.get $p22)
                  (local.tee $p13
                    (i32.mul
                      (local.get $l42)
                      (i32.const 60)))))
              (local.set $l33
                (i32.add
                  (local.get $l98)
                  (local.get $p13)))
              (local.set $l45
                (i32.add
                  (local.get $l116)
                  (local.get $p13)))
              (local.set $l47
                (i32.const 0))
              (loop $L120
                (block $B121
                  (br_if $B121
                    (i32.eqz
                      (local.tee $l49
                        (i32.load
                          (i32.add
                            (local.get $l45)
                            (local.tee $p13
                              (i32.shl
                                (local.get $l47)
                                (i32.const 2))))))))
                  (block $B122
                    (br_if $B122
                      (i32.eqz
                        (local.get $l42)))
                    (br_if $B121
                      (i32.eqz
                        (i32.and
                          (local.get $l47)
                          (i32.const 5)))))
                  (local.set $p25
                    (i32.add
                      (local.tee $p26
                        (i32.load
                          (i32.add
                            (local.get $l33)
                            (local.get $p13))))
                      (local.get $l64)))
                  (local.set $p16
                    (i32.add
                      (local.get $p26)
                      (local.get $l61)))
                  (local.set $p11
                    (i32.add
                      (local.get $p26)
                      (local.get $l41)))
                  (local.set $p10
                    (i32.add
                      (local.get $p26)
                      (local.get $l62)))
                  (local.set $p9
                    (i32.add
                      (local.get $p26)
                      (local.get $l63)))
                  (local.set $l48
                    (i32.load
                      (i32.add
                        (local.get $l38)
                        (local.get $p13))))
                  (local.set $p24
                    (i32.const 0))
                  (block $B123
                    (br_if $B123
                      (i32.lt_s
                        (local.get $p0)
                        (i32.const 4)))
                    (local.set $l44
                      (i32.add
                        (local.get $l49)
                        (i32.shl
                          (local.get $p6)
                          (i32.const 2))))
                    (local.set $l40
                      (i32.add
                        (local.get $l49)
                        (i32.shl
                          (local.get $p5)
                          (i32.const 2))))
                    (local.set $l82
                      (v128.load32_splat offset=8
                        (local.get $p8)))
                    (local.set $l85
                      (v128.load32_splat offset=4
                        (local.get $p8)))
                    (local.set $l88
                      (v128.load32_splat
                        (local.get $p8)))
                    (local.set $l90
                      (f32x4.splat
                        (f32.neg
                          (f32.load offset=20
                            (local.get $p8)))))
                    (local.set $l92
                      (f32x4.splat
                        (f32.neg
                          (f32.load offset=16
                            (local.get $p8)))))
                    (local.set $l93
                      (f32x4.splat
                        (f32.neg
                          (f32.load offset=12
                            (local.get $p8)))))
                    (local.set $p27
                      (i32.const 0))
                    (local.set $p13
                      (i32.const 0))
                    (loop $L124
                      (local.set $l89
                        (local.tee $l52
                          (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))
                      (block $B125
                        (br_if $B125
                          (i32.lt_s
                            (local.get $p5)
                            (i32.const 0)))
                        (local.set $l89
                          (v128.load align=1
                            (i32.add
                              (local.get $l40)
                              (local.get $p13)))))
                      (block $B126
                        (br_if $B126
                          (i32.lt_s
                            (local.get $p6)
                            (i32.const 0)))
                        (local.set $l52
                          (v128.load align=1
                            (i32.add
                              (local.get $l44)
                              (local.get $p13)))))
                      (local.set $l89
                        (f32x4.relaxed_madd
                          (local.get $l82)
                          (local.tee $l52
                            (f32x4.add
                              (local.get $l89)
                              (local.get $l52)))
                          (f32x4.relaxed_madd
                            (local.get $l90)
                            (local.tee $l84
                              (v128.load align=1
                                (local.tee $p24
                                  (i32.add
                                    (local.get $p11)
                                    (local.get $p13)))))
                            (f32x4.neg
                              (v128.load align=1
                                (local.tee $l35
                                  (i32.add
                                    (local.get $p16)
                                    (local.get $p13))))))))
                      (local.set $l83
                        (f32x4.relaxed_madd
                          (local.get $l85)
                          (local.get $l52)
                          (f32x4.relaxed_madd
                            (local.get $l92)
                            (local.tee $l91
                              (v128.load align=1
                                (local.tee $l37
                                  (i32.add
                                    (local.get $p9)
                                    (local.get $p13)))))
                            (f32x4.neg
                              (v128.load align=1
                                (local.tee $l46
                                  (i32.add
                                    (local.get $p10)
                                    (local.get $p13))))))))
                      (local.set $l52
                        (f32x4.relaxed_madd
                          (local.get $l88)
                          (local.get $l52)
                          (f32x4.relaxed_madd
                            (local.get $l93)
                            (local.tee $l95
                              (v128.load align=1
                                (local.tee $l36
                                  (i32.add
                                    (local.get $p26)
                                    (local.get $p13)))))
                            (f32x4.neg
                              (v128.load align=1
                                (local.tee $l43
                                  (i32.add
                                    (local.get $p25)
                                    (local.get $p13))))))))
                      (block $B127
                        (br_if $B127
                          (i32.lt_s
                            (local.get $p19)
                            (i32.const 0)))
                        (v128.store align=1
                          (i32.add
                            (local.get $l48)
                            (local.get $p13))
                          (f32x4.add
                            (local.get $l52)
                            (f32x4.add
                              (local.get $l83)
                              (local.get $l89)))))
                      (v128.store align=1
                        (local.get $l43)
                        (local.get $l95))
                      (v128.store align=1
                        (local.get $l36)
                        (local.get $l52))
                      (v128.store align=1
                        (local.get $l46)
                        (local.get $l91))
                      (v128.store align=1
                        (local.get $l37)
                        (local.get $l83))
                      (v128.store align=1
                        (local.get $l35)
                        (local.get $l84))
                      (v128.store align=1
                        (local.get $p24)
                        (local.get $l89))
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 16)))
                      (local.set $l35
                        (i32.add
                          (local.get $p27)
                          (i32.const 8)))
                      (local.set $p27
                        (local.tee $p24
                          (i32.add
                            (local.get $p27)
                            (i32.const 4))))
                      (br_if $L124
                        (i32.le_s
                          (local.get $l35)
                          (local.get $p0)))))
                  (br_if $B121
                    (i32.ge_s
                      (local.get $p24)
                      (local.get $p0)))
                  (loop $L128
                    (call $vertical_column
                      (local.get $l49)
                      (local.get $p26)
                      (local.get $p25)
                      (local.get $p9)
                      (local.get $p10)
                      (local.get $p11)
                      (local.get $p16)
                      (local.get $l48)
                      (local.get $p24)
                      (local.get $p5)
                      (local.get $p6)
                      (local.get $l29)
                      (local.get $p8))
                    (br_if $L128
                      (i32.ne
                        (local.get $p0)
                        (local.tee $p24
                          (i32.add
                            (local.get $p24)
                            (i32.const 1)))))))
                (br_if $L120
                  (i32.ne
                    (local.tee $l47
                      (i32.add
                        (local.get $l47)
                        (i32.const 1)))
                    (i32.const 5))))
              (block $B129
                (br_if $B129
                  (i32.lt_s
                    (local.get $p19)
                    (i32.const 0)))
                (block $B130
                  (block $B131
                    (br_if $B131
                      (i32.eqz
                        (i32.or
                          (local.get $l42)
                          (local.get $p21))))
                    (local.set $l45
                      (i32.load offset=8
                        (local.get $p22)))
                    (local.set $l40
                      (i32.load
                        (local.get $p22)))
                    (br $B130))
                  (local.set $l45
                    (i32.load offset=8
                      (local.get $p22)))
                  (local.set $l40
                    (i32.load
                      (local.get $p22)))
                  (br_if $B130
                    (i32.eqz
                      (local.tee $p25
                        (i32.load
                          (local.get $l115)))))
                  (br_if $B130
                    (i32.lt_s
                      (local.get $p0)
                      (i32.const 1)))
                  (local.set $p26
                    (i32.const 0))
                  (block $B132
                    (br_if $B132
                      (i32.lt_u
                        (local.get $p0)
                        (i32.const 16)))
                    (br_if $B132
                      (local.get $l75))
                    (br_if $B132
                      (i32.gt_u
                        (i32.sub
                          (local.get $l40)
                          (i32.add
                            (local.get $l112)
                            (local.get $p25)))
                        (i32.const -16)))
                    (br_if $B132
                      (i32.gt_u
                        (i32.sub
                          (i32.add
                            (local.get $l72)
                            (local.get $p25))
                          (i32.add
                            (local.get $l111)
                            (local.get $l45)))
                        (i32.const -16)))
                    (br_if $B132
                      (i32.gt_u
                        (i32.sub
                          (local.get $l40)
                          (local.tee $p13
                            (i32.add
                              (local.get $l113)
                              (local.get $p25))))
                        (i32.const -16)))
                    (br_if $B132
                      (i32.gt_u
                        (i32.sub
                          (local.get $l45)
                          (local.get $p13))
                        (i32.const -16)))
                    (local.set $p27
                      (i32.add
                        (local.get $p25)
                        (local.get $l55)))
                    (local.set $p26
                      (i32.add
                        (local.get $p25)
                        (local.get $l78)))
                    (local.set $p13
                      (i32.const 0))
                    (local.set $p24
                      (local.get $l58))
                    (loop $L133
                      (v128.store align=4
                        (i32.add
                          (local.get $p27)
                          (local.get $p13))
                        (v128.load align=4
                          (i32.add
                            (local.get $l40)
                            (local.get $p13))))
                      (v128.store align=4
                        (i32.add
                          (local.get $p26)
                          (local.get $p13))
                        (v128.load align=4
                          (i32.add
                            (local.get $l45)
                            (local.get $p13))))
                      (local.set $p13
                        (i32.add
                          (local.get $p13)
                          (i32.const 16)))
                      (br_if $L133
                        (local.tee $p24
                          (i32.add
                            (local.get $p24)
                            (i32.const -4)))))
                    (local.set $p26
                      (local.get $l58))
                    (br_if $B130
                      (i32.eq
                        (local.get $p0)
                        (local.get $l58))))
                  (local.set $p13
                    (i32.or
                      (local.get $p26)
                      (i32.const 1)))
                  (block $B134
                    (br_if $B134
                      (i32.eqz
                        (local.get $l57)))
                    (f32.store
                      (i32.add
                        (i32.add
                          (i32.add
                            (local.get $p25)
                            (local.get $l74))
                          (local.tee $p27
                            (i32.shl
                              (local.get $p15)
                              (i32.const 2))))
                        (local.tee $p24
                          (i32.shl
                            (local.get $p26)
                            (i32.const 2))))
                      (f32.load
                        (i32.add
                          (local.get $l40)
                          (local.get $p24))))
                    (f32.store
                      (i32.add
                        (i32.add
                          (i32.add
                            (local.get $p25)
                            (local.get $l60))
                          (local.get $p27))
                        (local.get $p24))
                      (f32.load
                        (i32.add
                          (local.get $l45)
                          (local.get $p24))))
                    (local.set $p26
                      (local.get $p13)))
                  (br_if $B130
                    (i32.eq
                      (local.get $p0)
                      (local.get $p13)))
                  (local.set $p24
                    (i32.add
                      (local.get $p25)
                      (local.get $l78)))
                  (local.set $p27
                    (i32.add
                      (local.get $p25)
                      (local.get $l55)))
                  (local.set $p13
                    (i32.shl
                      (local.get $p26)
                      (i32.const 2)))
                  (local.set $p16
                    (i32.sub
                      (local.get $p0)
                      (local.get $p26)))
                  (local.set $p26
                    (local.get $l40))
                  (local.set $p25
                    (local.get $l45))
                  (loop $L135
                    (f32.store
                      (local.tee $p11
                        (i32.add
                          (local.get $p27)
                          (local.get $p13)))
                      (f32.load
                        (local.tee $p10
                          (i32.add
                            (local.get $p26)
                            (local.get $p13)))))
                    (f32.store
                      (local.tee $p9
                        (i32.add
                          (local.get $p24)
                          (local.get $p13)))
                      (f32.load
                        (local.tee $l35
                          (i32.add
                            (local.get $p25)
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
                        (local.get $p9)
                        (i32.const 4))
                      (f32.load
                        (i32.add
                          (local.get $l35)
                          (i32.const 4))))
                    (local.set $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const 8)))
                    (local.set $p27
                      (i32.add
                        (local.get $p27)
                        (i32.const 8)))
                    (local.set $p26
                      (i32.add
                        (local.get $p26)
                        (i32.const 8)))
                    (local.set $p25
                      (i32.add
                        (local.get $p25)
                        (i32.const 8)))
                    (br_if $L135
                      (local.tee $p16
                        (i32.add
                          (local.get $p16)
                          (i32.const -2))))))
                (block $B136
                  (block $B137
                    (br_if $B137
                      (local.get $p21))
                    (local.set $p27
                      (i32.add
                        (i32.load
                          (local.get $l106))
                        (local.get $l109)))
                    (local.set $l44
                      (i32.const 0))
                    (br $B136))
                  (local.set $p27
                    (i32.add
                      (local.tee $l44
                        (i32.load
                          (local.get $l115)))
                      (i32.shl
                        (local.get $p15)
                        (i32.const 2)))))
                (local.set $p26
                  (i32.load offset=16
                    (local.get $l38)))
                (local.set $p25
                  (i32.load offset=12
                    (local.get $l38)))
                (local.set $p16
                  (i32.load offset=4
                    (local.get $l38)))
                (local.set $l38
                  (i32.load
                    (i32.add
                      (local.get $l102)
                      (i32.mul
                        (local.get $l42)
                        (i32.const 12)))))
                (local.set $l191
                  (f64.load offset=40
                    (local.tee $l47
                      (i32.add
                        (i32.load
                          (i32.add
                            (i32.add
                              (local.get $l28)
                              (i32.const 56))
                            (i32.shl
                              (local.get $l42)
                              (i32.const 2))))
                        (local.get $l114)))))
                (local.set $l192
                  (f64.load offset=32
                    (local.get $l47)))
                (local.set $l193
                  (f64.load offset=24
                    (local.get $l47)))
                (local.set $l194
                  (f64.load offset=16
                    (local.get $l47)))
                (local.set $l195
                  (f64.load offset=8
                    (local.get $l47)))
                (local.set $l196
                  (f64.load
                    (local.get $l47)))
                (local.set $l49
                  (i32.const 0))
                (block $B138
                  (br_if $B138
                    (i32.lt_s
                      (local.get $p0)
                      (i32.const 4)))
                  (local.set $p11
                    (select
                      (i32.add
                        (i32.add
                          (local.get $l44)
                          (local.get $l60))
                        (local.tee $p13
                          (i32.shl
                            (local.get $p15)
                            (i32.const 2))))
                      (local.get $l45)
                      (local.get $l44)))
                  (local.set $p10
                    (select
                      (i32.add
                        (i32.add
                          (local.get $l44)
                          (local.get $l74))
                        (local.get $p13))
                      (local.get $l40)
                      (local.get $l44)))
                  (local.set $p9
                    (i32.add
                      (local.get $l38)
                      (local.get $l104)))
                  (local.set $l35
                    (i32.const 0))
                  (local.set $l37
                    (local.get $p26))
                  (local.set $l46
                    (local.get $p25))
                  (local.set $p13
                    (local.get $l66))
                  (local.set $p24
                    (local.get $l67))
                  (local.set $l36
                    (local.get $p27))
                  (local.set $l43
                    (local.get $p16))
                  (loop $L139
                    (local.set $l88
                      (f64x2.mul
                        (local.tee $l82
                          (f64x2.mul
                            (local.tee $l91
                              (v128.andnot
                                (local.tee $l91
                                  (f64x2.sub
                                    (local.tee $l52
                                      (v128.const i32x4 0x00000000 0x3ff00000 0x00000000 0x3ff00000))
                                    (f64x2.promote_low_f32x4
                                      (local.tee $l95
                                        (f32x4.div
                                          (f32x4.mul
                                            (f32x4.sub
                                              (v128.const i32x4 0x3f800000 0x3f800000 0x3f800000 0x3f800000)
                                              (f32x4.mul
                                                (local.tee $l89
                                                  (f32x4.sub
                                                    (local.tee $l83
                                                      (v128.load align=1
                                                        (local.get $p10)))
                                                    (local.tee $l84
                                                      (v128.load align=1
                                                        (local.get $l43)))))
                                                (local.get $l89)))
                                            (f32x4.add
                                              (f32x4.add
                                                (local.tee $l89
                                                  (f32x4.sub
                                                    (v128.load align=1
                                                      (local.get $l37))
                                                    (f32x4.mul
                                                      (local.get $l83)
                                                      (local.get $l84))))
                                                (local.get $l89))
                                              (local.tee $l89
                                                (v128.const i32x4 0x3a6bedfa 0x3a6bedfa 0x3a6bedfa 0x3a6bedfa))))
                                          (f32x4.add
                                            (f32x4.add
                                              (f32x4.sub
                                                (v128.load align=1
                                                  (local.get $p11))
                                                (f32x4.mul
                                                  (local.get $l83)
                                                  (local.get $l83)))
                                              (f32x4.sub
                                                (v128.load align=1
                                                  (local.get $l46))
                                                (f32x4.mul
                                                  (local.get $l84)
                                                  (local.get $l84))))
                                            (local.get $l89)))))))
                                (f64x2.le
                                  (local.get $l91)
                                  (local.tee $l89
                                    (v128.const i32x4 0x00000000 0x00000000 0x00000000 0x00000000)))))
                            (local.get $l91)))
                        (local.get $l82)))
                    (local.set $l90
                      (f64x2.mul
                        (local.tee $l82
                          (f64x2.mul
                            (local.tee $l95
                              (v128.andnot
                                (local.tee $l95
                                  (f64x2.sub
                                    (local.get $l52)
                                    (f64x2.promote_low_f32x4
                                      (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                        (local.get $l95)
                                        (local.get $l95)))))
                                (f64x2.le
                                  (local.get $l95)
                                  (local.get $l89))))
                            (local.get $l95)))
                        (local.get $l82)))
                    (local.set $l93
                      (f64x2.mul
                        (local.tee $l82
                          (f64x2.mul
                            (local.tee $l84
                              (v128.andnot
                                (f64x2.neg
                                  (local.tee $l83
                                    (f64x2.add
                                      (f64x2.div
                                        (f64x2.add
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l85
                                              (f32x4.abs
                                                (f32x4.sub
                                                  (v128.load align=1
                                                    (local.get $p9))
                                                  (local.get $l84)))))
                                          (local.get $l52))
                                        (f64x2.add
                                          (f64x2.promote_low_f32x4
                                            (local.tee $l92
                                              (f32x4.abs
                                                (f32x4.sub
                                                  (v128.load align=1
                                                    (local.get $l36))
                                                  (local.get $l83)))))
                                          (local.get $l52)))
                                      (local.tee $l96
                                        (v128.const i32x4 0x00000000 0xbff00000 0x00000000 0xbff00000)))))
                                (f64x2.ge
                                  (local.get $l83)
                                  (local.get $l89))))
                            (local.get $l84)))
                        (local.get $l82)))
                    (local.set $l94
                      (f64x2.mul
                        (local.tee $l94
                          (f64x2.mul
                            (local.tee $l82
                              (v128.andnot
                                (local.get $l83)
                                (f64x2.le
                                  (local.get $l83)
                                  (local.get $l89))))
                            (local.get $l82)))
                        (local.get $l94)))
                    (local.set $l92
                      (f64x2.mul
                        (local.tee $l92
                          (f64x2.mul
                            (local.tee $l85
                              (v128.andnot
                                (f64x2.neg
                                  (local.tee $l52
                                    (f64x2.add
                                      (f64x2.div
                                        (f64x2.add
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l85)
                                              (local.get $l85)))
                                          (local.get $l52))
                                        (f64x2.add
                                          (f64x2.promote_low_f32x4
                                            (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7
                                              (local.get $l92)
                                              (local.get $l92)))
                                          (local.get $l52)))
                                      (local.get $l96))))
                                (f64x2.ge
                                  (local.get $l52)
                                  (local.get $l89))))
                            (local.get $l85)))
                        (local.get $l92)))
                    (local.set $l96
                      (f64x2.mul
                        (local.tee $l96
                          (f64x2.mul
                            (local.tee $l89
                              (v128.andnot
                                (local.get $l52)
                                (f64x2.le
                                  (local.get $l52)
                                  (local.get $l89))))
                            (local.get $l89)))
                        (local.get $l96)))
                    (block $B140
                      (block $B141
                        (br_if $B141
                          (local.get $p14))
                        (local.set $l197
                          (f64x2.extract_lane 1
                            (local.get $l95)))
                        (local.set $l198
                          (f64x2.extract_lane 0
                            (local.get $l95)))
                        (local.set $l199
                          (f64x2.extract_lane 1
                            (local.get $l91)))
                        (local.set $l200
                          (f64x2.extract_lane 0
                            (local.get $l91)))
                        (br $B140))
                      (f64.store
                        (local.get $p13)
                        (local.tee $l200
                          (f64x2.extract_lane 0
                            (local.get $l91))))
                      (f64.store
                        (local.get $p24)
                        (f64x2.extract_lane 0
                          (local.get $l83)))
                      (f64.store
                        (i32.add
                          (local.get $p13)
                          (i32.const 8))
                        (local.tee $l199
                          (f64x2.extract_lane 1
                            (local.get $l91))))
                      (f64.store
                        (i32.add
                          (local.get $p24)
                          (i32.const 8))
                        (f64x2.extract_lane 1
                          (local.get $l83)))
                      (f64.store
                        (i32.add
                          (local.get $p13)
                          (i32.const 16))
                        (local.tee $l198
                          (f64x2.extract_lane 0
                            (local.get $l95))))
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
                        (local.tee $l197
                          (f64x2.extract_lane 1
                            (local.get $l95))))
                      (f64.store
                        (i32.add
                          (local.get $p24)
                          (i32.const 24))
                        (f64x2.extract_lane 1
                          (local.get $l52))))
                    (local.set $l37
                      (i32.add
                        (local.get $l37)
                        (i32.const 16)))
                    (local.set $l46
                      (i32.add
                        (local.get $l46)
                        (i32.const 16)))
                    (local.set $p13
                      (i32.add
                        (local.get $p13)
                        (i32.const 32)))
                    (local.set $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const 32)))
                    (local.set $p9
                      (i32.add
                        (local.get $p9)
                        (i32.const 16)))
                    (local.set $l36
                      (i32.add
                        (local.get $l36)
                        (i32.const 16)))
                    (local.set $l43
                      (i32.add
                        (local.get $l43)
                        (i32.const 16)))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const 16)))
                    (local.set $p10
                      (i32.add
                        (local.get $p10)
                        (i32.const 16)))
                    (local.set $l196
                      (f64.add
                        (local.get $l197)
                        (f64.add
                          (local.get $l198)
                          (f64.add
                            (local.get $l199)
                            (f64.add
                              (local.get $l196)
                              (local.get $l200))))))
                    (local.set $l191
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l92))
                        (f64.add
                          (f64.add
                            (f64x2.extract_lane 1
                              (local.get $l93))
                            (f64.add
                              (local.get $l191)
                              (f64x2.extract_lane 0
                                (local.get $l93))))
                          (f64x2.extract_lane 0
                            (local.get $l92)))))
                    (local.set $l192
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l85))
                        (f64.add
                          (f64.add
                            (f64x2.extract_lane 1
                              (local.get $l84))
                            (f64.add
                              (local.get $l192)
                              (f64x2.extract_lane 0
                                (local.get $l84))))
                          (f64x2.extract_lane 0
                            (local.get $l85)))))
                    (local.set $l193
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l96))
                        (f64.add
                          (f64.add
                            (f64x2.extract_lane 1
                              (local.get $l94))
                            (f64.add
                              (local.get $l193)
                              (f64x2.extract_lane 0
                                (local.get $l94))))
                          (f64x2.extract_lane 0
                            (local.get $l96)))))
                    (local.set $l194
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l89))
                        (f64.add
                          (f64.add
                            (f64x2.extract_lane 1
                              (local.get $l82))
                            (f64.add
                              (local.get $l194)
                              (f64x2.extract_lane 0
                                (local.get $l82))))
                          (f64x2.extract_lane 0
                            (local.get $l89)))))
                    (local.set $l195
                      (f64.add
                        (f64x2.extract_lane 1
                          (local.get $l90))
                        (f64.add
                          (f64.add
                            (f64x2.extract_lane 1
                              (local.get $l88))
                            (f64.add
                              (local.get $l195)
                              (f64x2.extract_lane 0
                                (local.get $l88))))
                          (f64x2.extract_lane 0
                            (local.get $l90)))))
                    (local.set $l48
                      (i32.add
                        (local.get $l35)
                        (i32.const 8)))
                    (local.set $l35
                      (local.tee $l49
                        (i32.add
                          (local.get $l35)
                          (i32.const 4))))
                    (br_if $L139
                      (i32.le_s
                        (local.get $l48)
                        (local.get $p0)))))
                (block $B142
                  (br_if $B142
                    (i32.le_s
                      (local.get $p0)
                      (local.get $l49)))
                  (local.set $p11
                    (select
                      (i32.add
                        (i32.add
                          (local.get $l44)
                          (local.get $l60))
                        (i32.shl
                          (local.get $p15)
                          (i32.const 2)))
                      (local.get $l45)
                      (local.get $l44)))
                  (local.set $p10
                    (select
                      (i32.add
                        (local.get $l44)
                        (local.get $l105))
                      (local.get $l40)
                      (local.get $l44)))
                  (local.set $p9
                    (i32.add
                      (local.get $l38)
                      (local.get $l104)))
                  (local.set $p13
                    (i32.shl
                      (local.get $l49)
                      (i32.const 2)))
                  (local.set $p24
                    (i32.shl
                      (local.get $l49)
                      (i32.const 3)))
                  (local.set $l35
                    (i32.sub
                      (local.get $p0)
                      (local.get $l49)))
                  (loop $L143
                    (local.set $l198
                      (select
                        (f64.const 0x0p+0 (;=0;))
                        (local.tee $l197
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
                                          (local.tee $l117
                                            (f32.load
                                              (i32.add
                                                (local.get $p10)
                                                (local.get $p13))))
                                          (local.tee $l131
                                            (f32.load
                                              (i32.add
                                                (local.get $p16)
                                                (local.get $p13))))))
                                      (local.get $l142)))
                                  (f32.add
                                    (f32.add
                                      (local.tee $l142
                                        (f32.sub
                                          (f32.load
                                            (i32.add
                                              (local.get $p26)
                                              (local.get $p13)))
                                          (f32.mul
                                            (local.get $l117)
                                            (local.get $l131))))
                                      (local.get $l142))
                                    (f32.const 0x1.d7dbf4p-11 (;=0.0009;))))
                                (f32.add
                                  (f32.add
                                    (f32.sub
                                      (f32.load
                                        (i32.add
                                          (local.get $p11)
                                          (local.get $p13)))
                                      (f32.mul
                                        (local.get $l117)
                                        (local.get $l117)))
                                    (f32.sub
                                      (f32.load
                                        (i32.add
                                          (local.get $p25)
                                          (local.get $p13)))
                                      (f32.mul
                                        (local.get $l131)
                                        (local.get $l131))))
                                  (f32.const 0x1.d7dbf4p-11 (;=0.0009;)))))))
                        (f64.le
                          (local.get $l197)
                          (f64.const 0x0p+0 (;=0;)))))
                    (local.set $l197
                      (f64.add
                        (f64.div
                          (f64.add
                            (f64.promote_f32
                              (f32.abs
                                (f32.sub
                                  (f32.load
                                    (i32.add
                                      (local.get $p9)
                                      (local.get $p13)))
                                  (local.get $l131))))
                            (f64.const 0x1p+0 (;=1;)))
                          (f64.add
                            (f64.promote_f32
                              (f32.abs
                                (f32.sub
                                  (f32.load
                                    (i32.add
                                      (local.get $p27)
                                      (local.get $p13)))
                                  (local.get $l117))))
                            (f64.const 0x1p+0 (;=1;))))
                        (f64.const -0x1p+0 (;=-1;))))
                    (block $B144
                      (br_if $B144
                        (i32.eqz
                          (local.get $p14)))
                      (f64.store
                        (i32.add
                          (local.get $l66)
                          (local.get $p24))
                        (local.get $l198))
                      (f64.store
                        (i32.add
                          (local.get $l67)
                          (local.get $p24))
                        (local.get $l197)))
                    (local.set $p10
                      (i32.add
                        (local.get $p10)
                        (i32.const 4)))
                    (local.set $p11
                      (i32.add
                        (local.get $p11)
                        (i32.const 4)))
                    (local.set $p16
                      (i32.add
                        (local.get $p16)
                        (i32.const 4)))
                    (local.set $p27
                      (i32.add
                        (local.get $p27)
                        (i32.const 4)))
                    (local.set $p9
                      (i32.add
                        (local.get $p9)
                        (i32.const 4)))
                    (local.set $p26
                      (i32.add
                        (local.get $p26)
                        (i32.const 4)))
                    (local.set $p25
                      (i32.add
                        (local.get $p25)
                        (i32.const 4)))
                    (local.set $p24
                      (i32.add
                        (local.get $p24)
                        (i32.const 8)))
                    (local.set $l196
                      (f64.add
                        (local.get $l196)
                        (local.get $l198)))
                    (local.set $l192
                      (f64.add
                        (local.get $l192)
                        (local.tee $l199
                          (select
                            (f64.const 0x0p+0 (;=0;))
                            (f64.neg
                              (local.get $l197))
                            (f64.ge
                              (local.get $l197)
                              (f64.const 0x0p+0 (;=0;)))))))
                    (local.set $l194
                      (f64.add
                        (local.get $l194)
                        (local.tee $l197
                          (select
                            (f64.const 0x0p+0 (;=0;))
                            (local.get $l197)
                            (f64.le
                              (local.get $l197)
                              (f64.const 0x0p+0 (;=0;)))))))
                    (local.set $l195
                      (f64.add
                        (local.get $l195)
                        (f64.mul
                          (local.tee $l198
                            (f64.mul
                              (local.get $l198)
                              (local.get $l198)))
                          (local.get $l198))))
                    (local.set $l191
                      (f64.add
                        (local.get $l191)
                        (f64.mul
                          (local.tee $l198
                            (f64.mul
                              (local.get $l199)
                              (local.get $l199)))
                          (local.get $l198))))
                    (local.set $l193
                      (f64.add
                        (local.get $l193)
                        (f64.mul
                          (local.tee $l197
                            (f64.mul
                              (local.get $l197)
                              (local.get $l197)))
                          (local.get $l197))))
                    (br_if $L143
                      (local.tee $l35
                        (i32.add
                          (local.get $l35)
                          (i32.const -1))))))
                (f64.store offset=40
                  (local.get $l47)
                  (local.get $l191))
                (f64.store offset=32
                  (local.get $l47)
                  (local.get $l192))
                (f64.store offset=24
                  (local.get $l47)
                  (local.get $l193))
                (f64.store offset=16
                  (local.get $l47)
                  (local.get $l194))
                (f64.store offset=8
                  (local.get $l47)
                  (local.get $l195))
                (f64.store
                  (local.get $l47)
                  (local.get $l196)))
              (br_if $L119
                (i32.ne
                  (local.tee $l42
                    (i32.add
                      (local.get $l42)
                      (i32.const 1)))
                  (local.get $l34)))))
          (br_if $L117
            (i32.ne
              (local.tee $l107
                (i32.add
                  (local.get $l107)
                  (i32.const 1)))
              (i32.const 3))))
        (local.set $l66
          (i32.add
            (local.get $l66)
            (local.get $l63)))
        (local.set $l67
          (i32.add
            (local.get $l67)
            (local.get $l63)))
        (local.set $l76
          (i32.add
            (local.get $l76)
            (i32.const 1)))
        (local.set $l55
          (i32.add
            (local.get $l55)
            (local.get $l64)))
        (local.set $l78
          (i32.add
            (local.get $l78)
            (local.get $l64)))
        (local.set $l79
          (i32.add
            (local.get $l79)
            (i32.const 1)))
        (br_if $L32
          (i32.ne
            (local.tee $p19
              (i32.add
                (local.get $p19)
                (i32.const 1)))
            (local.get $p20)))))
    (global.set $__stack_pointer
      (i32.add
        (local.get $l28)
        (i32.const 592)))
    (local.get $p23))
  (func $positive (type $t2) (param $p0 f32) (param $p1 f32) (param $p2 f32) (param $p3 i32)
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
  (func $vertical_column (type $t3) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32)
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
  (func $s2_metric_band (type $t4) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (result i32)
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
  (func $s2_metric_band2 (type $t5) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (param $p16 i32) (param $p17 i32) (param $p18 i32) (param $p19 i32) (result i32)
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
  (func $cube_root_bias (type $t6) (param $p0 f32) (result f32)
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
  (func $dummy (type $t7))
  (func $__wasm_call_dtors (type $t7)
    (call $dummy)
    (call $dummy))
  (func $s2_metric_scale.command_export (type $t0) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (param $p16 i32) (param $p17 i32) (param $p18 i32)
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
  (func $s2_metric_band.command_export (type $t4) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (result i32)
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
  (func $s2_metric_band2.command_export (type $t5) (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $p3 i32) (param $p4 i32) (param $p5 i32) (param $p6 i32) (param $p7 i32) (param $p8 i32) (param $p9 i32) (param $p10 i32) (param $p11 i32) (param $p12 i32) (param $p13 i32) (param $p14 i32) (param $p15 i32) (param $p16 i32) (param $p17 i32) (param $p18 i32) (param $p19 i32) (result i32)
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
  (export "s2MetricScale" (func $s2_metric_scale.command_export))
  (export "s2MetricBand" (func $s2_metric_band.command_export))
  (export "s2MetricBand2" (func $s2_metric_band2.command_export)))
