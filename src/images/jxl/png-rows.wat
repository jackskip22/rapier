;; MIT. A PNG row's filter undone and an 8-bit row widened to RGBA, in bulk; JavaScript only moves rows in and out.
;; pngUnfilter: n bytes at raw into row, over prev (the row above), bpp bytes a pixel; filter 0 to 4 (PNG 1.2, 6.6).
(func $pngUnfilter (export "pngUnfilter") (param $filter i32) (param $raw i32) (param $row i32) (param $prev i32) (param $n i32) (param $bpp i32)
  (local $i i32) (local $first i32) (local $a i32) (local $b i32) (local $c i32) (local $pa i32) (local $pb i32) (local $pc i32) (local $end i32)
  (local.set $first (select (local.get $bpp) (local.get $n) (i32.lt_u (local.get $bpp) (local.get $n))))
  (if (i32.eqz (local.get $filter)) (then (memory.copy (local.get $row) (local.get $raw) (local.get $n)) (return)))
  (if (i32.eq (local.get $filter) (i32.const 2)) (then
    ;; Up: sixteen bytes a step, then the rest.
    (local.set $end (i32.and (local.get $n) (i32.const -16)))
    (block $done (loop $wide
      (br_if $done (i32.ge_u (local.get $i) (local.get $end)))
      (v128.store (i32.add (local.get $row) (local.get $i)) (i8x16.add (v128.load (i32.add (local.get $raw) (local.get $i))) (v128.load (i32.add (local.get $prev) (local.get $i)))))
      (local.set $i (i32.add (local.get $i) (i32.const 16))) (br $wide)))
    (block $tail (loop $rest
      (br_if $tail (i32.ge_u (local.get $i) (local.get $n)))
      (i32.store8 (i32.add (local.get $row) (local.get $i)) (i32.add (i32.load8_u (i32.add (local.get $raw) (local.get $i))) (i32.load8_u (i32.add (local.get $prev) (local.get $i)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $rest)))
    (return)))
  ;; Sub, Average and Paeth: the first pixel has no left neighbour (a and c are 0).
  (block $lead (loop $start
    (br_if $lead (i32.ge_u (local.get $i) (local.get $first)))
    (local.set $b (i32.load8_u (i32.add (local.get $prev) (local.get $i))))
    (i32.store8 (i32.add (local.get $row) (local.get $i)) (i32.add (i32.load8_u (i32.add (local.get $raw) (local.get $i)))
      (select (i32.const 0) (select (i32.shr_u (local.get $b) (i32.const 1)) (local.get $b) (i32.eq (local.get $filter) (i32.const 3))) (i32.eq (local.get $filter) (i32.const 1)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $start)))
  (if (i32.eq (local.get $filter) (i32.const 1)) (then
    (block $done (loop $sub
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (i32.store8 (i32.add (local.get $row) (local.get $i)) (i32.add (i32.load8_u (i32.add (local.get $raw) (local.get $i))) (i32.load8_u (i32.sub (i32.add (local.get $row) (local.get $i)) (local.get $bpp)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $sub)))
    (return)))
  (if (i32.eq (local.get $filter) (i32.const 3)) (then
    (block $done (loop $average
      (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
      (i32.store8 (i32.add (local.get $row) (local.get $i)) (i32.add (i32.load8_u (i32.add (local.get $raw) (local.get $i)))
        (i32.shr_u (i32.add (i32.load8_u (i32.sub (i32.add (local.get $row) (local.get $i)) (local.get $bpp))) (i32.load8_u (i32.add (local.get $prev) (local.get $i)))) (i32.const 1))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $average)))
    (return)))
  (block $done (loop $paeth
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $a (i32.load8_u (i32.sub (i32.add (local.get $row) (local.get $i)) (local.get $bpp))))
    (local.set $b (i32.load8_u (i32.add (local.get $prev) (local.get $i))))
    (local.set $c (i32.load8_u (i32.sub (i32.add (local.get $prev) (local.get $i)) (local.get $bpp))))
    ;; |p - a| = |b - c|, |p - b| = |a - c|, |p - c| = |a + b - 2c| for p = a + b - c.
    (local.set $pa (i32.sub (local.get $b) (local.get $c))) (local.set $pa (select (local.get $pa) (i32.sub (i32.const 0) (local.get $pa)) (i32.ge_s (local.get $pa) (i32.const 0))))
    (local.set $pb (i32.sub (local.get $a) (local.get $c))) (local.set $pb (select (local.get $pb) (i32.sub (i32.const 0) (local.get $pb)) (i32.ge_s (local.get $pb) (i32.const 0))))
    (local.set $pc (i32.sub (i32.add (local.get $a) (local.get $b)) (i32.shl (local.get $c) (i32.const 1))))
    (local.set $pc (select (local.get $pc) (i32.sub (i32.const 0) (local.get $pc)) (i32.ge_s (local.get $pc) (i32.const 0))))
    (i32.store8 (i32.add (local.get $row) (local.get $i)) (i32.add (i32.load8_u (i32.add (local.get $raw) (local.get $i)))
      (select (local.get $a) (select (local.get $b) (local.get $c) (i32.le_u (local.get $pb) (local.get $pc)))
        (i32.and (i32.le_u (local.get $pa) (local.get $pb)) (i32.le_u (local.get $pa) (local.get $pc))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $paeth))))
;; pngWiden: w pixels of an 8-bit row of channels 1 (gray), 2 (gray, alpha) or 3 (RGB) at row into RGBA at out.
(func $pngWiden (export "pngWiden") (param $row i32) (param $w i32) (param $channels i32) (param $out i32)
  (local $x i32) (local $v i32) (local $end i32)
  (if (i32.eq (local.get $channels) (i32.const 3)) (then
    ;; Four pixels a step: twelve bytes shuffled to sixteen, alpha 255 put in; the last pixels one at a time.
    (local.set $end (select (i32.sub (local.get $w) (i32.const 5)) (i32.const 0) (i32.gt_s (local.get $w) (i32.const 5))))
    (block $done (loop $four
      (br_if $done (i32.ge_s (local.get $x) (local.get $end)))
      (v128.store (i32.add (local.get $out) (i32.shl (local.get $x) (i32.const 2)))
        (v128.or (i8x16.swizzle (v128.load (i32.add (local.get $row) (i32.mul (local.get $x) (i32.const 3))))
          (v128.const i8x16 0 1 2 128 3 4 5 128 6 7 8 128 9 10 11 128))
          (v128.const i8x16 0 0 0 255 0 0 0 255 0 0 0 255 0 0 0 255)))
      (local.set $x (i32.add (local.get $x) (i32.const 4))) (br $four)))))
  (block $done (loop $one
    (br_if $done (i32.ge_u (local.get $x) (local.get $w)))
    (if (i32.eq (local.get $channels) (i32.const 3)) (then
      (i32.store (i32.add (local.get $out) (i32.shl (local.get $x) (i32.const 2))) (i32.or (i32.const 0xff000000)
        (i32.or (i32.load8_u (i32.add (local.get $row) (i32.mul (local.get $x) (i32.const 3))))
          (i32.or (i32.shl (i32.load8_u offset=1 (i32.add (local.get $row) (i32.mul (local.get $x) (i32.const 3)))) (i32.const 8))
            (i32.shl (i32.load8_u offset=2 (i32.add (local.get $row) (i32.mul (local.get $x) (i32.const 3)))) (i32.const 16)))))))
    (else
      (local.set $v (i32.load8_u (i32.add (local.get $row) (i32.mul (local.get $x) (local.get $channels)))))
      (i32.store (i32.add (local.get $out) (i32.shl (local.get $x) (i32.const 2))) (i32.or (i32.mul (local.get $v) (i32.const 0x010101))
        (i32.shl (select (i32.load8_u offset=1 (i32.add (local.get $row) (i32.shl (local.get $x) (i32.const 1)))) (i32.const 255) (i32.eq (local.get $channels) (i32.const 2))) (i32.const 24))))))
    (local.set $x (i32.add (local.get $x) (i32.const 1))) (br $one))))
