// SPDX-License-Identifier: MIT
// Verify each carried owner once and rebuild both current runtime formats.
import assert from 'node:assert/strict';
import {readFile, writeFile, cp, mkdtemp, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, resolve, join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assembleMath} from '../src/tools/build-math.mjs';
import {mathReadme} from '../src/math/package-readme.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFile(resolve(root, path));
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
const receipt = await read('docs/math-resources.json');
const resources = JSON.parse(receipt);
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
const renderers = sbom.packages.filter(item => item.name === 'rapier-math');
assert.equal(renderers.length, 1, 'one renderer provenance identity');
assert.equal(renderers[0].sourceInfo,
  'Verified public build inputs: docs/math-resources.json (SHA-256 ' + hash(receipt) + ').',
  'public build receipt path and SHA-256');
const font = sbom.packages.find(item => item.name === resources.font.name);
assert.equal(font?.copyrightText, resources.font.copyright, 'font copyright');
assert.equal(font.licenseDeclared, resources.font.license, 'font license identity');
for (const component of resources.components) {
  const entries = sbom.packages.filter(item => item.name === component.name);
  assert.equal(entries.length, 1, component.name + ': one component identity');
  const [entry] = entries;
  assert.equal(entry.versionInfo, component.version, component.name + ': version');
  assert.equal(entry.downloadLocation, component.source, component.name + ': source');
  assert.deepEqual(entry.checksums, [{algorithm: 'SHA256', checksumValue: component.sha256}], component.name + ': source hash');
  assert.equal(entry.licenseDeclared, component.license, component.name + ': license');
  assert.equal(entry.copyrightText, component.copyright, component.name + ': original copyright');
  assert(fontLicense.includes(component.copyright), component.name + ': copyright travels with its outlines');
}
assert.equal(sbom.hasExtractedLicensingInfos.find(item => item.licenseId === resources.font.license)?.extractedText,
  fontLicense.toString('utf8'), 'complete extracted font license');
assert.equal((await read('README.md')).toString('utf8'), mathReadme(resources), 'generated README');
const rebuilt = await assembleMath({root, packageLayout: true});
assert.deepEqual(rebuilt.bytes, payload, 'rebuilt classic payload');
for (const [file, content] of rebuilt.modules)
  assert.equal((await read(file)).toString('utf8'), content, 'rebuilt native module: ' + file);

// Run the public rebuild command without the private checks supplied by staging.
// Rebuilding must also refresh provenance when the developer edits carried source.
const scratch = await mkdtemp(join(tmpdir(), 'rapier-math-rebuild-'));
try {
  const standalone = join(scratch, 'package');
  await cp(root, standalone, {recursive: true, filter: path =>
    path !== resolve(root, 'tests') && path !== resolve(root, 'node_modules')});
  const rebuild = () => execFileSync(process.execPath, ['src/tools/build-math.mjs', '--package', '.'],
    {cwd: standalone, stdio: ['ignore', 'ignore', 'inherit']});
  rebuild();
  assert.deepEqual(await readFile(join(standalone, resources.packageBundle)), payload, 'standalone public rebuild');
  assert.deepEqual(await readFile(join(standalone, 'docs/math-resources.json')), receipt, 'public receipt has only shipped inputs');
  const edited = join(standalone, 'src/math/classic.js');
  await writeFile(edited, await readFile(edited, 'utf8') + '\n// Local source edit.\n');
  rebuild();
  const updatedReceipt = await readFile(join(standalone, 'docs/math-resources.json'));
  const updated = JSON.parse(updatedReceipt);
  const updatedSbom = JSON.parse(await readFile(join(standalone, 'docs/math-components.json')));
  const updatedPackage = updatedSbom.packages.find(item => item.name === 'rapier-math');
  assert.notEqual(updated.sha256, resources.sha256, 'edited source changes the payload');
  assert.equal(updated.sha256, hash(await readFile(join(standalone, updated.packageBundle))), 'edited payload identity');
  assert.equal(updatedPackage.sourceInfo,
    'Verified public build inputs: docs/math-resources.json (SHA-256 ' + hash(updatedReceipt) + ').',
    'edited source refreshes the public receipt identity');
  assert.deepEqual(updatedPackage.checksums, [{algorithm: 'SHA256', checksumValue: updated.sha256}], 'edited component payload');
} finally { await rm(scratch, {recursive: true, force: true}); }
console.log(JSON.stringify({file: resources.packageBundle, bytes: payload.length, sha256: resources.sha256,
  sourceFiles: paths.size, rebuild: 'exact', licenses: 'complete'}));
