// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {encode} from '../v7/index.mjs';
import * as resumable from '../v7/resumable.mjs';
import {verify, configureDecoder} from '../v7/verify.mjs';
import {decode} from '../v7/decode.mjs';
import {restore} from '../v7/jpeg.mjs';
import {wholeRebuildMeasure} from '../photo-whole-rebuild.mjs';
import {createHash} from 'node:crypto';
configureDecoder(decode, restore);

test('banded wholeRebuildMeasure uses 0-byte reference cache over 524,288 pixels and resumable effort 7 matches ordinary encode byte-for-byte', async () => {
  const w = 1024, h = 576, big = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    big[i * 4] = (i * 13) & 255;
    big[i * 4 + 1] = ((i >> 5) * 29) & 255;
    big[i * 4 + 2] = (i * 7 + (i >> 10) * 19) & 255;
    big[i * 4 + 3] = 255;
  }
  const m = wholeRebuildMeasure(big, w, h, {space: 'srgb'});
  m.destroy();

  const sw = 160, sh = 128, data = new Uint8Array(sw * sh * 4);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const at = (y * sw + x) * 4;
    data[at] = (x * 3 + y * 2 + ((x * y) & 31)) & 255;
    data[at + 1] = (y * 4 + ((x ^ y) & 63)) & 255;
    data[at + 2] = (180 - x + ((x * 5 + y * 7) & 31)) & 255;
    data[at + 3] = 255;
  }
  const ordinary = await encode({data: data.slice(), width: sw, height: sh}, {fidelity: {quality: 88}, effort: 7});
  const sha256 = createHash('sha256').update(data).digest('hex');
  const input = {generation: 'g1', sha256, byteLength: data.length, width: sw, height: sh, colorSpace: 'srgb'};
  const parts = new Map();
  const store = {
    readSource: (off, len) => data.slice(off, off + len),
    write: (ref, b) => parts.set(ref.hash, b.slice()),
    writeMany: items => { for (const {ref, bytes: b} of items) parts.set(ref.hash, b.slice()); },
    read: ref => parts.get(ref.hash)?.slice(),
    readMany: refs => refs.map(r => parts.get(r.hash)?.slice()),
  };
  let cp = await resumable.start({operation: encode, input, options: {fidelity: {quality: 88}, effort: 7}, store, verify});
  for (let step = 0; step < 200; step++) {
    const next = await resumable.advance(cp, {operation: encode, input, store, verify, budget: {ms: 100}});
    cp = next.checkpoint;
    if (next.done) break;
  }
  const resumed = await resumable.finish(cp, {operation: encode, input, store});
  assert.equal(resumed.verification.verified, true);
  assert.deepEqual(Buffer.from(resumed.bytes), Buffer.from(ordinary.bytes));
});
