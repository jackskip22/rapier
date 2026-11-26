// SPDX-License-Identifier: AGPL-3.0-only
import {createHash} from 'node:crypto';
import {readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {brotliCompressSync, constants} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {stripperFor} from './strip-comments.mjs';
import {JXL_HISTORY_BASELINE} from './changelog.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url)), codec = join(repo, 'images/jxl'), vendor = join(repo, 'images/vendor/rapier-jxl');
export const VENDORED = Object.freeze(['index.mjs', 'index.browser.mjs', 'jpeg.mjs', 'jpeg.browser.mjs', 'decode.mjs', 'decode.browser.mjs', 'animation.mjs', 'animation.browser.mjs', 'max.mjs', 'max.browser.mjs', 'hdr.mjs']);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function sourceDigest() {
  const files = [];
  const walk = dir => { for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name), name = relative(codec, path);
    if (entry.isDirectory()) { if (!/^(?:test|bench|examples|fixtures|public|github)$/.test(entry.name)) walk(path); continue; }
    if (/\.(?:mjs|js|wat|c|h)$/.test(entry.name)) files.push(name);
  } };
  walk(codec);
  const hash = createHash('sha256');
  for (const name of files.sort()) {
    const bytes = readFileSync(join(codec, name)), strip = stripperFor('images/jxl/' + name);
    hash.update(name + '\0' + sha256(strip ? strip(bytes.toString('utf8')) : bytes) + '\n');
  }
  for (const file of ['tools/jxl7-build.mjs', 'tools/jxl-kernel-strip.mjs']) {
    const build = readFileSync(join(repo, file)), stripBuild = stripperFor(file);
    hash.update(file + '\0' + sha256(stripBuild ? stripBuild(build.toString('utf8')) : build));
  }
  return {digest: hash.digest('hex'), files: files.length};
}
export function checkVendor() {
  const pin = JSON.parse(readFileSync(join(vendor, 'PIN.json'), 'utf8')), problems = [];
  const published = JXL_HISTORY_BASELINE.ref.replace(/^v/, '');
  if (pin.version !== published) console.warn(`WARNING: the page carries rapier-jxl ${pin.version}; this tree's release history ends at ${published}`);
  for (const name of VENDORED) {
    let bytes = null; try { bytes = readFileSync(join(vendor, name)); } catch {}
    if (!bytes || sha256(bytes) !== pin.files[name]?.sha256) problems.push(name + ' does not match its pin');
  }
  return problems;
}
function registryPackage(version) {
  const out = mkdtempSync(join(tmpdir(), 'jxl-vendor-'));
  const tarball = join(out, execFileSync('npm', ['pack', 'jpegxl@' + version, '--pack-destination', out, '--silent'], {encoding: 'utf8'}).trim().split('\n').pop());
  const bytes = readFileSync(tarball), shasum = execFileSync('npm', ['view', 'jpegxl@' + version, 'dist.shasum'], {encoding: 'utf8'}).trim();
  if (createHash('sha1').update(bytes).digest('hex') !== shasum) { rmSync(out, {recursive: true, force: true}); throw new Error('the tarball is not the registry\'s rapier-jxl@' + version); }
  execFileSync('tar', ['xzf', tarball, '-C', out]);
  return {out, dist: join(out, 'package/dist'), shasum, digest: sha256(bytes)};
}

if (process.argv.includes('--write')) {
  const version = process.argv[process.argv.indexOf('--write') + 1];
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) { console.error('usage: node tools/jxl-vendor.mjs --write <published version>'); process.exit(2); }
  const {out, dist, shasum, digest} = registryPackage(version);
  try {
    const files = {};
    for (const name of VENDORED) {
      copyFileSync(join(dist, name), join(vendor, name));
      const bytes = readFileSync(join(vendor, name));
      files[name] = {bytes: bytes.length, sha256: sha256(bytes)};
    }
    const upload = readFileSync(join(dist, 'upload.mjs'));
    const sizes = {upload: brotliCompressSync(upload, {params: {[constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: upload.length}}).length};
    const pin = {rebuild: 'node tools/jxl-vendor.mjs --write ' + version, version, source: {registry: 'https://registry.npmjs.org/jpegxl', shasum, digest}, sizes, files};
    writeFileSync(join(vendor, 'PIN.json'), JSON.stringify(pin, null, 2) + '\n');
    console.log('vendored rapier-jxl ' + version + ':', Object.entries(files).map(([name, {bytes}]) => name + ' ' + bytes).join(', '));
  } finally { rmSync(out, {recursive: true, force: true}); }
} else if (process.argv.includes('--check') || process.argv.includes('--check-registry')) {
  const problems = checkVendor();
  if (process.argv.includes('--check-registry')) {
    const pin = JSON.parse(readFileSync(join(vendor, 'PIN.json'), 'utf8')), {out, dist, shasum} = registryPackage(pin.version);
    try {
      if (shasum !== pin.source.shasum) problems.push('the registry\'s tarball is not the pinned one');
      for (const name of VENDORED) if (sha256(readFileSync(join(dist, name))) !== pin.files[name]?.sha256) problems.push(name + ' is not the published file');
    } finally { rmSync(out, {recursive: true, force: true}); }
  }
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exit(1);
  console.log('images/vendor/rapier-jxl matches its pin');
}
