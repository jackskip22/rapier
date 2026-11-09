// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {unit, stage} from '../step-journal.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';

const COUNT = 6, SIZE = 1536 << 10, INPUT = Uint8Array.of(4, 5, 6);
const codec = createJournalStepper({id: 'rs2/journal-reuse', build: '7'.repeat(64),
  normalize: () => ({budgetMs: Number.MIN_VALUE}),
  open: function* () {
    const values = [];
    for (let k = 0; k < COUNT; k++) values.push(yield* stage('value' + k, function* () { return {data: new Uint8Array(SIZE).fill(k + 1)}; }, undefined, false, true));
    for (let k = 0; k < 20; k++) yield* unit('filler' + k, () => k);
    return Uint8Array.of(yield* unit('sum', () => { const first = values[0].data[0]; values[0].data[0] = 99; return values.reduce((n, v, k) => n + (k ? v.data[0] : first), 0); }));
  },
  result: bytes => ({kind: 'journal-reuse', length: bytes.length})});

test('a call\'s attempts copy an unchanged saved value once', async () => {
  const source = {generation: 'rs2/reuse', sha256: await digest(INPUT), byteLength: INPUT.length}, parts = new Map();
  let checkpoint, copies = 0, most = 0;
  const persist = t => { for (const {ref, bytes} of t.parts) parts.set(ref.hash, bytes.slice()); checkpoint = structuredClone(t.checkpoint); };
  const host = () => ({source, expectedRevision: checkpoint.revision,
    read: async ref => parts.get(ref.hash)?.slice(),
    readMany: async refs => refs.map(ref => parts.get(ref.hash)?.slice()),
    readSource: async (at, count) => INPUT.slice(at, at + count)});
  persist(await codec.start({source, options: {}}));
  const Plain = Uint8Array, slice = Plain.prototype.slice;
  Plain.prototype.slice = function (...args) { const out = slice.apply(this, args); if (out.length === SIZE) copies++; return out; };
  try {
    for (let calls = 0; checkpoint.status !== 'done'; calls++) {
      copies = 0;
      persist(await codec.advance(checkpoint, host(), {units: 1}));
      most = Math.max(most, copies);
      assert.ok(calls < 100, 'the job finishes');
    }
  } finally { Plain.prototype.slice = slice; }
  const output = [];
  for await (const bytes of codec.outputParts(checkpoint, host())) output.push(...bytes);
  assert.deepEqual(output, [COUNT * (COUNT + 1) / 2]);
  assert.ok(most <= 2 * COUNT, `${most} copies in one call`);
});
