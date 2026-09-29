// One verified inflater. One gzip stream per <script> group (CRC-32 and length via DecompressionStream); span markers must tile the group
// exactly before anything runs. SHA-256 lives in dist/BUILD.json.
const _RAPIER_STORED_GROUP_MARKER =
  /\/\* RAPIER_VENDOR_GROUP bytes=(\d+) stored=gzip\+base124(?: prefilter=([a-z0-9]+))? \*\//;
const _RAPIER_STORED_SPAN_MARKER =
  /\/\* RAPIER_VENDOR_SPAN (\S+) offset=(\d+) bytes=(\d+) \*\//;

async function _rapierInflateVendor(id) {
  const text = document.getElementById(id)?.textContent;
  if (!text) throw new Error(id);
  const groupMarker = _RAPIER_STORED_GROUP_MARKER.exec(text);
  if (!groupMarker || groupMarker[2] && groupMarker[2] !== 'words1') throw new Error(id);
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
    sources.push({name, source});
  }
  if (!sources.length || covered !== combined.byteLength) throw new Error(id);
  return sources;
}

function _rapierExecuteVendorSource(name, source) {
  const element = document.createElement('script');
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
  try {
    // The platform stage first (text codecs, providers, RapierPlatform, storage, preferences,
    // RapierBundleIO, the MathJax loader): what the shell used to carry as plain source and what
    // every later stage and every host handshake reads.
    for (const {name, source} of await _rapierInflateVendor('rapier-platform-runtime')) _rapierExecuteVendorSource(name, source);
    // An Apps host page without its bridge refuses to boot.
    const [styles, ui, ...stages] = await Promise.all(['rapier-styles-runtime', 'rapier-ui-runtime',
      'rapier-editor-runtime', ...(globalThis.RAPIER_APPS_HOST === true ? ['rapier-apps-runtime'] : [])]
      .map(_rapierInflateVendor));
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
    boot.after(...sheets);
    slot.replaceWith(template.content);
    // Execute in one turn: the shared globals precede the editor, which precedes its host bridge.
    for (const spans of stages) for (const {name, source} of spans) _rapierExecuteVendorSource(name, source);
  } catch (error) {
    if (globalThis._rapierBootstrapRuntime) _rapierBootstrapRuntime.failed = true;
    try { window.RapierPlatform?.files?.clearIntake?.(); } catch (_) {}
    document.body.classList.add('rapier-boot-failed');
    const detail = document.getElementById('rapier-boot-failure-detail');
    if (detail) detail.textContent = 'The editor could not unpack its libraries. Reload this file. Your document has not been opened or changed.';
    console.error('[rapier] runtime could not load', error);
  }
})();
