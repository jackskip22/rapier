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

  ;; log2 x from + - * / alone.
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

;; TABLE: populationBits below 65,536, n log2 n.
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
      (local.set $bits (f64.sub (local.get $bits) (if (result f64) (f64.lt (local.get $n) (f64.const 65536)) (then (f64.load (i32.shl (i32.trunc_f64_u (local.get $n)) (i32.const 3)))) (else (call $pop (local.get $n))))))
      (local.set $s (i32.add (local.get $s) (i32.const 4)))
      (br $symbol)))
    (f64.add (local.get $bits) (call $pop (local.get $total))))

  (func $row (param $i i32) (result i32) (i32.add (global.get $ROWS) (i32.shl (local.get $i) (i32.const 8))))
  (func $bits (param $i i32) (result f64) (f64.load (i32.add (global.get $BITS) (i32.shl (local.get $i) (i32.const 3)))))

;; Cluster i's populationBits terms and entropyBits, after its row changed. The sum is in symbol order.
  (func $terms (export "terms") (param $i i32) (result f64)
    (local $s i32) (local $row i32) (local $pops i32) (local $count f64) (local $term f64) (local $total f64) (local $sum f64)
    (local.set $row (call $row (local.get $i)))
    (local.set $pops (i32.add (global.get $POPS) (i32.shl (local.get $i) (i32.const 9))))
    (block $done (loop $symbol
      (br_if $done (i32.eq (local.get $s) (i32.const 64)))
      (local.set $count (f64.convert_i32_u (i32.load (i32.add (local.get $row) (i32.shl (local.get $s) (i32.const 2))))))
      (local.set $term (if (result f64) (f64.lt (local.get $count) (f64.const 65536)) (then (f64.load (i32.shl (i32.trunc_f64_u (local.get $count)) (i32.const 3)))) (else (call $pop (local.get $count)))))
      (f64.store (i32.add (local.get $pops) (i32.shl (local.get $s) (i32.const 3))) (local.get $term))
      (local.set $total (f64.add (local.get $total) (local.get $count)))
      (local.set $sum (f64.add (local.get $sum) (local.get $term)))
      (local.set $s (i32.add (local.get $s) (i32.const 1)))
      (br $symbol)))
    (f64.store (i32.add (global.get $TOTALS) (i32.shl (local.get $i) (i32.const 3))) (local.get $total))
    (f64.store (i32.add (global.get $SUMS) (i32.shl (local.get $i) (i32.const 3))) (local.get $sum))
    (f64.add (f64.neg (local.get $sum)) (call $pop (local.get $total))))

;; $terms after cluster i's row gains OWN, adding OWN to the row as it goes: a symbol OWN does not touch keeps its
  ;; count, so its term is the one already in POPS (every row write is followed by $terms); the others are looked up
  ;; again. The sums run in symbol order over the same terms, so the result is $terms'.
  (func $termsGained (param $i i32) (result f64)
    (local $s i32) (local $row i32) (local $pops i32) (local $own i32) (local $c i32) (local $n i32) (local $count f64) (local $term f64) (local $total f64) (local $sum f64)
    (local.set $row (call $row (local.get $i)))
    (local.set $pops (i32.add (global.get $POPS) (i32.shl (local.get $i) (i32.const 9))))
    (local.set $own (global.get $OWN))
    (block $done (loop $symbol
      (br_if $done (i32.eq (local.get $s) (i32.const 64)))
      (local.set $c (i32.load (i32.add (local.get $own) (i32.shl (local.get $s) (i32.const 2)))))
      (local.set $n (i32.load (i32.add (local.get $row) (i32.shl (local.get $s) (i32.const 2)))))
      (if (local.get $c)
        (then
          (local.set $n (i32.add (local.get $n) (local.get $c)))
          (i32.store (i32.add (local.get $row) (i32.shl (local.get $s) (i32.const 2))) (local.get $n))
          (local.set $count (f64.convert_i32_u (local.get $n)))
          (local.set $term (if (result f64) (f64.lt (local.get $count) (f64.const 65536)) (then (f64.load (i32.shl (i32.trunc_f64_u (local.get $count)) (i32.const 3)))) (else (call $pop (local.get $count)))))
          (f64.store (i32.add (local.get $pops) (i32.shl (local.get $s) (i32.const 3))) (local.get $term)))
        (else
          (local.set $count (f64.convert_i32_u (local.get $n)))
          (local.set $term (f64.load (i32.add (local.get $pops) (i32.shl (local.get $s) (i32.const 3)))))))
      (local.set $total (f64.add (local.get $total) (local.get $count)))
      (local.set $sum (f64.add (local.get $sum) (local.get $term)))
      (local.set $s (i32.add (local.get $s) (i32.const 1)))
      (br $symbol)))
    (f64.store (i32.add (global.get $TOTALS) (i32.shl (local.get $i) (i32.const 3))) (local.get $total))
    (f64.store (i32.add (global.get $SUMS) (i32.shl (local.get $i) (i32.const 3))) (local.get $sum))
    (f64.add (f64.neg (local.get $sum)) (call $pop (local.get $total))))

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
        (if (result f64) (local.get $c) (then (if (result f64) (f64.lt (local.get $n) (f64.const 65536)) (then (f64.load (i32.shl (i32.trunc_f64_u (local.get $n)) (i32.const 3)))) (else (call $pop (local.get $n)))))
          (else (f64.load (i32.add (local.get $pops) (i32.shl (local.get $s) (i32.const 3))))))))
      (local.set $s (i32.add (local.get $s) (i32.const 1)))
      (br $symbol)))
    (f64.add (local.get $bits) (call $pop (local.get $total))))

;; Seeding: the first of the k clusters whose merge with OWN adds least, mergedBits - cluster bits - own bits, as the
  ;; JavaScript sums it. An increase needs only OWN's nonzero symbols and the totals; that estimate, within a margin far
  ;; above its rounding, rules out every cluster that cannot be the least, and the rest are summed as in JavaScript. The
  ;; increase goes to SCRATCH; -1 when k is 0.
  (func $seedBest  (param $k i32) (param $ownBits f64) (result i32)
    (local $i i32) (local $best i32) (local $low f64) (local $increase f64) (local $s i32) (local $m i32) (local $c i32)
    (local $ownTotal f64) (local $row i32) (local $pops i32) (local $merged f64) (local $estimate f64) (local $margin f64)
    (local $bound f64) (local $j i32) (local $n f64)
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
          (block (result f64) (local.set $n (f64.add (f64.convert_i32_u (i32.load (i32.add (local.get $row) (i32.shl (local.get $s) (i32.const 2)))))
            (f64.convert_i32_u (i32.load (i32.add (global.get $OWN) (i32.shl (local.get $s) (i32.const 2)))))))
            (if (result f64) (f64.lt (local.get $n) (f64.const 65536)) (then (f64.load (i32.shl (i32.trunc_f64_u (local.get $n)) (i32.const 3)))) (else (call $pop (local.get $n)))))
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
    (local $cost2 f64) (local $c f64) (local $sym i32)
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
      ;; Each histogram's cost into next, two histograms a pass over the context's terms (each sum in term order).
      (local.set $i (i32.const 0))
      (block $paired (loop $pair2
        (br_if $paired (i32.ge_s (i32.add (local.get $i) (i32.const 1)) (local.get $k)))
        (local.set $table (i32.add (local.get $tables) (i32.shl (local.get $i) (i32.const 9))))
        (local.set $cost (f64.const 0)) (local.set $cost2 (f64.const 0))
        (local.set $j (i32.load (i32.add (local.get $offsets) (i32.shl (local.get $t) (i32.const 2)))))
        (block $terms2 (loop $term2
          (br_if $terms2 (i32.ge_s (local.get $j) (local.get $end)))
          (local.set $c (f64.convert_i32_u (i32.load (i32.add (local.get $sparse) (i32.shl (i32.add (local.get $j) (i32.const 1)) (i32.const 2))))))
          (local.set $sym (i32.add (local.get $table) (i32.shl (i32.load (i32.add (local.get $sparse) (i32.shl (local.get $j) (i32.const 2)))) (i32.const 3))))
          (local.set $cost (f64.add (local.get $cost) (f64.mul (local.get $c) (f64.load (local.get $sym)))))
          (local.set $cost2 (f64.add (local.get $cost2) (f64.mul (local.get $c) (f64.load offset=512 (local.get $sym)))))
          (local.set $j (i32.add (local.get $j) (i32.const 2)))
          (br $term2)))
        (f64.store (i32.add (local.get $next) (i32.shl (local.get $i) (i32.const 3))) (local.get $cost))
        (f64.store offset=8 (i32.add (local.get $next) (i32.shl (local.get $i) (i32.const 3))) (local.get $cost2))
        (local.set $i (i32.add (local.get $i) (i32.const 2)))
        (br $pair2)))
      (if (i32.lt_s (local.get $i) (local.get $k)) (then
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
        (f64.store (i32.add (local.get $next) (i32.shl (local.get $i) (i32.const 3))) (local.get $cost))))
      (local.set $i (i32.const 0))
      (block $histograms (loop $histogram
        (br_if $histograms (i32.eq (local.get $i) (local.get $k)))
        (local.set $cost (f64.load (i32.add (local.get $next) (i32.shl (local.get $i) (i32.const 3)))))
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
  ;; Component c's blocks are at $coeffBase + c * 131072 (16-bit) or c * 262144 ($wide: 32-bit, an LF frame's), its counts
  ;; at FCOUNTS + c * 1024; the contexts go to $ctxBase (16-bit) and the values to $valueBase (16-bit, or 32-bit when
  ;; $wide). Returns the token count.
  (func (export "fill") (param $coeffBase i32) (param $ctxBase i32) (param $valueBase i32) (param $wide i32) (result i32)
    (local $bw i32) (local $bh i32) (local $numCtxs i32) (local $numDc i32) (local $bucketed i32) (local $counted i32)
    (local $grey i32) (local $by i32) (local $bx i32) (local $i i32) (local $c i32) (local $hs i32) (local $vs i32)
    (local $sbx i32) (local $sby i32) (local $width i32) (local $block i32) (local $coeffs i32) (local $count i32)
    (local $k i32) (local $row i32) (local $predicted i32) (local $bucket i32) (local $blockCtx i32)
    (local $capped i32) (local $n i32) (local $offset i32) (local $order i32) (local $prev i32) (local $left i32)
    (local $coeff i32) (local $zeroBase i32) (local $has i32) (local $value i32)
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
            (local.set $coeffs (i32.add (i32.add (local.get $coeffBase) (i32.shl (i32.mul (local.get $c) (i32.const 131072)) (local.get $wide)))
              (i32.shl (local.get $block) (i32.add (i32.const 7) (local.get $wide)))))
            (local.set $count (i32.const 0))
            (if (local.get $has) (then
              (if (local.get $counted)
                (then (local.set $count (i32.load8_u (i32.add (i32.add (global.get $FCOUNTS) (i32.mul (local.get $c) (i32.const 1024))) (local.get $block)))))
                (else
                  (local.set $k (i32.const 1))
                  (block $counting (loop $kLoop
                    (br_if $counting (i32.eq (local.get $k) (i32.const 64)))
                    (local.set $count (i32.add (local.get $count) (i32.ne (if (result i32) (local.get $wide) (then (i32.load (i32.add (local.get $coeffs) (i32.shl (local.get $k) (i32.const 2))))) (else (i32.load16_s (i32.add (local.get $coeffs) (i32.shl (local.get $k) (i32.const 1)))))) (i32.const 0))))
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
            (i32.store16 (i32.add (local.get $ctxBase) (i32.shl (local.get $n) (i32.const 1)))
              (i32.add (i32.mul (select (local.get $capped) (i32.add (i32.const 4) (i32.shr_s (local.get $capped) (i32.const 1))) (i32.lt_s (local.get $capped) (i32.const 8))) (local.get $numCtxs)) (local.get $blockCtx)))
            (if (local.get $wide)
              (then (i32.store (i32.add (local.get $valueBase) (i32.shl (local.get $n) (i32.const 2))) (local.get $count)))
              (else (i32.store16 (i32.add (local.get $valueBase) (i32.shl (local.get $n) (i32.const 1))) (local.get $count))))
            (local.set $n (i32.add (local.get $n) (i32.const 1)))
            (local.set $offset (i32.add (local.get $zeroBase) (i32.mul (i32.const 458) (local.get $blockCtx))))
            (local.set $order (i32.add (global.get $FORDER) (i32.shl (local.get $c) (i32.const 8))))
            (local.set $prev (select (i32.const 0) (i32.const 1) (i32.gt_s (local.get $count) (i32.const 4))))
            (local.set $left (local.get $count))
            (local.set $k (i32.const 1))
            (block $coefficients (loop $coefficient
              (br_if $coefficients (i32.or (i32.eq (local.get $k) (i32.const 64)) (i32.eqz (local.get $left))))
              (local.set $coeff (if (result i32) (local.get $wide) (then (i32.load (i32.add (local.get $coeffs) (i32.shl (i32.load (i32.add (local.get $order) (i32.shl (local.get $k) (i32.const 2)))) (i32.const 2))))) (else (i32.load16_s (i32.add (local.get $coeffs) (i32.shl (i32.load (i32.add (local.get $order) (i32.shl (local.get $k) (i32.const 2)))) (i32.const 1)))))))
              (i32.store16 (i32.add (local.get $ctxBase) (i32.shl (local.get $n) (i32.const 1)))
                (i32.add (i32.add (local.get $offset) (i32.load (i32.add (global.get $FDENSITY) (i32.shl (i32.or (i32.shl (local.get $left) (i32.const 6)) (local.get $k)) (i32.const 2))))) (local.get $prev)))
              (local.set $value (select (i32.shl (local.get $coeff) (i32.const 1)) (i32.sub (i32.mul (i32.sub (i32.const 0) (local.get $coeff)) (i32.const 2)) (i32.const 1)) (i32.ge_s (local.get $coeff) (i32.const 0))))
              (if (local.get $wide)
                (then (i32.store (i32.add (local.get $valueBase) (i32.shl (local.get $n) (i32.const 2))) (local.get $value)))
                (else (i32.store16 (i32.add (local.get $valueBase) (i32.shl (local.get $n) (i32.const 1))) (local.get $value))))
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
  (global $dfill (mut i32) (i32.const 0))

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
        (if (i32.eq (local.get $next) (i32.const 255)) (then (global.set $dfill (i32.const 1)) (local.set $r (i32.add (local.get $r) (i32.const 1))) (br $bytes)))
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
      (global.set $dfill (i32.const 1))
      (global.set $dpos (i32.add (global.get $dpos) (i32.const 1)))
      (br $fill)))
    (i32.const 1))

  ;; Starts a scan at DIN.
  (func (export "decodeStart")
    (global.set $dpos (global.get $DIN)) (global.set $dunit (i32.const 0)) (global.set $dblock (i32.const 0)) (global.set $dzeros (i32.const 0)) (global.set $dfill (i32.const 0))
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
    (memory.fill (i32.load offset=88 (global.get $DPARAMS)) (i32.const 0) (local.get $bandBytes))
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
            (if (i32.eqz (i32.or (i32.eqz (local.get $zeroRuns)) (i32.eqz (local.get $zlist)))) (then
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
    (i32.store offset=48 (global.get $DPARAMS) (global.get $dfill))
    (return (i32.const 1)))
    (i32.const 0))

  ;; Packs one component's decoded band ($rows block rows, $width active blocks per row, $stride blocks per row in $src):
  ;; copies each block's DC to $dcOut, increments $nat[0..63] for nonzero coefficients, writes per-block nonzero counts
  ;; to $countsOut, and writes nonzero positions and values to $atOut and $levelsOut. Returns total nonzeros written.
  (func (export "packBand")
    (param $src i32) (param $width i32) (param $rows i32) (param $stride i32)
    (param $dcOut i32) (param $nat i32) (param $countsOut i32) (param $atOut i32) (param $levelsOut i32)
    (result i32)
    (local $r i32) (local $x i32) (local $b i32) (local $p i32) (local $n i32)
    (local $blk i32) (local $q i32) (local $k i32) (local $endK i32) (local $val i32) (local $v v128)
    (block $rDone (loop $rLoop
      (br_if $rDone (i32.ge_u (local.get $r) (local.get $rows)))
      (local.set $x (i32.const 0))
      (block $xDone (loop $xLoop
        (br_if $xDone (i32.ge_u (local.get $x) (local.get $width)))
        (local.set $blk (i32.add (local.get $src) (i32.shl (i32.add (i32.mul (local.get $r) (local.get $stride)) (local.get $x)) (i32.const 7))))
        (i32.store16 (i32.add (local.get $dcOut) (i32.shl (i32.add (i32.mul (local.get $r) (local.get $stride)) (local.get $x)) (i32.const 1)))
          (i32.load16_s (local.get $blk)))
        (local.set $n (i32.const 0))
        (local.set $q (i32.const 0))
        (block $qDone (loop $qLoop
          (br_if $qDone (i32.eq (local.get $q) (i32.const 8)))
          (local.set $v (v128.load (i32.add (local.get $blk) (i32.shl (local.get $q) (i32.const 4)))))
          (if (v128.any_true (local.get $v)) (then
            (local.set $k (i32.shl (local.get $q) (i32.const 3)))
            (local.set $endK (i32.add (local.get $k) (i32.const 8)))
            (block $kDone (loop $kLoop
              (br_if $kDone (i32.eq (local.get $k) (local.get $endK)))
              (local.set $val (i32.load16_s (i32.add (local.get $blk) (i32.shl (local.get $k) (i32.const 1)))))
              (if (local.get $val) (then
                (i32.store (i32.add (local.get $nat) (i32.shl (local.get $k) (i32.const 2)))
                  (i32.add (i32.load (i32.add (local.get $nat) (i32.shl (local.get $k) (i32.const 2)))) (i32.const 1)))
                (i32.store8 (i32.add (local.get $atOut) (local.get $p)) (local.get $k))
                (i32.store16 (i32.add (local.get $levelsOut) (i32.shl (local.get $p) (i32.const 1))) (local.get $val))
                (local.set $p (i32.add (local.get $p) (i32.const 1)))
                (local.set $n (i32.add (local.get $n) (i32.const 1)))))
              (local.set $k (i32.add (local.get $k) (i32.const 1)))
              (br $kLoop)))))
          (local.set $q (i32.add (local.get $q) (i32.const 1)))
          (br $qLoop)))
        (i32.store8 (i32.add (local.get $countsOut) (local.get $b)) (local.get $n))
        (local.set $b (i32.add (local.get $b) (i32.const 1)))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br $xLoop)))
      (local.set $r (i32.add (local.get $r) (i32.const 1)))
      (br $rLoop)))
    (local.get $p))

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
  ;; code (768), and the configuration (10000). Returns the whole bytes written at OUT.
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
  ;; entries are listed at $CUNIQUE, the tokens of 64 or more at $CLARGE (context, value), in order (jpeg-kernels.mjs
  ;; puts both past the call's contexts, and clears them after).
  (global $CTAB i32 (i32.const 7426048))
  (func (export "countFilled") (param $n i32) (param $CUNIQUE i32) (param $CLARGE i32) (result i32)
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
            (i32.store (i32.add (local.get $CUNIQUE) (i32.shl (local.get $m) (i32.const 2))) (i32.or (i32.shl (local.get $ctx) (i32.const 6)) (local.get $value)))
            (local.set $m (i32.add (local.get $m) (i32.const 1)))))
          (i32.store (local.get $at) (i32.add (local.get $count) (i32.const 1))))
        (else
          (i32.store (i32.add (local.get $CLARGE) (i32.shl (local.get $large) (i32.const 3))) (local.get $ctx))
          (i32.store offset=4 (i32.add (local.get $CLARGE) (i32.shl (local.get $large) (i32.const 3))) (local.get $value))
          (local.set $large (i32.add (local.get $large) (i32.const 1)))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $tokens)))
    (i32.store (global.get $SCRATCH) (local.get $large))
    (local.get $m))
  ;; Clears the m touched entries.
  (func (export "countClear") (param $m i32) (param $CUNIQUE i32)
    (local $i i32)
    (block $done (loop $entries
      (br_if $done (i32.eq (local.get $i) (local.get $m)))
      (i32.store (i32.add (global.get $CTAB) (i32.shl (i32.load (i32.add (local.get $CUNIQUE) (i32.shl (local.get $i) (i32.const 2)))) (i32.const 2))) (i32.const 0))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br $entries))))

  ;; mbits's reciprocals for n histograms: ceil(2^44 / frequency), 0 for an absent token.
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
  ;; clusters is the result. $k0: the clusters already seeded (their rows, bits and terms loaded), so the loop runs in
  ;; chunks of contexts with the clusters one call gives the next.
  (func (export "seedAll") (param $n i32) (param $small i32) (param $loff i32) (param $lpairs i32) (param $tok i32)
    (param $seeds i32) (param $threshold f64) (param $runs i32) (param $offs i32) (param $assign i32) (param $k0 i32) (result i32)
    (local $r i32) (local $t i32) (local $k i32) (local $s i32) (local $c i32) (local $tk i32) (local $i i32) (local $end i32) (local $row i32)
    (local $best i32) (local $total f64) (local $bits f64) (local $ownBits f64) (local $f f64) (local $at i32)
    (local.set $k (local.get $k0))
    (block $contexts (loop $context
      (br_if $contexts (i32.eq (local.get $t) (local.get $n)))
      (i32.store (i32.add (local.get $offs) (i32.shl (local.get $t) (i32.const 2))) (local.get $r))
      (local.set $s (i32.const 0))
      (block $zeroed (loop $zero
        (br_if $zeroed (i32.eq (local.get $s) (i32.const 256)))
        (v128.store (i32.add (global.get $OWN) (local.get $s)) (v128.const i64x2 0 0))
        (local.set $s (i32.add (local.get $s) (i32.const 16)))
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
      ;; Its (symbol, count) runs for the caller, and entropyBits: the total and each population in symbol order. A zero
      ;; count adds exactly 0 to both sums (the table's entry for 0 is 0), so only the others are summed.
      (local.set $s (i32.const 0)) (local.set $total (f64.const 0)) (local.set $bits (f64.const 0))
      (block $entropied (loop $entropy
        (br_if $entropied (i32.eq (local.get $s) (i32.const 256)))
        (local.set $c (i32.load (i32.add (global.get $OWN) (local.get $s))))
        (if (local.get $c) (then
          (i32.store (i32.add (local.get $runs) (i32.shl (local.get $r) (i32.const 3))) (i32.shr_u (local.get $s) (i32.const 2)))
          (i32.store offset=4 (i32.add (local.get $runs) (i32.shl (local.get $r) (i32.const 3))) (local.get $c))
          (local.set $r (i32.add (local.get $r) (i32.const 1)))
          (local.set $f (f64.convert_i32_u (local.get $c)))
          (local.set $total (f64.add (local.get $total) (local.get $f)))
          (local.set $bits (f64.sub (local.get $bits) (if (result f64) (f64.lt (local.get $f) (f64.const 65536)) (then (f64.load (i32.shl (i32.trunc_f64_u (local.get $f)) (i32.const 3)))) (else (call $pop (local.get $f))))))))
        (local.set $s (i32.add (local.get $s) (i32.const 4)))
        (br $entropy)))
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
            (v128.store (i32.add (local.get $row) (local.get $s)) (v128.load (i32.add (global.get $OWN) (local.get $s))))
            (local.set $s (i32.add (local.get $s) (i32.const 16)))
            (br $copy)))
          (f64.store (i32.add (global.get $BITS) (i32.shl (local.get $k) (i32.const 3))) (local.get $ownBits))
          (drop (call $terms (local.get $k)))
          (i32.store (i32.add (local.get $assign) (i32.shl (local.get $t) (i32.const 2))) (local.get $k))
          (local.set $k (i32.add (local.get $k) (i32.const 1))))
        (else
          ;; A merge: the row gains OWN; termsGained also returns entropyBits, without another population pass.
          (f64.store (i32.add (global.get $BITS) (i32.shl (local.get $best) (i32.const 3))) (call $termsGained (local.get $best)))
          (i32.store (i32.add (local.get $assign) (i32.shl (local.get $t) (i32.const 2))) (local.get $best))))
      (local.set $t (i32.add (local.get $t) (i32.const 1)))
      (br $context)))
    (i32.store (i32.add (local.get $offs) (i32.shl (local.get $n) (i32.const 2))) (local.get $r))
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
  ;; entropy.mjs split: the tokens of the values ($values, $weights, $count of them) under the configuration at $cand (split,
  ;; msb, lsb, splitToken) into $slots tokens at $tokens (zeroed first; a token past them only counts toward $splitLast,
  ;; the largest token), and their raw bits, summed in value order.
  (global $splitLast (mut i32) (i32.const 0))
  (func $split (param $values i32) (param $weights i32) (param $count i32) (param $cand i32) (param $tokens i32) (param $slots i32) (result f64)
    (local $i i32) (local $v i32) (local $w i32) (local $token i32) (local $n i32) (local $m i32) (local $split i32) (local $msb i32)
    (local $lsb i32) (local $splitToken i32) (local $both i32) (local $raw f64) (local $last i32)
    (local.set $split (i32.load (local.get $cand))) (local.set $msb (i32.load offset=4 (local.get $cand)))
    (local.set $lsb (i32.load offset=8 (local.get $cand))) (local.set $splitToken (i32.load offset=12 (local.get $cand)))
    (local.set $both (i32.add (local.get $msb) (local.get $lsb)))
    (block $cleared (loop $clear (br_if $cleared (i32.eq (local.get $i) (i32.shl (local.get $slots) (i32.const 2))))
      (i32.store (i32.add (local.get $tokens) (local.get $i)) (i32.const 0)) (local.set $i (i32.add (local.get $i) (i32.const 4))) (br $clear)))
    (local.set $i (i32.const 0))
    (block $done (loop $value (br_if $done (i32.eq (local.get $i) (local.get $count)))
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
      (if (i32.lt_u (local.get $token) (local.get $slots)) (then
        (i32.store (i32.add (local.get $tokens) (i32.shl (local.get $token) (i32.const 2)))
          (i32.add (i32.load (i32.add (local.get $tokens) (i32.shl (local.get $token) (i32.const 2)))) (local.get $w)))))
      (if (i32.gt_u (local.get $token) (local.get $last)) (then (local.set $last (local.get $token))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $value)))
    (global.set $splitLast (local.get $last))
    (local.get $raw))
  ;; ans.mjs histogramCost's price of $slots tokens at $tokens (u32) under (split, msb): normalise to 4,096 into $counts
  ;; (u16, $slots of them), writeUintConfig's bits, distributionLength(counts, true) and expectedDataBits from $symbolBits,
  ;; summed as (header + distribution) + data. priceConfigs and priceEvery price through it.
  (func $histCost (param $tokens i32) (param $slots i32) (param $split i32) (param $msb i32) (param $counts i32) (param $symbolBits i32) (result f64)
    (local $i i32) (local $w i32) (local $m i32) (local $total f64) (local $last i32) (local $sum i32) (local $f f64) (local $x f64)
    (local $r f64) (local $dir i32) (local $chosen i32) (local $error f64) (local $cand2 f64) (local $length i32) (local $used i32)
    (local $first i32) (local $second i32) (local $omit i32) (local $bits f64) (local $omitLog i32) (local $own i32) (local $end i32)
    (local $data f64) (local $header f64) (local $logAlphabet i32)
      ;; normalise.
    (local.set $total (f64.const 0)) (local.set $last (i32.const 0)) (local.set $i (i32.const 0))
    (block $totalled (loop $tot (br_if $totalled (i32.eq (local.get $i) (local.get $slots)))
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
    (block $expected (loop $exp (br_if $expected (i32.eq (local.get $i) (local.get $slots)))
      (local.set $w (i32.load (i32.add (local.get $tokens) (i32.shl (local.get $i) (i32.const 2)))))
      (if (local.get $w) (then
        (local.set $data (f64.add (local.get $data) (f64.mul (f64.convert_i32_u (local.get $w))
          (f64.load (i32.add (local.get $symbolBits) (i32.shl (i32.load16_u (i32.add (local.get $counts) (i32.shl (local.get $i) (i32.const 1)))) (i32.const 3)))))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $exp)))
    (f64.add (f64.add (local.get $header) (local.get $bits)) (local.get $data)))
  (func (export "priceConfigs") (param $values i32) (param $weights i32) (param $count i32) (param $cands i32) (param $c i32)
    (param $symbolBits i32) (param $logs i32) (param $scratch i32) (param $best i32) (param $out i32) (result i32)
    (local $k i32) (local $cand i32) (local $split i32) (local $msb i32) (local $raw f64) (local $tokens i32) (local $counts i32)
    (local $cost f64) (local $bestCost f64) (local $bestIndex i32) (local $ci i32)
    (global.set $logLengths (local.get $logs))
    (local.set $tokens (local.get $scratch)) (local.set $counts (i32.add (local.get $scratch) (i32.const 512)))
    (local.set $bestCost (f64.const inf)) (local.set $bestIndex (i32.const -1))
    (block $candidates (loop $candidate
      (br_if $candidates (i32.eq (local.get $k) (local.get $c)))
      (local.set $cand (i32.add (local.get $cands) (i32.shl (local.get $k) (i32.const 4))))
      (local.set $split (i32.load (local.get $cand))) (local.set $msb (i32.load offset=4 (local.get $cand)))
      (local.set $raw (call $split (local.get $values) (local.get $weights) (local.get $count) (local.get $cand) (local.get $tokens) (i32.const 128)))
      (local.set $cost (f64.add (local.get $raw) (call $histCost (local.get $tokens) (i32.const 128) (local.get $split) (local.get $msb) (local.get $counts) (local.get $symbolBits))))
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

  ;; entropy.mjs histogramKey of $length tokens at $tokens with raw bits $raw: the same 64-bit key as a double.
  (func $histKey (param $tokens i32) (param $length i32) (param $raw f64) (result f64)
    (local $a i32) (local $b i32) (local $i i32) (local $t i32)
    (local.set $a (i32.wrap_i64 (i64.trunc_f64_u (local.get $raw)))) (local.set $b (local.get $length))
    (block $done (loop $next (br_if $done (i32.eq (local.get $i) (local.get $length)))
      (local.set $t (i32.load (i32.add (local.get $tokens) (i32.shl (local.get $i) (i32.const 2)))))
      (local.set $a (i32.mul (i32.xor (local.get $a) (local.get $t)) (i32.const -1640531535)))
      (local.set $b (i32.xor (i32.mul (i32.add (local.get $b) (local.get $t)) (i32.const -2048144777)) (i32.shr_u (local.get $a) (i32.const 15))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $next)))
    (f64.add (f64.mul (f64.convert_i32_u (local.get $a)) (f64.const 4294967296)) (f64.convert_i32_u (local.get $b))))
  ;; entropy.mjs entropyBits of $length tokens at $tokens.
  (func $entropy (param $tokens i32) (param $length i32) (result f64)
    (local $i i32) (local $f f64) (local $total f64) (local $bits f64)
    (block $done (loop $next (br_if $done (i32.eq (local.get $i) (local.get $length)))
      (local.set $f (f64.convert_i32_u (i32.load (i32.add (local.get $tokens) (i32.shl (local.get $i) (i32.const 2))))))
      (if (f64.ne (local.get $f) (f64.const 0)) (then
        (local.set $total (f64.add (local.get $total) (local.get $f)))
        (local.set $bits (f64.sub (local.get $bits) (call $pop (local.get $f))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $next)))
    (f64.add (local.get $bits) (call $pop (local.get $total))))
  ;; clusterTokenCounts' configuration choice with every split (entropy.mjs everyConfig): each of the $c candidates at
  ;; $cands priced as priceConfigs prices them; each of the $mc further splits at $more (one alone among those whose split
  ;; token is above the $largest value), its tokens in 256 slots, dropped where a token passes 255 or its key repeats an
  ;; earlier one's, ranked by raw bits plus entropy; the six lowest (the first of equals first) priced; of all priced, the
  ;; four cheapest (the first of equals first), and the cheapest of the $c if not among them. Each finalist at $out + 24 f:
  ;; its tokens' address and count, its split (k below $c, else $c plus its index among the further ones), its raw bits.
  ;; The count of finalists is the result. $work holds the tables below, whose size the caller reserves.
  (func (export "priceEvery") (param $values i32) (param $weights i32) (param $count i32) (param $cands i32) (param $c i32)
    (param $more i32) (param $mc i32) (param $largest i32) (param $symbolBits i32) (param $logs i32) (param $work i32) (param $out i32) (result i32)
    (local $tokA i32) (local $costA i32) (local $keys i32) (local $counts i32) (local $tokM i32) (local $idM i32) (local $lenM i32)
    (local $rawM i32) (local $roughM i32) (local $pid i32) (local $pcost i32) (local $taken i32)
    (local $k i32) (local $j i32) (local $i i32) (local $t i32) (local $cand i32) (local $tokens i32) (local $raw f64) (local $cost f64)
    (local $best i32) (local $bestCost f64) (local $nk i32) (local $nm i32) (local $np i32) (local $last i32) (local $key f64)
    (local $direct i32) (local $dup i32) (local $sel i32) (local $min f64) (local $f i32) (local $id i32) (local $at i32)
    (global.set $logLengths (local.get $logs))
    (local.set $tokA (local.get $work))
    (local.set $costA (i32.add (local.get $tokA) (i32.shl (local.get $c) (i32.const 9))))
    (local.set $keys (i32.add (local.get $costA) (i32.shl (local.get $c) (i32.const 4))))
    (local.set $counts (i32.add (local.get $keys) (i32.shl (i32.add (local.get $c) (local.get $mc)) (i32.const 3))))
    (local.set $tokM (i32.add (local.get $counts) (i32.const 512)))
    (local.set $idM (i32.add (local.get $tokM) (i32.shl (local.get $mc) (i32.const 10))))
    (local.set $lenM (i32.add (local.get $idM) (i32.shl (local.get $mc) (i32.const 2))))
    (local.set $rawM (i32.add (local.get $lenM) (i32.shl (local.get $mc) (i32.const 2))))
    (local.set $roughM (i32.add (local.get $rawM) (i32.shl (local.get $mc) (i32.const 3))))
    (local.set $pid (i32.add (local.get $roughM) (i32.shl (local.get $mc) (i32.const 3))))
    (local.set $pcost (i32.add (local.get $pid) (i32.shl (i32.add (local.get $c) (i32.const 6)) (i32.const 2))))
    (local.set $taken (i32.add (local.get $pcost) (i32.shl (i32.add (local.get $c) (i32.const 6)) (i32.const 3))))
    ;; The listed splits: cost and raw bits (costA: cost, then raw, 16 bytes a split), the first least, their keys.
    (local.set $bestCost (f64.const inf)) (local.set $best (i32.const -1))
    (block $listed (loop $list (br_if $listed (i32.eq (local.get $k) (local.get $c)))
      (local.set $cand (i32.add (local.get $cands) (i32.shl (local.get $k) (i32.const 4))))
      (local.set $tokens (i32.add (local.get $tokA) (i32.shl (local.get $k) (i32.const 9))))
      (local.set $raw (call $split (local.get $values) (local.get $weights) (local.get $count) (local.get $cand) (local.get $tokens) (i32.const 128)))
      (local.set $cost (f64.add (local.get $raw) (call $histCost (local.get $tokens) (i32.const 128) (i32.load (local.get $cand)) (i32.load offset=4 (local.get $cand)) (local.get $counts) (local.get $symbolBits))))
      (f64.store (i32.add (local.get $costA) (i32.shl (local.get $k) (i32.const 4))) (local.get $cost))
      (f64.store offset=8 (i32.add (local.get $costA) (i32.shl (local.get $k) (i32.const 4))) (local.get $raw))
      (if (f64.lt (local.get $cost) (local.get $bestCost)) (then (local.set $bestCost (local.get $cost)) (local.set $best (local.get $k))))
      (local.set $last (i32.const 128))
      (block $found (loop $back (br_if $found (i32.eqz (local.get $last)))
        (br_if $found (i32.load (i32.add (local.get $tokens) (i32.shl (i32.sub (local.get $last) (i32.const 1)) (i32.const 2)))))
        (local.set $last (i32.sub (local.get $last) (i32.const 1))) (br $back)))
      (f64.store (i32.add (local.get $keys) (i32.shl (local.get $nk) (i32.const 3))) (call $histKey (local.get $tokens) (local.get $last) (local.get $raw)))
      (local.set $nk (i32.add (local.get $nk) (i32.const 1)))
      (local.set $k (i32.add (local.get $k) (i32.const 1))) (br $list)))
    ;; The further splits, each distinct histogram once.
    (block $mored (loop $further (br_if $mored (i32.eq (local.get $j) (local.get $mc)))
      (local.set $cand (i32.add (local.get $more) (i32.shl (local.get $j) (i32.const 4))))
      (block $skip
        (if (i32.gt_u (i32.load offset=12 (local.get $cand)) (local.get $largest)) (then
          (br_if $skip (local.get $direct)) (local.set $direct (i32.const 1))))
        (local.set $tokens (i32.add (local.get $tokM) (i32.shl (local.get $nm) (i32.const 10))))
        (local.set $raw (call $split (local.get $values) (local.get $weights) (local.get $count) (local.get $cand) (local.get $tokens) (i32.const 256)))
        (local.set $last (global.get $splitLast))
        (br_if $skip (i32.gt_u (local.get $last) (i32.const 255)))
        (local.set $key (call $histKey (local.get $tokens) (i32.add (local.get $last) (i32.const 1)) (local.get $raw)))
        (local.set $i (i32.const 0)) (local.set $dup (i32.const 0))
        (block $checked (loop $check (br_if $checked (i32.eq (local.get $i) (local.get $nk)))
          (if (f64.eq (f64.load (i32.add (local.get $keys) (i32.shl (local.get $i) (i32.const 3)))) (local.get $key)) (then (local.set $dup (i32.const 1)) (br $checked)))
          (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $check)))
        (br_if $skip (local.get $dup))
        (f64.store (i32.add (local.get $keys) (i32.shl (local.get $nk) (i32.const 3))) (local.get $key))
        (local.set $nk (i32.add (local.get $nk) (i32.const 1)))
        (i32.store (i32.add (local.get $idM) (i32.shl (local.get $nm) (i32.const 2))) (local.get $j))
        (i32.store (i32.add (local.get $lenM) (i32.shl (local.get $nm) (i32.const 2))) (i32.add (local.get $last) (i32.const 1)))
        (f64.store (i32.add (local.get $rawM) (i32.shl (local.get $nm) (i32.const 3))) (local.get $raw))
        (f64.store (i32.add (local.get $roughM) (i32.shl (local.get $nm) (i32.const 3)))
          (f64.add (local.get $raw) (call $entropy (local.get $tokens) (i32.add (local.get $last) (i32.const 1)))))
        (local.set $nm (i32.add (local.get $nm) (i32.const 1))))
      (local.set $j (i32.add (local.get $j) (i32.const 1))) (br $further)))
    ;; The priced list: the listed splits, then the six lowest-ranked further ones, each priced.
    (local.set $k (i32.const 0))
    (block $put (loop $each (br_if $put (i32.eq (local.get $k) (local.get $c)))
      (i32.store (i32.add (local.get $pid) (i32.shl (local.get $k) (i32.const 2))) (local.get $k))
      (f64.store (i32.add (local.get $pcost) (i32.shl (local.get $k) (i32.const 3))) (f64.load (i32.add (local.get $costA) (i32.shl (local.get $k) (i32.const 4)))))
      (local.set $k (i32.add (local.get $k) (i32.const 1))) (br $each)))
    (local.set $np (local.get $c))
    (local.set $i (i32.const 0))
    (block $clean (loop $zero (br_if $clean (i32.eq (local.get $i) (i32.add (local.get $mc) (i32.add (local.get $c) (i32.const 6)))))
      (i32.store8 (i32.add (local.get $taken) (local.get $i)) (i32.const 0)) (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $zero)))
    (local.set $t (i32.const 0))
    (block $ranked (loop $rank (br_if $ranked (i32.or (i32.eq (local.get $t) (i32.const 6)) (i32.eq (local.get $t) (local.get $nm))))
      (local.set $sel (i32.const -1)) (local.set $j (i32.const 0))
      (block $scanned (loop $scan (br_if $scanned (i32.eq (local.get $j) (local.get $nm)))
        (if (i32.eqz (i32.load8_u (i32.add (i32.add (local.get $taken) (i32.add (local.get $c) (i32.const 6))) (local.get $j)))) (then
          (if (i32.or (i32.lt_s (local.get $sel) (i32.const 0))
                (f64.lt (f64.load (i32.add (local.get $roughM) (i32.shl (local.get $j) (i32.const 3)))) (local.get $min))) (then
            (local.set $sel (local.get $j)) (local.set $min (f64.load (i32.add (local.get $roughM) (i32.shl (local.get $j) (i32.const 3)))))))))
        (local.set $j (i32.add (local.get $j) (i32.const 1))) (br $scan)))
      (i32.store8 (i32.add (i32.add (local.get $taken) (i32.add (local.get $c) (i32.const 6))) (local.get $sel)) (i32.const 1))
      (local.set $cand (i32.add (local.get $more) (i32.shl (i32.load (i32.add (local.get $idM) (i32.shl (local.get $sel) (i32.const 2)))) (i32.const 4))))
      (i32.store (i32.add (local.get $pid) (i32.shl (local.get $np) (i32.const 2))) (i32.add (local.get $c) (local.get $sel)))
      (f64.store (i32.add (local.get $pcost) (i32.shl (local.get $np) (i32.const 3)))
        (f64.add (f64.load (i32.add (local.get $rawM) (i32.shl (local.get $sel) (i32.const 3))))
          (call $histCost (i32.add (local.get $tokM) (i32.shl (local.get $sel) (i32.const 10))) (i32.load (i32.add (local.get $lenM) (i32.shl (local.get $sel) (i32.const 2))))
            (i32.load (local.get $cand)) (i32.load offset=4 (local.get $cand)) (local.get $counts) (local.get $symbolBits))))
      (local.set $np (i32.add (local.get $np) (i32.const 1)))
      (local.set $t (i32.add (local.get $t) (i32.const 1))) (br $rank)))
    ;; The four cheapest priced, then the cheapest listed split if not among them.
    (local.set $t (i32.const 0))
    (block $chosen (loop $choose (br_if $chosen (i32.or (i32.eq (local.get $t) (i32.const 4)) (i32.eq (local.get $t) (local.get $np))))
      (local.set $sel (i32.const -1)) (local.set $i (i32.const 0))
      (block $looked (loop $look (br_if $looked (i32.eq (local.get $i) (local.get $np)))
        (if (i32.eqz (i32.load8_u (i32.add (local.get $taken) (local.get $i)))) (then
          (if (i32.or (i32.lt_s (local.get $sel) (i32.const 0)) (f64.lt (f64.load (i32.add (local.get $pcost) (i32.shl (local.get $i) (i32.const 3)))) (local.get $min))) (then
            (local.set $sel (local.get $i)) (local.set $min (f64.load (i32.add (local.get $pcost) (i32.shl (local.get $i) (i32.const 3)))))))))
        (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $look)))
      (i32.store8 (i32.add (local.get $taken) (local.get $sel)) (i32.const 1))
      (call $finalist (local.get $out) (local.get $f) (i32.load (i32.add (local.get $pid) (i32.shl (local.get $sel) (i32.const 2)))) (local.get $c)
        (local.get $tokA) (local.get $costA) (local.get $tokM) (local.get $idM) (local.get $lenM) (local.get $rawM))
      (local.set $f (i32.add (local.get $f) (i32.const 1)))
      (local.set $t (i32.add (local.get $t) (i32.const 1))) (br $choose)))
    (if (i32.and (i32.ge_s (local.get $best) (i32.const 0)) (i32.eqz (i32.load8_u (i32.add (local.get $taken) (local.get $best))))) (then
      (call $finalist (local.get $out) (local.get $f) (local.get $best) (local.get $c)
        (local.get $tokA) (local.get $costA) (local.get $tokM) (local.get $idM) (local.get $lenM) (local.get $rawM))
      (local.set $f (i32.add (local.get $f) (i32.const 1)))))
    (local.get $f))
  ;; priceEvery's finalist f: priced entry $id (a listed split below $c, else $c plus a further histogram's place).
  (func $finalist (param $out i32) (param $f i32) (param $id i32) (param $c i32) (param $tokA i32) (param $costA i32)
    (param $tokM i32) (param $idM i32) (param $lenM i32) (param $rawM i32)
    (local $at i32) (local $j i32)
    (local.set $at (i32.add (local.get $out) (i32.mul (local.get $f) (i32.const 24))))
    (if (i32.lt_s (local.get $id) (local.get $c)) (then
      (i32.store (local.get $at) (i32.add (local.get $tokA) (i32.shl (local.get $id) (i32.const 9))))
      (i32.store offset=4 (local.get $at) (i32.const 128))
      (i32.store offset=8 (local.get $at) (local.get $id))
      (f64.store offset=16 (local.get $at) (f64.load offset=8 (i32.add (local.get $costA) (i32.shl (local.get $id) (i32.const 4))))))
    (else
      (local.set $j (i32.sub (local.get $id) (local.get $c)))
      (i32.store (local.get $at) (i32.add (local.get $tokM) (i32.shl (local.get $j) (i32.const 10))))
      (i32.store offset=4 (local.get $at) (i32.load (i32.add (local.get $lenM) (i32.shl (local.get $j) (i32.const 2)))))
      (i32.store offset=8 (local.get $at) (i32.add (local.get $c) (i32.load (i32.add (local.get $idM) (i32.shl (local.get $j) (i32.const 2))))))
      (f64.store offset=16 (local.get $at) (f64.load (i32.add (local.get $rawM) (i32.shl (local.get $j) (i32.const 3))))))))

  ;; Reduced-scale & full-scale 2D separable inverse DCT (1x1, 2x2, 4x4, 6x6, 8x8, plus rectangular Mx x My for folded
  ;; 4:2:2 chroma), DC-only SIMD block bypass, fused SIMD chroma upsampling + YCbCr/RGB/Gray -> RGBA8, and EXIF orientation.
  (func $transpose4 (param $p i32)
    (local $r0 v128) (local $r1 v128) (local $r2 v128) (local $r3 v128)
    (local $q0 v128) (local $q1 v128) (local $q2 v128) (local $q3 v128)
    (local.set $r0 (v128.load (local.get $p)))
    (local.set $r1 (v128.load offset=16 (local.get $p)))
    (local.set $r2 (v128.load offset=32 (local.get $p)))
    (local.set $r3 (v128.load offset=48 (local.get $p)))
    (local.set $q0 (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23 (local.get $r0) (local.get $r1)))
    (local.set $q1 (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31 (local.get $r0) (local.get $r1)))
    (local.set $q2 (i8x16.shuffle 0 1 2 3 16 17 18 19 4 5 6 7 20 21 22 23 (local.get $r2) (local.get $r3)))
    (local.set $q3 (i8x16.shuffle 8 9 10 11 24 25 26 27 12 13 14 15 28 29 30 31 (local.get $r2) (local.get $r3)))
    (v128.store (local.get $p) (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23 (local.get $q0) (local.get $q2)))
    (v128.store offset=16 (local.get $p) (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31 (local.get $q0) (local.get $q2)))
    (v128.store offset=32 (local.get $p) (i8x16.shuffle 0 1 2 3 4 5 6 7 16 17 18 19 20 21 22 23 (local.get $q1) (local.get $q3)))
    (v128.store offset=48 (local.get $p) (i8x16.shuffle 8 9 10 11 12 13 14 15 24 25 26 27 28 29 30 31 (local.get $q1) (local.get $q3))))

  (func $b1d (param $m i32) (param $p i32)
    (local $v0 v128) (local $v1 v128) (local $v2 v128) (local $v3 v128)
    (local $v4 v128) (local $v5 v128) (local $v6 v128) (local $v7 v128)
    (local $t0 v128) (local $t1 v128) (local $t2 v128) (local $t3 v128)
    (local $e0 v128) (local $e1 v128) (local $e2 v128) (local $e3 v128)
    (local $o0 v128) (local $o1 v128) (local $o2 v128) (local $o3 v128)
    (local $c0 v128)
    (local.set $c0 (f32x4.splat (f32.const 0.3535533905932738)))
    (local.set $v0 (v128.load (local.get $p)))
    (if (i32.eq (local.get $m) (i32.const 1)) (then
      (v128.store (local.get $p) (f32x4.mul (local.get $v0) (local.get $c0)))
      (return)))
    (local.set $v1 (v128.load offset=16 (local.get $p)))
    (if (i32.eq (local.get $m) (i32.const 2)) (then
      (v128.store (local.get $p) (f32x4.mul (f32x4.add (local.get $v0) (local.get $v1)) (local.get $c0)))
      (v128.store offset=16 (local.get $p) (f32x4.mul (f32x4.sub (local.get $v0) (local.get $v1)) (local.get $c0)))
      (return)))
    (local.set $v2 (v128.load offset=32 (local.get $p)))
    (local.set $v3 (v128.load offset=48 (local.get $p)))
    (if (i32.eq (local.get $m) (i32.const 4)) (then
      (local.set $e0 (f32x4.mul (f32x4.add (local.get $v0) (local.get $v2)) (local.get $c0)))
      (local.set $e1 (f32x4.mul (f32x4.sub (local.get $v0) (local.get $v2)) (local.get $c0)))
      (local.set $t0 (f32x4.splat (f32.const 0.46193976625564337)))
      (local.set $t1 (f32x4.splat (f32.const 0.19134171618254492)))
      (local.set $o0 (f32x4.add (f32x4.mul (local.get $v1) (local.get $t0)) (f32x4.mul (local.get $v3) (local.get $t1))))
      (local.set $o1 (f32x4.sub (f32x4.mul (local.get $v1) (local.get $t1)) (f32x4.mul (local.get $v3) (local.get $t0))))
      (v128.store (local.get $p) (f32x4.add (local.get $e0) (local.get $o0)))
      (v128.store offset=16 (local.get $p) (f32x4.add (local.get $e1) (local.get $o1)))
      (v128.store offset=32 (local.get $p) (f32x4.sub (local.get $e1) (local.get $o1)))
      (v128.store offset=48 (local.get $p) (f32x4.sub (local.get $e0) (local.get $o0)))
      (return)))
    (local.set $v4 (v128.load offset=64 (local.get $p)))
    (local.set $v5 (v128.load offset=80 (local.get $p)))
    (if (i32.eq (local.get $m) (i32.const 6)) (then
      (local.set $t0 (f32x4.add (f32x4.mul (local.get $v0) (local.get $c0)) (f32x4.mul (local.get $v4) (f32x4.splat (f32.const 0.25)))))
      (local.set $t2 (f32x4.mul (local.get $v2) (f32x4.splat (f32.const 0.4330127018922193))))
      (local.set $e0 (f32x4.add (local.get $t0) (local.get $t2)))
      (local.set $e1 (f32x4.sub (f32x4.mul (local.get $v0) (local.get $c0)) (f32x4.mul (local.get $v4) (f32x4.splat (f32.const 0.5)))))
      (local.set $e2 (f32x4.sub (local.get $t0) (local.get $t2)))
      (local.set $t1 (f32x4.splat (f32.const 0.48296291314453416)))
      (local.set $t3 (f32x4.splat (f32.const 0.12940952255126037)))
      (local.set $o0 (f32x4.add (f32x4.add (f32x4.mul (local.get $v1) (local.get $t1)) (f32x4.mul (local.get $v3) (local.get $c0))) (f32x4.mul (local.get $v5) (local.get $t3))))
      (local.set $o1 (f32x4.mul (f32x4.sub (f32x4.sub (local.get $v1) (local.get $v3)) (local.get $v5)) (local.get $c0)))
      (local.set $o2 (f32x4.add (f32x4.sub (f32x4.mul (local.get $v1) (local.get $t3)) (f32x4.mul (local.get $v3) (local.get $c0))) (f32x4.mul (local.get $v5) (local.get $t1))))
      (v128.store (local.get $p) (f32x4.add (local.get $e0) (local.get $o0)))
      (v128.store offset=16 (local.get $p) (f32x4.add (local.get $e1) (local.get $o1)))
      (v128.store offset=32 (local.get $p) (f32x4.add (local.get $e2) (local.get $o2)))
      (v128.store offset=48 (local.get $p) (f32x4.sub (local.get $e2) (local.get $o2)))
      (v128.store offset=64 (local.get $p) (f32x4.sub (local.get $e1) (local.get $o1)))
      (v128.store offset=80 (local.get $p) (f32x4.sub (local.get $e0) (local.get $o0)))
      (return)))
    (local.set $v6 (v128.load offset=96 (local.get $p)))
    (local.set $v7 (v128.load offset=112 (local.get $p)))
    (local.set $t0 (f32x4.mul (f32x4.add (local.get $v0) (local.get $v4)) (local.get $c0)))
    (local.set $t1 (f32x4.mul (f32x4.sub (local.get $v0) (local.get $v4)) (local.get $c0)))
    (local.set $t2 (f32x4.add (f32x4.mul (local.get $v2) (f32x4.splat (f32.const 0.46193976625564337)))
      (f32x4.mul (local.get $v6) (f32x4.splat (f32.const 0.19134171618254492)))))
    (local.set $t3 (f32x4.sub (f32x4.mul (local.get $v2) (f32x4.splat (f32.const 0.19134171618254492)))
      (f32x4.mul (local.get $v6) (f32x4.splat (f32.const 0.46193976625564337)))))
    (local.set $e0 (f32x4.add (local.get $t0) (local.get $t2)))
    (local.set $e3 (f32x4.sub (local.get $t0) (local.get $t2)))
    (local.set $e1 (f32x4.add (local.get $t1) (local.get $t3)))
    (local.set $e2 (f32x4.sub (local.get $t1) (local.get $t3)))
    (local.set $t0 (f32x4.splat (f32.const 0.4903926402016152)))
    (local.set $t1 (f32x4.splat (f32.const 0.4157348061512726)))
    (local.set $t2 (f32x4.splat (f32.const 0.27778511650980114)))
    (local.set $t3 (f32x4.splat (f32.const 0.09754516100806417)))
    (local.set $o0 (f32x4.add
      (f32x4.add (f32x4.mul (local.get $v1) (local.get $t0)) (f32x4.mul (local.get $v3) (local.get $t1)))
      (f32x4.add (f32x4.mul (local.get $v5) (local.get $t2)) (f32x4.mul (local.get $v7) (local.get $t3)))))
    (local.set $o1 (f32x4.sub
      (f32x4.sub (f32x4.mul (local.get $v1) (local.get $t1)) (f32x4.mul (local.get $v3) (local.get $t3)))
      (f32x4.add (f32x4.mul (local.get $v5) (local.get $t0)) (f32x4.mul (local.get $v7) (local.get $t2)))))
    (local.set $o2 (f32x4.add
      (f32x4.sub (f32x4.mul (local.get $v1) (local.get $t2)) (f32x4.mul (local.get $v3) (local.get $t0)))
      (f32x4.add (f32x4.mul (local.get $v5) (local.get $t3)) (f32x4.mul (local.get $v7) (local.get $t1)))))
    (local.set $o3 (f32x4.sub
      (f32x4.add (f32x4.sub (f32x4.mul (local.get $v1) (local.get $t3)) (f32x4.mul (local.get $v3) (local.get $t2)))
        (f32x4.mul (local.get $v5) (local.get $t1)))
      (f32x4.mul (local.get $v7) (local.get $t0))))
    (v128.store (local.get $p) (f32x4.add (local.get $e0) (local.get $o0)))
    (v128.store offset=16 (local.get $p) (f32x4.add (local.get $e1) (local.get $o1)))
    (v128.store offset=32 (local.get $p) (f32x4.add (local.get $e2) (local.get $o2)))
    (v128.store offset=48 (local.get $p) (f32x4.add (local.get $e3) (local.get $o3)))
    (v128.store offset=64 (local.get $p) (f32x4.sub (local.get $e3) (local.get $o3)))
    (v128.store offset=80 (local.get $p) (f32x4.sub (local.get $e2) (local.get $o2)))
    (v128.store offset=96 (local.get $p) (f32x4.sub (local.get $e1) (local.get $o1)))
    (v128.store offset=112 (local.get $p) (f32x4.sub (local.get $e0) (local.get $o0))))

  (func $storeRowSlice (param $rBase i32) (param $mx i32) (param $dstRow i32)
    (if (i32.eq (local.get $mx) (i32.const 8)) (then
      (v128.store (local.get $dstRow) (v128.load (local.get $rBase)))
      (v128.store offset=16 (local.get $dstRow) (v128.load offset=64 (local.get $rBase)))
      (return)))
    (if (i32.eq (local.get $mx) (i32.const 4)) (then
      (v128.store (local.get $dstRow) (v128.load (local.get $rBase)))
      (return)))
    (if (i32.eq (local.get $mx) (i32.const 6)) (then
      (v128.store (local.get $dstRow) (v128.load (local.get $rBase)))
      (v128.store64_lane 0 (i32.add (local.get $dstRow) (i32.const 16)) (v128.load offset=64 (local.get $rBase)))
      (return)))
    (if (i32.eq (local.get $mx) (i32.const 2)) (then
      (v128.store64_lane 0 (local.get $dstRow) (v128.load (local.get $rBase)))
      (return)))
    (v128.store32_lane 0 (local.get $dstRow) (v128.load (local.get $rBase))))

  (func $storeConstVec (param $vec v128) (param $mx i32) (param $dstRow i32)
    (if (i32.eq (local.get $mx) (i32.const 8)) (then
      (v128.store (local.get $dstRow) (local.get $vec))
      (v128.store offset=16 (local.get $dstRow) (local.get $vec))
      (return)))
    (if (i32.eq (local.get $mx) (i32.const 4)) (then
      (v128.store (local.get $dstRow) (local.get $vec))
      (return)))
    (if (i32.eq (local.get $mx) (i32.const 6)) (then
      (v128.store (local.get $dstRow) (local.get $vec))
      (v128.store64_lane 0 (i32.add (local.get $dstRow) (i32.const 16)) (local.get $vec))
      (return)))
    (if (i32.eq (local.get $mx) (i32.const 2)) (then
      (v128.store64_lane 0 (local.get $dstRow) (local.get $vec))
      (return)))
    (v128.store32_lane 0 (local.get $dstRow) (local.get $vec)))

  (func (export "idctPlane") (param $coeffs i32) (param $quant i32) (param $blocksX i32) (param $blocksY i32)
      (param $srcStride i32) (param $mx i32) (param $my i32) (param $dst i32) (param $dstStride i32) (param $bias f32)
    (local $bx i32) (local $by i32) (local $b i32) (local $v i32) (local $y0 i32) (local $dy i32) (local $rows i32)
    (local $x i32) (local $c0 i32) (local $c1 i32) (local $r i32) (local $bv v128) (local $q0 f32)
    (local $acOr v128) (local $dcVec v128) (local $z v128)
    (local $lo f32) (local $hi f32) (local $lov v128) (local $hiv v128)
    (local.set $c0 (i32.const 592640))
    (local.set $c1 (i32.const 592768))
    (local.set $r  (i32.const 592896))
    (local.set $lo (f32.sub (local.get $bias) (f32.const 128)))
    (local.set $hi (f32.add (local.get $bias) (f32.const 127)))
    (local.set $bv (f32x4.splat (local.get $bias)))
    (local.set $lov (f32x4.splat (local.get $lo)))
    (local.set $hiv (f32x4.splat (local.get $hi)))
    (local.set $z  (v128.const i64x2 0 0))
    (local.set $q0 (f32.mul (f32.load (local.get $quant)) (f32.const 0.125)))
    (block $byDone (loop $byLoop
      (br_if $byDone (i32.ge_u (local.get $by) (local.get $blocksY)))
      (local.set $bx (i32.const 0))
      (block $bxDone (loop $bxLoop
        (br_if $bxDone (i32.ge_u (local.get $bx) (local.get $blocksX)))
        (local.set $b (i32.add (local.get $coeffs) (i32.shl (i32.add (i32.mul (local.get $by) (local.get $srcStride)) (local.get $bx)) (i32.const 7))))
        (if (i32.eq (i32.or (local.get $mx) (local.get $my)) (i32.const 1))
          (then
            (f32.store (i32.add (local.get $dst) (i32.shl (i32.add (i32.mul (local.get $by) (local.get $dstStride)) (local.get $bx)) (i32.const 2)))
              (f32.nearest (f32.min (local.get $hi) (f32.max (local.get $lo)
                (f32.add (f32.mul (f32.convert_i32_s (i32.load16_s (local.get $b))) (local.get $q0)) (local.get $bias)))))))
          (else
            ;; Check in SIMD whether all AC coefficients in rows 0..my-1 are zero (true on ~45% of photo blocks!)
            (local.set $acOr (i16x8.replace_lane 0 (v128.load (local.get $b)) (i32.const 0)))
            (local.set $v (i32.const 1))
            (block $acChkDone (loop $acChkLoop
              (br_if $acChkDone (i32.ge_u (local.get $v) (local.get $my)))
              (local.set $acOr (v128.or (local.get $acOr) (v128.load (i32.add (local.get $b) (i32.shl (local.get $v) (i32.const 4))))))
              (local.set $v (i32.add (local.get $v) (i32.const 1)))
              (br $acChkLoop)))
            (if (i32.eqz (v128.any_true (local.get $acOr)))
              (then
                (local.set $dcVec (f32x4.splat (f32.nearest (f32.min (local.get $hi) (f32.max (local.get $lo)
                  (f32.add (f32.mul (f32.convert_i32_s (i32.load16_s (local.get $b))) (local.get $q0)) (local.get $bias)))))))
                (local.set $dy (i32.const 0))
                (block $dcFillDone (loop $dcFillLoop
                  (br_if $dcFillDone (i32.ge_u (local.get $dy) (local.get $my)))
                  (call $storeConstVec (local.get $dcVec) (local.get $mx)
                    (i32.add (local.get $dst) (i32.shl
                      (i32.add (i32.mul (i32.add (i32.mul (local.get $by) (local.get $my)) (local.get $dy)) (local.get $dstStride))
                        (i32.mul (local.get $bx) (local.get $mx))) (i32.const 2))))
                  (local.set $dy (i32.add (local.get $dy) (i32.const 1)))
                  (br $dcFillLoop))))
              (else
                ;; Clear only the 2 tail rows of $c0/$c1 when my is not a multiple of 4 (1, 2, or 6)
                (if (i32.and (local.get $my) (i32.const 3)) (then
                  (v128.store offset=16 (local.get $c0) (local.get $z))
                  (v128.store offset=32 (local.get $c0) (local.get $z))
                  (v128.store offset=48 (local.get $c0) (local.get $z))
                  (v128.store offset=96 (local.get $c0) (local.get $z))
                  (v128.store offset=112 (local.get $c0) (local.get $z))
                  (if (i32.gt_u (local.get $mx) (i32.const 4)) (then
                    (v128.store offset=16 (local.get $c1) (local.get $z))
                    (v128.store offset=32 (local.get $c1) (local.get $z))
                    (v128.store offset=48 (local.get $c1) (local.get $z))
                    (v128.store offset=96 (local.get $c1) (local.get $z))
                    (v128.store offset=112 (local.get $c1) (local.get $z))))))
                (local.set $v (i32.const 0))
                (block $v0Done (loop $v0Loop
                  (br_if $v0Done (i32.ge_u (local.get $v) (local.get $my)))
                  (v128.store (i32.add (local.get $c0) (i32.shl (local.get $v) (i32.const 4)))
                    (f32x4.mul
                      (f32x4.convert_i32x4_s (i32x4.extend_low_i16x8_s (v128.load64_zero (i32.add (local.get $b) (i32.shl (local.get $v) (i32.const 4))))))
                      (v128.load (i32.add (local.get $quant) (i32.shl (local.get $v) (i32.const 5))))))
                  (local.set $v (i32.add (local.get $v) (i32.const 1)))
                  (br $v0Loop)))
                (call $b1d (local.get $my) (local.get $c0))
                (if (i32.gt_u (local.get $mx) (i32.const 4)) (then
                  (local.set $v (i32.const 0))
                  (block $v1Done (loop $v1Loop
                    (br_if $v1Done (i32.ge_u (local.get $v) (local.get $my)))
                    (v128.store (i32.add (local.get $c1) (i32.shl (local.get $v) (i32.const 4)))
                      (f32x4.mul
                        (f32x4.convert_i32x4_s (i32x4.extend_low_i16x8_s (v128.load64_zero offset=8 (i32.add (local.get $b) (i32.shl (local.get $v) (i32.const 4))))))
                        (v128.load offset=16 (i32.add (local.get $quant) (i32.shl (local.get $v) (i32.const 5))))))
                    (local.set $v (i32.add (local.get $v) (i32.const 1)))
                    (br $v1Loop)))
                  (call $b1d (local.get $my) (local.get $c1))))
                (local.set $y0 (i32.const 0))
                (block $y0Done (loop $y0Loop
                  (br_if $y0Done (i32.ge_u (local.get $y0) (local.get $my)))
                  (memory.copy (local.get $r) (i32.add (local.get $c0) (i32.shl (local.get $y0) (i32.const 4))) (i32.const 64))
                  (call $transpose4 (local.get $r))
                  (if (i32.gt_u (local.get $mx) (i32.const 4)) (then
                    (memory.copy (i32.add (local.get $r) (i32.const 64)) (i32.add (local.get $c1) (i32.shl (local.get $y0) (i32.const 4))) (i32.const 64))
                    (call $transpose4 (i32.add (local.get $r) (i32.const 64)))))
                  (call $b1d (local.get $mx) (local.get $r))
                  (local.set $x (i32.const 0))
                  (block $biasDone (loop $biasLoop
                    (br_if $biasDone (i32.ge_u (local.get $x) (local.get $mx)))
                    (v128.store (i32.add (local.get $r) (i32.shl (local.get $x) (i32.const 4)))
                      (f32x4.nearest (f32x4.min (local.get $hiv) (f32x4.max (local.get $lov)
                        (f32x4.add (v128.load (i32.add (local.get $r) (i32.shl (local.get $x) (i32.const 4)))) (local.get $bv))))))
                    (local.set $x (i32.add (local.get $x) (i32.const 1)))
                    (br $biasLoop)))
                  (call $transpose4 (local.get $r))
                  (if (i32.gt_u (local.get $mx) (i32.const 4)) (then (call $transpose4 (i32.add (local.get $r) (i32.const 64)))))
                  (local.set $rows (i32.sub (local.get $my) (local.get $y0)))
                  (if (i32.gt_u (local.get $rows) (i32.const 4)) (then (local.set $rows (i32.const 4))))
                  (local.set $dy (i32.const 0))
                  (block $dyDone (loop $dyLoop
                    (br_if $dyDone (i32.ge_u (local.get $dy) (local.get $rows)))
                    (call $storeRowSlice
                      (i32.add (local.get $r) (i32.shl (local.get $dy) (i32.const 4)))
                      (local.get $mx)
                      (i32.add (local.get $dst) (i32.shl
                        (i32.add (i32.mul (i32.add (i32.add (i32.mul (local.get $by) (local.get $my)) (local.get $y0)) (local.get $dy)) (local.get $dstStride))
                          (i32.mul (local.get $bx) (local.get $mx))) (i32.const 2))))
                    (local.set $dy (i32.add (local.get $dy) (i32.const 1)))
                    (br $dyLoop)))
                  (local.set $y0 (i32.add (local.get $y0) (i32.const 4)))
                  (br $y0Loop)))))))
        (local.set $bx (i32.add (local.get $bx) (i32.const 1)))
        (br $bxLoop)))
      (local.set $by (i32.add (local.get $by) (i32.const 1)))
      (br $byLoop))))

  (func $packRgba4 (param $r v128) (param $g v128) (param $b v128) (result v128)
    (local $zero v128) (local $max v128) (local $ri v128) (local $gi v128) (local $bi v128)
    (local.set $zero (f32x4.splat (f32.const 0)))
    (local.set $max (f32x4.splat (f32.const 255)))
    (local.set $ri (i32x4.trunc_sat_f32x4_u (f32x4.nearest (f32x4.min (local.get $max) (f32x4.max (local.get $zero) (local.get $r))))))
    (local.set $gi (i32x4.trunc_sat_f32x4_u (f32x4.nearest (f32x4.min (local.get $max) (f32x4.max (local.get $zero) (local.get $g))))))
    (local.set $bi (i32x4.trunc_sat_f32x4_u (f32x4.nearest (f32x4.min (local.get $max) (f32x4.max (local.get $zero) (local.get $b))))))
    (v128.or
      (v128.or (local.get $ri) (i32x4.shl (local.get $gi) (i32.const 8)))
      (v128.or (i32x4.shl (local.get $bi) (i32.const 16)) (i32x4.splat (i32.const -16777216)))))

  (func $writeRgbaVec (param $dst i32) (param $rem i32) (param $px v128)
    (if (i32.ge_u (local.get $rem) (i32.const 4)) (then (v128.store (local.get $dst) (local.get $px)) (return)))
    (v128.store32_lane 0 (local.get $dst) (local.get $px))
    (if (i32.ge_u (local.get $rem) (i32.const 2)) (then (v128.store32_lane 1 (i32.add (local.get $dst) (i32.const 4)) (local.get $px))))
    (if (i32.eq (local.get $rem) (i32.const 3)) (then (v128.store32_lane 2 (i32.add (local.get $dst) (i32.const 8)) (local.get $px)))))

  (func (export "jpegRgbaRows")
      (param $yPlane i32) (param $cbPlane i32) (param $crPlane i32)
      (param $yStride i32) (param $cStride i32) (param $outW i32) (param $rows i32)
      (param $mode i32) (param $clampW i32) (param $yLocal0 i32) (param $yGlobal i32) (param $cRowBase i32)
      (param $clampH i32) (param $vScratch i32) (param $rgbaOut i32)
    (local $r i32) (local $x i32) (local $cx i32) (local $gy i32) (local $cy0 i32) (local $cy1 i32)
    (local $yRow i32) (local $cb0 i32) (local $cb1 i32) (local $cr0 i32) (local $cr1 i32) (local $dst i32)
    (local $vCb i32) (local $vCr i32) (local $cEnd i32)
    (local $yv v128) (local $cbv v128) (local $crv v128) (local $t0 v128) (local $t1 v128)
    (local $w3 v128) (local $w14 v128) (local $hBias v128) (local $hScale v128) (local $vBias v128)
    (local $kCrR v128) (local $kCbG v128) (local $kCrG v128) (local $kCbB v128)
    (local.set $w3 (f32x4.splat (f32.const 3)))
    (local.set $w14 (f32x4.splat (f32.const 0.25)))
    (local.set $hBias (if (result v128) (i32.eq (local.get $mode) (i32.const 2))
      (then (v128.const f32x4 8 7 8 7)) (else (v128.const f32x4 1 2 1 2))))
    (local.set $hScale (if (result v128) (i32.eq (local.get $mode) (i32.const 2))
      (then (f32x4.splat (f32.const 0.0625))) (else (f32x4.splat (f32.const 0.25)))))
    (local.set $kCrR (f32x4.splat (f32.const 1.402)))
    (local.set $kCbG (f32x4.splat (f32.const -0.344136286)))
    (local.set $kCrG (f32x4.splat (f32.const -0.714136286)))
    (local.set $kCbB (f32x4.splat (f32.const 1.772)))
    (local.set $vCb (local.get $vScratch))
    (local.set $vCr (i32.add (local.get $vScratch) (i32.shl (i32.add (local.get $clampW) (i32.const 16)) (i32.const 2))))
    (local.set $cEnd (i32.add (local.get $clampW) (i32.const 1)))
    (block $rDone (loop $rLoop
      (br_if $rDone (i32.ge_u (local.get $r) (local.get $rows)))
      (local.set $yRow (i32.add (local.get $yPlane) (i32.shl (i32.mul (i32.add (local.get $yLocal0) (local.get $r)) (local.get $yStride)) (i32.const 2))))
      (local.set $dst (i32.add (local.get $rgbaOut) (i32.shl (i32.mul (local.get $r) (local.get $outW)) (i32.const 2))))
      (local.set $gy (i32.add (local.get $yGlobal) (local.get $r)))

      (if (i32.or (i32.eq (local.get $mode) (i32.const 2)) (i32.eq (local.get $mode) (i32.const 3))) (then
        (if (i32.eq (local.get $mode) (i32.const 2))
          (then
            (local.set $cy0 (i32.shr_u (local.get $gy) (i32.const 1)))
            (if (i32.and (local.get $gy) (i32.const 1))
              (then
                (local.set $cy1 (i32.add (local.get $cy0) (i32.const 1)))
                (if (i32.gt_s (local.get $cy1) (local.get $clampH)) (then (local.set $cy1 (local.get $clampH)))))
              (else
                (local.set $cy1 (i32.sub (local.get $cy0) (i32.const 1)))
                (if (i32.lt_s (local.get $cy1) (i32.const 0)) (then (local.set $cy1 (i32.const 0))))))
            (local.set $cy0 (i32.sub (local.get $cy0) (local.get $cRowBase)))
            (local.set $cy1 (i32.sub (local.get $cy1) (local.get $cRowBase)))
            (local.set $cb0 (i32.add (local.get $cbPlane) (i32.shl (i32.mul (local.get $cy0) (local.get $cStride)) (i32.const 2))))
            (local.set $cb1 (i32.add (local.get $cbPlane) (i32.shl (i32.mul (local.get $cy1) (local.get $cStride)) (i32.const 2))))
            (local.set $cr0 (i32.add (local.get $crPlane) (i32.shl (i32.mul (local.get $cy0) (local.get $cStride)) (i32.const 2))))
            (local.set $cr1 (i32.add (local.get $crPlane) (i32.shl (i32.mul (local.get $cy1) (local.get $cStride)) (i32.const 2))))
            (local.set $cx (i32.const 0))
            (block $vDone (loop $vLoop
              (br_if $vDone (i32.ge_u (local.get $cx) (local.get $cEnd)))
              (v128.store offset=4 (i32.add (local.get $vCb) (i32.shl (local.get $cx) (i32.const 2)))
                (f32x4.add
                  (f32x4.mul (v128.load (i32.add (local.get $cb0) (i32.shl (local.get $cx) (i32.const 2)))) (local.get $w3))
                  (v128.load (i32.add (local.get $cb1) (i32.shl (local.get $cx) (i32.const 2))))))
              (v128.store offset=4 (i32.add (local.get $vCr) (i32.shl (local.get $cx) (i32.const 2)))
                (f32x4.add
                  (f32x4.mul (v128.load (i32.add (local.get $cr0) (i32.shl (local.get $cx) (i32.const 2)))) (local.get $w3))
                  (v128.load (i32.add (local.get $cr1) (i32.shl (local.get $cx) (i32.const 2))))))
              (local.set $cx (i32.add (local.get $cx) (i32.const 4)))
              (br $vLoop))))
          (else
            (local.set $cb0 (i32.add (local.get $cbPlane) (i32.shl (i32.mul (i32.add (local.get $yLocal0) (local.get $r)) (local.get $cStride)) (i32.const 2))))
            (local.set $cr0 (i32.add (local.get $crPlane) (i32.shl (i32.mul (i32.add (local.get $yLocal0) (local.get $r)) (local.get $cStride)) (i32.const 2))))
            (memory.copy (i32.add (local.get $vCb) (i32.const 4)) (local.get $cb0) (i32.shl (local.get $cEnd) (i32.const 2)))
            (memory.copy (i32.add (local.get $vCr) (i32.const 4)) (local.get $cr0) (i32.shl (local.get $cEnd) (i32.const 2)))))
        (f32.store (local.get $vCb) (f32.load offset=4 (local.get $vCb)))
        (f32.store (local.get $vCr) (f32.load offset=4 (local.get $vCr)))
        (v128.store (i32.add (local.get $vCb) (i32.shl (i32.add (local.get $clampW) (i32.const 2)) (i32.const 2)))
          (f32x4.splat (f32.load (i32.add (local.get $vCb) (i32.shl (i32.add (local.get $clampW) (i32.const 1)) (i32.const 2))))))
        (v128.store (i32.add (local.get $vCr) (i32.shl (i32.add (local.get $clampW) (i32.const 2)) (i32.const 2)))
          (f32x4.splat (f32.load (i32.add (local.get $vCr) (i32.shl (i32.add (local.get $clampW) (i32.const 1)) (i32.const 2))))))))

      (if (i32.eq (local.get $mode) (i32.const 4)) (then
        (local.set $cy0 (i32.shr_u (local.get $gy) (i32.const 1)))
        (local.set $vBias (f32x4.splat (if (result f32) (i32.and (local.get $gy) (i32.const 1)) (then (f32.const 2)) (else (f32.const 1)))))
        (if (i32.and (local.get $gy) (i32.const 1))
          (then
            (local.set $cy1 (i32.add (local.get $cy0) (i32.const 1)))
            (if (i32.gt_s (local.get $cy1) (local.get $clampH)) (then (local.set $cy1 (local.get $clampH)))))
          (else
            (local.set $cy1 (i32.sub (local.get $cy0) (i32.const 1)))
            (if (i32.lt_s (local.get $cy1) (i32.const 0)) (then (local.set $cy1 (i32.const 0))))))
        (local.set $cy0 (i32.sub (local.get $cy0) (local.get $cRowBase)))
        (local.set $cy1 (i32.sub (local.get $cy1) (local.get $cRowBase)))
        (local.set $cb0 (i32.add (local.get $cbPlane) (i32.shl (i32.mul (local.get $cy0) (local.get $cStride)) (i32.const 2))))
        (local.set $cb1 (i32.add (local.get $cbPlane) (i32.shl (i32.mul (local.get $cy1) (local.get $cStride)) (i32.const 2))))
        (local.set $cr0 (i32.add (local.get $crPlane) (i32.shl (i32.mul (local.get $cy0) (local.get $cStride)) (i32.const 2))))
        (local.set $cr1 (i32.add (local.get $crPlane) (i32.shl (i32.mul (local.get $cy1) (local.get $cStride)) (i32.const 2))))))

      (if (i32.or (i32.eq (local.get $mode) (i32.const 1)) (i32.eq (local.get $mode) (i32.const 5))) (then
        (local.set $cb0 (i32.add (local.get $cbPlane) (i32.shl (i32.mul (i32.add (local.get $yLocal0) (local.get $r)) (local.get $cStride)) (i32.const 2))))
        (local.set $cr0 (i32.add (local.get $crPlane) (i32.shl (i32.mul (i32.add (local.get $yLocal0) (local.get $r)) (local.get $cStride)) (i32.const 2))))))

      (local.set $x (i32.const 0))
      (block $xDone (loop $xLoop
        (br_if $xDone (i32.ge_u (local.get $x) (local.get $outW)))
        (local.set $yv (v128.load (i32.add (local.get $yRow) (i32.shl (local.get $x) (i32.const 2)))))
        (if (i32.eqz (local.get $mode))
          (then
            (local.set $t0 (call $packRgba4 (local.get $yv) (local.get $yv) (local.get $yv))))
          (else
            (if (i32.eq (local.get $mode) (i32.const 5))
              (then
                (local.set $cbv (v128.load (i32.add (local.get $cb0) (i32.shl (local.get $x) (i32.const 2)))))
                (local.set $crv (v128.load (i32.add (local.get $cr0) (i32.shl (local.get $x) (i32.const 2)))))
                (local.set $t0 (call $packRgba4 (local.get $yv) (local.get $cbv) (local.get $crv))))
              (else
                (if (i32.eq (local.get $mode) (i32.const 1))
                  (then
                    (local.set $cbv (v128.load (i32.add (local.get $cb0) (i32.shl (local.get $x) (i32.const 2)))))
                    (local.set $crv (v128.load (i32.add (local.get $cr0) (i32.shl (local.get $x) (i32.const 2))))))
                  (else
                    (if (i32.eq (local.get $mode) (i32.const 4))
                      (then
                        (local.set $cbv (f32x4.floor (f32x4.mul
                          (f32x4.add
                            (f32x4.add
                              (f32x4.mul (v128.load (i32.add (local.get $cb0) (i32.shl (local.get $x) (i32.const 2)))) (local.get $w3))
                              (v128.load (i32.add (local.get $cb1) (i32.shl (local.get $x) (i32.const 2)))))
                            (local.get $vBias))
                          (local.get $w14))))
                        (local.set $crv (f32x4.floor (f32x4.mul
                          (f32x4.add
                            (f32x4.add
                              (f32x4.mul (v128.load (i32.add (local.get $cr0) (i32.shl (local.get $x) (i32.const 2)))) (local.get $w3))
                              (v128.load (i32.add (local.get $cr1) (i32.shl (local.get $x) (i32.const 2)))))
                            (local.get $vBias))
                          (local.get $w14)))))
                      (else
                        (local.set $cx (i32.shr_u (local.get $x) (i32.const 1)))
                        (local.set $t1 (v128.load (i32.add (local.get $vCb) (i32.shl (local.get $cx) (i32.const 2)))))
                        (local.set $cbv (f32x4.floor (f32x4.mul
                          (f32x4.add
                            (f32x4.add
                              (f32x4.mul (i8x16.shuffle 4 5 6 7 4 5 6 7 8 9 10 11 8 9 10 11 (local.get $t1) (local.get $t1)) (local.get $w3))
                              (i8x16.shuffle 0 1 2 3 8 9 10 11 4 5 6 7 12 13 14 15 (local.get $t1) (local.get $t1)))
                            (local.get $hBias))
                          (local.get $hScale))))
                        (local.set $t1 (v128.load (i32.add (local.get $vCr) (i32.shl (local.get $cx) (i32.const 2)))))
                        (local.set $crv (f32x4.floor (f32x4.mul
                          (f32x4.add
                            (f32x4.add
                              (f32x4.mul (i8x16.shuffle 4 5 6 7 4 5 6 7 8 9 10 11 8 9 10 11 (local.get $t1) (local.get $t1)) (local.get $w3))
                              (i8x16.shuffle 0 1 2 3 8 9 10 11 4 5 6 7 12 13 14 15 (local.get $t1) (local.get $t1)))
                            (local.get $hBias))
                          (local.get $hScale))))))))
                (local.set $t0 (call $packRgba4
                  (f32x4.add (local.get $yv) (f32x4.mul (local.get $crv) (local.get $kCrR)))
                  (f32x4.add (local.get $yv) (f32x4.add (f32x4.mul (local.get $cbv) (local.get $kCbG)) (f32x4.mul (local.get $crv) (local.get $kCrG))))
                  (f32x4.add (local.get $yv) (f32x4.mul (local.get $cbv) (local.get $kCbB)))))))))
        (call $writeRgbaVec (i32.add (local.get $dst) (i32.shl (local.get $x) (i32.const 2))) (i32.sub (local.get $outW) (local.get $x)) (local.get $t0))
        (local.set $x (i32.add (local.get $x) (i32.const 4)))
        (br $xLoop)))
      (local.set $r (i32.add (local.get $r) (i32.const 1)))
      (br $rLoop))))

  ;; Permutes a band of $rows RGBA8 rows (starting at unoriented row $y0 of an $inW x $inH frame) into oriented $dst
  ;; for EXIF orientation $orient in 2..8.
  (func (export "orientBandRgba")
      (param $src i32) (param $dst i32) (param $inW i32) (param $inH i32)
      (param $y0 i32) (param $rows i32) (param $orient i32)
    (local $r i32) (local $x i32) (local $y i32) (local $dx i32) (local $dy i32) (local $outW i32) (local $sRow i32)
    (local.set $outW (select (local.get $inH) (local.get $inW) (i32.ge_u (local.get $orient) (i32.const 5))))
    (block $rDone (loop $rLoop
      (br_if $rDone (i32.ge_u (local.get $r) (local.get $rows)))
      (local.set $y (i32.add (local.get $y0) (local.get $r)))
      (local.set $sRow (i32.add (local.get $src) (i32.shl (i32.mul (local.get $r) (local.get $inW)) (i32.const 2))))
      (local.set $x (i32.const 0))
      (block $xDone (loop $xLoop
        (br_if $xDone (i32.ge_u (local.get $x) (local.get $inW)))
        (local.set $dx (local.get $x)) (local.set $dy (local.get $y))
        (if (i32.eq (local.get $orient) (i32.const 2)) (then (local.set $dx (i32.sub (i32.sub (local.get $inW) (i32.const 1)) (local.get $x)))))
        (if (i32.eq (local.get $orient) (i32.const 3)) (then
          (local.set $dx (i32.sub (i32.sub (local.get $inW) (i32.const 1)) (local.get $x)))
          (local.set $dy (i32.sub (i32.sub (local.get $inH) (i32.const 1)) (local.get $y)))))
        (if (i32.eq (local.get $orient) (i32.const 4)) (then (local.set $dy (i32.sub (i32.sub (local.get $inH) (i32.const 1)) (local.get $y)))))
        (if (i32.eq (local.get $orient) (i32.const 5)) (then (local.set $dx (local.get $y)) (local.set $dy (local.get $x))))
        (if (i32.eq (local.get $orient) (i32.const 6)) (then
          (local.set $dx (i32.sub (i32.sub (local.get $inH) (i32.const 1)) (local.get $y)))
          (local.set $dy (local.get $x))))
        (if (i32.eq (local.get $orient) (i32.const 7)) (then
          (local.set $dx (i32.sub (i32.sub (local.get $inH) (i32.const 1)) (local.get $y)))
          (local.set $dy (i32.sub (i32.sub (local.get $inW) (i32.const 1)) (local.get $x)))))
        (if (i32.eq (local.get $orient) (i32.const 8)) (then
          (local.set $dx (local.get $y))
          (local.set $dy (i32.sub (i32.sub (local.get $inW) (i32.const 1)) (local.get $x)))))
        (i32.store (i32.add (local.get $dst) (i32.shl (i32.add (i32.mul (local.get $dy) (local.get $outW)) (local.get $dx)) (i32.const 2)))
          (i32.load (i32.add (local.get $sRow) (i32.shl (local.get $x) (i32.const 2)))))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br $xLoop)))
      (local.set $r (i32.add (local.get $r) (i32.const 1)))
      (br $rLoop))))
  ;; Exact JPEG chroma prediction. Ratios have 11 fractional bits; both rounded shifts match JPEG XL's
  ;; reconstruction. The search's scratch belongs to one band and never changes the source luma or DC.
  (func $cflMultiples (param $sc i32) (param $mul i32) (param $f i32)
    (local $k i32) (local $fac i32)
    (local.set $fac (i32.div_s (i32.mul (local.get $f) (i32.const 2048)) (i32.const 84)))
    (i32.store (local.get $mul) (i32.const 0))
    (local.set $k (i32.const 4))
    (loop $next
      (i32.store (i32.add (local.get $mul) (local.get $k))
        (i32.shr_s (i32.add (i32.mul (local.get $fac) (i32.load (i32.add (local.get $sc) (local.get $k)))) (i32.const 1024)) (i32.const 11)))
      (local.set $k (i32.add (local.get $k) (i32.const 4)))
      (br_if $next (i32.lt_u (local.get $k) (i32.const 256)))))

  (func $cflCost (param $yp i32) (param $cp i32) (param $sc i32) (param $mul i32) (param $costs i32)
    (param $width i32) (param $rows i32) (param $stride i32) (param $x0 i32) (param $y0 i32) (param $f i32) (param $limit f64) (result f64)
    (local $x i32) (local $y i32) (local $k i32) (local $at i32) (local $cost f64)
    (local $l v128) (local $c v128) (local $lo v128) (local $hi v128)
    (call $cflMultiples (local.get $sc) (local.get $mul) (local.get $f))
    (local.set $cost (if (result f64) (local.get $f) (then (f64.const 4.5)) (else (f64.const 0))))
    (local.set $y (local.get $y0))
    (loop $row
      (local.set $x (local.get $x0))
      (loop $block
        (local.set $at (i32.shl (i32.add (i32.mul (local.get $y) (local.get $stride)) (local.get $x)) (i32.const 7)))
        (local.set $k (i32.const 0))
        (loop $coefficient
          (local.set $l (v128.load (i32.add (local.get $yp) (i32.add (local.get $at) (local.get $k)))))
          (local.set $c (v128.load (i32.add (local.get $cp) (i32.add (local.get $at) (local.get $k)))))
          ;; Eight zero coefficients in both planes contribute zero for every factor.
          (if (v128.any_true (v128.or (local.get $l) (local.get $c))) (then
          (local.set $lo (i32x4.sub (i32x4.extend_low_i16x8_s (local.get $c))
            (i32x4.shr_s (i32x4.add (i32x4.mul (i32x4.extend_low_i16x8_s (local.get $l))
              (v128.load (i32.add (local.get $mul) (i32.shl (local.get $k) (i32.const 1))))) (i32x4.splat (i32.const 1024))) (i32.const 11))))
          (local.set $hi (i32x4.sub (i32x4.extend_high_i16x8_s (local.get $c))
            (i32x4.shr_s (i32x4.add (i32x4.mul (i32x4.extend_high_i16x8_s (local.get $l))
              (v128.load offset=16 (i32.add (local.get $mul) (i32.shl (local.get $k) (i32.const 1))))) (i32x4.splat (i32.const 1024))) (i32.const 11))))
          ;; DC is not part of the fit. Keep the scalar summation order, including each nonzero term's price.
          (if (i32.eqz (local.get $k)) (then (local.set $lo (v128.and (local.get $lo) (v128.const i32x4 0 -1 -1 -1)))))
          (if (v128.any_true (v128.or
            (i32x4.gt_u (i32x4.add (local.get $lo) (i32x4.splat (i32.const 32768))) (i32x4.splat (i32.const 65535)))
            (i32x4.gt_u (i32x4.add (local.get $hi) (i32x4.splat (i32.const 32768))) (i32x4.splat (i32.const 65535)))))
            (then (return (f64.const 1e18))))
          (local.set $lo (i32x4.shl (i32x4.abs (local.get $lo)) (i32.const 3)))
          (local.set $hi (i32x4.shl (i32x4.abs (local.get $hi)) (i32.const 3)))
          (local.set $cost (f64.add (local.get $cost) (f64.load (i32.add (local.get $costs) (i32x4.extract_lane 0 (local.get $lo))))))
          (local.set $cost (f64.add (local.get $cost) (f64.load (i32.add (local.get $costs) (i32x4.extract_lane 1 (local.get $lo))))))
          (local.set $cost (f64.add (local.get $cost) (f64.load (i32.add (local.get $costs) (i32x4.extract_lane 2 (local.get $lo))))))
          (local.set $cost (f64.add (local.get $cost) (f64.load (i32.add (local.get $costs) (i32x4.extract_lane 3 (local.get $lo))))))
          (local.set $cost (f64.add (local.get $cost) (f64.load (i32.add (local.get $costs) (i32x4.extract_lane 0 (local.get $hi))))))
          (local.set $cost (f64.add (local.get $cost) (f64.load (i32.add (local.get $costs) (i32x4.extract_lane 1 (local.get $hi))))))
          (local.set $cost (f64.add (local.get $cost) (f64.load (i32.add (local.get $costs) (i32x4.extract_lane 2 (local.get $hi))))))
          (local.set $cost (f64.add (local.get $cost) (f64.load (i32.add (local.get $costs) (i32x4.extract_lane 3 (local.get $hi))))))
          ))
          (local.set $k (i32.add (local.get $k) (i32.const 16)))
          (br_if $coefficient (i32.lt_u (local.get $k) (i32.const 128))))
        ;; All remaining terms are nonnegative: a losing factor needs no more work.
        (if (f64.ge (local.get $cost) (local.get $limit)) (then (return (local.get $cost))))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br_if $block (i32.and (i32.lt_u (local.get $x) (local.get $width)) (i32.lt_u (local.get $x) (i32.add (local.get $x0) (i32.const 8))))))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br_if $row (i32.and (i32.lt_u (local.get $y) (local.get $rows)) (i32.lt_u (local.get $y) (i32.add (local.get $y0) (i32.const 8))))))
    (local.get $cost))

  (func $cflApply (param $yp i32) (param $cp i32) (param $mul i32) (param $width i32) (param $rows i32)
    (param $stride i32) (param $x0 i32) (param $y0 i32)
    (local $x i32) (local $y i32) (local $k i32) (local $at i32) (local $l v128) (local $c v128) (local $lo v128) (local $hi v128)
    (local.set $y (local.get $y0))
    (loop $row
      (local.set $x (local.get $x0))
      (loop $block
        (local.set $at (i32.shl (i32.add (i32.mul (local.get $y) (local.get $stride)) (local.get $x)) (i32.const 7)))
        (local.set $k (i32.const 0))
        (loop $coefficient
          (local.set $l (v128.load (i32.add (local.get $yp) (i32.add (local.get $at) (local.get $k)))))
          (local.set $c (v128.load (i32.add (local.get $cp) (i32.add (local.get $at) (local.get $k)))))
          (local.set $lo (i32x4.sub (i32x4.extend_low_i16x8_s (local.get $c))
            (i32x4.shr_s (i32x4.add (i32x4.mul (i32x4.extend_low_i16x8_s (local.get $l))
              (v128.load (i32.add (local.get $mul) (i32.shl (local.get $k) (i32.const 1))))) (i32x4.splat (i32.const 1024))) (i32.const 11))))
          (local.set $hi (i32x4.sub (i32x4.extend_high_i16x8_s (local.get $c))
            (i32x4.shr_s (i32x4.add (i32x4.mul (i32x4.extend_high_i16x8_s (local.get $l))
              (v128.load offset=16 (i32.add (local.get $mul) (i32.shl (local.get $k) (i32.const 1))))) (i32x4.splat (i32.const 1024))) (i32.const 11))))
          (v128.store (i32.add (local.get $cp) (i32.add (local.get $at) (local.get $k))) (i16x8.narrow_i32x4_s (local.get $lo) (local.get $hi)))
          (local.set $k (i32.add (local.get $k) (i32.const 16)))
          (br_if $coefficient (i32.lt_u (local.get $k) (i32.const 128))))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br_if $block (i32.and (i32.lt_u (local.get $x) (local.get $width)) (i32.lt_u (local.get $x) (i32.add (local.get $x0) (i32.const 8))))))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br_if $row (i32.and (i32.lt_u (local.get $y) (local.get $rows)) (i32.lt_u (local.get $y) (i32.add (local.get $y0) (i32.const 8)))))))

  (func (export "fitCfl") (param $yp i32) (param $cp i32) (param $quant i32) (param $sc i32) (param $mul i32)
    (param $costs i32) (param $maps i32) (param $width i32) (param $rows i32) (param $stride i32) (param $known i32)
    (local $k i32) (local $x i32) (local $y i32) (local $m i32) (local $bf i32) (local $f i32) (local $bc f64) (local $cost f64) (local $n f64)
    (local.set $k (i32.const 4))
    (loop $quantize
      (i32.store (i32.add (local.get $sc) (local.get $k)) (i32.div_u
        (i32.shl (i32.load (i32.add (local.get $quant) (local.get $k))) (i32.const 11))
        (i32.load offset=256 (i32.add (local.get $quant) (local.get $k)))))
      (local.set $k (i32.add (local.get $k) (i32.const 4)))
      (br_if $quantize (i32.lt_u (local.get $k) (i32.const 256))))
    (if (i32.eqz (local.get $known)) (then
      (f64.store (local.get $costs) (f64.const 0))
      (local.set $k (i32.const 1))
      (loop $prices
        (local.set $n (f64.convert_i32_u (i32.add (local.get $k) (i32.const 1))))
        (f64.store (i32.add (local.get $costs) (i32.shl (local.get $k) (i32.const 3)))
          (f64.add (f64.const 2) (f64.div (f64.load (i32.shl (i32.add (local.get $k) (i32.const 1)) (i32.const 3))) (local.get $n))))
        (local.set $k (i32.add (local.get $k) (i32.const 1)))
        (br_if $prices (i32.le_u (local.get $k) (i32.const 32768))))))
    (loop $tileRow
      (local.set $x (i32.const 0))
      (loop $tile
        (local.set $bf (i32.load8_s (i32.add (local.get $maps) (local.get $m))))
        (if (i32.eqz (local.get $known)) (then
          (local.set $bf (i32.const 0))
          (local.set $bc (call $cflCost (local.get $yp) (local.get $cp) (local.get $sc) (local.get $mul) (local.get $costs)
            (local.get $width) (local.get $rows) (local.get $stride) (local.get $x) (local.get $y) (i32.const 0) (f64.const 1e18)))
          (local.set $f (i32.const -96))
          (loop $coarse
            (if (local.get $f) (then
              (local.set $cost (call $cflCost (local.get $yp) (local.get $cp) (local.get $sc) (local.get $mul) (local.get $costs)
                (local.get $width) (local.get $rows) (local.get $stride) (local.get $x) (local.get $y) (local.get $f) (local.get $bc)))
              (if (f64.lt (local.get $cost) (local.get $bc)) (then (local.set $bc (local.get $cost)) (local.set $bf (local.get $f))))))
            (local.set $f (i32.add (local.get $f) (i32.const 6)))
            (br_if $coarse (i32.le_s (local.get $f) (i32.const 96))))
          (local.set $f (i32.sub (local.get $bf) (i32.const 5)))
          (loop $refine
            (if (i32.le_u (i32.add (local.get $f) (i32.const 128)) (i32.const 255)) (then
              (local.set $cost (call $cflCost (local.get $yp) (local.get $cp) (local.get $sc) (local.get $mul) (local.get $costs)
                (local.get $width) (local.get $rows) (local.get $stride) (local.get $x) (local.get $y) (local.get $f) (local.get $bc)))
              (if (f64.lt (local.get $cost) (local.get $bc)) (then (local.set $bc (local.get $cost)) (local.set $bf (local.get $f))))))
            (local.set $f (i32.add (local.get $f) (i32.const 1)))
            (br_if $refine (i32.le_s (local.get $f) (i32.add (local.get $bf) (i32.const 5)))))
          (i32.store8 (i32.add (local.get $maps) (local.get $m)) (local.get $bf))))
        (if (local.get $bf) (then
          (call $cflMultiples (local.get $sc) (local.get $mul) (local.get $bf))
          (call $cflApply (local.get $yp) (local.get $cp) (local.get $mul) (local.get $width) (local.get $rows) (local.get $stride) (local.get $x) (local.get $y))))
        (local.set $m (i32.add (local.get $m) (i32.const 1)))
        (local.set $x (i32.add (local.get $x) (i32.const 8)))
        (br_if $tile (i32.lt_u (local.get $x) (local.get $width))))
      (local.set $y (i32.add (local.get $y) (i32.const 8)))
      (br_if $tileRow (i32.lt_u (local.get $y) (local.get $rows)))))

  ;; Global nonzero token histogram (valHist: u32[2048], clamping u >= 2047 to bin 2047) for bw x bh 64-i16 blocks at
  ;; coeffs (rows stride blocks apart): each block's nonzero AC count (when >= 1) and each nonzero AC level's packSigned.
  (func (export "acHist") (param $coeffs i32) (param $bw i32) (param $bh i32) (param $stride i32) (param $valHist i32)
    (local $y i32) (local $x i32) (local $blk i32) (local $off i32) (local $m i32) (local $q i32) (local $u i32) (local $nz i32) (local $p i32) (local $v v128)
    (block $yDone (loop $yLoop
      (br_if $yDone (i32.ge_u (local.get $y) (local.get $bh)))
      (local.set $x (i32.const 0))
      (block $xDone (loop $xLoop
        (br_if $xDone (i32.ge_u (local.get $x) (local.get $bw)))
        (local.set $blk (i32.add (local.get $coeffs) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $stride)) (local.get $x)) (i32.const 7))))
        (local.set $nz (i32.const 0))
        (local.set $off (i32.const 0))
        (loop $vec
          (local.set $v (v128.load (i32.add (local.get $blk) (local.get $off))))
          (if (i32.eqz (local.get $off)) (then (local.set $v (i16x8.replace_lane 0 (local.get $v) (i32.const 0)))))
          (if (v128.any_true (local.get $v)) (then
            (local.set $m (select (i32.const 2) (i32.const 0) (i32.eqz (local.get $off))))
            (loop $lanes
              (local.set $q (i32.load16_s (i32.add (local.get $blk) (i32.add (local.get $off) (local.get $m)))))
              (if (local.get $q) (then
                (local.set $nz (i32.add (local.get $nz) (i32.const 1)))
                (local.set $u (select (i32.sub (i32.sub (i32.const 0) (i32.shl (local.get $q) (i32.const 1))) (i32.const 1))
                  (i32.shl (local.get $q) (i32.const 1)) (i32.lt_s (local.get $q) (i32.const 0))))
                (if (i32.gt_u (local.get $u) (i32.const 2047)) (then (local.set $u (i32.const 2047))))
                (local.set $p (i32.add (local.get $valHist) (i32.shl (local.get $u) (i32.const 2))))
                (i32.store (local.get $p) (i32.add (i32.load (local.get $p)) (i32.const 1)))))
              (local.set $m (i32.add (local.get $m) (i32.const 2)))
              (br_if $lanes (i32.lt_u (local.get $m) (i32.const 16))))))
          (local.set $off (i32.add (local.get $off) (i32.const 16)))
          (br_if $vec (i32.lt_u (local.get $off) (i32.const 128))))
        (if (local.get $nz) (then
          (local.set $p (i32.add (local.get $valHist) (i32.shl (local.get $nz) (i32.const 2))))
          (i32.store (local.get $p) (i32.add (i32.load (local.get $p)) (i32.const 1)))))
        (local.set $x (i32.add (local.get $x) (i32.const 1)))
        (br $xLoop)))
      (local.set $y (i32.add (local.get $y) (i32.const 1)))
      (br $yLoop))))

  ;; Fixed-price Brotli parsing. The two segment trees hold earlier command ends and ranges of future copy ends.
  ;; Every insertion/copy length in a length-code bucket has the same extra-bit cost; no length is sampled.
  (func $brValue (param $records i32) (param $prefix i32) (param $at i32) (result i32)
    (if (result i32) (i32.lt_s (local.get $at) (i32.const 0)) (then (i32.const 1073741823))
      (else (i32.sub (i32.load (i32.add (local.get $records) (i32.shl (local.get $at) (i32.const 4))))
        (i32.load (i32.add (local.get $prefix) (i32.shl (local.get $at) (i32.const 2))))))))
  (func $brMin (param $records i32) (param $prefix i32) (param $a i32) (param $b i32) (result i32)
    (if (result i32) (i32.le_s (call $brValue (local.get $records) (local.get $prefix) (local.get $a))
                             (call $brValue (local.get $records) (local.get $prefix) (local.get $b)))
      (then (local.get $a)) (else (local.get $b))))
  (func $brQuery (param $tree i32) (param $base i32) (param $lo i32) (param $hi i32)
    (param $records i32) (param $prefix i32) (result i32)
    (local $best i32)
    (local.set $best (i32.const -1))
    (local.set $lo (i32.add (local.get $lo) (local.get $base)))
    (local.set $hi (i32.add (local.get $hi) (local.get $base)))
    (block $done (loop $walk
      (br_if $done (i32.gt_u (local.get $lo) (local.get $hi)))
      (if (i32.and (local.get $lo) (i32.const 1)) (then
        (local.set $best (call $brMin (local.get $records) (local.get $prefix) (local.get $best)
          (i32.load (i32.add (local.get $tree) (i32.shl (local.get $lo) (i32.const 2))))))
        (local.set $lo (i32.add (local.get $lo) (i32.const 1)))))
      (if (i32.eqz (i32.and (local.get $hi) (i32.const 1))) (then
        (local.set $best (call $brMin (local.get $records) (local.get $prefix) (local.get $best)
          (i32.load (i32.add (local.get $tree) (i32.shl (local.get $hi) (i32.const 2))))))
        (local.set $hi (i32.sub (local.get $hi) (i32.const 1)))))
      (local.set $lo (i32.shr_u (local.get $lo) (i32.const 1)))
      (local.set $hi (i32.shr_u (local.get $hi) (i32.const 1)))
      (br $walk)))
    (local.get $best))
  (func $brOfferOne (param $at i32) (param $cost i32) (param $prior i32) (param $copy i32) (param $distance i32)
    (if (i32.lt_s (local.get $cost) (i32.load (local.get $at))) (then
      (i32.store (local.get $at) (local.get $cost))
      (i32.store offset=4 (local.get $at) (local.get $prior))
      (i32.store offset=8 (local.get $at) (local.get $copy))
      (i32.store offset=12 (local.get $at) (local.get $distance)))))
  (func $brOffer (param $tree i32) (param $base i32) (param $lo i32) (param $hi i32)
    (param $cost i32) (param $prior i32) (param $copy i32) (param $distance i32)
    (local.set $lo (i32.add (local.get $lo) (local.get $base)))
    (local.set $hi (i32.add (local.get $hi) (local.get $base)))
    (block $done (loop $walk
      (br_if $done (i32.gt_u (local.get $lo) (local.get $hi)))
      (if (i32.and (local.get $lo) (i32.const 1)) (then
        (call $brOfferOne (i32.add (local.get $tree) (i32.shl (local.get $lo) (i32.const 4)))
          (local.get $cost) (local.get $prior) (local.get $copy) (local.get $distance))
        (local.set $lo (i32.add (local.get $lo) (i32.const 1)))))
      (if (i32.eqz (i32.and (local.get $hi) (i32.const 1))) (then
        (call $brOfferOne (i32.add (local.get $tree) (i32.shl (local.get $hi) (i32.const 4)))
          (local.get $cost) (local.get $prior) (local.get $copy) (local.get $distance))
        (local.set $hi (i32.sub (local.get $hi) (i32.const 1)))))
      (local.set $lo (i32.shr_u (local.get $lo) (i32.const 1)))
      (local.set $hi (i32.shr_u (local.get $hi) (i32.const 1)))
      (br $walk))))
  (func $brHash (param $data i32) (param $at i32) (result i32)
    (i32.load16_u align=1 (i32.add (local.get $data) (local.get $at))))
  (func $brMatch (param $a i32) (param $b i32) (param $maximum i32) (param $known i32) (result i32)
    (block $tail (loop $vectors
      (br_if $tail (i32.gt_u (i32.add (local.get $known) (i32.const 16)) (local.get $maximum)))
      (br_if $tail (i32.eqz (i8x16.all_true (i8x16.eq
        (v128.load align=1 (i32.add (local.get $a) (local.get $known)))
        (v128.load align=1 (i32.add (local.get $b) (local.get $known)))))))
      (local.set $known (i32.add (local.get $known) (i32.const 16))) (br $vectors)))
    (block $done (loop $bytes
      (br_if $done (i32.ge_u (local.get $known) (local.get $maximum)))
      (br_if $done (i32.ne (i32.load8_u (i32.add (local.get $a) (local.get $known)))
        (i32.load8_u (i32.add (local.get $b) (local.get $known)))))
      (local.set $known (i32.add (local.get $known) (i32.const 1))) (br $bytes)))
    (local.get $known))
  ;; model: literal256, command704, distance64, insert bases24, copy bases24, insert bits24, copy bits24, groups9*u16.
  ;; scratch: heads65536, previous[data length], prefix[n+1], records[n+1]*16, min-tree[2*base],
  ;; copy-tree[2*base]*16, choices24*8, output[ceil(n/2)*3]*4. Pointers and capacity come from the bridge.
  (func (export "brotliParse") (param $data i32) (param $begin i32) (param $n i32) (param $reach i32)
    (param $heads i32) (param $prev i32) (param $prefix i32) (param $records i32)
    (param $mins i32) (param $copies i32) (param $base i32) (param $model i32) (param $choices i32) (param $out i32) (param $origin i32)
    (result i32)
    (local $p i32) (local $i i32) (local $j i32) (local $at i32) (local $q i32) (local $best i32)
    (local $cost i32) (local $s i32) (local $lo i32) (local $hi i32) (local $t i32) (local $key i32)
    (local $probe i32) (local $oldest i32) (local $tries i32) (local $length i32) (local $distance i32)
    (local $extra i32) (local $code i32) (local $dcost i32) (local $minDist i32)
    (local $lastDistance i32) (local $lastLength i32) (local $longDistance i32) (local $longLength i32)
    (local $known i32) (local $end i32) (local $words i32) (local $left i32) (local $right i32)
    (local $insBase i32) (local $copyBase i32) (local $insBits i32) (local $copyBits i32) (local $groups i32)
    (local.set $insBase (i32.add (local.get $model) (i32.const 1024)))
    (local.set $copyBase (i32.add (local.get $insBase) (i32.const 96)))
    (local.set $insBits (i32.add (local.get $copyBase) (i32.const 96)))
    (local.set $copyBits (i32.add (local.get $insBits) (i32.const 24)))
    (local.set $groups (i32.add (local.get $copyBits) (i32.const 24)))
    (memory.fill (local.get $heads) (i32.const 255) (i32.const 262144))
    (memory.fill (local.get $mins) (i32.const 255) (i32.shl (local.get $base) (i32.const 3)))
    (local.set $i (i32.const 0))
    (loop $init
      (i32.store (i32.add (local.get $copies) (i32.shl (local.get $i) (i32.const 4))) (i32.const 1073741823))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $init (i32.lt_u (local.get $i) (i32.shl (local.get $base) (i32.const 1)))))
    (i32.store (local.get $prefix) (i32.const 0))
    (local.set $i (i32.const 0))
    (block $prefDone (loop $pref
      (br_if $prefDone (i32.ge_u (local.get $i) (local.get $n)))
      (i32.store (i32.add (local.get $prefix) (i32.shl (i32.add (local.get $i) (i32.const 1)) (i32.const 2)))
        (i32.add (i32.load (i32.add (local.get $prefix) (i32.shl (local.get $i) (i32.const 2))))
          (i32.load8_u (i32.add (local.get $model) (i32.load8_u
            (i32.add (local.get $data) (i32.add (local.get $begin) (local.get $i))))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $pref)))
    (local.set $i (select (i32.sub (local.get $begin) (local.get $reach)) (i32.const 0)
      (i32.gt_u (local.get $begin) (local.get $reach))))
    (block $historyDone (loop $history
      (br_if $historyDone (i32.ge_u (local.get $i) (local.get $begin)))
      (local.set $key (i32.add (local.get $heads) (i32.shl (call $brHash (local.get $data) (local.get $i)) (i32.const 2))))
      (i32.store (i32.add (local.get $prev) (i32.shl (local.get $i) (i32.const 2))) (i32.load (local.get $key)))
      (i32.store (local.get $key) (local.get $i))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $history)))
    (local.set $minDist (i32.const 255)) (local.set $i (i32.const 16))
    (loop $distanceMinimum
      (local.set $cost (i32.add (i32.load8_u (i32.add (local.get $model) (i32.add (i32.const 960) (local.get $i))))
        (i32.add (i32.shr_u (i32.sub (local.get $i) (i32.const 16)) (i32.const 1)) (i32.const 1))))
      (local.set $minDist (select (local.get $cost) (local.get $minDist) (i32.lt_u (local.get $cost) (local.get $minDist))))
      (local.set $i (i32.add (local.get $i) (i32.const 1)))
      (br_if $distanceMinimum (i32.lt_u (local.get $i) (i32.const 64))))
    (local.set $p (i32.const 0))
    (loop $positions
      (local.set $at (i32.add (local.get $records) (i32.shl (local.get $p) (i32.const 4))))
      (i32.store (local.get $at) (i32.const 1073741823))
      (local.set $q (i32.add (local.get $base) (local.get $p)))
      (loop $incoming
        (local.set $t (i32.add (local.get $copies) (i32.shl (local.get $q) (i32.const 4))))
        (if (i32.lt_s (i32.load (local.get $t)) (i32.load (local.get $at)))
          (then (memory.copy (local.get $at) (local.get $t) (i32.const 16))))
        (local.set $q (i32.shr_u (local.get $q) (i32.const 1)))
        (br_if $incoming (local.get $q)))
      (if (i32.eqz (local.get $p)) (then (i32.store (local.get $at) (i32.const 0))))
      (if (i32.lt_s (i32.load (local.get $at)) (i32.const 1073741823)) (then
        (local.set $q (i32.add (local.get $base) (local.get $p)))
        (i32.store (i32.add (local.get $mins) (i32.shl (local.get $q) (i32.const 2))) (local.get $p))
        (block $updated (loop $update
          (local.set $q (i32.shr_u (local.get $q) (i32.const 1))) (br_if $updated (i32.eqz (local.get $q)))
          (local.set $t (i32.add (local.get $mins) (i32.shl (local.get $q) (i32.const 3))))
          (i32.store (i32.add (local.get $mins) (i32.shl (local.get $q) (i32.const 2)))
            (call $brMin (local.get $records) (local.get $prefix) (i32.load (local.get $t)) (i32.load offset=4 (local.get $t))))
          (br $update)))))
      (local.set $j (i32.const 0))
      (loop $emptyChoices
        (i32.store (i32.add (local.get $choices) (i32.shl (local.get $j) (i32.const 3))) (i32.const 1073741823))
        (local.set $j (i32.add (local.get $j) (i32.const 1))) (br_if $emptyChoices (i32.lt_u (local.get $j) (i32.const 24))))
      (local.set $i (i32.const 0))
      (block $insertDone (loop $insertCodes
        (local.set $lo (i32.load (i32.add (local.get $insBase) (i32.shl (local.get $i) (i32.const 2)))))
        (br_if $insertDone (i32.gt_u (local.get $lo) (local.get $p)))
        (local.set $hi (i32.sub (local.get $p) (local.get $lo)))
        (local.set $lo (if (result i32) (i32.lt_u (local.get $i) (i32.const 23))
          (then (i32.add (i32.sub (local.get $p) (i32.load (i32.add (local.get $insBase)
            (i32.shl (i32.add (local.get $i) (i32.const 1)) (i32.const 2))))) (i32.const 1))) (else (i32.const 0))))
        (local.set $lo (select (local.get $lo) (i32.const 0) (i32.gt_s (local.get $lo) (i32.const 0))))
        (local.set $s (call $brQuery (local.get $mins) (local.get $base) (local.get $lo) (local.get $hi) (local.get $records) (local.get $prefix)))
        (if (i32.ge_s (local.get $s) (i32.const 0)) (then
          (local.set $cost (i32.add (call $brValue (local.get $records) (local.get $prefix) (local.get $s))
            (i32.add (i32.load (i32.add (local.get $prefix) (i32.shl (local.get $p) (i32.const 2))))
              (i32.load8_u (i32.add (local.get $insBits) (local.get $i))))))
          (local.set $j (i32.const 0))
          (loop $copyChoices
            (local.set $code (i32.add
              (i32.load16_u (i32.add (local.get $groups) (i32.shl (i32.add
                (i32.mul (i32.shr_u (local.get $i) (i32.const 3)) (i32.const 3))
                (i32.shr_u (local.get $j) (i32.const 3))) (i32.const 1))))
              (i32.add (i32.shl (i32.and (local.get $i) (i32.const 7)) (i32.const 3)) (i32.and (local.get $j) (i32.const 7)))))
            (local.set $t (i32.add (local.get $cost) (i32.add
              (i32.load8_u (i32.add (local.get $model) (i32.add (i32.const 256) (local.get $code))))
              (i32.load8_u (i32.add (local.get $copyBits) (local.get $j))))))
            (local.set $at (i32.add (local.get $choices) (i32.shl (local.get $j) (i32.const 3))))
            (if (i32.lt_s (local.get $t) (i32.load (local.get $at))) (then
              (i32.store (local.get $at) (local.get $t)) (i32.store offset=4 (local.get $at) (local.get $s))))
            (local.set $j (i32.add (local.get $j) (i32.const 1))) (br_if $copyChoices (i32.lt_u (local.get $j) (i32.const 24))))))
        (local.set $i (i32.add (local.get $i) (i32.const 1))) (br_if $insertCodes (i32.lt_u (local.get $i) (i32.const 24)))))
      (if (i32.eq (local.get $p) (local.get $n)) (then
        (local.set $end (local.get $n))
        (if (i32.lt_s (i32.load (local.get $choices))
          (i32.load (i32.add (local.get $records) (i32.shl (local.get $n) (i32.const 4)))))
          (then (local.set $end (i32.load offset=4 (local.get $choices)))))
        (block $pathDone (loop $path
          (br_if $pathDone (i32.eqz (local.get $end)))
          (local.set $at (i32.add (local.get $records) (i32.shl (local.get $end) (i32.const 4))))
          (local.set $t (i32.add (local.get $out) (i32.shl (local.get $words) (i32.const 2))))
          (i32.store (local.get $t) (i32.add (local.get $origin) (i32.add (local.get $begin) (i32.load offset=8 (local.get $at)))))
          (i32.store offset=4 (local.get $t) (i32.sub (local.get $end) (i32.load offset=8 (local.get $at))))
          (i32.store offset=8 (local.get $t) (i32.load offset=12 (local.get $at)))
          (local.set $words (i32.add (local.get $words) (i32.const 3)))
          (local.set $end (i32.load offset=4 (local.get $at))) (br $path)))
        (local.set $left (i32.const 0)) (local.set $right (i32.sub (local.get $words) (i32.const 3)))
        (block $reversed (loop $reverse
          (br_if $reversed (i32.ge_s (local.get $left) (local.get $right)))
          (local.set $i (i32.const 0))
          (loop $triple
            (local.set $at (i32.add (local.get $out) (i32.shl (i32.add (local.get $left) (local.get $i)) (i32.const 2))))
            (local.set $q (i32.add (local.get $out) (i32.shl (i32.add (local.get $right) (local.get $i)) (i32.const 2))))
            (local.set $t (i32.load (local.get $at))) (i32.store (local.get $at) (i32.load (local.get $q))) (i32.store (local.get $q) (local.get $t))
            (local.set $i (i32.add (local.get $i) (i32.const 1))) (br_if $triple (i32.lt_u (local.get $i) (i32.const 3))))
          (local.set $left (i32.add (local.get $left) (i32.const 3))) (local.set $right (i32.sub (local.get $right) (i32.const 3))) (br $reverse)))
        (return (local.get $words))))
      (if (i32.le_u (i32.add (local.get $p) (i32.const 2)) (local.get $n)) (then
        (local.set $at (i32.add (local.get $begin) (local.get $p)))
        (local.set $key (i32.add (local.get $heads) (i32.shl (call $brHash (local.get $data) (local.get $at)) (i32.const 2))))
        (local.set $probe (i32.load (local.get $key)))
        (i32.store (i32.add (local.get $prev) (i32.shl (local.get $at) (i32.const 2))) (local.get $probe))
        (i32.store (local.get $key) (local.get $at))
        (local.set $oldest (select (i32.sub (local.get $at) (local.get $reach)) (i32.const 0) (i32.gt_u (local.get $at) (local.get $reach))))
        (local.set $tries (i32.const 128)) (local.set $longLength (i32.const 0)) (local.set $longDistance (i32.const 0))
        (block $probesDone (loop $probes
          (br_if $probesDone (i32.lt_s (local.get $probe) (local.get $oldest)))
          (br_if $probesDone (i32.eqz (local.get $tries))) (local.set $tries (i32.sub (local.get $tries) (i32.const 1)))
          (block
            (local.set $distance (i32.sub (local.get $at) (local.get $probe))) (local.set $known (i32.const 2))
            (if (i32.and (i32.eq (local.get $distance) (local.get $lastDistance)) (i32.gt_u (local.get $lastLength) (i32.const 3)))
              (then (local.set $known (i32.sub (local.get $lastLength) (i32.const 1)))))
            (local.set $length (call $brMatch (i32.add (local.get $data) (local.get $at))
              (i32.add (local.get $data) (local.get $probe)) (i32.sub (local.get $n) (local.get $p)) (local.get $known)))
            (if (i32.gt_u (local.get $length) (local.get $longLength))
              (then (local.set $longLength (local.get $length)) (local.set $longDistance (local.get $distance))))
            (local.set $extra (i32.sub (i32.const 30) (i32.clz (i32.add (local.get $distance) (i32.const 3)))))
            (local.set $code (i32.add (i32.const 16) (i32.add (i32.shl (i32.sub (local.get $extra) (i32.const 1)) (i32.const 1))
              (i32.and (i32.shr_u (i32.add (local.get $distance) (i32.const 3)) (local.get $extra)) (i32.const 1)))))
            (local.set $dcost (i32.add (local.get $extra) (i32.load8_u (i32.add (local.get $model) (i32.add (i32.const 960) (local.get $code))))))
            (local.set $j (i32.const 0))
            (block $copyDone (loop $copyCodes
              (local.set $lo (i32.load (i32.add (local.get $copyBase) (i32.shl (local.get $j) (i32.const 2)))))
              (br_if $copyDone (i32.gt_u (local.get $lo) (local.get $length)))
              (local.set $hi (if (result i32) (i32.lt_u (local.get $j) (i32.const 23))
                (then (i32.sub (i32.load (i32.add (local.get $copyBase) (i32.shl (i32.add (local.get $j) (i32.const 1)) (i32.const 2)))) (i32.const 1)))
                (else (local.get $length))))
              (local.set $hi (select (local.get $hi) (local.get $length) (i32.lt_u (local.get $hi) (local.get $length))))
              (local.set $t (i32.add (local.get $choices) (i32.shl (local.get $j) (i32.const 3))))
              (call $brOffer (local.get $copies) (local.get $base) (i32.add (local.get $p) (local.get $lo))
                (i32.add (local.get $p) (local.get $hi)) (i32.add (i32.load (local.get $t)) (local.get $dcost))
                (i32.load offset=4 (local.get $t)) (local.get $p) (local.get $distance))
              (local.set $j (i32.add (local.get $j) (i32.const 1))) (br_if $copyCodes (i32.lt_u (local.get $j) (i32.const 24)))))
            (br_if $probesDone (i32.and (i32.eq (local.get $length) (i32.sub (local.get $n) (local.get $p)))
              (i32.le_u (local.get $dcost) (local.get $minDist)))))
          (local.set $probe (i32.load (i32.add (local.get $prev) (i32.shl (local.get $probe) (i32.const 2))))) (br $probes)))
        (local.set $lastLength (local.get $longLength)) (local.set $lastDistance (local.get $longDistance))))
      (local.set $p (i32.add (local.get $p) (i32.const 1))) (br $positions))
    (i32.const 0))

  ;; The high-effort JPEG model's coefficient walks use the same arithmetic as fitCfl. JavaScript chooses maps
  ;; and contexts from these band-sized statistics, without retaining another full image of sparse coefficients.
  (func $cflResidualAt (param $yp i32) (param $cp i32) (param $mul i32) (param $k i32) (result i32)
    (i32.sub (i32.load16_s (i32.add (local.get $cp) (i32.shl (local.get $k) (i32.const 1))))
      (i32.shr_s (i32.add (i32.mul
        (i32.load (i32.add (local.get $mul) (i32.shl (local.get $k) (i32.const 2))))
        (i32.load16_s (i32.add (local.get $yp) (i32.shl (local.get $k) (i32.const 1)))))
        (i32.const 1024)) (i32.const 11))))
  (func (export "cflHistogram") (param $yp i32) (param $cp i32) (param $mul i32) (param $seeds i32)
    (param $scan i32) (param $width i32) (param $rows i32) (param $stride i32)
    (param $nzHist i32) (param $posHist i32) (param $magHist i32) (result i32)
    (local $y i32) (local $x i32) (local $s i32) (local $k i32) (local $at i32) (local $mp i32)
    (local $r i32) (local $a i32) (local $p i32) (local $nz i32) (local $total i32) (local $tw i32)
    (local.set $tw (i32.shr_u (i32.add (local.get $width) (i32.const 7)) (i32.const 3)))
    (block $done (loop $row
      (br_if $done (i32.ge_u (local.get $y) (local.get $rows)))
      (local.set $x (i32.const 0))
      (block $rowDone (loop $block
        (br_if $rowDone (i32.ge_u (local.get $x) (local.get $width)))
        (local.set $at (i32.shl (i32.add (i32.mul (local.get $y) (local.get $stride)) (local.get $x)) (i32.const 7)))
        (local.set $mp (i32.add (local.get $mul) (i32.shl (i32.add (i32.const 128)
          (i32.load8_s (i32.add (local.get $seeds) (i32.add (i32.mul (i32.shr_u (local.get $y) (i32.const 3)) (local.get $tw))
            (i32.shr_u (local.get $x) (i32.const 3)))))) (i32.const 8))))
        (local.set $s (i32.const 63)) (local.set $nz (i32.const 0))
        (loop $coefficient
          (local.set $k (i32.load (i32.add (local.get $scan) (i32.shl (local.get $s) (i32.const 2)))))
          (local.set $r (call $cflResidualAt (i32.add (local.get $yp) (local.get $at))
            (i32.add (local.get $cp) (local.get $at)) (local.get $mp) (local.get $k)))
          (if (local.get $r) (then
            (local.set $nz (i32.add (local.get $nz) (i32.const 1)))
            (local.set $p (i32.add (local.get $posHist) (i32.shl (local.get $s) (i32.const 2))))
            (i32.store (local.get $p) (i32.add (i32.load (local.get $p)) (i32.const 1)))
            (local.set $a (select (i32.sub (i32.const 0) (local.get $r)) (local.get $r) (i32.lt_s (local.get $r) (i32.const 0))))
            (local.set $a (select (local.get $a) (i32.const 1023) (i32.lt_u (local.get $a) (i32.const 1024))))
            (local.set $p (i32.add (local.get $magHist) (i32.shl (local.get $a) (i32.const 2))))
            (i32.store (local.get $p) (i32.add (i32.load (local.get $p)) (i32.const 1)))))
          (local.set $s (i32.sub (local.get $s) (i32.const 1)))
          (br_if $coefficient (local.get $s)))
        (local.set $p (i32.add (local.get $nzHist) (i32.shl (local.get $nz) (i32.const 2))))
        (i32.store (local.get $p) (i32.add (i32.load (local.get $p)) (i32.const 1)))
        (local.set $total (i32.add (local.get $total) (local.get $nz)))
        (local.set $x (i32.add (local.get $x) (i32.const 1))) (br $block)))
      (local.set $y (i32.add (local.get $y) (i32.const 1))) (br $row)))
    (local.get $total))

  (func (export "cflEobCost") (param $yp i32) (param $cp i32) (param $mul i32) (param $order i32)
    (param $nzBits i32) (param $zeroBits i32) (param $nzBase i32) (param $magBits i32)
    (param $width i32) (param $rows i32) (param $stride i32) (param $tx i32) (param $fi i32) (result f64)
    (local $y i32) (local $x i32) (local $x0 i32) (local $x1 i32) (local $at i32) (local $s i32) (local $k i32)
    (local $nz i32) (local $last i32) (local $r i32) (local $a i32) (local $mp i32) (local $off i32)
    (local $magnitudes f64) (local $cost f64) (local $blockCost f64)
    (local.set $x0 (i32.shl (local.get $tx) (i32.const 3)))
    (local.set $x1 (i32.add (local.get $x0) (i32.const 8)))
    (if (i32.gt_u (local.get $x1) (local.get $width)) (then (local.set $x1 (local.get $width))))
    (local.set $mp (i32.add (local.get $mul) (i32.shl (local.get $fi) (i32.const 8))))
    (block $done (loop $row
      (br_if $done (i32.ge_u (local.get $y) (local.get $rows)))
      (local.set $x (local.get $x0))
      (block $rowDone (loop $block
        (br_if $rowDone (i32.ge_u (local.get $x) (local.get $x1)))
        (local.set $at (i32.shl (i32.add (i32.mul (local.get $y) (local.get $stride)) (local.get $x)) (i32.const 7)))
        (local.set $s (i32.const 63)) (local.set $nz (i32.const 0)) (local.set $last (i32.const 0)) (local.set $magnitudes (f64.const 0))
        (loop $coefficient
          (local.set $k (i32.load (i32.add (local.get $order) (i32.shl (local.get $s) (i32.const 2)))))
          (local.set $r (call $cflResidualAt (i32.add (local.get $yp) (local.get $at))
            (i32.add (local.get $cp) (local.get $at)) (local.get $mp) (local.get $k)))
          (if (local.get $r) (then
            (if (i32.gt_u (i32.add (local.get $r) (i32.const 32768)) (i32.const 65535)) (then (return (f64.const 1e18))))
            (if (i32.eqz (local.get $last)) (then (local.set $last (local.get $s))))
            (local.set $nz (i32.add (local.get $nz) (i32.const 1)))
            (local.set $a (select (i32.sub (i32.const 0) (local.get $r)) (local.get $r) (i32.lt_s (local.get $r) (i32.const 0))))
            (local.set $magnitudes (f64.add (local.get $magnitudes)
              (f64.promote_f32 (f32.load (i32.add (local.get $magBits) (i32.shl (local.get $a) (i32.const 2)))))))))
          (local.set $s (i32.sub (local.get $s) (i32.const 1))) (br_if $coefficient (local.get $s)))
        (local.set $off (i32.shl (local.get $nz) (i32.const 2)))
        (local.set $blockCost (f64.promote_f32 (f32.load (i32.add (local.get $nzBits) (local.get $off)))))
        (if (local.get $nz) (then
          (local.set $blockCost (f64.add (f64.add (f64.add (local.get $blockCost)
            (f64.mul (f64.convert_i32_s (i32.sub (local.get $last) (local.get $nz)))
              (f64.promote_f32 (f32.load (i32.add (local.get $zeroBits) (local.get $off))))))
            (f64.mul (f64.convert_i32_s (local.get $nz))
              (f64.promote_f32 (f32.load (i32.add (local.get $nzBase) (local.get $off)))))) (local.get $magnitudes)))))
        (local.set $cost (f64.add (local.get $cost) (local.get $blockCost)))
        (local.set $x (i32.add (local.get $x) (i32.const 1))) (br $block)))
      (local.set $y (i32.add (local.get $y) (i32.const 1))) (br $row)))
    (local.get $cost))

  (func (export "cflMoments") (param $yp i32) (param $cp i32) (param $sc i32) (param $order i32)
    (param $width i32) (param $rows i32) (param $stride i32) (param $tx i32) (param $out i32)
    (local $y i32) (local $x i32) (local $x0 i32) (local $x1 i32) (local $at i32) (local $s i32) (local $k i32)
    (local $w f64) (local $num f64) (local $den f64)
    (local.set $x0 (i32.shl (local.get $tx) (i32.const 3)))
    (local.set $x1 (i32.add (local.get $x0) (i32.const 8)))
    (if (i32.gt_u (local.get $x1) (local.get $width)) (then (local.set $x1 (local.get $width))))
    (block $done (loop $row
      (br_if $done (i32.ge_u (local.get $y) (local.get $rows)))
      (local.set $x (local.get $x0))
      (block $rowDone (loop $block
        (br_if $rowDone (i32.ge_u (local.get $x) (local.get $x1)))
        (local.set $at (i32.shl (i32.add (i32.mul (local.get $y) (local.get $stride)) (local.get $x)) (i32.const 7)))
        (local.set $s (i32.const 63))
        (loop $coefficient
          (local.set $k (i32.load (i32.add (local.get $order) (i32.shl (local.get $s) (i32.const 2)))))
          (local.set $w (f64.mul
            (f64.convert_i32_s (i32.load16_s (i32.add (local.get $yp) (i32.add (local.get $at) (i32.shl (local.get $k) (i32.const 1))))))
            (f64.convert_i32_s (i32.load (i32.add (local.get $sc) (i32.shl (local.get $k) (i32.const 2)))))))
          (local.set $num (f64.add (local.get $num) (f64.mul (local.get $w)
            (f64.convert_i32_s (i32.load16_s (i32.add (local.get $cp) (i32.add (local.get $at) (i32.shl (local.get $k) (i32.const 1)))))))))
          (local.set $den (f64.add (local.get $den) (f64.mul (local.get $w) (local.get $w))))
          (local.set $s (i32.sub (local.get $s) (i32.const 1))) (br_if $coefficient (local.get $s)))
        (local.set $x (i32.add (local.get $x) (i32.const 1))) (br $block)))
      (local.set $y (i32.add (local.get $y) (i32.const 1))) (br $row)))
    (f64.store (local.get $out) (local.get $num)) (f64.store offset=8 (local.get $out) (local.get $den)))

  (func $jpegNzBucket (param $n i32) (result i32)
    (if (result i32) (i32.lt_u (local.get $n) (i32.const 2)) (then (local.get $n))
      (else (if (result i32) (i32.lt_u (local.get $n) (i32.const 4)) (then (i32.const 2))
        (else (if (result i32) (i32.lt_u (local.get $n) (i32.const 8)) (then (i32.const 3))
          (else (if (result i32) (i32.lt_u (local.get $n) (i32.const 16)) (then (i32.const 4))
            (else (if (result i32) (i32.lt_u (local.get $n) (i32.const 26)) (then (i32.const 5))
              (else (select (i32.const 6) (i32.const 7) (i32.lt_u (local.get $n) (i32.const 40))))))))))))))
  (func (export "jpegSignatureHistogram") (param $cp i32) (param $width i32) (param $rows i32) (param $stride i32)
    (param $dim i32) (param $dc i32) (param $buckets i32) (param $low i32) (param $out i32)
    (local $y i32) (local $x i32) (local $k i32) (local $base i32) (local $dst i32)
    (local $v i32) (local $a i32) (local $nz i32) (local $last i32) (local $bin i32) (local $p i32)
    (block $done (loop $row
      (br_if $done (i32.ge_u (local.get $y) (local.get $rows))) (local.set $x (i32.const 0))
      (block $rowDone (loop $block
        (br_if $rowDone (i32.ge_u (local.get $x) (local.get $width)))
        (local.set $base (i32.add (local.get $cp) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $stride)) (local.get $x)) (i32.const 7))))
        (local.set $dst (i32.add (local.get $out) (i32.shl (i32.mul (i32.load8_u (i32.add (local.get $buckets)
          (i32.sub (i32.load (i32.add (local.get $dc) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $width)) (local.get $x)) (i32.const 2))))
            (local.get $low)))) (local.get $dim)) (i32.const 3))))
        (local.set $k (i32.const 63)) (local.set $nz (i32.const 0)) (local.set $last (i32.const 0))
        (loop $coefficient
          (local.set $v (i32.load16_s (i32.add (local.get $base) (i32.shl (local.get $k) (i32.const 1)))))
          (if (local.get $v) (then
            (if (i32.eqz (local.get $last)) (then (local.set $last (local.get $k))))
            (local.set $nz (i32.add (local.get $nz) (i32.const 1)))
            (local.set $a (select (i32.sub (i32.const 0) (local.get $v)) (local.get $v) (i32.lt_s (local.get $v) (i32.const 0))))
            (local.set $bin (if (result i32) (i32.eq (local.get $dim) (i32.const 16))
              (then (if (result i32) (i32.eq (local.get $a) (i32.const 1)) (then (i32.const 9))
                (else (i32.add (i32.const 9) (select (i32.sub (i32.const 31) (i32.clz (local.get $a))) (i32.const 6) (i32.lt_u (local.get $a) (i32.const 64)))))))
              (else (if (result i32) (i32.eq (local.get $a) (i32.const 1)) (then (i32.const 4))
                (else (if (result i32) (i32.lt_u (local.get $a) (i32.const 4)) (then (i32.const 5))
                  (else (select (i32.const 6) (i32.const 7) (i32.lt_u (local.get $a) (i32.const 16))))))))))
            (local.set $p (i32.add (local.get $dst) (i32.shl (local.get $bin) (i32.const 3))))
            (f64.store (local.get $p) (f64.add (f64.load (local.get $p)) (f64.const 1)))))
          (local.set $k (i32.sub (local.get $k) (i32.const 1))) (br_if $coefficient (local.get $k)))
        (if (i32.gt_u (local.get $last) (local.get $nz)) (then
          (local.set $p (i32.add (local.get $dst) (select (i32.const 64) (i32.const 24) (i32.eq (local.get $dim) (i32.const 16)))))
          (f64.store (local.get $p) (f64.add (f64.load (local.get $p)) (f64.convert_i32_s (i32.sub (local.get $last) (local.get $nz)))))))
        (local.set $bin (if (result i32) (i32.eq (local.get $dim) (i32.const 16)) (then (call $jpegNzBucket (local.get $nz)))
          (else (if (result i32) (i32.eqz (local.get $nz)) (then (i32.const 0))
            (else (select (i32.const 1) (i32.const 2) (i32.lt_u (local.get $nz) (i32.const 4))))))))
        (local.set $p (i32.add (local.get $dst) (i32.shl (local.get $bin) (i32.const 3))))
        (f64.store (local.get $p) (f64.add (f64.load (local.get $p)) (f64.const 2)))
        (local.set $x (i32.add (local.get $x) (i32.const 1))) (br $block)))
      (local.set $y (i32.add (local.get $y) (i32.const 1))) (br $row))))

  (func (export "jpegHistograms") (param $cp i32) (param $width i32) (param $rows i32) (param $stride i32)
    (param $buckets i32) (param $lumaWidth i32) (param $hs i32) (param $vs i32) (param $out i32)
    (local $y i32) (local $x i32) (local $k i32) (local $base i32) (local $dst i32)
    (local $v i32) (local $a i32) (local $nz i32) (local $last i32) (local $bin i32) (local $p i32)
    (block $done (loop $row
      (br_if $done (i32.ge_u (local.get $y) (local.get $rows))) (local.set $x (i32.const 0))
      (block $rowDone (loop $block
        (br_if $rowDone (i32.ge_u (local.get $x) (local.get $width)))
        (local.set $base (i32.add (local.get $cp) (i32.shl (i32.add (i32.mul (local.get $y) (local.get $stride)) (local.get $x)) (i32.const 7))))
        (local.set $dst (i32.add (local.get $out) (i32.shl (i32.load8_u (i32.add (local.get $buckets)
          (i32.add (i32.mul (i32.shl (local.get $y) (local.get $vs)) (local.get $lumaWidth))
            (i32.shl (local.get $x) (local.get $hs))))) (i32.const 8))))
        (local.set $k (i32.const 63)) (local.set $nz (i32.const 0)) (local.set $last (i32.const 0))
        (loop $coefficient
          (local.set $v (i32.load16_s (i32.add (local.get $base) (i32.shl (local.get $k) (i32.const 1)))))
          (if (local.get $v) (then
            (if (i32.eqz (local.get $last)) (then (local.set $last (local.get $k))))
            (local.set $nz (i32.add (local.get $nz) (i32.const 1)))
            (local.set $a (select (i32.sub (i32.const 0) (local.get $v)) (local.get $v) (i32.lt_s (local.get $v) (i32.const 0))))
            (local.set $bin (i32.sub (i32.const 31) (i32.clz (local.get $a))))
            (if (i32.gt_u (local.get $bin) (i32.const 9)) (then (local.set $bin (i32.const 9))))
            (local.set $p (i32.add (local.get $dst) (i32.shl (i32.add (local.get $bin)
              (select (i32.const 12) (i32.const 22) (i32.lt_u (local.get $k) (i32.const 16)))) (i32.const 3))))
            (f64.store (local.get $p) (f64.add (f64.load (local.get $p)) (f64.const 1)))))
          (local.set $k (i32.sub (local.get $k) (i32.const 1))) (br_if $coefficient (local.get $k)))
        (local.set $p (i32.add (local.get $dst) (i32.shl (call $jpegNzBucket (local.get $nz)) (i32.const 3))))
        (f64.store (local.get $p) (f64.add (f64.load (local.get $p)) (f64.const 1)))
        (if (i32.gt_u (local.get $last) (local.get $nz)) (then
          (local.set $bin (if (result i32) (i32.lt_u (local.get $nz) (i32.const 4)) (then (i32.const 8))
            (else (if (result i32) (i32.lt_u (local.get $nz) (i32.const 12)) (then (i32.const 9))
              (else (select (i32.const 10) (i32.const 11) (i32.lt_u (local.get $nz) (i32.const 28))))))))
          (local.set $p (i32.add (local.get $dst) (i32.shl (local.get $bin) (i32.const 3))))
          (f64.store (local.get $p) (f64.add (f64.load (local.get $p)) (f64.convert_i32_s (i32.sub (local.get $last) (local.get $nz)))))))
        (local.set $x (i32.add (local.get $x) (i32.const 1))) (br $block)))
      (local.set $y (i32.add (local.get $y) (i32.const 1))) (br $row))))

)
