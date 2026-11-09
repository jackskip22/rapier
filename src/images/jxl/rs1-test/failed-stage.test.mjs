// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {capture} from '../v7/capture-complete.mjs';
import {start, advance, finish} from '../v7/resumable.mjs';
import {memoryStore, sourceRecord, sha256} from './durable-host.mjs';

const data = new Uint8Array(gunzipSync(Buffer.from(await readFile(new URL('../v7/test/fixtures/kodim03-small.rgba.gz.base64', import.meta.url), 'utf8'), 'base64')));
const width = 128, height = 85, options = {effort: 4, fidelity: {quality: 85}, photoRects: [{x: 0, y: 0, width, height: 60}]};

test('capture-complete e4 on a small photograph finishes in 5 ms calls with the ordinary file', {timeout: 600000}, async () => {
  const ordinary = await capture({width, height, data: data.slice()}, options);
  const store = memoryStore(data), input = sourceRecord(data, {width, height});
  let checkpoint = JSON.parse(JSON.stringify(await start({operation: capture, input, options, store}))), done = false, calls = 0;
  while (!done) {
    assert.ok(++calls < 400, 'the job finishes');
    const result = await advance(checkpoint, {operation: capture, input, store, budget: {ms: 5}});
    checkpoint = JSON.parse(JSON.stringify(result.checkpoint)); done = result.done;
  }
  assert.equal(sha256((await finish(checkpoint, {operation: capture, input, store})).bytes), sha256(ordinary.bytes), `${calls} calls`);
});
