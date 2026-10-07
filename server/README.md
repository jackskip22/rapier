# rapier-server

Display, search and export Markdown from a folder or an S3-compatible bucket you control. The same Rapier renderer writes the page, the same Word owner writes the document, and the existing agent-door kernel commits edits. There is no Rapier account service, telemetry or runtime package download. Bucket mode uses only the storage endpoint you configure.

This package is **AGPL-3.0-only**. Rapier's commercial licence is the alternative for businesses that cannot accept those terms. The extracted rendering/style factories in `rapier-markdown-kit/render` are **MIT**; that grant does not relicense this service, the editor, or the agent kernel.

## Run

The administrator supplies Node 22 or later, a local Chromium executable, its exact four-part version, and either an existing service-owned folder or a private bucket. Use the toolchain pins and build receipt from the release you deploy. The server does not install a browser or silently accept another browser version.

From a staged package:

```sh
node dist/server/cli.mjs serve /srv/rapier/documents \
  --chromium /usr/bin/chromium \
  --chromium-version "$(/usr/bin/chromium --version | sed -E 's/^[^0-9]*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+).*$/\1/')"
```

The command above selects the locally installed version explicitly; it is not evidence that this version is qualified for your deployment. In managed configuration, write the qualified number as a literal. `RAPIER_SERVER_CHROMIUM` and `RAPIER_SERVER_CHROMIUM_VERSION` can supply the same options. After installing a staged local package with npm, the equivalent entry is `rapier-server serve <folder>`.

### Bucket storage

Supply a private, service-owned S3-compatible bucket instead of a folder:

```sh
# Inject RAPIER_BUCKET_KEY_ID and RAPIER_BUCKET_SECRET through your service's
# protected environment, not arguments or a checked-in configuration file.
rapier-server serve --bucket documents --endpoint https://s3.us-east-1.amazonaws.com \
  --chromium /usr/bin/chromium --chromium-version 154.0.8037.57
```

Use the exact browser version qualified for your deployment. For R2 the endpoint is the account's S3 endpoint origin, `https://ACCOUNT_ID.r2.cloudflarestorage.com`; no bucket path, user information, query or fragment belongs in `--endpoint`. The bucket name becomes the path prefix. HTTPS is required except for loopback HTTP used by the in-process witness. Redirects are refused: configure the correct endpoint directly.

Only environment variables supply S3 credentials: `RAPIER_BUCKET_KEY_ID`, `RAPIER_BUCKET_SECRET`, and optionally `RAPIER_BUCKET_SESSION_TOKEN`. Set `RAPIER_BUCKET_REGION` for a regional service; the default is `auto` for an R2 endpoint and `us-east-1` otherwise. The programmatic entry is `createServer({bucket, endpoint, ...browserOptions})`; `{root, ...browserOptions}` retains the folder store, and selecting both is refused. `bucketRegion` and `bucketTimeoutMs` configure region and the bounded storage-request deadline (30 seconds by default, at most five minutes). They never carry credentials.

The service signs requests using the existing SigV4 owner and Node's crypto API, without an SDK. Grant bucket listing, object reads and conditional object writes, including the private `.rapier-server/` prefix. No object deletion permission is used. The provider must enforce `If-Match` and `If-None-Match` atomically and provide strongly consistent reads; a proxy or provider that ignores conditions is not supported. Keep the **whole bucket private**: the HTTP read surface hides private state, but it cannot make a provider's public bucket private. Credentials are not printed or written into bucket state; provider response bodies, redirects and nested transport diagnostics never become public errors.

The listener defaults to `127.0.0.1:8383`. It serves ordinary HTTP. The business supplies TLS, firewall rules and any user authentication at a reverse proxy. A non-loopback listener requires an exact HTTPS origin, for example:

```sh
node dist/server/cli.mjs serve /srv/rapier/documents \
  --host 0.0.0.0 --port 8383 --origin https://documents.example.test \
  --chromium /usr/bin/chromium --chromium-version 154.0.8037.57
```

Use your deployed release's actual qualified Chromium version, not the illustrative number above. The proxy must retain that origin's `Host` header. Arbitrary hosts are refused. Forwarded client-IP headers are not trusted; the transport peer is the rate-limit identity. Put an appropriate rate limit in front of a shared proxy.

Run Chromium under an unprivileged account with its sandbox enabled. `--no-sandbox` is an explicit development-only exception and prints a warning. It is never inferred from root execution or a launch failure. The folder store uses POSIX file permissions, directory synchronization and inode checks; Windows and network filesystems are not qualified by its Linux tests.

SIGINT and SIGTERM close connections, stop render work, release the root lock and exit. The startup message never prints credentials.

## Routes

| Route | Result |
| --- | --- |
| `GET /d/report.md` | Self-contained Share HTML with the original source and SHA-256 carrier. |
| `GET /d/nested/report.md` | A document below the root. Hidden paths and links are refused. |
| `GET /search?q=words` | The Notes result shape, including `results` and `confirm`. Literal queries are confirmed against current source text. |
| `GET /d/report.md.docx` | Word through the existing Rapier Word writer. |
| `GET /d/report.md.pdf` | Chromium prints the existing Rapier print artifact, using the same semantic render and print styles. |
| `POST /mcp` | The existing MCP tool catalogue and kernel, with the selected durable storage adapter. |
| `POST /mcp?document=nested%2Freport.md` | Open that existing file and restrict workspace calls to that path. |
| `GET /export/<handle>` | A retained immutable file, authenticated with the deployment bearer. HEAD returns its metadata. |
| `POST /return/<handle>` | One returned copy for the expiring receipt, authenticated with the deployment bearer. |
| `GET /health` | Version, readiness, render pin and runtime hash; interrupted persistence reports 503. |

Document rendering under `/d/` and search routes also accept HEAD. They are **not user-authenticated by the service**. Protect the whole listener with the business's access policy; do not expose confidential documents publicly. There is no arbitrary-file route, raw directory listing or vault/sync connection.

MCP requests, retained file downloads under `/export/`, and return uploads require `Authorization: Bearer <token>`. The token is generated on first start and retained in `.rapier-server/credentials.json` inside the folder or bucket. On disk it is readable only by the service owner; bucket access is controlled by the provider policy. The service derives a stable private workspace owner from this token, preserving access across restarts. Public workspace handles and file or return addresses grant no access alone. The token stays outside tool arguments and results.

The actual MCP App resource mints the existing editor authority; an ordinary agent cannot approve a review or rotate a workspace handle using invented authority. Do not supply the editor key in agent-visible text. Return uploads use authenticated HTTP clients and the local route accepts POST. The local tool listing omits connector OAuth declarations because the transport owns bearer authentication.

An unscoped `rapier.open` with a new admissible filename creates that file. It cannot overwrite an existing name. A scoped `rapier.open` takes its source from the selected store, not a caller-supplied file URL, filename or replacement text. File URLs that would require an outbound fetch are unavailable. Remote inspection, edits, agent Undo, Will, ASK approval and capability rotation run through `mcp/worker.mjs` and its existing kernel; the service does not implement parallel edit rules.

The transport bearer is deployment-wide. Someone who holds it can open any admissible file using a scoped URL. Scoped URLs prevent accidental cross-document use, not per-user access control. Give separate roots or buckets and listeners to mutually untrusted tenants.

## Folder files, durability and recovery

The root holds plain UTF-8 `.md` files, including their embedded pictures. Rendering retains original source bytes, including a UTF-8 BOM and CRLF line endings, in the recoverable Share carrier. Invalid UTF-8 is refused. Writes come only from accepted kernel operations; retiring or deleting a workspace does **not** delete the business's Markdown file.

`.rapier-server/` is private state, not served content:

- `credentials.json` retains the transport token and editor-key secret.
- `workspaces/` retains actual kernel chunks, journals, epochs and alarms.
- `search.json` retains bodyless Notes projections, tagged with source hashes and the search/parser implementation fingerprint.
- `pending.json`, when present, is a prepared commit containing exact source, matching kernel state and a publication identity. `lock.json` protects the root against a second service writer process.
- `preserved/` holds, while a publication is in flight or after it met a late external edit, a receipt (`<identity>.json`) with the proposed exact text and original name, and the displaced source inode (`<identity>.before`). A journal-named `<identity>.next` is unpublished staging or the temporary second link of a newly published file.

Private directories are 0700 and generated state files 0600. A retained `.before` inode keeps its original document mode inside the private directory. Existing private entries must be ordinary, service-owned files with safe permissions. Document paths cannot traverse hidden directories, symlinks or multiply linked files. Limits are 16 MiB per document, 10,000 files and 256 MiB per search scan, 64 simultaneous HTTP requests, two render realms by default, and 32 queued exports. `--concurrency` accepts 1–8; `--timeout` accepts 1,000–300,000 milliseconds. Private state files and protocol frames have their own byte caps. Workspace history consumes disk: monitor the service volume and retain normal backups.

A changed document and its kernel snapshot are committed using a write-ahead record: synchronize the prepared record, publish the document, synchronize the state, then remove the record. A failure after preparation poisons the running store rather than acknowledging uncertain durability. Restart rolls forward when the current file matches the old or new source hash, or when displacement left the name absent with the incumbent safely retained. It retires only the journal-named staging link before validating and synchronizing the source and state. An unrelated file at the destination causes recovery refusal; that file, the displaced inode, the proposal receipt and the pending kernel record remain for an administrator. Do not delete `pending.json` to silence a recovery error.

Ordinary external edits are detected by source hash before workspace use and before displacement. These checks are early conflict detection, not a filesystem compare-and-swap. Publication moves the actual incumbent inode into `preserved/`, synchronizes it and both directories, then creates the destination with a no-clobber hard link to the synchronized candidate. An edit racing the last check stays in the displaced inode; an editor holding that inode open can still write it there. A competing entry created in the gap wins: the service refuses rather than replacing it. The proposal also remains in the receipt. A late edit may therefore produce a successful service publication with the external revision retained, rather than a conflict response.

This is preservation, not a single atomic replacement: readers can briefly observe a missing destination while the incumbent is displaced. The supported filesystem contract is a trusted, local POSIX filesystem with atomic same-filesystem rename, exclusive hard-link creation, and working file and directory fsync. The source directory and private recovery directory must share a filesystem; a separately mounted source is refused before displacement. Windows is refused. Network filesystems and filesystems without these semantics are not supported; successful startup alone does not qualify a provider.

A receipt and its displaced inode retire as soon as the publication is synchronized and the displaced inode still holds exactly the incumbent the journal named; only a publication that met a late external edit (or recovery that could not read the displaced entry) leaves them in `preserved/`. An external editor that keeps an old descriptor open and writes it after that check writes an unlinked inode, as it would after any atomic save; keep such editors closed while the service writes. Monitor `preserved/` for retained revisions. For recovery, stop all writers, inspect the receipt’s `document` and exact `text` together with its `.before` file and the current destination, and save the versions needed before an administrator resolves the pending state. Do not replace a source independently of its pending kernel record to manufacture a successful recovery. A stale workspace must be reopened through its scoped URL. Search re-reads the folder and does not reuse a projection with a stale source hash or different implementation fingerprint. For coordinated backups, stop the service and copy both the plain documents and the private directory together.

The filesystem is a trusted service-owned perimeter. These checks do not establish a kernel-enforced sandbox against a hostile process with the same UID replacing parent directories during an operation, nor do they promise a cross-process compare-and-swap with arbitrary external writers. Do not grant untrusted processes write access to the root.

## Bucket publication and recovery

A bucket is a managed storage layout, not a folder of directly editable Markdown objects. Each admissible `.md` name is a small JSON head naming SHA-256-addressed parts under `.rapier-server/parts/`. The source part is **the exact plain UTF-8 Markdown**, with its BOM, line endings and embedded pictures unchanged; it is not wrapped in a new document format. The same store contract supplies those original bytes to rendering, search and the actual MCP kernel. Do not upload ordinary Markdown over a head or edit stored JSON to make a document: create through MCP, or use the store's conditional `publishDocument(name, text, expectedSourceHash)` entry for an administrative import. Restore documents as a coherent managed bucket, or recover exact Markdown from the source parts/Share exports.

A commit writes immutable source and full kernel-state parts, then a private workspace locator, then **one conditional head PUT last**. The head body includes source, workspace-part references and a fresh revision: state-only commits must change the ETag too. A raw Markdown object with mutable metadata would not protect Undo-state revisions on a provider whose ETags depend only on the body. No successful head can point at a part this commit has not already written. Content-addressed collisions are accepted only after verifying the stored bytes. Locators without a head reference are not published workspaces.

Every PUT is conditional. New heads, parts, locators and private files use `If-None-Match: *`; changes use the exact read ETag in `If-Match`. A lost race is `FILE_CONFLICT`, not an unconditional retry that overwrites another writer. Cached kernel snapshots also check their own persisted revision, so an unchanged source cannot hide a newer Undo or capability state. The existing MCP door retains its own storage-failure envelope; it never acknowledges the losing edit. Reopen/retry through that door with the same operation identity as required by its response.

A crash before head publication leaves the previous document and kernel readable. A lost response after publication leaves the complete new document and operation journal readable; restart plus the same operation identity replays once. There is no folder-style WAL or process lock in a bucket: independent servers coordinate through conditional objects. Credentials and bodyless search checkpoints are private conditional objects, while bound kernel snapshots are selected by the document head. Retiring a workspace does not delete source.

The folder limits also apply here: 16 MiB per document read/write, 10,000 Markdown documents and 256 MiB of source per search scan, configurable through the store options. As with the folder, document-count and aggregate-byte limits bound scans; they are not a cross-document storage quota or create-admission transaction. Private state remains bounded separately. Listing is paged and respects hidden paths; search does not walk the private parts tree. Invalid UTF-8, missing/hash-mismatched parts, malformed heads and incomplete/pagination-invalid listing responses are refused rather than served partially.

Immutable parts, including abandoned parts from failed writes and prior revisions, are retained. No automatic garbage collector or migration is added. Monitor bucket storage, do not apply age-based deletion to parts that may still be referenced, and stop all writers for a coordinated backup of heads **and** the private prefix. A live provider run remains separate from the deterministic loopback witness.

## Rendering and network boundary

`rapier-markdown-kit/render` supplies the extracted production functions. The editor delegates to them; there is no separately authored Markdown or HTML renderer. The MIT factory API takes explicit parser, DOM, sanitizer and image/layout host ports. It is not a dependency-free DOM implementation for bare Node.

For complete parity with the existing owners, this service uses the retained **document-profile runtime inside a local Chromium document realm for HTML and Word as well as PDF**. It skips editor boot/recovery/UI state and initializes the retained render libraries directly. This deliberately costs more memory than a pure-Node string renderer. Each operation has an isolated browser context, a deadline and a bounded cache/queue. The only browser control connection is a pipe, not a listening debug port.

Retained bytes are installed in an in-memory page. Page network requests are refused; no source URL can become a server-side fetch. The narrow digest bridge only computes SHA-256/SHA-512 locally when an in-memory origin has no WebCrypto digest. Random UUIDs use the browser's native random values. No browser policy is disabled to allow navigation. The browser launches with the release toolchain’s `JXLImageFormat` feature flag. A browser without JPEG XL decoding refuses Word conversion of a JPEG XL picture instead of dropping it; the test output names that codec refusal separately from successful round trips.

All pictures must be embedded. The server does not fetch remote pictures, fonts, scripts, plug-ins or referenced files. Optional editor plug-ins that are not in the retained build, including additional math/diagram renderers, are not downloaded by this service; do not assume their optional visual projections exist merely because their source is preserved. The exported HTML retains ordinary authored links, and an interactive MCP App opened by a client remains subject to that client's network policy. The service's document-fetch refusal is not a claim that an operating system or Chromium installation can never produce unrelated background traffic. Enforce an OS-level outbound policy for deployments requiring that guarantee, allowing the explicitly configured storage endpoint only when using a bucket.

## Build and stage from the source repository

Build the document profile, then the full profile, so the current receipt includes both and names the full MCP App:

```sh
RAPIER_PROFILE=document node tools/build.mjs
RAPIER_PROFILE=full node tools/build.mjs
node tools/stage-server.mjs
```

The default output is `dist/rapier-server`. The stage follows literal module imports from the CLI, service and tests; refuses external npm dependencies, computed imports and symlinks; verifies retained page/App hashes and version; includes the existing MIT/AGPL/vendor notices and MCP skill snapshot; and runs the public-package boundary check. `BUILD.json` names every staged runtime file and its hash. It does not recursively copy private repository directories. `tools/stage-public.mjs` places the same AGPL package at `server/` in the public repository and retains the renderer factory sources needed to rebuild the page.

Release staging refuses noncanonical or development-packed profiles. For a deliberately nonrelease local build only:

```sh
RAPIER_PACK=fast RAPIER_PROFILE=document node tools/build.mjs
RAPIER_PACK=fast RAPIER_PROFILE=full node tools/build.mjs
node tools/stage-server.mjs --development
```

That output is labelled development. This command does not turn an unqualified toolchain into a release. Nothing here publishes a package or deploys a server.

## Tests

The repository's existing rows own the new cells; no new row is required:

```sh
RAPIER_SERVER_CHROMIUM=/usr/bin/chromium \
RAPIER_SERVER_CHROMIUM_VERSION=YOUR_EXACT_QUALIFIED_VERSION \
node tools/witness-node.mjs html-export-corpus mcp-create-isolation
```

The HTML row retains all 226 baseline writer byte checks and 126 original Markdown-owner HTML hashes, covering the writer sources, kit conformance documents and welcome. The Word cells additionally round-trip the source corpus through real DOM owners, checking heading levels/text and table-cell words. The filesystem preservation cells also inject late in-place/rename/recreation edits, retain a writer’s open descriptor, and kill real writer processes at prepared, candidate, displaced, linked, source-synced and state-synced boundaries. The server row opens real HTTP sockets and real files, renders through the installed browser, reads the exact source back, exercises Word/PDF and Notes search, and uses the real kernel for persisted edits, Undo, Will, ASK approval, rotation, restart, collision/stale refusals and recovery at all three durable cut points. Its bucket cells exercise an in-process HTTP S3 peer with independent SigV4 verification, real body-only ETags and conditional 412 responses: byte parity with folder create/read/edit/restart/retry/Undo/search, encoded paged paths, independent-writer and state-only races, both sides of head publication, limits, corrupt/incomplete objects, and credential-safe errors and CLI startup. It also stages a package and runs its standalone tests from the copied tree. There are no screenshot or appearance assertions.

Inside a staged package, `npm test` or `node dist/server/test/run.mjs` runs those service cells, with the same explicit browser environment. Root-only test containers must explicitly set `RAPIER_SERVER_NO_SANDBOX=1`; that receipt is not production sandbox qualification. Release acceptance still requires the project's pinned toolchain, canonical build and public-stage proof.
