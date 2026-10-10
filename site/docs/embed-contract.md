# The Rapier embed contract

Enforced at the iframe message boundary in `editor/engine.js`; agent admission is in `agent/browser.js`. MCP Apps (`agent/apps.js`) and the carried-page wrapper (`rapier-html`) have separate contracts. For a runnable host, see the README, "In your own app". The MIT host helper is `rapier-embed` (`packages/rapier-embed/embed.mjs` and its shared `contract.mjs`; its README is generated from `skills/embed-rapier/SKILL.md`). It provides `Rapier.mount` and the form-associated `<rapier-editor>` on this same wire.

With agent access enabled, an agent edits live beside the person or while they are away. Rapier shows presence
and changes; the person taps a change to see the before and undoes anything while preserving later edits.
`comparison.present` deliberately shows a diff. The host owns its storage and source-disclosure grants; the
editor owns its document history and before views.

## 1. Two origins, one parent, one channel

The parent frames a served page with `?embed=1`: no origin is declared in the URL or in the handshake. The published document profile is `https://rapier.website/embed/rapier-document.html`, with permanent copies at `https://rapier.website/embed/<version>/rapier-document.html`; the read-only reader is `https://rapier.website/embed/rapier-reader.html` and `https://rapier.website/embed/<version>/rapier-reader.html` (section 2.4). A self-hosted copy speaks the same protocol. The frame binds to the origin of the first valid `rapier-connect` from its parent and holds it for the session; a later connect from any other origin is ignored.

That origin must be HTTPS, or HTTP only for `localhost`, `127.0.0.1` and `[::1]` development. A port is part of an origin. `null` and opaque origins are refused. This admits a window, not a person.

Rapier listens before boot: a host may post `rapier-connect` at the frame’s `load` event; the first valid connect waits until the frame is ready. Rapier repeats `rapier-ready` to its parent at increasing intervals until a host connects. It carries nothing: before a connect it is posted to the parent whatever its origin (`*`), and after one to the bound origin. The host verifies both `event.source === frame.contentWindow` **and** `event.origin === editorOrigin` for anything it receives on the window, and targets its connect at the exact editor origin with one MessagePort transferred. Rapier independently verifies **actual `event.source === window.parent`** and the origin rule above; matching strings inside `data` alone are never sufficient. There is no connection timeout: the person is told the host has not connected only when they do something that needs it (Close before a host has connected).

A **same-origin** frame needs no parameter or protocol and boots as a top-level editor with its own storage. A frame from **another origin** without `embed=1` is refused. A carried page is the person's file wherever it is framed, and boots as a top page.

The handshake accepts only `type`, `sessionId`, `documentId`, `capabilities`, optional `contract`, optional `settings` (section 2.1), optional `theme` (`light`, `dark` or `system`), and optional `agent` (`{name}`); anything else, including `expectedOrigin`, refuses the connection. The host-given agent name is a nonblank string of at most 96 UTF-16 code units, with no control characters or extra fields. It is attribution, not authenticated identity or an authority grant. The first valid name at this door is retained for the page session; a reconnect cannot rename it. Both IDs are nonempty strings of at most 256 UTF-16 code units. The grant and accepted settings are frozen after admission. A reconnect may replace transport, not change permissions; grant ordering is immaterial. After load it must retain both IDs. An in-flight save, close or load also blocks replacing the port. Reload to declare different authority, and preserve unsaved work before doing so.

The transferred MessagePort is unforgeable, **not secret after the host forwards it**. The port and its generation are pinned; old-port callbacks refuse after replacement. An accepted reconnect cancels any pending file picker. The host must not forward it to untrusted code; the port carries only the admitted session and document. Scripts on the same host origin are one trust principal, not separate identities.

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
| `open` | `load` host-supplied source, name, revision and read-only flag through existing load guards; the person's file picker and its host fallback | Readback, notifications, agent tools, comparison, close |
| `read` | Request Save/readback and receive `save-request` containing the embedded document; send matching save acknowledgement/refusal | Load, change subscription, agent tools, close |
| `changes` | Receive deduplicated `document-state` metadata: loaded/dirty/saving/closing/readOnly, filename, docKind (plus envelope IDs/revision) | Document source or edit authority; this is not a per-keystroke delta feed |
| `compare` | Show another complete text beside the current document | Source changes, text export or another capability |
| `close` | Request close, receive close requests/readiness, and send save/discard/cancel decisions under existing pending-close and mutation guards | Readback; `decision: save` also needs `read`. **Discard is consequential host authority.** |
| `agent` | Enable the document's agent tools over WebMCP, with live edits, presence, change previews and Undo | Port source disclosure, extra tools or an absent Notes provider. Requires explicit **both `open` and `read`**; it is not read-only agent access |

| `assets` | Receive newly inserted picture bytes in `asset-request` and answer that request with a stored URL or refusal | Document text, load, save, change notifications, agent access or close. Independent of `open` and `read`. Ships in both public profiles. |

With `close` granted, the frame's Close control sends `close-request`, the host decides, and the frame answers `close-ready` for that request.

`agent` opens the shared tool catalog: inspected edits, deliberate comparisons, drawing, painting and Notes
operations when their providers are available. Edits obey exact currentness, the person's Will and active
composition. Every source write returns its act from the same document history; `document.undo` reverses an
identified act or turn while keeping later work. Section 2.3 covers preferences and device actions. The page
also exposes its local guide tool.

There is no generic `invoke` postMessage method. Cross-origin WebMCP discovery needs browser support and
Permissions Policy and uses exact `exposedTo`. Agent access adds no arbitrary network, shell, JavaScript,
OAuth or storage-access tool. Device requests retain the browser's own permissions and activation rules.
Without `agent`, known-tool calls at the embed's published invocation boundary refuse
`embed_agent_not_granted` and remain absent from browser discovery.

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
not remove existing drawings, pictures, notes or source, and are not a sandbox on document content. The core
document tools retain their independently granted authority; editor device actions obey the same feature gates
as their controls. Copy and download recovery remain available when Share
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

## 2.3 Editor preferences and device actions

The `agent` grant admits `editor.set_view`, `editor.set_preferences`, `editor.read_aloud`, `editor.copy`,
`editor.open_file` and `editor.install_plugin` through the shared agent door. They
add no port command and cannot change the host's capabilities, accepted settings, document identity or revision.
A file picker can use the host exchange below.
An absent, disconnected or unready editor returns `editor_unavailable` with a hint to open the editor.
`editor.set_view({view})` separately requests formatted, source or Notes cards. It changes presentation, not
a device preference or a particular note. A queued view waits for idle; later human navigation wins.

`editor.set_preferences({preference, value})` sets one named device preference through `RapierPreferences`. The catalogue defines the exact
names and value domains. A successful receipt records the applied value and its previous value, without a
confirmation card, and the editor's notice offers the person Undo until any later change of that
preference. Physical reader-only resources and host-controlled settings retain their actual restrictions. An active host theme or accent refuses an agent change
of that preference: the request cannot clear the host override or rewrite the frozen settings. The person's own
controls retain their existing ability to take over from the host. A later human preference change takes
precedence and is reported by `document.observe`.

`editor.read_aloud` requests spoken playback of a passage, `editor.copy` copies a passage in its chosen
format, `editor.open_file` requests the device file picker, and `editor.install_plugin` installs one add-on
from the supported Rapier catalog. Each request reports the device action's actual result and any required platform gesture. The request does not grant clipboard access, user
activation, audio permission, download permission or a feature that the host excluded. A denied feature or
unavailable device capability produces an unavailable receipt with its reason; no action is reported as done
merely because the request was accepted.

`document.export` supplies Word or PDF with `format: "docx"` or `"pdf"`, without a tap. The open editor builds the file from the request's captured document and
hands the bytes to the export store for a download receipt. A changed document invalidates an unfinished
export, and a print dialog never stands in for the file. Word uses the same native OOXML writer as the
document's Export control, so the bytes are the Export control's own. Conversion notices travel with the
receipt, while the source stays in the editor.

### Opening a device file

The person's Open and `document.open_file` use the same picker. A connected, loaded frame needs `open`;
an editor whose host loaded it read-only refuses replacement. The reader can open a chosen file for viewing
and remains read-only. An agent request still needs its confirmation tap. Its `done` receipt means the
picker started or the host accepted that picker request; choosing or importing a file happens afterward.

The frame starts its own file input during the person's tap. If the browser refuses that picker, it asks
the host through the admitted port. Every message below echoes the picker request's `requestId` and
captured `baseRevision`, with the existing session and document IDs:

| Direction | Type | Exact payload |
|---|---|---|
| Frame to host | `open-request` | `{}` |
| Host to frame | `open-ack` | `{}`: the chooser started or the host accepted the request |
| Host to frame | `open-result` | `{file}`: one `File`, or `null` for cancellation |
| Host to frame | `open-nack` | `{code, reason}`: a nonempty code of at most 64 code units and a reason of at most 500 |
| Frame to host | `open-cancel` | `{}`: retire the matching chooser |

`open-result` also acknowledges acceptance. A host has 15 seconds to acknowledge the request; an
acknowledged chooser may remain open until selection or cancellation. A wrong request ID, base revision
or retired port cannot settle another chooser. Malformed replies refuse without opening a file.
Document changes, host loads and connection retirement cancel unfinished work. One result is consumed
once; a late or repeated result cannot open another document.

The chosen file goes through the build's existing codecs and importers. Pictures open as a complete
Markdown image and asset appendix in one import: original raster bytes are kept, and SVG uses the
existing sanitizer with its drawing recipe and embedded picture resources retained. An editor's existing
image and Draw Edit controls can reopen the imported picture; a reader displays it and stays read-only.
No empty document is committed while image preparation is still pending.

An editor imports the chosen source into the current host document through the source transaction and
Undo owners. Earlier unsaved
source stays in Undo. Reload recovery retains the chosen filename and source; a draft is retired only
when both match the host's saved document. The filename and source remain unsaved against the host's existing durable
revision until the host acknowledges Save. No native file binding or ordinary editor recovery slot is
acquired. A reader reports its new view with `readOnly: true` and gains no Save or agent authority.
The existing `document-state` message reports changed metadata only when `changes` was granted;
on this port, document source leaves only through the independently granted Save exchange.

`Rapier.mount` supplies a host file input by default. A host can instead provide
`openFile({requestId, baseRevision, signal})`, returning a `File`, `null`, or a promise for either:

```js
Rapier.mount(container, {
  load: {content: '# Notes\n', filename: 'notes.md', revision: 1},
  openFile: ({signal}) => app.chooseFile({signal}),
});
```

Here `app.chooseFile` is the host's chooser. The callback receives no document source and adds no grant.
Honor `signal` to close a cancelled chooser. Only one callback may remain pending, even if it ignores
cancellation. The helper keeps the latest 48 request IDs and metadata outcomes, without retaining file
bytes. A repeated retained ID never invokes the chooser again: a pending request repeats `open-ack`,
and a completed selection returns `open-nack` with `open_completed`. A changed base revision returns
`open_request_conflict`. Picker errors and cancellations never settle an unrelated Save or Close.

## 2.4 The reader build

`rapier-reader.html` speaks this contract with four differences. It admits only the `open` and `changes`
capabilities; a connect that offers any other is refused with `capabilities_invalid`. Every load is read-only:
`load-ack` and `document-state` carry `readOnly: true` whatever the payload says. Its settings features are `find`, `readAloud` and `share`;
`draw`, `paint` and `notes` are omitted from the echo. It also accepts `style`, a command
that needs no grant and restyles the frame, never the document. The reader enforces the contract in `reader/embed.js`,
with the editor's own envelope, request-ledger and validation functions.

Every build reads one setting from its own address, before any connect: `?plugins=<directory>`. With it, every plug-in file is
fetched from that directory (by its file name, which `rapier-plugins.json` lists) and from nowhere else; each file is still held to
its pinned length and SHA-384. The `plugins` option of `rapier-embed` adds it. The directory must be on the page's own origin,
which is all its Content Security Policy lets it read: `Rapier.mount` throws a `TypeError` for any other, and a page opened with one
refuses it, in words, before it makes a request.

`style` carries `{css?, fonts?}`. `css` is a string of at most 4 MiB, placed after the reader's own sheets and
replaced by the next `style`. `fonts` is a list of at most 16 `{family, source, descriptors?}` records handed to
`FontFace`: `source` is the face's bytes (an `ArrayBuffer` or typed array) or a CSS source string, and descriptor
values are strings. A malformed payload gets `protocol-error` `invalid_payload`; a face the browser cannot load gets
`protocol-error` `font_invalid`. The page policy admits `data:` fonts only, so a remote `url()` source does not load.
The editor builds answer `style` with `protocol-error`, as for any unknown command. The reader's public custom
properties are listed in the `rapier-embed` README.

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
| `open-ack` | Empty/omitted | `open` grant and current pending picker request ID/base revision |
| `open-result` | Exactly `{file}`: `File` or `null` | `open` grant, current picker/document/port, one result, existing file codecs and source limit |
| `open-nack` | Exactly `{code, reason}` | `open` grant and current pending picker request ID/base revision; leave source unchanged |

Filename bound is 255 code units, title 240, code 64, reason 500. The wire content pre-gate is the document limit (25 MiB) counted in code units; the codec/transaction owner applies the actual UTF-8 admission limit. Requests larger than the browser can clone may fail before Rapier.

A `load` of a revision for which this tab still holds the session's unsaved draft opens the draft as the document, with the host's `content` as the saved text: the draft is unsaved work, a save carries it, and nothing is asked. One notice says so, and `load-ack` carries `recoveredDraft: true`. The draft stays in its slot until a save, or the host's `discard` close decision, clears it.

Editor-originated messages use the same identity/revision envelope, but unsolicited replies may have `requestId: null`; do not apply host-to-editor request-ID rules to unsolicited state. `connected`, load/compare replies and protocol errors are control replies; the protected source and metadata channels are checked separately. No `fetch`, `evaluate`, `readStorage`, `exportAll` or arbitrary agent-call command exists, and unknown commands do not dispatch.

### A save is a two-party acknowledgement

`save` asks Rapier to capture. The resulting `save-request` has its **own** ID and a base revision. The host must durably store that captured payload against that revision, then echo both fields in `save-ack` with an advanced durable revision. A successful send, an in-memory assignment, a new request ID or a promise to save later is not an acknowledgement. On storage conflict, send `save-nack` with `code: conflict` and the current revision. On failure, keep the work recoverable and report it; do not label it saved. A save acknowledgement displays the browser-authenticated host and port ("saved to docs.example.com"); the host cannot name itself, and `load` takes no such field.

Rapier waits for the save answer as long as the connection lives. After fifteen seconds without one it tells the person the host has not confirmed the save yet (Copy and Download stay open to them) and keeps the save pending: a `save-ack` that arrives later is accepted, later saves wait behind it, and the person's Retry resends the same save-request with the same `requestId` and base revision. Only a `save-nack`, a `disconnect` or a lost port ends it. After a `save-nack`, Retry sends a new save-request with a new id; after a lost connection, the same save-request is sent again on the next connection. An agent's `document.save` receipt says `unacknowledged` at the fifteen seconds. A failed close is retried as a close.

**Store each `requestId` once.** On Retry or reconnect, recognise a repeated id, skip the write and repeat the first answer: the same `save-ack` revision or `save-nack`.

The helper binds each saved ID to a SHA-256 of its exact source plus its filename, document kind, code language
and base revision. A different capture under the same ID is refused as `save_request_conflict`; it cannot reuse
the original acknowledgement. The session's UTF-8 document byte limit, well-formed Unicode and save metadata
schema are checked before the storage callback, with `document_too_large` and `save_payload_invalid` refusals.

### The host's theme

The host sets `theme` in `rapier-connect` and changes it with a `theme` port message. The frame paints it and stores nothing; a theme the person picks in the frame's own settings takes over from it until the host sends another.

### Agent acts and the person's view

With `agent: true`, the agent reads exact source through `document.read` and changes inspected passages with
`document.edit`. The person's Will markers remain theirs: a Will violation returns `document_law`, and source
collisions and active composition keep their currentness protections. Source writes land live and return their canonical
act; an unchanged write returns `act: null`. `document.undo` reverses an identified act or turn through the
same history, retaining later edits. Original author and time remain attached to each act; a turn's label is
separate from its stable identity.

Presence, change marks and before previews stay in the editor. The person taps a change to see its before and
can undo anything, or continue without inspecting it. Seen state stays on their device and creates no source
act. `comparison.present` shows a diff deliberately without deciding whether edits land.

The agent reads its receipts through the tool channel. The host receives source only through the admitted
Save exchange; the `changes` grant remains source-free `document-state` metadata. Neither channel becomes
a per-keystroke feed or a second history. The port has no agent review-decision event or command, and this contract adds no notification schema for acts.
Source commitment, editor presentation and the host's durable save have separate receipts.

## 4. CSP: what exists

`security/csp.mjs` owns the policy checked by the build. The web shell's meta has default-src none, inline/wasm/blob scripts, inline styles, data fonts, self/blob workers, no base URL override or form submission. It permits images from self/data/blob/**HTTPS**, media from self/blob/HTTPS, and connections to self, the jsDelivr optional-resource host, Cloudflare's R2 storage host (`*.r2.cloudflarestorage.com`, for the person's own bucket), and `https://mcp.rapier.website` for a carried page's explicit Send back; the Cloudflare dashboard and API origins join `connect-src` only in a build whose hosted sign-in is registered. The hosted header adds `frame-ancestors https: http://localhost:* http://127.0.0.1:*`; the native policy uses `frame-ancestors 'none'`. A meta policy does not enforce frame-ancestors. The handshake parser also admits IPv6 loopback, but the hosted header does **not** currently list it: do not promise that localhost IPv6 framing works under that header.

**`img-src https:`** permits HTTPS pictures in the editor after the person allows remote content for that document. Until then, a remote picture shows its description and origin. Offline page export refuses unresolved pictures, including remote pictures already allowed in the editor; embed them before exporting. The exported page keeps its no-referrer policy. The person’s allow, not CSP, gates remote pictures. The embed contract adds no editor fetch or remote resource.

The parent must allow the editor origin in `frame-src` and keep frame and sandbox restrictions compatible. A cross-origin sandbox needs scripts and a non-opaque editor origin (`allow-scripts` and `allow-same-origin`); this is not safe for a same-origin sandbox. Additional clipboard and download privileges are separate host decisions. `tools` is a separate browser Permissions Policy feature for WebMCP, not a synonym for granting `agent`. It defaults to the top-level origin alone, so a cross-origin host that wants the editor's WebMCP tools must delegate it to the frame (`allow="tools"`), and the browser checks it again at every call. Without it the door registers nothing and `status().failures` names each tool's refusal; the door's own re-check at execution (connection, admission, the registering document) stands regardless. The tools belong to the document that registered them: the door registers on `document.modelContext`, never on `window`, keeps no catalog outside that document, and retires every registration when the registering context changes. WebMCP's lifecycle events (`toolactivated`, `toolcancel` on `document.modelContext`) name a tool, not an invocation. Rapier binds request receipts and cancellation to its own invocation identities; source acts retain their canonical transaction IDs.

MCP Apps receives worker `_meta.ui.csp` instead, including the configured download domains and resource origin, and asks its host for clipboard-write permission. Its resource carries a sensitive editor key, is private/TTL-zero, and belongs to the Apps host's trust model. The `rapier-html` wrapper inserts carried data into the supplied page; it does not set an HTTP CSP, accept parent origins, fetch a return address, or authorize generic iframe commands.

## 5. What is checked, and what is not

Verification protects the host grant, current document and port, exact source, confirmed saves, retained
picture bytes, stale-work refusal and Undo. The retained `agent-door-admission` and `generic-client-authority`
rows cover those owners and their MessageChannel exchanges. Picture checks preserve bytes, hashes, URL source
and the local preview's network boundary. The helper's retained cells cover transport and form-value custody.

A Node-only run does not execute a built-browser cell. A same-origin iframe does not prove native WebMCP
discovery or cross-origin CSP enforcement, and a build receipt establishes assembly only. Report the actual
rows and host paths exercised. Browser sandbox enforcement, recovery controls and a real host's storage
durability require their own evidence; these contracts do not establish them by assertion.
