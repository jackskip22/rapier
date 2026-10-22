// SPDX-License-Identifier: MIT
// The licensed static faces retain the shipped variable font's exact glyphs and metrics.

const familyName = value => value.trim().replace(/^['"]|['"]$/g, '');

function readFont(asset, fontCache) {
  if (fontCache.has(asset)) return fontCache.get(asset);
  const bytes = typeof asset.read === 'function' ? asset.read() : Uint8Array.from(atob(asset.data), character => character.charCodeAt(0));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), u16 = at => view.getUint16(at), i16 = at => view.getInt16(at), u32 = at => view.getUint32(at);
  const tag = at => String.fromCharCode(...bytes.subarray(at, at + 4)), tables = new Map();
  for (let at = 12, end = 12 + u16(4) * 16; at < end; at += 16) tables.set(tag(at), {at: u32(at + 8), length: u32(at + 12)});
  if (tables.has('CFF2') || ['COLR', 'SVG ', 'sbix', 'CBDT', 'EBDT'].some(tag => tables.has(tag))) throw new Error('The PDF font needs a color or CFF2 renderer.');
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
        if (![4, 7].includes(u16(lookup)) || u16(lookup + 2) & 1) continue;
        for (let k = 0; k < u16(lookup + 4); k++) {
          let sub = lookup + u16(lookup + 6 + k * 2), type = u16(lookup);
          if (type === 7) {type = u16(sub + 2); sub += u32(sub + 4);}
          if (type !== 4 || u16(sub) !== 1) continue;
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
  const tabular = new Map();
  if (gsub) {
    const features = gsub + u16(gsub + 6), lookups = gsub + u16(gsub + 8);
    for (let i = 0; i < u16(features); i++) {
      const record = features + 2 + i * 6;
      if (tag(record) !== 'tnum') continue;
      const feature = features + u16(record + 4);
      for (let j = 0; j < u16(feature + 2); j++) {
        const lookup = lookups + u16(lookups + 2 + u16(feature + 4 + j * 2) * 2);
        for (let k = 0; k < u16(lookup + 4); k++) {
          let sub = lookup + u16(lookup + 6 + k * 2), type = u16(lookup);
          if (type === 7) {type = u16(sub + 2); sub += u32(sub + 4);}
          if (type !== 1) continue;
          coverage(sub + u16(sub + 2)).forEach((id, n) => tabular.set(id, u16(sub) === 1 ? (id + i16(sub + 4)) & 65535 : u16(sub + 6 + n * 2)));
        }
      }
    }
  }
  const os2 = tables.get('OS/2');
  const font = {asset, bytes, units, glyph, ligatures, tabular, glyphCount, cids: asset.cids,
    weight: os2 ? u16(os2.at + 4) : 400, italic: !!(u16(head + 44) & 2 || os2 && u16(os2.at + 62) & 513),
    italicAngle: tables.has('post') ? view.getInt32(tables.get('post').at + 4) / 65536 : 0,
    outline: tables.has('glyf') ? 'truetype' : 'cff', advance: id => u16(hmtx + Math.min(id, metricCount - 1) * 4),
    bbox: [36, 38, 40, 42].map(offset => i16(head + offset)), ascent: i16(hhea + 4), descent: i16(hhea + 6),
    capHeight: os2 && os2.length >= 90 && u16(os2.at) >= 2 ? i16(os2.at + 88) : i16(hhea + 4)};
  fontCache.set(asset, font); return font;
}

function shape(value, font, style) {
  const result = [], preserve = /pre|break-spaces/.test(style.whiteSpace);
  const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
  for (const {segment, index: start} of segmenter.segment(value)) {
    const end = start + segment.length, soft = segment === '\u00ad';
    const text = soft ? '\u00ad' : !preserve && /^[ \t\r\n\f]+$/.test(segment) ? ' ' : segment;
    const normalized = (soft ? '-' : text).normalize('NFC');
    let reason = '';
    if (/[\p{Mark}\p{Format}]/u.test(normalized) || /\p{Letter}/u.test(normalized) &&
      !/^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Hebrew}\p{Script=Armenian}\p{Script=Georgian}\p{Script=Ethiopic}\p{Script=Cherokee}\p{Script=Canadian_Aboriginal}\p{Script=Runic}\p{Script=Ogham}\p{Script=Tifinagh}\p{Script=Vai}\p{Script=Lisu}\p{Script=Bopomofo}\p{Script=Yi}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u.test(normalized)) reason = 'shaping';
    let glyph = [...normalized].length === 1 ? font.glyph(normalized.codePointAt(0)) : 0;
    if (style.fontVariantNumeric === 'tabular-nums') glyph = font.tabular.get(glyph) || glyph;
    if (!reason && (!glyph || glyph >= font.glyphCount)) reason = 'missing-glyph';
    result.push({start, end, text, glyph, soft, reason});
  }
  if (style.fontVariantLigatures === 'normal' && !(Number.parseFloat(style.letterSpacing) || 0))
    for (const lookup of font.ligatures) for (let i = 0; i < result.length; i++) {
      if (result[i].reason) continue;
      const found = lookup.get(result[i].glyph)?.find(row => row.components.every((id, offset) => !result[i + offset + 1]?.reason && result[i + offset + 1]?.glyph === id));
      if (found) {const held = result.splice(i, found.components.length + 1); result.splice(i, 0, {start: held[0].start, end: held.at(-1).end, text: held.map(row => row.text).join(''), glyph: found.glyph});}
    }
  return result;
}

export async function collectPdfGlyphs(main, {width, check, faces = [], prepareFont, systemFonts, maskFont, origin = main.getBoundingClientRect()}) {
  const document = main.ownerDocument, window = document.defaultView;
  const nodes = new Map(), markers = new Map(), painted = [], restoreSteps = [], pending = [], fontCache = new Map(), prepared = new Map();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  const restore = () => {for (const undo of restoreSteps.reverse()) undo(); restoreSteps.length = 0; canvas.width = canvas.height = 0;};
  if (!context) return {nodes, markers, painted, restore};
  const colorCache = new Map(), styles = new Map();
  const styleOf = node => {if (!styles.has(node)) styles.set(node, window.getComputedStyle(node)); return styles.get(node);};
  const color = value => {
    if (!colorCache.has(value)) {context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); colorCache.set(value, Array.from(context.getImageData(0, 0, 1, 1).data, item => item / 255));}
    return colorCache.get(value);
  };
  const svgScale = node => {
    const svg = node.namespaceURI === 'http://www.w3.org/2000/svg' ? node : node.closest('foreignObject');
    if (!svg) return 1;
    const matrix = svg.getScreenCTM();
    return matrix && matrix.a > 0 && Math.abs(matrix.b) < .00001 && Math.abs(matrix.c) < .00001 && Math.abs(matrix.a - matrix.d) < .00001 ? matrix.a : 0;
  };
  const stretches = new Map();
  const svgStretch = element => {
    const holder = element.closest('text[textLength],tspan[textLength]');
    if (!holder || holder.getAttribute('lengthAdjust') !== 'spacingAndGlyphs') return 1;
    if (!stretches.has(holder)) {
      const value = holder.getAttribute('textLength'), probe = holder.cloneNode(true), style = styleOf(holder);
      probe.removeAttribute('textLength');
      for (const property of style) probe.style.setProperty(property, style.getPropertyValue(property));
      probe.style.setProperty('visibility', 'hidden', 'important'); holder.parentNode.append(probe);
      let natural;
      try {natural = probe.getComputedTextLength();} finally {probe.remove();}
      stretches.set(holder, Number(value) > 0 && natural > 0 ? Number(value) / natural : 1);
    }
    return stretches.get(holder);
  };
  const safe = node => {
    for (let parent = node; parent; parent = parent.parentElement) {
      const style = styleOf(parent);
      if (style.visibility !== 'visible' || style.display === 'none' || style.transform !== 'none' && !(parent.namespaceURI === 'http://www.w3.org/2000/svg' && svgScale(parent)) || style.filter !== 'none' || style.mixBlendMode !== 'normal'
        || ['absolute', 'fixed'].includes(style.position) || style.zIndex !== 'auto' && style.position !== 'sticky'
        || Number(style.opacity) !== 1 || style.clip !== 'auto' || style.clipPath !== 'none' || style.maskImage !== 'none'
        || (parent !== main && ((style.overflowX !== 'visible' && parent.scrollWidth > parent.clientWidth + 1)
          || (style.overflowY !== 'visible' && parent.scrollHeight > parent.clientHeight + 1)))) return false;
      if (parent === main) break;
    }
    return true;
  };
  let localFonts;
  const prepare = async (asset, style) => {
    const key = faces.indexOf(asset) + ':' + (asset.system ? asset.postscriptName : '') +
      (String(asset.weight).includes(' ') || asset.system ? ':' + style.fontWeight + ':' + style.fontStyle + ':' + style.fontSize : '');
    if (!prepared.has(key)) prepared.set(key, (async () => {
      try {
        const raw = typeof asset.read === 'function' ? await asset.read() : Uint8Array.from(atob(asset.data), c => c.charCodeAt(0));
        const prepared = prepareFont ? await prepareFont(raw, main.textContent + '0123456789.- ', style, asset) : raw;
        if (!prepared) return null;
        const bytes = prepared.bytes || prepared;
        return readFont({...asset, cids: prepared.cids, postscriptName: prepared.postscriptName || asset.postscriptName, subset: prepared.subset, read: () => bytes}, fontCache);
      } catch (_) {return null;}
    })());
    return prepared.get(key);
  };
  const fontFor = async style => {
    const family = familyName(style.fontFamily.split(',')[0]), weight = Number(style.fontWeight), italic = style.fontStyle !== 'normal';
    const candidates = faces.filter(face => face.family.toLowerCase() === family.toLowerCase());
    const styled = candidates.filter(face => !!(face.italic || /italic|oblique/i.test(face.style)) === italic);
    const rank = face => {
      const range = String(face.weight).split(/\s+/).map(Number), chosen = Math.max(range[0], Math.min(range[1] || range[0], weight));
      return weight >= 400 && weight <= 500 ? chosen >= weight && chosen <= 500 ? chosen - weight : chosen < weight ? 1000 + weight - chosen : 2000 + chosen - weight :
        (weight < 400 ? chosen <= weight : chosen >= weight) ? Math.abs(chosen - weight) : 1000 + Math.abs(chosen - weight);
    };
    const asset = (styled.length ? styled : candidates).sort((left, right) => rank(left) - rank(right))[0];
    if (!asset) return null;
    if (weight >= 600 && Number(String(asset.weight).split(/\s+/).at(-1)) < 600) return null;
    return prepare(asset, style);
  };

  const matches = new Map(), aliases = new Map(), systemChoices = new Map(), proofCanvas = document.createElement('canvas');
  proofCanvas.width = 512; proofCanvas.height = 128;
  const proofContext = proofCanvas.getContext('2d', {willReadFrequently: true});
  restoreSteps.push(() => {proofCanvas.width = proofCanvas.height = 0;});
  const pixels = (text, style, family, expectedWidth) => {
    proofContext.clearRect(0, 0, 512, 128);
    proofContext.font = [style.fontStyle, style.fontWeight, style.fontSize, family].join(' ');
    const width = proofContext.measureText(text).width;
    if (expectedWidth != null && Math.abs(width - expectedWidth) > .01) return null;
    proofContext.fillText(text, 16, 96);
    return {width, data: proofContext.getImageData(0, 0, Math.min(512, Math.ceil(width) + 48), 128).data};
  };
  const fallbackFor = async (text, style) => {
    const key = [text, style.fontFamily, style.fontStyle, style.fontWeight, style.fontSize].join('\n');
    if (matches.has(key)) return matches.get(key);
    const actual = pixels(text, style, style.fontFamily), families = style.fontFamily.split(',').map(familyName);
    localFonts ??= await systemFonts?.() || [];
    for (const asset of [...faces.filter(face => families.includes(face.family)), ...localFonts]) {
      const candidate = pixels(text, style, '"' + asset.family.replace(/["\\]/g, '\\$&') + '"', actual.width);
      if (!candidate || !actual.data.every((value, index) => value === candidate.data[index])) continue;
      const font = await prepare(asset, style);
      if (!font || shape(text, font, style).some(part => part.reason)) continue;
      if (asset.system) {
        const key = [asset.family, style.fontStyle, style.fontWeight, style.fontSize].join(':');
        if (!systemChoices.has(key)) {
          const fonts = (await Promise.all(localFonts.filter(face => face.family === asset.family).map(face => prepare(face, style)))).filter(Boolean);
          const italic = style.fontStyle !== 'normal', styled = fonts.filter(font => font.italic === italic), weight = Number(style.fontWeight);
          const rank = font => weight >= 400 && weight <= 500 ? font.weight >= weight && font.weight <= 500 ? font.weight - weight : font.weight < weight ? 1000 + weight - font.weight : 2000 + font.weight - weight :
            (weight < 400 ? font.weight <= weight : font.weight >= weight) ? Math.abs(font.weight - weight) : 1000 + Math.abs(font.weight - weight);
          systemChoices.set(key, (styled.length ? styled : fonts).sort((a, b) => rank(a) - rank(b))[0]);
        }
        if (systemChoices.get(key) !== font || Number(style.fontWeight) >= 600 && font.weight < 600) continue;
      }
      if (!aliases.has(font)) {
        const alias = 'rapier-pdf-face-' + aliases.size;
        const face = new window.FontFace(alias, font.bytes, {weight: style.fontWeight, style: font.italic ? 'italic' : 'normal'});
        try {await face.load(); document.fonts.add(face);} catch (_) {continue;}
        aliases.set(font, alias); restoreSteps.push(() => document.fonts.delete(face));
      }
      const held = pixels(text, style, aliases.get(font), actual.width);
      if (!held || !asset.system && !actual.data.every((value, index) => value === held.data[index])) continue;
      matches.set(key, font); return font;
    }
    matches.set(key, null); return null;
  };
  const admit = style => {
    if (!/^(normal|italic|oblique(?: -?[\d.]+deg)?)$/.test(style.fontStyle) || !['ltr', 'rtl'].includes(style.direction) || style.writingMode !== 'horizontal-tb') return 'direction-or-style';
    if (style.textTransform !== 'none' || style.textShadow !== 'none' || style.hyphens === 'auto' || Number.parseFloat(style.webkitTextStrokeWidth) > 0) return 'text-effect';
    if (['fontFeatureSettings', 'fontVariationSettings', 'fontVariantAlternates', 'fontVariantCaps', 'fontVariantEastAsian', 'fontVariantPosition'].some(name => style[name] && style[name] !== 'normal') || !['normal', 'tabular-nums'].includes(style.fontVariantNumeric)) return 'font-feature';
    if ((style.fontSizeAdjust && style.fontSizeAdjust !== 'none') || !['normal', '100%'].includes(style.fontStretch) || style.textRendering === 'optimizeSpeed'
      || !['normal', 'none', 'no-common-ligatures'].includes(style.fontVariantLigatures)) return 'font-feature';
    return '';
  };
  const measure = async (node, style, font) => {
    const scale = svgScale(node.parentElement), size = Number.parseFloat(style.fontSize) * scale, parts = [], range = document.createRange();
    const svg = node.parentElement.namespaceURI === 'http://www.w3.org/2000/svg' ? node.parentElement : null, scaleX = svg ? svgStretch(node.parentElement) : 1;
    context.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
    const ascent = context.measureText('Hg').fontBoundingBoxAscent * scale, rgba = color(svg ? style.fill : style.webkitTextFillColor || style.color).slice();
    if (svg) rgba[3] *= Number(style.fillOpacity);
    if (!(size > 0) || !Number.isFinite(ascent)) return parts;
    let svgOffset = 0;
    if (svg) {
      const walker = document.createTreeWalker(svg, 4);
      for (let text; (text = walker.nextNode()) && text !== node;) svgOffset += text.data.length;
    }
    const shaped = shape(node.data, font || {glyph: () => 0, ligatures: [], tabular: new Map()}, style);
    for (let index = 0; index < shaped.length; index++) {
      let item = shaped[index], face = font;
      if (item.reason === 'missing-glyph') {
        face = await fallbackFor(item.text, style);
        if (face) item = {...item, ...shape(item.text, face, style)[0], start: item.start, end: item.end};
        else item.reason = font ? 'fallback-font-bytes-unavailable' : 'font-bytes-unavailable';
      }
      const italic = style.fontStyle !== 'normal' && !face?.italic;
      const skew = italic ? style.fontStyle.startsWith('oblique ') ? Math.tan(parseFloat(style.fontStyle.slice(8)) * Math.PI / 180) : .25 : 0;
      range.setStart(node, item.start); range.setEnd(node, item.end);
      const rects = Array.from(range.getClientRects()).filter(rect => rect.height > 0 && rect.width > .001);
      const first = shaped[index - 1]?.soft && rects.length > 1 ? rects.at(-1) : rects[0];
      if (!first) continue;
      const page = Math.max(0, Math.floor((first.left - origin.left + .01) / width));
      const split = rects.some(rect => Math.abs(rect.top - first.top) > .25) && !item.soft && !shaped[index - 1]?.soft && item.text.trim();
      let advance = first.width, x = first.left - origin.left - page * width, baseline = first.top - origin.top + ascent;
      if (svg && !item.reason) {
        const point = svg.getStartPositionOfChar(svgOffset + item.start).matrixTransform(svg.getScreenCTM());
        const end = svg.getEndPositionOfChar(svgOffset + item.end - 1).matrixTransform(svg.getScreenCTM());
        advance = Math.abs(end.x - point.x);
        x = point.x - origin.left - page * width; baseline = point.y - origin.top;
      }
      parts.push({...item, reason: split ? 'fragmented-cluster' : item.reason, font: item.reason || split ? null : face, size, rgba, skew, scaleX, page,
        x, y: first.top - origin.top, width: advance, height: first.height, baseline});
    }
    return parts;
  };
  const record = (text, reason, style, part) => {
    if (!text.trim()) return;
    const last = painted.at(-1), family = style.fontFamily;
    if (last && last.reason === reason && last.family === family && last.page === part?.page && last.node === part?.node && last.end === part?.start) {last.text += text; last.end = part?.end;}
    else painted.push({text, reason, family, page: part?.page, node: part?.node, end: part?.end});
  };
  try {
    let visited = 0;
    for (const element of [main, ...main.querySelectorAll('*')]) {
      if (++visited % 128 === 0) {await new Promise(resolve => setTimeout(resolve, 0)); check();}
      const svg = element.namespaceURI === 'http://www.w3.org/2000/svg';
      if (svg && !['text','tspan'].includes(element.localName) || element.closest('style,script,defs,title,desc,.rapier-will-carrier,.math-rendered')) continue;
      const textNodes = Array.from(element.childNodes).filter(node => node.nodeType === 3 && node.data.length);
      if (!textNodes.length) continue;
      const style = styleOf(element), reason = element.namespaceURI === 'http://www.w3.org/1998/Math/MathML' ? 'math-layout' : !safe(element) ? 'compositing' : !svgScale(element) ? 'svg-transform' :
        svg && style.stroke !== 'none' && parseFloat(style.strokeWidth) > 0 ? 'svg-stroke' :
        svg && element.closest('textPath') ? 'svg-text-path' :
        svg && element.getNumberOfChars() !== element.textContent.length ? 'svg-character-layout' :
        svg && style.fill.startsWith('url(') ? 'svg-paint' : admit(style);
      const altered = !svg && ['::first-letter', '::first-line'].some(pseudo => {const held = window.getComputedStyle(element, pseudo); return ['fontFamily', 'fontWeight', 'fontSize', 'fontStyle', 'fontVariantCaps', 'color'].some(name => held[name] !== style[name]);});
      const font = !reason && !altered ? await fontFor(style) : null;
      for (const node of textNodes) {
        if (reason || altered) {
          const range = document.createRange(); range.selectNodeContents(node);
          const rect = Array.from(range.getClientRects()).find(rect => rect.width > 0 && rect.height > 0);
          if (rect && style.visibility === 'visible') record(node.data, reason || 'first-line-or-letter', style,
            {node, page: Math.max(0, Math.floor((rect.left - origin.left + .01) / width)), start: 0, end: node.data.length});
          continue;
        }
        const parts = await measure(node, style, font);
        for (const part of parts) if (!part.font) record(part.text, part.reason, style, {...part, node});
        if (parts.some(part => part.font)) pending.push({node, parts});
      }
    }
    const markerRules = [], sheet = document.createElement('style');
    for (const list of main.querySelectorAll('ol')) {
      let value = Number(/(?:^|\s)rapier-ol\s+(-?\d+)/.exec(styleOf(list).counterReset)?.[1] || 0);
      for (const item of list.children) {
        if (item.localName !== 'li') continue;
        value += Number(/(?:^|\s)rapier-ol(?:\s+(-?\d+))?/.exec(styleOf(item).counterIncrement)?.[1] || 1);
        const style = window.getComputedStyle(item, '::before');
        if (style.content !== 'counter(rapier-ol)' || !safe(item) || admit(style)) continue;
        const font = await fontFor(style); if (!font) {record(String(value), 'marker-font-unavailable', style); continue;}
        const probe = document.createElement('span');
        for (const property of style) probe.style.setProperty(property, style.getPropertyValue(property));
        probe.style.setProperty('visibility', 'hidden', 'important'); probe.textContent = String(value); item.prepend(probe);
        const parts = await measure(probe.firstChild, style, font); probe.remove();
        if (!parts.length || parts.some(part => !part.font)) continue;
        parts.at(-1).text += '. ';
        markers.set(item, {text: String(value) + '. ', parts, ...Object.fromEntries(['x','y','width','height','page'].map(key => [key, parts[0][key]]))});
        const id = 'm' + markers.size, old = item.getAttribute('data-rapier-pdf-marker'); item.setAttribute('data-rapier-pdf-marker', id);
        restoreSteps.push(() => old == null ? item.removeAttribute('data-rapier-pdf-marker') : item.setAttribute('data-rapier-pdf-marker', old));
        markerRules.push('[data-rapier-pdf-marker="' + id + '"]::before{-webkit-text-fill-color:transparent!important}');
      }
    }
    const bulletFonts = new Map();
    for (const item of main.querySelectorAll('ul>li')) {
      const style = window.getComputedStyle(item, '::before');
      if (style.content !== '""' && style.content !== "''" || !safe(item) || style.transform !== 'none') continue;
      const probe = document.createElement('span');
      for (const property of style) probe.style.setProperty(property, style.getPropertyValue(property));
      probe.style.setProperty('visibility', 'hidden', 'important'); item.prepend(probe);
      const box = probe.getBoundingClientRect(); probe.remove();
      if (!(box.width > 0 && box.height > 0)) continue;
      const fill = color(style.backgroundColor), stroke = color(style.borderTopColor), border = parseFloat(style.borderTopWidth) || 0;
      const radius = parseFloat(style.borderTopLeftRadius), round = radius > 0;
      if (border && style.borderTopStyle !== 'solid' || !fill[3] && !border) continue;
      const key = [box.width / box.height, border / box.height, round, ...fill, ...stroke].join(':');
      let font = bulletFonts.get(key);
      if (!font) {
        const w = box.width / box.height * 1000, inset = border / box.height * 500;
        const path = round ? (() => {
          const x = w / 2, y = 500, rx = x - inset, ry = y - inset, k = .552284749831;
          return `${x + rx} ${y} m ${x + rx} ${y + k * ry} ${x + k * rx} ${y + ry} ${x} ${y + ry} c ` +
            `${x - k * rx} ${y + ry} ${x - rx} ${y + k * ry} ${x - rx} ${y} c ` +
            `${x - rx} ${y - k * ry} ${x - k * rx} ${y - ry} ${x} ${y - ry} c ` +
            `${x + k * rx} ${y - ry} ${x + rx} ${y - k * ry} ${x + rx} ${y} c h`;
        })() : `${inset} ${inset} ${w - 2 * inset} ${1000 - 2 * inset} re`;
        font = {type3: true, asset: {family: 'RapierListMarker', style: 'normal'}, units: 1000, bbox: [0, 0, w, 1000],
          commands: fill.slice(0, 3).join(' ') + ' rg\n' + stroke.slice(0, 3).join(' ') + ' RG\n' + border / box.height * 1000 + ' w\n' + path + (border ? fill[3] ? ' B\n' : ' S\n' : ' f\n')};
        bulletFonts.set(key, font);
      }
      const page = Math.max(0, Math.floor((box.left - origin.left + .01) / width));
      const part = {font, glyph: 1, text: (round ? border ? '◦' : '•' : '▪') + ' ', size: box.height, rgba: [0, 0, 0, 1], skew: 0, page,
        x: box.left - origin.left - page * width, y: box.top - origin.top, width: box.width, height: box.height, baseline: box.bottom - origin.top};
      markers.set(item, {text: part.text, parts: [part], ...Object.fromEntries(['x','y','width','height','page'].map(key => [key, part[key]]))});
      const id = 'm' + markers.size, old = item.getAttribute('data-rapier-pdf-marker'); item.setAttribute('data-rapier-pdf-marker', id);
      restoreSteps.push(() => old == null ? item.removeAttribute('data-rapier-pdf-marker') : item.setAttribute('data-rapier-pdf-marker', old));
      markerRules.push('[data-rapier-pdf-marker="' + id + '"]::before{visibility:hidden!important}');
    }
    for (const list of main.querySelectorAll('ol,ul')) {
      let value = list.hasAttribute('start') ? Number(list.getAttribute('start')) : list.hasAttribute('reversed') ? list.children.length : 1;
      for (const item of list.children) {
        if (item.localName !== 'li') continue;
        if (item.hasAttribute('value')) value = Number(item.getAttribute('value'));
        const ordinal = value; value += list.hasAttribute('reversed') ? -1 : 1;
        if (markers.has(item) || !safe(item)) continue;
        const style = window.getComputedStyle(item, '::marker'), itemStyle = styleOf(item);
        if (style.content !== 'normal' || itemStyle.listStyleType === 'none' || itemStyle.listStyleImage !== 'none' || admit(style)) continue;
        const type = itemStyle.listStyleType;
        const text = type === 'decimal' ? ordinal + '. ' : type === 'decimal-leading-zero' ? String(ordinal).padStart(2, '0') + '. ' :
          type === 'disc' ? '• ' : type === 'circle' ? '◦ ' : type === 'square' ? '▪ ' : null;
        if (!text) {record('[' + type + ' marker ' + ordinal + ']', 'marker-style', style, {node: item}); continue;}
        const first = document.createTreeWalker(item, 4).nextNode();
        if (!first) continue;
        const range = document.createRange(); range.selectNodeContents(first);
        const line = Array.from(range.getClientRects()).find(rect => rect.height > 0 && rect.width > 0); if (!line) continue;
        const probe = document.createElement('span');
        for (const property of style) probe.style.setProperty(property, style.getPropertyValue(property));
        probe.style.cssText += ';position:absolute;left:0;top:0;white-space:pre;visibility:hidden';
        probe.textContent = text; main.append(probe);
        const box = probe.getBoundingClientRect(), parts = await measure(probe.firstChild, style, await fontFor(style)); probe.remove();
        if (!parts.length || parts.some(part => !part.font)) {record(text, 'marker-font-unavailable', style, {node: item}); continue;}
        const edge = itemStyle.listStylePosition === 'inside' ? line.left : item.getBoundingClientRect().left + parseFloat(itemStyle.borderLeftWidth) + parseFloat(itemStyle.paddingLeft);
        const left = edge - box.width, page = Math.max(0, Math.floor((edge - origin.left + .01) / width));
        for (const part of parts) {
          const dx = left - box.left + (part.page - page) * width, dy = line.top - box.top;
          part.x += dx; part.y += dy; part.baseline += dy; part.page = page;
        }
        markers.set(item, {text, parts, ...Object.fromEntries(['x','y','width','height','page'].map(key => [key, parts[0][key]]))});
        const id = 'm' + markers.size, old = item.getAttribute('data-rapier-pdf-marker'); item.setAttribute('data-rapier-pdf-marker', id);
        restoreSteps.push(() => old == null ? item.removeAttribute('data-rapier-pdf-marker') : item.setAttribute('data-rapier-pdf-marker', old));
        markerRules.push('[data-rapier-pdf-marker="' + id + '"]::marker{color:transparent!important;-webkit-text-fill-color:transparent!important}');
      }
    }
    const pin = (element, property, value) => {
      const old = element.getAttribute('style');
      element.style.setProperty(property, value, 'important');
      restoreSteps.push(() => old == null ? element.removeAttribute('style') : element.setAttribute('style', old));
    };
    const elements = [main, ...main.querySelectorAll('*')].filter(element => element.namespaceURI === 'http://www.w3.org/1999/xhtml' || ['text','tspan'].includes(element.localName));
    const originals = elements.map(element => ({element, family: styleOf(element).fontFamily, fill: styleOf(element).webkitTextFillColor, svgFill: styleOf(element).fill,
      pseudos: ['::before', '::after', '::marker'].map(pseudo => ({pseudo, style: window.getComputedStyle(element, pseudo), fill: window.getComputedStyle(element, pseudo).webkitTextFillColor}))}));
    const inheritedRules = [];
    for (const [index, {element, family, fill, svgFill, pseudos}] of originals.entries()) {
      pin(element, 'font-family', family); pin(element, '-webkit-text-fill-color', fill);
      if (element.namespaceURI === 'http://www.w3.org/2000/svg') pin(element, 'fill', svgFill);
      const old = element.getAttribute('data-rapier-pdf-element'); element.setAttribute('data-rapier-pdf-element', index);
      restoreSteps.push(() => old == null ? element.removeAttribute('data-rapier-pdf-element') : element.setAttribute('data-rapier-pdf-element', old));
      for (const {pseudo, style, fill} of pseudos) if (style.content && style.content !== 'none' && (style.content !== 'normal' || pseudo === '::marker'))
        inheritedRules.push('[data-rapier-pdf-element="' + index + '"]' + pseudo + '{-webkit-text-fill-color:' + fill + '!important}');
    }
    const byElement = new Map();
    for (const row of pending) {const element = row.node.parentElement; if (!byElement.has(element)) byElement.set(element, []); byElement.get(element).push(row);}
    let maskSequence = 0; const maskRules = [];
    for (const [element, rows] of byElement) {
      const all = rows.every(row => row.parts.every(part => part.font));
      const direct = Array.from(element.childNodes).filter(node => node.nodeType === 3 && node.data.trim());
      if (all && direct.every(node => rows.some(row => row.node === node))) {
        pin(element, element.namespaceURI === 'http://www.w3.org/2000/svg' ? 'fill' : '-webkit-text-fill-color', 'transparent');
        for (const {node, parts} of rows) nodes.set(node, parts);
        continue;
      }
      if (!maskFont) {for (const {node, parts} of rows) for (const part of parts) if (part.font) record(part.text, 'font-mask-unavailable', styleOf(element), {...part,node}); continue;}
      const fonts = new Map(), forbidden = new Set();
      for (const {node, parts} of rows) for (let at = 0; at < parts.length; at++) if (parts[at].reason === 'shaping') {
        let start = at, end = at + 1;
        while (start && !/\s/u.test(parts[start - 1].text)) start--;
        while (end < parts.length && !/\s/u.test(parts[end].text)) end++;
        for (let index = start; index < end; index++) if (parts[index].font) {
          record(parts[index].text, 'shaping-context', styleOf(element), {...parts[index],node}); parts[index].font = null;
        }
      }
      for (const {parts} of rows) for (const part of parts) if (!part.font) for (const character of part.text) forbidden.add(character.codePointAt(0));
      for (const {node, parts} of rows) for (const part of parts) if (part.font) {
        if ([...part.text].some(character => forbidden.has(character.codePointAt(0)))) {
          record(part.text, 'shaping-context', styleOf(element), {...part,node}); part.font = null; continue;
        }
        if (!fonts.has(part.font)) fonts.set(part.font, {glyphs: new Set(), codes: new Set()});
        const entry = fonts.get(part.font); entry.glyphs.add(part.glyph);
        for (const character of part.text) entry.codes.add(character.codePointAt(0));
      }
      const names = [], style = styleOf(element);
      for (const [font, {glyphs, codes}] of fonts) {
        const name = 'rapier-pdf-mask-' + maskSequence++;
        const bytes = await maskFont(font.bytes, [...glyphs]), weight = style.fontWeight, faceStyle = font.italic ? 'italic' : 'normal';
        const primary = font.asset.family.toLowerCase() === familyName(style.fontFamily.split(',')[0]).toLowerCase();
        const unicodeRange = primary ? 'U+0-10FFFF' : [...codes].map(code => 'U+' + code.toString(16)).join(',');
        const face = new window.FontFace(name, bytes, {weight, style: faceStyle, unicodeRange});
        await face.load(); document.fonts.add(face); restoreSteps.push(() => document.fonts.delete(face)); names.push('"' + name + '"');
        let binary = ''; for (let at = 0; at < bytes.length; at += 16384) binary += String.fromCharCode(...bytes.subarray(at, at + 16384));
        maskRules.push('@font-face{font-family:"' + name + '";font-weight:' + weight + ';font-style:' + faceStyle + ';unicode-range:' + unicodeRange + ';src:url(data:font/ttf;base64,' + btoa(binary) + ')}');
      }
      if (names.length) pin(element, 'font-family', names.join(',') + ',' + style.fontFamily);
      for (const {node, parts} of rows) nodes.set(node, parts);
    }
    sheet.textContent = [...maskRules, ...inheritedRules, ...markerRules].join('\n');
    document.head.append(sheet); restoreSteps.push(() => sheet.remove());
    main.getBoundingClientRect(); await document.fonts.ready;
    check(); return {nodes, markers, painted: painted.map(({node, end, ...row}) => row), restore};
  } catch (error) {restore(); throw error;}
}
