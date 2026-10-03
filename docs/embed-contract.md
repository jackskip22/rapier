# The Rapier embed contract

Enforced at the iframe message boundary in `editor/engine.js`; agent admission is in `agent/browser.js`. MCP Apps (`agent/apps.js`) and the carried-page wrapper (`rapier-html`) have separate contracts. For a runnable host, see the README, "In your own app". The MIT host helper is `rapier-embed` (one module at `packages/rapier-embed/embed.mjs`, its README derived from `skills/embed-rapier/SKILL.md`). It provides `Rapier.mount` and the form-associated `<rapier-editor>` on this same wire.

## 1. Two origins, one parent, one channel

The parent frames a served page with `?embed=1`: no origin is declared in the URL or in the handshake. The published document profile is `https://rapier.website/embed/rapier-document.html`, with permanent copies at `https://rapier.website/embed/<version>/rapier-document.html`; a self-hosted copy speaks the same protocol. The frame binds to the origin of the first valid `rapier-connect` from its parent and holds it for the session; a later connect from any other origin is ignored.

That origin must be HTTPS, or HTTP only for `localhost`, `127.0.0.1` and `[::1]` development. A port is part of an origin. `null` and opaque origins are refused. This admits a window, not a person.

Rapier listens before boot: a host may post `rapier-connect` at the frame’s `load` event; the first valid connect waits until the frame is ready. Rapier repeats `rapier-ready` to its parent at increasing intervals until a host connects. It carries nothing: before a connect it is posted to the parent whatever its origin (`*`), and after one to the bound origin. The host verifies both `event.source === frame.contentWindow` **and** `event.origin === editorOrigin` for anything it receives on the window, and targets its connect at the exact editor origin with one MessagePort transferred. Rapier independently verifies **actual `event.source === window.parent`** and the origin rule above; matching strings inside `data` alone are never sufficient. There is no connection timeout: the person is told the host has not connected only when they do something that needs it (Close before a host has connected).

A **same site** frame needs no parameter or protocol and boots as a top-level editor with its own storage. A frame from **another site** without `embed=1` is refused. A carried page is the person's file wherever it is framed, and boots as a top page.

The handshake accepts only `type`, `sessionId`, `documentId`, `capabilities` and an optional `theme` (`light`, `dark` or `system`); anything else, including `expectedOrigin`, refuses the connection. Both IDs are nonempty strings of at most 256 UTF-16 code units. The grant is frozen after admission. A reconnect may replace transport, not change permissions; grant ordering is immaterial. After load it must retain both IDs. An in-flight save, close or load also blocks replacing the port. Reload to declare different authority, and preserve unsaved work before doing so.

The transferred MessagePort is unforgeable, **not secret after the host forwards it**. The port and its generation are pinned; old-port callbacks refuse after replacement. The host must not forward it to untrusted code; the port carries only the admitted session and document. Scripts on the same host origin are one trust principal, not separate identities.

## 2. Capabilities: no implied permission

A missing list means `[]`. Unknown names, duplicates, non-array values and non-string entries refuse the entire connection. The `connected` reply echoes the canonical grant; connecting alone grants nothing.

| Capability | What the parent explicitly authorizes | What it does not implicitly grant |
|---|---|---|
| `open` | `load` host-supplied source, name, revision and read-only flag through existing load guards | Readback, notifications, agent tools, comparison, close |
| `read` | Request Save/readback and receive `save-request` containing the embedded document; send matching save acknowledgement/refusal | Load, change subscription, agent tools, close |
| `changes` | Receive deduplicated `document-state` metadata: loaded/dirty/saving/closing/readOnly, filename, docKind (plus envelope IDs/revision) | Document source or edit authority; this is not a per-keystroke delta feed |
| `compare` | Submit another complete text to the existing comparison UI | Automatic acceptance or text export; human interaction can still apply changes |
| `close` | Request close, receive close requests/readiness, and send save/discard/cancel decisions under existing pending-close and mutation guards | Readback; `decision: save` also needs `read`. **Discard is consequential host authority.** |
| `agent` | Enable the existing broad core agent door/WebMCP exposure and receive source-free `agent-review` events naming its Will decision record, subject to boot, connection, load and kernel policy | Extra tools or an absent Notes provider. Requires explicit **both `open` and `read`**; it is not read-only agent access |

With `close` granted, the frame's Close control sends `close-request`, the host decides, and the frame answers `close-ready` for that request.

`agent` opens all 16 existing core tools, including edits, comparison decisions, drawing and Notes reads when a Notes provider is available. There is no generic `invoke` postMessage method. Cross-origin parent WebMCP discovery still needs browser support and Permissions Policy, and uses exact `exposedTo`. It adds no network call, shell, arbitrary JavaScript, OAuth, clipboard, file-picker or storage-access tool. Without `agent`, known-tool calls at the hosted embed’s published invoke boundary refuse (`embed_agent_not_granted`), as well as being hidden from browser discovery.

Permissions are checked on **incoming commands and outgoing disclosure**. UI Save, retry, state updates and close fallback cannot expand the grant. Without `read`, host Save refuses without sending source and tells the person to copy or download; that host is not a durable save destination. Without `close`, pressing the frame’s Close control explains the missing grant (save to the host first if `read` was granted, otherwise copy or download); the control and document stay open. No `close-request`, `close-ready` or other message reaches the port or window, even through close-anyway fallback. Refusal leaves save and close state unchanged, including an in-flight save; the host page must offer its own exit.

This boundary serves cooperative **cross-origin** integration. A same-origin parent already has DOM and JavaScript access regardless of postMessage grants; use a dedicated editor origin for isolation. Neither CSP nor this list distinguishes a trusted host script from an XSS script on the same origin. A malicious host can remove its iframe or lie about persistence; Rapier cannot force it to keep the work.

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

Every payload field above is present; there are no additional fields. `id` is the kernel-minted review identifier (`review_` followed by 32 lowercase hexadecimal digits). `kind` is `proposal`, `inline` or `check`; `status` is `pending`, `approved`, `declined` or `invalidated`; `cause` is `will`, `ask`, `check` or `proposal`. `revision` is the kernel's nonnegative safe-integer document revision, separate from the host's durable `baseRevision`. `law` is `keep`, `append`, `edit` or `null`; `region` is its zero-based nonnegative safe-integer region index, or `null` when no region is named. Each `changes` entry has only its review-derived `id` and a `status` of `pending`, `applied`, `dropped` or `stale`; a check may have an empty array.

`decision` is `null` until the kernel records a completed decision. Then it contains exactly `{action, outcome, revision}`: `action` is `approve` or `decline`, `outcome` is `ok`, `applied`, `rebased` or `unchanged`, and `revision` is a nonnegative safe integer. Applying or dropping part of a proposal updates `changes` while the review remains `pending` and `decision` remains `null`; the last decision closes the same `id`. An invalidated review reports `status: 'invalidated'` without inventing a human decision. An immediate agent edit that needed no review produces no review event.

The event carries no source, inserted or removed text, excerpt, position, label, intent, reason, caller name or vault key. Only the allowed identifiers, enums and numbers are projected from the kernel's source-rich record. Unchanged metadata and revision-only rebases are deduplicated; this is not a live text or per-keystroke feed. Replacing a port may replay the current record on the new connection; retired ports and another document's records receive nothing. Events are session notifications, not a durable audit log.

For example, a host mounts with `agent: true` and subscribes with `editor.on('agent-review', review => { /* record review.id and its decision metadata */ })`. Its agent uses the existing door's `document.read_context` and `document.propose_edits` tools for a passage marked `keep`. The host hears a pending review with `cause: 'will'` and `law: 'keep'`; the person's approval or refusal updates that same record. The Markdown leaves through the existing Save exchange, never through this event. The helper README contains the runnable mount and save example.

## 4. CSP: what exists

`security/csp.mjs` owns the policy checked by the build. The web shell's meta has default-src none, inline/wasm/blob scripts, inline styles, data fonts, self/blob workers, no base URL override or form submission. It permits images from self/data/blob/**HTTPS**, media from self/blob/HTTPS, and connections to self, the jsDelivr optional-resource host, Cloudflare's R2 storage host (`*.r2.cloudflarestorage.com`, for the person's own bucket), and `https://mcp.rapier.website` for a carried page's explicit Send back; the Cloudflare dashboard and API origins join `connect-src` only in a build whose hosted sign-in is registered. The hosted header adds `frame-ancestors https: http://localhost:* http://127.0.0.1:*`; the native policy uses `frame-ancestors 'none'`. A meta policy does not enforce frame-ancestors. The handshake parser also admits IPv6 loopback, but the hosted header does **not** currently list it: do not promise that localhost IPv6 framing works under that header.

**`img-src https:`**: pictures from any HTTPS site show everywhere, in the page and in the exported page alike, behind the editor's own allow. A remote picture shows its description and origin until the person loads remote content for that document, and the exported page keeps its no-referrer policy. The person’s allow, not CSP, gates remote pictures. The embed contract adds no editor fetch or remote resource.

The parent must allow the editor origin in `frame-src` and keep frame and sandbox restrictions compatible. A cross-origin sandbox needs scripts and a non-opaque editor origin (`allow-scripts` and `allow-same-origin`); this is not safe for a same-origin sandbox. Additional clipboard and download privileges are separate host decisions. `tools` is a separate browser Permissions Policy feature for WebMCP, not a synonym for granting `agent`. It defaults to the top-level origin alone, so a cross-origin host that wants the editor's WebMCP tools must delegate it to the frame (`allow="tools"`), and the browser checks it again at every call. Without it the door registers nothing and `status().failures` names each tool's refusal; the door's own re-check at execution (connection, admission, the registering document) stands regardless. The tools belong to the document that registered them: the door registers on `document.modelContext`, never on `window`, keeps no catalog outside that document, and retires every registration when the registering context changes. WebMCP's lifecycle events (`toolactivated`, `toolcancel` on `document.modelContext`) name a tool, not an invocation; Rapier keys its receipts and reviews by its own invocation identities and does not use them.

MCP Apps receives worker `_meta.ui.csp` instead, including the configured download domains and resource origin, and asks its host for clipboard-write permission. Its resource carries a sensitive editor key, is private/TTL-zero, and belongs to the Apps host's trust model. The `rapier-html` wrapper inserts carried data into the supplied page; it does not set an HTTP CSP, accept parent origins, fetch a return address, or authorize generic iframe commands.

## 5. What is checked, and what is not

The retained `agent-door-admission` row checks agent admission and the `agent-review` metadata allowlist against the real kernel and extracted door/message functions: the grant, current document and port, partial decisions and source exclusion. Its built iframe cell uses a real MessageChannel host that connects at `load`, then exercises the existing agent and human review adapters and compares the resulting source byte for byte. That cell is same-origin and does not exercise native WebMCP discovery. The helper's retained cells cover its transport and form value. The former `security-embed-scope` row is retired; it is not a current origin/envelope/CSP receipt. Not proved here: browser CSP enforcement, sandbox attributes, UI copy/download recovery after a refused Save, and any real host's durability.
