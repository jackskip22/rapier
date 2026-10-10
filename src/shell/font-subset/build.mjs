// SPDX-License-Identifier: AGPL-3.0-only
// Rebuild the optional font subsetter from its frozen npm dependencies.
import {readFile, writeFile, mkdir, cp, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../..');
const hash = (data, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(data).digest(encoding);
const args = process.argv.slice(2), check = args.includes('--check');
const argument = args.find(arg => arg.startsWith('--dependencies='));
if (args.some(arg => arg !== '--check' && !arg.startsWith('--dependencies=')))
  throw new Error('usage: node shell/font-subset/build.mjs [--check] [--dependencies=/path/to/frozen-npm-install]');
const temporary = argument ? null : await mkdtemp(join(tmpdir(), 'rapier-font-subset-'));
const dependencies = argument ? resolve(argument.slice('--dependencies='.length)) : temporary;
try {
  if (temporary) {
    await cp(join(here, 'package.json'), join(temporary, 'package.json'));
    await cp(join(here, 'package-lock.json'), join(temporary, 'package-lock.json'));
    execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: temporary, stdio: 'inherit'});
  }
  const lock = await readFile(join(here, 'package-lock.json'));
  if (!(await readFile(join(dependencies, 'package-lock.json'))).equals(lock)) throw new Error('The font subset dependency lock differs.');
  const packages = JSON.parse(await readFile(join(here, 'package.json'), 'utf8')).dependencies;
  for (const [name, version] of Object.entries(packages)) {
    const actual = JSON.parse(await readFile(join(dependencies, 'node_modules', name, 'package.json'), 'utf8'));
    if (actual.version !== version) throw new Error(name + ' is not version ' + version);
  }
  const source = await readFile(join(here, 'subset.mjs'), 'utf8');
  const wasm = await readFile(join(dependencies, 'node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm'));
  if (WebAssembly.Module.imports(await WebAssembly.compile(wasm)).length) throw new Error('The font subset kernel has external imports.');
  const notices = [];
  for (const [name, path] of [
    ['HarfBuzz JavaScript ' + packages.harfbuzzjs, join(dependencies, 'node_modules/harfbuzzjs/LICENSE')],
    ['HarfBuzz', join(here, 'HARFBUZZ-LICENSE.txt')],
    ['WOFF2 ' + packages.wawoff2, join(dependencies, 'node_modules/wawoff2/LICENSE')],
    ['Brotli', join(here, 'BROTLI-LICENSE.txt')],
    ['fflate ' + packages.fflate, join(dependencies, 'node_modules/fflate/LICENSE')],
  ]) notices.push(name + '\n\n' + await readFile(path, 'utf8'));
  const noticeBytes = Buffer.from(notices.join('\n\n---\n\n'));
  const esbuild = await import(pathToFileURL(join(dependencies, 'node_modules/esbuild/lib/main.js')).href);
  const built = await esbuild.build({stdin: {contents: source, resolveDir: dependencies, sourcefile: 'subset.mjs'},
    bundle: true, write: false, format: 'iife', globalName: 'RapierFontSubset', target: 'es2022', platform: 'browser',
    minify: true, legalComments: 'inline', charset: 'utf8', metafile: true,
    define: {RAPIER_FONT_SUBSET_WASM: JSON.stringify(wasm.toString('base64'))},
    plugins: [{name: 'font-decoder-no-io', setup(build) {
      build.onLoad({filter: /[\\/]wawoff2[\\/]build[\\/]decompress_binding\.js$/}, async ({path}) => {
        let contents = await readFile(path, 'utf8');
        const declarations = contents.match(/var ENVIRONMENT_IS_(?:WEB|WORKER|NODE)=[^;]*;/g);
        if (declarations?.length !== 3) throw new Error('The font decoder host branches changed.');
        // Its kernel is embedded. Remove every filesystem and network acquisition branch.
        contents = contents.replace(/var ENVIRONMENT_IS_(?:WEB|WORKER|NODE)=[^;]*;/g, '')
          .replace(/\bENVIRONMENT_IS_(?:WEB|WORKER|NODE)\b/g, 'false') + '\nmodule.exports=Module;';
        return {contents, loader: 'js'};
      });
    }}],
    banner: {js: '/*! Rapier font subsetter.\n' + noticeBytes.toString('utf8') + '\n*/'}});
  if (Object.values(built.metafile.outputs).some(output => output.imports.length)) throw new Error('The font subsetter is not self-contained.');
  const bytes = Buffer.from(built.outputFiles[0].contents), name = 'rapier-font-subset-1.js';
  const destination = join(repo, 'shell/vendor/font-subset');
  const provenance = {version: '1', dependencies: packages, npmLockSha256: hash(lock), sourceSha256: hash(source),
    wasm: {bytes: wasm.length, sha256: hash(wasm)}, noticesSha256: hash(noticeBytes),
    bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: hash(bytes), sha384: hash(bytes, 'sha384', 'base64')};
  const manifest = {version: 'font-subset-1', files: [{name: 'subset', version: '1',
    url: 'https://cdn.jsdelivr.net/gh/jackskip22/rapier@main/site/plugins/' + name,
    file: 'plugins/' + name, path: 'shell/vendor/font-subset/' + name,
    bytes: bytes.length, sri: provenance.sha384}]};
  const outputs = [[join(destination, name), bytes], [join(destination, 'NOTICES.txt'), noticeBytes],
    [join(destination, 'PROVENANCE.json'), Buffer.from(JSON.stringify(provenance, null, 2) + '\n')],
    [join(repo, 'shell/font-subset-resources.json'), Buffer.from(JSON.stringify(manifest, null, 2) + '\n')]];
  if (!check) await mkdir(destination, {recursive: true});
  for (const [path, data] of outputs) {
    if (check) { if (!(await readFile(path)).equals(data)) throw new Error('The font subsetter pinned build differs: ' + path); }
    else await writeFile(path, data);
  }
  console.log(JSON.stringify({...provenance, checked: check}, null, 2));
} finally { if (temporary) await rm(temporary, {recursive: true, force: true}); }
