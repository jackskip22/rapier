
import {readFile} from 'node:fs/promises';
import {resolve, dirname, relative} from 'node:path';
import acorn from '../agent/vendor/acorn.mjs';

const parseModule = source => acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});

export const BANNED_MEMBER_PAIRS = [['Date', 'now'], ['performance', 'now'], ['Math', 'random'], ['crypto', 'randomUUID']];
const MEMBER_PAIR_OBJECTS = new Set(BANNED_MEMBER_PAIRS.map(([object]) => object));
export const BANNED_BARE_IDENTIFIERS = new Set(['fetch', 'setTimeout', 'setInterval', 'document', 'window', 'navigator', 'location', 'XMLHttpRequest', 'WebSocket']);
const GLOBALTHIS_BARE = new Set(BANNED_BARE_IDENTIFIERS);

function identifiers(pattern) {
  if (!pattern) return [];
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'ObjectPattern') return pattern.properties.flatMap(row => identifiers(row.value || row.argument));
  if (pattern.type === 'ArrayPattern') return pattern.elements.filter(Boolean).flatMap(identifiers);
  if (pattern.type === 'AssignmentPattern') return identifiers(pattern.left);
  if (pattern.type === 'RestElement') return identifiers(pattern.argument);
  throw new Error('Unsupported binding pattern: ' + pattern.type);
}


function newScope(parent, isFunction) {
  return {parent, isFunction, names: new Set()};
}
function declare(scope, name) {
  if (name) scope.names.add(name);
}
function declarePattern(scope, pattern) {
  for (const name of identifiers(pattern)) declare(scope, name);
}
function isBound(scope, name) {
  for (let s = scope; s; s = s.parent) if (s.names.has(name)) return true;
  return false;
}

function unwrapExport(node) {
  return (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') && node.declaration ? node.declaration : node;
}

function hoistVars(stmt, scope) {
  if (!stmt) return;
  const node = unwrapExport(stmt);
  switch (node.type) {
    case 'VariableDeclaration':
      if (node.kind === 'var') node.declarations.forEach(d => declarePattern(scope, d.id));
      return;
    case 'FunctionDeclaration':
      return;
    case 'FunctionExpression': case 'ArrowFunctionExpression': case 'ClassDeclaration': case 'ClassExpression':
      return;
    case 'BlockStatement':
      node.body.forEach(s => hoistVars(s, scope));
      return;
    case 'IfStatement':
      hoistVars(node.consequent, scope); hoistVars(node.alternate, scope);
      return;
    case 'ForStatement':
      if (node.init && node.init.type === 'VariableDeclaration') hoistVars(node.init, scope);
      hoistVars(node.body, scope);
      return;
    case 'ForInStatement': case 'ForOfStatement':
      if (node.left.type === 'VariableDeclaration') hoistVars(node.left, scope);
      hoistVars(node.body, scope);
      return;
    case 'WhileStatement': case 'DoWhileStatement':
      hoistVars(node.body, scope);
      return;
    case 'TryStatement':
      hoistVars(node.block, scope);
      if (node.handler) hoistVars(node.handler.body, scope);
      hoistVars(node.finalizer, scope);
      return;
    case 'SwitchStatement':
      node.cases.forEach(c => c.consequent.forEach(s => hoistVars(s, scope)));
      return;
    case 'LabeledStatement':
      hoistVars(node.body, scope);
      return;
    default:
      return;
  }
}

function hoistBlockOwn(list, scope) {
  for (const stmt of list) {
    const node = unwrapExport(stmt);
    if (node.type === 'VariableDeclaration' && node.kind !== 'var') node.declarations.forEach(d => declarePattern(scope, d.id));
    else if (node.type === 'ClassDeclaration' && node.id) declare(scope, node.id.name);
    else if (node.type === 'FunctionDeclaration' && node.id) declare(scope, node.id.name);
  }
}


function children(node) {
  const kids = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'type') continue;
    if (Array.isArray(value)) value.forEach(v => { if (v && typeof v.type === 'string') kids.push(v); });
    else if (value && typeof value.type === 'string') kids.push(value);
  }
  return kids;
}

function staticKey(node) {
  if (!node.computed) return node.property.name;
  if (node.property.type === 'Literal' && typeof node.property.value === 'string') return node.property.value;
  return null;
}

export function purityFindingsInTree(tree) {
  const findings = [];
  const report = (node, text) => findings.push({start: node.start, text});

  function visitPatternRefs(pattern, scope) {
    if (!pattern) return;
    switch (pattern.type) {
      case 'Identifier': return;
      case 'AssignmentPattern': visit(pattern.right, scope); visitPatternRefs(pattern.left, scope); return;
      case 'ObjectPattern':
        pattern.properties.forEach(prop => {
          if (prop.type === 'RestElement') { visitPatternRefs(prop.argument, scope); return; }
          if (prop.computed) visit(prop.key, scope);
          visitPatternRefs(prop.value, scope);
        });
        return;
      case 'ArrayPattern':
        pattern.elements.forEach(el => visitPatternRefs(el, scope));
        return;
      case 'RestElement':
        visitPatternRefs(pattern.argument, scope);
        return;
      default:
        visit(pattern, scope);
    }
  }

  function enterFunction(node, scope) {
    const fn = newScope(scope, true);
    if (node.type === 'FunctionExpression' && node.id) declare(fn, node.id.name);
    node.params.forEach(p => declarePattern(fn, p));
    if (node.body.type === 'BlockStatement') {
      hoistVars(node.body, fn);
      hoistBlockOwn(node.body.body, fn);
      node.params.forEach(p => visitPatternRefs(p, fn));
      node.body.body.forEach(s => visit(s, fn));
    } else {
      node.params.forEach(p => visitPatternRefs(p, fn));
      visit(node.body, fn);
    }
  }

  function checkMemberExpression(node, scope) {
    const key = staticKey(node);
    if (key == null) { visit(node.object, scope); if (node.computed) visit(node.property, scope); return; }
    const obj = node.object;
    if (obj.type === 'Identifier') {
      const bound = isBound(scope, obj.name);
      if (!bound) {
        if (obj.name === 'globalThis') {
          if (GLOBALTHIS_BARE.has(key)) report(node, `globalThis.${key}`);
        } else if (MEMBER_PAIR_OBJECTS.has(obj.name)) {
          if (BANNED_MEMBER_PAIRS.some(([o, p]) => o === obj.name && p === key)) report(node, `${obj.name}.${key}`);
        } else if (BANNED_BARE_IDENTIFIERS.has(obj.name)) {
          report(node, `${obj.name}.${key}`);
        }
      }
      return;
    }
    if (obj.type === 'MemberExpression') {
      const innerKey = staticKey(obj);
      if (innerKey != null && obj.object.type === 'Identifier' && obj.object.name === 'globalThis' && !isBound(scope, 'globalThis') &&
        MEMBER_PAIR_OBJECTS.has(innerKey) && BANNED_MEMBER_PAIRS.some(([o, p]) => o === innerKey && p === key)) {
        report(node, `globalThis.${innerKey}.${key}`);
        return;
      }
    }
    visit(node.object, scope);
    if (node.computed) visit(node.property, scope);
  }

  function visit(node, scope) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'Identifier':
        if (BANNED_BARE_IDENTIFIERS.has(node.name) && !isBound(scope, node.name)) report(node, node.name);
        return;
      case 'MemberExpression':
        checkMemberExpression(node, scope);
        return;
      case 'NewExpression':
        if (node.callee.type === 'Identifier' && node.callee.name === 'Date' && node.arguments.length === 0 && !isBound(scope, 'Date'))
          report(node, 'new Date()');
        children(node).forEach(child => visit(child, scope));
        return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
        enterFunction(node, scope);
        return;
      case 'VariableDeclarator':
        visitPatternRefs(node.id, scope);
        visit(node.init, scope);
        return;
      case 'BlockStatement': {
        const block = newScope(scope, false);
        hoistBlockOwn(node.body, block);
        node.body.forEach(s => visit(s, block));
        return;
      }
      case 'CatchClause': {
        const block = newScope(scope, false);
        if (node.param) { declarePattern(block, node.param); visitPatternRefs(node.param, block); }
        visit(node.body, block);
        return;
      }
      case 'ForStatement': {
        const loop = newScope(scope, false);
        if (node.init && node.init.type === 'VariableDeclaration') {
          if (node.init.kind !== 'var') node.init.declarations.forEach(d => declarePattern(loop, d.id));
          node.init.declarations.forEach(d => { visitPatternRefs(d.id, loop); visit(d.init, loop); });
        } else if (node.init) visit(node.init, loop);
        visit(node.test, loop); visit(node.update, loop); visit(node.body, loop);
        return;
      }
      case 'ForInStatement': case 'ForOfStatement': {
        const loop = newScope(scope, false);
        if (node.left.type === 'VariableDeclaration') {
          if (node.left.kind !== 'var') node.left.declarations.forEach(d => declarePattern(loop, d.id));
          node.left.declarations.forEach(d => visitPatternRefs(d.id, loop));
        } else visit(node.left, loop);
        visit(node.right, loop); visit(node.body, loop);
        return;
      }
      case 'ClassDeclaration': case 'ClassExpression': {
        const inner = node.id ? newScope(scope, false) : scope;
        if (node.id) declare(inner, node.id.name);
        visit(node.superClass, inner);
        node.body.body.forEach(member => visit(member, inner));
        return;
      }
      case 'SwitchStatement': {
        const block = newScope(scope, false);
        const allConsequent = node.cases.flatMap(c => c.consequent);
        hoistBlockOwn(allConsequent, block);
        visit(node.discriminant, scope);
        node.cases.forEach(c => { visit(c.test, block); c.consequent.forEach(s => visit(s, block)); });
        return;
      }
      case 'MethodDefinition': case 'PropertyDefinition': case 'Property':
        if (node.computed) visit(node.key, scope);
        if (node.value) visit(node.value, scope);
        return;
      case 'LabeledStatement':
        visit(node.body, scope);
        return;
      case 'BreakStatement': case 'ContinueStatement':
        return;
      case 'ImportDeclaration': case 'ExportAllDeclaration':
        return;
      default:
        children(node).forEach(child => visit(child, scope));
    }
  }

  const moduleScope = newScope(null, true);
  for (const stmt of tree.body) if (stmt.type === 'ImportDeclaration') for (const spec of stmt.specifiers) declare(moduleScope, spec.local.name);
  tree.body.forEach(s => hoistVars(s, moduleScope));
  hoistBlockOwn(tree.body, moduleScope);
  tree.body.forEach(s => visit(s, moduleScope));

  findings.sort((a, b) => a.start - b.start);
  return findings.map(f => f.text);
}

export async function checkPurity(entryPath, {baseDir = dirname(entryPath)} = {}) {
  const seen = new Set(), findings = [];
  async function walk(path) {
    if (seen.has(path)) return;
    seen.add(path);
    const label = relative(baseDir, path).replaceAll('\\', '/');
    const tree = parseModule(await readFile(path, 'utf8'));
    for (const text of purityFindingsInTree(tree)) findings.push(`${label}: ${text}`);
    for (const node of tree.body) {
      if (node.type === 'ImportDeclaration') await walk(resolve(dirname(path), node.source.value));
    }
  }
  await walk(entryPath);
  return findings;
}
