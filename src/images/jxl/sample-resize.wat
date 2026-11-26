;; MIT. RGBA resampling in bounded row scratch. Appended to the full SIMD module by the canonical builder.
;; No imported math or JavaScript pixel callbacks.
;; Shared exact math comes from decode-kernels.wat in the same composed core.





;; transfer: 0 linear, 1 sRGB, 2 PQ, 3 HLG, 4 BT.709; from 1221 a pure power whose codestream gamma, in ten-millionths,
;; is the transfer (encoded = linear ^ (tf / 1e7)), odd about zero as sRGB is. Domains are checked by sampleRead.
(func $rsLinear (param $x f64) (param $tf i32) (result f64) (local $p f64)
  (if (i32.eqz (local.get $tf)) (then (return (local.get $x))))
  (if (i32.gt_u (local.get $tf) (i32.const 4)) (then
    (return (f64.copysign (call $exact_xpow (f64.abs (local.get $x)) (f64.div (f64.const 1e7) (f64.convert_i32_u (local.get $tf)))) (local.get $x)))))
  (if (i32.eq (local.get $tf) (i32.const 4)) (then
    (if (f64.lt (f64.abs (local.get $x)) (f64.const 0.081)) (then (return (f64.div (local.get $x) (f64.const 4.5)))))
    (return (f64.copysign (call $exact_xpow (f64.div (f64.add (f64.abs (local.get $x)) (f64.const 0.099)) (f64.const 1.099)) (f64.const 2.2222222222222223)) (local.get $x)))))
  (if (i32.eq (local.get $tf) (i32.const 1)) (then
    (if (f64.le (f64.abs (local.get $x)) (f64.const 0.04045)) (then (return (f64.div (local.get $x) (f64.const 12.92)))))
    (return (f64.copysign (call $exact_xpow (f64.div (f64.add (f64.abs (local.get $x)) (f64.const 0.055)) (f64.const 1.055)) (f64.const 2.4)) (local.get $x)))))
  (if (i32.eq (local.get $tf) (i32.const 2)) (then
    (local.set $p (call $exact_xpow (local.get $x) (f64.const 0.012683313515655966)))
    (return (call $exact_xpow (f64.div (f64.max (f64.sub (local.get $p) (f64.const 0.8359375)) (f64.const 0))
      (f64.sub (f64.const 18.8515625) (f64.mul (f64.const 18.6875) (local.get $p)))) (f64.const 6.277394636015326)))))
  (if (f64.le (local.get $x) (f64.const 0.5)) (then (return (f64.div (f64.mul (local.get $x) (local.get $x)) (f64.const 3)))) )
  (f64.div (f64.add (call $exact_xexp (f64.div (f64.sub (local.get $x) (f64.const 0.55991073)) (f64.const 0.17883277))) (f64.const 0.28466892)) (f64.const 12)))
(func $rsEncoded (param $x f64) (param $tf i32) (result f64) (local $p f64)
  (if (i32.eqz (local.get $tf)) (then (return (local.get $x))))
  (if (i32.gt_u (local.get $tf) (i32.const 4)) (then
    (return (f64.copysign (call $exact_xpow (f64.abs (local.get $x)) (f64.div (f64.convert_i32_u (local.get $tf)) (f64.const 1e7))) (local.get $x)))))
  (if (i32.eq (local.get $tf) (i32.const 4)) (then
    (if (f64.lt (f64.abs (local.get $x)) (f64.const 0.018)) (then (return (f64.mul (local.get $x) (f64.const 4.5)))))
    (return (f64.copysign (f64.sub (f64.mul (f64.const 1.099) (call $exact_xpow (f64.abs (local.get $x)) (f64.const 0.45))) (f64.const 0.099)) (local.get $x)))))
  (if (i32.eq (local.get $tf) (i32.const 1)) (then
    (if (f64.le (f64.abs (local.get $x)) (f64.const 0.0031308)) (then (return (f64.mul (local.get $x) (f64.const 12.92)))))
    (return (f64.copysign (f64.sub (f64.mul (f64.const 1.055) (call $exact_xpow (f64.abs (local.get $x)) (f64.const 0.4166666666666667))) (f64.const 0.055)) (local.get $x)))))
  (if (i32.eq (local.get $tf) (i32.const 2)) (then
    (local.set $p (call $exact_xpow (f64.max (f64.const 0) (local.get $x)) (f64.const 0.1593017578125)))
    (return (call $exact_xpow (f64.div (f64.add (f64.const 0.8359375) (f64.mul (f64.const 18.8515625) (local.get $p)))
      (f64.add (f64.const 1) (f64.mul (f64.const 18.6875) (local.get $p)))) (f64.const 78.84375)))))
  (if (f64.le (local.get $x) (f64.const 0.08333333333333333)) (then (return (f64.sqrt (f64.max (f64.const 0) (f64.mul (f64.const 3) (local.get $x)))))))
  (f64.add (f64.mul (f64.const 0.17883277) (call $exact_xlog (f64.sub (f64.mul (f64.const 12) (local.get $x)) (f64.const 0.28466892)))) (f64.const 0.55991073)))

;; levels: also rsFinish's output levels there (sampleLevels), or 0.
(func $sampleTable (export "sampleTable") (param $tf i32) (param $maximum i32) (param $out i32) (param $levels i32)
  (local $i i32)
  (loop $values
    (f64.store (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 3)))
      (call $rsLinear (f64.div (f64.convert_i32_u (local.get $i)) (f64.convert_i32_u (local.get $maximum))) (local.get $tf)))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br_if $values (i32.le_u (local.get $i) (local.get $maximum))))
  (if (local.get $levels) (then (call $sampleLevels (local.get $tf) (local.get $maximum) (local.get $levels)))))

;; format: 0 uint8, 1 uint16, 2 float16, 3 float32.
(func $rsRead (param $in i32) (param $index i32) (param $format i32) (param $maximum f64) (result f64)
  (local $bits i32) (local $e i32) (local $m i32) (local $v f64)
  (if (i32.eqz (local.get $format)) (then (return (f64.div (f64.convert_i32_u (i32.load8_u (i32.add (local.get $in) (local.get $index)))) (local.get $maximum)))))
  (if (i32.eq (local.get $format) (i32.const 3)) (then (return (f64.promote_f32 (f32.load (i32.add (local.get $in) (i32.shl (local.get $index) (i32.const 2))))))))
  (local.set $bits (i32.load16_u (i32.add (local.get $in) (i32.shl (local.get $index) (i32.const 1)))))
  (if (i32.eq (local.get $format) (i32.const 1)) (then (return (f64.div (f64.convert_i32_u (local.get $bits)) (local.get $maximum)))))
  (local.set $e (i32.and (i32.shr_u (local.get $bits) (i32.const 10)) (i32.const 31))) (local.set $m (i32.and (local.get $bits) (i32.const 1023)))
  (local.set $v (if (result f64) (i32.eqz (local.get $e))
    (then (f64.mul (f64.convert_i32_u (local.get $m)) (f64.const 0x1p-24)))
    (else (if (result f64) (i32.eq (local.get $e) (i32.const 31)) (then (select (f64.const nan) (f64.const inf) (local.get $m)))
      (else (f64.mul (f64.convert_i32_u (i32.add (i32.const 1024) (local.get $m))) (call $exact_pow2 (i32.sub (local.get $e) (i32.const 25)))))))))
  (select (f64.neg (local.get $v)) (local.get $v) (i32.and (local.get $bits) (i32.const 32768))))
(func $rsHalf (param $value f64) (result i32)
  (local $sign i32) (local $e i32) (local $m f64) (local $bits i32)
  (local.set $sign (i32.and (i32.wrap_i64 (i64.shr_u (i64.reinterpret_f64 (local.get $value)) (i64.const 48))) (i32.const 32768)))
  (if (f64.eq (local.get $value) (f64.const 0)) (then (return (local.get $sign))))
  (local.set $value (f64.abs (local.get $value))) (local.set $m (local.get $value))
  (block $small (loop $down (br_if $small (f64.lt (local.get $m) (f64.const 2))) (local.set $m (f64.div (local.get $m) (f64.const 2))) (local.set $e (i32.add (local.get $e) (i32.const 1))) (br $down)))
  (block $large (loop $up (br_if $large (f64.ge (local.get $m) (f64.const 1))) (local.set $m (f64.mul (local.get $m) (f64.const 2))) (local.set $e (i32.sub (local.get $e) (i32.const 1))) (br $up)))
  (if (i32.lt_s (local.get $e) (i32.const -14)) (then (local.set $m (f64.mul (local.get $value) (f64.const 16384))) (local.set $e (i32.const -15)))
    (else (local.set $m (f64.sub (local.get $m) (f64.const 1)))))
  (local.set $bits (i32.trunc_f64_u (f64.nearest (f64.mul (local.get $m) (f64.const 1024)))))
  (if (i32.eq (local.get $bits) (i32.const 1024)) (then (local.set $bits (i32.const 0)) (local.set $e (i32.add (local.get $e) (i32.const 1)))))
  (i32.or (local.get $sign) (i32.or (i32.shl (i32.add (local.get $e) (i32.const 15)) (i32.const 10)) (local.get $bits))))

;; Output is associated linear-light f64 RGBA. Status: 1 alpha, 2 color, 3 PQ, 4 HLG, 5 output range.
(func $sampleRead (param $in i32) (param $width i32) (param $format i32) (param $maximum f64)
  (param $tf i32) (param $associated i32) (param $gamma f64) (param $lr f64) (param $lg f64) (param $lb f64) (param $out i32) (param $table i32) (result i32)
  (local $x i32) (local $c i32) (local $at i32) (local $dest i32) (local $alpha f64) (local $value f64) (local $y f64) (local $gain f64)
  ;; With a table (8- or 16-bit, unassociated) every sample is a whole number over the maximum: alpha is in [0, 1] and
  ;; colors are finite, so the checks below always pass; colors come from the table, the rest as below.
  ;; 8-bit with no gain: an opaque pixel's alpha is exactly 1, so its colors are the table's values times 1 times 1.
  (if (i32.and (i32.ne (local.get $table) (i32.const 0)) (i32.and (i32.eqz (local.get $format)) (f64.eq (local.get $gamma) (f64.const 1)))) (then
    (local.set $c (i32.trunc_f64_u (local.get $maximum)))
    (loop $bytes
      (local.set $at (i32.load (i32.add (local.get $in) (i32.shl (local.get $x) (i32.const 2)))))
      (local.set $dest (i32.add (local.get $out) (i32.shl (local.get $x) (i32.const 5))))
      (local.set $alpha (select (f64.const 1) (f64.div (f64.convert_i32_u (i32.shr_u (local.get $at) (i32.const 24))) (local.get $maximum))
        (i32.eq (i32.shr_u (local.get $at) (i32.const 24)) (local.get $c))))
      (f64.store (local.get $dest) (f64.mul (f64.load (i32.add (local.get $table) (i32.shl (i32.and (local.get $at) (i32.const 255)) (i32.const 3)))) (local.get $alpha)))
      (f64.store offset=8 (local.get $dest) (f64.mul (f64.load (i32.add (local.get $table) (i32.shl (i32.and (i32.shr_u (local.get $at) (i32.const 8)) (i32.const 255)) (i32.const 3)))) (local.get $alpha)))
      (f64.store offset=16 (local.get $dest) (f64.mul (f64.load (i32.add (local.get $table) (i32.shl (i32.and (i32.shr_u (local.get $at) (i32.const 16)) (i32.const 255)) (i32.const 3)))) (local.get $alpha)))
      (f64.store offset=24 (local.get $dest) (local.get $alpha))
      (local.set $x (i32.add (local.get $x) (i32.const 1))) (br_if $bytes (i32.lt_u (local.get $x) (local.get $width))))
    (return (i32.const 0))))
  (if (local.get $table) (then
    (loop $tabled
      (local.set $at (i32.shl (local.get $x) (i32.const 2))) (local.set $dest (i32.add (local.get $out) (i32.shl (local.get $x) (i32.const 5))))
      (local.set $alpha (call $rsRead (local.get $in) (i32.add (local.get $at) (i32.const 3)) (local.get $format) (local.get $maximum)))
      (local.set $c (i32.const 0))
      (loop $colors
        (f64.store (i32.add (local.get $dest) (i32.shl (local.get $c) (i32.const 3))) (f64.load (i32.add (local.get $table) (i32.shl
          (if (result i32) (i32.eqz (local.get $format))
            (then (i32.load8_u (i32.add (local.get $in) (i32.add (local.get $at) (local.get $c)))))
            (else (i32.load16_u (i32.add (local.get $in) (i32.shl (i32.add (local.get $at) (local.get $c)) (i32.const 1)))))) (i32.const 3)))))
        (local.set $c (i32.add (local.get $c) (i32.const 1))) (br_if $colors (i32.lt_u (local.get $c) (i32.const 3))))
      (local.set $gain (f64.const 1))
      (if (f64.ne (local.get $gamma) (f64.const 1)) (then
        (local.set $y (f64.add (f64.add (f64.add (f64.const 0) (f64.mul (f64.load (local.get $dest)) (local.get $lr)))
          (f64.mul (f64.load offset=8 (local.get $dest)) (local.get $lg))) (f64.mul (f64.load offset=16 (local.get $dest)) (local.get $lb))))
        (local.set $gain (select (call $exact_xpow (local.get $y) (f64.sub (local.get $gamma) (f64.const 1))) (f64.const 0) (f64.gt (local.get $y) (f64.const 0))))))
      (f64.store (local.get $dest) (f64.mul (f64.mul (f64.load (local.get $dest)) (local.get $gain)) (local.get $alpha)))
      (f64.store offset=8 (local.get $dest) (f64.mul (f64.mul (f64.load offset=8 (local.get $dest)) (local.get $gain)) (local.get $alpha)))
      (f64.store offset=16 (local.get $dest) (f64.mul (f64.mul (f64.load offset=16 (local.get $dest)) (local.get $gain)) (local.get $alpha)))
      (f64.store offset=24 (local.get $dest) (local.get $alpha))
      (local.set $x (i32.add (local.get $x) (i32.const 1))) (br_if $tabled (i32.lt_u (local.get $x) (local.get $width))))
    (return (i32.const 0))))
  (loop $pixels
    (local.set $at (i32.shl (local.get $x) (i32.const 2))) (local.set $dest (i32.add (local.get $out) (i32.shl (local.get $x) (i32.const 5))))
    (local.set $alpha (call $rsRead (local.get $in) (i32.add (local.get $at) (i32.const 3)) (local.get $format) (local.get $maximum)))
    (if (i32.eqz (i32.and (f64.ge (local.get $alpha) (f64.const 0)) (f64.le (local.get $alpha) (f64.const 1)))) (then (return (i32.const 1))))
    (local.set $c (i32.const 0))
    (loop $colors
      (local.set $value (call $rsRead (local.get $in) (i32.add (local.get $at) (local.get $c)) (local.get $format) (local.get $maximum)))
      (if (i32.eqz (f64.lt (f64.abs (local.get $value)) (f64.const inf))) (then (return (i32.const 2))))
      (if (local.get $associated) (then (local.set $value (select (f64.div (local.get $value) (local.get $alpha)) (f64.const 0) (f64.ne (local.get $alpha) (f64.const 0))))))
      (if (i32.and (i32.eq (local.get $tf) (i32.const 2)) (i32.or (f64.lt (local.get $value) (f64.const 0)) (f64.gt (local.get $value) (f64.const 1)))) (then (return (i32.const 3))))
      (if (i32.and (i32.eq (local.get $tf) (i32.const 3)) (f64.lt (local.get $value) (f64.const 0))) (then (return (i32.const 4))))
      (f64.store (i32.add (local.get $dest) (i32.shl (local.get $c) (i32.const 3))) (if (result f64) (local.get $table)
        (then (f64.load (i32.add (local.get $table) (i32.shl
          (if (result i32) (i32.eqz (local.get $format))
            (then (i32.load8_u (i32.add (local.get $in) (i32.add (local.get $at) (local.get $c)))))
            (else (i32.load16_u (i32.add (local.get $in) (i32.shl (i32.add (local.get $at) (local.get $c)) (i32.const 1)))))) (i32.const 3)))))
        (else (call $rsLinear (local.get $value) (local.get $tf)))))
      (local.set $c (i32.add (local.get $c) (i32.const 1))) (br_if $colors (i32.lt_u (local.get $c) (i32.const 3))))
    (local.set $gain (f64.const 1))
    (if (f64.ne (local.get $gamma) (f64.const 1)) (then
      (local.set $y (f64.add (f64.add (f64.add (f64.const 0) (f64.mul (f64.load (local.get $dest)) (local.get $lr)))
        (f64.mul (f64.load offset=8 (local.get $dest)) (local.get $lg))) (f64.mul (f64.load offset=16 (local.get $dest)) (local.get $lb))))
      (local.set $gain (select (call $exact_xpow (local.get $y) (f64.sub (local.get $gamma) (f64.const 1))) (f64.const 0) (f64.gt (local.get $y) (f64.const 0))))))
    (local.set $c (i32.const 0))
    (loop $associate
      (local.set $at (i32.add (local.get $dest) (i32.shl (local.get $c) (i32.const 3))))
      (f64.store (local.get $at) (f64.mul (f64.mul (f64.load (local.get $at)) (local.get $gain)) (local.get $alpha)))
      (local.set $c (i32.add (local.get $c) (i32.const 1))) (br_if $associate (i32.lt_u (local.get $c) (i32.const 3))))
    (f64.store offset=24 (local.get $dest) (local.get $alpha))
    (local.set $x (i32.add (local.get $x) (i32.const 1))) (br_if $pixels (i32.lt_u (local.get $x) (local.get $width))))
  (i32.const 0))

(func $sampleAccumulate (param $row i32) (param $sum i32) (param $count i32) (param $weight f64)
  (local $i i32) (local $at i32) (local $w v128)
  (local.set $w (f64x2.splat (local.get $weight)))
  (loop $samples
    (local.set $at (i32.add (local.get $sum) (local.get $i)))
    (v128.store (local.get $at) (f64x2.add (v128.load (local.get $at)) (f64x2.mul (v128.load (i32.add (local.get $row) (local.get $i))) (local.get $w))))
    (local.set $i (i32.add (local.get $i) (i32.const 16))) (br_if $samples (i32.lt_u (local.get $i) (i32.shl (local.get $count) (i32.const 3))))))

;; The integer level rsFinish writes for one color value with no gain and unassociated output.
(func $rsLevel (param $v f64) (param $tf i32) (param $maximum f64) (result f64) (local $value f64)
  (local.set $value (f64.mul (f64.max (f64.const 0) (f64.min (f64.const 1) (f64.mul (call $rsEncoded (f64.mul (local.get $v) (f64.const 1)) (local.get $tf)) (f64.const 1)))) (local.get $maximum)))
  (f64.add (f64.floor (local.get $value)) (select (f64.const 1) (f64.const 0) (f64.ge (f64.sub (local.get $value) (f64.floor (local.get $value))) (f64.const 0.5)))))
;; levels[k - 1]: the least value in [0, 2] that $rsLevel writes as k or more (inf when none), k = 1..maximum. Searched
;; over the bit patterns of non-negative doubles, which order as the values do. Then 4,097 starts at out + 32768: how
;; many levels lie at or below b / 2048, so a value's level is searched only within its 1/2048 slice.
(func $sampleLevels (param $tf i32) (param $maximum i32) (param $out i32)
  (local $k i32) (local $lo i64) (local $hi i64) (local $mid i64) (local $top i64) (local $b i32) (local $n i32)
  (local.set $top (i64.reinterpret_f64 (f64.const 2)))
  (local.set $k (i32.const 1))
  (loop $levels
    (local.set $hi (local.get $top))
    (block $found (loop $search
      (br_if $found (i64.ge_u (local.get $lo) (local.get $hi)))
      (local.set $mid (i64.shr_u (i64.add (local.get $lo) (local.get $hi)) (i64.const 1)))
      (if (f64.ge (call $rsLevel (f64.reinterpret_i64 (local.get $mid)) (local.get $tf) (f64.convert_i32_u (local.get $maximum))) (f64.convert_i32_u (local.get $k)))
        (then (local.set $hi (local.get $mid))) (else (local.set $lo (i64.add (local.get $mid) (i64.const 1)))))
      (br $search)))
    (f64.store (i32.add (local.get $out) (i32.shl (i32.sub (local.get $k) (i32.const 1)) (i32.const 3)))
      (select (f64.const inf) (f64.reinterpret_i64 (local.get $lo))
        (f64.lt (call $rsLevel (f64.reinterpret_i64 (local.get $lo)) (local.get $tf) (f64.convert_i32_u (local.get $maximum))) (f64.convert_i32_u (local.get $k)))))
    (local.set $k (i32.add (local.get $k) (i32.const 1))) (br_if $levels (i32.le_u (local.get $k) (local.get $maximum))))
  (loop $starts
    (block $counted (loop $count
      (br_if $counted (i32.ge_u (local.get $n) (local.get $maximum)))
      (br_if $counted (f64.gt (f64.load (i32.add (local.get $out) (i32.shl (local.get $n) (i32.const 3))))
        (f64.div (f64.convert_i32_u (local.get $b)) (f64.const 2048))))
      (local.set $n (i32.add (local.get $n) (i32.const 1))) (br $count)))
    (i32.store (i32.add (i32.add (local.get $out) (i32.const 32768)) (i32.shl (local.get $b) (i32.const 2))) (local.get $n))
    (local.set $b (i32.add (local.get $b) (i32.const 1))) (br_if $starts (i32.le_u (local.get $b) (i32.const 4096)))))
;; How many levels lie at or below v (0 <= v <= 2): the level $rsLevel gives v, when it never falls as v grows.
(func $rsCount (param $v f64) (param $levels i32) (param $maximum i32) (result i32) (local $lo i32) (local $hi i32) (local $mid i32) (local $b i32)
  (local.set $b (i32.shl (select (i32.const 4095) (i32.trunc_f64_u (f64.mul (local.get $v) (f64.const 2048)))
    (f64.ge (local.get $v) (f64.const 2))) (i32.const 2)))
  (local.set $lo (i32.load (i32.add (i32.add (local.get $levels) (i32.const 32768)) (local.get $b))))
  (local.set $hi (i32.load offset=4 (i32.add (i32.add (local.get $levels) (i32.const 32768)) (local.get $b))))
  (block $done (loop $search
    (br_if $done (i32.ge_u (local.get $lo) (local.get $hi)))
    (local.set $mid (i32.shr_u (i32.add (local.get $lo) (local.get $hi)) (i32.const 1)))
    (if (f64.le (f64.load (i32.add (local.get $levels) (i32.shl (local.get $mid) (i32.const 3)))) (local.get $v))
      (then (local.set $lo (i32.add (local.get $mid) (i32.const 1)))) (else (local.set $hi (local.get $mid))))
    (br $search)))
  (local.get $lo))

;; safe (sampleSafe): a color value v in [0, 2) whose slice trunc(v * 32768) holds k + 1 takes level k at once, the level
;; the levels search below gives every value in that slice; a slice holding 0 is searched as before.
(func $rsFinish (param $sum i32) (param $width i32) (param $format i32) (param $maximum f64)
  (param $tf i32) (param $associated i32) (param $gamma f64) (param $lr f64) (param $lg f64) (param $lb f64) (param $out i32) (param $levels i32) (param $safe i32) (result i32)
  (local $entry i32) (local $x i32) (local $c i32) (local $at i32) (local $dest i32) (local $alpha f64) (local $value f64) (local $y f64) (local $gain f64) (local $alphaZero i32) (local $v f64) (local $level i32) (local $edge f64)
  (loop $pixels
    (local.set $at (i32.add (local.get $sum) (i32.shl (local.get $x) (i32.const 5))))
    (local.set $alpha (f64.max (f64.const 0) (f64.min (f64.const 1) (f64.load offset=24 (local.get $at)))))
    ;; Test alpha in the stored output format: integer rounding and float underflow can produce zero.
    (local.set $alphaZero (if (result i32) (i32.lt_u (local.get $format) (i32.const 2))
      (then (f64.lt (f64.mul (local.get $alpha) (local.get $maximum)) (f64.const 0.5)))
      (else (if (result i32) (i32.eq (local.get $format) (i32.const 2))
        (then (i32.eqz (call $rsHalf (local.get $alpha))))
        (else (f32.eq (f32.demote_f64 (local.get $alpha)) (f32.const 0)))))))
    (local.set $c (i32.const 0))
    (loop $unassociate
      (local.set $dest (i32.add (local.get $at) (i32.shl (local.get $c) (i32.const 3))))
      (f64.store (local.get $dest) (select (f64.div (f64.load (local.get $dest)) (local.get $alpha)) (f64.const 0) (f64.ne (local.get $alpha) (f64.const 0))))
      (local.set $c (i32.add (local.get $c) (i32.const 1))) (br_if $unassociate (i32.lt_u (local.get $c) (i32.const 3))))
    (local.set $gain (f64.const 1))
    (if (f64.ne (local.get $gamma) (f64.const 1)) (then
      (local.set $y (f64.add (f64.add (f64.add (f64.const 0) (f64.mul (f64.load (local.get $at)) (local.get $lr)))
        (f64.mul (f64.load offset=8 (local.get $at)) (local.get $lg))) (f64.mul (f64.load offset=16 (local.get $at)) (local.get $lb))))
      (local.set $gain (select (call $exact_xpow (local.get $y) (f64.sub (f64.div (f64.const 1) (local.get $gamma)) (f64.const 1))) (f64.const 0) (f64.gt (local.get $y) (f64.const 0))))))
    (local.set $c (i32.const 0))
    (loop $colors
      (if (i32.and (i32.ne (local.get $safe) (i32.const 0)) (i32.lt_u (local.get $c) (i32.const 3))) (then
        (local.set $v (f64.load (i32.add (local.get $at) (i32.shl (local.get $c) (i32.const 3)))))
        (if (i32.and (f64.ge (local.get $v) (f64.const 0)) (f64.lt (local.get $v) (f64.const 2))) (then
          (local.set $entry (i32.load16_u (i32.add (local.get $safe) (i32.shl (i32.trunc_f64_u (f64.mul (local.get $v) (f64.const 32768))) (i32.const 1)))))
          (if (local.get $entry) (then
            (local.set $dest (i32.add (i32.shl (local.get $x) (i32.const 2)) (local.get $c)))
            (local.set $value (select (f64.const 0) (f64.convert_i32_u (i32.sub (local.get $entry) (i32.const 1))) (local.get $alphaZero)))
            (if (i32.eqz (local.get $format)) (then (i32.store8 (i32.add (local.get $out) (local.get $dest)) (i32.trunc_f64_u (local.get $value))))
              (else (i32.store16 (i32.add (local.get $out) (i32.shl (local.get $dest) (i32.const 1))) (i32.trunc_f64_u (local.get $value)))))
            (local.set $c (i32.add (local.get $c) (i32.const 1))) (br $colors)))))))
      ;; levels (integer output, no gain, unassociated): a color value in [0, 2] clearly inside one level (more than 2^-40
      ;; of itself from either edge) takes that level from the table. The exact encoding can wobble by a few doubles at an
      ;; edge, so a value near one is encoded exactly below.
      (local.set $v (f64.load (i32.add (local.get $at) (i32.shl (local.get $c) (i32.const 3)))))
      (if (i32.and (i32.and (i32.ne (local.get $levels) (i32.const 0)) (i32.lt_u (local.get $c) (i32.const 3)))
          (i32.and (f64.ge (local.get $v) (f64.const 0)) (f64.le (local.get $v) (f64.const 2))))
        (then
          (local.set $level (call $rsCount (local.get $v) (local.get $levels) (i32.trunc_f64_u (local.get $maximum))))
          (local.set $edge (f64.mul (local.get $v) (f64.const 0x1p-40)))
          (if (i32.and
                (i32.or (i32.eqz (local.get $level)) (f64.gt (f64.sub (local.get $v)
                  (f64.load (i32.add (local.get $levels) (i32.shl (i32.sub (local.get $level) (i32.const 1)) (i32.const 3))))) (local.get $edge)))
                (i32.or (i32.ge_u (local.get $level) (i32.trunc_f64_u (local.get $maximum))) (f64.gt (f64.sub
                  (f64.load (i32.add (local.get $levels) (i32.shl (local.get $level) (i32.const 3)))) (local.get $v)) (local.get $edge))))
            (then
              (local.set $dest (i32.add (i32.shl (local.get $x) (i32.const 2)) (local.get $c)))
              (local.set $value (select (f64.const 0) (f64.convert_i32_u (local.get $level)) (local.get $alphaZero)))
              (if (i32.eqz (local.get $format)) (then (i32.store8 (i32.add (local.get $out) (local.get $dest)) (i32.trunc_f64_u (local.get $value))))
                (else (i32.store16 (i32.add (local.get $out) (i32.shl (local.get $dest) (i32.const 1))) (i32.trunc_f64_u (local.get $value)))))
              (local.set $c (i32.add (local.get $c) (i32.const 1))) (br $colors)))))
      (local.set $value (if (result f64) (i32.eq (local.get $c) (i32.const 3)) (then (local.get $alpha))
        (else (f64.mul (call $rsEncoded (f64.mul (f64.load (i32.add (local.get $at) (i32.shl (local.get $c) (i32.const 3)))) (local.get $gain)) (local.get $tf))
          (select (local.get $alpha) (f64.const 1) (local.get $associated))))))
      ;; A resized fully transparent pixel has no retained color, including PQ's nonzero encoded black.
      (if (i32.and (i32.lt_u (local.get $c) (i32.const 3)) (local.get $alphaZero)) (then (local.set $value (f64.const 0))))
      (if (i32.eqz (f64.lt (f64.abs (local.get $value)) (f64.const inf))) (then (return (i32.const 5))))
      (local.set $dest (i32.add (i32.shl (local.get $x) (i32.const 2)) (local.get $c)))
      (if (i32.lt_u (local.get $format) (i32.const 2)) (then
        (local.set $value (f64.mul (f64.max (f64.const 0) (f64.min (f64.const 1) (local.get $value))) (local.get $maximum)))
        (local.set $value (f64.add (f64.floor (local.get $value))
          (select (f64.const 1) (f64.const 0) (f64.ge (f64.sub (local.get $value) (f64.floor (local.get $value))) (f64.const 0.5)))))
        (if (i32.eqz (local.get $format)) (then (i32.store8 (i32.add (local.get $out) (local.get $dest)) (i32.trunc_f64_u (local.get $value))))
          (else (i32.store16 (i32.add (local.get $out) (i32.shl (local.get $dest) (i32.const 1))) (i32.trunc_f64_u (local.get $value))))))
      (else (if (i32.eq (local.get $format) (i32.const 2)) (then
        (if (f64.ge (f64.abs (local.get $value)) (f64.const 65520)) (then (return (i32.const 5))))
        (i32.store16 (i32.add (local.get $out) (i32.shl (local.get $dest) (i32.const 1))) (call $rsHalf (local.get $value))))
        (else (if (f64.gt (f64.abs (local.get $value)) (f64.const 3.4028234663852886e38)) (then (return (i32.const 5))))
          (f32.store (i32.add (local.get $out) (i32.shl (local.get $dest) (i32.const 2))) (f32.demote_f64 (local.get $value)))))))
      (local.set $c (i32.add (local.get $c) (i32.const 1))) (br_if $colors (i32.lt_u (local.get $c) (i32.const 4))))
    (local.set $x (i32.add (local.get $x) (i32.const 1))) (br_if $pixels (i32.lt_u (local.get $x) (local.get $width))))
  (i32.const 0))

;; The resize a band at a time. samplePlan finds each output column's first source column, its count and its area or
;; linear weights once; sampleBand reads each source row to linear light (sampleRead), filters it across (rsPlanned),
;; sums it into the output rows it covers (sampleAccumulate, by sampleResizeRows' weights) and writes them (rsFinish).
(func $samplePlan (export "samplePlan") (param $width i32) (param $target i32) (param $index i32) (param $weights i32) (result i32)
  (local $x i32) (local $k i32) (local $hi i32) (local $offset i32) (local $at i32) (local $wide i32)
  (local $start f64) (local $end f64) (local $fraction f64) (local $weight f64)
  (local.set $wide (i32.ge_u (local.get $target) (local.get $width)))
  (loop $pixels
    (if (local.get $wide) (then
      (local.set $start (f64.max (f64.const 0) (f64.min (f64.convert_i32_u (i32.sub (local.get $width) (i32.const 1)))
        (f64.sub (f64.div (f64.mul (f64.add (f64.convert_i32_u (local.get $x)) (f64.const 0.5)) (f64.convert_i32_u (local.get $width))) (f64.convert_i32_u (local.get $target))) (f64.const 0.5)))))
      (local.set $k (i32.trunc_f64_u (f64.floor (local.get $start))))
      (local.set $fraction (f64.sub (local.get $start) (f64.convert_i32_u (local.get $k))))
      (local.set $hi (i32.add (local.get $k) (select (i32.const 2) (i32.const 1) (i32.lt_u (i32.add (local.get $k) (i32.const 1)) (local.get $width)))))
      (local.set $weight (f64.sub (f64.const 1) (local.get $fraction))))
    (else
      (local.set $start (f64.div (f64.mul (f64.convert_i32_u (local.get $x)) (f64.convert_i32_u (local.get $width))) (f64.convert_i32_u (local.get $target))))
      (local.set $end (f64.div (f64.mul (f64.convert_i32_u (i32.add (local.get $x) (i32.const 1))) (f64.convert_i32_u (local.get $width))) (f64.convert_i32_u (local.get $target))))
      (local.set $k (i32.trunc_f64_u (f64.floor (local.get $start)))) (local.set $hi (i32.trunc_f64_u (f64.ceil (local.get $end))))))
    (local.set $at (i32.add (local.get $index) (i32.mul (local.get $x) (i32.const 12))))
    (i32.store (local.get $at) (local.get $k))
    (i32.store offset=4 (local.get $at) (i32.sub (local.get $hi) (local.get $k)))
    (i32.store offset=8 (local.get $at) (local.get $offset))
    (loop $taps
      (if (i32.eqz (local.get $wide)) (then
        (local.set $weight (f64.div (f64.sub (f64.min (local.get $end) (f64.convert_i32_u (i32.add (local.get $k) (i32.const 1))))
          (f64.max (local.get $start) (f64.convert_i32_u (local.get $k)))) (f64.sub (local.get $end) (local.get $start))))))
      (f64.store (i32.add (local.get $weights) (i32.shl (local.get $offset) (i32.const 3))) (local.get $weight))
      (local.set $offset (i32.add (local.get $offset) (i32.const 1)))
      (local.set $weight (local.get $fraction)) (local.set $k (i32.add (local.get $k) (i32.const 1))) (br_if $taps (i32.lt_u (local.get $k) (local.get $hi))))
    (local.set $x (i32.add (local.get $x) (i32.const 1))) (br_if $pixels (i32.lt_u (local.get $x) (local.get $target))))
  (local.get $offset))
(func $rsPlanned (param $in i32) (param $target i32) (param $out i32) (param $index i32) (param $weights i32)
  (local $x i32) (local $k i32) (local $end i32) (local $offset i32) (local $at i32) (local $weight f64) (local $a v128) (local $b v128) (local $w v128)
  (loop $pixels
    (local.set $at (i32.add (local.get $index) (i32.mul (local.get $x) (i32.const 12))))
    (local.set $k (i32.load (local.get $at))) (local.set $end (i32.add (local.get $k) (i32.load offset=4 (local.get $at))))
    (local.set $offset (i32.load offset=8 (local.get $at)))
    (local.set $a (v128.const i32x4 0 0 0 0)) (local.set $b (v128.const i32x4 0 0 0 0))
    (loop $taps
      (local.set $weight (f64.load (i32.add (local.get $weights) (i32.shl (local.get $offset) (i32.const 3)))))
      (if (f64.ne (local.get $weight) (f64.const 0)) (then
        (local.set $at (i32.add (local.get $in) (i32.shl (local.get $k) (i32.const 5)))) (local.set $w (f64x2.splat (local.get $weight)))
        (local.set $a (f64x2.add (local.get $a) (f64x2.mul (v128.load (local.get $at)) (local.get $w))))
        (local.set $b (f64x2.add (local.get $b) (f64x2.mul (v128.load offset=16 (local.get $at)) (local.get $w))))))
      (local.set $offset (i32.add (local.get $offset) (i32.const 1)))
      (local.set $k (i32.add (local.get $k) (i32.const 1))) (br_if $taps (i32.lt_u (local.get $k) (local.get $end))))
    (local.set $at (i32.add (local.get $out) (i32.shl (local.get $x) (i32.const 5))))
    (v128.store (local.get $at) (local.get $a)) (v128.store offset=16 (local.get $at) (local.get $b))
    (local.set $x (i32.add (local.get $x) (i32.const 1))) (br_if $pixels (i32.lt_u (local.get $x) (local.get $target)))))
;; Output rows y0 to y1 from source rows first onward, held at in. scratch holds the linear row, two filtered rows and
;; the sum, each target (or width) times 32 bytes apart at stride. Returns sampleRead's or rsFinish's status.
(func $sampleBand (export "sampleBand") (param $in i32) (param $first i32) (param $last i32) (param $carry i32) (param $width i32) (param $sourceHeight i32)
  (param $target i32) (param $height i32) (param $y0 i32) (param $y1 i32)
  (param $format i32) (param $maximum f64) (param $tf i32) (param $associated i32) (param $gamma f64) (param $lr f64) (param $lg f64) (param $lb f64)
  (param $table i32) (param $levels i32) (param $safe i32) (param $index i32) (param $weights i32) (param $scratch i32) (param $stride i32) (param $out i32) (result i32)
  (local $y i32) (local $row i32) (local $end i32) (local $rowBytes i32) (local $outBytes i32) (local $status i32)
  (local $tag0 i32) (local $tag1 i32) (local $slot i32) (local $i i32) (local $at i32) (local $sum i32) (local $count i32)
  (local $at0 f64) (local $from f64) (local $to f64) (local $fraction f64) (local $weight f64) (local $w v128) (local $up i32)
  (local.set $rowBytes (i32.shl (local.get $width) (select (i32.const 2) (select (i32.const 4) (i32.const 3) (i32.eq (local.get $format) (i32.const 3))) (i32.eqz (local.get $format)))))
  (local.set $outBytes (i32.shl (local.get $target) (select (i32.const 2) (select (i32.const 4) (i32.const 3) (i32.eq (local.get $format) (i32.const 3))) (i32.eqz (local.get $format)))))
  (local.set $sum (i32.add (local.get $scratch) (i32.mul (local.get $stride) (i32.const 3))))
  (local.set $count (i32.shl (local.get $target) (i32.const 2)))
  (local.set $tag0 (i32.const -1)) (local.set $tag1 (i32.const -1))
  (local.set $up (i32.ge_u (local.get $height) (local.get $sourceHeight)))
  (local.set $y (local.get $y0))
  (loop $rows
    ;; carry: row y0's sum holds its source rows before first; a row whose rows run past last is left unfinished.
    (if (i32.eqz (i32.and (local.get $carry) (i32.eq (local.get $y) (local.get $y0))))
      (then (memory.fill (local.get $sum) (i32.const 0) (i32.shl (local.get $count) (i32.const 3)))))
    (if (local.get $up) (then
      (local.set $at0 (f64.max (f64.const 0) (f64.min (f64.convert_i32_u (i32.sub (local.get $sourceHeight) (i32.const 1)))
        (f64.sub (f64.div (f64.mul (f64.add (f64.convert_i32_u (local.get $y)) (f64.const 0.5)) (f64.convert_i32_u (local.get $sourceHeight))) (f64.convert_i32_u (local.get $height))) (f64.const 0.5)))))
      (local.set $row (i32.trunc_f64_u (f64.floor (local.get $at0))))
      (local.set $fraction (f64.sub (local.get $at0) (f64.convert_i32_u (local.get $row))))
      (local.set $end (select (local.get $sourceHeight) (i32.add (local.get $row) (i32.const 2)) (i32.lt_u (local.get $sourceHeight) (i32.add (local.get $row) (i32.const 2))))))
    (else
      (local.set $from (f64.div (f64.mul (f64.convert_i32_u (local.get $y)) (f64.convert_i32_u (local.get $sourceHeight))) (f64.convert_i32_u (local.get $height))))
      (local.set $to (f64.div (f64.mul (f64.convert_i32_u (i32.add (local.get $y) (i32.const 1))) (f64.convert_i32_u (local.get $sourceHeight))) (f64.convert_i32_u (local.get $height))))
      (local.set $row (i32.trunc_f64_u (f64.floor (local.get $from)))) (local.set $end (i32.trunc_f64_u (f64.ceil (local.get $to))))))
    (local.set $i (select (local.get $first) (local.get $row) (i32.lt_u (local.get $row) (local.get $first))))
    (if (i32.lt_u (local.get $i) (select (local.get $last) (local.get $end) (i32.lt_u (local.get $last) (local.get $end)))) (then
    (loop $sources
      (local.set $weight (if (result f64) (local.get $up)
        (then (select (f64.sub (f64.const 1) (local.get $fraction)) (local.get $fraction) (i32.eq (local.get $row) (local.get $i))))
        (else (f64.div (f64.sub (f64.min (local.get $to) (f64.convert_i32_u (i32.add (local.get $i) (i32.const 1))))
          (f64.max (local.get $from) (f64.convert_i32_u (local.get $i)))) (f64.sub (local.get $to) (local.get $from))))))
      (if (f64.ne (local.get $weight) (f64.const 0)) (then
        ;; The two most recent filtered rows are kept, as the row driver keeps them.
        (if (i32.eq (local.get $tag0) (local.get $i)) (then (local.set $slot (i32.const 0)))
          (else (if (i32.eq (local.get $tag1) (local.get $i)) (then (local.set $slot (i32.const 1)))
            (else
              (local.set $slot (i32.lt_s (local.get $tag1) (local.get $tag0)))
              (local.set $status (call $sampleRead (i32.add (local.get $in) (i32.mul (i32.sub (local.get $i) (local.get $first)) (local.get $rowBytes)))
                (local.get $width) (local.get $format) (local.get $maximum) (local.get $tf) (local.get $associated) (local.get $gamma)
                (local.get $lr) (local.get $lg) (local.get $lb) (local.get $scratch) (local.get $table)))
              (if (local.get $status) (then (return (local.get $status))))
              (call $rsPlanned (local.get $scratch) (local.get $target)
                (i32.add (local.get $scratch) (i32.mul (local.get $stride) (i32.add (local.get $slot) (i32.const 1)))) (local.get $index) (local.get $weights))
              (if (local.get $slot) (then (local.set $tag1 (local.get $i))) (else (local.set $tag0 (local.get $i))))))))
        (local.set $at (i32.add (local.get $scratch) (i32.mul (local.get $stride) (i32.add (local.get $slot) (i32.const 1)))))
        (call $sampleAccumulate (local.get $at) (local.get $sum) (local.get $count) (local.get $weight))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $sources (i32.lt_u (local.get $i) (select (local.get $last) (local.get $end) (i32.lt_u (local.get $last) (local.get $end))))))))
    (if (i32.gt_u (local.get $end) (local.get $last)) (then (return (i32.const 0))))
    (local.set $status (call $rsFinish (local.get $sum) (local.get $target) (local.get $format) (local.get $maximum) (local.get $tf)
      (local.get $associated) (local.get $gamma) (local.get $lr) (local.get $lg) (local.get $lb)
      (i32.add (local.get $out) (i32.mul (i32.sub (local.get $y) (local.get $y0)) (local.get $outBytes))) (local.get $levels) (local.get $safe)))
    (if (local.get $status) (then (return (local.get $status))))
    (local.set $y (i32.add (local.get $y) (i32.const 1))) (br_if $rows (i32.lt_u (local.get $y) (local.get $y1))))
  (i32.const 0))

;; sampleSafe: for each slice [b, b + 1) / 32768 of [0, 2), k + 1 where every value in it has k levels at or below it
;; (none lies inside) and lies more than 2^-40 of the slice's top from both neighbouring levels, the test the levels
;; search makes of each value; else 0. levels as sampleLevels writes them (maximum of them); out takes 65,536 u16.
(func $sampleSafe (export "sampleSafe") (param $levels i32) (param $maximum i32) (param $out i32)
  (local $b i32) (local $n i32) (local $m i32) (local $lo f64) (local $hi f64) (local $edge f64) (local $ok i32)
  (loop $slices
    (local.set $lo (f64.mul (f64.convert_i32_u (local.get $b)) (f64.const 0x1p-15)))
    (local.set $hi (f64.mul (f64.convert_i32_u (i32.add (local.get $b) (i32.const 1))) (f64.const 0x1p-15)))
    (local.set $edge (f64.mul (local.get $hi) (f64.const 0x1p-40)))
    (block $counted (loop $count
      (br_if $counted (i32.ge_u (local.get $n) (local.get $maximum)))
      (br_if $counted (f64.gt (f64.load (i32.add (local.get $levels) (i32.shl (local.get $n) (i32.const 3)))) (local.get $lo)))
      (local.set $n (i32.add (local.get $n) (i32.const 1))) (br $count)))
    (local.set $ok (i32.and
      (i32.or (i32.ge_u (local.get $n) (local.get $maximum)) (f64.gt (f64.sub (f64.load (i32.add (local.get $levels) (i32.shl (local.get $n) (i32.const 3)))) (local.get $hi)) (local.get $edge)))
      (i32.or (i32.eqz (local.get $n)) (f64.gt (f64.sub (local.get $lo) (f64.load (i32.add (local.get $levels) (i32.shl (i32.sub (local.get $n) (i32.const 1)) (i32.const 3))))) (local.get $edge)))))
    (i32.store16 (i32.add (local.get $out) (i32.shl (local.get $b) (i32.const 1))) (select (i32.add (local.get $n) (i32.const 1)) (i32.const 0) (local.get $ok)))
    (local.set $b (i32.add (local.get $b) (i32.const 1))) (br_if $slices (i32.lt_u (local.get $b) (i32.const 65536)))))
