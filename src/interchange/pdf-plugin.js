// SPDX-License-Identifier: AGPL-3.0-only
// Download is explicit. Opening a PDF can only execute previously verified bytes.
globalThis.RapierPdfPlugin = (() => {
  'use strict';
  const spec = globalThis.RapierPdf;
  const version = spec.PDF_JS_VERSION;
  const manifest = spec.PDF_JS_RESOURCE_MANIFEST;
  const root = spec.PDF_JS_RESOURCE_ROOT;
  const downloadBytes = spec.PDF_JS_DOWNLOAD_BYTES;
  const cache = RapierBundleIO.store('rapier:optional:pdfjs', 'bundle');
  const key = 'pdfjs-' + version;
  const base = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + version + '/';
  const decoder = new TextDecoder('utf-8', {fatal: true});
  const sessions = new Set();
  let files = null, api = null, persistent = false, bundled = false, lastError = '';
  let checking = null, installing = null, loading = null, removing = null;
  const abortError = () => new DOMException('PDF reader download cancelled.', 'AbortError');
  const state = () => ({version, downloadBytes, installed: !!files, loaded: !!api,
    persistent, deletable: !bundled, downloading: !!installing, error: lastError});

  // A set is admitted whole: every SHA-384 recomputed from bytes in hand, the root over path, length and digest in manifest order must match. Nothing stored or run before.
  async function admitted(files) {
    const entries = [];
    for (const [path, length] of manifest) {
      const bytes = RapierBundleIO.bytes(files[path]);
      if (!bytes || bytes.byteLength !== length) throw new Error('PDF reader resource ' + path + ' has an unexpected size.');
      entries.push([path, length, await RapierBundleIO.digestSha384(bytes)]);
    }
    if (await RapierBundleIO.digestSha384(new TextEncoder().encode(spec.pdfResourceRootText(entries))) !== root)
      throw new Error('PDF reader resources do not match their pinned set.');
  }

  async function verified(record) {
    if (!record || record.version !== version || !record.files) return null;
    await admitted(record.files);
    return new Map(manifest.map(([path]) => [path, RapierBundleIO.bytes(record.files[path])]));
  }

  async function checkInstalled() {
    if (removing) await removing.catch(() => {});
    if (files) return true;
    if (checking) return checking;
    checking = (async () => {
      try {
        const resources = globalThis.RapierPlatform?.resources;
        const status = typeof resources?.status === 'function' && typeof resources?.read === 'function'
          ? await resources.status('rapier-pdf').catch(() => null) : null;
        if (status?.status === 'ready') {
          const held = Object.create(null);
          for (const [path] of manifest) {
            const value = await resources.read('rapier-pdf-' + path.replaceAll('/', '-'));
            held[path] = await RapierBundleIO.resourceBytes(value, 'PDF reader resource');
          }
          // Native bytes take exactly the same whole-set admission as downloaded bytes.
          files = await verified({version, files: held});
          bundled = true; persistent = true;
          return true;
        }
        files = await verified(await cache.get(key));
        persistent = !!files;
        return !!files;
      } catch (error) {
        lastError = String(error.message || error);
        return false;
      }
    })();
    try { return await checking; } finally { checking = null; }
  }

  async function fetchPinned(row, signal) {
    const [path, length] = row;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) controller.abort();
    const timer = setTimeout(abort, 25000);
    let reader;
    try {
      // A host that keeps the plug-in files itself names their directory (`plugins`); the set sits there under pdfjs-dist-<version>/.
      const response = await fetch(RapierBundleIO.pluginUrl('pdfjs-dist-' + version + '/' + path) || base + path, {mode: 'cors', credentials: 'omit',
        referrerPolicy: 'no-referrer', cache: 'default', signal: controller.signal});
      if (!response.ok) throw new Error('PDF reader download returned HTTP ' + response.status + '.');
      const declared = Number(response.headers.get('Content-Length'));
      if (Number.isFinite(declared) && declared > length) throw new Error('PDF reader resource has an unexpected size.');
      let bytes;
      if (response.body?.getReader) {
        reader = response.body.getReader();
        bytes = new Uint8Array(length);
        let offset = 0;
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          if (value.length > length - offset) throw new Error('PDF reader resource exceeds its pinned size.');
          bytes.set(value, offset); offset += value.length;
        }
        if (offset !== length) throw new Error('PDF reader resource is incomplete.');
      } else bytes = new Uint8Array(await response.arrayBuffer());
      if (signal.aborted) throw abortError();
      if (bytes.byteLength !== length) throw new Error('PDF reader resource has an unexpected size.');
      return bytes;
    } finally {
      clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (reader) { try { await reader.cancel(); } catch (_) {} }
      controller.abort();
    }
  }

  function install({signal, onProgress = () => {}} = {}) {
    if (removing) return removing.then(() => install({signal, onProgress}));
    if (installing) return installing;
    installing = (async () => {
      if (signal?.aborted) throw abortError();
      if (await checkInstalled()) return {...state(), downloading: false};
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, {once: true});
      if (signal?.aborted) controller.abort();
      const timer = setTimeout(abort, 180000);
      const downloaded = Object.create(null);
      let next = 0, completedBytes = 0, failure = null;
      try {
        // A complete cache includes CJK maps, standard fonts and non-WASM decoders.
        await Promise.all(Array.from({length: 4}, async () => {
          while (next < manifest.length && !controller.signal.aborted) {
            const row = manifest[next++];
            try {
              downloaded[row[0]] = await fetchPinned(row, controller.signal);
              completedBytes += row[1];
              onProgress(completedBytes / downloadBytes);
            } catch (error) { failure ||= error; controller.abort(); }
          }
        }));
        if (failure) throw failure;
        if (controller.signal.aborted) throw abortError();
        await admitted(downloaded);
        const record = {version, files: downloaded};
        try { persistent = !!await cache.put(key, record); }
        catch (_) { persistent = false; }
        files = new Map(Object.entries(downloaded));
        lastError = '';
        return {...state(), downloading: false};
      } catch (error) {
        lastError = String(error.message || error);
        throw error;
      } finally {
        clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort();
      }
    })();
    installing.finally(() => { installing = null; }).catch(() => {});
    return installing;
  }

  async function ensureLoaded() {
    if (removing) await removing;
    if (api) return api;
    if (loading) return loading;
    loading = (async () => {
      if (!await checkInstalled()) throw new Error('Download the PDF import plugin before opening a PDF.');
      const url = URL.createObjectURL(new Blob([files.get('legacy/build/pdf.mjs')], {type: 'text/javascript'}));
      try {
        const loaded = await import(/* webpackIgnore: true */ url);
        if (loaded.version !== version || typeof loaded.getDocument !== 'function')
          throw new Error('The cached PDF reader has an unexpected version.');
        api = loaded;
        return api;
      } catch (error) {
        lastError = String(error.message || error);
        throw new Error('This app host could not load the PDF reader: ' + lastError);
      } finally { URL.revokeObjectURL(url); }
    })();
    try { return await loading; } finally { loading = null; }
  }

  async function createSession() {
    const loaded = await ensureLoaded();
    if (removing) throw new Error('The PDF import plugin is being removed.');
    if (sessions.size) throw new Error('Another PDF is still being read.');
    const urls = [];
    const moduleUrl = bytes => {
      const url = URL.createObjectURL(new Blob([bytes], {type: 'text/javascript'}));
      urls.push(url); return url;
    };
    let nativeWorker = null, worker = null, closed = false;
    let rejectWorker;
    const failure = new Promise((_, reject) => { rejectWorker = reject; });
    failure.catch(() => {});
    const session = {api: loaded, worker: null, failure, options: null, close() {
      if (closed) return;
      closed = true; sessions.delete(session);
      try { worker?.destroy(); } catch (_) {}
      nativeWorker?.terminate();
      for (const url of urls) URL.revokeObjectURL(url);
    }};
    try {
      const fallback = Object.create(null);
      for (const name of ['jbig2_nowasm_fallback.js', 'openjpeg_nowasm_fallback.js'])
        fallback[name] = moduleUrl(files.get('wasm/' + name));
      let source = decoder.decode(files.get('legacy/build/pdf.worker.mjs'));
      const original = '`${WasmImage.#wasmUrl}${this._noWasmFilename}`';
      if (source.indexOf(original) < 0 || source.indexOf(original) !== source.lastIndexOf(original))
        throw new Error('The pinned PDF decoder resource hook has changed.');
      source = source.replace(original, '_rapierPdfModuleUrl(this._noWasmFilename)');
      // PDF.js sends binary requests through its public factory. Its two decoder
      // fallback imports use the verified local URLs below; no PDF supplies a URL.
      const prelude = 'const _rapierPdfFallbacks=Object.freeze(' + JSON.stringify(fallback) + ');\n' +
        'function _rapierPdfModuleUrl(name){if(!Object.hasOwn(_rapierPdfFallbacks,name))throw new Error("Unknown PDF decoder");return _rapierPdfFallbacks[name];}\n' +
        'globalThis.fetch=()=>Promise.reject(new Error("PDF import cannot access the network"));\n' +
        'globalThis.XMLHttpRequest=class{constructor(){throw new Error("PDF import cannot access the network")}};\n';
      nativeWorker = new Worker(moduleUrl(prelude + source), {type: 'module', name: 'rapier-pdf-import'});
      nativeWorker.addEventListener('error', event => {
        event.preventDefault();
        rejectWorker(new Error('This app host could not run the PDF reader worker.'));
      });
      nativeWorker.addEventListener('messageerror', () => rejectWorker(new Error('The PDF reader worker returned invalid data.')));
      worker = new loaded.PDFWorker({port: nativeWorker, verbosity: 0});
      class CachedBinaryDataFactory {
        async fetch({kind, filename}) {
          if (closed) throw new DOMException('PDF import cancelled.', 'AbortError');
          const prefix = {cMapUrl: 'cmaps/', standardFontDataUrl: 'standard_fonts/', wasmUrl: 'wasm/'}[kind];
          if (!prefix || !/^[A-Za-z0-9_.+-]+$/.test(filename)) throw new Error('Unknown PDF reader resource.');
          const bytes = files.get(prefix + filename);
          if (!bytes) throw new Error('A required PDF reader resource is missing.');
          return bytes.slice();
        }
      }
      session.worker = worker;
      session.options = {BinaryDataFactory: CachedBinaryDataFactory, useWorkerFetch: false,
        cMapUrl: 'rapier-pdf-cache:/cmaps/', cMapPacked: true,
        standardFontDataUrl: 'rapier-pdf-cache:/standard_fonts/', wasmUrl: 'rapier-pdf-cache:/wasm/'};
      sessions.add(session);
      return session;
    } catch (error) { session.close(); throw error; }
  }

  function forget() {
    if (bundled) return Promise.reject(new Error('The PDF reader is included in this app.'));
    if (removing) return removing;
    if (sessions.size || installing || loading || checking)
      return Promise.reject(new Error('Finish PDF import before removing its plugin.'));
    removing = (async () => {
      try { await cache.remove(key); }
      catch (error) { if (persistent) throw error; }
      files = null; api = null; persistent = false; lastError = '';
      return state();
    })();
    removing.finally(() => { removing = null; }).catch(() => {});
    return removing;
  }
  return Object.freeze({version, downloadBytes, state, checkInstalled, install, ensureLoaded, createSession, forget});
})();
