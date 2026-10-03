// One verified inflater. One gzip stream per <script> group (CRC-32 and length via DecompressionStream); span markers must tile the group
// exactly before anything runs. SHA-256 lives in dist/BUILD.json.
const _RAPIER_STORED_GROUP_MARKER =
  /\/\* RAPIER_VENDOR_GROUP bytes=(\d+) stored=gzip\+base124(?: prefilter=([a-z0-9]+))? \*\//;
const _RAPIER_STORED_SPAN_MARKER =
  /\/\* RAPIER_VENDOR_SPAN (\S+) offset=(\d+) bytes=(\d+) \*\//;
let _rapierRuntimeReady;

async function _rapierInflateVendor(id) {
  const text = document.getElementById(id)?.textContent;
  if (!text) throw new Error(id);
  const groupMarker = _RAPIER_STORED_GROUP_MARKER.exec(text);
  if (!groupMarker || groupMarker[2] && groupMarker[2] !== 'words2') throw new Error(id);
  const groupFrom = text.indexOf('*/', groupMarker.index) + 3;
  const groupTo = text.indexOf('/* RAPIER_VENDOR_GROUP_END */', groupFrom);
  if (groupFrom < 3 || groupTo < groupFrom) throw new Error(id);
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
  if (combined.byteLength !== Number(groupMarker[1])) throw new Error(id);
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

function _rapierExecuteVendorSource(name, source, mountInterface) {
  const element = document.createElement('script');
  if (mountInterface) element._rapierMountInterface = mountInterface;
  element.textContent = source + '\n//# sourceURL=' + name;
  let thrown = null;
  const caught = event => {
    thrown = event.error || new Error(event.message);
    event.preventDefault();
  };
  addEventListener('error', caught);
  try { document.head.appendChild(element); }
  finally { removeEventListener('error', caught); element.remove(); }
  if (thrown) throw new Error(name, {cause: thrown});
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
    // These are the same span bytes already checked and decoded above. Re-encoding
    // their full source string here would put that copy back on the loader's turn.
    const url = URL.createObjectURL(new Blob([bytes, '\n//# sourceURL=' + name], {type: 'text/javascript'}));
    let thrown = null;
    const caught = event => {
      // A top-level call can throw in a shared function or in the interface mount. Its
      // reported filename belongs to that callee, not necessarily this script's URL.
      thrown = event.error || new Error(event.message);
      event.preventDefault();
    };
    const finish = error => {
      removeEventListener('error', caught);
      element.remove();
      URL.revokeObjectURL(url);
      if (error) reject(new Error(name, {cause: error}));
      else resolve();
    };
    element._rapierMountInterface = mountInterface;
    element.onload = () => finish(thrown);
    element.onerror = () => finish(thrown || new Error('Runtime script could not load'));
    element.src = url;
    addEventListener('error', caught);
    try { document.head.appendChild(element); }
    catch (error) { finish(error); }
  });
}

// Law 52: first paint follows the chosen theme, else the device's; applyTheme takes the class off once the runtime paints.
try {
  let theme = null;
  try { theme = JSON.parse(localStorage.getItem('rapier:preference:theme')); } catch (_) {}
  if (theme === 'light' || (theme !== 'dark' && matchMedia('(prefers-color-scheme: light)').matches)) document.documentElement.classList.add('rapier-boot-light');
} catch (_) {}

// docs/briefs/embed.md item 2: hold early rapier-connect messages (a few) for engine.js _rapierEmbedListen.
if (window.self !== window.top) {
  const held = [];
  const hold = event => {
    if (event.source === window.parent && event.data?.type === 'rapier-connect' && held.length < 4) held.push(event);
  };
  addEventListener('message', hold);
  globalThis.RapierEarlyConnects = Object.freeze({take() { removeEventListener('message', hold); return held.splice(0); }});
}

function _rapierWhenRuntime(id) {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => {
      observer.disconnect();
      removeEventListener('load', finish);
      if (document.getElementById(id)) resolve();
      else reject(new Error(id));
    };
    const observer = new MutationObserver(() => { if (document.getElementById(id)) finish(); });
    observer.observe(document.documentElement, {childList: true, subtree: true});
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
  const blocks = document.getElementById('editor-blocks');
  const welcome = document.getElementById('rapier-welcome-paint');
  if (blocks && welcome && !(carried && carried.textContent) && !pending) {
    const fragment = welcome.content.cloneNode(true);
    // Off-screen welcome blocks skip layout until scrolled. The editor replaces this
    // projection with the live first screen; the words are the same document.
    for (const node of fragment.children) {
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

(async () => {
  let publishRuntime;
  _rapierRuntimeReady = new Promise(resolve => { publishRuntime = resolve; });
  try {
    // The first paint needs the shell, the styles that draw the bar and the welcome, the
    // welcome's words, and nothing else; each of those is awaited in turn. The deferred sheets,
    // the shared group and the editor stay packed until that paint has been offered a frame.
    // Nothing is shown before the shell can say whether a carried file is waiting, and nothing
    // visible is unbound: the first screen's controls are bound by the script that precedes this one.
    for (const {name, source} of await _rapierInflateVendor('rapier-platform-runtime')) _rapierExecuteVendorSource(name, source);
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
    if (detail) detail.textContent = 'The editor could not unpack its libraries. Reload this file. Your document has not been opened or changed.';
    console.error('[rapier] runtime could not load', error);
  }
})();
