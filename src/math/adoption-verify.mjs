// SPDX-License-Identifier: MIT
// Optional host checks: run from the installed package with the example peers.
// One source-custody table; no appearance or timing assertions.
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import {render} from 'rapier-math';
import rapierMath from 'rapier-math/markdown-it';
import rehypeMath from 'rapier-math/rehype';
import {createMathMatcher} from 'rapier-math/delimiters';
import {createMarkdownStream, createMathSession} from 'rapier-math/stream';
import {processor} from '../examples/unified.mjs';

const md = new MarkdownIt({html: false}).use(rapierMath);
const dollar = new MarkdownIt({html: false}).use(rapierMath, {singleDollar: true});
const mathNodes = (host, source) => host.parse(source, {}).flatMap(token => token.children || [token])
  .filter(token => token.type === 'math_inline' || token.type === 'math_block');
const rows = [
  ['escaped pair incomplete', String.raw`$$x\$$`, 0],
  ['escaped pair then closer', String.raw`$$x\$$y$$`, 1],
  ['even escape run', String.raw`$$x\\$$`, 1],
  ['brackets', String.raw`A \(x+1\) B \[y\]`, 2],
  ['escaped bracket opener', String.raw`A \\(x\\)`, 0],
  ['currency', 'It costs $5 and $10.', 0],
  ['code and fence', '`$$x$$`\n\n```tex\n$$y$$\n```\n\n    $$z$$\n', 0],
  ['links', String.raw`[\(x\)](https://example.com/$$x$$)`, 0],
  ['literal backslashes', String.raw`Path C:\\temp. \(\text{a\ b}\)`, 1],
  ['CRLF BOM Unicode', '\ufeffπ 🐈\r\n\r\n$$\r\nx+1\r\n$$\r\n', 1],
  ['incomplete', 'Before \\(x+1 and after', 0],
  ['malformed UTF-16', '\ud800 and \\(x\\) and \udfff', 1],
];
for (const [name, source, count] of rows) {
  assert.equal(mathNodes(md, source).length, count, name);
  const batch = md.render(source, {});
  // Every two-piece boundary, including CRLF, escape runs and surrogate pairs.
  for (let split = 0; split <= source.length; split++) {
    const stream = createMarkdownStream((text, mathSession) => md.render(text, {rapierMathSession: mathSession}), {previewEvery: 8});
    stream.write(source.slice(0, split)); stream.write(source.slice(split));
    const final = stream.finish();
    assert.equal(final.source, source, name + ': exact transport source');
    assert.equal(final.html, batch, name + ': final batch agreement');
  }
}
for (const [source, count] of [[String.raw`$x\$y$`, 1], ['$x$5', 0], ['$ x$', 0], ['$x $', 0], ['$$$x$$$', 0]])
  assert.equal(mathNodes(dollar, source).length, count);
// Image descriptions are text-only host output: unknown math token types must
// not disappear from alt text or spend a formula-render budget.
for (const [source, alt] of [
  [String.raw`![before $$x$$ after](image.png)`, 'before $$x$$ after'],
  [String.raw`![before \(x\) after](image.png)`, String.raw`before \(x\) after`],
  [String.raw`![a ![b $$x$$](inner.png) c](outer.png)`, 'a b $$x$$ c'],
  [String.raw`![a $$\text{<>&"}$$ b](image.png)`, 'a $$\\text{&lt;&gt;&amp;&quot;}$$ b'],
]) {
  const host = new MarkdownIt({html: false}).use(rapierMath, {maxFormulas: 1});
  const tokens = host.parse(source + String.raw` \(y\)`, {});
  for (let pass = 0; pass < 2; pass++) {
    const env = {}, html = host.renderer.render(tokens, host.options, env);
    assert(html.includes('alt="' + alt + '"'), 'image math remains literal source');
    assert.equal((html.match(/<svg /g) || []).length, 1, 'alt text does not spend the formula budget');
    assert.equal(env.rapierMathErrors, undefined);
  }
}
const exact = '\ufeff$$\r\n α+\\text{a\\ b} 🐈\r\n$$';
const span = createMathMatcher(exact)(1);
assert.equal(exact.slice(span.bodyStart, span.bodyEnd), '\r\n α+\\text{a\\ b} 🐈\r\n');
assert.equal(createMathMatcher(String.raw`$$x\$$`)(0), null);

let first = createMarkdownStream(text => text, {maxSourceLength: 8, previewEvery: 2});
const second = createMarkdownStream(text => text);
first.write('ab'); second.write('other'); first.abort(); first.abort();
assert.throws(() => first.write('c'));
const replaced = first;
first = first.reset(); first.write('new');
assert.throws(() => replaced.write('stale'), 'a replaced producer cannot write into the new message');
assert.throws(() => first.write('123456'), {code: 'resource-limit'});
assert.equal(first.finish().source, 'new');
assert.equal(second.finish().source, 'other');
assert.throws(() => second.finish());
let failingHost = true, supplied = 0;
const failing = createMarkdownStream(text => {
  supplied += text.length;
  if (failingHost) throw new Error('host failed');
  return text;
}, {previewEvery: 2});
const failedSource = 'x'.repeat(32);
for (const chunk of failedSource) {
  try { failing.write(chunk); } catch (error) { assert.equal(error.message, 'host failed'); }
}
failingHost = false;
assert.equal(failing.finish().source, failedSource, 'failed previews retain every accepted chunk');
assert(supplied < 3 * failedSource.length, 'failed previews keep the repeated-work bound');
failing.abort(); failing.reset().abort();

const hostile = String.raw`Before \(\text{</title><script>alert(1)</script>}\). <img src=x onerror=alert(1)>`;
assert(!/<script|<img/i.test(md.render(hostile, {})));
// Cached syntax can serve multiple outputs. Budgets belong to each render, not
// to parsing or to an env object; every paragraph still shares one document cap.
const formulaSource = String.raw`\(x\)`, svgCount = html => (html.match(/<svg /g) || []).length;
for (const budgets of [{maxFormulas: 1}, {maxOutputLength: render('x').svg.length}]) {
  const host = new MarkdownIt({html: false}).use(rapierMath, budgets);
  const mathSession = createMathSession(), env = {rapierMathSession: mathSession};
  for (const inline of [false, true]) {
    const source = formulaSource + (inline ? ' ' : '\n\n') + formulaSource;
    const tree = host.parse(source, {});
    const tokens = inline ? tree[1].children : tree;
    const renderer = inline ? host.renderer.renderInline : host.renderer.render;
    for (let pass = 0; pass < 2; pass++) {
      delete env.rapierMathErrors;
      const out = renderer.call(host.renderer, tokens, host.options, env);
      assert.equal(svgCount(out), 1);
      assert.equal(env.rapierMathErrors.length, 1);
      assert.equal(env.rapierMathErrors[0].errors[0].code, 'resource-limit');
      assert(out.includes(formulaSource));
    }
  }
  assert.equal(mathSession.stats.evaluations, 1, 'admitted cache hits still spend the fresh document budget');
  mathSession.dispose();
}
const nestedHost = new MarkdownIt({html: false}).use(rapierMath, {maxFormulas: 1});
const nestedTree = nestedHost.parse(formulaSource + ' fail', {});
const textRule = nestedHost.renderer.rules.text;
nestedHost.renderer.rules.text = (tokens, index, opts, env, self) => {
  if (tokens[index].content === ' fail') throw new Error('host render failed');
  if (tokens[index].content.includes('nested')) {
    for (const inline of [false, true]) {
      const nestedEnv = {rapierMathSession: env.rapierMathSession};
      assert.throws(() => inline
        ? self.renderInline(nestedTree[1].children, opts, nestedEnv)
        : self.render(nestedTree, opts, nestedEnv), /host render failed/);
      assert.equal(nestedEnv.rapierMathErrors, undefined, 'nested render has its own budget');
      assert.equal(env.rapierMathSession.stats.entries, 0, 'a failed nested render clears retained artifacts');
    }
  }
  return textRule(tokens, index, opts, env, self);
};
const outerTree = nestedHost.parse(formulaSource + ' nested ' + formulaSource, {});
const nestedSession = createMathSession();
// A custom host can run the same renderer twice; a failed nested render must
// restore the outer cap and leave subsequent root renders fresh.
for (let pass = 0; pass < 2; pass++) {
  const env = {rapierMathSession: nestedSession}, out = nestedHost.renderer.render(outerTree, nestedHost.options, env);
  assert.equal(svgCount(out), 1);
  assert.equal(env.rapierMathErrors.length, 1);
  assert.equal(env.rapierMathErrors[0].errors[0].code, 'resource-limit');
}
nestedSession.dispose();
// Reentering an already parsed inline tree is still an independent render, even
// when its array is already known to the active outer document.
const reentrant = new MarkdownIt({html: false}).use(rapierMath, {maxFormulas: 1});
const reentrantTree = reentrant.parse(formulaSource + ' nested ' + formulaSource + '\n\n' + formulaSource, {});
const reentrantText = reentrant.renderer.rules.text, reentrantSession = createMathSession();
reentrant.renderer.rules.text = (tokens, index, opts, env, self) => {
  if (!env.nested && tokens[index].content.includes('nested')) {
    for (const children of [tokens, reentrantTree[4].children]) {
      const nestedEnv = {nested: true, rapierMathSession: reentrantSession};
      assert.equal(svgCount(self.renderInline(children, opts, nestedEnv)), 1, 'reentrant same/sibling tree gets a fresh cap');
    }
    assert.equal(svgCount(reentrant.renderInline(formulaSource, {nested: true, rapierMathSession: reentrantSession})), 1);
  }
  return reentrantText(tokens, index, opts, env, self);
};
const reentrantEnv = {rapierMathSession: reentrantSession};
assert.equal(svgCount(reentrant.renderer.render(reentrantTree, reentrant.options, reentrantEnv)), 1);
assert.equal(reentrantEnv.rapierMathErrors.length, 2, 'the outer document still spends one shared cap');
reentrantSession.dispose();
const tiny = new MarkdownIt({html: false}).use(rapierMath, {maxOutputLength: 1});
assert(!tiny.render(String.raw`\(x\)`).includes('<svg'));
const bad = {}, fallback = md.render(String.raw`Good \(x\). Bad \(\unknown{x}\).`, bad);
assert.equal(bad.rapierMathErrors[0].errors[0].code, 'unsupported-command');
assert(fallback.includes('\\unknown{x}'));

const unified = await processor.process('Code `$$x$$`. Math $$x+1$$.\n\n<script>alert(1)</script>\n\n$$\\unknown{x}$$');
assert.equal((String(unified).match(/<svg /g) || []).length, 1);
assert(!String(unified).includes('<script'));
assert.equal(unified.messages[0].ruleId, 'unsupported-command');
assert(String(unified).includes('\\unknown{x}'));
const unifiedSession = createMathSession();
for (let pass = 0; pass < 2; pass++) {
  const file = processor.processSync({value: 'Formula $$x$$. Repeated $$x$$.', data: {rapierMathSession: unifiedSession}});
  assert.equal(svgCount(String(file)), 2);
  assert.equal(file.messages.length, 0);
}
assert.equal(unifiedSession.stats.evaluations, 1, 'rehype explicitly reuses formula work across fresh trees');
unifiedSession.dispose();
// Setup is part of the same failure lifetime as rendering. Invalid budgets may
// arrive between previews; neither adapter may leave the old message artifacts.
const setupOptions = {maxFormulas: 1}, setupHost = new MarkdownIt().use(rapierMath, setupOptions);
const setupTransform = rehypeMath(setupOptions);
for (const adapter of ['markdown-it', 'rehype']) {
  const session = createMathSession();
  setupHost.render(formulaSource, {rapierMathSession: session});
  assert.equal(session.stats.entries, 1);
  setupOptions.maxFormulas = -1;
  assert.throws(() => adapter === 'markdown-it'
    ? setupHost.render(formulaSource, {rapierMathSession: session})
    : setupTransform({type: 'root', children: []}, {data: {rapierMathSession: session}}), RangeError);
  assert.equal(session.stats.entries, 0, adapter + ': failed setup clears retained artifacts');
  assert.equal(session.stats.retainedBytes, 0);
  setupOptions.maxFormulas = 1;
  session.dispose();
}
// Without a reuse session, ordinary options retain per-occurrence observation.
// An explicit session intentionally snapshots stable options at the root.
const changingOptions = {renderOptions: {maxWidth: 1}}, changingHost = new MarkdownIt().use(rapierMath, changingOptions);
const changingText = changingHost.renderer.rules.text;
changingHost.renderer.rules.text = (tokens, index, opts, env, self) => {
  changingOptions.renderOptions.maxWidth = 5;
  return changingText(tokens, index, opts, env, self);
};
const changingFormula = 'x+x+x+x+x+x', changingSource = '\\(' + changingFormula + '\\) then \\(' + changingFormula + '\\)';
const narrow = render(changingFormula, {maxWidth: 1}).svg, wide = render(changingFormula, {maxWidth: 5}).svg;
assert.equal(changingHost.render(changingSource), '<p>' + narrow + ' then ' + wide + '</p>\n');
changingOptions.renderOptions.maxWidth = 1;
const changingSession = createMathSession();
assert.equal(changingHost.render(changingSource, {rapierMathSession: changingSession}), '<p>' + narrow + ' then ' + narrow + '</p>\n');
changingSession.dispose();
// A host may throw a non-Error value while options are read. Normalize it before
// adapter serialization, including falsy message/command values and non-string codes.
for (const accessible of [false, true]) for (const cached of [false, true]) {
  const mathSession = cached ? createMathSession() : undefined;
  const host = new MarkdownIt().use(rapierMath, {accessible,
    renderOptions: {get maxWidth() { throw {code: 7, message: '', command: 0}; }}});
  const env = {rapierMathSession: mathSession};
  const html = host.render(String.raw`\(x\)`, env);
  assert(html.includes('data-math-error="invalid-tex"'));
  assert.deepEqual(env.rapierMathErrors[0].errors, [{code: 'invalid-tex', message: '', offset: 0, command: '0'}]);
  mathSession?.dispose();
}


// MathML can leave a containing link unnamed even though its nested structure
// remains accessible. Give only the new composed route a destination fallback;
// retain authored names and leave ordinary SVG and rejected insertions unchanged.
const linkedCode = source => ({type: 'element', tagName: 'code', properties: {className: ['language-math', 'math-inline']}, children: [{type: 'text', value: source}]});
for (const accessible of [false, true]) for (const authored of [{}, {title: 'Open the derivation'}, {ariaLabel: 'Read proof'}, {ariaLabelledBy: ['purpose']}]) {
  const properties = {href: 'https://example.test/proof?a=1&b=2', ...authored};
  const link = {type: 'element', tagName: 'a', properties, children: [{type: 'element', tagName: 'strong', properties: {}, children: [linkedCode(String.raw`\frac{x}{y}`)]}]};
  rehypeMath({accessible})({type: 'root', children: [link]});
  const expected = accessible && Object.keys(authored).length === 0 ? {...properties, title: properties.href} : {href: properties.href, ...authored};
  assert.deepEqual(link.properties, expected, 'host-owned accessible names remain authoritative');
  const tags = [], walk = node => { if (node.tagName) tags.push(node.tagName); for (const child of node.children || []) walk(child); }; walk(link);
  assert.equal(tags.filter(tag => tag === 'svg').length, 1, 'destination fallback preserves visual SVG');
  assert.equal(tags.filter(tag => tag === 'math').length, accessible ? 1 : 0, 'destination fallback preserves native MathML');
}
for (const source of [String.raw`\unsupported{x}`, String.raw`\href{https://example.test/inner}{x}`]) {
  const link = {type: 'element', tagName: 'a', properties: {href: 'https://example.test/outer'}, children: [linkedCode(source)]};
  rehypeMath({accessible: true})({type: 'root', children: [link]});
  assert.equal(link.properties.title, undefined, 'rejected insertion does not mutate the host link');
}

console.log(JSON.stringify({sourceCustodyRows: rows.length, splitAgreement: 'all two-piece boundaries',
  lifetimes: 'abort, replacement handles, rejection, interleaved messages, explicit bounded reuse', adapters: 'markdown-it and sanitized unified',
  security: 'hostile source stays inert; document math budgets fall back'}));
