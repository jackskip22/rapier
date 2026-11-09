// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {unit, stage} from '../step-journal.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';

const COUNT = 12, INPUT = Uint8Array.of(9, 8, 7, 6);
const codec = createJournalStepper({id: 'rs2/miss-rounds', build: '5'.repeat(64),
  normalize: () => ({budgetMs: Number.MIN_VALUE}),
  open: function* () {
    const values = [];
    for (let k = 0; k < COUNT; k++) values.push(yield* stage('value' + k, function* () { return {data: new Uint8Array(1536 << 10).fill(k + 1)}; }, undefined, false, true));
    for (let k = 0; k < 20; k++) yield* unit('filler' + k, () => k);
    return Uint8Array.of(yield* unit('sum', () => values.reduce((n, v) => n + v.data[0], 0)));
  },
  result: bytes => ({kind: 'miss-rounds', length: bytes.length})});

test('a call that keeps missing values ends after a few read rounds, and the job still finishes', async () => {
  const source = {generation: 'rs2/miss', sha256: await digest(INPUT), byteLength: INPUT.length}, parts = new Map();
  let checkpoint, reads = 0, most = 0, calls = 0;
  const persist = t => { for (const {ref, bytes} of t.parts) parts.set(ref.hash, bytes.slice()); checkpoint = structuredClone(t.checkpoint); };
  const host = () => ({source, expectedRevision: checkpoint.revision, reads: 5,
    read: async ref => { reads++; return parts.get(ref.hash)?.slice(); },
    readMany: async refs => { reads++; return refs.map(ref => parts.get(ref.hash)?.slice()); },
    readSource: async (at, count) => { reads++; return INPUT.slice(at, at + count); }});
  persist(await codec.start({source, options: {}}));
  while (checkpoint.status !== 'done') {
    reads = 0;
    persist(await codec.advance(checkpoint, host(), {units: 1}));
    most = Math.max(most, reads);
    assert.ok(++calls < 100, 'the job finishes');
  }
  const output = [];
  for await (const bytes of codec.outputParts(checkpoint, host())) output.push(...bytes);
  assert.deepEqual(output, [COUNT * (COUNT + 1) / 2]);
  assert.ok(most <= 6, `${most} reads in one call`);
});

test('a full pending buffer persists before another journal transition in the same advance', async () => {
  const visited = [], source = {generation: 'pb1/pending', sha256: await digest(INPUT), byteLength: INPUT.length};
  const make = () => createJournalStepper({id: 'pb1/pending', build: '6'.repeat(64), normalize: () => ({budgetMs: 60000}),
    open: function* () {
      const sizes = [];
      for (let i = 0; i < 2; i++) {
        const value = yield* stage('band-' + i, function* () {
          visited.push(i); return new Uint8Array((16 << 20) + 1).fill(i + 1);
        }, undefined, false, true);
        sizes.push(value.length);
      }
      return Uint8Array.from(sizes, length => length >>> 20);
    }});
  const parts = new Map(); let checkpoint;
  const keep = result => { for (const {ref, bytes} of result.parts) parts.set(ref.hash, bytes.slice()); checkpoint = JSON.parse(JSON.stringify(result.checkpoint)); };
  const host = () => ({source, expectedRevision: checkpoint.revision, budgetMs: 60000,
    read: ref => parts.get(ref.hash), readMany: refs => refs.map(ref => parts.get(ref.hash)),
    readSource: (at, count) => INPUT.slice(at, at + count)});
  keep(await make().start({source}));
  const first = await make().advance(checkpoint, host(), {units: 64}); keep(first);
  assert.equal(first.done, false); assert.deepEqual(visited, [0], 'the second band waits for another persisted advance');
  for (let n = 0; checkpoint.status !== 'done'; n++) {
    assert.ok(n < 6, 'saved large values resume without repeating work'); keep(await make().advance(checkpoint, host(), {units: 64}));
  }
  assert.deepEqual(visited, [0, 1]);
  const output = []; for await (const bytes of make().outputParts(checkpoint, host())) output.push(...bytes);
  assert.deepEqual(output, [16, 16]);
});

test('many small source ranges never promote a bounded reader to a whole-file read', async () => {
  const input = new Uint8Array(8 << 20), offsets = Array.from({length: 12}, (_, i) => i * 400000);
  offsets.forEach((at, i) => { input[at] = i + 1; });
  const source = {generation: 'pb1/ranges', sha256: await digest(input), byteLength: input.length};
  const make = () => createJournalStepper({id: 'pb1/ranges', build: '7'.repeat(64), normalize: () => ({budgetMs: 60000}),
    open: function* (plan, bytes) {
      const values = [];
      for (const at of offsets) values.push(yield* unit('fragment', () => bytes.subarray(at, at + 1)[0]));
      return Uint8Array.from(values);
    }});
  const parts = new Map(), reads = []; let checkpoint;
  const keep = value => {
    for (const {ref, bytes} of value.parts) parts.set(ref.hash, bytes.slice());
    checkpoint = JSON.parse(JSON.stringify(value.checkpoint));
  };
  const host = () => ({source, expectedRevision: checkpoint.revision, budgetMs: 60000,
    read: ref => parts.get(ref.hash), readMany: refs => refs.map(ref => parts.get(ref.hash)),
    readSource: (at, length) => { reads.push({at, length}); return input.slice(at, at + length); }});
  keep(await make().start({source}));
  for (let i = 0; checkpoint.status !== 'done'; i++) {
    assert.ok(i < 100, 'the sparse reader finishes'); keep(await make().advance(checkpoint, host(), {units: 1}));
  }
  const output = []; for await (const bytes of make().outputParts(checkpoint, host())) output.push(...bytes);
  assert.deepEqual(output, offsets.map((_, i) => i + 1));
  assert.ok(reads.every(({length}) => length <= 1 << 20), 'source authentication and range reads remain at most 1 MiB');
});
