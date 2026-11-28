(() => {
  const CHUNK = 196608;
  const post = message => ReactNativeWebView.postMessage(JSON.stringify(message));
  const refusal = (code, message) => Object.assign(new Error(message), {code});
  const codeOf = error => error?.name === 'AbortError' ? 'JXL_CANCELED' : /^JXL_[A-Z0-9_]+$/.test(error?.code) ? error.code : 'JXL_MESSAGE';
  const textOf = error => (error?.message || String(error)) + (error?.cause?.message ? ` (${error.cause.message})` : '');
  const urls = {}, loading = new Map();
  const moduleUrl = name => {
    if (urls[name]) return Promise.resolve(urls[name]);
    if (!loading.has(name)) {
      let resolve; const promise = new Promise(yes => { resolve = yes; });
      loading.set(name, {parts: [], got: 0, resolve, promise});
      post({type: 'need', name});
    }
    return loading.get(name).promise;
  };
  function takeModule({name, i, n, d}) {
    const entry = loading.get(name);
    if (!entry || entry.parts[i] !== undefined) return;
    entry.parts[i] = d;
    if (++entry.got < n) return;
    const text = entry.parts.join('');
    urls[name] = URL.createObjectURL(new Blob([text], {type: 'text/javascript'}));
    loading.delete(name);
    entry.resolve(urls[name]);
  }

  let worker, workerReady;
  const workerFor = () => workerReady ??= new Promise((resolve, reject) => {
    try {
      worker = new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], {type: 'text/javascript'})), {type: 'module'});
      worker.onmessage = ({data}) => {
        if (data.type === 'ready') resolve(worker);
        else if (data.type === 'done') sendResult(data.id, new Uint8Array(data.bytes));
        else if (data.type === 'started') post(data);
        else if (data.type === 'error') { post(data); if (data.id) forget(data.id); }
      };
      worker.onerror = event => { event.preventDefault(); post({type: 'error', id: null, code: 'JXL_WORKER', message: event.message || 'The encoder worker stopped.'}); worker.terminate(); workerReady = null; reject(new Error('worker failed')); };
    } catch (error) { workerReady = null; reject(error); }
  });

  const jobs = new Map();
  const forget = id => jobs.delete(id);
  const fromBase64 = (text, into, at) => {
    const raw = atob(text);
    for (let i = 0; i < raw.length; i++) into[at + i] = raw.charCodeAt(i);
    return raw.length;
  };
  const toBase64 = bytes => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.onerror = () => reject(refusal('JXL_BRIDGE', 'The result could not be read.'));
    reader.readAsDataURL(new Blob([bytes]));
  });
  async function sendResult(id, bytes) {
    try {
      for (let at = 0, i = 0; at < bytes.length || i === 0; at += CHUNK, i++) {
        if (!jobs.has(id)) return;
        post({type: 'out', id, i, size: bytes.length, d: await toBase64(bytes.subarray(at, at + CHUNK))});
      }
      post({type: 'done', id});
    } catch (error) { post({type: 'error', id, code: codeOf(error), message: textOf(error)}); }
    finally { forget(id); }
  }

  let animationConfigured = false;
  async function animate(job) {
    const controller = job.controller = new AbortController(), {signal} = controller;
    try {
      const [workerBlob, page] = await Promise.all([moduleUrl('animation'), moduleUrl('animation.browser')]);
      post({type: 'started', id: job.id});
      const {encode, configure} = await import(page);
      if (!animationConfigured) { configure({workerFactory: () => new Worker(workerBlob, {type: 'module', name: 'rapier-jxl/animation worker'})}); animationConfigured = true; }
      let shown = -1;
      const result = await encode(new Blob([job.bytes], {type: job.mime}), {effort: job.effort, fidelity: {quality: job.quality}, signal, onProgress: fraction => {
        const step = Math.floor(fraction * 100);
        if (step > shown) { shown = step; post({type: 'progress', id: job.id, fraction}); }
      }});
      if (!result.bytes) throw refusal(result.reason.code, result.reason.message);
      await sendResult(job.id, result.bytes);
    } catch (error) {
      post({type: 'error', id: job.id, code: codeOf(error), message: textOf(error)});
      forget(job.id);
    }
  }
  async function start(job) {
    if (job.op === 'animate') return animate(job);
    try {
      const need = job.op === 'recompress' || job.op === 'restore' ? 'jpeg' : 'animation';
      const [w, mod] = await Promise.all([workerFor(), moduleUrl(need)]);
      if (!jobs.has(job.id)) return;
      job.running = true;
      const input = job.bytes.buffer;
      w.postMessage({op: job.op, id: job.id, mime: job.mime, quality: job.quality, effort: job.effort, moduleUrl: mod, input}, [input]);
    } catch (error) { post({type: 'error', id: job.id, code: codeOf(error), message: textOf(error)}); forget(job.id); }
  }

  function receive(message) {
    try {
      if (message.type === 'module') takeModule(message);
      else if (message.type === 'run') jobs.set(message.id, {...message, bytes: new Uint8Array(message.size), got: 0});
      else if (message.type === 'in') {
        const job = jobs.get(message.id);
        if (!job) return;
        job.got += fromBase64(message.d, job.bytes, message.i * CHUNK);
        if (job.got >= job.size) start(job);
      } else if (message.type === 'cancel') {
        const job = jobs.get(message.id);
        if (!job) return;
        if (job.controller) job.controller.abort();
        else if (job.running) worker.postMessage({type: 'cancel', id: job.id});
        else forget(job.id);
      }
    } catch (error) { post({type: 'error', id: message?.id ?? null, code: codeOf(error), message: textOf(error)}); }
  }
  globalThis.rapier = {receive};
  post({type: 'ready'});
})();
