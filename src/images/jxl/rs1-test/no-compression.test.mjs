// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {capture} from '../v7/capture.mjs';
import {encode} from '../v7/index.mjs';
import {drive, sha256} from './durable-host.mjs';
import {tiled} from './photo-fixture.mjs';

const picture = await tiled(320, 240);
delete globalThis.CompressionStream;
delete globalThis.DecompressionStream;

test('a resumable capture and encode run where the host has no CompressionStream', async () => {
  assert.equal(typeof CompressionStream, 'undefined');
  for (const [verb, options] of [[capture, {effort: 3}], [encode, {effort: 3, fidelity: {quality: 85}}]]) {
    const ordinary = await verb({...picture, data: picture.data.slice()}, options);
    const out = await drive(verb, picture.data, {width: picture.width, height: picture.height}, options, {ms: 5});
    assert.equal(sha256(out.bytes), sha256(ordinary.bytes), `${out.calls} calls`);
  }
});
