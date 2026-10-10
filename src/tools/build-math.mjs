// SPDX-License-Identifier: MIT
// Assemble the complete SVG math renderer from its own source and embedded font paths.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {Script} from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const MATH_VERSION = '1.0.0';
export const MATH_BUNDLE = 'rapier-math-' + MATH_VERSION + '.js';
export const MATH_SOURCES = ['font.js', 'symbols.js', 'parser.js', 'layout.js', 'fallbacks.js', 'responsive.js', 'browser.js', 'api.js'].map(name => 'math/' + name);
export const MATH_RECIPE = ['math/build-font.py', 'math/FONT-SOURCE.md', 'math/FONT-LICENSE.txt', 'math/package-verify.mjs', 'tools/build-math.mjs', 'LICENSE-MIT'];
const FONT = {
  name: 'Latin Modern Math', version: '1.959', license: 'LicenseRef-GUST-Font-License',
  licenseName: 'GUST Font License',
  source: 'https://mirror.apps.cam.ac.uk/pub/tex-archive/fonts/lm-math/opentype/latinmodern-math.otf',
  sourceSha256: '6075562b771f8b82f0c179e363389684f2dd09de30038269e2628e504bd7be0f',
  copyright: 'Copyright 2012--2014 for Latin Modern Math OTF by B. Jackowski, P. Strzelczyk and P. Pianowski (on behalf of TeX users groups). This work is released under the GUST Font License -- see http://tug.org/fonts/licenses/GUST-FONT-LICENSE.txt for details.',
  licenseSource: 'https://mirror.apps.cam.ac.uk/pub/tex-archive/fonts/lm-math/doc/GUST-FONT-LICENSE.txt',
  licenseFile: 'math/FONT-LICENSE.txt',
  licenseSha256: '91ded9a2a371cbeff028bfaf3bd3e97fddfb68af6f186aa261bfaff35baf800c',
};
const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);

async function fontLicense(root) {
  const bytes = await readFile(resolve(root, FONT.licenseFile));
  if (digest(bytes) !== FONT.licenseSha256 || !bytes.includes(FONT.copyright))
    throw new Error('The math font license differs from its source pin');
  return bytes;
}

export async function fillMathLicense(markup, {root = ROOT} = {}) {
  const marker = '<pre class="license-text" data-license="math-font"></pre>';
  if (markup.split(marker).length !== 2) throw new Error('The math font license needs one sheet entry');
  const escaped = (await fontLicense(root)).toString('utf8').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return markup.replace(marker, () => '<pre class="license-text">' + escaped + '</pre>');
}

export async function buildMath({root = ROOT, updatePins = true} = {}) {
  const inputs = [];
  for (const file of MATH_SOURCES) {
    const bytes = await readFile(resolve(root, file));
    inputs.push({file, bytes, text: bytes.toString('utf8')});
  }
  const license = await fontLicense(root);
  if (!inputs[0].text.includes(license.toString('utf8').trim())) throw new Error('The embedded math font is missing its complete license');
  const ownLicense = await readFile(resolve(root, 'LICENSE-MIT'), 'utf8');
  const bytes = Buffer.from('/*!\n' + ownLicense.trim() + '\n*/\n(function(){\n\'use strict\';\n' + inputs.map(input => input.text.trimEnd()).join('\n\n') + '\n})();\n');
  new Script(bytes.toString('utf8'), {filename: MATH_BUNDLE});
  const gzipBytes = gzipSync(bytes, {level: 9}).length;
  if (gzipBytes >= 500_000) throw new Error('The math plugin exceeds its 500 KB gzip budget: ' + gzipBytes);
  const sha256 = digest(bytes), sha384 = digest(bytes, 'sha384', 'base64');
  const recipe = [];
  for (const file of MATH_RECIPE) {
    const content = await readFile(resolve(root, file));
    recipe.push({file, bytes: content.length, sha256: digest(content)});
  }
  const resources = {
    bundle: MATH_BUNDLE, version: MATH_VERSION, license: 'MIT AND ' + FONT.license,
    bytes: bytes.length, gzipBytes, sha256, sha384,
    sources: inputs.map(input => ({file: input.file, bytes: input.bytes.length, sha256: digest(input.bytes)})),
    recipe,
    components: [{name: FONT.name, version: FONT.version, license: FONT.license, source: FONT.source, sha256: FONT.sourceSha256}],
    font: {...FONT, licenseBytes: license.length},
  };
  const vendor = resolve(root, 'shell/vendor');
  await mkdir(vendor, {recursive: true});
  await writeFile(resolve(vendor, MATH_BUNDLE), bytes);
  await writeFile(resolve(root, 'shell/math-resources.json'), JSON.stringify(resources, null, 2) + '\n');
  const provenancePath = resolve(vendor, 'PROVENANCE.json');
  const provenance = existsSync(provenancePath) ? JSON.parse(await readFile(provenancePath, 'utf8')) : {files: {}};
  provenance.files[MATH_BUNDLE] = {
    package: 'rapier-math', version: MATH_VERSION, path: 'tools/build-math.mjs; math/; shell/math-resources.json',
    license: 'MIT AND ' + FONT.license + ' (LICENSE-MIT; math/FONT-LICENSE.txt)', bytes: bytes.length, sha256,
  };
  await writeFile(provenancePath, JSON.stringify(provenance, null, 2) + '\n');
  const loaderPath = resolve(root, 'shell/plugin-loader.js');
  if (updatePins && existsSync(loaderPath)) {
    const loader = await readFile(loaderPath, 'utf8');
    const block = /(key: 'math',[\s\S]*?bytes: )\d+(,[\s\S]*?sri: ')[^']+(')/;
    if (!block.test(loader)) throw new Error('The math loader pin could not be located');
    await writeFile(loaderPath, loader.replace(block, (_, before, middle, after) => before + bytes.length + middle + sha384 + after));
  }
  return {bundle: MATH_BUNDLE, bytes: bytes.length, gzipBytes, sha256, sha384};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await buildMath({root: process.argv[2] ? resolve(process.argv[2]) : ROOT})));
}
