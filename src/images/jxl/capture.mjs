// SPDX-License-Identifier: MIT
import {LIMITS} from './limits.mjs';
import {fault} from './admit.mjs';
import {admitCapture, encodeCaptureBytes} from './capture-codec.mjs';

export {LIMITS};

const allowed = new Set(['signal', 'worker', 'maxError']);
let poolSend;

function fail(code, message) { return Object.assign(new Error(message), {code}); }
const workerFault = (error, phase) => fail('JXL_WORKER', 'JPEG XL worker ' + phase + ': ' + String(error?.message ?? error ?? 'unknown failure'));

function crashReason(event) {
  return fail('JXL_WORKER', event?.message || event?.error?.message || 'The JPEG XL worker failed.');
}

function abortReason(signal) {
  return signal.reason !== undefined ? signal.reason : fail('JXL_ABORTED', 'JPEG XL encoding was canceled.');
}

function on(target, type, handler) {
  if (typeof target.addEventListener === 'function') {
    target.addEventListener(type, handler);
    return;
  }
  if (typeof target.on === 'function') {
    target.on(type, type === 'message' ? payload => handler({data: payload}) : handler);
    return;
  }
  target['on' + type] = handler;
}

function own(data) {
  const copy = new Uint8Array(data.byteLength);
  copy.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  return copy;
}

const sessions = new WeakMap();
function open(thread, onCrash) {
  const existing = sessions.get(thread);
  if (existing) return existing;
  let next = 0, broken = null;
  const pending = new Map();
  const failAll = reason => {
    if (broken) return;
    broken = reason;
    for (const job of pending.values()) job.finish(false, reason);
    pending.clear();
    onCrash?.();
  };
  on(thread, 'message', event => {
    const data = event?.data, job = pending.get(data?.id);
    if (!job || job.done) return;
    if (data?.ok === true) {
      if (data.bytes instanceof Uint8Array) job.finish(true, data.bytes);
      else job.finish(false, fail('JXL_WORKER', 'JPEG XL worker returned invalid encoded bytes.'));
    } else {
      const error = data?.error;
      const code = typeof error?.code === 'string' && /^JXL_[A-Z0-9_]+$/.test(error.code) ? error.code : 'JXL_WORKER';
      job.finish(false, fail(code, String(error?.message ?? 'JPEG XL encoding failed.')));
    }
  });
  on(thread, 'error', event => failAll(crashReason(event)));
  on(thread, 'messageerror', event => failAll(workerFault(event, 'message could not be decoded')));
  on(thread, 'exit', code => failAll(fail('JXL_WORKER', 'JPEG XL worker exited (status ' + code + ').')));
  const send = (pixels, width, height, options) => new Promise((resolve, reject) => {
    if (broken) { reject(broken); return; }
    const id = ++next;
    const job = {};
    job.finish = (ok, value) => {
      if (job.done) return;
      job.done = true;
      options.signal?.removeEventListener('abort', job.onabort);
      pending.delete(id);
      ok ? resolve(value) : reject(value);
    };
    job.onabort = () => {
      try { thread.postMessage({id, operation: 'cancel'}); } catch {  }
      job.finish(false, abortReason(options.signal));
    };
    pending.set(id, job);
    if (options.signal?.aborted) { job.finish(false, abortReason(options.signal)); return; }
    options.signal?.addEventListener('abort', job.onabort, {once: true});
    try {
      thread.postMessage({id, operation: 'image', source: {data: pixels, width, height}, options: {maxError: options.maxError}}, [pixels.buffer]);
    } catch (error) {
      job.finish(false, workerFault(error, 'could not accept an input message'));
    }
  });
  sessions.set(thread, send);
  return send;
}

function endpoint() {
  if (poolSend) return poolSend;
  let thread;
  try { thread = new Worker(new URL('./capture-worker.mjs', import.meta.url), {type: 'module'}); }
  catch (error) { throw workerFault(error, 'could not start'); }
  poolSend = open(thread, () => { poolSend = undefined; });
  return poolSend;
}

export async function encodeCapture(data, width, height, options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw fault('JXL_INPUT', 'Capture options are an object.');
  for (const key of Object.keys(options)) if (!allowed.has(key)) throw fault('JXL_INPUT', `Unknown capture option ${key}.`);
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray))
    throw fault('JXL_INPUT', 'Captures use straight RGBA8 samples.');
  const onWorker = options.worker !== false && (options.worker || typeof document !== 'undefined');
  if (!onWorker || typeof Worker !== 'function') return encodeCaptureBytes(data, width, height, options);
  admitCapture(data, width, height, options);
  if (options.signal?.aborted) throw abortReason(options.signal);
  const pixels = own(data);
  if (options.worker instanceof Worker) return open(options.worker)(pixels, width, height, options);
  return endpoint()(pixels, width, height, options);
}
