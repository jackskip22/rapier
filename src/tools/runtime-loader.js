const _RAPIER_STORED_SPAN_MARKER =
  /\/\* RAPIER_VENDOR_SPAN (\S+) offset=(\d+) bytes=(\d+) \*\//;
let _rapierRuntimeReady, _rapierCodecsReady;

function _rapierLoadCodecs() {
  return _rapierCodecsReady ||= (async () => {
    await _rapierWhenRuntime('rapier-codec-runtime');
    const spans = await _rapierInflateVendor('rapier-codec-runtime');
    if (spans.length !== 1 || spans[0].name !== 'rapier-codecs.js') throw new Error('Packed codec is invalid');
    _rapierExecuteVendorSource(spans[0].name, spans[0].source);
    const codecs = globalThis.RapierCodecs;
    if (typeof codecs?.decodeBrotli !== 'function' || typeof codecs?.crc32 !== 'function') throw new Error('Packed codec did not initialize');
    return codecs;
  })();
}

async function _rapierInflateVendor(id, text = document.getElementById(id)?.textContent) {
  if (!text) throw new Error(id, {cause: new Error('Packed resource is missing')});
  let combined, record;
  try {
    record = packedHeader(text);
    if (id === 'rapier-codec-runtime' && record.compression === 'brotli') throw new Error('Packed codec must not use Brotli');
    const codecs = record.compression === 'brotli' ? await _rapierLoadCodecs() : null;
    if (record.compression === 'plain') combined = new TextEncoder().encode(packedPlainText(text.slice(record.from, record.to)));
    else {
      const compressed = _rapierBase124.decodeBase124(text.slice(record.from, record.to), {maxBytes: 64 * 1024 * 1024});
      let transform;
      try { transform = new DecompressionStream(record.compression); }
      catch (error) { if (!codecs) throw error; }
      const limit = record.inflated ?? record.limit;
      if (!transform) combined = codecs.decodeBrotli(compressed, limit);
      else {
        const reader = new Blob([compressed]).stream().pipeThrough(transform).getReader(), parts = [];
        let used = 0;
        try {
          for (;;) {
            const {done, value} = await reader.read(); if (done) break;
            used += value.length;
            if (used > limit) throw new Error('Packed resource exceeds its declared size');
            parts.push(value);
          }
        } catch (error) { await reader.cancel().catch(() => {}); throw error; }
        combined = new Uint8Array(used);
        let at = 0; for (const part of parts) { combined.set(part, at); at += part.length; }
      }
    }
    if (record.inflated !== null && combined.length !== record.inflated) throw new Error('Packed intermediate length differs');
    if (record.prefilter) combined = decodeTextPack(combined, record.bytes);
    if (combined.length !== record.bytes) throw new Error('Unpacked length does not match');
    if (codecs && codecs.crc32(combined) !== record.crc32) throw new Error('Packed content differs');
  } catch (error) { throw new Error(id, {cause: error}); }
  const marked = new RegExp(_RAPIER_STORED_SPAN_MARKER.source, 'g');
  marked.lastIndex = record.to;
  const sources = [];
  let covered = 0;
  for (let marker; (marker = marked.exec(text));) {
    const [, name, offset, bytes] = marker;
    if (Number(offset) !== covered) throw new Error(name);
    const slice = combined.subarray(covered, covered + Number(bytes));
    if (slice.byteLength !== Number(bytes)) throw new Error(name);
    covered += slice.byteLength;
    let source;
    try { source = new TextDecoder('utf-8', {fatal: true}).decode(slice); }
    catch (error) { throw new Error(name, {cause: error}); }
    sources.push({name, source, bytes: slice});
  }
  if (!sources.length || covered !== combined.byteLength) throw new Error(id);
  return sources;
}

function _rapierExecuteVendorSource(name, source, mountInterface) {
  const element = document.createElement('script');
  element._rapierExecuted = false;
  if (mountInterface) element._rapierMountInterface = mountInterface;
  element.textContent = source + '\n;document.currentScript._rapierExecuted = true;\n//# sourceURL=' + name;
  let thrown = null;
  const caught = event => {
    if (document.currentScript === element || event.filename === name)
      thrown = event.error || new Error(event.message);
  };
  addEventListener('error', caught);
  try { document.head.appendChild(element); }
  finally { removeEventListener('error', caught); element.remove(); }
  if (element._rapierExecuted !== true) throw new Error(name, {cause: thrown || new Error('Runtime script did not finish')});
}

function _rapierExecuteBootSource({name, source, bytes}, mountInterface) {
  if (globalThis.RAPIER_APPS_HOST === true) return _rapierExecuteVendorSource(name, source, mountInterface);
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element._rapierExecuted = false;
    const url = URL.createObjectURL(new Blob([bytes, '\n;document.currentScript._rapierExecuted = true;\n//# sourceURL=' + name], {type: 'text/javascript'}));
    let thrown = null;
    const caught = event => {
      if (document.currentScript === element || event.filename === name || event.filename === url)
        thrown = event.error || new Error(event.message);
    };
    const finish = error => {
      removeEventListener('error', caught);
      element.remove();
      URL.revokeObjectURL(url);
      if (error) reject(new Error(name, {cause: error}));
      else resolve();
    };
    element._rapierMountInterface = mountInterface;
    element.onload = () => finish(element._rapierExecuted === true ? null : thrown || new Error('Runtime script did not finish'));
    element.onerror = () => finish(thrown || new Error('Runtime script could not load'));
    element.src = url;
    addEventListener('error', caught);
    try { document.head.appendChild(element); }
    catch (error) { finish(error); }
  });
}

try {
  let theme = null;
  try { if (globalThis.RapierBenchRoute !== true && globalThis.RapierBenchSession?.active !== true) theme = JSON.parse(localStorage.getItem('rapier:preference:theme')); } catch (_) {}
  if (theme === 'light' || (theme !== 'dark' && matchMedia('(prefers-color-scheme: light)').matches)) {
    document.documentElement.classList.add('rapier-boot-light');
    if (document.body) document.body.classList.add('light');
  }
} catch (_) {}

if (window.self !== window.top) {
  const held = [];
  const hold = event => {
    if (event.source === window.parent && event.data?.type === 'rapier-connect' && held.length < 4) held.push(event);
  };
  addEventListener('message', hold);
  globalThis.RapierEarlyConnects = Object.freeze({take() { removeEventListener('message', hold); return held.splice(0); }});
}

function _rapierRuntimeComplete(id) {
  const element = document.getElementById(id);
  if (!element) return false;
  if (element.tagName === 'SCRIPT') return element.textContent.endsWith('/* RAPIER_VENDOR_SPANS_END */\n');
  return element.nextSibling !== null || document.readyState !== 'loading';
}
function _rapierWhenRuntime(id) {
  if (_rapierRuntimeComplete(id)) return Promise.resolve();
  if (document.readyState !== 'loading') return Promise.reject(new Error(id, {cause: new Error('Packed resource is incomplete')}));
  return new Promise((resolve, reject) => {
    const finish = () => {
      observer.disconnect();
      document.removeEventListener('DOMContentLoaded', finish);
      removeEventListener('load', finish);
      if (_rapierRuntimeComplete(id)) resolve();
      else reject(new Error(id, {cause: new Error('Packed resource is incomplete')}));
    };
    const observer = new MutationObserver(() => { if (_rapierRuntimeComplete(id)) finish(); });
    observer.observe(document.documentElement, {childList: true, characterData: true, subtree: true});
    document.addEventListener('DOMContentLoaded', finish);
    addEventListener('load', finish);
  });
}

function _rapierRevealFirstScreen() {
  document.body.classList.add('rapier-first-ready');
  try { performance.mark('rapier-first-ready'); } catch (_) {}
}

function _rapierStyleElements(source, anchor) {
  const boot = document.getElementById('rapier-boot-style');
  if (boot?.tagName !== 'STYLE') throw new Error('Editor style anchor is missing');
  const sheets = JSON.parse(source).map(row => {
    if (typeof row.id !== 'string' || typeof row.css !== 'string') throw new Error('Editor style record is invalid');
    const element = document.createElement('style');
    element.id = row.id;
    element.textContent = row.css;
    return element;
  });
  if (!sheets.length) return [];
  if (!document.getElementById(sheets[0].id)) (anchor || boot).after(...sheets);
  return sheets;
}

async function _rapierLoadPaintStyles(mountScreen = true) {
  await _rapierLoadCodecs();
  await _rapierWhenRuntime('rapier-styles-runtime');
  const styles = await _rapierInflateVendor('rapier-styles-runtime');
  if (styles.length !== 4 || styles[0].name !== 'rapier-factory-fonts.js' || styles[1].name !== 'rapier-styles.json' ||
      styles[2].name !== 'rapier-first-screen.html' || styles[3].name !== 'rapier-first-paint.json')
    throw new Error('Editor interface records are invalid');
  _rapierExecuteVendorSource(styles[0].name, styles[0].source);
  const sheets = _rapierStyleElements(styles[1].source);
  if (!sheets.length) throw new Error('Editor interface records are invalid');
  if (mountScreen) {
    const screen = document.getElementById('rapier-first-screen');
    if (!screen) throw new Error('Editor first screen is missing');
    screen.innerHTML = styles[2].source;
  }
  const fonts = Promise.allSettled(globalThis.RapierDocxFonts.DOCX_FONTS.map(async font => {
    const face = new FontFace(font.family, font.read(), {weight: String(font.weight), display: 'swap'});
    document.fonts.add(face);
    return face.load();
  }));
  return {sheets, fonts, firstPaint: styles[3].source};
}

const _rapierFirstPaintEligible = (() => {
  try {
    if (globalThis.RapierBenchRoute === true || globalThis.RAPIER_APPS_HOST === true || window.RapierHost || window.self !== window.top) return false;
    if (!/^https?:$/.test(location.protocol) || !/^(?:(?:www\.)?rapier\.website|127\.0\.0\.1|localhost)$/.test(location.hostname)) return false;
    if (location.search || location.hash || navigator.serviceWorker?.controller) return false;
    return localStorage.length === 0 && sessionStorage.length === 0;
  } catch (_) { return false; }
})();

async function _rapierShowFirstPaint(record, fonts) {
  if (!_rapierFirstPaintEligible) return;
  const pictures = JSON.parse(record);
  const path = location.pathname === '/rapier.html' ? '/' : location.pathname.replace(/(.)\/+$/, '$1');
  const coarse = matchMedia('(pointer: coarse)').matches, width = innerWidth;
  const view = pictures.paths?.[path]?.find(row => row.coarse === coarse && row.widths.includes(width));
  if (!view) return;
  await Promise.race([fonts, new Promise(resolve => setTimeout(resolve, 1500))]);
  const finished = () => document.body.matches('.rapier-first-ready, .rapier-boot-failed');
  if (finished() || innerWidth !== width) return;
  const light = document.documentElement.classList.contains('rapier-boot-light');
  const theme = view[light ? 'light' : 'dark'];
  const swap = selector => selector.replace(/(^|[\s>+~,(])(html|body|:root)(?=$|[\s>+~,.#:[)])/g,
    (_, before, name) => before + (name === ':root' ? '.rapier-paint-root' : 'div:where(.rapier-paint-' + (name === 'body' ? 'body' : 'root') + ')'));
  const sheet = new CSSStyleSheet();
  sheet.replaceSync([...[...document.querySelectorAll('style')].map(style => style.textContent), ...pictures.css || []].join('\n'));
  const walk = rules => {
    for (const rule of rules) {
      if (rule.selectorText !== undefined) rule.selectorText = swap(rule.selectorText);
      if (rule.cssRules) walk(rule.cssRules);
    }
  };
  walk(sheet.cssRules);
  const agent = new CSSStyleSheet();
  agent.replaceSync(':where(.rapier-paint-root){display:block;position:absolute;inset:0;overflow:hidden}:where(.rapier-paint-body){display:block;margin:8px}');
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:150;opacity:1;pointer-events:none;overflow:hidden;contain:strict';
  const shadow = host.attachShadow({mode: 'closed'});
  shadow.adoptedStyleSheets = [agent, sheet];
  const root = document.createElement('div'), body = document.createElement('div');
  for (const [name, value] of theme.root) root.setAttribute(name, value);
  root.className = 'rapier-paint-root ' + root.className;
  body.className = 'rapier-paint-body ' + theme.body;
  const version = document.querySelector('meta[name="rapier-version"]')?.content || '';
  body.innerHTML = pictures.version ? view.html.split(pictures.version).join(version) : view.html;
  root.append(body);
  shadow.append(root);
  if (finished() || innerWidth !== width) return;
  const leave = () => { watch.disconnect(); removeEventListener('resize', leave); host.remove(); };
  const watch = new MutationObserver(() => { if (finished()) leave(); });
  watch.observe(document.body, {attributes: true, attributeFilter: ['class']});
  addEventListener('resize', leave);
  document.body.append(host);
  try { performance.mark('rapier-first-paint'); } catch (_) {}
}

function _rapierBootFailureShow() {
  const later = document.getElementById('rapier-boot-failure-later');
  if (later) later.replaceWith(later.content);
}

function _rapierKeepPortableTemplate() {
  if (globalThis.RAPIER_APPS_HOST === true || globalThis.RapierBenchRoute === true || globalThis.RapierBenchSession?.active === true) return;
  const loader = document.currentScript, screen = document.getElementById('rapier-first-screen');
  if (!loader || !screen) return;
  const head = document.head.innerHTML;
  const failure = document.querySelector('body > .rapier-boot-failure') || document.querySelector('body > #rapier-boot-failure-later');
  const first = (failure ? failure.outerHTML + '\n' : '') + screen.outerHTML + '\n' + loader.outerHTML;
  globalThis.RapierPortableShell = Object.freeze({head, first});
}

(async () => {
  _rapierKeepPortableTemplate();
  let publishRuntime;
  _rapierRuntimeReady = new Promise(resolve => { publishRuntime = resolve; });
  try {
    if (globalThis.RapierBenchRoute === true || globalThis.RapierBenchSession?.active === true) {
      try { await _rapierWhenRuntime('rapier-phone-bench-runtime'); }
      catch (_) { throw new Error('The benchmark requires the full Rapier build.'); }
      for (const {name, source} of await _rapierInflateVendor('rapier-phone-bench-runtime')) _rapierExecuteVendorSource(name, source);
    }
    if (globalThis.RapierBenchRoute === true && globalThis.RapierBenchSession?.active !== true) {
      await _rapierStartPhoneBench();
      publishRuntime(true);
      return;
    }
    if (globalThis.RapierBenchSession?.active === true) await globalThis.RapierBenchSession.startEditor?.();
    for (const {name, source} of await _rapierInflateVendor('rapier-platform-runtime')) _rapierExecuteVendorSource(name, source);
    const {sheets, fonts, firstPaint} = await _rapierLoadPaintStyles();
    const restPending = _rapierWhenRuntime('rapier-style-rest-runtime').then(() => _rapierInflateVendor('rapier-style-rest-runtime'));
    const uiPending = _rapierWhenRuntime('rapier-ui-runtime').then(() => _rapierInflateVendor('rapier-ui-runtime'));
    const editorPending = _rapierWhenRuntime('rapier-editor-runtime').then(() => _rapierInflateVendor('rapier-editor-runtime'));
    const rest = await restPending;
    if (rest.length !== 1) throw new Error('Editor interface records are invalid');
    sheets.push(..._rapierStyleElements(rest[0].source, sheets.at(-1)));
    _rapierShowFirstPaint(firstPaint, fonts).catch(error => console.warn('[rapier] first picture skipped', error));
    const editor = await editorPending;
    if (editor.length !== 2 || editor[0].name !== 'rapier-shared.js' || editor[1].name !== 'rapier-editor.js')
      throw new Error('Editor runtime records are invalid');
    await _rapierExecuteBootSource(editor[0]);
    /* RAPIER_BUILTIN_PLUGINS_READY */
    const ui = await uiPending;
    if (ui.length !== 1) throw new Error('Editor interface records are invalid');
    const template = document.createElement('template');
    template.innerHTML = ui[0].source;
    const mountInterface = () => {
      if (!document.getElementById(sheets[0].id)) {
        const boot = document.getElementById('rapier-boot-style');
        if (boot) boot.after(...sheets);
      }
      const deferred = template.content;
      const screen = document.getElementById('rapier-first-screen');
      const slot = document.getElementById('rapier-ui-slot');
      if (slot) slot.replaceWith(deferred);
      else if (screen) screen.after(deferred);
      else throw new Error('Editor interface slot is missing');
    };
    await Promise.race([fonts, new Promise(resolve => setTimeout(resolve, 1500))]);
    await _rapierExecuteBootSource(editor[1], mountInterface);
    if (globalThis.RAPIER_APPS_HOST === true) {
      await _rapierWhenRuntime('rapier-apps-runtime');
      for (const span of await _rapierInflateVendor('rapier-apps-runtime')) await _rapierExecuteBootSource(span);
    }
    window.dispatchEvent(new Event('rapier:runtime-loaded'));
    publishRuntime(true);
  } catch (error) {
    publishRuntime(false);
    try { if (typeof _rapierBootstrapRuntime !== 'undefined') _rapierBootstrapRuntime.failed = true; } catch (_) {}
    try { window.RapierPlatform?.files?.clearIntake?.(); } catch (_) {}
    _rapierBootFailureShow();
    document.body.classList.add('rapier-boot-failed');
    const detail = document.getElementById('rapier-boot-failure-detail');
    const reasons = [];
    for (let cause = error, depth = 0; cause && depth < 3; cause = cause.cause, depth++) {
      const message = String(cause.message || cause);
      if (!reasons.includes(message)) reasons.push(message);
    }
    if (detail) detail.textContent = 'The editor could not finish starting. Reload this file. Your document has not been opened or changed. Startup resource: ' + (reasons.join(': ') || 'unknown').slice(0, 240) + '.';
    void _rapierRescueStartup();
    globalThis.RapierStartupRelease?.failed();
    console.error('[rapier] runtime could not load', error);
  }
})();

async function _rapierStartPhoneBench() {
  const {fonts} = await _rapierLoadPaintStyles(false);
  await fonts;
  await globalThis.RapierPhoneBenchController.startPage();
}
