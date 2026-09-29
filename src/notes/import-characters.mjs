// SPDX-License-Identifier: AGPL-3.0-only
// Foreign text is not an exact backup. Keep valid text byte-for-byte at admission; for already
// broken text keep the readable remainder and say exactly what was not representable. These
// helpers do not strip controls, fold Unicode, or change bidi policy. A converter that already
// normalises whitespace reports that fact without silently choosing a new presentation policy.
import {noteFileName} from './model.mjs';

const encoder = new TextEncoder();
const unitEscape = c => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
const readable = text => String(text).replace(/[\uD800-\uDFFF]/gu, unitEscape);

export function keepImportCharacters(text, warnings, field = 'text') {
  const source = String(text ?? '');
  if (source.isWellFormed()) return source;
  const units = [], repaired = source.replace(/[\uD800-\uDFFF]/gu, (c, offset) => {
    units.push({offset, unit: unitEscape(c)}); return unitEscape(c);
  });
  warnings.push({code: 'import-unicode', field: readable(field), count: units.length, units,
    message: 'Unpaired Unicode surrogates in ' + readable(field) + ' were kept as escape codes, not changed to replacement characters. The rest of the text was kept.'});
  return repaired;
}

// Find Unicode scalar encodings, not merely continuation-shaped bytes: overlong forms,
// surrogate encodings, > U+10FFFF and truncated sequences are all invalid. Valid runs go through
// the platform decoder unchanged; only invalid bytes become explicit, recorded ASCII byte markers.
function escapedUtf8(bytes) {
  const parts = [], invalid = [], decoder = new TextDecoder('utf-8', {ignoreBOM: true});
  let run = 0, at = 0;
  const continuation = i => i < bytes.length && bytes[i] >= 0x80 && bytes[i] <= 0xBF;
  while (at < bytes.length) {
    const b = bytes[at]; let width = 0;
    if (b <= 0x7F) width = 1;
    else if (b >= 0xC2 && b <= 0xDF && continuation(at + 1)) width = 2;
    else if (b >= 0xE0 && b <= 0xEF && continuation(at + 1) && continuation(at + 2)
      && (b !== 0xE0 || bytes[at + 1] >= 0xA0) && (b !== 0xED || bytes[at + 1] <= 0x9F)) width = 3;
    else if (b >= 0xF0 && b <= 0xF4 && continuation(at + 1) && continuation(at + 2) && continuation(at + 3)
      && (b !== 0xF0 || bytes[at + 1] >= 0x90) && (b !== 0xF4 || bytes[at + 1] <= 0x8F)) width = 4;
    if (width) { at += width; continue; }
    if (run < at) parts.push(decoder.decode(bytes.subarray(run, at)));
    // No quotes, backslashes or markup delimiters: the marker remains literal inside
    // a JSON/HTML/XML/CSV string too, so a byte error does not break its container grammar.
    parts.push('U8{' + b.toString(16).toUpperCase().padStart(2, '0') + '}');
    const prior = invalid.at(-1);
    if (prior && prior.offset + prior.bytes.length === at) prior.bytes.push(b);
    else invalid.push({offset: at, bytes: [b]});
    at++; run = at;
  }
  if (run < at) parts.push(decoder.decode(bytes.subarray(run, at)));
  return {text: parts.join(''), invalid};
}

export function readImportText(entry, warnings = [], field = entry?.name || 'source text', charset = 'utf-8') {
  if (entry?.bytes !== undefined) {
    const bytes = entry.bytes instanceof Uint8Array ? entry.bytes : entry.bytes instanceof ArrayBuffer ? new Uint8Array(entry.bytes) : null;
    if (!bytes) throw new TypeError('source bytes are not a byte array');
    let decoder;
    try { decoder = new TextDecoder(charset, {fatal: true, ignoreBOM: true}); }
    catch (_) {
      warnings.push({code: 'import-charset', field: readable(field), message: 'Unrecognised character encoding ' + readable(charset) + '; decoded as UTF-8. The original source bytes remain in the input.'});
      charset = 'utf-8'; decoder = new TextDecoder(charset, {fatal: true, ignoreBOM: true});
    }
    try { return decoder.decode(bytes); }
    catch (_) {
      if (decoder.encoding === 'utf-8') {
        const {text, invalid} = escapedUtf8(bytes);
        warnings.push({code: 'import-encoding', field: readable(field), byteLength: bytes.length, invalid,
          message: 'Invalid UTF-8 bytes in ' + readable(field) + ' were kept as literal U8{HH} ASCII byte markers. No replacement characters were invented; exact invalid bytes and offsets are recorded here, and the readable remainder was kept.'});
        return text;
      }
      const text = new TextDecoder(charset, {ignoreBOM: true}).decode(bytes);
      warnings.push({code: 'import-encoding', field: readable(field), byteLength: bytes.length,
        message: 'Invalid ' + readable(charset.toUpperCase()) + ' byte sequences in ' + readable(field) + ' were decoded with U+FFFD replacement characters. Readable text was kept; the original bytes remain in the source input.'});
      return text;
    }
  }
  if (typeof entry?.text !== 'string') throw new TypeError('source has no readable text or bytes');
  return keepImportCharacters(entry.text, warnings, field);
}

// Compare the actual field before and after an existing conversion, not an entire document whose
// added separators could conceal removed characters. Plain U+0020 is ordinary layout; the other
// whitespace and C0 characters are named individually. This is reporting, not a stripping rule.
export function reportCharacterChange(before, after, warnings, field = 'text') {
  before = String(before ?? ''); after = String(after ?? '');
  if (before === after) return;
  const counts = text => {
    const out = new Map();
    for (const c of text) if (c !== ' ' && /[\s\u0000-\u001F]/u.test(c)) out.set(c, (out.get(c) || 0) + 1);
    return out;
  };
  const a = counts(before), b = counts(after), removed = [];
  for (const [c, count] of a) if (count > (b.get(c) || 0)) removed.push({codePoint: 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'), count: count - (b.get(c) || 0)});
  if (removed.length) warnings.push({code: 'import-characters-normalized', field: readable(field), removed,
    message: 'Converting the ' + readable(field) + ' changed or removed spacing or control characters: ' + removed.map(r => r.codePoint + ' (' + r.count + ')').join(', ') + '. The exact characters stay in the original export.'});
}

// Diagnostics and provenance must also survive JSON/UTF-8 storage. Repair only malformed UTF-16,
// never controls or direction markers; a separate warning records every repair. The copy is
// iterative so an unfamiliar nested diagnostic cannot overflow a recursive walk. Byte buffers
// remain authoritative and are never walked as if they were text.
function repairTree(value, repairs, label) {
  if (typeof value === 'string') return keepImportCharacters(value, repairs, label);
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  const copy = Array.isArray(value) ? [] : {}, seen = new Map([[value, copy]]), queue = [[value, copy, label]];
  while (queue.length) {
    const [from, into, path] = queue.pop();
    // Reserve valid keys before repairing an invalid key; literal escape-looking keys cannot be
    // overwritten by its repaired spelling. This matters only for foreign diagnostic objects.
    const occupied = new Set(Object.keys(from).filter(k => k.isWellFormed()));
    for (const [key, item] of Object.entries(from)) {
      let name = keepImportCharacters(key, repairs, path + ' property name');
      if (name !== key) { const stem = name; let n = 2; while (occupied.has(name)) name = stem + ' ' + n++; occupied.add(name); }
      const at = path + '.' + name;
      let v = item;
      if (typeof item === 'string') v = keepImportCharacters(item, repairs, at);
      else if (item && typeof item === 'object' && !ArrayBuffer.isView(item) && !(item instanceof ArrayBuffer)) {
        if (seen.has(item)) v = seen.get(item);
        else { v = Array.isArray(item) ? [] : {}; seen.set(item, v); queue.push([item, v, at]); }
      }
      Object.defineProperty(into, name, {value: v, enumerable: true, writable: true, configurable: true});
    }
  }
  return copy;
}

export function finishImportCharacters(result) {
  const {notes, ...rest} = result, repairs = [];
  const out = repairTree(rest, repairs, 'import');
  if (repairs.length) out.warnings = [...(out.warnings || []), ...repairs];
  if (!Array.isArray(notes)) return out;
  out.notes = notes.map(note => {
    // The separately verified Rapier backup door owns exact source, including metadata. It is
    // not a text converter and this helper must never rename or repair its verified snapshots.
    if (note.exactBackup) return note;
    const warnings = [], next = repairTree(note, warnings, 'note');
    if (next.text !== note.text && typeof next.text === 'string' && note.bytes !== undefined) next.bytes = encoder.encode(next.text);
    if (warnings.length) next.warnings = [...(next.warnings || []), ...warnings];
    return next;
  });
  return out;
}

export function literalImportSource(entry, pool, why, warnings = [], language = 'text') {
  const text = readImportText(entry, warnings), runs = text.match(/`+/g) || [];
  let width = 3; for (const run of runs) width = Math.max(width, run.length + 1);
  const fence = '`'.repeat(width);
  const source = fence + language + '\n' + text + '\n' + fence + '\n';
  const file = noteFileName('# ' + readable(entry.name).replace(/\.[^./\\]+$/, '') + ' recovered source', pool); pool.push(file);
  return {file, text: source, sourceName: entry.name, rootId: entry.rootId ?? '',
    warnings: [...warnings, {code: 'import-source-retained', message: why + ' The source was kept as written, in a code block.'}],
    entry: {order: '', pinned: false, skill: false, archived: false, trashed: false, colour: ''}};
}

