;; SPDX-License-Identifier: MIT
;; Animation frame comparison and masking in the shared pixel-kernel arena. Offsets are bytes.

;; First and last differing word per 16-word row segment; 255/255 means unchanged. Returns changed segments.
(func $frameSpans (export "frameSpans")
  (param $a i32) (param $as i32) (param $b i32) (param $bs i32) (param $n i32) (param $rows i32) (param $out i32) (result i32)
  (local $y i32) (local $x i32) (local $pa i32) (local $pb i32) (local $len i32) (local $diff i32) (local $i i32) (local $hits i32)
  (block $done
    (loop $row
      (br_if $done (i32.ge_u (local.get $y) (local.get $rows)))
      (local.set $pa (i32.add (local.get $a) (i32.mul (local.get $y) (local.get $as))))
      (local.set $pb (i32.add (local.get $b) (i32.mul (local.get $y) (local.get $bs))))
      (local.set $x (i32.const 0))
      (block $rowDone
        (loop $segment
          (br_if $rowDone (i32.ge_u (local.get $x) (local.get $n)))
          (local.set $len (i32.sub (local.get $n) (local.get $x)))
          (if (i32.ge_u (local.get $len) (i32.const 16))
            (then
              (local.set $diff (i32.xor (i32.const 0xffff) (i32.or
                (i32.or
                  (i32x4.bitmask (i32x4.eq (v128.load (local.get $pa)) (v128.load (local.get $pb))))
                  (i32.shl (i32x4.bitmask (i32x4.eq (v128.load offset=16 (local.get $pa)) (v128.load offset=16 (local.get $pb)))) (i32.const 4)))
                (i32.or
                  (i32.shl (i32x4.bitmask (i32x4.eq (v128.load offset=32 (local.get $pa)) (v128.load offset=32 (local.get $pb)))) (i32.const 8))
                  (i32.shl (i32x4.bitmask (i32x4.eq (v128.load offset=48 (local.get $pa)) (v128.load offset=48 (local.get $pb)))) (i32.const 12))))))
              (local.set $len (i32.const 16)))
            (else
              (local.set $diff (i32.const 0))
              (local.set $i (i32.const 0))
              (block $tailDone
                (loop $tail
                  (br_if $tailDone (i32.ge_u (local.get $i) (local.get $len)))
                  (if (i32.ne (i32.load (i32.add (local.get $pa) (i32.shl (local.get $i) (i32.const 2))))
                              (i32.load (i32.add (local.get $pb) (i32.shl (local.get $i) (i32.const 2)))))
                    (then (local.set $diff (i32.or (local.get $diff) (i32.shl (i32.const 1) (local.get $i))))))
                  (local.set $i (i32.add (local.get $i) (i32.const 1)))
                  (br $tail)))))
          (if (local.get $diff)
            (then
              (i32.store8 (local.get $out) (i32.ctz (local.get $diff)))
              (i32.store8 offset=1 (local.get $out) (i32.sub (i32.const 31) (i32.clz (local.get $diff))))
              (local.set $hits (i32.add (local.get $hits) (i32.const 1))))
            (else (i32.store16 (local.get $out) (i32.const 0xffff))))
          (local.set $out (i32.add (local.get $out) (i32.const 2)))
          (local.set $pa (i32.add (local.get $pa) (i32.shl (local.get $len) (i32.const 2))))
          (local.set $pb (i32.add (local.get $pb) (i32.shl (local.get $len) (i32.const 2))))
          (local.set $x (i32.add (local.get $x) (local.get $len)))
          (br $segment)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $row)))
  (local.get $hits))

(func $animPixelDiff4 (param $a v128) (param $b v128) (result v128)
  (local $d v128) (local $m v128)
  (local.set $d (v128.or (i8x16.sub_sat_u (local.get $a) (local.get $b)) (i8x16.sub_sat_u (local.get $b) (local.get $a))))
  (local.set $m (v128.and (i8x16.max_u (i8x16.max_u (local.get $d) (i32x4.shr_u (local.get $d) (i32.const 8))) (i32x4.shr_u (local.get $d) (i32.const 16)))
    (v128.const i32x4 255 255 255 255)))
  (v128.bitselect (v128.const i32x4 255 255 255 255) (local.get $m)
    (i32x4.ne (i32x4.shr_u (local.get $d) (i32.const 24)) (v128.const i32x4 0 0 0 0))))

;; Signed channel sums for four RGBA8 pixels.
(func $animDC4 (param $a v128) (param $b v128) (result v128)
  (local $v v128)
  (local.set $v (i16x8.add
    (i16x8.sub (i16x8.extend_low_i8x16_u (local.get $a)) (i16x8.extend_low_i8x16_u (local.get $b)))
    (i16x8.sub (i16x8.extend_high_i8x16_u (local.get $a)) (i16x8.extend_high_i8x16_u (local.get $b)))))
  (i32x4.add (i32x4.extend_low_i16x8_s (local.get $v)) (i32x4.extend_high_i16x8_s (local.get $v))))

;; Each 8-pixel block over at most 8 rows: u16 sum, u8 peak, optional u8 signed RGB DC bias.
;; Bias is max(abs(sum(dR)), abs(sum(dG)), abs(sum(dB))) >> 4, saturated at 255.
;; Plain frame diffs leave bias disabled and retain their original statistics.
;; A pixel contributes max(|dR|, |dG|, |dB|), or 255 when alpha differs.
(func $blockStats (export "blockStats")
  (param $a i32) (param $as i32) (param $b i32) (param $bs i32) (param $n i32) (param $rows i32) (param $out i32) (param $biasMode i32) (result i32)
  (local $x i32) (local $y i32) (local $len i32) (local $pa i32) (local $pb i32) (local $i i32) (local $d i32)
  (local $sum v128) (local $peak v128) (local $v v128) (local $va v128) (local $vb v128) (local $dc v128)
  (local $total i32) (local $most i32) (local $hits i32) (local $bias i32)
  (block $done
    (loop $block
      (br_if $done (i32.ge_u (local.get $x) (local.get $n)))
      (local.set $len (i32.sub (local.get $n) (local.get $x)))
      (if (i32.gt_u (local.get $len) (i32.const 8)) (then (local.set $len (i32.const 8))))
      (local.set $sum (v128.const i32x4 0 0 0 0))
      (local.set $dc (v128.const i32x4 0 0 0 0))
      (local.set $bias (i32.const 0))
      (local.set $peak (v128.const i32x4 0 0 0 0))
      (local.set $total (i32.const 0))
      (local.set $most (i32.const 0))
      (local.set $y (i32.const 0))
      (block $rowsDone
        (loop $row
          (br_if $rowsDone (i32.ge_u (local.get $y) (local.get $rows)))
          (local.set $pa (i32.add (i32.add (local.get $a) (i32.mul (local.get $y) (local.get $as))) (i32.shl (local.get $x) (i32.const 2))))
          (local.set $pb (i32.add (i32.add (local.get $b) (i32.mul (local.get $y) (local.get $bs))) (i32.shl (local.get $x) (i32.const 2))))
          (local.set $i (i32.const 0))
          (block $vecDone
            (loop $vec
              (br_if $vecDone (i32.gt_u (i32.add (local.get $i) (i32.const 4)) (local.get $len)))
              (local.set $va (v128.load (local.get $pa)))
              (local.set $vb (v128.load (local.get $pb)))
              (local.set $v (call $animPixelDiff4 (local.get $va) (local.get $vb)))
              (if (local.get $biasMode)
                (then (local.set $dc (i32x4.add (local.get $dc) (call $animDC4 (local.get $va) (local.get $vb))))))
              (local.set $sum (i32x4.add (local.get $sum) (local.get $v)))
              (local.set $peak (i32x4.max_u (local.get $peak) (local.get $v)))
              (local.set $pa (i32.add (local.get $pa) (i32.const 16)))
              (local.set $pb (i32.add (local.get $pb) (i32.const 16)))
              (local.set $i (i32.add (local.get $i) (i32.const 4)))
              (br $vec)))
          (block $tailDone
            (loop $tail
              (br_if $tailDone (i32.ge_u (local.get $i) (local.get $len)))
              (local.set $va (v128.load32_zero (local.get $pa)))
              (local.set $vb (v128.load32_zero (local.get $pb)))
              (local.set $d (i32x4.extract_lane 0 (call $animPixelDiff4 (local.get $va) (local.get $vb))))
              (if (local.get $biasMode)
                (then (local.set $dc (i32x4.add (local.get $dc) (call $animDC4 (local.get $va) (local.get $vb))))))
              (local.set $total (i32.add (local.get $total) (local.get $d)))
              (if (i32.gt_u (local.get $d) (local.get $most)) (then (local.set $most (local.get $d))))
              (local.set $pa (i32.add (local.get $pa) (i32.const 4)))
              (local.set $pb (i32.add (local.get $pb) (i32.const 4)))
              (local.set $i (i32.add (local.get $i) (i32.const 1)))
              (br $tail)))
          (local.set $y (i32.add (local.get $y) (i32.const 1)))
          (br $row)))
      (local.set $total (i32.add (local.get $total) (i32.add
        (i32.add (i32x4.extract_lane 0 (local.get $sum)) (i32x4.extract_lane 1 (local.get $sum)))
        (i32.add (i32x4.extract_lane 2 (local.get $sum)) (i32x4.extract_lane 3 (local.get $sum))))))
      (local.set $peak (i32x4.max_u (local.get $peak) (i8x16.shuffle 8 9 10 11 12 13 14 15 0 1 2 3 4 5 6 7 (local.get $peak) (local.get $peak))))
      (local.set $peak (i32x4.max_u (local.get $peak) (i8x16.shuffle 4 5 6 7 0 1 2 3 12 13 14 15 8 9 10 11 (local.get $peak) (local.get $peak))))
      (if (i32.gt_u (i32x4.extract_lane 0 (local.get $peak)) (local.get $most)) (then (local.set $most (i32x4.extract_lane 0 (local.get $peak)))))
      (if (local.get $biasMode)
        (then
          (local.set $dc (i32x4.abs (local.get $dc)))
          (local.set $bias (i32x4.extract_lane 0 (local.get $dc)))
          (if (i32.gt_u (i32x4.extract_lane 1 (local.get $dc)) (local.get $bias))
            (then (local.set $bias (i32x4.extract_lane 1 (local.get $dc)))))
          (if (i32.gt_u (i32x4.extract_lane 2 (local.get $dc)) (local.get $bias))
            (then (local.set $bias (i32x4.extract_lane 2 (local.get $dc)))))
          (local.set $bias (i32.shr_u (local.get $bias) (i32.const 4)))
          (if (i32.gt_u (local.get $bias) (i32.const 255)) (then (local.set $bias (i32.const 255))))))
      (if (local.get $most) (then (local.set $hits (i32.add (local.get $hits) (i32.const 1)))))
      (i32.store (local.get $out) (i32.or (local.get $total) (i32.or (i32.shl (local.get $most) (i32.const 16)) (i32.shl (local.get $bias) (i32.const 24)))))
      (local.set $out (i32.add (local.get $out) (i32.const 4)))
      (local.set $x (i32.add (local.get $x) (i32.const 8)))
      (br $block)))
  (local.get $hits))

;; Exact RGBA8 matches over rows with independent byte strides.
(func $unchangedCount (export "unchangedCount")
  (param $a i32) (param $as i32) (param $b i32) (param $bs i32) (param $w i32) (param $h i32) (result i32)
  (local $y i32) (local $x i32) (local $pa i32) (local $pb i32) (local $kept i32) (local $w16 i32)
  (local.set $w16 (i32.and (local.get $w) (i32.const -16)))
  (block $done
    (loop $row
      (br_if $done (i32.ge_u (local.get $y) (local.get $h)))
      (local.set $pa (i32.add (local.get $a) (i32.mul (local.get $y) (local.get $as))))
      (local.set $pb (i32.add (local.get $b) (i32.mul (local.get $y) (local.get $bs))))
      (local.set $x (i32.const 0))
      (block $vecDone
        (loop $vec
          (br_if $vecDone (i32.ge_u (local.get $x) (local.get $w16)))
          (local.set $kept (i32.add (local.get $kept) (i32.popcnt (i32.or
            (i32.or
              (i32x4.bitmask (i32x4.eq (v128.load (local.get $pa)) (v128.load (local.get $pb))))
              (i32.shl (i32x4.bitmask (i32x4.eq (v128.load offset=16 (local.get $pa)) (v128.load offset=16 (local.get $pb)))) (i32.const 4)))
            (i32.or
              (i32.shl (i32x4.bitmask (i32x4.eq (v128.load offset=32 (local.get $pa)) (v128.load offset=32 (local.get $pb)))) (i32.const 8))
              (i32.shl (i32x4.bitmask (i32x4.eq (v128.load offset=48 (local.get $pa)) (v128.load offset=48 (local.get $pb)))) (i32.const 12)))))))
          (local.set $pa (i32.add (local.get $pa) (i32.const 64)))
          (local.set $pb (i32.add (local.get $pb) (i32.const 64)))
          (local.set $x (i32.add (local.get $x) (i32.const 16)))
          (br $vec)))
      (block $tailDone
        (loop $tail
          (br_if $tailDone (i32.ge_u (local.get $x) (local.get $w)))
          (if (i32.eq (i32.load (local.get $pa)) (i32.load (local.get $pb)))
            (then (local.set $kept (i32.add (local.get $kept) (i32.const 1)))))
          (local.set $pa (i32.add (local.get $pa) (i32.const 4)))
          (local.set $pb (i32.add (local.get $pb) (i32.const 4)))
          (local.set $x (i32.add (local.get $x) (i32.const 1)))
          (br $tail)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $row)))
  (local.get $kept))

;; Mask unchanged pixels in a tight RGBA8 crop. Rows before startRow are preserved fill-up carry.
(func $maskCrop (export "maskCrop")
  (param $prev i32) (param $ps i32) (param $crop i32) (param $w i32) (param $h i32) (param $up i32) (param $startRow i32)
  (local $y i32) (local $x i32) (local $pp i32) (local $pc i32) (local $w4 i32) (local $rgb i32)
  (local.set $y (local.get $startRow))
  (local.set $w4 (i32.shl (local.get $w) (i32.const 2)))
  (block $done
    (loop $row
      (br_if $done (i32.ge_u (local.get $y) (local.get $h)))
      (local.set $pp (i32.add (local.get $prev) (i32.mul (local.get $y) (local.get $ps))))
      (local.set $pc (i32.add (local.get $crop) (i32.mul (local.get $y) (local.get $w4))))
      (local.set $x (i32.const 0))
      (block $rowDone
        (loop $col
          (br_if $rowDone (i32.ge_u (local.get $x) (local.get $w)))
          (if (i32.eq (i32.load (local.get $pp)) (i32.load (local.get $pc)))
            (then
              (if (local.get $up)
                (then
                  (if (local.get $y)
                    (then (local.set $rgb (i32.and (i32.load (i32.sub (local.get $pc) (local.get $w4))) (i32.const 0x00ffffff))))
                    (else (if (local.get $x)
                      (then (local.set $rgb (i32.and (i32.load (i32.sub (local.get $pc) (i32.const 4))) (i32.const 0x00ffffff))))
                      (else (local.set $rgb (i32.const 0)))))))
                (else (local.set $rgb (i32.const 0))))
              (i32.store (local.get $pc) (local.get $rgb))))
          (local.set $pp (i32.add (local.get $pp) (i32.const 4)))
          (local.set $pc (i32.add (local.get $pc) (i32.const 4)))
          (local.set $x (i32.add (local.get $x) (i32.const 1)))
          (br $col)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $row))))

;; Motion anchors and votes share this module and arena with exact comparison kernels.
(func $animCheckExtremumV (param $p i32) (param $stride i32) (param $l i32) (param $c i32) (param $r i32) (param $thresh i32) (result i32)
  (local $pu i32) (local $pd i32) (local $w i32) (local $t i32) (local $m i32) (local $polarity i32)
  (local.set $pu (i32.sub (local.get $p) (local.get $stride)))
  (local.set $pd (i32.add (local.get $p) (local.get $stride)))
  ;; Complementing all lumas reverses signed order for minima; differences then share the maximum predicate.
  (local.set $polarity (select (i32.const 0) (i32.const -1) (i32.gt_s (local.get $c) (local.get $l))))
  (local.set $l (i32.xor (local.get $l) (local.get $polarity)))
  (local.set $c (i32.xor (local.get $c) (local.get $polarity)))
  (local.set $r (i32.xor (local.get $r) (local.get $polarity)))
  (local.set $w (i32.load (local.get $pu)))
  (local.set $m (i32.xor (i32.add (i32.and (local.get $w) (i32.const 255)) (i32.add (i32.and (i32.shr_u (local.get $w) (i32.const 7)) (i32.const 510)) (i32.and (i32.shr_u (local.get $w) (i32.const 16)) (i32.const 255)))) (local.get $polarity)))
  (if (i32.le_s (local.get $c) (local.get $m)) (then (return (i32.const 0))))
  (local.set $w (i32.load (local.get $pd)))
  (local.set $t (i32.xor (i32.add (i32.and (local.get $w) (i32.const 255)) (i32.add (i32.and (i32.shr_u (local.get $w) (i32.const 7)) (i32.const 510)) (i32.and (i32.shr_u (local.get $w) (i32.const 16)) (i32.const 255)))) (local.get $polarity)))
  (if (i32.lt_s (local.get $c) (local.get $t)) (then (return (i32.const 0))))
  (if (i32.lt_s (local.get $t) (local.get $m)) (then (local.set $m (local.get $t))))
  (local.set $w (i32.load (i32.sub (local.get $pu) (i32.const 4))))
  (local.set $t (i32.xor (i32.add (i32.and (local.get $w) (i32.const 255)) (i32.add (i32.and (i32.shr_u (local.get $w) (i32.const 7)) (i32.const 510)) (i32.and (i32.shr_u (local.get $w) (i32.const 16)) (i32.const 255)))) (local.get $polarity)))
  (if (i32.le_s (local.get $c) (local.get $t)) (then (return (i32.const 0))))
  (if (i32.lt_s (local.get $t) (local.get $m)) (then (local.set $m (local.get $t))))
  (local.set $w (i32.load offset=4 (local.get $pu)))
  (local.set $t (i32.xor (i32.add (i32.and (local.get $w) (i32.const 255)) (i32.add (i32.and (i32.shr_u (local.get $w) (i32.const 7)) (i32.const 510)) (i32.and (i32.shr_u (local.get $w) (i32.const 16)) (i32.const 255)))) (local.get $polarity)))
  (if (i32.le_s (local.get $c) (local.get $t)) (then (return (i32.const 0))))
  (if (i32.lt_s (local.get $t) (local.get $m)) (then (local.set $m (local.get $t))))
  (local.set $w (i32.load (i32.sub (local.get $pd) (i32.const 4))))
  (local.set $t (i32.xor (i32.add (i32.and (local.get $w) (i32.const 255)) (i32.add (i32.and (i32.shr_u (local.get $w) (i32.const 7)) (i32.const 510)) (i32.and (i32.shr_u (local.get $w) (i32.const 16)) (i32.const 255)))) (local.get $polarity)))
  (if (i32.lt_s (local.get $c) (local.get $t)) (then (return (i32.const 0))))
  (if (i32.lt_s (local.get $t) (local.get $m)) (then (local.set $m (local.get $t))))
  (local.set $w (i32.load offset=4 (local.get $pd)))
  (local.set $t (i32.xor (i32.add (i32.and (local.get $w) (i32.const 255)) (i32.add (i32.and (i32.shr_u (local.get $w) (i32.const 7)) (i32.const 510)) (i32.and (i32.shr_u (local.get $w) (i32.const 16)) (i32.const 255)))) (local.get $polarity)))
  (if (i32.lt_s (local.get $c) (local.get $t)) (then (return (i32.const 0))))
  (if (i32.lt_s (local.get $t) (local.get $m)) (then (local.set $m (local.get $t))))
  (if (i32.lt_s (local.get $l) (local.get $m)) (then (local.set $m (local.get $l))))
  (if (i32.lt_s (local.get $r) (local.get $m)) (then (local.set $m (local.get $r))))
  (i32.ge_s (i32.sub (local.get $c) (local.get $m)) (local.get $thresh)))

;; 2x2 green sum at byte pointer `$p`.
(func $animBox2G (param $p i32) (param $stride i32) (result i32)
  (i32.add
    (i32.add (i32.load8_u offset=1 (local.get $p)) (i32.load8_u offset=5 (local.get $p)))
    (i32.add (i32.load8_u offset=1 (i32.add (local.get $p) (local.get $stride)))
             (i32.load8_u offset=5 (i32.add (local.get $p) (local.get $stride))))))

;; Translation-covariant signature hash at `$p` (requires 2px margin).
;; Exact mode: FNV-1a over 5x3 RGBA8 patch. Lossy mode: 16-bit 2x2-smoothed Census/BRIEF binary descriptor (no quantization bin edges).
(func $animAnchorHash (param $p i32) (param $stride i32) (param $lossy i32) (result i32)
  (local $h i32) (local $dy i32) (local $dx i32) (local $row i32) (local $first i32) (local $flat i32) (local $v i32)
  (local $c i32) (local $s2 i32) (local $n00 i32) (local $n10 i32) (local $n20 i32) (local $n01 i32) (local $n21 i32) (local $n02 i32) (local $n12 i32) (local $n22 i32)
  (if (i32.eqz (local.get $lossy))
    (then
      (local.set $h (i32.const -2128831035))
      (local.set $first (i32.load (local.get $p)))
      (local.set $flat (i32.const 1))
      (local.set $dy (i32.const -1))
      (block $edone
        (loop $ey
          (br_if $edone (i32.gt_s (local.get $dy) (i32.const 1)))
          (local.set $row (i32.add (local.get $p) (i32.mul (local.get $dy) (local.get $stride))))
          (local.set $dx (i32.const -2))
          (block $exdone
            (loop $ex
              (br_if $exdone (i32.gt_s (local.get $dx) (i32.const 2)))
              (local.set $v (i32.load (i32.add (local.get $row) (i32.shl (local.get $dx) (i32.const 2)))))
              (local.set $flat (i32.and (local.get $flat) (i32.eq (local.get $v) (local.get $first))))
              (local.set $h (i32.mul (i32.xor (local.get $h) (local.get $v)) (i32.const 16777619)))
              (local.set $dx (i32.add (local.get $dx) (i32.const 1)))
              (br $ex)))
          (local.set $dy (i32.add (local.get $dy) (i32.const 1)))
          (br $ey)))
      (if (local.get $flat) (then (return (i32.const 0)))))
    (else
      (local.set $s2 (i32.shl (local.get $stride) (i32.const 1)))
      (local.set $c (call $animBox2G (local.get $p) (local.get $stride)))
      (local.set $n00 (call $animBox2G (i32.sub (i32.sub (local.get $p) (local.get $s2)) (i32.const 8)) (local.get $stride)))
      (local.set $n10 (call $animBox2G (i32.sub (local.get $p) (local.get $s2)) (local.get $stride)))
      (local.set $n20 (call $animBox2G (i32.add (i32.sub (local.get $p) (local.get $s2)) (i32.const 4)) (local.get $stride)))
      (local.set $n01 (call $animBox2G (i32.sub (local.get $p) (i32.const 8)) (local.get $stride)))
      (local.set $n21 (call $animBox2G (i32.add (local.get $p) (i32.const 4)) (local.get $stride)))
      (local.set $n02 (call $animBox2G (i32.sub (i32.add (local.get $p) (local.get $stride)) (i32.const 8)) (local.get $stride)))
      (local.set $n12 (call $animBox2G (i32.add (local.get $p) (local.get $stride)) (local.get $stride)))
      (local.set $n22 (call $animBox2G (i32.add (i32.add (local.get $p) (local.get $stride)) (i32.const 4)) (local.get $stride)))
      (local.set $h (i32.or
        (i32.or
          (i32.or (i32.gt_s (local.get $n00) (local.get $c)) (i32.shl (i32.gt_s (local.get $n10) (local.get $c)) (i32.const 1)))
          (i32.or (i32.shl (i32.gt_s (local.get $n20) (local.get $c)) (i32.const 2)) (i32.shl (i32.gt_s (local.get $n01) (local.get $c)) (i32.const 3))))
        (i32.or
          (i32.or (i32.shl (i32.gt_s (local.get $n21) (local.get $c)) (i32.const 4)) (i32.shl (i32.gt_s (local.get $n02) (local.get $c)) (i32.const 5)))
          (i32.or (i32.shl (i32.gt_s (local.get $n12) (local.get $c)) (i32.const 6)) (i32.shl (i32.gt_s (local.get $n22) (local.get $c)) (i32.const 7))))))
      (local.set $h (i32.or (local.get $h) (i32.shl (i32.or
        (i32.or
          (i32.or (i32.gt_s (local.get $n00) (local.get $n22)) (i32.shl (i32.gt_s (local.get $n10) (local.get $n12)) (i32.const 1)))
          (i32.or (i32.shl (i32.gt_s (local.get $n20) (local.get $n02)) (i32.const 2)) (i32.shl (i32.gt_s (local.get $n01) (local.get $n21)) (i32.const 3))))
        (i32.or
          (i32.or (i32.shl (i32.gt_s (local.get $n00) (local.get $n20)) (i32.const 4)) (i32.shl (i32.gt_s (local.get $n02) (local.get $n22)) (i32.const 5)))
          (i32.or (i32.shl (i32.gt_s (local.get $n00) (local.get $n02)) (i32.const 6)) (i32.shl (i32.shr_u (local.get $c) (i32.const 7)) (i32.const 7)))))
        (i32.const 8))))
      (local.set $h (i32.mul (i32.xor (local.get $h) (i32.const 0x5bd1e995)) (i32.const 16777619)))))
  (if (result i32) (local.get $h) (then (local.get $h)) (else (i32.const 1))))

(func $animInsertAnchor (param $table i32) (param $hash i32) (param $xy i32)
  (local $idx i32) (local $step i32) (local $slot i32) (local $k i32) (local $same i32)
  (local.set $idx (i32.and (i32.mul (local.get $hash) (i32.const -1640531535)) (i32.const 16383)))
  (block $done
    (loop $probe
      (br_if $done (i32.ge_u (local.get $step) (i32.const 8)))
      (local.set $slot (i32.add (local.get $table) (i32.shl (i32.and (i32.add (local.get $idx) (local.get $step)) (i32.const 16383)) (i32.const 3))))
      (local.set $k (i32.load (local.get $slot)))
      (if (i32.eqz (local.get $k))
        (then
          (i32.store (local.get $slot) (local.get $hash))
          (i32.store offset=4 (local.get $slot) (local.get $xy))
          (return)))
      (if (i32.eq (local.get $k) (local.get $hash))
        (then
          (if (i32.eq (i32.load offset=4 (local.get $slot)) (local.get $xy)) (then (return)))
          (local.set $same (i32.add (local.get $same) (i32.const 1)))
          (br_if $done (i32.ge_u (local.get $same) (i32.const 4)))))
      (local.set $step (i32.add (local.get $step) (i32.const 1)))
      (br $probe))))

(func $animAddVote (param $votes i32) (param $dx i32) (param $dy i32) (param $weight i32)
  (local $key i32) (local $idx i32) (local $step i32) (local $slot i32) (local $k i32)
  (if (i32.eqz (i32.or (local.get $dx) (local.get $dy))) (then (return)))
  (local.set $key (i32.or (i32.const 0x40000000) (i32.or
    (i32.and (i32.add (local.get $dx) (i32.const 16384)) (i32.const 32767))
    (i32.shl (i32.and (i32.add (local.get $dy) (i32.const 16384)) (i32.const 32767)) (i32.const 15)))))
  (local.set $idx (i32.and (i32.mul (local.get $key) (i32.const -1640531535)) (i32.const 8191)))
  (block $done
    (loop $probe
      (br_if $done (i32.ge_u (local.get $step) (i32.const 8)))
      (local.set $slot (i32.add (local.get $votes) (i32.shl (i32.and (i32.add (local.get $idx) (local.get $step)) (i32.const 8191)) (i32.const 3))))
      (local.set $k (i32.load (local.get $slot)))
      (if (i32.or (i32.eqz (local.get $k)) (i32.eq (local.get $k) (local.get $key)))
        (then
          (i32.store (local.get $slot) (local.get $key))
          (i32.store offset=4 (local.get $slot) (i32.add (i32.load offset=4 (local.get $slot)) (local.get $weight)))
          (return)))
      (local.set $step (i32.add (local.get $step) (i32.const 1)))
      (br $probe))))

;; Matches anchor at `(ax, ay)` in `before` against stored `(bx, by)` from `after`, voting for `dx = ax - bx, dy = ay - by`.
(func $animMatchAnchor (param $table i32) (param $votes i32) (param $hash i32) (param $ax i32) (param $ay i32) (param $weight i32)
  (local $idx i32) (local $step i32) (local $slot i32) (local $k i32) (local $xy i32) (local $same i32)
  (local.set $idx (i32.and (i32.mul (local.get $hash) (i32.const -1640531535)) (i32.const 16383)))
  (block $done
    (loop $probe
      (br_if $done (i32.ge_u (local.get $step) (i32.const 8)))
      (local.set $slot (i32.add (local.get $table) (i32.shl (i32.and (i32.add (local.get $idx) (local.get $step)) (i32.const 16383)) (i32.const 3))))
      (local.set $k (i32.load (local.get $slot)))
      (br_if $done (i32.eqz (local.get $k)))
      (if (i32.eq (local.get $k) (local.get $hash))
        (then
          (local.set $same (i32.add (local.get $same) (i32.const 1)))
          (br_if $done (i32.gt_u (local.get $same) (i32.const 4)))
          (local.set $xy (i32.load offset=4 (local.get $slot)))
          (call $animAddVote (local.get $votes)
            (i32.sub (local.get $ax) (i32.and (local.get $xy) (i32.const 65535)))
            (i32.sub (local.get $ay) (i32.shr_u (local.get $xy) (i32.const 16)))
            (local.get $weight))))
      (local.set $step (i32.add (local.get $step) (i32.const 1)))
      (br $probe))))

;; Fast 2D shift voting in WASM.
;; Each input holds cropped columns starting at column0, with its declared global row origin.
;; Global x/y coordinates still address the original tile mask and translation votes.
;; Indexes `after` (`$b`, row-strided by `$bStep`) and scans `before` (`$a`, every row) with a 1-load/pixel sliding prefilter.
(func $voteShifts2D (export "voteShifts2D")
  (param $a i32) (param $aRow0 i32) (param $aRows i32)
  (param $b i32) (param $bRow0 i32) (param $bRows i32)
  (param $columns i32) (param $column0 i32) (param $tilesX i32) (param $bx0 i32) (param $bx1 i32) (param $ax0 i32) (param $ax1 i32)
  (param $tilesMask i32) (param $bStep i32) (param $lossy i32) (param $thresh i32) (param $floor i32)
  (param $scratch i32) (param $out i32) (result i32)
  (local $stride i32) (local $votes i32)
  (local $y i32) (local $yEnd i32) (local $tx i32) (local $ty i32) (local $x i32) (local $xEnd i32) (local $p i32)
  (local $w i32) (local $l i32) (local $c i32) (local $r i32) (local $h i32) (local $inserted i32)
  (local $i i32) (local $slot i32) (local $k i32)
  (local $w0 i32) (local $k0 i32) (local $w1 i32) (local $k1 i32) (local $w2 i32) (local $k2 i32) (local $count i32)
  (if (i32.or (i32.lt_u (local.get $aRows) (i32.const 5)) (i32.lt_u (local.get $bRows) (i32.const 5)))
    (then (return (i32.const 0))))
  (local.set $stride (i32.shl (local.get $columns) (i32.const 2)))
  (local.set $votes (i32.add (local.get $scratch) (i32.const 131072)))
  (memory.fill (local.get $scratch) (i32.const 0) (i32.const 196608))

  ;; 1. Index extrema from `after` (`$b`, rows `[2 .. bRows - 2)` stepped by `$bStep`) on active tiles
  (local.set $y (i32.const 2))
  (local.set $yEnd (i32.sub (local.get $bRows) (i32.const 2)))
  (block $bDone
    (loop $bRow
      (br_if $bDone (i32.ge_u (local.get $y) (local.get $yEnd)))
      (local.set $ty (i32.mul (i32.shr_u (i32.add (local.get $bRow0) (local.get $y)) (i32.const 4)) (local.get $tilesX)))
      (local.set $tx (i32.shr_u (local.get $bx0) (i32.const 4)))
      (block $bTileDone
        (loop $bTile
          (br_if $bTileDone (i32.ge_u (i32.shl (local.get $tx) (i32.const 4)) (local.get $bx1)))
          (if (i32.load8_u (i32.add (local.get $tilesMask) (i32.add (local.get $ty) (local.get $tx))))
            (then
              (local.set $x (i32.shl (local.get $tx) (i32.const 4)))
              (if (i32.lt_u (local.get $x) (local.get $bx0)) (then (local.set $x (local.get $bx0))))
              (local.set $xEnd (i32.shl (i32.add (local.get $tx) (i32.const 1)) (i32.const 4)))
              (if (i32.gt_u (local.get $xEnd) (local.get $bx1)) (then (local.set $xEnd (local.get $bx1))))
              (if (i32.lt_u (local.get $x) (local.get $xEnd))
                (then
                  (local.set $p (i32.add (i32.add (local.get $b) (i32.mul (local.get $y) (local.get $stride))) (i32.shl (i32.sub (local.get $x) (local.get $column0)) (i32.const 2))))
                  (local.set $w (i32.load (i32.sub (local.get $p) (i32.const 4))))
                  (local.set $l (i32.add (i32.and (local.get $w) (i32.const 255)) (i32.add (i32.and (i32.shr_u (local.get $w) (i32.const 7)) (i32.const 510)) (i32.and (i32.shr_u (local.get $w) (i32.const 16)) (i32.const 255)))))
                  (local.set $w (i32.load (local.get $p)))
                  (local.set $c (i32.add (i32.and (local.get $w) (i32.const 255)) (i32.add (i32.and (i32.shr_u (local.get $w) (i32.const 7)) (i32.const 510)) (i32.and (i32.shr_u (local.get $w) (i32.const 16)) (i32.const 255)))))
                  (block $bColDone
                    (loop $bCol
                      (br_if $bColDone (i32.ge_u (local.get $x) (local.get $xEnd)))
                      (local.set $w (i32.load offset=4 (local.get $p)))
                      (local.set $r (i32.add (i32.and (local.get $w) (i32.const 255)) (i32.add (i32.and (i32.shr_u (local.get $w) (i32.const 7)) (i32.const 510)) (i32.and (i32.shr_u (local.get $w) (i32.const 16)) (i32.const 255)))))
                      (if (i32.or
                            (i32.and (i32.gt_s (local.get $c) (local.get $l)) (i32.ge_s (local.get $c) (local.get $r)))
                            (i32.and (i32.lt_s (local.get $c) (local.get $l)) (i32.le_s (local.get $c) (local.get $r))))
                        (then
                          (if (call $animCheckExtremumV (local.get $p) (local.get $stride) (local.get $l) (local.get $c) (local.get $r) (local.get $thresh))
                            (then
                              (local.set $h (call $animAnchorHash (local.get $p) (local.get $stride) (local.get $lossy)))
                              (if (local.get $h)
                                (then
                                  (call $animInsertAnchor (local.get $scratch) (local.get $h)
                                    (i32.or (local.get $x) (i32.shl (i32.add (local.get $bRow0) (local.get $y)) (i32.const 16))))
                                  (local.set $inserted (i32.add (local.get $inserted) (i32.const 1)))
                                  (br_if $bDone (i32.ge_u (local.get $inserted) (i32.const 6144)))))))))
                      (local.set $l (local.get $c))
                      (local.set $c (local.get $r))
                      (local.set $p (i32.add (local.get $p) (i32.const 4)))
                      (local.set $x (i32.add (local.get $x) (i32.const 1)))
                      (br $bCol)))))))
          (local.set $tx (i32.add (local.get $tx) (i32.const 1)))
          (br $bTile)))
      (local.set $y (i32.add (local.get $y) (local.get $bStep)))
      (br $bRow)))

  (if (i32.lt_u (local.get $inserted) (i32.const 2)) (then (return (i32.const 0))))

  ;; 2. Scan `before` (`$a`) densely across `[ax0 .. ax1)` and rows `[2 .. aRows - 2)`
  (local.set $y (i32.const 2))
  (local.set $yEnd (i32.sub (local.get $aRows) (i32.const 2)))
  (block $aDone
    (loop $aRow
      (br_if $aDone (i32.ge_u (local.get $y) (local.get $yEnd)))
      (local.set $x (local.get $ax0))
      (local.set $p (i32.add (i32.add (local.get $a) (i32.mul (local.get $y) (local.get $stride))) (i32.shl (i32.sub (local.get $x) (local.get $column0)) (i32.const 2))))
      (local.set $w (i32.load (i32.sub (local.get $p) (i32.const 4))))
      (local.set $l (i32.add (i32.and (local.get $w) (i32.const 255)) (i32.add (i32.and (i32.shr_u (local.get $w) (i32.const 7)) (i32.const 510)) (i32.and (i32.shr_u (local.get $w) (i32.const 16)) (i32.const 255)))))
      (local.set $w (i32.load (local.get $p)))
      (local.set $c (i32.add (i32.and (local.get $w) (i32.const 255)) (i32.add (i32.and (i32.shr_u (local.get $w) (i32.const 7)) (i32.const 510)) (i32.and (i32.shr_u (local.get $w) (i32.const 16)) (i32.const 255)))))
      (block $aColDone
        (loop $aCol
          (br_if $aColDone (i32.ge_u (local.get $x) (local.get $ax1)))
          (local.set $w (i32.load offset=4 (local.get $p)))
          (local.set $r (i32.add (i32.and (local.get $w) (i32.const 255)) (i32.add (i32.and (i32.shr_u (local.get $w) (i32.const 7)) (i32.const 510)) (i32.and (i32.shr_u (local.get $w) (i32.const 16)) (i32.const 255)))))
          (if (i32.or
                (i32.and (i32.gt_s (local.get $c) (local.get $l)) (i32.ge_s (local.get $c) (local.get $r)))
                (i32.and (i32.lt_s (local.get $c) (local.get $l)) (i32.le_s (local.get $c) (local.get $r))))
            (then
              (if (call $animCheckExtremumV (local.get $p) (local.get $stride) (local.get $l) (local.get $c) (local.get $r) (local.get $thresh))
                (then
                  (local.set $h (call $animAnchorHash (local.get $p) (local.get $stride) (local.get $lossy)))
                  (if (local.get $h)
                    (then (call $animMatchAnchor (local.get $scratch) (local.get $votes) (local.get $h)
                            (local.get $x) (i32.add (local.get $aRow0) (local.get $y)) (i32.const 8))))))))
          (local.set $l (local.get $c))
          (local.set $c (local.get $r))
          (local.set $p (i32.add (local.get $p) (i32.const 4)))
          (local.set $x (i32.add (local.get $x) (i32.const 1)))
          (br $aCol)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $aRow)))

  (local.set $i (i32.const 0))
  (block $scanDone
    (loop $scan
      (br_if $scanDone (i32.ge_u (local.get $i) (i32.const 8192)))
      (local.set $slot (i32.add (local.get $votes) (i32.shl (local.get $i) (i32.const 3))))
      (local.set $k (i32.load (local.get $slot)))
      (if (local.get $k)
        (then
          (local.set $w (i32.load offset=4 (local.get $slot)))
          (if (i32.ge_u (local.get $w) (local.get $floor))
            (then
              (if (i32.gt_u (local.get $w) (local.get $w0))
                (then
                  (local.set $w2 (local.get $w1)) (local.set $k2 (local.get $k1))
                  (local.set $w1 (local.get $w0)) (local.set $k1 (local.get $k0))
                  (local.set $w0 (local.get $w)) (local.set $k0 (local.get $k)))
                (else (if (i32.gt_u (local.get $w) (local.get $w1))
                  (then
                    (local.set $w2 (local.get $w1)) (local.set $k2 (local.get $k1))
                    (local.set $w1 (local.get $w)) (local.set $k1 (local.get $k)))
                  (else (if (i32.gt_u (local.get $w) (local.get $w2))
                    (then (local.set $w2 (local.get $w)) (local.set $k2 (local.get $k))))))))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $scan)))

  (if (local.get $w0)
    (then
      (i32.store (local.get $out) (i32.sub (i32.and (local.get $k0) (i32.const 32767)) (i32.const 16384)))
      (i32.store offset=4 (local.get $out) (i32.sub (i32.and (i32.shr_u (local.get $k0) (i32.const 15)) (i32.const 32767)) (i32.const 16384)))
      (i32.store offset=8 (local.get $out) (local.get $w0))
      (local.set $count (i32.const 1))))
  (if (local.get $w1)
    (then
      (i32.store offset=12 (local.get $out) (i32.sub (i32.and (local.get $k1) (i32.const 32767)) (i32.const 16384)))
      (i32.store offset=16 (local.get $out) (i32.sub (i32.and (i32.shr_u (local.get $k1) (i32.const 15)) (i32.const 32767)) (i32.const 16384)))
      (i32.store offset=20 (local.get $out) (local.get $w1))
      (local.set $count (i32.const 2))))
  (if (local.get $w2)
    (then
      (i32.store offset=24 (local.get $out) (i32.sub (i32.and (local.get $k2) (i32.const 32767)) (i32.const 16384)))
      (i32.store offset=28 (local.get $out) (i32.sub (i32.and (i32.shr_u (local.get $k2) (i32.const 15)) (i32.const 32767)) (i32.const 16384)))
      (i32.store offset=32 (local.get $out) (i32.sub (local.get $w2) (i32.const 0)))
      (local.set $count (i32.const 3))))
  (local.get $count))

;; Copy ($add = 0) or add ($add = 1) binary32 plane rows in place using v128 f32x4 SIMD.
(func $xybAddRows (export "xybAddRows")
  (param $dst i32) (param $ds i32) (param $src i32) (param $ss i32) (param $w i32) (param $rows i32) (param $add i32)
  (local $y i32) (local $x i32) (local $pd i32) (local $ps i32) (local $w4 i32)
  (local.set $w4 (i32.and (local.get $w) (i32.const -4)))
  (block $done
    (loop $row
      (br_if $done (i32.ge_u (local.get $y) (local.get $rows)))
      (local.set $pd (i32.add (local.get $dst) (i32.mul (local.get $y) (local.get $ds))))
      (local.set $ps (i32.add (local.get $src) (i32.mul (local.get $y) (local.get $ss))))
      (local.set $x (i32.const 0))
      (if (local.get $add)
        (then
          (block $vecAddDone
            (loop $vecAdd
              (br_if $vecAddDone (i32.ge_u (local.get $x) (local.get $w4)))
              (v128.store (local.get $pd) (f32x4.add (v128.load (local.get $pd)) (v128.load (local.get $ps))))
              (local.set $pd (i32.add (local.get $pd) (i32.const 16)))
              (local.set $ps (i32.add (local.get $ps) (i32.const 16)))
              (local.set $x (i32.add (local.get $x) (i32.const 4)))
              (br $vecAdd)))
          (block $tailAddDone
            (loop $tailAdd
              (br_if $tailAddDone (i32.ge_u (local.get $x) (local.get $w)))
              (f32.store (local.get $pd) (f32.add (f32.load (local.get $pd)) (f32.load (local.get $ps))))
              (local.set $pd (i32.add (local.get $pd) (i32.const 4)))
              (local.set $ps (i32.add (local.get $ps) (i32.const 4)))
              (local.set $x (i32.add (local.get $x) (i32.const 1)))
              (br $tailAdd))))
        (else
          (block $vecCopyDone
            (loop $vecCopy
              (br_if $vecCopyDone (i32.ge_u (local.get $x) (local.get $w4)))
              (v128.store (local.get $pd) (v128.load (local.get $ps)))
              (local.set $pd (i32.add (local.get $pd) (i32.const 16)))
              (local.set $ps (i32.add (local.get $ps) (i32.const 16)))
              (local.set $x (i32.add (local.get $x) (i32.const 4)))
              (br $vecCopy)))
          (block $tailCopyDone
            (loop $tailCopy
              (br_if $tailCopyDone (i32.ge_u (local.get $x) (local.get $w)))
              (f32.store (local.get $pd) (f32.load (local.get $ps)))
              (local.set $pd (i32.add (local.get $pd) (i32.const 4)))
              (local.set $ps (i32.add (local.get $ps) (i32.const 4)))
              (local.set $x (i32.add (local.get $x) (i32.const 1)))
              (br $tailCopy)))))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $row))))

;; Sum of |targetY[y, x] - 255 * refY[y, x]| over rows using f64x2 and f32x4 SIMD.
(func $xybShiftL1 (export "xybShiftL1")
  (param $tY i32) (param $ts i32) (param $rY i32) (param $rs i32) (param $w i32) (param $rows i32) (result f64)
  (local $y i32) (local $x i32) (local $pt i32) (local $pr i32) (local $w4 i32)
  (local $rf v128) (local $scale v128) (local $acc v128) (local $tail f64)
  (local.set $w4 (i32.and (local.get $w) (i32.const -4)))
  (local.set $scale (v128.const f64x2 255.0 255.0))
  (local.set $acc (v128.const f64x2 0.0 0.0))
  (block $done
    (loop $row
      (br_if $done (i32.ge_u (local.get $y) (local.get $rows)))
      (local.set $pt (i32.add (local.get $tY) (i32.mul (local.get $y) (local.get $ts))))
      (local.set $pr (i32.add (local.get $rY) (i32.mul (local.get $y) (local.get $rs))))
      (local.set $x (i32.const 0))
      (block $vecDone
        (loop $vec
          (br_if $vecDone (i32.ge_u (local.get $x) (local.get $w4)))
          (local.set $rf (v128.load (local.get $pr)))
          (local.set $acc (f64x2.add (local.get $acc)
            (f64x2.abs (f64x2.sub (v128.load (local.get $pt))
              (f64x2.mul (f64x2.promote_low_f32x4 (local.get $rf)) (local.get $scale))))))
          (local.set $acc (f64x2.add (local.get $acc)
            (f64x2.abs (f64x2.sub (v128.load offset=16 (local.get $pt))
              (f64x2.mul (f64x2.promote_low_f32x4 (i8x16.shuffle 8 9 10 11 12 13 14 15 8 9 10 11 12 13 14 15 (local.get $rf) (local.get $rf))) (local.get $scale))))))
          (local.set $pt (i32.add (local.get $pt) (i32.const 32)))
          (local.set $pr (i32.add (local.get $pr) (i32.const 16)))
          (local.set $x (i32.add (local.get $x) (i32.const 4)))
          (br $vec)))
      (block $tailDone
        (loop $tailLoop
          (br_if $tailDone (i32.ge_u (local.get $x) (local.get $w)))
          (local.set $tail (f64.add (local.get $tail)
            (f64.abs (f64.sub (f64.load (local.get $pt))
              (f64.mul (f64.promote_f32 (f32.load (local.get $pr))) (f64.const 255.0))))))
          (local.set $pt (i32.add (local.get $pt) (i32.const 8)))
          (local.set $pr (i32.add (local.get $pr) (i32.const 4)))
          (local.set $x (i32.add (local.get $x) (i32.const 1)))
          (br $tailLoop)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $row)))
  (f64.add (local.get $tail)
    (f64.add (f64x2.extract_lane 0 (local.get $acc)) (f64x2.extract_lane 1 (local.get $acc)))))

;; Compute signed pre-color XYB residual rows in 255x opsin units, clamping [w..wPad) to column w - 1.
(func $xybDeltaRows (export "xybDeltaRows")
  (param $tX i32) (param $tY i32) (param $tB i32)
  (param $pX i32) (param $pY i32) (param $pB i32)
  (param $oX i32) (param $oY i32) (param $oB i32)
  (param $w i32) (param $wPad i32) (param $rows i32)
  (local $y i32) (local $x i32) (local $w4 i32) (local $tStride i32) (local $pStride i32)
  (local $tx i32) (local $ty i32) (local $tb i32) (local $px i32) (local $py i32) (local $pb i32)
  (local $ox i32) (local $oy i32) (local $ob i32)
  (local $vx v128) (local $vy v128) (local $vb v128) (local $ryLo v128) (local $ryHi v128) (local $scale v128)
  (local $lx f64) (local $ly f64) (local $lb f64) (local $ry f64)
  (local.set $w4 (i32.and (local.get $w) (i32.const -4)))
  (local.set $tStride (i32.shl (local.get $wPad) (i32.const 3)))
  (local.set $pStride (i32.shl (local.get $w) (i32.const 2)))
  (local.set $scale (v128.const f64x2 255.0 255.0))
  (block $done
    (loop $row
      (br_if $done (i32.ge_u (local.get $y) (local.get $rows)))
      (local.set $tx (i32.add (local.get $tX) (i32.mul (local.get $y) (local.get $tStride))))
      (local.set $ty (i32.add (local.get $tY) (i32.mul (local.get $y) (local.get $tStride))))
      (local.set $tb (i32.add (local.get $tB) (i32.mul (local.get $y) (local.get $tStride))))
      (local.set $ox (i32.add (local.get $oX) (i32.mul (local.get $y) (local.get $tStride))))
      (local.set $oy (i32.add (local.get $oY) (i32.mul (local.get $y) (local.get $tStride))))
      (local.set $ob (i32.add (local.get $oB) (i32.mul (local.get $y) (local.get $tStride))))
      (local.set $px (i32.add (local.get $pX) (i32.mul (local.get $y) (local.get $pStride))))
      (local.set $py (i32.add (local.get $pY) (i32.mul (local.get $y) (local.get $pStride))))
      (local.set $pb (i32.add (local.get $pB) (i32.mul (local.get $y) (local.get $pStride))))
      (local.set $x (i32.const 0))
      (block $vecDone
        (loop $vec
          (br_if $vecDone (i32.ge_u (local.get $x) (local.get $w4)))
          (local.set $vx (v128.load (local.get $px)))
          (local.set $vy (v128.load (local.get $py)))
          (local.set $vb (v128.load (local.get $pb)))
          (local.set $ryLo (f64x2.promote_low_f32x4 (local.get $vy)))
          (local.set $ryHi (f64x2.promote_low_f32x4 (i8x16.shuffle 8 9 10 11 12 13 14 15 8 9 10 11 12 13 14 15 (local.get $vy) (local.get $vy))))
          (v128.store (local.get $ox) (f64x2.sub (v128.load (local.get $tx))
            (f64x2.mul (f64x2.promote_low_f32x4 (local.get $vx)) (local.get $scale))))
          (v128.store offset=16 (local.get $ox) (f64x2.sub (v128.load offset=16 (local.get $tx))
            (f64x2.mul (f64x2.promote_low_f32x4 (i8x16.shuffle 8 9 10 11 12 13 14 15 8 9 10 11 12 13 14 15 (local.get $vx) (local.get $vx))) (local.get $scale))))
          (v128.store (local.get $oy) (f64x2.sub (v128.load (local.get $ty))
            (f64x2.mul (local.get $ryLo) (local.get $scale))))
          (v128.store offset=16 (local.get $oy) (f64x2.sub (v128.load offset=16 (local.get $ty))
            (f64x2.mul (local.get $ryHi) (local.get $scale))))
          (v128.store (local.get $ob) (f64x2.sub (v128.load (local.get $tb))
            (f64x2.mul (f64x2.sub (f64x2.promote_low_f32x4 (local.get $vb)) (local.get $ryLo)) (local.get $scale))))
          (v128.store offset=16 (local.get $ob) (f64x2.sub (v128.load offset=16 (local.get $tb))
            (f64x2.mul (f64x2.sub (f64x2.promote_low_f32x4 (i8x16.shuffle 8 9 10 11 12 13 14 15 8 9 10 11 12 13 14 15 (local.get $vb) (local.get $vb))) (local.get $ryHi)) (local.get $scale))))
          (local.set $tx (i32.add (local.get $tx) (i32.const 32)))
          (local.set $ty (i32.add (local.get $ty) (i32.const 32)))
          (local.set $tb (i32.add (local.get $tb) (i32.const 32)))
          (local.set $ox (i32.add (local.get $ox) (i32.const 32)))
          (local.set $oy (i32.add (local.get $oy) (i32.const 32)))
          (local.set $ob (i32.add (local.get $ob) (i32.const 32)))
          (local.set $px (i32.add (local.get $px) (i32.const 16)))
          (local.set $py (i32.add (local.get $py) (i32.const 16)))
          (local.set $pb (i32.add (local.get $pb) (i32.const 16)))
          (local.set $x (i32.add (local.get $x) (i32.const 4)))
          (br $vec)))
      (block $tailDone
        (loop $tailLoop
          (br_if $tailDone (i32.ge_u (local.get $x) (local.get $w)))
          (local.set $ry (f64.promote_f32 (f32.load (local.get $py))))
          (f64.store (local.get $ox) (f64.sub (f64.load (local.get $tx))
            (f64.mul (f64.promote_f32 (f32.load (local.get $px))) (f64.const 255.0))))
          (f64.store (local.get $oy) (f64.sub (f64.load (local.get $ty))
            (f64.mul (local.get $ry) (f64.const 255.0))))
          (f64.store (local.get $ob) (f64.sub (f64.load (local.get $tb))
            (f64.mul (f64.sub (f64.promote_f32 (f32.load (local.get $pb))) (local.get $ry)) (f64.const 255.0))))
          (local.set $tx (i32.add (local.get $tx) (i32.const 8)))
          (local.set $ty (i32.add (local.get $ty) (i32.const 8)))
          (local.set $tb (i32.add (local.get $tb) (i32.const 8)))
          (local.set $ox (i32.add (local.get $ox) (i32.const 8)))
          (local.set $oy (i32.add (local.get $oy) (i32.const 8)))
          (local.set $ob (i32.add (local.get $ob) (i32.const 8)))
          (local.set $px (i32.add (local.get $px) (i32.const 4)))
          (local.set $py (i32.add (local.get $py) (i32.const 4)))
          (local.set $pb (i32.add (local.get $pb) (i32.const 4)))
          (local.set $x (i32.add (local.get $x) (i32.const 1)))
          (br $tailLoop)))
      (if (i32.lt_u (local.get $w) (local.get $wPad))
        (then
          (local.set $lx (f64.load (i32.sub (local.get $ox) (i32.const 8))))
          (local.set $ly (f64.load (i32.sub (local.get $oy) (i32.const 8))))
          (local.set $lb (f64.load (i32.sub (local.get $ob) (i32.const 8))))
          (block $padDone
            (loop $pad
              (br_if $padDone (i32.ge_u (local.get $x) (local.get $wPad)))
              (f64.store (local.get $ox) (local.get $lx))
              (f64.store (local.get $oy) (local.get $ly))
              (f64.store (local.get $ob) (local.get $lb))
              (local.set $ox (i32.add (local.get $ox) (i32.const 8)))
              (local.set $oy (i32.add (local.get $oy) (i32.const 8)))
              (local.set $ob (i32.add (local.get $ob) (i32.const 8)))
              (local.set $x (i32.add (local.get $x) (i32.const 1)))
              (br $pad)))))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $row))))
(func $animSmearSheet (export "animSmearSheet")
  (param $sheet i32) (param $filled i32) (param $sw i32) (param $sh i32)
  (local $r i32) (local $c i32) (local $base i32) (local $firstCol i32) (local $pix i32) (local $rowBytes i32)
  (local.set $rowBytes (i32.shl (local.get $sw) (i32.const 2)))
  (block $done (loop $rLoop
    (br_if $done (i32.ge_u (local.get $r) (local.get $sh)))
    (local.set $base (i32.mul (local.get $r) (local.get $sw)))
    (local.set $firstCol (i32.const -1)) (local.set $c (i32.const 0))
    (block $findDone (loop $findLoop
      (br_if $findDone (i32.ge_u (local.get $c) (local.get $sw)))
      (if (i32.load8_u (i32.add (local.get $filled) (i32.add (local.get $base) (local.get $c))))
        (then (local.set $firstCol (local.get $c)) (br $findDone)))
      (local.set $c (i32.add (local.get $c) (i32.const 1)))
      (br $findLoop)))
    (if (i32.lt_s (local.get $firstCol) (i32.const 0))
      (then (if (i32.gt_u (local.get $r) (i32.const 0))
        (then (memory.copy (i32.add (local.get $sheet) (i32.shl (local.get $base) (i32.const 2)))
                           (i32.add (local.get $sheet) (i32.shl (i32.sub (local.get $base) (local.get $sw)) (i32.const 2)))
                           (local.get $rowBytes)))))
      (else
        (local.set $pix (i32.load (i32.add (local.get $sheet) (i32.shl (i32.add (local.get $base) (local.get $firstCol)) (i32.const 2)))))
        (local.set $c (i32.const 0))
        (block $leftDone (loop $leftLoop
          (br_if $leftDone (i32.ge_s (local.get $c) (local.get $firstCol)))
          (i32.store (i32.add (local.get $sheet) (i32.shl (i32.add (local.get $base) (local.get $c)) (i32.const 2))) (local.get $pix))
          (local.set $c (i32.add (local.get $c) (i32.const 1)))
          (br $leftLoop)))
        (local.set $c (i32.add (local.get $firstCol) (i32.const 1)))
        (block $rightDone (loop $rightLoop
          (br_if $rightDone (i32.ge_u (local.get $c) (local.get $sw)))
          (if (i32.load8_u (i32.add (local.get $filled) (i32.add (local.get $base) (local.get $c))))
            (then (local.set $pix (i32.load (i32.add (local.get $sheet) (i32.shl (i32.add (local.get $base) (local.get $c)) (i32.const 2))))))
            (else (i32.store (i32.add (local.get $sheet) (i32.shl (i32.add (local.get $base) (local.get $c)) (i32.const 2))) (local.get $pix))))
          (local.set $c (i32.add (local.get $c) (i32.const 1)))
          (br $rightLoop)))))
    (local.set $r (i32.add (local.get $r) (i32.const 1)))
    (br $rLoop))))

(func $animEqualBytes (export "animEqualBytes") (param $a i32) (param $b i32) (param $len i32) (result i32)
  (local $i i32) (local $end16 i32)
  (local.set $end16 (i32.and (local.get $len) (i32.const -16)))
  (block $vDone (loop $vLoop
    (br_if $vDone (i32.ge_u (local.get $i) (local.get $end16)))
    (if (i32.ne (i8x16.bitmask (i8x16.eq (v128.load (i32.add (local.get $a) (local.get $i)))
                                         (v128.load (i32.add (local.get $b) (local.get $i))))) (i32.const 0xffff))
      (then (return (i32.const 0))))
    (local.set $i (i32.add (local.get $i) (i32.const 16)))
    (br $vLoop)))
  (block $tDone (loop $tLoop
    (br_if $tDone (i32.ge_u (local.get $i) (local.get $len)))
    (if (i32.ne (i32.load8_u (i32.add (local.get $a) (local.get $i))) (i32.load8_u (i32.add (local.get $b) (local.get $i))))
      (then (return (i32.const 0))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $tLoop)))
  (i32.const 1))
