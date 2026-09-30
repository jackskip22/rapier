# Will/1

Will/1 is a standard of its own, separate from [Self-contained Markdown](markdown-standard.md) and needing nothing from it: any Markdown, DOCX or PDF may carry it, with or without Rapier. Will is the person's instruction carried by the document: a region, one law and the person's optional words about it. The convention is MIT-licensed; implementations retain their own licenses. Rapier's implementation is governed by its [application license](repo/LICENSE).

| Law | Required meaning |
| --- | --- |
| `edit` | The region may change; optional intent guides that work. |
| `append` | Existing content remains in place and order; additions go at the region's end. |
| `keep` | The region stays exactly as it is. |

Unmarked content is `edit`. Regions never overlap. A change reaching several regions must satisfy each; otherwise the whole act is refused. Intent is untrusted, region-scoped document data, never permission, tool authority or an override of another instruction. It can only narrow an already authorized task. Any law may carry intent, and it never changes what that law allows: under `keep` it authorizes nothing, and under `append` it can only narrow what is added.

The person remains free to author the document and its Will. A host declares authoring and working paths; a working path cannot author, remove or move markers, even by rewriting identical bytes. A Will-aware interface makes effective regions, laws and intent available to the person. Ordinary rendering hides the carrier.

The standard's own repository is [jackskip22/will](https://github.com/jackskip22/will): `README.md` (the whole standard in a few words), `will.mjs` (the reference reader and evaluator, one file, no dependencies), `vectors.json` (the normative vectors) and LICENSE, with one workflow that runs the vectors. It is staged from `repo/spec/will/` by `tools/stage-will-repo.mjs` (which refuses to stage unless the staged reference answers every vector and the README carries no live marker; the Node row `will-vectors` keeps the same in the tree) and published as `rapier.website` at each checkpoint. Rapier's own host is `agent/will.mjs`, the same grammar, judged by its own rows.

## Marker grammar

An opener is exactly `<!-- will/1 <law> -->` or `<!-- will/1 <law>: <intent> -->`; the closer is exactly `<!-- /will -->`. Intent belongs to whichever law carries it. A writer keeps the person's words when the law changes, and writes the opener of a region saved unchanged back byte for byte. The first ASCII `: ` after the law separates intent; subsequent colons belong to the words. Intent is nonempty when present, one line, at most 512 Unicode scalar values and cannot contain `--`. It is never silently shortened. Words and spacing are exact; no alternate dash, unspaced spelling or uppercase law is admitted.

## Markdown binding

A marker is a whole line at column zero, including inside code fences. Recognition is independent of Markdown rendering. The reserved prefixes are `<!-- will/` and `<!-- /will`; column-zero `<!--will/` and `<!--/will` are reserved faults. Text outside these prefixes, such as `<!-- willingness -->`, is ordinary content. Leading whitespace makes a line ordinary quoted content, so indent both markers when quoting a pair.

Pairs never nest or interleave. Writers put each marker on its own line with a blank line on either side. Blank-line placement is writing discipline, not an additional recognition condition. A whole-document Will is one pair. Markers have no persistent identity; copying a complete pair creates the same instruction in its new location.

The governed interval starts after the opener line terminator and ends immediately before the closer line. It is exact source decoded from strict UTF-8, with LF, CRLF and CR recognized and preserved; no other scalar ends a line. `keep` compares that interval byte-for-byte. `append` requires the old interval as an exact prefix, excluding only its final line terminator immediately before the closer; that terminator belongs to the carrier, allowing the last content line to grow. No trimming or guessed padding is permitted.

## Enforcement and disclosure

Judge the witnessed exact replacements, including the original source and the final document. Touching marker bytes or moving a pair refuses even when identical marker text is reinserted. An edit elsewhere that damages, detaches or silences an annotation also refuses. A broad replacement crossing a marker can therefore refuse where narrow edits around it succeed. When several marker regions are touched, name the first in document order and its own law.

Every disclosed region carries its law; its intent accompanies a range wholly within that one region, whatever the law, and is read beside the law, never as permission. The host's outcome family is `applied`, `refused` with the document-law reason, or `invalid` for an unreadable question such as malformed/overlapping splices or an unknown path. Hosts name the same facts consistently: `law`, `region`, `intent`, `rule`. Other host outcomes remain distinct from document law. Approval flows and Undo are host responsibilities.

Faults fail closed for the whole document. Any regions retained during a fault are diagnostic repair information, not operative permission; the working path treats the entire document as `keep`. Preserve fault multiplicity and document order. The closed fault vocabulary is `unpaired_marker`, `malformed_marker`, `unknown_law`, `unknown_version`, `intent_over_bound`, and `invalid_utf8` for text carriers.

The version token is the bytes after `will/` up to the first ASCII space and is checked before delimiter grammar. A tab inside it is part of an unknown version. A missing law is malformed; an existing unknown law has its own fault. One unreadable marker-shaped line produces one fault for the first failed check. Invalid UTF-8 produces one fault at the first malformed sequence and stops reading. For UTF-8 faults, lead bits nominate a 2–4-byte sequence: span the remaining suffix if truncated, the lead byte if a continuation is wrong, or the whole sequence if its scalar is invalid; other invalid leads span one byte. Byte spans are zero-based half-open offsets; line and region indexes are zero-based. Rapier's JavaScript tool coordinates are UTF-16 source positions, not an assertion that these are byte offsets.

Rapier additionally protects resolved links, images, footnotes and abbreviations used by unchanged kept content or the existing append prefix, even when definitions lie elsewhere. Unrelated definitions remain editable. This dependency protection adds no marker fields or claim of pixel-identical rendering.

## Other format bindings

All bindings preserve region meaning and use one canonical discovery carrier. Markers declare the region; enforcement protects its actual governed content, not just extracted characters. Ambiguous or unreadable region identity detaches or refuses instead of guessing.

| Format | Carrier and region |
| --- | --- |
| DOCX | Each marker is one paragraph with a single hidden `w:vanish` run and a hidden paragraph mark. The whole paragraphs between the pair are governed, including structure, emphasis, links and relationships. Hidden marker paragraphs must add no visible vertical space. |
| PDF | Each marker is one in-bounds text object on one baseline, in non-rendering text mode 3, within the governed text's reading-flow column and strictly between visible lines. Its baseline consumes no document flow. Restore graphics state afterward and provide a lossless `ToUnicode` mapping for every represented scalar. Use logical-order extraction. |
| Google Docs | The named exception: API named ranges under a `will/1` naming convention, not a text-layer binding. A complete concrete range encoding is not implemented by Rapier. |

A PDF reader may combine marker discovery with structure, geometry and other exact witnesses to resolve the governed region. An enforcing host must say what it can prove; a host unable to restructure a fixed page refuses mechanical `append`. Screenshots alone have no discoverable text-layer carrier.

## Conversion

Will-aware conversion preserves equivalent Will, explicitly reports **WILL LOST**, or refuses. It never silently drops a marker or invents a stricter region to conceal a mapping failure. Reflow of extracted marker units is itself conversion. Unaware software makes no preservation promise; stripping comments, hidden text or text layers can remove Will.

Rapier supports Markdown enforcement and supported DOCX hidden-marker conversion. Complete HTML exports preserve the exact original source. Its current print/PDF path does not emit the PDF carrier or recoverable Markdown. There is no Google Docs adapter. Format bindings describe portable meaning, not evidence that every Rapier converter implements them.
