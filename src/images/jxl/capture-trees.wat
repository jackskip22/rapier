;; SPDX-License-Identifier: MIT
;; capture-trees.mjs codePlane: every pixel of a plane walked down its learned tree with the decoder's values, then coded
;; under its leaf. The same integers the JavaScript computes, so the same values and contexts.

;; Sample k of the i16 plane at $p.
(func $treeAt (param $p i32) (param $k i32) (result i32)
  (i32.load16_s (i32.add (local.get $p) (i32.shl (local.get $k) (i32.const 1)))))
(func $treeAbs (param $v i32) (result i32)
  (select (i32.sub (i32.const 0) (local.get $v)) (local.get $v) (i32.lt_s (local.get $v) (i32.const 0))))
;; The clamped gradient of $w, $n and $nw.
(func $treeGradient (param $w i32) (param $n i32) (param $nw i32) (result i32)
  (local $lo i32) (local $hi i32) (local $g i32)
  (local.set $lo (select (local.get $w) (local.get $n) (i32.lt_s (local.get $w) (local.get $n))))
  (local.set $hi (select (local.get $n) (local.get $w) (i32.lt_s (local.get $w) (local.get $n))))
  (local.set $g (i32.sub (i32.add (local.get $w) (local.get $n)) (local.get $nw)))
  (select (local.get $lo) (select (local.get $hi) (local.get $g) (i32.gt_s (local.get $g) (local.get $hi))) (i32.lt_s (local.get $g) (local.get $lo))))

;; property(): property $q of pixel $i (x $x, y $y) of the plane at $p ($width wide), with its W, N and NW; $wp its
;; property 15; properties 16 up read the references at $refs, $n samples apart, newest first.
(func $treeProperty (param $q i32) (param $p i32) (param $width i32) (param $i i32) (param $x i32) (param $y i32)
  (param $W i32) (param $N i32) (param $NW i32) (param $wp i32) (param $refs i32) (param $n i32) (result i32)
  (local $r i32) (local $v i32) (local $left i32) (local $top i32) (local $corner i32) (local $pw i32) (local $pn i32) (local $pnw i32)
  (if (i32.ge_s (local.get $q) (i32.const 16)) (then
    (local.set $r (i32.add (local.get $refs) (i32.shl (i32.mul (i32.shr_u (i32.sub (local.get $q) (i32.const 16)) (i32.const 2)) (local.get $n)) (i32.const 1))))
    (local.set $v (call $treeAt (local.get $r) (local.get $i)))
    (if (i32.lt_u (i32.and (local.get $q) (i32.const 3)) (i32.const 2)) (then
      (return (select (local.get $v) (call $treeAbs (local.get $v)) (i32.and (local.get $q) (i32.const 1))))))
    (local.set $left (if (result i32) (local.get $x) (then (call $treeAt (local.get $r) (i32.sub (local.get $i) (i32.const 1))))
      (else (if (result i32) (local.get $y) (then (call $treeAt (local.get $r) (i32.sub (local.get $i) (local.get $width)))) (else (i32.const 0))))))
    (local.set $top (if (result i32) (local.get $y) (then (call $treeAt (local.get $r) (i32.sub (local.get $i) (local.get $width)))) (else (local.get $left))))
    (local.set $corner (if (result i32) (i32.and (i32.ne (local.get $x) (i32.const 0)) (i32.ne (local.get $y) (i32.const 0)))
      (then (call $treeAt (local.get $r) (i32.sub (i32.sub (local.get $i) (local.get $width)) (i32.const 1)))) (else (local.get $left))))
    (local.set $v (i32.sub (local.get $v) (call $treeGradient (local.get $left) (local.get $top) (local.get $corner))))
    (return (select (local.get $v) (call $treeAbs (local.get $v)) (i32.eq (i32.and (local.get $q) (i32.const 3)) (i32.const 3))))))
  (block $eight (block $15 (block $14 (block $13 (block $12 (block $11 (block $10 (block $9 (block $7 (block $6 (block $5 (block $4 (block $3 (block $2
    (br_table $eight $eight $2 $3 $4 $5 $6 $7 $eight $9 $10 $11 $12 $13 $14 $15 (local.get $q)))
    (return (local.get $y)))
    (return (local.get $x)))
    (return (call $treeAbs (local.get $N))))
    (return (call $treeAbs (local.get $W))))
    (return (local.get $N)))
    (return (local.get $W)))
    (return (i32.sub (i32.add (local.get $W) (local.get $N)) (local.get $NW))))
    (return (i32.sub (local.get $W) (local.get $NW))))
    (return (i32.sub (local.get $NW) (local.get $N))))
    (return (i32.sub (local.get $N) (if (result i32) (i32.and (i32.ne (local.get $y) (i32.const 0)) (i32.lt_s (i32.add (local.get $x) (i32.const 1)) (local.get $width)))
      (then (call $treeAt (local.get $p) (i32.add (i32.sub (local.get $i) (local.get $width)) (i32.const 1)))) (else (local.get $N))))))
    (return (i32.sub (local.get $N) (if (result i32) (i32.gt_s (local.get $y) (i32.const 1))
      (then (call $treeAt (local.get $p) (i32.sub (local.get $i) (i32.shl (local.get $width) (i32.const 1))))) (else (local.get $N))))))
    (return (i32.sub (local.get $W) (if (result i32) (i32.gt_s (local.get $x) (i32.const 1))
      (then (call $treeAt (local.get $p) (i32.sub (local.get $i) (i32.const 2)))) (else (local.get $W))))))
    (return (local.get $wp)))
  ;; 8 (and 0, 1, as property() takes them): W less its own gradient prediction.
  (if (i32.eqz (local.get $x)) (then (return (local.get $W))))
  (local.set $pw (if (result i32) (i32.gt_s (local.get $x) (i32.const 1)) (then (call $treeAt (local.get $p) (i32.sub (local.get $i) (i32.const 2))))
    (else (if (result i32) (local.get $y) (then (call $treeAt (local.get $p) (i32.sub (i32.sub (local.get $i) (local.get $width)) (i32.const 1)))) (else (i32.const 0))))))
  (local.set $pn (if (result i32) (local.get $y) (then (call $treeAt (local.get $p) (i32.sub (i32.sub (local.get $i) (local.get $width)) (i32.const 1)))) (else (local.get $pw))))
  (local.set $pnw (if (result i32) (i32.and (i32.gt_s (local.get $x) (i32.const 1)) (i32.ne (local.get $y) (i32.const 0)))
    (then (call $treeAt (local.get $p) (i32.sub (i32.sub (local.get $i) (local.get $width)) (i32.const 2)))) (else (local.get $pw))))
  (i32.sub (local.get $W) (i32.sub (i32.add (local.get $pw) (local.get $pn)) (local.get $pnw))))

;; prediction(): predictor $q (not 6) of pixel $i.
(func $treePrediction (param $q i32) (param $p i32) (param $width i32) (param $i i32) (param $x i32) (param $y i32)
  (param $W i32) (param $N i32) (param $NW i32) (result i32)
  (local $g i32) (local $ne i32) (local $ww i32) (local $nn i32) (local $nee i32)
  (if (i32.eqz (local.get $q)) (then (return (i32.const 0))))
  (if (i32.eq (local.get $q) (i32.const 1)) (then (return (local.get $W))))
  (if (i32.eq (local.get $q) (i32.const 2)) (then (return (local.get $N))))
  (if (i32.eq (local.get $q) (i32.const 3)) (then (return (i32.div_s (i32.add (local.get $W) (local.get $N)) (i32.const 2)))))
  (if (i32.eq (local.get $q) (i32.const 4)) (then
    (local.set $g (i32.sub (i32.add (local.get $W) (local.get $N)) (local.get $NW)))
    (return (select (local.get $W) (local.get $N)
      (i32.lt_s (call $treeAbs (i32.sub (local.get $g) (local.get $W))) (call $treeAbs (i32.sub (local.get $g) (local.get $N))))))))
  (if (i32.eq (local.get $q) (i32.const 5)) (then (return (call $treeGradient (local.get $W) (local.get $N) (local.get $NW)))))
  (local.set $ne (if (result i32) (i32.and (i32.ne (local.get $y) (i32.const 0)) (i32.lt_s (i32.add (local.get $x) (i32.const 1)) (local.get $width)))
    (then (call $treeAt (local.get $p) (i32.add (i32.sub (local.get $i) (local.get $width)) (i32.const 1)))) (else (local.get $N))))
  (if (i32.eq (local.get $q) (i32.const 7)) (then (return (local.get $ne))))
  (if (i32.eq (local.get $q) (i32.const 8)) (then (return (local.get $NW))))
  (if (i32.eq (local.get $q) (i32.const 10)) (then (return (i32.div_s (i32.add (local.get $W) (local.get $NW)) (i32.const 2)))))
  (if (i32.eq (local.get $q) (i32.const 11)) (then (return (i32.div_s (i32.add (local.get $NW) (local.get $N)) (i32.const 2)))))
  (if (i32.eq (local.get $q) (i32.const 12)) (then (return (i32.div_s (i32.add (local.get $N) (local.get $ne)) (i32.const 2)))))
  (local.set $ww (if (result i32) (i32.gt_s (local.get $x) (i32.const 1)) (then (call $treeAt (local.get $p) (i32.sub (local.get $i) (i32.const 2)))) (else (local.get $W))))
  (if (i32.eq (local.get $q) (i32.const 9)) (then (return (local.get $ww))))
  (local.set $nn (if (result i32) (i32.gt_s (local.get $y) (i32.const 1)) (then (call $treeAt (local.get $p) (i32.sub (local.get $i) (i32.shl (local.get $width) (i32.const 1))))) (else (local.get $N))))
  (local.set $nee (if (result i32) (i32.and (i32.ne (local.get $y) (i32.const 0)) (i32.lt_s (i32.add (local.get $x) (i32.const 2)) (local.get $width)))
    (then (call $treeAt (local.get $p) (i32.add (i32.sub (local.get $i) (local.get $width)) (i32.const 2)))) (else (local.get $ne))))
  ;; 13
  (i32.div_s (i32.add (i32.add (i32.add (i32.sub (i32.mul (local.get $N) (i32.const 6)) (i32.shl (local.get $nn) (i32.const 1)))
    (i32.add (i32.mul (local.get $W) (i32.const 7)) (local.get $ww))) (i32.add (local.get $nee) (i32.mul (local.get $ne) (i32.const 3)))) (i32.const 8)) (i32.const 16)))

;; codePlane over $rows rows from row $y0 of an i16 plane $width wide, its row $y0 at $p (the two rows above it before
;; it): the flat tree at $nodes (four i32 a node: property, cut, left, right; a leaf: -1, its context, its predictor), the
;; band's weighted residuals (u32) at $res and property 15 (i32) at $wp, references (i16, $span samples apart, row $y0 of
;; the first at $refs with the row above it before). Each pixel's coded value (i32) at $coded, its context (u8) at $ctx.
(func (export "treeWalk") (param $p i32) (param $width i32) (param $y0 i32) (param $rows i32) (param $nodes i32) (param $res i32)
  (param $wp i32) (param $refs i32) (param $span i32) (param $coded i32) (param $ctx i32)
  (local $n i32) (local $i i32) (local $x i32) (local $y i32) (local $W i32) (local $N i32) (local $NW i32)
  (local $at i32) (local $q i32) (local $v i32) (local $r i32)
  (local.set $n (i32.mul (local.get $width) (local.get $rows)))
  (local.set $y (local.get $y0))
  (block $done (loop $pixels
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (if (i32.eq (local.get $x) (local.get $width)) (then (local.set $x (i32.const 0)) (local.set $y (i32.add (local.get $y) (i32.const 1)))))
    (local.set $W (if (result i32) (local.get $x) (then (call $treeAt (local.get $p) (i32.sub (local.get $i) (i32.const 1))))
      (else (if (result i32) (local.get $y) (then (call $treeAt (local.get $p) (i32.sub (local.get $i) (local.get $width)))) (else (i32.const 0))))))
    (local.set $N (if (result i32) (local.get $y) (then (call $treeAt (local.get $p) (i32.sub (local.get $i) (local.get $width)))) (else (local.get $W))))
    (local.set $NW (if (result i32) (i32.and (i32.ne (local.get $x) (i32.const 0)) (i32.ne (local.get $y) (i32.const 0)))
      (then (call $treeAt (local.get $p) (i32.sub (i32.sub (local.get $i) (local.get $width)) (i32.const 1)))) (else (local.get $W))))
    (local.set $at (local.get $nodes))
    (block $leaf (loop $walk
      (local.set $q (i32.load (local.get $at)))
      (br_if $leaf (i32.lt_s (local.get $q) (i32.const 0)))
      (local.set $v (if (result i32) (i32.eq (local.get $q) (i32.const 15))
        (then (i32.load (i32.add (local.get $wp) (i32.shl (local.get $i) (i32.const 2)))))
        (else (call $treeProperty (local.get $q) (local.get $p) (local.get $width) (local.get $i) (local.get $x) (local.get $y)
          (local.get $W) (local.get $N) (local.get $NW) (i32.load (i32.add (local.get $wp) (i32.shl (local.get $i) (i32.const 2)))) (local.get $refs) (local.get $span)))))
      (local.set $at (i32.add (local.get $nodes) (i32.shl
        (select (i32.load offset=8 (local.get $at)) (i32.load offset=12 (local.get $at)) (i32.gt_s (local.get $v) (i32.load offset=4 (local.get $at))))
        (i32.const 4))))
      (br $walk)))
    (i32.store8 (i32.add (local.get $ctx) (local.get $i)) (i32.load offset=4 (local.get $at)))
    (local.set $q (i32.load offset=8 (local.get $at)))
    (if (i32.eq (local.get $q) (i32.const 6))
      (then (local.set $r (i32.load (i32.add (local.get $res) (i32.shl (local.get $i) (i32.const 2))))))
      (else
        (local.set $r (i32.sub (call $treeAt (local.get $p) (local.get $i))
          (call $treePrediction (local.get $q) (local.get $p) (local.get $width) (local.get $i) (local.get $x) (local.get $y) (local.get $W) (local.get $N) (local.get $NW))))
        (local.set $r (select (i32.shl (local.get $r) (i32.const 1)) (i32.sub (i32.mul (local.get $r) (i32.const -2)) (i32.const 1)) (i32.ge_s (local.get $r) (i32.const 0))))))
    (i32.store (i32.add (local.get $coded) (i32.shl (local.get $i) (i32.const 2))) (local.get $r))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (local.set $x (i32.add (local.get $x) (i32.const 1)))
    (br $pixels)))
)
