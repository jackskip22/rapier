# Structured mathematical output

Rapier Math serializes its existing TeX parse into Presentation MathML. Fractions, roots,
scripts, operators and table cells become mathematical elements that a native MathML consumer
can inspect. It does not infer theorem meaning, chemical identities or mathematical speech.

## Select an output

```js
// This import contains the parser and serializer, with no SVG font or layout initialization.
import {toMathML, parse} from 'rapier-math/mathml';
const source = String.raw`\frac{12.5}{\sqrt[3]{x^2+1}}`;
const semantic = toMathML(source, {displayMode: true});
if (semantic.status === 'refused') console.error(semantic.errors);
else console.log(semantic.mathml);
```

The main native entry produces SVG without importing the semantic serializer. When both outputs
are needed, use the explicit combined entry:

```js
import {renderWithMathML} from 'rapier-math/combined';
const result = renderWithMathML(source, {displayMode: true});
```

Its required `semantics` field contains the same result as `toMathML`; the combined call admits
and parses once. SVG errors and semantic status remain independent: MathML can represent a
Unicode character absent from the embedded SVG font. A successful SVG does not turn a semantic
refusal into success. `renderToString` returns SVG. The complete classic `RapierMath` object
also exposes `toMathML` and `renderWithMathML`.

`preview` and `caret` apply only to the SVG `render` and `renderToString` methods.
Combined and accessible rendering use the strict parse and never repair incomplete expressions.

The font-free entry exports `parse` for inspection as well. Parse results are ordinary,
detached data: changing a returned tree has no effect on subsequent renders. There is no
public API accepting arbitrary or modified trees for serialization. Local macros are
expanded by the existing parser; their expanded tree is separate from exact authored TeX.

| Result field | Meaning |
| --- | --- |
| `mathml` | One namespace-correct `math` element, including independent source annotation when admitted. |
| `status: "complete"` | Every encountered part has a supported structural mapping. This is a mapping claim, not an AT or mathematical-understanding claim. |
| `status: "presentation-fallback"` | Structure is emitted with explicit lossy presentation, domain or extension notices in `errors`. |
| `status: "refused"` | No equivalent expression is claimed. A bounded `merror` and source annotation are returned where possible. |
| `errors` | Structured fallback notices or refusal diagnostics, with the same bounded diagnostic fields as SVG rendering. |
| `source.encoding` | `application/x-tex`, `application/x-rapier-tex-utf16`, or `null` for omitted oversized input. |
| `source.omitted` | True only when source admission refused embedding. The caller still owns the original input. |
| `metrics` | Semantic work visits, greatest AST traversal depth, final output UTF-16 code units and emitted native link count. These are not peak-memory or DOM counts. |

## Mapping by construct

The published [MathML Core Candidate Recommendation of 24 June 2025](https://www.w3.org/TR/2025/CR-mathml-core-20250624/)
is the portable structural target. Extensions and lossy cases are reported explicitly.

| TeX/AST family | Mapping and qualification |
| --- | --- |
| Rows and groups | `mrow`; explicit groups stay separate. No inferred multiplication or function application is inserted. Explicit U+2061–U+2064 invisible operators remain `mo`. |
| Identifiers and alphabets | `mi`; a single default or italic letter stays plain, so MathML Core italicizes it and assistive technology reads the ordinary letter. Other alphabets reuse the SVG renderer's pure Unicode mapping. Roman identifiers use `mathvariant="normal"`. Text spaces become no-break spaces because MathML trims token whitespace. |
| Numbers | `mn` joins Unicode decimal-digit integer/decimal runs within one row and matching style. Unary signs remain `mo`. Explicit groups, spaces and style boundaries stop joining. A final directly scripted digit belongs to the complete preceding numeric token, as in `12^3`; `1{2}^3` stays grouped. Multi-dot runs are not reinterpreted as decimals. |
| Scientific notation | Authored `1.2e-3` remains a number, identifier and signed expression; there is no inferred exponent grammar. `1.2\times10^{-3}` preserves its explicit structure. The existing units parser's lowering remains reported as a domain fallback. |
| Named operators and text | Standard names and plain `operatorname` use one `mo`; ordinary multi-character text uses `mtext`. Mixed or styled operator-name content retains its nested structure and gets a fallback notice. |
| Fractions | `mfrac`, with numerator then denominator; zero-bar fractions and explicit fences are retained. Continued-fraction numerator alignment is a documented presentation fallback. |
| Roots | `msqrt` or `mroot`, with radicand before degree. |
| Scripts and limits | `msub`, `msup`, `msubsup`; `munder`, `mover`, `munderover` for applicable explicit/display operator limits. |
| Fences and accents | Explicit `mo` fences, plus under/over accent relationships. No `mfenced` dependency. |
| Matrices, aligned equations and cases | `mtable`/`mtr`/`mtd`, the original row/cell order and case/matrix fences. Cell alignment uses fixed CSS. Custom row gaps/baselines are reported as presentation fallback. Array insertion content remains in adjacent cells; decorative row/column rules are omitted with a notice. |
| Styles and spaces | `mstyle`, safe fixed CSS, Unicode alphabets and `mspace`. Text script/fraktur/double-struck requests use a disclosed MathML 3 `mathvariant` extension. |
| Phantom, smash and raising | `mphantom`/`mpadded`. Overlay-width adjustments retain their content with a fallback notice. Native presentation may differ from SVG. |
| Cancellation and generic negation overlay | MathML 3 `menclose`, with an explicit extension notice. Core-only hosts may omit the mark. Already-negated Unicode operators stay ordinary `mo`. |
| Rules | A decorative `mspace` with an explicit presentation notice; no additional mathematical relationship is inferred. |
| Explicit `mmlToken` | The authored admitted `mi`/`mn`/`mo`/`mtext` kind and token text are retained before visual literal lowering. Only the parser's admitted font variant is accepted. |
| Chemistry, physics and units | Existing fractions, scripts, arrows, fences and rows survive. Origin metadata triggers a domain notice; chemical elements/bonds/charges, unit identities and specialized physical meaning are not invented. |
| Tags and labels | Tags remain following authored content with a notice. Labels remain parser-discarded metadata: there is no equation identity, automatic numbering or cross-formula reference support. |
| HTTP(S) links | A native XHTML `a` inside MathML `mtext`, containing a nested MathML expression. This is a disclosed host integration fallback; see the composition contract below. Nested links and links inside phantom content refuse the semantic path. |

The parser retains only distinctions with live consumers: explicit token kind/text, operator-name
origin, and chemistry/physics/units/tag origin. Its visual syntax and SVG layout relationships
remain the same. Unsupported commands still produce parser diagnostics.

## Exact source and bounded refusal

The first child of `semantics` is the mathematical expression. For XML-valid source without
CR, a following `annotation encoding="application/x-tex"` keeps exact authored source
independently. Escaping includes numeric references for tabs and LF; BOM and supplementary
Unicode characters remain intact. The semantic token text is normalized presentation and is
never described as the original source. The [XML character and newline rules](https://www.w3.org/TR/xml/)
explain why ordinary escaping alone is insufficient.

Source containing CR uses `source.encoding: "application/x-rapier-tex-utf16"`, with four
lowercase ASCII hex digits per original UTF-16 code unit. A separate `text/plain` annotation
is a readable alternative, not an exact-source claim. This preserves CRLF through the actual
HAST-to-HTML-to-HAST pipeline: an HTML stringifier can write a decoded CR literally, which a
later HTML parser normalizes. The ASCII carrier survives that boundary. CR alone does not
make an otherwise supported expression a fallback or refusal. Recover exact source from the
annotation selected by `source.encoding`; when only markup remains, prefer its UTF-16
annotation when present, otherwise its TeX annotation. SVG uses the same carrier for CR-bearing source, preserving exact input through host
reserialization and later browser fitting. The source is admitted and encoded once per operation.

XML-invalid input, including isolated UTF-16 surrogates, U+0000 and U+FFFE/U+FFFF, returns
`refused`. A `text/plain` annotation shows explicit Unicode escapes and a separate
`application/x-rapier-tex-utf16` annotation contains four lowercase hex digits for every
original UTF-16 code unit. The same carrier used for CR is an application convention, not a
standard TeX media type or a claim that the readable alternative is original TeX. Source invalid in XML
never becomes an invalid character reference. Invalid characters produced by an admitted
Unicode command likewise refuse while retaining its valid authored command text.

Source longer than 1,000,000 UTF-16 code units is refused before scanning, escaping or parsing.
It is not truncated or embedded; `source.omitted`, the diagnostic's `sourceOmitted`, and
`data-math-source-omitted` make that explicit. Keep that original input with the host.

Existing parser bounds still apply: 100,000 tokens, 50,000 nodes, nesting 192 and 4096 macro
expansions. Serialization adds fixed limits of 100,000 work visits, traversal depth 512,
8 Mi presentation code units and 16 Mi complete MathML code units. Array expansions and
repeated insertion content count against the semantic budget. If source carriers plus
presentation exceed the complete-output bound, the result refuses, retains the admitted
source carriers and replaces the partial expression with `merror`. SVG retains its existing
separate limits. Combined accessible HTML has a 40 Mi code-unit bound. All budgets are local
to one operation; a refusal cannot poison a later render. These bounds do not measure device
memory or claim constant-size output.

## Usable SVG and MathML composition

```js
import {renderAccessible} from 'rapier-math/accessible';
// Also include rapier-math/accessible.css in the host's stylesheet pipeline.
const result = renderAccessible(source, {displayMode: true});
if (result.errors.length) container.textContent = source;
else container.innerHTML = result.html; // only freshly generated output reaches this sink
```

`renderAccessible` calls `renderWithMathML` once. It returns full standalone `svg`, the
semantic result, `html`, and `presentation`:

- `svg-mathml`: visual SVG is inside an `aria-hidden` wrapper; native MathML is its clipped
  assistive sibling. There are no authored links in this branch. The semantic tree has no
  image role, raw-TeX aria-label, `aria-hidden`, `display:none` or `visibility:hidden` override.
- `mathml`: authored links use visible native MathML once. Standalone SVG is still returned
  for consumers choosing that representation, but is not inserted into the combined host.
  Each link uses an HTTP(S) URL, a native HTML anchor, `noopener noreferrer`, and its visible
  content as a nested mathematical expression. The destination title supplies a link-name
  fallback in hosts that do not derive a name from MathML children; it is not generated
  mathematical speech or a claim of a descriptive link purpose. No duplicate or clipped
  focus target is created.
- `refused`: `html` is empty and `errors` explains the failure. Insert the original source
  through a text sink. A semantic refusal is not silently downgraded to equivalent success.

This composition supplies one exposed semantic equation surface structurally. Its actual
announcements and link navigation still require AT acceptance. Putting an interactive link
under `aria-hidden` violates the [W3C focus rule](https://www.w3.org/WAI/standards-guidelines/act/rules/6cfa84/).
The published Core target omits native MathML links; HTML embedding uses its web integration
rules. A newer editor draft's MathML anchor does not establish support in a target browser.
Nested, phantom and empty links refuse; the serializer also checks explicit transparency
while allowing an opaque descendant. Unknown or host-specific color names cannot undo an explicitly transparent ancestor. These are structural checks, not a visibility guarantee
under arbitrary host CSS, colors or backgrounds.

The stylesheet must be retained. If it is absent or blocked, both ordinary representations
can become visible. Hosts that cannot include it can insert `toMathML(source).mathml` visibly
as their sole representation instead. Native MathML uses the host's mathematical font;
it does not inherit Rapier's embedded SVG outlines. Linked formulas therefore use native
typesetting rather than a guarantee of identical SVG appearance.

`fit`/`observe` may operate on ordinary combined output because its SVG source carrier remains
intact; they adjust only SVG geometry. Linked native MathML has no SVG to fit. Do not change
source on one side of a combined formula: regenerate the whole result. Stop observations
before replacement and on unmount; no semantic timers, IDs or retained formula caches exist.
For SSR, emit the same source/options and stylesheet; initial MathML needs no client code.

The [accessible browser example](../examples/accessible.html) keeps editable source and generated
MathML available and demonstrates both representations, replacement and cleanup. The
[font-free example](../examples/semantic.mjs) runs in Node, SSR or a module worker.

A host HTML link can wrap an ordinary `svg-mathml` result to link the whole formula while
preserving its SVG appearance. Put the anchor outside both composition siblings and provide
an authored link-purpose name, such as `aria-label="Open the derivation"`, or a meaningful
link title. Native MathML children can leave an otherwise unnamed host link blank in a
browser's accessibility tree. For accessible output the rehype adapter retains an existing
`aria-label`, `aria-labelledby` or title; otherwise it supplies the existing destination as
a title fallback. This preserves the native mathematical subtree without synthesizing
speech. A URL fallback is not a substitute for the author's meaningful link-purpose name.
Direct `renderAccessible` users must name any containing host anchor themselves. Do not nest
an internally linked formula inside another link. The adapters retain the outer host link
and leave such a formula as source with a `nested-link` diagnostic. Host grammar still applies:
markdown-it keeps math in link labels literal; a remark-math/rehype pipeline can admit it.

## Markdown, sanitizer and CSP boundaries

The neutral markdown-it and rehype adapters accept `accessible: true`. Include the same CSS.
Their document output budget counts the complete inserted HTML, including semantic annotations and every cache hit;
semantic refusal leaves source in the host. Original Markdown and diagnostic `mathSource` remain
the exact fallback authority: HTML text alone can normalize CR or replace invalid Unicode code units. Their parser grammar and lifetime ownership do not
change. Each inserted occurrence counts against its document's output budget.

For rehype, retain the documented order: host parsing, `rehype-sanitize`, this math adapter,
then serialization. The adapter materializes only newly generated output. If a host sanitizes
again afterward, its policy must explicitly retain the required MathML namespace/elements,
source annotations, generated styles, classes and native links. Do not globally allow arbitrary
authored SVG or HTML. HTML serialization is not a replacement for retaining original Markdown.

The example uses an external stylesheet/module and permits generated style attributes. A CSP
forbidding all inline style attributes cannot reproduce all SVG or MathML presentation. Core
structure may survive, but that is not a claim of unchanged presentation. The package creates
no Trusted Types policy; string insertion and SVG fitting have the same TrustedHTML limitations
as the existing browser API. Exact HTTP(S) link destinations carry no fetch authority until
the person activates them; no formula rendering request performs a network fetch.

## Assistive-technology acceptance

Generated MathML, strict XML parsing, HAST inspection and DOM/ARIA checks establish structure
and custody. They do not establish speech output, mathematical navigation or screen-reader
parity. No native browser/screen-reader stack is claimed as tested by these checks.

For each supported host, record the actual OS, browser, screen reader, math provider, versions
and speech/braille settings. Read a sentence with inline math, a nested fraction/root, a matrix
and cases expression, and a linked fraction. Check reading order, access to numerator and
denominator, root degree and table cells, a single intended equation announcement, one visible
link focus target, link activation and source edit/copy. Repeat after replacement and cleanup.
These steps are manual acceptance, not an automated pass:

- [NVDA's mathematical-content guide](https://download.nvaccess.org/documentation/userGuide.html):
  use the installed provider and recorded browser; enter math from browse mode and inspect
  its nested parts, then return to the surrounding sentence.
- [JAWS Math Viewer guidance](https://support.freedomscientific.com/SurfsUp/24-MathML.htm):
  enter its viewer, inspect peers and nested structure, return and activate the native link.
- [VoiceOver mathematical-equation guidance for iPhone](https://support.apple.com/en-au/guide/iphone/iphe4ee74be8/27/ios/27):
  explore the expression at different granularities and verify nested math within a link.
  Qualify macOS/Safari separately with its actual VoiceOver controls.

Run `node examples/semantic.mjs` from the installed package directory to inspect a formula's
MathML, parse tree, status and work counters. The runtime package has no dependency on Python,
`lxml` or an XML parser.
