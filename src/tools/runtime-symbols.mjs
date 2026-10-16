// SPDX-License-Identifier: AGPL-3.0-only
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash = value => createHash('sha256').update(value).digest('hex');

export function symbolMap(ast, code, format) {
  const changes = [], hooks = [], seen = new WeakSet();
  ast.walk({_visit(node, descend) {
    if (typeof node._do_print === 'function' && typeof node.name === 'string' && !seen.has(node)) {
      seen.add(node);
      const print = node._do_print, original = node.definition()?.name || node.name;
      hooks.push([node, print]);
      node._do_print = function (output) {
        const def = this.definition(), name = def?.mangled_name || def?.name || this.name;
        print.call(this, output);
        if (name !== original) changes.push([output.pos() - name.length, name, original]);
      };
    }
    if (descend) descend.call(node);
  }});
  const emitted = ast.print_to_string(format);
  for (const [node, print] of hooks) node._do_print = print;
  assert.equal(emitted, code, 'symbol positions must describe the exact emitted bytes');
  const names = [], ids = new Map(), offsets = [];
  let at = 0;
  for (const [start, printed, original] of changes.sort((a, b) => a[0] - b[0])) {
    assert.equal(code.slice(start, start + printed.length), printed, 'symbol position is not its emitted token');
    if (!ids.has(original)) { ids.set(original, names.length); names.push(original); }
    offsets.push(start - at, printed.length, ids.get(original)); at = start;
  }
  const map = {sha256: hash(code), names, offsets};
  ast.walk({_visit(node, descend) {
    const def = typeof node.definition === 'function' ? node.definition() : null;
    if (def) def.mangled_name = null;
    if (descend) descend.call(node);
  }});
  assert(restoreSymbols(code, map) === ast.print_to_string(format), 'symbol restoration must preserve the exact compiled program');
  return map;
}

export function restoreSymbols(code, map) {
  assert.equal(hash(code), map.sha256, 'symbol metadata belongs to different compiled bytes');
  assert.equal(map.offsets.length % 3, 0, 'invalid symbol metadata');
  const parts = [];
  let start = 0, end = 0;
  for (let i = 0; i < map.offsets.length; i += 3) {
    start += map.offsets[i];
    const length = map.offsets[i + 1], name = map.names[map.offsets[i + 2]];
    assert(Number.isInteger(start) && Number.isInteger(length) && length > 0 && start >= end && start + length <= code.length && typeof name === 'string', 'invalid symbol metadata');
    parts.push(code.slice(end, start), name); end = start + length;
  }
  return parts.join('') + code.slice(end);
}

export function prefixSymbols(code, map, slice) {
  assert.equal(hash(code), map.sha256, 'symbol metadata belongs to different compiled bytes');
  assert(code.startsWith(slice.replace(/;$/, '')), 'a slice map needs a leading slice');
  const offsets = [];
  for (let i = 0, start = 0; i < map.offsets.length; i += 3) {
    start += map.offsets[i];
    if (start + map.offsets[i + 1] > slice.length) break;
    offsets.push(map.offsets[i], map.offsets[i + 1], map.offsets[i + 2]);
  }
  return {sha256: hash(slice), names: map.names, offsets};
}
