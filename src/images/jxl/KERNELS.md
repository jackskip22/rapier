# Optional integer kernels

The small `index.mjs` and `effort.mjs` doors remain JavaScript. To opt in, import
`encode` / `encodeSteps` from `rapier-jxl/wasm` instead of `rapier-jxl/effort`.
This door keeps the effort API, automatically tries SIMD, and falls back to the
reference JavaScript if WebAssembly or SIMD is absent or blocked by policy.
It changes neither lossless bytes nor the hurry rule. Rapier's full image worker
opts in automatically; the document-only worker still ships no encoder.

The public repository also builds **`wasm.min.mjs`**, one self-contained module.
The package marks these two entry modules as side-effectful so bundlers retain
their automatic backend configuration.
Do not combine `kernels.min.mjs` with a separately bundled core: each bundle would
own different hooks. There is deliberately no separate minified control door.
Readable modules can share controls through `rapier-jxl/kernels`:

```js
import {encode, configureKernels, kernelMode} from 'rapier-jxl/wasm';
configureKernels('auto'); // 'off', 'scalar', or 'simd' are explicit alternatives
const bytes = encode(rgba, width, height, {effort: 3, quality: 100});
console.log(kernelMode()); // the actual backend, not merely the requested one
```

Configure once before an encode, not inside its progress callback. Controls are
per JavaScript realm; workers have independent arenas. A second argument selects
kernels for deterministic benchmarks, for example `{channel: true, weighted:
false, fill: false}`. This only changes where arithmetic runs, never its result.

## What ships

`kernels-scalar.wat` implements prediction, weighted prediction and property
extraction, token histograms and a bulk bit writer. `kernels-simd.wat` implements
four-pixel average/gradient prediction and RGBA-to-planar conversion; rows and
odd tails take an explicit scalar path. Weighted prediction stays scalar: its
west-error state is sequential. Both modules use bounded integer arithmetic,
including signed i64 floor division for the weighted average. No relaxed SIMD,
floating-point WASM, imports other than private memory, network access, shared
memory, threads, or runtime dependencies are used.

The private arena is 3 MiB per enabled realm, reused synchronously. No views escape.
Groups are at most 65,536 samples; Int16 planes, unit multipliers and bounded
offsets are admitted. Other planes and custom writers keep the JavaScript path.
Non-little-endian hosts keep JavaScript as well. The existing input and output
limits remain in force. SIMD detection calls `WebAssembly.validate` on the tiny
`kernels-probe.wat` module; failure does not disable the encoder.

## Rebuild

The checked-in `kernels-bytes.mjs` contains generated base64 bytes, not source to
edit. In the Rapier tree run `node repo/images/build-jxl-kernels.mjs`; in a staged
public repository run `node build-jxl-kernels.mjs`. Install **wabt 1.0.37** only as
a build tool. `WABT_MODULE` may point to its `index.js` outside the source tree.
Add `--check` to reject a generated file that differs. No compiler ships in the
inline encoder. Source and build script are retained in the public package.

The kernels were first compiled with a bootstrap compiler in a network-restricted
sandbox; an independent wabt rebuild is outstanding. Do not describe the
build as wabt-certified until `--check` has been run with wabt.
