// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {isMainThread, parentPort, Worker, workerData} from 'node:worker_threads';
import {createStepper, partsIO} from '../resumable-encode.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {prefetchParts} from '../resumable-prefetch.mjs';
import {digest, decodeData} from '../resumable-data.mjs';
import {SAVED, PASSED, stage, unit} from '../step-journal.mjs';

const MiB = 1 << 20, BAND = MiB / 2, COUNT = 24;
const refusal = error => error.code === 'JXL_INPUT';
const pinned = async (bytes, generation) => ({generation, byteLength: bytes.length, sha256: await digest(bytes)});
const copyJSON = value => JSON.parse(JSON.stringify(value));
const fixture = async (codec, input, options = {}, saved = new Map()) => {
  const parts = new Map(saved), source = await pinned(input, 'pb1/read-frontier');
  let checkpoint;
  const keep = value => { for (const {ref, bytes} of value.parts) parts.set(ref.hash, bytes.slice()); checkpoint = copyJSON(value.checkpoint); };
  const host = (extra = {}) => ({source, expectedRevision: checkpoint.revision,
    read: ref => parts.get(ref.hash), readMany: refs => refs.map(ref => parts.get(ref.hash)),
    readSource: (at, count) => input.subarray(at, at + count), ...extra});
  keep(await codec.start({source, options}));
  const hash = async () => {
    while (decodeData(parts.get(checkpoint.state.hash)).phase === 'verify') keep(await codec.advance(checkpoint, host(), {units: 1}));
  };
  return {parts, source, keep, host, hash, get checkpoint() { return checkpoint; }};
};
function compareCodec(visited = []) {
  return createJournalStepper({id: 'pb1/read-bands', build: '8'.repeat(64),
    normalize: options => ({budgetMs: 60000, refs: options.refs}),
    async run(plan, input, source, request) {
      let sum = 0;
      for (let i = 0; i < plan.refs.length; i++) {
        const saved = await request({unit: 'compare-band', carry: true});
        if (saved) { if (saved[SAVED] !== PASSED) sum = saved[SAVED]; continue; }
        let next;
        try {
          const band = input.subarray(i * BAND, (i + 1) * BAND), part = await request.part(plan.refs[i]);
          next = sum + band[0] + band.at(-1) + part[0] + part.at(-1);
        } catch (error) { await request({unitFailed: 'compare-band'}); throw error; }
        await request({unitDone: 'compare-band', value: next});
        visited.push(i); sum = next;
      }
      return {bytes: Uint8Array.of(sum & 255, sum >>> 8), facts: {sum}};
    }});
}
if (!isMainThread) {
  const parts = new Map(workerData.parts), visited = [], codec = compareCodec(visited);
  try {
    const result = await codec.advance(workerData.checkpoint, {
      source: workerData.source, expectedRevision: workerData.checkpoint.revision, budgetMs: 60000,
      read: ref => parts.get(ref.hash), readMany: refs => refs.map(ref => parts.get(ref.hash)),
      readSource: (at, count) => workerData.input.subarray(at, at + count)
    }, {units: 64});
    parentPort.postMessage({result, visited});
  } catch (error) { parentPort.postMessage({error: {code: error.code, message: error.message, stack: error.stack}}); }
} else {
  test('immutable read batches evict old pages, authenticate rereads and retain pending writes', async () => {
    const values = Array.from({length: 18}, (_, i) => new Uint8Array(MiB).fill(i + 1));
    const refs = await Promise.all(values.map(async bytes => ({hash: await digest(bytes), length: bytes.length})));
    const stored = new Map(refs.map((ref, i) => [ref.hash, values[i]])), batches = [];
    let singles = 0;
    const io = partsIO(ref => { singles++; return stored.get(ref.hash); }, undefined, true,
      asked => { batches.push(asked.map(ref => ref.hash)); return asked.map(ref => stored.get(ref.hash)); });
    const pending = await io.write(Uint8Array.of(251, 252, 253));
    const observed = [];
    await prefetchParts(io, refs, async batch => {
      for (const ref of batch) { const bytes = await io.borrow(ref); observed.push(bytes[0]); }
    });
    assert.deepEqual(observed, values.map(bytes => bytes[0]));
    assert.deepEqual(batches.map(batch => batch.length), [8, 8, 2]);
    assert.equal(singles, 0, 'ordered batches above the cache cap never fall back to single reads');
    assert.equal(io.callsRead(), 3); assert.equal(io.bytesRead(), 18 * MiB);
    assert.deepEqual(await io.read(pending), Uint8Array.of(251, 252, 253), 'unpersisted writes are not cache entries');
    await io.read(refs.at(-1)); assert.equal(singles, 0, 'recent pages are cached');
    stored.set(refs[0].hash, new Uint8Array(MiB).fill(255));
    await assert.rejects(io.read(refs[0]), refusal);
    assert.equal(singles, 1, 'old pages were evicted and are authenticated again');
  });

  test('authenticated source chunks evict independently and a range larger than the cache stays exact', async () => {
    const CHUNK = MiB / 4, input = new Uint8Array(6 * MiB);
    for (let i = 0; i < input.length / CHUNK; i++) input.fill(i + 1, i * CHUNK, (i + 1) * CHUNK);
    const codec = createStepper({id: 'pb1/source-cache', build: '9'.repeat(64), normalize: () => ({}), start: () => ({}),
      async step(state, io) {
        const samples = [];
        for (let i = 0; i < 21; i++) samples.push((await io.readSource(i * CHUNK, 1))[0]);
        samples.push((await io.readSource(20 * CHUNK, 1))[0], (await io.readSource(0, 1))[0]);
        const range = await io.readSource(17, 5 * MiB + 123);
        return {state, output: Uint8Array.from(samples), result: {range: await digest(range)}};
      }});
    const job = await fixture(codec, input); await job.hash();
    const reads = [];
    const result = await codec.advance(job.checkpoint, job.host({readSource: (at, length) => {
      reads.push({at, length}); return input.subarray(at, at + length);
    }}));
    assert.equal(result.done, true);
    assert.equal(reads.filter(({at, length}) => at === 0 && length === CHUNK).length, 2, 'the oldest chunk left the 4 MiB cache');
    assert.equal(reads.filter(({at, length}) => at === 20 * CHUNK && length === CHUNK).length, 1, 'the recent chunk remains cached');
    assert.equal(result.output.result.range, await digest(input.subarray(17, 17 + 5 * MiB + 123)));
    let firstReads = 0;
    await assert.rejects(codec.advance(job.checkpoint, job.host({readSource: (at, length) => {
      const bytes = input.slice(at, at + length);
      if (at === 0 && ++firstReads === 2) bytes[0] ^= 1;
      return bytes;
    }})), refusal);
    assert.equal(firstReads, 2, 'the changed evicted chunk is refused before reaching the unit');
  });

  test('a long advance with tiny carried values stops reading bands and fresh isolates finish identically', async () => {
    const input = new Uint8Array(COUNT * BAND), saved = new Map(), refs = [];
    for (let i = 0; i < COUNT; i++) {
      input.fill(i + 1, i * BAND, (i + 1) * BAND);
      const bytes = new Uint8Array(BAND).fill(i + 31), ref = {hash: await digest(bytes), length: bytes.length};
      refs.push(ref); saved.set(ref.hash, bytes);
    }
    const visited = [], codec = compareCodec(visited), job = await fixture(codec, input, {refs}, saved);
    await job.hash();
    const first = await codec.advance(job.checkpoint, job.host({budgetMs: 60000}), {units: 64}); job.keep(first);
    const work = first.work.find(row => row.phase === 'journal');
    assert.equal(first.done, false);
    assert.ok(visited.length > 1 && visited.length < COUNT, 'the paid time budget does not read every band');
    assert.equal(work.savedBytes, 0, 'tiny scalar carry values do not trigger the pending-write limit');
    assert.ok(work.sourceBytes < input.length, 'source ranges stop before the whole input accumulates');
    assert.ok(work.sourceBytes <= 8 * MiB, 'the read frontier acts after a completed band');
    const completed = [...visited];
    for (let calls = 0; job.checkpoint.status !== 'done'; calls++) {
      assert.ok(calls < 24, 'cold advances keep making progress');
      const message = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), {workerData: {
          checkpoint: job.checkpoint, source: job.source, input, parts: [...job.parts]
        }});
        worker.once('message', resolve); worker.once('error', reject);
        worker.once('exit', code => { if (code) reject(new Error('Worker exited ' + code)); });
      });
      assert.equal(message.error, undefined, message.error?.stack);
      job.keep(message.result); completed.push(...message.visited);
    }
    assert.deepEqual(completed, Array.from({length: COUNT}, (_, i) => i), 'completed bands never run twice');
    const sum = Array.from({length: COUNT}, (_, i) => 2 * (i + 1) + 2 * (i + 31)).reduce((a, b) => a + b, 0);
    const bytes = []; for await (const part of codec.outputParts(job.checkpoint, job.host())) bytes.push(...part);
    assert.deepEqual(bytes, [sum & 255, sum >>> 8]);
    assert.deepEqual((await codec.completion(job.checkpoint, job.host())).result.facts, {sum});
  });

  test('one read per miss round advances past cached warm pages without retry livelock', async () => {
    const codec = createJournalStepper({id: 'pb1/read-calls', build: 'a'.repeat(64), normalize: () => ({budgetMs: Number.MIN_VALUE}),
      open: function* () {
        const values = [];
        for (let i = 0; i < 10; i++) values.push(yield* stage('cold-' + i,
          function* () { return new Uint8Array(BAND).fill(i + 1); }, undefined, false, true));
        for (let i = 0; i < 3; i++) yield* unit('gap', () => 0);
        return Uint8Array.of(yield* unit('sum', () => values.reduce((sum, bytes) => sum + bytes[0], 0)));
      }});
    const job = await fixture(codec, Uint8Array.of(17)); let most = 0;
    for (let calls = 0; job.checkpoint.status !== 'done'; calls++) {
      assert.ok(calls < 40, 'warm cache hits leave the one actual host read available');
      let reads = 0;
      job.keep(await codec.advance(job.checkpoint, job.host({reads: 1,
        read: ref => { reads++; return job.parts.get(ref.hash); },
        readMany: refs => { reads++; return refs.map(ref => job.parts.get(ref.hash)); },
        readSource: (at, count) => { reads++; return Uint8Array.of(17).subarray(at, at + count); }
      }), {units: 1}));
      most = Math.max(most, reads);
    }
    assert.ok(most <= 2, 'one checkpoint read and at most one actual journal read');
    const out = []; for await (const bytes of codec.outputParts(job.checkpoint, job.host())) out.push(...bytes);
    assert.deepEqual(out, [55]);
  });

  test('a completed whole-source unit does not make later bands prefetch a large source', async () => {
    const input = new Uint8Array(5 * MiB).fill(7);
    const make = () => createJournalStepper({id: 'pb1/source-lookahead', build: 'c'.repeat(64),
      normalize: () => ({budgetMs: Number.MIN_VALUE}),
      open: function* (plan, bytes) {
        const sum = yield* stage('source-stage', function* () {
          let total = yield* unit('whole', () => new Uint8Array(bytes.buffer)[0]);
          for (let i = 1; i <= 3; i++) total += yield* unit('band', () => bytes.subarray(i * MiB, i * MiB + 16)[0]);
          return total;
        });
        return Uint8Array.of(sum);
      }});
    const job = await fixture(make(), input); await job.hash();
    job.keep(await make().advance(job.checkpoint, job.host()));
    assert.equal(job.checkpoint.status, 'active');
    const reads = [];
    for (let calls = 0; job.checkpoint.status !== 'done'; calls++) {
      assert.ok(calls < 10, 'the saved whole-source unit and later bands finish');
      job.keep(await make().advance(job.checkpoint, job.host({readSource: (at, length) => {
        reads.push({at, length}); return input.subarray(at, at + length);
      }})));
    }
    assert.ok(reads.length > 0, 'later bands actually read their pinned source ranges');
    assert.ok(reads.every(({length}) => length <= MiB / 4), 'a prior whole-source unit does not authorize whole-source lookahead');
    const out = []; for await (const bytes of make().outputParts(job.checkpoint, job.host())) out.push(...bytes);
    assert.deepEqual(out, [28]);
  });

  test('large saved structures retain exact payload slices through missing-source replay and fresh calls', async () => {
    const payload = new Uint8Array(2 * MiB + 37);
    for (let i = 0; i < payload.length; i++) payload[i] = i % 251;
    const expected = await digest(payload);
    const make = () => createJournalStepper({id: 'pb1/saved-structure', build: 'd'.repeat(64),
      normalize: options => ({budgetMs: options.budgetMs}),
      open: function* (plan, source) {
        const record = yield* unit('large-record', () => ({
          labels: Array.from({length: 400}, (_, i) => 'field-' + i),
          bytes: payload.slice(), tail: payload.subarray(-37).slice()
        }));
        const linked = yield* unit('linked-tail', () => ({labels: record.labels.slice(-2), bytes: record.bytes.subarray(-37),
          stamp: source.subarray(0, 1)[0]}));
        yield* unit('gap', () => 0);
        return {bytes: record.bytes, facts: {labels: linked.labels, tail: [...linked.bytes], stamp: linked.stamp}};
      }});
    for (const budgetMs of [Number.MIN_VALUE, 60000]) {
      const job = await fixture(make(), Uint8Array.of(3), {budgetMs});
      for (let calls = 0; job.checkpoint.status !== 'done'; calls++) {
        assert.ok(calls < 12, 'large structures resume without reading stale parent bytes');
        job.keep(await make().advance(job.checkpoint, job.host()));
      }
      const parts = []; for await (const bytes of make().outputParts(job.checkpoint, job.host())) parts.push(bytes);
      const actual = new Uint8Array(parts.reduce((n, bytes) => n + bytes.length, 0));
      let at = 0; for (const bytes of parts) { actual.set(bytes, at); at += bytes.length; }
      assert.equal(await digest(actual), expected);
      assert.deepEqual((await make().completion(job.checkpoint, job.host())).result.facts,
        {labels: ['field-398', 'field-399'], tail: [...payload.subarray(-37)], stamp: 3});
    }
  });

  test('read pressure lets an atomic stage and a missing required tail finish before yielding', async () => {
    const input = new Uint8Array(10 * MiB), visited = [];
    for (let i = 0; i < 10; i++) input.fill(i + 1, i * MiB, (i + 1) * MiB);
    const make = () => createJournalStepper({id: 'pb1/read-atomic', build: 'b'.repeat(64), normalize: () => ({budgetMs: 60000}),
      open: function* (plan, bytes) {
        const total = yield* stage('atomic', function* () {
          let sum = 0;
          for (let i = 0; i < 9; i++) sum += yield* unit('piece', () => {
            const value = bytes.subarray(i * MiB, (i + 1) * MiB)[0]; visited.push(i); return value;
          });
          return sum;
        }, undefined, true);
        const tail = yield* unit('tail', () => {
          const value = bytes.subarray(9 * MiB, 10 * MiB)[0]; visited.push('tail'); return total + value;
        }, undefined, true);
        return Uint8Array.of(yield* unit('after', () => { visited.push('after'); return tail; }));
      }});
    const job = await fixture(make(), input); await job.hash();
    const result = await make().advance(job.checkpoint, job.host({budgetMs: 60000}), {units: 64}); job.keep(result);
    assert.equal(result.done, false);
    assert.deepEqual(visited, [0, 1, 2, 3, 4, 5, 6, 7, 8, 'tail']);
    job.keep(await make().advance(job.checkpoint, job.host({budgetMs: 60000}), {units: 64}));
    assert.equal(job.checkpoint.status, 'done');
    assert.deepEqual(visited, [0, 1, 2, 3, 4, 5, 6, 7, 8, 'tail', 'after']);
    const out = []; for await (const bytes of make().outputParts(job.checkpoint, job.host())) out.push(...bytes);
    assert.deepEqual(out, [55]);
  });
}
