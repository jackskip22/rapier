// Test mechanics only. Production declarations always come from their actual owner.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import acorn from '../agent/vendor/acorn.mjs';

export const engineURL = new URL('../editor/engine.js', import.meta.url);
// A row asks for many independent declaration sets from the same literal source. Index
// that source once, keeping ambiguity, and still execute each set in a fresh VM. Exact
// source keys invalidate immediately after a mutation; the bounded cache retains no AST.
const declarationIndexes = new Map();
function declarationIndex(source, sourceType = 'script') {
  if (declarationIndexes.has(source)) return declarationIndexes.get(source);
  const found = new Map();
  const walk = node => {
    if (!node || typeof node.type !== 'string') return;
    const name = node.type === 'FunctionDeclaration' ? node.id?.name
      : node.type === 'VariableDeclarator' ? node.id?.name : null;
    if (name) {
      found.set(name, found.has(name) ? null : (node.type === 'VariableDeclarator' ? 'const ' : '') + source.slice(node.start, node.end) + '\n');
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  };
  walk(acorn.parse(source, {ecmaVersion: 'latest', sourceType}));
  if (declarationIndexes.size === 8) declarationIndexes.delete(declarationIndexes.keys().next().value);
  declarationIndexes.set(source, found);
  return found;
}
// The renderer's owners live in kit/ (the editor binds them through editor/render-host.js): an engine declaration
// that only delegates to an owner, or one the engine no longer holds, is read from that owner, so a harness keeps
// exercising the code that runs rather than a forwarding stub.
const RENDER_OWNERS = ['render-markdown', 'render', 'render-styles', 'render-sanitize', 'render-print', 'render-work'];
const RENDER_ALIASES = {Markdown: 'render-markdown', Print: 'render-print', Sanitizer: 'render-sanitize', Styles: 'render-styles'};
function ownerDeclaration(owner, name) {
  const found = declarationIndex(readFileSync(new URL('../kit/' + owner + '.mjs', import.meta.url), 'utf8'), 'module');
  return found.get(name);
}
function renderOwnerDeclaration(declaration, name, engine) {
  // A forwarding stub is one line: function name(...) { ... _rapierRenderModule('owner') ... }
  const delegated = declaration?.match(/^function [\w$]+\([^)]*\) \{[^\n]*_rapierRenderModule\(['"]([^'"]+)['"]\)[^\n]*\}\n?$/);
  if (delegated) return ownerDeclaration(delegated[1], name);
  const alias = declaration?.match(/^const \w+ = globalThis\.RapierRender(Markdown|Print|Sanitizer|Styles)\./);
  if (alias) return ownerDeclaration(RENDER_ALIASES[alias[1]], name) ?? declaration;
  if (declaration === undefined && engine) {
    for (const owner of RENDER_OWNERS) { const found = ownerDeclaration(owner, name); if (found) return found; }
  }
  return declaration;
}
export function declarations(source, names) {
  const found = declarationIndex(source), engine = source.includes('/* RAPIER_RENDER_MODULE */');
  const resolved = new Map(names.map(name => [name, renderOwnerDeclaration(found.get(name), name, engine)]));
  for (const name of names) if (resolved.get(name) === undefined) throw new Error('Missing declaration: ' + name);
  for (const name of names) if (resolved.get(name) === null) throw new Error('Ambiguous declaration: ' + name);
  const helpers = /(?<![\w.$])((?:_rapier[A-Za-z0-9_]*Steps)|finish|finishAsync|cloneTree|htmlParts|cleanTree|serializeTree|encodeUtf8Steps|pause|check)\s*\(/g;
  for (const declaration of resolved.values()) for (const match of declaration.matchAll(helpers)) {
    const name = match[1];
    if (resolved.has(name)) continue;
    const own = name.startsWith('_rapier') ? renderOwnerDeclaration(found.get(name), name, true) : ownerDeclaration('render-work', name);
    if (own) resolved.set(name, own);
  }
  return [...resolved.values()].join('\n');
}
export async function loadSatellite(path, names, engine = false, bindings = {}) {
  if (!engine) return import(new URL('../editor/' + path, import.meta.url));
  const source = declarations(readFileSync(engineURL, 'utf8'), names);
  return vm.runInNewContext(source + '\n({' + names.join(',') + '})', bindings);
}

// Evaluate the exact concatenation terms from the real worker builder that publish these
// helpers. No reconstructed serializer, unrelated worker handlers or dependency stubs.
export function workerHelpers(bindings) {
  const source = declarations(readFileSync(engineURL, 'utf8'), ['_buildParseWorkerSource']);
  const tree = acorn.parse(source, {ecmaVersion: 'latest'});
  const returned = tree.body[0].body.body.find(node => node.type === 'ReturnStatement').argument;
  const terms = [];
  const flatten = node => {
    if (node.type === 'BinaryExpression' && node.operator === '+') { flatten(node.left); flatten(node.right); }
    else terms.push(node);
  };
  flatten(returned);
  const used = new Set(), pieces = [];
  // Each literal publication prefix, helper/constant and suffix is kept byte-for-byte.
  for (let index = 0; index < terms.length; index++) {
    const node = terms[index];
    const name = node.type === 'Identifier' ? node.name
      : node.type === 'CallExpression' && node.callee.type === 'MemberExpression'
        && node.callee.property.name === 'toString' ? node.callee.object.name : null;
    if (!Object.hasOwn(bindings, name)) continue;
    if (terms[index - 1]?.type !== 'Literal' || terms[index + 1]?.type !== 'Literal')
      throw new Error('Worker publication shape changed: ' + name);
    pieces.push(vm.runInNewContext(source.slice(terms[index - 1].start, terms[index + 1].end), bindings));
    used.add(name);
  }
  for (const name of Object.keys(bindings)) if (!used.has(name)) throw new Error('Worker no longer projects ' + name);
  const projected = pieces.join('');
  const context = {};
  context.self = context;
  vm.createContext(context);
  vm.runInContext(projected, context);
  // Some publications deliberately use __ names, followed by literal public aliases. Execute
  // those exact emitted terms only when they alias a helper this projection actually supplied.
  for (const term of terms) {
    if (term.type !== 'Literal' || typeof term.value !== 'string') continue;
    let statements;
    try { statements = acorn.parse(term.value, {ecmaVersion: 'latest'}).body.filter(node => node.type !== 'EmptyStatement'); }
    catch { continue; }
    const assignment = statements.length === 1 && statements[0].type === 'ExpressionStatement' && statements[0].expression;
    const selfMember = node => node?.type === 'MemberExpression' && !node.computed && node.object.type === 'Identifier'
      && node.object.name === 'self' && node.property.type === 'Identifier';
    if (assignment?.type === 'AssignmentExpression' && assignment.operator === '=' && selfMember(assignment.left)
        && selfMember(assignment.right) && Object.hasOwn(bindings, assignment.left.property.name)
        && Object.hasOwn(context, assignment.right.property.name)) vm.runInContext(term.value, context);
  }
  return vm.runInContext('({' + Object.keys(bindings).join(',') + '})', context);
}
export const plain = value => structuredClone(value);
