// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {recompress, restore} from '../v7/jpeg.mjs';
import {drive, sha256, named} from './durable-host.mjs';

const efforts = (process.env.JPEG_EFFORTS ?? '1,3,7').split(',').map(Number);
const fixtures = new URL('../public/test/fixtures/', import.meta.url).pathname;
async function jpegs() {
  const list = [];
  for (const name of ['bands-420-restart.jpg', 'bands-422.jpg', 'plasma-444.jpg', 'lf-129x129.jpg', 'jpeg-js-aligned.jpg'])
    list.push({id: name, bytes: new Uint8Array(await readFile(join(fixtures, name)))});
  if (process.env.JXL_CORPUS) for (const name of (await readdir(join(process.env.JXL_CORPUS, 'jpeg'))).sort())
    list.push({id: name, bytes: new Uint8Array(await readFile(join(process.env.JXL_CORPUS, 'jpeg', name)))});
  return list;
}
const withoutBytes = ({bytes: _bytes, ...rest}) => rest;
for (const jpeg of await jpegs()) for (const effort of efforts) test(`recompress e${effort} and restore ${jpeg.id}: resumed = ordinary`, async () => {
  const ordinary = await recompress(jpeg.bytes.slice(), {effort});
  const out = await drive(recompress, jpeg.bytes, {}, {effort}, {ms: 5});
  assert.equal(sha256(out.bytes), sha256(ordinary.bytes), `recompress, ${out.calls} calls`);
  assert.deepEqual(withoutBytes(out.record), withoutBytes(await named(ordinary, jpeg.bytes)));
  const back = await restore(ordinary.bytes.slice()), resumed = await drive(restore, ordinary.bytes, {}, {}, {ms: 5});
  assert.equal(sha256(back.bytes), sha256(jpeg.bytes), 'ordinary restore is the original');
  assert.equal(sha256(resumed.bytes), sha256(jpeg.bytes), `restore, ${resumed.calls} calls`);
  assert.deepEqual(withoutBytes(resumed.record), withoutBytes(await named(back, ordinary.bytes)));
});
