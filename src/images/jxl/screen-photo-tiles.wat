;; SPDX-License-Identifier: MIT
;; The existing text-cell predicate, four RGB neighbor comparisons at a time.
;; Alpha never participates. The last vector contributes only its first three pixels.
(func $photoRgbStep (param $a v128) (param $b v128) (result v128)
  (local $d v128)
  (local.set $d (v128.or (i8x16.sub_sat_u (local.get $a) (local.get $b))
    (i8x16.sub_sat_u (local.get $b) (local.get $a))))
  (i8x16.max_u
    (i8x16.max_u (local.get $d) (i32x4.shr_u (local.get $d) (i32.const 8)))
    (i32x4.shr_u (local.get $d) (i32.const 16))))

;; One band of 32 rows, `cols` whole cells, RGBA bytes, `stride` bytes per row.
(func $photoTextTiles (export "photoTextTiles")
  (param $pixels i32) (param $stride i32) (param $cols i32) (param $output i32) (result i32)
  (local $col i32) (local $y i32) (local $x i32) (local $at i32)
  (local $medium i32) (local $flat i32) (local $steps i32) (local $text i32) (local $found i32)
  (local $mask i32) (local $h v128) (local $v v128) (local $a v128)
  (block $done
    (loop $cells
      (br_if $done (i32.ge_u (local.get $col) (local.get $cols)))
      (local.set $y (i32.const 0))
      (local.set $medium (i32.const 0))
      (local.set $flat (i32.const 0))
      (local.set $steps (i32.const 0))
      (block $scanned
        (loop $rows
          (local.set $x (i32.const 0))
          (local.set $at (i32.add (local.get $pixels)
            (i32.add (i32.shl (local.get $col) (i32.const 7))
              (i32.mul (local.get $y) (local.get $stride)))))
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
          (br_if $rows (i32.lt_u (local.get $y) (i32.const 31)))))
      (local.set $found (i32.and
        (i32.ge_u (local.get $steps) (i32.const 64))
        (i32.and (i32.lt_u (local.get $medium) (i32.const 97))
          (i32.ge_u (local.get $flat) (i32.const 241)))))
      (if (local.get $output) (then
        (i32.store8 (i32.add (local.get $output) (local.get $col)) (local.get $found))))
      (local.set $text (i32.add (local.get $text) (local.get $found)))
      (local.set $col (i32.add (local.get $col) (i32.const 1)))
      (br $cells)))
  (local.get $text))
