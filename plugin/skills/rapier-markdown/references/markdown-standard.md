# Self-contained Markdown

**Open convention · v1**

One UTF-8 `.md` file holds the document and every image. CommonMark is the
foundation; GFM may add tables, tasks and strikethrough. Images use ordinary
CommonMark reference definitions with Base64 data URLs. This standard's own
visual extension is the optional `md-layout:v1` comment; everything else
Rapier's parser admits beyond this document — established extensions, read
syntax and the project's own invisible conventions — is classified in the
[Markdown profile](markdown-profile.md).

The source owns content, reading order and visual intent. The renderer supplies
typography and responsive geometry. There is no required application, account,
service or rendering engine. The layout comment is a small convention on top
of CommonMark, not an addition to its grammar.

Three layers, each complete without the next. **The core** is CommonMark and GFM
as written: what every Markdown reader shows. **The conventions** are this
document's: the layout comment, text colour, the page break and the picture
appendix, each an HTML comment or an ordinary reference that other readers
ignore. **Will** is not part of this standard: [Will/1](will.md) is a separate
standard, optional, with its own version, for a person's instruction to an
agent about what may change; a reader of this document need not read it, and a
document with no Will is complete. **The style pack** is the same kind of companion:
one stylesheet, MIT, shipped with the kit and carried by the exported page, that
draws a document the way Rapier draws it (the lists, the tables, the pictures and
their layouts, colour, highlights, diagrams and math); optional, and a document
rendered without it is complete. The standard itself stays as broadly agreeable and
simple as it can be.

## Measured against the specification

| Measurement (2026-09-18) | Result and disposition |
| --- | --- |
| CommonMark 0.31.2; supplied 652 examples, 26 sections | **648/652 (99.39%)**; ratchet 648. Parser output, not a claim of complete CommonMark conformance. |
| GFM; supplied cmark-gfm `spec.txt` snapshot, CommonMark 0.29 base; no upstream commit/tag recorded; 672 examples, 30 sections | **650/672 (96.73%)**; ratchet 650. Its 24 extension-section examples: **17/24**. |
| Comparator and fixture identity | Specification's own `normalize.py` behavior ported to Node, plus its runner's CRLF conversion; **zero additional HTML equivalences**. Original fixture files are SHA-256-pinned in `_markdown-standard-lib.mjs`. GFM visible tab markers are decoded in both fixture fields as upstream does; the two `disabled` task-list examples are nevertheless tested. |
| Attribution: CommonMark | Conforms 648; identical-to-bare divergence 4; ours (bare conforms) **0**; both diverge differently 0. Bare uses the same `RAPIER_MARKDOWN_SPEC.options`, including `linkify: true`. |
| Attribution: GFM | Conforms 650; identical-to-bare divergence 18; ours (bare conforms) **0**; both diverge differently **4**. Bare conforms on 644 rows. |
| Every ours row | **None** in either supplied corpus; no own-rule failure removed, carried or hidden. This comparison does not absolve options shared with the bare parser. |
| GFM 279 and 280: both diverge differently | **Deliberate / founder's call**: interactive task controls and styling classes retained, rather than replacing them with disabled bare specification markup. Bare markdown-it renders literal task markers. |
| GFM 625 and 626: both diverge differently | **Carried**: fuzzy-link activation exposes upstream URL-boundary differences; bare markdown-it does not link these URLs. Not classified as an identical upstream failure. |
| GFM 491: identical-to-bare divergence before this measurement's fix | **Fixed** in shared renderer: `~~text~~` emits `del`, retaining `s_open`/`s_close` source tokens and authored raw `s` HTML. GFM improves from 649/672 to 650/672; CommonMark remains 648/652. |
| GFM Tabs and nested strong emphasis | Ten apparent Tabs failures were fixture-decoding errors, not specification changes. All nine nested-strong differences also exist against CommonMark 0.29: GFM snapshot dialect differences, not a 0.29-to-0.31.2 regression. None is silently exempted. |
| Unedited editor source-model round trip | **1,324 identical; 0 documented-normalization; 0 FAIL**; bytes and raw rendered HTML both equal. Additionally, all 672 literal, undecoded GFM fixture sources are byte-identical and render-identical. Node block split/finalize/rejoin; no browser interaction claim. |
| Reproduce and inspect every section / failing example | Both comparisons are checks in Rapier's own release run over the public CommonMark and GFM example corpora; the numbers above are their most recent result. |

## Layout

Attach one trailing comment to a paragraph or heading:

```md
A centered paragraph. <!--md-layout:v1 align=center-->

## A right-aligned heading <!--md-layout:v1 align=right-->
```

For image layout, put the image in its own paragraph. Its alt text describes
the image; one comment carries its layout. In these schematic examples,
`<payload>` stands for the image bytes encoded as Base64.

```md
![System diagram][diagram] <!--md-layout:v1 width=47% align=center-->

![System diagram][diagram] <!--md-layout:v1 width=47% x=72%-->

![System diagram][diagram] <!--md-layout:v1 width=47% wrap=around x=72% y=2.4em-->

![System diagram][diagram] <!--md-layout:v1 width=47% wrap=around x=72% rotate=15deg-->

![System diagram][diagram] <!--md-layout:v1 width=47% wrap=behind x=50% opacity=30%-->

Following prose can flow above, beside and below the picture.

[diagram]: data:image/jxl;base64,<payload>
```

| Field | Values | Meaning |
| --- | --- | --- |
| `align` | `left`, `center`, `right`, `justify` | Paragraph or heading alignment; `justify` is text-only. |
| `width` | Decimal percentage greater than `0%`, at most `100%` | Image width relative to the content box, preserving aspect ratio. |
| `wrap` | `around`, `box`, `behind`, `front` | Neighboring text may flow around the image silhouette (`around`) or its tight, angle-tilted bounding box (`box`); or the image may leave the flow entirely, positioned like a wrapped image but painted under (`behind`) or over (`front`) the words, which lay out as though it were absent. |
| `x` | Decimal percentage from `0%` to `100%` | Image's requested horizontal center within the content box; requires `width` or `wrap`. |
| `y` | Finite decimal followed by `em`, optionally negative (never below `-50em`; zero is written unsigned and omitted) | Wrapped image's requested top inset within its anchor paragraph, measured in that paragraph's font size; a negative value lifts the picture above the paragraph's first line. |
| `rotate` | Integer or one-decimal-place decimal followed by `deg`, greater than `-180` and at most `180` | Image's clockwise turn in degrees about its own centre; omitted when `0`. Valid alongside any placement — inline, any `wrap`, or `align` — and on its own. |
| `opacity` | Whole percentage from `5%` to `100%` | Image's fade: the whole picture is drawn at this opacity over whatever lies beneath it, as a layer's opacity is; omitted at `100%`. The picture's own bytes, and its own transparent parts, never change. Valid alongside any placement and on its own. |

Text uses only `align`. Images have exactly three modes: normal flow with optional
`width` and either `align` or `x`; wrapped flow with `wrap=around` or `wrap=box` and optional
`width`, `x` and `y`, where neighboring text reflows around the image; and out-of-flow placement
with `wrap=behind` or `wrap=front` and the same optional `width`, `x` and `y`, where the image is
positioned exactly as a wrapped image is but neighboring text ignores it entirely and the image is
painted under or over the words instead. Normal-flow `x` requires `width`; `y` always requires a
`wrap` value. `align` cannot coexist with `wrap` or `x`. A normal-flow horizontal position does
not change the image's source order or reserve floating space beside it. `rotate` and `opacity`
are independent of every other field and every mode; neither requires or excludes `width`, `wrap`,
`x`, `y` or `align`. A fade never changes the flow: `wrap=around` follows the picture's own
silhouette at any `opacity`, and a reader that does not know `opacity` treats the whole comment as
invalid, the standard's ordinary degrade.

An image that cannot turn its own bytes losslessly (any raster, or a foreign SVG the writer did
not itself compose) carries its turn as `rotate` instead: the picture's reserved space becomes its
turned bounding box — `w·|cos|+h·|sin|` wide, `w·|sin|+h·|cos|` tall for a `w`×`h` picture rotated
`rotate` degrees — centred where the unturned picture's centre was, so text or a following block
never overlaps the turned corners. An editable drawing (an SVG a compliant editor wrote and can
still edit) instead turns its own geometry and writes no `rotate`: the same picture, one owner for
its angle. A reader that does not know `rotate` treats the whole comment as invalid, the same as
any other unrecognised field, and shows the picture inline and upright, at its own natural size —
the standard's ordinary degrade for an unrecognised layout marker.

Absent alignment means natural/default alignment, including the Unicode first-strong writing
direction of the block (HTML `dir=auto` semantics on the rendered projection; source stays
plain Unicode). Explicit `left` and `right` mean physical sides and survive writing. Without `width`, an image uses its
intrinsic width constrained to the content box. A wrapped image without `x`
starts at the left edge. Renderers clamp the displayed rectangle to the
available width without rewriting source.

One neighbouring text block anchors the image: the one right after it in
the same container, else the one right before, skipping other image
paragraphs and empty paragraphs. Paragraphs, headings, lists, quotes/callouts,
definition lists and expanding sections can anchor a picture, including text
with links and checkboxes. Tables, code, figures, mathematics and rules remain
barriers. `y` is an inset from the text block's content top; absence means zero.
A renderer clamps the requested top to the block's unwrapped content height
before converting to pixels. Crossing into another text block changes the
anchor and rebases the inset. An image with no eligible neighbour either way
stays in normal flow. There are no page coordinates or saved line fragments.

Wrapping permits text above, on either available side and below the image,
while preserving source reading order. A renderer may derive a silhouette from
image alpha or an editable drawing's geometry, retaining separate horizontal
runs where gaps exist. A rectangle remains a valid conservative fallback. `wrap=box`
asks explicitly for that tight rectangle instead of the silhouette; for a rotated
drawing the rectangle tilts with it. Beside the anchor, every prose paragraph
and heading the image reaches flows around it, and a list, a quote or a
details block shortens its own lines beside it while staying intact as a
structure; a table, code, a rule, a figure or mathematics stays whole below or
beside the image. Fonts, spacing and precise line
breaks belong to the renderer; collision avoidance may adjust displayed geometry
without rewriting source.

`wrap=behind` and `wrap=front` opt out of this reflow entirely: the anchor paragraph and every
block after it lay out exactly as though the image were absent, positioned the same way a wrapped
image is (`x`, `y`, `width`) but never adjusting a line. `behind` paints the image under the words
and never dims it; `front` paints it over them. A renderer that does not recognize `behind` or
`front` treats the whole comment as invalid, the same as any other unrecognized value, and shows
the image inline.

### Attachment and writing

The marker is one line beginning exactly `<!--md-layout:v1`, with one or more
unquoted `key=value` fields separated by ASCII spaces or tabs, ending `-->`. Each key
occurs once. Geometry uses decimal digits, optionally followed by a
decimal point and digits, then `%` for `width`/`x` or `em` for `y`; no leading
zeroes except `0`, plus signs or exponent notation. `y` may begin with `-`, within
its stated range. Horizontal whitespace before the close is accepted. `rotate` also accepts an optional leading
`-`, then the same unsigned digits as the others but at most one decimal
place, then `deg`; no `+`, no exponent, no `°` sign, and no `-0deg` (zero is
always unsigned, like `y=0em`). `opacity` is a whole number with no leading zero, then `%`.

Interpret a marker only when it is the final meaningful inline token of its
paragraph or heading. For ATX headings it precedes optional closing hashes;
for Setext headings it follows the text, above the underline. Nested paragraphs
follow the same rule. A standalone comment governs nothing; code remains code.
Image fields require a paragraph containing one image, optionally enclosed by
one link, plus whitespace and its marker.

Unknown versions or keys, repeated keys, invalid values, invalid attachment
and multiple layout-family comments in one block are inert and preserved.
Writers emit one marker, lowercase keys, one ASCII space between fields, and
key order `align width wrap x y rotate opacity`. Remove insignificant decimal trailing zeroes
and omit `y=0em`, `rotate=0deg` and `opacity=100%`; remove the marker when no fields remain. Only an intentional edit changes
source; opening, rendering and viewport resizing never normalize it.

### Conformance rungs

The first three rungs are portable conformance statements: a reader claiming one shows exactly
its stated behavior. Rung 3 names the kit's implementation profile.

**Rung 0 — any CommonMark reader.** Every layout comment is an ordinary HTML comment; CommonMark
already shows nothing for one. A picture shows inline, upright and solid, at the reader's own default width.
`align`, `x`, `y`, `wrap`, `rotate` and `opacity` are all invisible. This rung costs nothing: it is what an
unaware reader already does.

**Rung 1 — position and size.** `align` sets text alignment. `width` and `x` size and place a
picture in normal flow (§"For image layout" above), and `opacity` fades it with CSS `opacity`. `rotate` alone, with no `wrap`, changes nothing
at this rung beyond upright display — a raster's turn is a layout fact, not a pixel change, so a
reader that stops here shows it unturned, the same degrade as an unrecognized field.

**Rung 2 — placement in ordinary CSS.** Each `wrap` value has one conforming rendering:

| `wrap` | Conforming CSS |
| --- | --- |
| `around` | `float: left` or `float: right` (from `x`) with `shape-outside: url(<the picture>)` and a `shape-image-threshold` near the standard's own 10% alpha cutoff; text wraps to the picture's silhouette. |
| `box` | The same float, with no `shape-outside`: text wraps to the plain rectangle. |
| `behind` | The picture positioned (`x`, `y`, `width`) with `z-index` below the text; the anchor paragraph and everything after it lay out exactly as though it were absent. |
| `front` | The same positioning, `z-index` above the text. |

A `rotate`d picture is turned for display with a CSS `transform`, but a transform is a painting-stage
operation: it never feeds back into layout or into what `shape-outside` samples (CSS Transforms;
CSS Shapes, "relation to box model and float behavior"). A reader that turns the picture but leaves
its `shape-outside`/float rectangle unrotated is not conforming at this rung: text would wrap to the
*unturned* shape while the picture displays turned. A conforming rung-2 reader instead computes the
*turned* shape and supplies that directly — `shape-outside: polygon(...)` built from the rotated
bounding box's own corners (`w·|cos|+h·|sin|` wide, `w·|sin|+h·|cos|` tall, as above), or the same
turned rectangle as a plain float with no shape for `wrap=box`. What a rung-2 reader does not get:
words on both sides of one picture, words inside a picture's own unfilled interior, or line-exact
agreement with Rapier — the placement is the standard; the exact line is not.

**Rung 3 — the same lines Rapier shows.** The drop-in module (the `rapier-markdown-kit` package, [standard-adoption](standard-adoption.md),
"The drop-in module") plans lines exactly as Rapier's own live view and styled export do, up to font
metrics: a different font wraps differently everywhere, and the module is deterministic given its
measurer. This is the only rung that reproduces both-sides wrapping and an interior wrap.
This is a kit implementation profile; exact line breaks are not an independent reader's
conformance requirement. Rungs 0–2 define portable rendering support.

## Embedded images

An image occurrence names an ordinary [CommonMark reference definition](https://spec.commonmark.org/0.31.2/#link-reference-definitions).
The definition holds its bytes in a Base64 data URL:

```md
Here is the diagram.

![System diagram][diagram] <!--md-layout:v1 width=47% align=center-->

Later prose stays readable.

[diagram]: data:image/jxl;base64,<payload>
```

| Image choice | Definition destination |
| --- | --- |
| JPEG XL (default) | `data:image/jxl;base64,<payload>` |
| Original PNG, JPEG or WebP | `data:image/png;base64,<payload>`, `data:image/jpeg;base64,<payload>` or `data:image/webp;base64,<payload>` |

The codec changes; the Markdown mechanism does not. There is no custom image
URI, payload comment or document-specific binary encoding. Dimensions come
from the image, not a second metadata header.

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

[Will/1](will.md) is its own standard: whole marker lines that carry the person's
instruction to an agent about what may change. It is optional and independent of
this document. Where both appear in one file each keeps its own recognition
rules (layout through Markdown tokens; Will as marker lines at column zero, even
in code fences), neither grants the other anything, and Save keeps the one source.
What each export keeps of the layout is in `standard-adoption.md`; of Will, in [Will/1](will.md), "Conversion".

## Text colour

A coloured run is a paired HTML comment around the text:

```md
Buy <!--c green-->mushrooms<!--/c--> today, or <!--c #35c57a-->minty<!--/c--> ones.
```

The opener carries one value: one of the picker’s five names (green, red, blue, gold, purple) or
exactly one lowercase six-digit hex, the colour as chosen for a light page; the closer is
`<!--/c-->`. A reader on a dark page derives its own lighter tone from the same value, so one hex serves both.
Pairs do not nest or escape their enclosing inline container; a second opener before the first closer, or a
closer without an opener, stays ordinary comment text and shows nothing. A run may begin at the
first character of a paragraph; a renderer that follows CommonMark's HTML-block rule then shows
that line's words plain (a comment is invisible in HTML) and loses only that line's inline
Markdown. Stripping comments loses colour, not words.

## Table captions

A paragraph immediately after a table that begins `Table: ` (or a bare `: `) is recognised as that table's caption:

```md
| Region | Q3 |
| --- | --- |
| North | 412 |

Table: quarterly figures, by region.
```

Never required: an ordinary paragraph that starts with the word "Table" and no colon, even directly after a table, stays an ordinary paragraph. Recognition is a rendering fact only — the paragraph's own bytes never change, it opens for editing with one tap like any other paragraph, and other readers show it as the plain paragraph it is. Rapier draws it tucked under the table in a smaller italic; the shared page, PDF and Word carry the same look. A bare `: caption` line directly after an ordinary paragraph is claimed by the definition-list convention instead; after a table, which is never a definition term, it is unambiguous.

## Page break

A page break is one marker on its own line, blank lines on both sides — the same whole-line discipline a will uses:

```md
The last paragraph of a chapter.

<!--md-break:v1 page-->

The first paragraph of the next.
```

Every other reader treats the line as an invisible comment and shows the two paragraphs as they are. Rapier draws a thin dashed rule with a small "page" word; a tap selects it like a picture (it never opens an editor) and Backspace or Delete removes it whole, with undo. A PDF breaks the page there, and a Word export carries a real page-break-before paragraph. The plus list's Line family inserts one.

## Reference style

[`spec/markdown-style.css`](repo/spec/markdown-style.css) is the MIT reference style for rendered
Self-contained Markdown. Rapier, its exported reading pages and the kit's `style.css` use this one file.
A renderer supplies the HTML below; the sheet supplies its type, colours and spacing. It neither parses
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
`--md-*`, on `:root` and `.md-render`; an element may override its own local effect. No application theme block is
required. A host may override those properties after the sheet. Geist and Geist Mono are the named
faces, with system fallbacks adjusted to their x-height; the host supplies a face if it wants the
same glyphs. The host owns the page frame and available width; equal font metrics and content width
are necessary for equal line breaks. Headings balance their lines (`text-wrap: balance`); paragraphs keep the
browser's greedy breaks.

The sheet spaces a page the way a Word document reads: one line, `--md-line` (1.75rem, 1.6 lines of the
1.1rem body, `--md-text-body`), is the unit of the vertical rhythm. Body text sits on that line; a heading's
box is the whole or half lines its size fills (h1 at 2.4 x the body on two lines, h2 and h3 on one and a
half, h4 to h6 on one); every block ends one line below its last line and a heading half a line below; list
items are a quarter line apart. No block sets a top margin, so blocks whose margins collapse (a plain page)
and blocks wrapped one by one (an editor) space alike, and the space before any block is the line its
predecessor leaves. A host that sets `--md-line` and `--md-text-body` together rescales the whole rhythm.

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

The sheet reads alignment and the rendered picture's size; a layout comment remains source until a
renderer reads it. Use `parseLayout` from `rapier-markdown-kit/layout` for the marker and `imageStyle`
for its normal-flow `width` and `x` and its fade. `imageStyle` returns a percentage width, automatic height and,
when `x` is present, the clamped left margin; with `opacity` under `100%`, the CSS `opacity`. `data-md-image-width` records the percentage on the
image. An Obsidian pixel-width picture uses `data-rapier-image-size` with `--md-image-width:Npx`;
the sheet constrains it to its container. A drawing (an SVG picture) shown at its own size or at full column width carries
`data-md-drawing` and `--md-drawing-width:Npx`, its own width: the sheet lets it shrink to its
container only down to 12/14 of that width, where 14 px words are still 12 px, and past that its
parent scrolls sideways; on paper it fits the page. Explicit pixel sizes and smaller layout widths keep the chosen size.

Rapier's layout projector receives the encoded marker in `data-md-layout` on the paragraph and
`data-rapier-image-layout` on the picture (`encodeURIComponent(marker)`; the kit's
`parseLayoutAttribute` reads it). `data-md-layout-tight` retains the zero block margin of a tight
list paragraph. `wrap`, `y` and `rotate` are geometry for the renderer to project, not CSS attribute
values the sheet can interpret. The projector owns the derived positions, margins, transforms,
stacking and line boxes; a rotated image reserves its turned bounds. Merely setting those attributes
does not produce wrapping. The conformance rungs above define a CSS placement renderer and the
kit's line planner separately; the style pack needs neither to style an ordinary document.

### Using markdown-it and the kit

Rapier's own kit renders the standard this way (its README holds the executable example; the kit is Rapier's, not part of the public standard):
`markdown-it` supplies core HTML and GFM tables, `installMarkdownImages` reads the picture definitions,
and the kit's layout and mark readers interpret the example's trailing layout comments, paired colour
comments and page-break line. It wraps the result in `.md-render` and loads `style.css` alone.
Markdown-it and any extension plugins are supplied by the caller; the kit has no npm dependencies
and no renderer API. Task-list and footnote plugins emit the corresponding classes above; a renderer
for callouts, highlights, diagrams or mathematics emits their listed wrappers. A host rendering
untrusted source applies its own HTML sanitization policy before displaying it.

Class and attribute names in this contract remain the names Rapier emits in this release. The next
naming step, after 28 September 2026, is to give the remaining `rapier-*` presentation hooks `md-*`
names in one change with their producers and readers.

## The document as a web page

A Markdown document can travel as one ordinary HTML file that opens in any browser with scripts off and reopens in any editor that knows this section, with the exact Markdown back. The page shows the rendered document; the Markdown rides inside it as plain text:

```html
<script type="text/markdown" data-filename="notes.md" data-kind="markdown" data-sha256="…"
        data-images="flow" data-image-definitions="FLOW">
# Notes

![The intake flow][flow]

[flow]: #flow
</script>
```

The page's own `<img>` elements are the picture store. Each Markdown image destination that is a data URL the page shows (an inline image's destination or an image reference definition's destination, and only those: the same bytes in a code block, a sentence or an ordinary link are never touched) is replaced, over its *whole* span, by a fragment, `#id`, naming the `<img id="…">` that holds those bytes; `data-images` lists every id used that way. "Whole span" matters when the source itself delimited the destination with `<…>` (`![x](<data:…>)`, `[label]: <data:…>`): the writer replaces the delimiters too, never just the bytes inside them, so the carried form is always the bare `#id` shorthand — one shape, not two, for every reader to recognise. Ids match `[A-Za-z0-9][A-Za-z0-9._:-]{0,120}`: a definition's own label when it fits, otherwise `image-N`.

A reference definition (`[label]: #id`) needs a second check an inline image's destination does not: its destination alone cannot say whether the writer rewrote it, because an ordinary hand-written definition can target a fragment that happens to equal a picture id (`[nav]: #pic`) beside the real rewritten picture definition (`[pic]: #pic`). `data-image-definitions` lists the normalized reference label — markdown-it's `normalizeReference`: trim, collapse internal whitespace, case-fold — of every reference definition the writer actually rewrote, each percent-encoded (unreserved characters and `%XX`, so the list stays one space-separated token run regardless of what the label itself contains). **A reference definition line resolves only because the writer declared that exact Markdown reference definition as an image definition here — never merely because its destination resembles a picture id.** An inline image destination needs no separate label declaration: only a destination the writer structurally substituted carries raw `#id`; every authored `#` elsewhere, including image-looking examples inside code, is carried as `&#35;` until after resolution. Two `<img id="…">` elements sharing one id are ambiguous and refuse the whole page rather than silently choosing one. A page carries the attribute whenever the writer rewrote a definition, and a definition line resolves only when declared; there is no older page to infer for (Rapier's readers, its own included, are strict).

The writer entity-encodes each untouched Markdown segment in this order: `&` → `&amp;`, `<` → `&lt;`, authored `#` → `&#35;`, and carriage return (CR) → `&#13;`. It writes raw `#id` only at a structurally recognized picture destination it substitutes. This keeps literal picture examples in code distinct from substitutions and preserves CR/CRLF through HTML input newline preprocessing. The reader first restores `&#13;` to CR for reference-line recognition; it resolves the declared raw `#id` destinations, decoding a reference label before comparing it with `data-image-definitions`; only then it restores `&#35;` → `#`, `&#13;` → CR, `&lt;` → `<`, and `&amp;` → `&`, in that order. Original entity-looking text stays literal because ampersands decode last. One newline is added after the opening tag and one before the closing tag. `data-sha256` is the SHA-256 of the resolved document — the portable source a reader reconstructs, always with `#id` resolved back to an `<img>`'s `src` verbatim, never a delimiter re-added — so a page whose pictures or text were changed is refused rather than half-recovered, and so a document that used `<…>`-delimited destinations hashes to its bare-destination portable form, not to the working file's own byte-for-byte spelling. A page carries JPEG XL pictures as they are (every current browser opens them, and they are far smaller); with the Share sheet's image compatibility switch on, each is carried as the portable picture the page then shows (PNG, or JPEG for an opaque photograph when smaller), which needs a browser that decodes JPEG XL. Either way the working file on the device keeps its own codec. Picture bytes are never duplicated between the page and the carried Markdown; a picture shown twice on the page is, as in any HTML, present twice. The page admits only its own scripts under one nonce -- the inlined line planner, so a wrapped picture sits where it does in the editor, and the code lexer when a code block needs colouring -- and `text/markdown` is not a script type any browser executes; a reader with scripting off still sees the picture on its nearest side. The page also declares `referrer` `no-referrer`, so following a link from it never tells the destination where the page lives. The rendered page is display, not proof: the digest covers the carried Markdown, not the HTML around it, so a page whose visible words were edited while its carrier was left alone still recovers the authentic document. A reader who needs the authentic words opens the page in Rapier or runs a reference reader; what the browser shows is the author's rendering as it was received.

Any tool can read a shared page with a string scan and no browser, and any tool can write one. Nothing about the form is particular to Rapier. Two public reference readers do that scan, beside the source: `tools/read-shared-page.mjs` (Node) and `tools/read-shared-page.py` (Python 3), each a small standalone script: restore CR, resolve only the raw ids in `data-images` against the page's own `<img id src>` (refusing a duplicate id rather than picking one), resolve a reference definition additionally only when its normalized label is declared in `data-image-definitions`, decode the remaining entities, verify `data-sha256`, write the `.md` bytes without newline translation. They are how the form is a standard rather than a feature of one editor.

## Exporting for Pandoc or Quarto

Rapier's Markdown is CommonMark plus a few invisible comment conventions (colour, page breaks) that read as nothing on any other reader. Pandoc and Quarto carry some of the same ideas in their own syntax. An opt-in, one-way row on the copy sheet — "export for pandoc/quarto", off by default, under "copy markdown" — rewrites the copied text only: a colour run becomes a bracketed span with an inline colour style (`[words]{style="color: #rrggbb;"}`), a highlight becomes a `.mark` span (`[words]{.mark}`), and a page break becomes a bare `\newpage`. Fenced and inline code are left as they are. The document's own file is never touched, and Rapier does not read the Pandoc forms back as colour or highlight.

## Preservation and display

Opening, rendering and saving preserve existing source, including reference
spelling, image destinations and definition positions. Only an intentional edit
changes it; a save does not reorder, recompress or remove image definitions.
Unknown source and untouched metadata survive editing. Rendering never becomes
document state. A file's newline style and a leading UTF-8 byte-order mark are
facts of the file: kept on open, written back on save and on Share's editable
source, never shown as characters.

Reference definitions stay out of the reading view through normal CommonMark
behavior. An unaware renderer can ignore the layout comments and resolve the
images without any Rapier-specific image parser. Display still depends on the
host allowing data images and supporting the chosen codec. JPEG XL support
evolves independently in browsers, Markdown renderers and their image filters;
CommonMark syntax alone does not guarantee display on every host. PNG, JPEG and
WebP provide broader codec support within the same one-file mechanism.

Stripping comments loses optional layout, not image bytes. A processor that
removes data URLs or reference definitions can still lose images. A damaged or
unsupported image retains its source and description without preventing the
rest of the document from being read.

This preservation law is checked mechanically, not only asserted here. A check in
Rapier's own release run opens tiny real files in CommonMark/GFM, Bear,
Obsidian, Pandoc-copy and RTL styles (plus CRLF, a UTF-8 BOM, trailing-whitespace
hard breaks and a missing final newline) through the real Open door, makes one
unrelated edit, saves through the real Save door, and compares the saved bytes
against the original file with only that edit applied. Any Save-side rewrite
that is not named by a sentence in this document or in markdown-profile.md fails
the corpus outright rather than being accepted as an unremarkable difference.

The [layout reference](repo/spec/md-layout.mjs), the [text-colour/page-break
reference](repo/spec/md-marks.mjs) and the [reference style](repo/spec/markdown-style.css) are licensed MIT (`LICENSE-MIT` is the enumerated statement). Application behavior and
interoperability limits are recorded in [standard-adoption](standard-adoption.md).
