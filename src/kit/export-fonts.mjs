// SPDX-License-Identifier: MIT
import {documentFontUsage, CSS_GENERIC_FONT_FAMILIES} from '../spec/document-fonts.mjs';
import {normalizeFontFamily} from '../spec/md-marks.mjs';
const FONT_FIELDS = new Set(['font', 'font-family', 'font-weight', 'font-style', 'font-stretch', 'text-transform']);
const FAMILY = "'Geist',system-ui,sans-serif";
const MONO = "'Geist Mono',monospace";

const FACTORY_FONT_BYTES = 8 * 1024, FACTORY_FONT_CSS_BYTES = 12 * 1024;
const decodeCss = value => value.replace(/\\(?:([\da-f]{1,6})(?:\r\n|[ \t\n\r\f])?|([^\n\r\f]))/gi,
  (_, hex, character) => hex ? String.fromCodePoint(Math.max(1, Math.min(0x10ffff, parseInt(hex, 16)))) : character);
const unquote = value => decodeCss(value.trim().replace(/^(['"])([\s\S]*)\1$/, '$2'));

function splitCss(text, delimiter) {
  const parts = [];
  let quote = '', depth = 0, start = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === '\\') { at++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (!depth && (delimiter === ' ' ? /\s/.test(char) : char === delimiter)) {
      if (at > start || delimiter !== ' ') parts.push(text.slice(start, at));
      start = at + 1;
    }
  }
  if (start < text.length || delimiter !== ' ') parts.push(text.slice(start));
  return parts;
}

function declarations(text) {
  return splitCss(text, ';').flatMap(item => {
    const colon = item.indexOf(':');
    if (colon < 0) return [];
    const name = item.slice(0, colon).trim().toLowerCase(), raw = item.slice(colon + 1).trim();
    return [{name, value: raw.replace(/\s*!important\s*$/i, ''), important: /!important\s*$/i.test(raw)}];
  });
}

function rules(text, visit) {
  let start = 0, quote = '', parentheses = 0, depth = 0, selector = '', body = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === '\\') { at++; continue; }
    if (quote) { if (char === quote) quote = ''; continue; }
    if (char === '/' && text[at + 1] === '*') {
      const end = text.indexOf('*/', at + 2);
      if (end < 0) return;
      text = text.slice(0, at) + ' '.repeat(end + 2 - at) + text.slice(end + 2);
      at = end + 1; continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(' || char === '[') parentheses++;
    else if (char === ')' || char === ']') parentheses--;
    else if (!parentheses && char === '{') { if (depth++ === 0) { selector = text.slice(start, at).trim(); body = at + 1; } }
    else if (!parentheses && char === '}') {
      if (--depth === 0) {
        const value = text.slice(body, at);
        if (/^@(?:media|supports|layer|container)\b/i.test(selector)) rules(value, visit);
        else if (!selector.startsWith('@') || /^@font-face\b/i.test(selector)) visit(selector, declarations(value));
        start = at + 1;
      }
    } else if (!depth && !parentheses && char === ';') start = at + 1;
  }
}

function specificity(selector) {
  let value = selector.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');
  const ids = (value.match(/#[\w-]+/g) || []).length;
  const classes = (value.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length;
  value = value.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+/g, '');
  return ids * 1000000 + classes * 1000 + (value.match(/(?:^|[\s>+~,(])[a-zA-Z][\w-]*/g) || []).length;
}

function resolveValue(value, variables, trail = new Set()) {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (whole, name, fallback) => {
    if (trail.has(name)) return fallback || '';
    const found = variables[name];
    return found == null ? fallback || '' : resolveValue(found, variables, new Set([...trail, name]));
  });
}

function fontShorthand(value) {
  const parts = splitCss(value, ' ');
  const size = parts.findIndex(part => /^(?:[\d.]+(?:px|pt|em|rem|%|pc|in|cm|mm|ex|ch)|(?:calc|min|max|clamp)\(|(?:xx?-small|small|medium|large|xx?-large))/.test(part));
  if (size < 0) return {};
  let firstFamily = size + 1;
  if (parts[firstFamily] === '/') firstFamily += 2;
  else if (parts[firstFamily]?.startsWith('/')) firstFamily++;
  const prefix = parts.slice(0, size);
  return {'font-family': parts.slice(firstFamily).join(' '), 'font-style': prefix.find(part => /^(?:italic|oblique)$/.test(part)) || 'normal',
    'font-weight': prefix.find(part => /^(?:bold|bolder|lighter|[1-9]\d{0,3})$/.test(part)) || '400',
    'font-stretch': prefix.find(part => /^(?:ultra-|extra-|semi-)?(?:condensed|expanded)$/.test(part)) || 'normal'};
}

function fontFaces(css) {
  const faces = [];
  rules(css, (selector, fields) => {
    if (!/^@font-face\b/i.test(selector)) return;
    const properties = Object.fromEntries(fields.map(row => [row.name, row.value]));
    const family = unquote(properties['font-family'] || '').toLowerCase();
    const match = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/i.exec(properties.src || '');
    if (!family || !match) return;
    const source = decodeCss(match[1] ?? match[2] ?? match[3]);
    if (!/^data:(?:font\/(?:woff2?|ttf|otf)|application\/(?:font-woff|x-font-ttf|x-font-opentype|octet-stream));base64,[a-z\d+/]+={0,2}$/i.test(source))
      throw Object.assign(new Error('The page font is not embedded: ' + family), {code: 'export_font_unavailable'});
    faces.push({family, properties, source, runs: []});
  });
  return faces;
}

function weightDistance(face, desired) {
  const weight = value => value === 'normal' ? 400 : value === 'bold' ? 700 : Number(value);
  const range = splitCss(face.properties['font-weight'] || '400', ' ').map(weight), value = weight(desired) || 400;
  const low = range[0] || 400, high = range[1] || low;
  if (value >= low && value <= high) return 0;
  const nearest = value < low ? low : high;
  if (value >= 400 && value <= 500) return nearest >= value && nearest <= 500 ? nearest - value : nearest < value ? 1000 + value - nearest : 2000 + nearest - value;
  return value < 400 ? nearest < value ? value - nearest : 1000 + nearest - value : nearest > value ? nearest - value : 1000 + value - nearest;
}

function stretchOrder(first, second, desired) {
  const keywords = {'ultra-condensed': 50, 'extra-condensed': 62.5, condensed: 75, 'semi-condensed': 87.5,
    normal: 100, 'semi-expanded': 112.5, expanded: 125, 'extra-expanded': 150, 'ultra-expanded': 200};
  const width = value => Object.hasOwn(keywords, value) ? keywords[value] : parseFloat(value);
  const target = width(desired) || 100;
  const distance = face => {
    const range = splitCss(face.properties['font-stretch'] || '100%', ' ').map(width);
    const low = range[0] || 100, high = range[1] || low;
    if (low <= target && target <= high) return [0, 0];
    const nearest = target < low ? low : high, preferred = target <= 100 ? nearest < target : nearest > target;
    return [preferred ? 1 : 2, Math.abs(nearest - target)];
  };
  const a = distance(first), b = distance(second);
  return a[0] - b[0] || a[1] - b[1];
}

function styleDistance(face, style) {
  const wanted = style.startsWith('italic') ? 'italic' : style.startsWith('oblique') ? 'oblique' : 'normal';
  const actual = (face.properties['font-style'] || 'normal').split(/\s/)[0];
  return ({normal: ['normal', 'oblique', 'italic'], italic: ['italic', 'oblique', 'normal'], oblique: ['oblique', 'italic', 'normal']}[wanted]).indexOf(actual);
}

function unicodeIncludes(face, character) {
  const range = face.properties['unicode-range'];
  if (!range) return true;
  const code = character.codePointAt(0);
  return splitCss(range, ',').some(value => {
    const match = /^\s*u\+([\da-f?]+)(?:-([\da-f]+))?\s*$/i.exec(value);
    if (!match) return false;
    const from = parseInt(match[1].replace(/\?/g, '0'), 16), to = parseInt((match[2] || match[1]).replace(/\?/g, 'f'), 16);
    return code >= from && code <= to;
  });
}

function fontSource(bytes) {
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  const format = signature === 'wOFF' ? 'woff' : signature === 'wOF2' ? 'woff2' : signature === 'OTTO' ? 'opentype' : 'truetype';
  const mime = {woff: 'woff', woff2: 'woff2', opentype: 'otf', truetype: 'ttf'}[format];
  let binary = '';
  for (let at = 0; at < bytes.length; at += 16384) binary += String.fromCharCode(...bytes.subarray(at, at + 16384));
  return 'url("data:font/' + mime + ';base64,' + btoa(binary) + '") format("' + format + '")';
}

function writeFace(face, source) {
  const properties = {...face.properties, src: source};
  delete properties['unicode-range'];
  return '@font-face{' + Object.entries(properties).map(([name, value]) => name + ':' + value).join(';') + '}';
}

function fontRuns(root, {settings, css = '', fontCss = '', faces = fontFaces(fontCss)}) {
  if (!root?.querySelectorAll) throw new TypeError('The page font writer needs a document.');
  if (!faces.length) return faces;
  const selectors = [];
  const addRules = text => rules(text, (selector, fields) => {
    if (selector.startsWith('@')) return;
    const kept = fields.filter(row => FONT_FIELDS.has(row.name) || row.name.startsWith('--'));
    if (kept.length) for (const selectorPart of splitCss(selector, ',')) selectors.push({selector: selectorPart.trim(), fields: kept, rank: specificity(selectorPart)});
  });
  addRules(css);
  for (const style of root.querySelectorAll('style:not([data-rapier-font])')) addRules(style.textContent || '');
  const oldClass = root.getAttribute('class');
  root.setAttribute('class', (oldClass ? oldClass + ' ' : '') + 'md-render rapier-page');
  try {
    const initial = {'font-family': settings?.mainfont?.css || FAMILY, 'font-weight': '400', 'font-style': 'normal', 'font-stretch': 'normal',
      'text-transform': 'none', variables: {'--md-font-sans': settings?.sansfont?.css || settings?.mainfont?.css || FAMILY,
        '--md-font-main': settings?.mainfont?.css || settings?.sansfont?.css || FAMILY,
        '--md-font-mono': settings?.monofont?.css || MONO}};
    const computed = new WeakMap();
    let priorFace = null, priorStyle = '';
    const breakRun = () => { priorFace = null; priorStyle = ''; };
    function styleOf(element) {
      if (computed.has(element)) return computed.get(element);
      const parent = element === root ? initial : styleOf(element.parentElement || root);
      const state = {...parent, variables: Object.create(parent.variables)}, chosen = new Map();
      let order = 0;
      function take(row, rank) {
        const score = (row.important ? 1e12 : 0) + rank, prior = chosen.get(row.name);
        order++;
        if (!prior || score >= prior.score) chosen.set(row.name, {...row, score, order});
      }
      for (const field of FONT_FIELDS) if (element.hasAttribute(field)) take({name: field, value: element.getAttribute(field)}, -1);
      for (const rule of selectors) {
        let matches = false;
        try { matches = element.matches(rule.selector); } catch (_) {}
        if (matches) for (const row of rule.fields) take(row, rule.rank);
      }
      for (const row of declarations(element.getAttribute('style') || '')) if (FONT_FIELDS.has(row.name) || row.name.startsWith('--')) take(row, 1e9);
      for (const row of chosen.values()) if (row.name.startsWith('--')) state.variables[row.name] = row.value;
      const shorthand = chosen.get('font');
      if (shorthand) for (const [name, value] of Object.entries(fontShorthand(resolveValue(shorthand.value, state.variables)))) {
        const longhand = chosen.get(name);
        if (!longhand || longhand.score < shorthand.score || longhand.score === shorthand.score && longhand.order <= shorthand.order)
          chosen.set(name, {...shorthand, name, value});
      }
      for (const field of FONT_FIELDS) {
        if (field === 'font' || !chosen.has(field)) continue;
        const value = resolveValue(chosen.get(field).value, state.variables);
        if (value && value !== 'inherit' && value !== 'unset') state[field] = value;
      }
      if (state['font-weight'] === 'bolder') state['font-weight'] = Number(parent['font-weight']) >= 600 ? '900' : '700';
      if (state['font-weight'] === 'lighter') state['font-weight'] = Number(parent['font-weight']) >= 600 ? '400' : '100';
      computed.set(element, state); return state;
    }
    function add(text, element, overrides) {
      if (!text || !text.trim() && !element.closest('pre,code,svg text,svg tspan')) { breakRun(); return; }
      const state = {...styleOf(element), ...overrides};
      if (state['text-transform'] === 'uppercase') text = text.toLocaleUpperCase(element.closest('[lang]')?.getAttribute('lang') || 'en');
      else if (state['text-transform'] === 'lowercase') text = text.toLocaleLowerCase(element.closest('[lang]')?.getAttribute('lang') || 'en');
      else if (state['text-transform'] === 'capitalize') text = text.replace(/(^|\s)(\p{L})/gu, (_, gap, letter) => gap + letter.toUpperCase());
      const families = splitCss(state['font-family'], ',').filter(name => /^\s*['"]/.test(name) || !CSS_GENERIC_FONT_FAMILIES.includes(unquote(name).toLowerCase()))
        .map(name => unquote(name).toLowerCase());
      const runStyle = [state['font-weight'], state['font-style'], state['font-stretch']].join('/');
      for (const character of text) {
        let selected = null;
        for (const family of families) {
          const candidates = faces.filter(face => face.family === family && unicodeIncludes(face, character));
          if (!candidates.length) continue;
          candidates.sort((a, b) => stretchOrder(a, b, state['font-stretch']) ||
            styleDistance(a, state['font-style']) - styleDistance(b, state['font-style']) ||
            weightDistance(a, state['font-weight']) - weightDistance(b, state['font-weight']));
          selected = candidates[0]; break;
        }
        if (!selected) { breakRun(); continue; }
        if (selected === priorFace && runStyle === priorStyle) selected.runs[selected.runs.length - 1] += character;
        else selected.runs.push(character);
        priorFace = selected; priorStyle = runStyle;
      }
    }
    function walk(element) {
      const name = element.localName?.toLowerCase();
      if (['script', 'style', 'metadata', 'title', 'desc', 'defs', 'template'].includes(name) || element.hasAttribute('hidden') ||
          element.classList?.contains('diagram-source') && element.closest('[data-diagram-state="ready"]') ||
          element.classList?.contains('rapier-image-asset-record')) return;
      const boundary = /^(?:address|article|aside|blockquote|br|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|summary|table|td|text|th|tr|ul)$/.test(name);
      if (boundary) breakRun();
      if (name === 'input' && !/^(?:checkbox|radio|hidden|range|color|file)$/i.test(element.getAttribute('type') || 'text')) {
        breakRun(); add(element.getAttribute('value') || element.getAttribute('placeholder') || '', element); breakRun();
      }
      if (element.hasAttribute('data-md-break')) { breakRun(); add('page', element); breakRun(); }
      if (name === 'ol') {
        const native = element.classList.contains('footnotes-list');
        let ordinal = Number(element.getAttribute('start')) || 1;
        for (const item of element.children) if (item.localName?.toLowerCase() === 'li') {
          if (item.hasAttribute('value')) ordinal = Number(item.getAttribute('value'));
          breakRun();
          add(String(ordinal++) + (native ? '. ' : ''), item, native ? undefined :
            {'font-family': resolveValue('var(--md-font-sans)', styleOf(item).variables), 'font-weight': resolveValue('var(--md-fw-semibold)', styleOf(item).variables)});
          breakRun();
        }
      }
      for (const child of element.childNodes) {
        if (child.nodeType === 3) add(child.nodeValue || '', element);
        else if (child.nodeType === 1) walk(child);
      }
      if (boundary) breakRun();
    }
    walk(root);
  } finally {
    if (oldClass == null) root.removeAttribute('class'); else root.setAttribute('class', oldClass);
  }
  return faces.filter(face => face.runs.length);
}

export async function exportFontCss(root, {settings, css = '', fontCss = '', subset, validateFont, portableFactory = false, customFontCss = ''}) {
  try {
    if (typeof subset !== 'function') throw new TypeError('The page font writer needs a subsetter.');
    let candidates = fontFaces(fontCss);
    if (portableFactory) {
      const custom = new Set(fontFaces(customFontCss).map(face => face.family));
      candidates = candidates.filter(face => face.family === 'geist' && !custom.has(face.family));
    }
    const faces = fontRuns(root, {settings, css, faces: candidates}), output = [], prepared = new Map();
    let payloadBytes = 0;
    for (const face of faces) {
      const text = face.runs.join('\n');
      if (!prepared.has(face.source)) prepared.set(face.source, new Map());
      const variants = prepared.get(face.source);
      if (!variants.has(text)) {
        const original = Uint8Array.from(atob(face.source.slice(face.source.indexOf(',') + 1)), character => character.charCodeAt(0));
        const bytes = await subset(original, text);
        if (portableFactory) {
          if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length >= original.length || bytes.length > FACTORY_FONT_BYTES) return '';
          if (typeof validateFont !== 'function' || await validateFont(Uint8Array.from(bytes), {family: 'Geist'}) !== true) return '';
        } else if (bytes === null) { variants.set(text, null); continue; }
        if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error('The page font subset is empty.');
        variants.set(text, {source: fontSource(bytes), length: bytes.length});
      }
      const saved = variants.get(text);
      if (saved === null) continue;
      if (portableFactory) {
        payloadBytes += saved.length;
        if (payloadBytes > FACTORY_FONT_BYTES) return '';
      }
      output.push(writeFace(face, saved.source));
    }
    const result = output.join('\n');
    return portableFactory && new TextEncoder().encode(result).length > FACTORY_FONT_CSS_BYTES ? '' : result;
  } catch (error) {
    if (!portableFactory || error?.name === 'AbortError' || error?.code === 'cancelled') throw error;
    return '';
  }
}

export async function requireDocumentFonts(source, {parser, index, root, settings, css = '', fontCss = '', validateFont}) {
  const candidates = fontFaces(fontCss), known = new Set(candidates.map(face => face.family));
  for (const family of ['Geist', 'Geist Mono', ...documentFontUsage(source, parser).keys()]) {
    const name = family.toLowerCase();
    if (!known.has(name)) {
      candidates.push({family: name, properties: {}, runs: []});
      known.add(name);
    }
  }
  const used = new Set(fontRuns(root, {settings, css, faces: candidates}).map(face => face.family));
  const checked = new Set(), Font = root.ownerDocument?.defaultView?.FontFace || globalThis.FontFace;
  for (const family of used) {
    const assets = index.assets.filter(asset => asset.family.toLowerCase() === family);
    if (!assets.length) {
      const factory = family === 'geist' || family === 'geist mono';
      const declared = Object.entries(index.references).some(([label, definition]) => {
        if (!label.startsWith('FONT:')) return false;
        if (label === 'FONT:' + family.toUpperCase() || label.startsWith('FONT:' + family.toUpperCase() + '/')) return true;
        try { return normalizeFontFamily(JSON.parse(definition.title).family)?.toLowerCase() === family; }
        catch (_) { return false; }
      });
      if (!factory || declared)
        throw Object.assign(new Error('The selected font is not embedded: ' + family), {code: 'export_font_unavailable'});
      continue;
    }
    for (const asset of assets) {
      if (checked.has(asset.url)) continue;
      const bytes = Uint8Array.from(atob(asset.data), character => character.charCodeAt(0));
      if (typeof validateFont !== 'function')
        throw Object.assign(new Error('Embedded font validation is unavailable: ' + asset.family), {code: 'export_font_unavailable'});
      if (await validateFont(bytes, {family: asset.family, format: asset.format}) !== true)
        throw Object.assign(new Error('The embedded font is invalid: ' + asset.family), {code: 'export_font_invalid'});
      if (typeof Font === 'function') try { await new Font('rapier-export-validation', bytes).load(); }
      catch (cause) { throw Object.assign(new Error('The embedded font could not be loaded: ' + asset.family, {cause}), {code: 'export_font_invalid'}); }
      checked.add(asset.url);
    }
  }
}

export function fontRequests(root, options = {}) {
  return fontRuns(root, options).map(record => ({family: unquote(record.properties['font-family']),
    style: record.properties['font-style'] || 'normal', weight: record.properties['font-weight'] || '400',
    stretch: record.properties['font-stretch'] || '100%'}));
}

export function pdfFontSources(css) {
  return fontFaces(css).map(face => ({family: unquote(face.properties['font-family']),
    style: face.properties['font-style'] || 'normal',
    weight: face.properties['font-weight'] || '400',
    data: face.source.slice(face.source.indexOf(',') + 1)}));
}

export async function waitForFontRequests(doc, requests) {
  if (!requests?.length) return;
  const family = value => String(value).trim().replace(/^(['"])([\s\S]*)\1$/, '$2').replace(/\\(?:([\da-f]{1,6})\s?|([^\r\n\f]))/gi,
    (_, hex, character) => hex ? String.fromCodePoint(Math.max(1, Math.min(0x10ffff, parseInt(hex, 16)))) : character).toLowerCase();
  const weight = value => String(value || '400').trim().replace(/\s+/g, ' ').replace(/^normal$/, '400').replace(/^bold$/, '700');
  const stretch = value => String(value || '100%').trim().replace(/\s+/g, ' ').replace(/^normal$/, '100%');
  for (const request of requests) {
    const faces = Array.from(doc.fonts || []).filter(face => family(face.family) === request.family.toLowerCase() &&
      face.style === request.style && weight(face.weight) === weight(request.weight) && stretch(face.stretch) === stretch(request.stretch));
    try {
      if (!faces.length) throw new Error('The font is missing from the print page.');
      await Promise.all(faces.map(face => face.load()));
    } catch (cause) { throw Object.assign(new Error('The embedded font could not be loaded: ' + request.family, {cause}), {code: 'export_font_unavailable'}); }
  }
}

export async function waitForFonts(root, {settings, css = '', fontCss = '', install = true} = {}) {
  const required = fontRuns(root, {settings, css, fontCss});
  if (!required.length) return () => {};
  const doc = root.ownerDocument, Font = doc?.defaultView?.FontFace || globalThis.FontFace;
  if (typeof Font !== 'function' || !doc?.fonts)
    throw Object.assign(new Error('Embedded document fonts cannot be loaded for printing.'), {code: 'export_font_unavailable'});
  const loaded = await Promise.all(required.map(async record => {
    const family = unquote(record.properties['font-family']);
    const descriptor = {};
    for (const [css, name] of [['font-style', 'style'], ['font-weight', 'weight'], ['font-stretch', 'stretch'], ['unicode-range', 'unicodeRange']])
      if (record.properties[css]) descriptor[name] = record.properties[css];
    const bytes = Uint8Array.from(atob(record.source.slice(record.source.indexOf(',') + 1)), character => character.charCodeAt(0));
    try { return await new Font(record.properties['font-family'], bytes, descriptor).load(); }
    catch (cause) { throw Object.assign(new Error('The embedded font could not be loaded: ' + family, {cause}), {code: 'export_font_unavailable'}); }
  }));
  if (install) for (const face of loaded) doc.fonts.add(face);
  return () => { if (install) for (const face of loaded) doc.fonts.delete(face); };
}
