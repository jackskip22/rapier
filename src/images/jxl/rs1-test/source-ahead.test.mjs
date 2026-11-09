// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {unit} from '../step-journal.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';

const input = new Uint8Array(8 << 20), STEP = 65536, COUNT = 64;
let runs = 0;
for (let k = 0; k < COUNT; k++) input[k * STEP] = k + 1;
const codec = createJournalStepper({id: 'rs2/source-ahead', build: 'a'.repeat(64), normalize: () => ({budgetMs: 60000}),
  open: function* (plan, bytes) {
    return Uint8Array.of(yield* unit('sections', () => { runs++; let n = 0; for (let k = 0; k < COUNT; k++) n += bytes.subarray(k * STEP, k * STEP + 16)[0]; return n & 255; }));
  },
  result: bytes => ({kind: 'source-ahead', length: bytes.length})});

test('a unit that reads its source in order takes a few read rounds, not one a range', async () => {
  const source = {generation: 'rs2/source-ahead', sha256: await digest(input), byteLength: input.length}, parts = new Map(), reads = [];
  let checkpoint;
  const persist = t => { for (const {ref, bytes} of t.parts) parts.set(ref.hash, bytes.slice()); checkpoint = structuredClone(t.checkpoint); };
  const host = () => ({source, expectedRevision: checkpoint.revision, budgetMs: 60000,
    read: async ref => parts.get(ref.hash)?.slice(), readMany: async refs => refs.map(ref => parts.get(ref.hash)?.slice()),
    readSource: async (at, length) => { reads.push(length); return input.slice(at, at + length); }});
  persist(await codec.start({source, options: {}}));
  for (let calls = 0; checkpoint.status !== 'done'; calls++) { persist(await codec.advance(checkpoint, host(), {units: 64})); assert.ok(calls < 20); }
  const output = [];
  for await (const bytes of codec.outputParts(checkpoint, host())) output.push(...bytes);
  assert.deepEqual(output, [COUNT * (COUNT + 1) / 2 & 255]);
  assert.ok(runs <= 12, `${runs} attempts`);
  assert.ok(reads.every(length => length <= 1 << 20), 'every read is at most 1 MiB');
});
