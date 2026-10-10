// SPDX-License-Identifier: MIT
// Collect document font data without a layout engine. Authored drawing resources keep their identities.
const FONT_FIELDS = new Set(['font', 'font-family', 'font-weight', 'font-style', 'font-stretch', 'text-transform']);
const FAMILY = "'Geist',system-ui,sans-serif";
const MONO = "'Geist Mono',monospace";
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
  // The reference sheet uses :where() for zero-specificity defaults.
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

function writeFace(face, bytes) {
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  const format = signature === 'wOFF' ? 'woff' : signature === 'wOF2' ? 'woff2' : signature === 'OTTO' ? 'opentype' : 'truetype';
  const mime = {woff: 'woff', woff2: 'woff2', opentype: 'otf', truetype: 'ttf'}[format];
  let binary = '';
  for (let at = 0; at < bytes.length; at += 16384) binary += String.fromCharCode(...bytes.subarray(at, at + 16384));
  const properties = {...face.properties, src: 'url("data:font/' + mime + ';base64,' + btoa(binary) + '") format("' + format + '")'};
  delete properties['unicode-range'];
  return '@font-face{' + Object.entries(properties).map(([name, value]) => name + ':' + value).join(';') + '}';
}

export async function exportFontCss(root, {settings, css = '', fontCss = '', subset}) {
  if (!root?.querySelectorAll || typeof subset !== 'function') throw new TypeError('The page font writer needs a document and a subsetter.');
  const faces = fontFaces(fontCss);
  if (!faces.length) return '';
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
      'text-transform': 'none', variables: {'--md-font-sans': settings?.mainfont?.css || FAMILY, '--md-font-mono': MONO}};
    const computed = new WeakMap();
    let priorFace = null, priorStyle = '';
    const breakRun = () => { priorFace = null; priorStyle = ''; };
    function styleOf(element) {
      if (computed.has(element)) return computed.get(element);
      const parent = element === root ? initial : styleOf(element.parentElement || root);
      const state = {...parent, variables: Object.create(parent.variables)}, chosen = new Map();
      function take(row, rank) {
        const score = (row.important ? 1e12 : 0) + rank, prior = chosen.get(row.name);
        if (!prior || score >= prior.score) chosen.set(row.name, {...row, score});
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
      if (shorthand) for (const [name, value] of Object.entries(fontShorthand(resolveValue(shorthand.value, state.variables))))
        if (!chosen.has(name) || chosen.get(name).score <= shorthand.score) chosen.set(name, {...shorthand, name, value});
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
      const families = splitCss(state['font-family'], ',').map(name => unquote(name).toLowerCase());
      const runStyle = [state['font-weight'], state['font-style'], state['font-stretch']].join('/');
      for (const character of text) {
        let selected = null;
        for (const family of families) {
          const candidates = faces.filter(face => face.family === family && unicodeIncludes(face, character));
          if (!candidates.length) continue;
          candidates.sort((a, b) => styleDistance(a, state['font-style']) - styleDistance(b, state['font-style']) ||
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
            {'font-family': resolveValue('var(--md-font-sans)', styleOf(item).variables), 'font-weight': '500'});
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
  const output = [];
  for (const face of faces) {
    if (!face.runs.length) continue;
    const original = Uint8Array.from(atob(face.source.slice(face.source.indexOf(',') + 1)), character => character.charCodeAt(0));
    // Keep source order through adjacent inline nodes so canonical shaping closure
    // sees the same base/mark sequences. Independent runs cannot compose together.
    const bytes = await subset(original, face.runs.join('\n'));
    if (bytes === null) continue;
    if (!(bytes instanceof Uint8Array) || !bytes.length) throw new Error('The page font subset is empty.');
    output.push(writeFace(face, bytes));
  }
  return output.join('\n');
}
