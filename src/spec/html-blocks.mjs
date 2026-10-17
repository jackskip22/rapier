// SPDX-License-Identifier: MIT
import {inspectGIF} from '../images/gif.mjs';
import {createMediaPlayback} from '../images/playback.mjs';
import {sha256} from '../kit/ledger/hash.mjs';
import {formatLayout, parseLayout, validLayout, imageStyle, objectHeight} from './md-layout.mjs';

export const HTML_ELEMENTS = Object.freeze('a abbr address article aside b bdi bdo blockquote br button caption circle clipPath code col colgroup dd defs del details dfn div dl dt ellipse em fieldset figcaption figure filter feBlend feColorMatrix feComponentTransfer feComposite feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feOffset footer g h1 h2 h3 h4 h5 h6 header hr i image img input kbd label legend li line linearGradient main mark mask meter nav ol optgroup option p path pattern picture polygon polyline pre progress q radialGradient rect s samp section select small source span stop strong style sub summary sup svg table tbody td text textarea th thead time title tr tspan u ul use var animate animateTransform animateMotion set mpath'.toLowerCase().split(' '));
const VOID = new Set('area base br col embed hr img input link meta source track wbr'.split(' '));

export function htmlRemoved(body) {
  const allowed = new Set(HTML_ELEMENTS), removed = new Set(), tag = /<(\/?)([A-Za-z][\w:-]*)[^>]*?(\/?)>/g;
  for (let found; (found = tag.exec(body));) {
    const name = found[2].toLowerCase();
    if (found[1] || allowed.has(name)) continue;
    removed.add(name);
    if (VOID.has(name) || found[3]) continue;
    const inner = new RegExp('<(/?)' + name + '\\b[^>]*>', 'gi'); inner.lastIndex = tag.lastIndex;
    for (let depth = 1, next; depth && (next = inner.exec(body));) {depth += next[1] ? -1 : 1; tag.lastIndex = inner.lastIndex;}
    if (!new RegExp('</' + name + '\\b', 'i').test(body.slice(found.index))) break;
  }
  return [...removed];
}

export function htmlAttributes(info) {
  const match = /^html(?:\s+\{([^{}]*)\})?\s*$/i.exec(String(info));
  if (!match) return null;
  const attrs = {};
  for (const part of (match[1] || '').match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []) {
    if (part[0] === '#') {if (attrs.id) return null; attrs.id = part.slice(1);}
    else if (part[0] === '.') {if (!/^\.[A-Za-z_][\w-]*$/.test(part)) return null; attrs.class = [attrs.class, part.slice(1)].filter(Boolean).join(' ');}
    else {
      const pair = /^([a-z][a-z-]*)=(.*)$/.exec(part); if (!pair || Object.hasOwn(attrs, pair[1])) return null;
      attrs[pair[1]] = pair[2].replace(/^(["'])(.*)\1$/, '$2');
    }
  }
  if (attrs.id && !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(attrs.id)) return null;
  if (attrs.height && attrs.height !== 'auto' && (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(attrs.height) || +attrs.height < .5 || +attrs.height > 512)) return null;
  if (attrs.resize && !['scale', 'reflow'].includes(attrs.resize)) return null;
  if (attrs.viewport && !/^[1-9]\d{0,3}x[1-9]\d{0,3}$/.test(attrs.viewport)) return null;
  if (attrs.viewport && attrs.viewport.split('x').some(n => +n > 4096)) return null;
  if (attrs.overflow && attrs.overflow !== 'clip') return null;
  return attrs;
}

export function htmlFence(raw) {
  const opening = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)\r?\n/.exec(raw);
  if (!opening) return null;
  const attrs = htmlAttributes(opening[3].trim()); if (!attrs) return null;
  const mark = opening[2], close = new RegExp('^ {0,3}' + mark[0] + '{' + mark.length + ',}[ \\t]*\\r?$', 'm');
  const rest = raw.slice(opening[0].length), found = close.exec(rest);
  if (!found) return null;
  const end = opening[0].length + found.index + found[0].replace(/\r$/, '').length;
  const tail = raw.slice(end), attached = /^(\r?\n)(<!--md-layout:v1[^\r\n]*-->)(?:\r?\n)?$/.exec(tail);
  const layout = attached && parseLayout(attached[2]);
  if (tail.trim() && !layout) return null;
  if (layout && ['align', 'first', 'indent', 'marker', 'hyphens', 'caps', 'hanging'].some(key => key in layout)) return null;
  return {attrs, info: opening[3].trim(), body: rest.slice(0, found.index), infoStart: opening[1].length + mark.length,
    infoEnd: opening[0].replace(/\r?\n$/, '').length, source: raw, start: 0, end: raw.length, fenceEnd: end,
    layout: layout || HTML_FLOW, marker: attached ? {start: end + attached[1].length, end: end + attached[1].length + attached[2].length, text: attached[2]} : null};
}

const HTML_FLOW = Object.freeze({width: 100});

export function htmlImageRecord(raw) {
  const fence = htmlFence(raw); if (!fence) return null;
  return {...fence, htmlBlock: true, renderIndex: 0, alt: fence.attrs.id || 'HTML', altSource: '',
    tokenEnd: raw.length, source: raw, placement: fence.layout, standalone: true, imageOnly: true};
}

export function mergeHtmlObjectBlocks(blocks, source) {
  for (let index = 0; index + 1 < blocks.length; index++) {
    const block = blocks[index], next = blocks[index + 1];
    if (block.type !== 'fence' || next.type !== 'html_block') continue;
    const raw = source.slice(block._sourceStart, next._sourceEnd);
    if (!htmlFence(raw)?.marker) continue;
    block.raw = raw; block._sourceEnd = next._sourceEnd; block.rendered = null;
    if (next._rapierFacts) block._rapierFacts = [...(block._rapierFacts || []), ...next._rapierFacts];
    blocks.splice(index + 1, 1);
  }
  return blocks;
}

export function htmlLayoutEdit(record, value) {
  const fence = htmlFence(record.block.raw); if (!fence) return null;
  const layout = Object.fromEntries(Object.entries(value).filter(([,v]) => v != null));
  const height = layout.lines; delete layout.lines;
  if (!validLayout(layout)) return null;
  const resizedHeight = height ?? (fence.attrs.resize === 'scale' && fence.attrs.height && fence.attrs.height !== 'auto' && layout.width && fence.layout.width
    ? Math.max(.5, Math.min(512, Math.round(+fence.attrs.height * layout.width / fence.layout.width * 10) / 10)) : null);
  const info = resizedHeight != null ? htmlInfoEdit(fence.info, {height: resizedHeight}) : fence.info;
  const line = fence.source.includes('\r\n') ? '\r\n' : '\n', marker = formatLayout(layout);
  const tail = fence.source.slice(fence.marker?.end ?? fence.fenceEnd);
  return {start: fence.infoStart, end: fence.source.length,
    text: info + fence.source.slice(fence.infoEnd, fence.fenceEnd) + (marker ? line + marker : '') + tail};
}

function htmlInfoEdit(info, changes) {
  let text = info;
  for (const [key, value] of Object.entries(changes)) {
    const pattern = new RegExp('(^|[\\s{])\\s*' + key + '=(?:"[^"]*"|\'[^\']*\'|[^\\s}]+)', 'g');
    text = text.replace(pattern, (_, lead) => lead.trim()).replace(/{\s+/, '{');
    if (value != null) text = text.includes('{') ? text.replace(/\s*}$/, ' ' + key + '=' + value + '}') : text + ' {' + key + '=' + value + '}';
  }
  return text.replace(/\s*{\s*}$/, '');
}

export function htmlModeEdit(record, resize, viewport) {
  const fence = htmlFence(record.block.raw); if (!fence || !['scale', 'reflow'].includes(resize)) return null;
  const info = htmlInfoEdit(fence.info, {resize, ...(resize === 'scale' && !fence.attrs.viewport ? {viewport: viewport || '640x360'} : {})});
  return htmlAttributes(info) ? {start: fence.infoStart, end: fence.infoEnd, text: info} : null;
}

export function htmlPlaceholder(token, escape) {
  const attrs = htmlAttributes(token.info); if (!attrs || token.content.length > 1048576 || token.meta?.rapierFenceClosed === false) return null;
  const layout = token.meta?.mdLayout?.layout || HTML_FLOW, marker = encodeURIComponent(formatLayout(layout));
  const height = attrs.height && attrs.height !== 'auto' ? attrs.height : 8;
  const source = encodeURIComponent(JSON.stringify({info: token.info, body: token.content, attrs, layout}));
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
  return '<p class="rapier-html-block" data-md-layout="' + escape(marker) + '"><img data-rapier-markdown-image="" data-rapier-image-index="0" data-rapier-html="' + escape(source) + '" data-rapier-image-layout="' + escape(marker) + '" src="' + pixel + '" alt="' + escape(attrs.id || 'HTML block') + '" style="' + imageStyle(layout) + ';height:calc(' + height + ' * var(--md-line, 1.6em));object-fit:fill" /></p>\n';
}

function htmlFrameRuntime(config, media, win) {
  const send = value => win.parent.postMessage({type: 'rapier-object-state', id: config.id, ...value}, '*');
  let paused = true, disposed = false, generation = 0, timer = 0, motion = 0, signature = '', busy = false;
  const rasters = [], root = win.document.body;
  const animations = () => win.document.getAnimations();
  const vectors = () => [...root.querySelectorAll('svg')];
  function transport(stop) {
    paused = stop;
    win.cancelAnimationFrame(motion); motion = 0;
    for (const animation of animations()) {if (stop) {const time = animation.currentTime; animation.pause(); if (time != null) animation.currentTime = time;} else animation.play();}
    for (const svg of vectors()) {if (stop) svg.pauseAnimations?.(); else svg.unpauseAnimations?.();}
    for (const row of rasters) {if (stop) row.player.pause(); else row.player.play();}
    for (const row of rasters) rasterPosition(row);
    if (!stop && rasters.length) motion = win.requestAnimationFrame(positionRasters);
  }
  function positionRasters() {
    motion = 0; if (disposed || paused) return;
    for (const row of rasters) rasterPosition(row);
    motion = win.requestAnimationFrame(positionRasters);
  }
  function rasterPosition(row) {
    const image = row.image, style = win.getComputedStyle(image);
    row.canvas.style.cssText = 'position:absolute;pointer-events:none;margin:0;left:' + image.offsetLeft + 'px;top:' + image.offsetTop + 'px;width:' + image.offsetWidth + 'px;height:' + image.offsetHeight + 'px';
    for (const property of ['transform','transform-origin','opacity','filter','mix-blend-mode','border-radius','clip-path','object-fit','object-position','z-index'])
      row.canvas.style.setProperty(property, style.getPropertyValue(property));
    row.canvas.style.visibility = row.visibility;
    const rect = image.getBoundingClientRect(), clip = {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom};
    for (let parent = image.parentElement; parent && parent !== root; parent = parent.parentElement) {
      const look = win.getComputedStyle(parent);
      if (look.overflowX === 'visible' && look.overflowY === 'visible') continue;
      if (look.transform !== 'none' || style.transform !== 'none') {row.player?.pause(); row.canvas.hidden = true; image.style.visibility = ''; send({mediaStatus: 'clip-playback-unavailable'}); return;}
      const box = parent.getBoundingClientRect();
      if (look.overflowX !== 'visible') {clip.left = Math.max(clip.left, box.left + parent.clientLeft); clip.right = Math.min(clip.right, box.left + parent.clientLeft + parent.clientWidth);}
      if (look.overflowY !== 'visible') {clip.top = Math.max(clip.top, box.top + parent.clientTop); clip.bottom = Math.min(clip.bottom, box.top + parent.clientTop + parent.clientHeight);}
    }
    if (style.clipPath === 'none') row.canvas.style.clipPath = 'inset(' + [clip.top-rect.top, rect.right-clip.right, rect.bottom-clip.bottom, clip.left-rect.left].map(n => Math.max(0,n)+'px').join(' ') + ')';
  }
  for (const image of root.querySelectorAll('img[data-rapier-animation]')) {
    const canvas = win.document.createElement('canvas'); canvas.hidden = true; canvas.dataset.rapierRuntime = '';
    image.after(canvas);
    const row = {image, canvas, visibility: win.getComputedStyle(image).visibility};
    try {
      row.player = media.raster(image.dataset.rapierAnimation, canvas, state => {
        canvas.hidden = state.status !== 'ready'; rasterPosition(row);
        image.style.visibility = state.status === 'ready' && !canvas.hidden ? 'hidden' : '';
        if (state.first) image.dataset.rapierFirstFrame = state.first;
        send({mediaStatus: canvas.hidden && state.status === 'ready' ? 'clip-playback-unavailable' : state.status});
      }, {width: +image.dataset.rapierMediaWidth, height: +image.dataset.rapierMediaHeight}); rasters.push(row);
    } catch {canvas.remove(); send({mediaStatus: 'admission-failed'});}
  }
  const settle = promise => Promise.race([promise, new Promise((_, reject) => win.setTimeout(() => reject(new Error('Resource readiness timeout')), 2000))]);
  async function snapshot() {
    timer = 0;
    if (disposed) return;
    if (busy) {schedule(); return;}
    const width = Math.ceil(win.innerWidth), height = Math.ceil(win.innerHeight), key = width + 'x' + height;
    const measured = Math.min(4096, Math.max(1, Math.ceil(root.getBoundingClientRect().height), root.scrollHeight));
    send({height: measured});
    if (key === signature) return;
    signature = key; busy = true; const stamp = ++generation;
    let saved = [], svgTimes = [];
    try {
      await settle(Promise.all([win.document.fonts.ready, ...[...win.document.images].filter(image => image.hasAttribute('src')).map(image => image.decode())]));
      for (const row of rasters) {
        const first = await row.player.first();
        if (!first) throw new Error('First-frame decoder unavailable');
        row.image.dataset.rapierFirstFrame = first;
      }
      if (disposed || stamp !== generation) return;
      if (width !== Math.ceil(win.innerWidth) || height !== Math.ceil(win.innerHeight)) {signature = ''; return;}
      const live = [root, ...root.querySelectorAll('*')].filter(el => !el.matches('script,[data-rapier-runtime]'));
      if (live.length > 512 || !width || !height || width > 4096 || height > 4096) throw new Error('Snapshot work budget');
      const active = animations();
      if (active.length > 512) {active.forEach(animation => animation.cancel()); throw new Error('Animation count budget');}
      const animated = active.length > 0 || !!root.querySelector('animate,animateTransform,animateMotion,set') || rasters.some(row => row.player.state.animated);
      saved = active.map(animation => ({animation, time: animation.currentTime, state: animation.playState}));
      for (const animation of active) {animation.pause(); animation.currentTime = 0;}
      svgTimes = vectors().map(svg => ({svg, time: svg.getCurrentTime?.() || 0}));
      for (const {svg} of svgTimes) {svg.pauseAnimations?.(); svg.setCurrentTime?.(0);}
      const clone = root.cloneNode(true); clone.querySelectorAll('script,[data-rapier-runtime]').forEach(el => el.remove());
      const copies = [clone, ...clone.querySelectorAll('*')];
      for (let i = 0; i < live.length; i++) {
        const element = live[i], copy = copies[i]; if (!copy) throw new Error('Snapshot tree changed');
        const style = win.getComputedStyle(element);
        for (const property of style) copy.style.setProperty(property, style.getPropertyValue(property), 'important');
        if (element.tagName === 'IMG' && element.dataset.rapierAnimation) copy.style.setProperty('visibility', rasters.find(row => row.image === element)?.visibility || 'visible', 'important');
        copy.style.setProperty('animation', 'none', 'important'); copy.style.setProperty('transition', 'none', 'important');
        for (const attr of element.attributes) {
          const value = element[attr.name]?.animVal;
          if (value && typeof value.value === 'number') copy.setAttribute(attr.name, String(value.value));
          else if (typeof value === 'number') copy.setAttribute(attr.name, String(value));
          else if (typeof value === 'string') copy.setAttribute(attr.name, value);
          else if (value && ['x','y','width','height'].every(key => typeof value[key] === 'number')) copy.setAttribute(attr.name, [value.x, value.y, value.width, value.height].join(' '));
          else if (value && typeof value.numberOfItems === 'number' && value.numberOfItems <= 4096) {
            const items = Array.from({length: value.numberOfItems}, (_, index) => value.getItem(index));
            if (items.every(item => typeof item.value === 'number')) copy.setAttribute(attr.name, items.map(item => item.value).join(' '));
          }
        }
        if (element.animatedPoints?.numberOfItems > 4096) throw new Error('SVG point budget');
        if (element.animatedPoints) copy.setAttribute('points', Array.from({length: element.animatedPoints.numberOfItems}, (_, index) => {
          const p = element.animatedPoints.getItem(index); return p.x + ',' + p.y;
        }).join(' '));
        if (element.tagName === 'IMG' && element.dataset.rapierFirstFrame) copy.src = element.dataset.rapierFirstFrame;
        for (const pseudo of ['::before', '::after']) {
          const computed = win.getComputedStyle(element, pseudo), content = computed.content;
          if (!content || content === 'none' || content === 'normal') continue;
          if (!/^"(?:[^"\\]|\\.)*"$/.test(content)) throw new Error('Unsupported generated content');
          const span = win.document.createElement('span'); span.textContent = content.slice(1, -1).replace(/\\(["\\])/g, '$1');
          for (const property of computed) span.style.setProperty(property, computed.getPropertyValue(property), 'important');
          span.style.setProperty('animation', 'none', 'important');
          if (pseudo === '::before') copy.prepend(span); else copy.append(span);
        }
      }
      const fonts = [];
      const fontRules = rules => {for (const rule of rules) {if (rule.type === 5) fonts.push(rule.cssText); else if (rule.cssRules) fontRules(rule.cssRules);}};
      for (const sheet of win.document.styleSheets) fontRules(sheet.cssRules);
      clone.querySelectorAll('animate,animateTransform,animateMotion,set,style').forEach(el => el.remove());
      if (fonts.length) {const style = win.document.createElement('style'); style.textContent = fonts.join('\n'); clone.prepend(style);}
      const markup = new win.XMLSerializer().serializeToString(clone);
      if (markup.length > 2097152) throw new Error('Snapshot byte budget');
      send({height: measured, animated, width, viewportHeight: height, markup,
        contour: animated ? 'animation-box' : config.overflow ? 'overflow-box' : 'sampled',
        snapshotStatus: root.querySelector('animateMotion') ? 'unsupported-motion' : 'sampled'});
    } catch (error) {send({snapshotStatus: 'unavailable', contour: 'unavailable-box', reason: String(error.message).slice(0, 120)});}
    finally {
      for (const {animation, time, state} of saved) {animation.currentTime = time; if (!paused && state !== 'finished') animation.play();}
      for (const {svg, time} of svgTimes) {svg.setCurrentTime?.(time); if (!paused) svg.unpauseAnimations?.();}
      busy = false;
      if (!disposed && (width !== Math.ceil(win.innerWidth) || height !== Math.ceil(win.innerHeight))) {signature = ''; schedule();}
    }
  }
  const schedule = () => {if (!timer) timer = win.setTimeout(snapshot, 80); for (const row of rasters) rasterPosition(row);};
  const observer = new win.ResizeObserver(schedule); observer.observe(root);
  win.addEventListener('resize', schedule);
  win.addEventListener('message', event => {
    if (event.source !== win.parent || event.data?.type !== 'rapier-object-command' || event.data.id !== config.id) return;
    if (event.data.action === 'pause' || event.data.action === 'play') transport(event.data.action === 'pause');
    if (event.data.action === 'suspend') {transport(true); for (const row of rasters) row.player.suspend();}
    if (event.data.action === 'snapshot') {signature = ''; schedule();}
  });
  win.addEventListener('pagehide', event => {if (event.persisted) {transport(true); return;}
    disposed = true; generation++; win.clearTimeout(timer); win.cancelAnimationFrame(motion); observer.disconnect(); for (const row of rasters) row.player.close();});
  win.addEventListener('pageshow', schedule);
  transport(true); win.addEventListener('load', schedule); schedule();
}

export function htmlRuntimeSource() {
  return '{const HTML_ELEMENTS=' + JSON.stringify(HTML_ELEMENTS) + ';(' + mountHtmlBlocks.toString() + ')(document,{media:(' + createMediaPlayback.toString() + ')(window,' + inspectGIF.toString() + '),frameRuntime:' + htmlFrameRuntime.toString() + ',heightOf:' + objectHeight.toString() + '});}';
}

export function objectPosterLabel(image, width = 640) {
  if (!image.hasAttribute('data-rapier-html')) return posterLabel(image.getAttribute('data-rapier-animation'));
  const source = JSON.parse(decodeURIComponent(image.dataset.rapierHtml));
  return posterLabel(source, parseLayout(decodeURIComponent(image.dataset.rapierImageLayout || '')) || source.layout, width);
}
const posterLabel = (object, layout, width = 640) => {
  let value = object;
  if (typeof object !== 'string') {
    const attrs = {...object.attrs}; delete attrs.id;
    value = JSON.stringify({body: object.body.replace(/\r\n?/g, '\n'), attrs, width: Math.round(width * (layout?.width || 100) / 100)});
  }
  return 'rapier-poster-v1-' + sha256('rapier-object-poster-v1\nlight\n' + value);
};

export function retiredPosterSplices(before, after, splices, retired = []) {
  if (!splices.length || !after.includes('rapier-poster-v1-')) return [];
  let start = 0, endBefore = before.length, endAfter = after.length;
  if (splices.length === 1) {start = splices[0].pos; endBefore = start + splices[0].removed.length; endAfter = start + splices[0].inserted.length;}
  else {
    while (start < endBefore && start < endAfter && before.charCodeAt(start) === after.charCodeAt(start)) start++;
    while (endBefore > start && endAfter > start && before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)) {endBefore--; endAfter--;}
  }
  const touched = (text, from, to) => {
    const rows = [], open = /^ {0,3}(`{3,}|~{3,})html(?=[\s{]|$)[^\r\n]*\r?\n/gm;
    for (let found; (found = open.exec(text)) && found.index <= to;) {
      const close = new RegExp('^ {0,3}' + found[1][0] + '{' + found[1].length + ',}[ \\t]*(?:\\r?\\n|$)', 'gm'); close.lastIndex = open.lastIndex;
      const closing = close.exec(text); if (!closing) break;
      let end = closing.index + closing[0].length;
      const marker = /^<!--md-layout:v1[^\r\n]*-->(?:\r?\n)?/.exec(text.slice(end, end + 1024)); if (marker) end += marker[0].length;
      open.lastIndex = end;
      const fence = end >= from && found.index <= to && htmlFence(text.slice(found.index, end));
      if (fence) rows.push({label: posterLabel(fence, fence.layout), raw: text.slice(found.index, end)});
    }
    const media = /data:image\/(?:gif|jxl);base64,[A-Za-z0-9+/]+={0,2}/gi;
    for (let found; (found = media.exec(text)) && found.index <= to;) if (media.lastIndex >= from && found.index <= to) rows.push({label: posterLabel(found[0]), raw: found[0]});
    return rows;
  };
  let rest = after;
  for (const row of [...retired].sort((a, b) => b.pos - a.pos)) rest = rest.slice(0, row.pos) + row.inserted + rest.slice(row.pos + row.removed.length);
  const definitions = retired.flatMap(row => [...row.removed.matchAll(/data:image\/(?:gif|jxl);base64,[A-Za-z0-9+/]+={0,2}/gi)].map(found => ({label: posterLabel(found[0]), raw: found[0]})));
  const kept = new Set(touched(after, start, endAfter).map(row => row.label));
  const gone = new Set([...touched(before, start, endBefore), ...definitions].filter(row => !kept.has(row.label) && !rest.includes(row.raw)).map(row => row.label));
  const rows = [];
  for (const found of after.matchAll(/^\[(rapier-poster-v1-[0-9a-f]{64})\]:[^\r\n]*(?:\r?\n)?/gm))
    if (gone.has(found[1])) rows.push({pos: found.index, removed: found[0], inserted: ''});
  return rows.reverse();
}

export function mountHtmlBlocks(doc, options = {}) {
  if (!options.root && doc.rapierObjects) return doc.rapierObjects;
  const root = options.root || doc.body;
  const win = doc.defaultView, media = options.media || createMediaPlayback(win, inspectGIF), frameRuntime = options.frameRuntime || htmlFrameRuntime;
  const imageInfo = options.imageInfo || (url => {const assets = win.RapierImageAssets; if (!assets?.decodeDataImageBytes) return null;
    const {bytes, codec} = assets.decodeDataImageBytes(url); return {...(codec === 'image/jxl' ? assets.inspectJPEGXL(bytes) : {}), ...assets.imageDimensions(bytes, codec)};});
  const heightOf = options.heightOf || objectHeight;
  const owned = new Map(), local = new Map(), reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  let pending = 0, dead = false, sequence = 0, noticed = false, identity = options.identity?.();
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
  const random = () => [...win.crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join(''), prefix = random();
  const sheet = doc.createElement('style');
  sheet.textContent = 'img[data-rapier-live-surface]{filter:opacity(0)!important}@media print{[data-rapier-html-preview],[data-rapier-object-preview],[data-rapier-playback-control]{display:none!important}img[data-rapier-live-surface]{filter:none!important}}';
  doc.head.append(sheet);
  const schedule = () => {if (!dead && !pending) pending = win.requestAnimationFrame(update);};
  const lineOf = image => {for (let p = image.parentElement; p; p = p.parentElement) {const n = parseFloat(win.getComputedStyle(p).lineHeight); if (n > 0) return n;} return 24;};
  const keyOf = image => image.getAttribute('data-rapier-html') || image.getAttribute('data-rapier-animation') || '';
  const message = (row, action) => row.frame?.contentWindow?.postMessage({type: 'rapier-object-command', id: row.id, action}, '*');
  function applyPlayback(row) {
    const stopped = row.paused || !row.visible || doc.hidden;
    if (!row.visible || doc.hidden) {message(row, 'suspend'); row.player?.suspend();}
    else if (stopped) {message(row, 'pause'); row.player?.pause();} else {message(row, 'play'); row.player?.play();}
    if (row.button) {
      row.button.setAttribute('aria-label', row.paused ? 'Play animation' : 'Pause animation');
      row.button.innerHTML = '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.5">' +
        (row.paused ? '<polygon points="5 3 19 12 5 21 5 3"/>' : '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>') + '</svg>';
    }
  }
  function setPlayback(row, playing) {
    if (!row?.animated || !row.image.isConnected || owned.get(row.image) !== row) return {ok: false, reason: 'preview_unavailable'};
    row.paused = !playing; local.set(row.key, row.paused);
    if (local.size > 64) local.delete(local.keys().next().value);
    applyPlayback(row); doc.dispatchEvent(new win.Event('rapier-playback')); return {ok: true, playing: !row.paused, visible: row.visible, status: row.image.dataset.rapierPlayback || 'ready'};
  }
  function control(row) {
    if (row.button || !row.animated) return;
    const button = doc.createElement('button'); button.type = 'button'; button.dataset.rapierPlaybackControl = '';
    button.style.cssText = 'position:absolute;width:44px;height:44px;display:grid;place-items:center;padding:0;border:0;border-radius:0;background:transparent;color:inherit;cursor:pointer';
    button.addEventListener('click', event => {event.preventDefault(); event.stopPropagation(); if (event.isTrusted) setPlayback(row, row.paused);});
    row.button = button; row.parent.append(button); applyPlayback(row); schedule(); doc.dispatchEvent(new win.Event('rapier-playback'));
  }
  function release(row) {
    row.generation++; row.player?.close(); row.frame?.remove(); row.surface?.remove(); row.button?.remove();
    row.image.removeAttribute('data-rapier-live-surface');
    resize.unobserve(row.image); visibility?.unobserve(row.image); owned.delete(row.image);
  }
  function update() {
    pending = 0;
    for (const row of owned.values()) {
      const image = row.image;
      if (!image.isConnected || keyOf(image) !== row.key) {release(row); continue;}
      const box = image.getBoundingClientRect(), parent = row.surface.offsetParent || row.parent, origin = parent.getBoundingClientRect();
      const css = win.getComputedStyle(image), width = image.offsetWidth, height = image.offsetHeight;
      const left = box.left + box.width / 2 - width / 2 - origin.left + parent.scrollLeft - parent.clientLeft;
      const top = box.top + box.height / 2 - height / 2 - origin.top + parent.scrollTop - parent.clientTop;
      Object.assign(row.surface.style, {left: left + 'px', top: top + 'px', width: width + 'px', height: height + 'px',
        transform: css.transform, transformOrigin: '50% 50%', opacity: css.opacity, zIndex: String((parseInt(css.zIndex) || 0) + 1)});
      row.surface.hidden = !width || !height || row.player && row.player.state.status !== 'ready';
      row.surface.style.opacity = row.frame && !row.snapshot ? '0' : css.opacity;
      if (row.frame) {
        const view = (row.attrs.viewport || '640x360').split('x').map(Number), scale = row.attrs.resize === 'scale';
        const iw = scale ? view[0] : Math.max(1, width), ih = scale ? view[1] : Math.max(1, height);
        const viewport = iw + 'x' + ih;
        Object.assign(row.frame.style, {width: iw + 'px', height: ih + 'px', transform: scale ? 'scale(' + width / iw + ')' : 'none'});
        if (row.viewport !== viewport) {row.viewport = viewport; row.generation++; message(row, 'snapshot');}
        const auto = !row.attrs.height || row.attrs.height === 'auto';
        const desired = heightOf(width, row.measured, row.attrs, lineOf(image));
        if (desired > 0 && Math.abs(height - desired) > 1) {
          image.style.height = Math.min(4096, desired) + 'px'; image.dataset.rapierNaturalHeight = String(desired);
          image.dispatchEvent(new win.Event('rapier-html-resize', {bubbles: true}));
        }
      }
      if (row.button) {row.button.hidden = !width || !height; row.button.style.zIndex = String((parseInt(css.zIndex) || 0) + 2); row.button.style.left = box.right - origin.left + parent.scrollLeft - parent.clientLeft - 44 + 'px'; row.button.style.top = box.top - origin.top + parent.scrollTop - parent.clientTop + 'px';}
    }
  }
  const resize = new win.ResizeObserver(schedule);
  const visibility = win.IntersectionObserver ? new win.IntersectionObserver(entries => {for (const entry of entries) {const row = owned.get(entry.target); if (row) {row.visible = entry.isIntersecting; applyPlayback(row);}}}, {rootMargin: '0px'}) : null;
  function sanitize(body, admitted = {}) {
    const template = doc.createElement('template'); template.innerHTML = body;
    const allowed = new Set(HTML_ELEMENTS);
    let count = 0, pixels = 0;
    const css = value => {
      if (value.length > 262144) throw new Error('CSS byte budget');
      const decoded = value.replace(/\\([0-9a-f]{1,6})\s?|\\([^\r\n])/gi, (_, hex, char) => hex ? String.fromCodePoint(Math.min(0x10ffff, parseInt(hex,16))) : char);
      if (value.includes('\\') && /(?:url|image-set|image|src)\s*\(|@import/i.test(decoded)) throw new Error('Escaped CSS resource is unsupported');
      if (/(?:image-set|image|src)\s*\(/i.test(decoded)) throw new Error('CSS image resources require an image element');
      return value.replace(/@import(?![\w-])[^;{}]*;?/gi, ' ').replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (_, a,b,c) => {
        const url = (a || b || c || '').trim();
        if (/^#[A-Za-z][\w.-]*$/.test(url)) return 'url("' + url + '")';
        if (/^data:(?:font\/[\w-]+|application\/(?:font-woff|vnd.ms-fontobject|octet-stream));base64,[A-Za-z0-9+/=]+$/i.test(url)) {
          if (url.length > 1400000 || !['\u0000\u0001\u0000\u0000','OTTO','wOFF','wOF2'].includes(win.atob(url.slice(url.indexOf(',') + 1)).slice(0,4))) throw new Error('Invalid embedded font container');
          return 'url("' + url + '")';
        }
        if (/^data:/i.test(url)) throw new Error('CSS image resources require an image element');
        return 'url()';
      });
    };
    const walk = root => {
      for (const el of [...root.children]) {
        if (++count > 512) throw new Error('HTML node budget exceeded');
        const tag = el.localName.toLowerCase();
        if (!allowed.has(tag)) {el.remove(); continue;}
        if (tag === 'style') el.textContent = css(el.textContent);
        if (el.hasAttribute('style')) el.setAttribute('style', css(el.getAttribute('style')));
        for (const attr of [...el.attributes]) {
          const name = attr.name.toLowerCase(), value = attr.value;
          if (name.startsWith('on') || name.startsWith('data-rapier-') || ['nonce','srcdoc','is','autofocus','form','formaction','action','target','download','ping','xmlns:xlink'].includes(name)) el.removeAttribute(attr.name);
          if (['src','srcset','href'].includes(attr.localName.toLowerCase()) && !(name.endsWith('href') && /^#[A-Za-z][\w.-]*$/.test(value) ||
              (name === 'src' && tag === 'img' || name.endsWith('href') && tag === 'image') && /^data:image\/(?:png|jpeg|webp|gif|jxl|svg\+xml);/i.test(value))) el.removeAttribute(attr.name);
        }
        if (tag.startsWith('animate') || tag === 'set') {
          const attribute = (el.getAttribute('attributeName') || '').trim().toLowerCase().split(':').pop();
          if (/^(?:href|base|on.*|style|src)$/.test(attribute)) {el.remove(); continue;}
          if (/[a-z_]\w*\./i.test(el.getAttribute('begin') || '')) el.setAttribute('begin', '0s');
        }
        if (tag === 'button') el.setAttribute('type', 'button');
        if (tag === 'img' || tag === 'image') {
          const name = tag === 'img' ? 'src' : el.hasAttribute('href') ? 'href' : 'xlink:href', original = el.getAttribute(name);
          if (original) {
            const match = /^data:(image\/(?:png|jpeg|webp|gif|jxl|svg\+xml));(?:charset=[^;,]+;)?base64,([A-Za-z0-9+/]+={0,2})$/i.exec(original);
            if (!match || original.length > 24 * 1024 * 1024) throw new Error('Image requires a bounded base64 data URL');
            const url = 'data:' + match[1].toLowerCase() + ';base64,' + match[2];
            const bytes = Uint8Array.from(win.atob(match[2]), c => c.charCodeAt(0));
            const info = match[1].toLowerCase() === 'image/gif' ? media.inspectGIF(bytes) : imageInfo(url) || admitted[url];
            if (!info && match[1].toLowerCase() !== 'image/svg+xml') {el.removeAttribute(name); continue;}
            if (info) {pixels += info.width * info.height; if (pixels > 24000000) throw new Error('HTML image pixel budget'); admitted[url] = {width: info.width, height: info.height, animated: !!info.animated};}
            if (match[1].toLowerCase() === 'image/svg+xml') {
              const svgText = new win.TextDecoder('utf-8', {fatal: true}).decode(bytes);
              if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(svgText)) throw new Error('SVG declarations are unsupported');
              const parsed = new win.DOMParser().parseFromString(svgText, 'image/svg+xml');
              if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') throw new Error('Invalid SVG image');
              const svg = doc.importNode(parsed.documentElement, true);
              if (el.getAttribute('style')) svg.setAttribute('style', el.getAttribute('style'));
              for (const key of ['width','height','class','id']) if (el.hasAttribute(key)) svg.setAttribute(key, el.getAttribute(key));
              const holder = doc.createElement('div'); holder.append(svg); walk(holder); el.replaceWith(svg); continue;
            }
            el.setAttribute(name, info.first ? 'data:image/gif;base64,' + media.encode(info.first) : url);
            if (info.animated) {
              if (tag !== 'img') throw new Error('Animated SVG image element is unsupported');
              el.dataset.rapierAnimation = url; el.dataset.rapierMediaWidth = info.width; el.dataset.rapierMediaHeight = info.height;
              if (info.first) el.dataset.rapierFirstFrame = el.src; else el.src = pixel;
            }
          }
        }
        walk(el);
      }
    };
    walk(template.content); return template.innerHTML;
  }
  function install(image) {
    const key = keyOf(image); if (!key || key.length > 24 * 1024 * 1024) return;
    const existing = owned.get(image); if (existing?.key === key) return; if (existing) release(existing);
    if (owned.size >= 64 || [...owned.values()].reduce((sum, row) => sum + row.key.length, key.length) > 32 * 1024 * 1024) {
      if (!noticed) {noticed = true; options.notice?.(owned.size >= 64 ? 'Only 64 objects play at once; the rest show their box' : 'Objects past 32 MB show their box');}
      image.dataset.rapierContour = 'budget-box'; return;
    }
    const parent = image.closest('.block-read') || image.parentElement?.parentElement; if (!parent) return;
    const row = {image, key, parent, id: prefix + '-' + ++sequence, generation: 0, attrs: {}, visible: !visibility, paused: local.get(key) ?? reduced.matches};
    try {
      if (image.hasAttribute('data-rapier-html') || /^data:image\/svg\+xml;/i.test(key)) {
        if (!image.hasAttribute('data-rapier-html') && key.length > 1398200) return;
        const value = image.hasAttribute('data-rapier-html') ? JSON.parse(decodeURIComponent(key)) : {
          body: new win.TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(win.atob(key.slice(key.indexOf(',') + 1)), c => c.charCodeAt(0))),
          attrs: {resize: 'scale', viewport: (image.dataset.rapierNaturalWidth || image.naturalWidth || 640) + 'x' + (image.dataset.rapierNaturalHeight || image.naturalHeight || 360)}};
        if (typeof value.body !== 'string' || value.body.length > 1048576) return;
        row.attrs = value.attrs || {}; const admitted = value.media || {}; const body = sanitize(value.body, admitted); row.media = admitted;
        const viewport = (row.attrs.viewport || '640x360').split('x').map(Number);
        row.pixels = viewport[0] * viewport[1] + Object.values(admitted).reduce((sum, size) => sum + size.width * size.height, 0);
        if (!Number.isFinite(row.pixels) || [...owned.values()].reduce((sum, item) => sum + (item.pixels || 0), row.pixels) > 24000000) throw new Error('Object surface pixel budget');
        const surface = doc.createElement('div'), frame = doc.createElement('iframe'); row.surface = surface; row.frame = frame;
        frame.dataset.rapierHtmlPreview = '';
        surface.dataset.rapierHtmlPreview = ''; surface.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden;margin:0;padding:0;background:transparent';
        frame.title = value.attrs?.id || 'HTML block'; frame.tabIndex = -1; frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
        frame.style.cssText = 'display:block;border:0;margin:0;padding:0;pointer-events:none;background:transparent;max-width:none;transform-origin:0 0';
        const frameNonce = random(), policy = "default-src 'none'; connect-src 'none'; img-src data:; font-src data:; media-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-" + frameNonce + "'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'";
        const script = '(' + frameRuntime.toString() + ')(' + JSON.stringify({id: row.id}) + ',' + media.source + ',window);';
        frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '"><meta name="referrer" content="no-referrer"><style>html{color-scheme:light dark;overflow:hidden}body{margin:0;display:flow-root;overflow-wrap:anywhere}*{box-sizing:border-box}img,svg{max-width:100%}</style></head><body>' + body + '<script nonce="' + frameNonce + '">' + script.replace(/<\/script/gi, '<\\/script') + '</script></body></html>';
        surface.append(frame); parent.append(surface);
        image.dataset.rapierContour = 'pending-box';
      } else {
        const canvas = doc.createElement('canvas'); row.surface = canvas; canvas.dataset.rapierObjectPreview = '';
        canvas.style.cssText = 'position:absolute;pointer-events:none;margin:0;padding:0;max-width:none'; parent.append(canvas);
        row.player = media.raster(key, canvas, state => {
          if (owned.get(image) !== row) return;
          image.dataset.rapierPlayback = state.status;
          if (state.status === 'ready') image.dataset.rapierLiveSurface = ''; else image.removeAttribute('data-rapier-live-surface');
          if (state.first) {image.dataset.rapierFirstFrame = state.first; if (image.src !== state.first) image.src = state.first;}
          row.animated = state.animated; control(row); schedule();
        }, {width: +(image.dataset.rapierNaturalWidth || image.naturalWidth), height: +(image.dataset.rapierNaturalHeight || image.naturalHeight)});
        row.animated = row.player.state.animated; image.dataset.rapierContour = row.animated ? 'animation-box' : 'sampled';
      }
      owned.set(image, row); resize.observe(image); visibility?.observe(image); control(row); applyPlayback(row); schedule();
      if (options.source) void (async () => {
        const source = options.source(), label = await objectPosterLabel(image), assets = win.RapierImageAssets;
        const index = assets.documentAssets(source), poster = index.assets.get(assets.normalizeLabel(label));
        const match = /^object-poster-v1 (sampled|animation-box|unavailable-box) ([1-9]\d*)x([1-9]\d*)$/.exec(poster?.title || '');
        if (!poster || poster.codec !== 'image/png' || !match || index.duplicateLabels.has?.(assets.normalizeLabel(label))) return;
        const {bytes, codec} = assets.decodeDataImageBytes(poster.url), size = assets.imageDimensions(bytes, codec);
        if (size.width !== +match[2] || size.height !== +match[3] || size.width * size.height > 1048576 || owned.get(image) !== row || keyOf(image) !== key || options.source() !== source || row.snapshot) return;
        image.src = poster.url; image.dataset.rapierFirstFrame = poster.url;
        if (image.hasAttribute('data-rapier-html')) {row.measured = image.offsetWidth * size.height / size.width; schedule();}
      })().catch(() => {});
    } catch (error) {row.player?.close(); row.surface?.remove(); image.dataset.rapierContour = 'unavailable-box'; image.dataset.rapierPlayback = 'admission-failed';}
  }
  const scan = () => {if (!dead) {
    if (options.identity && options.identity() !== identity) {identity = options.identity(); local.clear(); for (const row of [...owned.values()]) release(row);}
    for (const row of [...owned.values()]) if (!row.image.isConnected || keyOf(row.image) !== row.key) release(row);
    for (const image of root.querySelectorAll('img[data-rapier-html],img[data-rapier-animation]')) install(image); schedule();}};
  async function receive(event) {
    const value = event.data;
    if (value?.type !== 'rapier-object-state' || typeof value.id !== 'string') return;
    const row = [...owned.values()].find(item => item.id === value.id && item.frame?.contentWindow === event.source);
    if (!row || keyOf(row.image) !== row.key || !row.image.isConnected) return;
    if (Number.isFinite(value.height) && value.height > 0 && value.height <= 4096) {
      const turn = value.height > row.measured ? 1 : value.height < row.measured ? -1 : 0;
      if (turn && row.turn && turn !== row.turn) row.turns = (row.turns || 0) + 1;
      if (turn) row.turn = turn;
      if (turn >= 0 || !(row.turns > 4)) {row.measured = value.height; schedule();}
    }
    if (typeof value.animated === 'boolean') {row.animated = value.animated; control(row); applyPlayback(row);}
    if (typeof value.mediaStatus === 'string') row.image.dataset.rapierPlayback = value.mediaStatus.slice(0, 48);
    if (typeof value.snapshotStatus === 'string') row.image.dataset.rapierSnapshot = value.snapshotStatus.slice(0, 48);
    if (value.snapshotStatus === 'unavailable') row.image.dataset.rapierContour = 'unavailable-box';
    if (typeof value.markup !== 'string' || value.markup.length > 2097152 || !Number.isFinite(value.width) || !Number.isFinite(value.viewportHeight) ||
        value.width < 1 || value.viewportHeight < 1 || value.width > 4096 || value.viewportHeight > 4096) return;
    if (Math.abs(row.frame.clientWidth - value.width) > 1 || Math.abs(row.frame.clientHeight - value.viewportHeight) > 1) {message(row, 'snapshot'); return;}
    const stamp = ++row.generation, scale = Math.min(1, 1024 / Math.max(value.width, value.viewportHeight));
    const canvas = doc.createElement('canvas'); canvas.width = Math.max(1, Math.ceil(value.width * scale)); canvas.height = Math.max(1, Math.ceil(value.viewportHeight * scale));
    const snapshot = new win.Image();
    try {
      snapshot.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + canvas.width + '" height="' + canvas.height + '" viewBox="0 0 ' + value.width + ' ' + value.viewportHeight + '"><foreignObject width="100%" height="100%">' + value.markup + '</foreignObject></svg>');
      await Promise.race([snapshot.decode(), new Promise((_, reject) => win.setTimeout(() => reject(new Error('Snapshot decode timeout')), 2000))]);
      if (dead || owned.get(row.image) !== row || stamp !== row.generation || keyOf(row.image) !== row.key) return;
      if (Math.abs(row.frame.clientWidth - value.width) > 1 || Math.abs(row.frame.clientHeight - value.viewportHeight) > 1) {message(row, 'snapshot'); return;}
      const ctx = canvas.getContext('2d'); ctx.drawImage(snapshot, 0, 0); ctx.getImageData(0, 0, 1, 1);
      const first = canvas.toDataURL('image/png'); if (first.length > 4 * 1024 * 1024) throw new Error('Snapshot byte budget');
      row.image.dataset.rapierFirstFrame = first; row.image.src = first;
      row.snapshot = true;
      row.image.dataset.rapierLiveSurface = '';
      row.image.dataset.rapierContour = row.animated ? 'animation-box' : value.snapshotStatus === 'sampled' ? 'sampled' : 'unavailable-box';
      row.image.dataset.rapierNaturalWidth = String(value.width); row.image.dataset.rapierNaturalHeight = String(value.viewportHeight);
      row.image.dispatchEvent(new win.Event('rapier-html-resize', {bubbles: true})); schedule();
    } catch {if (owned.get(row.image) === row) {row.image.dataset.rapierContour = 'unavailable-box'; row.image.dataset.rapierSnapshot = 'unavailable';}}
    finally {snapshot.removeAttribute('src'); canvas.width = canvas.height = 0;}
  }
  const changedVisibility = () => {for (const row of owned.values()) applyPlayback(row);};
  const hidden = event => {if (!event.persisted) {api.close(); return;} for (const row of owned.values()) {row.visible = false; applyPlayback(row);}};
  const shown = () => {scan(); for (const row of owned.values()) {const box = row.image.getBoundingClientRect();
    row.visible = box.bottom > 0 && box.top < win.innerHeight && box.right > 0 && box.left < win.innerWidth; applyPlayback(row);}};
  const changedMotion = () => {if (reduced.matches) for (const row of owned.values()) {row.paused = true; applyPlayback(row);}};
  const observer = new win.MutationObserver(records => {if (records.some(record => record.type === 'childList' || record.target.matches?.('img[data-rapier-html],img[data-rapier-animation]'))) scan();});
  observer.observe(root, {subtree: true, childList: true, attributes: true, attributeFilter: ['data-rapier-html','data-rapier-animation','style']});
  win.addEventListener('message', receive); win.addEventListener('resize', schedule); doc.addEventListener('scroll', schedule, true);
  doc.addEventListener('visibilitychange', changedVisibility); reduced.addEventListener('change', changedMotion);
  const api = {playback(image, playing) {return setPlayback(owned.get(image), playing);},
    async first(image) {const row = owned.get(image); if (row?.player) {const first = await row.player.first(); if (first) image.dataset.rapierFirstFrame = first;} return image.dataset.rapierFirstFrame || '';},
    media(image) {return owned.get(image)?.media || {};},
    reset() {local.clear(); for (const row of [...owned.values()]) release(row); scan();},
    inspect(image) {const row = owned.get(image); return row ? {animated: !!row.animated, paused: row.paused, visible: row.visible,
      snapshot: image.dataset.rapierSnapshot || null, contour: image.dataset.rapierContour || null, status: image.dataset.rapierPlayback || 'ready'} : null;},
    close() {dead = true; win.cancelAnimationFrame(pending); observer.disconnect(); resize.disconnect(); visibility?.disconnect();
      win.removeEventListener('message', receive); win.removeEventListener('resize', schedule); doc.removeEventListener('scroll', schedule, true);
      doc.removeEventListener('visibilitychange', changedVisibility); reduced.removeEventListener('change', changedMotion);
      for (const row of [...owned.values()]) release(row); sheet.remove(); local.clear();
      win.removeEventListener('pagehide', hidden); win.removeEventListener('pageshow', shown); if (doc.rapierObjects === api) delete doc.rapierObjects;}};
  win.addEventListener('pagehide', hidden); win.addEventListener('pageshow', shown); if (!options.root) doc.rapierObjects = api; scan(); return api;
}

export async function materializeObjects(root, {signal, width = 640, imageInfo, poster, bestEffort = false, issues = [], document: live} = {}) {
  const doc = root.ownerDocument.defaultView ? root.ownerDocument : live, win = doc.defaultView;
  const images = [...root.querySelectorAll('img[data-rapier-html],img[data-rapier-animation]')];
  if (images.length > 64) throw new Error('Object export count budget');
  for (const image of images) {
    signal?.throwIfAborted();
    const held = await poster?.(image);
    const host = doc.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + Math.max(1, Math.min(4096, width)) + 'px;line-height:24px;font-size:16px;pointer-events:none;color-scheme:light';
    const paragraph = doc.createElement('p'), clone = image.cloneNode(true); paragraph.style.margin = '0';
    clone.removeAttribute('data-rapier-live-surface'); clone.style.transform = 'none'; clone.style.opacity = '1';
    paragraph.append(clone); host.append(paragraph); doc.body.append(host);
    const api = mountHtmlBlocks(doc, {root: host, imageInfo});
    for (const frame of host.querySelectorAll('iframe')) frame.style.colorScheme = 'light';
    try {
      if (image.hasAttribute('data-rapier-html')) {
        const value = JSON.parse(decodeURIComponent(image.dataset.rapierHtml)); value.media = api.media(clone);
        image.dataset.rapierHtml = encodeURIComponent(JSON.stringify(value));
      }
      if (held) {
        image.src = held.url; image.dataset.rapierFirstFrame = held.url; image.dataset.rapierContour = held.contour || 'unverified-box';
        if (image.hasAttribute('data-rapier-html')) {
          const attrs = JSON.parse(decodeURIComponent(image.dataset.rapierHtml)).attrs;
          image.style.height = objectHeight(clone.offsetWidth, clone.offsetWidth * held.height / held.width, attrs, 24) + 'px';
        }
        image.dataset.rapierSnapshot = 'sampled'; continue;
      }
      await api.first(clone);
      const started = win.performance.now();
      const settles = image.hasAttribute('data-rapier-html') && (() => {const attrs = JSON.parse(decodeURIComponent(image.dataset.rapierHtml)).attrs || {};
        return (!attrs.height || attrs.height === 'auto') && attrs.resize !== 'scale';})();
      const first = new win.Image();
      try {
        for (;;) {
          while (!clone.dataset.rapierFirstFrame) {
            signal?.throwIfAborted();
            if (clone.dataset.rapierSnapshot === 'unavailable' || clone.dataset.rapierPlayback === 'admission-failed' || win.performance.now() - started > 5000)
              throw Object.assign(new Error('A required first-frame image is unavailable; original source is unchanged.'), {code: 'OBJECT_SNAPSHOT_UNAVAILABLE'});
            await new Promise(resolve => win.setTimeout(resolve, 20));
          }
          if (clone.dataset.rapierSnapshot === 'unsupported-motion') throw Object.assign(new Error('This SVG motion cannot be frozen by this renderer.'), {code: 'OBJECT_SNAPSHOT_UNSUPPORTED'});
          const frame = clone.dataset.rapierFirstFrame; first.src = frame;
          await first.decode(); signal?.throwIfAborted();
          if (!settles || !first.naturalWidth || Math.abs(clone.offsetWidth * first.naturalHeight / first.naturalWidth - clone.offsetHeight) <= 2) break;
          if (clone.dataset.rapierFirstFrame === frame) delete clone.dataset.rapierFirstFrame;
        }
        if (!first.naturalWidth || !first.naturalHeight || first.naturalWidth * first.naturalHeight > 24000000) throw new Error('First-frame image budget');
        const scale = Math.min(1, 1024 / Math.max(first.naturalWidth, first.naturalHeight)), canvas = doc.createElement('canvas');
        canvas.width = Math.ceil(first.naturalWidth * scale); canvas.height = Math.ceil(first.naturalHeight * scale);
        try {canvas.getContext('2d').drawImage(first, 0, 0, canvas.width, canvas.height); image.src = canvas.toDataURL('image/png');}
        finally {canvas.width = canvas.height = 0;}
      } finally {first.removeAttribute('src');}
      image.dataset.rapierFirstFrame = image.src;
      if (image.hasAttribute('data-rapier-html')) image.style.height = clone.style.height;
      image.dataset.rapierContour = clone.dataset.rapierContour || 'animation-box';
      image.dataset.rapierSnapshot = clone.dataset.rapierSnapshot || 'sampled';
    } catch (error) {signal?.throwIfAborted(); if (!bestEffort) throw error; issues.push({code: error.code || 'OBJECT_SNAPSHOT_UNAVAILABLE', message: error.message});}
    finally {api.close(); host.remove();}
  }
  return root;
}
