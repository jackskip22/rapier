// SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {tools, journalNext} from './pb1-tools.mjs';
import {readFile} from 'node:fs/promises';
import {fork} from 'node:child_process';
import {parseJPEG} from '../jfif.mjs';
import {carryJPEG, carryJPEGSteps} from '../jpeg-reconstruction.mjs';
import {jpegReconstruction} from '../container.mjs';
import {joinedBytes, lazySource} from '../step-journal.mjs';
import {writeJPEG} from '../public/test/jpeg-writer.mjs';
import {recompress, restore} from '../v7/jpeg.mjs';
import {verify} from '../v7/verify.mjs';
import {start, advance, finish} from '../v7/resumable.mjs';
import {memoryStore, sourceRecord, sha256, named} from './durable-host.mjs';

if (process.argv[2] === 'resume') {
  process.once('message', async ({checkpoint, input, bytes, parts}) => {
    try {
      const store = memoryStore(bytes); for (const [key, part] of parts) store.parts.set(key, part);
      let done = false, calls = 0;
      while (!done) {
        const next = await advance(checkpoint, {operation: recompress, input, store, verify, budget: {ms: 1}});
        checkpoint = JSON.parse(JSON.stringify(next.checkpoint)); done = next.done;
        assert.ok(++calls < 1000, 'syntax continuation progresses');
      }
      process.send({record: await finish(checkpoint, {operation: recompress, input, store}), calls});
    } catch (error) { process.send({error: {message: error.message, code: error.code, stack: error.stack}}); }
    finally { process.disconnect(); }
  });
} else {
  const photo = new Uint8Array(await readFile(new URL('../public/test/photo-corpus/grace-hopper.jpg', import.meta.url)));
  assert.equal(sha256(photo), '9aaa25c1001de86dcecd264c6d0168421f1f768116a1b76909b5d8ab280bcaf8');
  const withFill = () => {
    const fill = new Uint8Array(2 * 65536 + 17).fill(255), stuffed = new Uint8Array(2 * 65536 + 6);
    for (let i = 0; i < stuffed.length; i += 2) stuffed[i] = 255;
    const tail = new Uint8Array(65533 + photo.length); tail.set(photo, 65533);
    const bytes = new Uint8Array(photo.length + fill.length + stuffed.length + tail.length);
    bytes.set(photo.subarray(0, 2)); bytes.set(fill, 2); bytes.set(photo.subarray(2, -2), fill.length + 2);
    bytes.set(stuffed, photo.length - 2 + fill.length); bytes.set([255, 217], photo.length - 2 + fill.length + stuffed.length);
    bytes.set(tail, bytes.length - tail.length); return bytes;
  };
  const traced = (bytes, jpeg, codestream) => {
    let active, step, windows = 0, reads = 0, syntaxPieces = 0, paddingPieces = 0, tailWindows = 0;
    const source = lazySource(bytes.length, () => { throw new Error('Unexpected missing source range.'); }, [], 0, (from, to) => {
      if (active === 'structure-window') { assert.ok(to - from <= 131076, 'one marker window and at most one complete segment'); reads++; }
      return bytes.subarray(from, to);
    });
    const steps = carryJPEGSteps(source, jpeg, codestream, 1);
    do {
      step = journalNext(steps, undefined, {join: joinedBytes, tools});
      if (step.value?.unit) active = step.value.unit;
      if (step.value?.unitDone) {
        const {unitDone: name, value} = step.value;
        if (name === 'structure-window') windows++;
        if (name === 'jpeg-payload-tail') tailWindows++;
        if (name.startsWith('jpeg-syntax-')) {
          syntaxPieces++; if (name === 'jpeg-syntax-padding') paddingPieces++;
          assert.ok(value.bytes.length <= 65536, 'a syntax part contains only its bounded emitted bytes');
          assert.ok(value.pending >= 0 && value.pending < 8 && value.acc >= 0 && value.acc < 2 ** value.pending);
        }
        active = null;
      }
    } while (!step.done);
    return {bytes: step.value.subarray(0), windows, reads, syntaxPieces, paddingPieces, tailWindows};
  };

  test('JPEG syntax windows preserve long fill and a secondary real photograph byte for byte', async () => {
    const bytes = withFill(), parsed = parseJPEG(bytes, true);
    assert.equal(sha256(bytes), 'd7a6fcd2328c5ef8929d1141f2a27cd355baa375365cb26f13e9d1863742ae89');
    const codestream = jpegReconstruction((await recompress(photo, {effort: 1})).bytes).codestream;
    const ordinary = carryJPEG(bytes, parsed, codestream, 1), result = traced(bytes, parsed, codestream);
    assert.deepEqual(result.bytes, ordinary);
    assert.equal(sha256(jpegReconstruction(ordinary).reconstruction), '88a8eacfbd042e664ccca746b285e12d4ae7879d3b2fddda48a7ee195edc63cb');
    assert.ok(result.windows >= 20 && result.reads > 5 && result.tailWindows >= 3 && result.syntaxPieces > 5);
    assert.deepEqual((await restore(result.bytes)).bytes, bytes);
  });

  test('a real photograph with noncanonical restart padding carries its bits in separate syntax parts', async () => {
    const original = parseJPEG(photo, true);
    const bytes = writeJPEG({...original, progressive: true, restartInterval: 1, padding: 0}), parsed = parseJPEG(bytes, true);
    assert.equal(sha256(bytes), 'd41e5d6da0509f6dda8800a7376c943f3e5a33e10668b589d6965b6c0f09d052');
    for (let i = 0; i < original.components.length; i++) assert.deepEqual(parsed.components[i].coeffs, original.components[i].coeffs);
    assert.equal(parsed.padding.length, 138076);
    const ordinary = (await recompress(bytes, {effort: 1})).bytes, codestream = jpegReconstruction(ordinary).codestream;
    const result = traced(bytes, parsed, codestream);
    assert.deepEqual(result.bytes, ordinary); assert.equal(result.paddingPieces, 3);
    assert.equal(sha256(jpegReconstruction(ordinary).reconstruction), '37224b1e26b689621dba5a013cdbf45716ee60830b7379ea6a68e4ac09763a56');
    assert.deepEqual((await restore(result.bytes)).bytes, bytes);
  });

  test('a fresh process resumes JPEG syntax with pending bits and returns the complete ordinary receipt', {timeout: 30000}, async t => {
    const ordinary = await recompress(photo, {effort: 1}), receipt = await verify(photo, ordinary);
    const store = memoryStore(photo), input = sourceRecord(photo, {kind: 'file'});
    let checkpoint = await start({operation: recompress, input, options: {effort: 1}, store, verify}), calls = 0;
    let tick = 0; const clock = t.mock.method(performance, 'now', () => ++tick);
    for (;;) {
      const next = await advance(checkpoint, {operation: recompress, input, store, verify, budget: {ms: 0.001}});
      checkpoint = JSON.parse(JSON.stringify(next.checkpoint));
      assert.ok(++calls < 1000 && !next.done, 'pause inside the syntax stage');
      const state = JSON.parse(new TextDecoder().decode(store.parts.get(checkpoint.state.hash)));
      const entries = Object.values(state.codec?.journal ?? {});
      if (entries.some(entry => entry.name === 'jpeg-syntax-markers')) {
        assert.ok(!entries.some(entry => entry.name === 'jpeg-syntax'), 'the completed header must not mask pending-bit replay'); break;
      }
    }
    clock.mock.restore();
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    const result = await new Promise((resolve, reject) => {
      const child = fork(new URL(import.meta.url), ['resume'], {serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env});
      let stderr = '', received = false;
      child.stderr.on('data', data => { stderr += data; }); child.once('error', reject);
      child.once('message', value => { received = true; value.error ? reject(Object.assign(new Error(value.error.message), value.error)) : resolve(value); });
      child.once('exit', code => { if (!received) reject(new Error(`syntax resume process exited ${code}: ${stderr}`)); });
      child.send({checkpoint, input, bytes: photo, parts: [...store.parts]});
    });
    assert.ok(result.calls > 1); assert.deepEqual(result.record, {...await named(ordinary, photo), verification: receipt});
  });
}
