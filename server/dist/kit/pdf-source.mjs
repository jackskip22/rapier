// SPDX-License-Identifier: MIT
function pdfStructure(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const fail = () => { throw Object.assign(new Error('The PDF source could not be attached.'), {code: 'pdf_source_invalid'}); };
  let text = '';
  for (let at = 0; at < bytes.length; at += 32768) text += String.fromCharCode(...bytes.subarray(at, at + 32768));
  if (!text.startsWith('%PDF-')) fail();
  const end = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text), xref = Number(end?.[1]);
  if (!end || !Number.isSafeInteger(xref) || text.slice(xref, xref + 4) !== 'xref') fail();
  const offsets = new Map();
  let at = xref + 4;
  const space = () => { while (at < text.length && /[\s\0]/.test(text[at])) at++; };
  for (;;) {
    space(); if (text.startsWith('trailer', at)) { at += 7; break; }
    const section = /^(\d+)\s+(\d+)\s+/.exec(text.slice(at)); if (!section) fail();
    at += section[0].length;
    const from = Number(section[1]), count = Number(section[2]);
    if (!Number.isSafeInteger(from + count) || count > bytes.length / 18) fail();
    for (let i = 0; i < count; i++) {
      const entry = /^(\d{10})\s+(\d{5})\s+([nf])\s+/.exec(text.slice(at)); if (!entry) fail();
      at += entry[0].length;
      if (entry[3] === 'n') offsets.set(from + i, {at: Number(entry[1]), generation: Number(entry[2])});
    }
  }
  const skip = pos => { for (;;) { while (pos < text.length && /[\s\0]/.test(text[pos])) pos++; if (text[pos] !== '%') return pos; while (pos < text.length && !/[\r\n]/.test(text[pos])) pos++; } };
  const tokenEnd = pos => { while (pos < text.length && !/[\s\0()[\]<>/%]/.test(text[pos])) pos++; return pos; };
  const valueEnd = (pos, depth = 0) => {
    if (depth > 32) fail(); pos = skip(pos);
    if (text.startsWith('<<', pos)) {
      pos += 2;
      for (;;) { pos = skip(pos); if (text.startsWith('>>', pos)) return pos + 2; if (text[pos] !== '/') fail(); pos = valueEnd(tokenEnd(pos + 1), depth + 1); }
    }
    if (text[pos] === '[') { pos++; for (;;) { pos = skip(pos); if (text[pos] === ']') return pos + 1; pos = valueEnd(pos, depth + 1); } }
    if (text[pos] === '(') {
      let nesting = 1; pos++;
      while (pos < text.length && nesting) { const c = text[pos++]; if (c === '\\') pos++; else if (c === '(') nesting++; else if (c === ')') nesting--; }
      if (nesting) fail(); return pos;
    }
    if (text[pos] === '<') { const close = text.indexOf('>', pos + 1); if (close < 0) fail(); return close + 1; }
    if (text[pos] === '/') return tokenEnd(pos + 1);
    const first = tokenEnd(pos); if (first === pos) fail();
    const reference = /^\d+\s+\d+\s+R\b/.exec(text.slice(pos)); return reference ? pos + reference[0].length : first;
  };
  const dictionary = pos => {
    pos = skip(pos); if (!text.startsWith('<<', pos)) fail();
    const start = pos, fields = new Map(); pos += 2;
    for (;;) {
      pos = skip(pos); if (text.startsWith('>>', pos)) return {start, end: pos + 2, fields};
      if (text[pos] !== '/') fail();
      const keyStart = pos, keyEnd = tokenEnd(pos + 1), name = text.slice(pos + 1, keyEnd);
      if (fields.has(name)) fail();
      const from = skip(keyEnd), end = valueEnd(from);
      fields.set(name, {start: keyStart, from, end, value: text.slice(from, end)}); pos = end;
    }
  };
  const trailer = dictionary(at), rootRef = /^(\d+)\s+(\d+)\s+R$/.exec(trailer.fields.get('Root')?.value || '');
  const size = Number(trailer.fields.get('Size')?.value), rootId = Number(rootRef?.[1]), generation = Number(rootRef?.[2]);
  let highest = 0; for (const id of offsets.keys()) highest = Math.max(highest, id);
  if (!rootRef || !Number.isSafeInteger(size) || size <= highest || trailer.fields.has('Encrypt') || trailer.fields.has('Prev')) fail();
  const readDictionary = (id, gen) => {
    const place = offsets.get(id); if (!place || place.generation !== gen) fail();
    const header = new RegExp('^' + id + '\\s+' + gen + '\\s+obj\\b').exec(text.slice(place.at)); if (!header) fail();
    return dictionary(place.at + header[0].length);
  };
  const root = readDictionary(rootId, generation);
  return {bytes, text, offsets, root, rootId, generation, trailer, size, xref, readDictionary, dictionary, fail};
}

export function readPdfPageCount(input) {
  const {root, readDictionary, fail} = pdfStructure(input);
  const reference = /^(\d+)\s+(\d+)\s+R$/.exec(root.fields.get('Pages')?.value || '');
  if (!reference) fail();
  const pages = readDictionary(Number(reference[1]), Number(reference[2])), count = Number(pages.fields.get('Count')?.value);
  if (pages.fields.get('Type')?.value !== '/Pages' || !Number.isSafeInteger(count) || count < 1) fail();
  return count;
}

export async function attachPdfSource(input, {source, filename, maxBytes = Infinity, check = () => {}}) {
  const {bytes, text, offsets, root, rootId, generation, trailer, size, readDictionary, dictionary, fail} = pdfStructure(input);
  if (typeof source !== 'string' || typeof filename !== 'string' || !filename) fail();
  const ascii = value => Uint8Array.from(value, character => character.charCodeAt(0));
  const encode = new TextEncoder(), hex = value => Array.from({length: value.length}, (_, i) => value.charCodeAt(i).toString(16).padStart(4, '0')).join('');
  if (root.fields.get('Type')?.value !== '/Catalog' || root.fields.has('AF')) fail();
  let names = '<<', remove = root.fields.get('Names');
  if (remove) {
    const ref = /^(\d+)\s+(\d+)\s+R$/.exec(remove.value);
    const held = ref ? readDictionary(Number(ref[1]), Number(ref[2])) : dictionary(remove.from);
    if (held.fields.has('EmbeddedFiles')) fail();
    names = text.slice(held.start, held.end - 2);
  }
  const original = remove ? text.slice(root.start, remove.start) + text.slice(remove.end, root.end - 2) : text.slice(root.start, root.end - 2);
  const payload = encode.encode(source); check();
  const compressed = new Uint8Array(await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); check();
  const fileId = size, streamId = size + 1, infoId = size + 2, totalSize = size + 3;
  let infoBody = '<< /Producer (Rapier) >>';
  const existingInfo = trailer.fields.get('Info');
  if (existingInfo) {
    const ref = /^(\d+)\s+(\d+)\s+R$/.exec(existingInfo.value);
    const held = ref ? readDictionary(Number(ref[1]), Number(ref[2])) : dictionary(existingInfo.from);
    const producer = held.fields.get('Producer');
    const kept = producer ? text.slice(held.start, producer.start) + text.slice(producer.end, held.end - 2) : text.slice(held.start, held.end - 2);
    infoBody = kept + ' /Producer (Rapier) >>';
  }
  const escaped = '(' + filename.replace(/[^\x20-\x7e]/g, '_').replace(/[\\()]/g, '\\$&') + ')';
  const parts = [bytes, ascii('\n')], merged = new Map(offsets);
  let length = bytes.length + 1;
  const append = (id, gen, chunks) => { merged.set(id, {at: length, generation: gen}); const body = [ascii(id + ' ' + gen + ' obj\n'), ...chunks, ascii('\nendobj\n')]; for (const chunk of body) {parts.push(chunk); length += chunk.length;} };
  append(rootId, generation, [ascii(original + ' /Names ' + names + ' /EmbeddedFiles << /Names [<feff' + hex(filename) + '> ' + fileId + ' 0 R] >> >> /AF [' + fileId + ' 0 R] >>')]);
  append(fileId, 0, [ascii('<< /Type /Filespec /F ' + escaped + ' /UF <feff' + hex(filename) + '> /AFRelationship /Source /EF << /F ' + streamId + ' 0 R /UF ' + streamId + ' 0 R >> >>')]);
  append(streamId, 0, [ascii('<< /Type /EmbeddedFile /Subtype /text#2Fmarkdown /Params << /Size ' + payload.length + ' >> /Filter /FlateDecode /Length ' + compressed.length + ' >>\nstream\n'), compressed, ascii('\nendstream')]);
  append(infoId, 0, [ascii(infoBody)]);
  let table = 'xref\n0 ' + totalSize + '\n0000000000 65535 f \n';
  for (let id = 1; id < totalSize; id++) {
    const place = merged.get(id);
    table += place ? String(place.at).padStart(10, '0') + ' ' + String(place.generation).padStart(5, '0') + ' n \n' : '0000000000 00000 f \n';
  }
  const identity = trailer.fields.get('ID');
  table += 'trailer\n<< /Size ' + totalSize + ' /Root ' + rootId + ' ' + generation + ' R /Info ' + infoId + ' 0 R' + (identity ? ' /ID ' + identity.value : '') + ' >>\nstartxref\n' + length + '\n%%EOF\n';
  parts.push(ascii(table)); length += table.length;
  if (length > maxBytes) throw Object.assign(new Error('The exported file exceeds the file limit.'), {code: 'export_too_large'});
  const result = new Uint8Array(length); let at = 0;
  for (const chunk of parts) { result.set(chunk, at); at += chunk.length; }
  check(); return result;
}
