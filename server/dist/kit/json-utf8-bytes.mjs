// SPDX-License-Identifier: AGPL-3.0-only
export function jsonUtf8Bytes(value, limit = Infinity) {
  if (value === null) return 4;
  if (typeof value === 'boolean') return value ? 4 : 5;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value).length : 4;
  if (typeof value === 'string') {
    let bytes = 2;
    for (let index = 0; index < value.length && bytes <= limit; index++) {
      const code = value.charCodeAt(index);
      if (code < 0x20) bytes += [8, 9, 10, 12, 13].includes(code) ? 2 : 6;
      else if (code === 34 || code === 92) bytes += 2;
      else if (code < 0x80) bytes++;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {bytes += 4; index++;}
      else bytes += code >= 0xd800 && code <= 0xdfff ? 6 : 3;
    }
    return bytes;
  }
  let bytes = 2;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length && bytes <= limit; index++) {
      const item = value[index];
      bytes += (index ? 1 : 0) + (item === undefined ? 4 : jsonUtf8Bytes(item, limit - bytes));
    }
    return bytes;
  }
  let first = true;
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (item === undefined) continue;
    bytes += (first ? 0 : 1) + jsonUtf8Bytes(key, limit - bytes) + 1 + jsonUtf8Bytes(item, limit - bytes);
    first = false;
    if (bytes > limit) break;
  }
  return bytes;
}
