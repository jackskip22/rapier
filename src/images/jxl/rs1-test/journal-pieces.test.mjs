// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {unit, stage} from '../step-journal.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';

const SIZE = 3 << 20, INPUT = Uint8Array.of(1, 2, 3);
let made = false;
const codec = createJournalStepper({id: 'rs2/journal-pieces', build: '6'.repeat(64),
  normalize: () => ({budgetMs: Number.MIN_VALUE}),
  open: function* () {
    const value = yield* stage('big', function* () { made = true; const data = new Uint8Array(SIZE); for (let i = 0; i < SIZE; i += 4096) data[i] = i >> 12; return {data}; });
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += yield* unit('use' + k, () => value.data[k * 4096 * 100]);
    return Uint8Array.of(sum & 255, value.data.length >> 20);
  },
  result: bytes => ({kind: 'journal-pieces', length: bytes.length})});

test('a resumed value across pages is copied whole once (its arrays), not joined first', async () => {
  const source = {generation: 'rs2/pieces', sha256: await digest(INPUT), byteLength: INPUT.length}, parts = new Map();
  let checkpoint;
  const persist = t => { for (const {ref, bytes} of t.parts) parts.set(ref.hash, bytes.slice()); checkpoint = structuredClone(t.checkpoint); };
  const host = () => ({source, expectedRevision: checkpoint.revision,
    read: async ref => parts.get(ref.hash)?.slice(),
    readMany: async refs => refs.map(ref => parts.get(ref.hash)?.slice()),
    readSource: async (at, count) => INPUT.slice(at, at + count)});
  persist(await codec.start({source, options: {}}));
  const Plain = globalThis.Uint8Array;
  let whole = 0, most = 0;
  globalThis.Uint8Array = new Proxy(Plain, {construct(target, args, next) {
    if (typeof args[0] === 'number' && args[0] >= SIZE) whole++;
    return Reflect.construct(target, args, next);
  }});
  const slice = Plain.prototype.slice;
  Plain.prototype.slice = function (...args) { const out = slice.apply(this, args); if (out.length >= SIZE) whole++; return out; };
  try {
    for (let calls = 0; checkpoint.status !== 'done'; calls++) {
      whole = 0;
      persist(await codec.advance(checkpoint, host(), {units: 1}));
      if (!made) most = Math.max(most, whole);
      made = false;
      assert.ok(calls < 100, 'the job finishes');
    }
  } finally { globalThis.Uint8Array = Plain; Plain.prototype.slice = slice; }
  const output = [];
  for await (const bytes of codec.outputParts(checkpoint, host())) output.push(...bytes);
  assert.deepEqual(output, [0 + 100 + 200 + 300 & 255, 3]);
  assert.ok(most <= 1, `${most} whole copies in a call that reads it`);
});
