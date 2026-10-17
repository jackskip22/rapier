# Math font data

`font.js` contains SVG outlines and OpenType MATH data from **Latin Modern Math 1.959**, plus the sharp s
outline from **Latin Modern Mono 2.004** for monospace text and one small arrow hook from
**Latin Modern Math Italic 10 Regular 2.003**. The parser,
layout engine, contour analysis and decoder are Rapier code. The converted font data remains under the
GUST Font License.

## Sources and licenses

| Input | SHA-256 |
| --- | --- |
| Latin Modern Math 1.959, `latinmodern-math.otf` | `6075562b771f8b82f0c179e363389684f2dd09de30038269e2628e504bd7be0f` |
| Latin Modern Mono 2.004, `lmmono10-regular.otf` | `22deb6d3be3ffcb40b33f0e010afb256c677d97c2a2bdee1f5740cdc97751558` |
| Latin Modern Math Italic 10 Regular 2.003, `lmmi10.pfb` | `c24662506b402f3e0033cc75eb746eb490a1b7477e6b3ef52053f5025ec0fc57` |
| Original GUST Font License | `2bd69affc3da00715116f713f57eab9707e96daf3562ad0215987b15b9c16f73` |
| LPPL 1.3c | `3d262cdf34dafa6955f703c634a8c238ec44109bc8dd6ef34fb7aa54809f7e66` |
| Combined `FONT-LICENSE.txt` | `6fb288a3363cb44eb0e247ead8afefed55fbe9b00ff2d0d1c75a1176d38f4091` |
| Geist 1.800, weight axis 400–700 | `6e3a140e3812161e292fbe42a1fc90533b2407b699c65abc7a098b0979df4e82` |

The [complete original font package](https://mirrors.ctan.org/fonts/lm-math.zip) is available from CTAN.
The generator's font and GUST license URLs are under
<https://mirror.apps.cam.ac.uk/pub/tex-archive/fonts/lm-math/>. LPPL 1.3c comes from
<https://www.latex-project.org/lppl/lppl-1-3c.txt>. Each download is checked against its content hash.
The Mono input comes from
<https://ftp.riken.jp/CTAN/fonts/lm/fonts/opentype/public/lm/lmmono10-regular.otf> and the hook from
<https://ftp.riken.jp/CTAN/fonts/lm/fonts/type1/public/lm/lmmi10.pfb>;
their [complete original package](https://mirrors.ctan.org/fonts/lm.zip) is also available from CTAN.

`FONT-LICENSE.txt` starts with the source fonts' exact copyrights, followed by the conversion notice and the complete,
unmodified GUST Font License and LPPL 1.3c. The same bytes are retained in the `/*! ... */` header of `font.js`,
the plug-in and its license sheet. Preserve this notice when packaging. The conversion has a different filename
and identifies its changes; the original font authors do not maintain it. Rapier's separate typesetter is MIT.

The calibration font is the editor's exact Geist file, from the pinned public source at
<https://raw.githubusercontent.com/jackskip22/rapier/326a7387a190b011543fae5f5f2c6144f6163b3d/src/shell/fonts/Geist.wght400-700.woff2>.
Only its numeric height measurements enter the math asset. Geist outlines are not included in the math plug-in.

## Rebuild

The generated asset uses Python 3.12, fontTools 4.61.1, Brotli 1.1.0 and zlib 1.3.2:

```sh
python -m pip install fonttools==4.61.1 Brotli==1.1.0
python repo/math/build-font.py
```

In the standalone package, run `python src/math/build-font.py`. To regenerate without network access, supply the
exact inputs with `--font`, `--mono-font`, `--hook-font`, `--license`, `--lppl` and `--text-font`. `--out` selects the JavaScript path and writes
the combined license beside it. When available, the generator uses the editor's local Geist font.

The generator preserves all **2,045 Unicode mappings** in the math font and **4,741 glyphs** reachable from those
mappings. The glyph set is closed over stretch variants, assembly parts, first- and second-level optical script
forms (`ssty`), flattened accents (`flac`) and dotless bases (`dtls`). This font supplies 980 script records,
48 dotless substitutions, 94 vertical constructions, 86 horizontal constructions and no flattened alternates.
Every included outline and mathematical metric retains its original values. Optional text shaping and stylistic
substitutions that the math syntax does not select are not included. Two additional outlines bring the total to
**4,743**. Unicode supplies no mathematical monospace sharp s, so that style selects the Mono outline and its
525-unit advance through `styledGlyphs`. The small `arrowhookleft` outline supplies amsmath's extensible hooked
arrow; the composer assigns its five-mu advance and three-mu join. The outline-only hook record has zero advance,
italic correction and accent attachment, and retains the original path.

The exact-outline claim applies to this font asset. Separately, the typesetter's `fallbacks.js` composes 29
additional Unicode symbols from Latin Modern outlines, outline parts and rules, restoring 31 named command
aliases in the existing vocabulary. These include digamma, filled and turned symbols, compound relations,
dashed arrows, the sum-integral and moustache delimiters.

Styled accented letters combine mathematical alphabet glyphs with accent marks. For example, `\mathbf{é}` and
`\mathit{ö}` use the composed math forms `\acute{\symbf{e}}` and `\ddot{\symit{o}}`. Their dimensions differ from
LuaTeX's default precomposed text-font letters for those two commands.

Latin Modern Math has uppercase script and bold-script alphabets but no lowercase glyphs in either style.
The typesetter retains its existing ordinary-letter fallback for those lowercase requests; it cannot supply
the absent calligraphic forms. Its unencoded glyphs contain no alternative lowercase script alphabet.

Different zlib versions can encode the same exact data differently. The package budget is measured with
Node 22.23.3 by `tools/build-math.mjs`; the packed stream always decodes to the original coordinates and metrics.

## Height and optical forms

The math and calibration fonts use 1,000 units per em. Their `OS/2.sxHeight` values are **431** for Latin Modern Math and **530** for
Geist. The regular upright `x` outlines confirm these values: their vertical bounds are 0–431 and 0–530.
Math therefore scales by **530/431**, approximately **1.2296983758700697**, relative to surrounding text.
The font's italic `x` retains its designed overshoot, with bounds −11–442.

Geist's nominal height remains 530 across its weight axis. Its drawn `x` reaches 532 at weight 500, 535 at 650,
and 536 at 700; the normalization uses the nominal height. It applies continuously at every text size.
Latin Modern supplies 70% and 50% optical script scales. Screen layout can enlarge scripts while retaining the
appropriate `ssty` outlines. The source's fraction and radical rule thicknesses are 40 units.

## Runtime schema

The asset initializes `MATH_FONT`. Paths use upward-positive font coordinates; SVG rendering reverses the
vertical axis. Measurements are in design units unless specified otherwise.

| Field | Value |
| --- | --- |
| `units`, `xHeight` | Math units per em and nominal x-height. |
| `textUnits`, `textXHeight` | Geist units per em and nominal x-height. |
| `chars` | Decimal Unicode code point to glyph index. |
| `styledGlyphs` | A style's exceptional Unicode mappings: monospace U+00DF selects the original Mono sharp s. |
| `arrowHook` | The original small math-italic hook outline; the arrow composer supplies its advance. |
| `glyph(id)` | Demand-decoded `[advance, xMin, yMin, xMax, yMax, italicCorrection, topAccent, path]`. Missing IDs return `undefined`. |
| `constants` | All 56 original OpenType `MathConstants`; percentage constants remain percentages. |
| `vertical`, `horizontal` | Glyph index to `{variants, assembly?}`. |
| `variants` | `[glyphIndex, advanceMeasurement]` pairs in font order. |
| `assembly` | `{italic, parts}`. |
| `parts` | `[glyphIndex, startConnector, endConnector, fullAdvance, isExtender]`. |
| `minConnectorOverlap` | The font's minimum assembly overlap. |
| `kern` | Four corner records per glyph, if present in the source; empty for Latin Modern. |
| `scriptAlternates` | First- and second-level `ssty` glyph indices. |
| `flatAccents`, `dotless` | Alternate glyph indices for `flac` and `dtls`. |
| `extendedShapes` | Glyphs marked by `MathGlyphInfo.ExtendedShapeCoverage`. |

Outline bounds round outward to whole units. The outlines themselves are unchanged, including exact fractional
coordinates if present. Missing italic corrections are zero; missing accent attachments use half the advance.
Assembly parts retain the OpenType order: bottom to top vertically, left to right horizontally. Latin Modern has
no MATH Device adjustments. Hint programs and general text shaping tables are not used by the SVG renderer.

The asset stores no bounds. The decoder derives them from the outline with the arithmetic of fontTools'
`BoundsPen`, operation for operation in IEEE double precision; for this font every derived bound equals the
value the 2.2.0 asset stored. The contour profiles earlier versions derived (ink edges in 32-unit strips) are
gone from the asset since 2.6.0: layout places scripts by TeX's rules, and only the typesetting verifier
measures ink gaps, deriving the same strips from each outline itself.

Character mappings, optical substitutions, stretch constructions and record offsets
occupy a compact index decoded at module load. Glyph metrics and outlines stay in independent raw DEFLATE pages
until requested. Every page
ends at a record boundary and contains at most 16,384 decoded bytes. The complete set of pages travels in the
same asset; rare characters, stretch parts and optical forms require no additional download.

Outlines share exactly matching contours after translation. The 8,117 ordered contour references use 4,972
unique contour records. A record either stores its original command structure and relative coordinates, or
exact differences from an earlier contour with the same structure. Parent chains have at most four links.
The generator prefers small coordinate differences as well as short records, because the smallest initial
record does not necessarily produce the smallest compressed page. Glyph assembly restores the original
absolute `M/L/H/V/C/Z` paths, including contour order; existing outline-part consumers use those commands.
A contour whose closing curve ends at its start omits that end point; the decoder returns the curve to the start.

Glyph metrics use a reversible half-advance accent predictor with a median origin per metric field.
They retain the complete original advance, italic and accent measurements. Signed record integers
use zigzag values: values below 240 take one byte, the next 3,840 values take two bytes, and larger values use
an escape followed by unsigned LEB128. The coordinate unit is exact; this encoding performs no quantization.

Each inflated page and completed glyph record stays for the life of the module, so the font
itself bounds these caches: the pages inflate to about 520 KB. Temporary parent coordinates and page views are
discarded after a glyph is assembled; cached glyphs keep the completed path and metrics.
These caches contain font data only. They retain no formula source, parse tree, layout result, SVG element or
document. Returned internal records are read-only to consumers.

The synchronous decoder checks compressed input, output size, record boundaries and parent depth. It requires
no network, font installation, font parser or platform font shaping at runtime. `glyph` is an
internal font accessor; the public parser and rendering API remain independent of this storage format.

The format follows the [OpenType MATH specification](https://learn.microsoft.com/en-us/typography/opentype/spec/math)
and [RFC 1951](https://www.rfc-editor.org/rfc/rfc1951). Three retained constants have no active consumer:
`DelimitedSubFormulaMinHeight`, `SkewedFractionHorizontalGap` and `SkewedFractionVerticalGap`.
