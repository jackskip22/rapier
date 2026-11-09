// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {capture} from '../v7/capture-complete.mjs';
import {drive, sha256} from './durable-host.mjs';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {tiled} from './photo-fixture.mjs';

const width = 320, photoHeight = 600, height = photoHeight + 236;
const card = new Uint8Array(gunzipSync(Buffer.from(await readFile(new URL('../v7/test/fixtures/snapdom-small-card.rgba.gz.base64', import.meta.url), 'utf8'), 'base64')));
const picture = await tiled(width, photoHeight), photo = {data: new Uint8Array(width * height * 4)};
photo.data.set(picture.data); photo.data.set(card, picture.data.length);
const options = {effort: 7, fidelity: {quality: 85}, photoRects: [{x: 0, y: 0, width, height: photoHeight}],
  exactRects: [{x: 0, y: photoHeight + 196, width, height: 27, solidText: true}]};
const cpu = async run => { const t = process.cpuUsage(); const out = await run(); const u = process.cpuUsage(t); return {out, ms: (u.user + u.system) / 1000}; };

test('capture-complete e7 over three bands: resumed bytes equal, work within 5x the ordinary call (4.1-4.5x; 9.5x before the guard was carried, 7.1x before band summaries, 5.9x before standing first reads)', {timeout: 3600000}, async () => {
  const least = async run => { let best; for (let i = 0; i < 3; i++) { const r = await cpu(run); if (!best || r.ms < best.ms) best = r; } return best; };
  const ordinary = await least(() => capture({width, height, data: photo.data.slice()}, options));
  const resumed = await least(() => drive(capture, photo.data, {width, height}, options, {ms: 30}));
  assert.equal(sha256(resumed.out.bytes), sha256(ordinary.out.bytes), `${resumed.out.calls} calls`);
  assert.ok(resumed.out.calls > 3, 'the job ran in more calls than bands');
  assert.ok(resumed.ms < 5 * ordinary.ms, `resumed ${resumed.ms.toFixed(0)} ms against ordinary ${ordinary.ms.toFixed(0)} ms in ${resumed.out.calls} calls`);
});
