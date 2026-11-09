// SPDX-License-Identifier: MIT
import * as resumable from 'rapier-jxl/resumable';
import {digest} from './digest.mjs';

const PART = 1024 * 1024, READ = 1024 * 1024, KEEP_MS = 10 * 60 * 1000;
const fail = (code, message) => Object.assign(new Error(message), {code});
const tasks = new Map();

function threads() {
  const builtin = globalThis.process?.getBuiltinModule;
  const module = typeof builtin === 'function' ? builtin('node:worker_threads') : null;
  if (!module?.Worker) throw fail('JXL_PLATFORM', 'The thread driver needs Node worker threads.');
  return module;
}

async function readInput(input, store, signal) {
  const bytes = new Uint8Array(input.byteLength);
  for (let at = 0; at < bytes.length; at += READ) {
    signal?.throwIfAborted();
    const length = Math.min(READ, bytes.length - at), part = await store.readSource(at, length);
    if (!(part instanceof Uint8Array) || part.length !== length) throw fail('JXL_IO', 'The source could not be read.');
    bytes.set(part, at);
  }
  if (await digest(bytes) !== input.sha256) throw fail('JXL_INPUT', 'The source changed while it was read.');
  return bytes;
}

function run(job, progress) {
  const {Worker} = threads();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./thread-worker.mjs', import.meta.url), {workerData: job, transferList: [job.bytes.buffer]});
    worker.on('message', value => {
      if (typeof value?.progress === 'number') { progress(value.progress); return; }
      if (value?.error) reject(Object.assign(new Error(value.error.message), value.error));
      else resolve(value);
      worker.terminate();
    });
    worker.once('error', reject);
    worker.once('exit', code => reject(fail('JXL_INTERNAL', `The encoder thread exited (${code}).`)));
  });
}

let slot = null;
function launch(key, read) {
  const task = {key, settled: false, value: null, error: null, timer: null, progress: 0};
  slot = task; tasks.set(key, task);
  task.promise = (async () => run(await read(), value => { task.progress = value; }))().then(value => { task.value = value; }, error => { task.error = error; })
    .finally(() => {
      task.settled = true;
      if (slot === task) slot = null;
      task.timer = setTimeout(() => { if (tasks.get(key) === task) tasks.delete(key); }, KEEP_MS);
      task.timer.unref?.();
    });
  return task;
}

const pause = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, {once: true});
});

export const threadDriverState = () => ({running: slot && !slot.settled ? slot.key : null, tasks: tasks.size});
export function createThreadDriver(operations, base = resumable) {
  const nameOf = operation => Object.keys(operations).find(name => operations[name] === operation) ?? null;
  const ours = checkpoint => checkpoint?.driver === 'thread';
  return {
    async start(context) {
      const name = nameOf(context.operation);
      if (!name || !context.verify) return base.start(context);
      const {input, options = {}} = context;
      if (!['file', 'pixels', undefined].includes(input?.kind)) throw fail('JXL_INPUT', 'The thread driver reads a stored file or pixels.');
      const key = await digest(new TextEncoder().encode(JSON.stringify([name, input, options])));
      return {driver: 'thread', status: 'running', key, operation: name, options};
    },
    async advance(checkpoint, context) {
      if (!ours(checkpoint)) return base.advance(checkpoint, context);
      if (checkpoint.status === 'done') return {checkpoint, released: [], done: true};
      const {input, store, budget, signal} = context;
      let task = tasks.get(checkpoint.key);
      if (!task) {
        if (slot && !slot.settled) await Promise.race([slot.promise, pause(Math.max(1, Math.min(budget?.ms ?? 5000, 60000)), signal)]);
        if (slot && !slot.settled) return {checkpoint, released: [], done: false};
        task = tasks.get(checkpoint.key);
      }
      if (!task) {
        task = launch(checkpoint.key, async () => ({name: checkpoint.operation, input, options: checkpoint.options,
          bytes: await readInput(input, store, signal)}));
      }
      if (!task.settled) await Promise.race([task.promise, pause(Math.max(1, Math.min(budget?.ms ?? 5000, 60000)), signal)]);
      if (!task.settled) return {checkpoint: {...checkpoint, progress: task.progress}, released: [], done: false};
      tasks.delete(checkpoint.key); clearTimeout(task.timer);
      if (task.error) throw task.error;
      const {bytes, record} = task.value, items = [];
      for (let at = 0; at < bytes.length; at += PART) {
        const part = bytes.subarray(at, Math.min(bytes.length, at + PART));
        items.push({ref: {hash: await digest(part), length: part.length}, bytes: part});
      }
      if (items.length) await store.writeMany(items);
      return {checkpoint: {...checkpoint, status: 'done', record, parts: items.map(item => item.ref)}, released: [], done: true};
    },
    async finish(checkpoint, context) {
      if (!ours(checkpoint)) return base.finish(checkpoint, context);
      if (checkpoint.status !== 'done') throw fail('JXL_INPUT', 'The image job has not finished.');
      const parts = checkpoint.parts.length ? await context.store.readMany(checkpoint.parts) : [];
      const length = checkpoint.parts.reduce((sum, ref) => sum + ref.length, 0), bytes = new Uint8Array(length);
      let at = 0;
      if (!Array.isArray(parts) || parts.length !== checkpoint.parts.length) throw fail('JXL_IO', 'A finished part is missing.');
      for (const [index, part] of parts.entries()) {
        if (!(part instanceof Uint8Array) || part.length !== checkpoint.parts[index].length || await digest(part) !== checkpoint.parts[index].hash)
          throw fail('JXL_INPUT', 'A finished part changed after verification.');
        bytes.set(part, at); at += part.length;
      }
      if ('sha256:' + await digest(bytes) !== checkpoint.record?.verification?.outputDigest)
        throw fail('JXL_INPUT', 'The finished file does not match its verification receipt.');
      return {...checkpoint.record, bytes};
    },
  };
}
