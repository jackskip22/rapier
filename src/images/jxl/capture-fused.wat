;; SPDX-License-Identifier: MIT
;; The patched page's frame rows (capture-fused.mjs; capture-patched.mjs patchedPageSteps), produced in this module's
;; arena (WA2, 4 Nov): the page dx samples right and dy down inside its frame, the samples left of it its first column,
;; and every sample a patch places filled along its row from the nearest unplaced sample left of it to the nearest right
;; of it, linearly, rounded as JavaScript's Math.round rounds (every f64 operation the JavaScript's, in its order). The
;; host copies each frame row's picture row once into the band at its place (dx samples in); this fills and pads it there.
(module
  ;; The host's arena: capture-fused.mjs's own (FRAME_ROWS_BUDGET at most) or another engine's memory of any size.
  (import "env" "memory" (memory 1))

  ;; Math.round of a value in [0, 255]: floor, and one more where the fraction is a half or more (exact: v - floor(v) is).
  (func $frameRound (param $v f64) (result i32)
    (local $f f64)
    (local.set $f (f64.floor (local.get $v)))
    (i32.add (i32.trunc_f64_s (local.get $f)) (f64.ge (f64.sub (local.get $v) (local.get $f)) (f64.const 0.5))))

  ;; Frame rows $y .. $y + $count of a frame $fw samples wide, at $band (RGBA, $fw * 4 bytes a row), each row's picture
  ;; samples already at dx; the picture is $width samples wide and sits $dy rows down. $boxes: $n placed boxes as i32
  ;; x, y, w, h (16 bytes each, sorted by y, none taller than $tall), in picture samples. $mask: $width bytes of scratch.
  (func (export "frameRows") (param $band i32) (param $fw i32) (param $count i32) (param $y i32) (param $dy i32) (param $dx i32)
    (param $width i32) (param $boxes i32) (param $n i32) (param $tall i32) (param $mask i32)
    (local $r i32) (local $py i32) (local $row i32) (local $base i32) (local $lo i32) (local $hi i32) (local $mid i32)
    (local $i i32) (local $b i32) (local $bx i32) (local $by i32) (local $bw i32) (local $x0 i32) (local $x1 i32)
    (local $x i32) (local $e i32) (local $k i32) (local $c i32) (local $at i32) (local $first i32)
    (local $den f64) (local $t f64) (local $a0 f64) (local $a1 f64) (local $a2 f64) (local $b0 f64) (local $b1 f64) (local $b2 f64)
    ;; The first box that can reach the first row's picture row: the first whose top is at or past that row - $tall + 1.
    (local.set $py (i32.sub (local.get $y) (local.get $dy)))
    (if (i32.lt_s (local.get $py) (i32.const 0)) (then (local.set $py (i32.const 0))))
    (local.set $first (i32.add (i32.sub (local.get $py) (local.get $tall)) (i32.const 1)))
    (local.set $hi (local.get $n))
    (block $found (loop $search
      (br_if $found (i32.ge_u (local.get $lo) (local.get $hi)))
      (local.set $mid (i32.shr_u (i32.add (local.get $lo) (local.get $hi)) (i32.const 1)))
      (if (i32.lt_s (i32.load offset=4 (i32.add (local.get $boxes) (i32.shl (local.get $mid) (i32.const 4)))) (local.get $first))
        (then (local.set $lo (i32.add (local.get $mid) (i32.const 1))))
        (else (local.set $hi (local.get $mid))))
      (br $search)))
    (block $done (loop $rows
      (br_if $done (i32.ge_u (local.get $r) (local.get $count)))
      (local.set $py (i32.sub (i32.add (local.get $y) (local.get $r)) (local.get $dy)))
      (if (i32.lt_s (local.get $py) (i32.const 0)) (then (local.set $py (i32.const 0))))
      (local.set $row (i32.add (local.get $band) (i32.mul (local.get $r) (i32.shl (local.get $fw) (i32.const 2)))))
      (local.set $base (i32.add (local.get $row) (i32.shl (local.get $dx) (i32.const 2))))
      ;; Boxes ending above this row stay behind for the rows after it (rows only go down within a call).
      (local.set $first (i32.add (i32.sub (local.get $py) (local.get $tall)) (i32.const 1)))
      (block $ahead (loop $skip
        (br_if $ahead (i32.ge_u (local.get $lo) (local.get $n)))
        (br_if $ahead (i32.ge_s (i32.load offset=4 (i32.add (local.get $boxes) (i32.shl (local.get $lo) (i32.const 4)))) (local.get $first)))
        (local.set $lo (i32.add (local.get $lo) (i32.const 1)))
        (br $skip)))
      ;; This row's mask, over the span its boxes cover.
      (local.set $x0 (local.get $width)) (local.set $x1 (i32.const 0))
      (local.set $i (local.get $lo))
      (block $marked (loop $boxesLoop
        (br_if $marked (i32.ge_u (local.get $i) (local.get $n)))
        (local.set $b (i32.add (local.get $boxes) (i32.shl (local.get $i) (i32.const 4))))
        (local.set $by (i32.load offset=4 (local.get $b)))
        (br_if $marked (i32.gt_s (local.get $by) (local.get $py)))
        (if (i32.gt_s (i32.add (local.get $by) (i32.load offset=12 (local.get $b))) (local.get $py)) (then
          (local.set $bx (i32.load (local.get $b))) (local.set $bw (i32.load offset=8 (local.get $b)))
          (if (i32.lt_s (local.get $x1) (local.get $x0)) (then
            ;; The first box of the row: the mask is clear over [x0, x1) only, so clear what this box widens it by.
            (local.set $x0 (local.get $bx)) (local.set $x1 (local.get $bx))))
          (if (i32.lt_s (local.get $bx) (local.get $x0)) (then
            (memory.fill (i32.add (local.get $mask) (local.get $bx)) (i32.const 0) (i32.sub (local.get $x0) (local.get $bx)))
            (local.set $x0 (local.get $bx))))
          (if (i32.gt_s (i32.add (local.get $bx) (local.get $bw)) (local.get $x1)) (then
            (memory.fill (i32.add (local.get $mask) (local.get $x1)) (i32.const 0) (i32.sub (i32.add (local.get $bx) (local.get $bw)) (local.get $x1)))
            (local.set $x1 (i32.add (local.get $bx) (local.get $bw)))))
          (memory.fill (i32.add (local.get $mask) (local.get $bx)) (i32.const 1) (local.get $bw))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $boxesLoop)))
      ;; Each run of placed samples in [x0, x1), filled from its neighbours.
      (local.set $x (local.get $x0))
      (block $filled (loop $runs
        (br_if $filled (i32.ge_s (local.get $x) (local.get $x1)))
        (if (i32.eqz (i32.load8_u (i32.add (local.get $mask) (local.get $x)))) (then
          (local.set $x (i32.add (local.get $x) (i32.const 1)))
          (br $runs)))
        (local.set $e (local.get $x))
        (block $end (loop $span
          (br_if $end (i32.ge_s (local.get $e) (local.get $x1)))
          (br_if $end (i32.eqz (i32.load8_u (i32.add (local.get $mask) (local.get $e)))))
          (local.set $e (i32.add (local.get $e) (i32.const 1)))
          (br $span)))
        ;; a: the sample left of the run, else the one right of it, else white; b: the one right of it, else a.
        (if (i32.lt_s (local.get $e) (local.get $width)) (then
          (local.set $at (i32.add (local.get $base) (i32.shl (local.get $e) (i32.const 2))))
          (local.set $b0 (f64.convert_i32_u (i32.load8_u (local.get $at))))
          (local.set $b1 (f64.convert_i32_u (i32.load8_u offset=1 (local.get $at))))
          (local.set $b2 (f64.convert_i32_u (i32.load8_u offset=2 (local.get $at))))))
        (if (i32.gt_s (local.get $x) (i32.const 0)) (then
          (local.set $at (i32.add (local.get $base) (i32.shl (i32.sub (local.get $x) (i32.const 1)) (i32.const 2))))
          (local.set $a0 (f64.convert_i32_u (i32.load8_u (local.get $at))))
          (local.set $a1 (f64.convert_i32_u (i32.load8_u offset=1 (local.get $at))))
          (local.set $a2 (f64.convert_i32_u (i32.load8_u offset=2 (local.get $at)))))
        (else (if (i32.lt_s (local.get $e) (local.get $width)) (then
          (local.set $a0 (local.get $b0)) (local.set $a1 (local.get $b1)) (local.set $a2 (local.get $b2)))
        (else
          (local.set $a0 (f64.const 255)) (local.set $a1 (f64.const 255)) (local.set $a2 (f64.const 255))))))
        (if (i32.ge_s (local.get $e) (local.get $width)) (then
          (local.set $b0 (local.get $a0)) (local.set $b1 (local.get $a1)) (local.set $b2 (local.get $a2))))
        (local.set $den (f64.convert_i32_s (i32.add (i32.sub (local.get $e) (local.get $x)) (i32.const 1))))
        (local.set $k (local.get $x))
        (loop $samples
          (local.set $t (f64.div (f64.convert_i32_s (i32.add (i32.sub (local.get $k) (local.get $x)) (i32.const 1))) (local.get $den)))
          (local.set $at (i32.add (local.get $base) (i32.shl (local.get $k) (i32.const 2))))
          (i32.store8 (local.get $at) (call $frameRound (f64.add (local.get $a0) (f64.mul (f64.sub (local.get $b0) (local.get $a0)) (local.get $t)))))
          (i32.store8 offset=1 (local.get $at) (call $frameRound (f64.add (local.get $a1) (f64.mul (f64.sub (local.get $b1) (local.get $a1)) (local.get $t)))))
          (i32.store8 offset=2 (local.get $at) (call $frameRound (f64.add (local.get $a2) (f64.mul (f64.sub (local.get $b2) (local.get $a2)) (local.get $t)))))
          (local.set $k (i32.add (local.get $k) (i32.const 1)))
          (br_if $samples (i32.lt_s (local.get $k) (local.get $e))))
        (local.set $x (local.get $e))
        (br $runs)))
      ;; The dx samples left of the picture: its first sample, after the fill.
      (local.set $c (i32.const 0))
      (block $padded (loop $pad
        (br_if $padded (i32.ge_u (local.get $c) (local.get $dx)))
        (i32.store (i32.add (local.get $row) (i32.shl (local.get $c) (i32.const 2))) (i32.load (local.get $base)))
        (local.set $c (i32.add (local.get $c) (i32.const 1)))
        (br $pad)))
      (local.set $r (i32.add (local.get $r) (i32.const 1)))
      (br $rows))))
)
