// SPDX-License-Identifier: AGPL-3.0-only
// Rebuild the offline SVG vendor from the exact npm versions in shell/math-resources.json.
// node tools/vendor-math.mjs <node_modules>; ordinary page builds use the pinned bundle.
import {readFile, readdir, writeFile, mkdir, realpath} from 'node:fs/promises';
import {resolve, dirname, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modules = resolve(process.argv[2] || 'node_modules');
const resourcesPath = resolve(root, 'shell/math-resources.json');
const resources = JSON.parse(await readFile(resourcesPath, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const componentRoots = new Map();
for (const pin of [...resources.components, resources.bundler]) {
  const pkg = JSON.parse(await readFile(resolve(modules, pin.name, 'package.json'), 'utf8'));
  if (pkg.name !== pin.name || pkg.version !== pin.version) throw new Error('Install the pinned package: ' + pin.name + '@' + pin.version);
  if (pkg.license !== pin.license) throw new Error('Math package licence differs from its pin: ' + pin.name);
  componentRoots.set(pin.name, await realpath(resolve(modules, pin.name)));
}
const {build} = await import(pathToFileURL(resolve(modules, 'esbuild/lib/main.js')));
const texRoot = resolve(modules, '@mathjax/src/mjs/input/tex');
const configurations = [];
for (const dir of await readdir(texRoot, {withFileTypes: true})) {
  if (!dir.isDirectory() || ['setoptions', 'texhtml'].includes(dir.name)) continue;
  for (const file of await readdir(resolve(texRoot, dir.name)))
    if (file.endsWith('Configuration.js')) configurations.push({name: dir.name, file: '@mathjax/src/mjs/input/tex/' + dir.name + '/' + file});
}
configurations.sort((a, b) => a.name.localeCompare(b.name));
const ranges = (await readdir(resolve(modules, '@mathjax/mathjax-newcm-font/mjs/svg/dynamic'))).filter(file => file.endsWith('.js')).sort();
const extensions = resources.components.filter(pin => pin.name.endsWith('-font-extension'));
const license = await readFile(resolve(modules, '@mathjax/src/LICENSE'), 'utf8');
const chemistryLicense = await readFile(resolve(modules, 'mhchemparser/LICENSE.txt'), 'utf8');
const fontLicenses = [];
for (const item of resources.fontLicenses) {
  const texts = item.text ? [item.text] : [];
  for (const file of item.files || []) {
    const bytes = await readFile(resolve(root, 'shell/vendor', file.file));
    if (bytes.length !== file.bytes || hash(bytes) !== file.sha256) throw new Error('Math font licence differs from its pin: ' + file.file);
    texts.push(bytes.toString('utf8'));
  }
  fontLicenses.push(item.id + ': ' + item.name + '\n' + item.source + '\n\n' + texts.join('\n\n'));
}
const fontNotice = '\n\nOriginal font attributions for the SVG glyph data\n' +
  'Glyph outlines are unchanged from the pinned MathJax font packages. This build combines their JavaScript data and preloads all ranges.\n' +
  resources.fontNotices.map(item => '\n' + item.package + '\n' + item.notices.join('\n\n')).join('\n') +
  '\n\n' + fontLicenses.join('\n\n');
const notice = resources.components.filter(pin => pin.name.startsWith('@mathjax/')).map(pin => pin.name + ' ' + pin.version + ' (' + pin.license + ')').join('\n') + '\n' +
  'https://github.com/mathjax/MathJax-src\nhttps://github.com/mathjax/MathJax-fonts\n' +
  'Source-derived SVG bundle: all font ranges and permitted TeX packages are preloaded; external loading is disabled.\n\n' + license + '\n\nmhchemparser ' +
  resources.components.find(pin => pin.name === 'mhchemparser').version + '\nhttps://github.com/mhchem/mhchemParser\n\n' + chemistryLicense + fontNotice;
const imports = [
  "import {mathjax} from '@mathjax/src/mjs/mathjax.js';",
  "import {TeX} from '@mathjax/src/mjs/input/tex.js';",
  "import {SVG} from '@mathjax/src/mjs/output/svg.js';",
  "import {liteAdaptor} from '@mathjax/src/mjs/adaptors/liteAdaptor.js';",
  "import {RegisterHTMLHandler} from '@mathjax/src/mjs/handlers/html.js';",
  "import {SafeHandler} from '@mathjax/src/mjs/ui/safe/SafeHandler.js';",
  "import {Safe} from '@mathjax/src/mjs/ui/safe/safe.js';",
  "import {Loader, CONFIG as loaderConfig} from '@mathjax/src/mjs/components/loader.js';",
  "import {dependencies} from '@mathjax/src/components/mjs/dependencies.js';",
  "import {MathJaxNewcmFont} from '@mathjax/mathjax-newcm-font/mjs/svg.js';",
  `import {createMathRenderer} from ${JSON.stringify(resolve(root, 'shell/math-renderer.mjs'))};`,
  ...configurations.map(row => `import ${JSON.stringify(row.file)};`),
  ...ranges.map(file => `import '@mathjax/mathjax-newcm-font/mjs/svg/dynamic/${file}';`),
  ...extensions.map((pin, index) => `import * as extension${index} from '${pin.name}/mjs/svg.js';`),
];
const entry = imports.join('\n') + '\nglobalThis.RapierMath = createMathRenderer({mathjax, TeX, SVG, liteAdaptor, RegisterHTMLHandler, SafeHandler, Safe, MathJaxNewcmFont, Loader, loaderConfig, dependencies, ' +
  'fontExtensions: [' + extensions.map((_, index) => `Object.values(extension${index})[0]`).join(', ') + '], ' +
  'packages: ' + JSON.stringify(configurations.map(row => row.name)) + ', version: ' + JSON.stringify(resources.components[0].version) + '});\n';
const output = await build({stdin: {contents: entry, resolveDir: modules, sourcefile: 'math-entry.mjs'},
  absWorkingDir: modules, bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser', target: 'es2022',
  minify: true, legalComments: 'inline', define: {'import.meta.url': '"file:///mathjax.js"'},
  banner: {js: '/*!\n' + notice + '\n*/'}});
if (output.outputFiles.length !== 1 || Object.values(output.metafile.outputs).some(file => file.imports.length)) throw new Error('Math bundle has an external import or asset');
const bytes = output.outputFiles[0].contents;
await writeFile(resolve(root, 'shell/vendor', resources.bundle), bytes);
resources.packages = configurations.map(row => row.name);
resources.fontRanges = ranges.map(file => file.slice(0, -3)).sort();
// Preserve the upstream resource inventory and one glyph from every deferred range as
// package data. The packed-resource witness verifies those glyphs without font downloads.
const {MathJaxNewcmFont} = await import(pathToFileURL(resolve(modules, '@mathjax/mathjax-newcm-font/mjs/svg.js')));
for (const file of ranges) await import(pathToFileURL(resolve(modules, '@mathjax/mathjax-newcm-font/mjs/svg/dynamic', file)));
const font = new MathJaxNewcmFont();
const dynamicNames = Object.keys(MathJaxNewcmFont.dynamicFiles).sort();
if (JSON.stringify(dynamicNames) !== JSON.stringify(resources.fontRanges)) throw new Error('Math font inventory is incomplete');
resources.fontVariants = Object.keys(MathJaxNewcmFont.defaultChars).sort();
resources.fontProbes = [];
for (const name of dynamicNames) {
  const range = MathJaxNewcmFont.dynamicFiles[name];
  range.setup(font);
  let probe;
  for (const [variant, codes] of Object.entries(range.variants)) {
    for (const value of codes) {
      const [first, last] = Array.isArray(value) ? value : [value, value];
      for (let codePoint = first; codePoint <= last; codePoint++) {
        if (font.variant[variant]?.chars[codePoint]?.[3]?.p) {probe = {range: name, variant, codePoint}; break;}
      }
      if (probe) break;
    }
    if (probe) break;
  }
  if (!probe) throw new Error('No SVG glyph in math font range: ' + name);
  resources.fontProbes.push(probe);
}
resources.inputs = [];
for (const name of Object.keys(output.metafile.inputs).filter(name => name !== 'math-entry.mjs').sort()) {
  const path = resolve(modules, name), content = await readFile(path);
  const component = resources.components.find(pin => path.startsWith(componentRoots.get(pin.name) + '/'));
  const source = component ? component.name + '/' + relative(componentRoots.get(component.name), path) : relative(root, path);
  if (!component && source !== 'shell/math-renderer.mjs') throw new Error('Unpinned math bundle input: ' + source);
  resources.inputs.push({file: source, bytes: content.length, sha256: hash(content)});
}
await writeFile(resourcesPath, JSON.stringify(resources, null, 2) + '\n');
const provenancePath = resolve(root, 'shell/vendor/PROVENANCE.json');
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
provenance.files[resources.bundle] = {package: 'mathjax', version: resources.components[0].version,
  path: 'source-derived SVG bundle; tools/vendor-math.mjs; shell/math-resources.json',
  license: ['Apache-2.0', 'MIT', ...resources.fontLicenses.map(item => item.id)].join(' AND ') + ' (shell/vendor/math-NOTICE.txt; MIT adapter)',
  bytes: bytes.length, sha256: hash(bytes)};
await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
await mkdir(resolve(root, 'shell/vendor'), {recursive: true});
await writeFile(resolve(root, 'shell/vendor/math-NOTICE.txt'), notice);
await writeFile(resolve(root, 'shell/vendor/math-build-NOTICE.txt'), resources.bundler.name + ' ' + resources.bundler.version +
  '\nhttps://github.com/evanw/esbuild\nBuild tool only; no esbuild code or binary is shipped in the page.\n\n' +
  await readFile(resolve(modules, 'esbuild/LICENSE.md'), 'utf8'));
console.log(JSON.stringify({bundle: resources.bundle, bytes: bytes.length, sha256: hash(bytes), packages: resources.packages.length,
  fontRanges: ranges.length, fontExtensions: extensions.map(pin => pin.name), inputs: resources.inputs.length}));
