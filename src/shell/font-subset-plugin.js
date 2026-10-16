// SPDX-License-Identifier: AGPL-3.0-only
(function () {
  'use strict';
  const resources = /* RAPIER_FONT_SUBSET_RESOURCES */ null;
  let provider;
  globalThis.RapierFontSubsetPlugin = Object.freeze({
    async subset(bytes, characters) {
      provider ||= RapierPluginLoader.files({key: 'font-subset', noun: 'font subsetter', dash: ' — ',
        version: resources.version, files: resources.files,
        missing: 'The verified font subsetter could not start.', usable: () => !!globalThis.RapierFontSubset?.subset});
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
