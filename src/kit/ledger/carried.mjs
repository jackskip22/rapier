// SPDX-License-Identifier: MIT
import {readLedger} from './format.mjs';
import {sha256} from './hash.mjs';
import {authorship as projectAuthorship, readAuthorship} from './authorship.mjs';
import {canonicalJSON, fault} from './data.mjs';
export function encodeCarried(text) {
  return String(text).replace(/[\\\r\0]|<[/!]/g, m => m === '\\' ? '\\\\' : m === '\r' ? '\\r' : m === '\0' ? '\\0' : m === '</' ? '\\/' : '\\!');
}
export function decodeCarried(text) {
  return String(text).replace(/\\([\\/!r0])/g, (_, c) => c === '\\' ? '\\' : c === 'r' ? '\r' : c === '0' ? '\0' : c === '/' ? '</' : '<!');
}
export function validateParts(text, {ledger = null, authorship = null} = {}) {
  // A file's leading BOM is metadata, as in the editor's source intake.
  const canonical = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const history = ledger === null ? null : readLedger(ledger, canonical).ledger;
  const runs = authorship === null ? null : readAuthorship(authorship, canonical);
  if (history && runs && canonicalJSON(projectAuthorship(history)) !== canonicalJSON(runs)) throw fault('authorship differs from ledger replay');
  return {ledger: history, authorship: runs};
}
export function writeParts(text, options) {
  const parts = validateParts(text, options);
  return Object.entries(parts).filter(([, value]) => value !== null).map(([name, value]) =>
    '<script type="application/json" id="rapier-' + name + '">' + encodeCarried(JSON.stringify(value)) + '</script>\n').join('');
}
// Pure adapter: the browser supplies inert script elements, Node supplies parsed script records.
export function readParts(text, elements) {
  const parts = {ledger: null, authorship: null};
  for (const element of elements) {
    const name = element.id === 'rapier-ledger' ? 'ledger' : element.id === 'rapier-authorship' ? 'authorship' : null;
    if (!name) continue;
    if (parts[name] !== null || element.type !== 'application/json' || (element.tagName && element.tagName.toLowerCase() !== 'script')) throw fault('duplicate or executable carried part');
    try { parts[name] = JSON.parse(decodeCarried(element.textContent)); }
    catch (_) { throw fault('invalid carried JSON'); }
    if (parts[name] === null) throw fault('empty carried part');
  }
  return validateParts(text, parts);
}
// The wrapper only removes whole script elements. Strings inside other scripts are not carriers.
export function takeParts(html, text) {
  const elements = [];
  const stripped = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attrs, content) => {
    const attributes = [...attrs.matchAll(/(?:^|\s)([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)];
    const ids = attributes.filter(m => m[1].toLowerCase() === 'id').map(m => m[2] ?? m[3] ?? m[4]);
    if (!ids.some(id => id === 'rapier-ledger' || id === 'rapier-authorship')) return whole;
    const types = attributes.filter(m => m[1].toLowerCase() === 'type').map(m => m[2] ?? m[3] ?? m[4]);
    if (ids.length !== 1 || types.length !== 1) throw fault('ambiguous carried part');
    elements.push({id: ids[0], type: types[0].toLowerCase(), textContent: content}); return '';
  });
  if (elements.length && text === null) throw fault('carried history without a document');
  return {html: stripped, ...readParts(text ?? '', elements)};
}
const OPEN = '\n\n<!-- rapier-carried/1\n', CLOSE = '\n-->\n';
// One optional HTML comment at EOF; every other Markdown reader ignores it. Source is never rewritten.
export function writeDocument(text, options) {
  const parts = validateParts(text, options);
  if (!parts.ledger && !parts.authorship) return text;
  const json = JSON.stringify(parts).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return text + OPEN + json + CLOSE;
}
export function readDocument(source) {
  const at = source.lastIndexOf(OPEN);
  if (at < 0) return {text: source, ledger: null, authorship: null};
  if (!source.endsWith(CLOSE)) throw fault('unfinished document metadata');
  let parts;
  try { parts = JSON.parse(source.slice(at + OPEN.length, -CLOSE.length)); }
  catch (_) { throw fault('invalid document metadata'); }
  if (!parts || Object.keys(parts).length !== 2 || !Object.hasOwn(parts, 'ledger') || !Object.hasOwn(parts, 'authorship')) throw fault('invalid document parts');
  const text = source.slice(0, at);
  return {text, ...validateParts(text, parts)};
}

// One portable baseline. A digest is integrity evidence, not authentication of the named proposer.
export function readBase(value) {
  if (!value || typeof value !== 'object' || typeof value.text !== 'string' ||
      typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) || sha256(value.text) !== value.sha256)
    throw fault('proposal base SHA-256 differs from its text');
  if (typeof value.revision !== 'string' || !value.revision || value.revision.length > 256 || /[\u0000-\u001f\u007f]/.test(value.revision))
    throw fault('invalid proposal base revision');
  if (typeof value.name !== 'string' || !value.name || [...value.name].length > 256 || /[\\/\u0000-\u001f\u007f]/.test(value.name))
    throw fault('invalid proposal base name');
  if (typeof value.by !== 'string' || !value.by.trim() || value.by.length > 96 || /[\u0000-\u001f\u007f]/.test(value.by))
    throw fault('a proposal needs its proposer name');
  if (typeof value.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value.at) || !Number.isFinite(Date.parse(value.at)))
    throw fault('the time of a proposal is an ISO 8601 UTC timestamp');
  return {text: value.text, sha256: value.sha256, revision: value.revision, name: value.name, by: value.by, at: value.at};
}
const escapeAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const readAttribute = value => value.replace(/&(quot|lt|gt|amp);/g, (_, name) => ({quot: '"', lt: '<', gt: '>', amp: '&'})[name]);
export function writeBase(text, value) {
  if (value == null) return '';
  const base = readBase(value);
  if (base.text === text) return '';
  return '<script type="text/markdown" id="rapier-base"' + ['name', 'sha256', 'revision', 'by', 'at']
    .map(key => ' data-' + key + '="' + escapeAttribute(base[key]) + '"').join('') + '>' + encodeCarried(base.text) + '</script>';
}
export function readBaseElements(elements) {
  const rows = [...elements].filter(element => element.id === 'rapier-base');
  if (!rows.length) return null;
  const row = rows[0];
  if (rows.length !== 1 || row.type !== 'text/markdown' || (row.tagName && row.tagName.toLowerCase() !== 'script'))
    throw fault('duplicate or executable proposal base');
  const get = name => row.getAttribute ? row.getAttribute('data-' + name) : row[name];
  return readBase({text: decodeCarried(row.textContent), ...Object.fromEntries(['name', 'sha256', 'revision', 'by', 'at'].map(key => [key, get(key)]))});
}
export function takeBase(html) {
  const elements = [];
  const stripped = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (whole, attrs, content) => {
    const pairs = [...attrs.matchAll(/(?:^|\s)([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m => [m[1].toLowerCase(), readAttribute(m[2] ?? m[3] ?? m[4])]);
    if (!pairs.some(([key, value]) => key === 'id' && value === 'rapier-base')) return whole;
    const seen = new Set(), values = {};
    for (const [key, value] of pairs) {
      if (seen.has(key)) throw fault('ambiguous proposal base');
      seen.add(key); values[key] = value;
    }
    elements.push({id: values.id, type: values.type, textContent: content,
      ...Object.fromEntries(['name', 'sha256', 'revision', 'by', 'at'].map(key => [key, values['data-' + key]]))});
    return '';
  });
  return {html: stripped, base: readBaseElements(elements)};
}
