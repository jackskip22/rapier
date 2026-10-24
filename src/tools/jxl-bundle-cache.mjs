// SPDX-License-Identifier: AGPL-3.0-only
import {mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {BUILD_CACHE, sha256} from './build-cache.mjs';
import {unobservedBuildIO} from './build-reuse.mjs';

const directory = BUILD_CACHE && process.env.RAPIER_JXL_BUNDLE_CACHE !== 'off' ? join(BUILD_CACHE, 'jxl-bundles') : null;
const counters = {hits: 0, computed: 0, damaged: 0, writeErrors: 0};
export const bundleCacheStats = () => ({...counters});
const payload = value => [value.bytes.toString('base64'), value.gzip, value.brotli, value.compress];
const checksum = (key, value) => sha256(JSON.stringify([key, value]));

export function cachedBundle(key, produce) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('invalid bundle cache key');
  const path = directory && join(directory, key + '.json');
  if (path) {
    try {
      const record = JSON.parse(unobservedBuildIO(() => readFileSync(path, 'utf8')));
      const value = record.value;
      if (record.key !== key || record.schema !== 1 || !Array.isArray(value) || value.length !== 4 ||
          typeof value[0] !== 'string' || !Number.isSafeInteger(value[1]) || value[1] < 0 ||
          !Number.isSafeInteger(value[2]) || value[2] < 0 || !value[3] || typeof value[3] !== 'object' ||
          checksum(key, value) !== record.checksum) throw new Error('damaged bundle cache');
      const bytes = Buffer.from(value[0], 'base64');
      if (!bytes.length || bytes.toString('base64') !== value[0]) throw new Error('damaged bundle bytes');
      counters.hits++;
      return {bytes, gzip: value[1], brotli: value[2], compress: value[3]};
    } catch (error) { if (error.code !== 'ENOENT') counters.damaged++; }
  }
  counters.computed++;
  const result = produce();
  if (path) {
    const value = payload(result);
    unobservedBuildIO(() => {
      const temporary = path + '.' + randomBytes(8).toString('hex') + '.tmp';
      try {
        mkdirSync(directory, {recursive: true});
        writeFileSync(temporary, JSON.stringify({schema: 1, key, value, checksum: checksum(key, value)}) + '\n', {flag: 'wx'});
        renameSync(temporary, path);
      } catch { counters.writeErrors++; }
      finally { try { rmSync(temporary, {force: true}); } catch {} }
    });
  }
  return result;
}
