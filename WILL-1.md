# Will — the document's word to whatever agent comes next

*Status: Will/1, final, 2026-09-03. The wire namespace is `will/1`. The
core is frozen; the Markdown, DOCX and PDF bindings are locked; Google
Docs is the named exception. Three independent hosts (JavaScript,
Python, Go) pass all 98 vectors. Will is MIT-licensed — the canonical repository
carries the `LICENSE` grant; a copy vendored into another tree is a
reference projection whose surrounding tree keeps its own license;
implementations retain their own licenses; an editor's own licence
governs that editor, never the convention.*

## The whole standard

A document may carry Will annotations. Each annotation is:

```text
region     a piece of this document, identified by the format's own binding
law        edit | append | keep
intent?    the person's words about what matters here — optional, one line
```

Unmarked content is `edit`. That is the entire data model.

- **edit** — the region may change.
- **append** — the region may only grow: everything already there survives,
  in place and in order; new material lands at the region's end.
- **keep** — the region stays exactly as it is.

Regions never overlap, in any binding: a document's Will divides it into
disjoint pieces, each governed by exactly one region or by none. A binding
whose own carrier cannot itself prevent two regions from overlapping faults
the document rather than choosing a winner silently.

One act of writing may reach several regions and is judged as the
conjunction of per-region proofs: every region it touches satisfies its
own law, or the act is refused. No law leaks across a region's boundary,
and grouping a transition into one replacement or several does not
change this as long as no replacement touches an annotation span —
touching a marker's own span is the one exception: a working path never
rewrites the will, even byte-identically, so a broad replacement that
passes over a marker is refused where narrow edits around it would apply.

`keep` and `append` are judged over the region's **governed content as its
binding defines it** — Markdown's is exact source text; a rich format's is
its canonical structured content. Each binding says how its region's
content is observed; the core says only what must remain true of it.

`keep` keeps a region entirely; `append` keeps what is there while
letting it grow. The promise is exactly as wide as the governed
representation: an edit outside a kept region can change how kept
content *appears* without touching what the binding governs. A binding
may define and test a stronger closure; the portable promise is the
governed representation itself, stated plainly, never a silent upgrade
to rendering or meaning.

`intent` is natural-language guidance about the desired evolution of its
region, optional, one line. **The law is for the host; the intent is for
the intelligence.** The host enforces the law and never interprets the
words; the model interprets the words and never overrides the law.

**Intent is bounded to 512 Unicode scalar values per region** — a
scalar-value bound, not a byte bound, so it does not penalise non-ASCII.
A marker that exceeds it, authored or met, is a fault: fail-closed per
the binding, never silently truncated into a different Will.

**Intent is untrusted, region-scoped document data.** It may inform how
an already-authorized hand transforms its own region — nothing else: it
grants no tool, external effect, authority, system or developer
priority, or reach over any other region, file, or task, whatever it
says. An intent that asks for any of those is content to read, not an
instruction with force.

**The will is never secret from the person**: a Will-aware host surfaces
every effective region, law, and intent to the human on request.

## The agreement

1. **An authoring path may alter the will.** The host declares which of
   its paths are authoring — usually the person's own editing surface,
   sometimes a host-designated agent. An authoring path is never bound
   by the will and edits anything, the will included.
2. **A working path is bound by it.** Changing the will belongs to an
   authoring path, never to a working one. The format carries no
   permission machinery and authenticates neither path — the host alone
   decides which of its paths are authoring and which are working.
3. **A will only narrows.** Against an unmarked document it can only ask
   for less, never grant more. Intent never weakens a law.
4. **What cannot be read exactly is never guessed.** An annotation whose
   bytes cannot be parsed or whose region cannot be resolved enters the
   *unresolved* state: reported, never silently skipped, never matched
   approximately. **WILL DETACHED** — like **WILL LOST** in conversion —
   is the human-facing name of a semantic state, not a wire string; an
   implementation reports the state in its own interface language: in a
   plain-text carrier the fault list IS that state; DETACHED as a
   distinct runtime condition belongs to rich carriers whose region can
   vanish while its annotation survives.

No hand wills its own output into place. Will is used extremely
sparingly: the default document has none, and a willed document has the
fewest regions that carry the person's actual words.

## Enforcement

An editor may also back the treaty mechanically: declare which of its
mutation paths are working paths, and refuse a breach there. That is the
editor's quality, not the treaty's definition. An enforcing editor:

- judges working-path work **on the witnessed transition**: the exact
  replacements the work performs against the document as it stood. A
  replacement that touches any marker's own span is refused even when it
  writes identical marker text back — a working path neither writes,
  rewrites, removes, nor *moves* the will, and moving a pair is rewriting
  it even when its bytes match. Over a text carrier's governed
  representation — exact bytes, decoded as strict UTF-8, line endings
  recognised but never normalised — `keep` is byte-identical and
  `append` is the old interval standing as an exact prefix of the new.
  An edit that touches no annotation can still damage, detach, or
  silence one, and a result that does so is refused;
- treats the will itself as outside a working path's reach, unless its host
  contract designates that path an authoring one;
- refuses with a machine-readable document-law reason; every region it
  discloses carries its law, and its intent wherever the disclosed range
  lies within exactly one region;
- fails closed on faults, per the binding, and discloses them as an
  ordered list — each fault with its mode and its location, multiplicity
  never deduplicated away. The mode vocabulary is exact and closed:
  `unpaired_marker`, `malformed_marker`, `unknown_law`,
  `unknown_version`, `intent_over_bound`, and for text carriers
  `invalid_utf8`. When a document is in fault, any regions a reader still
  reports are diagnostic disclosure for repair — no region is in force,
  and the working hand's law is `keep` for the document entire.

Three grammar edge cases are settled by vector: the version is judged
before anything else on the marker line, so a bare `<!-- will/2 -->` is
`unknown_version`, never `malformed_marker`
(`PARSE-FAULT-PRECEDENCE-VERSION-BARE`); a marker with a missing law word
(`<!-- will/1 : x -->`) is `malformed_marker`, never `unknown_law`
(`PARSE-FAULT-MISSING-LAW-WORD`); the version token is the bytes after
`will/` up to the first ASCII space, so a tab inside it is part of the
token and `<!-- will/1<TAB>keep -->` is `unknown_version`, never
`malformed_marker` (`PARSE-FAULT-VERSION-TOKEN-TAB`).

An enforcing editor judges at least the bytes a change moves and may judge
everything the change's authority covers; a change refused for its
authority's reach is refused with the same document-law reason.

**Coordinates and fault order are exact, not host-defined.** Byte spans
are zero-based, half-open `[start, end)` offsets; line and region
indexes are zero-based. Faults are disclosed in document order by their
span's start — never sorted by mode, never deduplicated, never
collapsed to one primary fault. A byte sequence that cannot decode as
strict UTF-8 is exactly one fault, at the first malformed sequence, and
reading stops there: later faults are never discovered. Once decoding
succeeds, one marker-shaped line that cannot be read exactly is exactly
one fault for that line, whichever single check it first fails; several
such lines are each still exactly one fault, in the order their spans
begin.

A conformance evaluator's answer is one of exactly three families:
`invalid` — the question itself was malformed (a splice whose shape,
range, or overlap breaks the witness contract, a splices value that is
not a list at all, an unknown path) and no law was consulted; `applied`; `refused`, with the document-law reason.
Malformed questions are never dressed as document law, and no input may
crash the evaluator out of answering.

## Unaware software, and conversion

A program that does not know Will makes no promise: if it preserves the
format's metadata, Will rides along silently; if it strips unknown
metadata, the Will is gone, and no visible scaffolding is added to
pretend otherwise. A **Will-aware** converter or editor must carry
equivalent Will into its output, explicitly report **WILL LOST**, or
refuse — never silently drop an annotation, and never invent a stricter
one to cover what it failed to map.

## Conformance

Outcomes, never internals. An enforcing editor declares, at its boundary:

```text
keep:    any working-path change inside the region → refused
append:  region grows at its end, rest intact      → applied
append:  anything else                             → refused
edit:    working-path change                       → applied
a working path touches marker bytes or moves a pair → refused
overlapping regions                                → fault, fail closed
region or annotation unreadable                    → reported, fail closed
an act reaching several regions                    → every region's own law
an authoring path, any of the above                → unrestricted
aware conversion                                   → preserved, or WILL LOST
```

When one act touches the markers of several regions the refusal is one,
and it names the first touched region in document order with that
region's own law — never the later one, never the stricter one; the act
is refused whole either way.

### Host obligations

Five outcomes only a full host can witness — never machine-checkable by
`parse` or `evaluate` alone, and so never vectors, but law all the same:

- **Conversion carries, discloses loss, or refuses** — witnessed at a
  converter, never at a text evaluator (see *Unaware software, and
  conversion*).
- **Every disclosure carries law, and intent where it resolves to one
  region** — witnessed at a host's disclosure surfaces (see
  *Enforcement*).
- **The will is never secret from the person** — witnessed at a host's
  UI (see *The whole standard*).
- **Invisible in rendering, exact in raw source, surfaced in UI** —
  witnessed at a renderer (see *Markdown*).
- **Byte stability under external formatters.** A correctly placed
  marker survives comment-preserving reformatting (prettier, remark, and
  their kin) byte-for-byte — witnessed against those tools directly, not
  this standard's own machinery.
- **The same words on every surface.** A host that offers an agent any
  way to change a document — a browser tool, an embed contract, a file
  API — reports this standard's outcome family there in this standard's
  words: `applied`, `refused` with the document-law reason, `invalid`
  for a request it could not read; and every disclosure names the law
  fact in this standard's names — `law`, `region`, `intent` where the
  range lies within one region, and `rule`. A host never uses a second
  word for the same fact on a different door, or invents one of its own
  for a fact this standard already names. Outcomes this standard does
  not define (shown bytes that have moved, a target that no longer
  exists, a person's decision on a held proposal) are the host's to
  name, once, beside these.

Everything else — review flows, undo, transaction grouping, UI mechanics
beyond the obligations above, how a path is declared authoring, how
final states are proven — is the host's own contract, outside this
standard.

## Bindings

A binding answers three questions for one format, with the format's own
native machinery — never a parallel database, never visible scaffolding:

1. **Region** — how a governed region is delimited and re-identified.
2. **Discovery** — the one canonical place a Will-aware reader looks first.
3. **Detachment** — what happens when Will cannot be resolved exactly.

How an implementation reads or writes the format underneath the binding is
its own business. The binding standardises the semantic fact and its
address, nothing more.

Three text-layer bindings — Markdown, DOCX, and PDF — establish
**text-layer marker lines** as the portable discovery statement: marker
text placed in the layer ordinary extraction delivers to a model, hidden
from the reader by the format's own means. Google Docs, below, is the
one named exception: it sits outside this count, not a fourth text-layer
binding. A region is delimited by a pair of markers — in a rich format
the markers declare the region while the core's governed-content rule
stands, and extraction is how the will is found, not the whole of what
`keep` keeps. **Reading the text layer discovers the will; enforcing the
will protects the document region, not merely its extraction.** The
formats differ only in how marker text is made invisible: Markdown and
HTML have comments, DOCX has hidden-text runs, PDF has non-rendering
text. The one surface no
binding can reach is a screenshot — rendered pixels alone carry no text
layer.

**A marker occupies exactly one unit of its carrier** — a line in a text
format, a paragraph in DOCX, one text object on one baseline in PDF.
"Whole line" is the text carrier's projection of this law, not the law
itself. A tool that *reflows* extracted text — wrapping long lines,
re-breaking paragraphs — is performing a conversion, and conversion is
already governed: carry the will, or report WILL LOST. A reader meets the
will in the carrier's own units; a reflowed projection is a different
document.

**Bind the intended region. Resolve it later with evidence. If resolution
becomes ambiguous, detach or refuse rather than guess.** The marker text is
portable and discoverable; the binding does not prescribe the sole mechanism
for resolving a region's boundaries. A capable host may use the strongest
combination available — structure-tree identity, text witnesses, page
geometry, OCR layers, fingerprints, visual-region evidence for scans — while
the marker remains the portable discovery statement every agent sees; it
need not be the sole proof of region identity. The same honesty governs
enforcement: a host that cannot witness a rich region's governed content —
structure, emphasis, links, relationships — must not claim mechanical
`keep` enforcement over it; it exposes the agreement to the intelligence
and says plainly what it can and cannot prove.

### Markdown — `will/1` comment markers

**REFERENCE BINDING.** Carrier chosen from executed processor
experiments; placement rules reflect them. A reference
reader ships in the canonical Will repository (`reference/will.mjs`,
beside the normative `VECTORS.json`); a second reader written from this
text alone (`second-host/will.py`) passes the same vectors.

A region is the whole lines between a pair of HTML comments, each on its own
line:

```markdown
 <!-- will/1 keep -->
The approved sentence.
 <!-- /will -->

 <!-- will/1 append: chronological entries only -->
- 2026-08-30 decided X
 <!-- /will -->
```

*(The markers above carry one leading space so this spec quotes them
rather than governing itself.)*

- Opener: `<!-- will/1 <law> -->` or `<!-- will/1 <law>: <intent> -->`.
  Closer: `<!-- /will -->`. Law words are lowercase and permanent; the
  intent separator is a colon immediately after the law word, one space,
  then the rest of the line as intent, in ASCII. An em dash, an en dash, a
  bare hyphen, or an unspaced form is a fault, never a second spelling; a
  later colon inside the intent is not a second separator — the first `: `
  splits, and everything after it is intent, verbatim. The intent never
  contains `--`: a comment ends at the first `-->`, so a marker attempting
  more is a fault, never a region. `append` grows immediately before the
  closer — the pair gives a growing region an exact end. A single space
  between the colon and the closing `-->`, with no intent text at all, is
  malformed: the close delimiter's own leading space is the only space
  present, so the required `<law>: ` separator never actually appears.
- Placement: a marker is alone on its own line, opening and closing on
  that same line, with a blank line on each side; adjacent placement
  survives parsing but reformatters move it. A serializer writes markers
  only in this form — placement is the serializer's discipline, not a
  second recognition test.
- Pairs never nest or interleave. **The reserved namespace is exactly two
  prefixes**: a column-zero line beginning `<!-- will/` is an opener or a
  fault, and one beginning `<!-- /will` is a closer or a fault — an
  unclosed opener, an orphan closer, an unknown law word or version token,
  a malformed separator, a line whose own `-->` never arrives. Inside the
  namespace a near-miss is never silently ordinary content; outside it,
  ordinary prose that merely begins `<!-- will` — `<!-- willingness -->` —
  is content, never a marker and never a fault. The unspaced forms are
  inside the namespace too: a column-zero line beginning `<!--will/` or
  `<!--/will` is a fault, never silently ordinary content and never a
  marker — the canonical grammar keeps the space.
- **Recognition is Will's own grammar, not any Markdown parser's.** A
  marker is an exact whole line at column zero — no leading whitespace —
  matching the grammar above, wherever that line sits in the document:
  inside a fenced code block, below an unclosed fence, anywhere. Quote an
  example by indenting it one space, or by keeping it inside a code span;
  either moves the text off column zero, and off column zero is content,
  never a marker and never a fault. Quoting a *pair* means indenting
  **both** its markers — indenting only one strands the other at column
  zero, still a live marker, now orphaned and faulted on its own. A
  column-zero line inside the reserved namespace that is not exactly one
  well-formed marker is a fault, never silently ordinary content. An
  unclosed fence written above a pair cannot silence it: the
  fence-swallow attack is structurally impossible, and there is exactly
  one reading of a document's Will, never two. An enforcing editor still
  judges the resulting document, to prove that no line elsewhere in an
  edit's reach turned into a fresh marker of its own.
- **The governed interval is defined once**: from immediately after the
  opener line's terminator to immediately before the closer line's first
  byte. Exact bytes, strict UTF-8, LF and CRLF both recognised and neither
  ever normalised. No trimming, no inferred padding, on either side of any
  comparison. The single line terminator immediately before the closer
  belongs to the carrier, not the content —
  `append`'s prefix comparison excludes exactly that terminator, so a
  region's final line may grow; `keep` includes it, so converting its
  bytes still refuses.
- Markers are invisible in rendered Markdown, visible in raw source; a
  Will-aware editor surfaces law and intent through its own UI. A pipeline
  that strips comments strips the Will; the unaware-software rule applies.
- Markers carry no identity: a copied pair is the same will wherever it
  lands, and duplication collides with nothing.
- Whole-document Will is one pair around the whole document.

### DOCX — hidden-text marker lines

**LOCKED.** Carrier chosen from an executed
round-trip battery. Executed evidence: marker paragraphs written as
hidden runs are extracted verbatim, in order, by python-docx, and
recovered whole as paragraphs by pandoc's reader (whose plain-text
*writer* reflows long lines at its own column width — a conversion under
the reflow rule, not a carrier failure); they survive a LibreOffice
docx→docx resave and the docx→odt→docx hop that destroys Custom XML
Parts, with their hidden formatting intact; and they survive real
Microsoft Word's ordinary editing, Save As, the clipboard, and cloud
storage transit. Removal is exactly the documented Inspector path —
Document Inspector lists "Hidden Text — found — Remove All" — and it is
total: Remove All takes 4/4 markers to 0/0. An unaware PDF export omits
hidden text entirely by construction (0 markers, visible body intact);
**Google Docs' importer silently strips the carrier** (a Docs import
then re-export as DOCX returns 0/0). The binding earns *frozen* on the
day every legal reference will has a legal carrier here — the named gap
stands between astral-plane intent for PDF and Word Online co-authoring
for DOCX.

A marker is one paragraph containing a single hidden run (`w:vanish`),
whose text is exactly the marker line, **and whose paragraph mark is
hidden too** (`w:vanish` in the paragraph mark's own run properties) — so
the marker paragraph contributes no vertical space and a willed document
is layout-identical to its unwilled twin. Word reveals the hidden marker
only when a person deliberately searches for it: invisible in reading,
discoverable on purpose — both facts executed on real Word. A region is
the whole paragraphs between a pair: the markers declare it, and the
governed content is those paragraphs as Word holds them — structure,
emphasis, links and all — with their extracted text as the discovery
layer. Preserving the characters while rewriting what they carry is not
`keep`. The person sees an ordinary Word document; ordinary text
extraction sees the will. A person stripping hidden text through their own
tools is the authoring path exercising the one authority the will never
binds.

### Google Docs — named ranges

**THE NAMED EXCEPTION.** The format offers no text-layer carrier of its
own, and its importer destroys the one DOCX travels in — executed: a Word
document carrying 4/4 markers imports into Google Docs and re-exports as
DOCX with 0/0, silently. Google Docs therefore has an API carrier, named
ranges, and no text-layer binding; it sits below the bar the other three
bindings clear until Google offers a text-layer substrate.

Regions are Docs named ranges under a `will/1` naming convention — Google
maintains their positions through edits and exposes them to every
application with document access. Law and intent ride the smallest clean
carrier the live experiments select. Exports through a Will-aware converter
rebind to the destination binding or report WILL LOST.

### PDF — non-rendering text-layer marker lines

**LOCKED.** Frozen together with DOCX (see *DOCX*).

A marker is **one text object on one baseline**, in text rendering mode
3 — unpainted by ordinary page rendering while still meeting search,
copy, and accessibility readers — placed at **the same horizontal
reading-flow column as the governed text**, never a separate margin
column, on a **boundary baseline strictly between two visible lines that
consumes none of the document's own vertical flow**: a writer computes
every visible line's position from the count of visible lines alone,
never from how many markers accompany them. One baseline and in-bounds
are normative, not stylistic: common extractors drop glyphs positioned
beyond the page box, and a marker broken across text objects stops being
one carrier unit. `Tr` persists in the graphics state across `BT`/`ET`,
so a writer restores mode 0 after each marker or wraps it in its own
`q`/`Q`.

The font carrying marker text must provide a **lossless `ToUnicode`
mapping for every scalar the marker's law word and intent actually
contain.** A base-14 WinAnsi font (Helvetica among them) cannot represent
a scalar outside Latin-1 at all — such a marker does not render wrong,
it *extracts* wrong, which corrupts the will a reading agent receives.
A writer meets this requirement by embedding a real Unicode font
(subsetted TrueType or OpenType, its own generated `ToUnicode` CMap)
rather than relying on a base encoding.

Executed evidence (`examples/verify_pdf.py`): under **both** pypdf and
pdfminer, this document's own willed.pdf extracts to **exactly two
regions, zero faults**, with the keep region's governed text recovering
as exactly `The approved sentence.` and the append region's as exactly
its decision-log line. Layout identity is proven **structurally**, not
by pixel comparison: the willed page's own content stream, with its
invisible marker text objects stripped out, is byte-for-byte equal to
its unwilled twin's content stream. An intent containing Latin text, a
genuinely decomposed combining mark, CJK (a second embedded font
switched to mid-object without moving the baseline), and right-to-left
text (Hebrew, Arabic) recovers byte-for-byte through both extractors; a
maximal 512-Unicode-scalar-value intent — the law word plus a full
512-scalar intent — measures 298.8pt wide at 1pt against 540pt of usable
width from the marker's own x column to the page's right edge (a
612pt-wide US Letter page), stays one carrier unit, and recovers
losslessly. Astral-plane scalars (Unicode code points above U+FFFF) are
unproven by this battery: the writer library its rig used embeds only
256-glyph simple font subsets and mis-encodes any code point above
U+FFFF in its own generated `ToUnicode` CMap — a tool defect
(`examples/README.md`), not a relaxation of the requirement above, which
binds every conformant writer regardless of what one library's current
output can produce. Poppler (`pdftotext`) is not installed in the
environment this evidence was executed in and is therefore not claimed.

(Prior-form evidence: marker lines written in text rendering mode 3
survived Ghostscript pdfwrite, qpdf relinearisation, and Acrobat's own
full rewrite on Save As — 2+2 markers, 407 characters of text layer
intact.) Browser print-to-PDF regeneration destroys the entire text
layer — 0 markers, 0 extractable characters — which makes it both the
loss hop and the ordinary person's removal path: free Acrobat's Sanitize
/ Remove Hidden Information tool is paywalled behind Acrobat Pro, so an
ordinary user cannot deliberately sanitize a PDF at all.

Discovery holds under logical-order extraction — the order the writer
drew, which both required libraries provide. A visual-order projection
reorders bidirectional text — anyone's Hebrew, anyone's Arabic, will or
prose alike — and a marker interleaved by someone else's bidi pass is
that projection's loss, not this carrier's: the reflow rule already
governs it. A Will-aware reader of PDF asks for logical order first.

A region is declared by a pair; its extracted text is the discovery
layer and the least any enforcing host holds `keep` to, and a host that can
witness more of the page — geometry, links, structure — holds `keep` to
what it can prove. `append` in a fixed layout means growing a region by
regenerating content streams, so an enforcing host that cannot restructure
the page refuses `append` mechanically — while the agreement still speaks
to any capable agent that reads it. Pipelines that rebuild pages —
print-to-PDF, OCR reprocessing — may lose the will; that is the WILL LOST
rule doing its job.

## What this is not

Not access control for people. Not DRM. Not encryption, signing, provenance,
or identity. Not a prompt, a policy language, a workflow engine, an agent
framework, or a registry. Not a Markdown extension — the marker line is
plain text that happens to be a Markdown comment, and Markdown is one of
three text-layer bindings. Three laws and one line of words, gaining more
only when a real document demands them.

## The one-breath version

> Will is the person's word hidden in the document's own text: this region
> may be edited, only added to, or kept — plus whatever they want the next
> agent to know. Whoever receives the document's text receives the will
> with it.
