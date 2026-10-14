// SPDX-License-Identifier: AGPL-3.0-only
import {createHash} from 'node:crypto';
import {lstat, readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const digestRecords = records => sha256(JSON.stringify(records));

export async function treeRecords(root, {exclude = []} = {}) {
  if (!(await lstat(root)).isDirectory()) throw new Error('refused: a release tree must be a regular directory');
  const records = [];
  async function visit(directory, prefix = '') {
    for (const name of (await readdir(directory)).sort()) {
      if (!prefix && exclude.includes(name)) continue;
      const path = join(directory, name), relative = prefix + name, entry = await lstat(path);
      if (entry.isDirectory()) await visit(path, relative + '/');
      else if (entry.isFile()) {
        const bytes = await readFile(path);
        records.push([relative, entry.mode & 0o111 ? 0o755 : 0o644, bytes.length, sha256(bytes)]);
      } else throw new Error('refused: a release tree contains a symlink or non-file: ' + relative);
    }
  }
  await visit(root);
  records.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return records;
}

export async function treeDigest(root, options) { return digestRecords(await treeRecords(root, options)); }
