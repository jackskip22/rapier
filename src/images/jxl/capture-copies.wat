;; SPDX-License-Identifier: MIT
;; The capture's copy search (capture-codec.mjs's pieces): copies at W, at N, at the 16 recent copies' distances and
;; along a hash chain of three values, `depth` links deep or until one reaches 256 values (the last two only with a
;; chain). A copy competes at 6 bits a value less its distance's bits; with a chain, a copy is put off by one position
;; when the next starts a better one, and a copy longer than 64 enters only its first 8 positions and its end.
;; build-jxl-kernels.mjs joins these functions to kernels-scalar.wat's weighted predictor as the capture module.
;; Memory, all byte offsets: `values` 2n bytes of 16-bit values and 8 more readable; `scratch` holds 832 bytes (16
;; recent distances, then the match ends by distance: 64 distances, 64 starts, 64 ends); `heads` 262144 bytes (with a
;; chain); `chain` 4n bytes (with a chain); `contexts` may be `outCtx` (pieces never run ahead of the positions they are
;; read from), or 0 for none.
  ;; A band of the column scan, in reverse row order, rows `stride` pixels apart: a column still open (its 4-byte flag at
  ;; `open` is -1) closes at its first pixel unlike `background`, which sets its row in `lowest`. Four pixels a comparison,
  ;; masked by the open flags. Returns how many columns stay open.
  (func (export "lowestInk")
    (param $pixels i32) (param $width i32) (param $stride i32) (param $rows i32) (param $y0 i32) (param $background i32)
    (param $open i32) (param $count i32) (param $lowest i32) (result i32)
    (local $row i32) (local $x i32) (local $at i32) (local $bg v128) (local $ink v128) (local $lane i32) (local $flag i32)
    (local.set $bg (i32x4.splat (local.get $background)))
    (block $done
      (loop $rows
        (br_if $done (i32.eqz (local.get $rows)))
        (br_if $done (i32.eqz (local.get $count)))
        (local.set $rows (i32.sub (local.get $rows) (i32.const 1)))
        (local.set $at (i32.add (local.get $pixels) (i32.shl (i32.mul (local.get $rows) (local.get $stride)) (i32.const 2))))
        (local.set $x (i32.const 0))
        (block $quads
          (loop $quad
            (br_if $quads (i32.gt_s (i32.add (local.get $x) (i32.const 4)) (local.get $width)))
            (local.set $ink
              (v128.and
                (i32x4.ne (v128.load (i32.add (local.get $at) (i32.shl (local.get $x) (i32.const 2)))) (local.get $bg))
                (v128.load (i32.add (local.get $open) (i32.shl (local.get $x) (i32.const 2))))))
            (if (v128.any_true (local.get $ink))
              (then
                (local.set $lane (i32.const 0))
                (loop $lanes
                  (local.set $flag (i32.add (local.get $open) (i32.shl (i32.add (local.get $x) (local.get $lane)) (i32.const 2))))
                  (if (i32.and (i32.load (local.get $flag))
                        (i32.ne (i32.load (i32.add (local.get $at) (i32.shl (i32.add (local.get $x) (local.get $lane)) (i32.const 2)))) (local.get $background)))
                    (then
                      (i32.store (local.get $flag) (i32.const 0))
                      (i32.store (i32.add (local.get $lowest) (i32.shl (i32.add (local.get $x) (local.get $lane)) (i32.const 2)))
                        (i32.add (local.get $y0) (local.get $rows)))
                      (local.set $count (i32.sub (local.get $count) (i32.const 1)))))
                  (local.set $lane (i32.add (local.get $lane) (i32.const 1)))
                  (br_if $lanes (i32.lt_u (local.get $lane) (i32.const 4))))))
            (local.set $x (i32.add (local.get $x) (i32.const 4)))
            (br $quad)))
        (block $ones
          (loop $one
            (br_if $ones (i32.ge_s (local.get $x) (local.get $width)))
            (local.set $flag (i32.add (local.get $open) (i32.shl (local.get $x) (i32.const 2))))
            (if (i32.and (i32.load (local.get $flag))
                  (i32.ne (i32.load (i32.add (local.get $at) (i32.shl (local.get $x) (i32.const 2)))) (local.get $background)))
              (then
                (i32.store (local.get $flag) (i32.const 0))
                (i32.store (i32.add (local.get $lowest) (i32.shl (local.get $x) (i32.const 2))) (i32.add (local.get $y0) (local.get $rows)))
                (local.set $count (i32.sub (local.get $count) (i32.const 1)))))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br $one)))
        (br $rows)))
    (local.get $count))

  ;; screen-crop.mjs's runs over a picture's 4-byte pixels: the first position from `i` before `end` unlike `colour`
  ;; (`end` when none), four pixels a comparison.
  (func $runFrom (param $words i32) (param $i i32) (param $end i32) (param $colour i32) (result i32)
    (local $c v128)
    (local.set $c (i32x4.splat (local.get $colour)))
    (block $done
      (loop $quad
        (br_if $done (i32.gt_s (i32.add (local.get $i) (i32.const 4)) (local.get $end)))
        (br_if $done (i32.eqz (i32x4.all_true (i32x4.eq
          (v128.load (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2)))) (local.get $c)))))
        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $quad)))
    (block $found
      (loop $one
        (br_if $found (i32.ge_s (local.get $i) (local.get $end)))
        (br_if $found (i32.ne (i32.load (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2)))) (local.get $colour)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $one)))
    (local.get $i))
  ;; The last position from `i` down to `stop` unlike `colour` (`stop` - 1 when none).
  (func $runBack (param $words i32) (param $i i32) (param $stop i32) (param $colour i32) (result i32)
    (local $c v128)
    (local.set $c (i32x4.splat (local.get $colour)))
    (block $done
      (loop $quad
        (br_if $done (i32.lt_s (i32.sub (local.get $i) (i32.const 3)) (local.get $stop)))
        (br_if $done (i32.eqz (i32x4.all_true (i32x4.eq
          (v128.load (i32.add (local.get $words) (i32.shl (i32.sub (local.get $i) (i32.const 3)) (i32.const 2)))) (local.get $c)))))
        (local.set $i (i32.sub (local.get $i) (i32.const 4)))
        (br $quad)))
    (block $found
      (loop $one
        (br_if $found (i32.lt_s (local.get $i) (local.get $stop)))
        (br_if $found (i32.ne (i32.load (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2)))) (local.get $colour)))
        (local.set $i (i32.sub (local.get $i) (i32.const 1)))
        (br $one)))
    (local.get $i))
  ;; screenCrop's edges: the first and last pixels unlike the first, the leftmost column and one past the rightmost of
  ;; the rows between them, as four 4-byte words at `out` (the first is width * height when every pixel is alike).
  ;; Positions count the picture's pixels; its rows are `stride` pixels apart in memory.
  (func (export "edges") (param $words i32) (param $width i32) (param $height i32) (param $stride i32) (param $out i32)
    (local $colour i32) (local $first i32) (local $last i32) (local $row i32) (local $bottom i32)
    (local $x i32) (local $right i32) (local $start i32) (local $edge i32)
    (local.set $colour (i32.load (local.get $words)))
    (local.set $first (i32.const -1))
    (block $found
      (loop $rows
        (br_if $found (i32.ge_s (local.get $row) (local.get $height)))
        (local.set $start (i32.mul (local.get $row) (local.get $stride)))
        (local.set $edge (call $runFrom (local.get $words) (local.get $start) (i32.add (local.get $start) (local.get $width)) (local.get $colour)))
        (if (i32.lt_s (local.get $edge) (i32.add (local.get $start) (local.get $width)))
          (then
            (local.set $first (i32.add (i32.mul (local.get $row) (local.get $width)) (i32.sub (local.get $edge) (local.get $start))))
            (br $found)))
        (local.set $row (i32.add (local.get $row) (i32.const 1)))
        (br $rows)))
    (if (i32.lt_s (local.get $first) (i32.const 0))
      (then (i32.store (local.get $out) (i32.mul (local.get $width) (local.get $height))) (return)))
    (i32.store (local.get $out) (local.get $first))
    (local.set $row (local.get $height))
    (loop $back
      (local.set $row (i32.sub (local.get $row) (i32.const 1)))
      (local.set $start (i32.mul (local.get $row) (local.get $stride)))
      (local.set $edge (call $runBack (local.get $words) (i32.sub (i32.add (local.get $start) (local.get $width)) (i32.const 1)) (local.get $start) (local.get $colour)))
      (br_if $back (i32.lt_s (local.get $edge) (local.get $start))))
    (local.set $last (i32.add (i32.mul (local.get $row) (local.get $width)) (i32.sub (local.get $edge) (local.get $start))))
    (local.set $row (i32.div_u (local.get $first) (local.get $width)))
    (local.set $bottom (i32.add (i32.div_u (local.get $last) (local.get $width)) (i32.const 1)))
    (local.set $x (i32.rem_u (local.get $first) (local.get $width)))
    (local.set $right (i32.add (i32.rem_u (local.get $last) (local.get $width)) (i32.const 1)))
    (block $done
      (loop $rows
        (br_if $done (i32.ge_s (local.get $row) (local.get $bottom)))
        (br_if $done (i32.and (i32.eqz (local.get $x)) (i32.ge_s (local.get $right) (local.get $width))))
        (local.set $start (i32.mul (local.get $row) (local.get $stride)))
        (local.set $edge (i32.sub (call $runFrom (local.get $words) (local.get $start) (i32.add (local.get $start) (local.get $x)) (local.get $colour)) (local.get $start)))
        (if (i32.lt_s (local.get $edge) (local.get $x)) (then (local.set $x (local.get $edge))))
        (local.set $edge (i32.add (i32.sub (call $runBack (local.get $words) (i32.sub (i32.add (local.get $start) (local.get $width)) (i32.const 1))
          (i32.add (local.get $start) (local.get $right)) (local.get $colour)) (local.get $start)) (i32.const 1)))
        (if (i32.gt_s (local.get $edge) (local.get $right)) (then (local.set $right (local.get $edge))))
        (local.set $row (i32.add (local.get $row) (i32.const 1)))
        (br $rows)))
    (i32.store offset=4 (local.get $out) (local.get $last))
    (i32.store offset=8 (local.get $out) (local.get $x))
    (i32.store offset=12 (local.get $out) (local.get $right)))

  ;; screenRegions' rows: a 4-byte flag per row of the `width` x `height` picture (rows `stride` pixels apart), 1 where a
  ;; pixel after the first differs from it.
  (func (export "rowInk") (param $words i32) (param $width i32) (param $height i32) (param $stride i32) (param $out i32)
    (local $row i32) (local $start i32)
    (block $done
      (loop $rows
        (br_if $done (i32.ge_s (local.get $row) (local.get $height)))
        (local.set $start (i32.mul (local.get $row) (local.get $stride)))
        (i32.store (i32.add (local.get $out) (i32.shl (local.get $row) (i32.const 2)))
          (i32.lt_s
            (call $runFrom (local.get $words) (i32.add (local.get $start) (i32.const 1)) (i32.add (local.get $start) (local.get $width))
              (i32.load (i32.add (local.get $words) (i32.shl (local.get $start) (i32.const 2)))))
            (i32.add (local.get $start) (local.get $width))))
        (local.set $row (i32.add (local.get $row) (i32.const 1)))
        (br $rows))))
  ;; screenRegions' columns: a 4-byte flag per column (nonzero where a pixel of rows y0 to y1 differs from `key`), the
  ;; rows read in order, four pixels a comparison.
  (func (export "colInk")
    (param $words i32) (param $width i32) (param $y0 i32) (param $y1 i32) (param $stride i32) (param $key i32) (param $out i32)
    (local $row i32) (local $x i32) (local $at i32) (local $k v128)
    (memory.fill (local.get $out) (i32.const 0) (i32.shl (local.get $width) (i32.const 2)))
    (local.set $k (i32x4.splat (local.get $key)))
    (local.set $row (local.get $y0))
    (block $done
      (loop $rows
        (br_if $done (i32.ge_s (local.get $row) (local.get $y1)))
        (local.set $at (i32.add (local.get $words) (i32.shl (i32.mul (local.get $row) (local.get $stride)) (i32.const 2))))
        (local.set $x (i32.const 0))
        (block $quads
          (loop $quad
            (br_if $quads (i32.gt_s (i32.add (local.get $x) (i32.const 4)) (local.get $width)))
            (v128.store (i32.add (local.get $out) (i32.shl (local.get $x) (i32.const 2)))
              (v128.or (v128.load (i32.add (local.get $out) (i32.shl (local.get $x) (i32.const 2))))
                (i32x4.ne (v128.load (i32.add (local.get $at) (i32.shl (local.get $x) (i32.const 2)))) (local.get $k))))
            (local.set $x (i32.add (local.get $x) (i32.const 4)))
            (br $quad)))
        (block $ones
          (loop $one
            (br_if $ones (i32.ge_s (local.get $x) (local.get $width)))
            (if (i32.ne (i32.load (i32.add (local.get $at) (i32.shl (local.get $x) (i32.const 2)))) (local.get $key))
              (then (i32.store (i32.add (local.get $out) (i32.shl (local.get $x) (i32.const 2))) (i32.const 1))))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br $one)))
        (local.set $row (i32.add (local.get $row) (i32.const 1)))
        (br $rows))))

  ;; Integer log2 in 32nds, using capture-kernels.mjs's shared mantissa table.
  (func $captureLog (param $x i32) (param $table i32) (result i32)
    (local $e i32) (local $mantissa i32)
    (local.set $e (i32.sub (i32.const 31) (i32.clz (local.get $x))))
    (local.set $mantissa
      (if (result i32) (i32.ge_s (local.get $e) (i32.const 5))
        (then (i32.shr_u (local.get $x) (i32.sub (local.get $e) (i32.const 5))))
        (else (i32.shl (local.get $x) (i32.sub (i32.const 5) (local.get $e))))))
    (i32.add (i32.shl (local.get $e) (i32.const 5))
      (i32.load8_u (i32.add (local.get $table) (i32.and (local.get $mantissa) (i32.const 31))))))

  ;; Hybrid-token estimates for every configuration of one histogram. Frequencies occupy 32768 words; the
  ;; following 1024-word bitset enumerates used tokens in order, including the gaps in a distance code's header.
  (func (export "prices")
    (param $values i32) (param $counts i32) (param $n i32) (param $configs i32) (param $num i32)
    (param $distance i32) (param $freqs i32) (param $used i32) (param $log i32) (param $output i32)
    (local $split i32) (local $msb i32) (local $lsb i32) (local $splitToken i32) (local $shift i32) (local $low i32)
    (local $i i32) (local $value i32) (local $count i32) (local $e i32) (local $below i32) (local $token i32)
    (local $addr i32) (local $top i32) (local $total i32) (local $whole i32) (local $kinds i32)
    (local $word i32) (local $mask i32) (local $previous i32) (local $gap i32) (local $header i32)
    (local $raw f64) (local $bits f64) (local $largest i32) (local $bound i32) (local $at i32)
    ;; Tokens rise with values under every configuration: the largest value's largest token bounds what is counted
    ;; (or the alphabet), so only that much of the counts and the bitset is cleared.
    (block $scanned
      (loop $scan
        (br_if $scanned (i32.ge_u (local.get $i) (local.get $n)))
        (local.set $value (i32.load (i32.add (local.get $values) (i32.shl (local.get $i) (i32.const 2)))))
        (if (i32.gt_u (local.get $value) (local.get $largest)) (then (local.set $largest (local.get $value))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $scan)))
    (local.set $at (local.get $configs))
    (local.set $i (local.get $num))
    (loop $bounds
      (local.set $split (i32.load (local.get $at)))
      (local.set $msb (i32.load offset=4 (local.get $at)))
      (local.set $lsb (i32.load offset=8 (local.get $at)))
      (local.set $splitToken (i32.load offset=12 (local.get $at)))
      (local.set $token (local.get $largest))
      (if (i32.ge_u (local.get $largest) (local.get $splitToken))
        (then
          (local.set $e (i32.sub (i32.const 31) (i32.clz (local.get $largest))))
          (local.set $below (i32.sub (local.get $largest) (i32.shl (i32.const 1) (local.get $e))))
          (local.set $token (i32.add (local.get $splitToken)
            (i32.or (i32.shl (i32.sub (local.get $e) (local.get $split)) (i32.add (local.get $msb) (local.get $lsb)))
              (i32.or (i32.shl (i32.shr_u (local.get $below) (i32.sub (local.get $e) (local.get $msb))) (local.get $lsb))
                (i32.and (local.get $below) (i32.sub (i32.shl (i32.const 1) (local.get $lsb)) (i32.const 1)))))))))
      (if (i32.gt_u (local.get $token) (local.get $bound)) (then (local.set $bound (local.get $token))))
      (local.set $at (i32.add (local.get $at) (i32.const 16)))
      (local.set $i (i32.sub (local.get $i) (i32.const 1)))
      (br_if $bounds (local.get $i)))
    (if (i32.gt_u (local.get $bound) (i32.const 32767)) (then (local.set $bound (i32.const 32767))))
    (memory.fill (local.get $freqs) (i32.const 0) (i32.shl (i32.add (local.get $bound) (i32.const 1)) (i32.const 2)))
    (loop $configurations
      (local.set $split (i32.load (local.get $configs)))
      (local.set $msb (i32.load offset=4 (local.get $configs)))
      (local.set $lsb (i32.load offset=8 (local.get $configs)))
      (local.set $splitToken (i32.load offset=12 (local.get $configs)))
      (local.set $shift (i32.add (local.get $msb) (local.get $lsb)))
      (local.set $low (i32.sub (i32.shl (i32.const 1) (local.get $lsb)) (i32.const 1)))
      (memory.fill (local.get $used) (i32.const 0) (i32.shl (i32.add (i32.shr_u (local.get $bound) (i32.const 5)) (i32.const 1)) (i32.const 2)))
      (local.set $i (i32.const 0)) (local.set $top (i32.const 0)) (local.set $total (i32.const 0))
      (local.set $kinds (i32.const 0)) (local.set $raw (f64.const 0)) (local.set $bits (f64.const inf))
      (block $invalid
        (block $counted
          (loop $values
            (br_if $counted (i32.ge_u (local.get $i) (local.get $n)))
            (local.set $value (i32.load (i32.add (local.get $values) (i32.shl (local.get $i) (i32.const 2)))))
            (local.set $count (i32.load (i32.add (local.get $counts) (i32.shl (local.get $i) (i32.const 2)))))
            (local.set $token (local.get $value))
            (if (i32.ge_u (local.get $value) (local.get $splitToken))
              (then
                (local.set $e (i32.sub (i32.const 31) (i32.clz (local.get $value))))
                (local.set $below (i32.sub (local.get $value) (i32.shl (i32.const 1) (local.get $e))))
                (local.set $token (i32.add (local.get $splitToken)
                  (i32.or (i32.shl (i32.sub (local.get $e) (local.get $split)) (local.get $shift))
                    (i32.or (i32.shl (i32.shr_u (local.get $below) (i32.sub (local.get $e) (local.get $msb))) (local.get $lsb))
                      (i32.and (local.get $below) (local.get $low))))))
                (local.set $raw (f64.add (local.get $raw)
                  (f64.mul (f64.convert_i32_s (i32.sub (local.get $e) (local.get $shift))) (f64.convert_i32_u (local.get $count)))))))
            (br_if $invalid (i32.ge_u (local.get $token) (i32.const 32768)))
            (local.set $addr (i32.add (local.get $freqs) (i32.shl (local.get $token) (i32.const 2))))
            (if (i32.eqz (i32.load (local.get $addr)))
              (then
                (local.set $kinds (i32.add (local.get $kinds) (i32.const 1)))
                (local.set $word (i32.add (local.get $used) (i32.shl (i32.shr_u (local.get $token) (i32.const 5)) (i32.const 2))))
                (i32.store (local.get $word) (i32.or (i32.load (local.get $word)) (i32.shl (i32.const 1) (local.get $token))))))
            (i32.store (local.get $addr) (i32.add (i32.load (local.get $addr)) (local.get $count)))
            (local.set $total (i32.add (local.get $total) (local.get $count)))
            (if (i32.gt_u (local.get $token) (local.get $top)) (then (local.set $top (local.get $token))))
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $values)))
        (local.set $whole (call $captureLog (local.get $total) (local.get $log)))
        (local.set $word (i32.const 0)) (local.set $previous (i32.const -1))
        (local.set $header (i32.const 0)) (local.set $bits (f64.const 0))
        (loop $words
          (local.set $mask (i32.load (i32.add (local.get $used) (i32.shl (local.get $word) (i32.const 2)))))
          (block $empty
            (loop $tokens
              (br_if $empty (i32.eqz (local.get $mask)))
              (local.set $token (i32.add (i32.shl (local.get $word) (i32.const 5)) (i32.ctz (local.get $mask))))
              (local.set $addr (i32.add (local.get $freqs) (i32.shl (local.get $token) (i32.const 2))))
              (local.set $count (i32.load (local.get $addr)))
              (i32.store (local.get $addr) (i32.const 0))
              (local.set $bits (f64.add (local.get $bits) (f64.mul (f64.convert_i32_u (local.get $count))
                (f64.convert_i32_s (i32.sub (local.get $whole) (call $captureLog (local.get $count) (local.get $log)))))))
              (local.set $gap (i32.sub (i32.sub (local.get $token) (local.get $previous)) (i32.const 1)))
              (local.set $header (i32.add (local.get $header) (i32.add (i32.const 4)
                (if (result i32) (i32.lt_u (local.get $gap) (i32.const 3))
                  (then (i32.mul (local.get $gap) (i32.const 3))) (else (i32.const 6))))))
              (local.set $previous (local.get $token))
              (local.set $mask (i32.and (local.get $mask) (i32.sub (local.get $mask) (i32.const 1))))
              (br $tokens)))
          (local.set $word (i32.add (local.get $word) (i32.const 1)))
          (br_if $words (i32.le_u (i32.shl (local.get $word) (i32.const 5)) (local.get $top))))
        (local.set $bits (f64.add (f64.mul (local.get $bits) (f64.const 0.03125)) (local.get $raw)))
        (if (local.get $distance)
          (then (local.set $bits (f64.add (local.get $bits) (f64.convert_i32_u (local.get $header)))))
          (else (if (local.get $total)
            (then (local.set $bits (f64.add (local.get $bits)
              (f64.convert_i32_u (i32.add (i32.shl (local.get $kinds) (i32.const 2)) (local.get $top))))))))))
      (if (f64.eq (local.get $bits) (f64.const inf))
        (then (memory.fill (local.get $freqs) (i32.const 0) (i32.shl (i32.add (local.get $bound) (i32.const 1)) (i32.const 2)))))
      (f64.store (local.get $output) (local.get $bits))
      (f64.store offset=8 (local.get $output) (f64.convert_i32_u (local.get $top)))
      (local.set $configs (i32.add (local.get $configs) (i32.const 16)))
      (local.set $output (i32.add (local.get $output) (i32.const 16)))
      (local.set $num (i32.sub (local.get $num) (i32.const 1)))
      (br_if $configurations (local.get $num))))

  (global $inserted (mut i32) (i32.const 0))
  (global $bestDist (mut i32) (i32.const 0))
  (global $bestCost (mut i32) (i32.const 0))

  (func $copyHash (param $vAddr i32) (result i32)
    (i32.shr_u
      (i32.xor
        (i32.xor
          (i32.mul (i32.add (i32.load16_u (local.get $vAddr)) (i32.const 1)) (i32.const 0x1e35a7bd))
          (i32.mul (i32.add (i32.load16_u offset=2 (local.get $vAddr)) (i32.const 1)) (i32.const 0x6c8e9cf5)))
        (i32.mul (i32.add (i32.load16_u offset=4 (local.get $vAddr)) (i32.const 1)) (i32.const 0x2c1b3c6d)))
      (i32.const 16)))

  ;; How far a copy at distance `d` from position `at` matches, at least 3 (the caller has compared the first three),
  ;; eight 16-bit values at a time.
  ;; The match end is kept by distance in `scratch` (64 distances, 64 starts, 64 ends): a later position of the same run
  ;; at the same distance takes it without comparing again.
  (func $copyExtent
    (param $prevAddr i32) (param $atAddr i32) (param $d i32) (param $at i32) (param $n i32) (param $scratch i32)
    (result i32)
    (local $slotAddr i32) (local $k i32) (local $limit i32)
    (local.set $slotAddr (i32.add (local.get $scratch) (i32.shl (i32.and (local.get $d) (i32.const 63)) (i32.const 2))))
    (if
      (i32.and
        (i32.and
          (i32.eq (i32.load offset=64 (local.get $slotAddr)) (local.get $d))
          (i32.le_s (i32.load offset=320 (local.get $slotAddr)) (local.get $at)))
        (i32.gt_s (i32.sub (i32.load offset=576 (local.get $slotAddr)) (local.get $at)) (i32.const 3)))
      (then (return (i32.sub (i32.load offset=576 (local.get $slotAddr)) (local.get $at)))))
    (local.set $k (i32.const 3))
    (local.set $limit (i32.sub (local.get $n) (local.get $at)))
    (block $done8
      (loop $match8
        (br_if $done8 (i32.gt_s (i32.add (local.get $k) (i32.const 8)) (local.get $limit)))
        (br_if $done8
          (i32.eqz
            (i16x8.all_true
              (i16x8.eq
                (v128.load (i32.add (local.get $prevAddr) (i32.shl (local.get $k) (i32.const 1))))
                (v128.load (i32.add (local.get $atAddr) (i32.shl (local.get $k) (i32.const 1))))))))
        (local.set $k (i32.add (local.get $k) (i32.const 8)))
        (br $match8)))
    (block $done
      (loop $match
        (br_if $done (i32.ge_s (local.get $k) (local.get $limit)))
        (br_if $done
          (i32.ne
            (i32.load16_u (i32.add (local.get $prevAddr) (i32.shl (local.get $k) (i32.const 1))))
            (i32.load16_u (i32.add (local.get $atAddr) (i32.shl (local.get $k) (i32.const 1))))))
        (local.set $k (i32.add (local.get $k) (i32.const 1)))
        (br $match)))
    (i32.store offset=64 (local.get $slotAddr) (local.get $d))
    (i32.store offset=320 (local.get $slotAddr) (local.get $at))
    (i32.store offset=576 (local.get $slotAddr) (i32.add (local.get $at) (local.get $k)))
    (local.get $k))

  ;; The best copy at `at`: its length when at least `minimum` (else 0), its distance and cost in $bestDist and $bestCost.
  ;; Each probe's copy must start with the same three values; a probe that cannot beat the best so far stops at the first
  ;; differing value it checks. A copy beats the best when its length times 6 less its cost is larger.
  (func $copyFind
    (param $values i32) (param $n i32) (param $width i32) (param $depth i32) (param $minimum i32)
    (param $spatial i32) (param $spatialLen i32) (param $heads i32) (param $chain i32) (param $scratch i32) (param $at i32)
    (param $nice i32)
    (result i32)
    (local $i i32) (local $h i32) (local $v i32) (local $r i32) (local $p i32) (local $links i32)
    (local $bestLen i32) (local $bestDist i32) (local $bestCost i32)
    (local $atAddr i32) (local $prevAddr i32) (local $prev i32) (local $d i32) (local $cost i32) (local $k i32)
    (local $head i64) (local $mask i32) (local $ok i32)
    (local $pair i32) (local $atPair i32)
    (local $rq v128) (local $okq v128) (local $addrq v128) (local $vq v128)
    (local.set $bestCost (i32.const -10))
    (block $found
      (br_if $found (i32.gt_s (i32.add (local.get $at) (local.get $minimum)) (local.get $n)))
      (if (local.get $depth)
        (then
          (local.set $i (global.get $inserted))
          (block $insDone
            (loop $ins
              (br_if $insDone (i32.ge_s (local.get $i) (local.get $at)))
              (local.set $h (call $copyHash (i32.add (local.get $values) (i32.shl (local.get $i) (i32.const 1)))))
              (i32.store
                (i32.add (local.get $chain) (i32.shl (local.get $i) (i32.const 2)))
                (i32.load (i32.add (local.get $heads) (i32.shl (local.get $h) (i32.const 2)))))
              (i32.store (i32.add (local.get $heads) (i32.shl (local.get $h) (i32.const 2))) (local.get $i))
              (local.set $i (i32.add (local.get $i) (i32.const 1)))
              (br $ins)))
          (if (i32.lt_s (global.get $inserted) (local.get $at)) (then (global.set $inserted (local.get $at))))
          (br_if $found (i32.eq (local.get $minimum) (i32.const 8)))))
      (local.set $atAddr (i32.add (local.get $values) (i32.shl (local.get $at) (i32.const 1))))
      (local.set $head (i64.and (i64.load (local.get $atAddr)) (i64.const 0xffffffffffff)))
      (if (local.get $at)
        (then
          (local.set $prev (i32.sub (local.get $at) (i32.const 1)))
        ;; Probe W: a copy from the left neighbour. Its tests are computed together, with one branch.
        (block $probeW
          (local.set $prevAddr (i32.add (local.get $values) (i32.shl (local.get $prev) (i32.const 1))))
          (local.set $d (i32.sub (local.get $at) (local.get $prev)))
          (local.set $cost
            (select (i32.load8_u (i32.add (local.get $spatial) (local.get $d))) (i32.const 0)
              (i32.lt_s (local.get $d) (local.get $spatialLen))))
          (local.set $k (i32.sub (i32.sub (i32.const 31) (i32.clz (local.get $d))) (i32.const 0)))
          (local.set $cost
            (select (local.get $cost) (select (local.get $k) (i32.const 2) (i32.gt_s (local.get $k) (i32.const 2))) (local.get $cost)))
          ;; The same three values; with a copy so far, the same value at its last position, and at the one after it
          ;; unless this copy costs less (each read stays inside the arena).
          (br_if $probeW
            (i32.eqz
              (i32.and
                (i64.eq (i64.and (i64.load (local.get $prevAddr)) (i64.const 0xffffffffffff)) (local.get $head))
                (i32.or (i32.eqz (local.get $bestLen))
                  (i32.and
                    (i32.eq
                      (i32.load16_u (i32.add (local.get $prevAddr) (i32.shl (i32.sub (local.get $bestLen) (i32.const 1)) (i32.const 1))))
                      (i32.load16_u (i32.add (local.get $atAddr) (i32.shl (i32.sub (local.get $bestLen) (i32.const 1)) (i32.const 1)))))
                    (i32.or (i32.lt_s (local.get $cost) (local.get $bestCost))
                      (i32.and
                        (i32.lt_s (i32.add (local.get $at) (local.get $bestLen)) (local.get $n))
                        (i32.eq
                          (i32.load16_u (i32.add (local.get $prevAddr) (i32.shl (local.get $bestLen) (i32.const 1))))
                          (i32.load16_u (i32.add (local.get $atAddr) (i32.shl (local.get $bestLen) (i32.const 1))))))))))))
          (local.set $k (call $copyExtent (local.get $prevAddr) (local.get $atAddr) (local.get $d) (local.get $at) (local.get $n) (local.get $scratch)))
          (if
            (i32.gt_s
              (i32.sub (i32.mul (local.get $k) (i32.const 6)) (local.get $cost))
              (i32.sub (i32.mul (local.get $bestLen) (i32.const 6)) (local.get $bestCost)))
            (then
              (local.set $bestLen (local.get $k))
              (local.set $bestDist (local.get $d))
              (local.set $bestCost (local.get $cost)))))
          ))
      (if
        (i32.and
          (i32.ge_s (local.get $at) (local.get $width))
          (i32.lt_s (i32.add (local.get $at) (local.get $bestLen)) (local.get $n)))
        (then
          (local.set $prev (i32.sub (local.get $at) (local.get $width)))
        ;; Probe N: a copy from the row above. Its tests are computed together, with one branch.
        (block $probeN
          (local.set $prevAddr (i32.add (local.get $values) (i32.shl (local.get $prev) (i32.const 1))))
          (if (local.get $bestLen)
            (then
              (local.set $pair (i32.xor (i32.load (i32.add (local.get $atAddr) (i32.shl (i32.sub (local.get $bestLen) (i32.const 1)) (i32.const 1))))
                (i32.load (i32.add (local.get $prevAddr) (i32.shl (i32.sub (local.get $bestLen) (i32.const 1)) (i32.const 1))))))
              (br_if $probeN (i32.and (local.get $pair) (i32.const 0xffff)))))
          (local.set $d (i32.sub (local.get $at) (local.get $prev)))
          (local.set $cost
            (select (i32.load8_u (i32.add (local.get $spatial) (local.get $d))) (i32.const 0)
              (i32.lt_s (local.get $d) (local.get $spatialLen))))
          (local.set $k (i32.sub (i32.sub (i32.const 31) (i32.clz (local.get $d))) (i32.const 0)))
          (local.set $cost
            (select (local.get $cost) (select (local.get $k) (i32.const 2) (i32.gt_s (local.get $k) (i32.const 2))) (local.get $cost)))
          ;; The same three values; with a copy so far (its last value tested above), the value after it unless this
          ;; copy costs less.
          (br_if $probeN
            (i32.eqz
              (i32.and
                (i64.eq (i64.and (i64.load (local.get $prevAddr)) (i64.const 0xffffffffffff)) (local.get $head))
                (i32.or (i32.eqz (local.get $bestLen))
                  (i32.or (i32.lt_s (local.get $cost) (local.get $bestCost))
                    (i32.eqz (i32.shr_u (local.get $pair) (i32.const 16))))))))
          (local.set $k (call $copyExtent (local.get $prevAddr) (local.get $atAddr) (local.get $d) (local.get $at) (local.get $n) (local.get $scratch)))
          (if
            (i32.gt_s
              (i32.sub (i32.mul (local.get $k) (i32.const 6)) (local.get $cost))
              (i32.sub (i32.mul (local.get $bestLen) (i32.const 6)) (local.get $bestCost)))
            (then
              (local.set $bestLen (local.get $k))
              (local.set $bestDist (local.get $d))
              (local.set $bestCost (local.get $cost)))))
          ))
      ;; A copy at W or N of `nice` values or more stands without the recent and chain probes (effort 1).
      (br_if $found (i32.ge_s (local.get $bestLen) (local.get $nice)))
      (br_if $found (i32.eqz (local.get $depth)))
      ;; The recent distances (other than W and N) whose value equals this one, as a mask, without a branch each: four
      ;; distances a step, each one's value read at its own address (this position's own where the distance does not apply).
      (local.set $v (i32.load16_u (local.get $atAddr)))
      (local.set $i (i32.const 0))
      (local.set $mask (i32.const 0))
      (loop $gather
        (local.set $rq (v128.load (i32.add (local.get $scratch) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $okq
          (v128.and
            (v128.and (i32x4.gt_s (local.get $rq) (i32x4.splat (i32.const 1))) (i32x4.ne (local.get $rq) (i32x4.splat (local.get $width))))
            (i32x4.le_s (local.get $rq) (i32x4.splat (local.get $at)))))
        (local.set $addrq
          (v128.bitselect
            (i32x4.sub (i32x4.splat (local.get $atAddr)) (i32x4.shl (local.get $rq) (i32.const 1)))
            (i32x4.splat (local.get $atAddr)) (local.get $okq)))
        (local.set $vq (i32x4.splat (i32.load16_u (i32x4.extract_lane 0 (local.get $addrq)))))
        (local.set $vq (i32x4.replace_lane 1 (local.get $vq) (i32.load16_u (i32x4.extract_lane 1 (local.get $addrq)))))
        (local.set $vq (i32x4.replace_lane 2 (local.get $vq) (i32.load16_u (i32x4.extract_lane 2 (local.get $addrq)))))
        (local.set $vq (i32x4.replace_lane 3 (local.get $vq) (i32.load16_u (i32x4.extract_lane 3 (local.get $addrq)))))
        (local.set $mask
          (i32.or (local.get $mask)
            (i32.shl
              (i32x4.bitmask (v128.and (local.get $okq) (i32x4.eq (local.get $vq) (i32x4.splat (local.get $v)))))
              (local.get $i))))
        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br_if $gather (i32.lt_u (local.get $i) (i32.const 16))))
      ;; Probed in order, until a copy reaches 1024.
      (block $recDone
        (loop $rec
          (br_if $recDone (i32.or (i32.eqz (local.get $mask)) (i32.ge_s (local.get $bestLen) (i32.const 1024))))
          (local.set $prev (i32.sub (local.get $at)
            (i32.load (i32.add (local.get $scratch) (i32.shl (i32.ctz (local.get $mask)) (i32.const 2))))))
          (local.set $mask (i32.and (local.get $mask) (i32.sub (local.get $mask) (i32.const 1))))
          ;; Probe a recent distance: a copy from a recent copy's distance, cheaper by 5 bits. Its tests are computed together, with one branch.
          (block $probeR
            (local.set $prevAddr (i32.add (local.get $values) (i32.shl (local.get $prev) (i32.const 1))))
            (if (local.get $bestLen)
              (then
                (local.set $pair (i32.xor (i32.load (i32.add (local.get $atAddr) (i32.shl (i32.sub (local.get $bestLen) (i32.const 1)) (i32.const 1))))
                  (i32.load (i32.add (local.get $prevAddr) (i32.shl (i32.sub (local.get $bestLen) (i32.const 1)) (i32.const 1))))))
                (br_if $probeR (i32.and (local.get $pair) (i32.const 0xffff)))))
            (local.set $d (i32.sub (local.get $at) (local.get $prev)))
            (local.set $cost
              (select (i32.load8_u (i32.add (local.get $spatial) (local.get $d))) (i32.const 0)
                (i32.lt_s (local.get $d) (local.get $spatialLen))))
            (local.set $k (i32.sub (i32.sub (i32.const 31) (i32.clz (local.get $d))) (i32.const 5)))
            (local.set $cost
              (select (local.get $cost) (select (local.get $k) (i32.const 2) (i32.gt_s (local.get $k) (i32.const 2))) (local.get $cost)))
            ;; The same three values; with a copy so far (its last value tested above), the value after it unless this
            ;; copy costs less (inside the plane).
            (br_if $probeR
              (i32.eqz
                (i32.and
                  (i64.eq (i64.and (i64.load (local.get $prevAddr)) (i64.const 0xffffffffffff)) (local.get $head))
                  (i32.or (i32.eqz (local.get $bestLen))
                    (i32.or (i32.lt_s (local.get $cost) (local.get $bestCost))
                      (i32.and (i32.lt_s (i32.add (local.get $at) (local.get $bestLen)) (local.get $n)) (i32.eqz (i32.shr_u (local.get $pair) (i32.const 16)))))))))
            (local.set $k (call $copyExtent (local.get $prevAddr) (local.get $atAddr) (local.get $d) (local.get $at) (local.get $n) (local.get $scratch)))
            (if
              (i32.gt_s
                (i32.sub (i32.mul (local.get $k) (i32.const 6)) (local.get $cost))
                (i32.sub (i32.mul (local.get $bestLen) (i32.const 6)) (local.get $bestCost)))
              (then
                (local.set $bestLen (local.get $k))
                (local.set $bestDist (local.get $d))
                (local.set $bestCost (local.get $cost)))))
          (br $rec)))
      (local.set $h (call $copyHash (local.get $atAddr)))
      (local.set $p (i32.load (i32.add (local.get $heads) (i32.shl (local.get $h) (i32.const 2)))))
      (local.set $links (i32.const 0))
      (if (local.get $bestLen)
        (then (local.set $atPair (i32.load (i32.add (local.get $atAddr) (i32.shl (i32.sub (local.get $bestLen) (i32.const 1)) (i32.const 1)))))))
      (block $chDone
        (loop $ch
          (br_if $chDone
            (i32.or
              (i32.or (i32.lt_s (local.get $p) (i32.const 0)) (i32.ge_s (local.get $links) (local.get $depth)))
              (i32.or (i32.ge_s (i32.add (local.get $at) (local.get $bestLen)) (local.get $n)) (i32.ge_s (local.get $bestLen) (i32.const 1024)))))
              ;; Probe the chain: a copy from an earlier position of the same three values. A copy so far is tested first
              ;; on its last value and the one after it (one 32-bit compare, against $atPair); a probe that passes then
              ;; computes its cost and compares the first three values. Inside this loop at + bestLen < n.
              (block $probeC
                (local.set $prevAddr (i32.add (local.get $values) (i32.shl (local.get $p) (i32.const 1))))
                (if (local.get $bestLen)
                  (then
                    (local.set $pair (i32.xor (local.get $atPair)
                      (i32.load (i32.add (local.get $prevAddr) (i32.shl (i32.sub (local.get $bestLen) (i32.const 1)) (i32.const 1))))))
                    (br_if $probeC (i32.and (local.get $pair) (i32.const 0xffff)))))
                (local.set $d (i32.sub (local.get $at) (local.get $p)))
                (local.set $cost
                  (select (i32.load8_u (i32.add (local.get $spatial) (local.get $d))) (i32.const 0)
                    (i32.lt_s (local.get $d) (local.get $spatialLen))))
                (local.set $k (i32.sub (i32.sub (i32.const 31) (i32.clz (local.get $d))) (i32.const 0)))
                (local.set $cost
                  (select (local.get $cost) (select (local.get $k) (i32.const 2) (i32.gt_s (local.get $k) (i32.const 2))) (local.get $cost)))
                (br_if $probeC
                  (i32.eqz
                    (i32.and
                      (i64.eq (i64.and (i64.load (local.get $prevAddr)) (i64.const 0xffffffffffff)) (local.get $head))
                      (i32.or (i32.eqz (local.get $bestLen))
                        (i32.or (i32.lt_s (local.get $cost) (local.get $bestCost))
                          (i32.eqz (i32.shr_u (local.get $pair) (i32.const 16))))))))
                (local.set $k (call $copyExtent (local.get $prevAddr) (local.get $atAddr) (local.get $d) (local.get $at) (local.get $n) (local.get $scratch)))
                (if
                  (i32.gt_s
                    (i32.sub (i32.mul (local.get $k) (i32.const 6)) (local.get $cost))
                    (i32.sub (i32.mul (local.get $bestLen) (i32.const 6)) (local.get $bestCost)))
                  (then
                    (local.set $bestLen (local.get $k))
                    (local.set $bestDist (local.get $d))
                    (local.set $bestCost (local.get $cost))
                    (local.set $atPair (i32.load (i32.add (local.get $atAddr) (i32.shl (i32.sub (local.get $bestLen) (i32.const 1)) (i32.const 1))))))))
          (local.set $p (i32.load (i32.add (local.get $chain) (i32.shl (local.get $p) (i32.const 2)))))
          (local.set $links (i32.add (local.get $links) (i32.const 1)))
          (br $ch))))
    (global.set $bestDist (local.get $bestDist))
    (global.set $bestCost (local.get $bestCost))
    (select (local.get $bestLen) (i32.const 0) (i32.ge_s (local.get $bestLen) (local.get $minimum))))

  (func (export "copies")
    (param $values i32) (param $contexts i32) (param $n i32) (param $width i32) (param $depth i32)
    (param $minimum i32) (param $scale i32) (param $spatial i32) (param $spatialLen i32)
    (param $heads i32) (param $chain i32) (param $scratch i32)
    (param $outVal i32) (param $outDist i32) (param $outCtx i32) (param $lazyUnder i32) (param $nice i32)
    (result i32)
    (local $position i32) (local $copy i32) (local $from i32) (local $fromCost i32) (local $next i32) (local $count i32) (local $i i32)
    (global.set $inserted (i32.const 0))
    (if (local.get $depth) (then (memory.fill (local.get $heads) (i32.const 255) (i32.const 262144))))
    (memory.fill (local.get $scratch) (i32.const 0) (i32.const 832))
    (local.set $copy
      (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (local.get $minimum)
        (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch) (i32.const 0) (local.get $nice)))
    (local.set $from (global.get $bestDist))
    (local.set $fromCost (global.get $bestCost))
    (block $done
      (loop $loop
        (br_if $done (i32.ge_s (local.get $position) (local.get $n)))
        (if (local.get $copy)
          (then
            ;; The lazy probe: a copy under `lazyUnder` may give way to one starting a value later.
            (local.set $next
              (if (result i32) (i32.and (i32.ne (local.get $depth) (i32.const 0)) (i32.lt_s (local.get $copy) (local.get $lazyUnder)))
                (then
                  (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (local.get $minimum)
                    (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch)
                    (i32.add (local.get $position) (i32.const 1)) (local.get $nice)))
                (else (i32.const 0))))
            (if
              (i32.and
                (i32.ne (local.get $next) (i32.const 0))
                (i32.gt_s
                  (i32.sub (i32.mul (local.get $next) (i32.const 6)) (global.get $bestCost))
                  (i32.add (i32.sub (i32.mul (local.get $copy) (i32.const 6)) (local.get $fromCost)) (i32.const 3))))
              (then
                (if (local.get $contexts)
                  (then (i32.store8 (i32.add (local.get $outCtx) (local.get $count)) (i32.load8_u (i32.add (local.get $contexts) (local.get $position))))))
                (i32.store (i32.add (local.get $outVal) (i32.shl (local.get $count) (i32.const 2)))
                  (i32.mul (i32.load16_u (i32.add (local.get $values) (i32.shl (local.get $position) (i32.const 1)))) (local.get $scale)))
                (i32.store (i32.add (local.get $outDist) (i32.shl (local.get $count) (i32.const 2))) (i32.const 0))
                (local.set $count (i32.add (local.get $count) (i32.const 1)))
                (local.set $position (i32.add (local.get $position) (i32.const 1)))
                (local.set $copy (local.get $next))
                (local.set $from (global.get $bestDist))
                (local.set $fromCost (global.get $bestCost))
                (br $loop)))
            (if (local.get $contexts)
              (then (i32.store8 (i32.add (local.get $outCtx) (local.get $count)) (i32.load8_u (i32.add (local.get $contexts) (local.get $position))))))
            (i32.store (i32.add (local.get $outVal) (i32.shl (local.get $count) (i32.const 2))) (i32.sub (local.get $copy) (local.get $minimum)))
            (i32.store (i32.add (local.get $outDist) (i32.shl (local.get $count) (i32.const 2))) (local.get $from))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))
            (if (local.get $depth)
              (then
                (local.set $i (i32.const 0))
                (block $remFound
                  (loop $remFind
                    (br_if $remFound (i32.or (i32.ge_s (local.get $i) (i32.const 15))
                      (i32.eq (i32.load (i32.add (local.get $scratch) (i32.shl (local.get $i) (i32.const 2)))) (local.get $from))))
                    (local.set $i (i32.add (local.get $i) (i32.const 1)))
                    (br $remFind)))
                (block $remDone
                  (loop $remShift
                    (br_if $remDone (i32.le_s (local.get $i) (i32.const 0)))
                    (i32.store
                      (i32.add (local.get $scratch) (i32.shl (local.get $i) (i32.const 2)))
                      (i32.load (i32.add (local.get $scratch) (i32.shl (i32.sub (local.get $i) (i32.const 1)) (i32.const 2)))))
                    (local.set $i (i32.sub (local.get $i) (i32.const 1)))
                    (br $remShift)))
                (i32.store (local.get $scratch) (local.get $from))))
            (if (i32.gt_s (local.get $copy) (i32.const 64))
              (then
                (drop (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (i32.const 8)
                  (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch)
                  (i32.add (local.get $position) (i32.const 8)) (local.get $nice)))
                (global.set $inserted (i32.sub (i32.add (local.get $position) (local.get $copy)) (i32.const 3)))))
            (local.set $position (i32.add (local.get $position) (local.get $copy))))
          (else
            (if (local.get $contexts)
              (then (i32.store8 (i32.add (local.get $outCtx) (local.get $count)) (i32.load8_u (i32.add (local.get $contexts) (local.get $position))))))
            (i32.store (i32.add (local.get $outVal) (i32.shl (local.get $count) (i32.const 2)))
              (i32.mul (i32.load16_u (i32.add (local.get $values) (i32.shl (local.get $position) (i32.const 1)))) (local.get $scale)))
            (i32.store (i32.add (local.get $outDist) (i32.shl (local.get $count) (i32.const 2))) (i32.const 0))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))
            (local.set $position (i32.add (local.get $position) (i32.const 1)))))
        (local.set $copy
          (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (local.get $minimum)
            (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch) (local.get $position) (local.get $nice)))
        (local.set $from (global.get $bestDist))
        (local.set $fromCost (global.get $bestCost))
        (br $loop)))
    (local.get $count))


  ;; The weighted channel's pieces (capture-codec.mjs's channelModel), in place over $weighted's outputs: each residual
  ;; at `values` with its context from the largest neighbouring error at `errors` (property 15, through the 511-byte band
  ;; table at `bands`), except that 16 or more equal residuals after a literal of the same value are one copy at distance
  ;; 1, written as length less `minimum`. `errors` becomes the distance flags, `contexts` gets a byte per piece. Returns
  ;; the piece count: the pieces never run ahead of the positions they are read from.
  (func $runs (export "runs")
    (param $values i32) (param $errors i32) (param $n i32) (param $minimum i32) (param $bands i32) (param $contexts i32)
    (result i32)
    (local $i i32) (local $count i32) (local $v i32) (local $e i32) (local $k i32) (local $end i32) (local $last i32)
    (block $done
      (loop $next
        (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
        (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $e (i32.load (i32.add (local.get $errors) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $last (i32.shl (i32.sub (local.get $count) (i32.const 1)) (i32.const 2)))
        (if
          (if (result i32) (i32.eqz (local.get $i))
            (then (i32.const 1))
            (else
              (i32.or
                (i32.ne (local.get $v) (i32.load (i32.add (local.get $values) (local.get $last))))
                (i32.ne (i32.load (i32.add (local.get $errors) (local.get $last))) (i32.const 0)))))
          (then
            (call $piece (local.get $values) (local.get $errors) (local.get $contexts) (local.get $bands)
              (local.get $count) (local.get $v) (i32.const 0) (local.get $e))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $next)))
        (local.set $k (i32.const 1))
        (block $stop
          (loop $run
            (br_if $stop (i32.ge_u (i32.add (local.get $i) (local.get $k)) (local.get $n)))
            (br_if $stop (i32.ne (local.get $v)
              (i32.load (i32.add (local.get $values) (i32.shl (i32.add (local.get $i) (local.get $k)) (i32.const 2))))))
            (local.set $k (i32.add (local.get $k) (i32.const 1)))
            (br $run)))
        (if (i32.ge_u (local.get $k) (i32.const 16))
          (then
            (call $piece (local.get $values) (local.get $errors) (local.get $contexts) (local.get $bands)
              (local.get $count) (i32.sub (local.get $k) (local.get $minimum)) (i32.const 1) (local.get $e))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))
            (local.set $i (i32.add (local.get $i) (local.get $k))))
          (else
            (local.set $end (i32.add (local.get $i) (local.get $k)))
            (loop $literal
              (call $piece (local.get $values) (local.get $errors) (local.get $contexts) (local.get $bands)
                (local.get $count) (local.get $v) (i32.const 0)
                (i32.load (i32.add (local.get $errors) (i32.shl (local.get $i) (i32.const 2)))))
              (local.set $count (i32.add (local.get $count) (i32.const 1)))
              (local.set $i (i32.add (local.get $i) (i32.const 1)))
              (br_if $literal (i32.lt_u (local.get $i) (local.get $end))))))
        (br $next)))
    (local.get $count))

  (func $piece
    (param $values i32) (param $errors i32) (param $contexts i32) (param $bands i32)
    (param $at i32) (param $value i32) (param $distance i32) (param $e i32)
    (i32.store8 (i32.add (local.get $contexts) (local.get $at))
      (i32.load8_u (i32.add (local.get $bands)
        (select (i32.const 0)
          (select (i32.const 510) (i32.add (local.get $e) (i32.const 255)) (i32.gt_s (local.get $e) (i32.const 255)))
          (i32.lt_s (local.get $e) (i32.const -255))))))
    (i32.store (i32.add (local.get $values) (i32.shl (local.get $at) (i32.const 2))) (local.get $value))
    (i32.store (i32.add (local.get $errors) (i32.shl (local.get $at) (i32.const 2))) (local.get $distance)))

  ;; capture-codec.mjs's scanColours over rows of `stride` words from `words` (the rectangle starts at word `x0`):
  ;; packed RGBA to dense indices in first-seen order. `keys` (4 bytes) and `slots` (2 bytes) are a zeroed open-address
  ;; table of mask+1 entries; `colours` 4 bytes a colour, `indices` 2 bytes a pixel, `first` and `last` 4 bytes a colour
  ;; (with `rows`). Continues at colour count `n` and relative row `y`; answers the count, or -1 past `limit`.
  (func (export "scan")
    (param $words i32) (param $stride i32) (param $x0 i32) (param $w i32) (param $h i32) (param $limit i32) (param $rows i32)
    (param $keys i32) (param $slots i32) (param $mask i32) (param $shift i32) (param $colours i32) (param $indices i32)
    (param $first i32) (param $last i32) (param $n i32) (param $y i32) (result i32)
    (local $previous i32) (local $have i32) (local $lastIndex i32) (local $i i32) (local $x i32)
    (local $p i32) (local $size i32) (local $key i32) (local $slot i32) (local $s i32)
    (local $run v128) (local $fill i64)
    (local.set $size (i32.mul (local.get $w) (local.get $h)))
    (local.set $p (local.get $x0))
    (block $done
      (loop $pixel
        (br_if $done (i32.ge_u (local.get $i) (local.get $size)))
        (block $next
          (if (i32.eq (local.get $x) (local.get $w))
            (then
              (local.set $x (i32.const 0))
              (local.set $y (i32.add (local.get $y) (i32.const 1)))
              (local.set $p (i32.add (local.get $p) (i32.sub (local.get $stride) (local.get $w))))
              (if (local.get $rows) (then (local.set $have (i32.const 0))))))
          (local.set $key (i32.load (i32.add (local.get $words) (i32.shl (local.get $p) (i32.const 2)))))
          (if (i32.and (local.get $have) (i32.eq (local.get $key) (local.get $previous)))
            (then
              (i32.store16 (i32.add (local.get $indices) (i32.shl (local.get $i) (i32.const 1))) (local.get $lastIndex))
              ;; A flat span: the next pixels of the row that equal it take its index four at a time.
              (local.set $run (i32x4.splat (local.get $key)))
              (local.set $fill (i64.mul (i64.extend_i32_u (local.get $lastIndex)) (i64.const 0x0001000100010001)))
              (block $flat
                (loop $span
                  (br_if $flat (i32.gt_u (i32.add (local.get $x) (i32.const 5)) (local.get $w)))
                  (br_if $flat (i32.eqz (i32x4.all_true (i32x4.eq
                    (v128.load offset=4 (i32.add (local.get $words) (i32.shl (local.get $p) (i32.const 2)))) (local.get $run)))))
                  (i64.store offset=2 (i32.add (local.get $indices) (i32.shl (local.get $i) (i32.const 1))) (local.get $fill))
                  (local.set $i (i32.add (local.get $i) (i32.const 4)))
                  (local.set $x (i32.add (local.get $x) (i32.const 4)))
                  (local.set $p (i32.add (local.get $p) (i32.const 4)))
                  (br $span)))
              (br $next)))
          (if (i32.ge_u (local.get $i) (local.get $w))
            (then
              (if (i32.eq (local.get $key)
                    (i32.load (i32.add (local.get $words) (i32.shl (i32.sub (local.get $p) (local.get $stride)) (i32.const 2)))))
                (then
                  (local.set $lastIndex (i32.load16_u (i32.add (local.get $indices) (i32.shl (i32.sub (local.get $i) (local.get $w)) (i32.const 1)))))
                  (i32.store16 (i32.add (local.get $indices) (i32.shl (local.get $i) (i32.const 1))) (local.get $lastIndex))
                  (local.set $previous (local.get $key))
                  (local.set $have (i32.const 1))
                  (if (local.get $rows)
                    (then (i32.store (i32.add (local.get $last) (i32.shl (local.get $lastIndex) (i32.const 2))) (local.get $y))))
                  (br $next)))))
          (local.set $slot (i32.shr_u (i32.mul (local.get $key) (i32.const 0x9e3779b1)) (local.get $shift)))
          (block $found
            (loop $probe
              (local.set $s (i32.load16_u (i32.add (local.get $slots) (i32.shl (local.get $slot) (i32.const 1)))))
              (br_if $found (i32.eqz (local.get $s)))
              (br_if $found (i32.eq (i32.load (i32.add (local.get $keys) (i32.shl (local.get $slot) (i32.const 2)))) (local.get $key)))
              (local.set $slot (i32.and (i32.add (local.get $slot) (i32.const 1)) (local.get $mask)))
              (br $probe)))
          (if (i32.eqz (local.get $s))
            (then
              (if (i32.eq (local.get $n) (local.get $limit)) (then (return (i32.const -1))))
              (i32.store (i32.add (local.get $keys) (i32.shl (local.get $slot) (i32.const 2))) (local.get $key))
              (i32.store (i32.add (local.get $colours) (i32.shl (local.get $n) (i32.const 2))) (local.get $key))
              (local.set $n (i32.add (local.get $n) (i32.const 1)))
              (local.set $s (local.get $n))
              (i32.store16 (i32.add (local.get $slots) (i32.shl (local.get $slot) (i32.const 1))) (local.get $s))
              (if (local.get $rows)
                (then (i32.store (i32.add (local.get $first) (i32.shl (i32.sub (local.get $n) (i32.const 1)) (i32.const 2))) (local.get $y))))))
          (local.set $lastIndex (i32.sub (local.get $s) (i32.const 1)))
          (i32.store16 (i32.add (local.get $indices) (i32.shl (local.get $i) (i32.const 1))) (local.get $lastIndex))
          (local.set $previous (local.get $key))
          (local.set $have (i32.const 1))
          (if (local.get $rows)
            (then (i32.store (i32.add (local.get $last) (i32.shl (local.get $lastIndex) (i32.const 2))) (local.get $y)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (local.set $p (i32.add (local.get $p) (i32.const 1)))
        (br $pixel)))
    (local.get $n))

  ;; capture-codec.mjs's context tree: one node's token tally of pieces order[from, to) into `all` (128 4-byte counts)
  ;; and, with `bins`, every property's bins into `counts` (four spans of `span` 4-byte counts, y, x, W and N bins
  ;; times 128 plus the token). `order` holds 4-byte piece numbers; `tokens` and the bins one byte a piece.
  (func (export "tally")
    (param $order i32) (param $from i32) (param $to i32) (param $tokens i32) (param $by i32) (param $bx i32)
    (param $bw i32) (param $bn i32) (param $all i32) (param $counts i32) (param $span i32) (param $bins i32)
    (local $i i32) (local $k i32) (local $t i32) (local $a i32) (local $s4 i32)
    (memory.fill (local.get $all) (i32.const 0) (i32.const 512))
    (local.set $s4 (i32.shl (local.get $span) (i32.const 2)))
    (if (local.get $bins)
      (then (memory.fill (local.get $counts) (i32.const 0) (i32.shl (local.get $s4) (i32.const 2)))))
    (local.set $i (local.get $from))
    (block $done (loop $each
      (br_if $done (i32.ge_s (local.get $i) (local.get $to)))
      (local.set $k (i32.load (i32.add (local.get $order) (i32.shl (local.get $i) (i32.const 2)))))
      (local.set $t (i32.load8_u (i32.add (local.get $tokens) (local.get $k))))
      (local.set $a (i32.add (local.get $all) (i32.shl (local.get $t) (i32.const 2))))
      (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
      (if (local.get $bins)
        (then
          (local.set $a (i32.add (local.get $counts)
            (i32.shl (i32.add (i32.shl (i32.load8_u (i32.add (local.get $by) (local.get $k))) (i32.const 7)) (local.get $t)) (i32.const 2))))
          (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
          (local.set $a (i32.add (i32.add (local.get $counts) (local.get $s4))
            (i32.shl (i32.add (i32.shl (i32.load8_u (i32.add (local.get $bx) (local.get $k))) (i32.const 7)) (local.get $t)) (i32.const 2))))
          (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
          (local.set $a (i32.add (i32.add (local.get $counts) (i32.shl (local.get $s4) (i32.const 1)))
            (i32.shl (i32.add (i32.shl (i32.load8_u (i32.add (local.get $bw) (local.get $k))) (i32.const 7)) (local.get $t)) (i32.const 2))))
          (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
          (local.set $a (i32.add (i32.add (local.get $counts) (i32.mul (local.get $s4) (i32.const 3)))
            (i32.shl (i32.add (i32.shl (i32.load8_u (i32.add (local.get $bn) (local.get $k))) (i32.const 7)) (local.get $t)) (i32.const 2))))
          (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $each))))

  ;; The node's split: pieces of order[from, to) whose bin (one byte a piece) is over `cut` first, then the rest, each
  ;; side in order (through `scratch`). Answers where the second side starts.
  (func (export "part")
    (param $order i32) (param $from i32) (param $to i32) (param $bin i32) (param $cut i32) (param $scratch i32) (result i32)
    (local $i i32) (local $k i32) (local $a i32) (local $b i32)
    (local.set $i (local.get $from))
    (local.set $a (local.get $from))
    (block $done (loop $each
      (br_if $done (i32.ge_s (local.get $i) (local.get $to)))
      (local.set $k (i32.load (i32.add (local.get $order) (i32.shl (local.get $i) (i32.const 2)))))
      (if (i32.gt_s (i32.load8_u (i32.add (local.get $bin) (local.get $k))) (local.get $cut))
        (then
          (i32.store (i32.add (local.get $order) (i32.shl (local.get $a) (i32.const 2))) (local.get $k))
          (local.set $a (i32.add (local.get $a) (i32.const 1))))
        (else
          (i32.store (i32.add (local.get $scratch) (i32.shl (local.get $b) (i32.const 2))) (local.get $k))
          (local.set $b (i32.add (local.get $b) (i32.const 1)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $each)))
    (memory.copy (i32.add (local.get $order) (i32.shl (local.get $a) (i32.const 2))) (local.get $scratch) (i32.shl (local.get $b) (i32.const 2)))
    (local.get $a))

  ;; capture-codec.mjs's paletteModel over one channel's pieces (4-byte `values` and `distances`, `count` of them): each
  ;; literal's colour (its value halved) counted into `table` (4 bytes a colour), or with `relabel` taken through
  ;; `table` and doubled.
  (func (export "literals")
    (param $values i32) (param $distances i32) (param $count i32) (param $table i32) (param $relabel i32)
    (local $k i32) (local $v i32) (local $a i32)
    (block $done (loop $each
      (br_if $done (i32.ge_s (local.get $k) (local.get $count)))
      (if (i32.eqz (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2)))))
        (then
          (local.set $v (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2))))
          (local.set $a (i32.add (local.get $table) (i32.shl (i32.shr_s (i32.load (local.get $v)) (i32.const 1)) (i32.const 2))))
          (if (local.get $relabel)
            (then (i32.store (local.get $v) (i32.shl (i32.load (local.get $a)) (i32.const 1))))
            (else (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (br $each))))

  ;; capture-codec.mjs's writeChannels over one channel's pieces (4-byte `values` and `distances`, 1-byte `contexts`):
  ;; each literal under `small` counted into `table` (`small` 4-byte counts a context) and into `literals` (4 bytes a
  ;; context); every other piece's number written to `others` in stream order. Answers how many others.
  (func (export "pieces")
    (param $values i32) (param $distances i32) (param $contexts i32) (param $count i32) (param $small i32)
    (param $table i32) (param $literals i32) (param $others i32) (result i32)
    (local $k i32) (local $v i32) (local $c i32) (local $a i32) (local $n i32)
    (block $done (loop $each
      (br_if $done (i32.ge_s (local.get $k) (local.get $count)))
      (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2)))))
      (if (i32.and
            (i32.eqz (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2)))))
            (i32.lt_u (local.get $v) (local.get $small)))
        (then
          (local.set $c (i32.load8_u (i32.add (local.get $contexts) (local.get $k))))
          (local.set $a (i32.add (local.get $table) (i32.shl (i32.add (i32.mul (local.get $c) (local.get $small)) (local.get $v)) (i32.const 2))))
          (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
          (local.set $a (i32.add (local.get $literals) (i32.shl (local.get $c) (i32.const 2))))
          (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1))))
        (else
          (i32.store (i32.add (local.get $others) (i32.shl (local.get $n) (i32.const 2))) (local.get $k))
          (local.set $n (i32.add (local.get $n) (i32.const 1)))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (br $each)))
    (local.get $n))

  ;; Clamped gradient predictor and 16-context smooth classifier (capture-codec.mjs predictSmooth, step = 1)
  ;; over rows [y0, y1) of 16-bit signed `plane` (narrow rows use splatted scalar lanes), writing 16-bit unsigned packSigned residuals to `values`
  ;; and 8-bit contexts to `contexts`.
  (func (export "smooth")
    (param $plane i32) (param $width i32) (param $y0 i32) (param $y1 i32) (param $values i32) (param $contexts i32)
    (local $y i32) (local $x i32) (local $row i32) (local $p i32) (local $pN i32) (local $w0 i32) (local $d i32)
    (local $v v128) (local $w v128) (local $n v128) (local $nw v128) (local $res v128) (local $absWNW v128) (local $absNWN v128)
    (local $narrow i32)
    (local $c0 v128) (local $c2 v128) (local $c12 v128) (local $four v128)
    (local.set $narrow (i32.lt_u (local.get $width) (i32.const 9)))
    (local.set $c0 (i16x8.splat (i32.const 0)))
    (local.set $c2 (i16x8.splat (i32.const 2)))
    (local.set $c12 (i16x8.splat (i32.const 12)))
    (local.set $four (i16x8.splat (i32.const 4)))
    (local.set $y (local.get $y0))
    (block $doneY (loop $eachY
      (br_if $doneY (i32.ge_s (local.get $y) (local.get $y1)))
      (local.set $row (i32.mul (local.get $y) (local.get $width)))
      (local.set $p (i32.add (local.get $plane) (i32.shl (local.get $row) (i32.const 1))))
      (local.set $w0 (if (result i32) (local.get $y) (then (i32.load16_s (i32.sub (local.get $p) (i32.shl (local.get $width) (i32.const 1))))) (else (i32.const 0))))
      (local.set $d (i32.sub (i32.load16_s (local.get $p)) (local.get $w0)))
      (i32.store16 (i32.add (local.get $values) (i32.shl (local.get $row) (i32.const 1))) (i32.xor (i32.shl (local.get $d) (i32.const 1)) (i32.shr_s (local.get $d) (i32.const 31))))
      (i32.store8 (i32.add (local.get $contexts) (local.get $row)) (i32.const 0))
      (local.set $x (i32.const 1))
      (block $doneX (loop $eachX
        (br_if $doneX (i32.ge_u (local.get $x) (local.get $width)))
        (if (i32.and (i32.eqz (local.get $narrow)) (i32.gt_s (i32.add (local.get $x) (i32.const 8)) (local.get $width)))
          (then (local.set $x (i32.sub (local.get $width) (i32.const 8)))))
        (local.set $p (i32.add (local.get $plane) (i32.shl (i32.add (local.get $row) (local.get $x)) (i32.const 1))))
        (local.set $v (if (result v128) (local.get $narrow) (then (v128.load16_splat (local.get $p))) (else (v128.load (local.get $p)))))
        (local.set $w (if (result v128) (local.get $narrow) (then (v128.load16_splat (i32.sub (local.get $p) (i32.const 2)))) (else (v128.load (i32.sub (local.get $p) (i32.const 2))))))
        (local.set $pN (i32.sub (local.get $p) (i32.shl (local.get $width) (i32.const 1))))
        (local.set $n (if (result v128) (local.get $y) (then (if (result v128) (local.get $narrow) (then (v128.load16_splat (local.get $pN))) (else (v128.load (local.get $pN))))) (else (local.get $w))))
        (local.set $nw (if (result v128) (local.get $y) (then (if (result v128) (local.get $narrow) (then (v128.load16_splat (i32.sub (local.get $pN) (i32.const 2)))) (else (v128.load (i32.sub (local.get $pN) (i32.const 2)))))) (else (local.get $w))))
        (local.set $res (i16x8.sub (local.get $v) (i16x8.max_s (i16x8.min_s (local.get $w) (local.get $n)) (i16x8.min_s (i16x8.max_s (local.get $w) (local.get $n)) (i16x8.sub (i16x8.add (local.get $w) (local.get $n)) (local.get $nw))))))
        (local.set $res (v128.xor (i16x8.shl (local.get $res) (i32.const 1)) (i16x8.shr_s (local.get $res) (i32.const 15))))
        (if (local.get $narrow)
          (then (i32.store16 (i32.add (local.get $values) (i32.shl (i32.add (local.get $row) (local.get $x)) (i32.const 1))) (i16x8.extract_lane_u 0 (local.get $res))))
          (else (v128.store (i32.add (local.get $values) (i32.shl (i32.add (local.get $row) (local.get $x)) (i32.const 1))) (local.get $res))))
        (local.set $absWNW (i16x8.abs (i16x8.sub (local.get $w) (local.get $nw))))
        (local.set $absNWN (i16x8.abs (i16x8.sub (local.get $nw) (local.get $n))))
        (local.set $res (i16x8.neg (i16x8.add
          (i16x8.mul (i16x8.add (i16x8.add (i16x8.gt_s (local.get $absWNW) (local.get $c0)) (i16x8.gt_s (local.get $absWNW) (local.get $c2))) (i16x8.gt_s (local.get $absWNW) (local.get $c12))) (local.get $four))
          (i16x8.add (i16x8.add (i16x8.gt_s (local.get $absNWN) (local.get $c0)) (i16x8.gt_s (local.get $absNWN) (local.get $c2))) (i16x8.gt_s (local.get $absNWN) (local.get $c12))))))
        (if (local.get $narrow)
          (then (i32.store8 (i32.add (local.get $contexts) (i32.add (local.get $row) (local.get $x))) (i16x8.extract_lane_u 0 (local.get $res))))
          (else (i64.store (i32.add (local.get $contexts) (i32.add (local.get $row) (local.get $x))) (i64x2.extract_lane 0 (i8x16.narrow_i16x8_s (local.get $res) (local.get $res))))))
        (local.set $x (i32.add (local.get $x) (select (i32.const 1) (i32.const 8) (local.get $narrow))))
        (br_if $doneX (i32.ge_s (local.get $x) (local.get $width)))
        (br $eachX)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $eachY))))

;; screen-photo-mask.mjs's photoMasks runs, one rectangle: its pixels `px` (w x h, 4-byte words) marked 1 where equal to a
;; 4-neighbour (`mark`, a byte each, zeroed by the caller); then from each such pixel on a hard edge, in raster order, its
;; run flooded breadth first (left, right, up, down) into `pixels`, kept as [start, size, colour] at `runs` when it holds
;; CORE (2) or more pixels and at least a quarter of its rim meets a hard edge. Answers the number of runs; the number of
;; pixels that are not opaque goes to `out`.
(func $far (param $a i32) (param $b i32) (result i32) (local $s i32) (local $d i32)
  (if (i32.eqz (i32.and (i32.xor (local.get $a) (local.get $b)) (i32.const 0xc0c0c0))) (then (return (i32.const 0))))
  (block $no (loop $ch
    (local.set $d (i32.sub (i32.and (i32.shr_u (local.get $a) (local.get $s)) (i32.const 255)) (i32.and (i32.shr_u (local.get $b) (local.get $s)) (i32.const 255))))
    (if (i32.ge_s (select (local.get $d) (i32.sub (i32.const 0) (local.get $d)) (i32.ge_s (local.get $d) (i32.const 0))) (i32.const 64)) (then (return (i32.const 1))))
    (local.set $s (i32.add (local.get $s) (i32.const 8)))
    (br_if $ch (i32.lt_u (local.get $s) (i32.const 24)))))
  (i32.const 0))
(func $maskSide (param $px i32) (param $mark i32) (param $pixels i32) (param $k i32) (param $c i32) (param $state i32) (result i32)
  ;; `state`: the queue's top << 2 | the side bits so far (1 a differing neighbour, 2 a far one).
  (local $v i32)
  (if (i32.lt_s (local.get $k) (i32.const 0)) (then (return (local.get $state))))
  (local.set $v (i32.load (i32.add (local.get $px) (i32.shl (local.get $k) (i32.const 2)))))
  (if (i32.ne (local.get $v) (local.get $c))
    (then (return (i32.or (local.get $state) (select (i32.const 3) (i32.const 1) (call $far (local.get $c) (local.get $v)))))))
  (if (i32.eq (i32.load8_u (i32.add (local.get $mark) (local.get $k))) (i32.const 1))
    (then
      (i32.store8 (i32.add (local.get $mark) (local.get $k)) (i32.const 2))
      (i32.store (i32.add (local.get $pixels) (i32.shl (i32.shr_u (local.get $state) (i32.const 2)) (i32.const 2))) (local.get $k))
      (return (i32.add (local.get $state) (i32.const 4)))))
  (local.get $state))
(func (export "maskRuns") (param $px i32) (param $w i32) (param $h i32) (param $mark i32) (param $pixels i32) (param $runs i32) (param $out i32)
  (result i32)
  (local $n i32) (local $i i32) (local $x i32) (local $y i32) (local $c i32) (local $end i32) (local $start i32) (local $top i32)
  (local $j i32) (local $side i32) (local $rim i32) (local $hard i32) (local $count i32) (local $clear i32) (local $edge i32)
  (local.set $n (i32.mul (local.get $w) (local.get $h)))
  (block $m1 (loop $marking
    (br_if $m1 (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $c (i32.load (i32.add (local.get $px) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.and (i32.lt_u (i32.add (local.get $x) (i32.const 1)) (local.get $w))
          (i32.eq (i32.load offset=4 (i32.add (local.get $px) (i32.shl (local.get $i) (i32.const 2)))) (local.get $c)))
      (then (i32.store8 (i32.add (local.get $mark) (local.get $i)) (i32.const 1)) (i32.store8 offset=1 (i32.add (local.get $mark) (local.get $i)) (i32.const 1))))
    (if (i32.and (i32.lt_u (i32.add (local.get $y) (i32.const 1)) (local.get $h))
          (i32.eq (i32.load (i32.add (local.get $px) (i32.shl (i32.add (local.get $i) (local.get $w)) (i32.const 2)))) (local.get $c)))
      (then (i32.store8 (i32.add (local.get $mark) (local.get $i)) (i32.const 1)) (i32.store8 (i32.add (local.get $mark) (i32.add (local.get $i) (local.get $w))) (i32.const 1))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (local.set $x (i32.add (local.get $x) (i32.const 1)))
    (if (i32.eq (local.get $x) (local.get $w)) (then (local.set $x (i32.const 0)) (local.set $y (i32.add (local.get $y) (i32.const 1)))))
    (br $marking)))
  (local.set $i (i32.const 0))
  (block $f1 (loop $finding
    (br_if $f1 (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $c (i32.load (i32.add (local.get $px) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.ne (i32.shr_u (local.get $c) (i32.const 24)) (i32.const 255)) (then (local.set $clear (i32.add (local.get $clear) (i32.const 1)))))
    (block $next
      (br_if $next (i32.ne (i32.load8_u (i32.add (local.get $mark) (local.get $i))) (i32.const 1)))
      (local.set $x (i32.rem_u (local.get $i) (local.get $w)))
      ;; A run starts only from a pixel on a hard edge.
      (local.set $edge (i32.const 0))
      (if (i32.gt_u (local.get $x) (i32.const 0)) (then (local.set $edge (call $far (local.get $c) (i32.load (i32.sub (i32.add (local.get $px) (i32.shl (local.get $i) (i32.const 2))) (i32.const 4)))))))
      (if (i32.and (i32.eqz (local.get $edge)) (i32.lt_u (i32.add (local.get $x) (i32.const 1)) (local.get $w)))
        (then (local.set $edge (call $far (local.get $c) (i32.load offset=4 (i32.add (local.get $px) (i32.shl (local.get $i) (i32.const 2))))))))
      (if (i32.and (i32.eqz (local.get $edge)) (i32.ge_u (local.get $i) (local.get $w)))
        (then (local.set $edge (call $far (local.get $c) (i32.load (i32.add (local.get $px) (i32.shl (i32.sub (local.get $i) (local.get $w)) (i32.const 2))))))))
      (if (i32.and (i32.eqz (local.get $edge)) (i32.lt_u (i32.add (local.get $i) (local.get $w)) (local.get $n)))
        (then (local.set $edge (call $far (local.get $c) (i32.load (i32.add (local.get $px) (i32.shl (i32.add (local.get $i) (local.get $w)) (i32.const 2))))))))
      (br_if $next (i32.eqz (local.get $edge)))
      (local.set $start (local.get $end)) (local.set $top (local.get $end)) (local.set $rim (i32.const 0)) (local.set $hard (i32.const 0))
      (i32.store (i32.add (local.get $pixels) (i32.shl (local.get $top) (i32.const 2))) (local.get $i))
      (local.set $top (i32.add (local.get $top) (i32.const 1)))
      (i32.store8 (i32.add (local.get $mark) (local.get $i)) (i32.const 2))
      (block $flooded (loop $flood
        (br_if $flooded (i32.ge_u (local.get $end) (local.get $top)))
        (local.set $j (i32.load (i32.add (local.get $pixels) (i32.shl (local.get $end) (i32.const 2)))))
        (local.set $end (i32.add (local.get $end) (i32.const 1)))
        (local.set $x (i32.rem_u (local.get $j) (local.get $w)))
        (local.set $side (i32.shl (local.get $top) (i32.const 2)))
        (call $maskSide (local.get $px) (local.get $mark) (local.get $pixels)
          (select (i32.sub (local.get $j) (i32.const 1)) (i32.const -1) (i32.gt_u (local.get $x) (i32.const 0))) (local.get $c) (local.get $side))
        (local.set $side)
        (call $maskSide (local.get $px) (local.get $mark) (local.get $pixels)
          (select (i32.add (local.get $j) (i32.const 1)) (i32.const -1) (i32.lt_u (i32.add (local.get $x) (i32.const 1)) (local.get $w))) (local.get $c) (local.get $side))
        (local.set $side)
        (call $maskSide (local.get $px) (local.get $mark) (local.get $pixels) (i32.sub (local.get $j) (local.get $w)) (local.get $c) (local.get $side))
        (local.set $side)
        (call $maskSide (local.get $px) (local.get $mark) (local.get $pixels)
          (select (i32.add (local.get $j) (local.get $w)) (i32.const -1) (i32.lt_u (i32.add (local.get $j) (local.get $w)) (local.get $n))) (local.get $c) (local.get $side))
        (local.set $side)
        (local.set $top (i32.shr_u (local.get $side) (i32.const 2)))
        (local.set $rim (i32.add (local.get $rim) (i32.and (local.get $side) (i32.const 1))))
        (local.set $hard (i32.add (local.get $hard) (i32.and (i32.shr_u (local.get $side) (i32.const 1)) (i32.const 1))))
        (br $flood)))
      ;; hard >= 0.25 rim, in integers.
      (if (i32.and (i32.ge_u (i32.sub (local.get $end) (local.get $start)) (i32.const 2)) (i32.ge_u (i32.shl (local.get $hard) (i32.const 2)) (local.get $rim)))
        (then
          (i32.store (i32.add (local.get $runs) (i32.mul (local.get $count) (i32.const 12))) (local.get $start))
          (i32.store offset=4 (i32.add (local.get $runs) (i32.mul (local.get $count) (i32.const 12))) (i32.sub (local.get $end) (local.get $start)))
          (i32.store offset=8 (i32.add (local.get $runs) (i32.mul (local.get $count) (i32.const 12))) (local.get $c))
          (local.set $count (i32.add (local.get $count) (i32.const 1))))
        (else (local.set $end (local.get $start)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $finding)))
  (i32.store (local.get $out) (local.get $clear))
  (local.get $count))

;; modular-channel.mjs's quantised zero-predictor leaf (a Squeeze residual): each of the `n` 16-bit values at `plane`
;; becomes r = round((v - offset) / m), ties up, as floor((2a + m) / 2m) in integers (the same as JavaScript's Math.round
;; on a / m here: |a| < 2^17, so a / m is never within a double's error of a half it does not equal), the value written
;; back as offset + r m (16 bits, as an Int16Array keeps it) and r zigzagged into `out` (4 bytes each).
(func (export "quantise") (param $plane i32) (param $n i32) (param $offset i32) (param $m i32) (param $out i32)
  (local $i i32) (local $a i32) (local $num i32) (local $den i32) (local $r i32)
  (local.set $den (i32.shl (local.get $m) (i32.const 1)))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $a (i32.sub (i32.load16_s (i32.add (local.get $plane) (i32.shl (local.get $i) (i32.const 1)))) (local.get $offset)))
    (local.set $num (i32.add (i32.shl (local.get $a) (i32.const 1)) (local.get $m)))
    ;; Floor division: truncation, one less when the remainder is negative.
    (local.set $r (i32.div_s (local.get $num) (local.get $den)))
    (if (i32.lt_s (i32.rem_s (local.get $num) (local.get $den)) (i32.const 0)) (then (local.set $r (i32.sub (local.get $r) (i32.const 1)))))
    (i32.store16 (i32.add (local.get $plane) (i32.shl (local.get $i) (i32.const 1))) (i32.add (local.get $offset) (i32.mul (local.get $r) (local.get $m))))
    (i32.store (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 2))) (i32.xor (i32.shl (local.get $r) (i32.const 1)) (i32.shr_s (local.get $r) (i32.const 31))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $each))))

;; squeeze.mjs's squeeze, one channel and axis: `p` (w x h, 16-bit) halved into averages at `out` and residuals less the
;; smooth tendency at `res` (16-bit, as the Int16Arrays keep them), the same integers.
(func $avg2 (param $a i32) (param $b i32) (result i32)
  (i32.shr_s (i32.add (i32.add (local.get $a) (local.get $b)) (i32.gt_s (local.get $a) (local.get $b))) (i32.const 1)))
(func $tendency (param $B i32) (param $a i32) (param $n i32) (result i32) (local $sign i32) (local $diff i32)
  (local.set $sign (select (i32.const 1)
    (select (i32.const -1) (i32.const 0) (i32.and (i32.le_s (local.get $B) (local.get $a)) (i32.le_s (local.get $a) (local.get $n))))
    (i32.and (i32.ge_s (local.get $B) (local.get $a)) (i32.ge_s (local.get $a) (local.get $n)))))
  (if (i32.eqz (local.get $sign)) (then (return (i32.const 0))))
  (local.set $B (i32.mul (local.get $B) (local.get $sign))) (local.set $a (i32.mul (local.get $a) (local.get $sign))) (local.set $n (i32.mul (local.get $n) (local.get $sign)))
  (local.set $diff (i32.div_s (i32.add (i32.sub (i32.sub (i32.shl (local.get $B) (i32.const 2)) (i32.mul (local.get $n) (i32.const 3))) (local.get $a)) (i32.const 6)) (i32.const 12)))
  (if (i32.gt_s (i32.sub (local.get $diff) (i32.and (local.get $diff) (i32.const 1))) (i32.shl (i32.sub (local.get $B) (local.get $a)) (i32.const 1)))
    (then (local.set $diff (i32.add (i32.shl (i32.sub (local.get $B) (local.get $a)) (i32.const 1)) (i32.const 1)))))
  (if (i32.gt_s (i32.add (local.get $diff) (i32.and (local.get $diff) (i32.const 1))) (i32.shl (i32.sub (local.get $a) (local.get $n)) (i32.const 1)))
    (then (local.set $diff (i32.shl (i32.sub (local.get $a) (local.get $n)) (i32.const 1)))))
  (i32.mul (local.get $sign) (local.get $diff)))
(func (export "squeezeStep") (param $p i32) (param $w i32) (param $h i32) (param $horizontal i32) (param $out i32) (param $res i32)
  (local $n i32) (local $low i32) (local $high i32) (local $ow i32) (local $oh i32) (local $rw i32) (local $step i32)
  (local $x i32) (local $y i32) (local $pos i32) (local $at i32) (local $A i32) (local $B i32) (local $avg i32) (local $next i32) (local $prev i32)
  (local.set $n (select (local.get $w) (local.get $h) (local.get $horizontal)))
  (local.set $low (i32.shr_u (i32.add (local.get $n) (i32.const 1)) (i32.const 1)))
  (local.set $high (i32.sub (local.get $n) (local.get $low)))
  (local.set $ow (select (local.get $low) (local.get $w) (local.get $horizontal)))
  (local.set $oh (select (local.get $h) (local.get $low) (local.get $horizontal)))
  (local.set $rw (select (local.get $high) (local.get $w) (local.get $horizontal)))
  (local.set $step (select (i32.const 1) (local.get $w) (local.get $horizontal)))
  (block $rows (loop $eachRow
    (br_if $rows (i32.ge_u (local.get $y) (local.get $oh)))
    (local.set $x (i32.const 0))
    (block $cols (loop $eachCol
      (br_if $cols (i32.ge_u (local.get $x) (local.get $ow)))
      (local.set $pos (select (local.get $x) (local.get $y) (local.get $horizontal)))
      (local.set $at (select (i32.add (i32.mul (local.get $y) (local.get $w)) (i32.shl (local.get $x) (i32.const 1)))
        (i32.add (i32.mul (i32.shl (local.get $y) (i32.const 1)) (local.get $w)) (local.get $x)) (local.get $horizontal)))
      (if (i32.eq (local.get $pos) (local.get $high))
        (then (i32.store16 (i32.add (local.get $out) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $ow)) (local.get $x)) (i32.const 1)))
          (i32.load16_s (i32.add (local.get $p) (i32.shl (local.get $at) (i32.const 1))))))
        (else
          (local.set $A (i32.load16_s (i32.add (local.get $p) (i32.shl (local.get $at) (i32.const 1)))))
          (local.set $B (i32.load16_s (i32.add (local.get $p) (i32.shl (i32.add (local.get $at) (local.get $step)) (i32.const 1)))))
          (local.set $avg (call $avg2 (local.get $A) (local.get $B)))
          (local.set $next
            (if (result i32) (i32.lt_s (i32.add (local.get $pos) (i32.const 1)) (local.get $high))
              (then (call $avg2 (i32.load16_s (i32.add (local.get $p) (i32.shl (i32.add (local.get $at) (i32.shl (local.get $step) (i32.const 1))) (i32.const 1))))
                (i32.load16_s (i32.add (local.get $p) (i32.shl (i32.add (local.get $at) (i32.mul (local.get $step) (i32.const 3))) (i32.const 1))))))
              (else (if (result i32) (i32.and (local.get $n) (i32.const 1))
                (then (i32.load16_s (i32.add (local.get $p) (i32.shl (i32.add (local.get $at) (i32.shl (local.get $step) (i32.const 1))) (i32.const 1)))))
                (else (local.get $avg))))))
          (local.set $prev (if (result i32) (local.get $pos)
            (then (i32.load16_s (i32.add (local.get $p) (i32.shl (i32.sub (local.get $at) (local.get $step)) (i32.const 1)))))
            (else (local.get $avg))))
          (i32.store16 (i32.add (local.get $out) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $ow)) (local.get $x)) (i32.const 1))) (local.get $avg))
          (i32.store16 (i32.add (local.get $res) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $rw)) (local.get $x)) (i32.const 1)))
            (i32.sub (i32.sub (local.get $A) (local.get $B)) (call $tendency (local.get $prev) (local.get $avg) (local.get $next))))))
      (local.set $x (i32.add (local.get $x) (i32.const 1))) (br $eachCol)))
    (local.set $y (i32.add (local.get $y) (i32.const 1))) (br $eachRow))))

;; screen-photo-mask.mjs's fillHoles: `rgba` (w x h, 4 bytes a pixel) with each pixel `exact` (a byte, nonzero) set to the
;; nearest photo pixels left and right along its row and above and below in its column, interpolated (f64, as the
;; JavaScript computed it) and averaged, alpha 0; photo pixels take alpha 255. `nearest` holds 16 bytes an exact pixel
;; (left, right, up, down; -1 none) and `column` 4 bytes a column.
(func $holeAt (param $rgba i32) (param $a i32) (param $b i32) (param $ta i32) (param $tb i32) (param $c i32) (result f64)
  (if (result f64) (i32.lt_s (local.get $a) (i32.const 0))
    (then (f64.convert_i32_u (i32.load8_u (i32.add (local.get $rgba) (i32.add (local.get $b) (local.get $c))))))
    (else (if (result f64) (i32.lt_s (local.get $b) (i32.const 0))
      (then (f64.convert_i32_u (i32.load8_u (i32.add (local.get $rgba) (i32.add (local.get $a) (local.get $c))))))
      (else (f64.div
        (f64.add
          (f64.mul (f64.convert_i32_u (i32.load8_u (i32.add (local.get $rgba) (i32.add (local.get $a) (local.get $c))))) (f64.convert_i32_s (local.get $tb)))
          (f64.mul (f64.convert_i32_u (i32.load8_u (i32.add (local.get $rgba) (i32.add (local.get $b) (local.get $c))))) (f64.convert_i32_s (local.get $ta))))
        (f64.convert_i32_s (i32.add (local.get $ta) (local.get $tb)))))))))
(func (export "fillHoles") (param $rgba i32) (param $w i32) (param $h i32) (param $exact i32) (param $nearest i32) (param $column i32)
  (local $x i32) (local $y i32) (local $i i32) (local $k i32) (local $last i32) (local $e i32) (local $n i32) (local $m i32)
  (local $l i32) (local $r i32) (local $u i32) (local $d i32) (local $p i32) (local $ch i32) (local $along i32) (local $down i32)
  (local $a i32) (local $b i32) (local $c i32) (local $f i32) (local $v f64) (local $t f64)
  (local.set $n (i32.mul (local.get $w) (local.get $h)))
  ;; Left and up, rows in order.
  (memory.fill (local.get $column) (i32.const 255) (i32.shl (local.get $w) (i32.const 2)))
  (block $d1 (loop $rows1
    (br_if $d1 (i32.ge_u (local.get $y) (local.get $h)))
    (local.set $last (i32.const -1)) (local.set $x (i32.const 0))
    (block $c1 (loop $cols1
      (br_if $c1 (i32.ge_u (local.get $x) (local.get $w)))
      (if (i32.eqz (i32.load8_u (i32.add (local.get $exact) (local.get $i))))
        (then
          (local.set $last (local.get $x))
          (i32.store (i32.add (local.get $column) (i32.shl (local.get $x) (i32.const 2))) (local.get $y))
          (i32.store8 offset=3 (i32.add (local.get $rgba) (i32.shl (local.get $i) (i32.const 2))) (i32.const 255)))
        (else
          (local.set $e (i32.add (local.get $nearest) (i32.shl (local.get $k) (i32.const 4))))
          (i32.store (local.get $e) (local.get $last))
          (i32.store offset=8 (local.get $e) (i32.load (i32.add (local.get $column) (i32.shl (local.get $x) (i32.const 2)))))
          (local.set $k (i32.add (local.get $k) (i32.const 1)))))
      (local.set $x (i32.add (local.get $x) (i32.const 1))) (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $cols1)))
    (local.set $y (i32.add (local.get $y) (i32.const 1))) (br $rows1)))
  (local.set $m (local.get $k))
  ;; Right and down, rows in reverse.
  (memory.fill (local.get $column) (i32.const 255) (i32.shl (local.get $w) (i32.const 2)))
  (local.set $y (i32.sub (local.get $h) (i32.const 1))) (local.set $i (i32.sub (local.get $n) (i32.const 1))) (local.set $k (i32.sub (local.get $m) (i32.const 1)))
  (block $d2 (loop $rows2
    (br_if $d2 (i32.lt_s (local.get $y) (i32.const 0)))
    (local.set $last (i32.const -1)) (local.set $x (i32.sub (local.get $w) (i32.const 1)))
    (block $c2 (loop $cols2
      (br_if $c2 (i32.lt_s (local.get $x) (i32.const 0)))
      (if (i32.eqz (i32.load8_u (i32.add (local.get $exact) (local.get $i))))
        (then
          (local.set $last (local.get $x))
          (i32.store (i32.add (local.get $column) (i32.shl (local.get $x) (i32.const 2))) (local.get $y)))
        (else
          (local.set $e (i32.add (local.get $nearest) (i32.shl (local.get $k) (i32.const 4))))
          (i32.store offset=4 (local.get $e) (local.get $last))
          (i32.store offset=12 (local.get $e) (i32.load (i32.add (local.get $column) (i32.shl (local.get $x) (i32.const 2)))))
          (local.set $k (i32.sub (local.get $k) (i32.const 1)))))
      (local.set $x (i32.sub (local.get $x) (i32.const 1))) (local.set $i (i32.sub (local.get $i) (i32.const 1))) (br $cols2)))
    (local.set $y (i32.sub (local.get $y) (i32.const 1))) (br $rows2)))
  ;; Each exact pixel from its four.
  (local.set $y (i32.const 0)) (local.set $i (i32.const 0)) (local.set $k (i32.const 0))
  (block $d3 (loop $rows3
    (br_if $d3 (i32.ge_u (local.get $y) (local.get $h)))
    (local.set $x (i32.const 0))
    (block $c3 (loop $cols3
      (br_if $c3 (i32.ge_u (local.get $x) (local.get $w)))
      (if (i32.load8_u (i32.add (local.get $exact) (local.get $i)))
        (then
          (local.set $e (i32.add (local.get $nearest) (i32.shl (local.get $k) (i32.const 4))))
          (local.set $l (i32.load (local.get $e))) (local.set $r (i32.load offset=4 (local.get $e)))
          (local.set $u (i32.load offset=8 (local.get $e))) (local.set $d (i32.load offset=12 (local.get $e)))
          (local.set $k (i32.add (local.get $k) (i32.const 1)))
          (local.set $p (i32.shl (local.get $i) (i32.const 2)))
          (local.set $along (i32.or (i32.ge_s (local.get $l) (i32.const 0)) (i32.ge_s (local.get $r) (i32.const 0))))
          (local.set $down (i32.or (i32.ge_s (local.get $u) (i32.const 0)) (i32.ge_s (local.get $d) (i32.const 0))))
          (local.set $a (select (i32.shl (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $l)) (i32.const 2)) (i32.const -1) (i32.ge_s (local.get $l) (i32.const 0))))
          (local.set $b (select (i32.shl (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $r)) (i32.const 2)) (i32.const -1) (i32.ge_s (local.get $r) (i32.const 0))))
          (local.set $c (select (i32.shl (i32.add (i32.mul (local.get $u) (local.get $w)) (local.get $x)) (i32.const 2)) (i32.const -1) (i32.ge_s (local.get $u) (i32.const 0))))
          (local.set $f (select (i32.shl (i32.add (i32.mul (local.get $d) (local.get $w)) (local.get $x)) (i32.const 2)) (i32.const -1) (i32.ge_s (local.get $d) (i32.const 0))))
          (local.set $ch (i32.const 0))
          (loop $chans
            (local.set $v (if (result f64) (local.get $along)
              (then (call $holeAt (local.get $rgba) (local.get $a) (local.get $b) (i32.sub (local.get $x) (local.get $l)) (i32.sub (local.get $r) (local.get $x)) (local.get $ch)))
              (else (f64.const 0))))
            (local.set $t (if (result f64) (local.get $down)
              (then (call $holeAt (local.get $rgba) (local.get $c) (local.get $f) (i32.sub (local.get $y) (local.get $u)) (i32.sub (local.get $d) (local.get $y)) (local.get $ch)))
              (else (f64.const 0))))
            (if (i32.or (local.get $along) (local.get $down))
              (then (i32.store8 (i32.add (local.get $rgba) (i32.add (local.get $p) (local.get $ch)))
                (i32.trunc_f64_s (f64.add
                  (if (result f64) (i32.and (local.get $along) (local.get $down))
                    (then (f64.div (f64.add (local.get $v) (local.get $t)) (f64.const 2)))
                    (else (if (result f64) (local.get $along) (then (local.get $v)) (else (local.get $t)))))
                  (f64.const 0.5))))))
            (local.set $ch (i32.add (local.get $ch) (i32.const 1)))
            (br_if $chans (i32.lt_u (local.get $ch) (i32.const 3))))
          (i32.store8 offset=3 (i32.add (local.get $rgba) (local.get $p)) (i32.const 0))))
      (local.set $x (i32.add (local.get $x) (i32.const 1))) (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $cols3)))
    (local.set $y (i32.add (local.get $y) (i32.const 1))) (br $rows3))))

;; One 16-row tile band, preceded by its top halo. Ignore column0 and the first input row.
(func (export "denseTiles") (param $in i32) (param $stride i32) (param $width i32) (param $rows i32) (param $out i32)
  (local $bx i32) (local $x i32) (local $y i32) (local $end i32) (local $p i32) (local $key i32) (local $count i32)
  (loop $tiles
    (local.set $count (i32.const 0))
    (local.set $end (i32.add (local.get $bx) (i32.const 16)))
    (if (i32.gt_u (local.get $end) (local.get $width)) (then (local.set $end (local.get $width))))
    (local.set $y (i32.const 1))
    (block $classified (loop $ys
      (br_if $classified (i32.ge_u (local.get $y) (local.get $rows)))
      (local.set $x (select (local.get $bx) (i32.const 1) (local.get $bx)))
      (block $nextRow (loop $xs
        (br_if $nextRow (i32.ge_u (local.get $x) (local.get $end)))
        (local.set $p (i32.add (local.get $in) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $stride)) (local.get $x)) (i32.const 2))))
        (local.set $key (i32.load (local.get $p)))
        (if (i32.and
              (i32.ne (local.get $key) (i32.load (i32.sub (local.get $p) (i32.const 4))))
              (i32.ne (local.get $key) (i32.load (i32.sub (local.get $p) (i32.shl (local.get $stride) (i32.const 2))))))
          (then (local.set $count (i32.add (local.get $count) (i32.const 1)))))
        (br_if $classified (i32.gt_u (local.get $count) (i32.const 48)))
        (local.set $x (i32.add (local.get $x) (i32.const 1))) (br $xs)))
      (local.set $y (i32.add (local.get $y) (i32.const 1))) (br $ys)))
    (i32.store8 (i32.add (local.get $out) (i32.shr_u (local.get $bx) (i32.const 4))) (i32.gt_u (local.get $count) (i32.const 48)))
    (local.set $bx (i32.add (local.get $bx) (i32.const 16)))
    (br_if $tiles (i32.lt_u (local.get $bx) (local.get $width)))))

;; capture-codec.mjs's writeChannels writer: pieces[from, count) of one channel, each through its histogram's code, into
;; `out`. Pieces: `values` and `distances` 4 bytes, `contexts` 1 byte; `hmap` a context's histogram (4 bytes). A literal
;; under 512 is one entry of `fast` (8 bytes at (h << 9 | v): bits, then length); otherwise its token comes from the
;; histogram's configuration at `configs` + 16h (split, msb, lsb, splitToken) and its code from the 8-byte entries
;; (code, length) at `codes` + 8(`syms`[h] + token). A copy is its length's token (`lengthConfig`, `minSymbol` on), then
;; its distance's (`distanceConfig`, codes at `dcodes`): the distance itself mapped by `sCodes` (16-bit, `sLen` of them,
;; -1 none) when `spatial`, else 1 or d + 119. Bits gather in a 64-bit reservoir (`state`: the reservoir, then its bit
;; count, under 8 between calls) stored whole after each piece, so `out` keeps 8 spare bytes. Stops past `limit`;
;; answers the next piece and leaves the output's end at `state` + 12.
(func $hybrid (param $config i32) (param $v i32) (result i64)
  (local $split i32) (local $msb i32) (local $lsb i32) (local $log i32) (local $below i32) (local $nbits i32)
  (local.set $split (i32.load (local.get $config)))
  (if (i32.lt_u (local.get $v) (i32.load offset=12 (local.get $config))) (then (return (i64.extend_i32_u (local.get $v)))))
  (local.set $msb (i32.load offset=4 (local.get $config)))
  (local.set $lsb (i32.load offset=8 (local.get $config)))
  (local.set $log (i32.sub (i32.const 31) (i32.clz (local.get $v))))
  (local.set $below (i32.sub (local.get $v) (i32.shl (i32.const 1) (local.get $log))))
  (local.set $nbits (i32.sub (i32.sub (local.get $log) (local.get $msb)) (local.get $lsb)))
  (i64.or
    (i64.extend_i32_u (i32.or
      (i32.add (i32.load offset=12 (local.get $config))
        (i32.or (i32.or
          (i32.shl (i32.sub (local.get $log) (local.get $split)) (i32.add (local.get $msb) (local.get $lsb)))
          (i32.shl (i32.shr_u (local.get $below) (i32.sub (local.get $log) (local.get $msb))) (local.get $lsb)))
          (i32.and (local.get $below) (i32.sub (i32.shl (i32.const 1) (local.get $lsb)) (i32.const 1)))))
      (i32.shl (local.get $nbits) (i32.const 16))))
    (i64.shl
      (i64.extend_i32_u (i32.and (i32.shr_u (local.get $v) (local.get $lsb)) (i32.sub (i32.shl (i32.const 1) (local.get $nbits)) (i32.const 1))))
      (i64.const 32))))

;; The clamped gradient (predictor 5) on up to four planes at once, one a lane, for the fastest effort: `plane` holds four
;; 16-bit samples a pixel (lane order); each lane's residuals (packed signed) go to `residual` + 4n·lane and its smooth
;; context (capture-codec.mjs predictSmooth's: the sizes of W - NW and NW - N, 0-15) to `property` + 4n·lane, n =
;; width·height, for the first `lanes` lanes. W, N and NW follow the decoder's edges.
(func (export "gradient4")
  (param $plane i32) (param $width i32) (param $height i32) (param $lanes i32) (param $residual i32) (param $property i32)
  (local $x i32) (local $y i32) (local $p i32) (local $row i32) (local $plane4 i32) (local $i i32) (local $at i32)
  (local $L v128) (local $T v128) (local $TL v128) (local $lo v128) (local $hi v128) (local $g v128) (local $r v128)
  (local $a v128) (local $b v128) (local $ctx v128)
  (local.set $row (i32.shl (local.get $width) (i32.const 3)))
  (local.set $plane4 (i32.shl (i32.mul (local.get $width) (local.get $height)) (i32.const 2)))
  (local.set $p (local.get $plane))
  (loop $ys
    (local.set $x (i32.const 0))
    (loop $xs
      (local.set $T (if (result v128) (local.get $y)
        (then (v128.load16x4_s (i32.sub (local.get $p) (local.get $row))))
        (else (v128.const i32x4 0 0 0 0))))
      (local.set $L (if (result v128) (local.get $x)
        (then (v128.load16x4_s (i32.sub (local.get $p) (i32.const 8))))
        (else (local.get $T))))
      (if (i32.eqz (local.get $y)) (then (local.set $T (local.get $L))))
      (local.set $TL (if (result v128) (i32.and (i32.ne (local.get $x) (i32.const 0)) (i32.ne (local.get $y) (i32.const 0)))
        (then (v128.load16x4_s (i32.sub (i32.sub (local.get $p) (local.get $row)) (i32.const 8))))
        (else (local.get $L))))
      (local.set $lo (i32x4.min_s (local.get $L) (local.get $T)))
      (local.set $hi (i32x4.max_s (local.get $L) (local.get $T)))
      (local.set $g (i32x4.max_s (local.get $lo) (i32x4.min_s (local.get $hi) (i32x4.sub (i32x4.add (local.get $L) (local.get $T)) (local.get $TL)))))
      (local.set $r (i32x4.sub (v128.load16x4_s (local.get $p)) (local.get $g)))
      (local.set $r (v128.xor (i32x4.shl (local.get $r) (i32.const 1)) (i32x4.shr_s (local.get $r) (i32.const 31))))
      ;; The size of each difference: 0, 1-2, 3-12 or more.
      (local.set $a (i32x4.abs (i32x4.sub (local.get $L) (local.get $TL))))
      (local.set $b (i32x4.abs (i32x4.sub (local.get $TL) (local.get $T))))
      (local.set $ctx (i32x4.shl (i32x4.sub (i32x4.sub (i32x4.sub (v128.const i32x4 0 0 0 0)
        (i32x4.gt_s (local.get $a) (v128.const i32x4 0 0 0 0)))
        (i32x4.gt_s (local.get $a) (v128.const i32x4 2 2 2 2)))
        (i32x4.gt_s (local.get $a) (v128.const i32x4 12 12 12 12))) (i32.const 2)))
      (local.set $ctx (i32x4.sub (i32x4.sub (i32x4.sub (local.get $ctx)
        (i32x4.gt_s (local.get $b) (v128.const i32x4 0 0 0 0)))
        (i32x4.gt_s (local.get $b) (v128.const i32x4 2 2 2 2)))
        (i32x4.gt_s (local.get $b) (v128.const i32x4 12 12 12 12))))
      (local.set $at (i32.add (local.get $residual) (i32.shl (local.get $i) (i32.const 2))))
      (i32.store (local.get $at) (i32x4.extract_lane 0 (local.get $r)))
      (i32.store (i32.add (local.get $at) (local.get $plane4)) (i32x4.extract_lane 1 (local.get $r)))
      (i32.store (i32.add (local.get $at) (i32.shl (local.get $plane4) (i32.const 1))) (i32x4.extract_lane 2 (local.get $r)))
      (local.set $at (i32.add (local.get $property) (i32.shl (local.get $i) (i32.const 2))))
      (i32.store (local.get $at) (i32x4.extract_lane 0 (local.get $ctx)))
      (i32.store (i32.add (local.get $at) (local.get $plane4)) (i32x4.extract_lane 1 (local.get $ctx)))
      (i32.store (i32.add (local.get $at) (i32.shl (local.get $plane4) (i32.const 1))) (i32x4.extract_lane 2 (local.get $ctx)))
      (if (i32.eq (local.get $lanes) (i32.const 4)) (then
        (i32.store (i32.add (i32.add (local.get $residual) (i32.shl (local.get $i) (i32.const 2))) (i32.mul (local.get $plane4) (i32.const 3))) (i32x4.extract_lane 3 (local.get $r)))
        (i32.store (i32.add (local.get $at) (i32.mul (local.get $plane4) (i32.const 3))) (i32x4.extract_lane 3 (local.get $ctx)))))
      (local.set $p (i32.add (local.get $p) (i32.const 8)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br_if $xs (i32.lt_u (local.get $x) (local.get $width))))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br_if $ys (i32.lt_u (local.get $y) (local.get $height)))))

(func (export "captureTokens")
  (param $values i32) (param $distances i32) (param $contexts i32) (param $from i32) (param $count i32) (param $hmap i32)
  (param $fast i32) (param $syms i32) (param $codes i32) (param $configs i32) (param $lengthConfig i32)
  (param $distanceConfig i32) (param $dcodes i32) (param $minSymbol i32) (param $spatial i32) (param $sLen i32)
  (param $sCodes i32) (param $out i32) (param $limit i32) (param $state i32) (result i32)
  (local $k i32) (local $h i32) (local $v i32) (local $d i32) (local $t i64) (local $e i32) (local $len i32)
  (local $bits i64) (local $res i64) (local $pending i32) (local $adv i32)
  (local.set $k (local.get $from))
  (local.set $res (i64.load (local.get $state)))
  (local.set $pending (i32.load offset=8 (local.get $state)))
  (block $done
    (loop $piece
      (br_if $done (i32.ge_u (local.get $k) (local.get $count)))
      (br_if $done (i32.gt_u (local.get $out) (local.get $limit)))
      (local.set $h (i32.load (i32.add (local.get $hmap)
        (i32.shl (i32.load8_u (i32.add (local.get $contexts) (local.get $k))) (i32.const 2)))))
      (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2)))))
      (local.set $d (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2)))))
      (if (i32.and (i32.eqz (local.get $d)) (i32.lt_u (local.get $v) (i32.const 512)))
        (then
          (local.set $e (i32.add (local.get $fast) (i32.shl (i32.or (i32.shl (local.get $h) (i32.const 9)) (local.get $v)) (i32.const 3))))
          (local.set $bits (i64.extend_i32_u (i32.load (local.get $e))))
          (local.set $len (i32.load offset=4 (local.get $e))))
        (else
          (if (local.get $d)
            (then
              ;; The length's code and raw bits, emitted; then the distance's below.
              (local.set $t (call $hybrid (local.get $lengthConfig) (local.get $v)))
              (local.set $e (i32.add (local.get $codes) (i32.shl (i32.add
                (i32.load (i32.add (local.get $syms) (i32.shl (local.get $h) (i32.const 2))))
                (i32.add (local.get $minSymbol) (i32.and (i32.wrap_i64 (local.get $t)) (i32.const 65535)))) (i32.const 3))))
              (local.set $len (i32.load offset=4 (local.get $e)))
              (local.set $res (i64.or (local.get $res) (i64.shl
                (i64.or (i64.extend_i32_u (i32.load (local.get $e))) (i64.shl (i64.shr_u (local.get $t) (i64.const 32)) (i64.extend_i32_u (local.get $len))))
                (i64.extend_i32_u (local.get $pending)))))
              (local.set $pending (i32.add (local.get $pending) (i32.add (local.get $len)
                (i32.and (i32.shr_u (i32.wrap_i64 (local.get $t)) (i32.const 16)) (i32.const 255)))))
              (i64.store (local.get $out) (local.get $res))
              (local.set $adv (i32.shr_u (local.get $pending) (i32.const 3)))
              (local.set $out (i32.add (local.get $out) (local.get $adv)))
              (local.set $res (i64.shr_u (local.get $res) (i64.extend_i32_u (i32.shl (local.get $adv) (i32.const 3)))))
              (local.set $pending (i32.and (local.get $pending) (i32.const 7)))
              (local.set $v
                (if (result i32) (local.get $spatial)
                  (then
                    (local.set $e (i32.const -1))
                    (if (i32.lt_u (local.get $d) (local.get $sLen))
                      (then (local.set $e (i32.load16_s (i32.add (local.get $sCodes) (i32.shl (local.get $d) (i32.const 1)))))))
                    (select (local.get $e) (i32.add (local.get $d) (i32.const 119)) (i32.ge_s (local.get $e) (i32.const 0))))
                  (else (select (i32.const 1) (i32.add (local.get $d) (i32.const 119)) (i32.eq (local.get $d) (i32.const 1))))))
              (local.set $t (call $hybrid (local.get $distanceConfig) (local.get $v)))
              (local.set $e (i32.add (local.get $dcodes) (i32.shl (i32.and (i32.wrap_i64 (local.get $t)) (i32.const 65535)) (i32.const 3)))))
            (else
              (local.set $t (call $hybrid (i32.add (local.get $configs) (i32.shl (local.get $h) (i32.const 4))) (local.get $v)))
              (local.set $e (i32.add (local.get $codes) (i32.shl (i32.add
                (i32.load (i32.add (local.get $syms) (i32.shl (local.get $h) (i32.const 2))))
                (i32.and (i32.wrap_i64 (local.get $t)) (i32.const 65535))) (i32.const 3))))))
          (local.set $len (i32.load offset=4 (local.get $e)))
          (local.set $bits (i64.or (i64.extend_i32_u (i32.load (local.get $e)))
            (i64.shl (i64.shr_u (local.get $t) (i64.const 32)) (i64.extend_i32_u (local.get $len)))))
          (local.set $len (i32.add (local.get $len) (i32.and (i32.shr_u (i32.wrap_i64 (local.get $t)) (i32.const 16)) (i32.const 255))))))
      (local.set $res (i64.or (local.get $res) (i64.shl (local.get $bits) (i64.extend_i32_u (local.get $pending)))))
      (local.set $pending (i32.add (local.get $pending) (local.get $len)))
      (i64.store (local.get $out) (local.get $res))
      (local.set $adv (i32.shr_u (local.get $pending) (i32.const 3)))
      (local.set $out (i32.add (local.get $out) (local.get $adv)))
      (local.set $res (i64.shr_u (local.get $res) (i64.extend_i32_u (i32.shl (local.get $adv) (i32.const 3)))))
      (local.set $pending (i32.and (local.get $pending) (i32.const 7)))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (br $piece)))
  (i64.store (local.get $state) (local.get $res))
  (i32.store offset=8 (local.get $state) (local.get $pending))
  (i32.store offset=12 (local.get $state) (local.get $out))
  (local.get $k))
;; kernels-scalar.wat's weighted predictor on up to four planes at once, one a lane: capture-codec.mjs's G, B - G and R - G
;; (and alpha), whose predictions are independent. `plane` holds four 16-bit samples a pixel (lane order); each lane's
;; residuals (packed signed) go to `residual` + 4n·lane and its largest neighbouring error (property 15) to `property` +
;; 4n·lane, n = width·height, for the first `lanes` lanes. `state` is 10 zeroed rows of (width + 2) 16-byte entries.
;; Every lane's arithmetic is the scalar kernel's, products in 64 bits; table reads are per lane.
(func (export "weighted4")
  (param $plane i32) (param $width i32) (param $height i32) (param $lanes i32) (param $residual i32) (param $property i32)
  (param $div i32) (param $weights i32) (param $state i32)
  (local $x i32) (local $y i32) (local $p i32) (local $row i32) (local $stride i32) (local $cur i32) (local $prev i32)
  (local $n i32) (local $nw i32) (local $ne i32) (local $at i32) (local $lane i32) (local $plane4 i32) (local $i i32)
  (local $e0 i32) (local $e1 i32) (local $e2 i32) (local $e3 i32) (local $err i32)
  (local $L v128) (local $T v128) (local $R v128) (local $N v128) (local $W v128) (local $NE v128)
  (local $s0 v128) (local $s1 v128) (local $s2 v128) (local $s3 v128)
  (local $w0 v128) (local $w1 v128) (local $w2 v128) (local $w3 v128) (local $S v128) (local $D v128)
  (local $teW v128) (local $teN v128) (local $teNW v128) (local $teNE v128) (local $most v128) (local $sumWN v128)
  (local $p0 v128) (local $p1 v128) (local $p2 v128) (local $p3 v128) (local $lo v128) (local $hi v128)
  (local $pred v128) (local $value v128) (local $v v128) (local $r v128) (local $q v128)
  (local $ws i32) (local $wshift i32) (local $k0 i32) (local $k1 i32) (local $k2 i32) (local $k3 i32)
  (local.set $stride (i32.shl (i32.add (local.get $width) (i32.const 2)) (i32.const 4)))
  (local.set $row (i32.shl (local.get $width) (i32.const 3)))
  (local.set $plane4 (i32.shl (i32.mul (local.get $width) (local.get $height)) (i32.const 2)))
  (local.set $e1 (i32.add (local.get $state) (i32.mul (local.get $stride) (i32.const 2))))
  (local.set $e2 (i32.add (local.get $state) (i32.mul (local.get $stride) (i32.const 4))))
  (local.set $e3 (i32.add (local.get $state) (i32.mul (local.get $stride) (i32.const 6))))
  (local.set $err (i32.add (local.get $state) (i32.mul (local.get $stride) (i32.const 8))))
  (local.set $e0 (local.get $state))
  (local.set $p (local.get $plane))
  (loop $ys
    (local.set $cur (select (i32.const 0) (local.get $stride) (i32.and (local.get $y) (i32.const 1))))
    (local.set $prev (i32.sub (local.get $stride) (local.get $cur)))
    (local.set $x (i32.const 0))
    (loop $xs
      (local.set $L (if (result v128) (local.get $x)
        (then (v128.load16x4_s (i32.sub (local.get $p) (i32.const 8))))
        (else (if (result v128) (local.get $y)
          (then (v128.load16x4_s (i32.sub (local.get $p) (local.get $row))))
          (else (v128.const i32x4 0 0 0 0))))))
      (local.set $T (if (result v128) (local.get $y)
        (then (v128.load16x4_s (i32.sub (local.get $p) (local.get $row))))
        (else (local.get $L))))
      (local.set $R (if (result v128)
        (i32.and (i32.lt_u (i32.add (local.get $x) (i32.const 1)) (local.get $width)) (i32.ne (local.get $y) (i32.const 0)))
        (then (v128.load16x4_s (i32.add (i32.sub (local.get $p) (local.get $row)) (i32.const 8))))
        (else (local.get $T))))
      (local.set $n (i32.add (local.get $prev) (i32.shl (local.get $x) (i32.const 4))))
      (local.set $nw (select (i32.sub (local.get $n) (i32.const 16)) (local.get $n) (local.get $x)))
      (local.set $ne (select (i32.add (local.get $n) (i32.const 16)) (local.get $n)
        (i32.lt_u (i32.add (local.get $x) (i32.const 1)) (local.get $width))))
      (local.set $s0 (i32x4.add (i32x4.add (v128.load (i32.add (local.get $e0) (local.get $n)))
        (v128.load (i32.add (local.get $e0) (local.get $ne)))) (v128.load (i32.add (local.get $e0) (local.get $nw)))))
      (local.set $s1 (i32x4.add (i32x4.add (v128.load (i32.add (local.get $e1) (local.get $n)))
        (v128.load (i32.add (local.get $e1) (local.get $ne)))) (v128.load (i32.add (local.get $e1) (local.get $nw)))))
      (local.set $s2 (i32x4.add (i32x4.add (v128.load (i32.add (local.get $e2) (local.get $n)))
        (v128.load (i32.add (local.get $e2) (local.get $ne)))) (v128.load (i32.add (local.get $e2) (local.get $nw)))))
      (local.set $s3 (i32x4.add (i32x4.add (v128.load (i32.add (local.get $e3) (local.get $n)))
        (v128.load (i32.add (local.get $e3) (local.get $ne)))) (v128.load (i32.add (local.get $e3) (local.get $nw)))))
      (local.set $ws (i32x4.extract_lane 0 (local.get $s0)))
      (local.set $k0 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=8192 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 13) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $ws (i32x4.extract_lane 0 (local.get $s1)))
      (local.set $k1 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=0 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 12) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $ws (i32x4.extract_lane 0 (local.get $s2)))
      (local.set $k2 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=0 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 12) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $ws (i32x4.extract_lane 0 (local.get $s3)))
      (local.set $k3 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=0 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 12) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $wshift (i32.sub (i32.const 27) (i32.clz (i32.add (i32.add (local.get $k0) (local.get $k1)) (i32.add (local.get $k2) (local.get $k3))))))
      (local.set $k0 (i32.shr_s (local.get $k0) (local.get $wshift)))
      (local.set $k1 (i32.shr_s (local.get $k1) (local.get $wshift)))
      (local.set $k2 (i32.shr_s (local.get $k2) (local.get $wshift)))
      (local.set $k3 (i32.shr_s (local.get $k3) (local.get $wshift)))
      (local.set $ws (i32.add (i32.add (local.get $k0) (local.get $k1)) (i32.add (local.get $k2) (local.get $k3))))
      (local.set $w0 (i32x4.replace_lane 0 (local.get $w0) (local.get $k0)))
      (local.set $w1 (i32x4.replace_lane 0 (local.get $w1) (local.get $k1)))
      (local.set $w2 (i32x4.replace_lane 0 (local.get $w2) (local.get $k2)))
      (local.set $w3 (i32x4.replace_lane 0 (local.get $w3) (local.get $k3)))
      (local.set $S (i32x4.replace_lane 0 (local.get $S) (local.get $ws)))
      (local.set $D (i32x4.replace_lane 0 (local.get $D) (i32.load (i32.add (local.get $div) (i32.shl (i32.sub (local.get $ws) (i32.const 1)) (i32.const 2))))))
      (local.set $ws (i32x4.extract_lane 1 (local.get $s0)))
      (local.set $k0 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=8192 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 13) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $ws (i32x4.extract_lane 1 (local.get $s1)))
      (local.set $k1 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=0 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 12) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $ws (i32x4.extract_lane 1 (local.get $s2)))
      (local.set $k2 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=0 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 12) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $ws (i32x4.extract_lane 1 (local.get $s3)))
      (local.set $k3 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=0 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 12) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $wshift (i32.sub (i32.const 27) (i32.clz (i32.add (i32.add (local.get $k0) (local.get $k1)) (i32.add (local.get $k2) (local.get $k3))))))
      (local.set $k0 (i32.shr_s (local.get $k0) (local.get $wshift)))
      (local.set $k1 (i32.shr_s (local.get $k1) (local.get $wshift)))
      (local.set $k2 (i32.shr_s (local.get $k2) (local.get $wshift)))
      (local.set $k3 (i32.shr_s (local.get $k3) (local.get $wshift)))
      (local.set $ws (i32.add (i32.add (local.get $k0) (local.get $k1)) (i32.add (local.get $k2) (local.get $k3))))
      (local.set $w0 (i32x4.replace_lane 1 (local.get $w0) (local.get $k0)))
      (local.set $w1 (i32x4.replace_lane 1 (local.get $w1) (local.get $k1)))
      (local.set $w2 (i32x4.replace_lane 1 (local.get $w2) (local.get $k2)))
      (local.set $w3 (i32x4.replace_lane 1 (local.get $w3) (local.get $k3)))
      (local.set $S (i32x4.replace_lane 1 (local.get $S) (local.get $ws)))
      (local.set $D (i32x4.replace_lane 1 (local.get $D) (i32.load (i32.add (local.get $div) (i32.shl (i32.sub (local.get $ws) (i32.const 1)) (i32.const 2))))))
      (local.set $ws (i32x4.extract_lane 2 (local.get $s0)))
      (local.set $k0 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=8192 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 13) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $ws (i32x4.extract_lane 2 (local.get $s1)))
      (local.set $k1 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=0 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 12) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $ws (i32x4.extract_lane 2 (local.get $s2)))
      (local.set $k2 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=0 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 12) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $ws (i32x4.extract_lane 2 (local.get $s3)))
      (local.set $k3 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=0 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 12) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $wshift (i32.sub (i32.const 27) (i32.clz (i32.add (i32.add (local.get $k0) (local.get $k1)) (i32.add (local.get $k2) (local.get $k3))))))
      (local.set $k0 (i32.shr_s (local.get $k0) (local.get $wshift)))
      (local.set $k1 (i32.shr_s (local.get $k1) (local.get $wshift)))
      (local.set $k2 (i32.shr_s (local.get $k2) (local.get $wshift)))
      (local.set $k3 (i32.shr_s (local.get $k3) (local.get $wshift)))
      (local.set $ws (i32.add (i32.add (local.get $k0) (local.get $k1)) (i32.add (local.get $k2) (local.get $k3))))
      (local.set $w0 (i32x4.replace_lane 2 (local.get $w0) (local.get $k0)))
      (local.set $w1 (i32x4.replace_lane 2 (local.get $w1) (local.get $k1)))
      (local.set $w2 (i32x4.replace_lane 2 (local.get $w2) (local.get $k2)))
      (local.set $w3 (i32x4.replace_lane 2 (local.get $w3) (local.get $k3)))
      (local.set $S (i32x4.replace_lane 2 (local.get $S) (local.get $ws)))
      (local.set $D (i32x4.replace_lane 2 (local.get $D) (i32.load (i32.add (local.get $div) (i32.shl (i32.sub (local.get $ws) (i32.const 1)) (i32.const 2))))))
      (if (i32.eq (local.get $lanes) (i32.const 4)) (then
      (local.set $ws (i32x4.extract_lane 3 (local.get $s0)))
      (local.set $k0 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=8192 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 13) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $ws (i32x4.extract_lane 3 (local.get $s1)))
      (local.set $k1 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=0 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 12) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $ws (i32x4.extract_lane 3 (local.get $s2)))
      (local.set $k2 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=0 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 12) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $ws (i32x4.extract_lane 3 (local.get $s3)))
      (local.set $k3 (if (result i32) (i32.lt_u (local.get $ws) (i32.const 2048))
        (then (i32.load offset=0 (i32.add (local.get $weights) (i32.shl (local.get $ws) (i32.const 2)))))
        (else
          (local.set $wshift (i32.sub (i32.const 26) (i32.clz (i32.add (local.get $ws) (i32.const 1)))))
          (local.set $wshift (select (i32.const 0) (local.get $wshift) (i32.gt_s (i32.const 0) (local.get $wshift))))
          (i32.add (i32.const 4) (i32.shr_s
            (i32.mul (i32.const 12) (i32.load (i32.add (local.get $div) (i32.shl (i32.shr_s (local.get $ws) (local.get $wshift)) (i32.const 2)))))
            (local.get $wshift))))))
      (local.set $wshift (i32.sub (i32.const 27) (i32.clz (i32.add (i32.add (local.get $k0) (local.get $k1)) (i32.add (local.get $k2) (local.get $k3))))))
      (local.set $k0 (i32.shr_s (local.get $k0) (local.get $wshift)))
      (local.set $k1 (i32.shr_s (local.get $k1) (local.get $wshift)))
      (local.set $k2 (i32.shr_s (local.get $k2) (local.get $wshift)))
      (local.set $k3 (i32.shr_s (local.get $k3) (local.get $wshift)))
      (local.set $ws (i32.add (i32.add (local.get $k0) (local.get $k1)) (i32.add (local.get $k2) (local.get $k3))))
      (local.set $w0 (i32x4.replace_lane 3 (local.get $w0) (local.get $k0)))
      (local.set $w1 (i32x4.replace_lane 3 (local.get $w1) (local.get $k1)))
      (local.set $w2 (i32x4.replace_lane 3 (local.get $w2) (local.get $k2)))
      (local.set $w3 (i32x4.replace_lane 3 (local.get $w3) (local.get $k3)))
      (local.set $S (i32x4.replace_lane 3 (local.get $S) (local.get $ws)))
      (local.set $D (i32x4.replace_lane 3 (local.get $D) (i32.load (i32.add (local.get $div) (i32.shl (i32.sub (local.get $ws) (i32.const 1)) (i32.const 2))))))))
      (local.set $N (i32x4.shl (local.get $T) (i32.const 3)))
      (local.set $W (i32x4.shl (local.get $L) (i32.const 3)))
      (local.set $NE (i32x4.shl (local.get $R) (i32.const 3)))
      (local.set $teW (if (result v128) (local.get $x)
        (then (v128.load (i32.sub (i32.add (i32.add (local.get $err) (local.get $cur)) (i32.shl (local.get $x) (i32.const 4))) (i32.const 16))))
        (else (v128.const i32x4 0 0 0 0))))
      (local.set $teN (v128.load (i32.add (local.get $err) (local.get $n))))
      (local.set $teNW (v128.load (i32.add (local.get $err) (local.get $nw))))
      (local.set $teNE (v128.load (i32.add (local.get $err) (local.get $ne))))
      (local.set $most (local.get $teW))
      (local.set $most (v128.bitselect (local.get $teN) (local.get $most) (i32x4.gt_s (i32x4.abs (local.get $teN)) (i32x4.abs (local.get $most)))))
      (local.set $most (v128.bitselect (local.get $teNW) (local.get $most) (i32x4.gt_s (i32x4.abs (local.get $teNW)) (i32x4.abs (local.get $most)))))
      (local.set $most (v128.bitselect (local.get $teNE) (local.get $most) (i32x4.gt_s (i32x4.abs (local.get $teNE)) (i32x4.abs (local.get $most)))))
      (local.set $sumWN (i32x4.add (local.get $teW) (local.get $teN)))
      (local.set $p0 (i32x4.sub (i32x4.add (local.get $W) (local.get $NE)) (local.get $N)))
      (local.set $p1 (i32x4.sub (local.get $N) (i32x4.shr_s (i32x4.shl (i32x4.add (local.get $sumWN) (local.get $teNE)) (i32.const 4)) (i32.const 5))))
      (local.set $p2 (i32x4.sub (local.get $W) (i32x4.shr_s (i32x4.mul (i32x4.add (local.get $sumWN) (local.get $teNW)) (v128.const i32x4 10 10 10 10)) (i32.const 5))))
      (local.set $p3 (i32x4.sub (local.get $N) (i32x4.shr_s (i32x4.mul (i32x4.add (i32x4.add (local.get $teNW) (local.get $teN)) (local.get $teNE)) (v128.const i32x4 7 7 7 7)) (i32.const 5))))
      ;; ((sum >> 1) - 1 + p·w) · div[sum - 1] >> 24, each lane in 64 bits.
      (local.set $q (i32x4.sub (i32x4.shr_s (local.get $S) (i32.const 1)) (v128.const i32x4 1 1 1 1)))
      (local.set $lo (i64x2.add (i64x2.add
          (i64x2.add (i64x2.extend_low_i32x4_s (local.get $q)) (i64x2.extmul_low_i32x4_s (local.get $p0) (local.get $w0)))
          (i64x2.extmul_low_i32x4_s (local.get $p1) (local.get $w1)))
        (i64x2.add (i64x2.extmul_low_i32x4_s (local.get $p2) (local.get $w2)) (i64x2.extmul_low_i32x4_s (local.get $p3) (local.get $w3)))))
      (local.set $hi (i64x2.add (i64x2.add
          (i64x2.add (i64x2.extend_high_i32x4_s (local.get $q)) (i64x2.extmul_high_i32x4_s (local.get $p0) (local.get $w0)))
          (i64x2.extmul_high_i32x4_s (local.get $p1) (local.get $w1)))
        (i64x2.add (i64x2.extmul_high_i32x4_s (local.get $p2) (local.get $w2)) (i64x2.extmul_high_i32x4_s (local.get $p3) (local.get $w3)))))
      (local.set $lo (i64x2.shr_s (i64x2.mul (local.get $lo) (i64x2.extend_low_i32x4_s (local.get $D))) (i32.const 24)))
      (local.set $hi (i64x2.shr_s (i64x2.mul (local.get $hi) (i64x2.extend_high_i32x4_s (local.get $D))) (i32.const 24)))
      (local.set $pred (i8x16.shuffle 0 1 2 3 8 9 10 11 16 17 18 19 24 25 26 27 (local.get $lo) (local.get $hi)))
      ;; Where the three errors agree in sign, the prediction is clamped to W, N and NE.
      (local.set $lo (i32x4.min_s (local.get $W) (i32x4.min_s (local.get $NE) (local.get $N))))
      (local.set $hi (i32x4.max_s (local.get $W) (i32x4.max_s (local.get $NE) (local.get $N))))
      (local.set $pred (v128.bitselect
        (i32x4.max_s (local.get $lo) (i32x4.min_s (local.get $pred) (local.get $hi)))
        (local.get $pred)
        (i32x4.le_s (v128.or (v128.xor (local.get $teN) (local.get $teW)) (v128.xor (local.get $teN) (local.get $teNW))) (v128.const i32x4 0 0 0 0))))
      (local.set $value (v128.load16x4_s (local.get $p)))
      (local.set $r (i32x4.sub (local.get $value) (i32x4.shr_s (i32x4.add (local.get $pred) (v128.const i32x4 3 3 3 3)) (i32.const 3))))
      (local.set $r (v128.xor (i32x4.shl (local.get $r) (i32.const 1)) (i32x4.shr_s (local.get $r) (i32.const 31))))
      (local.set $at (i32.add (local.get $residual) (i32.shl (local.get $i) (i32.const 2))))
      (i32.store (local.get $at) (i32x4.extract_lane 0 (local.get $r)))
      (i32.store (i32.add (local.get $at) (local.get $plane4)) (i32x4.extract_lane 1 (local.get $r)))
      (i32.store (i32.add (local.get $at) (i32.shl (local.get $plane4) (i32.const 1))) (i32x4.extract_lane 2 (local.get $r)))
      (local.set $at (i32.add (local.get $property) (i32.shl (local.get $i) (i32.const 2))))
      (i32.store (local.get $at) (i32x4.extract_lane 0 (local.get $most)))
      (i32.store (i32.add (local.get $at) (local.get $plane4)) (i32x4.extract_lane 1 (local.get $most)))
      (i32.store (i32.add (local.get $at) (i32.shl (local.get $plane4) (i32.const 1))) (i32x4.extract_lane 2 (local.get $most)))
      (if (i32.eq (local.get $lanes) (i32.const 4)) (then
        (i32.store (i32.add (i32.add (local.get $residual) (i32.shl (local.get $i) (i32.const 2))) (i32.mul (local.get $plane4) (i32.const 3))) (i32x4.extract_lane 3 (local.get $r)))
        (i32.store (i32.add (local.get $at) (i32.mul (local.get $plane4) (i32.const 3))) (i32x4.extract_lane 3 (local.get $most)))))
      (local.set $v (i32x4.shl (local.get $value) (i32.const 3)))
      (local.set $at (i32.add (local.get $cur) (i32.shl (local.get $x) (i32.const 4))))
      (v128.store (i32.add (local.get $err) (local.get $at)) (i32x4.sub (local.get $pred) (local.get $v)))
      (local.set $q (i32x4.shr_s (i32x4.add (i32x4.abs (i32x4.sub (local.get $p0) (local.get $v))) (v128.const i32x4 3 3 3 3)) (i32.const 3)))
      (v128.store (i32.add (local.get $e0) (local.get $at)) (local.get $q))
      (v128.store offset=16 (i32.add (local.get $e0) (local.get $n))
        (i32x4.add (v128.load offset=16 (i32.add (local.get $e0) (local.get $n))) (local.get $q)))
      (local.set $q (i32x4.shr_s (i32x4.add (i32x4.abs (i32x4.sub (local.get $p1) (local.get $v))) (v128.const i32x4 3 3 3 3)) (i32.const 3)))
      (v128.store (i32.add (local.get $e1) (local.get $at)) (local.get $q))
      (v128.store offset=16 (i32.add (local.get $e1) (local.get $n))
        (i32x4.add (v128.load offset=16 (i32.add (local.get $e1) (local.get $n))) (local.get $q)))
      (local.set $q (i32x4.shr_s (i32x4.add (i32x4.abs (i32x4.sub (local.get $p2) (local.get $v))) (v128.const i32x4 3 3 3 3)) (i32.const 3)))
      (v128.store (i32.add (local.get $e2) (local.get $at)) (local.get $q))
      (v128.store offset=16 (i32.add (local.get $e2) (local.get $n))
        (i32x4.add (v128.load offset=16 (i32.add (local.get $e2) (local.get $n))) (local.get $q)))
      (local.set $q (i32x4.shr_s (i32x4.add (i32x4.abs (i32x4.sub (local.get $p3) (local.get $v))) (v128.const i32x4 3 3 3 3)) (i32.const 3)))
      (v128.store (i32.add (local.get $e3) (local.get $at)) (local.get $q))
      (v128.store offset=16 (i32.add (local.get $e3) (local.get $n))
        (i32x4.add (v128.load offset=16 (i32.add (local.get $e3) (local.get $n))) (local.get $q)))
      (local.set $p (i32.add (local.get $p) (i32.const 8)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br_if $xs (i32.lt_u (local.get $x) (local.get $width))))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br_if $ys (i32.lt_u (local.get $y) (local.get $height)))))
