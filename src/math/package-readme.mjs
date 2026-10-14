// SPDX-License-Identifier: MIT
export function mathReadme(resources) {
  return `# Rapier Math

Offline TeX formulas as SVG or structured MathML. Embedded Latin Modern outlines for SVG; font-free native MathML. Synchronous, with no runtime downloads.

## Use

\`\`\`sh
npm install rapier-math
\`\`\`

\`\`\`js
import {renderToString} from 'rapier-math';
const svg = renderToString(String.raw\`\\frac{a}{b}\`);
\`\`\`

For a browser script, load [${resources.packageBundle}](${resources.packageBundle}) and use
\`globalThis.RapierMath\`. The native ESM entry is [dist/index.mjs](dist/index.mjs).
For one-file copying or inline-script embedding, use the classic file above. The native
ESM entry imports relative \`src/math/\` modules: install/serve the whole package or bundle
that import; copying only \`dist/index.mjs\` is insufficient. A CDN must retain that graph
or bundle it. Formula rendering stays synchronous and offline after its chosen script
or module graph has loaded.

The SVG entry and classic script include the font. Use \`rapier-math/mathml\` for font-free MathML,
\`rapier-math/combined\` for one-parse SVG and MathML, or \`rapier-math/accessible\` with its stylesheet
for host composition. All return synchronously. Type declarations accompany the runtime files.

- [API and integration guide](docs/api.md)
- [MathML, accessibility and source contracts](docs/semantics.md)
- [Runnable examples](examples/README.md)
- [Font source and regeneration](docs/font-source.md)

## Develop

The classic script and native entry points live in \`dist/\`. Native entries import the editable
modules in \`src/math/\` directly, sharing one parser without a duplicate generated renderer. Build
tools live in \`src/tools/\`. Optional adapters have one source copy in \`dist/\`. Examples, documentation and tests each
have their own directory. Only the current release is kept in this checkout.

From a repository checkout, run \`node tests/check.mjs\` and \`node tests/verify.mjs\` to check the package and rebuild its exact bytes.
Run \`node src/tools/build-math.mjs --package .\` to regenerate the classic and ESM files from source.
Optional host checks run with \`node tests/adoption.mjs\` after installing the example dependencies.

## License

The renderer and adapters are MIT-licensed. Embedded Latin Modern Math outlines and metrics are
licensed under the GUST Font License. [LICENSE](LICENSE) contains both complete grants.
[Component provenance](docs/math-components.json) and [source hashes](docs/math-resources.json)
travel with the package.

Version ${resources.version}. Classic payload: ${resources.bytes} bytes; gzip (level 9): ${resources.gzipBytes} bytes.
`;
}
