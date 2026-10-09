#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// npx rapier-embed plugins <directory> [--build reader|document|full] [--only name,name] [--from <address>] [--manifest <file or address>] [--check]
//
// Fetches Rapier's plug-in files into one directory and verifies each against the manifest's length and SHA-384, so the reader and the
// editors can load them from your own origin (`plugins: '/that/directory/'`). `--build` keeps the files that build uses. A file already
// there with the right SHA-384 is kept. Exit status 1 when any file is missing or fails verification; nothing unverified is left in
// the directory.
import {createHash} from 'node:crypto';
import {mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HOSTED_MANIFEST = 'https://rapier.website/embed/rapier-plugins.json';
const BUILDS = ['reader', 'document', 'full'];
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
  const text = /^https?:\/\//.test(source || '') ? await (await fetchChecked(source)).text() : await readFile(source || own, 'utf8').catch(error => {
    if (source || error.code !== 'ENOENT') throw error;
    return fetchChecked(HOSTED_MANIFEST).then(response => response.text());
  });
  const manifest = JSON.parse(text);
  if (manifest.schema !== 1 || !Array.isArray(manifest.plugins)) throw new Error('not a Rapier plug-in manifest');
  for (const plugin of manifest.plugins) for (const file of plugin.files) {
    if ([plugin.builds, file.builds].some(builds => builds !== undefined && !(Array.isArray(builds) && builds.every(build => BUILDS.includes(build)))))
      throw new Error('the manifest names a build this command does not know: ' + JSON.stringify(file.file));
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/.test(file.file) || !Number.isSafeInteger(file.bytes) || !/^[0-9a-f]{96}$/.test(file.sha384) || typeof file.url !== 'string')
      throw new Error('the manifest names a file it cannot pin: ' + JSON.stringify(file.file));
  }
  return manifest;
}

async function fetchChecked(url) {
  const response = await fetch(url, {credentials: 'omit', referrerPolicy: 'no-referrer'});
  if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + url);
  return response;
}

const sha384 = bytes => createHash('sha384').update(bytes).digest('hex');
const held = async path => readFile(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });

export async function plugins(argv) {
  const options = arguments_(argv), manifest = await readManifest(options.manifest);
  const only = options.only ? new Set(options.only.split(',')) : null, names = new Set(manifest.plugins.map(plugin => plugin.name));
  for (const name of only || []) if (!names.has(name)) throw new Error('no plug-in named ' + name + '; the manifest has ' + [...names].join(', '));
  let failed = 0;
  await mkdir(options.directory, {recursive: true});
  const uses = (plugin, file) => !options.build || (file.builds || plugin.builds || BUILDS).includes(options.build);
  const jobs = manifest.plugins.filter(plugin => !only || only.has(plugin.name)).flatMap(plugin => plugin.files.filter(file => uses(plugin, file)).map(file => ({plugin, file})));
  if (!jobs.length) throw new Error('nothing in the manifest matches that --build and --only');
  const total = jobs.reduce((sum, {file}) => sum + file.bytes, 0);
  console.log(jobs.length + ' files, ' + (total / 1048576).toFixed(1) + ' MiB' + (options.build ? ' for the ' + options.build + ' build' : ' for every build; --build reader, document or full keeps only what that page uses'));
  const work = async ({plugin, file}) => {
    const path = join(options.directory, file.file), existing = await held(path), name = plugin.name + '  ' + file.file;
    if (existing && existing.length === file.bytes && sha384(existing) === file.sha384) return console.log('kept      ' + name);
    if (options.check) { console.log((existing ? 'WRONG     ' : 'MISSING   ') + name); failed++; return; }
    try {
      const address = options.from ? new URL(file.file, options.from.endsWith('/') ? options.from : options.from + '/').href : file.url;
      const bytes = new Uint8Array(await (await fetchChecked(address)).arrayBuffer());
      if (bytes.length !== file.bytes) throw new Error('expected ' + file.bytes + ' bytes, got ' + bytes.length);
      if (sha384(bytes) !== file.sha384) throw new Error('SHA-384 does not match the manifest');
      await mkdir(dirname(path), {recursive: true});
      await writeFile(path + '.part', bytes);
      await rename(path + '.part', path);
      console.log('fetched   ' + name + '  (' + file.bytes + ' bytes)');
    } catch (error) {
      await rm(path + '.part', {force: true});
      console.error('FAILED    ' + name + ': ' + error.message);
      failed++;
    }
  };
  // A few files at a time: the PDF reader's set is two hundred small ones.
  let next = 0;
  await Promise.all(Array.from({length: 6}, async () => { while (next < jobs.length) await work(jobs[next++]); }));
  return failed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  plugins(process.argv.slice(2)).then(failed => { process.exitCode = failed ? 1 : 0; }, error => { console.error(error.message); process.exitCode = 1; });
}
