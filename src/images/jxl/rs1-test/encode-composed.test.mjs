// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {encode} from '../v7/index.mjs';
import {drive, sha256, named} from './durable-host.mjs';

const efforts = (process.env.ENCODE_EFFORTS ?? '1,3,5,7').split(',').map(Number);
function photo(width, height, seed) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, t = Math.sin(x / 9 + seed) * 40 + Math.cos(y / 13) * 30;
    data[i] = 120 + t + (x * seed % 17); data[i + 1] = 100 + t / 2 + (y % 23); data[i + 2] = 90 + ((x ^ y) & 31); data[i + 3] = 255;
  }
  return {width, height, data};
}
async function pictures() {
  const list = [{id: 'photo 300x200', ...photo(300, 200, 3)}];
  if (process.env.JXL_CORPUS) {
    const {readPng} = await import('../../../jxl/png.mjs');
    for (const name of ['kodim01.png', 'kodim23.png']) {
      const {width, height, data} = await readPng(new Uint8Array(await readFile(join(process.env.JXL_CORPUS, 'kodak', name))));
      list.push({id: name, width, height, data});
    }
  }
  return list;
}
const withoutBytes = ({bytes: _bytes, ...rest}) => rest;
for (const picture of await pictures()) for (const effort of efforts) for (const fidelity of [{quality: 85}, 'exact'])
  test(`encode e${effort} ${JSON.stringify(fidelity)} ${picture.id}: resumed = ordinary`, async () => {
    const ordinary = await encode({width: picture.width, height: picture.height, data: picture.data.slice()}, {effort, fidelity});
    const out = await drive(encode, picture.data, {width: picture.width, height: picture.height}, {effort, fidelity}, {ms: 5});
    assert.equal(sha256(out.bytes), sha256(ordinary.bytes), `${out.calls} calls`);
    assert.deepEqual(withoutBytes(out.record), withoutBytes(await named(ordinary, picture)));
  });

const {fit, variants} = await import('../v7/index.mjs');
for (const picture of await pictures()) for (const [name, verb, options] of [
  ['fit 20000 e3', fit, {maxBytes: 20000, effort: 3}],
  ['fit 4000 e5', fit, {maxBytes: 4000, effort: 5}],
  ['variants 128,64 e3', variants, {fidelity: {quality: 85}, effort: 3, outputs: [{width: 128}, {width: 64}]}],
]) test(`${name} ${picture.id}: resumed = ordinary`, async () => {
  const ordinary = await verb({width: picture.width, height: picture.height, data: picture.data.slice()}, options);
  const out = await drive(verb, picture.data, {width: picture.width, height: picture.height}, options, {ms: 5});
  const list = r => Array.isArray(r) ? r : [r];
  assert.deepEqual(list(out.record).map(r => r.bytes && sha256(r.bytes)), list(ordinary).map(r => r.bytes && sha256(r.bytes)), `${out.calls} calls`);
  assert.deepEqual(list(out.record).map(withoutBytes), list(await named(ordinary, picture)).map(withoutBytes));
});

for (const [name, file, options] of [
  ['a0.png q85 e3', 'graphics/a0.png', {effort: 3, fidelity: {quality: 85}}],
  ['logo.png exact e3', 'graphics/logo.png', {effort: 3, fidelity: 'exact'}],
  ['plasma-444.jpg exact e3', null, {effort: 3, fidelity: 'exact'}],
]) test(`encode a stored file ${name}: resumed = ordinary`, {skip: !!file && !process.env.JXL_CORPUS}, async () => {
  const bytes = new Uint8Array(await readFile(file ? join(process.env.JXL_CORPUS, file) : new URL('../public/test/fixtures/plasma-444.jpg', import.meta.url)));
  const ordinary = await encode(new Blob([bytes]), options);
  const out = await drive(encode, bytes, {kind: 'file'}, options, {ms: 5});
  assert.equal(sha256(out.bytes), sha256(ordinary.bytes), `${out.calls} calls`);
  assert.deepEqual(withoutBytes(out.record), withoutBytes(await named(ordinary, bytes)));
});

const upload = await import('../v7/upload.mjs');
for (const picture of await pictures()) for (const [name, verb, options] of [
  ['upload encode e3', upload.encode, {effort: 3}],
  ['upload encode e1 exact', upload.encode, {effort: 1, fidelity: 'exact'}],
  ['upload fit 30000', upload.fit, {maxBytes: 30000}],
  ['upload variants 256,96', upload.variants, {outputs: [{width: 256}, {width: 96}]}],
]) test(`${name} ${picture.id}: resumed = ordinary`, async () => {
  const ordinary = await verb({width: picture.width, height: picture.height, data: picture.data.slice()}, options);
  const out = await drive(verb, picture.data, {width: picture.width, height: picture.height}, options, {ms: 5});
  const list = r => Array.isArray(r) ? r : [r];
  assert.deepEqual(list(out.record).map(r => r.bytes && sha256(r.bytes)), list(ordinary).map(r => r.bytes && sha256(r.bytes)), `${out.calls} calls`);
  assert.deepEqual(list(out.record).map(withoutBytes), list(await named(ordinary, picture)).map(withoutBytes));
});
