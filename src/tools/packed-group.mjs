// SPDX-License-Identifier: AGPL-3.0-only
import {gunzipSync, brotliDecompressSync} from 'node:zlib';
import {decodeBase124} from './base124.mjs';
import {decodeTextPack} from './text-pack.mjs';
import {packedHeader, packedPlainText} from './packed-header.mjs';
import {crc32} from '../images/crc32.mjs';

export function unpackGroup(text) {
  const record = packedHeader(text);
  if (record.compression === 'plain') {
    const bytes = Buffer.from(packedPlainText(text.slice(record.from, record.to)), 'utf8');
    if (bytes.length !== record.bytes) throw new Error('Packed content differs');
    return {...record, bytes, packedBytes: bytes.length};
  }
  const packed = Buffer.from(decodeBase124(text.slice(record.from, record.to), {maxBytes: 64 * 1024 * 1024}));
  const inflate = record.compression === 'gzip' ? gunzipSync : brotliDecompressSync;
  const inflated = inflate(packed, {maxOutputLength: Math.max(1, record.inflated ?? record.limit)});
  if (record.inflated !== null && inflated.length !== record.inflated) throw new Error('Packed intermediate length differs');
  const bytes = record.prefilter ? Buffer.from(decodeTextPack(inflated, record.bytes)) : inflated;
  if (bytes.length !== record.bytes || record.crc32 !== null && crc32(bytes) !== record.crc32) throw new Error('Packed content differs');
  return {...record, bytes, packedBytes: packed.length};
}
