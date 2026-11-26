;; SPDX-License-Identifier: MIT
;; kernels.mjs acGroup's staging of a packed group, one channel's rows at a time: each row's entries (positions at $at,
;; values at $val) and its blocks' nonzero counts, gathered from rows held in the arena (counts rows $stride blocks apart
;; at $cnt) to the arena's stage, in row order, as acGroup reads them. $offs: each row's first entry within the held
;; entries (i32 a row). The result is the entries staged.
(func (export "stageRows") (param $at i32) (param $val i32) (param $cnt i32) (param $offs i32) (param $bw i32) (param $rows i32)
    (param $stride i32) (param $bx0 i32) (param $dstAt i32) (param $dstVal i32) (param $dstCounts i32) (result i32)
  (local $y i32) (local $x i32) (local $len i32) (local $src i32) (local $row i32) (local $staged i32)
  (block $rowsDone (loop $each
    (br_if $rowsDone (i32.eq (local.get $y) (local.get $rows)))
    (local.set $src (i32.load (i32.add (local.get $offs) (i32.shl (local.get $y) (i32.const 2)))))
    (local.set $row (i32.add (i32.add (local.get $cnt) (i32.mul (local.get $y) (local.get $stride))) (local.get $bx0)))
    (local.set $len (i32.const 0)) (local.set $x (i32.const 0))
    (block $summed (loop $sum
      (br_if $summed (i32.eq (local.get $x) (local.get $bw)))
      (local.set $len (i32.add (local.get $len) (i32.load8_u (i32.add (local.get $row) (local.get $x)))))
      (local.set $x (i32.add (local.get $x) (i32.const 1)))
      (br $sum)))
    (memory.copy (i32.add (local.get $dstAt) (local.get $staged)) (i32.add (local.get $at) (local.get $src)) (local.get $len))
    (memory.copy (i32.add (local.get $dstVal) (i32.shl (local.get $staged) (i32.const 1))) (i32.add (local.get $val) (i32.shl (local.get $src) (i32.const 1)))
      (i32.shl (local.get $len) (i32.const 1)))
    (memory.copy (i32.add (local.get $dstCounts) (i32.mul (local.get $y) (local.get $bw))) (local.get $row) (local.get $bw))
    (local.set $staged (i32.add (local.get $staged) (local.get $len)))
    (local.set $y (i32.add (local.get $y) (i32.const 1)))
    (br $each)))
  (local.get $staged))
