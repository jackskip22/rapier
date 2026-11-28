// SPDX-License-Identifier: MIT
export const isAsciiAlpha = ch => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
export const isHtmlSpace = ch => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
export const isTagEndBoundary = ch => ch === undefined || isHtmlSpace(ch) || ch === '/' || ch === '>';

export function isJxlSignature(bytes) {
  if (!bytes || bytes.length < 2) return false;
  if (bytes[0] === 0xff && bytes[1] === 0x0a) return true;
  return bytes.length >= 12 &&
    bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00 && bytes[3] === 0x0c &&
    bytes[4] === 0x4a && bytes[5] === 0x58 && bytes[6] === 0x4c && bytes[7] === 0x20 &&
    bytes[8] === 0x0d && bytes[9] === 0x0a && bytes[10] === 0x87 && bytes[11] === 0x0a;
}

export function decodeHtmlEntities(str) {
  if (!str || !str.includes('&')) return str;
  for (let i = str.indexOf('&'); i >= 0; i = str.indexOf('&', i + 1)) {
    const rest = str.slice(i);
    if (/^&(?:#[xX][0-9a-fA-F]+|#\d+|amp|AMP|lt|LT|gt|GT|quot|QUOT|apos);/.test(rest)) continue;
    const name = /^&([a-zA-Z][a-zA-Z0-9]*)/.exec(rest);
    if (rest[1] === '#' || name && rest[name[0].length] !== '=') return null;
  }
  let unknown = false;
  const decoded = str.replace(/&(?:#[xX]([0-9a-fA-F]+)|#(\d+)|(amp|AMP|lt|LT|gt|GT|quot|QUOT|apos));/g, (full, hex, dec, named) => {
    if (named) {
      const lower = named.toLowerCase();
      if (lower === 'amp') return '&';
      if (lower === 'lt') return '<';
      if (lower === 'gt') return '>';
      if (lower === 'quot') return '"';
      if (lower === 'apos') return "'";
      return full;
    }
    const cp = hex !== undefined ? parseInt(hex, 16) : parseInt(dec, 10);
    if (!Number.isSafeInteger(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) || (cp >= 0x80 && cp <= 0x9f)) {
      unknown = true;
      return full;
    }
    return String.fromCodePoint(cp);
  });
  return unknown ? null : decoded;
}

export function escapeHtmlAttr(str, quote = '"') {
  const escaped = String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return quote === "'" ? escaped.replaceAll("'", '&apos;') : escaped.replaceAll('"', '&quot;');
}

export function parseSrcset(input) {
  if (typeof input !== 'string') return null;
  const len = input.length, out = [];
  let i = 0;
  while (i < len) {
    while (i < len && (isHtmlSpace(input[i]) || input[i] === ',')) i++;
    if (i >= len) break;
    const urlStart = i;
    while (i < len && !isHtmlSpace(input[i])) i++;
    let url = input.slice(urlStart, i);
    let trailingCommas = 0;
    while (url.endsWith(',')) { url = url.slice(0, -1); trailingCommas++; }
    if (!url || trailingCommas > 1) return null;
    let descriptor = '';
    if (trailingCommas === 0) {
      while (i < len && isHtmlSpace(input[i])) i++;
      const descStart = i;
      let inParens = false;
      while (i < len) {
        const ch = input[i];
        if (inParens) {
          if (ch === ')') inParens = false;
          i++;
        } else if (ch === '(') {
          inParens = true;
          i++;
        } else if (ch === ',') {
          i++;
          break;
        } else {
          i++;
        }
      }
      descriptor = input.slice(descStart, input[i - 1] === ',' ? i - 1 : i).trim().replace(/\s+/g, ' ');
    }
    out.push({url, descriptor});
  }
  return out.length ? out : null;
}

export function parseStartTag(html, start, withSpans = false) {
  const len = html.length;
  let i = start + 1;
  if (i >= len || !isAsciiAlpha(html[i])) return null;
  while (i < len && !isHtmlSpace(html[i]) && html[i] !== '/' && html[i] !== '>') i++;
  const name = html.slice(start + 1, i).toLowerCase();
  const attrs = new Map();
  const attrSpans = withSpans ? new Map() : null;
  let selfClosing = false;

  while (i < len) {
    while (i < len && isHtmlSpace(html[i])) i++;
    if (i >= len) return null;
    if (html[i] === '>') return withSpans ? {name, attrs, attrSpans, selfClosing, end: i + 1} : {name, attrs, selfClosing, end: i + 1};
    if (html[i] === '/') {
      selfClosing = true;
      i++;
      if (i < len && html[i] === '>') return withSpans ? {name, attrs, attrSpans, selfClosing: true, end: i + 1} : {name, attrs, selfClosing: true, end: i + 1};
      selfClosing = false;
      continue;
    }
    const attrStart = i;
    while (i < len && !isHtmlSpace(html[i]) && html[i] !== '=' && html[i] !== '/' && html[i] !== '>') i++;
    const rawAttrName = html.slice(attrStart, i);
    const attrName = rawAttrName.toLowerCase();
    while (i < len && isHtmlSpace(html[i])) i++;
    let attrVal = '', valueStart = i, valueEnd = i, quote = '', hasValue = false;
    if (i < len && html[i] === '=') {
      hasValue = true;
      i++;
      while (i < len && isHtmlSpace(html[i])) i++;
      if (i >= len) return null;
      if (html[i] === '"' || html[i] === "'") {
        quote = html[i++];
        valueStart = i;
        const closeIdx = html.indexOf(quote, i);
        if (closeIdx < 0) return null;
        attrVal = html.slice(valueStart, closeIdx);
        valueEnd = closeIdx;
        i = closeIdx + 1;
      } else {
        valueStart = i;
        while (i < len && !isHtmlSpace(html[i]) && html[i] !== '>') i++;
        valueEnd = i;
        attrVal = html.slice(valueStart, i);
      }
    }
    if (attrName && !attrs.has(attrName)) {
      const decoded = decodeHtmlEntities(attrVal);
      attrs.set(attrName, decoded);
      if (attrSpans) attrSpans.set(attrName, {rawName: rawAttrName, value: decoded, rawValue: attrVal, valueStart, valueEnd, quote, hasValue});
    }
  }
  return null;
}

export function parseEndTag(html, start) {
  const len = html.length;
  let i = start + 2;
  if (i >= len) return null;
  if (html[i] === '>') return {name: '', end: i + 1};
  if (!isAsciiAlpha(html[i])) {
    const gt = html.indexOf('>', i);
    return gt < 0 ? null : {name: '', end: gt + 1};
  }
  const nameStart = i;
  while (i < len && !isHtmlSpace(html[i]) && html[i] !== '/' && html[i] !== '>') i++;
  const name = html.slice(nameStart, i).toLowerCase();
  let quote = '';
  while (i < len) {
    const ch = html[i++];
    if (quote) { if (ch === quote) quote = ''; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return {name, end: i};
  }
  return null;
}

export function scanScriptEnd(html, from) {
  const len = html.length;
  let i = from, escaped = false, doubleEscaped = false;
  while (i < len) {
    if (!escaped && html.startsWith('<!--', i)) {
      escaped = true;
      i += 4;
      continue;
    }
    if (escaped && html.startsWith('-->', i)) {
      escaped = false;
      doubleEscaped = false;
      i += 3;
      continue;
    }
    if (escaped && !doubleEscaped && html[i] === '<' && html.slice(i + 1, i + 7).toLowerCase() === 'script' && isTagEndBoundary(html[i + 7])) {
      doubleEscaped = true;
      i += 7;
      continue;
    }
    if (html[i] === '<' && html[i + 1] === '/' && html.slice(i + 2, i + 8).toLowerCase() === 'script' && isTagEndBoundary(html[i + 8])) {
      if (doubleEscaped) {
        doubleEscaped = false;
        i += 8;
        continue;
      }
      const endTag = parseEndTag(html, i);
      return endTag ? endTag.end : null;
    }
    i++;
  }
  return null;
}

export function scanRawTextEnd(html, from, tagName) {
  const len = html.length, tagLen = tagName.length;
  let i = from;
  while (i < len) {
    if (html[i] === '<' && html[i + 1] === '/' &&
        html.slice(i + 2, i + 2 + tagLen).toLowerCase() === tagName &&
        isTagEndBoundary(html[i + 2 + tagLen])) {
      const endTag = parseEndTag(html, i);
      return endTag ? endTag.end : null;
    }
    i++;
  }
  return null;
}
