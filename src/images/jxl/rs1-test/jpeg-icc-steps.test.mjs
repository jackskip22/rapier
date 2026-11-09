// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {tools, journalNext} from './pb1-tools.mjs';
import {readFile} from 'node:fs/promises';
import {prepareICC} from '../icc-write.mjs';
import {inspectICC, inspectICCSteps} from '../icc-profile.mjs';
import {JxlBits as DecodeBits} from '../decode-bits.mjs';
import {readICCSteps, decodeICCSteps} from '../decode-icc.mjs';
import {JxlBits, readEncodedICC, readEncodedICCSteps} from '../jpeg-coefficients.mjs';
import {unpredictICC, unpredictICCSteps, restoreJPEGSteps} from '../jpeg-reconstruction.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';
import {joinedBytes, sliceBytes} from '../step-journal.mjs';
import {recompress, restore} from '../v7/jpeg.mjs';
import {displayProfile} from '../public/test/icc.mjs';
import {drive, named} from './durable-host.mjs';

const join = pieces => new Uint8Array(Buffer.concat(pieces));
const large = () => displayProfile({curve: 'table', description: 'ICC description boundary '.repeat(4000)});
const varint = value => {
  const out = [];
  do { const byte = value % 128; value = Math.floor(value / 128); out.push(byte + (value ? 128 : 0)); } while (value);
  return out;
};
const codec = entropy => createJournalStepper({tools, id: 'pb1/icc-' + entropy, build: '7'.repeat(64),
  normalize: () => ({budgetMs: Number.MIN_VALUE}), open: function* (_, bytes) {
    if (entropy === 'admission') return Uint8Array.of(yield* inspectICCSteps(bytes));
    if (entropy === 'decoder') return yield* readICCSteps(new DecodeBits(sliceBytes(bytes, 0), true));
    if (entropy === 'decoder-profile') return yield* decodeICCSteps(bytes);
    if (entropy) bytes = yield* readEncodedICCSteps(new JxlBits(bytes));
    return yield* unpredictICCSteps(bytes);
  }});
async function resumed(input, entropy = false) {
  const source = {generation: 'icc/1', sha256: await digest(input), byteLength: input.length}, parts = new Map();
  let checkpoint, calls = 0;
  const keep = result => {
    for (const {ref, bytes} of result.parts) parts.set(ref.hash, bytes.slice());
    checkpoint = JSON.parse(JSON.stringify(result.checkpoint));
  };
  const host = () => ({source, expectedRevision: checkpoint.revision, read: ref => parts.get(ref.hash)?.slice(),
    readMany: refs => refs.map(ref => parts.get(ref.hash)?.slice()), readSource: (at, n) => input.slice(at, at + n)});
  keep(await codec(entropy).start({source}));
  while (checkpoint.status !== 'done') {
    keep(await codec(entropy).advance(checkpoint, host(), {units: 1}));
    assert.ok(++calls < 200, 'ICC continuation makes progress');
  }
  const out = [];
  for await (const bytes of codec(entropy).outputParts(checkpoint, host())) out.push(bytes);
  return {bytes: join(out), calls};
}
function trace(steps) {
  let step; const counts = {};
  do {
    step = journalNext(steps, undefined, {tools, join: joinedBytes});
    if (step.value?.unitDone) {
      const {unitDone: name, value} = step.value; counts[name] = (counts[name] ?? 0) + 1;
      if (name === 'icc-entropy-part' || name === 'icc-profile-part') assert.ok(value.bytes.length <= 65536);
    }
  } while (!step.done);
  return {bytes: step.value.subarray(0), counts};
}

test('ICC entropy and inverse prediction retain exact profile bytes across serialized parts', {timeout: 30000}, async () => {
  const original = new Uint8Array(await readFile(new URL('../public/test/fixtures/display-p3.icc', import.meta.url)));
  for (const profile of [original, large()]) for (const compression of ['prefix', 'lz77']) {
    const input = prepareICC(profile, {compression}).iccData.finish();
    assert.deepEqual(unpredictICC(readEncodedICC(new JxlBits(input))), profile);
    const result = await resumed(input, true); assert.deepEqual(result.bytes, profile);
    assert.deepEqual((await resumed(input, 'decoder')).bytes, profile);
    if (profile.length > 65536) assert.ok(result.calls >= 8);
  }
});

function transformed(profile, width, order = null) {
  const prepared = readEncodedICC(new JxlBits(prepareICC(profile, {compression: 'prefix'}).iccData.finish()));
  let at = 0;
  const number = () => { let value = 0, scale = 1, byte; do { byte = prepared[at++]; value += (byte & 127) * scale; scale *= 128; } while (byte & 128); return value; };
  number(); const commandSize = number(), header = prepared.subarray(at + commandSize, at + commandSize + 128);
  const count = profile.length - 128, residual = new Uint8Array(count), stride = 20;
  const word = pos => { let value = 0; for (let j = 0; j < width; j++) value = value * 256 + profile[pos + j]; return value; };
  for (let i = 0; i < count; i++) {
    let prediction = 0;
    if (order !== null) {
      const pos = 128 + i - i % width, a = word(pos - stride), b = word(pos - stride * 2), c = word(pos - stride * 3);
      const value = order === 0 ? a : order === 1 ? 2 * a - b : 3 * a - 3 * b + c;
      prediction = value >>> ((width - 1 - i % width) * 8) & 255;
    }
    residual[i] = profile[128 + i] - prediction;
  }
  const shuffled = new Uint8Array(count), height = Math.ceil(count / width); let column = 0, slot = 0;
  for (let i = 0; i < count; i++) { shuffled[slot] = residual[i]; slot += height; if (slot >= count) slot = ++column; }
  const commands = order === null ? [0, width === 2 ? 2 : 3, ...varint(count)]
    : [0, 4, width - 1 + order * 4 + 16, ...varint(stride), ...varint(count)];
  return join([Uint8Array.from([...varint(profile.length), ...varint(commands.length), ...commands]), header, shuffled]);
}

test('ICC shuffle and every predictor width/order cross saved output boundaries', {timeout: 30000}, async () => {
  const profile = large();
  for (const width of [1, 2, 4]) for (const order of [0, 1, 2]) {
    const encoded = transformed(profile, width, order);
    assert.deepEqual(unpredictICC(encoded), profile); assert.deepEqual((await resumed(encoded)).bytes, profile);
    assert.deepEqual((await resumed(encoded, 'decoder-profile')).bytes, profile);
  }
  for (const width of [2, 4]) {
    const encoded = transformed(profile, width);
    assert.deepEqual(unpredictICC(encoded), profile); assert.deepEqual((await resumed(encoded)).bytes, profile);
    assert.deepEqual((await resumed(encoded, 'decoder-profile')).bytes, profile);
  }
  const encoded = transformed(profile, 4, 2), observed = new Proxy(encoded, {get(target, key) {
    if (key === 'subarray') return (from, to) => { assert.ok(to - from <= 65536); return target.subarray(from, to); };
    return Reflect.get(target, key, target);
  }});
  assert.deepEqual(trace(unpredictICCSteps(observed)).bytes, profile);
});

test('ICC tag synthesis and zero-length commands carry a bounded command cursor', {timeout: 30000}, async () => {
  const count = 5000, offset = 132 + count * 12, profile = new Uint8Array(offset + 8), view = new DataView(profile.buffer);
  profile.set(displayProfile().subarray(0, 128)); view.setUint32(0, profile.length); view.setUint32(128, count);
  for (let i = 0; i < count; i++) { const at = 132 + i * 12; profile.set([99, 112, 114, 116], at); view.setUint32(at + 4, offset); view.setUint32(at + 8, 8); }
  profile.set([116, 101, 120, 116], offset);
  assert.equal(inspectICC(profile), 3); assert.deepEqual((await resumed(profile, 'admission')).bytes, Uint8Array.of(3));
  const base = readEncodedICC(new JxlBits(prepareICC(profile, {compression: 'prefix'}).iccData.finish()));
  let at = 0; const number = () => { let n = 0, s = 1, b; do { b = base[at++]; n += (b & 127) * s; s *= 128; } while (b & 128); return n; };
  number(); const n = number(), header = base.subarray(at + n, at + n + 128), commands = [...varint(count + 1)];
  for (let i = 0; i < count; i++) commands.push(196, ...varint(offset), 8);
  commands.push(0); for (let i = 0; i < 8200; i++) commands.push(1, 0);
  commands.push(18);
  const encoded = join([Uint8Array.from([...varint(profile.length), ...varint(commands.length), ...commands]), header]);
  assert.deepEqual(unpredictICC(encoded), profile); assert.deepEqual((await resumed(encoded)).bytes, profile);
  assert.deepEqual((await resumed(encoded, 'decoder-profile')).bytes, profile);
  const result = trace(unpredictICCSteps(encoded)); assert.deepEqual(result.bytes, profile); assert.ok(result.counts['icc-profile-part'] >= 4);
});

test('a real photo restores a multi-segment preserved ICC through entropy and profile units', {timeout: 30000}, async () => {
  const photo = new Uint8Array(await readFile(new URL('../public/test/fixtures/bands-420-restart.jpg', import.meta.url)));
  const profile = large(), apps = [], count = Math.ceil(profile.length / 65519), tag = new TextEncoder().encode('ICC_PROFILE\0');
  for (let from = 0, sequence = 1; from < profile.length; from += 65519, sequence++) {
    const bytes = profile.subarray(from, from + 65519), app = new Uint8Array(bytes.length + 18), length = bytes.length + 16;
    app.set([255, 226, length >> 8, length & 255]); app.set(tag, 4); app.set([sequence, count], 16); app.set(bytes, 18); apps.push(app);
  }
  const original = join([photo.subarray(0, 2), ...apps, photo.subarray(2)]), encoded = await recompress(original, {effort: 1, icc: 'preserve'});
  assert.deepEqual((await restore(encoded.bytes)).bytes, original);
  const traced = trace(restoreJPEGSteps(encoded.bytes)); assert.deepEqual(traced.bytes, original);
  assert.ok(traced.counts['icc-entropy-part'] >= 2); assert.ok(traced.counts['icc-profile-part'] >= 2);
  const result = await drive(restore, encoded.bytes, {kind: 'file'}, {}, {ms: 1, maxCalls: 300});
  assert.deepEqual(result.record, await named(await restore(encoded.bytes), encoded.bytes)); assert.deepEqual(result.bytes, original);
});
