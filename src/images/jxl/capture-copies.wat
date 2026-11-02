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
    (result i32)
    (local $i i32) (local $h i32) (local $v i32) (local $r i32) (local $p i32) (local $links i32)
    (local $bestLen i32) (local $bestDist i32) (local $bestCost i32)
    (local $atAddr i32) (local $prevAddr i32) (local $prev i32) (local $d i32) (local $cost i32) (local $k i32)
    (local $head i64) (local $mask i32) (local $ok i32)
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
          (local.set $d (i32.sub (local.get $at) (local.get $prev)))
          (local.set $cost
            (select (i32.load8_u (i32.add (local.get $spatial) (local.get $d))) (i32.const 0)
              (i32.lt_s (local.get $d) (local.get $spatialLen))))
          (local.set $k (i32.sub (i32.sub (i32.const 31) (i32.clz (local.get $d))) (i32.const 0)))
          (local.set $cost
            (select (local.get $cost) (select (local.get $k) (i32.const 2) (i32.gt_s (local.get $k) (i32.const 2))) (local.get $cost)))
          ;; The same three values; with a copy so far, the same value at its last position, and at the one after it
          ;; unless this copy costs less (each read stays inside the arena).
          (br_if $probeN
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
      (br_if $found (i32.eqz (local.get $depth)))
      ;; The recent distances (other than W and N) whose value equals this one, as a mask, without a branch each.
      (local.set $v (i32.load16_u (local.get $atAddr)))
      (local.set $i (i32.const 0))
      (local.set $mask (i32.const 0))
      (loop $gather
        (local.set $r (i32.load (i32.add (local.get $scratch) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $ok
          (i32.and
            (i32.and (i32.gt_s (local.get $r) (i32.const 1)) (i32.ne (local.get $r) (local.get $width)))
            (i32.le_s (local.get $r) (local.get $at))))
        (local.set $mask
          (i32.or (local.get $mask)
            (i32.shl
              (i32.and (local.get $ok)
                (i32.eq (local.get $v)
                  (i32.load16_u
                    (select (i32.sub (local.get $atAddr) (i32.shl (local.get $r) (i32.const 1))) (local.get $atAddr) (local.get $ok)))))
              (local.get $i))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
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
            (local.set $d (i32.sub (local.get $at) (local.get $prev)))
            (local.set $cost
              (select (i32.load8_u (i32.add (local.get $spatial) (local.get $d))) (i32.const 0)
                (i32.lt_s (local.get $d) (local.get $spatialLen))))
            (local.set $k (i32.sub (i32.sub (i32.const 31) (i32.clz (local.get $d))) (i32.const 5)))
            (local.set $cost
              (select (local.get $cost) (select (local.get $k) (i32.const 2) (i32.gt_s (local.get $k) (i32.const 2))) (local.get $cost)))
            ;; The same three values; with a copy so far, the same value at its last position, and at the one after it
            ;; unless this copy costs less (each read stays inside the arena).
            (br_if $probeR
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
          (br $rec)))
      (local.set $h (call $copyHash (local.get $atAddr)))
      (local.set $p (i32.load (i32.add (local.get $heads) (i32.shl (local.get $h) (i32.const 2)))))
      (local.set $links (i32.const 0))
      (block $chDone
        (loop $ch
          (br_if $chDone
            (i32.or
              (i32.or (i32.lt_s (local.get $p) (i32.const 0)) (i32.ge_s (local.get $links) (local.get $depth)))
              (i32.or (i32.ge_s (i32.add (local.get $at) (local.get $bestLen)) (local.get $n)) (i32.ge_s (local.get $bestLen) (i32.const 1024)))))
              ;; Probe the chain: a copy from an earlier position of the same three values. Its tests are computed together, with one branch.
              (block $probeC
                (local.set $prevAddr (i32.add (local.get $values) (i32.shl (local.get $p) (i32.const 1))))
                (local.set $d (i32.sub (local.get $at) (local.get $p)))
                (local.set $cost
                  (select (i32.load8_u (i32.add (local.get $spatial) (local.get $d))) (i32.const 0)
                    (i32.lt_s (local.get $d) (local.get $spatialLen))))
                (local.set $k (i32.sub (i32.sub (i32.const 31) (i32.clz (local.get $d))) (i32.const 0)))
                (local.set $cost
                  (select (local.get $cost) (select (local.get $k) (i32.const 2) (i32.gt_s (local.get $k) (i32.const 2))) (local.get $cost)))
                ;; The same three values; with a copy so far, the same value at its last position, and at the one after it
                ;; unless this copy costs less (each read stays inside the arena).
                (br_if $probeC
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
    (param $outVal i32) (param $outDist i32) (param $outCtx i32)
    (result i32)
    (local $position i32) (local $copy i32) (local $from i32) (local $fromCost i32) (local $next i32) (local $count i32) (local $i i32)
    (global.set $inserted (i32.const 0))
    (if (local.get $depth) (then (memory.fill (local.get $heads) (i32.const 255) (i32.const 262144))))
    (memory.fill (local.get $scratch) (i32.const 0) (i32.const 832))
    (local.set $copy
      (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (local.get $minimum)
        (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch) (i32.const 0)))
    (local.set $from (global.get $bestDist))
    (local.set $fromCost (global.get $bestCost))
    (block $done
      (loop $loop
        (br_if $done (i32.ge_s (local.get $position) (local.get $n)))
        (if (local.get $copy)
          (then
            (local.set $next
              (if (result i32) (local.get $depth)
                (then
                  (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (local.get $minimum)
                    (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch)
                    (i32.add (local.get $position) (i32.const 1))))
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
                  (i32.add (local.get $position) (i32.const 8))))
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
            (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch) (local.get $position)))
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
