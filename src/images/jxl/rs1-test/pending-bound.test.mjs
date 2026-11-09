// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {unit, stage} from '../step-journal.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';

const PIECE = 1 << 20, INPUT = Uint8Array.of(7);
const codec = createJournalStepper({id: 'rs2/pending-bound', build: '8'.repeat(64),
  normalize: () => ({budgetMs: 60000}),
  open: function* () {
    let total = 0;
    for (let s = 0; s < 2; s++) total += yield* stage('sum' + s, function* () {
      let sum = 0;
      for (let k = 0; k < 12; k++) {
        const piece = yield* unit('piece', () => { const data = new Uint8Array(PIECE); for (let i = 0; i < PIECE; i += 4096) data[i] = (i >> 12) + k + s; return {data}; });
        sum += piece.data[4096 * 3];
      }
      return sum;
    });
    return Uint8Array.of(total & 255);
  }});

test('children that leave the journal do not end a call by the pending-write bound', async () => {
  const source = {generation: 'rs2/pending-bound', sha256: await digest(INPUT), byteLength: INPUT.length}, parts = new Map();
  let checkpoint, calls = 0;
  const persist = t => { for (const {ref, bytes} of t.parts) parts.set(ref.hash, bytes.slice()); checkpoint = structuredClone(t.checkpoint); };
  const host = () => ({source, expectedRevision: checkpoint.revision, read: async ref => parts.get(ref.hash)?.slice(),
    readMany: async refs => refs.map(ref => parts.get(ref.hash)?.slice()), readSource: async (at, count) => INPUT.slice(at, at + count)});
  persist(await codec.start({source, options: {}}));
  for (; checkpoint.status !== 'done'; calls++) { persist(await codec.advance(checkpoint, host(), {units: 2})); assert.ok(calls < 20); }
  const output = [];
  for await (const part of codec.outputParts(checkpoint, host())) output.push(...part);
  assert.deepEqual(output, [(2 * (12 * 3 + 66) + 12) & 255]);
  assert.equal(calls, 1, `${calls} calls`);
});
