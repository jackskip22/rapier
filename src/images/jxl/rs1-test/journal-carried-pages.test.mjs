// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {unit, carried, journalJoin} from '../step-journal.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';

test('retained output releases superseded carried storage', async t => {
  const input = Uint8Array.of(17), size = 1 << 20, count = 8, parts = new Map();
  const source = {generation: 'carried-pages', sha256: await digest(input), byteLength: input.length};
  const codec = createJournalStepper({id: 'test/carried-pages', build: '8'.repeat(64),
    normalize: () => ({budgetMs: Number.MIN_VALUE}),
    open: function* () {
      const tokens = [];
      for (let i = 0; i < count; i++) {
        tokens.push(yield* unit('token', () => Uint8Array.of(i)));
        yield* carried('cursor', () => null, () => new Uint8Array(size).fill(i + 1), true);
      }
      return journalJoin(tokens);
    }});
  let checkpoint, peak = 0, calls = 0;
  const keep = transition => {
    for (const {ref, bytes} of transition.parts) parts.set(ref.hash, bytes);
    for (const ref of transition.released ?? []) parts.delete(ref.hash);
    checkpoint = structuredClone(transition.checkpoint);
    peak = Math.max(peak, [...parts.values()].reduce((n, bytes) => n + bytes.length, 0));
  };
  const host = () => ({source, expectedRevision: checkpoint.revision,
    readSource: async (offset, length) => input.slice(offset, offset + length),
    read: async ref => parts.get(ref.hash), readMany: async refs => refs.map(ref => parts.get(ref.hash))});
  keep(await codec.start({source}));
  while (checkpoint.status !== 'done' && calls++ < 64) keep(await codec.advance(checkpoint, host(), {units: 1}));
  assert.equal(checkpoint.status, 'done', 'the saved job completes');
  assert.deepEqual(await codec.output(checkpoint, host(), length => new Uint8Array(length)), Uint8Array.from({length: count}, (_, i) => i));
  assert.ok(peak < 2 * size, `retained ${peak} bytes for one live ${size}-byte cursor and ${count} output bytes`);
  t.diagnostic(JSON.stringify({peakStoreBytes: peak, cursorBytes: size, outputBytes: count, advances: calls}));
});
