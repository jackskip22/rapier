// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {encode} from '../v7/index.mjs';
import {capture} from '../v7/capture.mjs';
import {capture as captureComplete} from '../v7/capture-complete.mjs';
import {start, advance, finish} from '../v7/resumable.mjs';
import {memoryStore, sourceRecord, sha256} from './durable-host.mjs';
import {tiled} from './photo-fixture.mjs';

const picture = await tiled(640, 480);
for (const [name, verb, options] of [['encode e3', encode, {effort: 3, fidelity: {quality: 85}}], ['capture e3', capture, {effort: 3}],
  ['capture-complete e4', captureComplete, {effort: 4, fidelity: {quality: 85}, photoRects: [{x: 0, y: 0, width: 640, height: 300}]}]])
  test(`${name}: lost saves and failed writes are retried and the file is the ordinary call's`, {timeout: 120000}, async () => {
    const ordinary = await verb({...picture, data: picture.data.slice()}, options);
    const store = memoryStore(picture.data), input = sourceRecord(picture.data, {width: picture.width, height: picture.height});
    const write = store.write;
    let failAfter = -1, written = 0;
    store.write = async (ref, bytes) => { if (failAfter >= 0 && written++ >= failAfter) throw new Error('store down'); return write(ref, bytes); };
    let saved = JSON.stringify(await start({operation: verb, input, options, store})), done = false, calls = 0, lost = 0, failed = 0;
    while (!done) {
      assert.ok(++calls < 3000);
      const before = JSON.parse(saved);
      if (calls % 3 === 1) {
        failAfter = calls === 1 ? 0 : calls % 2; written = 0;
        try { await advance(before, {operation: verb, input, store, budget: {ms: 5}}); } catch (error) { assert.match(error.message, /store down/); failed++; }
        failAfter = -1;
      }
      const result = await advance(JSON.parse(saved), {operation: verb, input, store, budget: {ms: 5}});
      if (calls === 2 || calls % 4 === 2 && !result.done) { lost++; continue; }
      if (!result.done) await assert.rejects(finish(result.checkpoint, {operation: verb, input, store}), {code: 'JXL_INPUT', message: /not complete/});
      saved = JSON.stringify(result.checkpoint); done = result.done;
    }
    assert.ok(lost > 0 && failed > 0);
    const record = await finish(JSON.parse(saved), {operation: verb, input, store});
    assert.equal(sha256(record.bytes), sha256(ordinary.bytes));
  });
