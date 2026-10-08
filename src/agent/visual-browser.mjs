// Deliberate document observations, rendered by the browser; never a source writer.
// SPDX-License-Identifier: AGPL-3.0-only
import {VISUAL_LIMITS, visualDimensions} from './visual.mjs';
import {_rapierDrawBuildSVG} from '../draw/core.mjs';
import {sanitizeSvgText, decodeDataImage, inspectRaster, inspectJPEGXL} from '../images/assets.mjs';

const DOM_BYTES = 16 * 1024 * 1024;
const SVG = 'http://www.w3.org/2000/svg', XHTML = 'http://www.w3.org/1999/xhtml';
const error = code => Object.assign(new Error(code), {code});
const intersects = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;

async function loadImage(window, url, signal) {
  const image = new window.Image();
  await new Promise((resolve, reject) => {
    const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', aborted); };
    const aborted = () => { cleanup(); image.src = ''; reject(signal.reason || error('cancelled')); };
    image.onload = () => { cleanup(); resolve(); };
    image.onerror = () => { cleanup(); reject(error('visual_render_unavailable')); };
    signal.addEventListener('abort', aborted, {once: true});
    image.src = url;
    if (signal.aborted) aborted();
  });
  return image;
}

// Re-encode the same complete observation at a smaller resolution until both the image and
// its serialized door envelope fit. PNG keeps transparent drawing pixels and has one validator.
function encodeCanvas(canvas, check, imageBudget) {
  const originalWidth = canvas.width, originalHeight = canvas.height;
  let width = originalWidth, height = originalHeight, surface = canvas, resized;
  try {
    for (;;) {
      check();
      const url = surface.toDataURL('image/png');
      check();
      if (!url.startsWith('data:image/png;base64,')) throw error('visual_render_unavailable');
      const data = url.slice('data:image/png;base64,'.length), image = {mimeType: 'image/png', data, width, height};
      const decodedBytes = data.length / 4 * 3 - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
      const maxChars = Math.min(Math.floor(VISUAL_LIMITS.imageBytes / 3) * 4,
        imageBudget ? imageBudget(image) : Infinity);
      if (decodedBytes <= VISUAL_LIMITS.imageBytes && data.length <= maxChars) return image;
      if (!(maxChars > 0) || width === 1 && height === 1) throw error('visual_too_large');
      const scale = Math.min(0.85, Math.sqrt(maxChars / data.length) * 0.9);
      width = Math.max(1, Math.floor(width * scale)); height = Math.max(1, Math.floor(height * scale));
      resized ||= canvas.ownerDocument.createElement('canvas');
      resized.width = width; resized.height = height;
      const context = resized.getContext('2d');
      if (!context) throw error('visual_render_unavailable');
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(canvas, 0, 0, originalWidth, originalHeight, 0, 0, width, height);
      surface = resized;
    }
  } finally {
    if (resized) { resized.width = 0; resized.height = 0; }
  }
}

// The settled recipe is a read snapshot. Rendering it neither finishes a gesture nor touches
// Draw's live DOM, raster stores or history. The normal drawing owner supplies all SVG content.
export async function captureDrawing({recipe, clip, signal, current, imageBudget}) {
  const document = globalThis.document, window = document?.defaultView;
  if (!document || !window) throw error('visual_render_unavailable');
  if (!clip || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(clip[key])) ||
      clip.width <= 0 || clip.height <= 0) throw error('visual_target_unavailable');
  const outputWidth = clip.outputWidth ?? VISUAL_LIMITS.edge, outputHeight = clip.outputHeight ?? VISUAL_LIMITS.edge;
  if (!Number.isFinite(outputWidth) || !Number.isFinite(outputHeight) || outputWidth <= 0 || outputHeight <= 0)
    throw error('visual_target_unavailable');
  let scale = Math.min(1, Math.min(outputWidth, VISUAL_LIMITS.edge) / clip.width,
    Math.min(outputHeight, VISUAL_LIMITS.edge) / clip.height);
  const area = clip.width * scale * (clip.height * scale);
  if (area > VISUAL_LIMITS.pixels) scale *= Math.sqrt(VISUAL_LIMITS.pixels / area);
  const width = Math.max(1, Math.floor(clip.width * scale)), height = Math.max(1, Math.floor(clip.height * scale));
  if (!visualDimensions(width, height)) throw error('visual_too_large');
  const controller = new AbortController(), cancelled = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', cancelled, {once: true});
  if (signal?.aborted) cancelled();
  const timeout = window.setTimeout(() => controller.abort(error('visual_capture_expired')), 15000);
  const check = () => {
    if (controller.signal.aborted) throw controller.signal.reason || error('cancelled');
    if (current?.() === false) throw error('visual_target_changed');
  };
  let canvas;
  try {
    check();
    const rendered = _rapierDrawBuildSVG(recipe, undefined, true);
    if (!rendered) throw error('visual_target_unavailable');
    if (new TextEncoder().encode(rendered).byteLength > DOM_BYTES) throw error('visual_too_large');
    const parsed = new window.DOMParser().parseFromString(sanitizeSvgText(rendered), 'image/svg+xml');
    const svg = parsed.documentElement;
    if (parsed.querySelector('parsererror') || svg?.namespaceURI !== SVG || svg.localName !== 'svg')
      throw error('visual_render_unavailable');
    for (const metadata of [...svg.querySelectorAll('metadata')]) metadata.remove();
    const resources = new Set();
    let sourcePixels = 0;
    for (const node of svg.querySelectorAll('image,feImage')) {
      const url = node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (!url || resources.has(url)) continue;
      resources.add(url);
      if (!/^data:image\/(?:png|jxl);base64,/.test(url)) throw error('visual_resources_unavailable');
      let header;
      try {
        const bytes = decodeDataImage(url);
        header = url.startsWith('data:image/jxl;') ? inspectJPEGXL(bytes) : inspectRaster(bytes);
      } catch (failure) {
        throw error(['JXL_SIZE', 'JXL_DIMENSIONS', 'RASTER_SIZE', 'RASTER_DIMENSIONS'].includes(failure?.code)
          ? 'visual_too_large' : 'visual_resources_unavailable');
      }
      sourcePixels += header.width * header.height;
      if (sourcePixels > VISUAL_LIMITS.pixels * 4) throw error('visual_too_large');
      // SVG may load successfully while one of its raster layers silently fails. Verify every
      // embedded layer with the native decoder before accepting the composite observation.
      let decoded;
      try { decoded = await loadImage(window, url, controller.signal); }
      catch { throw error('visual_resources_unavailable'); }
      check();
      if (decoded.naturalWidth * decoded.naturalHeight !== header.width * header.height)
        throw error('visual_resources_unavailable');
    }
    svg.setAttribute('viewBox', `${clip.x} ${clip.y} ${clip.width} ${clip.height}`);
    svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
    const serialized = new window.XMLSerializer().serializeToString(svg);
    if (new TextEncoder().encode(serialized).byteLength > DOM_BYTES) throw error('visual_too_large');
    const image = await loadImage(window, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized), controller.signal);
    check();
    canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw error('visual_render_unavailable');
    context.drawImage(image, 0, 0);
    return encodeCanvas(canvas, check, imageBudget);
  } catch (failure) {
    if (signal?.aborted) throw error('cancelled');
    if (controller.signal.aborted) throw error('visual_capture_expired');
    if (failure?.code) throw failure;
    throw error('visual_resources_unavailable');
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', cancelled);
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

export async function captureVisual({root, clip, signal, current, imageBudget}) {
  const document = root?.ownerDocument, window = document?.defaultView;
  if (!document || !window || !root.isConnected) throw error('visual_render_unavailable');
  const sourceWidth = Math.ceil(clip?.width), sourceHeight = Math.ceil(clip?.height);
  if (!Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight) || sourceWidth < 1 || sourceHeight < 1 ||
      !Number.isFinite(clip?.x) || !Number.isFinite(clip?.y)) throw error('visual_target_unavailable');
  const captureScale = Math.min(1, VISUAL_LIMITS.edge / sourceWidth, VISUAL_LIMITS.edge / sourceHeight,
    Math.sqrt(VISUAL_LIMITS.pixels / (sourceWidth * sourceHeight)));
  const width = Math.max(1, Math.floor(sourceWidth * captureScale)), height = Math.max(1, Math.floor(sourceHeight * captureScale));
  if (!visualDimensions(width, height)) throw error('visual_too_large');
  const controller = new AbortController(), cancelled = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', cancelled, {once: true});
  if (signal?.aborted) cancelled();
  const timeout = window.setTimeout(() => controller.abort(error('visual_capture_expired')), 15000);
  const check = () => {
    if (controller.signal.aborted) throw controller.signal.reason || error('cancelled');
    if (!root.isConnected || current?.() === false) throw error('document_changed');
  };
  const canvases = [], fonts = new Set(), pseudos = [], references = new Map();
  let cloneSequence = 0, sourceBytes = 0, sourcePixels = 0;
  const charge = text => {
    sourceBytes += new TextEncoder().encode(text).byteLength;
    if (sourceBytes > DOM_BYTES) throw error('visual_too_large');
    return text;
  };
  const toData = async blob => {
    check();
    if (blob.size > DOM_BYTES) throw error('visual_too_large');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    check();
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
  };
  const inlineUrl = async url => {
    if (/^data:/i.test(url)) return url;
    if (url.startsWith(document.URL.split('#')[0] + '#')) url = url.slice(url.indexOf('#'));
    if (url.startsWith('#')) {
      const target = document.getElementById(decodeURIComponent(url.slice(1)));
      if (!target || target.namespaceURI !== SVG) throw error('visual_resources_unavailable');
      // Math and SVG can share glyphs/markers outside the visible document root. Carry their
      // definitions into the isolated image, not a broken reference to the live editor.
      references.set(url, target);
      return url;
    }
    // A capture must not authorize a new network read. Blob URLs are bytes already held by this
    // page; loaded remote images are copied from their decoded surface below, subject to CORS.
    if (!url.startsWith('blob:')) throw error('visual_resources_unavailable');
    const response = await window.fetch(url, {signal: controller.signal});
    if (!response.ok) throw error('visual_resources_unavailable');
    return toData(await response.blob());
  };
  const inlineCss = async value => {
    const urls = [...value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)];
    for (const match of urls) {
      const url = (match[1] ?? match[2] ?? match[3]).trim();
      value = value.replace(match[0], `url("${(await inlineUrl(url)).replaceAll('"', '%22')}")`);
    }
    return value;
  };
  const copyStyle = async (source, destination, pseudo) => {
    const style = window.getComputedStyle(source, pseudo);
    if (!pseudo) for (const family of style.fontFamily.split(',')) fonts.add(family.trim().replace(/^['"]|['"]$/g, ''));
    for (const property of style) {
      let value = style.getPropertyValue(property);
      if (value.includes('url(')) value = await inlineCss(value);
      destination.setProperty(property, value, style.getPropertyPriority(property));
    }
    destination.setProperty('animation', 'none', 'important');
    destination.setProperty('transition', 'none', 'important');
    return style;
  };
  const raster = source => {
    check();
    const bounds = source.getBoundingClientRect();
    const naturalWidth = source.naturalWidth || source.width, naturalHeight = source.naturalHeight || source.height;
    if (!naturalWidth || !naturalHeight) throw error('visual_resources_unavailable');
    const scale = Math.min(Math.max(bounds.width / naturalWidth, bounds.height / naturalHeight) * captureScale,
      VISUAL_LIMITS.edge / naturalWidth, VISUAL_LIMITS.edge / naturalHeight,
      Math.sqrt(VISUAL_LIMITS.pixels / (naturalWidth * naturalHeight)));
    const w = Math.max(1, Math.floor(naturalWidth * scale)), h = Math.max(1, Math.floor(naturalHeight * scale));
    if (!visualDimensions(w, h)) throw error('visual_too_large');
    // Overlapping picture layers must not multiply capture memory without a bound. This admits
    // sixteen million source pixels (64 MiB RGBA); the separate output remains four million.
    sourcePixels += w * h;
    if (sourcePixels > VISUAL_LIMITS.pixels * 4) throw error('visual_too_large');
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    try {
      const context = canvas.getContext('2d');
      if (!context) throw error('visual_render_unavailable');
      context.drawImage(source, 0, 0, w, h);
      const data = canvas.toDataURL('image/png');
      if (!data.startsWith('data:image/png;base64,')) throw error('visual_render_unavailable');
      return charge(data);
    } catch (failure) {
      if (failure?.code) throw failure;
      throw error('visual_resources_unavailable');
    } finally { canvas.width = 0; canvas.height = 0; }
  };
  const screenRoot = root.getBoundingClientRect();
  const screenClip = {left: screenRoot.left + clip.x - root.scrollLeft, top: screenRoot.top + clip.y - root.scrollTop,
    right: screenRoot.left + clip.x - root.scrollLeft + sourceWidth, bottom: screenRoot.top + clip.y - root.scrollTop + sourceHeight};
  const cloneNode = async (source, top = false) => {
    check();
    if (source.nodeType === 3) return document.createTextNode(charge(source.nodeValue || ''));
    if (source.nodeType !== 1 || source.matches('script,style,link,template,metadata,input[type="hidden"],[data-rapier-asset-record]')) return null;
    const computed = window.getComputedStyle(source);
    const svgNode = source.namespaceURI === SVG;
    const definition = svgNode && source.closest('defs,marker,clipPath,mask,linearGradient,radialGradient,filter,symbol,pattern');
    if (!definition && (computed.display === 'none' || computed.visibility === 'hidden')) return null;
    const bounds = source.getBoundingClientRect();
    if (!svgNode && source !== root && !bounds.width && !bounds.height && computed.display !== 'contents') return null;
    const omitted = (top || source.matches('img,canvas,svg')) && !definition && source !== root && !intersects(bounds, screenClip);
    if (!omitted && source._rapierDormant) throw error('visual_resources_unavailable');
    if (!omitted && source.matches('.math-placeholder,.diagram-block:not([data-diagram-state="ready"]),[data-rapier-remote-src],[data-rapier-asset-state="waiting"],[data-rapier-asset-state="loading"],[data-rapier-asset-state="error"]'))
      throw error('visual_resources_unavailable');
    if (!omitted && source.matches('video,audio,iframe,object,embed')) throw error('visual_resources_unavailable');
    const isCanvas = source.localName === 'canvas';
    const clone = isCanvas ? document.createElement('img') : source.cloneNode(false);
    for (const attr of [...clone.attributes]) if (/^on/i.test(attr.name) ||
      ['src', 'srcset', 'href', 'xlink:href', 'action', 'formaction', 'autofocus', 'contenteditable', 'tabindex',
        'data-rapier-image-url', 'data-rapier-image-source', 'data-rapier-image-alt-source', 'data-diagram-src',
        'data-math-src', 'data-rapier-source'].includes(attr.name)) clone.removeAttribute(attr.name);
    await copyStyle(source, clone.style);
    if (omitted) {
      clone.style.setProperty('box-sizing', 'border-box', 'important');
      clone.style.setProperty('height', `${bounds.height}px`, 'important');
      clone.style.setProperty('width', `${bounds.width}px`, 'important');
      clone.style.setProperty('visibility', 'hidden', 'important');
      return clone;
    }
    if (source.localName === 'img') {
      if (!source.complete || !source.naturalWidth || !source.naturalHeight) throw error('visual_resources_unavailable');
      clone.src = raster(source);
    } else if (isCanvas) clone.src = raster(source);
    else if (source.namespaceURI === SVG && ['image', 'use'].includes(source.localName)) {
      const href = source.getAttribute('href') || source.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (href) clone.setAttribute('href', charge(await inlineUrl(href)));
    }
    if (source.localName === 'textarea') clone.textContent = source.value;
    else if (source.localName === 'input') {
      clone.setAttribute('value', source.value);
      if (source.checked) clone.setAttribute('checked', ''); else clone.removeAttribute('checked');
    } else if (!isCanvas) {
      for (const child of source.childNodes) {
        const copied = await cloneNode(child, source === root);
        if (copied) clone.append(copied);
      }
    }
    if (source.scrollTop || source.scrollLeft) {
      // The outer root's scroll is represented by clip. A nested scroller cannot be restored in
      // an SVG image document; refuse instead of returning the wrong lines as a complete capture.
      if (source !== root) throw error('visual_resources_unavailable');
    }
    const className = `rapier-visual-${++cloneSequence}`;
    for (const pseudo of ['::before', '::after']) {
      const content = window.getComputedStyle(source, pseudo).content;
      if (!content || content === 'none' || content === 'normal') continue;
      clone.classList.add(className);
      const holder = document.createElement('span');
      await copyStyle(source, holder.style, pseudo);
      pseudos.push(charge(`.${className}${pseudo}{${holder.style.cssText}}`));
    }
    charge(clone.style.cssText);
    return clone;
  };
  const fontCss = async () => {
    const kept = [];
    const visit = async rules => {
      for (const rule of rules) {
        if (rule.type === 5 && fonts.has(rule.style.getPropertyValue('font-family').replace(/^['"]|['"]$/g, ''))) {
          kept.push(charge(await inlineCss(rule.cssText)));
        } else if (rule.cssRules) await visit(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { throw error('visual_resources_unavailable'); }
      await visit(rules);
    }
    return kept.join('\n');
  };
  try {
    check();
    if (document.fonts?.status === 'loading') throw error('visual_resources_unavailable');
    const clone = await cloneNode(root);
    check();
    if (!clone) throw error('visual_target_unavailable');
    for (const [name, value] of Object.entries({margin: '0', position: 'static', transform: 'none',
      width: `${root.clientWidth}px`, height: `${root.scrollHeight}px`, 'max-height': 'none', overflow: 'visible',
      'box-sizing': 'border-box', 'content-visibility': 'visible'})) clone.style.setProperty(name, value, 'important');
    clone.setAttribute('xmlns', XHTML);
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('xmlns', SVG); svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${sourceWidth} ${sourceHeight}`);
    const definitions = document.createElementNS(SVG, 'defs'), copied = new Set();
    for (const [url, target] of references) {
      if (copied.has(url)) continue;
      copied.add(url);
      const definition = await cloneNode(target);
      if (!definition) throw error('visual_resources_unavailable');
      definitions.append(definition);
    }
    if (definitions.childNodes.length) svg.append(definitions);
    const style = document.createElementNS(SVG, 'style');
    style.textContent = await fontCss() + '\n' + pseudos.join('\n');
    svg.append(style);
    const foreign = document.createElementNS(SVG, 'foreignObject');
    foreign.setAttribute('x', String(-clip.x)); foreign.setAttribute('y', String(-clip.y));
    foreign.setAttribute('width', String(root.clientWidth)); foreign.setAttribute('height', String(root.scrollHeight));
    foreign.append(clone); svg.append(foreign);
    const serialized = new window.XMLSerializer().serializeToString(svg);
    if (new TextEncoder().encode(serialized).byteLength > DOM_BYTES) throw error('visual_too_large');
    const image = await loadImage(window, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized), controller.signal);
    check();
    const canvas = document.createElement('canvas'); canvases.push(canvas);
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw error('visual_render_unavailable');
    // The editor background belongs to the page, not necessarily #editor-blocks.
    let background = root;
    while (background && ['transparent', 'rgba(0, 0, 0, 0)'].includes(window.getComputedStyle(background).backgroundColor)) background = background.parentElement;
    context.fillStyle = background ? window.getComputedStyle(background).backgroundColor : '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0);
    return encodeCanvas(canvas, check, imageBudget);
  } catch (failure) {
    if (signal?.aborted) throw error('cancelled');
    if (controller.signal.aborted) throw error('visual_capture_expired');
    if (failure?.code) throw failure;
    throw error('visual_resources_unavailable');
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', cancelled);
    for (const canvas of canvases) { canvas.width = 0; canvas.height = 0; }
  }
}
