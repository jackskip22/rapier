// SPDX-License-Identifier: AGPL-3.0-only
// ANTLR 4.11 carries ES2015 String shims in the upstream bundled renderer.
// Modern browser builds use the native intrinsics. Keep the upstream bytes
// pinned, and remove only the two complete, guarded shim statements.
import acorn from '../../agent/vendor/acorn.mjs';

const member = (node, owner, key) => node?.type === 'MemberExpression' && !node.computed &&
  node.property.name === key && (typeof owner === 'string' ? node.object.type === 'Identifier' && node.object.name === owner : owner(node.object));

export function modernZenUMLSource(source) {
  const tree = acorn.parse(source, {sourceType: 'module', ecmaVersion: 'latest'});
  const removals = [];
  for (const statement of tree.body) {
    const expression = statement.type === 'ExpressionStatement' && statement.expression;
    if (expression?.type !== 'LogicalExpression' || expression.operator !== '||' ||
        expression.right.type !== 'CallExpression' || expression.right.callee.type !== 'FunctionExpression') continue;
    const target = expression.left;
    if (member(target, node => member(node, 'String', 'prototype'), 'codePointAt')) removals.push({name: 'String.prototype.codePointAt', statement});
    if (member(target, 'String', 'fromCodePoint')) removals.push({name: 'String.fromCodePoint', statement});
  }
  if (removals.length !== 2 || new Set(removals.map(row => row.name)).size !== 2)
    throw new Error('ZenUML no longer has the two pinned ANTLR String shim statements');
  let contents = source;
  for (const {statement} of removals.sort((a, b) => b.statement.start - a.statement.start))
    contents = contents.slice(0, statement.start) + contents.slice(statement.end);
  return {contents, removed: removals.map(row => row.name).sort()};
}
