// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encode, fit} from '../v7/index.mjs';
import {recompress, restore} from '../v7/jpeg.mjs';
import {start, advance, finish} from '../v7/resumable.mjs';
import {memoryStore, sourceRecord, sha256} from './durable-host.mjs';
import {tiled} from './photo-fixture.mjs';

const jpeg = new Uint8Array(readFileSync(new URL('../../../tools/witnesses/fixtures/w7-flower.jpg', import.meta.url)));
async function job(operation, bytes, description, options, ms) {
  const store = memoryStore(bytes), input = sourceRecord(bytes, description);
  let checkpoint = await start({operation, input, options, store}), done = false, released = 0, written = 0, peak = 0;
  const write = store.write;
  store.write = async (ref, part) => { written += part.length; return write(ref, part); };
  const held = () => [...store.parts.values()].reduce((n, part) => n + part.length, 0);
  while (!done) {
    const result = await advance(JSON.parse(JSON.stringify(checkpoint)), {operation, input, store, budget: {ms}});
    checkpoint = result.checkpoint; done = result.done;
    peak = Math.max(peak, held());
    for (const ref of result.released) { assert.ok(store.parts.has(ref.hash), 'a released part was kept'); store.parts.delete(ref.hash); released++; }
  }
  return {record: await finish(checkpoint, {operation, input, store}), released, written, peak};
}

const picture = await tiled(640, 480);
for (const [name, operation, bytes, description, options, ordinary] of [
  ['encode q90 e3 pixels', encode, picture.data, {width: 640, height: 480}, {effort: 3, fidelity: {quality: 90}}, () => encode({...picture, data: picture.data.slice()}, {effort: 3, fidelity: {quality: 90}})],
  ['encode exact e2 pixels', encode, picture.data, {width: 640, height: 480}, {effort: 2, fidelity: 'exact'}, () => encode({...picture, data: picture.data.slice()}, {effort: 2, fidelity: 'exact'})],
  ['fit e3 pixels', fit, picture.data, {width: 640, height: 480}, {effort: 3, maxBytes: 30000}, () => fit({...picture, data: picture.data.slice()}, {effort: 3, maxBytes: 30000})],
  ['recompress e3', recompress, jpeg, {kind: 'file'}, {effort: 3}, () => recompress(jpeg.slice(), {effort: 3})]])
  test(`${name}: deleting each released part at once still gives the ordinary file`, {timeout: 300000}, async () => {
    const {record, released, written, peak} = await job(operation, bytes, description, options, 10);
    assert.equal(sha256(record.bytes), sha256((await ordinary()).bytes));
    assert.ok(released > 0, 'parts were released');
    assert.ok(peak < written, `held at most ${peak} of ${written} bytes written`);
  });

test('restore: deleting each released part at once still gives the JPEG', {timeout: 300000}, async () => {
  const stored = (await recompress(jpeg.slice(), {effort: 3})).bytes;
  const {record} = await job(restore, stored, {kind: 'file'}, {}, 5);
  assert.equal(sha256(record.bytes), sha256(jpeg));
});
