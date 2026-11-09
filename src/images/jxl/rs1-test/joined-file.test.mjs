// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import test from 'node:test';
import {createJournalStepper} from '../resumable-journal.mjs';
import {unit, joinedBytes, sliceBytes, lazySource, encodeValue, decodeValue} from '../step-journal.mjs';
import {digest} from '../resumable-data.mjs';

const PIECE = 300000, COUNT = 17;
const codec = createJournalStepper({id: 'joined-test', build: '2'.repeat(64), normalize: () => ({options: {}}),
  *open(plan, input) {
    const pieces = [];
    for (let k = 0; k < COUNT; k++) pieces.push(yield* unit('piece', () => Uint8Array.from(input.subarray(k * PIECE, (k + 1) * PIECE), b => b ^ 91)));
    return joinedBytes([Uint8Array.of(1, 2, 3), ...pieces]);
  }});

test('a file joined from saved values is written a part a call, as its bytes', async () => {
  const input = Uint8Array.from({length: PIECE * COUNT}, (_, i) => (i * 31 + (i >> 9)) & 255);
  const source = {generation: 'joined/1', sha256: await digest(input), byteLength: input.length}, parts = new Map(), written = [];
  const host = cp => ({source, expectedRevision: cp.revision, read: ref => parts.get(ref.hash), readMany: refs => refs.map(ref => parts.get(ref.hash)),
    readSource: (at, n) => input.subarray(at, at + n)});
  const persist = result => { let n = 0; for (const {ref, bytes} of result.parts) if (!parts.has(ref.hash)) { parts.set(ref.hash, bytes.slice()); n += bytes.length; } return n; };
  let {checkpoint} = await codec.start({source}).then(r => (persist(r), r)), result;
  do { result = await codec.advance(checkpoint, {...host(checkpoint), deadline: performance.now() + 1}, {units: 64}); written.push(persist(result)); checkpoint = result.checkpoint; }
  while (!result.done);
  const file = [];
  for await (const part of codec.outputParts(checkpoint, host(checkpoint))) file.push(Buffer.from(part));
  assert.ok(Buffer.concat(file).equals(Buffer.concat([Buffer.of(1, 2, 3), Buffer.from(input.map(b => b ^ 91))])));
  assert.ok(Math.max(...written) < input.length / 2, `${Math.max(...written)} bytes written by one call`);
  assert.ok(written.at(-1) < 1 << 20, 'the last call writes at most a part');
});

test('a picture kept as pieces reads its rows and rectangles from the pieces they cover, and answers the journal\'s symbols unread', async () => {
  const {tiledBytes, joinedBytes} = await import('../step-journal.mjs');
  const W = 37, H = 23, R = 5, C = 8, picture = Uint8Array.from({length: W * H * 4}, (_, i) => i * 7 & 255), grid = [], read = new Set();
  for (let y = 0; y < H; y += R) {
    const row = [];
    for (let x = 0; x < W; x += C) {
      const h = Math.min(R, H - y), w = Math.min(C, W - x), piece = new Uint8Array(w * h * 4);
      for (let r = 0; r < h; r++) piece.set(picture.subarray(((y + r) * W + x) * 4, ((y + r) * W + x + w) * 4), r * w * 4);
      row.push(piece);
    }
    grid.push(row);
  }
  const tiles = tiledBytes(grid, W, H, R, C, piece => read.add(piece));
  for (const [from, to] of [[0, W * 12], [W * 8 + 5, W * 36 + 3], [W * 88, W * H * 4]]) assert.deepEqual(tiles.subarray(from, to), picture.subarray(from, to));
  for (const [x, y, w, h] of [[3, 4, 10, 7], [8, 5, 8, 5], [30, 20, 7, 3]]) {
    const out = tiles.rect(x, y, w, h);
    for (let r = 0; r < h; r++) assert.deepEqual(out.subarray(r * w * 4, (r + 1) * w * 4), picture.subarray(((y + r) * W + x) * 4, ((y + r) * W + x + w) * 4));
  }
  read.clear();
  tiles.rect(8, 5, 8, 5);
  assert.deepEqual([...read], [grid[1][1]], 'one piece for a rectangle inside it');
  const unread = new Proxy(new Uint8Array(4), {get: (t, key) => {
    if (key === 'length') return 4;
    if (typeof key === 'symbol' && Symbol.keyFor(key)?.startsWith('rapier-jxl.journal')) return key === Symbol.for('rapier-jxl.journal.unread') ? false : undefined;
    throw new Error('read');
  }});
  for (const view of [joinedBytes([unread, unread]), tiledBytes([[unread]], 1, 1, 1, 1)]) assert.equal(view[Symbol.for('rapier-jxl.journal.something')], undefined);
});

test('container ranges retain source references and numeric reads touch only their byte window', () => {
  const data = Uint8Array.from({length: 65536}, (_, i) => i & 255), range = {at: 65536, bytes: data};
  const source = lazySource(262144, ref => { throw new Error('unexpected read ' + ref); }, [range]);
  const view = sliceBytes(source, 65536, 131072);
  assert.equal(view.length, 65536); assert.equal(view[17], data[17]);
  assert.deepEqual(view.subarray(31, 49), data.subarray(31, 49));
  const saved = encodeValue(view);
  assert.deepEqual(saved.meta.v.r, ['source', 0]); assert.equal(saved.meta.v.o, 65536); assert.equal(saved.meta.v.l, 65536);
  assert.equal(saved.bytes.length, 0, 'a range names the admitted source rather than copying it');
  const wider = encodeValue(sliceBytes(source, 65536, 196608));
  const replayed = decodeValue(wider.meta, wider.bytes, () => null, 'value', ref => { throw new Error('unexpected replay read ' + ref); },
    (from, to) => from >= 65536 && to <= 131072 ? data.subarray(from - 65536, to - 65536) : null).value;
  assert.equal(replayed.length, 131072); assert.equal(replayed[17], data[17]); assert.deepEqual(replayed.subarray(31, 49), data.subarray(31, 49));
  const pieces = [data.slice(), data.slice(), data.slice()], read = new Set();
  const whole = joinedBytes(pieces, value => read.add(value)), part = sliceBytes(whole, 65530, 65545);
  assert.deepEqual(part.subarray(0), Uint8Array.from([...data.subarray(-6), ...data.subarray(0, 9)]));
  assert.equal(whole[65537], data[1]); assert.ok(!read.has(pieces[0])); assert.ok(read.size <= 2, 'one 64 KiB window can straddle two pieces');
});

test('a joined source window requests every covered fragment together', () => {
  const missing = [], source = lazySource(4096, ref => missing.push(ref));
  const parts = [512, 128, 896].map(at => sliceBytes(source, at, at + 128));
  assert.throws(() => joinedBytes(parts).subarray(17, 317), error => error[Symbol.for('rapier-jxl.journal.unread')] === true);
  assert.deepEqual(missing, ['source:529:640', 'source:128:256', 'source:896:957']);
});
