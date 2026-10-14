// SPDX-License-Identifier: MIT
// Verify each carried owner once and rebuild both current runtime formats.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assembleMath} from '../src/tools/build-math.mjs';
import {mathReadme} from '../src/math/package-readme.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFile(resolve(root, path));
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const resources = JSON.parse(await read('docs/math-resources.json'));
const payload = await read(resources.packageBundle);
assert.equal(payload.length, resources.bytes, 'payload length');
assert.equal(hash(payload), resources.sha256, 'payload SHA-256');
assert.equal(hash(payload, 'sha384', 'base64'), resources.sha384, 'payload SHA-384');
const paths = new Set();
for (const file of ['stream.mjs', 'stream.d.ts', 'reuse.mjs', 'integration.mjs'])
  assert.equal(resources.adoption.filter(input => input.file === 'math/' + file && input.packageFile === 'dist/' + file).length,
    1, file + ': one required package/source owner');
for (const input of [...resources.sources, ...resources.recipe, ...resources.adoption]) {
  assert(!paths.has(input.packageFile), 'one public location per owner');
  paths.add(input.packageFile);
  const bytes = await read(input.packageFile);
  assert.equal(bytes.length, input.bytes, input.file + ': length');
  assert.equal(hash(bytes), input.sha256, input.file + ': SHA-256');
}
const rendererLicense = await read('src/math/LICENSE-MIT');
const fontLicense = await read('src/math/FONT-LICENSE.txt');
assert.equal(hash(fontLicense), resources.font.licenseSha256, 'font license SHA-256');
for (const text of [payload, await read('LICENSE')]) {
  assert(text.includes(rendererLicense.toString('utf8').trim()), 'complete renderer license');
  assert(text.includes(fontLicense.toString('utf8').trim()), 'complete font license');
}
const sbom = JSON.parse(await read('docs/math-components.json'));
const font = sbom.packages.find(item => item.name === resources.font.name);
assert.equal(font?.copyrightText, resources.font.copyright, 'font copyright');
assert.equal(font.licenseDeclared, resources.font.license, 'font license identity');
assert.equal(sbom.hasExtractedLicensingInfos.find(item => item.licenseId === resources.font.license)?.extractedText,
  fontLicense.toString('utf8'), 'complete extracted font license');
assert.equal((await read('README.md')).toString('utf8'), mathReadme(resources), 'generated README');
const rebuilt = await assembleMath({root, packageLayout: true});
assert.deepEqual(rebuilt.bytes, payload, 'rebuilt classic payload');
for (const [file, content] of rebuilt.modules)
  assert.equal((await read(file)).toString('utf8'), content, 'rebuilt native module: ' + file);
console.log(JSON.stringify({file: resources.packageBundle, bytes: payload.length, sha256: resources.sha256,
  sourceFiles: paths.size, rebuild: 'exact', licenses: 'complete'}));
