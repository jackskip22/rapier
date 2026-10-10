# The public edit-ledger format

The edit ledger and its carried parts. MIT, no dependencies; part of
`rapier-markdown-kit`. The editor and this module use the **same** record validator,
splice replayer, root transition and interval transport. This is not a second history store.

```js
import {exportLedger, readLedger, authorship, merge} from 'rapier-markdown-kit/rapier-ledger';
import {writeDocument, readDocument} from 'rapier-markdown-kit/ledger/carried';

const ledger = exportLedger({
  text: 'Hello', metadata: {filename: 'Hello.md', docKind: 'markdown'}, records: [], documentAuthority: 'example-document', complete: true,
});
const saved = writeDocument('Hello', {ledger});
const reopened = readDocument(saved);
const verified = readLedger(reopened.ledger, reopened.text);
console.assert(verified.text === 'Hello');
const clean = writeDocument(verified.text, {authorship: authorship(ledger)});
console.assert(readDocument(clean).ledger === null);
const together = merge(ledger, reopened.ledger);
console.assert(together.text === 'Hello');
```

## The format

`rapier-ledger/2` is a plain JSON object:

```
{format, documentAuthority, start: {text, revision, root, sha256, metadata}, records,
 head: {revision, root, sha256, metadata}, complete, sha256}
records[]: {transaction, splices: [{pos, removed, inserted}], beforeHash, afterHash, metadata?, authored?}
transaction: {id, documentAuthority, baseRevision, revision, actor: {kind, id},
 transport, operation, requestId, sourceTransactionId, affectedBlockIds,
 parent, reverts, reapplies, createdAt, [turnId, sourceTransactionIds, remoteTransactionId]}
```

`format` is `rapier-ledger/2`. `start.text` is the exact text before the first
retained record. Every outgoing record carries its own splices, including Undo and
Redo. Offsets and ranges count UTF-16 code units; no boundary may cut a surrogate
pair. Splices execute in their recorded order. UTF-8 checksums preserve CRLF, tabs,
NUL and non-ASCII text. The canonical text limit is 25 MiB; each record has at most
64 splices. A metadata state is `{filename, docKind}`. A record may carry assignments such as
`metadata: {filename: {before: "A.md", after: "B.md"}}`. Metadata-only records keep equal source roots
and empty splices. An equal-value assignment is retained when another real effect admits the act; a wholly
unchanged replacement creates no act. Inverse records reference retained earlier act IDs in
`sourceTransactionId` or `sourceTransactionIds`, each at most 256 characters. Active inverse references
withdraw assignments even when later work hides their visible effect; reversing an inverse restores that
same identity. Stable `turnId` groups by original author and turn identity, independently of a record's label.
File handles, overwrite permission and save-binding state never enter portable metadata.

An optional `authored: {basis, source, splices}` preserves an act's original placement
when concurrent transport changes its physical `record.splices`. `basis` is the sorted,
minimal frontier of canonical act IDs observed at authoring; its causal closure is
reconstructed from these same records, including metadata-only acts and inverse
dependencies. `source` is the SHA-256 of the exact UTF-8 source before the original
sequential `splices`. An ordinary untransported record omits this field; its retained
prefix supplies the same evidence. Transport preserves the evidence and the original
act ID, author, time, turn, label, metadata choices and inverse targets. It neither
copies the growing prefix into each record nor creates another journal.

Use `readLedger` or `exportLedger` to validate retained history and `merge` or
`transposeAuthored` to transport it. Validation proves the causal closure, source
hash and exact original-to-physical placement; field shape or equal final text alone
is insufficient. Do not attach new authored evidence to an arbitrary physical copy.
Selective Undo uses this evidence to preserve concurrent insertions at their original
gaps, even when a replacement split into several physical splices.

`start.sha256` and `head.sha256` hash UTF-8 text. The envelope `sha256` hashes
canonical JSON of every other envelope field: recursively sorted object keys,
array order preserved, JSON string/number spelling. Plain finite scalar data only:
no accessors, sparse arrays, cycles, undefined, negative zero or unpaired surrogates.
Readers reject unknown envelope/start/head fields, bad checksums, invalid records,
invalid source/metadata boundaries, a replay/root mismatch, invalid inverse references, or a head different from the
actual document. Source and metadata replay must agree at every record, including selective inverse effects. `historyEnvelope` additionally proves the editor's Undo/Redo branch.

**Roots are path-dependent.** `textRoot(text)` mints the existing
`chars:fnv-base36:adler-base36` initial root. Each splice advances it with
`rootAfter(priorRoot, splice)`, matching the source store. A later root is **not**
a fresh hash of the whole current text. SHA-256 of the exact checkpoint text is
separate. This distinction preserves the editor's actual format rather than the
earlier design shorthand. A nonzero start names a retained checkpoint; it does not
claim to reconstruct discarded events. `complete: false` also permits a stated
revision gap from an explicitly incomplete retained input; each
remaining splice and metadata assignment must still replay exactly. It is never a claim about missing edits.

`actor.kind` is `human`, `agent` or `system`. Canonical doors mint an opaque provenance
`actor.id` independent of the private principal and retain a supplied display name
separately as `actor.name` (host names at most 96 characters). The private principal-to-author
mapping stays in the existing private owner; neither raw nor hashed access credentials
belong in portable authorship. The name is a **host-supplied claim**, not a verified identity. Timestamps are supplied record times, not independently attested.
Checksums detect inconsistency/corruption, **not forgery**: anyone able to rewrite a
file can rewrite its checksums and labels. Importing a label never grants a live
principal's read handles or authenticated document access.

## Optional carried parts

The default is **neither part**. In a self-contained page these inert scripts stand
beside the document's existing carried source:

| Element | Type and contents | Choice |
| --- | --- | --- |
| `#rapier-authorship` | `application/json`, `rapier-authorship/1` | Who wrote what |
| `#rapier-ledger` | `application/json`, `rapier-ledger/2` | The whole history |

Each body uses the same reversible `encodeCarried`/`decodeCarried` escape as the
page's source. `writeParts`, `readParts` and `takeParts` implement it. Duplicate,
executable, malformed or wrong-document parts are refused. If both are present,
the authorship projection recomputed from the ledger must agree exactly.

`rapier-authorship/1` is `{format, sha256, runs}`. `sha256` hashes the **current**
text. Runs are `[start, end, actorKind, actorId, at]`, in order, nonoverlapping and
covering every current character. A start without earlier authorship is attributed
to `system/unattributed`, time zero. Insertions take the inserting record's actor
and time; deleted runs disappear. Thus the projection contains **no removed text**.
An authorship-only import becomes a clearly incomplete insertion ledger; future
attribution is again derived from that one ledger, never a mutable blame database.

A Markdown file carries the same optional JSON at EOF, outside its exact source:

```


<!-- rapier-carried/1
{"ledger":...,"authorship":...}
-->

```

The writer escapes `<` and `>` in that JSON. This versioned EOF marker is reserved;
an unfinished marker is refused, not silently imported as prose. The reader strips
only that exact suffix, validates it against the remaining exact text, and treats a
leading BOM as file metadata. Other Markdown readers ignore the comment. Plain
saves without a choice are unchanged byte for byte. For executable code, use a web
page to carry metadata rather than appending a Markdown comment to program source.

The comparison page's `#rapier-base` is independent: `text/markdown`, with
`data-name`, `data-revision`, `data-sha256`, `data-by` and `data-at`, carries an exact
display reference. It is not reconstructed from the optional ledger and never
replaces current source. `rapier-html --compare original.md revised.md` packages both texts.

## Merging copies without a server

`merge(first, second)` locates a common checkpoint with the same root, revision and **exact text and metadata**, then transports the second copy's record splices over the first's through
the shared interval transport. It preserves the first's ancestry and incoming
actors/times, minting local revision/root links. Both the public reader and the
editor's restore reader can replay the result. Both merge orders yield the same
text for independently edited nonoverlapping ranges; their ordered ledgers need
not be identical. Repeated imports retain the same act identities. Mixed shared and unseen tails prove each shared act at its transported position and append only unseen original acts. An unprovable order returns the original ledger unchanged.

A same-field divergent metadata assignment returns a typed conflict with the original document and ledger
unchanged. Copies with untransportable source edits can be compared without mutating source; no review mode or
proposal grants write authority. An explicitly requested clean copy import commits source, metadata and its
proven ledger atomically. The live document is checked again at commit. A stale import mutates nothing; failed
installation restores source, metadata, source-store identity and the entire Undo window. Copies without a proven
common checkpoint are refused by this API.

## Host integration and retention

The embed helper accepts `agentName`; the checked `rapier-connect` message carries
`agent: {name}`. WebMCP uses the registration owner's supplied client name. Modern
MCP uses the request's client metadata, outside tool arguments; a request without a supplied name stays unnamed. MCP editor snapshots include the
server's retained journal only in editor metadata, not in model-facing tool results.
The browser proves a replay suffix before preserving remote writers under local
revision links; missing remote events never become an invented complete history.

Rapier's live history supports before previews and Undo for individual acts or turns, preserving later edits.
The durable canonical owner retains acts beyond the former 500-record / 4-MiB window. Bounded projections
may evict cached results, but never journal rows. Reopening preserves all admitted records. The module
preserves an explicitly incomplete input start and never fabricates the missing history. Full history includes removed text and can be much larger than
the current document; it is opt-in for each outgoing file, never a persistent
preference. Authorship is also opt-in. Neither option implies signatures, identity
verification, a relay server or automatic synchronization. Storage-capacity failures refuse a write before
publication rather than removing older acts. Only this format is read; older or unprovable envelopes are
explicitly unsupported. The editor recovery envelope uses schema 5 and anchors the same metadata.

## Persistence version boundary

The current reader accepts `rapier-ledger/2` only. The editor Undo recovery envelope is schema 5, and hosted durable workspaces use `rapier-workspace/2` in their existing state owner. Older or missing envelopes are refused without clearing stored records. There is no compatibility reader or inferred historical filename/kind. Existing export-resource reads retain their independent authority checks.

### Recovery publication boundary

Browser recovery publishes the current source and full schema-5 Undo envelope in the same IndexedDB transaction on every flush, not only explicit snapshots. Native recovery publishes one `RPR2` envelope at the existing `recovery/current` owner: a bounded JSON header, exact UTF-8 source bytes, then the full schema-5 Undo envelope. The header binds both payload lengths and the source/history checkpoint identity. History has no 4 MiB or row-count truncation. Provider quota refusal retains the previous value; an unacknowledged native write fences retries and clearing until a fresh open establishes the durable value.

The browser's localStorage safety copy uses schema 5 and carries the full canonical ledger with its exact source, metadata, authority and revision. A newer safety copy can recover its own history after an IndexedDB quota refusal. Alternating checkpoints and downloaded-document recovery drafts also retain matching history. Source and Undo are read together at boot; unsupported source-only safety copies remain untouched.

Open and New retain unsaved work in the existing held-checkpoint store. Each slot is keyed by its canonical ledger digest, so equal source with different metadata or acts stays distinct. Restore preserves original acts, authority and document kind, requires Save As, and detaches stale file bindings. A source-only download does not retire the retained history. Canonical source history remains available when the Markdown formatted projection is unavailable; no block identity is inferred from that projection.

This native wire format deliberately refuses the former split `RPR1`/`undo/current` format. Existing bytes are not removed or rewritten by failed admission, and no compatibility reader is supplied. Native format transition and recovery access require release review before deployment. The source changes and retained failure witnesses remain unexecuted until the shared CPU window is released.

Embedded local recovery retains this same full canonical ledger in the existing sessionStorage draft owner. Its slot is stable for the authenticated host/document/session; source, metadata, history and acknowledged host revision replace together. Equal-source and clean histories are retained, without the former 4 MiB/age discard. Quota refusal keeps the previous complete value and prevents a close-success acknowledgment when history was not retained. Reopen validates the original authority, source, metadata and all records before installing the carried ledger. Old per-revision source-only drafts and a retained slot for a different host revision refuse explicitly without decoding or removing their bytes. Session recovery does not promise persistent history support from an arbitrary embedding host; browser session lifetime remains its storage boundary. These retained witnesses are source-only and unexecuted.
