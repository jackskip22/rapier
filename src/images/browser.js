const _rapierEmbeddedImages = (() => {
  const assets = globalThis.RapierImageAssets;
  const cache = new Map(), pending = new Map(), dimensions = new Map(), presented = new WeakMap(), watched = new Set(), revealing = new Map();
  const presentationURLs = new Set();
  let worker = null, workerUrl = '', queue = Promise.resolve(), rasterQueue = Promise.resolve(), serial = 0, index = null;
  let rootId = '', authority = '', currentSource = '', frame = 0, epoch = 0, clock = 0;
  let active = null, primed = null, idleTimer = 0, suspended = false, workerOperation = '', warned = false, foregroundCodecs = 0;
  const JXL_PROBE = '/woAELASCAgQAJwCSxibnHGEAziAAzggSsA5BQEAIESACBABIkDk/5F7+h5aZ1dVVVUlSZIQUHd3d3d3////v1VvZmZmBv7fv+e/h8acc661z71JkiQEVFVVVVVV////z72vu7u7G/7fv+e/h8acc661z71JkiQEVFVVVVVV////z72vu7u7G/7fv+e/h8acc661z71JkiQEVFVVVVVV////z72vu7u7+wIiAHhAelzgYWg=';
  let jxlReadable = false, jxlProbeSettled = false, damagedWarned = false;
  const here = () => globalThis.RapierPlatform?.environment.here || 'This browser';
  const jxlRemedy = () => globalThis.RapierPlatform?.environment.updateEngine || 'Use a browser that supports JPEG XL.';
  const jxlProbed = (async () => {
    try {
      const image = new Image();
      await new Promise((ok, no) => { image.onload = ok; image.onerror = () => no(new Error('no decoder')); image.src = 'data:image/jxl;base64,' + JXL_PROBE; });
      jxlReadable = image.naturalWidth === 1 && image.naturalHeight === 1;
    } catch (_) { jxlReadable = false; }
    jxlProbeSettled = true;
  })();
  function jxlDisplayable() { return jxlReadable || window.__rapierJxlReadableTest === true; }
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
    visibility?.disconnect(); seen?.disconnect(); watched.clear();
    clearPresentations(); pending.clear(); dimensions.clear(); portableCache.clear();
    globalThis.RapierImageInspection.close();
    primed = null; index = null; currentSource = ''; rootId = ''; authority = next; warned = false; damagedWarned = false;
  }
  function assertCurrent(stamp, identity) {
    if (suspended || stamp !== epoch || identity !== rapier.identity.authority) throw cancelled();
  }
  function codec(operation, input, {signal, progress, optional = false} = {}) {
    if (!optional) interruptIdleFinishes();
    synchronizeScope();
    if (!optional) foregroundCodecs++;
    const stamp = epoch, identity = authority;
    const run = async () => {
      signal?.throwIfAborted();
      assertCurrent(stamp, identity);
      if (worker && workerOperation !== operation) releaseWorker();
      let code = '';
      if (!worker) {
        await _rapierWhenRuntime('rapier-jxl-worker');
        signal?.throwIfAborted();
        assertCurrent(stamp, identity);
        const spans = await _rapierInflateVendor('rapier-jxl-worker');
        signal?.throwIfAborted();
        assertCurrent(stamp, identity);
        code = spans.map(row => row.source).join('\n');
      }
      return new Promise((resolve, reject) => {
      let instance = null, timer = 0, settled = false;
      const abort = () => finish(signal.reason || new DOMException('Image processing canceled', 'AbortError'));
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
        const megapixels = Math.ceil((input.width * input.height || 0) / 1e6);
        const watch = () => { clearTimeout(timer); timer = setTimeout(() => finish(new Error('Image processing took too long')), 45000 + megapixels * 15000); };
        watch();
        instance.onmessage = event => {
          if (event.data?.id !== id) return;
          try { assertCurrent(stamp, identity); } catch (error) { finish(error); return; }
          if (typeof event.data.progress === 'number') { if (!settled) watch(); try { progress?.(event.data.progress); } catch (_) {} return; }
          if (event.data.ok) finish(null, event.data);
          else finish(Object.assign(new Error(event.data.error?.message || 'JPEG XL processing failed'), {code: event.data.error?.code}));
        };
        instance.onerror = event => { event.preventDefault(); finish(new Error(event.message || 'Image worker failed')); };
        instance.onmessageerror = () => finish(new Error('Image worker returned an unreadable result'));
        const data = input.data ?? input.bytes;
        const transfer = data instanceof ArrayBuffer ? data : data?.buffer;
        instance.postMessage({...input, id, operation, ...(typeof progress === 'function' ? {progress: true} : {})}, transfer instanceof ArrayBuffer ? [transfer] : []);
      } catch (error) { finish(error); }
      });
    };
    const job = queue.then(run, run);
    queue = job.catch(() => {});
    return optional ? job : job.finally(() => { foregroundCodecs--; });
  }
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
      index = globalThis.RapierSourceAssets?.imageIndex(currentSource) || blockwiseIndex(currentSource) || assets.documentAssets(currentSource); rootId = nextRoot;
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
      image.onerror = () => finish(new Error(here() + ' could not display the image natively'));
      image.src = url;
    });
  }
  async function jxlDamaged(bytes) {
    const whole = await globalThis.RapierImageInspection?.jxlWhole?.(bytes);
    return whole == null ? null : !whole;
  }
  async function validatePaintRaster(url, {signal} = {}) {
    const {bytes, codec} = assets.decodeDataImageBytes(url), size = assets.imageDimensions(bytes, codec);
    const nativeRead = async () => {
      if (codec === 'image/jxl' && !await whenJxlDisplayKnown()) {
        throw Object.assign(new Error(here() + ' cannot fully decode this painting raster.'), {code: 'paint_raster_decoder_unavailable'});
      }
      let image;
      try {
        image = await nativeImage(url, {signal});
        if (image.naturalWidth !== size.width || image.naturalHeight !== size.height) throw new Error('Painting raster dimensions changed during decoding');
        if (codec === 'image/jxl') {
          const damaged = await jxlDamaged(bytes);
          if (damaged == null) throw Object.assign(new Error(here() + ' cannot verify a complete JPEG XL frame.'), {code: 'paint_raster_decoder_unavailable'});
          if (damaged) throw new Error('Damaged painting JPEG XL');
        }
        signal?.throwIfAborted();
        return true;
      } finally { image?.removeAttribute('src'); }
    };
    return globalThis.RapierImageInspection.validatePaintRaster(url, {signal, nativeRead});
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
    id = _rapierEmbedAssetSource(id) || id;
    const direct = assets.dataImage(id);
    if (!direct) id = assets.normalizeLabel(id);
    const record = direct ? {id, url: id, ...direct, status: 'unverified'} : parsed.assets.get(assets.normalizeLabel(id));
    if (!record || record.status !== 'unverified') {
      if (!direct && !record && !assets.referenceOccurs(source, id)) throw Object.assign(new Error('Embedded image reference retired'), {code: 'IMAGE_VANISHED'});
      throw new Error('Embedded image is missing or exceeds the document image limit');
    }
    const signature = record.url;
    const existing = cache.get(signature);
    if (existing && (!darkPaper() || existing.type !== 'image/svg+xml' || darkened.has(signature))) { existing.used = ++clock; return existing; }
    const shared = pending.get(signature);
    if (shared && !shared.controller.signal.aborted) return joinRaster(shared, signal);
    const request = {controller: new AbortController(), waiters: new Set(), settled: false, job: null};
    const options = {signal: request.controller.signal};
    const capturedAuthority = rapier.identity.authority, stamp = epoch;
    const run = async () => {
      options.signal.throwIfAborted();
      assertCurrent(stamp, capturedAuthority);
      if (!direct && source.slice(record.start, record.end) !== record.source) throw new Error('image_source_changed');
      let prepared = await globalThis.RapierImageInspection.prepareImage(record.url, {signal: options.signal, dark: darkPaper(), paperInk: paperInk()});
      if (prepared.type === 'image/svg+xml' && darkPaper() && !prepared.darkReady)
        prepared = await globalThis.RapierImageInspection.prepareImage(record.url, {signal: options.signal, dark: true, paperInk: paperInk()});
      assertCurrent(stamp, capturedAuthority);
      const dimensions = {width: prepared.width, height: prepared.height};
      const containerDamaged = prepared.containerDamaged;
      let url = prepared.url || record.url, type = prepared.type;
      if (type !== record.codec) throw new Error('image_codec_invalid');
      const displayUrl = presentationURL(prepared.blob);
      let retained = false;
      try {
      let native, undisplayable = false;
      let damaged = false;
      try {
        if (containerDamaged) throw new Error('JPEG XL container is unreadable');
        const image = await nativeImage(displayUrl, options);
        native = {width: image.naturalWidth, height: image.naturalHeight};
        image.removeAttribute('src');
        if (prepared.damaged) native = null;
      } catch (_) { options.signal.throwIfAborted(); }
      assertCurrent(stamp, capturedAuthority);
      if (native) {
        if (native.width !== dimensions.width || native.height !== dimensions.height) throw new Error('Embedded image dimensions do not match its record');
      } else {
        if (record.codec === 'image/jxl') {
          await jxlProbed;
          damaged = containerDamaged || prepared.damaged === true || !prepared.playbackUnavailable && jxlDisplayable();
          url = noticeUrl(dimensions.width, dimensions.height, damaged);
          native = {width: dimensions.width, height: dimensions.height};
          undisplayable = true;
        } else throw new Error('This image could not be displayed');
      }
      if (damaged) notifyDamaged();
      assertCurrent(stamp, capturedAuthority);
      const row = {url, displayUrl: undisplayable ? url : displayUrl, width: dimensions.width, height: dimensions.height, type, signature, used: ++clock,
        animated: prepared.animated, recipe: prepared.recipe, recipeError: prepared.recipeError, resources: prepared.resources, undisplayable, damaged,
        cost: (url === signature ? 0 : url.length) + signature.length + prepared.blob.size};
      const displaced = cache.get(signature);
      if (displaced) releasePresentation(displaced);
      cache.delete(signature);
      let total = [...cache.values()].reduce((sum, item) => sum + item.cost, 0);
      for (const [key, item] of [...cache.entries()].sort((a,b) => a[1].used-b[1].used)) {
        if (total + row.cost <= 32 * 1024 * 1024 && cache.size < 16) break;
        total -= item.cost; releasePresentation(item); cache.delete(key);
      }
      cache.set(signature, row);
      if (type === 'image/svg+xml' && prepared.darkReady) rememberDark(row, prepared.darkBlob);
      retained = !undisplayable;
      return row;
      } finally { if (!retained) releaseURL(displayUrl); }
    };
    request.job = rasterQueue.then(run, run).finally(() => {
      request.settled = true;
      if (pending.get(signature) === request) pending.delete(signature);
    });
    rasterQueue = request.job.catch(() => {});
    pending.set(signature, request);
    return joinRaster(request, signal);
  }
  function noticeUrl(width, height, damaged = false) {
    const w = Math.max(1, width | 0), h = Math.max(1, height | 0);
    const size = Math.max(9, Math.min(w / 18, h / 7, 22)), pad = size * 0.9;
    const lines = damaged ? ['THIS JPEG XL PICTURE IS', 'DAMAGED. ITS BYTES ARE', 'KEPT, UNCHANGED.'] : [here().toUpperCase() + ' CANNOT SHOW', 'THIS JPEG XL PICTURE.', 'PICTURE KEPT UNCHANGED.'];
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
  const seen = typeof IntersectionObserver === 'function' ? new IntersectionObserver(rows => {
    for (const row of rows) if (row.isIntersecting) {
      seen.unobserve(row.target);
      if (host.contains(row.target) && row.target.isConnected) notifyStale(row.target._rapierJxlNotice);
    }
  }) : null;
  function noticeWhenSeen(image, signature) {
    if (warned) return;
    image._rapierJxlNotice = signature;
    if (seen) seen.observe(image); else notifyStale(signature);
  }
  function notifyStale(signature) {
    if (warned) return;
    warned = true;
    seen?.disconnect();
    let mark = 2166136261;
    for (let at = 0, text = String(signature || ''); at < text.length; at++) mark = Math.imul(mark ^ text.charCodeAt(at), 16777619);
    mark = (mark >>> 0).toString(36);
    const told = String(RapierPreferences.read('jxlNoticeShown') || '').split(' ').filter(Boolean);
    if (told.includes(mark)) return;
    try { RapierPreferences.write('jxlNoticeShown', [...told.slice(-31), mark].join(' ')); } catch (_) {}
    showToast(here() + ' cannot show JPEG XL pictures. ' + jxlRemedy() + ' Your pictures are unchanged.', 'info');
  }
  function notifyDamaged() {
    if (damagedWarned) return;
    damagedWarned = true;
    showToast('A JPEG XL picture in this document is damaged and cannot be shown. Its bytes are kept unchanged.', 'info');
  }

  async function prepare(normalized, {signal} = {}) {
    signal?.throwIfAborted();
    synchronizeScope();
    const asset = normalized.asset;
    if (!asset || normalized.presentation?.signature === asset.url) return normalized;
    const presentation = await rasterRecord(asset.block, asset.id, assets.documentAssets(asset.block), {signal});
    return {...normalized, presentation};
  }
  async function portable(source, id, {png = false} = {}) {
    const row = await rasterRecord(source, id, indexForSource(source));
    if (row.damaged) throw Object.assign(new Error('This JPEG XL picture is damaged and cannot be converted. Its bytes are kept unchanged.'), {code: 'IMAGE_DAMAGED'});
    if (!png && !row.animated && assets.dataImage(row.signature)?.codec === 'image/jxl')
      return smallestPortable({...row, type: 'image/jxl', url: row.signature});
    if (row.undisplayable) throw Object.assign(new Error(here() + ' cannot read JPEG XL, so this picture cannot be converted. ' + jxlRemedy() + ' The picture is unchanged.'), {code: 'IMAGE_JXL_UNREADABLE'});
    const nested = nestedJxl(row);
    if (nested) return portableSvg(row, nested);
    if (row.type === 'image/png' || !png && row.type !== 'image/jxl') return row;
    const image = await nativeImage(row.url);
    try {
      return {...row, type: 'image/png', url: await canvasUrl(context => context.drawImage(image, 0, 0, row.width, row.height), row.width, row.height)};
    } finally { image.removeAttribute('src'); }
  }
  const NESTED_JXL_RE = /(\b(?:xlink:)?href\s*=\s*)(["'])(data:image\/jxl;base64,[A-Za-z0-9+/=]+)\2/g;
  function nestedJxl(row) {
    if (row.type !== 'image/svg+xml') return null;
    let text;
    try { text = new TextDecoder().decode(assets.decodeDataImage(row.url)); } catch (_) { return null; }
    return text.includes('data:image/jxl;base64,') ? text : null;
  }
  async function portableSvg(row, text) {
    await jxlProbed;
    if (!jxlDisplayable()) throw Object.assign(new Error(here() + ' cannot read JPEG XL, so the paint inside this drawing cannot be converted. ' + jxlRemedy() + ' The drawing is unchanged.'), {code: 'IMAGE_JXL_UNREADABLE'});
    const converted = new Map();
    for (const match of text.matchAll(NESTED_JXL_RE)) {
      const url = match[3];
      if (converted.has(url)) continue;
      let exact = null;
      try { exact = await globalThis.RapierImageInspection.portablePaintPNG(url); }
      catch (error) {
        if (error?.name === 'AbortError') throw error;
        if (error?.code === 'paint_raster_damaged')
          throw Object.assign(new Error('The paint inside this drawing is damaged and cannot be converted. Its bytes are kept unchanged.'), {code: 'IMAGE_DAMAGED'});
      }
      if (!exact) throw Object.assign(new Error(here() + ' cannot read the paint inside this drawing exactly, so it cannot be converted. The drawing is unchanged.'), {code: 'IMAGE_JXL_UNREADABLE'});
      converted.set(url, exact);
    }
    const out = text.replace(NESTED_JXL_RE, (whole, lead, quote, url) => lead + quote + (converted.get(url) || url) + quote);
    return {...row, url: 'data:image/svg+xml;base64,' + RapierBundleIO.toBase64(new TextEncoder().encode(out)), nested: converted.size};
  }
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
    const size = assets.imagePlaceholderDimensions(url);
    const row = {...size, signature: url};
    if (dimensions.size >= assets.IMAGE_LIMITS.assets) dimensions.delete(dimensions.keys().next().value);
    dimensions.set(url, row);
    return row;
  }
  const placeholder = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
  function imageHtml(id, alt, title, size, layout, rawAlt, source, url, automatic = true) {
    const local = _rapierEmbedAssetSource(url) || url;
    const esc = _rapierRenderModule('render-sanitize').escapeRapierHtmlText, geometry = imageGeometry(local);
    const automaticAlt = typeof rawAlt === 'string' && alt === '' && /^data:image\/svg\+xml[;,]/i.test(local || '');
    if (automaticAlt && geometry.drawingAlt === undefined) {
      geometry.drawingAlt = assets.drawingImageAlt(local);
      if (geometry.cost != null) geometry.cost += (geometry.drawingAlt?.length || 0) * 2;
    }
    const shownAlt = automaticAlt && geometry.drawingAlt != null ? geometry.drawingAlt : alt;
    const ready = geometry.url && geometry.signature === local && (!darkPaper() || geometry.type !== 'image/svg+xml' || darkened.has(local));
    const attributes = _rapierRenderModule('render-markdown')._rapierImageSizeAttributes(size, layout, geometry, automatic);
    return '<img data-rapier-markdown-image="" ' + (id ? 'data-rapier-asset="' + esc(id) : 'data-rapier-image-url="' + esc(url)) +
      '" src="' + esc(ready ? presentUrl(geometry) : placeholder) + '" alt="' + esc(shownAlt) + '" decoding="async"' +
      (ready ? ' data-rapier-asset-state="ready"' + (geometry.animated ? ' data-rapier-animation="' + esc(geometry.signature) + '"' : '') : '') +
      (source && source.length <= 4096 ? ' data-rapier-image-source="' + esc(encodeURIComponent(source)) + '"' : '') +
      (title ? ' title="' + esc(title) + '"' : '') +
      (layout ? ' data-rapier-image-layout="' + esc(encodeURIComponent(layout)) + '"' : '') +
      (shownAlt !== alt || size && !globalThis.RapierMarkdownLayout.parseLayout(layout || '')?.width ?
        ' data-rapier-image-alt-source="' + esc(rawAlt) + '"' : '') +
      attributes + '>';
  }
  const imageKey = image => image.getAttribute('data-rapier-asset') || image.getAttribute('data-rapier-image-url');
  const recordFor = (id, index) => {
    const local = _rapierEmbedAssetSource(id) || id;
    return assets.dataImage(local) ? {url: local} : index.assets.get(assets.normalizeLabel(id));
  };
  const darkPaper = () => RapierPreferences.read('invertImageAlpha') && !document.body.classList.contains('light');
  const darkened = new Map();
  let presentationRevision = 0;
  const DARKENED_BUDGET = 8 * 1024 * 1024;
  const paperInk = () => {
    const ink = getComputedStyle(document.body).getPropertyValue('--color-text').trim();
    return /^#[0-9a-f]{6}$/i.test(ink) ? ink.toLowerCase() : null;
  };
  function inkForPaper(text) {
    return globalThis.RapierImageInspection.inkForPaper(text, {dark: darkPaper(), paperInk: paperInk()});
  }
  function presentationURL(blob) {
    const url = URL.createObjectURL(blob); presentationURLs.add(url); return url;
  }
  function releaseURL(url) {
    if (presentationURLs.delete(url)) URL.revokeObjectURL(url);
  }
  function releaseDark(key) {
    const entry = darkened.get(key);
    if (entry?.owned) releaseURL(entry.url);
    darkened.delete(key);
  }
  function releasePresentation(row) {
    releaseURL(row.displayUrl);
    releaseDark(row.signature);
  }
  function clearPresentations() {
    presentationRevision++;
    for (const row of cache.values()) releasePresentation(row);
    cache.clear();
    for (const key of darkened.keys()) releaseDark(key);
    for (const url of presentationURLs) releaseURL(url);
  }
  function rememberDark(row, blob) {
    releaseDark(row.signature);
    const entry = {url: blob ? presentationURL(blob) : row.displayUrl, owned: !!blob,
      used: ++clock, cost: blob?.size || 0};
    let total = entry.cost;
    for (const item of darkened.values()) total += item.cost;
    for (const [key, item] of [...darkened.entries()].sort((a, b) => a[1].used - b[1].used)) {
      if (total <= DARKENED_BUDGET && darkened.size < 32) break;
      total -= item.cost; releaseDark(key);
    }
    darkened.set(row.signature, entry);
  }
  function presentUrl(row) {
    const inked = darkPaper() && row.type === 'image/svg+xml' && darkened.get(row.signature);
    if (inked) { inked.used = ++clock; return inked.url; }
    return row.displayUrl || row.url;
  }
  function retheme() {
    const dark = darkPaper(), revision = ++presentationRevision;
    for (const image of host.querySelectorAll('img[data-rapier-asset],img[data-rapier-image-url]')) {
      const ticket = presented.get(image);
      if (ticket && ticket.dark !== dark && /^data:image\/svg\+xml/i.test(ticket.signature || '')) { presented.delete(image); image.removeAttribute('data-rapier-asset-state'); }
    }
    const borrowed = new Map();
    for (const row of cache.values()) if (row.type === 'image/svg+xml') {
      borrowed.set(row.displayUrl, row.signature);
      const twin = darkened.get(row.signature); if (twin) borrowed.set(twin.url, row.signature);
    }
    for (const image of document.querySelectorAll('img[src]')) {
      if (host.contains(image)) continue;
      const before = image.src, signature = borrowed.get(before);
      if (signature) void present(signature, signature).then(shown => {
        if (revision === presentationRevision && image.isConnected && image.src === before) image.src = shown.url;
      }, () => {});
    }
    schedule();
  }
  async function reveal(image) {
    const id = imageKey(image), captured = documentIndex(), stamp = rapier.identity.authority;
    const record = recordFor(id, captured.index), ticket = {id, signature: record?.url, authority: stamp, dark: darkPaper()};
    const previous = revealing.get(image);
    if (previous && !previous.controller.signal.aborted && presented.get(image) === previous.ticket &&
        Object.keys(ticket).every(key => previous.ticket[key] === ticket[key])) return previous.done;
    previous?.controller.abort();
    const controller = new AbortController();
    const request = {controller, ticket, done: null};
    revealing.set(image, request);
    presented.set(image, ticket);
    image.dataset.rapierAssetState = 'loading';
    request.done = (async () => {
      try {
        const row = await rasterRecord(captured.source, id, captured.index, {signal: controller.signal});
        if (suspended || controller.signal.aborted || !image.isConnected || presented.get(image) !== ticket || stamp !== rapier.identity.authority || imageKey(image) !== id) return;
        const latest = documentIndex(), current = recordFor(id, latest.index);
        if (!current || current.url !== row.signature) { image.removeAttribute('data-rapier-asset-state'); schedule(); return; }
        if (typeof _rapierDrawPrimeImageRecipe === 'function') _rapierDrawPrimeImageRecipe(image, row.signature, row.recipe, row.recipeError, row.resources);
        image.src = presentUrl(row);
        _rapierRenderModule('render-markdown')._rapierApplyImageGeometry(image, row);
        if (image.decode) await image.decode();
        if (suspended || controller.signal.aborted || !image.isConnected || presented.get(image) !== ticket || stamp !== rapier.identity.authority || imageKey(image) !== id) return;
        if (recordFor(id, documentIndex().index)?.url !== row.signature) { image.removeAttribute('data-rapier-asset-state'); schedule(); return; }
        if (row.animated) image.setAttribute('data-rapier-animation', row.signature); else image.removeAttribute('data-rapier-animation');
        image.dataset.rapierAssetState = 'ready';
        if (row.undisplayable && !row.damaged || jxlProbeSettled && !jxlDisplayable() && nestedJxl(row)) noticeWhenSeen(image, row.signature);
        if (row.undisplayable) image.setAttribute('aria-description', row.damaged ? 'This JPEG XL picture appears damaged and cannot be shown. Its saved bytes are kept unchanged.' : 'This JPEG XL picture cannot be shown by ' + here().toLowerCase() + '. Its saved bytes are intact.');
        else image.removeAttribute('aria-description');
        globalThis.RapierImageFlow?.schedule();
      } catch (error) {
        if (suspended || !image.isConnected || presented.get(image) !== ticket || stamp !== rapier.identity.authority || imageKey(image) !== id) return;
        if (recordFor(id, documentIndex().index)?.url !== ticket.signature) { image.removeAttribute('data-rapier-asset-state'); schedule(); return; }
        if (error.code === 'IMAGE_CANCELLED' || error.code === 'IMAGE_VANISHED' || error.name === 'AbortError') { image.removeAttribute('data-rapier-asset-state'); schedule(); return; }
        image.dataset.rapierAssetState = 'error';
        image.setAttribute('aria-description', 'Embedded image unavailable: ' + error.message);
        if (!warned) { warned = true; showToast('An embedded image could not be displayed. Its saved bytes are intact.', 'error'); }
      } finally { if (revealing.get(image) === request) revealing.delete(image); }
    })();
    return request.done;
  }
  const visibility = typeof IntersectionObserver === 'function' ? new IntersectionObserver(rows => {
    for (const row of rows) if (row.isIntersecting && watched.delete(row.target)) {
      visibility.unobserve(row.target);
      if (host.contains(row.target) && row.target.dataset.rapierAssetState === 'waiting') void reveal(row.target);
    }
  }, {root: host, rootMargin: '500px'}) : null;
  function schedule() {
    if (frame || suspended) return;
    frame = requestAnimationFrame(refresh);
  }
  function refresh() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (suspended) return;
    const current = documentIndex();
    let area = null;
    const areaNow = () => area || (area = host.getBoundingClientRect());
    if (parked.size) { areaNow(); landParked(currentSource); }
    if (scanned !== authority) {
      scanned = authority;
      const scope = authority;
      setTimeout(() => { if (scope === authority && typeof _rapierDrawResumeFinishes === 'function') void _rapierDrawResumeFinishes(); }, 0);
    }
    for (const image of watched) if (!host.contains(image)) { visibility.unobserve(image); watched.delete(image); }
    for (const [image, request] of revealing) if (!host.contains(image)) request.controller.abort();
    const placeholders = host.querySelectorAll('img[src^="data:image/jxl;" i]:not([data-rapier-asset]):not([data-rapier-image-url])');
    if (placeholders.length) areaNow();
    for (const image of placeholders) {
      const url = image.getAttribute('src');
      image.setAttribute('data-rapier-image-url', url);
      _rapierRenderModule('render-markdown')._rapierApplyImageGeometry(image, imageGeometry(url));
      image.src = placeholder;
    }
    for (const image of host.querySelectorAll('img:is([data-rapier-asset],[data-rapier-image-url])')) {
      const id = imageKey(image), previous = presented.get(image), record = recordFor(id, current.index);
      if (previous && (previous.authority !== authority || previous.signature !== record?.url)) {
        areaNow(); visibility?.unobserve(image); watched.delete(image); image.removeAttribute('data-rapier-asset-state');
      }
      const state = image.dataset.rapierAssetState;
      if (state === 'waiting' && !watched.has(image) || state === 'loading' && !revealing.has(image)) { areaNow(); image.removeAttribute('data-rapier-asset-state'); }
      const displayed = image.getAttribute('src');
      if (state === 'ready' && (!displayed || !previous && displayed.startsWith('blob:') && !presentationURLs.has(displayed))) {
        areaNow(); image.removeAttribute('data-rapier-asset-state');
      }
      if (image.dataset.rapierAssetState) {
        if (!previous) presented.set(image, {signature: record?.url, authority, dark: darkPaper()});
        continue;
      }
      areaNow();
      presented.set(image, {signature: record?.url, authority});
      image.dataset.rapierAssetState = 'waiting';
      image.loading = 'eager';
      const bounds = image.getBoundingClientRect();
      if (!visibility || bounds.bottom >= area.top - 500 && bounds.top <= area.bottom + 500) void reveal(image);
      else { watched.add(image); visibility.observe(image); }
    }
    for (const image of host.querySelectorAll('img[data-rapier-image-geometry]:not([data-rapier-asset]):not([data-rapier-image-url])')) nativeGeometry(image);
  }
  function nativeGeometry(image) {
    if (suspended || !host.contains(image) || !_rapierRenderModule('render-markdown')._rapierApplyImageGeometry(image)) return;
    const url = image.getAttribute('src');
    if (!/^(?:data:image\/|blob:)/i.test(url || '')) return;
    if (dimensions.size >= assets.IMAGE_LIMITS.assets && !dimensions.has(url)) dimensions.delete(dimensions.keys().next().value);
    dimensions.set(url, {width: image.naturalWidth, height: image.naturalHeight, signature: url});
  }
  async function prepareView(isCurrent = () => true, layout = () => globalThis.RapierImageFlow?.layoutNow()) {
    synchronizeScope();
    const identity = authority, root = rapier.document.source.rootId, decoded = new WeakMap();
    const current = () => isCurrent() && identity === rapier.identity.authority && root === rapier.document.source.rootId;
    while (current()) {
      if (suspended) { await new Promise(resolve => window.addEventListener('pageshow', resolve, {once: true})); continue; }
      if (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source') return true;
      layout();
      refresh();
      if (!current()) return false;
      const area = host.getBoundingClientRect(), jobs = [];
      for (const image of host.querySelectorAll('img')) {
        const bounds = image.getBoundingClientRect();
        if (!image.getClientRects().length || bounds.bottom < area.top - 500 || bounds.top > area.bottom + 500) continue;
        if (imageKey(image) && !['ready', 'error'].includes(image.dataset.rapierAssetState)) {
          visibility?.unobserve(image); watched.delete(image);
          jobs.push(reveal(image));
          continue;
        }
        const src = image.getAttribute('src') || '';
        if (!/^(?:data:|blob:)/i.test(src) || decoded.get(image) === src || typeof image.decode !== 'function') continue;
        decoded.set(image, src);
        jobs.push(image.decode().catch(() => {}));
      }
      if (!jobs.length) return true;
      await Promise.all(jobs);
    }
    return false;
  }
  const observer = new MutationObserver(schedule);
  observer.observe(host, {childList: true, subtree: true});
  host.addEventListener('load', event => nativeGeometry(event.target), true);
  window.addEventListener('pagehide', () => {
    suspended = true; epoch++;
    if (frame) cancelAnimationFrame(frame);
    frame = 0; stopWorker();
    for (const request of pending.values()) request.controller.abort(cancelled());
    pending.clear(); clearPresentations(); dimensions.clear(); portableCache.clear(); primed = null;
    globalThis.RapierImageInspection.close();
    visibility?.disconnect(); watched.clear();
    for (const image of host.querySelectorAll('img[data-rapier-asset-state]'))
      image.removeAttribute('data-rapier-asset-state');
  });
  window.addEventListener('pageshow', () => { suspended = false; schedule(); });
  function clipboard(root) {
    for (const image of root.querySelectorAll('img[data-rapier-asset],img[data-rapier-image-url]')) {
      const id = imageKey(image);
      const live = [...host.querySelectorAll('img[data-rapier-asset],img[data-rapier-image-url]')].find(node =>
        imageKey(node) === id && node.complete && node.naturalWidth && node.dataset.rapierAssetState === 'ready');
      if (!live) return false;
      const record = recordFor(id, documentIndex().index);
      const canonical = record && cache.get(record.url);
      if (canonical && canonical.type !== 'image/jxl') {
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
  const portableCache = new Map();
  const PORTABLE_BUDGET = 16 * 1024 * 1024;
  async function smallestPortable(row) {
    const key = row.signature;
    const cached = portableCache.get(key);
    if (cached) { cached.used = ++clock; return cached.value; }
    let result = null;
    const nested = nestedJxl(row);
    if (nested) result = await portableSvg(row, nested);
    else {
      if (row.type === 'image/jxl') {
        const restored = await codec('reconstruct', {bytes: assets.decodeDataImage(row.url)});
        if (restored.bytes) result = {...row, type: 'image/jpeg', url: 'data:image/jpeg;base64,' + RapierBundleIO.toBase64(restored.bytes), undisplayable: false};
      }
      if (!result && !row.undisplayable) {
        try {
          const image = await nativeImage(row.url);
          try {
            const made = rasterPortable(image, row.width, row.height);
            if (made && (row.type === 'image/jxl' || made.type === 'image/jpeg' && made.url.length < row.url.length)) result = {...row, ...made};
            else if (row.type !== 'image/jxl') result = row;
          } finally { image.removeAttribute('src'); }
        } catch (_) {}
      }
    }
    if (!result && row.type === 'image/jxl') throw Object.assign(new Error(here() + ' cannot read JPEG XL, so this picture cannot be converted. ' + jxlRemedy() + ' The picture is unchanged.'), {code: 'IMAGE_JXL_UNREADABLE'});
    if (!result) result = row;
    const entry = {value: result, used: ++clock, cost: result.url === key ? 0 : result.url.length};
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
  async function materialize(root, source, substitutions = null, options = null) {
    const compat = !options || options.compat !== false, signal = options?.signal, convert = compat || options?.drawn === true && !jxlDisplayable();
    const check = () => { if (signal?.aborted) throw cancelled(); };
    check();
    const images = [...root.querySelectorAll('img[data-rapier-asset],img[data-rapier-image-url],img[src^="data:image/jxl;" i]')];
    if (!images.length) return root;
    const resolved = new Map(), index = indexForSource(source);
    for (const [done, image] of images.entries()) {
      check();
      options?.progress?.(done / images.length);
      const id = imageKey(image) || image.getAttribute('src');
      if (!resolved.has(id)) {
        const row = await rasterRecord(source, id, index, {signal});
        const jxl = convert && !row.animated && (assets.dataImage(row.signature)?.codec === 'image/jxl' || !!nestedJxl(row));
        let shown;
        const named = error => { if (error && typeof error === 'object' && /^IMAGE_/.test(error.code || '')) Object.assign(error, {picture: imageKey(image) || '', alt: image.getAttribute('alt') || ''}); return error; };
        if (jxl && !row.damaged) shown = await smallestPortable(assets.dataImage(row.signature)?.codec === 'image/jxl' ? {...row, type: 'image/jxl', url: row.signature} : row).catch(error => { throw named(error); });
        else if (row.undisplayable || row.damaged) {
          if (jxl) throw named(Object.assign(new Error(row.damaged ? 'This JPEG XL picture is damaged and cannot be converted. Its bytes are kept unchanged.' : here() + ' cannot read JPEG XL, so this picture cannot be converted. ' + jxlRemedy() + ' The picture is unchanged.'), {code: row.damaged ? 'IMAGE_DAMAGED' : 'IMAGE_JXL_UNREADABLE'}));
          shown = row.animated ? row : {...row, url: row.signature};
        } else shown = row;
        resolved.set(id, shown);
        if (substitutions && jxl) substitutions.set(row.signature, shown.url);
      }
      check();
      const row = resolved.get(id);
      image.src = row.url;
      if (row.animated) image.setAttribute('data-rapier-animation', row.signature);
      _rapierRenderModule('render-markdown')._rapierApplyImageGeometry(image, row);
      image.setAttribute('data-rapier-natural-width', row.width);
      image.setAttribute('data-rapier-natural-height', row.height);
      for (const name of ['data-rapier-asset', 'data-rapier-image-url', 'data-rapier-asset-state', 'data-rapier-image-source']) image.removeAttribute(name);
      if (options?.work?.yield) await options.work.yield();
      check();
    }
    return root;
  }
  function caretSplit(source, point) {
    if (typeof source !== 'string' || !source.trim() || !Number.isSafeInteger(point) || point < 0 || point > source.length) return null;
    if (point === 0 || point === source.length) return Object.freeze({source, point,
      before: point === 0 ? '' : source, after: point === 0 ? source : ''});
    const graphemes = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
    let graphemeBoundary = false;
    for (const part of graphemes.segment(source)) {
      if (part.index >= point) { graphemeBoundary = part.index === point; break; }
    }
    if (!graphemeBoundary) return null;
    if (/(?:^|[\r\n])[ \t>]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[[ xX]\]$/.test(source.slice(0, point)))
      while (point < source.length && /[ \t]/.test(source[point])) point++;
    const environment = () => ({..._rapierMarkdownEnvironment()});
    const parse = value => md.parse(value, environment());
    let marker = '\ue000rapier-caret\ue001';
    while (source.includes(marker)) marker += '\ue001';
    const original = parse(source);
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
    if (original[0]?.type === 'blockquote_open' && /^\[![A-Za-z]+\]/.test(
        original.find(token => token.type === 'inline')?.content || '')) return null;
    const hasLink = original.some(token => token.children?.some(child => child.type === 'link_open'));
    const linkRule = md.inline.ruler.__rules__.find(row => row.name === 'link' && row.enabled)?.fn;
    const links = [];
    let linkScan = 0;
    if (hasLink && linkRule) for (let start = source.lastIndexOf('[', point - 1); start >= 0;
        start = start > 0 ? source.lastIndexOf('[', start - 1) : -1) {
      if (_rapierSourceCharEscaped(source, start) || source[start - 1] === '!') continue;
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
      break;
    }
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
    const model = (tokens, split = false) => {
      const path = [], found = [], empty = [];
      let id = 0, cut = null;
      for (const token of tokens) {
        if (!allowedBlocks.test(token.type)) return null;
        if (token.type === 'inline') {
          let list = token.children || [], task = '';
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
    if (leftEmpty && !leaf) return Object.freeze({source, point, before: '', after: source});
    if (rightEmpty && leaf === whole.length - 1) return Object.freeze({source, point, before: source, after: ''});
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
      const index = marked.indexOf(inline), opener = marked[index - 1];
      const atx = opener?.type === 'heading_open' && /^#{1,6}$/.test(opener.markup);
      if (!opener?.map || !(opener.type === 'paragraph_open' || atx)) return null;
      let head = (source.split(/\r\n?|\n/)[opener.map[0]] || '').replace(/[ \t]+$/, '');
      if (atx) { tail = /[ \t]+#+$/.exec(head)?.[0] || ''; head = head.slice(0, head.length - tail.length); }
      const words = original[index].content.split('\n', 1)[0].replace(/^[ \t]+|[ \t]+$/g, '');
      if (!words || !head.endsWith(words)) return null;
      prefix = head.slice(0, head.length - words.length);
      leads.push(prefix);
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
  function ownBlock(raw, normalized) {
    const layout = /<!--md-layout:v1[ \t][^\r\n]*?-->/.exec(raw);
    if (layout && globalThis.RapierMarkdownLayout.parseLayout(layout[0])?.wrap) return true;
    const asset = normalized && (normalized.asset || normalized.hostAsset);
    return asset?.codec === 'image/svg+xml' && !!asset.bytes &&
      new TextDecoder().decode(asset.bytes).includes('<metadata id="rapier-draw">');
  }
  async function insert(normalized, raw, target, stamp, options = {}) {
    if (!_rapierMutationStampIsCurrent(stamp) || _rapierUserMutationBlocked()) return false;
    const source = _rapierSourceText(), spans = _rapierExcerptCanonicalBlockSpans();
    if (normalized.asset) {
      _rapierEmbedPictureLimit(normalized.asset.bytes.byteLength);
      const answer = await _rapierEmbed.assets?.request(normalized.asset);
      if (!_rapierMutationStampIsCurrent(stamp) || source !== _rapierSourceText()) return false;
      if (answer?.url) {
        raw = RapierEmbedContract.externalImage(raw, normalized.asset, answer.url);
        normalized = {...normalized, hostAsset: normalized.asset, asset: null};
      } else if (answer?.code && !['asset_not_granted', 'asset_rejected'].includes(answer.code)) {
        _rapierEmbedPost('protocol-error', {code: answer.code});
        showToast('Host picture storage was unavailable. The picture is kept in the document.', 'info');
      }
    }
    if (normalized.asset) {
      const existing = [...indexForSource(source).assets.values()].find(row => row.url === normalized.asset.url && row.title === (normalized.asset.title || ''));
      if (existing) {
        const token = '[' + normalized.asset.label + ']', at = raw.lastIndexOf(token);
        if (at < 0) return false;
        raw = raw.slice(0, at) + '[' + existing.label + ']' + raw.slice(at + token.length);
      }
    }
    const record = target.replaceImage && _rapierImageRecord(target.replaceImage.blockId, target.replaceImage.imageIndex);
    let start, end, text = raw, imageText = raw, imageOffset = 0;
    const eol = rapier.document.sourceNewline || '\n';
    const betweenBlocks = () => {
      const before = source.slice(0, start), after = source.slice(end);
      const lead = before && !/\n\r?\n$/.test(before) ? (before.endsWith('\n') ? eol : eol + eol) : '';
      imageOffset = lead.length;
      text = lead + text +
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
        imageOffset = plan.before ? plan.before.length + eol.length * 2 : 0;
        text = [plan.before, raw, plan.after].filter(part => part !== '').join(eol + eol);
      }
    } else if (target.replaceImage) {
      if (!record) return false;
      const span = spans.get(record.block.id);
      if (!span) return false;
      start = span.start + record.image.start; end = span.start + record.image.end;
      text += target.replaceImage.placement ?? (record.image.placementSource || '');
      const imported = _rapierRenderModule('render-markdown')._rapierImageAltSourceParts(record.image.altSource);
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
          let close = raw.indexOf(']');
          while (close >= 0 && _rapierSourceCharEscaped(raw, close)) close = raw.indexOf(']', close + 1);
          if (close < 0) return false;
          imageText = raw.slice(0, close) + '|' + imported.width + raw.slice(close);
          text = imageText + (record.image.placementSource || '');
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
    const occurrenceSplice = {pos:start, removed:source.slice(start,end), inserted:text};
    const splices = [occurrenceSplice];
    const inPlace = target.replaceImage && suffix ? definitionInPlace(source, splices[0], prospective, suffix) : null;
    if (inPlace) splices.splice(0, 1, ...inPlace);
    else if (suffix) {
      if (end === source.length) splices[0].inserted += suffix;
      else splices.unshift({pos:source.length, removed:'', inserted:suffix});
    }
    if (new Blob([appended.source]).size > (_rapierEmbed.settings?.limits.documentBytes || RapierTextCodec.maxDocumentBytes))
      throw Object.assign(new Error('That image exceeds the document size limit'), {code: 'document_too_large'});
    const carried = normalized.asset || normalized.hostAsset;
    const row = carried && (await prepare({...normalized, asset: carried})).presentation;
    if (!_rapierMutationStampIsCurrent(stamp) || source !== _rapierSourceText()) return false;
    if (row?.animated) {
      const posters = await _rapierDocumentObjects.posterSplices(source, splices, suffix ? raw + '\n\n' + suffix : appended.source);
      if (!_rapierMutationStampIsCurrent(stamp) || source !== _rapierSourceText()) return false;
      if (posters) splices.unshift(...posters);
      else showToast('No still image could be made for this animation; it is kept without one', 'info');
    }
    primed = row || null;
    const revealAt = text.indexOf(raw);
    const viewport = target.viewport || _rapierCaptureEditorViewport(null, true, false, start + (revealAt >= 0 ? revealAt + 1 : 1), start - 1);
    let proof = null;
    if (options.receipt) {
      const preview = rapier.document.source.fork();
      let position = start + imageOffset;
      for (const row of splices) {
        if (row !== occurrenceSplice && row.pos < start) position += row.inserted.length - row.removed.length;
        preview.splice(row.pos, row.removed, row.inserted);
      }
      const retired = rapier.document.docKind === 'markdown'
        ? globalThis.RapierKernel.imageDeletionSplices(source, preview.read(), splices) : [];
      for (const row of retired) {
        if (position >= row.pos + row.removed.length) position += row.inserted.length - row.removed.length;
        else if (position >= row.pos) position = -1;
        preview.splice(row.pos, row.removed, row.inserted);
      }
      proof = {position, source:preview.read()};
    }
    try {
      const committed = await _rapierCommitSourceProjection(splices, 'document.embed-image', null, null, viewport);
      if (!committed || !options.receipt) return committed;
      let occurrence = null;
      if (_rapierMutationStampSharesDocument(stamp) && proof.position >= 0 &&
          _rapierSourceText() === proof.source && proof.source.slice(proof.position, proof.position + imageText.length) === imageText) {
        const spans = _rapierExcerptCanonicalBlockSpans();
        const block = rapier.document.blocks.find(row => {const span = spans.get(row.id); return span && span.start <= proof.position && proof.position < span.end;});
        const image = block && _rapierRenderModule('render')._rapierScanMarkdownImages(block.raw).find(row => spans.get(block.id).start + row.start === proof.position);
        if (image) occurrence = {position:proof.position, blockId:block.id, imageIndex:image.renderIndex,
          reference:image.reference || '', sourceUrl:indexForSource(proof.source).assets.get(assets.normalizeLabel(image.reference || ''))?.url || image.destination || null};
      }
      return Object.freeze({committed:true, documentStamp:stamp,
        stamp:occurrence ? Object.freeze(_rapierMutationStamp()) : null, occurrence:occurrence && Object.freeze(occurrence)});
    }
    finally {
      primed = null;
      try { schedule(); } catch (error) { console.warn('[rapier] image presentation', error); }
    }
  }
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
  function stats() {
    const bytesOf = map => [...map.values()].reduce((sum, item) => sum + (item.cost || 0), 0);
    return {
      cache: cache.size, cacheBytes: bytesOf(cache),
      darkened: darkened.size, darkenedBytes: bytesOf(darkened), darkenedBudget: DARKENED_BUDGET,
      portable: portableCache.size, portableBytes: bytesOf(portableCache), portableBudget: PORTABLE_BUDGET,
      dimensions: dimensions.size, pending: pending.size,
    };
  }
  async function downloadOriginal(record) {
    const image = _rapierImageRuntime.image;
    const id = image?.getAttribute('data-rapier-asset') || image?.getAttribute('data-rapier-image-url') ||
      record.image.reference || record.image.destination || '';
    const row = recordFor(id, documentIndex().index);
    if (!row) { showToast('This picture is not stored in the document, so it cannot be downloaded', 'info'); return; }
    let bytes;
    let mime = row.codec || assets.dataImage(row.url)?.codec || '';
    try {
      bytes = assets.decodeDataImage(row.url);
      if (mime === 'image/jxl') {
        const restored = await codec('reconstruct', {bytes: bytes.slice()});
        if (restored.bytes) { bytes = restored.bytes; mime = 'image/jpeg'; }
      }
      if (mime === 'image/svg+xml') {
        const text = assets.sanitizeSvgText(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
        if (!text) throw new Error('Choose a valid SVG image.');
        bytes = new TextEncoder().encode(text);
      }
    } catch (error) { showToast('Picture could not be read: ' + String(error.message || error), 'error'); return; }
    const ext = mime === 'image/jxl' ? 'jxl' : mime === 'image/svg+xml' ? 'svg' : mime === 'image/jpeg' ? 'jpg' :
      mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'png';
    let position = 0;
    for (const block of rapier.document.blocks) {
      if (block.id === record.block.id) { position += record.imageIndex; break; }
      position += _rapierRenderModule('render')._rapierScanMarkdownImages(block.raw).length;
    }
    const title = String(record.image.title || '').trim();
    const base = title || (String(rapier.document.filename || '').replace(/\.[a-z0-9]+$/i, '') || 'document') + ' ' + (position + 1);
    await _download(new Blob([bytes], {type: mime}), base + '.' + ext);
  }
  schedule();
  async function present(source, id) {
    const row = await rasterRecord(source, id, indexForSource(source));
    return {url: presentUrl(row), width: row.width, height: row.height, type: row.type, signature: row.signature, undisplayable: !!row.undisplayable, damaged: !!row.damaged};
  }
  const FINISH_OPERATION = 'document.finish-picture', FINISH_NOTICE_MS = 1500, FINISH_QUIET_MS = 1500, FINISH_PATIENCE_MS = 15 * 60 * 1000;
  const finishing = new Set(), idleFinishing = new Set(), finishWaiters = new Set(), parked = new Map(), resumedOnce = new Set(), inputPointers = new Set();
  let finishCommit = Promise.resolve(), lastInput = 0, watchingInput = false, scanned = '', inputComposing = false;
  function canFinishLater() {
    return !_rapierEmbed.active && rapier.document.docKind === 'markdown' && !rapier.access.readOnly && typeof _rapierCommitSourceProjection === 'function';
  }
  function interruptIdleFinishes() {
    for (const run of idleFinishing) run.controller?.abort();
  }
  function watchInput() {
    if (watchingInput) return;
    watchingInput = true;
    const input = () => { lastInput = Date.now(); interruptIdleFinishes(); };
    for (const type of ['keydown', 'beforeinput']) document.addEventListener(type, input, {capture: true, passive: true});
    document.addEventListener('pointerdown', event => { inputPointers.add(event.pointerId); input(); }, {capture: true, passive: true});
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) document.addEventListener(type, event => { inputPointers.delete(event.pointerId); input(); }, {capture: true, passive: true});
    for (const type of ['wheel', 'scroll']) document.addEventListener(type, input, {capture: true, passive: true});
    window.addEventListener('blur', () => { inputPointers.clear(); inputComposing = false; input(); }, {capture: true, passive: true});
    document.addEventListener('compositionstart', () => { inputComposing = true; input(); }, {capture: true, passive: true});
    document.addEventListener('compositionend', () => { inputComposing = false; input(); }, {capture: true, passive: true});
    document.addEventListener('visibilitychange', () => { if (document.hidden) { inputPointers.clear(); inputComposing = false; input(); } }, {capture: true, passive: true});
    window.addEventListener('pagehide', interruptIdleFinishes, {capture: true, passive: true});
  }
  function finishQuiet(run) {
    if (document.hidden || inputPointers.size || inputComposing || rapier.composition?.block || rapier.composition?.source ||
      Date.now() - lastInput < FINISH_QUIET_MS || run.busy() || run.controller?.signal.aborted || run.optional && foregroundCodecs) return false;
    if (_rapierUserMutationBlocked(false) || rapier.undo.applying || rapier.sourceTransition.busy || _rapierMutationBarrierActive()) return false;
    if (_rapierImageRuntime.image || globalThis.RapierImageFlow?.status?.().moving || globalThis.RapierImageFlow?.status?.().committing) return false;
    return _rapierSettlePendingDocumentChange();
  }
  function only(text, needle) {
    const at = text.indexOf(needle);
    return at >= 0 && text.indexOf(needle, at + 1) < 0 ? at : -1;
  }
  function doneOf(label) {
    return rapier.undo.ledger.find(row => row?.transaction?.operation === 'document.embed-image' &&
      Array.isArray(row.splices) && row.splices.some(splice => String(splice.inserted).includes('[' + label + ']: ')));
  }
  function finishTarget(run, source) {
    const label = run.asset.label, before = assets.serializeAsset(run.asset);
    let mentions = 0;
    for (let at = source.indexOf(label); at >= 0; at = source.indexOf(label, at + 1)) mentions++;
    if (!mentions) return 'gone';
    const defAt = only(source, before), token = '][' + label + ']', refAt = only(source, token);
    if (mentions !== 2 || defAt < 0 || refAt < 0) return 'kept';
    const ledger = rapier.undo.ledger, done = doneOf(label), id = done?.transaction.id;
    if (!done && !run.resumed) return 'kept';
    const named = record => !run.optional && id && (record.transaction?.reverts === id || record.transaction?.reapplies === id) ? false :
      (_rapierRecordSplices(record, ledger) || [{removed: label}]).some(splice => splice.removed.includes(label) || splice.inserted?.includes(label));
    if (ledger.slice(done ? ledger.indexOf(done) + 1 : 0).some(named)) return 'kept';
    return {defAt, refAt, before, token, done};
  }
  function finishPlan(run, finished, source) {
    const target = finishTarget(run, source);
    if (typeof target === 'string') return target;
    if (source.includes('[' + finished.label + ']')) return 'kept';
    const rows = [{pos: target.defAt, removed: target.before, inserted: assets.serializeAsset(finished)}, {pos: target.refAt, removed: target.token, inserted: '][' + finished.label + ']'}].sort((x, y) => y.pos - x.pos);
    return {rows, done: target.done};
  }
  function holdEdit() {
    let caret = null;
    try {
      const context = _activeBlockEditContext(), selection = window.getSelection();
      const range = context && selection?.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null;
      if (range && context.editDiv.contains(range.startContainer))
        caret = {blockId: context.block.id, offset: _charOffsetForRangePoint(context.editDiv, range.startContainer, range.startOffset)};
    } catch (_) {}
    return () => {
      try {
        if (!caret || _activeBlockEditContext()) return;
        const block = rapier.document.blocks.find(row => row.id === caret.blockId);
        const wrapper = block && document.querySelector('#editor-blocks > .block-wrapper[data-block-id="' + block.id + '"]');
        const editDiv = wrapper && enterBlockEdit(block, wrapper, {charOffset: caret.offset, preserveScroll: true});
        if (editDiv) requestAnimationFrame(() => { if (editDiv.isConnected && wrapper.classList.contains('block-wrapper--editing')) _rapierFocusEditingHost(editDiv); });
      } catch (error) { console.warn('[rapier] finish picture caret', error); }
    };
  }
  async function finishOnce(run, finished) {
    if (!_rapierMutationStampSharesDocument(run.stamp)) return 'gone';
    if (run.optional && (run.controller?.signal.aborted || !_rapierMutationStampIsCurrent(run.attemptStamp))) return 'wait';
    if (rapier.access.readOnly) return 'kept';
    if (!finishQuiet(run)) return 'wait';
    const stamp = Object.freeze(_rapierMutationStamp()), source = _rapierSourceText();
    const plan = finishPlan(run, finished, source);
    if (typeof plan === 'string') return plan;
    const growth = plan.rows.reduce((n, row) => n + row.inserted.length - row.removed.length, 0);
    if (growth > 0 && (source.length + growth > assets.IMAGE_LIMITS.sourceChars || new Blob([source]).size + growth > (_rapierEmbed.settings?.limits.documentBytes || RapierTextCodec.maxDocumentBytes))) return 'kept';
    const row = (await prepare({asset: finished, reference: finished.label, dataUrl: finished.url, width: finished.width, height: finished.height})).presentation;
    if (!_rapierMutationStampIsCurrent(stamp) || source !== _rapierSourceText() || !finishQuiet(run) ||
      run.optional && (run.controller?.signal.aborted || !_rapierMutationStampIsCurrent(run.attemptStamp))) return 'wait';
    primed = row || null;
    const giveBack = holdEdit();
    const was = {clean: !_rapierIsDirty(), generation: rapier.revision.generation};
    let persisted = !run.optional;
    try {
      if (run.optional) run.committing = true;
      const current = run.optional ? () => !run.controller?.signal.aborted && !document.hidden && !run.busy() &&
        !foregroundCodecs && canFinishLater() && _rapierMutationStampIsCurrent(run.attemptStamp) : null;
      if (!await _rapierCommitSourceProjection(plan.rows, FINISH_OPERATION, null, null, undefined,
        {navigation: false, sourceTransactionId: plan.done?.transaction.id}, current)) return 'refused';
      if (run.optional) {
        const kept = Object.freeze(_rapierMutationStamp());
        persisted = await run.persist(kept) === true && _rapierMutationStampIsCurrent(kept);
      }
      return persisted ? 'replaced' : 'unpersisted';
    } finally {
      primed = null;
      giveBack();
      if (persisted && was.clean && rapier.revision.generation === was.generation + 1 && typeof rapier.revision.savedGeneration === 'number') {
        rapier.revision.savedGeneration = rapier.revision.generation;
        try { _notifyDirtyState(); } catch (error) { console.warn('[rapier] finish picture dirty state', error); }
      }
      try { schedule(); } catch (error) { console.warn('[rapier] image presentation', error); }
    }
  }
  async function finishDrawing(run, finished) {
    for (let refused = 0; refused < 3;) {
      if (Date.now() - run.since > FINISH_PATIENCE_MS) return 'kept';
      const verdict = await finishOnce(run, finished).catch(error => { console.warn('[rapier] finish picture', error); return 'kept'; });
      if (verdict === 'refused') refused++;
      else if (verdict !== 'wait') return verdict;
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    return 'kept';
  }
  function wake() {
    if (!finishing.size) for (const resolve of [...finishWaiters]) { finishWaiters.delete(resolve); resolve(); }
  }
  async function land(run, finished) {
    finishing.add(run);
    try {
      const turn = finishCommit.then(() => finishDrawing(run, finished));
      finishCommit = turn.catch(() => {});
      const verdict = await turn;
      if (verdict === 'gone') park(run, finished);
      return verdict;
    } finally { finishing.delete(run); wake(); }
  }
  function park(run, finished) {
    const done = doneOf(run.asset.label);
    if (done && _rapierMutationStampSharesDocument(run.stamp) && rapier.undo.branch.indexOf(done) >= rapier.undo.cursor) parked.set(run.asset.label, {run, finished, done});
  }
  function landParked(source) {
    for (const [label, held] of parked) {
      if (source.includes(label)) { parked.delete(label); held.run.since = Date.now(); void land(held.run, held.finished); }
      else if (rapier.undo.branch.indexOf(held.done) < rapier.undo.cursor || !_rapierMutationStampSharesDocument(held.run.stamp)) parked.delete(label);
    }
  }
  function finishIdle({asset, title = '', final, busy, persist}) {
    const run = {asset, busy, persist, optional: true, stamp: Object.freeze(_rapierMutationStamp()), since: Date.now(), controller: null};
    idleFinishing.add(run); watchInput();
    return (async () => {
      try {
        while (Date.now() - run.since < FINISH_PATIENCE_MS) {
          if (!_rapierMutationStampSharesDocument(run.stamp) || !canFinishLater()) return 'kept';
          if (!finishQuiet(run)) { await new Promise(resolve => setTimeout(resolve, 700)); continue; }
          if (typeof finishTarget(run, _rapierSourceText()) === 'string') return 'kept';
          const controller = new AbortController(), stamp = Object.freeze(_rapierMutationStamp());
          run.controller = controller; run.attemptStamp = stamp; run.committing = false;
          const watch = setInterval(() => {
            if (!run.committing && (document.hidden || run.busy() || !canFinishLater() || !_rapierMutationStampIsCurrent(stamp) || Date.now() - run.since >= FINISH_PATIENCE_MS)) controller.abort();
          }, 50);
          try {
            const text = await final(null, {signal: controller.signal});
            controller.signal.throwIfAborted();
            if (!text) return 'kept';
            const finished = await assets.createAsset(new TextEncoder().encode(text), null, {codec: 'image/svg+xml', title});
            controller.signal.throwIfAborted();
            if (finished.width !== asset.width || finished.height !== asset.height || finished.label === asset.label || finished.byteLength >= asset.byteLength) return 'kept';
            const turn = finishCommit.then(() => finishOnce(run, finished));
            finishCommit = turn.catch(() => {});
            const verdict = await turn;
            if (verdict !== 'wait' && verdict !== 'refused') return verdict;
          } catch (error) {
            if (!controller.signal.aborted) { console.warn('[rapier] idle painting', error); return 'kept'; }
          } finally { clearInterval(watch); run.controller = null; }
          await new Promise(resolve => setTimeout(resolve, 700));
        }
        return 'kept';
      } catch (error) { console.warn('[rapier] idle painting', error); return 'kept'; }
      finally { idleFinishing.delete(run); }
    })();
  }
  function finishLater({asset, title = '', final, busy = () => false, onProgress = null, resumed = false, optional = false, persist = null}) {
    if (optional) return typeof persist === 'function' ? finishIdle({asset, title, final, busy, persist}) : Promise.resolve('kept');
    if (resumed) {
      const key = rapier.identity.authority + ' ' + asset.label;
      if (resumedOnce.has(key) || typeof finishTarget({asset, resumed}, _rapierSourceText()) === 'string') return Promise.resolve('kept');
      resumedOnce.add(key);
    }
    const run = {asset, busy, resumed, stamp: Object.freeze(_rapierMutationStamp()), since: Date.now(), notice: _rapierProgressOpen({label: 'Finishing at full quality', after: FINISH_NOTICE_MS})};
    finishing.add(run);
    watchInput();
    const report = fraction => run.notice.set(fraction);
    onProgress?.(report);
    const done = (async () => {
      try {
        const text = await final(report);
        run.notice.end();
        if (!text) return 'kept';
        const finished = await globalThis.RapierImageInspection.createDrawingAsset(text, {title});
        if (finished.width !== asset.width || finished.height !== asset.height || finished.label === asset.label) return 'kept';
        return await land(run, finished);
      } catch (error) {
        console.warn('[rapier] finish picture', error);
        return 'kept';
      } finally {
        run.notice.end(); finishing.delete(run); wake();
      }
    })();
    return done;
  }
  function finishSettled() {
    return finishing.size ? new Promise(resolve => finishWaiters.add(resolve)) : Promise.resolve();
  }
  function historySubject(target) { return target?.transaction?.id; }
  function historySplices(target, redo) {
    return globalThis.RapierLedger.pictureHistorySplices({source: _rapierSourceText(), records: rapier.undo.ledger}, target, redo);
  }
  return Object.freeze({cachedDrawing: url => primed?.signature === url ? primed : cache.get(url) || null, codec, imageHtml, geometry: imageGeometry, materialize, present, prepare, prepareView, insert, caretSplit, portable, clipboard, nativeImage, validatePaintRaster, schedule, retheme, stats, inkForPaper, downloadOriginal, jxlDisplayable, whenJxlDisplayKnown, index: () => documentIndex(), canFinishLater, finishLater, finishSettled, historySplices, historySubject});
})();
globalThis.RapierEmbeddedImages = _rapierEmbeddedImages;
