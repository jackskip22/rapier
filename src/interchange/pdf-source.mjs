// SPDX-License-Identifier: AGPL-3.0-only
const LIMIT = 25 * 1024 * 1024;
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
const equal = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

export async function readAttachedSource(blob, {checkCurrent = () => {}, signal} = {}) {
  const check = () => { if (signal?.aborted) throw new DOMException('PDF import canceled.', 'AbortError'); checkCurrent(); };
  check();
  if (!(blob instanceof Blob) || !blob.size || blob.size > LIMIT) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer()); check();
  const ending = [...new TextDecoder('latin1').decode(bytes.subarray(-1024)).matchAll(/startxref\s+(\d+)\s+%%EOF/g)].at(-1);
  if (!ending) return null;
  const text = new TextDecoder('latin1').decode(bytes);
  if (!text.startsWith('xref', Number(ending[1]))) return null;
  let at = Number(ending[1]) + 4, tokens = 0;
  const space = () => { while (at < text.length) {
    if (/[\0\t\n\f\r ]/.test(text[at])) at++;
    else if (text[at] === '%') { while (at < text.length && !/[\r\n]/.test(text[at])) at++; }
    else break;
  } };
  const token = () => { space(); const value = /^[^\0\t\n\f\r ()<>\[\]{}/%]+/.exec(text.slice(at));
    if (!value) fail('PDF_SOURCE_FORMAT', 'The attached PDF source is damaged.'); at += value[0].length; return value[0]; };
  const value = (depth = 0) => {
    if (depth > 32 || ++tokens > bytes.length) fail('PDF_SOURCE_FORMAT', 'The attached PDF source is damaged.');
    space();
    if (text.startsWith('<<', at)) {
      at += 2; const dict = Object.create(null);
      for (;;) { space(); if (text.startsWith('>>', at)) { at += 2; return dict; }
        const key = value(depth + 1); if (!key?.name || Object.hasOwn(dict, key.name)) fail('PDF_SOURCE_FORMAT', 'The attached PDF source is damaged.');
        dict[key.name] = value(depth + 1);
      }
    }
    if (text[at] === '[') { at++; const list = []; for (;;) { space(); if (text[at] === ']') { at++; return list; } list.push(value(depth + 1)); } }
    if (text[at] === '/') { at++; return {name: token().replace(/#([\da-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))}; }
    if (text[at] === '<') {
      const end = text.indexOf('>', ++at), hex = text.slice(at, end).replace(/\s/g, '');
      if (end < 0 || !/^[\da-f]*$/i.test(hex)) fail('PDF_SOURCE_FORMAT', 'The attached PDF source is damaged.');
      at = end + 1; return {string: Uint8Array.from((hex + (hex.length % 2 ? '0' : '')).match(/../g) || [], pair => parseInt(pair, 16))};
    }
    if (text[at] === '(') {
      at++; const out = []; let nesting = 1;
      while (at < bytes.length && nesting) {
        let byte = bytes[at++];
        if (byte === 92) {
          byte = bytes[at++];
          if (byte === 13 || byte === 10) { if (byte === 13 && bytes[at] === 10) at++; continue; }
          if (byte >= 48 && byte <= 55) { let octal = String.fromCharCode(byte); for (let n = 1; n < 3 && bytes[at] >= 48 && bytes[at] <= 55; n++) octal += String.fromCharCode(bytes[at++]); byte = parseInt(octal, 8) & 255; }
          else byte = ({110: 10, 114: 13, 116: 9, 98: 8, 102: 12})[byte] ?? byte;
        } else if (byte === 40) nesting++;
        else if (byte === 41 && --nesting === 0) break;
        out.push(byte);
      }
      if (nesting) fail('PDF_SOURCE_FORMAT', 'The attached PDF source is damaged.');
      return {string: Uint8Array.from(out)};
    }
    const word = token();
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)) {
      const number = Number(word), after = at; space();
      const ref = /^(\d+)\s+R\b/.exec(text.slice(at));
      if (ref) { at += ref[0].length; return {ref: number, generation: Number(ref[1])}; }
      at = after; return number;
    }
    if (word === 'null') return null;
    if (word === 'true' || word === 'false') return word === 'true';
    fail('PDF_SOURCE_FORMAT', 'The attached PDF source is damaged.');
  };
  const offsets = new Map();
  let trailer;
  try {
    for (;;) {
      space(); if (text.startsWith('trailer', at)) { at += 7; trailer = value(); break; }
      const first = Number(token()), count = Number(token());
      if (!Number.isSafeInteger(first) || first < 0 || !Number.isSafeInteger(count) || count < 1 || count > bytes.length / 18) return null;
      for (let index = 0; index < count; index++) {
        const offset = Number(token()), generation = Number(token()), state = token();
        if (!Number.isSafeInteger(offset) || offset < 0 || offset >= Number(ending[1]) || !Number.isSafeInteger(generation) || !['n', 'f'].includes(state)) return null;
        if (state === 'n') offsets.set(first + index, {offset, generation});
      }
    }
  } catch (_) { return null; }
  if (!trailer || trailer.Encrypt || trailer.Prev || trailer.XRefStm) return null;
  const cache = new Map();
  const object = ref => {
    if (!ref || !Number.isSafeInteger(ref.ref)) return {dict: ref};
    if (cache.has(ref.ref)) return cache.get(ref.ref);
    const entry = offsets.get(ref.ref);
    if (!entry || entry.generation !== ref.generation) fail('PDF_SOURCE_FORMAT', 'The attached PDF source is damaged.');
    at = entry.offset;
    if (Number(token()) !== ref.ref || Number(token()) !== ref.generation || token() !== 'obj') fail('PDF_SOURCE_FORMAT', 'The attached PDF source is damaged.');
    const dict = value(); space(); const result = {dict};
    if (text.startsWith('stream', at)) {
      at += 6; if (text[at] === '\r') at++; if (text[at++] !== '\n') fail('PDF_SOURCE_FORMAT', 'The attached PDF source is damaged.');
      result.start = at;
    }
    cache.set(ref.ref, result); return result;
  };
  const resolve = ref => object(ref).dict;
  const string = entry => {
    const data = entry?.string;
    if (!(data instanceof Uint8Array)) return '';
    if (data[0] === 254 && data[1] === 255) return new TextDecoder('utf-16be', {fatal: true}).decode(data.subarray(2));
    return new TextDecoder('latin1').decode(data);
  };
  let catalog;
  try {
    if (string(resolve(trailer.Info)?.Producer) !== 'Rapier') return null;
    catalog = resolve(trailer.Root);
  } catch (_) { return null; }
  const candidates = [...(Array.isArray(catalog?.AF) ? catalog.AF : [])], visited = new Set();
  const names = (entry, depth = 0) => {
    if (!entry || visited.has(entry.ref ?? entry)) return;
    if (depth > 32) fail('PDF_SOURCE_FORMAT', 'The attached PDF source is damaged.');
    visited.add(entry.ref ?? entry); const tree = resolve(entry);
    if (Array.isArray(tree?.Names)) for (let index = 1; index < tree.Names.length; index += 2) candidates.push(tree.Names[index]);
    if (Array.isArray(tree?.Kids)) for (const child of tree.Kids) names(child, depth + 1);
  };
  names(resolve(catalog?.Names)?.EmbeddedFiles);
  let original = null, filename = '';
  for (const ref of new Set(candidates)) {
    check(); const file = resolve(ref), name = string(file?.UF) || string(file?.F);
    if (file?.AFRelationship?.name !== 'Source' || !name) continue;
    const links = resolve(file.EF), stream = object(links?.UF || links?.F), length = resolve(stream.dict?.Length);
    if (!/\.(?:md|markdown)$/i.test(name) && !['text/markdown', 'text/plain'].includes(stream.dict?.Subtype?.name)) continue;
    if (!Number.isSafeInteger(length) || length < 0 || stream.start == null || stream.start + length > bytes.length ||
        !/^\s*endstream\b/.test(text.slice(stream.start + length, stream.start + length + 24))) fail('PDF_SOURCE_FORMAT', 'The attached PDF source is damaged.');
    let data = bytes.slice(stream.start, stream.start + length);
    if (stream.dict.Filter) {
      if (stream.dict.Filter.name !== 'FlateDecode') fail('PDF_SOURCE_FORMAT', 'The attached PDF source uses an unsupported encoding.');
      const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(), parts = [];
      let size = 0;
      try { for (;;) { const part = await reader.read(); check(); if (part.done) break;
        size += part.value.length; if (size > LIMIT) fail('PDF_SOURCE_SIZE', 'The attached Markdown exceeds the 25 MiB document limit.'); parts.push(part.value);
      } } finally { await reader.cancel().catch(() => {}); }
      data = new Uint8Array(size); let offset = 0; for (const part of parts) { data.set(part, offset); offset += part.length; }
    }
    if (data.length > LIMIT) fail('PDF_SOURCE_SIZE', 'The attached Markdown exceeds the 25 MiB document limit.');
    if (original && !equal(original, data)) fail('PDF_SOURCE_AMBIGUOUS', 'This PDF has different attached source documents. Open its attachments individually.');
    original = data; filename = name;
  }
  if (!original) return null;
  let canonical;
  try { canonical = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(original); }
  catch (_) { fail('PDF_SOURCE_ENCODING', 'The attached Markdown is not valid UTF-8.'); }
  if (!equal(new TextEncoder().encode(canonical), original)) fail('PDF_SOURCE_ENCODING', 'The attached Markdown could not be read without changing its bytes.');
  check();
  return {canonical, filename, source: 'attached-source', warnings: [], stats: {inputBytes: bytes.length, outputBytes: original.length, exactSource: true}};
}
