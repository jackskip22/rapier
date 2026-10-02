# Adopting the standard

This page describes implementation costs and Rapier’s tools. The specification is `markdown-standard.md`; other products’ support is in `markdown-profile.md`, "What other renderers show today".

## The one principle

A Rapier document is CommonMark first. Additions adopt another editor’s convention as-is or carry a *presentation fact* in an invisible comment. Pictures and drawings are ordinary Markdown images with their bytes in the file. Every addition must belong to a rung without costing the rungs below it anything.

## The adoption ladder

**Rung 0: any Markdown renderer, no work.** Headings, lists, tables, task lists, footnotes, strikethrough, highlight (Bear's `==x==`), `++underline++`, colour marks, page breaks and the `md-layout` comments all read as CommonMark plus the conventions `markdown-profile.md` lists. The reader sees the words exactly; pictures inline, upright, at the renderer's default width; drawings as SVG pictures; layout comments and Will markers invisible.

**Rung 1: position and size (a day's work).** Read `<!--md-layout:v1 …-->` after an image: `width=` is the picture's width as a percentage of the column, `x=` its centre, `align=` its alignment, `y=` its vertical offset in ems, `opacity=` its fade. That is a few lines of CSS on the image element; `imageStyle` in `spec/md-layout.mjs` is the reference (MIT, a dozen lines).

**Rung 2: wrapping the ordinary way (a day's work in any HTML-based editor).** `wrap=around`, `wrap=box`, `wrap=behind` and `wrap=front` are placements. Each has one conforming CSS rendering, in the table under "Conformance rungs" in `markdown-standard.md`: `float` (side chosen from `x`) for `around` and `box`, with `shape-outside: url(<the picture>)` and `shape-image-threshold` for `around` when the picture is not turned; a plain box for `box`; and an absolutely positioned picture with `z-index` below or above the words for `behind` and `front`. A turned picture uses its plain box. This rung cannot put words on *both* sides of a picture or inside its empty interior, or match Rapier’s lines; exact line breaks are not required. Rapier's Share page (`editor/share.js`) is a rung-2 renderer that implements all four placements.

**Rung 3: the same lines as Rapier (the drop-in module).** Rapier's live wrapping is a line planner over text runs and obstacles: `layout/model.mjs` (the 48-band occupancy profile, `pictureSlices`, `flowLines`) on top of Pretext (the text measurer, `agent/vendor/pretext`), with `spec/md-layout.mjs` as the grammar. Both-sides wrapping, interiors and agreement to the pixel come from this planner. The styled standalone export (`layout/interchange.js`) carries the planner, serving as a reference implementation. See "The drop-in module". The reader sees the same lines Rapier shows, up to font metrics; the planner is deterministic given the measurer.

**Plain layout.** Rung 0 is also a setting inside Rapier: `layout: RAPIER | PLAIN` in the settings panel. It shows the document as a layout-unaware reader would, with pictures inline and upright at their default width and every layout comment ignored, and changes nothing in the file.

Every rung above 0 is optional. A reader that stops early loses only the presentation it skips.

## Picture rotation: describe it, do not bake it

A raster keeps its bytes and its rotation is the layout fact `rotate=<deg>`, beside `width`, `x`, `y` and `wrap`. A drawing keeps its rotation in its own SVG bytes. The rule for both: **bake when the bytes can carry it losslessly, describe when they cannot.** Rapier never writes both `rotate=` and baked pixels, and never bakes into JPEG XL.

Every export carries the turn natively where the format has it: a CSS transform in the styled export and the Share page, `a:xfrm rot` in DOCX, the turned bitmap in the PDF path. At rung 0 the picture is upright, the same degradation as position and size. A rung-2 renderer turns the picture with a CSS transform and supplies the turned shape directly (`shape-outside: polygon(...)` from the rotated bounding box, or the plain box), never a bare transform over an unrotated shape (`markdown-standard.md`, "Conformance rungs"). A rung-3 editor gets the exact tilted rectangle (`rasterTiltProfile`) and turned alpha bands from the module.

## The drop-in module

`rapier-markdown-kit` (MIT) carries the wrapping without the editor.

1. **Contents.** `spec/md-layout.mjs` (grammar), `layout/model.mjs` (profiles and the line planner) and a thin Pretext adapter (`prepareRun` and the segment materialisation `model.mjs` imports from `agent/vendor/pretext`). Most of `model.mjs` is pure geometry over plain numbers: `bandsProfile`, `polygonProfile`, `rasterTiltProfile`, `rotatedBoundsRad`, `serializeProfile`/`parseProfile`, `pictureSlices`, `slotsForBand` and `flowLines` given an already-prepared flow and obstacles. Two calls need the host environment. `prepareRun` reaches Pretext's text measurement, which needs a global `OffscreenCanvas` or a DOM `document` (the *measurement adapter*: the environment supplies the font metrics). `alphaProfile` reads a live, decoded `<img>` through `image.ownerDocument` (the *alpha adapter*). `layout/browser.js` (the live editor's projection) and `layout/interchange.js` (the export's reflow) are Rapier's two adapters over all of this and stay Rapier's.
2. **Licence.** The standard's own modules are MIT: the grammar and marks (`spec/md-layout.mjs`, `spec/md-marks.mjs`), the layout model and line planner (`layout/model.mjs`), the Will grammar (`agent/will.mjs`), the picture appendix reader and writer (`spec/md-assets.mjs`) and the two shared-page reference readers (`tools/read-shared-page.mjs`, `tools/read-shared-page.py`). The appendix logic (`parseAssets`, `documentAssets`, `appendAssetText`) lives in `spec/md-assets.mjs`; `images/assets.mjs` re-exports it unchanged. `LICENSE-MIT` at the repository root enumerates these files; every package check walks the import graph to reject files outside that list. Pretext is MIT from its authors, vendored with its own notice. The editor, Draw, the native apps and the worker stay AGPL-3.0-only.
3. **A conformance kit.** A directory of small Markdown documents with pictures at every placement and angle, each with the styled export's line boxes recorded as JSON. Run a planner on those documents with the same measurer and report two claims separately. *Preservation*, whether a layout comment round-trips exactly through `parseLayout`/`formatLayout`, is independent of the measurer and must be exact. *Presentation*, whether the planned line boxes agree, depends on the measurer and the font, is reported with a tolerance and is never proof by itself.
4. **A README** at the module’s root explains the two adapters (measurement, alpha) and three calls: parse the comment, build the obstacle profile from the picture, plan the lines. Rapier's own build bundles the same source files the kit re-exports.

The package carries thirteen conformance documents with their runner, and a check that every export resolves, the import graph never leaves the MIT list, the appendix stays free of the DOM and of Rapier's globals, and the README's example runs, including over an isolated copy of exactly the kit's own closure.

## Where Rapier is bespoke

- **JPEG XL by default.** A renderer that does not decode JPEG XL shows no picture (GitHub, and the Chromium-based editors until Chrome flips its flag; `markdown-profile.md` dates each). Provided: the per-picture format change to PNG or JPEG from the picture's own dialog, export paths that convert on their own, the Share sheet's image compatibility switch and the picture-format note in the dialog. There is no document-level "make every picture portable" command.
- **Pictures as `data:` URLs in the file.** GitHub drops `data:` image sources in every format; self-contained files can be very large. A folder export (pictures beside the file, relative paths) is an idea for repository readers, not built and never the working file's form.
- **Drawings with a recipe in `<metadata>`.** Plain SVG for readers; only an editor that wants to edit the drawing as shapes needs the recipe.
- **The occupancy descriptor and the reflow script in the styled export.** `data-rapier-occupancy` and the inline planner live only in the exported page, never in the Markdown.
- **The document-as-a-web-page carrier.** A Rapier-defined form with two public reference readers and one escaping grammar (`markdown-standard.md`, "The document as a web page"), provable by a 60-line script.
- **Will markers, agent notes, review state.** Comments; invisible everywhere else.
- **Highlight colours as Bear's circle emoji, `++underline++`, `~sub~`/`^sup^`.** Adopted from other editors (`markdown-profile.md`). No command writes a single tilde, since `~x~` is Bear's underline and subscript elsewhere.
- **The wrap placements.** Four values, each with a rung-2 rendering in plain CSS.
- **Pretext-exact both-sides wrapping and interior wrapping.** Only rung 3 reproduces this; the module supplies it. Exact lines are an implementation quality, not the placement standard.
