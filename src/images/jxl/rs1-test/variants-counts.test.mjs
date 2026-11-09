// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {variants} from '../v7/upload.mjs';
import {start, advance, finish} from '../v7/resumable.mjs';
import {configureDecoder, verify} from '../v7/verify.mjs';
import {decode} from '../v7/decode.mjs';
import {restore} from '../v7/jpeg.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('a resumed job of two exact variants verifies and gives the ordinary files', async () => {
  configureDecoder(decode, restore);
  const data = new Uint8Array(gunzipSync(Buffer.from(await readFile(new URL('../v7/test/fixtures/kodim03-small.rgba.gz.base64', import.meta.url), 'utf8'), 'base64')));
  const width = 128, height = data.length / 4 / width, options = {effort: 1, fidelity: 'exact', outputs: [{width: 64}, {width: 128}]};
  const ordinary = await variants({data: data.slice(), width, height}, options), parts = new Map();
  const store = {readSource: async (at, n) => data.slice(at, at + n), read: async ref => parts.get(ref.hash)?.slice(),
    readMany: async refs => refs.map(ref => parts.get(ref.hash)?.slice()),
    writeMany: async list => { for (const {ref, bytes} of list) parts.set(ref.hash, bytes.slice()); }};
  const input = {generation: 'rs2/variants-counts', sha256: hash(data), byteLength: data.length, width, height};
  let checkpoint = await start({operation: variants, input, options, store, verify}), done = false, calls = 0;
  while (!done) { ({checkpoint, done} = await advance(checkpoint, {operation: variants, input, store, verify, budget: {ms: 1}})); assert.ok(++calls < 400); }
  const resumed = await finish(checkpoint, {operation: variants, input, store});
  assert.ok(calls > 2, `${calls} calls`);
  assert.deepEqual(resumed.map(r => hash(r.bytes)), ordinary.map(r => hash(r.bytes)));
  assert.ok(resumed.every(r => r.verification?.verified === true));
});
