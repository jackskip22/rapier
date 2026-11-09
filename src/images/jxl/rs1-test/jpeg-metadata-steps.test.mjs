// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {tools, journalNext} from './pb1-tools.mjs';
import {readFile} from 'node:fs/promises';
import {recompress, restore} from '../v7/jpeg.mjs';
import {withTail, packTail, restoreJPEGSteps} from '../jpeg-reconstruction.mjs';
import {jpegReconstruction, fileHeader, boxHeader, RECONSTRUCTION, PARTIAL} from '../container.mjs';
import {joinedBytes} from '../step-journal.mjs';
import {drive, named} from './durable-host.mjs';

const read = async () => new Uint8Array(await readFile(new URL('../public/test/fixtures/bands-420-restart.jpg', import.meta.url)));
const join = parts => new Uint8Array(Buffer.concat(parts));
const trace = steps => {
  let step; const counts = {};
  do {
    step = journalNext(steps, undefined, {join: joinedBytes, tools});
    if (step.value?.unitDone) {
      const {unitDone: name, value} = step.value; counts[name] = (counts[name] ?? 0) + 1;
      if (name === 'brotli-output') assert.ok(value.bytes.length <= 65536);
      if (name === 'jpeg-marker') assert.ok(!value.bytes || value.bytes.length <= 131072, 'one segment plus preceding JPEG tables');
    }
  } while (!step.done);
  return {bytes: step.value.subarray(0), counts};
};

test('large comments on a real photo are recompressed and restored through saved metadata units', {timeout: 30000}, async () => {
  const photo = await read(), comments = [];
  for (let k = 0; k < 3; k++) {
    const comment = new Uint8Array(65537); comment.set([255, 254, 255, 255]);
    for (let i = 4; i < comment.length; i++) comment[i] = photo[(i + k) % photo.length];
    comments.push(comment);
  }
  const original = join([photo.subarray(0, 2), ...comments, photo.subarray(2)]);
  const expected = await recompress(original, {effort: 1});
  const carried = await drive(recompress, original, {kind: 'file'}, {effort: 1}, {ms: 1, maxCalls: 400});
  assert.deepEqual(carried.record, await named(expected, original));
  const expanded = trace(restoreJPEGSteps(expected.bytes));
  assert.deepEqual(expanded.bytes, original); assert.ok(expanded.counts['brotli-output'] >= 4); assert.ok(expanded.counts['jpeg-marker'] >= 3);
  const resumed = await drive(restore, expected.bytes, {kind: 'file'}, {}, {ms: 1, maxCalls: 400});
  assert.deepEqual(resumed.record, await named(await restore(expected.bytes), expected.bytes));
});

test('out-of-order codestream fragments and a raw photo tail survive checkpointed bounded restore', {timeout: 30000}, async () => {
  const photo = await read(), file = (await recompress(photo, {effort: 1})).bytes;
  const {codestream, reconstruction} = jpegReconstruction(file), header = fileHeader(); new DataView(header.buffer).setUint32(24, 1);
  const pieces = [];
  for (let from = 0, sequence = 0; from < codestream.length; from += 1024, sequence++) {
    const data = codestream.subarray(from, from + 1024), index = new Uint8Array(4);
    new DataView(index.buffer).setUint32(0, sequence | (from + 1024 >= codestream.length ? 0x80000000 : 0));
    pieces.push(join([boxHeader(PARTIAL, 4 + data.length), index, data]));
  }
  const free = Array.from({length: 130}, () => boxHeader(0x66726565, 0));
  const framed = join([header, ...free, boxHeader(RECONSTRUCTION, reconstruction.length), reconstruction, ...pieces.reverse()]);
  const tail = new Uint8Array(400003); for (let i = 0; i < tail.length; i++) tail[i] = photo[i % photo.length];
  const input = withTail(framed, 0, tail.length, [packTail(tail)]), expected = join([photo, tail]);
  const expanded = trace(restoreJPEGSteps(input));
  assert.deepEqual(expanded.bytes, expected); assert.ok(expanded.counts['container-boxes'] >= 3); assert.ok(expanded.counts['brotli-output'] >= 7);
  const resumed = await drive(restore, input, {kind: 'file'}, {}, {ms: 1, maxCalls: 400});
  assert.deepEqual(resumed.record, await named(await restore(input), input)); assert.deepEqual(resumed.bytes, expected);
});
