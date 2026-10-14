// SPDX-License-Identifier: AGPL-3.0-only
(() => {
 if (!globalThis.RapierBenchSession?.active) return;
 const missing = reason => ({unavailable: reason});
 const unsupported = (reason, dependencyCode) => { throw Object.assign(new Error(reason), {code: 'BENCH_UNSUPPORTED', ...(dependencyCode ? {dependencyCode} : {})}); };
 const check = context => { context.signal?.throwIfAborted(); if (context.graphics?.remote?.failure) throw context.graphics.remote.failure; };
 const fixture = id => globalThis.RapierPhoneBenchGraphicsFixtures.getGraphicsFixture(id);
 const abortable = (task, context) => {
  check(context);
  return new Promise((resolve, reject) => {
   const aborted = () => reject(context.signal.reason || new DOMException('Benchmark stopped', 'AbortError'));
   context.signal?.addEventListener('abort', aborted, {once: true});
   Promise.resolve(task).then(resolve, reject).finally(() => context.signal?.removeEventListener('abort', aborted));
  });
 };
 const pause = (ms, context) => new Promise((resolve, reject) => {
  check(context);
  const done = () => { context.signal?.removeEventListener('abort', abort); resolve(); };
  const timer = setTimeout(done, Math.max(0, ms));
  const abort = () => { clearTimeout(timer); context.signal?.removeEventListener('abort', abort); reject(context.signal.reason || new DOMException('Benchmark stopped', 'AbortError')); };
  context.signal?.addEventListener('abort', abort, {once: true});
 });
 async function frames(context, count = 2) {
  for (let i = 0; i < count; i++) await abortable(new Promise(resolve => requestAnimationFrame(resolve)), context);
 }
 async function until(ready, context, timeout = 120000) {
  const deadline = performance.now() + timeout;
  while (!ready()) {
   check(context);
   if (performance.now() > deadline) throw new Error('The painting owner did not finish within two minutes.');
   await pause(16, context);
  }
 }
 function hash(bytes) { return globalThis.RapierNotesIntegrity.sha256(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)); }
 function bytesOf(raster) {
  const binary = atob(raster.slice(raster.indexOf(',') + 1));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
 }
 async function loadFixture(id, context) {
  check(context);
  const value = await fixture(id), {metadata} = value;
  const bytes = value.source !== undefined ? new TextEncoder().encode(value.source) : value.raster ? bytesOf(value.raster) : new TextEncoder().encode(JSON.stringify(value.recipe));
  if (bytes.length !== metadata.bytes || await hash(bytes) !== metadata.sha256) throw new Error('The built-in graphics input failed its byte check.');
  check(context); return value;
 }
 async function picture(context) {
  const value = await loadFixture('water-pixels-v1', context);
  const pixels = await abortable(_rapierPaintPNG.decode(value.raster), context);
  if (!pixels || await hash(pixels.data) !== value.metadata.rgbaSha256) throw new Error('The painting fixture did not decode to its pinned straight channels.');
  return {...value, pixels};
 }
 async function savedRecipe(context) {
  const value = await loadFixture('water-three-v1', context);
  const records = [...value.source.matchAll(/^\[([^\]]+)\]: (data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+)/gm)];
  if (records.length !== 3) throw new Error('The painting fixture must contain three saved drawings.');
  const svg = new TextDecoder().decode(bytesOf(records[2][2]));
  const recipe = globalThis.RapierDrawCore._rapierDrawReadRecipeFromSVGText(svg);
  if (!recipe || recipe.shapes.length !== 1 || !recipe.shapes[0].raster.startsWith('data:image/jxl;')) throw new Error('The saved Water fixture is not an editable painting.');
  return {...value, recipe, labels: records.map(row => row[1])};
 }
 async function nativeDecoder(context) {
  check(context);
  if (typeof ImageDecoder !== 'function' || !await ImageDecoder.isTypeSupported('image/jxl').catch(() => false)) unsupported('Native straight-channel JPEG XL decoding is unavailable in this browser.');
 }
 async function drawing(mode, context, recipe = null) {
  if (_rapierDrawState.open) await abortable(_rapierDrawClose(), context);
  await abortable(new Promise((resolve, reject) => {
   _rapierDrawOpenSurface({recipe: recipe || {version: 1, canvas: {w: 390, h: 792}, strokes: [], shapes: []}, keepRasters: true,
    onReady: ready => ready ? resolve() : reject(new Error('The drawing owner could not open its benchmark sheet.'))});
  }), context);
  await abortable(_rapierDrawSetTool(mode), context);
  if (_rapierDrawTool() !== mode) throw new Error('The requested painting tool did not open.');
  await frames(context);
 }
 async function waterOwner(run, context) {
  if (!globalThis.navigator?.gpu) unsupported('WebGPU is unavailable in this browser.');
  const adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
  if (!adapter) unsupported('This browser did not provide a WebGPU adapter.');
  const unfiltered = run.id.includes('.unfiltered.');
  if (!unfiltered && !adapter.features.has('float32-filterable')) unsupported('This GPU does not support the filtered Water shader path.');
  globalThis.__rapierWaterUnfilteredTest = unfiltered;
  const remote = await abortable(_rapierPaintStartPainter('water'), context);
  const configured = await abortable(remote.client.request('configure', {unfilteredTest: unfiltered, stats: true}), context);
  if (configured.filterable !== !unfiltered) throw new Error('Water started a different shader path than the requested run.');
  context.graphics.remote = remote;
  context.graphics.shaderPath = unfiltered ? 'unfiltered' : 'filtered';
  context.graphics.timestamps = adapter.features.has('timestamp-query');
  const info = adapter.info || {};
  context.graphics.identity = {gpu: {
   ...Object.fromEntries(['vendor', 'architecture', 'device', 'description'].map(key => [key, info[key] || missing('Adapter did not disclose ' + key + '.')])),
   source: 'Page high-performance adapter query; the Water worker requests its device independently.',
   features: [...adapter.features].sort(),
   workerEnabledFeatures: configured.features || missing('The Water worker did not report enabled features.'),
   workerShaderPath: configured.filterable ? 'filtered' : 'unfiltered',
   limits: Object.fromEntries(['maxTextureDimension2D', 'maxBufferSize', 'maxStorageBufferBindingSize'].filter(key => Number.isFinite(adapter.limits?.[key])).map(key => [key, adapter.limits[key]])),
  }};
  return remote;
 }
 function waterNumbers(before, after, elapsed, context) {
  const no = missing('The Water owner did not return timing counters.');
  if (!before || !after) return {presentedFps: no, workerMs: no, gpuMs: no, gpuQueueMs: no};
  const delta = key => Number.isFinite(before[key]) && Number.isFinite(after[key]) && after[key] >= before[key] ? after[key] - before[key] : null;
  const presents = delta('presents'), busy = delta('busy'), gpuFrames = delta('gpuFrames'), gpu = delta('gpu'), stamps = delta('stampBuffers'), stamp = delta('stamp');
  return {
   presentedFps: presents !== null && elapsed > 0 ? presents * 1000 / elapsed : no,
   workerMs: presents > 0 && busy !== null ? busy / presents : missing('No Water presentations were recorded.'),
   gpuQueueMs: gpuFrames > 0 && gpu !== null ? gpu / gpuFrames : missing('No completed GPU queue timing was recorded.'),
   gpuMs: stamps > 0 && stamp !== null ? stamp / stamps : missing(context.graphics.timestamps ? 'No GPU timestamp readback completed.' : 'The GPU does not support timestamp-query.'),
   gpuTimestampBuffers: stamps ?? no,
   gpuTimestampSkipped: delta('stampSkipped') ?? no,
  };
 }
 function meter(context) {
  let running = true, count = 0, raf = 0;
  const tick = () => { count++; if (running) raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
  const started = performance.now();
  const stop = () => { running = false; cancelAnimationFrame(raf); context.signal?.removeEventListener('abort', stop); return {count, elapsed: performance.now() - started}; };
  context.signal?.addEventListener('abort', stop, {once: true});
  return stop;
 }
 function point(stroke, u, rect, pointerType, pressure, stamp) {
  return {pointerId: 71, pointerType, button: 0, buttons: 1, pressure, tiltX: 0, tiltY: 0, twist: 0, isPrimary: true,
   clientX: rect.left + rect.width * (stroke.from[0] + (stroke.to[0] - stroke.from[0]) * u) + stroke.wiggle * Math.sin(u * 9),
   clientY: rect.top + rect.height * (stroke.from[1] + (stroke.to[1] - stroke.from[1]) * u),
   timeStamp: stamp, target: _rapierDrawState.svgRoot, preventDefault() {}, stopPropagation() {}, getCoalescedEvents() { return []; }};
 }
 async function stroke(stroke, recipe, index, context) {
  check(context);
  const rect = _rapierDrawState.surface.querySelector('.rapier-draw-stage').getBoundingClientRect();
  if (!rect.width || !rect.height) throw new Error('The benchmark drawing is not visible.');
  const begun = performance.now(), count = Math.round(stroke.durationMs / recipe.sampleIntervalMs);
  const event = (u, stamp, pressure = recipe.pressure) => point(stroke, u, rect, recipe.pointerType, pressure, stamp);
  const random = Math.random;
  try { Math.random = () => (recipe.seed + index) / 0x3fffffff; _rapierDrawOnPointerDown(event(0, begun)); }
  finally { Math.random = random; }
  const gesture = _rapierDrawState.gesture;
  if (gesture?.kind !== 'paint') throw new Error('The painting owner refused the scripted stroke.');
  for (let i = 1; i <= count; i++) {
   const due = begun + i * recipe.sampleIntervalMs;
   await pause(due - performance.now(), context);
   if (gesture.paint?.discarded) throw new Error('The painting owner discarded the scripted stroke.');
   context.graphics.inputDelays.push(Math.max(0, performance.now() - due));
   _rapierDrawOnPointerMove(event(i / count, due));
  }
  _rapierDrawOnPointerUp(event(1, begun + stroke.durationMs, 0));
  await until(() => gesture.paint?.lifted || gesture.paint?.discarded, context);
  if (gesture.paint?.discarded) throw new Error('The painting owner did not retain the stroke.');
  if (gesture.waterStroke) await abortable(gesture.waterStroke.promise, context);
  const layer = _rapierPaintLayer();
  if (!layer?.surface || layer.surface.failure) throw layer?.surface?.failure || new Error('The live painting disappeared.');
  await abortable(layer.surface.sync(), context);
  return count + 2;
 }
 async function replay(context) {
  const recipe = context.graphics.input.recipe;
  let samples = 0;
  for (const [index, item] of recipe.strokes.entries()) {
   _rapierWaterSet('pigment', item.pigment);
   samples += await stroke(item, recipe, index, context);
   await pause(item.pauseMs, context);
  }
  return samples;
 }
 async function prepare(run, context) {
  if (!globalThis.RapierBenchSession?.active) throw new Error('Graphics measurements require an isolated benchmark session.');
  check(context);
  context.graphics = {run, completed: false, inputDelays: []};
  const state = context.graphics;
  if (run.id === 'paintings.open-three') {
   state.input = await savedRecipe(context);
   const empty = await rapierLoad('', 'benchmark-empty.md', {signal: context.signal, documentKind: 'markdown', returnReceipt: true});
   if (!empty || !_rapierLoadReceiptIsCurrent(empty) || !rapierSetMode('read', {announce: false})) throw new Error('The empty editor could not be prepared.');
   await globalThis.RapierEmbeddedImages.whenJxlDisplayKnown();
   state.displayJXL = globalThis.RapierEmbeddedImages.jxlDisplayable();
  } else if (run.id === 'jxl.decode') {
   await nativeDecoder(context); state.input = await savedRecipe(context);
  } else if (run.id.startsWith('painting.save-') || run.id === 'jxl.encode-effort7') {
   if (run.id.startsWith('painting.save-') && typeof _rapierPaintRecompress !== 'function') unsupported('This release does not include the fast painting and idle recompression owners.', run.id === 'painting.save-fast' ? 'FAST_PAINT_OWNER_UNAVAILABLE' : 'IDLE_PAINT_OWNER_UNAVAILABLE');
   if (run.id === 'painting.save-effort7') await nativeDecoder(context);
   state.input = await picture(context);
   if (run.id === 'painting.save-effort7') state.fast = await abortable(_rapierPaintEncodeJXL(_rapierPaintPixelsSurface(state.input.pixels), null, {lossless: true}, {signal: context.signal}), context);
  } else if (run.id.startsWith('water.')) {
   state.input = await loadFixture('water-video-v1', context);
   await waterOwner(run, context);
   if (!run.id.endsWith('.paper-bake')) {
    await drawing('water', context);
    if (run.id.endsWith('.reopen')) {
     await replay(context);
     await abortable(_rapierDrawSetTool('select'), context);
     const target = _rapierDrawState.recipe.shapes.slice().reverse().find(shape => shape.paint?.mode === 'water');
     if (!target || !globalThis.RapierDrawAgentPaint.waterPaintingIsLive(target, _rapierWaterSession())) throw new Error('The Water owner did not retain this session’s published journal.');
     state.reopenId = target.id; state.reopenRaster = target.raster;
     state.inputDelays = [];
     state.baselineSurface = state.remote.surface(1, 1, {mode: 'water', pixelScale: 2, paper: 'cold-press', seed: 111});
     await abortable(state.baselineSurface.sync(), context);
     await frames(context);
     state.beforeTiming = (await abortable(state.remote.client.request('stats', {surfaceId: state.baselineSurface.id}), context)).meta?.timing || null;
    } else {
     const layer = await abortable(_rapierWaterLayer(true), context);
     await abortable(layer.surface.sync(), context);
     await frames(context);
     state.beforeTiming = (await abortable(state.remote.client.request('stats', {surfaceId: layer.surface.id}), context)).meta?.timing || null;
    }
   }
  } else if (run.id === 'paint.dieterle-60hz') {
   state.input = await loadFixture('paint-dieterle-v1', context);
   await drawing('paint', context);
   const brush = globalThis.RapierDrawBrushes.paintBrushById(state.input.recipe.brush);
   if (!brush) unsupported('The bundled Dieterle brush is unavailable.');
   _rapierDrawState.paintBrush = brush.id; _rapierDrawState.paintSize = state.input.recipe.size;
   await abortable(_rapierPaintStartPainter('paint'), context);
  } else throw new RangeError('Unknown graphics run: ' + run.id);
 }
 async function execute(run, context) {
  check(context);
  const state = context.graphics, started = performance.now();
  let extra = {}, details = {};
  if (run.id === 'paintings.open-three') {
   const receipt = await rapierLoad(state.input.source, 'Water studies.md', {signal: context.signal, documentKind: 'markdown', returnReceipt: true});
   if (!receipt || !_rapierLoadReceiptIsCurrent(receipt)) throw new Error('The document owner did not admit the painting fixture.');
   extra.openOwnerMs = performance.now() - started;
   await frames(context); extra.readableTwoFramesMs = performance.now() - started;
   if (state.displayJXL) {
    for (const id of state.input.labels) {
     const row = await abortable(globalThis.RapierEmbeddedImages.present(state.input.source, id), context);
     if (row.undisplayable || row.damaged) throw new Error('A saved painting could not be presented.');
    }
    extra.picturesReadyMs = performance.now() - started;
    extra.picturesReady = 3;
   } else { extra.picturesReadyMs = missing('Native JPEG XL image display is unavailable.'); extra.picturesReady = missing('Native JPEG XL image display is unavailable.'); }
   details.pictureBoundary = 'All three original SVGs decoded by the product image owner; viewport visibility is not asserted.';
   details.projection = rapier.document.projection?.wysiwyg?.available === false ? 'source fallback' : 'rich document';
  } else if (run.id === 'jxl.decode') {
   const raster = state.input.recipe.shapes[0].raster;
   state.decoded = await abortable(globalThis.RapierDrawAgentPaint.decodeNativePaintJXL(raster, {signal: context.signal}), context);
   if (!state.decoded) unsupported('The native decoder cannot return exact straight RGBA for this JPEG XL.');
   extra.decodeOwnerMs = performance.now() - started; extra.inputBytes = bytesOf(raster).length;
   details.owner = 'Native painting ImageDecoder, straight RGBA';
  } else if (run.id === 'jxl.encode-effort7') {
   const {pixels} = state.input;
   const result = await abortable(globalThis.RapierEmbeddedImages.codec('encode', {width: pixels.width, height: pixels.height, data: new Uint8Array(pixels.data), options: {lossless: true, effort: 7}}, {signal: context.signal}), context);
   state.encoded = result.bytes || result;
   extra.encodeOwnerMs = performance.now() - started; extra.outputBytes = state.encoded.length;
   details.owner = 'Bundled JPEG XL image worker, lossless effort 7';
  } else if (run.id === 'painting.save-fast') {
   const result = await abortable(_rapierPaintEncodeJXL(_rapierPaintPixelsSurface(state.input.pixels), null, {lossless: true}, {signal: context.signal}), context);
   if (result.options?.losslessProfile !== 'painting') unsupported('The fast painting save profile is not available in this release.');
   state.encoded = bytesOf(result.url);
   extra.saveOwnerMs = performance.now() - started; extra.outputBytes = state.encoded.length;
   details.owner = 'Painting lossless save owner; encoding only, before durable document insertion';
  } else if (run.id === 'painting.save-effort7') {
   const result = await abortable(_rapierPaintRecompress(state.fast.url, {source: state.input.raster, box: {x0: 0, y0: 0, x1: 779, y1: 1583}}, {signal: context.signal}), context);
   if (!result) unsupported('The idle painting verifier could not establish an exact smaller candidate.');
   state.encoded = bytesOf(result);
   extra.saveOwnerMs = performance.now() - started; extra.outputBytes = state.encoded.length;
   details.owner = 'Idle painting effort-7 encoder and exact-channel verifier; before document replacement';
  } else if (run.id.endsWith('.paper-bake')) {
   const r = state.input.recipe;
   state.surface = state.remote.surface(r.width, r.height, {mode: 'water', paper: r.paper, pixelScale: r.pixelScale, seed: r.seed});
   await abortable(state.surface.sync(), context);
   extra.paperBakeMs = performance.now() - started;
   extra.sheetPixels = state.surface.width * state.surface.height;
   details.owner = 'Water worker surface creation, shader compilation and completed paper bake';
   details.shaderPath = state.shaderPath;
  } else if (run.id.endsWith('.replay') || run.id.endsWith('.reopen')) {
   let surface = _rapierPaintLayer()?.surface, before = state.beforeTiming, samples = 0;
   const stopMeter = meter(context);
   try {
    if (run.id.endsWith('.reopen')) {
     await abortable(_rapierDrawSetTool('water'), context);
     _rapierDrawState.paintChosenId = state.reopenId;
     const recipe = state.input.recipe, first = recipe.strokes[0];
     const rect = _rapierDrawState.surface.querySelector('.rapier-draw-stage').getBoundingClientRect();
     const event = point(first, 0, rect, recipe.pointerType, recipe.pressure, performance.now());
     const random = Math.random;
     try { Math.random = () => recipe.seed / 0x3fffffff; _rapierDrawOnPointerDown(event); }
     finally { Math.random = random; }
     const gesture = state.reopenGesture = _rapierDrawState.gesture;
     if (gesture?.kind !== 'paint') throw new Error('The Water owner refused the reopening stroke.');
     await until(() => gesture.paint?.pending === false || gesture.paint?.discarded, context);
     if (gesture.paint?.discarded) throw new Error('The reopened Water material could not receive a stroke.');
     const layer = _rapierPaintLayer();
     await abortable(layer.surface.sync(), context);
     if (!gesture.paintRollback || layer.waterMaterial) throw new Error('The wet journal was not restored before the first dab.');
     extra.reopenOwnerMs = performance.now() - started;
     samples = 1;
     details.reopenSource = 'The current session’s six-stroke video journal, published by the real Water tool before a Select-to-Water reopen.';
     details.reopenBoundary = 'Tool selection to first dab queued and its actual GPU surface synchronized; rollback is outside measurement.';
    } else samples = await replay(context);
    surface = _rapierPaintLayer()?.surface;
    if (!surface) throw new Error('The Water owner did not retain a surface.');
    await abortable(surface.sync(), context); await frames(context);
    const finalStats = await abortable(state.remote.client.request('stats', {surfaceId: surface.id}), context);
    const measured = stopMeter();
    extra = {...extra, ...waterNumbers(before, finalStats.meta?.timing, measured.elapsed, context), pageFps: measured.count * 1000 / measured.elapsed, inputSamples: samples};
    const simulation = finalStats.meta?.stats?.simulation;
    extra.sheetPixels = surface.width * surface.height;
    if (simulation) extra.simulationPixels = simulation[0] * simulation[1];
    details.shaderPath = state.shaderPath;
    details.workerMs = 'Difference of production busy counters at observed interval boundaries, divided by presentations';
    details.gpuMs = 'GPU timestamp-query mean per completed command buffer';
    details.gpuQueueMs = 'Submit-to-onSubmittedWorkDone mean per presentation, as in the Water readout';
    details.presentedFps = 'Water worker presentations, as in the Water readout; not a compositor display receipt';
   } finally { stopMeter(); }
  } else if (run.id === 'paint.dieterle-60hz') {
   const stopMeter = meter(context);
   try {
    const samples = await stroke(state.input.recipe.stroke, state.input.recipe, 0, context);
    await abortable(_rapierPaintFlushRevision(_rapierPaintLayer(), true), context);
    await frames(context);
    const measured = stopMeter();
    extra = {inputSamples: samples, pageFps: measured.count * 1000 / measured.elapsed, strokeOwnerMs: performance.now() - started};
    details.brush = state.input.recipe.brush;
    details.input = '120 movement samples scheduled at 60 Hz through the product pointer handlers';
   } finally { stopMeter(); }
  }
  if (state.inputDelays.length) {
   const delays = state.inputDelays.slice().sort((a, b) => a - b);
   const left = delays[Math.floor((delays.length - 1) / 2)], right = delays[Math.ceil((delays.length - 1) / 2)];
   extra.inputDelayMedianMs = left + (right - left) / 2;
   extra.inputDelayP95Ms = delays[Math.ceil(delays.length * .95) - 1];
   extra.inputLateSamples = delays.filter(delay => delay > state.input.recipe.sampleIntervalMs).length;
  }
  if (state.identity) details.identity = state.identity;
  check(context); state.completed = true; return {extra, details};
 }
 async function verify(run, value, context) {
  check(context);
  const state = context.graphics;
  if (!state.completed) throw new Error('The graphics operation did not complete.');
  if (run.id === 'paintings.open-three' && _rapierSourceText() !== state.input.source) throw new Error('Opening the paintings changed the fixture document.');
  if (state.decoded && await hash(state.decoded.data) !== 'f5cb451a86e65daec44def329da469c16e2f37ae12dee51006725a8c3ec5401f') throw new Error('JPEG XL decoding changed the pinned straight channels.');
  const proof = {fixture: state.input.metadata.id};
  if (state.encoded) {
   const info = globalThis.RapierImageAssets.inspectJPEGXL(state.encoded);
   if (info.width !== state.input.metadata.width || info.height !== state.input.metadata.height) throw new Error('The encoded painting has different dimensions.');
   proof.encoded = {bytes: state.encoded.length, sha256: await hash(state.encoded), width: info.width, height: info.height};
   const raster = 'data:image/jxl;base64,' + RapierBundleIO.toBase64(state.encoded);
   const decoded = await abortable(globalThis.RapierDrawAgentPaint.decodeNativePaintJXL(raster, {signal: context.signal}), context);
   if (decoded) {
    if (decoded.width !== info.width || decoded.height !== info.height || await hash(decoded.data) !== state.input.metadata.rgbaSha256) throw new Error('The encoded painting changed its exact straight channels.');
    proof.exactChannels = 'Verified by native straight-channel decode against the pinned RGBA hash.';
   } else proof.exactChannels = missing('Native straight-channel JPEG XL decoding is unavailable; header and dimensions checked only.');
  }
  if (state.reopenGesture) {
   const target = _rapierDrawState.recipe.shapes.find(shape => shape.id === state.reopenId);
   if (!target || target.raster !== state.reopenRaster) throw new Error('The reopening probe changed the kept painting before its rollback.');
   proof.reopen = 'Current-session publication retained; a checkpoint owns the uncommitted probe dab.';
  }
  return proof;
 }
 async function cleanup(context) {
  const state = context.graphics;
  if (!state) return;
  try { _rapierDrawCancelGesture(); } catch (_) {}
  const layer = _rapierPaintLayer();
  if (layer) {
   for (const key of ['raf', 'holdRaf', 'dryRaf']) if (layer[key]) cancelAnimationFrame(layer[key]);
   if (layer.pngWorker) { layer.pngWorker.worker.terminate(); URL.revokeObjectURL(layer.pngWorker.url); layer.pngWorker = null; }
   try { _rapierPaintFinishClose(layer); } catch (_) {}
  }
  try { state.surface?.drop(); state.baselineSurface?.drop(); } catch (_) {}
  const closing = [];
  for (const holder of _rapierPaintPainters.values()) if (holder.remote) closing.push(Promise.resolve(holder.remote.close()).catch(() => {}));
  _rapierPaintPainters.clear();
  for (const holder of _rapierDrawPaintWorkers.values()) if (holder.client) closing.push(Promise.resolve(holder.client.close()).catch(() => {}));
  _rapierDrawPaintWorkers.clear();
  await Promise.all(closing);
  globalThis.__rapierWaterUnfilteredTest = false;
  context.graphics = null;
 }
 (globalThis.RapierPhoneBenchAdapters ||= {}).graphics = Object.freeze({prepare, execute, verify, cleanup});
})();
