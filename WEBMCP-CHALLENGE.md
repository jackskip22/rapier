# Rapier — WebMCP Challenge submission record

This file exists to make one thing unambiguous: **which part of Rapier is challenge work.**

The Challenge application artifact is **`rapier.html`**. The historical comparator
below is therefore the pre-WebMCP `rapier.html`, not a private development ZIP.
Native hosts, qualification tooling, and working-tree archives are supporting
provenance or evidence only; they are not the application being submitted.

Rapier is a single-file offline Markdown, text and code editor. It predates the
challenge and had not been publicly released when WebMCP work began; this
repository is the planned first public source release. An editor of this size
plainly did not appear in ten days, and the challenge rules ask entrants to
distinguish a pre-existing project from the work added during the submission
period. So this is that distinction, stated plainly rather than left for a judge
to guess at.

## The baseline

The public "before" artifact is one file: the exact `rapier.html` retained from
2026-08-24, before the challenge submission period began and before any WebMCP work.
It is published as immutable history in the public repository and is the artifact
judges should compare with the submitted `rapier.html`.

| | |
|---|---|
| Artifact | `rapier.html` — pre-WebMCP baseline, Rapier 1.0.0 |
| Where | GitHub tag `pre-webmcp-baseline`, commit `7fdbadc` (release "Pre-WebMCP baseline — 2026-08-24") |
| SHA-256 | `18c227345cfdf6edcba0ccbdc7abb6068d35b46f456ea2309b9bd0aaa48a3a83` |
| Size | 2,392,317 bytes |
| WebMCP code | **none** — zero `modelContext`, `registerTool`, `WebMCP`, or `RAPIER_WEBMCP` occurrences |
| Existing agent integration | the Speedracer `speedracer.app/v1` operation contract and host route — **pre-existing, not challenge work** |

The tag and the release were created on 2026-09-03 for provenance and direct comparison;
they are not represented as having been committed on 2026-08-24. Only that `rapier.html`
is asserted as the historical comparator — not the other files of any earlier commit, and
not the private development archive it was retained from, which is not published and is
not needed for judging. Compare by SHA-256, never by version string.

The whole challenge delta is one diff — `compare/pre-webmcp-baseline...main` — and the
evidentiary story is:

**before: `rapier.html` without WebMCP → after: submitted `rapier.html` with WebMCP.**

The submitted file's identity is the `rapierHtmlSha256` in `qualification/RECEIPT.json`
and the evidence sentence at the top of `README.md`; the submission commit is the one
that carries this document at `main`.

The baseline HTML already contains the editor itself: the block model, Markdown
engine, transaction and undo system, Compare surface, and recovery logic. None of those
pre-existing capabilities is offered as challenge work.

The baseline does contain the existing Speedracer operation vocabulary and agent route.
That is intentional and makes the boundary explicit rather than pretending all agent-facing
semantics were created for the challenge.

## What was built during the submission period

The challenge work is one coherent thing — **continuity for a human and a browser
agent sharing one live document, without inflating the agent's authority**. A
bounded read may become disposable authority over only the disclosed bytes. A
lost race becomes exact evidence, not silent merge. Held intent becomes visible
human review. A borrowed viewport has a proven route home. Where Rapier cannot
prove that next step, it refuses rather than inventing one.

Rapier does not interrupt ordinary work with permission prompts. On an ordinary
document it asks the person nothing: an agent reads, writes, restructures, and
undoes at full speed, every mutation attributable and reversible, the foreground
hand winning races mechanically rather than by dialogue. Confirmation prompts
alone are a poor substitute for architectural boundaries, and a person made to
approve each edit is supervising execution instead of outcomes. **Autonomy inside. Authority at the edge. Recovery
everywhere.** The edge is not a tool call — it is the few bytes whose exactness
must outlive supervision: the quote, the log, the words the person dictated and
will never reread, in a document that will travel beyond any undo history the
moment it is exported or published. Those bytes are named by the document's own
will — the person's word, carried invisibly in the file in their own words,
proposed by their agent and landed by their hand — and everything the will does
not name stays fast. Undo
protects the watched document; law protects the unwatched one. The parts are:

**The agent surface.** A transport-independent operation kernel (`RAPIER_OPERATIONS`,
nineteen operations) with two projections over it: the existing Speedracer host
route, and a WebMCP projection that registers tools via
`document.modelContext.registerTool`. The Speedracer projection derives its
registered set from its own application manifest, so its registration cannot
silently exceed that contract; WebMCP registers an instrument-sensitive subset
of a separately handwritten set of seventeen descriptors — three of them naming
a narrower or differently shaped input than the operation they call, pinned by
name rather than mechanically unified. Seventeen WebMCP descriptors map into
the existing nineteen-operation kernel: each door enforces the declaration it
publishes, and both reach the same operation owners rather than a second
editing implementation. The will governs mutations entering through that
kernel; it is not a sandbox for an agent that also has general pointer control
over the person's UI.

**Bounded disclosure.** `document.get_outline` returns a coarse whole-document
frontier whose expandable branches reach every deeper heading. `document.read_context`
walks a section in anchored pages; every page carries a capability over exactly that
page and a name for the next undisclosed seam. `document.find` returns bounded
snippets. There is no bulk-body tool. On the bundled 6,494-byte demo, all 15
parser-recognised headings outside fences are reachable without disclosing a body;
repeated reads can deliberately disclose additional exact pages over time.

**The person's chain.** The document's chain is `edit → append → keep`, carried in the
file; the person's is `FREE → CHECK → ASK`, held on the device for this document in this
tab and never written into the file. One row of three words and one `i`, zero preferences.
CHECK stops the next agent write at the door the writes already pass, only while the
delivery ledger says a changed block has not yet held the person's view — every pixel of it
inside their viewport, each part for a continuous second. The count never means reviewed,
and no timer approves; the block is delivered by their own scroll holding all of it, their
own hand in it, or their own `ALLOW THIS ONCE`, and an agent may wait for exactly that
(`document.wait_for_user`, event `delivery`). ASK widens the trigger of the hold that
already exists for kept law: one exact proposal in Compare, one decision, never a batch.
`document.get_context` carries `posture` beside `law`, one word each. A host that confirms
every call the same way learns nothing from a tool's annotations; here the decision is
taken per write, by the document's law and the person's posture, on the page.

**One language on the wire.** Every door speaks the words `WILL-1.md` defines: `applied`,
`refused` (the document's law, the person's decision, or this host's own state — `reason`
says which), `invalid` (the request could not be read; no law was consulted), and this
host's own two, `conflict` and `target_gone`, named once beside them. A refusal carries the
Will's closed `rule`, the `region`, the person's `review` word, and a document's faults as
WILL-1's ordered located list. The live write door is judged by the standard's own vector
corpus: thirty-two of its forty-nine `evaluate` vectors can be posed to it — thirty-one agree on
outcome and rule and one divergence is named and pinned by id; the seventeen it cannot pose are
named by id and reason.

**Any admitted length, up to 25 MiB.** A document past the projection's limits opens as source
in one line and is still an instrument: its heading outline is scanned in the parse Worker over
the raw text — never the page's own thread (zero long tasks measured on a 20 MiB file) — so
`document.get_outline`, section references, `document.read_context` of a section and
`document.find`'s per-match section all work on every admitted document, bounded by the same
limits the structural engine already uses and disclosed as `total`, `omitted`, `truncated`.
Internal undo, likewise, never evicts delivered agent authority: a retraction mints its
records call-locally and the 64-row handle pool is untouched at every instant.

**What you are pointing at.** `document.get_context` reports a `focus`: the passage the person's cursor
is resting in, named by kind and section with a bounded opening excerpt and a
reference that `read_context` will spend for a bounded page of it. That is how an agent
answers *"tighten this paragraph"* without asking the person to select it first. The
reference is a name and not a capability — it mints nothing, authorises nothing, and
stops resolving once the passage is no longer the one it named.

**Document law (Will).** A document can carry its person's will: invisible
marker pairs declaring which regions an agent may edit, may only append to, or
must keep, each able to carry the person's own words as intent — written from
the authoring path, read by every model, enforced as capability law rather
than a prompt an agent could talk itself out of. A will only narrows what an
ungoverned document already allows, never widens it, and it is never within
its own grant: a working path never writes the will. Text inside
the document asking the agent to rewrite the kept `Statement` or
replace an existing `Notes` line can ask. It cannot widen the operation
kernel's authority. This is document-law enforcement, not a general claim that
Rapier detects or neutralises prompt injection. See `WILL-1.md` and
`VECTORS.md`.

**Intention is not authority.** A fully disclosed held passage still receives a
bounded handle, because the handle proves what the agent inspected; the document's
law remains the commit gate. In 1.0.0, one held edit can therefore become a visible
proposal in the person-facing foreground Compare while the original invocation remains pending.
`KEEP HELD`, closing Compare, timeout, an unchanged diff, or failed
revalidation refuses that invocation. A host-supplied cancellation signal, where
one exists, is a separate `caller_aborted` outcome; Rapier does not promise that
WebMCP exposes one. `ALLOW THIS ONCE` revalidates the same
document authority, revision, handle, target bytes and interval, foreground
non-overlap, and law, then lets the original call continue through rule 6. It mints
no grant, retry token, queue, or persistent permission. A multi-edit held
transaction is refused without review. This is how Rapier can say both "the
document refuses" and "the person remains sovereign" without a second mutation
engine.

**One family, one seam.** WebMCP has no structured way to say that a well-formed
call was deliberately refused (webmachinelearning/webmcp issue 282); a tool can only
return text. Rapier's kernel never collapses the cases, and it says them in the words
`WILL-1.md` already defines. Success is an operation's own outcome word (`applied`,
`searched`, `read`, `saved`…). A well-formed call that was declined is `refused` with a
`reason` — the document's Will (`document_law`), admission, or a state the person owns.
A call the door could not read, where no law was consulted, is `invalid` with the exact
path that failed — delivered the same way, never a thrown fault; only an unrecognised
internal error still throws and reaches the agent as a tool fault. The two facts Will/1
does not define are this host's own words, named once beside those three and never a
synonym for one of them: `conflict` when the bytes the hand was shown have moved, and
`target_gone` when the target is no longer there — each carries a `reason` naming the
exact fact, enumerated in [agents.md](agents.md). The manifest declares each
operation's outcome enum. The WebMCP projection lowers every result through one seam
into machine-readable JSON text with `outcome` at the top; a recoverable failure —
`refused`, `invalid`, `conflict`, `target_gone` — also carries a `reason` and marks
the envelope `isError: true`, a conventional failure hint the ecosystem's evaluators
read, not a field the WebMCP draft defines — so an agent learns one place to look; a
refused call mutates nothing and carries its exact reason. If the protocol grows a refusal arm,
Rapier changes that one seam and not its authority model.

**A result budget.** Every tool result passes through one projection seam that shapes
it for a model rather than for a program: identity blocks, revision counters and
integrity digests that no tool accepts as input are dropped, elastic content is
shrunk until the value the user agent serializes — the whole returned envelope, not
the text inside it — fits 1,500 characters. Outline cursors are bound to one ticket
and branch; read cursors are bound to one anchored seam; find cursors
remain plain positions because search continuation carries no document claim. A
read page is attenuated before its handle is minted, so authority never outruns what
was actually shown.

**Evidence-bound editing.** Every agent edit carries a short-lived handle anchored
to content evidence. Unrelated change rebases; the foreground human wins. When one
foreground change can explain one inspected target, Rapier returns `yielded` only
with the complete splice and a successor handle. The agent reconstructs current
bytes and reformulates; it does not reread or blind-retry stale intent. Ambiguous,
structural, oversized, non-human, or batched collisions return an ordinary
conflict with no continuation. This machinery existed in the baseline for the
Speedracer route and was substantially hardened during the challenge — including
a class of *spurious* conflict where the commit gate compared the renderer's
account of a passage against the document's own text.

**Turn-taking.** `document.wait_for_user` hands the agent's turn back to the person
and resumes when their selection or edit settles — a pending WebMCP invocation used
as a yield, not a poll.

**Artifact handoff.** `document.open_text` places agent-authored work into the editor
as an ordinary unsaved document, through the same admission boundary a file open
uses. Nothing is persisted until the person saves.

**Pointing and return.** `document.reveal` scrolls a passage into the person's view
and marks it. Ordinary agent editing never moves the viewport; showing is the one
act where moving it is the requested effect. A reveal that moves the view also
records its origin as content evidence. **Back in document**, Alt-Left, or Android
Back returns there after unrelated edits and fails closed if the place can no
longer be proved.

**Compare as a shared instrument.** While the agent's own comparison is open the
document vocabulary disappears and five `compare.*` verbs take its place, so an
agent inside a diff receives only the verbs that instrument affords. While the
person's own ASK or `keep` review is open instead, nothing publishes at all and
the write stays pending — that surface is theirs, never a shared instrument.
Reading a change is private
cognition and never scrolls; revealing one is deliberate pointing.

**Presence.** A quiet semantic marker anchored to a target Rapier can actually
identify — never a fake cursor, never a model's branding. Its states include
`AGENT YIELDED`, shown when the person takes a passage the agent was holding.

**Lifecycle.** Per-tool registration with active-call refcounting, so retiring a tool
never cancels the invocation returning through it.

**Hosting.** `Origin-Agent-Cluster: ?1`, this document's explicit request for the
origin-keyed agent cluster WebMCP requires — `?0` or a `document.domain` write
disables it, and every call rejects with `SecurityError` on a cluster that isn't
one — an origin-trial seam, and a `?demo=1` entry that opens the pre-authored
document through the ordinary intake path.

**One-file embedding.** A same-origin website can copy `rapier.html` and frame
`?embed=local` to add the complete person-owned editor and browser-agent surface
without adopting an editor SDK, agent SDK, account, backend, or persistence
protocol. The existing host-owned Embed remains a separate authority boundary:
its tools appear only after authenticated load, cross-origin registration is
exposed only to the exact parent, and an agent cannot replace the host's document.
`README.md`, "Use Rapier in your own app," spells out both doors, the host
protocol's message shapes, and a prompt a site's own coding agent can use to
wire an "Open in Rapier" button to them.

**The window.** The challenge's submission period opens **2026-08-25**, and
everything in this section is work added inside it. Rapier predates that date;
§The baseline above names the artifact as it stood before WebMCP work began, and
nothing pre-existing is offered as challenge work. The per-landing account of
what was added — each landing's bytes, its delta against the landing before it,
and its own `growth` sentence naming what those bytes bought — is the size ledger
in `qualification/RECEIPT.json`, which the static release audit re-checks against
the shipped artifact rather than taking on trust.

## Evidence

**Rapier 1.0.0 is a SIZE-2027-R13 source-qualified candidate.** The desktop, mobile and phone-preview suites (**302/0/0** each) and the WebMCP harness (**260 checks**) are executed against these exact bytes from the shipped extraction. Static release audit **125 / 125** after the receipt re-pin; the bound evidence snapshot this candidate shipped with predates that re-pin and shows 119/6 — reproduce the current number directly: `node qualification/static-release-audit.js .`. Native WebMCP registration and four sample calls are observed on these exact bytes, recorded in the development tree (`docs/evidence/release/<sha12>/real-chrome/`), which is evidence rather than part of this published set; the full real-browser harness (**224/228**) and the scripted evals (**10/10**) are supporting evidence from the older R4 bytes; a model-chosen, script-hosted route is supporting evidence from separate delegation bytes (58 of 60 runs, `docs/evidence/hilt-model/`, same development tree). The live origin, the K3 browser registry, and the manual-device gate remain human gates, NOT RUN on this candidate. **Origin surface not_run.**

The qualification harness ships beside the source: the qualification-injected suite carried by `run-selftest2.js`, the WebMCP harness, the static release audit, and the real-agent route. They are there so the final submission can be judged from exact current bytes rather than inherited claims from pre-public development. `qualification/RECEIPT.json` binds the current source hash to the observed static result and keeps every unexecuted gate at `not_run` until it is actually observed on the same bytes.

The WebMCP architecture itself is intentionally one projection over Rapier's existing semantic operation kernel. Visible controls, the Speedracer host projection, and browser-native WebMCP do not maintain separate editing implementations. WebMCP narrows what it exposes, carries its own agent actor, and receives only the bounded evidence/handles its tool call earned.

## Where this runs — two distributions, one artifact

The same canonical bytes ship into two deliberately different surfaces:

- **The open web.** Any static host serves the one file. In a WebMCP-capable
  browser, the agent the person is already talking to gets a second,
  evidence-bound hand in the live document.
- **Agent-app in-app browsers.** The mobile bet. Agent applications are
  beginning to carry WebMCP-capable built-in browsers — OpenAI documents
  WebMCP-backed site tools in the ChatGPT desktop app's built-in browser.
  In-app mobile support is not confirmed anywhere yet; betting on it costs Rapier
  nothing, because there is nothing app-specific to build. Registration
  rides `document.modelContext` wherever it exists, so the day any agent
  app's in-app browser carries WebMCP, the same deployed bytes work inside
  it: the person keeps talking to their agent in the app and opens the
  document beside the conversation — two hands in one document, no
  app-switching. No vendor detection, no Chrome assumption — the origin
  trial is Chrome's own admission requirement, and its absence never
  degrades any other surface — and no service-worker requirement: Rapier
  runs as a plain page.

For qualification, use a Chrome build that actually exposes `document.modelContext`.
The supplied native-contract probe enables WebMCP and Blink testing features and
records the browser's own callback, reflection, and wire shapes without assuming an
expected answer. Brave did not install the API under the tested flags and is not a
qualification route.

## What is deliberately not here

No AI mode. No chat panel. No model selector, API key, account, or backend. No
WebMCP wrapper library: registration calls the browser API directly, while
Rapier's ordinary operation kernel owns document semantics. No declarative
registration either: every tool registers imperatively, because the one live
declarative implementation the field turned up still needed its submit handler
to read `FormData`, the agent having written the DOM value directly before the
framework's own state ever saw it (recorded in the development tree's field
research, `docs/evidence/hilt-field/FIELD-INTEL-2-20260903.md`, which is evidence
rather than part of this published set).
In a browser without WebMCP, and from `file://`, Rapier remains the same editor;
the WebMCP layer is inert.

That is the point. Rapier knows how to edit files. Your agent knows how to think.
WebMCP is the narrow protocol between them.
