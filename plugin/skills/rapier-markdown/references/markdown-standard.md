# Self-contained Markdown

**Open convention · v1**

One UTF-8 `.md` file holds the document and every image. CommonMark is the
foundation; GFM may add tables, tasks and strikethrough. Images use CommonMark
reference definitions with Base64 data URLs. Layout uses an optional
`md-layout:v1` comment. The [Markdown profile](markdown-profile.md) classifies
Rapier’s other extensions, read syntax and invisible conventions.

The source owns content, reading order and layout. One reference scale (see "The reference scale") sizes the type, the
lines and every placement, on every surface; the renderer supplies the column. No application, account, service or rendering engine is required.

Three layers, each complete without the next. **The core** is CommonMark and GFM.
**The conventions** are the layout comment, text colour, page break and picture
appendix, carried by HTML comments or ordinary references. **Will** is separate:
[Will/1](will.md) is an optional, independently versioned standard for a person’s
instruction to an agent about what may change. **The style pack** is an optional
companion: one MIT stylesheet, shipped with the kit and exported page, rendering
lists, tables, pictures and layouts, colour, highlights, diagrams and math as Rapier does.

## Measured against the specification

Rapier's parser passes 648 of 652 CommonMark 0.31.2 examples (99.39%) and 650 of 672 GFM examples (96.73%; 17 of the 24 extension-section examples), and the editor's source model round-trips all 1,324 specification sources byte for byte with no normalization. This is parser output, not a claim of complete CommonMark conformance. The deliberate difference is interactive task-list controls (GFM examples 279 and 280).

## Layout

Attach one trailing comment to a paragraph or heading:

```md
A centered paragraph. <!--md-layout:v1 align=center-->

## A right-aligned heading <!--md-layout:v1 align=right-->
```

For image layout, put the image in its own paragraph. Alt text describes it;
one comment carries layout. Here `<payload>` means Base64 image bytes.

```md
![Site photograph][photo] <!--md-layout:v1 width=47% align=center-->

![Site photograph][photo] <!--md-layout:v1 width=47% x=72%-->

![Site photograph][photo] <!--md-layout:v1 width=47% wrap=around x=72% y=2.4em-->

![Site photograph][photo] <!--md-layout:v1 width=47% wrap=around x=72% rotate=15deg-->

![Site photograph][photo] <!--md-layout:v1 width=47% wrap=behind x=50% opacity=30%-->

![W][initial] <!--md-layout:v1 lines=3 wrap=around-->

Following prose can flow above, beside and below the picture.

[photo]: data:image/jxl;base64,<payload>
```

| Field | Values | Meaning |
| --- | --- | --- |
| `align` | `left`, `center`, `right`, `justify` | Paragraph or heading alignment; `justify` is text-only. |
| `width` | Decimal percentage greater than `0%`, at most `100%` | Image width relative to the content box, preserving aspect ratio. |
| `lines` | Whole number from `1` to `12` | Image height in lines of the text beside it, set as a drop cap is: its top on the first line's cap height, its foot on the Nth line's baseline (see "The line"); width follows the aspect ratio, capped at the content box. Never with `width`. |
| `wrap` | `around`, `box`, `behind`, `front` | Neighboring text may flow around the image silhouette (`around`) or its tight, angle-tilted bounding box (`box`); or the image may leave the flow entirely, positioned like a wrapped image but painted under (`behind`) or over (`front`) the words, which lay out as though it were absent. |
| `x` | Decimal percentage from `0%` to `100%` | Image's requested horizontal center within the content box; requires `width` or `wrap`. |
| `y` | Finite decimal followed by `em`, optionally negative (never below `-50em`; zero is written unsigned and omitted) | Wrapped image's requested top inset within its anchor paragraph, measured in that paragraph's font size; a negative value lifts the picture above the paragraph's first line. |
| `rotate` | Integer or one-decimal-place decimal followed by `deg`, greater than `-180` and at most `180` | Image's clockwise turn in degrees about its own centre; omitted when `0`. Valid alongside any placement (inline, any `wrap`, or `align`) and on its own. |
| `opacity` | Whole percentage from `5%` to `100%` | Image's fade: the whole picture is drawn at this opacity over whatever lies beneath it; omitted at `100%`. The picture's own bytes, and its own transparent parts, never change. Valid alongside any placement and on its own. |
| `lock` | `on` only | The picture is locked in place: in Rapier a tap on it goes to the words around it and never selects it, and a hold takes it so it can be unlocked. Omitted when unlocked. Other renderers ignore it. |
| `first` | Whole number from `1` to `4` | A paragraph's first-line indent, in steps of `2em`; omitted when `0`. Text only: a paragraph (a heading ignores it), never a picture. |
| `indent` | Whole number from `1` to `4` | A paragraph's indent from its start edge, in steps of `2em`; omitted when `0`. Text only. |

Text uses only `align`, `first` and `indent`; pictures use neither `first` nor `indent`. A picture is sized by `width` or by `lines`, never both. Images have exactly three modes: normal flow with optional
`width` (or `lines`) and either `align` or `x`; wrapped flow with `wrap=around` or `wrap=box` and optional
`width`, `x` and `y`, with text reflow; and out-of-flow placement
with `wrap=behind` or `wrap=front` and the same optional `width`, `x` and `y`, with text ignoring the image. Normal-flow `x` requires `width`;
`y` always requires a `wrap` value. `align` cannot coexist with `wrap` or `x`. A normal-flow
horizontal position does not change the image's source order or reserve floating space beside it.
`rotate` and `opacity` are independent of every other field and every mode; neither requires or
excludes `width`, `wrap`, `x`, `y` or `align`. A fade never changes the flow: `wrap=around` follows
the picture's own silhouette at any `opacity`.

Any raster or foreign SVG the writer did not compose carries its turn as `rotate` to keep its bytes lossless: the picture's reserved space becomes its
turned bounding box, `w·|cos|+h·|sin|` wide and `w·|sin|+h·|cos|` tall for a `w`×`h` picture rotated
`rotate` degrees, centred where the unturned picture's centre was. An editable drawing (an SVG the compliant editor wrote and can still edit) turns its geometry and writes no `rotate`.

Absent alignment means natural/default alignment, including the Unicode first-strong writing
direction of the block (HTML `dir=auto` semantics on the rendered projection; source stays
plain Unicode). Explicit `left` and `right` mean physical sides and survive writing. Without `width`, an image uses its
intrinsic width constrained to the content box. A wrapped image without `x`
starts at the left edge. Renderers clamp the displayed rectangle to the
available width without rewriting source.

The next text block in the same container anchors the image, or the preceding
one if none follows; skip image paragraphs and empty paragraphs. Paragraphs, headings, lists, quotes/callouts,
definition lists and expanding sections can anchor a picture, including text
with links and checkboxes. Tables, code, figures, mathematics and rules remain
barriers. `y` is an inset from the text block's content top; absence means zero.
A renderer clamps the requested top to the block's unwrapped content height
before converting to pixels. Crossing into another text block changes the
anchor and rebases the inset. An image with no eligible neighbour either way
stays in normal flow. There are no page coordinates or saved line fragments.

Wrapping permits text above, on either available side and below the image,
in source reading order. A renderer may derive the silhouette from
image alpha or editable drawing geometry, keeping separate horizontal runs around gaps. A rectangle remains a valid conservative fallback; for a rotated
drawing the `box` rectangle tilts with it. Beside the anchor, every prose paragraph
and heading the image reaches flows around it, and a list, a quote or a
details block shortens its own lines beside it while staying intact as a
structure; a table, code, a rule, a figure or mathematics stays whole below or
beside the image. Fonts, spacing and precise line
breaks follow the reference scale below and the column's width; collision avoidance may adjust displayed geometry
without rewriting source.

`wrap=behind` and `wrap=front` use wrapped positioning (`x`, `y`, `width`) while the anchor and
following blocks ignore the image. `behind` paints under words without dimming; `front` paints over them.

### Attachment and writing

The marker is one line beginning exactly `<!--md-layout:v1`, with one or more
unquoted `key=value` fields separated by ASCII spaces or tabs, ending `-->`. Each key
occurs once. `lines` is one or two digits with no leading zero, `1` to `12`, with no sign, decimal point or unit. Geometry uses decimal digits, optionally followed by a
decimal point and digits, then `%` for `width`/`x` or `em` for `y`; no leading
zeroes except `0`, plus signs or exponent notation. `y` may begin with `-`, within
its stated range. Horizontal whitespace before the close is accepted. `rotate` also accepts an optional leading
`-`, then the same unsigned digits as the others but at most one decimal
place, then `deg`; no `+`, no exponent, no `°` sign, and no `-0deg` (zero is
always unsigned, like `y=0em`). `opacity` is a whole number with no leading zero, then `%`. `first` and `indent` are one digit, `1` to `4`,
with no sign, decimal point or unit.

Interpret a marker only when it is the final meaningful inline token of its
paragraph or heading. For ATX headings it precedes optional closing hashes;
for Setext headings it follows the text, above the underline. Nested paragraphs
follow the same rule. A standalone comment governs nothing; code remains code.
Image fields require a paragraph containing one image, optionally enclosed by
one link, plus whitespace and its marker.

Unknown versions or keys, repeated keys, invalid values, invalid attachment
and multiple layout-family comments in one block are inert and preserved. A reader
that does not know a field or value treats the whole comment as invalid and shows the
picture inline and upright, at its own natural size.
Writers emit one marker, lowercase keys, one ASCII space between fields, and
key order `align width lines wrap x y rotate opacity first indent`. Remove insignificant decimal trailing zeroes
and omit `y=0em`, `rotate=0deg` and `opacity=100%`; remove the marker when no fields remain. Only an intentional edit changes
source; opening, rendering and viewport resizing never normalize it.

### Conformance rungs

Readers claiming one of the first three rungs must show its stated behavior. Rung 3 is the kit’s
implementation profile.

**Rung 0: any CommonMark reader.** CommonMark hides layout comments as ordinary HTML comments. A picture shows inline, upright and solid, at the reader's own default width.
`align`, `x`, `y`, `wrap`, `lines`, `rotate`, `opacity`, `first` and `indent` are all invisible.

**Rung 1: position and size.** `align` sets text alignment. `first` and `indent` set a paragraph's first-line indent and its indent from the
start edge, each level `2em` (CSS `text-indent` and `margin-inline-start`). `width` and `x` size and place a
picture in normal flow (see "For image layout" above), and `opacity` fades it with CSS `opacity`. `lines` sets the
picture's height to `calc((N - 1) * var(--md-line) + 1cap)` with `width: auto` (see "The line"). `rotate` alone, without `wrap`, stays upright at this rung: a raster’s turn is layout, not changed
pixels, and degrades like an unrecognized field.

**Rung 2: placement in ordinary CSS.** Each `wrap` value has one conforming rendering:

| `wrap` | Conforming CSS |
| --- | --- |
| `around` | `float: left` or `float: right` (from `x`) with `shape-outside: url(<the picture>)` and a `shape-image-threshold` near the standard's own 10% alpha cutoff; text wraps to the picture's silhouette. |
| `box` | The same float, with no `shape-outside`: text wraps to the plain rectangle. |
| `behind` | The picture positioned (`x`, `y`, `width`) with `z-index` below the text; the anchor paragraph and everything after it lay out exactly as though it were absent. |
| `front` | The same positioning, `z-index` above the text. |

A `rotate`d picture is turned for display with a CSS `transform`, but a transform is a painting-stage
operation: it never feeds back into layout or into what `shape-outside` samples (CSS Transforms;
CSS Shapes, "relation to box model and float behavior"). Turning the picture while leaving its `shape-outside`/float rectangle unrotated does not conform. A conforming rung-2 reader instead computes the
*turned* shape and supplies that directly: `shape-outside: polygon(...)` built from the rotated
bounding box's own corners (the size given above), or the same
turned rectangle as a plain float with no shape for `wrap=box`. What a rung-2 reader does not get:
words on both sides of one picture, words inside a picture's own unfilled interior, or line-exact
agreement with Rapier. Exact lines are not required.

**Rung 3: the same lines Rapier shows.** The drop-in module (the `rapier-markdown-kit` package, [standard-adoption](standard-adoption.md),
"The drop-in module") plans lines exactly as Rapier's own live view and styled export do, up to font
metrics; the module is deterministic given its measurer. This is the only rung that reproduces both-sides wrapping and an interior wrap.
A rung-3 reader keeps the reference scale; exact line breaks below rung 3 are a recommendation, not a requirement.

### The line

One length measures the page: the line, `--md-line`, the body's line box (see "Reference style" below). Body text
sits on it, blocks are spaced in it, front matter's `linestretch` sets it, and a picture can be measured in it.

A picture with `lines=N` is as tall as N lines of its anchor text, set the way a drop cap is (CSS `initial-letter`):
its top on the first line's cap height, its foot on the Nth line's baseline. Its height is therefore N - 1 lines and
one cap height, and its width follows its aspect ratio, capped at the content box. With a `wrap`, `y` insets the
picture from that cap height instead of the block's top, so `lines=5 wrap=around` with no `y` is a five-line initial
whose words run beside it on exactly five lines. A larger text size, a face with a different cap height or a
`linestretch` changes the line, and the picture follows it everywhere the document is shown: the editor, the exported
page, print and Word. In normal flow, the line and cap are the picture's own paragraph's.

```md
![W][initial] <!--md-layout:v1 lines=5 wrap=around-->

ith a decorative letter the paragraph opens on five lines, at any text size.
```

A renderer finds the first line's cap height from the anchor's font: with the half-leading model the baseline sits
`(line - (ascent + descent)) / 2 + ascent` below the line box's top, and the cap height `cap` above the baseline.
Word takes its body and its line from the reference scale (13.2 pt on 21 pt at M) and a cap of 0.7 of the body. A resize gesture on a picture sized in lines beside its words
changes it a whole line at a time; resized anywhere else, it takes a `width` instead.

### The reference scale

One unit, `--md-unit`, sizes everything the format and the reference style set. It is 16 CSS px (12 pt) at Rapier's
default text size, M, on every surface: the editor, the exported page, print, the PDF and Word.

| In units | At M |
| --- | --- |
| Body type (`--md-text-body`): 1.1 | 17.6 px, 13.2 pt |
| The line (`--md-line`): 1.75 | 28 px, 21 pt |
| `fontsize: Npt`: N / 12 | 12pt is one unit |
| The standoff from a wrapped picture to a word or to another picture: 0.625 | 10 px |
| Every other length of the reference style (spacing, indents, list markers, borders that narrow a line) | as `spec/markdown-style.css` states it |

Placement is relative: `width` and `x` are percentages of the column, `y`, `first` and `indent` ems of the anchor's
type, `lines` lines of the anchor. The column is the renderer's: the screen, the window or the paper's text width.

The rule: **at M, a renderer with the same column width and the same face breaks the same words and stands every picture
beside the same words.** Rapier's other text sizes, S, L and XL, multiply the unit by 0.818, 1.136 and 1.273. Everything
grows or shrinks together and the words re-wrap in the same column. A conforming renderer MUST size type, lines,
spacing and the standoff in the unit, and MUST NOT size any of them in device pixels.

**The measure.** The column fills a narrow screen; on a wide one it stops at a reading measure of 39.6 rem (36 ems of the
body at M, about 70 characters, 633.6 px) and is centred. The measure does not grow with the step, so a larger step
re-wraps, as on a phone. Paper's column is its text width. **A narrow column.** No line beside a picture is narrower than
3.5 ems of its type (`wrapColumnFloor`); where the room is narrower, the words continue below the picture. One document
holds for every screen: there is no second layout for a phone or a desktop. Across column widths the promise is
proportional, not identical: the same sizes, the same placements and the same picture against its words.

## Embedded images

An image occurrence names an ordinary [CommonMark reference definition](https://spec.commonmark.org/0.31.2/#link-reference-definitions).
The definition holds its bytes in a Base64 data URL:

```md
Here is the diagram.

![Site photograph][photo] <!--md-layout:v1 width=47% align=center-->

Later prose stays readable.

[photo]: data:image/jxl;base64,<payload>
```

A drawing or diagram is never a raster: an editable drawing is the SVG the editor wrote, kept as SVG. The
choice below is for rasters, photographs, paintings and pasted pictures:

| Image choice | Definition destination |
| --- | --- |
| JPEG XL (default) | `data:image/jxl;base64,<payload>` |
| Original PNG, JPEG or WebP | `data:image/png;base64,<payload>`, `data:image/jpeg;base64,<payload>` or `data:image/webp;base64,<payload>` |

No custom image URI, payload comment or binary encoding is used. Dimensions come from the image, with no second metadata header.

Writers append new definitions at the end of the file, separated from prose by
a blank line, with each data URL on one line. Repeated occurrences reuse one
definition for identical image bytes and reference title. Titles belong to the
definition, following CommonMark; alt text and layout belong to each occurrence.
Moving, resizing or describing an image never re-encodes its bytes.

Any valid CommonMark label works. A writer may derive labels from image hashes
to deduplicate bytes; this is an implementation choice, not a required label
syntax or a reader integrity check. Definitions follow ordinary CommonMark
resolution, wherever they appear in the source. Inline data-image destinations
remain ordinary Markdown too.

## Will, a separate standard

Where [Will/1](will.md) and layout share a file, each keeps its recognition rules: layout through
Markdown tokens; Will as marker lines at column zero, even in code fences. Neither grants the other
anything; Save keeps one source.
What each export keeps of the layout is in `standard-adoption.md`; of Will, in [Will/1](will.md), "Conversion".

## Text colour

A coloured run is a paired HTML comment around the text:

```md
Buy <!--c green-->mushrooms<!--/c--> today, or <!--c #35c57a-->minty<!--/c--> ones.
```

The opener carries one value: one of the picker’s five names (green, red, blue, gold, purple) or
exactly one lowercase six-digit hex, the colour as chosen for a light page; the closer is
`<!--/c-->`. A reader on a dark page derives its own lighter tone from the same value. Pairs do not nest or escape their enclosing inline container; a second opener before the first closer, or a
closer without an opener, stays ordinary comment text and shows nothing. A run may begin at the
first character of a paragraph; a renderer that follows CommonMark's HTML-block rule then shows
that line's words plain (a comment is invisible in HTML) and loses only that line's inline
Markdown. Stripping comments loses colour, not words.

## Ink

A pen stroke surrounds words with paired HTML comments, like colour spans, with the stroke in the opener:

```md
We feed punchcards: <!--ink ring red box=1180,140 -20,-15 1220,0 0,170 -1220,0 -1,-160-->one input, one output<!--/ink-->.
```

The opener carries, in this order with one space between: the kind (`under`, `strike`, `ring`, `bracket` or
`free`), decided once when the stroke was lifted and never re-read from a later layout; optionally the colour,
exactly as the text-colour opener spells it (a name or a lowercase six-digit hex), red when absent; optionally
`w=N`, the pen's width counted as Draw counts a nib, an integer from 2 to 24, drawn 0.11 em wide at the default
of 9 (which is never written: an absent `w` is 9) and in proportion to N otherwise; optionally `box=W,H`, the size of the frame the stroke was drawn against (the marked words' box, or the stroke's own for a
free mark); optionally `at=X,Y`, the frame's offset from the marked words' box for a `bracket` or `free` mark;
and the path, its first point absolute in the frame and every later one a move from the point before. Every
number is an integer in hundredths of an em; a path holds at most 160 points. The closer is `<!--/ink-->`.
Ink pairs may nest: each closer belongs to the nearest unclosed ink opener. This lets independent strokes
share words without discarding an earlier stroke. An unpaired opener or closer stays ordinary comment text
and shows nothing. A comment that does not read exactly this way is not a mark. Colour pairs retain their
own non-nesting rule.

An `under` or `strike` may omit its path (`<!--ink under-->words<!--/ink-->`): layout derives a straight
stroke from each line fragment. A loop, bracket or free mark requires its authored path.

An arrow has two separately closed anchor spans, paired by a positive integer from 1 to 999999:

```md
<!--ink arrow 3-->tail words<!--/ink--> … <!--ink end 3-->head words<!--/ink-->
```

The `arrow` opener may carry the same colour, frame, offset and path fields after its number, in the
same order. Without a path it is a straight arrow. The `end` opener carries only its number. Exactly
one `arrow` and one `end` with that number form a mark; an absent or ambiguous mate draws nothing.
The two anchors may stand in different paragraphs and in either source order. Each anchor follows
its own words; layout derives the connection anew from their current line fragments, retaining the
stored shaft's bends and direction. Its head always points to the `end` words.

The inline algebra (`formatting-algebra.md` §§2–5) keeps an ink pair inside one enclosing inline
container. For equal ranges newly written together, highlight encloses ink, ink encloses colour, and
the ordinary bold, italic, underline and strike marks sit inside them. Existing legal nesting keeps its
original spelling. A crossing pair is not repaired into nesting. Code is a barrier: a stroke over it marks only the
surrounding stretches of words, never its contents or its delimiters. A link's words are words: the pair stands inside the
link's text (`[<!--ink under-->the docs<!--/ink-->](https://example.test)`), so the link's shell, destination and title stay
whole and the line never opens with a comment; a pair never crosses a link's edge. A stroke that no words can hold (a picture,
a fence, a drawing, the space between blocks) is a `free` mark on the nearest words that can.

Typing inside the span extends that same span without changing the recorded stroke. A paragraph break
closes it before the break and does not reopen it after; an empty prefix has no mark to keep. A soft or
hard line break within the paragraph keeps one pair, with pieces derived from the line fragments. A bracket beside several lines can remain one mark. Opening and saving preserve authored bytes,
including unsupported spellings.

Find and Replace All read a mark's words across its two comments: a phrase may run over the opener or the
closer and is one hit; a replacement keeps each comment that still has words inside it, byte for byte, with
the mark of the hit's first character; and a pair whose words all go goes with them. An agent's edit through
the door keeps a pair whole the same way: an edit that takes a pair's last words takes its two comments with
them, and one that would leave a comment standing alone or write an empty pair is refused as `ink_pair_broken`.
An arrow is one mark across both spans: deleting either anchor's last words, or removing either complete
span's comments, retires both spans' comments in the same transaction, keeping any remaining words.
Undo restores both anchors together. Copy carries an arrow only when both complete anchor spans are
selected; a partial copy keeps the selected words without an orphan endpoint. Paste keeps a complete
pair and changes both pairing numbers together if that number is already occupied in the document.
Erasing a stroke resolves its exact source occurrence, including strokes with identical openers and words;
another stroke on those words remains. Removing the last words inside nested strokes retires every emptied
pair in the same transaction.

Other readers show only the words. Rapier draws the stroke over the words it marks
and re-derives it from their boxes at every layout: as it was drawn while the words lie as they did; one piece
per line when they wrap. Stripping comments loses the ink, not the words. The
grammar's owner is `spec/md-marks.mjs`, the geometry's `spec/ink.mjs`.

A semantic page span carries `class="rapier-ink-mark"` and `data-rapier-ink` containing the opener's body,
without its comment delimiters. `inkOpenBody` and `parseInkBody` read that boundary through the same grammar;
the attribute does not supply a second spelling. Plain text keeps the words and drops the comments. A shared
page keeps the exact authored Markdown, including ink, through `wrap` and `unwrap`. Word export maps `under`
and `strike` to native underline and strikethrough on the marked runs; `ring`, `bracket`, `free`, and both
arrow anchors keep the words and their existing text formatting. A stroke's colour never becomes the words' colour. Importing a
native Word underline produces the ordinary underline mark, never invented ink or a fabricated stroke.

## Table captions

A paragraph immediately after a table that begins `Table: ` (or a bare `: `) is recognised as that table's caption:

```md
| Region | Q3 |
| --- | --- |
| North | 412 |

Table: quarterly figures, by region.
```

A paragraph immediately after a picture that begins `Figure: ` is that picture's caption, the same way. Word writes
it as a caption under the picture; the source keeps the line.

Captions are optional. "Table" without a colon stays an ordinary paragraph, even after a table. Recognition changes only rendering; bytes stay exact, and other readers show a plain paragraph. A bare `: caption` line directly after an ordinary paragraph is claimed by the definition-list convention instead; after a table it is a caption.

## Document-wide settings

The opening front matter may carry the keys Pandoc and Quarto already name. Rapier reads them and never rewrites
them; an unknown key, or a value that is not one of the steps below, is ignored and left in the file.

```md
---
title: Shore
subtitle: Night
fontsize: 12pt
mainfont: serif
linestretch: 1.5
papersize: a4
geometry: margin=1in
pagestyle: plain
---
```

- `fontsize`: `10pt`, `11pt` or `12pt`. `mainfont`: `sans` (the page's own face), `serif`, `mono` or `system`.
  `linestretch`: `single`, `one and a half` or `double` (also `1`, `1.5`, `2`); it sets the line, and everything
  measured in lines follows it, a picture's `lines` included (see "The line").
- `papersize`: `letter`, `a4`, `a5` or `legal`. `geometry`: `margin=` a length in `in`, `cm`, `mm` or `pt`.
  `pagestyle`: `plain` (page numbers) or `empty`.
- `title` and `subtitle`: the window's title, the exported page's `<title>`, Word's document title and subject, the
  PDF's title. The visible title is still the document's first `# ` heading.

The view applies the type keys and ignores the page keys, since a scroll has no page; the exported page applies the
type keys and, when printed, the page keys; Word and the PDF apply all of them. Superscript and subscript are the
standard's raw `<sup>` and `<sub>`.

## Page break

A page break is one marker on its own line, with blank lines on both sides, as for a will:

```md
The last paragraph of a chapter.

<!--md-break:v1 page-->

The first paragraph of the next.
```

Other readers hide the comment and show both paragraphs unchanged. A PDF breaks the page there, and a Word export carries a real page-break run.

## Blank lines

Markdown treats any run of blank lines as one separator. An intentional empty paragraph (Enter with no text) is one line holding only `&nbsp;`, which CommonMark draws empty. A block-separating blank line writes nothing; a document of one empty paragraph is an empty file. Plain text (`.txt` export, Copy as plain text, plain paste) keeps the empty paragraph as an extra newline, like Word. Word export writes a paragraph with no run, never a space.
Reading that empty Word paragraph and writing it again keeps the paragraph with no run; the importer's lone `<br>` is its empty-paragraph placeholder. Breaks among words and multiple authored breaks remain content.

## Reference style

[`spec/markdown-style.css`](repo/spec/markdown-style.css) is the MIT reference style for rendered
Self-contained Markdown. Rapier, its exported reading pages and the kit's `style.css` use this one file.
The renderer supplies HTML; the sheet supplies type, colours and spacing. It neither parses
Markdown nor downloads a renderer, font or picture.

```html
<link rel="stylesheet" href="style.css">
<main class="md-render" data-md-theme="light">
  <h1>A document everywhere</h1>
  <p>The renderer puts ordinary HTML here.</p>
</main>
```

The root is `.md-render`. With no `data-md-theme`, it follows `prefers-color-scheme`; `light` and
`dark` select a theme explicitly. The sheet defines every custom property it reads, all named
`--md-*`, on `:root` and `.md-render`; an element may override its own local effect. A host may override those properties after the sheet. Geist and Geist Mono are the named
faces, with system fallbacks adjusted to their x-height; the host supplies a face if it wants the
same glyphs. A host scales the document by setting `--md-unit` on `.md-render`; equal font metrics, the same unit
and the same content width are what make equal line breaks. Headings balance their lines (`text-wrap: balance`); paragraphs keep the
browser's greedy breaks.

Vertical rhythm uses one line, `--md-line` (1.75 units, 1.6 lines of the
1.1-unit body, `--md-text-body`). Body text sits on that line; a heading's
box is the whole or half lines its size fills (h1 at 2.4 x the body on two lines, h2 and h3 on one and a
half, h4 to h6 on one); every block ends one line below its last line and a heading half a line below; list
items are a quarter line apart. Blocks have no top margin; their predecessor supplies the space. A host that sets `--md-unit` scales type, rhythm and pictures measured in lines together.

| Content | HTML the renderer supplies |
| --- | --- |
| Paragraphs and headings | `p`, `h1` through `h6`; use `dir="auto"` where the block's words determine its writing direction. |
| Inline formatting | `strong`, `em`, `a[href]`, `code`, `del` or `s`, `ins`, `abbr[title]`, `sub` and `sup`; their ordinary HTML meaning stays intact. |
| Alignment | `data-md-align="left"`, `"center"`, `"right"` or `"justify"` on the paragraph or heading. For a picture, put it on the picture's own paragraph; `justify` applies to text only. |
| Bullets and numbers | Ordinary nested `ul`, `ol` and `li`. A numbered list starting at five, for example, carries `start="5"` and `style="counter-reset:rapier-ol 4"`; the sheet's circles use that counter. |
| Tasks | `li.task-list-item` containing `input[type="checkbox"]`, with `checked` for a completed item. The renderer chooses whether the input is enabled and owns changes to its state. |
| Table | `table` with `thead`, `tbody`, `tr`, `th` and `td`; cell alignment uses ordinary `text-align`. An overflowing table may use a `.table-scroll-wrap` wrapper. |
| Table caption | The following `p.rapier-table-caption`, retaining its `Table: ` or `: ` text. Give it an id and name that id in the table's `aria-describedby`; the caption stays outside the table and in source order. |
| Quote and callout | `blockquote`; a callout also has `.callout` and one of `.callout-note`, `.callout-tip`, `.callout-important`, `.callout-warning` or `.callout-caution`. Its first `.callout__label` holds the label and optional inline SVG icon. |
| Highlights | `mark` uses the accent; `mark[data-rapier-highlight="green"]`, `"red"`, `"blue"`, `"yellow"` or `"purple"` selects one of the named swatches. |
| Text colour | `span[data-md-color="#rrggbb"]` and `style="--md-color:#rrggbb"`. The five named colours have dark mates in the sheet. For another colour, the renderer can also set `--md-color-dark` to its chosen dark-page tone. |
| Page break | `div.rapier-page-break[data-md-break="page"]`, with `role="separator"` and `aria-label="Page break"`. Its screen rule is a reading aid; print breaks before the following content. |
| Footnote | `sup.footnote-ref > a[href]` points to the note's id. The notes are `section.footnotes > ol.footnotes-list > li.footnote-item`; each return link is `a.footnote-backref`. An optional `hr.footnotes-sep` is hidden because the section owns its separator. |
| Code block | `pre > code.language-LANGUAGE`, with code as escaped text. A language class identifies the code; a syntax highlighter is a renderer choice. A capped block uses `pre[data-rapier-code-lines]` and a `.rapier-code-lines-note` child for its line count. |
| Details | `details` with `summary` first and ordinary block content after it; `open` chooses its initial state. |
| Definition list | `dl` with `dt` and `dd`. |
| Rule | `hr`; `data-hr-style="dash"`, `"stars"` or `"underscore"` preserves the corresponding authored rule treatment. |
| Picture | `img` with its real `src`, meaningful `alt` and optional `title`, inside its own `p` when it carries layout. Embedded pictures use their data URL directly. |
| Diagram | A sanitized `svg.rapier-diagram`. A generated diagram may sit in `.diagram-block > .diagram-cache`; `data-diagram-state="ready"` on the block hides its retained `.diagram-source`. The sheet applies its diagram ink and nine-colour palette to the generated SVG's own shapes. |
| Mathematics | Inline rendered math stays inline; display math sits inside `.math-display-wrap`, which owns its scrollable width and centring. The renderer supplies MathML or the math provider's output. |
| Jump list | `ul.rapier-jump-list` whose items link to section ids; its preceding label is `p.rapier-jump-label`. |

### Picture layout and the renderer

The sheet reads alignment and rendered picture size; the renderer reads layout comments. Use `parseLayout` from `rapier-markdown-kit/layout` for the marker and `imageStyle`
for its normal-flow `width` and `x`, its `lines` and its fade. `imageStyle` returns a percentage width, automatic height and,
when `x` is present, the clamped left margin; for `lines`, automatic width and the height in lines (`linesHeightCss`);
with `opacity` under `100%`, the CSS `opacity`. `data-md-image-width` records the percentage on the
image. An Obsidian pixel-width picture uses `data-rapier-image-size` with `--md-image-width:Npx`;
the sheet constrains it to its container. A drawing (an SVG picture) shown at its own size or at full column width carries
`data-md-drawing` and `--md-drawing-width:Npx`, its own width: the sheet lets it shrink to its
container only down to 12/14 of that width, and past that its
parent scrolls sideways; on paper it fits the page. Explicit pixel sizes and smaller layout widths keep the chosen size.

Rapier's layout projector receives the encoded marker in `data-md-layout` on the paragraph and
`data-rapier-image-layout` on the picture (`encodeURIComponent(marker)`; the kit's
`parseLayoutAttribute` reads it). `data-md-layout-tight` retains the zero block margin of a tight
list paragraph. `wrap`, `y`, `lines` beside words and `rotate` are geometry for the renderer to project, not CSS attribute
values the sheet can interpret. The projector owns the derived positions, margins, transforms,
stacking and line boxes; a rotated image reserves its turned bounds. The style pack needs neither
a CSS placement renderer nor the kit's line planner to style an ordinary document.

### Using markdown-it and the kit

The kit’s README has an executable example (the kit is not part of the standard):
`markdown-it` supplies core HTML and GFM tables, `installMarkdownImages` reads the picture definitions,
and the kit's layout and mark readers interpret the example's trailing layout comments, paired colour
comments and page-break line. It wraps the result in `.md-render` and loads `style.css` alone.
Markdown-it and any extension plugins are supplied by the caller; the kit has no npm dependencies
and also exposes the `createRenderer` factory through `rapier-markdown-kit/render`;
that factory takes its parser and other host ports from the caller. Task-list and footnote plugins emit the corresponding classes above; a renderer
for callouts, highlights, diagrams or mathematics emits their listed wrappers. A host rendering
untrusted source applies its own HTML sanitization policy before displaying it.

Rapier emits these class and attribute names. The remaining `rapier-*` presentation hooks will take `md-*` names in one change with their producers and readers.

## The document as a web page

One HTML file displays the document in any browser with scripts off and returns exact Markdown to editors implementing this section. It carries the Markdown as plain text:

```html
<script type="text/markdown" data-filename="notes.md" data-kind="markdown" data-sha256="…"
        data-images="flow" data-image-definitions="FLOW">
# Notes

![The intake flow][flow]

[flow]: #flow
</script>
```

The page's own `<img>` elements are the picture store. Each Markdown image destination that is a data URL the page shows (an inline image's destination or an image reference definition's destination, and only those: the same bytes in a code block, a sentence or an ordinary link are never touched) is replaced over its destination span by a fragment, `#id`, naming the `<img id="…">` that holds those bytes; `data-images` lists every id used that way. When the source delimits a destination with `<…>` (`![x](<data:…>)`, `[label]: <data:…>`), the writer keeps those authored delimiters: the carried destination is `&lt;#id>`, and resolving the id restores the exact original spelling. Nested brackets in an inline picture description do not change its destination. Ids match `[A-Za-z0-9][A-Za-z0-9._:-]{0,120}`: a definition's own label when it fits, otherwise `image-N`.

A reference definition (`[label]: #id`) needs an additional check: a hand-written fragment (`[nav]: #pic`) can match a rewritten image definition’s destination (`[pic]: #pic`). `data-image-definitions` lists the normalized reference label (markdown-it's `normalizeReference`: trim, collapse internal whitespace, case-fold) of every reference definition the writer actually rewrote, each percent-encoded (unreserved characters and `%XX`, so the list stays one space-separated token run whatever the label contains). **Resolve only declared image definitions, never a definition whose destination merely resembles a picture id.** An inline image destination needs no separate label declaration: only a destination the writer structurally substituted carries raw `#id`; every authored `#` elsewhere, including image-looking examples inside code, is carried as `&#35;` until after resolution. Two `<img id="…">` elements sharing one id are ambiguous and refuse the whole page rather than silently choosing one. A page must carry `data-image-definitions` when it rewrites a definition.

The writer entity-encodes each untouched Markdown segment in this order: `&` → `&amp;`, `<` → `&lt;`, authored `#` → `&#35;`, and carriage return (CR) → `&#13;`. It writes raw `#id` only at a structurally recognized picture destination it substitutes. This distinguishes literal examples from substitutions and preserves CR/CRLF through HTML newline preprocessing. The reader first restores `&#13;` to CR for reference-line recognition; it resolves the declared raw `#id` destinations, decoding a reference label before comparing it with `data-image-definitions`; only then it restores `&#35;` → `#`, `&#13;` → CR, `&lt;` → `<`, and `&amp;` → `&`, in that order. Original entity-looking text stays literal because ampersands decode last. One newline is added after the opening tag and one before the closing tag. `data-sha256` is the SHA-256 of the reconstructed source, with `#id` restored to an `<img>`’s `src` verbatim and authored delimiters kept. Changed pictures or text cause refusal. A leading UTF-8 BOM is included in the carrier and digest, and is restored as file metadata when opened. With image compatibility off, the recovered source is the original file byte for byte. A page carries JPEG XL pictures as they are; with the Share sheet's image compatibility switch on, each is carried as the portable picture the page then shows (PNG, or JPEG for an opaque photograph when smaller), which needs a browser that decodes JPEG XL. Either way the working file on the device keeps its own codec. Picture bytes are never duplicated between the page and the carried Markdown; a picture shown twice on the page is, as in any HTML, present twice. The page admits only its own scripts under one nonce -- the inlined line planner, so a wrapped picture sits where it does in the editor, and the code lexer when a code block needs colouring -- and `text/markdown` is not a script type any browser executes; a reader with scripting off still sees the picture on its nearest side. The page also declares `referrer` `no-referrer`, so following a link from it never tells the destination where the page lives. The digest covers carried Markdown, not rendered HTML; altered visible words do not change the recovered document. Open the page in Rapier or a reference reader to read its authentic source.

Shared pages need no browser to read or write. Two public reference readers use a string scan: `tools/read-shared-page.mjs` (Node) and `tools/read-shared-page.py` (Python 3), each a small standalone script: restore CR, resolve only the raw ids in `data-images` against the page's own `<img id src>` (refusing a duplicate id rather than picking one), resolve a reference definition additionally only when its normalized label is declared in `data-image-definitions`, decode the remaining entities, verify `data-sha256`, write the `.md` bytes without newline translation.

## Exporting for Pandoc or Quarto

The copy sheet’s "export for pandoc/quarto" toggle (off by default, under "copy markdown") rewrites only copied text: a colour run becomes a bracketed span with an inline colour style (`[words]{style="color: #rrggbb;"}`), a highlight becomes a `.mark` span (`[words]{.mark}`), and a page break becomes a bare `\newpage`. Fenced and inline code are left as they are. The document's own file is never touched, and Rapier does not read the Pandoc forms back as colour or highlight.

## Preservation and display

Opening, rendering and saving preserve existing source, including reference
spelling, image destinations and definition positions. Only an intentional edit
changes it; a save does not reorder, recompress or remove image definitions.
Unknown source and untouched metadata survive editing. Rendering never becomes
document state. A file's newline style and a leading UTF-8 byte-order mark are
facts of the file: kept on open, written back on save and on Share's editable
source, never shown as characters.

CommonMark hides reference definitions. Unaware renderers can ignore layout comments and resolve
images without a Rapier-specific parser. Display depends on the host
allowing data images and supporting the chosen codec; CommonMark syntax alone
does not guarantee it. PNG, JPEG and WebP have broader codec support within the
same one-file mechanism.

Stripping comments loses optional layout, not image bytes. A processor that
removes data URLs or reference definitions can still lose images. A damaged or
unsupported image retains its source and description without preventing the
rest of the document from being read.

The release run opens CommonMark/GFM, Bear, Obsidian, Pandoc-copy and RTL files (plus CRLF, a UTF-8 BOM,
trailing-whitespace hard breaks and a missing final newline) through Open, makes one unrelated edit,
Saves and compares bytes against the original plus that edit. A Save-side rewrite
that is not named by a sentence in this document or in markdown-profile.md fails.

The [layout reference](repo/spec/md-layout.mjs), the [text-colour/page-break
reference](repo/spec/md-marks.mjs) and the [reference style](repo/spec/markdown-style.css) are licensed MIT (`LICENSE-MIT` is the enumerated statement). Application behavior and
interoperability limits are recorded in [standard-adoption](standard-adoption.md).
