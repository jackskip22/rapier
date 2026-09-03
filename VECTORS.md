# Will/1 conformance vectors — human projection

*This file is the deterministic human-readable projection of `VECTORS.json`, rendered by `node reference/will.mjs project VECTORS.json` and byte-compared against this file by `node reference/will.mjs check VECTORS.json` — it cannot drift from the machine truth it summarizes without `check` failing. `VECTORS.json` is normative: full outcomes, ordered faults with byte spans, region byte spans. Where this prose and the JSON ever disagree, the JSON governs and this file is stale. MIT — see `LICENSE`; this repository carries no CC0 grant anywhere.*

An implementation is run through the same cases via the adapter protocol (`node reference/will.mjs --adapter`, NDJSON in, NDJSON out) so any implementation, not only this reference one, is judged against the identical fixtures. Every case here is machine-judgeable — this suite carries no unverified column. Outcomes only a full host can witness (review UI, disclosure, conversion, external formatters) are law, not vectors: they live in WILL-1.md's own "Host obligations" list instead. Retired ids (`U11`, `U13`, `U14`, `U16`, `MD17`, `MD20`) are never reassigned: an id, once used, is never recycled to mean something else, so the `U`-series below carries intentional gaps rather than being renumbered.

## Parse vectors

Each case is `parse(bytes)` checked against the full normalized result — `faulted`, the ordered fault list (mode, line, byte span), and the full region list (law, intent, opener/closer byte spans, governed byte span) — exactly, in `VECTORS.json`. This table gives `faulted`, the fault modes, and region laws only — the byte-span detail lives in the JSON.

| id | faulted | expected faults | expected regions | what it proves |
|---|---|---|---|---|
| `MD1` | false | (none) | keep | basic keep region, no intent |
| `MD2` | false | (none) | edit: "never lose the founding voice" | basic edit region with intent |
| `MD3-emdash` | true | malformed_marker, unpaired_marker | (none) | em dash separator is not a second spelling |
| `MD3-unspaced` | true | malformed_marker, unpaired_marker | (none) | colon with no following space is malformed |
| `MD4` | false | (none) | keep: "the tone: and the voice" | a second colon inside intent does not re-split |
| `MD5` | true | unknown_law, unpaired_marker | (none) | law words are lowercase and permanent; no aliasing |
| `MD6` | true | unknown_version, unpaired_marker | (none) | unknown version token fails closed |
| `MD7` | true | malformed_marker, unpaired_marker | (none) | an early "-->" inside intent leaves trailing junk; the intent-level "--" ban catches it |
| `MD8-unclosed` | true | unpaired_marker | (none) | opener with no closer before EOF |
| `MD8-orphan` | true | unpaired_marker | (none) | closer with no opener |
| `MD8-interleaved` | true | unpaired_marker, unpaired_marker | keep | a second opener before the first pair's closer is a fault attached to the second opener; the first opener stays pending and pairs with the first real closer |
| `MD9` | false | (none) | keep; append | any number of well-formed pairs in sequence, each its own region |
| `MD12-indent-quotes` | false | (none) | (none) | a marker indented one space is off column zero: content, not a marker |
| `MD12-fence-does-not-shield` | false | (none) | keep | recognition never asks what Markdown block a line is in |
| `MD16-paste-governs` | false | (none) | keep: "travelled here by paste" | a pair simply governs wherever its bytes land; markers carry no identity |
| `MD19-trailing-junk` | true | malformed_marker, unpaired_marker | (none) | bytes after the closing arrow, before the terminator, are a fault |
| `U15-512` | false | (none) | keep: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx…" | intent of exactly 512 ASCII scalar values is legal |
| `U15-513` | true | intent_over_bound, unpaired_marker | (none) | intent of 513 ASCII scalar values faults, never truncates |
| `U15-512-astral` | false | (none) | keep: "😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀…" | the bound counts Unicode SCALAR VALUES: 512 astral emoji (4 UTF-8 bytes, 2 UTF-16 units, 1 scalar each) is legal |
| `U15-513-astral` | true | intent_over_bound, unpaired_marker | (none) | 513 astral scalars faults on scalar count, not on byte or UTF-16 length |
| `AUDIT-TRAIL-SPACE` | true | malformed_marker, unpaired_marker | (none) | an opener followed by trailing spaces before the terminator faults inside the namespace |
| `AUDIT-NBSP-PREFIX` | true | unpaired_marker | (none) | a marker-shaped line preceded by NBSP is off column zero and is content, never a fault |
| `AUDIT-WILLING-PROSE-1` | false | (none) | (none) | the reserved namespace is exactly "<!-- will/"; "<!-- willing ..." does not match it |
| `AUDIT-WILLING-PROSE-2` | false | (none) | (none) | "<!-- willingness -->" likewise falls outside the reserved namespace |
| `AUDIT-EMPTY-INTENT` | true | malformed_marker, unpaired_marker | (none) | a colon-form marker whose intent is zero-length faults |
| `MD21-INTENT-DASHDASH` | true | malformed_marker, unpaired_marker | (none) | intent may never contain "--" anywhere, not only where it would form "-->" |
| `AUDIT-INVALID-UTF8` | true | invalid_utf8 | (none) | a byte sequence that is not strict UTF-8 is a decode fault, never replacement characters |
| `AUDIT-UTF16-BOM` | true | invalid_utf8 | (none) | a UTF-16LE document (BOM FF FE, null bytes) is not valid UTF-8 at all: decode fault |
| `AUDIT-LONE-SURROGATE` | true | invalid_utf8 | (none) | a WTF-8 lone-surrogate byte sequence (ED A0 80, encoding U+D800) is not strict UTF-8: decode fault |
| `AUDIT-BOM-PREFIX` | true | unpaired_marker | (none) | a UTF-8 BOM prepended to the first line shifts it off column zero; a marker there is unrecognised, so its closer orphans |
| `AUDIT-MIXED-EOL` | false | (none) | keep; append | LF and CRLF terminators are each recognised independently within the same document |
| `AUDIT-FAULT-MULTIPLICITY` | true | unpaired_marker, unpaired_marker | (none) | two unpaired closers are two faults, ordered, never deduplicated |
| `PARSE-FAULT-PRECEDENCE-VERSION` | true | unknown_version, unpaired_marker | (none) | a marker with an unknown version, an unknown law word, and an empty intent all at once reports only unknown_version: the version check runs first and stops the line |
| `PARSE-FAULT-PRECEDENCE-LAW` | true | unknown_law, unpaired_marker | (none) | a marker with an unknown law word and a 600-scalar intent at once reports only unknown_law: the law-word check runs before intent length is ever measured |
| `PARSE-INVALID-UTF8-TWO-SEQUENCES-FIRST-WINS` | true | invalid_utf8 | (none) | a document with two invalid UTF-8 sequences reports exactly one fault, at the first: parsing stops there and the second is never reached |
| `AUDIT-FAULT-ORDER-OPENER-THEN-BAD-CLOSER` | true | unpaired_marker, malformed_marker | (none) | a well-formed pending opener plus a later malformed closer: faults are reported in document order by span start (the opener’s own unpaired_marker, discovered only after the loop ends, still sorts before the closer’s malformed_marker) |
| `AUDIT-UNSPACED-BOTH` | true | malformed_marker, malformed_marker | (none) | the worst typo: both the opener and closer missing the space after "<!--" — reserved-namespace near-misses, each its own malformed_marker fault, never silently ordinary content |
| `AUDIT-UNSPACED-OPENER-ONLY` | true | malformed_marker, unpaired_marker | (none) | one-side unspaced: the opener is the near-miss (malformed_marker); the well-formed closer that follows has no pending opener to pair with (unpaired_marker) |
| `AUDIT-UNSPACED-CLOSER-ONLY` | true | unpaired_marker, malformed_marker | (none) | one-side unspaced: the well-formed opener stays pending (unpaired_marker, discovered at EOF) while the near-miss closer faults on its own line (malformed_marker) without closing it |
| `AUDIT-INDENT-ONE-SIDE-OPENER` | true | unpaired_marker | (none) | the quoting rule indents BOTH markers of a pair; indenting only the opener moves it off column zero into ordinary content, stranding the closer as an orphan (unpaired_marker) — the surviving marker is the one that faults |
| `AUDIT-INDENT-ONE-SIDE-CLOSER` | true | unpaired_marker | (none) | the same one-side quoting mistake in the other direction: the closer moves off column zero into content, stranding the opener pending until EOF (unpaired_marker) |
| `AUDIT-BOTH-INDENTED-QUOTED` | false | (none) | (none) | quoting done correctly: both markers of the pair indented one space are both off column zero, so the whole pair is ordinary content — zero faults, zero regions |
| `AUDIT-SINGLE-SPACE-INTENT-EATEN` | true | malformed_marker, unpaired_marker | (none) | a single space after the colon with nothing before "-->" is malformed: the close delimiter’s own leading space is the only space present, so the grammar never sees the required "<law>: " separator followed by intent text |
| `AUDIT-UTF8-BEFORE-MARKER` | false | (none) | keep | multibyte BMP (CJK, 3 UTF-8 bytes each) and astral (emoji, 4 UTF-8 bytes, a UTF-16 surrogate pair) content precedes the pair: the opener’s byteSpan is only correct under true UTF-8 byte accounting — a UTF-16-code-unit scanner (or a codepoint-count scanner) computes a smaller, wrong offset for everything after this line |
| `AUDIT-UTF8-INSIDE-GOVERNED` | false | (none) | keep | the governed region’s own content is multibyte BMP+astral text: governedSpan and the closer’s byteSpan are only correct under true UTF-8 byte accounting of that one line, never UTF-16 code units or a codepoint count |
| `AUDIT-UTF8-INSIDE-INTENT` | false | (none) | keep: "漢字テスト" | a BMP multibyte (CJK) intent, distinct from the existing astral-only 512-scalar vectors: intent is recovered verbatim and the marker’s own byteSpan reflects the intent’s true UTF-8 byte length, not its UTF-16 or codepoint length |
| `PARSE-FAULT-MISSING-LAW-WORD` | true | malformed_marker, unpaired_marker | (none) | a marker whose law word is missing (a colon where the word should be) is malformed_marker, never unknown_law: a missing word is one fact and gets one mode, exactly as the bare `<!-- will/1 -->` form does |
| `PARSE-FAULT-PRECEDENCE-VERSION-BARE` | true | unknown_version, unpaired_marker | (none) | the version is judged before anything else on the line: a bare `<!-- will/2 -->` with no space after the version is unknown_version, never malformed_marker — the same precedence PARSE-FAULT-PRECEDENCE-VERSION states for a line that goes on |
| `PARSE-FAULT-VERSION-TOKEN-TAB` | true | unknown_version, unpaired_marker | (none) | the version token is the bytes after `will/` up to the first ASCII space: a tab inside it is part of the token, so `<!-- will/1<TAB>keep -->` names no known version and is unknown_version, never malformed_marker — judged first, like PARSE-FAULT-PRECEDENCE-VERSION-BARE |

## Evaluate vectors

Each case is `evaluate(beforeBytes, splices, path)` — a set of host-observed byte-offset splices judged against the document's pre-state — checked against `{outcome, reason?, rule?, region?, law?, faults?}` exactly, key for key: a result carrying a stray field `VECTORS.json` does not name for that case is a failure, never ignored. `outcome: "invalid"` is a precondition failure — the splices or the `path` value were not well-formed — decided before any document law is consulted; it is distinct from both `applied` and a `document_law` refusal, and it is checked identically on every path, authoring included.

| id | path | expected | what it proves |
|---|---|---|---|
| `U1` | working | refused, rule=law_violated, region=0, law=keep | a byte changed inside a keep region is refused |
| `U2` | working | applied | editing unmarked prose outside every region is applied |
| `U3` | working | applied | append growth: a new line added immediately before the closer |
| `U4` | working | refused, rule=law_violated, region=0, law=append | prepending inside an append region is refused: growth is only at the end |
| `U5` | working | refused, rule=law_violated, region=0, law=append | any interior change inside an append region is refused |
| `U6` | working | applied | edit permits any change inside its own region; intent rides as guidance only |
| `U7-create` | working | refused, rule=marker_sequence_mismatch | wrapping existing prose in brand-new markers via splice is refused: a working path never writes the will |
| `U7-remove` | working | refused, rule=marker_span_touched, region=0, law=keep | deleting a pair via splice touches both marker spans: refused |
| `U7-reword-intent` | working | refused, rule=marker_span_touched, region=0, law=keep | rewriting only the intent text is still a splice into the opener's own span: refused |
| `U8` | working | refused, rule=law_violated, region=1, law=keep | one act reaching two regions: the edit alone would apply, but the keep region it also reaches fails, so the whole act is refused |
| `U10` | authoring | applied | the authoring path performs the same destructive rewrite and it is applied, unrestricted |
| `U12` | working | refused, rule=law_violated, region=0, law=keep | a hostile intent string changes nothing mechanically: the governed-byte change is still refused on document law alone |
| `MD13-fence-add-is-harmless` | working | applied | adding an unclosed fence entirely outside every region, touching no governed bytes, is applied |
| `MD13-kept-still-kept-behind-fence` | working | refused, rule=law_violated, region=0, law=keep | a fence sitting above a kept region does not loosen the region: the governed bytes are still keep |
| `AUDIT-APPEND-GROW-LASTLINE` | working | applied | growing the region's own final line ("A" -> "AB") is a valid byte-prefix append, applied |
| `AUDIT-APPEND-TRAILING-WS-DELETE` | working | refused, rule=law_violated, region=0, law=append | deleting trailing whitespace inside an append region shrinks it: refused |
| `AUDIT-CRLF-TO-LF-IN-KEEP` | working | refused, rule=law_violated, region=0, law=keep | converting one CRLF to LF inside a kept region changes governed bytes: refused |
| `AUDIT-MOVE-PAIR` | working | refused, rule=marker_span_touched, region=0, law=keep | a splice pair that deletes a whole marker pair+body from one place and reinserts it elsewhere is refused: splices touch marker spans |
| `AUDIT-INSERT-BEFORE-OPENER-LEGAL` | working | applied | inserting immediately before an opener (a zero-width splice at its own start) does not intersect its span: applied |
| `AUDIT-INSERT-INTO-OPENER-REFUSED` | working | refused, rule=marker_span_touched, region=0, law=keep | inserting into the interior of the opener line intersects its span: refused |
| `AUDIT-IDENTICAL-REWRITE-REFUSED` | working | refused, rule=marker_span_touched, region=0, law=keep | a working splice that rewrites a marker pair with byte-identical text still intersects its span: refused |
| `AUDIT-TWO-MARKERS-TOUCHED-FIRST-NAMED` | working | refused, rule=marker_span_touched, region=0, law=append | one splice that runs from inside region 0's closer into region 1's opener touches two regions' markers; the refusal is one and it names the first touched region in document order (region 0, its own law), never the later or the stricter one |
| `AUDIT-MULTISPLICE-MARKERS-DOCUMENT-ORDER` | working | refused, rule=marker_span_touched, region=0, law=append | two byte-identical marker rewrites supplied in reverse document order: the act is refused whole and the one refusal names region 0 (append), the first touched region in document order — never region 1, the caller's first splice |
| `AUDIT-AUTHORING-BYPASSES-ALL` | authoring | applied | an authoring path performing the same move+rewrite is applied, unrestricted |
| `AUDIT-FAULTED-BEFORE-EMPTY-SPLICES-APPLIED` | working | applied | a faulted before-document with zero splices (no-op transaction) is applied |
| `AUDIT-FAULTED-BEFORE-WITH-SPLICE-REFUSED` | working | refused, rule=before_faulted, faults=1 | a faulted before-document with any real splice is refused, the fault disclosed |
| `AUDIT-INVALID-UTF8-EVALUATE` | working | refused, rule=before_faulted, faults=1 | a before-document that is not strict UTF-8 refuses evaluation entirely (decode refusal) |
| `EVAL-INVALID-UTF8-INTRODUCED-BY-SPLICE` | working | refused, rule=result_faulted, faults=1 | a splice that turns a valid document invalid (introduces a bad UTF-8 byte inside an edit region) is refused: the result is judged too, not only the splice shape |
| `EVAL-PRECOND-MALFORMED-SPLICE` | working | invalid, reason=precondition, rule=malformed_splice | a splice whose end precedes its start is refused as a precondition, before any document law is consulted |
| `EVAL-PRECOND-MALFORMED-SPLICE-AUTHORING` | authoring | invalid, reason=precondition, rule=malformed_splice | splice shape is checked before the path branch: the same malformed splice is refused as precondition even on the authoring path, which bypasses document law but never the shape of its own input |
| `EVAL-PRECOND-SPLICES-NOT-A-LIST` | working | invalid, reason=precondition, rule=malformed_splice | evaluate() is total over its second argument too: a splices value that is not a list at all (null here) is refused as outcome:"invalid" rule:"malformed_splice" — never coalesced into an empty transaction and applied, never a thrown error |
| `EVAL-PRECOND-OUT-OF-RANGE-SPLICE` | working | invalid, reason=precondition, rule=out_of_range_splice | a splice whose end lies past the document's own length is refused as a precondition |
| `EVAL-PRECOND-OVERLAPPING-SPLICES` | working | invalid, reason=precondition, rule=overlapping_splices | two splices whose byte ranges overlap are refused as a precondition, regardless of what either one would do to document law |
| `EVAL-PRECOND-SAME-OFFSET-SPLICES` | working | invalid, reason=precondition, rule=overlapping_splices | two zero-width splices proposing to insert at the identical offset are refused as a precondition: this file declares no implicit order between them rather than picking one silently |
| `EVAL-PRECOND-UNKNOWN-PATH` | reviewing | invalid, reason=precondition, rule=unknown_path | a path value that is neither "working" nor "authoring" is refused as a precondition, the same distinct shape as a malformed splice |
| `EVAL-NEAR-MISS-EDITED-INTO-MARKER-REFUSED` | working | refused, rule=marker_sequence_mismatch | two working splices edit two near-miss ordinary lines (outside the reserved namespace, so the before-document is unfaulted) into a fresh, well-formed marker pair; the result would reparse as one clean region, but it is refused: a working path never writes the will, defense in depth beyond the span check alone |
| `EVAL-APPEND-EMPTY-REGION-GROWS` | working | applied | an append region with nothing between its markers is empty, not faulted; inserting the first content at its start is applied, since the empty string is a prefix of anything |
| `AUDIT-BROAD-NARROW-PAIR-NARROW` | working | applied | narrowly replacing only the free prose outside a keep region is applied; paired with AUDIT-BROAD-NARROW-PAIR-BROAD, which reaches the identical final document bytes through one whole-document splice and is refused: legality depends on the splices actually witnessed, never merely on the document that results |
| `AUDIT-BROAD-NARROW-PAIR-BROAD` | working | refused, rule=marker_span_touched, region=0, law=keep | one whole-document splice reaching the identical final bytes as AUDIT-BROAD-NARROW-PAIR-NARROW — including byte-identical markers — is refused: it overlaps both marker spans, even though it changes nothing about what they say. The same final transition changes legality with how a host grouped it into splices, and that is deliberate, not a bug to clean up |
| `EVAL-PRECOND-INSERT-FALSE` | working | invalid, reason=precondition, rule=malformed_splice | evaluate() is total: a splice whose insert is the boolean false is refused as outcome:"invalid" rule:"malformed_splice" — never a thrown TypeError, never silently coerced to an empty insert. An explicit empty string (or empty insertBase64) is the only legal way to say "no bytes". |
| `EVAL-PRECOND-INSERT-ZERO` | working | invalid, reason=precondition, rule=malformed_splice | evaluate() is total: a splice whose insert is the number 0 is refused as outcome:"invalid" rule:"malformed_splice" — never a thrown TypeError, never silently coerced to an empty insert. An explicit empty string (or empty insertBase64) is the only legal way to say "no bytes". |
| `EVAL-PRECOND-INSERT-OBJECT` | working | invalid, reason=precondition, rule=malformed_splice | evaluate() is total: a splice whose insert is a plain object ({}) is refused as outcome:"invalid" rule:"malformed_splice" — never a thrown TypeError, never silently coerced to an empty insert. An explicit empty string (or empty insertBase64) is the only legal way to say "no bytes". |
| `EVAL-PRECOND-INSERT-MISSING` | working | invalid, reason=precondition, rule=malformed_splice | evaluate() is total: a splice whose insert is entirely absent (no insert key at all) is refused as outcome:"invalid" rule:"malformed_splice" — never a thrown TypeError, never silently coerced to an empty insert. An explicit empty string (or empty insertBase64) is the only legal way to say "no bytes". |
| `EVAL-PRECOND-INSERT-NULL` | working | invalid, reason=precondition, rule=malformed_splice | evaluate() is total: a splice whose insert is null is refused as outcome:"invalid" rule:"malformed_splice" — never a thrown TypeError, never silently coerced to an empty insert. An explicit empty string (or empty insertBase64) is the only legal way to say "no bytes". |
| `AUDIT-APPEND-CRLF-LASTLINE-APPLIED` | working | applied | converting the single line terminator immediately before the closer from LF to CRLF is applied: that one terminator is carrier, not content, and is excluded from append’s byte-prefix comparison — a region’s own final line may still grow |
| `AUDIT-KEEP-CRLF-LASTLINE-REFUSED` | working | refused, rule=law_violated, region=0, law=keep | the identical LF→CRLF edit on a keep region’s own final terminator is refused: keep compares full governed bytes, terminator included, so this is still a byte change |
| `EVAL-UTF8-SPLICE-AFTER-MULTIBYTE-APPLIED` | working | applied | the before-document opens with multibyte BMP+astral content; the splice’s own start/end are the TRUE byte offsets of "Body." inside the following edit region — offset arithmetic is exercised, not merely span reporting: a splice built from wrong (UTF-16-unit or codepoint) offsets would land on the wrong bytes entirely |
| `EVAL-UTF8-SPLICE-AFTER-MULTIBYTE-MARKER-TOUCHED` | working | refused, rule=marker_span_touched, region=0, law=edit | the identical multibyte-prefixed document, with a splice whose true byte offsets instead land on the opener marker’s own bytes: refused as marker_span_touched, proving the overlap check itself resolves the marker’s span correctly past the multibyte prefix |
| `EVAL-PRECOND-NULL-SPLICE-ELEMENT` | working | invalid, reason=precondition, rule=malformed_splice | a splices array containing a null element is refused as a precondition, exactly like any other malformed splice — evaluate() is total over its own input shape and never throws out of the call, even here, before any document law is consulted |

## Universal outcomes, in prose

- `keep`: any working-path splice that changes the region's governed bytes, or that touches a marker's own byte span, is refused.
- `append`: the region's prior governed content, less the one structural line terminator immediately before the closer (carrier, not content — excluded so a region's own final line may grow), stands as an exact byte prefix of the new; anything else is refused. An empty append region accepts any growth, since the empty string is a prefix of everything.
- `edit`: any working-path change to governed bytes is applied.
- A splice touching any marker's own byte span is refused even when it writes back byte-identical marker text, and even as one half of a delete+reinsert pair that would move a pair whole. The same final document reached instead by splices that touch no marker span is applied: annotation-span contact is judged on the splices actually performed, never on the document's eventual bytes.
- One act reaching several regions is judged as the conjunction of every region's own law — never a single "strictest law governs" verdict across the whole act.
- A before-document that is already faulted refuses any real splice (the fault disclosed) but applies a no-op (zero splices).
- Splice shape is a precondition, checked before the path branch: a malformed offset pair, an offset past the document's end, two splices that overlap, or two splices that tie at the same start offset, is refused as `outcome: "invalid"` — on every path, authoring included. An unrecognised `path` value is refused the same way.
- An authoring path is unrestricted over document law: once its splices' shape is valid, every document-law case above is `applied` on that path.
- Faults are an ordered list, mode and byte span, never deduplicated, reported in document order by span start. Invalid UTF-8 is one fault at the first malformed byte sequence; parsing stops there.
