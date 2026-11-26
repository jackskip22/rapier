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
    const pixels = {data: new Uint8Array(picture.data.buffer, picture.data.byteOffset, picture.data.length), width: picture.width, height: picture.height,
      ...(picture.rgbaICC ? {icc: picture.rgbaICC} : {colorEncoding: picture.colorEncoding})};
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

for (const [name, verb, options] of [['encode q90 e3', encode, {effort: 3, fidelity: {quality: 90}}], ['fit e3', fit, {effort: 3, maxBytes: 20000}]])
  test(`${name}: a decode source with a profile that names no space is coded by its profile`, {timeout: 300000}, async () => {
  const icc = readFileSync(new URL('../../../tools/jxl-gate/assets/icc/linear-srgb.icc', import.meta.url));
  const tag = Buffer.from('ICC_PROFILE\0\x01\x01', 'latin1'), length = 2 + tag.length + icc.length;
  const app2 = 20, end = app2 + 2 + (jpeg[app2 + 2] << 8 | jpeg[app2 + 3]);
  const profiled = new Uint8Array(Buffer.concat([jpeg.subarray(0, app2), Buffer.from([0xff, 0xe2, length >> 8, length & 255]), tag, icc, jpeg.subarray(end)]));
  const stored = (await recompress(profiled.slice(), {effort: 1})).bytes, picture = await decode(stored);
  assert.ok(picture.rgbaICC);
  const ordinary = await verb({data: new Uint8Array(picture.data), width: picture.width, height: picture.height, icc: picture.rgbaICC}, options);
  const {record} = await drive(verb, stored, {kind: 'decode'}, options, {ms: 200});
  assert.equal(sha256(record.bytes), sha256(ordinary.bytes));
  assert.deepEqual((await decode(record.bytes)).colorEncoding, (await decode(ordinary.bytes)).colorEncoding);
  assert.equal((await verify(new Blob([profiled], {type: 'image/jpeg'}), record)).verified, true);
});
