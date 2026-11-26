;; SPDX-License-Identifier: MIT
;; Whole-picture reads of the still encoder and capture, in WebAssembly.

  ;; smoothCells (capture-smooth.mjs captureSmoothRegions' cells): one row of 16 x 16 cells, $rows rows of $width RGBA
  ;; pixels at $rgba with their exact mask at $exact (1 byte a pixel), into $cw grid bytes at $grid (1: a candidate
  ;; smooth field). A cell whose opaque free pixels hold under two colors is skipped; otherwise it is a field when it has
  ;; at least 64 such pixels and more gentle steps (1 to 16) than hard ones (over 24) to its free right and lower
  ;; neighbors inside the cell. $seen is unused (kept for the caller's layout).
  (func (export "smoothCells") (param $rgba i32) (param $exact i32) (param $width i32) (param $rows i32) (param $grid i32) (param $seen i32)
    (local $cx i32) (local $cw i32) (local $x0 i32) (local $x1 i32) (local $x i32) (local $y i32) (local $p i32) (local $i i32)
    (local $first i32) (local $colors i32) (local $word i32) (local $samples i32) (local $smooth i32) (local $sharp i32)
    (local $delta i32) (local $j i32) (local $d i32) (local $e i32) (local $axis i32)
    (local.set $cw (i32.shr_u (i32.add (local.get $width) (i32.const 15)) (i32.const 4)))
    (block $cellsDone (loop $cells
      (br_if $cellsDone (i32.ge_u (local.get $cx) (local.get $cw)))
      (i32.store8 (i32.add (local.get $grid) (local.get $cx)) (i32.const 0))
      (local.set $x0 (i32.shl (local.get $cx) (i32.const 4)))
      (local.set $x1 (select (local.get $width) (i32.add (local.get $x0) (i32.const 16)) (i32.lt_u (local.get $width) (i32.add (local.get $x0) (i32.const 16)))))
      ;; The preflight: every pixel in order until a second color.
      (local.set $colors (i32.const 0))
      (local.set $y (i32.const 0))
      (block $preDone (loop $preRows
        (br_if $preDone (i32.or (i32.ge_u (local.get $y) (local.get $rows)) (i32.ge_u (local.get $colors) (i32.const 2))))
        (local.set $x (local.get $x0))
        (block $preRowDone (loop $preCols
          (br_if $preRowDone (i32.or (i32.ge_u (local.get $x) (local.get $x1)) (i32.ge_u (local.get $colors) (i32.const 2))))
          (local.set $p (i32.add (i32.mul (local.get $y) (local.get $width)) (local.get $x)))
          (local.set $i (i32.add (local.get $rgba) (i32.shl (local.get $p) (i32.const 2))))
          (if (i32.and (i32.eqz (i32.load8_u (i32.add (local.get $exact) (local.get $p)))) (i32.eq (i32.load8_u offset=3 (local.get $i)) (i32.const 255))) (then
            (local.set $word (i32.and (i32.load (local.get $i)) (i32.const 0xffffff)))
            (if (i32.eqz (local.get $colors))
              (then (local.set $first (local.get $word)) (local.set $colors (i32.const 1)))
              (else (if (i32.ne (local.get $word) (local.get $first)) (then (local.set $colors (i32.const 2))))))))
          (local.set $x (i32.add (local.get $x) (i32.const 1)))
          (br $preCols)))
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $preRows)))
      (if (i32.ge_u (local.get $colors) (i32.const 2)) (then
        (local.set $samples (i32.const 0)) (local.set $smooth (i32.const 0)) (local.set $sharp (i32.const 0))
        (local.set $y (i32.const 0))
        (block $rowsDone (loop $rowsLoop
          (br_if $rowsDone (i32.ge_u (local.get $y) (local.get $rows)))
          (local.set $x (local.get $x0))
          (block $colsDone (loop $cols
            (br_if $colsDone (i32.ge_u (local.get $x) (local.get $x1)))
            (local.set $p (i32.add (i32.mul (local.get $y) (local.get $width)) (local.get $x)))
            (local.set $i (i32.add (local.get $rgba) (i32.shl (local.get $p) (i32.const 2))))
            (if (i32.and (i32.eqz (i32.load8_u (i32.add (local.get $exact) (local.get $p)))) (i32.eq (i32.load8_u offset=3 (local.get $i)) (i32.const 255))) (then
              (local.set $samples (i32.add (local.get $samples) (i32.const 1)))
              (local.set $axis (i32.const 0))
              (block $axesDone (loop $axes
                (br_if $axesDone (i32.ge_u (local.get $axis) (i32.const 2)))
                (local.set $delta (if (result i32) (local.get $axis)
                  (then (select (local.get $width) (i32.const 0) (i32.lt_u (i32.add (local.get $y) (i32.const 1)) (local.get $rows))))
                  (else (select (i32.const 1) (i32.const 0) (i32.lt_u (i32.add (local.get $x) (i32.const 1)) (local.get $x1))))))
                (if (local.get $delta) (then (if (i32.eqz (i32.load8_u (i32.add (local.get $exact) (i32.add (local.get $p) (local.get $delta))))) (then
                  (local.set $j (i32.add (local.get $i) (i32.shl (local.get $delta) (i32.const 2))))
                  (local.set $d (i32.const 0))
                  (local.set $e (i32.sub (i32.load8_u (local.get $i)) (i32.load8_u (local.get $j))))
                  (local.set $e (select (local.get $e) (i32.sub (i32.const 0) (local.get $e)) (i32.ge_s (local.get $e) (i32.const 0))))
                  (local.set $d (select (local.get $e) (local.get $d) (i32.gt_s (local.get $e) (local.get $d))))
                  (local.set $e (i32.sub (i32.load8_u offset=1 (local.get $i)) (i32.load8_u offset=1 (local.get $j))))
                  (local.set $e (select (local.get $e) (i32.sub (i32.const 0) (local.get $e)) (i32.ge_s (local.get $e) (i32.const 0))))
                  (local.set $d (select (local.get $e) (local.get $d) (i32.gt_s (local.get $e) (local.get $d))))
                  (local.set $e (i32.sub (i32.load8_u offset=2 (local.get $i)) (i32.load8_u offset=2 (local.get $j))))
                  (local.set $e (select (local.get $e) (i32.sub (i32.const 0) (local.get $e)) (i32.ge_s (local.get $e) (i32.const 0))))
                  (local.set $d (select (local.get $e) (local.get $d) (i32.gt_s (local.get $e) (local.get $d))))
                  (if (i32.and (i32.ge_s (local.get $d) (i32.const 1)) (i32.le_s (local.get $d) (i32.const 16)))
                    (then (local.set $smooth (i32.add (local.get $smooth) (i32.const 1))))
                    (else (if (i32.gt_s (local.get $d) (i32.const 24)) (then (local.set $sharp (i32.add (local.get $sharp) (i32.const 1)))))))))))
                (local.set $axis (i32.add (local.get $axis) (i32.const 1)))
                (br $axes)))))
            (local.set $x (i32.add (local.get $x) (i32.const 1)))
            (br $cols)))
          (local.set $y (i32.add (local.get $y) (i32.const 1)))
          (br $rowsLoop)))
        (if (i32.and (i32.ge_u (local.get $samples) (i32.const 64)) (i32.gt_u (local.get $smooth) (local.get $sharp)))
          (then (i32.store8 (i32.add (local.get $grid) (local.get $cx)) (i32.const 1))))))
      (local.set $cx (i32.add (local.get $cx) (i32.const 1)))
      (br $cells))))

  ;; cutHistogram (capture-trees.mjs mergedCuts): $n weighted residuals (u32 at $res) and their property 15 (i32 at
  ;; $prop) into the context below each of $ncuts sorted cuts (i32 at $cuts; a sample goes past every cut it exceeds):
  ;; 48 u32 token counts a context at $hist and each context's raw bits (f64 at $raw), zeroed first. A token past 47
  ;; lands where the JavaScript's Float64Array index lands (the next context), or nowhere past the end.
  (func (export "cutHistogram") (param $res i32) (param $prop i32) (param $n i32) (param $cuts i32) (param $ncuts i32) (param $hist i32) (param $raw i32)
    (local $i i32) (local $p i32) (local $lo i32) (local $hi i32) (local $mid i32) (local $v i32) (local $z i32) (local $t i32) (local $at i32) (local $slots i32)
    (local.set $slots (i32.mul (i32.add (local.get $ncuts) (i32.const 1)) (i32.const 48)))
    (memory.fill (local.get $hist) (i32.const 0) (i32.shl (local.get $slots) (i32.const 2)))
    (memory.fill (local.get $raw) (i32.const 0) (i32.shl (i32.add (local.get $ncuts) (i32.const 1)) (i32.const 3)))
    (block $done (loop $samples
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (local.set $p (i32.load (i32.add (local.get $prop) (i32.shl (local.get $i) (i32.const 2)))))
      (local.set $lo (i32.const 0))
      (local.set $hi (local.get $ncuts))
      (block $found (loop $search
        (br_if $found (i32.ge_s (local.get $lo) (local.get $hi)))
        (local.set $mid (i32.shr_s (i32.add (local.get $lo) (local.get $hi)) (i32.const 1)))
        (if (i32.gt_s (local.get $p) (i32.load (i32.add (local.get $cuts) (i32.shl (local.get $mid) (i32.const 2)))))
          (then (local.set $lo (i32.add (local.get $mid) (i32.const 1))))
          (else (local.set $hi (local.get $mid))))
        (br $search)))
      (local.set $v (i32.load (i32.add (local.get $res) (i32.shl (local.get $i) (i32.const 2)))))
      (if (i32.lt_u (local.get $v) (i32.const 16))
        (then (local.set $t (local.get $v)))
        (else
          (local.set $z (i32.clz (local.get $v)))
          (local.set $t (i32.add (i32.const 16) (i32.or (i32.shl (i32.sub (i32.const 27) (local.get $z)) (i32.const 1))
            (i32.and (i32.shr_u (local.get $v) (i32.sub (i32.const 30) (local.get $z))) (i32.const 1)))))
          (local.set $at (i32.add (local.get $raw) (i32.shl (local.get $lo) (i32.const 3))))
          (f64.store (local.get $at) (f64.add (f64.load (local.get $at)) (f64.convert_i32_u (i32.sub (i32.const 30) (local.get $z)))))))
      (local.set $t (i32.add (i32.mul (local.get $lo) (i32.const 48)) (local.get $t)))
      (if (i32.lt_u (local.get $t) (local.get $slots)) (then
        (local.set $at (i32.add (local.get $hist) (i32.shl (local.get $t) (i32.const 2))))
        (i32.store (local.get $at) (i32.add (i32.load (local.get $at)) (i32.const 1)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $samples))))

  ;; probeSpectrum (v7/capture-region-look.mjs): over blocks [bx0, bx1) of $rows block rows of one plane's int16
  ;; coefficients (64 a block, $stride blocks a row), each block's AC magnitude sum to $sums, and at $stats its ACs at 1,
  ;; non-zero, low (u, v < 3), high (u or v >= 4) and its active blocks.
  (func (export "probeSpectrum") (param $c i32) (param $stride i32) (param $bx0 i32) (param $bx1 i32) (param $rows i32) (param $sums i32) (param $stats i32)
    (local $by i32) (local $bx i32) (local $k i32) (local $av i32) (local $sum i32) (local $nz i32)
    (local $n1 i32) (local $nzAll i32) (local $low i32) (local $high i32) (local $active i32)
    (loop $rowL (if (i32.lt_u (local.get $by) (local.get $rows)) (then
      (local.set $bx (local.get $bx0))
      (loop $colL (if (i32.lt_u (local.get $bx) (local.get $bx1)) (then
        (local.set $sum (i32.const 0)) (local.set $nz (i32.const 0)) (local.set $k (i32.const 1))
        (loop $kL
          (if (local.tee $av (call $absI (i32.load16_s (i32.add (local.get $c)
              (i32.shl (i32.add (i32.shl (i32.add (i32.mul (local.get $by) (local.get $stride)) (local.get $bx)) (i32.const 6)) (local.get $k)) (i32.const 1)))))) (then
            (local.set $nz (i32.add (local.get $nz) (i32.const 1)))
            (local.set $sum (i32.add (local.get $sum) (local.get $av)))
            (local.set $n1 (i32.add (local.get $n1) (i32.eq (local.get $av) (i32.const 1))))
            (local.set $low (i32.add (local.get $low) (i32.and (i32.lt_u (i32.and (local.get $k) (i32.const 7)) (i32.const 3)) (i32.lt_u (local.get $k) (i32.const 24)))))
            (local.set $high (i32.add (local.get $high) (i32.or (i32.ge_u (i32.and (local.get $k) (i32.const 7)) (i32.const 4)) (i32.ge_u (local.get $k) (i32.const 32)))))))
          (br_if $kL (i32.lt_u (local.tee $k (i32.add (local.get $k) (i32.const 1))) (i32.const 64))))
        (local.set $nzAll (i32.add (local.get $nzAll) (local.get $nz)))
        (local.set $active (i32.add (local.get $active) (i32.ne (local.get $nz) (i32.const 0))))
        (i32.store (local.get $sums) (local.get $sum))
        (local.set $sums (i32.add (local.get $sums) (i32.const 4)))
        (local.set $bx (i32.add (local.get $bx) (i32.const 1)))
        (br $colL))))
      (local.set $by (i32.add (local.get $by) (i32.const 1)))
      (br $rowL))))
    (i32.store (local.get $stats) (local.get $n1))
    (i32.store offset=4 (local.get $stats) (local.get $nzAll))
    (i32.store offset=8 (local.get $stats) (local.get $low))
    (i32.store offset=12 (local.get $stats) (local.get $high))
    (i32.store offset=16 (local.get $stats) (local.get $active)))
