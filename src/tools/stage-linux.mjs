// SPDX-License-Identifier: AGPL-3.0-only
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {chmod, copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {VERSION} from '../version.mjs';
import {pluginPackFiles, stagePluginPack} from './stage-plugin-pack.mjs';
import {PART_DIRECTORY, PART_IDS} from './parts.mjs';
import {checkBuildInputs} from './build-reuse.mjs';
import {digestRecords, treeRecords} from './release-digest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const release = 'https://raw.githubusercontent.com/jackskip22/rapier/v' + VERSION + '/';
const cargo = (...args) => execFileSync('cargo', args, {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
const manifest = join(root, 'linux/app/Cargo.toml');
const record = file => [file.name, file.bytes.length, sha256(file.bytes)];

async function pageFiles() {
  const receipt = JSON.parse(await readFile(join(root, 'dist/BUILD.json'), 'utf8'));
  const built = receipt.profiles?.full;
  if (receipt.release !== VERSION || !built || built.packing !== 'zopfli' || built.canonical !== true)
    throw new Error('refused: Linux needs this version\'s canonical full build');
  await checkBuildInputs({root, profile: 'full', record: built});
  const page = await readFile(join(root, 'rapier.html'));
  if (sha256(page) !== built.sha256 || page.length !== built.bytes)
    throw new Error('refused: the page differs from its full build receipt');
  const files = [{name: 'rapier.html', bytes: page}];
  const folder = join(root, PART_DIRECTORY);
  for (const id of PART_IDS) {
    const names = (await readdir(folder)).filter(name => new RegExp('^rapier-' + id + '-[0-9a-f]{16}\\.txt$').test(name));
    const part = built.parts?.find(part => part.id === id || part.file === names[0]);
    const bytes = names.length === 1 ? await readFile(join(folder, names[0])) : null;
    if (!bytes || !part || part.file !== names[0] || sha256(bytes).slice(0, 16) !== names[0].slice(-20, -4))
      throw new Error('refused: the ' + id + ' part does not belong to the built page');
    files.push({name: PART_DIRECTORY + '/' + names[0], bytes});
  }
  return {files, certificate: built.reuse.digest};
}

async function pluginFiles() {
  const cache = join(root, 'dist/plugin-pack');
  await stagePluginPack(cache);
  return Promise.all((await pluginPackFiles()).map(async file => ({name: 'plugins/' + file.id, bytes: await readFile(join(cache, file.id))})));
}

async function nativeSources() {
  const records = (await treeRecords(join(root, 'linux/app'), {exclude: ['target', 'tests', 'examples']}))
    .map(([path, ...rest]) => ['linux/app/' + path, ...rest]);
  for (const path of ['tools/stage-linux.mjs', 'linux/rapier', 'linux/rapier.desktop', 'linux/rapier-mime.xml']) {
    const bytes = await readFile(join(root, path));
    records.push([path, path === 'linux/rapier' ? 0o755 : 0o644, bytes.length, sha256(bytes)]);
  }
  return records.sort((a, b) => a[0].localeCompare(b[0]));
}

async function licenses() {
  const metadata = JSON.parse(cargo('metadata', '--locked', '--format-version', '1',
    '--filter-platform', 'x86_64-unknown-linux-gnu', '--manifest-path', manifest));
  const notices = ['Rapier for Linux\n\n' + await readFile(join(root, 'LICENSE'), 'utf8')];
  for (const pkg of metadata.packages.filter(p => p.source).sort((a, b) => (a.name + a.version).localeCompare(b.name + b.version))) {
    const dir = dirname(pkg.manifest_path);
    const names = (await readdir(dir)).filter(name => /^(?:LICENSE|COPYING|NOTICE)(?:[.-]|$)/i.test(name));
    if (pkg.license_file && !names.includes(pkg.license_file)) names.push(pkg.license_file);
    const texts = [];
    for (const name of names.sort()) {
      try { texts.push(name + '\n' + await readFile(join(dir, name), 'utf8')); }
      catch (error) { if (error.code !== 'EISDIR') throw error; }
    }
    if (!texts.length) throw new Error('refused: missing dependency license text: ' + pkg.name);
    notices.push(pkg.name + ' ' + pkg.version + ' (' + pkg.license + ')\n' + texts.join('\n\n'));
  }
  return Buffer.from(notices.join('\n\n------------------------------------------------------------\n\n') + '\n');
}

function elfInfo(bytes) {
  if (bytes.length < 64 || bytes.subarray(0, 4).toString('hex') !== '7f454c46' || bytes[4] !== 2 || bytes[5] !== 1)
    throw new Error('refused: Linux artifact is not a 64-bit little-endian ELF');
  const machine = bytes.readUInt16LE(18);
  if (machine !== 62) throw new Error('refused: this release is qualified only for Linux x86_64');
  return {architecture: 'x86_64', elfClass: 64, machine};
}

export async function verifyLinuxArtifact(file = join(root, 'dist/linux/rapier-linux')) {
  const built = JSON.parse(await readFile(join(dirname(file), 'BUILT.json'), 'utf8'));
  const bytes = await readFile(file);
  elfInfo(bytes);
  const page = await pageFiles();
  if (built.schema !== 'rapier-linux/1' || built.version !== VERSION || built.file !== basename(file) ||
      built.bytes !== bytes.length || built.sha256 !== sha256(bytes) ||
      built.pageCertificate !== page.certificate || JSON.stringify(built.page) !== JSON.stringify(page.files.map(record)) ||
      built.sourceDigest !== digestRecords(await nativeSources()))
    throw new Error('refused: Linux executable, source, page or manifest is stale');
  const plugins = await pluginFiles();
  if (JSON.stringify(built.resources) !== JSON.stringify(plugins.map(record)))
    throw new Error('refused: Linux resources differ from the current resource owner');
  return {built, bytes};
}

export async function recordedLinuxArtifact(file = join(root, 'dist/linux/rapier-linux'), manifestFile = join(dirname(file), 'BUILT.json')) {
  const built = JSON.parse(await readFile(manifestFile, 'utf8'));
  const bytes = await readFile(file);
  elfInfo(bytes);
  if (built.schema !== 'rapier-linux/1' || !/^\d+\.\d+\.\d+$/.test(built.version || '') || built.bytes !== bytes.length || built.sha256 !== sha256(bytes))
    throw new Error('refused: ' + file + ' is not the build its manifest names');
  return {built, bytes};
}

export async function stageLinuxPublic(out, file = join(root, 'dist/linux/rapier-linux'), published = null) {
  let found = null;
  if (existsSync(file) || existsSync(join(dirname(file), 'BUILT.json'))) found = await recordedLinuxArtifact(file);
  else if (published && existsSync(join(published, 'rapier-linux')))
    found = await recordedLinuxArtifact(join(published, 'rapier-linux'), join(published, 'rapier-linux.json'));
  if (!found) return null;
  const {built, bytes} = found;
  await mkdir(out, {recursive: true});
  const destination = join(out, 'rapier-linux');
  await writeFile(destination, bytes, {mode: 0o755});
  await chmod(destination, 0o755);
  await writeFile(join(out, 'rapier-linux.json'), JSON.stringify(built, null, 2) + '\n');
  return built;
}

export async function stageLinuxSingle(file) {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.env.CARGO_BUILD_TARGET)
    throw new Error('refused: build and qualify natively on Linux x86_64 without a cross target');
  file = resolve(file);
  await mkdir(dirname(file), {recursive: true});
  await rm(join(dirname(file), 'BUILT.json'), {force: true});
  const dir = await mkdtemp(join(tmpdir(), 'rapier-linux-'));
  try {
    const app = join(dir, 'app');
    const page = await pageFiles(), plugins = await pluginFiles(), sources = await nativeSources();
    const files = [...page.files, ...plugins, {name: 'LICENSES.txt', bytes: await licenses()}];
    for (const [name, path] of [['rapier.desktop', 'linux/rapier.desktop'], ['rapier-mime.xml', 'linux/rapier-mime.xml'], ['rapier.png', 'icon-512.png']])
      files.push({name, bytes: await readFile(join(root, path))});
    files.sort((a, b) => a.name.localeCompare(b.name));
    const inventory = Buffer.from(JSON.stringify(files.map(record)) + '\n');
    files.push({name: 'CONTENTS.json', bytes: inventory});
    for (const entry of files) {
      await mkdir(dirname(join(app, entry.name)), {recursive: true});
      await writeFile(join(app, entry.name), entry.bytes, {mode: 0o644});
    }
    const names = join(dir, 'names');
    await writeFile(names, files.map(f => f.name).sort().join('\n') + '\n');
    const tar = execFileSync('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '--mode=0644', '--format=gnu', '-C', app, '-cf', '-', '-T', names], {maxBuffer: 512 * 1024 * 1024});
    const payload = gzipSync(tar, {level: 9}), tarball = join(dir, 'payload.tar.gz');
    await writeFile(tarball, payload);
    const target = join(root, 'dist/linux/cargo-target');
    execFileSync('cargo', ['build', '--release', '--locked', '--bin', 'rapier-linux', '--manifest-path', manifest], {
      env: {...process.env, RAPIER_PAYLOAD: tarball, RAPIER_CONTENTS: join(app, 'CONTENTS.json'), RAPIER_VERSION: VERSION, CARGO_TARGET_DIR: target}, stdio: 'inherit'});
    const candidate = join(target, 'release/rapier-linux'), bytes = await readFile(candidate);
    const runtime = elfInfo(bytes);
    const versions = execFileSync('readelf', ['--version-info', candidate], {encoding: 'utf8'});
    const glibc = [...versions.matchAll(/\bGLIBC_([\d.]+)/g)].map(m => m[1]).sort((a, b) => {
      const x = a.split('.').map(Number), y = b.split('.').map(Number);
      for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
      return 0;
    }).at(-1);
    const built = {schema: 'rapier-linux/1', version: VERSION, file: basename(file), bytes: bytes.length, sha256: sha256(bytes),
      payload: sha256(payload), pageCertificate: page.certificate, page: page.files.map(record), resources: plugins.map(record),
      sourceDigest: digestRecords(sources), sources, runtime: {...runtime, glibc, kernel: '5.6 or newer (openat2)',
        browser: 'installed Chromium-compatible browser', portal: 'session D-Bus and xdg-desktop-portal with a desktop backend for file choosers'},
      toolchain: {rustc: execFileSync('rustc', ['--version'], {encoding: 'utf8'}).trim(), cargo: cargo('--version').trim(), node: process.version}};
    if (digestRecords(await nativeSources()) !== built.sourceDigest || (await pageFiles()).certificate !== page.certificate)
      throw new Error('refused: inputs changed during the Linux build');
    await copyFile(candidate, file + '.part'); await chmod(file + '.part', 0o755); await rename(file + '.part', file);
    await writeFile(join(dirname(file), 'BUILT.json'), JSON.stringify(built, null, 2) + '\n');
    await writeFile(join(dirname(file), 'LICENSES.txt'), files.find(f => f.name === 'LICENSES.txt').bytes);
    await writeFile(join(dirname(file), 'CONTENTS.json'), inventory);
    return built;
  } finally { await rm(dir, {recursive: true, force: true}); }
}

export async function stageLinuxApp(dir) {
  await mkdir(dir, {recursive: true});
  const {files} = await pageFiles();
  for (const entry of [...files, ...await pluginFiles()]) {
    await mkdir(dirname(join(dir, entry.name)), {recursive: true});
    await writeFile(join(dir, entry.name), entry.bytes);
  }
  return {dir, files: files.length};
}

// the system launcher entry, the MIME types and a hicolor scalable icon. The executable and LICENSE come from this release's
const WAYLAND_ENTRY = 'chrome-rapier.local__rapier.html-Default.desktop';

export async function stageLinuxPackage(out) {
  const {built} = await recordedLinuxArtifact();
  const own = ['rapier', 'rapier.desktop', 'rapier-mime.xml', 'rapier.svg'];
  const tag = 'v' + VERSION, raw = 'https://raw.githubusercontent.com/jackskip22/rapier/' + tag + '/';
  const fields = {
    pkgname: 'rapier-bin', pkgver: built.version, pkgrel: 1,
    pkgdesc: 'Offline Markdown editor, notes, drawing and painting in one app',
    arch: ['x86_64'], url: 'https://rapier.website', license: ['AGPL-3.0-only'],
    depends: ['glibc>=' + built.runtime.glibc, 'gcc-libs', 'chromium', 'perl-file-mimeinfo', 'xdg-desktop-portal', 'hicolor-icon-theme'],
    optdepends: ['xdg-desktop-portal-gtk: file chooser on GTK desktops and Hyprland', 'xdg-desktop-portal-kde: file chooser on KDE',
      'fontconfig: follow the Omarchy monospace font'],
    provides: ['rapier'], conflicts: ['rapier'], options: ['!strip', '!debug'],
  };
  const sources = [
    {name: 'rapier-linux-' + built.version, url: raw + 'rapier-linux', hash: built.sha256},
    {name: 'LICENSE-' + built.version, url: raw + 'LICENSE', hash: sha256(await readFile(join(root, 'LICENSE')))},
    ...await Promise.all(own.map(async name => ({name, hash: sha256(await readFile(join(root, 'linux', name)))}))),
  ];
  const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
  const list = values => '(' + values.map(quote).join(' ') + ')';
  const text = `# Maintainer: Rapier <https://rapier.website>
# Generated by tools/stage-linux.mjs for the recorded rapier-linux ${built.version} (${built.sha256}), served from the ${tag} tag.
pkgname=${fields.pkgname}
pkgver=${fields.pkgver}
pkgrel=${fields.pkgrel}
_tag=${tag}
pkgdesc=${quote(fields.pkgdesc)}
arch=${list(fields.arch)}
url=${quote(fields.url)}
license=${list(fields.license)}
depends=${list(fields.depends)}
optdepends=(${fields.optdepends.map(quote).join('\n            ')})
provides=${list(fields.provides)}
conflicts=${list(fields.conflicts)}
options=${list(fields.options)}
source=("rapier-linux-\${pkgver}::https://raw.githubusercontent.com/jackskip22/rapier/\${_tag}/rapier-linux"
        "LICENSE-\${pkgver}::https://raw.githubusercontent.com/jackskip22/rapier/\${_tag}/LICENSE"
        ${own.join(' ')})
sha256sums=(${sources.map(f => quote(f.hash)).join('\n            ')})

package() {
  install -Dm755 "rapier-linux-\${pkgver}" "\$pkgdir/opt/rapier/rapier-linux"
  install -Dm755 rapier "\$pkgdir/usr/bin/rapier"
  install -Dm644 rapier.desktop "\$pkgdir/usr/share/applications/rapier.desktop"
  # On Wayland Chromium names the app window chrome-<app>-<profile>: this hidden entry gives it rapier's name and icon.
  { grep -v '^MimeType=' rapier.desktop; echo NoDisplay=true; } > ${WAYLAND_ENTRY}
  install -Dm644 ${WAYLAND_ENTRY} "\$pkgdir/usr/share/applications/${WAYLAND_ENTRY}"
  install -Dm644 rapier-mime.xml "\$pkgdir/usr/share/mime/packages/rapier.xml"
  install -Dm644 rapier.svg "\$pkgdir/usr/share/icons/hicolor/scalable/apps/rapier.svg"
  install -Dm644 "LICENSE-\${pkgver}" "\$pkgdir/usr/share/licenses/\$pkgname/LICENSE"
}
`;
  const srcinfo = ['pkgbase = ' + fields.pkgname, '\tpkgdesc = ' + fields.pkgdesc, '\tpkgver = ' + fields.pkgver, '\tpkgrel = ' + fields.pkgrel,
    '\turl = ' + fields.url, ...fields.arch.map(v => '\tarch = ' + v), ...fields.license.map(v => '\tlicense = ' + v),
    ...fields.depends.map(v => '\tdepends = ' + v), ...fields.optdepends.map(v => '\toptdepends = ' + v),
    ...fields.provides.map(v => '\tprovides = ' + v), ...fields.conflicts.map(v => '\tconflicts = ' + v),
    ...fields.options.map(v => '\toptions = ' + v),
    ...sources.map(f => '\tsource = ' + (f.url ? f.name + '::' + f.url : f.name)), ...sources.map(f => '\tsha256sums = ' + f.hash),
    '', 'pkgname = ' + fields.pkgname, ''].join('\n');
  for (const [dir, extra] of [['aur', {'.SRCINFO': srcinfo}],
    ['omarchy-pkgs', {'.omarchy/package.json': JSON.stringify({source: 'local', sync: false}, null, 2) + '\n'}]]) {
    const folder = join(out, dir, 'rapier-bin');
    await mkdir(join(folder, '.omarchy'), {recursive: true});
    if (dir === 'aur') await rm(join(folder, '.omarchy'), {recursive: true, force: true});
    await writeFile(join(folder, 'PKGBUILD'), text);
    for (const name of own) await copyFile(join(root, 'linux', name), join(folder, name));
    for (const [name, body] of Object.entries(extra)) await writeFile(join(folder, name), body);
  }
  return {out, version: built.version, tag, architecture: built.runtime.architecture, sha256: built.sha256};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--single' && args[1]) console.log(JSON.stringify(await stageLinuxSingle(args[1])));
  else if (args[0] === '--verify') console.log(JSON.stringify((await verifyLinuxArtifact(args[1])).built));
  else if (args[0] === '--app' && args[1]) console.log(JSON.stringify(await stageLinuxApp(resolve(args[1]))));
  else if (args[0] && !args[0].startsWith('--')) console.log(JSON.stringify(await stageLinuxPackage(resolve(args[0]))));
  else { console.error('usage: node tools/stage-linux.mjs --single <file> | --verify [file] | <package-dir> | --app <dir>'); process.exit(2); }
}
