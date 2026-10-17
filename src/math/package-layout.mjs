// SPDX-License-Identifier: MIT
export const MATH_CLASSIC = 'dist/rapier-math.js';

// One public location per authored input. Runtime formats share dist/.
export function mathPackagePath(file) {
  const owners = {
    'math/README.md': 'docs/api.md',
    'math/CHANGELOG.md': 'CHANGELOG.md',
    'math/SEMANTICS.md': 'docs/semantics.md',
    'math/semantic-verify.mjs': 'tests/semantics.mjs',
    'math/accessible.css': 'dist/accessible.css',
    'math/FONT-SOURCE.md': 'docs/font-source.md',
    'math/package-check.mjs': 'tests/check.mjs',
    'math/package-verify.mjs': 'tests/verify.mjs',
    'math/adoption-verify.mjs': 'tests/adoption.mjs',
    'math/typeset-verify.mjs': 'tests/typeset.mjs',
  };
  if (owners[file]) return owners[file];
  if (file.startsWith('math/examples/')) return file.slice(5);
  if (/^math\/(?!package-).+\.(?:mjs|d\.ts)$/.test(file)) return 'dist/' + file.slice(5);
  return 'src/' + file;
}
