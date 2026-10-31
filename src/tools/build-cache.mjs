// SPDX-License-Identifier: AGPL-3.0-only
// across profiles and builds. The cache is dist/cache/build; RAPIER_PACK_CACHE=<absolute path> puts it elsewhere (the
// release stager's) and RAPIER_PACK_CACHE=off turns it off. An entry is used only when it passes its caller's check.
import {createHash, randomBytes} from 'node:crypto';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {dirname, isAbsolute, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stripperFor} from './strip-comments.mjs';
import {unobservedBuildIO} from './build-reuse.mjs';

const setting = process.env.RAPIER_PACK_CACHE;
export const BUILD_CACHE = setting === 'off' ? null : setting || fileURLToPath(new URL('../dist/cache/build/', import.meta.url));
if (BUILD_CACHE && !isAbsolute(BUILD_CACHE)) throw new Error('RAPIER_PACK_CACHE must be an absolute path or off');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

let runtime = null;
export const runtimeIdentity = () => runtime ||= unobservedBuildIO(() => readFile(process.execPath)).then(bytes =>
  sha256(JSON.stringify({node: process.versions, executable: sha256(bytes), platform: process.platform, arch: process.arch})));

export async function codeIdentity(urls, {stripComments = false} = {}) {
  const seen = new Map(), queue = urls.map(url => fileURLToPath(url));
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    const bytes = await unobservedBuildIO(() => readFile(path)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    const strip = stripComments && stripperFor(relative(ROOT, path));
    const source = bytes && (strip ? strip(bytes.toString('utf8')) : bytes);
    seen.set(path, bytes === null ? null : sha256(source));
    if (!bytes) continue;
    if (!/\.(?:mjs|cjs|js)$/.test(path)) continue;
    for (const [, local] of source.toString('utf8').matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*|\)\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g))
      queue.push(resolve(dirname(path), local));
  }
  return sha256(JSON.stringify([...seen].map(([path, digest]) => [relative(ROOT, path), digest]).sort()));
}

export async function cachedRecord(key, accept) {
  if (!BUILD_CACHE) return null;
  try {
    const record = JSON.parse(await unobservedBuildIO(() => readFile(join(BUILD_CACHE, key + '.json'), 'utf8')));
    if (record.key === key && accept(record)) return record;
  } catch (_) {  }
  return null;
}
export async function keepRecord(key, record, before = async () => {}) {
  if (!BUILD_CACHE) return;
  await unobservedBuildIO(async () => {
    const path = join(BUILD_CACHE, key + '.json'), temporary = path + '.' + randomBytes(8).toString('hex') + '.tmp';
    await mkdir(BUILD_CACHE, {recursive: true});
    try {
      await writeFile(temporary, JSON.stringify({key, ...record}) + '\n', {flag: 'wx'});
      await before();
      await rename(temporary, path);
    } finally { await rm(temporary, {force: true}); }
  });
}
