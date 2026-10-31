(() => {
  const pending = [];
  const collect = event => pending.push(event.data);
  globalThis.addEventListener('message', collect);
  import('./worker-runtime.mjs').then(({install}) => {
    globalThis.removeEventListener('message', collect);
    install(globalThis, pending);
  }).catch(reason => {
    const fail = message => globalThis.postMessage({id: message?.id, ok: false, error: {name: reason?.name || 'Error', code: 'JXL_WORKER', message: reason?.message || 'Worker modules could not load.'}});
    globalThis.removeEventListener('message', collect);
    globalThis.addEventListener('message', event => fail(event.data));
    for (const message of pending) fail(message);
  });
})();
