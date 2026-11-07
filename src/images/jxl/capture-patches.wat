;; SPDX-License-Identifier: MIT
;; The patch finder's two passes (capture-patches.mjs): which pixels are marks' (ink), then the marks, eight-connected,
;; with their boxes. build-jxl-kernels.mjs joins these functions to the capture module. Memory, all byte offsets.

  ;; A band of `rows` rows from row `y0` of a `width` x `height` page: `words` is its first pixel (the rows above and
  ;; below it readable where the page has them), `ink` its first ink byte, `above` the page's columns' last flat colour
  ;; (4 bytes each, -1 before the first band). A pixel is flat when its eight neighbours equal it; any other pixel equal
  ;; to neither the last flat pixel to its left in its row nor the last above it in its column is ink (1). Four flat
  ;; pixels a comparison; where only some of four are flat, those four one at a time.
  (func (export "patchInk")
    (param $words i32) (param $width i32) (param $rows i32) (param $y0 i32) (param $height i32) (param $ink i32) (param $above i32)
    (local $y i32) (local $x i32) (local $p i32) (local $o i32) (local $v i32) (local $left i32) (local $inside i32)
    (local $w4 i32) (local $skip i32) (local $c v128) (local $flat v128)
    (local.set $w4 (i32.shl (local.get $width) (i32.const 2)))
    (local.set $y (i32.const 0))
    (block $done
      (loop $row
        (br_if $done (i32.ge_u (local.get $y) (local.get $rows)))
        (local.set $inside (i32.and (i32.gt_u (i32.add (local.get $y0) (local.get $y)) (i32.const 0))
          (i32.lt_u (i32.add (i32.add (local.get $y0) (local.get $y)) (i32.const 1)) (local.get $height))))
        (local.set $p (i32.add (local.get $words) (i32.mul (local.get $y) (local.get $w4))))
        (local.set $o (i32.add (local.get $ink) (i32.mul (local.get $y) (local.get $width))))
        (local.set $left (i32.const -1))
        (local.set $skip (i32.const 0))
        (local.set $x (i32.const 0))
        (block $columns
          (loop $column
            (br_if $columns (i32.ge_u (local.get $x) (local.get $width)))
            ;; Four pixels from x (all inside the row's interior) flat together: one comparison of each neighbour.
            (if (i32.and (i32.and (local.get $inside) (i32.eqz (local.get $skip))) (i32.and (i32.gt_u (local.get $x) (i32.const 0))
                  (i32.lt_u (i32.add (local.get $x) (i32.const 4)) (local.get $width))))
              (then
                (local.set $c (v128.load (local.get $p)))
                (local.set $flat (v128.and
                  (v128.and (i32x4.eq (local.get $c) (v128.load (i32.sub (local.get $p) (i32.const 4))))
                    (i32x4.eq (local.get $c) (v128.load (i32.add (local.get $p) (i32.const 4)))))
                  (v128.and
                    (v128.and (i32x4.eq (local.get $c) (v128.load (i32.sub (local.get $p) (local.get $w4))))
                      (i32x4.eq (local.get $c) (v128.load (i32.add (local.get $p) (local.get $w4)))))
                    (v128.and
                      (v128.and (i32x4.eq (local.get $c) (v128.load (i32.sub (i32.sub (local.get $p) (local.get $w4)) (i32.const 4))))
                        (i32x4.eq (local.get $c) (v128.load (i32.add (i32.sub (local.get $p) (local.get $w4)) (i32.const 4)))))
                      (v128.and (i32x4.eq (local.get $c) (v128.load (i32.sub (i32.add (local.get $p) (local.get $w4)) (i32.const 4))))
                        (i32x4.eq (local.get $c) (v128.load (i32.add (i32.add (local.get $p) (local.get $w4)) (i32.const 4)))))))))
                (if (i32x4.all_true (local.get $flat))
                  (then
                    (v128.store (i32.add (local.get $above) (i32.shl (local.get $x) (i32.const 2))) (local.get $c))
                    (local.set $left (i32x4.extract_lane 3 (local.get $c)))
                    (local.set $p (i32.add (local.get $p) (i32.const 16)))
                    (local.set $x (i32.add (local.get $x) (i32.const 4)))
                    (br $column)))
                ;; Some of the four are not flat: each by the rule below.
                (local.set $skip (i32.const 4))))
            (local.set $v (i32.load (local.get $p)))
            (if (if (result i32) (i32.and (local.get $inside) (i32.and (i32.gt_u (local.get $x) (i32.const 0))
                    (i32.lt_u (i32.add (local.get $x) (i32.const 1)) (local.get $width))))
                  (then (i32.and
                    (i32.and
                      (i32.and (i32.eq (local.get $v) (i32.load (i32.sub (local.get $p) (i32.const 4))))
                        (i32.eq (local.get $v) (i32.load (i32.add (local.get $p) (i32.const 4)))))
                      (i32.and (i32.eq (local.get $v) (i32.load (i32.sub (local.get $p) (local.get $w4))))
                        (i32.eq (local.get $v) (i32.load (i32.add (local.get $p) (local.get $w4))))))
                    (i32.and
                      (i32.and (i32.eq (local.get $v) (i32.load (i32.sub (i32.sub (local.get $p) (local.get $w4)) (i32.const 4))))
                        (i32.eq (local.get $v) (i32.load (i32.add (i32.sub (local.get $p) (local.get $w4)) (i32.const 4)))))
                      (i32.and (i32.eq (local.get $v) (i32.load (i32.sub (i32.add (local.get $p) (local.get $w4)) (i32.const 4))))
                        (i32.eq (local.get $v) (i32.load (i32.add (i32.add (local.get $p) (local.get $w4)) (i32.const 4))))))))
                  (else (i32.const 0)))
              (then
                (local.set $left (local.get $v))
                (i32.store (i32.add (local.get $above) (i32.shl (local.get $x) (i32.const 2))) (local.get $v)))
              (else
                (if (i32.and (i32.ne (local.get $v) (local.get $left))
                      (i32.ne (local.get $v) (i32.load (i32.add (local.get $above) (i32.shl (local.get $x) (i32.const 2))))))
                  (then (i32.store8 (i32.add (local.get $o) (local.get $x)) (i32.const 1))))))
            (local.set $p (i32.add (local.get $p) (i32.const 4)))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (if (local.get $skip) (then (local.set $skip (i32.sub (local.get $skip) (i32.const 1)))))
            (br $column)))
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $row))))

  ;; The marks of a `width` x `height` ink plane (1 unvisited, 2 visited after), in raster order of their first pixel:
  ;; each eight-connected, filled a run of a row at a time (a run's own row and the rows above and below it scanned) through a stack of up to `cap` runs (y, first x, last x: 12
  ;; bytes each) at `stack`. A mark whose box is at least `least` pixels and at most `side` wide and tall, with at least
  ;; half of `least` pixels (the patch finder's 4: two pixels; the unboxed text's 1: any) writes its box (x, y, width,
  ;; height: 16 bytes) at `boxes`. Returns how many, or -1 past `limit` boxes, -2 when the stack would overflow.
  (func (export "patchMarks")
    (param $ink i32) (param $width i32) (param $height i32) (param $stack i32) (param $cap i32) (param $boxes i32)
    (param $limit i32) (param $side i32) (param $least i32) (result i32)
    (local $sx i32) (local $sy i32) (local $p i32) (local $top i32) (local $count i32) (local $x0 i32) (local $x1 i32)
    (local $y1 i32) (local $y i32) (local $a i32) (local $b i32) (local $ny i32) (local $row i32) (local $x i32)
    (local $end i32) (local $ra i32) (local $rb i32) (local $e i32) (local $found i32) (local $bw i32) (local $bh i32)
    (local.set $p (local.get $ink))
    (block $done
      (loop $rows
        (br_if $done (i32.ge_u (local.get $sy) (local.get $height)))
        (local.set $sx (i32.const 0))
        (block $columns
          (loop $column
            (br_if $columns (i32.ge_u (local.get $sx) (local.get $width)))
            ;; Sixteen bytes without unvisited ink at once.
            (if (i32.le_u (i32.add (local.get $sx) (i32.const 16)) (local.get $width))
              (then (if (i32.eqz (v128.any_true (i8x16.eq (v128.load (local.get $p)) (i8x16.splat (i32.const 1)))))
                (then
                  (local.set $p (i32.add (local.get $p) (i32.const 16)))
                  (local.set $sx (i32.add (local.get $sx) (i32.const 16)))
                  (br $column)))))
            (if (i32.eq (i32.load8_u (local.get $p)) (i32.const 1))
              (then
                ;; The first pixel as a run of its own row, not yet filled: scanning that row fills its run.
                (local.set $count (i32.const 0))
                (local.set $x0 (local.get $sx)) (local.set $x1 (local.get $sx)) (local.set $y1 (local.get $sy))
                (i32.store (local.get $stack) (local.get $sy))
                (i32.store offset=4 (local.get $stack) (local.get $sx))
                (i32.store offset=8 (local.get $stack) (local.get $sx))
                (local.set $top (i32.const 1))
                (block $filled
                  (loop $fill
                    (br_if $filled (i32.eqz (local.get $top)))
                    (local.set $top (i32.sub (local.get $top) (i32.const 1)))
                    (local.set $e (i32.add (local.get $stack) (i32.mul (local.get $top) (i32.const 12))))
                    (local.set $y (i32.load (local.get $e)))
                    (local.set $a (i32.load offset=4 (local.get $e)))
                    (local.set $b (i32.load offset=8 (local.get $e)))
                    (local.set $ny (i32.sub (local.get $y) (i32.const 1)))
                    (loop $sides
                      (if (i32.lt_u (local.get $ny) (local.get $height))
                        (then
                          (local.set $row (i32.add (local.get $ink) (i32.mul (local.get $ny) (local.get $width))))
                          (local.set $x (select (i32.sub (local.get $a) (i32.const 1)) (i32.const 0) (local.get $a)))
                          (local.set $end (select (i32.add (local.get $b) (i32.const 1)) (local.get $b)
                            (i32.lt_u (i32.add (local.get $b) (i32.const 1)) (local.get $width))))
                          (block $scanned
                            (loop $scan
                              (br_if $scanned (i32.gt_s (local.get $x) (local.get $end)))
                              (if (i32.eq (i32.load8_u (i32.add (local.get $row) (local.get $x))) (i32.const 1))
                                (then
                                  (local.set $ra (local.get $x))
                                  (block $leftmost
                                    (loop $left
                                      (br_if $leftmost (i32.eqz (local.get $ra)))
                                      (br_if $leftmost (i32.ne (i32.load8_u (i32.add (local.get $row) (i32.sub (local.get $ra) (i32.const 1)))) (i32.const 1)))
                                      (local.set $ra (i32.sub (local.get $ra) (i32.const 1)))
                                      (br $left)))
                                  (local.set $rb (local.get $x))
                                  (block $rightmost
                                    (loop $rightward
                                      (br_if $rightmost (i32.ge_u (i32.add (local.get $rb) (i32.const 1)) (local.get $width)))
                                      (br_if $rightmost (i32.ne (i32.load8_u (i32.add (local.get $row) (i32.add (local.get $rb) (i32.const 1)))) (i32.const 1)))
                                      (local.set $rb (i32.add (local.get $rb) (i32.const 1)))
                                      (br $rightward)))
                                  (memory.fill (i32.add (local.get $row) (local.get $ra)) (i32.const 2) (i32.add (i32.sub (local.get $rb) (local.get $ra)) (i32.const 1)))
                                  (local.set $count (i32.add (local.get $count) (i32.add (i32.sub (local.get $rb) (local.get $ra)) (i32.const 1))))
                                  (if (i32.lt_s (local.get $ra) (local.get $x0)) (then (local.set $x0 (local.get $ra))))
                                  (if (i32.gt_s (local.get $rb) (local.get $x1)) (then (local.set $x1 (local.get $rb))))
                                  (if (i32.gt_s (local.get $ny) (local.get $y1)) (then (local.set $y1 (local.get $ny))))
                                  (if (i32.ge_u (local.get $top) (local.get $cap)) (then (return (i32.const -2))))
                                  (local.set $e (i32.add (local.get $stack) (i32.mul (local.get $top) (i32.const 12))))
                                  (i32.store (local.get $e) (local.get $ny))
                                  (i32.store offset=4 (local.get $e) (local.get $ra))
                                  (i32.store offset=8 (local.get $e) (local.get $rb))
                                  (local.set $top (i32.add (local.get $top) (i32.const 1)))
                                  (local.set $x (i32.add (local.get $rb) (i32.const 1)))))
                              (local.set $x (i32.add (local.get $x) (i32.const 1)))
                              (br $scan)))))
                      (local.set $ny (i32.add (local.get $ny) (i32.const 1)))
                      (br_if $sides (i32.le_s (local.get $ny) (i32.add (local.get $y) (i32.const 1)))))
                    (br $fill)))
                (local.set $bw (i32.add (i32.sub (local.get $x1) (local.get $x0)) (i32.const 1)))
                (local.set $bh (i32.add (i32.sub (local.get $y1) (local.get $sy)) (i32.const 1)))
                (if (i32.and (i32.and (i32.le_u (local.get $bw) (local.get $side)) (i32.le_u (local.get $bh) (local.get $side)))
                      (i32.and (i32.ge_u (i32.mul (local.get $bw) (local.get $bh)) (local.get $least))
                        (i32.ge_u (i32.shl (local.get $count) (i32.const 1)) (local.get $least))))
                  (then
                    (if (i32.ge_u (local.get $found) (local.get $limit)) (then (return (i32.const -1))))
                    (local.set $e (i32.add (local.get $boxes) (i32.shl (local.get $found) (i32.const 4))))
                    (i32.store (local.get $e) (local.get $x0))
                    (i32.store offset=4 (local.get $e) (local.get $sy))
                    (i32.store offset=8 (local.get $e) (local.get $bw))
                    (i32.store offset=12 (local.get $e) (local.get $bh))
                    (local.set $found (i32.add (local.get $found) (i32.const 1)))))))
            (local.set $p (i32.add (local.get $p) (i32.const 1)))
            (local.set $sx (i32.add (local.get $sx) (i32.const 1)))
            (br $column)))
        (local.set $sy (i32.add (local.get $sy) (i32.const 1)))
        (br $rows)))
    (local.get $found))

  ;; The peel's ink (capture-patches.mjs capturePeel): `n` bytes at `ink`, 1 where the pixel at `words` is not `bg`, sixteen
  ;; pixels a step.
  (func (export "peelInk") (param $words i32) (param $n i32) (param $bg i32) (param $ink i32)
    (local $i i32) (local $b v128) (local $one v128)
    (local.set $b (i32x4.splat (local.get $bg)))
    (local.set $one (i8x16.splat (i32.const 1)))
    (block $done
      (loop $sixteen
        (br_if $done (i32.gt_u (i32.add (local.get $i) (i32.const 16)) (local.get $n)))
        (v128.store (i32.add (local.get $ink) (local.get $i)) (v128.and (local.get $one)
          (i8x16.narrow_i16x8_s
            (i16x8.narrow_i32x4_s (i32x4.ne (v128.load (local.get $words)) (local.get $b))
              (i32x4.ne (v128.load offset=16 (local.get $words)) (local.get $b)))
            (i16x8.narrow_i32x4_s (i32x4.ne (v128.load offset=32 (local.get $words)) (local.get $b))
              (i32x4.ne (v128.load offset=48 (local.get $words)) (local.get $b))))))
        (local.set $words (i32.add (local.get $words) (i32.const 64)))
        (local.set $i (i32.add (local.get $i) (i32.const 16)))
        (br $sixteen)))
    (block $end
      (loop $one
        (br_if $end (i32.ge_u (local.get $i) (local.get $n)))
        (i32.store8 (i32.add (local.get $ink) (local.get $i)) (i32.ne (i32.load (local.get $words)) (local.get $bg)))
        (local.set $words (i32.add (local.get $words) (i32.const 4)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $one))))

  ;; The peel's marks: eight-connected ink (1 unvisited, 2 after) filled as patchMarks fills it. Each run filled is written
  ;; (row, first, last: 12 bytes) at `runs` while its mark's box is at most `side` wide and tall; a mark that outgrows that
  ;; takes its runs back and is filled on without them. Each mark kept writes x, y, width, height and its runs' first and
  ;; end offsets (24 bytes) at `marks`. Returns how many, or -1 past `limit` marks, -2 past `cap` stack runs, -3 past
  ;; `runCap` runs.
  (func (export "peelMarks")
    (param $ink i32) (param $width i32) (param $height i32) (param $stack i32) (param $cap i32) (param $runs i32)
    (param $runCap i32) (param $marks i32) (param $limit i32) (param $side i32) (result i32)
    (local $sx i32) (local $sy i32) (local $p i32) (local $top i32) (local $x0 i32) (local $x1 i32) (local $y1 i32)
    (local $y i32) (local $a i32) (local $b i32) (local $ny i32) (local $row i32) (local $x i32) (local $end i32)
    (local $ra i32) (local $rb i32) (local $e i32) (local $found i32) (local $at i32) (local $start i32) (local $small i32)
    (local $runEnd i32)
    (local.set $runEnd (i32.add (local.get $runs) (i32.mul (local.get $runCap) (i32.const 12))))
    (local.set $at (local.get $runs))
    (local.set $p (local.get $ink))
    (block $done
      (loop $rows
        (br_if $done (i32.ge_u (local.get $sy) (local.get $height)))
        (local.set $sx (i32.const 0))
        (block $columns
          (loop $column
            (br_if $columns (i32.ge_u (local.get $sx) (local.get $width)))
            (if (i32.le_u (i32.add (local.get $sx) (i32.const 16)) (local.get $width))
              (then (if (i32.eqz (v128.any_true (i8x16.eq (v128.load (local.get $p)) (i8x16.splat (i32.const 1)))))
                (then
                  (local.set $p (i32.add (local.get $p) (i32.const 16)))
                  (local.set $sx (i32.add (local.get $sx) (i32.const 16)))
                  (br $column)))))
            (if (i32.eq (i32.load8_u (local.get $p)) (i32.const 1))
              (then
                (local.set $x0 (local.get $sx)) (local.set $x1 (local.get $sx)) (local.set $y1 (local.get $sy))
                (local.set $start (local.get $at)) (local.set $small (i32.const 1))
                (i32.store (local.get $stack) (local.get $sy))
                (i32.store offset=4 (local.get $stack) (local.get $sx))
                (i32.store offset=8 (local.get $stack) (local.get $sx))
                (local.set $top (i32.const 1))
                (block $filled
                  (loop $fill
                    (br_if $filled (i32.eqz (local.get $top)))
                    (local.set $top (i32.sub (local.get $top) (i32.const 1)))
                    (local.set $e (i32.add (local.get $stack) (i32.mul (local.get $top) (i32.const 12))))
                    (local.set $y (i32.load (local.get $e)))
                    (local.set $a (i32.load offset=4 (local.get $e)))
                    (local.set $b (i32.load offset=8 (local.get $e)))
                    (local.set $ny (i32.sub (local.get $y) (i32.const 1)))
                    (loop $sides
                      (if (i32.lt_u (local.get $ny) (local.get $height))
                        (then
                          (local.set $row (i32.add (local.get $ink) (i32.mul (local.get $ny) (local.get $width))))
                          (local.set $x (select (i32.sub (local.get $a) (i32.const 1)) (i32.const 0) (local.get $a)))
                          (local.set $end (select (i32.add (local.get $b) (i32.const 1)) (local.get $b)
                            (i32.lt_u (i32.add (local.get $b) (i32.const 1)) (local.get $width))))
                          (block $scanned
                            (loop $scan
                              (br_if $scanned (i32.gt_s (local.get $x) (local.get $end)))
                              (if (i32.eq (i32.load8_u (i32.add (local.get $row) (local.get $x))) (i32.const 1))
                                (then
                                  (local.set $ra (local.get $x))
                                  (block $leftmost
                                    (loop $left
                                      (br_if $leftmost (i32.eqz (local.get $ra)))
                                      (br_if $leftmost (i32.ne (i32.load8_u (i32.add (local.get $row) (i32.sub (local.get $ra) (i32.const 1)))) (i32.const 1)))
                                      (local.set $ra (i32.sub (local.get $ra) (i32.const 1)))
                                      (br $left)))
                                  (local.set $rb (local.get $x))
                                  (block $rightmost
                                    (loop $rightward
                                      (br_if $rightmost (i32.ge_u (i32.add (local.get $rb) (i32.const 1)) (local.get $width)))
                                      (br_if $rightmost (i32.ne (i32.load8_u (i32.add (local.get $row) (i32.add (local.get $rb) (i32.const 1)))) (i32.const 1)))
                                      (local.set $rb (i32.add (local.get $rb) (i32.const 1)))
                                      (br $rightward)))
                                  (memory.fill (i32.add (local.get $row) (local.get $ra)) (i32.const 2) (i32.add (i32.sub (local.get $rb) (local.get $ra)) (i32.const 1)))
                                  (if (local.get $small)
                                    (then
                                      (if (i32.lt_s (local.get $ra) (local.get $x0)) (then (local.set $x0 (local.get $ra))))
                                      (if (i32.gt_s (local.get $rb) (local.get $x1)) (then (local.set $x1 (local.get $rb))))
                                      (if (i32.gt_s (local.get $ny) (local.get $y1)) (then (local.set $y1 (local.get $ny))))
                                      (if (i32.or (i32.ge_u (i32.sub (local.get $x1) (local.get $x0)) (local.get $side))
                                            (i32.ge_u (i32.sub (local.get $y1) (local.get $sy)) (local.get $side)))
                                        (then (local.set $small (i32.const 0)) (local.set $at (local.get $start)))
                                        (else
                                          (if (i32.ge_u (local.get $at) (local.get $runEnd)) (then (return (i32.const -3))))
                                          (i32.store (local.get $at) (local.get $ny))
                                          (i32.store offset=4 (local.get $at) (local.get $ra))
                                          (i32.store offset=8 (local.get $at) (local.get $rb))
                                          (local.set $at (i32.add (local.get $at) (i32.const 12)))))))
                                  (if (i32.ge_u (local.get $top) (local.get $cap)) (then (return (i32.const -2))))
                                  (local.set $e (i32.add (local.get $stack) (i32.mul (local.get $top) (i32.const 12))))
                                  (i32.store (local.get $e) (local.get $ny))
                                  (i32.store offset=4 (local.get $e) (local.get $ra))
                                  (i32.store offset=8 (local.get $e) (local.get $rb))
                                  (local.set $top (i32.add (local.get $top) (i32.const 1)))
                                  (local.set $x (i32.add (local.get $rb) (i32.const 1)))))
                              (local.set $x (i32.add (local.get $x) (i32.const 1)))
                              (br $scan)))))
                      (local.set $ny (i32.add (local.get $ny) (i32.const 1)))
                      (br_if $sides (i32.le_s (local.get $ny) (i32.add (local.get $y) (i32.const 1)))))
                    (br $fill)))
                (if (local.get $small)
                  (then
                    (if (i32.ge_u (local.get $found) (local.get $limit)) (then (return (i32.const -1))))
                    (local.set $e (i32.add (local.get $marks) (i32.mul (local.get $found) (i32.const 24))))
                    (i32.store (local.get $e) (local.get $x0))
                    (i32.store offset=4 (local.get $e) (local.get $sy))
                    (i32.store offset=8 (local.get $e) (i32.add (i32.sub (local.get $x1) (local.get $x0)) (i32.const 1)))
                    (i32.store offset=12 (local.get $e) (i32.add (i32.sub (local.get $y1) (local.get $sy)) (i32.const 1)))
                    (i32.store offset=16 (local.get $e) (i32.div_u (i32.sub (local.get $start) (local.get $runs)) (i32.const 4)))
                    (i32.store offset=20 (local.get $e) (i32.div_u (i32.sub (local.get $at) (local.get $runs)) (i32.const 4)))
                    (local.set $found (i32.add (local.get $found) (i32.const 1)))))))
            (local.set $p (i32.add (local.get $p) (i32.const 1)))
            (local.set $sx (i32.add (local.get $sx) (i32.const 1)))
            (br $column)))
        (local.set $sy (i32.add (local.get $sy) (i32.const 1)))
        (br $rows)))
    (local.get $found))
