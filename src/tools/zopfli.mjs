import {gzipSync, gunzipSync, brotliCompress, brotliDecompressSync, constants as brotliOptions} from 'node:zlib';
// The build's compressors: Zopfli (tools/vendor/zopfli, Apache-2.0), which plain gzip DecompressionStream decodes, and
import {readFile} from 'node:fs/promises';
import {availableParallelism} from 'node:os';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {treeDigest} from './release-digest.mjs';
import {unobservedBuildIO} from './build-reuse.mjs';
import {BUILD_CACHE as cache, cachedRecord, keepRecord, runtimeIdentity, sha256} from './build-cache.mjs';

const VENDOR = fileURLToPath(new URL('./vendor/zopfli/index.js', import.meta.url));

// RAPIER_PACK=fast packs with zlib for iteration (seconds, not minutes); never a release: the
export const FAST_PACK = process.env.RAPIER_PACK === 'fast';
const OPTIONS = {numiterations: 15, blocksplittingmax: 0};
const BROTLI = {quality: FAST_PACK ? 5 : 11, mode: 'text', lgwin: 22};
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
  return sha256(JSON.stringify({source, runtime: await runtimeIdentity()}));
}

async function cached(key, decodes) {
  const record = await cachedRecord(key, record => {
    const bytes = Buffer.from(record.gzip, 'base64');
    return record.bytes === bytes.length && record.sha256 === sha256(bytes) && decodes(bytes);
  });
  return record && Buffer.from(record.gzip, 'base64');
}
const keep = (key, bytes, before) => keepRecord(key, {bytes: bytes.length, sha256: sha256(bytes), gzip: bytes.toString('base64')}, before);

const workers = [], waiting = [];
let taskId = 0;
function zopfliWorker() {
  const idle = workers.find(row => !row.busy);
  if (idle) { idle.busy = true; return Promise.resolve(idle); }
  if (workers.length < Math.max(1, Math.min(availableParallelism(), 4))) {
    const worker = unobservedBuildIO(() => new Worker(`const {parentPort, workerData} = require('node:worker_threads'), zopfli = require(workerData);
parentPort.on('message', ({id, input, options}) => zopfli.gzipAsync(input, options).then(out => parentPort.postMessage({id, out}), error => parentPort.postMessage({id, error: String(error && error.stack || error)})));`, {eval: true, workerData: VENDOR}));
    const row = {worker, busy: true};
    worker.unref();
    workers.push(row);
    return Promise.resolve(row);
  }
  return new Promise(resolve => waiting.push(resolve));
}
async function zopfliInWorker(input) {
  const row = await zopfliWorker(), id = ++taskId;
  row.worker.ref();
  try {
    return await new Promise((resolve, reject) => {
      const answer = message => { if (message.id !== id) return; row.worker.off('message', answer); row.worker.off('error', reject); message.error ? reject(new Error(message.error)) : resolve(Buffer.from(message.out)); };
      row.worker.on('message', answer); row.worker.once('error', reject);
      row.worker.postMessage({id, input, options: OPTIONS});
    });
  } finally {
    const next = waiting.shift();
    if (next) next(row);
    else { row.busy = false; row.worker.unref(); }
  }
}

export async function zopfliGzip(bytes) {
  const input = Buffer.from(bytes);
  if (FAST_PACK) return gzipSync(input, {level: 9, mtime: 0});
  const initial = await (sources ||= compressorSources());
  const key = cache ? sha256((await (identity ||= compressorIdentity(initial))) + ':' + sha256(input)) : null;
  const decodes = gzip => gunzipSync(gzip, {maxOutputLength: Math.max(1, input.length)}).equals(input);
  if (key) {
    const hit = await cached(key, decodes);
    if (hit) { await unchanged(initial); return hit; }
  }
  await unchanged(initial);
  const gzip = await zopfliInWorker(input);
  if (gzip[0] !== 0x1f || gzip[1] !== 0x8b) throw new Error('Zopfli did not produce a gzip stream');
  if (key) {
    if (!decodes(gzip)) throw new Error('Zopfli changed the packed bytes');
    await keep(key, gzip, () => unchanged(initial));
  } else await unchanged(initial);
  return gzip;
}

// Brotli in text mode with a 4 MiB window; quality 11 for a release, 5 for RAPIER_PACK=fast.
export const BROTLI_SETTINGS = Object.freeze(BROTLI);
export async function brotliPack(bytes) {
  const input = Buffer.from(bytes);
  const params = {[brotliOptions.BROTLI_PARAM_QUALITY]: BROTLI.quality, [brotliOptions.BROTLI_PARAM_MODE]: brotliOptions.BROTLI_MODE_TEXT,
    [brotliOptions.BROTLI_PARAM_LGWIN]: BROTLI.lgwin};
  const key = cache && !FAST_PACK ? sha256(JSON.stringify({brotli: BROTLI, runtime: await runtimeIdentity(), input: sha256(input)})) : null;
  const decodes = packed => brotliDecompressSync(packed, {maxOutputLength: Math.max(1, input.length)}).equals(input);
  if (key) { const hit = await cached(key, decodes); if (hit) return hit; }
  const packed = await new Promise((resolve, reject) => brotliCompress(input, {params}, (error, out) => error ? reject(error) : resolve(out)));
  if (key) await keep(key, packed);
  return packed;
}
