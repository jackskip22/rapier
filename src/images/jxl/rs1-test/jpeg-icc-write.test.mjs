// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {tools, journalNext} from './pb1-tools.mjs';
import {readFile} from 'node:fs/promises';
import {BitWriter, complete} from '../bits.mjs';
import {prepareICC, prepareICCSteps} from '../icc-write.mjs';
import {JxlBits} from '../decode-bits.mjs';
import {readICC} from '../decode-icc.mjs';
import {readDecodeImageHeader} from '../decode-header.mjs';
import {codestreamOf} from '../framing.mjs';
import {screenMatches} from '../screen-lz77.mjs';
import {joinedBytes, lazySource, encodeValue, decodeValue} from '../step-journal.mjs';
import {jpegSteps} from '../jpeg-job.mjs';
import {jpegAnsEffortSteps} from '../jpeg-ans-effort.mjs';
import {restore, prepare} from '../v7/jpeg.mjs';
import {displayProfile, descriptionTag} from '../public/test/icc.mjs';
import {splitJPEGProfile} from '../public/test/jpeg-profile-cases.mjs';
import {sha256} from './durable-host.mjs';

const description = 'ICC description boundary '.repeat(4000);
const profile = wide => displayProfile({curve: 'table', description,
  ...(wide && {extra: [['dmnd', descriptionTag(description)], ['dmdd', descriptionTag(description)]]})});
const padded = data => { const writer = new BitWriter(); writer.append(data); return writer.finish(); };
function exactICC(bytes, bitLength, input) {
  const reader = new JxlBits(bytes);
  assert.deepEqual(readICC(reader), input);
  assert.equal(reader.bit, bitLength, 'the reader ends at the unpadded ICC payload boundary');
}
function trace(steps) {
  let step; const counts = {};
  do {
    step = journalNext(steps, undefined, {join: joinedBytes, tools});
    if (step.value?.unitDone) {
      const {unitDone: name, value} = step.value; counts[name] = (counts[name] ?? 0) + 1;
      if (['icc-match-part', 'icc-write-part', 'codestream-header-part'].includes(name)) assert.ok(value.bytes.length <= 65536);
      if (name === 'icc-prediction-part') assert.ok(value.length <= 65536);
    }
  } while (!step.done);
  return {value: step.value, counts};
}

{
  const photo = new Uint8Array(await readFile(new URL('../public/test/fixtures/bands-420-restart.jpg', import.meta.url)));
  const p3 = new Uint8Array(await readFile(new URL('../public/test/fixtures/display-p3.icc', import.meta.url)));
  test('ICC prediction improves or keeps the prior payload ceilings with exact ordinary and journaled bytes', () => {
    const cases = [
      [p3, {prefix: [2876, '0ccd7eeba6266c7dbd388cb0646e46457eccb06babfdaf2ee308e60f5eb69f62'],
        lz77: [2766, '8a23adf20f06702ec56f9890232f2225d8af97fe601ea62acdf96f8a6024226e']}],
      [profile(true), {prefix: [1303108, 'a5a1408c61f7b6d270b8980d401fd71883995cb14e9925043bb3303fb38adb7a'],
        lz77: [45841, 'c5d12fc388ed7a8796cf078b02bb096cf2e47ac3779719e0b3fef7122268dfae']}]
    ];
    for (const [input, pins] of cases) for (const compression of ['prefix', 'lz77', 'auto']) {
      const expected = pins[compression === 'auto' ? 'lz77' : compression], ordinary = prepareICC(input, {compression});
      const bytes = ordinary.iccData.finish(), bits = ordinary.iccData.bitLength, hash = sha256(bytes);
      assert.ok(bits <= expected[0], 'the original complete payload remains a size ceiling');
      if (bits < expected[0]) assert.notEqual(hash, expected[1], 'the smaller ICC intentionally changes the historical payload hash');
      else assert.equal(hash, expected[1], 'equal cost retains the historical payload');
      exactICC(bytes, bits, input);
      let largest = 0;
      const source = lazySource(input.length, () => { throw new Error('unexpected source miss'); }, [], 0, (from, to) => {
        largest = Math.max(largest, to - from); assert.ok(to - from <= 65536, 'one bounded ICC range');
        return input.subarray(from, to);
      });
      const result = trace(prepareICCSteps(source, {compression}));
      const stepped = padded(result.value.iccData);
      assert.equal(result.value.iccData.bitLength, bits); assert.equal(sha256(stepped), hash);
      exactICC(stepped, bits, input);
      assert.ok(largest > 0);
      assert.ok(result.counts['icc-prediction-part'] > 0, 'the bounded predictor participates in candidate selection');
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
    assert.equal(sha256(stepped.value.subarray(0)), sha256(ordinary));
    const reader = new JxlBits(codestreamOf(ordinary).codestream), header = readDecodeImageHeader(reader);
    assert.ok(header.colorEncoding.wantICC); assert.deepEqual(readICC(reader), profile(true));
    assert.deepEqual((await restore(ordinary)).bytes, original);
  });
}
