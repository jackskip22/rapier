// SPDX-License-Identifier: MIT
// The licensed static faces retain the shipped variable font's exact glyphs and metrics.

const familyName = value => value.trim().replace(/^['"]|['"]$/g, '');

function readFont(asset, fontCache) {
  if (fontCache.has(asset)) return fontCache.get(asset);
  const bytes = typeof asset.read === 'function' ? asset.read() : Uint8Array.from(atob(asset.data), character => character.charCodeAt(0));
  const view = new DataView(bytes.buffer), u16 = at => view.getUint16(at), i16 = at => view.getInt16(at), u32 = at => view.getUint32(at);
  const tag = at => String.fromCharCode(...bytes.subarray(at, at + 4)), tables = new Map();
  for (let at = 12, end = 12 + u16(4) * 16; at < end; at += 16) tables.set(tag(at), {at: u32(at + 8), length: u32(at + 12)});
  const head = tables.get('head').at, hhea = tables.get('hhea').at, hmtx = tables.get('hmtx').at, cmap = tables.get('cmap').at;
  const units = u16(head + 18), metricCount = u16(hhea + 34), glyphCount = u16(tables.get('maxp').at + 4);
  let mapping = null;
  for (let i = 0; i < u16(cmap + 2); i++) {
    const at = cmap + 4 + i * 8, platform = u16(at), encoding = u16(at + 2), table = cmap + u32(at + 4), format = u16(table);
    if ((platform === 0 || (platform === 3 && [1, 10].includes(encoding))) && [4, 12].includes(format))
      if (!mapping || format > mapping.format) mapping = {at: table, format};
  }
  if (!mapping) throw new Error('The embedded PDF font has no Unicode character map.');
  const glyph = code => {
    const at = mapping.at;
    if (mapping.format === 12) {
      let low = 0, high = u32(at + 12) - 1;
      while (low <= high) {const middle = (low + high) >> 1, row = at + 16 + middle * 12;
        if (code < u32(row)) high = middle - 1; else if (code > u32(row + 4)) low = middle + 1; else return u32(row + 8) + code - u32(row);}
      return 0;
    }
    if (code > 0xffff) return 0;
    const count = u16(at + 6) / 2, ends = at + 14, starts = ends + count * 2 + 2, deltas = starts + count * 2, offsets = deltas + count * 2;
    let low = 0, high = count - 1;
    while (low < high) {const middle = (low + high) >> 1; if (u16(ends + middle * 2) < code) low = middle + 1; else high = middle;}
    if (code < u16(starts + low * 2) || code > u16(ends + low * 2)) return 0;
    const offset = u16(offsets + low * 2), delta = i16(deltas + low * 2);
    if (!offset) return (code + delta) & 0xffff;
    const id = u16(offsets + low * 2 + offset + (code - u16(starts + low * 2)) * 2);
    return id ? (id + delta) & 0xffff : 0;
  };
  const coverage = at => {
    const rows = [];
    if (u16(at) === 1) for (let i = 0; i < u16(at + 2); i++) rows.push(u16(at + 4 + i * 2));
    else if (u16(at) === 2) for (let i = 0; i < u16(at + 2); i++) {const row = at + 4 + i * 6; for (let id = u16(row); id <= u16(row + 2); id++) rows[u16(row + 4) + id - u16(row)] = id;}
    else throw new Error('Unsupported embedded font coverage.');
    return rows;
  };
  const ligatures = [], gsub = tables.get('GSUB')?.at;
  if (gsub) {
    const features = gsub + u16(gsub + 6), lookups = gsub + u16(gsub + 8);
    for (let i = 0; i < u16(features); i++) {
      const record = features + 2 + i * 6; if (tag(record) !== 'liga') continue;
      const feature = features + u16(record + 4);
      for (let j = 0; j < u16(feature + 2); j++) {
        const lookup = lookups + u16(lookups + 2 + u16(feature + 4 + j * 2) * 2), rows = new Map();
        if (u16(lookup) !== 4 || (u16(lookup + 2) & ~8)) throw new Error('Unsupported embedded font ligature lookup.');
        for (let k = 0; k < u16(lookup + 4); k++) {
          const sub = lookup + u16(lookup + 6 + k * 2); if (u16(sub) !== 1) throw new Error('Unsupported embedded font ligature table.');
          const covered = coverage(sub + u16(sub + 2));
          for (let n = 0; n < u16(sub + 4); n++) {
            const set = sub + u16(sub + 6 + n * 2), values = [];
            for (let l = 0; l < u16(set); l++) {const item = set + u16(set + 2 + l * 2); values.push({glyph: u16(item), components: Array.from({length: u16(item + 2) - 1}, (_, m) => u16(item + 4 + m * 2))});}
            rows.set(covered[n], values);
          }
        }
        ligatures.push(rows);
      }
    }
  }
  const os2 = tables.get('OS/2');
  const font = {asset, bytes, units, glyph, ligatures, glyphCount, advance: id => u16(hmtx + Math.min(id, metricCount - 1) * 4),
    bbox: [36, 38, 40, 42].map(offset => i16(head + offset)), ascent: i16(hhea + 4), descent: i16(hhea + 6),
    capHeight: os2 && os2.length >= 90 && u16(os2.at) >= 2 ? i16(os2.at + 88) : i16(hhea + 4)};
  fontCache.set(asset, font); return font;
}

function shape(value, font, preserve, ligatures) {
  const result = [];
  for (let at = 0; at < value.length;) {
    const code = value.codePointAt(at), character = String.fromCodePoint(code), start = at;
    if (code === 0x00ad) {
      at += character.length;
      const own = font.glyph(code), hyphen = font.glyph(0x2d), glyph = own || hyphen;
      if (!glyph || glyph >= font.glyphCount) return null;
      result.push({start, end: at, text: own ? character : '-', glyph, soft: true});
      continue;
    }
    if (/[\p{Mark}\p{Format}]/u.test(character) || (/[\p{Letter}]/u.test(character) && !/\p{Script=Latin}/u.test(character)) || code === 0xfb01 || code === 0xfb02) return null;
    at += character.length;
    if (!preserve && /[ \t\r\n\f]/.test(character)) {while (at < value.length && /[ \t\r\n\f]/.test(value[at])) at++;}
    const text = preserve ? character.replace(/[\r\n]/g, '') : /[ \t\r\n\f]/.test(character) ? ' ' : character;
    const glyph = font.glyph(/[\t\r\n\f]/.test(character) ? 32 : code);
    if (!glyph || glyph >= font.glyphCount) return null;
    result.push({start, end: at, text, glyph});
  }
  if (ligatures) for (const lookup of font.ligatures) for (let i = 0; i < result.length; i++) {
    const found = lookup.get(result[i].glyph)?.find(row => row.components.every((id, offset) => result[i + offset + 1]?.glyph === id));
    if (found) {const held = result.splice(i, found.components.length + 1); result.splice(i, 0, {start: held[0].start, end: held.at(-1).end, text: held.map(row => row.text).join(''), glyph: found.glyph});}
  }
  return result;
}

export async function collectPdfGlyphs(main, {width, check, faces = []}) {
  const fontCache = new Map();
  const document = main.ownerDocument, window = document.defaultView, origin = main.getBoundingClientRect();
  const nodes = new Map(), hidden = [], canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  const restore = () => {
    for (const row of hidden) {
      if (row.wrap) {row.wrap.replaceWith(...row.wrap.childNodes); continue;}
      if (row.value) row.node.style.setProperty('-webkit-text-fill-color', row.value, row.priority); else row.node.style.removeProperty('-webkit-text-fill-color');
    }
    canvas.width = canvas.height = 0;
  };
  if (!context) return {nodes, restore};
  const colorCache = new Map(), styles = new Map(), styleOf = node => {if (!styles.has(node)) styles.set(node, window.getComputedStyle(node)); return styles.get(node);};
  const color = value => {if (!colorCache.has(value)) {context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); colorCache.set(value, Array.from(context.getImageData(0, 0, 1, 1).data, item => item / 255));} return colorCache.get(value);};
  const safe = node => {
    for (let parent = node; parent; parent = parent.parentElement) {
      const style = styleOf(parent);
      if (style.visibility !== 'visible' || style.display === 'none' || style.transform !== 'none' || style.filter !== 'none' || style.mixBlendMode !== 'normal'
        || ['absolute', 'fixed', 'sticky'].includes(style.position) || style.zIndex !== 'auto'
        || Number(style.opacity) !== 1 || style.clip !== 'auto' || style.clipPath !== 'none' || style.maskImage !== 'none'
        || (parent !== main && (style.overflowX !== 'visible' || style.overflowY !== 'visible'))) return false;
      if (parent === main) break;
    }
    return true;
  };
  try {
    let visited = 0;
    for (const element of main.querySelectorAll('*')) {
      if (++visited % 128 === 0) {await new Promise(resolve => setTimeout(resolve, 0)); check();}
      if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' || element.closest('svg,pre,.rapier-will-carrier')) continue;
      const textNodes = Array.from(element.childNodes).filter(node => node.nodeType === 3 && node.data.trim());
      if (!textNodes.length || !safe(element)) continue;
      const language = (element.closest('[lang]')?.getAttribute('lang') || document.documentElement.lang || '').toLowerCase();
      if (language && !/^en(?:-|$)/.test(language)) continue;
      const style = styleOf(element), family = familyName(style.fontFamily.split(',')[0]), weight = Number(style.fontWeight), size = Number.parseFloat(style.fontSize);
      if (!['Geist', 'Geist Mono'].includes(family) || style.fontStyle !== 'normal' || style.direction !== 'ltr' || style.writingMode !== 'horizontal-tb'
        || style.textTransform !== 'none' || style.textShadow !== 'none' || style.hyphens === 'auto' || Number.parseFloat(style.webkitTextStrokeWidth) > 0
        || ['fontFeatureSettings', 'fontVariationSettings', 'fontVariantAlternates', 'fontVariantCaps', 'fontVariantNumeric', 'fontVariantEastAsian', 'fontVariantPosition'].some(name => style[name] && style[name] !== 'normal')
        || (style.fontSizeAdjust && style.fontSizeAdjust !== 'none') || !['normal', '100%'].includes(style.fontStretch) || style.textRendering === 'optimizeSpeed'
        || !['normal', 'none', 'no-common-ligatures'].includes(style.fontVariantLigatures) || !(size > 0)) continue;
      const generated = ['::before', '::after'].some(pseudo => !['none', 'normal', '""', "''"].includes(window.getComputedStyle(element, pseudo).content));
      const altered = ['::first-letter', '::first-line'].some(pseudo => {const held = window.getComputedStyle(element, pseudo); return ['fontFamily', 'fontWeight', 'fontSize', 'fontStyle', 'fontVariantCaps', 'color'].some(name => held[name] !== style[name]);});
      if (generated || altered || !Array.from(document.fonts).some(face => familyName(face.family) === family && face.status === 'loaded')) continue;
      const asset = faces.find(face => face.family === family && face.weight === weight);
      if (!asset) continue;
      const font = readFont(asset, fontCache), preserve = /pre|break-spaces/.test(style.whiteSpace);
      context.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
      const metrics = context.measureText('Hg'), ascent = metrics.fontBoundingBoxAscent;
      if (!Number.isFinite(ascent)) continue;
      const rgba = color(style.webkitTextFillColor || style.color), range = document.createRange();
      for (const node of textNodes) {
        const shaped = shape(node.data, font, preserve, style.fontVariantLigatures === 'normal' && !(Number.parseFloat(style.letterSpacing) || 0));
        if (!shaped) continue;
        let valid = true;
        const placed = [];
        for (const item of shaped) {
          range.setStart(node, item.start); range.setEnd(node, item.end);
          const ink = Array.from(range.getClientRects()).filter(rect => rect.height > 0);
          const lines = [];
          for (const rect of ink) {
            const line = lines.find(row => Math.abs(row[0].top - rect.top) <= .25);
            if (line) line.push(rect); else lines.push([rect]);
          }
          lines.sort((a, b) => b.reduce((sum, rect) => sum + rect.width, 0) - a.reduce((sum, rect) => sum + rect.width, 0));
          const previous = shaped[shaped.indexOf(item) - 1];
          if (lines.length > 1 && !item.soft && !previous?.soft) {valid = false; break;}
          const rects = lines[0] || [];
          const first = (item.soft ? rects.find(rect => rect.width > 0) : null) || rects[0];
          if (item.soft && !(first?.width > 0)) continue;
          if (!first) {valid = false; break;}
          const page = Math.max(0, Math.floor((first.left - origin.left + .01) / width));
          Object.assign(item, {font, size, rgba, x: first.left - origin.left - page * width, baseline: first.top - origin.top + ascent});
          placed.push(item);
        }
        if (!valid || !placed.length) continue;
        nodes.set(node, placed);
        if (element.localName === 'li' || element.children.length || textNodes.length > 1) {
          const wrap = document.createElement('span');
          node.replaceWith(wrap); wrap.append(node);
          wrap.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
          hidden.push({wrap});
          continue;
        }
        hidden.push({node: element, value: element.style.getPropertyValue('-webkit-text-fill-color'), priority: element.style.getPropertyPriority('-webkit-text-fill-color')});
        element.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
      }
    }
    check(); return {nodes, restore};
  } catch (error) {restore(); throw error;}
}
