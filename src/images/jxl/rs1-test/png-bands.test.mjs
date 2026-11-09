// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync, crc32} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {readPng} from '../public/bench/image-io.mjs';
import {inflateBand, pngPixels} from '../v7/png-bands.mjs';
import {pngWalk, pngLayout, pngRows, unfilterRow} from '../source.mjs';
import {shapeScan, shapeScanPixels} from '../lossless.mjs';
import {flatSampleAt, flatSampleX, flatSampleY} from '../screen-samples.mjs';
import {rankingPositions, transformRanking} from '../capture-trees.mjs';
import {FACTS} from '../step-journal.mjs';
import {photoPreferenceDifference} from '../photo-preference.mjs';
import {encode} from '../v7/upload.mjs';
import {encode as fullEncode, fit} from '../v7/index.mjs';
import {drive, memoryStore, sourceRecord} from './durable-host.mjs';

let seed = 11;
const random = n => (seed = Math.imul(seed ^ seed >>> 15, 0x2c1b3c6d) + 0x9e3779b9 >>> 0) % n;
const be = (v, n) => Array.from({length: n}, (_, i) => v >>> (8 * (n - 1 - i)) & 255);
const chunk = (name, data) => {
  const body = Buffer.concat([Buffer.from(name, 'latin1'), Buffer.from(data)]);
  return Buffer.concat([Buffer.from(be(data.length, 4)), body, Buffer.from(be(crc32(body) >>> 0, 4))]);
};
function png(width, height, {type = 2, interlace = 0, idat = 8192, corrupt = false, noise = false, flat = false, intent, profile, pixels} = {}) {
  const channels = {0: 1, 2: 3, 3: 1, 6: 4}[type], raw = [];
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  for (const [sx, sy, dx, dy] of passes) {
    const w = Math.max(0, Math.ceil((width - sx) / dx)), h = Math.max(0, Math.ceil((height - sy) / dy));
    if (!w || !h) continue;
    let previous = new Uint8Array(w * channels);
    for (let y = 0; y < h; y++) {
      const row = Uint8Array.from({length: w * channels}, (_, i) => type === 3 ? (i + y) % 7 : pixels ? pixels(i / channels | 0, y, i % channels) : flat ? ((i >> 7) * 40 + (y >> 5) * 20) & 255 : ((i >> 2) + 3 * y + random(noise || 9)) & 255);
      const filter = random(5), filtered = new Uint8Array(row.length);
      for (let i = 0; i < row.length; i++) {
        const a = i >= channels ? row[i - channels] : 0, b = previous[i], c = i >= channels ? previous[i - channels] : 0, p = a + b - c;
        const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
        filtered[i] = row[i] - [0, a, b, (a + b) >> 1, paeth][filter];
      }
      raw.push(filter, ...filtered); previous = row;
    }
  }
  const stream = new Uint8Array(deflateSync(Buffer.from(raw), {level: 6}));
  if (corrupt) stream[stream.length >> 1] ^= 0x40;
  const parts = [Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', [...be(width, 4), ...be(height, 4), 8, type, 0, 0, interlace])];
  if (intent !== undefined) parts.push(chunk('sRGB', [intent]));
  if (profile) parts.push(chunk('iCCP', [...Buffer.from('P3\0\0', 'latin1'), ...deflateSync(profile)]));
  if (type === 3) parts.push(chunk('PLTE', Array.from({length: 21}, (_, i) => i * 11)));
  for (let at = 0; at < stream.length; at += idat) parts.push(chunk('IDAT', stream.subarray(at, at + idat)));
  parts.push(chunk('IEND', []));
  return new Uint8Array(Buffer.concat(parts));
}

test('the band inflater writes zlib\'s output in any bands and refuses what DecompressionStream refuses', async () => {
  const run = (z, sizes) => {
    const stream = {length: z.length, read: (from, to) => z.subarray(from, to)}, out = [];
    let state = {pos: 2, bits: 0, count: 0, final: 0, type: -1, left: 0, lengths: null, hlit: 0, copy: 0, distance: 0, a: 1, b: 0, produced: 0, span: 1024, window: new Uint8Array(0)};
    sizes.forEach((size, k) => { const {output, state: next} = inflateBand(state, size, k === sizes.length - 1, stream); out.push(...output); state = structuredClone(next); });
    return Uint8Array.from(out);
  };
  const platform = async bytes => {
    const reader = new ReadableStream({start(c) { c.enqueue(bytes); c.close(); }}).pipeThrough(new DecompressionStream('deflate')).getReader(), out = [];
    try { for (;;) { const {value, done} = await reader.read(); if (done) return Uint8Array.from(out); out.push(...value); } } catch { return null; }
  };
  for (const size of [1, 4000, 70000]) for (const level of [0, 1, 9]) for (const strategy of [0, 2, 3]) {
    const data = Uint8Array.from({length: size}, (_, i) => random(4) ? (i * 7) & 255 : random(256)), z = new Uint8Array(deflateSync(data, {level, strategy}));
    const sizes = [];
    for (let left = size; left > 0;) { const n = Math.min(left, 1 + random(Math.max(1, size >> 2))); sizes.push(n); left -= n; }
    assert.deepEqual(run(z, sizes), data);
  }
  for (let t = 0; t < 200; t++) {
    const size = 1 + random(5000), data = Uint8Array.from({length: size}, (_, i) => random(3) ? (i * 5) & 255 : random(256));
    const z = new Uint8Array(deflateSync(data, {level: random(10)})), bad = z.slice();
    bad[2 + random(bad.length - 2)] ^= 1 << random(8);
    const input = t % 3 === 0 ? bad.subarray(0, 2 + random(bad.length - 2)) : t % 3 === 1 ? Uint8Array.from([...z, 1]) : bad;
    const want = await platform(input);
    let mine = null;
    try { mine = run(input, [size]); } catch (error) { assert.equal(error.code, 'JXL_INPUT'); }
    if (want?.length === size) assert.deepEqual(mine, want); else assert.equal(mine, null);
  }
});

const ordinary = file => encode(new Blob([file]), {fidelity: 'exact', effort: 3});
for (const [name, options] of [['RGB', {}], ['RGB with a perceptual sRGB intent (native samples)', {intent: 0, noise: 64}], ['flat RGB (a screen: its samples taken as it decodes)', {flat: true}], ['interlaced RGB (read whole)', {interlace: 1}], ['palette', {type: 3}], ['RGBA', {type: 6}]]) {
  test(`a resumed exact upload of a ${name} PNG writes the ordinary file`, {timeout: 120000}, async () => {
    const file = png(301, 203, options), want = await ordinary(file);
    const {bytes} = await drive(encode, file, {kind: 'file'}, {fidelity: 'exact', effort: 3}, {ms: 1});
    assert.deepEqual(bytes, want.bytes);
  });
}

test('a resumed lossy upload of a Display P3 PNG writes the ordinary file and reads its rows a band at a time', {timeout: 300000}, async () => {
  const profile = readFileSync(new URL('../public/test/fixtures/display-p3.icc', import.meta.url));
  const photo = readPng(readFileSync(new URL('../v7/test/fixtures/photo.png', import.meta.url)));
  const fold = (v, n) => { v %= 2 * n; return v < n ? v : 2 * n - 1 - v; };
  const pixels = (x, y, c) => photo.rgba[(fold(y, photo.height) * photo.width + fold(x, photo.width)) * 4 + c];
  const width = 2800, height = 700, file = png(width, height, {profile, pixels, idat: 65536}), options = {effort: 3, fidelity: {quality: 82}};
  const {start, advance, finish} = await import('../v7/resumable.mjs');
  const store = memoryStore(file), readMany = store.readMany, input = sourceRecord(file, {kind: 'file'});
  let read = 0, total = 0, calls = 0, done = false;
  store.readMany = async refs => { const parts = await readMany(refs); for (const part of parts) read += part?.length ?? 0; return parts; };
  let checkpoint = JSON.parse(JSON.stringify(await start({operation: encode, input, options, store})));
  while (!done) {
    read = 0;
    ({checkpoint, done} = await advance(checkpoint, {operation: encode, input, store, budget: {ms: 20}}));
    checkpoint = JSON.parse(JSON.stringify(checkpoint));
    total += read; calls++;
  }
  const record = await finish(checkpoint, {operation: encode, input, store});
  assert.deepEqual(record.bytes, (await encode(new Blob([file]), options)).bytes);
  assert.ok(total < 20 * width * height * 4, `${total} bytes read`);
  assert.ok(calls > 10);
});

test('a resumed effort-1 encode of a Display P3 PNG writes the ordinary file and reads its rows a band at a time', {timeout: 300000}, async () => {
  const profile = readFileSync(new URL('../public/test/fixtures/display-p3.icc', import.meta.url));
  const photo = readPng(readFileSync(new URL('../v7/test/fixtures/photo.png', import.meta.url)));
  const fold = (v, n) => { v %= 2 * n; return v < n ? v : 2 * n - 1 - v; };
  const pixels = (x, y, c) => photo.rgba[(fold(y, photo.height) * photo.width + fold(x, photo.width)) * 4 + c];
  const width = 2800, height = 700, file = png(width, height, {profile, pixels, idat: 65536});
  const {start, advance, finish} = await import('../v7/resumable.mjs');
  for (const fidelity of [{quality: 90}, 'exact']) {
    const options = {effort: 1, fidelity}, label = JSON.stringify(fidelity);
    const store = memoryStore(file), readMany = store.readMany, input = sourceRecord(file, {kind: 'file'});
    let total = 0, done = false;
    store.readMany = async refs => { const parts = await readMany(refs); for (const part of parts) total += part?.length ?? 0; return parts; };
    let checkpoint = JSON.parse(JSON.stringify(await start({operation: fullEncode, input, options, store})));
    while (!done) {
      ({checkpoint, done} = await advance(checkpoint, {operation: fullEncode, input, store, budget: {ms: 20}}));
      checkpoint = JSON.parse(JSON.stringify(checkpoint));
    }
    const record = await finish(checkpoint, {operation: fullEncode, input, store});
    assert.deepEqual(record.bytes, (await fullEncode(new Blob([file]), options)).bytes, label);
    assert.ok(total < 20 * width * height * 4, `${label}: ${total} bytes read`);
  }
});

test('a resumed exact effort-1 encode codes its groups across calls and writes the ordinary file', {timeout: 300000}, async () => {
  const photo = readPng(readFileSync(new URL('../v7/test/fixtures/photo.png', import.meta.url)));
  const fold = (v, n) => { v %= 2 * n; return v < n ? v : 2 * n - 1 - v; };
  const pixels = (x, y, c) => photo.rgba[(fold(y, photo.height) * photo.width + fold(x, photo.width)) * 4 + c];
  const width = 1536, height = 1024, file = png(width, height, {pixels, idat: 65536}), options = {effort: 1, fidelity: 'exact'};
  const {cpu, bytes} = await drive(fullEncode, file, {kind: 'file'}, options, {ms: 20});
  assert.deepEqual(bytes, (await fullEncode(new Blob([file]), options)).bytes);
  const most = Math.max(...cpu);
  assert.ok(most < 250, `${most.toFixed(0)} ms of CPU in one call`);
});

test('a resumed untagged effort-3 encode in bands of one group row writes the ordinary file', {timeout: 300000}, async () => {
  const photo = readPng(readFileSync(new URL('../v7/test/fixtures/photo.png', import.meta.url)));
  const fold = (v, n) => { v %= 2 * n; return v < n ? v : 2 * n - 1 - v; };
  const pixels = (x, y, c) => photo.rgba[(fold(y, photo.height) * photo.width + fold(x, photo.width)) * 4 + c];
  const width = 2304, height = 1024, file = png(width, height, {pixels, idat: 65536}), options = {effort: 3, fidelity: {quality: 90}};
  const {bytes} = await drive(fullEncode, file, {kind: 'file'}, options, {ms: 50});
  assert.deepEqual(bytes, (await fullEncode(new Blob([file]), options)).bytes);
});

test('a resumed fit reads each probe once and writes the ordinary file', {timeout: 600000}, async () => {
  const photo = readPng(readFileSync(new URL('../v7/test/fixtures/photo.png', import.meta.url)));
  const fold = (v, n) => { v %= 2 * n; return v < n ? v : 2 * n - 1 - v; };
  const pixels = (x, y, c) => photo.rgba[(fold(y, photo.height) * photo.width + fold(x, photo.width)) * 4 + c];
  const width = 768, height = 576, file = png(width, height, {pixels, idat: 65536}), options = {effort: 3, maxBytes: 50000};
  const {start, advance, finish} = await import('../v7/resumable.mjs');
  const store = memoryStore(file), readMany = store.readMany, read = store.read, input = sourceRecord(file, {kind: 'file'});
  let total = 0, done = false;
  store.readMany = async refs => { const parts = await readMany(refs); for (const part of parts) total += part?.length ?? 0; return parts; };
  store.read = async ref => { const part = await read(ref); total += part?.length ?? 0; return part; };
  let checkpoint = JSON.parse(JSON.stringify(await start({operation: fit, input, options, store})));
  while (!done) {
    ({checkpoint, done} = await advance(checkpoint, {operation: fit, input, store, budget: {ms: 50}}));
    checkpoint = JSON.parse(JSON.stringify(checkpoint));
  }
  const record = await finish(checkpoint, {operation: fit, input, store});
  assert.deepEqual(record.bytes, (await fit(new Blob([file]), options)).bytes);
  assert.ok(total < 250 * width * height * 4, `${(total / (width * height * 4)).toFixed(0)} times the picture read`);
});

test('a resumed effort-4 encode makes each band of its picture once and writes the ordinary file', {timeout: 300000}, async () => {
  const profile = readFileSync(new URL('../public/test/fixtures/display-p3.icc', import.meta.url));
  const photo = readPng(readFileSync(new URL('../v7/test/fixtures/photo.png', import.meta.url)));
  const fold = (v, n) => { v %= 2 * n; return v < n ? v : 2 * n - 1 - v; };
  const pixels = (x, y, c) => photo.rgba[(fold(y, photo.height) * photo.width + fold(x, photo.width)) * 4 + c];
  const width = 1152, height = 864, file = png(width, height, {profile, pixels, idat: 65536}), options = {effort: 4, fidelity: {quality: 90}};
  const cpu = () => { const {user, system} = process.cpuUsage(); return (user + system) / 1000; };
  let t = cpu();
  const ordinary = (await fullEncode(new Blob([file]), options)).bytes, once = cpu() - t;
  t = cpu();
  const {bytes} = await drive(fullEncode, file, {kind: 'file'}, options, {ms: 50});
  const resumed = cpu() - t;
  assert.deepEqual(bytes, ordinary);
  assert.ok(resumed < 10 * once, `${resumed.toFixed(0)} ms CPU resumed, ${once.toFixed(0)} ms ordinary`);
});

for (const intent of [undefined, 0]) test(`a resumed fit of a stored PNG${intent === undefined ? '' : ' with a perceptual sRGB intent'} writes the ordinary file`, {timeout: 600000}, async () => {
  const photo = readPng(readFileSync(new URL('../v7/test/fixtures/photo.png', import.meta.url)));
  const file = png(96, 72, {pixels: (x, y, c) => photo.rgba[(y * photo.width + x) * 4 + c], intent}), options = {maxBytes: 1500};
  const want = await fit(new Blob([file]), options);
  const {bytes} = await drive(fit, file, {kind: 'file'}, options, {ms: 60000});
  assert.deepEqual(bytes, want.bytes);
});

for (const [name, verb] of [['upload', encode], ['rapier-jxl', fullEncode]]) test(`a resumed PNG encode (${name}) never reads the whole file: its chunks 2 MiB a call, then a band's stream a call`, {timeout: 300000}, async () => {
  const file = png(1300, 1200, {idat: 65536, noise: 256});
  assert.ok(file.length > 4 << 20);
  const store = memoryStore(file), read = store.readSource, wholes = [];
  let calls = 0;
  store.readSource = async (at, length) => { if (length === file.length) wholes.push(calls); return read(at, length); };
  const {start, advance, finish} = await import('../v7/resumable.mjs');
  const input = sourceRecord(file, {kind: 'file'}), options = {fidelity: 'exact', effort: 3};
  let checkpoint = JSON.parse(JSON.stringify(await start({operation: verb, input, options, store}))), done = false;
  while (!done) {
    ({checkpoint, done} = await advance(checkpoint, {operation: verb, input, store, budget: {ms: 20}}));
    checkpoint = JSON.parse(JSON.stringify(checkpoint));
    calls++;
  }
  const record = await finish(checkpoint, {operation: verb, input, store});
  assert.deepEqual(record.bytes, (await verb(new Blob([file]), options)).bytes);
  assert.deepEqual(wholes, []);
  assert.ok(calls > 10);
});

test('a resumed upload of a PNG whose stream is corrupt refuses as the ordinary call does', {timeout: 120000}, async () => {
  const file = png(301, 203, {corrupt: true});
  await assert.rejects(ordinary(file), {code: 'JXL_INPUT'});
  await assert.rejects(drive(encode, file, {kind: 'file'}, {fidelity: 'exact', effort: 3}, {ms: 1}), {code: 'JXL_INPUT'});
});

test('a resumed upload refuses a chunk checksum past its first window as the ordinary call does', {timeout: 120000}, async () => {
  for (const idat of [65536, 1 << 30]) {
    const file = png(1300, 1200, {idat, noise: 256});
    file[file.length - (1 << 20)] ^= 1;
    await assert.rejects(ordinary(file), {message: /checksum/});
    await assert.rejects(drive(encode, file, {kind: 'file'}, {fidelity: 'exact', effort: 3}, {ms: 20}), {message: /checksum/});
  }
});

test('the decoder takes the screen samples, the transform ranking\'s samples and the colour preference\'s as the ordinary calls read them, a band at a time', async () => {
  const reader = {pngWalk, pngLayout, pngRows, unfilterRow, shapeScan, shapeScanPixels, flatSampleX, flatSampleY, rankingPositions, photoPreferenceDifference};
  for (const [width, height] of [[301, 203], [64, 33], [1000, 64]]) {
    const journal = async () => undefined;
    journal.touched = () => {};
    const {data} = await pngPixels(journal, png(width, height, {flat: true}), {reader}), pixels = data.subarray(0, data.length);
    assert.deepEqual([...data[FACTS].flats], Array.from({length: 256}, (_, s) => flatSampleAt(pixels, width, height, s)));
    assert.ok(data[FACTS].flats.some(Boolean) && !data[FACTS].flats.every(Boolean));
    assert.deepEqual(transformRanking(data, width, height), transformRanking(pixels, width, height));
    assert.equal(data[FACTS].ranking().length, Math.min(width * height, 32768) * 16);
    assert.equal(data[FACTS].preference(), photoPreferenceDifference(pixels, width, height));
  }
  const journal = async () => undefined;
  journal.touched = () => {};
  const {data} = await pngPixels(journal, png(640, 410, {noise: 40}), {reader}), pixels = data.subarray(0, data.length);
  assert.deepEqual(transformRanking(data, 640, 410), transformRanking(pixels, 640, 410));
  assert.equal(data[FACTS].preference(), photoPreferenceDifference(pixels, 640, 410));
  assert.notEqual(photoPreferenceDifference(pixels, 640, 410), 0);
});

test('a stored PNG that fits a call is inflated once by the ordinary reader: the same pixels as the band inflater', async () => {
  const {inflate} = await import('../source.mjs');
  const banded = {pngWalk, pngLayout, pngRows, unfilterRow, shapeScan, shapeScanPixels};
  for (const [width, height] of [[301, 203], [1000, 64]]) {
    const file = png(width, height, {noise: 40}), journal = async () => undefined;
    journal.touched = () => {};
    let calls = 0;
    const counted = (...args) => { calls++; return inflate(...args); };
    const plain = (await pngPixels(journal, file, {reader: banded})).data, whole = (await pngPixels(journal, file, {reader: {...banded, inflate: counted}})).data;
    assert.deepEqual(whole.subarray(0, whole.length), plain.subarray(0, plain.length));
    assert.equal(calls, 1);
  }
});
