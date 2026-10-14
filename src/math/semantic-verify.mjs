// SPDX-License-Identifier: MIT
// Structural MathML, exact-source custody and hostile-content checks against a staged package.
// Replay: node semantic-check.mjs [package-root]. Requires Python 3 with lxml for strict XML parsing.
// This exercises generated native ESM/classic entries. It makes no appearance or AT speech claims.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Script, createContext} from 'node:vm';

const root = resolve(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const read = path => readFile(resolve(root, path), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const resources = JSON.parse(await read('docs/math-resources.json'));
const entry = key => pathToFileURL(resolve(root, pkg.exports[key].default)).href;
const module = {...await import(entry('.')), ...await import(entry('./mathml'))};
const {renderWithMathML} = await import(entry('./combined'));
const standalone = await import(entry('./mathml'));
const {renderAccessible} = await import(entry('./accessible'));
const classicSource = await read(resources.packageBundle);
const context = createContext({atob, URL});
new Script(classicSource, {filename: resources.bundle}).runInContext(context);
const classic = context.RapierMath;
const plain = value => JSON.parse(JSON.stringify(value));

const corpus = [
  {id: 'fraction-roots', source: String.raw`\frac{12.5}{\sqrt[3]{1+\sqrt{x_2^4}}}`, status: 'complete'},
  {id: 'numbers-signs', source: '-12.34+56-7', status: 'complete'},
  {id: 'number-boundaries', source: String.raw`1{2}3+4\,5+6.7.8+2e3+9\text{ten}0`, status: 'complete'},
  {id: 'number-scripts', source: String.raw`12.3^4+1{2}^3+4\,5^6`, status: 'complete'},
  {id: 'scripts-inline', source: String.raw`x_{12}^{34}+\sum_{i=1}^{20}i`, status: 'complete'},
  {id: 'scripts-display', source: String.raw`x_{12}^{34}+\sum_{i=1}^{20}i`, options: {displayMode: true}, status: 'complete'},
  {id: 'explicit-limits', source: String.raw`\int\limits_0^1 f(x)\,dx+\sum\nolimits_i^n a_i`, options: {displayMode: true}, status: 'complete'},
  {id: 'operators', source: String.raw`\sin x+\operatorname{arg max}_{x}f(x)`, status: 'complete'},
  {id: 'atom-class-limits', source: String.raw`\mathrel{x}+\mathop{xy}+\sum_0^1\limits`, status: 'presentation-fallback'},
  {id: 'fences-accents', source: String.raw`\left(\hat{x}+\underline{y}\middle|z\right)+\overunderset{u}{v}{=}`, status: 'complete'},
  {id: 'matrix', source: String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`, status: 'complete'},
  {id: 'cases', source: String.raw`\begin{cases}x&x\ge0\\-x&\text{otherwise}\end{cases}`, status: 'complete'},
  {id: 'aligned', source: String.raw`\begin{aligned}a&=b+c\\d&=e\end{aligned}`, status: 'complete'},
  {id: 'array-insertion', source: String.raw`\begin{array}{r@{=}l}x&1\\y&2\end{array}`, status: 'presentation-fallback'},
  {id: 'style-text', source: String.raw`\mathbf{x}+\mathbb{R}+\text{speed 12.5}`, status: 'complete'},
  {id: 'macro', source: String.raw`\newcommand{\ratio}[2]{\frac{#1}{#2}}\ratio{12}{34}`, status: 'complete'},
  {id: 'explicit-tokens', source: String.raw`\mmlToken{mi}{speed}+\mmlToken{mn}{12.34}+\mmlToken{mo}{lim}+\mmlToken{mtext}{word}`, status: 'complete'},
  {id: 'links', source: String.raw`\href{https://example.com/?a=1&b=2}{\frac{x}{2}}`, status: 'presentation-fallback'},
  {id: 'nested-link', source: String.raw`\href{https://example.com/outer}{\href{https://example.com/inner}{x}}`, status: 'refused', code: 'semantic-nested-link'},
  {id: 'hidden-link', source: String.raw`\phantom{\href{https://example.com/}{x}}`, status: 'refused', code: 'semantic-hidden-link'},
  {id: 'chemistry', source: String.raw`\ce{2 H2 + O2 -> 2 H2O}`, status: 'presentation-fallback'},
  {id: 'physics-units', source: String.raw`\dv[2]{x}{t}+\pu{1.2e-3 m s-1}`, status: 'presentation-fallback'},
  {id: 'tags-labels', source: String.raw`x=1\label{eq:sample}\tag{A}`, status: 'presentation-fallback'},
  {id: 'presentation', source: String.raw`\cancel{x}+\phantom{a}+\smash{b}+\raisebox{1em}{c}`, status: 'presentation-fallback'},
  {id: 'xml-text', source: String.raw`\text{A < B \& "C" 'D' </mtext><script>run</script>}`, status: 'complete'},
  {id: 'source-lines', source: '\ufeffx% authored 😀 comment\r\n+\t1\r', status: 'complete'},
  {id: 'source-invalid', source: 'x\u0000y\ud800z\udfff\ufffe', status: 'refused', code: 'invalid-source-character'},
  {id: 'generated-invalid', source: String.raw`\unicode{0xffff}`, status: 'refused', code: 'invalid-semantic-character'},
  {id: 'unsupported', source: String.raw`\unsupported{x}`, status: 'refused', code: 'unsupported-command'},
  {id: 'bounded-diagnostic', source: '\\' + 'q'.repeat(5000), status: 'refused', code: 'unsupported-command'},
  {id: 'url-script', source: String.raw`\href{javascript:alert(1)}{x}`, status: 'refused'},
  {id: 'url-data', source: String.raw`\href{data:text/html,payload}{x}`, status: 'refused'},
  {id: 'url-attribute', source: String.raw`\href{https://example.com/" onclick="alert(1)}{x}`, status: 'refused'},
  {id: 'token-attribute', source: String.raw`\mmlToken{mi}[onclick="alert(1)"]{x}`, status: 'refused'},
  {id: 'color-url', source: String.raw`\textcolor{url(https://example.com/payload)}{x}`, status: 'refused'},
  {id: 'macro-exhaustion', source: String.raw`\def\again{\again}\again`, status: 'refused', code: 'resource-limit'},
  {id: 'depth-exhaustion', source: '\\sqrt{'.repeat(200) + 'x' + '}'.repeat(200), status: 'refused', code: 'resource-limit'},
  {id: 'parts-exhaustion', source: 'x'.repeat(50_001), status: 'refused', code: 'resource-limit'},
];

// Array insertions amplify shared AST content without a large authored source.
// These reach serializer work/output admission, independently of the parser's own limits.
for (const [id, insertion, rows] of [['table-work', 'x', 500], ['table-output', '\\text{' + 'A'.repeat(1000) + '}', 40]])
  corpus.push({id, source: '\\begin{array}{*{256}{@{' + insertion + '}c}}' + Array(rows).fill('a').join('\\\\') + '\\end{array}', status: 'refused', code: 'resource-limit', semanticOnly: true});
// Neither source admission nor presentation alone reaches its own bound. Their
// aggregate must refuse without throwing or discarding the exact CR-sensitive source.
corpus.push({id: 'complete-output', source: '%' + '&'.repeat(995000) + '\r\n' +
  '\\begin{array}{*{256}{@{\\text{' + 'A'.repeat(900) + '}}c}}' + Array(32).fill('a').join('\\\\') + '\\end{array}',
  status: 'refused', code: 'resource-limit', semanticOnly: true});


// Counterexamples at admission and normalization boundaries. These check source
// authority, truthful semantic status and focus safety rather than appearance.
for (const name of ['constructor', 'toString', 'hasOwnProperty'])
  corpus.push({id: 'inherited-' + name, source: '\\' + name + '{x}', status: 'refused', code: 'unsupported-command'});
corpus.push({id: 'inherited-text', source: String.raw`\text{\toString}`, status: 'refused', code: 'unsupported-command'});
corpus.push({id: 'own-macro-name', source: String.raw`\newcommand{\constructor}{x}\constructor`, status: 'complete'});
corpus.push({id: 'invalid-color-link', source: String.raw`\href{https://example.com}{\textcolor{transparent}{\textcolor{notacolor}{x}}}`, status: 'refused', code: 'semantic-empty-link'});
corpus.push({id: 'known-color-link', source: String.raw`\href{https://example.com}{\textcolor{transparent}{\textcolor{RebeccaPurple}{x}}}`, status: 'presentation-fallback'});
corpus.push({id: 'operator-domain', source: String.raw`\operatorname{\Tr}+\mathop{\grad}`, status: 'presentation-fallback', code: 'semantic-physics-presentation'});
corpus.push({id: 'unicode-numbers', source: '𝟙𝟚.𝟛^4+١٢', status: 'complete'});
corpus.push({id: 'authored-invisible-operator', source: String.raw`f\unicode{0x2061}(x)`, status: 'complete'});

const records = corpus.map(item => {
  const result = module.toMathML(item.source, item.options);
  assert.equal(result.status, item.status, item.id + ': explicit semantic status');
  if (item.code) assert(result.errors.some(error => error.code === item.code), item.id + ': refusal reason');
  assert.equal(result.status === 'complete', result.errors.length === 0, item.id + ': incomplete mapping is disclosed');
  assert.deepEqual(plain(classic.toMathML(item.source, item.options)), result, item.id + ': classic/ESM semantic agreement');
  assert.deepEqual(standalone.toMathML(item.source, item.options), result, item.id + ': font-free/full semantic agreement');
  if (!item.semanticOnly) {
    const combined = renderWithMathML(item.source, item.options);
    assert.deepEqual(combined.semantics, result, item.id + ': combined path preserves semantic result');
  }
  for (const value of Object.values(result.metrics)) assert(Number.isSafeInteger(value) && value >= 0, item.id + ': finite bounded work');
  assert.equal(result.metrics.outputCodeUnits, result.mathml.length, item.id + ': complete returned-output accounting');
  assert(result.mathml.length <= 16 * 1024 * 1024, item.id + ': complete output bound');
  return {...item, result};
});
const diagnostic = records.find(record => record.id === 'bounded-diagnostic').result.errors[0];
assert.equal(diagnostic.messageTruncated, true, 'semantic diagnostic retains its truncation marker');
assert.equal(diagnostic.commandTruncated, true, 'semantic command retains its truncation marker');
assert(diagnostic.message.length <= 1025 && diagnostic.command.length <= 128, 'bounded diagnostic fields');
assert.equal(records.find(record => record.id === 'source-lines').result.source.encoding, 'application/x-rapier-tex-utf16', 'CR source declares its HTML-stable exact carrier');

// Oversized text never enters source escaping or becomes an apparent truncated source archive.
for (const [id, source] of [['source-omitted', 'x'.repeat(1_000_001)], ['invalid-omitted', '\ud800'.repeat(1_000_001)]]) {
  const result = standalone.toMathML(source);
  assert.equal(result.status, 'refused');
  assert.equal(result.source.omitted, true);
  assert(result.errors.some(error => error.code === 'resource-limit' && error.sourceOmitted));
  assert(result.mathml.length < 100_000, id + ': bounded refusal');
  records.push({id, source, result});
}

// A returned inspectable tree is caller-owned data; mutations cannot alter another parse or render.
const detached = module.parse('x+1');
detached.children[0].value = '</mi><script>run</script>';
detached.children.push(detached);
assert.equal(module.parse('x+1').children[0].value, 'x', 'parse has no shared mutable tree');
assert.deepEqual(module.toMathML('x+1'), standalone.toMathML('x+1'), 'detached mutation cannot poison rendering');
assert.equal(module.toMathML(String.raw`\ratio{1}{2}`).status, 'refused', 'local macro scope cannot leak');
const good = module.toMathML('x+1');
good.errors.push({code: 'caller-change'});
assert.equal(module.toMathML('x+1').status, 'complete', 'returned diagnostic arrays are not shared');

const hosts = ['fraction-roots', 'links', 'unsupported'].map(id => {
  const item = records.find(record => record.id === id);
  const result = renderAccessible(item.source, item.options);
  assert.deepEqual(result.semantics, item.result, id + ': composition preserves semantic payload');
  if (id === 'unsupported') {
    assert.equal(result.presentation, 'refused');
    assert.equal(result.html, '');
    assert(result.errors.length > 0);
  } else assert.equal(result.presentation, id === 'links' ? 'mathml' : 'svg-mathml');
  return {id, html: result.html};
});

// A real XML parser catches unescaped text, wrong namespaces, injected children and attribute splitting.
const xmlReader = String.raw`
import json, re, sys
from lxml import etree
MATH = 'http://www.w3.org/1998/Math/MathML'
HTML = 'http://www.w3.org/1999/xhtml'
SVG = 'http://www.w3.org/2000/svg'
admitted = set('math semantics annotation mrow mi mn mo mtext mfrac msqrt mroot msub msup msubsup mover munder munderover mtable mtr mtd mstyle mspace mphantom mpadded menclose merror'.split())
def read_node(node, semantic):
    q = etree.QName(node)
    if semantic:
        assert q.namespace == MATH or (q.namespace == HTML and q.localname == 'a'), 'unexpected semantic namespace'
        assert q.localname in admitted or (q.namespace == HTML and q.localname == 'a'), 'unadmitted semantic element'
        if q.namespace == HTML:
            assert etree.QName(node.getparent()).namespace == MATH and etree.QName(node.getparent()).localname == 'mtext', 'HTML link only within MathML mtext'
    assert q.localname.lower() not in ('script', 'iframe', 'object', 'embed', 'image', 'foreignobject', 'style', 'animate', 'set'), 'active or remote element'
    attrs = dict(node.attrib)
    for name, value in attrs.items():
        local = etree.QName(name).localname
        assert not local.lower().startswith('on'), 'event attribute'
        assert local not in ('src', 'srcdoc', 'action', 'formaction'), 'active attribute'
        if local == 'href':
            assert re.match(r'^https?://[^\s<>"\x27\\]+$', value, re.I), 'link must remain a single HTTP(S) URL'
        if local not in ('href', 'aria-label', 'data-tex-utf16'):
            assert not re.search(r'url\s*\(|javascript:|vbscript:|expression\s*\(', value, re.I), 'executable attribute value'
        if semantic:
            assert local != 'id', 'semantic output must not invent occurrence identity'
            assert not re.search(r'(?<![A-Za-z])(?:NaN|Infinity)(?![A-Za-z])', value), 'nonfinite semantic attribute'
    return {'tag': q.localname, 'ns': q.namespace, 'attrs': attrs, 'text': node.text or '', 'children': [read_node(child, semantic) for child in node], 'tail': node.tail or ''}
def parse(text, semantic):
    assert '<!DOCTYPE' not in text and '<!ENTITY' not in text, 'DTD/entity injection'
    parser = etree.XMLParser(resolve_entities=False, load_dtd=False, no_network=True, recover=False)
    node = etree.fromstring(text.encode('utf-8'), parser)
    return read_node(node, semantic)
data = json.load(sys.stdin)
result = {'xml': '.'.join(map(str, etree.LXML_VERSION)), 'libxml': '.'.join(map(str, etree.LIBXML_VERSION)), 'python': sys.version.split()[0], 'records': [], 'hosts': []}
for item in data['records']:
    tree = parse(item['mathml'], True)
    assert tree['tag'] == 'math' and tree['ns'] == MATH, item['id'] + ': namespace-correct root'
    result['records'].append({'id': item['id'], 'tree': tree})
for item in data['hosts']:
    tree = parse('<div xmlns="' + HTML + '">' + item['html'] + '</div>', False)
    result['hosts'].append({'id': item['id'], 'tree': tree})
print(json.dumps(result, ensure_ascii=True))
`;
const xml = spawnSync(process.env.RAPIER_MATH_PYTHON || 'python3', ['-c', xmlReader], {
  input: JSON.stringify({records: records.map(({id, result}) => ({id, mathml: result.mathml})), hosts}),
  encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});
assert.equal(xml.status, 0, 'strict XML reader: ' + (xml.error?.message || xml.stderr));
const parsed = JSON.parse(xml.stdout);
const trees = new Map(parsed.records.map(({id, tree}) => [id, tree]));
const walk = function*(node) {yield node; for (const child of node.children) yield* walk(child);};
const find = (tree, tag) => [...walk(tree)].filter(node => node.tag === tag);
const one = (tree, tag) => {const nodes = find(tree, tag); assert.equal(nodes.length, 1, 'one ' + tag); return nodes[0];};
// Compare relationships by Unicode base characters while allowing standard mathematical alphabets.
// Exact authored text is checked separately from the raw parsed annotation, without normalization.
const textOf = node => node.tag === 'annotation' ? '' : (node.text + node.children.map(child => textOf(child) + child.tail).join('')).normalize('NFKC');
const tokens = tree => [...walk(tree)].filter(node => ['mi', 'mn', 'mo', 'mtext'].includes(node.tag) && !node.children.length).map(node => [node.tag, node.text.normalize('NFKC')]);
const rowTexts = tree => one(tree, 'mtable').children.filter(node => node.tag === 'mtr').map(row => row.children.filter(node => node.tag === 'mtd').map(textOf));

for (const {id, source, result} of records) {
  const annotations = find(trees.get(id), 'annotation');
  if (result.source.omitted) assert(!annotations.some(node => /(?:tex|utf16)/.test(node.attrs.encoding || '')), id + ': omitted source has no source carrier');
  else {
    const carriers = annotations.filter(node => node.attrs.encoding === result.source.encoding);
    assert.equal(carriers.length, 1, id + ': one declared exact-source carrier');
    if (result.source.encoding === 'application/x-tex') assert.equal(carriers[0].text, source, id + ': exact XML-decoded TeX including CRLF/BOM');
    else {
      assert.equal(result.source.encoding, 'application/x-rapier-tex-utf16');
      assert.match(carriers[0].text, /^(?:[\da-f]{4})*$/i);
      const original = (carriers[0].text.match(/.{4}/g) || []).map(value => String.fromCharCode(parseInt(value, 16))).join('');
      assert.equal(original, source, id + ': exact UTF-16 custody across invalid XML or CR-sensitive hosts');
      assert(!annotations.some(node => node.attrs.encoding === 'application/x-tex'), id + ': escaped substitute is never labelled original TeX');
    }
  }
}

assert.deepEqual(tokens(trees.get('unicode-numbers')).filter(([tag]) => tag === 'mn').map(([,value]) => value),
  ['12.3', '4', '١٢'], 'authored Unicode decimal digits retain numerical roles and grouping');
assert(tokens(trees.get('authored-invisible-operator')).some(([tag, value]) => tag === 'mo' && value === '\u2061'),
  'explicit invisible function application stays an operator');
const fraction = one(trees.get('fraction-roots'), 'mfrac');
assert.equal(fraction.children.length, 2);
assert.equal(textOf(fraction.children[0]), '12.5', 'numerator owns decimal token');
const rootNode = one(fraction.children[1], 'mroot');
assert.equal(rootNode.children.length, 2);
assert.equal(textOf(rootNode.children[1]), '3', 'root index is second child');
const nestedRoot = one(rootNode.children[0], 'msqrt');
const rootScripts = one(nestedRoot, 'msubsup');
assert.deepEqual(rootScripts.children.map(textOf), ['x', '2', '4'], 'script order is base/sub/sup');
assert.deepEqual(tokens(trees.get('numbers-signs')), [['mo', '−'], ['mn', '12.34'], ['mo', '+'], ['mn', '56'], ['mo', '−'], ['mn', '7']], 'signs stay operators and decimal digits stay one number');
const boundedNumbers = tokens(trees.get('number-boundaries'));
for (const forbidden of ['123', '45', '6.7.8', '2e3', '90']) assert(!boundedNumbers.some(([tag, text]) => tag === 'mn' && text === forbidden), 'no false number across explicit boundary: ' + forbidden);
assert(!boundedNumbers.some(([tag, text]) => tag === 'mn' && text.includes('.')), 'malformed multi-dot run never invents a decimal suffix');
assert(boundedNumbers.some(([tag, text]) => tag === 'mi' && text === 'e'), 'ordinary e is not guessed as scientific notation');
assert.deepEqual(find(trees.get('number-scripts'), 'msup').map(node => node.children.map(textOf)), [['12.3', '4'], ['2', '3'], ['5', '6']], 'numerical script bases coalesce only within their group/space boundary');
assert.equal(find(trees.get('scripts-inline'), 'munderover').length, 0, 'display-only limits are side scripts inline');
const sumLimits = one(trees.get('scripts-display'), 'munderover');
assert.deepEqual(sumLimits.children.map(textOf), ['∑', 'i=1', '20'], 'operator limits retain base/lower/upper order');
const explicitLimits = trees.get('explicit-limits');
assert.deepEqual(one(explicitLimits, 'munderover').children.map(textOf), ['∫', '0', '1'], 'explicit integral limits survive');
assert(find(explicitLimits, 'msubsup').some(node => textOf(node.children[0]) === '∑'), 'nolimits keeps side scripts');
const operatorTokens = tokens(trees.get('operators'));
for (const name of ['sin', 'arg max']) assert(operatorTokens.some(([tag, text]) => tag === 'mo' && text === name), 'one named-operator token: ' + name);
const overridden = trees.get('atom-class-limits');
assert(tokens(overridden).some(([tag, text]) => tag === 'mo' && text === 'x'), 'explicit simple relation class is retained');
assert(tokens(overridden).some(([tag, text]) => tag === 'mi' && text === 'y'), 'compound operator class preserves inner mathematical structure');
const fixedLimits = one(overridden, 'munderover');
assert.deepEqual(fixedLimits.children.map(textOf), ['∑', '0', '1']);
assert.equal(one(fixedLimits.children[0], 'mo').attrs.movablelimits, 'false', 'Core cannot undo explicit limits applied after scripts');
const decorations = trees.get('fences-accents');
assert.equal(textOf(one(decorations, 'mover').children[0]), 'x', 'accent owns its base');
assert.equal(textOf(one(decorations, 'munder').children[0]), 'y', 'under-accent owns its base');
assert.deepEqual(one(decorations, 'munderover').children.map(textOf), ['=', 'v', 'u'], 'under/over follows base/under/over order');
assert.deepEqual(rowTexts(trees.get('matrix')), [['1', '2'], ['3', '4']], 'matrix row/cell order');
assert.deepEqual(rowTexts(trees.get('cases')), [['x', 'x≥0'], ['−x', 'otherwise']], 'cases retain expression/condition pairing');
assert.deepEqual(rowTexts(trees.get('aligned')), [['a', '=b+c'], ['d', '=e']], 'alignment retains equation cells');
assert.deepEqual(rowTexts(trees.get('array-insertion')).map(row => row.join('')), ['x=1', 'y=2'], 'array insertions remain mathematical content');
assert(tokens(trees.get('style-text')).some(([tag, text]) => tag === 'mtext' && text === 'speed 12.5'), 'text is not retokenized as a product');
assert.deepEqual(one(trees.get('macro'), 'mfrac').children.map(textOf), ['12', '34'], 'macro-expanded mathematical relationships survive');
const explicit = tokens(trees.get('explicit-tokens'));
for (const expected of [['mi', 'speed'], ['mn', '12.34'], ['mo', 'lim'], ['mtext', 'word']]) assert(explicit.some(token => token[0] === expected[0] && token[1] === expected[1]), 'explicit token identity: ' + expected.join(':'));
const link = one(trees.get('links'), 'a');
assert.equal(link.attrs.href, 'https://example.com/?a=1&b=2');
assert.deepEqual(one(link, 'mfrac').children.map(textOf), ['x', '2'], 'link retains nested mathematical structure');
assert(find(trees.get('chemistry'), 'msub').some(node => textOf(node.children[1]) === '2'), 'chemistry retains lowered subscript structure');
assert(tokens(trees.get('chemistry')).some(([tag, text]) => tag === 'mo' && text === '→'), 'chemistry retains reaction-arrow presentation');
assert.equal(find(trees.get('physics-units'), 'mfrac').length, 1, 'derivative fraction is structured');
assert(find(trees.get('physics-units'), 'msup').some(node => textOf(node.children[0]) === '10' && textOf(node.children[1]) === '−3'), 'unit scientific notation retains lowered power structure');
assert(textOf(trees.get('tags-labels')).includes('A'), 'authored tag is retained');
assert(![...walk(trees.get('tags-labels'))].some(node => node.attrs.id || node.attrs.href), 'label does not invent equation identity or references');
assert.equal(textOf(one(trees.get('presentation'), 'mphantom')), 'a', 'intentional phantom content is not discarded');

for (const {id, tree} of parsed.hosts) {
  if (id === 'unsupported') continue;
  const descend = (node, hidden = false) => {
    const isHidden = hidden || node.attrs['aria-hidden'] === 'true';
    assert(!(isHidden && (node.attrs.href || (node.attrs.tabindex !== undefined && Number(node.attrs.tabindex) >= 0))), id + ': no focus target in hidden output');
    if (node.tag === 'svg') assert(isHidden, id + ': visual SVG excluded from duplicate announcements');
    if (node.tag === 'math') assert(!isHidden, id + ': semantic math remains exposed');
    for (const child of node.children) descend(child, isHidden);
  };
  descend(tree);
  if (id === 'links') {
    assert.equal(find(tree, 'svg').length, 0, 'linked composition exposes one native MathML presentation');
    assert.equal(find(tree, 'a').length, 1, 'one authored link produces one focus target');
  } else {
    assert.equal(find(tree, 'svg').length, 1);
    assert.equal(find(tree, 'math').length, 1);
  }
}

// Observe work in the exact classic body; counters delegate every real operation unchanged.
const work = {parses: 0, layoutVisits: 0, fontDecodes: 0};
let instrumented = classicSource;
for (const [signature, counter] of [['function parseMathTex(source) {', 'parses'], ['function mathLayout(n,c) {', 'layoutVisits']]) {
  assert.equal(instrumented.split(signature).length, 2, 'one known observation seam');
  instrumented = instrumented.replace(signature, signature + '\nglobalThis.__semanticWork.' + counter + '++;');
}
const observed = createContext({URL, __semanticWork: work, atob(value) {work.fontDecodes++; return atob(value);}});
new Script(instrumented, {filename: resources.bundle}).runInContext(observed);
const importFontDecodes = work.fontDecodes;
const formula = corpus[0].source;
Object.assign(work, {parses: 0, layoutVisits: 0, fontDecodes: 0});
assert.equal(observed.RapierMath.toMathML(formula).status, 'complete');
assert.deepEqual(work, {parses: 1, layoutVisits: 0, fontDecodes: 0}, 'semantic call parses once and performs no layout or lazy font decoding');
Object.assign(work, {parses: 0, layoutVisits: 0, fontDecodes: 0});
const combined = observed.RapierMath.renderWithMathML(formula);
assert.equal(combined.errors.length, 0);
assert.equal(work.parses, 1, 'combined SVG and MathML share one parse');
assert(work.layoutVisits > 0, 'combined probe exercises actual layout');
const combinedWork = {...work};

// Cold native semantic entry executes with font/network/DOM access guards, without a mocked renderer.
const cold = spawnSync(process.execPath, ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  for (const name of ['atob', 'fetch', 'document', 'window'])
    Object.defineProperty(globalThis, name, {configurable: true, get() {throw new Error('Unexpected semantic dependency: ' + name);}});
  const math = await import(process.argv[1]);
  const result = math.toMathML(process.argv[2]);
  assert.equal(result.status, 'complete');
  assert.equal(math.parse(process.argv[2]).type, 'row');
  process.stdout.write(JSON.stringify(result));
`, entry('./mathml'), formula], {encoding: 'utf8', maxBuffer: 2 * 1024 * 1024});
assert.equal(cold.status, 0, 'cold font-free native entry: ' + (cold.error?.message || cold.stderr));
assert.deepEqual(JSON.parse(cold.stdout), module.toMathML(formula), 'cold entry preserves real semantic output');

console.log(JSON.stringify({name: pkg.name, version: module.version, runtime: process.version,
  xml: {python: parsed.python, lxml: parsed.xml, libxml: parsed.libxml}, corpus: corpus.length,
  sourceOmissions: 2, sourceCustody: 'exact after XML parsing; reversible UTF-16 carrier for invalid XML',
  entryAgreement: 'native ESM, classic, font-free ESM, combined render',
  composition: 'one exposed semantic presentation; no hidden or duplicate authored link focus targets',
  work: {fullImportFontDecodes: importFontDecodes, standaloneCall: {parses: 1, layoutVisits: 0, fontDecodes: 0}, combined: combinedWork},
  coldSemanticEntry: 'no font, network or DOM access', assistiveTechnology: 'not exercised'}));
