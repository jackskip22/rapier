// SPDX-License-Identifier: MIT
// Typesetting faults, each with its reproducer. Where the TeXbook's Appendix G decides, the expected
// value is LuaTeX's own output for the same formula (unicode-math, Latin Modern Math 1.959), in ems.
// Replay: node tests/typeset.mjs [package-root]. Ink is measured from the font's own contour strips.
import assert from 'node:assert/strict';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const load = file => import(pathToFileURL(resolve(root, 'src/math', file)).href);
const {MATH_FONT} = await load('font.js'), L = await load('layout.js');
const {mathPrepare} = await load('source.js'), {mathToMathML} = await load('semantic-api.js'), {renderMath} = await load('api.js');
const context = (display = false) => ({size: 1, level: 0, variant: 'normal', cramped: false, display, cache: new WeakMap(), budget: {nodes: 0, outlineBytes: 0}});
function layout(tex, display = false) {
  const {tree, error} = mathPrepare(tex);
  assert(!error, tex + ': ' + error?.message);
  return L.mathLayout(tree, context(display));
}
const mathml = tex => mathToMathML(tex).mathml;

// Every outline in an SVG fragment: its glyph, origin and scale, from the transforms that place it.
const paths = new Map();
function glyphOf(d) {
  if (!paths.size) for (let id = 0, g; (g = MATH_FONT.glyph(id)); id++) { if (g?.[7] && !paths.has(g[7])) paths.set(g[7], id); }
  return paths.get(d);
}
function glyphs(svg) {
  const found = [], stack = [[0, 0, 1, 1]];
  for (const [tag] of svg.matchAll(/<\/?g\b[^>]*>|<path\b[^>]*>/g)) {
    if (tag === '</g>') { stack.pop(); continue; }
    const [x, y, sx, sy] = stack.at(-1), t = /translate\(([-\d.e]+) ([-\d.e]+)\)/.exec(tag), s = /scale\(([-\d.e]+) ([-\d.e]+)\)/.exec(tag);
    let next = [x, y, sx, sy];
    if (tag.startsWith('<g')) {
      if (t) next = [x + sx * +t[1], y + sy * +t[2], sx, sy];
      if (s) next = [next[0], next[1], sx * +s[1], sy * +s[2]];
      stack.push(next);
    } else {
      const d = /\bd="([^"]+)"/.exec(tag)?.[1], id = d && glyphOf(d);
      if (id !== undefined && s) found.push({id, x, y, sx: sx * +s[1], sy: sy * -s[2]});
    }
  }
  return found;
}
// Horizontal ink strips of a placed glyph (its contour profile; its bounds when unprofiled).
function strips({id, x, y, sx, sy}) {
  const g = MATH_FONT.glyph(id), p = MATH_FONT.profile(id), out = [];
  if (!p) return [{top: y - g[4] * sy, bottom: y - g[2] * sy, left: x + g[1] * sx, right: x + g[3] * sx}];
  for (let i = 1; i < p.length; i++) if (p[i])
    out.push({top: y - (p[0] + i * MATH_FONT.edgeStep) * sy, bottom: y - (p[0] + (i - 1) * MATH_FONT.edgeStep) * sy, left: x + p[i][0] * sx, right: x + p[i][1] * sx});
  return out;
}
// Smallest horizontal gap between two glyphs' ink where they share a height; negative when the ink overlaps.
function inkGap(a, b) {
  let gap = Infinity;
  for (const s of strips(a)) for (const t of strips(b))
    if (s.top < t.bottom && t.top < s.bottom) gap = Math.min(gap, Math.max(t.left - s.right, s.left - t.right) <= 0 ? -Math.min(s.right - t.left, t.right - s.left) : Math.max(t.left - s.right, s.left - t.right));
  return gap;
}
const ink = item => strips(item).reduce((r, s) => ({left: Math.min(r.left, s.left), right: Math.max(r.right, s.right), top: Math.min(r.top, s.top), bottom: Math.max(r.bottom, s.bottom)}), {left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity});
const near = (actual, expected, message, tolerance = 0.01) => assert(Math.abs(actual - expected) <= tolerance, message + ': ' + actual.toFixed(3) + ' (TeX ' + expected + ')');

const cells = [];
const cell = (id, claim, check) => cells.push({id, claim, check});

cell('F1', 'a superscript clears an over-accent', () => {
  for (const tex of [String.raw`\hat{i}^2`, String.raw`\vec{x}^2`, String.raw`\tilde{\jmath}^2`, String.raw`\dot{x}^n`]) {
    const [, accent, script] = glyphs(layout(tex).svg);
    assert(inkGap(accent, script) > 0, tex + ': superscript ink meets the accent');
  }
  // TeX's rule 18a keeps \hat{x}^2 where x^2 is.
  near(glyphs(layout(String.raw`\hat{x}^2`).svg)[2].x, glyphs(layout('x^2').svg)[1].x, String.raw`\hat{x}^2 script`, 0.08);
});
cell('F2', 'a subscript keeps the slanted letter clear of the next', () => {
  for (const tex of ['V_i H', 'V_i T', 'W_i Y']) {
    const items = glyphs(layout(tex).svg);
    assert(inkGap(items[0], items.at(-1)) >= 0, tex + ': the next letter meets the slanted letter');
  }
});
cell('F3', 'an under-accent adds only its own depth', () => {
  assert(layout(String.raw`\utilde{x}`).d <= 0.492, String.raw`\utilde{x} depth exceeds TeX's 0.492`);
  assert(layout(String.raw`\underaccent{\bar}{x}`).d <= 0.439, String.raw`\underaccent{\bar}{x} depth exceeds TeX's 0.439`);
});
cell('F4', 'braces centre on slanted letters', () => {
  const over = glyphs(layout(String.raw`\overbrace{f}`, true).svg), f = over.find(item => item.id === MATH_FONT.chars[0x1d453]);
  const middle = item => (ink(item).left + ink(item).right) / 2;
  near(middle(over.find(item => item !== f)) - f.x, layout('f', true).w / 2, String.raw`\overbrace{f} brace centre`, 0.01);
  const v = layout(String.raw`\underbrace{V}_n`, true), items = glyphs(v.svg), n = items.at(-1), nW = MATH_FONT.glyph(n.id)[0] * n.sx;
  const vItem = items.find(item => item.id === MATH_FONT.chars[0x1d449]);
  near(n.x + nW / 2 - vItem.x, layout('V', true).w / 2, String.raw`\underbrace{V}_n label centre`, 0.01);
});
cell('F5', 'a radical degree kerns into the sign', () => {
  const sign = glyphs(layout(String.raw`\sqrt[3]{x}`).svg).find(item => item.id === MATH_FONT.chars[0x221a]);
  near(sign.x, 0.062, String.raw`\sqrt[3]{x} sign x`, 0.003);
});
cell('F6', 'corner delimiters sit where TeX puts them', () => {
  const items = glyphs(layout(String.raw`\left\ulcorner\frac{a}{b}\right\urcorner`, true).svg);
  near(items[0].y, 0.135, String.raw`\ulcorner origin y`);
  const low = glyphs(layout(String.raw`\left\llcorner\frac{a}{b}\right\lrcorner`, true).svg);
  near(low[0].y, -0.380, String.raw`\llcorner origin y`);
});
cell('F7', 'starred cases set conditions as text', () => {
  const {tree, error} = mathPrepare(String.raw`\begin{cases*} x & if $x > 0$ \\ 0 & otherwise \end{cases*}`);
  assert(!error, 'cases*: ' + error?.message);
  const condition = JSON.stringify(tree.children[0].body ?? tree.children[0]);
  assert(/"type":"text","value":"if/.test(condition) && /"value":"otherwise"/.test(condition), 'cases* condition is text');
});
cell('F8', 'mhchem isotopes', () => {
  const {tree, error} = mathPrepare(String.raw`\ce{^{235}_{92}U + ^1_0n}`);
  assert(!error);
  assert(!/"base":\{"type":"glyph","value":"\+"/.test(JSON.stringify(tree)), String.raw`\ce: the scripts before n stay on n, not on +`);
  const items = glyphs(layout(String.raw`\ce{^{235}_{92}U}`).svg), right = item => item.x + MATH_FONT.glyph(item.id)[0] * item.sx;
  near(right(items[2]), right(items[4]), String.raw`\ce isotope scripts end together (TeX)`, 0.002);
});
cell('F9', 'bold digits and bold dotless letters', () => {
  assert.equal(layout(String.raw`\boldsymbol{0}`).glyph, MATH_FONT.chars[0x1d7ce], String.raw`\boldsymbol{0} is a bold digit`);
  assert.equal(layout(String.raw`\bm{1}`).glyph, MATH_FONT.chars[0x1d7cf], String.raw`\bm{1} is a bold digit`);
  assert.equal(layout(String.raw`\boldsymbol{\imath}`).glyph, MATH_FONT.dotless[MATH_FONT.chars[0x1d48a]], String.raw`\boldsymbol{\imath} is bold dotless`);
  assert.equal(layout(String.raw`\mathbf{\jmath}`).glyph, MATH_FONT.dotless[MATH_FONT.chars[0x1d423]], String.raw`\mathbf{\jmath} is bold dotless`);
});
cell('F10', 'binary and fraction spacing, matrix cells', () => {
  near(layout(String.raw`a\boldsymbol{+}b`).w, 2.180, String.raw`a\boldsymbol{+}b width`, 0.002);
  near(layout(String.raw`a\textcolor{red}{+}b`).w, 1.736, String.raw`a\textcolor{red}{+}b width (a braced group is ordinary)`, 0.002);
  const f = layout(String.raw`\frac{1}{2},`);
  near(f.rowItems[1][1] - f.rowItems[0][0].w, 0, String.raw`\frac{1}{2}, space before the comma`, 0.002);
  const cramped = layout(String.raw`\frac{1}{\begin{matrix}x^2\end{matrix}}`, true), plain = layout(String.raw`\begin{matrix}x^2\end{matrix}`);
  near(glyphs(cramped.svg).at(-1).y - glyphs(cramped.svg).at(-2).y, glyphs(plain.svg).at(-1).y - glyphs(plain.svg).at(-2).y, 'matrix cell superscript rise inside a denominator', 0.001);
});
cell('F11', 'MathML Core attributes', () => {
  assert(!/movablelimits="false">max/.test(mathml(String.raw`\overline{A_{\max}}`)), String.raw`\max in a script keeps its own limits`);
  assert(/<mtable displaystyle="true"[^>]*data-math-environment="darray"/.test(mathml(String.raw`\begin{darray}{c}x\end{darray}`)), 'darray is display style');
  assert(/<mi[^>]*>℧<\/mi><mi[^>]*>⅁<\/mi>/.test(mathml(String.raw`\mho\Game`)), String.raw`\mho and \Game are identifiers`);
  assert(!/form="infix"[^>]*>\+/.test(mathml('(a+)')), 'a trailing plus is not infix');
});
cell('F12', 'colour paints once; a fence without \\middle lays out once', () => {
  const svg = renderMath(String.raw`\color{red}a+b+c=1+2+3`, {maxWidth: 3}).svg;
  assert(!/<g fill="red"[^>]*><g fill="red"/.test(svg), 'colour is painted twice');
  const {tree} = mathPrepare(String.raw`\left(a+b\right)`), c = context();
  L.mathLayout(tree, c);
  const {tree: body} = mathPrepare('(a+b)'), d = context();
  L.mathLayout(body, d);
  assert(c.budget.nodes <= d.budget.nodes, 'fence body laid out twice: ' + c.budget.nodes + ' visits for ' + d.budget.nodes);
});
cell('F13', 'what people write most', () => {
  const inputs = [String.raw`\SI{9.81}{m.s^{-2}}`, String.raw`\SI{3}{\kilo\gram\metre\per\second\squared}`, String.raw`\num{12345.678}`, String.raw`\si{\ohm}`, String.raw`\unit{\micro\metre}`, String.raw`\ang{30;15;10}`,
    String.raw`\mel{n}{H}{m}`, String.raw`\ev{x}`, String.raw`\ip{a}{b}`, String.raw`\op{a}{b}`, String.raw`\pb{f}{g}`, String.raw`\qq{if}`, String.raw`\qc`, String.raw`\Res`,
    String.raw`\idotsint`, String.raw`\smashoperator{\sum_{i=1}^n}`, String.raw`\begin{multlined}a\\b\end{multlined}`, String.raw`\begin{lgathered}a\\b\end{lgathered}`, String.raw`\begin{rgathered}a\\b\end{rgathered}`,
    String.raw`\mathmakebox[2em][l]{x}`, String.raw`\not\in`, String.raw`\not\subset`];
  const rejected = inputs.filter(tex => mathPrepare(tex).error);
  assert.deepEqual(rejected, [], 'rejected');
});

cell('P1', 'a formula being typed previews without an error', () => {
  for (const tex of [String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`, String.raw`\begin{pmatrix}1 & 2\\3 & 4\end{pmatrix}`, String.raw`\left(x+1\right)^{\sqrt[3]{y}}`])
    for (let i = 1; i <= tex.length; i++) {
      const prefix = tex.slice(0, i), result = renderMath(prefix, {preview: true});
      assert.deepEqual(result.errors, [], 'preview of ' + prefix);
      assert(result.svg.includes('<title>' + prefix.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</title>'), 'exact source of ' + prefix);
    }
  for (const [tex, caret] of [[String.raw`\sqrt{x^}`, 8], [String.raw`\sqrt{x+\}`, 9], [String.raw`a+\fra{}`, 6]])
    assert.deepEqual(renderMath(tex, {preview: true, caret}).errors, [], 'preview at the caret of ' + tex);
  assert.equal(renderMath(String.raw`\frac{1}{`).errors.length, 1, 'strict rendering is unchanged');
  assert.equal(renderMath(String.raw`\frac{a}{b} \farc + 1`, {preview: true}).errors[0]?.suggestion, String.raw`\frac`, 'a fault before the end stays, with a suggestion');
});

const results = [];
for (const {id, claim, check} of cells) {
  try { check(); results.push([id, 'green', claim]); }
  catch (error) { results.push([id, 'red', claim + ': ' + error.message]); }
}
for (const row of results) console.log(row.join('\t'));
assert(results.every(row => row[1] === 'green'), 'red cells');
console.log(JSON.stringify({cells: results.length, typesetting: 'TeX where Appendix G decides'}));
