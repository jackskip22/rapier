// SPDX-License-Identifier: AGPL-3.0-only
// Rebuild the optional native SVG renderer from its npm lock. npm dependencies live
// outside the product tree; the ordinary page ships only the resource pin.
import {readFile, writeFile, mkdir, cp, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cdnOrigin} from '../../version.mjs';
import {modernZenUMLSource} from './modern-sources.mjs';
import {strictIIFE} from '../../tools/strict-iife.mjs';
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
  const source = await readFile(join(here, 'zenuml-adapter.mjs'), 'utf8'), coreSource = await readFile(join(here, 'zenuml-core.mjs'), 'utf8');
  const font = await readFile(join(dependencies, 'node_modules/@zenuml/core/dist/fonts/IBMPlexSans-Regular-Latin1.woff2'));
  const fontCss = '@font-face{font-family:"IBM Plex Sans";src:url(data:font/woff2;base64,' + font.toString('base64') + ') format("woff2");font-weight:400;font-style:normal;font-display:block}';
  const esbuild = await import(pathToFileURL(join(dependencies, 'node_modules/esbuild/lib/main.js')).href);
  const modernInputs = [];
  const result = await esbuild.build({stdin: {contents: source, resolveDir: dependencies, sourcefile: 'zenuml-adapter.mjs'},
    bundle: true, write: false, format: 'iife', globalName: 'RapierZenUML', target: 'es2022', platform: 'browser',
    minify: true, legalComments: 'inline', charset: 'utf8', metafile: true,
    define: {RAPIER_ZENUML_FONT_CSS: JSON.stringify(fontCss)},
    // The adapter's on-demand import, resolved against the same frozen install.
    plugins: [{name: 'zenuml-core', setup(build) {
      build.onResolve({filter: /^\.\/zenuml-core\.mjs$/}, () => ({path: 'zenuml-core.mjs', namespace: 'rapier'}));
      build.onLoad({filter: /.*/, namespace: 'rapier'}, () => ({contents: coreSource, resolveDir: dependencies}));
      build.onLoad({filter: /[\\/]@zenuml[\\/]core[\\/]dist[\\/]zenuml\.esm\.mjs$/}, async ({path}) => {
        const upstreamSource = await readFile(path, 'utf8'), modern = modernZenUMLSource(upstreamSource);
        modernInputs.push({path: '@zenuml/core/dist/zenuml.esm.mjs', sha256: sha(upstreamSource), removed: modern.removed});
        return {contents: modern.contents, loader: 'js'};
      });
      build.onLoad({filter: /[\\/]antlr4[\\/]src[\\/]antlr4[\\/]polyfills[\\/](?:codepointat|fromcodepoint)\.js$/}, async ({path}) => {
        const name = path.replaceAll('\\', '/').split('/').at(-1), upstreamSource = await readFile(path);
        modernInputs.push({path: 'antlr4/src/antlr4/polyfills/' + name, sha256: sha(upstreamSource), removed: ['standard String intrinsic shim']});
        return {contents: '', loader: 'js'};
      });
    }}],
    banner: {js: '/* Rapier native ZenUML adapter. Licenses: rapier-zenuml-NOTICES.txt. */'}});
  if (Object.values(result.metafile.outputs).some(output => output.imports.length)) throw new Error('The ZenUML adapter must be self-contained');
  if (modernInputs.length !== 3) throw new Error('The pinned ZenUML build must remove both copies of the ANTLR String shims');
  const bytes = strictIIFE(result.outputFiles[0].contents, 'RapierZenUML');
  const output = join(repo, 'shell/vendor/zenuml/rapier-zenuml-4.5.0-3.js');
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
  const provenance = {adapter: '4.5.0-3', npmLockSha256: sha(lock), sourceSha256: sha(source + coreSource), esbuild: esbuild.version,
    target: 'es2022', strictIIFE: true, strictRecipeSha256: sha(await readFile(join(repo, 'tools/strict-iife.mjs'))),
    modernInputs: modernInputs.sort((a, b) => a.path.localeCompare(b.path)),
    modernRecipeSha256: sha(await readFile(join(here, 'modern-sources.mjs'))),
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
  const peleRoot = join(dependencies, 'node_modules/pele');
  // Pele's global build targets ES2021 and lowers each native class field into
  // a helper call. Its same-version ES module retains the native ES2022 fields.
  const peleSource = await readFile(join(peleRoot, 'dist/pele.js'));
  const peleBuild = await esbuild.build({entryPoints: [join(peleRoot, 'dist/pele.js')], bundle: true, write: false,
    format: 'iife', globalName: 'pele', target: 'es2022', platform: 'browser', minify: true, legalComments: 'none', charset: 'utf8', metafile: true,
    banner: {js: '/*! Pele 1.6.0 | MIT License | https://github.com/obsidianmd/pele */'}});
  if (Object.values(peleBuild.metafile.outputs).some(output => output.imports.length)) throw new Error('Pele must be self-contained');
  const peleBytes = strictIIFE(peleBuild.outputFiles[0].contents, 'pele');
  const peleNotice = await readFile(join(peleRoot, 'LICENSE'));
  const pelePackage = JSON.parse(await readFile(join(peleRoot, 'package.json'), 'utf8'));
  const peleLock = JSON.parse(lock).packages['node_modules/pele'];
  const pelePin = resources.files.find(file => file.name === 'core');
  const peleProvenance = {package: 'pele', version: pelePackage.version, source: 'https://github.com/obsidianmd/pele',
    path: 'dist/pele.js', sourceSha256: sha(peleSource), tarball: peleLock.resolved, integrity: peleLock.integrity, license: 'MIT',
    build: {esbuild: esbuild.version, target: 'es2022', format: 'iife', globalName: 'pele', minify: true, nativeClassFields: true, strictIIFE: true},
    strictRecipeSha256: sha(await readFile(join(repo, 'tools/strict-iife.mjs'))),
    npmLockSha256: sha(lock), bytes: peleBytes.length, sha256: sha(peleBytes), sha384: sha(peleBytes, 'sha384', 'base64'),
    noticesSha256: sha(peleNotice)};
  const peleDirectory = join(repo, 'shell/vendor/pele');
  const peleRecord = Buffer.from(JSON.stringify(peleProvenance, null, 2) + '\n');
  const peleUrl = cdnOrigin('rapier') + 'site/plugins/pele-1.6.0.js';
  if (check) {
    if (!(await readFile(join(peleDirectory, 'pele-1.6.0.js'))).equals(peleBytes) ||
        pelePin.bytes !== peleBytes.length || pelePin.sri !== peleProvenance.sha384 || pelePin.url !== peleUrl ||
        !(await readFile(join(peleDirectory, 'PROVENANCE.json'))).equals(peleRecord) ||
        !(await readFile(join(peleDirectory, 'LICENSE'))).equals(peleNotice))
      throw new Error('The Pele resource is not the reproducible modern npm build');
  } else {
    await mkdir(peleDirectory, {recursive: true});
    await writeFile(join(peleDirectory, 'pele-1.6.0.js'), peleBytes);
    await writeFile(join(peleDirectory, 'LICENSE'), peleNotice);
    await writeFile(join(peleDirectory, 'PROVENANCE.json'), peleRecord);
    pelePin.bytes = peleBytes.length; pelePin.sri = peleProvenance.sha384; pelePin.url = peleUrl;
    await writeFile(manifestPath, JSON.stringify(resources, null, 2) + '\n');
  }
  console.log(JSON.stringify({zenuml: provenance, pele: peleProvenance, checked: check}, null, 2));
} finally { if (temporary) await rm(temporary, {recursive: true, force: true}); }
