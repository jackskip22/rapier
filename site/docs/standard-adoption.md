# Adopting the standard

This page describes implementation costs and Rapier’s tools. The specification is `markdown-standard.md`; other products’ support is in `markdown-profile.md`, "What other renderers show today".

## The one principle

A Rapier document is CommonMark first. Inline typography uses ordinary HTML spans with narrowly validated CSS. Other additions use established extension syntax, optional comments or ordinary reference definitions. Pictures and drawings remain Markdown images with their bytes in the file. Describe each fallback honestly: a reader may strip styles, show unsupported markup or disallow embedded resources.

## The adoption ladder

**Rung 0: an ordinary Markdown renderer.** Core headings, prose, lists, emphasis and links retain their semantics.
GFM and other extensions need the support listed in the profile. Canonical typography spans keep their words and
Markdown semantics with inline HTML enabled; CSS may be stripped. Use Rapier's **Copy markdown without typography**
when that destination needs ordinary semantic Markdown. Pictures additionally need the reader's data-URL and codec
support. Layout comments alone remain optional presentation facts.

**Rung 1: position and size.** Read `<!--md-layout:v1 …-->` after an image: `width=` is the picture's width as a percentage of the column, `x=` its center, `align=` its alignment, `y=` its vertical offset in ems, `opacity=` its fade. That is a few lines of CSS on the image element; `imageStyle` in `spec/md-layout.mjs` is the reference (MIT, a dozen lines).

**Rung 2: wrapping the ordinary way.** `wrap=around`, `wrap=box`, `wrap=behind` and `wrap=front` are placements. Each has one conforming CSS rendering, in the table under "Conformance rungs" in `markdown-standard.md`: `float` (side chosen from `x`) for `around` and `box`, with `shape-outside: url(<the picture>)` and `shape-image-threshold` for `around` when the picture is not turned; a plain box for `box`; and an absolutely positioned picture with `z-index` below or above the words for `behind` and `front`. A turned picture uses its plain box. This rung cannot put words on *both* sides of a picture or inside its empty interior, or match Rapier’s lines; exact line breaks are not required. Rapier's Share page (`editor/share.js`) is a rung-2 renderer that implements all four placements.

**Rung 3: the same lines as Rapier (the drop-in module).** Rapier's live wrapping is a line planner over text runs and obstacles: `layout/model.mjs` (the 48-band occupancy profile, `pictureSlices`, `flowLines`) on top of Pretext (the text measurer, `agent/vendor/pretext`), with `spec/md-layout.mjs` as the grammar. Both-sides wrapping, interiors and agreement to the pixel come from this planner. The styled standalone export (`layout/interchange.js` (removed)) carries the planner, serving as a reference implementation. See "The drop-in module". The reader sees the same lines Rapier shows, up to font metrics; the planner is deterministic given the measurer.

**Plain layout.** Rung 0 is also a setting inside Rapier: `layout: RAPIER | PLAIN` in the settings panel. It shows the document as a layout-unaware reader would, with pictures inline and upright at their default width and every layout comment ignored, and changes nothing in the file.

Every layout rung above 0 is optional. These layout claims do not guarantee support for every syntax or resource in the document.

## Adopt inline typography without the editor

```md
A <span style="font-size:13.5pt;color:#175dc4">precise **phrase**</span>.

## <span style="font-size:9.25pt;font-family:serif">Still an H2</span>
```

`typography` from `rapier-markdown-kit/marks` validates, writes and installs the same interpretation on a supplied
markdown-it parser. Its size, color and family facts also feed Rapier's HTML and native Word adapters. The parser's
own source ranges protect literals and existing spellings; inspecting or rendering grants no mutation authority.
The README's executable example uses only the packed MIT closure and the caller's parser. The full DOM renderer
continues to use explicit host ports for sanitation, fonts and other application capabilities.

Sizes use positive decimal `pt`/`px` with CSS's 96px = 72pt conversion, bounded as specified in
[Inline typography](markdown-standard.md#inline-typography). Custom fonts use `[font:Family]: data:font/…;base64,…`
with existing identity metadata and validation; a name alone supplies no portable bytes. Ordinary factory/default
prose needs no font reference. Typography edits write spans.

Standalone HTML and Share/page retain their source carrier. Fragments retain local styles and validated custom
font declarations, with the existing shared font namespace. Word maps to native half-point run sizes (ties upward),
color and family without changing heading rank; original decimals survive in an unchanged DOCX's source carrier.
Print/PDF uses the same styled export path at the default reference unit. Pandoc/Quarto's explicit copy form carries
CSS in bracketed spans for HTML; automatic native Word or LaTeX styling is not promised. No new filter suite or
publication step is required by the convention.

## Picture rotation: describe it, do not bake it

A raster keeps its bytes and its rotation is the layout fact `rotate=<deg>`, beside `width`, `x`, `y` and `wrap`. A drawing keeps its rotation in its own SVG bytes. The rule for both: **bake when the bytes can carry it losslessly, describe when they cannot.** Rapier never writes both `rotate=` and baked pixels, and never bakes into JPEG XL.

Every export carries the turn natively where the format has it: a CSS transform in the styled export and the Share page, `a:xfrm rot` in DOCX, the turned bitmap in the PDF path. At rung 0 the picture is upright, the same degradation as position and size. A rung-2 renderer turns the picture with a CSS transform and supplies the turned shape directly (`shape-outside: polygon(...)` from the rotated bounding box, or the plain box), never a bare transform over an unrotated shape (`markdown-standard.md`, "Conformance rungs"). A rung-3 editor gets the exact tilted rectangle (`rasterTiltProfile`) and turned alpha bands from the module.

## The drop-in module

`rapier-markdown-kit` (MIT) carries the wrapping without the editor.

1. **Contents.** `spec/md-layout.mjs` (grammar), `layout/model.mjs` (profiles and the line planner) and a thin Pretext adapter (`prepareRun` and the segment materialization `model.mjs` imports from `agent/vendor/pretext`). Most of `model.mjs` is pure geometry over plain numbers: `bandsProfile`, `polygonProfile`, `rasterTiltProfile`, `rotatedBoundsRad`, `serializeProfile`/`parseProfile`, `pictureSlices`, `slotsForBand` and `flowLines` given an already-prepared flow and obstacles. Two calls need the host environment. `prepareRun` reaches Pretext's text measurement, which needs a global `OffscreenCanvas` or a DOM `document` (the *measurement adapter*: the environment supplies the font metrics). `alphaProfile` reads a live, decoded `<img>` through `image.ownerDocument` (the *alpha adapter*). `layout/browser.js` (the live editor's projection) and `layout/interchange.js` (removed) (the export's reflow) are Rapier's two adapters over all of this and stay Rapier's.
2. **License.** The standard's own modules are MIT: the grammar, typography/marks and parser-owned source positions (`spec/md-layout.mjs`, `spec/md-marks.mjs`, `spec/md-source.mjs`), the layout model and line planner (`layout/model.mjs`), the Will grammar (`agent/will.mjs`), the picture appendix reader and writer (`spec/md-assets.mjs`) and the two shared-page reference readers (`tools/read-shared-page.mjs`, `tools/read-shared-page.py`). The appendix logic (`parseAssets`, `documentAssets`, `appendAssetText`) lives in `spec/md-assets.mjs`; `images/assets.mjs` re-exports it unchanged. `LICENSE-MIT` at the repository root enumerates these files; every package check walks the import graph to reject files outside that list. Pretext is MIT from its authors, vendored with its own notice. The browser editor, Draw and the worker are AGPL-3.0-only.
3. **A conformance kit.** A directory of small Markdown documents with pictures at every placement and angle, each with the styled export's line boxes recorded as JSON. Run a planner on those documents with the same measurer and report two claims separately. *Preservation*, whether a layout comment round-trips exactly through `parseLayout`/`formatLayout`, is independent of the measurer and must be exact. *Presentation*, whether the planned line boxes agree, depends on the measurer and the font, is reported with a tolerance and is never proof by itself.
4. **A README** at the module’s root explains the two adapters (measurement, alpha) and three calls: parse the comment, build the obstacle profile from the picture, plan the lines. Rapier's own build bundles the same source files the kit re-exports.

The package carries thirteen conformance documents with their runner, and a check that every export resolves, the import graph never leaves the MIT list, the appendix stays free of the DOM and of Rapier's globals, and the README's example runs, including over an isolated copy of exactly the kit's own closure.

## Where Rapier is bespoke

- **JPEG XL by default.** Every current browser engine decodes JPEG XL by default (Chrome 155, Firefox 158, Safari 17 and later); only an app on an older engine shows no picture (`markdown-profile.md` dates each). Provided: the per-picture format change to PNG or JPEG from the picture's own dialog, export paths that convert on their own, the Share sheet's image compatibility switch and the picture-format note in the dialog. There is no document-level "make every picture portable" command.
- **Pictures as `data:` URLs in the file.** GitHub drops `data:` image sources in every format; self-contained files can be very large. A folder export (pictures beside the file, relative paths) is an idea for repository readers, not built and never the working file's form.
- **Drawings with a recipe in `<metadata>`.** Plain SVG for readers; only an editor that wants to edit the drawing as shapes needs the recipe.
- **The occupancy descriptor and the reflow script in the styled export.** `data-rapier-occupancy` and the inline planner live only in the exported page, never in the Markdown.
- **The document-as-a-web-page carrier.** A Rapier-defined form with two public reference readers and one escaping grammar (`markdown-standard.md`, "The document as a web page"), provable by a 60-line script.
- **Will markers and anchored comments.** Their metadata travels in HTML comments. Which changes a person has seen stays on their device.
- **Marks in inline HTML.** Rapier writes underline as `<u>`, a colored highlight as `<mark style="background-color:…">` in the picker's color, and `<sub>`/`<sup>`; every CommonMark reader that shows HTML keeps them. A plain highlight stays `==x==`. Bear's `==🟢x==`, `++x++` and `^x^` are read, never written; `~x~` is GFM strikethrough (`markdown-profile.md`).
- **The wrap placements.** Four values, each with a rung-2 rendering in plain CSS.
- **Pretext-exact both-sides wrapping and interior wrapping.** Only rung 3 reproduces this; the module supplies it. Exact lines are an implementation quality, not the placement standard.
