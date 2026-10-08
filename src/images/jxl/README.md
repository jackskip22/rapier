# Rapier JXL

JavaScript JPEG XL encoder sources. The core encodes typed RGBA samples; separate entry points add lossless search,
JPEG coefficient conversion, photographic encoding, source readers, Exif/XMP, and optional WebAssembly kernels.

[Public README](PUBLIC-README.md) · [API](public/API.md) · [Entry points and embedding](public/ARCHITECTURE.md) ·
[Kernels](KERNELS.md) · [Package exports](package.json)

## Modules

| Modules | Responsibility |
| --- | --- |
| `admit.mjs`, `bits.mjs` | Typed input, options, limits, errors, bit writing, and incremental jobs. |
| `frame.mjs`, `modular.mjs`, `prefix.mjs` | Image/frame headers, groups, trees, transforms, and prefix entropy coding. |
| `lossless.mjs`, `lossless-coding.mjs` | Shared byte/native group planning, palette/direct candidates, residual pricing, and native quantization. |
| `lossy.mjs`, `squeeze.mjs` | Lossy modular encoding for ordinary byte samples. |
| `effort-job.mjs` | Lossless candidate order, incumbent selection, progress, and hurry handling. |
| `weighted.mjs`, `local.mjs`, `sampled.mjs` | Weighted prediction, local models, and deterministic tree/predictor learning. |
| `rct-search.mjs`, `screen*.mjs` | Reversible color transforms, screen palettes, residual matches, and repeated glyphs. |
| `ans.mjs` | ANS histogram and token coding, including learned lossless groups at effort 6 and above. |
| `pool.mjs` | Worker tile ownership, group dispatch, ordered results, and local recovery after worker failure. |
| `jfif.mjs`, `jpeg-job.mjs`, `photo-job.mjs`, `photo-dct.mjs`, `photo-quant.mjs` | JPEG input, photographic DCT, quantization, and checked jobs. |
| `vardct.mjs`, `entropy.mjs`, `coefficient-*.mjs` | Shared coefficient coding and JPEG/photo entropy search. |
| `source.mjs` | PNG16/OpenEXR samples and supported color/alpha declarations. |
| `metadata.mjs` | Exif/XMP container boxes without changing image coding. |
| `kernel-hooks.mjs`, `kernels.mjs`, `wasm.mjs` | Optional integer acceleration with identical JavaScript output. |
| `index.mjs`, `effort.mjs`, `jpeg.mjs`, `photo.mjs`, `*-ans.mjs`, `writer.mjs` | Public entry points and typed format primitives. |

The core excludes compression search, ANS, JPEG/photo processing, file readers, metadata, and WASM. Readable entry points
share ES modules; each minified entry point includes its dependencies in one file.

## Search

Effort 1 writes the core's bytes. Efforts 2–3 add weighted prediction, error contexts, and screen coding. Efforts
4–5 add shared and per-group learned trees, local palette models, color-transform search, and broader screen
matching. Efforts 6–9 add joint predictor/context learning, per-group prefix/ANS selection, and increasing sample
budgets. Higher levels retain the lower-level candidates. The explicit `treeLearning: 'sampled'` option selects a
separate reduced search; its hurry result is effort 1.

Native integer effort 2 also compares untransformed RGB. Floating-point lossless encoding has no additional effort
search. JPEG and photo entry points have their own coefficient search; their optional ANS entry points add ANS
candidates from effort 2. See the API for exact options, budgets, and reconstruction bounds.

## Invariants

- Quality 100 preserves source samples, including hidden RGB. Alpha remains exact at every quality. Color and
  alpha declarations describe the input without conversion or unpremultiplication.
- Integer inputs up to 12 bits produce bare codestreams. The 16-bit integer and floating-point formats include a
  level 10 container declaration. Native lossy integer values use quantization-bin midpoints; floats round mantissas.
- The same input and options produce identical bytes across JavaScript engines, workers, and optional kernels.
  Format decisions use integer arithmetic or explicit deterministic floating-point operations.
- Only a strictly smaller complete stream replaces the incumbent; ties preserve the earlier candidate. A later
  size or allocation failure leaves a completed result available.
- Completed sections and exact Huffman data bounds reject candidates that cannot improve the incumbent.
  Pruning rejects one candidate without hurrying the job.
  A final yield that owns a completed candidate preserves that candidate when hurry arrives.
- Worker results are assembled in group order. Group dimensions belong to each pass; worker count and completion
  order do not change the output. Input arrays remain unchanged.
- Group buffers bound pixel work; sample and leaf budgets bound tree learning. Admission limits do not guarantee
  that every device can allocate the largest image at every effort or worker count.

The public tests cover decoder agreement, deterministic bytes, native precision, progress, cancellation, kernels,
and worker fallback. `tools/stage-jxl-repo.mjs` builds self-contained modules, checks them against readable entry
points, and fills payload-size placeholders in the public documentation.
