// SPDX-License-Identifier: AGPL-3.0-only
// The appendix surface is spec/md-assets.mjs (MIT), re-exported; this file keeps what needs AGPL picture bytes.
import {inspectJPEGXL, JPEG_XL_PICTURE_LIMITS} from './header.mjs';
import {inspectRaster} from './raster.mjs';
import {fontCssURL} from '../draw/font.mjs';
import {
  IMAGE_LIMITS, configureParser, normalizeLabel, assetTitle, installMarkdownImages, markdownParser,
  markdownBodyOffset, dataImage, parseAssets, documentAssets, blockwiseAssets, projectImageDefinitions, imageEnvironment,
  mayRetireImageDefinitions, retireDeletedImageDefinitions, assetOmissions, isAssetBlock,
  escapeImageAlt, serializeAsset, appendAssetText, appendAsset, referenceOccurs,
} from '../spec/md-assets.mjs';

export {inspectJPEGXL, inspectRaster};
export {
  IMAGE_LIMITS, configureParser, normalizeLabel, installMarkdownImages, markdownParser,
  markdownBodyOffset, dataImage, parseAssets, documentAssets, blockwiseAssets, projectImageDefinitions, imageEnvironment,
  mayRetireImageDefinitions, retireDeletedImageDefinitions, assetOmissions, isAssetBlock,
  escapeImageAlt, serializeAsset, appendAssetText, appendAsset, referenceOccurs,
};

function fail(reason) { throw new Error(reason); }
function bytesOf(value) {
  return value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : fail('image_bytes_invalid');
}

// The CSS default for a replaced element with no intrinsic size.
export const UNSTATED_SIZE = Object.freeze({width: 300, height: 150});
export function validAssetDimensions(width, height, pixels = IMAGE_LIMITS.pixels) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0 &&
    width <= IMAGE_LIMITS.dimension && height <= IMAGE_LIMITS.dimension && width * height <= pixels;
}
// A JPEG carried whole, or a stored JPEG XL: as large as the encoder's carrier writes (images/header.mjs).
export function validCarriedDimensions(width, height) { return validAssetDimensions(width, height, JPEG_XL_PICTURE_LIMITS.pixels); }
export function isJxl(value) {
  const bytes = bytesOf(value);
  if (bytes[0] === 255 && bytes[1] === 10) return true;
  return [0, 0, 0, 12, 74, 88, 76, 32, 13, 10, 135, 10].every((byte, index) => bytes[index] === byte);
}
const ATTR_SPAN = '(?:[^<>"\']|"[^"]*"|\'[^\']*\')*';
const SVG_DOCTYPE = /<!DOCTYPE(?:[^>"'\[]|"[^"]*"|'[^']*'|\[[\s\S]*?\])*>/gi;
const SVG_ATTRIBUTE = /\s+([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const xmlValue = value => value.replace(/&(?:#(x[0-9a-f]+|\d+)|(amp|lt|gt|quot|apos));/gi, (raw, numeric, named) => {
  if (!numeric) return {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"}[named.toLowerCase()];
  const number = numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : Number(numeric);
  return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '\ufffd';
});
const xmlAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const CSS_IDENTIFIER = /(?:[-\w\u0080-\uffff]|\\(?:[0-9a-f]{1,6}(?:\r\n|[ \t\r\n\f])?|[^\r\n\f]))+/iy;
const cssValue = value => value.replace(/\\(?:([0-9a-f]{1,6})(?:\r\n|[ \t\r\n\f])?|([\s\S]))/gi, (raw, hex, plain) => {
  if (!hex) return /[\r\n\f]/.test(plain) ? '' : plain;
  const number = parseInt(hex, 16);
  return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '\ufffd';
});
function svgCss(css, ids, fonts = false) {
  // A font URL is trusted only after its whole rule and original font bytes pass admission.
  const fontURL = fonts ? fontCssURL(css) : '';
  const skip = at => {
    if (css.startsWith('/*', at)) { const end = css.indexOf('*/', at + 2); return end < 0 ? css.length : end + 2; }
    if (css[at] !== '"' && css[at] !== "'") return at;
    const quote = css[at++];
    while (at < css.length) {
      if (css[at] === '\\') at += 2;
      else if (css[at++] === quote) break;
    }
    return Math.min(at, css.length);
  };
  const boundary = (at, rule) => {
    let depth = rule ? 0 : 1;
    while (at < css.length) {
      const skipped = skip(at);
      if (skipped > at) { at = skipped; continue; }
      const character = css[at++];
      if (character === '\\') { at++; continue; }
      if (character === '(') depth++;
      else if (character === ')' && --depth === 0 && !rule) return at;
      else if (character === ';' && !depth && rule) return at;
    }
    return css.length;
  };
  let out = '', copied = 0;
  for (let at = 0; at < css.length;) {
    const skipped = skip(at);
    if (skipped > at) { at = skipped; continue; }
    const start = at, rule = css[at] === '@';
    CSS_IDENTIFIER.lastIndex = at + (rule ? 1 : 0);
    const token = CSS_IDENTIFIER.exec(css);
    if (!token) { at++; continue; }
    at = CSS_IDENTIFIER.lastIndex;
    const name = cssValue(token[0]).toLowerCase();
    if (rule && name === 'import') {
      const end = boundary(at, true);
      out += css.slice(copied, start); copied = at = end;
    } else if (!rule && css[at] === '(' && /^(?:url|image|image-set|-webkit-image-set|src)$/.test(name)) {
      const end = boundary(at + 1, false), body = css.slice(at + 1, css[end - 1] === ')' ? end - 1 : end).trim();
      const quoted = (body[0] === '"' || body[0] === "'") && body.at(-1) === body[0];
      const target = cssValue(quoted ? body.slice(1, -1) : body).trim();
      if (name !== 'url' || !(target[0] === '#' && ids.has(target.slice(1)) || fontURL && target === fontURL)) {
        out += css.slice(copied, start) + (name === 'url' ? 'url()' : 'none'); copied = end;
      }
      at = end;
    }
  }
  return out + css.slice(copied);
}
function _svgRemoveElement(text, tag) {
  const name = '(?:[^\\s<>"\'/=:]+:)?' + tag;
  const whole = new RegExp('<(' + name + ')\\b' + ATTR_SPAN + '>[\\s\\S]*?<\\/\\1\\s*>', 'gi');
  const empty = new RegExp('<' + name + '\\b' + ATTR_SPAN + '\\/\\s*>', 'gi');
  let out = text, previous;
  do { previous = out; out = out.replace(whole, ''); } while (out !== previous);
  return out.replace(empty, '');
}
export function sanitizeSvgText(text) {
  if (typeof text !== 'string') return '';
  let out = text.replace(SVG_DOCTYPE, '').replace(/<\?(?!xml(?:\s|\?>))[\s\S]*?\?>/gi, '');
  out = _svgRemoveElement(out, 'script');
  out = _svgRemoveElement(out, 'foreignObject');
  // SVG subdocuments (<iframe>/<embed>/<object>) and SVG Tiny <handler>/<listener> are stripped: script by another name.
  for (const tag of ['iframe', 'embed', 'object', 'video', 'audio', 'handler', 'listener', 'html', 'body', 'frame', 'frameset', 'applet']) out = _svgRemoveElement(out, tag);
  const ids = new Set();
  const idAttr = /\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (let m; (m = idAttr.exec(out));) ids.add(xmlValue(m[1] ?? m[2] ?? m[3]));
  out = out.replace(new RegExp('<([^\\s<>"\'/=]+)((?:\\s+' + ATTR_SPAN + ')?)(\\/?)>', 'g'), (whole, name, attrs, close) => {
    if (!attrs) return whole;
    const element = name.split(':').pop().toLowerCase();
    const cleaned = attrs.replace(SVG_ATTRIBUTE, (raw, attribute, dq, sq) => {
      // Resolve XML entities and namespace prefixes before resource policy checks.
      const key = attribute.split(':').pop().toLowerCase(), original = dq ?? sq, value = xmlValue(original);
      if (key.startsWith('on') || attribute.toLowerCase() === 'xml:base') return '';
      // href only to a fragment or, on <image>, a raster data URL: never a nested SVG, never src/data/srcdoc.
      if (/^(?:src|data|srcdoc|poster|codebase|archive|classid|formaction|action|ping|manifest|background)$/.test(key)) return '';
      if (key === 'href' && !/^\s*#/.test(value) &&
          !(/^(?:image|feimage)$/.test(element) && /^\s*data:image\/(?:png|jpeg|gif|webp|avif|jxl)[;,]/i.test(value))) return '';
      if (/^(?:animate|set)$/.test(element) && key === 'attributename' &&
          /^(?:href|base|on[\w.-]*|style)$/i.test(value.trim().split(':').pop())) return ' ' + attribute + '=""';
      const localized = svgCss(value, ids);
      return localized === value ? raw : ' ' + attribute + '="' + xmlAttribute(localized) + '"';
    });
    return '<' + name + cleaned + close + '>';
  });
  out = out.replace(new RegExp('(<((?:[^\\s<>"\'/=:]+:)?style)\\b' + ATTR_SPAN + '>)([\\s\\S]*?)(<\\/\\2\\s*>)', 'gi'),
    (m, open, name, css, close) => {
      const decoded = xmlValue(css.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (raw, body) => xmlAttribute(body)));
      const clean = svgCss(decoded, ids, true);
      return clean === decoded ? m : open + xmlAttribute(clean) + close;
    });
  return out;
}
const SVG_ROOT = new RegExp('<svg(?=\\s|/?>)(' + ATTR_SPAN + ')>');
const SVG_PROLOG = new RegExp('^(?:\\s|<!--[\\s\\S]*?-->|<\\?[\\s\\S]*?\\?>|' + SVG_DOCTYPE.source + ')*', 'i');
function svgText(bytes) {
  try { return new TextDecoder('utf-8', {fatal: true}).decode(bytesOf(bytes)); }
  catch (_) { return fail('Choose a valid SVG image.'); }
}
function svgGeometry(text) {
  const offset = SVG_PROLOG.exec(text)[0].length, root = SVG_ROOT.exec(text.slice(offset));
  if (!root || root.index) return fail('Choose a valid SVG image.');
  root.index = offset;
  const attrs = new Map();
  for (const match of root[1].matchAll(SVG_ATTRIBUTE)) attrs.set(match[1], xmlValue(match[2] ?? match[3]));
  if (attrs.has('xmlns') && attrs.get('xmlns') !== 'http://www.w3.org/2000/svg') return fail('Choose a valid SVG image.');
  const units = {px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, pt: 96 / 72, pc: 16};
  const number = name => {
    const value = attrs.get(name)?.trim();
    if (!value) return null;
    const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)([a-z%]*)$/i.exec(value);
    if (!match || match[2] && !Object.hasOwn(units, match[2].toLowerCase())) return null;
    const size = Number(match[1]) * (units[match[2].toLowerCase()] || 1);
    if (!Number.isFinite(size) || size <= 0) return fail('image_dimensions_invalid');
    return size;
  };
  const box = attrs.get('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const ratio = box?.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0 ? box[2] / box[3] : null;
  let width = number('width'), height = number('height');
  if (ratio) {
    if (width == null && height == null) { width = box[2]; height = box[3]; }
    else if (width == null) width = height * ratio;
    else if (height == null) height = width / ratio;
  }
  width = Math.max(1, Math.round(width ?? UNSTATED_SIZE.width)); height = Math.max(1, Math.round(height ?? UNSTATED_SIZE.height));
  if (!validAssetDimensions(width, height)) return fail('image_dimensions_invalid');
  return {root, attrs, width, height};
}
export function inspectSVG(bytes, options = {}) {
  const text = svgText(bytes), {width, height} = svgGeometry(text);
  return {type: 'image/svg+xml', width, height, orientation: 1, ...(options.nodes ? svgNodeInspection(svgElements(text), text) : {})};
}
export function normalizeSVG(bytes) {
  const text = sanitizeSvgText(svgText(bytes)), {root, attrs, width, height} = svgGeometry(text);
  let tag = root[0];
  for (const [name, value] of [['width', width], ['height', height]]) {
    if (attrs.get(name) === String(value)) continue;
    const pattern = new RegExp('\\s+' + name + '\\s*=\\s*(?:"[^"]*"|\'[^\']*\')');
    tag = attrs.has(name) ? tag.replace(pattern, ' ' + name + '="' + value + '"') : tag.replace(/\s*\/?>(?=$)/, close => ' ' + name + '="' + value + '"' + close);
  }
  if (!attrs.has('xmlns')) tag = tag.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return new TextEncoder().encode(text.slice(0, root.index) + tag + text.slice(root.index + root[0].length));
}

export const SVG_NODE_LIMITS = Object.freeze({nodes: 256, chars: 262000, value: 16384, edits: 128, fields: 64, depth: 64});
export const SVG_NODE_STYLE_FIELDS = Object.freeze(('alignment-baseline baseline-shift clip-path clip-rule color color-interpolation color-interpolation-filters direction display dominant-baseline fill fill-opacity fill-rule filter flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight image-rendering letter-spacing lighting-color marker-start marker-mid marker-end mask opacity overflow paint-order pointer-events shape-rendering stop-color stop-opacity stroke stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering transform transform-box transform-origin unicode-bidi vector-effect visibility white-space word-spacing writing-mode').split(' '));
export const SVG_NODE_GEOMETRY_FIELDS = Object.freeze(('x y x1 y1 x2 y2 cx cy r rx ry fx fy fr width height dx dy d points pathLength transform viewBox preserveAspectRatio rotate textLength lengthAdjust refX refY markerWidth markerHeight orient gradientTransform patternTransform startOffset offset').split(' '));
const SVG_NS = 'http://www.w3.org/2000/svg', XLINK_NS = 'http://www.w3.org/1999/xlink';
const SVG_XML_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const SVG_NODE_TEXT = new Set(['text', 'tspan', 'textPath', 'title', 'desc']);
const SVG_STYLE_NAMES = new Set(SVG_NODE_STYLE_FIELDS), SVG_GEOMETRY_NAMES = new Set(SVG_NODE_GEOMETRY_FIELDS);
const SVG_GEOMETRY_BY_ELEMENT = {
  svg: 'x y width height viewBox preserveAspectRatio', rect: 'x y width height rx ry pathLength',
  circle: 'cx cy r pathLength', ellipse: 'cx cy rx ry pathLength', line: 'x1 y1 x2 y2 pathLength',
  path: 'd pathLength', polyline: 'points pathLength', polygon: 'points pathLength',
  image: 'x y width height preserveAspectRatio', use: 'x y width height',
  text: 'x y dx dy rotate textLength lengthAdjust', tspan: 'x y dx dy rotate textLength lengthAdjust', textPath: 'startOffset textLength lengthAdjust',
  linearGradient: 'x1 y1 x2 y2 gradientTransform', radialGradient: 'cx cy r fx fy fr gradientTransform', stop: 'offset',
  pattern: 'x y width height viewBox preserveAspectRatio patternTransform', mask: 'x y width height', filter: 'x y width height',
  marker: 'refX refY markerWidth markerHeight orient viewBox preserveAspectRatio', symbol: 'viewBox preserveAspectRatio',
};
const SVG_NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const SVG_LENGTH = new RegExp('^(' + SVG_NUMBER + ')(%|px|em|ex|ch|rem|in|cm|mm|q|pt|pc)?$');
function svgNodeFail(field, message) {
  throw Object.assign(new Error(field + ': ' + message), {code: 'svg_node_edit_invalid', field});
}
function svgCharacters(value, field) {
  for (const character of value) {
    const n = character.codePointAt(0);
    if (n < 32 && n !== 9 && n !== 10 && n !== 13 || n >= 0xd800 && n <= 0xdfff || n === 0xfffe || n === 0xffff)
      svgNodeFail(field, 'Use valid XML characters.');
  }
  return value;
}
export function svgXmlValue(raw, field = 'node_edits') {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#(?:[0-9]+|x[0-9a-fA-F]+);)/.test(raw)) svgNodeFail(field, 'The SVG contains an invalid XML entity.');
  return svgCharacters(raw.replace(/&(#(?:[0-9]+|x[0-9a-fA-F]+)|amp|lt|gt|quot|apos);/g, (entity, token) => {
    if (token[0] !== '#') return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[token];
    const n = token[1] === 'x' ? parseInt(token.slice(2), 16) : Number(token.slice(1));
    if (!Number.isSafeInteger(n) || n <= 0 || n > 0x10ffff) svgNodeFail(field, 'The SVG contains an invalid XML entity.');
    return String.fromCodePoint(n);
  }), field);
}
export function svgElements(text, {visit, inspect = true} = {}) {
  if (inspect && text.length > IMAGE_LIMITS.bytes) svgNodeFail('node_edits', 'The SVG exceeds the image limit.');
  const nodes = [], stack = [], ids = new Set(), idCounts = new Map(), links = [];
  const references = {has: id => { links.push(id); return true; }};
  let at = 0, totalNodes = 0, roots = 0;
  const invalid = () => svgNodeFail('node_edits', 'The SVG must be well-formed XML.');
  while (at < text.length) {
    if (text[at] !== '<') {
      const end = text.indexOf('<', at), until = end < 0 ? text.length : end, raw = text.slice(at, until);
      if (!stack.length && raw.trim() || raw.includes(']]>')) invalid();
      const value = svgXmlValue(raw);
      if (inspect && stack.at(-1)?.local === 'style') svgCss(value,references);
      at = until; continue;
    }
    if (text.startsWith('<!--', at) || text.startsWith('<![CDATA[', at) || text.startsWith('<?', at)) {
      const comment = text.startsWith('<!--', at), cdata = text.startsWith('<![CDATA[', at), close = comment ? '-->' : cdata ? ']]>' : '?>';
      const start = at + (comment ? 4 : cdata ? 9 : 2), end = text.indexOf(close, start);
      if (end < 0 || comment && text.slice(start, end).includes('--') || cdata && !stack.length || inspect && !comment && !cdata && (stack.length || !/^xml\s/.test(text.slice(start, end)))) invalid();
      if (stack.length) stack.at(-1).markup = true;
      if (inspect && cdata && stack.at(-1)?.local === 'style') svgCss(text.slice(start,end),references);
      at = end + close.length; continue;
    }
    if (text.startsWith('</', at)) {
      const match = /^<\/([A-Za-z_][A-Za-z0-9_.:-]*)\s*>/.exec(text.slice(at)), node = stack.pop();
      if (!match || !node || node.element !== match[1]) invalid();
      node.contentEnd = at; node.end = at + match[0].length; at = node.end; visit?.(node); continue;
    }
    const start = at, match = /^<([A-Za-z_][A-Za-z0-9_.:-]*)/.exec(text.slice(at));
    if (!match || match[1].split(':').length > 2) invalid();
    const element = match[1], parent = stack.at(-1), attributes = new Map(), namespace = new Map(parent?.namespace || [['xml','http://www.w3.org/XML/1998/namespace']]);
    if (!parent && (++roots !== 1 || (inspect ? element !== 'svg' : element.split(':').at(-1) !== 'svg'))) invalid();
    if (parent) parent.children++;
    const id = parent ? parent.id + '.' + (parent.children - 1) : 'svg:0';
    at += match[0].length;
    let insertAt = at, slashAt = -1;
    while (at < text.length) {
      const gap = at;
      while (/\s/.test(text[at] || '') && at < text.length) at++;
      if (text[at] === '>') { at++; break; }
      if (text.startsWith('/>', at)) { slashAt = at; at += 2; break; }
      if (at === gap) invalid();
      const attribute = /^([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*(["'])/.exec(text.slice(at));
      if (!attribute || attribute[1].split(':').length > 2 || attributes.has(attribute[1])) invalid();
      const name = attribute[1], quote = attribute[2], valueStart = at + attribute[0].length, valueEnd = text.indexOf(quote, valueStart);
      if (valueEnd < 0 || text.slice(valueStart, valueEnd).includes('<')) invalid();
      const value = svgXmlValue(text.slice(valueStart, valueEnd));
      attributes.set(name, {name, value, quote, start:gap, end:valueEnd + 1, valueStart, valueEnd});
      if (name === 'xmlns') namespace.set('', value);
      else if (name.startsWith('xmlns:')) namespace.set(name.slice(6), value);
      if (name === 'id') { ids.add(value); idCounts.set(value,(idCounts.get(value) || 0) + 1); }
      if ((name === 'href' || name === 'xlink:href') && value.startsWith('#')) links.push(value.slice(1));
      if (inspect && value.includes('(')) svgCss(value,references);
      at = insertAt = valueEnd + 1;
    }
    if (text[at - 1] !== '>') invalid();
    const split = element.split(':'), prefix = split.length === 2 ? split[0] : '';
    if (prefix && !namespace.has(prefix)) invalid();
    const ns = namespace.has(prefix) ? namespace.get(prefix) : inspect ? parent?.ns ?? SVG_NS : '';
    const node = {id, parentId:parent?.id || null, element, local:split.at(-1), ns, namespace, attributes,
      start, openEnd:at, contentStart:at, contentEnd:at, end:at, insertAt, slashAt, children:0, markup:false};
    totalNodes++;
    if (nodes.length < SVG_NODE_LIMITS.nodes) nodes.push(node);
    if (slashAt < 0) { stack.push(node); if (inspect && stack.length > SVG_NODE_LIMITS.depth) svgNodeFail('node_edits', 'The SVG exceeds the node depth limit.'); }
    else visit?.(node);
  }
  if (stack.length || roots !== 1) invalid();
  return {nodes, totalNodes, ids, idCounts, links};
}
function svgStyle(raw, field = 'node_edits') {
  const starts = [], ends = []; let value = '';
  for (let at = 0; at < raw.length;) {
    const start = at, entity = raw[at] === '&' ? /^&(?:#(?:[0-9]+|x[0-9a-fA-F]+)|amp|lt|gt|quot|apos);/.exec(raw.slice(at)) : null;
    const part = entity ? svgXmlValue(entity[0], field) : raw[at]; at += entity ? entity[0].length : 1;
    for (let i = 0; i < part.length; i++) { starts.push(start); ends.push(at); }
    value += part;
  }
  const declarations = []; let start = 0, colon = -1, quote = '', depth = 0;
  const finish = end => {
    const chunk = value.slice(start, end);
    if (!chunk.replace(/\/\*[\s\S]*?\*\//g, '').trim()) { start = end + 1; colon = -1; return; }
    if (colon < start) svgNodeFail(field, 'Use complete CSS declarations.');
    const name = cssValue(value.slice(start, colon).replace(/\/\*[\s\S]*?\*\//g, ' ').trim()).toLowerCase();
    // A comment between identifier tokens does not join them into a CSS property.
    if (!/^[-a-z][a-z0-9-]*$/.test(name)) { start = end + 1; colon = -1; return; }
    let first = colon + 1, last = end;
    while (/\s/.test(value[first] || '') && first < last) first++;
    while (/\s/.test(value[last - 1] || '') && last > first) last--;
    let removeStart = start;
    let prefix = start;
    while (prefix < colon) {
      while (/\s/.test(value[prefix] || '') && prefix < colon) prefix++;
      if (!value.startsWith('/*',prefix)) break;
      prefix = value.indexOf('*/',prefix + 2) + 2; removeStart = prefix;
    }
    declarations.push({name, value:value.slice(first,last), start:starts[removeStart] ?? raw.length,
      end:end < value.length ? ends[end] : raw.length, valueStart:starts[first] ?? raw.length, valueEnd:last > first ? ends[last - 1] : starts[first] ?? raw.length});
    start = end + 1; colon = -1;
  };
  for (let at = 0; at < value.length; at++) {
    const character = value[at];
    if (quote) { if (character === '\\') at++; else if (character === quote) quote = ''; continue; }
    if (value.startsWith('/*', at)) { const end = value.indexOf('*/', at + 2); if (end < 0) svgNodeFail(field, 'Close the CSS comment.'); at = end + 1; continue; }
    if (character === '"' || character === "'") quote = character;
    else if (character === '\\') at++;
    else if (character === '(' || character === '[') depth++;
    else if (character === ')' || character === ']') { if (--depth < 0) svgNodeFail(field, 'Balance the CSS value.'); }
    else if (character === '{' || character === '}' || character === '@') svgNodeFail(field, 'Use CSS declarations without rules.');
    else if (character === ':' && !depth && colon < start) colon = at;
    else if (character === ';' && !depth) finish(at);
  }
  if (quote || depth) svgNodeFail(field, 'Close the CSS value.');
  finish(value.length); return {value, declarations};
}
function svgNodeInspection(parsed, text) {
  const nodes = []; let size = 128;
  for (const node of parsed.nodes) {
    if (node.attributes.size > 128 || [...node.attributes.values()].some(attribute => attribute.value.length > SVG_NODE_LIMITS.value)) continue;
    const attributes = Object.fromEntries([...node.attributes].map(([name, attribute]) => [name, attribute.value]));
    const rawStyle = node.attributes.get('style'), style = rawStyle ? Object.fromEntries(svgStyle(text.slice(rawStyle.valueStart,rawStyle.valueEnd)).declarations.map(declaration => [declaration.name,declaration.value])) : {};
    const geometry = Object.fromEntries([...node.attributes].filter(([name]) => SVG_GEOMETRY_NAMES.has(name)).map(([name, attribute]) => [name,attribute.value]));
    const content = node.children || node.markup ? null : svgXmlValue(text.slice(node.contentStart,node.contentEnd));
    if (content?.length > SVG_NODE_LIMITS.value) continue;
    const record = {id:node.id, parentId:node.parentId, element:node.element, attributes, style, text:content, geometry};
    const cost = JSON.stringify(record).length + 1;
    if (size + cost > SVG_NODE_LIMITS.chars) continue;
    nodes.push(record); size += cost;
  }
  return {nodes, totalNodes:parsed.totalNodes, truncated:nodes.length !== parsed.totalNodes};
}
function svgNumberList(value, field, length = false) {
  const parts = value.trim().split(/[\s,]+/);
  if (!value.trim() || parts.some(part => !(length ? SVG_LENGTH : new RegExp('^' + SVG_NUMBER + '$')).test(part) || !Number.isFinite(parseFloat(part))))
    svgNodeFail(field, 'Use finite SVG numbers' + (length ? ' or lengths.' : '.'));
  return parts.map(parseFloat);
}
function svgNodeGeometry(node, name, value, field) {
  if (name !== 'transform' && !(SVG_GEOMETRY_BY_ELEMENT[node.local] || '').split(' ').includes(name)) svgNodeFail(field, 'This geometry field does not belong to this element.');
  if (value == null) return;
  if (name === 'preserveAspectRatio') {
    if (!/^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?: (?:meet|slice))?)$/.test(value)) svgNodeFail(field, 'Use an SVG aspect-ratio value.');
  } else if (name === 'lengthAdjust') {
    if (!['spacing','spacingAndGlyphs'].includes(value)) svgNodeFail(field, 'Use spacing or spacingAndGlyphs.');
  } else if (/^(?:transform|gradientTransform|patternTransform)$/.test(name)) {
    let end = 0;
    for (const match of value.matchAll(/([A-Za-z]+)\s*\(([^()]*)\)/g)) {
      if (!/^[\s,]*$/.test(value.slice(end,match.index))) svgNodeFail(field, 'Use an SVG transform list.');
      const count = svgNumberList(match[2],field).length, counts = {matrix:[6],translate:[1,2],scale:[1,2],rotate:[1,3],skewX:[1],skewY:[1]}[match[1]];
      if (!counts?.includes(count)) svgNodeFail(field, 'Use a valid SVG transform and its finite arguments.');
      end = match.index + match[0].length;
    }
    if (!/^[\s,]*$/.test(value.slice(end))) svgNodeFail(field, 'Use an SVG transform list.');
  } else if (name === 'd') {
    let end = 0, command = '', numbers = [], first = true;
    const complete = () => {
      const arity = {m:2,l:2,h:1,v:1,c:6,s:4,q:4,t:2,a:7,z:0}[command.toLowerCase()];
      if (arity == null || (arity ? !numbers.length || numbers.length % arity : numbers.length)) svgNodeFail(field, 'Use complete SVG path commands.');
      if (command.toLowerCase() === 'a') for (let i = 0; i < numbers.length; i += 7)
        if (numbers[i] < 0 || numbers[i+1] < 0 || ![0,1].includes(numbers[i+3]) || ![0,1].includes(numbers[i+4])) svgNodeFail(field, 'Use valid SVG arc radii and flags.');
    };
    for (const match of value.matchAll(new RegExp('[MmZzLlHhVvCcSsQqTtAa]|' + SVG_NUMBER, 'g'))) {
      if (!/^[\s,]*$/.test(value.slice(end,match.index))) svgNodeFail(field, 'Use SVG path commands and finite numbers.');
      if (/^[A-Za-z]$/.test(match[0])) {
        if (command) complete();
        command = match[0]; numbers = [];
        if (first && !/[Mm]/.test(command)) svgNodeFail(field, 'Start an SVG path with moveto.');
        first = false;
      } else { const number = Number(match[0]); if (!command || !Number.isFinite(number)) svgNodeFail(field, 'Use finite SVG path coordinates.'); numbers.push(number); }
      end = match.index + match[0].length;
    }
    if (!/^[\s,]*$/.test(value.slice(end))) svgNodeFail(field, 'Use SVG path commands and finite numbers.');
    if (command) complete();
  } else if (name === 'viewBox') {
    const box = svgNumberList(value,field); if (box.length !== 4 || box[2] <= 0 || box[3] <= 0) svgNodeFail(field, 'Use x, y, positive width and positive height.');
  } else if (name === 'points') {
    if (value.trim() && svgNumberList(value,field).length % 2) svgNodeFail(field, 'Use coordinate pairs.');
  } else if (name === 'orient' && ['auto','auto-start-reverse'].includes(value)) return;
  else if (name === 'orient') { if (!new RegExp('^' + SVG_NUMBER + '(?:deg|rad|grad|turn)?$').test(value) || !Number.isFinite(parseFloat(value))) svgNodeFail(field, 'Use a finite angle.'); }
  else {
    const list = svgNumberList(value,field, !['rotate','pathLength'].includes(name));
    const multiple = ['text','tspan'].includes(node.local) && ['x','y','dx','dy','rotate'].includes(name);
    if (!multiple && list.length !== 1 || /^(?:r|rx|ry|fr|width|height|markerWidth|markerHeight|textLength)$/.test(name) && list.some(number => number < 0) || name === 'pathLength' && list[0] <= 0)
      svgNodeFail(field, 'Use valid geometry lengths for this element.');
    if (node.local === 'svg' && node.parentId == null && ['width','height'].includes(name) && (!/^[1-9][0-9]*$/.test(value) || Number(value) > IMAGE_LIMITS.dimension))
      svgNodeFail(field, 'Use a positive whole pixel size within the image limit.');
  }
}
function svgNodeAttribute(node, name, value, field) {
  if (!SVG_XML_NAME.test(name) || /^xmlns(?::|$)/i.test(name) || name.includes(':') && !['xlink:href','xml:lang','xml:space'].includes(name))
    svgNodeFail(field, 'Use an SVG attribute without changing namespaces.');
  const key = name.split(':').at(-1).toLowerCase();
  if (key.startsWith('on') || name === 'style' || /^(?:src|data|srcdoc|poster|codebase|archive|classid|formaction|action|ping|manifest|background)$/.test(key))
    svgNodeFail(field, 'This attribute cannot be edited.');
  if (SVG_GEOMETRY_NAMES.has(name)) svgNodeGeometry(node,name,value,field);
  if (value == null) return;
  if (name === 'xlink:href' && node.namespace.get('xlink') !== XLINK_NS) svgNodeFail(field, 'The xlink prefix must already name the SVG link namespace.');
  if (name === 'xml:space' && !['default','preserve'].includes(value)) svgNodeFail(field, 'Use default or preserve.');
  if (name === 'id' && !/^[^\s#<>"'&]+$/.test(value)) svgNodeFail(field, 'Use a nonempty XML id without spaces.');
  if (key === 'href' && !/^#[^\s#]+$/.test(value)) {
    if (!['image','feImage'].includes(node.local) || !/^data:image\/(?:png|jpeg|webp|jxl);base64,/.test(value)) svgNodeFail(field, 'Use a local fragment or an embedded raster image.');
    try { decodeDataImage(value); } catch (_) { svgNodeFail(field, 'Use a valid embedded raster image.'); }
  }
  if ((node.local.startsWith('animate') || node.local === 'set') && key === 'attributename' && /^(?:href|base|on[\w.-]*|style)$/i.test(value.trim().split(':').at(-1))) svgNodeFail(field, 'Animation cannot change executable attributes.');
  if (svgCss(value,{has:() => true}) !== value) svgNodeFail(field, 'Use local SVG references.');
}
const svgQuoted = (value, quote) => xmlAttribute(value).replace(/'/g, quote === "'" ? '&apos;' : "'").replace(/[\t\n\r]/g, character => '&#' + character.charCodeAt(0) + ';');
function svgNodeObject(value, field, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) svgNodeFail(field, 'Use an object.');
  const keys = Object.keys(value);
  if (!keys.length || keys.length > SVG_NODE_LIMITS.fields) svgNodeFail(field, 'Use one to ' + SVG_NODE_LIMITS.fields + ' fields.');
  if (allowed) for (const name of keys) if (!allowed.has(name)) svgNodeFail(field + '.' + name, 'This field is not supported.');
  return keys;
}
export function editSVGNodes(bytes, edits) {
  if (!Array.isArray(edits) || !edits.length || edits.length > SVG_NODE_LIMITS.edits) svgNodeFail('node_edits', 'Use one to ' + SVG_NODE_LIMITS.edits + ' node edits.');
  const original = svgText(bytes), parsed = svgElements(original), inspected = svgNodeInspection(parsed,original);
  const admitted = normalizeSVG(bytes), input = bytesOf(bytes);
  if (admitted.length !== input.length || admitted.some((byte,index) => byte !== input[index])) svgNodeFail('node_edits', 'The SVG must already be admitted by the image importer.');
  const visible = new Set(inspected.nodes.map(node => node.id)), used = new Set(), patches = [], idFields = [], hrefFields = [], resourceFields = [];
  const splice = (start,end,text,field) => patches.push({start,end,text,field});
  const scalar = (value,field,numeric = false) => {
    if (value === null) return null;
    if (numeric && typeof value === 'number' && Number.isFinite(value)) value = String(value);
    if (typeof value !== 'string' || value.length > SVG_NODE_LIMITS.value) svgNodeFail(field, 'Use a string within the SVG value limit' + (numeric ? ', a finite number, or null.' : ', or null.'));
    return svgCharacters(value,field);
  };
  for (let index = 0; index < edits.length; index++) {
    const edit = edits[index], field = 'node_edits[' + index + ']';
    svgNodeObject(edit,field,new Set(['id','text','attributes','style','geometry']));
    if (typeof edit.id !== 'string' || !visible.has(edit.id) || used.has(edit.id)) svgNodeFail(field + '.id', 'Use a disclosed node once in this edit.');
    used.add(edit.id);
    const node = parsed.nodes.find(node => node.id === edit.id);
    if (node.ns !== SVG_NS || /^(?:script|foreignObject|iframe|embed|object|handler|listener)$/i.test(node.local)) svgNodeFail(field + '.id', 'Only SVG elements can be edited.');
    if (Object.keys(edit).length < 2) svgNodeFail(field, 'Provide a node change.');
    const added = [], assigned = new Set();
    const attribute = (name,value,path) => {
      if (assigned.has(name)) svgNodeFail(path, 'Change an attribute once in this edit.');
      assigned.add(name); svgNodeAttribute(node,name,value,path);
      if (value != null) resourceFields.push({value,field:path});
      const before = node.attributes.get(name);
      if (name === 'id' && before?.value !== value) idFields.push({before:before?.value,value,field:path});
      if ((name === 'href' || name === 'xlink:href') && value?.startsWith('#')) hrefFields.push({value:value.slice(1),field:path});
      if (value == null) { if (before) splice(before.start,before.end,'',path); }
      else if (before) { if (before.value !== value) splice(before.valueStart,before.valueEnd,svgQuoted(value,before.quote),path); }
      else added.push(' ' + name + '="' + svgQuoted(value,'"') + '"');
    };
    if (Object.hasOwn(edit,'text')) {
      const path = field + '.text';
      if (typeof edit.text !== 'string' || edit.text.length > SVG_NODE_LIMITS.value || !SVG_NODE_TEXT.has(node.local) || node.children || node.markup) svgNodeFail(path, 'Edit a leaf text element without replacing child markup.');
      const value = svgCharacters(edit.text,path), before = svgXmlValue(original.slice(node.contentStart,node.contentEnd));
      if (value !== before) {
        const encoded = value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r/g,'&#13;');
        if (node.slashAt >= 0) splice(node.slashAt,node.openEnd,'>' + encoded + '</' + node.element + '>',path);
        else splice(node.contentStart,node.contentEnd,encoded,path);
      }
    }
    for (const group of ['attributes','geometry']) if (Object.hasOwn(edit,group)) {
      for (const name of svgNodeObject(edit[group],field + '.' + group,group === 'geometry' ? SVG_GEOMETRY_NAMES : null)) {
        const path = field + '.' + group + '.' + name, value = scalar(edit[group][name],path,group === 'geometry');
        attribute(name,value,path);
      }
    }
    if (Object.hasOwn(edit,'style')) {
      const names = svgNodeObject(edit.style,field + '.style',SVG_STYLE_NAMES), before = node.attributes.get('style');
      const raw = before ? original.slice(before.valueStart,before.valueEnd) : '', declarations = svgStyle(raw,field + '.style').declarations, additions = [];
      for (const name of names) {
        const path = field + '.style.' + name, value = scalar(edit.style[name],path);
        if (value != null) {
          const declaration = svgStyle(name + ':' + svgQuoted(value,'"'),path).declarations;
          if (!value.trim() || declaration.length !== 1 || declaration[0].name !== name || declaration[0].value !== value.trim() || /\/\*|\*\//.test(value) || /\bexpression\s*\(/i.test(cssValue(value)) || svgCss(value,{has:() => true}) !== value)
            svgNodeFail(path, 'Use one CSS value with local SVG references.');
          if (name === 'transform') svgNodeGeometry(node,'transform',value,path);
          resourceFields.push({value,field:path});
        }
        const matches = declarations.filter(declaration => declaration.name === name);
        if (!matches.length && value != null) additions.push(name + ':' + value);
        for (const declaration of matches) {
          if (value == null) splice(before.valueStart + declaration.start,before.valueStart + declaration.end,'',path);
          else if (declaration.value !== value) splice(before.valueStart + declaration.valueStart,before.valueStart + declaration.valueEnd,svgQuoted(value,before.quote),path);
        }
      }
      if (additions.length) {
        const appended = (raw.trim() && !raw.trim().endsWith(';') ? ';' : '') + additions.join(';');
        if (before) splice(before.valueEnd,before.valueEnd,svgQuoted(appended,before.quote),field + '.style');
        else added.push(' style="' + svgQuoted(appended,'"') + '"');
      }
    }
    if (added.length) splice(node.insertAt,node.insertAt,added.join(''),field + '.attributes');
  }
  let next = original, boundary = original.length;
  for (const patch of patches.sort((a,b) => b.start - a.start || b.end - a.end)) {
    if (patch.end > boundary) svgNodeFail(patch.field,'These node changes overlap.');
    next = next.slice(0,patch.start) + patch.text + next.slice(patch.end); boundary = patch.start;
  }
  const final = svgElements(next);
  for (const changed of idFields) {
    if (changed.before && !final.ids.has(changed.before) && final.links.includes(changed.before)) svgNodeFail(changed.field,'Keep the id referenced by another node.');
    if (changed.value && final.idCounts.get(changed.value) > 1) svgNodeFail(changed.field,'Use a unique SVG id.');
  }
  for (const href of hrefFields) if (!final.ids.has(href.value)) svgNodeFail(href.field,'Reference an existing SVG id.');
  for (const resource of resourceFields) if (svgCss(resource.value,final.ids) !== resource.value) svgNodeFail(resource.field,'Reference an existing SVG id.');
  if (sanitizeSvgText(next) !== next) svgNodeFail(idFields.at(-1)?.field || patches.at(-1)?.field || 'node_edits','The change must preserve safe SVG references.');
  const result = new TextEncoder().encode(next);
  if (result.length > IMAGE_LIMITS.bytes) svgNodeFail('node_edits','The SVG exceeds the image limit.');
  let normalized;
  try { normalized = svgText(normalizeSVG(result)); } catch (_) { svgNodeFail(patches.at(-1)?.field || 'node_edits','Keep valid image dimensions.'); }
  if (normalized !== next) svgNodeFail(patches.at(-1)?.field || 'node_edits','The change must retain the exact SVG accepted by the image importer.');
  return result;
}
export async function hashAsset(value) {
  const bytes = bytesOf(value);
  if (!bytes.length || bytes.length > IMAGE_LIMITS.bytes) return fail('image_byte_limit');
  if (!globalThis.crypto?.subtle) return fail('image_checksum_unavailable');
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function imageDimensions(bytes, codec) {
  const info = codec === 'image/jxl' ? inspectJPEGXL(bytes) : codec === 'image/svg+xml' ? inspectSVG(bytes) : inspectRaster(bytes);
  if (codec !== 'image/jxl' && info.type !== codec) return fail('image_codec_invalid');
  const width = info.orientation >= 5 ? info.height : info.width, height = info.orientation >= 5 ? info.width : info.height;
  if (!(codec === 'image/jxl' || codec === 'image/jpeg' ? validCarriedDimensions(width, height) : validAssetDimensions(width, height))) return fail('image_dimensions_invalid');
  return {width, height};
}
// Bytes without the size assertion: a damaged JPEG XL container must still reach the grey notice.
export function decodeDataImageBytes(url) {
  const info = dataImage(url);
  if (!info) return fail('image_data_invalid');
  let text;
  try { text = atob(url.slice(info.payloadStart)); } catch (_) { return fail('image_data_invalid'); }
  // The decoded binary string already has one code unit per byte; avoid an intermediate character list.
  const bytes = new Uint8Array(text.length);
  for (let at = 0; at < text.length; at++) bytes[at] = text.charCodeAt(at);
  return {bytes, codec: info.codec};
}
export function decodeDataImage(url) {
  const {bytes, codec} = decodeDataImageBytes(url);
  imageDimensions(bytes, codec);
  return bytes;
}
// decodeAsset's guards without the size assertion; see decodeDataImageBytes.
export async function decodeAssetBytes(source, record) {
  if (typeof record === 'string') record = documentAssets(source).assets.get(normalizeLabel(record));
  if (!record || record.status !== 'unverified') return fail('image_missing');
  if (source.slice(record.start, record.end) !== record.source) return fail('image_source_changed');
  return decodeDataImageBytes(record.url);
}
export async function decodeAsset(source, record) {
  const {bytes, codec} = await decodeAssetBytes(source, record);
  imageDimensions(bytes, codec);
  return bytes;
}
function base64(bytes) {
  const parts = [];
  for (let at = 0; at < bytes.length; at += 32768) parts.push(String.fromCharCode(...bytes.subarray(at, at + 32768)));
  return btoa(parts.join(''));
}
export {base64 as encodeBase64};
export async function createAsset(value, dimensions, options = {}) {
  let bytes = bytesOf(value);
  if (!bytes.length || bytes.length > IMAGE_LIMITS.bytes) return fail('image_byte_limit');
  const codec = options.codec || (isJxl(bytes) ? 'image/jxl' : inspectRaster(bytes).type);
  bytes = codec === 'image/svg+xml' ? normalizeSVG(bytes) : bytes.slice();
  const actual = imageDimensions(bytes, codec);
  if (dimensions && (actual.width !== dimensions.width || actual.height !== dimensions.height)) return fail('image_dimensions_invalid');
  const digest = await hashAsset(bytes), title = assetTitle(options.title);
  const label = 'image-' + digest + (title ? '-' + (await hashAsset(new TextEncoder().encode(title))).slice(0, 12) : '');
  const asset = {id: normalizeLabel(label), label, reference: label, url: 'data:' + codec + ';base64,' + base64(bytes),
    codec, ...actual, byteLength: bytes.length, bytes, title};
  asset.block = serializeAsset(asset);
  return asset;
}
