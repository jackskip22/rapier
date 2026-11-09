// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectPixels, shapeScan, shapeScanPixels, shapeResult} from '../lossless.mjs';

function picture(kind, w, h) {
  let s = 99;
  const rnd = () => (s = Math.imul(s, 1103515245) + 12345 >>> 0) / 4294967296, a = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const v = kind.many ? rnd() * 256 | 0 : (rnd() * 6 | 0) * 40;
    a.set(kind.grey ? [v, v, v, 255] : [v, kind.many ? rnd() * 256 | 0 : 255 - v, p % 3 * 60, 255], p * 4);
  }
  if (kind.alpha) a[(w * h - 7) * 4 + 3] = 128;
  if (kind.lateColour) a.set([10, 20, 30, 255], (w * h - 3) * 4);
  return a;
}

const KINDS = [{grey: true}, {grey: true, alpha: true}, {grey: true, lateColour: true}, {}, {alpha: true}, {many: true}, {many: true, alpha: true}];

test('a banded shape scan answers as the whole scan', () => {
  const w = 160, h = 120, pixels = w * h;
  for (const kind of KINDS) {
    const rgba = picture(kind, w, h), whole = inspectPixels(rgba, w, h);
    for (const band of [1, 37, w, 7 * w + 3, pixels]) {
      const scan = shapeScan(pixels);
      for (let guard = 0; ; guard++) {
        assert.ok(guard < 4 * pixels, 'the scan advances');
        const next = scan.pass === 5 ? pixels : scan.p, base = Math.min(next, pixels - 1), count = Math.min(band, pixels - base);
        if (shapeScanPixels(scan, rgba.subarray(base * 4, (base + count) * 4), base, count)) break;
      }
      const got = shapeResult(scan);
      assert.deepEqual({...got, palette: got.palette?.colours}, {...whole, palette: whole.palette?.colours}, JSON.stringify(kind) + ' band ' + band);
    }
  }
});
