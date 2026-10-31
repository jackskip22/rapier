import assert from 'node:assert/strict';
import test from 'node:test';
import {createMasonry, planMasonry, commitMasonry} from './library-window.mjs';

test('carried orders keep immutable identities and new geometry', () => {
  const input = [{key:'a.md', revision:'m1'}, {key:'b.md', revision:'m2'}];
  const first = createMasonry({items:input, width:390, context:'phone'});
  input[0].revision = 'changed'; input.reverse();
  const next = createMasonry({items:first.items, width:800, columns:3, context:'wide', epoch:2});
  assert.deepEqual(next.items, [{key:'a.md', revision:'m1'}, {key:'b.md', revision:'m2'}]);
  assert.equal(next.next, 0); assert.equal(next.extent, 0);
  assert.notEqual(first.columnWidth, next.columnWidth);
  const plan = planMasonry(next, {viewportHeight:600});
  const rows = plan.derive.map(item => ({...item, epoch:2, context:'wide', width:next.columnWidth, height:80, settled:true}));
  assert.equal(commitMasonry(next, rows).next, 2);
  assert.throws(() => commitMasonry(next, [{...rows[0], revision:'changed'}]));
  assert.throws(() => commitMasonry(next, [{...rows[0], epoch:0}]));
});

test('a frozen caller array cannot bypass identity validation', () => {
  for (const items of [
    [{key:'a.md', revision:'m1'}, {key:'a.md', revision:'m2'}],
    [{key:'a.md', revision:''}],
    [{key:'', revision:'m1'}],
  ]) assert.throws(() => createMasonry({items:Object.freeze(items.map(Object.freeze)), width:390, context:'phone'}));
});
