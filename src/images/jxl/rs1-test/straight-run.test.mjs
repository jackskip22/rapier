import test from 'node:test';
import assert from 'node:assert/strict';
import {encode} from '../v7/index.mjs';
import {start, advance, finish, workerAdmission} from '../v7/resumable.mjs';
import {decodeData} from '../resumable-data.mjs';
import {memoryStore, sourceRecord, sha256} from './durable-host.mjs';
import {tiled} from './photo-fixture.mjs';

const options = {effort: 2, fidelity: {quality: 85}};
const stateOf = async (store, checkpoint) => checkpoint.state && decodeData(store.parts.get(checkpoint.state.hash));
const slowed = (store, length, delay) => {
  const read = store.readSource;
  let reads = 0;
  store.readSource = async (at, n) => { if (delay && ++reads === 2) await new Promise(r => setTimeout(r, delay)); return read(at, n); };
  return store;
};
async function job(picture, budgets, delay = 0) {
  const store = slowed(memoryStore(picture.data), picture.data.length, delay), input = sourceRecord(picture.data, {width: picture.width, height: picture.height});
  let checkpoint = await start({operation: encode, input, options, store}), done = false, calls = 0;
  const states = [];
  while (!done) {
    ({checkpoint, done} = await advance(JSON.parse(JSON.stringify(checkpoint)), {operation: encode, input, store, budget: {ms: budgets[Math.min(calls, budgets.length - 1)]}}));
    calls++; states.push(await stateOf(store, checkpoint));
  }
  return {calls, states, record: await finish(checkpoint, {operation: encode, input, store})};
}

test('a straight run past its deadline marks the job tried, and the next advances step to the ordinary file', {timeout: 300000}, async () => {
  const picture = await tiled(600, 400);
  assert.ok(workerAdmission({operation: encode, options, width: 600, height: 400}).admitted);
  const ordinary = await encode({...picture, data: picture.data.slice()}, options);
  const whole = await job(picture, [60000]);
  assert.equal(whole.calls, 1);
  assert.equal(sha256(whole.record.bytes), sha256(ordinary.bytes));
  const small = await job(picture, [20]);
  assert.ok(small.states.every(s => !s?.codec?.tried) && small.calls > 2);
  assert.equal(sha256(small.record.bytes), sha256(ordinary.bytes));
  const stepped = await job(picture, [2000, 20], 1500), at = stepped.states.findIndex(s => s?.codec?.tried);
  assert.ok(at >= 0, 'a call marked the job tried');
  assert.ok(stepped.states.slice(0, at + 1).every(s => !s.codec || !Object.keys(s.codec.journal).length), 'nothing saved before');
  assert.ok(Object.keys(stepped.states[at + 1]?.codec?.journal ?? {}).length > 0, 'the next call steps (its journal saves units)');
  assert.ok(stepped.calls > 2);
  assert.equal(sha256(stepped.record.bytes), sha256(ordinary.bytes));
});

test('a restore reads its container\'s picture size from the first bytes, so it runs straight: past its deadline, tried', {timeout: 300000}, async () => {
  const {recompress, restore} = await import('../v7/jpeg.mjs');
  const {readFileSync} = await import('node:fs');
  const original = new Uint8Array(readFileSync(new URL('../../../tools/witnesses/fixtures/w7-flower.jpg', import.meta.url)));
  const file = (await recompress(original.slice(), {effort: 1})).bytes, store = memoryStore(file), input = sourceRecord(file, {kind: 'file'});
  slowed(store, file.length, 1500);
  let checkpoint = await start({operation: restore, input, store}), done = false, tried = false;
  for (const ms of [2000, 2000, 2000, 60000, 60000]) {
    if (done) break;
    ({checkpoint, done} = await advance(JSON.parse(JSON.stringify(checkpoint)), {operation: restore, input, store, budget: {ms}}));
    tried ||= !!(await stateOf(store, checkpoint))?.codec?.tried;
  }
  assert.ok(tried, 'a call ran straight and marked the job tried');
  assert.ok(done);
  assert.deepEqual((await finish(checkpoint, {operation: restore, input, store})).bytes, original);
});
