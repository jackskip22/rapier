// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest, decodeData} from '../resumable-data.mjs';
import {carried, unit, readAll} from '../step-journal.mjs';

const MiB = 1 << 20, copyJSON = value => JSON.parse(JSON.stringify(value));
const job = async (open, input, budgetMs = 60000) => {
  const codec = createJournalStepper({id: 'rs3/hold-bound', build: 'e'.repeat(64), normalize: () => ({budgetMs}), open});
  const parts = new Map(), source = {generation: 'rs3/hold', byteLength: input.length, sha256: await digest(input)};
  let checkpoint;
  const keep = value => { for (const {ref, bytes} of value.parts) parts.set(ref.hash, bytes.slice()); checkpoint = copyJSON(value.checkpoint); };
  const host = () => ({source, expectedRevision: checkpoint.revision, read: ref => parts.get(ref.hash),
    readMany: refs => refs.map(ref => parts.get(ref.hash)), readSource: (at, count) => input.subarray(at, at + count)});
  keep(await codec.start({source, options: {}}));
  while (decodeData(parts.get(checkpoint.state.hash)).phase === 'verify') keep(await codec.advance(checkpoint, host(), {units: 1}));
  return {advance: async () => { const result = await codec.advance(checkpoint, host(), {units: 1}); keep(result); return result; }};
};

test('a call holds its carried values within its bound and reports its peak', async () => {
  const input = new Uint8Array(MiB).fill(3), peaks = [];
  const observe = Symbol.for('rapier-jxl.journal.observe');
  globalThis[observe] = work => peaks.push(work.hold);
  try {
    const run = await job(function* (plan, bytes) {
      let last = 0;
      for (let i = 0; i < 6; i++) last = (yield* carried('place', () => new Uint8Array(8 * MiB).fill(i)))?.[0] ?? last;
      return Uint8Array.of(bytes[0] + last);
    }, input);
    let result;
    do result = await run.advance(); while (!result.done);
    assert.ok(peaks.length > 0 && peaks.every(({peak, limit}) => peak > 0 && peak <= limit && limit === 2 * MiB + 64 * MiB));
  } finally { delete globalThis[observe]; }
});

test('a call over its bound is refused', async () => {
  const run = await job(function* () {
    const big = yield* unit('big', () => new Uint8Array(72 * MiB).fill(1));
    return big.subarray(0, 1);
  }, new Uint8Array(1024).fill(5));
  await assert.rejects(run.advance(), error => error.code === 'JXL_MEMORY');
});

test('a restored value counts as its decoded copy (and the page it was read through): a new value beside it passes the bound or not', async () => {
  const twoCalls = async more => {
    const run = await job(function* () {
      const saved = yield* unit('saved', () => new Uint8Array(28 * MiB).fill(2));
      const made = yield* unit('made', () => new Uint8Array(more * MiB).fill(saved[0]));
      return made.subarray(0, 1);
    }, new Uint8Array(1024).fill(5), Number.MIN_VALUE);
    assert.equal((await run.advance()).done, false);
    let result;
    do result = await run.advance(); while (!result.done);
  };
  await twoCalls(34);
  await assert.rejects(twoCalls(37), error => error.code === 'JXL_MEMORY');
});

test('superseded carried values release their decoded copies', async () => {
  const run = await job(function* () {
    let last = 0;
    for (let i = 0; i < 6; i++) last = (yield* carried('place', () => new Uint8Array(24 * MiB).fill(i + last)))?.[0] ?? last;
    return Uint8Array.of(last);
  }, new Uint8Array(1024).fill(5), Number.MIN_VALUE);
  let result;
  do result = await run.advance(); while (!result.done);
});

test('saved values restored together in one call, each within the bound, together over it, are refused', async () => {
  const run = await job(function* () {
    const values = [];
    for (let i = 0; i < 3; i++) values.push(yield* unit('saved', () => new Uint8Array(24 * MiB).fill(i + 1)));
    readAll(values);
    return Uint8Array.of(values[0][0] + values[1][0] + values[2][0]);
  }, new Uint8Array(1024).fill(5), Number.MIN_VALUE);
  await assert.rejects(async () => { let result; do result = await run.advance(); while (!result.done); }, error => error.code === 'JXL_MEMORY');
});

test('a value decoded again in the same call, unchanged, adds nothing to the bound', async () => {
  const run = await job(function* (plan, bytes) {
    const a = yield* unit('a', () => new Uint8Array(34 * MiB).fill(2));
    const b = yield* unit('b', () => new Uint8Array(MiB).fill(3));
    const c = yield* unit('c', () => Uint8Array.of(1));
    return Uint8Array.of(a[0] + b[0] + c[0] + bytes[0]);
  }, new Uint8Array(1024).fill(5), Number.MIN_VALUE);
  let result;
  do result = await run.advance(); while (!result.done);
});
