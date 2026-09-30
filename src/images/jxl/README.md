# Rapier's JPEG XL encoder

Rapier's own JPEG XL encoder: pure JavaScript, MIT (`LICENSE`), no WebAssembly, no build step, no dependency.
It writes what Rapier keeps and nothing more: 8-bit grey, grey with alpha, RGB and RGBA pictures as bare
codestreams that every JPEG XL decoder reads.

- `lossless.mjs`: exact pictures on the design of libjxl's fast lossless path. An opaque alpha is dropped and a
  grey picture keeps one channel; up to 512 colours become a palette; colour goes through the reversible YCoCg
  transform; every channel is predicted by the clamped gradient and coded with one prefix code per channel,
  runs of zero residuals as LZ77 copies; groups of 256x256 pixels, each an independent section.
- `lossy.mjs`: lossy modular as libjxl encodes it: YCoCg, the Squeeze transform to its default depth, then each
  squeezed channel quantised by a step that halves with every level (chroma coarser than luma, alpha finer),
  carried as the multiplier of that channel's tree leaf. Quality maps to libjxl's distance (90 is 1.0).
  A picture of few colours is answered exact when that is fewer bytes.
- `vardct.mjs`, `jpeg.mjs`, `entropy.mjs`: a JPEG carried whole into a VarDCT frame, the way libjxl transcodes one:
  the JPEG's quantised coefficients read from its Huffman scans (baseline, extended sequential and progressive, with
  restarts; 8-bit, grey or three components; an Exif orientation kept in the header), its quantisation tables as raw
  dequantisation matrices, its DC as the DC image, its colour and subsampling kept, no filters, no smoothing. Only
  the entropy coding changes: the specification's coefficient contexts, luma blocks bucketed by their DC when that
  costs less, the contexts clustered into a few dozen prefix codes. A JPEG the carrier does not take (arithmetic
  coding, 12-bit, lossless, CMYK, a DNL height) is JXL_JPEG and the picture is decoded and encoded instead.
- `modular.mjs`: trees (one leaf per channel, one subtree per section), transforms, channel residuals.
- `prefix.mjs`: prefix codes and histogram bundles (the Brotli-derived code header, the simple and the
  entropy-coded context map). Every stream uses prefix codes, never ANS.
- `frame.mjs`: the codestream around a frame: signature, size, image metadata, frame header, table of contents.
- `squeeze.mjs`, `bits.mjs`: the forward Squeeze and the bit writer.

`images/encoder.mjs` is the adapter the worker calls (`encode(rgba, width, height, {quality})` and `transcode(jpeg)`),
`images/codec.mjs` the worker, `images/codec-build.mjs` the build that concatenates these modules into it. The retained rows
`jxl-encoder-paths` and `paint-picture-lossless` decode every stream through the development decoder
(`tools/vendor/jxl-oxide`) and compare the pixels.
