// The unpacked page reports its own completed start. A newer controller cannot
// mistake an older open page for the release it has just installed.
globalThis.RapierStartupRelease = (() => {
  const release = '__RAPIER_BOOT_ID__';
  const enabled = __RAPIER_PWA_ENABLED__;
  let worker = null, attempt = '', terminal = '', reloading = false;
  try {
    if (enabled && window.self === window.top && !window.RapierHost && !window.speedracer &&
        globalThis.RAPIER_APPS_HOST !== true && 'serviceWorker' in navigator &&
        (location.protocol === 'https:' || location.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname))) {
      worker = navigator.serviceWorker;
      attempt = crypto.randomUUID();
    }
  } catch (_) { worker = null; }
  const post = () => {
    try {
      const controller = worker?.controller;
      if (!controller) return;
      controller.postMessage({type: 'rapier:startup', release, attempt, state: 'begin'});
      if (terminal) controller.postMessage({type: 'rapier:startup', release, attempt, state: terminal});
    } catch (_) {}
  };
  if (worker) {
    worker.addEventListener('controllerchange', post);
    worker.addEventListener('message', event => {
      const message = event.data;
      if (event.source !== worker.controller || message?.type !== 'rapier:startup-fallback' ||
          message.release !== release || message.attempt !== attempt || terminal !== 'failed' || reloading) return;
      reloading = true;
      location.reload();
    });
    post();
    // Registration needs neither the platform span nor the editor: even their
    // failure leaves a path for the browser to discover a repaired release.
    const register = () => {
      try { worker.register('./sw.js', {scope: './', updateViaCache: 'none'}).catch(() => {}); }
      catch (_) {}
    };
    if (document.readyState === 'complete') queueMicrotask(register);
    else addEventListener('load', register, {once: true});
  }
  const settle = state => {
    if (terminal) return;
    terminal = state;
    post();
  };
  return Object.freeze({ready() { settle('ready'); }, failed() { settle('failed'); }});
})();
