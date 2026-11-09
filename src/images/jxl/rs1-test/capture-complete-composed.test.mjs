// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {capture} from '../v7/capture-complete.mjs';
import {drive, sha256} from './durable-host.mjs';
import {tiled} from './photo-fixture.mjs';

const width = 320, photoHeight = 200, cardHeight = 236, height = photoHeight + cardHeight;
const card = new Uint8Array(gunzipSync(Buffer.from(await readFile(new URL('../v7/test/fixtures/snapdom-small-card.rgba.gz.base64', import.meta.url), 'utf8'), 'base64')));
const photo = await tiled(width, photoHeight), data = new Uint8Array(width * height * 4);
data.set(photo.data); data.set(card, photo.data.length);
const options = {fidelity: {quality: 85}, photoRects: [{x: 0, y: 0, width, height: photoHeight}],
  exactRects: [{x: 0, y: photoHeight + 196, width, height: 27, solidText: true}]};

for (const effort of (process.env.CC_EFFORTS ?? '1,3,4,6').split(',').map(Number))
  test(`capture-complete e${effort}, photo over card: resumed bytes equal the ordinary call`, {timeout: 3600000}, async () => {
    const ordinary = await capture({width, height, data: data.slice()}, {...options, effort});
    const out = await drive(capture, data, {width, height}, {...options, effort}, {ms: 30});
    assert.equal(sha256(out.bytes), sha256(ordinary.bytes), `${out.calls} calls`);
    assert.ok(out.calls > 1, 'the job ran in more than one call');
  });
