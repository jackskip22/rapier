// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {encode} from '../v7/index.mjs';
import {start, advance, finish} from '../v7/resumable.mjs';
import {memoryStore, sourceRecord, sha256} from './durable-host.mjs';
import {tiled} from './photo-fixture.mjs';

for (const [effort, bound] of [[2, 6.5], [3, 8]]) test(`a resumed effort ${effort} encode reads the original once whole to check it, then only the rows its steps use`, {timeout: 120000}, async () => {
  const picture = await tiled(1000, 1500), options = {effort, fidelity: {quality: 85}};
  const ordinary = await encode({...picture, data: picture.data.slice()}, options);
  const store = memoryStore(picture.data), read = store.readSource;
  const input = sourceRecord(picture.data, {width: picture.width, height: picture.height});
  let bytes = 0;
  store.readSource = async (at, length) => { bytes += length; return read(at, length); };
  let checkpoint = JSON.parse(JSON.stringify(await start({operation: encode, input, options, store}))), done = false;
  const calls = [];
  while (!done) {
    bytes = 0;
    const result = await advance(checkpoint, {operation: encode, input, store, budget: {ms: 30}});
    checkpoint = JSON.parse(JSON.stringify(result.checkpoint)); done = result.done;
    calls.push(bytes);
    assert.ok(calls.length < 2000);
  }
  const record = await finish(checkpoint, {operation: encode, input, store});
  assert.equal(sha256(record.bytes), sha256(ordinary.bytes));
  const whole = picture.data.length, total = calls.reduce((a, b) => a + b, 0);
  assert.ok(total <= bound * whole, `${(total / whole).toFixed(2)} originals read: ${JSON.stringify(calls)}`);
  const idle = calls.indexOf(0);
  assert.ok(idle > 0 && calls.slice(idle).every(n => n === 0), `calls after the bands reading it: ${JSON.stringify(calls)}`);
});
