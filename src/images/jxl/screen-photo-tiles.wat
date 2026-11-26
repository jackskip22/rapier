;; SPDX-License-Identifier: MIT
;; 32 px cell classifiers and page-photo pixel/block kernels, in multi-row SIMD bands.
;; Alpha never participates.
(func $photoRgbStep (param $a v128) (param $b v128) (result v128)
  (local $d v128)
  (local.set $d (v128.or (i8x16.sub_sat_u (local.get $a) (local.get $b))
    (i8x16.sub_sat_u (local.get $b) (local.get $a))))
  (i8x16.max_u
    (i8x16.max_u (local.get $d) (i32x4.shr_u (local.get $d) (i32.const 8)))
    (i32x4.shr_u (local.get $d) (i32.const 16))))

;; Saturated |dR| + |dG| + |dB| in byte lanes 0, 4, 8, 12; exact for thresholds below 255.
(func $photoRgbSum (param $a v128) (param $b v128) (result v128)
  (local $d v128)
  (local.set $d (v128.or (i8x16.sub_sat_u (local.get $a) (local.get $b))
    (i8x16.sub_sat_u (local.get $b) (local.get $a))))
  (i8x16.add_sat_u
    (i8x16.add_sat_u (local.get $d) (i32x4.shr_u (local.get $d) (i32.const 8)))
    (i32x4.shr_u (local.get $d) (i32.const 16))))

;; Whether every 4x4-sampled pixel's RGB channels lie within 12 of each other.
(func $photoNearGrey (param $base i32) (param $stride i32) (result i32)
  (local $y i32) (local $half i32) (local $at i32)
  (local $p v128) (local $g v128) (local $b v128)
  (loop $rows
    (local.set $half (i32.const 0))
    (local.set $at (i32.add (local.get $base) (i32.mul (local.get $y) (local.get $stride))))
    (loop $halves
      (local.set $p
        (v128.load32_lane offset=48 3 (local.get $at)
          (v128.load32_lane offset=32 2 (local.get $at)
            (v128.load32_lane offset=16 1 (local.get $at)
              (v128.load32_zero (local.get $at))))))
      (local.set $g (i32x4.shr_u (local.get $p) (i32.const 8)))
      (local.set $b (i32x4.shr_u (local.get $p) (i32.const 16)))
      (if (i32.and (i32.const 4369) (i8x16.bitmask (i8x16.ge_u
        (i8x16.sub
          (i8x16.max_u (i8x16.max_u (local.get $p) (local.get $g)) (local.get $b))
          (i8x16.min_u (i8x16.min_u (local.get $p) (local.get $g)) (local.get $b)))
        (i8x16.splat (i32.const 13)))))
        (then (return (i32.const 0))))
      (local.set $at (i32.add (local.get $at) (i32.const 64)))
      (local.set $half (i32.add (local.get $half) (i32.const 1)))
      (br_if $halves (i32.lt_u (local.get $half) (i32.const 2))))
    (local.set $y (i32.add (local.get $y) (i32.const 4)))
    (br_if $rows (i32.lt_u (local.get $y) (i32.const 32))))
  (i32.const 1))

;; Generation-stamped 1024-slot open-addressed table at `scratch` (0..4095 stamps, 4096 stamp, 4100..8195 keys).
(func $photoHasColors
  (param $need i32) (param $stride i32) (param $at i32) (param $cols i32) (param $rows i32)
  (param $dx i32) (param $dy i32) (param $tuple i32) (param $scratch i32) (result i32)
  (local $stamp i32) (local $count i32) (local $v i32) (local $u i32) (local $p i32)
  (local $k i32) (local $s i32) (local $slot i32)
  (local.set $stamp (i32.add (i32.load offset=4096 (local.get $scratch)) (i32.const 1)))
  (if (i32.eqz (local.get $stamp)) (then
    (memory.fill (local.get $scratch) (i32.const 0) (i32.const 4096))
    (local.set $stamp (i32.const 1))))
  (i32.store offset=4096 (local.get $scratch) (local.get $stamp))
  (loop $vs
    (local.set $u (i32.const 0))
    (local.set $p (i32.add (local.get $at) (i32.mul (local.get $v) (local.get $dy))))
    (loop $us
      (local.set $k (if (result i32) (local.get $tuple)
        (then (i32.or (i32.load8_u (local.get $p))
          (i32.or (i32.shl (i32.load8_u offset=4 (local.get $p)) (i32.const 8))
            (i32.shl (i32.load8_u (i32.add (local.get $p) (local.get $stride))) (i32.const 16)))))
        (else (i32.and (i32.load (local.get $p)) (i32.const 0xffffff)))))
      (local.set $s (i32.and (i32.mul
        (i32.xor (local.get $k) (i32.shr_u (local.get $k) (i32.const 16)))
        (i32.const 0x9e3779b1)) (i32.const 1023)))
      (block $probed
        (loop $probe
          (local.set $slot (i32.add (local.get $scratch) (i32.shl (local.get $s) (i32.const 2))))
          (br_if $probed (i32.ne (i32.load (local.get $slot)) (local.get $stamp)))
          (br_if $probed (i32.eq (i32.load offset=4100 (local.get $slot)) (local.get $k)))
          (local.set $s (i32.and (i32.add (local.get $s) (i32.const 1)) (i32.const 1023)))
          (br $probe)))
      (if (i32.ne (i32.load (local.get $slot)) (local.get $stamp)) (then
        (local.set $count (i32.add (local.get $count) (i32.const 1)))
        (if (i32.ge_u (local.get $count) (local.get $need)) (then (return (i32.const 1))))
        (i32.store (local.get $slot) (local.get $stamp))
        (i32.store offset=4100 (local.get $slot) (local.get $k))))
      (local.set $p (i32.add (local.get $p) (local.get $dx)))
      (local.set $u (i32.add (local.get $u) (i32.const 1)))
      (br_if $us (i32.lt_u (local.get $u) (local.get $cols))))
    (local.set $v (i32.add (local.get $v) (i32.const 1)))
    (br_if $vs (i32.lt_u (local.get $v) (local.get $rows))))
  (i32.const 0))

;; Band of `rows * 32` pixel rows, `cols` whole 32 px cells wide, RGBA bytes, `stride` bytes per pixel row.
(func $photoTextTiles (export "photoTextTiles")
  (param $pixels i32) (param $stride i32) (param $cols i32) (param $rows i32) (param $output i32) (result i32)
  (local $row i32) (local $col i32) (local $idx i32) (local $base i32)
  (local $y i32) (local $x i32) (local $at i32)
  (local $medium i32) (local $flat i32) (local $steps i32) (local $text i32) (local $found i32)
  (local $mask i32) (local $h v128) (local $v v128) (local $a v128)
  (block $done
    (loop $bandRows
      (br_if $done (i32.ge_u (local.get $row) (local.get $rows)))
      (local.set $col (i32.const 0))
      (loop $cells
        (if (i32.lt_u (local.get $col) (local.get $cols)) (then
          (local.set $base (i32.add (local.get $pixels)
            (i32.add (i32.shl (local.get $col) (i32.const 7))
              (i32.mul (i32.shl (local.get $row) (i32.const 5)) (local.get $stride)))))
          (local.set $y (i32.const 0))
          (local.set $medium (i32.const 0))
          (local.set $flat (i32.const 0))
          (local.set $steps (i32.const 0))
          (block $scanned
            (loop $rowsLoop
              (local.set $x (i32.const 0))
              (local.set $at (i32.add (local.get $base) (i32.mul (local.get $y) (local.get $stride))))
              (loop $pixels4
                (local.set $a (v128.load (local.get $at)))
                (local.set $h (call $photoRgbStep (local.get $a) (v128.load offset=4 (local.get $at))))
                (local.set $v (call $photoRgbStep (local.get $a)
                  (v128.load (i32.add (local.get $at) (local.get $stride)))))
                (local.set $mask (select (i32.const 273) (i32.const 4369)
                  (i32.eq (local.get $x) (i32.const 28))))
                (local.set $medium (i32.add (local.get $medium) (i32.popcnt
                  (i32.and (local.get $mask) (i8x16.bitmask (v128.and
                    (i8x16.ge_u (local.get $h) (i8x16.splat (i32.const 3)))
                    (i8x16.lt_u (local.get $h) (i8x16.splat (i32.const 24)))))))))
                (br_if $scanned (i32.ge_u (local.get $medium) (i32.const 97)))
                (local.set $flat (i32.add (local.get $flat) (i32.popcnt
                  (i32.and (local.get $mask) (i8x16.bitmask
                    (i8x16.lt_u (local.get $h) (i8x16.splat (i32.const 3))))))))
                (local.set $steps (i32.add (local.get $steps) (i32.popcnt
                  (i32.and (local.get $mask) (i8x16.bitmask
                    (i8x16.ge_u (i8x16.max_u (local.get $h) (local.get $v))
                      (i8x16.splat (i32.const 24))))))))
                (local.set $at (i32.add (local.get $at) (i32.const 16)))
                (local.set $x (i32.add (local.get $x) (i32.const 4)))
                (br_if $pixels4 (i32.lt_u (local.get $x) (i32.const 31))))
              (local.set $y (i32.add (local.get $y) (i32.const 1)))
              (br_if $rowsLoop (i32.lt_u (local.get $y) (i32.const 31)))))
          (local.set $found (i32.and
            (i32.ge_u (local.get $steps) (i32.const 64))
            (i32.and (i32.lt_u (local.get $medium) (i32.const 97))
              (i32.ge_u (local.get $flat) (i32.const 241)))))
          (if (local.get $output) (then
            (i32.store8 (i32.add (local.get $output) (local.get $idx)) (local.get $found))))
          (local.set $text (i32.add (local.get $text) (local.get $found)))
          (local.set $idx (i32.add (local.get $idx) (i32.const 1)))
          (local.set $col (i32.add (local.get $col) (i32.const 1)))
          (br $cells))))
      (local.set $row (i32.add (local.get $row) (i32.const 1)))
      (br $bandRows)))
  (local.get $text))

;; Photo support and seed classification (0 none, 1 support, 2 seed) across `rows` x `cols` 32 px cells.
(func $photoSupportTiles (export "photoSupportTiles")
  (param $pixels i32) (param $stride i32) (param $cols i32) (param $rows i32) (param $output i32) (param $scratch i32) (result i32)
  (local $row i32) (local $col i32) (local $idx i32) (local $base i32) (local $s2 i32) (local $s8 i32)
  (local $y i32) (local $x i32) (local $at i32) (local $runs i32) (local $tuple i32) (local $quad i32) (local $many i32)
  (local $changes i32) (local $texture i32) (local $rough i32) (local $moving i32) (local $reversing i32)
  (local $kind i32) (local $dense i32) (local $support i32)
  (local $a v128) (local $r v128) (local $dn v128) (local $mv v128) (local $diff v128)
  (memory.fill (local.get $scratch) (i32.const 0) (i32.const 4100))
  (local.set $s2 (i32.shl (local.get $stride) (i32.const 1)))
  (local.set $s8 (i32.shl (local.get $stride) (i32.const 4)))
  (block $done
    (loop $bandRows
      (br_if $done (i32.ge_u (local.get $row) (local.get $rows)))
      (local.set $col (i32.const 0))
      (loop $cells
        (if (i32.lt_u (local.get $col) (local.get $cols)) (then
          (local.set $base (i32.add (local.get $pixels)
            (i32.add (i32.shl (local.get $col) (i32.const 7))
              (i32.mul (i32.shl (local.get $row) (i32.const 5)) (local.get $stride)))))
          (local.set $kind (i32.const 0))
          (block $classified
            (if (i32.eqz (call $photoHasColors (i32.const 2) (local.get $stride) (local.get $base)
                  (i32.const 16) (i32.const 1) (i32.const 8) (i32.const 0) (i32.const 0) (local.get $scratch))) (then
              (if (i32.eqz (call $photoHasColors (i32.const 2) (local.get $stride)
                    (i32.add (local.get $base) (i32.mul (i32.const 31) (local.get $stride)))
                    (i32.const 16) (i32.const 1) (i32.const 8) (i32.const 0) (i32.const 0) (local.get $scratch))) (then
                (if (i32.eqz (call $photoHasColors (i32.const 2) (local.get $stride) (local.get $base)
                      (i32.const 1) (i32.const 16) (i32.const 0) (local.get $s2) (i32.const 0) (local.get $scratch))) (then
                  (br_if $classified (i32.eqz (call $photoHasColors (i32.const 2) (local.get $stride)
                    (i32.add (local.get $base) (i32.const 124))
                    (i32.const 1) (i32.const 16) (i32.const 0) (local.get $s2) (i32.const 0) (local.get $scratch))))))))))
            (local.set $runs (i32.const 0))
            (local.set $y (i32.const 0))
            (loop $runRows
              (local.set $x (i32.const 0))
              (local.set $at (i32.add (local.get $base) (i32.mul (local.get $y) (local.get $stride))))
              (loop $runHalves
                (local.set $a
                  (v128.load32_lane offset=48 3 (local.get $at)
                    (v128.load32_lane offset=32 2 (local.get $at)
                      (v128.load32_lane offset=16 1 (local.get $at)
                        (v128.load32_zero (local.get $at))))))
                (local.set $r
                  (v128.load32_lane offset=60 3 (local.get $at)
                    (v128.load32_lane offset=44 2 (local.get $at)
                      (v128.load32_lane offset=28 1 (local.get $at)
                        (v128.load32_zero offset=12 (local.get $at))))))
                (local.set $runs (i32.add (local.get $runs) (i32.popcnt (i32x4.bitmask
                  (i32x4.eq (v128.and (v128.xor (local.get $a) (local.get $r)) (i32x4.splat (i32.const 0xffffff)))
                    (i32x4.splat (i32.const 0)))))))
                (local.set $at (i32.add (local.get $at) (i32.const 64)))
                (local.set $x (i32.add (local.get $x) (i32.const 1)))
                (br_if $runHalves (i32.lt_u (local.get $x) (i32.const 2))))
              (local.set $y (i32.add (local.get $y) (i32.const 4)))
              (br_if $runRows (i32.lt_u (local.get $y) (i32.const 32))))
            (br_if $classified (i32.ge_u (local.get $runs) (i32.const 52)))
            (local.set $tuple (call $photoNearGrey (local.get $base) (local.get $stride)))
            (local.set $quad (select (i32.const 18) (i32.const 20) (local.get $tuple)))
            (local.set $many (select (i32.const 80) (i32.const 96) (local.get $tuple)))
            (br_if $classified (i32.eqz (call $photoHasColors (i32.const 32) (local.get $stride) (local.get $base)
              (i32.const 16) (i32.const 16) (i32.const 8) (local.get $s2) (local.get $tuple) (local.get $scratch))))
            (local.set $changes (i32.const 0))
            (local.set $texture (i32.const 0))
            (local.set $rough (i32.const 0))
            (local.set $moving (i32.const 0))
            (local.set $reversing (i32.const 0))
            (local.set $y (i32.const 0))
            (loop $gridRows
              (local.set $x (i32.const 0))
              (local.set $at (i32.add (local.get $base) (i32.mul (local.get $y) (local.get $stride))))
              (loop $gridCols
                (local.set $a (v128.load (local.get $at)))
                (local.set $r (v128.load offset=4 (local.get $at)))
                (local.set $dn (v128.load (i32.add (local.get $at) (local.get $stride))))
                (local.set $changes (i32.add (local.get $changes) (i32.popcnt (i32.and (i32.const 257)
                  (i8x16.bitmask (v128.and
                    (i8x16.ge_u (call $photoRgbSum (local.get $a) (local.get $r)) (i8x16.splat (i32.const 31)))
                    (i8x16.ge_u (call $photoRgbSum (local.get $a) (local.get $dn)) (i8x16.splat (i32.const 31)))))))))
                (local.set $mv (i8x16.min_u
                  (call $photoRgbStep (local.get $a) (local.get $r))
                  (call $photoRgbStep (local.get $a) (local.get $dn))))
                (local.set $texture (i32.add (local.get $texture) (i32.popcnt (i32.and (i32.const 257)
                  (i8x16.bitmask (i8x16.ge_u (local.get $mv) (i8x16.splat (i32.const 2))))))))
                (local.set $rough (i32.add (local.get $rough) (i32.popcnt (i32.and (i32.const 257)
                  (i8x16.bitmask (i8x16.ge_u (local.get $mv) (i8x16.splat (i32.const 3))))))))
                (local.set $diff (i32x4.sub
                  (v128.and (i32x4.shr_u (local.get $r) (i32.const 8)) (i32x4.splat (i32.const 255)))
                  (v128.and (i32x4.shr_u (local.get $a) (i32.const 8)) (i32x4.splat (i32.const 255)))))
                (local.set $moving (i32.add (local.get $moving) (i32.popcnt (i32.and (i32.const 5)
                  (i32x4.bitmask (i32x4.ne (local.get $diff) (i32x4.splat (i32.const 0))))))))
                (local.set $reversing (i32.add (local.get $reversing) (i32.popcnt (i32.and (i32.const 5)
                  (i32x4.bitmask (i32x4.mul (local.get $diff)
                    (i8x16.shuffle 4 5 6 7 4 5 6 7 12 13 14 15 12 13 14 15 (local.get $diff) (local.get $diff))))))))
                (local.set $at (i32.add (local.get $at) (i32.const 16)))
                (local.set $x (i32.add (local.get $x) (i32.const 4)))
                (br_if $gridCols (i32.lt_u (local.get $x) (i32.const 32))))
              (local.set $y (i32.add (local.get $y) (i32.const 2)))
              (br_if $gridRows (i32.lt_u (local.get $y) (i32.const 32))))
            (local.set $dense (i32.const 0))
            (if (call $photoHasColors (local.get $quad) (local.get $stride) (local.get $base)
                  (i32.const 8) (i32.const 8) (i32.const 8) (local.get $s2) (local.get $tuple) (local.get $scratch)) (then
              (if (call $photoHasColors (local.get $quad) (local.get $stride) (i32.add (local.get $base) (i32.const 64))
                    (i32.const 8) (i32.const 8) (i32.const 8) (local.get $s2) (local.get $tuple) (local.get $scratch)) (then
                (if (call $photoHasColors (local.get $quad) (local.get $stride) (i32.add (local.get $base) (local.get $s8))
                      (i32.const 8) (i32.const 8) (i32.const 8) (local.get $s2) (local.get $tuple) (local.get $scratch)) (then
                  (if (call $photoHasColors (local.get $quad) (local.get $stride)
                        (i32.add (local.get $base) (i32.add (local.get $s8) (i32.const 64)))
                        (i32.const 8) (i32.const 8) (i32.const 8) (local.get $s2) (local.get $tuple) (local.get $scratch)) (then
                    (local.set $dense (call $photoHasColors (local.get $many) (local.get $stride) (local.get $base)
                      (i32.const 16) (i32.const 16) (i32.const 8) (local.get $s2) (local.get $tuple) (local.get $scratch)))))))))))
            (if (i32.or (local.get $dense)
              (i32.and (i32.ge_u (local.get $texture) (i32.const 64))
                (i32.lt_u (i32.mul (local.get $reversing) (i32.const 10))
                  (i32.mul (local.get $moving) (i32.const 6)))))
              (then
                (local.set $kind (i32.add (i32.const 1)
                  (i32.or (i32.ge_u (local.get $changes) (i32.const 4))
                    (i32.ge_u (local.get $rough) (i32.const 128))))))))
          (if (local.get $output) (then
            (i32.store8 (i32.add (local.get $output) (local.get $idx)) (local.get $kind))))
          (local.set $support (i32.add (local.get $support) (i32.gt_u (local.get $kind) (i32.const 0))))
          (local.set $idx (i32.add (local.get $idx) (i32.const 1)))
          (local.set $col (i32.add (local.get $col) (i32.const 1)))
          (br $cells))))
      (local.set $row (i32.add (local.get $row) (i32.const 1)))
      (br $bandRows)))
  (local.get $support))

;; 1 where any pixel in `rows` x `width` RGBA bytes (`stride` bytes per row) has alpha 0 and non-zero RGB.
(func $photoHiddenColor (export "photoHiddenColor")
  (param $pixels i32) (param $stride i32) (param $width i32) (param $rows i32) (result i32)
  (local $y i32) (local $x i32) (local $at i32)
  (block $done
    (loop $rowLoop
      (br_if $done (i32.ge_u (local.get $y) (local.get $rows)))
      (local.set $x (i32.const 0))
      (local.set $at (i32.add (local.get $pixels) (i32.mul (local.get $y) (local.get $stride))))
      (block $vecDone
        (loop $vecLoop
          (br_if $vecDone (i32.gt_u (i32.add (local.get $x) (i32.const 4)) (local.get $width)))
          (if (v128.any_true (i32x4.lt_u
            (i32x4.sub (v128.load (local.get $at)) (i32x4.splat (i32.const 1)))
            (i32x4.splat (i32.const 0x00ffffff))))
            (then (return (i32.const 1))))
          (local.set $at (i32.add (local.get $at) (i32.const 16)))
          (local.set $x (i32.add (local.get $x) (i32.const 4)))
          (br $vecLoop)))
      (block $tailDone
        (loop $tailLoop
          (br_if $tailDone (i32.ge_u (local.get $x) (local.get $width)))
          (if (i32.lt_u (i32.sub (i32.load (local.get $at)) (i32.const 1)) (i32.const 0x00ffffff))
            (then (return (i32.const 1))))
          (local.set $at (i32.add (local.get $at) (i32.const 4)))
          (local.set $x (i32.add (local.get $x) (i32.const 1)))
          (br $tailLoop)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $rowLoop)))
  (i32.const 0))

;; Palette scan across `rows` x `width` RGBA bytes using `state` (0: seen, 4: grey, 8..1031: occupied, 1032..5127: keys).
;; Returns 0 past 256 colours, else 1 when 2 * grey < seen, else -1.
(func $photoPaletteBand (export "photoPaletteBand")
  (param $pixels i32) (param $stride i32) (param $width i32) (param $rows i32) (param $state i32) (param $init i32) (result i32)
  (local $seen i32) (local $grey i32) (local $prev i32) (local $y i32) (local $x i32) (local $at i32)
  (local $k i32) (local $s i32) (local $occ i32) (local $keyPtr i32)
  (if (local.get $init) (then
    (i32.store (local.get $state) (i32.const 0))
    (i32.store offset=4 (local.get $state) (i32.const 0))
    (memory.fill (i32.add (local.get $state) (i32.const 8)) (i32.const 0) (i32.const 1024))))
  (local.set $seen (i32.load (local.get $state)))
  (local.set $grey (i32.load offset=4 (local.get $state)))
  (local.set $prev (i32.const -1))
  (block $done
    (loop $rowLoop
      (br_if $done (i32.ge_u (local.get $y) (local.get $rows)))
      (local.set $x (i32.const 0))
      (local.set $at (i32.add (local.get $pixels) (i32.mul (local.get $y) (local.get $stride))))
      (block $colDone
        (loop $colLoop
          (br_if $colDone (i32.ge_u (local.get $x) (local.get $width)))
          (local.set $k (i32.and (i32.load (local.get $at)) (i32.const 0x00ffffff)))
          (if (i32.ne (local.get $k) (local.get $prev)) (then
            (local.set $prev (local.get $k))
            (local.set $s (i32.and (i32.mul
              (i32.xor (local.get $k) (i32.shr_u (local.get $k) (i32.const 16)))
              (i32.const 0x9e3779b1)) (i32.const 1023)))
            (block $probed
              (loop $probe
                (local.set $occ (i32.add (local.get $state) (i32.add (i32.const 8) (local.get $s))))
                (br_if $probed (i32.eqz (i32.load8_u (local.get $occ))))
                (local.set $keyPtr (i32.add (local.get $state) (i32.add (i32.const 1032) (i32.shl (local.get $s) (i32.const 2)))))
                (br_if $probed (i32.eq (i32.load (local.get $keyPtr)) (local.get $k)))
                (local.set $s (i32.and (i32.add (local.get $s) (i32.const 1)) (i32.const 1023)))
                (br $probe)))
            (if (i32.eqz (i32.load8_u (local.get $occ))) (then
              (local.set $seen (i32.add (local.get $seen) (i32.const 1)))
              (if (i32.gt_u (local.get $seen) (i32.const 256)) (then
                (i32.store (local.get $state) (local.get $seen))
                (return (i32.const 0))))
              (i32.store8 (local.get $occ) (i32.const 1))
              (i32.store (i32.add (local.get $state) (i32.add (i32.const 1032) (i32.shl (local.get $s) (i32.const 2)))) (local.get $k))
              (if (i32.eq (local.get $k) (i32.mul (i32.and (local.get $k) (i32.const 255)) (i32.const 0x010101)))
                (then (local.set $grey (i32.add (local.get $grey) (i32.const 1)))))))))
          (local.set $at (i32.add (local.get $at) (i32.const 4)))
          (local.set $x (i32.add (local.get $x) (i32.const 1)))
          (br $colLoop)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $rowLoop)))
  (i32.store (local.get $state) (local.get $seen))
  (i32.store offset=4 (local.get $state) (local.get $grey))
  (select (i32.const 1) (i32.const -1) (i32.lt_u (i32.shl (local.get $grey) (i32.const 1)) (local.get $seen))))

;; Overwrites RGB (preserving alpha) with `rgb` (0x00BBGGRR) in every 8x8 block of `rows` x `width` where all `exact` bytes are non-zero.
(func $photoFlattenGutter (export "photoFlattenGutter")
  (param $rgba i32) (param $exact i32) (param $width i32) (param $rows i32) (param $rgb i32)
  (local $by i32) (local $bx i32) (local $bh i32) (local $bw i32) (local $dy i32) (local $dx i32)
  (local $untouched i32) (local $eRow i32) (local $pRow i32) (local $at i32)
  (local $rgbVec v128) (local $maskVec v128)
  (local.set $rgb (i32.and (local.get $rgb) (i32.const 0x00ffffff)))
  (local.set $rgbVec (i32x4.splat (local.get $rgb)))
  (local.set $maskVec (i32x4.splat (i32.const 0x00ffffff)))
  (block $doneY
    (loop $loopY
      (br_if $doneY (i32.ge_u (local.get $by) (local.get $rows)))
      (local.set $bh (i32.sub (local.get $rows) (local.get $by)))
      (if (i32.gt_u (local.get $bh) (i32.const 8)) (then (local.set $bh (i32.const 8))))
      (local.set $bx (i32.const 0))
      (block $doneX
        (loop $loopX
          (br_if $doneX (i32.ge_u (local.get $bx) (local.get $width)))
          (local.set $bw (i32.sub (local.get $width) (local.get $bx)))
          (if (i32.gt_u (local.get $bw) (i32.const 8)) (then (local.set $bw (i32.const 8))))
          (local.set $untouched (i32.const 1))
          (local.set $dy (i32.const 0))
          (if (i32.eq (local.get $bw) (i32.const 8))
            (then
              (block $checkDone8
                (loop $checkRow8
                  (br_if $checkDone8 (i32.ge_u (local.get $dy) (local.get $bh)))
                  (if (i32.eqz (i8x16.all_true (v128.load64_splat
                    (i32.add (local.get $exact) (i32.add (i32.mul (i32.add (local.get $by) (local.get $dy)) (local.get $width)) (local.get $bx))))))
                    (then (local.set $untouched (i32.const 0)) (br $checkDone8)))
                  (local.set $dy (i32.add (local.get $dy) (i32.const 1)))
                  (br $checkRow8))))
            (else
              (block $checkDoneTail
                (loop $checkRowTail
                  (br_if $checkDoneTail (i32.ge_u (local.get $dy) (local.get $bh)))
                  (local.set $eRow (i32.add (local.get $exact) (i32.add (i32.mul (i32.add (local.get $by) (local.get $dy)) (local.get $width)) (local.get $bx))))
                  (local.set $dx (i32.const 0))
                  (loop $checkColTail
                    (if (i32.eqz (i32.load8_u (i32.add (local.get $eRow) (local.get $dx))))
                      (then (local.set $untouched (i32.const 0)) (br $checkDoneTail)))
                    (local.set $dx (i32.add (local.get $dx) (i32.const 1)))
                    (br_if $checkColTail (i32.lt_u (local.get $dx) (local.get $bw))))
                  (local.set $dy (i32.add (local.get $dy) (i32.const 1)))
                  (br $checkRowTail)))))
          (if (local.get $untouched) (then
            (local.set $dy (i32.const 0))
            (if (i32.eq (local.get $bw) (i32.const 8))
              (then
                (loop $fillRow8
                  (local.set $at (i32.add (local.get $rgba) (i32.shl (i32.add (i32.mul (i32.add (local.get $by) (local.get $dy)) (local.get $width)) (local.get $bx)) (i32.const 2))))
                  (v128.store (local.get $at) (v128.bitselect (local.get $rgbVec) (v128.load (local.get $at)) (local.get $maskVec)))
                  (v128.store offset=16 (local.get $at) (v128.bitselect (local.get $rgbVec) (v128.load offset=16 (local.get $at)) (local.get $maskVec)))
                  (local.set $dy (i32.add (local.get $dy) (i32.const 1)))
                  (br_if $fillRow8 (i32.lt_u (local.get $dy) (local.get $bh)))))
              (else
                (loop $fillRowTail
                  (local.set $pRow (i32.add (local.get $rgba) (i32.shl (i32.add (i32.mul (i32.add (local.get $by) (local.get $dy)) (local.get $width)) (local.get $bx)) (i32.const 2))))
                  (local.set $dx (i32.const 0))
                  (loop $fillColTail
                    (local.set $at (i32.add (local.get $pRow) (i32.shl (local.get $dx) (i32.const 2))))
                    (i32.store (local.get $at) (i32.or (i32.and (i32.load (local.get $at)) (i32.const 0xff000000)) (local.get $rgb)))
                    (local.set $dx (i32.add (local.get $dx) (i32.const 1)))
                    (br_if $fillColTail (i32.lt_u (local.get $dx) (local.get $bw))))
                  (local.set $dy (i32.add (local.get $dy) (i32.const 1)))
                  (br_if $fillRowTail (i32.lt_u (local.get $dy) (local.get $bh))))))))
          (local.set $bx (i32.add (local.get $bx) (i32.const 8)))
          (br $loopX)))
      (local.set $by (i32.add (local.get $by) (i32.const 8)))
      (br $loopY))))

;; Marks 64x64 tiles (1 in `output`) holding an 8x8 block where |R-G| <= 1, |B-G| <= 1 and max(G) - min(G) >= 32.
(func $photoGrayTiles (export "photoGrayTiles")
  (param $pixels i32) (param $stride i32) (param $bandW i32) (param $bandH i32)
  (param $tileCols i32) (param $tileRows i32) (param $output i32)
  (local $ty i32) (local $tx i32) (local $th i32) (local $tw i32) (local $idx i32) (local $found i32)
  (local $by i32) (local $bx i32) (local $bh i32) (local $bw i32) (local $ry i32) (local $rx i32)
  (local $blockBase i32) (local $rowPtr i32) (local $at i32)
  (local $gray i32) (local $lo i32) (local $hi i32) (local $r i32) (local $g i32) (local $b i32)
  (local $p0 v128) (local $p1 v128) (local $rb v128) (local $gg v128) (local $vLo v128) (local $vHi v128)
  (block $doneTY
    (loop $loopTY
      (br_if $doneTY (i32.ge_u (local.get $ty) (local.get $tileRows)))
      (local.set $th (i32.sub (local.get $bandH) (i32.shl (local.get $ty) (i32.const 6))))
      (if (i32.gt_u (local.get $th) (i32.const 64)) (then (local.set $th (i32.const 64))))
      (local.set $tx (i32.const 0))
      (block $doneTX
        (loop $loopTX
          (br_if $doneTX (i32.ge_u (local.get $tx) (local.get $tileCols)))
          (local.set $tw (i32.sub (local.get $bandW) (i32.shl (local.get $tx) (i32.const 6))))
          (if (i32.gt_u (local.get $tw) (i32.const 64)) (then (local.set $tw (i32.const 64))))
          (local.set $found (i32.const 0))
          (local.set $by (i32.const 0))
          (block $tileFound
            (loop $loopBY
              (br_if $tileFound (i32.ge_u (local.get $by) (local.get $th)))
              (local.set $bh (i32.sub (local.get $th) (local.get $by)))
              (if (i32.gt_u (local.get $bh) (i32.const 8)) (then (local.set $bh (i32.const 8))))
              (local.set $bx (i32.const 0))
              (block $doneBX
                (loop $loopBX
                  (br_if $doneBX (i32.ge_u (local.get $bx) (local.get $tw)))
                  (local.set $bw (i32.sub (local.get $tw) (local.get $bx)))
                  (if (i32.gt_u (local.get $bw) (i32.const 8)) (then (local.set $bw (i32.const 8))))
                  (local.set $blockBase (i32.add (local.get $pixels)
                    (i32.add
                      (i32.mul (i32.add (i32.shl (local.get $ty) (i32.const 6)) (local.get $by)) (local.get $stride))
                      (i32.shl (i32.add (i32.shl (local.get $tx) (i32.const 6)) (local.get $bx)) (i32.const 2)))))
                  (local.set $gray (i32.const 1))
                  (local.set $ry (i32.const 0))
                  (if (i32.eq (local.get $bw) (i32.const 8))
                    (then
                      (local.set $vLo (i8x16.splat (i32.const 255)))
                      (local.set $vHi (i8x16.splat (i32.const 0)))
                      (local.set $rowPtr (local.get $blockBase))
                      (block $notGray8
                        (loop $row8
                          (br_if $notGray8 (i32.ge_u (local.get $ry) (local.get $bh)))
                          (local.set $p0 (v128.load (local.get $rowPtr)))
                          (local.set $p1 (v128.load offset=16 (local.get $rowPtr)))
                          (local.set $rb (i8x16.shuffle 0 4 8 12 16 20 24 28 2 6 10 14 18 22 26 30 (local.get $p0) (local.get $p1)))
                          (local.set $gg (i8x16.shuffle 1 5 9 13 17 21 25 29 1 5 9 13 17 21 25 29 (local.get $p0) (local.get $p1)))
                          (if (v128.any_true (i8x16.gt_u
                            (v128.or (i8x16.sub_sat_u (local.get $rb) (local.get $gg)) (i8x16.sub_sat_u (local.get $gg) (local.get $rb)))
                            (i8x16.splat (i32.const 1))))
                            (then (local.set $gray (i32.const 0)) (br $notGray8)))
                          (local.set $vLo (i8x16.min_u (local.get $vLo) (local.get $gg)))
                          (local.set $vHi (i8x16.max_u (local.get $vHi) (local.get $gg)))
                          (local.set $rowPtr (i32.add (local.get $rowPtr) (local.get $stride)))
                          (local.set $ry (i32.add (local.get $ry) (i32.const 1)))
                          (br $row8)))
                      (if (local.get $gray) (then
                        (local.set $vLo (i8x16.min_u (local.get $vLo) (i64x2.shr_u (local.get $vLo) (i32.const 32))))
                        (local.set $vLo (i8x16.min_u (local.get $vLo) (i32x4.shr_u (local.get $vLo) (i32.const 16))))
                        (local.set $vLo (i8x16.min_u (local.get $vLo) (i32x4.shr_u (local.get $vLo) (i32.const 8))))
                        (local.set $vHi (i8x16.max_u (local.get $vHi) (i64x2.shr_u (local.get $vHi) (i32.const 32))))
                        (local.set $vHi (i8x16.max_u (local.get $vHi) (i32x4.shr_u (local.get $vHi) (i32.const 16))))
                        (local.set $vHi (i8x16.max_u (local.get $vHi) (i32x4.shr_u (local.get $vHi) (i32.const 8))))
                        (if (i32.ge_s (i32.sub (i8x16.extract_lane_u 0 (local.get $vHi)) (i8x16.extract_lane_u 0 (local.get $vLo))) (i32.const 32))
                          (then (local.set $found (i32.const 1)) (br $tileFound))))))
                    (else
                      (local.set $lo (i32.const 255))
                      (local.set $hi (i32.const 0))
                      (block $notGrayTail
                        (loop $rowTail
                          (br_if $notGrayTail (i32.ge_u (local.get $ry) (local.get $bh)))
                          (local.set $at (i32.add (local.get $blockBase) (i32.mul (local.get $ry) (local.get $stride))))
                          (local.set $rx (i32.const 0))
                          (loop $colTail
                            (local.set $r (i32.load8_u (local.get $at)))
                            (local.set $g (i32.load8_u offset=1 (local.get $at)))
                            (local.set $b (i32.load8_u offset=2 (local.get $at)))
                            (if (i32.or
                              (i32.gt_s (i32.sub (local.get $r) (local.get $g)) (i32.const 1))
                              (i32.or
                                (i32.gt_s (i32.sub (local.get $g) (local.get $r)) (i32.const 1))
                                (i32.or
                                  (i32.gt_s (i32.sub (local.get $b) (local.get $g)) (i32.const 1))
                                  (i32.gt_s (i32.sub (local.get $g) (local.get $b)) (i32.const 1)))))
                              (then (local.set $gray (i32.const 0)) (br $notGrayTail)))
                            (if (i32.lt_u (local.get $g) (local.get $lo)) (then (local.set $lo (local.get $g))))
                            (if (i32.gt_u (local.get $g) (local.get $hi)) (then (local.set $hi (local.get $g))))
                            (local.set $at (i32.add (local.get $at) (i32.const 4)))
                            (local.set $rx (i32.add (local.get $rx) (i32.const 1)))
                            (br_if $colTail (i32.lt_u (local.get $rx) (local.get $bw))))
                          (local.set $ry (i32.add (local.get $ry) (i32.const 1)))
                          (br $rowTail)))
                      (if (i32.and (local.get $gray) (i32.ge_s (i32.sub (local.get $hi) (local.get $lo)) (i32.const 32)))
                        (then (local.set $found (i32.const 1)) (br $tileFound)))))
                  (local.set $bx (i32.add (local.get $bx) (i32.const 8)))
                  (br $loopBX)))
              (local.set $by (i32.add (local.get $by) (i32.const 8)))
              (br $loopBY)))
          (i32.store8 (i32.add (local.get $output) (local.get $idx)) (local.get $found))
          (local.set $idx (i32.add (local.get $idx) (i32.const 1)))
          (local.set $tx (i32.add (local.get $tx) (i32.const 1)))
          (br $loopTX)))
      (local.set $ty (i32.add (local.get $ty) (i32.const 1)))
      (br $loopTY))))
