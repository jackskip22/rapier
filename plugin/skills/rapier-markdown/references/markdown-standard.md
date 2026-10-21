# Self-contained Markdown

**Open convention · v1**

One UTF-8 `.md` file holds the document and every image. CommonMark is the foundation; GFM may add tables, task lists
and strikethrough. Images use CommonMark reference definitions with Base64 data URLs. Layout uses an optional
`md-layout:v1` comment. The [Markdown profile](markdown-profile.md) classifies Rapier's other extensions, read syntax
and invisible conventions.

The source owns content, reading order and layout. One reference scale (see "The reference scale") sizes the type, the
lines and every placement on every surface; the renderer supplies the column. No application, account, service or
rendering engine is required.

The format has layers, each complete without the next:

- **The core** is CommonMark and GFM.
- **The conventions** are inline typography, the layout comment, review comments, page breaks and the picture appendix,
  carried by ordinary inline HTML, HTML comments or reference definitions.
- **Will** is separate: [Will/1](will.md) is an optional, independently versioned standard for a person's instruction
  to an agent about what may change.
- **The style pack** is an optional companion: one MIT stylesheet, shipped with the kit and the exported page, that
  renders lists, tables, pictures and layouts, color, highlights, diagrams and math as Rapier does.

## Measured against the specification

The pinned suites hold all 652 [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) examples and all 677 examples
of the published [GFM 0.29 specification](https://github.github.com/gfm/), including its 28 extension examples. The
editor keeps all 1,329 sources byte for byte through opening, saving, a middle edit, Undo and Redo; it never
normalizes source.

| Measure | CommonMark | GFM |
| --- | --- | --- |
| Parser output, every Rapier extension on, official HTML normalization | 643 of 652 (98.62%) | 664 of 677 (98.08%) |
| Semantic renderer and styled HTML writer against the unadjusted official meaning | 638 of 652 (97.85%) | 662 of 677 (97.78%) |
| Document meaning kept under the [documented profile](markdown-profile.md) | 652 of 652 | 677 of 677 |

These are unadjusted comparisons, not a claim of complete core conformance. The differences: GFM's extended autolinks
and disallowed-tag filter also act in core-grammar examples; a task stays interactive; table alignment uses equivalent
CSS; HTML comments follow CommonMark 0.31.2, not GFM's older grammar; and opening front
matter and the complete-tag rule for raw HTML are explicit renderer differences. Meaning covers words, structure, code
content and language ids, link destinations, image descriptions, checked state and authored column alignment, under
the document's HTML safety policy and without generated presentation metadata. No example is skipped or accepted
without a concrete expected meaning.

## Layout

Attach one trailing comment to a paragraph or heading:

```md
A centered paragraph. <!--md-layout:v1 align=center-->

## A right-aligned heading <!--md-layout:v1 align=right-->
```

For image layout, put the image in its own paragraph. Alt text describes it; one comment carries layout. Here
`<payload>` means Base64 image bytes.

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
| `align` | `left`, `center`, `right`, `justify` | Paragraph or heading alignment; `justify` is text only. |
| `width` | Decimal percentage above `0%`, at most `100%` | Image width relative to the content box, keeping the aspect ratio. |
| `lines` | Whole number from `1` to `12` | A picture or a paragraph's initial letter spans N lines, from the first line's cap height to the Nth line's baseline (see "The line"). A picture keeps its aspect ratio, capped at the content box. Never with `width`; headings don't take it. |
| `wrap` | `around`, `box`, `behind`, `front` | Text flows around the image's silhouette (`around`) or its tight, tilted bounding box (`box`). Or the image leaves the flow: placed like a wrapped image but painted under (`behind`) or over (`front`) the words, which lay out as if it were absent. |
| `x` | Decimal percentage from `0%` to `100%` | The image's requested horizontal center within the content box; needs `width` or `wrap`. |
| `y` | Finite decimal then `em`, optionally negative (never below `-50em`; zero is unsigned and omitted) | A wrapped image's requested top inset in its anchor paragraph, in that paragraph's font size. Negative lifts it above the first line. |
| `rotate` | Integer or one-decimal-place decimal then `deg`, above `-180` and at most `180` | Clockwise turn about the image's center; omitted at `0`. Valid with any placement (inline, any `wrap`, or `align`) and alone. |
| `opacity` | Whole percentage from `5%` to `100%` | The whole picture is drawn at this opacity over what lies beneath; omitted at `100%`. The picture's bytes and its own transparency never change. Valid with any placement and alone. |
| `lock` | `on` only | Locked in place: in Rapier a tap goes to the surrounding words and never selects it, and a hold takes it so it can be unlocked. Omitted when unlocked. Other renderers ignore it. |
| `first` | Nonzero signed decimal from `-64` to `64`, at most six decimal places | A paragraph's first-line indent, in levels of `2em` of the body type; negative hangs the first line toward the start edge. Omitted at zero. Headings ignore it; pictures don't take it. |
| `indent` | Nonzero signed decimal from `-64` to `64`, at most six decimal places | A paragraph's whole indent from its start edge, in levels of `2em` of the body type; also on headings. Negative outdents. Omitted at zero. Text only. |
| `marker` | Nonzero signed decimal from `-64` to `64`, at most six decimal places | A list item's marker offset from its normal place, in levels of `2em` of the body type. Positive moves the marker toward the words. Only the item's leading paragraph carries it; it moves no words or nested list. Omitted at zero. |
| `hyphens` | `auto` only | Paragraph hyphenation in the document's language, with refined line breaks and bounded word spacing for justification. Omitted when off. |
| `caps` | `small` only | The paragraph's first line uses the font's real small capitals. An initial letter keeps its ordinary capital. Omitted when off. |
| `hanging` | `on` only | Opening and closing punctuation may extend into the paragraph's margin. Omitted when off. |
| `before` | Decimal from `0` to `720`, at most two decimal places, then `pt` | This block's own space above, in place of the document's spacing for its kind (the `spacing` setting). Word's paragraph Spacing Before. |
| `after` | Decimal from `0` to `720`, at most two decimal places, then `pt` | This block's own space below, in place of the document's spacing for its kind. Word's Spacing After. Between two blocks the larger of one's `after` and the next one's `before` applies. |
| `line` | Decimal from `0.5` to `4` (a multiple of its type size), or positive decimal up to `720` then `pt` (exact) or `pt+` (at least), at most two decimal places | This block's line spacing: a multiple (`1.5` is one and a half lines), an exact height (`14pt`), or a minimum height (`14pt+`). Word's Line spacing (Multiple, Exactly, At least). |

- Text takes `align`, `first` and `indent`; a list item's leading paragraph also takes `marker`. Paragraphs also take
  `lines`, `hyphens`, `caps` and `hanging`; headings don't.
- Paragraphs, headings and pictures take `before` and `after`; text takes `line`. A writer that changes the document's
  `spacing` for every block removes these three fields from every marker.
- Pictures take none of `hyphens`, `caps`, `hanging` or the indent fields. A picture is sized by `width` or `lines`,
  never both.
- Images have exactly three modes:
  1. Normal flow, with optional `width` (or `lines`) and either `align` or `x`.
  2. Wrapped flow, with `wrap=around` or `wrap=box` and optional `width`, `x` and `y`; text reflows.
  3. Out of flow, with `wrap=behind` or `wrap=front` and the same optional `width`, `x` and `y`; text ignores the image.
- Normal-flow `x` needs `width`. `y` always needs `wrap`. `align` can't be used with `wrap` or `x`. A normal-flow
  horizontal position doesn't change source order or reserve floating space beside the image.
- `rotate` and `opacity` are independent of every other field and mode; neither needs or excludes `width`, `wrap`, `x`,
  `y` or `align`. A fade never changes the flow: `wrap=around` follows the picture's own silhouette at any `opacity`.

A raster or foreign SVG the writer didn't compose carries its turn as `rotate`, so its bytes stay lossless. Its
reserved space becomes its turned bounding box, `w·|cos|+h·|sin|` wide and `w·|sin|+h·|cos|` tall for a `w`×`h` picture
turned `rotate` degrees, centered where the unturned picture's center was. An editable drawing (an SVG the editor wrote
and can still edit) turns its geometry and writes no `rotate`.

Absent alignment means natural alignment, including the Unicode first-strong writing direction of the block (HTML
`dir=auto` on the rendered projection; source stays plain Unicode). Explicit `left` and `right` mean physical sides and
survive writing. Without `width` or `lines`, an image uses its intrinsic width, constrained to the content box. The
reference renderer also gives a picture's two edges a shared budget of 1.6 column widths, so its width is the smaller
of its natural width and `min(1, r, 1.6 / (1 + 1/r))` of the column, for aspect ratio `r` (width over height): a square
picture takes at most 80% of the column. A wrapped, `behind` or `front` image without `x` starts at the left edge.
Renderers clamp the displayed rectangle to the available width without rewriting source.

The next text block in the same container anchors the image, or the previous one if none follows; image paragraphs and
empty paragraphs are skipped. Paragraphs, headings, lists, quotes and callouts, definition lists and expanding sections
can anchor a picture, including text with links and checkboxes. Tables, code, figures, mathematics and rules are
barriers. `y` is an inset from the text block's content top; absent means zero. A renderer clamps the requested top to
the block's unwrapped content height before converting to pixels. Crossing into another text block changes the anchor
and rebases the inset. An image with no eligible neighbor either way stays in normal flow. There are no page
coordinates or saved line fragments.

Wrapping lets text sit above, on either free side of and below the image, in source reading order. A renderer may
derive the silhouette from image alpha or editable drawing geometry, keeping separate horizontal runs around gaps. A
rectangle is a valid conservative fallback; for a rotated drawing the `box` rectangle tilts with it. Beside the anchor,
every prose paragraph and heading the image reaches flows around it. A list, quote or details block shortens its own
lines beside it and stays intact as a structure. A table, code, rule, figure or mathematics stays whole below or beside
the image. Fonts, spacing and line breaks follow the reference scale and the column width; collision avoidance may
adjust displayed geometry without rewriting source.

`wrap=behind` and `wrap=front` use wrapped positioning (`x`, `y`, `width`) while the anchor and following blocks ignore
the image. `behind` paints under the words without dimming; `front` paints over them.

### Attachment and writing

The marker is one line that begins exactly `<!--md-layout:v1`, has one or more unquoted `key=value` fields separated by
ASCII spaces or tabs, and ends `-->`. Horizontal whitespace before the close is accepted. Each key occurs once.

- `lines` is one or two digits with no leading zero, `1` to `12`, with no sign, decimal point or unit.
- Geometry is decimal digits, optionally a decimal point and digits, then `%` for `width` and `x` or `em` for `y`. No
  leading zeroes except `0`, no plus signs, no exponents. `y` may begin with `-`, within its range.
- `rotate` takes an optional leading `-`, the same unsigned digits with at most one decimal place, then `deg`. No `+`,
  exponent or `°`, and no `-0deg` (zero is always unsigned, like `y=0em`).
- `opacity` is a whole number with no leading zero, then `%`.
- `first`, `indent` and `marker` take an optional `-`, ordinary decimal digits and at most six digits after the point,
  within `-64` to `64`. No unit, leading zeroes, `+`, exponent or zero value. For example,
  `indent=2.863636 first=-1.395833` records a measured hanging paragraph. This precision keeps Word's integer
  twentieths of a point when an importer converts a measure to the paragraph's scale.
- `before` and `after` take an unsigned decimal from `0` to `720` with at most two decimal places, then `pt`. `line`
  takes an unsigned decimal from `0.5` to `4`, or a positive decimal up to `720` then `pt` or `pt+`, with at most two
  decimal places.

Measured paragraphs inside a table stay ordinary HTML when GFM cells can't express their block layout. Their `style`
carries `text-indent` and `margin-inline-start` in points, keeping native absolute measurements independent of the
body's type size and a heading's larger type. A list's own `li` uses `margin-inline-start` for its marker offset; the
leading paragraph subtracts that offset from its own margin, and a nested list cancels its parent's item margin. These
ordinary CSS declarations keep the words, first line, marker and nested lists in separate positions. They contain no
private properties or table metadata. The native writer also reads ordinary paragraph `em` declarations relative to
the body type.

Interpret a marker only when it is the final meaningful inline token of its paragraph or heading. In an ATX heading it
comes before optional closing hashes; in a Setext heading it follows the text, above the underline. Nested paragraphs
follow the same rule.

- `marker` needs the first block of a list item to be a paragraph, and attaches only to that paragraph. A continuation
  paragraph, heading, picture or standalone comment can't carry it.
- A standalone comment governs nothing; code stays code.
- Image fields need a paragraph holding one image, optionally inside one link, plus whitespace and its marker.
- Paragraph typography needs prose: a heading, image-only paragraph, table cell or code block can't carry `hyphens`,
  `caps` or `hanging`. A prose paragraph may carry `lines` for its initial letter.

Unknown versions or keys, repeated keys, invalid values, invalid attachment and more than one layout-family comment in
a block are inert and kept. A reader that doesn't know a field or value treats the whole comment as invalid and shows
the picture inline, upright, at its natural size.

Writers emit one marker, lowercase keys, one ASCII space between fields, and the key order
`align width lines wrap x y rotate opacity first indent marker lock hyphens caps hanging before after line`. They remove insignificant
trailing decimal zeroes, omit `y=0em`, `rotate=0deg` and `opacity=100%`, and remove the marker when no fields remain.
Only an intentional edit changes source; opening, rendering and resizing the viewport never normalize it.

### Conformance rungs

A reader that claims one of the first three rungs must show its stated behavior. Rung 3 is the kit's implementation
profile.

**Rung 0: any CommonMark reader.** CommonMark hides layout comments as ordinary HTML comments. A picture shows inline,
upright and solid, at the reader's default width. `align`, `x`, `y`, `wrap`, `lines`, `rotate`, `opacity`, `first`,
`indent`, `marker`, `hyphens`, `caps`, `hanging`, `before`, `after` and `line` are all invisible.

**Rung 1: position and size.**

- `align` sets text alignment.
- `first` and `indent` set a paragraph's first-line indent and its indent from the start edge, each level `2em` of the
  body type (CSS `text-indent` and `margin-inline-start`), including a heading's whole-block indent.
- `marker` moves the leading paragraph's list marker on its own: a list has separate positions for its continuation
  text, its first-line text and its marker.
- `width` and `x` size and place a picture in normal flow (see "Layout"), and `opacity` fades it with CSS `opacity`.
- `lines` sets a picture's height to `calc((N - 1) * var(--md-line) + 1cap)` with `width: auto`, or sizes a
  paragraph's first letter with CSS `initial-letter` (see "The line").
- Paragraph typography uses the reference stylesheet's opt-in selectors.
- `rotate` alone, without `wrap`, stays upright at this rung: a raster's turn is layout, not changed pixels, and it
  degrades like an unrecognized field.

**Rung 2: placement in ordinary CSS.** Each `wrap` value has one conforming rendering:

| `wrap` | Conforming CSS |
| --- | --- |
| `around` | `float: left` when `x` is absent or below 50%, otherwise `float: right`, with `shape-outside: url(<the picture>)` and a `shape-image-threshold` near the standard's 10% alpha cutoff; text wraps to the picture's silhouette. |
| `box` | The same float with no `shape-outside`: text wraps to the plain rectangle. |
| `behind` | The picture positioned (`x`, `y`, `width`) with `z-index` below the text; the anchor paragraph and everything after it lay out exactly as if it were absent. |
| `front` | The same positioning, with `z-index` above the text. |

A `rotate`d picture is turned for display with a CSS `transform`. A transform is a painting-stage operation: it never
feeds back into layout or into what `shape-outside` samples (CSS Transforms; CSS Shapes, "relation to box model and
float behavior"). Turning the picture but leaving its `shape-outside` or float rectangle unturned doesn't conform. A
conforming rung-2 reader computes the *turned* shape and supplies it directly: `shape-outside: polygon(...)` from the
rotated bounding box's corners (the size given above), or, for `wrap=box`, the same turned rectangle as a plain float
with no shape. Rung 2 doesn't give words on both sides of one picture, words inside a picture's unfilled interior, or
line-exact agreement with Rapier. Exact lines are not required.

**Rung 3: the picture-flow planner Rapier uses.** The drop-in module (the `rapier-markdown-kit` package; see
[standard-adoption](standard-adoption.md), "The drop-in module") shares Rapier's picture-flow planner. It is
deterministic for the same measured input and layout policy; different font data, shaping settings or browser engines
need not give identical pixels. Only this rung reproduces both-sides wrapping and interior wrapping. A rung-3 reader
keeps the reference scale; below rung 3, exact line breaks are a recommendation, not a requirement.

#### Rich wrapping reference engine

The reference uses one immutable [Pretext snapshot](https://github.com/chenglou/pretext/tree/bac1774c0f8b7a92e44b9da43b6d5443d55d0d9b),
an unreleased main revision whose package version still reads `0.0.9`. It combines browser-derived break scans and
tables with Canvas text measurement and JavaScript flow; it doesn't ask the DOM to choose lines. The DOM adapter admits
Chrome and Chromium. Firefox, WebKit, Chrome on iOS, unsupported shaping and unsupported settings keep selectable
native text and wrapping, as do complex semantic objects, authored `br` elements, preserved-whitespace DOM blocks,
balanced headings, explicit authored `text-wrap:pretty` and the editor's soft-break tokens.

- Picture flow uses a greedy policy, not the sheet's generic `pretty`. A lone Latin, Greek or Cyrillic word prefix
  (including an authored no-break-space group) may move to a later, wider picture-side slot on the same row when the
  whole group fits there; decorated atoms, mixed-item words, punctuation, discretionary breaks and next-row placement
  keep the engine policy.
- Preparation covers the whole rich paragraph and keeps each item's original text, font, letter spacing, break policy
  and inline box. Fragments give `sourceStart` and `sourceEnd` as UTF-16 offsets in their item's original text.
  Whitespace normalization never rewrites Markdown; NBSP, combining marks, emoji and authored breaks keep their source
  coordinates. Renderers must not rebuild source offsets from storage segments or assume every segment boundary is a
  legal break.
- Semantic export converts soft-break tokens to ordinary rendered spaces before wrapping, while the original Markdown
  travels unchanged in its source carrier.

The MIT preparation API (`createPreparationScope`, font invalidation and plan reuse) is documented in the kit's README.
Its line-range APIs don't expose a general list of legal rich break candidates; emergency advances must not be
advertised as such candidates, and a sum of character widths is not evidence of contextual shaping.
These are reference-implementation capabilities. Saved `md-layout:v1` fields stay semantic: no engine pin,
font-dependent line plan or pixel geometry is added to the document. Complete offline pages carry the same wrapping
code and required upstream notices. Fragments and `scripts:false` pages keep their native fallback.

### The line

One length measures the page: the line, `--md-line`, the body's line box (see "Reference style"). Body text sits on it,
blocks are spaced in it, front matter's `linestretch` sets it, and a picture can be measured in it.

A picture with `lines=N` is as tall as N lines of its anchor text, set the way a drop cap is (CSS `initial-letter`):
its top on the first line's cap height, its foot on the Nth line's baseline. Its height is N - 1 lines plus one cap
height, and its width follows its aspect ratio, capped at the content box. With a `wrap`, `y` insets the picture from
that cap height instead of the block's top, so `lines=5 wrap=around` with no `y` is a five-line initial whose words run
beside it on exactly five lines. A larger text size, a face with a different cap height or a `linestretch` changes the
line, and the picture follows it wherever the document is shown: the editor, the exported page, print and Word. In
normal flow, the line and cap are those of the picture's own paragraph.

```md
![W][initial] <!--md-layout:v1 lines=5 wrap=around-->

ith a decorative letter the paragraph opens on five lines, at any text size.
```

A renderer finds the first line's cap height from the anchor's font. With the half-leading model the baseline sits
`(line - (ascent + descent)) / 2 + ascent` below the top of the line box, and the cap height is `cap` above the
baseline. Word takes its body and line from the same reference scale. Export preparation measures the chosen font at
the printable page width, and uses a cap of 0.7 of the body only when it can't measure the font. Resizing a picture
sized in lines beside its words changes it a whole line at a time; resized anywhere else, it takes a `width` instead.

### Paragraph typography

Every refinement needs a layout field. An existing `align=justify` paragraph keeps its original behavior until the
person turns on `hyphens=auto`. The document's `lang` is Pandoc's language key; without it, the renderer uses the
device language. Automatic hyphenation and `text-wrap: pretty` apply to prose only; code, tables and headings keep
their own line breaking. These refinements never add soft hyphens or forced line breaks to the text. While a paragraph
is open for editing, opted-in justification uses natural start alignment to keep gaps bounded; leaving the paragraph
restores its refined justified layout.

For an admitted read-only paragraph, the reference renderer considers the whole paragraph before choosing its lines:

- It prefers whole words.
- It keeps ordinary spaces within 60–180% of their natural width.
- It allows at most two discretionary line endings in a row.
- It keeps the final line's first word whole, and never stretches the final line.

Very narrow columns can keep some ragged edges when filling them would break those bounds. Authored compound hyphens
stay distinct from optional automatic or soft-hyphen endings.

Automatic hyphenation keeps at least three graphemes on each side and splits a word at most once. ASCII `en` and
`en-US` words use the included, separately licensed American pattern data; other regions and admitted languages use
available native offline dictionaries. Without native query support the paragraph stays native. Dictionaries for
different languages can choose different divisions. The projected hyphen is the text face's hyphen-minus, measured
with its prefix; an explicit authored `hyphenate-character` stays native. No source hyphen, spacing character, new
layout mode or language download is added.

Optional optical margins use the actual punctuation width, bounded by half an em and the unclipped free margin. The
renderer adds no tracking. Supported authored spacing, custom faces, semantic inline elements and original source
coordinates keep their meanings. Unsupported shaping, direction, scripts, initial letters and picture flow keep
native layout. The comment is engine-independent; other readers need not choose the same lines to keep its intent.

```md
---
lang: en-AU
mainfont: serif
---

With a letter capital the paragraph opens on three lines. <!--md-layout:v1 align=justify lines=3 hyphens=auto-->
```

For a text capital, `lines=N` sizes the first letter without moving it out of the source. It follows the paragraph's
font, or a font set explicitly on that initial. An initial inside code or math keeps its own size and face. `first`
stays the first-line indent field.

Add `caps=small` for real small capitals on the first line. The reference CSS uses the face's small-capital glyphs and
turns off synthesized capitals; a face without them keeps its ordinary letters. It can also mark the paragraph beside a
picture initial. Add `hanging=on` to let punctuation extend into the margin. Both leave the authored characters
unchanged and travel with the document's exports.

Outputs:

- Complete HTML pages use the shared typography at the available width; the editor and page share one measurement
  graph and paragraph optimizer, and only complete, current measurements produce a plan. Fragments carry ordinary
  hyphenation, wrapping and hanging-punctuation declarations. Script-free output keeps native CSS and the same source
  carrier.
- Print with an authored paper size can finish the refinement at that content width. Print on automatic paper keeps
  native justification, because `beforeprint` doesn't reliably give the paper width. A print host must establish its content
  width before asking for complete refinement.
- Word uses native drop-cap frames, document language, automatic hyphenation and punctuation overflow; first-line
  small capitals become native run formatting measured at the printable width. Word readers can still change those
  glyphs or lines, and some synthesize small capitals. Word has a zero hyphenation zone but no per-line word-space
  maximum, so spacing can differ from HTML and PDF.
- If a Will carrier stands between a picture initial and its prose, Word keeps the picture in its own paragraph, and
  native recovery keeps which side of the Will boundary owns the picture.

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

Placement is relative: `width` and `x` are percentages of the column, `y` is ems of the anchor's type, and `lines` is
lines of the anchor. `first`, `indent` and `marker` use two-em levels of the body type. Explicit ordinary HTML table
measurements in points keep their absolute lengths. The column is the renderer's: the screen, the window or the
paper's text width.

The rule: **at M, a renderer with the same column width and the same face breaks the same words and stands every
picture beside the same words.** Rapier's other text sizes, S, L and XL, multiply the unit by 0.818, 1.136 and 1.273.
Everything grows or shrinks together and the words re-wrap in the same column. A conforming renderer MUST size type,
lines, spacing and the standoff in the unit, and MUST NOT size any of them in device pixels.

**The measure.** The column fills a narrow screen. On a wide one it stops at a reading measure of 39.6 rem (36 ems of
the body at M, about 70 characters, 633.6 px) and is centered. The measure doesn't grow with the text size, so a larger
size re-wraps, as on a phone. On paper, the column is the text width.

**A narrow column.** No line beside a picture is narrower than 3.5 ems of its type (`wrapColumnFloor`); where there is
less room, the words continue below the picture. One document fits every screen: there is no second layout for phone
or desktop. Across column widths the promise is proportional, not identical: the same sizes, the same placements and
the same picture against its words.

## Embedded images

An image occurrence names an ordinary [CommonMark reference definition](https://spec.commonmark.org/0.31.2/#link-reference-definitions).
The definition holds its bytes in a Base64 data URL:

```md
Here is the diagram.

![Site photograph][photo] <!--md-layout:v1 width=47% align=center-->

Later prose stays readable.

[photo]: data:image/jxl;base64,<payload>
```

A drawing or diagram is never a raster: an editable drawing is the SVG the editor wrote, kept as SVG. The choice below
is for rasters, photographs, paintings and pasted pictures:

| Image choice | Definition destination |
| --- | --- |
| JPEG XL (default) | `data:image/jxl;base64,<payload>` |
| Original PNG, JPEG or WebP | `data:image/png;base64,<payload>`, `data:image/jpeg;base64,<payload>` or `data:image/webp;base64,<payload>` |

There is no custom image URI, payload comment or binary encoding. Dimensions come from the image, with no second
metadata header.

- Writers append new definitions at the end of the file, after a blank line, each data URL on one line.
- Repeated occurrences reuse one definition for identical image bytes and reference title.
- Titles belong to the definition, as in CommonMark; alt text and layout belong to each occurrence.
- Moving, resizing or describing an image never re-encodes its bytes.

Any valid CommonMark label works. A writer may derive labels from image hashes to deduplicate bytes; that is an
implementation choice, not a required label syntax or a reader integrity check. Definitions follow ordinary CommonMark
resolution wherever they are in the source. Inline data-image destinations stay ordinary Markdown too.

## HTML blocks

An HTML block is a static visual drawn with HTML, CSS, inline SVG and embedded pictures. Its carrier is an ordinary
CommonMark fenced code block whose info string is `html` followed by a brace attribute list, optionally followed on the
very next line by a layout comment:

~~~md
```html {#prices .card height=8}
<style>td { padding: .5em; border-bottom: 1px solid #ddd; }</style>
<table><tr><td>Market box</td><td>$12</td></tr></table>
```
<!--md-layout:v1 width=40% wrap=around x=70%-->
~~~

A fence whose info string is exactly `html`, with no brace list and no layout comment, stays a code sample. Every
other reader shows the block as HTML source in a code block and hides the comment.

### Attributes

The brace list holds at most one `#id`, any number of `.class` tokens, and `key=value` pairs (a value may be single- or
double-quoted). A key occurs once.

| Token | Values | Meaning |
| --- | --- | --- |
| `#id` | `[A-Za-z][A-Za-z0-9_-]{0,127}` | The block's stable name. |
| `.class` | `[A-Za-z_][A-Za-z0-9_-]*` | Kept with the block. |
| `height` | `auto` or a decimal from `0.5` to `512` | The block's height in lines (`--md-line`). `auto` (the default) fits the content, at most 4096 px. |
| `resize` | `reflow` (default) or `scale` | `reflow` lays the content out at the block's width; `scale` lays it out at `viewport` and scales the result to the block's width. |
| `viewport` | `<W>x<H>`, each from `1` to `4096` | The layout size for `resize=scale`; `640x360` when absent. |
| `overflow` | `clip` | Clips painting to the block's box. |

A repeated key, a malformed token, or a known key with an invalid value leaves the fence a code sample. An unknown key
is ignored and kept byte for byte, so a later version can add one without breaking this one.

### Placement

The layout comment is the only placement owner. It uses the image grammar above with `width`, `wrap`, `x`, `y`,
`rotate`, `opacity` and `lock`. A comment with a text field (`align`, `first`, `indent`, `marker`, `hyphens`, `caps`,
`hanging`) is not a placement and leaves the fence a code sample. A block's height is its `height` attribute.

- Without a comment, the block sits in normal flow at the full column width.
- A static block wraps around its painted silhouette with `wrap=around`, or its box with `wrap=box` or `overflow=clip`.
- With `resize=scale` and a numeric `height`, a writer that changes `width` scales `height` in proportion, to one
  decimal place, within `0.5` to `512`.

### The frame

A renderer draws the block inside an isolated frame with an opaque origin: no access to the host page, its storage or
its cookies, and never any network. The reference frame's policy is
`default-src 'none'; connect-src 'none'; img-src data:; font-src data:; media-src 'none'; style-src 'unsafe-inline'`.
The frame takes no pointer events or focus. Nothing in it can change the document: what it shows is view state.

Before drawing, the renderer keeps only an allow-list of structural, text, table and SVG elements. It removes script,
canvas, iframe, object, embed, form, dialog, template, audio and video elements, every `on*` attribute, and any
resource that is not a local `#fragment` or a Base64 `data:` URL. Pictures enter only through `<img>` or SVG `<image>`
as `data:image/png`, `jpeg`, `webp`, `gif`, `jxl` or `svg+xml`; CSS `url()` admits only fragments and embedded fonts.

The reference budgets are 1 MiB of block source, 512 elements, 256 KiB of CSS per style, 24 MiB per picture URL and
24,000,000 picture pixels per block. A block over a budget shows its reserved box. When a block loses something to
these rules, its source keeps every byte.

### Motion

Motion that HTML and SVG already describe stays: CSS animations and transitions, SVG animation, and animated GIF or
JPEG XL pictures. An SVG animation that targets `href`, `src`, `style` or an event attribute is removed, and an
event-started timeline starts at `0s`. A moving block always:

- wraps around its box, so the words beside it never move while it plays;
- has a pause control at its top-right corner, and pauses when off screen, hidden or under
  `prefers-reduced-motion: reduce`; pausing is view state;
- has a first-frame still for print, PDF and Word.

The still is an ordinary picture definition, written in the act that inserts or changes the moving block:

```md
[rapier-poster-v1-<sha256>]: data:image/png;base64,<payload> "object-poster-v1 <contour> <W>x<H>"
```

- `<sha256>` is the lowercase hex SHA-256 of `rapier-object-poster-v1`, a line feed, `light`, a line feed and
  `JSON.stringify({body, attrs, width})`. `body` is the block's text with CR and CRLF as LF, `attrs` its attributes
  without `id`, and `width` is `round(640 × width% / 100)`. For an animated picture, the hashed text after the two
  lines is its data URL.
- `<contour>` is `sampled`, `animation-box` or `unavailable-box`.
- The still is at most 1024 px on its longer edge, 1,048,576 pixels and 4 MiB.
- Changing or deleting the block retires its still in the same act. An export that needs a still it can't make refuses
  rather than drop the block. A static block needs no still.

Interactivity is not part of this version. A future block that opts into it adds a key to the brace list, which this
version keeps and ignores: it still shows the block as a static frame.

## Will, a separate standard

Where [Will/1](will.md) and layout share a file, each keeps its recognition rules: layout through Markdown tokens; Will
as marker lines at column zero, even in code fences. Neither grants the other anything; Save keeps one source. What
each export keeps of the layout is in `standard-adoption.md`; of Will, in [Will/1](will.md), "Conversion".

## Review comments

Review threads live in one top-level HTML comment line, `<!-- md-comments:v1 JSON -->`. CommonMark readers ignore it.
Its JSON object holds exactly `body`, the digest of all source outside the record, and `threads`, an array of review
threads; any other field makes the record malformed. The record is source; rendered annotations and comment sheets
are projections of it.

- Each thread has a stable `id`, an `anchor`, a Boolean `resolved` and a nonempty `messages` array. The first message
  starts the thread.
- Thread and message ids use 1 to 128 ASCII letters, digits, underscores or hyphens. Thread ids are unique; message ids
  are unique across the document.
- Every message has its `id`, Markdown `text`, `author` (`kind`: `human`, `agent` or `system`; `name`: a string) and
  `createdAt`. It may also carry an inert `recipient` name, a `date` string and `replyTo`.
- `createdAt` is an integer UTC timestamp in milliseconds, from `-62167219200000` (`0000-01-01T00:00:00.000Z`) to
  `253402300799999` (`9999-12-31T23:59:59.999Z`), or `null` when the instant is unknown or outside that range.
- `date` keeps an external date's spelling: a valid calendar date and time, `YYYY-MM-DDTHH:mm:ss`, with optional
  fractional seconds and an optional `Z` or signed `HH:mm` offset. A date without an offset implies no time zone;
  importing it keeps `createdAt` as `null`. An absent date stays absent.
- The first message has no `replyTo`. On a later message it names another message in the same thread, with no
  self-reference or cycle; without it, the message replies to the thread's first message.

**Anchors.** An anchor has a `kind` (`document`, `text`, `image` or `drawing`) and a `status` (`attached` or `stale`).
A range anchor carries UTF-16 `start` and exclusive `end` offsets in the source outside the record, an `exact` digest
of that source range, and a `quote` for display. A drawing may also carry its stable `objectId`. Changed or missing
targets stay as stale threads with a `reason`; the same words elsewhere never become a replacement anchor.

An anchor digest is three decimal integers separated by colons: the UTF-16 code-unit length, an unsigned 32-bit FNV
value and an unsigned 32-bit Adler value.

- FNV starts at `2166136261`. For each code unit, XOR it into FNV and multiply by `16777619`, keeping the low 32 bits.
- Adler's `a` starts at `1` and `b` at `0`. For each code unit, add it to `a`, then add `a` to `b`, both modulo
  `65521`. The Adler value is `b * 65536 + a`.

**The body digest** is `p1:length:first:second`: the decimal UTF-16 code-unit length and two unsigned 32-bit polynomial
values. Both start at zero. For each code unit, multiply `first` by `16777619` and `second` by `2246822519`, add the
code unit plus one to each, and keep the low 32 bits. A concatenation folds each left value as
`left * base ** rightLength + right`, keeping the low 32 bits, so a source edit can update the digest from its changed
chunks without reading unchanged text.

- A real edit writes the new digest in the same reversible source transaction as the edit and anchor transport; Undo
  restores the exact original carrier.
- The binding follows only verified source revisions and their exact edits, never an unrelated source root. A body
  changed without that history still makes its attached range anchors stale.
- If restored history brings back an existing carrier after its in-memory binding is gone, verify it once after the
  complete canonical inverse has committed.

The body and anchor digests detect change; they are not signatures. Serialize the record as one-line JSON, escaping
`<`, `>`, `&` and `-` inside JSON strings as four-digit Unicode escapes; numbers keep ordinary JSON spelling. Message
text, author names and recipients never grant permission or become instructions to an agent.

**Word.** Import turns usable review ranges into these threads, keeping authors, dates, replies and resolution. A
native comment without a usable range stays as an ordinary Markdown note with its review data. Export places threads
on their original rendered ranges. A range with no Word text or object equivalent keeps its discussion as an unplaced
comment; comment-local footnotes keep their labels and formatted details inside the native comment. The complete saved
Markdown still travels in an unchanged Word package's exact source carrier.

## Inline typography

Use one ordinary inline HTML `span` for size, color and family, together or separately. Markdown still owns headings,
emphasis, links and block boundaries:

```md
Plain prose needs no wrapper.

A <span style="font-size:13.5pt;color:#175dc4">precise **phrase**</span> in ordinary prose.

## <span style="font-size:21.5pt;font-family:serif">A semantic heading</span>

<span style="font-size:18px;color:#175dc4;font-family:&quot;Coastal Text&quot;">A complete paragraph in a carried font.</span>

- <span style="font-size:10.25pt">A smaller list item</span>
- An ordinary item
```

- A small H2 stays H2, and enlarged prose stays a paragraph. A writer never picks heading rank from visual size.
- Keep the opener with its first words and the closer with its last words.
- A soft or hard line break can stay inside one paragraph's span; blank lines and block boundaries can't. An opening
  `<span>` alone on a line can start a CommonMark HTML block.
- A selection across blocks is written as separate inline runs in each block: `#`, list markers, table separators,
  reference definitions and blank lines stay outside.
- Don't add typography to code or mathematics.
- Paired spans may surround or sit inside emphasis and links, but must close at the inline nesting depth where they
  opened. A crossing pair is not repaired into nesting.

### Values and inheritance

`spec/md-marks.mjs` exports the one `typography` reader and writer. It admits only these style facts:

| Property | Admitted value | Newly written spelling |
| --- | --- | --- |
| `font-size` | Positive decimal `pt` or `px`, at most 12 fractional digits and at most 1638pt (2184px). No sign, exponent, relative unit, percentage or CSS expression. | Lowercase unit, no insignificant leading or trailing zeroes: `13.5pt`, `18px`. |
| `color` | Opaque six-digit RGB hex, any case; opaque integer `rgb()` or `rgba(...,1)` is also read at HTML and CSSOM boundaries. | Lowercase `#rrggbb`. The picker keeps green `#1c7547`, red `#b32034`, blue `#175dc4`, gold `#865818` and purple `#7924d7`. |
| `font-family` | One quoted or unquoted family name, an unquoted CSS generic, or one preset stack below, written exactly. A name is at most 256 UTF-16 units of well-formed Unicode, with no controls, angle brackets, line separators or `--`. | A custom name is CSS-quoted and HTML-escaped. A generic keeps its spelling. A preset writes its stack. |

The five presets and their stacks are `sans` (`'Geist',system-ui,sans-serif`), `serif`
(`Georgia,'Palatino Linotype',Palatino,'Times New Roman',Times,serif`), `mono` (`ui-monospace,'Courier New',Courier,monospace`),
`system` (`system-ui,sans-serif`) and `hand` (`cursive`). Their names are reserved, quoted or not: `font-family:"serif"`
is not a custom family. The admitted generics are `serif`, `sans-serif`, `monospace`, `cursive`, `fantasy`,
`system-ui`, `ui-serif`, `ui-sans-serif`, `ui-monospace`, `ui-rounded`, `emoji`, `math` and `fangsong`, unquoted.
Reading `font-family:serif` keeps `serif`; a picker that chooses the serif preset writes its stack.

Declarations are read in order, and the last valid value of a property wins. An invalid declaration is
ignored, so other valid properties still count. Unknown properties are ignored. An unclosed CSS quote, a style longer
than 4096 characters or more than 32 declarations admits no typography. The parser reads at most 64 nested wrappers.
It never evaluates CSS expressions or loads resources. The span's other attributes give no editor or resource
authority. Scripts, events, remote URLs, `@import` and arbitrary custom properties never enter the typography facts;
the normal document sanitizer and CSP still apply to every neighboring element.

Absent properties inherit from the enclosing run, then the block and document. Inner spans override
only their own properties. Clearing a selected property removes that override and returns those words to their
block's inherited value; where needed, the editor splits enclosing wrappers and keeps their effect on unselected
words. Other properties stay. An empty style needs no wrapper. There is no separate size-comment grammar, style
registry or arbitrary-weight system; `**strong**` and `*emphasis*` keep their semantic meaning.

CSS defines [96px = 72pt](https://www.w3.org/TR/css-values-4/#absolute-lengths), so a run's `18px` is
13.5pt. Source keeps the authored unit and spelling through open, save and unrelated edits. An intentional value edit
uses the canonical spelling above; an equivalent value is a no-op. The document's `fontsize` still sets the
reference-scale body size; it doesn't multiply an explicit run size. Viewing steps scale the projection through
`--md-unit` and never rewrite source. At the default 16px reference unit, the renderer maps a run to its authored
physical CSS size. Print, PDF and exported pages use the default reference unit, whatever the editor's view.

### Fallback and conversion

With inline HTML on, an unmodified [CommonMark reader](https://spec.commonmark.org/0.31.2/#raw-html) parses the words
and their Markdown inside an inline span. CSS support is a separate choice. [GitHub removes inline
styles](https://github.com/github/markup#github-markup); readers with HTML off may escape or show the tags.

**Copy markdown without typography** removes recognized typography delimiters using the parser's source ranges. It
keeps heading markers, words, emphasis, links, literal and code examples, references and line endings, and changes only
the copied text. It is a semantic Markdown fallback, separate from Copy plain text. The separate Pandoc and Quarto copy
choice is described below and is not a second canonical source form.

Rapier's standalone HTML and Share or page exports keep validated styles and the exact captured Markdown in their
source carrier. Publishing HTML is a fragment: inline styles stay local, custom fonts use the validated data-font
declarations, and no page stylesheet or source carrier is added. Required font bytes keep their authority, including a
custom face named Geist; typography text can't authorize a download. Fragments share the host's font namespace, so
hosts must isolate or coordinate colliding custom family names.

**Word** uses native run color and family and `w:sz`/`w:szCs` in integer half-points; headings keep their real
heading styles and outline levels.

- Positive sizes round to the nearest half-point, ties upward. A result outside 1–3276 half-points is refused; for
  example, `0.1pt` can't be exported as a native run.
- An unchanged source-carrying DOCX recovers the exact original decimal and unit.
- Native import maps direct run and character-style size overrides to their half-point size in `pt`. Document and
  paragraph style defaults keep the existing inheritance policy and aren't repeated as inline marks. A
  direct or character-style run whose regular and complex-script sizes disagree is refused rather than guessed. This
  is not a general Word style-sheet import.
- The styled print and PDF path uses the same validated run facts and font custody.
- Neither mapping promises identical line breaks or glyphs in Word and a browser.

## Ink

A pen stroke surrounds words with paired HTML comments, with the stroke in the opener:

```md
We feed punchcards: <!--ink ring red box=1180,140 -20,-15 1220,0 0,170 -1220,0 -1,-160-->one input, one output<!--/ink-->.
```

The opener carries, in this order, one space apart:

1. The kind: `under`, `strike`, `ring`, `bracket` or `free`. It is decided once when the stroke is lifted and never
   re-read from a later layout.
2. Optionally the color: `green`, `red`, `blue`, `gold`, `purple` or a lowercase six-digit hex. Red when absent.
3. Optionally `w=N`: the pen's width, counted as Draw counts a nib, an integer from 2 to 24. It is drawn 0.11 em wide at
   the default of 9 (never written: an absent `w` is 9) and in proportion to N otherwise.
4. Optionally `box=W,H`: the size of the frame the stroke was drawn against (the marked words' box, or the stroke's
   own for a free mark).
5. Optionally `at=X,Y`: the frame's offset from the marked words' box, for a `bracket` or `free` mark.
6. The path: its first point absolute in the frame, and each later one a move from the point before.

Every number is an integer in hundredths of an em, with one to six digits: `box` from 0 to 999999, `at` and every path
number from -999999 to 999999, and every point the moves reach within ±999999. A path holds at most 160 points. The
closer is `<!--/ink-->`.

- Ink pairs may nest: each closer belongs to the nearest unclosed ink opener, so independent strokes can share words
  without dropping an earlier stroke.
- An unpaired opener or closer stays ordinary comment text and shows nothing. A comment that doesn't read exactly this
  way is not a mark. Canonical typography spans may nest.
- An `under` or `strike` may leave out its path (`<!--ink under-->words<!--/ink-->`): layout draws a straight stroke
  from each line fragment. A loop, bracket or free mark needs its authored path.

An arrow has two separately closed anchor spans, paired by a positive integer from 1 to 999999:

```md
<!--ink arrow 3-->tail words<!--/ink--> … <!--ink end 3-->head words<!--/ink-->
```

The `arrow` opener may carry the same color, frame, offset and path fields after its number, in the same order;
without a path it is straight. The `end` opener carries only its number. Exactly one `arrow` and one `end` with that
number form a mark; a missing or ambiguous mate draws nothing. The two anchors may be in different paragraphs and in
either source order. Each anchor follows its own words; layout derives the connection again from their current line
fragments, keeping the stored shaft's bends and direction. The head always points at the `end` words.

- An ink pair stays inside one enclosing inline container. For equal ranges written together, highlight encloses ink.
- Typography follows the existing inline source nesting and keeps ordinary bold, italic, underline and strike
  semantics. Existing legal nesting keeps its spelling. A crossing pair is not repaired into nesting.
- Code is a barrier: a stroke over it marks only the words around it, never its contents or delimiters.
- A link's words are words: the pair stands inside the link text (`[<!--ink under-->the docs<!--/ink-->](https://example.test)`),
  so the link's shell, destination and title stay whole and the line never opens with a comment. A pair never crosses
  a link's edge.
- A stroke that no words can hold (a picture, a fence, a drawing, the space between blocks) is a `free` mark on the
  nearest words that can.

- Typing inside the span extends that span without changing the recorded stroke. A paragraph break closes it before
  the break and doesn't reopen it after; an empty prefix has no mark to keep. A soft or hard line break inside the
  paragraph keeps one pair, with pieces derived from the line fragments. A bracket beside several lines can stay one
  mark. Opening and saving keep authored bytes, including unsupported spellings.
- Find and Replace All read a mark's words across its two comments: a phrase may run over the opener or closer and is
  one hit. A replacement keeps each comment that still has words inside it, byte for byte, with the mark of the hit's
  first character, and a pair whose words all go goes with them.
- An agent's edit through the door keeps a pair whole the same way. An edit that takes a pair's last words takes its
  two comments too; one that would leave a comment alone or write an empty pair is refused as `ink_pair_broken`.
- An arrow is one mark across both spans. Deleting either anchor's last words, or removing either complete span's
  comments, retires both spans' comments in the same transaction and keeps any remaining words. Undo restores both
  anchors together.
- Copy carries an arrow only when both complete anchor spans are selected; a partial copy keeps the selected words
  without an orphan end. Paste keeps a complete pair and changes both pairing numbers together if that number is
  already in use.
- Erasing a stroke resolves its exact source occurrence, including strokes with identical openers and words; another
  stroke on those words stays. Removing the last words inside nested strokes retires every emptied pair in the same
  transaction.

**Display and conversion.** Other readers show only the words. Rapier draws the stroke over the words it marks and
re-derives it from their boxes at every layout: as drawn while the words lie as they did, one piece per line when they
wrap. Stripping comments loses the ink, not the words. The grammar's owner is `spec/md-marks.mjs`; the geometry's is
`spec/ink.mjs`.

- A semantic page span carries `class="rapier-ink-mark"` and `data-rapier-ink` holding the opener's body without its
  comment delimiters. `inkOpenBody` and `parseInkBody` read that boundary through the same grammar; the attribute
  doesn't supply a second spelling.
- Plain text keeps the words and drops the comments.
- A shared page keeps the exact authored Markdown, including ink, through `wrap` and `unwrap`.
- Word export maps `under` and `strike` to native underline and strikethrough on the marked runs. `ring`, `bracket`,
  `free` and both arrow anchors keep the words and their existing formatting. A stroke's color never becomes the
  words' color. Importing a native Word underline gives the ordinary underline mark, never invented ink.

## Table captions

A paragraph right after a table that begins `Table: ` (or a bare `: `) is that table's caption:

```md
| Region | Q3 |
| --- | --- |
| North | 412 |

Table: quarterly figures, by region.
```

A paragraph right after a picture that begins `Figure: ` is that picture's caption in the same way. Word writes it as
a caption under the picture; the source keeps the line.

Captions are optional. "Table" without a colon stays an ordinary paragraph, even after a table. Recognition changes
only rendering: bytes stay exact, and other readers show a plain paragraph. A bare `: caption` line right after an
ordinary paragraph belongs to the definition-list convention instead; after a table it is a caption.

## Document-wide settings

The opening front matter may carry the keys Pandoc and Quarto already name, plus the inherited font snapshot described
below. Reading never rewrites them; an unknown key or unsupported value stays in the file.

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

- `fontsize`: a positive decimal in `pt` or `px`, such as `13.5pt` or `18px`. It is the reference-scale body setting,
  not limited to 10, 11 or 12pt, and not a global multiplier for explicit run sizes.
- `linestretch`: a positive decimal factor, such as `1`, `1.5` or `2`, times the body size. It sets the line, and
  everything measured in lines follows it, including a picture's `lines` (see "The line").
- `spacing`: `compact`, `standard`, `roomy`, or one JSON object on one line. For example:
  `spacing: {"preset":"compact","paragraph":{"before":0,"after":6,"line":1.4},"h2":{"before":18,"after":4}}`.
  `before` and `after` are points (0–720); `line` is a multiple of the element's type size (0.5–4).
  Types are `paragraph`, `h1`–`h6`, `list`, `item`, `table`, `picture`, `drawing`, `quote`, `code`, `rule`,
  `footnote`, and `toc`. Missing values use the named set, or `standard`. Adjacent block gaps use the
  larger value. Explicit point values stay fixed when you change the body size. Word writes explicit
  line values as exact point heights; its default lines remain minimum heights so inline pictures fit.
- `papersize`: `letter`, `legal`, `tabloid`, `a3`, `a4` or `a5`, or a web size in CSS pixels, `WIDTHxHEIGHTpx` (each side 100 to 10000, such as `1080x1350px`).
- `geometry`: `margin=` a nonnegative decimal length in `in`, `cm`, `mm` or `pt`, at most `6in` once converted. Comma-separated `top=`, `right=`, `bottom=` and `left=` lengths override individual sides; without `margin=`, supply all four. For example, `top=54pt, right=72pt, bottom=90pt, left=60pt`.
- `template`: `page` makes the document a page: the sheet of `papersize` and `geometry`, fitted to the screen width and zoomable, as Layout: DOCX shows it, whatever the Layout choice (Plain stays plain). A picture with `wrap=behind lock=on` is its border; Rapier draws the first such picture over the whole sheet, margins included. Tapping the border reveals handles for the inner text area. Resizing writes the geometry margins; the border artwork stays fixed. Other readers show an ordinary document with the picture behind its words.
- `pagestyle`: `plain` (page numbers) or `empty`.
- `title` and `subtitle`: the window title, the exported page's `<title>`, Word's document title and subject, and the
  PDF's title. The visible title is still the document's first `# ` heading.

Rapier and Plain apply type and spacing keys. DOCX also uses the paper size and margins. The exported page applies the
type keys and, when printed, the page keys. Word and the PDF apply all of them. Superscript and subscript are the
standard's raw `<sup>` and `<sub>`.

Use **Spacing** in Settings or the formatting commands to change these values with one Undo. DOCX layout
uses Letter paper, one-inch margins, Calibri 11pt, and 1.08 line spacing unless your document sets them.
Carlito substitutes for Calibri where needed. DOCX page boundaries are estimates; inspect the exported
file for final pagination. Word cannot keep every interactive object or Rapier wrap contour.

An equivalent `fontsize` request keeps that field's original source. Before changing it, the reference writer reads
its own output with the same size reader and refuses with `RangeError` when the requested size can't be recovered.
Reads and edits of other fields keep the existing `fontsize` spelling. Inline and native-export size limits are
separate from this document-default check.

### Fonts and inherited defaults

`mainfont`, `sansfont` and `monofont` name explicit body, heading and code choices. Each takes one family name or the
generic choices `sans`, `serif`, `mono`, `system` and `hand`. A new run uses the inline typography span above.

Custom font files use ordinary CommonMark references, such as `[font:Family]: data:font/woff2;base64,...`:

- The label begins `font:` (any case). The destination is `data:font/woff2`, `woff`, `ttf` or `otf` with a Base64
  payload of at least 12 bytes.
- Without a title, the family is the label after `font:`. A title is JSON: `family` (required), `style` (`normal`,
  `italic` or `oblique`; default `normal`), `weight` (1 to 1000; default 400), `stretch` (above 0, at most 1000;
  default 100), `weightRange` (`[min, max]` within 1 to 1000), `axes` (at most 64 `{tag, min, default, max, name?}`,
  each `tag` four printable ASCII characters) and `sourceId` (`f` and 24 lowercase hex digits, the exact original's
  identity).
- The first definition of a face wins. Writers label a face `font:<family>`, adding `/<style>/<weight>`, `/<stretch>`
  and `/<tag>=<min>:<max>,…` when they differ from the defaults; readers take the face from the title.
- Font references inside code are examples, not assets. Document Fonts and Draw share one intake for font files.

The optional `defaultfont` scalar records the inherited default used when preparing a portable document. It is separate
from `mainfont`: saving must not turn a personal preference into an explicitly authored body font. A custom default
uses the admitted file's identity as its family alias, `rapier-f` and 24 lowercase hex digits. Its ordinary font
reference uses that alias and the matching `sourceId`:

```md
---
defaultfont: "rapier-f0123456789abcdef01234567"
---
Inherited words and <span style="font-family:serif">an explicit choice</span>.

[font:rapier-f0123456789abcdef01234567]: data:font/woff2;base64,<font-bytes> '{"family":"rapier-f0123456789abcdef01234567","sourceId":"f0123456789abcdef01234567"}'
```

The id and payload above are placeholders; a writer derives the id from the admitted font bytes.

- Distinct files with the same family name keep distinct aliases; choosing a default never guesses by family.
- The inherited asset holds the complete original, compressed when the container keeps its identity. If webfont
  packing would normalize the admitted bytes, the writer keeps the original TTF or OTF data URL. Decoding must recover
  the exact original id, also recorded in `sourceId`.
- Keeping that original once lets later unformatted characters work offline, without a second asset store or a
  coverage schema. Explicit custom run and document faces stay subsets of their used characters; their exact original,
  when available, supplies later characters during preparation. Characters the original font lacks keep the
  renderer's normal fallback.

**Precedence.** An explicit run comes first. Body uses `mainfont`, then the inherited default, then the existing
`sansfont` fallback, then the reader's factory face. Headings use `sansfont`, `mainfont`, the inherited default, then
the factory face. Code keeps `monofont` and its factory fallback. Draw object fonts and app controls don't inherit the
document default.

- A reader's personal choice replaces only `defaultfont`; with no personal choice, the saved snapshot applies.
- An explicit personal reset selects the factory face, and the next preparation removes `defaultfont` and its unused
  asset, keeping all explicit choices.
- Generic defaults use `serif`, `mono` or `hand` as the scalar and need no embedded file. Ordinary factory-only
  Markdown holds no font data.

**Writing.** Opening and switching documents never writes a default into source. Save and export preparation may add
or replace the inherited scalar and font references through the editor's reversible source transaction. Undo and Redo
restore the exact source and font metadata; the personal preference persists separately and is not source history.
Unrelated front matter, words, comments, pictures and line endings stay authored bytes. Missing or corrupt required
font files refuse preparation before source is committed. Preparation uses the shared font owner; the default and its
original asset travel through the same personal preference and font profile as the library.

## Page break

A page break is one marker on its own line, with blank lines on both sides, as for a will:

```md
The last paragraph of a chapter.

<!--md-break:v1 page-->

The first paragraph of the next.
```

Other readers hide the comment and show both paragraphs unchanged. A PDF breaks the page there, and a Word export
carries a real page-break run.

## Blank lines

Markdown treats any run of blank lines as one separator.

- An intentional empty paragraph (Enter with no text) is one line holding only `&nbsp;`, which CommonMark draws empty.
- A blank line that separates blocks writes nothing; a document of one empty paragraph is an empty file.
- Plain text (`.txt` export, Copy as plain text, plain paste) keeps an empty paragraph as an extra newline, like Word.
- Word export writes a paragraph with no run, never a space. Reading that paragraph and writing it again keeps a
  paragraph with no run; the importer's lone `<br>` is its empty-paragraph placeholder.
- Breaks among words and multiple authored breaks are content.

## Reference style

[`spec/markdown-style.css`](repo/spec/markdown-style.css) is the MIT reference style for rendered Self-contained
Markdown. Rapier, its exported reading pages and the kit's `style.css` use this one file. The renderer supplies HTML;
the sheet supplies type, colors and spacing. It doesn't parse Markdown or download a renderer, font or picture.

```html
<link rel="stylesheet" href="style.css">
<main class="md-render" data-md-theme="light">
  <h1>A document everywhere</h1>
  <p>The renderer puts ordinary HTML here.</p>
</main>
```

- The root is `.md-render`. With no `data-md-theme`, it follows `prefers-color-scheme`; `light` and `dark` choose a
  theme.
- The sheet defines every custom property it reads, all named `--md-*`, on `:root` and `.md-render`; an element may
  override its own local effect. A host may override those properties after the sheet.
- Geist and Geist Mono are the named faces, with system fallbacks adjusted to their x-height; a host supplies a face if
  it wants the same glyphs.
- A host scales the document by setting `--md-unit` on `.md-render`. Equal font metrics, the same unit and the same
  content width give equal line breaks. Headings balance their lines (`text-wrap: balance`); paragraphs keep the
  browser's greedy breaks.

Vertical rhythm uses one line, `--md-line` (1.75 units: 1.6 lines of the 1.1-unit body, `--md-text-body`). Body text
sits on that line. Headings h1 to h6 are 2.6, 1.9, 1.5, 1.25, 1.1 and 1 times the body, with line boxes of two lines
(h1), one and a half (h2, h3) and one (h4 to h6). Gaps scale with the body: at the 17.6 px body, a paragraph is
followed by 8 px, a heading has 20 px before and 4 px after it, and any other block is followed by 12 px; list items are
a quarter line apart. Blocks have no top margin; the block before supplies the space. A host that sets `--md-unit`
scales type, rhythm and pictures measured in lines together.

| Content | HTML the renderer supplies |
| --- | --- |
| Paragraphs and headings | `p`, `h1` through `h6`; use `dir="auto"` where the block's words determine its writing direction. |
| Inline formatting | `strong`, `em`, `a[href]`, `code`, `del` or `s`, `u` or `ins`, `abbr[title]`, `sub` and `sup`; their ordinary HTML meaning stays intact. |
| Alignment | `data-md-align="left"`, `"center"`, `"right"` or `"justify"` on the paragraph or heading. For a picture, put it on the picture's own paragraph; `justify` applies to text only. |
| Bullets and numbers | Ordinary nested `ul`, `ol` and `li`. A numbered list starting at five, for example, carries `start="5"` and `style="counter-reset:rapier-ol 4"`; the sheet's circles use that counter. |
| Tasks | `li.task-list-item` containing `input[type="checkbox"]`, with `checked` for a completed item. The renderer chooses whether the input is enabled and owns changes to its state. |
| Table | `table` with `thead`, `tbody`, `tr`, `th` and `td`; cell alignment uses ordinary `text-align`. An overflowing table may use a `.table-scroll-wrap` wrapper. |
| Table caption | The following `p.rapier-table-caption`, retaining its `Table: ` or `: ` text. Give it an id and name that id in the table's `aria-describedby`; the caption stays outside the table and in source order. |
| Quote and callout | `blockquote`; a callout also has `.callout` and one of `.callout-note`, `.callout-tip`, `.callout-important`, `.callout-warning`, `.callout-caution`, `.callout-danger` or `.callout-info`. A blockquote whose first paragraph begins `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`, `[!DANGER]` or `[!INFO]` (any case) is a callout; `danger` takes the caution color and `info` the note color. Its first `.callout__label` holds the label and optional inline SVG icon. |
| Highlights | `mark` uses the accent; `mark[data-rapier-highlight="green"]`, `"red"`, `"blue"`, `"yellow"` or `"purple"` selects one of the named swatches. Canonical Markdown writes a colored highlight as `<mark style="background-color:#35c57a">`, with green `#35c57a`, red `#f05a62`, blue `#4f91f7`, yellow `#e6b91e` or purple `#9b6dea`; the renderer reads exactly that spelling as the named swatch. A reader also takes Bear's `==🟢…==`: an opening 🟢, 🔴, 🔵, 🟡 or 🟣 before other text in the highlight selects green, red, blue, yellow or purple and is not shown; alone, it stays text. |
| Text color | `span[data-md-color="#rrggbb"]` and `style="--md-color:#rrggbb"`. The five named colors have dark mates in the sheet. For another color, the renderer can also set `--md-color-dark` to its chosen dark-page tone. |
| Inline size and family | `span[data-md-size="13.5pt"]` with `font-size:calc(13.5 / 12 * var(--md-unit))`, and a validated `font-family`. These attributes are renderer data; canonical Markdown carries ordinary `style` only. A sized span supplies a normal line box; block rhythm remains the reference style. |
| Page break | `div.rapier-page-break[data-md-break="page"]`, with `role="separator"` and `aria-label="Page break"`. Its screen rule is a reading aid; print breaks before the following content. |
| Footnote | `sup.footnote-ref > a[href]` points to the note's id. The notes are `section.footnotes > ol.footnotes-list > li.footnote-item`; each return link is `a.footnote-backref`. An optional `hr.footnotes-sep` is hidden because the section owns its separator. |
| Code block | `pre > code.language-LANGUAGE`, with code as escaped text. A language class identifies the code; a syntax highlighter is a renderer choice. The page caps a block of more than 40 lines with `pre[data-rapier-code-lines]` and a `.rapier-code-lines-note` child for its line count. |
| Details | `details` with `summary` first and ordinary block content after it; `open` chooses its initial state. |
| Definition list | `dl` with `dt` and `dd`. |
| Rule | `hr`; `data-hr-style="dash"`, `"stars"` or `"underscore"` preserves the corresponding authored rule treatment. |
| Picture | `img` with its real `src`, meaningful `alt` and optional `title`, inside its own `p` when it carries layout. Embedded pictures use their data URL directly. |
| Diagram | A sanitized `svg.rapier-diagram`. A generated diagram may sit in `.diagram-block > .diagram-cache`; `data-diagram-state="ready"` on the block hides its retained `.diagram-source`. The sheet applies its diagram ink and nine-color palette to the generated SVG's own shapes. |
| Mathematics | Inline rendered math stays inline; display math sits inside `.math-display-wrap`, which owns its scrollable width and centering. The renderer supplies MathML or the math provider's output. |
| Jump list | A top-level `ul` of at least two items, each holding exactly one `a[href^="#"]` as its whole text and no nested list, is `ul.rapier-jump-list`; a preceding paragraph reading `Jump to` or `Jump to:` is `p.rapier-jump-label`. |
| Figure caption | A paragraph beginning `Figure: ` right after a paragraph holding only one picture is `p.rapier-figure-caption`. |
| Numbered list across headings | When an `ol[start]` continues the numbering of an earlier top-level list with only headings between them, the earlier list carries `data-rapier-list-continues` and each heading between them `data-rapier-list-through`. |

### Picture layout and the renderer

The sheet reads alignment and rendered picture size; the renderer reads layout comments. Use `parseLayout` from
`rapier-markdown-kit/layout` for the marker and `imageStyle` for its normal-flow `width` and `x`, its `lines` and its
fade.

- `imageStyle` returns a percentage width, automatic height and, when `x` is present, the clamped left margin. For
  `lines`, it returns automatic width and the height in lines (`linesHeightCss`); with `opacity` under `100%`, the CSS
  `opacity`. `data-md-image-width` records the percentage on the image.
- An Obsidian pixel-width picture uses `data-rapier-image-size` with `--md-image-width:Npx`; the sheet constrains it to
  its container.
- A drawing (an SVG picture) shown at its own size or at full column width carries `data-md-drawing` and
  `--md-drawing-width:Npx`, its own width. The sheet lets it shrink to its container only down to 12/14 of that width;
  past that its parent scrolls sideways. On paper it fits the page. Explicit pixel sizes and smaller layout widths keep
  the chosen size.

Rapier's layout projector receives the encoded marker in `data-md-layout` on the paragraph and
`data-rapier-image-layout` on the picture (`encodeURIComponent(marker)`; the kit's `parseLayoutAttribute` reads it).
`data-md-layout-tight` keeps the zero block margin of a tight list paragraph. `wrap`, `y`, `lines` beside words and
`rotate` are geometry for the renderer to project, not CSS attribute values the sheet can interpret. The projector owns
the derived positions, margins, transforms, stacking and line boxes; a rotated image reserves its turned bounds. The
style pack needs neither a CSS placement renderer nor the kit's line planner to style an ordinary document.

### Using markdown-it and the kit

The kit's README has a runnable example (the kit is not part of the standard). `markdown-it` supplies core HTML and GFM
tables, `installMarkdownImages` reads the picture definitions, and the kit's layout and typography readers interpret
the trailing layout comments, inline spans and page-break line. `typography.install(md)` uses the supplied parser; no
editor global is needed. The example wraps the result in `.md-render` and loads `style.css` alone.

- The caller supplies markdown-it and any extension plugins; the kit has no npm dependencies. It also exposes the
  `createRenderer` factory through `rapier-markdown-kit/render`, which takes its parser and other host ports from the
  caller.
- Task-list and footnote plugins emit the classes above; a renderer for callouts, highlights, diagrams or mathematics
  emits their listed wrappers.
- A host rendering untrusted source applies its own HTML sanitization policy before displaying it.

Rapier emits these class and attribute names. The remaining `rapier-*` presentation hooks will take `md-*` names in one
change with their producers and readers.

## The document as a web page

One HTML file shows the document in any browser with scripts off and returns the exact Markdown to editors that
implement this section. It carries the Markdown as plain text in exactly one `<script type="text/markdown">` element
without `id="rapier-base"` (a second one with that id carries an optional comparison base):

```html
<script type="text/markdown" data-filename="notes.md" data-kind="markdown" data-sha256="…"
        data-images="flow" data-image-definitions="FLOW">
# Notes

![The intake flow][flow]

[flow]: #flow
</script>
```

**Pictures.** The page's own `<img>` elements are the picture store.

- Each Markdown image destination that is a data URL the page shows is replaced, over its destination span, by a
  fragment `#id` naming the `<img id="…">` that holds those bytes. This applies only to an inline image's destination
  or an image reference definition's destination; the same bytes in a code block, a sentence or an ordinary link are
  never touched. `data-images` lists every id used this way.
- When the source delimits a destination with `<…>` (`![x](<data:…>)`, `[label]: <data:…>`), the writer keeps those
  delimiters: the carried destination is `&lt;#id>`, and resolving the id restores the exact original spelling. Nested
  brackets in an inline picture description don't change its destination.
- Ids match `[A-Za-z0-9][A-Za-z0-9._:-]{0,120}`: a definition's own label when it fits, otherwise `image-N`. A resolved
  `src` is a Base64 `data:image/png`, `jpeg`, `webp`, `gif`, `svg+xml` or `jxl` URL.

**Reference definitions** (`[label]: #id`) need one more check, because a hand-written fragment (`[nav]: #pic`) can
match a rewritten image definition's destination (`[pic]: #pic`).

- `data-image-definitions` lists the normalized reference label of every definition the writer actually rewrote,
  each percent-encoded (unreserved characters and `%XX`, so the list stays one space-separated run whatever the label
  holds). Normalization is markdown-it's `normalizeReference`: trim, collapse internal whitespace, then lowercase and
  uppercase, so `flow` is `FLOW`. A page that rewrites a definition must carry `data-image-definitions`.
- **Resolve only declared image definitions, never a definition whose destination merely looks like a picture id.**
- An inline image destination needs no label declaration: only a destination the writer structurally replaced carries
  a raw `#id`. Every authored `#` elsewhere, including image-looking examples in code, is carried as `&#35;` until
  after resolution.
- Two `<img id="…">` elements with the same id are ambiguous; the whole page is refused rather than one being chosen.

**Encoding.** The writer entity-encodes each untouched Markdown segment in this order: `&` → `&amp;`, `<` → `&lt;`,
authored `#` → `&#35;`, carriage return (CR) → `&#13;`. It writes a raw `#id` only at a picture destination it
replaced. This tells literal examples from replacements and keeps CR and CRLF through HTML newline preprocessing. One
newline is added after the opening tag and one before the closing tag.

**Reading.**

1. Restore `&#13;` to CR, for reference-line recognition.
2. Resolve the declared raw `#id` destinations, decoding a reference label before comparing it with
   `data-image-definitions`.
3. Restore `&#35;` → `#`, `&#13;` → CR, `&lt;` → `<` and `&amp;` → `&`, in that order. Ampersands decode last, so
   original entity-looking text stays literal.
4. Check `data-sha256`: the SHA-256 of the rebuilt source, with each `#id` replaced by its `<img>`'s `src` verbatim
   and authored delimiters kept. Changed pictures or text are refused.

- A leading UTF-8 BOM is included in the carrier and digest, and restored as file metadata when opened. With image
  compatibility off, the recovered source is the original file byte for byte.
- A page carries JPEG XL pictures as they are. With the Share sheet's image compatibility switch on, each is carried
  as the portable picture the page then shows (PNG, or JPEG for an opaque photo when smaller); without it the page
  needs a browser that decodes JPEG XL. Either way, the working file on the device keeps its own codec.
- Picture bytes are never duplicated between the page and the carried Markdown; a picture shown twice on the page is,
  as in any HTML, present twice.
- The page runs only its own scripts, under one nonce: the inlined line planner, so a wrapped picture sits where it
  does in the editor, and the code lexer when a code block needs coloring. `text/markdown` is not a script type any
  browser runs. With scripting off, a reader still sees the picture on its nearest side.
- The page declares `referrer` `no-referrer`, so following a link never tells the destination where the page lives.
- The digest covers the carried Markdown, not the rendered HTML; altered visible words don't change the recovered
  document. Open the page in Rapier or a reference reader to read its authentic source.

Shared pages need no browser to read or write. Two public reference readers use a string scan:
`tools/read-shared-page.mjs` (Node) and `tools/read-shared-page.py` (Python 3), each a small standalone script. They
restore CR; resolve only the raw ids in `data-images` against the page's own `<img id src>` (refusing a duplicate id);
resolve a reference definition only when its normalized label is also declared in `data-image-definitions`; decode the
remaining entities; verify `data-sha256`; and write the `.md` bytes without newline translation.

## Exporting for Pandoc or Quarto

The copy sheet's **for pandoc and quarto** toggle (off by default) rewrites only copied Markdown. Recognized
typography becomes [Pandoc bracketed spans](https://pandoc.org/MANUAL.html#extension-bracketed_spans) with their
combined CSS style, for example `[**words**]{style="font-size:13.5pt;color:#175dc4"}`. Highlight becomes
`[words]{.mark}` and a page break becomes `\newpage`. Code, literal examples, link destinations, references and front
matter are kept by the existing parser boundaries. Rapier doesn't read those attributes back as typography.

[Quarto also uses bracketed spans](https://quarto.org/docs/authoring/markdown-basics.html#divs-and-spans). The braces
are extension syntax that CommonMark-only readers show. Pandoc 3.1.11.1 keeps the CSS attributes in HTML, but its
ordinary LaTeX and DOCX writers don't map size and color CSS to native styling. Rapier's own Word exporter does the
native mapping above. A Pandoc filter or target-specific custom styles are a separate host choice; this convention
supplies no filter suite. Use Copy without typography when the destination needs plain semantic Markdown.

## Preservation and display

Opening, rendering and saving keep existing source, including reference spelling, image destinations and definition
positions. Only an intentional edit changes it; a save never reorders, recompresses or removes image definitions.
Unknown source and untouched metadata survive editing. Rendering never becomes document state. A file's newline style
and a leading UTF-8 byte-order mark are facts of the file: kept on open, written back on save and in Share's editable
source, never shown as characters.

CommonMark hides reference definitions. Renderers that don't know these conventions can ignore layout comments and
resolve images without a Rapier-specific parser. Display depends on the host allowing data images and supporting the
chosen codec; CommonMark syntax alone doesn't guarantee it. PNG, JPEG and WebP have wider codec support within the same
one-file mechanism.

Stripping comments loses optional layout, not image bytes. A processor that removes data URLs or reference definitions
can still lose images. A damaged or unsupported image keeps its source and description and doesn't stop the rest of
the document from being read.

The release run opens CommonMark/GFM, Bear, Obsidian, Pandoc-copy and RTL files (plus CRLF, a UTF-8 BOM,
trailing-whitespace hard breaks and a missing final newline) through Open, makes one unrelated edit, saves, and
compares the bytes with the original plus that edit. A Save-side rewrite that no sentence in this document or in
markdown-profile.md names fails.

The [layout reference](repo/spec/md-layout.mjs), the [typography and marks reference](repo/spec/md-marks.mjs)
and the [reference style](repo/spec/markdown-style.css) are MIT-licensed (`LICENSE-MIT` is the enumerated
statement). Application behavior and interoperability limits are in [standard-adoption](standard-adoption.md).
