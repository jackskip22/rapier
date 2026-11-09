// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {settleFacts} from '../v7/settle-facts.mjs';
import {settleScans} from '../v7/settle-scans.mjs';
import {lowWebpFacts} from '../v7/low-webp-quality.mjs';
import {tiled} from './photo-fixture.mjs';

const card = {width: 320, height: 236, data: new Uint8Array(gunzipSync(Buffer.from(await readFile(new URL('../v7/test/fixtures/snapdom-small-card.rgba.gz.base64', import.meta.url), 'utf8'), 'base64')))};
const grey = p => { const d = p.data.slice(); for (let i = 0; i < d.length; i += 4) d[i + 1] = d[i + 2] = d[i]; return {...p, data: d}; };
const holed = p => { const d = p.data.slice(); d[d.length - 1] = 254; return {...p, data: d}; };
const few = (w, h) => { const d = new Uint8Array(w * h * 4); for (let i = 0; i < w * h; i++) d.set([(i % 7) * 30, (i >> 9) % 3 * 80, 40, 255], i * 4); return {width: w, height: h, data: d}; };
const pictures = [['photo 640x480', await tiled(640, 480)], ['photo 333x777', await tiled(333, 777)], ['photo 2900x400', await tiled(2900, 400)],
  ['grey photo', grey(await tiled(500, 900))], ['photo with one alpha sample', holed(await tiled(400, 1200))], ['card', card],
  ['seven colours 700x2100', few(700, 2100)], ['tiny 20x20', await tiled(20, 20)], ['32x32', await tiled(32, 32)]];

for (const [name, picture] of pictures) test(`settled facts by bands equal the whole picture's: ${name}`, async () => {
  const whole = lowWebpFacts({data: picture.data, width: picture.width, height: picture.height});
  assert.deepEqual(await settleFacts(null, settleScans, picture.data, picture.width, picture.height), whole);
  assert.deepEqual(await settleFacts(null, settleScans, picture.data, picture.width, picture.height, 65536), whole);
});
