const port = typeof globalThis.addEventListener === 'function' ? globalThis : globalThis.process?.getBuiltinModule?.('node:worker_threads')?.parentPort ?? globalThis;
const events = typeof port.addEventListener === 'function', pending = [];
let capture = false;
const early = event => {
  const message = events ? event.data : event;
  pending.push(message);
  if (!capture && (message?.prepare === 'capture' || message?.operation === 'capture')) {
    capture = true;
    import('./capture-boot.mjs').then(({compileCaptureKernels}) => compileCaptureKernels()).catch(() => {});
  }
};
if (events) { port.addEventListener('message', early); port.start?.(); } else port.on('message', early);
Promise.all([import('./worker-runtime.mjs'), import('./runtime.mjs')]).then(([{install}, runtime]) => {
  if (events) port.removeEventListener('message', early); else port.off('message', early);
  install(port, pending, runtime);
});
