// SPDX-License-Identifier: AGPL-3.0-only
// ASCII words may occur in code or strings: substitution is undone byte-for-byte before parsing.
// The most common 96 words take one byte; the rest take two, ordered by spelling so related
// identifiers share a high byte. ASCII stays literal; DEL escapes a source byte >= 127. Native gzip remains
// the entropy coder. Dictionary and output bounds agree with the one browser/Node decoder.
export function encodeTextPack(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 64 * 1024 * 1024) throw new Error('text_pack_bytes_invalid');
  const pattern = /[A-Za-z_$][A-Za-z0-9_$]*/g, text = bytes.toString('latin1'), counts = new Map();
  for (const match of text.matchAll(pattern)) if (match[0].length >= 4 && match[0].length <= 1024) counts.set(match[0], (counts.get(match[0]) || 0) + 1);
  const candidates = [...counts].filter(([word, count]) => count > 1 && (word.length - 3) * count > word.length + 1)
    .sort((a, b) => b[1] - a[1]);
  const dictionary = []; let size = 0;
  for (const [word] of candidates) {
    if (dictionary.length === 8192 || size + word.length + (dictionary.length ? 1 : 0) > 1024 * 1024) break;
    size += word.length + (dictionary.length ? 1 : 0); dictionary.push(word);
  }
  if (!dictionary.length) return null;
  dictionary.splice(96, dictionary.length - 96, ...dictionary.slice(96).sort());
  const ids = new Map(dictionary.map((word, index) => [word, index])), header = Buffer.from(dictionary.join('\n'));
  const out = Buffer.alloc(bytes.length * 2 + header.length + 12);
  out.write('RPD2'); out.writeUInt32LE(header.length, 4); out.writeUInt32LE(bytes.length, 8); header.copy(out, 12);
  let at = header.length + 12, last = 0;
  const copy = (start, end) => {
    for (let index = start; index < end; index++) {
      if (bytes[index] >= 127) out[at++] = 127;
      out[at++] = bytes[index];
    }
  };
  for (const match of text.matchAll(pattern)) {
    const id = ids.get(match[0]); if (id === undefined) continue;
    copy(last, match.index);
    if (id < 96) out[at++] = 128 + id;
    else { out[at++] = 224 + ((id - 96) & 31); out[at++] = (id - 96) >>> 5; }
    last = match.index + match[0].length;
  }
  copy(last, bytes.length);
  return out.subarray(0, at);
}
