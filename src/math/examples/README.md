# Run the installed examples

From a consumer directory, install `rapier-math`, then run
`node node_modules/rapier-math/examples/formula.mjs`.

For Markdown and streaming, also install `markdown-it` and run `markdown.mjs` or `stream.mjs`.
For unified, install `unified remark-parse remark-math remark-rehype rehype-sanitize rehype-stringify hast-util-from-html`
and run `unified.mjs`. The remark example uses remark's syntax; it does not recognize backslash delimiters.

Serve the package directory over HTTP and open `examples/browser.html`. Its external module imports the
installed ESM renderer, fits the output and releases observation before replacement and on page exit.
Keep both `dist/` and `src/` when serving or copying these native-module examples.
For a one-file alternative, copy `dist/rapier-math.js`, load it with a classic script tag
and call `globalThis.RapierMath.renderToString(source)`; do not copy only `dist/index.mjs`.
Start `new Worker('./worker.mjs', {type: 'module'})` from this directory and post `{id, source}`.
Use an id owned by the current message and ignore stale replies. Workers render SVG; they do not call `observe`.

`react.tsx` is a small React 19/SSR component to copy into an existing TypeScript application. Install
`react react-dom` and the development types `@types/react @types/react-dom`. No framework is required by the core.

For streamed UTF-8, use `TextDecoderStream` or `decoder.decode(bytes, {stream: true})` and flush the decoder
at EOF. Feed decoded strings into one stream per message. Append incoming chunks to a text node for immediate
literal progress, and replace the whole preview when `write` returns a snapshot. Replace it with `finish()` at EOF.
Do not concatenate transport data into HTML. Pass the callback's session through `env.rapierMathSession` or
VFile `data.rapierMathSession` to reuse formulas. On cancellation call `abort`. For replacement, cancel transport
and use the new handle returned by `stream = stream.reset()`. Each producer captures its own handle, so stale
writes/finish calls on the old handle refuse. A failed render releases reusable artifacts but keeps accepted
source for an explicit `finish()` retry; abort in a final cleanup if the host will not retry.

The examples retain the original source as the editable/copyable authority. Markdown hosts can normalize
newlines or escapes in their syntax nodes; an HTML serialization is not an exact source archive.

## Structured and accessible formulas

Run `node examples/semantic.mjs` for font-free MathML. Serve the package root locally and open
`examples/accessible.html` for source replacement, generated MathML, cleanup, CSP and the two
link compositions. The external stylesheet must load. General internal links use native MathML;
a host link around a complete ordinary formula preserves SVG. See [semantic contracts](../docs/semantics.md).
