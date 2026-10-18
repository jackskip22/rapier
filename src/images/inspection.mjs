// SPDX-License-Identifier: AGPL-3.0-only
import {createWorkerExecution} from '../shell/worker-execution.mjs';
import {decodeDataImageBytes, imageDimensions, inspectJPEGXL, normalizeSVG, encodeBase64, createAsset, UNSTATED_SIZE} from './assets.mjs';
import {inspectDrawingSource} from '../draw/inspection.mjs';
import {RAPIER_DRAW_PAINT_INK_FILTER} from '../draw/core.mjs';
import {_rapierColorForDarkPaper} from '../editor/colour-math.mjs';
import {jxlWhole} from './jxl-native.mjs';
import {portablePaintPNG, validatePaintRaster} from './paint-raster.mjs';
import {inspectGIF} from './gif.mjs';
export {jxlWhole, portablePaintPNG, validatePaintRaster};

export function inkForPaper(text, {dark = true, paperInk = null} = {}) {
  if (!/<metadata id="rapier-(?:draw|element)">/.test(text) || text.includes('<g data-rapier-background="paper"')) return text;
  const own = /<style>@media \(prefers-color-scheme:dark\)\{([^<]*)\}<\/style>/.exec(text);
  if (!dark) return (own ? text.replace(own[0], '') : text).replace(
    /<style>\.(rapier-bg-[a-z0-9]+)-d\{display:none\}@media \(prefers-color-scheme:dark\)\{\.\1-l\{display:none\}\.\1-d\{display:inline\}\}<\/style>/g,
    '<style>.$1-d{display:none}</style>');
  const named = new Set([...(own?.[1] || '').matchAll(/\[(fill|stroke|color|stop-color)="(#[0-9a-f]{6})"\]/g)].map(m => m[1] + m[2]));
  let out = own ? text.replace(own[0], () => '<style>' + own[1] + '</style>') : text;
  const kept = [], parts = [];
  let at = 0;
  for (let start = out.indexOf('<g data-rapier-background=', at); start >= 0; start = out.indexOf('<g data-rapier-background=', at)) {
    const tags = /<\/?g\b[^>]*>/g; tags.lastIndex = start;
    let depth = 0, end = -1;
    for (let tag; (tag = tags.exec(out));) {
      if (tag[0][1] === '/') depth--; else if (!tag[0].endsWith('/>')) depth++;
      if (depth === 0) { end = tags.lastIndex; break; }
    }
    if (end < 0) break;
    parts.push(out.slice(at, start), '\u0000' + kept.length + '\u0000');
    kept.push(out.slice(start, end)); at = end;
  }
  parts.push(out.slice(at)); out = parts.join('');
  const colours = new Map();
  out = out.replace(/<[^>]+>/g, tag => tag.replace(/\b(fill|stroke|color|stop-color)="(#[0-9a-fA-F]{6})"/g, (match, attr, hex) => {
    const low = hex.toLowerCase();
    if (named.has(attr + low)) return match;
    if (!colours.has(low)) colours.set(low, low === '#121212' && paperInk ? paperInk : _rapierColorForDarkPaper(low));
    return attr + '="' + colours.get(low) + '"';
  }));
  if (out.includes('data-rapier-paint=') && !own?.[1].includes('[data-rapier-paint]')) out = out.replace(/<\/metadata>/, '</metadata>' + RAPIER_DRAW_PAINT_INK_FILTER)
    .replace(/<image data-rapier-paint=/g, '<image filter="url(#rapier-paint-ink)" data-rapier-paint=');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
}

async function inspectImageSource(url, {dark = false, paperInk = null} = {}) {
  const {bytes, codec} = decodeDataImageBytes(url);
  let size, containerDamaged = false;
  try { size = imageDimensions(bytes, codec); }
  catch (error) {
    if (codec !== 'image/jxl') throw error;
    containerDamaged = true; size = UNSTATED_SIZE;
  }
  let canonical = bytes, normalizedUrl = null, darkBlob = null, recipe = null, recipeError = null, resources = null, damaged = null;
  if (codec === 'image/jxl' && !containerDamaged) { const whole = await jxlWhole(bytes); damaged = whole === null ? null : !whole; }
  if (codec === 'image/svg+xml') {
    canonical = normalizeSVG(bytes);
    if (canonical.length !== bytes.length || canonical.some((byte, at) => byte !== bytes[at]))
      normalizedUrl = 'data:image/svg+xml;base64,' + encodeBase64(canonical);
    if (dark) {
      const text = new TextDecoder().decode(canonical), inked = inkForPaper(text, {paperInk});
      if (inked !== text) darkBlob = new Blob([inked], {type: codec});
    }
    try { const drawing = await inspectDrawingSource(url); recipe = drawing?.recipe || null; resources = drawing?.resources || null; }
    catch (error) { if (error.code === 'drawing_restore_failed') recipeError = {code: error.code, message: error.message}; }
  }
  const gif = codec === 'image/gif' ? inspectGIF(bytes) : null;
  const animated = !!(gif?.animated || codec === 'image/jxl' && !containerDamaged && inspectJPEGXL(bytes).animated || codec === 'image/svg+xml' && /<(?:animate\w*|set)\b|@keyframes\b|animation(?:-name)?\s*:/i.test(new TextDecoder().decode(canonical)));
  let blob = new Blob([gif?.first || canonical], {type: codec}), playbackUnavailable = false;
  if (codec === 'image/jxl' && animated) {
    if (typeof ImageDecoder === 'function' && await ImageDecoder.isTypeSupported(codec)) {
      if (size.width * size.height > 24000000) throw new Error('Animated JPEG XL exceeds the pixel budget');
      const decoder = new ImageDecoder({data: canonical, type: codec, preferAnimation: true});
      try {
        const first = await decoder.decode({frameIndex: 0, completeFramesOnly: true}).catch(error => { if (error?.name === 'EncodingError') return null; throw error; });
        if (!first) { blob = new Blob([], {type: 'image/png'}); playbackUnavailable = true; }
        else {
          const {image, complete} = first;
          try {
            if (!complete || image.displayWidth !== size.width || image.displayHeight !== size.height) throw new Error('JPEG XL dimensions changed');
            const canvas = new OffscreenCanvas(size.width, size.height);
            try {canvas.getContext('2d').drawImage(image, 0, 0); blob = await canvas.convertToBlob({type: 'image/png'});}
            finally {canvas.width = canvas.height = 0;}
          } finally {image.close();}
        }
      } finally {decoder.close();}
    } else {blob = new Blob([], {type: 'image/png'}); playbackUnavailable = true;}
  }
  return {...size, type: codec, animated, playbackUnavailable, url: normalizedUrl, blob, darkBlob,
    recipe, recipeError, resources, containerDamaged, damaged, darkReady: dark};
}

export function installImageInspectionWorker(scope) {
  const inputs = new Map();
  let queue = Promise.resolve();
  scope.onmessage = ({data}) => {
    const id = data?.id;
    if (data?.operation === 'begin') { inputs.set(id, {parts: [], options: data.options, kind: data.kind}); return; }
    const input = inputs.get(id);
    if (!input) return;
    if (data.operation === 'cancel') { inputs.delete(id); return; }
    if (data.operation === 'part') { input.parts.push(data.text); return; }
    if (data.operation !== 'finish') return;
    const run = async () => {
      if (inputs.get(id) !== input) return;
      try {
        const url = input.parts.join(''); input.parts = [];
        const result = input.kind === 'drawing' ? await inspectDrawingSource(url, input.options)
          : input.kind === 'asset' ? await createAsset(new TextEncoder().encode(url), null, {codec: 'image/svg+xml', title: input.options.title})
          : await inspectImageSource(url, input.options);
        if (inputs.get(id) !== input) return;
        const transfer = new Set(result?.bytes ? [result.bytes.buffer] : []);
        for (const pixels of result?.paintPixels || []) transfer.add(pixels.data.buffer);
        scope.postMessage({id, result}, [...transfer]);
      } catch (error) {
        if (inputs.get(id) === input) scope.postMessage({id, error: {name: error.name, message: error.message, code: error.code}});
      } finally { inputs.delete(id); }
    };
    queue = queue.then(run, run);
  };
  return () => inputs.clear();
}

let client = null, serial = 0, idle = 0;
const requests = new Map();
const cancelled = () => Object.assign(new Error('Image inspection canceled'), {name: 'AbortError'});
function finish(id, error, result) {
  const request = requests.get(id);
  if (!request) return;
  requests.delete(id); clearTimeout(request.timer);
  request.signal?.removeEventListener('abort', request.abort);
  if (error) request.reject(error); else request.resolve(result);
  if (!requests.size) idle = setTimeout(() => close(), 30000);
}
export function close(reason = cancelled()) {
  clearTimeout(idle); idle = 0;
  if (client) { client.onmessage = null; client.onerror = null; client.onmessageerror = null; client.terminate(); client = null; }
  for (const id of requests.keys()) finish(id, reason);
  clearTimeout(idle); idle = 0;
}
function openWorker() {
  if (client) return client;
  const source = globalThis.RapierImageInspection?.workerSource;
  if (typeof source !== 'function') throw new Error('Image inspection is unavailable');
  client = createWorkerExecution({source, name: 'rapier-images', install: installImageInspectionWorker});
  client.onmessage = ({data}) => finish(data?.id, data?.error ? Object.assign(new Error(data.error.message), data.error) : null, data?.result);
  client.onerror = event => { event.preventDefault?.(); close(new Error(event.message || 'Image inspection worker stopped')); };
  client.onmessageerror = () => close(new Error('Image inspection worker returned an unreadable result'));
  return client;
}
async function inspect(url, kind, options, signal) {
  signal?.throwIfAborted();
  const worker = openWorker(), id = ++serial;
  clearTimeout(idle); idle = 0;
  const result = new Promise((resolve, reject) => {
    const abort = () => { worker.postMessage({id, operation: 'cancel'}); finish(id, signal.reason || cancelled()); };
    const timer = setTimeout(() => { worker.postMessage({id, operation: 'cancel'}); finish(id, new Error('Image inspection took too long')); }, 120000);
    requests.set(id, {resolve, reject, signal, abort, timer});
    signal?.addEventListener('abort', abort, {once: true});
  });
  const feed = async () => {
    worker.postMessage({id, operation: 'begin', kind, options});
    let turn = performance.now();
    for (let at = 0; at < url.length; at += 65536) {
      if (!requests.has(id)) return;
      worker.postMessage({id, operation: 'part', text: url.slice(at, at + 65536)});
      if (performance.now() - turn >= 4) { await new Promise(resolve => setTimeout(resolve, 0)); turn = performance.now(); }
    }
    if (requests.has(id)) worker.postMessage({id, operation: 'finish'});
  };
  void feed().catch(error => finish(id, error));
  return result;
}
export function prepareImage(url, {dark = false, paperInk, signal} = {}) { return inspect(url, 'image', {dark, paperInk}, signal); }
export function inspectDrawing(url, {kind = 'recipe', signal} = {}) { return inspect(url, 'drawing', {kind}, signal); }
export function createDrawingAsset(text, {title = '', signal} = {}) { return inspect(text, 'asset', {title}, signal); }
