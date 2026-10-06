// SPDX-License-Identifier: MIT

// `rotate`: degrees in (-180, 180], one decimal, omitted when 0; never written for a Rapier drawing (its turn lives in its SVG).
// `opacity`: a picture's fade, a whole percent from 5 to 100, omitted at 100; the picture's bytes never change.
// `lines`: a picture's height in lines of the text beside it, set as a drop cap is (CSS `initial-letter`): its top on the first line's cap height, its foot on the
// Nth line's baseline, its width from its own aspect. A whole number 1 to 12; never with `width`.
// `first`/`indent`: a paragraph's first-line indent and its whole-block indent, in levels of one step (2em), a whole number from 1 to 4, omitted when 0; text
// only.
// `lock=on`: a picture locked in place: a tap goes to the words, never the picture; a hold takes it to unlock it. Omitted when off.
export const fields = new Set(['align', 'width', 'lines', 'wrap', 'x', 'y', 'rotate', 'opacity', 'first', 'indent', 'lock']);
export const alignments = new Set(['left', 'center', 'right', 'justify']);
// `behind`/`front`: out of flow; the paragraph lays out as though the picture were absent.
export const wraps = new Set(['around', 'box', 'behind', 'front']);
const has = (value, key) => Object.hasOwn(value, key);
const percent = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const lineCount = value => Number.isInteger(value) && value >= 1 && value <= 12;
const level = value => Number.isInteger(value) && value >= 1 && value <= 4;
const oneDecimalDegrees = value => typeof value === 'number' && Number.isFinite(value) &&
  value > -180 && value <= 180 && Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;

/** Validate values independently of their Markdown attachment context. */
export function validLayout(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !fields.has(key))) return false;
  return (!has(value, 'align') || alignments.has(value.align)) &&
    (!has(value, 'width') || percent(value.width) && value.width > 0) &&
    (!has(value, 'lines') || lineCount(value.lines) && !has(value, 'width')) &&
    (!has(value, 'wrap') || wraps.has(value.wrap)) &&
    (!has(value, 'x') || percent(value.x) && (has(value, 'wrap') || has(value, 'width'))) &&
    (!has(value, 'y') || typeof value.y === 'number' && Number.isFinite(value.y) && value.y >= -50 && has(value, 'wrap')) &&
    (!has(value, 'rotate') || oneDecimalDegrees(value.rotate)) &&
    (!has(value, 'opacity') || Number.isInteger(value.opacity) && value.opacity >= 5 && value.opacity <= 100) &&
    (!has(value, 'first') || level(value.first)) && (!has(value, 'indent') || level(value.indent)) &&
    (!has(value, 'lock') || value.lock === 'on') &&
    !(has(value, 'align') && (has(value, 'wrap') || has(value, 'x')));
}

/** Parse the closed v1 grammar. Geometry values are returned as numbers. */
export function parseLayout(comment) {
  if (typeof comment !== 'string' || /[^\t\x20-\x7e]/.test(comment)) return null;
  const match = /^<!--md-layout:v1[ \t]+([^\r\n]*?)[ \t]*-->$/.exec(comment);
  if (!match) return null;
  const pairs = match[1].replace(/^[ \t]+|[ \t]+$/g, '').split(/[ \t]+/), value = {};
  if (pairs.length > fields.size) return null;
  for (const pair of pairs) {
    const field = /^([a-z]+)=(.+)$/.exec(pair);
    if (!field || !fields.has(field[1]) || has(value, field[1])) return null;
    const [, key, raw] = field;
    if (key === 'width' || key === 'x') {
      const number = /^(0|[1-9]\d*)(?:\.(\d+))?%$/.exec(raw);
      if (!number || number[1].length > 3 || Number(number[1]) > 100 ||
          number[1] === '100' && /[1-9]/.test(number[2] || '')) return null;
      value[key] = Number(raw.slice(0, -1));
    } else if (key === 'y') {
      // Negative allowed; signed like rotate, never "-0em".
      const number = /^(-)?(0|[1-9]\d*)(?:\.\d+)?em$/.exec(raw);
      if (!number || (number[1] && Number(raw.slice(1, -2)) === 0)) return null;
      value.y = Number(raw.slice(0, -2));
    } else if (key === 'rotate') {
      // No '+', exponent, '°' or "-0deg"; 0 is unsigned.
      const number = /^(-)?(0|[1-9]\d*)(?:\.(\d))?deg$/.exec(raw);
      if (!number) return null;
      const magnitude = Number(number[2] + (number[3] ? '.' + number[3] : ''));
      if (number[1] && magnitude === 0) return null;
      value.rotate = number[1] ? -magnitude : magnitude;
    } else if (key === 'opacity') {
      if (!/^[1-9]\d{0,2}%$/.test(raw)) return null;
      value.opacity = Number(raw.slice(0, -1));
    } else if (key === 'lines') {
      if (!/^[1-9]\d?$/.test(raw)) return null;
      value.lines = Number(raw);
    } else if (key === 'first' || key === 'indent') {
      if (!/^[1-4]$/.test(raw)) return null;
      value[key] = Number(raw);
    } else value[key] = raw;
  }
  return validLayout(value) ? value : null;
}

// Comment delimiters are unsafe in sanitized attributes. Markdown stays literal;
// rendered attributes carry encodeURIComponent(marker), including its '%' signs.
export function decodeLayoutAttribute(value) {
  try { return decodeURIComponent(value || ''); } catch (_) { return ''; }
}

export const parseLayoutAttribute = value => parseLayout(decodeLayoutAttribute(value));

// The picture's own CSS: its normal-flow width and x, its height in lines, and its fade. `1cap` is the cap height of the
// picture's own text; a renderer that sets the picture beside its anchor measures that paragraph's line and cap instead.
export function imageStyle(value) {
  if (!validLayout(value)) return '';
  const parts = [];
  if (value.width != null) {
    const width = value.width;
    const left = value.x == null ? '' : ';display:block;margin-left:' +
      decimal(Number(Math.max(0, Math.min(100 - width, value.x - width / 2)).toFixed(6))) + '%;margin-right:0';
    parts.push('width:' + decimal(width) + '%;height:auto' + left);
  }
  // Wider than the column at its own aspect, it is contained in the N-line box, never stretched.
  if (value.lines != null) parts.push('width:auto;max-width:100%;height:' + linesHeightCss(value.lines) + ';object-fit:contain');
  if (value.opacity != null && value.opacity < 100) parts.push('opacity:' + decimal(value.opacity / 100));
  return parts.join(';');
}

export const linesHeightCss = lines => lines === 1 ? '1cap' : 'calc(' + (lines - 1) + ' * var(--md-line, 1.6em) + 1cap)';

// Controls remain real DOM nodes while their surrounding text flows. A checkbox, link or
// disclosure is not a reason to exclude its entire block from picture placement.
export function wrapTextBlock(element) {
  return element && /^(P|H[1-6]|UL|OL|BLOCKQUOTE|DETAILS|DL)$/.test(element.tagName) &&
    element.textContent.trim() && !element.querySelector('img,table,pre,figure,math,.math-rendered') ? element : null;
}

// The one wrap-owner rule (layout/browser.js, layout/interchange.js, editor/share.js): text after, else before, skipping pictures,
// metadata and empty paragraphs; any other block is a barrier in that direction.
export function wrapNeighbour(node, classify) {
  for (const step of [n => n && n.nextElementSibling, n => n && n.previousElementSibling]) {
    for (let sibling = step(node); sibling; sibling = step(sibling)) {
      const kind = classify(sibling);
      if (kind && typeof kind === 'object') return kind.stop;
      if (kind === 'metadata') continue;
      if (kind === 'prose') return sibling;
      if (kind !== 'picture') break;
    }
  }
  return null;
}

// Narrower than this, a line breaker splits words letter by letter.
export function wrapColumnFloor(fontSize) {
  return Math.max(40, 3.5 * (fontSize || 16));
}

function decimal(value) {
  if (value < 0) return '-' + decimal(-value);
  const text = String(value);
  if (!text.includes('e')) return text;
  const [mantissa, exponent] = text.split('e');
  const digits = mantissa.replace('.', '');
  const point = (mantissa.includes('.') ? mantissa.indexOf('.') : mantissa.length) + Number(exponent);
  if (point <= 0) return '0.' + '0'.repeat(-point) + digits;
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
  return digits.slice(0, point) + '.' + digits.slice(point);
}

/** Write only the supplied facts; no alignment is implied by absence. */
export function formatLayout(value) {
  if (!validLayout(value)) throw new TypeError('invalid_markdown_layout');
  const pairs = [];
  for (const key of fields) {
    if (has(value, key) && !(key === 'y' && value.y === 0) && !(key === 'rotate' && value.rotate === 0) &&
      !(key === 'opacity' && value.opacity === 100)) pairs.push(key + '=' +
      (key === 'width' || key === 'x' || key === 'opacity' ? decimal(value[key]) + '%' : key === 'y' ? decimal(value.y) + 'em' :
        key === 'rotate' ? decimal(value.rotate) + 'deg' : value[key]));
  }
  return pairs.length ? '<!--md-layout:v1 ' + pairs.join(' ') + '-->' : '';
}
