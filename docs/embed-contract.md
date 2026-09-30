# The Rapier embed contract

Enforced at the generic iframe message boundary in `editor/engine.js`; agent admission is in `agent/browser.js`. This contract does not replace MCP Apps (`agent/apps.js`) or the carried-page byte wrapper (the `rapier-html` package). A runnable host is in the README, "In your own app". The `rapier-embed` package (MIT, source `skills/embed-rapier/`) is the host helper that speaks this contract; a coding agent reads `skills/embed-rapier/SKILL.md`.

## 1. Two origins, one parent, one channel

The parent frames an already-served page at `rapier.html?embed=1`, and nothing more: no origin is declared in the URL or in the handshake. The frame binds to the origin of the first valid `rapier-connect` from its parent and holds it for the session; a later connect from any other origin is ignored.

That origin must be HTTPS, or HTTP only for `localhost`, `127.0.0.1` and `[::1]` development. A port is part of an origin. `null` and opaque origins are refused. This says which window may talk to the frame; it does not authenticate a person.

Rapier listens from its first moment, before the editor has booted: a host may post `rapier-connect` as soon as the frame's `load` event fires, and the first valid connect is held until the frame is ready and then taken. Rapier also announces `rapier-ready` to its parent until a host connects, further apart each time and without giving up. It carries nothing: before a connect it is posted to the parent whatever its origin (`*`), and after one to the bound origin. The host verifies both `event.source === frame.contentWindow` **and** `event.origin === editorOrigin` for anything it receives on the window, and targets its connect at the exact editor origin with one MessagePort transferred. Rapier independently verifies **actual `event.source === window.parent`** and the origin rule above; matching strings inside `data` alone are never sufficient. There is no connection timeout: the person is told the host has not connected only when they do something that needs it (Close before a host has connected).

A frame from the **same site** as its parent needs no parameter and boots as the editor does at the top, with its own storage and no protocol to implement. A frame from **another site** without `embed=1` is refused. A carried page is the person's file wherever it is framed, and boots as a top page.

The handshake accepts only `type`, `sessionId`, `documentId`, `capabilities` and an optional `theme` (`light`, `dark` or `system`); anything else, including `expectedOrigin`, refuses the connection. Both IDs are nonempty strings of at most 256 UTF-16 code units. The grant is frozen after admission. A reconnect may replace transport, not change permissions; grant ordering is immaterial. After load it must retain both IDs. An in-flight save, close or load also blocks replacing the port. Reload to declare different authority, and preserve unsaved work before doing so.

The transferred MessagePort is an unforgeable browser transport reference, **not a secret after the host forwards it elsewhere**. The port and its generation are pinned; old-port callbacks refuse after replacement. The host must not forward the port to untrusted code, and on the port it hears only the admitted session and document. Scripts on the same host origin are one trust principal, not separate identities.

## 2. Capabilities: no implied permission

A missing list means `[]`. Unknown names, duplicates, non-array values and non-string entries refuse the entire connection. The `connected` reply echoes the accepted canonical list; merely connecting grants no readback, editing, or change events.

| Capability | What the parent explicitly authorizes | What it does not implicitly grant |
|---|---|---|
| `open` | `load` host-supplied source, name, revision and read-only flag through existing load guards | Readback, notifications, agent tools, comparison, close |
| `read` | Request Save/readback and receive `save-request` containing the embedded document; send matching save acknowledgement/refusal | Load, change subscription, agent tools, close |
| `changes` | Receive deduplicated `document-state` metadata: loaded/dirty/saving/closing/readOnly, filename, docKind (plus envelope IDs/revision) | Document source or edit authority; this is not a per-keystroke delta feed |
| `compare` | Submit another complete text to the existing comparison UI | Automatic acceptance or text export; human interaction can still apply changes |
| `close` | Request close, receive close requests/readiness, and send save/discard/cancel decisions under existing pending-close and mutation guards | Readback; `decision: save` also needs `read`. **Discard is consequential host authority.** |
| `agent` | Enable the existing broad core agent door/WebMCP exposure, subject to boot, connection, load and kernel policy | Extra tools or an absent Notes provider. Requires explicit **both `open` and `read`**; it is not read-only agent access |

With `close` granted, the frame's Close control sends `close-request`, the host decides, and the frame answers `close-ready` for that request.

`agent` opens all 16 existing core tools, including edits, comparison decisions, drawing and Notes reads when a Notes provider is available. It is not a new generic `invoke` postMessage method; the generic message vocabulary remains fixed. Cross-origin parent WebMCP discovery still needs browser support and Permissions Policy, and uses exact `exposedTo`. It adds no network call, shell, arbitrary JavaScript, OAuth, clipboard, file-picker or storage-access tool. Declining `agent` also refuses known-tool calls at the published invoke boundary in a hosted embed (`embed_agent_not_granted`); it is not merely hidden from browser discovery.

Permissions are checked on **incoming commands and outgoing disclosure**. A UI Save, retry, state update or close fallback cannot silently grant the host more than the handshake gave it. Without `read`, host Save is refused rather than sending the person's words, and the person is told to copy or download their work instead; a host denied readback is not a durable save destination. Without `close`, the frame's Close control stays on its chrome, and pressing it tells the person that this host was not granted close requests (save to the host first where `read` was granted, otherwise copy or download) while the document stays open. The host receives nothing: no `close-request` or `close-ready` on the port, nothing on the window, and the close-anyway fallback posts nothing either. The refusal moves no save or close state, so a save in flight completes as it would have; leaving the frame is the host page's own control to offer.

This is a boundary for cooperative **cross-origin** integration. A same-origin parent already has DOM and JavaScript access regardless of postMessage grants; use a dedicated editor origin for isolation. Neither CSP nor this list distinguishes a trusted host script from an XSS script on the same origin. A malicious host can remove its iframe at any time or lie about persistence, and Rapier cannot force the embedding website to keep the person's work.

## 3. The command envelope and refusal rules

Each host-to-editor port message is a plain structured-clone record with exactly:

| Field | Rule |
|---|---|
| `type` | Nonempty string, at most 64 code units, one of the command names below |
| `sessionId`, `documentId` | Exact admitted IDs |
| `requestId` | Required nonempty string, at most 256 code units |
| `payload` | Optional plain record; arrays, Date, null and scalars refuse |
| `baseRevision` | Optional null or revision; a revision is a nonnegative safe integer or nonempty string up to 256 code units |

Extra envelope or payload fields refuse. An invalid envelope, wrong identity or stale port gets no reply and no dispatched effect. A recognized envelope with an unknown command gets `protocol-error`; a denied command gets `code: capability_denied` plus the required capability; a malformed allowed payload gets `code: invalid_payload` and a reason. These are embed protocol messages, **not JSON-RPC**. Existing deeper load/save/close refusals retain their own nack and reason.

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

Filename bound is 255 code units, title 240, code 64, reason 500. The wire content pre-gate is the document limit (25 MiB) counted in code units; the codec/transaction owner applies the actual UTF-8 admission limit. Requests larger than the browser can clone may fail before Rapier.

Editor-originated messages use the same identity/revision envelope, but unsolicited replies may have `requestId: null`; do not apply host-to-editor request-ID rules to unsolicited state. `connected`, load/compare replies and protocol errors are control replies; the protected source and metadata channels are checked separately. No `fetch`, `evaluate`, `readStorage`, `exportAll` or arbitrary agent-call command exists, and unknown commands do not dispatch.

### A save is a two-party acknowledgement

`save` asks Rapier to capture. The resulting `save-request` has its **own** ID and a base revision. The host must durably store that captured payload against that revision, then echo both fields in `save-ack` with an advanced durable revision. A successful send, an in-memory assignment, a new request ID or a promise to save later is not an acknowledgement. On storage conflict, send `save-nack` with `code: conflict` and the current revision. On failure, keep the work recoverable and report it; do not label it saved. When a save is acknowledged the frame tells the person where it went by the host's origin as the browser authenticated it on connect (its host and port, "saved to docs.example.com"); a host does not name itself in the frame's words, and `load` takes no such field.

**A late save is not a lost one.** Rapier waits for the answer as long as the connection lives. After fifteen seconds without one it tells the person the host has not confirmed the save yet (Copy and Download stay open to them) and keeps the save pending: a `save-ack` that arrives later is accepted, later saves wait behind it, and the person's Retry resends the same save-request with the same `requestId` and base revision. Only a `save-nack`, a `disconnect` or a lost port ends it. After a `save-nack`, Retry sends a new save-request with a new id; after a lost connection, the same save-request is sent again on the next connection. An agent's `document.save` receipt says `unacknowledged` at the fifteen seconds. A failed close is retried as a close.

**A host stores a repeated `requestId` once and answers it the same way each time.** The same save-request can reach a host more than once (a Retry, a reconnect). The host recognises the id, does not write the payload again, and sends the answer it sent the first time: the same `save-ack` revision, or the same `save-nack`.

### The host's theme

The host says its theme on connect (`theme` in `rapier-connect`) and changes it live with a `theme` message on the port. The frame paints it and stores nothing; a theme the person picks in the frame's own settings takes over from it until the host sends another.

## 4. CSP: what exists

`security/csp.mjs` owns the policy checked by the build. The web shell's meta has default-src none, inline/wasm/blob scripts, inline styles, data fonts, self/blob workers, no base URL override or form submission. It permits images from self/data/blob/**HTTPS**, media from self/blob/HTTPS, and connections to self, the jsDelivr optional-resource host and Cloudflare's R2 storage host (`*.r2.cloudflarestorage.com`, for the person's own bucket); the Cloudflare dashboard and API origins join `connect-src` only in a build whose hosted sign-in is registered. The hosted header adds `frame-ancestors https: http://localhost:* http://127.0.0.1:*`; the native policy uses `frame-ancestors 'none'`. A meta policy does not enforce frame-ancestors. The handshake parser also admits IPv6 loopback, but the hosted header does **not** currently list it: do not promise that localhost IPv6 framing works under that header.

**`img-src https:`**: pictures from any HTTPS site show everywhere, in the page and in the exported page alike, behind the editor's own allow. A remote picture shows its description and origin until the person loads remote content for that document, and the exported page keeps its no-referrer policy. The CSP therefore does not guarantee that no remote picture loads; the person's allow does. The embed contract adds no editor fetch or remote resource.

The parent must allow the editor origin through its own `frame-src` and not impose incompatible frame or sandbox restrictions. For a sandboxed cross-origin integration, scripts must run and the editor must retain a non-opaque origin for this handshake (`allow-scripts` and `allow-same-origin` are the relevant sandbox permissions); this is not a safe same-origin sandbox recipe. Additional clipboard and download privileges are separate host decisions. `tools` is a separate browser Permissions Policy feature for WebMCP, not a synonym for granting `agent`. It defaults to the top-level origin alone, so a cross-origin host that wants the editor's WebMCP tools must delegate it to the frame (`allow="tools"`), and the browser checks it again at every call. Without it the door registers nothing and `status().failures` names each tool's refusal; the door's own re-check at execution (connection, admission, the registering document) stands regardless. The tools belong to the document that registered them: the door registers on `document.modelContext`, never on `window`, keeps no catalog outside that document, and retires every registration when the registering context changes. WebMCP's lifecycle events (`toolactivated`, `toolcancel` on `document.modelContext`) name a tool, not an invocation; Rapier keys its receipts and reviews by its own invocation identities and does not use them.

MCP Apps receives worker `_meta.ui.csp` instead, including the configured download domains and resource origin, and asks its host for clipboard-write permission. Its resource carries a sensitive editor key, is private/TTL-zero, and belongs to the Apps host's trust model. The `rapier-html` wrapper inserts carried data into the supplied page; it does not set an HTTP CSP, accept parent origins, fetch a return address, or authorize generic iframe commands.

## 5. What is checked, and what is not

Rapier's release run executes the shipped origin, connection, envelope, dispatch, outgoing-message and agent-admission functions against hostile origins, sources, grants, envelopes and payloads. It drives the built page over a real MessageChannel from hosts that frame `?embed=1` alone and connect at the frame's `load` event, one of them on another origin, and runs the `rapier-embed` helper against a stand-in frame. Not proved: browser CSP enforcement, sandbox attributes, UI copy/download recovery after a refused Save, and any real host's durability.
