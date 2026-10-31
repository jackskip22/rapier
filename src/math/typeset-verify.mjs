// SPDX-License-Identifier: MIT
// Typesetting faults, each with its reproducer. Where the TeXbook's Appendix G decides, the expected
// value is LuaTeX's own output for the same formula (unicode-math, Latin Modern Math 1.959), in ems.
// Replay: node repo/math/typeset-verify.mjs repo, or node tests/typeset.mjs [package-root].
// Ink is measured from the font's own contour strips.
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = resolve(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const mathRoot = resolve(root, existsSync(resolve(root, 'math/font.js')) ? 'math' : 'src/math');
const load = file => import(pathToFileURL(resolve(mathRoot, file)).href);
const {MATH_FONT} = await load('font.js'), L = await load('layout.js'), parser = await load('parser.js');
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
// A glyph's contour profile: the ink's left and right edge in each 32-unit horizontal strip, from its outline's
// line and cubic segments (absolute M, L, H, V, C and Z commands, as the font data writes them).
const EDGE_STEP = 32, profiles = new Map();
const quadratic = (a, b, c) => { if (Math.abs(a) < 1e-10) return Math.abs(b) < 1e-10 ? [] : [-c / b]; const d = b * b - 4 * a * c; if (d < 0) return []; const root = Math.sqrt(d); return [(-b + root) / 2 / a, (-b - root) / 2 / a]; };
const cubic = s => { const cx = (s[2] - s[0]) * 3, cy = (s[3] - s[1]) * 3, bx = (s[4] - s[2]) * 3 - cx, by = (s[5] - s[3]) * 3 - cy; return [s[6] - s[0] - cx - bx, s[7] - s[1] - cy - by, bx, by, cx, cy, s[0], s[1]]; };
function profile(id) {
  if (profiles.has(id)) return profiles.get(id);
  const g = MATH_FONT.glyph(id), segments = [];
  let x = 0, y = 0, startX = 0, startY = 0;
  for (const [, command, args] of (g?.[7] || '').matchAll(/([MLHVCZ])([^MLHVCZ]*)/g)) {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (command === 'M') { [x, y] = n; startX = x; startY = y; }
    else if (command === 'L') { segments.push([x, y, n[0], n[1]]); [x, y] = n; }
    else if (command === 'H') { segments.push([x, y, n[0], y]); x = n[0]; }
    else if (command === 'V') { segments.push([x, y, x, n[0]]); y = n[0]; }
    else if (command === 'C') { segments.push([x, y, ...n]); x = n[4]; y = n[5]; }
    else { if (x !== startX || y !== startY) segments.push([x, y, startX, startY]); x = startX; y = startY; }
  }
  if (!segments.length) { profiles.set(id, null); return null; }
  const first = Math.floor(g[2] / EDGE_STEP) * EDGE_STEP, rows = Array.from({length: Math.max(1, Math.ceil((g[4] - first) / EDGE_STEP))}, () => []);
  for (const s of segments) {
    if (s.length === 4) {
      const [x0, y0, x1, y1] = s;
      rows.forEach((row, i) => {
        const lower = first + i * EDGE_STEP, upper = lower + EDGE_STEP, ts = [0, 1];
        if (y1 !== y0) ts.push((lower - y0) / (y1 - y0), (upper - y0) / (y1 - y0));
        for (const t of ts) { const at = y0 + t * (y1 - y0); if (0 <= t && t <= 1 && lower - 1e-7 <= at && at <= upper + 1e-7) row.push(x0 + t * (x1 - x0)); }
      });
      continue;
    }
    const [a0, a1, b0, b1, c0, c1, d0, d1] = cubic(s), vertical = t => ((a1 * t + b1) * t + c1) * t + d1, extrema = [0, 1, ...quadratic(3 * a0, 2 * b0, c0)],
      critical = [0, 1, ...quadratic(3 * a1, 2 * b1, c1).filter(t => 0 < t && t < 1)].sort((p, q) => p - q);
    const crossing = height => {
      const roots = [];
      for (let i = 1; i < critical.length; i++) {
        let low = critical[i - 1], high = critical[i];
        const yLow = vertical(low), yHigh = vertical(high);
        if (!(Math.min(yLow, yHigh) <= height && height <= Math.max(yLow, yHigh))) continue;
        for (let k = 0; k < 45; k++) { const middle = (low + high) / 2; if ((vertical(middle) < height) === (yLow < yHigh)) low = middle; else high = middle; }
        roots.push((low + high) / 2);
      }
      return roots;
    };
    const ys = [s[1], s[3], s[5], s[7]], yMin = Math.min(...ys), yMax = Math.max(...ys);
    rows.forEach((row, i) => {
      const lower = first + i * EDGE_STEP, upper = lower + EDGE_STEP;
      if (lower > yMax || upper < yMin) return;
      for (const t of [...extrema, ...crossing(lower), ...crossing(upper)]) if (0 <= t && t <= 1) { const at = vertical(t); if (lower - 1e-7 <= at && at <= upper + 1e-7) row.push(((a0 * t + b0) * t + c0) * t + d0); }
    });
  }
  const result = [first, ...rows.map(row => row.length ? [Math.floor(Math.min(...row) - 1e-7), Math.ceil(Math.max(...row) + 1e-7)] : null)];
  profiles.set(id, result);
  return result;
}
// Horizontal ink strips of a placed glyph, from its contour profile.
function strips({id, x, y, sx, sy}) {
  const g = MATH_FONT.glyph(id), p = profile(id), out = [];
  if (!p) return [{top: y - g[4] * sy, bottom: y - g[2] * sy, left: x + g[1] * sx, right: x + g[3] * sx}];
  for (let i = 1; i < p.length; i++) if (p[i])
    out.push({top: y - (p[0] + i * EDGE_STEP) * sy, bottom: y - (p[0] + (i - 1) * EDGE_STEP) * sy, left: x + p[i][0] * sx, right: x + p[i][1] * sx});
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
  // mathtools' optional rule and height are consumed, not taken as the bracket's base.
  for (const tex of [String.raw`\overbracket[0.5pt][2pt]{a+b}^n`, String.raw`\underbracket[1pt]{a+b}`])
    assert.equal(JSON.stringify(mathPrepare(tex).tree).match(/"type":"accent","base":\{"type":"row","children":\[\{"type":"glyph","value":"a"/)?.length, 1, tex + ' brackets a+b');
  const rejected = inputs.filter(tex => mathPrepare(tex).error);
  assert.deepEqual(rejected, [], 'rejected');
});

cell('F14', 'a fence is as tall as TeX makes it; matrix rows carry the array strut', () => {
  for (const [tex, h, d, display] of [[String.raw`\left(x\right)`, 0.748, 0.248], [String.raw`\left(-\right)`, 0.748, 0.248], [String.raw`\begin{bmatrix}x\end{bmatrix}`, 0.850, 0.350],
    [String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`, 1.450, 0.950], [String.raw`\begin{cases}a&x\\b&y\end{cases}`, 1.750, 1.250, true], [String.raw`\begin{aligned}a&=b\\c&=d\end{aligned}`, 1.600, 1.100, true]]) {
    const b = layout(tex, display);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
  // An empty side is TeX's null delimiter, 1.2 pt wide.
  for (const [tex, w, display] of [[String.raw`\left.\right)`, 0.509], [String.raw`\left.\frac{a}{b}\right|_0^1`, 1.526], [String.raw`\begin{cases}a&x\\b&y\end{cases}`, 3.123, true]])
    near(layout(tex, display).w, w, tex + ' width', 0.002);
});
cell('F15', 'a fraction carries TeX\'s null delimiter space outside its rule; \\cfrac drops the right one', () => {
  for (const [tex, w] of [[String.raw`\frac{a}{b}`, 0.674], [String.raw`\cfrac{1}{b}`, 0.620], [String.raw`\cfrac{1}{a+\cfrac{1}{b}}`, 2.491], [String.raw`\cfrac[l]{1}{bbbb}`, 1.878], [String.raw`\binom{n}{k}`, 1.338]])
    near(layout(tex).w, w, tex + ' width', 0.002);
  const rule = /translate\(([\d.]+) 0\)"><path data-math-rule="" d="M0 [-\d.]+H([\d.]+)/.exec(layout(String.raw`\frac{a}{b}`).svg);
  assert(rule, String.raw`\frac{a}{b} has a rule`);
  near(+rule[1], 0.120, String.raw`\frac{a}{b} rule starts after the null delimiter`, 0.002);
  near(+rule[2], 0.434, String.raw`\frac{a}{b} rule spans only its numerator and denominator`, 0.002);
});
cell('F16', 'scripts on a composed base sit by its box, as TeX\'s rule 18a does', () => {
  for (const [tex, h, d] of [[String.raw`{\smash{\frac{a}{b}}}_i^2`, 0.828, 0.268], [String.raw`{\sqrt{x}}^2`, 1.064, 0.191], [String.raw`{\vphantom{\frac{a}{b}}x}^2`, 1.334, 0.697], [String.raw`\begin{pmatrix}a\\b\end{pmatrix}^T`, 1.673, 0.950]]) {
    const b = layout(tex, true);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
});
cell('F17', 'a script sits at its base\'s advance, as TeX places it without the font\'s cut-in kerns', () => {
  for (const [tex, w] of [['x_2^3', 1.026], ['x^2', 1.026], ['1^2', 0.954], ['A^2', 1.204], ['f^2', 1.034], ['T_2', 1.038], ['P_i', 0.981], ['V_i', 0.922],
    [String.raw`x^{\frac{a}{b}}`, 1.255], [String.raw`\hat{A}^2`, 1.204], [String.raw`{\mathrm{d}}^2`, 1.010]])
    near(layout(tex).w, w, tex + ' width', 0.002);
});
cell('F18', 'braces, parentheses, brackets and arrows over a formula are TeX\'s font accents', () => {
  for (const [tex, w, h, d] of [[String.raw`\overbrace{x}^{n}`, 0.572, 1.299, 0.011], [String.raw`x+\overbrace{y}^n+z`, 3.698, 1.299, 0.205], [String.raw`\overbrace{x+y+z}`, 4.000, 0.978, 0.205],
    [String.raw`\underbrace{x}_{n}`, 0.572, 0.442, 0.971], [String.raw`\overparen{x}^{n}`, 0.572, 1.243, 0.011], [String.raw`x+\underparen{y}+z`, 3.694, 0.583, 0.502],
    [String.raw`\overrightarrow{i}`, 0.345, 0.922, 0.011], [String.raw`\overleftrightarrow{AB}`, 1.509, 0.977, 0], [String.raw`\underleftarrow{AB}`, 1.509, 0.716, 0.281],
    [String.raw`\overrightarrow{x+y+z+w+v+u}`, 9.484, 0.844, 0.205]]) {
    const b = layout(tex);
    near(b.w, w, tex + ' width', 0.002);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
});
cell('F19', 'a bar, or an accent over more than one character, carries its scripts as a box', () => {
  for (const [tex, w, h, d] of [[String.raw`\overline{AB}^2`, 1.963, 1.131, 0], [String.raw`\overline{A}^2`, 1.204, 1.131, 0], [String.raw`\underline{x}_2`, 1.026, 0.442, 0.411],
    [String.raw`\hat{AB}^2`, 1.963, 1.215, 0], [String.raw`\widehat{AB}^2`, 1.963, 1.229, 0], [String.raw`\hat{A}^2`, 1.204, 1.000, 0], [String.raw`\tilde{x}_2^2`, 1.026, 0.828, 0.262]]) {
    const b = layout(tex);
    near(b.w, w, tex + ' width', 0.002);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
});
cell('F20', 'a display generalized fraction fences at LuaTeX\'s 24 pt delimiter size', () => {
  for (const [tex, w, h, d] of [[String.raw`\binom{n}{k}`, 2.350, 1.745, 1.245], [String.raw`\dbinom{n}{k}`, 2.350, 1.745, 1.245], [String.raw`{a \atopwithdelims() b}`, 2.279, 1.745, 1.245], [String.raw`\genfrac[]{1pt}{}{a}{b}`, 1.585, 1.450, 0.950]]) {
    const b = layout(tex, true);
    near(b.w, w, tex + ' width', 0.002);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
});
cell('F21', 'a \\middle is spaced as TeX\'s closing atom; a binary atom after it is ordinary', () => {
  for (const [tex, w] of [[String.raw`\left(a\middle|b\right)`, 2.014], [String.raw`\left(a+\middle|+b\right)`, 3.570], [String.raw`\left(a=\middle|b\right)`, 3.070], [String.raw`\left(a\middle|=b\right)`, 3.348],
    [String.raw`\left(\sum\middle|b\right)`, 2.541], [String.raw`\left(a\middle|\sum\right)`, 2.808], [String.raw`\left(a,\middle|,b\right)`, 2.903], [String.raw`\left(a\middle\|b\right)`, 2.134]])
    near(layout(tex).w, w, tex + ' width', 0.002);
});
cell('F22', 'an array keeps \\arraycolsep outside its edge columns; rules and \\hline take TeX\'s room', () => {
  for (const [tex, w, h, d] of [[String.raw`\begin{array}{c}a\\c\end{array}`, 1.529, 1.450, 0.950], [String.raw`\begin{array}{@{}cc}a&b\end{array}`, 2.458, 0.850, 0.350],
    [String.raw`\begin{array}{c@{,}c}a&b\end{array}`, 2.236, 0.850, 0.350], [String.raw`\begin{array}{||c||}a\end{array}`, 1.929, 0.850, 0.350], [String.raw`\begin{array}{c||c}a&b\end{array}`, 3.158, 0.850, 0.350],
    [String.raw`\begin{array}{|c|c|}\hline a&b\\\hline\end{array}`, 2.958, 0.890, 0.390], [String.raw`\begin{array}{c}\hline\hline a\\\hline b\end{array}`, 1.529, 1.590, 1.090],
    [String.raw`\begin{matrix}a&b\end{matrix}`, 1.958, 0.850, 0.350]]) {
    const b = layout(tex);
    near(b.w, w, tex + ' width', 0.002);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
  const rules = [...layout(String.raw`\begin{array}{|c|}a\end{array}`).svg.matchAll(/translate\(([-\d.]+) [-\d.]+\)"><path data-math-line="vertical"/g)].map(m => +m[1]);
  assert.deepEqual(rules, [0, 1.529], String.raw`\begin{array}{|c|} rules sit at its edges`);
});
cell('F23', 'right-to-left words in text read from the right, in the order Chromium\'s bidi draws them', () => {
  const svg = tex => layout(tex).svg, word = w => (svg(String.raw`\text{` + w + '}').match(/<text[^>]*>[^<]*<\/text>|d="[^"]*"/) || [''])[0];
  for (const [text, order] of [['שלום עולם', 'עולם|שלום'], ['مرحبا بالعالم 2024', '2024|بالعالم|مرحبا'], ['if שלום עולם, then', 'if|עולם|שלום|,|then'],
    ['abc שלום 12 עולם def', 'abc|עולם|12|שלום|def'], ['שלום: 3.14 עולם!', 'עולם|3.14|:|שלום|!']]) {
    const full = svg(String.raw`\text{` + text + '}'), drawn = order.split('|').map(w => full.indexOf(word(w)));
    assert(drawn.every((at, i) => at >= 0 && (i === 0 || at > drawn[i - 1])), text + ' is drawn as ' + order);
  }
});
cell('F24', 'a bold or italic accented letter is the styled letter with its mark', () => {
  for (const [tex, letter, mark] of [[String.raw`\textbf{Théorème}`, 0x1d41e, 0x301], [String.raw`\mathbf{é}`, 0x1d41e, 0x301], [String.raw`\textit{né}`, 0x1d452, 0x301], [String.raw`\textbf{ü}`, 0x1d42e, 0x308], [String.raw`\mathit{ö}`, 0x1d45c, 0x308]]) {
    const ids = glyphs(layout(tex).svg).map(item => item.id);
    assert(ids.includes(MATH_FONT.chars[letter]) && ids.includes(MATH_FONT.chars[mark]), tex + ' draws the styled letter and its mark');
    assert(!ids.includes(MATH_FONT.chars[tex.at(-2).codePointAt(0)]), tex + ' draws no regular accented letter');
  }
  const ids = glyphs(layout(String.raw`\textbf{ï}`).svg).map(item => item.id);
  assert(ids.includes(MATH_FONT.dotless[MATH_FONT.chars[0x1d422]]), String.raw`\textbf{ï} is a bold dotless i`);
});
cell('F25', 'braket.sty: \\| divides a \\Braket; \\Set has medium space inside its braces', () => {
  for (const [tex, w] of [[String.raw`\Braket{a\|b}`, 2.467], [String.raw`\Braket{a\|\frac{a}{b}\|b}`, 3.863], [String.raw`\Braket{a||b}`, 2.467], [String.raw`\Set{x|x>0}`, 5.256], [String.raw`\Set{x\|y}`, 3.460], [String.raw`\Set{x}`, 2.016]])
    near(layout(tex).w, w, tex + ' width', 0.002);
});
cell('F26', 'xcolor mixes as xcolor computes them; \\mathcolor', () => {
  for (const [tex, color] of [[String.raw`\textcolor{red!50}{x}`, '#ff8080'], [String.raw`\color{blue!20}x`, '#ccccff'], [String.raw`\textcolor{red!50!green!50}{x}`, '#bfbf80'],
    [String.raw`\textcolor{Maroon!50}{x}`, '#d66780'], [String.raw`\textcolor{Maroon!40!red}{x}`, '#de0000'], [String.raw`\mathcolor{red}{x}`, 'red']])
    assert(mathml(tex).includes('color:' + color + ';'), tex + ' is ' + color + ': ' + mathml(tex).match(/color:[^;]*/)?.[0]);
});
cell('F27', 'siunitx: abbreviated units, \\degreeCelsius, a written solidus and ranges, as wide as siunitx sets them', () => {
  for (const [tex, w] of [[String.raw`\SIrange{1}{5}{\metre}`, 4.554], [String.raw`\numrange{1}{5}`, 2.555], [String.raw`\si{\km}`, 1.361], [String.raw`\si{\degreeCelsius}`, 1.097],
    [String.raw`\si{\metre/\second}`, 1.727], [String.raw`\SI{5}{\kHz}`, 2.389], [String.raw`\SI{3}{\uA}`, 1.973], [String.raw`\qtyrange{1}{5}{\km}`, 5.610]])
    near(layout(tex).w, w, tex + ' width', 0.002);
});
cell('F28', 'physics.sty matrices: \\mqty(…) brackets, \\dmat, \\admat, \\imat, \\zmat, \\xmat, \\pmat, \\Pmqty, \\Bmqty', () => {
  for (const [tex, w, h, d] of [[String.raw`\mqty(a&b\\c&d)`, 3.521, 1.450, 0.950], [String.raw`\mqty[a&b]`, 2.638, 0.850, 0.350], [String.raw`\mqty(\dmat{1,2,3})`, 5.250, 2.065, 1.565],
    [String.raw`\mqty(\admat{1,2})`, 3.472, 1.460, 0.960], [String.raw`\mqty(\imat{3})`, 5.250, 2.050, 1.550], [String.raw`\mqty(\zmat{2}{3})`, 4.972, 1.450, 0.950],
    [String.raw`\mqty(\xmat*{x}{2}{2})`, 5.321, 1.450, 0.950], [String.raw`\mqty(\xmat*{a}{3}{1})`, 2.733, 2.050, 1.550], [String.raw`\mqty(\pmat{y})`, 4.095, 1.450, 0.950], [String.raw`\Pmqty{a&b}`, 2.568, 0.850, 0.350]]) {
    const b = layout(tex);
    near(b.w, w, tex + ' width', 0.002);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
  assert(!mathPrepare(String.raw`\Bmqty{a&b\\c&d}`).error, String.raw`\Bmqty is a braced matrix`);
});
cell('F29', 'mhchem: (^) and (v), the addition dot, coefficients and 1/2 as mhchem sets them; <-->', () => {
  for (const [tex, w, h, d] of [[String.raw`\ce{CO2 (^)}`, 2.788, 0.705, 0.247], [String.raw`\ce{BaSO4 (v)}`, 3.830, 0.705, 0.247], [String.raw`\ce{CuSO4.5H2O}`, 6.327, 0.705, 0.247],
    [String.raw`\ce{CuSO4*5H2O}`, 6.327, 0.705, 0.247], [String.raw`\ce{1/2 H2O}`, 2.787, 0.859, 0.345], [String.raw`\ce{5H2O}`, 2.649, 0.705, 0.247], [String.raw`\ce{0.5 H2O}`, 3.427, 0.705, 0.247]]) {
    const b = layout(tex);
    near(b.w, w, tex + ' width', 0.002);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
  assert(mathml(String.raw`\ce{A <--> B}`).includes('⇄'), String.raw`\ce{A <--> B} is mhchem's two-way arrow`);
});
cell('F30', 'array : columns are dashed rules (arydshln); \\buildrel top \\over relation', () => {
  for (const [tex, w] of [[String.raw`\begin{array}{c:c}a&b\end{array}`, 2.958], [String.raw`\begin{array}{*{2}{c:}c}a&b&c\end{array}`, 4.391], [String.raw`a\buildrel \alpha \over \longrightarrow b`, 2.977]])
    near(layout(tex).w, w, tex + ' width', 0.002);
  assert(/data-math-line="vertical"[^>]*stroke-dasharray/.test(layout(String.raw`\begin{array}{c:c}a&b\end{array}`).svg), 'the : rule is dashed');
  assert(!/stroke-dasharray/.test(layout(String.raw`\begin{array}{c|c}a&b\end{array}`).svg), 'the | rule is solid');
  assert.equal(layout(String.raw`a\buildrel \alpha \over \longrightarrow b`).svg, layout(String.raw`a\stackrel{\alpha}{\longrightarrow} b`).svg, String.raw`\buildrel is \stackrel`);
});
cell('F31', 'a braced group is one ordinary atom, as TeX makes every {…}', () => {
  for (const [tex, w, display] of [['a{=}b', 1.736], [String.raw`a{\sum}b`, 2.014], ['a{,}b', 1.236], ['{=}a', 1.307], [String.raw`a{\left(b\right)}c`, 2.169], ['x{+}y', 1.840], [String.raw`{\sum}_a^b`, 1.934, true]])
    near(layout(tex, display).w, w, tex + ' width', 0.002);
  near(layout(String.raw`{\sum}_a^b`, true).h, 1.186, String.raw`{\sum}_a^b scripts sit beside it`, 0.002);
  assert(/<mrow><mo[^>]*rspace="0em" lspace="0em">=<\/mo><\/mrow>/.test(mathml('a{=}b')), 'MathML: a{=}b has no relation spaces');
  assert(/<msubsup><mrow><mo[^>]*movablelimits="false"/.test(mathml(String.raw`{\sum}_a^b`)), String.raw`MathML: {\sum}_a^b keeps its scripts beside it`);
});
cell('F32', 'a letter\'s italic correction is kept only before another character, as LuaTeX keeps it', () => {
  for (const [tex, w] of [['fx', 1.152], ['f{x}', 1.152], [String.raw`f\mathbb{R}`, 1.219], ['f+x', 2.374], [String.raw`f\hat{x}`, 1.062], [String.raw`f\;x`, 1.340], [String.raw`f\frac12`, 1.128],
    [String.raw`f\sqrt{x}`, 1.895], [String.raw`V\left(x\right)`, 2.100], [String.raw`f\sin`, 1.885], ['f{xy}', 1.552], [String.raw`f\mathbf{x}`, 1.097], [String.raw`f\color{red}x`, 1.062],
    [String.raw`\color{red}a+b+c=1+2+3`, 9.153], [String.raw`\SI{9.81}{m.s^{-2}}`, 4.337], [String.raw`\set{x|y}`, 3.229], [String.raw`\Braket{a\|b|c}`, 3.512]])
    near(layout(tex).w, w, tex + ' width', 0.002);
});
cell('F33', 'amsmath\'s \\colon is 2 mu and 6 mu around the colon', () => {
  for (const [tex, w] of [[String.raw`\colon`, 0.722], [String.raw`a\colon b`, 1.680], [String.raw`f\colon A\to B`, 4.277]])
    near(layout(tex).w, w, tex + ' width', 0.002);
  assert(/<mspace width="0.111111em"><\/mspace><mo[^>]*rspace="0em" lspace="0em">:<\/mo><mspace width="0.333333em">/.test(mathml(String.raw`f\colon A\to B`)), String.raw`MathML: \colon carries its own spaces`);
});
cell('F34', 'a word space in text is Latin Modern Roman\'s 1/3 em, and a run of spaces is one; \\limsup has a thin space; \\operatorname ignores spaces', () => {
  for (const [tex, w] of [[String.raw`\text{a b}`, 1.389], [String.raw`\text{a  b}`, 1.389], [String.raw`\text{if }`, 0.917], [String.raw`\limsup`, 3.062], [String.raw`\liminf`, 2.696],
    [String.raw`\limsup_{n\to\infty}x_n`, 6.398], [String.raw`\sin x+\operatorname{arg max}_{x}f(x)`, 9.048], [String.raw`\operatorname{arg\ max}`, 3.586]])
    near(layout(tex).w, w, tex + ' width', 0.002);
});
cell('F35', 'mhchem arrows are 2 em with their spaces inside, a count and then a charge follow the formula; an extensible arrow is its label plus 14 mu', () => {
  for (const [tex, w, h, d] of [[String.raw`\ce{A <=> B}`, 4.014, 0.716, 0.100], [String.raw`\ce{->}`, 2.556, 0.510, 0.010], [String.raw`\ce{->[xxxxx]}`, 3.200, 1.012, 0.010], [String.raw`\ce{<->[xxxxx]}`, 3.356, 1.012, 0.010],
    [String.raw`\ce{A ->[{long label here}] B}`, 7.602, 1.339, 0.010], [String.raw`\ce{SO4^2-}`, 2.787, 0.898, 0.247], [String.raw`\ce{NH4+}`, 2.555, 0.841, 0.247], [String.raw`\ce{[Cu(NH3)4]^2+}`, 6.019, 0.898, 0.261],
    [String.raw`\ce{Fe2(SO4)3}`, 4.572, 0.748, 0.261], [String.raw`\ce{SO4^2- + Ba^2+ -> BaSO4 v}`, 12.602, 0.898, 0.247],
    [String.raw`\xrightarrow{xxxxx}`, 2.812, 1.026, 0.010], [String.raw`\xrightarrow{\frac{a}{b}}`, 1.171, 1.454, 0.010], [String.raw`\xrightarrow{}`, 1.000, 0.510, 0.010]]) {
    const b = layout(tex);
    near(b.w, w, tex + ' width', 0.002);
    near(b.h, h, tex + ' height', 0.003);
    near(b.d, d, tex + ' depth', 0.003);
  }
});
cell('F36', '\\big to \\Bigg take TeX\'s delimiter factor around amsmath\'s strut; \\left and \\right are sized from the body, not the grown \\middle', () => {
  for (const [tex, w, h, d] of [[String.raw`\big(`, 0.422, 0.848, 0.348], [String.raw`\Big(`, 0.597, 1.146, 0.646], [String.raw`\big\{`, 0.540, 0.848, 0.348], [String.raw`\Big/`, 0.768, 1.146, 0.646],
    [String.raw`\left(\frac{a}{b}\middle/c\right)`, 2.568, 0.905, 0.405], [String.raw`\left(\frac{a}{b}\middle|c\right)`, 2.229, 0.851, 0.352]]) {
    const b = layout(tex);
    near(b.w, w, tex + ' width', 0.002);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
});
cell('F37', '\\stackrel, \\buildrel, \\overset and \\underset take TeX\'s limit gaps', () => {
  for (const [tex, h, d] of [[String.raw`\stackrel{a}{=}`, 0.883, 0], [String.raw`\buildrel a \over =`, 0.883, 0], [String.raw`\stackrel{x}{\to}`, 1.026, 0.010], [String.raw`\underset{a}{=}`, 0.367, 0.607],
    [String.raw`\overset{\frac{a}{b}}{x}`, 1.386, 0.011], [String.raw`\overunderset{a}{b}{=}`, 0.883, 0.660]]) {
    const b = layout(tex);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
});
cell('F38', 'amsmath\'s \\varinjlim, \\varprojlim and \\varliminf; \\injlim and \\projlim are words', () => {
  for (const [tex, w, h, d] of [[String.raw`\varinjlim`, 1.389, 0.694, 0.570], [String.raw`\varinjlim_n`, 1.939, 0.694, 0.777], [String.raw`\varprojlim_n`, 1.939, 0.694, 0.777], [String.raw`\varliminf_n`, 1.939, 0.694, 0.427],
    [String.raw`\injlim_n`, 3.246, 0.694, 0.412], [String.raw`\projlim`, 3.310, 0.694, 0.205]]) {
    const b = layout(tex);
    near(b.w, w, tex + ' width', 0.002);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
});
cell('F39', 'subarray and smallmatrix rows sit as amsmath spaces them; an array is an ordinary atom', () => {
  for (const [tex, w, h, d] of [[String.raw`\begin{subarray}{c}a\\b\end{subarray}`, 0.434, 0.696, 0.196], [String.raw`\begin{subarray}{c}x\end{subarray}`, 0.454, 0.408, 0], [String.raw`\begin{subarray}{c}x\\x\\x\end{subarray}`, 0.454, 0.960, 0.460],
    [String.raw`\begin{smallmatrix}a&b\\c&d\end{smallmatrix}`, 1.462, 0.818, 0.318], [String.raw`\begin{psmallmatrix}a&b\\c&d\end{psmallmatrix}`, 2.306, 0.818, 0.318],
    [String.raw`a\begin{matrix}x\end{matrix}b`, 1.530, 0.850, 0.350], [String.raw`a\begin{aligned}x\end{aligned}b`, 1.530, 0.850, 0.350]]) {
    const b = layout(tex);
    near(b.w, w, tex + ' width', 0.002);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
});
cell('F40', '\\multicolumn and \\hdotsfor span columns as TeX spans them; \\intertext is a line between alignment rows; \\enclose draws its notations', () => {
  for (const [tex, w, h, d] of [[String.raw`\begin{array}{ccc}a&b&c\\\multicolumn{3}{c}{xyz}\end{array}`, 4.391, 1.450, 0.950], [String.raw`\begin{array}{ccc}a&b&c\\\multicolumn{2}{l}{xxxxxxxxxx}&d\end{array}`, 8.240, 1.450, 0.950],
    [String.raw`\begin{pmatrix}a&b&c\\\hdotsfor{3}\\d&e&f\end{pmatrix}`, 5.235, 2.050, 1.550], [String.raw`\begin{pmatrix}a&b&c&d\\x&\hdotsfor{2}&y\end{pmatrix}`, 6.426, 1.450, 0.950]]) {
    const b = layout(tex);
    near(b.w, w, tex + ' width', 0.002);
    near(b.h, h, tex + ' height', 0.002);
    near(b.d, d, tex + ' depth', 0.002);
  }
  // The rule between a and b stops at the merged row; the span draws its own | rules.
  const merged = layout(String.raw`\begin{array}{|c|c|}a&b\\\multicolumn{2}{|c|}{xyz}\end{array}`), rules = [...merged.svg.matchAll(/translate\(([-\d.]+) [-\d.]+\)"><path data-math-line="vertical" d="M0 0v([\d.]+)/g)].map(m => [+m[1], +m[2]]);
  assert(rules.some(([x, length]) => x > 0.5 && x < merged.w - 0.5 && length < (merged.h + merged.d) * 0.6), String.raw`\multicolumn breaks the rule it spans: ` + JSON.stringify(rules));
  const dots = glyphs(layout(String.raw`\begin{pmatrix}a&b&c\\\hdotsfor{3}\end{pmatrix}`).svg).filter(item => item.id === MATH_FONT.chars[0x2e]).length;
  assert(dots >= 6, String.raw`\hdotsfor{3} fills its columns with dots: ` + dots);
  const inter = layout(String.raw`\begin{align}a&=b\\\intertext{and so}c&=dddd\end{align}`);
  assert(inter.h + inter.d > layout(String.raw`\begin{align}a&=b\\c&=dddd\end{align}`).h + 1.5, String.raw`\intertext adds a line with display skips`);
  assert(/<mtd columnspan="2" style="text-align:left"><mrow><mrow><mrow><mtext>and.so/.test(mathml(String.raw`\begin{align}a&=b\\\intertext{and so}c&=d\end{align}`)), String.raw`MathML: \intertext spans the row`);
  for (const notation of ['box', 'roundedbox', 'circle', 'left', 'right', 'top', 'bottom', 'horizontalstrike', 'verticalstrike', 'updiagonalstrike', 'downdiagonalstrike', 'updiagonalarrow', 'longdiv', 'actuarial', 'madruwb', 'radical', 'phasorangle']) {
    const b = layout(String.raw`\enclose{` + notation + '}{x}');
    assert(/stroke="currentColor"/.test(b.svg) || notation === 'radical', notation + ' draws a line');
    assert(mathml(String.raw`\enclose{` + notation + '}{x}').includes('<menclose notation="' + notation + '"'), notation + ' is a MathML enclosure');
  }
  near(layout(String.raw`\enclose{box}{x}`).w, 0.972, String.raw`\enclose{box}{x} is padded 0.2 em`, 0.002);
  assert.equal(mathPrepare(String.raw`\enclose{star}{x}`).error?.code, 'unsupported-notation', 'an unknown notation is refused');
  assert.equal(mathPrepare(String.raw`a\intertext{x}`).error?.code, 'misplaced-alignment', String.raw`\intertext outside an alignment is refused`);
});
cell('F41', 'bold and italic letters without a styled code point are drawn bold or slanted; text styles combine as LaTeX\'s', () => {
  for (const ch of ['ç', 'ø', 'ß', 'æ', 'Ø', 'þ']) {
    const plain = layout(String.raw`\text{` + ch + '}'), bold = layout(String.raw`\textbf{` + ch + '}'), italic = layout(String.raw`\textit{` + ch + '}');
    assert(bold.w > plain.w && bold.svg !== plain.svg, ch + ' is bold in \\textbf');
    assert(/skewX/.test(italic.svg) || italic.svg !== plain.svg, ch + ' is slanted in \\textit');
  }
  assert(glyphs(layout(String.raw`\textbf{ç}`).svg).some(item => item.id === MATH_FONT.chars[0x1d41c]), String.raw`\textbf{ç} is a bold c with its cedilla`);
  assert(/font-weight:700;font-style:italic;">x</.test(mathml(String.raw`\textbf{\textit{x}}`)), String.raw`MathML: \textbf{\textit{x}} is bold italic`);
  assert(glyphs(layout(String.raw`\textbf{\textit{x}}`).svg).some(item => item.id === MATH_FONT.chars[0x1d499]), String.raw`\textbf{\textit{x}} draws a bold italic x`);
  assert(/>b<\/mtext>/.test(mathml(String.raw`\emph{a \emph{b}}`)) && !/font-style:italic;">b/.test(mathml(String.raw`\emph{a \emph{b}}`)), String.raw`\emph inside \emph is upright`);
});

// Round-four references: LuaTeX 1.17.0, Latin Modern Math 1.959, mathtools, unicode-math,
// then amscd (loading amscd first lets unicode-math disable its math-active @). Values are ems.
cell('F42', '\\ldots and \\cdots use the font ellipses, with their own advances', () => {
  for (const [tex, cp, w, h] of [[String.raw`\ldots`, 0x2026, 0.837, 0.106], [String.raw`\cdots`, 0x22ef, 0.776, 0.303]]) {
    const b = layout(tex, true);
    near(b.w, w, tex + ' width', 0.001);
    near(b.h, h, tex + ' height', 0.001);
    assert.deepEqual(glyphs(b.svg).map(g => g.id), [MATH_FONT.chars[cp]], tex + ' draws one font ellipsis');
  }
});
cell('F43', 'mathtools double arrows retain control-space labels and their ten-mu width pad', () => {
  for (const [tex, w, h, d] of [[String.raw`\xRightarrow{}`, 1.000241, 0.720, 0.620], [String.raw`\xRightarrow{x}`, 1.175485, 1.035701, 0.620],
    [String.raw`\xRightarrow{xxxxx}`, 2.989883, 1.035701, 0.620], [String.raw`\xRightarrow[xxxxx]{yyyyy}`, 2.989883, 1.1715, 0.627]]) {
    const b = layout(tex, true);
    near(b.w, w, tex + ' width', 0.002); near(b.h, h, tex + ' height', 0.002); near(b.d, d, tex + ' depth', 0.002);
  }
  const x = glyphs(layout(String.raw`\xRightarrow{x}`, true).svg).at(-1);
  near(x.x, 0.194442, String.raw`\xRightarrow{x} label origin`, 0.002);
});
cell('F44', '\\xmapsto uses arrow-fill label padding and lower-limit depth', () => {
  // mathtools documents that its legacy mapstochar slot is broken with unicode-math (it draws a 7).
  // This TeX control restores only that stem: DeclareSymbolFont{referencestem}{OMS}{cmsy}{m}{n},
  // let\mapstochar\relax, DeclareMathSymbol{\mapstochar}{\mathrel}{referencestem}{"37}.
  for (const [tex, w, h, d] of [[String.raw`\xmapsto{x}`, 1.000241, 1.025702, 0.010], [String.raw`\xmapsto{xxxxx}`, 2.812437, 1.025702, 0.010],
    [String.raw`\xmapsto[xxxxx]{yyyyy}`, 2.812437, 1.1615, 0.617001]]) {
    const b = layout(tex, true);
    near(b.w, w, tex + ' width', 0.002); near(b.h, h, tex + ' height', 0.002); near(b.d, d, tex + ' depth', 0.002);
  }
  near(glyphs(layout(String.raw`\xmapsto{x}`, true).svg).at(-1).x, 0.214987, String.raw`\xmapsto{x} label origin`, 0.002);
});
cell('F45', '\\xhookrightarrow joins the small math-italic hook to the shaft with three mu', () => {
  for (const [tex, w, h, d] of [[String.raw`\xhookrightarrow{}`, 1.111357, 0.510, 0.010], [String.raw`\xhookrightarrow{x}`, 1.111357, 1.025702, 0.010],
    [String.raw`\xhookrightarrow{xxxxx}`, 2.812437, 1.025702, 0.010], [String.raw`\xhookrightarrow[xxxxx]{yyyyy}`, 2.812437, 1.1615, 0.617001]]) {
    const b = layout(tex, true);
    near(b.w, w, tex + ' width', 0.002); near(b.h, h, tex + ' height', 0.002); near(b.d, d, tex + ' depth', 0.002);
    assert(glyphs(b.svg).some(g => g.id === MATH_FONT.arrowHook), tex + ' retains the original small hook outline');
  }
  near(glyphs(layout(String.raw`\xhookrightarrow{x}`, true).svg).at(-1).x, 0.387211, String.raw`\xhookrightarrow{x} label origin`, 0.002);
});
cell('F46', 'paired extensible harpoons retain both shifted arrows and opposite phantom labels', () => {
  for (const [tex, w, h, d] of [[String.raw`\xrightleftharpoons{}`, 1.000241, 0.59782, 0.50518], [String.raw`\xrightleftharpoons{x}`, 1.000241, 1.113521, 0.50518],
    [String.raw`\xrightleftharpoons{xxxxx}`, 2.812437, 1.113521, 0.50518], [String.raw`\xrightleftharpoons[xxxxx]{yyyyy}`, 2.812437, 1.24932, 0.70482]]) {
    const b = layout(tex, true);
    near(b.w, w, tex + ' width', 0.002); near(b.h, h, tex + ' height', 0.002); near(b.d, d, tex + ' depth', 0.002);
  }
});
cell('F47', 'amscd keeps object rows two em apart and spaces horizontal arrow cells by half an em', () => {
  for (const [tex, w, h, d] of [[String.raw`\begin{CD}A\end{CD}`, 0.750, 0.608, 0.108], [String.raw`\begin{CD}A @>>> B\end{CD}`, 5.509, 0.613, 0.113],
    [String.raw`\begin{CD}A @>f>> B\end{CD}`, 5.509, 0.9278, 0.4278], [String.raw`\begin{CD}A @>fffff>ggggg> B\end{CD}`, 5.509, 1.2992, 0.7992],
    [String.raw`\begin{CD}A\\@VfVgV\\B\end{CD}`, 0.759, 2.608, 2.108], [String.raw`\begin{CD}A @>f>> B\\@VgVV @VVhV\\C @>>k> D\end{CD}`, 5.578, 3.257701, 2.7577],
    [String.raw`\begin{CD}AAAA @>fffffff>> B\\@VggggggggVV @VVhhhhhV\\C @>>kkkkk> DDDD\end{CD}`, 10.951624, 3.257701, 2.7577],
    [String.raw`\begin{CD}A @= B\\@| @|\\C @= D\end{CD}`, 5.578, 2.619, 2.119]]) {
    const b = layout(tex, true);
    near(b.w, w, tex + ' width', 0.002); near(b.h, h, tex + ' height', 0.002); near(b.d, d, tex + ' depth', 0.002);
  }
});
cell('F48', 'an under-accent uses the slanted base\'s font attachment', () => {
  const tex = String.raw`\underleftarrow{f}`, b = layout(tex, true), mark = glyphs(b.svg).find(g => g.id === MATH_FONT.chars[0x20ee]);
  assert(mark, tex + ' draws the font bottom accent');
  near(mark.x, 0.728, tex + ' raw mark origin', 0.002);
  near(b.d, 0.486, tex + ' depth', 0.002);
});
cell('F49', 'mhchem lower arrow labels are raised to their common top before limit spacing', () => {
  for (const [tex, w, h, d] of [[String.raw`\ce{->[x]}`, 2.555542, 1.0117, 0.010], [String.raw`\ce{->[][x]}`, 2.555542, 0.510, 0.610],
    [String.raw`\ce{->[x][x]}`, 2.555542, 1.0117, 0.610], [String.raw`\ce{->[][Hg]}`, 2.555542, 0.510, 0.692851],
    [String.raw`\ce{->[][{long label here}]}`, 6.143947, 0.510, 0.700551]]) {
    const b = layout(tex, true);
    near(b.w, w, tex + ' width', 0.002); near(b.h, h, tex + ' height', 0.002); near(b.d, d, tex + ' depth', 0.002);
  }
  near(glyphs(layout(String.raw`\ce{->[][x]}`, true).svg).at(-1).y, 0.37295, 'mhchem lower x baseline', 0.002);
});
cell('F50', 'mhchem gives a lowercase state its two-tenths-ex gap without changing formula groups', () => {
  for (const [tex, w] of [[String.raw`\ce{H2O(l)}`, 3.124498], [String.raw`\ce{H2O (l)}`, 3.29116], [String.raw`\ce{H2O(aq)}`, 3.874498]]) {
    const b = layout(tex, true);
    near(b.w, w, tex + ' width', 0.002); near(b.h, 0.748, tex + ' height', 0.002); near(b.d, 0.248, tex + ' depth', 0.002);
  }
  near(layout(String.raw`\ce{Fe2(SO4)3}`, true).w, 4.572, 'uppercase chemical group control', 0.002);
});
cell('F51', 'mhchem scripts distinguish an explicit variable from words and oxidation numerals', () => {
  for (const [tex, w, h] of [[String.raw`\ce{A^{x}}`, 1.2596, 0.7417], [String.raw`\ce{A^x}`, 1.2596, 0.7417], [String.raw`\ce{A^{$x$}}`, 1.2596, 0.7417],
    [String.raw`\ce{A^{foo}}`, 1.8504, 0.9258], [String.raw`\ce{A^{IV}}`, 1.6852, 0.911101]]) {
    const b = layout(tex, true);
    near(b.w, w, tex + ' width', 0.002); near(b.h, h, tex + ' height', 0.002); near(b.d, 0, tex + ' depth', 0.002);
  }
});
cell('F52', 'monospace sharp s uses the original Latin Modern Mono outline and advance', () => {
  for (const tex of [String.raw`\mathtt{ß}`, String.raw`\texttt{ß}`]) {
    const b = layout(tex, true), ids = glyphs(b.svg).map(g => g.id);
    near(b.w, 0.525, tex + ' width', 0.001); near(b.h, 0.617, tex + ' height', 0.001); near(b.d, 0.006, tex + ' depth', 0.001);
    assert.deepEqual(ids, [MATH_FONT.styledGlyphs.monospace[0xdf]], tex + ' draws the Mono glyph');
    assert(!ids.includes(MATH_FONT.chars[0xdf]) && !b.svg.includes('<text'), tex + ' stays self-contained');
  }
});
// F53 onward: LuaTeX 1.17.0, 10pt article, mathtools + unicode-math, \setmathfont{latinmodern-math.otf}.
// Measure \setbox0=\hbox{$<formula>$}: tex.box[0].width/height/depth divided by 655360 sp per em.
// Display cases prefix \displaystyle\csname @displaytrue\endcsname. No fontspec main/mono override.
// Glyph origins come from traversing the resulting h/v lists, including shifts, kerns and set glue.
const texBoxes = cases => {
  for (const [tex, w, h, d, display = false] of cases) {
    const b = layout(tex, display);
    for (const [key, value] of Object.entries({w, h, d})) near(b[key], value, tex + ' ' + key, 0.002);
  }
};

cell('F53', "a horizontal accent tests glyph advance and keeps the combining under-arrow", () => {
  texBoxes([
    [String.raw`\underleftarrow{x}`, 0.572, 0.442, 0.292],
    [String.raw`\underrightarrow{x}`, 0.572, 0.442, 0.292]
  ]);
  for (const [tex, cp] of [[String.raw`\underleftarrow{x}`, 0x20ee], [String.raw`\underrightarrow{x}`, 0x20ef]]) {
    const items = glyphs(layout(tex).svg), mark = items.find(g => g.id === MATH_FONT.chars[cp]);
    assert.equal(items.length, 2, tex + ' is a base and a single accent');
    assert(mark, tex + ' uses the combining accent');
    near(mark.x, 0.592999, tex + ' mark origin', 0.002);
  }
});

cell('F54', "the widest designed accent remains unscaled", () => {
  texBoxes([
    [String.raw`\widehat{ABCD}`, 3.149998, 1.015001, 0.022],
    [String.raw`\widetilde{ABCD}`, 3.149998, 1.039, 0.022]
  ]);
  const hat = glyphs(layout(String.raw`\widehat{ABCD}`).svg).find(g => g.id === 2294);
  assert(hat, 'Latin Modern Math gid 2340 (compressed 2294) is the widest hat');
  near(hat.x, 0.626999, 'wide hat origin', 0.002);
  near(hat.sx, 0.001, 'wide hat horizontal scale', 0.00000001);
  near(hat.sy, 0.001, 'wide hat vertical scale', 0.00000001);
});

cell('F55', "amsmath fraction delimiters use their fixed style target and text-font box", () => {
  texBoxes([
    [String.raw`\binom{b}{p}`, 1.2563, 0.9298, 0.4808],
    [String.raw`\tbinom{b}{p}`, 1.2563, 0.9298, 0.4808],
    [String.raw`\genfrac[]{1pt}{2}{a}{b}`, 0.942999, 0.75, 0.327499],
    [String.raw`\genfrac[]{1pt}{3}{a}{b}`, 0.942999, 0.75, 0.377499],
    [String.raw`\binom{b}{p}`, 2.253, 1.745, 1.245, true],
    [String.raw`\genfrac(){2pt}{0}{a}{b}`, 2.278999, 1.745, 1.245],
    [String.raw`\genfrac(){2pt}{1}{a}{b}`, 1.278, 0.865701, 0.542801],
    [String.raw`\genfrac(){2pt}{2}{a}{b}`, 1.164999, 0.748, 0.477499],
    [String.raw`\genfrac(){2pt}{3}{a}{b}`, 1.164999, 0.748, 0.527499]
  ]);
});

cell('F56', "an explicit fraction rule and its clearance retain point thickness in every math style", () => {
  texBoxes([
    [String.raw`\genfrac{}{}{0.4pt}{0}{a}{b}`, 0.768999, 1.119, 0.697],
    [String.raw`\genfrac{}{}{1pt}{0}{a}{b}`, 0.768999, 1.119, 0.805005],
    [String.raw`\genfrac{}{}{2pt}{0}{a}{b}`, 0.768999, 1.403008, 1.155008],
    [String.raw`\genfrac{}{}{4pt}{0}{a}{b}`, 0.768999, 2.103015, 1.855016],
    [String.raw`\genfrac{}{}{0.4pt}{1}{a}{b}`, 0.673999, 0.702701, 0.352],
    [String.raw`\genfrac{}{}{1pt}{1}{a}{b}`, 0.673999, 0.715701, 0.392801],
    [String.raw`\genfrac{}{}{2pt}{1}{a}{b}`, 0.673999, 0.865701, 0.542801],
    [String.raw`\genfrac{}{}{4pt}{1}{a}{b}`, 0.673999, 1.165701, 0.842801],
    [String.raw`\genfrac{}{}{0.4pt}{2}{a}{b}`, 0.626999, 0.4968, 0.246999],
    [String.raw`\genfrac{}{}{1pt}{2}{a}{b}`, 0.626999, 0.5515, 0.327499],
    [String.raw`\genfrac{}{}{2pt}{2}{a}{b}`, 0.626999, 0.7015, 0.477499],
    [String.raw`\genfrac{}{}{4pt}{2}{a}{b}`, 0.626999, 1.0015, 0.777499],
    [String.raw`\genfrac{}{}{0.4pt}{3}{a}{b}`, 0.626999, 0.418001, 0.287498],
    [String.raw`\genfrac{}{}{1pt}{3}{a}{b}`, 0.626999, 0.5015, 0.377499],
    [String.raw`\genfrac{}{}{2pt}{3}{a}{b}`, 0.626999, 0.6515, 0.527499],
    [String.raw`\genfrac{}{}{4pt}{3}{a}{b}`, 0.626999, 0.9515, 0.827499]
  ]);
});

cell('F57', "scripts use semantic height and depth for smash, vertical phantoms and struts", () => {
  texBoxes([
    [String.raw`x^{\smash{\dfrac{a}{b}}}`, 1.396999, 0.442, 0.011],
    [String.raw`x_{\smash{\dfrac{a}{b}}}`, 1.396999, 0.442, 0.247],
    [String.raw`x^{a\vphantom{\dfrac{a}{b}}}`, 1.062, 1.924001, 0.011],
    [String.raw`x_{a\vphantom{\dfrac{a}{b}}}`, 1.062, 0.442, 1.472],
    [String.raw`\smash{A}^2`, 1.2043, 0.8278, 0],
    [String.raw`x^{\mathstrut}`, 0.628, 0.8866, 0.011],
    [String.raw`x_{\mathstrut}`, 0.628, 0.442, 0.420599]
  ]);
});

cell('F58', "a radical degree has an uncramped scriptscript box and a depth-independent origin", () => {
  texBoxes([
    [String.raw`\sqrt[i]{x}`, 1.405, 0.800499, 0.2395],
    [String.raw`\sqrt[l]{x}`, 1.405, 0.800499, 0.2395],
    [String.raw`\sqrt[3]{x}`, 1.4675, 0.800499, 0.2395],
    [String.raw`\sqrt{\sqrt[n^2]{x}}`, 2.936, 1.30275, 0.53725],
    [String.raw`\sqrt[\smash{3}]{x}`, 1.4675, 0.800499, 0.2395]
  ]);
  for (const tex of [String.raw`\sqrt[i]{x}`, String.raw`\sqrt[l]{x}`, String.raw`\sqrt[3]{x}`]) {
    const degree = glyphs(layout(tex).svg).find(g => Math.abs(g.sx - 0.0005) < 1e-8);
    assert(degree, tex + ' has a scriptscript degree');
    near(degree.x, 0.278, tex + ' degree x', 0.002);
    near(degree.y, -0.3605, tex + ' degree baseline', 0.002);
  }
  const degreeScript = glyphs(layout(String.raw`\sqrt{\sqrt[n^2]{x}}`).svg).filter(g => Math.abs(g.sx - 0.0005) < 1e-8)[1];
  near(degreeScript.y, -0.542, 'nested radical degree superscript baseline', 0.002);
});

cell('F59', "inline and display operators center their TeX boxes on the axis while retaining exact ink", () => {
  texBoxes([
    [String.raw`\bigcup`, 0.833, 0.761, 0.261],
    [String.raw`\bigcap`, 0.833, 0.761, 0.261],
    [String.raw`\bigcup`, 1.111, 0.928, 0.428, true],
    [String.raw`\bigtimes`, 1.092, 0.742999, 0.242999],
    [String.raw`\bigtimes`, 1.371001, 0.883, 0.383, true],
    [String.raw`\bigvee`, 0.833, 0.783, 0.283],
    [String.raw`\bigvee`, 1.111, 0.958499, 0.458501, true],
    [String.raw`\bigwedge`, 0.833, 0.783, 0.283],
    [String.raw`\bigwedge`, 1.111, 0.958499, 0.458501, true]
  ]);
});

cell('F60', "exclamation is a closing atom; a question mark retains its ordinary-atom spacing", () => {
  texBoxes([
    [String.raw`\left(n+1\right)!`, 3.378433, 0.748, 0.248],
    [String.raw`a?b`, 1.429999, 0.705, 0.011],
    [String.raw`\left(n+1\right)?`, 3.739096, 0.748, 0.248]
  ]);
});

cell('F61', "modular gaps use the surrounding inline or display mode independently of math style", () => {
  texBoxes([
    [String.raw`a\pmod{n}`, 4.573758, 0.748, 0.248],
    [String.raw`a\pod{n}`, 2.351433, 0.748, 0.248],
    [String.raw`a\mod{n}`, 4.017975, 0.694, 0.011],
    [String.raw`a\pmod{n}`, 5.1293, 0.748, 0.248, true],
    [String.raw`a\pod{n}`, 2.906975, 0.748, 0.248, true],
    [String.raw`a\mod{n}`, 4.3513, 0.694, 0.011, true],
    [String.raw`\displaystyle a\pmod{n}`, 4.573758, 0.748, 0.248],
    [String.raw`\textstyle a\pmod{n}`, 5.1293, 0.748, 0.248, true],
    [String.raw`x^{a\pmod n}`, 4.531427, 0.8866, 0.011, true],
    [String.raw`a\bmod n`, 3.573541, 0.694, 0.011]
  ]);
});

cell('F62', "a sized delimiter accepts a braced delimiter argument", () => {
  texBoxes([
    [String.raw`\bigl{(}x\bigr{)}`, 1.416, 0.847598, 0.347597]
  ]);
});

cell('F63', "mathchoice selects and splices the current display, text, script or scriptscript branch", () => {
  texBoxes([
    [String.raw`a\mathchoice{+b}{=c}{,d}{.e}`, 2.295541, 0.442, 0.011],
    [String.raw`a\mathchoice{+b}{=c}{,d}{.e}`, 2.180432, 0.694, 0.083, true],
    [String.raw`x^{\mathchoice{a}{b}{c}{d}}`, 0.985699, 0.671701, 0.011],
    [String.raw`x^{y^{\mathchoice{a}{b}{c}{d}}}`, 1.448799, 0.964101, 0.011],
    [String.raw`a\mathchoice{+b}{=c}{,d}{.e}_x`, 2.805141, 0.442, 0.254001],
    [String.raw`a\mathchoice{\mathchoice{+b}{+c}{+d}{+e}}{=c}{,d}{.e}`, 2.180432, 0.694, 0.083, true]
  ]);
});

cell('F64', "verbatim text preserves raw characters and separate spaces in the full-size Mono face", () => {
  texBoxes([
    [String.raw`\verb|a  b|`, 2.1, 0.611, 0.006],
    [String.raw`\verb|a b % \x|`, 4.2, 0.694, 0.083],
    [String.raw`\verb*|a b|`, 1.575, 0.611, 0.111111],
    [String.raw`x^{\verb|a b|}`, 2.203, 0.974001, 0.011],
    ["\\verb|a\tb|", 1.575, 0.611, 0.006],
    ["\\verb*|a\t\tb|", 2.1, 0.611, 0.111111],
    [String.raw`\verb|!%\\{}#$^_~|`, 5.775, 0.694, 0.167],
    [String.raw`\verb*| |`, 0.525, 0.219444, 0.111111]
  ]);
  const raw = String.raw`\verb|a b % \x|`;
  assert(renderMath(raw).svg.includes('<title>' + raw + '</title>'), 'verbatim rendering retains exact source');
  assert(mathml(raw).includes('<annotation encoding="application/x-tex">' + raw + '</annotation>'), 'verbatim MathML retains exact source');
});

cell('F65', "text ties keep individual advances, including the Mono word space", () => {
  texBoxes([
    [String.raw`\text{a~~b}`, 1.722, 0.694, 0.011],
    [String.raw`\texttt{a b}`, 1.575, 0.611, 0.006],
    [String.raw`\texttt{a~~b}`, 2.1, 0.611, 0.006]
  ]);
});

cell('F66', "contextual dots inspect the next raw token and retain each named command's trailing glue", () => {
  texBoxes([
    [String.raw`a_1+\dots+a_n`, 5.283365, 0.583, 0.254001],
    [String.raw`\int\dots\int`, 2.500323, 0.805499, 0.305501],
    [String.raw`a_1\dots a_n`, 3.232823, 0.442, 0.254001],
    [String.raw`a_1,\dots,a_n`, 3.955486, 0.442, 0.254001],
    [String.raw`a_1\dotsb a_n`, 3.171823, 0.442, 0.254001],
    [String.raw`a_1\dotsm a_n`, 3.171823, 0.442, 0.254001],
    [String.raw`\int\dotsi\int`, 2.272661, 0.805499, 0.305501],
    [String.raw`a_1\dotso a_n`, 3.232823, 0.442, 0.254001],
    [String.raw`\dots`, 1.003662, 0.106, 0],
    [String.raw`\ldots`, 0.837, 0.106, 0],
    [String.raw`\dotsb`, 0.942662, 0.303, 0],
    [String.raw`\dotsm`, 0.942662, 0.303, 0],
    [String.raw`\dotsi`, 0.609337, 0.303, 0],
    [String.raw`\dotso`, 1.003662, 0.106, 0],
    [String.raw`a\dots\times b`, 3.123094, 0.694, 0.011],
    [String.raw`a\dots×b`, 3.123094, 0.694, 0.011],
    [String.raw`a\dots`, 1.699324, 0.442, 0.011],
    [String.raw`(a\dots)`, 2.477324, 0.748, 0.248],
    [String.raw`a\dots,b`, 2.572986, 0.694, 0.192999],
    [String.raw`a\dotso,b`, 2.739648, 0.694, 0.192999],
    [String.raw`a\dotsc,b`, 2.572986, 0.694, 0.192999],
    [String.raw`a\cdots`, 1.471661, 0.442, 0.011],
    [String.raw`\def\plus{+}a\dots\plus b`, 3.184094, 0.694, 0.083],
    [String.raw`a\dots\le b`, 3.295203, 0.694, 0.119],
    [String.raw`a\dots{+}b`, 2.906323, 0.694, 0.083]
  ]);
});


cell('F67', 'a chosen math-style declaration reaches later atoms and keeps font assignments scoped', () => {
  texBoxes([
    [String.raw`a\mathchoice{\scriptstyle b}{\scriptstyle c}{d}{e}f`, 1.284999, 0.492799, 0.142799],
    [String.raw`a\mathchoice{\scriptstyle b}{\scriptstyle c}{d}{e}f`, 1.2703, 0.492799, 0.142799, true],
    [String.raw`a\mathchoice{}{\scriptstyle}{}{}b`, 0.8804, 0.4858, 0.011],
    [String.raw`a\mathchoice{}{\scriptstyle b\mathchoice{D}{T}{S}{Q}}{}{}c`, 1.7547, 0.492101, 0.014],
    [String.raw`a{\mathchoice{\scriptstyle b}{\scriptstyle c}{d}{e}}f`, 1.376698, 0.705, 0.205],
    [String.raw`x^{a\mathchoice{b}{c}{\textstyle d}{e}f}`, 2.095999, 1.068001, 0.011],
    [String.raw`a\mathchoice{}{\rm b}{}{}c`, 1.517999, 0.694, 0.011],
    [String.raw`a\mathchoice{}{\bf b}{}{}c`, 1.600999, 0.694, 0.011],
    [String.raw`a\mathchoice{}{\rm\scriptstyle b}{}{}c`, 1.3284, 0.4858, 0.011],
    [String.raw`a\mathchoice{}{\bf\scriptstyle b}{}{}c`, 1.389299, 0.4858, 0.011],
    [String.raw`a\scriptstyle^b`, 0.884698, 0.6011, 0.011],
    [String.raw`{\scriptstyle B}^x`, 1.113699, 0.671701, 0]
  ]);
  const chosen = mathml(String.raw`a\mathchoice{}{\scriptstyle c}{}{}f`);
  assert(chosen.includes('scriptlevel="1"'), 'MathML keeps the selected script style');
  assert(chosen.includes('<mi>c</mi>') && chosen.includes('<mi>f</mi>'), 'MathML keeps both affected symbols');
});
cell('F68', 'a group containing a choice remains boxed before branch selection', () => {
  texBoxes([
    [String.raw`{\mathchoice{A}{B}{C}{D}}^x`, 1.268599, 0.741701, 0],
    [String.raw`\mathchoice{A}{B}{C}{D}^x`, 1.268599, 0.683, 0],
    [String.raw`{\mathchoice{}{}{}{}B}^x`, 1.268599, 0.741701, 0],
    [String.raw`{{\mathchoice{A}{B}{C}{D}}}^x`, 1.268599, 0.741701, 0],
    [String.raw`{AB}^x`, 2.018599, 0.774701, 0],
    [String.raw`{B}^x`, 1.293599, 0.683, 0],
    [String.raw`a{+b}c`, 2.168999, 0.694, 0.083]
  ]);
});
cell('F69', 'verbatim macro expansion is charged before repeated raw text is materialized', () => {
  const source = String.raw`\def\a{\verb|` + ' '.repeat(10000) + '|}' + String.raw`\a`.repeat(100);
  const prepared = mathPrepare(source);
  assert.equal(prepared.error?.code, 'resource-limit', 'repeated raw text reaches the shared admission bound');
  assert.equal(prepared.text, source, 'a refused expansion retains the authored source');
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

cell('P2', 'a misspelled command keeps its fix at the caret; a name being typed does not', () => {
  for (const [tex, fix] of [[String.raw`\farc`, String.raw`\frac`], [String.raw`a+\alhpa`, String.raw`\alpha`]])
    assert.equal(renderMath(tex, {preview: true, caret: tex.length}).errors[0]?.suggestion, fix, 'the fix for ' + tex);
  const {parseMathTex} = parser, text = ['parser.js', 'symbols.js', 'variants.js'].map(file => readFileSync(resolve(mathRoot, file), 'utf8')).join('\n');
  const accepted = [...new Set(text.match(/[A-Za-z]{2,}/g))].filter(name => {
    try { parseMathTex('\\' + name + '{a}{b}{c}'); return true; } catch (error) { return !(error.code === 'unsupported-command' && error.offset === 0); }
  });
  const faulted = accepted.flatMap(name => Array.from({length: name.length - 2}, (_, i) => '\\' + name.slice(0, i + 2)))
    .filter(prefix => renderMath(prefix, {preview: true, caret: prefix.length}).errors.length);
  assert.deepEqual([...new Set(faulted)], [], 'a command being typed previews without a fault');
});
cell('P3', 'an empty argument in the phone strip\'s preview is a placeholder to tap, at the place inside its braces', () => {
  const square = MATH_FONT.chars[0x25a1];
  for (const [tex, offsets] of [[String.raw`\frac{}{}`, [6, 8]], ['x^{}', [0, 3]], [String.raw`\sqrt{}`, [6]], [String.raw`\frac{a}{}`, [6, 9]]]) {
    const {svg, errors} = renderMath(tex, {preview: true, spans: true});
    assert.deepEqual(errors, [], tex);
    assert.deepEqual([...svg.matchAll(/data-math-at="(\d+)"/g)].map(m => +m[1]), offsets, tex + ' tap targets');
    assert(glyphs(svg).some(item => item.id === square), tex + ' draws a placeholder box');
    assert(!glyphs(renderMath(tex).svg).some(item => item.id === square), tex + ' renders without a placeholder outside the preview');
  }
});

const results = [];
for (const {id, claim, check} of cells) {
  try { check(); results.push([id, 'green', claim]); }
  catch (error) { results.push([id, 'red', claim + ': ' + error.message]); }
}
for (const row of results) console.log(row.join('\t'));
assert(results.every(row => row[1] === 'green'), 'red cells');
console.log(JSON.stringify({cells: results.length, typesetting: 'TeX where Appendix G decides'}));
