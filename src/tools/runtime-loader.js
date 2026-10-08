// One verified inflater. One gzip stream per <script> group (CRC-32 and length via DecompressionStream); span markers must tile the group
// exactly before anything runs. SHA-256 lives in dist/BUILD.json.
const _RAPIER_STORED_GROUP_MARKER =
  /\/\* RAPIER_VENDOR_GROUP bytes=(\d+) stored=gzip\+base124(?: prefilter=([a-z0-9]+))? \*\//;
const _RAPIER_STORED_SPAN_MARKER =
  /\/\* RAPIER_VENDOR_SPAN (\S+) offset=(\d+) bytes=(\d+) \*\//;
let _rapierRuntimeReady;

async function _rapierInflateVendor(id) {
  const text = document.getElementById(id)?.textContent;
  if (!text) throw new Error(id, {cause: new Error('Packed resource is missing')});
  const groupMarker = _RAPIER_STORED_GROUP_MARKER.exec(text);
  if (!groupMarker || groupMarker[2] && groupMarker[2] !== 'words2') throw new Error(id, {cause: new Error('Packed header is invalid')});
  const groupFrom = text.indexOf('*/', groupMarker.index) + 3;
  const groupTo = text.indexOf('/* RAPIER_VENDOR_GROUP_END */', groupFrom);
  if (groupFrom < 3 || groupTo < groupFrom) throw new Error(id, {cause: new Error('Packed resource is incomplete')});
  let combined;
  try {
    const compressed = _rapierBase124.decodeBase124(text.slice(groupFrom, groupTo));
    const stream = new Blob([compressed]).stream()
      .pipeThrough(new DecompressionStream('gzip'));
    combined = new Uint8Array(await new Response(stream).arrayBuffer());
    if (groupMarker[2]) combined = decodeTextPack(combined, Number(groupMarker[1]));
  } catch (error) {
    throw new Error(id, {cause: error});
  }
  if (combined.byteLength !== Number(groupMarker[1])) throw new Error(id, {cause: new Error('Unpacked length does not match')});
  const marked = new RegExp(_RAPIER_STORED_SPAN_MARKER.source, 'g');
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

// The script acknowledges reaching its end in its own execution turn. A load event
// alone does not prove execution completed; global errors also belong to independent callbacks.
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

// External classic scripts let the browser compile without holding the loader's turn. Await
// each script's load: execution stays in this realm and the next stage cannot overtake it.
// The editor's first statement mounts its interface in that same execution turn, never while
// its source is still being fetched/compiled. The synchronous vendor door above stays synchronous.
function _rapierExecuteBootSource({name, source, bytes}, mountInterface) {
  // The Apps iframe's script policy belongs to its host. Keep its existing inline door;
  // the standalone and native policies already explicitly admit blob scripts.
  if (globalThis.RAPIER_APPS_HOST === true) return _rapierExecuteVendorSource(name, source, mountInterface);
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element._rapierExecuted = false;
    // These are the same span bytes already checked and decoded above. Re-encoding
    // their full source string here would put that copy back on the loader's turn.
    const url = URL.createObjectURL(new Blob([bytes, '\n;document.currentScript._rapierExecuted = true;\n//# sourceURL=' + name], {type: 'text/javascript'}));
    let thrown = null;
    const caught = event => {
      // A callee can report another filename. Keep its cause while this script runs;
      // only the completion marker decides whether this script finished. Timers and
      // event listeners can throw independently while an external script is pending.
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

// First paint follows the chosen theme, else the device's; applyTheme takes the class off once the runtime paints.
try {
  let theme = null;
  try { theme = JSON.parse(localStorage.getItem('rapier:preference:theme')); } catch (_) {}
  if (theme === 'light' || (theme !== 'dark' && matchMedia('(prefers-color-scheme: light)').matches)) {
    document.documentElement.classList.add('rapier-boot-light');
    // The first screen takes its colours from the theme's own class on the body, so it is there before the
    // screen is shown; applyTheme keeps it when the runtime paints.
    if (document.body) document.body.classList.add('light');
  }
} catch (_) {}

// Hold early rapier-connect messages (a few) for engine.js _rapierEmbedListen.
if (window.self !== window.top) {
  const held = [];
  const hold = event => {
    if (event.source === window.parent && event.data?.type === 'rapier-connect' && held.length < 4) held.push(event);
  };
  addEventListener('message', hold);
  globalThis.RapierEarlyConnects = Object.freeze({take() { removeEventListener('message', hold); return held.splice(0); }});
}

// The terminal marker follows the entire packed manifest. A sibling can be inserted
// while the parser is still receiving this script, so DOM position cannot prove completion.
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

function _rapierYieldPaint() {
  if (typeof requestAnimationFrame !== 'function' || document.hidden) return new Promise(resolve => setTimeout(resolve, 0));
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// The welcome's words are already rendered. They are shown only when nothing carried is waiting:
// a page door block, or a host that has already said a document is coming.
async function _rapierRevealFirstScreen() {
  const screen = document.getElementById('rapier-first-screen');
  if (!screen || screen.classList.contains('rapier-first-ready')) return;
  const carried = document.getElementById('rapier-document');
  let pending = false;
  try {
    const ready = window.RapierPlatform?.environment?.ready;
    if (typeof ready === 'function') await ready();
    pending = window.RapierPlatform?.files?.hasPendingBoot?.() === true;
  } catch (_) {}
  // The words are laid in their own faces: shown in a fallback and then re-set when the faces arrive, every line
  // after the first moves. The faces are inline, so the wait is the decode, and bounded.
  try {
    if (document.fonts?.load) await Promise.race([
      Promise.all(['400 16px Geist', '700 16px Geist', '400 16px "Geist Mono"'].map(face => document.fonts.load(face))),
      new Promise(resolve => setTimeout(resolve, 1500))]);
  } catch (_) {}
  const blocks = document.getElementById('editor-blocks');
  const welcome = document.getElementById('rapier-welcome-paint');
  if (blocks && welcome && !(carried && carried.textContent) && !pending) {
    const fragment = welcome.content.cloneNode(true);
    // Off-screen welcome blocks skip layout until scrolled. The first screen's own
    // blocks keep the editor's geometry: content-visibility on them would reserve a
    // different box from the live projection that replaces this frame.
    let shown = 0;
    for (const node of fragment.children) {
      if (shown++ < 8) continue;
      node.style.contentVisibility = 'auto';
      node.style.containIntrinsicSize = 'auto 4rem';
    }
    blocks.replaceChildren(fragment);
    blocks.setAttribute('data-rapier-welcome-paint', '');
    const name = document.getElementById('filename-btn');
    if (name) name.textContent = 'welcome';
  }
  screen.classList.add('rapier-first-ready');
  try { performance.mark('rapier-first-ready'); } catch (_) {}
}

// The editor takes the first screen over in stages (its blocks are laid, then the pictures and the wrapped lines), and
// each stage is a frame a person sees. The first screen stays over it, as it was painted, until the editor's own
// blocks stand where it does (or a bound passes), then goes: the words never move. Taps pass through it to the editor.
// It covers the document the editor took over, and only that one: `identity` answers which document and which words the
// editor holds. When the answer is no longer the one it was taken with (an agent's edit, a typed letter, another document
// opened) the editor's own blocks are what the person must see, and the cover goes at once.
globalThis.RapierFirstScreenHold = Object.freeze({
  take(container, identity) {
    try {
      const kept = [...container.children];
      if (!kept.length || !container.parentNode) return;
      const standing = () => { try { return typeof identity === 'function' ? String(identity()) : ''; } catch (_) { return ''; } };
      const covered = standing();
      const box = container.getBoundingClientRect();
      const cover = document.createElement('div');
      cover.id = 'rapier-first-cover';
      cover.setAttribute('aria-hidden', 'true');
      cover.inert = true;
      cover.style.cssText = 'position:fixed;z-index:1;pointer-events:none;overflow:hidden;background:var(--color-bg,#000);left:' + box.left + 'px;top:' + box.top + 'px;width:' + box.width + 'px;height:' + box.height + 'px';
      const shell = container.cloneNode(false);
      shell.removeAttribute('data-rapier-welcome-paint');
      shell.removeAttribute('id');
      shell.setAttribute('aria-hidden', 'true');
      shell.append(...kept);
      cover.append(shell);
      container.after(cover);
      const tops = root => [...root.children].filter(row => row.classList.contains('block-wrapper')).slice(0, 8).map(row => Math.round(row.getBoundingClientRect().top));
      const wanted = tops(shell), since = performance.now();
      let agreed = 0;
      const look = () => {
        const live = tops(container), same = live.length >= wanted.length && wanted.every((top, at) => Math.abs(top - live[at]) <= 1);
        agreed = same ? agreed + 1 : 0;
        if (agreed >= 2 || performance.now() - since > 2500 || !cover.isConnected || standing() !== covered) cover.remove();
        else requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    } catch (_) {}
  }
});

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

// Keep only the pristine shell and inert shipped payloads. Never serialize the live editor,
// fields, review DOM, host credentials or an unrelated open document into an agent's page.
function _rapierKeepPortableTemplate() {
  if (globalThis.RAPIER_APPS_HOST === true) return;
  const loader = document.currentScript, screen = document.getElementById('rapier-first-screen');
  if (!loader || !screen || !loader.previousElementSibling) return;
  const head = document.head.innerHTML;
  const first = screen.outerHTML + '\n' + loader.previousElementSibling.outerHTML + '\n' + loader.outerHTML;
  const payloadTypes = new Set(['application/rapier-runtime', 'application/rapier-jxl-worker', 'text/rapier-vendor']);
  // The stream may still be parsing here. The immutable payloads are read only when the fully
  // booted agent asks for a page; decoded styles and editor nodes are never read back.
  globalThis.RapierPortableTemplate = () => {
    const welcome = document.getElementById('rapier-welcome-paint');
    if (!welcome) throw new Error('proposal_page_unavailable');
    const payloads = Array.from(document.querySelectorAll('script[id]')).filter(row => payloadTypes.has(row.type) && row.id !== 'rapier-apps-runtime' && row.parentNode !== document.head);
    for (const id of ['rapier-platform-runtime', 'rapier-jxl-worker', 'rapier-styles-runtime', 'rapier-style-rest-runtime', 'rapier-ui-runtime', 'rapier-shared-runtime', 'rapier-editor-runtime']) {
      if (!document.getElementById(id)) throw new Error('proposal_page_unavailable');
    }
    return '<!doctype html><html lang="en"><head>' + head + '</head><body>' + first + '\n' + welcome.outerHTML +
      '\n<template id="rapier-ui-slot"></template>\n' + payloads.map(row => row.outerHTML).join('\n') + '</body></html>';
  };
}

(async () => {
  _rapierKeepPortableTemplate();
  let publishRuntime;
  _rapierRuntimeReady = new Promise(resolve => { publishRuntime = resolve; });
  try {
    // The first paint needs the shell, the styles that draw the bar and the welcome, the
    // welcome's words, and nothing else; each of those is awaited in turn. The deferred sheets,
    // the shared group and the editor stay packed until that paint has been offered a frame.
    // Nothing is shown before the shell can say whether a carried file is waiting, and nothing
    // visible is unbound: the first screen's controls are bound by the script that precedes this one.
    for (const {name, source} of await _rapierInflateVendor('rapier-platform-runtime')) _rapierExecuteVendorSource(name, source);
    // A failed editor must still discover a repaired application release.
    if (_rapierPwaFrameAdmission(window.self === window.top) &&
        window.RapierPlatform?.environment.allowsServiceWorker === true && 'serviceWorker' in navigator &&
        (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      const registerWorker = () => {
        try { navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'}).catch(() => {}); }
        catch (_) {}
      };
      if (document.readyState === 'complete') queueMicrotask(registerWorker);
      else addEventListener('load', registerWorker, {once: true});
    }
    await _rapierWhenRuntime('rapier-styles-runtime');
    const styles = await _rapierInflateVendor('rapier-styles-runtime');
    if (styles.length !== 1) throw new Error('Editor interface records are invalid');
    const sheets = _rapierStyleElements(styles[0].source);
    if (!sheets.length) throw new Error('Editor interface records are invalid');
    await _rapierWhenRuntime('rapier-welcome-paint');
    await _rapierRevealFirstScreen();
    await _rapierYieldPaint();
    // The words are up. The rest inflates together (the inflater is off the main thread) and is
    // applied in this order: the deferred sheets, the shared group, the interface, the editor.
    const restPending = _rapierWhenRuntime('rapier-style-rest-runtime').then(() => _rapierInflateVendor('rapier-style-rest-runtime'));
    const sharedPending = _rapierWhenRuntime('rapier-shared-runtime').then(() => _rapierInflateVendor('rapier-shared-runtime'));
    const uiPending = _rapierWhenRuntime('rapier-ui-runtime').then(() => _rapierInflateVendor('rapier-ui-runtime'));
    const editorPending = _rapierWhenRuntime('rapier-editor-runtime').then(() => _rapierInflateVendor('rapier-editor-runtime'));
    const rest = await restPending;
    if (rest.length !== 1) throw new Error('Editor interface records are invalid');
    sheets.push(..._rapierStyleElements(rest[0].source, sheets.at(-1)));
    for (const span of await sharedPending) await _rapierExecuteBootSource(span);
    /* RAPIER_BUILTIN_PLUGINS_READY */
    const ui = await uiPending;
    const editor = await editorPending;
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
    for (const span of editor) await _rapierExecuteBootSource(span, mountInterface);
    if (globalThis.RAPIER_APPS_HOST === true) {
      await _rapierWhenRuntime('rapier-apps-runtime');
      for (const span of await _rapierInflateVendor('rapier-apps-runtime')) await _rapierExecuteBootSource(span);
    }
    // The shared globals are in: a host that waited to hand a document over may send it now (shell/platform.js
    // tells the app the page is ready on this event; before it, the seam the bytes cross is not yet in the page).
    window.dispatchEvent(new Event('rapier:runtime-loaded'));
    publishRuntime(true);
  } catch (error) {
    publishRuntime(false);
    if (typeof _rapierBootstrapRuntime !== 'undefined') _rapierBootstrapRuntime.failed = true;
    try { window.RapierPlatform?.files?.clearIntake?.(); } catch (_) {}
    document.body.classList.add('rapier-boot-failed');
    const detail = document.getElementById('rapier-boot-failure-detail');
    const reasons = [];
    for (let cause = error, depth = 0; cause && depth < 3; cause = cause.cause, depth++) {
      const message = String(cause.message || cause);
      if (!reasons.includes(message)) reasons.push(message);
    }
    if (detail) detail.textContent = 'The editor could not finish starting. Reload this file. Your document has not been opened or changed. Startup resource: ' + (reasons.join(': ') || 'unknown').slice(0, 240) + '.';
    console.error('[rapier] runtime could not load', error);
  }
})();
