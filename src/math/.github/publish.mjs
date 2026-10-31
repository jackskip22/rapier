// SPDX-License-Identifier: MIT
// Publish the packed bytes, or verify that npm already holds those exact bytes.
import {readFileSync, appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const registry = 'https://registry.npmjs.org/';
const bootstrap = process.argv.includes('--bootstrap');
const report = message => {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, message + '\n');
};
if (!['rapier-diff', 'rapier-math'].includes(pkg.name) || pkg.private || !/^\d+\.\d+\.\d+$/.test(pkg.version))
  throw new Error('Refused unexpected package identity or release version.');
const [packed] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts'], {encoding: 'utf8'}));
if (packed.name !== pkg.name || packed.version !== pkg.version) throw new Error('Packed identity differs.');
const exact = await fetch(registry + pkg.name + '/' + pkg.version);
if (exact.ok) {
  const existing = await exact.json();
  if (existing.dist?.integrity !== packed.integrity) throw new Error('npm already holds different bytes at this version. Bump the version.');
  report(pkg.name + '@' + pkg.version + ' is already published with identical packed bytes.');
} else {
  if (exact.status !== 404) throw new Error('Registry lookup failed: HTTP ' + exact.status);
  if (!bootstrap) {
    const entry = await fetch(registry + pkg.name);
    if (entry.status === 404) {
      report('First publication needs the manual bootstrap workflow. Configure npm trusted publishing afterwards.');
      process.exit(0);
    }
    if (!entry.ok) throw new Error('Registry package lookup failed: HTTP ' + entry.status);
  }
  execFileSync('npm', ['publish', packed.filename, '--access', 'public', '--provenance', '--ignore-scripts'], {stdio: 'inherit'});
  report('Submitted ' + pkg.name + '@' + pkg.version + ' to npm; verify the registry before reporting it published.');
}
