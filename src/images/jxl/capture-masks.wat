;; SPDX-License-Identifier: MIT
;; screen-photo-mask.mjs's photoMasks, one rectangle's exact mask (maskExact): which pixels the base keeps, from the
;; rectangle's runs (capture-copies.wat's maskRuns), the antialiasing ring and the photo's blended straight edge.
;; build-jxl-kernels.mjs joins these functions to the capture module. Memory, all byte offsets; $far is capture-copies.wat's.

;; Whether every channel of `p` lies within AA (12) of the range of `a`'s and `b`'s.
(func $maskBetween (param $p i32) (param $a i32) (param $b i32) (result i32)
  (local $s i32) (local $v i32) (local $x i32) (local $y i32) (local $lo i32) (local $hi i32)
  (block $no (loop $ch
    (local.set $v (i32.and (i32.shr_u (local.get $p) (local.get $s)) (i32.const 255)))
    (local.set $x (i32.and (i32.shr_u (local.get $a) (local.get $s)) (i32.const 255)))
    (local.set $y (i32.and (i32.shr_u (local.get $b) (local.get $s)) (i32.const 255)))
    (local.set $lo (select (local.get $x) (local.get $y) (i32.lt_s (local.get $x) (local.get $y))))
    (local.set $hi (select (local.get $y) (local.get $x) (i32.lt_s (local.get $x) (local.get $y))))
    (if (i32.or (i32.lt_s (local.get $v) (i32.sub (local.get $lo) (i32.const 12))) (i32.gt_s (local.get $v) (i32.add (local.get $hi) (i32.const 12))))
      (then (return (i32.const 0))))
    (local.set $s (i32.add (local.get $s) (i32.const 8)))
    (br_if $ch (i32.lt_u (local.get $s) (i32.const 24)))))
  (i32.const 1))

;; Whether a neighbour `j` (-1: none) of a run in colour `c` keeps the run a glyph's: it is in the run (the same colour:
;; runs are whole 4-connected parts of one colour) or far from it.
(func $maskRim (param $px i32) (param $j i32) (param $c i32) (result i32)
  (local $v i32)
  (if (i32.lt_s (local.get $j) (i32.const 0)) (then (return (i32.const 1))))
  (local.set $v (i32.load (i32.add (local.get $px) (i32.shl (local.get $j) (i32.const 2)))))
  (if (i32.eq (local.get $v) (local.get $c)) (then (return (i32.const 1))))
  (call $far (local.get $c) (local.get $v)))

;; Whether a run's whole rim meets a hard edge (a text stroke sitting whole on a ground it is far from).
(func $maskGlyph (param $px i32) (param $w i32) (param $n i32) (param $pixels i32) (param $start i32) (param $size i32) (param $c i32) (result i32)
  (local $k i32) (local $end i32) (local $i i32) (local $x i32)
  (local.set $k (local.get $start))
  (local.set $end (i32.add (local.get $start) (local.get $size)))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $k) (local.get $end)))
    (local.set $i (i32.load (i32.add (local.get $pixels) (i32.shl (local.get $k) (i32.const 2)))))
    (local.set $x (i32.rem_u (local.get $i) (local.get $w)))
    (if (i32.eqz (call $maskRim (local.get $px) (select (i32.sub (local.get $i) (i32.const 1)) (i32.const -1) (i32.gt_u (local.get $x) (i32.const 0))) (local.get $c)))
      (then (return (i32.const 0))))
    (if (i32.eqz (call $maskRim (local.get $px) (select (i32.add (local.get $i) (i32.const 1)) (i32.const -1) (i32.lt_u (i32.add (local.get $x) (i32.const 1)) (local.get $w))) (local.get $c)))
      (then (return (i32.const 0))))
    (if (i32.eqz (call $maskRim (local.get $px) (select (i32.sub (local.get $i) (local.get $w)) (i32.const -1) (i32.ge_u (local.get $i) (local.get $w))) (local.get $c)))
      (then (return (i32.const 0))))
    (if (i32.eqz (call $maskRim (local.get $px) (select (i32.add (local.get $i) (local.get $w)) (i32.const -1) (i32.lt_u (i32.add (local.get $i) (local.get $w)) (local.get $n))) (local.get $c)))
      (then (return (i32.const 0))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $each)))
  (i32.const 1))

;; The ring's side bits of pixel `j` at (x, y): 1 an exact neighbour of a border run, 2 one of an inner run.
(func $maskSides (param $exact i32) (param $border i32) (param $w i32) (param $h i32) (param $x i32) (param $y i32) (result i32)
  (local $dx i32) (local $dy i32) (local $nx i32) (local $ny i32) (local $k i32) (local $sides i32)
  (local.set $dy (i32.const -1))
  (loop $rows
    (local.set $dx (i32.const -1))
    (loop $cols
      (local.set $nx (i32.add (local.get $x) (local.get $dx)))
      (local.set $ny (i32.add (local.get $y) (local.get $dy)))
      (if (i32.and (i32.or (local.get $dx) (local.get $dy))
            (i32.and (i32.lt_u (local.get $nx) (local.get $w)) (i32.lt_u (local.get $ny) (local.get $h))))
        (then
          (local.set $k (i32.add (i32.mul (local.get $ny) (local.get $w)) (local.get $nx)))
          (if (i32.eq (i32.load8_u (i32.add (local.get $exact) (local.get $k))) (i32.const 1))
            (then (local.set $sides (i32.or (local.get $sides)
              (select (i32.const 1) (i32.const 2) (i32.load8_u (i32.add (local.get $border) (local.get $k))))))))))
      (local.set $dx (i32.add (local.get $dx) (i32.const 1)))
      (br_if $cols (i32.le_s (local.get $dx) (i32.const 1))))
    (local.set $dy (i32.add (local.get $dy) (i32.const 1)))
    (br_if $rows (i32.le_s (local.get $dy) (i32.const 1))))
  (local.get $sides))

;; photoMasks' colour table at `table`: `cap` keys, then each key's pixels in the rectangles' runs (inside, 0: a free
;; slot), then how often the page outside them holds it (outside). The slot of colour `k`.
(func $colourSlot (param $table i32) (param $cap i32) (param $k i32) (result i32)
  (local $s i32) (local $inside i32)
  (local.set $inside (i32.add (local.get $table) (i32.shl (local.get $cap) (i32.const 2))))
  (local.set $s (i32.and (i32.shr_u (i32.mul (local.get $k) (i32.const 0x9e3779b1)) (i32.const 7)) (i32.sub (local.get $cap) (i32.const 1))))
  (block $found (loop $probe
    (br_if $found (i32.eqz (i32.load (i32.add (local.get $inside) (i32.shl (local.get $s) (i32.const 2))))))
    (br_if $found (i32.eq (i32.load (i32.add (local.get $table) (i32.shl (local.get $s) (i32.const 2)))) (local.get $k)))
    (local.set $s (i32.and (i32.add (local.get $s) (i32.const 1)) (i32.sub (local.get $cap) (i32.const 1))))
    (br $probe)))
  (local.get $s))
;; The table cleared and filled from `count` runs at `runs` ([start, size, colour] words): each colour's pixels.
(func (export "maskColours") (param $table i32) (param $cap i32) (param $runs i32) (param $count i32)
  (local $q i32) (local $at i32) (local $s i32) (local $p i32)
  (memory.fill (local.get $table) (i32.const 0) (i32.mul (local.get $cap) (i32.const 12)))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $q) (local.get $count)))
    (local.set $at (i32.add (local.get $runs) (i32.mul (local.get $q) (i32.const 12))))
    (local.set $s (call $colourSlot (local.get $table) (local.get $cap) (i32.load offset=8 (local.get $at))))
    (i32.store (i32.add (local.get $table) (i32.shl (local.get $s) (i32.const 2))) (i32.load offset=8 (local.get $at)))
    (local.set $p (i32.add (i32.add (local.get $table) (i32.shl (local.get $cap) (i32.const 2))) (i32.shl (local.get $s) (i32.const 2))))
    (i32.store (local.get $p) (i32.add (i32.load (local.get $p)) (i32.load offset=4 (local.get $at))))
    (local.set $q (i32.add (local.get $q) (i32.const 1)))
    (br $each)))
  )
;; The page outside the rectangles, one sample in four (even rows, even columns): `rows` even page rows from row `y0`,
;; each `width` words at `band`; `rects` the `nrects` rectangles [x, y, width, height], ordered by x. Each row's samples
;; are visited up to each rectangle it crosses, then from the even column at or after that rectangle's end.
(func (export "maskOutside") (param $table i32) (param $cap i32) (param $band i32) (param $width i32) (param $rows i32) (param $y0 i32)
  (param $rects i32) (param $nrects i32)
  (local $r i32) (local $y i32) (local $x i32) (local $q i32) (local $at i32) (local $end i32) (local $row i32) (local $s i32) (local $p i32)
  (local $inside i32) (local $outside i32)
  (local.set $inside (i32.add (local.get $table) (i32.shl (local.get $cap) (i32.const 2))))
  (local.set $outside (i32.add (local.get $table) (i32.shl (local.get $cap) (i32.const 3))))
  (block $r1 (loop $eachRow
    (br_if $r1 (i32.ge_u (local.get $r) (local.get $rows)))
    (local.set $y (i32.add (local.get $y0) (i32.shl (local.get $r) (i32.const 1))))
    (local.set $row (i32.add (local.get $band) (i32.shl (i32.mul (local.get $r) (local.get $width)) (i32.const 2))))
    (local.set $x (i32.const 0)) (local.set $q (i32.const 0))
    (block $q1 (loop $eachRect
      (local.set $end (local.get $width))
      (if (i32.lt_u (local.get $q) (local.get $nrects)) (then
        (local.set $at (i32.add (local.get $rects) (i32.shl (local.get $q) (i32.const 4))))
        (local.set $end (i32.const -1))
        (if (i32.and (i32.ge_s (local.get $y) (i32.load offset=4 (local.get $at))) (i32.lt_s (local.get $y) (i32.add (i32.load offset=4 (local.get $at)) (i32.load offset=12 (local.get $at)))))
          (then (local.set $end (select (local.get $width) (i32.load (local.get $at)) (i32.lt_s (local.get $width) (i32.load (local.get $at)))))))))
      (block $x1 (loop $xs
        (br_if $x1 (i32.ge_s (local.get $x) (local.get $end)))
        (local.set $s (call $colourSlot (local.get $table) (local.get $cap) (i32.load (i32.add (local.get $row) (i32.shl (local.get $x) (i32.const 2))))))
        (if (i32.load (i32.add (local.get $inside) (i32.shl (local.get $s) (i32.const 2)))) (then
          (local.set $p (i32.add (local.get $outside) (i32.shl (local.get $s) (i32.const 2))))
          (i32.store (local.get $p) (i32.add (i32.load (local.get $p)) (i32.const 1)))))
        (local.set $x (i32.add (local.get $x) (i32.const 2)))
        (br $xs)))
      (br_if $q1 (i32.ge_u (local.get $q) (local.get $nrects)))
      (if (i32.ge_s (local.get $end) (i32.const 0)) (then
        (local.set $end (i32.and (i32.add (i32.add (i32.load (local.get $at)) (i32.load offset=8 (local.get $at))) (i32.const 1)) (i32.const -2)))
        (local.set $x (select (local.get $x) (local.get $end) (i32.gt_s (local.get $x) (local.get $end))))))
      (local.set $q (i32.add (local.get $q) (i32.const 1)))
      (br $eachRect)))
    (local.set $r (i32.add (local.get $r) (i32.const 1)))
    (br $eachRow)))
  )

;; One rectangle's mask. `px`: its w x h pixel words; `pixels` and `runs` ([start, size, colour] words): maskRuns'
;; runs, `count` of them; `keep`: two words a run, how many pixels the rectangles' runs hold of its colour and 1 where
;; that colour alone keeps it exact (the caller's counts); `rects`: `nrects` caller rectangles clipped to this one,
;; [x0, y0, x1, y1] each; `transparent`: whether any pixel is not opaque. Writes `exact` (n bytes: 1 the base keeps it)
;; and, at `out`, [exact pixels listed (runs may repeat a transparent pixel), ring pixels, listed pixels in the fill
;; colour, the fill colour (-1: none)]; uses `border` and `only` (n bytes each). Answers the listed count; with none
;; listed, `exact` is all zero and the ring is not grown.
(func (export "maskExact") (param $px i32) (param $w i32) (param $h i32) (param $pixels i32) (param $runs i32) (param $count i32)
  (param $keep i32) (param $exact i32) (param $border i32) (param $only i32) (param $rects i32) (param $nrects i32) (param $transparent i32) (param $out i32)
  (param $table i32) (param $cap i32) (param $T i32)
  (result i32)
  (local $n i32) (local $i i32) (local $j i32) (local $k i32) (local $q i32) (local $x i32) (local $y i32) (local $c i32)
  (local $start i32) (local $end i32) (local $at i32) (local $list i32) (local $ring i32) (local $flat i32) (local $fill i32)
  (local $most i32) (local $inside i32) (local $touches i32) (local $bordered i32) (local $dx i32) (local $dy i32)
  (local $nx i32) (local $ny i32) (local $qx i32) (local $qy i32) (local $qi i32) (local $x0 i32) (local $y0 i32) (local $x1 i32)
  (local $y1 i32) (local $bit i32) (local $step i32) (local $row i32) (local $a i32) (local $e i32) (local $s i32)
  (local.set $n (i32.mul (local.get $w) (local.get $h)))
  (local.set $fill (i32.const -1))
  (memory.fill (local.get $exact) (i32.const 0) (local.get $n))
  ;; Each run's keep words from the colour table (maskColours): the rectangles' pixels of its colour, and 1 where that
  ;; count reaches T, or SOME (16) with the page outside holding it at least PAGE (1024) times (one sample in four).
  (block $k1 (loop $keeps
    (br_if $k1 (i32.ge_u (local.get $q) (local.get $count)))
    (local.set $s (call $colourSlot (local.get $table) (local.get $cap) (i32.load offset=8 (i32.add (local.get $runs) (i32.mul (local.get $q) (i32.const 12))))))
    (local.set $inside (i32.load (i32.add (i32.add (local.get $table) (i32.shl (local.get $cap) (i32.const 2))) (i32.shl (local.get $s) (i32.const 2)))))
    (local.set $at (i32.add (local.get $keep) (i32.shl (local.get $q) (i32.const 3))))
    (i32.store (local.get $at) (local.get $inside))
    (i32.store offset=4 (local.get $at) (i32.or (i32.ge_u (local.get $inside) (local.get $T))
      (i32.and (i32.ge_u (local.get $inside) (i32.const 16))
        (i32.ge_u (i32.shl (i32.load (i32.add (i32.add (local.get $table) (i32.shl (local.get $cap) (i32.const 3))) (i32.shl (local.get $s) (i32.const 2)))) (i32.const 2)) (i32.const 1024)))))
    (local.set $q (i32.add (local.get $q) (i32.const 1)))
    (br $keeps)))
  (local.set $q (i32.const 0))
  ;; Pixels that are not opaque.
  (if (local.get $transparent) (then
    (local.set $i (i32.const 0))
    (block $t1 (loop $t
      (br_if $t1 (i32.ge_u (local.get $i) (local.get $n)))
      (if (i32.ne (i32.load8_u offset=3 (i32.add (local.get $px) (i32.shl (local.get $i) (i32.const 2)))) (i32.const 255))
        (then (i32.store8 (i32.add (local.get $exact) (local.get $i)) (i32.const 1)) (local.set $list (i32.add (local.get $list) (i32.const 1)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $t)))))
  ;; The runs whose colour repeats or that are glyphs; `border` marks the pixels of those touching the edge.
  (block $r1 (loop $r
    (br_if $r1 (i32.ge_u (local.get $q) (local.get $count)))
    (local.set $at (i32.add (local.get $runs) (i32.mul (local.get $q) (i32.const 12))))
    (local.set $start (i32.load (local.get $at)))
    (local.set $end (i32.add (local.get $start) (i32.load offset=4 (local.get $at))))
    (local.set $c (i32.load offset=8 (local.get $at)))
    (local.set $inside (i32.load (i32.add (local.get $keep) (i32.shl (local.get $q) (i32.const 3)))))
    (block $skip
      (br_if $skip (i32.eqz (if (result i32) (i32.load offset=4 (i32.add (local.get $keep) (i32.shl (local.get $q) (i32.const 3))))
        (then (i32.const 1))
        (else (call $maskGlyph (local.get $px) (local.get $w) (local.get $n) (local.get $pixels) (local.get $start) (i32.sub (local.get $end) (local.get $start)) (local.get $c))))))
      ;; Kept: marked 2 in its keep word, for the fill count below.
      (i32.store offset=4 (i32.add (local.get $keep) (i32.shl (local.get $q) (i32.const 3))) (i32.const 2))
      (local.set $touches (i32.const 0))
      (local.set $k (local.get $start))
      (block $m1 (loop $m
        (br_if $m1 (i32.ge_u (local.get $k) (local.get $end)))
        (local.set $i (i32.load (i32.add (local.get $pixels) (i32.shl (local.get $k) (i32.const 2)))))
        (local.set $x (i32.rem_u (local.get $i) (local.get $w)))
        (i32.store8 (i32.add (local.get $exact) (local.get $i)) (i32.const 1))
        (local.set $touches (i32.or (local.get $touches) (i32.or
          (i32.or (i32.eqz (local.get $x)) (i32.eq (local.get $x) (i32.sub (local.get $w) (i32.const 1))))
          (i32.or (i32.lt_u (local.get $i) (local.get $w)) (i32.ge_u (local.get $i) (i32.sub (local.get $n) (local.get $w)))))))
        (local.set $k (i32.add (local.get $k) (i32.const 1)))
        (br $m)))
      (local.set $list (i32.add (local.get $list) (i32.sub (local.get $end) (local.get $start))))
      (if (local.get $touches) (then
        (if (i32.eqz (local.get $bordered)) (then (memory.fill (local.get $border) (i32.const 0) (local.get $n)) (local.set $bordered (i32.const 1))))
        (local.set $k (local.get $start))
        (block $b1 (loop $b
          (br_if $b1 (i32.ge_u (local.get $k) (local.get $end)))
          (i32.store8 (i32.add (local.get $border) (i32.load (i32.add (local.get $pixels) (i32.shl (local.get $k) (i32.const 2))))) (i32.const 1))
          (local.set $k (i32.add (local.get $k) (i32.const 1)))
          (br $b)))))
      (if (i32.gt_u (local.get $inside) (local.get $most)) (then (local.set $most (local.get $inside)) (local.set $fill (local.get $c)))))
    (local.set $q (i32.add (local.get $q) (i32.const 1)))
    (br $r)))
  ;; Listed pixels in the fill colour: the transparent ones, then the kept runs'.
  (if (local.get $transparent) (then
    (local.set $i (i32.const 0))
    (block $f1 (loop $f
      (br_if $f1 (i32.ge_u (local.get $i) (local.get $n)))
      (local.set $c (i32.load (i32.add (local.get $px) (i32.shl (local.get $i) (i32.const 2)))))
      (local.set $flat (i32.add (local.get $flat) (i32.and (i32.ne (i32.shr_u (local.get $c) (i32.const 24)) (i32.const 255)) (i32.eq (local.get $c) (local.get $fill)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $f)))))
  (local.set $q (i32.const 0))
  (block $g1 (loop $g
    (br_if $g1 (i32.ge_u (local.get $q) (local.get $count)))
    (local.set $at (i32.add (local.get $runs) (i32.mul (local.get $q) (i32.const 12))))
    (if (i32.and (i32.eq (i32.load offset=4 (i32.add (local.get $keep) (i32.shl (local.get $q) (i32.const 3)))) (i32.const 2))
          (i32.eq (i32.load offset=8 (local.get $at)) (local.get $fill)))
      (then (local.set $flat (i32.add (local.get $flat) (i32.load offset=4 (local.get $at))))))
    (local.set $q (i32.add (local.get $q) (i32.const 1)))
    (br $g)))
  ;; The caller's rectangles stay exact whole.
  (local.set $q (i32.const 0))
  (block $e1 (loop $eachRect
    (br_if $e1 (i32.ge_u (local.get $q) (local.get $nrects)))
    (local.set $at (i32.add (local.get $rects) (i32.shl (local.get $q) (i32.const 4))))
    (local.set $x0 (i32.load (local.get $at))) (local.set $y0 (i32.load offset=4 (local.get $at)))
    (local.set $x1 (i32.load offset=8 (local.get $at))) (local.set $y1 (i32.load offset=12 (local.get $at)))
    (local.set $y (local.get $y0))
    (block $y1b (loop $ys
      (br_if $y1b (i32.ge_s (local.get $y) (local.get $y1)))
      (local.set $i (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x0)))
      (local.set $end (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x1)))
      (block $x1b (loop $xs
        (br_if $x1b (i32.ge_s (local.get $i) (local.get $end)))
        (if (i32.eqz (i32.load8_u (i32.add (local.get $exact) (local.get $i)))) (then
          (i32.store8 (i32.add (local.get $exact) (local.get $i)) (i32.const 1))
          (local.set $list (i32.add (local.get $list) (i32.const 1)))
          (local.set $flat (i32.add (local.get $flat) (i32.eq (i32.load (i32.add (local.get $px) (i32.shl (local.get $i) (i32.const 2)))) (local.get $fill))))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $xs)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $ys)))
    (local.set $q (i32.add (local.get $q) (i32.const 1)))
    (br $eachRect)))
  (i32.store offset=8 (local.get $out) (local.get $flat))
  (i32.store offset=12 (local.get $out) (local.get $fill))
  (i32.store (local.get $out) (local.get $list))
  (i32.store offset=4 (local.get $out) (i32.const 0))
  (if (i32.eqz (local.get $list)) (then (return (i32.const 0))))
  ;; The antialiasing ring (2): a neighbour P of an exact pixel whose channels lie between that pixel's and the pixel Q
  ;; beyond P (or Q is missing or exact). Rings do not cascade: only 1s are sources.
  (local.set $i (i32.const 0)) (local.set $y (i32.const 0))
  (block $ring1 (loop $ringY
    (br_if $ring1 (i32.ge_u (local.get $y) (local.get $h)))
    (local.set $x (i32.const 0))
    (block $ringX1 (loop $ringX
      (br_if $ringX1 (i32.ge_u (local.get $x) (local.get $w)))
      (if (i32.eq (i32.load8_u (i32.add (local.get $exact) (local.get $i))) (i32.const 1)) (then
        (local.set $c (i32.load (i32.add (local.get $px) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $dy (i32.const -1))
        (loop $dys
          (local.set $dx (i32.const -1))
          (loop $dxs
            (local.set $nx (i32.add (local.get $x) (local.get $dx)))
            (local.set $ny (i32.add (local.get $y) (local.get $dy)))
            (block $next
              (br_if $next (i32.eqz (i32.or (local.get $dx) (local.get $dy))))
              (br_if $next (i32.ge_u (local.get $nx) (local.get $w)))
              (br_if $next (i32.ge_u (local.get $ny) (local.get $h)))
              (local.set $j (i32.add (i32.mul (local.get $ny) (local.get $w)) (local.get $nx)))
              (br_if $next (i32.load8_u (i32.add (local.get $exact) (local.get $j))))
              (local.set $qx (i32.add (local.get $nx) (local.get $dx)))
              (local.set $qy (i32.add (local.get $ny) (local.get $dy)))
              (local.set $qi (i32.const -1))
              (if (i32.and (i32.lt_u (local.get $qx) (local.get $w)) (i32.lt_u (local.get $qy) (local.get $h))) (then
                (local.set $qi (i32.add (i32.mul (local.get $qy) (local.get $w)) (local.get $qx)))
                (if (i32.eq (i32.load8_u (i32.add (local.get $exact) (local.get $qi))) (i32.const 1)) (then (local.set $qi (i32.const -1))))))
              (if (if (result i32) (i32.lt_s (local.get $qi) (i32.const 0)) (then (i32.const 1))
                    (else (call $maskBetween (i32.load (i32.add (local.get $px) (i32.shl (local.get $j) (i32.const 2)))) (local.get $c)
                      (i32.load (i32.add (local.get $px) (i32.shl (local.get $qi) (i32.const 2)))))))
                (then (i32.store8 (i32.add (local.get $exact) (local.get $j)) (i32.const 2)))))
            (local.set $dx (i32.add (local.get $dx) (i32.const 1)))
            (br_if $dxs (i32.le_s (local.get $dx) (i32.const 1))))
          (local.set $dy (i32.add (local.get $dy) (i32.const 1)))
          (br_if $dys (i32.le_s (local.get $dy) (i32.const 1))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $ringX)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ringY)))
  ;; A ring only border runs grow, along a straight row or column of at least STRAIGHT (24) pixels, is a placed photo's
  ;; blended edge and stays in the lossy frame (only's bit 4).
  (if (local.get $bordered) (then
    (memory.fill (local.get $only) (i32.const 0) (local.get $n))
    (local.set $i (i32.const 0)) (local.set $y (i32.const 0))
    (block $o1 (loop $oy
      (br_if $o1 (i32.ge_u (local.get $y) (local.get $h)))
      (local.set $x (i32.const 0))
      (block $ox1 (loop $ox
        (br_if $ox1 (i32.ge_u (local.get $x) (local.get $w)))
        (if (i32.eq (i32.load8_u (i32.add (local.get $exact) (local.get $i))) (i32.const 2))
          (then (if (i32.eq (call $maskSides (local.get $exact) (local.get $border) (local.get $w) (local.get $h) (local.get $x) (local.get $y)) (i32.const 1))
            (then (i32.store8 (i32.add (local.get $only) (local.get $i)) (i32.const 3))))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br $ox)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $oy)))
    ;; Each run of `only` along a row (bit 1, step 1) and down a column (bit 2, step w), measured once.
    (local.set $j (i32.const 0))
    (block $w1 (loop $walk
      (br_if $w1 (i32.ge_u (local.get $j) (local.get $n)))
      (local.set $bit (i32.const 1))
      (loop $bits
        (if (i32.and (i32.load8_u (i32.add (local.get $only) (local.get $j))) (local.get $bit)) (then
          (local.set $step (select (i32.const 1) (local.get $w) (i32.eq (local.get $bit) (i32.const 1))))
          (local.set $row (i32.sub (local.get $j) (i32.rem_u (local.get $j) (local.get $w))))
          (local.set $a (local.get $j))
          (block $back1 (loop $back
            (local.set $k (i32.sub (local.get $a) (local.get $step)))
            (br_if $back1 (i32.lt_s (local.get $k) (select (local.get $row) (i32.const 0) (i32.eq (local.get $bit) (i32.const 1)))))
            (br_if $back1 (i32.eqz (i32.and (i32.load8_u (i32.add (local.get $only) (local.get $k))) (local.get $bit))))
            (local.set $a (local.get $k))
            (br $back)))
          (local.set $e (i32.add (local.get $j) (local.get $step)))
          (block $fwd1 (loop $fwd
            (br_if $fwd1 (i32.ge_s (local.get $e) (select (i32.add (local.get $row) (local.get $w)) (local.get $n) (i32.eq (local.get $bit) (i32.const 1)))))
            (br_if $fwd1 (i32.eqz (i32.and (i32.load8_u (i32.add (local.get $only) (local.get $e))) (local.get $bit))))
            (local.set $e (i32.add (local.get $e) (local.get $step)))
            (br $fwd)))
          (local.set $s (i32.ge_s (i32.sub (local.get $e) (local.get $a)) (i32.mul (i32.const 24) (local.get $step))))
          (local.set $k (local.get $a))
          (block $c1 (loop $clear
            (br_if $c1 (i32.ge_s (local.get $k) (local.get $e)))
            (i32.store8 (i32.add (local.get $only) (local.get $k))
              (i32.or (i32.xor (i32.load8_u (i32.add (local.get $only) (local.get $k))) (local.get $bit)) (i32.shl (local.get $s) (i32.const 2))))
            (local.set $k (i32.add (local.get $k) (local.get $step)))
            (br $clear)))))
        (local.set $bit (i32.shl (local.get $bit) (i32.const 1)))
        (br_if $bits (i32.le_u (local.get $bit) (i32.const 2))))
      (local.set $j (i32.add (local.get $j) (i32.const 1)))
      (br $walk)))))
  ;; The ring joins the exact pixels, but for the straight blended edge.
  (local.set $i (i32.const 0))
  (block $z1 (loop $z
    (br_if $z1 (i32.ge_u (local.get $i) (local.get $n)))
    (if (i32.eq (i32.load8_u (i32.add (local.get $exact) (local.get $i))) (i32.const 2)) (then
      (if (i32.and (local.get $bordered) (i32.ne (i32.and (i32.load8_u (i32.add (local.get $only) (local.get $i))) (i32.const 4)) (i32.const 0)))
        (then (i32.store8 (i32.add (local.get $exact) (local.get $i)) (i32.const 0)))
        (else (i32.store8 (i32.add (local.get $exact) (local.get $i)) (i32.const 1)) (local.set $ring (i32.add (local.get $ring) (i32.const 1)))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $z)))
  (i32.store offset=4 (local.get $out) (local.get $ring))
  (local.get $list))

;; capture-patched.mjs's solidInk of one box, up to its kept samples (inkKeep). `rgba`: the box's w x h samples; `ground`:
;; groundCells' 32,768 cells (0: none). Uses `px` (n words), `table` (`cap` keys then `cap` counts then `cap` tallies, a
;; power of two at least twice the box's runs) and `row` (n bytes); writes `ofC` and `near` (n bytes each), `keep`
;; (n bytes) and, at `out`, [the text's colour, its count, strong]. Answers 0 where the box reads as no solid text.
;; Whether any colour channel of RGB words `a` and `b` differs by `t` or more.
(func $inkApart (param $a i32) (param $b i32) (param $t i32) (result i32)
  (local $d i32) (local $e i32) (local $f i32)
  (local.set $d (i32.sub (i32.shr_u (local.get $a) (i32.const 16)) (i32.shr_u (local.get $b) (i32.const 16))))
  (local.set $e (i32.sub (i32.and (i32.shr_u (local.get $a) (i32.const 8)) (i32.const 255)) (i32.and (i32.shr_u (local.get $b) (i32.const 8)) (i32.const 255))))
  (local.set $f (i32.sub (i32.and (local.get $a) (i32.const 255)) (i32.and (local.get $b) (i32.const 255))))
  (i32.or (i32.or
    (i32.ge_s (select (local.get $d) (i32.sub (i32.const 0) (local.get $d)) (i32.ge_s (local.get $d) (i32.const 0))) (local.get $t))
    (i32.ge_s (select (local.get $e) (i32.sub (i32.const 0) (local.get $e)) (i32.ge_s (local.get $e) (i32.const 0))) (local.get $t)))
    (i32.ge_s (select (local.get $f) (i32.sub (i32.const 0) (local.get $f)) (i32.ge_s (local.get $f) (i32.const 0))) (local.get $t))))
(func $inkCell (param $v i32) (result i32)
  (i32.or (i32.or (i32.and (i32.shr_s (local.get $v) (i32.const 9)) (i32.const 0x7c00)) (i32.and (i32.shr_s (local.get $v) (i32.const 6)) (i32.const 0x3e0)))
    (i32.and (i32.shr_s (local.get $v) (i32.const 3)) (i32.const 0x1f))))
;; The slot of key `v` in the table (its key, or -1 where free).
(func $inkSlot (param $table i32) (param $cap i32) (param $v i32) (result i32)
  (local $s i32) (local $k i32)
  (local.set $s (i32.and (i32.shr_u (i32.mul (local.get $v) (i32.const 0x9e3779b1)) (i32.const 7)) (i32.sub (local.get $cap) (i32.const 1))))
  (block $found (loop $probe
    (local.set $k (i32.load (i32.add (local.get $table) (i32.shl (local.get $s) (i32.const 2)))))
    (br_if $found (i32.or (i32.eq (local.get $k) (local.get $v)) (i32.eq (local.get $k) (i32.const -1))))
    (local.set $s (i32.and (i32.add (local.get $s) (i32.const 1)) (i32.sub (local.get $cap) (i32.const 1))))
    (br $probe)))
  (local.get $s))
;; A 0/1 mask grown by NEAR (2) both ways (a square 5 x 5 dilation): by rows into `row`, then by columns into `out`,
;; 16 samples at a time where the five shifted loads stay inside the row.
(func $inkGrow (param $mask i32) (param $row i32) (param $out i32) (param $w i32) (param $h i32)
  (local $x i32) (local $y i32) (local $o i32) (local $j i32) (local $lo i32) (local $hi i32) (local $v i32) (local $p i32) (local $acc v128)
  (block $r1 (loop $rows
    (br_if $r1 (i32.ge_s (local.get $y) (local.get $h)))
    (local.set $o (i32.mul (local.get $y) (local.get $w)))
    (local.set $x (i32.const 0))
    (block $x1 (loop $xs
      (br_if $x1 (i32.ge_s (local.get $x) (local.get $w)))
      (if (i32.and (i32.ge_s (local.get $x) (i32.const 2)) (i32.le_s (i32.add (local.get $x) (i32.const 18)) (local.get $w)))
        (then
          (local.set $p (i32.add (local.get $mask) (i32.add (local.get $o) (local.get $x))))
          (v128.store (i32.add (local.get $row) (i32.add (local.get $o) (local.get $x)))
            (v128.or (v128.or (v128.or (v128.load (i32.sub (local.get $p) (i32.const 2))) (v128.load (i32.sub (local.get $p) (i32.const 1))))
              (v128.or (v128.load (local.get $p)) (v128.load offset=1 (local.get $p)))) (v128.load offset=2 (local.get $p))))
          (local.set $x (i32.add (local.get $x) (i32.const 16))))
        (else
          (local.set $lo (select (i32.sub (local.get $x) (i32.const 2)) (i32.const 0) (i32.ge_s (local.get $x) (i32.const 2))))
          (local.set $hi (select (i32.add (local.get $x) (i32.const 2)) (i32.sub (local.get $w) (i32.const 1)) (i32.lt_s (i32.add (local.get $x) (i32.const 2)) (local.get $w))))
          (local.set $v (i32.const 0)) (local.set $j (local.get $lo))
          (block $j1 (loop $js
            (br_if $j1 (i32.gt_s (local.get $j) (local.get $hi)))
            (local.set $v (i32.or (local.get $v) (i32.load8_u (i32.add (local.get $mask) (i32.add (local.get $o) (local.get $j))))))
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $js)))
          (i32.store8 (i32.add (local.get $row) (i32.add (local.get $o) (local.get $x))) (local.get $v))
          (local.set $x (i32.add (local.get $x) (i32.const 1)))))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $rows)))
  (local.set $y (i32.const 0))
  (block $c1 (loop $cols
    (br_if $c1 (i32.ge_s (local.get $y) (local.get $h)))
    (local.set $o (i32.mul (local.get $y) (local.get $w)))
    (local.set $lo (select (i32.sub (local.get $y) (i32.const 2)) (i32.const 0) (i32.ge_s (local.get $y) (i32.const 2))))
    (local.set $hi (select (i32.add (local.get $y) (i32.const 2)) (i32.sub (local.get $h) (i32.const 1)) (i32.lt_s (i32.add (local.get $y) (i32.const 2)) (local.get $h))))
    (local.set $x (i32.const 0))
    (block $cx1 (loop $cxs
      (br_if $cx1 (i32.ge_s (local.get $x) (local.get $w)))
      (local.set $j (local.get $lo))
      (if (i32.le_s (i32.add (local.get $x) (i32.const 16)) (local.get $w))
        (then
          (local.set $acc (v128.const i32x4 0 0 0 0))
          (block $vj1 (loop $vjs
            (br_if $vj1 (i32.gt_s (local.get $j) (local.get $hi)))
            (local.set $acc (v128.or (local.get $acc) (v128.load (i32.add (local.get $row) (i32.add (i32.mul (local.get $j) (local.get $w)) (local.get $x))))))
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $vjs)))
          (v128.store (i32.add (local.get $out) (i32.add (local.get $o) (local.get $x))) (local.get $acc))
          (local.set $x (i32.add (local.get $x) (i32.const 16))))
        (else
          (local.set $v (i32.const 0))
          (block $sj1 (loop $sjs
            (br_if $sj1 (i32.gt_s (local.get $j) (local.get $hi)))
            (local.set $v (i32.or (local.get $v) (i32.load8_u (i32.add (local.get $row) (i32.add (i32.mul (local.get $j) (local.get $w)) (local.get $x))))))
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $sjs)))
          (i32.store8 (i32.add (local.get $out) (i32.add (local.get $o) (local.get $x))) (local.get $v))
          (local.set $x (i32.add (local.get $x) (i32.const 1)))))
      (br $cxs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $cols)))
  )
(func (export "inkKeep") (param $rgba i32) (param $w i32) (param $h i32) (param $ground i32) (param $px i32) (param $table i32) (param $cap i32)
  (param $row i32) (param $ofC i32) (param $near i32) (param $keep i32) (param $out i32) (result i32)
  (local $n i32) (local $k i32) (local $x i32) (local $y i32) (local $o i32) (local $e i32) (local $v i32) (local $g i32) (local $s i32)
  (local $c i32) (local $most i32) (local $strong i32) (local $count i32) (local $counts i32) (local $tallies i32) (local $p i32) (local $all i32)
  (local.set $n (i32.mul (local.get $w) (local.get $h)))
  (local.set $counts (i32.add (local.get $table) (i32.shl (local.get $cap) (i32.const 2))))
  (local.set $tallies (i32.add (local.get $counts) (i32.shl (local.get $cap) (i32.const 2))))
  ;; The samples as RGB words.
  (block $p1 (loop $pk
    (br_if $p1 (i32.ge_u (local.get $k) (local.get $n)))
    (local.set $p (i32.add (local.get $rgba) (i32.shl (local.get $k) (i32.const 2))))
    (local.set $v (i32.load (local.get $p)))
    (i32.store (i32.add (local.get $px) (i32.shl (local.get $k) (i32.const 2)))
      (i32.or (i32.or (i32.shl (i32.and (local.get $v) (i32.const 255)) (i32.const 16)) (i32.and (local.get $v) (i32.const 0xff00)))
        (i32.and (i32.shr_u (local.get $v) (i32.const 16)) (i32.const 255))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $pk)))
  (memory.fill (local.get $table) (i32.const 255) (i32.shl (local.get $cap) (i32.const 2)))
  (memory.fill (local.get $counts) (i32.const 0) (i32.shl (local.get $cap) (i32.const 2)))
  ;; Each run of equal samples in a row counts its pairs at once; the colour that first passes the most so far wins. On a
  ;; picture, runs of the ground's colours do not count; one of a STRONG (2) ring colour makes the box strong.
  (block $y1 (loop $ys
    (br_if $y1 (i32.ge_s (local.get $y) (local.get $h)))
    (local.set $o (i32.mul (local.get $y) (local.get $w)))
    (local.set $x (i32.const 0))
    (block $x1 (loop $xs
      (br_if $x1 (i32.ge_s (local.get $x) (local.get $w)))
      (local.set $v (i32.load (i32.add (local.get $px) (i32.shl (i32.add (local.get $o) (local.get $x)) (i32.const 2)))))
      (local.set $e (i32.add (local.get $x) (i32.const 1)))
      (block $e1 (loop $es
        (br_if $e1 (i32.ge_s (local.get $e) (local.get $w)))
        (br_if $e1 (i32.ne (i32.load (i32.add (local.get $px) (i32.shl (i32.add (local.get $o) (local.get $e)) (i32.const 2)))) (local.get $v)))
        (local.set $e (i32.add (local.get $e) (i32.const 1)))
        (br $es)))
      (if (i32.gt_s (i32.sub (local.get $e) (local.get $x)) (i32.const 1)) (then
        (local.set $g (if (result i32) (local.get $ground) (then (i32.load8_u (i32.add (local.get $ground) (call $inkCell (local.get $v))))) (else (i32.const 0))))
        (if (i32.and (local.get $g) (i32.const 2)) (then (local.set $strong (i32.const 1))))
        (local.set $s (call $inkSlot (local.get $table) (local.get $cap) (local.get $v)))
        (i32.store (i32.add (local.get $table) (i32.shl (local.get $s) (i32.const 2))) (local.get $v))
        (local.set $count (i32.add (i32.load (i32.add (local.get $counts) (i32.shl (local.get $s) (i32.const 2)))) (i32.sub (i32.sub (local.get $e) (local.get $x)) (i32.const 1))))
        (i32.store (i32.add (local.get $counts) (i32.shl (local.get $s) (i32.const 2))) (local.get $count))
        (if (i32.or (i32.eqz (local.get $g)) (i32.and (local.get $g) (i32.const 2))) (then
          (if (i32.gt_s (local.get $count) (local.get $most)) (then (local.set $most (local.get $count)) (local.set $c (local.get $v))))))))
      (local.set $x (local.get $e))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  (i32.store (local.get $out) (local.get $c))
  (i32.store offset=4 (local.get $out) (local.get $most))
  (if (if (result i32) (local.get $ground) (then (i32.eqz (local.get $most))) (else (i32.lt_s (i32.mul (local.get $most) (i32.const 50)) (local.get $n))))
    (then (return (i32.const 0))))
  ;; Strong, but the text's colour is none of the ring's: unambiguous where every ring colour (not strong) running as
  ;; often as the text fills half the box or more.
  (if (i32.and (local.get $strong) (i32.eqz (i32.load8_u (i32.add (local.get $ground) (call $inkCell (local.get $c)))))) (then
    (memory.fill (local.get $tallies) (i32.const 0) (i32.shl (local.get $cap) (i32.const 2)))
    (local.set $s (i32.const 0))
    (block $f1 (loop $flag
      (br_if $f1 (i32.ge_u (local.get $s) (local.get $cap)))
      (local.set $v (i32.load (i32.add (local.get $table) (i32.shl (local.get $s) (i32.const 2)))))
      (if (i32.ne (local.get $v) (i32.const -1)) (then
        (local.set $g (i32.load8_u (i32.add (local.get $ground) (call $inkCell (local.get $v)))))
        (if (i32.and (i32.ge_s (i32.load (i32.add (local.get $counts) (i32.shl (local.get $s) (i32.const 2)))) (local.get $most))
              (i32.and (i32.ne (local.get $g) (i32.const 0)) (i32.eqz (i32.and (local.get $g) (i32.const 2)))))
          (then (i32.store (i32.add (local.get $tallies) (i32.shl (local.get $s) (i32.const 2))) (i32.const 1))))))
      (local.set $s (i32.add (local.get $s) (i32.const 1)))
      (br $flag)))
    (local.set $k (i32.const 0))
    (block $t1 (loop $tally
      (br_if $t1 (i32.ge_u (local.get $k) (local.get $n)))
      (local.set $s (call $inkSlot (local.get $table) (local.get $cap) (i32.load (i32.add (local.get $px) (i32.shl (local.get $k) (i32.const 2))))))
      (local.set $p (i32.add (local.get $tallies) (i32.shl (local.get $s) (i32.const 2))))
      (if (i32.load (local.get $p)) (then (i32.store (local.get $p) (i32.add (i32.load (local.get $p)) (i32.const 1)))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (br $tally)))
    ;; Each rival's tally is one more than its samples.
    (local.set $all (i32.const 1)) (local.set $s (i32.const 0))
    (block $a1 (loop $every
      (br_if $a1 (i32.ge_u (local.get $s) (local.get $cap)))
      (local.set $count (i32.load (i32.add (local.get $tallies) (i32.shl (local.get $s) (i32.const 2)))))
      (if (i32.and (i32.ne (local.get $count) (i32.const 0)) (i32.lt_s (i32.shl (i32.sub (local.get $count) (i32.const 1)) (i32.const 1)) (local.get $n)))
        (then (local.set $all (i32.const 0))))
      (local.set $s (i32.add (local.get $s) (i32.const 1)))
      (br $every)))
    (if (local.get $all) (then (local.set $strong (i32.const 0))))))
  (i32.store offset=8 (local.get $out) (local.get $strong))
  (local.set $k (i32.const 0))
  (if (local.get $ground) (then
    ;; Kept: within NEAR of a sample like the text's, unlike the ring's, or of a strong cell in a strong box.
    (block $g1 (loop $gk
      (br_if $g1 (i32.ge_u (local.get $k) (local.get $n)))
      (local.set $v (i32.load (i32.add (local.get $px) (i32.shl (local.get $k) (i32.const 2)))))
      (local.set $g (i32.load8_u (i32.add (local.get $ground) (call $inkCell (local.get $v)))))
      (i32.store8 (i32.add (local.get $ofC) (local.get $k))
        (i32.or (i32.or (i32.eqz (call $inkApart (local.get $v) (local.get $c) (i32.const 96))) (i32.eqz (local.get $g)))
          (i32.and (local.get $strong) (i32.ne (i32.and (local.get $g) (i32.const 2)) (i32.const 0)))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (br $gk)))
    (call $inkGrow (local.get $ofC) (local.get $row) (local.get $keep) (local.get $w) (local.get $h))
    (return (i32.const 1))))
  ;; No picture: every sample standing out from the text's colour is within NEAR of it, and kept are those near it or
  ;; within NEAR of a STEP (32).
  (block $o1 (loop $ok
    (br_if $o1 (i32.ge_u (local.get $k) (local.get $n)))
    (i32.store8 (i32.add (local.get $ofC) (local.get $k)) (i32.eq (i32.load (i32.add (local.get $px) (i32.shl (local.get $k) (i32.const 2)))) (local.get $c)))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $ok)))
  (call $inkGrow (local.get $ofC) (local.get $row) (local.get $near) (local.get $w) (local.get $h))
  (local.set $k (i32.const 0))
  (block $n1 (loop $nk
    (br_if $n1 (i32.ge_u (local.get $k) (local.get $n)))
    (if (i32.eqz (i32.load8_u (i32.add (local.get $near) (local.get $k)))) (then
      (if (i32.eqz (call $inkApart (i32.load (i32.add (local.get $px) (i32.shl (local.get $k) (i32.const 2)))) (local.get $c) (i32.const 96)))
        (then (return (i32.const 0))))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $nk)))
  (memory.fill (local.get $ofC) (i32.const 0) (local.get $n))
  (local.set $k (i32.const 0)) (local.set $x (i32.const 0))
  (block $s1 (loop $sk
    (br_if $s1 (i32.ge_u (local.get $k) (local.get $n)))
    (local.set $v (i32.load (i32.add (local.get $px) (i32.shl (local.get $k) (i32.const 2)))))
    (if (i32.lt_s (i32.add (local.get $x) (i32.const 1)) (local.get $w)) (then
      (if (call $inkApart (local.get $v) (i32.load offset=4 (i32.add (local.get $px) (i32.shl (local.get $k) (i32.const 2)))) (i32.const 32)) (then
        (i32.store8 (i32.add (local.get $ofC) (local.get $k)) (i32.const 1)) (i32.store8 offset=1 (i32.add (local.get $ofC) (local.get $k)) (i32.const 1))))))
    (if (i32.lt_u (i32.add (local.get $k) (local.get $w)) (local.get $n)) (then
      (if (call $inkApart (local.get $v) (i32.load (i32.add (local.get $px) (i32.shl (i32.add (local.get $k) (local.get $w)) (i32.const 2)))) (i32.const 32)) (then
        (i32.store8 (i32.add (local.get $ofC) (local.get $k)) (i32.const 1)) (i32.store8 (i32.add (local.get $ofC) (i32.add (local.get $k) (local.get $w))) (i32.const 1))))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (local.set $x (i32.add (local.get $x) (i32.const 1)))
    (if (i32.eq (local.get $x) (local.get $w)) (then (local.set $x (i32.const 0))))
    (br $sk)))
  (call $inkGrow (local.get $ofC) (local.get $row) (local.get $keep) (local.get $w) (local.get $h))
  (local.set $k (i32.const 0))
  (block $u1 (loop $uk
    (br_if $u1 (i32.ge_u (local.get $k) (local.get $n)))
    (i32.store8 (i32.add (local.get $keep) (local.get $k)) (i32.or (i32.load8_u (i32.add (local.get $keep) (local.get $k))) (i32.load8_u (i32.add (local.get $near) (local.get $k)))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $uk)))
  (i32.const 1))

;; solidInk's picture test of a strong box (inkBits): over the box's samples (`rgba`, w x h) outside its parts (`nparts`
;; rectangles at `parts`, [x, y, w, h] in the box), each channel's clamped-gradient residual r: the sum of log2(1 + r)
;; from `logs` (256 doubles, the caller's), the samples visited and those off by more than FLAT (8), at `out` as
;; [bits (a double), visited, off]. `inPart`: n bytes.
(func (export "inkBits") (param $rgba i32) (param $w i32) (param $h i32) (param $inPart i32) (param $parts i32) (param $nparts i32)
  (param $logs i32) (param $out i32)
  (local $q i32) (local $at i32) (local $x i32) (local $y i32) (local $x1 i32) (local $y1 i32) (local $i i32) (local $ch i32)
  (local $v i32) (local $a i32) (local $b i32) (local $c i32) (local $lo i32) (local $hi i32) (local $p i32) (local $r i32)
  (local $bits f64) (local $visited i32) (local $off i32)
  (memory.fill (local.get $inPart) (i32.const 0) (i32.mul (local.get $w) (local.get $h)))
  (block $q1 (loop $eachPart
    (br_if $q1 (i32.ge_u (local.get $q) (local.get $nparts)))
    (local.set $at (i32.add (local.get $parts) (i32.shl (local.get $q) (i32.const 4))))
    (local.set $x (i32.load (local.get $at))) (local.set $y (i32.load offset=4 (local.get $at)))
    (local.set $x1 (i32.load offset=8 (local.get $at))) (local.set $y1 (i32.add (local.get $y) (i32.load offset=12 (local.get $at))))
    (block $r1 (loop $rows
      (br_if $r1 (i32.ge_s (local.get $y) (local.get $y1)))
      (memory.fill (i32.add (local.get $inPart) (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x))) (i32.const 1) (local.get $x1))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $rows)))
    (local.set $q (i32.add (local.get $q) (i32.const 1)))
    (br $eachPart)))
  (local.set $y (i32.const 1))
  (block $y2 (loop $ys
    (br_if $y2 (i32.ge_s (local.get $y) (local.get $h)))
    (local.set $x (i32.const 1))
    (block $x2 (loop $xs
      (br_if $x2 (i32.ge_s (local.get $x) (local.get $w)))
      (local.set $i (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x)))
      (if (i32.eqz (i32.load8_u (i32.add (local.get $inPart) (local.get $i)))) (then
        (local.set $visited (i32.add (local.get $visited) (i32.const 1)))
        (local.set $ch (i32.const 0))
        (loop $chs
          (local.set $p (i32.add (i32.add (local.get $rgba) (i32.shl (local.get $i) (i32.const 2))) (local.get $ch)))
          (local.set $v (i32.load8_u (local.get $p)))
          (local.set $a (i32.load8_u (i32.sub (local.get $p) (i32.const 4))))
          (local.set $b (i32.load8_u (i32.sub (local.get $p) (i32.shl (local.get $w) (i32.const 2)))))
          (local.set $c (i32.load8_u (i32.sub (i32.sub (local.get $p) (i32.shl (local.get $w) (i32.const 2))) (i32.const 4))))
          (local.set $lo (select (local.get $a) (local.get $b) (i32.lt_s (local.get $a) (local.get $b))))
          (local.set $hi (select (local.get $b) (local.get $a) (i32.lt_s (local.get $a) (local.get $b))))
          (local.set $r (i32.sub (i32.add (local.get $a) (local.get $b)) (local.get $c)))
          (local.set $r (select (local.get $lo) (local.get $r) (i32.lt_s (local.get $r) (local.get $lo))))
          (local.set $r (select (local.get $hi) (local.get $r) (i32.gt_s (local.get $r) (local.get $hi))))
          (local.set $r (i32.sub (local.get $v) (local.get $r)))
          (local.set $r (select (local.get $r) (i32.sub (i32.const 0) (local.get $r)) (i32.ge_s (local.get $r) (i32.const 0))))
          (local.set $bits (f64.add (local.get $bits) (f64.load (i32.add (local.get $logs) (i32.shl (local.get $r) (i32.const 3))))))
          (if (i32.gt_s (local.get $r) (i32.const 8)) (then (local.set $off (i32.add (local.get $off) (i32.const 1)))))
          (local.set $ch (i32.add (local.get $ch) (i32.const 1)))
          (br_if $chs (i32.lt_u (local.get $ch) (i32.const 3))))))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  (f64.store (local.get $out) (local.get $bits))
  (i32.store offset=8 (local.get $out) (local.get $visited))
  (i32.store offset=12 (local.get $out) (local.get $off)))

;; capture-patched.mjs's uniformRuns line kinds (lineKinds): `count` lines of `n` samples, sample `step` apart and lines
;; `stride` apart, from sample `p` of a box copied to `rgba` (4 bytes a sample) and `covered` (1 byte a sample). Each
;; line's kind at `out` (a word each): -2 every sample under marks, else its RGB colour where every sample has it, else -1.
(func (export "lineKinds") (param $rgba i32) (param $covered i32) (param $p i32) (param $n i32) (param $step i32) (param $count i32)
  (param $stride i32) (param $out i32)
  (local $l i32) (local $q i32) (local $k i32) (local $c i32) (local $one i32) (local $all i32)
  (block $l1 (loop $lines
    (br_if $l1 (i32.ge_u (local.get $l) (local.get $count)))
    (local.set $q (local.get $p))
    (local.set $c (i32.and (i32.load (i32.add (local.get $rgba) (i32.shl (local.get $q) (i32.const 2)))) (i32.const 0xffffff)))
    (local.set $one (i32.const 1)) (local.set $all (i32.const 1)) (local.set $k (i32.const 0))
    (block $k1 (loop $samples
      (br_if $k1 (i32.ge_u (local.get $k) (local.get $n)))
      (br_if $k1 (i32.eqz (i32.or (local.get $one) (local.get $all))))
      (if (local.get $one) (then
        (if (i32.ne (i32.and (i32.load (i32.add (local.get $rgba) (i32.shl (local.get $q) (i32.const 2)))) (i32.const 0xffffff)) (local.get $c))
          (then (local.set $one (i32.const 0))))))
      (if (local.get $all) (then
        (if (i32.eqz (i32.load8_u (i32.add (local.get $covered) (local.get $q)))) (then (local.set $all (i32.const 0))))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (local.set $q (i32.add (local.get $q) (local.get $step)))
      (br $samples)))
    ;; The colour as r << 16 | g << 8 | b from the little-endian word r | g << 8 | b << 16.
    (i32.store (i32.add (local.get $out) (i32.shl (local.get $l) (i32.const 2)))
      (if (result i32) (local.get $all) (then (i32.const -2))
        (else (if (result i32) (local.get $one)
          (then (i32.or (i32.or (i32.shl (i32.and (local.get $c) (i32.const 255)) (i32.const 16)) (i32.and (local.get $c) (i32.const 0xff00)))
            (i32.shr_u (local.get $c) (i32.const 16))))
          (else (i32.const -1))))))
    (local.set $p (i32.add (local.get $p) (local.get $stride)))
    (local.set $l (i32.add (local.get $l) (i32.const 1)))
    (br $lines)))
  )

;; capture-patched.mjs's protectedPageBoxes (protectedCompose, protectedBoxes). A region's mask `mask` (rw x rh bytes, 1
;; exact) placed at (rx, ry) on the page's exact bytes `exact` (`width` wide): with `join` 0, the page sample under each of
;; its photo samples becomes 0; with 1, under each of its exact samples a 0 becomes 1. Answers how many samples changed.
(func (export "protectedCompose") (param $exact i32) (param $width i32) (param $mask i32) (param $rx i32) (param $ry i32) (param $rw i32) (param $rh i32)
  (param $join i32) (result i32)
  (local $x i32) (local $y i32) (local $k i32) (local $p i32) (local $changed i32)
  (block $y1 (loop $ys
    (br_if $y1 (i32.ge_s (local.get $y) (local.get $rh)))
    (local.set $p (i32.add (local.get $exact) (i32.add (i32.mul (i32.add (local.get $ry) (local.get $y)) (local.get $width)) (local.get $rx))))
    (local.set $x (i32.const 0))
    (block $x1 (loop $xs
      (br_if $x1 (i32.ge_s (local.get $x) (local.get $rw)))
      (if (local.get $join)
        (then (if (i32.and (i32.ne (i32.load8_u (i32.add (local.get $mask) (local.get $k))) (i32.const 0)) (i32.eqz (i32.load8_u (local.get $p))))
          (then (i32.store8 (local.get $p) (i32.const 1)) (local.set $changed (i32.add (local.get $changed) (i32.const 1))))))
        (else (if (i32.eqz (i32.load8_u (i32.add (local.get $mask) (local.get $k))))
          (then (i32.store8 (local.get $p) (i32.const 0)) (local.set $changed (i32.add (local.get $changed) (i32.const 1)))))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (local.set $p (i32.add (local.get $p) (i32.const 1)))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  (local.get $changed))
;; The page's exact row runs joined down the page: a run with the same start and end as one in the row above grows that
;; run's box, else it starts a box. `boxes`: four words a box [x, y, w, h], in the order they start; `prev` and `cur`: a
;; row's runs, three words each [x, end, box] (width / 2 + 1 runs at most). Answers the boxes, or -1 past `limit`.
(func (export "protectedBoxes") (param $exact i32) (param $width i32) (param $height i32) (param $boxes i32) (param $limit i32)
  (param $prev i32) (param $cur i32) (result i32)
  (local $y i32) (local $x i32) (local $e i32) (local $row i32) (local $np i32) (local $nc i32) (local $j i32) (local $count i32)
  (local $box i32) (local $t i32) (local $at i32)
  (block $y1 (loop $ys
    (br_if $y1 (i32.ge_s (local.get $y) (local.get $height)))
    (local.set $row (i32.add (local.get $exact) (i32.mul (local.get $y) (local.get $width))))
    (local.set $x (i32.const 0)) (local.set $nc (i32.const 0)) (local.set $j (i32.const 0))
    (block $x1 (loop $xs
      (br_if $x1 (i32.ge_s (local.get $x) (local.get $width)))
      (if (i32.eqz (i32.load8_u (i32.add (local.get $row) (local.get $x)))) (then (local.set $x (i32.add (local.get $x) (i32.const 1))) (br $xs)))
      (local.set $e (i32.add (local.get $x) (i32.const 1)))
      (block $e1 (loop $es
        (br_if $e1 (i32.ge_s (local.get $e) (local.get $width)))
        (br_if $e1 (i32.eqz (i32.load8_u (i32.add (local.get $row) (local.get $e)))))
        (local.set $e (i32.add (local.get $e) (i32.const 1)))
        (br $es)))
      ;; The row above's run starting here, if it also ends here.
      (block $p1 (loop $ps
        (br_if $p1 (i32.ge_u (local.get $j) (local.get $np)))
        (br_if $p1 (i32.ge_s (i32.load (i32.add (local.get $prev) (i32.mul (local.get $j) (i32.const 12)))) (local.get $x)))
        (local.set $j (i32.add (local.get $j) (i32.const 1)))
        (br $ps)))
      (local.set $box (i32.const -1))
      (if (i32.lt_u (local.get $j) (local.get $np)) (then
        (local.set $at (i32.add (local.get $prev) (i32.mul (local.get $j) (i32.const 12))))
        (if (i32.and (i32.eq (i32.load (local.get $at)) (local.get $x)) (i32.eq (i32.load offset=4 (local.get $at)) (local.get $e)))
          (then (local.set $box (i32.load offset=8 (local.get $at)))))))
      (if (i32.lt_s (local.get $box) (i32.const 0)) (then
        (if (i32.eq (local.get $count) (local.get $limit)) (then (return (i32.const -1))))
        (local.set $box (local.get $count))
        (local.set $at (i32.add (local.get $boxes) (i32.shl (local.get $box) (i32.const 4))))
        (i32.store (local.get $at) (local.get $x)) (i32.store offset=4 (local.get $at) (local.get $y))
        (i32.store offset=8 (local.get $at) (i32.sub (local.get $e) (local.get $x))) (i32.store offset=12 (local.get $at) (i32.const 0))
        (local.set $count (i32.add (local.get $count) (i32.const 1)))))
      (local.set $at (i32.add (local.get $boxes) (i32.shl (local.get $box) (i32.const 4))))
      (i32.store offset=12 (local.get $at) (i32.add (i32.load offset=12 (local.get $at)) (i32.const 1)))
      (local.set $at (i32.add (local.get $cur) (i32.mul (local.get $nc) (i32.const 12))))
      (i32.store (local.get $at) (local.get $x)) (i32.store offset=4 (local.get $at) (local.get $e)) (i32.store offset=8 (local.get $at) (local.get $box))
      (local.set $nc (i32.add (local.get $nc) (i32.const 1)))
      (local.set $x (local.get $e))
      (br $xs)))
    (local.set $t (local.get $prev)) (local.set $prev (local.get $cur)) (local.set $cur (local.get $t))
    (local.set $np (local.get $nc))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  (local.get $count))

;; capture-patched.mjs's unboxed source marks (markStrokes): each mark's ground (ringGround) and a stroke's two edges
;; joined into one mark (strokes). The page's rows from `ybase` are at `band` (RGBA, `width` wide); the page is
;; `width` x `height`. Marks: six words each [x, y, w, h, ground, gone]. `table`: 8,192 slots of key, count and stamp,
;; then four words of state [stamp, ring, most, ground].
(func $markRGB (param $band i32) (param $width i32) (param $ybase i32) (param $u i32) (param $v i32) (result i32)
  (local $p i32)
  (local.set $p (i32.load (i32.add (local.get $band) (i32.shl (i32.add (i32.mul (i32.sub (local.get $v) (local.get $ybase)) (local.get $width)) (local.get $u)) (i32.const 2)))))
  (i32.or (i32.or (i32.shl (i32.and (local.get $p) (i32.const 255)) (i32.const 16)) (i32.and (local.get $p) (i32.const 0xff00)))
    (i32.and (i32.shr_u (local.get $p) (i32.const 16)) (i32.const 255))))
;; One ring sample at (u, v), where it is on the page: its colour's count up; the commonest so far kept (the first to
;; reach each count).
(func $ringOne (param $band i32) (param $width i32) (param $height i32) (param $ybase i32) (param $table i32) (param $u i32) (param $v i32)
  (local $k i32) (local $s i32) (local $st i32) (local $n i32) (local $gen i32)
  (if (i32.or (i32.ge_u (local.get $u) (local.get $width)) (i32.ge_u (local.get $v) (local.get $height))) (then (return)))
  (local.set $st (i32.add (local.get $table) (i32.const 98304)))
  (local.set $gen (i32.load (local.get $st)))
  (local.set $k (call $markRGB (local.get $band) (local.get $width) (local.get $ybase) (local.get $u) (local.get $v)))
  (local.set $s (i32.and (i32.shr_u (i32.mul (local.get $k) (i32.const 0x9e3779b1)) (i32.const 19)) (i32.const 8191)))
  (block $found (loop $probe
    (br_if $found (i32.ne (i32.load (i32.add (local.get $table) (i32.add (i32.const 65536) (i32.shl (local.get $s) (i32.const 2))))) (local.get $gen)))
    (br_if $found (i32.eq (i32.load (i32.add (local.get $table) (i32.shl (local.get $s) (i32.const 2)))) (local.get $k)))
    (local.set $s (i32.and (i32.add (local.get $s) (i32.const 1)) (i32.const 8191)))
    (br $probe)))
  (if (i32.ne (i32.load (i32.add (local.get $table) (i32.add (i32.const 65536) (i32.shl (local.get $s) (i32.const 2))))) (local.get $gen)) (then
    (i32.store (i32.add (local.get $table) (i32.add (i32.const 65536) (i32.shl (local.get $s) (i32.const 2)))) (local.get $gen))
    (i32.store (i32.add (local.get $table) (i32.shl (local.get $s) (i32.const 2))) (local.get $k))
    (i32.store (i32.add (local.get $table) (i32.add (i32.const 32768) (i32.shl (local.get $s) (i32.const 2)))) (i32.const 0))))
  (local.set $n (i32.add (i32.load (i32.add (local.get $table) (i32.add (i32.const 32768) (i32.shl (local.get $s) (i32.const 2))))) (i32.const 1)))
  (i32.store (i32.add (local.get $table) (i32.add (i32.const 32768) (i32.shl (local.get $s) (i32.const 2)))) (local.get $n))
  (i32.store offset=4 (local.get $st) (i32.add (i32.load offset=4 (local.get $st)) (i32.const 1)))
  (if (i32.gt_s (local.get $n) (i32.load offset=8 (local.get $st))) (then
    (i32.store offset=8 (local.get $st) (local.get $n)) (i32.store offset=12 (local.get $st) (local.get $k)))))
;; The colour of half or more of the ring around box (x, y, w, h), or -1.
(func $ringGround (param $band i32) (param $width i32) (param $height i32) (param $ybase i32) (param $table i32)
  (param $x i32) (param $y i32) (param $w i32) (param $h i32) (result i32)
  (local $u i32) (local $v i32) (local $st i32) (local $gen i32)
  (local.set $st (i32.add (local.get $table) (i32.const 98304)))
  (local.set $gen (i32.add (i32.load (local.get $st)) (i32.const 1)))
  ;; Stamps start at zero: a new table's first stamp is 1, and a wrapped one clears them.
  (if (i32.eqz (local.get $gen)) (then (memory.fill (i32.add (local.get $table) (i32.const 65536)) (i32.const 0) (i32.const 32768)) (local.set $gen (i32.const 1))))
  (i32.store (local.get $st) (local.get $gen))
  (i32.store offset=4 (local.get $st) (i32.const 0)) (i32.store offset=8 (local.get $st) (i32.const 0)) (i32.store offset=12 (local.get $st) (i32.const -1))
  (local.set $u (i32.sub (local.get $x) (i32.const 1)))
  (block $u1 (loop $us
    (br_if $u1 (i32.gt_s (local.get $u) (i32.add (local.get $x) (local.get $w))))
    (call $ringOne (local.get $band) (local.get $width) (local.get $height) (local.get $ybase) (local.get $table) (local.get $u) (i32.sub (local.get $y) (i32.const 1)))
    (call $ringOne (local.get $band) (local.get $width) (local.get $height) (local.get $ybase) (local.get $table) (local.get $u) (i32.add (local.get $y) (local.get $h)))
    (local.set $u (i32.add (local.get $u) (i32.const 1)))
    (br $us)))
  (local.set $v (local.get $y))
  (block $v1 (loop $vs
    (br_if $v1 (i32.ge_s (local.get $v) (i32.add (local.get $y) (local.get $h))))
    (call $ringOne (local.get $band) (local.get $width) (local.get $height) (local.get $ybase) (local.get $table) (i32.sub (local.get $x) (i32.const 1)) (local.get $v))
    (call $ringOne (local.get $band) (local.get $width) (local.get $height) (local.get $ybase) (local.get $table) (i32.add (local.get $x) (local.get $w)) (local.get $v))
    (local.set $v (i32.add (local.get $v) (i32.const 1)))
    (br $vs)))
  (if (result i32) (i32.and (i32.ne (i32.load offset=4 (local.get $st)) (i32.const 0))
        (i32.ge_s (i32.shl (i32.load offset=8 (local.get $st)) (i32.const 1)) (i32.load offset=4 (local.get $st))))
    (then (i32.load offset=12 (local.get $st))) (else (i32.const -1))))
(func $absI (param $v i32) (result i32) (select (local.get $v) (i32.sub (i32.const 0) (local.get $v)) (i32.ge_s (local.get $v) (i32.const 0))))
;; Marks a and b (pointers) as one stroke along rows (or columns): the joined box and its ground written over a, 1; or 0.
(func $markStroke (param $band i32) (param $width i32) (param $height i32) (param $ybase i32) (param $table i32) (param $a i32) (param $b i32) (param $rows i32) (result i32)
  (local $ax i32) (local $ay i32) (local $aw i32) (local $ah i32) (local $bx i32) (local $by i32) (local $bw i32) (local $bh i32)
  (local $p i32) (local $q i32) (local $s0 i32) (local $s1 i32) (local $la i32) (local $lb i32) (local $a0 i32) (local $a1 i32) (local $b0 i32) (local $b1 i32)
  (local $x i32) (local $y i32) (local $w i32) (local $h i32) (local $ground i32) (local $t i32) (local $r i32) (local $sample i32)
  (local.set $ax (i32.load (local.get $a))) (local.set $ay (i32.load offset=4 (local.get $a))) (local.set $aw (i32.load offset=8 (local.get $a))) (local.set $ah (i32.load offset=12 (local.get $a)))
  (local.set $bx (i32.load (local.get $b))) (local.set $by (i32.load offset=4 (local.get $b))) (local.set $bw (i32.load offset=8 (local.get $b))) (local.set $bh (i32.load offset=12 (local.get $b)))
  (if (local.get $rows)
    (then
      (local.set $p (i32.add (local.get $ax) (local.get $aw))) (local.set $q (local.get $bx))
      (local.set $s0 (select (local.get $ay) (local.get $by) (i32.gt_s (local.get $ay) (local.get $by))))
      (local.set $s1 (select (i32.add (local.get $ay) (local.get $ah)) (i32.add (local.get $by) (local.get $bh)) (i32.lt_s (i32.add (local.get $ay) (local.get $ah)) (i32.add (local.get $by) (local.get $bh)))))
      (local.set $la (local.get $aw)) (local.set $lb (local.get $bw))
      (local.set $a0 (local.get $ay)) (local.set $a1 (i32.add (local.get $ay) (local.get $ah))) (local.set $b0 (local.get $by)) (local.set $b1 (i32.add (local.get $by) (local.get $bh))))
    (else
      (local.set $p (i32.add (local.get $ay) (local.get $ah))) (local.set $q (local.get $by))
      (local.set $s0 (select (local.get $ax) (local.get $bx) (i32.gt_s (local.get $ax) (local.get $bx))))
      (local.set $s1 (select (i32.add (local.get $ax) (local.get $aw)) (i32.add (local.get $bx) (local.get $bw)) (i32.lt_s (i32.add (local.get $ax) (local.get $aw)) (i32.add (local.get $bx) (local.get $bw)))))
      (local.set $la (local.get $ah)) (local.set $lb (local.get $bh))
      (local.set $a0 (local.get $ax)) (local.set $a1 (i32.add (local.get $ax) (local.get $aw))) (local.set $b0 (local.get $bx)) (local.set $b1 (i32.add (local.get $bx) (local.get $bw)))))
  (if (i32.or (i32.or (i32.le_s (local.get $q) (local.get $p)) (i32.gt_s (i32.sub (local.get $q) (local.get $p)) (i32.const 16))) (i32.le_s (local.get $s1) (local.get $s0)))
    (then (return (i32.const 0))))
  (if (i32.gt_s (select (local.get $la) (local.get $lb) (i32.lt_s (local.get $la) (local.get $lb))) (i32.const 3)) (then (return (i32.const 0))))
  (if (i32.or (i32.gt_s (call $absI (i32.sub (local.get $a0) (local.get $b0))) (i32.const 2)) (i32.gt_s (call $absI (i32.sub (local.get $a1) (local.get $b1))) (i32.const 2)))
    (then (return (i32.const 0))))
  (local.set $x (select (local.get $ax) (local.get $bx) (i32.lt_s (local.get $ax) (local.get $bx))))
  (local.set $y (select (local.get $ay) (local.get $by) (i32.lt_s (local.get $ay) (local.get $by))))
  (local.set $w (i32.sub (select (i32.add (local.get $ax) (local.get $aw)) (i32.add (local.get $bx) (local.get $bw)) (i32.gt_s (i32.add (local.get $ax) (local.get $aw)) (i32.add (local.get $bx) (local.get $bw)))) (local.get $x)))
  (local.set $h (i32.sub (select (i32.add (local.get $ay) (local.get $ah)) (i32.add (local.get $by) (local.get $bh)) (i32.gt_s (i32.add (local.get $ay) (local.get $ah)) (i32.add (local.get $by) (local.get $bh)))) (local.get $y)))
  (if (i32.or (i32.gt_s (local.get $w) (i32.const 128)) (i32.gt_s (local.get $h) (i32.const 128))) (then (return (i32.const 0))))
  (local.set $ground (call $ringGround (local.get $band) (local.get $width) (local.get $height) (local.get $ybase) (local.get $table) (local.get $x) (local.get $y) (local.get $w) (local.get $h)))
  (if (i32.lt_s (local.get $ground) (i32.const 0)) (then (return (i32.const 0))))
  (local.set $t (local.get $p))
  (block $t1 (loop $ts
    (br_if $t1 (i32.ge_s (local.get $t) (local.get $q)))
    (local.set $r (local.get $s0))
    (block $r1 (loop $rs
      (br_if $r1 (i32.ge_s (local.get $r) (local.get $s1)))
      (local.set $sample (if (result i32) (local.get $rows)
        (then (call $markRGB (local.get $band) (local.get $width) (local.get $ybase) (local.get $t) (local.get $r)))
        (else (call $markRGB (local.get $band) (local.get $width) (local.get $ybase) (local.get $r) (local.get $t)))))
      (if (i32.eq (local.get $sample) (local.get $ground)) (then (return (i32.const 0))))
      (local.set $r (i32.add (local.get $r) (i32.const 1)))
      (br $rs)))
    (local.set $t (i32.add (local.get $t) (i32.const 1)))
    (br $ts)))
  (i32.store (local.get $a) (local.get $x)) (i32.store offset=4 (local.get $a) (local.get $y))
  (i32.store offset=8 (local.get $a) (local.get $w)) (i32.store offset=12 (local.get $a) (local.get $h)) (i32.store offset=16 (local.get $a) (local.get $ground))
  (i32.const 1))
;; The `n` mark indices at `list` sorted stably by x (rows) or y, through `tmp`.
(func $markSort (param $marks i32) (param $list i32) (param $tmp i32) (param $n i32) (param $key i32)
  (local $width i32) (local $lo i32) (local $mid i32) (local $hi i32) (local $i i32) (local $j i32) (local $k i32) (local $t i32)
  (local $from i32) (local $to i32) (local $vi i32) (local $vj i32)
  (local.set $from (local.get $list)) (local.set $to (local.get $tmp)) (local.set $width (i32.const 1))
  (block $w1 (loop $widths
    (br_if $w1 (i32.ge_u (local.get $width) (local.get $n)))
    (local.set $lo (i32.const 0))
    (block $l1 (loop $runs
      (br_if $l1 (i32.ge_u (local.get $lo) (local.get $n)))
      (local.set $mid (select (i32.add (local.get $lo) (local.get $width)) (local.get $n) (i32.lt_u (i32.add (local.get $lo) (local.get $width)) (local.get $n))))
      (local.set $hi (select (i32.add (local.get $mid) (local.get $width)) (local.get $n) (i32.lt_u (i32.add (local.get $mid) (local.get $width)) (local.get $n))))
      (local.set $i (local.get $lo)) (local.set $j (local.get $mid)) (local.set $k (local.get $lo))
      (block $m1 (loop $merge
        (br_if $m1 (i32.ge_u (local.get $k) (local.get $hi)))
        (if (i32.lt_u (local.get $j) (local.get $hi)) (then
          (local.set $vj (i32.load (i32.add (local.get $from) (i32.shl (local.get $j) (i32.const 2)))))))
        (if (i32.lt_u (local.get $i) (local.get $mid)) (then
          (local.set $vi (i32.load (i32.add (local.get $from) (i32.shl (local.get $i) (i32.const 2)))))))
        (if (i32.and (i32.lt_u (local.get $i) (local.get $mid))
              (i32.or (i32.ge_u (local.get $j) (local.get $hi))
                (i32.le_s (i32.load (i32.add (i32.add (local.get $marks) (i32.mul (local.get $vi) (i32.const 24))) (local.get $key)))
                  (i32.load (i32.add (i32.add (local.get $marks) (i32.mul (local.get $vj) (i32.const 24))) (local.get $key))))))
          (then (i32.store (i32.add (local.get $to) (i32.shl (local.get $k) (i32.const 2))) (local.get $vi)) (local.set $i (i32.add (local.get $i) (i32.const 1))))
          (else (i32.store (i32.add (local.get $to) (i32.shl (local.get $k) (i32.const 2))) (local.get $vj)) (local.set $j (i32.add (local.get $j) (i32.const 1)))))
        (local.set $k (i32.add (local.get $k) (i32.const 1)))
        (br $merge)))
      (local.set $lo (local.get $hi))
      (br $runs)))
    (local.set $t (local.get $from)) (local.set $from (local.get $to)) (local.set $to (local.get $t))
    (local.set $width (i32.shl (local.get $width) (i32.const 1)))
    (br $widths)))
  (if (i32.ne (local.get $from) (local.get $list)) (then (memory.copy (local.get $list) (local.get $from) (i32.shl (local.get $n) (i32.const 2))))))
;; Each of `count` marks' ground, then the strokes joined until none joins: answers how many marks are left, their
;; indices at `list` in their last order. `tmp`: count words.
(func (export "markStrokes") (param $band i32) (param $width i32) (param $height i32) (param $ybase i32) (param $marks i32) (param $count i32)
  (param $list i32) (param $tmp i32) (param $table i32) (result i32)
  (local $i i32) (local $j i32) (local $n i32) (local $kept i32) (local $a i32) (local $b i32) (local $rows i32) (local $joined i32) (local $key i32) (local $reach i32)
  (memory.fill (i32.add (local.get $table) (i32.const 65536)) (i32.const 0) (i32.const 32784))
  (block $g1 (loop $grounds
    (br_if $g1 (i32.ge_u (local.get $i) (local.get $count)))
    (local.set $a (i32.add (local.get $marks) (i32.mul (local.get $i) (i32.const 24))))
    (i32.store offset=16 (local.get $a) (call $ringGround (local.get $band) (local.get $width) (local.get $height) (local.get $ybase) (local.get $table)
      (i32.load (local.get $a)) (i32.load offset=4 (local.get $a)) (i32.load offset=8 (local.get $a)) (i32.load offset=12 (local.get $a))))
    (i32.store offset=20 (local.get $a) (i32.const 0))
    (i32.store (i32.add (local.get $list) (i32.shl (local.get $i) (i32.const 2))) (local.get $i))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $grounds)))
  (local.set $n (local.get $count))
  (local.set $joined (i32.const 1))
  (block $done (loop $passes
    (br_if $done (i32.eqz (local.get $joined)))
    (local.set $joined (i32.const 0))
    (local.set $rows (i32.const 1))
    (loop $axes
      ;; Key: x (offset 0) along rows, y (offset 4) down columns; the reach adds w (offset 8) or h (offset 12).
      (local.set $key (select (i32.const 0) (i32.const 4) (local.get $rows)))
      (call $markSort (local.get $marks) (local.get $list) (local.get $tmp) (local.get $n) (local.get $key))
      (local.set $kept (i32.const 0)) (local.set $i (i32.const 0))
      (block $i1 (loop $is
        (br_if $i1 (i32.ge_u (local.get $i) (local.get $n)))
        (local.set $a (i32.add (local.get $marks) (i32.mul (i32.load (i32.add (local.get $list) (i32.shl (local.get $i) (i32.const 2)))) (i32.const 24))))
        (if (i32.eqz (i32.load offset=20 (local.get $a))) (then
          (local.set $j (i32.add (local.get $i) (i32.const 1)))
          (block $j1 (loop $js
            (br_if $j1 (i32.ge_u (local.get $j) (local.get $n)))
            (local.set $b (i32.add (local.get $marks) (i32.mul (i32.load (i32.add (local.get $list) (i32.shl (local.get $j) (i32.const 2)))) (i32.const 24))))
            (local.set $reach (i32.add (i32.add (i32.load (i32.add (local.get $a) (local.get $key))) (i32.load (i32.add (local.get $a) (i32.add (local.get $key) (i32.const 8))))) (i32.const 16)))
            (br_if $j1 (i32.gt_s (i32.load (i32.add (local.get $b) (local.get $key))) (local.get $reach)))
            (if (i32.eqz (i32.load offset=20 (local.get $b))) (then
              (if (call $markStroke (local.get $band) (local.get $width) (local.get $height) (local.get $ybase) (local.get $table) (local.get $a) (local.get $b) (local.get $rows))
                (then (i32.store offset=20 (local.get $b) (i32.const 1)) (local.set $joined (i32.const 1))))))
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $js)))
          (i32.store (i32.add (local.get $tmp) (i32.shl (local.get $kept) (i32.const 2))) (i32.load (i32.add (local.get $list) (i32.shl (local.get $i) (i32.const 2)))))
          (local.set $kept (i32.add (local.get $kept) (i32.const 1)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $is)))
      (memory.copy (local.get $list) (local.get $tmp) (i32.shl (local.get $kept) (i32.const 2)))
      (local.set $n (local.get $kept))
      (local.set $rows (i32.sub (local.get $rows) (i32.const 1)))
      (br_if $axes (i32.eqz (local.get $rows))))
    (br $passes)))
  (local.get $n))

;; screen-photo-mask.mjs's maskComponents (componentRows, componentBoxes): the boxes of a 0/1 mask's 8-connected parts.
;; Each row's runs [start, end, row, parent] (four words each at `runs`, `count` so far) join the runs of the row above
;; that touch them (from `above` to the first of this band's runs); the lower root takes the higher. `state`: [count,
;; above, aboveEnd]. A band of `rows` mask rows from row `y0` (w bytes each) at `mask`. Answers -1 once `limit` runs are spent.

(func $componentRows (param $mask i32) (param $w i32) (param $rows i32) (param $y0 i32) (param $runs i32) (param $limit i32) (param $state i32) (result i32)
  (local $count i32) (local $above i32) (local $aboveEnd i32) (local $y i32) (local $x i32) (local $s i32) (local $row i32) (local $first i32)
  (local $k i32) (local $j i32) (local $a i32) (local $b i32)
  (local.set $count (i32.load (local.get $state))) (local.set $above (i32.load offset=4 (local.get $state))) (local.set $aboveEnd (i32.load offset=8 (local.get $state)))
  (block $y1 (loop $ys
    (br_if $y1 (i32.ge_s (local.get $y) (local.get $rows)))
    (local.set $row (i32.add (local.get $mask) (i32.mul (local.get $y) (local.get $w))))
    (local.set $first (local.get $count)) (local.set $x (i32.const 0))
    (block $x1 (loop $xs
      (br_if $x1 (i32.ge_s (local.get $x) (local.get $w)))
      (if (i32.eqz (i32.load8_u (i32.add (local.get $row) (local.get $x)))) (then (local.set $x (i32.add (local.get $x) (i32.const 1))) (br $xs)))
      (local.set $s (local.get $x))
      (block $e1 (loop $es
        (br_if $e1 (i32.ge_s (i32.add (local.get $x) (i32.const 1)) (local.get $w)))
        (br_if $e1 (i32.eqz (i32.load8_u (i32.add (local.get $row) (i32.add (local.get $x) (i32.const 1))))))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br $es)))
      (if (i32.ge_u (local.get $count) (local.get $limit)) (then (return (i32.const -1))))
      (local.set $k (local.get $count))
      (i32.store (i32.add (local.get $runs) (i32.shl (local.get $k) (i32.const 4))) (local.get $s))
      (i32.store offset=4 (i32.add (local.get $runs) (i32.shl (local.get $k) (i32.const 4))) (local.get $x))
      (i32.store offset=8 (i32.add (local.get $runs) (i32.shl (local.get $k) (i32.const 4))) (i32.add (local.get $y0) (local.get $y)))
      (i32.store offset=12 (i32.add (local.get $runs) (i32.shl (local.get $k) (i32.const 4))) (local.get $k))
      (local.set $count (i32.add (local.get $count) (i32.const 1)))
      (block $a1 (loop $skip
        (br_if $a1 (i32.ge_u (local.get $above) (local.get $aboveEnd)))
        (br_if $a1 (i32.ge_s (i32.load offset=4 (i32.add (local.get $runs) (i32.shl (local.get $above) (i32.const 4)))) (i32.sub (local.get $s) (i32.const 1))))
        (local.set $above (i32.add (local.get $above) (i32.const 1)))
        (br $skip)))
      (local.set $j (local.get $above))
      (block $j1 (loop $js
        (br_if $j1 (i32.ge_u (local.get $j) (local.get $aboveEnd)))
        (br_if $j1 (i32.gt_s (i32.load (i32.add (local.get $runs) (i32.shl (local.get $j) (i32.const 4)))) (i32.add (local.get $x) (i32.const 1))))
        (local.set $a (call $text_ink_run_root (local.get $runs) (local.get $j)))
        (local.set $b (call $text_ink_run_root (local.get $runs) (local.get $k)))
        (if (i32.ne (local.get $a) (local.get $b)) (then
          (i32.store offset=12 (i32.add (local.get $runs) (i32.shl (select (local.get $b) (local.get $a) (i32.lt_u (local.get $a) (local.get $b))) (i32.const 4)))
            (select (local.get $a) (local.get $b) (i32.lt_u (local.get $a) (local.get $b))))))
        (local.set $j (i32.add (local.get $j) (i32.const 1)))
        (br $js)))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $xs)))
    (local.set $above (local.get $first)) (local.set $aboveEnd (local.get $count))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  (i32.store (local.get $state) (local.get $count)) (i32.store offset=4 (local.get $state) (local.get $above)) (i32.store offset=8 (local.get $state) (local.get $aboveEnd))
  (local.get $count))
;; The parts' boxes [x, y, width, height] at `boxes`, in the order of each part's first run; `index`: a word a run.
(func $componentBoxes (param $runs i32) (param $count i32) (param $index i32) (param $boxes i32) (param $counts i32) (result i32)
  (local $k i32) (local $r i32) (local $b i32) (local $n i32) (local $at i32) (local $s i32) (local $e i32) (local $y i32)
  (block $k1 (loop $ks
    (br_if $k1 (i32.ge_u (local.get $k) (local.get $count)))
    (local.set $at (i32.add (local.get $runs) (i32.shl (local.get $k) (i32.const 4))))
    (local.set $s (i32.load (local.get $at))) (local.set $e (i32.load offset=4 (local.get $at))) (local.set $y (i32.load offset=8 (local.get $at)))
    (local.set $r (call $text_ink_run_root (local.get $runs) (local.get $k)))
    (if (i32.eq (local.get $r) (local.get $k))
      (then
        (local.set $b (local.get $n)) (local.set $n (i32.add (local.get $n) (i32.const 1)))
        (i32.store (i32.add (local.get $index) (i32.shl (local.get $k) (i32.const 2))) (local.get $b))
        (if (local.get $counts) (then (i32.store (i32.add (local.get $counts) (i32.shl (local.get $b) (i32.const 2))) (i32.const 0))))
        (i32.store (i32.add (local.get $boxes) (i32.shl (local.get $b) (i32.const 4))) (local.get $s))
        (i32.store offset=4 (i32.add (local.get $boxes) (i32.shl (local.get $b) (i32.const 4))) (local.get $y))
        (i32.store offset=8 (i32.add (local.get $boxes) (i32.shl (local.get $b) (i32.const 4))) (local.get $e)))
      (else (local.set $b (i32.load (i32.add (local.get $index) (i32.shl (local.get $r) (i32.const 2)))))))
    (local.set $at (i32.add (local.get $boxes) (i32.shl (local.get $b) (i32.const 4))))
    (if (i32.lt_s (local.get $s) (i32.load (local.get $at))) (then (i32.store (local.get $at) (local.get $s))))
    (if (i32.gt_s (local.get $e) (i32.load offset=8 (local.get $at))) (then (i32.store offset=8 (local.get $at) (local.get $e))))
    (i32.store offset=12 (local.get $at) (local.get $y))
    (if (local.get $counts) (then
      (local.set $at (i32.add (local.get $counts) (i32.shl (local.get $b) (i32.const 2))))
      (i32.store (local.get $at) (i32.add (i32.load (local.get $at)) (i32.add (i32.sub (local.get $e) (local.get $s)) (i32.const 1))))))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    (br $ks)))
  ;; [x, y, x1, y1] to [x, y, width, height].
  (local.set $b (i32.const 0))
  (block $b1 (loop $bs
    (br_if $b1 (i32.ge_u (local.get $b) (local.get $n)))
    (local.set $at (i32.add (local.get $boxes) (i32.shl (local.get $b) (i32.const 4))))
    (i32.store offset=8 (local.get $at) (i32.add (i32.sub (i32.load offset=8 (local.get $at)) (i32.load (local.get $at))) (i32.const 1)))
    (i32.store offset=12 (local.get $at) (i32.add (i32.sub (i32.load offset=12 (local.get $at)) (i32.load offset=4 (local.get $at))) (i32.const 1)))
    (local.set $b (i32.add (local.get $b) (i32.const 1)))
    (br $bs)))
  (local.get $n))
;; maskComponents in one call (capture-kernels.mjs captureMaskComponents): the w x h mask's row runs counted
;; (componentRuns), then, where they fit `limit`, the runs themselves (componentRows) at `work`, their index after them (a
;; word a run), the state after that, and the parts' boxes at `boxes`. Answers the parts' count, or -1 - runs where the
;; runs pass `limit` (the caller lays out that many and calls again).
(func (export "components") (param $mask i32) (param $w i32) (param $h i32) (param $work i32) (param $limit i32) (param $boxes i32) (param $counts i32) (result i32)
  (local $state i32) (local $count i32)
  (local.set $count (call $componentRuns (local.get $mask) (local.get $w) (local.get $h)))
  (if (i32.gt_u (local.get $count) (local.get $limit)) (then (return (i32.sub (i32.const -1) (local.get $count)))))
  (local.set $state (i32.add (local.get $work) (i32.mul (local.get $limit) (i32.const 20))))
  (i64.store (local.get $state) (i64.const 0)) (i32.store offset=8 (local.get $state) (i32.const 0))
  (local.set $count (call $componentRows (local.get $mask) (local.get $w) (local.get $h) (i32.const 0) (local.get $work) (local.get $limit) (local.get $state)))
  (call $componentBoxes (local.get $work) (local.get $count) (i32.add (local.get $work) (i32.shl (local.get $limit) (i32.const 4))) (local.get $boxes) (local.get $counts)))
;; How many row runs `rows` rows of a w-byte-wide 0/1 mask hold (componentRuns: maskComponents sizes its memory first).
(func $componentRuns (param $mask i32) (param $w i32) (param $rows i32) (result i32)
  (local $y i32) (local $x i32) (local $row i32) (local $was i32) (local $v i32) (local $count i32)
  (block $y1 (loop $ys
    (br_if $y1 (i32.ge_s (local.get $y) (local.get $rows)))
    (local.set $row (i32.add (local.get $mask) (i32.mul (local.get $y) (local.get $w))))
    (local.set $was (i32.const 0)) (local.set $x (i32.const 0))
    (block $x1 (loop $xs
      (br_if $x1 (i32.ge_s (local.get $x) (local.get $w)))
      (local.set $v (i32.ne (i32.load8_u (i32.add (local.get $row) (local.get $x))) (i32.const 0)))
      (local.set $count (i32.add (local.get $count) (i32.and (local.get $v) (i32.eqz (local.get $was)))))
      (local.set $was (local.get $v))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  (local.get $count))
;; The sum of `n` bytes (maskOnes: a 0/1 mask's ones), 16 at a time.
(func (export "maskOnes") (param $p i32) (param $n i32) (result i32)
  (local $end i32) (local $acc v128) (local $sum i32) (local $k i32)
  (local.set $end (i32.add (local.get $p) (i32.and (local.get $n) (i32.const -16))))
  (block $v1 (loop $vs
    (br_if $v1 (i32.ge_u (local.get $p) (local.get $end)))
    (local.set $acc (i32x4.add (local.get $acc) (i32x4.extadd_pairwise_i16x8_u (i16x8.extadd_pairwise_i8x16_u (v128.load (local.get $p))))))
    (local.set $p (i32.add (local.get $p) (i32.const 16)))
    (local.set $k (i32.add (local.get $k) (i32.const 1)))
    ;; Each lane holds at most 4 x 255 a step: fold before 2^22 steps.
    (if (i32.eq (local.get $k) (i32.const 0x200000)) (then
      (local.set $sum (i32.add (local.get $sum) (i32.add (i32.add (i32x4.extract_lane 0 (local.get $acc)) (i32x4.extract_lane 1 (local.get $acc)))
        (i32.add (i32x4.extract_lane 2 (local.get $acc)) (i32x4.extract_lane 3 (local.get $acc))))))
      (local.set $acc (v128.const i32x4 0 0 0 0)) (local.set $k (i32.const 0))))
    (br $vs)))
  (local.set $sum (i32.add (local.get $sum) (i32.add (i32.add (i32x4.extract_lane 0 (local.get $acc)) (i32x4.extract_lane 1 (local.get $acc)))
    (i32.add (i32x4.extract_lane 2 (local.get $acc)) (i32x4.extract_lane 3 (local.get $acc))))))
  (local.set $end (i32.add (local.get $end) (i32.and (local.get $n) (i32.const 15))))
  (block $t1 (loop $ts
    (br_if $t1 (i32.ge_u (local.get $p) (local.get $end)))
    (local.set $sum (i32.add (local.get $sum) (i32.load8_u (local.get $p))))
    (local.set $p (i32.add (local.get $p) (i32.const 1)))
    (br $ts)))
  (local.get $sum))

;; capture-photo.mjs's frames (unionClear, fillUnder, diffMask).
;; A union frame's exact bytes (`width` wide): under rectangle (rx, ry, rw, rh) every 1 becomes 0 where `mask` (rw x rh
;; bytes; 0: none) is 0 or absent. Answers how many 1s became 0.
(func (export "unionClear") (param $exact i32) (param $width i32) (param $mask i32) (param $rx i32) (param $ry i32) (param $rw i32) (param $rh i32) (result i32)
  (local $x i32) (local $y i32) (local $k i32) (local $p i32) (local $cleared i32)
  (block $y1 (loop $ys
    (br_if $y1 (i32.ge_s (local.get $y) (local.get $rh)))
    (local.set $p (i32.add (local.get $exact) (i32.add (i32.mul (i32.add (local.get $ry) (local.get $y)) (local.get $width)) (local.get $rx))))
    (local.set $x (i32.const 0))
    (block $x1 (loop $xs
      (br_if $x1 (i32.ge_s (local.get $x) (local.get $rw)))
      (if (i32.load8_u (local.get $p)) (then
        (if (if (result i32) (local.get $mask) (then (i32.eqz (i32.load8_u (i32.add (local.get $mask) (local.get $k))))) (else (i32.const 1)))
          (then (i32.store8 (local.get $p) (i32.const 0)) (local.set $cleared (i32.add (local.get $cleared) (i32.const 1)))))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (local.set $p (i32.add (local.get $p) (i32.const 1)))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  (local.get $cleared))
;; A rectangle's `n` pixel words take `fill` where its `exact` bytes are 0 (0: no mask, every word).
(func (export "fillUnder") (param $words i32) (param $n i32) (param $exact i32) (param $fill i32)
  (local $i i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (if (if (result i32) (local.get $exact) (then (i32.eqz (i32.load8_u (i32.add (local.get $exact) (local.get $i))))) (else (i32.const 1)))
      (then (i32.store (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2))) (local.get $fill))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  )
;; `n` RGBA samples of `a` and `b` compared: `mask` 1 where any byte differs; answers how many differ.
(func (export "diffMask") (param $a i32) (param $b i32) (param $n i32) (param $mask i32) (result i32)
  (local $i i32) (local $d i32) (local $count i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $d (i32.ne (i32.load (i32.add (local.get $a) (i32.shl (local.get $i) (i32.const 2)))) (i32.load (i32.add (local.get $b) (i32.shl (local.get $i) (i32.const 2))))))
    (i32.store8 (i32.add (local.get $mask) (local.get $i)) (local.get $d))
    (local.set $count (i32.add (local.get $count) (local.get $d)))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  (local.get $count))

;; capture-patched.mjs's unboxedMarks (markFacts, markGrounded): rows from `ybase` of the page at `band` (RGBA, `width`
;; wide) and of its boxed bytes at `boxed`. For each of `count` marks [x, y, w, h] at `marks`, seven words at `out`:
;; whether any of its samples is outside every box, then its channels' lowest and highest.
(func (export "markFacts") (param $band i32) (param $boxed i32) (param $width i32) (param $ybase i32) (param $marks i32) (param $count i32) (param $out i32)
  (local $q i32) (local $x i32) (local $y i32) (local $w i32) (local $h i32) (local $u i32) (local $v i32) (local $k i32) (local $p i32) (local $s i32)
  (local $open i32) (local $lo0 i32) (local $lo1 i32) (local $lo2 i32) (local $hi0 i32) (local $hi1 i32) (local $hi2 i32) (local $o i32)
  (block $q1 (loop $qs
    (br_if $q1 (i32.ge_u (local.get $q) (local.get $count)))
    (local.set $p (i32.add (local.get $marks) (i32.shl (local.get $q) (i32.const 4))))
    (local.set $x (i32.load (local.get $p))) (local.set $y (i32.load offset=4 (local.get $p)))
    (local.set $w (i32.load offset=8 (local.get $p))) (local.set $h (i32.load offset=12 (local.get $p)))
    (local.set $open (i32.const 0)) (local.set $lo0 (i32.const 255)) (local.set $lo1 (i32.const 255)) (local.set $lo2 (i32.const 255))
    (local.set $hi0 (i32.const 0)) (local.set $hi1 (i32.const 0)) (local.set $hi2 (i32.const 0))
    (local.set $v (local.get $y))
    (block $v1 (loop $vs
      (br_if $v1 (i32.ge_s (local.get $v) (i32.add (local.get $y) (local.get $h))))
      (local.set $k (i32.add (i32.mul (i32.sub (local.get $v) (local.get $ybase)) (local.get $width)) (local.get $x)))
      (local.set $u (i32.const 0))
      (block $u1 (loop $us
        (br_if $u1 (i32.ge_s (local.get $u) (local.get $w)))
        (if (i32.eqz (i32.load8_u (i32.add (local.get $boxed) (local.get $k)))) (then (local.set $open (i32.const 1))))
        (local.set $o (i32.add (local.get $band) (i32.shl (local.get $k) (i32.const 2))))
        (local.set $s (i32.load8_u (local.get $o)))
        (if (i32.lt_u (local.get $s) (local.get $lo0)) (then (local.set $lo0 (local.get $s)))) (if (i32.gt_u (local.get $s) (local.get $hi0)) (then (local.set $hi0 (local.get $s))))
        (local.set $s (i32.load8_u offset=1 (local.get $o)))
        (if (i32.lt_u (local.get $s) (local.get $lo1)) (then (local.set $lo1 (local.get $s)))) (if (i32.gt_u (local.get $s) (local.get $hi1)) (then (local.set $hi1 (local.get $s))))
        (local.set $s (i32.load8_u offset=2 (local.get $o)))
        (if (i32.lt_u (local.get $s) (local.get $lo2)) (then (local.set $lo2 (local.get $s)))) (if (i32.gt_u (local.get $s) (local.get $hi2)) (then (local.set $hi2 (local.get $s))))
        (local.set $k (i32.add (local.get $k) (i32.const 1)))
        (local.set $u (i32.add (local.get $u) (i32.const 1)))
        (br $us)))
      (local.set $v (i32.add (local.get $v) (i32.const 1)))
      (br $vs)))
    (local.set $p (i32.add (local.get $out) (i32.mul (local.get $q) (i32.const 28))))
    (i32.store (local.get $p) (local.get $open))
    (i32.store offset=4 (local.get $p) (local.get $lo0)) (i32.store offset=8 (local.get $p) (local.get $lo1)) (i32.store offset=12 (local.get $p) (local.get $lo2))
    (i32.store offset=16 (local.get $p) (local.get $hi0)) (i32.store offset=20 (local.get $p) (local.get $hi1)) (i32.store offset=24 (local.get $p) (local.get $hi2))
    (local.set $q (i32.add (local.get $q) (i32.const 1)))
    (br $qs)))
  )
;; Whether one colour fills a quarter or more of box (x, y, w, h): `table` holds `cap` keys then `cap` counts (a power of
;; two over twice the box).
(func (export "markGrounded") (param $band i32) (param $width i32) (param $ybase i32) (param $x i32) (param $y i32) (param $w i32) (param $h i32)
  (param $table i32) (param $cap i32) (result i32)
  (local $u i32) (local $v i32) (local $o i32) (local $k i32) (local $s i32) (local $n i32) (local $most i32) (local $counts i32)
  (local.set $counts (i32.add (local.get $table) (i32.shl (local.get $cap) (i32.const 2))))
  (memory.fill (local.get $table) (i32.const 255) (i32.shl (local.get $cap) (i32.const 2)))
  (memory.fill (local.get $counts) (i32.const 0) (i32.shl (local.get $cap) (i32.const 2)))
  (local.set $v (local.get $y))
  (block $v1 (loop $vs
    (br_if $v1 (i32.ge_s (local.get $v) (i32.add (local.get $y) (local.get $h))))
    (local.set $u (local.get $x))
    (block $u1 (loop $us
      (br_if $u1 (i32.ge_s (local.get $u) (i32.add (local.get $x) (local.get $w))))
      (local.set $k (call $markRGB (local.get $band) (local.get $width) (local.get $ybase) (local.get $u) (local.get $v)))
      (local.set $s (call $inkSlot (local.get $table) (local.get $cap) (local.get $k)))
      (i32.store (i32.add (local.get $table) (i32.shl (local.get $s) (i32.const 2))) (local.get $k))
      (local.set $o (i32.add (local.get $counts) (i32.shl (local.get $s) (i32.const 2))))
      (local.set $n (i32.add (i32.load (local.get $o)) (i32.const 1)))
      (i32.store (local.get $o) (local.get $n))
      (if (i32.gt_s (local.get $n) (local.get $most)) (then (local.set $most (local.get $n))))
      (local.set $u (i32.add (local.get $u) (i32.const 1)))
      (br $us)))
    (local.set $v (i32.add (local.get $v) (i32.const 1)))
    (br $vs)))
  (i32.ge_s (i32.shl (local.get $most) (i32.const 2)) (i32.mul (local.get $w) (local.get $h))))

;; capture-patched.mjs's groundCells (groundRing): the colours of the samples within RING (2) around box (bx, by, bw, bh)
;; of the page's rows from `ybase` at `band` (RGBA, `width` x `height`), but under `text` (bytes for the same rows; 0:
;; none). Each colour's 27 cells around its 5-bit cell get bit 1, and a colour that stands out (any channel 96 or more)
;; from the commonest (the first to reach the most) gets STRONG (2) in its own cell, into `cells` (32,768 bytes, cleared
;; here). `table`: `cap` keys then `cap` counts. Answers the samples counted (under 16: no ground).
(func (export "groundRing") (param $band i32) (param $text i32) (param $width i32) (param $height i32) (param $ybase i32)
  (param $bx i32) (param $by i32) (param $bw i32) (param $bh i32) (param $table i32) (param $cap i32) (param $cells i32) (result i32)
  (local $y i32) (local $x i32) (local $y1 i32) (local $x0 i32) (local $x1 i32) (local $k i32) (local $s i32) (local $o i32) (local $c i32)
  (local $n i32) (local $most i32) (local $common i32) (local $counts i32) (local $r i32) (local $g i32) (local $b i32) (local $i i32) (local $j i32) (local $l i32)
  (local.set $counts (i32.add (local.get $table) (i32.shl (local.get $cap) (i32.const 2))))
  (memory.fill (local.get $table) (i32.const 255) (i32.shl (local.get $cap) (i32.const 2)))
  (memory.fill (local.get $counts) (i32.const 0) (i32.shl (local.get $cap) (i32.const 2)))
  (local.set $y (select (i32.sub (local.get $by) (i32.const 2)) (i32.const 0) (i32.gt_s (local.get $by) (i32.const 2))))
  (local.set $y1 (select (i32.add (i32.add (local.get $by) (local.get $bh)) (i32.const 2)) (local.get $height)
    (i32.lt_s (i32.add (i32.add (local.get $by) (local.get $bh)) (i32.const 2)) (local.get $height))))
  (local.set $x0 (select (i32.sub (local.get $bx) (i32.const 2)) (i32.const 0) (i32.gt_s (local.get $bx) (i32.const 2))))
  (local.set $x1 (select (i32.add (i32.add (local.get $bx) (local.get $bw)) (i32.const 2)) (local.get $width)
    (i32.lt_s (i32.add (i32.add (local.get $bx) (local.get $bw)) (i32.const 2)) (local.get $width))))
  (block $y2 (loop $ys
    (br_if $y2 (i32.ge_s (local.get $y) (local.get $y1)))
    (local.set $x (local.get $x0))
    (block $x2 (loop $xs
      (br_if $x2 (i32.ge_s (local.get $x) (local.get $x1)))
      ;; Inside the box: on to its last column (the loop steps past it).
      (if (i32.and (i32.and (i32.ge_s (local.get $y) (local.get $by)) (i32.lt_s (local.get $y) (i32.add (local.get $by) (local.get $bh))))
            (i32.and (i32.ge_s (local.get $x) (local.get $bx)) (i32.lt_s (local.get $x) (i32.add (local.get $bx) (local.get $bw)))))
        (then (local.set $x (i32.add (local.get $bx) (local.get $bw))) (br $xs)))
      (local.set $k (i32.add (i32.mul (i32.sub (local.get $y) (local.get $ybase)) (local.get $width)) (local.get $x)))
      (if (if (result i32) (local.get $text) (then (i32.eqz (i32.load8_u (i32.add (local.get $text) (local.get $k))))) (else (i32.const 1))) (then
        (local.set $c (call $markRGB (local.get $band) (local.get $width) (local.get $ybase) (local.get $x) (local.get $y)))
        (local.set $s (call $inkSlot (local.get $table) (local.get $cap) (local.get $c)))
        (i32.store (i32.add (local.get $table) (i32.shl (local.get $s) (i32.const 2))) (local.get $c))
        (local.set $o (i32.add (local.get $counts) (i32.shl (local.get $s) (i32.const 2))))
        (i32.store (local.get $o) (i32.add (i32.load (local.get $o)) (i32.const 1)))
        (local.set $n (i32.add (local.get $n) (i32.const 1)))
        (if (i32.gt_s (i32.load (local.get $o)) (local.get $most)) (then (local.set $most (i32.load (local.get $o))) (local.set $common (local.get $c))))))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  (if (i32.lt_s (local.get $n) (i32.const 16)) (then (return (local.get $n))))
  (memory.fill (local.get $cells) (i32.const 0) (i32.const 32768))
  (local.set $s (i32.const 0))
  (block $t1 (loop $ts
    (br_if $t1 (i32.ge_u (local.get $s) (local.get $cap)))
    (local.set $c (i32.load (i32.add (local.get $table) (i32.shl (local.get $s) (i32.const 2)))))
    (if (i32.ne (local.get $c) (i32.const -1)) (then
      (local.set $r (i32.shr_u (local.get $c) (i32.const 19)))
      (local.set $g (i32.and (i32.shr_u (local.get $c) (i32.const 11)) (i32.const 31)))
      (local.set $b (i32.and (i32.shr_u (local.get $c) (i32.const 3)) (i32.const 31)))
      (local.set $i (select (i32.sub (local.get $r) (i32.const 1)) (i32.const 0) (i32.gt_s (local.get $r) (i32.const 0))))
      (block $i1 (loop $is
        (br_if $i1 (i32.gt_s (local.get $i) (select (i32.add (local.get $r) (i32.const 1)) (i32.const 31) (i32.lt_s (local.get $r) (i32.const 31)))))
        (local.set $j (select (i32.sub (local.get $g) (i32.const 1)) (i32.const 0) (i32.gt_s (local.get $g) (i32.const 0))))
        (block $j1 (loop $js
          (br_if $j1 (i32.gt_s (local.get $j) (select (i32.add (local.get $g) (i32.const 1)) (i32.const 31) (i32.lt_s (local.get $g) (i32.const 31)))))
          (local.set $l (select (i32.sub (local.get $b) (i32.const 1)) (i32.const 0) (i32.gt_s (local.get $b) (i32.const 0))))
          (block $l1 (loop $ls
            (br_if $l1 (i32.gt_s (local.get $l) (select (i32.add (local.get $b) (i32.const 1)) (i32.const 31) (i32.lt_s (local.get $b) (i32.const 31)))))
            (local.set $o (i32.add (local.get $cells) (i32.or (i32.or (i32.shl (local.get $i) (i32.const 10)) (i32.shl (local.get $j) (i32.const 5))) (local.get $l))))
            (i32.store8 (local.get $o) (i32.or (i32.load8_u (local.get $o)) (i32.const 1)))
            (local.set $l (i32.add (local.get $l) (i32.const 1)))
            (br $ls)))
          (local.set $j (i32.add (local.get $j) (i32.const 1)))
          (br $js)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $is)))
      (if (call $inkApart (local.get $c) (local.get $common) (i32.const 96)) (then
        (local.set $o (i32.add (local.get $cells) (call $inkCell (local.get $c))))
        (i32.store8 (local.get $o) (i32.or (i32.load8_u (local.get $o)) (i32.const 2)))))))
    (local.set $s (i32.add (local.get $s) (i32.const 1)))
    (br $ts)))
  (local.get $n))
;; capture-patched.mjs's textMaskOf (textRing): `diff` (w x h bytes, diffMask's) as `mask`: 2 on a sample that differs, 1
;; on the 3 x 3 ring around them, else 0.
(func (export "textRing") (param $diff i32) (param $w i32) (param $h i32) (param $mask i32)
  (local $x i32) (local $y i32) (local $u i32) (local $v i32) (local $v1 i32) (local $u0 i32) (local $u1 i32) (local $hit i32) (local $o i32)
  (block $y1 (loop $ys
    (br_if $y1 (i32.ge_s (local.get $y) (local.get $h)))
    (local.set $x (i32.const 0))
    (block $x1 (loop $xs
      (br_if $x1 (i32.ge_s (local.get $x) (local.get $w)))
      (local.set $o (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x)))
      (if (i32.load8_u (i32.add (local.get $diff) (local.get $o)))
        (then (i32.store8 (i32.add (local.get $mask) (local.get $o)) (i32.const 2)))
        (else
          (local.set $hit (i32.const 0))
          (local.set $v (select (i32.sub (local.get $y) (i32.const 1)) (i32.const 0) (i32.gt_s (local.get $y) (i32.const 0))))
          (local.set $v1 (select (i32.add (local.get $y) (i32.const 1)) (i32.sub (local.get $h) (i32.const 1)) (i32.lt_s (i32.add (local.get $y) (i32.const 1)) (local.get $h))))
          (local.set $u0 (select (i32.sub (local.get $x) (i32.const 1)) (i32.const 0) (i32.gt_s (local.get $x) (i32.const 0))))
          (local.set $u1 (select (i32.add (local.get $x) (i32.const 1)) (i32.sub (local.get $w) (i32.const 1)) (i32.lt_s (i32.add (local.get $x) (i32.const 1)) (local.get $w))))
          (block $v2 (loop $vs
            (br_if $v2 (i32.gt_s (local.get $v) (local.get $v1)))
            (local.set $u (local.get $u0))
            (block $u2 (loop $us
              (br_if $u2 (i32.gt_s (local.get $u) (local.get $u1)))
              (local.set $hit (i32.or (local.get $hit) (i32.load8_u (i32.add (local.get $diff) (i32.add (i32.mul (local.get $v) (local.get $w)) (local.get $u))))))
              (local.set $u (i32.add (local.get $u) (i32.const 1)))
              (br $us)))
            (local.set $v (i32.add (local.get $v) (i32.const 1)))
            (br $vs)))
          (i32.store8 (i32.add (local.get $mask) (local.get $o)) (i32.ne (local.get $hit) (i32.const 0)))))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  )
;; capture-photo.mjs's box bound (boxBound): every fourth sample each way of a w x h box, its rows in pairs at `pairs`
;; (pair k: box rows 4k and 4k + 1, w RGBA samples each), outside `nrects` rectangles [x, y, w, h] in box coordinates at
;; `rects`: at `out`, [samples visited, those equal to neither their right nor their lower neighbour].
(func (export "boxBound") (param $pairs i32) (param $w i32) (param $h i32) (param $rects i32) (param $nrects i32) (param $out i32)
  (local $sy i32) (local $sx i32) (local $q i32) (local $at i32) (local $inside i32) (local $p i32) (local $c i32) (local $samples i32) (local $bound i32) (local $row i32)
  (block $y1 (loop $ys
    (br_if $y1 (i32.ge_s (local.get $sy) (i32.sub (local.get $h) (i32.const 1))))
    (local.set $row (i32.add (local.get $pairs) (i32.mul (i32.shr_u (local.get $sy) (i32.const 2)) (i32.shl (local.get $w) (i32.const 3)))))
    (local.set $sx (i32.const 0))
    (block $x1 (loop $xs
      (br_if $x1 (i32.ge_s (local.get $sx) (i32.sub (local.get $w) (i32.const 1))))
      (local.set $inside (i32.const 0)) (local.set $q (i32.const 0))
      (block $q1 (loop $qs
        (br_if $q1 (i32.ge_u (local.get $q) (local.get $nrects)))
        (local.set $at (i32.add (local.get $rects) (i32.shl (local.get $q) (i32.const 4))))
        (if (i32.and (i32.and (i32.ge_s (local.get $sx) (i32.load (local.get $at))) (i32.lt_s (local.get $sx) (i32.add (i32.load (local.get $at)) (i32.load offset=8 (local.get $at)))))
              (i32.and (i32.ge_s (local.get $sy) (i32.load offset=4 (local.get $at))) (i32.lt_s (local.get $sy) (i32.add (i32.load offset=4 (local.get $at)) (i32.load offset=12 (local.get $at))))))
          (then (local.set $inside (i32.const 1)) (br $q1)))
        (local.set $q (i32.add (local.get $q) (i32.const 1)))
        (br $qs)))
      (if (i32.eqz (local.get $inside)) (then
        (local.set $samples (i32.add (local.get $samples) (i32.const 1)))
        (local.set $p (i32.add (local.get $row) (i32.shl (local.get $sx) (i32.const 2))))
        (local.set $c (i32.and (i32.load (local.get $p)) (i32.const 0xffffff)))
        (if (i32.and (i32.ne (local.get $c) (i32.and (i32.load offset=4 (local.get $p)) (i32.const 0xffffff)))
              (i32.ne (local.get $c) (i32.and (i32.load (i32.add (local.get $p) (i32.shl (local.get $w) (i32.const 2)))) (i32.const 0xffffff))))
          (then (local.set $bound (i32.add (local.get $bound) (i32.const 1)))))))
      (local.set $sx (i32.add (local.get $sx) (i32.const 4)))
      (br $xs)))
    (local.set $sy (i32.add (local.get $sy) (i32.const 4)))
    (br $ys)))
  (i32.store (local.get $out) (local.get $samples))
  (i32.store offset=4 (local.get $out) (local.get $bound)))

;; photo-region-score.mjs's linearPicture and every sRGB-to-linear reading (linearRows): `n` gamma sRGB samples
;; (binary32, or doubles where `wide` is 1) at `in` to linear light
;; (doubles) at `out`, as ssimulacra2.mjs's srgbToLinear: the sign kept, |v| / 12.92 to 0.04045, above it
;; exactPow((|v| + 0.055) / 1.055, 2.4) (decode-kernels.wat's, the same + - * / in the same order).
(func (export "linearRows") (param $in i32) (param $out i32) (param $n i32) (param $wide i32)
  (local $i i32) (local $v f64) (local $a f64) (local $l f64)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $v (if (result f64) (local.get $wide)
      (then (f64.load (i32.add (local.get $in) (i32.shl (local.get $i) (i32.const 3)))))
      (else (f64.promote_f32 (f32.load (i32.add (local.get $in) (i32.shl (local.get $i) (i32.const 2))))))))
    (local.set $a (f64.abs (local.get $v)))
    (local.set $l (if (result f64) (f64.le (local.get $a) (f64.const 0.04045))
      (then (f64.div (local.get $a) (f64.const 12.92)))
      (else (call $exact_xpow (f64.div (f64.add (local.get $a) (f64.const 0.055)) (f64.const 1.055)) (f64.const 2.4)))))
    (f64.store (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 3)))
      (select (f64.neg (local.get $l)) (local.get $l) (f64.lt (local.get $v) (f64.const 0))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  )

;; photo-measure.mjs's RGB8 of linear planes (rgbaLinear), as rgb8-output.mjs's toRGBA writes them: `n` samples of
;; three planes (binary32 where `wide` is 0, doubles where 1) to RGBA bytes at `out`, alpha 255. Each sample's level
;; from `T` (256 doubles, T[k] the least sample of level k or more): binary32 samples the decoder's way (under T[1] 0,
;; from T[255] 255, else the step table `S`'s level at sample x 65536, or one more where T says so); doubles by
;; T's count at or under the sample.
;; A double sample's level as rgb8-output.mjs's toRGBAExact computes it: Math.round(255 x the clamped sRGB encoding,
;; 12.92 v to 0.0031308, else 1.055 exactPow(v, 1 / 2.4) - 0.055); ties up, NaN 0.
(func $levelExact (param $v f64) (result i32)
  (local $e f64) (local $t f64)
  (local.set $e (if (result f64) (f64.le (local.get $v) (f64.const 0.0031308))
    (then (f64.mul (f64.const 12.92) (local.get $v)))
    (else (f64.sub (f64.mul (f64.const 1.055) (call $exact_xpow (local.get $v) (f64.div (f64.const 1) (f64.const 2.4)))) (f64.const 0.055)))))
  (if (f64.ne (local.get $e) (local.get $e)) (then (return (i32.const 0))))
  (local.set $e (f64.mul (f64.const 255) (f64.min (f64.const 1) (f64.max (f64.const 0) (local.get $e)))))
  (local.set $t (f64.floor (local.get $e)))
  (i32.trunc_f64_s (select (f64.add (local.get $t) (f64.const 1)) (local.get $t) (f64.ge (f64.sub (local.get $e) (local.get $t)) (f64.const 0.5)))))
(func (export "rgbaLevel") (param $v f64) (result i32) (call $levelExact (local.get $v)))
(func $levelOf (param $v f64) (param $T i32) (param $S i32) (param $wide i32) (result i32)
  (local $lo i32) (local $hi i32) (local $mid i32) (local $k i32) (local $a f64) (local $b f64)
  (if (i32.eqz (local.get $wide)) (then
    (if (i32.eqz (f64.ge (local.get $v) (f64.load offset=8 (local.get $T)))) (then (return (i32.const 0))))
    (if (f64.ge (local.get $v) (f64.load offset=2040 (local.get $T))) (then (return (i32.const 255))))
    (local.set $k (i32.load8_u (i32.add (local.get $S) (i32.trunc_f64_s (f64.mul (local.get $v) (f64.const 65536))))))
    (return (select (i32.add (local.get $k) (i32.const 1)) (local.get $k)
      (f64.ge (local.get $v) (f64.load (i32.add (local.get $T) (i32.shl (i32.add (local.get $k) (i32.const 1)) (i32.const 3)))))))))
  ;; Doubles: the level T places it at, but within 2^-36 of a threshold the exact level (exactPow wobbles there).
  (if (i32.eqz (f64.ge (local.get $v) (f64.const 0))) (then (return (call $levelExact (local.get $v)))))
  (local.set $lo (i32.const 0)) (local.set $hi (i32.const 256))
  (block $done (loop $halve
    (br_if $done (i32.le_u (i32.sub (local.get $hi) (local.get $lo)) (i32.const 1)))
    (local.set $mid (i32.shr_u (i32.add (local.get $lo) (local.get $hi)) (i32.const 1)))
    (if (f64.ge (local.get $v) (f64.load (i32.add (local.get $T) (i32.shl (local.get $mid) (i32.const 3)))))
      (then (local.set $lo (local.get $mid))) (else (local.set $hi (local.get $mid))))
    (br $halve)))
  (local.set $a (f64.load (i32.add (local.get $T) (i32.shl (local.get $lo) (i32.const 3)))))
  (if (i32.and (i32.ge_u (local.get $lo) (i32.const 1)) (f64.le (f64.sub (local.get $v) (local.get $a)) (f64.mul (local.get $a) (f64.const 1.4551915228366852e-11))))
    (then (return (call $levelExact (local.get $v)))))
  (if (i32.lt_u (local.get $lo) (i32.const 255)) (then
    (local.set $b (f64.load (i32.add (local.get $T) (i32.shl (i32.add (local.get $lo) (i32.const 1)) (i32.const 3)))))
    (if (f64.le (f64.sub (local.get $b) (local.get $v)) (f64.mul (local.get $b) (f64.const 1.4551915228366852e-11)))
      (then (return (call $levelExact (local.get $v)))))))
  (local.get $lo))
(func (export "rgbaLinear") (param $p0 i32) (param $p1 i32) (param $p2 i32) (param $n i32) (param $wide i32) (param $T i32) (param $S i32) (param $out i32)
  (local $i i32) (local $o i32) (local $c i32) (local $p i32) (local $v f64)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $o (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 2))))
    (local.set $c (i32.const 0))
    (loop $channels
      (local.set $p (select (local.get $p0) (select (local.get $p1) (local.get $p2) (i32.eq (local.get $c) (i32.const 1))) (i32.eqz (local.get $c))))
      (local.set $v (if (result f64) (local.get $wide)
        (then (f64.load (i32.add (local.get $p) (i32.shl (local.get $i) (i32.const 3)))))
        (else (f64.promote_f32 (f32.load (i32.add (local.get $p) (i32.shl (local.get $i) (i32.const 2))))))))
      (i32.store8 (i32.add (local.get $o) (local.get $c)) (call $levelOf (local.get $v) (local.get $T) (local.get $S) (local.get $wide)))
      (local.set $c (i32.add (local.get $c) (i32.const 1)))
      (br_if $channels (i32.lt_u (local.get $c) (i32.const 3))))
    (i32.store8 offset=3 (local.get $o) (i32.const 255))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  )

;; capture-codec.mjs's rgbFrame (frameSoft, frameRemap): a w x h frame of palette `indices` (16-bit, rows `stride`
;; apart from index `origin`) into `colours` (words, alpha in the top byte). frameSoft answers how many samples are
;; partly transparent (alpha neither 0 nor 255); frameRemap writes each sample's `remap`ped index (16-bit) to `plane`
;; and its alpha (16-bit) to `alpha`.
(func (export "frameSoft") (param $colours i32) (param $indices i32) (param $stride i32) (param $origin i32) (param $w i32) (param $h i32) (result i32)
  (local $y i32) (local $i i32) (local $e i32) (local $a i32) (local $soft i32)
  (block $y1 (loop $ys
    (br_if $y1 (i32.ge_s (local.get $y) (local.get $h)))
    (local.set $i (i32.add (local.get $origin) (i32.mul (local.get $y) (local.get $stride))))
    (local.set $e (i32.add (local.get $i) (local.get $w)))
    (block $x1 (loop $xs
      (br_if $x1 (i32.ge_s (local.get $i) (local.get $e)))
      (local.set $a (i32.load8_u offset=3 (i32.add (local.get $colours) (i32.shl (i32.load16_u (i32.add (local.get $indices) (i32.shl (local.get $i) (i32.const 1)))) (i32.const 2)))))
      (local.set $soft (i32.add (local.get $soft) (i32.and (i32.ne (local.get $a) (i32.const 0)) (i32.ne (local.get $a) (i32.const 255)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  (local.get $soft))
(func (export "frameRemap") (param $colours i32) (param $indices i32) (param $stride i32) (param $origin i32) (param $w i32) (param $h i32)
  (param $remap i32) (param $plane i32) (param $alpha i32)
  (local $y i32) (local $x i32) (local $i i32) (local $at i32) (local $v i32)
  (block $y1 (loop $ys
    (br_if $y1 (i32.ge_s (local.get $y) (local.get $h)))
    (local.set $i (i32.add (local.get $origin) (i32.mul (local.get $y) (local.get $stride))))
    (local.set $x (i32.const 0))
    (block $x1 (loop $xs
      (br_if $x1 (i32.ge_s (local.get $x) (local.get $w)))
      (local.set $v (i32.load16_u (i32.add (local.get $indices) (i32.shl (local.get $i) (i32.const 1)))))
      (i32.store16 (i32.add (local.get $plane) (i32.shl (local.get $at) (i32.const 1))) (i32.load16_u (i32.add (local.get $remap) (i32.shl (local.get $v) (i32.const 1)))))
      (i32.store16 (i32.add (local.get $alpha) (i32.shl (local.get $at) (i32.const 1))) (i32.load8_u offset=3 (i32.add (local.get $colours) (i32.shl (local.get $v) (i32.const 2)))))
      (local.set $at (i32.add (local.get $at) (i32.const 1)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $xs)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $ys)))
  )
