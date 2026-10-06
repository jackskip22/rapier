# The Rapier embed contract

Enforced at the iframe message boundary in `editor/engine.js`; agent admission is in `agent/browser.js`. MCP Apps (`agent/apps.js`) and the carried-page wrapper (`rapier-html`) have separate contracts. For a runnable host, see the README, "In your own app". The MIT host helper is `rapier-embed` (`packages/rapier-embed/embed.mjs` and its shared `contract.mjs`; its README is generated from `skills/embed-rapier/SKILL.md`). It provides `Rapier.mount` and the form-associated `<rapier-editor>` on this same wire.

## 1. Two origins, one parent, one channel

The parent frames a served page with `?embed=1`: no origin is declared in the URL or in the handshake. The published document profile is `https://rapier.website/embed/rapier-document.html`, with permanent copies at `https://rapier.website/embed/<version>/rapier-document.html`; a self-hosted copy speaks the same protocol. The frame binds to the origin of the first valid `rapier-connect` from its parent and holds it for the session; a later connect from any other origin is ignored.

That origin must be HTTPS, or HTTP only for `localhost`, `127.0.0.1` and `[::1]` development. A port is part of an origin. `null` and opaque origins are refused. This admits a window, not a person.

Rapier listens before boot: a host may post `rapier-connect` at the frame’s `load` event; the first valid connect waits until the frame is ready. Rapier repeats `rapier-ready` to its parent at increasing intervals until a host connects. It carries nothing: before a connect it is posted to the parent whatever its origin (`*`), and after one to the bound origin. The host verifies both `event.source === frame.contentWindow` **and** `event.origin === editorOrigin` for anything it receives on the window, and targets its connect at the exact editor origin with one MessagePort transferred. Rapier independently verifies **actual `event.source === window.parent`** and the origin rule above; matching strings inside `data` alone are never sufficient. There is no connection timeout: the person is told the host has not connected only when they do something that needs it (Close before a host has connected).

A **same-origin** frame needs no parameter or protocol and boots as a top-level editor with its own storage. A frame from **another origin** without `embed=1` is refused. A carried page is the person's file wherever it is framed, and boots as a top page.

The handshake accepts only `type`, `sessionId`, `documentId`, `capabilities`, optional `contract`, optional `settings` (section 2.1), optional `theme` (`light`, `dark` or `system`), and optional `agent` (`{name}`); anything else, including `expectedOrigin`, refuses the connection. The host-given agent name is a nonblank string of at most 96 UTF-16 code units, with no control characters or extra fields. It is attribution, not authenticated identity or an authority grant. The first valid name at this door is retained for the page session; a reconnect cannot rename it. Both IDs are nonempty strings of at most 256 UTF-16 code units. The grant and accepted settings are frozen after admission. A reconnect may replace transport, not change permissions; grant ordering is immaterial. After load it must retain both IDs. An in-flight save, close or load also blocks replacing the port. Reload to declare different authority, and preserve unsaved work before doing so.

The transferred MessagePort is unforgeable, **not secret after the host forwards it**. The port and its generation are pinned; old-port callbacks refuse after replacement. The host must not forward it to untrusted code; the port carries only the admitted session and document. Scripts on the same host origin are one trust principal, not separate identities.

## 2. Capabilities: no implied permission

A missing list means `[]`. Unknown names, duplicates, non-array values and non-string entries refuse the entire connection. The `connected` reply echoes the canonical grant and accepted settings; connecting alone grants nothing. A malformed grant is refused with `capabilities_invalid`; a changed grant on reconnect with `capabilities_changed`.

**The contract's version.** This page is contract `1`. A connect may carry `contract` (an integer); the `connected`
reply carries `contract` beside `appVersion`. A connect naming a contract the frame does not speak is refused on the
port it offered with `protocol-error` `{code: 'contract_unsupported', speaks: [...]}` and binds nothing; a connect
naming none gets the current. Adding an optional field, or a new command behind a new grant, keeps the number;
removing or renaming anything, or changing a rule, raises it. No version is ever retired: an embedding written
against any contract keeps working in every later release, which speaks every version it has spoken.

| Capability | What the parent explicitly authorizes | What it does not implicitly grant |
|---|---|---|
| `open` | `load` host-supplied source, name, revision and read-only flag through existing load guards | Readback, notifications, agent tools, comparison, close |
| `read` | Request Save/readback and receive `save-request` containing the embedded document; send matching save acknowledgement/refusal | Load, change subscription, agent tools, close |
| `changes` | Receive deduplicated `document-state` metadata: loaded/dirty/saving/closing/readOnly, filename, docKind (plus envelope IDs/revision) | Document source or edit authority; this is not a per-keystroke delta feed |
| `compare` | Submit another complete text to the existing comparison UI | Automatic acceptance or text export; human interaction can still apply changes |
| `close` | Request close, receive close requests/readiness, and send save/discard/cancel decisions under existing pending-close and mutation guards | Readback; `decision: save` also needs `read`. **Discard is consequential host authority.** |
| `agent` | Enable the existing broad core agent door/WebMCP exposure and receive source-free `agent-review` events naming its Will decision record, subject to boot, connection, load and kernel policy | Extra tools or an absent Notes provider. Requires explicit **both `open` and `read`**; it is not read-only agent access |

| `assets` | Receive newly inserted picture bytes in `asset-request` and answer that request with a stored URL or refusal | Document text, load, save, change notifications, agent access or close. Independent of `open` and `read`. Ships in both public profiles. |

With `close` granted, the frame's Close control sends `close-request`, the host decides, and the frame answers `close-ready` for that request.

`agent` opens the existing core tool catalogue, including edits, comparison decisions, drawing, painting and Notes reads and proposals when a Notes provider is available. The page also exposes its local instructions tool. There is no generic `invoke` postMessage method. Cross-origin parent WebMCP discovery still needs browser support and Permissions Policy, and uses exact `exposedTo`. It adds no network call, shell, arbitrary JavaScript, OAuth, clipboard, file-picker or storage-access tool. Without `agent`, known-tool calls at the hosted embed’s published invoke boundary refuse (`embed_agent_not_granted`), as well as being hidden from browser discovery.

Permissions are checked on **incoming commands and outgoing disclosure**. UI Save, retry, state updates, picture storage and close fallback cannot expand the grant. Without `read`, host Save refuses without sending source and tells the person to copy or download; that host is not a durable save destination. Without `close`, pressing the frame’s Close control explains the missing grant (save to the host first if `read` was granted, otherwise copy or download); the control and document stay open. No `close-request`, `close-ready` or other message reaches the port or window, even through close-anyway fallback. Refusal leaves save and close state unchanged, including an in-flight save; the host page must offer its own exit.

This boundary serves cooperative **cross-origin** integration. A same-origin parent already has DOM and JavaScript access regardless of postMessage grants; use a dedicated editor origin for isolation. Neither CSP nor this list distinguishes a trusted host script from an XSS script on the same origin. A malicious host can remove its iframe or lie about persistence; Rapier cannot force it to keep the work.

## 2.1 Session settings

A host may include a plain `settings` record on `rapier-connect`. Omission retains the build's defaults.
The frame validates before binding the port, selects only built-in behavior, and returns the full accepted record
in `connected.payload.settings`. Nothing in this record is written to the person's preference store, portable
settings or sync. Disconnect does not erase these session choices or work already in the frame; a reconnect
must have the same accepted settings (`settings_changed` otherwise). A fresh frame is required to change them.
Ordering of feature names is immaterial. Host settings never execute code or create agent authority.

| Field | Accepted values and behavior |
|---|---|
| `features` | A duplicate-free subset of `draw`, `paint`, `notes`, `readAloud`, `share`, `find`. Absent means everything that profile carries; `[]` selects none. Known but unbuilt features are omitted from the echo. The document profile has no Draw, Paint or Notes. |
| `language` | A well-formed BCP 47 language tag, at most 63 code units. This release carries English (`en`) only; another valid tag falls back to `en`. This does not translate document content. |
| `limits` | Optional positive safe integers `documentBytes` and `pictureBytes`. Omitted limits use the native maximum: **26,214,400 UTF-8 document bytes (25 MiB)** and **16,777,216 encoded picture bytes (16 MiB)**. Higher requests are clamped and echoed, never allowed to enlarge the native boundary. |
| `palette` | Exactly `{accent}` with a preset name: `Teal`, `Blue`, `Amber`, `Green`, `Red`, `Purple`, `Pink`, or `Gray` (case-sensitive). Absent uses the person's existing accent. A subsequent human accent choice takes over, including choosing the already-stored personal value. |

Draw and Paint are independent: either can open the existing canvas. `draw` permits SVG brush/pen, shapes and
text; `paint` permits Raster Brush. Selection, erasing, image insertion and existing effects remain shared canvas
operations when either is present. A disallowed remembered tool is not selected when opening the canvas.
The host choices hide the corresponding entry controls and guard their existing runtime entry points. They do
not remove existing drawings, pictures, notes or source, and are not a sandbox on document content or a narrower
version of the independently granted agent tool set. Copy and download recovery remain available when Share
is omitted. Feature choices do not enable a feature omitted from the build.

A host load exceeding `documentBytes` gets `load-nack` `{code: 'document_too_large', limit}` before source is
installed; UTF-8 bytes, not string length, are counted. New pictures exceeding `pictureBytes` fail with
`picture_too_large`; both selected input and normalized picture bytes are bounded. A picture insertion that
would exceed the session's document limit fails with `document_too_large` rather than changing existing source.
Existing retained work is not truncated to meet a newly requested limit.

Connect refusals are sent on the offered port with the offered IDs, null request/base revision, and a
`protocol-error` payload. The invalid connect binds nothing:

| Code | Meaning |
|---|---|
| `settings_invalid` | Settings is not a plain record. |
| `settings_unknown` | An unrecognized top-level settings key. |
| `settings_features_invalid` | Features is not a list, exceeds six entries, or contains duplicates. |
| `settings_feature_unknown` | A feature name is not in the supported vocabulary. |
| `settings_language_invalid` | Language has the wrong type, length or BCP 47 syntax. |
| `settings_limits_invalid` | Limits is not a record, has an unknown key, or contains a nonpositive/noninteger/unsafe value. |
| `settings_palette_invalid` | Palette has extra keys, is not a record, or names no existing accent preset. |
| `settings_changed` | Reconnect would change accepted settings. |

## 2.2 Host-stored pictures

Without `assets`, insertion follows the ordinary single-file Markdown appendix path and no picture bytes
leave the port. With the grant, newly pasted, chosen or drawn pictures use the same normalization, insertion,
mutation-stamp and Undo owners, with one storage exchange before commit. There is no bulk upload of existing
pictures and no document text in an upload payload.

The frame sends its ordinary envelope with `type: 'asset-request'`, a fresh `requestId`, and the base revision
captured for that request (even if a Save advances while hashing). Payload has exactly:

```js
{bytesSha256: '64 lowercase hexadecimal SHA-256 characters',
 mediaType: 'image/png', bytes: new Uint8Array(/* normalized encoded picture bytes */)}
```

Media types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/jxl`, `image/svg+xml`. Bytes are
structured-cloned, not transferred: sending them never detaches the editor's retained bytes. The host returns
`asset-ack` with exactly `{url}`, or `asset-nack` with `{code, reason}`, echoing that request's ID and base revision.
Nack code is nonempty and at most 64 code units; reason is a string at most 500 code units.

The URL must be absolute HTTPS, without credentials, whitespace, control characters, backslashes or angle
brackets, and at most 4,096 code units both before and after URL canonicalization. Relative, HTTP, `data:`,
`blob:` and executable URLs are refused. A URL already associated with different bytes or media type in this
live document is refused. The host promises the address serves the exact uploaded bytes and keeps them;
Rapier cannot certify a host's storage durability, access control or eventual serving behavior.

On acknowledgement the transaction writes an ordinary CommonMark URL image, preserving the alt text, title
and layout, without appending the same bytes. Entity-sensitive URL/title characters are escaped so parsing
cannot change their meaning. The frame **never fetches that URL back**: it retains the normalized local picture
for preview, copying, portable export and reopening an editable drawing. These retained aliases are scoped to
the current document, survive Undo and transport disconnection, and are not a second persistent storage system.
After a new document or page lifetime, a URL in loaded Markdown is an ordinary remote image subject to the
existing remote-content policy; the old session's preview bytes are not silently fetched or resurrected.

One upload can be pending per frame; its deadline is **15 seconds**. This differs from Save: after timeout the
picture takes the embedded fallback, and a late acknowledgement cannot rewrite that insertion. Nack, unavailable
storage, disconnection, a full preview budget or a concurrent upload also take the embedded fallback. Retained
previews are bounded by **1,024 distinct addresses and 25 MiB of encoded picture bytes**. Reaching either bound
refuses only a new upload; it never evicts bytes needed by existing pictures. The normal picture/document limits
still apply to fallback insertion. A changed document or insertion stamp cancels the commit, not the person's
existing source; an already-completed upload may then be an orphan for the host to reclaim.

| Code | Meaning / outcome |
|---|---|
| `asset_not_granted` | Local embedded path; no request is sent. |
| `asset_disconnected`, `asset_stale` | Retired connection or document; cancel the upload, recheck the insertion stamp. |
| `asset_busy`, `asset_cache_full` | In-flight or retained-byte/address bound; embed instead. |
| `asset_timeout`, `asset_unavailable` | Deadline, hashing or transport failure; embed instead. |
| `asset_rejected` | Host nack; embed instead. |
| `asset_bytes_invalid`, `picture_too_large`, `asset_media_type_invalid` | Invalid/empty bytes, picture bound, or unsupported media type. |
| `asset_url_invalid`, `asset_url_conflict` | Unsafe URL or an address reused for different bytes/type; embed instead. |
| `asset_reply_invalid` | Malformed acknowledgement/refusal for the pending request; embed instead. |
| `asset_unmatched` | No matching pending request ID/base revision; do not settle any other request. |
| `asset_reference_invalid` | The normalized reference cannot be replaced safely; refuse insertion. |

A reply without `assets` gets `capability_denied`. Unmatched, malformed and unsafe replies get named
`protocol-error` responses. Local fallback failures are also reported when a live port remains; ordinary lack
of a grant and an explicit host nack do not emit a redundant error. Upload errors never settle or reject a
separate Save/Close transaction.

The MIT helper accepts `assets: async ({requestId, bytesSha256, mediaType, bytes, signal}) => ({url})`, which
adds **only** the `assets` grant. It snapshots settings before navigation, verifies bytes/type/hash and the byte
limit before invoking storage, and shares a callback result for repeated IDs. It retains the latest **48**
request outcomes; the host's durable store must deduplicate beyond that window and across reloads. A changed
repeat is `asset_request_conflict`, a wrong digest is `asset_hash_mismatch`, a malformed request is
`asset_payload_invalid`, and an unclassified callback failure is `asset_failed`. Throw an Error with a bounded
`code` to send a named nack. Use `signal` for cancellable work; retirement aborts it, but cannot undo storage
already performed by host code. Only one storage callback is pending at a time; a callback that ignores
cancellation still cannot make the helper start unbounded parallel writes. See the package README for an example.

## 3. The command envelope and refusal rules

Each host-to-editor port message is a plain structured-clone record with exactly:

| Field | Rule |
|---|---|
| `type` | Nonempty string, at most 64 code units, one of the command names below |
| `sessionId`, `documentId` | Exact admitted IDs |
| `requestId` | Required nonempty string, at most 256 code units |
| `payload` | Optional plain record; arrays, Date, null and scalars refuse |
| `baseRevision` | Optional null or revision; a revision is a nonnegative safe integer or nonempty string up to 256 code units |

Extra envelope or payload fields refuse. An invalid envelope, wrong identity or stale port gets no reply and no dispatched effect. A recognized envelope with an unknown command gets `protocol-error`; a denied command gets `code: capability_denied` plus the required capability; a malformed allowed payload gets `code: invalid_payload` and a reason. These are embed protocol messages, **not JSON-RPC**. Load/save/close refusals keep their own nack and reason.

| Command | Allowed payload | Additional existing owner checks |
|---|---|---|
| `load` | Required string `content`; optional `filename`, `revision`, `readOnly`, `title`. A valid revision must come from payload or envelope. | Codec/text limit, loaded identity, dirty document, transition and revision guards |
| `compare` | Required string `content`; optional `filename` | Loaded/available comparison, canonical codec and transaction guards |
| `save` | Empty/omitted | Loaded, editable document, `read` grant, capture settled state and preserve in-flight save rules |
| `save-ack` | Required advancing `revision` | Must match the actual pending **save-request** ID and base revision; saved bookkeeping cannot erase newer edits |
| `save-nack` | Optional `code`, `reason`, `currentRevision` | Must match the pending save ID/base; conflict and unacknowledged paths retain the person's work |
| `close` | Empty/omitted | Existing dirty-work / pending-close flow |
| `close-decision` | Required `decision`: `save`, `discard`, `cancel` | Must match the pending close and mutation state; Save is separately read-gated |
| `disconnect` | Empty/omitted | No extra permission required: retire this connection, not a document deletion |
| `theme` | Required `theme`: `light`, `dark`, `system` | No permission required: how the frame looks, never the document |
| `asset-ack` | Exactly `{url}` | `assets` grant, current pending request ID/base revision, safe URL and retained-byte association |
| `asset-nack` | Exactly `{code, reason}` | `assets` grant and current pending request ID/base revision; retain embedded fallback |

Filename bound is 255 code units, title 240, code 64, reason 500. The wire content pre-gate is the document limit (25 MiB) counted in code units; the codec/transaction owner applies the actual UTF-8 admission limit. Requests larger than the browser can clone may fail before Rapier.

Editor-originated messages use the same identity/revision envelope, but unsolicited replies may have `requestId: null`; do not apply host-to-editor request-ID rules to unsolicited state. `connected`, load/compare replies and protocol errors are control replies; the protected source and metadata channels are checked separately. No `fetch`, `evaluate`, `readStorage`, `exportAll` or arbitrary agent-call command exists, and unknown commands do not dispatch.

### A save is a two-party acknowledgement

`save` asks Rapier to capture. The resulting `save-request` has its **own** ID and a base revision. The host must durably store that captured payload against that revision, then echo both fields in `save-ack` with an advanced durable revision. A successful send, an in-memory assignment, a new request ID or a promise to save later is not an acknowledgement. On storage conflict, send `save-nack` with `code: conflict` and the current revision. On failure, keep the work recoverable and report it; do not label it saved. A save acknowledgement displays the browser-authenticated host and port ("saved to docs.example.com"); the host cannot name itself, and `load` takes no such field.

Rapier waits for the save answer as long as the connection lives. After fifteen seconds without one it tells the person the host has not confirmed the save yet (Copy and Download stay open to them) and keeps the save pending: a `save-ack` that arrives later is accepted, later saves wait behind it, and the person's Retry resends the same save-request with the same `requestId` and base revision. Only a `save-nack`, a `disconnect` or a lost port ends it. After a `save-nack`, Retry sends a new save-request with a new id; after a lost connection, the same save-request is sent again on the next connection. An agent's `document.save` receipt says `unacknowledged` at the fifteen seconds. A failed close is retried as a close.

**Store each `requestId` once.** On Retry or reconnect, recognise a repeated id, skip the write and repeat the first answer: the same `save-ack` revision or `save-nack`.

### The host's theme

The host sets `theme` in `rapier-connect` and changes it with a `theme` port message. The frame paints it and stores nothing; a theme the person picks in the frame's own settings takes over from it until the host sends another.

### The agent's proposal and the person's Will decision

With `agent` granted, a loaded frame sends `agent-review` when its existing kernel review is staged or changes. It names the same decision record that `document.get_context` and the editor's review controls use; it creates no second history and grants the host no decision command. `changes` is not required. Without `agent`, none of these events leaves the frame.

The exact envelope is:

```js
{
  type: 'agent-review',
  sessionId: 'the admitted session',
  documentId: 'the admitted document',
  requestId: null,
  baseRevision: 'the current host revision',
  payload: {
    id: 'review_0123456789abcdef0123456789abcdef',
    kind: 'proposal',
    status: 'pending',
    cause: 'will',
    revision: 3,
    law: 'keep',
    region: 0,
    changes: [{id: 'review_0123456789abcdef0123456789abcdef.1', status: 'pending'}],
    decision: null
  }
}
```

Every payload field above is present; there are no additional fields. `id` is the kernel-minted review identifier (`review_` followed by 32 lowercase hexadecimal digits). `kind` is `proposal` or `inline`; `status` is `pending`, `approved`, `declined` or `invalidated`; `cause` is `will`, `ask` or `proposal`. `revision` is the kernel's nonnegative safe-integer document revision, separate from the host's durable `baseRevision`. `law` is `keep`, `append`, `edit` or `null`; `region` is its zero-based nonnegative safe-integer region index, or `null` when no region is named. Each `changes` entry has only its review-derived `id` and a `status` of `pending`, `applied`, `dropped` or `stale`.

`decision` is `null` until the kernel records a completed decision. Then it contains exactly `{action, outcome, revision}`: `action` is `approve` or `decline`, `outcome` is `ok`, `applied`, `rebased` or `unchanged`, and `revision` is a nonnegative safe integer. Applying or dropping part of a proposal updates `changes` while the review remains `pending` and `decision` remains `null`; the last decision closes the same `id`. An invalidated review reports `status: 'invalidated'` without inventing a human decision. An immediate agent edit that needed no review produces no review event.

The event carries no source, inserted or removed text, excerpt, position, label, intent, reason, caller name or vault key. Only the allowed identifiers, enums and numbers are projected from the kernel's source-rich record. Unchanged metadata and revision-only rebases are deduplicated; this is not a live text or per-keystroke feed. Replacing a port may replay the current record on the new connection; retired ports and another document's records receive nothing. Events are session notifications, not a durable audit log.

For example, a host mounts with `agent: true` and subscribes with `editor.on('agent-review', review => { /* record review.id and its decision metadata */ })`. Its agent uses the existing door's `document.read_context` and `document.propose_edits` tools for a passage marked `keep`. The host hears a pending review with `cause: 'will'` and `law: 'keep'`; the person's approval or refusal updates that same record. The Markdown leaves through the existing Save exchange, never through this event. The helper README contains the runnable mount and save example.

## 4. CSP: what exists

`security/csp.mjs` owns the policy checked by the build. The web shell's meta has default-src none, inline/wasm/blob scripts, inline styles, data fonts, self/blob workers, no base URL override or form submission. It permits images from self/data/blob/**HTTPS**, media from self/blob/HTTPS, and connections to self, the jsDelivr optional-resource host, Cloudflare's R2 storage host (`*.r2.cloudflarestorage.com`, for the person's own bucket), and `https://mcp.rapier.website` for a carried page's explicit Send back; the Cloudflare dashboard and API origins join `connect-src` only in a build whose hosted sign-in is registered. The hosted header adds `frame-ancestors https: http://localhost:* http://127.0.0.1:*`; the native policy uses `frame-ancestors 'none'`. A meta policy does not enforce frame-ancestors. The handshake parser also admits IPv6 loopback, but the hosted header does **not** currently list it: do not promise that localhost IPv6 framing works under that header.

**`img-src https:`**: pictures from any HTTPS site show everywhere, in the page and in the exported page alike, behind the editor's own allow. A remote picture shows its description and origin until the person loads remote content for that document, and the exported page keeps its no-referrer policy. The person’s allow, not CSP, gates remote pictures. The embed contract adds no editor fetch or remote resource.

The parent must allow the editor origin in `frame-src` and keep frame and sandbox restrictions compatible. A cross-origin sandbox needs scripts and a non-opaque editor origin (`allow-scripts` and `allow-same-origin`); this is not safe for a same-origin sandbox. Additional clipboard and download privileges are separate host decisions. `tools` is a separate browser Permissions Policy feature for WebMCP, not a synonym for granting `agent`. It defaults to the top-level origin alone, so a cross-origin host that wants the editor's WebMCP tools must delegate it to the frame (`allow="tools"`), and the browser checks it again at every call. Without it the door registers nothing and `status().failures` names each tool's refusal; the door's own re-check at execution (connection, admission, the registering document) stands regardless. The tools belong to the document that registered them: the door registers on `document.modelContext`, never on `window`, keeps no catalog outside that document, and retires every registration when the registering context changes. WebMCP's lifecycle events (`toolactivated`, `toolcancel` on `document.modelContext`) name a tool, not an invocation; Rapier keys its receipts and reviews by its own invocation identities and does not use them.

MCP Apps receives worker `_meta.ui.csp` instead, including the configured download domains and resource origin, and asks its host for clipboard-write permission. Its resource carries a sensitive editor key, is private/TTL-zero, and belongs to the Apps host's trust model. The `rapier-html` wrapper inserts carried data into the supplied page; it does not set an HTTP CSP, accept parent origins, fetch a return address, or authorize generic iframe commands.

## 5. What is checked, and what is not

The retained `agent-door-admission` row checks agent admission and the `agent-review` metadata allowlist against the real kernel and extracted door/message functions: the grant, current document and port, partial decisions and source exclusion. Its built iframe cell uses a real MessageChannel host that connects at `load`, then exercises the existing agent and human review adapters and compares the resulting source byte for byte. It also carries session settings, pastes an SVG through the built insertion dialog, checks the resulting bytes/hash and URL source, and checks that the preview uses local bytes with no request to the returned address. These are content/authority checks, not appearance assertions. That cell is same-origin and does not exercise native WebMCP discovery. The Node cells also run the shared settings parser, actual connect/load/preference entry functions, the bounded asset broker, the real insertion/appendix writer, and real MessageChannel helper exchanges, with explicit document/presentation boundary doubles. They cover fallback, stale work, limits, entities and Save isolation. `generic-client-authority` adds assets-only helper authority, hash checks and idempotence. The helper's retained cells cover its transport and form value. A Node-only run does not execute any built-browser cell; a build receipt establishes syntax/assembly only. The former `security-embed-scope` row is retired; it is not a current origin/envelope/CSP receipt. Not proved here: browser CSP enforcement, sandbox attributes, UI copy/download recovery after a refused Save, and any real host's durability.
