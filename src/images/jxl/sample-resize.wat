;; MIT. RGBA resampling in bounded row scratch. Appended to the full SIMD module by the canonical builder.
;; The elementary operations and their order match exact-math.mjs; no imported math or JavaScript pixel callbacks.
(func $rsPow2 (param $k i32) (result f64)
  (f64.reinterpret_i64 (i64.shl (i64.extend_i32_s (i32.add (local.get $k) (i32.const 1023))) (i64.const 52))))
(func $rsLog (param $x f64) (result f64)
  (local $scale i32) (local $e i32) (local $bits i64) (local $m f64) (local $s f64) (local $s2 f64)
  (local $term f64) (local $sum f64) (local $add f64) (local $n i32)
  (if (i32.eqz (f64.gt (local.get $x) (f64.const 0)))
    (then (return (select (f64.const -inf) (f64.const nan) (f64.eq (local.get $x) (f64.const 0))))))
  (if (f64.eq (local.get $x) (f64.const inf)) (then (return (local.get $x))))
  (if (f64.lt (local.get $x) (f64.const 2.2250738585072014e-308))
    (then (local.set $x (f64.mul (local.get $x) (f64.const 18014398509481984))) (local.set $scale (i32.const -54))))
  (local.set $bits (i64.reinterpret_f64 (local.get $x)))
  (local.set $e (i32.add (i32.sub (i32.wrap_i64 (i64.shr_u (local.get $bits) (i64.const 52))) (i32.const 1023)) (local.get $scale)))
  (local.set $m (f64.reinterpret_i64 (i64.or (i64.and (local.get $bits) (i64.const 0x000fffffffffffff)) (i64.const 0x3ff0000000000000))))
  (if (f64.gt (local.get $m) (f64.const 1.4142135623730951)) (then (local.set $m (f64.div (local.get $m) (f64.const 2))) (local.set $e (i32.add (local.get $e) (i32.const 1)))))
  (local.set $s (f64.div (f64.sub (local.get $m) (f64.const 1)) (f64.add (local.get $m) (f64.const 1))))
  (local.set $s2 (f64.mul (local.get $s) (local.get $s))) (local.set $term (local.get $s)) (local.set $sum (local.get $s)) (local.set $n (i32.const 3))
  (block $done (loop $series
    (local.set $term (f64.mul (local.get $term) (local.get $s2)))
    (local.set $add (f64.div (local.get $term) (f64.convert_i32_s (local.get $n))))
    (local.set $sum (f64.add (local.get $sum) (local.get $add)))
    (br_if $done (f64.lt (f64.abs (local.get $add)) (f64.mul (f64.const 1e-18) (f64.abs (local.get $sum)))))
    (local.set $n (i32.add (local.get $n) (i32.const 2))) (br_if $series (i32.lt_s (local.get $n) (i32.const 40)))))
  (f64.add (f64.mul (f64.convert_i32_s (local.get $e)) (f64.const 0.6931471803691238))
    (f64.add (f64.mul (f64.convert_i32_s (local.get $e)) (f64.const 1.9082149292705877e-10)) (f64.mul (f64.const 2) (local.get $sum)))))
(func $rsExp (param $x f64) (result f64)
  (local $q f64) (local $floor f64) (local $k i32) (local $r f64) (local $term f64) (local $sum f64) (local $n i32)
  (if (f64.ne (local.get $x) (local.get $x)) (then (return (f64.const nan))))
  (if (f64.gt (local.get $x) (f64.const 709.782712893384)) (then (return (f64.const inf))))
  (if (f64.lt (local.get $x) (f64.const -745.1332191019411)) (then (return (f64.const 0))))
  (local.set $q (f64.div (local.get $x) (f64.const 0.6931471805599453))) (local.set $floor (f64.floor (local.get $q)))
  (local.set $k (i32.trunc_f64_s (f64.add (local.get $floor) (select (f64.const 1) (f64.const 0) (f64.ge (f64.sub (local.get $q) (local.get $floor)) (f64.const 0.5))))))
  (local.set $r (f64.sub (f64.sub (local.get $x) (f64.mul (f64.convert_i32_s (local.get $k)) (f64.const 0.6931471803691238)))
    (f64.mul (f64.convert_i32_s (local.get $k)) (f64.const 1.9082149292705877e-10))))
  (local.set $term (f64.const 1)) (local.set $sum (f64.const 1)) (local.set $n (i32.const 1))
  (block $done (loop $series
    (local.set $term (f64.mul (local.get $term) (f64.div (local.get $r) (f64.convert_i32_s (local.get $n)))))
    (local.set $sum (f64.add (local.get $sum) (local.get $term)))
    (br_if $done (f64.lt (f64.abs (local.get $term)) (f64.mul (f64.const 1e-17) (local.get $sum))))
    (local.set $n (i32.add (local.get $n) (i32.const 1))) (br_if $series (i32.lt_s (local.get $n) (i32.const 30)))))
  (if (i32.gt_s (local.get $k) (i32.const 1023)) (then (return (f64.mul (f64.mul (local.get $sum) (call $rsPow2 (i32.const 1023))) (call $rsPow2 (i32.sub (local.get $k) (i32.const 1023)))))))
  (if (i32.lt_s (local.get $k) (i32.const -1022)) (then (return (f64.mul (f64.mul (local.get $sum) (call $rsPow2 (i32.const -1022))) (call $rsPow2 (i32.add (local.get $k) (i32.const 1022)))))))
  (f64.mul (local.get $sum) (call $rsPow2 (local.get $k))))
(func $rsPow (param $x f64) (param $y f64) (result f64)
  (local $n i32) (local $base f64) (local $result f64)
  (if (f64.eq (local.get $y) (f64.const 0)) (then (return (f64.const 1))))
  (if (i32.and (f64.eq (f64.trunc (local.get $y)) (local.get $y)) (f64.le (f64.abs (local.get $y)) (f64.const 64)))
    (then (local.set $n (i32.trunc_f64_s (f64.abs (local.get $y)))) (local.set $base (local.get $x)) (local.set $result (f64.const 1))
      (loop $powers
        (if (i32.and (local.get $n) (i32.const 1)) (then (local.set $result (f64.mul (local.get $result) (local.get $base)))))
        (local.set $base (f64.mul (local.get $base) (local.get $base))) (local.set $n (i32.shr_u (local.get $n) (i32.const 1))) (br_if $powers (local.get $n)))
      (return (select (f64.div (f64.const 1) (local.get $result)) (local.get $result) (f64.lt (local.get $y) (f64.const 0))))))
  (if (f64.eq (local.get $x) (f64.const 0)) (then (return (select (f64.const 0) (f64.const inf) (f64.gt (local.get $y) (f64.const 0))))))
  (if (f64.lt (local.get $x) (f64.const 0)) (then (return (f64.const nan))))
  (call $rsExp (f64.mul (local.get $y) (call $rsLog (local.get $x)))))

;; transfer: 0 linear, 1 sRGB, 2 PQ, 3 HLG. Domains are checked by sampleRead.
(func $rsLinear (param $x f64) (param $tf i32) (result f64) (local $p f64)
  (if (i32.eqz (local.get $tf)) (then (return (local.get $x))))
  (if (i32.eq (local.get $tf) (i32.const 1)) (then
    (if (f64.le (f64.abs (local.get $x)) (f64.const 0.04045)) (then (return (f64.div (local.get $x) (f64.const 12.92)))))
    (return (f64.copysign (call $rsPow (f64.div (f64.add (f64.abs (local.get $x)) (f64.const 0.055)) (f64.const 1.055)) (f64.const 2.4)) (local.get $x)))))
  (if (i32.eq (local.get $tf) (i32.const 2)) (then
    (local.set $p (call $rsPow (local.get $x) (f64.const 0.012683313515655966)))
    (return (call $rsPow (f64.div (f64.max (f64.sub (local.get $p) (f64.const 0.8359375)) (f64.const 0))
      (f64.sub (f64.const 18.8515625) (f64.mul (f64.const 18.6875) (local.get $p)))) (f64.const 6.277394636015326)))))
  (if (f64.le (local.get $x) (f64.const 0.5)) (then (return (f64.div (f64.mul (local.get $x) (local.get $x)) (f64.const 3)))) )
  (f64.div (f64.add (call $rsExp (f64.div (f64.sub (local.get $x) (f64.const 0.55991073)) (f64.const 0.17883277))) (f64.const 0.28466892)) (f64.const 12)))
(func $rsEncoded (param $x f64) (param $tf i32) (result f64) (local $p f64)
  (if (i32.eqz (local.get $tf)) (then (return (local.get $x))))
  (if (i32.eq (local.get $tf) (i32.const 1)) (then
    (if (f64.le (f64.abs (local.get $x)) (f64.const 0.0031308)) (then (return (f64.mul (local.get $x) (f64.const 12.92)))))
    (return (f64.copysign (f64.sub (f64.mul (f64.const 1.055) (call $rsPow (f64.abs (local.get $x)) (f64.const 0.4166666666666667))) (f64.const 0.055)) (local.get $x)))))
  (if (i32.eq (local.get $tf) (i32.const 2)) (then
    (local.set $p (call $rsPow (f64.max (f64.const 0) (local.get $x)) (f64.const 0.1593017578125)))
    (return (call $rsPow (f64.div (f64.add (f64.const 0.8359375) (f64.mul (f64.const 18.8515625) (local.get $p)))
      (f64.add (f64.const 1) (f64.mul (f64.const 18.6875) (local.get $p)))) (f64.const 78.84375)))))
  (if (f64.le (local.get $x) (f64.const 0.08333333333333333)) (then (return (f64.sqrt (f64.max (f64.const 0) (f64.mul (f64.const 3) (local.get $x)))))))
  (f64.add (f64.mul (f64.const 0.17883277) (call $rsLog (f64.sub (f64.mul (f64.const 12) (local.get $x)) (f64.const 0.28466892)))) (f64.const 0.55991073)))

;; levels: also sampleFinish's output levels there (sampleLevels), or 0.
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
      (else (f64.mul (f64.convert_i32_u (i32.add (i32.const 1024) (local.get $m))) (call $rsPow2 (i32.sub (local.get $e) (i32.const 25)))))))))
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
(func $sampleRead (export "sampleRead") (param $in i32) (param $width i32) (param $format i32) (param $maximum f64)
  (param $tf i32) (param $associated i32) (param $gamma f64) (param $lr f64) (param $lg f64) (param $lb f64) (param $out i32) (param $table i32) (result i32)
  (local $x i32) (local $c i32) (local $at i32) (local $dest i32) (local $alpha f64) (local $value f64) (local $y f64) (local $gain f64)
  ;; With a table (8- or 16-bit, unassociated) every sample is a whole number over the maximum: alpha is in [0, 1] and
  ;; colors are finite, so the checks below always pass; colors come from the table, the rest as below.
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
        (local.set $gain (select (call $rsPow (local.get $y) (f64.sub (local.get $gamma) (f64.const 1))) (f64.const 0) (f64.gt (local.get $y) (f64.const 0))))))
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
      (local.set $gain (select (call $rsPow (local.get $y) (f64.sub (local.get $gamma) (f64.const 1))) (f64.const 0) (f64.gt (local.get $y) (f64.const 0))))))
    (local.set $c (i32.const 0))
    (loop $associate
      (local.set $at (i32.add (local.get $dest) (i32.shl (local.get $c) (i32.const 3))))
      (f64.store (local.get $at) (f64.mul (f64.mul (f64.load (local.get $at)) (local.get $gain)) (local.get $alpha)))
      (local.set $c (i32.add (local.get $c) (i32.const 1))) (br_if $associate (i32.lt_u (local.get $c) (i32.const 3))))
    (f64.store offset=24 (local.get $dest) (local.get $alpha))
    (local.set $x (i32.add (local.get $x) (i32.const 1))) (br_if $pixels (i32.lt_u (local.get $x) (local.get $width))))
  (i32.const 0))

(func $sampleHorizontal (export "sampleHorizontal") (param $in i32) (param $width i32) (param $target i32) (param $out i32)
  (local $x i32) (local $k i32) (local $hi i32) (local $at i32) (local $start f64) (local $end f64) (local $fraction f64) (local $weight f64)
  (local $a v128) (local $b v128) (local $w v128) (local $wide i32)
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
    (local.set $a (v128.const i32x4 0 0 0 0)) (local.set $b (v128.const i32x4 0 0 0 0))
    (loop $weights
      (if (i32.eqz (local.get $wide)) (then
        (local.set $weight (f64.div (f64.sub (f64.min (local.get $end) (f64.convert_i32_u (i32.add (local.get $k) (i32.const 1))))
          (f64.max (local.get $start) (f64.convert_i32_u (local.get $k)))) (f64.sub (local.get $end) (local.get $start))))))
      (if (f64.ne (local.get $weight) (f64.const 0)) (then
        (local.set $at (i32.add (local.get $in) (i32.shl (local.get $k) (i32.const 5)))) (local.set $w (f64x2.splat (local.get $weight)))
        (local.set $a (f64x2.add (local.get $a) (f64x2.mul (v128.load (local.get $at)) (local.get $w))))
        (local.set $b (f64x2.add (local.get $b) (f64x2.mul (v128.load offset=16 (local.get $at)) (local.get $w))))))
      (local.set $weight (local.get $fraction)) (local.set $k (i32.add (local.get $k) (i32.const 1))) (br_if $weights (i32.lt_u (local.get $k) (local.get $hi))))
    (local.set $at (i32.add (local.get $out) (i32.shl (local.get $x) (i32.const 5))))
    (v128.store (local.get $at) (local.get $a)) (v128.store offset=16 (local.get $at) (local.get $b))
    (local.set $x (i32.add (local.get $x) (i32.const 1))) (br_if $pixels (i32.lt_u (local.get $x) (local.get $target)))))
(func $sampleAccumulate (export "sampleAccumulate") (param $row i32) (param $sum i32) (param $count i32) (param $weight f64)
  (local $i i32) (local $at i32) (local $w v128)
  (local.set $w (f64x2.splat (local.get $weight)))
  (loop $samples
    (local.set $at (i32.add (local.get $sum) (local.get $i)))
    (v128.store (local.get $at) (f64x2.add (v128.load (local.get $at)) (f64x2.mul (v128.load (i32.add (local.get $row) (local.get $i))) (local.get $w))))
    (local.set $i (i32.add (local.get $i) (i32.const 16))) (br_if $samples (i32.lt_u (local.get $i) (i32.shl (local.get $count) (i32.const 3))))))

;; The integer level sampleFinish writes for one color value with no gain and unassociated output.
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

(func $sampleFinish (export "sampleFinish") (param $sum i32) (param $width i32) (param $format i32) (param $maximum f64)
  (param $tf i32) (param $associated i32) (param $gamma f64) (param $lr f64) (param $lg f64) (param $lb f64) (param $out i32) (param $levels i32) (result i32)
  (local $x i32) (local $c i32) (local $at i32) (local $dest i32) (local $alpha f64) (local $value f64) (local $y f64) (local $gain f64) (local $alphaZero i32) (local $v f64) (local $level i32) (local $edge f64)
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
      (local.set $gain (select (call $rsPow (local.get $y) (f64.sub (f64.div (f64.const 1) (local.get $gamma)) (f64.const 1))) (f64.const 0) (f64.gt (local.get $y) (f64.const 0))))))
    (local.set $c (i32.const 0))
    (loop $colors
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
