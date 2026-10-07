# Imports and inlining

Choose one encoding import for the input and search required. `rapier-jxl` is the core; `/core` names it explicitly.
Effort and wasm contain the core's capabilities. JPEG coefficient carrying and photographic pixel encoding remain
separate imports. ANS is optional within those two paths.

| Need | Readable import | One self-contained file |
| --- | --- | --- |
| RGBA, lossless or lossy | `rapier-jxl/core` | `dist/rapier-jxl.min.mjs` |
| Smaller exact streams through search | `rapier-jxl/effort` | `dist/effort.min.mjs` |
| Effort with integer WebAssembly kernels | `rapier-jxl/wasm` | `dist/wasm.min.mjs` |
| Existing JPEG coefficients | `rapier-jxl/jpeg` | `dist/jpeg.min.mjs` |
| Photographic RGBA | `rapier-jxl/photo` | `dist/photo.min.mjs` |
| JPEG with ANS search | `rapier-jxl/jpeg-ans` | `dist/jpeg-ans.min.mjs` |
| Photographic RGBA with ANS search | `rapier-jxl/photo-ans` | `dist/photo-ans.min.mjs` |

Append `/min` to any import in the table for its one-file build through npm. `rapier-jxl/min` also selects the core.
For a page without a build step, copy the selected file beside the app and import its exports:

```js
import {encode} from './rapier-jxl.min.mjs';
const bytes = encode(rgba, width, height);
```

Each minified file contains its dependencies and MIT notice. No runtime fetch, decoder, external WASM file or
initialisation download is needed. The wasm file contains its kernels and automatically uses JavaScript when
WebAssembly or SIMD is unavailable.

For an app contained in one HTML file, embed the selected module's source as text and import a Blob URL:

```js
const url = URL.createObjectURL(new Blob([encoderSource], {type: 'text/javascript'}));
const {encode} = await import(url);
URL.revokeObjectURL(url);
```

`encoderSource` is the complete selected minified file, including its exports and licence notice. The page's content
security policy must allow that module URL. The same module can run in a module worker; scheduling, cancellation and
input transfers belong to the app. [Worker example](../../examples/worker.mjs) and [job contract](API.md#progress-and-cancellation).

## Shared source

Use readable imports when bundling several capabilities: their ES module graph shares common code once. Separate
minified files are self-contained and repeat shared code. A wasm bundle's kernel controls affect its own encoder;
configure that same import. Readable imports share the controls in `rapier-jxl/kernels`. Set controls before an encode.

| Boundary | Modules and responsibility |
| --- | --- |
| Checked entry and jobs | `admit.mjs`, `index.mjs`, `effort-job.mjs`, `jpeg-job.mjs`, `photo-job.mjs`: inputs, limits, errors, progress and complete results. |
| Shared format | `bits.mjs`, `prefix.mjs`, `frame.mjs`, `modular.mjs`: bit writing, entropy codes, headers and modular syntax. |
| Pixel core | `lossless.mjs`, `lossy.mjs`, `squeeze.mjs`: RGBA to modular codestreams. |
| Lossless search | Weighted, local, sampled, colour-transform and screen modules, reached through `effort.mjs`. The core does not import them. |
| JPEG and photo | JPEG parsing and photographic DCT feed shared coefficient and VarDCT writers. ANS has separate entries. |
| Acceleration | `kernel-hooks.mjs` isolates optional integer kernels; `wasm.mjs` configures them and uses the effort encoder. |

Keep these optional paths out of the core import graph. Share admission, format writing and coefficient handling
through their existing modules. Add codec-level extensions through the typed `rapier-jxl/writer` surface; use readable
modules because minified builds rename internal format fields. [API](API.md), [kernels](../KERNELS.md), [screen coding](../SCREENSHOTS.md).

## Payload sizes

| File in `dist/` | Bytes | gzip | Brotli |
| --- | ---: | ---: | ---: |
| `rapier-jxl.min.mjs` | __CORE_BYTES__ | __CORE_GZIP__ | __CORE_BROTLI__ |
| `effort.min.mjs` | __EFFORT_BYTES__ | __EFFORT_GZIP__ | __EFFORT_BROTLI__ |
| `wasm.min.mjs` | __WASM_BYTES__ | __WASM_GZIP__ | __WASM_BROTLI__ |
| `jpeg.min.mjs` | __JPEG_BYTES__ | __JPEG_GZIP__ | __JPEG_BROTLI__ |
| `photo.min.mjs` | __PHOTO_BYTES__ | __PHOTO_GZIP__ | __PHOTO_BROTLI__ |
| `jpeg-ans.min.mjs` | __JPEG_ANS_BYTES__ | __JPEG_ANS_GZIP__ | __JPEG_ANS_BROTLI__ |
| `photo-ans.min.mjs` | __PHOTO_ANS_BYTES__ | __PHOTO_ANS_GZIP__ | __PHOTO_ANS_BROTLI__ |
| Every encoding path in one bundle | __ALL_BYTES__ | __ALL_GZIP__ | __ALL_BROTLI__ |
| All readable modules in `src/` | __RAW_BYTES__ | __RAW_GZIP__ | |

Release __VERSION__, Terser __TERSER__, Node __NODE__, gzip 9 and Brotli 11. Byte counts, module graphs, hashes and
incremental bundle sizes are in [dist/sizes.json](../../dist/sizes.json). Each one-file build is checked against its readable
entry on the public encoded-byte fixtures. [Other encoders](../ENCODER-COMPARISON.md).
