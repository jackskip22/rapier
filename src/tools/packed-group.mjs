// SPDX-License-Identifier: AGPL-3.0-only
import {gunzipSync, gzipSync, brotliDecompressSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {zopfliGzip, brotliPack} from './zopfli.mjs';
import {encodeTextPack} from './text-pack-build.mjs';
import {decodeBrotli} from '../draw/font-brotli.mjs';
import {encodeBase124, decodeBase124} from './base124.mjs';
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

export function createGroupPacker(packedRecord = []) {
  const packings = new Map();
  const checksum = value => createHash('sha256').update(value).digest('hex');
  function candidatePacking(id, combined) {
    const key = id + '\0' + checksum(combined);
    if (!packings.has(key)) {
      const words = encodeTextPack(combined);
      if (words && !Buffer.from(decodeTextPack(words, combined.length)).equals(combined)) throw new Error('Word packing changed ' + id);
      const bootstrap = id === 'rapier-codec-runtime' || id === 'rapier-phone-bench-runtime';
      const inputs = [[combined, ''], ...(words ? [[words, ' prefilter=words2']] : [])];
      packings.set(key, Promise.all(inputs.map(async ([input, prefilter]) => {
        const brotli = bootstrap ? null : await brotliPack(input);
        const gzip = brotli && brotli.length < 0.85 * gzipSync(input, {level: 9}).length ? null : await zopfliGzip(input);
        return {input, prefilter, gzip, brotli};
      })));
    }
    return packings.get(key);
  }
  function prepack(id, type, spans) {
    try { candidatePacking(id, Buffer.concat(spans.map(({source}) => Buffer.from(source)))).catch(() => {}); } catch (_) {}
    return '';
  }
  async function packedSpans(id, type, spans) {
    let out = `<script type="${type}" id="${id}">\n`;
    const buffers = spans.map(({source}) => Buffer.from(source));
    for (const [i, bytes] of buffers.entries()) packedRecord.push({element: id, name: spans[i].name, bytes: bytes.length, sha256: checksum(bytes)});
    const combined = Buffer.concat(buffers);
    let selected = null;
    for (const {input, prefilter, gzip, brotli} of await candidatePacking(id, combined)) {
      const candidates = gzip ? [['gzip', gzip]] : [];
      if (brotli) {
        if (!Buffer.from(decodeBrotli(brotli, input.length)).equals(input)) throw new Error('Brotli packing changed ' + id);
        candidates.push(['brotli', brotli]);
      }
      for (const [compression, packed] of candidates) {
        const metadata = compression === 'brotli' ? ' inflated=' + input.length + ' crc32=' + crc32(combined).toString(16).padStart(8, '0') : '';
        const stored = encodeBase124(packed);
        const body = `/* RAPIER_VENDOR_GROUP bytes=${combined.length} stored=${compression}+base124${metadata}${prefilter} */\n` + stored + `\n/* RAPIER_VENDOR_GROUP_END */\n`;
        if (selected === null || Buffer.byteLength(body) < Buffer.byteLength(selected)) selected = body;
      }
    }
    out += selected;
    let offset = 0;
    for (let i = 0; i < spans.length; i++) {
      out += `/* RAPIER_VENDOR_SPAN ${spans[i].name} offset=${offset} bytes=${buffers[i].length} */\n`;
      offset += buffers[i].length;
    }
    return out + '/* RAPIER_VENDOR_SPANS_END */\n</script>\n';
  }
  return {pack: packedSpans, prepack};
}
