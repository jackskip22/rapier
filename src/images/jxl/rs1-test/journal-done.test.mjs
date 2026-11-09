// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {unit, stage, journalDone} from '../step-journal.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';

const COUNT = 6, SIZE = 2 << 20, INPUT = Uint8Array.of(6, 6);
const codecOf = done => createJournalStepper({id: 'rs2/journal-done-' + done, build: 'c'.repeat(64), normalize: () => ({budgetMs: Number.MIN_VALUE}),
  open: function* () {
    return yield* stage('split', function* () {
      const bands = [];
      for (let k = 0; k < COUNT; k++) bands.push(yield* unit('band', () => {
        const data = new Uint8Array(SIZE);
        for (let i = 0; i < SIZE; i++) data[i] = Math.imul(i + k * SIZE, 2654435761) >>> 24;
        data[SIZE - 1] = k + 1;
        return {data};
      }));
      let sum = 0;
      for (let k = 0; k < COUNT; k++) { sum += yield* unit('use', () => bands[k].data.subarray(0, SIZE)[SIZE - 1]); if (done) journalDone(bands[k]); }
      for (let k = 0; k < COUNT; k++) sum += yield* unit('frame', () => k);
      return Uint8Array.of(sum);
    });
  },
  result: bytes => ({kind: 'journal-done', length: bytes.length})});

async function run(done) {
  const codec = codecOf(done), source = {generation: 'rs2/done', sha256: await digest(INPUT), byteLength: INPUT.length}, parts = new Map();
  let checkpoint, bytes = 0, frames = 0;
  const persist = t => { for (const {ref, bytes} of t.parts) parts.set(ref.hash, bytes.slice()); checkpoint = structuredClone(t.checkpoint); };
  const counted = found => { for (const part of found) bytes += part?.length ?? 0; return found; };
  const host = () => ({source, expectedRevision: checkpoint.revision,
    read: async ref => counted([parts.get(ref.hash)?.slice()])[0], readMany: async refs => counted(refs.map(ref => parts.get(ref.hash)?.slice())),
    readSource: async (at, count) => INPUT.slice(at, at + count)});
  persist(await codec.start({source, options: {}}));
  for (let calls = 0; checkpoint.status !== 'done'; calls++) {
    bytes = 0;
    persist(await codec.advance(checkpoint, host(), {units: 1}));
    if (calls >= 3 * COUNT - 2) frames += bytes;
    assert.ok(calls < 100, 'the job finishes');
  }
  const output = [];
  for await (const part of codec.outputParts(checkpoint, host())) output.push(...part);
  return {output, frames};
}

test('values a coder marks done are not read first by the calls after', async () => {
  const plain = await run(false), done = await run(true);
  assert.deepEqual(done.output, plain.output);
  assert.deepEqual(done.output, [COUNT * (COUNT + 1) / 2 + COUNT * (COUNT - 1) / 2]);
  assert.ok(plain.frames >= 4 * SIZE, `without journalDone: ${(plain.frames / 1048576).toFixed(1)} MiB read by the frame calls`);
  assert.ok(done.frames < SIZE, `with journalDone: ${(done.frames / 1048576).toFixed(1)} MiB read by the frame calls`);
});
