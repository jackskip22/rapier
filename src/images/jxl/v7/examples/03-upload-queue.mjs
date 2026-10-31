import {Worker} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {feature, pixels, assert} from './helpers.mjs';
export async function run({dist}) {
  const {createCodec} = await feature(dist, 'codec');
  const file = pathToFileURL(resolve(dist, 'upload.worker.mjs'));
  const queue = createCodec({module: 'rapier-jxl/upload', maxPendingBytes: 2 * 1024 * 1024, maxPendingJobs: 4,
    workerFactory: () => new Worker(file)});
  try {
    const input = pixels(129, 97), progress = [];
    const first = queue.encode(input, {effort: 1, fidelity: {quality: 90}, onProgress: n => progress.push(n)});
    const controller = new AbortController();
    const cancelled = queue.encode(input, {effort: 3, signal: controller.signal});
    const cancellation = assert.rejects(cancelled, {name: 'AbortError'});
    controller.abort();
    const last = queue.encode(input, {effort: 3, fidelity: {quality: 90}});
    const [a, b] = await Promise.all([first, last]); await cancellation;
    assert.ok(a.length && b.length);
    assert.equal(progress.at(-1), 1);
    assert.ok(progress.every((n, i) => i === 0 || n >= progress[i - 1]));
    assert.equal(queue.stats.activeBytes + queue.stats.queuedBytes, 0);
    return {firstBytes: a.length, lastBytes: b.length, cancelledQueuedJob: true, retainedBytes: 0};
  } finally { queue.close(); }
}
