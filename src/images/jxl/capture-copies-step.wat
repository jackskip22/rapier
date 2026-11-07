;; SPDX-License-Identifier: MIT


  ;; Additive continuation of copies. Emits at most quota pieces, preserving every search choice and the full
  ;; 1024-group geometry. The caller restores heads, chain, scratch and these six cursor words in a fresh arena.
  (func (export "copiesStep")
    (param $values i32) (param $contexts i32) (param $n i32) (param $width i32) (param $depth i32)
    (param $minimum i32) (param $scale i32) (param $spatial i32) (param $spatialLen i32)
    (param $heads i32) (param $chain i32) (param $scratch i32)
    (param $outVal i32) (param $outDist i32) (param $outCtx i32) (param $lazyUnder i32) (param $nice i32)
    (param $state i32) (param $quota i32)
    (result i32)
    (local $position i32) (local $copy i32) (local $from i32) (local $fromCost i32) (local $next i32) (local $count i32) (local $i i32)
    ;; Six words: initialized, inserted, position, copy, from, fromCost. All byte offsets are local to this call.
    (if (i32.eqz (i32.load (local.get $state)))
      (then
        (global.set $inserted (i32.const 0))
        (if (local.get $depth) (then (memory.fill (local.get $heads) (i32.const 255) (i32.const 262144))))
        (memory.fill (local.get $scratch) (i32.const 0) (i32.const 832))
        (local.set $copy
          (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (local.get $minimum)
            (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch) (i32.const 0) (local.get $nice)))
        (local.set $from (global.get $bestDist))
        (local.set $fromCost (global.get $bestCost))
        (i32.store (local.get $state) (i32.const 1)))
      (else
        (global.set $inserted (i32.load offset=4 (local.get $state)))
        (local.set $position (i32.load offset=8 (local.get $state)))
        (local.set $copy (i32.load offset=12 (local.get $state)))
        (local.set $from (i32.load offset=16 (local.get $state)))
        (local.set $fromCost (i32.load offset=20 (local.get $state)))))
    (block $done
      (loop $loop
        (br_if $done (i32.ge_s (local.get $position) (local.get $n)))
        (br_if $done (i32.ge_s (local.get $count) (local.get $quota)))
        (if (local.get $copy)
          (then
            ;; The lazy probe: a copy under `lazyUnder` may give way to one starting a value later.
            (local.set $next
              (if (result i32) (i32.and (i32.ne (local.get $depth) (i32.const 0)) (i32.lt_s (local.get $copy) (local.get $lazyUnder)))
                (then
                  (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (local.get $minimum)
                    (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch)
                    (i32.add (local.get $position) (i32.const 1)) (local.get $nice)))
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
                  (i32.mul (i32.load16_u (i32.add (local.get $values) (i32.shl (local.get $position) (i32.const 1)))) (local.get $scale)))
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
                  (i32.add (local.get $position) (i32.const 8)) (local.get $nice)))
                (global.set $inserted (i32.sub (i32.add (local.get $position) (local.get $copy)) (i32.const 3)))))
            (local.set $position (i32.add (local.get $position) (local.get $copy))))
          (else
            (if (local.get $contexts)
              (then (i32.store8 (i32.add (local.get $outCtx) (local.get $count)) (i32.load8_u (i32.add (local.get $contexts) (local.get $position))))))
            (i32.store (i32.add (local.get $outVal) (i32.shl (local.get $count) (i32.const 2)))
              (i32.mul (i32.load16_u (i32.add (local.get $values) (i32.shl (local.get $position) (i32.const 1)))) (local.get $scale)))
            (i32.store (i32.add (local.get $outDist) (i32.shl (local.get $count) (i32.const 2))) (i32.const 0))
            (local.set $count (i32.add (local.get $count) (i32.const 1)))
            (local.set $position (i32.add (local.get $position) (i32.const 1)))))
        (local.set $copy
          (call $copyFind (local.get $values) (local.get $n) (local.get $width) (local.get $depth) (local.get $minimum)
            (local.get $spatial) (local.get $spatialLen) (local.get $heads) (local.get $chain) (local.get $scratch) (local.get $position) (local.get $nice)))
        (local.set $from (global.get $bestDist))
        (local.set $fromCost (global.get $bestCost))
        (br $loop)))
    (i32.store offset=4 (local.get $state) (global.get $inserted))
    (i32.store offset=8 (local.get $state) (local.get $position))
    (i32.store offset=12 (local.get $state) (local.get $copy))
    (i32.store offset=16 (local.get $state) (local.get $from))
    (i32.store offset=20 (local.get $state) (local.get $fromCost))
    (local.get $count))