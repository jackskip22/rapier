# Rapier's JPEG XL encoder

Rapier's own JPEG XL encoder: JavaScript reference, MIT (`LICENSE`), no runtime dependency. The core needs no
WebAssembly or build step; the optional `wasm.mjs` effort door uses inlined integer/SIMD kernels and falls back to
JavaScript. `KERNELS.md` documents that door, its private arena and reproducible WAT source. It
writes what Rapier keeps and nothing more: 8-bit grey, grey with alpha, RGB and RGBA pictures as bare codestreams
that every JPEG XL decoder reads, the same bytes in every JavaScript engine.

The doors (`package.json`'s exports, each with its declaration beside it):

- `index.mjs`, the core: `encode(rgba, width, height, {quality})`. Quality 100 is exact (`lossless.mjs`: an opaque
  alpha dropped, a grey picture one channel, up to 2,048 colours a palette when smaller, reversible YCoCg, gradient
  or average prediction chosen by samples, one prefix code per channel whose hybrid-integer configuration is the
  cheapest of four by exact price (`lossless-coding.mjs`), zero runs as LZ77, 256-pixel groups); below
  100 is lossy modular (`lossy.mjs`, `squeeze.mjs`: YCoCg, Squeeze, a quantiser per channel on libjxl's
  quality-to-distance curve, alpha exact), a few-colour picture answered exact when that is smaller.
- `effort.mjs`: the core's `encode` with a search above it for exact pictures, `{effort}` 1 to 9, each door running
  its highest rung at or below the ask. Effort 1, the default, is the core's bytes; 2 prices the specification's
  weighted predictor for every channel (`weighted.mjs`, integer throughout); 3 splits a channel's tokens by that
  predictor's own error at libjxl's cut points, neighbours merged where a shared code costs less (exact dynamic
  programming). Each plan is priced exactly (its tree and histograms as written, every token's code and raw bits);
  the two rungs' plans are both written when their prices lie within what padding and the table of contents can
  move. Rung 4 adds per-group trees for palette indices (`local.mjs`) and a search of the 42 reversible colour
  transforms ranked on three small samples, written in full only for the best of them and kept only when that
  complete stream is smaller (`rct-search.mjs`). From rung 3, screen palettes, repeated residual runs and a glyph
  dictionary also compete. Rung 5 adds 1,024-pixel groups, exact row-match hints, predictor prices after matching
  and broader atlas and palette searches (`screen*.mjs`); rung 6 also models direct and palette planes
  with splits on the unclamped gradient and the west-minus-northwest difference. Every complete candidate competes
  against the smaller streams already written. Efforts 7 through 9 use rung 6. A stream is never larger than the effort below,
  effort 1's on a tie. A lossy request is effort 1's. The
  core stays rung 1 until a rung's table shows every importer gains.
- `{treeLearning: 'sampled'}` on `effort.mjs` selects bounded deterministic tree learning (`sampled.mjs`): efforts
  2/3 share a model sampled across the image (1,024 samples per channel, eight leaves); 4..9 also try group models
  (2,048 samples per channel, sixteen leaves, weighted prediction and reference properties). Each model is priced
  against its one-context alternative using the actual tokens. Complete streams compete against effort 1, and the
  richer rung keeps the cheaper sampled result. A hurry at any step returns effort 1 exactly. Effort 1 and lossy
  requests keep their ordinary paths; omitting the option keeps the ordinary search.
- `jpeg.mjs`: `transcode(jpeg, {effort})`, a JPEG carried as its coefficients into a VarDCT frame the way libjxl transcodes one
  (`jfif.mjs` reads the scans: baseline, extended and progressive, restarts, 8-bit, grey or three components, an Exif
  orientation; `vardct.mjs` and `entropy.mjs` write the frame, contexts clustered into prefix codes). A JPEG it does
  not take is JXL_JPEG.
- `photo.mjs`: `encodePhoto(rgba, width, height, {quality, effort})`, pixels through the same VarDCT writer (YCbCr,
  DCT8, quantisation), quality 90 and effort 1 by default. Effort 5 adds quantisation per block and rate/error
  rounding (`photo-quant.mjs`). The complete preceding stream stands unless the candidate is smaller. Its
  reconstruction budget is effort 1's squared unclipped RGB sample AC error on edge-extended blocks, using the stored
  half-precision scale and default coefficient bias, before clipping and integer rounding; decoded integer RGB
  error can increase. DC and alpha do not change.
- `writer.mjs`, for a module's author: the layers beneath the doors, readable only, changed only with the package's
  major version.
- `jpeg-ans.mjs` and `photo-ans.mjs`: the corresponding checked door with an optional shared ANS candidate at
  effort 2. Their default remains prefix effort 1. The ordinary doors and page do not import ANS.

Every pixel door takes `{colorSpace: 'srgb' | 'display-p3'}`, declared in the header by enumeration (`frame.mjs`, 21
bits for Display P3), the samples written as they are; the carrier reads a JPEG's ICC profile by what it does
(`jfif.mjs`, `profileSpace`: the colorants and every channel's curve) and declares sRGB or Display P3, or refuses.

The JPEG and photograph doors read effort, default 1. Effort 2 keeps effort 1's work; 3 also tries a 32-cluster
budget at creation cost 160; 4 also tries one coefficient order learned from integer nonzero counts. Each keeps
the smaller complete stream. These entropy rungs preserve exactly the same reconstructed pixels.
Their search uses `coefficient-effort.mjs`; the broader measured DC-bucket and cluster-budget searches stay
outside the package.

The optional doors share admission in `jpeg-job.mjs` and `photo-job.mjs`, and search in `coefficient-ans.mjs`.
`ans.mjs` normalizes integer frequencies to 4,096, writes the histogram, and reverses tokens within one bounded
group. Its group buffer is 1,376,256 bytes; neither the core nor the ordinary doors carry it. A completed prefix
floor survives hurry and candidate size or allocation failure. The final group's yield already owns a completed
candidate and cannot discard it on a late hurry. Higher efforts include the ordinary prefix candidates.

The 2.1.0 photo fit changes only the existing quantiser's luma/chroma/DC constants (10, 18, 0.25); its arithmetic
series, DCT8 basis and runtime mechanism stay the same. Existing lossy photo seed hashes were regenerated. The core and carrier's unhurried bytes do not change.

Each door has a twin that does its work in steps (`encodeSteps`, `transcodeSteps`, `encodePhotoSteps`): a job
(`admit.mjs`) whose steps are one group of one pass (`lossless.mjs`, `lossy.mjs`, `vardct.mjs` as generators), the
fraction done in (0, 1], the last exactly 1, the bytes the door's. The one-call doors run the same steps to the end.
A job's `hurry` ends a door's search at its next step with the smallest stream written so far, effort 1's
at least.

Every core: `pool.mjs` runs the effort door's exact work (`effort-job.mjs`) over a pool of workers the caller
starts, with the same bytes for any number of them. Each pass over a frame's groups is a function of the pass's
setup and one group's pixels (`planGroup`, `searchGroup`, `localGroup`, `sampledGroup`, frame.mjs `groupPass`); a worker keeps its
groups' pixels for the whole picture, counts are added and sections placed in group order, and every choice stays
in the calling thread, which codes groups too and takes over a worker that fails. `encodePool(data, width, height,
options, {spawn, workers})` is an async job (`for await`, `hurry`, `bytes`); a worker's script hands each message to
`servePool` and posts back its answer. Rapier's image worker starts copies of itself as the pool (`images/encoder.mjs`).

The layers: `admit.mjs` (the options, the limits, the five codes every door refuses with, and the job),
`modular.mjs` (trees, transforms, channel residuals), `weighted.mjs` (the self-correcting predictor and its error
property), `prefix.mjs` (prefix codes and histogram bundles; never ANS), `frame.mjs` (signature, headers, table of
contents), `bits.mjs` (the bit writer, each door's limits, and running steps).

Each door's `LIMITS` sets its pixels by its memory (`bits.mjs`), so that none needs more at its limit than the core's
lossy path at 24 million (15.7 bytes a pixel at its peak besides the input, about 473 MB with it): the core and the
effort door 24 million, the photo door 40 million (6.5 bytes a pixel, 421 MB at its limit), the carrier 64 million
(3.3 bytes a pixel at 4:2:0 and 6.4 at 4:4:4, 412 MB at its limit), so a phone's 24 and 48 megapixel JPEGs are
carried. Every door's edge is 16,384 and its stream 16 MiB. The page takes a JPEG and a stored JPEG XL to the
carrier's limit and every picture it encodes from pixels to the core's (`images/header.mjs`).
Those memory figures describe the default paths. The photo quantisation search estimates its additional score
arrays and retained streams against that working budget, keeping the preceding stream if the estimate exceeds
it. This estimate is not a guarantee about a JavaScript engine's resident-set high water; the door's input limits
do not change with effort. Scoring, selection and materialisation yield at most every 1,024 blocks.
Nothing that decides a byte calls a function engines round differently; `tools/stage-jxl-repo.mjs` refuses a module
that does.

Where a decoder people run misreads a valid stream and an equally valid one costs no bytes to speak of, the encoder
writes that one (jxl-rs 0.7.4, the decoder Chrome ships): the photo door's table denominator is a normal binary16, its
blocks' quantisation field carrying the factor (`vardct.mjs`); a colour picture one pixel wide or high names its
Squeeze steps; lossy modular's groups are 1,024 pixels, so a picture up to 8,192 on a side is one DC group
(`lossy.mjs`). Each decodes to the same pixels as before through jxl-oxide and libjxl.

`images/encoder.mjs` is the page's adapter over the doors (a request the page marks `photo`, a photograph it turned,
resized or converted, goes to `encodePhoto` unless the picture has few colours; the rest go to the effort door, an
exact picture at effort 3 with its search a second after effort 1 ends, effort 1's stream the floor),
`images/codec.mjs` the worker, `images/codec-build.mjs` the build that concatenates the modules into it. The
retained rows `jxl-encoder-paths` and `paint-picture-lossless` decode every stream through the development decoder
(`tools/vendor/jxl-oxide`) and compare the pixels; the public suite's byte cases (`public/test/bytes.test.mjs`) hold
the streams' hashes under Node and Bun.
