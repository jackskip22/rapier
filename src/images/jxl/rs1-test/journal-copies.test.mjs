// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import test from 'node:test';

const a = await import('../step-journal.mjs?driver'), b = await import('../step-journal.mjs?verb');

test('a copy of the journal module sees the journal another copy drives, its facts and its unread values', () => {
  assert.notEqual(a.journalNext, b.journalNext);
  const seen = [];
  function* steps() { seen.push(b.journaling(), b.journalJoin([Uint8Array.of(1)])); }
  a.journalNext(steps(), undefined, {join: pieces => pieces.length});
  assert.deepEqual(seen, [true, 1]);
  assert.equal(b.journaling(), false);
  const join = a.joinedBytes([Uint8Array.of(1, 2), Uint8Array.of(3)], undefined, {opaque: true});
  assert.equal(b.journalFact(join, b.FACTS).opaque, true);
  assert.ok(b.journalFact(join, b.JOIN));
  assert.deepEqual([...join.subarray(1, 3)], [2, 3]);
  const unread = new Proxy({}, {get: (_, key) => { if (key === Symbol.for('rapier-jxl.journal.unread')) return true; throw new a.Unread('unread'); }});
  assert.throws(() => b.readAll([unread, unread]), error => error instanceof a.Unread);
});

test('a foreign module slices and saves a lazy source without acquiring its body', () => {
  const missed = [], source = a.lazySource(10 << 20, path => missed.push(path));
  const view = b.sliceBytes(source, 32, 9 << 20), saved = a.encodeValue(view);
  assert.equal(view.length, (9 << 20) - 32);
  assert.equal(saved.bytes.length, 0, 'the box body stays a source reference');
  assert.deepEqual([...saved.refers], ['source']);
  assert.deepEqual(missed, [], 'slicing and serialization read no source bytes');
  assert.equal(a.unreadPath(view), 'source');
  const span = view[Symbol.for('rapier-jxl.journal.span')];
  assert.throws(() => { span.offset = 0; }, TypeError);
  assert.throws(() => { span.ref[0] = 'other'; }, TypeError);
  const cold = a.decodeValue(saved.meta, saved.bytes, () => null, 'saved', path => missed.push(path), () => null).value;
  const narrow = b.encodeValue(b.sliceBytes(cold, 7, 23)), read = [];
  const restored = a.decodeValue(narrow.meta, narrow.bytes, () => null, 'saved', path => missed.push(path), (from, to) => {
    read.push([from, to]); return Uint8Array.from({length: to - from}, (_, i) => (from + i) % 251);
  }).value;
  assert.deepEqual(read, [[39, 55]], 'cold replay reads only the selected subrange');
  assert.deepEqual([...restored], Array.from({length: 16}, (_, i) => i + 39));
  assert.deepEqual(missed, []);
});

test('a foreign module keeps a saved lazy array as an immutable part reference', () => {
  const input = Uint8Array.from({length: 128}, (_, i) => i), original = a.encodeValue(input), missed = [];
  const cold = a.decodeValue(original.meta, null, null, 'group', path => missed.push(path)).value;
  const range = b.sliceBytes(cold, 11, 37), saved = a.encodeValue(range);
  assert.equal(saved.bytes.length, 0);
  assert.deepEqual([...saved.refers], ['group']);
  assert.equal(b.unreadPath(range), 'group');
  assert.deepEqual(missed, [], 'the saved group is not loaded to slice or serialize its reference');
  const restored = b.decodeValue(saved.meta, saved.bytes, (path, index) => {
    assert.equal(path, 'group'); assert.equal(index, 0); return input.buffer;
  }).value;
  assert.deepEqual(restored, input.subarray(11, 37));
});

test('joined ranges crossing foreign lazy pieces keep their offsets across another replay', () => {
  const input = Uint8Array.from({length: 128}, (_, i) => i), original = a.encodeValue(input), missed = [];
  const cold = a.decodeValue(original.meta, null, null, 'group', path => missed.push(path)).value;
  const joined = b.joinedBytes([cold, cold]);
  assert.equal(joined.length, 256, 'the foreign join knows saved lengths without loading them');
  const cut = a.sliceBytes(joined, 120, 136), saved = b.encodeValue(cut);
  assert.equal(saved.bytes.length, 0);
  assert.deepEqual(missed, []);
  const restored = a.decodeValue(saved.meta, saved.bytes, (path, index) => {
    assert.equal(path, 'group'); assert.equal(index, 0); return input.buffer;
  }).value;
  assert.deepEqual([...restored.subarray(0, 16)], [...input.subarray(120), ...input.subarray(0, 8)]);
});


test('the active driver owns saved requests across copied modules and a tracing proxy', () => {
  const owned = {join: pieces => pieces}, journal = new Proxy(owned, {
    get: (_, key) => Reflect.get(owned, key), set: (_, key, value) => Reflect.set(owned, key, value)
  });
  a.journalProtocol(journal);
  let calls = 0;
  const save = {tool: 'result'};
  function* steps() {
    return yield* b.stage('outer', function* () {
      const first = yield* b.unit('leaf', () => (++calls, 3), undefined, true);
      return yield* b.carried('sum', () => (++calls, first + 4), undefined, true);
    }, save, true, true);
  }
  const running = steps(), packets = [];
  let next;
  do { next = a.journalNext(running, undefined, journal); if (!next.done) packets.push(next.value); } while (!next.done);
  assert.deepEqual(packets, [
    {unit: 'outer', whole: true, cold: true, answer: 'result'},
    {unit: 'leaf', tail: true}, {unitDone: 'leaf', value: 3, save: undefined},
    {unit: 'sum', carry: true, tail: true}, {unitDone: 'sum', value: 7, save: undefined},
    {unitDone: 'outer', value: 7, save}
  ]);
  assert.equal(next.value, 7); assert.equal(calls, 2);
  const resumed = steps();
  assert.deepEqual(a.journalNext(resumed, undefined, journal).value, packets[0]);
  assert.deepEqual(a.journalNext(resumed, {[a.SAVED]: 7}, journal), {value: 7, done: true});
  assert.equal(calls, 2, 'a saved stage never enters its child callbacks');
  assert.equal(b.journaling(), false);

  const error = new Error('failed owned work');
  const failed = b.stage('outer', function* () { return yield* b.unit('leaf', () => { throw error; }); });
  assert.deepEqual(a.journalNext(failed, undefined, journal).value, {unit: 'outer'});
  assert.deepEqual(a.journalNext(failed, undefined, journal).value, {unit: 'leaf'});
  assert.deepEqual(a.journalNext(failed, undefined, journal).value, {unitFailed: 'leaf'});
  assert.deepEqual(a.journalNext(failed, undefined, journal).value, {unitFailed: 'outer'});
  assert.throws(() => a.journalNext(failed, undefined, journal), value => value === error);
  assert.equal(b.journaling(), false);
});
