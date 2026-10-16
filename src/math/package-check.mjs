// SPDX-License-Identifier: MIT
// Package entry, exact authored text and hostile-content boundaries; no appearance assertions.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script, createContext} from 'node:vm';
import {assembleMath} from '../src/tools/build-math.mjs';
import {fileURLToPath} from 'node:url';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('./package.json'));
const resources = JSON.parse(await read('./docs/math-resources.json'));
const classicSource = await read('./' + resources.packageBundle);
assert.equal(pkg.name, 'rapier-math');
assert.equal(pkg.version, resources.version);
assert.equal(pkg.type, 'module');
assert.equal(pkg.license, 'SEE LICENSE IN LICENSE');
assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
assert.equal(Object.keys(pkg.scripts || {}).length, 0);
const rebuilt = await assembleMath({root: fileURLToPath(new URL('..', import.meta.url)), packageLayout: true});
for (const [file, content] of rebuilt.modules) assert.equal(await read(file), content, 'exact native module: ' + file);
const rendererLicense = await read('./src/math/LICENSE-MIT'), fontLicense = await read('./src/math/FONT-LICENSE.txt');
for (const name of ['./LICENSE', './src/math/font.js', './' + resources.packageBundle]) {
  const text = await read(name);
  if (!name.endsWith('font.js')) assert(text.includes(rendererLicense.trim()), name + ': renderer license');
  assert(text.includes(fontLicense.trim()), name + ': complete font license');
}

// Initialize Node's lazy Web API globals before observing module purity. This
// allocates a local Response only; no network request or renderer evaluation.
new Response();
const globals = Object.getOwnPropertyDescriptors(globalThis);
const stream = await import('rapier-math/stream');
assert.deepEqual(Object.keys(stream).sort(), ['createMarkdownStream', 'createMathSession']);
assert.equal(Object.hasOwn(pkg.exports, './reuse'), false, 'reuse is an internal package helper');
const session = stream.createMathSession();
assert(Object.isFrozen(session), 'message session handle is immutable');
session.clear(); session.dispose();
assert.equal(typeof (await import('../dist/integration.mjs')).createFormulaRenderer, 'function', 'internal adapter import closure');
const module = await import('../dist/index.mjs');
const semantic = await import('rapier-math/mathml'), combined = await import('rapier-math/combined');
assert.deepEqual(Object.keys(semantic).sort(), ['parse', 'toMathML']);
assert.deepEqual(Object.keys(combined), ['renderWithMathML']);
assert.equal(typeof (await import('rapier-math/accessible')).renderAccessible, 'function');
assert.equal(pkg.exports['./accessible.css'], './dist/accessible.css');
assert(pkg.sideEffects.includes('./dist/accessible.css'));
const afterImport = Object.getOwnPropertyDescriptors(globalThis);
assert.deepEqual(Reflect.ownKeys(afterImport), Reflect.ownKeys(globals), 'module adds no globals');
for (const key of Reflect.ownKeys(globals)) for (const field of Object.keys(globals[key]))
  assert(Object.is(afterImport[key][field], globals[key][field]), 'module preserves global ' + String(key));
assert.deepEqual(Object.keys(module).sort(), ['default', 'fit', 'observe', 'parse', 'render', 'renderToString', 'version']);
for (const name of Object.keys(module.default)) assert.equal(module[name], module.default[name], 'named/default export ' + name);
assert.equal(module.version, resources.version);
assert(Object.isFrozen(module.default));

const context = createContext({atob, URL});
new Script(classicSource, {filename: resources.bundle}).runInContext(context);
const classic = context.RapierMath;
assert.equal(classic.version, pkg.version, 'classic/package release identity');
const plain = value => JSON.parse(JSON.stringify(value));
const unescape = text => text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (_, entity) =>
  entity[0] === '#' ? String.fromCodePoint(entity[1] === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))) :
    ({amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"})[entity]);
function sourceAlternative(result, source) {
  const label = /\baria-label="([^"]*)"/.exec(result.svg)?.[1];
  const title = /<title>([^<]*)<\/title>/.exec(result.svg)?.[1];
  const utf16 = /\bdata-tex-utf16="([0-9a-f]+)"/.exec(result.svg)?.[1];
  if (utf16) assert.equal(utf16.match(/.{4}/g).map(part => String.fromCharCode(parseInt(part, 16))).join(''), source, 'exact UTF-16 alternative');
  else { assert.equal(unescape(label), source, 'exact aria alternative'); assert.equal(unescape(title), source, 'exact title alternative'); }
}
function inert(svg) {
  assert(!/<\s*(?:script|foreignObject|iframe|object|embed|image|style|animate|set)\b/i.test(svg), 'no executable or remote SVG element');
  for (const tag of svg.match(/<[^>]+>/g) || []) {
    const attributes = [...tag.matchAll(/\s([^\s=]+)="([^"]*)"/g)];
    for (const [, name, value] of attributes) {
      assert(!/^on/i.test(name), 'no event attribute');
      if (/^(?:href|xlink:href)$/i.test(name)) assert(/^https?:\/\//i.test(unescape(value)), 'only HTTP(S) links');
      if (!/^(?:aria-label|data-tex-utf16)$/.test(name)) assert(!/url\s*\(|javascript:|vbscript:/i.test(unescape(value)), 'no executable attribute');
    }
  }
}

const examples = [
  [String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`, {displayMode: true}],
  [String.raw`\begin{aligned}a&=b+c\\d&=e+f\end{aligned}`, {displayMode: true, maxWidth: 4}],
  [String.raw`\newcommand{\squareof}[1]{#1^2}\squareof{x}`, {screen: {fontSize: 16, pixelRatio: 2, dark: false}}],
  [String.raw`\text{A < B & "C" 'D'} + α`, {}],
  [String.raw`\href{https://example.com/?a=1&b=2}{x}`, {}],
  [String.raw`\unsupported{content}`, {}],
  ['x\u0000y\ud800z\udfff', {}],
];
for (const [source, options] of examples) {
  const result = module.render(source, options);
  assert.deepEqual(plain(result), plain(classic.render(source, options)), 'module/classic result');
  assert.equal(module.renderToString(source, options), result.svg, 'string export agrees with render');
  sourceAlternative(result, source); inert(result.svg);
}
assert.deepEqual(plain(module.parse(examples[0][0])), plain(classic.parse(examples[0][0])), 'module/classic parse');
assert.equal(module.render(examples.at(-1)[0]).errors[0].code, 'invalid-source-character');
assert.equal(module.render(examples.at(-2)[0]).errors[0].code, 'unsupported-command');

const hostile = [
  String.raw`\text{</title><script>alert(1)</script>}`,
  String.raw`\href{javascript:alert(1)}{x}`,
  String.raw`\href{data:text/html,test}{x}`,
  String.raw`\href{https://example.com/" onload="alert(1)}{x}`,
  String.raw`\color{url(https://example.com/payload)}x`,
  String.raw`\def\again{\again}\again`,
];
for (const source of hostile) {
  const result = module.render(source);
  sourceAlternative(result, source); inert(result.svg);
  assert.deepEqual(plain(result), plain(classic.render(source)), 'module/classic hostile result');
}
for (const source of hostile.slice(1)) assert(module.render(source).errors.length, 'unsafe or exhausted input produces a diagnostic');
for (const source of ['x'.repeat(1_000_001), '\ud800'.repeat(1_000_001), '&'.repeat(8_000_000)]) {
  const result = module.render(source);
  assert.equal(result.errors[0].code, 'resource-limit');
  assert.equal(result.errors[0].sourceOmitted, true);
  assert(result.svg.includes('data-math-source-omitted="true"'));
  assert(!result.svg.includes('data-tex-utf16'), 'refused source never creates a carrier');
  assert(result.svg.length < 100_000, 'refusal diagnostic is fixed-size');
  assert.equal(module.renderToString(source), result.svg);
  assert.deepEqual(plain(result), plain(classic.render(source)), 'module/classic refusal result');
  inert(result.svg);
}
const longCommand = '\\' + 'a'.repeat(10_000), diagnostic = module.render(longCommand);
assert(diagnostic.errors[0].messageTruncated && diagnostic.errors[0].commandTruncated);
sourceAlternative(diagnostic, longCommand);
assert(diagnostic.errors[0].message.length <= 1025 && diagnostic.errors[0].command.length <= 128);
const unicodeFailure = module.render('\\begin{' + '😀'.repeat(600) + '}x');
assert(unicodeFailure.errors[0].message.isWellFormed(), 'diagnostic admission cannot split a source surrogate pair');
assert.equal(module.render('x+1').errors.length, 0, 'refused input cannot poison later rendering');
console.log(JSON.stringify({name: pkg.name, version: module.version, module: 'native ESM; no global changes',
  rebuild: 'exact static native graph', classicAgreement: examples.length + hostile.length, sourceAlternatives: 'exact', hostileContent: 'inert', licenses: 'complete'}));
