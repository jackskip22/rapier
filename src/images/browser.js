const _rapierEmbeddedImages = (() => {
  const assets = globalThis.RapierImageAssets;
  const cache = new Map(), pending = new Map(), dimensions = new Map(), presented = new WeakMap(), watched = new Set(), revealing = new Map();
  let worker = null, workerUrl = '', queue = Promise.resolve(), rasterQueue = Promise.resolve(), serial = 0, index = null;
  let rootId = '', authority = '', currentSource = '', frame = 0, epoch = 0, clock = 0;
  let active = null, primed = null, idleTimer = 0, suspended = false, workerOperation = '', warned = false;
  // R86d: can the browser DISPLAY JPEG XL? A real 1x1 decode at startup; it tells a missing decoder from a damaged file.
  // window.__rapierJxlReadableTest is the witness seam (docs/harness-limits.md).
  const JXL_PROBE = '/woAELASCAgQAJwCSxibnHGEAziAAzggSsA5BQEAIESACBABIkDk/5F7+h5aZ1dVVVUlSZIQUHd3d3d3////v1VvZmZmBv7fv+e/h8acc661z71JkiQEVFVVVVVV////z72vu7u7G/7fv+e/h8acc661z71JkiQEVFVVVVVV////z72vu7u7G/7fv+e/h8acc661z71JkiQEVFVVVVVV////z72vu7u7+wIiAHhAelzgYWg=';
  let jxlReadable = false, jxlProbeSettled = false, damagedWarned = false;
  // Probe through <img> (nativeImage), the same primitive pictures show through; createImageBitmap support can differ.
  const jxlProbed = (async () => {
    try {
      const image = new Image();
      await new Promise((ok, no) => { image.onload = ok; image.onerror = () => no(new Error('no decoder')); image.src = 'data:image/jxl;base64,' + JXL_PROBE; });
      jxlReadable = image.naturalWidth === 1 && image.naturalHeight === 1;
    } catch (_) { jxlReadable = false; }
    jxlProbeSettled = true;
  })();
  function jxlDisplayable() { return jxlReadable || window.__rapierJxlReadableTest === true; }
  // The probe's answer, once it has one. A caller that must not guess (Paint's display copies) waits.
  function whenJxlDisplayKnown() { return jxlProbed.then(() => jxlDisplayable()); }
  jxlProbed.then(() => { try { schedule(); } catch (_) {} });
  const host = document.getElementById('editor-blocks');
  const cancelled = () => Object.assign(new Error('The document changed before image processing finished'), {code: 'IMAGE_CANCELLED'});
  function releaseWorker() {
    clearTimeout(idleTimer); idleTimer = 0;
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); }
    worker = null; workerOperation = '';
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    workerUrl = '';
  }
  function stopWorker(reason = cancelled()) {
    if (active) active.finish(reason); else releaseWorker();
  }
  function synchronizeScope() {
    const next = rapier.identity.authority;
    if (authority === next) return;
    epoch++; stopWorker();
    for (const request of pending.values()) request.controller.abort(cancelled());
    visibility?.disconnect(); watched.clear();
    cache.clear(); pending.clear(); dimensions.clear(); darkened.clear(); portableCache.clear();
    primed = null; index = null; currentSource = ''; rootId = ''; authority = next; warned = false; damagedWarned = false;
  }
  function assertCurrent(stamp, identity) {
    if (suspended || stamp !== epoch || identity !== rapier.identity.authority) throw cancelled();
  }
  function codec(operation, input, {signal} = {}) {
    synchronizeScope();
    const stamp = epoch, identity = authority;
    const run = async () => {
      signal?.throwIfAborted();
      assertCurrent(stamp, identity);
      if (worker && workerOperation !== operation) releaseWorker();
      let code = '';
      if (!worker) {
        const spans = await _rapierInflateVendor('rapier-jxl-worker');
        signal?.throwIfAborted();
        assertCurrent(stamp, identity);
        code = spans.map(row => row.source).join('\n');
      }
      return new Promise((resolve, reject) => {
      let instance = null, timer = 0, settled = false;
      const abort = () => finish(signal.reason || new DOMException('Image processing cancelled', 'AbortError'));
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (instance) { instance.onmessage = null; instance.onerror = null; instance.onmessageerror = null; }
        if (active?.finish === finish) active = null;
        if (error) {
          if (!instance || worker === instance) releaseWorker();
          reject(error);
        } else {
          if (worker === instance) {
            // Encoding has finished: its scratch heap is not a document cache.
            if (operation === 'encode') releaseWorker();
            else idleTimer = setTimeout(() => { if (!active && worker === instance) releaseWorker(); }, 30000);
          }
          resolve(value);
        }
      };
      try {
        signal?.throwIfAborted();
        signal?.addEventListener('abort', abort, {once: true});
        assertCurrent(stamp, identity);
        clearTimeout(idleTimer); idleTimer = 0;
        if (!worker) {
          if (!code) throw new Error('The bundled JPEG XL codec is missing');
          workerUrl = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}));
          worker = new Worker(workerUrl);
          workerOperation = operation;
        }
        instance = worker;
        const id = ++serial;
        active = {finish};
        // The watchdog scales with the picture: 24 MP lossy with alpha takes 64 s of V8 time on the workstation.
        const megapixels = Math.ceil((input.width * input.height || 0) / 1e6);
        timer = setTimeout(() => finish(new Error('Image processing took too long')), 45000 + megapixels * 15000);
        instance.onmessage = event => {
          if (event.data?.id !== id) return;
          try { assertCurrent(stamp, identity); } catch (error) { finish(error); return; }
          if (event.data.ok) finish(null, event.data);
          else finish(Object.assign(new Error(event.data.error?.message || 'JPEG XL processing failed'), {code: event.data.error?.code}));
        };
        instance.onerror = event => { event.preventDefault(); finish(new Error(event.message || 'Image worker failed')); };
        instance.onmessageerror = () => finish(new Error('Image worker returned an unreadable result'));
        const data = input.data ?? input.bytes;
        const transfer = data instanceof ArrayBuffer ? data : data?.buffer;
        instance.postMessage({...input, id, operation}, transfer instanceof ArrayBuffer ? [transfer] : []);
      } catch (error) { finish(error); }
      });
    };
    const job = queue.then(run, run);
    queue = job.catch(() => {});
    return job;
  }
  // The index folded from the engine's blocks (spec/md-assets.mjs blockwiseAssets), which are markdown-it's own
  // top-level blocks (engine.js _splitByTokenStream): a keystroke re-parses the one block it changed instead of
  // the document (the whole parse of a 1.6 MB document with twenty pictures is 80 ms in Node, and it ran on
  // every key). Each block's parse is kept by its id while its raw stands. The whole parse stays the reference:
  // a model that is not this source byte for byte, or no model, goes to it.
  const parsedBlocks = new Map();
  function blockwiseIndex(source) {
    const rows = rapier.document.blocks;
    const spans = rapier.document.docKind === 'markdown' && Array.isArray(rows) && typeof _rapierCurrentBodyBlockSpans === 'function' ? _rapierCurrentBodyBlockSpans() : null;
    if (!spans || spans.length !== rows.length) return null;
    const bodyOffset = assets.markdownBodyOffset(source), live = new Set();
    const parse = (raw, row) => {
      let entry = parsedBlocks.get(row.id);
      if (!entry || entry.raw !== raw) { entry = {raw, index: assets.parseAssets(raw)}; parsedBlocks.set(row.id, entry); }
      live.add(row.id);
      return entry.index;
    };
    const folded = assets.blockwiseAssets(source, rows.map((row, at) => ({start: bodyOffset + spans[at].start, raw: String(row.raw || ''), id: row.id})), parse, bodyOffset);
    for (const id of parsedBlocks.keys()) if (!live.has(id)) parsedBlocks.delete(id);
    return folded;
  }
  function documentIndex() {
    synchronizeScope();
    const nextRoot = rapier.document.source.rootId;
    if (!index || rootId !== nextRoot) {
      currentSource = _rapierSourceText();
      index = blockwiseIndex(currentSource) || assets.documentAssets(currentSource); rootId = nextRoot;
    }
    return {source: currentSource, index};
  }
  function indexForSource(source) {
    const current = documentIndex();
    return source === current.source ? current.index : assets.documentAssets(source);
  }
  function nativeImage(url, {signal} = {}) {
    return new Promise((resolve, reject) => {
      signal?.throwIfAborted();
      const image = new Image();
      const abort = () => finish(signal.reason);
      const timer = setTimeout(() => finish(new Error('Image display timed out')), 15000);
      const finish = error => {
        clearTimeout(timer); signal?.removeEventListener('abort', abort); image.onload = null; image.onerror = null;
        if (error) { image.removeAttribute('src'); reject(error); } else resolve(image);
      };
      signal?.addEventListener('abort', abort, {once: true});
      image.onload = () => finish();
      image.onerror = () => finish(new Error('This browser could not display the image natively'));
      image.src = url;
    });
  }
  // A damaged JPEG XL can still load at full size and draw nothing (Chrome 154: a half-zeroed or cut file fires load, decode()
  // resolves, the picture is transparent). Where ImageDecoder reads JPEG XL its complete-frame decode is the test: a refusal of the
  // data (EncodingError, RangeError) is damage. Any other answer leaves the picture to the <img> that loaded it.
  async function jxlDamaged(bytes) {
    if (typeof ImageDecoder !== 'function' || !await ImageDecoder.isTypeSupported('image/jxl').catch(() => false)) return false;
    let decoder;
    try { decoder = new ImageDecoder({data: bytes, type: 'image/jxl'}); (await decoder.decode()).image.close(); return false; }
    catch (error) { return error?.name === 'EncodingError' || error?.name === 'RangeError'; }
    finally { decoder?.close(); }
  }
  async function canvasUrl(draw, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image rendering is unavailable');
      draw(context);
      const blob = await _rapierCanvasBlob(canvas, 'image/png');
      if (!blob) throw new Error('Image rendering failed');
      return await _rapierBlobDataUrl(blob);
    } finally { canvas.width = 0; canvas.height = 0; }
  }
  function joinRaster(request, signal) {
    const waiter = {};
    request.waiters.add(waiter);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', abort);
        request.waiters.delete(waiter);
        if (!request.settled && !request.waiters.size) request.controller.abort();
        if (error) reject(error); else resolve(value);
      };
      const abort = () => finish(signal.reason);
      signal?.addEventListener('abort', abort, {once: true});
      request.job.then(value => finish(null, value), finish);
      if (signal?.aborted) abort();
    });
  }
  async function rasterRecord(source, id, parsed, {signal} = {}) {
    signal?.throwIfAborted();
    const direct = assets.dataImage(id);
    if (!direct) id = assets.normalizeLabel(id);
    const record = direct ? {id, url: id, ...direct, status: 'unverified'} : parsed.assets.get(assets.normalizeLabel(id));
    if (!record || record.status !== 'unverified') {
      // An id with no table entry and no remaining occurrence is a retired picture, not a decode failure.
      if (!direct && !record && !assets.referenceOccurs(source, id)) throw Object.assign(new Error('Embedded image reference retired'), {code: 'IMAGE_VANISHED'});
      throw new Error('Embedded image is missing or exceeds the document image limit');
    }
    const signature = record.url;
    const existing = cache.get(signature);
    if (existing) { existing.used = ++clock; return existing; }
    const shared = pending.get(signature);
    if (shared && !shared.controller.signal.aborted) return joinRaster(shared, signal);
    const request = {controller: new AbortController(), waiters: new Set(), settled: false, job: null};
    const options = {signal: request.controller.signal};
    const capturedAuthority = rapier.identity.authority, stamp = epoch;
    const run = async () => {
      options.signal.throwIfAborted();
      assertCurrent(stamp, capturedAuthority);
      // R84 covers container damage too: a JPEG XL whose size cannot be read goes to the DAMAGED notice, not a hard error. Other codecs keep the assertion.
      let bytes, dimensions, containerDamaged = false;
      if (record.codec === 'image/jxl') {
        const decoded = direct ? assets.decodeDataImageBytes(id) : await assets.decodeAssetBytes(source, record);
        bytes = decoded.bytes;
        try { dimensions = assets.imageDimensions(bytes, record.codec); }
        catch (_) {
          containerDamaged = true;
          dimensions = {width: assets.UNSTATED_SIZE.width, height: assets.UNSTATED_SIZE.height};
        }
      } else {
        bytes = direct ? assets.decodeDataImage(id) : await assets.decodeAsset(source, record);
        dimensions = assets.imageDimensions(bytes, record.codec);
      }
      assertCurrent(stamp, capturedAuthority);
      let url = record.url, type = record.codec;
      if (type === 'image/svg+xml') url = 'data:image/svg+xml;base64,' + RapierBundleIO.toBase64(assets.normalizeSVG(bytes));
      let native, undisplayable = false;
      let damaged = false;
      try {
        // An unreadable container: never ask the browser to decode it.
        if (containerDamaged) throw new Error('JPEG XL container is unreadable');
        const image = await nativeImage(url, options);
        native = {width: image.naturalWidth, height: image.naturalHeight};
        image.removeAttribute('src');
        if (record.codec === 'image/jxl' && await jxlDamaged(bytes)) native = null;
      } catch (_) { options.signal.throwIfAborted(); }
      assertCurrent(stamp, capturedAuthority);
      if (native) {
        if (native.width !== dimensions.width || native.height !== dimensions.height) throw new Error('Embedded image dimensions do not match its record');
      } else {
        // R84: a browser that cannot DISPLAY JPEG XL never stops embedding or working with a picture; the preview degrades to a notice at its own size.
        // R86d: no decoder says "update"; a decoder that fails says "damaged". Saved bytes untouched.
        if (record.codec === 'image/jxl') {
          await jxlProbed; // never classified before the probe answers
          damaged = containerDamaged || jxlDisplayable();
          url = noticeUrl(dimensions.width, dimensions.height, damaged);
          native = {width: dimensions.width, height: dimensions.height};
          undisplayable = true;
        } else throw new Error('This image could not be displayed');
      }
      if (damaged) notifyDamaged(); else if (undisplayable) notifyStale();
      assertCurrent(stamp, capturedAuthority);
      // Cache compressed presentation strings only. The browser owns decoded surfaces.
      const row = {url, width: dimensions.width, height: dimensions.height, type, signature, used: ++clock,
        undisplayable, damaged, cost: (url.length + signature.length) * 2};
      cache.delete(signature);
      let total = [...cache.values()].reduce((sum, item) => sum + item.cost, 0);
      for (const [key, item] of [...cache.entries()].sort((a,b) => a[1].used-b[1].used)) {
        if (total + row.cost <= 32 * 1024 * 1024 && cache.size < 16) break;
        total -= item.cost; cache.delete(key);
      }
      // Held however large: refusing it re-decoded the picture on every re-render.
      cache.set(signature, row);
      return row;
    };
    request.job = rasterQueue.then(run, run).finally(() => {
      request.settled = true;
      if (pending.get(signature) === request) pending.delete(signature);
    });
    rasterQueue = request.job.catch(() => {});
    pending.set(signature, request);
    return joinRaster(request, signal);
  }
  // R84 notice: a flat box at the picture's own dimensions, with reason and remedy.
  function noticeUrl(width, height, damaged = false) {
    const w = Math.max(1, width | 0), h = Math.max(1, height | 0);
    const size = Math.max(9, Math.min(w / 18, h / 7, 22)), pad = size * 0.9;
    const lines = damaged ? ['THIS JPEG XL PICTURE IS', 'DAMAGED. ITS BYTES ARE', 'KEPT, UNCHANGED.'] : ['YOUR BROWSER CANNOT SHOW', 'THIS JPEG XL PICTURE.', 'UPDATE IT TO SEE IT.'];
    const fits = w >= size * 15 && h >= size * 5;
    const text = fits ? lines.map((line, i) =>
      '<text x="' + (w / 2) + '" y="' + (h / 2 + (i - 1) * size * 1.5) + '" fill="#8a8a8a" font-size="' + size +
      '" font-family="Geist Mono, ui-monospace, monospace" letter-spacing="' + (size * 0.04) +
      '" text-anchor="middle" dominant-baseline="middle">' + line + '</text>').join('') : '';
    const mark = fits ? '' : '<rect x="' + (w / 2 - pad) + '" y="' + (h / 2 - 1.5) + '" width="' + (pad * 2) + '" height="3" fill="#8a8a8a"/>';
    return 'data:image/svg+xml;base64,' + RapierBundleIO.toBase64(new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<rect width="' + w + '" height="' + h + '" fill="#d4d4d4"/>' + text + mark + '</svg>'));
  }
  function notifyStale() {
    if (warned) return;
    warned = true;
    showToast('Your browser cannot show JPEG XL pictures. Update it and reopen this document. The pictures are unchanged.', 'info');
  }
  function notifyDamaged() {
    if (damagedWarned) return;
    damagedWarned = true;
    showToast('A JPEG XL picture in this document is damaged and cannot be shown. Its bytes are kept unchanged.', 'info');
  }

  async function prepare(normalized, {signal, status} = {}) {
    signal?.throwIfAborted();
    synchronizeScope();
    const asset = normalized.asset;
    if (!asset || normalized.presentation?.signature === asset.url) return normalized;
    status?.('Preparing the picture…');
    const presentation = await rasterRecord(asset.block, asset.id, assets.documentAssets(asset.block), {signal});
    return {...normalized, presentation};
  }
  async function portable(source, id, {png = false} = {}) {
    const row = await rasterRecord(source, id, indexForSource(source));
    // The notice is never the picture: never handed to Share, an export or the clipboard.
    if (row.damaged) throw Object.assign(new Error('This JPEG XL picture is damaged and cannot be converted. Its bytes are kept unchanged.'), {code: 'IMAGE_DAMAGED'});
    if (row.undisplayable) throw Object.assign(new Error('This browser cannot read JPEG XL, so this picture cannot be converted. Update your browser and try again; the picture itself is unchanged.'), {code: 'IMAGE_JXL_UNREADABLE'});
    const nested = nestedJxl(row);
    if (nested) return portableSvg(row, nested);
    if (row.type === 'image/png' || !png && row.type !== 'image/jxl') return row;
    const image = await nativeImage(row.url);
    try {
      return {...row, type: 'image/png', url: await canvasUrl(context => context.drawImage(image, 0, 0, row.width, row.height), row.width, row.height)};
    } finally { image.removeAttribute('src'); }
  }
  // R86i: a drawing's JPEG XL paint layers get the same portable conversion inside the SVG text; geometry, text and fonts untouched,
  // the editable source never rewritten. No decoder bundled (R83): refuse where the browser cannot decode.
  const NESTED_JXL_RE = /(\b(?:xlink:)?href\s*=\s*)(["'])(data:image\/jxl;base64,[A-Za-z0-9+/=]+)\2/g;
  function nestedJxl(row) {
    if (row.type !== 'image/svg+xml') return null;
    let text;
    try { text = new TextDecoder().decode(assets.decodeDataImage(row.url)); } catch (_) { return null; }
    return text.includes('data:image/jxl;base64,') ? text : null;
  }
  async function portableSvg(row, text) {
    await jxlProbed;
    if (!jxlDisplayable()) throw Object.assign(new Error('This browser cannot read JPEG XL, so the paint inside this drawing cannot be converted. Update your browser and try again; the drawing itself is unchanged.'), {code: 'IMAGE_JXL_UNREADABLE'});
    const converted = new Map();
    for (const match of text.matchAll(NESTED_JXL_RE)) {
      const url = match[3];
      if (converted.has(url)) continue;
      let image;
      try { image = await nativeImage(url); if (await jxlDamaged(assets.decodeDataImage(url))) throw new Error('damaged'); }
      catch (_) { image?.removeAttribute('src'); throw Object.assign(new Error('The paint inside this drawing is damaged and cannot be converted. Its bytes are kept unchanged.'), {code: 'IMAGE_DAMAGED'}); }
      try { converted.set(url, rasterPortable(image, image.naturalWidth, image.naturalHeight, {png: false}).url); }
      finally { image.removeAttribute('src'); }
    }
    const out = text.replace(NESTED_JXL_RE, (whole, lead, quote, url) => lead + quote + (converted.get(url) || url) + quote);
    return {...row, url: 'data:image/svg+xml;base64,' + RapierBundleIO.toBase64(new TextEncoder().encode(out)), nested: converted.size};
  }
  // One raster to the smallest portable codec: PNG (exact), or JPEG at 0.92 where the picture is
  // opaque and the JPEG is smaller; `png` forces PNG. The canvas is released before returning.
  function rasterPortable(image, width, height, {png = false} = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    try {
      const context = canvas.getContext('2d', {willReadFrequently: true});
      if (!context) return null;
      context.drawImage(image, 0, 0, width, height);
      const pngUrl = canvas.toDataURL('image/png');
      if (!pngUrl.startsWith('data:image/png;base64,')) return null;
      let result = {type: 'image/png', url: pngUrl};
      if (!png) {
        const data = context.getImageData(0, 0, width, height).data;
        let opaque = true;
        for (let at = 3; at < data.length; at += 4) if (data[at] !== 255) { opaque = false; break; }
        if (opaque) {
          const jpeg = canvas.toDataURL('image/jpeg', 0.92);
          if (jpeg.startsWith('data:image/jpeg;base64,') && jpeg.length < result.url.length) result = {type: 'image/jpeg', url: jpeg};
        }
      }
      return result;
    } finally { canvas.width = 0; canvas.height = 0; }
  }
  function imageGeometry(url) {
    const known = [primed, cache.get(url), dimensions.get(url)].find(row => row?.signature === url);
    if (known) return known;
    let size;
    try { size = assets.imageDimensions(assets.decodeDataImage(url), assets.dataImage(url).codec); }
    catch (_) { return {width: 320, height: 180}; }
    const row = {...size, signature: url};
    if (dimensions.size >= assets.IMAGE_LIMITS.assets) dimensions.delete(dimensions.keys().next().value);
    dimensions.set(url, row);
    return row;
  }
  const placeholder = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
  function imageHtml(id, alt, title, size, layout, rawAlt, source, url) {
    const esc = escapeRapierHtmlText, geometry = imageGeometry(url);
    // The paper's presentation has one owner: presentUrl.
    const ready = geometry.url && geometry.signature === url;
    const attributes = _rapierImageSizeAttributes(size, layout);
    // A native-size or full-column drawing keeps a legible floor; an explicitly smaller picture keeps its chosen size.
    const drawing = !size && (!layout || globalThis.RapierMarkdownLayout.parseLayout(layout)?.width === 100) && /^data:image\/svg\+xml[;,]/i.test(url || '');
    const ratio = 'aspect-ratio:' + geometry.width + '/' + geometry.height + ';' + (drawing ? '--md-drawing-width:' + geometry.width + 'px;' : '');
    const sized = attributes.includes(' style=') ? attributes.replace(' style="', ' style="' + ratio) : attributes + ' style="' + ratio + '"';
    return '<img data-rapier-markdown-image="" ' + (id ? 'data-rapier-asset="' + esc(id) : 'data-rapier-image-url="' + esc(url)) +
      '" src="' + esc(ready ? presentUrl(geometry) : placeholder) + '" alt="' + esc(alt) + '" decoding="async"' +
      (ready ? ' data-rapier-asset-state="ready"' : '') +
      ' data-rapier-natural-width="' + geometry.width + '" data-rapier-natural-height="' + geometry.height + '"' + (drawing ? ' data-md-drawing=""' : '') +
      (!size ? ' width="' + geometry.width + '"' : '') + ' height="' + geometry.height + '"' +
      (source && source.length <= 4096 ? ' data-rapier-image-source="' + esc(encodeURIComponent(source)) + '"' : '') +
      (title ? ' title="' + esc(title) + '"' : '') +
      (layout ? ' data-rapier-image-layout="' + esc(encodeURIComponent(layout)) + '"' : '') +
      (size && !globalThis.RapierMarkdownLayout.parseLayout(layout || '')?.width ?
        ' data-rapier-image-alt-source="' + esc(rawAlt) + '"' : '') +
      sized + '>';
  }
  const imageKey = image => image.getAttribute('data-rapier-asset') || image.getAttribute('data-rapier-image-url');
  const recordFor = (id, index) => assets.dataImage(id) ? {url: id} : index.assets.get(assets.normalizeLabel(id));
  // Dark paper re-inks a drawing's <img> via _rapierDeriveDarkColor; display only, the file and every export keep its colours.
  const darkPaper = () => !document.body.classList.contains('light');
  // Keyed by row.signature so every derived variant evicts together (I04); byte budget plus entry cap, LRU on the shared clock.
  const darkened = new Map();
  const DARKENED_BUDGET = 8 * 1024 * 1024;
  // Shared by presentUrl and layout/browser.js adoptRotateCandidate. Paint pixels: invert with hue turned back (lift lightness, keep hue).
  // Display only; the file's pixels never change.
  const PAINT_INK_FILTER = globalThis.RapierDrawCore.RAPIER_DRAW_PAINT_INK_FILTER;
  function inkForPaper(text) {
    if (!darkPaper() || typeof _rapierDeriveDarkColor !== 'function' || !text.includes('<metadata id="rapier-draw">')) return text;
    const paper = getComputedStyle(document.body).getPropertyValue('--color-text').trim(), paperInk = /^#[0-9a-f]{6}$/i.test(paper) ? paper.toLowerCase() : null;
    // Promote the drawing's own rules for the editor's explicit theme. A legacy drawing still derives unnamed paints.
    const own = /<style>@media \(prefers-color-scheme:dark\)\{([^<]*)\}<\/style>/.exec(text);
    const named = new Set([...(own?.[1] || '').matchAll(/\[(fill|stroke|color|stop-color)="(#[0-9a-f]{6})"\]/g)].map(m => m[1] + m[2]));
    let out = own ? text.replace(own[0], '<style>' + own[1] + '</style>') : text;
    out = out.replace(/<[^>]+>/g, tag => tag.replace(/\b(fill|stroke|color|stop-color)="(#[0-9a-fA-F]{6})"/g, (match, attr, hex) => {
      const low = hex.toLowerCase();
      return named.has(attr + low) ? match : attr + '="' + (low === '#121212' && paperInk ? paperInk : _rapierDeriveDarkColor(low)) + '"';
    }));
    if (out.includes('data-rapier-paint=') && !own?.[1].includes('[data-rapier-paint]')) out = out.replace(/<\/metadata>/, '</metadata>' + PAINT_INK_FILTER)
      .replace(/<image data-rapier-paint=/g, '<image filter="url(#rapier-paint-ink)" data-rapier-paint=');
    return out;
  }
  function presentUrl(row) {
    if (!darkPaper() || row.type !== 'image/svg+xml' || typeof _rapierDeriveDarkColor !== 'function') return row.url;
    const key = row.signature;
    const cached = darkened.get(key);
    if (cached) { cached.used = ++clock; return cached.url; }
    let url = row.url;
    try {
      const text = new TextDecoder().decode(assets.decodeDataImage(row.url));
      const inked = inkForPaper(text);
      if (inked !== text) url = 'data:image/svg+xml;base64,' + RapierBundleIO.toBase64(new TextEncoder().encode(inked));
    } catch (_) { url = row.url; }
    const entry = {url, used: ++clock, cost: url.length * 2};
    darkened.delete(key);
    let total = entry.cost;
    for (const item of darkened.values()) total += item.cost;
    for (const [candidateKey, item] of [...darkened.entries()].sort((a, b) => a[1].used - b[1].used)) {
      if (total <= DARKENED_BUDGET && darkened.size < 32) break;
      total -= item.cost; darkened.delete(candidateKey);
    }
    darkened.set(key, entry);
    return url;
  }
  // A theme change re-presents every drawing that was inked for the other paper.
  function retheme() {
    const dark = darkPaper();
    for (const image of host.querySelectorAll('img[data-rapier-asset],img[data-rapier-image-url]')) {
      const ticket = presented.get(image);
      if (ticket && ticket.dark !== dark && /^data:image\/svg\+xml/i.test(image.getAttribute('src') || '')) { presented.delete(image); image.removeAttribute('data-rapier-asset-state'); }
    }
    schedule();
  }
  async function reveal(image) {
    const id = imageKey(image), captured = documentIndex(), stamp = rapier.identity.authority;
    const record = recordFor(id, captured.index), ticket = {signature: record?.url, authority: stamp, dark: darkPaper()};
    revealing.get(image)?.abort();
    const controller = new AbortController();
    revealing.set(image, controller);
    presented.set(image, ticket);
    image.dataset.rapierAssetState = 'loading';
    try {
      const row = await rasterRecord(captured.source, id, captured.index, {signal: controller.signal});
      if (!image.isConnected || presented.get(image) !== ticket || stamp !== rapier.identity.authority || imageKey(image) !== id) return;
      const latest = documentIndex(), current = recordFor(id, latest.index);
      if (!current || current.url !== row.signature) { image.removeAttribute('data-rapier-asset-state'); schedule(); return; }
      image.src = presentUrl(row);
      image.setAttribute('data-rapier-natural-width', row.width);
      image.setAttribute('data-rapier-natural-height', row.height);
      if (image.decode) await image.decode();
      if (!image.isConnected || presented.get(image) !== ticket || stamp !== rapier.identity.authority || imageKey(image) !== id) return;
      if (recordFor(id, documentIndex().index)?.url !== row.signature) { image.removeAttribute('data-rapier-asset-state'); schedule(); return; }
      image.dataset.rapierAssetState = 'ready';
      if (row.undisplayable) image.setAttribute('aria-description', row.damaged ? 'This JPEG XL picture appears damaged and cannot be shown. Its saved bytes are kept unchanged.' : 'This JPEG XL picture cannot be shown by this browser. Its saved bytes are intact.');
      else image.removeAttribute('aria-description');
      globalThis.RapierImageFlow?.schedule();
    } catch (error) {
      if (!image.isConnected || presented.get(image) !== ticket || stamp !== rapier.identity.authority) return;
      if (error.code === 'IMAGE_CANCELLED' || error.code === 'IMAGE_VANISHED' || error.name === 'AbortError') { image.removeAttribute('data-rapier-asset-state'); schedule(); return; }
      image.dataset.rapierAssetState = 'error';
      image.setAttribute('aria-description', 'Embedded image unavailable: ' + error.message);
      // JPEG XL that cannot display never reaches here: it degrades to a notice in rasterRecord.
      if (!warned) { warned = true; showToast('An embedded image could not be displayed. Its saved bytes are intact.', 'error'); }
    } finally { if (revealing.get(image) === controller) revealing.delete(image); }
  }
  const visibility = typeof IntersectionObserver === 'function' ? new IntersectionObserver(rows => {
    for (const row of rows) if (row.isIntersecting && watched.delete(row.target)) {
      visibility.unobserve(row.target);
      if (host.contains(row.target) && row.target.dataset.rapierAssetState === 'waiting') void reveal(row.target);
    }
  }, {root: host, rootMargin: '500px'}) : null;
  function schedule() {
    if (frame || suspended) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const current = documentIndex(), area = host.getBoundingClientRect();
      // A painting inside a drawing's SVG reaches no code of ours when the browser cannot show it: the document says so once.
      if (!warned && jxlProbeSettled && !jxlDisplayable() && currentSource.includes('image/jxl')) notifyStale();
      for (const image of watched) if (!host.contains(image)) { visibility.unobserve(image); watched.delete(image); }
      for (const [image, controller] of revealing) if (!host.contains(image)) controller.abort();
      for (const image of host.querySelectorAll('img[src^="data:image/jxl;" i]:not([data-rapier-asset]):not([data-rapier-image-url])')) {
        const url = image.getAttribute('src'), size = imageGeometry(url);
        image.setAttribute('data-rapier-image-url', url);
        image.setAttribute('data-rapier-natural-width', size.width);
        image.setAttribute('data-rapier-natural-height', size.height);
        if (!image.hasAttribute('width')) image.setAttribute('width', size.width);
        image.style.aspectRatio = size.width + '/' + size.height;
        image.src = placeholder;
      }
      for (const image of host.querySelectorAll('img:is([data-rapier-asset],[data-rapier-image-url])')) {
        const id = imageKey(image), previous = presented.get(image), record = recordFor(id, current.index);
        if (previous && (previous.authority !== authority || previous.signature !== record?.url)) {
          visibility?.unobserve(image); watched.delete(image); image.removeAttribute('data-rapier-asset-state');
        }
        if (image.dataset.rapierAssetState) {
          if (!previous) presented.set(image, {signature: record?.url, authority, dark: darkPaper()});
          continue;
        }
        presented.set(image, {signature: record?.url, authority});
        image.dataset.rapierAssetState = 'waiting';
        image.loading = 'eager';
        const bounds = image.getBoundingClientRect();
        if (!visibility || bounds.bottom >= area.top - 500 && bounds.top <= area.bottom + 500) void reveal(image);
        else { watched.add(image); visibility.observe(image); }
      }
    });
  }
  const observer = new MutationObserver(schedule);
  observer.observe(host, {childList: true, subtree: true});
  window.addEventListener('pagehide', () => {
    suspended = true; epoch++;
    if (frame) cancelAnimationFrame(frame);
    frame = 0; stopWorker();
    for (const request of pending.values()) request.controller.abort(cancelled());
    pending.clear(); cache.clear(); dimensions.clear(); darkened.clear(); portableCache.clear(); primed = null;
    visibility?.disconnect(); watched.clear();
    for (const image of host.querySelectorAll('img[data-rapier-asset-state="waiting"],img[data-rapier-asset-state="loading"]'))
      image.removeAttribute('data-rapier-asset-state');
  });
  window.addEventListener('pageshow', () => { suspended = false; schedule(); });
  // Copy is a synchronous `copy` event: read rasterRecord's cache (canonical colours), never the live src (dark-paper presentation).
  function clipboard(root) {
    for (const image of root.querySelectorAll('img[data-rapier-asset],img[data-rapier-image-url]')) {
      const id = imageKey(image);
      const live = [...host.querySelectorAll('img[data-rapier-asset],img[data-rapier-image-url]')].find(node =>
        imageKey(node) === id && node.complete && node.naturalWidth && node.dataset.rapierAssetState === 'ready');
      if (!live) return false;
      const record = recordFor(id, documentIndex().index);
      const canonical = record && cache.get(record.url);
      if (canonical && canonical.type === 'image/svg+xml') {
        image.src = canonical.url;
        image.removeAttribute('data-rapier-asset'); image.removeAttribute('data-rapier-image-url'); image.removeAttribute('data-rapier-image-source'); image.removeAttribute('data-rapier-asset-state');
        continue;
      }
      const canvas = document.createElement('canvas');
      canvas.width = live.naturalWidth; canvas.height = live.naturalHeight;
      try {
        const context = canvas.getContext('2d');
        if (!context) return false;
        context.drawImage(live, 0, 0);
        const url = canvas.toDataURL('image/png');
        if (!url.startsWith('data:image/png;base64,')) return false;
        image.src = url;
        image.removeAttribute('data-rapier-asset'); image.removeAttribute('data-rapier-image-url'); image.removeAttribute('data-rapier-image-source'); image.removeAttribute('data-rapier-asset-state');
      } catch (_) { return false; }
      finally { canvas.width = 0; canvas.height = 0; }
    }
    return true;
  }
  // Destination policy, not presentation: JPEG XL becomes PNG, or JPEG 0.92 where opaque and smaller. `substitutions` maps source to portable data URL.
  // Keyed by row.signature, evicted with `darkened` (I04).
  const portableCache = new Map();
  const PORTABLE_BUDGET = 16 * 1024 * 1024;
  async function smallestPortable(row) {
    const key = row.signature;
    const cached = portableCache.get(key);
    if (cached) { cached.used = ++clock; return cached.value; }
    let result = null;
    const nested = nestedJxl(row);
    if (nested) result = await portableSvg(row, nested); // refuses where the browser cannot read the paint
    else {
      try {
        const image = await nativeImage(row.url);
        try {
          const made = rasterPortable(image, row.width, row.height);
          // A JPEG XL picture must change; another stays unless the JPEG is smaller.
          if (made && (row.type === 'image/jxl' || made.type === 'image/jpeg' && made.url.length < row.url.length)) result = {...row, ...made};
          else if (row.type !== 'image/jxl') result = row;
        } finally { image.removeAttribute('src'); }
      } catch (_) {}
    }
    if (!result) result = row;
    const entry = {value: result, used: ++clock, cost: (result.url.length + key.length) * 2};
    portableCache.delete(key);
    let total = entry.cost;
    for (const item of portableCache.values()) total += item.cost;
    for (const [candidateKey, item] of [...portableCache.entries()].sort((a, b) => a[1].used - b[1].used)) {
      if (total <= PORTABLE_BUDGET && portableCache.size < 16) break;
      total -= item.cost; portableCache.delete(candidateKey);
    }
    portableCache.set(key, entry);
    return result;
  }
  // `compat` (R81) defaults to true; Share passes the person's choice.
  async function materialize(root, source, substitutions = null, options = null) {
    const compat = !options || options.compat !== false;
    const resolved = new Map(), index = indexForSource(source);
    for (const image of root.querySelectorAll('img[data-rapier-asset],img[data-rapier-image-url],img[src^="data:image/jxl;" i]')) {
      const id = imageKey(image) || image.getAttribute('src');
      if (!resolved.has(id)) {
        // A JXL-sourced picture always takes the portable conversion, whatever rasterRecord presented.
        const row = await rasterRecord(source, id, index);
        const jxl = compat && (assets.dataImage(row.signature)?.codec === 'image/jxl' || !!nestedJxl(row));
        // R86d: a row presenting the notice is never handed on. Without compat the page carries the JPEG XL bytes; compat refuses as Copy does.
        let shown;
        if (row.undisplayable || row.damaged) {
          if (jxl) throw Object.assign(new Error(row.damaged ? 'This JPEG XL picture is damaged and cannot be converted. Its bytes are kept unchanged.' : 'This browser cannot read JPEG XL, so this picture cannot be converted. Update your browser and try again; the picture itself is unchanged.'), {code: row.damaged ? 'IMAGE_DAMAGED' : 'IMAGE_JXL_UNREADABLE'});
          shown = {...row, url: row.signature};
        } else shown = jxl ? await smallestPortable(row) : row;
        resolved.set(id, shown);
        if (substitutions && jxl) substitutions.set(row.signature, shown.url);
      }
      const row = resolved.get(id);
      image.src = row.url;
      image.setAttribute('data-rapier-natural-width', row.width);
      image.setAttribute('data-rapier-natural-height', row.height);
      for (const name of ['data-rapier-asset', 'data-rapier-image-url', 'data-rapier-asset-state', 'data-rapier-image-source']) image.removeAttribute(name);
    }
    return root;
  }
  // A point is not an insertion transaction: the open Markdown runs and their block shell
  // must close and reopen around a picture. The real parser admits both halves; raw slices
  // keep authored spellings, and a semantic proof refuses any unsupported or ambiguous cut.
  function caretSplit(source, point) {
    if (typeof source !== 'string' || !source.trim() || !Number.isSafeInteger(point) || point < 0 || point > source.length) return null;
    // A source edge keeps the whole block, including every authored delimiter and annotation.
    if (point === 0 || point === source.length) return Object.freeze({source, point,
      before: point === 0 ? '' : source, after: point === 0 ? source : ''});
    const graphemes = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
    let graphemeBoundary = false;
    for (const part of graphemes.segment(source)) {
      if (part.index >= point) { graphemeBoundary = part.index === point; break; }
    }
    if (!graphemeBoundary) return null;
    // A task item's words follow its box and one space: a caret before that space is the same
    // rendered place as after it, and a mark between `]` and the space would unmake the box.
    if (/(?:^|[\r\n])[ \t>]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[[ xX]\]$/.test(source.slice(0, point)))
      while (point < source.length && /[ \t]/.test(source[point])) point++;
    const environment = () => ({..._rapierMarkdownEnvironment()});
    const parse = value => md.parse(value, environment());
    let marker = '\ue000rapier-caret\ue001';
    while (source.includes(marker)) marker += '\ue001';
    const original = parse(source);
    // A layout annotation is one block owner: a cut never divides or moves it.
    const annotations = original.flatMap(token => token.children || []).filter(child =>
      child.type === 'html_inline' && /^<!--[ \t]*md-layout(?=[: \t-]|$)/i.test(child.content));
    if (annotations.length) {
      const annotation = annotations[0].content, at = source.lastIndexOf(annotation);
      if (annotations.length === 1 && at >= point && !source.slice(at + annotation.length).trim()) {
        const edge = caretSplit(source.slice(0, at), point);
        if (edge && !edge.after) return Object.freeze({source, point, before: source, after: ''});
        if (edge && !edge.before) return Object.freeze({source, point, before: '', after: source});
      }
      return null;
    }
    // Callout kind is rendered chrome derived from the first quote line, not token attrs.
    // Its caption cannot silently become an ordinary quote on the right.
    if (original[0]?.type === 'blockquote_open' && /^\[![A-Za-z]+\]/.test(
        original.find(token => token.type === 'inline')?.content || '')) return null;
    const hasLink = original.some(token => token.children?.some(child => child.type === 'link_open'));
    const linkRule = md.inline.ruler.__rules__.find(row => row.name === 'link' && row.enabled)?.fn;
    const links = [];
    let linkScan = 0;
    if (hasLink && linkRule) for (let start = source.lastIndexOf('[', point - 1); start >= 0;
        start = start > 0 ? source.lastIndexOf('[', start - 1) : -1) {
      if (_rapierSourceCharEscaped(source, start) || source[start - 1] === '!') continue;
      // The grammar's label helper may scan the remaining source. Bound speculative work
      // linearly; difficult bracket nests keep the existing after-block insertion instead.
      if ((linkScan += source.length - start) > source.length * 4) return null;
      const state = new md.inline.State(source, md, environment(), []);
      state.pos = start;
      const labelEnd = md.helpers.parseLinkLabel(state, start, false);
      if (labelEnd < point) continue;
      state.pos = start;
      if (!linkRule(state, false) || state.pos <= labelEnd) continue;
      const token = state.tokens.find(token => token.type === 'link_open');
      if (!token) continue;
      const suffix = source.slice(labelEnd, state.pos);
      const close = suffix === ']' || suffix === '][]' ? '][' + source.slice(start + 1, labelEnd) + ']' : suffix;
      links.push({open: '[', close, labelEnd, end: state.pos, suffix, token});
      break; // CommonMark forbids nested links: the first admitted enclosing label owns it.
    }
    // A private parse marker must not rename a shortcut reference's lookup key.
    let markedSource = source;
    if (links.length === 1 && links[0].close !== links[0].suffix) {
      const link = links[0];
      markedSource = source.slice(0, link.labelEnd) + link.close + source.slice(link.end);
    }
    const marked = parse(markedSource.slice(0, point) + marker + markedSource.slice(point));
    const fingerprint = tokens => JSON.stringify(tokens.map(token => ({type: token.type, tag: token.tag,
      content: token.type === 'inline' ? '' : token.content.replace(marker, ''), markup: token.markup, attrs: token.attrs,
      ...(token.children ? {children: JSON.parse(fingerprint(token.children))} : {})})));
    if (fingerprint(original) !== fingerprint(marked)) return null;
    // Paragraphs and headings, in quotes and in lists of every kind (bullets, numbers, tasks,
    // nesting); a block holding anything else keeps its after-block place. The caret stands in one
    // leaf, the paragraph or heading whose words hold it.
    const allowedBlocks = /^(?:(?:blockquote|paragraph|heading|bullet_list|ordered_list|list_item)_(?:open|close)|inline)$/;
    if (original.some(token => !allowedBlocks.test(token.type))) return null;
    const leaves = marked.filter(token => token.type === 'inline');
    const leaf = leaves.findIndex(token => token.content.includes(marker));
    if (leaf < 0 || leaves.some((token, index) => index > leaf && token.content.includes(marker))) return null;
    const single = leaves.length === 1 && !original.some(token => token.type === 'list_item_open');
    const inline = leaves[leaf], children = inline.children || [];
    const stack = [], active = [];
    let hit = null;
    for (let index = 0; index < children.length; index++) {
      const token = children[index];
      if (token.nesting === 1) {
        const color = token.type === 'mark_open' && Object.keys(RAPIER_HIGHLIGHT_COLOR_BY_MARKER)
          .find(value => children[index + 1]?.type === 'text' && children[index + 1].content.startsWith(value));
        stack.push({token, color: color || ''});
      }
      if (token.content.includes(marker)) { if (hit) return null; hit = token; active.push(...stack); }
      if (token.nesting === -1) stack.pop();
    }
    if (!hit || !['text', 'code_inline'].includes(hit.type)) return null;
    // Parser-admitted links keep the exact destination/title/ref suffix; collapsed and shortcut references name their label after a split.
    const linkPair = () => {
      const wanted = active.find(row => row.token.type === 'link_open')?.token;
      const candidates = links.filter(row => JSON.stringify(row.token.attrs) === JSON.stringify(wanted?.attrs));
      return candidates.length === 1 ? candidates[0] : null;
    };
    const pairs = [];
    let link = null;
    for (const row of active) {
      const token = row.token;
      if (token.type === 'link_open') {
        link = linkPair();
        if (!link) return null;
        pairs.push(link);
      } else if (['strong_open','em_open','s_open','mark_open','ins_open','sub_open','sup_open'].includes(token.type) && token.markup) {
        pairs.push({open: token.markup + row.color, close: token.markup});
      } else return null;
    }
    let code = null;
    if (hit.type === 'code_inline') {
      const rule = md.inline.ruler.__rules__.find(row => row.name === 'backticks' && row.enabled)?.fn;
      if (!rule) return null;
      for (const match of source.matchAll(/`+/g)) {
        if (match.index >= point) break;
        if (match[0] !== hit.markup || _rapierSourceCharEscaped(source, match.index)) continue;
        const state = new md.inline.State(source, md, environment(), []);
        state.pos = match.index;
        if (!rule(state, false) || state.pos <= point || state.tokens.length !== 1) continue;
        const token = state.tokens[0];
        if (token.type !== 'code_inline' || token.content !== hit.content.replace(marker, '')) continue;
        if (code) return null;
        code = {start: match.index + match[0].length, end: state.pos - match[0].length};
      }
      if (!code) return null;
      pairs.push({open: hit.markup, close: hit.markup});
    }
    // Cells carry their actual mark semantics, including link targets and highlight colours.
    // Comparing each half separately rules out lost words, leaked delimiters and reassigned marks.
    const cells = (list, split) => {
      const rows = [], marks = [];
      let cut = -1;
      for (let i = 0; i < list.length; i++) {
        const token = list[i];
        if (token.nesting === 1) {
          const color = token.type === 'mark_open' && Object.keys(RAPIER_HIGHLIGHT_COLOR_BY_MARKER)
            .find(value => list[i + 1]?.type === 'text' && list[i + 1].content.startsWith(value));
          marks.push({type: token.type, attrs: token.attrs, markup: token.markup, color: color || ''});
          continue;
        }
        if (token.nesting === -1) { marks.pop(); continue; }
        if (token.type === 'html_inline') {
          if (!/^<!--[\s\S]*-->$/.test(token.content)) return null;
          rows.push({text: token.content, kind: token.type}); continue;
        }
        if (!['text','code_inline','softbreak','hardbreak'].includes(token.type)) return null;
        let content = token.type.endsWith('break') ? '\n' : token.content;
        const color = marks.at(-1)?.color;
        if (token.type === 'text' && color && list[i - 1]?.type === 'mark_open' && content.startsWith(color)) content = content.slice(color.length);
        const attributes = JSON.stringify({marks, type: token.type === 'text' ? 'text' : token.type,
          ...(token.type === 'code_inline' ? {markup: token.markup} : {})});
        const pieces = split ? content.split(marker) : [content];
        for (let p = 0; p < pieces.length; p++) {
          if (p) { if (cut >= 0) return null; cut = rows.length; }
          for (const text of pieces[p]) rows.push({text, attributes});
        }
      }
      return {rows, cut};
    };
    // A reader's view of a block: leaves' cells and task boxes, containers and their sharing, and leafless containers in order. Anything else refuses.
    const model = (tokens, split = false) => {
      const path = [], found = [], empty = [];
      let id = 0, cut = null;
      for (const token of tokens) {
        if (!allowedBlocks.test(token.type)) return null;
        if (token.type === 'inline') {
          let list = token.children || [], task = '';
          // A task item's box is its item's shell, like the bullet; the words start after it.
          if (path.at(-2)?.type === 'list_item_open' && list[0]?.type === 'html_inline' &&
              /^<input class="task-list-item-checkbox"/.test(list[0].content)) {
            task = /\bchecked=/.test(list[0].content) ? 'x' : ' ';
            list = list.slice(1);
            if (list[0]?.type === 'text') list = [{...list[0], content: list[0].content.replace(/^[ \t]+/, '')}, ...list.slice(1)];
          }
          const own = cells(list, split);
          if (!own) return null;
          if (own.cut >= 0) { if (cut) return null; cut = {leaf: found.length, at: own.cut}; }
          for (const row of path) row.held = true;
          found.push({task, rows: own.rows, path: path.map(row => ({...row}))});
        } else if (token.nesting === 1) {
          const row = {type: token.type, tag: token.tag, markup: token.markup, id: id++, held: false};
          if (token.type === 'ordered_list_open') row.next = Number(token.attrGet('start') ?? 1);
          if (token.type === 'list_item_open' && path.at(-1)?.type === 'ordered_list_open') row.number = path.at(-1).next++;
          if (token.type === 'paragraph_open') row.hidden = !!token.hidden;
          path.push(row);
        } else if (token.nesting === -1) {
          const row = path.pop();
          if (!row?.held) empty.push([row?.type, row?.tag, row?.markup, row?.number]);
        }
      }
      return {leaves: found, cut, empty: JSON.stringify(empty)};
    };
    const expected = model(marked, true);
    if (!expected?.cut || expected.cut.leaf !== leaf) return null;
    const whole = expected.leaves, cutLeaf = whole[leaf];
    let left = cutLeaf.rows.slice(0, expected.cut.at), right = cutLeaf.rows.slice(expected.cut.at);
    if (!code) {
      while (left.length && /^[ \t]$/.test(left.at(-1).text)) left.pop();
      while (right.length && /^[ \t]$/.test(right[0].text)) right.shift();
    }
    const leftEmpty = !left.some(row => row.text.trim()), rightEmpty = !right.some(row => row.text.trim());
    // A rendered edge can sit inside the source's opening or closing mark or link syntax: keep
    // the original block whole rather than manufacturing an empty marked paragraph.
    if (leftEmpty && !leaf) return Object.freeze({source, point, before: '', after: source});
    if (rightEmpty && leaf === whole.length - 1) return Object.freeze({source, point, before: source, after: ''});
    // Two halves are proved when each reads exactly as its part of the block did -- the same
    // leaves, cells, boxes, containers, numbers and tightness, the same neighbours sharing each
    // container -- and together they keep the block's empty containers, in order.
    const describe = row => JSON.stringify([row.task, row.path.map(box => [box.type, box.tag, box.markup, box.number, box.hidden])]);
    const shared = (a, b) => a.path.map((box, depth) => b.path[depth]?.id === box.id).join();
    const reads = (half, want) => half.leaves.length === want.length && half.leaves.every((got, index) =>
      describe(got) === describe(want[index]) && JSON.stringify(got.rows) === JSON.stringify(want[index].rows) &&
      (!index || shared(half.leaves[index - 1], got) === shared(want[index - 1], want[index])));
    const fits = (before, after, wantBefore, wantAfter) => {
      const a = model(parse(before)), b = model(parse(after));
      return !!a && !!b && reads(a, wantBefore) && reads(b, wantAfter) &&
        JSON.stringify([...JSON.parse(a.empty), ...JSON.parse(b.empty)]) === expected.empty;
    };
    if (leftEmpty || rightEmpty) {
      // Between two leaves (the caret at one's start or at another's end): the block splits at
      // the later leaf's first line, every byte kept; a blank quote line stays with the words above.
      const next = leftEmpty ? leaf : leaf + 1;
      const line = original.filter((token, index) => original[index + 1]?.type === 'inline')[next]?.map?.[0];
      const starts = [0];
      for (const match of source.matchAll(/\r\n?|\n/g)) starts.push(match.index + match[0].length);
      const cutAt = starts[line];
      if (!line || !Number.isSafeInteger(cutAt)) return null;
      const before = source.slice(0, cutAt).replace(/(?:\r\n?|\n)(?:[ \t]*(?:\r\n?|\n))*$/, ''), after = source.slice(cutAt);
      return before.trim() && after.trim() && fits(before, after, whole.slice(0, next), whole.slice(next))
        ? Object.freeze({source, point, before, after}) : null;
    }
    // Inside a leaf: the words before keep their raw source and close the open marks; the words
    // after reopen them under the leaf's own shell -- its quote markers, heading hashes, or its
    // item's bullet, number and task box -- so the right half is a new item of the same list.
    let prefix = '', tail = '';
    const leads = [];
    if (single) {
      const firstLine = source.split(/\r\n?|\n/, 1)[0];
      const quote = /^(?: {0,3}>[ \t]?)+/.exec(firstLine)?.[0] || '';
      const heading = original.find(token => token.type === 'heading_open');
      prefix = quote;
      if (heading) {
        if (/^#{1,6}$/.test(heading.markup)) {
          const atx = /^ {0,3}#{1,6}[ \t]+/.exec(firstLine.slice(quote.length));
          if (!atx) return null;
          prefix += atx[0];
          tail = /[ \t]+#+[ \t]*$/.exec(firstLine)?.[0] || '';
        } else {
          const underline = /(?:\r\n?|\n)[^\r\n]*$/.exec(source);
          if (!underline || !/^[ \t]*(?:=+|-+)[ \t]*$/.test(underline[0].replace(/^(?:\r\n?|\n)/, '').slice(quote.length))) return null;
          tail = underline[0];
        }
      }
      leads.push(prefix);
    } else {
      // A leaf's shell is its first line up to its words (an ATX heading's closing hashes its tail); a leaf that does not start its item fails.
      const index = marked.indexOf(inline), opener = marked[index - 1];
      const atx = opener?.type === 'heading_open' && /^#{1,6}$/.test(opener.markup);
      if (!opener?.map || !(opener.type === 'paragraph_open' || atx)) return null;
      let head = (source.split(/\r\n?|\n/)[opener.map[0]] || '').replace(/[ \t]+$/, '');
      if (atx) { tail = /[ \t]+#+$/.exec(head)?.[0] || ''; head = head.slice(0, head.length - tail.length); }
      const words = original[index].content.split('\n', 1)[0].replace(/^[ \t]+|[ \t]+$/g, '');
      if (!words || !head.endsWith(words)) return null;
      prefix = head.slice(0, head.length - words.length);
      leads.push(prefix);
      // A list numbered 1. 1. 1. reads 1, 2, 3: the new item carries the number its words had.
      const item = cutLeaf.path.findLast(box => box.type === 'list_item_open');
      const digits = /(\d{1,9})([.)][ \t]+(?:\[[ xX]\][ \t]+)?)$/.exec(prefix);
      if (item?.number !== undefined && digits && Number(digits[1]) !== item.number) leads.push(prefix.slice(0, digits.index) + item.number + digits[2]);
    }
    const close = pairs.slice().reverse().map(row => row.close).join('');
    const open = pairs.map(row => row.open).join('');
    let start = point, end = point;
    if (!code) {
      while (start > 0 && /[ \t]/.test(source[start - 1])) start--;
      while (end < source.length && /[ \t]/.test(source[end])) end++;
    }
    const wantBefore = [...whole.slice(0, leaf), {...cutLeaf, rows: left}];
    const wantAfter = [{...cutLeaf, rows: right}, ...whole.slice(leaf + 1)];
    let remainder = source.slice(end);
    if (link && link.close !== link.suffix) {
      const at = link.labelEnd - end;
      if (at < 0) return null;
      remainder = remainder.slice(0, at) + link.close + remainder.slice(at + link.suffix.length);
    }
    // Code padding belongs to syntax. Keep the delimiter spelling and try padding only at
    // the four delimiter seams; the parser proof ensures literal code spaces stay literal.
    const padding = code ? ['', ' '] : [''];
    for (const lead of leads) for (const leftOuter of padding) for (const rightOuter of padding)
      for (const leftPad of padding) for (const rightPad of padding) {
      const leftSource = code ? source.slice(0, code.start) + leftOuter + source.slice(code.start, start) : source.slice(0, start);
      const rightSource = code ? remainder.slice(0, code.end - end) + rightOuter + remainder.slice(code.end - end) : remainder;
      const before = leftSource + leftPad + close + tail;
      const after = lead + open + rightPad + rightSource;
      if (fits(before, after, wantBefore, wantAfter)) return Object.freeze({source, point, before, after});
    }
    return null;
  }
  // A drawing, or a wrapped picture, is a block of its own: it lands after the caret's block, which keeps its bytes.
  function ownBlock(raw, normalized) {
    const layout = /<!--md-layout:v1[ \t][^\r\n]*?-->/.exec(raw);
    if (layout && globalThis.RapierMarkdownLayout.parseLayout(layout[0])?.wrap) return true;
    const asset = normalized && normalized.asset;
    return asset?.codec === 'image/svg+xml' && !!asset.bytes &&
      new TextDecoder().decode(asset.bytes).includes('<metadata id="rapier-draw">');
  }
  async function insert(normalized, raw, target, stamp) {
    if (!_rapierMutationStampIsCurrent(stamp) || _rapierUserMutationBlocked()) return false;
    const source = _rapierSourceText(), spans = _rapierExcerptCanonicalBlockSpans();
    if (normalized.asset) {
      const existing = [...indexForSource(source).assets.values()].find(row => row.url === normalized.asset.url && row.title === (normalized.asset.title || ''));
      if (existing) {
        const token = '[' + normalized.asset.label + ']', at = raw.lastIndexOf(token);
        if (at < 0) return false;
        raw = raw.slice(0, at) + '[' + existing.label + ']' + raw.slice(at + token.length);
      }
    }
    const record = target.replaceImage && _rapierImageRecord(target.replaceImage.blockId, target.replaceImage.imageIndex);
    let start, end, text = raw;
    const eol = rapier.document.sourceNewline || '\n';
    // Blank lines on the sides of a picture landing between blocks, never doubled.
    const betweenBlocks = () => {
      const before = source.slice(0, start), after = source.slice(end);
      text = (before && !/\n\r?\n$/.test(before) ? (before.endsWith('\n') ? eol : eol + eol) : '') + text +
        (after && !/^\r?\n\r?\n/.test(after) ? (after.startsWith('\n') || after.startsWith('\r\n') ? eol : eol + eol) : '');
    };
    if (target.sourceSplit && !target.replaceImage) {
      const split = target.sourceSplit;
      start = split.start; end = split.end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end > source.length ||
          end < start || source.slice(start, end) !== split.source) return false;
      if (ownBlock(raw, normalized)) {
        start = end;
        betweenBlocks();
      } else {
        const plan = caretSplit(split.source, split.point);
        if (!plan || plan.before !== split.before || plan.after !== split.after) return false;
        text = [plan.before, raw, plan.after].filter(part => part !== '').join(eol + eol);
      }
    } else if (target.replaceImage) {
      if (!record) return false;
      const span = spans.get(record.block.id);
      if (!span) return false;
      start = span.start + record.image.start; end = span.start + record.image.end;
      text += record.image.placementSource || '';
      const imported = _rapierImageAltSourceParts(record.image.altSource);
      if (imported.width) {
        const occurrence = globalThis.RapierMarkdownLayout.layoutTargets(record.block.raw, md, _rapierMarkdownEnvironment())
          .find(row => row.start <= record.image.start && row.end >= record.image.tokenEnd);
        const column = _rapierImageColumnWidth(_rapierImageRuntime.image);
        const bareImage = occurrence && !record.block.raw.slice(occurrence.start, record.image.start).trim() &&
          !record.block.raw.slice(record.image.tokenEnd, occurrence.marker?.start ?? occurrence.insert).trim();
        if (occurrence?.imageOnly && !occurrence.reason && column && bareImage) {
          const layout = {...occurrence.layout};
          if (layout.width == null) layout.width = Math.min(100, Math.max(.01, Math.round(imported.width / column * 10000) / 100));
          text = raw + ' ' + globalThis.RapierMarkdownLayout.formatLayout(layout);
        } else {
          // Preserve an imported width when its surrounding source cannot carry
          // a layout annotation; new image occurrences never use this syntax.
          let close = raw.indexOf(']');
          while (close >= 0 && _rapierSourceCharEscaped(raw, close)) close = raw.indexOf(']', close + 1);
          if (close < 0) return false;
          text = raw.slice(0, close) + '|' + imported.width + raw.slice(close) + (record.image.placementSource || '');
        }
      }
    } else {
      if (target.sourceSelection) {
        start = target.sourceSelection.start; end = target.sourceSelection.end;
      } else {
        const span = spans.get(target.afterId);
        if (target.afterId != null && !span) return false;
        start = end = span ? span.end : (indexForSource(source).appendixStart ?? source.length);
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > source.length) return false;
      betweenBlocks();
    }
    const prospective = source.slice(0, start) + text + source.slice(end);
    const appended = normalized.asset ? await assets.appendAsset(prospective, normalized.asset) : {source: prospective};
    if (!_rapierMutationStampIsCurrent(stamp) || source !== _rapierSourceText()) return false;
    const suffix = appended.source.slice(prospective.length);
    const splices = [{pos:start, removed:source.slice(start,end), inserted:text}];
    // A redrawn picture whose old definition only it used rewrites that line in place; appending left a blank line on each re-edit.
    const inPlace = target.replaceImage && suffix ? definitionInPlace(source, splices[0], prospective, suffix) : null;
    if (inPlace) splices.splice(0, 1, ...inPlace);
    else if (suffix) {
      if (end === source.length) splices[0].inserted += suffix;
      else splices.unshift({pos:source.length, removed:'', inserted:suffix});
    }
    if (new Blob([appended.source]).size > RapierTextCodec.maxDocumentBytes)
      throw new Error('That image exceeds the document size limit');
    const row = normalized.asset && (await prepare(normalized)).presentation;
    if (!_rapierMutationStampIsCurrent(stamp) || source !== _rapierSourceText()) return false;
    primed = row || null;
    // Reveal what lands; a gesture's target.viewport, when given, owns where the page lands.
    const revealAt = text.indexOf(raw);
    const viewport = target.viewport || _rapierCaptureEditorViewport(null, true, false, start + (revealAt >= 0 ? revealAt + 1 : 1), start - 1);
    try { return await _rapierCommitSourceProjection(splices, 'document.embed-image', null, null, viewport); }
    finally {
      primed = null;
      try { schedule(); } catch (error) { console.warn('[rapier] image presentation', error); }
    }
  }
  // Splices latest first, or null when the old definition is shared, absent or not one plain line.
  function definitionInPlace(source, occurrence, prospective, suffix) {
    const orphaned = assets.retireDeletedImageDefinitions(source, prospective, [occurrence]);
    if (orphaned.length !== 1) return null;
    const line = suffix.replace(/^(?:\r\n?|\n)+/, '').replace(/(?:\r\n?|\n)+$/, '');
    if (!line || /[\r\n]/.test(line)) return null;
    const grown = occurrence.inserted.length - occurrence.removed.length, {pos: at, removed} = orphaned[0];
    const pos = at >= occurrence.pos + occurrence.inserted.length ? at - grown : at + removed.length <= occurrence.pos ? at : -1;
    if (pos < 0 || source.slice(pos, pos + removed.length) !== removed) return null;
    const definition = {pos, removed, inserted: line};
    return pos > occurrence.pos ? [definition, occurrence] : [occurrence, definition];
  }
  // Witness introspection of the image caches (I04).
  function stats() {
    const bytesOf = map => [...map.values()].reduce((sum, item) => sum + (item.cost || 0), 0);
    return {
      cache: cache.size, cacheBytes: bytesOf(cache),
      darkened: darkened.size, darkenedBytes: bytesOf(darkened), darkenedBudget: DARKENED_BUDGET,
      portable: portableCache.size, portableBytes: bytesOf(portableCache), portableBudget: PORTABLE_BUDGET,
      dimensions: dimensions.size, pending: pending.size,
    };
  }
  // R86g law 9: the asset's own bytes from the registry, never the <img> src (a display stand-in for JPEG XL). SVG decoded, never renormalised.
  async function downloadOriginal(record) {
    const image = _rapierImageRuntime.image;
    const id = image?.getAttribute('data-rapier-asset') || image?.getAttribute('data-rapier-image-url') ||
      record.image.reference || record.image.destination || '';
    const row = recordFor(id, documentIndex().index);
    if (!row) { showToast('This picture is not stored in the document, so it cannot be downloaded', 'info'); return; }
    let bytes;
    try { bytes = assets.decodeDataImage(row.url); }
    catch (error) { showToast('Picture could not be read: ' + String(error.message || error), 'error'); return; }
    const codec = row.codec || assets.dataImage(row.url)?.codec || '';
    const ext = codec === 'image/jxl' ? 'jxl' : codec === 'image/svg+xml' ? 'svg' : codec === 'image/jpeg' ? 'jpg' :
      codec === 'image/webp' ? 'webp' : codec === 'image/gif' ? 'gif' : 'png';
    // Untitled downloads: document name plus the picture's place, so two differ.
    let position = 0;
    for (const block of rapier.document.blocks) {
      if (block.id === record.block.id) { position += record.imageIndex; break; }
      position += _rapierScanMarkdownImages(block.raw).length;
    }
    const title = String(record.image.title || '').trim();
    const base = title || (String(rapier.document.filename || '').replace(/\.[a-z0-9]+$/i, '') || 'document') + ' ' + (position + 1);
    await _download(new Blob([bytes], {type: codec}), base + '.' + ext);
  }
  schedule();
  // R86i law 3: what the editor would show (re-inked SVG or the JPEG XL notice), never bytes this browser cannot display.
  async function present(source, id) {
    const row = await rasterRecord(source, id, indexForSource(source));
    return {url: presentUrl(row), width: row.width, height: row.height, type: row.type, signature: row.signature, undisplayable: !!row.undisplayable, damaged: !!row.damaged};
  }
  return Object.freeze({codec, imageHtml, materialize, present, prepare, insert, caretSplit, portable, clipboard, nativeImage, schedule, retheme, stats, inkForPaper, downloadOriginal, jxlDisplayable, whenJxlDisplayKnown, index: () => documentIndex()});
})();
globalThis.RapierEmbeddedImages = _rapierEmbeddedImages;
