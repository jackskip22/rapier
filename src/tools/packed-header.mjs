// SPDX-License-Identifier: AGPL-3.0-only
export function packedHeader(text) {
  const marker = /\/\* RAPIER_VENDOR_GROUP bytes=(\d+) stored=(gzip|brotli)\+base124(?: inflated=(\d+) crc32=([0-9a-f]{8}))?(?: prefilter=([a-z0-9]+))? \*\//.exec(text);
  const fail = () => { throw new Error('Packed header is invalid'); };
  if (!marker) fail();
  const bytes = Number(marker[1]), compression = marker[2], prefilter = marker[5] || '';
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 64 * 1024 * 1024 || prefilter && prefilter !== 'words2') fail();
  if ((compression === 'brotli') !== (marker[3] !== undefined)) fail();
  const inflated = marker[3] === undefined ? null : Number(marker[3]);
  const limit = prefilter ? Math.min(128 * 1024 * 1024, bytes * 2 + 1024 * 1024 + 12) : bytes;
  if (inflated !== null && (!Number.isSafeInteger(inflated) || inflated < 0 || inflated > limit || !prefilter && inflated !== bytes)) fail();
  const from = marker.index + marker[0].length + 1;
  const to = text.indexOf('\n/* RAPIER_VENDOR_GROUP_END */', from);
  if (text[from - 1] !== '\n' || to < from) throw new Error('Packed resource is incomplete');
  return {bytes, compression, prefilter, inflated, crc32: marker[4] === undefined ? null : parseInt(marker[4], 16), limit, from, to};
}
