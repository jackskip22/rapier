// SPDX-License-Identifier: MIT
import {LIMITS} from './limits.mjs';
import {CONTRACT_VERSION} from './worker-input.mjs';

export {CONTRACT_VERSION};
const error = (code, message) => Object.assign(new Error(message), {code});
const shape = (source, maxPixels) => {
  const {width, height} = source ?? {};
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > LIMITS.edge || height > LIMITS.edge || width * height > maxPixels)
    throw error('JXL_DIMENSIONS', 'Image dimensions exceed this encoder’s pixel budget.');
};

async function prepare(source, maxPixels) {
  if (source?.data !== undefined) {
    shape(source, maxPixels);
    const {data, width, height, colorSpace} = source;
    if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray || data instanceof Uint16Array || data instanceof Float32Array) || data.length !== width * height * 4)
      throw error('JXL_INPUT', 'Expected straight RGBA samples, width × height × 4.');
    const copy = new data.constructor(data);
    return {source: {data: copy, width, height, ...(colorSpace === undefined ? {} : {colorSpace})}, transfer: [copy.buffer]};
  }
  if (typeof Blob === 'function' && source instanceof Blob) return {source, transfer: []};
  if (source?.width !== undefined) shape(source, maxPixels);
  if (typeof createImageBitmap !== 'function') throw error('JXL_INPUT', 'Pass RGBA pixels or a Blob; image decoding is unavailable.');
  const bitmap = await createImageBitmap(source);
  try { shape(bitmap, maxPixels); }
  catch (reason) { bitmap.close(); throw reason; }
  return {source: bitmap, transfer: [bitmap], release: () => bitmap.close()};
}

export function createEncoder({worker, maxQueue = 2, maxPixels = LIMITS.pixels, startupTimeout = 15000} = {}) {
  if (!(typeof worker === 'function' || typeof worker === 'string' || worker instanceof URL)) throw new TypeError('worker is a URL or a factory creating a private Worker.');
  if (!Number.isInteger(maxQueue) || maxQueue < 0 || !Number.isSafeInteger(maxPixels) || maxPixels < 1 || maxPixels > 40_000_000 || !Number.isFinite(startupTimeout) || startupTimeout <= 0)
    throw new TypeError('Invalid queue, pixel or worker startup budget.');
  let thread, active, closed = false, serial = 0, ready, rejectReady;
  const queue = [];
  function stop() {
    rejectReady?.(error('JXL_WORKER', 'The encoder worker stopped.'));
    rejectReady = undefined; ready = undefined;
    if (thread) {
      thread.removeEventListener('message', reply); thread.removeEventListener('error', broke); thread.removeEventListener('messageerror', broke);
      thread.terminate(); thread = undefined;
    }
  }
  function settle(task, ok, value) {
    if (task.done) return;
    task.done = true; task.signal?.removeEventListener('abort', task.abort);
    if (active === task) active = undefined;
    else { const at = queue.indexOf(task); if (at >= 0) queue.splice(at, 1); }
    ok ? task.resolve(value) : task.reject(value);
    pump();
  }
  function failed(reason) {
    const task = active; stop();
    if (task) settle(task, false, reason);
  }
  function broke(event) { failed(error('JXL_WORKER', event?.message || 'The encoder worker failed.')); }
  function reply({data}) {
    const task = active;
    if (!task?.sent || data?.id !== task.id) return;
    if (typeof data.progress === 'number') {
      if (!Number.isFinite(data.progress) || data.progress < task.progress || data.progress > 1) return;
      task.progress = data.progress;
      try { task.onProgress?.(data.progress); } catch (reason) { if (active === task && !task.done) failed(reason); }
      return;
    }
    if (data.ok === false) { settle(task, false, Object.assign(new Error(data.error?.message || 'Encoding failed.'), data.error)); return; }
    if (data.ok === true) {
      if (!(data.bytes instanceof Uint8Array) || !data.bytes.byteLength) { failed(error('JXL_PROTOCOL', 'The encoder worker returned invalid bytes.')); return; }
      settle(task, true, data.bytes);
      return;
    }
    failed(error('JXL_PROTOCOL', 'The encoder worker returned an invalid response.'));
  }
  function start() {
    if (thread) return ready;
    thread = typeof worker === 'function' ? worker() : new Worker(worker, {type: 'module'});
    if (!thread || ['addEventListener', 'removeEventListener', 'postMessage', 'terminate'].some(method => typeof thread[method] !== 'function')) {
      const invalid = thread; thread = undefined; invalid?.terminate?.();
      throw new TypeError('worker must create a private Web Worker.');
    }
    thread.addEventListener('message', reply); thread.addEventListener('error', broke); thread.addEventListener('messageerror', broke);
    const made = thread;
    ready = new Promise((resolve, reject) => {
      const clean = () => { clearTimeout(timer); made.removeEventListener('message', hello); rejectReady = undefined; };
      const hello = ({data}) => {
        if (data?.protocol !== 'rapier-jxl') return;
        clean();
        data.version === CONTRACT_VERSION ? resolve() : reject(error('JXL_PROTOCOL', 'The worker has a different encoder contract version.'));
      };
      const timer = setTimeout(() => { clean(); reject(error('JXL_WORKER', 'The encoder worker did not start.')); }, startupTimeout);
      rejectReady = reason => { clean(); reject(reason); };
      made.addEventListener('message', hello);
      made.postMessage({protocol: 'rapier-jxl'});
    });
    return ready;
  }
  async function run(task) {
    let prepared;
    try {
      await start();
      if (task.done) return;
      prepared = await prepare(task.source, task.maxPixels);
      if (task.done) { prepared.release?.(); return; }
      task.sent = true;
      thread.postMessage({id: task.id, operation: 'image', source: prepared.source, options: {...task.options, maxPixels: task.maxPixels}, progress: !!task.onProgress}, prepared.transfer);
    } catch (reason) { prepared?.release?.(); if (!task.done) failed(reason); }
  }
  function pump() {
    if (closed || active || !queue.length) return;
    active = queue.shift(); void run(active);
  }
  return Object.freeze({
    encode(source, options = {}) {
      return new Promise((resolve, reject) => {
        if (closed) throw error('JXL_CLOSED', 'The encoder is closed.');
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Encoding options must be an object.');
        const {signal, onProgress, maxPixels: requestedMaxPixels = maxPixels, ...rest} = options;
        if (signal !== undefined && ['addEventListener', 'removeEventListener', 'throwIfAborted'].some(method => typeof signal?.[method] !== 'function')) throw new TypeError('signal must be an AbortSignal.');
        signal?.throwIfAborted();
        if (onProgress !== undefined && typeof onProgress !== 'function') throw new TypeError('onProgress must be a function.');
        if (!Number.isSafeInteger(requestedMaxPixels) || requestedMaxPixels < 1) throw error('JXL_OPTIONS', 'maxPixels must be a positive safe integer.');
        if (active && queue.length >= maxQueue) throw error('JXL_QUEUE_FULL', 'The encoder’s waiting queue is full.');
        const task = {source, options: rest, signal, onProgress, resolve, reject, maxPixels: Math.min(maxPixels, requestedMaxPixels), id: ++serial, progress: 0, done: false};
        task.abort = () => { if (active === task) stop(); settle(task, false, signal.reason); };
        signal?.addEventListener('abort', task.abort, {once: true});
        queue.push(task); pump();
      });
    },
    close() {
      if (closed) return;
      closed = true; stop();
      if (active) settle(active, false, error('JXL_CLOSED', 'The encoder is closed.'));
      for (const task of [...queue]) settle(task, false, error('JXL_CLOSED', 'The encoder is closed.'));
    },
  });
}

let next = 0;
const fail = (code, message) => Object.assign(new Error(message), {code});
const turns = new WeakMap();

export async function whenIdle(worker) { await turns.get(worker)?.tail; }

function queue(thread) {
  let state = turns.get(thread);
  if (state) return state;
  state = {tail: Promise.resolve(), error: null, reject: null, waiting: new Set()};
  const broke = event => {
    state.error ||= fail('JXL_WORKER', event?.message || 'The JPEG XL worker failed or returned an unreadable message.');
    for (const reject of state.waiting) reject(state.error);
    state.reject?.(state.error);
  };
  thread.addEventListener('error', broke);
  thread.addEventListener('messageerror', broke);
  state.dispose = () => {
    thread.removeEventListener('error', broke);
    thread.removeEventListener('messageerror', broke);
  };
  turns.set(thread, state);
  return state;
}

export async function toJXL(source, {worker, signal, progress, ...options} = {}) {
  if (!worker) throw fail('JXL_OPTIONS', 'Pass a worker as {worker}: a Worker running capture-worker.mjs (lossless capture), rapier-still-worker.js or rapier-worker.js, or its URL.');
  if (signal !== undefined && typeof signal?.throwIfAborted !== 'function') throw fail('JXL_OPTIONS', 'signal must be an AbortSignal.');
  if (progress !== undefined && typeof progress !== 'function') throw fail('JXL_OPTIONS', 'progress must be a function.');
  signal?.throwIfAborted();
  const own = typeof worker === 'string' || worker instanceof URL;
  const thread = own ? new Worker(worker) : worker;
  if (typeof thread?.postMessage !== 'function' || typeof thread.addEventListener !== 'function' || typeof thread.removeEventListener !== 'function')
    throw fail('JXL_OPTIONS', 'worker must be a Worker or a worker URL.');
  const state = queue(thread), id = 'image' + ++next;
  if (state.error) throw state.error;
  let canceled, cancelActive, resolveResult, rejectResult;
  const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
  const failed = reason => { if (own) thread.terminate(); rejectResult(reason); };
  state.waiting.add(failed);
  const cancel = reason => {
    if (canceled) return;
    canceled = {reason};
    failed(reason);
    cancelActive?.();
  };
  const abort = () => cancel(signal.reason);
  signal?.addEventListener('abort', abort, {once: true});

  const task = state.tail.then(async () => {
    if (canceled) throw canceled.reason;
    if (state.error) throw state.error;
    const plain = typeof Blob === 'function' && source instanceof Blob || typeof ImageData === 'function' && source instanceof ImageData;
    let picture;
    try {
      picture = plain ? source : await createImageBitmap(source);
      if (canceled) throw canceled.reason;
      if (state.error) throw state.error;
      return await new Promise((resolve, reject) => {
        let finished = false;
        const finish = (error, value) => {
          if (finished) return;
          finished = true;
          thread.removeEventListener('message', reply);
          state.reject = null;
          cancelActive = null;
          error ? reject(error) : resolve(value);
        };
        cancelActive = () => {
          if (own) finish(canceled.reason);
          else {
            try { thread.postMessage({id, operation: 'cancel'}); }
            catch (error) { state.error = fail('JXL_WORKER', error.message); finish(state.error); }
          }
        };
        const reply = ({data}) => {
          if (data?.id !== id) return;
          if (!('ok' in data)) {
            if (!canceled && typeof data.progress === 'number' && data.progress >= 0 && data.progress <= 1) {
              try { progress?.(data.progress); } catch (error) { cancel(error); }
            }
            return;
          }
          if (canceled) { finish(canceled.reason); return; }
          if (data.ok === true && (data.bytes instanceof Uint8Array || data.bytes instanceof ArrayBuffer))
            finish(null, new Blob([data.bytes], {type: 'image/jxl'}));
          else if (data.ok === false && typeof data.error?.message === 'string')
            finish(Object.assign(new Error(data.error.message), data.error));
          else finish(fail('JXL_WORKER', 'The JPEG XL worker returned an invalid result.'));
        };
        state.reject = error => finish(error);
        thread.addEventListener('message', reply);
        try { thread.postMessage({id, operation: 'image', source: picture, options, progress: !!progress}, plain ? [] : [picture]); }
        catch (error) { finish(error); }
      });
    } finally {
      if (!plain) picture?.close();
    }
  });
  state.tail = task.catch(() => {});
  task.then(resolveResult, failed).finally(() => {
    state.waiting.delete(failed);
    signal?.removeEventListener('abort', abort);
    if (own) { state.dispose(); thread.terminate(); }
  });
  return result;
}
