// SPDX-License-Identifier: AGPL-3.0-only
import {createHash} from 'node:crypto';
import {readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stripperFor} from './strip-comments.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url)), codec = join(repo, 'images/jxl'), vendor = join(repo, 'images/vendor/rapier-jxl');
export const VENDORED = Object.freeze(['codec.mjs', 'still.worker.mjs', 'animation.worker.mjs', 'decode.worker.mjs', 'jpeg.worker.mjs']);
const REBUILD = 'ESBUILD=<dir>/node_modules/esbuild TERSER=<dir>/node_modules/terser node tools/jxl-vendor.mjs --write';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function sourceDigest() {
  const files = [];
  const walk = dir => { for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name), name = relative(codec, path);
    if (entry.isDirectory()) { if (!/^(?:test|bench|examples|fixtures|public|github)$/.test(entry.name)) walk(path); continue; }
    if (/\.(?:mjs|js|wat)$/.test(entry.name)) files.push(name);
  } };
  walk(codec);
  const hash = createHash('sha256');
  for (const name of files.sort()) {
    const bytes = readFileSync(join(codec, name)), strip = stripperFor('images/jxl/' + name);
    hash.update(name + '\0' + sha256(strip ? strip(bytes.toString('utf8')) : bytes) + '\n');
  }
  const build = readFileSync(join(repo, 'tools/jxl7-build.mjs')), stripBuild = stripperFor('tools/jxl7-build.mjs');
  hash.update('tools/jxl7-build.mjs\0' + sha256(stripBuild ? stripBuild(build.toString('utf8')) : build));
  return {digest: hash.digest('hex'), files: files.length};
}
export function checkVendor() {
  const pin = JSON.parse(readFileSync(join(vendor, 'PIN.json'), 'utf8')), problems = [];
  if (pin.source.digest !== sourceDigest().digest) problems.push('images/jxl/ changed since the vendored files were built: ' + pin.rebuild);
  for (const name of VENDORED) {
    let bytes = null; try { bytes = readFileSync(join(vendor, name)); } catch {}
    if (!bytes || sha256(bytes) !== pin.files[name]?.sha256) problems.push(name + ' does not match its pin');
  }
  return problems;
}

if (process.argv.includes('--write')) {
  const out = mkdtempSync(join(tmpdir(), 'jxl-vendor-'));
  try {
    execFileSync(process.execPath, [join(repo, 'tools/jxl7-build.mjs')], {stdio: ['ignore', 2, 2], env: {...process.env, JXL7_OUT: out}});
    const {version} = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8')), files = {};
    for (const name of VENDORED) {
      copyFileSync(join(out, 'dist', name), join(vendor, name));
      const bytes = readFileSync(join(vendor, name));
      files[name] = {bytes: bytes.length, sha256: sha256(bytes)};
    }
    const pin = {rebuild: REBUILD, version, source: sourceDigest(), tools: {esbuild: '0.25.10', terser: '5.51.2', node: process.version}, files};
    writeFileSync(join(vendor, 'PIN.json'), JSON.stringify(pin, null, 2) + '\n');
    console.log('vendored', Object.entries(files).map(([name, {bytes}]) => name + ' ' + bytes).join(', '));
  } finally { rmSync(out, {recursive: true, force: true}); }
} else if (process.argv.includes('--check')) {
  const problems = checkVendor();
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exit(1);
  console.log('images/vendor/rapier-jxl matches its pin');
}
