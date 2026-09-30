// SPDX-License-Identifier: AGPL-3.0-only
// Reversible word substitution before native gzip. This decoder is also inlined into the shell;
// it has no imports or free bindings, so the shipped and diagnostic readers use the same owner.
export function decodeTextPack(bytes, expectedBytes) {
  const fail = () => { throw new Error('text_pack_invalid'); };
  if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > 64 * 1024 * 1024 || bytes.length < 12) fail();
  if (bytes[0] !== 82 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 50) fail();
  const header = new DataView(bytes.buffer, bytes.byteOffset, 12), dictionaryBytes = header.getUint32(4, true), originalBytes = header.getUint32(8, true);
  if (originalBytes !== expectedBytes || !dictionaryBytes || dictionaryBytes > 1024 * 1024 || dictionaryBytes > bytes.length - 12 || bytes.length > expectedBytes * 2 + dictionaryBytes + 12) fail();
  const end = 12 + dictionaryBytes, words = [], unique = new Set();
  let start = 12;
  for (let at = 12; at <= end; at++) {
    const byte = bytes[at];
    if (at < end && byte !== 10) {
      if (!(byte >= 65 && byte <= 90 || byte >= 97 && byte <= 122 || byte === 95 || byte === 36 || at > start && byte >= 48 && byte <= 57)) fail();
      continue;
    }
    if (at - start < 4 || at - start > 1024 || words.length >= 96 + 32 * 256) fail();
    const word = bytes.subarray(start, at), key = String.fromCharCode(...word);
    if (unique.has(key)) fail();
    unique.add(key); words.push(word); start = at + 1;
  }
  const out = new Uint8Array(expectedBytes);
  let written = 0, at = end;
  while (at < bytes.length) {
    while (at < bytes.length && bytes[at] < 127) {
      if (written >= expectedBytes) fail();
      out[written++] = bytes[at++];
    }
    if (at === bytes.length) break;
    const byte = bytes[at++];
    if (byte === 127) {
      if (at >= bytes.length || bytes[at] < 127 || written >= expectedBytes) fail();
      out[written++] = bytes[at++];
    } else {
      let id = byte - 128;
      if (byte >= 224) {
        if (at >= bytes.length) fail();
        id = 96 + byte - 224 + bytes[at++] * 32;
      }
      if (id >= words.length) fail();
      const word = words[id];
      if (word.length > expectedBytes - written) fail();
      out.set(word, written); written += word.length;
    }
  }
  if (written !== expectedBytes) fail();
  return out;
}
