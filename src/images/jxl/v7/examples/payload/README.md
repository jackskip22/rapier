# JPEG XL for Payload CMS

Adds JPEG XL support to Payload CMS 3.x (via `plugins`) and Payload CMS 4.0 (via `upload.transformers`), on local disk, cloud storage adapters, or Cloudflare Workers and R2.

```sh
npx jpegxl add payload
```

It installs `jpegxl` if missing, copies the plug-in and `<Picture>` helper into `src/jxl/` (or `jxl/` when `payload.config.ts` sits at the project root), and adds `jxl()` to `plugins` in `payload.config.ts`. Running it again changes nothing and leaves any file you edited alone.

## Payload 4.0 (`upload.transformers`)

Payload 4.0 moves upload processing into `upload.transformers`. Use `jxlTransformer()` standalone or after `sharpTransformer()` so Sharp handles crops and `variants` first and `jxlTransformer()` encodes the main file and every resized variant to JPEG XL:

```ts
import {buildConfig} from 'payload'
import {sharpTransformer} from '@payloadcms/transformer-sharp'
import {jxlTransformer} from './jxl/index.mjs'

export default buildConfig({
  // ...
  upload: {
    transformers: [
      sharpTransformer({
        collections: {
          media: {
            variants: [
              {name: 'thumb', width: 400, height: 300},
              {name: 'card', width: 800, height: 600},
            ],
          },
        },
      }),
      jxlTransformer(),
    ],
  },
})
```

If a Payload 4.0 config already defines `upload.transformers` and loads `plugins: [jxl()]`, `jxl()` appends `jxlTransformer()` to `upload.transformers` automatically and avoids duplicating a `'jxl'` slug.

How `jxlTransformer()` works on Payload 4.0:

- On upload (`onUpload: true`, the default), JPEGs recompress losslessly with `recompress` from `jpegxl/jpeg`, and PNG, WebP, GIF, AVIF and other raster formats encode with `encode` from `jpegxl`. Payload stores the `.jxl` as the default file and keeps the original upload in `doc.original`.
- On file requests, browsers that send `Accept: image/jxl` receive the stored `.jxl` directly with `Vary: Accept`.
- Clients that do not accept JPEG XL (such as Microsoft Edge) and link-preview crawlers receive the retained original on main file requests, or a lossless on-the-fly restored JPEG from `jpegxl/jpeg` on resized JPEG variants and browser-encoded JPEG XL uploads.
- Options on `jxlTransformer({...})`: `slug` (defaults to `'jxl'`), `effort` (`1` to `9`), `fidelity` (`'exact'` or `{quality}`), `collections` (array of slugs or per-slug map), `sharp` (optional decoder fallback on Node) and `onUpload` (defaults to `true`).

## Cloudflare Workers and R2 (encode in the editor's browser)

Cloudflare Workers cannot run native `sharp`, and encoding large uploads inside a Worker risks CPU limits. Encode in the editor's browser before upload with `prepareUploadFile` and `appendPreparedUpload` from `browser.mjs` (a browser-only helper with zero Node imports that runs `jpegxl/upload` and `jpegxl/jpeg` in a Web Worker), and register `jxlTransformer({onUpload: false})` on the Worker. No Sharp or server-side WebAssembly encoding runs on the Worker.

1. Configure Payload 4.0 on the Worker with D1, R2 and `jxlTransformer({onUpload: false})`:

```ts
import {buildConfig} from 'payload'
import {jxlTransformer} from './jxl/index.mjs'

export default buildConfig({
  // ...
  upload: {
    transformers: [jxlTransformer({onUpload: false})],
  },
})
```

2. Copy `browser.mjs` (and `browser.d.ts` for TypeScript) from `examples/payload/` into your client bundle (for example `src/jxl/browser.mjs`), and append the prepared upload to `FormData` before posting to Payload:

```ts
import {appendPreparedUpload, prepareUploadFile} from '@/jxl/browser.mjs'

export async function uploadMedia(rawFile: File, alt: string) {
  const prepared = await prepareUploadFile(rawFile, {effort: 2})
  const form = appendPreparedUpload(new FormData(), prepared)
  form.append('_payload', JSON.stringify({alt}))
  const res = await fetch('/api/media', {method: 'POST', body: form})
  if (!res.ok) throw new Error(`Upload failed (${res.status})`)
  return res.json()
}
```

### What happens for each source type (Cloudflare Workers and R2)

| Source type | Uploaded to Payload | Stored in R2 | Served to `Accept: image/jxl` | Served to browsers without JPEG XL and preview bots |
| --- | --- | --- | --- | --- |
| JPEG (`.jpg`, `.jpeg`) | Only the browser-recompressed `.jxl` (`file`) | `.jxl` only | `.jxl` with `Vary: Accept` | Exact original JPEG restored on the Worker in pure JavaScript (`jpegxl/jpeg`) |
| PNG, WebP, GIF, AVIF, BMP | Original image (`file`) plus browser-encoded `.jxl` (`jxl`, when smaller) | `.jxl` as `doc.filename` and original image as `doc.original` | `.jxl` with `Vary: Accept` | Retained original PNG, WebP, GIF, AVIF or BMP from `doc.original` with `Vary: Accept` |
| Non-JPEG raster via a single-file uploader (`file` only, no `jxl` field) | Original image (`file`) untouched | Original image only | Original image | Original image |
| SVG, non-images, or images that do not shrink (`keepSmaller: true`) | Original file untouched | Original file only | Original file | Original file |
| Pre-existing standalone `.jxl` uploaded directly | `.jxl` untouched | `.jxl` only | `.jxl` with `Vary: Accept` | Restored original JPEG if it was losslessly recompressed from JPEG, otherwise the stored `.jxl` (no non-JXL original exists) |

Why JPEGs and non-JPEGs differ: a JPEG recompressed with `jpegxl/jpeg` carries lossless JPEG reconstruction data, so the Worker rebuilds the original JPEG without storing two files. A PNG, WebP, GIF, AVIF or BMP cannot be reconstructed from a `.jxl` file, so `prepareUploadFile` keeps the original in `prepared.file` and places the encoded `.jxl` in `prepared.jxlFile`. When `appendPreparedUpload` sends both fields in the same multipart request, `jxlTransformer({onUpload: false})` verifies the JPEG XL header without encoding on the Worker, Payload 4.0 stores the `.jxl` as the default file and retains the original in `doc.original`, and `<Picture>` emits `<source type="image/jxl">` with the original file on `<img>`.

### Checking the example on Payload 3.x and 4.0 beta

Run [check.mjs](./check.mjs) inside a Payload 3.x or 4.0 project (with `payload`, `@payloadcms/db-sqlite`, and for 4.0 `@payloadcms/transformer-sharp`, installed) to verify JPEG and PNG uploads, `Vary: Accept`, non-JXL PNG fallback, Space saver (3.x), `upload.transformers` (4.0), and the browser-encode multipart upload flow (4.0):

```sh
JXL_PACKAGE=/path/to/jpegxl node examples/payload/check.mjs
```

## Payload 3.x (`plugins: [jxl()]`)

```ts
import {buildConfig} from 'payload'
import {jxl} from './jxl/index.mjs'

export default buildConfig({
  // ...
  plugins: [jxl()],
})
```

### Upload encoding and document fields (Payload 3.x)

- JPEGs recompress losslessly with `recompress` from `jpegxl/jpeg` and restore the original JPEG exactly.
- PNG, WebP, GIF, AVIF and other supported raster formats use the encoder's default fidelity unless `fidelity` is configured. Non-JPEG decoding may use the `sharp` instance supplied by Payload or the plug-in options.
- Each supported, generated `imageSizes` rendition gets its own companion. `photo.jpg` becomes `photo.jpg.jxl`, and a rendition such as `photo-card.png` becomes `photo-card.png.jxl`.
- The plug-in maintains `doc.jxl` during uploads and restoration. Main and rendition archive names must agree with the corresponding `doc.filename` or `doc.sizes.<name>.filename`.

The generated metadata includes:

| Field | Meaning |
| --- | --- |
| `filename`, `filesize`, `mimeType`, `url` | Companion name, length in bytes, `image/jxl`, and serving URL |
| `width`, `height` | Image dimensions when available |
| `sha256` | Expected SHA-256 of the JPEG XL bytes, recorded for new main images and renditions |
| `originalFilesize` | Original upload length on the main record, also recorded on JPEG rendition records |
| `originalSha256` | Original JPEG SHA-256 on main JPEG and JPEG rendition records |
| `fidelity` | Encoding fidelity recorded on the main image |
| `spaceSaved` | `true` after Space saver verifies and removes the main JPEG original |
| `spaceSaverError` | Code and message recorded when Space saver kept the original JPEG |
| `sizes.<name>` | Companion metadata for a generated rendition |
| `externalUrl` | An adapter-provided external URL when present |

### Space saver (Payload 3.x)

Pass `spaceSaver: true` on `jxl({spaceSaver: true})` (or per collection in `collections`) to keep uploaded JPEGs only as JPEG XL:

```ts
plugins: [jxl({spaceSaver: true})]
```

During the upload request, the plug-in keeps the original JPEG, verifies the written `.jxl`, and queues a `jxl-space-saver` job in Payload's job queue (enabling `payload-jobs` when the project has no jobs yet). If the upload rolls back, no job remains. After the upload commits, running Payload's jobs (`await payload.jobs.run()` or Payload's job runner) reads the committed document, checks that the stored original and `.jxl` still match the upload SHA-256 and restore the original JPEG exactly, removes the main JPEG, and sets `doc.jxl.spaceSaved = true`. Any failure leaves the original in place and records `doc.jxl.spaceSaverError`. Non-JPEG uploads and `imageSizes` renditions keep their originals in this version.

Requests for a removed original on `/api/<collection>/file/<filename>` rebuild the original JPEG from `.jxl` with `Vary: Accept`.

To put every removed original JPEG back, verified, and clear `doc.jxl.spaceSaved`:

```ts
import {restoreOriginals, restoreLocalOriginals} from './jxl/index.mjs'

await restoreOriginals(payload)
```

On cloud storage, `restoreOriginals(payload)` requires an adapter with `handleUploadIfAbsent` so restoration never overwrites a competing upload. For a local upload folder without starting Payload, `await restoreLocalOriginals(staticDir)` writes missing JPEGs back beside their `.jpg.jxl` files without updating database rows.

### Filenames, collisions and cleanup (Payload 3.x)

Local companion publication uses an exclusive write. An existing file with the expected SHA-256 can satisfy a retry. An existing file with different bytes causes `JXL_INPUT`, and symlinks are refused. New content needs a different filename while a different companion occupies the requested name.

Cloud companion uploads reject a different existing companion found during the initial read. Generic adapter upload hooks do not provide an atomic reservation between that read and the write, so this check does not guarantee immutability against concurrent cloud writers. During the upload request itself, originals remain present.

A document whose `spaceSaved` flag is still `true` must be restored before its image can be replaced or cropped. Cleanup considers only companions owned by the document's main image and renditions. When a request has an active transaction, old recovery files are retained through replacement or deletion because the database operation may still roll back. Failed operations can therefore leave recovery files for later cleanup by the host.

## React `<Picture>` (Next.js and TanStack Start) and file responses

Render uploads in Next.js or TanStack Start with `<Picture>` (plain React, no Next-only imports). It reads both Payload 3.x documents (`doc.jxl` and `doc.sizes`) and Payload 4.0 documents (`doc.variants` and `doc.original`), putting every `.jxl` rendition in `<source type="image/jxl">` and the non-JXL fallback on `<img>` whenever available:

```tsx
import {Picture} from '@/jxl/picture.mjs'

export function Hero({media}) {
  return <Picture doc={media} alt={media.alt} sizes="100vw" />
}
```

Pass `size="card"` to render a single named `imageSizes` or `variants` rendition.

The following behavior applies to the Payload 3.x plug-in's file endpoint, `/api/<collection>/file/<filename>`:

- Requests continue through Payload's native upload access check. The selected file must belong to an unambiguous main image or rendition, including when public access requires a separate document lookup.
- An original URL negotiates JPEG XL when the client prefers it. Preview requests and GET byte-range requests retain the original representation.
- An explicit `.jxl` URL requests JPEG XL, including for a preview or byte range, subject to the same ownership and storage access checks.
- Responses vary on `Accept`, `Range`, `User-Agent`, `Purpose`, `Sec-Purpose` and `X-Purpose`. Existing Vary fields and wildcard semantics are preserved. Caches must honor those fields.
- Stored archive hashes and lengths are checked when recorded. JPEG archives also reconstruct and check the recorded original identity before either representation is returned. Mismatches produce coded refusals.
- Strong ETags for each representation support `If-Match`, `If-None-Match` and `If-Range`. GET supports a single byte range, including suffix and open ranges. HEAD has no body and ignores Range. Unsupported range units are ignored. Unsatisfiable byte ranges return 416, a matching `If-None-Match` returns 304, and a failed `If-Match` returns 412.
- `If-Range` requires the current strong ETag. A different, weak or date-based validator produces the full representation because this path does not advertise Last-Modified.
- Cloud adapter denials are preserved, including missing-original responses marked `private`, `no-store` or `no-cache`, or carrying Set-Cookie. An archive cannot replace them with a successful response. Authorization and Cookie headers remain available to the adapter, and archive output cannot relax the original storage privacy policy.

Archive verification requires complete stored-file reads and, for JPEG archives, reconstruction of the original. These checks also apply to HEAD and conditional responses. Cloud reads stop when a body exceeds its recorded length. Legacy records without a recorded length still require a complete read.

If an adapter supplies `externalUrl`, the picture helper can link directly to that provider. Payload endpoint negotiation, verification and response headers do not apply to requests that bypass Payload. The provider's access and cache configuration governs those URLs.
