// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {capture} from '../v7/capture.mjs';
import {drive} from './durable-host.mjs';

function page(width, height, seed) {
  const data = new Uint8Array(width * height * 4).fill(255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (y % 24 > 4 && y % 24 < 18 && x % 9 < 6 && ((x * 7 + y * 3 + (x >> 5) * seed) % 13 < 6)) data.set([30, 30, 40], i);
    if (y % 600 < 40) data.set([20 + (x >> 4) % 3 * 60, 90, 200], i);
  }
  return {width, height, data};
}

test('resumable advances that stop inside a candidate leave the next ordinary capture its own bytes', async () => {
  const small = page(300, 200, 11), large = page(1400, 900, 7);
  for (const effort of [2, 3]) {
    const expected = (await capture({...large, data: large.data.slice()}, {effort})).bytes;
    await drive(capture, small.data, {width: 300, height: 200}, {effort}, {ms: 1});
    assert.deepEqual((await capture({...large, data: large.data.slice()}, {effort})).bytes, expected, `effort ${effort}`);
  }
});
