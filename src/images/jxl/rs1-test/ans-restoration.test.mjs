// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {Session} from 'node:inspector';
import {promisify} from 'node:util';
import {buildAnsCoding, ansCodingParts, ansCodingFrom} from '../ans.mjs';
import {BitWriter} from '../bits.mjs';
import {TokenCounts} from '../entropy.mjs';
import {ensureKernels} from '../kernels.mjs';
import {kernelHooks} from '../kernel-hooks.mjs';
import {journalNext, encodeValue, decodeValue} from '../step-journal.mjs';

const stripped = parts => ({...parts, model: {...parts.model,
  histograms: parts.model.histograms.map(({config, counts}) => ({config, counts}))}});
const roundTrip = value => {
  const {meta, bytes} = encodeValue(value);
  return decodeValue(JSON.parse(JSON.stringify(meta)), bytes.slice()).value;
};
function restored(parts, kernels) {
  let save;
  const journal = {*step(name, _run, convert, kind) {
    assert.equal(name, 'coding'); assert.equal(kind, 2); save = convert;
    return parts;
  }};
  const steps = buildAnsCoding.steps(() => { throw new Error('A saved coding evaluated its counts.'); }, {kernels});
  const result = journalNext(steps, undefined, journal);
  assert.equal(result.done, true); assert.equal(typeof save, 'function');
  return {coding: result.value, save};
}
function writeGroup(coding) {
  const w = new BitWriter();
  coding.writeHistograms(w);
  coding.write(w, 0, 3); coding.reset();
  coding.write(w, 0, 1);
  coding.writeTokens(w, Uint8Array.of(0, 1, 0, 1), Uint32Array.of(2, 3, 0, 1), 4);
  if (coding.writeFilled) coding.writeFilled(w, 0);
  coding.flush(w);
  return w.finish();
}
const wanted = new Set(['reverseAlias', 'ansCodingFrom', 'ansGroupWriter', 'ansWriter']);
const none = {reverseAlias: 0, ansCodingFrom: 0, ansGroupWriter: 0, ansWriter: 0};

test('restored ANS codings save without a writer and initialize once on use', async t => {
  assert.equal(ensureKernels(), true);
  const wasm = kernelHooks.entropy(); assert.ok(wasm);
  for (const [name, kernels] of [['ordinary writer', null], ['WASM writer', wasm]]) {
    await t.test(name, async () => {
      const counts = new TokenCounts(2);
      for (let i = 0; i < 256; i++) { counts.add(0, i % 4); counts.add(1, i % 5 ? 1 : 3); }
      const fresh = buildAnsCoding(counts, {kernels, maxClusters: 2});
      assert.ok(Object.keys(fresh).includes('write'), 'Fresh coding shape stays unchanged.');
      const expected = writeGroup(fresh);
      const original = stripped(ansCodingParts(fresh));
      const parts = roundTrip(original);
      const session = new Session(); session.connect();
      const post = promisify(session.post.bind(session));
      const take = async () => {
        const totals = {...none}, {result} = await post('Profiler.takePreciseCoverage');
        for (const script of result) {
          if (!/\/(?:ans|ans-core|jpeg-kernels)\.mjs$/.test(script.url)) continue;
          for (const fn of script.functions) if (wanted.has(fn.functionName))
            totals[fn.functionName] += fn.ranges[0]?.count ?? 0;
        }
        return totals;
      };
      try {
        await post('Profiler.enable');
        await post('Profiler.startPreciseCoverage', {callCount: true, detailed: false});
        const {coding, save} = restored(parts, kernels);
        assert.equal(coding.bits, fresh.bits); assert.equal(coding.payloadBits, fresh.payloadBits);
        for (const key of ['model', 'write', 'writeTokens', 'writeFilled', 'flush', 'reset'])
          assert.equal(Object.getOwnPropertyDescriptor(coding, key).enumerable, false);
        const spread = {...coding}, copied = Object.assign({}, coding);
        assert.deepEqual(Object.keys(spread), Object.keys(copied));
        const header = new BitWriter(); coding.writeHistograms(header);
        assert.equal(header.bitLength, fresh.histogramHeader.bitLength);
        assert.deepEqual(ansCodingParts(coding), original);
        const saved = save(coding);
        assert.deepEqual(roundTrip(saved), original);
        assert.deepEqual(structuredClone(saved), original);
        for (const histogram of saved.model.histograms)
          assert.deepEqual(Object.keys(histogram), ['config', 'counts']);
        assert.deepEqual(await take(), none, 'Prices, spread, clone and the actual stage save build no writer or reverse table.');

        assert.deepEqual(writeGroup(coding), expected, 'Methods called through the restored object keep the direct bytes.');
        assert.equal(coding.model, parts.model);
        assert.equal(typeof coding.writeFilled, kernels ? 'function' : 'undefined');
        const built = await take();
        assert.equal(built.reverseAlias, parts.model.histograms.length);
        assert.equal(built.ansCodingFrom, 1);
        assert.equal(built.ansWriter, kernels ? 1 : 0);
        assert.equal(built.ansGroupWriter, kernels ? 0 : 1);

        assert.deepEqual(writeGroup(coding), expected);
        assert.deepEqual(roundTrip(save(coding)), original, 'A used writer also saves only the original model data.');
        assert.deepEqual(await take(), none, 'Later writes and saves share the one initialized writer.');
        const next = restored(roundTrip(save(coding)), kernels);
        assert.deepEqual(roundTrip(next.save(next.coding)), original);
        assert.deepEqual(await take(), none, 'A second request can save the restored data without initializing it.');
      } finally { await post('Profiler.stopPreciseCoverage'); session.disconnect(); }

      const eager = ansCodingFrom(ansCodingParts(fresh), kernels);
      assert.ok(Object.keys(eager).includes('write'));
      assert.deepEqual(writeGroup(eager), expected);
    });
  }
});
