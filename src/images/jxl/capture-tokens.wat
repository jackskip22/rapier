;; SPDX-License-Identifier: MIT
;; The photo frames' token statistics and entropy writing (capture-prefix.mjs, capture-ans-regions.mjs) over the tokens
;; captureTokenGroup leaves in memory: values (u32) at $vals, contexts (u16) at $ids, $n of them. Every integer the
;; JavaScript computes, in its order, so the same models and the same bits. Bits are written least significant first from
;; bit 0 of $out (a BitWriter's order); the functions that write return the bit count, the last partial byte stored.
;; A value of 2^30 or more (never a DCT8 level's) returns -2, so the JavaScript codes the group.

;; hybridToken's symbol for $v under the configuration at $cfg (splitToken, split, msb, lsb as i32).
(func $hybridSymbol (param $cfg i32) (param $v i32) (result i32)
  (local $e i32) (local $below i32) (local $msb i32) (local $lsb i32)
  (if (i32.lt_u (local.get $v) (i32.load (local.get $cfg))) (then (return (local.get $v))))
  (local.set $msb (i32.load offset=8 (local.get $cfg))) (local.set $lsb (i32.load offset=12 (local.get $cfg)))
  (local.set $e (i32.sub (i32.const 31) (i32.clz (local.get $v))))
  (local.set $below (i32.sub (local.get $v) (i32.shl (i32.const 1) (local.get $e))))
  (i32.add (i32.load (local.get $cfg))
    (i32.or (i32.or
      (i32.shl (i32.sub (local.get $e) (i32.load offset=4 (local.get $cfg))) (i32.add (local.get $msb) (local.get $lsb)))
      (i32.shl (i32.shr_u (local.get $below) (i32.sub (local.get $e) (local.get $msb))) (local.get $lsb)))
      (i32.and (local.get $below) (i32.sub (i32.shl (i32.const 1) (local.get $lsb)) (i32.const 1))))))
;; Its raw bits' count (hybridToken's out[1]) and value (out[2]).
(func $hybridCount (param $cfg i32) (param $v i32) (result i32)
  (if (result i32) (i32.lt_u (local.get $v) (i32.load (local.get $cfg))) (then (i32.const 0))
    (else (i32.sub (i32.sub (i32.sub (i32.const 31) (i32.clz (local.get $v))) (i32.load offset=8 (local.get $cfg))) (i32.load offset=12 (local.get $cfg))))))
(func $hybridBits (param $cfg i32) (param $v i32) (param $count i32) (result i32)
  (i32.and (i32.shr_u (local.get $v) (i32.load offset=12 (local.get $cfg))) (i32.sub (i32.shl (i32.const 1) (local.get $count)) (i32.const 1))))

;; buildCaptureTokenCoding's counts: a value under 64 adds one to $hist[ctx * 64 + value] (u32); a larger one is listed
;; as (ctx, value) at $over, in token order. Returns how many were listed, -1 for a context at or past $contexts.
(func (export "tokCount") (param $vals i32) (param $ids i32) (param $n i32) (param $contexts i32) (param $hist i32) (param $over i32) (result i32)
  (local $i i32) (local $v i32) (local $c i32) (local $k i32) (local $at i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $v (i32.load (i32.add (local.get $vals) (i32.shl (local.get $i) (i32.const 2)))))
    (local.set $c (i32.load16_u (i32.add (local.get $ids) (i32.shl (local.get $i) (i32.const 1)))))
    (if (i32.ge_u (local.get $c) (local.get $contexts)) (then (return (i32.const -1))))
    (if (i32.lt_u (local.get $v) (i32.const 64))
      (then
        (local.set $at (i32.add (local.get $hist) (i32.shl (i32.add (i32.shl (local.get $c) (i32.const 6)) (local.get $v)) (i32.const 2))))
        (i32.store (local.get $at) (i32.add (i32.load (local.get $at)) (i32.const 1))))
      (else
        (local.set $at (i32.add (local.get $over) (i32.shl (local.get $k) (i32.const 3))))
        (i32.store (local.get $at) (local.get $c)) (i32.store offset=4 (local.get $at) (local.get $v))
        (local.set $k (i32.add (local.get $k) (i32.const 1)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  (local.get $k))

;; regionAnsCoding's frequencies: each token's symbol under its histogram's ($map[ctx], u8) configuration ($cfgs + h * 16)
;; adds one to $freqs[h * 256 + symbol] (u32). Returns the largest symbol, -1 where one passes 255 (as the JavaScript
;; stops there), -2 for a value of 2^30 or more.
(func (export "tokFreqs") (param $vals i32) (param $ids i32) (param $n i32) (param $map i32) (param $cfgs i32) (param $freqs i32) (result i32)
  (local $i i32) (local $v i32) (local $h i32) (local $s i32) (local $largest i32) (local $at i32)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $v (i32.load (i32.add (local.get $vals) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.ge_u (local.get $v) (i32.const 0x40000000)) (then (return (i32.const -2))))
    (local.set $h (i32.load8_u (i32.add (local.get $map) (i32.load16_u (i32.add (local.get $ids) (i32.shl (local.get $i) (i32.const 1)))))))
    (local.set $s (call $hybridSymbol (i32.add (local.get $cfgs) (i32.shl (local.get $h) (i32.const 4))) (local.get $v)))
    (if (i32.gt_u (local.get $s) (i32.const 255)) (then (return (i32.const -1))))
    (local.set $at (i32.add (local.get $freqs) (i32.shl (i32.add (i32.shl (local.get $h) (i32.const 8)) (local.get $s)) (i32.const 2))))
    (i32.store (local.get $at) (i32.add (i32.load (local.get $at)) (i32.const 1)))
    (if (i32.gt_u (local.get $s) (local.get $largest)) (then (local.set $largest (local.get $s))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  (local.get $largest))

;; The writer: $acc's low $pending bits are pending; whole bytes go to $at. Globals, as $acBits keeps them.
(global $tkAcc (mut i64) (i64.const 0))
(global $tkPending (mut i32) (i32.const 0))
(global $tkAt (mut i32) (i32.const 0))
(func $tkBits (param $count i32) (param $v i32)
  (global.set $tkAcc (i64.or (global.get $tkAcc) (i64.shl (i64.extend_i32_u (local.get $v)) (i64.extend_i32_u (global.get $tkPending)))))
  (global.set $tkPending (i32.add (global.get $tkPending) (local.get $count)))
  (block $done (loop $bytes
    (br_if $done (i32.lt_u (global.get $tkPending) (i32.const 8)))
    (i32.store8 (global.get $tkAt) (i32.wrap_i64 (global.get $tkAcc)))
    (global.set $tkAt (i32.add (global.get $tkAt) (i32.const 1)))
    (global.set $tkAcc (i64.shr_u (global.get $tkAcc) (i64.const 8)))
    (global.set $tkPending (i32.sub (global.get $tkPending) (i32.const 8)))
    (br $bytes))))
;; The bit count written from $out; the partial byte, if any, stored after the whole ones.
(func $tkEnd (param $out i32) (result i32)
  (i32.store8 (global.get $tkAt) (i32.wrap_i64 (global.get $tkAcc)))
  (i32.add (i32.shl (i32.sub (global.get $tkAt) (local.get $out)) (i32.const 3)) (global.get $tkPending)))

;; regionAnsCoding's writeTokens: the tokens coded backwards from state 0x130000 with each histogram's tables at
;; $tabs + h * 9232 (counts u16[256] at 0, starts u16 at 512, reverse u16[4096] at 1040): a token whose state's top 12 bits
;; reach its frequency emits the state's low 16 bits first. Then the final state (32 bits) and, token by token, its word
;; and its raw bits. $words (i32 a token, -1 for none) and $raw (count and bits, 8 bytes a token) are scratch.
(func (export "tokAns") (param $vals i32) (param $ids i32) (param $n i32) (param $map i32) (param $cfgs i32) (param $tabs i32)
  (param $words i32) (param $raw i32) (param $out i32) (result i32)
  (local $i i32) (local $v i32) (local $h i32) (local $cfg i32) (local $s i32) (local $t i32) (local $freq i32) (local $state i32)
  (local $q i32) (local $count i32) (local $w i32)
  (local.set $state (i32.const 0x130000))
  (local.set $i (local.get $n))
  (block $done (loop $back
    (br_if $done (i32.eqz (local.get $i)))
    (local.set $i (i32.sub (local.get $i) (i32.const 1)))
    (local.set $v (i32.load (i32.add (local.get $vals) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.ge_u (local.get $v) (i32.const 0x40000000)) (then (return (i32.const -2))))
    (local.set $h (i32.load8_u (i32.add (local.get $map) (i32.load16_u (i32.add (local.get $ids) (i32.shl (local.get $i) (i32.const 1)))))))
    (local.set $cfg (i32.add (local.get $cfgs) (i32.shl (local.get $h) (i32.const 4))))
    (local.set $s (call $hybridSymbol (local.get $cfg) (local.get $v)))
    (local.set $count (call $hybridCount (local.get $cfg) (local.get $v)))
    (i32.store (i32.add (local.get $raw) (i32.shl (local.get $i) (i32.const 3))) (local.get $count))
    (i32.store offset=4 (i32.add (local.get $raw) (i32.shl (local.get $i) (i32.const 3))) (call $hybridBits (local.get $cfg) (local.get $v) (local.get $count)))
    (local.set $t (i32.add (local.get $tabs) (i32.mul (local.get $h) (i32.const 9232))))
    (local.set $freq (i32.load16_u (i32.add (local.get $t) (i32.shl (local.get $s) (i32.const 1)))))
    (if (i32.ge_u (i32.shr_u (local.get $state) (i32.const 20)) (local.get $freq))
      (then
        (i32.store (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2))) (i32.and (local.get $state) (i32.const 65535)))
        (local.set $state (i32.shr_u (local.get $state) (i32.const 16))))
      (else (i32.store (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2))) (i32.const -1))))
    (local.set $q (i32.div_u (local.get $state) (local.get $freq)))
    (local.set $state (i32.add (i32.shl (local.get $q) (i32.const 12))
      (i32.load16_u (i32.add (i32.add (local.get $t) (i32.const 1040)) (i32.shl
        (i32.add (i32.load16_u offset=512 (i32.add (local.get $t) (i32.shl (local.get $s) (i32.const 1))))
          (i32.sub (local.get $state) (i32.mul (local.get $q) (local.get $freq)))) (i32.const 1))))))
    (br $back)))
  (global.set $tkAcc (i64.const 0)) (global.set $tkPending (i32.const 0)) (global.set $tkAt (local.get $out))
  (call $tkBits (i32.const 16) (i32.and (local.get $state) (i32.const 65535)))
  (call $tkBits (i32.const 16) (i32.shr_u (local.get $state) (i32.const 16)))
  (block $written (loop $forward
    (br_if $written (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $w (i32.load (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.ge_s (local.get $w) (i32.const 0)) (then (call $tkBits (i32.const 16) (local.get $w))))
    (local.set $count (i32.load (i32.add (local.get $raw) (i32.shl (local.get $i) (i32.const 3)))))
    (if (local.get $count) (then (call $tkBits (local.get $count) (i32.load offset=4 (i32.add (local.get $raw) (i32.shl (local.get $i) (i32.const 3)))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $forward)))
  (call $tkEnd (local.get $out)))

;; buildCaptureTokenCoding's writeTokens: a value under 64 with an entry ($lengths i8 and $bits u32 at h * 64 + value)
;; is one write; any other its symbol's code ($codes: length and code, i32 each, at (h * 256 + symbol) * 8; length -1 for a
;; symbol the histogram never saw, which returns -1 so the JavaScript refuses it) and its raw bits.
(func (export "tokPrefix") (param $vals i32) (param $ids i32) (param $n i32) (param $map i32) (param $cfgs i32)
  (param $lengths i32) (param $bits i32) (param $codes i32) (param $out i32) (result i32)
  (local $i i32) (local $v i32) (local $h i32) (local $at i32) (local $len i32) (local $cfg i32) (local $s i32) (local $count i32)
  (global.set $tkAcc (i64.const 0)) (global.set $tkPending (i32.const 0)) (global.set $tkAt (local.get $out))
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $v (i32.load (i32.add (local.get $vals) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.ge_u (local.get $v) (i32.const 0x40000000)) (then (return (i32.const -2))))
    (local.set $h (i32.load8_u (i32.add (local.get $map) (i32.load16_u (i32.add (local.get $ids) (i32.shl (local.get $i) (i32.const 1)))))))
    (local.set $len (i32.const -1))
    (if (i32.lt_u (local.get $v) (i32.const 64)) (then
      (local.set $at (i32.add (i32.shl (local.get $h) (i32.const 6)) (local.get $v)))
      (local.set $len (i32.load8_s (i32.add (local.get $lengths) (local.get $at))))
      (if (i32.ge_s (local.get $len) (i32.const 0))
        (then (call $tkBits (local.get $len) (i32.load (i32.add (local.get $bits) (i32.shl (local.get $at) (i32.const 2)))))))))
    (if (i32.lt_s (local.get $len) (i32.const 0)) (then
      (local.set $cfg (i32.add (local.get $cfgs) (i32.shl (local.get $h) (i32.const 4))))
      (local.set $s (call $hybridSymbol (local.get $cfg) (local.get $v)))
      (local.set $at (i32.add (local.get $codes) (i32.shl (i32.add (i32.shl (local.get $h) (i32.const 8)) (local.get $s)) (i32.const 3))))
      (if (i32.lt_s (i32.load (local.get $at)) (i32.const 0)) (then (return (i32.const -1))))
      (call $tkBits (i32.load (local.get $at)) (i32.load offset=4 (local.get $at)))
      (local.set $count (call $hybridCount (local.get $cfg) (local.get $v)))
      (if (local.get $count) (then (call $tkBits (local.get $count) (call $hybridBits (local.get $cfg) (local.get $v) (local.get $count)))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  (call $tkEnd (local.get $out)))

;; exact-math.mjs exactLog for a normal x > 0: the exponent field read, the mantissa folded below sqrt 2, then 2 atanh s
;; summed term by term until a term is below 1e-18 of the sum, every operation the JavaScript's in its order.
(func $exactLog (param $x f64) (result f64)
  (local $bits i64) (local $e i32) (local $m f64) (local $s f64) (local $s2 f64) (local $term f64) (local $sum f64) (local $add f64) (local $n i32)
  (local.set $bits (i64.reinterpret_f64 (local.get $x)))
  (local.set $e (i32.sub (i32.wrap_i64 (i64.shr_u (local.get $bits) (i64.const 52))) (i32.const 1023)))
  (local.set $m (f64.reinterpret_i64 (i64.or (i64.and (local.get $bits) (i64.const 0x000fffffffffffff)) (i64.const 0x3ff0000000000000))))
  (if (f64.gt (local.get $m) (f64.const 1.4142135623730951))
    (then (local.set $m (f64.div (local.get $m) (f64.const 2))) (local.set $e (i32.add (local.get $e) (i32.const 1)))))
  (local.set $s (f64.div (f64.sub (local.get $m) (f64.const 1)) (f64.add (local.get $m) (f64.const 1))))
  (local.set $s2 (f64.mul (local.get $s) (local.get $s)))
  (local.set $term (local.get $s)) (local.set $sum (local.get $s))
  (local.set $n (i32.const 3))
  (block $done (loop $series
    (br_if $done (i32.ge_s (local.get $n) (i32.const 40)))
    (local.set $term (f64.mul (local.get $term) (local.get $s2)))
    (local.set $add (f64.div (local.get $term) (f64.convert_i32_s (local.get $n))))
    (local.set $sum (f64.add (local.get $sum) (local.get $add)))
    (br_if $done (f64.lt (f64.abs (local.get $add)) (f64.mul (f64.const 1e-18) (f64.abs (local.get $sum)))))
    (local.set $n (i32.add (local.get $n) (i32.const 2)))
    (br $series)))
  (f64.add (f64.mul (f64.convert_i32_s (local.get $e)) (f64.const 0.6931471803691238))
    (f64.add (f64.mul (f64.convert_i32_s (local.get $e)) (f64.const 1.9082149292705877e-10)) (f64.mul (f64.const 2) (local.get $sum)))))

;; capture-prefix.mjs population: n log2 n as n * exactLog(n) * log2 e, 0 below 2; remembered below 65536 at $tkMemo (0
;; until computed: every population from 2 is positive).
(global $tkMemo (mut i32) (i32.const 0))
(func $population (param $n f64) (result f64)
  (local $at i32) (local $p f64)
  (if (f64.lt (local.get $n) (f64.const 2)) (then (return (f64.const 0))))
  (if (f64.lt (local.get $n) (f64.const 65536)) (then
    (local.set $at (i32.add (global.get $tkMemo) (i32.shl (i32.trunc_f64_u (local.get $n)) (i32.const 3))))
    (local.set $p (f64.load (local.get $at)))
    (if (f64.ne (local.get $p) (f64.const 0)) (then (return (local.get $p))))
    (local.set $p (f64.mul (f64.mul (local.get $n) (call $exactLog (local.get $n))) (f64.const 1.4426950408889634)))
    (f64.store (local.get $at) (local.get $p))
    (return (local.get $p))))
  (f64.mul (f64.mul (local.get $n) (call $exactLog (local.get $n))) (f64.const 1.4426950408889634)))

;; capture-prefix.mjs entropy(a, pops, b, total, end): a cluster's tokens $a (u32[128]) with their populations $pops
;; (f64[128]) joined with a context's $b; $a 0 for a context alone.
(func $joinedBits (param $a i32) (param $pops i32) (param $b i32) (param $total f64) (param $end i32) (result f64)
  (local $i i32) (local $x i32) (local $y i32) (local $bits f64)
  (block $done (loop $each
    (br_if $done (i32.ge_u (local.get $i) (local.get $end)))
    (local.set $x (if (result i32) (local.get $a) (then (i32.load (i32.add (local.get $a) (i32.shl (local.get $i) (i32.const 2))))) (else (i32.const 0))))
    (local.set $y (i32.load (i32.add (local.get $b) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.or (local.get $x) (local.get $y)) (then
      (local.set $bits (f64.sub (local.get $bits)
        (if (result f64) (local.get $y)
          (then (call $population (f64.add (f64.convert_i32_u (local.get $x)) (f64.convert_i32_u (local.get $y)))))
          (else (f64.load (i32.add (local.get $pops) (i32.shl (local.get $i) (i32.const 3))))))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  (f64.add (local.get $bits) (call $population (local.get $total))))

;; capture-prefix.mjs's greedy clusters: $count contexts in the order the JavaScript takes them, each its 128 token counts
;; at $owns + i * 512, its last used token + 1 at $ends (i32) and its total at $totals (u32). Each joins the cluster whose
;; entropy grows least (the first such), or starts one while there are under $most and the growth passes $split bits. Clusters
;; at $clusters (1568 bytes each: counts u32[128], populations f64[128], total f64, bits f64, end i32); each context's
;; cluster at $out (i32); the populations' memo at $memo (65536 f64). Returns the number of clusters.
(func (export "tokClusters") (param $owns i32) (param $ends i32) (param $totals i32) (param $count i32) (param $clusters i32) (param $memo i32) (param $out i32) (param $split f64) (param $most i32) (result i32)
  (local $i i32) (local $j i32) (local $s i32) (local $own i32) (local $end i32) (local $total f64) (local $ownBits f64) (local $c i32)
  (local $made i32) (local $best i32) (local $increase f64) (local $merged f64) (local $joined f64) (local $next f64) (local $top i32) (local $v i32)
  (global.set $tkMemo (local.get $memo))
  (block $all (loop $contexts
    (br_if $all (i32.ge_u (local.get $i) (local.get $count)))
    (local.set $own (i32.add (local.get $owns) (i32.shl (local.get $i) (i32.const 9))))
    (local.set $end (i32.load (i32.add (local.get $ends) (i32.shl (local.get $i) (i32.const 2)))))
    (local.set $total (f64.convert_i32_u (i32.load (i32.add (local.get $totals) (i32.shl (local.get $i) (i32.const 2))))))
    (local.set $ownBits (call $joinedBits (i32.const 0) (i32.const 0) (local.get $own) (local.get $total) (local.get $end)))
    (local.set $best (i32.const -1)) (local.set $increase (f64.const inf)) (local.set $merged (f64.const 0))
    (local.set $j (i32.const 0))
    (block $tried (loop $try
      (br_if $tried (i32.ge_u (local.get $j) (local.get $made)))
      (local.set $c (i32.add (local.get $clusters) (i32.mul (local.get $j) (i32.const 1568))))
      (local.set $top (i32.load offset=1552 (local.get $c)))
      (local.set $joined (call $joinedBits (local.get $c) (i32.add (local.get $c) (i32.const 512)) (local.get $own)
        (f64.add (f64.load offset=1536 (local.get $c)) (local.get $total)) (select (local.get $top) (local.get $end) (i32.gt_u (local.get $top) (local.get $end)))))
      (local.set $next (f64.sub (f64.sub (local.get $joined) (f64.load offset=1544 (local.get $c))) (local.get $ownBits)))
      (if (f64.lt (local.get $next) (local.get $increase))
        (then (local.set $increase (local.get $next)) (local.set $best (local.get $j)) (local.set $merged (local.get $joined))))
      (local.set $j (i32.add (local.get $j) (i32.const 1)))
      (br $try)))
    (if (i32.or (i32.lt_s (local.get $best) (i32.const 0)) (i32.and (i32.lt_u (local.get $made) (local.get $most)) (f64.gt (local.get $increase) (local.get $split))))
      (then
        (local.set $c (i32.add (local.get $clusters) (i32.mul (local.get $made) (i32.const 1568))))
        (local.set $s (i32.const 0))
        (loop $copy
          (local.set $v (i32.load (i32.add (local.get $own) (i32.shl (local.get $s) (i32.const 2)))))
          (i32.store (i32.add (local.get $c) (i32.shl (local.get $s) (i32.const 2))) (local.get $v))
          (f64.store offset=512 (i32.add (local.get $c) (i32.shl (local.get $s) (i32.const 3))) (call $population (f64.convert_i32_u (local.get $v))))
          (local.set $s (i32.add (local.get $s) (i32.const 1)))
          (br_if $copy (i32.lt_u (local.get $s) (i32.const 128))))
        (f64.store offset=1536 (local.get $c) (local.get $total))
        (f64.store offset=1544 (local.get $c) (local.get $ownBits))
        (i32.store offset=1552 (local.get $c) (local.get $end))
        (i32.store (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 2))) (local.get $made))
        (local.set $made (i32.add (local.get $made) (i32.const 1))))
      (else
        (local.set $c (i32.add (local.get $clusters) (i32.mul (local.get $best) (i32.const 1568))))
        (f64.store offset=1536 (local.get $c) (f64.add (f64.load offset=1536 (local.get $c)) (local.get $total)))
        (f64.store offset=1544 (local.get $c) (local.get $merged))
        (local.set $top (i32.load offset=1552 (local.get $c)))
        (i32.store offset=1552 (local.get $c) (select (local.get $top) (local.get $end) (i32.gt_u (local.get $top) (local.get $end))))
        (local.set $s (i32.const 0))
        (loop $merge
          (local.set $v (i32.load (i32.add (local.get $own) (i32.shl (local.get $s) (i32.const 2)))))
          (if (local.get $v) (then
            (local.set $v (i32.add (local.get $v) (i32.load (i32.add (local.get $c) (i32.shl (local.get $s) (i32.const 2))))))
            (i32.store (i32.add (local.get $c) (i32.shl (local.get $s) (i32.const 2))) (local.get $v))
            (f64.store offset=512 (i32.add (local.get $c) (i32.shl (local.get $s) (i32.const 3))) (call $population (f64.convert_i32_u (local.get $v))))))
          (local.set $s (i32.add (local.get $s) (i32.const 1)))
          (br_if $merge (i32.lt_u (local.get $s) (i32.const 128))))
        (i32.store (i32.add (local.get $out) (i32.shl (local.get $i) (i32.const 2))) (local.get $best))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $contexts)))
  (local.get $made))
