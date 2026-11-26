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
(func (param $vals i32) (param $ids i32) (param $n i32) (param $contexts i32) (param $hist i32) (param $over i32) (result i32)
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
(func (param $vals i32) (param $ids i32) (param $n i32) (param $map i32) (param $cfgs i32) (param $freqs i32) (result i32)
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

;; The writer is kernels-simd.wat's $acBits and its globals ($acAcc, $acPending, $acOut): each export here sets them first.
;; The bit count written from $out; the partial byte, if any, stored after the whole ones.
(func $tkEnd (param $out i32) (result i32)
  (i32.store8 (global.get $acOut) (i32.wrap_i64 (global.get $acAcc)))
  (i32.add (i32.shl (i32.sub (global.get $acOut) (local.get $out)) (i32.const 3)) (global.get $acPending)))

;; regionAnsCoding's writeTokens: the tokens coded backwards from state 0x130000 with each histogram's tables at
;; $tabs + h * 9232 (counts u16[256] at 0, starts u16 at 512, reverse u16[4096] at 1040): a token whose state's top 12 bits
;; reach its frequency emits the state's low 16 bits first. Then the final state (32 bits) and, token by token, its word
;; and its raw bits. $words (i32 a token, -1 for none) and $raw (count and bits, 8 bytes a token) are scratch.
(func (param $vals i32) (param $ids i32) (param $n i32) (param $map i32) (param $cfgs i32) (param $tabs i32)
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
  (global.set $acAcc (i64.const 0)) (global.set $acPending (i32.const 0)) (global.set $acOut (local.get $out))
  (call $acBits (i32.const 16) (i32.and (local.get $state) (i32.const 65535)))
  (call $acBits (i32.const 16) (i32.shr_u (local.get $state) (i32.const 16)))
  (block $written (loop $forward
    (br_if $written (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $w (i32.load (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.ge_s (local.get $w) (i32.const 0)) (then (call $acBits (i32.const 16) (local.get $w))))
    (local.set $count (i32.load (i32.add (local.get $raw) (i32.shl (local.get $i) (i32.const 3)))))
    (if (local.get $count) (then (call $acBits (local.get $count) (i32.load offset=4 (i32.add (local.get $raw) (i32.shl (local.get $i) (i32.const 3)))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $forward)))
  (call $tkEnd (local.get $out)))

;; tokAns over tokens already made (capture-ans.mjs's, copies included), in two calls. tokAnsBack codes the $n tags at
;; $tags (u32: histogram << 16 | raw-bit count << 9 | symbol, ans.mjs's) backwards with the tables at $tabs + h * 9232
;; as tokAns reads them: a token that emits a state word gets bit 15 of its tag and pushes the word (u16) down from $words
;; (a photograph's tokens emit one in four), never below $floor (else -1). It stores where the words begin at $words
;; (u32), keeps the final state and returns the stream's bits (the state, the words and the raw bits).
(global $tkState (mut i32) (i32.const 0))
(func (export "tokAnsBack") (param $tags i32) (param $n i32) (param $tabs i32) (param $words i32) (param $floor i32) (result i32)
  (local $i i32) (local $at i32) (local $tag i32) (local $s i32) (local $t i32) (local $freq i32) (local $state i32) (local $q i32) (local $bits i32) (local $top i32)
  (local.set $state (i32.const 0x130000)) (local.set $bits (i32.const 32)) (local.set $top (local.get $words))
  (local.set $i (local.get $n))
  (block $done (loop $back
    (br_if $done (i32.eqz (local.get $i)))
    (local.set $i (i32.sub (local.get $i) (i32.const 1)))
    (local.set $at (i32.add (local.get $tags) (i32.shl (local.get $i) (i32.const 2))))
    (local.set $tag (i32.and (i32.load (local.get $at)) (i32.const 0xffff7fff)))
    (local.set $s (i32.and (local.get $tag) (i32.const 511)))
    (local.set $t (i32.add (local.get $tabs) (i32.mul (i32.shr_u (local.get $tag) (i32.const 16)) (i32.const 9232))))
    (local.set $freq (i32.load16_u (i32.add (local.get $t) (i32.shl (local.get $s) (i32.const 1)))))
    (local.set $bits (i32.add (local.get $bits) (i32.and (i32.shr_u (local.get $tag) (i32.const 9)) (i32.const 63))))
    (if (i32.ge_u (i32.shr_u (local.get $state) (i32.const 20)) (local.get $freq)) (then
      (local.set $words (i32.sub (local.get $words) (i32.const 2)))
      (if (i32.lt_u (local.get $words) (local.get $floor)) (then (return (i32.const -1))))
      (i32.store16 (local.get $words) (local.get $state))
      (local.set $tag (i32.or (local.get $tag) (i32.const 32768)))
      (local.set $bits (i32.add (local.get $bits) (i32.const 16)))
      (local.set $state (i32.shr_u (local.get $state) (i32.const 16)))))
    (i32.store (local.get $at) (local.get $tag))
    (local.set $q (i32.div_u (local.get $state) (local.get $freq)))
    (local.set $state (i32.add (i32.shl (local.get $q) (i32.const 12))
      (i32.load16_u (i32.add (i32.add (local.get $t) (i32.const 1040)) (i32.shl
        (i32.add (i32.load16_u offset=512 (i32.add (local.get $t) (i32.shl (local.get $s) (i32.const 1))))
          (i32.sub (local.get $state) (i32.mul (local.get $q) (local.get $freq)))) (i32.const 1))))))
    (br $back)))
  (i32.store (local.get $top) (local.get $words))
  (global.set $tkState (local.get $state))
  (local.get $bits))
;; After tokAnsBack: the final state (32 bits), then each token's state word where its tag has bit 15 (in order from
;; $words, where tokAnsBack's begin) and its raw bits ($extras: u32 for each token with raw bits, in order), after
;; $pending bits ($acc), from $out: the bit count, the partial byte stored after the whole ones.
(func (export "tokAnsWrite") (param $tags i32) (param $extras i32) (param $n i32) (param $words i32) (param $acc i32) (param $pending i32) (param $out i32) (result i32)
  (local $i i32) (local $tag i32) (local $count i32)
  (global.set $acAcc (i64.extend_i32_u (local.get $acc))) (global.set $acPending (local.get $pending)) (global.set $acOut (local.get $out))
  (call $acBits (i32.const 16) (i32.and (global.get $tkState) (i32.const 65535)))
  (call $acBits (i32.const 16) (i32.shr_u (global.get $tkState) (i32.const 16)))
  (block $written (loop $forward
    (br_if $written (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $tag (i32.load (i32.add (local.get $tags) (i32.shl (local.get $i) (i32.const 2)))))
    (if (i32.and (local.get $tag) (i32.const 32768))
      (then (call $acBits (i32.const 16) (i32.load16_u (local.get $words))) (local.set $words (i32.add (local.get $words) (i32.const 2)))))
    (local.set $count (i32.and (i32.shr_u (local.get $tag) (i32.const 9)) (i32.const 63)))
    (if (local.get $count) (then
      (call $acBits (local.get $count) (i32.load (local.get $extras)))
      (local.set $extras (i32.add (local.get $extras) (i32.const 4)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $forward)))
  (call $tkEnd (local.get $out)))

;; buildCaptureTokenCoding's writeTokens: a value under 64 with an entry ($lengths i8 and $bits u32 at h * 64 + value)
;; is one write; any other its symbol's code ($codes: length and code, i32 each, at (h * 256 + symbol) * 8; length -1 for a
;; symbol the histogram never saw, which returns -1 so the JavaScript refuses it) and its raw bits.
(func (param $vals i32) (param $ids i32) (param $n i32) (param $map i32) (param $cfgs i32)
  (param $lengths i32) (param $bits i32) (param $codes i32) (param $out i32) (result i32)
  (local $i i32) (local $v i32) (local $h i32) (local $at i32) (local $len i32) (local $cfg i32) (local $s i32) (local $count i32)
  (global.set $acAcc (i64.const 0)) (global.set $acPending (i32.const 0)) (global.set $acOut (local.get $out))
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
        (then (call $acBits (local.get $len) (i32.load (i32.add (local.get $bits) (i32.shl (local.get $at) (i32.const 2)))))))))
    (if (i32.lt_s (local.get $len) (i32.const 0)) (then
      (local.set $cfg (i32.add (local.get $cfgs) (i32.shl (local.get $h) (i32.const 4))))
      (local.set $s (call $hybridSymbol (local.get $cfg) (local.get $v)))
      (local.set $at (i32.add (local.get $codes) (i32.shl (i32.add (i32.shl (local.get $h) (i32.const 8)) (local.get $s)) (i32.const 3))))
      (if (i32.lt_s (i32.load (local.get $at)) (i32.const 0)) (then (return (i32.const -1))))
      (call $acBits (i32.load (local.get $at)) (i32.load offset=4 (local.get $at)))
      (local.set $count (call $hybridCount (local.get $cfg) (local.get $v)))
      (if (local.get $count) (then (call $acBits (local.get $count) (call $hybridBits (local.get $cfg) (local.get $v) (local.get $count)))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $each)))
  (call $tkEnd (local.get $out)))

;; log x for a normal x > 0: the exponent field read, the mantissa folded below sqrt 2, then 2 atanh s
;; summed term by term until a term is below 1e-18 of the sum, every operation the JavaScript's in its order.

;; capture-prefix.mjs population: n log2 n as n * exactLog(n) * log2 e, 0 below 2; remembered below 65536 at $tkMemo (0
;; until computed: every population from 2 is positive).

;; capture-prefix.mjs entropy(a, pops, b, total, end): a cluster's tokens $a (u32[128]) with their populations $pops
;; (f64[128]) joined with a context's $b; $a 0 for a context alone.

;; capture-prefix.mjs's greedy clusters: $count contexts in the order the JavaScript takes them, each its 128 token counts
;; at $owns + i * 512, its last used token + 1 at $ends (i32) and its total at $totals (u32). Each joins the cluster whose
;; entropy grows least (the first such), or starts one while there are under $most and the growth passes $split bits. Clusters
;; at $clusters (1568 bytes each: counts u32[128], populations f64[128], total f64, bits f64, end i32); each context's
;; cluster at $out (i32); the populations' memo at $memo (65536 f64). Returns the number of clusters.

;; Smooth-field colors retain raster insertion order. Slots hold color indices plus one, zero means unused.
(func $smoothSlot (param $word i32) (param $slots i32) (param $mask i32) (param $words i32) (result i32)
  (local $slot i32) (local $at i32) (local $index i32)
  (local.set $slot (i32.shr_u (i32.mul (local.get $word) (i32.const 0x9e3779b1)) (i32.clz (local.get $mask))))
  (loop $probe
    (local.set $at (i32.add (local.get $slots) (i32.shl (local.get $slot) (i32.const 2))))
    (local.set $index (i32.load (local.get $at)))
    (if (i32.eqz (local.get $index)) (then (return (local.get $at))))
    (if (i32.eq (local.get $word) (i32.load (i32.add (local.get $words) (i32.shl (i32.sub (local.get $index) (i32.const 1)) (i32.const 2)))))
      (then (return (local.get $at))))
    (local.set $slot (i32.and (i32.add (local.get $slot) (i32.const 1)) (local.get $mask)))
    (br $probe))
  (unreachable))

;; Counts a pixel band. On a new color past capacity returns -(consumed + 1), leaving that pixel for the grown table.
(func (export "smoothCount") (param $rgba i32) (param $exact i32) (param $n i32) (param $slots i32) (param $mask i32)
  (param $words i32) (param $counts i32) (param $used i32) (param $capacity i32) (result i32)
  (local $i i32) (local $word i32) (local $at i32) (local $index i32) (local $count i32)
  (block $done (loop $pixel
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (if (i32.eqz (i32.load8_u (i32.add (local.get $exact) (local.get $i)))) (then
      (local.set $word (i32.and (i32.load (i32.add (local.get $rgba) (i32.shl (local.get $i) (i32.const 2)))) (i32.const 0xffffff)))
      (local.set $at (call $smoothSlot (local.get $word) (local.get $slots) (local.get $mask) (local.get $words)))
      (local.set $index (i32.load (local.get $at)))
      (if (i32.eqz (local.get $index)) (then
        (if (i32.eq (local.get $used) (local.get $capacity))
          (then (return (i32.sub (i32.const -1) (local.get $i)))))
        (i32.store (i32.add (local.get $words) (i32.shl (local.get $used) (i32.const 2))) (local.get $word))
        (i32.store (i32.add (local.get $counts) (i32.shl (local.get $used) (i32.const 2))) (i32.const 0))
        (local.set $used (i32.add (local.get $used) (i32.const 1)))
        (local.set $index (local.get $used))
        (i32.store (local.get $at) (local.get $index))))
      (local.set $count (i32.add (local.get $counts) (i32.shl (i32.sub (local.get $index) (i32.const 1)) (i32.const 2))))
      (i32.store (local.get $count) (i32.add (i32.load (local.get $count)) (i32.const 1)))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $pixel)))
  (local.get $used))

;; Relocates a grown dictionary before clearing and rebuilding its slots. Both copies may overlap their old arrays.
(func (export "smoothRehash") (param $oldWords i32) (param $oldCounts i32) (param $words i32) (param $counts i32)
  (param $slots i32) (param $mask i32) (param $used i32)
  (local $i i32) (local $word i32) (local $at i32)
  (memory.copy (local.get $counts) (local.get $oldCounts) (i32.shl (local.get $used) (i32.const 2)))
  (memory.copy (local.get $words) (local.get $oldWords) (i32.shl (local.get $used) (i32.const 2)))
  (memory.fill (local.get $slots) (i32.const 0) (i32.shl (i32.add (local.get $mask) (i32.const 1)) (i32.const 2)))
  (block $done (loop $color
    (br_if $done (i32.ge_u (local.get $i) (local.get $used)))
    (local.set $word (i32.load (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2)))))
    (local.set $at (call $smoothSlot (local.get $word) (local.get $slots) (local.get $mask) (local.get $words)))
    (i32.store (local.get $at) (i32.add (local.get $i) (i32.const 1)))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $color))))

;; Stable byte radix grouping preserves each bucket's source order, including equal-cost and popularity ties.
;; Keys become the selected source RGB word per color. Every arithmetic step uses binary64 without reassociation.
(func (export "smoothPalette") (param $words i32) (param $counts i32) (param $n i32) (param $step f64)
  (param $keys i32) (param $order i32) (param $temporary i32) (param $histogram i32)
  (local $i i32) (local $j i32) (local $word i32) (local $index i32) (local $key i32) (local $shift i32)
  (local $from i32) (local $to i32) (local $swap i32) (local $bucket i32) (local $at i32) (local $sum i32) (local $count i32)
  (local $first i32) (local $end i32) (local $best i32) (local $bestCount i32)
  (local $total f64) (local $red f64) (local $green f64) (local $blue f64) (local $weight f64)
  (local $dr f64) (local $dg f64) (local $db f64) (local $cost f64) (local $bestCost f64)
  (block $ready (loop $keyColor
    (br_if $ready (i32.ge_u (local.get $i) (local.get $n)))
    (local.set $word (i32.load (i32.add (local.get $words) (i32.shl (local.get $i) (i32.const 2)))))
    (local.set $key (i32.or
      (i32.or
        (i32.trunc_sat_f64_u (f64.floor (f64.div (f64.convert_i32_u (i32.and (local.get $word) (i32.const 255))) (local.get $step))))
        (i32.shl (i32.trunc_sat_f64_u (f64.floor (f64.div (f64.convert_i32_u (i32.and (i32.shr_u (local.get $word) (i32.const 8)) (i32.const 255))) (local.get $step)))) (i32.const 8)))
      (i32.shl (i32.trunc_sat_f64_u (f64.floor (f64.div (f64.convert_i32_u (i32.shr_u (local.get $word) (i32.const 16))) (local.get $step)))) (i32.const 16))))
    (i32.store (i32.add (local.get $keys) (i32.shl (local.get $i) (i32.const 2))) (local.get $key))
    (i32.store (i32.add (local.get $order) (i32.shl (local.get $i) (i32.const 2))) (local.get $i))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $keyColor)))
  (local.set $from (local.get $order)) (local.set $to (local.get $temporary))
  (loop $pass
    (memory.fill (local.get $histogram) (i32.const 0) (i32.const 1024))
    (local.set $i (i32.const 0))
    (block $counted (loop $tally
      (br_if $counted (i32.ge_u (local.get $i) (local.get $n)))
      (local.set $index (i32.load (i32.add (local.get $from) (i32.shl (local.get $i) (i32.const 2)))))
      (local.set $key (i32.load (i32.add (local.get $keys) (i32.shl (local.get $index) (i32.const 2)))))
      (local.set $bucket (i32.and (i32.shr_u (local.get $key) (local.get $shift)) (i32.const 255)))
      (local.set $at (i32.add (local.get $histogram) (i32.shl (local.get $bucket) (i32.const 2))))
      (i32.store (local.get $at) (i32.add (i32.load (local.get $at)) (i32.const 1)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $tally)))
    (local.set $i (i32.const 0)) (local.set $sum (i32.const 0))
    (loop $prefix
      (local.set $at (i32.add (local.get $histogram) (i32.shl (local.get $i) (i32.const 2))))
      (local.set $count (i32.load (local.get $at))) (i32.store (local.get $at) (local.get $sum))
      (local.set $sum (i32.add (local.get $sum) (local.get $count)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $prefix (i32.lt_u (local.get $i) (i32.const 256))))
    (local.set $i (i32.const 0))
    (block $scattered (loop $scatter
      (br_if $scattered (i32.ge_u (local.get $i) (local.get $n)))
      (local.set $index (i32.load (i32.add (local.get $from) (i32.shl (local.get $i) (i32.const 2)))))
      (local.set $key (i32.load (i32.add (local.get $keys) (i32.shl (local.get $index) (i32.const 2)))))
      (local.set $bucket (i32.and (i32.shr_u (local.get $key) (local.get $shift)) (i32.const 255)))
      (local.set $at (i32.add (local.get $histogram) (i32.shl (local.get $bucket) (i32.const 2))))
      (local.set $count (i32.load (local.get $at)))
      (i32.store (i32.add (local.get $to) (i32.shl (local.get $count) (i32.const 2))) (local.get $index))
      (i32.store (local.get $at) (i32.add (local.get $count) (i32.const 1)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $scatter)))
    (local.set $swap (local.get $from)) (local.set $from (local.get $to)) (local.set $to (local.get $swap))
    (local.set $shift (i32.add (local.get $shift) (i32.const 8)))
    (br_if $pass (i32.lt_u (local.get $shift) (i32.const 24))))
  (block $done (loop $group
    (br_if $done (i32.ge_u (local.get $first) (local.get $n)))
    (local.set $index (i32.load (i32.add (local.get $from) (i32.shl (local.get $first) (i32.const 2)))))
    (local.set $key (i32.load (i32.add (local.get $keys) (i32.shl (local.get $index) (i32.const 2)))))
    (local.set $end (local.get $first))
    (local.set $total (f64.const 0)) (local.set $red (f64.const 0)) (local.set $green (f64.const 0)) (local.set $blue (f64.const 0))
    (block $summed (loop $member
      (br_if $summed (i32.ge_u (local.get $end) (local.get $n)))
      (local.set $index (i32.load (i32.add (local.get $from) (i32.shl (local.get $end) (i32.const 2)))))
      (br_if $summed (i32.ne (local.get $key) (i32.load (i32.add (local.get $keys) (i32.shl (local.get $index) (i32.const 2))))))
      (local.set $word (i32.load (i32.add (local.get $words) (i32.shl (local.get $index) (i32.const 2)))))
      (local.set $weight (f64.convert_i32_u (i32.load (i32.add (local.get $counts) (i32.shl (local.get $index) (i32.const 2))))))
      (local.set $total (f64.add (local.get $total) (local.get $weight)))
      (local.set $red (f64.add (local.get $red) (f64.mul (f64.convert_i32_u (i32.and (local.get $word) (i32.const 255))) (local.get $weight))))
      (local.set $green (f64.add (local.get $green) (f64.mul (f64.convert_i32_u (i32.and (i32.shr_u (local.get $word) (i32.const 8)) (i32.const 255))) (local.get $weight))))
      (local.set $blue (f64.add (local.get $blue) (f64.mul (f64.convert_i32_u (i32.shr_u (local.get $word) (i32.const 16))) (local.get $weight))))
      (local.set $end (i32.add (local.get $end) (i32.const 1)))
      (br $member)))
    (local.set $red (f64.div (local.get $red) (local.get $total)))
    (local.set $green (f64.div (local.get $green) (local.get $total)))
    (local.set $blue (f64.div (local.get $blue) (local.get $total)))
    (local.set $bestCost (f64.const inf)) (local.set $bestCount (i32.const 0)) (local.set $j (local.get $first))
    (loop $choose
      (local.set $index (i32.load (i32.add (local.get $from) (i32.shl (local.get $j) (i32.const 2)))))
      (local.set $word (i32.load (i32.add (local.get $words) (i32.shl (local.get $index) (i32.const 2)))))
      (local.set $count (i32.load (i32.add (local.get $counts) (i32.shl (local.get $index) (i32.const 2)))))
      (local.set $dr (f64.sub (f64.convert_i32_u (i32.and (local.get $word) (i32.const 255))) (local.get $red)))
      (local.set $dg (f64.sub (f64.convert_i32_u (i32.and (i32.shr_u (local.get $word) (i32.const 8)) (i32.const 255))) (local.get $green)))
      (local.set $db (f64.sub (f64.convert_i32_u (i32.shr_u (local.get $word) (i32.const 16))) (local.get $blue)))
      (local.set $cost (f64.add (f64.add (f64.mul (local.get $dr) (local.get $dr)) (f64.mul (local.get $dg) (local.get $dg))) (f64.mul (local.get $db) (local.get $db))))
      (if (i32.or (f64.lt (local.get $cost) (local.get $bestCost))
        (i32.and (f64.eq (local.get $cost) (local.get $bestCost)) (i32.gt_u (local.get $count) (local.get $bestCount)))) (then
        (local.set $bestCost (local.get $cost)) (local.set $bestCount (local.get $count)) (local.set $best (local.get $word))))
      (local.set $j (i32.add (local.get $j) (i32.const 1)))
      (br_if $choose (i32.lt_u (local.get $j) (local.get $end))))
    (local.set $j (local.get $first))
    (loop $set
      (local.set $index (i32.load (i32.add (local.get $from) (i32.shl (local.get $j) (i32.const 2)))))
      (i32.store (i32.add (local.get $keys) (i32.shl (local.get $index) (i32.const 2))) (local.get $best))
      (local.set $j (i32.add (local.get $j) (i32.const 1)))
      (br_if $set (i32.lt_u (local.get $j) (local.get $end))))
    (local.set $first (local.get $end))
    (br $group))))

;; Remaps a whole band in place, retaining every masked pixel and every alpha byte. A missing source color is a fault.
(func (export "smoothApply") (param $rgba i32) (param $exact i32) (param $n i32) (param $slots i32)
  (param $mask i32) (param $words i32) (param $table i32) (result i32)
  (local $i i32) (local $at i32) (local $word i32) (local $index i32)
  (block $done (loop $pixel
    (br_if $done (i32.ge_u (local.get $i) (local.get $n)))
    (if (i32.eqz (i32.load8_u (i32.add (local.get $exact) (local.get $i)))) (then
      (local.set $at (i32.add (local.get $rgba) (i32.shl (local.get $i) (i32.const 2))))
      (local.set $word (i32.load (local.get $at)))
      (local.set $index (i32.load (call $smoothSlot (i32.and (local.get $word) (i32.const 0xffffff)) (local.get $slots) (local.get $mask) (local.get $words))))
      (if (i32.eqz (local.get $index)) (then (return (i32.const 1))))
      (i32.store (local.get $at) (i32.or (i32.and (local.get $word) (i32.const 0xff000000))
        (i32.load (i32.add (local.get $table) (i32.shl (i32.sub (local.get $index) (i32.const 1)) (i32.const 2))))))))
    (local.set $i (i32.add (local.get $i) (i32.const 1)))
    (br $pixel)))
  (i32.const 0))
