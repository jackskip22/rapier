// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {recompress} from '../v7/jpeg.mjs';
import {start, advance, finish} from '../v7/resumable.mjs';
import {memoryStore, sourceRecord} from './durable-host.mjs';

test('a resumed effort 7 recompress costs at most eight ordinary calls', {timeout: 600000}, async () => {
  const jpeg = new Uint8Array(await readFile(new URL('../public/test/photo-corpus/grace-hopper.jpg', import.meta.url)));
  const median = async run => { const times = []; for (let i = 0; i < 3; i++) { const t = performance.now(); await run(); times.push(performance.now() - t); } return times.sort((a, b) => a - b)[1]; };
  const resumed = async () => {
    const store = memoryStore(jpeg), ctx = {operation: recompress, input: sourceRecord(jpeg), store};
    let checkpoint = await start({...ctx, options: {effort: 7}}), result;
    do { result = await advance(JSON.parse(JSON.stringify(checkpoint)), ctx); checkpoint = result.checkpoint; } while (!result.done);
    return finish(checkpoint, ctx);
  };
  await recompress(jpeg, {effort: 7}); await resumed();
  const ordinary = await median(() => recompress(jpeg, {effort: 7})), stepped = await median(resumed);
  assert.ok(stepped <= 8 * ordinary, `resumed ${stepped.toFixed(0)} ms, ordinary ${ordinary.toFixed(0)} ms (${(stepped / ordinary).toFixed(1)}x)`);
});
