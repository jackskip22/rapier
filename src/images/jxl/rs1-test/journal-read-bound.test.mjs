// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {unit, stage} from '../step-journal.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';

const COUNT = 8, SIZE = 6 << 20, INPUT = Uint8Array.of(7, 7);
const codec = createJournalStepper({id: 'rs2/journal-read-bound', build: '8'.repeat(64),
  normalize: () => ({budgetMs: Number.MIN_VALUE}),
  open: function* () {
    const values = [];
    for (let k = 0; k < COUNT; k++) values.push(yield* stage('value' + k, function* () { const data = new Uint8Array(SIZE); for (let i = 0; i < SIZE; i++) data[i] = Math.imul(i + k * SIZE, 2654435761) >>> 24; data[SIZE - 1] = k + 1; return {data}; }, undefined, false, true));
    for (let k = 0; k < 4; k++) yield* unit('filler' + k, () => k);
    let sum = 0;
    for (let k = 0; k < COUNT; k++) sum += yield* unit('use' + k, () => values[k].data.subarray(0, SIZE)[SIZE - 1]);
    return Uint8Array.of(sum);
  },
  result: bytes => ({kind: 'journal-read-bound', length: bytes.length})});

test('a call ends at a miss once it has read the bound of saved values, and the job finishes', async () => {
  const source = {generation: 'rs2/read-bound', sha256: await digest(INPUT), byteLength: INPUT.length}, parts = new Map();
  let checkpoint, bytes = 0, most = 0, calls = 0;
  const persist = t => { for (const {ref, bytes} of t.parts) parts.set(ref.hash, bytes.slice()); checkpoint = structuredClone(t.checkpoint); };
  const counted = found => { for (const part of found) bytes += part?.length ?? 0; return found; };
  const host = () => ({source, expectedRevision: checkpoint.revision, ...(calls >= COUNT + 6 && {budgetMs: 60000, deadline: performance.now() + 60000}),
    read: async ref => counted([parts.get(ref.hash)?.slice()])[0],
    readMany: async refs => counted(refs.map(ref => parts.get(ref.hash)?.slice())),
    readSource: async (at, count) => INPUT.slice(at, at + count)});
  persist(await codec.start({source, options: {}}));
  while (checkpoint.status !== 'done') {
    bytes = 0;
    persist(await codec.advance(checkpoint, host(), {units: calls < COUNT + 6 ? 1 : 64}));
    if (calls >= COUNT + 6) most = Math.max(most, bytes);
    assert.ok(++calls < 200, 'the job finishes');
  }
  const output = [];
  for await (const part of codec.outputParts(checkpoint, host())) output.push(...part);
  assert.deepEqual(output, [COUNT * (COUNT + 1) / 2]);
  assert.ok(most <= (16 << 20) + 2 * SIZE, `${(most / 1048576).toFixed(1)} MiB read in one call`);
});
