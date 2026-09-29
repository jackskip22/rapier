# terser 5.51.2, vendored for the build's script compiler

`bundle.min.js` is terser's own `dist/bundle.min.js` (BSD-2-Clause, `LICENSE`), with one change:
the UMD header's CommonJS branch passes an empty object where it required `@jridgewell/source-map`.
The build never asks for a source map, so that library's only uses (`SourceMapConsumer`,
`SourceMapGenerator`, behind the `sourceMap` option) are never reached, and the tree carries no
`node_modules` (docs/build.md, "Vendoring"). The one `require("acorn")` left inside is behind the
`parse.spidermonkey` option, also never asked for. Used by `tools/minify.mjs` (private names shortened,
class names and reflected functions kept, nothing moved between functions) and
`tools/runtime-symbols.mjs` (the build-only record of the shortened names).
