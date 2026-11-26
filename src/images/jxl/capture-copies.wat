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
  ;; Photo hints: six words per box, x/y/right/bottom, rescued, first input index. Sort by decreasing area so a
  ;; containing photograph absorbs its tiny hints in one pass. The heap compares 64-bit areas, including ties.
  (func $hintLess (param $a i32) (param $b i32) (result i32)
    (local $aa i64) (local $ba i64)
    (local.set $aa (i64.mul
      (i64.extend_i32_u (i32.sub (i32.load offset=8 (local.get $a)) (i32.load (local.get $a))))
      (i64.extend_i32_u (i32.sub (i32.load offset=12 (local.get $a)) (i32.load offset=4 (local.get $a))))))
    (local.set $ba (i64.mul
      (i64.extend_i32_u (i32.sub (i32.load offset=8 (local.get $b)) (i32.load (local.get $b))))
      (i64.extend_i32_u (i32.sub (i32.load offset=12 (local.get $b)) (i32.load offset=4 (local.get $b))))))
    (i32.or (i64.lt_u (local.get $aa) (local.get $ba))
      (i32.and (i64.eq (local.get $aa) (local.get $ba))
        (i32.gt_u (i32.load offset=20 (local.get $a)) (i32.load offset=20 (local.get $b))))))
  (func $hintSwap (param $a i32) (param $b i32)
    (local $box v128) (local $tail i64)
    (local.set $box (v128.load (local.get $a)))
    (local.set $tail (i64.load offset=16 (local.get $a)))
    (v128.store (local.get $a) (v128.load (local.get $b)))
    (i64.store offset=16 (local.get $a) (i64.load offset=16 (local.get $b)))
    (v128.store (local.get $b) (local.get $box))
    (i64.store offset=16 (local.get $b) (local.get $tail)))
  (func $hintDown (param $boxes i32) (param $count i32) (param $root i32)
    (local $child i32) (local $p i32) (local $q i32)
    (block $done
      (loop $down
        (local.set $child (i32.add (i32.shl (local.get $root) (i32.const 1)) (i32.const 1)))
        (br_if $done (i32.ge_u (local.get $child) (local.get $count)))
        (local.set $q (i32.add (local.get $boxes) (i32.mul (local.get $child) (i32.const 24))))
        (if (i32.lt_u (i32.add (local.get $child) (i32.const 1)) (local.get $count))
          (then (if (call $hintLess (i32.add (local.get $q) (i32.const 24)) (local.get $q))
            (then (local.set $child (i32.add (local.get $child) (i32.const 1)))
              (local.set $q (i32.add (local.get $q) (i32.const 24)))))))
        (local.set $p (i32.add (local.get $boxes) (i32.mul (local.get $root) (i32.const 24))))
        (br_if $done (i32.eqz (call $hintLess (local.get $q) (local.get $p))))
        (call $hintSwap (local.get $p) (local.get $q))
        (local.set $root (local.get $child))
        (br $down))))
  ;; Every hint enters once. Merged components leave by swapping the last live slot, never shifting the tail.
  ;; Revisit earlier components only if the bounding box grows: that can join a box in a previously empty corner.
  ;; Touching edges do not meet. The caller emits components in their first input index order.
  (func (export "mergePhotoHints") (param $boxes i32) (param $count i32) (param $out i32) (result i32)
    (local $i i32) (local $j i32) (local $active i32) (local $at i32) (local $p i32)
    (local $x i32) (local $y i32) (local $right i32) (local $bottom i32) (local $flags i32) (local $first i32)
    (local $qx i32) (local $qy i32) (local $qr i32) (local $qb i32) (local $qfirst i32) (local $grew i32)
    (if (i32.eqz (local.get $count)) (then (return (i32.const 0))))
    ;; A supplied box containing the final envelope joins every hint. Remember each hint that contains the
    ;; envelope so far, then compare its bounds to the final envelope: one pass, without sorting or area rounding.
    (local.set $p (local.get $boxes))
    (local.set $x (i32.load (local.get $boxes)))
    (local.set $y (i32.load offset=4 (local.get $boxes)))
    (local.set $right (i32.load offset=8 (local.get $boxes)))
    (local.set $bottom (i32.load offset=12 (local.get $boxes)))
    (local.set $flags (i32.load offset=16 (local.get $boxes)))
    (local.set $first (i32.load offset=20 (local.get $boxes)))
    (local.set $i (i32.const 1))
    (block $envelope
      (loop $bounds
        (br_if $envelope (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $at (i32.add (local.get $boxes) (i32.mul (local.get $i) (i32.const 24))))
        (local.set $qx (i32.load (local.get $at)))
        (local.set $qy (i32.load offset=4 (local.get $at)))
        (local.set $qr (i32.load offset=8 (local.get $at)))
        (local.set $qb (i32.load offset=12 (local.get $at)))
        (if (i32.and
              (i32.and (i32.le_u (local.get $qx) (local.get $x)) (i32.le_u (local.get $qy) (local.get $y)))
              (i32.and (i32.ge_u (local.get $qr) (local.get $right)) (i32.ge_u (local.get $qb) (local.get $bottom))))
          (then (local.set $p (local.get $at))))
        (local.set $x (select (local.get $qx) (local.get $x) (i32.lt_u (local.get $qx) (local.get $x))))
        (local.set $y (select (local.get $qy) (local.get $y) (i32.lt_u (local.get $qy) (local.get $y))))
        (local.set $right (select (local.get $qr) (local.get $right) (i32.gt_u (local.get $qr) (local.get $right))))
        (local.set $bottom (select (local.get $qb) (local.get $bottom) (i32.gt_u (local.get $qb) (local.get $bottom))))
        (local.set $flags (i32.or (local.get $flags) (i32.load offset=16 (local.get $at))))
        (local.set $qfirst (i32.load offset=20 (local.get $at)))
        (local.set $first (select (local.get $qfirst) (local.get $first) (i32.lt_u (local.get $qfirst) (local.get $first))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $bounds)))
    (if (i32.and
          (i32.and (i32.eq (i32.load (local.get $p)) (local.get $x)) (i32.eq (i32.load offset=4 (local.get $p)) (local.get $y)))
          (i32.and (i32.eq (i32.load offset=8 (local.get $p)) (local.get $right)) (i32.eq (i32.load offset=12 (local.get $p)) (local.get $bottom))))
      (then
        (memory.copy (local.get $out) (local.get $p) (i32.const 24))
        (i32.store offset=16 (local.get $out) (local.get $flags))
        (i32.store offset=20 (local.get $out) (local.get $first))
        (return (i32.const 1))))
    (local.set $i (i32.shr_u (local.get $count) (i32.const 1)))
    (block $heapBuilt
      (loop $heap
        (br_if $heapBuilt (i32.eqz (local.get $i)))
        (local.set $i (i32.sub (local.get $i) (i32.const 1)))
        (call $hintDown (local.get $boxes) (local.get $count) (local.get $i))
        (br $heap)))
    (local.set $i (local.get $count))
    (block $sorted
      (loop $sort
        (br_if $sorted (i32.le_u (local.get $i) (i32.const 1)))
        (local.set $i (i32.sub (local.get $i) (i32.const 1)))
        (call $hintSwap (local.get $boxes) (i32.add (local.get $boxes) (i32.mul (local.get $i) (i32.const 24))))
        (call $hintDown (local.get $boxes) (local.get $i) (i32.const 0))
        (br $sort)))
    (local.set $i (i32.const 0))
    (block $done
      (loop $hints
        (br_if $done (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $at (i32.add (local.get $boxes) (i32.mul (local.get $i) (i32.const 24))))
        (local.set $x (i32.load (local.get $at)))
        (local.set $y (i32.load offset=4 (local.get $at)))
        (local.set $right (i32.load offset=8 (local.get $at)))
        (local.set $bottom (i32.load offset=12 (local.get $at)))
        (local.set $flags (i32.load offset=16 (local.get $at)))
        (local.set $first (i32.load offset=20 (local.get $at)))
        (local.set $j (i32.const 0))
        (block $joined
          (loop $join
            (br_if $joined (i32.ge_u (local.get $j) (local.get $active)))
            (local.set $p (i32.add (local.get $out) (i32.mul (local.get $j) (i32.const 24))))
            (local.set $qx (i32.load (local.get $p)))
            (local.set $qy (i32.load offset=4 (local.get $p)))
            (local.set $qr (i32.load offset=8 (local.get $p)))
            (local.set $qb (i32.load offset=12 (local.get $p)))
            (if (i32.and
                  (i32.and (i32.lt_u (local.get $x) (local.get $qr)) (i32.lt_u (local.get $qx) (local.get $right)))
                  (i32.and (i32.lt_u (local.get $y) (local.get $qb)) (i32.lt_u (local.get $qy) (local.get $bottom))))
              (then
                (local.set $grew (i32.or
                  (i32.or (i32.lt_u (local.get $qx) (local.get $x)) (i32.lt_u (local.get $qy) (local.get $y)))
                  (i32.or (i32.gt_u (local.get $qr) (local.get $right)) (i32.gt_u (local.get $qb) (local.get $bottom)))))
                (local.set $x (select (local.get $qx) (local.get $x) (i32.lt_u (local.get $qx) (local.get $x))))
                (local.set $y (select (local.get $qy) (local.get $y) (i32.lt_u (local.get $qy) (local.get $y))))
                (local.set $right (select (local.get $qr) (local.get $right) (i32.gt_u (local.get $qr) (local.get $right))))
                (local.set $bottom (select (local.get $qb) (local.get $bottom) (i32.gt_u (local.get $qb) (local.get $bottom))))
                (local.set $flags (i32.or (local.get $flags) (i32.load offset=16 (local.get $p))))
                (local.set $qfirst (i32.load offset=20 (local.get $p)))
                (local.set $first (select (local.get $qfirst) (local.get $first) (i32.lt_u (local.get $qfirst) (local.get $first))))
                (local.set $active (i32.sub (local.get $active) (i32.const 1)))
                (memory.copy (local.get $p)
                  (i32.add (local.get $out) (i32.mul (local.get $active) (i32.const 24))) (i32.const 24))
                (if (local.get $grew) (then (local.set $j (i32.const 0)))))
              (else (local.set $j (i32.add (local.get $j) (i32.const 1)))))
            (br $join)))
        (local.set $p (i32.add (local.get $out) (i32.mul (local.get $active) (i32.const 24))))
        (i32.store (local.get $p) (local.get $x))
        (i32.store offset=4 (local.get $p) (local.get $y))
        (i32.store offset=8 (local.get $p) (local.get $right))
        (i32.store offset=12 (local.get $p) (local.get $bottom))
        (i32.store offset=16 (local.get $p) (local.get $flags))
        (i32.store offset=20 (local.get $p) (local.get $first))
        (local.set $active (i32.add (local.get $active) (i32.const 1)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $hints)))
    (local.get $active))

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
    ;; A token rises with its value's exponent, not within it (lsb keeps a value's low bits): the largest token of the
    ;; largest value's exponent (every bit below its top set) bounds what is counted (or the alphabet), so only that much
    ;; of the counts and the bitset is cleared.
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
          (local.set $below (i32.sub (i32.shl (i32.const 1) (local.get $e)) (i32.const 1)))
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

  ;; 1-D byte greedy longest-match LZ77 (context-map.mjs mapParseFlat), reached through copies when $width == 0.
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

  ;; capture-modular-stream.mjs's writeChannels over one channel's pieces (4-byte `values` and `distances`, 1-byte
  ;; `contexts`): each literal under `small` counted into `table` (`small` 4-byte counts a context), each literal into
  ;; `literals` and each copy into `copies` (4 bytes a context). Every other literal's key ((`key` + context) << 20, plus
  ;; its value) goes to `larges`, every copy's key to `lengths` and its distance to `dists`, in stream order; `state`
  ;; takes how many larges and how many copies (two 4-byte counts).
  (func (export "pieces")
    (param $values i32) (param $distances i32) (param $contexts i32) (param $count i32) (param $small i32)
    (param $table i32) (param $literals i32) (param $copies i32) (param $key i32) (param $larges i32) (param $lengths i32)
    (param $dists i32) (param $state i32)
    (local $k i32) (local $v i32) (local $d i32) (local $c i32) (local $a i32) (local $nl i32) (local $nc i32)
    (block $done (loop $each
      (br_if $done (i32.ge_s (local.get $k) (local.get $count)))
      (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2)))))
      (local.set $d (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2)))))
      (local.set $c (i32.load8_u (i32.add (local.get $contexts) (local.get $k))))
      (if (local.get $d)
        (then
          (i32.store (i32.add (local.get $lengths) (i32.shl (local.get $nc) (i32.const 2)))
            (i32.add (i32.shl (i32.add (local.get $key) (local.get $c)) (i32.const 20)) (local.get $v)))
          (i32.store (i32.add (local.get $dists) (i32.shl (local.get $nc) (i32.const 2))) (local.get $d))
          (local.set $nc (i32.add (local.get $nc) (i32.const 1)))
          (local.set $a (i32.add (local.get $copies) (i32.shl (local.get $c) (i32.const 2))))
          (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1))))
        (else
          (local.set $a (i32.add (local.get $literals) (i32.shl (local.get $c) (i32.const 2))))
          (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
          (if (i32.lt_u (local.get $v) (local.get $small))
            (then
              (local.set $a (i32.add (local.get $table) (i32.shl (i32.add (i32.mul (local.get $c) (local.get $small)) (local.get $v)) (i32.const 2))))
              (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1))))
            (else
              (i32.store (i32.add (local.get $larges) (i32.shl (local.get $nl) (i32.const 2)))
                (i32.add (i32.shl (i32.add (local.get $key) (local.get $c)) (i32.const 20)) (local.get $v)))
              (local.set $nl (i32.add (local.get $nl) (i32.const 1)))))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (br $each)))
    (i32.store (local.get $state) (local.get $nl))
    (i32.store offset=4 (local.get $state) (local.get $nc)))

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
(func (param $plane i32) (param $n i32) (param $offset i32) (param $m i32) (param $out i32)
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
(func $avg2_64 (param $a i64) (param $b i64) (result i64)
  (i64.shr_s (i64.add (i64.add (local.get $a) (local.get $b)) (i64.extend_i32_u (i64.gt_s (local.get $a) (local.get $b)))) (i64.const 1)))
(func $tendency64 (param $B i64) (param $a i64) (param $n i64) (result i64)
  (local $sign i64) (local $diff i64)
  (local.set $sign (if (result i64) (i32.and (i64.ge_s (local.get $B) (local.get $a)) (i64.ge_s (local.get $a) (local.get $n)))
    (then (i64.const 1))
    (else (if (result i64) (i32.and (i64.le_s (local.get $B) (local.get $a)) (i64.le_s (local.get $a) (local.get $n)))
      (then (i64.const -1)) (else (i64.const 0))))))
  (if (i64.eqz (local.get $sign)) (then (return (i64.const 0))))
  (local.set $B (i64.mul (local.get $B) (local.get $sign)))
  (local.set $a (i64.mul (local.get $a) (local.get $sign)))
  (local.set $n (i64.mul (local.get $n) (local.get $sign)))
  (local.set $diff (i64.div_s (i64.add (i64.sub (i64.sub (i64.shl (local.get $B) (i64.const 2)) (i64.mul (local.get $n) (i64.const 3))) (local.get $a)) (i64.const 6)) (i64.const 12)))
  (if (i64.gt_s (i64.sub (local.get $diff) (i64.and (local.get $diff) (i64.const 1))) (i64.shl (i64.sub (local.get $B) (local.get $a)) (i64.const 1)))
    (then (local.set $diff (i64.add (i64.shl (i64.sub (local.get $B) (local.get $a)) (i64.const 1)) (i64.const 1)))))
  (if (i64.gt_s (i64.add (local.get $diff) (i64.and (local.get $diff) (i64.const 1))) (i64.shl (i64.sub (local.get $a) (local.get $n)) (i64.const 1)))
    (then (local.set $diff (i64.shl (i64.sub (local.get $a) (local.get $n)) (i64.const 1)))))
  (i64.mul (local.get $sign) (local.get $diff)))
(func $tendency32 (param $prev i32) (param $avg i32) (param $next i32) (result i32)
  (local $desc i32) (local $asc i32) (local $val i32) (local $first i32) (local $second i32)
  (local.set $desc (i32.and (i32.ge_s (local.get $prev) (local.get $avg)) (i32.ge_s (local.get $avg) (local.get $next))))
  (local.set $asc (i32.and (i32.le_s (local.get $prev) (local.get $avg)) (i32.le_s (local.get $avg) (local.get $next))))
  (if (i32.eqz (i32.or (local.get $desc) (local.get $asc))) (then (return (i32.const 0))))
  (local.set $val (i32.div_s
    (i32.add (i32.sub (i32.sub (i32.shl (local.get $prev) (i32.const 2)) (i32.mul (local.get $next) (i32.const 3))) (local.get $avg))
      (select (i32.const 6) (i32.const -6) (local.get $desc)))
    (i32.const 12)))
  (local.set $first (i32.shl (i32.sub (local.get $prev) (local.get $avg)) (i32.const 1)))
  (local.set $second (i32.shl (i32.sub (local.get $avg) (local.get $next)) (i32.const 1)))
  (if (local.get $desc)
    (then
      (if (i32.gt_s (i32.sub (local.get $val) (i32.and (local.get $val) (i32.const 1))) (local.get $first))
        (then (local.set $val (i32.add (local.get $first) (i32.const 1)))))
      (if (i32.gt_s (i32.add (local.get $val) (i32.and (local.get $val) (i32.const 1))) (local.get $second))
        (then (local.set $val (local.get $second)))))
    (else
      (if (i32.lt_s (i32.add (local.get $val) (i32.and (local.get $val) (i32.const 1))) (local.get $first))
        (then (local.set $val (i32.sub (local.get $first) (i32.const 1)))))
      (if (i32.lt_s (i32.sub (local.get $val) (i32.and (local.get $val) (i32.const 1))) (local.get $second))
        (then (local.set $val (local.get $second))))))
  (local.get $val))
(func (export "squeezeStep") (param $p i32) (param $w i32) (param $h i32) (param $horizontal i32) (param $out i32) (param $res i32) (param $wide i32) (result i32)
  (local $n i32) (local $low i32) (local $high i32) (local $ow i32) (local $oh i32) (local $rw i32) (local $step i32)
  (local $x i32) (local $y i32) (local $pos i32) (local $at i32) (local $A i32) (local $B i32) (local $avg i32) (local $next i32) (local $prev i32)
  (local $hasWide i32) (local $r32 i32) (local $a64 i64) (local $b64 i64) (local $avg64 i64) (local $next64 i64) (local $prev64 i64)
  (local $diff64 i64) (local $tend64 i64) (local $res64 i64)
  (local.set $n (select (local.get $w) (local.get $h) (local.get $horizontal)))
  (local.set $low (i32.shr_u (i32.add (local.get $n) (i32.const 1)) (i32.const 1)))
  (local.set $high (i32.sub (local.get $n) (local.get $low)))
  (local.set $ow (select (local.get $low) (local.get $w) (local.get $horizontal)))
  (local.set $oh (select (local.get $h) (local.get $low) (local.get $horizontal)))
  (local.set $rw (select (local.get $high) (local.get $w) (local.get $horizontal)))
  (local.set $step (select (i32.const 1) (local.get $w) (local.get $horizontal)))
  (if (local.get $wide)
    (then
      (block $wRows (loop $wEachRow
        (br_if $wRows (i32.ge_u (local.get $y) (local.get $oh)))
        (local.set $x (i32.const 0))
        (block $wCols (loop $wEachCol
          (br_if $wCols (i32.ge_u (local.get $x) (local.get $ow)))
          (local.set $pos (select (local.get $x) (local.get $y) (local.get $horizontal)))
          (local.set $at (select (i32.add (i32.mul (local.get $y) (local.get $w)) (i32.shl (local.get $x) (i32.const 1)))
            (i32.add (i32.mul (i32.shl (local.get $y) (i32.const 1)) (local.get $w)) (local.get $x)) (local.get $horizontal)))
          (if (i32.eq (local.get $pos) (local.get $high))
            (then
              (local.set $A (i32.load (i32.add (local.get $p) (i32.shl (local.get $at) (i32.const 2)))))
              (i32.store (i32.add (local.get $out) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $ow)) (local.get $x)) (i32.const 2))) (local.get $A))
              (if (i32.or (i32.lt_s (local.get $A) (i32.const -32768)) (i32.gt_s (local.get $A) (i32.const 32767)))
                (then (local.set $hasWide (i32.const 1)))))
            (else
              (local.set $a64 (i64.extend_i32_s (i32.load (i32.add (local.get $p) (i32.shl (local.get $at) (i32.const 2))))))
              (local.set $b64 (i64.extend_i32_s (i32.load (i32.add (local.get $p) (i32.shl (i32.add (local.get $at) (local.get $step)) (i32.const 2))))))
              (local.set $avg64 (call $avg2_64 (local.get $a64) (local.get $b64)))
              (local.set $diff64 (i64.sub (local.get $a64) (local.get $b64)))
              (local.set $next64
                (if (result i64) (i32.lt_s (i32.add (local.get $pos) (i32.const 1)) (local.get $high))
                  (then (call $avg2_64
                    (i64.extend_i32_s (i32.load (i32.add (local.get $p) (i32.shl (i32.add (local.get $at) (i32.shl (local.get $step) (i32.const 1))) (i32.const 2)))))
                    (i64.extend_i32_s (i32.load (i32.add (local.get $p) (i32.shl (i32.add (local.get $at) (i32.mul (local.get $step) (i32.const 3))) (i32.const 2)))))))
                  (else (if (result i64) (i32.and (local.get $n) (i32.const 1))
                    (then (i64.extend_i32_s (i32.load (i32.add (local.get $p) (i32.shl (i32.add (local.get $at) (i32.shl (local.get $step) (i32.const 1))) (i32.const 2))))))
                    (else (local.get $avg64))))))
              (local.set $prev64 (if (result i64) (local.get $pos)
                (then (i64.extend_i32_s (i32.load (i32.add (local.get $p) (i32.shl (i32.sub (local.get $at) (local.get $step)) (i32.const 2))))))
                (else (local.get $avg64))))
              (local.set $tend64 (call $tendency64 (local.get $prev64) (local.get $avg64) (local.get $next64)))
              (if (i64.ne (local.get $tend64) (i64.extend_i32_s (call $tendency32
                    (i32.wrap_i64 (local.get $prev64)) (i32.wrap_i64 (local.get $avg64)) (i32.wrap_i64 (local.get $next64)))))
                (then (return (i32.const -1))))
              (local.set $res64 (i64.sub (local.get $diff64) (local.get $tend64)))
              (if (i32.or
                    (i32.or (i64.lt_s (local.get $diff64) (i64.const -2147483648)) (i64.gt_s (local.get $diff64) (i64.const 2147483647)))
                    (i32.or (i64.lt_s (local.get $res64) (i64.const -2147483648)) (i64.gt_s (local.get $res64) (i64.const 2147483647))))
                (then (return (i32.const -1))))
              (local.set $avg (i32.wrap_i64 (local.get $avg64)))
              (local.set $r32 (i32.wrap_i64 (local.get $res64)))
              (i32.store (i32.add (local.get $out) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $ow)) (local.get $x)) (i32.const 2))) (local.get $avg))
              (i32.store (i32.add (local.get $res) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $rw)) (local.get $x)) (i32.const 2))) (local.get $r32))
              (if (i32.or
                    (i32.or (i32.lt_s (local.get $avg) (i32.const -32768)) (i32.gt_s (local.get $avg) (i32.const 32767)))
                    (i32.or (i32.lt_s (local.get $r32) (i32.const -32768)) (i32.gt_s (local.get $r32) (i32.const 32767))))
                (then (local.set $hasWide (i32.const 1))))))
          (local.set $x (i32.add (local.get $x) (i32.const 1))) (br $wEachCol)))
        (local.set $y (i32.add (local.get $y) (i32.const 1))) (br $wEachRow)))
      (return (local.get $hasWide))))
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
    (local.set $y (i32.add (local.get $y) (i32.const 1))) (br $eachRow)))
  (i32.const 0))
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
;; Whether pixel $i is hidden: `exact`'s byte, or with $clear its own alpha being 0.
(func $hidden (param $rgba i32) (param $exact i32) (param $i i32) (param $clear i32) (result i32)
  (if (result i32) (local.get $clear)
    (then (i32.eqz (i32.load8_u offset=3 (i32.add (local.get $rgba) (i32.shl (local.get $i) (i32.const 2))))))
    (else (i32.load8_u (i32.add (local.get $exact) (local.get $i))))))
(func $fillCore (param $rgba i32) (param $w i32) (param $h i32) (param $exact i32) (param $nearest i32) (param $column i32) (param $clear i32) (result i32)
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
      (if (i32.eqz (call $hidden (local.get $rgba) (local.get $exact) (local.get $i) (local.get $clear)))
        (then
          (local.set $last (local.get $x))
          (i32.store (i32.add (local.get $column) (i32.shl (local.get $x) (i32.const 2))) (local.get $y))
          (if (i32.eqz (local.get $clear)) (then (i32.store8 offset=3 (i32.add (local.get $rgba) (i32.shl (local.get $i) (i32.const 2))) (i32.const 255)))))
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
      (if (i32.eqz (call $hidden (local.get $rgba) (local.get $exact) (local.get $i) (local.get $clear)))
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
      (if (call $hidden (local.get $rgba) (local.get $exact) (local.get $i) (local.get $clear))
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
          (if (i32.eqz (local.get $clear)) (then (i32.store8 offset=3 (i32.add (local.get $rgba) (local.get $p)) (i32.const 0))))))
      (local.set $x (i32.add (local.get $x) (i32.const 1))) (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $cols3)))
    (local.set $y (i32.add (local.get $y) (i32.const 1))) (br $rows3)))
  (local.get $m))
(func (export "fillHoles") (param $rgba i32) (param $w i32) (param $h i32) (param $exact i32) (param $nearest i32) (param $column i32)
  (drop (call $fillFlat (local.get $rgba) (local.get $w) (local.get $h) (local.get $exact) (local.get $nearest) (local.get $column) (i32.const 0))))
;; fillHoles for a lossy picture's colour under alpha 0 (rapier-jxl, TR1): the pixels of alpha 0 are the hidden ones, `exact`
;; is unused, and alpha stays as it is. Their colour becomes the nearest visible pixels' along the row and column; the result
;; is how many pixels were hidden.
;; An aligned 8 x 8 block of pixels at $at (pixel index) whose alpha is all 0 becomes its mean colour: no AC for the DCT to code.
(func $flatBlock (param $rgba i32) (param $w i32) (param $at i32)
  (local $y i32) (local $x i32) (local $p i32) (local $r i32) (local $g i32) (local $b i32) (local $row i32)
  (block $summed (loop $rows
    (br_if $summed (i32.ge_u (local.get $y) (i32.const 8)))
    (local.set $row (i32.add (local.get $rgba) (i32.shl (i32.add (local.get $at) (i32.mul (local.get $y) (local.get $w))) (i32.const 2))))
    (local.set $p (local.get $row)) (local.set $x (i32.const 0))
    (loop $cols
      (if (i32.load8_u offset=3 (local.get $p)) (then (return)))
      (local.set $r (i32.add (local.get $r) (i32.load8_u (local.get $p))))
      (local.set $g (i32.add (local.get $g) (i32.load8_u offset=1 (local.get $p))))
      (local.set $b (i32.add (local.get $b) (i32.load8_u offset=2 (local.get $p))))
      (local.set $p (i32.add (local.get $p) (i32.const 4)))
      (br_if $cols (i32.lt_u (local.tee $x (i32.add (local.get $x) (i32.const 1))) (i32.const 8))))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $rows)))
  (local.set $r (i32.shr_u (i32.add (local.get $r) (i32.const 32)) (i32.const 6)))
  (local.set $g (i32.shr_u (i32.add (local.get $g) (i32.const 32)) (i32.const 6)))
  (local.set $b (i32.shr_u (i32.add (local.get $b) (i32.const 32)) (i32.const 6)))
  (local.set $y (i32.const 0))
  (block $stored (loop $rows2
    (br_if $stored (i32.ge_u (local.get $y) (i32.const 8)))
    (local.set $p (i32.add (local.get $rgba) (i32.shl (i32.add (local.get $at) (i32.mul (local.get $y) (local.get $w))) (i32.const 2))))
    (local.set $x (i32.const 0))
    (loop $cols2
      (i32.store8 (local.get $p) (local.get $r))
      (i32.store8 offset=1 (local.get $p) (local.get $g))
      (i32.store8 offset=2 (local.get $p) (local.get $b))
      (local.set $p (i32.add (local.get $p) (i32.const 4)))
      (br_if $cols2 (i32.lt_u (local.tee $x (i32.add (local.get $x) (i32.const 1))) (i32.const 8))))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $rows2))))
;; Whether the $bw x $bh block at $at (pixel index) holds a pixel whose alpha is not 0.
(func $blockSeen (param $rgba i32) (param $w i32) (param $at i32) (param $bw i32) (param $bh i32) (result i32)
  (local $y i32) (local $x i32) (local $p i32)
  (block $none (loop $rows
    (br_if $none (i32.ge_u (local.get $y) (local.get $bh)))
    (local.set $p (i32.add (local.get $rgba) (i32.shl (i32.add (local.get $at) (i32.mul (local.get $y) (local.get $w))) (i32.const 2))))
    (local.set $x (i32.const 0))
    (loop $cols
      (if (i32.load8_u offset=3 (local.get $p)) (then (return (i32.const 1))))
      (local.set $p (i32.add (local.get $p) (i32.const 4)))
      (br_if $cols (i32.lt_u (local.tee $x (i32.add (local.get $x) (i32.const 1))) (local.get $bw))))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $rows)))
  (i32.const 0))
;; After the nearest-visible fill, every 8 x 8 block of the picture's grid (edge blocks too) that holds no visible pixel takes one
;; colour: the mean of the filled colour under alpha 0 inside the blocks that do. One colour leaves no step
;; between empty blocks for the DCT to code: agassiz at 1200 px, effort 3, 5 to 9% smaller than each empty block at its own mean,
;; the stickers of hidden-color.test.mjs 8 to 24%, no picture larger by over 0.1%. Where no block with a visible pixel holds a
;; hidden one, each empty whole block keeps its own mean ($flatBlock). A band of rows (capture-kernels.mjs) takes its own mean.
;; fillHoles takes the same blocks: fillCore leaves its hidden pixels (under `exact`) at alpha 0.
(func (export "fillClear") (param $rgba i32) (param $w i32) (param $h i32) (param $nearest i32) (param $column i32) (result i32)
  (call $fillFlat (local.get $rgba) (local.get $w) (local.get $h) (i32.const 0) (local.get $nearest) (local.get $column) (i32.const 1)))
(func $fillFlat (param $rgba i32) (param $w i32) (param $h i32) (param $exact i32) (param $nearest i32) (param $column i32) (param $clear i32) (result i32)
  (local $m i32) (local $bx i32) (local $by i32) (local $bw i32) (local $bh i32) (local $at i32) (local $pass i32)
  (local $y i32) (local $x i32) (local $p i32) (local $n i64) (local $r i64) (local $g i64) (local $b i64) (local $seen i32)
  (local.set $m (call $fillCore (local.get $rgba) (local.get $w) (local.get $h) (local.get $exact) (local.get $nearest) (local.get $column) (local.get $clear)))
  (if (i32.eqz (local.get $m)) (then (return (i32.const 0))))
  ;; Pass 0 sums the hidden colour inside blocks with a visible pixel; pass 1 paints the blocks without one.
  (block $passes (loop $passLoop
    (br_if $passes (i32.gt_u (local.get $pass) (i32.const 1)))
    (if (i32.eq (local.get $pass) (i32.const 1)) (then
      (br_if $passes (i64.eqz (local.get $n)))
      (local.set $r (i64.div_u (i64.add (local.get $r) (i64.shr_u (local.get $n) (i64.const 1))) (local.get $n)))
      (local.set $g (i64.div_u (i64.add (local.get $g) (i64.shr_u (local.get $n) (i64.const 1))) (local.get $n)))
      (local.set $b (i64.div_u (i64.add (local.get $b) (i64.shr_u (local.get $n) (i64.const 1))) (local.get $n)))))
    (local.set $by (i32.const 0))
    (block $rowsDone (loop $blockRows2
      (br_if $rowsDone (i32.ge_u (local.get $by) (local.get $h)))
      (local.set $bh (select (i32.const 8) (i32.sub (local.get $h) (local.get $by)) (i32.le_u (i32.add (local.get $by) (i32.const 8)) (local.get $h))))
      (local.set $bx (i32.const 0))
      (block $colsDone (loop $blockCols2
        (br_if $colsDone (i32.ge_u (local.get $bx) (local.get $w)))
        (local.set $bw (select (i32.const 8) (i32.sub (local.get $w) (local.get $bx)) (i32.le_u (i32.add (local.get $bx) (i32.const 8)) (local.get $w))))
        (local.set $at (i32.add (i32.mul (local.get $by) (local.get $w)) (local.get $bx)))
        (local.set $seen (call $blockSeen (local.get $rgba) (local.get $w) (local.get $at) (local.get $bw) (local.get $bh)))
        (if (i32.eq (local.get $seen) (i32.eqz (local.get $pass))) (then
          (local.set $y (i32.const 0))
          (block $pxDone (loop $pxRows
            (br_if $pxDone (i32.ge_u (local.get $y) (local.get $bh)))
            (local.set $p (i32.add (local.get $rgba) (i32.shl (i32.add (local.get $at) (i32.mul (local.get $y) (local.get $w))) (i32.const 2))))
            (local.set $x (i32.const 0))
            (loop $pxCols
              (if (local.get $pass)
                (then
                  (i32.store8 (local.get $p) (i32.wrap_i64 (local.get $r)))
                  (i32.store8 offset=1 (local.get $p) (i32.wrap_i64 (local.get $g)))
                  (i32.store8 offset=2 (local.get $p) (i32.wrap_i64 (local.get $b))))
                (else (if (i32.eqz (i32.load8_u offset=3 (local.get $p))) (then
                  (local.set $n (i64.add (local.get $n) (i64.const 1)))
                  (local.set $r (i64.add (local.get $r) (i64.extend_i32_u (i32.load8_u (local.get $p)))))
                  (local.set $g (i64.add (local.get $g) (i64.extend_i32_u (i32.load8_u offset=1 (local.get $p)))))
                  (local.set $b (i64.add (local.get $b) (i64.extend_i32_u (i32.load8_u offset=2 (local.get $p)))))))))
              (local.set $p (i32.add (local.get $p) (i32.const 4)))
              (br_if $pxCols (i32.lt_u (local.tee $x (i32.add (local.get $x) (i32.const 1))) (local.get $bw))))
            (local.set $y (i32.add (local.get $y) (i32.const 1)))
            (br $pxRows)))))
        (local.set $bx (i32.add (local.get $bx) (i32.const 8)))
        (br $blockCols2)))
      (local.set $by (i32.add (local.get $by) (i32.const 8)))
      (br $blockRows2)))
    (local.set $pass (i32.add (local.get $pass) (i32.const 1)))
    (br $passLoop)))
  (if (i64.eqz (local.get $n)) (then
    (block $done (loop $blockRows
      (br_if $done (i32.gt_u (i32.add (local.get $by) (i32.const 8)) (local.get $h)))
      (local.set $bx (i32.const 0))
      (block $rowDone (loop $blockCols
        (br_if $rowDone (i32.gt_u (i32.add (local.get $bx) (i32.const 8)) (local.get $w)))
        (call $flatBlock (local.get $rgba) (local.get $w) (i32.add (i32.mul (local.get $by) (local.get $w)) (local.get $bx)))
        (local.set $bx (i32.add (local.get $bx) (i32.const 8)))
        (br $blockCols)))
      (local.set $by (i32.add (local.get $by) (i32.const 8)))
      (br $blockRows)))))
  (local.get $m))

;; composeOver (TR1, the look of a picture with alpha): $dst's colour over the grey $bg by $src's alpha, alpha 255, for $n pixels
;; (4 bytes a pixel each): round(($c * $a + $bg * (255 - $a)) / 255), the 8-bit source-over of CSS and of canvas.
(func (export "composeOver") (param $dst i32) (param $src i32) (param $n i32) (param $bg i32)
  (local $i i32) (local $a i32) (local $c i32) (local $p i32)
  (block $done (loop $pixels
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $p (i32.shl (local.get $i) (i32.const 2)))
    (local.set $a (i32.load8_u offset=3 (i32.add (local.get $src) (local.get $p))))
    (local.set $c (i32.const 0))
    (loop $channels
      (i32.store8 (i32.add (local.get $dst) (i32.add (local.get $p) (local.get $c)))
        (i32.div_u (i32.add (i32.shl (i32.add
          (i32.mul (i32.load8_u (i32.add (local.get $dst) (i32.add (local.get $p) (local.get $c)))) (local.get $a))
          (i32.mul (local.get $bg) (i32.sub (i32.const 255) (local.get $a)))) (i32.const 1)) (i32.const 255)) (i32.const 510)))
      (local.set $c (i32.add (local.get $c) (i32.const 1)))
      (br_if $channels (i32.lt_u (local.get $c) (i32.const 3))))
    (i32.store8 offset=3 (i32.add (local.get $dst) (local.get $p)) (i32.const 255))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $pixels))))

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
;; weighted4's and gradient4's input: the int16 planes at $src, $n samples each, $n apart (lane c at $src + c * $n * 2,
;; present where bit c of $present is set, else zero), written interleaved at $dst (sample i's lanes at $dst + i * 8).
(func (export "interleave4") (param $src i32) (param $n i32) (param $present i32) (param $dst i32)
  (local $i i32) (local $c i32) (local $at i32) (local $to i32) (local $step i32)
  (local $a v128) (local $b v128) (local $cv v128) (local $d v128) (local $ab v128) (local $cd v128) (local $ab2 v128) (local $cd2 v128)
  (local.set $step (i32.shl (local.get $n) (i32.const 1)))
  (block $done (loop $eight
    (br_if $done (i32.gt_u (i32.add (local.get $i) (i32.const 8)) (local.get $n)))
    (local.set $at (i32.add (local.get $src) (i32.shl (local.get $i) (i32.const 1))))
    (local.set $a (if (result v128) (i32.and (local.get $present) (i32.const 1)) (then (v128.load (local.get $at))) (else (v128.const i32x4 0 0 0 0))))
    (local.set $at (i32.add (local.get $at) (local.get $step)))
    (local.set $b (if (result v128) (i32.and (local.get $present) (i32.const 2)) (then (v128.load (local.get $at))) (else (v128.const i32x4 0 0 0 0))))
    (local.set $at (i32.add (local.get $at) (local.get $step)))
    (local.set $cv (if (result v128) (i32.and (local.get $present) (i32.const 4)) (then (v128.load (local.get $at))) (else (v128.const i32x4 0 0 0 0))))
    (local.set $at (i32.add (local.get $at) (local.get $step)))
    (local.set $d (if (result v128) (i32.and (local.get $present) (i32.const 8)) (then (v128.load (local.get $at))) (else (v128.const i32x4 0 0 0 0))))
    ;; a0 b0 a1 b1 a2 b2 a3 b3 | c0 d0 ... then their 32-bit pairs: a0 b0 c0 d0 a1 b1 c1 d1 ...
    (local.set $ab (i8x16.shuffle 0 1 16 17 2 3 18 19 4 5 20 21 6 7 22 23 (local.get $a) (local.get $b)))
    (local.set $ab2 (i8x16.shuffle 8 9 24 25 10 11 26 27 12 13 28 29 14 15 30 31 (local.get $a) (local.get $b)))
    (local.set $cd (i8x16.shuffle 0 1 16 17 2 3 18 19 4 5 20 21 6 7 22 23 (local.get $cv) (local.get $d)))
    (local.set $cd2 (i8x16.shuffle 8 9 24 25 10 11 26 27 12 13 28 29 14 15 30 31 (local.get $cv) (local.get $d)))
    (local.set $to (i32.add (local.get $dst) (i32.shl (local.get $i) (i32.const 3))))
    (v128.store (local.get $to) (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23 (local.get $ab) (local.get $cd)))
    (v128.store offset=16 (local.get $to) (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31 (local.get $ab) (local.get $cd)))
    (v128.store offset=32 (local.get $to) (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23 (local.get $ab2) (local.get $cd2)))
    (v128.store offset=48 (local.get $to) (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31 (local.get $ab2) (local.get $cd2)))
    (local.set $i (i32.add (local.get $i) (i32.const 8)))
    (br $eight)))
  (block $end (loop $each
    (br_if $end (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $c (i32.const 0))
    (loop $lanes
      (i32.store16 (i32.add (i32.add (local.get $dst) (i32.shl (local.get $i) (i32.const 3))) (i32.shl (local.get $c) (i32.const 1)))
        (if (result i32) (i32.and (local.get $present) (i32.shl (i32.const 1) (local.get $c)))
          (then (i32.load16_u (i32.add (local.get $src) (i32.add (i32.mul (local.get $c) (local.get $step)) (i32.shl (local.get $i) (i32.const 1))))))
          (else (i32.const 0))))
      (local.set $c (i32.add (local.get $c) (i32.const 1)))
      (br_if $lanes (i32.lt_u (local.get $c) (i32.const 4))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each))))

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

;; capture-kernels.mjs captureTokens: each code a u16 at `codes` (`dcodes`) and its length a byte at `codeLens` (`dLens`), by symbol.
(func (export "captureTokens")
  (param $values i32) (param $distances i32) (param $contexts i32) (param $from i32) (param $count i32) (param $hmap i32)
  (param $fast i32) (param $fastLen i32) (param $syms i32) (param $codes i32) (param $codeLens i32) (param $configs i32) (param $lengthConfig i32)
  (param $distanceConfig i32) (param $dcodes i32) (param $dLens i32) (param $minSymbol i32) (param $spatial i32) (param $sLen i32)
  (param $sCodes i32) (param $out i32) (param $limit i32) (param $state i32) (result i32)
  (local $k i32) (local $h i32) (local $v i32) (local $d i32) (local $t i64) (local $e i32) (local $len i32)
  (local $bits i64) (local $res i64) (local $pending i32) (local $adv i32) (local $cb i32) (local $lb i32)
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
          ;; A literal under 512: its code and raw bits ($fast, u32) and their length ($fastLen, u8) by histogram and value.
          (local.set $e (i32.or (i32.shl (local.get $h) (i32.const 9)) (local.get $v)))
          (local.set $bits (i64.extend_i32_u (i32.load (i32.add (local.get $fast) (i32.shl (local.get $e) (i32.const 2))))))
          (local.set $len (i32.load8_u (i32.add (local.get $fastLen) (local.get $e)))))
        (else
          (if (local.get $d)
            (then
              ;; The length's code and raw bits, emitted; then the distance's below.
              (local.set $t (call $hybrid (local.get $lengthConfig) (local.get $v)))
              (local.set $e (i32.add
                (i32.load (i32.add (local.get $syms) (i32.shl (local.get $h) (i32.const 2))))
                (i32.add (local.get $minSymbol) (i32.and (i32.wrap_i64 (local.get $t)) (i32.const 65535)))))
              (local.set $len (i32.load8_u (i32.add (local.get $codeLens) (local.get $e))))
              (local.set $res (i64.or (local.get $res) (i64.shl
                (i64.or (i64.extend_i32_u (i32.load16_u (i32.add (local.get $codes) (i32.shl (local.get $e) (i32.const 1))))) (i64.shl (i64.shr_u (local.get $t) (i64.const 32)) (i64.extend_i32_u (local.get $len))))
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
              (local.set $e (i32.and (i32.wrap_i64 (local.get $t)) (i32.const 65535)))
              (local.set $cb (local.get $dcodes)) (local.set $lb (local.get $dLens)))
            (else
              (local.set $t (call $hybrid (i32.add (local.get $configs) (i32.shl (local.get $h) (i32.const 4))) (local.get $v)))
              (local.set $e (i32.add
                (i32.load (i32.add (local.get $syms) (i32.shl (local.get $h) (i32.const 2))))
                (i32.and (i32.wrap_i64 (local.get $t)) (i32.const 65535))))
              (local.set $cb (local.get $codes)) (local.set $lb (local.get $codeLens))))
          (local.set $len (i32.load8_u (i32.add (local.get $lb) (local.get $e))))
          (local.set $bits (i64.or (i64.extend_i32_u (i32.load16_u (i32.add (local.get $cb) (i32.shl (local.get $e) (i32.const 1)))))
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

;; Select-predictor residuals in RGBA lanes. Ties take north, as the decoder does.
(func $textDeltaResidual (param $here i32) (param $west i32) (param $north i32) (param $corner i32) (result v128)
  (local $H v128) (local $W v128) (local $N v128) (local $NW v128)
  (local.set $H (i32x4.extend_low_i16x8_u (i16x8.extend_low_i8x16_u (i32x4.splat (local.get $here)))))
  (local.set $W (i32x4.extend_low_i16x8_u (i16x8.extend_low_i8x16_u (i32x4.splat (local.get $west)))))
  (local.set $N (i32x4.extend_low_i16x8_u (i16x8.extend_low_i8x16_u (i32x4.splat (local.get $north)))))
  (local.set $NW (i32x4.extend_low_i16x8_u (i16x8.extend_low_i8x16_u (i32x4.splat (local.get $corner)))))
  (i32x4.sub (local.get $H) (v128.bitselect (local.get $W) (local.get $N)
    (i32x4.lt_s (i32x4.abs (i32x4.sub (local.get $N) (local.get $NW)))
      (i32x4.abs (i32x4.sub (local.get $W) (local.get $NW)))))))

;; A sparse sample rejects pages whose novel pixels cannot repay a delta trial. The full pass uses the same predictor.
(func $textDeltaSample
  (param $colours i32) (param $ncolours i32) (param $indices i32) (param $stride i32)
  (param $width i32) (param $height i32) (param $origin i32) (result i32)
  (local $x i32) (local $y i32) (local $ystep i32) (local $p i32) (local $index i32)
  (local $here i32) (local $west i32) (local $north i32) (local $corner i32)
  (local $seen i32) (local $novel i32) (local $l1 i32) (local $hits i32) (local $sum i32) (local $delta v128)
  (local.set $ystep (i32.shr_u (local.get $height) (i32.const 5)))
  (if (i32.eqz (local.get $ystep)) (then (local.set $ystep (i32.const 1))))
  (loop $ys
    (local.set $x (i32.const 0))
    (loop $xs
      (local.set $seen (i32.add (local.get $seen) (i32.const 1)))
      (local.set $p (i32.add (local.get $origin) (i32.add (i32.mul (local.get $y) (local.get $stride)) (local.get $x))))
      (block $sample
        (local.set $index (i32.load16_u (i32.add (local.get $indices) (i32.shl (local.get $p) (i32.const 1)))))
        (if (i32.ge_u (local.get $index) (local.get $ncolours)) (then (return (i32.const 0))))
        (local.set $here (i32.load (i32.add (local.get $colours) (i32.shl (local.get $index) (i32.const 2)))))
        (if (i32.eqz (local.get $x)) (then
          (local.set $hits (i32.add (local.get $hits) (i32.const 1))) (br $sample)))
        (local.set $index (i32.load16_u (i32.add (local.get $indices) (i32.shl (i32.sub (local.get $p) (i32.const 1)) (i32.const 1)))))
        (if (i32.ge_u (local.get $index) (local.get $ncolours)) (then (return (i32.const 0))))
        (local.set $west (i32.load (i32.add (local.get $colours) (i32.shl (local.get $index) (i32.const 2)))))
        (if (i32.eqz (i32.and (i32.xor (local.get $here) (local.get $west)) (i32.const 0xffffff))) (then
          (local.set $hits (i32.add (local.get $hits) (i32.const 1))) (br $sample)))
        (local.set $north (local.get $west)) (local.set $corner (local.get $west))
        (if (local.get $y) (then
          (local.set $index (i32.load16_u (i32.add (local.get $indices) (i32.shl (i32.sub (local.get $p) (local.get $stride)) (i32.const 1)))))
          (if (i32.ge_u (local.get $index) (local.get $ncolours)) (then (return (i32.const 0))))
          (local.set $north (i32.load (i32.add (local.get $colours) (i32.shl (local.get $index) (i32.const 2)))))
          (local.set $index (i32.load16_u (i32.add (local.get $indices) (i32.shl (i32.sub (i32.sub (local.get $p) (local.get $stride)) (i32.const 1)) (i32.const 1)))))
          (if (i32.ge_u (local.get $index) (local.get $ncolours)) (then (return (i32.const 0))))
          (local.set $corner (i32.load (i32.add (local.get $colours) (i32.shl (local.get $index) (i32.const 2)))))))
        (local.set $delta (i32x4.abs (call $textDeltaResidual (local.get $here) (local.get $west) (local.get $north) (local.get $corner))))
        (local.set $sum (i32.add (i32x4.extract_lane 0 (local.get $delta))
          (i32.add (i32x4.extract_lane 1 (local.get $delta)) (i32x4.extract_lane 2 (local.get $delta)))))
        (local.set $novel (i32.add (local.get $novel) (i32.const 1)))
        (local.set $l1 (i32.add (local.get $l1) (local.get $sum)))
        (local.set $hits (i32.add (local.get $hits) (i32.eqz (local.get $sum)))))
      (local.set $x (i32.add (local.get $x) (i32.const 8)))
      (br_if $xs (i32.lt_u (local.get $x) (local.get $width))))
    (local.set $y (i32.add (local.get $y) (local.get $ystep)))
    (br_if $ys (i32.lt_u (local.get $y) (local.get $height))))
  (i32.or
    (i32.and (i32.ge_u (i32.mul (local.get $hits) (i32.const 5)) (i32.mul (local.get $seen) (i32.const 4)))
      (i32.and (i32.le_u (local.get $l1) (i32.mul (local.get $novel) (i32.const 40)))
        (i32.ge_u (i32.mul (local.get $novel) (i32.const 100)) (i32.mul (local.get $seen) (i32.const 3)))))
    (i32.and (i32.le_u (local.get $l1) (i32.mul (local.get $novel) (i32.const 10)))
      (i32.ge_u (i32.mul (local.get $novel) (i32.const 5)) (i32.mul (local.get $seen) (i32.const 2))))))

;; One id per select-predictor residual of red, green and blue (capture-codec's text delta). `slots` holds
;; slotMask+1 pairs of (key, id), key 0 empty. `deltas` receives int16 dr, dg, db per id. `stats` receives
;; count, novel (pixels whose red, green or blue differs from the left), the sum of absolute residuals on
;; those pixels, and how many pixels the predictor hits. Returns the id count, or -1 past `limit` or a bad index.
(func (export "textDelta")
  (param $colours i32) (param $ncolours i32) (param $indices i32) (param $stride i32)
  (param $width i32) (param $height i32) (param $origin i32)
  (param $out i32) (param $slots i32) (param $slotMask i32) (param $deltas i32) (param $stats i32) (param $limit i32)
  (result i32)
  (local $y i32) (local $x i32) (local $p i32) (local $count i32)
  (local $novel i32) (local $l1 i32) (local $hits i32)
  (local $wp i32) (local $np i32) (local $nwp i32) (local $leftp i32) (local $topp i32)
  (local $dr i32) (local $dg i32) (local $db i32) (local $key i32) (local $slot i32) (local $got i32) (local $id i32)
  (local $here i32) (local $west i32) (local $north i32) (local $corner i32) (local $leftw i32)
  (local $delta v128)
  (if (i32.eqz (call $textDeltaSample (local.get $colours) (local.get $ncolours) (local.get $indices)
    (local.get $stride) (local.get $width) (local.get $height) (local.get $origin))) (then (return (i32.const 0))))
  (memory.fill (local.get $slots) (i32.const 0) (i32.shl (i32.add (local.get $slotMask) (i32.const 1)) (i32.const 3)))
  ;; Id 0 is the zero residual, so flat pixels skip the hash.
  (memory.fill (local.get $deltas) (i32.const 0) (i32.const 6))
  (local.set $key (i32.or (i32.const 512) (i32.or (i32.shl (i32.const 512) (i32.const 10)) (i32.shl (i32.const 512) (i32.const 20)))))
  (local.set $slot (i32.and (i32.mul (local.get $key) (i32.const 0x9e3779b1)) (local.get $slotMask)))
  (local.set $id (i32.add (local.get $slots) (i32.shl (local.get $slot) (i32.const 3))))
  (i32.store (local.get $id) (local.get $key))
  (i32.store offset=4 (local.get $id) (i32.const 0))
  (local.set $count (i32.const 1))
  (local.set $y (i32.const 0))
  (block $rows
    (loop $ys
      (br_if $rows (i32.ge_u (local.get $y) (local.get $height)))
      (local.set $x (i32.const 0))
      (loop $xs
        (local.set $p (i32.add (local.get $origin) (i32.add (i32.mul (local.get $y) (local.get $stride)) (local.get $x))))
        (if (i32.ge_u (i32.load16_u (i32.add (local.get $indices) (i32.shl (local.get $p) (i32.const 1)))) (local.get $ncolours))
          (then (return (i32.const -1))))
        (local.set $leftp (if (result i32) (local.get $x) (then (i32.sub (local.get $p) (i32.const 1))) (else (i32.const -1))))
        (local.set $topp (if (result i32) (local.get $y) (then (i32.sub (local.get $p) (local.get $stride))) (else (i32.const -1))))
        (local.set $wp (if (result i32) (i32.ge_s (local.get $leftp) (i32.const 0)) (then (local.get $leftp)) (else (local.get $topp))))
        (local.set $np (if (result i32) (i32.ge_s (local.get $topp) (i32.const 0)) (then (local.get $topp)) (else (local.get $wp))))
        (local.set $nwp (if (result i32) (i32.and (i32.eqz (i32.eqz (local.get $x))) (i32.eqz (i32.eqz (local.get $y))))
          (then (i32.sub (local.get $topp) (i32.const 1))) (else (local.get $wp))))
        (local.set $here (i32.load (i32.add (local.get $colours) (i32.shl (i32.load16_u (i32.add (local.get $indices) (i32.shl (local.get $p) (i32.const 1)))) (i32.const 2)))))
        (local.set $west (if (result i32) (i32.lt_s (local.get $wp) (i32.const 0)) (then (i32.const 0))
          (else (i32.load (i32.add (local.get $colours) (i32.shl (i32.load16_u (i32.add (local.get $indices) (i32.shl (local.get $wp) (i32.const 1)))) (i32.const 2)))))))
        (local.set $north (if (result i32) (i32.lt_s (local.get $np) (i32.const 0)) (then (i32.const 0))
          (else (i32.load (i32.add (local.get $colours) (i32.shl (i32.load16_u (i32.add (local.get $indices) (i32.shl (local.get $np) (i32.const 1)))) (i32.const 2)))))))
        (local.set $corner (if (result i32) (i32.lt_s (local.get $nwp) (i32.const 0)) (then (i32.const 0))
          (else (i32.load (i32.add (local.get $colours) (i32.shl (i32.load16_u (i32.add (local.get $indices) (i32.shl (local.get $nwp) (i32.const 1)))) (i32.const 2)))))))
        (local.set $delta (call $textDeltaResidual (local.get $here) (local.get $west) (local.get $north) (local.get $corner)))
        (local.set $dr (i32x4.extract_lane 0 (local.get $delta)))
        (local.set $dg (i32x4.extract_lane 1 (local.get $delta)))
        (local.set $db (i32x4.extract_lane 2 (local.get $delta)))
        (local.set $leftw (if (result i32) (i32.lt_s (local.get $leftp) (i32.const 0)) (then (i32.const 0))
          (else (i32.load (i32.add (local.get $colours) (i32.shl (i32.load16_u (i32.add (local.get $indices) (i32.shl (local.get $leftp) (i32.const 1)))) (i32.const 2)))))))
        (if (i32.and (i32.eqz (i32.eqz (local.get $x)))
              (i32.eqz (i32.eqz (i32.and (i32.xor (local.get $here) (local.get $leftw)) (i32.const 0x00ffffff)))))
          (then
            (local.set $novel (i32.add (local.get $novel) (i32.const 1)))
            (local.set $l1 (i32.add (local.get $l1)
              (i32.add
                (select (i32.sub (i32.const 0) (local.get $dr)) (local.get $dr) (i32.lt_s (local.get $dr) (i32.const 0)))
                (i32.add
                  (select (i32.sub (i32.const 0) (local.get $dg)) (local.get $dg) (i32.lt_s (local.get $dg) (i32.const 0)))
                  (select (i32.sub (i32.const 0) (local.get $db)) (local.get $db) (i32.lt_s (local.get $db) (i32.const 0)))))))))
        (if (i32.eqz (i32.or (local.get $dr) (i32.or (local.get $dg) (local.get $db))))
          (then
            (local.set $hits (i32.add (local.get $hits) (i32.const 1)))
            (local.set $id (i32.const 0))
            (i32.store16 (i32.add (local.get $out) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $width)) (local.get $x)) (i32.const 1))) (i32.const 0))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br_if $xs (i32.lt_u (local.get $x) (local.get $width)))
            (local.set $y (i32.add (local.get $y) (i32.const 1)))
            (br $ys)))
        (local.set $key (i32.or (i32.add (local.get $dr) (i32.const 512))
          (i32.or (i32.shl (i32.add (local.get $dg) (i32.const 512)) (i32.const 10))
            (i32.shl (i32.add (local.get $db) (i32.const 512)) (i32.const 20)))))
        (local.set $slot (i32.and (i32.mul (local.get $key) (i32.const 0x9e3779b1)) (local.get $slotMask)))
        (block $placed
          (loop $probe
            (local.set $got (i32.load (i32.add (local.get $slots) (i32.shl (local.get $slot) (i32.const 3)))))
            (if (i32.eqz (local.get $got))
              (then
                (if (i32.ge_u (local.get $count) (local.get $limit)) (then (return (i32.const -1))))
                (local.set $id (i32.add (local.get $slots) (i32.shl (local.get $slot) (i32.const 3))))
                (i32.store (local.get $id) (local.get $key))
                (i32.store offset=4 (local.get $id) (local.get $count))
                (local.set $got (i32.add (local.get $deltas) (i32.mul (local.get $count) (i32.const 6))))
                (i32.store16 (local.get $got) (local.get $dr))
                (i32.store16 offset=2 (local.get $got) (local.get $dg))
                (i32.store16 offset=4 (local.get $got) (local.get $db))
                (local.set $id (local.get $count))
                (local.set $count (i32.add (local.get $count) (i32.const 1)))
                (br $placed))
              (else
                (if (i32.eq (local.get $got) (local.get $key))
                  (then
                    (local.set $id (i32.load offset=4 (i32.add (local.get $slots) (i32.shl (local.get $slot) (i32.const 3)))))
                    (br $placed))
                  (else
                    (local.set $slot (i32.and (i32.add (local.get $slot) (i32.const 1)) (local.get $slotMask)))
                    (br $probe)))))))
        (i32.store16 (i32.add (local.get $out) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $width)) (local.get $x)) (i32.const 1))) (local.get $id))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br_if $xs (i32.lt_u (local.get $x) (local.get $width))))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $ys)))
  (i32.store (local.get $stats) (local.get $count))
  (i32.store offset=4 (local.get $stats) (local.get $novel))
  (i32.store offset=8 (local.get $stats) (local.get $l1))
  (i32.store offset=12 (local.get $stats) (local.get $hits))
  (local.get $count))

(func $captureEntropy (param $counts i32) (param $length i32) (param $log i32) (result f64)
  (local $i i32) (local $n i32) (local $used i32) (local $whole i32) (local $end i32) (local $total f64) (local $bits f64)
  (block $counted (loop $count
    (br_if $counted (i32.ge_u (local.get $i) (local.get $length)))
    (local.set $n (i32.load (i32.add (local.get $counts) (i32.shl (local.get $i) (i32.const 2)))))
    (if (local.get $n) (then
      (local.set $total (f64.add (local.get $total) (f64.convert_i32_u (local.get $n))))
      (local.set $end (i32.add (local.get $i) (i32.const 1)))
      (local.set $used (i32.add (local.get $used) (i32.const 1)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $count)))
  (if (f64.eq (local.get $total) (f64.const 0)) (then (return (f64.const 0))))
  (local.set $whole (call $captureLog (i32.wrap_i64 (i64.trunc_f64_u (local.get $total))) (local.get $log)))
  (local.set $i (i32.const 0))
  (block $priced (loop $price
    (br_if $priced (i32.ge_u (local.get $i) (local.get $end)))
    (local.set $n (i32.load (i32.add (local.get $counts) (i32.shl (local.get $i) (i32.const 2)))))
    (if (local.get $n) (then (local.set $bits (f64.add (local.get $bits)
      (f64.mul (f64.convert_i32_u (local.get $n))
        (f64.convert_i32_s (i32.sub (local.get $whole) (call $captureLog (local.get $n) (local.get $log)))))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $price)))
  (f64.add (f64.div (local.get $bits) (f64.const 32)) (f64.mul (f64.const 5) (f64.convert_i32_u (local.get $used)))))

;; AS42: the four-strip selector's pixel work. The caller owns/clears both
;; histograms and three u32 totals (gradient raw bits, weighted raw bits, samples).
;; sampleCost reuses the canonical $captureEntropy; no second entropy formula.
(func $captureSampleToken (param $value i32) (result i32)
  (local $e i32)
  (if (i32.lt_u (local.get $value) (i32.const 16)) (then (return (local.get $value))))
  (local.set $e (i32.sub (i32.const 31) (i32.clz (local.get $value))))
  (i32.add (i32.const 16) (i32.or
    (i32.or (i32.shl (i32.sub (local.get $e) (i32.const 4)) (i32.const 2))
      (i32.shl (i32.and (i32.shr_u (local.get $value) (i32.sub (local.get $e) (i32.const 1))) (i32.const 1)) (i32.const 1)))
    (i32.and (local.get $value) (i32.const 1)))))

(func (export "sampleCounts")
  (param $smooth i32) (param $contexts i32) (param $weighted i32) (param $properties i32)
  (param $width i32) (param $bands i32) (param $smoothCounts i32) (param $weightedCounts i32) (param $totals i32)
  (local $i i32) (local $end i32) (local $value i32) (local $error i32) (local $at i32)
  (local $smoothRaw i32) (local $weightedRaw i32)
  (local.set $i (i32.mul (local.get $width) (i32.const 2)))
  (local.set $end (i32.mul (local.get $width) (i32.const 8)))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $end)))
    (local.set $value (i32.load16_u (i32.add (local.get $smooth) (i32.shl (local.get $i) (i32.const 1)))))
    (local.set $at (i32.add (local.get $smoothCounts) (i32.shl
      (i32.add (i32.shl (i32.load8_u (i32.add (local.get $contexts) (local.get $i))) (i32.const 7))
        (call $captureSampleToken (local.get $value))) (i32.const 2))))
    (i32.store (local.get $at) (i32.add (i32.load (local.get $at)) (i32.const 1)))
    (if (i32.ge_u (local.get $value) (i32.const 16)) (then
      (local.set $smoothRaw (i32.add (local.get $smoothRaw) (i32.sub (i32.const 29) (i32.clz (local.get $value)))))))
    (local.set $value (i32.load (i32.add (local.get $weighted) (i32.shl (local.get $i) (i32.const 2)))))
    (local.set $error (i32.load (i32.add (local.get $properties) (i32.shl (local.get $i) (i32.const 2)))))
    (local.set $error (select (i32.const -255) (local.get $error) (i32.lt_s (local.get $error) (i32.const -255))))
    (local.set $error (select (i32.const 255) (local.get $error) (i32.gt_s (local.get $error) (i32.const 255))))
    (local.set $at (i32.add (local.get $weightedCounts) (i32.shl
      (i32.add (i32.shl (i32.load8_u (i32.add (local.get $bands) (i32.add (local.get $error) (i32.const 255)))) (i32.const 7))
        (call $captureSampleToken (local.get $value))) (i32.const 2))))
    (i32.store (local.get $at) (i32.add (i32.load (local.get $at)) (i32.const 1)))
    (if (i32.ge_u (local.get $value) (i32.const 16)) (then
      (local.set $weightedRaw (i32.add (local.get $weightedRaw) (i32.sub (i32.const 29) (i32.clz (local.get $value)))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $each)))
  (i32.store (local.get $totals) (i32.add (i32.load (local.get $totals)) (local.get $smoothRaw)))
  (i32.store offset=4 (local.get $totals) (i32.add (i32.load offset=4 (local.get $totals)) (local.get $weightedRaw)))
  (i32.store offset=8 (local.get $totals) (i32.add (i32.load offset=8 (local.get $totals)) (i32.mul (local.get $width) (i32.const 6)))))

;; Only the gradient residuals are used by the spatial-copy discriminator.
;; Adding a constant plane contributes zero after the two warm-up rows, so it
;; needs neither a full-plane constant scan nor a weighted prediction.
(func (export "sampleRepeats") (param $values i32) (param $width i32) (param $totals i32)
  (local $at i32) (local $end i32) (local $v i32) (local $nz i32) (local $rep i32) (local $rowBytes i32)
  (local.set $rowBytes (i32.shl (local.get $width) (i32.const 1)))
  (local.set $at (i32.add (local.get $values) (i32.shl (local.get $width) (i32.const 2))))
  (local.set $end (i32.add (local.get $values) (i32.shl (local.get $width) (i32.const 4))))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $at) (local.get $end)))
    (local.set $v (i32.load16_u (local.get $at)))
    (if (i32.and (i32.ne (local.get $v) (i32.const 0))
        (i32.ne (local.get $v) (i32.load16_u (i32.sub (local.get $at) (i32.const 2))))) (then
      (local.set $nz (i32.add (local.get $nz) (i32.const 1)))
      (if (i32.or
        (i32.or
          (i32.eq (local.get $v) (i32.load16_u (i32.sub (local.get $at) (local.get $rowBytes))))
          (i32.eq (local.get $v) (i32.load16_u (i32.sub (local.get $at) (i32.const 4)))))
        (i32.or
          (i32.eq (local.get $v) (i32.load16_u (i32.sub (local.get $at) (i32.const 6))))
          (i32.eq (local.get $v) (i32.load16_u (i32.sub (local.get $at) (i32.const 8))))))
        (then (local.set $rep (i32.add (local.get $rep) (i32.const 1)))))))
    (local.set $at (i32.add (local.get $at) (i32.const 2))) (br $each)))
  (i32.store (local.get $totals) (i32.add (i32.load (local.get $totals)) (local.get $nz)))
  (i32.store offset=4 (local.get $totals) (i32.add (i32.load offset=4 (local.get $totals)) (local.get $rep))))

;; AS31's sampleCost owner, unchanged. Include once when integrating that lane.
(func (export "sampleCost") (param $counts i32) (param $classes i32) (param $bits f64) (param $log i32) (result f64)
  (local $c i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $c) (local.get $classes)))
    (local.set $bits (f64.add (local.get $bits) (call $captureEntropy (local.get $counts) (i32.const 128) (local.get $log))))
    (local.set $counts (i32.add (local.get $counts) (i32.const 512)))
    (local.set $c (i32.add (local.get $c) (i32.const 1))) (br $each)))
  (local.get $bits))

(func (export "rctRank")
    (param $words i32) (param $stride i32) (param $x0 i32) (param $y0 i32)
    (param $w i32) (param $h i32) (param $hists i32) (param $raws i32)
    (result i32)
    (local $ys i32) (local $xs i32) (local $ry i32) (local $rx i32) (local $samples i32)
    (local $row i32) (local $ptr i32)
    (local $rgb v128) (local $r v128) (local $g v128) (local $b v128)
    (local $mr v128) (local $mg v128) (local $mb v128) (local $plane v128)
    (local $k i32) (local $v i32) (local $vnW i32) (local $vnN i32) (local $vnNW i32)
    (local $lo i32) (local $hi i32) (local $gr i32) (local $u i32) (local $top i32) (local $bel i32) (local $tok i32) (local $addr i32)
    (memory.fill (local.get $hists) (i32.const 0) (i32.const 4608))
    (memory.fill (local.get $raws) (i32.const 0) (i32.const 72))
    (local.set $ys (i32.shr_u (local.get $h) (i32.const 6)))
    (if (i32.lt_s (local.get $ys) (i32.const 1)) (then (local.set $ys (i32.const 1))))
    (local.set $xs (i32.shr_u (local.get $w) (i32.const 6)))
    (if (i32.lt_s (local.get $xs) (i32.const 1)) (then (local.set $xs (i32.const 1))))
    (local.set $ry (i32.const 1))
    (block $yDone (loop $yLoop
      (br_if $yDone (i32.ge_s (local.get $ry) (local.get $h)))
      (local.set $row (i32.add (i32.mul (i32.add (local.get $y0) (local.get $ry)) (local.get $stride)) (local.get $x0)))
      (local.set $rx (i32.const 1))
      (block $xDone (loop $xLoop
        (br_if $xDone (i32.ge_s (local.get $rx) (local.get $w)))
        (local.set $samples (i32.add (local.get $samples) (i32.const 1)))
        ;; Each lane is one neighbour: current, west, north, northwest. All fifteen
        ;; scalar bases apply the same arithmetic to those four positions.
        (local.set $ptr (i32.add (local.get $words) (i32.shl (i32.add (local.get $row) (local.get $rx)) (i32.const 2))))
        (local.set $rgb (i8x16.shuffle 4 5 6 7 0 1 2 3 20 21 22 23 16 17 18 19
          (v128.load64_zero (i32.sub (local.get $ptr) (i32.const 4)))
          (v128.load64_zero (i32.sub (local.get $ptr) (i32.shl (i32.add (local.get $stride) (i32.const 1)) (i32.const 2))))))
        (local.set $r (v128.and (local.get $rgb) (v128.const i32x4 255 255 255 255)))
        (local.set $g (v128.and (i32x4.shr_u (local.get $rgb) (i32.const 8)) (v128.const i32x4 255 255 255 255)))
        (local.set $b (v128.and (i32x4.shr_u (local.get $rgb) (i32.const 16)) (v128.const i32x4 255 255 255 255)))
        (local.set $mr (i32x4.shr_s (i32x4.add (local.get $g) (local.get $b)) (i32.const 1)))
        (local.set $mg (i32x4.shr_s (i32x4.add (local.get $r) (local.get $b)) (i32.const 1)))
        (local.set $mb (i32x4.shr_s (i32x4.add (local.get $r) (local.get $g)) (i32.const 1)))
        (local.set $k (i32.const 0))
        (block $kDone (loop $kLoop
          (br_if $kDone (i32.ge_s (local.get $k) (i32.const 18)))
          (if (i32.and (i32.ne (local.get $k) (i32.const 3)) (i32.and (i32.ne (local.get $k) (i32.const 7)) (i32.ne (local.get $k) (i32.const 11))))
            (then
              (local.set $plane (if (result v128) (i32.lt_s (local.get $k) (i32.const 6)) (then (if (result v128) (i32.lt_s (local.get $k) (i32.const 3)) (then (if (result v128) (i32.eq (local.get $k) (i32.const 0)) (then (local.get $r)) (else (if (result v128) (i32.eq (local.get $k) (i32.const 1)) (then (local.get $g)) (else (local.get $b)))))) (else (if (result v128) (i32.eq (local.get $k) (i32.const 4)) (then (i32x4.sub (local.get $r) (local.get $g))) (else (i32x4.sub (local.get $r) (local.get $b))))))) (else (if (result v128) (i32.lt_s (local.get $k) (i32.const 12)) (then (if (result v128) (i32.lt_s (local.get $k) (i32.const 9)) (then (if (result v128) (i32.eq (local.get $k) (i32.const 6)) (then (i32x4.sub (local.get $g) (local.get $r))) (else (i32x4.sub (local.get $g) (local.get $b))))) (else (if (result v128) (i32.eq (local.get $k) (i32.const 9)) (then (i32x4.sub (local.get $b) (local.get $r))) (else (i32x4.sub (local.get $b) (local.get $g))))))) (else (if (result v128) (i32.lt_s (local.get $k) (i32.const 15)) (then (if (result v128) (i32.eq (local.get $k) (i32.const 12)) (then (i32x4.sub (local.get $r) (local.get $mr))) (else (if (result v128) (i32.eq (local.get $k) (i32.const 13)) (then (i32x4.sub (local.get $g) (local.get $mg))) (else (i32x4.sub (local.get $b) (local.get $mb))))))) (else (if (result v128) (i32.eq (local.get $k) (i32.const 15)) (then (i32x4.add (local.get $mr) (i32x4.shr_s (i32x4.sub (local.get $r) (local.get $mr)) (i32.const 1)))) (else (if (result v128) (i32.eq (local.get $k) (i32.const 16)) (then (i32x4.add (local.get $mg) (i32x4.shr_s (i32x4.sub (local.get $g) (local.get $mg)) (i32.const 1)))) (else (i32x4.add (local.get $mb) (i32x4.shr_s (i32x4.sub (local.get $b) (local.get $mb)) (i32.const 1))))))))))))))
              (local.set $v (i32x4.extract_lane 0 (local.get $plane)))
              (local.set $vnW (i32x4.extract_lane 1 (local.get $plane)))
              (local.set $vnN (i32x4.extract_lane 2 (local.get $plane)))
              (local.set $vnNW (i32x4.extract_lane 3 (local.get $plane)))
              (local.set $lo (select (local.get $vnW) (local.get $vnN) (i32.lt_s (local.get $vnW) (local.get $vnN))))
              (local.set $hi (select (local.get $vnN) (local.get $vnW) (i32.lt_s (local.get $vnW) (local.get $vnN))))
              (local.set $gr (i32.sub (i32.add (local.get $vnW) (local.get $vnN)) (local.get $vnNW)))
              (local.set $gr (select (local.get $lo) (select (local.get $hi) (local.get $gr) (i32.gt_s (local.get $gr) (local.get $hi))) (i32.lt_s (local.get $gr) (local.get $lo))))
              (local.set $gr (i32.sub (local.get $v) (local.get $gr)))
              (local.set $u (select (i32.shl (local.get $gr) (i32.const 1)) (i32.sub (i32.mul (local.get $gr) (i32.const -2)) (i32.const 1)) (i32.ge_s (local.get $gr) (i32.const 0))))
              (if (i32.lt_u (local.get $u) (i32.const 16))
                (then (local.set $tok (local.get $u)))
                (else
                  (local.set $top (i32.sub (i32.const 31) (i32.clz (local.get $u))))
                  (local.set $bel (i32.sub (local.get $u) (i32.shl (i32.const 1) (local.get $top))))
                  (local.set $tok (i32.add (i32.const 16)
                    (i32.or (i32.shl (i32.sub (local.get $top) (i32.const 4)) (i32.const 3))
                      (i32.or (i32.shl (i32.and (i32.shr_u (local.get $bel) (i32.sub (local.get $top) (i32.const 1))) (i32.const 1)) (i32.const 2))
                        (i32.and (local.get $bel) (i32.const 3))))))
                  (local.set $addr (i32.add (local.get $raws) (i32.shl (local.get $k) (i32.const 2))))
                  (i32.store (local.get $addr) (i32.add (i32.load (local.get $addr)) (i32.sub (local.get $top) (i32.const 3))))))
              (local.set $addr (i32.add (local.get $hists) (i32.shl (i32.add (i32.shl (local.get $k) (i32.const 6)) (local.get $tok)) (i32.const 2))))
              (i32.store (local.get $addr) (i32.add (i32.load (local.get $addr)) (i32.const 1)))))
          (local.set $k (i32.add (local.get $k) (i32.const 1)))
          (br $kLoop)))
        (local.set $rx (i32.add (local.get $rx) (local.get $xs)))
        (br $xLoop)))
      (local.set $ry (i32.add (local.get $ry) (local.get $ys)))
      (br $yLoop)))
    (local.get $samples))
;; Rank reduction shares captureEntropy with the predictor and tree samplers.
;; All scores use integer 1/32-bit logarithms, matching the reference exactly.
(func $rctRankCost (param $prices i32) (param $t i32) (result f64)
  (local $perm i32) (local $custom i32) (local $a i32) (local $b i32) (local $c i32)
  (local $k0 i32) (local $k1 i32) (local $k2 i32)
  (local.set $perm (i32.div_u (local.get $t) (i32.const 7)))
  (local.set $custom (i32.rem_u (local.get $t) (i32.const 7)))
  (local.set $a (i32.rem_u (local.get $perm) (i32.const 3)))
  (local.set $b (i32.rem_u (i32.add (i32.add (local.get $perm) (i32.const 1))
    (i32.div_u (local.get $perm) (i32.const 3))) (i32.const 3)))
  (local.set $c (i32.rem_u (i32.sub (i32.add (local.get $perm) (i32.const 2))
    (i32.div_u (local.get $perm) (i32.const 3))) (i32.const 3)))
  (if (i32.eq (local.get $custom) (i32.const 6))
    (then
      (local.set $k0 (i32.add (i32.const 15) (local.get $b)))
      (local.set $k1 (i32.add (i32.add (i32.const 3) (i32.mul (i32.const 3) (local.get $a))) (local.get $c)))
      (local.set $k2 (i32.add (i32.const 12) (local.get $b))))
    (else
      (local.set $k0 (local.get $a))
      (local.set $k1 (select
        (i32.add (i32.add (i32.const 3) (i32.mul (i32.const 3) (local.get $b))) (local.get $a))
        (select (i32.add (i32.const 12) (local.get $b)) (local.get $b)
          (i32.eq (i32.shr_u (local.get $custom) (i32.const 1)) (i32.const 2)))
        (i32.eq (i32.shr_u (local.get $custom) (i32.const 1)) (i32.const 1))))
      (local.set $k2 (select
        (i32.add (i32.add (i32.const 3) (i32.mul (i32.const 3) (local.get $c))) (local.get $a))
        (local.get $c) (i32.and (local.get $custom) (i32.const 1))))))
  (f64.add
    (f64.add
      (f64.load (i32.add (local.get $prices) (i32.shl (local.get $k0) (i32.const 3))))
      (f64.load (i32.add (local.get $prices) (i32.shl (local.get $k1) (i32.const 3)))))
    (f64.load (i32.add (local.get $prices) (i32.shl (local.get $k2) (i32.const 3))))))

(func (export "rctRankFinish")
  (param $hists i32) (param $raws i32) (param $samples i32) (param $prices i32) (param $order i32) (param $log i32)
  (result f64)
  (local $k i32) (local $t i32) (local $best i32) (local $cost f64) (local $least f64) (local $root f64)
  (block $priced (loop $price
    (br_if $priced (i32.ge_u (local.get $k) (i32.const 18)))
    (if (i32.and (i32.ne (local.get $k) (i32.const 3))
        (i32.and (i32.ne (local.get $k) (i32.const 7)) (i32.ne (local.get $k) (i32.const 11))))
      (then
        (f64.store (i32.add (local.get $prices) (i32.shl (local.get $k) (i32.const 3)))
          (f64.add
            (call $captureEntropy (i32.add (local.get $hists) (i32.shl (local.get $k) (i32.const 8)))
              (i32.const 64) (local.get $log))
            (f64.convert_i32_u (i32.load (i32.add (local.get $raws) (i32.shl (local.get $k) (i32.const 2)))))))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $price)))
  ;; Only the winner is consumed. Stable strict comparisons retain 10, then 6,
  ;; then ascending RCT IDs on ties, exactly as the former complete ordering.
  (local.set $best (i32.const 10))
  (local.set $root (call $rctRankCost (local.get $prices) (i32.const 10)))
  (local.set $least (local.get $root))
  (local.set $cost (call $rctRankCost (local.get $prices) (i32.const 6)))
  (if (f64.lt (local.get $cost) (local.get $least))
    (then (local.set $best (i32.const 6)) (local.set $least (local.get $cost))))
  (block $done (loop $score
    (br_if $done (i32.ge_u (local.get $t) (i32.const 42)))
    (if (i32.and (i32.ne (local.get $t) (i32.const 10)) (i32.ne (local.get $t) (i32.const 6)))
      (then
        (local.set $cost (call $rctRankCost (local.get $prices) (local.get $t)))
        (if (f64.lt (local.get $cost) (local.get $least))
          (then (local.set $best (local.get $t)) (local.set $least (local.get $cost))))))
    (local.set $t (i32.add (local.get $t) (i32.const 1)))
    (br $score)))
  (i32.store (local.get $order) (local.get $best))
  (f64.div (f64.sub (local.get $root) (local.get $least)) (f64.convert_i32_u (local.get $samples))))

(func (export "rctUnpack")
    (param $words i32) (param $stride i32) (param $x0 i32) (param $y0 i32)
    (param $w i32) (param $h i32) (param $rct i32) (param $p0 i32) (param $p1 i32) (param $p2 i32)
    (result i32)
    (local $perm i32) (local $custom i32) (local $half i32) (local $shA i32) (local $shB i32) (local $shC i32)
    (local $c1Mode i32) (local $c2Sub i32) (local $y i32) (local $x i32) (local $src i32) (local $dst i32)
    (local $n i32)
    (local $pixLo v128) (local $pixHi v128) (local $r v128) (local $g v128) (local $b v128)
    (local $f v128) (local $s v128) (local $t v128) (local $tmpv v128)
    (local $a0 v128) (local $a1 v128) (local $a2 v128)
    (local.set $perm (i32.div_u (local.get $rct) (i32.const 7)))
    (local.set $custom (i32.rem_u (local.get $rct) (i32.const 7)))
    (local.set $half (i32.div_u (local.get $perm) (i32.const 3)))
    (local.set $shA (i32.shl (i32.rem_u (local.get $perm) (i32.const 3)) (i32.const 3)))
    (local.set $shB (i32.shl (i32.rem_u (i32.add (i32.add (local.get $perm) (i32.const 1)) (local.get $half)) (i32.const 3)) (i32.const 3)))
    (local.set $shC (i32.shl (i32.rem_u (i32.sub (i32.add (local.get $perm) (i32.const 2)) (local.get $half)) (i32.const 3)) (i32.const 3)))
    (local.set $c1Mode (i32.shr_u (local.get $custom) (i32.const 1)))
    (local.set $c2Sub (i32.and (local.get $custom) (i32.const 1)))
    (block $yDone (loop $yLoop
      (br_if $yDone (i32.ge_s (local.get $y) (local.get $h)))
      (local.set $src (i32.add (local.get $words)
        (i32.shl (i32.add (i32.mul (i32.add (local.get $y0) (local.get $y)) (local.get $stride)) (local.get $x0)) (i32.const 2))))
      (local.set $dst (i32.shl (i32.mul (local.get $y) (local.get $w)) (i32.const 1)))
      (local.set $x (i32.const 0))
      (block $simdDone (loop $simdLoop
        (br_if $simdDone (i32.ge_s (local.get $x) (local.get $w)))
        (local.set $pixLo (v128.load (i32.add (local.get $src) (i32.shl (local.get $x) (i32.const 2)))))
        (local.set $pixHi (v128.load offset=16 (i32.add (local.get $src) (i32.shl (local.get $x) (i32.const 2)))))

        (local.set $r (i16x8.extend_low_i8x16_u (i8x16.shuffle 0 4 8 12 16 20 24 28 0 0 0 0 0 0 0 0 (local.get $pixLo) (local.get $pixHi))))
        (local.set $g (i16x8.extend_low_i8x16_u (i8x16.shuffle 1 5 9 13 17 21 25 29 0 0 0 0 0 0 0 0 (local.get $pixLo) (local.get $pixHi))))
        (local.set $b (i16x8.extend_low_i8x16_u (i8x16.shuffle 2 6 10 14 18 22 26 30 0 0 0 0 0 0 0 0 (local.get $pixLo) (local.get $pixHi))))
        (local.set $f (if (result v128) (i32.eqz (local.get $shA)) (then (local.get $r))
          (else (if (result v128) (i32.eq (local.get $shA) (i32.const 8)) (then (local.get $g)) (else (local.get $b))))))
        (local.set $s (if (result v128) (i32.eqz (local.get $shB)) (then (local.get $r))
          (else (if (result v128) (i32.eq (local.get $shB) (i32.const 8)) (then (local.get $g)) (else (local.get $b))))))
        (local.set $t (if (result v128) (i32.eqz (local.get $shC)) (then (local.get $r))
          (else (if (result v128) (i32.eq (local.get $shC) (i32.const 8)) (then (local.get $g)) (else (local.get $b))))))
          (if (i32.eq (local.get $custom) (i32.const 6))
            (then
              (local.set $a1 (i16x8.sub (local.get $f) (local.get $t)))
              (local.set $tmpv (i16x8.add (local.get $t) (i16x8.shr_s (local.get $a1) (i32.const 1))))
              (local.set $a2 (i16x8.sub (local.get $s) (local.get $tmpv)))
              (local.set $a0 (i16x8.add (local.get $tmpv) (i16x8.shr_s (local.get $a2) (i32.const 1)))))
            (else
              (local.set $a0 (local.get $f))
              (local.set $a1 (if (result v128) (i32.eq (local.get $c1Mode) (i32.const 1))
                (then (i16x8.sub (local.get $s) (local.get $f)))
                (else (if (result v128) (i32.eq (local.get $c1Mode) (i32.const 2))
                  (then (i16x8.sub (local.get $s) (i16x8.shr_s (i16x8.add (local.get $f) (local.get $t)) (i32.const 1))))
                  (else (local.get $s))))))
              (local.set $a2 (if (result v128) (local.get $c2Sub)
                (then (i16x8.sub (local.get $t) (local.get $f)))
                (else (local.get $t))))))

        (v128.store (i32.add (local.get $p0) (local.get $dst)) (local.get $a0))
        (v128.store (i32.add (local.get $p1) (local.get $dst)) (local.get $a1))
        (v128.store (i32.add (local.get $p2) (local.get $dst)) (local.get $a2))
        (local.set $x (i32.add (local.get $x) (i32.const 8)))
        (local.set $dst (i32.add (local.get $dst) (i32.const 16)))
        (br $simdLoop)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $yLoop)))
    (local.set $n (i32.mul (local.get $w) (local.get $h)))
    (i32.or
      (call $planeConstant (local.get $p0) (local.get $n) (i32.load16_s (local.get $p0)))
      (i32.or
        (i32.shl (call $planeConstant (local.get $p1) (local.get $n) (i32.load16_s (local.get $p1))) (i32.const 1))
        (i32.shl (call $planeConstant (local.get $p2) (local.get $n) (i32.load16_s (local.get $p2))) (i32.const 2)))))
(func $planeConstant (param $p i32) (param $n i32) (param $value i32) (result i32)
  (local $i i32) (local $same v128)
  (local.set $same (i16x8.splat (local.get $value)))
  (block $tail (loop $vector
    (br_if $tail (i32.gt_u (i32.add (local.get $i) (i32.const 8)) (local.get $n)))
    (if (v128.any_true (v128.xor (v128.load (i32.add (local.get $p) (i32.shl (local.get $i) (i32.const 1)))) (local.get $same)))
      (then (return (i32.const 0))))
    (local.set $i (i32.add (local.get $i) (i32.const 8)))
    (br $vector)))
  (block $done (loop $scalar
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (if (i32.ne (i32.load16_s (i32.add (local.get $p) (i32.shl (local.get $i) (i32.const 1)))) (local.get $value))
      (then (return (i32.const 0))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $scalar)))
  (i32.const 1))

;; capture-codec.mjs pruneCopies over one index plane's pieces: `values` and `distances` (i32, $count of them), the
;; plane's $width-wide u16 samples at $plane, copies of $minimum or more. pruneScan writes each copy's first sample
;; position to $at and answers into $out: copies, the largest literal, the literals' scale (0 where every literal is 0).
(func $pieceBits (param $v i32) (result i32)
  (if (result i32) (i32.lt_u (local.get $v) (i32.const 16)) (then (i32.const 0)) (else (i32.sub (i32.const 29) (i32.clz (local.get $v))))))
(func $pieceToken (param $v i32) (result i32)
  (local $e i32)
  (if (i32.lt_u (local.get $v) (i32.const 16)) (then (return (local.get $v))))
  (local.set $e (i32.sub (i32.const 29) (i32.clz (local.get $v))))
  (i32.add (i32.const 16) (i32.or (i32.or (i32.shl (local.get $e) (i32.const 2))
    (i32.and (i32.shr_u (local.get $v) (local.get $e)) (i32.const 2))) (i32.and (local.get $v) (i32.const 1)))))
(func (export "pruneScan") (param $values i32) (param $distances i32) (param $count i32) (param $plane i32) (param $minimum i32)
  (param $at i32) (param $out i32)
  (local $k i32) (local $p i32) (local $c i32) (local $v i32) (local $top i32) (local $scale i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $k) (local.get $count)))
    (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2)))))
    (if (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2))))
      (then
        (i32.store (i32.add (local.get $at) (i32.shl (local.get $c) (i32.const 2))) (local.get $p))
        (local.set $c (i32.add (local.get $c) (i32.const 1)))
        (local.set $p (i32.add (local.get $p) (i32.add (local.get $v) (local.get $minimum)))))
      (else
        (if (i32.and (i32.eqz (local.get $scale)) (i32.ne (local.get $v) (i32.const 0)))
          (then (local.set $scale (select (i32.const 1) (i32.const 2)
            (i32.eq (local.get $v) (i32.load16_u (i32.add (local.get $plane) (i32.shl (local.get $p) (i32.const 1)))))))))
        (if (i32.gt_s (local.get $v) (local.get $top)) (then (local.set $top (local.get $v))))
        (local.set $p (i32.add (local.get $p) (i32.const 1)))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $each)))
  (i32.store (local.get $out) (local.get $c))
  (i32.store offset=4 (local.get $out) (local.get $top))
  (i32.store offset=8 (local.get $out) (local.get $scale)))
;; The literals' counts by value into $literals (u32, zeroed by the caller); answers how many literals.
(func (export "pruneLiterals") (param $values i32) (param $distances i32) (param $count i32) (param $literals i32) (result i32)
  (local $k i32) (local $n i32) (local $a i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $k) (local.get $count)))
    (if (i32.eqz (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2)))))
      (then
        (local.set $a (i32.add (local.get $literals) (i32.shl (i32.load (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2)))) (i32.const 2))))
        (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
        (local.set $n (i32.add (local.get $n) (i32.const 1)))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $each)))
  (local.get $n))
;; One pass's counts: $freq (u32, $top + 1, from the caller's literal counts) gains every expanded copy's values; the
;; kept copies' length and distance tokens are counted into $lengths and $dists (f64, 256 each, $dists right after
;; $lengths, both zeroed here).
;; Answers the kept copies; $out gets the symbols (f64).
(func (export "pruneTally") (param $values i32) (param $distances i32) (param $count i32) (param $plane i32) (param $minimum i32)
  (param $scale i32) (param $at i32) (param $keep i32) (param $freq i32) (param $top i32) (param $lengths i32) (param $dists i32) (param $symbols i32) (param $out i32) (result i32)
  (local $k i32) (local $c i32) (local $v i32) (local $i i32) (local $end i32) (local $kept i32) (local $a i32)
  (memory.fill (local.get $lengths) (i32.const 0) (i32.const 4096))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $k) (local.get $count)))
    (local.set $v (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2)))))
    (if (local.get $v)
      (then
        (if (i32.load8_u (i32.add (local.get $keep) (local.get $k)))
          (then
            (local.set $a (i32.add (local.get $lengths) (i32.shl (call $pieceToken (i32.load (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2))))) (i32.const 3))))
            (f64.store (local.get $a) (f64.add (f64.load (local.get $a)) (f64.const 1)))
            (local.set $a (i32.add (local.get $dists) (i32.shl (call $pieceToken (local.get $v)) (i32.const 3))))
            (f64.store (local.get $a) (f64.add (f64.load (local.get $a)) (f64.const 1)))
            (local.set $symbols (i32.add (local.get $symbols) (i32.const 1)))
            (local.set $kept (i32.add (local.get $kept) (i32.const 1))))
          (else
            (local.set $i (i32.load (i32.add (local.get $at) (i32.shl (local.get $c) (i32.const 2)))))
            (local.set $end (i32.add (local.get $i) (i32.add (i32.load (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2)))) (local.get $minimum))))
            (local.set $symbols (i32.add (local.get $symbols) (i32.sub (local.get $end) (local.get $i))))
            (block $x (loop $expand
              (br_if $x (i32.ge_u (local.get $i) (local.get $end)))
              (local.set $a (i32.mul (local.get $scale) (i32.load16_u (i32.add (local.get $plane) (i32.shl (local.get $i) (i32.const 1))))))
              ;; A typed array drops a write past its end: so does this.
              (if (i32.le_u (local.get $a) (local.get $top)) (then
                (local.set $a (i32.add (local.get $freq) (i32.shl (local.get $a) (i32.const 2))))
                (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))))
              (local.set $i (i32.add (local.get $i) (i32.const 1)))
              (br $expand)))))
        (local.set $c (i32.add (local.get $c) (i32.const 1)))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $each)))
  (f64.store (local.get $out) (f64.convert_i32_u (local.get $symbols)))
  (local.get $kept))
;; Each kept copy whose samples as literals (bits $bits, f64 by value) cost less than its tokens and raw bits becomes
;; literals; answers 1 where one did.
(func (export "pruneDecide") (param $values i32) (param $distances i32) (param $count i32) (param $plane i32) (param $minimum i32)
  (param $scale i32) (param $at i32) (param $keep i32) (param $bits i32) (param $top i32) (param $lengths i32) (param $dists i32) (result i32)
  (local $k i32) (local $c i32) (local $v i32) (local $d i32) (local $i i32) (local $end i32) (local $changed i32)
  (local $cost f64) (local $literal f64)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $k) (local.get $count)))
    (local.set $d (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2)))))
    (if (local.get $d)
      (then
        (if (i32.load8_u (i32.add (local.get $keep) (local.get $k)))
          (then
            (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2)))))
            (local.set $cost (f64.add (f64.add (f64.add
              (f64.load (i32.add (local.get $lengths) (i32.shl (call $pieceToken (local.get $v)) (i32.const 3))))
              (f64.convert_i32_s (call $pieceBits (local.get $v))))
              (f64.load (i32.add (local.get $dists) (i32.shl (call $pieceToken (local.get $d)) (i32.const 3)))))
              (f64.convert_i32_s (call $pieceBits (local.get $d)))))
            (local.set $literal (f64.const 0))
            (local.set $i (i32.load (i32.add (local.get $at) (i32.shl (local.get $c) (i32.const 2)))))
            (local.set $end (i32.add (local.get $i) (i32.add (local.get $v) (local.get $minimum))))
            (block $x (loop $sum
              (br_if $x (i32.ge_u (local.get $i) (local.get $end)))
              (br_if $x (i32.eqz (f64.lt (local.get $literal) (local.get $cost))))
              (local.set $v (i32.mul (local.get $scale) (i32.load16_u (i32.add (local.get $plane) (i32.shl (local.get $i) (i32.const 1))))))
              ;; A read past a typed array's end is undefined, and the sum NaN: so is this.
              (local.set $literal (if (result f64) (i32.le_u (local.get $v) (local.get $top))
                (then (f64.add (local.get $literal) (f64.load (i32.add (local.get $bits) (i32.shl (local.get $v) (i32.const 3))))))
                (else (f64.const nan))))
              (local.set $i (i32.add (local.get $i) (i32.const 1)))
              (br $sum)))
            (if (f64.lt (local.get $literal) (local.get $cost)) (then
              (i32.store8 (i32.add (local.get $keep) (local.get $k)) (i32.const 0))
              (local.set $changed (i32.const 1))))))
        (local.set $c (i32.add (local.get $c) (i32.const 1)))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $each)))
  (local.get $changed))
;; The pieces again, each dropped copy as its literals, into $outValues and $outDistances; answers how many.
(func (export "pruneExpand") (param $values i32) (param $distances i32) (param $count i32) (param $plane i32) (param $minimum i32)
  (param $scale i32) (param $at i32) (param $keep i32) (param $outValues i32) (param $outDistances i32) (result i32)
  (local $k i32) (local $c i32) (local $j i32) (local $v i32) (local $d i32) (local $i i32) (local $end i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $k) (local.get $count)))
    (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2)))))
    (local.set $d (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2)))))
    (if (i32.eqz (local.get $d))
      (then
        (i32.store (i32.add (local.get $outValues) (i32.shl (local.get $j) (i32.const 2))) (local.get $v))
        (i32.store (i32.add (local.get $outDistances) (i32.shl (local.get $j) (i32.const 2))) (i32.const 0))
        (local.set $j (i32.add (local.get $j) (i32.const 1))))
      (else
        (if (i32.load8_u (i32.add (local.get $keep) (local.get $k)))
          (then
            (i32.store (i32.add (local.get $outValues) (i32.shl (local.get $j) (i32.const 2))) (local.get $v))
            (i32.store (i32.add (local.get $outDistances) (i32.shl (local.get $j) (i32.const 2))) (local.get $d))
            (local.set $j (i32.add (local.get $j) (i32.const 1))))
          (else
            (local.set $i (i32.load (i32.add (local.get $at) (i32.shl (local.get $c) (i32.const 2)))))
            (local.set $end (i32.add (local.get $i) (i32.add (local.get $v) (local.get $minimum))))
            (block $x (loop $expand
              (br_if $x (i32.ge_u (local.get $i) (local.get $end)))
              (i32.store (i32.add (local.get $outValues) (i32.shl (local.get $j) (i32.const 2)))
                (i32.mul (local.get $scale) (i32.load16_u (i32.add (local.get $plane) (i32.shl (local.get $i) (i32.const 1))))))
              (i32.store (i32.add (local.get $outDistances) (i32.shl (local.get $j) (i32.const 2))) (i32.const 0))
              (local.set $j (i32.add (local.get $j) (i32.const 1)))
              (local.set $i (i32.add (local.get $i) (i32.const 1)))
              (br $expand)))))
        (local.set $c (i32.add (local.get $c) (i32.const 1)))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $each)))
  (local.get $j))

;; capture-codec.mjs nearestWalk: the $m colours $cols (packed RGBA, u32) visited from $start to each next nearest by the
;; sum of channel differences, ties to the earlier, writing $left's entry (i32) of each into $out (i32). Colours sit in
;; cells of 16 levels a channel: at $cells 4097 i32 starts, then 4096 i32 ends, then cellOf, byCell, at (i32) and the
;; colours in cell order (u32), $m each, and 16 bytes over.
(func (export "nearestWalk") (param $cols i32) (param $left i32) (param $m i32) (param $start i32) (param $out i32) (param $cells i32)
  (local $ends i32) (local $cellOf i32) (local $byCell i32) (local $at i32) (local $byPos i32) (local $k i32) (local $c i32) (local $cell i32)
  (local $a i32) (local $j i32) (local $last i32) (local $cr i32) (local $cg i32) (local $cb i32) (local $ring i32) (local $x i32) (local $y i32)
  (local $z i32) (local $xe i32) (local $ye i32) (local $ze i32) (local $step i32) (local $i i32) (local $e i32) (local $t i32) (local $best i32)
  (local $d i32) (local $moved i32) (local $dx i32) (local $dy i32) (local $lastv v128) (local $v v128) (local $ts v128) (local $lane i32)
  (local.set $ends (i32.add (local.get $cells) (i32.const 16388)))
  (local.set $cellOf (i32.add (local.get $ends) (i32.const 16384)))
  (local.set $byCell (i32.add (local.get $cellOf) (i32.shl (local.get $m) (i32.const 2))))
  (local.set $at (i32.add (local.get $byCell) (i32.shl (local.get $m) (i32.const 2))))
  (local.set $byPos (i32.add (local.get $at) (i32.shl (local.get $m) (i32.const 2))))
  (memory.fill (local.get $cells) (i32.const 0) (i32.const 16388))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $k) (local.get $m)))
    (local.set $c (i32.load (i32.add (local.get $cols) (i32.shl (local.get $k) (i32.const 2)))))
    (local.set $cell (i32.or (i32.or (i32.shl (i32.and (i32.shr_u (local.get $c) (i32.const 4)) (i32.const 15)) (i32.const 8))
      (i32.shl (i32.and (i32.shr_u (local.get $c) (i32.const 12)) (i32.const 15)) (i32.const 4))) (i32.and (i32.shr_u (local.get $c) (i32.const 20)) (i32.const 15))))
    (i32.store (i32.add (local.get $cellOf) (i32.shl (local.get $k) (i32.const 2))) (local.get $cell))
    (local.set $a (i32.add (local.get $cells) (i32.shl (i32.add (local.get $cell) (i32.const 1)) (i32.const 2))))
    (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $each)))
  (local.set $i (i32.const 0))
  (block $done (loop $sum
    (br_if $done (i32.ge_u (local.get $i) (i32.const 4096)))
    (local.set $a (i32.add (local.get $cells) (i32.shl (local.get $i) (i32.const 2))))
    (i32.store offset=4 (local.get $a) (i32.add (i32.load offset=4 (local.get $a)) (i32.load (local.get $a))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $sum)))
  (memory.copy (local.get $ends) (local.get $cells) (i32.const 16384))
  (local.set $k (i32.const 0))
  (block $done (loop $place
    (br_if $done (i32.ge_u (local.get $k) (local.get $m)))
    (local.set $a (i32.add (local.get $ends) (i32.shl (i32.load (i32.add (local.get $cellOf) (i32.shl (local.get $k) (i32.const 2)))) (i32.const 2))))
    (local.set $e (i32.load (local.get $a)))
    (i32.store (i32.add (local.get $at) (i32.shl (local.get $k) (i32.const 2))) (local.get $e))
    (i32.store (i32.add (local.get $byCell) (i32.shl (local.get $e) (i32.const 2))) (local.get $k))
    (i32.store (i32.add (local.get $byPos) (i32.shl (local.get $e) (i32.const 2))) (i32.load (i32.add (local.get $cols) (i32.shl (local.get $k) (i32.const 2)))))
    (i32.store (local.get $a) (i32.add (local.get $e) (i32.const 1)))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $place)))
  (local.set $last (local.get $start))
  (block $walked (loop $walk
    (br_if $walked (i32.ge_u (local.get $j) (local.get $m)))
    (local.set $best (i32.const -1)) (local.set $d (i32.const 0x40000000))
    (local.set $lastv (i32x4.splat (local.get $last)))
    (local.set $cr (i32.and (i32.shr_u (local.get $last) (i32.const 4)) (i32.const 15)))
    (local.set $cg (i32.and (i32.shr_u (local.get $last) (i32.const 12)) (i32.const 15)))
    (local.set $cb (i32.and (i32.shr_u (local.get $last) (i32.const 20)) (i32.const 15)))
    (local.set $ring (i32.const 0))
    (block $found (loop $rings
      (local.set $x (select (i32.sub (local.get $cr) (local.get $ring)) (i32.const 0) (i32.gt_s (i32.sub (local.get $cr) (local.get $ring)) (i32.const 0))))
      (local.set $xe (select (i32.add (local.get $cr) (local.get $ring)) (i32.const 15) (i32.lt_s (i32.add (local.get $cr) (local.get $ring)) (i32.const 15))))
      (block $xd (loop $xs
        (br_if $xd (i32.gt_s (local.get $x) (local.get $xe)))
        (local.set $dx (i32.sub (local.get $x) (local.get $cr)))
        (local.set $y (select (i32.sub (local.get $cg) (local.get $ring)) (i32.const 0) (i32.gt_s (i32.sub (local.get $cg) (local.get $ring)) (i32.const 0))))
        (local.set $ye (select (i32.add (local.get $cg) (local.get $ring)) (i32.const 15) (i32.lt_s (i32.add (local.get $cg) (local.get $ring)) (i32.const 15))))
        (block $yd (loop $ys
          (br_if $yd (i32.gt_s (local.get $y) (local.get $ye)))
          (local.set $dy (i32.sub (local.get $y) (local.get $cg)))
          ;; On the ring's edge in red or green every blue cell of the ring; inside it, only the two blue ends.
          (local.set $step (select (i32.const 1) (i32.shl (local.get $ring) (i32.const 1))
            (i32.or (i32.eqz (local.get $ring)) (i32.or
              (i32.or (i32.eq (local.get $dx) (local.get $ring)) (i32.eq (i32.sub (i32.const 0) (local.get $dx)) (local.get $ring)))
              (i32.or (i32.eq (local.get $dy) (local.get $ring)) (i32.eq (i32.sub (i32.const 0) (local.get $dy)) (local.get $ring)))))))
          (local.set $z (i32.sub (local.get $cb) (local.get $ring)))
          (local.set $ze (i32.add (local.get $cb) (local.get $ring)))
          (block $zd (loop $zs
            (br_if $zd (i32.gt_s (local.get $z) (local.get $ze)))
            (if (i32.lt_u (local.get $z) (i32.const 16)) (then
              (local.set $cell (i32.or (i32.or (i32.shl (local.get $x) (i32.const 8)) (i32.shl (local.get $y) (i32.const 4))) (local.get $z)))
              (local.set $i (i32.load (i32.add (local.get $cells) (i32.shl (local.get $cell) (i32.const 2)))))
              (local.set $e (i32.load (i32.add (local.get $ends) (i32.shl (local.get $cell) (i32.const 2)))))
              ;; Four colours' distances at once: each byte's absolute difference, summed over a colour's four bytes.
              (block $cd (loop $in
                (br_if $cd (i32.ge_s (local.get $i) (local.get $e)))
                (local.set $v (v128.load (i32.add (local.get $byPos) (i32.shl (local.get $i) (i32.const 2)))))
                (local.set $ts (i32x4.extadd_pairwise_i16x8_u (i16x8.extadd_pairwise_i8x16_u
                  (v128.or (i8x16.sub_sat_u (local.get $v) (local.get $lastv)) (i8x16.sub_sat_u (local.get $lastv) (local.get $v))))))
                (br_if $cd (i32.ge_s (i32.add (local.get $i) (i32.const 0)) (local.get $e)))
                (local.set $t (i32x4.extract_lane 0 (local.get $ts)))
                (if (i32.le_s (local.get $t) (local.get $d)) (then
                  (local.set $k (i32.load offset=0 (i32.add (local.get $byCell) (i32.shl (local.get $i) (i32.const 2)))))
                  (if (i32.or (i32.lt_s (local.get $t) (local.get $d)) (i32.lt_s (local.get $k) (local.get $best)))
                    (then (local.set $d (local.get $t)) (local.set $best (local.get $k))))))
                (br_if $cd (i32.ge_s (i32.add (local.get $i) (i32.const 1)) (local.get $e)))
                (local.set $t (i32x4.extract_lane 1 (local.get $ts)))
                (if (i32.le_s (local.get $t) (local.get $d)) (then
                  (local.set $k (i32.load offset=4 (i32.add (local.get $byCell) (i32.shl (local.get $i) (i32.const 2)))))
                  (if (i32.or (i32.lt_s (local.get $t) (local.get $d)) (i32.lt_s (local.get $k) (local.get $best)))
                    (then (local.set $d (local.get $t)) (local.set $best (local.get $k))))))
                (br_if $cd (i32.ge_s (i32.add (local.get $i) (i32.const 2)) (local.get $e)))
                (local.set $t (i32x4.extract_lane 2 (local.get $ts)))
                (if (i32.le_s (local.get $t) (local.get $d)) (then
                  (local.set $k (i32.load offset=8 (i32.add (local.get $byCell) (i32.shl (local.get $i) (i32.const 2)))))
                  (if (i32.or (i32.lt_s (local.get $t) (local.get $d)) (i32.lt_s (local.get $k) (local.get $best)))
                    (then (local.set $d (local.get $t)) (local.set $best (local.get $k))))))
                (br_if $cd (i32.ge_s (i32.add (local.get $i) (i32.const 3)) (local.get $e)))
                (local.set $t (i32x4.extract_lane 3 (local.get $ts)))
                (if (i32.le_s (local.get $t) (local.get $d)) (then
                  (local.set $k (i32.load offset=12 (i32.add (local.get $byCell) (i32.shl (local.get $i) (i32.const 2)))))
                  (if (i32.or (i32.lt_s (local.get $t) (local.get $d)) (i32.lt_s (local.get $k) (local.get $best)))
                    (then (local.set $d (local.get $t)) (local.set $best (local.get $k))))))
                (local.set $i (i32.add (local.get $i) (i32.const 4)))
                (br $in)))))
            (local.set $z (i32.add (local.get $z) (local.get $step)))
            (br $zs)))
          (local.set $y (i32.add (local.get $y) (i32.const 1)))
          (br $ys)))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br $xs)))
      ;; A colour in a cell further out differs by more than 16 x ring in one channel.
      (br_if $found (i32.and (i32.ge_s (local.get $best) (i32.const 0)) (i32.le_s (local.get $d) (i32.shl (local.get $ring) (i32.const 4)))))
      (local.set $ring (i32.add (local.get $ring) (i32.const 1)))
      (br_if $rings (i32.lt_s (local.get $ring) (i32.const 16)))))
    ;; The colour leaves its cell: swapped past the cell's end.
    (local.set $a (i32.add (local.get $ends) (i32.shl (i32.load (i32.add (local.get $cellOf) (i32.shl (local.get $best) (i32.const 2)))) (i32.const 2))))
    (local.set $e (i32.sub (i32.load (local.get $a)) (i32.const 1)))
    (i32.store (local.get $a) (local.get $e))
    (local.set $moved (i32.load (i32.add (local.get $byCell) (i32.shl (local.get $e) (i32.const 2)))))
    (local.set $i (i32.load (i32.add (local.get $at) (i32.shl (local.get $best) (i32.const 2)))))
    (i32.store (i32.add (local.get $byCell) (i32.shl (local.get $i) (i32.const 2))) (local.get $moved))
    (i32.store (i32.add (local.get $byPos) (i32.shl (local.get $i) (i32.const 2))) (i32.load (i32.add (local.get $cols) (i32.shl (local.get $moved) (i32.const 2)))))
    (i32.store (i32.add (local.get $at) (i32.shl (local.get $moved) (i32.const 2))) (local.get $i))
    (i32.store (i32.add (local.get $byCell) (i32.shl (local.get $e) (i32.const 2))) (local.get $best))
    (local.set $last (i32.load (i32.add (local.get $cols) (i32.shl (local.get $best) (i32.const 2)))))
    (i32.store (i32.add (local.get $byPos) (i32.shl (local.get $e) (i32.const 2))) (local.get $last))
    (i32.store (i32.add (local.get $at) (i32.shl (local.get $best) (i32.const 2))) (local.get $e))
    (i32.store (i32.add (local.get $out) (i32.shl (local.get $j) (i32.const 2))) (i32.load (i32.add (local.get $left) (i32.shl (local.get $best) (i32.const 2)))))
    (local.set $j (i32.add (local.get $j) (i32.const 1)))
    (br $walk))))

;; capture-codec.mjs learnContexts' tree: greedy splits of the pieces order[0, count) on $props properties, each piece's
;; token (u8 at $tokens) and its bin a property (u8, property p's bins at $bins + p * count). The context at $ctx (i32 fields):
;; 0 order, 4 tokens, 8 bins, 12 count, 16 props, 20 span, 24 all (128 u32), 28 counts (props * span u32), 32 low (128 u32),
;; 36 used (128 u8), 40 nlog (count + 1 i32: k * log2 k in 32nds), 44 bins a property (props i32), 48 the least saving,
;; 52 min pieces to split, 56 most nodes, 60 contexts (u8 a piece, written), 64 records (two i32 a node in preorder: -1 and
;; the leaf's number, or the property and its cut), 68 nodes, 72 leaves, 76 records written, 80 scratch (count i32), 84 cut.
;; Every estimate is an integer, so i64 sums choose as the JavaScript's doubles did.
(func (export "treeNlog") (param $nlog i32) (param $n i32) (param $log i32)
  (local $k i32) (local $e i32)
  (i32.store (local.get $nlog) (i32.const 0))
  (local.set $k (i32.const 1))
  (block $done (loop $each
    (br_if $done (i32.gt_u (local.get $k) (local.get $n)))
    (local.set $e (i32.sub (i32.const 31) (i32.clz (local.get $k))))
    (i32.store (i32.add (local.get $nlog) (i32.shl (local.get $k) (i32.const 2)))
      (i32.mul (local.get $k) (i32.add (i32.shl (local.get $e) (i32.const 5))
        (i32.load8_u (i32.add (local.get $log) (i32.and (if (result i32) (i32.ge_u (local.get $e) (i32.const 5))
          (then (i32.shr_u (local.get $k) (i32.sub (local.get $e) (i32.const 5))))
          (else (i32.shl (local.get $k) (i32.sub (i32.const 5) (local.get $e))))) (i32.const 31)))))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $each))))
(func (export "treeLearn") (param $ctx i32)
  (call $treeNode (local.get $ctx) (i32.const 0) (i32.load offset=12 (local.get $ctx))))
(func $treeNode (param $ctx i32) (param $from i32) (param $to i32)
  (local $order i32) (local $tokens i32) (local $bins i32) (local $count i32) (local $props i32) (local $span i32) (local $all i32)
  (local $counts i32) (local $used i32) (local $nlog i32) (local $size i32) (local $splits i32) (local $i i32) (local $k i32)
  (local $t i32) (local $p i32) (local $a i32) (local $kinds i32) (local $sum i64) (local $gain i64) (local $here i64) (local $found i64)
  (local $property i32) (local $cut i32) (local $rec i32) (local $z i32) (local $b i32)
  (local.set $order (i32.load (local.get $ctx))) (local.set $tokens (i32.load offset=4 (local.get $ctx)))
  (local.set $bins (i32.load offset=8 (local.get $ctx))) (local.set $count (i32.load offset=12 (local.get $ctx)))
  (local.set $props (i32.load offset=16 (local.get $ctx))) (local.set $span (i32.load offset=20 (local.get $ctx)))
  (local.set $all (i32.load offset=24 (local.get $ctx))) (local.set $counts (i32.load offset=28 (local.get $ctx)))
  (local.set $used (i32.load offset=36 (local.get $ctx))) (local.set $nlog (i32.load offset=40 (local.get $ctx)))
  (local.set $size (i32.sub (local.get $to) (local.get $from)))
  (i32.store offset=68 (local.get $ctx) (i32.add (i32.load offset=68 (local.get $ctx)) (i32.const 1)))
  (local.set $splits (i32.and (i32.ge_s (local.get $size) (i32.load offset=52 (local.get $ctx)))
    (i32.le_s (i32.add (i32.load offset=68 (local.get $ctx)) (i32.const 2)) (i32.load offset=56 (local.get $ctx)))))
  ;; The tokens' tally, and with a split possible every property's bins too, in one pass.
  (memory.fill (local.get $all) (i32.const 0) (i32.const 512))
  (if (local.get $splits) (then (memory.fill (local.get $counts) (i32.const 0) (i32.shl (i32.mul (local.get $props) (local.get $span)) (i32.const 2)))))
  (local.set $i (local.get $from))
  (block $done (loop $each
    (br_if $done (i32.ge_s (local.get $i) (local.get $to)))
    (local.set $k (i32.load (i32.add (local.get $order) (i32.shl (local.get $i) (i32.const 2)))))
    (local.set $t (i32.load8_u (i32.add (local.get $tokens) (local.get $k))))
    (local.set $a (i32.add (local.get $all) (i32.shl (local.get $t) (i32.const 2))))
    (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
    (if (local.get $splits) (then
      (local.set $p (i32.const 0))
      (loop $each_p
        (local.set $a (i32.add (local.get $counts) (i32.shl (i32.add (i32.mul (local.get $p) (local.get $span))
          (i32.add (i32.shl (i32.load8_u (i32.add (i32.add (local.get $bins) (i32.mul (local.get $p) (local.get $count))) (local.get $k))) (i32.const 7)) (local.get $t))) (i32.const 2))))
        (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
        (local.set $p (i32.add (local.get $p) (i32.const 1)))
        (br_if $each_p (i32.lt_s (local.get $p) (local.get $props))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  (local.set $t (i32.const 0))
  (block $done (loop $tokens
    (br_if $done (i32.ge_s (local.get $t) (i32.const 128)))
    (local.set $a (i32.load (i32.add (local.get $all) (i32.shl (local.get $t) (i32.const 2)))))
    (if (local.get $a) (then
      (local.set $sum (i64.add (local.get $sum) (i64.extend_i32_u (i32.load (i32.add (local.get $nlog) (i32.shl (local.get $a) (i32.const 2)))))))
      (i32.store8 (i32.add (local.get $used) (local.get $kinds)) (local.get $t))
      (local.set $kinds (i32.add (local.get $kinds) (i32.const 1)))))
    (local.set $t (i32.add (local.get $t) (i32.const 1)))
    (br $tokens)))
  (local.set $gain (i64.extend_i32_s (i32.load offset=48 (local.get $ctx))))
  (local.set $property (i32.const -1))
  (if (local.get $splits) (then
    (local.set $here (i64.add (i64.sub (i64.extend_i32_u (i32.load (i32.add (local.get $nlog) (i32.shl (local.get $size) (i32.const 2))))) (local.get $sum))
      (i64.extend_i32_u (i32.mul (i32.const 160) (local.get $kinds)))))
    (local.set $p (i32.const 0))
    (block $done (loop $each_p
      (br_if $done (i32.ge_s (local.get $p) (local.get $props)))
      (local.set $found (call $bestCut (local.get $ctx) (local.get $p) (local.get $size) (local.get $here) (local.get $sum) (local.get $kinds)))
      (if (i64.gt_s (local.get $found) (local.get $gain)) (then
        (local.set $gain (local.get $found)) (local.set $property (local.get $p)) (local.set $cut (i32.load offset=84 (local.get $ctx)))))
      (local.set $p (i32.add (local.get $p) (i32.const 1)))
      (br $each_p)))))
  (local.set $rec (i32.add (i32.load offset=64 (local.get $ctx)) (i32.shl (i32.load offset=76 (local.get $ctx)) (i32.const 3))))
  (i32.store offset=76 (local.get $ctx) (i32.add (i32.load offset=76 (local.get $ctx)) (i32.const 1)))
  (if (i32.lt_s (local.get $property) (i32.const 0)) (then
    (local.set $a (i32.load offset=72 (local.get $ctx)))
    (i32.store (local.get $rec) (i32.const -1)) (i32.store offset=4 (local.get $rec) (local.get $a))
    (i32.store offset=72 (local.get $ctx) (i32.add (local.get $a) (i32.const 1)))
    (local.set $i (local.get $from))
    (block $done (loop $each
      (br_if $done (i32.ge_s (local.get $i) (local.get $to)))
      (i32.store8 (i32.add (i32.load offset=60 (local.get $ctx)) (i32.load (i32.add (local.get $order) (i32.shl (local.get $i) (i32.const 2))))) (local.get $a))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $each)))
    (return)))
  (i32.store (local.get $rec) (local.get $property)) (i32.store offset=4 (local.get $rec) (local.get $cut))
  ;; Pieces past the cut (bins above it) go left, each side in order.
  (local.set $b (i32.add (local.get $bins) (i32.mul (local.get $property) (local.get $count))))
  (local.set $a (local.get $from)) (local.set $z (i32.const 0))
  (local.set $i (local.get $from))
  (block $done (loop $each
    (br_if $done (i32.ge_s (local.get $i) (local.get $to)))
    (local.set $k (i32.load (i32.add (local.get $order) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.gt_u (i32.load8_u (i32.add (local.get $b) (local.get $k))) (local.get $cut))
      (then (i32.store (i32.add (local.get $order) (i32.shl (local.get $a) (i32.const 2))) (local.get $k)) (local.set $a (i32.add (local.get $a) (i32.const 1))))
      (else (i32.store (i32.add (i32.load offset=80 (local.get $ctx)) (i32.shl (local.get $z) (i32.const 2))) (local.get $k)) (local.set $z (i32.add (local.get $z) (i32.const 1)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  (memory.copy (i32.add (local.get $order) (i32.shl (local.get $a) (i32.const 2))) (i32.load offset=80 (local.get $ctx)) (i32.shl (local.get $z) (i32.const 2)))
  (call $treeNode (local.get $ctx) (local.get $from) (local.get $a))
  (call $treeNode (local.get $ctx) (local.get $a) (local.get $to)))
;; The largest saving (32nds of a bit) of a cut on property $p, its cut at ctx + 84; each cut moves one bin's tokens.
(func $bestCut (param $ctx i32) (param $p i32) (param $size i32) (param $here i64) (param $sum i64) (param $kinds i32) (result i64)
  (local $counts i32) (local $low i32) (local $all i32) (local $used i32) (local $nlog i32) (local $n i32) (local $c i32) (local $base i32)
  (local $u i32) (local $t i32) (local $v i32) (local $a i32) (local $b i32) (local $moved i32) (local $lowSize i32)
  (local $kindsLow i32) (local $kindsHigh i32) (local $best i64) (local $sumLow i64) (local $sumHigh i64) (local $saving i64)
  (local.set $counts (i32.load offset=28 (local.get $ctx))) (local.set $low (i32.load offset=32 (local.get $ctx)))
  (local.set $all (i32.load offset=24 (local.get $ctx))) (local.set $used (i32.load offset=36 (local.get $ctx)))
  (local.set $nlog (i32.load offset=40 (local.get $ctx)))
  (local.set $n (i32.load (i32.add (i32.load offset=44 (local.get $ctx)) (i32.shl (local.get $p) (i32.const 2)))))
  (local.set $base (i32.mul (local.get $p) (i32.load offset=20 (local.get $ctx))))
  (block $done (loop $clear
    (br_if $done (i32.ge_s (local.get $u) (local.get $kinds)))
    (i32.store (i32.add (local.get $low) (i32.shl (i32.load8_u (i32.add (local.get $used) (local.get $u))) (i32.const 2))) (i32.const 0))
    (local.set $u (i32.add (local.get $u) (i32.const 1)))
    (br $clear)))
  (local.set $sumHigh (local.get $sum)) (local.set $kindsHigh (local.get $kinds))
  (block $end (loop $cuts
    (br_if $end (i32.ge_s (i32.add (local.get $c) (i32.const 1)) (local.get $n)))
    (local.set $moved (i32.const 0))
    (local.set $u (i32.const 0))
    (block $done (loop $each
      (br_if $done (i32.ge_s (local.get $u) (local.get $kinds)))
      (local.set $t (i32.load8_u (i32.add (local.get $used) (local.get $u))))
      (local.set $v (i32.load (i32.add (local.get $counts) (i32.shl (i32.add (local.get $base) (i32.add (i32.shl (local.get $c) (i32.const 7)) (local.get $t))) (i32.const 2)))))
      (if (local.get $v) (then
        (local.set $a (i32.load (i32.add (local.get $low) (i32.shl (local.get $t) (i32.const 2)))))
        (local.set $b (i32.sub (i32.load (i32.add (local.get $all) (i32.shl (local.get $t) (i32.const 2)))) (local.get $a)))
        (local.set $sumLow (i64.add (local.get $sumLow) (i64.sub
          (i64.extend_i32_u (i32.load (i32.add (local.get $nlog) (i32.shl (i32.add (local.get $a) (local.get $v)) (i32.const 2)))))
          (i64.extend_i32_u (i32.load (i32.add (local.get $nlog) (i32.shl (local.get $a) (i32.const 2))))))))
        (if (i32.eqz (local.get $a)) (then (local.set $kindsLow (i32.add (local.get $kindsLow) (i32.const 1)))))
        (local.set $sumHigh (i64.add (local.get $sumHigh) (i64.sub
          (i64.extend_i32_u (i32.load (i32.add (local.get $nlog) (i32.shl (i32.sub (local.get $b) (local.get $v)) (i32.const 2)))))
          (i64.extend_i32_u (i32.load (i32.add (local.get $nlog) (i32.shl (local.get $b) (i32.const 2))))))))
        (if (i32.eq (local.get $b) (local.get $v)) (then (local.set $kindsHigh (i32.sub (local.get $kindsHigh) (i32.const 1)))))
        (i32.store (i32.add (local.get $low) (i32.shl (local.get $t) (i32.const 2))) (i32.add (local.get $a) (local.get $v)))
        (local.set $moved (i32.add (local.get $moved) (local.get $v)))))
      (local.set $u (i32.add (local.get $u) (i32.const 1)))
      (br $each)))
    (if (local.get $moved) (then
      (local.set $lowSize (i32.add (local.get $lowSize) (local.get $moved)))
      (br_if $end (i32.eq (local.get $lowSize) (local.get $size)))
      (local.set $saving (i64.sub (local.get $here) (i64.add (i64.add (i64.add (i64.add (i64.add
        (i64.sub (i64.extend_i32_u (i32.load (i32.add (local.get $nlog) (i32.shl (local.get $lowSize) (i32.const 2))))) (local.get $sumLow))
        (i64.extend_i32_u (i32.mul (i32.const 160) (local.get $kindsLow))))
        (i64.extend_i32_u (i32.load (i32.add (local.get $nlog) (i32.shl (i32.sub (local.get $size) (local.get $lowSize)) (i32.const 2))))))
        (i64.sub (i64.const 0) (local.get $sumHigh)))
        (i64.extend_i32_u (i32.mul (i32.const 160) (local.get $kindsHigh)))) (i64.const 0))))
      (if (i64.gt_s (local.get $saving) (local.get $best)) (then
        (local.set $best (local.get $saving)) (i32.store offset=84 (local.get $ctx) (local.get $c))))))
    (local.set $c (i32.add (local.get $c) (i32.const 1)))
    (br $cuts)))
  (local.get $best))

;; capture-codec.mjs entropy over $n u32 counts at $freqs: each count's n (log2 total - log2 n) in 32nds from the integer
;; log2 ($log: LOG_MANTISSA), over 32, plus five bits a used count; 0 when empty. Integers until the division, so the
;; same double as the JavaScript's.

(func $entropy (param $freqs i32) (param $n i32) (param $log i32) (result f64)
  (local $i i32) (local $v i32) (local $total i32) (local $used i32) (local $whole i32) (local $bits i64)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $v (i32.load (i32.add (local.get $freqs) (i32.shl (local.get $i) (i32.const 2)))))
    (if (local.get $v) (then (local.set $total (i32.add (local.get $total) (local.get $v))) (local.set $used (i32.add (local.get $used) (i32.const 1)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  (if (i32.eqz (local.get $total)) (then (return (f64.const 0))))
  (local.set $whole (call $captureLog (local.get $total) (local.get $log)))
  (local.set $i (i32.const 0))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $v (i32.load (i32.add (local.get $freqs) (i32.shl (local.get $i) (i32.const 2)))))
    (if (local.get $v) (then
      (local.set $bits (i64.add (local.get $bits) (i64.mul (i64.extend_i32_u (local.get $v))
        (i64.extend_i32_s (i32.sub (local.get $whole) (call $captureLog (local.get $v) (local.get $log)))))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  (f64.add (f64.div (f64.convert_i64_s (local.get $bits)) (f64.const 32)) (f64.convert_i32_u (i32.mul (local.get $used) (i32.const 5)))))
;; capture-codec.mjs channelModel's palette rows ('rows'): the $w x $h i32 $plane's residuals under W, N and the clamped
;; gradient, three contexts a row (on how the row above changed), and each context's predictor (the least entropy,
;; the first on a tie) into $chosen (u8, 3h); the chosen residuals into $values (i32) and the contexts into $contexts
;; (u8). Scratch: $byNorth, $byGradient ($w h i32 each), $counts (3 x 3h x 512 u32, zeroed here).
(func (export "rowsModel") (param $plane i32) (param $w i32) (param $h i32) (param $values i32) (param $contexts i32) (param $chosen i32)
  (param $byNorth i32) (param $byGradient i32) (param $counts i32) (param $log i32)
  (local $n i32) (local $i i32) (local $x i32) (local $row i32) (local $west i32) (local $north i32) (local $nw i32) (local $g i32)
  (local $lo i32) (local $hi i32) (local $change i32) (local $context i32) (local $at i32) (local $value i32) (local $r i32)
  (local $classes i32) (local $size i32) (local $c i32) (local $p i32) (local $bits f64) (local $least f64) (local $a i32)
  (local.set $n (i32.mul (local.get $w) (local.get $h)))
  (local.set $classes (i32.mul (local.get $h) (i32.const 3)))
  (local.set $size (i32.mul (i32.mul (local.get $classes) (i32.const 3)) (i32.const 512)))
  (memory.fill (local.get $counts) (i32.const 0) (i32.shl (local.get $size) (i32.const 2)))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (if (i32.eq (local.get $x) (local.get $w)) (then (local.set $x (i32.const 0)) (local.set $row (i32.add (local.get $row) (i32.const 1)))))
    (local.set $west (if (result i32) (local.get $x) (then (i32.load (i32.add (local.get $plane) (i32.shl (i32.sub (local.get $i) (i32.const 1)) (i32.const 2)))))
      (else (if (result i32) (local.get $row) (then (i32.load (i32.add (local.get $plane) (i32.shl (i32.sub (local.get $i) (local.get $w)) (i32.const 2))))) (else (i32.const 0))))))
    (local.set $north (if (result i32) (local.get $row) (then (i32.load (i32.add (local.get $plane) (i32.shl (i32.sub (local.get $i) (local.get $w)) (i32.const 2))))) (else (local.get $west))))
    (local.set $nw (if (result i32) (i32.and (i32.ne (local.get $x) (i32.const 0)) (i32.ne (local.get $row) (i32.const 0)))
      (then (i32.load (i32.add (local.get $plane) (i32.shl (i32.sub (i32.sub (local.get $i) (local.get $w)) (i32.const 1)) (i32.const 2))))) (else (local.get $west))))
    (local.set $lo (select (local.get $west) (local.get $north) (i32.lt_s (local.get $west) (local.get $north))))
    (local.set $hi (select (local.get $west) (local.get $north) (i32.gt_s (local.get $west) (local.get $north))))
    (local.set $g (i32.sub (i32.add (local.get $west) (local.get $north)) (local.get $nw)))
    (local.set $g (select (local.get $hi) (local.get $g) (i32.lt_s (local.get $hi) (local.get $g))))
    (local.set $g (select (local.get $lo) (local.get $g) (i32.gt_s (local.get $lo) (local.get $g))))
    (local.set $change (i32.sub (local.get $nw) (local.get $north)))
    (local.set $change (select (local.get $change) (i32.sub (i32.const 0) (local.get $change)) (i32.ge_s (local.get $change) (i32.const 0))))
    (local.set $context (i32.add (i32.mul (local.get $row) (i32.const 3))
      (if (result i32) (local.get $change) (then (select (i32.const 1) (i32.const 2) (i32.le_s (local.get $change) (i32.const 8)))) (else (i32.const 0)))))
    (i32.store8 (i32.add (local.get $contexts) (local.get $i)) (local.get $context))
    (local.set $at (i32.shl (local.get $context) (i32.const 9)))
    (local.set $value (i32.load (i32.add (local.get $plane) (i32.shl (local.get $i) (i32.const 2)))))
    ;; Each residual packed signed, counted where the JavaScript counted it (a count past the end is dropped).
    (local.set $r (call $packSigned (i32.sub (local.get $value) (local.get $west))))
    (i32.store (i32.add (local.get $values) (i32.shl (local.get $i) (i32.const 2))) (local.get $r))
    (call $countAt (local.get $counts) (local.get $size) (i32.add (local.get $at) (local.get $r)))
    (local.set $r (call $packSigned (i32.sub (local.get $value) (local.get $north))))
    (i32.store (i32.add (local.get $byNorth) (i32.shl (local.get $i) (i32.const 2))) (local.get $r))
    (call $countAt (local.get $counts) (local.get $size) (i32.add (i32.add (i32.shl (local.get $classes) (i32.const 9)) (local.get $at)) (local.get $r)))
    (local.set $r (call $packSigned (i32.sub (local.get $value) (local.get $g))))
    (i32.store (i32.add (local.get $byGradient) (i32.shl (local.get $i) (i32.const 2))) (local.get $r))
    (call $countAt (local.get $counts) (local.get $size) (i32.add (i32.add (i32.shl (local.get $classes) (i32.const 10)) (local.get $at)) (local.get $r)))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (local.set $x (i32.add (local.get $x) (i32.const 1)))
    (br $each)))
  (block $done (loop $each_c
    (br_if $done (i32.ge_u (local.get $c) (local.get $classes)))
    (local.set $least (f64.const inf)) (local.set $p (i32.const 0))
    (i32.store8 (i32.add (local.get $chosen) (local.get $c)) (i32.const 0))
    (loop $each_p
      (local.set $bits (call $entropy (i32.add (local.get $counts) (i32.shl (i32.mul (i32.add (i32.mul (local.get $p) (local.get $classes)) (local.get $c)) (i32.const 512)) (i32.const 2)))
        (i32.const 512) (local.get $log)))
      (if (f64.lt (local.get $bits) (local.get $least)) (then (local.set $least (local.get $bits)) (i32.store8 (i32.add (local.get $chosen) (local.get $c)) (local.get $p))))
      (local.set $p (i32.add (local.get $p) (i32.const 1)))
      (br_if $each_p (i32.lt_u (local.get $p) (i32.const 3))))
    (local.set $c (i32.add (local.get $c) (i32.const 1)))
    (br $each_c)))
  (local.set $i (i32.const 0))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $p (i32.load8_u (i32.add (local.get $chosen) (i32.load8_u (i32.add (local.get $contexts) (local.get $i))))))
    (if (local.get $p) (then
      (local.set $a (i32.add (select (local.get $byNorth) (local.get $byGradient) (i32.eq (local.get $p) (i32.const 1))) (i32.shl (local.get $i) (i32.const 2))))
      (i32.store (i32.add (local.get $values) (i32.shl (local.get $i) (i32.const 2))) (i32.load (local.get $a)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each))))
(func $packSigned (param $v i32) (result i32)
  (select (i32.shl (local.get $v) (i32.const 1)) (i32.sub (i32.mul (local.get $v) (i32.const -2)) (i32.const 1)) (i32.ge_s (local.get $v) (i32.const 0))))
(func $countAt (param $counts i32) (param $size i32) (param $at i32)
  (local $a i32)
  (if (i32.lt_u (local.get $at) (local.get $size)) (then
    (local.set $a (i32.add (local.get $counts) (i32.shl (local.get $at) (i32.const 2))))
    (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1))))))
;; capture-codec.mjs rowsBits: a rows model's pieces' bits, its copies' (with $copies) then each of its $classes contexts'
;; literals by entropy (512 counts a context at $counts, zeroed here).
(func (export "rowsBits") (param $values i32) (param $distances i32) (param $contexts i32) (param $count i32) (param $classes i32)
  (param $copies i32) (param $counts i32) (param $log i32) (result f64)
  (local $i i32) (local $v i32) (local $d i32) (local $size i32) (local $raw i64) (local $bits f64) (local $c i32)
  (local.set $size (i32.shl (local.get $classes) (i32.const 9)))
  (memory.fill (local.get $counts) (i32.const 0) (i32.shl (local.get $size) (i32.const 2)))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $count)))
    (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $i) (i32.const 2)))))
    (local.set $d (i32.load (i32.add (local.get $distances) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.and (local.get $copies) (i32.ne (local.get $d) (i32.const 0)))
      (then (local.set $raw (i64.add (local.get $raw) (i64.extend_i32_s (i32.sub (i32.add (i32.add (i32.const 10)
        (select (i32.const 0) (i32.sub (i32.const 29) (i32.clz (local.get $v))) (i32.lt_u (local.get $v) (i32.const 16)))) (i32.const 31))
        (i32.clz (i32.add (local.get $d) (i32.const 1))))))))
      (else (call $countAt (local.get $counts) (local.get $size)
        (i32.add (i32.shl (i32.load8_u (i32.add (local.get $contexts) (local.get $i))) (i32.const 9)) (local.get $v)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  (local.set $bits (f64.convert_i64_s (local.get $raw)))
  (block $done (loop $each_c
    (br_if $done (i32.ge_u (local.get $c) (local.get $classes)))
    (local.set $bits (f64.add (local.get $bits) (call $entropy (i32.add (local.get $counts) (i32.shl (local.get $c) (i32.const 11))) (i32.const 512) (local.get $log))))
    (local.set $c (i32.add (local.get $c) (i32.const 1)))
    (br $each_c)))
  (local.get $bits))

;; capture-codec.mjs countKeys: the $n u32 keys at $keys (histogram x 2^20 + value) sorted (three stable 11-bit radix
;; passes through $scratch, $n u32, with 2048 u32 counts at $digits), then each distinct key's value (u32 low 20 bits) at
;; $values and its count at $counts, and where each of the $hn histograms' entries start at $starts ($hn + 1 i32).
;; Answers how many distinct keys.
(func (export "keyCounts") (param $keys i32) (param $n i32) (param $scratch i32) (param $digits i32) (param $values i32)
  (param $counts i32) (param $starts i32) (param $hn i32) (result i32)
  (local $shift i32) (local $i i32) (local $from i32) (local $to i32) (local $t i32) (local $b i32) (local $sum i32) (local $c i32)
  (local $key i32) (local $a i32) (local $k i32) (local $h i32) (local $run i32)
  (local.set $from (local.get $keys)) (local.set $to (local.get $scratch))
  (block $sorted (loop $pass
    (br_if $sorted (i32.ge_u (local.get $shift) (i32.const 32)))
    (memory.fill (local.get $digits) (i32.const 0) (i32.const 8192))
    (local.set $i (i32.const 0))
    (block $done (loop $count
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (local.set $a (i32.add (local.get $digits) (i32.shl (i32.and (i32.shr_u (i32.load (i32.add (local.get $from) (i32.shl (local.get $i) (i32.const 2)))) (local.get $shift)) (i32.const 2047)) (i32.const 2))))
      (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $count)))
    (local.set $b (i32.const 0)) (local.set $sum (i32.const 0))
    (block $done (loop $prefix
      (br_if $done (i32.ge_u (local.get $b) (i32.const 2048)))
      (local.set $a (i32.add (local.get $digits) (i32.shl (local.get $b) (i32.const 2))))
      (local.set $c (i32.load (local.get $a)))
      (i32.store (local.get $a) (local.get $sum))
      (local.set $sum (i32.add (local.get $sum) (local.get $c)))
      (local.set $b (i32.add (local.get $b) (i32.const 1)))
      (br $prefix)))
    (local.set $i (i32.const 0))
    (block $done (loop $place
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (local.set $key (i32.load (i32.add (local.get $from) (i32.shl (local.get $i) (i32.const 2)))))
      (local.set $a (i32.add (local.get $digits) (i32.shl (i32.and (i32.shr_u (local.get $key) (local.get $shift)) (i32.const 2047)) (i32.const 2))))
      (i32.store (i32.add (local.get $to) (i32.shl (i32.load (local.get $a)) (i32.const 2))) (local.get $key))
      (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $place)))
    (local.set $t (local.get $from)) (local.set $from (local.get $to)) (local.set $to (local.get $t))
    (local.set $shift (i32.add (local.get $shift) (i32.const 11)))
    (br $pass)))
  ;; The distinct keys in order, with their counts and each histogram's first entry.
  (local.set $i (i32.const 0)) (local.set $h (i32.const 0))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $key (i32.load (i32.add (local.get $from) (i32.shl (local.get $i) (i32.const 2)))))
    (local.set $run (local.get $i))
    (block $same (loop $more
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $same (i32.ge_u (local.get $i) (local.get $n)))
      (br_if $more (i32.eq (i32.load (i32.add (local.get $from) (i32.shl (local.get $i) (i32.const 2)))) (local.get $key)))))
    (block $set (loop $open
      (br_if $set (i32.gt_u (local.get $h) (i32.shr_u (local.get $key) (i32.const 20))))
      (i32.store (i32.add (local.get $starts) (i32.shl (local.get $h) (i32.const 2))) (local.get $k))
      (local.set $h (i32.add (local.get $h) (i32.const 1)))
      (br $open)))
    (i32.store (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2))) (i32.and (local.get $key) (i32.const 0xfffff)))
    (i32.store (i32.add (local.get $counts) (i32.shl (local.get $k) (i32.const 2))) (i32.sub (local.get $i) (local.get $run)))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $each)))
  (block $set (loop $close
    (br_if $set (i32.gt_u (local.get $h) (local.get $hn)))
    (i32.store (i32.add (local.get $starts) (i32.shl (local.get $h) (i32.const 2))) (local.get $k))
    (local.set $h (i32.add (local.get $h) (i32.const 1)))
    (br $close)))
  (local.get $k))

;; capture-codec.mjs pieceBins: each of $count pieces' token (u8 at $tokens: hybrid under uintConfig(4, 1, 1), copy
;; lengths from 64) and bins (u8, property p's at $bins + p * count): y ($yBin), x ($xBin), and W and N through
;; $binOf (u8 by colour); with $props 7 also the signs of W - NW, NW - N and N - NE on the colours' $remap (i32), bins 0,
;; 1 and 2 for below, at and above zero; and $order the pieces in order. The plane is $w wide (u16 at $plane, $colours
;; colours); pieces are $values and $distances (i32), copies of $minimum or more. Answers 0, or -1 for a colour past
;; $colours.
(func (export "pieceBins") (param $plane i32) (param $w i32) (param $values i32) (param $distances i32) (param $count i32)
  (param $minimum i32) (param $yBin i32) (param $xBin i32) (param $binOf i32) (param $remap i32) (param $colours i32)
  (param $tokens i32) (param $bins i32) (param $order i32) (param $props i32) (result i32)
  (local $k i32) (local $x i32) (local $y i32) (local $at i32) (local $west i32) (local $north i32) (local $nw i32) (local $ne i32)
  (local $d i32) (local $v i32) (local $e i32) (local $t i32) (local $W i32) (local $N i32) (local $NW i32) (local $NE i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $k) (local.get $count)))
    (local.set $north (i32.const -1)) (local.set $west (i32.const -1))
    (if (local.get $y) (then (local.set $north (i32.load16_u (i32.add (local.get $plane) (i32.shl (i32.sub (local.get $at) (local.get $w)) (i32.const 1)))))))
    (local.set $west (if (result i32) (local.get $x) (then (i32.load16_u (i32.add (local.get $plane) (i32.shl (i32.sub (local.get $at) (i32.const 1)) (i32.const 1)))))
      (else (local.get $north))))
    (if (i32.eqz (local.get $y)) (then (local.set $north (local.get $west))))
    (if (i32.or (i32.ge_s (local.get $west) (local.get $colours)) (i32.ge_s (local.get $north) (local.get $colours))) (then (return (i32.const -1))))
    (local.set $d (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2)))))
    (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2)))))
    (local.set $t (if (result i32) (local.get $d) (then (select (local.get $v) (i32.const 16383) (i32.lt_s (local.get $v) (i32.const 16383)))) (else (local.get $v))))
    (if (i32.ge_u (local.get $t) (i32.const 16)) (then
      (local.set $e (i32.sub (i32.const 31) (i32.clz (local.get $t))))
      (local.set $t (i32.add (i32.const 16) (i32.or (i32.or (i32.shl (i32.sub (local.get $e) (i32.const 4)) (i32.const 2))
        (i32.shl (i32.and (i32.shr_u (local.get $t) (i32.sub (local.get $e) (i32.const 1))) (i32.const 1)) (i32.const 1))) (i32.and (local.get $t) (i32.const 1)))))))
    (if (i32.gt_s (local.get $t) (i32.const 63)) (then (local.set $t (i32.const 63))))
    (i32.store8 (i32.add (local.get $tokens) (local.get $k)) (i32.add (local.get $t) (select (i32.const 64) (i32.const 0) (local.get $d))))
    (i32.store8 (i32.add (local.get $bins) (local.get $k)) (i32.load8_u (i32.add (local.get $yBin) (local.get $y))))
    (i32.store8 (i32.add (i32.add (local.get $bins) (local.get $count)) (local.get $k)) (i32.load8_u (i32.add (local.get $xBin) (local.get $x))))
    (i32.store8 (i32.add (i32.add (local.get $bins) (i32.shl (local.get $count) (i32.const 1))) (local.get $k))
      (if (result i32) (i32.lt_s (local.get $west) (i32.const 0)) (then (i32.const 0)) (else (i32.load8_u (i32.add (local.get $binOf) (local.get $west))))))
    (i32.store8 (i32.add (i32.add (local.get $bins) (i32.mul (local.get $count) (i32.const 3))) (local.get $k))
      (if (result i32) (i32.lt_s (local.get $north) (i32.const 0)) (then (i32.const 0)) (else (i32.load8_u (i32.add (local.get $binOf) (local.get $north))))))
    (if (i32.gt_s (local.get $props) (i32.const 4)) (then
      ;; The signs on the remapped colours, with the decoder's edges.
      (local.set $W (if (result i32) (i32.lt_s (local.get $west) (i32.const 0)) (then (i32.const 0)) (else (call $remapped (local.get $remap) (local.get $west)))))
      (local.set $N (if (result i32) (local.get $y) (then (call $remapped (local.get $remap) (local.get $north))) (else (local.get $W))))
      (local.set $NW (local.get $W)) (local.set $NE (local.get $N))
      (if (i32.and (i32.ne (local.get $x) (i32.const 0)) (i32.ne (local.get $y) (i32.const 0))) (then
        (local.set $nw (i32.load16_u (i32.add (local.get $plane) (i32.shl (i32.sub (i32.sub (local.get $at) (local.get $w)) (i32.const 1)) (i32.const 1)))))
        (if (i32.ge_s (local.get $nw) (local.get $colours)) (then (return (i32.const -1))))
        (local.set $NW (call $remapped (local.get $remap) (local.get $nw)))))
      (if (i32.and (i32.ne (local.get $y) (i32.const 0)) (i32.lt_s (i32.add (local.get $x) (i32.const 1)) (local.get $w))) (then
        (local.set $ne (i32.load16_u (i32.add (local.get $plane) (i32.shl (i32.add (i32.sub (local.get $at) (local.get $w)) (i32.const 1)) (i32.const 1)))))
        (if (i32.ge_s (local.get $ne) (local.get $colours)) (then (return (i32.const -1))))
        (local.set $NE (call $remapped (local.get $remap) (local.get $ne)))))
      (i32.store8 (i32.add (i32.add (local.get $bins) (i32.shl (local.get $count) (i32.const 2))) (local.get $k)) (call $sign3 (i32.sub (local.get $W) (local.get $NW))))
      (i32.store8 (i32.add (i32.add (local.get $bins) (i32.mul (local.get $count) (i32.const 5))) (local.get $k)) (call $sign3 (i32.sub (local.get $NW) (local.get $N))))
      (i32.store8 (i32.add (i32.add (local.get $bins) (i32.mul (local.get $count) (i32.const 6))) (local.get $k)) (call $sign3 (i32.sub (local.get $N) (local.get $NE))))))
    (i32.store (i32.add (local.get $order) (i32.shl (local.get $k) (i32.const 2))) (local.get $k))
    (local.set $x (i32.add (local.get $x) (if (result i32) (local.get $d) (then (i32.add (local.get $v) (local.get $minimum))) (else (i32.const 1)))))
    (block $row (loop $wrap
      (br_if $row (i32.lt_s (local.get $x) (local.get $w)))
      (local.set $x (i32.sub (local.get $x) (local.get $w)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $wrap)))
    (local.set $at (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x)))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $each)))
  (i32.const 0))
(func $remapped (param $remap i32) (param $c i32) (result i32)
  (i32.load (i32.add (local.get $remap) (i32.shl (local.get $c) (i32.const 2)))))
(func $sign3 (param $v i32) (result i32)
  (select (i32.const 0) (select (i32.const 2) (i32.const 1) (local.get $v)) (i32.lt_s (local.get $v) (i32.const 0))))

;; capture-ans.mjs captureAnsTokens over one model's $count pieces ($values, $distances i32, $contexts u8; $hmap: each
;; context's histogram, i32): a literal's token in its histogram, a copy's length (at $minSymbol) in its histogram and
;; its distance in histogram 0, each histogram $offset on, as ans.mjs's tags (histogram << 16 | raw bit count << 9 |
;; symbol, u32 at $tags from token $at) and counted into $freqs (256 u32 a histogram). A token with raw bits stores them
;; (u32) where the cursor at $bits points, and moves it on: a photograph's tokens are 7.5% of them. $configs: 16
;; bytes a histogram (split, msb, lsb, splitToken). Answers the next token, or -1 where a literal's symbol reaches $room
;; or a copy's symbol passes 255.
(func (export "ansTokens") (param $values i32) (param $distances i32) (param $contexts i32) (param $count i32) (param $hmap i32)
  (param $configs i32) (param $offset i32) (param $room i32) (param $lengthConfig i32) (param $distanceConfig i32) (param $minSymbol i32)
  (param $spatial i32) (param $sLen i32) (param $sCodes i32) (param $tags i32) (param $bits i32) (param $at i32) (param $freqs i32) (result i32)
  (local $k i32) (local $h i32) (local $v i32) (local $d i32) (local $t i64) (local $s i32) (local $target i32) (local $e i32) (local $b i32)
  (local.set $b (i32.load (local.get $bits)))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $k) (local.get $count)))
    (local.set $h (i32.load (i32.add (local.get $hmap) (i32.shl (i32.load8_u (i32.add (local.get $contexts) (local.get $k))) (i32.const 2)))))
    (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2)))))
    (local.set $d (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2)))))
    (local.set $target (i32.add (local.get $h) (local.get $offset)))
    (if (i32.eqz (local.get $d))
      (then
        (local.set $t (call $hybrid (i32.add (local.get $configs) (i32.shl (local.get $h) (i32.const 4))) (local.get $v)))
        (local.set $s (i32.and (i32.wrap_i64 (local.get $t)) (i32.const 65535)))
        (if (i32.ge_u (local.get $s) (local.get $room)) (then (return (i32.const -1)))))
      (else
        (local.set $t (call $hybrid (local.get $lengthConfig) (local.get $v)))
        (local.set $s (i32.add (local.get $minSymbol) (i32.and (i32.wrap_i64 (local.get $t)) (i32.const 65535))))
        (if (i32.gt_u (local.get $s) (i32.const 255)) (then (return (i32.const -1))))))
    (i32.store (i32.add (local.get $tags) (i32.shl (local.get $at) (i32.const 2)))
      (i32.or (i32.or (i32.shl (local.get $target) (i32.const 16)) (i32.shl (i32.and (i32.shr_u (i32.wrap_i64 (local.get $t)) (i32.const 16)) (i32.const 255)) (i32.const 9))) (local.get $s)))
    (if (i32.and (i32.wrap_i64 (i64.shr_u (local.get $t) (i64.const 16))) (i32.const 255)) (then
      (i32.store (local.get $b) (i32.wrap_i64 (i64.shr_u (local.get $t) (i64.const 32)))) (local.set $b (i32.add (local.get $b) (i32.const 4)))))
    (local.set $e (i32.add (local.get $freqs) (i32.shl (i32.add (i32.shl (local.get $target) (i32.const 8)) (local.get $s)) (i32.const 2))))
    (i32.store (local.get $e) (i32.add (i32.load (local.get $e)) (i32.const 1)))
    (local.set $at (i32.add (local.get $at) (i32.const 1)))
    (if (local.get $d) (then
      ;; The distance: a spatial code (one distance each) or d + 119.
      (local.set $v (if (result i32) (local.get $spatial)
        (then
          (local.set $e (i32.const -1))
          (if (i32.lt_u (local.get $d) (local.get $sLen)) (then (local.set $e (i32.load16_s (i32.add (local.get $sCodes) (i32.shl (local.get $d) (i32.const 1)))))))
          (select (local.get $e) (i32.add (local.get $d) (i32.const 119)) (i32.ge_s (local.get $e) (i32.const 0))))
        (else (select (i32.const 1) (i32.add (local.get $d) (i32.const 119)) (i32.eq (local.get $d) (i32.const 1))))))
      (local.set $t (call $hybrid (local.get $distanceConfig) (local.get $v)))
      (local.set $s (i32.and (i32.wrap_i64 (local.get $t)) (i32.const 65535)))
      (if (i32.gt_u (local.get $s) (i32.const 255)) (then (return (i32.const -1))))
      (i32.store (i32.add (local.get $tags) (i32.shl (local.get $at) (i32.const 2)))
        (i32.or (i32.shl (i32.and (i32.shr_u (i32.wrap_i64 (local.get $t)) (i32.const 16)) (i32.const 255)) (i32.const 9)) (local.get $s)))
      (if (i32.and (i32.wrap_i64 (i64.shr_u (local.get $t) (i64.const 16))) (i32.const 255)) (then
      (i32.store (local.get $b) (i32.wrap_i64 (i64.shr_u (local.get $t) (i64.const 32)))) (local.set $b (i32.add (local.get $b) (i32.const 4)))))
      (local.set $e (i32.add (local.get $freqs) (i32.shl (local.get $s) (i32.const 2))))
      (i32.store (local.get $e) (i32.add (i32.load (local.get $e)) (i32.const 1)))
      (local.set $at (i32.add (local.get $at) (i32.const 1)))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $each)))
  (i32.store (local.get $bits) (local.get $b))
  (local.get $at))

;; local.mjs's per-group Modular coder. The plane is $w x $h i32 samples at $plane; W, N and NW follow the decoder's
;; edges (W of the first column is N, of the first pixel 0). Sums are i64, as the JavaScript's doubles never wrap.
(func $edges (param $plane i32) (param $w i32) (param $x i32) (param $y i32) (param $i i32) (param $out i32)
  (local $left i64) (local $top i64)
  (local.set $left (if (result i64) (local.get $x) (then (i64.load32_s (i32.add (local.get $plane) (i32.shl (i32.sub (local.get $i) (i32.const 1)) (i32.const 2)))))
    (else (if (result i64) (local.get $y) (then (i64.load32_s (i32.add (local.get $plane) (i32.shl (i32.sub (local.get $i) (local.get $w)) (i32.const 2))))) (else (i64.const 0))))))
  (local.set $top (if (result i64) (local.get $y) (then (i64.load32_s (i32.add (local.get $plane) (i32.shl (i32.sub (local.get $i) (local.get $w)) (i32.const 2))))) (else (local.get $left))))
  (i64.store (local.get $out) (local.get $left))
  (i64.store offset=8 (local.get $out) (local.get $top))
  (i64.store offset=16 (local.get $out) (if (result i64) (i32.and (i32.ne (local.get $x) (i32.const 0)) (i32.ne (local.get $y) (i32.const 0)))
    (then (i64.load32_s (i32.add (local.get $plane) (i32.shl (i32.sub (i32.sub (local.get $i) (local.get $w)) (i32.const 1)) (i32.const 2))))) (else (local.get $left)))))
;; local.mjs residuals: predictor 5 (the clamped gradient) or 3 ((W + N) / 2 toward zero), each residual packed signed
;; (u32 at $out). $scratch: 24 bytes.
(func (export "localResiduals") (param $plane i32) (param $w i32) (param $h i32) (param $predictor i32) (param $out i32) (param $scratch i32)
  (local $x i32) (local $y i32) (local $i i32) (local $left i64) (local $top i64) (local $nw i64) (local $p i64) (local $lo i64) (local $hi i64) (local $r i32)
  (block $rows (loop $ys
    (br_if $rows (i32.ge_u (local.get $y) (local.get $h)))
    (local.set $x (i32.const 0))
    (block $cols (loop $xs
      (br_if $cols (i32.ge_u (local.get $x) (local.get $w)))
      (call $edges (local.get $plane) (local.get $w) (local.get $x) (local.get $y) (local.get $i) (local.get $scratch))
      (local.set $left (i64.load (local.get $scratch))) (local.set $top (i64.load offset=8 (local.get $scratch))) (local.set $nw (i64.load offset=16 (local.get $scratch)))
      (if (i32.eq (local.get $predictor) (i32.const 3))
        (then (local.set $p (i64.div_s (i64.add (local.get $left) (local.get $top)) (i64.const 2))))
        (else
          (local.set $lo (select (local.get $left) (local.get $top) (i64.lt_s (local.get $left) (local.get $top))))
          (local.set $hi (select (local.get $left) (local.get $top) (i64.gt_s (local.get $left) (local.get $top))))
          (local.set $p (i64.sub (i64.add (local.get $left) (local.get $top)) (local.get $nw)))
          (local.set $p (select (local.get $hi) (local.get $p) (i64.lt_s (local.get $hi) (local.get $p))))
          (local.set $p (select (local.get $lo) (local.get $p) (i64.gt_s (local.get $lo) (local.get $p))))))
      ;; (value - prediction) | 0, packed signed.
      (local.set $r (i32.wrap_i64 (i64.sub (i64.load32_s (i32.add (local.get $plane) (i32.shl (local.get $i) (i32.const 2)))) (i64.extend_i32_s (i32.wrap_i64 (local.get $p))))))
      (i32.store (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 2))) (i32.xor (i32.shl (local.get $r) (i32.const 1)) (i32.shr_s (local.get $r) (i32.const 31))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys))))
;; local.mjs localProperties: property 9 (W + N - NW) or 10 (W - NW) as i32 at $out; answers 0, or -1 where one passes i32.
(func (export "localProperties") (param $plane i32) (param $w i32) (param $h i32) (param $property i32) (param $out i32) (param $scratch i32) (result i32)
  (local $x i32) (local $y i32) (local $i i32) (local $v i64)
  (block $rows (loop $ys
    (br_if $rows (i32.ge_u (local.get $y) (local.get $h)))
    (local.set $x (i32.const 0))
    (block $cols (loop $xs
      (br_if $cols (i32.ge_u (local.get $x) (local.get $w)))
      (call $edges (local.get $plane) (local.get $w) (local.get $x) (local.get $y) (local.get $i) (local.get $scratch))
      (local.set $v (i64.sub (i64.load (local.get $scratch)) (i64.load offset=16 (local.get $scratch))))
      (if (i32.eq (local.get $property) (i32.const 9)) (then (local.set $v (i64.add (local.get $v) (i64.load offset=8 (local.get $scratch))))))
      (if (i64.ne (local.get $v) (i64.extend_i32_s (i32.wrap_i64 (local.get $v)))) (then (return (i32.const -1))))
      (i32.store (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 2))) (i32.wrap_i64 (local.get $v)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  (i32.const 0))
;; local.mjs tokenContext: 0 without cuts ($mode 0), the number of the $ncuts ascending i32 cuts below property i ($mode
;; 1), or property i itself (learned, $mode 2).
(func $localContext (param $props i32) (param $mode i32) (param $cuts i32) (param $ncuts i32) (param $i i32) (result i32)
  (local $p i32) (local $lo i32) (local $hi i32) (local $mid i32)
  (if (i32.eqz (local.get $mode)) (then (return (i32.const 0))))
  (local.set $p (i32.load (i32.add (local.get $props) (i32.shl (local.get $i) (i32.const 2)))))
  (if (i32.eq (local.get $mode) (i32.const 2)) (then (return (local.get $p))))
  (local.set $hi (local.get $ncuts))
  (block $done (loop $search
    (br_if $done (i32.ge_s (local.get $lo) (local.get $hi)))
    (local.set $mid (i32.shr_s (i32.add (local.get $lo) (local.get $hi)) (i32.const 1)))
    (if (i32.gt_s (local.get $p) (i32.load (i32.add (local.get $cuts) (i32.shl (local.get $mid) (i32.const 2)))))
      (then (local.set $lo (i32.add (local.get $mid) (i32.const 1)))) (else (local.set $hi (local.get $mid))))
    (br $search)))
  (local.get $lo))
;; local.mjs visitTokens over the $n u32 residuals at $values: each value a token, a zero run past $minLength one zero
;; then its length (at $minSymbol, $lenCfg), shorter runs as zeros. With $action 0 each token is counted into $out
;; ($alphabet u32 a context, a symbol past the alphabet dropped); with 1 it is written as ans.mjs's tag (histogram
;; $first + $map[context] when $map, else + context) to $out (u32) and its raw bits to $extra; answers the token count.
(func (export "localTokens") (param $values i32) (param $n i32) (param $props i32) (param $mode i32) (param $cuts i32) (param $ncuts i32)
  (param $action i32) (param $out i32) (param $extra i32) (param $alphabet i32) (param $resCfg i32) (param $lenCfg i32) (param $minLength i32)
  (param $minSymbol i32) (param $first i32) (param $map i32) (result i32)
  (local $i i32) (local $run i32) (local $v i32) (local $used i32) (local $k i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $run (i32.const 1))
    (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.eqz (local.get $v)) (then
      (block $end (loop $zeros
        (br_if $end (i32.ge_u (i32.add (local.get $i) (local.get $run)) (local.get $n)))
        (br_if $end (i32.load (i32.add (local.get $values) (i32.shl (i32.add (local.get $i) (local.get $run)) (i32.const 2)))))
        (local.set $run (i32.add (local.get $run) (i32.const 1)))
        (br $zeros)))))
    (local.set $used (call $localEmit (local.get $i) (local.get $v) (i32.const 0) (local.get $props) (local.get $mode) (local.get $cuts) (local.get $ncuts)
      (local.get $action) (local.get $out) (local.get $extra) (local.get $alphabet) (local.get $resCfg) (local.get $lenCfg) (local.get $first) (local.get $map) (local.get $used)))
    (if (i32.gt_u (local.get $run) (local.get $minLength))
      (then (local.set $used (call $localEmit (i32.add (local.get $i) (i32.const 1)) (i32.sub (i32.sub (local.get $run) (i32.const 1)) (local.get $minLength)) (local.get $minSymbol)
        (local.get $props) (local.get $mode) (local.get $cuts) (local.get $ncuts) (local.get $action) (local.get $out) (local.get $extra) (local.get $alphabet)
        (local.get $resCfg) (local.get $lenCfg) (local.get $first) (local.get $map) (local.get $used))))
      (else
        (local.set $k (i32.const 1))
        (block $zs (loop $z
          (br_if $zs (i32.ge_u (local.get $k) (local.get $run)))
          (local.set $used (call $localEmit (i32.add (local.get $i) (local.get $k)) (i32.const 0) (i32.const 0) (local.get $props) (local.get $mode) (local.get $cuts)
            (local.get $ncuts) (local.get $action) (local.get $out) (local.get $extra) (local.get $alphabet) (local.get $resCfg) (local.get $lenCfg) (local.get $first)
            (local.get $map) (local.get $used)))
          (local.set $k (i32.add (local.get $k) (i32.const 1)))
          (br $z)))))
    (local.set $i (i32.add (local.get $i) (local.get $run)))
    (br $each)))
  (local.get $used))
(func $localEmit (param $i i32) (param $value i32) (param $base i32) (param $props i32) (param $mode i32) (param $cuts i32) (param $ncuts i32)
  (param $action i32) (param $out i32) (param $extra i32) (param $alphabet i32) (param $resCfg i32) (param $lenCfg i32) (param $first i32) (param $map i32)
  (param $used i32) (result i32)
  (local $context i32) (local $t i64) (local $s i32) (local $a i32)
  (local.set $context (call $localContext (local.get $props) (local.get $mode) (local.get $cuts) (local.get $ncuts) (local.get $i)))
  (local.set $t (call $hybrid (select (local.get $lenCfg) (local.get $resCfg) (local.get $base)) (local.get $value)))
  (local.set $s (i32.add (local.get $base) (i32.and (i32.wrap_i64 (local.get $t)) (i32.const 65535))))
  (if (i32.eqz (local.get $action)) (then
    (if (i32.lt_u (local.get $s) (local.get $alphabet)) (then
      (local.set $a (i32.add (local.get $out) (i32.shl (i32.add (i32.mul (local.get $context) (local.get $alphabet)) (local.get $s)) (i32.const 2))))
      (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))))
    (return (local.get $used))))
  (if (local.get $map) (then (local.set $context (i32.load8_u (i32.add (local.get $map) (local.get $context))))))
  (i32.store (i32.add (local.get $out) (i32.shl (local.get $used) (i32.const 2)))
    (i32.or (i32.or (local.get $s) (i32.shl (i32.and (i32.shr_u (i32.wrap_i64 (local.get $t)) (i32.const 16)) (i32.const 255)) (i32.const 9)))
      (i32.shl (i32.add (local.get $first) (local.get $context)) (i32.const 16))))
  (i32.store (i32.add (local.get $extra) (i32.shl (local.get $used) (i32.const 2))) (i32.wrap_i64 (i64.shr_u (local.get $t) (i64.const 32))))
  (i32.add (local.get $used) (i32.const 1)))
;; local.mjs writeModel's tokens from residual $from of $n: each token's code ($codes: code and length, u32 each, $alphabet a
;; histogram, a length of 255 for a symbol the code lacks) and raw bits after the BitWriter state at $state (pending bits
;; i64, their count i32, then the output end i32 written back), bytes from $out until past $limit. Answers the next
;; residual, or -1 for a symbol the code lacks.
(func (export "localWrite") (param $values i32) (param $from i32) (param $n i32) (param $props i32) (param $mode i32) (param $cuts i32) (param $ncuts i32)
  (param $codes i32) (param $alphabet i32) (param $resCfg i32) (param $lenCfg i32) (param $minLength i32) (param $minSymbol i32) (param $map i32)
  (param $out i32) (param $limit i32) (param $state i32) (result i32)
  (local $i i32) (local $run i32) (local $v i32) (local $k i32) (local $res i64) (local $pending i32) (local $t i64) (local $s i32) (local $e i32)
  (local $len i32) (local $c i32) (local $j i32) (local $value i32) (local $base i32) (local $step i32) (local $adv i32)
  (local.set $i (local.get $from))
  (local.set $res (i64.load (local.get $state)))
  (local.set $pending (i32.load offset=8 (local.get $state)))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (br_if $done (i32.gt_u (local.get $out) (local.get $limit)))
    (local.set $run (i32.const 1))
    (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.eqz (local.get $v)) (then
      (block $end (loop $zeros
        (br_if $end (i32.ge_u (i32.add (local.get $i) (local.get $run)) (local.get $n)))
        (br_if $end (i32.load (i32.add (local.get $values) (i32.shl (i32.add (local.get $i) (local.get $run)) (i32.const 2)))))
        (local.set $run (i32.add (local.get $run) (i32.const 1)))
        (br $zeros)))))
    ;; Its tokens: the value; then the run's length, or its other zeros one a token.
    (local.set $step (i32.const 0))
    (block $tokens (loop $token
      (if (i32.eqz (local.get $step))
        (then (local.set $j (local.get $i)) (local.set $value (local.get $v)) (local.set $base (i32.const 0)))
        (else
          (br_if $tokens (i32.ge_u (local.get $step) (select (i32.const 2) (local.get $run) (i32.gt_u (local.get $run) (local.get $minLength)))))
          (local.set $j (i32.add (local.get $i) (local.get $step)))
          (if (i32.gt_u (local.get $run) (local.get $minLength))
            (then (local.set $value (i32.sub (i32.sub (local.get $run) (i32.const 1)) (local.get $minLength))) (local.set $base (local.get $minSymbol)))
            (else (local.set $value (i32.const 0)) (local.set $base (i32.const 0))))))
      (local.set $c (call $localContext (local.get $props) (local.get $mode) (local.get $cuts) (local.get $ncuts) (local.get $j)))
      (if (local.get $map) (then (local.set $c (i32.load8_u (i32.add (local.get $map) (local.get $c))))))
      (local.set $t (call $hybrid (select (local.get $lenCfg) (local.get $resCfg) (local.get $base)) (local.get $value)))
      (local.set $s (i32.add (local.get $base) (i32.and (i32.wrap_i64 (local.get $t)) (i32.const 65535))))
      (if (i32.ge_u (local.get $s) (local.get $alphabet)) (then (return (i32.const -1))))
      (local.set $e (i32.add (local.get $codes) (i32.shl (i32.add (i32.mul (local.get $c) (local.get $alphabet)) (local.get $s)) (i32.const 3))))
      (local.set $len (i32.load offset=4 (local.get $e)))
      (if (i32.eq (local.get $len) (i32.const 255)) (then (return (i32.const -1))))
      ;; The code, then the raw bits, least significant first.
      (local.set $res (i64.or (local.get $res) (i64.shl (i64.or (i64.extend_i32_u (i32.load (local.get $e)))
        (i64.shl (i64.shr_u (local.get $t) (i64.const 32)) (i64.extend_i32_u (local.get $len)))) (i64.extend_i32_u (local.get $pending)))))
      (local.set $pending (i32.add (local.get $pending) (i32.add (local.get $len) (i32.and (i32.shr_u (i32.wrap_i64 (local.get $t)) (i32.const 16)) (i32.const 255)))))
      (i64.store (local.get $out) (local.get $res))
      (local.set $adv (i32.shr_u (local.get $pending) (i32.const 3)))
      (local.set $out (i32.add (local.get $out) (local.get $adv)))
      (local.set $res (if (result i64) (i32.ge_u (local.get $adv) (i32.const 8)) (then (i64.const 0)) (else (i64.shr_u (local.get $res) (i64.extend_i32_u (i32.shl (local.get $adv) (i32.const 3)))))))
      (local.set $pending (i32.and (local.get $pending) (i32.const 7)))
      (local.set $step (i32.add (local.get $step) (i32.const 1)))
      (br $token)))
    (local.set $i (i32.add (local.get $i) (local.get $run)))
    (br $each)))
  (i64.store (local.get $state) (local.get $res))
  (i32.store offset=8 (local.get $state) (local.get $pending))
  (i32.store offset=12 (local.get $state) (local.get $out))
  (local.get $i))

;; modular-channel.mjs codeChannel: the $w x $h i32 $plane (an Int16Array's when $short: lossy updates wrap to 16 bits)
;; from row $beginY under predictor 0-5, minus $offset; with $multiplier above 1 each residual is rounded as Math.round
;; rounds and the plane takes the decoder's value. $mode 3 writes the residuals (i32) to $target; otherwise each zero run
;; of $minRunLength + 1 or more is a zero and its length (RUN at $minRunSymbol), and each token is counted ($mode 0: into
;; $target's $targetLen u32 under $config; 1: raw, a literal's value into its bin and lengths into the last 33) or
;; written ($mode 2: $codes as localWrite's, $alphabet a code, from $out with the BitWriter state at $state). Answers 0, or
;; -1 for a symbol the code lacks or a predictor past 5.
(func (export "channelCode") (param $plane i32) (param $w i32) (param $h i32) (param $beginY i32) (param $predictor i32) (param $offset i32)
  (param $multiplier f64) (param $short i32) (param $mode i32) (param $target i32) (param $targetLen i32) (param $config i32) (param $runConfig i32)
  (param $minRunSymbol i32) (param $minRunLength i32) (param $codes i32) (param $alphabet i32) (param $out i32) (param $state i32) (result i32)
  (local $x i32) (local $y i32) (local $i i32) (local $left i64) (local $top i64) (local $nw i64) (local $grad i64) (local $p i64) (local $lo i64)
  (local $hi i64) (local $r i32) (local $q f64) (local $f f64) (local $run i32) (local $k i32) (local $res i64) (local $pending i32)
  (local.set $res (i64.load (local.get $state)))
  (local.set $pending (i32.load offset=8 (local.get $state)))
  (local.set $y (local.get $beginY))
  (local.set $i (i32.mul (local.get $beginY) (local.get $w)))
  (block $rows (loop $ys
    (br_if $rows (i32.ge_u (local.get $y) (local.get $h)))
    (local.set $x (i32.const 0))
    (block $cols (loop $xs
      (br_if $cols (i32.ge_u (local.get $x) (local.get $w)))
      (local.set $p (i64.const 0))
      (if (local.get $predictor) (then
        (local.set $left (if (result i64) (local.get $x) (then (i64.load32_s (i32.add (local.get $plane) (i32.shl (i32.sub (local.get $i) (i32.const 1)) (i32.const 2)))))
          (else (if (result i64) (local.get $y) (then (i64.load32_s (i32.add (local.get $plane) (i32.shl (i32.sub (local.get $i) (local.get $w)) (i32.const 2))))) (else (i64.const 0))))))
        (local.set $top (if (result i64) (local.get $y) (then (i64.load32_s (i32.add (local.get $plane) (i32.shl (i32.sub (local.get $i) (local.get $w)) (i32.const 2))))) (else (local.get $left))))
        (if (i32.eq (local.get $predictor) (i32.const 1)) (then (local.set $p (local.get $left)))
        (else (if (i32.eq (local.get $predictor) (i32.const 2)) (then (local.set $p (local.get $top)))
        (else (if (i32.eq (local.get $predictor) (i32.const 3)) (then (local.set $p (i64.extend_i32_s (i32.wrap_i64 (i64.div_s (i64.add (local.get $left) (local.get $top)) (i64.const 2))))))
        (else
          (if (i32.gt_u (local.get $predictor) (i32.const 5)) (then (return (i32.const -1))))
          (local.set $nw (if (result i64) (i32.and (i32.ne (local.get $x) (i32.const 0)) (i32.ne (local.get $y) (i32.const 0)))
            (then (i64.load32_s (i32.add (local.get $plane) (i32.shl (i32.sub (i32.sub (local.get $i) (local.get $w)) (i32.const 1)) (i32.const 2))))) (else (local.get $left))))
          (local.set $grad (i64.sub (i64.add (local.get $left) (local.get $top)) (local.get $nw)))
          (if (i32.eq (local.get $predictor) (i32.const 5))
            (then
              (local.set $lo (select (local.get $left) (local.get $top) (i64.lt_s (local.get $left) (local.get $top))))
              (local.set $hi (select (local.get $top) (local.get $left) (i64.lt_s (local.get $left) (local.get $top))))
              (local.set $p (select (local.get $lo) (select (local.get $hi) (local.get $grad) (i64.gt_s (local.get $grad) (local.get $hi))) (i64.lt_s (local.get $grad) (local.get $lo)))))
            (else (local.set $p (select (local.get $left) (local.get $top)
              (i64.lt_s (call $abs64 (i64.sub (local.get $grad) (local.get $left))) (call $abs64 (i64.sub (local.get $grad) (local.get $top))))))))))))))))
      (if (f64.eq (local.get $multiplier) (f64.const 1))
        (then (local.set $r (i32.wrap_i64 (i64.sub (i64.sub (i64.load32_s (i32.add (local.get $plane) (i32.shl (local.get $i) (i32.const 2)))) (local.get $p)) (i64.extend_i32_s (local.get $offset))))))
        (else
          ;; Math.round: the nearest integer, halves up.
          (local.set $q (f64.div (f64.convert_i64_s (i64.sub (i64.sub (i64.load32_s (i32.add (local.get $plane) (i32.shl (local.get $i) (i32.const 2)))) (local.get $p)) (i64.extend_i32_s (local.get $offset)))) (local.get $multiplier)))
          (local.set $f (f64.floor (local.get $q)))
          (if (f64.ge (f64.sub (local.get $q) (local.get $f)) (f64.const 0.5)) (then (local.set $f (f64.add (local.get $f) (f64.const 1)))))
          (local.set $r (i32.trunc_sat_f64_s (local.get $f)))
          (local.set $p (i64.add (i64.add (local.get $p) (i64.extend_i32_s (local.get $offset))) (i64.trunc_sat_f64_s (f64.mul (local.get $f) (local.get $multiplier)))))
          (i32.store (i32.add (local.get $plane) (i32.shl (local.get $i) (i32.const 2)))
            (if (result i32) (local.get $short) (then (i32.shr_s (i32.shl (i32.wrap_i64 (local.get $p)) (i32.const 16)) (i32.const 16))) (else (i32.wrap_i64 (local.get $p)))))))
      (if (i32.eq (local.get $mode) (i32.const 3))
        (then (i32.store (i32.add (local.get $target) (i32.shl (local.get $i) (i32.const 2))) (local.get $r)))
        (else
          (if (i32.eqz (local.get $r)) (then (local.set $run (i32.add (local.get $run) (i32.const 1))))
          (else
            (if (local.get $run) (then
              (if (call $channelFlush (local.get $run) (local.get $mode) (local.get $target) (local.get $targetLen) (local.get $config) (local.get $runConfig)
                (local.get $minRunSymbol) (local.get $minRunLength) (local.get $codes) (local.get $alphabet) (local.get $state)) (then (return (i32.const -1))))
              (local.set $run (i32.const 0))))
            (if (call $channelEmit (i32.xor (i32.shl (local.get $r) (i32.const 1)) (i32.shr_s (local.get $r) (i32.const 31))) (i32.const 0) (local.get $mode) (local.get $target)
              (local.get $targetLen) (local.get $config) (local.get $codes) (local.get $alphabet) (local.get $state)) (then (return (i32.const -1))))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  (if (i32.and (i32.ne (local.get $mode) (i32.const 3)) (i32.ne (local.get $run) (i32.const 0)))
    (then (if (call $channelFlush (local.get $run) (local.get $mode) (local.get $target) (local.get $targetLen) (local.get $config) (local.get $runConfig)
      (local.get $minRunSymbol) (local.get $minRunLength) (local.get $codes) (local.get $alphabet) (local.get $state)) (then (return (i32.const -1))))))
  (i32.const 0))
(func $abs64 (param $v i64) (result i64)
  (select (local.get $v) (i64.sub (i64.const 0) (local.get $v)) (i64.ge_s (local.get $v) (i64.const 0))))
;; A zero run: past $minRunLength a zero and its length, else its zeros. Answers 1 on a failed write.
(func $channelFlush (param $run i32) (param $mode i32) (param $target i32) (param $targetLen i32) (param $config i32) (param $runConfig i32)
  (param $minRunSymbol i32) (param $minRunLength i32) (param $codes i32) (param $alphabet i32) (param $state i32) (result i32)
  (local $k i32)
  (if (i32.ge_u (local.get $run) (i32.add (local.get $minRunLength) (i32.const 1))) (then
    (if (call $channelEmit (i32.const 0) (i32.const 0) (local.get $mode) (local.get $target) (local.get $targetLen) (local.get $config) (local.get $codes) (local.get $alphabet) (local.get $state))
      (then (return (i32.const 1))))
    (return (call $channelEmit (i32.sub (i32.sub (local.get $run) (local.get $minRunLength)) (i32.const 1)) (local.get $minRunSymbol) (local.get $mode) (local.get $target)
      (local.get $targetLen) (local.get $runConfig) (local.get $codes) (local.get $alphabet) (local.get $state)))))
  (block $done (loop $zeros
    (br_if $done (i32.ge_u (local.get $k) (local.get $run)))
    (if (call $channelEmit (i32.const 0) (i32.const 0) (local.get $mode) (local.get $target) (local.get $targetLen) (local.get $config) (local.get $codes) (local.get $alphabet) (local.get $state))
      (then (return (i32.const 1))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $zeros)))
  (i32.const 0))
;; One token of $value at $base under $cfg: counted ($mode 0), counted raw (1) or written (2). Answers 1 on a failed write.
(func $channelEmit (param $value i32) (param $base i32) (param $mode i32) (param $target i32) (param $targetLen i32) (param $cfg i32)
  (param $codes i32) (param $alphabet i32) (param $state i32) (result i32)
  (local $t i64) (local $s i32) (local $e i32) (local $len i32) (local $res i64) (local $pending i32) (local $out i32) (local $adv i32)
  (if (i32.and (i32.eq (local.get $mode) (i32.const 1)) (i32.eqz (local.get $base))) (then
    (if (i32.lt_u (local.get $value) (local.get $targetLen)) (then
      (local.set $e (i32.add (local.get $target) (i32.shl (local.get $value) (i32.const 2))))
      (i32.store (local.get $e) (i32.add (i32.load (local.get $e)) (i32.const 1)))))
    (return (i32.const 0))))
  (local.set $t (call $hybrid (local.get $cfg) (local.get $value)))
  (local.set $s (i32.add (select (i32.sub (local.get $targetLen) (i32.const 33)) (local.get $base) (i32.eq (local.get $mode) (i32.const 1)))
    (i32.and (i32.wrap_i64 (local.get $t)) (i32.const 65535))))
  (if (i32.lt_u (local.get $mode) (i32.const 2)) (then
    (if (i32.lt_u (local.get $s) (local.get $targetLen)) (then
      (local.set $e (i32.add (local.get $target) (i32.shl (local.get $s) (i32.const 2))))
      (i32.store (local.get $e) (i32.add (i32.load (local.get $e)) (i32.const 1)))))
    (return (i32.const 0))))
  (if (i32.ge_u (local.get $s) (local.get $alphabet)) (then (return (i32.const 1))))
  (local.set $e (i32.add (local.get $codes) (i32.shl (local.get $s) (i32.const 3))))
  (local.set $len (i32.load offset=4 (local.get $e)))
  (if (i32.eq (local.get $len) (i32.const 255)) (then (return (i32.const 1))))
  (local.set $res (i64.load (local.get $state)))
  (local.set $pending (i32.load offset=8 (local.get $state)))
  (local.set $out (i32.load offset=12 (local.get $state)))
  (local.set $res (i64.or (local.get $res) (i64.shl (i64.or (i64.extend_i32_u (i32.load (local.get $e)))
    (i64.shl (i64.shr_u (local.get $t) (i64.const 32)) (i64.extend_i32_u (local.get $len)))) (i64.extend_i32_u (local.get $pending)))))
  (local.set $pending (i32.add (local.get $pending) (i32.add (local.get $len) (i32.and (i32.shr_u (i32.wrap_i64 (local.get $t)) (i32.const 16)) (i32.const 255)))))
  (i64.store (local.get $out) (local.get $res))
  (local.set $adv (i32.shr_u (local.get $pending) (i32.const 3)))
  (i64.store (local.get $state) (i64.shr_u (local.get $res) (i64.extend_i32_u (i32.shl (local.get $adv) (i32.const 3)))))
  (i32.store offset=8 (local.get $state) (i32.and (local.get $pending) (i32.const 7)))
  (i32.store offset=12 (local.get $state) (i32.add (local.get $out) (local.get $adv)))
  (i32.const 0))

;; lossless.mjs nativePlaneFill: $n pixels of four i32 sample words at $words into $channels i32 planes at $out ($n apart).
;; With $tables (a pointer and a length a channel; a zero pointer for none) each channel's sample is its rank in that
;; ascending table (0 where it is not there), unshifted and unquantized. Otherwise colour is quantized ($qmode 0 none, 1
;; integer, 2 32-bit float, 3 16-bit float, $drop bits), grey or under RCT $rct (10: G, B - G, R - G; 6: YCoCg; else
;; R, G, B), shifted by $s0, $s1, $s2; alpha is the fourth word shifted by $sa.
(func (export "nativeFill") (param $words i32) (param $n i32) (param $channels i32) (param $alpha i32) (param $grey i32) (param $rct i32)
  (param $s0 i32) (param $s1 i32) (param $s2 i32) (param $sa i32) (param $qmode i32) (param $drop i32) (param $tables i32) (param $out i32)
  (local $i i32) (local $at i32) (local $c i32) (local $colour i32) (local $r i32) (local $g i32) (local $b i32) (local $co i32) (local $tmp i32)
  (local $cg i32) (local $plane i32)
  (local.set $colour (i32.sub (local.get $channels) (local.get $alpha)))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $at (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 4))))
    (if (local.get $tables)
      (then
        (local.set $c (i32.const 0))
        (block $cd (loop $cs
          (br_if $cd (i32.ge_u (local.get $c) (local.get $channels)))
          ;; Colour channel c reads word c; alpha (the last channel) reads word 3.
          (local.set $r (i32.load (i32.add (local.get $at) (i32.shl (select (i32.const 3) (local.get $c)
            (i32.and (local.get $alpha) (i32.eq (local.get $c) (i32.sub (local.get $channels) (i32.const 1))))) (i32.const 2)))))
          (local.set $plane (i32.add (local.get $tables) (i32.shl (local.get $c) (i32.const 3))))
          (if (i32.load (local.get $plane)) (then (local.set $r (call $rankOf (i32.load (local.get $plane)) (i32.load offset=4 (local.get $plane)) (local.get $r)))))
          (i32.store (i32.add (local.get $out) (i32.shl (i32.add (i32.mul (local.get $c) (local.get $n)) (local.get $i)) (i32.const 2))) (local.get $r))
          (local.set $c (i32.add (local.get $c) (i32.const 1)))
          (br $cs))))
      (else
        (local.set $r (call $quantize (i32.load (local.get $at)) (local.get $qmode) (local.get $drop)))
        (if (local.get $grey)
          (then (i32.store (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 2))) (i32.shr_s (local.get $r) (local.get $s0))))
          (else
            (local.set $g (call $quantize (i32.load offset=4 (local.get $at)) (local.get $qmode) (local.get $drop)))
            (local.set $b (call $quantize (i32.load offset=8 (local.get $at)) (local.get $qmode) (local.get $drop)))
            (if (i32.eq (local.get $rct) (i32.const 10))
              (then
                (local.set $co (i32.shr_s (local.get $g) (local.get $s0)))
                (local.set $tmp (i32.shr_s (i32.sub (local.get $b) (local.get $g)) (local.get $s1)))
                (local.set $cg (i32.shr_s (i32.sub (local.get $r) (local.get $g)) (local.get $s2))))
              (else (if (i32.eq (local.get $rct) (i32.const 6))
                (then
                  (local.set $co (i32.sub (local.get $r) (local.get $b)))
                  (local.set $tmp (i32.add (local.get $b) (i32.shr_s (local.get $co) (i32.const 1))))
                  (local.set $cg (i32.sub (local.get $g) (local.get $tmp)))
                  (local.set $tmp (i32.add (local.get $tmp) (i32.shr_s (local.get $cg) (i32.const 1))))
                  ;; Planes Y, Co, Cg.
                  (local.set $r (local.get $tmp)) (local.set $tmp (local.get $co)) (local.set $co (local.get $r)))
                (else
                  (local.set $co (i32.shr_s (local.get $r) (local.get $s0)))
                  (local.set $tmp (i32.shr_s (local.get $g) (local.get $s1)))
                  (local.set $cg (i32.shr_s (local.get $b) (local.get $s2)))))))
            (i32.store (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 2))) (local.get $co))
            (i32.store (i32.add (local.get $out) (i32.shl (i32.add (local.get $n) (local.get $i)) (i32.const 2))) (local.get $tmp))
            (i32.store (i32.add (local.get $out) (i32.shl (i32.add (i32.shl (local.get $n) (i32.const 1)) (local.get $i)) (i32.const 2))) (local.get $cg))))
        (if (local.get $alpha) (then
          (i32.store (i32.add (local.get $out) (i32.shl (i32.add (i32.mul (i32.sub (local.get $channels) (i32.const 1)) (local.get $n)) (local.get $i)) (i32.const 2)))
            (i32.shr_s (i32.load offset=12 (local.get $at)) (local.get $sa)))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each))))
;; The index of $v in the $len ascending i32 at $table, or 0 where it is not there (a Map's undefined, stored as 0).
(func $rankOf (param $table i32) (param $len i32) (param $v i32) (result i32)
  (local $lo i32) (local $hi i32) (local $mid i32) (local $m i32)
  (local.set $hi (local.get $len))
  (block $done (loop $search
    (br_if $done (i32.ge_s (local.get $lo) (local.get $hi)))
    (local.set $mid (i32.shr_u (i32.add (local.get $lo) (local.get $hi)) (i32.const 1)))
    (local.set $m (i32.load (i32.add (local.get $table) (i32.shl (local.get $mid) (i32.const 2)))))
    (if (i32.eq (local.get $m) (local.get $v)) (then (return (local.get $mid))))
    (if (i32.lt_s (local.get $m) (local.get $v)) (then (local.set $lo (i32.add (local.get $mid) (i32.const 1)))) (else (local.set $hi (local.get $mid))))
    (br $search)))
  (i32.const 0))
;; lossless.mjs nativeQuantizer's rounding of a sample word to $drop fewer bits.
(func $quantize (param $v i32) (param $mode i32) (param $drop i32) (result i32)
  (local $step i32) (local $mask i32) (local $sign i32) (local $exponent i32) (local $magnitude i32) (local $low i32) (local $base i32) (local $rounded i32)
  (if (i32.eqz (local.get $mode)) (then (return (local.get $v))))
  (local.set $step (i32.shl (i32.const 1) (local.get $drop)))
  (local.set $mask (i32.sub (local.get $step) (i32.const 1)))
  (if (i32.eq (local.get $mode) (i32.const 1))
    (then (return (i32.add (i32.and (local.get $v) (i32.xor (local.get $mask) (i32.const -1))) (i32.shr_u (local.get $step) (i32.const 1))))))
  (local.set $sign (select (i32.const 0x80000000) (i32.const 0x8000) (i32.eq (local.get $mode) (i32.const 2))))
  (local.set $exponent (select (i32.const 0x7f800000) (i32.const 0x7c00) (i32.eq (local.get $mode) (i32.const 2))))
  (local.set $magnitude (i32.and (local.get $v) (i32.sub (local.get $sign) (i32.const 1))))
  (if (i32.ge_u (local.get $magnitude) (local.get $exponent)) (then (return (local.get $v))))
  (local.set $low (i32.and (local.get $magnitude) (local.get $mask)))
  (local.set $base (i32.sub (local.get $magnitude) (local.get $low)))
  (local.set $rounded (i32.add (local.get $base)
    (select (local.get $step) (i32.const 0) (i32.or (i32.gt_u (local.get $low) (i32.shr_u (local.get $step) (i32.const 1)))
      (i32.and (i32.eq (local.get $low) (i32.shr_u (local.get $step) (i32.const 1))) (i32.and (i32.shr_u (local.get $base) (local.get $drop)) (i32.const 1)))))))
  (if (i32.ge_u (local.get $rounded) (local.get $exponent)) (then (return (local.get $v))))
  (i32.or (i32.and (local.get $v) (local.get $sign)) (local.get $rounded)))

;; lossless.mjs channelTables' distinct sample words: every fourth i32 of the $n at $words from $from added to the open
;; hash set at $keys ($slots i32 keys, a power of two, with a u8 occupancy each at $used), $count distinct so far. Answers
;; the new count, or -1 once it passes $limit.
(func (export "distinctWords") (param $words i32) (param $n i32) (param $from i32) (param $keys i32) (param $used i32) (param $slots i32)
  (param $count i32) (param $limit i32) (result i32)
  (local $i i32) (local $v i32) (local $slot i32) (local $mask i32) (local $shift i32)
  (local.set $mask (i32.sub (local.get $slots) (i32.const 1)))
  (local.set $shift (i32.add (i32.clz (local.get $slots)) (i32.const 1)))
  (local.set $i (local.get $from))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $v (i32.load (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2)))))
    (local.set $slot (i32.shr_u (i32.mul (local.get $v) (i32.const 0x9e3779b1)) (local.get $shift)))
    (block $placed (loop $probe
      (if (i32.eqz (i32.load8_u (i32.add (local.get $used) (local.get $slot)))) (then
        (i32.store8 (i32.add (local.get $used) (local.get $slot)) (i32.const 1))
        (i32.store (i32.add (local.get $keys) (i32.shl (local.get $slot) (i32.const 2))) (local.get $v))
        (local.set $count (i32.add (local.get $count) (i32.const 1)))
        (if (i32.gt_s (local.get $count) (local.get $limit)) (then (return (i32.const -1))))
        (br $placed)))
      (br_if $placed (i32.eq (i32.load (i32.add (local.get $keys) (i32.shl (local.get $slot) (i32.const 2)))) (local.get $v)))
      (local.set $slot (i32.and (i32.add (local.get $slot) (i32.const 1)) (local.get $mask)))
      (br $probe)))
    (local.set $i (i32.add (local.get $i) (i32.const 4)))
    (br $each)))
  (local.get $count))
;; The set's keys, in slot order, to $out; answers how many.
(func (export "distinctKeys") (param $keys i32) (param $used i32) (param $slots i32) (param $out i32) (result i32)
  (local $s i32) (local $k i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $s) (local.get $slots)))
    (if (i32.load8_u (i32.add (local.get $used) (local.get $s))) (then
      (i32.store (i32.add (local.get $out) (i32.shl (local.get $k) (i32.const 2))) (i32.load (i32.add (local.get $keys) (i32.shl (local.get $s) (i32.const 2)))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))))
    (local.set $s (i32.add (local.get $s) (i32.const 1)))
    (br $each)))
  (local.get $k))
;; The rank of each of the $len words at $table (i32) into its slot of the set ($ranks: i32 a slot).
(func (export "distinctRank") (param $keys i32) (param $used i32) (param $slots i32) (param $table i32) (param $len i32) (param $ranks i32)
  (local $i i32) (local $slot i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $len)))
    (local.set $slot (call $distinctSlot (local.get $keys) (local.get $used) (local.get $slots) (i32.load (i32.add (local.get $table) (i32.shl (local.get $i) (i32.const 2))))))
    (i32.store (i32.add (local.get $ranks) (i32.shl (local.get $slot) (i32.const 2))) (local.get $i))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each))))
;; Every fourth word of the $n at $words from $from as its rank (i16 at $out); answers -1 for a word not in the set.
(func (export "distinctIndex") (param $words i32) (param $n i32) (param $from i32) (param $keys i32) (param $used i32) (param $slots i32)
  (param $ranks i32) (param $out i32) (result i32)
  (local $i i32) (local $slot i32) (local $p i32)
  (local.set $i (local.get $from))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $slot (call $distinctSlot (local.get $keys) (local.get $used) (local.get $slots) (i32.load (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2))))))
    (if (i32.lt_s (local.get $slot) (i32.const 0)) (then (return (i32.const -1))))
    (i32.store16 (i32.add (local.get $out) (i32.shl (local.get $p) (i32.const 1))) (i32.load (i32.add (local.get $ranks) (i32.shl (local.get $slot) (i32.const 2)))))
    (local.set $p (i32.add (local.get $p) (i32.const 1)))
    (local.set $i (i32.add (local.get $i) (i32.const 4)))
    (br $each)))
  (i32.const 0))
(func $distinctSlot (param $keys i32) (param $used i32) (param $slots i32) (param $v i32) (result i32)
  (local $slot i32)
  (local.set $slot (i32.shr_u (i32.mul (local.get $v) (i32.const 0x9e3779b1)) (i32.add (i32.clz (local.get $slots)) (i32.const 1))))
  (loop $probe
    (if (i32.eqz (i32.load8_u (i32.add (local.get $used) (local.get $slot)))) (then (return (i32.const -1))))
    (if (i32.eq (i32.load (i32.add (local.get $keys) (i32.shl (local.get $slot) (i32.const 2)))) (local.get $v)) (then (return (local.get $slot))))
    (local.set $slot (i32.and (i32.add (local.get $slot) (i32.const 1)) (i32.sub (local.get $slots) (i32.const 1))))
    (br $probe))
  (i32.const -1))

;; lossless.mjs inspectNativeSteps' first pass over the $n words at $words (four a pixel): alpha other than $opaqueValue
;; clears opaque (unless $known), colours that differ after quantizing ($qmode, $drop as nativeFill's) clear grey, and the
;; scan stops once grey is clear and opacity is known or clear. $flags in and out: opaque 1, grey 2.
(func (export "nativeShape") (param $words i32) (param $n i32) (param $opaqueValue i32) (param $known i32) (param $flags i32) (param $qmode i32) (param $drop i32) (result i32)
  (local $i i32) (local $opaque i32) (local $grey i32) (local $at i32) (local $r i32)
  (local.set $opaque (i32.and (local.get $flags) (i32.const 1)))
  (local.set $grey (i32.shr_u (i32.and (local.get $flags) (i32.const 2)) (i32.const 1)))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $at (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2))))
    (if (i32.and (i32.eqz (local.get $known)) (i32.ne (i32.load offset=12 (local.get $at)) (local.get $opaqueValue))) (then (local.set $opaque (i32.const 0))))
    (local.set $r (call $quantize (i32.load (local.get $at)) (local.get $qmode) (local.get $drop)))
    (if (i32.or (i32.ne (local.get $r) (call $quantize (i32.load offset=4 (local.get $at)) (local.get $qmode) (local.get $drop)))
          (i32.ne (local.get $r) (call $quantize (i32.load offset=8 (local.get $at)) (local.get $qmode) (local.get $drop))))
      (then (local.set $grey (i32.const 0))))
    (br_if $done (i32.and (i32.eqz (local.get $grey)) (i32.or (local.get $known) (i32.eqz (local.get $opaque)))))
    (local.set $i (i32.add (local.get $i) (i32.const 4)))
    (br $each)))
  (i32.or (local.get $opaque) (i32.shl (local.get $grey) (i32.const 1))))
;; lossless.mjs nativeLattice's scan: each colour channel's words ORed (and alpha's, the fourth word, as the last of
;; $channels) into $or (i32 a channel); answers 0 where a colour word is negative ($float 32: sign bit 31; 16: bit 15).
(func (export "wordsOr") (param $words i32) (param $n i32) (param $colour i32) (param $alpha i32) (param $channels i32) (param $float i32) (param $or i32) (result i32)
  (local $i i32) (local $c i32) (local $w i32) (local $nonNegative i32) (local $a i32)
  (local.set $nonNegative (i32.const 1))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $c (i32.const 0))
    (block $cd (loop $cs
      (br_if $cd (i32.ge_u (local.get $c) (local.get $colour)))
      (local.set $w (i32.load (i32.add (local.get $words) (i32.shl (i32.add (local.get $i) (local.get $c)) (i32.const 2)))))
      (local.set $a (i32.add (local.get $or) (i32.shl (local.get $c) (i32.const 2))))
      (i32.store (local.get $a) (i32.or (i32.load (local.get $a)) (local.get $w)))
      (if (i32.and (i32.ne (local.get $float) (i32.const 0)) (i32.ne (i32.and (local.get $w) (select (i32.const 0x80000000) (i32.const 0x8000) (i32.eq (local.get $float) (i32.const 32)))) (i32.const 0)))
        (then (local.set $nonNegative (i32.const 0))))
      (local.set $c (i32.add (local.get $c) (i32.const 1)))
      (br $cs)))
    (if (local.get $alpha) (then
      (local.set $a (i32.add (local.get $or) (i32.shl (i32.sub (local.get $channels) (i32.const 1)) (i32.const 2))))
      (i32.store (local.get $a) (i32.or (i32.load (local.get $a)) (i32.load offset=12 (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2))))))))
    (local.set $i (i32.add (local.get $i) (i32.const 4)))
    (br $each)))
  (local.get $nonNegative))
;; v7/intent-quality.mjs gradientRows on 8-bit RGBA, the same f64 arithmetic in the same order: $pairs rows y (each with
;; the row below it, $width pixels a row, the two rows one after the other at $rows) of every fourth row from row 1,
;; the first a block's second row (y & 7 = 5) when $second is 1, then alternating. $acc: f64 sum, n, chroma, clear, edge
;; and the predictors still open (`leaves`); $blk: f64 each block's sum, squares and steps ((width - 1) >> 3 of each),
;; carried across calls as the JavaScript carries them. A block row's spread and slope (each plus 0.5, before the log
;; binning, which stays with the caller) go to $out, two f64 a block; the result is how many f64 were written. $tmp:
;; 40 bytes a pixel of scratch. Each row's lumas, steps and block terms are made two lanes at a time (each lane the
;; JavaScript's own operations, so the same values); only the sums then run one after another, in pixel order.
;; $kind 1 reads 16-bit words, 2 float32 samples and 3 bytes (four samples a pixel) through the f64 table at $table (a
;; sample's luma, in 8-bit sRGB code units; a float32 sample clamped to 0-1 first, at 65536 steps); those leave the
;; chroma, clear canvas and predictors alone.
(func $gradLuma (param $at i32) (result f64)
  (f64.add (f64.add (f64.mul (f64.const 0.299) (f64.convert_i32_u (i32.load8_u (local.get $at))))
                    (f64.mul (f64.const 0.587) (f64.convert_i32_u (i32.load8_u offset=1 (local.get $at)))))
           (f64.mul (f64.const 0.114) (f64.convert_i32_u (i32.load8_u offset=2 (local.get $at))))))
;; $n pixels' lumas from $src to $dst (f64 each), four a step, the rest one at a time.
;; One sample's table index: a 16-bit word as it is, a float32 sample clamped to 0-1 (NaN 0) at 65535 steps, rounded.
(func $gradWord (param $at i32) (param $kind i32) (result i32)
  (local $v f64)
  (if (i32.eq (local.get $kind) (i32.const 3)) (then (return (i32.load8_u (local.get $at)))))
  (if (i32.eq (local.get $kind) (i32.const 1)) (then (return (i32.load16_u (local.get $at)))))
  (local.set $v (f64.promote_f32 (f32.load (local.get $at))))
  (local.set $v (select (select (local.get $v) (f64.const 1) (f64.lt (local.get $v) (f64.const 1))) (f64.const 0) (f64.gt (local.get $v) (f64.const 0))))
  (i32.trunc_f64_u (f64.add (f64.mul (local.get $v) (f64.const 65535)) (f64.const 0.5))))
(func $gradLumasWide (param $src i32) (param $dst i32) (param $n i32) (param $table i32) (param $kind i32) (param $bps i32)
  (local $x i32) (local $s i32) (local $at i32)
  (local.set $s (i32.shl (local.get $bps) (i32.const 1)))
  (block $d (loop $l
    (br_if $d (i32.ge_s (local.get $x) (local.get $n)))
    (local.set $at (i32.add (local.get $src) (i32.mul (i32.shl (local.get $x) (i32.const 2)) (i32.shr_u (local.get $s) (i32.const 1)))))
    (f64.store (i32.add (local.get $dst) (i32.shl (local.get $x) (i32.const 3)))
      (f64.add (f64.add
        (f64.mul (f64.const 0.299) (f64.load (i32.add (local.get $table) (i32.shl (call $gradWord (local.get $at) (local.get $kind)) (i32.const 3)))))
        (f64.mul (f64.const 0.587) (f64.load (i32.add (local.get $table) (i32.shl (call $gradWord (i32.add (local.get $at) (i32.shr_u (local.get $s) (i32.const 1))) (local.get $kind)) (i32.const 3))))))
        (f64.mul (f64.const 0.114) (f64.load (i32.add (local.get $table) (i32.shl (call $gradWord (i32.add (local.get $at) (local.get $s)) (local.get $kind)) (i32.const 3)))))))
    (local.set $x (i32.add (local.get $x) (i32.const 1)))
    (br $l))))
(func $gradLumas (param $src i32) (param $dst i32) (param $n i32)
  (local $x i32) (local $v v128) (local $r v128) (local $g v128) (local $b v128) (local $m v128)
  (local.set $m (i32x4.splat (i32.const 255)))
  (block $vd (loop $vs
    (br_if $vd (i32.gt_s (i32.add (local.get $x) (i32.const 4)) (local.get $n)))
    (local.set $v (v128.load (i32.add (local.get $src) (i32.shl (local.get $x) (i32.const 2)))))
    (local.set $r (v128.and (local.get $v) (local.get $m)))
    (local.set $g (v128.and (i32x4.shr_u (local.get $v) (i32.const 8)) (local.get $m)))
    (local.set $b (v128.and (i32x4.shr_u (local.get $v) (i32.const 16)) (local.get $m)))
    (v128.store (i32.add (local.get $dst) (i32.shl (local.get $x) (i32.const 3)))
      (f64x2.add (f64x2.add (f64x2.mul (f64x2.splat (f64.const 0.299)) (f64x2.convert_low_i32x4_s (local.get $r)))
                            (f64x2.mul (f64x2.splat (f64.const 0.587)) (f64x2.convert_low_i32x4_s (local.get $g))))
                 (f64x2.mul (f64x2.splat (f64.const 0.114)) (f64x2.convert_low_i32x4_s (local.get $b)))))
    (local.set $r (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7 (local.get $r) (local.get $r)))
    (local.set $g (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7 (local.get $g) (local.get $g)))
    (local.set $b (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7 (local.get $b) (local.get $b)))
    (v128.store offset=16 (i32.add (local.get $dst) (i32.shl (local.get $x) (i32.const 3)))
      (f64x2.add (f64x2.add (f64x2.mul (f64x2.splat (f64.const 0.299)) (f64x2.convert_low_i32x4_s (local.get $r)))
                            (f64x2.mul (f64x2.splat (f64.const 0.587)) (f64x2.convert_low_i32x4_s (local.get $g))))
                 (f64x2.mul (f64x2.splat (f64.const 0.114)) (f64x2.convert_low_i32x4_s (local.get $b)))))
    (local.set $x (i32.add (local.get $x) (i32.const 4)))
    (br $vs)))
  (block $sd (loop $ss
    (br_if $sd (i32.ge_s (local.get $x) (local.get $n)))
    (f64.store (i32.add (local.get $dst) (i32.shl (local.get $x) (i32.const 3))) (call $gradLuma (i32.add (local.get $src) (i32.shl (local.get $x) (i32.const 2)))))
    (local.set $x (i32.add (local.get $x) (i32.const 1)))
    (br $ss))))
(func (export "gradRows") (param $rows i32) (param $width i32) (param $pairs i32) (param $second i32) (param $acc i32) (param $blk i32) (param $out i32) (param $tmp i32) (param $table i32) (param $kind i32) (result i32)
  (local $bps i32) (local $k i32) (local $x i32) (local $i i32) (local $row i32) (local $columns i32) (local $edge i32) (local $b i32) (local $c i32) (local $m i32)
  (local $step f64) (local $sum f64) (local $n f64) (local $hard f64) (local $bs f64) (local $bq f64) (local $bt f64)
  (local $chroma i64) (local $clear i64) (local $leaves i32) (local $written i32) (local $p i32) (local $mean f64)
  (local $l0 i32) (local $l1 i32) (local $st i32) (local $pl i32) (local $sq i32) (local $h v128) (local $r v128) (local $d v128) (local $s v128) (local $mx v128)
  (local $v i32) (local $w i32) (local $up i32) (local $nw i32) (local $ne i32) (local $plain i32) (local $lo i32) (local $hi i32) (local $missed i32) (local $at i32)
  (local.set $bps (select (i32.const 1) (select (i32.const 2) (i32.const 4) (i32.eq (local.get $kind) (i32.const 1))) (i32.or (i32.eqz (local.get $kind)) (i32.eq (local.get $kind) (i32.const 3)))))
  (local.set $row (i32.mul (i32.shl (local.get $width) (i32.const 2)) (local.get $bps)))
  (local.set $m (i32.sub (local.get $width) (i32.const 1)))
  (local.set $columns (i32.shr_u (local.get $m) (i32.const 3)))
  (local.set $edge (i32.shl (local.get $columns) (i32.const 3)))
  ;; Scratch: the two rows' lumas, then each pixel's step, its luma sum and its squares (f64, $width each).
  (local.set $l0 (local.get $tmp))
  (local.set $l1 (i32.add (local.get $l0) (i32.shl (local.get $width) (i32.const 3))))
  (local.set $st (i32.add (local.get $l1) (i32.shl (local.get $width) (i32.const 3))))
  (local.set $pl (i32.add (local.get $st) (i32.shl (local.get $width) (i32.const 3))))
  (local.set $sq (i32.add (local.get $pl) (i32.shl (local.get $width) (i32.const 3))))
  (local.set $sum (f64.load (local.get $acc))) (local.set $n (f64.load offset=8 (local.get $acc)))
  (local.set $hard (f64.load offset=32 (local.get $acc))) (local.set $leaves (i32.trunc_f64_u (f64.load offset=40 (local.get $acc))))
  (block $paired (loop $pair
    (br_if $paired (i32.ge_u (local.get $k) (local.get $pairs)))
    (local.set $i (i32.add (local.get $rows) (i32.mul (local.get $k) (i32.shl (local.get $row) (i32.const 1)))))
    (if (local.get $kind)
      (then
        (call $gradLumasWide (local.get $i) (local.get $l0) (local.get $width) (local.get $table) (local.get $kind) (local.get $bps))
        (call $gradLumasWide (i32.add (local.get $i) (local.get $row)) (local.get $l1) (local.get $width) (local.get $table) (local.get $kind) (local.get $bps)))
      (else
        (call $gradLumas (local.get $i) (local.get $l0) (local.get $width))
        (call $gradLumas (i32.add (local.get $i) (local.get $row)) (local.get $l1) (local.get $width))))
    ;; step = |right - here| + |down - here|, here + down, here * here + down * down; two pixels a step, and the edge
    ;; (the largest step: a maximum, whatever the order).
    (local.set $mx (f64x2.splat (local.get $hard)))
    (local.set $x (i32.const 0))
    (block $vd (loop $vs
      (br_if $vd (i32.gt_s (i32.add (local.get $x) (i32.const 2)) (local.get $m)))
      (local.set $p (i32.shl (local.get $x) (i32.const 3)))
      (local.set $h (v128.load (i32.add (local.get $l0) (local.get $p))))
      (local.set $r (v128.load offset=8 (i32.add (local.get $l0) (local.get $p))))
      (local.set $d (v128.load (i32.add (local.get $l1) (local.get $p))))
      (local.set $s (f64x2.add (f64x2.abs (f64x2.sub (local.get $r) (local.get $h))) (f64x2.abs (f64x2.sub (local.get $d) (local.get $h)))))
      (v128.store (i32.add (local.get $st) (local.get $p)) (local.get $s))
      (local.set $mx (f64x2.pmax (local.get $mx) (local.get $s)))
      (v128.store (i32.add (local.get $pl) (local.get $p)) (f64x2.add (local.get $h) (local.get $d)))
      (v128.store (i32.add (local.get $sq) (local.get $p)) (f64x2.add (f64x2.mul (local.get $h) (local.get $h)) (f64x2.mul (local.get $d) (local.get $d))))
      (local.set $x (i32.add (local.get $x) (i32.const 2)))
      (br $vs)))
    (local.set $hard (f64.max (f64x2.extract_lane 0 (local.get $mx)) (f64x2.extract_lane 1 (local.get $mx))))
    (block $sd (loop $ss
      (br_if $sd (i32.ge_s (local.get $x) (local.get $m)))
      (local.set $p (i32.shl (local.get $x) (i32.const 3)))
      (local.set $step (f64.add (f64.abs (f64.sub (f64.load offset=8 (i32.add (local.get $l0) (local.get $p))) (f64.load (i32.add (local.get $l0) (local.get $p)))))
                                (f64.abs (f64.sub (f64.load (i32.add (local.get $l1) (local.get $p))) (f64.load (i32.add (local.get $l0) (local.get $p)))))))
      (f64.store (i32.add (local.get $st) (local.get $p)) (local.get $step))
      (if (f64.gt (local.get $step) (local.get $hard)) (then (local.set $hard (local.get $step))))
      (f64.store (i32.add (local.get $pl) (local.get $p)) (f64.add (f64.load (i32.add (local.get $l0) (local.get $p))) (f64.load (i32.add (local.get $l1) (local.get $p)))))
      (f64.store (i32.add (local.get $sq) (local.get $p)) (f64.add (f64.mul (f64.load (i32.add (local.get $l0) (local.get $p))) (f64.load (i32.add (local.get $l0) (local.get $p))))
        (f64.mul (f64.load (i32.add (local.get $l1) (local.get $p))) (f64.load (i32.add (local.get $l1) (local.get $p))))))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $ss)))
    ;; The sums in pixel order: the sweep's, and each block's from its carried value.
    (if (i32.and (i32.ne (local.get $columns) (i32.const 0)) (i32.eqz (local.get $second)))
      (then (memory.fill (local.get $blk) (i32.const 0) (i32.mul (local.get $columns) (i32.const 24)))))
    (local.set $x (i32.const 0)) (local.set $b (i32.const 0))
    (block $bd (loop $bs
      (br_if $bd (i32.ge_s (local.get $b) (local.get $columns)))
      (local.set $at (i32.add (local.get $blk) (i32.shl (local.get $b) (i32.const 3))))
      (local.set $bs (f64.load (local.get $at)))
      (local.set $bq (f64.load (i32.add (local.get $at) (i32.shl (local.get $columns) (i32.const 3)))))
      (local.set $bt (f64.load (i32.add (local.get $at) (i32.shl (local.get $columns) (i32.const 4)))))
      (local.set $c (i32.const 0))
      (block $cd (loop $cs
        (br_if $cd (i32.eq (local.get $c) (i32.const 8)))
        (local.set $p (i32.shl (local.get $x) (i32.const 3)))
        (local.set $step (f64.load (i32.add (local.get $st) (local.get $p))))
        (local.set $sum (f64.add (local.get $sum) (local.get $step)))
        (local.set $bs (f64.add (local.get $bs) (f64.load (i32.add (local.get $pl) (local.get $p)))))
        (local.set $bq (f64.add (local.get $bq) (f64.load (i32.add (local.get $sq) (local.get $p)))))
        (local.set $bt (f64.add (local.get $bt) (local.get $step)))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (local.set $c (i32.add (local.get $c) (i32.const 1)))
        (br $cs)))
      (f64.store (local.get $at) (local.get $bs))
      (f64.store (i32.add (local.get $at) (i32.shl (local.get $columns) (i32.const 3))) (local.get $bq))
      (f64.store (i32.add (local.get $at) (i32.shl (local.get $columns) (i32.const 4))) (local.get $bt))
      (local.set $b (i32.add (local.get $b) (i32.const 1)))
      (br $bs)))
    (block $td (loop $ts
      (br_if $td (i32.ge_s (local.get $x) (local.get $m)))
      (local.set $sum (f64.add (local.get $sum) (f64.load (i32.add (local.get $st) (i32.shl (local.get $x) (i32.const 3))))))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $ts)))
    (local.set $n (f64.add (local.get $n) (f64.convert_i32_s (local.get $m))))
    ;; Chroma and clear canvas: whole numbers, so in any order.
    (if (i32.eqz (local.get $kind)) (then
    (local.set $x (i32.const 0)) (local.set $i (i32.add (local.get $rows) (i32.mul (local.get $k) (i32.shl (local.get $row) (i32.const 1)))))
    (local.set $h (v128.const i64x2 0 0)) (local.set $s (v128.const i64x2 0 0))
    (block $qvd (loop $qvs
      (br_if $qvd (i32.gt_s (i32.add (local.get $x) (i32.const 4)) (local.get $m)))
      (local.set $r (v128.load (local.get $i)))
      (local.set $d (i32x4.shr_u (i32x4.shl (local.get $r) (i32.const 16)) (i32.const 24)))
      (local.set $h (i32x4.add (local.get $h) (i32x4.add
        (i32x4.abs (i32x4.sub (v128.and (local.get $r) (i32x4.splat (i32.const 255))) (local.get $d)))
        (i32x4.abs (i32x4.sub (v128.and (i32x4.shr_u (local.get $r) (i32.const 16)) (i32x4.splat (i32.const 255))) (local.get $d))))))
      (local.set $s (i32x4.sub (local.get $s) (i32x4.eq (v128.or (v128.or (i32x4.shr_u (local.get $r) (i32.const 24))
          (i32x4.shr_u (v128.load offset=4 (local.get $i)) (i32.const 24)))
          (i32x4.shr_u (v128.load (i32.add (local.get $i) (local.get $row))) (i32.const 24))) (v128.const i64x2 0 0))))
      (local.set $i (i32.add (local.get $i) (i32.const 16)))
      (local.set $x (i32.add (local.get $x) (i32.const 4)))
      (br $qvs)))
    (local.set $chroma (i64.add (local.get $chroma) (i64.extend_i32_u (i32.add (i32.add (i32x4.extract_lane 0 (local.get $h)) (i32x4.extract_lane 1 (local.get $h)))
      (i32.add (i32x4.extract_lane 2 (local.get $h)) (i32x4.extract_lane 3 (local.get $h)))))))
    (local.set $clear (i64.add (local.get $clear) (i64.extend_i32_u (i32.add (i32.add (i32x4.extract_lane 0 (local.get $s)) (i32x4.extract_lane 1 (local.get $s)))
      (i32.add (i32x4.extract_lane 2 (local.get $s)) (i32x4.extract_lane 3 (local.get $s)))))))
    (block $qd (loop $qs
      (br_if $qd (i32.ge_s (local.get $x) (local.get $m)))
      (local.set $v (i32.load8_u offset=1 (local.get $i)))
      (local.set $w (i32.sub (i32.load8_u (local.get $i)) (local.get $v)))
      (local.set $up (i32.sub (i32.load8_u offset=2 (local.get $i)) (local.get $v)))
      (local.set $chroma (i64.add (local.get $chroma) (i64.extend_i32_u (i32.add
        (select (local.get $w) (i32.sub (i32.const 0) (local.get $w)) (i32.ge_s (local.get $w) (i32.const 0)))
        (select (local.get $up) (i32.sub (i32.const 0) (local.get $up)) (i32.ge_s (local.get $up) (i32.const 0)))))))
      (if (i32.eqz (i32.or (i32.or (i32.load8_u offset=3 (local.get $i)) (i32.load8_u offset=7 (local.get $i)))
            (i32.load8_u offset=3 (i32.add (local.get $i) (local.get $row)))))
        (then (local.set $clear (i64.add (local.get $clear) (i64.const 1)))))
      (local.set $i (i32.add (local.get $i) (i32.const 4)))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $qs)))
    ;; The predictors, in pixel order while any is open (once 0, the JavaScript reads no more).
    (local.set $x (i32.const 0)) (local.set $i (i32.add (local.get $rows) (i32.mul (local.get $k) (i32.shl (local.get $row) (i32.const 1)))))
    (block $ld (loop $ls
      (br_if $ld (i32.or (i32.eqz (local.get $leaves)) (i32.ge_s (i32.add (local.get $x) (i32.const 2)) (local.get $width))))
      (local.set $at (i32.add (i32.add (local.get $i) (local.get $row)) (i32.const 4)))
      (local.set $c (i32.const 0))
      (block $cd (loop $cs
        (br_if $cd (i32.eq (local.get $c) (i32.const 3)))
        (local.set $v (i32.load8_u (i32.add (local.get $at) (local.get $c))))
        (local.set $w (i32.load8_u (i32.sub (i32.add (local.get $at) (local.get $c)) (i32.const 4))))
        (local.set $up (i32.load8_u offset=4 (i32.add (local.get $i) (local.get $c))))
        (local.set $nw (i32.load8_u (i32.add (local.get $i) (local.get $c))))
        (local.set $ne (i32.load8_u offset=8 (i32.add (local.get $i) (local.get $c))))
        (local.set $plain (i32.sub (i32.add (local.get $w) (local.get $up)) (local.get $nw)))
        (local.set $lo (select (local.get $w) (local.get $up) (i32.lt_s (local.get $w) (local.get $up))))
        (local.set $hi (select (local.get $up) (local.get $w) (i32.lt_s (local.get $w) (local.get $up))))
        (local.set $missed (i32.or (i32.or (i32.or
          (i32.ne (local.get $v) (local.get $w))
          (i32.shl (i32.ne (local.get $v) (local.get $up)) (i32.const 1)))
          (i32.or (i32.shl (i32.ne (local.get $v) (local.get $ne)) (i32.const 2))
            (i32.shl (i32.ne (local.get $v)
              (select (local.get $lo) (select (local.get $hi) (local.get $plain) (i32.gt_s (local.get $plain) (local.get $hi))) (i32.lt_s (local.get $plain) (local.get $lo))))
              (i32.const 3))))
          (i32.shl (i32.or
            (i32.eqz (i32.and (i32.and (i32.le_s (i32.sub (local.get $w) (local.get $nw)) (i32.const 2)) (i32.le_s (i32.sub (local.get $nw) (local.get $w)) (i32.const 2)))
                              (i32.and (i32.le_s (i32.sub (local.get $up) (local.get $nw)) (i32.const 2)) (i32.le_s (i32.sub (local.get $nw) (local.get $up)) (i32.const 2)))))
            (i32.ne (local.get $v) (local.get $plain))) (i32.const 4))))
        (local.set $leaves (i32.and (local.get $leaves) (i32.xor (i32.shl (local.get $missed) (i32.mul (local.get $c) (i32.const 5))) (i32.const -1))))
        (local.set $c (i32.add (local.get $c) (i32.const 1)))
        (br $cs)))
      (if (i32.or (i32.or (i32.eqz (i32.and (local.get $leaves) (i32.const 0x1f))) (i32.eqz (i32.and (local.get $leaves) (i32.const 0x3e0))))
            (i32.eqz (i32.and (local.get $leaves) (i32.const 0x7c00))))
        (then (local.set $leaves (i32.const 0))))
      (local.set $i (i32.add (local.get $i) (i32.const 4)))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $ls)))
    ))
    (if (local.get $second) (then
      (local.set $b (i32.const 0))
      (block $bd (loop $bs
        (br_if $bd (i32.ge_s (local.get $b) (local.get $columns)))
        (local.set $p (i32.add (local.get $blk) (i32.shl (local.get $b) (i32.const 3))))
        (local.set $mean (f64.div (f64.load (local.get $p)) (f64.const 32)))
        (local.set $at (i32.add (local.get $out) (i32.shl (local.get $written) (i32.const 3))))
        (f64.store (local.get $at) (f64.add (f64.sqrt (f64.max (f64.const 0)
          (f64.sub (f64.div (f64.load (i32.add (local.get $p) (i32.shl (local.get $columns) (i32.const 3)))) (f64.const 32)) (f64.mul (local.get $mean) (local.get $mean)))))
          (f64.const 0.5)))
        (f64.store offset=8 (local.get $at) (f64.add (f64.div (f64.load (i32.add (local.get $p) (i32.shl (local.get $columns) (i32.const 4)))) (f64.const 16)) (f64.const 0.5)))
        (local.set $written (i32.add (local.get $written) (i32.const 2)))
        (local.set $b (i32.add (local.get $b) (i32.const 1)))
        (br $bs)))))
    (local.set $second (i32.xor (local.get $second) (i32.const 1)))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $pair)))
  (f64.store (local.get $acc) (local.get $sum)) (f64.store offset=8 (local.get $acc) (local.get $n))
  (f64.store offset=16 (local.get $acc) (f64.add (f64.load offset=16 (local.get $acc)) (f64.convert_i64_u (local.get $chroma))))
  (f64.store offset=24 (local.get $acc) (f64.add (f64.load offset=24 (local.get $acc)) (f64.convert_i64_u (local.get $clear))))
  (f64.store offset=32 (local.get $acc) (local.get $hard)) (f64.store offset=40 (local.get $acc) (f64.convert_i32_u (local.get $leaves)))
  (local.get $written))
;; The exact coder's predictions of the pixel below (W, N, NE, the clamped gradient, and W + N - NW where both its steps
;; are at most 2; five bits a RGB channel) on one staged row pair of 16-bit words or float32 samples, as gradRows reads them
;; on 8-bit ones: the `leaves` that still predict every sample, 0 once a channel's five have all missed.
(func $deep (param $at i32) (param $float i32) (result f64)
  (select (f64.promote_f32 (f32.load (local.get $at))) (f64.convert_i32_u (i32.load16_u (local.get $at))) (local.get $float)))
(func (export "deepLeaves") (param $p i32) (param $width i32) (param $float i32) (param $leaves i32) (result i32)
  (local $s i32) (local $row i32) (local $end i32) (local $c i32) (local $q i32)
  (local $v f64) (local $w f64) (local $n f64) (local $nw f64) (local $plain f64)
  (local.set $s (i32.shl (i32.const 2) (local.get $float)))
  (local.set $row (i32.mul (local.get $width) (i32.shl (local.get $s) (i32.const 2))))
  (local.set $end (i32.add (local.get $p) (i32.mul (i32.sub (local.get $width) (i32.const 2)) (i32.shl (local.get $s) (i32.const 2)))))
  (block $done (loop $pixel
    (br_if $done (i32.or (i32.eqz (local.get $leaves)) (i32.ge_s (local.get $p) (local.get $end))))
    (local.set $c (i32.const 0))
    (loop $channel
      (local.set $q (i32.add (local.get $p) (i32.mul (local.get $c) (local.get $s))))
      (local.set $nw (call $deep (local.get $q) (local.get $float)))
      (local.set $q (i32.add (local.get $q) (i32.shl (local.get $s) (i32.const 2))))
      (local.set $n (call $deep (local.get $q) (local.get $float)))
      (local.set $w (call $deep (i32.add (local.get $q) (i32.sub (local.get $row) (i32.shl (local.get $s) (i32.const 2)))) (local.get $float)))
      (local.set $v (call $deep (i32.add (local.get $q) (local.get $row)) (local.get $float)))
      (local.set $plain (f64.sub (f64.add (local.get $w) (local.get $n)) (local.get $nw)))
      (local.set $leaves (i32.and (local.get $leaves) (i32.xor (i32.const -1) (i32.shl (i32.or (i32.or (i32.or
        (f64.ne (local.get $v) (local.get $w))
        (i32.shl (f64.ne (local.get $v) (local.get $n)) (i32.const 1)))
        (i32.or (i32.shl (f64.ne (local.get $v) (call $deep (i32.add (local.get $q) (i32.shl (local.get $s) (i32.const 2))) (local.get $float))) (i32.const 2))
          (i32.shl (f64.ne (local.get $v) (f64.max (f64.min (local.get $w) (local.get $n)) (f64.min (f64.max (local.get $w) (local.get $n)) (local.get $plain)))) (i32.const 3))))
        (i32.shl (i32.eqz (i32.and (i32.and (f64.le (f64.abs (f64.sub (local.get $w) (local.get $nw))) (f64.const 2))
          (f64.le (f64.abs (f64.sub (local.get $n) (local.get $nw))) (f64.const 2))) (f64.eq (local.get $v) (local.get $plain)))) (i32.const 4)))
        (i32.mul (local.get $c) (i32.const 5))))))
      (br_if $channel (i32.lt_u (local.tee $c (i32.add (local.get $c) (i32.const 1))) (i32.const 3))))
    (if (i32.or (i32.or (i32.eqz (i32.and (local.get $leaves) (i32.const 0x1f))) (i32.eqz (i32.and (local.get $leaves) (i32.const 0x3e0)))) (i32.eqz (i32.and (local.get $leaves) (i32.const 0x7c00))))
      (then (local.set $leaves (i32.const 0))))
    (local.set $p (i32.add (local.get $p) (i32.shl (local.get $s) (i32.const 2))))
    (br $pixel)))
  (local.get $leaves))

;; A staged photo window's vulnerability on its 8x8 grid. Rectangles are local x/y/right/bottom Float64 values;
;; intersecting text blocks count as hits and contribute no energy. f64 operations keep the reader's ordering.
(func $photoWindowByte (param $p i32) (result f64)
  (f64.convert_i32_u (i32.load8_u (local.get $p))))
(func $photoWindowCurve (param $p i32) (param $step i32) (result f64)
  (f64.abs (f64.add
    (f64.sub (call $photoWindowByte (local.get $p))
      (f64.mul (f64.const 2) (call $photoWindowByte (i32.add (local.get $p) (local.get $step)))))
    (call $photoWindowByte (i32.add (local.get $p) (i32.shl (local.get $step) (i32.const 1)))))))
(func $photoWindowHue (param $a i32) (param $b i32) (param $c i32) (result f64)
  (f64.abs (f64.sub
    (f64.sub (call $photoWindowByte (i32.add (local.get $a) (local.get $c)))
      (call $photoWindowByte (i32.add (local.get $a) (i32.const 1))))
    (f64.sub (call $photoWindowByte (i32.add (local.get $b) (local.get $c)))
      (call $photoWindowByte (i32.add (local.get $b) (i32.const 1)))))))
(func (export "windowVulnerability") (param $pixels i32) (param $width i32) (param $height i32)
    (param $rects i32) (param $count i32) (param $out i32) (result f64)
  (local $x i32) (local $y i32) (local $row i32) (local $w2 i32) (local $r2 i32) (local $c2 i32)
  (local $i0 i32) (local $i1 i32) (local $k i32) (local $r i32) (local $hits i32)
  (local $d2x f64) (local $d2y f64) (local $d1x f64) (local $d1y f64) (local $chhf f64)
  (local $gc f64) (local $span f64) (local $e f64) (local $sum f64)
  (local.set $row (i32.shl (local.get $width) (i32.const 2)))
  (local.set $w2 (i32.shl (local.get $row) (i32.const 1)))
  (block $done (loop $rows
    (br_if $done (i32.ge_u (i32.add (local.get $y) (i32.const 6)) (local.get $height)))
    (local.set $x (i32.const 0))
    (block $rowDone (loop $columns
      (br_if $rowDone (i32.ge_u (i32.add (local.get $x) (i32.const 6)) (local.get $width)))
      (block $sample
        (local.set $k (i32.const 0))
        (block $noOverlap (loop $overlaps
          (br_if $noOverlap (i32.ge_u (local.get $k) (local.get $count)))
          (local.set $r (i32.add (local.get $rects) (i32.shl (local.get $k) (i32.const 5))))
          (if (i32.and (i32.and
              (f64.gt (f64.convert_i32_u (i32.add (local.get $x) (i32.const 7))) (f64.load (local.get $r)))
              (f64.lt (f64.convert_i32_u (local.get $x)) (f64.load offset=16 (local.get $r))))
            (i32.and
              (f64.gt (f64.convert_i32_u (i32.add (local.get $y) (i32.const 7))) (f64.load offset=8 (local.get $r)))
              (f64.lt (f64.convert_i32_u (local.get $y)) (f64.load offset=24 (local.get $r)))))
            (then (local.set $hits (i32.add (local.get $hits) (i32.const 1))) (br $sample)))
          (local.set $k (i32.add (local.get $k) (i32.const 1)))
          (br $overlaps)))
        (local.set $i0 (i32.add (local.get $pixels) (i32.add (i32.mul (local.get $y) (local.get $row)) (i32.shl (local.get $x) (i32.const 2)))))
        (local.set $i1 (i32.add (local.get $i0) (i32.add (i32.shl (local.get $row) (i32.const 2)) (i32.const 16))))
        (local.set $r2 (i32.add (local.get $i0) (local.get $w2)))
        (local.set $c2 (i32.add (local.get $i0) (i32.const 8)))
        (local.set $d2x (f64.add (call $photoWindowCurve (i32.add (local.get $r2) (i32.const 1)) (i32.const 8))
          (call $photoWindowCurve (i32.add (local.get $r2) (i32.const 9)) (i32.const 8))))
        (local.set $d2y (f64.add (call $photoWindowCurve (i32.add (local.get $c2) (i32.const 1)) (local.get $w2))
          (call $photoWindowCurve (i32.add (local.get $c2) (i32.add (local.get $w2) (i32.const 1))) (local.get $w2))))
        (local.set $d1x (f64.add (call $photoWindowCurve (i32.add (local.get $r2) (i32.const 1)) (i32.const 4))
          (call $photoWindowCurve (i32.add (local.get $r2) (i32.const 13)) (i32.const 4))))
        (local.set $d1y (call $photoWindowCurve (i32.add (local.get $c2) (i32.const 1)) (local.get $row)))
        (local.set $chhf (f64.add (f64.add (f64.add
          (call $photoWindowHue (local.get $r2) (i32.add (local.get $r2) (i32.const 8)) (i32.const 0))
          (call $photoWindowHue (i32.add (local.get $r2) (i32.const 8)) (i32.add (local.get $r2) (i32.const 16)) (i32.const 0)))
          (call $photoWindowHue (local.get $r2) (i32.add (local.get $r2) (i32.const 8)) (i32.const 2)))
          (call $photoWindowHue (i32.add (local.get $r2) (i32.const 8)) (i32.add (local.get $r2) (i32.const 16)) (i32.const 2))))
        (local.set $gc (f64.add (f64.add
          (f64.abs (f64.sub (call $photoWindowByte (local.get $i0)) (call $photoWindowByte (local.get $i1))))
          (f64.abs (f64.sub (call $photoWindowByte (i32.add (local.get $i0) (i32.const 1))) (call $photoWindowByte (i32.add (local.get $i1) (i32.const 1))))))
          (f64.abs (f64.sub (call $photoWindowByte (i32.add (local.get $i0) (i32.const 2))) (call $photoWindowByte (i32.add (local.get $i1) (i32.const 2)))))))
        (local.set $span (f64.add (f64.add
          (f64.abs (f64.sub (call $photoWindowByte (i32.add (local.get $r2) (i32.const 1))) (call $photoWindowByte (i32.add (local.get $r2) (i32.const 25)))))
          (f64.abs (f64.sub (call $photoWindowByte (i32.add (local.get $c2) (i32.const 1)))
            (call $photoWindowByte (i32.add (local.get $c2) (i32.add (i32.mul (local.get $w2) (i32.const 3)) (i32.const 1)))))))
          (f64.mul (local.get $gc) (f64.const 0.33))))
        (local.set $e (f64.max (f64.const 0) (f64.sub (f64.add (f64.add (f64.add (f64.add
          (local.get $d2x) (local.get $d2y)) (local.get $d1x)) (local.get $d1y))
          (f64.mul (f64.const 0.9) (local.get $chhf))) (f64.const 12))))
        (local.set $sum (f64.add (local.get $sum) (f64.div (local.get $e)
          (f64.add (f64.add (f64.add (f64.const 1) (f64.mul (f64.const 0.025) (local.get $e)))
            (f64.mul (f64.const 0.05) (local.get $span)))
            (f64.mul (f64.mul (f64.const 0.002) (local.get $span)) (local.get $span)))))))
      (local.set $x (i32.add (local.get $x) (i32.const 8)))
      (br $columns)))
    (local.set $y (i32.add (local.get $y) (i32.const 8)))
    (br $rows)))
  (i32.store (local.get $out) (local.get $hits))
  (local.get $sum))

;; RCT 10 as signed 16-bit lanes: G, B-G, R-G, A. The high four lanes are zero.
(func $pageColour (param $word i32) (result v128)
  (local $v v128)
  (local.set $v (i16x8.extend_low_i8x16_u (i32x4.replace_lane 0 (v128.const i32x4 0 0 0 0) (local.get $word))))
  (i16x8.sub
    (i8x16.shuffle 2 3 4 5 0 1 6 7 8 9 10 11 12 13 14 15 (local.get $v) (local.get $v))
    (i8x16.shuffle 8 9 2 3 2 3 8 9 8 9 10 11 12 13 14 15 (local.get $v) (local.get $v))))
;; A residual uses one or more bits, with the sign packed in the low bit.
(func $pageSymbolBits (param $v i32) (result i32)
  (i32.sub (i32.const 32) (i32.clz (i32.or (i32.const 1)
    (i32.xor (i32.shl (local.get $v) (i32.const 1)) (i32.shr_s (local.get $v) (i32.const 31)))))))
;; The two 4096-slot tables hold positions plus one. A hash hit counts only after the source words agree.
;; A group has one history across its full width, including the pixels on opposite sides of a 256-pixel boundary.
(func (export "pageGroupStats") (param $src i32) (param $stride i32) (param $width i32) (param $height i32)
  (param $tables i32) (param $out i32) (param $step i32)
  (local $x i32) (local $y i32) (local $at i32) (local $up i32) (local $word i32)
  (local $west i32) (local $north i32) (local $nw i32) (local $slot i32) (local $other i32)
  (local $hit i32) (local $run i32) (local $zeroRun i32) (local $sum i32) (local $a i32)
  (local $sampled i32) (local $sameW i32) (local $runs i32) (local $spatial i32) (local $seq i32)
  (local $recent i32) (local $unseen i32) (local $edges i32) (local $tiny i32)
  (local $zeros i32) (local $long i32) (local $bits i32)
  (local $w v128) (local $n v128) (local $r v128) (local $v v128)
  (memory.fill (local.get $tables) (i32.const 0) (i32.const 32768))
  (local.set $stride (i32.shl (local.get $stride) (i32.const 2)))
  (loop $row
    (local.set $at (i32.add (local.get $src) (i32.mul (local.get $y) (local.get $stride))))
    (local.set $up (i32.sub (local.get $at) (local.get $stride)))
    (local.set $x (i32.const 0))
    (local.set $run (i32.const 1))
    (loop $pixel
      (local.set $word (i32.load (local.get $at)))
      (if (i32.eqz (local.get $x)) (then
        (local.set $west (if (result i32) (local.get $y) (then (i32.load (local.get $up))) (else (local.get $word))))))
      (local.set $north (if (result i32) (local.get $y) (then (i32.load (local.get $up))) (else (local.get $west))))
      (local.set $nw (if (result i32) (i32.and (i32.ne (local.get $x) (i32.const 0)) (i32.ne (local.get $y) (i32.const 0)))
        (then (i32.load (i32.sub (local.get $up) (i32.const 4)))) (else (local.get $west))))
      (if (i32.and (i32.ne (local.get $x) (i32.const 0)) (i32.eq (local.get $word) (local.get $west)))
        (then
          (local.set $sameW (i32.add (local.get $sameW) (i32.const 1)))
          (local.set $runs (i32.add (local.get $runs) (i32.eq (local.tee $run (i32.add (local.get $run) (i32.const 1))) (i32.const 3)))))
        (else
          (local.set $run (i32.const 1))
          (local.set $hit (i32.const 0))
          (if (i32.le_u (i32.add (local.get $x) (i32.const 4)) (local.get $width)) (then
            (local.set $slot (i32.add (local.get $tables) (i32.shl (i32.shr_u (i32.mul
              (i32.xor (i32.xor (local.get $word) (i32.mul (i32.load offset=4 (local.get $at)) (i32.const 0x9e3779b1)))
                (i32.xor (i32.mul (i32.load offset=8 (local.get $at)) (i32.const 0x85ebca77))
                  (i32.mul (i32.load offset=12 (local.get $at)) (i32.const 0xc2b2ae3d)))) (i32.const 0x27d4eb2f))
              (i32.const 20)) (i32.const 2))))
            (if (local.tee $other (i32.load (local.get $slot))) (then
              (local.set $other (i32.sub (local.get $other) (i32.const 1)))
              (local.set $hit (i32.and (i64.eq (i64.load (local.get $other)) (i64.load (local.get $at)))
                (i64.eq (i64.load offset=8 (local.get $other)) (i64.load offset=8 (local.get $at)))))))
            (i32.store (local.get $slot) (i32.add (local.get $at) (i32.const 1)))))
          (if (local.get $hit) (then (local.set $seq (i32.add (local.get $seq) (i32.const 1))))
            (else
              (local.set $hit (i32.const 0))
              (if (local.get $y) (then
                (local.set $hit (i32.or (i32.eq (local.get $word) (local.get $north))
                  (i32.and (i32.ne (local.get $x) (i32.const 0)) (i32.eq (local.get $word) (local.get $nw)))))
                (if (i32.lt_u (i32.add (local.get $x) (i32.const 1)) (local.get $width)) (then
                  (local.set $hit (i32.or (local.get $hit) (i32.eq (local.get $word) (i32.load offset=4 (local.get $up)))))))))
              (if (local.get $hit) (then (local.set $spatial (i32.add (local.get $spatial) (i32.const 1))))
                (else
                  (local.set $slot (i32.add (i32.add (local.get $tables) (i32.const 16384))
                    (i32.shl (i32.shr_u (i32.mul (local.get $word) (i32.const 0x9e3779b1)) (i32.const 20)) (i32.const 2))))
                  (if (local.tee $other (i32.load (local.get $slot))) (then
                    (local.set $hit (i32.eq (local.get $word) (i32.load (i32.sub (local.get $other) (i32.const 1)))))))
                  (local.set $recent (i32.add (local.get $recent) (local.get $hit)))
                  (local.set $unseen (i32.add (local.get $unseen) (i32.eqz (local.get $hit))))
                  (i32.store (local.get $slot) (i32.add (local.get $at) (i32.const 1)))))))))
      (local.set $w (call $pageColour (local.get $west)))
      (local.set $n (call $pageColour (local.get $north)))
      (local.set $r (i16x8.sub (call $pageColour (local.get $word))
        (i16x8.min_s (i16x8.max_s (i16x8.sub (i16x8.add (local.get $w) (local.get $n)) (call $pageColour (local.get $nw)))
           (i16x8.min_s (local.get $w) (local.get $n))) (i16x8.max_s (local.get $w) (local.get $n)))))
      (if (v128.any_true (local.get $r)) (then
        (local.set $zeroRun (i32.const 0))
        (local.set $v (i16x8.abs (local.get $r)))
        (local.set $sum (i32.add (i32.add (i16x8.extract_lane_u 0 (local.get $v)) (i16x8.extract_lane_u 1 (local.get $v)))
          (i32.add (i16x8.extract_lane_u 2 (local.get $v)) (i16x8.extract_lane_u 3 (local.get $v)))))
        (local.set $tiny (i32.add (local.get $tiny) (i32.le_u (local.get $sum) (i32.const 6))))
        (local.set $edges (i32.add (local.get $edges) (i32.ge_u (local.get $sum) (i32.const 24))))
        (local.set $a (i16x8.extract_lane_s 3 (local.get $r)))
        (local.set $bits (i32.add (local.get $bits) (i32.add
          (i32.add (call $pageSymbolBits (i16x8.extract_lane_s 0 (local.get $r))) (call $pageSymbolBits (i16x8.extract_lane_s 1 (local.get $r))))
          (i32.add (call $pageSymbolBits (i16x8.extract_lane_s 2 (local.get $r)))
            (select (call $pageSymbolBits (local.get $a)) (i32.const 0) (local.get $a)))))))
      (else
        (local.set $zeros (i32.add (local.get $zeros) (i32.const 1)))
        (local.set $long (i32.add (local.get $long) (i32.ge_u (local.tee $zeroRun (i32.add (local.get $zeroRun) (i32.const 1))) (i32.const 16))))))
      (local.set $west (local.get $word))
      (local.set $at (i32.add (local.get $at) (i32.const 4)))
      (local.set $up (i32.add (local.get $up) (i32.const 4)))
      (br_if $pixel (i32.lt_u (local.tee $x (i32.add (local.get $x) (i32.const 1))) (local.get $width))))
    (local.set $sampled (i32.add (local.get $sampled) (local.get $width)))
    (br_if $row (i32.lt_u (local.tee $y (i32.add (local.get $y) (local.get $step))) (local.get $height))))
  (i32.store (local.get $out) (local.get $sampled))
  (i32.store offset=4 (local.get $out) (local.get $sameW))
  (i32.store offset=8 (local.get $out) (local.get $runs))
  (i32.store offset=12 (local.get $out) (local.get $spatial))
  (i32.store offset=16 (local.get $out) (local.get $seq))
  (i32.store offset=20 (local.get $out) (local.get $recent))
  (i32.store offset=24 (local.get $out) (local.get $unseen))
  (i32.store offset=28 (local.get $out) (local.get $edges))
  (i32.store offset=32 (local.get $out) (local.get $tiny))
  (i32.store offset=36 (local.get $out) (local.get $zeros))
  (i32.store offset=40 (local.get $out) (local.get $long))
  (i32.store offset=44 (local.get $out) (local.get $bits)))
