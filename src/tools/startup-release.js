globalThis.RapierStartupRelease = (() => {
  const release = '__RAPIER_BOOT_ID__';
  const enabled = __RAPIER_PWA_ENABLED__;
  let worker = null, attempt = '', terminal = '', reloading = false;
  try {
    if (enabled && globalThis.RapierBenchRoute !== true && globalThis.RapierBenchSession?.active !== true &&
        window.self === window.top && !window.RapierHost &&
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
  let newer = false, asking = false;
  const quiet = () => {
    try { if (typeof _rapierLive !== 'undefined' && _rapierLive.active()) return false; } catch (_) { return false; }
    try {
      const sound = globalThis.rapierRecordingFacts;
      if (sound && (sound.phase !== 'closed' || sound.players.some(player => player.playing) || sound.review?.playing || sound.card?.playing)) return false;
    } catch (_) { return false; }
    return true;
  };
  const reopen = async () => {
    if (!newer || asking || reloading || terminal !== 'ready' || document.visibilityState !== 'hidden' || !quiet()) return;
    asking = true;
    try {
      const ask = globalThis.RapierCheckpoint;
      const kept = typeof ask === 'function' && await ask(0) === true;
      if (!kept || document.visibilityState !== 'hidden' || !quiet() || reloading) return;
      reloading = true;
      location.reload();
    } catch (_) {} finally { asking = false; }
  };
  if (worker) {
    const controlled = !!worker.controller;
    worker.addEventListener('controllerchange', () => {
      post();
      if (controlled) { newer = true; void reopen(); }
    });
    document.addEventListener('visibilitychange', () => { void reopen(); });
    worker.addEventListener('message', event => {
      const message = event.data;
      if (event.source !== worker.controller || message?.type !== 'rapier:startup-fallback' ||
          message.release !== release || message.attempt !== attempt || terminal !== 'failed' || reloading) return;
      reloading = true;
      location.reload();
    });
    post();
    let registration = null, checking = null;
    const register = () => {
      if (checking) return;
      checking = Promise.resolve().then(() => registration ? registration.update() :
        worker.register('./sw.js', {scope: './', updateViaCache: 'none'}))
        .then(value => { registration = value; }).catch(() => {}).finally(() => { checking = null; });
    };
    if (document.readyState === 'complete') queueMicrotask(register);
    else addEventListener('load', register, {once: true});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') register();
    });
    addEventListener('online', register);
  }
  const settle = state => {
    if (terminal) return;
    terminal = state;
    post();
    void reopen();
  };
  return Object.freeze({ready() { settle('ready'); }, failed() { settle('failed'); }});
})();
