# Changelog

## 3.0.0 (2026-10-31)

- Breaking: types: `renderWithMathML` and `renderAccessible` take no `preview` or `caret`.
- Types: `markdown-it` takes extra `env` fields; `rehype` works without a `VFile`.
- Types: the classic `RapierMath` global is a `var`.
- `node src/tools/build-math.mjs --package .` refreshes source receipts and checksums.

## 2.7.0 (2026-10-20)

- `\verb` and `\verb*` set verbatim text.
- `\mathchoice` picks its branch by display or script style, in SVG and MathML.
- Prescripts render as `mmultiscripts` in MathML.
- Monospace punctuation, visible space and the sharp s use Latin Modern Mono outlines.

## 2.6.1 (2026-10-18)

- Use the font's ellipses and correct extensible arrow sizes.
- Match amscd row spacing and under-accent attachment points.
- Correct chemistry labels, state spacing and superscripts.
- Keep chemistry arrows at least 2 em wide in MathML.
- Include the Latin Modern Mono sharp s outline for monospace text.
- Preserve exact math fence source in shared Markdown rules.
