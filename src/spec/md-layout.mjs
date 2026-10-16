// SPDX-License-Identifier: MIT

export const fields = new Set(['align', 'width', 'lines', 'wrap', 'x', 'y', 'rotate', 'opacity', 'first', 'indent', 'marker', 'lock', 'hyphens', 'caps', 'hanging']);
export const alignments = new Set(['left', 'center', 'right', 'justify']);
export const wraps = new Set(['around', 'box', 'behind', 'front']);
const has = (value, key) => Object.hasOwn(value, key);
const percent = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const lineCount = value => Number.isInteger(value) && value >= 1 && value <= 12;
export const INDENT_LIMIT = 64;
export const indentLevel = value => typeof value === 'number' && Number.isFinite(value) && value !== 0 &&
  Math.abs(value) <= INDENT_LIMIT && Number(value.toFixed(6)) === value;
export function stepIndent(value, step) {
  const next = Number(((value || 0) + step).toFixed(6));
  if (Math.abs(next) > INDENT_LIMIT) return value || 0;
  return !value && step < 0 || value && Math.sign(value) !== Math.sign(next) ? 0 : next;
}
const oneDecimalDegrees = value => typeof value === 'number' && Number.isFinite(value) &&
  value > -180 && value <= 180 && Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;

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
    (!has(value, 'first') || indentLevel(value.first)) && (!has(value, 'indent') || indentLevel(value.indent)) &&
    (!has(value, 'marker') || indentLevel(value.marker)) &&
    (!has(value, 'lock') || value.lock === 'on') &&
    (!has(value, 'hyphens') || value.hyphens === 'auto') &&
    (!has(value, 'caps') || value.caps === 'small') &&
    (!has(value, 'hanging') || value.hanging === 'on') &&
    !(has(value, 'align') && (has(value, 'wrap') || has(value, 'x')));
}

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
      const number = /^(-)?(0|[1-9]\d*)(?:\.\d+)?em$/.exec(raw);
      if (!number || (number[1] && Number(raw.slice(1, -2)) === 0)) return null;
      value.y = Number(raw.slice(0, -2));
    } else if (key === 'rotate') {
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
    } else if (key === 'first' || key === 'indent' || key === 'marker') {
      if (!/^-?(?:0|[1-9]\d?)(?:\.\d{1,6})?$/.test(raw)) return null;
      value[key] = Number(raw);
    } else value[key] = raw;
  }
  return validLayout(value) ? value : null;
}

export function decodeLayoutAttribute(value) {
  try { return decodeURIComponent(value || ''); } catch (_) { return ''; }
}

export const parseLayoutAttribute = value => parseLayout(decodeLayoutAttribute(value));

export function textStyle(value, {portable = false, pointSize, indentOffset = 0} = {}) {
  if (!validLayout(value)) return '';
  const property = {first: 'text-indent', indent: 'margin-inline-start'};
  const css = (portable ? ['first', 'indent'] : ['first', 'indent', 'marker'])
    .filter(key => has(value, key) || key === 'indent' && indentOffset).map(key => {
      const level = (value[key] || 0) + (key === 'indent' ? indentOffset : 0);
      const measure = decimal(Number((level * 2).toFixed(6)));
      return (portable ? property[key] : '--md-' + key) + ':' + (portable ?
        pointSize ? decimal(Math.round(level * pointSize * 40) / 20) + 'pt' : measure + 'em' :
        'calc(' + measure + ' * var(--md-text-body))');
    });
  if (portable && value.hyphens === 'auto') css.push('hyphens:auto');
  return css.join(';');
}

export function textLayout(style, {listMarker = false, pointSize, offset = 0} = {}) {
  const value = {};
  for (const [key, property] of (listMarker ? [['marker', 'margin-inline-start']] : [['first', 'text-indent'], ['indent', 'margin-inline-start']])) {
    const raw = style?.getPropertyValue(property).trim() || '';
    const match = /^(-?(?:0|[1-9]\d*)(?:\.\d{1,6})?)(em|pt)$/.exec(raw);
    const level = Number(((match ? Number(match[1]) / (match[2] === 'pt' ? pointSize : 1) / 2 : 0) +
      (key === 'first' ? 0 : offset)).toFixed(6));
    if (Number.isFinite(level) && level) value[key] = level;
  }
  if (!listMarker && style?.getPropertyValue('hyphens').trim() === 'auto') value.hyphens = 'auto';
  return value;
}

export function imageStyle(value) {
  if (!validLayout(value)) return '';
  const parts = [];
  if (value.width != null) {
    const width = value.width;
    const left = value.x == null ? '' : ';display:block;margin-left:' +
      decimal(Number(Math.max(0, Math.min(100 - width, value.x - width / 2)).toFixed(6))) + '%;margin-right:0';
    parts.push('width:' + decimal(width) + '%;height:auto' + left);
  }
  if (value.lines != null) parts.push('width:auto;max-width:100%;height:' + linesHeightCss(value.lines) + ';object-fit:contain');
  if (value.opacity != null && value.opacity < 100) parts.push('opacity:' + decimal(value.opacity / 100));
  return parts.join(';');
}

export const linesHeightCss = lines => lines === 1 ? '1cap' : 'calc(' + (lines - 1) + ' * var(--md-line, 1.6em) + 1cap)';

export function objectHeight(width, naturalHeight, attrs, line) {
  if (attrs.height && attrs.height !== 'auto') return Math.min(4096, Number(attrs.height) * line);
  const [w, h] = (attrs.viewport || '640x360').split('x').map(Number);
  return attrs.resize === 'scale' ? Math.min(4096, width * h / w) : naturalHeight;
}

export function wrapTextBlock(element) {
  return element && /^(P|H[1-6]|UL|OL|BLOCKQUOTE|DETAILS|DL)$/.test(element.tagName) &&
    element.textContent.trim() && !element.querySelector('img,table,pre,figure,math,.math-rendered') ? element : null;
}

export function wrapNeighbour(node, classify, step = (n, direction) => n && n[direction > 0 ? 'nextElementSibling' : 'previousElementSibling']) {
  for (const direction of [1, -1]) {
    for (let sibling = step(node, direction); sibling; sibling = step(sibling, direction)) {
      const kind = classify(sibling);
      if (kind && typeof kind === 'object') return kind.stop;
      if (kind === 'metadata') continue;
      if (kind === 'prose') return sibling;
      if (kind !== 'picture') break;
    }
  }
  return null;
}

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
