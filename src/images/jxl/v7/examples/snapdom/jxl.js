import { measure, pageRects } from 'rapier-jxl/page-rects';

export function jxl(options = {}) {
  const { module = 'rapier-jxl/capture-complete', codec, effort: preset, webgpu } = options;
  const id = JSON.stringify([module, preset, webgpu]);
  const made = codec ? byCodec.get(codec) ?? byCodec.set(codec, new Map()).get(codec) : plugins;
  if (!made.has(id)) made.set(id, create(module, codec, preset, webgpu));
  return made.get(id);
}

const plugins = new Map(), byCodec = new WeakMap();

function create(name, codec, preset, webgpu) {
  const module = typeof name === 'string' ? name.replace(/^jpegxl\//, 'rapier-jxl/') : name;
  const exactOnly = module === 'rapier-jxl/capture';
  const edges = module !== 'rapier-jxl/upload';
  if (!MODULES.includes(module)) throw new Error(`The jxl plugin's module is ${MODULES.join(', ')} or left out.`);
  if (webgpu !== undefined && module !== COMPLETE) throw new Error(`jxl({module: '${name}'}) runs on WebAssembly; remove webgpu.`);
  if (!codec && module !== COMPLETE) throw new Error(`jxl({module: '${name}'}) needs its codec: import * as codec from '${name}' and pass {codec}.`);
  if (!codec) door().catch(() => {});
  return {
    name: 'jxl',
    pure: true,

    ...(exactOnly ? {} : {
      afterClone(context) {
        const element = context.element;
        const keep = context.nodeMap ? new Set(context.nodeMap.values()) : undefined;
        try {
          context[SNAPSHOT] = element ? { ...measured(measure, element, edges, keep), frame: frameOf(element, context.outerTransforms !== false) } : null;
        } catch (error) {
          context[SNAPSHOT] = { error };
        }
      },
    }),

    defineExports: ({ exports }) => {
      const encodedOnce = async (context, options, callbacks) => {
        const asked = context.export?.requestedOptions ?? {}, pick = k => options[k] !== undefined ? options[k] : asked[k];
        const effort = pick('effort') ?? preset, signal = pick('signal'), onProgress = pick('onProgress'), onEncoded = pick('onEncoded');
        const observe = async (callback, value) => {
          try { await abortable(Promise.resolve(callback(value)), signal); }
          catch (error) { callbacks.failed = true; throw error; }
        };
        signal?.throwIfAborted();
        if (context[SNAPSHOT]?.error) throw context[SNAPSHOT].error;
        const encoder = codec ?? await abortable(door(), signal);
        (module === 'rapier-jxl/upload' ? encoder.prepare('capture') : encoder.prepare()).catch(() => {});
        const drawOptions = { ...options }, suppliedCanvas = drawOptions.canvas;
        let canvas;
        try {
          await abortable(Promise.resolve(exports.canvas(drawOptions)).then(drawn => {
            if (signal?.aborted) {
              if (drawn !== suppliedCanvas) free(drawn);
              signal.throwIfAborted();
            }
            canvas = drawn;
          }), signal);
          signal?.throwIfAborted();

          const quality = Number.isFinite(options.quality) && options.quality >= 0 && options.quality <= 1 ? options.quality : 0.92;
          const photo = { quality: Math.max(1, quality * 100) };
          const both = o => Number.isFinite(o?.width) && o.width > 0 && Number.isFinite(o?.height) && o.height > 0;
          const fitted = both(context) && !safari(), exported = both(options) && firefox() && options;
          const shot = inView(context[SNAPSHOT], context.meta, fitted, exported, options.crop);
          const unclipped = shot && safari() && context.meta?.clip ? inView(context[SNAPSHOT], { ...context.meta, clip: null }, fitted, exported, options.crop) : null;
          const area = {};

          const naturalW = shot?.box.width, naturalH = shot?.box.height;
          const below = !!(shot && naturalW && naturalH &&
            (canvas.width < Math.floor(naturalW) || canvas.height < Math.floor(naturalH)));
          const measured = [shot, unclipped].filter(Boolean).map(s => pageRects(s, canvas, { area, edges: !below && (effort ?? 3) >= 4 }));
          let rects = quality < 1 && !exactOnly && measured.length
            ? { exactRects: measured.flatMap(r => r.exactRects), photoRects: measured.flatMap(r => r.photoRects),
              ...(measured.every(r => r.textComplete === true) && { textComplete: true }) } : null;
          if (below && (!rects?.photoRects?.length || atLimit(canvas))) rects = null;
          if (rects && !below) {
            const under = await abortable(withoutText(context, options, canvas, rects), signal).catch(error => { if (signal?.aborted) throw error; return null; });
            if (under) rects = { ...rects, withoutText: under };
          }

          const base = { ...(effort !== undefined && { effort }), ...(webgpu !== undefined && { webgpu }), ...(signal && { signal }) };
          const rising = onProgress && (f => { if (f < 1) return observe(onProgress, f); });
          const file = below && rects
            ? await smaller(encoder, canvas, base, [{ fidelity: photo, ...rects }, { fidelity: 'exact' }], { signal, onProgress: rising })
            : await encoder.capture(canvas, {
              ...(rects ? { fidelity: photo, ...rects } : { fidelity: 'exact' }),
              ...base, ...(rising && { onProgress: rising }),
            });
          signal?.throwIfAborted();
          bytesOf(file);
          const record = { exact: file.kept === 'pixels', ...(file.textMarks && { textMarks: file.textMarks }) }, { exact } = record;
          if (onEncoded != null) await observe(onEncoded, record);
          signal?.throwIfAborted();
          if (onProgress != null) await observe(onProgress, 1);
          signal?.throwIfAborted();
          return { blob: new Blob([bytesOf(file)], { type: 'image/jxl' }), canvas, exact, own: canvas !== suppliedCanvas };
        } catch (error) {
          if (canvas !== suppliedCanvas) free(canvas);
          throw error;
        }
      };
      const encoded = async (context, options) => {
        const callbacks = {failed: false};
        try { return await encodedOnce(context, options, callbacks); } catch (error) {
          if (callbacks.failed) throw error;
          const asked = context.export?.requestedOptions ?? {}, signal = options.signal !== undefined ? options.signal : asked.signal;
          if (!blankCanvas(error) || options.canvas || signal?.aborted) throw error;
          return encodedOnce(context, options, callbacks);
        }
      };
      const encode = async (context, options) => {
        const { blob, canvas, own } = await encoded(context, options);
        if (own) free(canvas);
        return blob;
      };
      const isJxl = (context, options) => {
        if (String(options.format).toLowerCase() === 'jxl') return true;
        const asked = context.export?.requestedOptions ?? options;
        return asked.format === undefined && String(asked.type).toLowerCase() === 'jxl' &&
          (options.__explicitFormat ?? null) === (context.__explicitFormat ?? null);
      };
      const signalOf = (context, options) => options.signal ?? context.export?.requestedOptions?.signal;

      return {
        jxl: async (context, options = {}) => {
          const { blob, canvas: drawn, exact, own } = await encoded(context, options);
          return image(blob, drawn, own, options.dpr || 1, signalOf(context, options), exact);
        },
        blob: (context, options = {}) => isJxl(context, options) ? encode(context, options) : exports.blob(options),
        async download(context, options = {}) {
          const format = isJxl(context, options) ? 'jxl' : options.format === 'jpg' ? 'jpeg' : options.format || 'png';
          const name = options.filename || 'snapdom';
          const filename = /\.(png|jpe?g|webp|svg|jxl)$/i.test(name) ? name : `${name}.${format}`;
          const next = { ...options, dpr: 1 };
          const blob = format === 'jxl' ? await encode(context, next) : await exports.blob({ ...next, format });
          signalOf(context, options)?.throwIfAborted();
          await save(blob, filename);
        },
      };
    },
  };
}

const SNAPSHOT = Symbol('jxl measurement');
const atLimit = ({ width, height }) => [16384, 32767].includes(Math.max(width, height)) || width * height > 0.99 * 16384 * 16384;
const MAX_PIXELS = 16384 * 16384;
let decoder = null, complete = null;

const COMPLETE = 'rapier-jxl/capture-complete';
const MODULES = [COMPLETE, 'rapier-jxl/capture', 'rapier-jxl/upload'];
const door = () => complete ??= import('rapier-jxl/capture-complete').catch(error => { complete = null; throw needs(error); });
const needs = error => new Error('The jxl plugin needs rapier-jxl 8.4.0 or later: npm install rapier-jxl', { cause: error });

function measured(measure, element, edges, keep) {
  const lift = keep ? liftOf(element) : 0;
  if (!lift) return measure(element, { edges, keep });
  const placed = onPage(element.ownerDocument.body), inFlow = new Set(keep);
  for (const el of placed) inFlow.delete(el);
  const up = r => ({ ...r, top: r.top - lift, bottom: r.bottom - lift });
  const shot = measure(element, { edges, keep: inFlow });
  shot.text = shot.text.map(t => ({ ...t, r: up(t.r) }));
  shot.photos = shot.photos.map(up);
  if (shot.edges) shot.edges = shot.edges.map(up);
  for (const el of placed) {
    if (!keep.has(el)) continue;
    const own = measure(el, { edges, keep });
    shot.text.push(...own.text);
    shot.photos.push(...own.photos);
    if (shot.edges) shot.edges.push(...own.edges);
  }
  return shot;
}

function liftOf(element) {
  const doc = element.ownerDocument, body = doc?.body;
  if (element !== doc?.documentElement || !body) return 0;
  const s = getComputedStyle(element);
  if (parseFloat(s.borderTopWidth) || parseFloat(s.paddingTop) || /flex|grid|table|inline-block|flow-root/.test(s.display) ||
    s.position === 'absolute' || s.position === 'fixed' || s.float !== 'none' || s.overflowX !== 'visible' || s.overflowY !== 'visible' ||
    /layout|content|paint|strict/.test(s.contain)) return 0;
  const b = getComputedStyle(body), moved = b.position === 'relative' ? parseFloat(b.top) || 0 : 0;
  return body.getBoundingClientRect().top - moved - element.getBoundingClientRect().top;
}

function onPage(body) {
  const placed = [];
  const fixedBlock = s => s.transform !== 'none' || s.perspective !== 'none' || s.filter !== 'none' ||
    /layout|content|paint|strict/.test(s.contain) || /transform|perspective|filter/.test(s.willChange);
  const visit = (el, absolute, fixed) => {
    for (const child of el.children) {
      const s = getComputedStyle(child);
      if (s.position === 'absolute' && absolute || s.position === 'fixed' && fixed) { placed.push(child); continue; }
      visit(child, absolute && s.position === 'static' && !fixedBlock(s), fixed && !fixedBlock(s));
    }
  };
  const s = getComputedStyle(body);
  visit(body, s.position === 'static' && !fixedBlock(s), !fixedBlock(s));
  return placed;
}

function frameOf(element, keepsRotation) {
  try {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    const width = element.offsetWidth ?? box.width, height = element.offsetHeight ?? box.height;
    let flat = none(style.transform) && none(style.rotate) && none(style.scale);
    for (let up = element.parentElement ?? element.getRootNode?.().host; up && flat; up = up.parentElement ?? up.getRootNode?.().host) {
      const s = getComputedStyle(up);
      flat = none(s.transform) && none(s.rotate) && none(s.scale);
    }
    if (flat && Math.abs(box.width - width) < 0.5 && Math.abs(box.height - height) < 0.5) {
      return { toDrawn: p => ({ x: p.x - box.left, y: p.y - box.top }) };
    }
    const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat);
    const transform = style.transform === 'none' ? new DOMMatrix() : new DOMMatrix(style.transform);
    const rotate = style.rotate && style.rotate !== 'none' ? new DOMMatrix(`rotate(${style.rotate})`) : new DOMMatrix();
    const scale = style.scale && style.scale !== 'none' ? new DOMMatrix(`scale(${style.scale.split(' ').slice(0, 2).join(',')})`) : new DOMMatrix();
    transform.e = transform.f = 0;
    const live = rotate.multiply(scale).multiply(transform);
    const drawn = keepsRotation ? live : scale.multiply(scaleSkew(transform));
    for (let up = element.parentElement ?? element.getRootNode().host; up; up = up.parentElement ?? up.getRootNode().host) {
      const s = getComputedStyle(up), m = s.transform === 'none' ? null : new DOMMatrix(s.transform);
      if (m && (m.b || m.c) || s.rotate && s.rotate !== 'none') return null;
    }
    const corners = m => [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => m.transformPoint({ x, y }));
    const about = (m, x, y) => new DOMMatrix().translate(x, y).multiply(m).translate(-x, -y);
    const page = corners(about(live, ox, oy));
    const xs = page.map(p => p.x), ys = page.map(p => p.y);
    const near = v => Math.abs(v - 1) < 0.01 ? 1 : v;
    const sx = near(box.width / (Math.max(...xs) - Math.min(...xs) || 1)), sy = near(box.height / (Math.max(...ys) - Math.min(...ys) || 1));
    const toLayout = about(live, ox, oy).inverse()
      .multiply(new DOMMatrix().scale(1 / sx, 1 / sy).translate(-(box.left - Math.min(...xs) * sx), -(box.top - Math.min(...ys) * sy)));
    const shown = (keepsRotation ? about(live, ox, oy) : drawn).multiply(toLayout);
    return { toDrawn: p => shown.transformPoint(p) };
  } catch {
    return null;
  }
}

const none = v => !v || v === 'none';

const firefox = () => typeof navigator !== 'undefined' && (navigator.userAgent || '').toLowerCase().includes('firefox');

function safari() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent || '', low = ua.toLowerCase(), webkit = /applewebkit/i.test(ua);
  return low.includes('safari') && !/chrome|crios|fxios|android/.test(low) || webkit && /mobile/i.test(ua) && !/safari/i.test(ua) ||
    /(micromessenger|wxwork|wecom|windowswechat|macwechat)/i.test(ua) || /(baiduboxapp|baidubrowser|baidusearch|baiduboxlite)/i.test(low) ||
    /ipad|iphone|ipod/.test(low) && webkit;
}

function scaleSkew({ a, b, c, d }) {
  const sx = Math.hypot(a, b);
  if (!sx) return new DOMMatrix();
  const a1 = a / sx, b1 = b / sx, shear = a1 * c + b1 * d;
  const sy = Math.hypot(c - a1 * shear, d - b1 * shear);
  return new DOMMatrix([sx, 0, sy ? shear : 0, sy, 0, 0]);
}

function inView(shot, meta, fitted, exported, crop) {
  if (!shot?.frame || !meta || !(Number.isFinite(meta.vbW) && meta.vbW > 0 && Number.isFinite(meta.vbH) && meta.vbH > 0)) return null;
  const { contentX = 0, contentY = 0, vbW, vbH, clip, targetW, targetH } = meta, { toDrawn } = shot.frame;
  let width = vbW, height = vbH, left = 0, top = 0;
  const fit = (w, h) => { const k = Math.min(w / width, h / height); width = w / k; height = h / k; };
  if (crop) {
    if (fitted && targetW && targetH || exported) return null;
    left = Math.max(0, crop.x); top = Math.max(0, crop.y);
    width = Math.min(vbW, crop.x + crop.width) - left; height = Math.min(vbH, crop.y + crop.height) - top;
    if (!(width > 0 && height > 0)) return null;
  } else {
    if (fitted && Number.isFinite(targetW) && targetW > 0 && Number.isFinite(targetH) && targetH > 0) fit(targetW, targetH);
    if (exported) fit(exported.width, exported.height);
  }
  const dx = contentX - (clip?.x ?? 0) - left + (crop ? 0 : (width - vbW) / 2), dy = contentY - (clip?.y ?? 0) - top + (crop ? 0 : (height - vbH) / 2);
  const move = r => {
    const ps = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(([x, y]) => toDrawn({ x, y }));
    const xs = ps.map(p => p.x + dx), ys = ps.map(p => p.y + dy);
    return { ...r, left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  };
  return {
    box: { left: 0, top: 0, width, height },
    text: shot.text.map(t => ({ ...t, r: move(t.r) })),
    photos: shot.photos.map(move),
    ...(shot.textComplete === true && { textComplete: true }),
    ...(shot.edges && { edges: shot.edges.map(move) }),
  };
}

const MASK = encodeURIComponent('@layer snapdom-mask{*{color:#fff!important;-webkit-text-fill-color:#fff!important;' +
  'background:none!important;border-color:transparent!important;box-shadow:none!important;text-shadow:none!important;' +
  'outline:none!important}img,video,canvas,iframe,foreignObject svg{visibility:hidden!important}}');
async function withoutText(context, options, canvas, rects) {
  if (typeof HTMLCanvasElement === 'undefined' || !(canvas instanceof HTMLCanvasElement)) return null;
  const over = rects.exactRects.filter(r => !r.edge && rects.photoRects.some(p => r.x < p.x + p.width && p.x < r.x + r.width && r.y < p.y + p.height && p.y < r.y + r.height));
  const url = over.length ? context.export?.url : null, meta = context.meta;
  if (typeof url !== 'string' || !url.startsWith('data:image/svg+xml') || !meta || !Number.isFinite(meta.vbW)) return null;
  const at = url.search(/%3Cstyle(%20|%3E)/), end = at < 0 ? -1 : url.indexOf('%3E', at) + 3;
  if (end < 3) return null;
  const img = new Image();
  img.src = url.slice(0, end) + MASK + url.slice(end);
  await img.decode();
  const { width: w, height: h } = canvas, crop = options.crop, kx = img.naturalWidth / meta.vbW, ky = img.naturalHeight / meta.vbH;
  const draw = document.createElement('canvas');
  draw.width = w; draw.height = h;
  const g = draw.getContext('2d', { willReadFrequently: true });
  let alpha = null;
  try {
    for (let tries = 0; tries < 2 && !alpha; tries++) {
      g.clearRect(0, 0, w, h);
      if (crop) {
        const x = Math.max(0, crop.x), y = Math.max(0, crop.y);
        g.drawImage(img, x * kx, y * ky, (Math.min(meta.vbW, crop.x + crop.width) - x) * kx, (Math.min(meta.vbH, crop.y + crop.height) - y) * ky, 0, 0, w, h);
      } else g.drawImage(img, 0, 0, w, h);
      const a = g.getImageData(0, 0, w, h).data;
      for (let i = 3; i < a.length; i += 4) if (a[i]) { alpha = a; break; }
    }
  } finally { free(draw); }
  if (!alpha) return null;
  const grow = safari() && /(box|text)-shadow%3A(?:[^%]|%(?!3B|7D|22))*?px/i.test(url) ? 2 : 0;
  let mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = alpha[i * 4 + 3] ? 1 : 0;
  if (grow) {
    const out = new Uint8Array(mask.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x])
      for (let dy = Math.max(0, y - grow); dy <= Math.min(h - 1, y + grow); dy++) out.fill(1, dy * w + Math.max(0, x - grow), dy * w + Math.min(w - 1, x + grow) + 1);
    mask = out;
  }
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, under = new Uint8ClampedArray(data);
  for (let y = 0; y < h; y++) {
    let last = -1;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) { last = i; continue; }
      let from = last;
      if (from < 0) for (let r = x + 1; r < w; r++) if (!mask[y * w + r]) { from = y * w + r; break; }
      if (from >= 0) under.set(data.subarray(from * 4, from * 4 + 4), i * 4);
      if (under[i * 4] === data[i * 4] && under[i * 4 + 1] === data[i * 4 + 1] && under[i * 4 + 2] === data[i * 4 + 2]) under[i * 4] ^= 1;
    }
  }
  return { data: under, width: w, height: h, rects: over.map(({ x, y, width, height }) => ({ x, y, width, height })) };
}

let showsJxl;
async function image(blob, drawn, own, dpr, signal, exact) {
  const img = new Image(), wait = promise => abortable(promise, signal);
  const { width, height } = drawn?.style ?? {};
  let decoded = null;
  try {
    try {
      if (showsJxl === false) throw new Error('JPEG XL does not display here');
      await wait(shown(img, await wait(dataURL(blob))));
      showsJxl = true;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (showsJxl === undefined) showsJxl = false;
      if (!exact) {
        decoder ??= import('rapier-jxl/decode').catch(error => { decoder = null; throw needs(error); });
        const { data, width: w, height: h } = await wait((await wait(decoder)).decode(blob, { format: 'uint8', colorSpace: 'srgb', maxPixels: MAX_PIXELS, ...(signal && { signal }) }));
        decoded = document.createElement('canvas');
        decoded.width = w;
        decoded.height = h;
        decoded.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), w, h), 0, 0);
      }
      const source = decoded ?? drawn;
      await wait(shown(img, await wait(dataURL(await wait(new Promise(resolve => source.toBlob(resolve, 'image/png')))))));
    }
  } finally {
    if (own) free(drawn);
    free(decoded);
  }
  signal?.throwIfAborted();
  img.style.width = width || `${img.naturalWidth / dpr}px`;
  img.style.height = height || `${img.naturalHeight / dpr}px`;
  return img;
}

const blankCanvas = error => error?.code === 'JXL_PLATFORM' && /\bblank\b/.test(error?.message ?? '');

function free(canvas) {
  if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) canvas.width = canvas.height = 0;
}

const shown = (img, src) => new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = src; })
  .finally(() => { img.onload = img.onerror = null; });

const dataURL = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

async function save(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  const ios = navigator.userAgentData ? navigator.userAgentData.platform === 'iOS'
    : /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (ios && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); } catch (error) { if (error.name !== 'AbortError') throw error; }
    return;
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  try {
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

async function smaller(encoder, canvas, base, jobs, hooks) {
  const span = 1 / jobs.length;
  let best = null;
  for (let i = 0; i < jobs.length; i++) {
    const result = await encoder.capture(canvas, {
      ...base, ...jobs[i],
      onProgress: hooks.onProgress && (f => { if (f < 1) return hooks.onProgress(i * span + f * span); }),
    });
    if (result.meetsTarget && result.bytes && (!best || result.bytes.byteLength < best.bytes.byteLength)) best = result;
  }
  hooks.signal?.throwIfAborted();
  bytesOf(best);
  hooks.signal?.throwIfAborted();
  return best;
}

function bytesOf(result) {
  if (!result?.meetsTarget || !result.bytes) {
    throw Object.assign(new Error(result?.reason?.message ?? "No output meets the target; adjust fidelity or size."),
      { code: result?.reason?.code ?? 'JXL_UNSUPPORTED' });
  }
  return result.bytes;
}

function abortable(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (settle, value) => {
      if (done) return;
      done = true;
      try { signal.removeEventListener('abort', stop); }
      catch (reason) { if (settle === resolve) { reject(reason); return; } }
      settle(value);
    };
    const stop = () => {
      try { if (signal.aborted) finish(reject, signal.reason); }
      catch (reason) { finish(reject, reason); }
    };
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    try { signal.addEventListener('abort', stop, { once: true }); stop(); }
    catch (reason) { finish(reject, reason); }
  });
}
