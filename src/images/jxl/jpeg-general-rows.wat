;; SPDX-License-Identifier: MIT
;; Handwritten WebAssembly kernel for general T.81 JPEG component upsampling and color conversion.
;; Caller-owned memory layout with zero stack pointer, zero globals and zero tables.
(module
  (import "env" "memory" (memory 2))

  (func $clip (param $v f64) (result f64)
    (if (result f64) (f64.lt (local.get $v) (f64.const 0))
      (then (f64.const 0))
      (else (if (result f64) (f64.gt (local.get $v) (f64.const 255))
        (then (f64.const 255))
        (else (local.get $v))))))

  (func $to_byte (param $v f64) (result i32)
    (i32.and (i32.trunc_sat_f64_u (f64.add (call $clip (local.get $v)) (f64.const 0.5))) (i32.const 255)))

  ;; Sample plane at horizontal coordinate x using precomputed hcD, pw1, row pointers r0, r1 and vertical weight ty.
  (func $sample_x (param $xD f64) (param $hcD f64) (param $hmaxD f64) (param $pw1 i32) (param $r0 i32) (param $r1 i32) (param $ty f64) (result f64)
    (local $x0 i32) (local $x1 i32)
    (local $sx f64) (local $tx f64) (local $a f64) (local $b f64) (local $top f64) (local $c f64) (local $d f64)
    (local.set $sx (f64.sub (f64.div (f64.mul (local.get $xD) (local.get $hcD)) (local.get $hmaxD)) (f64.const 0.5)))
    (if (f64.le (local.get $sx) (f64.const 0))
      (then (local.set $x0 (i32.const 0)) (local.set $x1 (i32.const 0)))
      (else
        (if (f64.ge (local.get $sx) (f64.convert_i32_u (local.get $pw1)))
          (then (local.set $x0 (local.get $pw1)) (local.set $x1 (local.get $pw1)))
          (else
            (local.set $x0 (i32.trunc_sat_f64_u (local.get $sx)))
            (local.set $x1 (i32.add (local.get $x0) (i32.const 1)))
            (local.set $tx (f64.sub (local.get $sx) (f64.convert_i32_u (local.get $x0))))))))
    (local.set $a (call $clip (f64.promote_f32 (f32.load (i32.add (local.get $r0) (i32.shl (local.get $x0) (i32.const 2)))))))
    (local.set $b (call $clip (f64.promote_f32 (f32.load (i32.add (local.get $r0) (i32.shl (local.get $x1) (i32.const 2)))))))
    (local.set $top (f64.add (local.get $a) (f64.mul (f64.sub (local.get $b) (local.get $a)) (local.get $tx))))
    (if (f64.eq (local.get $ty) (f64.const 0)) (then (return (local.get $top))))
    (local.set $c (call $clip (f64.promote_f32 (f32.load (i32.add (local.get $r1) (i32.shl (local.get $x0) (i32.const 2)))))))
    (local.set $d (call $clip (f64.promote_f32 (f32.load (i32.add (local.get $r1) (i32.shl (local.get $x1) (i32.const 2)))))))
    (f64.add (local.get $top)
      (f64.mul (f64.sub (f64.add (local.get $c) (f64.mul (f64.sub (local.get $d) (local.get $c)) (local.get $tx))) (local.get $top))
               (local.get $ty))))

  (func $row_ptr (param $p i32) (param $yIdx i32) (result i32)
    (i32.add (i32.load (local.get $p))
      (i32.shl (i32.mul (i32.sub (local.get $yIdx) (i32.load offset=24 (local.get $p))) (i32.load offset=4 (local.get $p))) (i32.const 2))))

  (func $prep_sy (param $p i32) (param $yD f64) (param $vmaxD f64) (result f64)
    (f64.sub (f64.div (f64.mul (local.get $yD) (f64.convert_i32_u (i32.load offset=12 (local.get $p)))) (local.get $vmaxD)) (f64.const 0.5)))

  (func $jpeg_general_rows
    (param $desc i32) (param $width i32) (param $height i32) (param $startY i32) (param $rows i32)
    (param $hmax i32) (param $vmax i32) (param $count i32) (param $mode i32) (param $dst i32)
    (local $row i32) (local $y i32) (local $x i32) (local $p i32) (local $ph1 i32) (local $y0 i32) (local $y1 i32) (local $out i32)
    (local $pw10 i32) (local $pw11 i32) (local $pw12 i32) (local $pw13 i32)
    (local $r00 i32) (local $r01 i32) (local $r10 i32) (local $r11 i32) (local $r20 i32) (local $r21 i32) (local $r30 i32) (local $r31 i32)
    (local $rb i32) (local $gb i32) (local $bb i32)
    (local $hmaxD f64) (local $vmaxD f64) (local $yD f64) (local $xD f64) (local $sy f64)
    (local $hc0D f64) (local $hc1D f64) (local $hc2D f64) (local $hc3D f64)
    (local $ty0 f64) (local $ty1 f64) (local $ty2 f64) (local $ty3 f64)
    (local $a f64) (local $b f64) (local $c f64) (local $k f64) (local $cb f64) (local $cr f64) (local $rr f64) (local $gg f64) (local $bl f64)

    (if (i32.or (i32.eqz (local.get $rows)) (i32.ge_u (local.get $startY) (local.get $height))) (then (return)))
    (local.set $hmaxD (f64.convert_i32_u (local.get $hmax)))
    (local.set $vmaxD (f64.convert_i32_u (local.get $vmax)))
    (local.set $hc0D (f64.convert_i32_u (i32.load offset=8 (local.get $desc))))
    (local.set $pw10 (i32.sub (i32.load offset=16 (local.get $desc)) (i32.const 1)))
    (if (i32.gt_u (local.get $count) (i32.const 1))
      (then
        (local.set $hc1D (f64.convert_i32_u (i32.load offset=36 (local.get $desc))))
        (local.set $pw11 (i32.sub (i32.load offset=44 (local.get $desc)) (i32.const 1)))))
    (if (i32.gt_u (local.get $count) (i32.const 2))
      (then
        (local.set $hc2D (f64.convert_i32_u (i32.load offset=64 (local.get $desc))))
        (local.set $pw12 (i32.sub (i32.load offset=72 (local.get $desc)) (i32.const 1)))))
    (if (i32.gt_u (local.get $count) (i32.const 3))
      (then
        (local.set $hc3D (f64.convert_i32_u (i32.load offset=92 (local.get $desc))))
        (local.set $pw13 (i32.sub (i32.load offset=100 (local.get $desc)) (i32.const 1)))))

    (block $drow (loop $Lrow
      (br_if $drow (i32.ge_u (local.get $row) (local.get $rows)))
      (local.set $y (i32.add (local.get $startY) (local.get $row)))
      (if (i32.ge_u (local.get $y) (local.get $height)) (then (return)))
      (local.set $yD (f64.add (f64.convert_i32_u (local.get $y)) (f64.const 0.5)))

      (local.set $p (local.get $desc))
      (local.set $sy (call $prep_sy (local.get $p) (local.get $yD) (local.get $vmaxD)))
      (local.set $ph1 (i32.sub (i32.load offset=20 (local.get $p)) (i32.const 1)))
      (local.set $ty0 (f64.const 0))
      (if (f64.le (local.get $sy) (f64.const 0))
        (then (local.set $y0 (i32.const 0)) (local.set $y1 (i32.const 0)))
        (else (if (f64.ge (local.get $sy) (f64.convert_i32_u (local.get $ph1)))
          (then (local.set $y0 (local.get $ph1)) (local.set $y1 (local.get $ph1)))
          (else (local.set $y0 (i32.trunc_sat_f64_u (local.get $sy))) (local.set $y1 (i32.add (local.get $y0) (i32.const 1)))
                (local.set $ty0 (f64.sub (local.get $sy) (f64.convert_i32_u (local.get $y0))))))))
      (local.set $r00 (call $row_ptr (local.get $p) (local.get $y0)))
      (local.set $r01 (call $row_ptr (local.get $p) (local.get $y1)))

      (if (i32.gt_u (local.get $count) (i32.const 1))
        (then
          (local.set $p (i32.add (local.get $desc) (i32.const 28)))
          (local.set $sy (call $prep_sy (local.get $p) (local.get $yD) (local.get $vmaxD)))
          (local.set $ph1 (i32.sub (i32.load offset=20 (local.get $p)) (i32.const 1)))
          (local.set $ty1 (f64.const 0))
          (if (f64.le (local.get $sy) (f64.const 0))
            (then (local.set $y0 (i32.const 0)) (local.set $y1 (i32.const 0)))
            (else (if (f64.ge (local.get $sy) (f64.convert_i32_u (local.get $ph1)))
              (then (local.set $y0 (local.get $ph1)) (local.set $y1 (local.get $ph1)))
              (else (local.set $y0 (i32.trunc_sat_f64_u (local.get $sy))) (local.set $y1 (i32.add (local.get $y0) (i32.const 1)))
                    (local.set $ty1 (f64.sub (local.get $sy) (f64.convert_i32_u (local.get $y0))))))))
          (local.set $r10 (call $row_ptr (local.get $p) (local.get $y0)))
          (local.set $r11 (call $row_ptr (local.get $p) (local.get $y1)))))

      (if (i32.gt_u (local.get $count) (i32.const 2))
        (then
          (local.set $p (i32.add (local.get $desc) (i32.const 56)))
          (local.set $sy (call $prep_sy (local.get $p) (local.get $yD) (local.get $vmaxD)))
          (local.set $ph1 (i32.sub (i32.load offset=20 (local.get $p)) (i32.const 1)))
          (local.set $ty2 (f64.const 0))
          (if (f64.le (local.get $sy) (f64.const 0))
            (then (local.set $y0 (i32.const 0)) (local.set $y1 (i32.const 0)))
            (else (if (f64.ge (local.get $sy) (f64.convert_i32_u (local.get $ph1)))
              (then (local.set $y0 (local.get $ph1)) (local.set $y1 (local.get $ph1)))
              (else (local.set $y0 (i32.trunc_sat_f64_u (local.get $sy))) (local.set $y1 (i32.add (local.get $y0) (i32.const 1)))
                    (local.set $ty2 (f64.sub (local.get $sy) (f64.convert_i32_u (local.get $y0))))))))
          (local.set $r20 (call $row_ptr (local.get $p) (local.get $y0)))
          (local.set $r21 (call $row_ptr (local.get $p) (local.get $y1)))))

      (if (i32.gt_u (local.get $count) (i32.const 3))
        (then
          (local.set $p (i32.add (local.get $desc) (i32.const 84)))
          (local.set $sy (call $prep_sy (local.get $p) (local.get $yD) (local.get $vmaxD)))
          (local.set $ph1 (i32.sub (i32.load offset=20 (local.get $p)) (i32.const 1)))
          (local.set $ty3 (f64.const 0))
          (if (f64.le (local.get $sy) (f64.const 0))
            (then (local.set $y0 (i32.const 0)) (local.set $y1 (i32.const 0)))
            (else (if (f64.ge (local.get $sy) (f64.convert_i32_u (local.get $ph1)))
              (then (local.set $y0 (local.get $ph1)) (local.set $y1 (local.get $ph1)))
              (else (local.set $y0 (i32.trunc_sat_f64_u (local.get $sy))) (local.set $y1 (i32.add (local.get $y0) (i32.const 1)))
                    (local.set $ty3 (f64.sub (local.get $sy) (f64.convert_i32_u (local.get $y0))))))))
          (local.set $r30 (call $row_ptr (local.get $p) (local.get $y0)))
          (local.set $r31 (call $row_ptr (local.get $p) (local.get $y1)))))

      (local.set $x (i32.const 0))
      (block $dx (loop $Lx
        (br_if $dx (i32.ge_u (local.get $x) (local.get $width)))
        (local.set $xD (f64.add (f64.convert_i32_u (local.get $x)) (f64.const 0.5)))
        (local.set $a (call $sample_x (local.get $xD) (local.get $hc0D) (local.get $hmaxD) (local.get $pw10) (local.get $r00) (local.get $r01) (local.get $ty0)))
        (local.set $b (if (result f64) (i32.gt_u (local.get $count) (i32.const 1))
          (then (call $sample_x (local.get $xD) (local.get $hc1D) (local.get $hmaxD) (local.get $pw11) (local.get $r10) (local.get $r11) (local.get $ty1)))
          (else (local.get $a))))
        (local.set $c (if (result f64) (i32.gt_u (local.get $count) (i32.const 2))
          (then (call $sample_x (local.get $xD) (local.get $hc2D) (local.get $hmaxD) (local.get $pw12) (local.get $r20) (local.get $r21) (local.get $ty2)))
          (else (local.get $a))))
        (local.set $k (if (result f64) (i32.gt_u (local.get $count) (i32.const 3))
          (then (f64.div (call $sample_x (local.get $xD) (local.get $hc3D) (local.get $hmaxD) (local.get $pw13) (local.get $r30) (local.get $r31) (local.get $ty3)) (f64.const 255)))
          (else (f64.const 0))))

        (if (i32.eqz (local.get $mode))
          (then
            (local.set $rb (call $to_byte (local.get $a)))
            (local.set $gb (local.get $rb))
            (local.set $bb (local.get $rb)))
          (else
            (if (i32.or (i32.eq (local.get $mode) (i32.const 1)) (i32.eq (local.get $mode) (i32.const 5)))
              (then
                (local.set $cb (f64.sub (local.get $b) (f64.const 128)))
                (local.set $cr (f64.sub (local.get $c) (f64.const 128)))
                (local.set $rr (call $clip (f64.add (local.get $a) (f64.mul (f64.const 0x1.66e978d4fdf3bp+0) (local.get $cr)))))
                (local.set $gg (call $clip (f64.sub (f64.sub (local.get $a) (f64.mul (f64.const 0x1.60654336f296ap-2) (local.get $cb)))
                                                    (f64.mul (f64.const 0x1.6da345728388cp-1) (local.get $cr)))))
                (local.set $bl (call $clip (f64.add (local.get $a) (f64.mul (f64.const 0x1.c5a1cac083127p+0) (local.get $cb)))))
                (if (i32.eq (local.get $mode) (i32.const 5))
                  (then
                    (local.set $rb (call $to_byte (f64.mul (f64.sub (f64.const 255) (local.get $rr)) (local.get $k))))
                    (local.set $gb (call $to_byte (f64.mul (f64.sub (f64.const 255) (local.get $gg)) (local.get $k))))
                    (local.set $bb (call $to_byte (f64.mul (f64.sub (f64.const 255) (local.get $bl)) (local.get $k)))))
                  (else
                    (local.set $rb (call $to_byte (local.get $rr)))
                    (local.set $gb (call $to_byte (local.get $gg)))
                    (local.set $bb (call $to_byte (local.get $bl))))))
              (else
                (if (i32.eq (local.get $mode) (i32.const 2))
                  (then
                    (local.set $rb (call $to_byte (local.get $a)))
                    (local.set $gb (call $to_byte (local.get $b)))
                    (local.set $bb (call $to_byte (local.get $c))))
                  (else
                    (local.set $rb (call $to_byte (f64.mul (local.get $a) (local.get $k))))
                    (local.set $gb (call $to_byte (f64.mul (local.get $b) (local.get $k))))
                    (local.set $bb (call $to_byte (f64.mul (local.get $c) (local.get $k))))))))))

        (local.set $out (i32.add (local.get $dst) (i32.shl (i32.add (i32.mul (local.get $row) (local.get $width)) (local.get $x)) (i32.const 2))))
        (i32.store (local.get $out)
          (i32.or (i32.or (local.get $rb) (i32.shl (local.get $gb) (i32.const 8)))
                  (i32.or (i32.shl (local.get $bb) (i32.const 16)) (i32.const -16777216))))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br $Lx)))
      (local.set $row (i32.add (local.get $row) (i32.const 1)))
      (br $Lrow))))

  (export "jpegGeneralRows" (func $jpeg_general_rows))
)
