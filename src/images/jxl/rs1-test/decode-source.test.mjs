import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encode, fit} from '../v7/index.mjs';
import {recompress, restore} from '../v7/jpeg.mjs';
import {decode} from '../v7/decode.mjs';
import {configureDecoder, verify} from '../v7/verify.mjs';
import {workerAdmission} from '../v7/resumable.mjs';
import {drive, sha256} from './durable-host.mjs';

const jpeg = new Uint8Array(readFileSync(new URL('../../../tools/witnesses/fixtures/w7-flower.jpg', import.meta.url)));
configureDecoder(decode, restore);

for (const [name, verb, options] of [['encode q90 e3', encode, {effort: 3, fidelity: {quality: 90}}], ['fit e3', fit, {effort: 3, maxBytes: 20000}]])
  test(`${name}: a decode source writes encode() of the decoded pixels`, {timeout: 300000}, async () => {
    const stored = (await recompress(jpeg.slice(), {effort: 1})).bytes, picture = await decode(stored);
    const pixels = {data: new Uint8Array(picture.data.buffer, picture.data.byteOffset, picture.data.length), width: picture.width, height: picture.height, colorSpace: picture.colorSpace};
    const ordinary = await verb({...pixels, data: pixels.data.slice()}, options);
    const {record, calls} = await drive(verb, stored, {kind: 'decode'}, options, {ms: 20});
    assert.ok(calls > 1, `${calls} calls`);
    assert.equal(sha256(record.bytes), sha256(ordinary.bytes));
    assert.equal(record.width, picture.width);
    assert.deepEqual(record.source, {kind: 'bytes', digest: 'sha256:' + sha256(jpeg)});
    assert.equal((await verify(new Blob([jpeg], {type: 'image/jpeg'}), record)).verified, true);
  });

test('workerAdmission admits no decode job (no row measured)', () => {
  const options = {effort: 3, fidelity: {quality: 90}};
  assert.ok(workerAdmission({operation: encode, options, width: 600, height: 400}).admitted);
  assert.equal(workerAdmission({operation: encode, options, width: 600, height: 400, kind: 'decode'}).admitted, false);
});

test('without restore configured, a decode job names the stored file', {timeout: 300000}, async () => {
  configureDecoder(decode);
  try {
    const stored = (await recompress(jpeg.slice(), {effort: 1})).bytes;
    const {record} = await drive(encode, stored, {kind: 'decode'}, {effort: 3, fidelity: {quality: 90}}, {ms: 200});
    assert.deepEqual(record.source, {kind: 'bytes', digest: 'sha256:' + sha256(stored)});
  } finally { configureDecoder(decode, restore); }
});

test('a lossy encode of a decode source verifies in its advances against the JPEG it names', {timeout: 300000}, async () => {
  const stored = (await recompress(jpeg.slice(), {effort: 1})).bytes;
  const {record, calls} = await drive(encode, stored, {kind: 'decode'}, {effort: 3, fidelity: {quality: 80}}, {ms: 20, verify});
  assert.ok(calls > 1, `${calls} calls`);
  const named = {kind: 'bytes', digest: 'sha256:' + sha256(jpeg)};
  assert.deepEqual(record.source, named);
  assert.equal(record.kept, 'lossy');
  assert.equal(record.verification?.verified, true);
  assert.deepEqual(record.verification.source, named);
});
