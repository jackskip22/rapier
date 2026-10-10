// An independent implementation of the documented direct-HTML-sink census. This is static
// inventory evidence, not a taint analysis or proof that the value entering each sink is safe.
import {readFileSync, readdirSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import acorn from '../agent/vendor/acorn.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RENDER_OWNERS = ['kit/render-work.mjs', 'kit/render.mjs', 'kit/render-markdown.mjs', 'kit/render-styles.mjs', 'kit/render-sanitize.mjs', 'kit/render-print.mjs'];
const DIRECTORIES = ['agent', 'draw', 'editor', 'images', 'interchange', 'layout', 'notes', 'security', 'shell', 'reader'];
const ASSIGNMENTS = new Set(['innerHTML', 'outerHTML', 'srcdoc']);
const METHODS = new Set(['insertAdjacentHTML', 'createContextualFragment']);
const KINDS = new Set(['sanitized-document', 'static-template', 'probe', 'untrusted-parse', 'empty']);
const functionNode = node => ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type);

// Resolve syntax constants only; no evaluation, local-variable inference, or runtime execution.
function constant(node) {
  if (node?.type === 'Literal') return typeof node.value === 'string' ? node.value : null;
  if (node?.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
  if (node?.type === 'BinaryExpression' && node.operator === '+') {
    const left = constant(node.left), right = constant(node.right);
    return left !== null && right !== null ? left + right : null;
  }
  return null;
}
function key(node) { return node.computed ? constant(node.property || node.key) : (node.property || node.key)?.name || constant(node.key); }
function named(node, parent) {
  if (node.id?.name) return node.id.name;
  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  if (['Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent?.type)) return key(parent);
  if (parent?.type === 'AssignmentExpression') return parent.left.type === 'Identifier' ? parent.left.name : parent.left.type === 'MemberExpression' ? key(parent.left) : null;
  return null;
}
function documentObject(node) {
  return node?.type === 'Identifier' && node.name === 'document' ||
    node?.type === 'MemberExpression' && key(node) === 'document' && node.object.type === 'Identifier' && ['window', 'globalThis'].includes(node.object.name);
}

export function scanSinksAST(source, sourceType = 'module') {
  const tree = acorn.parse(source, {ecmaVersion: 'latest', sourceType, locations: true});
  const sinks = [], stack = [{node: tree, parent: null, owner: '(top level)'}];
  let computedMembers = 0, dynamicParseMime = 0;
  while (stack.length) {
    const frame = stack.pop(), {node, parent} = frame;
    const owner = functionNode(node) ? named(node, parent) || frame.owner : frame.owner;
    let sink = null;
    if (node.type === 'MemberExpression' && node.computed && key(node) === null) computedMembers++;
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && ASSIGNMENTS.has(key(node.left))) sink = key(node.left);
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      const method = key(node.callee);
      if (METHODS.has(method)) sink = method;
      if (['write', 'writeln'].includes(method) && documentObject(node.callee.object)) sink = method;
      if (method === 'parseFromString') {
        const mime = constant(node.arguments[1]);
        if (mime?.toLowerCase() === 'text/html') sink = method;
        if (mime === null) dynamicParseMime++;
      }
    }
    if (sink) sinks.push({owner, sink, line: node.loc.start.line, column: node.loc.start.column});
    const children = [];
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) { for (const child of value) if (child?.type) children.push(child); }
      else if (value?.type) children.push(value);
    }
    for (let i = children.length - 1; i >= 0; i--) stack.push({node: children[i], parent: node, owner});
  }
  return {sinks, computedMembers, dynamicParseMime};
}

function sourceFiles(root) {
  const result = ['tools/runtime-loader.js'];
  const visit = directory => {
    for (const entry of readdirSync(join(root, directory), {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const name = join(directory, entry.name);
      if (entry.isDirectory() && !['vendor', 'node_modules'].includes(entry.name)) visit(name);
      else if (entry.isFile() && /\.(js|mjs)$/.test(entry.name)) result.push(name);
    }
  };
  for (const directory of DIRECTORIES) visit(directory);
  // The renderer's owners ship in the page from kit/ (the rest of kit/ is the npm package alone).
  result.push(...RENDER_OWNERS);
  return result.sort();
}

// Harmless syntax fixtures exercise every documented category and named-owner shape. These
// snippets are parsed only, never run. Negative rows are reads, text, XML, and unrelated writes.
export function checkScannerFixtures() {
  const fixtures = [
    ['properties', "function render(){ host.innerHTML='<p>caption</p>'; host.outerHTML=''; frame.srcdoc=''; }", ['render:innerHTML', 'render:outerHTML', 'render:srcdoc']],
    ['calls', "function render(){ host.insertAdjacentHTML('beforeend',''); document.write(''); document.writeln(''); range.createContextualFragment(''); new DOMParser().parseFromString('<p>caption</p>','text/html'); }", ['render:insertAdjacentHTML', 'render:write', 'render:writeln', 'render:createContextualFragment', 'render:parseFromString']],
    ['callback owner', "function render(){ values.map(v=>{ host.innerHTML=''; }); }", ['render:innerHTML']],
    ['variable owner', "const render=()=>{host.innerHTML='';};", ['render:innerHTML']],
    ['object owner', "const view={render(){host.innerHTML='';}};", ['render:innerHTML']],
    ['class owner', "class View { render(){host.innerHTML='';} }", ['render:innerHTML']],
    ['assignment owner', "view.render=function(){host.innerHTML='';};", ['render:innerHTML']],
    ['named expression', "const render=function named(){host.innerHTML='';};", ['named:innerHTML']],
    ['anonymous wrapper', "(()=>{host.innerHTML='';})();", ['(top level):innerHTML']],
    ['static computed', "function render(){host['innerHTML']=''; host[`outerHTML`]=''; host['src'+'doc']='';}", ['render:innerHTML', 'render:outerHTML', 'render:srcdoc']],
    ['global document', "window.document.write(''); globalThis['document'].writeln('');", ['(top level):write', '(top level):writeln']],
    ['constant mime', "parser.parseFromString('<p>caption</p>',`text/html`); parser.parseFromString('<p>caption</p>','text/'+'html');", ['(top level):parseFromString', '(top level):parseFromString']],
    ['negative categories', "const sample='host.innerHTML'; const read=host.innerHTML; host.textContent='caption'; store.write('caption'); parser.parseFromString('<svg/>','image/svg+xml');", []],
    ['computed method owner', "const view={['render'](){host.innerHTML='';}};", ['render:innerHTML']],
    ['nested owner', "function outer(){function inner(){host.innerHTML='';} host.outerHTML='';}", ['inner:innerHTML', 'outer:outerHTML']],
    ['read comment', "/* host.innerHTML='' */ const sample=`document.write('')`;", []],
  ];
  for (const [name, source, expected] of fixtures) assert.deepEqual(scanSinksAST(source).sinks.map(row => row.owner + ':' + row.sink), expected, name);
  return fixtures.length;
}

export function checkSinksAST(root = ROOT) {
  const started = performance.now(), fixtures = checkScannerFixtures();
  const inventory = JSON.parse(readFileSync(join(root, 'security/html-sinks.json'), 'utf8')).sinks;
  const census = {}, sites = [], problems = [];
  let filesScanned = 0, computedMembers = 0, dynamicParseMime = 0;
  for (const path of sourceFiles(root)) {
    filesScanned++;
    const file = relative(root, join(root, path)).split('\\').join('/');
    const scan = scanSinksAST(readFileSync(join(root, path), 'utf8'), path.endsWith('.mjs') ? 'module' : 'script');
    computedMembers += scan.computedMembers;
    dynamicParseMime += scan.dynamicParseMime;
    for (const site of scan.sinks) {
      sites.push({file, ...site});
      (census[file] ||= {})[site.owner] = (census[file][site.owner] || 0) + 1;
    }
  }
  for (const file of new Set([...Object.keys(census), ...Object.keys(inventory)])) {
    for (const owner of new Set([...Object.keys(census[file] || {}), ...Object.keys(inventory[file] || {})])) {
      const actual = census[file]?.[owner] || 0, expected = inventory[file]?.[owner];
      if (actual !== (expected?.count || 0)) problems.push(`${file} / ${owner}: AST ${actual}, inventory ${expected?.count || 0}`);
      if (expected && (!KINDS.has(expected.kind) || typeof expected.reason !== 'string' || expected.reason.length < 20)) problems.push(`${file} / ${owner}: undecided kind or missing reason`);
    }
  }
  return {fixtures, total: sites.length, files: Object.keys(census).length, filesScanned, computedMembers, dynamicParseMime, census, sites, problems, ms: Math.round(performance.now() - started)};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkSinksAST();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    for (const problem of result.problems) console.error(problem);
    console.log(`${result.fixtures + (result.problems.length ? 0 : 1)} passed, ${result.problems.length} failed; independent AST: ${result.total} sinks / ${result.files} files (${result.filesScanned} scanned), ${result.ms} ms; ${result.computedMembers} dynamic computed members outside resolution, ${result.dynamicParseMime} unresolved parse MIME values`);
  }
  process.exitCode = result.problems.length ? 1 : 0;
}
