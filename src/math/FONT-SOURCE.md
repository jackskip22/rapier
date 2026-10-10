# Math font data

`font.js` contains SVG outlines and OpenType MATH data from **Latin Modern Math 1.959**. The parser,
layout engine, contour analysis and decoder are Rapier code. The converted font data remains under the
GUST Font License.

## Sources and licenses

| Input | SHA-256 |
| --- | --- |
| Latin Modern Math 1.959, `latinmodern-math.otf` | `6075562b771f8b82f0c179e363389684f2dd09de30038269e2628e504bd7be0f` |
| Original GUST Font License | `2bd69affc3da00715116f713f57eab9707e96daf3562ad0215987b15b9c16f73` |
| LPPL 1.3c | `3d262cdf34dafa6955f703c634a8c238ec44109bc8dd6ef34fb7aa54809f7e66` |
| Combined `FONT-LICENSE.txt` | `91ded9a2a371cbeff028bfaf3bd3e97fddfb68af6f186aa261bfaff35baf800c` |
| Geist 1.800, weight axis 400–700 | `6e3a140e3812161e292fbe42a1fc90533b2407b699c65abc7a098b0979df4e82` |

The [complete original font package](https://mirrors.ctan.org/fonts/lm-math.zip) is available from CTAN.
The generator's font and GUST license URLs are under
<https://mirror.apps.cam.ac.uk/pub/tex-archive/fonts/lm-math/>. LPPL 1.3c comes from
<https://www.latex-project.org/lppl/lppl-1-3c.txt>. Each download is checked against its content hash.

`FONT-LICENSE.txt` starts with the font's exact copyright, followed by the conversion notice and the complete,
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
exact inputs with `--font`, `--license`, `--lppl` and `--text-font`. `--out` selects the JavaScript path and writes
the combined license beside it. When available, the generator uses the editor's local Geist font.

The generator preserves all **2,045 Unicode mappings** in the font and **4,741 glyphs** reachable from those
mappings. The glyph set is closed over stretch variants, assembly parts, first- and second-level optical script
forms (`ssty`), flattened accents (`flac`) and dotless bases (`dtls`). This font supplies 980 script records,
48 dotless substitutions, 94 vertical constructions, 86 horizontal constructions and no flattened alternates.
Every included outline and mathematical metric retains its original values. Optional text shaping and stylistic
substitutions that the math syntax does not select are not included.

The exact-outline claim applies to this font asset. Separately, the typesetter's `fallbacks.js` composes 29
additional Unicode symbols from Latin Modern outlines, outline parts and rules, restoring 31 named command
aliases in the existing vocabulary. These include digamma, filled and turned symbols, compound relations,
dashed arrows, the sum-integral and moustache delimiters. No other font contributes geometry.

Latin Modern Math has uppercase script and bold-script alphabets but no lowercase glyphs in either style.
The typesetter retains its existing ordinary-letter fallback for those lowercase requests; it cannot supply
the absent calligraphic forms. Its unencoded glyphs contain no alternative lowercase script alphabet.

Different zlib versions can encode the same exact data differently. The package budget is measured with
Node 22.23.3 by `tools/build-math.mjs`; the packed stream always decodes to the original coordinates and metrics.

## Height and optical forms

Both fonts use 1,000 units per em. Their `OS/2.sxHeight` values are **431** for Latin Modern Math and **530** for
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
| `glyphs` | `[advance, xMin, yMin, xMax, yMax, italicCorrection, topAccent, path]`. |
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
| `edgeStep` | Height of each contour strip: 32 design units. |
| `edgeProfiles` | Glyph index to `[y0, [xMin, xMax], null, ...]`; each following entry describes one strip. |

Outline bounds round outward to whole units. The outlines themselves are unchanged, including exact fractional
coordinates if present. Missing italic corrections are zero; missing accent attachments use half the advance.
Assembly parts retain the OpenType order: bottom to top vertically, left to right horizontally. Latin Modern has
no MATH Device adjustments. Hint programs and general text shaping tables are not used by the SVG renderer.

Contour profiles cover 1,187 ASCII alphanumeric, mathematical italic and script glyphs, including optical and
dotless forms. Entry `i + 1` bounds the original contour within `[y0 + i * edgeStep, y0 + (i + 1) * edgeStep]`;
`null` means no ink. Cubic intersections and horizontal extrema determine the bounds. Values round outward
with a small numerical guard. Profiles are derived spacing data; they do not replace outlines or pretend to be
an original MATH kern table. Layout compares intersecting strips from both glyphs when placing scripts.

Glyph metrics use signed coordinate deltas. Outlines share command structures and exact coordinate differences.
Profiles share matching strip structures and encode edge differences. A final raw DEFLATE stream stores these
bytes. The small synchronous decoder reconstructs the original arrays and SVG paths once, checking input and
output bounds. It requires no network, font installation, font parser or platform font shaping at runtime.

The format follows the [OpenType MATH specification](https://learn.microsoft.com/en-us/typography/opentype/spec/math)
and [RFC 1951](https://www.rfc-editor.org/rfc/rfc1951). Three retained constants have no active consumer:
`DelimitedSubFormulaMinHeight`, `SkewedFractionHorizontalGap` and `SkewedFractionVerticalGap`.
