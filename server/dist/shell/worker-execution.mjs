// SPDX-License-Identifier: AGPL-3.0-only
const refusals = new WeakMap();
export function workerStartupRefused(name, constructor = globalThis.Worker) {
  return typeof constructor !== 'function' || refusals.get(constructor)?.has(name) === true;
}

export async function yieldWork(signal) {
  signal?.throwIfAborted();
  if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
  else await new Promise(resolve => setTimeout(resolve, 0));
  signal?.throwIfAborted();
}

export function createWorkerExecution({source, name, install, scope: inputs = {}, workerOptions = {},
  workerConstructor: constructor = globalThis.Worker, startupMs = 10000}) {
  let native = null, page = null, dispose = null, closed = false, admitted = false, url = '', timer = 0, pumping = false;
  const pending = [], early = [], controller = new AbortController();
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  ready.catch(() => {});
  const release = () => { clearTimeout(timer); if (url) URL.revokeObjectURL(url); url = ''; };
  const cleanup = () => { const close = dispose; dispose = null; if (close) Promise.resolve().then(close).catch(() => {}); };
  const emit = (type, event) => { if (!closed) client['on' + type]?.(event); };
  const fail = (error, type = 'error') => {
    if (closed) return;
    release(); native?.terminate(); native = null; pending.length = early.length = 0;
    controller.abort(error); cleanup(); rejectReady(error);
    emit(type, {error, message: error.message, preventDefault() {}});
    closed = true;
  };
  const deliver = (message, transfer = []) => {
    if (closed) return;
    const data = structuredClone(message, {transfer});
    queueMicrotask(() => emit('message', {data}));
  };
  const pump = () => {
    if (pumping || closed || !admitted || !page) return;
    pumping = true;
    void (async () => {
      try {
        while (!closed && pending.length) {
          await yieldWork(controller.signal);
          const {message} = pending.shift();
          Promise.resolve(page.onmessage?.({data: message})).catch(error => fail(error));
        }
      } catch (error) { if (!closed) fail(error); }
      finally { pumping = false; }
    })();
  };
  const fallback = error => {
    if (closed || admitted) return;
    release(); native?.terminate(); native = null; early.length = 0;
    if (typeof constructor === 'function') {
      let names = refusals.get(constructor);
      if (!names) refusals.set(constructor, names = new Set());
      names.add(name);
    }
    if (!install) {
      fail(Object.assign(new Error(error?.message || 'Worker startup refused'), {code: 'worker_startup_refused', cause: error}));
      return;
    }
    try {
      page = Object.assign(Object.create(null), inputs, {postMessage: deliver, signal: controller.signal,
        yield: () => yieldWork(controller.signal), close: () => client.terminate()});
      dispose = install(page);
      admitted = true; resolveReady('page'); pump();
    } catch (failure) { fail(failure); }
  };
  const client = {
    ready, onmessage: null, onerror: null, onmessageerror: null,
    get mode() { return closed ? 'closed' : admitted ? page ? 'page' : 'worker' : 'starting'; },
    postMessage(message, transfer = []) {
      if (closed) return;
      if (admitted && native) { native.postMessage(message, transfer); return; }
      pending.push(structuredClone({message, transfer}, {transfer}));
      pump();
    },
    terminate() {
      if (closed) return;
      closed = true; release(); native?.terminate(); native = null;
      pending.length = early.length = 0;
      const error = new DOMException('Canceled', 'AbortError');
      controller.abort(error); cleanup(); rejectReady(error); page = null;
    },
  };
  queueMicrotask(() => {
    if (closed) return;
    if (workerStartupRefused(name, constructor)) { fallback(); return; }
    try {
      const body = typeof source === 'function' ? source() : source;
      url = URL.createObjectURL(new Blob([body, '\n;self.postMessage({__rapierWorkerStarted:1});'], {type: 'text/javascript'}));
      const worker = native = new constructor(url, {...workerOptions, name});
      timer = setTimeout(() => fallback(new Error('Worker startup timed out')), startupMs);
      worker.onmessage = event => {
        if (closed || native !== worker) return;
        if (!admitted) {
          if (event.data?.__rapierWorkerStarted !== 1) { early.push(event); return; }
          admitted = true; release(); resolveReady('worker');
          for (const event of early.splice(0)) emit('message', event);
          try { for (const {message, transfer} of pending.splice(0)) worker.postMessage(message, transfer); }
          catch (error) { fail(error); }
          return;
        }
        emit('message', event);
      };
      worker.onerror = event => {
        if (closed || native !== worker) return;
        event.preventDefault?.();
        const error = event.error || new Error(event.message || 'Worker failed');
        if (!admitted) fallback(error); else fail(error);
      };
      worker.onmessageerror = () => { if (native === worker) fail(new Error('Worker returned unreadable data'), 'messageerror'); };
    } catch (error) { if (!admitted) fallback(error); else fail(error); }
  });
  return client;
}
