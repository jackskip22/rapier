// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {encodeData, decodeData, digest, part} from '../resumable-data.mjs';
import {sha256Start, sha256Update, sha256Finish} from '../sha256.mjs';

const utf8 = text => new TextEncoder().encode(text);
const native = bytes => createHash('sha256').update(bytes).digest('hex');
const rejected = run => assert.throws(run, {code: 'JXL_INPUT'});

test('canonical JSON is stable across object insertion order and survives round trips', () => {
  const one = {z: [true, false, null, -0, '🌱', '\ud800'], '10': 4, a: {b: 2, a: 1}, '2': 8};
  const two = {'2': 8, a: {a: 1, b: 2}, '10': 4, z: [true, false, null, 0, '🌱', '\ud800']};
  assert.deepEqual(encodeData(one), encodeData(two));
  assert.equal(new TextDecoder().decode(encodeData(one)), '{"10":4,"2":8,"a":{"a":1,"b":2},"z":[true,false,null,0,"🌱","\\ud800"]}');
  assert.deepEqual(decodeData(encodeData(one)), two);
  const nullRecord = Object.create(null); nullRecord.a = 1;
  assert.deepEqual(decodeData(encodeData(nullRecord)), {a: 1});
  const ownProto = JSON.parse('{"__proto__":{"safe":true}}');
  assert.deepEqual(decodeData(encodeData(ownProto)), ownProto);
  assert.equal(Object.getPrototypeOf(decodeData(encodeData(ownProto))), Object.prototype);
});

test('JSON rejects live values, cycles, sparse arrays, hidden fields and accessors without calling them', () => {
  for (const value of [undefined, NaN, Infinity, -Infinity, 1n, () => 0, Symbol(), new Uint8Array(1), new Date(), new Map(), new Set(), Object.create({a: 1})]) rejected(() => encodeData(value));
  for (const value of [{a: undefined}, [undefined], [NaN], [, 1], Object.assign([], {extra: 1})]) rejected(() => encodeData(value));
  const cycle = {}; cycle.self = cycle; rejected(() => encodeData(cycle));
  const ring = []; ring.push(ring); rejected(() => encodeData(ring));
  let touched = false;
  const accessor = Object.defineProperty({}, 'a', {enumerable: true, get() { touched = true; return 1; }});
  rejected(() => encodeData(accessor)); assert.equal(touched, false);
  rejected(() => encodeData(Object.defineProperty({}, 'a', {value: 1})));
  rejected(() => encodeData({[Symbol('hidden')]: 1}));
  class ExtraArray extends Array {}
  rejected(() => encodeData(new ExtraArray(1, 2)));
  const shared = {a: 1}; assert.equal(new TextDecoder().decode(encodeData([shared, shared])), '[{"a":1},{"a":1}]');
});

test('canonical decoding rejects duplicate keys, alternate spellings, BOM and malformed UTF-8', () => {
  for (const text of ['', 'null\n', ' null', '{"a":1,"a":2}', '{"b":2,"a":1}', '1.0', '1e0', '-0', '1e999', 'NaN', '{', '[1,]', '"\\u0061"', '\ufeffnull']) rejected(() => decodeData(utf8(text)));
  rejected(() => decodeData(Uint8Array.of(0x22, 0xc0, 0xaf, 0x22)));
  rejected(() => decodeData(Uint8Array.of(0x22, 0xed, 0xa0, 0x80, 0x22)));
  rejected(() => decodeData(new Uint16Array(2)));
});

test('JSON limit counts UTF-8 bytes and allows an exact 1 MiB record', () => {
  const fits = 'a'.repeat((1 << 20) - 2), encoded = encodeData(fits);
  assert.equal(encoded.length, 1 << 20); assert.equal(decodeData(encoded), fits);
  rejected(() => encodeData(fits + 'a'));
  rejected(() => encodeData('é'.repeat(1 << 19)));
  rejected(() => decodeData(new Uint8Array((1 << 20) + 1)));
  let deep = null; for (let i = 0; i < 12000; i++) deep = [deep];
  assert.equal(encodeData(decodeData(encodeData(deep))).length, 24004);
});

test('streaming SHA-256 known vectors and Web Crypto agree', async () => {
  const vectors = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    ['The quick brown fox jumps over the lazy dog', 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'],
  ];
  for (const [text, expected] of vectors) {
    const bytes = utf8(text), state = sha256Update(sha256Start(), bytes);
    assert.equal(sha256Finish(state), expected); assert.equal(await digest(bytes), expected);
    assert.deepEqual(await part(bytes), {hash: expected, length: bytes.length});
  }
  const million = new Uint8Array(1000000).fill(97); let state = sha256Start();
  for (let at = 0; at < million.length; at += 65536) state = sha256Update(state, million.subarray(at, at + 65536));
  assert.equal(sha256Finish(state), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
});

test('random partitions and persisted states match node:crypto at block and padding boundaries', () => {
  let seed = 0x64c786ab;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  for (const length of [0, 1, 7, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 65535, 65536, 65537, 131073, 1048621]) {
    const bytes = Uint8Array.from({length}, () => random() & 255), want = native(bytes);
    for (let repetition = 0; repetition < 3; repetition++) {
      let state = sha256Start(), at = 0;
      while (at < length) {
        const n = Math.min(length - at, 1 + random() % 65536), before = encodeData(state);
        const next = sha256Update(state, bytes.subarray(at, at + n));
        assert.deepEqual(encodeData(state), before);
        state = decodeData(encodeData(next)); at += n;
      }
      const saved = encodeData(state);
      assert.equal(sha256Finish(state), want); assert.equal(sha256Finish(state), want);
      assert.deepEqual(encodeData(state), saved);
    }
  }
});

test('checkpoint digests refuse invalid, shared and detached byte inputs', async () => {
  await assert.rejects(digest([0]), {code: 'JXL_INPUT'});
  await assert.rejects(part(new Uint16Array(1)), {code: 'JXL_INPUT'});
  if (typeof SharedArrayBuffer === 'function')
    await assert.rejects(digest(new Uint8Array(new SharedArrayBuffer(1))), {code: 'JXL_INPUT'});
  const detached = new Uint8Array(1); structuredClone(detached.buffer, {transfer: [detached.buffer]});
  await assert.rejects(digest(detached), {code: 'JXL_INPUT'});
});

test('nonzero input offsets, Buffer inputs, empty updates and independent state branches', async () => {
  const backing = Uint8Array.of(9, 97, 98, 99, 9), input = backing.subarray(1, 4);
  assert.equal(sha256Finish(sha256Update(sha256Start(), input)), native(input));
  assert.equal(await digest(input), native(input)); assert.equal(await digest(Buffer.from('abc')), native(input));
  const prefix = sha256Update(sha256Start(), utf8('a')), saved = encodeData(prefix);
  assert.equal(sha256Finish(sha256Update(prefix, utf8('bc'))), native(utf8('abc')));
  assert.equal(sha256Finish(sha256Update(prefix, utf8('d'))), native(utf8('ad')));
  assert.deepEqual(sha256Update(prefix, new Uint8Array()), prefix);
  assert.deepEqual(encodeData(prefix), saved);
  const a = sha256Start(), b = sha256Start(); a.h[0] = 0; a.tail.push(1);
  assert.equal(sha256Finish(b), native(new Uint8Array()));
  const moved = Uint8Array.of(1, 2, 3), want = {hash: native(moved), length: moved.length}, pending = part(moved);
  structuredClone(moved.buffer, {transfer: [moved.buffer]});
  assert.deepEqual(await pending, want);
});
