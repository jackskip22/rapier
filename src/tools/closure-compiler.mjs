// SPDX-License-Identifier: AGPL-3.0-only
import {createRequire} from 'node:module';
import acorn from '../agent/vendor/acorn.mjs';
import {lexicalBindings} from './engine-census.mjs';
const {minify} = createRequire(import.meta.url)('./vendor/terser/bundle.min.js');

export const localCompression = {
  reduce_vars: false, reduce_funcs: false, collapse_vars: false, inline: false,
  hoist_funs: false, hoist_vars: false, unused: false,
  keep_fnames: true, keep_classnames: true,
};
const optimizing = {keep_fargs: true, keep_fnames: true, keep_classnames: true};
const factoryOwners = new Set(['artifactFactories', 'workerFactories']);
const rootMarker = '__RAPIER_COMPILE_ROOTS__';
const functionTypes = new Set(['Function', 'Arrow', 'Defun']);

function walk(ast, visit) {
  ast.walk({_visit(node, descend) {
    visit(node);
    if (descend) descend.call(node);
  }});
}
function relocatedFunctions(ast, names) {
  const nodes = new Set();
  walk(ast, node => {
    if (node.TYPE === 'Defun' && names.has(node.name?.name)) nodes.add(node);
    if (node.TYPE === 'VarDef' && names.has(node.name?.name) && functionTypes.has(node.value?.TYPE)) nodes.add(node.value);
    if (node.TYPE === 'Assign' && factoryOwners.has(node.left.expression?.name) && functionTypes.has(node.right.TYPE)) nodes.add(node.right);
  });
  return nodes;
}

function retainDisconnected(source, names) {
  const tree = acorn.parse(source, {ecmaVersion: 'latest', locations: true});
  const lexical = lexicalBindings(tree), references = new Map(), edits = [];
  if (lexical.nodes.some(node => node.type === 'Identifier' && node.name === rootMarker))
    throw new Error('Source collides with the compiler liveness marker');
  const ids = pattern => pattern.type === 'Identifier' ? [pattern.name]
    : pattern.type === 'ObjectPattern' ? pattern.properties.flatMap(row => ids(row.value || row.argument))
    : pattern.type === 'ArrayPattern' ? pattern.elements.filter(Boolean).flatMap(ids)
    : pattern.type === 'AssignmentPattern' ? ids(pattern.left)
    : pattern.type === 'RestElement' ? ids(pattern.argument) : [];
  for (const node of lexical.nodes) if (lexical.isReference(node)) {
    const binding = lexical.bindingAt(node.name, node);
    if (binding) {
      if (!references.has(binding)) references.set(binding, []);
      references.get(binding).push(node);
    }
  }
  const assemblyScope = node => {
    if (node.type === 'Program') return true;
    if (!/Function(?:Declaration|Expression)$/.test(node.type) || node.body.type !== 'BlockStatement') return false;
    const parent = lexical.parents.get(node);
    return node.type === 'FunctionDeclaration' && names.has(node.id?.name)
      || parent?.type === 'CallExpression' && parent.callee === node
      || parent?.type === 'AssignmentExpression'
      || parent?.type === 'VariableDeclarator' && names.has(parent.id?.name);
  };
  for (const scope of lexical.nodes.filter(assemblyScope)) {
    const body = scope.type === 'Program' ? scope.body : scope.body.body;
    const rows = [], byBinding = new Map(), byNode = new Map();
    const add = (node, names) => {
      const row = {node, names, edges: new Set()};
      rows.push(row); byNode.set(node, row);
      for (const name of names) {
        const binding = lexical.bindingAt(name, node);
        if (binding) byBinding.set(binding, row);
      }
    };
    for (const node of body) {
      if (['FunctionDeclaration', 'ClassDeclaration'].includes(node.type)) add(node, [node.id.name]);
      else if (node.type === 'VariableDeclaration') for (const declaration of node.declarations) add(declaration, ids(declaration.id));
      else add(node, []);
    }
    for (const [binding, target] of byBinding) for (const node of references.get(binding) || []) {
      let owner = node;
      while (owner && !byNode.has(owner)) owner = lexical.parents.get(owner);
      if (owner) byNode.get(owner).edges.add(target);
    }
    const live = new Set(rows.filter(row => !row.names.length));
    for (const row of live) for (const next of row.edges) live.add(next);
    const retained = rows.filter(row => !live.has(row)).flatMap(row => row.names);
    for (const binding of byBinding.keys()) if (factoryOwners.has(binding.name) || binding.name === 'modules') retained.push(binding.name);
    if (!retained.length) continue;
    let position = scope.type === 'Program' ? 0 : scope.body.start + 1;
    for (const node of body) { if (node.directive) position = node.end; else break; }
    edits.push([position, rootMarker + '(()=>[' + retained.join(',') + ']);']);
  }
  for (const [position, text] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, position) + text + source.slice(position);
  return source;
}

const syntax = {ast: true, code: false};
async function parse(source) {
  return (await minify(source, {compress: false, mangle: false, format: syntax})).ast;
}

function sealUnit(node) {
  node.transform = function () { return this; };
  node.pinned = () => true;
}
function unsealUnit(node) { delete node.transform; delete node.pinned; }

async function compileUnit(node, format) {
  let program, result;
  if (node.TYPE === 'Defun') {
    program = await parse('function unit() {}');
    program.body[0] = node;
    result = (await minify(program, {compress: optimizing, mangle: false, rename: false, format: {...format, ...syntax}})).ast.body
      .find(row => row.TYPE === 'Defun' && row.name.name === node.name.name);
  } else {
    program = await parse('__RAPIER_COMPILE_VALUE__ = () => {};');
    program.body[0].body.right = node;
    const compiled = await minify(program, {compress: optimizing, mangle: false, rename: false, format: {...format, ...syntax}});
    result = compiled.ast.body[0].body.right;
  }
  if (!result || !functionTypes.has(result.TYPE)) throw new Error('A relocated compilation unit must remain a function');
  node.body = result.body;
  node.argnames = result.argnames;
}

const partMark = /\n__RAPIER_PART__\("([a-z]+)"\);\n/;
export async function compileProgram(source, names, format, {toplevel = false, reserved = []} = {}) {
  const [first, ...rest] = source.split(partMark);
  const ast = await optimize(first, names, format);
  for (let at = 0; at < rest.length; at += 2) {
    const slice = await optimize("'use strict';\n" + rest[at + 1], names, format);
    ast.body.push((await parse('__RAPIER_PART__(' + JSON.stringify(rest[at]) + ');')).body[0], ...slice.body);
  }
  return nameProgram(ast, names, format, {toplevel, reserved});
}

async function optimize(source, names, format) {
  source = retainDisconnected(source, names);
  let {ast} = await minify(source, {compress: localCompression, mangle: false, format: {...format, ...syntax}});
  const units = relocatedFunctions(ast, names);
  for (const node of [...units].reverse()) { await compileUnit(node, format); sealUnit(node); }
  ({ast} = await minify(ast, {compress: optimizing, mangle: false, rename: false, format: {...format, ...syntax}}));
  const present = new Set(); walk(ast, node => present.add(node));
  for (const node of units) {
    if (!present.has(node)) throw new Error('A relocated compilation unit was duplicated or removed');
    unsealUnit(node);
  }

  const zero = (await parse('0;')).body[0].body;
  walk(ast, node => {
    if (node.TYPE === 'Call' && node.expression.name === rootMarker) node.transform = () => zero.clone();
  });
  ({ast} = await minify(ast, {compress: localCompression, mangle: false, rename: false, format: {...format, ...syntax}}));
  return ast;
}

async function nameProgram(ast, names, format, {toplevel, reserved}) {
  ast.figure_out_scope();
  const retained = new Set();
  walk(ast, node => {
    if (node.TYPE === 'Assign' && (factoryOwners.has(node.left.expression?.name) || node.left.expression?.name === 'modules'))
      retained.add(node.left.expression.definition());
    if (node.TYPE === 'VarDef' && names.has(node.name?.name) && functionTypes.has(node.value?.TYPE))
      retained.add(node.name.definition());
  });
  for (const unit of relocatedFunctions(ast, names)) {
    if (unit.name) retained.add(unit.name.definition());
    walk(unit, node => {
      if (node.TYPE !== 'SymbolRef') return;
      const binding = node.definition();
      let scope = binding.scope;
      while (scope && scope !== unit) scope = scope.parent_scope;
      if (!scope) retained.add(binding);
    });
  }
  for (const binding of retained) binding.export |= 1;
  ast.figure_out_scope = () => {};
  try {
    return await minify(ast, {compress: false, mangle: {keep_classnames: true, toplevel, reserved}, rename: false, format: {...format, ast: true}});
  } finally { delete ast.figure_out_scope; }
}
