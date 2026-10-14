import {gzipSync, gunzipSync} from 'node:zlib';
// The build's one compressor: Zopfli (tools/vendor/zopfli, Apache-2.0), plain gzip DecompressionStream decodes. Deterministic.
import {createRequire} from 'node:module';
import {createHash, randomBytes} from 'node:crypto';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {isAbsolute, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {treeDigest} from './release-digest.mjs';

const require = createRequire(import.meta.url);
let _zopfli = null;
const zopfli = () => _zopfli || (_zopfli = require('./vendor/zopfli/index.js'));

// RAPIER_PACK=fast packs with zlib for iteration (seconds, not minutes); never a release: the
export const FAST_PACK = process.env.RAPIER_PACK === 'fast';
const OPTIONS = {numiterations: 15, blocksplittingmax: 0};
const cache = process.env.RAPIER_PACK_CACHE || null;
if (cache && !isAbsolute(cache)) throw new Error('RAPIER_PACK_CACHE must be an absolute path');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
let identity = null, sources = null, changed = null;
async function compressorSources() {
  const vendor = await treeDigest(fileURLToPath(new URL('./vendor/zopfli/', import.meta.url)));
  return sha256(JSON.stringify({wrapper: sha256(await readFile(new URL(import.meta.url))), vendor, options: OPTIONS,
    digest: sha256(await readFile(new URL('./release-digest.mjs', import.meta.url)))}));
}
async function unchanged(initial) {
  if (changed) throw changed;
  try {
    if (await compressorSources() !== initial) throw new Error('compressor source changed');
    if (changed) throw changed;
  } catch (error) {
    changed ||= new Error('Zopfli source changed during packing; restart with stable sources', {cause: error});
    throw changed;
  }
}
async function compressorIdentity(source) {
  return sha256(JSON.stringify({source,
    node: process.versions, executable: sha256(await readFile(process.execPath)), platform: process.platform, arch: process.arch}));
}
export async function zopfliGzip(bytes) {
  const input = Buffer.from(bytes);
  if (FAST_PACK) return gzipSync(input, {level: 9, mtime: 0});
  const initial = await (sources ||= compressorSources());
  const key = cache ? sha256((await (identity ||= compressorIdentity(initial))) + ':' + sha256(input)) : null;
  const path = cache && join(cache, key + '.json');
  if (path) {
    let cached = null;
    try {
      const record = JSON.parse(await readFile(path, 'utf8')), gzip = Buffer.from(record.gzip, 'base64');
      if (record.key === key && record.bytes === gzip.length && record.sha256 === sha256(gzip) &&
          gunzipSync(gzip, {maxOutputLength: Math.max(1, input.length)}).equals(input)) cached = gzip;
    } catch (_) {  }
    if (cached) { await unchanged(initial); return cached; }
  }
  await unchanged(initial);
  const out = await zopfli().gzipAsync(input, OPTIONS);
  const gzip = Buffer.from(out);
  if (gzip[0] !== 0x1f || gzip[1] !== 0x8b) throw new Error('Zopfli did not produce a gzip stream');
  if (path) {
    if (!gunzipSync(gzip, {maxOutputLength: Math.max(1, input.length)}).equals(input)) throw new Error('Zopfli changed the packed bytes');
    await mkdir(cache, {recursive: true});
    const temporary = path + '.' + randomBytes(8).toString('hex') + '.tmp';
    try {
      await writeFile(temporary, JSON.stringify({key, bytes: gzip.length, sha256: sha256(gzip), gzip: gzip.toString('base64')}) + '\n', {flag: 'wx'});
      await unchanged(initial);
      await rename(temporary, path);
    } finally { await rm(temporary, {force: true}); }
  } else await unchanged(initial);
  return gzip;
}
