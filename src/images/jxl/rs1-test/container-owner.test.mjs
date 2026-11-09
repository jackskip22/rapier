// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {recompress} from '../v7/jpeg.mjs';
import {readContainer, readContainerSteps} from '../container-advanced.mjs';
import {fileHeader, boxHeader, CODESTREAM, PARTIAL, BROB, RECONSTRUCTION} from '../container.mjs';
import {joinedBytes} from '../step-journal.mjs';
import {tools, journalNext} from './pb1-tools.mjs';
import {createJournalStepper} from '../resumable-journal.mjs';
import {digest} from '../resumable-data.mjs';

const join = parts => new Uint8Array(Buffer.concat(parts));
const u32 = value => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value); return bytes; };
const file = minor => { const bytes = fileHeader(); new DataView(bytes.buffer).setUint32(24, minor); return bytes; };
const box = (type, bytes, extended = false) => join([boxHeader(type, bytes.length, extended), bytes]);
const partial = (index, last, bytes, extended = false) => box(PARTIAL, join([u32(index + (last ? 0x80000000 : 0)), bytes]), extended);
function saved(bytes, options) {
  const steps = readContainerSteps(bytes, options), journal = {tools, join: joinedBytes};
  let next; do { next = journalNext(steps, undefined, journal); } while (!next.done);
  return next.value;
}
const refusal = run => { try { run(); return null; } catch (error) { return {code: error.code, message: error.message}; } };

test('ordinary and saved container collectors share fragment ordering, size and refusal rules', async () => {
  const photo = new Uint8Array(await readFile(new URL('../public/test/fixtures/bands-420-restart.jpg', import.meta.url)));
  const stream = readContainer((await recompress(photo, {effort: 1})).bytes).codestream;
  const unknown = box(0x75756964, photo.subarray(0, 23), true);
  const fragments = [partial(0, false, stream.subarray(0, 1)), partial(1, false, stream.subarray(1, 2), true),
    partial(2, true, stream.subarray(2))];
  const unbounded = box(CODESTREAM, stream); unbounded.fill(0, 0, 4);
  const valid = [stream, join([file(0), unknown, box(CODESTREAM, stream, true)]), join([file(0), unbounded]),
    join([file(0), ...fragments]), join([file(1), fragments[2], unknown, fragments[0], fragments[1]])];
  for (const bytes of valid) {
    const ordinary = readContainer(bytes), resumed = saved(bytes);
    assert.deepEqual(ordinary.codestream, stream);
    assert.deepEqual(resumed.codestream.subarray(0, stream.length), stream);
    assert.equal(resumed.level, ordinary.level); assert.equal(resumed.minorVersion, ordinary.minorVersion);
    assert.deepEqual(resumed.auxiliary.map(row => ({...row, data: row.data.subarray(0, row.data.length)})), ordinary.auxiliary);
  }

  const wrong = stream.slice(); wrong[0] = 0;
  const repeatedFinal = partial(1, true, stream.subarray(1, 2));
  const cases = [
    [join([file(1), fragments[0], fragments[0], fragments[1], fragments[2]])],
    [join([file(1), fragments[0], fragments[2]])],
    [join([file(1), fragments[0], repeatedFinal, fragments[2]])],
    [join([file(0), fragments[1], fragments[0], fragments[2]])],
    [join([file(0), box(CODESTREAM, stream), ...fragments])],
    [join([file(0), box(CODESTREAM, wrong)])],
    [join([file(1), partial(0, false, wrong.subarray(0, 1)), fragments[1], fragments[2]])],
    [join([file(2), box(CODESTREAM, stream)])],
    [join([file(0), box(BROB, u32(RECONSTRUCTION)), box(CODESTREAM, stream)])],
    [join([file(0), box(CODESTREAM, stream)]).subarray(0, 39)],
    [valid[1], {maxBoxes: 2}], [valid[1], {maxBytes: valid[1].length - 1}]
  ];
  for (const [bytes, options] of cases) {
    const expected = refusal(() => readContainer(bytes, options));
    assert.ok(expected?.code === 'JXL_INPUT' || expected?.code === 'JXL_SIZE', 'the malformed container is refused');
    assert.deepEqual(refusal(() => saved(bytes, options)), expected);
  }

  const spans = [stream.subarray(0, 1), stream.subarray(1, 2)];
  for (let i = 0; i < 68; i++) spans.push(stream.subarray(2 + Math.floor((stream.length - 2) * i / 68),
    2 + Math.floor((stream.length - 2) * (i + 1) / 68)));
  const order = [69, 1, 0, ...Array.from({length: 67}, (_, i) => i + 2)];
  const bytes = join([file(1), ...order.map(i => partial(i, i === 69, spans[i]))]);
  const source = {generation: 'photo-fragments/1', sha256: await digest(bytes), byteLength: bytes.length};
  const parts = new Map(); let checkpoint, calls = 0;
  const codec = () => createJournalStepper({id: 'pb1/container-prefixes', build: '8'.repeat(64), tools,
    normalize: () => ({budgetMs: Number.MIN_VALUE}),
    open: function* (_, input) { return (yield* readContainerSteps(input)).codestream; }});
  const keep = result => {
    for (const {ref, bytes} of result.parts) parts.set(ref.hash, bytes.slice());
    checkpoint = JSON.parse(JSON.stringify(result.checkpoint));
  };
  const host = () => ({source, expectedRevision: checkpoint.revision,
    read: ref => parts.get(ref.hash)?.slice(), readMany: refs => refs.map(ref => parts.get(ref.hash)?.slice()),
    readSource: (at, n) => bytes.slice(at, at + n)});
  keep(await codec().start({source}));
  while (checkpoint.status !== 'done') {
    keep(await codec().advance(checkpoint, host(), {units: 1}));
    assert.ok(++calls < 80, 'fragment batches make progress after JSON replay');
  }
  const output = []; for await (const part of codec().outputParts(checkpoint, host())) output.push(part);
  assert.ok(calls > 4, 'the prefix map crosses completed-unit checkpoints');
  assert.deepEqual(join(output), stream);
});
