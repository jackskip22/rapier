// SPDX-License-Identifier: AGPL-3.0-only
export const PUBLIC_TEST_ROWS = Object.freeze([
  '_live-merge-source',
  '_raw-html-authority-source',
  'security-svg-sanitizer',
]);

export const PUBLIC_TEST_FILES = Object.freeze([
  'tools/test-public.mjs',
  'tools/public-tests.mjs',
  ...PUBLIC_TEST_ROWS.map(name => 'tools/witnesses/' + name + '.mjs'),
  'tools/witnesses/_live-queue-cells.mjs',
  'tools/witnesses/_svg-download-security.mjs',
  'tools/witnesses/_image-inspection-security.mjs',
  'tools/witnesses/_draw-source.mjs',
  'tools/witnesses/_refraction-rendition-fixture.mjs',
  'tools/witnesses/_exactness-browser-parser.mjs',
  'tools/check-satellite-support.mjs',
  'images/jxl/public/test/seeds/jxl-rs-default-squeeze.jxl',
  'images/jxl/public/test/seeds/jxl-rs-subnormal.jxl',
  'tools/witnesses/fixtures/jxl-admission/libjxl-epf3-q50.jxl',
  'tools/witnesses/fixtures/jxl-admission/libjxl-progressive-q75.jxl',
  'tools/witnesses/fixtures/jxl-admission/libjxl-modular-q50-epf2.jxl',
]);
