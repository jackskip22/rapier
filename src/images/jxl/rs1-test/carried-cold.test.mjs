// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {unit, carried, PASSED} from '../step-journal.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';

const SIZE = 2 << 20, INPUT = Uint8Array.of(3, 1);
const codecOf = (cold, plain = false) => createJournalStepper({id: 'rs2/carried-cold-' + cold + plain, build: '9'.repeat(64),
  normalize: () => ({budgetMs: Number.MIN_VALUE}),
  open: function* () {
    let state = null;
    for (let k = 0; k < 2; k++) {
      const make = () => {
        const data = new Uint8Array(SIZE);
        for (let i = 0; i < SIZE; i++) data[i] = Math.imul(i + k * SIZE, 2654435761) >>> 24;
        data[0] = k + 1;
        return {data};
      };
      const saved = plain ? yield* unit('state' + k, make, undefined, false, cold) : yield* carried('state', make, undefined, false, cold);
      if (saved !== PASSED) state = saved;
    }
    let n = 0;
    for (let k = 0; k < 6; k++) n += yield* unit('other' + k, () => k);
    return Uint8Array.of(n + state.data[0]);
  },
  result: bytes => ({kind: 'carried-cold', length: bytes.length})});

async function run(cold, plain = false) {
  const codec = codecOf(cold, plain), source = {generation: 'rs2/carried-cold', sha256: await digest(INPUT), byteLength: INPUT.length}, parts = new Map();
  let checkpoint, bytes = 0, unused = 0;
  const persist = t => { for (const {ref, bytes} of t.parts) parts.set(ref.hash, bytes.slice()); checkpoint = structuredClone(t.checkpoint); };
  const counted = found => { for (const part of found) bytes += part?.length ?? 0; return found; };
  const host = () => ({source, expectedRevision: checkpoint.revision,
    read: async ref => counted([parts.get(ref.hash)?.slice()])[0],
    readMany: async refs => counted(refs.map(ref => parts.get(ref.hash)?.slice())),
    readSource: async (at, count) => INPUT.slice(at, at + count)});
  persist(await codec.start({source, options: {}}));
  for (let calls = 0; checkpoint.status !== 'done'; calls++) {
    bytes = 0;
    persist(await codec.advance(checkpoint, host(), {units: 1}));
    if (calls >= 3 && calls < 7) unused += bytes;
    assert.ok(calls < 100, 'the job finishes');
  }
  const output = [];
  for await (const part of codec.outputParts(checkpoint, host())) output.push(...part);
  return {output, unused};
}

test('a cold carried unit is not read first by calls that do not use it', async () => {
  const warm = await run(false), cold = await run(true);
  assert.deepEqual(warm.output, [15 + 2]);
  assert.deepEqual(cold.output, warm.output);
  assert.ok(warm.unused >= SIZE, `warm: ${warm.unused} bytes read in calls that do not use the state`);
  assert.ok(cold.unused < SIZE / 4, `cold: ${cold.unused} bytes read in calls that do not use the state`);
});

test('a cold plain unit is not read first by calls that do not use it', async () => {
  const warm = await run(false, true), cold = await run(true, true);
  assert.deepEqual(cold.output, warm.output);
  assert.ok(warm.unused >= SIZE, `warm: ${warm.unused} bytes read in calls that do not use the value`);
  assert.ok(cold.unused < SIZE / 4, `cold: ${cold.unused} bytes read in calls that do not use the value`);
});
