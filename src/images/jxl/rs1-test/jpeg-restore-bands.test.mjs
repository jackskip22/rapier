// SPDX-License-Identifier: MIT
// Real photographs: the CC0-derived band fixtures and a progressive copy of bands-420-restart.jpg with ICC and EXIF.
import test from 'node:test';
import assert from 'node:assert/strict';
import {tools, journalNext} from './pb1-tools.mjs';
import {readFile} from 'node:fs/promises';
import {fork} from 'node:child_process';
import {recompress, restore} from '../v7/jpeg.mjs';
import {verify} from '../v7/verify.mjs';
import {start, advance, finish} from '../v7/resumable.mjs';
import {withTail, packTail, carryJPEGSteps} from '../jpeg-reconstruction.mjs';
import {parseJPEG} from '../jfif.mjs';
import {jpegReconstruction} from '../container.mjs';
import {joinedBytes, SAVED} from '../step-journal.mjs';
import {jpegDisplayDimensionsSteps} from '../v7/preparation-jpeg.mjs';
import {exifOrientation} from '../exif-orientation.mjs';
import {memoryStore, sourceRecord, sha256, named} from './durable-host.mjs';

if (process.argv[2] === 'resume') {
  const send = value => new Promise((resolve, reject) => process.send(value, error => error ? reject(error) : resolve()));
  process.once('message', async ({checkpoint, input, bytes, parts}) => {
    try {
      const store = memoryStore(bytes); for (const [key, part] of parts) store.parts.set(key, part);
      let done = false, calls = 0;
      while (!done) {
        const state = await advance(checkpoint, {operation: restore, input, store, verify, budget: {ms: 1}});
        checkpoint = JSON.parse(JSON.stringify(state.checkpoint)); done = state.done;
        assert.ok(++calls < 300, 'restore makes progress');
      }
      const record = await finish(checkpoint, {operation: restore, input, store});
      await send({record, calls});
    } catch (error) { await send({error: {message: error.message, code: error.code, stack: error.stack}}); }
    finally { process.disconnect(); }
  });
} else {
  const fixtures = new URL('../public/test/fixtures/', import.meta.url), read = async name => new Uint8Array(await readFile(new URL(name, fixtures)));
  const rows = [
    ['bands-420-restart.jpg', 'be07bfbfe19010543fbf84a42167ab9b666b8745b57d0e8d824d6d5e2c415736'],
    ['bands-422.jpg', 'b20ba25a60079f399c13eccae1e94c17d2337ef37d88a7b702370502cfd6d8fa'],
    ['bands-progressive-profile.jpg', '51b74d02465f40cf46198831ecb9a13c08be6c10174faf7a4d2e12738de779b7'],
  ];
  const withoutBytes = ({bytes, ...record}) => record;
  const coldFinish = payload => new Promise((resolve, reject) => {
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    const child = fork(new URL(import.meta.url), ['resume'], {serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env});
    let stderr = '', received = false;
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('message', result => { received = true; result.error ? reject(Object.assign(new Error(result.error.message), result.error)) : resolve(result); });
    child.once('exit', code => { if (!received) reject(new Error(`restore process exited ${code}: ${stderr}`)); });
    child.send(payload);
  });
  async function prove(original, file, verifyOutput = false) {
    const ordinary = await restore(file), expected = sha256(original);
    const receipt = verifyOutput ? await verify(file, ordinary) : undefined;
    assert.equal(sha256(ordinary.bytes), expected);
    const store = memoryStore(file), input = sourceRecord(file, {kind: 'file'});
    let checkpoint = await start({operation: restore, input, store, ...(verifyOutput && {verify})}), calls = 0;
    for (;;) {
      const state = await advance(checkpoint, {operation: restore, input, store, ...(verifyOutput && {verify}), budget: {ms: 1}});
      checkpoint = JSON.parse(JSON.stringify(state.checkpoint));
      assert.ok(++calls < 100 && !state.done, 'pause with a written band before the complete file');
      const saved = JSON.parse(new TextDecoder().decode(store.parts.get(checkpoint.state.hash)));
      if (Object.values(saved.codec?.journal ?? {}).some(entry => entry.name === 'scan-state' || entry.name === 'jpeg-scan')) break;
    }
    const stopped = new AbortController(), reason = new Error('caller canceled'); stopped.abort(reason);
    const before = JSON.stringify(checkpoint);
    await assert.rejects(advance(checkpoint, {operation: restore, input, store, verify, signal: stopped.signal}), error => error === reason);
    assert.equal(JSON.stringify(checkpoint), before);
    const cold = await coldFinish({checkpoint, input, bytes: file, parts: [...store.parts]});
    assert.ok(cold.calls > 1); assert.equal(sha256(cold.record.bytes), expected);
    assert.deepEqual(withoutBytes(cold.record), {...withoutBytes(await named(ordinary, file)),
      ...(verifyOutput && {verification: receipt})});
  }
  for (const [name, expected] of rows) for (const effort of [1, 7]) test(`restore ${name} effort ${effort}: byte-exact after a fresh process resumes saved bands`, {timeout: 30000}, async () => {
    const original = await read(name); assert.equal(sha256(original), expected);
    const file = (await recompress(original, {effort})).bytes;
    await prove(original, file);
  });
  test('restore a primary photograph and its progressive secondary image tail across process loss', {timeout: 30000}, async () => {
    const original = await read(rows[0][0]), secondary = await read(rows[2][0]);
    const file = (await recompress(original, {effort: 1})).bytes, inner = (await recompress(secondary, {effort: 1})).bytes;
    const prefix = new TextEncoder().encode('motion-photo-data'), packed = packTail(prefix), size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, packed.length);
    const bytes = new Uint8Array(original.length + prefix.length + secondary.length);
    bytes.set(original); bytes.set(prefix, original.length); bytes.set(secondary, original.length + prefix.length);
    await prove(bytes, withTail(file, 1, prefix.length, [size, packed, inner]));
  });
  test('restore raw inter-marker EXIF after long scan fill: bounded geometry and replayed orientation facts', {timeout: 30000}, async () => {
    const photo = await read(rows[2][0]);
    let appAt, appEnd;
    for (let at = 2; at + 4 <= photo.length;) {
      const marker = photo[at + 1], end = at + 2 + photo[at + 2] * 256 + photo[at + 3];
      if (marker === 225 && photo[at + 4] === 69) { appAt = at; appEnd = end; break; }
      at = end;
    }
    assert.ok(appAt !== undefined); assert.deepEqual([...photo.subarray(-2)], [255, 217]);
    const app = photo.subarray(appAt, appEnd), fill = new Uint8Array(262181).fill(255);
    const original = new Uint8Array(photo.length + fill.length), bodyEnd = photo.length - app.length - 2, exifAt = bodyEnd + fill.length;
    original.set(photo.subarray(0, appAt)); original.set(photo.subarray(appEnd, photo.length - 2), appAt);
    original.set(fill, bodyEnd); original.set(app, exifAt); original.set(photo.subarray(-2), original.length - 2);
    let relative, big, shown;
    assert.equal(exifOrientation(app, 10, app.length, (at, endian) => { relative = at; big = endian; }), 6);
    const ranges = [], source = {length: original.length, subarray(from, to) {
      assert.ok(to - from <= 196612, 'geometry reads at most a scan window and one complete APP1');
      ranges.push([from, to]); return original.subarray(from, to);
    }};
    const geometry = jpegDisplayDimensionsSteps(source, 64000000, value => { shown = value; });
    let step, saved;
    do {
      step = journalNext(geometry, undefined, {});
      if (step.value?.unitDone === 'jpeg-geometry') saved = JSON.parse(JSON.stringify(step.value.value));
    } while (!step.done);
    assert.ok(ranges.length >= 3); assert.deepEqual(step.value, {width: 600, height: 290});
    assert.deepEqual(shown, {width: 290, height: 600, orientation: 6, orientationAt: exifAt + relative, orientationBig: big});
    const replay = jpegDisplayDimensionsSteps({get length() { throw new Error('completed geometry reread the file'); }}, 64000000, value => { shown = value; });
    assert.equal(journalNext(replay, undefined, {}).value.unit, 'jpeg-geometry');
    assert.deepEqual(journalNext(replay, {[SAVED]: saved}, {}).value, {width: 600, height: 290});
    assert.deepEqual(shown, saved, 'orientation and absolute tag position survive a saved stage');
    const compressed = (await recompress(original, {effort: 1})).bytes;
    const steps = carryJPEGSteps(original, parseJPEG(original, true), jpegReconstruction(compressed).codestream, 1);
    let moved = false;
    do {
      step = journalNext(steps, undefined, {join: joinedBytes, tools});
      if (step.value?.unitDone === 'structure') {
        const data = step.value.value, at = data.markers.indexOf(225);
        const appIndex = data.markers.slice(0, at).filter(v => v >= 224 && v <= 239).length;
        const interIndex = data.markers.slice(0, at).filter(v => v === 255).length;
        const segment = data.apps.splice(appIndex, 1)[0], raw = new Uint8Array(segment.length + 1);
        raw[0] = 255; raw.set(segment, 1); data.markers[at] = 255; data.inter.splice(interIndex, 0, raw); moved = true;
      }
    } while (!step.done);
    assert.ok(moved); await prove(original, step.value.subarray(0), true);
  });

}
