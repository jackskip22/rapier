# The public edit-ledger format

The edit ledger and its carried parts. MIT, no dependencies; part of
`rapier-markdown-kit`. The editor and this module use the **same** record validator,
splice replayer, root transition and interval transport. This is not a second history store.

```js
import {exportLedger, readLedger, authorship, merge} from 'rapier-markdown-kit/rapier-ledger';
import {writeDocument, readDocument} from 'rapier-markdown-kit/ledger/carried';

const ledger = exportLedger({
  text: 'Hello', records: [], documentAuthority: 'example-document', complete: true,
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

## The format at launch

`rapier-ledger/1` is a plain JSON object:

```
{format, documentAuthority, start: {text, revision, root, sha256}, records,
 head: {revision, root, sha256}, complete, sha256}
records[]: {transaction, splices: [{pos, removed, inserted}], beforeHash, afterHash}
transaction: {id, documentAuthority, baseRevision, revision, actor: {kind, id},
 transport, operation, requestId, sourceTransactionId, affectedBlockIds,
 parent, reverts, reapplies, createdAt}
```

`format` is `rapier-ledger/1`. `start.text` is the exact text before the first
retained record. Every outgoing record carries its own splices, including Undo and
Redo. Offsets and ranges count UTF-16 code units; no boundary may cut a surrogate
pair. Splices execute in their recorded order. UTF-8 checksums preserve CRLF, tabs,
NUL and non-ASCII text. The canonical text limit is 25 MiB; each record has at most
64 splices. The existing record validator remains authoritative for field bounds.

`start.sha256` and `head.sha256` hash UTF-8 text. The envelope `sha256` hashes
canonical JSON of every other envelope field: recursively sorted object keys,
array order preserved, JSON string/number spelling. Plain finite scalar data only:
no accessors, sparse arrays, cycles, undefined, negative zero or unpaired surrogates.
Readers reject unknown envelope/start/head fields, bad checksums, invalid records,
invalid source boundaries, a replay/root mismatch, or a head different from the
actual document. `historyEnvelope` additionally proves the editor's Undo/Redo branch.

**Roots are path-dependent.** `textRoot(text)` mints the existing
`chars:fnv-base36:adler-base36` initial root. Each splice advances it with
`rootAfter(priorRoot, splice)`, matching the source store. A later root is **not**
a fresh hash of the whole current text. SHA-256 of the exact checkpoint text is
separate. This distinction preserves the editor's actual format rather than the
earlier design shorthand. A nonzero start names a retained checkpoint; it does not
claim to reconstruct discarded events. `complete: false` also permits a stated
revision gap from the editor's pruning of cancelling navigation pairs; each
remaining splice must still replay exactly. It is never a claim about missing edits.

`actor.kind` is `human`, `agent` or `system`. A named agent's `actor.id` is
`<door>/<host-given name>` (name at most 96 characters, combined id at most 160).
Without a name, the door stands alone. The name is a **host-supplied claim**, not a
verified identity. Timestamps are supplied record times, not independently attested.
Checksums detect inconsistency/corruption, **not forgery**: anyone able to rewrite a
file can rewrite its checksums and labels. Importing a label never grants a live
principal's read handles, review authority or undo permissions.

## Optional carried parts

The default is **neither part**. In a self-contained page these inert scripts stand
beside the document's existing carried source:

| Element | Type and contents | Choice |
| --- | --- | --- |
| `#rapier-authorship` | `application/json`, `rapier-authorship/1` | Who wrote what |
| `#rapier-ledger` | `application/json`, `rapier-ledger/1` | The whole history |

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

The existing proposal page's `#rapier-base` is independent: `text/markdown`, with
`data-revision`, `data-sha256`, `data-by` and `data-at`, carries the proposal's
baseline. It is **not** reconstructed from an optional ledger, and this module does
not implement the separate proposal-tool/CLI workflow.

## Merging copies without a server

`merge(first, second)` locates a common checkpoint with the same root **and exact
text**, then transports the second copy's record splices over the first's through
the shared interval transport. It preserves the first's ancestry and incoming
actors/times, minting local revision/root links. Both the public reader and the
editor's restore reader can replay the result. Both merge orders yield the same
text for independently edited nonoverlapping ranges; their ordered ledgers need
not be identical. Full and conflict receipts make repeated imports idempotent.

Overlaps fall back to the existing text three-way merge. Unresolved alternatives
are carried in the existing `note-conflict:v1` envelope, never silently selected.
Different Will `keep` regions require conflict review even when one copy was
unchanged. `review.required` names an unresolved result; a UI must not auto-accept
it. Rapier offers carried-copy imports from Compare through its existing review,
checks the live document again at commit, and installs the proven ledger before
publishing its receipt or opening the durable-save barrier. A rejected or stale
proposal mutates nothing. A failed install rolls the source and undo window back.
Copies without a proven common checkpoint are refused by this API.

## Host integration and retention

The embed helper accepts `agentName`; the checked `rapier-connect` message carries
`agent: {name}`. WebMCP uses the registration owner's supplied client name. Modern
MCP uses the request's client metadata, outside tool arguments; a legacy stateless
request without a supplied name stays unnamed. MCP editor snapshots include the
server's retained journal only in editor metadata, not in model-facing tool results.
The browser proves a replay suffix before preserving remote writers under local
revision links; missing remote events never become an invented complete history.

Rapier retains its existing 500-record / 4-MiB in-memory window. A carried file can
outlive that window; reopening may trim it again. The module preserves an explicitly
incomplete start. Full history includes removed text and can be much larger than
the current document; it is opt-in for each outgoing file, never a persistent
preference. Authorship is also opt-in. Neither option implies signatures, identity
verification, infinite retention, a relay server or automatic synchronization.
