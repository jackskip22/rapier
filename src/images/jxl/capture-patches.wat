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

;; Hash slots retain insertion order separately; a zero count marks an empty slot.
(func $peelSlot (param $key i32) (param $table i32) (param $mask i32) (param $shift i32) (result i32)
  (local $slot i32) (local $at i32)
  (local.set $slot (i32.mul (i32.xor (local.get $key) (i32.shr_u (local.get $key) (i32.const 16))) (i32.const -1640531535)))
  (local.set $slot (i32.and (i32.xor (local.get $slot) (i32.shr_u (local.get $slot) (i32.const 15))) (local.get $mask)))
  (loop $find
    (local.set $at (i32.add (local.get $table) (i32.shl (local.get $slot) (local.get $shift))))
    (if (i32.or (i32.eqz (i32.load offset=4 (local.get $at))) (i32.eq (i32.load (local.get $at)) (local.get $key)))
      (then (return (local.get $at))))
    (local.set $slot (i32.and (i32.add (local.get $slot) (i32.const 1)) (local.get $mask)))
    (br $find))
  (unreachable))

;; Samples at global positions 0,61,...; the first inserted color wins a count tie.
(func (export "peelBackground") (param $words i32) (param $n i32) (param $offset i32)
  (param $table i32) (param $mask i32) (param $order i32) (param $state i32) (param $last i32) (result i32)
  (local $i i32) (local $v i32) (local $at i32) (local $made i32) (local $count i32) (local $best i32) (local $most i32)
  (local.set $made (i32.load (local.get $state)))
  (local.set $i (i32.rem_u (i32.sub (i32.const 61) (i32.rem_u (local.get $offset) (i32.const 61))) (i32.const 61)))
  (block $done (loop $sample
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $v (i32.load (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2)))))
    (local.set $at (call $peelSlot (local.get $v) (local.get $table) (local.get $mask) (i32.const 3)))
    (local.set $count (i32.load offset=4 (local.get $at)))
    (if (i32.eqz (local.get $count)) (then
      (i32.store (local.get $at) (local.get $v))
      (i32.store (i32.add (local.get $order) (i32.shl (local.get $made) (i32.const 2))) (local.get $at))
      (local.set $made (i32.add (local.get $made) (i32.const 1)))))
    (i32.store offset=4 (local.get $at) (i32.add (local.get $count) (i32.const 1)))
    (local.set $i (i32.add (local.get $i) (i32.const 61)))
    (br $sample)))
  (i32.store (local.get $state) (local.get $made))
  (if (local.get $last) (then
    (local.set $i (i32.const 0))
    (block $chosen (loop $choose
      (br_if $chosen (i32.ge_u (local.get $i) (local.get $made)))
      (local.set $at (i32.load (i32.add (local.get $order) (i32.shl (local.get $i) (i32.const 2)))))
      (local.set $count (i32.load offset=4 (local.get $at)))
      (if (i32.gt_u (local.get $count) (local.get $most)) (then
        (local.set $most (local.get $count)) (local.set $best (i32.load (local.get $at)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $choose)))))
  (local.get $best))

(func $peelFill (param $out i32) (param $n i32) (param $value i32)
  (local $i i32) (local $v v128)
  (local.set $v (i32x4.splat (local.get $value)))
  (block $tail (loop $quad
    (br_if $tail (i32.gt_u (i32.add (local.get $i) (i32.const 4)) (local.get $n)))
    (v128.store (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 2))) (local.get $v))
    (local.set $i (i32.add (local.get $i) (i32.const 4))) (br $quad)))
  (block $done (loop $one
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (i32.store (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 2))) (local.get $value))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $one))))

;; One mark's local rectangle and global run triples. Returns its ink count, or -1 when admission fails.
(func (export "peelCellData") (param $raw i32) (param $w i32) (param $h i32) (param $x i32) (param $y i32)
  (param $bg i32) (param $runs i32) (param $runCount i32) (param $out i32) (param $table i32) (result i32)
  (local $i i32) (local $r i32) (local $p i32) (local $end i32) (local $v i32) (local $pixels i32) (local $colors i32)
  (local $at i32) (local $mul i32) (local $id i32)
  (local.set $mul (i32.eq (local.get $bg) (i32.const -1)))
  (local.set $id (select (i32.const -1) (i32.const 0) (local.get $mul)))
  (call $peelFill (local.get $out) (i32.mul (local.get $w) (local.get $h)) (local.get $id))
  (block $counted (loop $count
    (br_if $counted (i32.ge_u (local.get $i) (local.get $runCount)))
    (local.set $r (i32.add (local.get $runs) (i32.mul (local.get $i) (i32.const 12))))
    (local.set $pixels (i32.add (local.get $pixels) (i32.add (i32.sub (i32.load offset=8 (local.get $r)) (i32.load offset=4 (local.get $r))) (i32.const 1))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $count)))
  (if (i32.ge_u (local.get $pixels) (i32.const 1024)) (then (memory.fill (local.get $table) (i32.const 0) (i32.const 262144))))
  (local.set $i (i32.const 0))
  (block $done (loop $run
    (br_if $done (i32.ge_u (local.get $i) (local.get $runCount)))
    (local.set $r (i32.add (local.get $runs) (i32.mul (local.get $i) (i32.const 12))))
    (local.set $p (i32.add (i32.mul (i32.sub (i32.load (local.get $r)) (local.get $y)) (local.get $w)) (i32.sub (i32.load offset=4 (local.get $r)) (local.get $x))))
    (local.set $end (i32.add (local.get $p) (i32.add (i32.sub (i32.load offset=8 (local.get $r)) (i32.load offset=4 (local.get $r))) (i32.const 1))))
    (block $row (loop $pixel
      (br_if $row (i32.ge_u (local.get $p) (local.get $end)))
      (local.set $v (i32.load (i32.add (local.get $raw) (i32.shl (local.get $p) (i32.const 2)))))
      (if (i32.eqz (local.get $mul)) (then
        (if (i32.or
          (i32.or (i32.lt_u (i32.and (local.get $v) (i32.const 255)) (i32.and (local.get $bg) (i32.const 255)))
            (i32.lt_u (i32.and (i32.shr_u (local.get $v) (i32.const 8)) (i32.const 255)) (i32.and (i32.shr_u (local.get $bg) (i32.const 8)) (i32.const 255))))
          (i32.or (i32.lt_u (i32.and (i32.shr_u (local.get $v) (i32.const 16)) (i32.const 255)) (i32.and (i32.shr_u (local.get $bg) (i32.const 16)) (i32.const 255)))
            (i32.lt_u (i32.shr_u (local.get $v) (i32.const 24)) (i32.shr_u (local.get $bg) (i32.const 24)))))
          (then (return (i32.const -1))))))
      (if (i32.ge_u (local.get $pixels) (i32.const 1024)) (then
        (local.set $at (call $peelSlot (local.get $v) (local.get $table) (i32.const 32767) (i32.const 3)))
        (if (i32.eqz (i32.load offset=4 (local.get $at))) (then
          (i32.store (local.get $at) (local.get $v)) (i32.store offset=4 (local.get $at) (i32.const 1))
          (local.set $colors (i32.add (local.get $colors) (i32.const 1)))))))
      (i32.store (i32.add (local.get $out) (i32.shl (local.get $p) (i32.const 2)))
        (select (local.get $v) (i32.sub (local.get $v) (local.get $bg)) (local.get $mul)))
      (local.set $p (i32.add (local.get $p) (i32.const 1))) (br $pixel)))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $run)))
  (if (i32.and (i32.ge_u (local.get $colors) (i32.const 1024)) (i32.gt_u (i32.shl (local.get $colors) (i32.const 1)) (local.get $pixels)))
    (then (return (i32.const -1))))
  (local.get $pixels))

(func $peelEqual (export "peelEqual") (param $a i32) (param $b i32) (param $n i32) (result i32)
  (local $i i32)
  (block $tail (loop $quad
    (br_if $tail (i32.gt_u (i32.add (local.get $i) (i32.const 4)) (local.get $n)))
    (if (i32.eqz (i32x4.all_true (i32x4.eq (v128.load (i32.add (local.get $a) (i32.shl (local.get $i) (i32.const 2))))
      (v128.load (i32.add (local.get $b) (i32.shl (local.get $i) (i32.const 2))))))) (then (return (i32.const 0))))
    (local.set $i (i32.add (local.get $i) (i32.const 4))) (br $quad)))
  (block $done (loop $one
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (if (i32.ne (i32.load (i32.add (local.get $a) (i32.shl (local.get $i) (i32.const 2))))
      (i32.load (i32.add (local.get $b) (i32.shl (local.get $i) (i32.const 2))))) (then (return (i32.const 0))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $one)))
  (i32.const 1))

;; Hash every cell; optionally return nonidentity cells as reverse-order x,y,value triples.
(func (export "peelGlyphs") (param $cells i32) (param $w i32) (param $h i32) (param $id i32)
  (param $ink i32) (param $out i32) (result i32)
  (local $n i32) (local $i i32) (local $v i32) (local $hash i32) (local $count i32) (local $p i32)
  (local.set $n (i32.mul (local.get $w) (local.get $h)))
  (local.set $hash (i32.xor (i32.mul (local.get $w) (i32.const -1640531535)) (local.get $h)))
  (block $hashed (loop $hash
    (br_if $hashed (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $v (i32.load (i32.add (local.get $cells) (i32.shl (local.get $i) (i32.const 2)))))
    (local.set $hash (i32.mul (i32.xor (local.get $hash) (local.get $v)) (i32.const 16777619)))
    (local.set $count (i32.add (local.get $count) (i32.ne (local.get $v) (local.get $id))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $hash)))
  (i32.store (local.get $out) (local.get $hash))
  (if (local.get $ink) (then
    (local.set $p (local.get $ink))
    (block $done (loop $reverse
      (br_if $done (i32.eqz (local.get $i)))
      (local.set $i (i32.sub (local.get $i) (i32.const 1)))
      (local.set $v (i32.load (i32.add (local.get $cells) (i32.shl (local.get $i) (i32.const 2)))))
      (if (i32.ne (local.get $v) (local.get $id)) (then
        (i32.store (local.get $p) (i32.rem_u (local.get $i) (local.get $w)))
        (i32.store offset=4 (local.get $p) (i32.div_u (local.get $i) (local.get $w)))
        (i32.store offset=8 (local.get $p) (local.get $v))
        (local.set $p (i32.add (local.get $p) (i32.const 12)))))
      (br $reverse)))))
  (local.get $count))

;; Template records: width,height,ink pointer,ink count,anchor x,y,value,next index + 1.
(func (export "peelTemplates") (param $records i32) (param $count i32) (param $table i32) (param $mask i32)
  (local $i i32) (local $r i32) (local $slot i32) (local $last i32)
  (memory.fill (local.get $table) (i32.const 0) (i32.shl (i32.add (local.get $mask) (i32.const 1)) (i32.const 4)))
  (block $done (loop $template
    (br_if $done (i32.ge_u (local.get $i) (local.get $count)))
    (local.set $r (i32.add (local.get $records) (i32.shl (local.get $i) (i32.const 5))))
    (i32.store offset=28 (local.get $r) (i32.const 0))
    (local.set $slot (call $peelSlot (i32.load offset=24 (local.get $r)) (local.get $table) (local.get $mask) (i32.const 4)))
    (local.set $last (i32.load offset=12 (local.get $slot)))
    (if (local.get $last) (then
      (i32.store offset=28 (i32.add (local.get $records) (i32.shl (i32.sub (local.get $last) (i32.const 1)) (i32.const 5))) (i32.add (local.get $i) (i32.const 1))))
      (else (i32.store (local.get $slot) (i32.load offset=24 (local.get $r)))
        (i32.store offset=4 (local.get $slot) (i32.const 1))
        (i32.store offset=8 (local.get $slot) (i32.add (local.get $i) (i32.const 1)))))
    (i32.store offset=12 (local.get $slot) (i32.add (local.get $i) (i32.const 1)))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $template))))

;; Erases disjoint template ink, reporting template index and origin, then the remainder bounds. State is pixel,
;; next template + 1, match count. Zero finishes; a template + 1 asks the bridge to stage that ink and resume here.
(func (export "peelFactor") (param $cells i32) (param $w i32) (param $h i32) (param $id i32)
  (param $records i32) (param $table i32) (param $mask i32) (param $out i32) (param $bounds i32)
  (param $state i32) (param $loaded i32) (param $staged i32) (result i32)
  (local $i i32) (local $n i32) (local $v i32) (local $slot i32) (local $next i32) (local $r i32)
  (local $ox i32) (local $oy i32) (local $ink i32) (local $count i32) (local $k i32) (local $p i32) (local $at i32)
  (local $made i32) (local $x i32) (local $y i32) (local $x0 i32) (local $y0 i32) (local $x1 i32) (local $y1 i32)
  (local.set $n (i32.mul (local.get $w) (local.get $h)))
  (local.set $i (i32.load (local.get $state))) (local.set $next (i32.load offset=4 (local.get $state)))
  (local.set $made (i32.load offset=8 (local.get $state)))
  (block $done (loop $pixel
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (if (i32.eqz (local.get $next)) (then
      (local.set $v (i32.load (i32.add (local.get $cells) (i32.shl (local.get $i) (i32.const 2)))))
      (if (i32.ne (local.get $v) (local.get $id)) (then
      (local.set $slot (call $peelSlot (local.get $v) (local.get $table) (local.get $mask) (i32.const 4)))
      (local.set $next (i32.load offset=8 (local.get $slot)))))))
      (block $tried (loop $template
        (br_if $tried (i32.eqz (local.get $next)))
        (local.set $r (i32.add (local.get $records) (i32.shl (i32.sub (local.get $next) (i32.const 1)) (i32.const 5))))
        (local.set $ox (i32.sub (i32.rem_u (local.get $i) (local.get $w)) (i32.load offset=16 (local.get $r))))
        (local.set $oy (i32.sub (i32.div_u (local.get $i) (local.get $w)) (i32.load offset=20 (local.get $r))))
        (block $skip
          (br_if $skip (i32.or (i32.or (i32.lt_s (local.get $ox) (i32.const 0)) (i32.lt_s (local.get $oy) (i32.const 0)))
            (i32.or (i32.gt_u (i32.add (local.get $ox) (i32.load (local.get $r))) (local.get $w))
              (i32.gt_u (i32.add (local.get $oy) (i32.load offset=4 (local.get $r))) (local.get $h)))))
          (local.set $ink (i32.load offset=8 (local.get $r))) (local.set $count (i32.load offset=12 (local.get $r)))
          (if (i32.eqz (local.get $ink)) (then
            (if (i32.ne (local.get $next) (local.get $loaded)) (then
              (i32.store (local.get $state) (local.get $i)) (i32.store offset=4 (local.get $state) (local.get $next))
              (i32.store offset=8 (local.get $state) (local.get $made)) (return (local.get $next))))
            (local.set $ink (local.get $staged))))
          (local.set $k (i32.const 0))
          (block $matched (loop $test
            (br_if $matched (i32.ge_u (local.get $k) (local.get $count)))
            (local.set $p (i32.add (local.get $ink) (i32.mul (local.get $k) (i32.const 12))))
            (local.set $at (i32.add (local.get $cells) (i32.shl (i32.add (i32.mul (i32.add (local.get $oy) (i32.load offset=4 (local.get $p))) (local.get $w))
              (i32.add (local.get $ox) (i32.load (local.get $p)))) (i32.const 2))))
            (br_if $skip (i32.ne (i32.load (local.get $at)) (i32.load offset=8 (local.get $p))))
            (local.set $k (i32.add (local.get $k) (i32.const 1))) (br $test)))
          (local.set $k (i32.const 0))
          (block $erased (loop $erase
            (br_if $erased (i32.ge_u (local.get $k) (local.get $count)))
            (local.set $p (i32.add (local.get $ink) (i32.mul (local.get $k) (i32.const 12))))
            (i32.store (i32.add (local.get $cells) (i32.shl (i32.add (i32.mul (i32.add (local.get $oy) (i32.load offset=4 (local.get $p))) (local.get $w))
              (i32.add (local.get $ox) (i32.load (local.get $p)))) (i32.const 2))) (local.get $id))
            (local.set $k (i32.add (local.get $k) (i32.const 1))) (br $erase)))
          (local.set $at (i32.add (local.get $out) (i32.mul (local.get $made) (i32.const 12))))
          (i32.store (local.get $at) (i32.sub (local.get $next) (i32.const 1)))
          (i32.store offset=4 (local.get $at) (local.get $ox)) (i32.store offset=8 (local.get $at) (local.get $oy))
          (local.set $made (i32.add (local.get $made) (i32.const 1))) (br $tried))
        (local.set $next (i32.load offset=28 (local.get $r))) (br $template)))
    (local.set $next (i32.const 0))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $pixel)))
  (i32.store (local.get $state) (local.get $n)) (i32.store offset=4 (local.get $state) (i32.const 0))
  (i32.store offset=8 (local.get $state) (local.get $made))
  (local.set $x0 (local.get $w)) (local.set $y0 (local.get $h))
  (local.set $x1 (i32.const -1)) (local.set $y1 (i32.const -1)) (local.set $i (i32.const 0))
  (block $bounded (loop $bound
    (br_if $bounded (i32.ge_u (local.get $i) (local.get $n)))
    (if (i32.ne (i32.load (i32.add (local.get $cells) (i32.shl (local.get $i) (i32.const 2)))) (local.get $id)) (then
      (local.set $x (i32.rem_u (local.get $i) (local.get $w))) (local.set $y (i32.div_u (local.get $i) (local.get $w)))
      (if (i32.lt_s (local.get $x) (local.get $x0)) (then (local.set $x0 (local.get $x))))
      (if (i32.gt_s (local.get $x) (local.get $x1)) (then (local.set $x1 (local.get $x))))
      (if (i32.lt_s (local.get $y) (local.get $y0)) (then (local.set $y0 (local.get $y))))
      (if (i32.gt_s (local.get $y) (local.get $y1)) (then (local.set $y1 (local.get $y))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $bound)))
  (i32.store (local.get $bounds) (local.get $x0)) (i32.store offset=4 (local.get $bounds) (local.get $y0))
  (i32.store offset=8 (local.get $bounds) (local.get $x1)) (i32.store offset=12 (local.get $bounds) (local.get $y1))
  (i32.const 0))

(func $peelRectEqual (param $a i32) (param $aw i32) (param $ah i32) (param $b i32) (param $bw i32) (result i32)
  (local $row i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $row) (local.get $ah)))
    (if (i32.eqz (call $peelEqual (local.get $a) (local.get $b) (local.get $aw))) (then (return (i32.const 0))))
    (local.set $a (i32.add (local.get $a) (i32.shl (local.get $aw) (i32.const 2))))
    (local.set $b (i32.add (local.get $b) (i32.shl (local.get $bw) (i32.const 2))))
    (local.set $row (i32.add (local.get $row) (i32.const 1))) (br $each)))
  (i32.const 1))

;; One contiguous band of groups, indexed by ink value in group/cell order. Records are width,height,cells,area.
(func (export "peelContainIndex") (param $records i32) (param $count i32) (param $id i32)
  (param $table i32) (param $mask i32) (param $nodes i32)
  (local $g i32) (local $r i32) (local $cells i32) (local $n i32) (local $i i32) (local $v i32)
  (local $slot i32) (local $last i32) (local $node i32) (local $made i32)
  (memory.fill (local.get $table) (i32.const 0) (i32.shl (i32.add (local.get $mask) (i32.const 1)) (i32.const 4)))
  (block $indexed (loop $group
    (br_if $indexed (i32.ge_u (local.get $g) (local.get $count)))
    (local.set $r (i32.add (local.get $records) (i32.shl (local.get $g) (i32.const 4))))
    (local.set $cells (i32.load offset=8 (local.get $r))) (local.set $n (i32.load offset=12 (local.get $r)))
    (local.set $i (i32.const 0))
    (block $done (loop $pixel
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (local.set $v (i32.load (i32.add (local.get $cells) (i32.shl (local.get $i) (i32.const 2)))))
      (if (i32.ne (local.get $v) (local.get $id)) (then
        (local.set $slot (call $peelSlot (local.get $v) (local.get $table) (local.get $mask) (i32.const 4)))
        (local.set $node (i32.add (local.get $nodes) (i32.mul (local.get $made) (i32.const 12))))
        (i32.store (local.get $node) (local.get $g)) (i32.store offset=4 (local.get $node) (local.get $i))
        (i32.store offset=8 (local.get $node) (i32.const 0))
        (local.set $last (i32.load offset=12 (local.get $slot)))
        (if (local.get $last) (then
          (i32.store offset=8 (i32.add (local.get $nodes) (i32.mul (i32.sub (local.get $last) (i32.const 1)) (i32.const 12))) (i32.add (local.get $made) (i32.const 1))))
          (else (i32.store (local.get $slot) (local.get $v))
            (i32.store offset=8 (local.get $slot) (i32.add (local.get $made) (i32.const 1)))))
        (i32.store offset=4 (local.get $slot) (i32.add (i32.load offset=4 (local.get $slot)) (i32.const 1)))
        (i32.store offset=12 (local.get $slot) (i32.add (local.get $made) (i32.const 1)))
        (local.set $made (i32.add (local.get $made) (i32.const 1)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $pixel)))
    (local.set $g (i32.add (local.get $g) (i32.const 1))) (br $group)))
)

;; Find this target's first larger container in the band. Any absent ink value rejects the whole band; otherwise the
;; rarest local ink enumerates candidates. Every anchor orders successful origins identically, in group/row order.
(func (export "peelContain") (param $cells i32) (param $tw i32) (param $th i32) (param $id i32)
  (param $records i32) (param $table i32) (param $mask i32) (param $nodes i32) (param $out i32) (result i32)
  (local $n i32) (local $i i32) (local $v i32) (local $slot i32) (local $anchor i32) (local $fewest i32) (local $freq i32)
  (local $tx i32) (local $ty i32) (local $next i32) (local $node i32) (local $g i32) (local $r i32)
  (local $gw i32) (local $gh i32) (local $ox i32) (local $oy i32)
  (local.set $n (i32.mul (local.get $tw) (local.get $th)))
  (local.set $fewest (i32.const -1)) (local.set $anchor (i32.const -1))
  (block $anchored (loop $anchor
    (br_if $anchored (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $v (i32.load (i32.add (local.get $cells) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.ne (local.get $v) (local.get $id)) (then
      (local.set $slot (call $peelSlot (local.get $v) (local.get $table) (local.get $mask) (i32.const 4)))
      (local.set $freq (i32.load offset=4 (local.get $slot)))
      (if (i32.eqz (local.get $freq)) (then (return (i32.const 0))))
      (if (i32.lt_u (local.get $freq) (local.get $fewest)) (then
        (local.set $fewest (local.get $freq)) (local.set $anchor (local.get $i))
        (local.set $next (i32.load offset=8 (local.get $slot)))
        (br_if $anchored (i32.eq (local.get $freq) (i32.const 1)))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $anchor)))
  (if (i32.lt_s (local.get $anchor) (i32.const 0)) (then (return (i32.const 0))))
  (local.set $tx (i32.rem_u (local.get $anchor) (local.get $tw))) (local.set $ty (i32.div_u (local.get $anchor) (local.get $tw)))
  (block $done (loop $candidate
    (br_if $done (i32.eqz (local.get $next)))
    (local.set $node (i32.add (local.get $nodes) (i32.mul (i32.sub (local.get $next) (i32.const 1)) (i32.const 12))))
    (local.set $g (i32.load (local.get $node)))
    (local.set $r (i32.add (local.get $records) (i32.shl (local.get $g) (i32.const 4))))
    (block $skip
      (br_if $skip (i32.le_u (i32.load offset=12 (local.get $r)) (local.get $n)))
      (local.set $gw (i32.load (local.get $r))) (local.set $gh (i32.load offset=4 (local.get $r)))
      (local.set $i (i32.load offset=4 (local.get $node)))
      (local.set $ox (i32.sub (i32.rem_u (local.get $i) (local.get $gw)) (local.get $tx)))
      (local.set $oy (i32.sub (i32.div_u (local.get $i) (local.get $gw)) (local.get $ty)))
      (br_if $skip (i32.or (i32.or (i32.lt_s (local.get $ox) (i32.const 0)) (i32.lt_s (local.get $oy) (i32.const 0)))
        (i32.or (i32.gt_u (i32.add (local.get $ox) (local.get $tw)) (local.get $gw)) (i32.gt_u (i32.add (local.get $oy) (local.get $th)) (local.get $gh)))))
      (if (call $peelRectEqual (local.get $cells) (local.get $tw) (local.get $th)
        (i32.add (i32.load offset=8 (local.get $r)) (i32.shl (i32.add (i32.mul (local.get $oy) (local.get $gw)) (local.get $ox)) (i32.const 2))) (local.get $gw)) (then
        (i32.store (local.get $out) (i32.add (local.get $g) (i32.const 1)))
        (i32.store offset=4 (local.get $out) (local.get $ox)) (i32.store offset=8 (local.get $out) (local.get $oy))
        (return (i32.const 1)))))
    (local.set $next (i32.load offset=8 (local.get $node))) (br $candidate)))
  (i32.const 0))

;; Fill approved run triples in a band of the body's pixels. Runs wholly outside the band are skipped.
(func (export "peelBody") (param $words i32) (param $width i32) (param $y0 i32) (param $rows i32)
  (param $runs i32) (param $count i32) (param $bg i32)
  (local $i i32) (local $r i32) (local $y i32) (local $x i32)
  (block $done (loop $run
    (br_if $done (i32.ge_u (local.get $i) (local.get $count)))
    (local.set $r (i32.add (local.get $runs) (i32.mul (local.get $i) (i32.const 12))))
    (local.set $y (i32.sub (i32.load (local.get $r)) (local.get $y0)))
    (if (i32.lt_u (local.get $y) (local.get $rows)) (then
      (local.set $x (i32.load offset=4 (local.get $r)))
      (call $peelFill (i32.add (local.get $words) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $width)) (local.get $x)) (i32.const 2)))
        (i32.add (i32.sub (i32.load offset=8 (local.get $r)) (local.get $x)) (i32.const 1)) (local.get $bg))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $run))))
