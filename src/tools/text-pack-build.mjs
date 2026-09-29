// SPDX-License-Identifier: AGPL-3.0-only
// ASCII words may occur in code or strings: substitution is undone byte-for-byte before parsing.
// Frequency-ranked ids keep the most common 127 words to two stored bytes. Native gzip remains
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
  const ids = new Map(dictionary.map((word, index) => [word, index + 1])), header = Buffer.from(dictionary.join('\n'));
  const out = Buffer.alloc(bytes.length * 2 + header.length + 12);
  out.write('RPD1'); out.writeUInt32LE(header.length, 4); out.writeUInt32LE(bytes.length, 8); header.copy(out, 12);
  let at = header.length + 12, last = 0;
  const hasZero = bytes.includes(0);
  const copy = (start, end) => {
    if (!hasZero) { bytes.copy(out, at, start, end); at += end - start; }
    else for (let index = start; index < end; index++) { out[at++] = bytes[index]; if (!bytes[index]) out[at++] = 0; }
  };
  for (const match of text.matchAll(pattern)) {
    let id = ids.get(match[0]); if (!id) continue;
    copy(last, match.index); out[at++] = 0;
    do { const low = id & 127; id >>>= 7; out[at++] = low | (id ? 128 : 0); } while (id);
    last = match.index + match[0].length;
  }
  copy(last, bytes.length);
  return out.subarray(0, at);
}
