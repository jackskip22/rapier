// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {tools, journalNext} from './pb1-tools.mjs';
import {readFile} from 'node:fs/promises';
import {fork} from 'node:child_process';
import {BitWriter, complete} from '../bits.mjs';
import {prepareICC, prepareICCSteps} from '../icc-write.mjs';
import {screenMatches} from '../screen-lz77.mjs';
import {joinedBytes, lazySource, encodeValue, decodeValue} from '../step-journal.mjs';
import {jpegSteps} from '../jpeg-job.mjs';
import {jpegAnsEffortSteps} from '../jpeg-ans-effort.mjs';
import {recompress, restore, prepare} from '../v7/jpeg.mjs';
import {verify} from '../v7/verify.mjs';
import {start, advance, finish} from '../v7/resumable.mjs';
import {displayProfile, descriptionTag} from '../public/test/icc.mjs';
import {splitJPEGProfile} from '../public/test/jpeg-profile-cases.mjs';
import {memoryStore, sourceRecord, named, sha256} from './durable-host.mjs';

const description = 'ICC description boundary '.repeat(4000);
const profile = wide => displayProfile({curve: 'table', description,
  ...(wide && {extra: [['dmnd', descriptionTag(description)], ['dmdd', descriptionTag(description)]]})});
const padded = data => { const writer = new BitWriter(); writer.append(data); return writer.finish(); };
function trace(steps) {
  let step; const counts = {};
  do {
    step = journalNext(steps, undefined, {join: joinedBytes, tools});
    if (step.value?.unitDone) {
      const {unitDone: name, value} = step.value; counts[name] = (counts[name] ?? 0) + 1;
      if (['icc-match-part', 'icc-write-part', 'codestream-header-part'].includes(name)) assert.ok(value.bytes.length <= 65536);
    }
  } while (!step.done);
  return {value: step.value, counts};
}

if (process.argv[2] === 'resume-icc') {
  process.once('message', async ({checkpoint, input, original, parts}) => {
    try {
      const store = memoryStore(original); for (const [key, bytes] of parts) store.parts.set(key, bytes);
      let calls = 0;
      while (checkpoint.status !== 'done') {
        const next = await advance(checkpoint, {operation: recompress, input, store, verify, budget: {ms: 2}});
        checkpoint = JSON.parse(JSON.stringify(next.checkpoint)); assert.ok(++calls < 1500);
      }
      const record = await finish(checkpoint, {operation: recompress, input, store});
      process.send({record, calls});
    } catch (error) { process.send({error: {message: error.message, code: error.code, stack: error.stack}}); }
    finally { process.disconnect(); }
  });
} else {
  const photo = new Uint8Array(await readFile(new URL('../public/test/fixtures/bands-420-restart.jpg', import.meta.url)));
  const p3 = new Uint8Array(await readFile(new URL('../public/test/fixtures/display-p3.icc', import.meta.url)));
  test('ICC preparation keeps the prior payload pins through bounded input ranges and prefix parts', () => {
    const cases = [
      [p3, {prefix: [2876, '0ccd7eeba6266c7dbd388cb0646e46457eccb06babfdaf2ee308e60f5eb69f62'],
        lz77: [2766, '8a23adf20f06702ec56f9890232f2225d8af97fe601ea62acdf96f8a6024226e']}],
      [profile(true), {prefix: [1303108, 'a5a1408c61f7b6d270b8980d401fd71883995cb14e9925043bb3303fb38adb7a'],
        lz77: [45841, 'c5d12fc388ed7a8796cf078b02bb096cf2e47ac3779719e0b3fef7122268dfae']}]
    ];
    for (const [input, pins] of cases) for (const compression of ['prefix', 'lz77', 'auto']) {
      const expected = pins[compression === 'auto' ? 'lz77' : compression], ordinary = prepareICC(input, {compression});
      assert.equal(ordinary.iccData.bitLength, expected[0]); assert.equal(sha256(ordinary.iccData.finish()), expected[1]);
      let largest = 0;
      const source = lazySource(input.length, () => { throw new Error('unexpected source miss'); }, [], 0, (from, to) => {
        largest = Math.max(largest, to - from); assert.ok(to - from <= 65536, 'one bounded ICC range');
        return input.subarray(from, to);
      });
      const result = trace(prepareICCSteps(source, {compression}));
      assert.equal(result.value.iccData.bitLength, expected[0]); assert.equal(sha256(padded(result.value.iccData)), expected[1]);
      assert.ok(largest > 0);
      if (input.length > 65536) assert.ok(result.counts['icc-write-part'] > 2);
    }
  });
  test('the four-probe history keeps the exact old match stream across a saved comparison or insertion', () => {
    const input = profile(true), want = 'c569652bee1a6f9cd5aa24305a509f86ac08cc6455b3206a99d1f38e01dca54a';
    const tokens = []; let state = null, calls = 0;
    do {
      state = screenMatches(input, (...token) => tokens.push(...token), 4, 7, state, 257);
      if (++calls === 7) { const saved = encodeValue(state); state = decodeValue(JSON.parse(JSON.stringify(saved.meta)), saved.bytes).value; }
    } while (state.i < input.length);
    assert.equal(sha256(new Uint8Array(new Uint32Array(tokens).buffer)), want);
    assert.equal(state.head, null); assert.equal(state.history.byteLength, 1048576);
  });
  test('a multi-part ICC header uses the original scalar writers and restores the real photo exactly', async () => {
    await prepare();
    const original = splitJPEGProfile(photo, profile(true), true), options = {effort: 1, icc: 'preserve', iccCompression: 'prefix'};
    const ordinary = complete(jpegSteps(original, options, jpegAnsEffortSteps));
    const stepped = trace(jpegSteps(original, {...options, bands: {from: 0, packed: 0}}, jpegAnsEffortSteps));
    assert.deepEqual(stepped.value.subarray(0), ordinary); assert.ok(stepped.counts['codestream-header-part'] >= 3);
    assert.deepEqual((await restore(ordinary)).bytes, original);
  });
  test('a fresh process finishes preserved ICC recompression with the complete ordinary receipt', {timeout: 45000}, async () => {
    const original = splitJPEGProfile(photo, profile(false)), options = {effort: 1, icc: 'preserve'};
    const ordinary = await recompress(original, options), expected = {...await named(ordinary, original), verification: await verify(original, ordinary)};
    const input = sourceRecord(original, {kind: 'file'}), store = memoryStore(original);
    let checkpoint = await start({operation: recompress, input, options, verify, store}), calls = 0;
    for (;;) {
      const next = await advance(checkpoint, {operation: recompress, input, store, verify, budget: {ms: 2}});
      checkpoint = JSON.parse(JSON.stringify(next.checkpoint)); assert.ok(++calls < 500 && !next.done);
      const state = JSON.parse(new TextDecoder().decode(store.parts.get(checkpoint.state.hash)));
      const entries = Object.values(state.codec?.journal ?? {});
      if (entries.filter(entry => entry.name === 'icc-match-part').length >= 2 && entries.some(entry => entry.name === 'icc-match-state' && !entry.passed)) break;
    }
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    const resumed = await new Promise((resolve, reject) => {
      const child = fork(new URL(import.meta.url), ['resume-icc'], {serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env});
      let stderr = '', received = false;
      child.stderr.on('data', data => { stderr += data; }); child.once('error', reject);
      child.once('message', value => { received = true; value.error ? reject(Object.assign(new Error(value.error.message), value.error)) : resolve(value); });
      child.once('exit', code => { if (!received) reject(new Error(`ICC resume exited ${code}: ${stderr}`)); });
      child.send({checkpoint, input, original, parts: [...store.parts]});
    });
    assert.deepEqual(resumed.record, expected); assert.ok(resumed.calls > 1);
    assert.deepEqual((await restore(resumed.record.bytes)).bytes, original);
  });
}
