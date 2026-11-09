// SPDX-License-Identifier: MIT
// Real CC0 photographs with a byte-preserved motion-photo prefix and secondary image.
import test from 'node:test';
import assert from 'node:assert/strict';
import {tools, journalNext} from './pb1-tools.mjs';
import {readFile} from 'node:fs/promises';
import {brotliDecompressSync} from 'node:zlib';
import {recompress} from '../v7/jpeg.mjs';
import {longTail} from '../jpeg-tail.mjs';
import {packTail, packTailSteps, restoreJPEG} from '../jpeg-reconstruction.mjs';
import {complete} from '../bits.mjs';
import {joinedBytes} from '../step-journal.mjs';

const read = async name => new Uint8Array(await readFile(new URL('../public/test/fixtures/' + name, import.meta.url)));
function trace(steps) {
  const units = [];
  let step;
  do {
    step = journalNext(steps, undefined, {join: joinedBytes, tools});
    if (step.value?.unitDone) units.push(step.value.unitDone);
  } while (!step.done);
  return {value: step.value, units};
}

test('a photo tail exposes bounded search, compression, nested restore and comparison units', {timeout: 30000}, async () => {
  const original = await read('bands-420-restart.jpg'), secondary = await read('bands-progressive-profile.jpg');
  const file = (await recompress(original, {effort: 1})).bytes, inner = (await recompress(secondary, {effort: 1})).bytes;
  const prefix = new Uint8Array(262181).fill(77), jpeg = new Uint8Array(original.length + prefix.length + secondary.length);
  jpeg.set(original); jpeg.set(prefix, original.length); jpeg.set(secondary, original.length + prefix.length);
  const next = function* () { return inner; };
  const ordinary = complete(longTail(jpeg, original.length, file, 0, next, 64000000));
  const bounded = trace(longTail(jpeg, original.length, file, 0, next, 64000000));
  assert.deepEqual(bounded.value.subarray(0), ordinary); assert.deepEqual(restoreJPEG(bounded.value), jpeg);
  assert.ok(bounded.units.filter(name => name === 'tail-search-window').length >= 3);
  assert.ok(bounded.units.filter(name => name === 'brotli-block').length >= 4);
  assert.ok(bounded.units.includes('scan-part'), 'nested restore reaches the journal driver');
  assert.ok(bounded.units.filter(name => name === 'tail-compare').length >= 3);
});

test('stored tail blocks keep the exact ordinary stream and independent Brotli bytes', () => {
  let seed = 0x18a3a17;
  const raw = Uint8Array.from({length: 131101}, () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 24; });
  for (const tail of [new Uint8Array(), Uint8Array.of(1, 2, 3), raw]) {
    const ordinary = packTail(tail), bounded = trace(packTailSteps(tail));
    assert.deepEqual(bounded.value.subarray(0), ordinary);
    assert.deepEqual(new Uint8Array(brotliDecompressSync(ordinary)), tail);
    if (tail === raw) assert.equal(bounded.units.filter(name => name === 'brotli-stored').length, 3);
  }
});
