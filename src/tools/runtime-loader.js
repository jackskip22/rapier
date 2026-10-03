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

(async () => {
  let publishRuntime;
  _rapierRuntimeReady = new Promise(resolve => { publishRuntime = resolve; });
  try {
    // The platform stage first (text codecs, providers, RapierPlatform, storage, preferences,
    // RapierBundleIO, the MathJax loader): what the shell used to carry as plain source and what
    // every later stage and every host handshake reads.
    for (const {name, source} of await _rapierInflateVendor('rapier-platform-runtime')) _rapierExecuteVendorSource(name, source);
    // An Apps host page without its bridge refuses to boot.
    // Shared compilation overlaps the independent interface/editor inflation. There is still
    // no interface to paint here: publishing it before its editor exists would expose dead controls.
    const shared = _rapierInflateVendor('rapier-shared-runtime').then(async spans => {
      for (const span of spans) await _rapierExecuteBootSource(span);
    });
    const [styles, ui, editor, apps] = await Promise.all([
      _rapierInflateVendor('rapier-styles-runtime'), _rapierInflateVendor('rapier-ui-runtime'),
      _rapierInflateVendor('rapier-editor-runtime'),
      globalThis.RAPIER_APPS_HOST === true ? _rapierInflateVendor('rapier-apps-runtime') : [], shared,
    ]);
    if (styles.length !== 1 || ui.length !== 1) throw new Error('Editor interface records are invalid');
    // The shell carries no empty slot per stylesheet: each row of the record becomes a <style> with
    // the row's id, and they all go in right after the boot style, in the record's order.
    const boot = document.getElementById('rapier-boot-style');
    if (boot?.tagName !== 'STYLE') throw new Error('Editor style anchor is missing');
    const sheets = JSON.parse(styles[0].source).map(row => {
      if (typeof row.id !== 'string' || typeof row.css !== 'string') throw new Error('Editor style record is invalid');
      const element = document.createElement('style');
      element.id = row.id;
      element.textContent = row.css;
      return element;
    });
    const slot = document.getElementById('rapier-ui-slot');
    if (!slot) throw new Error('Editor interface slot is missing');
    // This is verified application markup, never document content.
    const template = document.createElement('template');
    template.innerHTML = ui[0].source;
    const mountInterface = () => {
      boot.after(...sheets);
      slot.replaceWith(template.content);
    };
    for (const span of editor) await _rapierExecuteBootSource(span, mountInterface);
    for (const span of apps) await _rapierExecuteBootSource(span);
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
