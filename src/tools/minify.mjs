// SPDX-License-Identifier: AGPL-3.0-only
// Whitespace out, private names shortened, class names kept, comments out except licence notices, nothing moved between functions.
// A function whose own text the page reads back (.toString(), Function.prototype.toString.call, artifactFactories, backupFactories) keeps its
// name and free names; the build refuses otherwise. Arbitrary dynamic reflection is not recognised.
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {symbolMap} from './runtime-symbols.mjs';
import acorn from '../agent/vendor/acorn.mjs';
const {minify} = createRequire(import.meta.url)('./vendor/terser/bundle.min.js');
const parseCSS = createRequire(import.meta.url)('./vendor/postcss-parse.cjs');
const parse = source => acorn.parse(source, {ecmaVersion: 'latest'});
const factoryOwners = new Set(['artifactFactories', 'backupFactories']);
function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => walk(child, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
export function reflectedNames(trees) {
  const names = new Set(), aliases = [];
  const add = target => {
    if (target?.type === 'Identifier') names.add(target.name);
    else if (target?.type === 'MemberExpression' && !target.computed) names.add(target.property.name);
  };
  for (const tree of trees) walk(tree, node => {
    if (node.type === 'CallExpression' && !node.arguments.length && node.callee.type === 'MemberExpression' && node.callee.property.name === 'toString') add(node.callee.object);
    if (node.type === 'CallExpression' && node.arguments.length === 1 && node.callee.type === 'MemberExpression' && node.callee.property.name === 'call') {
      const owner = node.callee.object;
      if (owner.type === 'MemberExpression' && owner.property.name === 'toString' && owner.object.type === 'MemberExpression' && owner.object.property.name === 'prototype' && owner.object.object.name === 'Function') add(node.arguments[0]);
    }
    if (node.type === 'VariableDeclarator' && node.id.type === 'ObjectPattern')
      for (const row of node.id.properties) if (row.type === 'Property' && row.key.type === 'Identifier' && row.value.type === 'Identifier') aliases.push([row.value.name, row.key.name]);
  });
  for (let changed = true; changed;) {
    changed = false;
    for (const [local, exported] of aliases) if (names.has(local) && !names.has(exported)) { names.add(exported); changed = true; }
  }
  return names;
}
function reflectedFunctions(tree, names) {
  const out = new Map();
  const add = (name, node) => { let key = name; while (out.has(key)) key += '#'; out.set(key, node); };
  walk(tree, node => {
    if (node.type === 'FunctionDeclaration' && names.has(node.id.name)) add(node.id.name, node);
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && names.has(node.id.name) && /^(?:Arrow)?FunctionExpression$/.test(node.init?.type)) add(node.id.name, node.init);
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && factoryOwners.has(node.left.object.name) && /^(?:Arrow)?FunctionExpression$/.test(node.right.type)) add(node.left.object.name + ':' + node.left.property.value, node.right);
  });
  return out;
}
// CSS in a template literal (PostCSS reads it, substitutions as comments) loses its non-licence comments; changed rules refuse the build.
function cssRules(literal) {
  let root;
  try { root = parseCSS(literal.quasis.map(quasi => quasi.value.cooked).join('/**/')); } catch (_) { return null; }
  if (!root.nodes.some(node => node.type === 'rule' || node.type === 'atrule')) return null;
  const rows = [];
  root.walk(node => { if (node.type !== 'comment') rows.push([node.type, node.selector, node.prop, node.value, node.important, node.name, node.params].join('\u0001')); });
  return rows.join('\u0002');
}
function dropTemplateCssComments(source, keepsComment, filename) {
  const literals = tree => { const found = []; walk(tree, node => { if (node.type === 'TemplateLiteral') found.push(node); }); return found; };
  const before = literals(parse(source)), cuts = [], changed = new Map();
  before.forEach((literal, index) => {
    if (!literal.quasis.some(quasi => quasi.value.raw.includes('/*'))) return;
    const rules = cssRules(literal);
    if (rules === null) return;
    for (const quasi of literal.quasis) for (const m of quasi.value.raw.matchAll(/(\n[ \t]*)?\/\*([\s\S]*?)\*\//g))
      if (!keepsComment(m[2])) { cuts.push([quasi.start + m.index, quasi.start + m.index + m[0].length]); changed.set(index, rules); }
  });
  if (!cuts.length) return source;
  for (const [start, end] of cuts.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + source.slice(end);
  const after = literals(parse(source));
  for (const [index, rules] of changed) if (cssRules(after[index]) !== rules)
    throw new Error(filename + ': CSS in a template literal changed beyond its comments (at offset ' + before[index].start + ')');
  return source;
}
async function freeNames(source) {
  const {ast} = await minify('(' + source + ')', {compress: false, mangle: false, format: {ast: true, code: false}});
  ast.figure_out_scope();
  return [...ast.globals.keys()];
}

// `sources` is every shipped source file's text: a function defined in one span may be reflected
// from another (the editor writes the parse worker from the shared bundle's own functions).
export function scriptMinifier(sources, keepsComment) {
  const names = reflectedNames(sources.map(parse)), maps = {};
  const format = {comments: (_, row) => keepsComment(row.value)};
  const lean = async function lean(source, filename) {
    source = dropTemplateCssComments(source, keepsComment, filename);
    const tree = parse(source), localNames = new Set([...names, ...reflectedNames([tree])]);
    const before = reflectedFunctions(tree, localNames), reserved = new Set([...localNames, ...factoryOwners, 'modules']), free = new Map();
    for (const [name, fn] of before) {
      const refs = await freeNames(source.slice(fn.start, fn.end));
      free.set(name, new Set(refs));
      for (const ref of refs) reserved.add(ref);
    }
    const {code, ast} = await minify(source, {
      // Nothing may cross a function boundary: a relocated function must not acquire a dependency
      // from the closure it was compiled in, and nothing unreferenced is dropped.
      compress: {reduce_vars: false, reduce_funcs: false, collapse_vars: false, inline: false, hoist_funs: false, hoist_vars: false, unused: false, keep_fnames: true, keep_classnames: true},
      mangle: {keep_classnames: true, reserved: [...reserved]},
      format: {...format, ast: true},
    });
    new vm.Script(code, {filename});
    const after = reflectedFunctions(parse(code), localNames);
    for (const [name, refs] of free) {
      const fn = after.get(name);
      if (!fn) throw new Error(filename + ': serialized function disappeared: ' + name);
      for (const ref of await freeNames(code.slice(fn.start, fn.end))) if (!refs.has(ref))
        throw new Error(filename + ': serialized function acquired a free binding: ' + name + ' -> ' + ref);
    }
    maps[filename] = symbolMap(ast, code, format);
    return code;
  };
  lean.symbols = maps;
  return lean;
}
