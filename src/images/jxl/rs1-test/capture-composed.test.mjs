// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {capture} from '../v7/capture.mjs';
import {advance} from '../v7/resumable.mjs';
import {drive, sha256, named} from './durable-host.mjs';

function textPage(width, height) {
  const data = new Uint8Array(width * height * 4).fill(255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const line = y % 24, col = x % 9, i = (y * width + x) * 4;
    if (line > 4 && line < 18 && col < 6 && ((x * 7 + y * 3 + (x >> 5) * 11) % 13 < 6)) data.set([30, 30, 40], i);
    if (y % 600 < 40) data.set([20 + (x >> 4) % 3 * 60, 90, 200], i);
  }
  return {width, height, data};
}
async function pages() {
  const list = [{id: 'text 1100x1500', ...textPage(1100, 1500)}, {id: 'text 300x200', ...textPage(300, 200)}];
  if (process.env.JXL_CORPUS) {
    const {readPng} = await import('../../../jxl/png.mjs');
    for (const name of ['text-1080p.png', 'argon-fhd-snapdom-jxl-demo.png', 'dashboard-1080p.png']) {
      const {width, height, data} = await readPng(new Uint8Array(await readFile(join(process.env.JXL_CORPUS, 'capture', name))));
      list.push({id: name, width, height, data});
    }
  }
  return list;
}
const resumable = (page, effort, options) => drive(capture, page.data, {width: page.width, height: page.height}, {effort}, {ms: 5, ...options});

for (const page of await pages()) for (const effort of [1, 2, 3]) test(`capture e${effort} ${page.id}: resumed bytes equal the ordinary call`, async () => {
  const ordinary = await capture({width: page.width, height: page.height, data: page.data.slice()}, {effort});
  const out = await resumable(page, effort);
  assert.equal(sha256(out.bytes), sha256(ordinary.bytes), `${out.calls} calls`);
  const {bytes: _a, ...record} = out.record, {bytes: _b, ...expected} = await named(ordinary, {width: page.width, height: page.height, data: page.data});
  assert.deepEqual(record, expected, 'the same result record');
});

test('a tampered or stale capture checkpoint is refused before codec work', async () => {
  const page = {id: 'small', ...textPage(1100, 300)};
  let tried = 0;
  await resumable(page, 3, {onAdvance: async ({before, result, store, input}) => {
    if (tried++ > 3) return;
    const call = checkpoint => advance(checkpoint, {operation: capture, input, store, budget: {ms: 5}});
    await assert.rejects(call({...before, revision: before.revision + 1}), {code: 'JXL_INPUT'});
    await assert.rejects(call({...before, build: 'd'.repeat(64)}), {code: 'JXL_INPUT'});
    await assert.rejects(call({...before, plan: {...before.plan, effort: 9}}), {code: 'JXL_INPUT'});
    await assert.rejects(call({...before, state: {...before.state, length: before.state.length + 1}}), {code: 'JXL_INPUT'});
    await assert.rejects(call({...before, source: {...before.source, sha256: '0'.repeat(64)}}), {code: 'JXL_INPUT'});
    const saved = store.parts.get(before.state.hash), bad = saved.slice(); bad[bad.length >> 1] ^= 1;
    store.parts.set(before.state.hash, bad);
    await assert.rejects(call(before), {code: 'JXL_INPUT'});
    store.parts.set(before.state.hash, saved.subarray(0, saved.length - 1));
    await assert.rejects(call(before), {code: 'JXL_INPUT'});
    store.parts.delete(before.state.hash);
    await assert.rejects(call(before), {code: 'JXL_INPUT'});
    store.parts.set(before.state.hash, saved);
  }});
});

test('a resumable capture refuses options and sources the module does not take', async () => {
  const {start} = await import('../v7/resumable.mjs'), {memoryStore, sourceRecord} = await import('./durable-host.mjs');
  const data = new Uint8Array(16 * 16 * 4), store = memoryStore(data), input = sourceRecord(data, {width: 16, height: 16});
  await assert.rejects(start({operation: capture, input, options: {effort: 6}, store}), {code: 'JXL_UNSUPPORTED'});
  await assert.rejects(start({operation: capture, input, options: {readAs: 'srgb'}, store}), {code: 'JXL_OPTIONS'});
  await assert.rejects(start({operation: capture, input: {...input, width: 15}, options: {}, store}), {code: 'JXL_INPUT'});
  await assert.rejects(start({operation: () => {}, input, options: {}, store}), {code: 'JXL_UNSUPPORTED'});
});
