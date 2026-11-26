;; SPDX-License-Identifier: MIT
;; Copyright (c) 2026 rapier-jxl contributors. MIT License.
;;
;; Handwritten SIMD WebAssembly kernel for text line and letter detection (inkLines, findText).
;; Caller-owned memory layout: uses only caller-supplied rgba, scratch, boxes and mask buffers
;; with zero stack pointer, zero globals and zero clobber below INK_BASE.
(module
  (import "env" "memory" (memory 2))

  ;; Disjoint-set find with path halving over Run[i] (16-byte stride, parent at +12).
  (func $run_root (param $runs i32) (param $i i32) (result i32)
    (local $p i32) (local $gp i32)
    (block $done (loop $L
      (local.set $p (i32.load offset=12 (i32.add (local.get $runs) (i32.shl (local.get $i) (i32.const 4)))))
      (br_if $done (i32.eq (local.get $p) (local.get $i)))
      (local.set $gp (i32.load offset=12 (i32.add (local.get $runs) (i32.shl (local.get $p) (i32.const 4)))))
      (i32.store offset=12 (i32.add (local.get $runs) (i32.shl (local.get $i) (i32.const 4))) (local.get $gp))
      (local.set $i (local.get $gp))
      (br $L)))
    (local.get $i))

  ;; Compute 4-lane flags in 0..63 for one 4-pixel group at byte offset $off.
  (func $row_group4 (param $row i32) (param $down i32) (param $off i32) (result v128)
    (local $c v128) (local $r v128) (local $d v128) (local $e v128) (local $kt v128) (local $kz v128) (local $res v128)
    (local.set $kt (v128.const i8x16 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31 31))
    (local.set $c (v128.load (i32.add (local.get $row) (local.get $off))))
    (local.set $r (v128.load offset=4 (i32.add (local.get $row) (local.get $off))))
    (local.set $res
      (v128.or
        (v128.and
          (i32x4.ne (i8x16.gt_u (v128.or (i8x16.sub_sat_u (local.get $c) (local.get $r)) (i8x16.sub_sat_u (local.get $r) (local.get $c))) (local.get $kt)) (local.get $kz))
          (v128.const i32x4 1 1 1 1))
        (v128.and (i32x4.eq (local.get $c) (local.get $r)) (v128.const i32x4 4 4 4 4))))
    (if (local.get $down)
      (then
        (local.set $d (v128.load (i32.add (local.get $down) (local.get $off))))
        (local.set $e (v128.load offset=4 (i32.add (local.get $down) (local.get $off))))
        (local.set $res
          (v128.or (local.get $res)
            (v128.or
              (v128.or
                (v128.and
                  (i32x4.ne (i8x16.gt_u (v128.or (i8x16.sub_sat_u (local.get $c) (local.get $d)) (i8x16.sub_sat_u (local.get $d) (local.get $c))) (local.get $kt)) (local.get $kz))
                  (v128.const i32x4 2 2 2 2))
                (v128.and (i32x4.eq (local.get $c) (local.get $d)) (v128.const i32x4 8 8 8 8)))
              (v128.or
                (v128.and (i32x4.eq (local.get $c) (local.get $e)) (v128.const i32x4 16 16 16 16))
                (v128.and (i32x4.eq (local.get $r) (local.get $d)) (v128.const i32x4 32 32 32 32))))))))
    (local.get $res))

  ;; One pass over a row pair (row and optional down), writing 1 flag byte per sample into f.
  (func $row_pairs (param $row i32) (param $down i32) (param $w i32) (param $f i32)
    (local $x i32) (local $p i32)
    (local $c i32) (local $r i32) (local $d i32) (local $e i32) (local $a i32) (local $b i32) (local $s i32) (local $u i32) (local $q i32) (local $v i32)

    (block $dx16 (loop $Lx16
      (br_if $dx16 (i32.gt_s (i32.add (local.get $x) (i32.const 17)) (local.get $w)))
      (local.set $p (i32.shl (local.get $x) (i32.const 2)))
      (v128.store (i32.add (local.get $f) (local.get $x))
        (i8x16.narrow_i16x8_s
          (i16x8.narrow_i32x4_s
            (call $row_group4 (local.get $row) (local.get $down) (local.get $p))
            (call $row_group4 (local.get $row) (local.get $down) (i32.add (local.get $p) (i32.const 16))))
          (i16x8.narrow_i32x4_s
            (call $row_group4 (local.get $row) (local.get $down) (i32.add (local.get $p) (i32.const 32)))
            (call $row_group4 (local.get $row) (local.get $down) (i32.add (local.get $p) (i32.const 48))))))
      (local.set $x (i32.add (local.get $x) (i32.const 16)))
      (br $Lx16)))

    (block $dx1 (loop $Lx1
      (br_if $dx1 (i32.ge_s (local.get $x) (local.get $w)))
      (local.set $p (i32.shl (local.get $x) (i32.const 2)))
      (local.set $c (i32.load (i32.add (local.get $row) (local.get $p))))
      (local.set $r (if (result i32) (i32.lt_s (i32.add (local.get $x) (i32.const 1)) (local.get $w))
        (then (i32.load offset=4 (i32.add (local.get $row) (local.get $p))))
        (else (local.get $c))))
      (local.set $d (if (result i32) (local.get $down)
        (then (i32.load (i32.add (local.get $down) (local.get $p))))
        (else (local.get $c))))
      (local.set $e (if (result i32) (i32.and (i32.ne (local.get $down) (i32.const 0)) (i32.lt_s (i32.add (local.get $x) (i32.const 1)) (local.get $w)))
        (then (i32.load offset=4 (i32.add (local.get $down) (local.get $p))))
        (else (i32.const 0))))
      (local.set $a (i32.const 0))
      (local.set $b (i32.const 0))
      (local.set $s (i32.const 0))
      (loop $Ls
        (local.set $u (i32.and (i32.shr_u (local.get $c) (local.get $s)) (i32.const 255)))
        (local.set $v (i32.and (i32.shr_u (local.get $r) (local.get $s)) (i32.const 255)))
        (local.set $q (i32.and (i32.shr_u (local.get $d) (local.get $s)) (i32.const 255)))
        (local.set $a (i32.or (local.get $a) (i32.ge_s
          (select (i32.sub (local.get $u) (local.get $v)) (i32.sub (local.get $v) (local.get $u)) (i32.gt_s (local.get $u) (local.get $v)))
          (i32.const 32))))
        (local.set $b (i32.or (local.get $b) (i32.ge_s
          (select (i32.sub (local.get $u) (local.get $q)) (i32.sub (local.get $q) (local.get $u)) (i32.gt_s (local.get $u) (local.get $q)))
          (i32.const 32))))
        (br_if $Ls (i32.lt_u (local.tee $s (i32.add (local.get $s) (i32.const 8))) (i32.const 32))))
      (local.set $q (i32.lt_s (i32.add (local.get $x) (i32.const 1)) (local.get $w)))
      (local.set $v (i32.or (i32.and (local.get $q) (local.get $a))
                            (i32.shl (i32.and (local.get $q) (i32.eq (local.get $c) (local.get $r))) (i32.const 2))))
      (if (local.get $down)
        (then
          (local.set $v (i32.or (local.get $v)
            (i32.or
              (i32.or (i32.shl (local.get $b) (i32.const 1))
                      (i32.shl (i32.eq (local.get $c) (local.get $d)) (i32.const 3)))
              (i32.or (i32.shl (i32.and (local.get $q) (i32.eq (local.get $c) (local.get $e))) (i32.const 4))
                      (i32.shl (i32.and (local.get $q) (i32.eq (local.get $r) (local.get $d))) (i32.const 5))))))))
      (i32.store8 (i32.add (local.get $f) (local.get $x)) (local.get $v))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $Lx1))))

  ;; stepRow2(fu, f, w, at): 4-neighbour step presence per sample.
  (func $step_row2 (param $fu i32) (param $f i32) (param $w i32) (param $at i32)
    (local $x i32) (local $f0 i32) (local $v v128) (local $one v128) (local $two v128)
    (local.set $one (v128.const i8x16 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1))
    (local.set $two (v128.const i8x16 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2))
    (local.set $f0 (i32.load8_u (local.get $f)))
    (i32.store8 (local.get $at)
      (i32.or
        (i32.or (i32.and (local.get $f0) (i32.const 1)) (i32.and (i32.shr_u (local.get $f0) (i32.const 1)) (i32.const 1)))
        (if (result i32) (local.get $fu) (then (i32.and (i32.shr_u (i32.load8_u (local.get $fu)) (i32.const 1)) (i32.const 1))) (else (i32.const 0)))))
    (local.set $x (i32.const 1))
    (block $dx16 (loop $Lx16
      (br_if $dx16 (i32.gt_s (i32.add (local.get $x) (i32.const 16)) (local.get $w)))
      (local.set $v (v128.load (i32.add (local.get $f) (local.get $x))))
      (local.set $v
        (v128.or
          (v128.and (v128.or (v128.load (i32.sub (i32.add (local.get $f) (local.get $x)) (i32.const 1))) (local.get $v)) (local.get $one))
          (i16x8.shr_u (v128.and (local.get $v) (local.get $two)) (i32.const 1))))
      (if (local.get $fu)
        (then
          (local.set $v (v128.or (local.get $v)
            (i16x8.shr_u (v128.and (v128.load (i32.add (local.get $fu) (local.get $x))) (local.get $two)) (i32.const 1))))))
      (v128.store (i32.add (local.get $at) (local.get $x)) (local.get $v))
      (local.set $x (i32.add (local.get $x) (i32.const 16)))
      (br $Lx16)))
    (block $dx1 (loop $Lx1
      (br_if $dx1 (i32.ge_s (local.get $x) (local.get $w)))
      (local.set $f0 (i32.load8_u (i32.add (local.get $f) (local.get $x))))
      (i32.store8 (i32.add (local.get $at) (local.get $x))
        (i32.or
          (i32.or
            (i32.and (i32.or (i32.load8_u (i32.sub (i32.add (local.get $f) (local.get $x)) (i32.const 1))) (local.get $f0)) (i32.const 1))
            (i32.and (i32.shr_u (local.get $f0) (i32.const 1)) (i32.const 1)))
          (if (result i32) (local.get $fu)
            (then (i32.and (i32.shr_u (i32.load8_u (i32.add (local.get $fu) (local.get $x))) (i32.const 1)) (i32.const 1)))
            (else (i32.const 0)))))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $Lx1))))

  ;; markLine: set bit 0 of mask for all samples within square radius r of exact ink inside [x0..x1] x [y0..y1].
  (func $mark_line (param $px i32) (param $w i32) (param $mask i32) (param $x0 i32) (param $y0 i32) (param $x1 i32) (param $y1 i32) (param $ink i32) (param $r i32)
    (local $x i32) (local $y i32) (local $m i32) (local $n i32) (local $p i32) (local $v i32)
    (local $vink v128) (local $vn v128) (local $vm v128)
    (local.set $vink (i32x4.splat (local.get $ink)))
    (local.set $y (local.get $y0))
    (block $dy1 (loop $Ly1
      (br_if $dy1 (i32.gt_s (local.get $y) (local.get $y1)))
      (local.set $x (local.get $x0))
      (block $dx1_16 (loop $Lx1_16
        (br_if $dx1_16 (i32.gt_s (i32.add (local.get $x) (i32.const 15)) (local.get $x1)))
        (local.set $p (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x)))
        (local.set $m (i32.add (local.get $px) (i32.shl (local.get $p) (i32.const 2))))
        (local.set $vm
          (v128.and
            (i8x16.narrow_i16x8_s
              (i16x8.narrow_i32x4_s (i32x4.eq (v128.load (local.get $m)) (local.get $vink)) (i32x4.eq (v128.load offset=16 (local.get $m)) (local.get $vink)))
              (i16x8.narrow_i32x4_s (i32x4.eq (v128.load offset=32 (local.get $m)) (local.get $vink)) (i32x4.eq (v128.load offset=48 (local.get $m)) (local.get $vink))))
            (v128.const i8x16 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2 2)))
        (v128.store (i32.add (local.get $mask) (local.get $p)) (v128.or (v128.load (i32.add (local.get $mask) (local.get $p))) (local.get $vm)))
        (local.set $x (i32.add (local.get $x) (i32.const 16)))
        (br $Lx1_16)))
      (block $dx1_1 (loop $Lx1
        (br_if $dx1_1 (i32.gt_s (local.get $x) (local.get $x1)))
        (local.set $p (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x)))
        (if (i32.eq (i32.load (i32.add (local.get $px) (i32.shl (local.get $p) (i32.const 2)))) (local.get $ink))
          (then
            (local.set $m (i32.add (local.get $mask) (local.get $p)))
            (i32.store8 (local.get $m) (i32.or (i32.load8_u (local.get $m)) (i32.const 2)))))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br $Lx1)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $Ly1)))

    (local.set $y (local.get $y0))
    (block $dy2 (loop $Ly2
      (br_if $dy2 (i32.gt_s (local.get $y) (local.get $y1)))
      (local.set $m (i32.add (local.get $mask) (i32.mul (local.get $y) (local.get $w))))
      (local.set $n (i32.const 0))
      (local.set $x (local.get $x0))
      (block $dxp (loop $Lxp
        (br_if $dxp (i32.or (i32.gt_s (local.get $x) (local.get $x1))
                            (i32.gt_s (local.get $x) (i32.sub (i32.add (local.get $x0) (local.get $r)) (i32.const 1)))))
        (local.set $n (i32.add (local.get $n) (i32.and (i32.shr_u (i32.load8_u (i32.add (local.get $m) (local.get $x))) (i32.const 1)) (i32.const 1))))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br $Lxp)))
      (local.set $x (local.get $x0))
      (loop $Lxs
        (if (i32.le_s (i32.add (local.get $x) (local.get $r)) (local.get $x1))
          (then (local.set $n (i32.add (local.get $n) (i32.and (i32.shr_u (i32.load8_u (i32.add (local.get $m) (i32.add (local.get $x) (local.get $r)))) (i32.const 1)) (i32.const 1))))))
        (if (local.get $n)
          (then
            (local.set $p (i32.add (local.get $m) (local.get $x)))
            (i32.store8 (local.get $p) (i32.or (i32.load8_u (local.get $p)) (i32.const 4)))))
        (if (i32.ge_s (i32.sub (local.get $x) (local.get $r)) (local.get $x0))
          (then (local.set $n (i32.sub (local.get $n) (i32.and (i32.shr_u (i32.load8_u (i32.add (local.get $m) (i32.sub (local.get $x) (local.get $r)))) (i32.const 1)) (i32.const 1))))))
        (br_if $Lxs (i32.le_s (local.tee $x (i32.add (local.get $x) (i32.const 1))) (local.get $x1))))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $Ly2)))

    (local.set $x (local.get $x0))
    (block $dx3_16 (loop $Lx3_16
      (br_if $dx3_16 (i32.gt_s (i32.add (local.get $x) (i32.const 15)) (local.get $x1)))
      (local.set $vn (v128.const i32x4 0 0 0 0))
      (local.set $y (local.get $y0))
      (block $dyp16 (loop $Lyp16
        (br_if $dyp16 (i32.or (i32.gt_s (local.get $y) (local.get $y1))
                              (i32.gt_s (local.get $y) (i32.sub (i32.add (local.get $y0) (local.get $r)) (i32.const 1)))))
        (local.set $vn (i8x16.add (local.get $vn)
          (i16x8.shr_u (v128.and (v128.load (i32.add (local.get $mask) (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x))))
                                 (v128.const i8x16 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4)) (i32.const 2))))
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $Lyp16)))
      (local.set $y (local.get $y0))
      (loop $Lys16
        (if (i32.le_s (i32.add (local.get $y) (local.get $r)) (local.get $y1))
          (then (local.set $vn (i8x16.add (local.get $vn)
            (i16x8.shr_u (v128.and (v128.load (i32.add (local.get $mask) (i32.add (i32.mul (i32.add (local.get $y) (local.get $r)) (local.get $w)) (local.get $x))))
                                   (v128.const i8x16 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4)) (i32.const 2))))))
        (local.set $p (i32.add (local.get $mask) (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x))))
        (v128.store (local.get $p)
          (v128.or (v128.load (local.get $p))
            (v128.and (i8x16.ne (local.get $vn) (v128.const i32x4 0 0 0 0)) (v128.const i8x16 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8))))
        (if (i32.ge_s (i32.sub (local.get $y) (local.get $r)) (local.get $y0))
          (then (local.set $vn (i8x16.sub (local.get $vn)
            (i16x8.shr_u (v128.and (v128.load (i32.add (local.get $mask) (i32.add (i32.mul (i32.sub (local.get $y) (local.get $r)) (local.get $w)) (local.get $x))))
                                   (v128.const i8x16 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4)) (i32.const 2))))))
        (br_if $Lys16 (i32.le_s (local.tee $y (i32.add (local.get $y) (i32.const 1))) (local.get $y1))))
      (local.set $x (i32.add (local.get $x) (i32.const 16)))
      (br $Lx3_16)))
    (block $dx3 (loop $Lx3
      (br_if $dx3 (i32.gt_s (local.get $x) (local.get $x1)))
      (local.set $n (i32.const 0))
      (local.set $y (local.get $y0))
      (block $dyp (loop $Lyp
        (br_if $dyp (i32.or (i32.gt_s (local.get $y) (local.get $y1))
                            (i32.gt_s (local.get $y) (i32.sub (i32.add (local.get $y0) (local.get $r)) (i32.const 1)))))
        (local.set $n (i32.add (local.get $n) (i32.and (i32.shr_u (i32.load8_u (i32.add (local.get $mask) (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x)))) (i32.const 2)) (i32.const 1))))
        (local.set $y (i32.add (local.get $y) (i32.const 1)))
        (br $Lyp)))
      (local.set $y (local.get $y0))
      (loop $Lys
        (if (i32.le_s (i32.add (local.get $y) (local.get $r)) (local.get $y1))
          (then (local.set $n (i32.add (local.get $n) (i32.and (i32.shr_u (i32.load8_u (i32.add (local.get $mask) (i32.add (i32.mul (i32.add (local.get $y) (local.get $r)) (local.get $w)) (local.get $x)))) (i32.const 2)) (i32.const 1))))))
        (if (local.get $n)
          (then
            (local.set $p (i32.add (local.get $mask) (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x))))
            (i32.store8 (local.get $p) (i32.or (i32.load8_u (local.get $p)) (i32.const 8)))))
        (if (i32.ge_s (i32.sub (local.get $y) (local.get $r)) (local.get $y0))
          (then (local.set $n (i32.sub (local.get $n) (i32.and (i32.shr_u (i32.load8_u (i32.add (local.get $mask) (i32.add (i32.mul (i32.sub (local.get $y) (local.get $r)) (local.get $w)) (local.get $x)))) (i32.const 2)) (i32.const 1))))))
        (br_if $Lys (i32.le_s (local.tee $y (i32.add (local.get $y) (i32.const 1))) (local.get $y1))))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $Lx3)))

    (local.set $y (local.get $y0))
    (block $dy4 (loop $Ly4
      (br_if $dy4 (i32.gt_s (local.get $y) (local.get $y1)))
      (local.set $x (local.get $x0))
      (block $dx4_16 (loop $Lx4_16
        (br_if $dx4_16 (i32.gt_s (i32.add (local.get $x) (i32.const 15)) (local.get $x1)))
        (local.set $p (i32.add (local.get $mask) (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x))))
        (local.set $vm (v128.load (local.get $p)))
        (v128.store (local.get $p)
          (v128.or (v128.and (local.get $vm) (v128.const i8x16 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1))
                   (i16x8.shr_u (v128.and (local.get $vm) (v128.const i8x16 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8)) (i32.const 3))))
        (local.set $x (i32.add (local.get $x) (i32.const 16)))
        (br $Lx4_16)))
      (block $dx4_1 (loop $Lx4
        (br_if $dx4_1 (i32.gt_s (local.get $x) (local.get $x1)))
        (local.set $p (i32.add (local.get $mask) (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x))))
        (local.set $v (i32.load8_u (local.get $p)))
        (i32.store8 (local.get $p) (i32.or (i32.and (local.get $v) (i32.const 1)) (i32.and (i32.shr_u (local.get $v) (i32.const 3)) (i32.const 1))))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br $Lx4)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $Ly4))))

  ;; Open-addressing hash lookup over cap (power of two) 16-byte {used, col, all, inside} slots.
  (func $share_of (param $slots i32) (param $cap i32) (param $col i32) (result i32)
    (local $i i32) (local $mask i32) (local $p i32)
    (local.set $mask (i32.sub (local.get $cap) (i32.const 1)))
    (local.set $i (i32.and (i32.mul (local.get $col) (i32.const -1640531535)) (local.get $mask)))
    (block $done (loop $L
      (local.set $p (i32.add (local.get $slots) (i32.shl (local.get $i) (i32.const 4))))
      (br_if $done (i32.or (i32.eqz (i32.load (local.get $p))) (i32.eq (i32.load offset=4 (local.get $p)) (local.get $col))))
      (local.set $i (i32.and (i32.add (local.get $i) (i32.const 1)) (local.get $mask)))
      (br $L)))
    (local.get $p))

  ;; Shared implementation for inkLines (mask == 0) and findText (mask != 0).
  (func $lines (param $rgba i32) (param $w i32) (param $h i32) (param $scratch i32) (param $room i32)
               (param $boxes i32) (param $maxBoxes i32) (param $cutTop i32) (param $cutBottom i32) (param $mask i32) (result i32)
    (local $n i32) (local $i i32) (local $j i32) (local $k i32) (local $u i32) (local $v i32) (local $x i32) (local $y i32)
    (local $c i32) (local $a i32) (local $b i32) (local $end i32)
    (local $F0 i32) (local $F1 i32) (local $F2 i32) (local $a0 i32) (local $a1 i32) (local $a2 i32) (local $cand0 i32)
    (local $rowRuns i32) (local $runs i32) (local $maxRuns i32) (local $nr i32)
    (local $row i32) (local $open i32) (local $s0 i32) (local $last i32) (local $col i32) (local $m i32) (local $x0 i32) (local $tc i32)
    (local $ae i32) (local $ra i32) (local $rb i32) (local $p i32) (local $q i32)
    (local $st i32) (local $maxStrokes i32) (local $ns i32) (local $ng i32)
    (local $allCol i32) (local $allArea i32) (local $keep i32) (local $gArea i32) (local $first i32) (local $mem i32) (local $slots i32)
    (local $nb i32) (local $kept i32) (local $cap i32) (local $pass i32)
    (local $pair i32) (local $ms i32) (local $m0 i32) (local $lock i32) (local $base i32) (local $tol i32)
    (local $order i32) (local $hmax i32) (local $agree i32)
    (local $lx0 i32) (local $ly0 i32) (local $lx1 i32) (local $ly1 i32)
    (local $lh i32) (local $off i32) (local $gh i32) (local $inCnt i32) (local $gdCnt i32)
    (local $bx0 i32) (local $by0 i32) (local $bx1 i32) (local $by1 i32)
    (local $vv v128) (local $vn v128) (local $ve v128) (local $vl0 v128) (local $vc0 v128) (local $vl1 v128) (local $vc1 v128)

    (if (i32.or (i32.lt_s (local.get $w) (i32.const 3)) (i32.lt_s (local.get $h) (i32.const 3)))
      (then (return (i32.const 0))))

    ;; Premultiply non-opaque samples in place (skipping 4-pixel opaque blocks via SIMD).
    (local.set $n (i32.mul (local.get $w) (local.get $h)))
    (local.set $i (i32.const 0))
    (local.set $ve (v128.const i32x4 -16777216 -16777216 -16777216 -16777216))
    (block $dpm16 (loop $Lpm16
      (br_if $dpm16 (i32.gt_s (i32.add (local.get $i) (i32.const 16)) (local.get $n)))
      (local.set $p (i32.add (local.get $rgba) (i32.shl (local.get $i) (i32.const 2))))
      (if (i32x4.all_true
            (i32x4.eq
              (v128.and
                (v128.and (v128.and (v128.load (local.get $p)) (v128.load offset=16 (local.get $p)))
                          (v128.and (v128.load offset=32 (local.get $p)) (v128.load offset=48 (local.get $p))))
                (local.get $ve))
              (local.get $ve)))
        (then (local.set $i (i32.add (local.get $i) (i32.const 16))) (br $Lpm16)))
      (local.set $k (i32.const 0))
      (loop $Lpm16k
        (local.set $q (i32.add (local.get $p) (i32.shl (local.get $k) (i32.const 2))))
        (local.set $c (i32.load (local.get $q)))
        (local.set $a (i32.shr_u (local.get $c) (i32.const 24)))
        (if (i32.ne (local.get $a) (i32.const 255))
          (then
            (i32.store (local.get $q)
              (i32.or
                (i32.or (i32.shl (local.get $a) (i32.const 24))
                        (i32.shl (i32.div_u (i32.add (i32.mul (i32.and (i32.shr_u (local.get $c) (i32.const 16)) (i32.const 255)) (local.get $a)) (i32.const 127)) (i32.const 255)) (i32.const 16)))
                (i32.or (i32.shl (i32.div_u (i32.add (i32.mul (i32.and (i32.shr_u (local.get $c) (i32.const 8)) (i32.const 255)) (local.get $a)) (i32.const 127)) (i32.const 255)) (i32.const 8))
                        (i32.div_u (i32.add (i32.mul (i32.and (local.get $c) (i32.const 255)) (local.get $a)) (i32.const 127)) (i32.const 255)))))))
        (br_if $Lpm16k (i32.lt_u (local.tee $k (i32.add (local.get $k) (i32.const 1))) (i32.const 16))))
      (local.set $i (i32.add (local.get $i) (i32.const 16)))
      (br $Lpm16)))
    (block $dpm4 (loop $Lpm4
      (br_if $dpm4 (i32.gt_s (i32.add (local.get $i) (i32.const 4)) (local.get $n)))
      (local.set $p (i32.add (local.get $rgba) (i32.shl (local.get $i) (i32.const 2))))
      (local.set $vv (v128.load (local.get $p)))
      (if (i32.eqz (i32x4.all_true (i32x4.eq (v128.and (local.get $vv) (v128.const i32x4 -16777216 -16777216 -16777216 -16777216))
                                             (v128.const i32x4 -16777216 -16777216 -16777216 -16777216))))
        (then
          (local.set $k (i32.const 0))
          (loop $Lpmk
            (local.set $q (i32.add (local.get $p) (i32.shl (local.get $k) (i32.const 2))))
            (local.set $c (i32.load (local.get $q)))
            (local.set $a (i32.shr_u (local.get $c) (i32.const 24)))
            (if (i32.ne (local.get $a) (i32.const 255))
              (then
                (i32.store (local.get $q)
                  (i32.or
                    (i32.or (i32.shl (local.get $a) (i32.const 24))
                            (i32.shl (i32.div_u (i32.add (i32.mul (i32.and (i32.shr_u (local.get $c) (i32.const 16)) (i32.const 255)) (local.get $a)) (i32.const 127)) (i32.const 255)) (i32.const 16)))
                    (i32.or (i32.shl (i32.div_u (i32.add (i32.mul (i32.and (i32.shr_u (local.get $c) (i32.const 8)) (i32.const 255)) (local.get $a)) (i32.const 127)) (i32.const 255)) (i32.const 8))
                            (i32.div_u (i32.add (i32.mul (i32.and (local.get $c) (i32.const 255)) (local.get $a)) (i32.const 127)) (i32.const 255)))))))
            (br_if $Lpmk (i32.lt_u (local.tee $k (i32.add (local.get $k) (i32.const 1))) (i32.const 4))))))
      (local.set $i (i32.add (local.get $i) (i32.const 4)))
      (br $Lpm4)))
    (block $dpm1 (loop $Lpm1
      (br_if $dpm1 (i32.ge_s (local.get $i) (local.get $n)))
      (local.set $q (i32.add (local.get $rgba) (i32.shl (local.get $i) (i32.const 2))))
      (local.set $c (i32.load (local.get $q)))
      (local.set $a (i32.shr_u (local.get $c) (i32.const 24)))
      (if (i32.ne (local.get $a) (i32.const 255))
        (then
          (i32.store (local.get $q)
            (i32.or
              (i32.or (i32.shl (local.get $a) (i32.const 24))
                      (i32.shl (i32.div_u (i32.add (i32.mul (i32.and (i32.shr_u (local.get $c) (i32.const 16)) (i32.const 255)) (local.get $a)) (i32.const 127)) (i32.const 255)) (i32.const 16)))
              (i32.or (i32.shl (i32.div_u (i32.add (i32.mul (i32.and (i32.shr_u (local.get $c) (i32.const 8)) (i32.const 255)) (local.get $a)) (i32.const 127)) (i32.const 255)) (i32.const 8))
                      (i32.div_u (i32.add (i32.mul (i32.and (local.get $c) (i32.const 255)) (local.get $a)) (i32.const 127)) (i32.const 255)))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $Lpm1)))

    ;; Scratch layout matching text-ink.c
    (local.set $end (i32.add (local.get $scratch) (local.get $room)))
    (local.set $F0 (local.get $scratch))
    (local.set $F1 (i32.add (local.get $F0) (i32.add (local.get $w) (i32.const 16))))
    (local.set $F2 (i32.add (local.get $F1) (i32.add (local.get $w) (i32.const 16))))
    (local.set $a0 (i32.add (local.get $F2) (i32.add (local.get $w) (i32.const 16))))
    (local.set $a1 (i32.add (local.get $a0) (local.get $w)))
    (local.set $a2 (i32.add (local.get $a1) (local.get $w)))
    (local.set $cand0 (i32.add (local.get $a2) (local.get $w)))
    (local.set $rowRuns (i32.and (i32.add (i32.add (local.get $cand0) (i32.shl (local.get $w) (i32.const 1))) (i32.const 19)) (i32.const -4)))
    (local.set $runs (i32.add (local.get $rowRuns) (i32.shl (i32.add (local.get $h) (i32.const 1)) (i32.const 2))))
    (local.set $maxRuns (i32.div_s (i32.sub (local.get $end) (local.get $runs)) (i32.const 16)))
    (if (i32.lt_s (local.get $maxRuns) (local.get $w))
      (then (return (i32.const -1))))

    (memory.fill (local.get $F0) (i32.const 0) (i32.add (local.get $w) (i32.const 16)))
    (call $row_pairs (local.get $rgba)
      (if (result i32) (i32.gt_s (local.get $h) (i32.const 1)) (then (i32.add (local.get $rgba) (i32.shl (local.get $w) (i32.const 2)))) (else (i32.const 0)))
      (local.get $w) (local.get $F1))
    (if (i32.gt_s (local.get $h) (i32.const 1))
      (then
        (call $row_pairs (i32.add (local.get $rgba) (i32.shl (local.get $w) (i32.const 2)))
          (if (result i32) (i32.gt_s (local.get $h) (i32.const 2)) (then (i32.add (local.get $rgba) (i32.shl (local.get $w) (i32.const 3)))) (else (i32.const 0)))
          (local.get $w) (local.get $F2))))
    (memory.fill (local.get $a0) (i32.const 0) (local.get $w))
    (call $step_row2 (i32.const 0) (local.get $F1) (local.get $w) (local.get $a1))

    (local.set $nr (i32.const 0))
    (local.set $y (i32.const 0))
    (loop $Ly
      (if (i32.lt_s (i32.add (local.get $y) (i32.const 1)) (local.get $h))
        (then (call $step_row2 (local.get $F1) (local.get $F2) (local.get $w) (local.get $a2)))
        (else (memory.fill (local.get $a2) (i32.const 0) (local.get $w))))

      ;; Candidate samples on row y: 16-byte SIMD pass + scalar tail
      (i32.store8 (local.get $cand0) (i32.const 0))
      (i32.store8 (i32.add (local.get $cand0) (i32.sub (local.get $w) (i32.const 1))) (i32.const 0))
      (local.set $x (i32.const 1))
      (block $dc16 (loop $Lc16
        (br_if $dc16 (i32.gt_s (i32.add (local.get $x) (i32.const 17)) (local.get $w)))
        (local.set $vn
          (v128.or
            (v128.or (v128.load (i32.sub (i32.add (local.get $a1) (local.get $x)) (i32.const 1)))
                     (v128.load (i32.add (local.get $a1) (local.get $x))))
            (v128.or (v128.load offset=1 (i32.add (local.get $a1) (local.get $x)))
                     (v128.or (v128.load (i32.add (local.get $a0) (local.get $x)))
                              (v128.load (i32.add (local.get $a2) (local.get $x)))))))
        (local.set $vl1 (v128.load (i32.sub (i32.add (local.get $F1) (local.get $x)) (i32.const 1))))
        (local.set $vc1 (v128.load (i32.add (local.get $F1) (local.get $x))))
        (local.set $vl0 (v128.load (i32.sub (i32.add (local.get $F0) (local.get $x)) (i32.const 1))))
        (local.set $vc0 (v128.load (i32.add (local.get $F0) (local.get $x))))
        (local.set $ve
          (v128.or
            (v128.or
              (v128.and (v128.or (local.get $vl1) (local.get $vc1)) (v128.const i8x16 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4))
              (v128.and (v128.or (local.get $vc0) (local.get $vc1)) (v128.const i8x16 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8 8)))
            (v128.or
              (v128.and (v128.or (local.get $vl0) (local.get $vc1)) (v128.const i8x16 16 16 16 16 16 16 16 16 16 16 16 16 16 16 16 16))
              (v128.and (v128.or (local.get $vc0) (local.get $vl1)) (v128.const i8x16 32 32 32 32 32 32 32 32 32 32 32 32 32 32 32 32)))))
        (v128.store (i32.add (local.get $cand0) (local.get $x))
          (v128.and
            (v128.and (i8x16.ne (local.get $ve) (v128.const i32x4 0 0 0 0))
                      (v128.const i8x16 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1))
            (local.get $vn)))
        (local.set $x (i32.add (local.get $x) (i32.const 16)))
        (br $Lc16)))
      (block $dc1 (loop $Lc1
        (br_if $dc1 (i32.ge_s (local.get $x) (i32.sub (local.get $w) (i32.const 1))))
        (local.set $a
          (i32.or
            (i32.or (i32.load8_u (i32.sub (i32.add (local.get $a1) (local.get $x)) (i32.const 1)))
                    (i32.load8_u (i32.add (local.get $a1) (local.get $x))))
            (i32.or (i32.load8_u offset=1 (i32.add (local.get $a1) (local.get $x)))
                    (i32.or (i32.load8_u (i32.add (local.get $a0) (local.get $x)))
                            (i32.load8_u (i32.add (local.get $a2) (local.get $x)))))))
        (local.set $p (i32.load8_u (i32.sub (i32.add (local.get $F1) (local.get $x)) (i32.const 1))))
        (local.set $q (i32.load8_u (i32.add (local.get $F1) (local.get $x))))
        (local.set $u (i32.load8_u (i32.sub (i32.add (local.get $F0) (local.get $x)) (i32.const 1))))
        (local.set $v (i32.load8_u (i32.add (local.get $F0) (local.get $x))))
        (local.set $b
          (i32.or
            (i32.or (i32.and (i32.or (local.get $p) (local.get $q)) (i32.const 4))
                    (i32.and (i32.or (local.get $v) (local.get $q)) (i32.const 8)))
            (i32.or (i32.and (i32.or (local.get $u) (local.get $q)) (i32.const 16))
                    (i32.and (i32.or (local.get $v) (local.get $p)) (i32.const 32)))))
        (i32.store8 (i32.add (local.get $cand0) (local.get $x))
          (i32.and (i32.ne (local.get $b) (i32.const 0)) (i32.ne (local.get $a) (i32.const 0))))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br $Lc1)))

      ;; Extract candidate runs on row y (skipping 16-sample empty blocks via i8x16.bitmask)
      (i32.store (i32.add (local.get $rowRuns) (i32.shl (local.get $y) (i32.const 2))) (local.get $nr))
      (local.set $row (i32.add (local.get $rgba) (i32.shl (i32.mul (local.get $y) (local.get $w)) (i32.const 2))))
      (local.set $open (i32.const 0))
      (local.set $s0 (i32.const 0))
      (local.set $last (i32.const -2))
      (local.set $col (i32.const 0))
      (local.set $x0 (i32.const 0))
      (block $dr16 (loop $Lr16
        (br_if $dr16 (i32.ge_s (local.get $x0) (local.get $w)))
        (if (i32.le_s (i32.add (local.get $x0) (i32.const 16)) (local.get $w))
          (then
            (local.set $m (i8x16.bitmask (i8x16.ne (v128.load (i32.add (local.get $cand0) (local.get $x0))) (v128.const i32x4 0 0 0 0)))))
          (else
            (local.set $m (i32.const 0))
            (local.set $x (local.get $x0))
            (loop $Lrt
              (if (i32.load8_u (i32.add (local.get $cand0) (local.get $x)))
                (then (local.set $m (i32.or (local.get $m) (i32.shl (i32.const 1) (i32.sub (local.get $x) (local.get $x0)))))))
              (br_if $Lrt (i32.lt_s (local.tee $x (i32.add (local.get $x) (i32.const 1))) (local.get $w))))))
        (block $dm (loop $Lm
          (br_if $dm (i32.eqz (local.get $m)))
          (local.set $x (i32.add (local.get $x0) (i32.ctz (local.get $m))))
          (local.set $m (i32.and (local.get $m) (i32.sub (local.get $m) (i32.const 1))))
          (local.set $c (i32.load (i32.add (local.get $row) (i32.shl (local.get $x) (i32.const 2)))))
          (if (i32.and (local.get $open) (i32.and (i32.eq (local.get $x) (i32.add (local.get $last) (i32.const 1))) (i32.eq (local.get $c) (local.get $col))))
            (then (local.set $last (local.get $x)))
            (else
              (if (local.get $open)
                (then
                  (if (i32.ge_s (local.get $nr) (local.get $maxRuns)) (then (return (i32.const -1))))
                  (local.set $tc (i32.const 0))
                  (local.set $u (local.get $s0))
                  (loop $Ltc1
                    (local.set $tc (i32.add (local.get $tc) (i32.load8_u (i32.add (local.get $a1) (local.get $u)))))
                    (br_if $Ltc1 (i32.le_s (local.tee $u (i32.add (local.get $u) (i32.const 1))) (local.get $last))))
                  (local.set $p (i32.add (local.get $runs) (i32.shl (local.get $nr) (i32.const 4))))
                  (i32.store16 (local.get $p) (local.get $s0))
                  (i32.store16 offset=2 (local.get $p) (local.get $last))
                  (i32.store16 offset=4 (local.get $p) (local.get $y))
                  (i32.store16 offset=6 (local.get $p) (local.get $tc))
                  (i32.store offset=8 (local.get $p) (local.get $col))
                  (i32.store offset=12 (local.get $p) (local.get $nr))
                  (local.set $nr (i32.add (local.get $nr) (i32.const 1)))))
              (local.set $open (i32.const 1))
              (local.set $s0 (local.get $x))
              (local.set $last (local.get $x))
              (local.set $col (local.get $c))))
          (br $Lm)))
        (local.set $x0 (i32.add (local.get $x0) (i32.const 16)))
        (br $Lr16)))
      (if (local.get $open)
        (then
          (if (i32.ge_s (local.get $nr) (local.get $maxRuns)) (then (return (i32.const -1))))
          (local.set $tc (i32.const 0))
          (local.set $u (local.get $s0))
          (loop $Ltc2
            (local.set $tc (i32.add (local.get $tc) (i32.load8_u (i32.add (local.get $a1) (local.get $u)))))
            (br_if $Ltc2 (i32.le_s (local.tee $u (i32.add (local.get $u) (i32.const 1))) (local.get $last))))
          (local.set $p (i32.add (local.get $runs) (i32.shl (local.get $nr) (i32.const 4))))
          (i32.store16 (local.get $p) (local.get $s0))
          (i32.store16 offset=2 (local.get $p) (local.get $last))
          (i32.store16 offset=4 (local.get $p) (local.get $y))
          (i32.store16 offset=6 (local.get $p) (local.get $tc))
          (i32.store offset=8 (local.get $p) (local.get $col))
          (i32.store offset=12 (local.get $p) (local.get $nr))
          (local.set $nr (i32.add (local.get $nr) (i32.const 1)))))

      ;; Join 8-connected runs of identical colour with row y-1
      (if (i32.gt_s (local.get $y) (i32.const 0))
        (then
          (local.set $a (i32.load (i32.add (local.get $rowRuns) (i32.shl (i32.sub (local.get $y) (i32.const 1)) (i32.const 2)))))
          (local.set $ae (i32.load (i32.add (local.get $rowRuns) (i32.shl (local.get $y) (i32.const 2)))))
          (local.set $b (local.get $ae))
          (block $djb (loop $Ljb
            (br_if $djb (i32.ge_s (local.get $b) (local.get $nr)))
            (local.set $q (i32.add (local.get $runs) (i32.shl (local.get $b) (i32.const 4))))
            (block $dja (loop $Lja
              (br_if $dja (i32.ge_s (local.get $a) (local.get $ae)))
              (br_if $dja (i32.ge_s (i32.add (i32.load16_u offset=2 (i32.add (local.get $runs) (i32.shl (local.get $a) (i32.const 4)))) (i32.const 1))
                                    (i32.load16_u (local.get $q))))
              (local.set $a (i32.add (local.get $a) (i32.const 1)))
              (br $Lja)))
            (local.set $u (local.get $a))
            (block $dja2 (loop $Lja2
              (br_if $dja2 (i32.ge_s (local.get $u) (local.get $ae)))
              (local.set $p (i32.add (local.get $runs) (i32.shl (local.get $u) (i32.const 4))))
              (br_if $dja2 (i32.gt_s (i32.load16_u (local.get $p)) (i32.add (i32.load16_u offset=2 (local.get $q)) (i32.const 1))))
              (if (i32.eq (i32.load offset=8 (local.get $p)) (i32.load offset=8 (local.get $q)))
                (then
                  (local.set $ra (call $run_root (local.get $runs) (local.get $u)))
                  (local.set $rb (call $run_root (local.get $runs) (local.get $b)))
                  (if (i32.ne (local.get $ra) (local.get $rb))
                    (then
                      (if (i32.lt_s (local.get $ra) (local.get $rb))
                        (then (i32.store offset=12 (i32.add (local.get $runs) (i32.shl (local.get $rb) (i32.const 4))) (local.get $ra)))
                        (else (i32.store offset=12 (i32.add (local.get $runs) (i32.shl (local.get $ra) (i32.const 4))) (local.get $rb))))))))
              (local.set $u (i32.add (local.get $u) (i32.const 1)))
              (br $Lja2)))
            (local.set $b (i32.add (local.get $b) (i32.const 1)))
            (br $Ljb)))))

      ;; Rotate ring buffers a0/a1/a2 and F0/F1/F2, compute rowPairs for y+2
      (local.set $p (local.get $a0)) (local.set $a0 (local.get $a1)) (local.set $a1 (local.get $a2)) (local.set $a2 (local.get $p))
      (local.set $p (local.get $F0)) (local.set $F0 (local.get $F1)) (local.set $F1 (local.get $F2)) (local.set $F2 (local.get $p))
      (if (i32.lt_s (i32.add (local.get $y) (i32.const 2)) (local.get $h))
        (then
          (call $row_pairs
            (i32.add (local.get $rgba) (i32.shl (i32.mul (i32.add (local.get $y) (i32.const 2)) (local.get $w)) (i32.const 2)))
            (if (result i32) (i32.lt_s (i32.add (local.get $y) (i32.const 3)) (local.get $h))
              (then (i32.add (local.get $rgba) (i32.shl (i32.mul (i32.add (local.get $y) (i32.const 3)) (local.get $w)) (i32.const 2))))
              (else (i32.const 0)))
            (local.get $w) (local.get $F2)))
        (else (memory.fill (local.get $F2) (i32.const 0) (i32.add (local.get $w) (i32.const 16)))))
      (br_if $Ly (i32.lt_s (local.tee $y (i32.add (local.get $y) (i32.const 1))) (local.get $h))))

    (i32.store (i32.add (local.get $rowRuns) (i32.shl (local.get $h) (i32.const 2))) (local.get $nr))

    ;; Build Stroke[0..ns-1] after runs[0..nr-1]
    (local.set $st (i32.and (i32.add (i32.add (local.get $runs) (i32.shl (local.get $nr) (i32.const 4))) (i32.const 3)) (i32.const -4)))
    (local.set $maxStrokes (i32.div_s (i32.sub (local.get $end) (local.get $st)) (i32.const 32)))
    (local.set $ns (i32.const 0))

    (local.set $i (i32.const 0))
    (block $drp (loop $Lrp
      (br_if $drp (i32.ge_s (local.get $i) (local.get $nr)))
      (i32.store offset=12 (i32.add (local.get $runs) (i32.shl (local.get $i) (i32.const 4))) (call $run_root (local.get $runs) (local.get $i)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $Lrp)))

    (local.set $i (i32.const 0))
    (block $dsi (loop $Lsi
      (br_if $dsi (i32.ge_s (local.get $i) (local.get $nr)))
      (local.set $p (i32.add (local.get $runs) (i32.shl (local.get $i) (i32.const 4))))
      (if (i32.eq (i32.load offset=12 (local.get $p)) (local.get $i))
        (then
          (if (i32.ge_s (local.get $ns) (local.get $maxStrokes)) (then (return (i32.const -1))))
          (local.set $q (i32.add (local.get $st) (i32.shl (local.get $ns) (i32.const 5))))
          (i32.store (local.get $q) (i32.load16_u (local.get $p)))
          (i32.store offset=4 (local.get $q) (i32.load16_u offset=4 (local.get $p)))
          (i32.store offset=8 (local.get $q) (i32.load16_u offset=2 (local.get $p)))
          (i32.store offset=12 (local.get $q) (i32.load16_u offset=4 (local.get $p)))
          (i32.store offset=16 (local.get $q) (i32.const 0))
          (i32.store offset=20 (local.get $q) (i32.const 0))
          (i32.store offset=24 (local.get $q) (i32.load offset=8 (local.get $p)))
          (i32.store offset=28 (local.get $q) (local.get $ns))
          (i32.store offset=12 (local.get $p) (i32.sub (i32.const -1) (local.get $ns)))
          (local.set $ns (i32.add (local.get $ns) (i32.const 1)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $Lsi)))

    (local.set $i (i32.const 0))
    (block $dsa (loop $Lsa
      (br_if $dsa (i32.ge_s (local.get $i) (local.get $nr)))
      (local.set $p (i32.add (local.get $runs) (i32.shl (local.get $i) (i32.const 4))))
      (local.set $ra (i32.load offset=12 (local.get $p)))
      (local.set $ra (select (local.get $ra) (local.get $i) (i32.ge_s (local.get $ra) (i32.const 0))))
      (local.set $q (i32.add (local.get $st) (i32.shl (i32.sub (i32.const -1) (i32.load offset=12 (i32.add (local.get $runs) (i32.shl (local.get $ra) (i32.const 4))))) (i32.const 5))))
      (local.set $x (i32.load16_u (local.get $p)))
      (if (i32.lt_s (local.get $x) (i32.load (local.get $q))) (then (i32.store (local.get $q) (local.get $x))))
      (local.set $u (i32.load16_u offset=2 (local.get $p)))
      (if (i32.gt_s (local.get $u) (i32.load offset=8 (local.get $q))) (then (i32.store offset=8 (local.get $q) (local.get $u))))
      (local.set $y (i32.load16_u offset=4 (local.get $p)))
      (if (i32.gt_s (local.get $y) (i32.load offset=12 (local.get $q))) (then (i32.store offset=12 (local.get $q) (local.get $y))))
      (i32.store offset=16 (local.get $q) (i32.add (i32.load offset=16 (local.get $q)) (i32.add (i32.sub (local.get $u) (local.get $x)) (i32.const 1))))
      (i32.store offset=20 (local.get $q) (i32.add (i32.load offset=20 (local.get $q)) (i32.load16_u offset=6 (local.get $p))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $Lsa)))

    ;; Save allCol and allArea, then compact glyph-like strokes into st[0..ng-1]
    (local.set $allCol (i32.add (local.get $st) (i32.shl (local.get $ns) (i32.const 5))))
    (local.set $allArea (i32.add (local.get $allCol) (i32.shl (local.get $ns) (i32.const 2))))
    (if (i32.gt_u (i32.add (local.get $allArea) (i32.shl (local.get $ns) (i32.const 2))) (local.get $end))
      (then (return (i32.const -1))))

    (local.set $i (i32.const 0))
    (block $dac (loop $Lac
      (br_if $dac (i32.ge_s (local.get $i) (local.get $ns)))
      (local.set $q (i32.add (local.get $st) (i32.shl (local.get $i) (i32.const 5))))
      (i32.store (i32.add (local.get $allCol) (i32.shl (local.get $i) (i32.const 2))) (i32.load offset=24 (local.get $q)))
      (i32.store (i32.add (local.get $allArea) (i32.shl (local.get $i) (i32.const 2))) (i32.load offset=16 (local.get $q)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $Lac)))

    (local.set $ng (i32.const 0))
    (local.set $i (i32.const 0))
    (block $dng (loop $Lng
      (br_if $dng (i32.ge_s (local.get $i) (local.get $ns)))
      (local.set $p (i32.add (local.get $st) (i32.shl (local.get $i) (i32.const 5))))
      (local.set $lh (i32.add (i32.sub (i32.load offset=12 (local.get $p)) (i32.load offset=4 (local.get $p))) (i32.const 1)))
      (local.set $u (i32.add (i32.sub (i32.load offset=8 (local.get $p)) (i32.load (local.get $p))) (i32.const 1)))
      (local.set $a (i32.load offset=16 (local.get $p)))
      (if (i32.eqz
            (i32.or
              (i32.or
                (i32.or (i32.lt_s (local.get $lh) (i32.const 3)) (i32.gt_s (local.get $lh) (i32.const 256)))
                (i32.or (i32.gt_s (local.get $u) (i32.add (i32.shl (local.get $lh) (i32.const 2)) (i32.const 16)))
                        (i32.lt_s (local.get $a) (i32.const 3))))
              (i32.or
                (i32.lt_s (i32.mul (i32.load offset=20 (local.get $p)) (i32.const 100)) (i32.mul (local.get $a) (i32.const 30)))
                (i32.or
                  (i32.and (i32.ne (local.get $cutTop) (i32.const 0)) (i32.eqz (i32.load offset=4 (local.get $p))))
                  (i32.and (i32.ne (local.get $cutBottom) (i32.const 0)) (i32.eq (i32.load offset=12 (local.get $p)) (i32.sub (local.get $h) (i32.const 1))))))))
        (then
          (local.set $q (i32.add (local.get $st) (i32.shl (local.get $ng) (i32.const 5))))
          (if (i32.ne (local.get $q) (local.get $p))
            (then
              (v128.store (local.get $q) (v128.load (local.get $p)))
              (v128.store offset=16 (local.get $q) (v128.load offset=16 (local.get $p)))))
          (i32.store offset=28 (local.get $q) (local.get $ng))
          (local.set $ng (i32.add (local.get $ng) (i32.const 1)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $Lng)))

    ;; Join overlapping glyph strokes of same colour into candidate lines
    (local.set $a (i32.const 0))
    (block $dla (loop $Lla
      (br_if $dla (i32.ge_s (local.get $a) (local.get $ng)))
      (local.set $p (i32.add (local.get $st) (i32.shl (local.get $a) (i32.const 5))))
      (local.set $b (i32.add (local.get $a) (i32.const 1)))
      (block $dlb (loop $Llb
        (br_if $dlb (i32.ge_s (local.get $b) (local.get $ng)))
        (local.set $q (i32.add (local.get $st) (i32.shl (local.get $b) (i32.const 5))))
        (br_if $dlb (i32.gt_s (i32.load offset=4 (local.get $q)) (i32.load offset=12 (local.get $p))))
        (if (i32.eq (i32.load offset=24 (local.get $p)) (i32.load offset=24 (local.get $q)))
          (then
            (local.set $u (i32.add (i32.sub (i32.load offset=12 (local.get $p)) (i32.load offset=4 (local.get $p))) (i32.const 1)))
            (local.set $v (i32.add (i32.sub (i32.load offset=12 (local.get $q)) (i32.load offset=4 (local.get $q))) (i32.const 1)))
            (if (i32.and (i32.le_s (local.get $u) (i32.shl (local.get $v) (i32.const 1)))
                         (i32.le_s (local.get $v) (i32.shl (local.get $u) (i32.const 1))))
              (then
                (local.set $lh
                  (i32.add
                    (i32.sub
                      (select (i32.load offset=12 (local.get $p)) (i32.load offset=12 (local.get $q)) (i32.lt_s (i32.load offset=12 (local.get $p)) (i32.load offset=12 (local.get $q))))
                      (select (i32.load offset=4 (local.get $p)) (i32.load offset=4 (local.get $q)) (i32.gt_s (i32.load offset=4 (local.get $p)) (i32.load offset=4 (local.get $q)))))
                    (i32.const 1)))
                (if (i32.ge_s (i32.mul (local.get $lh) (i32.const 100))
                              (i32.mul (select (local.get $u) (local.get $v) (i32.lt_s (local.get $u) (local.get $v))) (i32.const 40)))
                  (then
                    (local.set $off
                      (if (result i32) (i32.gt_s (i32.load (local.get $q)) (i32.load offset=8 (local.get $p)))
                        (then (i32.sub (i32.load (local.get $q)) (i32.load offset=8 (local.get $p))))
                        (else (if (result i32) (i32.gt_s (i32.load (local.get $p)) (i32.load offset=8 (local.get $q)))
                          (then (i32.sub (i32.load (local.get $p)) (i32.load offset=8 (local.get $q))))
                          (else (i32.const 0))))))
                    (if (i32.le_s (i32.mul (local.get $off) (i32.const 100))
                                  (i32.add (i32.mul (select (local.get $u) (local.get $v) (i32.gt_s (local.get $u) (local.get $v))) (i32.const 300)) (i32.const 200)))
                      (then
                        (local.set $ra (local.get $a))
                        (block $dra (loop $Lra
                          (local.set $i (i32.load offset=28 (i32.add (local.get $st) (i32.shl (local.get $ra) (i32.const 5)))))
                          (br_if $dra (i32.eq (local.get $i) (local.get $ra)))
                          (local.set $j (i32.load offset=28 (i32.add (local.get $st) (i32.shl (local.get $i) (i32.const 5)))))
                          (i32.store offset=28 (i32.add (local.get $st) (i32.shl (local.get $ra) (i32.const 5))) (local.get $j))
                          (local.set $ra (local.get $j))
                          (br $Lra)))
                        (local.set $rb (local.get $b))
                        (block $drb (loop $Lrb
                          (local.set $i (i32.load offset=28 (i32.add (local.get $st) (i32.shl (local.get $rb) (i32.const 5)))))
                          (br_if $drb (i32.eq (local.get $i) (local.get $rb)))
                          (local.set $j (i32.load offset=28 (i32.add (local.get $st) (i32.shl (local.get $i) (i32.const 5)))))
                          (i32.store offset=28 (i32.add (local.get $st) (i32.shl (local.get $rb) (i32.const 5))) (local.get $j))
                          (local.set $rb (local.get $j))
                          (br $Lrb)))
                        (if (i32.ne (local.get $ra) (local.get $rb))
                          (then
                            (if (i32.lt_s (local.get $ra) (local.get $rb))
                              (then (i32.store offset=28 (i32.add (local.get $st) (i32.shl (local.get $rb) (i32.const 5))) (local.get $ra)))
                              (else (i32.store offset=28 (i32.add (local.get $st) (i32.shl (local.get $ra) (i32.const 5))) (local.get $rb))))))))))))))
        (local.set $b (i32.add (local.get $b) (i32.const 1)))
        (br $Llb)))
      (local.set $a (i32.add (local.get $a) (i32.const 1)))
      (br $Lla)))

    ;; Member lists per line root
    (local.set $keep (i32.add (local.get $allArea) (i32.shl (local.get $ns) (i32.const 2))))
    (local.set $gArea (i32.add (local.get $keep) (i32.shl (local.get $ng) (i32.const 2))))
    (local.set $first (i32.add (local.get $gArea) (i32.shl (local.get $ng) (i32.const 2))))
    (local.set $mem (i32.add (local.get $first) (i32.shl (local.get $ng) (i32.const 2))))
    (local.set $slots (i32.add (local.get $mem) (i32.shl (local.get $ng) (i32.const 2))))
    (if (i32.gt_u (local.get $slots) (local.get $end))
      (then (return (i32.const -1))))

    (local.set $i (i32.const 0))
    (block $dm1 (loop $Lm1
      (br_if $dm1 (i32.ge_s (local.get $i) (local.get $ng)))
      (local.set $p (i32.add (local.get $st) (i32.shl (local.get $i) (i32.const 5))))
      (i32.store (i32.add (local.get $gArea) (i32.shl (local.get $i) (i32.const 2))) (i32.load offset=16 (local.get $p)))
      (i32.store offset=20 (local.get $p) (i32.const 0))
      (i32.store (i32.add (local.get $first) (i32.shl (local.get $i) (i32.const 2))) (i32.const 0))
      (i32.store (i32.add (local.get $keep) (i32.shl (local.get $i) (i32.const 2))) (i32.const 0))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $Lm1)))

    (local.set $i (i32.const 0))
    (block $dm2 (loop $Lm2
      (br_if $dm2 (i32.ge_s (local.get $i) (local.get $ng)))
      (local.set $ra (local.get $i))
      (block $dmr (loop $Lmr
        (local.set $j (i32.load offset=28 (i32.add (local.get $st) (i32.shl (local.get $ra) (i32.const 5)))))
        (br_if $dmr (i32.eq (local.get $j) (local.get $ra)))
        (local.set $ra (local.get $j))
        (br $Lmr)))
      (local.set $q (i32.add (local.get $st) (i32.shl (local.get $ra) (i32.const 5))))
      (i32.store offset=20 (local.get $q) (i32.add (i32.load offset=20 (local.get $q)) (i32.const 1)))
      (i32.store offset=16 (i32.add (local.get $st) (i32.shl (local.get $i) (i32.const 5))) (local.get $ra))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $Lm2)))

    (local.set $i (i32.const 0))
    (local.set $u (i32.const 0))
    (block $dm3 (loop $Lm3
      (br_if $dm3 (i32.ge_s (local.get $i) (local.get $ng)))
      (local.set $p (i32.add (local.get $st) (i32.shl (local.get $i) (i32.const 5))))
      (if (i32.eq (i32.load offset=28 (local.get $p)) (local.get $i))
        (then
          (i32.store (i32.add (local.get $first) (i32.shl (local.get $i) (i32.const 2))) (local.get $u))
          (local.set $u (i32.add (local.get $u) (i32.load offset=20 (local.get $p))))
          (i32.store offset=20 (local.get $p) (i32.const 0))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $Lm3)))

    (local.set $i (i32.const 0))
    (block $dm4 (loop $Lm4
      (br_if $dm4 (i32.ge_s (local.get $i) (local.get $ng)))
      (local.set $ra (i32.load offset=16 (i32.add (local.get $st) (i32.shl (local.get $i) (i32.const 5)))))
      (local.set $q (i32.add (local.get $st) (i32.shl (local.get $ra) (i32.const 5))))
      (local.set $u (i32.load offset=20 (local.get $q)))
      (i32.store (i32.add (local.get $mem) (i32.shl (i32.add (i32.load (i32.add (local.get $first) (i32.shl (local.get $ra) (i32.const 2)))) (local.get $u)) (i32.const 2))) (local.get $i))
      (i32.store offset=20 (local.get $q) (i32.add (local.get $u) (i32.const 1)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $Lm4)))

    ;; order[64] lives at (scratch + 3) & -4 inside dead F0..runs scratch (>= 344 bytes whenever m0 >= 5)
    (local.set $order (i32.and (i32.add (local.get $scratch) (i32.const 3)) (i32.const -4)))
    (local.set $nb (i32.const 0))
    (local.set $kept (i32.const 0))
    (local.set $cap (i32.const 0))
    (local.set $pass (i32.const 0))

    (loop $Lpass
      (if (i32.eq (local.get $pass) (i32.const 1))
        (then
          (local.set $cap (i32.const 8))
          (block $dcap (loop $Lcap
            (br_if $dcap (i32.ge_s (local.get $cap) (i32.shl (local.get $kept) (i32.const 1))))
            (local.set $cap (i32.shl (local.get $cap) (i32.const 1)))
            (br $Lcap)))
          (if (i32.gt_u (i32.add (local.get $slots) (i32.shl (local.get $cap) (i32.const 4))) (local.get $end))
            (then (return (i32.const -1))))
          (memory.fill (local.get $slots) (i32.const 0) (i32.shl (local.get $cap) (i32.const 4)))
          (local.set $i (i32.const 0))
          (block $ds1 (loop $Ls1
            (br_if $ds1 (i32.ge_s (local.get $i) (local.get $ng)))
            (if (i32.load (i32.add (local.get $keep) (i32.shl (local.get $i) (i32.const 2))))
              (then
                (local.set $col (i32.load offset=24 (i32.add (local.get $st) (i32.shl (local.get $i) (i32.const 5)))))
                (local.set $p (call $share_of (local.get $slots) (local.get $cap) (local.get $col)))
                (i32.store (local.get $p) (i32.const 1))
                (i32.store offset=4 (local.get $p) (local.get $col))))
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $Ls1)))
          (local.set $j (i32.const 0))
          (block $ds2 (loop $Ls2
            (br_if $ds2 (i32.ge_s (local.get $j) (local.get $ns)))
            (local.set $a (i32.load (i32.add (local.get $allArea) (i32.shl (local.get $j) (i32.const 2)))))
            (if (i32.ge_s (local.get $a) (i32.const 3))
              (then
                (local.set $p (call $share_of (local.get $slots) (local.get $cap) (i32.load (i32.add (local.get $allCol) (i32.shl (local.get $j) (i32.const 2))))))
                (if (i32.load (local.get $p))
                  (then (i32.store offset=8 (local.get $p) (i32.add (i32.load offset=8 (local.get $p)) (local.get $a)))))))
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $Ls2)))
          (local.set $j (i32.const 0))
          (block $ds3 (loop $Ls3
            (br_if $ds3 (i32.ge_s (local.get $j) (local.get $ng)))
            (local.set $q (i32.add (local.get $st) (i32.shl (local.get $j) (i32.const 5))))
            (if (i32.load (i32.add (local.get $keep) (i32.shl (i32.load offset=16 (local.get $q)) (i32.const 2))))
              (then
                (local.set $p (call $share_of (local.get $slots) (local.get $cap) (i32.load offset=24 (local.get $q))))
                (i32.store offset=12 (local.get $p) (i32.add (i32.load offset=12 (local.get $p)) (i32.load (i32.add (local.get $gArea) (i32.shl (local.get $j) (i32.const 2))))))))
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $Ls3)))))

      (local.set $i (i32.const 0))
      (block $dli (loop $Lli
        (br_if $dli (i32.ge_s (local.get $i) (local.get $ng)))
        (block $next_i
          (local.set $p (i32.add (local.get $st) (i32.shl (local.get $i) (i32.const 5))))
          (br_if $next_i (i32.ne (i32.load offset=28 (local.get $p)) (local.get $i)))
          (local.set $m0 (i32.load offset=20 (local.get $p)))
          (br_if $next_i (i32.lt_s (local.get $m0) (i32.const 2)))
          (local.set $pair (i32.eq (local.get $m0) (i32.const 2)))
          (local.set $ms (i32.add (local.get $mem) (i32.shl (i32.load (i32.add (local.get $first) (i32.shl (local.get $i) (i32.const 2)))) (i32.const 2))))
          (if (local.get $pair)
            (then
              (local.set $q (i32.add (local.get $st) (i32.shl (i32.load offset=4 (local.get $ms)) (i32.const 5))))
              (local.set $lh (i32.add (i32.sub (i32.load offset=12 (local.get $p)) (i32.load offset=4 (local.get $p))) (i32.const 1)))
              (local.set $tol (i32.add (i32.const 1) (i32.div_s (local.get $lh) (i32.const 12))))
              (local.set $a (i32.sub (i32.load offset=4 (local.get $q)) (i32.load offset=4 (local.get $p))))
              (local.set $b (i32.sub (i32.load offset=12 (local.get $q)) (i32.load offset=12 (local.get $p))))
              (br_if $next_i (i32.or (i32.lt_s (local.get $lh) (i32.const 5))
                (i32.or (i32.or (i32.gt_s (local.get $a) (local.get $tol)) (i32.gt_s (i32.sub (i32.const 0) (local.get $a)) (local.get $tol)))
                        (i32.or (i32.gt_s (local.get $b) (local.get $tol)) (i32.gt_s (i32.sub (i32.const 0) (local.get $b)) (local.get $tol)))))))
            (else
              (br_if $next_i (i32.lt_s (local.get $m0) (i32.const 3)))))

          ;; Baseline or top-line lock
          (local.set $lock (i32.const 0))
          (local.set $base (i32.const -1))
          (local.set $u (i32.const 0))
          (loop $Llu
            (local.set $q (i32.add (local.get $st) (i32.shl (i32.load (i32.add (local.get $ms) (i32.shl (local.get $u) (i32.const 2)))) (i32.const 5))))
            (local.set $tol (i32.add (i32.const 1) (i32.div_s (i32.add (i32.sub (i32.load offset=12 (local.get $q)) (i32.load offset=4 (local.get $q))) (i32.const 1)) (i32.const 12))))
            (local.set $a (i32.const 0))
            (local.set $b (i32.const 0))
            (local.set $v (i32.const 0))
            (loop $Llv
              (local.set $row (i32.add (local.get $st) (i32.shl (i32.load (i32.add (local.get $ms) (i32.shl (local.get $v) (i32.const 2)))) (i32.const 5))))
              (local.set $x (i32.sub (i32.load offset=12 (local.get $row)) (i32.load offset=12 (local.get $q))))
              (local.set $y (i32.sub (i32.load offset=4 (local.get $row)) (i32.load offset=4 (local.get $q))))
              (local.set $a (i32.add (local.get $a) (i32.and (i32.le_s (local.get $x) (local.get $tol)) (i32.le_s (i32.sub (i32.const 0) (local.get $x)) (local.get $tol)))))
              (local.set $b (i32.add (local.get $b) (i32.and (i32.le_s (local.get $y) (local.get $tol)) (i32.le_s (i32.sub (i32.const 0) (local.get $y)) (local.get $tol)))))
              (br_if $Llv (i32.lt_s (local.tee $v (i32.add (local.get $v) (i32.const 1))) (local.get $m0))))
            (if (i32.gt_s (local.get $a) (local.get $lock))
              (then (local.set $lock (local.get $a)) (local.set $base (i32.load offset=12 (local.get $q)))))
            (if (i32.gt_s (local.get $b) (local.get $lock))
              (then (local.set $lock (local.get $b)) (local.set $base (i32.const -1))))
            (br_if $Llu (i32.lt_s (local.tee $u (i32.add (local.get $u) (i32.const 1))) (local.get $m0))))

          ;; Curved-line check if straight baseline/topline lock did not hold
          (if (i32.and (i32.eqz (local.get $pair))
                       (i32.or (i32.lt_s (local.get $lock) (i32.const 3))
                               (i32.lt_s (i32.mul (local.get $lock) (i32.const 100)) (i32.mul (local.get $m0) (i32.const 60)))))
            (then
              (br_if $next_i (i32.lt_s (local.get $m0) (i32.const 5)))
              (local.set $m (i32.const 0))
              (local.set $hmax (i32.const 0))
              (local.set $u (i32.const 0))
              (block $dcu (loop $Lcu
                (br_if $dcu (i32.or (i32.ge_s (local.get $u) (local.get $m0)) (i32.ge_s (local.get $m) (i32.const 64))))
                (local.set $a (i32.load (i32.add (local.get $ms) (i32.shl (local.get $u) (i32.const 2)))))
                (local.set $q (i32.add (local.get $st) (i32.shl (local.get $a) (i32.const 5))))
                (local.set $k (local.get $m))
                (local.set $m (i32.add (local.get $m) (i32.const 1)))
                (block $dins (loop $Lins
                  (br_if $dins (i32.le_s (local.get $k) (i32.const 0)))
                  (local.set $b (i32.load (i32.add (local.get $order) (i32.shl (i32.sub (local.get $k) (i32.const 1)) (i32.const 2)))))
                  (br_if $dins (i32.le_s (i32.load (i32.add (local.get $st) (i32.shl (local.get $b) (i32.const 5)))) (i32.load (local.get $q))))
                  (i32.store (i32.add (local.get $order) (i32.shl (local.get $k) (i32.const 2))) (local.get $b))
                  (local.set $k (i32.sub (local.get $k) (i32.const 1)))
                  (br $Lins)))
                (i32.store (i32.add (local.get $order) (i32.shl (local.get $k) (i32.const 2))) (local.get $a))
                (local.set $lh (i32.add (i32.sub (i32.load offset=12 (local.get $q)) (i32.load offset=4 (local.get $q))) (i32.const 1)))
                (if (i32.gt_s (local.get $lh) (local.get $hmax)) (then (local.set $hmax (local.get $lh))))
                (local.set $u (i32.add (local.get $u) (i32.const 1)))
                (br $Lcu)))
              (local.set $agree (i32.const 0))
              (local.set $tol (i32.shl (i32.add (i32.const 1) (i32.div_s (i32.mul (local.get $hmax) (i32.const 35)) (i32.const 100))) (i32.const 1)))
              (local.set $k (i32.const 1))
              (block $dcb (loop $Lcb
                (br_if $dcb (i32.ge_s (i32.add (local.get $k) (i32.const 1)) (local.get $m)))
                (local.set $q (i32.add (local.get $st) (i32.shl (i32.load (i32.add (local.get $order) (i32.shl (i32.sub (local.get $k) (i32.const 1)) (i32.const 2)))) (i32.const 5))))
                (local.set $a (i32.add (i32.load offset=4 (local.get $q)) (i32.load offset=12 (local.get $q))))
                (local.set $q (i32.add (local.get $st) (i32.shl (i32.load (i32.add (local.get $order) (i32.shl (local.get $k) (i32.const 2)))) (i32.const 5))))
                (local.set $b (i32.add (i32.load offset=4 (local.get $q)) (i32.load offset=12 (local.get $q))))
                (local.set $q (i32.add (local.get $st) (i32.shl (i32.load (i32.add (local.get $order) (i32.shl (i32.add (local.get $k) (i32.const 1)) (i32.const 2)))) (i32.const 5))))
                (local.set $c (i32.add (i32.sub (i32.add (i32.load offset=4 (local.get $q)) (i32.load offset=12 (local.get $q))) (i32.shl (local.get $b) (i32.const 1))) (local.get $a)))
                (local.set $agree (i32.add (local.get $agree)
                  (i32.and (i32.le_s (local.get $c) (local.get $tol)) (i32.le_s (i32.sub (i32.const 0) (local.get $c)) (local.get $tol)))))
                (local.set $k (i32.add (local.get $k) (i32.const 1)))
                (br $Lcb)))
              (br_if $next_i (i32.or (i32.lt_s (local.get $m) (i32.const 5))
                                     (i32.lt_s (i32.mul (local.get $agree) (i32.const 100)) (i32.mul (i32.sub (local.get $m) (i32.const 2)) (i32.const 80)))))))

          ;; Bounding box of line members
          (local.set $lx0 (i32.load (local.get $p)))
          (local.set $ly0 (i32.load offset=4 (local.get $p)))
          (local.set $lx1 (i32.load offset=8 (local.get $p)))
          (local.set $ly1 (i32.load offset=12 (local.get $p)))
          (local.set $u (i32.const 1))
          (block $dbb (loop $Lbb
            (br_if $dbb (i32.ge_s (local.get $u) (local.get $m0)))
            (local.set $q (i32.add (local.get $st) (i32.shl (i32.load (i32.add (local.get $ms) (i32.shl (local.get $u) (i32.const 2)))) (i32.const 5))))
            (if (i32.lt_s (i32.load (local.get $q)) (local.get $lx0)) (then (local.set $lx0 (i32.load (local.get $q)))))
            (if (i32.lt_s (i32.load offset=4 (local.get $q)) (local.get $ly0)) (then (local.set $ly0 (i32.load offset=4 (local.get $q)))))
            (if (i32.gt_s (i32.load offset=8 (local.get $q)) (local.get $lx1)) (then (local.set $lx1 (i32.load offset=8 (local.get $q)))))
            (if (i32.gt_s (i32.load offset=12 (local.get $q)) (local.get $ly1)) (then (local.set $ly1 (i32.load offset=12 (local.get $q)))))
            (local.set $u (i32.add (local.get $u) (i32.const 1)))
            (br $Lbb)))

          ;; Guard bands above and below
          (local.set $lh (i32.add (i32.sub (local.get $ly1) (local.get $ly0)) (i32.const 1)))
          (local.set $off (i32.add (i32.div_s (local.get $lh) (i32.const 3)) (i32.const 2)))
          (local.set $gh (i32.add (i32.div_s (local.get $lh) (i32.const 2)) (i32.const 2)))
          (local.set $inCnt (i32.const 0))
          (local.set $gdCnt (i32.const 0))
          (local.set $col (i32.load offset=24 (local.get $p)))
          (local.set $vc0 (i32x4.splat (local.get $col)))
          (local.set $vn (v128.const i32x4 0 0 0 0))
          (local.set $y (local.get $ly0))
          (loop $Lgi
            (local.set $x (local.get $lx0))
            (block $dgix4 (loop $Lgix4
              (br_if $dgix4 (i32.gt_s (i32.add (local.get $x) (i32.const 3)) (local.get $lx1)))
              (local.set $vn (i32x4.sub (local.get $vn)
                (i32x4.eq (v128.load (i32.add (local.get $rgba) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x)) (i32.const 2)))) (local.get $vc0))))
              (local.set $x (i32.add (local.get $x) (i32.const 4)))
              (br $Lgix4)))
            (block $dgix1 (loop $Lgix
              (br_if $dgix1 (i32.gt_s (local.get $x) (local.get $lx1)))
              (local.set $inCnt (i32.add (local.get $inCnt)
                (i32.eq (i32.load (i32.add (local.get $rgba) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x)) (i32.const 2)))) (local.get $col))))
              (local.set $x (i32.add (local.get $x) (i32.const 1)))
              (br $Lgix)))
            (br_if $Lgi (i32.le_s (local.tee $y (i32.add (local.get $y) (i32.const 1))) (local.get $ly1))))
          (local.set $inCnt (i32.add (local.get $inCnt)
            (i32.add (i32.add (i32x4.extract_lane 0 (local.get $vn)) (i32x4.extract_lane 1 (local.get $vn)))
                     (i32.add (i32x4.extract_lane 2 (local.get $vn)) (i32x4.extract_lane 3 (local.get $vn))))))
          (local.set $vn (v128.const i32x4 0 0 0 0))
          (local.set $k (i32.const 0))
          (loop $Lgp
            (local.set $a (if (result i32) (local.get $k)
              (then (i32.add (i32.add (local.get $ly1) (i32.const 1)) (local.get $off)))
              (else (i32.sub (i32.sub (local.get $ly0) (local.get $off)) (local.get $gh)))))
            (local.set $y (select (i32.const 0) (local.get $a) (i32.lt_s (local.get $a) (i32.const 0))))
            (block $dgpy (loop $Lgpy
              (br_if $dgpy (i32.or (i32.ge_s (local.get $y) (i32.add (local.get $a) (local.get $gh))) (i32.ge_s (local.get $y) (local.get $h))))
              (local.set $x (local.get $lx0))
              (block $dgpx4 (loop $Lgpx4
                (br_if $dgpx4 (i32.gt_s (i32.add (local.get $x) (i32.const 3)) (local.get $lx1)))
                (local.set $vn (i32x4.sub (local.get $vn)
                  (i32x4.eq (v128.load (i32.add (local.get $rgba) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x)) (i32.const 2)))) (local.get $vc0))))
                (local.set $x (i32.add (local.get $x) (i32.const 4)))
                (br $Lgpx4)))
              (block $dgpx1 (loop $Lgpx
                (br_if $dgpx1 (i32.gt_s (local.get $x) (local.get $lx1)))
                (local.set $gdCnt (i32.add (local.get $gdCnt)
                  (i32.eq (i32.load (i32.add (local.get $rgba) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $w)) (local.get $x)) (i32.const 2)))) (local.get $col))))
                (local.set $x (i32.add (local.get $x) (i32.const 1)))
                (br $Lgpx)))
              (local.set $y (i32.add (local.get $y) (i32.const 1)))
              (br $Lgpy)))
            (br_if $Lgp (i32.lt_u (local.tee $k (i32.add (local.get $k) (i32.const 1))) (i32.const 2))))
          (local.set $gdCnt (i32.add (local.get $gdCnt)
            (i32.add (i32.add (i32x4.extract_lane 0 (local.get $vn)) (i32x4.extract_lane 1 (local.get $vn)))
                     (i32.add (i32x4.extract_lane 2 (local.get $vn)) (i32x4.extract_lane 3 (local.get $vn))))))
          (br_if $next_i
            (i64.gt_s
              (i64.mul (i64.mul (i64.extend_i32_s (local.get $gdCnt)) (i64.const 100)) (i64.extend_i32_s (local.get $lh)))
              (i64.mul (i64.mul (i64.const 50) (i64.extend_i32_s (local.get $inCnt))) (i64.extend_i32_s (local.get $gh)))))

          (if (i32.eqz (local.get $pass))
            (then
              (i32.store (i32.add (local.get $keep) (i32.shl (local.get $i) (i32.const 2))) (i32.const 1))
              (local.set $kept (i32.add (local.get $kept) (i32.const 1)))
              (br $next_i)))
          (br_if $next_i (i32.eqz (i32.load (i32.add (local.get $keep) (i32.shl (local.get $i) (i32.const 2))))))
          (local.set $q (call $share_of (local.get $slots) (local.get $cap) (local.get $col)))
          (br_if $next_i
            (i64.lt_s
              (i64.mul (i64.extend_i32_u (i32.load offset=12 (local.get $q))) (i64.const 100))
              (i64.mul (i64.const 25) (i64.extend_i32_u (i32.load offset=8 (local.get $q))))))

          ;; Emit line box (and mark letter samples when mask != 0)
          (local.set $a (i32.div_s (i32.mul (local.get $lh) (i32.const 30)) (i32.const 100)))
          (local.set $bx0 (select (i32.const 0) (i32.sub (local.get $lx0) (local.get $a)) (i32.lt_s (i32.sub (local.get $lx0) (local.get $a)) (i32.const 0))))
          (local.set $by0 (select (i32.const 0) (i32.sub (local.get $ly0) (local.get $a)) (i32.lt_s (i32.sub (local.get $ly0) (local.get $a)) (i32.const 0))))
          (local.set $bx1 (select (i32.sub (local.get $w) (i32.const 1)) (i32.add (local.get $lx1) (local.get $a)) (i32.ge_s (i32.add (local.get $lx1) (local.get $a)) (local.get $w))))
          (local.set $by1 (select (i32.sub (local.get $h) (i32.const 1)) (i32.add (local.get $ly1) (local.get $a)) (i32.ge_s (i32.add (local.get $ly1) (local.get $a)) (local.get $h))))
          (if (i32.eqz (local.get $mask))
            (then
              (if (i32.lt_s (local.get $nb) (local.get $maxBoxes))
                (then
                  (local.set $q (i32.add (local.get $boxes) (i32.shl (local.get $nb) (i32.const 4))))
                  (i32.store (local.get $q) (local.get $bx0))
                  (i32.store offset=4 (local.get $q) (local.get $by0))
                  (i32.store offset=8 (local.get $q) (local.get $bx1))
                  (i32.store offset=12 (local.get $q) (local.get $by1)))))
            (else
              (call $mark_line (local.get $rgba) (local.get $w) (local.get $mask) (local.get $bx0) (local.get $by0) (local.get $bx1) (local.get $by1)
                (local.get $col) (i32.add (i32.const 1) (i32.div_s (local.get $lh) (i32.const 16))))
              (if (i32.lt_s (local.get $nb) (local.get $maxBoxes))
                (then
                  (local.set $hmax (i32.const 0))
                  (local.set $u (i32.const 0))
                  (loop $Ltl
                    (local.set $q (i32.add (local.get $st) (i32.shl (i32.load (i32.add (local.get $ms) (i32.shl (local.get $u) (i32.const 2)))) (i32.const 5))))
                    (local.set $b (i32.add (i32.sub (i32.load offset=12 (local.get $q)) (i32.load offset=4 (local.get $q))) (i32.const 1)))
                    (if (i32.gt_s (local.get $b) (local.get $hmax)) (then (local.set $hmax (local.get $b))))
                    (br_if $Ltl (i32.lt_s (local.tee $u (i32.add (local.get $u) (i32.const 1))) (local.get $m0))))
                  (local.set $q (i32.add (local.get $boxes) (i32.shl (local.get $nb) (i32.const 5))))
                  (i32.store (local.get $q) (local.get $bx0))
                  (i32.store offset=4 (local.get $q) (local.get $by0))
                  (i32.store offset=8 (local.get $q) (local.get $bx1))
                  (i32.store offset=12 (local.get $q) (local.get $by1))
                  (i32.store offset=16 (local.get $q) (i32.and (local.get $col) (i32.const 0xffffff)))
                  (i32.store offset=20 (local.get $q) (select (local.get $ly1) (local.get $base) (i32.lt_s (local.get $base) (i32.const 0))))
                  (i32.store offset=24 (local.get $q) (local.get $m0))
                  (i32.store offset=28 (local.get $q) (local.get $hmax))))))
          (local.set $nb (i32.add (local.get $nb) (i32.const 1))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $Lli)))
      (br_if $Lpass (i32.lt_u (local.tee $pass (i32.add (local.get $pass) (i32.const 1))) (i32.const 2))))
    (local.get $nb))

  (func $ink_lines (param $rgba i32) (param $w i32) (param $h i32) (param $scratch i32) (param $room i32)
                   (param $boxes i32) (param $maxBoxes i32) (param $cutTop i32) (param $cutBottom i32) (result i32)
    (call $lines (local.get $rgba) (local.get $w) (local.get $h) (local.get $scratch) (local.get $room)
      (local.get $boxes) (local.get $maxBoxes) (local.get $cutTop) (local.get $cutBottom) (i32.const 0)))

  (func $find_text (param $rgba i32) (param $w i32) (param $h i32) (param $scratch i32) (param $room i32)
                   (param $boxes i32) (param $maxBoxes i32) (param $cutTop i32) (param $cutBottom i32) (param $mask i32) (result i32)
    (call $lines (local.get $rgba) (local.get $w) (local.get $h) (local.get $scratch) (local.get $room)
      (local.get $boxes) (local.get $maxBoxes) (local.get $cutTop) (local.get $cutBottom) (local.get $mask)))

  (export "inkLines" (func $ink_lines))
  (export "findText" (func $find_text))
)
