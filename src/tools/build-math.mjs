// SPDX-License-Identifier: MIT
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {Script} from 'node:vm';
import {mathPackagePath, MATH_CLASSIC} from '../math/package-layout.mjs';
import {mathModules, mathClassicSource} from '../math/package-build.mjs';
import {mathReadme} from '../math/package-readme.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MATH_VERSION = '2.6.1';
export const MATH_BUNDLE = 'rapier-math-' + MATH_VERSION + '.js';
export const MATH_SOURCES = ['font.js', 'symbols.js', 'parser.js', 'source.js', 'variants.js', 'layout.js', 'fallbacks.js', 'responsive.js', 'api.js', 'browser.js', 'mathml.js', 'semantic-api.js', 'combined.js', 'classic.js'].map(name => 'math/' + name);
export const MATH_RECIPE = ['math/build-font.py', 'math/FONT-SOURCE.md', 'math/FONT-LICENSE.txt', 'math/package-verify.mjs', 'tools/build-math.mjs', 'math/LICENSE-MIT', 'math/adoption-verify.mjs', 'math/package-build.mjs', 'math/package-layout.mjs', 'math/package-check.mjs', 'math/package-readme.mjs', 'math/README.md', 'math/CHANGELOG.md', 'math/SEMANTICS.md', 'math/semantic-verify.mjs', 'math/typeset-verify.mjs'];
export const MATH_ADOPTION = ['delimiters.mjs', 'markdown-rules.mjs', 'reuse.mjs', 'integration.mjs', 'markdown-it.mjs', 'rehype.mjs', 'stream.mjs',
  'accessible.mjs', 'accessible.css', 'mathml.d.ts', 'combined.d.ts', 'accessible.d.ts',
  'index.d.ts', 'classic.d.ts', 'delimiters.d.ts', 'integration.d.ts', 'markdown-it.d.ts', 'rehype.d.ts', 'stream.d.ts',
  'examples/semantic.mjs', 'examples/accessible.html', 'examples/accessible.mjs', 'examples/formula.mjs', 'examples/markdown.mjs', 'examples/stream.mjs', 'examples/unified.mjs',
  'examples/browser.html', 'examples/browser.mjs', 'examples/react.tsx', 'examples/worker.mjs', 'examples/README.md']
  .map(file => ({file: 'math/' + file, packageFile: mathPackagePath('math/' + file)}));
const FONT = {
  name: 'Latin Modern Math', version: '1.959', license: 'LicenseRef-GUST-Font-License',
  licenseName: 'GUST Font License',
  source: 'https://mirror.apps.cam.ac.uk/pub/tex-archive/fonts/lm-math/opentype/latinmodern-math.otf',
  sourceSha256: '6075562b771f8b82f0c179e363389684f2dd09de30038269e2628e504bd7be0f',
  copyright: 'Copyright 2012--2014 for Latin Modern Math OTF by B. Jackowski, P. Strzelczyk and P. Pianowski (on behalf of TeX users groups). This work is released under the GUST Font License -- see http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt for details.',
  licenseSource: 'https://mirror.apps.cam.ac.uk/pub/tex-archive/fonts/lm-math/doc/GUST-FONT-LICENSE.txt',
  licenseFile: 'math/FONT-LICENSE.txt',
  licenseSha256: '6fb288a3363cb44eb0e247ead8afefed55fbe9b00ff2d0d1c75a1176d38f4091',
};
const MONO = {
  name: 'Latin Modern Mono', version: '2.004', license: FONT.license,
  source: 'https://ftp.riken.jp/CTAN/fonts/lm/fonts/opentype/public/lm/lmmono10-regular.otf',
  sha256: '22deb6d3be3ffcb40b33f0e010afb256c677d97c2a2bdee1f5740cdc97751558',
  copyright: 'Copyright 2003, 2009 B. Jackowski and J. M. Nowacki (on behalf of TeX users groups). This work is released under the GUST Font License --  see http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt for details.',
  note: 'Monospace sharp s outline and advance; complete license in math-font-LICENSE.txt',
};
const HOOK = {
  name: 'Latin Modern Math Italic10 Regular', version: '2.003', license: FONT.license,
  source: 'https://ftp.riken.jp/CTAN/fonts/lm/fonts/type1/public/lm/lmmi10.pfb',
  sha256: 'c24662506b402f3e0033cc75eb746eb490a1b7477e6b3ef52053f5025ec0fc57',
  copyright: 'Copyright 2003--2009 by B. Jackowski and J.M. Nowacki (on behalf of TeX USERS GROUPS).',
  note: 'Small arrow hook outline; the composer supplies its advance; complete license in math-font-LICENSE.txt',
};
const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);

async function fontLicense(root, packageLayout = false) {
  const bytes = await readFile(resolve(root, packageLayout ? mathPackagePath(FONT.licenseFile) : FONT.licenseFile));
  if (digest(bytes) !== FONT.licenseSha256 || !bytes.includes(FONT.copyright) || !bytes.includes(MONO.copyright) || !bytes.includes(HOOK.copyright))
    throw new Error('The math font license differs from its source pin');
  return bytes;
}

export async function fillMathLicense(markup, {root = ROOT} = {}) {
  const marker = '<pre class="license-text" data-license="math-font"></pre>';
  if (markup.split(marker).length !== 2) throw new Error('The math font license needs one sheet entry');
  const escaped = (await fontLicense(root)).toString('utf8').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return markup.replace(marker, () => '<pre class="license-text">' + escaped + '</pre>');
}

export async function assembleMath({root = ROOT, packageLayout = false} = {}) {
  const read = file => readFile(resolve(root, packageLayout ? mathPackagePath(file) : file));
  const inputs = [];
  for (const file of MATH_SOURCES) {
    const bytes = await read(file);
    inputs.push({file, bytes, text: bytes.toString('utf8')});
  }
  const license = await fontLicense(root, packageLayout);
  if (!inputs[0].text.includes(FONT.copyright) || !inputs[0].text.includes('Complete license: FONT-LICENSE.txt')) throw new Error('The embedded math font is missing its notice');
  // The single-file bundle travels alone, so it carries both complete licenses itself.
  const ownLicense = (await read('math/LICENSE-MIT')).toString('utf8');
  const bytes = Buffer.from('/*!\n' + ownLicense.trim() + '\n*/\n/*!\n' + license.toString('utf8').trim() + '\n*/\n(function(){\n\'use strict\';\n' + inputs.map(input => mathClassicSource(input.text)).join('\n\n') + '\n})();\n');
  new Script(bytes.toString('utf8'), {filename: MATH_BUNDLE});
  const gzipBytes = gzipSync(bytes, {level: 9}).length;
  if (gzipBytes >= 500_000) throw new Error('The math plugin exceeds its 500 KB gzip budget: ' + gzipBytes);
  const sha256 = digest(bytes), sha384 = digest(bytes, 'sha384', 'base64');
  const recipe = [];
  for (const file of MATH_RECIPE) {
    const content = await read(file);
    recipe.push({file, packageFile: mathPackagePath(file), bytes: content.length, sha256: digest(content)});
  }
  const resources = {
    bundle: MATH_BUNDLE, packageBundle: MATH_CLASSIC, version: MATH_VERSION, license: 'MIT AND ' + FONT.license,
    bytes: bytes.length, gzipBytes, sha256, sha384,
    sources: inputs.map(input => ({file: input.file, packageFile: mathPackagePath(input.file), bytes: input.bytes.length, sha256: digest(input.bytes)})),
    recipe,
    components: [{name: FONT.name, version: FONT.version, license: FONT.license, source: FONT.source, sha256: FONT.sourceSha256, copyright: FONT.copyright}, MONO, HOOK],
    font: {...FONT, licenseBytes: license.length},
  };
  resources.adoption = [];
  for (const {file, packageFile} of MATH_ADOPTION) {
    const content = await read(file);
    resources.adoption.push({file, packageFile, bytes: content.length, sha256: digest(content)});
  }
  return {resources, bytes, modules: mathModules(MATH_VERSION)};
}

export async function buildMath({root = ROOT, updatePins = true, packageLayout = false} = {}) {
  const {resources, bytes, modules} = await assembleMath({root, packageLayout});
  if (packageLayout) {
    await mkdir(resolve(root, 'dist'), {recursive: true});
    await writeFile(resolve(root, MATH_CLASSIC), bytes);
    for (const [file, content] of modules) {
      await mkdir(dirname(resolve(root, file)), {recursive: true});
      await writeFile(resolve(root, file), content);
    }
    await writeFile(resolve(root, 'docs/math-resources.json'), JSON.stringify(resources, null, 2) + '\n');
    await writeFile(resolve(root, 'README.md'), mathReadme(resources));
    const sbomPath = resolve(root, 'docs/math-components.json');
    const sbom = JSON.parse(await readFile(sbomPath, 'utf8'));
    sbom.packages.find(item => item.name === 'rapier-math').checksums = [{algorithm: 'SHA256', checksumValue: resources.sha256}];
    sbom.documentNamespace = 'https://rapier.website/spdx/rapier-math-' + resources.version + '-' + resources.sha256;
    await writeFile(sbomPath, JSON.stringify(sbom, null, 2) + '\n');
    return {bundle: MATH_CLASSIC, bytes: bytes.length, sha256: resources.sha256};
  }
  const {sha256, sha384, gzipBytes} = resources;
  const vendor = resolve(root, 'shell/vendor');
  await mkdir(vendor, {recursive: true});
  await writeFile(resolve(vendor, MATH_BUNDLE), bytes);
  await writeFile(resolve(root, 'shell/math-resources.json'), JSON.stringify(resources, null, 2) + '\n');
  const provenancePath = resolve(vendor, 'PROVENANCE.json');
  const provenance = existsSync(provenancePath) ? JSON.parse(await readFile(provenancePath, 'utf8')) : {files: {}};
  provenance.files[MATH_BUNDLE] = {
    package: 'rapier-math', version: MATH_VERSION, path: 'tools/build-math.mjs; math/; shell/math-resources.json',
    license: 'MIT AND ' + FONT.license + ' (math/LICENSE-MIT; math/FONT-LICENSE.txt)', bytes: bytes.length, sha256,
  };
  await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
  const loaderPath = resolve(root, 'shell/plugin-loader.js');
  if (updatePins && existsSync(loaderPath)) {
    const loader = await readFile(loaderPath, 'utf8');
    const block = /(key: 'math',[\s\S]*?bytes: )\d+(,[\s\S]*?sri: ')[^']+(')/;
    if (!block.test(loader)) throw new Error('The math loader pin could not be located');
    const version = /var MATH_VERSION = '[^']+';/;
    if (!version.test(loader)) throw new Error('The math loader version could not be located');
    const cdn = /(key: 'math',[\s\S]*?url: '(https:\/\/cdn\.jsdelivr\.net\/gh\/jackskip22\/rapier-plugins@[^/']+\/)math\/)[^']+(')/;
    if (!cdn.test(loader)) throw new Error('The math loader CDN pin could not be located');
    await writeFile(loaderPath, loader.replace(version, "var MATH_VERSION = '" + MATH_VERSION + "';")
      .replace(block, (_, before, middle, after) => before + bytes.length + middle + sha384 + after)
      .replace(cdn, (_, before, origin, after) => before + MATH_BUNDLE + after));
  }
  return {bundle: MATH_BUNDLE, bytes: bytes.length, gzipBytes, sha256, sha384};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const packageLayout = process.argv[2] === '--package';
  const directory = process.argv[packageLayout ? 3 : 2];
  console.log(JSON.stringify(await buildMath({root: directory ? resolve(directory) : ROOT, packageLayout})));
}
