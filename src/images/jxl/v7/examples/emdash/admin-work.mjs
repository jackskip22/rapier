const canceled = () => new DOMException('Canceled', 'AbortError');
export function check(signal) { if (signal?.aborted) throw canceled(); }
const atPhase = (error, phase) => error?.name === 'AbortError' ? error
  : Object.assign(new Error(error?.message ?? String(error), {cause: error}), {code: error?.code, phase});

export async function api(path, {method = 'GET', body, signal, type, headers = {}} = {}) {
  check(signal);
  const response = await fetch(path, {method, body, signal, credentials: 'same-origin', cache: 'no-store',
    headers: {Accept: 'application/json', 'X-EmDash-Request': '1', ...(type ? {'Content-Type': type} : {}), ...headers}});
  check(signal);
  const json = await response.json().catch(() => ({}));
  check(signal);
  if (!response.ok || json.success === false) throw Object.assign(new Error(json.error?.message ?? `${response.status}`), {code: json.error?.code});
  return json.data ?? json;
}

export function createQueue({change = () => {}, start = () => {}, finish = () => {}, fail = () => {}} = {}) {
  let pending = [], active = null, busy = false, paused = false, wake = null, disposed = false;
  const changed = () => { if (!disposed) change({busy, paused}); };
  function failed(entry, error) {
    if (entry.failed) return;
    entry.failed = true;
    if (!disposed) { fail(entry.item, error); entry.onError?.(error); }
  }
  function settled(entry) {
    entry.parent?.removeEventListener('abort', entry.stop);
    if (!disposed) finish(entry.item);
    if (!--entry.batch.remaining) entry.batch.resolve();
  }
  function stop(entry) {
    entry.control.abort();
    failed(entry, canceled());
  }
  async function drain() {
    try {
      while (pending.length) {
        if (paused) await new Promise(resolve => { wake = resolve; });
        const entry = pending.shift();
        if (!entry) continue;
        active = entry;
        try {
          check(entry.control.signal);
          if (!disposed) start(entry.item, () => stop(entry));
          await entry.task(entry.item, entry.control.signal);
          check(entry.control.signal);
        } catch (error) { failed(entry, entry.control.signal.aborted ? canceled() : error); }
        finally { active = null; settled(entry); }
      }
    } finally { busy = false; paused = false; wake = null; changed(); }
  }
  function run(items, task, {signal, onError} = {}) {
    if (!items.length) return Promise.resolve();
    let resolve;
    const done = new Promise(r => { resolve = r; }), batch = {remaining: items.length, resolve};
    for (const item of items) {
      const entry = {item, task, batch, onError, parent: signal, control: new AbortController()};
      entry.stop = () => stop(entry);
      if (disposed || signal?.aborted) { stop(entry); settled(entry); }
      else { signal?.addEventListener('abort', entry.stop, {once: true}); pending.push(entry); }
    }
    if (pending.length && !busy) { busy = true; changed(); void drain(); }
    return done;
  }
  function cancel() {
    const rest = pending; pending = [];
    if (active) stop(active);
    for (const entry of rest) { stop(entry); settled(entry); }
    paused = false; wake?.(); wake = null; changed();
  }
  return {run, cancel,
    togglePause() {
      if (!busy) return;
      paused = !paused;
      if (!paused) { wake?.(); wake = null; }
      changed();
    },
    dispose() { disposed = true; cancel(); }
  };
}

export function workerResult(createWorker, message, {signal, progress} = {}) {
  return new Promise((resolve, reject) => {
    let worker, settled = false;
    const done = (result, value) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', stop);
      if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); }
      result(value);
    };
    const stop = () => done(reject, canceled());
    try {
      check(signal);
      worker = createWorker();
      worker.onmessage = ({data}) => {
        if (settled || signal?.aborted) return;
        if ('progress' in data) { progress?.(data.progress); return; }
        data.error ? done(reject, Object.assign(new Error(data.error.message), {code: data.error.code})) : done(resolve, data);
      };
      worker.onerror = event => done(reject, new Error(event.message));
      signal?.addEventListener('abort', stop, {once: true});
      check(signal);
      worker.postMessage(message);
    } catch (error) { done(reject, error); }
  });
}

export function createSettings(initial, {read, write, change = () => {}}) {
  let confirmed = structuredClone(initial), pending = [], busy = false, loaded = false, loading = null, error = null, disposed = false;
  const control = new AbortController();
  const value = () => pending.reduce((current, entry) => ({...current, ...entry.patch}), structuredClone(confirmed));
  const changed = () => { if (!disposed) change({value: value(), confirmed: structuredClone(confirmed), busy, error}); };
  async function load() {
    if (loaded) return confirmed;
    if (loading) return loading;
    loading = (async () => {
      try {
        check(control.signal);
        const result = await Promise.resolve().then(() => { check(control.signal); return read(control.signal); });
        check(control.signal);
        confirmed = structuredClone(result); loaded = true; error = null; changed();
        return confirmed;
      } catch (failure) { error = failure; changed(); throw failure; }
      finally { loading = null; }
    })();
    return loading;
  }
  async function drain() {
    busy = true; changed();
    try {
      try { await load(); }
      catch (failure) {
        for (const entry of pending.splice(0)) entry.reject(failure);
        changed(); return;
      }
      while (pending.length) {
        const entry = pending[0];
        try {
          check(control.signal);
          const result = await write({...confirmed, ...entry.patch}, control.signal);
          check(control.signal);
          confirmed = structuredClone(result); error = null; entry.resolve(confirmed);
        } catch (failure) { error = atPhase(failure, 'settings-save'); entry.reject(error); }
        pending.shift(); changed();
      }
    } finally { busy = false; changed(); }
  }
  return {load,
    save(patch) {
      if (disposed) return Promise.reject(canceled());
      let resolve, reject;
      const done = new Promise((yes, no) => { resolve = yes; reject = no; });
      pending.push({patch: structuredClone(patch), resolve, reject}); error = null; changed();
      if (!busy) void drain();
      return done;
    },
    dispose() { disposed = true; control.abort(); }
  };
}

export async function rewriteAndRead(result, {rewrite, read, signal}) {
  check(signal);
  try { await rewrite(result.urlMap, signal); }
  catch (error) { check(signal); throw atPhase(error, 'rewrite'); }
  check(signal);
  const items = [];
  for (const imported of result.imported) {
    check(signal);
    items.push(await read(imported.mediaId, signal));
    check(signal);
  }
  return items;
}
