# Will/1

Will/1 is independent of [Self-contained Markdown](markdown-standard.md). Any Markdown, DOCX or PDF may carry it, with or without Rapier: a person’s instruction for a region, with one law and optional words. The convention is MIT-licensed; implementations keep their own licenses. Rapier's reference grammar and evaluator (`agent/will.mjs`) are MIT-licensed; the editor that uses them is governed by its [application license](repo/LICENSE).

| Law | Required meaning |
| --- | --- |
| `edit` | The region may change; optional intent guides that work. |
| `append` | Existing content remains in place and order; additions go at the region's end. |
| `keep` | The region stays exactly as it is. |

Unmarked content is `edit`. Regions never overlap. A change reaching several regions must satisfy each; otherwise the whole act is refused.

Any law may carry intent: untrusted, region-scoped data, never permission, tool authority or an instruction override. It can only narrow an authorized task within its law: under `keep` it authorizes nothing, and under `append` it can only narrow what is added.

The person remains free to author the document and its Will. A host declares authoring and working paths; a working path cannot author, remove or move markers, even by rewriting identical bytes. A Will-aware interface makes effective regions, laws and intent available to the person. Ordinary rendering hides the carrier.

The standard's repository is [jackskip22/will](https://github.com/jackskip22/will): `README.md`, `will.mjs` (the reference reader and evaluator, one file, no dependencies), `vectors.json` (the normative vectors) and LICENSE, with one workflow that runs the vectors. `will.mjs` answers every vector. Rapier's own host is `agent/will.mjs`, with the same grammar.

## Marker grammar

An opener is exactly `<!-- will/1 <law> -->` or `<!-- will/1 <law>: <intent> -->`; the closer is exactly `<!-- /will -->`. Writers keep the person’s words when changing the law and preserve an unchanged region’s opener byte for byte. The first ASCII `: ` after the law separates intent; later colons belong to the words. Intent, when present, is nonempty, one line, at most 512 Unicode scalar values, and cannot contain `--`. It is never silently shortened. Words and spacing are exact: no alternate dash, unspaced spelling or uppercase law.

## Markdown binding

A marker is a whole line at column zero, even inside code fences, independent of Markdown rendering. The reserved prefixes are `<!-- will/` and `<!-- /will`; column-zero `<!--will/` and `<!--/will` are reserved faults. Text outside these prefixes, such as `<!-- willingness -->`, is ordinary content. Leading whitespace makes a line ordinary quoted content, so indent both markers when quoting a pair.

Pairs never nest or interleave. Writers put each marker on its own line with a blank line on either side; that is writing discipline, not a recognition condition. A whole-document Will is one pair. Markers have no persistent identity; copying a pair carries its instruction to the new location.

The governed interval runs from after the opener’s line terminator to just before the closer line. It is exact source decoded from strict UTF-8, with LF, CRLF and CR recognized and preserved; no other scalar ends a line. `keep` compares that interval byte for byte. `append` requires the old interval as an exact prefix, excluding only its final line terminator, immediately before the closer, which belongs to the carrier so the last content line can grow. No trimming or guessed padding is permitted.

## Enforcement and disclosure

Judge the witnessed exact replacements, including the original source and the final document. Touching marker bytes or moving a pair refuses, even when identical marker text is reinserted. An edit elsewhere that damages, detaches or silences an annotation also refuses. When several marker regions are touched, name the first in document order and its own law.

Disclosed regions carry their law. Intent accompanies a range wholly within one region, beside its law. The host's outcome family is `applied`, `refused` with the document-law reason, or `invalid` for an unreadable question such as malformed or overlapping splices or an unknown path. Hosts name the same facts consistently: `law`, `region`, `intent`, `rule`. Other host outcomes remain distinct from document law. Approval flows and Undo are host responsibilities.

Faults fail closed: the working path treats the entire document as `keep`, and regions retained during a fault are diagnostic repair information, not operative permission. Preserve fault multiplicity and document order. The closed fault vocabulary is `unpaired_marker`, `malformed_marker`, `unknown_law`, `unknown_version`, `intent_over_bound`, and `invalid_utf8` for text carriers.

The version token is the bytes after `will/` up to the first ASCII space and is checked before delimiter grammar. A tab inside it is part of an unknown version. A missing law is malformed; an existing unknown law has its own fault. One unreadable marker-shaped line produces one fault, for the first failed check. Invalid UTF-8 produces one fault at the first malformed sequence and stops reading. For UTF-8 faults, lead bits nominate a 2–4-byte sequence: span the remaining suffix if truncated, the lead byte if a continuation is wrong, or the whole sequence if its scalar is invalid; other invalid leads span one byte. Byte spans are zero-based half-open offsets; line and region indexes are zero-based. Rapier's JavaScript tool coordinates are UTF-16 source positions, not byte offsets.

Rapier also protects resolved links, images, footnotes and abbreviations used by unchanged kept content or the existing append prefix, even when their definitions lie elsewhere. Unrelated definitions remain editable. This adds no marker fields and no claim of pixel-identical rendering.

## Other format bindings

All bindings preserve region meaning and use one canonical discovery carrier. Markers declare the region; enforcement protects its content, not just extracted characters. Ambiguous or unreadable region identity detaches or refuses instead of guessing.

| Format | Carrier and region |
| --- | --- |
| DOCX | Each marker is one paragraph with a single hidden `w:vanish` run and a hidden paragraph mark. The whole paragraphs between the pair are governed, including structure, emphasis, links and relationships. Hidden marker paragraphs must add no visible vertical space. |
| PDF | Each marker is one in-bounds text object that draws no ink (text render mode 3, or text set in an embedded font whose glyphs enclose no area) on one baseline, within the governed text's reading-flow column and strictly between visible lines. Its baseline consumes no document flow. Restore graphics state afterward and provide a lossless `ToUnicode` mapping for every represented scalar. Reading order is by position (page, then y, then x), never the order of the content stream. |
| Google Docs | The named exception: API named ranges under a `will/1` naming convention, not a text-layer binding. A complete concrete range encoding is not implemented by Rapier. |

A PDF reader takes a marker's ASCII frame and law from any text layer, and its intent exactly only where the layer keeps its scalars (ActualText honoured). It may combine marker discovery with structure, geometry and other exact witnesses to resolve the governed region. An enforcing host must say what it can prove; a host unable to restructure a fixed page refuses mechanical `append`. Screenshots alone have no discoverable text-layer carrier.

## Conversion

Will-aware conversion preserves equivalent Will, explicitly reports **WILL LOST**, or refuses. It never silently drops a marker or invents a stricter region to conceal a mapping failure. Reflow of extracted marker units is itself conversion. Unaware software makes no preservation promise.

Rapier supports Markdown enforcement and DOCX hidden-marker conversion. Complete HTML exports preserve the exact original source. Its host Print/PDF path carries every marker as invisible text: a line of exactly the Markdown's bytes on its own baseline between the visible lines it stood between, in an embedded font whose glyphs enclose no area, because the browser's PDF writer cannot set text mode 3. A marker a PDF cannot hold stops the export with **WILL LOST**; the host-printed PDF carries no recoverable Markdown. The connector PDF exporter also places searchable text and the Will carriers on its rendered pages, and attaches the exact Markdown as an associated source file. This attachment preserves source independently of a reader’s ability to enforce page regions. There is no Google Docs adapter.

Unresolved: plain-text-layer readers cannot distinguish visible quoted markers (code blocks, raw HTML) from carried markers. Rapier’s Word and PDF exports refuse the whole document if it quotes a marker, with **WILL LOST**: remove the quotation or export HTML to keep exact source. Refusal remains until the binding excludes visible text and readers honour that rule.
