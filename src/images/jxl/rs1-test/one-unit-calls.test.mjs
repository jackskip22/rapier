// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {capture as captureComplete} from '../v7/capture-complete.mjs';
import {capture} from '../v7/capture.mjs';
import {encode} from '../v7/index.mjs';
import {start, advance, finish} from '../v7/resumable.mjs';
import {memoryStore, sourceRecord, sha256} from './durable-host.mjs';

const data = new Uint8Array(gunzipSync(Buffer.from(await readFile(new URL('../v7/test/fixtures/kodim03-small.rgba.gz.base64', import.meta.url), 'utf8'), 'base64')));
const width = 128, height = 85, photoRects = [{x: 0, y: 0, width, height: 60}];
for (const [name, verb, options] of [['encode e3', encode, {effort: 3, fidelity: {quality: 85}}], ['capture e3', capture, {effort: 3}],
  ...[4, 7].map(effort => [`capture-complete e${effort}`, captureComplete, {effort, fidelity: {quality: 85}, photoRects}])])
  test(`${name}, one unit a call: the ordinary file`, {timeout: 1200000}, async () => {
    const ordinary = await verb({width, height, data: data.slice()}, options);
    const store = memoryStore(data), input = sourceRecord(data, {width, height});
    let checkpoint = JSON.parse(JSON.stringify(await start({operation: verb, input, options, store}))), done = false, calls = 0;
    while (!done) {
      assert.ok(++calls < 5000, 'the job finishes');
      const result = await advance(checkpoint, {operation: verb, input, store, budget: {ms: 0.001}});
      checkpoint = JSON.parse(JSON.stringify(result.checkpoint)); done = result.done;
    }
    assert.equal(sha256((await finish(checkpoint, {operation: verb, input, store})).bytes), sha256(ordinary.bytes), `${calls} calls`);
  });
