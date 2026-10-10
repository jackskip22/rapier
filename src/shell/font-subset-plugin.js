// SPDX-License-Identifier: AGPL-3.0-only
// The page writer installs this optimizer when needed. If unavailable, its already embedded faces stay whole.
(function () {
  'use strict';
  const resources = /* RAPIER_FONT_SUBSET_RESOURCES */ null;
  let provider;
  function prepare(files) {
    if (globalThis.RapierFontSubset?.subset) return;
    const script = document.createElement('script');
    if (globalThis.RAPIER_APPS_HOST === true) {
      script.textContent = new TextDecoder('utf-8', {fatal: true}).decode(files.subset);
      try { document.head.appendChild(script); }
      finally { script.remove(); }
      if (!globalThis.RapierFontSubset?.subset) throw new Error('The verified font subsetter could not start.');
      return;
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([files.subset], {type: 'text/javascript'}));
      function finish(error) {
        script.onload = null; script.onerror = null; script.remove(); URL.revokeObjectURL(url);
        if (error) reject(error); else resolve();
      }
      script.async = false; script.src = url;
      script.onload = () => finish(globalThis.RapierFontSubset?.subset ? null : new Error('The verified font subsetter could not start.'));
      script.onerror = () => finish(new Error('The browser blocked the verified font subsetter.'));
      try { document.head.appendChild(script); }
      catch (error) { finish(error); }
    });
  }
  globalThis.RapierFontSubsetPlugin = Object.freeze({
    async subset(bytes, characters) {
      if (!provider) provider = RapierPluginLoader.files({
        key: 'font-subset', noun: 'font subsetter', dash: ' — ',
        version: resources.version, files: resources.files, prepare,
      });
      if (!provider.installed) {
        try {
          if (globalThis.navigator?.onLine === false) {
            await provider.check();
            if (!provider.installed) return bytes;
          } else await provider.install();
        } catch (_) { return bytes; }
      }
      return globalThis.RapierFontSubset.subset(bytes, characters);
    },
  });
})();
