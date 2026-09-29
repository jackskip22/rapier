# The Rapier embed contract

Enforced at the generic iframe message boundary in `editor/engine.js`; agent admission is in
`agent/browser.js`. This contract does not replace MCP Apps (`agent/apps.js`) or the carried-page
byte wrapper (the `rapier-html` package). A runnable host is in the README, "In your own app"; the host helper that speaks this contract for an app is the `rapier-embed` package (MIT, its source `skills/embed-rapier/`), and the skill a coding agent reads is `skills/embed-rapier/SKILL.md`.

**A compatibility break, on purpose.** A host written before this contract, which connects without
a `capabilities` list, still connects -- and may do nothing: no load, no readback, no change events,
no compare, no close, no agent. It must declare the operations it uses. Extra envelope or payload
fields, a missing `requestId`, and a save acknowledgement that does not echo the save-request's own
id and base revision are refused rather than ignored. There is no compatibility default that
reopens the document to a host that did not ask for it.

## 1. Two origins, one parent, one channel

The parent frames an already-served page at `rapier.html?embed=1`, and nothing more: no origin is
declared in the URL or in the handshake. The browser already authenticates `event.origin`, and the
frame already requires the message to come from its own parent window; a parameter naming the
parent would refuse only honest hosts that get a slash or a port wrong, since a hostile site simply
supplies its own. The frame binds to the origin of the first valid `rapier-connect` from its parent
and holds it for the session: a later connect from any other origin is ignored.

That origin must be HTTPS, or HTTP only for `localhost`, `127.0.0.1` and `[::1]` development. A
port is part of an origin. `null` and opaque origins are refused. This is a claim about which window
may talk to the frame, not authentication of a human.

Rapier listens for the connect from its first moment, before the editor has booted, so a host may
post `rapier-connect` as soon as the frame's `load` event fires. The first valid connect is held
until the frame is ready and then taken. Rapier also announces `rapier-ready` to its parent until a
host connects, further apart each time and without giving up; it carries nothing, so before a
connect it is posted to the parent whatever its origin (`*`), and after one to the bound origin.
The host verifies both `event.source === frame.contentWindow` **and** `event.origin === editorOrigin`
for anything it receives on the window, and targets its connect at the exact editor origin with one
MessagePort transferred. Rapier independently verifies **actual `event.source === window.parent`**
and the origin rule above; matching strings inside `data` alone are never sufficient. A sibling
window cannot connect by claiming anything. There is no connection timeout: the person is told the
host has not connected only when they do something that needs it (Close before a host has connected).

A frame from the **same site** as its parent needs no parameter at all and boots as the editor does
at the top, with its own storage and no protocol to implement: a same-origin parent can script the
frame entirely, so a parameter it must know would be ceremony, not protection. A frame from
**another site** without `embed=1` is refused, because the person's work would otherwise land in
storage partitioned under someone else's site, where they could never find it again.

The handshake accepts only `type`, `sessionId`, `documentId`, `capabilities` and an optional
`theme` (`light`, `dark` or `system`; anything else refuses the connection).
Both IDs are nonempty strings of at most 256 UTF-16 code units. The grant is frozen after admission.
A reconnect may replace transport, not change permissions; grant ordering is immaterial. After
load it must retain both IDs. An in-flight save, close, or load also blocks replacing the port.
Reload to declare different authority; preserve unsaved work before doing so.

The transferred MessagePort is an unforgeable browser transport reference, **not a secret after
the host forwards it elsewhere**. Subsequent messages have no origin to authenticate again, so
the port and its generation are pinned; old-port callbacks refuse after replacement. The host
must not forward the port to untrusted code. Scripts on the same host origin are one trust
principal, not separate identities.

## 2. Capabilities: no implied permission

A missing list means `[]`. Unknown names, duplicates, non-array values and non-string entries
refuse the entire connection. The `connected` reply echoes the accepted canonical list; merely
connecting grants no readback, editing, or change events.

| Capability | What the parent explicitly authorizes | What it does not implicitly grant |
|---|---|---|
| `open` | `load` host-supplied source, name, revision and read-only flag through existing load guards | Readback, notifications, agent tools, comparison, close |
| `read` | Request Save/readback and receive `save-request` containing the embedded document; send matching save acknowledgement/refusal | Load, change subscription, agent tools, close |
| `changes` | Receive deduplicated `document-state` metadata: loaded/dirty/saving/closing/readOnly, filename, docKind (plus envelope IDs/revision) | Document source or edit authority; this is not a per-keystroke delta feed |
| `compare` | Submit another complete text to the existing comparison UI | Automatic acceptance or text export; human interaction can still apply changes |
| `close` | Request close, receive close requests/readiness, and send save/discard/cancel decisions under existing pending-close and mutation guards | Readback; `decision: save` also needs `read`. **Discard is consequential host authority.** |
| `agent` | Enable the existing broad core agent door/WebMCP exposure, subject to boot, connection, load and kernel policy | Extra tools or an absent Notes provider. Requires explicit **both `open` and `read`**; it is not read-only agent access |

`agent` is intentionally broad: all 16 existing core tools, including edits, comparison decisions,
drawing and Notes reads when a Notes provider is actually available. It is not a new generic
`invoke` postMessage method; the generic message vocabulary remains fixed. Cross-origin parent
WebMCP discovery still needs browser support and Permissions Policy, and uses exact `exposedTo`.
No new network call, shell, arbitrary JavaScript, OAuth, clipboard, file-picker or storage-access
tool has been added. Declining `agent` also refuses known-tool calls at the published invoke
boundary in a hosted embed (`embed_agent_not_granted`); it is not merely hidden from browser discovery.

Permissions are checked on **incoming commands and outgoing disclosure**. A UI Save, retry,
state update or close fallback cannot silently grant the host more than the handshake gave it.
Without `read`, host Save is refused rather than sending the person's words, and the person is
told to copy or download their work instead; a host denied readback is not a durable save
destination. Without `close`, the frame's Close control stays on its chrome, and pressing it tells
the person that this host was not granted close requests (save to the host first where `read` was
granted, otherwise copy or download) while the document stays open. The host receives nothing: no
`close-request` or `close-ready` on the port, nothing on the window, and the close-anyway fallback
posts nothing either. The refusal moves no save or close state, so a save in flight completes as
it would have; leaving the frame is then the host page's own control to offer.

This is a boundary for cooperative **cross-origin** integration. A same-origin parent already
has DOM/JavaScript access regardless of postMessage grants. Use a dedicated editor origin for
isolation. Neither CSP nor this list distinguishes a trusted host script from an XSS script on
the same origin. A malicious host can remove its iframe at any time or lie about persistence;
Rapier cannot force the embedding website to keep the person's work.

## 3. The command envelope and refusal rules

Each host-to-editor port message is a plain structured-clone record with exactly:

| Field | Rule |
|---|---|
| `type` | Nonempty string, at most 64 code units, one of the command names below |
| `sessionId`, `documentId` | Exact admitted IDs |
| `requestId` | Required nonempty string, at most 256 code units |
| `payload` | Optional plain record; arrays, Date, null and scalars refuse |
| `baseRevision` | Optional null or revision; a revision is a nonnegative safe integer or nonempty string up to 256 code units |

Extra envelope/payload fields refuse. An invalid envelope, wrong identity or stale port gets
no reply and no dispatched effect. A recognized envelope with an unknown command gets
`protocol-error`; a denied command gets `code: capability_denied` plus the required capability;
a malformed allowed payload gets `code: invalid_payload` and a reason. These are embed protocol
messages, **not JSON-RPC**. Existing deeper load/save/close refusals retain their own nack/reason.

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

Filename bound is 255 code units, title 240, code 64, reason 500. The wire content
pre-gate is the document limit (25 MiB) counted in code units; the existing codec/transaction owner
applies the actual UTF-8 admission limit. Requests larger than the browser can clone may fail
before Rapier; a script cannot prevent that allocation by checking its handler after delivery.

Editor-originated messages use the same identity/revision envelope but unsolicited replies may
have `requestId: null`. Do not require host-to-editor request-ID rules on unsolicited state.
`connected`, load/compare replies, and protocol errors are control replies; the protected source
and metadata channels are checked separately. No `fetch`, `evaluate`, `readStorage`, `exportAll`
or arbitrary agent-call command exists; unknown commands do not dispatch.

### A save is a two-party acknowledgement

`save` asks Rapier to capture. The resulting `save-request` has its **own** ID and a base revision.
The host must durably store that captured payload against that revision, then echo both fields
in `save-ack` with an advanced durable revision. A successful send, an in-memory assignment,
a new request ID or a promise to save later is not an acknowledgement. On storage conflict,
send `save-nack` with `code: conflict` and the current revision. On failure, keep the work
recoverable and report it; do not label it saved. When a save is acknowledged the frame tells the
person where it went by the host's origin as the browser authenticated it on connect (its host and
port, "saved to docs.example.com"), the one thing about the host the host cannot fake; a host does
not name itself in the frame's words, and `load` takes no such field.

**A late save is not a lost one.** Rapier waits for the answer as long as the connection lives.
After fifteen seconds without one it tells the person the host has not confirmed the save yet
(Copy and Download stay open to them) and keeps the save pending: a `save-ack` that arrives later
is accepted, later saves wait behind it, and the person's Retry resends the same save-request with
the same `requestId` and base revision. Only a `save-nack`, a `disconnect` or a lost port ends it.
After a `save-nack`, Retry sends a new save-request with a new id; after a lost connection, the
same save-request is sent again on the next connection. An agent's `document.save` receipt says
`unacknowledged` at the fifteen seconds, since that is what is true then.

**A host stores a repeated `requestId` once and answers it the same way each time.** The same
save-request can reach a host more than once (a Retry, a reconnect). The host recognises the id,
does not write the payload again, and sends the answer it sent the first time: the same `save-ack`
revision, or the same `save-nack`. A host that takes the repeat for a new write answers the
person's own Retry with a conflict against themselves.

### The host's theme

A frame on a host's site keeps its storage partitioned under that site, so it cannot see the theme
the person keeps on Rapier's own site and would otherwise follow the device: a dark host on a light
device would get a white editor. The host says its theme on connect (`theme` in `rapier-connect`)
and changes it live with a `theme` message on the port. The frame paints it and stores nothing; a
theme the person picks in the frame's own settings takes over from it until the host sends another.

## 4. CSP: what exists

`security/csp.mjs` owns the policy checked by the build. The web shell's meta has default-src
none, inline/wasm/blob scripts, inline styles, data fonts, self/blob workers, no base URL override
or form submission. It permits images from self/data/blob/**HTTPS**, media from self/blob/HTTPS,
and connections to self, the jsDelivr optional-resource host and Cloudflare's R2 storage host
(`*.r2.cloudflarestorage.com`, for the person's own bucket); the Cloudflare dashboard and API origins
join `connect-src` only in a build whose hosted sign-in is registered. The hosted header
adds `frame-ancestors https: http://localhost:* http://127.0.0.1:*`; the native policy uses
`frame-ancestors 'none'`. A meta policy does not enforce frame-ancestors. The handshake parser
also admits IPv6 loopback, but the hosted header does **not** currently list it: do not promise
that localhost IPv6 framing works under that header.

**`img-src https:` is the founder's ruling** (26 September 2026): pictures from any HTTPS site show
everywhere, in the page and in the exported page alike, behind the editor's own allow -- a remote
picture shows its description and origin until the person loads remote content for that document --
and the exported page keeps its no-referrer policy. The CSP therefore does not guarantee that no
remote picture loads; the person's allow does. Media/CDN allowances likewise pre-exist. The embed
contract adds no editor fetch or remote resource.

The parent must allow the editor origin through its own `frame-src` and not impose incompatible
frame/sandbox restrictions. For a sandboxed cross-origin integration, scripts must run and the
editor must retain a non-opaque origin for this handshake (`allow-scripts` and `allow-same-origin`
are the relevant sandbox permissions); this is not a safe same-origin sandbox recipe. Additional
clipboard/download privileges are separate host decisions. `tools` is a separate browser
Permissions Policy feature for WebMCP, not a synonym for granting `agent`; it defaults to the top-level
origin alone, so a cross-origin host that wants the editor's WebMCP tools must delegate it to the frame
(`allow="tools"`), and the browser checks it again at every call. Without it the door registers nothing and
`status().failures` names each tool's refusal; the door's own re-check at execution (connection, admission,
the registering document) stands regardless. The tools belong to the document that registered them (WebMCP's
active-document law, as the specification states it from 26 September 2026): the door registers on
`document.modelContext`, never on `window`, keeps no catalog outside that document, and retires every registration
when the registering context changes, so a navigated, restored or replaced document never answers for another.
WebMCP's lifecycle events (`toolactivated`, `toolcancel` on `document.modelContext`) name a tool, not an invocation:
Rapier's receipts and reviews stay keyed by its own invocation identities, and the door does not need the events,
because every change an agent makes already lands visibly in the person's editor.

MCP Apps receives worker `_meta.ui.csp` instead, including the configured download domains and
resource origin, and asks its host for clipboard-write permission. Its resource carries a
sensitive editor key, is private/TTL-zero, and belongs to the Apps host's trust model. The
`rapier-html` wrapper inserts carried data into the supplied page; it does not set an HTTP CSP,
accept parent origins, fetch a return address, or authorize generic iframe commands.

## 5. What is checked, and what is not

Rapier's own release run holds this contract in two halves. The first executes the shipped origin,
connection, envelope, dispatch, outgoing-message and agent-admission functions, selected from the
source: hostile origins and sources, malformed grants, envelopes and payloads, default deny,
independent capabilities, grants frozen across reconnects, stale ports, outgoing leakage and the
agent bypass; the Close control's own press, words and dismissal without the grant (the missing
grant named, nothing posted, the failure path never taken, a save in flight and a pending reconnect
retry untouched); and a late save (still pending after the fifteen seconds, said as not confirmed
yet, its acknowledgement accepted when it comes, Retry resending the same `requestId`, a new id
after a `save-nack`, the same record after a disconnect), a failed close retried as a close, and
the Save refusal without `read` offering nothing that cannot act; a handshake that names no origin
admitted and the frame bound to the connecting origin (a later connect from another refused, a
handshake still carrying `expectedOrigin` refused), a connect before the frame is ready held and
then taken, `rapier-ready` announced further apart without end, the host's theme on connect and
live (an unknown theme refused), the saved line naming the host's own origin (a `load` naming
the host refused), and the frame classifier (a
host's frame on `embed=1`, a same-site frame the editor with no parameter, a cross-site frame
without it refused, a carried page the person's file wherever it is framed). Load, codec and durable-save effects there are doubles; it proves what the
boundary dispatches and the refusal's own state, not the rendered UI. The second half proves the
declared grant on the built page over a real MessageChannel, from hosts that frame `?embed=1` alone
and connect at the frame's `load` event with no origin declared, one of them on another origin: the
frame echoes exactly the grant,
refuses an undeclared command by name, accepts only the acknowledgement that echoes the
save-request's id and base revision, and leaves the root origin's storage byte-identical. It then
presses the frame's Close control with a finger twice, a minimal pair: in a frame granted `open` and
`read` only, the refusal names the missing grant, the document stays open and no close message
reaches the host on the port or the window; in the same frame with `close` granted the same press
sends `close-request`, the host decides, and the frame answers `close-ready` for that request. The
cross-origin host loads its document and receives it back on save, the frame wears the theme its
host connected with and the one a live `theme` message sets, and a same-site frame with no
parameter boots as the editor. A
third check runs a host example against the same boundary and the WebMCP registration against the
agent grant, and each protection is broken in a throwaway copy to show its check go red. The host helper
(`rapier-embed`) is run against a stand-in frame over a real MessageChannel: a `rapier-ready` from another window,
or from the frame's window at another origin, connects nothing, a `close-ready` forged on the window by either is
not heard, the connect goes to the editor's exact origin with one port, and on the port only the admitted session
and document are heard (another pair's `connected` and `save-request` are dropped); a repeated `requestId` is
answered the same way without a second write, a stale base is a conflict. Not proved:
browser CSP enforcement, sandbox attributes, UI copy/download recovery after a refused Save, and
any real host's durability.
