;; SPDX-License-Identifier: MIT
;; The JPEG transcode's WebAssembly kernels (jpeg-kernels.mjs). Each repeats its JavaScript loop's binary64 operations
;; in the same order, so every result is the same bit for bit.
(module
  (memory (export "memory") 32)
  ;; n·log2(n) for n below 65,536 (initTable); 64 symbol counts per cluster; each cluster's bits; one
  ;; context's counts; live clusters; results; merge prices; each cluster's 64 populationBits terms.
  (global $TABLE i32 (i32.const 0))
  (global $ROWS i32 (i32.const 524288))
  (global $BITS i32 (i32.const 589824))
  (global $OWN i32 (i32.const 591872))
  (global $ALIVE i32 (i32.const 592128))
  (global $SCRATCH i32 (i32.const 592384))
  (global $PAIRS i32 (i32.const 593920))
  (global $POPS i32 (i32.const 1118208))
  ;; Per cluster: its total count and the sum of its terms (any order: they only bound); then seeding's per-cluster
  ;; estimates and OWN's nonzero symbols.
  (global $TOTALS i32 (i32.const 1249280))
  (global $SUMS i32 (i32.const 1251328))
  (global $ESTIMATES i32 (i32.const 1253376))
  (global $NONZERO i32 (i32.const 1255424))
  ;; The group writers (ans.mjs ansGroupWriter, entropy.mjs prefixGroupWriter): a group's values and histograms, the
  ;; renormalised words, the model's context map (a histogram per context, up to 8,192), each histogram's tables (12,576
  ;; bytes apart; for ANS counts and starts by token, the reverse alias table, the tables for values below 64, the
  ;; hybrid integer configuration at 10000, and the frequencies' reciprocals for values below 64 at 10016 and by token
  ;; at 10528), and the written bytes.
  (global $VALUES i32 (i32.const 1261568))
  (global $IDS i32 (i32.const 2048000))
  (global $EMITTED i32 (i32.const 2244608))
  (global $CMAP i32 (i32.const 2637824))
  (global $HISTOGRAMS i32 (i32.const 2646016))
  (global $OUT i32 (i32.const 5853184))
  ;; Token fill (vardct.mjs fillACGroup) for one group, inside OUT (its tokens are read before a writer uses OUT):
  ;; parameters, the block context map, each component's coefficient order, the density contexts, the luma buckets,
  ;; each component's nonzero counts, its group-local nonzero counts and its coefficients (windows of the group's
  ;; blocks), and the tokens (16-bit contexts and values).
  (global $FILL i32 (i32.const 5853184))
  (global $FMAP i32 (i32.const 5853440))
  (global $FORDER i32 (i32.const 5863680))
  (global $FDENSITY i32 (i32.const 5864448))
  (global $FBUCKETS i32 (i32.const 5880832))
  (global $FCOUNTS i32 (i32.const 5881856))
  (global $FCOEFFS i32 (i32.const 5897216))
  (global $FCTXS i32 (i32.const 6290432))
  (global $FVALUES i32 (i32.const 6683648))
  (global $FROWS i32 (i32.const 5884928))
  ;; The exactness rewrite's sequential scans (jpeg-reconstruction.mjs writeScan), inside HISTOGRAMS: parameters, each entry's Huffman
  ;; words (dc then ac, 257 each), the zigzag order, up to 65,536 trailing zero runs (block, count), up to 65,536
  ;; padding bits and up to 3,072 blocks of the band's coefficients.
  (global $JSCAN i32 (i32.const 2637824))
  (global $JCODES i32 (i32.const 2638080))
  (global $JZIGZAG i32 (i32.const 2646304))
  (global $JZEROS i32 (i32.const 2646560))
  (global $JPADS i32 (i32.const 3170848))
  (global $JBAND i32 (i32.const 3236384))

  ;; entropy.mjs entropyLog2.
  (func $log2 (param $x f64) (result f64)
    (local $e i32) (local $z f64) (local $z2 f64) (local $term f64) (local $sum f64) (local $k i32)
    (if (i32.and (f64.ge (local.get $x) (f64.const 2)) (f64.lt (local.get $x) (f64.const 4294967296)))
      (then
        (local.set $e (i32.sub (i32.const 31) (i32.clz (i32.trunc_f64_u (local.get $x)))))
        (local.set $x (f64.mul (local.get $x)
          (f64.reinterpret_i64 (i64.shl (i64.extend_i32_u (i32.sub (i32.const 1023) (local.get $e))) (i64.const 52)))))))
    (block $high (loop $halve
      (br_if $high (f64.lt (local.get $x) (f64.const 1.4142135623730951)))
      (local.set $x (f64.div (local.get $x) (f64.const 2)))
      (local.set $e (i32.add (local.get $e) (i32.const 1)))
      (br $halve)))
    (block $low (loop $double
      (br_if $low (f64.ge (local.get $x) (f64.const 0.7071067811865476)))
      (local.set $x (f64.mul (local.get $x) (f64.const 2)))
      (local.set $e (i32.sub (local.get $e) (i32.const 1)))
      (br $double)))
    (local.set $z (f64.div (f64.sub (local.get $x) (f64.const 1)) (f64.add (local.get $x) (f64.const 1))))
    (local.set $z2 (f64.mul (local.get $z) (local.get $z)))
    (local.set $term (local.get $z)) (local.set $sum (local.get $z))
    (local.set $k (i32.const 3))
    (block $series (loop $next
      (br_if $series (i32.ge_s (local.get $k) (i32.const 30)))
      (local.set $term (f64.mul (local.get $term) (local.get $z2)))
      (local.set $sum (f64.add (local.get $sum) (f64.div (local.get $term) (f64.convert_i32_s (local.get $k)))))
      (local.set $k (i32.add (local.get $k) (i32.const 2)))
      (br $next)))
    (f64.add (f64.convert_i32_s (local.get $e)) (f64.mul (local.get $sum) (f64.const 2.885390081777927))))

  ;; entropy.mjs populationBits.
  (func $pop (param $n f64) (result f64)
    (if (result f64) (f64.lt (local.get $n) (f64.const 2)) (then (f64.const 0))
      (else (if (result f64) (f64.lt (local.get $n) (f64.const 65536))
        (then (f64.load (i32.shl (i32.trunc_f64_u (local.get $n)) (i32.const 3))))
        (else (f64.mul (local.get $n) (call $log2 (local.get $n))))))))

;; TABLE: populationBits below 65,536, n * entropyLog2(n) as entropy.mjs computes it.
  (func (export "initTable")
    (local $n i32)
    (f64.store (i32.const 0) (f64.const 0)) (f64.store (i32.const 8) (f64.const 0))
    (local.set $n (i32.const 2))
    (block $done (loop $next
      (br_if $done (i32.eq (local.get $n) (i32.const 65536)))
      (f64.store (i32.shl (local.get $n) (i32.const 3))
        (f64.mul (f64.convert_i32_u (local.get $n)) (call $log2 (f64.convert_i32_u (local.get $n)))))
      (local.set $n (i32.add (local.get $n) (i32.const 1)))
      (br $next))))

    ;; entropy.mjs mergedBits over two rows of 64 counts.
  (func $merged (param $a i32) (param $b i32) (result f64)
    (local $s i32) (local $n f64) (local $total f64) (local $bits f64)
    (block $done (loop $symbol
      (br_if $done (i32.eq (local.get $s) (i32.const 256)))
      (local.set $n (f64.add (f64.convert_i32_u (i32.load (i32.add (local.get $a) (local.get $s))))
        (f64.convert_i32_u (i32.load (i32.add (local.get $b) (local.get $s))))))
      (local.set $total (f64.add (local.get $total) (local.get $n)))
      (local.set $bits (f64.sub (local.get $bits) (call $pop (local.get $n))))
      (local.set $s (i32.add (local.get $s) (i32.const 4)))
      (br $symbol)))
    (f64.add (local.get $bits) (call $pop (local.get $total))))

  (func $row (param $i i32) (result i32) (i32.add (global.get $ROWS) (i32.shl (local.get $i) (i32.const 8))))
  (func $bits (param $i i32) (result f64) (f64.load (i32.add (global.get $BITS) (i32.shl (local.get $i) (i32.const 3)))))

;; Cluster i's populationBits terms, after its row changed.
  (func $terms (export "terms") (param $i i32)
    (local $s i32) (local $row i32) (local $pops i32) (local $count f64) (local $term f64) (local $total f64) (local $sum f64)
    (local.set $row (call $row (local.get $i)))
    (local.set $pops (i32.add (global.get $POPS) (i32.shl (local.get $i) (i32.const 9))))
    (block $done (loop $symbol
      (br_if $done (i32.eq (local.get $s) (i32.const 64)))
      (local.set $count (f64.convert_i32_u (i32.load (i32.add (local.get $row) (i32.shl (local.get $s) (i32.const 2))))))
      (local.set $term (call $pop (local.get $count)))
      (f64.store (i32.add (local.get $pops) (i32.shl (local.get $s) (i32.const 3))) (local.get $term))
      (local.set $total (f64.add (local.get $total) (local.get $count)))
      (local.set $sum (f64.add (local.get $sum) (local.get $term)))
      (local.set $s (i32.add (local.get $s) (i32.const 1)))
      (br $symbol)))
    (f64.store (i32.add (global.get $TOTALS) (i32.shl (local.get $i) (i32.const 3))) (local.get $total))
    (f64.store (i32.add (global.get $SUMS) (i32.shl (local.get $i) (i32.const 3))) (local.get $sum)))

  ;; mergedBits(cluster i, OWN): where OWN's count is 0 the term is the cluster's own, already in POPS.
  (func $mergedOwn (param $i i32) (result f64)
    (local $s i32) (local $a i32) (local $b i32) (local $pops i32) (local $n f64) (local $total f64) (local $bits f64) (local $c i32)
    (local.set $a (call $row (local.get $i)))
    (local.set $pops (i32.add (global.get $POPS) (i32.shl (local.get $i) (i32.const 9))))
    (local.set $b (global.get $OWN))
    (block $done (loop $symbol
      (br_if $done (i32.eq (local.get $s) (i32.const 64)))
      (local.set $c (i32.load (i32.add (local.get $b) (i32.shl (local.get $s) (i32.const 2)))))
      (local.set $n (f64.add (f64.convert_i32_u (i32.load (i32.add (local.get $a) (i32.shl (local.get $s) (i32.const 2)))))
        (f64.convert_i32_u (local.get $c))))
      (local.set $total (f64.add (local.get $total) (local.get $n)))
      (local.set $bits (f64.sub (local.get $bits)
        (if (result f64) (local.get $c) (then (call $pop (local.get $n)))
          (else (f64.load (i32.add (local.get $pops) (i32.shl (local.get $s) (i32.const 3))))))))
      (local.set $s (i32.add (local.get $s) (i32.const 1)))
      (br $symbol)))
    (f64.add (local.get $bits) (call $pop (local.get $total))))

;; Seeding: the first of the k clusters whose merge with OWN adds least, mergedBits - cluster bits - own bits, as the
  ;; JavaScript sums it. An increase needs only OWN's nonzero symbols and the totals; that estimate, within a margin far
  ;; above its rounding, rules out every cluster that cannot be the least, and the rest are summed as in JavaScript. The
  ;; increase goes to SCRATCH; -1 when k is 0.
  (func $seedBest (export "seedBest") (param $k i32) (param $ownBits f64) (result i32)
    (local $i i32) (local $best i32) (local $low f64) (local $increase f64) (local $s i32) (local $m i32) (local $c i32)
    (local $ownTotal f64) (local $row i32) (local $pops i32) (local $merged f64) (local $estimate f64) (local $margin f64)
    (local $bound f64) (local $j i32)
    ;; OWN's nonzero symbols (byte offsets) and total.
    (block $listed (loop $symbol
      (br_if $listed (i32.eq (local.get $s) (i32.const 64)))
      (local.set $c (i32.load (i32.add (global.get $OWN) (i32.shl (local.get $s) (i32.const 2)))))
      (if (local.get $c) (then
        (i32.store (i32.add (global.get $NONZERO) (i32.shl (local.get $m) (i32.const 2))) (local.get $s))
        (local.set $m (i32.add (local.get $m) (i32.const 1)))
        (local.set $ownTotal (f64.add (local.get $ownTotal) (f64.convert_i32_u (local.get $c))))))
      (local.set $s (i32.add (local.get $s) (i32.const 1)))
      (br $symbol)))
    ;; Estimates, and the least upper bound of an exact increase.
    (local.set $bound (f64.const inf))
    (block $estimated (loop $cluster
      (br_if $estimated (i32.eq (local.get $i) (local.get $k)))
      (local.set $row (call $row (local.get $i)))
      (local.set $pops (i32.add (global.get $POPS) (i32.shl (local.get $i) (i32.const 9))))
      (local.set $merged (call $pop (f64.add (f64.load (i32.add (global.get $TOTALS) (i32.shl (local.get $i) (i32.const 3)))) (local.get $ownTotal))))
      (local.set $estimate (f64.sub (local.get $merged) (f64.load (i32.add (global.get $SUMS) (i32.shl (local.get $i) (i32.const 3))))))
      (local.set $j (i32.const 0))
      (block $terms (loop $term
        (br_if $terms (i32.eq (local.get $j) (local.get $m)))
        (local.set $s (i32.load (i32.add (global.get $NONZERO) (i32.shl (local.get $j) (i32.const 2)))))
        (local.set $estimate (f64.sub (local.get $estimate) (f64.sub
          (call $pop (f64.add (f64.convert_i32_u (i32.load (i32.add (local.get $row) (i32.shl (local.get $s) (i32.const 2)))))
            (f64.convert_i32_u (i32.load (i32.add (global.get $OWN) (i32.shl (local.get $s) (i32.const 2)))))))
          (f64.load (i32.add (local.get $pops) (i32.shl (local.get $s) (i32.const 3)))))))
        (local.set $j (i32.add (local.get $j) (i32.const 1)))
        (br $term)))
      (local.set $estimate (f64.sub (f64.sub (local.get $estimate) (call $bits (local.get $i))) (local.get $ownBits)))
      ;; Every term is at most the merged population's; 66 of them round within 66 * 66 * 2^-53 of it.
      (local.set $margin (f64.add (f64.mul (local.get $merged) (f64.const 1e-9)) (f64.const 1e-6)))
      (f64.store (i32.add (global.get $ESTIMATES) (i32.shl (local.get $i) (i32.const 3))) (f64.sub (local.get $estimate) (local.get $margin)))
      (if (f64.lt (f64.add (local.get $estimate) (local.get $margin)) (local.get $bound))
        (then (local.set $bound (f64.add (local.get $estimate) (local.get $margin)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $cluster)))
    ;; The candidates in order, summed as in JavaScript.
    (local.set $best (i32.const -1)) (local.set $low (f64.const inf)) (local.set $i (i32.const 0))
    (block $done (loop $candidate
      (br_if $done (i32.eq (local.get $i) (local.get $k)))
      (if (f64.le (f64.load (i32.add (global.get $ESTIMATES) (i32.shl (local.get $i) (i32.const 3)))) (local.get $bound)) (then
        (local.set $increase (f64.sub (f64.sub (call $mergedOwn (local.get $i)) (call $bits (local.get $i))) (local.get $ownBits)))
        (if (f64.lt (local.get $increase) (local.get $low)) (then (local.set $low (local.get $increase)) (local.set $best (local.get $i))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $candidate)))
    (f64.store (global.get $SCRATCH) (local.get $low))
    (local.get $best))

  ;; refineClusters' price(a, b): mergedBits - a's bits - b's bits.
  (func $price (param $a i32) (param $b i32) (result f64)
    (f64.sub (f64.sub (call $merged (call $row (local.get $a)) (call $row (local.get $b))) (call $bits (local.get $a)))
      (call $bits (local.get $b))))
  (func $pair (param $length i32) (param $a i32) (param $b i32) (result i32)
    (i32.add (global.get $PAIRS) (i32.shl (i32.add (i32.mul (local.get $a) (local.get $length)) (local.get $b)) (i32.const 3))))

  ;; Every pair's price, a below b.
  (func (export "pairsInit") (param $length i32)
    (local $a i32) (local $b i32)
    (block $outer (loop $first
      (br_if $outer (i32.eq (local.get $a) (local.get $length)))
      (local.set $b (i32.add (local.get $a) (i32.const 1)))
      (block $inner (loop $second
        (br_if $inner (i32.ge_s (local.get $b) (local.get $length)))
        (f64.store (call $pair (local.get $length) (local.get $a) (local.get $b)) (call $price (local.get $a) (local.get $b)))
        (local.set $b (i32.add (local.get $b) (i32.const 1)))
        (br $second)))
      (local.set $a (i32.add (local.get $a) (i32.const 1)))
      (br $first))))

  ;; After a merge into left: each live cluster's price with it, price(i, left), stored at the pair (min, max).
  (func (export "pairsUpdate") (param $length i32) (param $left i32)
    (local $i i32)
    (block $done (loop $cluster
      (br_if $done (i32.eq (local.get $i) (local.get $length)))
      (if (i32.and (i32.load8_u (i32.add (global.get $ALIVE) (local.get $i))) (i32.ne (local.get $i) (local.get $left)))
        (then (f64.store
          (if (result i32) (i32.lt_s (local.get $i) (local.get $left))
            (then (call $pair (local.get $length) (local.get $i) (local.get $left)))
            (else (call $pair (local.get $length) (local.get $left) (local.get $i))))
          (call $price (local.get $i) (local.get $left)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $cluster))))

  ;; The cheapest live pair, the first on a tie: returns left (-1 when none) with right and the price in SCRATCH.
  (func (export "pairMin") (param $length i32) (result i32)
    (local $a i32) (local $b i32) (local $left i32) (local $right i32) (local $best f64) (local $p f64)
    (local.set $left (i32.const -1)) (local.set $right (i32.const -1)) (local.set $best (f64.const inf))
    (block $outer (loop $first
      (br_if $outer (i32.eq (local.get $a) (local.get $length)))
      (if (i32.load8_u (i32.add (global.get $ALIVE) (local.get $a))) (then
        (local.set $b (i32.add (local.get $a) (i32.const 1)))
        (block $inner (loop $second
          (br_if $inner (i32.ge_s (local.get $b) (local.get $length)))
          (if (i32.load8_u (i32.add (global.get $ALIVE) (local.get $b))) (then
            (local.set $p (f64.load (call $pair (local.get $length) (local.get $a) (local.get $b))))
            (if (f64.lt (local.get $p) (local.get $best)) (then
              (local.set $left (local.get $a)) (local.set $right (local.get $b)) (local.set $best (local.get $p))))))
          (local.set $b (i32.add (local.get $b) (i32.const 1)))
          (br $second)))))
      (local.set $a (i32.add (local.get $a) (i32.const 1)))
      (br $first)))
    (i32.store (global.get $SCRATCH) (local.get $right))
    (f64.store (i32.add (global.get $SCRATCH) (i32.const 8)) (local.get $best))
    (local.get $left))

  ;; One reassignment pass in map order (refineClusters with a switch cost): n contexts, each a run of (symbol, count)
  ;; pairs from offsets[t] to offsets[t + 1] in sparse; k cost tables of 64; back[t * k + i] receives each choice.
  ;; Returns the histogram the last context ends in.
  (func (export "assign") (param $n i32) (param $k i32) (param $switch f64) (param $offsets i32) (param $sparse i32)
      (param $tables i32) (param $back i32) (param $best i32) (param $next i32) (result i32)
    (local $t i32) (local $i i32) (local $j i32) (local $end i32) (local $low f64) (local $lowAt i32) (local $cost f64)
    (local $table i32) (local $stay f64) (local $change f64) (local $swap i32) (local $at i32)
    (block $contexts (loop $context
      (br_if $contexts (i32.eq (local.get $t) (local.get $n)))
      (local.set $low (f64.const inf)) (local.set $lowAt (i32.const 0)) (local.set $i (i32.const 0))
      (block $scanned (loop $scan
        (br_if $scanned (i32.eq (local.get $i) (local.get $k)))
        (if (f64.lt (f64.load (i32.add (local.get $best) (i32.shl (local.get $i) (i32.const 3)))) (local.get $low)) (then
          (local.set $low (f64.load (i32.add (local.get $best) (i32.shl (local.get $i) (i32.const 3))))) (local.set $lowAt (local.get $i))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $scan)))
      (local.set $end (i32.load (i32.add (local.get $offsets) (i32.shl (i32.add (local.get $t) (i32.const 1)) (i32.const 2)))))
      (local.set $i (i32.const 0))
      (block $histograms (loop $histogram
        (br_if $histograms (i32.eq (local.get $i) (local.get $k)))
        (local.set $table (i32.add (local.get $tables) (i32.shl (local.get $i) (i32.const 9))))
        (local.set $cost (f64.const 0))
        (local.set $j (i32.load (i32.add (local.get $offsets) (i32.shl (local.get $t) (i32.const 2)))))
        (block $terms (loop $term
          (br_if $terms (i32.ge_s (local.get $j) (local.get $end)))
          (local.set $cost (f64.add (local.get $cost)
            (f64.mul (f64.convert_i32_u (i32.load (i32.add (local.get $sparse) (i32.shl (i32.add (local.get $j) (i32.const 1)) (i32.const 2)))))
              (f64.load (i32.add (local.get $table) (i32.shl (i32.load (i32.add (local.get $sparse) (i32.shl (local.get $j) (i32.const 2)))) (i32.const 3)))))))
          (local.set $j (i32.add (local.get $j) (i32.const 2)))
          (br $term)))
        (if (local.get $t)
          (then (local.set $stay (f64.load (i32.add (local.get $best) (i32.shl (local.get $i) (i32.const 3)))))
            (local.set $change (f64.add (local.get $low) (local.get $switch))))
          (else (local.set $stay (f64.const 0)) (local.set $change (f64.const 0))))
        (if (f64.le (local.get $stay) (local.get $change))
          (then (f64.store (i32.add (local.get $next) (i32.shl (local.get $i) (i32.const 3))) (f64.add (local.get $cost) (local.get $stay)))
            (i32.store16 (i32.add (local.get $back) (i32.shl (i32.add (i32.mul (local.get $t) (local.get $k)) (local.get $i)) (i32.const 1))) (local.get $i)))
          (else (f64.store (i32.add (local.get $next) (i32.shl (local.get $i) (i32.const 3))) (f64.add (local.get $cost) (local.get $change)))
            (i32.store16 (i32.add (local.get $back) (i32.shl (i32.add (i32.mul (local.get $t) (local.get $k)) (local.get $i)) (i32.const 1))) (local.get $lowAt))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $histogram)))
      (local.set $swap (local.get $best)) (local.set $best (local.get $next)) (local.set $next (local.get $swap))
      (local.set $t (i32.add (local.get $t) (i32.const 1)))
      (br $context)))
    (local.set $i (i32.const 1))
    (block $found (loop $least
      (br_if $found (i32.ge_s (local.get $i) (local.get $k)))
      (if (f64.lt (f64.load (i32.add (local.get $best) (i32.shl (local.get $i) (i32.const 3))))
          (f64.load (i32.add (local.get $best) (i32.shl (local.get $at) (i32.const 3)))))
        (then (local.set $at (local.get $i))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $least)))
    (local.get $at))

  ;; Bits, least significant first, from OUT: an accumulator and its count.
  (global $acc (mut i64) (i64.const 0))
  (global $count (mut i32) (i32.const 0))
  (global $at (mut i32) (i32.const 0))
  (func $put (param $n i32) (param $value i32)
    (global.set $acc (i64.or (global.get $acc) (i64.shl (i64.extend_i32_u (local.get $value)) (i64.extend_i32_u (global.get $count)))))
    (global.set $count (i32.add (global.get $count) (local.get $n)))
    (if (i32.ge_u (global.get $count) (i32.const 32)) (then
      (i32.store (global.get $at) (i32.wrap_i64 (global.get $acc)))
      (global.set $at (i32.add (global.get $at) (i32.const 4)))
      (global.set $acc (i64.shr_u (global.get $acc) (i64.const 32)))
      (global.set $count (i32.sub (global.get $count) (i32.const 32))))))

  ;; One group's n tokens, last to first then first to last, as ansGroupWriter's flush writes them after `pending` bits
  ;; (`acc`). Returns the whole bytes written at OUT; the bits left over go to SCRATCH (value, then count).
  (func (export "ansFlush") (param $n i32) (param $acc i32) (param $pending i32) (result i32)
    (local $i i32) (local $id i32) (local $value i32) (local $table i32) (local $at i32) (local $entry i32) (local $bits i32)
    (local $raw i32) (local $freq i32) (local $start i32) (local $state i32) (local $q i32) (local $token i32) (local $flag i32) (local $recip i32)
    (local $wacc i64) (local $wcount i32) (local $wat i32)
    (local.set $state (i32.const 1245184))
    (local.set $i (local.get $n))
    (block $reversed (loop $back
      (br_if $reversed (i32.eqz (local.get $i)))
      (local.set $i (i32.sub (local.get $i) (i32.const 1)))
      (local.set $id (i32.load8_u (i32.add (global.get $IDS) (local.get $i))))
      (local.set $value (i32.load (i32.add (global.get $VALUES) (i32.shl (local.get $i) (i32.const 2)))))
      (local.set $table (i32.add (global.get $HISTOGRAMS) (i32.mul (local.get $id) (i32.const 12576))))
      (if (i32.lt_u (local.get $value) (i32.const 64))
        (then
          (local.set $at (i32.add (i32.add (local.get $table) (i32.const 9232)) (i32.shl (local.get $value) (i32.const 2))))
          (local.set $entry (i32.load (local.get $at)))
          (local.set $bits (i32.shr_u (local.get $entry) (i32.const 6)))
          (local.set $raw (i32.and (local.get $entry) (i32.const 63)))
          (local.set $freq (i32.load (i32.add (local.get $at) (i32.const 256))))
          (local.set $start (i32.load (i32.add (local.get $at) (i32.const 512))))
          (local.set $recip (i32.add (i32.add (local.get $table) (i32.const 10016)) (i32.shl (local.get $value) (i32.const 3)))))
        (else
          (local.set $token (call $hybrid (local.get $value) (local.get $table)))
          (local.set $bits (global.get $hbits)) (local.set $raw (global.get $hraw))
          (local.set $freq (i32.load16_u (i32.add (local.get $table) (i32.shl (local.get $token) (i32.const 1)))))
          (local.set $start (i32.load16_u (i32.add (i32.add (local.get $table) (i32.const 512)) (i32.shl (local.get $token) (i32.const 1)))))
          (local.set $recip (i32.add (i32.add (local.get $table) (i32.const 10528)) (i32.shl (local.get $token) (i32.const 3))))))
      (i32.store (i32.add (global.get $VALUES) (i32.shl (local.get $i) (i32.const 2))) (local.get $raw))
      (local.set $flag (i32.const 0))
      (if (i32.ge_u (i32.shr_u (local.get $state) (i32.const 20)) (local.get $freq)) (then
        (i32.store16 (i32.add (global.get $EMITTED) (i32.shl (local.get $i) (i32.const 1))) (local.get $state))
        (local.set $flag (i32.const 64))
        (local.set $state (i32.shr_u (local.get $state) (i32.const 16)))))
      (i32.store8 (i32.add (global.get $IDS) (local.get $i)) (i32.or (local.get $bits) (local.get $flag)))
      ;; state / freq by the frequency's reciprocal (recips): exact for a state below 2^32 and a frequency up to 4096.
      (local.set $q (i32.wrap_i64 (i64.shr_u (i64.mul (i64.extend_i32_u (local.get $state)) (i64.load (local.get $recip))) (i64.const 44))))
      (local.set $state (i32.add (i32.shl (local.get $q) (i32.const 12))
        (i32.load16_u (i32.add (i32.add (local.get $table) (i32.const 1040))
          (i32.shl (i32.sub (i32.add (local.get $start) (local.get $state)) (i32.mul (local.get $q) (local.get $freq))) (i32.const 1))))))
      (br $back)))
    ;; $put with the accumulator in locals: the state, then each token's word and raw bits.
    (local.set $wacc (i64.or (i64.extend_i32_u (local.get $acc)) (i64.shl (i64.extend_i32_u (local.get $state)) (i64.extend_i32_u (local.get $pending)))))
    (local.set $wcount (i32.add (local.get $pending) (i32.const 32)))
    (local.set $wat (global.get $OUT))
    (if (i32.ge_u (local.get $wcount) (i32.const 32)) (then
      (i32.store (local.get $wat) (i32.wrap_i64 (local.get $wacc)))
      (local.set $wat (i32.add (local.get $wat) (i32.const 4)))
      (local.set $wacc (i64.shr_u (local.get $wacc) (i64.const 32)))
      (local.set $wcount (i32.sub (local.get $wcount) (i32.const 32)))))
    (block $written (loop $forward
      (br_if $written (i32.eq (local.get $i) (local.get $n)))
      (local.set $entry (i32.load8_u (i32.add (global.get $IDS) (local.get $i))))
      (local.set $bits (i32.and (local.get $entry) (i32.const 63)))
      (if (i32.and (local.get $entry) (i32.const 64)) (then
        (local.set $wacc (i64.or (local.get $wacc) (i64.shl
          (i64.extend_i32_u (i32.load16_u (i32.add (global.get $EMITTED) (i32.shl (local.get $i) (i32.const 1))))) (i64.extend_i32_u (local.get $wcount)))))
        (local.set $wcount (i32.add (local.get $wcount) (i32.const 16)))
        (if (i32.ge_u (local.get $wcount) (i32.const 32)) (then
          (i32.store (local.get $wat) (i32.wrap_i64 (local.get $wacc)))
          (local.set $wat (i32.add (local.get $wat) (i32.const 4)))
          (local.set $wacc (i64.shr_u (local.get $wacc) (i64.const 32)))
          (local.set $wcount (i32.sub (local.get $wcount) (i32.const 32)))))))
      (if (local.get $bits) (then
        (local.set $wacc (i64.or (local.get $wacc) (i64.shl
          (i64.extend_i32_u (i32.load (i32.add (global.get $VALUES) (i32.shl (local.get $i) (i32.const 2))))) (i64.extend_i32_u (local.get $wcount)))))
        (local.set $wcount (i32.add (local.get $wcount) (local.get $bits)))))
      (if (i32.ge_u (local.get $wcount) (i32.const 32)) (then
        (i32.store (local.get $wat) (i32.wrap_i64 (local.get $wacc)))
        (local.set $wat (i32.add (local.get $wat) (i32.const 4)))
        (local.set $wacc (i64.shr_u (local.get $wacc) (i64.const 32)))
        (local.set $wcount (i32.sub (local.get $wcount) (i32.const 32)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $forward)))
    (global.set $acc (local.get $wacc)) (global.set $count (local.get $wcount)) (global.set $at (local.get $wat))
    (call $tail))

  ;; prefix.mjs hybridToken with the configuration at table + 10000: returns the token, its raw bits and count in
  ;; $hraw and $hbits.
  (global $hbits (mut i32) (i32.const 0))
  (global $hraw (mut i32) (i32.const 0))
  (func $hybrid (param $value i32) (param $table i32) (result i32)
    (local $split i32) (local $msb i32) (local $lsb i32) (local $e i32) (local $below i32)
    (local.set $split (i32.load (i32.add (local.get $table) (i32.const 10000))))
    (local.set $msb (i32.load (i32.add (local.get $table) (i32.const 10004))))
    (local.set $lsb (i32.load (i32.add (local.get $table) (i32.const 10008))))
    (if (i32.lt_u (local.get $value) (i32.shl (i32.const 1) (local.get $split))) (then
      (global.set $hbits (i32.const 0)) (global.set $hraw (i32.const 0))
      (return (local.get $value))))
    (local.set $e (i32.sub (i32.const 31) (i32.clz (local.get $value))))
    (local.set $below (i32.sub (local.get $value) (i32.shl (i32.const 1) (local.get $e))))
    (global.set $hbits (i32.sub (i32.sub (local.get $e) (local.get $msb)) (local.get $lsb)))
    (global.set $hraw (i32.and (i32.shr_u (local.get $value) (local.get $lsb))
      (i32.sub (i32.shl (i32.const 1) (global.get $hbits)) (i32.const 1))))
    (i32.add (i32.shl (i32.const 1) (local.get $split))
      (i32.or (i32.or
        (i32.shl (i32.sub (local.get $e) (local.get $split)) (i32.add (local.get $msb) (local.get $lsb)))
        (i32.shl (i32.shr_u (local.get $below) (i32.sub (local.get $e) (local.get $msb))) (local.get $lsb)))
        (i32.and (local.get $below) (i32.sub (i32.shl (i32.const 1) (local.get $lsb)) (i32.const 1))))))

  ;; Whole bytes out, under 8 bits left in SCRATCH (value, then count); returns the bytes at OUT.
  (func $tail (result i32)
    (block $bytes (loop $byte
      (br_if $bytes (i32.lt_u (global.get $count) (i32.const 8)))
      (i32.store8 (global.get $at) (i32.wrap_i64 (global.get $acc)))
      (global.set $at (i32.add (global.get $at) (i32.const 1)))
      (global.set $acc (i64.shr_u (global.get $acc) (i64.const 8)))
      (global.set $count (i32.sub (global.get $count) (i32.const 8)))
      (br $byte)))
    (i32.store (global.get $SCRATCH) (i32.wrap_i64 (global.get $acc)))
    (i32.store (i32.add (global.get $SCRATCH) (i32.const 4)) (global.get $count))
    (i32.sub (global.get $at) (global.get $OUT)))

  ;; fillACGroup over one group's windows: FILL holds bw, bh, numCtxs, numDc, bucketed, counted, grey, each component's
  ;; horizontal and vertical shift (by component 0, 1, 2), the bucket window's width and each component's window width.
  ;; Component c's blocks are at FCOEFFS + c * 131072, its counts at FCOUNTS + c * 1024. Returns the token count.
  (func (export "fill") (result i32)
    (local $bw i32) (local $bh i32) (local $numCtxs i32) (local $numDc i32) (local $bucketed i32) (local $counted i32)
    (local $grey i32) (local $by i32) (local $bx i32) (local $i i32) (local $c i32) (local $hs i32) (local $vs i32)
    (local $sbx i32) (local $sby i32) (local $width i32) (local $block i32) (local $coeffs i32) (local $count i32)
    (local $k i32) (local $row i32) (local $predicted i32) (local $bucket i32) (local $blockCtx i32)
    (local $capped i32) (local $n i32) (local $offset i32) (local $order i32) (local $prev i32) (local $left i32)
    (local $coeff i32) (local $zeroBase i32) (local $has i32)
    (local.set $bw (i32.load (global.get $FILL))) (local.set $bh (i32.load offset=4 (global.get $FILL)))
    (local.set $numCtxs (i32.load offset=8 (global.get $FILL))) (local.set $numDc (i32.load offset=12 (global.get $FILL)))
    (local.set $bucketed (i32.load offset=16 (global.get $FILL))) (local.set $counted (i32.load offset=20 (global.get $FILL)))
    (local.set $grey (i32.load offset=24 (global.get $FILL)))
    ;; NONZERO_BUCKETS 37.
    (local.set $zeroBase (i32.mul (local.get $numCtxs) (i32.const 37)))
    (block $rows (loop $byLoop
      (br_if $rows (i32.eq (local.get $by) (local.get $bh)))
      (local.set $bx (i32.const 0))
      (block $cols (loop $bxLoop
        (br_if $cols (i32.eq (local.get $bx) (local.get $bw)))
        (local.set $i (i32.const 0))
        (block $comps (loop $iLoop
          (br_if $comps (i32.eq (local.get $i) (i32.const 3)))
          (local.set $c (select (i32.const 1) (select (i32.const 0) (i32.const 2) (i32.eq (local.get $i) (i32.const 1))) (i32.eqz (local.get $i))))
          (local.set $hs (i32.load (i32.add (i32.add (global.get $FILL) (i32.const 28)) (i32.shl (local.get $c) (i32.const 2)))))
          (local.set $vs (i32.load (i32.add (i32.add (global.get $FILL) (i32.const 40)) (i32.shl (local.get $c) (i32.const 2)))))
          (local.set $sbx (i32.shr_u (local.get $bx) (local.get $hs)))
          (local.set $sby (i32.shr_u (local.get $by) (local.get $vs)))
          (if (i32.and (i32.eq (i32.shl (local.get $sbx) (local.get $hs)) (local.get $bx)) (i32.eq (i32.shl (local.get $sby) (local.get $vs)) (local.get $by))) (then
            (local.set $width (i32.load (i32.add (i32.add (global.get $FILL) (i32.const 56)) (i32.shl (local.get $c) (i32.const 2)))))
            (local.set $block (i32.add (i32.mul (local.get $sby) (local.get $width)) (local.get $sbx)))
            (local.set $has (i32.eqz (i32.and (local.get $grey) (i32.ne (local.get $c) (i32.const 1)))))
            (local.set $coeffs (i32.add (i32.add (global.get $FCOEFFS) (i32.mul (local.get $c) (i32.const 131072))) (i32.shl (local.get $block) (i32.const 7))))
            (local.set $count (i32.const 0))
            (if (local.get $has) (then
              (if (local.get $counted)
                (then (local.set $count (i32.load8_u (i32.add (i32.add (global.get $FCOUNTS) (i32.mul (local.get $c) (i32.const 1024))) (local.get $block)))))
                (else
                  (local.set $k (i32.const 1))
                  (block $counting (loop $kLoop
                    (br_if $counting (i32.eq (local.get $k) (i32.const 64)))
                    (local.set $count (i32.add (local.get $count) (i32.ne (i32.load16_s (i32.add (local.get $coeffs) (i32.shl (local.get $k) (i32.const 1)))) (i32.const 0))))
                    (local.set $k (i32.add (local.get $k) (i32.const 1)))
                    (br $kLoop)))
                  (i32.store8 (i32.add (i32.add (global.get $FCOUNTS) (i32.mul (local.get $c) (i32.const 1024))) (local.get $block)) (local.get $count))))))
            ;; The predicted nonzero count, from the group-local counts left and above (FROWS + c * 4096).
            (local.set $row (i32.add (global.get $FROWS) (i32.shl (local.get $c) (i32.const 12))))
            (local.set $predicted
              (if (result i32) (i32.eqz (local.get $sbx))
                (then (if (result i32) (i32.eqz (local.get $sby)) (then (i32.const 32))
                  (else (i32.load (i32.add (local.get $row) (i32.shl (i32.mul (i32.sub (local.get $sby) (i32.const 1)) (i32.const 32)) (i32.const 2)))))))
                (else (if (result i32) (i32.eqz (local.get $sby))
                  (then (i32.load (i32.add (local.get $row) (i32.shl (i32.sub (local.get $sbx) (i32.const 1)) (i32.const 2)))))
                  (else (i32.shr_s (i32.add (i32.add
                    (i32.load (i32.add (local.get $row) (i32.shl (i32.add (i32.mul (i32.sub (local.get $sby) (i32.const 1)) (i32.const 32)) (local.get $sbx)) (i32.const 2))))
                    (i32.load (i32.add (local.get $row) (i32.shl (i32.add (i32.mul (local.get $sby) (i32.const 32)) (i32.sub (local.get $sbx) (i32.const 1))) (i32.const 2)))))
                    (i32.const 1)) (i32.const 1)))))))
            (i32.store (i32.add (local.get $row) (i32.shl (i32.add (i32.mul (local.get $sby) (i32.const 32)) (local.get $sbx)) (i32.const 2))) (local.get $count))
            (local.set $bucket (i32.const 0))
            (if (local.get $bucketed) (then
              (local.set $bucket (i32.load8_u (i32.add (global.get $FBUCKETS)
                (i32.add (i32.mul (i32.shr_u (local.get $by) (i32.load offset=44 (global.get $FILL))) (i32.load offset=52 (global.get $FILL)))
                  (i32.shr_u (local.get $bx) (i32.load offset=32 (global.get $FILL)))))))))
            ;; ORDERS 13; ZERO_DENSITY_CONTEXTS 458.
            (local.set $blockCtx (i32.load (i32.add (global.get $FMAP) (i32.shl
              (i32.add (i32.mul (i32.mul (select (i32.xor (local.get $c) (i32.const 1)) (i32.const 2) (i32.lt_u (local.get $c) (i32.const 2))) (i32.const 13)) (local.get $numDc)) (local.get $bucket))
              (i32.const 2)))))
            (local.set $capped (select (local.get $predicted) (i32.const 64) (i32.lt_s (local.get $predicted) (i32.const 64))))
            (i32.store16 (i32.add (global.get $FCTXS) (i32.shl (local.get $n) (i32.const 1)))
              (i32.add (i32.mul (select (local.get $capped) (i32.add (i32.const 4) (i32.shr_s (local.get $capped) (i32.const 1))) (i32.lt_s (local.get $capped) (i32.const 8))) (local.get $numCtxs)) (local.get $blockCtx)))
            (i32.store16 (i32.add (global.get $FVALUES) (i32.shl (local.get $n) (i32.const 1))) (local.get $count))
            (local.set $n (i32.add (local.get $n) (i32.const 1)))
            (local.set $offset (i32.add (local.get $zeroBase) (i32.mul (i32.const 458) (local.get $blockCtx))))
            (local.set $order (i32.add (global.get $FORDER) (i32.shl (local.get $c) (i32.const 8))))
            (local.set $prev (select (i32.const 0) (i32.const 1) (i32.gt_s (local.get $count) (i32.const 4))))
            (local.set $left (local.get $count))
            (local.set $k (i32.const 1))
            (block $coefficients (loop $coefficient
              (br_if $coefficients (i32.or (i32.eq (local.get $k) (i32.const 64)) (i32.eqz (local.get $left))))
              (local.set $coeff (i32.load16_s (i32.add (local.get $coeffs) (i32.shl (i32.load (i32.add (local.get $order) (i32.shl (local.get $k) (i32.const 2)))) (i32.const 1)))))
              (i32.store16 (i32.add (global.get $FCTXS) (i32.shl (local.get $n) (i32.const 1)))
                (i32.add (i32.add (local.get $offset) (i32.load (i32.add (global.get $FDENSITY) (i32.shl (i32.or (i32.shl (local.get $left) (i32.const 6)) (local.get $k)) (i32.const 2))))) (local.get $prev)))
              (i32.store16 (i32.add (global.get $FVALUES) (i32.shl (local.get $n) (i32.const 1)))
                (select (i32.shl (local.get $coeff) (i32.const 1)) (i32.sub (i32.mul (i32.sub (i32.const 0) (local.get $coeff)) (i32.const 2)) (i32.const 1)) (i32.ge_s (local.get $coeff) (i32.const 0))))
              (local.set $n (i32.add (local.get $n) (i32.const 1)))
              (local.set $prev (i32.ne (local.get $coeff) (i32.const 0)))
              (local.set $left (i32.sub (local.get $left) (local.get $prev)))
              (local.set $k (i32.add (local.get $k) (i32.const 1)))
              (br $coefficient)))))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $iLoop)))
        (local.set $bx (i32.add (local.get $bx) (i32.const 1)))
        (br $bxLoop)))
      (local.set $by (i32.add (local.get $by) (i32.const 1)))
      (br $byLoop)))
    (local.get $n))

  ;; JPEG output (JPEGOutput.put): most significant bit first, 0xFF stuffed with 0x00.
  (global $jacc (mut i64) (i64.const 0))
  (global $jpending (mut i32) (i32.const 0))
  (func $jput (param $n i32) (param $value i32)
    (local $byte i32)
    (global.set $jacc (i64.or (i64.shl (global.get $jacc) (i64.extend_i32_u (local.get $n))) (i64.extend_i32_u (local.get $value))))
    (global.set $jpending (i32.add (global.get $jpending) (local.get $n)))
    (block $done (loop $bytes
      (br_if $done (i32.lt_u (global.get $jpending) (i32.const 8)))
      (global.set $jpending (i32.sub (global.get $jpending) (i32.const 8)))
      (local.set $byte (i32.and (i32.wrap_i64 (i64.shr_u (global.get $jacc) (i64.extend_i32_u (global.get $jpending)))) (i32.const 255)))
      (i32.store8 (global.get $at) (local.get $byte))
      (global.set $at (i32.add (global.get $at) (i32.const 1)))
      (if (i32.eq (local.get $byte) (i32.const 255)) (then
        (i32.store8 (global.get $at) (i32.const 0))
        (global.set $at (i32.add (global.get $at) (i32.const 1)))))
      (br $bytes)))
    (global.set $jacc (i64.and (global.get $jacc) (i64.sub (i64.shl (i64.const 1) (i64.extend_i32_u (global.get $jpending))) (i64.const 1)))))
  (func $category (param $v i32) (result i32)
    (if (result i32) (local.get $v)
      (then (i32.sub (i32.const 32) (i32.clz (select (local.get $v) (i32.sub (i32.const 0) (local.get $v)) (i32.ge_s (local.get $v) (i32.const 0))))))
      (else (i32.const 0))))
  ;; A word (length << 16 | code), then n bits of v in JPEG's one's complement for negatives.
  ;; The code and the bits in one put (at most 16 + 15 bits).
  (func $jcoded (param $word i32) (param $n i32) (param $v i32)
    (call $jput (i32.add (i32.shr_u (local.get $word) (i32.const 16)) (local.get $n))
      (i32.or (i32.shl (i32.and (local.get $word) (i32.const 65535)) (local.get $n))
        (if (result i32) (local.get $n)
          (then (select (i32.sub (i32.add (local.get $v) (i32.shl (i32.const 1) (local.get $n))) (i32.const 1)) (local.get $v)
            (i32.lt_s (local.get $v) (i32.const 0))))
          (else (i32.const 0))))))

  ;; Scan state across bands: the DC predictors (JSCAN + 192, four), the block index, the MCU index, the next zero
  ;; run and the next padding bit.
  (global $jblock (mut i32) (i32.const 0))
  (global $jmcu (mut i32) (i32.const 0))
  (global $jzero (mut i32) (i32.const 0))
  (global $jpad (mut i32) (i32.const 0))

  ;; Starts a sequential scan: the output bits and predictors cleared, the padding bits read from `pad`.
  (func (export "scanStart") (param $pad i32)
    (global.set $jacc (i64.const 0)) (global.set $jpending (i32.const 0)) (global.set $jpad (local.get $pad))
    (global.set $jblock (i32.const 0)) (global.set $jmcu (i32.const 0)) (global.set $jzero (i32.const 0))
    (i64.store (i32.add (global.get $JSCAN) (i32.const 192)) (i64.const 0))
    (i64.store (i32.add (global.get $JSCAN) (i32.const 200)) (i64.const 0)))

  ;; JPEGOutput.align: the pending bits to a byte boundary, from the padding bits when the file has them (JSCAN + 16
  ;; count, at JPADS one byte per bit), else ones. 0 when the padding bits run out or one is not 0 or 1.
  (func $jalign (result i32)
    (local $n i32) (local $pattern i32) (local $i i32) (local $bit i32)
    (local.set $n (i32.and (i32.sub (i32.const 0) (global.get $jpending)) (i32.const 7)))
    (if (i32.eqz (local.get $n)) (then (return (i32.const 1))))
    (if (i32.lt_s (i32.load offset=16 (global.get $JSCAN)) (i32.const 0)) (then
      (call $jput (local.get $n) (i32.sub (i32.shl (i32.const 1) (local.get $n)) (i32.const 1)))
      (return (i32.const 1))))
    (block $done (loop $bits
      (br_if $done (i32.eq (local.get $i) (local.get $n)))
      (if (i32.ge_u (global.get $jpad) (i32.load offset=16 (global.get $JSCAN))) (then (return (i32.const 0))))
      (local.set $bit (i32.load8_u (i32.add (global.get $JPADS) (global.get $jpad))))
      (if (i32.gt_u (local.get $bit) (i32.const 1)) (then (return (i32.const 0))))
      (local.set $pattern (i32.add (i32.shl (local.get $pattern) (i32.const 1)) (local.get $bit)))
      (global.set $jpad (i32.add (global.get $jpad) (i32.const 1)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $bits)))
    (call $jput (local.get $n) (local.get $pattern))
    (i32.const 1))

  ;; One band of MCU rows of a sequential scan (ScanWriter.sequential and writeScan's restarts). JSCAN: entries, nx,
  ;; rows, restart interval, padding count (-1: none), zero runs at +24; then per entry (from JSCAN + 32, 32 bytes each)
  ;; h, v, stride, the byte offset of the band's first block row and the predictor index. Returns the bytes written at
  ;; OUT, or -1 where writeScan rejects the data; the next padding bit goes to JSCAN + 28, the pending output bits to
  ;; JSCAN + 224 (value) and + 228 (count).
  (func (export "scanBand") (result i32)
    (local $entries i32) (local $nx i32) (local $rows i32) (local $restart i32) (local $zeros i32) (local $y i32) (local $x i32)
    (local $e i32) (local $entry i32) (local $h i32) (local $v i32) (local $stride i32) (local $base i32) (local $dy i32) (local $dx i32)
    (local $at i32) (local $dc i32) (local $ac i32) (local $pred i32) (local $current i32) (local $diff i32) (local $n i32) (local $word i32)
    (local $run i32) (local $k i32) (local $c i32) (local $extra i32) (local $i i32)
    (local.set $entries (i32.load (global.get $JSCAN))) (local.set $nx (i32.load offset=4 (global.get $JSCAN)))
    (local.set $rows (i32.load offset=8 (global.get $JSCAN))) (local.set $restart (i32.load offset=12 (global.get $JSCAN)))
    (local.set $zeros (i32.load offset=24 (global.get $JSCAN)))
    (global.set $at (global.get $OUT))
    (block $fail
    (block $bandDone (loop $yLoop
      (br_if $bandDone (i32.eq (local.get $y) (local.get $rows)))
      (local.set $x (i32.const 0))
      (block $rowDone (loop $xLoop
        (br_if $rowDone (i32.eq (local.get $x) (local.get $nx)))
        (if (i32.and (i32.ne (local.get $restart) (i32.const 0)) (i32.ne (global.get $jmcu) (i32.const 0))) (then
          (if (i32.eqz (i32.rem_u (global.get $jmcu) (local.get $restart))) (then
            (br_if $fail (i32.eqz (call $jalign)))
            (i32.store8 (global.get $at) (i32.const 255))
            (i32.store8 offset=1 (global.get $at) (i32.add (i32.const 208) (i32.and (i32.sub (i32.div_u (global.get $jmcu) (local.get $restart)) (i32.const 1)) (i32.const 7))))
            (global.set $at (i32.add (global.get $at) (i32.const 2)))
            (i64.store (i32.add (global.get $JSCAN) (i32.const 192)) (i64.const 0))
            (i64.store (i32.add (global.get $JSCAN) (i32.const 200)) (i64.const 0))))))
        (local.set $e (i32.const 0))
        (block $entriesDone (loop $eLoop
          (br_if $entriesDone (i32.eq (local.get $e) (local.get $entries)))
          (local.set $entry (i32.add (i32.add (global.get $JSCAN) (i32.const 32)) (i32.shl (local.get $e) (i32.const 5))))
          (local.set $h (i32.load (local.get $entry))) (local.set $v (i32.load offset=4 (local.get $entry)))
          (local.set $stride (i32.load offset=8 (local.get $entry))) (local.set $base (i32.load offset=12 (local.get $entry)))
          (local.set $pred (i32.add (i32.add (global.get $JSCAN) (i32.const 192)) (i32.shl (i32.load offset=16 (local.get $entry)) (i32.const 2))))
          (local.set $dc (i32.add (global.get $JCODES) (i32.mul (local.get $e) (i32.const 2056))))
          (local.set $ac (i32.add (local.get $dc) (i32.const 1028)))
          (local.set $dy (i32.const 0))
          (block $dyDone (loop $dyLoop
            (br_if $dyDone (i32.eq (local.get $dy) (local.get $v)))
            (local.set $dx (i32.const 0))
            (block $dxDone (loop $dxLoop
              (br_if $dxDone (i32.eq (local.get $dx) (local.get $h)))
              ;; sequentialBlock.
              (local.set $at (i32.add (local.get $base) (i32.shl
                (i32.add (i32.mul (i32.add (i32.mul (local.get $y) (local.get $v)) (local.get $dy)) (local.get $stride))
                  (i32.add (i32.mul (local.get $x) (local.get $h)) (local.get $dx))) (i32.const 7))))
              (local.set $current (i32.load16_s (local.get $at)))
              (local.set $diff (i32.sub (local.get $current) (i32.load (local.get $pred))))
              (local.set $n (call $category (local.get $diff)))
              (local.set $word (i32.load (i32.add (local.get $dc) (i32.shl (local.get $n) (i32.const 2)))))
              (br_if $fail (i32.or (i32.gt_u (local.get $n) (i32.const 11)) (i32.eqz (local.get $word))))
              (call $jcoded (local.get $word) (local.get $n) (local.get $diff))
              (local.set $run (i32.const 0)) (local.set $k (i32.const 1))
              (block $acDone (loop $kLoop
                (br_if $acDone (i32.eq (local.get $k) (i32.const 64)))
                (local.set $c (i32.load16_s (i32.add (local.get $at) (i32.shl (i32.load (i32.add (global.get $JZIGZAG) (i32.shl (local.get $k) (i32.const 2)))) (i32.const 1)))))
                (if (i32.eqz (local.get $c)) (then (local.set $run (i32.add (local.get $run) (i32.const 1))))
                  (else
                    (block $zrlDone (loop $zrl
                      (br_if $zrlDone (i32.lt_s (local.get $run) (i32.const 16)))
                      (local.set $word (i32.load (i32.add (local.get $ac) (i32.const 960))))
                      (br_if $fail (i32.eqz (local.get $word)))
                      (call $jput (i32.shr_u (local.get $word) (i32.const 16)) (i32.and (local.get $word) (i32.const 65535)))
                      (local.set $run (i32.sub (local.get $run) (i32.const 16)))
                      (br $zrl)))
                    (local.set $n (call $category (local.get $c)))
                    (local.set $word (i32.load (i32.add (local.get $ac) (i32.shl (i32.or (i32.shl (local.get $run) (i32.const 4)) (local.get $n)) (i32.const 2)))))
                    (br_if $fail (i32.or (i32.gt_u (local.get $n) (i32.const 10)) (i32.eqz (local.get $word))))
                    (call $jcoded (local.get $word) (local.get $n) (local.get $c))
                    (local.set $run (i32.const 0))))
                (local.set $k (i32.add (local.get $k) (i32.const 1)))
                (br $kLoop)))
              ;; The JPEG's own zero runs past its last value (scan.zeros), then the end of block.
              (block $found (loop $seek
                (br_if $found (i32.ge_u (global.get $jzero) (local.get $zeros)))
                (br_if $found (i32.ge_u (i32.load (i32.add (global.get $JZEROS) (i32.shl (global.get $jzero) (i32.const 3)))) (global.get $jblock)))
                (global.set $jzero (i32.add (global.get $jzero) (i32.const 1)))
                (br $seek)))
              (local.set $extra (i32.const 0))
              (if (i32.lt_u (global.get $jzero) (local.get $zeros)) (then
                (if (i32.eq (i32.load (i32.add (global.get $JZEROS) (i32.shl (global.get $jzero) (i32.const 3)))) (global.get $jblock)) (then
                  (local.set $extra (i32.load offset=4 (i32.add (global.get $JZEROS) (i32.shl (global.get $jzero) (i32.const 3)))))))))
              (if (local.get $extra) (then
                (br_if $fail (i32.lt_s (local.get $run) (i32.shl (local.get $extra) (i32.const 4))))
                (local.set $run (i32.sub (local.get $run) (i32.shl (local.get $extra) (i32.const 4))))
                (local.set $word (i32.load (i32.add (local.get $ac) (i32.const 960))))
                (local.set $i (i32.const 0))
                (block $extraDone (loop $extraLoop
                  (br_if $extraDone (i32.eq (local.get $i) (local.get $extra)))
                  (br_if $fail (i32.eqz (local.get $word)))
                  (call $jput (i32.shr_u (local.get $word) (i32.const 16)) (i32.and (local.get $word) (i32.const 65535)))
                  (local.set $i (i32.add (local.get $i) (i32.const 1)))
                  (br $extraLoop)))))
              (if (local.get $run) (then
                (local.set $word (i32.load (local.get $ac)))
                (br_if $fail (i32.eqz (local.get $word)))
                (call $jput (i32.shr_u (local.get $word) (i32.const 16)) (i32.and (local.get $word) (i32.const 65535)))))
              (i32.store (local.get $pred) (local.get $current))
              (global.set $jblock (i32.add (global.get $jblock) (i32.const 1)))
              (local.set $dx (i32.add (local.get $dx) (i32.const 1)))
              (br $dxLoop)))
            (local.set $dy (i32.add (local.get $dy) (i32.const 1)))
            (br $dyLoop)))
          (local.set $e (i32.add (local.get $e) (i32.const 1)))
          (br $eLoop)))
        (global.set $jmcu (i32.add (global.get $jmcu) (i32.const 1)))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br $xLoop)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $yLoop)))
    (i32.store offset=28 (global.get $JSCAN) (global.get $jpad))
    (i32.store offset=224 (global.get $JSCAN) (i32.wrap_i64 (global.get $jacc)))
    (i32.store offset=228 (global.get $JSCAN) (global.get $jpending))
    (return (i32.sub (global.get $at) (global.get $OUT))))
    (i32.const -1))

  ;; The JPEG parser's sequential scans (jfif.mjs decodeScan with ScanReader mode 0), while nothing else uses kernel
  ;; memory: up to eight Huffman lookups (65,536 entries of length << 8 | symbol) from 0, parameters and results at
  ;; DPARAMS (the zigzag order at DPARAMS + 256), the band's coefficients after them, the scan's bytes from DIN (unstuffed in place, interval by interval),
  ;; then the trailing zero runs found, (block, count) pairs, at DZEROS (DPARAMS + 20) for up to 65,536 of them.
  (global $DPARAMS i32 (i32.const 1048576))
  (global $DBAND i32 (i32.const 1049600))
  (global $DIN i32 (i32.const 1261568))
  ;; Interval state: its clean bytes from $dclean, $dn of them, the bit position, the next input byte; the unit,
  ;; block and zero-run counts.
  (global $dclean (mut i32) (i32.const 0))
  (global $dn (mut i32) (i32.const 0))
  (global $dbit (mut i32) (i32.const 0))
  (global $dpos (mut i32) (i32.const 0))
  (global $dunit (mut i32) (i32.const 0))
  (global $dblock (mut i32) (i32.const 0))
  (global $dzeros (mut i32) (i32.const 0))

  ;; ScanReader.load: the interval from $dpos unstuffed in place, up to its marker.
  (func $dload
    (local $r i32) (local $w i32) (local $end i32) (local $byte i32) (local $next i32)
    (local.set $end (i32.add (global.get $DIN) (i32.load offset=20 (global.get $DPARAMS))))
    (local.set $r (global.get $dpos)) (local.set $w (global.get $dpos))
    (block $done (loop $bytes
      (br_if $done (i32.ge_u (local.get $r) (local.get $end)))
      (local.set $byte (i32.load8_u (local.get $r)))
      (if (i32.eq (local.get $byte) (i32.const 255)) (then
        (br_if $done (i32.ge_u (i32.add (local.get $r) (i32.const 1)) (local.get $end)))
        (local.set $next (i32.load8_u offset=1 (local.get $r)))
        (if (i32.eqz (local.get $next)) (then
          (i32.store8 (local.get $w) (i32.const 255))
          (local.set $w (i32.add (local.get $w) (i32.const 1))) (local.set $r (i32.add (local.get $r) (i32.const 2)))
          (br $bytes)))
        (if (i32.eq (local.get $next) (i32.const 255)) (then (local.set $r (i32.add (local.get $r) (i32.const 1))) (br $bytes)))
        (br $done)))
      (i32.store8 (local.get $w) (local.get $byte))
      (local.set $w (i32.add (local.get $w) (i32.const 1))) (local.set $r (i32.add (local.get $r) (i32.const 1)))
      (br $bytes)))
    (global.set $dclean (global.get $dpos)) (global.set $dn (i32.sub (local.get $w) (global.get $dpos)))
    (global.set $dbit (i32.const 0)) (global.set $dpos (local.get $r)))

  ;; ScanReader.window: 32 bits from the bit position, big-endian, clean bytes past the interval read as 0.
  (func $dwindow (result i32)
    (local $at i32) (local $word i32) (local $i i32)
    (local.set $at (i32.shr_u (global.get $dbit) (i32.const 3)))
    (if (i32.le_u (i32.add (local.get $at) (i32.const 4)) (global.get $dn))
      (then (local.set $word (i32.load (i32.add (global.get $dclean) (local.get $at))))
        (local.set $word (i32.or (i32.or (i32.shl (local.get $word) (i32.const 24)) (i32.and (i32.shl (local.get $word) (i32.const 8)) (i32.const 0xFF0000)))
          (i32.or (i32.and (i32.shr_u (local.get $word) (i32.const 8)) (i32.const 0xFF00)) (i32.shr_u (local.get $word) (i32.const 24))))))
      (else
        (block $done (loop $bytes
          (br_if $done (i32.eq (local.get $i) (i32.const 4)))
          (local.set $word (i32.shl (local.get $word) (i32.const 8)))
          (if (i32.lt_u (i32.add (local.get $at) (local.get $i)) (global.get $dn)) (then
            (local.set $word (i32.or (local.get $word) (i32.load8_u (i32.add (i32.add (global.get $dclean) (local.get $at)) (local.get $i)))))))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $bytes)))))
    (i32.shl (local.get $word) (i32.and (global.get $dbit) (i32.const 7))))

  ;; receive and decode; -1 where the scan is cut short or the code is bad.
  (func $dreceive (param $n i32) (result i32)
    (local $value i32)
    (if (i32.eqz (local.get $n)) (then (return (i32.const 0))))
    (if (i32.gt_u (i32.add (global.get $dbit) (local.get $n)) (i32.shl (global.get $dn) (i32.const 3))) (then (return (i32.const -1))))
    (local.set $value (i32.shr_u (call $dwindow) (i32.sub (i32.const 32) (local.get $n))))
    (global.set $dbit (i32.add (global.get $dbit) (local.get $n)))
    (local.get $value))
  (func $ddecode (param $table i32) (result i32)
    (local $entry i32)
    (local.set $entry (i32.load16_u (i32.add (local.get $table) (i32.shl (i32.shr_u (call $dwindow) (i32.const 16)) (i32.const 1)))))
    (if (i32.eqz (local.get $entry)) (then (return (i32.const -1))))
    (if (i32.gt_u (i32.add (global.get $dbit) (i32.shr_u (local.get $entry) (i32.const 8))) (i32.shl (global.get $dn) (i32.const 3))) (then (return (i32.const -1))))
    (global.set $dbit (i32.add (global.get $dbit) (i32.shr_u (local.get $entry) (i32.const 8))))
    (i32.and (local.get $entry) (i32.const 255)))
  (func $extend (param $value i32) (param $n i32) (result i32)
    (select (i32.add (i32.sub (local.get $value) (i32.shl (i32.const 1) (local.get $n))) (i32.const 1)) (local.get $value)
      (i32.lt_u (local.get $value) (i32.shl (i32.const 1) (i32.sub (local.get $n) (i32.const 1))))))

  ;; ScanReader.atMarker: under 8 bits left, all ones, then the fill bytes skipped. 0 when the data is rejected.
  (func $datMarker (result i32)
    (local $remaining i32) (local $end i32)
    (local.set $remaining (i32.sub (i32.shl (global.get $dn) (i32.const 3)) (global.get $dbit)))
    (if (i32.ge_s (local.get $remaining) (i32.const 8)) (then (return (i32.const 0))))
    (if (local.get $remaining) (then
      (if (i32.ne (i32.shr_u (call $dwindow) (i32.sub (i32.const 32) (local.get $remaining)))
          (i32.sub (i32.shl (i32.const 1) (local.get $remaining)) (i32.const 1))) (then (return (i32.const 0))))))
    (local.set $end (i32.add (global.get $DIN) (i32.load offset=20 (global.get $DPARAMS))))
    (block $done (loop $fill
      (br_if $done (i32.ge_u (i32.add (global.get $dpos) (i32.const 1)) (local.get $end)))
      (br_if $done (i32.ne (i32.load8_u (global.get $dpos)) (i32.const 255)))
      (br_if $done (i32.ne (i32.load8_u offset=1 (global.get $dpos)) (i32.const 255)))
      (global.set $dpos (i32.add (global.get $dpos) (i32.const 1)))
      (br $fill)))
    (i32.const 1))

  ;; Starts a scan at DIN.
  (func (export "decodeStart")
    (global.set $dpos (global.get $DIN)) (global.set $dunit (i32.const 0)) (global.set $dblock (i32.const 0)) (global.set $dzeros (i32.const 0))
    (i64.store offset=224 (global.get $DPARAMS) (i64.const 0)) (i64.store offset=232 (global.get $DPARAMS) (i64.const 0))
    (call $dload))

  ;; Decodes units up to `until` into the band (cleared first). DPARAMS: entries, mcusX, total units, restart interval,
  ;; single, input length, blocksW (single), the band's first MCU or block row, zero-run capacity offset (DZEROS); per
  ;; entry from DPARAMS + 64 (32 bytes each) h, v, stride, DC and AC lookup offsets, predictor slot (DPARAMS + 224 + 4i)
  ;; and its band offset. Returns 1, or 0 where ScanReader rejects the data (the JavaScript then reads the scan).
  ;; When `until` is the total, the final atMarker runs and the next input byte goes to DPARAMS + 40 (from DIN).
  (func (export "decodeBand") (param $until i32) (param $bandBytes i32) (result i32)
    (local $entries i32) (local $mcusX i32) (local $total i32) (local $restart i32) (local $single i32) (local $blocksW i32)
    (local $row0 i32) (local $e i32) (local $entry i32) (local $h i32) (local $v i32) (local $stride i32) (local $dcT i32)
    (local $acT i32) (local $pred i32) (local $base i32) (local $my i32) (local $mx i32) (local $vv i32) (local $hh i32)
    (local $at i32) (local $t i32) (local $diff i32) (local $value i32) (local $k i32) (local $rs i32) (local $r i32) (local $size i32)
    (local $zeroRuns i32) (local $zlist i32)
    (local.set $entries (i32.load (global.get $DPARAMS))) (local.set $mcusX (i32.load offset=4 (global.get $DPARAMS)))
    (local.set $total (i32.load offset=8 (global.get $DPARAMS))) (local.set $restart (i32.load offset=12 (global.get $DPARAMS)))
    (local.set $single (i32.load offset=16 (global.get $DPARAMS))) (local.set $blocksW (i32.load offset=24 (global.get $DPARAMS)))
    (local.set $row0 (i32.load offset=28 (global.get $DPARAMS))) (local.set $zlist (i32.load offset=32 (global.get $DPARAMS)))
    (memory.fill (global.get $DBAND) (i32.const 0) (local.get $bandBytes))
    (block $fail
    (block $units (loop $unit
      (br_if $units (i32.ge_u (global.get $dunit) (local.get $until)))
      (if (i32.and (i32.ne (local.get $restart) (i32.const 0)) (i32.ne (global.get $dunit) (i32.const 0))) (then
        (if (i32.eqz (i32.rem_u (global.get $dunit) (local.get $restart))) (then
          (br_if $fail (i32.eqz (call $datMarker)))
          (br_if $fail (i32.ge_u (i32.add (global.get $dpos) (i32.const 1)) (i32.add (global.get $DIN) (i32.load offset=20 (global.get $DPARAMS)))))
          (br_if $fail (i32.ne (i32.load8_u (global.get $dpos)) (i32.const 255)))
          (br_if $fail (i32.ne (i32.load8_u offset=1 (global.get $dpos))
            (i32.add (i32.const 208) (i32.and (i32.sub (i32.div_u (global.get $dunit) (local.get $restart)) (i32.const 1)) (i32.const 7)))))
          (global.set $dpos (i32.add (global.get $dpos) (i32.const 2)))
          (call $dload)
          (i64.store offset=224 (global.get $DPARAMS) (i64.const 0)) (i64.store offset=232 (global.get $DPARAMS) (i64.const 0))))))
      (if (local.get $single)
        (then (local.set $my (i32.div_u (global.get $dunit) (local.get $blocksW)))
          (local.set $mx (i32.sub (global.get $dunit) (i32.mul (local.get $my) (local.get $blocksW)))))
        (else (local.set $my (i32.div_u (global.get $dunit) (local.get $mcusX)))
          (local.set $mx (i32.sub (global.get $dunit) (i32.mul (local.get $my) (local.get $mcusX))))))
      (local.set $e (i32.const 0))
      (block $entriesDone (loop $eLoop
        (br_if $entriesDone (i32.eq (local.get $e) (local.get $entries)))
        (local.set $entry (i32.add (i32.add (global.get $DPARAMS) (i32.const 64)) (i32.shl (local.get $e) (i32.const 5))))
        (local.set $h (i32.load (local.get $entry))) (local.set $v (i32.load offset=4 (local.get $entry)))
        (local.set $stride (i32.load offset=8 (local.get $entry))) (local.set $dcT (i32.load offset=12 (local.get $entry)))
        (local.set $acT (i32.load offset=16 (local.get $entry)))
        (local.set $pred (i32.add (i32.add (global.get $DPARAMS) (i32.const 224)) (i32.shl (i32.load offset=20 (local.get $entry)) (i32.const 2))))
        (local.set $base (i32.load offset=24 (local.get $entry)))
        (local.set $vv (i32.const 0))
        (block $vDone (loop $vLoop
          (br_if $vDone (i32.eq (local.get $vv) (local.get $v)))
          (local.set $hh (i32.const 0))
          (block $hDone (loop $hLoop
            (br_if $hDone (i32.eq (local.get $hh) (local.get $h)))
            (local.set $at (i32.add (local.get $base) (i32.shl
              (i32.add (i32.mul (i32.add (i32.mul (i32.sub (local.get $my) (local.get $row0)) (local.get $v)) (local.get $vv)) (local.get $stride))
                (i32.add (i32.mul (local.get $mx) (local.get $h)) (local.get $hh))) (i32.const 7))))
            ;; dcValue.
            (local.set $t (call $ddecode (local.get $dcT)))
            (br_if $fail (i32.or (i32.lt_s (local.get $t) (i32.const 0)) (i32.gt_s (local.get $t) (i32.const 11))))
            (local.set $diff (i32.const 0))
            (if (local.get $t) (then
              (local.set $value (call $dreceive (local.get $t)))
              (br_if $fail (i32.lt_s (local.get $value) (i32.const 0)))
              (local.set $diff (call $extend (local.get $value) (local.get $t)))))
            (local.set $value (i32.add (i32.load (local.get $pred)) (local.get $diff)))
            (i32.store (local.get $pred) (local.get $value))
            (br_if $fail (i32.or (i32.gt_s (local.get $value) (i32.const 2047)) (i32.lt_s (local.get $value) (i32.const -2048))))
            (i32.store16 (local.get $at) (local.get $value))
            ;; acFirst, sequential.
            (local.set $k (i32.const 1)) (local.set $zeroRuns (i32.const 0))
            (block $acDone (loop $acLoop
              (br_if $acDone (i32.gt_s (local.get $k) (i32.const 63)))
              (local.set $rs (call $ddecode (local.get $acT)))
              (br_if $fail (i32.lt_s (local.get $rs) (i32.const 0)))
              (local.set $r (i32.shr_u (local.get $rs) (i32.const 4))) (local.set $size (i32.and (local.get $rs) (i32.const 15)))
              (if (i32.eqz (local.get $size)) (then
                (if (i32.lt_u (local.get $r) (i32.const 15)) (then
                  (br_if $fail (local.get $r))
                  (br $acDone)))
                (local.set $k (i32.add (local.get $k) (i32.const 16)))
                (local.set $zeroRuns (i32.add (local.get $zeroRuns) (i32.const 1)))
                (br_if $fail (i32.gt_s (local.get $k) (i32.const 64)))
                (br $acLoop)))
              (local.set $k (i32.add (local.get $k) (local.get $r)))
              (br_if $fail (i32.gt_s (local.get $k) (i32.const 63)))
              (br_if $fail (i32.gt_u (local.get $size) (i32.const 10)))
              (local.set $value (call $dreceive (local.get $size)))
              (br_if $fail (i32.lt_s (local.get $value) (i32.const 0)))
              (local.set $value (call $extend (local.get $value) (local.get $size)))
              (br_if $fail (i32.or (i32.gt_s (local.get $value) (i32.const 1023)) (i32.lt_s (local.get $value) (i32.const -1023))))
              (i32.store16 (i32.add (local.get $at) (i32.shl (i32.load (i32.add (i32.add (global.get $DPARAMS) (i32.const 256)) (i32.shl (local.get $k) (i32.const 2)))) (i32.const 1))) (local.get $value))
              (local.set $zeroRuns (i32.const 0))
              (local.set $k (i32.add (local.get $k) (i32.const 1)))
              (br $acLoop)))
            (if (local.get $zeroRuns) (then
              (br_if $fail (i32.ge_u (global.get $dzeros) (i32.const 65536)))
              (i32.store (i32.add (local.get $zlist) (i32.shl (global.get $dzeros) (i32.const 3))) (global.get $dblock))
              (i32.store offset=4 (i32.add (local.get $zlist) (i32.shl (global.get $dzeros) (i32.const 3))) (local.get $zeroRuns))
              (global.set $dzeros (i32.add (global.get $dzeros) (i32.const 1)))))
            (global.set $dblock (i32.add (global.get $dblock) (i32.const 1)))
            (local.set $hh (i32.add (local.get $hh) (i32.const 1)))
            (br $hLoop)))
          (local.set $vv (i32.add (local.get $vv) (i32.const 1)))
          (br $vLoop)))
        (local.set $e (i32.add (local.get $e) (i32.const 1)))
        (br $eLoop)))
      (global.set $dunit (i32.add (global.get $dunit) (i32.const 1)))
      (br $unit)))
    (if (i32.eq (global.get $dunit) (local.get $total)) (then
      (br_if $fail (i32.eqz (call $datMarker)))
      (i32.store offset=40 (global.get $DPARAMS) (i32.sub (global.get $dpos) (global.get $DIN)))))
    (i32.store offset=44 (global.get $DPARAMS) (global.get $dzeros))
    (return (i32.const 1)))
    (i32.const 0))

  ;; Token fill's n tokens as a writer's values and histograms from `start`, through CMAP.
  (func (export "tokensIn") (param $start i32) (param $n i32)
    (local $i i32) (local $to i32)
    (block $done (loop $tokens
      (br_if $done (i32.eq (local.get $i) (local.get $n)))
      (local.set $to (i32.add (local.get $start) (local.get $i)))
      (i32.store (i32.add (global.get $VALUES) (i32.shl (local.get $to) (i32.const 2)))
        (i32.load16_u (i32.add (global.get $FVALUES) (i32.shl (local.get $i) (i32.const 1)))))
      (i32.store8 (i32.add (global.get $IDS) (local.get $to))
        (i32.load8_u (i32.add (global.get $CMAP) (i32.load16_u (i32.add (global.get $FCTXS) (i32.shl (local.get $i) (i32.const 1)))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $tokens))))

  ;; One group's n tokens as prefixGroupWriter writes them after `pending` bits (`acc`): per histogram each value below
  ;; 64's code and raw bits in one write (length -1: the general path) at 0 and 256, each token's code length (512) and
  ;; code (768), and the configuration (10000). Returns the whole bytes written at OUT, as ansFlush.
  (func (export "prefixWrite") (param $n i32) (param $acc i32) (param $pending i32) (result i32)
    (local $i i32) (local $value i32) (local $table i32) (local $length i32) (local $token i32)
    (global.set $acc (i64.extend_i32_u (local.get $acc))) (global.set $count (local.get $pending)) (global.set $at (global.get $OUT))
    (block $written (loop $tokens
      (br_if $written (i32.eq (local.get $i) (local.get $n)))
      (local.set $value (i32.load (i32.add (global.get $VALUES) (i32.shl (local.get $i) (i32.const 2)))))
      (local.set $table (i32.add (global.get $HISTOGRAMS)
        (i32.mul (i32.load8_u (i32.add (global.get $IDS) (local.get $i))) (i32.const 12576))))
      (local.set $length (i32.const -1))
      (if (i32.lt_u (local.get $value) (i32.const 64))
        (then (local.set $length (i32.load (i32.add (local.get $table) (i32.shl (local.get $value) (i32.const 2)))))))
      (if (i32.ge_s (local.get $length) (i32.const 0))
        (then (call $put (local.get $length) (i32.load (i32.add (i32.add (local.get $table) (i32.const 256)) (i32.shl (local.get $value) (i32.const 2))))))
        (else
          (local.set $token (call $hybrid (local.get $value) (local.get $table)))
          (call $put (i32.load8_u (i32.add (i32.add (local.get $table) (i32.const 512)) (local.get $token)))
            (i32.load16_u (i32.add (i32.add (local.get $table) (i32.const 768)) (i32.shl (local.get $token) (i32.const 1)))))
          (if (global.get $hbits) (then (call $put (global.get $hbits) (global.get $hraw))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $tokens)))
    (call $tail))

  ;; jbrd Brotli's literal model (brotli.mjs literalModel), inside OUT: up to 64 histograms of 256 counts, the pair
  ;; gains, each cluster's bits, whether it lives and the cluster each histogram is in.
  (global $LHIST i32 (i32.const 5853184))
  (global $LGAINS i32 (i32.const 5918720))
  (global $LBITS i32 (i32.const 5951488))
  (global $LALIVE i32 (i32.const 5952000))
  (global $LOWNER i32 (i32.const 5952064))
  ;; A row of zeros, cleared by literalClusters (other phases use this region).
  (global $LZERO i32 (i32.const 5952320))
  (func $lrow (param $i i32) (result i32) (i32.add (global.get $LHIST) (i32.shl (local.get $i) (i32.const 10))))
  (func $lbits (param $i i32) (result f64) (f64.load (i32.add (global.get $LBITS) (i32.shl (local.get $i) (i32.const 3)))))
  ;; brotli.mjs histogramBits of histogram i, or of i merged with j (j -1): the terms it adds, in symbol order.
  (func $lprice (param $i i32) (param $j i32) (result f64)
    (local $a i32) (local $b i32) (local $end i32) (local $f i32) (local $total f64) (local $bits f64) (local $used i32)
    (local.set $a (call $lrow (local.get $i)))
    (local.set $end (i32.add (local.get $a) (i32.const 1024)))
    (if (i32.ge_s (local.get $j) (i32.const 0))
      (then (local.set $b (i32.sub (call $lrow (local.get $j)) (local.get $a))))
      (else (local.set $b (i32.sub (global.get $LZERO) (local.get $a)))))
    (block $done (loop $symbol
      (br_if $done (i32.eq (local.get $a) (local.get $end)))
      (local.set $f (i32.add (i32.load (local.get $a)) (i32.load (i32.add (local.get $a) (local.get $b)))))
      (if (local.get $f) (then
        (local.set $total (f64.add (local.get $total) (f64.convert_i32_u (local.get $f))))
        (local.set $bits (f64.sub (local.get $bits)
          (if (result f64) (i32.lt_u (local.get $f) (i32.const 65536))
            (then (f64.load (i32.shl (local.get $f) (i32.const 3))))
            (else (call $pop (f64.convert_i32_u (local.get $f)))))))
        (local.set $used (i32.add (local.get $used) (i32.const 1)))))
      (local.set $a (i32.add (local.get $a) (i32.const 4)))
      (br $symbol)))
    (f64.add (f64.add (local.get $bits) (call $pop (local.get $total)))
      (f64.convert_i32_s (select (i32.add (i32.const 16) (i32.mul (i32.const 5) (local.get $used))) (i32.const 8) (i32.gt_s (local.get $used) (i32.const 1))))))
  (func $lgain (param $n i32) (param $i i32) (param $j i32)
    (f64.store (i32.add (global.get $LGAINS) (i32.shl (i32.add (i32.mul (local.get $i) (local.get $n)) (local.get $j)) (i32.const 3)))
      (f64.sub (f64.add (call $lbits (local.get $i)) (call $lbits (local.get $j))) (call $lprice (local.get $i) (local.get $j)))))
  ;; literalModel's greedy merging of n histograms at LHIST, in place: merged counts stay in each survivor's row, its bits
  ;; at LBITS, LALIVE marks survivors and LOWNER gives each histogram's survivor.
  (func (export "literalClusters") (param $n i32)
    (local $i i32) (local $j i32) (local $k i32) (local $count i32) (local $pi i32) (local $pj i32) (local $pg f64) (local $g f64)
    (local $s i32) (local $lo i32) (local $hi i32)
    (memory.fill (global.get $LZERO) (i32.const 0) (i32.const 1024))
    (block $init (loop $each
      (br_if $init (i32.eq (local.get $i) (local.get $n)))
      (f64.store (i32.add (global.get $LBITS) (i32.shl (local.get $i) (i32.const 3))) (call $lprice (local.get $i) (i32.const -1)))
      (i32.store8 (i32.add (global.get $LALIVE) (local.get $i)) (i32.const 1))
      (i32.store (i32.add (global.get $LOWNER) (i32.shl (local.get $i) (i32.const 2))) (local.get $i))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $each)))
    (local.set $i (i32.const 0))
    (block $pairs (loop $first
      (br_if $pairs (i32.eq (local.get $i) (local.get $n)))
      (local.set $j (i32.add (local.get $i) (i32.const 1)))
      (block $row (loop $second
        (br_if $row (i32.ge_s (local.get $j) (local.get $n)))
        (call $lgain (local.get $n) (local.get $i) (local.get $j))
        (local.set $j (i32.add (local.get $j) (i32.const 1)))
        (br $second)))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $first)))
    (local.set $count (local.get $n))
    (block $merged (loop $merge
      (br_if $merged (i32.le_s (local.get $count) (i32.const 1)))
      (local.set $pi (i32.const -1)) (local.set $pj (i32.const -1)) (local.set $pg (f64.const -inf))
      (local.set $i (i32.const 0))
      (block $scanned (loop $scanI
        (br_if $scanned (i32.eq (local.get $i) (local.get $n)))
        (if (i32.load8_u (i32.add (global.get $LALIVE) (local.get $i))) (then
          (local.set $j (i32.add (local.get $i) (i32.const 1)))
          (block $rowDone (loop $scanJ
            (br_if $rowDone (i32.ge_s (local.get $j) (local.get $n)))
            (if (i32.load8_u (i32.add (global.get $LALIVE) (local.get $j))) (then
              (local.set $g (f64.load (i32.add (global.get $LGAINS) (i32.shl (i32.add (i32.mul (local.get $i) (local.get $n)) (local.get $j)) (i32.const 3)))))
              (if (f64.gt (local.get $g) (local.get $pg)) (then (local.set $pg (local.get $g)) (local.set $pi (local.get $i)) (local.set $pj (local.get $j))))))
            (local.set $j (i32.add (local.get $j) (i32.const 1)))
            (br $scanJ)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $scanI)))
      (br_if $merged (f64.le (local.get $pg) (f64.const 0)))
      (local.set $s (i32.const 0))
      (block $added (loop $add
        (br_if $added (i32.eq (local.get $s) (i32.const 1024)))
        (i32.store (i32.add (call $lrow (local.get $pi)) (local.get $s))
          (i32.add (i32.load (i32.add (call $lrow (local.get $pi)) (local.get $s))) (i32.load (i32.add (call $lrow (local.get $pj)) (local.get $s)))))
        (local.set $s (i32.add (local.get $s) (i32.const 4)))
        (br $add)))
      (f64.store (i32.add (global.get $LBITS) (i32.shl (local.get $pi) (i32.const 3))) (call $lprice (local.get $pi) (i32.const -1)))
      (i32.store8 (i32.add (global.get $LALIVE) (local.get $pj)) (i32.const 0))
      (local.set $k (i32.const 0))
      (block $owned (loop $own
        (br_if $owned (i32.eq (local.get $k) (local.get $n)))
        (if (i32.eq (i32.load (i32.add (global.get $LOWNER) (i32.shl (local.get $k) (i32.const 2)))) (local.get $pj))
          (then (i32.store (i32.add (global.get $LOWNER) (i32.shl (local.get $k) (i32.const 2))) (local.get $pi))))
        (local.set $k (i32.add (local.get $k) (i32.const 1)))
        (br $own)))
      (local.set $count (i32.sub (local.get $count) (i32.const 1)))
      (local.set $k (i32.const 0))
      (block $repriced (loop $reprice
        (br_if $repriced (i32.eq (local.get $k) (local.get $n)))
        (if (i32.and (i32.load8_u (i32.add (global.get $LALIVE) (local.get $k))) (i32.ne (local.get $k) (local.get $pi))) (then
          (local.set $lo (select (local.get $k) (local.get $pi) (i32.lt_s (local.get $k) (local.get $pi))))
          (local.set $hi (select (local.get $pi) (local.get $k) (i32.lt_s (local.get $k) (local.get $pi))))
          (call $lgain (local.get $n) (local.get $lo) (local.get $hi))))
        (local.set $k (i32.add (local.get $k) (i32.const 1)))
        (br $reprice)))
      (br $merge))))

  ;; Token counting (entropy.mjs TokenCounts.addTokens) of token fill's output: CTAB holds a count per context and
  ;; value below 64 and is all zeros between calls (the parser, whose input may reach it, clears it); the touched
  ;; entries are listed at CUNIQUE, the tokens of 64 or more at CLARGE (context, value), in order.
  (global $CTAB i32 (i32.const 7426048))
  (global $CUNIQUE i32 (i32.const 9523200))
  (global $CLARGE i32 (i32.const 10309632))
  (func (export "countFilled") (param $n i32) (result i32)
    (local $i i32) (local $ctx i32) (local $value i32) (local $at i32) (local $m i32) (local $large i32) (local $count i32)
    (block $done (loop $tokens
      (br_if $done (i32.eq (local.get $i) (local.get $n)))
      (local.set $ctx (i32.load16_u (i32.add (global.get $FCTXS) (i32.shl (local.get $i) (i32.const 1)))))
      (local.set $value (i32.load16_u (i32.add (global.get $FVALUES) (i32.shl (local.get $i) (i32.const 1)))))
      (if (i32.lt_u (local.get $value) (i32.const 64))
        (then
          (local.set $at (i32.add (global.get $CTAB) (i32.shl (i32.or (i32.shl (local.get $ctx) (i32.const 6)) (local.get $value)) (i32.const 2))))
          (local.set $count (i32.load (local.get $at)))
          (if (i32.eqz (local.get $count)) (then
            (i32.store (i32.add (global.get $CUNIQUE) (i32.shl (local.get $m) (i32.const 2))) (i32.or (i32.shl (local.get $ctx) (i32.const 6)) (local.get $value)))
            (local.set $m (i32.add (local.get $m) (i32.const 1)))))
          (i32.store (local.get $at) (i32.add (local.get $count) (i32.const 1))))
        (else
          (i32.store (i32.add (global.get $CLARGE) (i32.shl (local.get $large) (i32.const 3))) (local.get $ctx))
          (i32.store offset=4 (i32.add (global.get $CLARGE) (i32.shl (local.get $large) (i32.const 3))) (local.get $value))
          (local.set $large (i32.add (local.get $large) (i32.const 1)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $tokens)))
    (i32.store (global.get $SCRATCH) (local.get $large))
    (local.get $m))
  ;; Clears the m touched entries.
  (func (export "countClear") (param $m i32)
    (local $i i32)
    (block $done (loop $entries
      (br_if $done (i32.eq (local.get $i) (local.get $m)))
      (i32.store (i32.add (global.get $CTAB) (i32.shl (i32.load (i32.add (global.get $CUNIQUE) (i32.shl (local.get $i) (i32.const 2)))) (i32.const 2))) (i32.const 0))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $entries))))

  ;; ansFlush's reciprocals for n histograms: ceil(2^44 / frequency), 0 for an absent token.
  (func (export "recips") (param $n i32)
    (local $h i32) (local $table i32) (local $i i32) (local $f i64)
    (block $done (loop $histograms
      (br_if $done (i32.eq (local.get $h) (local.get $n)))
      (local.set $table (i32.add (global.get $HISTOGRAMS) (i32.mul (local.get $h) (i32.const 12576))))
      (local.set $i (i32.const 0))
      (block $small (loop $values
        (br_if $small (i32.eq (local.get $i) (i32.const 64)))
        (local.set $f (i64.extend_i32_u (i32.load (i32.add (i32.add (local.get $table) (i32.const 9488)) (i32.shl (local.get $i) (i32.const 2))))))
        (i64.store (i32.add (i32.add (local.get $table) (i32.const 10016)) (i32.shl (local.get $i) (i32.const 3)))
          (if (result i64) (i64.eqz (local.get $f)) (then (i64.const 0))
            (else (i64.div_u (i64.add (i64.const 17592186044415) (local.get $f)) (local.get $f)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $values)))
      (local.set $i (i32.const 0))
      (block $tokens (loop $token
        (br_if $tokens (i32.eq (local.get $i) (i32.const 256)))
        (local.set $f (i64.extend_i32_u (i32.load16_u (i32.add (local.get $table) (i32.shl (local.get $i) (i32.const 1))))))
        (i64.store (i32.add (i32.add (local.get $table) (i32.const 10528)) (i32.shl (local.get $i) (i32.const 3)))
          (if (result i64) (i64.eqz (local.get $f)) (then (i64.const 0))
            (else (i64.div_u (i64.add (i64.const 17592186044415) (local.get $f)) (local.get $f)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $token)))
      (local.set $h (i32.add (local.get $h) (i32.const 1)))
      (br $histograms))))

  ;; ans.mjs writeModularAnsHistograms's encoder over n tokens at $tokens (u32: histogram << 16 | raw bits << 9 |
  ;; symbol) and their raw values at $extras, with the histograms' tables at HISTOGRAMS (counts, starts, reverse and
  ;; the token reciprocals of recips). The backward pass: each token's emitted state word at $emitted (flagged by bit
  ;; 15 of its token), the final state kept for mwrite; returns the bits, the state and raw bits included.
  (global $mstate (mut i32) (i32.const 0))
  (func (export "mbits") (param $n i32) (param $tokens i32) (param $emitted i32) (result i32)
    (local $i i32) (local $at i32) (local $word i32) (local $table i32) (local $symbol i32) (local $freq i32)
    (local $state i32) (local $q i32) (local $bits i32)
    (local.set $state (i32.const 1245184)) (local.set $bits (i32.const 32)) (local.set $i (local.get $n))
    (block $done (loop $back
      (br_if $done (i32.eqz (local.get $i)))
      (local.set $i (i32.sub (local.get $i) (i32.const 1)))
      (local.set $at (i32.add (local.get $tokens) (i32.shl (local.get $i) (i32.const 2))))
      (local.set $word (i32.and (i32.load (local.get $at)) (i32.const 0xffff7fff)))
      (local.set $table (i32.add (global.get $HISTOGRAMS) (i32.mul (i32.shr_u (local.get $word) (i32.const 16)) (i32.const 12576))))
      (local.set $symbol (i32.and (local.get $word) (i32.const 511)))
      (local.set $freq (i32.load16_u (i32.add (local.get $table) (i32.shl (local.get $symbol) (i32.const 1)))))
      (local.set $bits (i32.add (local.get $bits) (i32.and (i32.shr_u (local.get $word) (i32.const 9)) (i32.const 63))))
      (if (i32.ge_u (i32.shr_u (local.get $state) (i32.const 20)) (local.get $freq)) (then
        (local.set $bits (i32.add (local.get $bits) (i32.const 16)))
        (i32.store16 (i32.add (local.get $emitted) (i32.shl (local.get $i) (i32.const 1))) (local.get $state))
        (local.set $word (i32.or (local.get $word) (i32.const 32768)))
        (local.set $state (i32.shr_u (local.get $state) (i32.const 16)))))
      (i32.store (local.get $at) (local.get $word))
      ;; state / freq by the frequency's reciprocal (recips): exact for a state below 2^32 and a frequency up to 4096.
      (local.set $q (i32.wrap_i64 (i64.shr_u (i64.mul (i64.extend_i32_u (local.get $state))
        (i64.load (i32.add (i32.add (local.get $table) (i32.const 10528)) (i32.shl (local.get $symbol) (i32.const 3))))) (i64.const 44))))
      (local.set $state (i32.add (i32.shl (local.get $q) (i32.const 12))
        (i32.load16_u (i32.add (i32.add (local.get $table) (i32.const 1040))
          (i32.shl (i32.sub (i32.add (i32.load16_u (i32.add (i32.add (local.get $table) (i32.const 512)) (i32.shl (local.get $symbol) (i32.const 1))))
            (local.get $state)) (i32.mul (local.get $q) (local.get $freq))) (i32.const 1))))))
      (br $back)))
    (global.set $mstate (local.get $state))
    (local.get $bits))

  ;; After mbits: the final state (32 bits), then each token's state word when flagged and its raw bits, after `pending`
  ;; bits (`acc`). Returns the whole bytes written at OUT; the bits left over go to SCRATCH (value, then count).
  (func (export "mwrite") (param $n i32) (param $tokens i32) (param $extras i32) (param $emitted i32) (param $acc i32) (param $pending i32) (result i32)
    (local $i i32) (local $word i32) (local $raw i32)
    (global.set $acc (i64.extend_i32_u (local.get $acc))) (global.set $count (local.get $pending)) (global.set $at (global.get $OUT))
    (call $put (i32.const 16) (i32.and (global.get $mstate) (i32.const 65535)))
    (call $put (i32.const 16) (i32.shr_u (global.get $mstate) (i32.const 16)))
    (block $written (loop $forward
      (br_if $written (i32.eq (local.get $i) (local.get $n)))
      (local.set $word (i32.load (i32.add (local.get $tokens) (i32.shl (local.get $i) (i32.const 2)))))
      (if (i32.and (local.get $word) (i32.const 32768))
        (then (call $put (i32.const 16) (i32.load16_u (i32.add (local.get $emitted) (i32.shl (local.get $i) (i32.const 1)))))))
      (local.set $raw (i32.and (i32.shr_u (local.get $word) (i32.const 9)) (i32.const 63)))
      (if (local.get $raw)
        (then (call $put (local.get $raw) (i32.load (i32.add (local.get $extras) (i32.shl (local.get $i) (i32.const 2)))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $forward)))
    (call $tail))

  ;; mbits's tokens from a plan's tags (leaf slot << 16 | raw bits << 9 | symbol) copied to $at: each slot through the
  ;; plan's histogram map ($map, u16, or none when 0) plus the plan's first histogram.
  (func (export "mtags") (param $at i32) (param $n i32) (param $map i32) (param $offset i32)
    (local $end i32) (local $tag i32) (local $slot i32)
    (local.set $end (i32.add (local.get $at) (i32.shl (local.get $n) (i32.const 2))))
    (block $done (loop $tag
      (br_if $done (i32.eq (local.get $at) (local.get $end)))
      (local.set $tag (i32.load (local.get $at)))
      (local.set $slot (i32.shr_u (local.get $tag) (i32.const 16)))
      (if (local.get $map) (then (local.set $slot (i32.load16_u (i32.add (local.get $map) (i32.shl (local.get $slot) (i32.const 1)))))))
      (i32.store (local.get $at) (i32.or (i32.shl (i32.add (local.get $slot) (local.get $offset)) (i32.const 16))
        (i32.and (local.get $tag) (i32.const 32767))))
      (local.set $at (i32.add (local.get $at) (i32.const 4)))
      (br $tag))))

  ;; clusterTokenCounts' seed loop for every used context in order (JS1): its own histogram under the cluster
  ;; configuration (the small counts through $tok, then the larger values' tokens from $lpairs between $loff[t] and
  ;; $loff[t + 1], a token past 63 ignored as a Uint32Array of 64 ignores it), its entropy bits, the least increase
  ;; (seedBest), then a new cluster or a merge as entropy.mjs decides; each cluster's row, bits and terms are kept as
  ;; row() keeps them. Each own histogram goes to $owns + 256 t and its cluster's index to $assign + 4 t. The count of
  ;; clusters is the result.
  (func (export "seedAll") (param $n i32) (param $small i32) (param $loff i32) (param $lpairs i32) (param $tok i32)
    (param $seeds i32) (param $threshold f64) (param $owns i32) (param $assign i32) (result i32)
    (local $t i32) (local $k i32) (local $s i32) (local $c i32) (local $tk i32) (local $i i32) (local $end i32) (local $row i32)
    (local $best i32) (local $total f64) (local $bits f64) (local $ownBits f64) (local $f f64) (local $at i32)
    (block $contexts (loop $context
      (br_if $contexts (i32.eq (local.get $t) (local.get $n)))
      (local.set $s (i32.const 0))
      (block $zeroed (loop $zero
        (br_if $zeroed (i32.eq (local.get $s) (i32.const 256)))
        (i32.store (i32.add (global.get $OWN) (local.get $s)) (i32.const 0))
        (local.set $s (i32.add (local.get $s) (i32.const 4)))
        (br $zero)))
      (local.set $s (i32.const 0))
      (block $smalls (loop $small
        (br_if $smalls (i32.eq (local.get $s) (i32.const 64)))
        (local.set $c (i32.load (i32.add (local.get $small) (i32.shl (i32.add (i32.shl (local.get $t) (i32.const 6)) (local.get $s)) (i32.const 2)))))
        (if (local.get $c) (then
          (local.set $tk (i32.load (i32.add (local.get $tok) (i32.shl (local.get $s) (i32.const 2)))))
          (if (i32.lt_u (local.get $tk) (i32.const 64)) (then
            (local.set $at (i32.add (global.get $OWN) (i32.shl (local.get $tk) (i32.const 2))))
            (i32.store (local.get $at) (i32.add (i32.load (local.get $at)) (local.get $c)))))))
        (local.set $s (i32.add (local.get $s) (i32.const 1)))
        (br $small)))
      (local.set $i (i32.load (i32.add (local.get $loff) (i32.shl (local.get $t) (i32.const 2)))))
      (local.set $end (i32.load (i32.add (local.get $loff) (i32.shl (i32.add (local.get $t) (i32.const 1)) (i32.const 2)))))
      (block $larges (loop $large
        (br_if $larges (i32.ge_u (local.get $i) (local.get $end)))
        (local.set $tk (i32.load (i32.add (local.get $lpairs) (i32.shl (local.get $i) (i32.const 3)))))
        (if (i32.lt_u (local.get $tk) (i32.const 64)) (then
          (local.set $at (i32.add (global.get $OWN) (i32.shl (local.get $tk) (i32.const 2))))
          (i32.store (local.get $at) (i32.add (i32.load (local.get $at)) (i32.load offset=4 (i32.add (local.get $lpairs) (i32.shl (local.get $i) (i32.const 3))))))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $large)))
      ;; Its copy for the caller, and entropyBits: the total and each population in symbol order.
      (local.set $s (i32.const 0)) (local.set $total (f64.const 0)) (local.set $bits (f64.const 0))
      (block $summed (loop $sum
        (br_if $summed (i32.eq (local.get $s) (i32.const 256)))
        (local.set $c (i32.load (i32.add (global.get $OWN) (local.get $s))))
        (i32.store (i32.add (i32.add (local.get $owns) (i32.shl (local.get $t) (i32.const 8))) (local.get $s)) (local.get $c))
        (local.set $f (f64.convert_i32_u (local.get $c)))
        (local.set $total (f64.add (local.get $total) (local.get $f)))
        (local.set $bits (f64.sub (local.get $bits) (call $pop (local.get $f))))
        (local.set $s (i32.add (local.get $s) (i32.const 4)))
        (br $sum)))
      (local.set $ownBits (f64.add (local.get $bits) (call $pop (local.get $total))))
      (local.set $best (call $seedBest (local.get $k) (local.get $ownBits)))
      (if (i32.or (i32.lt_s (local.get $best) (i32.const 0))
            (i32.and (i32.lt_s (local.get $k) (local.get $seeds)) (f64.gt (f64.load (global.get $SCRATCH)) (local.get $threshold))))
        (then
          ;; A new cluster: its row is OWN.
          (local.set $row (call $row (local.get $k)))
          (local.set $s (i32.const 0))
          (block $copied (loop $copy
            (br_if $copied (i32.eq (local.get $s) (i32.const 256)))
            (i32.store (i32.add (local.get $row) (local.get $s)) (i32.load (i32.add (global.get $OWN) (local.get $s))))
            (local.set $s (i32.add (local.get $s) (i32.const 4)))
            (br $copy)))
          (f64.store (i32.add (global.get $BITS) (i32.shl (local.get $k) (i32.const 3))) (local.get $ownBits))
          (call $terms (local.get $k))
          (i32.store (i32.add (local.get $assign) (i32.shl (local.get $t) (i32.const 2))) (local.get $k))
          (local.set $k (i32.add (local.get $k) (i32.const 1))))
        (else
          ;; A merge: the row gains OWN, then its entropyBits again.
          (local.set $row (call $row (local.get $best)))
          (local.set $s (i32.const 0)) (local.set $total (f64.const 0)) (local.set $bits (f64.const 0))
          (block $merged (loop $merge
            (br_if $merged (i32.eq (local.get $s) (i32.const 256)))
            (local.set $c (i32.add (i32.load (i32.add (local.get $row) (local.get $s))) (i32.load (i32.add (global.get $OWN) (local.get $s)))))
            (i32.store (i32.add (local.get $row) (local.get $s)) (local.get $c))
            (local.set $f (f64.convert_i32_u (local.get $c)))
            (local.set $total (f64.add (local.get $total) (local.get $f)))
            (local.set $bits (f64.sub (local.get $bits) (call $pop (local.get $f))))
            (local.set $s (i32.add (local.get $s) (i32.const 4)))
            (br $merge)))
          (f64.store (i32.add (global.get $BITS) (i32.shl (local.get $best) (i32.const 3))) (f64.add (local.get $bits) (call $pop (local.get $total))))
          (call $terms (local.get $best))
          (i32.store (i32.add (local.get $assign) (i32.shl (local.get $t) (i32.const 2))) (local.get $best))))
      (local.set $t (i32.add (local.get $t) (i32.const 1)))
      (br $context)))
    (local.get $k))

  ;; clusterTokenCounts' configuration choice for one histogram on the ANS path (JS1): for each candidate (split, msb,
  ;; lsb, splitToken at $cands + 16 c) the values' tokens and raw bits ($values, $weights, $count of them), then
  ;; ans.mjs histogramCost: normalise to 4,096 (Math.round as floor plus one at a remainder of one half, then the same
  ;; one-step corrections), writeUintConfig's bits, distributionLength(counts, true) and expectedDataBits from
  ;; $symbolBits; cost = raw + ((header + distribution) + data), the first least kept. The best candidate's index is
  ;; the result; its tokens (128) go to $best and its raw bits and cost to $out. $scratch holds 128 tokens and 128 counts.
  (func $ceilLog2 (param $v i32) (result i32)
    (if (result i32) (i32.le_s (local.get $v) (i32.const 1)) (then (i32.const 0)) (else (i32.sub (i32.const 32) (i32.clz (i32.sub (local.get $v) (i32.const 1)))))))
  (func $floorLog2 (param $v i32) (result i32) (i32.sub (i32.const 31) (i32.clz (local.get $v))))
  (func $varLength (param $v i32) (result f64)
    (if (result f64) (local.get $v) (then (f64.convert_i32_s (i32.add (i32.const 4) (call $floorLog2 (local.get $v))))) (else (f64.const 1))))
  (func $precision (param $bits i32) (result f64)
    (local $m i32)
    (local.set $m (i32.sub (i32.const 12) (i32.shr_s (i32.sub (i32.const 12) (local.get $bits)) (i32.const 1))))
    (local.set $m (select (local.get $bits) (local.get $m) (i32.lt_s (local.get $bits) (local.get $m))))
    (f64.convert_i32_s (select (local.get $m) (i32.const 0) (i32.gt_s (local.get $m) (i32.const 0)))))
  ;; LOG_LENGTHS[own] (13 bytes at $logLengths, set by priceConfigs), NaN past its 13 entries (an undefined element).
  (global $logLengths (mut i32) (i32.const 0))
  (func $logLength (param $own i32) (result f64)
    (if (result f64) (i32.gt_u (local.get $own) (i32.const 12)) (then (f64.const nan))
      (else (f64.convert_i32_s (i32.load8_u (i32.add (global.get $logLengths) (local.get $own)))))))
  (func (export "priceConfigs") (param $values i32) (param $weights i32) (param $count i32) (param $cands i32) (param $c i32)
    (param $symbolBits i32) (param $logs i32) (param $scratch i32) (param $best i32) (param $out i32) (result i32)
    (local $k i32) (local $i i32) (local $v i32) (local $w i32) (local $token i32) (local $n i32) (local $m i32) (local $cand i32)
    (local $split i32) (local $msb i32) (local $lsb i32) (local $splitToken i32) (local $both i32) (local $raw f64) (local $tokens i32)
    (local $counts i32) (local $total f64) (local $last i32) (local $sum i32) (local $f f64) (local $x f64) (local $r f64) (local $dir i32)
    (local $chosen i32) (local $error f64) (local $cand2 f64) (local $length i32) (local $used i32) (local $first i32) (local $second i32)
    (local $omit i32) (local $bits f64) (local $omitLog i32) (local $own i32) (local $end i32) (local $data f64) (local $header f64)
    (local $cost f64) (local $bestCost f64) (local $bestIndex i32) (local $logAlphabet i32) (local $ci i32)
    (global.set $logLengths (local.get $logs))
    (local.set $tokens (local.get $scratch)) (local.set $counts (i32.add (local.get $scratch) (i32.const 512)))
    (local.set $bestCost (f64.const inf)) (local.set $bestIndex (i32.const -1))
    (block $candidates (loop $candidate
      (br_if $candidates (i32.eq (local.get $k) (local.get $c)))
      (local.set $cand (i32.add (local.get $cands) (i32.shl (local.get $k) (i32.const 4))))
      (local.set $split (i32.load (local.get $cand))) (local.set $msb (i32.load offset=4 (local.get $cand)))
      (local.set $lsb (i32.load offset=8 (local.get $cand))) (local.set $splitToken (i32.load offset=12 (local.get $cand)))
      (local.set $both (i32.add (local.get $msb) (local.get $lsb)))
      ;; Tokens and raw bits (entropy.mjs split).
      (local.set $i (i32.const 0))
      (block $cleared (loop $clear (br_if $cleared (i32.eq (local.get $i) (i32.const 512)))
        (i32.store (i32.add (local.get $tokens) (local.get $i)) (i32.const 0)) (local.set $i (i32.add (local.get $i) (i32.const 4))) (br $clear)))
      (local.set $raw (f64.const 0)) (local.set $i (i32.const 0))
      (block $split (loop $value (br_if $split (i32.eq (local.get $i) (local.get $count)))
        (local.set $v (i32.load (i32.add (local.get $values) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $w (i32.load (i32.add (local.get $weights) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $token (local.get $v))
        (if (i32.ge_u (local.get $v) (local.get $splitToken)) (then
          (local.set $n (call $floorLog2 (local.get $v))) (local.set $m (i32.sub (local.get $v) (i32.shl (i32.const 1) (local.get $n))))
          (local.set $token (i32.add (local.get $splitToken) (i32.or (i32.or
            (i32.shl (i32.sub (local.get $n) (local.get $split)) (local.get $both))
            (i32.shl (i32.shr_s (local.get $m) (i32.sub (local.get $n) (local.get $msb))) (local.get $lsb)))
            (i32.and (local.get $m) (i32.sub (i32.shl (i32.const 1) (local.get $lsb)) (i32.const 1))))))
          (local.set $raw (f64.add (local.get $raw) (f64.mul (f64.convert_i32_u (local.get $w)) (f64.convert_i32_s (i32.sub (local.get $n) (local.get $both))))))))
        (if (i32.lt_u (local.get $token) (i32.const 128)) (then
          (i32.store (i32.add (local.get $tokens) (i32.shl (local.get $token) (i32.const 2)))
            (i32.add (i32.load (i32.add (local.get $tokens) (i32.shl (local.get $token) (i32.const 2)))) (local.get $w)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $value)))
      ;; normalise.
      (local.set $total (f64.const 0)) (local.set $last (i32.const 0)) (local.set $i (i32.const 0))
      (block $totalled (loop $tot (br_if $totalled (i32.eq (local.get $i) (i32.const 128)))
        (local.set $f (f64.convert_i32_u (i32.load (i32.add (local.get $tokens) (i32.shl (local.get $i) (i32.const 2))))))
        (local.set $total (f64.add (local.get $total) (local.get $f)))
        (if (f64.ne (local.get $f) (f64.const 0)) (then (local.set $last (i32.add (local.get $i) (i32.const 1)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $tot)))
      (local.set $length (select (local.get $last) (i32.const 1) (local.get $last)))
      (local.set $i (i32.const 0))
      (block $zeroed (loop $zero (br_if $zeroed (i32.eq (local.get $i) (local.get $length)))
        (i32.store16 (i32.add (local.get $counts) (i32.shl (local.get $i) (i32.const 1))) (i32.const 0)) (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $zero)))
      (if (f64.eq (local.get $total) (f64.const 0)) (then (i32.store16 (local.get $counts) (i32.const 4096)))
      (else
        (local.set $sum (i32.const 0)) (local.set $i (i32.const 0))
        (block $rounded (loop $round (br_if $rounded (i32.eq (local.get $i) (local.get $last)))
          (local.set $f (f64.convert_i32_u (i32.load (i32.add (local.get $tokens) (i32.shl (local.get $i) (i32.const 2))))))
          (if (f64.ne (local.get $f) (f64.const 0)) (then
            (local.set $x (f64.div (f64.mul (local.get $f) (f64.const 4096)) (local.get $total)))
            (local.set $r (f64.floor (local.get $x)))
            (if (f64.ge (f64.sub (local.get $x) (local.get $r)) (f64.const 0.5)) (then (local.set $r (f64.add (local.get $r) (f64.const 1)))))
            (if (f64.lt (local.get $r) (f64.const 1)) (then (local.set $r (f64.const 1))))
            (i32.store16 (i32.add (local.get $counts) (i32.shl (local.get $i) (i32.const 1))) (i32.trunc_f64_u (local.get $r)))
            ;; sum += counts[i]: the stored Uint16 value.
            (local.set $sum (i32.add (local.get $sum) (i32.load16_u (i32.add (local.get $counts) (i32.shl (local.get $i) (i32.const 1))))))))
          (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $round)))
        (block $balanced (loop $balance (br_if $balanced (i32.eq (local.get $sum) (i32.const 4096)))
          (local.set $dir (select (i32.const 1) (i32.const -1) (i32.lt_s (local.get $sum) (i32.const 4096))))
          (local.set $chosen (i32.const -1)) (local.set $error (f64.const -inf)) (local.set $i (i32.const 0))
          (block $scanned (loop $scan (br_if $scanned (i32.eq (local.get $i) (local.get $last)))
            (local.set $f (f64.convert_i32_u (i32.load (i32.add (local.get $tokens) (i32.shl (local.get $i) (i32.const 2))))))
            (local.set $m (i32.load16_u (i32.add (local.get $counts) (i32.shl (local.get $i) (i32.const 1)))))
            (if (i32.and (f64.ne (local.get $f) (f64.const 0)) (i32.or (i32.gt_s (local.get $dir) (i32.const 0)) (i32.gt_u (local.get $m) (i32.const 1)))) (then
              (local.set $cand2 (f64.mul (f64.convert_i32_s (local.get $dir))
                (f64.sub (f64.mul (local.get $f) (f64.const 4096)) (f64.mul (f64.convert_i32_u (local.get $m)) (local.get $total)))))
              (if (f64.gt (local.get $cand2) (local.get $error)) (then (local.set $chosen (local.get $i)) (local.set $error (local.get $cand2))))))
            (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $scan)))
          (i32.store16 (i32.add (local.get $counts) (i32.shl (local.get $chosen) (i32.const 1)))
            (i32.add (i32.load16_u (i32.add (local.get $counts) (i32.shl (local.get $chosen) (i32.const 1)))) (local.get $dir)))
          (local.set $sum (i32.add (local.get $sum) (local.get $dir)))
          (br $balance)))))
      ;; writeUintConfig's bits at the histogram's own alphabet.
      (local.set $logAlphabet (call $ceilLog2 (local.get $length)))
      (local.set $logAlphabet (select (local.get $logAlphabet) (i32.const 5) (i32.gt_s (local.get $logAlphabet) (i32.const 5))))
      (local.set $header (f64.convert_i32_s (call $ceilLog2 (i32.add (local.get $logAlphabet) (i32.const 1)))))
      (if (i32.ne (local.get $split) (local.get $logAlphabet)) (then
        (local.set $header (f64.add (local.get $header) (f64.convert_i32_s (call $ceilLog2 (i32.add (local.get $split) (i32.const 1))))))
        (local.set $header (f64.add (local.get $header) (f64.convert_i32_s (call $ceilLog2 (i32.add (i32.sub (local.get $split) (local.get $msb)) (i32.const 1))))))))
      ;; distributionLength(counts, true): shift 12, the first largest count omitted.
      (local.set $used (i32.const 0)) (local.set $first (i32.const -1)) (local.set $second (i32.const -1)) (local.set $omit (i32.const 0)) (local.set $i (i32.const 0))
      (block $counted (loop $cnt (br_if $counted (i32.eq (local.get $i) (local.get $length)))
        (local.set $m (i32.load16_u (i32.add (local.get $counts) (i32.shl (local.get $i) (i32.const 1)))))
        (if (local.get $m) (then
          (if (i32.eqz (local.get $used)) (then (local.set $first (local.get $i)))
            (else (if (i32.eq (local.get $used) (i32.const 1)) (then (local.set $second (local.get $i))))))
          (local.set $used (i32.add (local.get $used) (i32.const 1)))))
        (if (i32.gt_u (local.get $m) (i32.load16_u (i32.add (local.get $counts) (i32.shl (local.get $omit) (i32.const 1))))) (then (local.set $omit (local.get $i))))
        (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $cnt)))
      (if (i32.le_u (local.get $used) (i32.const 2)) (then
        (local.set $bits (f64.const 2))
        (if (local.get $used) (then (local.set $bits (f64.add (local.get $bits) (call $varLength (local.get $first))))))
        (if (i32.eq (local.get $used) (i32.const 2)) (then (local.set $bits (f64.add (local.get $bits) (f64.add (call $varLength (local.get $second)) (f64.const 12)))))))
      (else
        (local.set $bits (f64.add (f64.const 8) (call $varLength (i32.sub (local.get $length) (i32.const 3)))))
        (local.set $omitLog (i32.const 10)) (local.set $i (i32.const 0))
        (block $logged (loop $log (br_if $logged (i32.eq (local.get $i) (local.get $length)))
          (local.set $m (i32.load16_u (i32.add (local.get $counts) (i32.shl (local.get $i) (i32.const 1)))))
          (if (i32.and (i32.ne (local.get $i) (local.get $omit)) (i32.ne (local.get $m) (i32.const 0))) (then
            (local.set $own (i32.add (i32.add (call $floorLog2 (local.get $m)) (i32.const 1)) (i32.lt_s (local.get $i) (local.get $omit))))
            (if (i32.gt_s (local.get $own) (local.get $omitLog)) (then (local.set $omitLog (local.get $own))))))
          (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $log)))
        (local.set $i (i32.const 0))
        (block $lengths (loop $len (br_if $lengths (i32.ge_s (local.get $i) (local.get $length)))
          (local.set $m (i32.load16_u (i32.add (local.get $counts) (i32.shl (local.get $i) (i32.const 1)))))
          (local.set $own (if (result i32) (i32.eq (local.get $i) (local.get $omit)) (then (local.get $omitLog))
            (else (if (result i32) (local.get $m) (then (i32.add (call $floorLog2 (local.get $m)) (i32.const 1))) (else (i32.const 0))))))
          (local.set $bits (f64.add (local.get $bits) (call $logLength (local.get $own))))
          (if (i32.and (i32.ne (local.get $i) (local.get $omit)) (i32.gt_s (local.get $own) (i32.const 1))) (then
            (local.set $bits (f64.add (local.get $bits) (call $precision (i32.sub (local.get $own) (i32.const 1)))))))
          (if (i32.ne (local.get $i) (local.get $omit)) (then
            (local.set $end (i32.add (local.get $i) (i32.const 1)))
            (block $ran (loop $run
              (br_if $ran (i32.ge_s (local.get $end) (local.get $length)))
              (br_if $ran (i32.eq (local.get $end) (local.get $omit)))
              (br_if $ran (i32.ne (i32.load16_u (i32.add (local.get $counts) (i32.shl (local.get $end) (i32.const 1)))) (local.get $m)))
              (local.set $end (i32.add (local.get $end) (i32.const 1))) (br $run)))
            (if (i32.ge_s (i32.sub (local.get $end) (local.get $i)) (i32.const 5)) (then
              (local.set $bits (f64.add (local.get $bits) (f64.add (f64.const 7) (call $varLength (i32.sub (i32.sub (local.get $end) (local.get $i)) (i32.const 5))))))
              (local.set $i (i32.sub (local.get $end) (i32.const 1)))))))
          (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $len)))))
      ;; expectedDataBits over the 128 tokens.
      (local.set $data (f64.const 0)) (local.set $i (i32.const 0))
      (block $expected (loop $exp (br_if $expected (i32.eq (local.get $i) (i32.const 128)))
        (local.set $w (i32.load (i32.add (local.get $tokens) (i32.shl (local.get $i) (i32.const 2)))))
        (if (local.get $w) (then
          (local.set $data (f64.add (local.get $data) (f64.mul (f64.convert_i32_u (local.get $w))
            (f64.load (i32.add (local.get $symbolBits) (i32.shl (i32.load16_u (i32.add (local.get $counts) (i32.shl (local.get $i) (i32.const 1)))) (i32.const 3)))))))))
        (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $exp)))
      (local.set $cost (f64.add (local.get $raw) (f64.add (f64.add (local.get $header) (local.get $bits)) (local.get $data))))
      (if (f64.lt (local.get $cost) (local.get $bestCost)) (then
        (local.set $bestCost (local.get $cost)) (local.set $bestIndex (local.get $k))
        (local.set $ci (i32.const 0))
        (block $kept (loop $keep (br_if $kept (i32.eq (local.get $ci) (i32.const 512)))
          (i32.store (i32.add (local.get $best) (local.get $ci)) (i32.load (i32.add (local.get $tokens) (local.get $ci))))
          (local.set $ci (i32.add (local.get $ci) (i32.const 4))) (br $keep)))
        (f64.store (local.get $out) (local.get $raw)) (f64.store offset=8 (local.get $out) (local.get $cost))))
      (local.set $k (i32.add (local.get $k) (i32.const 1)))
      (br $candidate)))
    (local.get $bestIndex))
)
