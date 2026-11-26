// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {unit, journalJoin} from '../step-journal.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';

const PART = 1 << 20;
for (const count of [4, 17]) test(`a joined file of ${count} MiB whose parts are its pieces' pages survives deleting released parts`, async () => {
  const input = Uint8Array.of(42), parts = new Map();
  const source = {generation: 'released-output', sha256: await digest(input), byteLength: input.length};
  const piece = i => { const b = new Uint8Array(PART); b[0] = i + 1; return b; };
  const codec = createJournalStepper({id: 'test/released-output', build: 'e'.repeat(64), normalize: () => ({budgetMs: 5}),
    open: function* () {
      const pieces = [];
      for (let i = 0; i < count; i++) pieces.push(yield* unit('chunk', () => piece(i), undefined, false, false));
      return journalJoin(pieces);
    }});
  let checkpoint, calls = 0;
  const keep = transition => {
    for (const {ref, bytes} of transition.parts) parts.set(ref.hash, bytes);
    for (const ref of transition.released ?? []) parts.delete(ref.hash);
    checkpoint = structuredClone(transition.checkpoint);
  };
  const host = () => ({source, expectedRevision: checkpoint.revision,
    readSource: async (offset, length) => input.slice(offset, offset + length),
    read: async ref => parts.get(ref.hash), readMany: async refs => refs.map(ref => parts.get(ref.hash))});
  keep(await codec.start({source}));
  while (checkpoint.status !== 'done' && calls++ < 256) keep(await codec.advance(checkpoint, host(), {units: 1}));
  assert.equal(checkpoint.status, 'done');
  const out = await codec.output(checkpoint, host(), length => new Uint8Array(length));
  assert.equal(out.length, count * PART);
  for (let i = 0; i < count; i++) assert.equal(out[i * PART], i + 1);
});
