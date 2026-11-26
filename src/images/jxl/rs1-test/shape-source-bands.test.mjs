// SPDX-License-Identifier: MIT
import test from 'node:test';
import '../kernels.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {inspectPixels, inspectPixelsSteps, shapeFloors} from '../lossless.mjs';
import {lazySource, journalNext, journalProtocol} from '../step-journal.mjs';

const photo = new Uint8Array(gunzipSync(Buffer.from(await readFile(new URL('../v7/test/fixtures/kodim03-small.rgba.gz.base64', import.meta.url), 'utf8'), 'base64')));
const width = 769, height = 683, pixels = width * height, BAND = 2 << 20;
const fields = shape => ({...shape, palette: shape.palette?.colours ?? null});
function picture(kind) {
  const data = new Uint8Array(pixels * 4);
  for (let p = 0; p < pixels; p++) {
    const x = p % width, y = Math.floor(p / width), v = p % 23 * 11;
    data.set(kind === 'photo' ? photo.subarray(((y % 85) * 128 + x % 128) * 4, ((y % 85) * 128 + x % 128) * 4 + 4)
      : kind === 'colour' ? [v, 255 - v, p % 3 * 60, 255] : [v, v, v, 255], p * 4);
  }
  if (kind === 'late-colour') data.set([17, 91, 43, 255], (pixels - 2) * 4);
  return data;
}

test('raw shape bands match whole colour, opacity, palette order and channel floors', () => {
  const cases = [
    {kind: 'photo'}, {kind: 'grey'}, {kind: 'late-colour'}, {kind: 'colour', lateAlpha: true},
    {kind: 'grey', floor: {colour: 3}}, {kind: 'grey', floor: {alpha: true}},
    {kind: 'grey', floor: {colour: 3, alpha: true}},
  ];
  for (const {kind, floor, lateAlpha} of cases) {
    const data = picture(kind), requests = [], missing = [], units = [];
    if (lateAlpha) data[(pixels - 1) * 4 + 3] = 127;
    const source = lazySource(data.length, path => missing.push(path), [], 0, (from, to) => {
      requests.push([from, to]);
      assert.ok(to - from <= BAND, 'one shape unit reads at most the existing 2 MiB row band');
      return data.subarray(from, to);
    });
    if (floor) { shapeFloors.set(data, floor); shapeFloors.set(source, floor); }
    try {
      const expected = inspectPixels(data, width, height), steps = inspectPixelsSteps(source, width, height);
      const journal = journalProtocol({});
      let step;
      while (!(step = journalNext(steps, undefined, journal)).done) if (step.value?.unit) units.push(step.value.unit);
      assert.deepEqual(fields(step.value), fields(expected), JSON.stringify({kind, floor, lateAlpha}));
      if (step.value.palette) for (const key of step.value.palette.colours) for (let c = 0; c < 4; c++)
        assert.equal(step.value.palette.byte(key, c), expected.palette.byte(key, c));
      assert.deepEqual(missing, [], 'no complete-source fallback is needed');
      assert.equal(units[0], 'shape');
      assert.ok(units.filter(name => name === 'shape-band').length >= 2, 'the raw fixture crosses the row-band boundary');
      assert.ok(requests.some(([from]) => from > 0));
    } finally { shapeFloors.delete(data); shapeFloors.delete(source); }
  }
});

test('ordinary RGBA8 and native sample inspection keep their existing whole-call path', () => {
  for (const data of [Uint8Array.of(4, 4, 4, 255, 7, 9, 11, 128), Uint16Array.of(1028, 1028, 1028, 65535, 1799, 2313, 2827, 32896)]) {
    const expected = inspectPixels(data, 2, 1), steps = inspectPixelsSteps(data, 2, 1);
    const step = data instanceof Uint16Array ? journalNext(steps, undefined, journalProtocol({})) : steps.next();
    assert.equal(step.done, true);
    assert.deepEqual(fields(step.value), fields(expected));
  }
});
