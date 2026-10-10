// SPDX-License-Identifier: MIT
// Verify a standalone package and rebuild its payload from the carried source.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const source = resolve(root, 'src');
const read = path => readFile(resolve(root, path));
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const resources = JSON.parse(await read('src/shell/math-resources.json'));
const payload = await read(resources.bundle);
assert.equal(payload.length, resources.bytes, 'payload length');
assert.equal(hash(payload), resources.sha256, 'payload SHA-256');
assert.equal(hash(payload, 'sha384', 'base64'), resources.sha384, 'payload SHA-384');
for (const input of [...resources.sources, ...resources.recipe]) {
  const bytes = await read('src/' + input.file);
  assert.equal(bytes.length, input.bytes, input.file + ': length');
  assert.equal(hash(bytes), input.sha256, input.file + ': SHA-256');
}
const rendererLicense = await read('src/LICENSE-MIT');
for (const file of ['LICENSE-MIT', 'math-LICENSE.txt']) assert.deepEqual(await read(file), rendererLicense, file);
const fontLicense = await read('src/' + resources.font.licenseFile);
assert.equal(hash(fontLicense), resources.font.licenseSha256, 'font license SHA-256');
assert.deepEqual(await read('math-font-LICENSE.txt'), fontLicense, 'font license bytes');
assert(payload.includes(rendererLicense.toString('utf8').trim()), 'payload renderer license');
assert(payload.includes(fontLicense.toString('utf8').trim()), 'payload font license');
const sbom = JSON.parse(await read('math-components.json'));
const font = sbom.packages.find(item => item.name === resources.font.name);
assert.equal(font?.copyrightText, resources.font.copyright, 'font copyright');
assert.equal(font.licenseDeclared, resources.font.license, 'font license identity');
assert.equal(sbom.hasExtractedLicensingInfos.find(item => item.licenseId === resources.font.license)?.extractedText,
  fontLicense.toString('utf8'), 'complete extracted font license');
const {buildMath} = await import('./src/tools/build-math.mjs');
await buildMath({root: source, updatePins: false});
assert.deepEqual(await read('src/shell/vendor/' + resources.bundle), payload, 'rebuilt payload bytes');
console.log(JSON.stringify({file: resources.bundle, bytes: payload.length, sha256: resources.sha256,
  sources: resources.sources.length + resources.recipe.length, rebuild: 'exact', licenses: 'complete'}));
