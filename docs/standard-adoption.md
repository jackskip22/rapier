# The standard from the outside: how another editor gets a Rapier document right

Written 12 September 2026 from the founder's question: are we building the standard so that other
people can actually support it, with the simplest building blocks, and where have we gone too
bespoke? This page is the answer, kept current. It is a design document, not a claim about what other
editors do today; every claim about another product is marked as verified or to verify
(`markdown-profile.md`, "What other renderers show today", holds the public record).
`markdown-standard.md` stays the standard's own text; this page is about adoption -- the ladder an
implementer climbs, what each rung costs, and what we owe them at each rung.

## The one principle

A Rapier document is CommonMark first. Everything Rapier adds is either (a) an established
convention some other editor already writes, adopted as-is, or (b) an invisible comment that carries
a *fact about presentation* and degrades to nothing. Pictures and drawings are ordinary Markdown images
whose bytes live in the file. So "does my document look the same elsewhere" has a precise answer at
each of four rungs, and the standard's job is to make each rung cheap and to say exactly what it buys.
The test of every future addition is: which rung does it land on, and does it cost the rungs below it
anything?

## The adoption ladder

**Rung 0 -- any Markdown renderer, no work.** Headings, lists, tables, task lists, footnotes,
strikethrough, highlight (Bear's `==x==`), `++underline++`, colour marks, page breaks and the
`md-layout` comments all read as CommonMark plus the conventions `markdown-profile.md` lists. What the
reader sees: the words exactly; pictures inline, upright, at the renderer's default width; drawings as
SVG pictures; layout comments invisible; Will markers invisible. What it costs Rapier: nothing beyond
keeping the file CommonMark (the exactness law, and the compatibility corpora Rapier's own release
run reads and re-saves byte for byte). Two known gaps at this rung, both about bytes rather than
syntax, are listed under "Where we are bespoke" below (JPEG XL, and `data:` picture sources on
GitHub).

**Rung 1 -- position and size (a day's work).** Read `<!--md-layout:v1 …-->` after an image:
`width=` is the picture's width as a percentage of the column, `x=` its centre, `align=` its
alignment, `y=` its vertical offset in ems, `opacity=` its fade. That is a few lines of CSS on the image element
(`spec/md-layout.mjs`'s `imageStyle` is the reference, MIT, a dozen lines). What the reader sees: the
picture where the author put it, at the size and the fade they chose. Nothing else changes.

**Rung 2 -- wrapping the ordinary way (a day's work in any HTML-based editor).** `wrap=around`,
`wrap=box`, `wrap=behind`, `wrap=front` are placements. An HTML-based editor gets all four with CSS it
already has: `float` for `around`/`box` (side chosen from `x`), `shape-outside: url(<the picture>)`
with `shape-image-threshold` for `around` when the picture is not turned (the browser wraps to the
picture's own alpha silhouette, which is exactly what `around` means -- a CSS transform does not turn
the shape a `shape-outside` url() samples, so a turned `around` picture keeps the plain, correctly
rotated-bounds-sized box instead: an honest conservative reservation, not a silhouette shaped for the
wrong angle), a plain box for `box`, and an absolutely positioned picture with `z-index` below or
above the words for `behind`/`front`. What the reader sees: words beside the picture on one side,
following its silhouette (its plain box when turned); a behind/front picture under or over the words.
What they do not get: words on *both* sides of a picture, words inside a picture's empty interior (an
unfilled circle), and line-exact agreement with Rapier. The standard says plainly that this is a
conforming rendering of the placement facts -- the facts are the standard, the exact line breaks are
not. Rapier's own lighter Share page (`editor/share.js`) is a rung-2 renderer and proves the rung is
enough to read a document comfortably: it implements every placement this paragraph describes,
including `behind`/`front`'s own positioning and `around`'s alpha silhouette, not only
`around`/`box`'s float.

**Rung 3 -- the same lines as Rapier (the drop-in module).** Rapier's live wrapping is a line planner
over text runs and obstacles: `layout/model.mjs` (the 48-band occupancy profile, `pictureSlices`,
`flowLines`) on top of Pretext (the text measurer, `agent/vendor/pretext`), with `spec/md-layout.mjs`
as the grammar. Both-sides wrapping, interiors, and agreement to the pixel come from this planner, and
the styled standalone export (`layout/interchange.js`) ships it as a script inside every exported
page, so every exported document is also a reference implementation any implementer can read. To
make rung 3 a genuine drop-in rather than a reading exercise, the module exists as a thing on its
own: see "The drop-in module" below. What the reader sees: the same lines Rapier shows, up to font
metrics (a different font wraps differently everywhere; the planner is deterministic given the
measurer).

**Plain layout.** Rung 0 is also a setting inside Rapier: `layout: RAPIER | PLAIN` in the settings
panel (with an info circle that names GitHub, Obsidian and Bear and says Rapier's layout is a small
open standard whose comment those apps keep), which shows the document as a layout-unaware reader would: pictures inline and
upright at their default width, every layout comment ignored. It changes nothing in the file.

Every rung above 0 is optional and every rung is honest about what it buys. That is the whole design
for "as simple as possible for everybody": nobody has to climb further than their product wants, and
the document never punishes the reader for stopping early.

## Picture rotation: describe it, do not bake it

The founder's question: should a turned photo be a `rotate=` fact in the layout comment, or should the
picture be re-rendered turned inside a box with transparent corners so every viewer shows it turned?

Facts. JPEG XL carries an alpha channel (lossless or lossy), so a baked turned picture is
representable in the picture law's own format. Baking costs two things every time the angle changes:
a second lossy generation unless the unturned original is also kept (which doubles the bytes), and a
re-encode on every drag. It buys visibility at rung 0 only -- the rungs where any editor already reads
the comment get the turn either way.

Decision: a *raster* keeps its bytes and its rotation is the layout fact `rotate=<deg>`, beside
`width`, `x`, `y` and `wrap`; a *drawing* keeps its rotation in its own SVG bytes because that is
lossless and free. The rule that unifies both: **bake when the bytes can carry it losslessly,
describe when they cannot.** Every export Rapier writes carries the turn natively where the format
has it (a CSS transform in the styled export and the Share page; `a:xfrm rot` in DOCX; the PDF path
draws the turned bitmap), so a turned photo is turned everywhere Rapier can reach. At rung 0 it is
upright, the same degradation as position and size, which is the standard's existing promise. A
rung-2 editor turns the picture with a CSS transform for display, but a transform is a painting-stage
operation and never feeds back into layout or float shape computation (CSS Transforms; CSS Shapes'
own "relation to box model and float behavior") -- an untouched `shape-outside: url(...)` still samples
the picture's own, upright pixels, so text would wrap to the *unturned* silhouette while the picture is
shown turned. A correct rung-2 renderer instead supplies the *turned* shape directly: `shape-outside:
polygon(...)` built from the rotated bounding box's own corners (the same tilted-rectangle math
`rasterTiltProfile` gives the module), or the plain conservative box already used for `wrap=box`,
enlarged to the turned bounds -- never a bare transform on the displayed image with an unrotated
shape left in place. A rung-3 editor gets the tilted rectangle and the turned alpha bands from the
module directly, which is exact by construction.

What we do not do: write both (`rotate=` and baked pixels), which would make two owners of one fact,
or bake into JPEG XL to win rung 0 at the cost of every edit. If a future reader survey shows rung 0
matters more than we think for photos, the export path already knows how to bake, and a per-picture
"flatten" command (like the existing per-picture format change) is the cheap answer, not a change to
the standard.

## The drop-in module

Rapier deliberately uses Pretext so that the wrapping is a library, not a feature of one editor. To
make that true for other people, the boundary is a package someone can take without taking Rapier:
`rapier-markdown-kit` (MIT).

1. **Contents.** `spec/md-layout.mjs` (grammar), `layout/model.mjs` (profiles and the line planner)
   and a thin Pretext adapter (`prepareRun` and the segment materialisation `model.mjs` already
   imports from `agent/vendor/pretext`). Most of `model.mjs` is genuinely pure geometry over plain
   numbers -- `bandsProfile`, `polygonProfile`, `rasterTiltProfile`, `rotatedBoundsRad`,
   `serializeProfile`/`parseProfile`, `pictureSlices`, `slotsForBand`, `flowLines` given an
   already-prepared flow and obstacles -- and needs nothing an implementer doesn't already have.
   Two calls are not pure: `prepareRun` reaches Pretext's own text measurement, which needs a global
   `OffscreenCanvas` or a DOM `document` (a *measurement adapter* -- the environment supplies real
   font metrics, the kit supplies none); `alphaProfile` reads a live, decoded `<img>` through
   `image.ownerDocument` (an *alpha adapter* -- Rapier's own convenience for turning a picture it
   just decoded into a profile). Neither is a defect: they are the two places the module honestly
   needs the host environment, named as such rather than folded into a blanket "no DOM" claim.
   `layout/browser.js` (the live editor's projection) and `layout/interchange.js` (the export's
   reflow) are the two Rapier adapters over all of this and stay Rapier's.
2. **Licence (the founder's decision, 12 September 2026).** The standard's own modules are MIT, the
   licence people already know: the grammar and marks (`spec/md-layout.mjs`, `spec/md-marks.mjs`),
   the layout model and line planner (`layout/model.mjs`), the Will grammar (`agent/will.mjs`), the
   picture appendix reader and writer (`spec/md-assets.mjs`), and the two shared-page reference
   readers (`tools/read-shared-page.mjs`, `tools/read-shared-page.py`). The appendix used to be part
   of `images/assets.mjs`, which also does JPEG XL/raster header inspection and SVG sanitizing
   through the editor's own AGPL-licensed decoders (`images/raster.mjs`, `draw/font.mjs`) -- so that
   whole file could never honestly sit in an MIT list. The appendix logic (`parseAssets`,
   `documentAssets`, `appendAssetText` and their small markdown-it plumbing -- pure text and tokens,
   no image bytes) lives in `spec/md-assets.mjs`; `images/assets.mjs` re-imports and re-exports it
   unchanged, one owner, no copy. `LICENSE-MIT` at the repository root is the one enumerated
   statement of exactly these files, and the package's own check walks the kit's real import graph
   on every run to prove no file outside that list is ever reached -- one statement, checked, not
   written down twice in two places that could drift. Pretext was MIT from its authors all along
   (vendored with its own notice) and needed nothing from us. The editor itself, Draw, the native
   apps and the worker stay AGPL-3.0-only: copyleft for the product, permissive for the standard --
   the usual pairing. There is no problem in the mixing: MIT files inside an AGPL program are fine,
   and the copyright is one person's.
3. **A conformance kit.** A directory of small Markdown documents with pictures at every placement and
   angle, each with the styled export's line boxes recorded as JSON (the export already computes
   them). An implementer runs their planner over the same documents with the same measurer and
   compares. Two different claims, reported separately: *preservation* -- does a layout comment
   round-trip exactly through `parseLayout`/`formatLayout` -- has no measurer in it and is either
   exactly right or a real bug; *presentation* -- do the planned line boxes agree -- depends on the
   measurer and the exact font, is reported with a tolerance, and is never proof by itself the way a
   preservation row is. Plain layout (above) is a useful layout-unaware view inside Rapier; it is not
   a test of what GitHub, Obsidian, Bear or any other product actually does with a `data:` picture or
   an SVG drawing -- that question is answered from the public record in `markdown-profile.md`
   ("What other renderers show today"), and a per-product check against the real products has not
   been run.
4. **A name and a README** at the module's root saying what it is, the two adapters it honestly
   needs (measurement, alpha) and how to supply them, and the three calls: parse the comment, build
   the obstacle profile from the picture, plan the lines. Rapier's own build keeps bundling the
   underlying files from the same source the kit re-exports (one owner).

The package carries thirteen conformance documents with their runner, and a check that every export
resolves, the import graph never leaves the MIT list, the appendix stays free of the DOM and of
Rapier's globals, and the README's example actually runs -- including over an isolated copy of
exactly the kit's own closure, nothing else.

## Where we are bespoke, honestly

The parts of a Rapier document that cost other people something, with what we owe for each:

- **JPEG XL by default.** The picture law. Cost: a renderer that does not decode JPEG XL shows no
  picture (GitHub, and the Chromium-based editors until Chrome flips its flag; `markdown-profile.md`
  dates each). Owed and in place: the per-picture format change to PNG/JPEG from the picture's own
  dialog, the export paths converting on their own, the Share sheet's image compatibility switch, and
  the picture-format note in the dialog. There is no document-level "make every picture portable"
  command: the founder ruled that JPEG XL is everywhere now.
- **Pictures as `data:` URLs in the file.** The single-file law: the document is complete on its own.
  Cost: GitHub's renderer drops `data:` image sources, so a Rapier file on GitHub shows no pictures at
  all, whatever their format; very large files. An idea kept, not built: a folder export -- pictures
  beside the file, relative paths -- for a repository reader; never the working file's form.
- **Drawings with a recipe in `<metadata>`.** Cost: none for readers (it is plain SVG); a cost only for
  editors that want to edit the drawing as shapes, which is Rapier's own tool. Fine.
- **The occupancy descriptor and the reflow script in the styled export.** `data-rapier-occupancy` and
  the inline planner live only in the exported page, never in the Markdown. Cost: none to the standard;
  the exported page is self-contained. Fine, and it doubles as the rung-3 reference.
- **The document-as-a-web-page carrier.** A Rapier-defined form with two public reference readers and
  one escaping grammar (`markdown-standard.md`, "The document as a web page"). Cost: it is ours; but
  it is small, documented, and provable by a 60-line script. Fine.
- **Will markers, agent notes, review state.** Comments; invisible everywhere else. Fine.
- **Highlight colours as Bear's circle emoji, `++underline++`, `~sub~`/`^sup^`.** Adopted from other
  editors on purpose (`markdown-profile.md`). Fine; no command writes a single tilde, since `~x~` is Bear's
  underline and subscript elsewhere.
- **The wrap placements themselves.** Four values, all with rung-2 renderings in plain CSS. Fine, and
  this page says what a conforming rung-2 rendering is.
- **Pretext-exact both-sides wrapping and interior wrapping.** The only presentation Rapier shows that
  no rung below 3 can reproduce. Acceptable because the fact (the placement) is the standard and the
  exactness is a quality of implementation; the module makes it reachable.

Nothing on this list needs undoing. Two of them (JPEG XL, `data:` sources) were answered by the
founder's ruling that JPEG XL is everywhere now; the module's licence is decided (MIT); the rung-2
semantics and the `rotate=` field with its degradation are in `markdown-standard.md`'s Layout section.
