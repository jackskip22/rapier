// SPDX-License-Identifier: AGPL-3.0-only
// These checks exercise source preservation and hostile-content admission in Node.
export const PUBLIC_TEST_ROWS = Object.freeze([
  '_live-merge-source',
  '_raw-html-authority-source',
  'security-svg-sanitizer',
]);

// Every test resource is explicit; selecting a row does not expose its directory.
export const PUBLIC_TEST_FILES = Object.freeze([
  'tools/test-public.mjs',
  'tools/public-tests.mjs',
  ...PUBLIC_TEST_ROWS.map(name => 'tools/witnesses/' + name + '.mjs'),
  'tools/witnesses/_exactness-browser-parser.mjs',
  'tools/check-satellite-support.mjs',
]);
