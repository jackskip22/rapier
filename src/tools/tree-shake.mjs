// SPDX-License-Identifier: AGPL-3.0-only
// shakeModule(source, drop): unexports `drop` and removes declarations only they reach. A declaration nothing reaches is unfinished work
// and stays (docs/intent.md, "Nothing comes out of Rapier"). Resolution by scope (engine-census.mjs lexicalBindings). Imports untouched.
import acorn from '../agent/vendor/acorn.mjs';
import {lexicalBindings} from './engine-census.mjs';

// The module's top-level units: a function or class declaration, one declarator of a variable
// declaration, or any other statement (whose effects make it a root). An `export {...}` list is not
// a unit; its entries are listed as specifiers.
function units(source) {
  const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true});
  const lexical = lexicalBindings(ast), rows = [], byName = new Map(), byNode = new Map();
  const add = (node, statement, names, declarator = null) => {
    const unit = {node, statement, names, declarator, edges: new Set()};
    rows.push(unit); byNode.set(node, unit);
    for (const name of names) byName.set(name, unit);
  };
  const ids = pattern => pattern.type === 'Identifier' ? [pattern.name]
    : pattern.type === 'ObjectPattern' ? pattern.properties.flatMap(row => ids(row.value || row.argument))
    : pattern.type === 'ArrayPattern' ? pattern.elements.filter(Boolean).flatMap(ids)
    : pattern.type === 'AssignmentPattern' ? ids(pattern.left) : pattern.type === 'RestElement' ? ids(pattern.argument) : [];
  for (const statement of ast.body) {
    if (statement.type === 'ExportNamedDeclaration' && !statement.declaration) continue;
    const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') add(node, statement, [node.id.name]);
    else if (node.type === 'VariableDeclaration') for (const row of node.declarations) add(row, statement, ids(row.id), node);
    else if (node.type !== 'ImportDeclaration') add(node, statement, []);
  }
  // An edge from the unit a reference sits in to the top-level unit that binds the name.
  for (const node of lexical.nodes) {
    if (!lexical.isReference(node) || !byName.has(node.name) || lexical.bindingAt(node.name, node)?.scope.kind !== 'program') continue;
    let at = node, owner = null;
    while (at && !owner) { owner = byNode.get(at) || null; at = lexical.parents.get(at); }
    if (owner) owner.edges.add(byName.get(node.name));
  }
  const specifiers = ast.body.filter(statement => statement.type === 'ExportNamedDeclaration' && !statement.declaration)
    .flatMap(statement => statement.specifiers.map(row => ({statement, row, local: row.local.name, exported: row.exported.name})));
  return {rows, byName, specifiers};
}
const reach = seeds => { const seen = new Set(seeds); for (const unit of seen) for (const next of unit.edges) seen.add(next); return seen; };

// Returns the module's source without what it may leave out, the names whose declarations went
// (`removed`) and the names in `drop` it no longer exports (`unexported`): an export the module still
// uses keeps its declaration and loses only its `export`, unless it shares a declaration with an
// export that stays, which keeps it exported.
export function shakeModule(source, drop) {
  const {rows, byName, specifiers} = units(source);
  const dropping = new Set(drop);
  const local = name => specifiers.find(row => row.exported === name)?.local ?? name;
  const dropped = new Set([...dropping].map(local).filter(name => byName.has(name)).map(name => byName.get(name)));
  const exportedStill = unit => (unit.statement.type === 'ExportNamedDeclaration' && !dropped.has(unit)) ||
    specifiers.some(row => unit.names.includes(row.local) && !dropping.has(row.exported));
  const live = reach(rows.filter(unit => exportedStill(unit) || !unit.names.length)), fromDropped = reach(dropped);
  // A declaration nothing reaches -- not the kept roots, not the dropped ones -- is kept, and so is
  // everything it reaches.
  const kept = reach([...live, ...rows.filter(unit => !live.has(unit) && !fromDropped.has(unit))]);
  const edits = [], exportedNow = new Set();
  for (const statement of new Set(rows.map(unit => unit.statement))) {
    const members = rows.filter(unit => unit.statement === statement), stay = members.filter(unit => kept.has(unit));
    const isExport = statement.type === 'ExportNamedDeclaration', keepExport = isExport && stay.some(unit => !dropped.has(unit));
    if (keepExport) stay.forEach(unit => unit.names.forEach(name => exportedNow.add(name)));
    if (!stay.length) { edits.push([statement.start, statement.end, '']); continue; }
    const declaration = isExport ? statement.declaration : statement;
    if (stay.length < members.length) {
      edits.push([statement.start, statement.end, (keepExport ? 'export ' : '') + declaration.kind + ' ' + stay.map(unit => source.slice(unit.node.start, unit.node.end)).join(', ') + ';']);
    } else if (isExport && !keepExport) edits.push([statement.start, declaration.start, '']);
  }
  for (const statement of new Set(specifiers.map(row => row.statement))) {
    const rowsHere = specifiers.filter(row => row.statement === statement), stay = rowsHere.filter(row => !dropping.has(row.exported));
    stay.forEach(row => exportedNow.add(row.exported));
    if (stay.length === rowsHere.length) continue;
    edits.push([statement.start, statement.end, stay.length ? 'export {' + stay.map(row => source.slice(row.row.start, row.row.end)).join(', ') + '};' : '']);
  }
  let out = source;
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + text + out.slice(end);
  return {source: out, removed: rows.filter(unit => !kept.has(unit)).flatMap(unit => unit.names), unexported: [...dropping].filter(name => !exportedNow.has(name))};
}
