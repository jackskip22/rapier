// SPDX-License-Identifier: MIT
const SVG = 'http://www.w3.org/2000/svg';
const number = value => Number(Number(value).toFixed(6));
const nums = values => values.map(number).join(' ');
const unsupported = () => { throw new Error('SVG operation needs browser compositing'); };

function pathCommands(value) {
  const tokens = String(value).match(/[a-zA-Z]|[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?/g) || [];
  if (String(value).replace(/[a-zA-Z]|[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?|[\s,]+/g, '')) unsupported();
  const counts = {M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7};
  let at = 0, command = '', previous = '', x = 0, y = 0, startX = 0, startY = 0, controlX = 0, controlY = 0, out = '';
  const emit = (kind, values) => { if (!values.every(Number.isFinite)) unsupported(); out += nums(values) + ' ' + kind + '\n'; };
  while (at < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[at])) command = tokens[at++];
    if (!command) unsupported();
    const kind = command.toUpperCase(), relative = command !== kind;
    if (kind === 'Z') { out += 'h\n'; x = startX; y = startY; previous = 'Z'; command = ''; continue; }
    const size = counts[kind]; if (!size || at + size > tokens.length) unsupported();
    const p = tokens.slice(at, at + size).map(Number); if (!p.every(Number.isFinite)) unsupported(); at += size;
    const px = offset => p[offset] + (relative ? x : 0), py = offset => p[offset] + (relative ? y : 0);
    let nextX, nextY;
    if (kind === 'M' || kind === 'L') {
      nextX = px(0); nextY = py(1); emit(kind === 'M' ? 'm' : 'l', [nextX, nextY]);
      if (kind === 'M') { startX = nextX; startY = nextY; command = relative ? 'l' : 'L'; }
    } else if (kind === 'H') { nextX = px(0); nextY = y; emit('l', [nextX, nextY]); }
    else if (kind === 'V') { nextX = x; nextY = py(0); emit('l', [nextX, nextY]); }
    else if (kind === 'C') {
      nextX = px(4); nextY = py(5); controlX = px(2); controlY = py(3);
      emit('c', [px(0), py(1), controlX, controlY, nextX, nextY]);
    } else if (kind === 'S') {
      nextX = px(2); nextY = py(3);
      const firstX = /[CS]/.test(previous) ? 2 * x - controlX : x, firstY = /[CS]/.test(previous) ? 2 * y - controlY : y;
      controlX = px(0); controlY = py(1); emit('c', [firstX, firstY, controlX, controlY, nextX, nextY]);
    } else if (kind === 'Q' || kind === 'T') {
      const qx = kind === 'Q' ? px(0) : /[QT]/.test(previous) ? 2 * x - controlX : x;
      const qy = kind === 'Q' ? py(1) : /[QT]/.test(previous) ? 2 * y - controlY : y;
      nextX = px(kind === 'Q' ? 2 : 0); nextY = py(kind === 'Q' ? 3 : 1);
      emit('c', [x + (qx - x) * 2 / 3, y + (qy - y) * 2 / 3, nextX + (qx - nextX) * 2 / 3, nextY + (qy - nextY) * 2 / 3, nextX, nextY]);
      controlX = qx; controlY = qy;
    } else {
      nextX = px(5); nextY = py(6);
      let rx = Math.abs(p[0]), ry = Math.abs(p[1]);
      if (![0, 1].includes(p[3]) || ![0, 1].includes(p[4])) unsupported();
      if (!rx || !ry) emit('l', [nextX, nextY]);
      else if (nextX !== x || nextY !== y) {
        const angle = p[2] * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        const dx = (x - nextX) / 2, dy = (y - nextY) / 2, u = c * dx + s * dy, v = -s * dx + c * dy;
        const fit = u * u / (rx * rx) + v * v / (ry * ry);
        if (fit > 1) { const scale = Math.sqrt(fit); rx *= scale; ry *= scale; }
        const denominator = rx * rx * v * v + ry * ry * u * u;
        const scale = (p[3] === p[4] ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - denominator) / denominator));
        const cu = scale * rx * v / ry, cv = -scale * ry * u / rx;
        const cx = c * cu - s * cv + (x + nextX) / 2, cy = s * cu + c * cv + (y + nextY) / 2;
        let start = Math.atan2((v - cv) / ry, (u - cu) / rx), end = Math.atan2((-v - cv) / ry, (-u - cu) / rx), sweep = end - start;
        if (p[4] && sweep < 0) sweep += 2 * Math.PI; else if (!p[4] && sweep > 0) sweep -= 2 * Math.PI;
        const steps = Math.ceil(Math.abs(sweep) / (Math.PI / 2)), step = sweep / steps;
        const point = t => [cx + c * rx * Math.cos(t) - s * ry * Math.sin(t), cy + s * rx * Math.cos(t) + c * ry * Math.sin(t)];
        const tangent = t => [-c * rx * Math.sin(t) - s * ry * Math.cos(t), -s * rx * Math.sin(t) + c * ry * Math.cos(t)];
        for (let i = 0; i < steps; i++) {
          const finish = start + step, alpha = 4 / 3 * Math.tan(step / 4), first = point(start), last = point(finish), a = tangent(start), b = tangent(finish);
          emit('c', [first[0] + alpha * a[0], first[1] + alpha * a[1], last[0] - alpha * b[0], last[1] - alpha * b[1], ...last]); start = finish;
        }
      }
    }
    x = nextX; y = nextY; previous = kind;
  }
  return out;
}

function geometry(node) {
  const value = name => { const property = node[name]?.baseVal; return property && typeof property.value === 'number' ? property.value : Number(node.getAttribute(name) || 0); };
  const kind = node.localName;
  if (kind === 'path') return pathCommands(node.getAttribute('d') || '');
  if (kind === 'line') return nums([value('x1'), value('y1')]) + ' m\n' + nums([value('x2'), value('y2')]) + ' l\n';
  if (kind === 'polyline' || kind === 'polygon') {
    const points = Array.from({length: node.points.numberOfItems}, (_, i) => node.points.getItem(i));
    return points.map((point, i) => nums([point.x, point.y]) + (i ? ' l\n' : ' m\n')).join('') + (kind === 'polygon' ? 'h\n' : '');
  }
  if (kind === 'rect') {
    const x = value('x'), y = value('y'), width = value('width'), height = value('height');
    if (!(width > 0 && height > 0)) return '';
    let rx = value('rx'), ry = value('ry'); if (!node.hasAttribute('rx')) rx = ry; if (!node.hasAttribute('ry')) ry = rx;
    rx = Math.min(rx, width / 2); ry = Math.min(ry, height / 2);
    if (!(rx > 0 && ry > 0)) return nums([x, y, width, height]) + ' re\n';
    return pathCommands(`M${x + rx} ${y}H${x + width - rx}A${rx} ${ry} 0 0 1 ${x + width} ${y + ry}V${y + height - ry}A${rx} ${ry} 0 0 1 ${x + width - rx} ${y + height}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + height - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`);
  }
  if (kind === 'circle' || kind === 'ellipse') {
    const cx = value('cx'), cy = value('cy'), rx = value(kind === 'circle' ? 'r' : 'rx'), ry = value(kind === 'circle' ? 'r' : 'ry');
    if (!(rx > 0 && ry > 0)) return '';
    return pathCommands(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`);
  }
  unsupported();
}

export async function collectPdfVectors(main, {width, height, count, capture, signal, current, check, maxBytes, sanitizeSvg, collectText}) {
  const document = main.ownerDocument, window = document.defaultView, origin = main.getBoundingClientRect();
  const pages = Array.from({length: count}, () => []), hidden = [], temporary = [], textRoots = [], textRestores = [];
  const colorCanvas = document.createElement('canvas'); colorCanvas.width = colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext('2d', {willReadFrequently: true});
  if (!colorContext) return {pages, textRoots, restore() {}};
  const colors = new Map();
  let rasterBytes = 0, visited = 0;
  const compress = async bytes => {
    const result = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
    check(); rasterBytes += result.length;
    if (rasterBytes > maxBytes) throw Object.assign(new Error('The exported file exceeds the file limit.'), {code: 'export_too_large'});
    return result;
  };
  const color = text => {
    if (text === 'none') return null;
    if (text.includes('url(')) unsupported();
    if (!colors.has(text)) { colorContext.clearRect(0, 0, 1, 1); colorContext.fillStyle = text; colorContext.fillRect(0, 0, 1, 1); colors.set(text, Array.from(colorContext.getImageData(0, 0, 1, 1).data, n => n / 255)); }
    return colors.get(text);
  };
  const restore = () => { for (const undo of textRestores.reverse()) undo(); textRestores.length = 0; for (const {node, style} of hidden) {if (style == null) node.removeAttribute('style'); else node.setAttribute('style', style);} for (const node of temporary) node.remove(); colorCanvas.width = colorCanvas.height = 0; };
  const roots = Array.from(main.querySelectorAll('svg,img')).filter(node => node.localName === 'img' || !node.ownerSVGElement);
  try {
    for (const original of roots) {
      check();
      let root = original, mount = null;
      const originalBox = original.getBoundingClientRect();
      if (!(originalBox.width > 0 && originalBox.height > 0)) continue;
      if (original.localName === 'img') {
        if (typeof sanitizeSvg !== 'function') continue;
        const address = original.getAttribute('src') || '', match = /^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i.exec(address);
        if (!match) continue;
        let text;
        try {text = match[1] ? new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(atob(match[2]), ch => ch.charCodeAt(0))) : decodeURIComponent(match[2]);} catch (_) {continue;}
        const parsed = new window.DOMParser().parseFromString(sanitizeSvg(text), 'image/svg+xml');
        if (parsed.querySelector('parsererror') || parsed.documentElement.namespaceURI !== SVG) continue;
        root = document.importNode(parsed.documentElement, true);
        root.style.setProperty('width', originalBox.width + 'px', 'important'); root.style.setProperty('height', originalBox.height + 'px', 'important');
        mount = document.createElement('div'); mount.style.cssText = `position:fixed;left:${originalBox.left}px;top:${originalBox.top}px;width:${originalBox.width}px;height:${originalBox.height}px;pointer-events:none`;
        mount.attachShadow({mode: 'open'}).append(root); document.body.append(mount); temporary.push(mount); await document.fonts.ready;
        const glyphs = await collectText?.(root); if (glyphs) textRestores.push(glyphs.restore);
        textRoots.push({root, original, text: glyphs});
      }
      const box = root.getBoundingClientRect(), nodes = [root, ...root.querySelectorAll('*')], sequence = [];
      const raster = async node => {
        const clone = root.cloneNode(true), copies = [clone, ...clone.querySelectorAll('*')];
        const selected = copies[nodes.indexOf(node)];
        for (let held = selected; held && held !== clone; held = held.parentElement)
          for (const sibling of Array.from(held.parentElement.children)) if (sibling !== held && !['defs', 'style', 'metadata', 'title', 'desc'].includes(sibling.localName)) sibling.remove();
        const wrap = document.createElement('div');
        wrap.style.cssText = `position:fixed;left:0;top:0;width:${box.width}px;height:${box.height}px;pointer-events:none;background:transparent`;
        clone.style.setProperty('width', box.width + 'px', 'important'); clone.style.setProperty('height', box.height + 'px', 'important');
        wrap.append(clone); document.body.append(wrap);
        try {
          const plainText = node.localName === 'text' && window.getComputedStyle(node).filter === 'none' && window.getComputedStyle(node).textShadow === 'none';
          const bounds = plainText ? node.getBoundingClientRect() : box;
          const left = Math.max(0, bounds.left - box.left - 2), top = Math.max(0, bounds.top - box.top - 2);
          const right = Math.min(box.width, bounds.right - box.left + 2), bottom = Math.min(box.height, bounds.bottom - box.top + 2);
          if (!(right > left && bottom > top)) return;
          const result = await capture({root: wrap, clip: {x: left, y: top, width: right - left, height: bottom - top}, transparent: true, scale: 2, signal, current, pixels: true}); check();
          if (result?.rgb instanceof Uint8Array && result?.alpha instanceof Uint8Array) {
            return {image: {rgb: await compress(result.rgb), alpha: await compress(result.alpha), width: result.width, height: result.height}, x: box.left - origin.left + left, y: box.top - origin.top + top, width: right - left, height: bottom - top};
          }
          const image = new window.Image(); image.src = 'data:' + result.mimeType + ';base64,' + result.data; await image.decode(); check();
          const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
          try {
            const context = canvas.getContext('2d', {willReadFrequently: true}); if (!context) throw new Error('PDF image conversion is unavailable.'); context.drawImage(image, 0, 0);
            const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data, rgb = new Uint8Array(canvas.width * canvas.height * 3), alpha = new Uint8Array(canvas.width * canvas.height);
            for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {rgb.set(rgba.subarray(i, i + 3), p * 3); alpha[p] = rgba[i + 3];}
            return {image: {rgb: await compress(rgb), alpha: await compress(alpha), width: canvas.width, height: canvas.height}, x: box.left - origin.left + left, y: box.top - origin.top + top, width: right - left, height: bottom - top};
          } finally {canvas.width = canvas.height = 0; image.src = '';}
        } finally {wrap.remove();}
      };
      let geometries = 0;
      const walk = async node => {
        if (++visited % 128 === 0) {await new Promise(resolve => setTimeout(resolve, 0)); check();}
        const style = window.getComputedStyle(node), kind = node.localName;
        if (['defs', 'style', 'metadata', 'title', 'desc'].includes(kind) || style.display === 'none' || style.visibility === 'hidden') return;
        const group = ['svg', 'g', 'a'].includes(kind);
        if (style.filter !== 'none' || style.mask !== 'none' || style.clipPath !== 'none' || style.mixBlendMode !== 'normal' || (group && Number(style.opacity) !== 1)) { sequence.push({raster: node}); return; }
        if (group) {for (const child of node.children) await walk(child); return;}
        let path, fill, stroke;
        try {
          path = geometry(node); fill = color(style.fill);
          stroke = Number.parseFloat(style.strokeWidth) === 0 ? null : color(style.stroke);
          if (style.vectorEffect !== 'none' || style.markerStart !== 'none' || style.markerMid !== 'none' || style.markerEnd !== 'none' || style.paintOrder !== 'normal') unsupported();
        } catch (_) { sequence.push({raster: node}); return; }
        if (!path) return;
        const matrix = node.getScreenCTM(); if (!matrix || ![matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)) {sequence.push({raster: node}); return;}
        const opacity = Number(style.opacity), fillAlpha = fill ? fill[3] * Number(style.fillOpacity) * opacity : 1, strokeAlpha = stroke ? stroke[3] * Number(style.strokeOpacity) * opacity : 1;
        let commands = nums([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e - origin.left, matrix.f - origin.top]) + ' cm\n';
        if (fill) commands += nums(fill.slice(0, 3)) + ' rg\n';
        if (stroke) {
          const dash = style.strokeDasharray === 'none' ? [] : style.strokeDasharray.split(/[ ,]+/).map(Number.parseFloat);
          let factor = 1; const authoredLength = Number(node.getAttribute('pathLength'));
          if (authoredLength > 0 && typeof node.getTotalLength === 'function') factor = node.getTotalLength() / authoredLength;
          commands += nums(stroke.slice(0, 3)) + ' RG\n' + number(Number.parseFloat(style.strokeWidth)) + ' w\n' + ({butt: 0, round: 1, square: 2}[style.strokeLinecap] ?? 0) + ' J\n' + ({miter: 0, round: 1, bevel: 2}[style.strokeLinejoin] ?? 0) + ' j\n' + number(Number(style.strokeMiterlimit)) + ' M\n[' + nums(dash.map(n => n * factor)) + '] ' + number(Number.parseFloat(style.strokeDashoffset) * factor) + ' d\n';
        }
        commands += path + (fill && stroke ? style.fillRule === 'evenodd' ? 'B*' : 'B' : fill ? style.fillRule === 'evenodd' ? 'f*' : 'f' : stroke ? 'S' : 'n') + '\n';
        sequence.push({commands, fillAlpha, strokeAlpha}); geometries++;
      };
      await walk(root);
      if (!geometries && !textRoots.find(entry => entry.root === root)?.text?.nodes.size) continue;
      const painted = [];
      for (const piece of sequence) {const held = piece.raster ? await raster(piece.raster) : piece; if (held) painted.push(held);}
      const first = Math.max(0, Math.floor((box.left - origin.left + .01) / width)), last = Math.min(count - 1, Math.floor((box.right - origin.left - .01) / width));
      for (let page = first; page <= last; page++) pages[page].push({sequence: painted, x: -page * width, clip: {x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height}});
      hidden.push({node: original, style: original.getAttribute('style')}); original.style.setProperty('visibility', 'hidden', 'important');
    }
    return {pages, textRoots, restore};
  } catch (error) {restore(); throw error;}
}
