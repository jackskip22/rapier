# Rapier's JPEG XL encoder

This is a specialized build of Jixel 0.2.27, retaining its existing coding algorithms.
It writes ordinary JPEG XL. The browser worker contract remains
`encode(rgba, width, height, {quality, effort})`: fast lossless, stronger Modular
lossless, lossy RGB, and lossy RGBA all remain available.

`specialize.py` materializes the checksum-pinned upstream crate into `target/jixel`
and fixes the configuration already imposed by the private wrapper:

- 8-bit RGB/RGBA, sRGB, normal orientation, no attached metadata or HDR gain map.
- Fast encoding speed, Slow decoding-speed setting, one thread, one pass, no patches.
- The existing adaptive quantization, matrices, weighted predictor and Dark AQ stay.
- Alpha, dimensions, pixels, lossless selection and quality/distance remain variable.

The compiler can then discard unreachable general-purpose paths. No quantizer,
predictor, entropy code, colour conversion or active coding choice is replaced.
In particular, `EncodeConfig::default().boost` is `Some(DarkAqConfig::default())`,
despite an upstream field comment saying otherwise. Do not disable it.

The crate is not committed: crates.io keeps it unchanged under its checksum. Before
a rebuild, fetch it beside this file,
`curl -sSfLo jixel-0.2.27.crate https://static.crates.io/crates/jixel/jixel-0.2.27.crate`,
and the recipe refuses any other bytes.

The recipe verifies both the original crate and `src/lib.rs` before generating
anything. A wrapper change or upstream upgrade requires reviewing the fixed
configuration. This derivative is private to the WASM wrapper; upstream's other
APIs and nondefault configuration tests are not its contract. Ordinary Rapier
builds use the checked binary and need neither Rust nor Python nor Binaryen.

Rust uses `opt-level="s"`. The more size-aggressive `z` build made stronger
Modular lossless encoding substantially slower, despite identical output.
The selected build keeps a smaller module while improving the measured speed.
Recheck both size and fresh-process timings when changing compiler settings.

## Rebuild the encoder

Use Rust/Cargo 1.94.1, `wasm32-unknown-unknown`, Python 3.12 or later and Binaryen
132.0.0. `PROVENANCE.json` records the original crate, generated source and binary
digests. From this directory:

```sh
python3 specialize.py
rustup target add wasm32-unknown-unknown
RUSTFLAGS="--remap-path-prefix=$(pwd)=rapier-jxl-encoder" \
  cargo build --locked --release --target wasm32-unknown-unknown
wasm-opt target/wasm32-unknown-unknown/release/rapier_jxl_encoder.wasm \
  --enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext \
  --flatten --rereloop -Oz -Oz -Oz --flatten --rereloop -Oz -Oz \
  --skip-pass=merge-similar-functions -o target/encode.wasm
node --input-type=module - <<'JS'
import {readFile, writeFile} from 'node:fs/promises';
import {zopfliGzip} from '../../../tools/zopfli.mjs';
await writeFile('encode.wasm.gz', await zopfliGzip(await readFile('target/encode.wasm')));
JS
```

Refresh the recorded digests only after checking the regenerated source and
binary. Keep the previous module outside the vendor directory for comparison.
From `repo/`:

```sh
node tools/probes/jxl-encoder-equivalence.mjs --a=/path/to/previous.wasm.gz \
  --same-output --no-decode --report=/path/to/receipt.json
node tools/probes/jxl-specialization.mjs /path/to/previous/repo /path/to/corpus 5
python3 tools/a27/native-decode.py /path/to/corpus/compare.json \
  /path/to/corpus /path/to/native-decode.json
node tools/witness-node.mjs jxl-encoder-paths paint-picture-lossless
```

The output-equivalence mode permits only private linear-memory contents to
change; exports, imports, memory declaration, raw answers, refusals and image
bytes must still match. Its original optimizer-only mode still requires the
entire private heap to match. Independent native decoding covers multi-group
lossy alpha, which the development jxl-oxide 0.12.6 cannot decode reliably.
The corpus probe reports alternating fresh Node process timings, preventing
cross-worker reuse of compiled WASM. It is not a phone benchmark and does not
include browser split-WASM reconstruction, transfer, layout or presentation.

## Packing and lifetime

`images/codec-build.mjs` checks the gzip and module digests, bounds the memory at
`JPEG_XL_LIMITS.memory`, and separates WASM opcodes from immediate operands before
Zopfli compression. `images/encoder.mjs` reconstructs the module byte for byte.
The page packs that worker into its own compressed text block. These are three
different size measurements: raw WASM, gzipped vendor file, and embedded HTML.

The worker adapter and all callers are unchanged. Ordinary painting remains
lossless. Opaque lossy input drops the unused alpha plane; nonopaque lossy input
uses the existing alpha rounding to multiples of eight. That rounding belongs
only to an already-requested lossy copy. The original lossless painting does not
change. Quality maps to distance exactly as before.

`merge-similar-functions` remains excluded from Binaryen: the previous build
found a small byte saving at a substantial runtime cost. No unsafe optimizer
assumptions or floating-point relaxations are enabled.
