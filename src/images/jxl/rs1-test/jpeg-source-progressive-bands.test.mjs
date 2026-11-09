// SPDX-License-Identifier: MIT
// The existing CC0-derived progressive photograph: identical coefficients and choices, including a cold journal replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import {tools, journalNext} from './pb1-tools.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fork} from 'node:child_process';
import {parseJPEG, parseJPEGSteps, groupRows} from '../jfif.mjs';
import {stage, unit, journalJoin, joinedBytes, journalProtocol} from '../step-journal.mjs';
import {start, advance, finish} from '../v7/resumable.mjs';
import {recompress, restore} from '../v7/jpeg.mjs';
import {encode} from '../v7/index.mjs';
import {verify} from '../v7/verify.mjs';
import {ownDecoder} from '../v7/verify-own.mjs';
import {pixelResultInSteps, restoredInSteps} from '../v7/verify-steps.mjs';
import {sourceIdentity, digestBytes} from '../v7/result-identity.mjs';
import {memoryStore, sourceRecord, sha256} from './durable-host.mjs';


const hash = parts => {
  const digest = createHash('sha256');
  for (const part of parts) digest.update(new Uint8Array(part.buffer, part.byteOffset, part.byteLength));
  return new Uint8Array(digest.digest());
};
const scanHash = jpeg => hash([new TextEncoder().encode(JSON.stringify({choices: jpeg.scanChoices, padding: jpeg.padding && [...jpeg.padding]}))]);
const parser = () => {};
parser[Symbol.for('rapier-jxl.steps')] = {
  id: 'test:progressive-source', normalize: () => ({}),
  *open(_plan, bytes) {
    const parsed = yield* stage('parse', function* () {
      const {band, rows, ...value} = yield* parseJPEGSteps(bytes, true, {bands: {from: 0, packed: 0}});
      for (const c of value.components) delete c.band;
      return value;
    });
    Object.assign(parsed, groupRows(bytes, parsed.bandFrame));
    const parts = [yield* unit('scan-choice-digest', () => scanHash(parsed))];
    for (let gy = 0; gy < Math.ceil(parsed.height / 256); gy++) parts.push(yield* unit('coefficient-digest', () => {
      parsed.band(gy);
      return hash(parsed.components.map(c => c.coeffs.subarray(0, Math.min(c.coeffs.length, (c.rows - c.row0) * c.stride * 64))));
    }));
    return {bytes: journalJoin(parts)};
  },
  record: bytes => ({bytes})
};

if (process.argv[2] === 'resume') {
  process.once('message', async ({checkpoint, input, bytes, parts, jpeg}) => {
    try {
      const store = memoryStore(bytes); for (const [key, part] of parts) store.parts.set(key, part);
      const operation = jpeg ? recompress : parser;
      let done = false, calls = 0;
      while (!done) {
        const next = await advance(checkpoint, {operation, input, store, budget: {ms: 2}});
        checkpoint = JSON.parse(JSON.stringify(next.checkpoint)); done = next.done;
        assert.ok(++calls < 2000, 'progressive parsing advances');
      }
      const record = await finish(checkpoint, {operation, input, store});
      process.send({bytes: record.bytes, record, calls});
    } catch (error) { process.send({error: {message: error.message, code: error.code, stack: error.stack}}); }
    finally { process.disconnect(); }
  });
} else {
  const original = new Uint8Array(await readFile(new URL('../public/test/fixtures/bands-progressive-profile.jpg', import.meta.url)));
  assert.equal(sha256(original), '51b74d02465f40cf46198831ecb9a13c08be6c10174faf7a4d2e12738de779b7');
  const whole = parseJPEG(original, true);
  const coldResume = async (operation, options = {}) => {
    const store = memoryStore(original), input = sourceRecord(original, {kind: 'file'});
    let checkpoint = await start({operation, input, options, store}), calls = 0;
    for (;;) {
      const next = await advance(checkpoint, {operation, input, store, budget: {ms: 2}});
      checkpoint = JSON.parse(JSON.stringify(next.checkpoint));
      assert.ok(++calls < 1000 && !next.done, 'pause before all coefficients are complete');
      const saved = JSON.parse(new TextDecoder().decode(store.parts.get(checkpoint.state.hash)));
      const entries = Object.values(saved.codec?.journal ?? {});
      if (entries.some(entry => entry.name === 'scan-4') && entries.some(entry => entry.name === 'scan-state')) break;
    }
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    return new Promise((resolve, reject) => {
      const child = fork(new URL(import.meta.url), ['resume'], {serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env});
      let stderr = '', received = false;
      child.stderr.on('data', data => { stderr += data; });
      child.once('error', reject);
      child.once('message', value => { received = true; value.error ? reject(Object.assign(new Error(value.error.message), value.error)) : resolve(value); });
      child.once('exit', code => { if (!received) reject(new Error(`progressive parser exited ${code}: ${stderr}`)); });
      child.send({checkpoint, input, bytes: original, parts: [...store.parts], jpeg: operation === recompress});
    });
  };
  const boundedReceipt = async (result, journal = Object.assign(async () => undefined, {join: joinedBytes, tools})) =>
    verify[Symbol.for('rapier-jxl.verify.steps')](original, result, {journal: journalProtocol(journal), source: {kind: 'file'},
      sourceIdentity: await sourceIdentity(original), outputDigest: await digestBytes(result.bytes),
      restoreSteps: restore[Symbol.for('rapier-jxl.steps')], pixelResult: pixelResultInSteps, restored: restoredInSteps});
  test('progressive source strips use the same coefficients, DC, nonzero counts and scan choices', () => {
    const steps = parseJPEGSteps(original, true, {bands: {from: 0, packed: 0}});
    let step, strips = 0, largest = 0;
    do {
      step = journalNext(steps, undefined, {join: joinedBytes, tools});
      if (step.value?.unitDone === 'scan-coefficients') {
        strips++; largest = Math.max(largest, step.value.value.reduce((n, part) => n + part.byteLength, 0));
      }
    } while (!step.done);
    const banded = step.value;
    assert.equal(strips, 380); assert.equal(largest, 14592);
    assert.deepEqual(banded.scanChoices, whole.scanChoices); assert.deepEqual(banded.padding, whole.padding);
    for (let gy = 0; gy < Math.ceil(whole.height / 256); gy++) {
      banded.band(gy);
      for (let i = 0; i < whole.components.length; i++) {
        const c = banded.components[i], expected = whole.components[i], from = c.row0 * c.stride * 64;
        const count = Math.min(expected.coeffs.length - from, c.coeffs.length);
        assert.deepEqual(c.coeffs.subarray(0, count), expected.coeffs.subarray(from, from + count));
      }
    }
    for (let i = 0; i < whole.components.length; i++) {
      const expected = whole.components[i], actual = banded.components[i], dc = new Int16Array(expected.coeffs.length / 64), natural = new Uint32Array(64);
      for (let at = 0; at < expected.coeffs.length; at += 64) {
        dc[at / 64] = expected.coeffs[at];
        for (let k = 0; k < 64; k++) if (expected.coeffs[at + k]) natural[k]++;
      }
      assert.deepEqual(actual.dc, dc); assert.deepEqual(actual.natural, natural);
    }
  });
  test('a fresh process resumes progressive refinement from immutable coefficient strips', {timeout: 30000}, async () => {
    const result = await coldResume(parser);
    const expected = [scanHash(whole)];
    for (let gy = 0; gy < Math.ceil(whole.height / 256); gy++) expected.push(hash(whole.components.map(c => {
      const vmax = Math.max(...whole.components.map(component => component.v));
      const row = gy * 32 * c.v / vmax;
      return c.coeffs.subarray(row * c.stride * 64, Math.min(c.rows, row + 32 * c.v / vmax) * c.stride * 64);
    })));
    assert.ok(result.calls > 1);
    assert.deepEqual(result.bytes, new Uint8Array(Buffer.concat(expected)));
  });
  test('progressive recompression keeps the complete ordinary file and receipt after a fresh process resumes', {timeout: 30000}, async () => {
    const expected = await recompress(original, {effort: 1}), result = await coldResume(recompress, {effort: 1});
    assert.deepEqual(result.bytes, expected.bytes);
    assert.deepEqual(await boundedReceipt(result.record), await verify(original, result.record));
  });
  test('the progressive pixel reference preserves the ordinary EXIF and P3 receipt', async () => {
    const picture = await ownDecoder.readJPEG(original, {maxPixels: 40000000});
    const result = await encode({data: picture.data, width: picture.width, height: picture.height, colorSpace: picture.colorSpace},
      {fidelity: 'exact', effort: 1, webgpu: false});
    let strips = 0;
    const journal = Object.assign(async request => { if (request.unitDone === 'reference-scan-coefficients') strips++; }, {join: joinedBytes, tools});
    assert.deepEqual(await boundedReceipt(result, journal), await verify(original, result));
    assert.equal(strips, 380);
  });
}
