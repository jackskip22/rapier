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
export function inspectSVG(bytes) {
  const {width, height} = svgGeometry(svgText(bytes));
  return {type: 'image/svg+xml', width, height, orientation: 1};
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
  if (!(codec === 'image/jxl' ? validCarriedDimensions(width, height) : validAssetDimensions(width, height))) return fail('image_dimensions_invalid');
  return {width, height};
}
// Bytes without the size assertion: a damaged JPEG XL container must still reach the grey notice.
export function decodeDataImageBytes(url) {
  const info = dataImage(url);
  if (!info) return fail('image_data_invalid');
  let text;
  try { text = atob(url.slice(info.payloadStart)); } catch (_) { return fail('image_data_invalid'); }
  return {bytes: Uint8Array.from(text, char => char.charCodeAt(0)), codec: info.codec};
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
