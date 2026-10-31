;; SPDX-License-Identifier: MIT
;; The capture's copy search (capture-codec.mjs's pieces): copies at W, at N, at the 16 recent copies' distances and
;; along a hash chain of three values, `depth` links deep or until one reaches 256 values (the last two only with a
;; chain). A copy competes at 6 bits a value less its distance's bits; with a chain, a copy is put off by one position
;; when the next starts a better one, and a copy longer than 64 enters only its first 8 positions and its end.
;; build-jxl-kernels.mjs joins these functions to kernels-scalar.wat's weighted predictor as the capture module.
;; Memory, all byte offsets: `scratch` holds 832 bytes (16 recent distances, then the match ends by distance: 64
;; distances, 64 starts, 64 ends); `heads` 262144 bytes (with a chain); `chain` 4n bytes (with a chain); `contexts`
;; may be `outCtx` (pieces never run ahead of the positions they are read from).
  (global $inserted (mut i32) (i32.const 0))
  (global $bestLen (mut i32) (i32.const 0))
  (global $bestDist (mut i32) (i32.const 0))
  (global $bestCost (mut i32) (i32.const 0))

  (func $copyHash (param $vAddr i32) (result i32)
    (i32.shr_u
      (i32.xor
        (i32.xor
          (i32.mul (i32.add (i32.load (local.get $vAddr)) (i32.const 1)) (i32.const 0x1e35a7bd))
          (i32.mul (i32.add (i32.load offset=4 (local.get $vAddr)) (i32.const 1)) (i32.const 0x6c8e9cf5)))
        (i32.mul (i32.add (i32.load offset=8 (local.get $vAddr)) (i32.const 1)) (i32.const 0x2c1b3c6d)))
      (i32.const 16)))

  (func $copyProbe
    (param $values i32) (param $n i32) (param $at i32) (param $previous i32) (param $recentBonus i32)
    (param $spatial i32) (param $spatialLen i32) (param $scratch i32)
    (local $length i32) (local $atAddr i32) (local $prevAddr i32) (local $d i32) (local $slotAddr i32)
    (local $k i32) (local $limit i32) (local $cost i32)
    (if (i32.lt_s (local.get $previous) (i32.const 0)) (then (return)))
    (local.set $atAddr (i32.add (local.get $values) (i32.shl (local.get $at) (i32.const 2))))
    (local.set $prevAddr (i32.add (local.get $values) (i32.shl (local.get $previous) (i32.const 2))))
    (if (i32.ne (i32.load (local.get $prevAddr)) (i32.load (local.get $atAddr))) (then (return)))
    (if (i32.ne (i32.load offset=4 (local.get $prevAddr)) (i32.load offset=4 (local.get $atAddr))) (then (return)))
    (if (i32.ne (i32.load offset=8 (local.get $prevAddr)) (i32.load offset=8 (local.get $atAddr))) (then (return)))
    (local.set $d (i32.sub (local.get $at) (local.get $previous)))
    (if (i32.lt_s (local.get $d) (local.get $spatialLen))
      (then (local.set $cost (i32.load8_u (i32.add (local.get $spatial) (local.get $d))))))
    (if (i32.eqz (local.get $cost))
      (then
        (local.set $cost (i32.sub (i32.sub (i32.const 31) (i32.clz (local.get $d))) (local.get $recentBonus)))
        (if (i32.lt_s (local.get $cost) (i32.const 2)) (then (local.set $cost (i32.const 2))))))
    (local.set $length (global.get $bestLen))
    (if (local.get $length)
      (then
        (if (i32.ge_s (local.get $cost) (global.get $bestCost))
          (then
            (if (i32.ge_s (i32.add (local.get $at) (local.get $length)) (local.get $n)) (then (return)))
            (if
              (i32.ne
                (i32.load (i32.add (local.get $prevAddr) (i32.shl (local.get $length) (i32.const 2))))
                (i32.load (i32.add (local.get $atAddr) (i32.shl (local.get $length) (i32.const 2)))))
              (then (return)))))
        (if
          (i32.ne
            (i32.load (i32.add (local.get $prevAddr) (i32.shl (i32.sub (local.get $length) (i32.const 1)) (i32.const 2))))
            (i32.load (i32.add (local.get $atAddr) (i32.shl (i32.sub (local.get $length) (i32.const 1)) (i32.const 2)))))
          (then (return)))))
    (local.set $slotAddr (i32.add (local.get $scratch) (i32.shl (i32.and (local.get $d) (i32.const 63)) (i32.const 2))))
    (if
      (i32.and
        (i32.and
          (i32.eq (i32.load offset=64 (local.get $slotAddr)) (local.get $d))
          (i32.le_s (i32.load offset=320 (local.get $slotAddr)) (local.get $at)))
        (i32.gt_s (i32.sub (i32.load offset=576 (local.get $slotAddr)) (local.get $at)) (i32.const 3)))
      (then
        (local.set $k (i32.sub (i32.load offset=576 (local.get $slotAddr)) (local.get $at))))
      (else
        (local.set $k (i32.const 3))
        (local.set $limit (i32.sub (local.get $n) (local.get $at)))
        
        (block $done4
          (loop $match4
            (br_if $done4 (i32.gt_s (i32.add (local.get $k) (i32.const 4)) (local.get $limit)))
            (br_if $done4
              (i32.eqz
                (i32x4.all_true
                  (i32x4.eq
                    (v128.load (i32.add (local.get $prevAddr) (i32.shl (local.get $k) (i32.const 2))))
                    (v128.load (i32.add (local.get $atAddr) (i32.shl (local.get $k) (i32.const 2))))))))
            (local.set $k (i32.add (local.get $k) (i32.const 4)))
            (br $match4)))
        (block $done
          (loop $match
            (br_if $done (i32.ge_s (local.get $k) (local.get $limit)))
            (br_if $done
              (i32.ne
                (i32.load (i32.add (local.get $prevAddr) (i32.shl (local.get $k) (i32.const 2))))
                (i32.load (i32.add (local.get $atAddr) (i32.shl (local.get $k) (i32.const 2))))))
            (local.set $k (i32.add (local.get $k) (i32.const 1)))
            (br $match)))
        (i32.store offset=64 (local.get $slotAddr) (local.get $d))
        (i32.store offset=320 (local.get $slotAddr) (local.get $at))
        (i32.store offset=576 (local.get $slotAddr) (i32.add (local.get $at) (local.get $k)))))
    (if
      (i32.gt_s
        (i32.sub (i32.mul (local.get $k) (i32.const 6)) (local.get $cost))
        (i32.sub (i32.mul (local.get $length) (i32.const 6)) (global.get $bestCost)))
      (then
        (global.set $bestLen (local.get $k))
        (global.set $bestDist (local.get $d))
        (global.set $bestCost (local.get $cost)))))

  (func $copyFind
    (param $values i32) (param $n i32) (param $width i32) (param $depth i32) (param $minimum i32)
    (param $spatial i32) (param $spatialLen i32) (param $heads i32) (param $chain i32) (param $scratch i32) (param $at i32)
    (result i32)
    (local $i i32) (local $h i32) (local $v i32) (local $r i32) (local $p i32) (local $d i32)
    (global.set $bestLen (i32.const 0))
    (global.set $bestDist (i32.const 0))
    (global.set $bestCost (i32.const -10))
    (if (i32.gt_s (i32.add (local.get $at) (local.get $minimum)) (local.get $n)) (then (return (i32.const 0))))
    (if (local.get $depth)
      (then
        (local.set $i (global.get $inserted))
        (block $insDone
          (loop $ins
            (br_if $insDone (i32.ge_s (local.get $i) (local.get $at)))
            (local.set $h (call $copyHash (i32.add (local.get $values) (i32.shl (local.get $i) (i32.const 2)))))
            (i32.store
              (i32.add (local.get $chain) (i32.shl (local.get $i) (i32.const 2)))
              (i32.load (i32.add (local.get $heads) (i32.shl (local.get $h) (i32.const 2)))))
            (i32.store (i32.add (local.get $heads) (i32.shl (local.get $h) (i32.const 2))) (local.get $i))
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $ins)))
        (if (i32.lt_s (global.get $inserted) (local.get $at)) (then (global.set $inserted (local.get $at))))
        (if (i32.eq (local.get $minimum) (i32.const 8)) (then (return (i32.const 0))))))
    (if (local.get $at)
      (then
        (call $copyProbe (local.get $values) (local.get $n) (local.get $at) (i32.sub (local.get $at) (i32.const 1)) (i32.const 0)
          (local.get $spatial) (local.get $spatialLen) (local.get $scratch))))
    (if
      (i32.and
        (i32.ge_s (local.get $at) (local.get $width))
        (i32.lt_s (i32.add (local.get $at) (global.get $bestLen)) (local.get $n)))
      (then
        (call $copyProbe (local.get $values) (local.get $n) (local.get $at) (i32.sub (local.get $at) (local.get $width)) (i32.const 0)
          (local.get $spatial) (local.get $spatialLen) (local.get $scratch))))
    (if (local.get $depth)
      (then
        (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $at) (i32.const 2)))))
        (local.set $i (i32.const 0))
        (block $recDone
          (loop $rec
            (br_if $recDone (i32.or (i32.ge_s (local.get $i) (i32.const 16)) (i32.ge_s (global.get $bestLen) (i32.const 1024))))
            (local.set $r (i32.load (i32.add (local.get $scratch) (i32.shl (local.get $i) (i32.const 2)))))
            (if
              (i32.and
                (i32.and (i32.gt_s (local.get $r) (i32.const 1)) (i32.ne (local.get $r) (local.get $width)))
                (i32.le_s (local.get $r) (local.get $at)))
              (then
                (if
                  (i32.eq
                    (i32.load (i32.add (local.get $values) (i32.shl (i32.sub (local.get $at) (local.get $r)) (i32.const 2))))
                    (local.get $v))
                  (then
                    (call $copyProbe (local.get $values) (local.get $n) (local.get $at) (i32.sub (local.get $at) (local.get $r)) (i32.const 5)
                      (local.get $spatial) (local.get $spatialLen) (local.get $scratch))))))
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $rec)))
        (local.set $h (call $copyHash (i32.add (local.get $values) (i32.shl (local.get $at) (i32.const 2)))))
        (local.set $p (i32.load (i32.add (local.get $heads) (i32.shl (local.get $h) (i32.const 2)))))
        (local.set $d (i32.const 0))
        (block $chDone
          (loop $ch
            (br_if $chDone
              (i32.or
                (i32.or (i32.lt_s (local.get $p) (i32.const 0)) (i32.ge_s (local.get $d) (local.get $depth)))
                (i32.or (i32.ge_s (i32.add (local.get $at) (global.get $bestLen)) (local.get $n)) (i32.ge_s (global.get $bestLen) (i32.const 1024)))))
            (call $copyProbe (local.get $values) (local.get $n) (local.get $at) (local.get $p) (i32.const 0)
              (local.get $spatial) (local.get $spatialLen) (local.get $scratch))
            (local.set $p (i32.load (i32.add (local.get $chain) (i32.shl (local.get $p) (i32.const 2)))))
            (local.set $d (i32.add (local.get $d) (i32.const 1)))
            (br $ch)))))
    (select (global.get $bestLen) (i32.const 0) (i32.ge_s (global.get $bestLen) (local.get $minimum))))

  (func (export "copies")
    (param $values i32) (param $contexts i32) (param $n i32) (param $width i32) (param $depth i32)
    (param $minimum i32) (param $scale i32) (param $spatial i32) (param $spatialLen i32)
    (param $heads i32) (param $chain i32) (param $scratch i32)
    (param $outVal i32) (param $outDist i32) (param $outCtx i32)
    (result i32)
    (local $position i32) (local $copy i32) (local $from i32) (local $fromCost i32) (local $next i32) (local $count i32) (local $i i32)
    (global.set $inserted (i32.const 0))
    (if (local.get $depth) (then (memory.fill (local.get $heads) (i32.const 255) (i32.const 262144))))
    (memory.fill (local.get $scratch) (i32.const 0) (i32.const 832))
    (local.set $copy
      (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (local.get $minimum)
        (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch) (i32.const 0)))
    (local.set $from (global.get $bestDist))
    (local.set $fromCost (global.get $bestCost))
    (block $done
      (loop $loop
        (br_if $done (i32.ge_s (local.get $position) (local.get $n)))
        (if (local.get $copy)
          (then
            (local.set $next
              (if (result i32) (local.get $depth)
                (then
                  (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (local.get $minimum)
                    (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch)
                    (i32.add (local.get $position) (i32.const 1))))
                (else (i32.const 0))))
            (if
              (i32.and
                (i32.ne (local.get $next) (i32.const 0))
                (i32.gt_s
                  (i32.sub (i32.mul (local.get $next) (i32.const 6)) (global.get $bestCost))
                  (i32.add (i32.sub (i32.mul (local.get $copy) (i32.const 6)) (local.get $fromCost)) (i32.const 3))))
              (then
                (if (local.get $contexts)
                  (then (i32.store8 (i32.add (local.get $outCtx) (local.get $count)) (i32.load8_u (i32.add (local.get $contexts) (local.get $position))))))
                (i32.store (i32.add (local.get $outVal) (i32.shl (local.get $count) (i32.const 2)))
                  (i32.mul (i32.load (i32.add (local.get $values) (i32.shl (local.get $position) (i32.const 2)))) (local.get $scale)))
                (i32.store (i32.add (local.get $outDist) (i32.shl (local.get $count) (i32.const 2))) (i32.const 0))
                (local.set $count (i32.add (local.get $count) (i32.const 1)))
                (local.set $position (i32.add (local.get $position) (i32.const 1)))
                (local.set $copy (local.get $next))
                (local.set $from (global.get $bestDist))
                (local.set $fromCost (global.get $bestCost))
                (br $loop)))
            (if (local.get $contexts)
              (then (i32.store8 (i32.add (local.get $outCtx) (local.get $count)) (i32.load8_u (i32.add (local.get $contexts) (local.get $position))))))
            (i32.store (i32.add (local.get $outVal) (i32.shl (local.get $count) (i32.const 2))) (i32.sub (local.get $copy) (local.get $minimum)))
            (i32.store (i32.add (local.get $outDist) (i32.shl (local.get $count) (i32.const 2))) (local.get $from))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))
            (if (local.get $depth)
              (then
                (local.set $i (i32.const 0))
                (block $remFound
                  (loop $remFind
                    (br_if $remFound (i32.or (i32.ge_s (local.get $i) (i32.const 15))
                      (i32.eq (i32.load (i32.add (local.get $scratch) (i32.shl (local.get $i) (i32.const 2)))) (local.get $from))))
                    (local.set $i (i32.add (local.get $i) (i32.const 1)))
                    (br $remFind)))
                (block $remDone
                  (loop $remShift
                    (br_if $remDone (i32.le_s (local.get $i) (i32.const 0)))
                    (i32.store
                      (i32.add (local.get $scratch) (i32.shl (local.get $i) (i32.const 2)))
                      (i32.load (i32.add (local.get $scratch) (i32.shl (i32.sub (local.get $i) (i32.const 1)) (i32.const 2)))))
                    (local.set $i (i32.sub (local.get $i) (i32.const 1)))
                    (br $remShift)))
                (i32.store (local.get $scratch) (local.get $from))))
            (if (i32.gt_s (local.get $copy) (i32.const 64))
              (then
                (drop (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (i32.const 8)
                  (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch)
                  (i32.add (local.get $position) (i32.const 8))))
                (global.set $inserted (i32.sub (i32.add (local.get $position) (local.get $copy)) (i32.const 3)))))
            (local.set $position (i32.add (local.get $position) (local.get $copy))))
          (else
            (if (local.get $contexts)
              (then (i32.store8 (i32.add (local.get $outCtx) (local.get $count)) (i32.load8_u (i32.add (local.get $contexts) (local.get $position))))))
            (i32.store (i32.add (local.get $outVal) (i32.shl (local.get $count) (i32.const 2)))
              (i32.mul (i32.load (i32.add (local.get $values) (i32.shl (local.get $position) (i32.const 2)))) (local.get $scale)))
            (i32.store (i32.add (local.get $outDist) (i32.shl (local.get $count) (i32.const 2))) (i32.const 0))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))
            (local.set $position (i32.add (local.get $position) (i32.const 1)))))
        (local.set $copy
          (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (local.get $minimum)
            (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch) (local.get $position)))
        (local.set $from (global.get $bestDist))
        (local.set $fromCost (global.get $bestCost))
        (br $loop)))
    (local.get $count))


  ;; The weighted channel's pieces (capture-codec.mjs's channelModel), in place over $weighted's outputs: each residual
  ;; at `values` with its context from the largest neighbouring error at `errors` (property 15, through the 511-byte band
  ;; table at `bands`), except that 16 or more equal residuals after a literal of the same value are one copy at distance
  ;; 1, written as length less `minimum`. `errors` becomes the distance flags, `contexts` gets a byte per piece. Returns
  ;; the piece count: the pieces never run ahead of the positions they are read from.
  (func $runs (export "runs")
    (param $values i32) (param $errors i32) (param $n i32) (param $minimum i32) (param $bands i32) (param $contexts i32)
    (result i32)
    (local $i i32) (local $count i32) (local $v i32) (local $e i32) (local $k i32) (local $end i32) (local $last i32)
    (block $done
      (loop $next
        (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
        (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $e (i32.load (i32.add (local.get $errors) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $last (i32.shl (i32.sub (local.get $count) (i32.const 1)) (i32.const 2)))
        (if
          (if (result i32) (i32.eqz (local.get $i))
            (then (i32.const 1))
            (else
              (i32.or
                (i32.ne (local.get $v) (i32.load (i32.add (local.get $values) (local.get $last))))
                (i32.ne (i32.load (i32.add (local.get $errors) (local.get $last))) (i32.const 0)))))
          (then
            (call $piece (local.get $values) (local.get $errors) (local.get $contexts) (local.get $bands)
              (local.get $count) (local.get $v) (i32.const 0) (local.get $e))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))
            (local.set $i (i32.add (local.get $i) (i32.const 1)))
            (br $next)))
        (local.set $k (i32.const 1))
        (block $stop
          (loop $run
            (br_if $stop (i32.ge_u (i32.add (local.get $i) (local.get $k)) (local.get $n)))
            (br_if $stop (i32.ne (local.get $v)
              (i32.load (i32.add (local.get $values) (i32.shl (i32.add (local.get $i) (local.get $k)) (i32.const 2))))))
            (local.set $k (i32.add (local.get $k) (i32.const 1)))
            (br $run)))
        (if (i32.ge_u (local.get $k) (i32.const 16))
          (then
            (call $piece (local.get $values) (local.get $errors) (local.get $contexts) (local.get $bands)
              (local.get $count) (i32.sub (local.get $k) (local.get $minimum)) (i32.const 1) (local.get $e))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))
            (local.set $i (i32.add (local.get $i) (local.get $k))))
          (else
            (local.set $end (i32.add (local.get $i) (local.get $k)))
            (loop $literal
              (call $piece (local.get $values) (local.get $errors) (local.get $contexts) (local.get $bands)
                (local.get $count) (local.get $v) (i32.const 0)
                (i32.load (i32.add (local.get $errors) (i32.shl (local.get $i) (i32.const 2)))))
              (local.set $count (i32.add (local.get $count) (i32.const 1)))
              (local.set $i (i32.add (local.get $i) (i32.const 1)))
              (br_if $literal (i32.lt_u (local.get $i) (local.get $end))))))
        (br $next)))
    (local.get $count))

  (func $piece
    (param $values i32) (param $errors i32) (param $contexts i32) (param $bands i32)
    (param $at i32) (param $value i32) (param $distance i32) (param $e i32)
    (i32.store8 (i32.add (local.get $contexts) (local.get $at))
      (i32.load8_u (i32.add (local.get $bands)
        (select (i32.const 0)
          (select (i32.const 510) (i32.add (local.get $e) (i32.const 255)) (i32.gt_s (local.get $e) (i32.const 255)))
          (i32.lt_s (local.get $e) (i32.const -255))))))
    (i32.store (i32.add (local.get $values) (i32.shl (local.get $at) (i32.const 2))) (local.get $value))
    (i32.store (i32.add (local.get $errors) (i32.shl (local.get $at) (i32.const 2))) (local.get $distance)))

  ;; capture-codec.mjs's scanColours over rows of `stride` words from `words` (the rectangle starts at word `x0`):
  ;; packed RGBA to dense indices in first-seen order. `keys` (4 bytes) and `slots` (2 bytes) are a zeroed open-address
  ;; table of mask+1 entries; `colours` 4 bytes a colour, `indices` 2 bytes a pixel, `first` and `last` 4 bytes a colour
  ;; (with `rows`). Answers the colour count, or -1 past `limit`.
  (func (export "scan")
    (param $words i32) (param $stride i32) (param $x0 i32) (param $w i32) (param $h i32) (param $limit i32) (param $rows i32)
    (param $keys i32) (param $slots i32) (param $mask i32) (param $shift i32) (param $colours i32) (param $indices i32)
    (param $first i32) (param $last i32) (result i32)
    (local $n i32) (local $previous i32) (local $have i32) (local $lastIndex i32) (local $i i32) (local $x i32)
    (local $y i32) (local $p i32) (local $size i32) (local $key i32) (local $slot i32) (local $s i32)
    (local.set $size (i32.mul (local.get $w) (local.get $h)))
    (local.set $p (local.get $x0))
    (block $done
      (loop $pixel
        (br_if $done (i32.ge_u (local.get $i) (local.get $size)))
        (block $next
          (if (i32.eq (local.get $x) (local.get $w))
            (then
              (local.set $x (i32.const 0))
              (local.set $y (i32.add (local.get $y) (i32.const 1)))
              (local.set $p (i32.add (local.get $p) (i32.sub (local.get $stride) (local.get $w))))
              (if (local.get $rows) (then (local.set $have (i32.const 0))))))
          (local.set $key (i32.load (i32.add (local.get $words) (i32.shl (local.get $p) (i32.const 2)))))
          (if (i32.and (local.get $have) (i32.eq (local.get $key) (local.get $previous)))
            (then
              (i32.store16 (i32.add (local.get $indices) (i32.shl (local.get $i) (i32.const 1))) (local.get $lastIndex))
              (br $next)))
          (if (i32.ge_u (local.get $i) (local.get $w))
            (then
              (if (i32.eq (local.get $key)
                    (i32.load (i32.add (local.get $words) (i32.shl (i32.sub (local.get $p) (local.get $stride)) (i32.const 2)))))
                (then
                  (local.set $lastIndex (i32.load16_u (i32.add (local.get $indices) (i32.shl (i32.sub (local.get $i) (local.get $w)) (i32.const 1)))))
                  (i32.store16 (i32.add (local.get $indices) (i32.shl (local.get $i) (i32.const 1))) (local.get $lastIndex))
                  (local.set $previous (local.get $key))
                  (local.set $have (i32.const 1))
                  (if (local.get $rows)
                    (then (i32.store (i32.add (local.get $last) (i32.shl (local.get $lastIndex) (i32.const 2))) (local.get $y))))
                  (br $next)))))
          (local.set $slot (i32.shr_u (i32.mul (local.get $key) (i32.const 0x9e3779b1)) (local.get $shift)))
          (block $found
            (loop $probe
              (local.set $s (i32.load16_u (i32.add (local.get $slots) (i32.shl (local.get $slot) (i32.const 1)))))
              (br_if $found (i32.eqz (local.get $s)))
              (br_if $found (i32.eq (i32.load (i32.add (local.get $keys) (i32.shl (local.get $slot) (i32.const 2)))) (local.get $key)))
              (local.set $slot (i32.and (i32.add (local.get $slot) (i32.const 1)) (local.get $mask)))
              (br $probe)))
          (if (i32.eqz (local.get $s))
            (then
              (if (i32.eq (local.get $n) (local.get $limit)) (then (return (i32.const -1))))
              (i32.store (i32.add (local.get $keys) (i32.shl (local.get $slot) (i32.const 2))) (local.get $key))
              (i32.store (i32.add (local.get $colours) (i32.shl (local.get $n) (i32.const 2))) (local.get $key))
              (local.set $n (i32.add (local.get $n) (i32.const 1)))
              (local.set $s (local.get $n))
              (i32.store16 (i32.add (local.get $slots) (i32.shl (local.get $slot) (i32.const 1))) (local.get $s))
              (if (local.get $rows)
                (then (i32.store (i32.add (local.get $first) (i32.shl (i32.sub (local.get $n) (i32.const 1)) (i32.const 2))) (local.get $y))))))
          (local.set $lastIndex (i32.sub (local.get $s) (i32.const 1)))
          (i32.store16 (i32.add (local.get $indices) (i32.shl (local.get $i) (i32.const 1))) (local.get $lastIndex))
          (local.set $previous (local.get $key))
          (local.set $have (i32.const 1))
          (if (local.get $rows)
            (then (i32.store (i32.add (local.get $last) (i32.shl (local.get $lastIndex) (i32.const 2))) (local.get $y)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (local.set $p (i32.add (local.get $p) (i32.const 1)))
        (br $pixel)))
    (local.get $n))

  ;; capture-codec.mjs's context tree: one node's token tally of pieces order[from, to) into `all` (128 4-byte counts)
  ;; and, with `bins`, every property's bins into `counts` (four spans of `span` 4-byte counts, y, x, W and N bins
  ;; times 128 plus the token). `order` holds 4-byte piece numbers; `tokens` and the bins one byte a piece.
  (func (export "tally")
    (param $order i32) (param $from i32) (param $to i32) (param $tokens i32) (param $by i32) (param $bx i32)
    (param $bw i32) (param $bn i32) (param $all i32) (param $counts i32) (param $span i32) (param $bins i32)
    (local $i i32) (local $k i32) (local $t i32) (local $a i32) (local $s4 i32)
    (memory.fill (local.get $all) (i32.const 0) (i32.const 512))
    (local.set $i (local.get $from))
    (block $done (loop $each
      (br_if $done (i32.ge_s (local.get $i) (local.get $to)))
      (local.set $a (i32.add (local.get $all)
        (i32.shl (i32.load8_u (i32.add (local.get $tokens) (i32.load (i32.add (local.get $order) (i32.shl (local.get $i) (i32.const 2)))))) (i32.const 2))))
      (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $each)))
    (if (i32.eqz (local.get $bins)) (then (return)))
    (local.set $s4 (i32.shl (local.get $span) (i32.const 2)))
    (memory.fill (local.get $counts) (i32.const 0) (i32.shl (local.get $s4) (i32.const 2)))
    (local.set $i (local.get $from))
    (block $done (loop $each
      (br_if $done (i32.ge_s (local.get $i) (local.get $to)))
      (local.set $k (i32.load (i32.add (local.get $order) (i32.shl (local.get $i) (i32.const 2)))))
      (local.set $t (i32.load8_u (i32.add (local.get $tokens) (local.get $k))))
      (local.set $a (i32.add (local.get $counts)
        (i32.shl (i32.add (i32.shl (i32.load8_u (i32.add (local.get $by) (local.get $k))) (i32.const 7)) (local.get $t)) (i32.const 2))))
      (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
      (local.set $a (i32.add (i32.add (local.get $counts) (local.get $s4))
        (i32.shl (i32.add (i32.shl (i32.load8_u (i32.add (local.get $bx) (local.get $k))) (i32.const 7)) (local.get $t)) (i32.const 2))))
      (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
      (local.set $a (i32.add (i32.add (local.get $counts) (i32.shl (local.get $s4) (i32.const 1)))
        (i32.shl (i32.add (i32.shl (i32.load8_u (i32.add (local.get $bw) (local.get $k))) (i32.const 7)) (local.get $t)) (i32.const 2))))
      (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
      (local.set $a (i32.add (i32.add (local.get $counts) (i32.mul (local.get $s4) (i32.const 3)))
        (i32.shl (i32.add (i32.shl (i32.load8_u (i32.add (local.get $bn) (local.get $k))) (i32.const 7)) (local.get $t)) (i32.const 2))))
      (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $each))))

  ;; The node's split: pieces of order[from, to) whose bin (one byte a piece) is over `cut` first, then the rest, each
  ;; side in order (through `scratch`). Answers where the second side starts.
  (func (export "part")
    (param $order i32) (param $from i32) (param $to i32) (param $bin i32) (param $cut i32) (param $scratch i32) (result i32)
    (local $i i32) (local $k i32) (local $a i32) (local $b i32)
    (local.set $i (local.get $from))
    (local.set $a (local.get $from))
    (block $done (loop $each
      (br_if $done (i32.ge_s (local.get $i) (local.get $to)))
      (local.set $k (i32.load (i32.add (local.get $order) (i32.shl (local.get $i) (i32.const 2)))))
      (if (i32.gt_s (i32.load8_u (i32.add (local.get $bin) (local.get $k))) (local.get $cut))
        (then
          (i32.store (i32.add (local.get $order) (i32.shl (local.get $a) (i32.const 2))) (local.get $k))
          (local.set $a (i32.add (local.get $a) (i32.const 1))))
        (else
          (i32.store (i32.add (local.get $scratch) (i32.shl (local.get $b) (i32.const 2))) (local.get $k))
          (local.set $b (i32.add (local.get $b) (i32.const 1)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $each)))
    (memory.copy (i32.add (local.get $order) (i32.shl (local.get $a) (i32.const 2))) (local.get $scratch) (i32.shl (local.get $b) (i32.const 2)))
    (local.get $a))

  ;; capture-codec.mjs's paletteModel over one channel's pieces (4-byte `values` and `distances`, `count` of them): each
  ;; literal's colour (its value halved) counted into `table` (4 bytes a colour), or with `relabel` taken through
  ;; `table` and doubled.
  (func (export "literals")
    (param $values i32) (param $distances i32) (param $count i32) (param $table i32) (param $relabel i32)
    (local $k i32) (local $v i32) (local $a i32)
    (block $done (loop $each
      (br_if $done (i32.ge_s (local.get $k) (local.get $count)))
      (if (i32.eqz (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2)))))
        (then
          (local.set $v (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2))))
          (local.set $a (i32.add (local.get $table) (i32.shl (i32.shr_s (i32.load (local.get $v)) (i32.const 1)) (i32.const 2))))
          (if (local.get $relabel)
            (then (i32.store (local.get $v) (i32.shl (i32.load (local.get $a)) (i32.const 1))))
            (else (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (br $each))))

  ;; capture-codec.mjs's writeChannels over one channel's pieces (4-byte `values` and `distances`, 1-byte `contexts`):
  ;; each literal under `small` counted into `table` (`small` 4-byte counts a context) and into `literals` (4 bytes a
  ;; context); every other piece's number written to `others` in stream order. Answers how many others.
  (func (export "pieces")
    (param $values i32) (param $distances i32) (param $contexts i32) (param $count i32) (param $small i32)
    (param $table i32) (param $literals i32) (param $others i32) (result i32)
    (local $k i32) (local $v i32) (local $c i32) (local $a i32) (local $n i32)
    (block $done (loop $each
      (br_if $done (i32.ge_s (local.get $k) (local.get $count)))
      (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $k) (i32.const 2)))))
      (if (i32.and
            (i32.eqz (i32.load (i32.add (local.get $distances) (i32.shl (local.get $k) (i32.const 2)))))
            (i32.lt_u (local.get $v) (local.get $small)))
        (then
          (local.set $c (i32.load8_u (i32.add (local.get $contexts) (local.get $k))))
          (local.set $a (i32.add (local.get $table) (i32.shl (i32.add (i32.mul (local.get $c) (local.get $small)) (local.get $v)) (i32.const 2))))
          (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1)))
          (local.set $a (i32.add (local.get $literals) (i32.shl (local.get $c) (i32.const 2))))
          (i32.store (local.get $a) (i32.add (i32.load (local.get $a)) (i32.const 1))))
        (else
          (i32.store (i32.add (local.get $others) (i32.shl (local.get $n) (i32.const 2))) (local.get $k))
          (local.set $n (i32.add (local.get $n) (i32.const 1)))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (br $each)))
    (local.get $n))
