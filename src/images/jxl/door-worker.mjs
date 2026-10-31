// SPDX-License-Identifier: MIT
import {CONTRACT_VERSION} from './worker-input.mjs';

export async function workerPort() {
  if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope)
    return {listen: fn => { globalThis.onmessage = event => fn(event.data); }, send: (message, transfer) => globalThis.postMessage(message, transfer || [])};
  if (!globalThis.process?.versions?.node) return null;
  const {parentPort} = await import('node:worker_threads');
  if (!parentPort) return null;
  return {listen: fn => parentPort.on('message', fn), send: (message, transfer) => parentPort.postMessage(message, transfer || [])};
}

export function failure(error) {
  const code = error?.code || (error instanceof RangeError ? 'JXL_MEMORY' : 'JXL_ENCODE');
  return {code, message: String(error?.message || error || 'JPEG XL encoding failed.')};
}

export async function serve(run) {
  const port = await workerPort();
  if (!port) return;
  const queue = [], cancelled = new Set(), pending = new Set();
  let active = false;
  const aborted = id => ({id, ok: false, error: {code: 'JXL_ABORTED', message: 'JPEG XL encoding was canceled.'}});
  const finish = (id, response, transfer) => {
    pending.delete(id);
    cancelled.delete(id);
    port.send(response, transfer || []);
  };
  async function pump() {
    if (active) return;
    active = true;
    try {
      while (queue.length) {
        const message = queue.shift();
        if (cancelled.has(message.id)) { finish(message.id, aborted(message.id)); continue; }
        try {
          const result = await run(message, () => cancelled.has(message.id));
          if (cancelled.has(message.id)) { finish(message.id, aborted(message.id)); continue; }
          const bytes = result instanceof Uint8Array ? result : result?.bytes;
          finish(message.id, result instanceof Uint8Array ? {id: message.id, ok: true, bytes} : {id: message.id, ok: true, result}, bytes ? [bytes.buffer] : []);
        } catch (error) { finish(message.id, {id: message.id, ok: false, error: failure(error)}); }
      }
    } finally { active = false; }
  }
  port.listen(message => {
    if (message?.protocol === 'rapier-jxl' && message.id === undefined) { port.send({protocol: 'rapier-jxl', version: CONTRACT_VERSION}); return; }
    if (!message || (typeof message.id !== 'number' && typeof message.id !== 'string')) return;
    if (message.operation === 'cancel') {
      if (pending.has(message.id)) cancelled.add(message.id);
      return;
    }
    pending.add(message.id);
    queue.push(message);
    pump();
  });
}
