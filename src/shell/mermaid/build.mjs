// SPDX-License-Identifier: AGPL-3.0-only
// Rebuild the optional diagram renderers (ZenUML, Pele) from their npm lock. npm dependencies live
// outside the product tree; the ordinary page ships only the resource pin.
import {readFile, writeFile, mkdir, cp, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cdnOrigin} from '../../version.mjs';
import {strictIIFE} from '../../tools/strict-iife.mjs';
import {rapierZenUMLRenderer, CLI_PATH, CLI_SHA256, FONT_FAMILY} from './zenuml-svg.mjs';
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
  const esbuild = await import(pathToFileURL(join(dependencies, 'node_modules/esbuild/lib/main.js')).href);
  // ZenUML's own SVG renderer (from its published command-line build, without the React editor, cloud icons or IBM Plex),
  // painted with Rapier's tokens and type by the recipe in zenuml-svg.mjs, with the ANTLR runtime and marked for comments.
  const entry = join(here, 'zenuml-adapter.mjs'), sources = {}, shims = [];
  for (const name of ['zenuml-adapter.mjs', 'zenuml-svg.mjs']) sources[name] = sha(await readFile(join(here, name)));
  const cli = await readFile(join(dependencies, 'node_modules', CLI_PATH), 'utf8'), renderer = rapierZenUMLRenderer(cli);
  const marked = JSON.parse(await readFile(join(dependencies, 'node_modules/marked/package.json'), 'utf8'));
  const result = await esbuild.build({entryPoints: [entry], bundle: true, write: false, format: 'iife', globalName: 'RapierZenUML', target: 'es2022', platform: 'browser',
    minify: true, legalComments: 'none', charset: 'utf8', metafile: true, define: {RAPIER_ZENUML_FONT_FAMILY: JSON.stringify(FONT_FAMILY)},
    plugins: [{name: 'pinned-zenuml-renderer', setup(build) {
      build.onResolve({filter: /^rapier:zenuml-renderer$/}, () => ({path: 'zenuml-renderer.mjs', namespace: 'rapier'}));
      build.onLoad({filter: /.*/, namespace: 'rapier'}, () => ({contents: renderer.source, loader: 'js', resolveDir: dependencies}));
      build.onLoad({filter: /[\\/]antlr4[\\/]src[\\/]antlr4[\\/]polyfills[\\/](?:codepointat|fromcodepoint)\.js$/}, async ({path}) => {
        const name = path.replaceAll('\\', '/').split('/').at(-1), upstreamSource = await readFile(path);
        shims.push({path: 'antlr4/src/antlr4/polyfills/' + name, sha256: sha(upstreamSource)});
        return {contents: '', loader: 'js'};
      });
    }}],
    banner: {js: '/*! Rapier ZenUML | AGPL-3.0-only; includes ZenUML Core 4.5.0, MIT, ANTLR 4.11.0, BSD-3-Clause, and marked ' + marked.version + ', MIT | Licenses: rapier-zenuml-NOTICES.txt */'}});
  if (Object.values(result.metafile.outputs).some(output => output.imports.length)) throw new Error('The ZenUML resource must be self-contained');
  if (shims.length !== 2) throw new Error('The pinned ANTLR runtime must carry exactly its two String shims');
  const bytes = strictIIFE(result.outputFiles[0].contents, 'RapierZenUML');
  const output = join(repo, 'shell/vendor/zenuml/rapier-zenuml-svg-4.5.0-1.js');
  const manifestPath = join(repo, 'shell/mermaid-resources.json');
  const resources = JSON.parse(await readFile(manifestPath, 'utf8'));
  const file = resources.files.find(file => file.name === 'zenuml');
  if (!file) throw new Error('The Mermaid resource set has no ZenUML file');
  const noticeBytes = Buffer.from(['Rapier ZenUML\n\n' + await readFile(join(repo, 'LICENSE'), 'utf8'),
    'ZenUML Core ' + packageJson.dependencies['@zenuml/core'] + '\n\n' + await readFile(join(dependencies, 'node_modules/@zenuml/core/LICENSE'), 'utf8'),
    'ANTLR4 ' + packageJson.dependencies.antlr4 + '\n\n' + await readFile(join(here, 'ANTLR4-LICENSE.txt'), 'utf8'),
    'marked ' + marked.version + '\n\n' + await readFile(join(dependencies, 'node_modules/marked/LICENSE.md'), 'utf8')].join('\n\n---\n\n'));
  const core = JSON.parse(await readFile(join(dependencies, 'node_modules/@zenuml/core/package.json'), 'utf8'));
  const provenance = {adapter: '4.5.0-svg-1', npmLockSha256: sha(lock), sources, esbuild: esbuild.version,
    renderer: {path: CLI_PATH, sha256: CLI_SHA256, upstreamThemeSha256: renderer.themeSha256, patches: renderer.applied, fontFamily: FONT_FAMILY},
    target: 'es2022', strictIIFE: true, strictRecipeSha256: sha(await readFile(join(repo, 'tools/strict-iife.mjs'))),
    removedShims: shims.sort((a, b) => a.path.localeCompare(b.path)),
    core: packageJson.dependencies['@zenuml/core'], coreGitHead: core.gitHead, antlr4: packageJson.dependencies.antlr4, marked: marked.version, license: 'MIT',
    noticesSha256: sha(noticeBytes), bytes: bytes.length, sha256: sha(bytes), sha384: sha(bytes, 'sha384', 'base64')};
  const provenanceBytes = Buffer.from(JSON.stringify(provenance, null, 2) + '\n');
  const provenancePath = join(dirname(output), 'PROVENANCE.json'), noticesPath = join(dirname(output), 'rapier-zenuml-NOTICES.txt');
  const url = cdnOrigin('rapier') + 'site/plugins/rapier-zenuml-svg-4.5.0-1.js';
  if (check) {
    if (!(await readFile(output)).equals(bytes) || file.bytes !== bytes.length || file.sri !== provenance.sha384 || file.url !== url ||
        !(await readFile(provenancePath)).equals(provenanceBytes) || !(await readFile(noticesPath)).equals(noticeBytes))
      throw new Error('The ZenUML resource is not the reproducible pinned build');
  } else {
    await mkdir(dirname(output), {recursive: true});
    await writeFile(output, bytes);
    Object.assign(file, {version: '4.5.0-svg-1', url, file: 'plugins/rapier-zenuml-svg-4.5.0-1.js', path: 'shell/vendor/zenuml/rapier-zenuml-svg-4.5.0-1.js', bytes: bytes.length, sri: provenance.sha384});
    await writeFile(manifestPath, JSON.stringify(resources, null, 2) + '\n');
    await writeFile(provenancePath, provenanceBytes);
    await writeFile(noticesPath, noticeBytes);
  }
  const peleRoot = join(dependencies, 'node_modules/pele');
  // The diagram core: Pele with Rapier's flowchart editing and exact-source metadata for
  // sequence, class and state diagrams. ZenUML keeps its own resource above.
  const coreBuild = await esbuild.build({entryPoints: [join(here, 'api.mjs')], bundle: true, write: false, format: 'iife', globalName: 'pele',
    target: 'es2022', platform: 'browser', minify: true, legalComments: 'none', charset: 'utf8', metafile: true,
    plugins: [{name: 'pinned-pele-module', setup(build) { build.onResolve({filter: /^pele$/}, () => ({path: join(peleRoot, 'dist/pele.js')})); }}],
    banner: {js: '/*! Rapier diagram core | AGPL-3.0-only; includes Pele 1.9.0, MIT | Licenses: LICENSE */'}});
  if (Object.values(coreBuild.metafile.outputs).some(output => output.imports.length)) throw new Error('The diagram core must be self-contained');
  const coreBytes = strictIIFE(coreBuild.outputFiles[0].contents, 'pele'), coreName = 'pele-1.9.0-native-1.js';
  const coreSources = {};
  for (const path of ['shell/mermaid/api.mjs', 'draw/flowchart-mermaid.mjs']) coreSources[path] = sha(await readFile(join(repo, path)));
  const coreNotice = Buffer.from((await readFile(join(repo, 'LICENSE'), 'utf8')) + '\n\nPele 1.9.0\n\n' + await readFile(join(peleRoot, 'LICENSE'), 'utf8'));
  const pelePin = resources.files.find(file => file.name === 'core');
  const peleLock = JSON.parse(lock).packages['node_modules/pele'];
  const peleProvenance = {package: 'pele', version: packageJson.dependencies.pele, source: 'https://github.com/obsidianmd/pele', path: 'dist/pele.js',
    sourceSha256: sha(await readFile(join(peleRoot, 'dist/pele.js'))), tarball: peleLock.resolved, integrity: peleLock.integrity, license: 'MIT', sources: coreSources,
    build: {esbuild: esbuild.version, target: 'es2022', format: 'iife', globalName: 'pele', minify: true, nativeClassFields: true, strictIIFE: true},
    strictRecipeSha256: sha(await readFile(join(repo, 'tools/strict-iife.mjs'))), npmLockSha256: sha(lock), bytes: coreBytes.length, sha256: sha(coreBytes),
    sha384: sha(coreBytes, 'sha384', 'base64'), noticesSha256: sha(coreNotice)};
  const peleDirectory = join(repo, 'shell/vendor/pele'), peleRecord = Buffer.from(JSON.stringify(peleProvenance, null, 2) + '\n');
  const coreUrl = cdnOrigin('rapier') + 'site/plugins/' + coreName;
  if (check) {
    if (!(await readFile(join(peleDirectory, coreName))).equals(coreBytes) ||
        pelePin.bytes !== coreBytes.length || pelePin.sri !== peleProvenance.sha384 || pelePin.url !== coreUrl || pelePin.version !== '1.9.0-native-1' ||
        !(await readFile(join(peleDirectory, 'PROVENANCE.json'))).equals(peleRecord) ||
        !(await readFile(join(peleDirectory, 'LICENSE'))).equals(coreNotice))
      throw new Error('The diagram core is not the reproducible pinned build');
  } else {
    await mkdir(peleDirectory, {recursive: true});
    await writeFile(join(peleDirectory, coreName), coreBytes);
    await writeFile(join(peleDirectory, 'LICENSE'), coreNotice);
    await writeFile(join(peleDirectory, 'PROVENANCE.json'), peleRecord);
    Object.assign(pelePin, {version: '1.9.0-native-1', url: coreUrl, file: 'plugins/' + coreName, path: 'shell/vendor/pele/' + coreName, bytes: coreBytes.length, sri: peleProvenance.sha384});
    await writeFile(manifestPath, JSON.stringify(resources, null, 2) + '\n');
  }
  console.log(JSON.stringify({zenuml: provenance, pele: peleProvenance, checked: check}, null, 2));
} finally { if (temporary) await rm(temporary, {recursive: true, force: true}); }
