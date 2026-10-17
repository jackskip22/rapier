# Rapier Math

Self-contained TeX-to-SVG math with embedded Latin Modern outlines. Rendering is synchronous and offline,
with no core runtime dependencies, DOM, global installation or remote font request. Optional integrations
keep the host's Markdown parser in charge.

## Start with a formula

```sh
npm install rapier-math
```

```js
import {render} from 'rapier-math';
const source = String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`;
const result = render(source, {displayMode: true});
if (result.errors.length) console.error(result.errors);
else console.log(result.svg);
```

Keep `source` for editing and copying. A formula API accepts TeX without Markdown delimiters.
`String.raw` helps with JavaScript literals; JSON and transport decoding are separate layers. Never unescape
the TeX a second time. Native ESM works in Node 22+, current browsers and module workers; no CommonJS wrapper
is provided. Server output needs no client renderer unless fitting or further rendering is wanted.

## One file or native modules

For a one-file browser or inline-script integration, use `dist/rapier-math.js` and
`globalThis.RapierMath.renderToString(source)`. This classic file contains the complete
formula renderer and font; it needs no sibling modules or runtime download.

The native `dist/index.mjs` entry is a small facade importing the relative `src/math/`
module graph. It is not a standalone file to copy or inline. Install the whole package,
serve its `dist/` and `src/` directories together, or bundle the native import in your
application. A CDN must serve that package graph or bundle the entry. The browser and
module-worker examples assume the complete package is served from its root.

## Structured and accessible output

```js
import {toMathML} from 'rapier-math/mathml'; // no embedded font or SVG layout
import {renderWithMathML} from 'rapier-math/combined'; // one admitted parse
import {renderAccessible} from 'rapier-math/accessible';
const semantic = toMathML(String.raw`\frac{a}{b}`);
const both = renderWithMathML(String.raw`\frac{a}{b}`);
const accessible = renderAccessible(String.raw`\frac{a}{b}`);
```

Include `rapier-math/accessible.css` when inserting `accessible.html`. Ordinary formulas retain
visual SVG with one assistive MathML sibling. Internally linked formulas use visible native
MathML once and return their standalone SVG separately. Check `semantics.status`: `complete`,
`presentation-fallback`, or `refused`. On refusal, insert original source through a text sink.
The [semantic contract](semantics.md) describes mappings, exact-source annotations, link
tradeoffs, sanitizer/CSP order and the separate manual screen-reader acceptance steps.

Both Markdown adapters accept `accessible: true`; their normal grammar is unchanged. Cache
entries retain only immutable scalar/string output, never a shared semantic tree or HAST.
Native entries execute the carried source modules directly, sharing one parser and alphabet
mapping. SVG-only imports do not reach MathML; MathML-only imports do not reach fonts, layout or
browser observers. The classic offline script includes all formula outputs.

## Markdown

```sh
npm install markdown-it
```

```js
import MarkdownIt from 'markdown-it';
import rapierMath from 'rapier-math/markdown-it';
const md = new MarkdownIt({html: false}).use(rapierMath);
const env = {};
const html = md.render('Price $5. Code: `$$x$$`. Formula: \\(x^2\\).', env);
console.log(env.rapierMathErrors || []);
```

Default delimiters are `\(...\)` (inline), `\[...\]` and `$$...$$` (display). Single `$...$` is opt-in:
`.use(rapierMath, {singleDollar: true})`. It cannot distinguish all currency from mathematics.

| Boundary rule | Contract |
| --- | --- |
| Escapes | An odd run of preceding backslashes escapes a delimiter; an even run does not. The body is never unescaped. |
| Dollar runs | Only complete runs of one or two dollars are delimiters. Three or more are literal. `\$$` is an escaped pair. |
| Single dollars | Nonempty body, no leading/trailing whitespace or CR/LF; a closer followed by an ASCII digit is rejected. |
| Other pairs | Whitespace and newlines are allowed. The first unescaped matching closer wins. No delimiter nesting. |
| Blocks | A display opener at the host's block start and a closer followed only by line whitespace makes a block. Otherwise it is inline content. |
| Incomplete input | No math node is emitted until a matching closer exists. Surrounding text stays under host control. |
| Protected source | Code spans, fences, indented code, link destinations, autolinks and HTML tags remain host syntax. Math in link labels is disabled. Math in image descriptions is retained as literal source in alt text. |

Use `html: false` for untrusted Markdown. If your application enables raw HTML, retain its sanitizer and
HTML policy. Inline HTML element contents follow the host grammar; the math adapter is not an HTML parser.
The `rapier-math/delimiters` export offers `createMathMatcher(source, options)(start, limit?)` for authors of
other host adapters. It indexes boundaries in a raw text region, returns exact UTF-16 offsets, and knows
nothing about Markdown structure. Do not scan rendered HTML with it.

The Rapier app explicitly keeps its established dollar-only dialect, including math in link labels.
The shared owner corrects escaped display closers and retains outer formula whitespace. No public
adapter or renderer imports the app's AGPL Markdown implementation.

In the Rapier app, a closed code fence labeled `math` renders as display math. Saving retains its
fence markers, info string and formula source. The standalone markdown-it adapter keeps code fences
under the host's control.

## unified / remark / rehype

Use `remark-math`, `remark-rehype`, then `rehype-sanitize`, then `rapier-math/rehype`, then `rehype-stringify`.
The complete [unified example](../examples/unified.mjs) grants only the math classes on sanitized code nodes.
The adapter replaces supported `language-math` + `math-inline`/`math-display` nodes with HAST parsed from
the complete renderer insertion markup. Every occurrence receives fresh HAST nodes, including on reuse.
It does not turn authored raw HTML into trusted markup or loosen the global SVG sanitizer.
The optional `hast-util-from-html` peer is used only by this entrypoint.

Choose `remarkMath({singleDollarTextMath: false})` to avoid single-dollar ambiguity. Remark owns delimiter,
whitespace and code rules in this pipeline; its grammar is different from the markdown-it adapter and does
not enable backslash delimiters. Unsupported formulas remain copyable code and produce VFile messages
with `ruleId`, `mathOffset` and `mathSource`.

Both rendering adapters accept `accessible` (default false), `renderOptions`, `maxFormulas` (default 1024) and `maxOutputLength` (default
16 Mi UTF-16 code units of successful formula insertion markup per document render, excluding the host's
display wrapper). Each occurrence spends both count and output admission, including cache hits. Rendering
an already parsed markdown-it tree again starts a fresh budget. Ordinary inline descendants share their
active parent's budget; independent reentrant renders receive their own. Reusing an `env` object does
not extend a budget. Exhaustion leaves source literal with diagnostics. The host owns its source, tree,
prose and final HTML budgets. These are synchronous adapters.

## Streaming and message reuse

```js
import MarkdownIt from 'markdown-it';
import rapierMath from 'rapier-math/markdown-it';
import {createMarkdownStream} from 'rapier-math/stream';

const md = new MarkdownIt({html: false}).use(rapierMath);
const renderMarkdown = (source, session) => md.render(source, {rapierMathSession: session});
let stream = createMarkdownStream(renderMarkdown, {previewEvery: 256});
let shown; // The host replaces its whole preview with each returned snapshot.
try {
  for (const chunk of ['The answer is \\(', 'x^2', '\\).']) {
    const preview = stream.write(chunk);
    if (preview) shown = preview;
  }
  shown = stream.finish(); // {source, html, revision, final: true}; releases reuse.
} finally {
  stream.abort(); // Also releases retained source/artifacts after an exception.
}
```

Use one stream handle per message and associate the supplied session deliberately. `write` accepts
decoded strings and returns a whole preview or `null`; `finish` always runs the batch renderer on the
complete exact source. The host replaces its previous preview and retains `source` for editing/copying.
Show incoming chunks with text rendering for immediate progress; never concatenate them into HTML.
The stream owns no DOM, timers, transport callbacks or global conversation cache. Importing the stream
entry alone does not load the formula renderer. See the complete [stream example](../examples/stream.mjs).

`stream = stream.reset()` closes the old handle, releases its source and artifacts, and returns a fresh
replacement with an advanced revision. Each producer must capture its own handle. Old producers' `write`
and `finish` then refuse even if cancellation races; do not let an old producer read a mutable variable
holding the replacement. Cancel transport as well. `abort` closes a handle and releases its pending work;
it is idempotent. A completed handle cannot accept more chunks. Stream handles cannot reenter themselves.

A renderer throw or a non-string result disposes the current reuse session immediately while preserving
all accepted chunks. Retry `finish()` explicitly to render them with a fresh session, or reset/abort. A
source-budget rejection never accepts or silently truncates the rejected chunk; the caller still owns it.
A rejected chunk does not discard earlier admitted source or its valid artifacts.

Markdown references, setext headings and fences can change earlier interpretation, so previews are
replaceable. An open formula remains literal under its host's grammar. Defaults: at most 1,000,000 retained
source code units; first preview at 256 units, then only after source length has at least doubled. Including
one `finish`, the source passed to the host is less than three times the final nonempty length, even when
previews fail. Explicit finish retries add host calls. `previewEvery` sets the first threshold, not a fixed
per-chunk interval. Parsing, prose rendering and HTML/HAST production still run for every whole preview.
This does not promise constant-time streaming, append-only DOM or arbitrary incremental Markdown parsing.

### Deliberate reuse outside the stream

```js
import {createMathSession} from 'rapier-math/stream';
const session = createMathSession();
try {
  md.render(firstWholeSource, {rapierMathSession: session});
  md.render(nextWholeSource, {rapierMathSession: session});
  console.log(session.stats); // Counters only; no source or mutable artifacts.
} finally {
  session.dispose();
}
```

For rehype, put the same session in each VFile's `data.rapierMathSession`. For example,
`processor.processSync({value: source, data: {rapierMathSession: session}})` uses the sanitized pipeline
in the [unified example](../examples/unified.mjs). Each transformed tree starts fresh admission. Do not put
the session into long-lived processor options or reuse it across messages. Omitting the explicit session
keeps ordinary adapter rendering free of persistent formula retention. A session is not a document budget,
parser, source archive or permission to change any document.

`session.clear()` releases artifacts while leaving that message owner open; counters remain cumulative.
`session.dispose()` permanently closes it and is idempotent. Use a new session for a replacement message.
A disposed or unrecognized session refuses. Adapter throws clear artifacts and restore the enclosing
render frame; the stream additionally disposes its failed lifetime. Interleaved messages keep separate
sessions. Each successful occurrence receives a fresh result object and, for rehype, fresh HAST nodes.

### Configuration, retention and costs

With an explicit reuse session, a document captures supported plain-data `renderOptions` and a copy of
`screen` when its root render starts. Without a session, options retain ordinary per-occurrence reads. Its exact source, output mode, display mode, width and every screen field form the reuse key. Later root
renders see option changes; an active outer render keeps its captured options during nested renders.
Data-shaped proxies use their actual acquired values for both the key and renderer, including invalid
values or failed acquisition; a failure is not silently retried to obtain a different option. Snapshot
inspection may invoke prototype or descriptor traps before property reads, so side-effectful Proxy traps
need not observe ordinary spread order. Use stable data options for predictable message reuse. Structurally unsupported accessors retain
the ordinary per-occurrence path. Keys use a fixed tuple of numbers/booleans followed by exact source, with no arbitrary-object JSON
serialization. Accessors, exotic prototypes, coercible nonnumeric widths, unknown keys and unsupported
option shapes take the ordinary uncached renderer path. Their accessors are not read just to form a key.
New output/semantic/representation options must join this configuration contract before reuse is enabled.

Default limits are 128 entries, `maxRetainedBytes: 2097152` and `maxEntryBytes: 262144`; the entry limit is
capped by the total. All limits are finite nonnegative integers. Pass them to `createMathSession(limits)`
or `createMarkdownStream(renderMarkdown, {reuse: limits})`. `reuse: false` disables stream retention while
keeping the same host and admission path. Least recently used successes are evicted. An entry too large
is rendered once for the current occurrence and not retained: there is no trial rendering followed by a
second rendering. It must be evaluated again if another preview needs it. Failed or in-progress formula
results are never retained, nor are document-dependent resource rejections.

The accounting includes two bytes per source/configuration key code unit, every retained output string
and field name, eight bytes per scalar field, and a 128-byte entry allowance. There are no retained error
payloads. `stats` reports entries, key/artifact/total bytes, peak accounted bytes, hits, evaluations,
bypasses, evictions and disposal. These are logical payload/work counters, not physical heap or device
memory limits. JavaScript engines may use sliced strings, ropes and different object overheads. Stream
source retention is separate and grows with admitted message length; caller-held snapshots remain the
caller's responsibility. Sessions never retain calculated HAST trees or renderer callbacks.

The current expanded SVG is safe to reuse because it contains no occurrence identity. Serialized results
with IDs, local references or accessibility ID references bypass retention, including if a renderer's
default changes. Compact SVG/semantic composition must cache an occurrence-neutral prepared artifact and
materialize the caller's namespace for every insertion; already namespaced output must never enter this
cache. Output admission runs after the complete insertion payload is materialized. Unknown nested result
payloads also bypass until they have an explicit ownership and accounting contract.

Retained state is bounded by configured logical budgets plus the admitted source, not constant memory.
Repeated formulas can avoid parse/layout/serialization; mostly unique, oversized and failing formulas
pay cache bookkeeping without that benefit. Whole-host parsing may dominate prose-heavy documents.
Transport chunks may split delimiters, CRLF, escapes or surrogate pairs. Final source remains the exact
concatenation without normalization; an interim preview may contain an incomplete code unit.

## Formula API and browser lifetime

| Export | Result |
| --- | --- |
| `render(tex, options?)` | `{svg, width, height, depth, lines, fitted, errors}`; dimensions in mathematical ems. |
| `renderToString(tex, options?)` | SVG, including diagnostic SVG for admitted malformed or unsupported syntax. |
| `parse(tex)` | Inspectable AST; throws structured errors. Internal node vocabulary can grow. |
| `fit(container)` | One synchronous DOM fitting pass, returning selected formula count. |
| `observe(container)` | Observe current formulas; returns idempotent cleanup. |
| `version` | The package version. Default export provides the same API. |

`displayMode`, `maxWidth` in mathematical ems, and optional `screen: {fontSize, pixelRatio, dark}` configure
rendering. `preview: true` renders a formula that is still being typed: a missing argument shows a box, groups,
fences and environments left open close, and a half-typed command before `caret` (default: the end) waits.
Any other fault is still an error. `spans: true` marks each symbol with `data-math-at`, its offset in the source, so a tap
on a symbol can place the cursor there. Screen numbers must be positive finite values; `dark` must be boolean. Omit screen options for
SSR and the initial hydration render. Long rows break at available relations/operators; indivisible
oversized groups scale to fit. Fit after hydration, stop observation before replacement, then observe the
new formulas. Stop on unmount. [Browser](../examples/browser.html), [worker](../examples/worker.mjs) and
[React/SSR](../examples/react.tsx) examples demonstrate these boundaries. React is not a package dependency.

## Errors, source and accessibility

Check `errors` before treating a formula as successful. Errors include `code`, `message`, UTF-16 `offset`
and sometimes `command`. An unknown command or environment close to a known one has a `suggestion`
(`\farc` suggests `\frac`). Render-result messages are limited to 1024 code units plus an ellipsis and command
names to 128, with explicit `messageTruncated`/`commandTruncated` flags. Exact admitted source is retained
independently. `parse` throws the parser's details, bounded by its source admission limit. Do not use a
diagnostic message as a source archive.

Valid XML source is kept exactly in SVG `aria-label` and `title`, including BOM, tabs and CRLF (escaped as
character references). Invalid XML characters have visible Unicode escapes and a `data-tex-utf16` carrier:
each four hex digits represents one original UTF-16 code unit. This includes isolated surrogates. The
Markdown host may normalize its syntax-node content; retain the original Markdown separately. Streams
return the exact concatenated source, including malformed UTF-16, without normalization.

Source longer than 1,000,000 code units returns a bounded `resource-limit` diagnostic before source
scanning, escaping or parsing. Its error has `sourceOmitted: true` and its SVG has
`data-math-source-omitted="true"`; neither embeds or truncates the refused source. `renderToString` returns
the same diagnostic SVG. Keep the original input for editing or copying. Admitted source alternatives
remain exact. Other limits include 100,000 tokens, 50,000 parser nodes, depth 192, 4096 macro expansions, 100,000 layout
visits, 4 Mi outline characters and 8 Mi composed SVG characters. Complete returned SVG, including source
alternatives and diagnostics, is capped at 24 Mi UTF-16 code units. These are output/work bounds, not peak
heap or device-memory claims. A later good render has a fresh budget.

SVG labels contain raw TeX, not semantic MathML or mathematical speech. Ordinary equations are images in
the accessibility tree. Equations containing authored HTTP(S) links use a group so the links remain exposed;
each link is keyboard-focusable and labeled with its destination. Keep the editable source or a separate
copy-source affordance in your host. Full semantic navigation, speech and screen-reader parity are not
provided. A future semantic serializer needs an explicit AST-to-MathML mapping and assistive-technology
evaluation; adding a raw TeX label does not satisfy that requirement.

## Security and deployment

The renderer emits local SVG outlines (and plain `text` runs for characters outside the font), never executable HTML, remote font/image fetches or loaded TeX
extensions. Authored links permit only HTTP(S) and use `noopener noreferrer`. Insert only the returned
SVG, never concatenate TeX or arbitrary HTML into the sink. On failure, use a text node or the framework's
escaped text rendering. Formula safety does not sanitize surrounding Markdown.

The native ESM path needs no `eval` or `unsafe-eval`. Generated SVG does contain style attributes:
`script-src 'self'; style-src-attr 'unsafe-inline'; style-src-elem 'none'` permits same-origin external
modules and those attributes in browsers implementing CSP3. It does **not** work under a policy forbidding
all inline styles. `examples/browser.html` carries that policy; older browsers need their own reviewed
style policy. No network access is needed after local module loading; use `connect-src 'none'` if suitable.

With `require-trusted-types-for 'script'`, string HTML sinks and the DOMParser used by `fit`/`observe`
require TrustedHTML. The core does not create a policy, return TrustedHTML or claim fitting support under
that policy. Prefer server-rendered output or the structured rehype path in such applications. If the host
uses a policy for initial insertion, narrowly scope it to freshly generated renderer output; never use a
blanket identity policy for arbitrary strings. The browser/React examples assume string sinks are permitted.

## Syntax and limits

Supported: fractions, roots, scripts, limits, matrices/arrays/alignment, delimiters, accents, operators,
Greek and mathematical alphabets, text/color/size/spacing, local macros, and selected chemistry/physics.
Existing supported package names select built-in syntax; there is no external package/file loader.
This is not a complete TeX document engine. No automatic numbering or cross-formula reference guarantee.
Unsupported commands give diagnostics. Lowercase script/bold-script requests use ordinary-letter fallbacks
where Latin Modern lacks those alphabets. All embedded licensed outlines remain present. Letters, digits
and symbols the font lacks (for example CJK, Cyrillic, Arabic or emoji) are drawn as an SVG `text` run in
the reader's own serif font, fitted to an estimated width, rather than refused.

## Package and proof

Declarations accompany every public entry. Formula imports do not pull in Markdown, unified or React.
For TypeScript, markdown-it 15 provides its own types; markdown-it 14 projects also install
`@types/markdown-it@14`. Use the declarations for your host version.
For a classic script, use `dist/rapier-math.js` and `globalThis.RapierMath`.
The payload includes the font: it is not a few-kilobyte renderer. Payload counts below describe this
build, not npm tarball size or a comparison against another library.

Run `node tests/verify.mjs` and `node tests/check.mjs` from this checkout. The carried source rebuilds the exact
classic payload and ESM module; receipts also cover the adapters, declarations and examples. Follow
`docs/font-source.md` to regenerate font data. License and font provenance are carried with every build.

Verified-claim scope: synchronous self-contained formula rendering; opt-in Markdown integrations; bounded
replaceable previews with exact final source; structured diagnostics and explicit source fallback. This
does not establish all-device behavior, full TeX compatibility, semantic accessibility or universal
size/speed superiority. Test your host's sanitizer, CSP, browser lifetime and supported formula corpus.

## Licenses

The renderer and neutral adapters are MIT. Latin Modern Math 1.959 outlines/metrics retain the GUST Font
License, an instance of LPPL. `LICENSE` contains both complete grants. `src/math/LICENSE-MIT`,
`src/math/FONT-LICENSE.txt` and the SPDX 2.3 `docs/math-components.json` retain renderer and font notices. Both payloads
retain complete licenses. App-specific AGPL source is not included in this package.
