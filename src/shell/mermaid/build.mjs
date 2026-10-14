// SPDX-License-Identifier: AGPL-3.0-only
// Rebuild the optional native SVG renderer from its npm lock. npm dependencies live
// outside the product tree; the ordinary page ships only the resource pin.
import {readFile, writeFile, mkdir, cp, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const sha = (data, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(data).digest(encoding);
const args = process.argv.slice(2);
const check = args.includes('--check');
const dependencyArg = args.find(arg => arg.startsWith('--dependencies='));
if (args.some(arg => arg !== '--check' && !arg.startsWith('--dependencies='))) throw new Error('usage: node shell/mermaid/build.mjs [--check] [--dependencies=/path/to/frozen-npm-install]');
const temporary = dependencyArg ? null : await mkdtemp(join(tmpdir(), 'rapier-zenuml-'));
const dependencies = dependencyArg ? resolve(dependencyArg.slice('--dependencies='.length)) : temporary;
try {
  if (temporary) {
    await cp(join(here, 'package.json'), join(temporary, 'package.json'));
    await cp(join(here, 'package-lock.json'), join(temporary, 'package-lock.json'));
    execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: temporary, stdio: 'inherit'});
  }
  const lock = await readFile(join(here, 'package-lock.json'));
  if (!(await readFile(join(dependencies, 'package-lock.json'))).equals(lock)) throw new Error('The dependency install does not have the committed npm lock');
  const packageJson = JSON.parse(await readFile(join(here, 'package.json'), 'utf8'));
  for (const [name, version] of Object.entries(packageJson.dependencies)) {
    const actual = JSON.parse(await readFile(join(dependencies, 'node_modules', name, 'package.json'), 'utf8'));
    if (actual.version !== version) throw new Error(name + ' is not version ' + version);
  }
  const source = await readFile(join(here, 'zenuml-adapter.mjs'), 'utf8');
  const font = await readFile(join(dependencies, 'node_modules/@zenuml/core/dist/fonts/IBMPlexSans-Regular-Latin1.woff2'));
  const fontCss = '@font-face{font-family:"IBM Plex Sans";src:url(data:font/woff2;base64,' + font.toString('base64') + ') format("woff2");font-weight:400;font-style:normal;font-display:block}';
  const esbuild = await import(pathToFileURL(join(dependencies, 'node_modules/esbuild/lib/main.js')).href);
  const result = await esbuild.build({stdin: {contents: source, resolveDir: dependencies, sourcefile: 'zenuml-adapter.mjs'},
    bundle: true, write: false, format: 'iife', globalName: 'RapierZenUML', target: 'es2022', platform: 'browser',
    minify: true, legalComments: 'inline', charset: 'utf8', metafile: true,
    define: {RAPIER_ZENUML_FONT_CSS: JSON.stringify(fontCss)},
    banner: {js: '/* Rapier native ZenUML adapter. Licenses: rapier-zenuml-NOTICES.txt. */'}});
  if (Object.values(result.metafile.outputs).some(output => output.imports.length)) throw new Error('The ZenUML adapter must be self-contained');
  const bytes = Buffer.from(result.outputFiles[0].contents);
  const output = join(repo, 'shell/vendor/zenuml/rapier-zenuml-4.5.0-1.js');
  const manifestPath = join(repo, 'shell/mermaid-resources.json');
  const resources = JSON.parse(await readFile(manifestPath, 'utf8'));
  const file = resources.files.find(file => file.name === 'zenuml');
  if (!file) throw new Error('The Mermaid resource set has no ZenUML file');
  const upstream = JSON.parse(await readFile(join(here, 'upstream-notices.json'), 'utf8'));
  const upstreamNotices = await readFile(join(here, 'UPSTREAM-NOTICES.txt'));
  if (upstream.coreVersion !== packageJson.dependencies['@zenuml/core'] || sha(upstreamNotices) !== upstream.noticesSha256)
    throw new Error('The ZenUML upstream notices do not match their provenance');
  const notices = ['Rapier native ZenUML adapter\n\n' + await readFile(join(repo, 'LICENSE'), 'utf8')];
  for (const [name, path] of [
    ['ZenUML Core 4.5.0', '@zenuml/core/LICENSE'],
    ['IBM Plex Sans', '@zenuml/core/dist/fonts/IBM-Plex-LICENSE.txt'],
  ]) notices.push(name + '\n\n' + await readFile(join(dependencies, 'node_modules', path), 'utf8'));
  notices.push('ANTLR4 4.11.0\n\n' + await readFile(join(here, 'ANTLR4-LICENSE.txt'), 'utf8'));
  notices.push(upstreamNotices.toString('utf8'));
  const noticeBytes = Buffer.from(notices.join('\n\n---\n\n'));
  const provenance = {adapter: '4.5.0-1', npmLockSha256: sha(lock), sourceSha256: sha(source), esbuild: esbuild.version,
    core: packageJson.dependencies['@zenuml/core'], coreGitHead: upstream.gitHead, upstreamLockSha256: upstream.lockSha256,
    antlr4: packageJson.dependencies.antlr4, noticesSha256: sha(noticeBytes),
    bytes: bytes.length, sha256: sha(bytes), sha384: sha(bytes, 'sha384', 'base64'),
    font: {family: 'IBM Plex Sans', bytes: font.length, sha256: sha(font), sha384: sha(font, 'sha384', 'base64')}};
  const provenanceBytes = Buffer.from(JSON.stringify(provenance, null, 2) + '\n');
  const provenancePath = join(dirname(output), 'PROVENANCE.json'), noticesPath = join(dirname(output), 'rapier-zenuml-NOTICES.txt');
  if (check) {
    if (!(await readFile(output)).equals(bytes) || file.bytes !== bytes.length || file.sri !== provenance.sha384 ||
        !(await readFile(provenancePath)).equals(provenanceBytes) || !(await readFile(noticesPath)).equals(noticeBytes))
      throw new Error('The ZenUML resource is not the reproducible pinned build');
  } else {
    await mkdir(dirname(output), {recursive: true});
    await writeFile(output, bytes);
    file.bytes = bytes.length; file.sri = provenance.sha384;
    await writeFile(manifestPath, JSON.stringify(resources, null, 2) + '\n');
    await writeFile(provenancePath, provenanceBytes);
    await writeFile(noticesPath, noticeBytes);
  }
  console.log(JSON.stringify({...provenance, checked: check}, null, 2));
} finally { if (temporary) await rm(temporary, {recursive: true, force: true}); }
