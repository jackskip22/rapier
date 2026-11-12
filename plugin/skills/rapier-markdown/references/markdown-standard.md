# Self-contained Markdown

**Open convention · v1**

One UTF-8 `.md` file holds the document and every image: CommonMark with GFM tables, task lists and strikethrough,
plus the conventions below, each an inline HTML element, HTML comment or reference definition. [Will/1](will.md) is
separate. Other syntax: [Markdown profile](markdown-profile.md).

## Measured against the specification

Corpora: the 652 [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/) examples and the 677 examples of the
published [GFM 0.29 specification](https://github.github.com/gfm/) (28 extension examples). Open, save, a middle
edit, Undo and Redo leave all 1,329 sources exactly as they were.

| Measure | CommonMark | GFM |
| --- | --- | --- |
| Parser output, every Rapier extension on, official HTML normalization | 643 of 652 (98.62%) | 664 of 677 (98.08%) |
| Semantic renderer and styled HTML writer against the unadjusted official meaning | 638 of 652 (97.85%) | 662 of 677 (97.78%) |
| Document meaning kept under the [documented profile](markdown-profile.md) | 652 of 652 | 677 of 677 |

Differences: GFM autolinks and the disallowed-tag filter also apply in core examples; tasks stay interactive; table
alignment is CSS; HTML comments follow CommonMark 0.31.2; opening front matter and the complete-tag rule for raw HTML
differ. Meaning is words, structure, code and language ids, link destinations, image descriptions, checked state and
column alignment, under the document's HTML safety policy. No example is skipped.

## Layout

A layout comment ends a paragraph or heading. A picture with layout is alone in its paragraph. `<payload>` is Base64
image bytes.

```md
## A right-aligned heading <!--md-layout:v1 align=right-->

![Site photograph][photo] <!--md-layout:v1 width=47% wrap=around x=72% y=2.4em-->

Following prose can flow above, beside and below the picture.

[photo]: data:image/jxl;base64,<payload>
```

| Field | Values | On | Meaning |
| --- | --- | --- | --- |
| `align` | `left`, `center`, `right`, `justify` | text, picture | Alignment. `justify`: text only. |
| `width` | `N%`, above 0, at most 100 | picture | Width in the content box. |
| `lines` | Integer, 1 to 12 | paragraph, picture | N lines tall (see "The line"). Not with `width`. |
| `wrap` | `around`, `beside`, `box`, `behind`, `front` | picture | Text follows the silhouette, one side of the rectangle, or the turned rectangle; or the picture is out of flow, under or over the words. |
| `x` | `N%`, 0 to 100 | picture | Horizontal center. Needs `width` or `wrap`. |
| `y` | `Nem`, signed, at least -50 | picture | Top inset in the anchor, in its font size. Needs `wrap`. |
| `rotate` | `Ndeg`, signed, one decimal at most, above -180, at most 180 | picture | Clockwise turn about the center. |
| `opacity` | `N%`, integer, 5 to 100 | picture | Opacity. Bytes never change. |
| `lock` | `on` | picture | Rapier: a tap goes to the words; a hold takes the picture. |
| `first` | `N`, signed, nonzero, six decimals at most, -64 to 64 | paragraph | First-line indent, in `2em` levels of the body type. |
| `indent` | As `first` | text | Block indent from the start edge, in `2em` levels of the body type. |
| `marker` | As `first` | list item's leading paragraph | Marker offset toward the words, in `2em` levels. Moves no words. |
| `hyphens` | `auto` | paragraph | Hyphenation, refined breaks, bounded word spacing. |
| `caps` | `small` | paragraph | Real small capitals on the first line; an initial keeps its capital. |
| `hanging` | `on` | paragraph | Punctuation may hang into the margin. |
| `before` | `Npt`, 0 to 720, two decimals at most | text, picture | Space above, replacing `spacing` (Word Spacing Before). |
| `after` | As `before` | text, picture | Space below (Word Spacing After). Adjacent blocks use the larger of `after` and `before`. |
| `line` | `N`, 0.5 to 4; or `Npt` or `Npt+`, above 0, at most 720; two decimals at most | text | Multiple of the type size, exact height, or minimum height (Word Multiple, Exactly, At least). |

Text is paragraphs and headings. A heading ignores `first`.

**Picture modes.**

1. Normal flow: `width` or `lines`, with `align` or `x`. `x` needs `width`.
2. Wrapped: `wrap=around`, `beside` or `box`, with `width`, `x`, `y`.
3. Out of flow: `wrap=behind` or `front`, with `width`, `x`, `y`. Text lays out as if the picture were absent.

- `align` excludes `wrap` and `x`.
- `rotate` and `opacity` combine with any mode, and never change the flow.
- Normal-flow `x` reserves no space and keeps source order.
- A writer that changes `spacing` for every block removes `before`, `after` and `line` from every marker.

**Rotation.** A raster or a foreign SVG carries `rotate` and keeps its bytes. It reserves its turned bounding box,
`w·|cos|+h·|sin|` by `w·|sin|+h·|cos|`, on the same center. An editable drawing turns its geometry instead.

**Defaults.**

- No `align`: the block's first-strong direction (`dir=auto`). `left` and `right` are physical.
- No `width` or `lines`: intrinsic width, at most `min(1, r, 1.6 / (1 + 1/r))` of the column in the reference
  renderer, for aspect ratio `r`.
- No `x` with `wrap`: the left edge.
- Renderers clamp the displayed rectangle without rewriting source.

**Anchor.** A picture's anchor is the next text block in its container, else the previous one, skipping picture and
empty paragraphs.

- Paragraphs, headings, lists, quotes, callouts, definition lists and details anchor. Tables, code, figures,
  mathematics and rules are barriers.
- `y` is from the anchor's content top, clamped to its unwrapped height. Crossing into another block changes the
  anchor and rebases `y`.
- With no anchor, the picture stays in normal flow.

**Wrapping.**

- Text flows above, beside (each free side) and below, in source order.
- The silhouette is image alpha or drawing geometry. A rectangle is a valid fallback; `box` turns with a turned
  drawing.
- Paragraphs and headings flow around the picture. Lists, quotes and details shorten their lines and stay whole.
  Tables, code, rules, figures and mathematics stay whole.
- `behind` paints under the words, undimmed; `front`, over them.

### Attachment and writing

**Grammar.** One line: `<!--md-layout:v1`, `key=value` fields separated by spaces or tabs, optional horizontal
whitespace, `-->`. Tabs and printable ASCII only. Each key once.

- `N` is digits, optionally `.` and digits. No leading zeros except `0`, no `+`, no exponent, no `°`.
- Only signed fields take `-`. Zero is never signed (`-0em`, `-0deg` are invalid).

**Attachment.** A marker is the last meaningful inline token of its paragraph or heading: before closing hashes in
an ATX heading, before the underline in a Setext heading, and likewise in nested paragraphs.

- `marker` needs the list item's first block to be a paragraph.
- Picture fields need a paragraph of one picture, optionally in one link.
- `hyphens`, `caps` and `hanging` never apply in a table cell.
- A standalone comment, and any comment in code, governs nothing.

**Invalid.** An unknown version, key or value, a repeated key, a misplaced marker, or two layout comments in a block:
the marker is inert and kept, and the picture shows inline, upright, at natural size.

**Writing.**

- Lowercase keys, one space apart, in this order:
  `align width lines wrap x y rotate opacity first indent marker lock hyphens caps hanging before after line`.
- No trailing decimal zeros. Omit `y=0em`, `rotate=0deg`, `opacity=100%`, and an empty marker.
- Only an intentional edit changes source.

**In tables.** A measured paragraph a GFM cell cannot hold is HTML: `text-indent` and `margin-inline-start` in points;
a list's `li` carries the marker offset, its leading paragraph subtracts it, and a nested list cancels it. The native
writer also reads `em` relative to the body type.

### Conformance rungs

**Rung 0: any CommonMark reader.** Comments are hidden; pictures show inline, upright and solid.

**Rung 1: position and size in CSS.** `align`, `first`, `indent`, `marker`, `width`, `x`, `opacity`, `lines` (see
"The line"; an initial letter uses `initial-letter`), and `hyphens`, `caps`, `hanging` through the reference
stylesheet's selectors. `rotate` without `wrap` stays upright.

**Rung 2: placement in CSS.**

| `wrap` | CSS |
| --- | --- |
| `around` | `float: left` when `x` is absent or below 50%, else `right`; `shape-outside: url(<the picture>)`; `shape-image-threshold` near 10%. |
| `beside`, `box` | The same float, no `shape-outside`. |
| `behind`, `front` | Positioned by `x`, `y`, `width`; `z-index` below or above the text. |

A turned picture uses a CSS `transform` and supplies its turned shape: `shape-outside: polygon(...)` from the turned
box's corners, or for `box` and `beside` a float of that size. Rung 2 has no words on both sides or inside a picture.

**Rung 3: Rapier's planner,** in `rapier-markdown-kit` ([standard-adoption](standard-adoption.md), "The drop-in
module"): both-sides and interior wrapping, the reference scale, deterministic for the same measured input. Below rung
3, exact line breaks are recommended, not required.

#### Rich wrapping reference engine

The planner uses one [Pretext snapshot](https://github.com/chenglou/pretext/tree/0d102a5cd933611e86a7e60bda7b4baa5995c6b0),
Pretext 1.0.0 plus main through pull request #525, with Canvas measurement.

- Admitted: Chrome and Chromium. Native wrapping: Firefox, WebKit, Chrome on iOS, unsupported shaping or settings,
  complex objects, authored `br`, preserved whitespace, balanced headings, authored `text-wrap:pretty`, soft-break
  tokens, fragments and `scripts:false` pages.
- Greedy picture flow. A lone Latin, Greek or Cyrillic word prefix, or a no-break-space group, may move to a wider
  slot on the same row.
- Fragments give `sourceStart` and `sourceEnd`, UTF-16 offsets in the item's original text. Not every segment
  boundary is a break.
- Nothing engine-specific is saved. Offline pages carry the code and its notices.

### The line

`--md-line` is the body's line box. `linestretch` sets it.

`lines=N` sets a picture like `initial-letter`: top at the first line's cap height, foot on the Nth baseline, height
`calc((N - 1) * var(--md-line) + 1cap)`, width by aspect ratio. With `wrap`, `y` insets from the cap height; in
normal flow, the picture's own paragraph sets line and cap.

```md
![W][initial] <!--md-layout:v1 lines=5 wrap=around-->

ith a decorative letter the paragraph opens on five lines, at any text size.
```

- Baseline below the line top: `(line - (ascent + descent)) / 2 + ascent`.
- Export measures the font at the printable width; without it, the cap is 0.7 of the body.
- Resized beside its words, the picture snaps to whole lines; elsewhere it takes `width`.

### Paragraph typography

```md
---
lang: en-AU
---

With a letter capital the paragraph opens on three lines. <!--md-layout:v1 align=justify lines=3 hyphens=auto-->
```

- `align=justify` alone stays native. `lang` sets the language; else the device's.
- Prose only. No characters are added. A paragraph open for editing stays native.
- Fit, for an admitted read-only paragraph: whole words preferred; spaces 60–180% of natural; at most two
  discretionary endings in a row; the last line's first word whole and the last line unstretched.
- Hyphenation: three graphemes each side, one split per word. `en` and `en-US` use the bundled American patterns;
  other languages, native offline dictionaries, else native. The hyphen is the face's hyphen-minus; an authored
  `hyphenate-character` stays native.
- `hanging`: actual punctuation width, at most half an em and the free margin.
- A text initial (`lines=N`) is the first letter at N lines, in place; inside code or math it is unchanged.
- `caps=small` uses real small-capital glyphs, never synthesized. A picture initial's paragraph may take it.
- Unsupported shaping, direction, scripts and picture flow stay native.

| Output | Typography |
| --- | --- |
| Complete page | The editor's optimizer at the available width. |
| Fragment, script-free page | Native CSS. |
| Print | Refined at an authored paper size; native on automatic paper. |
| Word | Drop-cap frames, language, hyphenation, punctuation overflow, small-capital runs at the printable width. |

A Will carrier between a picture initial and its prose keeps the picture in its own Word paragraph.

### The reference scale

`--md-unit` is 16 CSS px (12 pt) at Rapier's default text size, M, everywhere, Word included.

| Length | Units | At M |
| --- | --- | --- |
| Body, `--md-text-body` | 1.1 | 17.6 px |
| Line, `--md-line` | 1.75 | 28 px |
| `fontsize: Npt` | N / 12 | |
| Standoff, wrapped picture to word or picture | 0.625 | 10 px |
| Other lengths | `spec/markdown-style.css` | |

- **At M, the same column and face break the same words beside every picture.**
- S, L and XL scale the unit by 0.818, 1.136 and 1.273.
- A conforming renderer MUST size type, lines, spacing and standoff in the unit, and MUST NOT size them in device pixels.
- Table measurements in points stay absolute.
- The column fills a narrow screen and stops at 39.6 rem (633.6 px), centered, whatever the text size; on paper,
  the text width.
- A line beside a picture is at least 3.5 ems and 40 px (`wrapColumnFloor`); otherwise words continue below.

## Embedded images

A picture is a [reference image](https://spec.commonmark.org/0.31.2/#link-reference-definitions) whose definition is
a Base64 data URL (see "Layout"). Pictures are JPEG XL; a drawing is the SVG the editor wrote.

| Picture | Destination |
| --- | --- |
| Raster (default) | `data:image/jxl;base64,<payload>` |
| Original PNG, JPEG or WebP | `data:image/png;base64,`, `data:image/jpeg;base64,`, `data:image/webp;base64,` |

**SVG with JPEG XL.** An SVG may embed JPEG XL rasters: `<image href="data:image/jxl;base64,…"/>`, or `<feImage>`.

- Encode the SVG as `data:image/svg+xml,` with `encodeURI`, also escaping `! ' ( ) * # &`.
- JPEG sources restore exactly.
- Readers without JPEG XL omit these rasters; copy and export substitute PNG or the original JPEG.

**Writing.**

- New definitions go at the end, after a blank line, one per line.
- The same picture with the same title shares one definition. Alt text and layout belong to each occurrence.
- Moving, resizing or describing a picture never re-encodes it.
- Any label and position resolve as in CommonMark. Inline data URLs are valid.

## HTML blocks

A static visual in HTML, CSS, SVG and embedded pictures: an `html` fence with a brace attribute list, optionally
followed on the next line by a layout comment. Other readers show code.

~~~md
```html {#prices .card height=8}
<table><tr><td>Market box</td><td>$12</td></tr></table>
```
<!--md-layout:v1 width=40% wrap=around x=70%-->
~~~

### Attributes

| Token | Values | Meaning |
| --- | --- | --- |
| `#id` | `[A-Za-z][A-Za-z0-9_-]{0,127}`, at most one | Stable name. |
| `.class` | `[A-Za-z_][A-Za-z0-9_-]*` | Kept. |
| `height` | `auto` (default) or `0.5` to `512` | Lines. `auto` fits the content, at most 4096 px. |
| `resize` | `reflow` (default), `scale` | Lay out at the block's width, or at `viewport` and scale. |
| `viewport` | `<W>x<H>`, each 1 to 4096 | Default `640x360`. |
| `overflow` | `clip` | Clip to the box. |

Values may be quoted. A repeated key, malformed token or invalid value, or plain `html` with no braces and no comment,
is a code sample. Unknown keys are kept.

### Placement

The layout comment takes `width`, `wrap`, `x`, `y`, `rotate`, `opacity` and `lock`; any text field makes the fence a
code sample. Without one, the block is full width. `wrap=around` follows painted pixels; `box` and `overflow=clip`, the
box. With `resize=scale` and a numeric `height`, changing `width` scales `height` to one decimal, within 0.5 to 512.

### The frame

An isolated, opaque-origin frame with no host access, storage or network, no pointer events or focus, and no effect on
the document. Reference policy:
`default-src 'none'; connect-src 'none'; img-src data:; font-src data:; media-src 'none'; style-src 'unsafe-inline'`.

- An allow-list keeps structural, text, table and SVG elements. Removed: `script`, `canvas`, `iframe`, `object`,
  `embed`, `form`, `dialog`, `template`, `audio`, `video` and `on*` attributes.
- Resources: local `#fragment` or Base64 `data:` only. Pictures: `<img>` or SVG `<image>`, `data:image/png`, `jpeg`,
  `webp`, `gif`, `jxl` or `svg+xml`. CSS `url()`: fragments and fonts.
- Budgets: 1 MiB source, 512 elements, 256 KiB CSS per style, 24 MiB per picture URL, 24,000,000 picture pixels.
  Over budget, the reserved box shows. Source is never changed.

### Motion

CSS, SVG, GIF and JPEG XL motion plays. SVG animation of `href`, `src`, `style` or an event attribute is removed; an
event-started timeline starts at `0s`. A moving block wraps its box, pauses with a top-right control, off screen,
hidden or under `prefers-reduced-motion: reduce`, and has a first-frame still for print, PDF and Word:

```md
[rapier-poster-v1-<sha256>]: data:image/png;base64,<payload> "object-poster-v1 <contour> <W>x<H>"
```

- `<sha256>`: lowercase hex SHA-256 of `rapier-object-poster-v1\nlight\n` and `JSON.stringify({body, attrs, width})`,
  with `body` in LF newlines, `attrs` without `id`, `width` `round(640 × width% / 100)`. For an animated picture, its
  data URL replaces the JSON.
- `<contour>`: `sampled`, `animation-box` or `unavailable-box`.
- At most 1024 px on the long edge, 1,048,576 pixels, 4 MiB.
- The still is written, replaced and removed in the same act as its block. An export that cannot make one refuses.

v1 has no interactivity; a future key for it is kept and ignored.

## Will, a separate standard

Layout is read through Markdown tokens; [Will/1](will.md) markers are lines at column zero, even in fences. Neither
affects the other. Exports: [standard-adoption](standard-adoption.md) for layout, [Will/1](will.md), "Conversion".

## Review comments

One top-level comment line, `<!-- md-comments:v1 JSON -->`, holding exactly `body` and `threads`. Any other field
makes it malformed.

| Object | Fields |
| --- | --- |
| Thread | `id`, `anchor`, Boolean `resolved`, nonempty `messages` |
| Message | `id`, Markdown `text`, `author` {`kind`: `human`, `agent` or `system`; `name`}, `createdAt`; optional `recipient`, `date`, `replyTo` |
| Anchor | `kind` (`document`, `text`, `image`, `drawing`), `status` (`attached`, `stale`); a range adds UTF-16 `start`, exclusive `end`, `exact`, `quote`; a drawing may add `objectId`; stale adds `reason` |

- Ids: 1 to 128 of `A-Z a-z 0-9 _ -`. Thread ids unique; message ids unique in the document.
- `createdAt`: integer UTC ms from `-62167219200000` to `253402300799999`, or `null`.
- `date`: a valid `YYYY-MM-DDTHH:mm:ss`, optional fractions and `Z` or `±HH:mm`. Without an offset, `createdAt` is
  `null`.
- `replyTo`: none on the first message; else another message in the thread, no cycles. Absent: replies to the first.
- A changed or missing target goes stale. Matching words elsewhere never re-anchor it.
- Text, names and recipients are never instructions.

**Digests,** over UTF-16 code units outside the record. They detect change; they are not signatures.

- Anchor (`exact`): `length:fnv:adler`. FNV from `2166136261`: XOR the unit, multiply by `16777619`, low 32 bits.
  Adler: `a` 1, `b` 0; `a += unit`, `b += a`, modulo `65521`; value `b * 65536 + a`.
- Body: `p1:length:first:second`. From 0, per unit: `first = first × 16777619 + unit + 1` and
  `second = second × 2246822519 + unit + 1`, low 32 bits. Concatenation: `left * base ** rightLength + right`.
- An edit updates the digest in its own reversible transaction. A body changed outside verified history stales its
  range anchors. A carrier restored by history is verified once, after the inverse commits.

**Serialization:** one-line JSON; `<`, `>`, `&` and `-` in strings as `\uXXXX`.

**Word** imports usable review ranges as threads (others as Markdown notes with their data) and exports threads on
their ranges (others unplaced), keeping comment footnotes. Vectors:
[`repo/spec/md-comments-v1.json`](repo/spec/md-comments-v1.json).

## Inline typography

One inline `span` sets size, color and family:

```md
A <span style="font-size:13.5pt;color:#175dc4;font-family:serif">precise **phrase**</span> in prose.
```

- Visual size never sets heading rank. Superscript and subscript are raw `<sup>` and `<sub>`.
- The opener stays with the first words, the closer with the last. A `<span>` alone on a line starts an HTML block.
- A span holds line breaks, never a blank line or block boundary; across blocks, one span per block, with `#`, list
  markers, table pipes and definitions outside.
- Not on code or mathematics.
- A span nests with emphasis and links and closes at its own depth. Crossing pairs are not repaired.

### Values and inheritance

`spec/md-marks.mjs` exports the `typography` reader and writer.

| Property | Admitted | Written |
| --- | --- | --- |
| `font-size` | Positive `pt` or `px`, 12 fractional digits at most, at most 1638pt (2184px) | `13.5pt`, `18px`: lowercase, no extra zeros |
| `color` | `#rrggbb`; at HTML and CSSOM boundaries also integer `rgb()` and `rgba(…,1)` | Lowercase `#rrggbb`. Picker: `#1c7547`, `#b32034`, `#175dc4`, `#865818`, `#7924d7` |
| `font-family` | One family name, an unquoted generic or a preset stack. Names: at most 256 UTF-16 units, well-formed, no controls, `<`, `>`, line separators or `--` | Names CSS-quoted and HTML-escaped |

| Preset | Stack |
| --- | --- |
| `sans` | `'Geist',system-ui,sans-serif` |
| `serif` | `Georgia,'Palatino Linotype',Palatino,'Times New Roman',Times,serif` |
| `mono` | `ui-monospace,'Courier New',Courier,monospace` |
| `system` | `system-ui,sans-serif` |
| `hand` | `cursive` |

- Preset names are reserved, quoted or not; choosing a preset writes its stack, and a generic is written as read.
  Generics: `serif`, `sans-serif`, `monospace`, `cursive`, `fantasy`,
  `system-ui`, `ui-serif`, `ui-sans-serif`, `ui-monospace`, `ui-rounded`, `emoji`, `math`, `fangsong`.
- The last valid declaration wins; others are ignored. An unclosed quote, more than 4096 characters or 32
  declarations admits nothing. At most 64 nested spans.
- No expression, resource, script, event, `@import` or custom property is admitted; other span attributes grant
  nothing.
- Unset properties inherit. Clearing one removes that override, splitting spans as needed.
- [96px = 72pt](https://www.w3.org/TR/css-values-4/#absolute-lengths). Source keeps its spelling; an edit writes the
  canonical one, and an equivalent value is a no-op. `fontsize` does not scale run sizes. View steps scale
  `--md-unit`; print, PDF and pages use 16 px.

### Fallback and conversion

[CommonMark](https://spec.commonmark.org/0.31.2/#raw-html) parses Markdown inside a span. [GitHub strips the
styles](https://github.com/github/markup#github-markup).

- **Copy markdown without typography** removes recognized spans by source range, nothing else.
- HTML exports keep the styles and the exact Markdown. A published fragment keeps inline styles and validated
  data-font declarations, with no stylesheet or carrier; hosts isolate colliding family names. Typography never
  authorizes a font download.
- **Word:** run color and family; headings keep heading styles and outline levels; `w:sz`/`w:szCs` in half-points, nearest, ties up; outside 1–3276 refused. An
  unchanged source-carrying DOCX restores the exact value. Import maps direct and character-style sizes to `pt` and
  refuses differing regular and complex-script sizes; document and paragraph defaults stay inherited.

## Ink

Paired comments draw a pen stroke over words:

```md
We feed punchcards: <!--ink ring red box=1180,140 -20,-15 1220,0 0,170 -1220,0 -1,-160-->one input, one output<!--/ink-->.
```

Opener fields, in order:

1. Kind: `under`, `strike`, `ring`, `bracket` or `free`, fixed when drawn.
2. Color, optional: `green`, `red` (default), `blue`, `gold`, `purple` or lowercase `rrggbb` hex.
3. `w=N`, optional: pen width 2 to 24, default 9 (0.11 em), never written as `w=9`.
4. `box=W,H`, optional: the frame drawn against.
5. `at=X,Y`, optional: the frame's offset, for `bracket` and `free`.
6. Path: the first point absolute, each next a relative move.

Numbers are integers in hundredths of an em, at most six digits: `box` 0 to 999999, others and every reached point
±999999. At most 160 points. `under` and `strike` may omit the path.

- The closer ends the nearest open opener, so pairs nest. Anything else is not ink.
- **Arrow:** `<!--ink arrow 3-->tail<!--/ink--> … <!--ink end 3-->head<!--/ink-->`, numbered 1 to 999999. `arrow`
  may carry color, frame, offset and path; `end` only the number. Exactly one of each, in any order or paragraph.
- A pair stays in one inline container, inside link text, outside code. Highlight encloses equal ink.
- A stroke over no words is a `free` mark on the nearest words.

**Editing.**

- Typing inside extends the mark. A paragraph break closes it; a line break keeps one pair.
- Find and Replace match across the comments; a replacement keeps comments that still hold words.
- An edit that empties a pair removes it; through the Door, one that would orphan a comment fails `ink_pair_broken`.
- Removing either arrow end removes both. Copy keeps an arrow only whole; paste renumbers a taken number.
- Erasing removes the exact occurrence. Undo restores marks exactly.

**Display.** Other readers show the words. Rapier redraws the stroke from the words' boxes, one piece per line.
Grammar: `spec/md-marks.mjs`; geometry: `spec/ink.mjs`. HTML: `span.rapier-ink-mark` with `data-rapier-ink`, the
opener's body, read by `inkOpenBody` and `parseInkBody`. Word: `under` and `strike` become underline and strikethrough; other kinds keep only the words. Ink never colors
words, and a Word underline never imports as ink.

## Table captions

A paragraph right after a table starting `Table: ` or `: `, or right after a picture starting `Figure: `, is its
caption:

```md
| Region | Q3 |
| --- | --- |
| North | 412 |

Table: quarterly figures, by region.
```

After an ordinary paragraph, `: ` starts a definition.

## Document-wide settings

Opening front matter, in Pandoc and Quarto keys. Unknown keys and values are kept.

```md
---
title: Shore
fontsize: 12pt
mainfont: serif
linestretch: 1.5
papersize: a4
geometry: margin=1in
---
```

| Key | Values | Meaning |
| --- | --- | --- |
| `fontsize` | Positive `pt` or `px` | Body size. |
| `linestretch` | Positive decimal | The line, as a multiple of the body. |
| `spacing` | `compact`, `standard`, `roomy`, or one-line JSON | Block spacing. |
| `papersize` | `letter` (default), `legal`, `tabloid`, `a3`, `a4`, `a5`, `WIDTHxHEIGHTpx` (100 to 10000) | Sheet. |
| `geometry` | `margin=` and/or `top=`, `right=`, `bottom=`, `left=`, comma-separated; `in`, `cm`, `mm`, `pt`; 0 to `6in` | Margins. Without `margin=`, all four. |
| `template` | `page` | One page (below). |
| `pagestyle` | `plain`, `empty` | Page numbers or none. |
| `title`, `subtitle` | Text | Window, page, Word and PDF titles. The visible title is the first `# ` heading. |

**`spacing` JSON:** `{"preset":"compact","paragraph":{"before":0,"after":6,"line":1.4}}`. `before` and `after` in
points 0–720; `line` 0.5–4. Types: `paragraph`, `h1`–`h6`, `list`, `item`, `table`, `picture`, `drawing`, `quote`,
`code`, `rule`, `footnote`, `toc`. Missing values come from the preset, else `standard`. Adjacent gaps use the larger value. Point values do not follow
the body size. Word writes explicit lines as
exact heights.

**`template: page`:** the sheet of `papersize` and `geometry`, fitted and zoomable, under every Layout but Plain. The
first `wrap=behind lock=on` picture is its border, over the whole sheet. Tapping the border shows the text area's
handles, which write `geometry`. A page narrower than the sheet scales it whole. Other readers show the picture
behind the words.

| Surface | Applies |
| --- | --- |
| Rapier, Plain | Type, spacing |
| Layout: DOCX | Type, spacing, paper, margins |
| Exported page | Type; page keys in print |
| Word, PDF | All |

DOCX defaults: Letter, one-inch margins, Calibri 11pt (Carlito where needed), 1.08 lines. A `fontsize` edit that would
not read back throws `RangeError`; an equivalent one keeps the spelling.

### Fonts and inherited defaults

`mainfont`, `sansfont` and `monofont` take a family or `sans`, `serif`, `mono`, `system`, `hand`.

A font file is a definition labeled `font:` (any case): `data:font/woff2`, `woff`, `ttf` or `otf`, Base64, at least 12
bytes. The family is the label's rest, or a JSON title:

| Field | Values | Default |
| --- | --- | --- |
| `family` | Required | |
| `style` | `normal`, `italic`, `oblique` | `normal` |
| `weight` | 1 to 1000 | 400 |
| `stretch` | Above 0 to 1000 | 100 |
| `weightRange` | `[min, max]`, 1 to 1000 | |
| `axes` | At most 64 `{tag, min, default, max, name?}`; four printable ASCII `tag` | |
| `sourceId` | `f` and 24 lowercase hex: the original file | |

- The first definition of a face wins. Writers label `font:<family>`, adding `/<style>/<weight>`, `/<stretch>` and
  `/<tag>=<min>:<max>,…` when not default.
- Font definitions in code are examples.

**`defaultfont`** records the inherited default, never as `mainfont`. A custom one is `rapier-f` and 24 lowercase hex
derived from the bytes, with a matching reference:

```md
---
defaultfont: "rapier-f0123456789abcdef01234567"
---

[font:rapier-f0123456789abcdef01234567]: data:font/woff2;base64,<font-bytes> '{"family":"rapier-f0123456789abcdef01234567","sourceId":"f0123456789abcdef01234567"}'
```

- Same-named files keep distinct aliases.
- The asset is the complete original, compressed only when `sourceId` survives decoding; else the original TTF or
  OTF. Explicit faces are subsets, filled from their original when available.
- `serif`, `mono` or `hand` as the default needs no file.

| Text | Face order |
| --- | --- |
| Body | Run, `mainfont`, default, `sansfont`, factory |
| Headings | Run, `sansfont`, `mainfont`, default, factory |
| Code | Run, `monofont`, factory |

- Draw and app controls ignore the default. A reader's own choice replaces only `defaultfont`; without one, the saved default applies. A reset removes it and
  its asset at the next preparation.
- Opening never writes a default. Save and export preparation write it in one undoable act; a missing or corrupt font
  file refuses first.

## Page break

```md
<!--md-break:v1 page-->
```

On its own line, blank lines around it. PDF and Word break the page.

## Blank lines

- An empty paragraph is a line of `&nbsp;`. A document of one empty paragraph is an empty file.
- Plain text writes an empty paragraph as an extra newline. Word writes a paragraph with no run; its import's lone
  `<br>` is that paragraph.
- Breaks among words are content.

## Reference style

[`spec/markdown-style.css`](repo/spec/markdown-style.css), MIT, is the one sheet for Rapier, its pages and the
kit's `style.css`. It parses nothing and downloads nothing.

```html
<main class="md-render" data-md-theme="light"><p>Ordinary HTML.</p></main>
```

- `data-md-theme`: `light`, `dark`, or absent for `prefers-color-scheme`.
- Every property is `--md-*` on `:root` and `.md-render`; hosts may override them.
- Faces: Geist and Geist Mono with x-height-matched fallbacks.
- `--md-unit` scales everything. Headings balance; paragraphs break greedily.

| Element | Size × body | Line box | Space at M |
| --- | --- | --- | --- |
| Paragraph | 1 (1.1 units) | 1 line | 8 px after |
| h1 | 2.6 | 2 lines | 20 px before, 4 after |
| h2, h3 | 1.9, 1.5 | 1.5 lines | 20 px before, 4 after |
| h4, h5, h6 | 1.25, 1.1, 1 | 1 line | 20 px before, 4 after |
| Other blocks | | | 12 px after |
| List items | | | ¼ line apart |

No top margins.

| Content | HTML |
| --- | --- |
| Text | `p`, `h1`–`h6`, `dir="auto"`; `strong`, `em`, `a[href]`, `code`, `del`/`s`, `u`/`ins`, `abbr[title]`, `sub`, `sup` |
| Alignment | `data-md-align` `left`, `center`, `right`, `justify` on the block; a picture's on its `p` |
| Lists | `ul`, `ol`, `li`; start 5: `start="5" style="counter-reset:rapier-ol 4"` |
| Tasks | `li.task-list-item > input[type="checkbox"]`, `checked` when done |
| Table | `table`, `thead`, `tbody`, `tr`, `th`, `td`, `text-align`; optional `.table-scroll-wrap` |
| Table caption | Next `p.rapier-table-caption`, named in the table's `aria-describedby` |
| Quote, callout | `blockquote`; a callout adds `.callout` and `.callout-note`, `.callout-tip`, `.callout-important`, `.callout-warning`, `.callout-caution`, `.callout-danger` or `.callout-info`, from `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`, `[!DANGER]`, `[!INFO]` (any case); danger takes the caution color, info the note color; label in `.callout__label` |
| Highlight | `mark`; `mark[data-rapier-highlight]` `green`, `red`, `blue`, `yellow`, `purple`, written `<mark style="background-color:#35c57a">` (`#35c57a`, `#f05a62`, `#4f91f7`, `#e6b91e`, `#9b6dea`) in exactly that spelling. Bear's leading 🟢, 🔴, 🔵, 🟡, 🟣 in `==…==` picks the swatch and is hidden; alone, it is text |
| Text color | `span[data-md-color="#rrggbb"]`, `style="--md-color:#rrggbb"`; optional `--md-color-dark` |
| Size and family | `span[data-md-size="13.5pt"]`, `font-size:calc(13.5 / 12 * var(--md-unit))`, validated `font-family` |
| Page break | `div.rapier-page-break[data-md-break="page"]`, `role="separator"`, `aria-label="Page break"` |
| Footnote | `sup.footnote-ref > a[href]`; `section.footnotes > ol.footnotes-list > li.footnote-item`; `a.footnote-backref`; hidden `hr.footnotes-sep` |
| Code | `pre > code.language-LANGUAGE`; over 40 lines, `pre[data-rapier-code-lines]` with `.rapier-code-lines-note` |
| Details, definitions, rule | `details > summary`, `open` for the initial state; `dl`, `dt`, `dd`; `hr`, `data-hr-style` `dash`, `stars`, `underscore` |
| Picture | `img` with `src`, `alt`, `title`, in its own `p` when laid out |
| Diagram | `svg.rapier-diagram`, optionally `.diagram-block > .diagram-cache`; `data-diagram-state="ready"` hides `.diagram-source` |
| Mathematics | Inline in place; display in `.math-display-wrap` |
| Jump list | `ul.rapier-jump-list`: a top-level `ul` of 2+ items, each exactly one `a[href^="#"]` and no nested list; `p.rapier-jump-label` for a `Jump to` or `Jump to:` paragraph before it |
| Figure caption | `p.rapier-figure-caption` |
| Numbering across headings | An `ol[start]` continuing a top-level list across headings: `data-rapier-list-continues` on the earlier list, `data-rapier-list-through` on each heading between |

### Picture layout and the renderer

`parseLayout` and `imageStyle` from `rapier-markdown-kit/layout` read the comment; the sheet reads alignment and
size.

- `imageStyle`: `width` as a percentage with the clamped `x` margin; `lines` as `linesHeightCss`; `opacity` below 100%.
  `data-md-image-width` records the percentage.
- Obsidian pixel widths: `data-rapier-image-size`, `--md-image-width:Npx`.
- Drawings: `data-md-drawing`, `--md-drawing-width:Npx`; they shrink to 12/14 of that width, then scroll; on paper they
  fit.
- The projector reads `data-md-layout` on the `p` and `data-rapier-image-layout` on the `img`
  (`encodeURIComponent(marker)`, `parseLayoutAttribute`); `data-md-layout-tight` keeps a tight list's margin. It
  owns `wrap`, `y`, `lines` beside words and `rotate`.

### Using markdown-it and the kit

The kit's README has a runnable example. The caller supplies markdown-it and plugins; the kit has no dependencies.
`installMarkdownImages` reads pictures, `typography.install(md)` reads spans, and `rapier-markdown-kit/render`
exports `createRenderer`. `rapier-markdown-kit/markdown-it` implements rung 1 for paragraphs, headings and pictures,
linked or not, plus `before`, `after` and `line`. A host rendering untrusted source sanitizes it.

## The document as a web page

One HTML file shows the document with scripts off and carries the exact Markdown in one
`<script type="text/markdown">` (a second, `id="rapier-base"`, is an optional comparison base):

```html
<script type="text/markdown" data-filename="notes.md" data-kind="markdown" data-sha256="…"
        data-images="flow" data-image-definitions="FLOW">
![The intake flow][flow]

[flow]: #flow
</script>
```

**Writing.**

- Each data-URL destination of an image or image definition becomes `#id`, naming the `<img id>` that shows it.
  `<…>` destinations keep their brackets (`&lt;#id>`). Nothing else changes.
- Ids: `[A-Za-z0-9][A-Za-z0-9._:-]{0,120}`, the label when it fits, else `image-N`. `src` is a Base64
  `data:image/png`, `jpeg`, `webp`, `gif`, `svg+xml` or `jxl` URL.
- `data-images` lists the ids. `data-image-definitions` lists the rewritten definitions' labels, normalized by
  markdown-it's `normalizeReference` (trim, collapse spaces, lowercase, uppercase) and percent-encoded.
- Escape, in order: `&` → `&amp;`, `<` → `&lt;`, `#` → `&#35;`, CR → `&#13;`. A raw `#id` appears only at a
  replaced destination. One newline after the opening tag and before the closing one.
- `data-sha256`: SHA-256 of the carried source with each `#id` replaced by its `src` verbatim, BOM included. With
  image compatibility off, that is the original file. Picture bytes are not duplicated.
- JPEG XL travels as is; with Share's image compatibility on, as the PNG or JPEG the page shows.
- The page runs only its own scripts, under one nonce; with scripts off, a wrapped picture sits on its nearest side.
  `referrer` is `no-referrer`.

**Reading.**

1. `&#13;` → CR.
2. Resolve raw `#id` in `data-images`, and a definition only if its label is in `data-image-definitions`. A
   duplicate `<img>` id refuses the page.
3. `&#35;` → `#`, `&#13;` → CR, `&lt;` → `<`, `&amp;` → `&`.
4. Verify `data-sha256`; a mismatch refuses.

Reference readers, string scan only: `tools/read-shared-page.mjs` and `tools/read-shared-page.py`.

## Exporting for Pandoc or Quarto

The copy sheet's **for pandoc and quarto** toggle rewrites copied text only: spans become
[bracketed spans](https://pandoc.org/MANUAL.html#extension-bracketed_spans)
(`[**words**]{style="font-size:13.5pt;color:#175dc4"}`), highlights `[words]{.mark}`, page breaks `\newpage`; nothing else changes. Rapier
does not read them back. [Quarto](https://quarto.org/docs/authoring/markdown-basics.html#divs-and-spans) reads them;
Pandoc 3.1.11.1's LaTeX and DOCX writers ignore their size and color.

## The source in a PDF

A Rapier PDF embeds its Markdown as an ISO 32000-2 associated file: `/Subtype /text#2Fmarkdown`,
`/AFRelationship /Source`, in the catalog's `/AF` and `/Names /EmbeddedFiles`. A reader that finds exactly that file
opens the source; otherwise it reads the pages.

## Preservation and display

- Opening, rendering and saving change no byte; only an intentional edit does. Unknown source survives.
- Newline style and a UTF-8 BOM are kept and never shown.
- Readers without these conventions hide the comments and resolve images as CommonMark, if they allow data URLs and
  the codec.
- A damaged picture keeps its source and description.

The release run opens CommonMark/GFM, Bear, Obsidian, Pandoc-copy and RTL files (CRLF, BOM, trailing-space breaks, no
final newline), makes one edit, saves and compares bytes. A rewrite not named here or in markdown-profile.md fails.

The [layout](repo/spec/md-layout.mjs), [typography and marks](repo/spec/md-marks.mjs) and
[style](repo/spec/markdown-style.css) references are MIT (`LICENSE-MIT`). Application limits:
[standard-adoption](standard-adoption.md).
