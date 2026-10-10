#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// npx rapier-embed plugins <directory> [--build reader|document|full] [--only name,name] [--from <address>] [--manifest <file or address>] [--check]
//
// Fetches Rapier's plug-in files into one directory and verifies each against the manifest's length and SHA-384, so the reader and the
// editors can load them from your own origin (`plugins: '/that/directory/'`). `--build` keeps the files that build uses. A file already
// there with the right SHA-384 is kept. Exit status 1 when any file is missing or fails verification; nothing unverified is left in
// the directory.
import {createHash, randomBytes} from 'node:crypto';
import {constants} from 'node:fs';
import {mkdir, lstat, open, realpath, rename, rm} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const BUILDS = ['reader', 'document', 'full'];
const MANIFEST_BYTES = 1024 * 1024, FILE_BYTES = 64 * 1024 * 1024, TOTAL_BYTES = 512 * 1024 * 1024;
const NOFOLLOW = constants.O_NOFOLLOW || 0;
const usage = 'usage: rapier-embed plugins <directory> [--build reader|document|full] [--only name,name] [--from <address>] [--manifest <file or address>] [--check]';

function arguments_(argv) {
  const [command, directory, ...rest] = argv, options = {};
  if (command !== 'plugins' || !directory || directory.startsWith('--')) throw new Error(usage);
  for (let at = 0; at < rest.length; at++) {
    const name = rest[at];
    if (name === '--check') options.check = true;
    else if (['--build', '--only', '--from', '--manifest'].includes(name) && rest[at + 1] !== undefined) options[name.slice(2)] = rest[++at];
    else throw new Error(usage);
  }
  if (options.build !== undefined && !BUILDS.includes(options.build)) throw new Error('--build is ' + BUILDS.join(', ') + ' (the page that will read the directory)');
  return {directory: resolve(directory), ...options};
}

async function readManifest(source) {
  const own = fileURLToPath(new URL('./rapier-plugins.json', import.meta.url));
  // The packaged manifest is the version's authority; a missing copy never falls forward to a different release.
  const bytes = /^https?:\/\//.test(source || '') ? await fetchChecked(source, MANIFEST_BYTES) : await readBoundedFile(source || own, MANIFEST_BYTES);
  const manifest = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  if (manifest.schema !== 1 || !Array.isArray(manifest.plugins)) throw new Error('not a Rapier plug-in manifest');
  const paths = new Set(); let total = 0;
  for (const plugin of manifest.plugins) {
    if (!plugin || typeof plugin !== 'object' || !Array.isArray(plugin.files)) throw new Error('not a Rapier plug-in file list');
    for (const file of plugin.files) {
      if (!file || typeof file !== 'object') throw new Error('not a Rapier plug-in file');
      if ([plugin.builds, file.builds].some(builds => builds !== undefined && !(Array.isArray(builds) && builds.every(build => BUILDS.includes(build)))))
        throw new Error('the manifest names a build this command does not know: ' + JSON.stringify(file.file));
      if (typeof file.file !== 'string' || file.file.length > 1024 || !/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/.test(file.file) || file.file.split('/').some(part => part.endsWith('.')) ||
          paths.has(file.file) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > FILE_BYTES || !/^[0-9a-f]{96}$/.test(file.sha384) || typeof file.url !== 'string')
        throw new Error('the manifest names a file it cannot pin: ' + JSON.stringify(file.file));
      paths.add(file.file); total += file.bytes;
      if (total > TOTAL_BYTES) throw new Error('the manifest exceeds the total plug-in byte limit');
    }
  }
  return manifest;
}

async function boundedBytes(source, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of source) {
    size += chunk.length;
    if (size > limit) throw new Error('response exceeds the permitted ' + limit + ' bytes');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}
async function fetchChecked(address, limit) {
  const url = new URL(address);
  if (url.username || url.password || !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    throw new Error('a plug-in address needs HTTPS, or HTTP on localhost, without credentials');
  const response = await fetch(url, {credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(60000)});
  if (!response.ok) { await response.body?.cancel(); throw new Error('HTTP ' + response.status + ' from ' + url.origin); }
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > limit)) {
    await response.body?.cancel(); throw new Error('response exceeds the permitted ' + limit + ' bytes');
  }
  return response.body ? boundedBytes(response.body, limit) : Buffer.alloc(0);
}

const sha384 = bytes => createHash('sha384').update(bytes).digest('hex');
async function readBoundedFile(path, limit, {missing = false} = {}) {
  let handle;
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) throw new Error('a plug-in path must be an ordinary file without links');
    if (before.size > limit) throw new Error('file exceeds the permitted ' + limit + ' bytes');
    handle = await open(path, constants.O_RDONLY | NOFOLLOW);
    const after = await handle.stat();
    if (!after.isFile() || after.nlink !== 1 || before.ino !== after.ino || before.dev !== after.dev) throw new Error('the plug-in file changed while opening');
    return await boundedBytes(handle.createReadStream({autoClose: false}), limit);
  } catch (error) { if (missing && error.code === 'ENOENT') return null; throw error; }
  finally { await handle?.close(); }
}
async function destinationPath(root, name, create) {
  const parts = name.split('/'); let directory = root;
  for (const part of parts.slice(0, -1)) {
    directory = join(directory, part);
    if (create) await mkdir(directory).catch(error => { if (error.code !== 'EEXIST') throw error; });
    const stat = await lstat(directory).catch(error => { if (!create && error.code === 'ENOENT') return null; throw error; });
    if (!stat) return null;
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('plug-in directories cannot traverse links');
  }
  return join(directory, parts.at(-1));
}

export async function plugins(argv) {
  const options = arguments_(argv), manifest = await readManifest(options.manifest);
  const only = options.only ? new Set(options.only.split(',')) : null, names = new Set(manifest.plugins.map(plugin => plugin.name));
  for (const name of only || []) if (!names.has(name)) throw new Error('no plug-in named ' + name + '; the manifest has ' + [...names].join(', '));
  let failed = 0;
  await mkdir(options.directory, {recursive: true});
  const directory = await realpath(options.directory);
  const uses = (plugin, file) => !options.build || (file.builds || plugin.builds || BUILDS).includes(options.build);
  const jobs = manifest.plugins.filter(plugin => !only || only.has(plugin.name)).flatMap(plugin => plugin.files.filter(file => uses(plugin, file)).map(file => ({plugin, file})));
  if (!jobs.length) throw new Error('nothing in the manifest matches that --build and --only');
  const total = jobs.reduce((sum, {file}) => sum + file.bytes, 0);
  console.log(jobs.length + ' files, ' + (total / 1048576).toFixed(1) + ' MiB' + (options.build ? ' for the ' + options.build + ' build' : ' for every build; --build reader, document or full keeps only what that page uses'));
  const work = async ({plugin, file}) => {
    const name = plugin.name + '  ' + file.file;
    let temp = null;
    try {
      const path = await destinationPath(directory, file.file, !options.check);
      const existing = path ? await readBoundedFile(path, FILE_BYTES, {missing: true}) : null;
      if (existing && existing.length === file.bytes && sha384(existing) === file.sha384) return console.log('kept      ' + name);
      if (options.check) { console.log((existing ? 'WRONG     ' : 'MISSING   ') + name); failed++; return; }
      const address = options.from ? new URL(file.file, options.from.endsWith('/') ? options.from : options.from + '/').href : file.url;
      const bytes = await fetchChecked(address, file.bytes);
      if (bytes.length !== file.bytes) throw new Error('expected ' + file.bytes + ' bytes, got ' + bytes.length);
      if (sha384(bytes) !== file.sha384) throw new Error('SHA-384 does not match the manifest');
      await destinationPath(directory, file.file, false);
      const staged = join(dirname(path), '.rapier-plugin-' + randomBytes(18).toString('hex'));
      const handle = await open(staged, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o644);
      temp = staged;
      try { await handle.writeFile(bytes); } finally { await handle.close(); }
      await destinationPath(directory, file.file, false);
      await rename(temp, path); temp = null;
      console.log('fetched   ' + name + '  (' + file.bytes + ' bytes)');
    } catch (error) {
      console.error('FAILED    ' + name + ': ' + error.message);
      failed++;
    } finally { if (temp) await rm(temp, {force: true}); }
  };
  // A few files at a time: the PDF reader's set is two hundred small ones.
  let next = 0;
  await Promise.all(Array.from({length: 6}, async () => { while (next < jobs.length) await work(jobs[next++]); }));
  return failed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  plugins(process.argv.slice(2)).then(failed => { process.exitCode = failed ? 1 : 0; }, error => { console.error(error.message); process.exitCode = 1; });
}
