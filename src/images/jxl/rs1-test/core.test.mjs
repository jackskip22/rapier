// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import test from 'node:test';
import {Worker} from 'node:worker_threads';
import {createStepper} from '../resumable-encode.mjs';
import {digest, decodeData} from '../resumable-data.mjs';
import {adapter, stepper} from './core-fixture.mjs';

const bytes = n => Uint8Array.from({length: n}, (_, i) => (i * 71 + (i >>> 8)) & 255);
const join = parts => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const expected = source => Uint8Array.from(source, b => b ^ 37);
const code = c => error => error.code === c;

async function setup(input, codec = stepper()) {
  const source = {generation: 'fixture/1', sha256: await digest(input), byteLength: input.length};
  const parts = new Map();
  let checkpoint, sourceReads = 0, writes = 0;
  const persist = result => { for (const {ref, bytes: b} of result.parts) { if (parts.has(ref.hash)) assert.deepEqual(parts.get(ref.hash), b); else { parts.set(ref.hash, new Uint8Array(b)); writes++; } } };
  const initial = await codec.start({source}); persist(initial); checkpoint = initial.checkpoint;
  const host = cp => ({source, expectedRevision: cp.revision, readMany: refs => refs.map(ref => parts.get(ref.hash)), read: ref => parts.get(ref.hash),
    readSource: (at, n) => { sourceReads++; return input.subarray(at, at + n); }});
  const step = async (units = 1) => { const r = await codec.advance(checkpoint, host(checkpoint), {units}); persist(r); checkpoint = r.checkpoint; return r; };
  const output = async () => { const pieces = []; for await (const p of codec.outputParts(checkpoint, host(checkpoint))) pieces.push(p); return join(pieces); };
  return {codec, source, parts, persist, host, step, output, get checkpoint() { return checkpoint; }, set checkpoint(c) { checkpoint = c; },
    get sourceReads() { return sourceReads; }, get writes() { return writes; }};
}

test('random work partitions give the same file; the original is checked once, then each call that reads it reads it whole and checks it', async () => {
  const input = bytes(3 * 1048576 + 79), visited = [], job = await setup(input, stepper(at => visited.push(at)));
  let count = 0, reading = 0;
  while (job.checkpoint.status !== 'done') {
    const result = await job.step([1, 4, 2, 3][count++ % 4]);
    if (result.work.some(w => w.phase === 'transform')) reading++;
    assert.ok(JSON.stringify(result.checkpoint).length < 4096);
    for (const p of result.parts) assert.ok(p.bytes.length <= 1048576);
  }
  assert.deepEqual(await job.output(), expected(input));
  assert.deepEqual(visited, Array.from({length: Math.ceil(input.length / 3073)}, (_, i) => i * 3073));
  assert.equal(job.sourceReads, 2 + reading, 'two digest reads, then one checked whole read per call that reads');
});

test('a fresh isolate for every step reuses its completed prefix', async () => {
  const input = bytes(16000), job = await setup(input), visited = [];
  while (job.checkpoint.status !== 'done') {
    const reply = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./core-isolate.mjs', import.meta.url), {workerData: {checkpoint: job.checkpoint, parts: [...job.parts], bytes: input, source: job.source, units: 1}});
      worker.once('message', resolve); worker.once('error', reject);
    });
    assert.equal(reply.error, undefined); visited.push(...reply.visited);
    job.persist(reply.result); job.checkpoint = reply.result.checkpoint;
  }
  assert.deepEqual(await job.output(), expected(input));
  assert.deepEqual(visited, [0, 3073, 6146, 9219, 12292, 15365]);
});

test('a retry after the parts were kept but before the checkpoint was saved gives the same checkpoint and no new parts', async () => {
  const input = bytes(16000), job = await setup(input);
  while (job.checkpoint.status !== 'done') {
    const before = structuredClone(job.checkpoint), first = await job.codec.advance(before, job.host(before));
    job.persist(first); const writes = job.writes;
    const retry = await stepper().advance(JSON.parse(JSON.stringify(before)), job.host(before));
    assert.equal(retry.transition, first.transition); assert.deepEqual(retry.checkpoint, first.checkpoint);
    job.persist(retry); assert.equal(job.writes, writes);
    job.checkpoint = retry.checkpoint;
  }
  assert.deepEqual(await job.output(), expected(input));
});

test('stale, completed, changed-source and other-build checkpoints refuse before codec work', async () => {
  let visits = 0; const codec = stepper(() => visits++), job = await setup(bytes(100), codec), cp = job.checkpoint;
  await assert.rejects(codec.advance(cp, {...job.host(cp), expectedRevision: 1}), code('JXL_INPUT'));
  await assert.rejects(codec.advance(cp, {...job.host(cp), source: {...job.source, generation: 'fixture/2'}}), code('JXL_INPUT'));
  await assert.rejects(createStepper(adapter(undefined, '2'.repeat(64))).advance(cp, job.host(cp)), code('JXL_INPUT'));
  for (const change of [c => { c.schema = 1; }, c => { c.revision = 7; }, c => { c.plan = {options: {mask: 1}}; }, c => { delete c.state; }, c => { c.status = 'done'; }])
    { const changed = structuredClone(cp); change(changed); await assert.rejects(codec.advance(changed, job.host(changed)), code('JXL_INPUT')); }
  assert.equal(visits, 0);
  while (job.checkpoint.status !== 'done') await job.step();
  await assert.rejects(codec.advance(job.checkpoint, job.host(job.checkpoint)), code('JXL_INPUT'));
});

test('a tampered, truncated or missing state part and a changed original refuse', async () => {
  const input = bytes(100), job = await setup(input), cp = job.checkpoint, saved = job.parts.get(cp.state.hash);
  const bad = saved.slice(); bad[bad.length >> 1] ^= 1; job.parts.set(cp.state.hash, bad);
  await assert.rejects(job.codec.advance(cp, job.host(cp)), code('JXL_INPUT'));
  job.parts.set(cp.state.hash, saved.subarray(1)); await assert.rejects(job.codec.advance(cp, job.host(cp)), code('JXL_INPUT'));
  job.parts.delete(cp.state.hash); await assert.rejects(job.codec.advance(cp, job.host(cp)), code('JXL_INPUT'));
  job.parts.set(cp.state.hash, saved);
  const other = input.slice(); other[50] ^= 1;
  await assert.rejects(job.codec.advance(cp, {...job.host(cp), readSource: (at, n) => other.subarray(at, at + n)}), code('JXL_INPUT'));
  await assert.rejects(job.codec.advance(cp, {...job.host(cp), readSource: (at, n) => input.subarray(at, at + n - 1)}), code('JXL_INPUT'));
  assert.equal(decodeData(job.parts.get(cp.state.hash)).phase, 'verify');
});

test('cancellation before and during reads returns nothing; unsupported budgets refuse', async () => {
  const job = await setup(bytes(100)), cp = job.checkpoint, cancel = new AbortController(); cancel.abort();
  await assert.rejects(job.codec.advance(cp, {...job.host(cp), signal: cancel.signal}), code('JXL_ABORTED'));
  const during = new AbortController(), host = job.host(cp);
  await assert.rejects(job.codec.advance(cp, {...host, signal: during.signal, readSource: (at, n) => { during.abort(); return host.readSource(at, n); }}), code('JXL_ABORTED'));
  for (const budget of [{units: 0}, {units: 65}, {units: 1.5}, {milliseconds: 50}])
    await assert.rejects(job.codec.advance(cp, job.host(cp), budget), code('JXL_INPUT'));
});
