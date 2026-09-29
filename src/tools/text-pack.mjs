// SPDX-License-Identifier: AGPL-3.0-only
// Reversible word substitution before native gzip. This decoder is also inlined into the shell;
// it has no imports or free bindings, so the shipped and diagnostic readers use the same owner.
export function decodeTextPack(bytes, expectedBytes) {
  const fail = () => { throw new Error('text_pack_invalid'); };
  if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > 64 * 1024 * 1024 || bytes.length < 12) fail();
  if (bytes[0] !== 82 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 49) fail();
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
    if (at - start < 4 || at - start > 1024 || words.length >= 32767) fail();
    const word = bytes.subarray(start, at), key = String.fromCharCode(...word);
    if (unique.has(key)) fail();
    unique.add(key); words.push(word); start = at + 1;
  }
  const out = new Uint8Array(expectedBytes);
  let written = 0, at = end;
  while (at < bytes.length) {
    while (at < bytes.length && bytes[at] !== 0) {
      if (written >= expectedBytes) fail();
      out[written++] = bytes[at++];
    }
    if (at === bytes.length) break;
    at++;
    let id = 0, shift = 0, byte;
    do {
      if (at >= bytes.length || shift > 14) fail();
      byte = bytes[at++]; id += (byte & 127) * 2 ** shift;
      if (!(byte & 128) && shift && byte === 0) fail();
      shift += 7;
    } while (byte & 128);
    if (id > words.length) fail();
    if (!id) {
      if (written >= expectedBytes) fail();
      out[written++] = 0;
    } else {
      const word = words[id - 1];
      if (word.length > expectedBytes - written) fail();
      out.set(word, written); written += word.length;
    }
  }
  if (written !== expectedBytes) fail();
  return out;
}
