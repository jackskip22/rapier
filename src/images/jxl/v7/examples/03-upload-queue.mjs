import {readFile} from 'node:fs/promises';
import {feature, assert} from './helpers.mjs';
export async function run({dist, observe}) {
  const upload = await feature(dist, 'upload');
  const {recompress} = await feature(dist, 'jpeg');
  const {decode} = await feature(dist, 'decode.node');
  const jpeg = new Uint8Array(await readFile(new URL('../../public/test/photo-corpus/grace-hopper.jpg', import.meta.url)));
  const reference = await recompress(jpeg, {effort: 7});
  const photo = await decode(reference.bytes, {colorSpace: 'original', applyOrientation: false});
  await observe?.(jpeg, reference, 'photo-reference');
  const input = {width: 129, height: 97, data: new Uint8Array(129 * 97 * 4)};
  for (let y = 0; y < input.height; y++) {
    const start = ((160 + y) * photo.width + 192) * 4;
    input.data.set(photo.data.subarray(start, start + input.width * 4), y * input.width * 4);
  }
  upload.configure({helpers: {count: 2, memoryBytes: 1 << 30}});
  const queue = upload;
  try {
    const progress = [];
    const first = queue.encode(input, {effort: 1, fidelity: {quality: 90}, onProgress: n => progress.push(n)});
    const controller = new AbortController();
    const cancelled = queue.encode(input, {effort: 3, signal: controller.signal});
    const cancellation = assert.rejects(cancelled, {name: 'AbortError'});
    controller.abort();
    const last = queue.encode(input, {effort: 3, fidelity: {quality: 90}});
    const [a, b] = await Promise.all([first, last]); await cancellation;
    assert.ok(a.bytes.length && b.bytes.length);
    assert.ok(a.meetsTarget && b.meetsTarget);
    assert.equal(a.source, null); assert.equal(b.source, null);
    assert.equal(progress.at(-1), 1);
    assert.ok(progress.every((n, i) => i === 0 || n >= progress[i - 1]));
    await observe?.(input, a, 'effort-1');
    await observe?.(input, b, 'effort-3');
    return {firstBytes: a.bytes.length, lastBytes: b.bytes.length, cancelledQueuedJob: true, retainedBytes: 0};
  } finally { await upload.close(); upload.configure(); }
}
