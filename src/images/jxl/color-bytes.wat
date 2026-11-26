;; SPDX-License-Identifier: MIT
;; The 8-bit samples a decoder writes for linear sRGB planes in a transform's own colours, and optionally the linear
;; sRGB of those samples (color-transform.mjs codedBytesFromLinear and linearOfCodedBytes). Offsets are bytes.

;; One channel's byte for the linear value $v in the transform's colours. $mode 1: the sRGB curve's level for the value
;; clamped to [0, 1] (NaN and -0 are 0), as capture-masks.wat's levelExact writes it: a bucket's first level ($first,
;; 8192 buckets), then the one step it may pass, and within 2^-36 of a threshold the exact level (exactPow wobbles
;; there, as levelOf allows). $at: 257 doubles, at[k] the least of level k or more (at[256] Infinity). $mode 0: the
;; nearest entry of the channel's table, by halving between entries.
(func $srgbByte (param $v f64) (param $at i32) (param $first i32) (result i32)
  (local $k i32) (local $p i32)
  (if (i32.eqz (f64.gt (local.get $v) (f64.const 0))) (then (return (i32.const 0))))
  (if (f64.ge (local.get $v) (f64.const 1)) (then (return (i32.const 255))))
  (local.set $k (i32.load8_u (i32.add (local.get $first) (i32.trunc_f64_s (f64.mul (local.get $v) (f64.const 8192))))))
  ;; A bucket holds at most one step (the curve's steepest slope, 12.92 x 255 a unit, is under 8192): one compare.
  (local.set $k (i32.add (local.get $k) (f64.ge (local.get $v) (f64.load offset=8 (i32.add (local.get $at) (i32.shl (local.get $k) (i32.const 3)))))))
  (local.set $p (i32.add (local.get $at) (i32.shl (local.get $k) (i32.const 3))))
  (if (i32.or
      (f64.le (f64.sub (local.get $v) (f64.load (local.get $p))) (f64.const 1.4551915228366852e-11))
      (f64.le (f64.sub (f64.load offset=8 (local.get $p)) (local.get $v)) (f64.const 1.4551915228366852e-11)))
    (then (return (call $levelExact (local.get $v)))))
  (local.get $k))

(func $codedByte (param $v f64) (param $mode i32) (param $table i32) (param $at i32) (param $first i32) (result i32)
  (local $lo i32) (local $hi i32) (local $mid i32) (local $t f64)
  (if (local.get $mode) (then (return (call $srgbByte (local.get $v) (local.get $at) (local.get $first)))))
  (local.set $hi (i32.const 255))
  (block $done
    (loop $halve
      (br_if $done (i32.ge_s (local.get $lo) (local.get $hi)))
      (local.set $mid (i32.shr_s (i32.add (local.get $lo) (local.get $hi)) (i32.const 1)))
      (local.set $t (f64.load (i32.add (local.get $table) (i32.shl (local.get $mid) (i32.const 3)))))
      (if (f64.lt (f64.div (f64.add (local.get $t) (f64.load offset=8 (i32.add (local.get $table) (i32.shl (local.get $mid) (i32.const 3))))) (f64.const 2)) (local.get $v))
        (then (local.set $lo (i32.add (local.get $mid) (i32.const 1))))
        (else (local.set $hi (local.get $mid))))
      (br $halve)))
  (local.get $lo))

;; $n pixels of three planes at $r, $g, $b (f32 when $narrow is set, else f64) to RGBA8 at $rgba (alpha 255), each
;; channel $codedByte's for $mode. $consts: f64 m[9] (linear sRGB to the transform's linear), back[9] (its inverse), the
;; three channels' tables [3][256], the sRGB levels at[257]; $first: u8[8192], each bucket's first level. When $lr is
;; not 0, the bytes' linear sRGB too (linearBytes), as f32 when $outNarrow is set, else f64.
(func $codedBytes (export "codedBytes")
  (param $r i32) (param $g i32) (param $b i32) (param $narrow i32) (param $n i32) (param $consts i32) (param $first i32) (param $mode i32)
  (param $rgba i32) (param $lr i32) (param $lg i32) (param $lb i32) (param $outNarrow i32)
  (local $i i32) (local $p i32) (local $x f64) (local $y f64) (local $z f64) (local $at i32)
  (local $t0 i32) (local $t1 i32) (local $t2 i32) (local $c0 i32) (local $c1 i32) (local $c2 i32)
  (local $m00 f64) (local $m01 f64) (local $m02 f64) (local $m10 f64) (local $m11 f64) (local $m12 f64) (local $m20 f64) (local $m21 f64) (local $m22 f64)
  (local $vx v128) (local $vy v128) (local $vz v128) (local $v0 v128) (local $v1 v128) (local $v2 v128)
  (local $vm00 v128) (local $vm01 v128) (local $vm02 v128) (local $vm10 v128) (local $vm11 v128) (local $vm12 v128) (local $vm20 v128) (local $vm21 v128) (local $vm22 v128)
  (local.set $at (i32.add (local.get $consts) (i32.const 6288)))
  (local.set $t0 (i32.add (local.get $consts) (i32.const 144)))
  (local.set $t1 (i32.add (local.get $consts) (i32.const 2192)))
  (local.set $t2 (i32.add (local.get $consts) (i32.const 4240)))
  (local.set $m00 (f64.load (local.get $consts))) (local.set $m01 (f64.load offset=8 (local.get $consts))) (local.set $m02 (f64.load offset=16 (local.get $consts)))
  (local.set $m10 (f64.load offset=24 (local.get $consts))) (local.set $m11 (f64.load offset=32 (local.get $consts))) (local.set $m12 (f64.load offset=40 (local.get $consts)))
  (local.set $m20 (f64.load offset=48 (local.get $consts))) (local.set $m21 (f64.load offset=56 (local.get $consts))) (local.set $m22 (f64.load offset=64 (local.get $consts)))
  (if (i32.and (local.get $mode) (local.get $narrow))
    (then
      (local.set $vm00 (f64x2.splat (local.get $m00))) (local.set $vm01 (f64x2.splat (local.get $m01))) (local.set $vm02 (f64x2.splat (local.get $m02)))
      (local.set $vm10 (f64x2.splat (local.get $m10))) (local.set $vm11 (f64x2.splat (local.get $m11))) (local.set $vm12 (f64x2.splat (local.get $m12)))
      (local.set $vm20 (f64x2.splat (local.get $m20))) (local.set $vm21 (f64x2.splat (local.get $m21))) (local.set $vm22 (f64x2.splat (local.get $m22)))
      (block $pairDone
        (loop $pair
          (br_if $pairDone (i32.gt_u (i32.add (local.get $i) (i32.const 2)) (local.get $n)))
          (local.set $p (i32.shl (local.get $i) (i32.const 2)))
          (local.set $vx (f64x2.promote_low_f32x4 (v128.load64_zero (i32.add (local.get $r) (local.get $p)))))
          (local.set $vy (f64x2.promote_low_f32x4 (v128.load64_zero (i32.add (local.get $g) (local.get $p)))))
          (local.set $vz (f64x2.promote_low_f32x4 (v128.load64_zero (i32.add (local.get $b) (local.get $p)))))
          (local.set $v0 (f64x2.add (f64x2.add (f64x2.mul (local.get $vm00) (local.get $vx)) (f64x2.mul (local.get $vm01) (local.get $vy))) (f64x2.mul (local.get $vm02) (local.get $vz))))
          (local.set $v1 (f64x2.add (f64x2.add (f64x2.mul (local.get $vm10) (local.get $vx)) (f64x2.mul (local.get $vm11) (local.get $vy))) (f64x2.mul (local.get $vm12) (local.get $vz))))
          (local.set $v2 (f64x2.add (f64x2.add (f64x2.mul (local.get $vm20) (local.get $vx)) (f64x2.mul (local.get $vm21) (local.get $vy))) (f64x2.mul (local.get $vm22) (local.get $vz))))
          (i32.store (i32.add (local.get $rgba) (local.get $p))
            (i32.or (i32.or (call $srgbByte (f64x2.extract_lane 0 (local.get $v0)) (local.get $at) (local.get $first))
                            (i32.shl (call $srgbByte (f64x2.extract_lane 0 (local.get $v1)) (local.get $at) (local.get $first)) (i32.const 8)))
              (i32.or (i32.shl (call $srgbByte (f64x2.extract_lane 0 (local.get $v2)) (local.get $at) (local.get $first)) (i32.const 16)) (i32.const 0xff000000))))
          (i32.store offset=4 (i32.add (local.get $rgba) (local.get $p))
            (i32.or (i32.or (call $srgbByte (f64x2.extract_lane 1 (local.get $v0)) (local.get $at) (local.get $first))
                            (i32.shl (call $srgbByte (f64x2.extract_lane 1 (local.get $v1)) (local.get $at) (local.get $first)) (i32.const 8)))
              (i32.or (i32.shl (call $srgbByte (f64x2.extract_lane 1 (local.get $v2)) (local.get $at) (local.get $first)) (i32.const 16)) (i32.const 0xff000000))))
          (local.set $i (i32.add (local.get $i) (i32.const 2)))
          (br $pair)))))
  (block $done
    (loop $pixel
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (if (local.get $narrow)
        (then
          (local.set $p (i32.shl (local.get $i) (i32.const 2)))
          (local.set $x (f64.promote_f32 (f32.load (i32.add (local.get $r) (local.get $p)))))
          (local.set $y (f64.promote_f32 (f32.load (i32.add (local.get $g) (local.get $p)))))
          (local.set $z (f64.promote_f32 (f32.load (i32.add (local.get $b) (local.get $p))))))
        (else
          (local.set $p (i32.shl (local.get $i) (i32.const 3)))
          (local.set $x (f64.load (i32.add (local.get $r) (local.get $p))))
          (local.set $y (f64.load (i32.add (local.get $g) (local.get $p))))
          (local.set $z (f64.load (i32.add (local.get $b) (local.get $p))))))
      (local.set $c0 (call $codedByte
        (f64.add (f64.add (f64.mul (local.get $m00) (local.get $x)) (f64.mul (local.get $m01) (local.get $y))) (f64.mul (local.get $m02) (local.get $z)))
        (local.get $mode) (local.get $t0) (local.get $at) (local.get $first)))
      (local.set $c1 (call $codedByte
        (f64.add (f64.add (f64.mul (local.get $m10) (local.get $x)) (f64.mul (local.get $m11) (local.get $y))) (f64.mul (local.get $m12) (local.get $z)))
        (local.get $mode) (local.get $t1) (local.get $at) (local.get $first)))
      (local.set $c2 (call $codedByte
        (f64.add (f64.add (f64.mul (local.get $m20) (local.get $x)) (f64.mul (local.get $m21) (local.get $y))) (f64.mul (local.get $m22) (local.get $z)))
        (local.get $mode) (local.get $t2) (local.get $at) (local.get $first)))
      (i32.store (i32.add (local.get $rgba) (i32.shl (local.get $i) (i32.const 2)))
        (i32.or (i32.or (local.get $c0) (i32.shl (local.get $c1) (i32.const 8)))
          (i32.or (i32.shl (local.get $c2) (i32.const 16)) (i32.const 0xff000000))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $pixel)))
  (if (local.get $lr) (then (call $linearBytes (local.get $rgba) (local.get $n) (local.get $consts) (local.get $lr) (local.get $lg) (local.get $lb) (local.get $outNarrow)))))
;; $n pixels of RGBA8 at $rgba to linear sRGB, f32 ($outNarrow 1), f64 ($outNarrow 0) or Q15 ($outNarrow 2: u16, the
;; value clipped to [0, 1] times 32768, rounded half up, NaN 0) planes at $lr, $lg, $lb: back (at $consts + 72) x the
;; channels' table values (at $consts + 144, [3][256]).
(func $linearBytes (export "linearBytes") (param $rgba i32) (param $n i32) (param $consts i32) (param $lr i32) (param $lg i32) (param $lb i32) (param $outNarrow i32)
  (local $i i32) (local $m i32) (local $p i32) (local $x f64) (local $y f64) (local $z f64)
  (local $b00 f64) (local $b01 f64) (local $b02 f64) (local $b10 f64) (local $b11 f64) (local $b12 f64) (local $b20 f64) (local $b21 f64) (local $b22 f64)
  (local.set $b00 (f64.load offset=72 (local.get $consts))) (local.set $b01 (f64.load offset=80 (local.get $consts))) (local.set $b02 (f64.load offset=88 (local.get $consts)))
  (local.set $b10 (f64.load offset=96 (local.get $consts))) (local.set $b11 (f64.load offset=104 (local.get $consts))) (local.set $b12 (f64.load offset=112 (local.get $consts)))
  (local.set $b20 (f64.load offset=120 (local.get $consts))) (local.set $b21 (f64.load offset=128 (local.get $consts))) (local.set $b22 (f64.load offset=136 (local.get $consts)))
  (block $done
    (loop $pixel
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (local.set $m (i32.add (local.get $rgba) (i32.shl (local.get $i) (i32.const 2))))
      (local.set $x (f64.load offset=144 (i32.add (local.get $consts) (i32.shl (i32.load8_u (local.get $m)) (i32.const 3)))))
      (local.set $y (f64.load offset=2192 (i32.add (local.get $consts) (i32.shl (i32.load8_u offset=1 (local.get $m)) (i32.const 3)))))
      (local.set $z (f64.load offset=4240 (i32.add (local.get $consts) (i32.shl (i32.load8_u offset=2 (local.get $m)) (i32.const 3)))))
      (if (i32.eq (local.get $outNarrow) (i32.const 2))
        (then
          (local.set $p (i32.shl (local.get $i) (i32.const 1)))
          (i32.store16 (i32.add (local.get $lr) (local.get $p)) (call $q15 (f64.add (f64.add (f64.mul (local.get $b00) (local.get $x)) (f64.mul (local.get $b01) (local.get $y))) (f64.mul (local.get $b02) (local.get $z)))))
          (i32.store16 (i32.add (local.get $lg) (local.get $p)) (call $q15 (f64.add (f64.add (f64.mul (local.get $b10) (local.get $x)) (f64.mul (local.get $b11) (local.get $y))) (f64.mul (local.get $b12) (local.get $z)))))
          (i32.store16 (i32.add (local.get $lb) (local.get $p)) (call $q15 (f64.add (f64.add (f64.mul (local.get $b20) (local.get $x)) (f64.mul (local.get $b21) (local.get $y))) (f64.mul (local.get $b22) (local.get $z))))))
      (else (if (local.get $outNarrow)
        (then
          (local.set $p (i32.shl (local.get $i) (i32.const 2)))
          (f32.store (i32.add (local.get $lr) (local.get $p)) (f32.demote_f64 (f64.add (f64.add (f64.mul (local.get $b00) (local.get $x)) (f64.mul (local.get $b01) (local.get $y))) (f64.mul (local.get $b02) (local.get $z)))))
          (f32.store (i32.add (local.get $lg) (local.get $p)) (f32.demote_f64 (f64.add (f64.add (f64.mul (local.get $b10) (local.get $x)) (f64.mul (local.get $b11) (local.get $y))) (f64.mul (local.get $b12) (local.get $z)))))
          (f32.store (i32.add (local.get $lb) (local.get $p)) (f32.demote_f64 (f64.add (f64.add (f64.mul (local.get $b20) (local.get $x)) (f64.mul (local.get $b21) (local.get $y))) (f64.mul (local.get $b22) (local.get $z))))))
        (else
          (local.set $p (i32.shl (local.get $i) (i32.const 3)))
          (f64.store (i32.add (local.get $lr) (local.get $p)) (f64.add (f64.add (f64.mul (local.get $b00) (local.get $x)) (f64.mul (local.get $b01) (local.get $y))) (f64.mul (local.get $b02) (local.get $z))))
          (f64.store (i32.add (local.get $lg) (local.get $p)) (f64.add (f64.add (f64.mul (local.get $b10) (local.get $x)) (f64.mul (local.get $b11) (local.get $y))) (f64.mul (local.get $b12) (local.get $z))))
          (f64.store (i32.add (local.get $lb) (local.get $p)) (f64.add (f64.add (f64.mul (local.get $b20) (local.get $x)) (f64.mul (local.get $b21) (local.get $y))) (f64.mul (local.get $b22) (local.get $z))))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $pixel))))
;; A linear value as Q15 (s2-cells.mjs's linear light): clipped to [0, 1] (NaN 0), times 32768, rounded half up.
(func $q15 (param $v f64) (result i32)
  (if (i32.eqz (f64.gt (local.get $v) (f64.const 0))) (then (return (i32.const 0))))
  (if (f64.ge (local.get $v) (f64.const 1)) (then (return (i32.const 32768))))
  (i32.trunc_f64_u (f64.floor (f64.add (f64.mul (local.get $v) (f64.const 32768)) (f64.const 0.5)))))
;; The sRGB curve's levels as levelExact writes them, halved on the doubles' bits: at[k] (f64, 257 at $at), the least
;; double of level k or more (at[0] 0, at[256] Infinity), and $first (u8[8192]), each bucket's first level.
(func $srgbLevels (export "srgbLevels") (param $at i32) (param $first i32)
  (local $k i32) (local $lo i64) (local $hi i64) (local $mid i64) (local $b i32)
  (f64.store (local.get $at) (f64.const 0))
  (f64.store offset=2048 (local.get $at) (f64.const inf))
  (local.set $k (i32.const 1))
  (loop $levels
    (local.set $lo (i64.const 0))
    (local.set $hi (i64.const 0x3ff0000000000000))
    (block $found
      (loop $halve
        (br_if $found (i64.le_u (i64.sub (local.get $hi) (local.get $lo)) (i64.const 1)))
        (local.set $mid (i64.shr_u (i64.add (local.get $lo) (local.get $hi)) (i64.const 1)))
        (if (i32.ge_s (call $levelExact (f64.reinterpret_i64 (local.get $mid))) (local.get $k))
          (then (local.set $hi (local.get $mid))) (else (local.set $lo (local.get $mid))))
        (br $halve)))
    (i64.store (i32.add (local.get $at) (i32.shl (local.get $k) (i32.const 3))) (local.get $hi))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br_if $levels (i32.lt_u (local.get $k) (i32.const 256))))
  (local.set $k (i32.const 0))
  (loop $buckets
    (block $passed
      (loop $step
        (br_if $passed (f64.lt (f64.div (f64.convert_i32_u (local.get $b)) (f64.const 8192))
          (f64.load offset=8 (i32.add (local.get $at) (i32.shl (local.get $k) (i32.const 3))))))
        (local.set $k (i32.add (local.get $k) (i32.const 1)))
        (br $step)))
    (i32.store8 (i32.add (local.get $first) (local.get $b)) (local.get $k))
    (local.set $b (i32.add (local.get $b) (i32.const 1)))
    (br_if $buckets (i32.lt_u (local.get $b) (i32.const 8192)))))
