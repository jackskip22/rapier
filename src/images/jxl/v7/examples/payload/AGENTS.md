# Payload CMS + JPEG XL

Set up a Payload CMS 3.x or 4.0 project in one command:

```sh
npx jpegxl add payload --json
```

What `add payload` writes:

- `src/jxl/index.mjs` (or `jxl/index.mjs` beside a root `payload.config.ts`): `jxl()` for Payload 3.x (and automatic wiring if a Payload 4.0 config defines `upload.transformers`), `jxlTransformer()` for Payload 4.0 `upload.transformers`, `restoreOriginals(payload)` and `restoreLocalOriginals(staticDir)`.
- `src/jxl/picture.mjs` (or `jxl/picture.mjs`): `<Picture>`, `pictureProps` and `pictureHtml` for Next.js and TanStack Start, supporting both Payload 3.x (`doc.jxl` and `doc.sizes`) and Payload 4.0 (`doc.variants` and `doc.original`).
- `payload.config.ts`: imports `{jxl}` and appends `jxl()` to `plugins`.

## Payload 4.0 (`upload.transformers`)

Add `jxlTransformer({...})` to `upload.transformers` standalone or after `sharpTransformer(...)`:

- `slug`: unique transformer slug, defaults to `'jxl'`.
- `effort`: `1` to `9`.
- `fidelity`: `'exact'` or `{quality: 1..100}` for non-JPEG formats. JPEGs always recompress losslessly.
- `collections`: array of upload collection slugs or per-slug options map.
- `onUpload`: defaults to `true`. Set `false` on Cloudflare Workers and R2 when the editor's browser encodes before upload.

On file requests, clients that send `Accept: image/jxl` receive the stored `.jxl` with `Vary: Accept`. Clients without JPEG XL support and link-preview bots receive the retained original on main files, or a lossless restored JPEG via `jpegxl/jpeg` on JPEG variants and browser-encoded `.jxl` uploads.

## Cloudflare Workers and R2

Copy `examples/payload/browser.mjs` (zero Node imports, imports `jpegxl/upload` and `jpegxl/jpeg`) into your client code, prepare each selected `File` with `const prepared = await prepareUploadFile(file, {effort: 2})`, append it with `appendPreparedUpload(formData, prepared)` before posting to Payload, and register `jxlTransformer({onUpload: false})` in `upload.transformers`. For JPEGs, `prepared.file` is the losslessly recompressed `.jxl` (and the Worker restores the original JPEG in pure JavaScript for non-JXL clients). For PNG, WebP, GIF, AVIF and BMP, `prepared.file` keeps the original image and `prepared.jxlFile` carries the encoded `.jxl` in the `jxl` multipart field so Payload 4.0 stores the `.jxl` as `doc.filename`, retains the original in `doc.original`, and serves the original to browsers without JPEG XL. No Sharp or server-side WebAssembly encoding runs on the Worker.

## Payload 3.x (`plugins: [jxl()]`)

Options on `jxl({...})`:

- `effort`: `1` to `9`.
- `fidelity`: `'exact'` or `{quality: 1..100}` for non-JPEG formats. JPEGs always recompress losslessly and restore the original JPEG exactly.
- `spaceSaver`: `true` queues a `jxl-space-saver` job in Payload's job queue (enabling `payload-jobs` if needed) after verifying the written `.jxl`. Running Payload's jobs (`await payload.jobs.run()`) after commit verifies the stored original and `.jxl` against the recorded upload SHA-256 and length, removes the main JPEG, and sets `doc.jxl.spaceSaved = true`. Any failure keeps the original and sets `doc.jxl.spaceSaverError`. Non-JPEG uploads and `imageSizes` renditions keep their originals in this version. Undo it at any time with `await restoreOriginals(payload)` (requires `handleUploadIfAbsent` on cloud adapters) or `await restoreLocalOriginals(staticDir)` for a local folder.
- `collections`: array of upload collection slugs or per-slug options map.

New main and rendition metadata records archive `sha256` and `filesize`. JPEG records also identify the original using `originalSha256` and `originalFilesize`. The main record includes `originalFilesize` for every supported upload.

Local publication is exclusive and accepts identical retries. A different existing companion is `JXL_INPUT`. Cloud companion uploads check existing contents before staging, but generic upload hooks do not provide atomic reservation against concurrent writers. Old recovery files are retained while a database transaction can still roll back, and a `spaceSaved` row must be restored before its image is replaced.

Payload 3.x file responses preserve native access checks, document ownership and adapter privacy policies. Original URLs keep the original representation for previews and GET byte ranges (rebuilding a Space-saver JPEG from `.jxl` when removed), while direct `.jxl` URLs remain explicit. The response varies on all selection headers and applies representation ETags, conditional requests and GET byte ranges after verification. HEAD has no body and ignores Range. Adapter-provided external URLs are governed by the provider's access and cache configuration.
