// SPDX-License-Identifier: MIT
export function mathReadme(resources) {
  return `# Rapier Math

TeX to SVG or MathML, synchronously and offline. Latin Modern outlines are embedded in the SVG, so there are no font requests and no runtime downloads. No dependencies.

\`\`\`sh
npm install rapier-math
\`\`\`

\`\`\`js
import {renderToString} from 'rapier-math';

const svg = renderToString(String.raw\`\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}\`);
\`\`\`

Try it in [Rapier](https://rapier.website): type \\$x^2\\$.

## Entry points

| Import | Gives |
| --- | --- |
| \`rapier-math\` | SVG with the font embedded |
| \`rapier-math/mathml\` | Native MathML, no font |
| \`rapier-math/combined\` | SVG and MathML from one parse |
| \`rapier-math/accessible\` | Accessible output for your own layout, with \`rapier-math/accessible.css\` |
| \`rapier-math/markdown-it\`, \`rapier-math/rehype\` | Markdown integrations; your parser stays in charge |
| \`rapier-math/stream\` | Formulas in streamed text, such as model output |
| \`rapier-math/classic\` | [${resources.packageBundle}](${resources.packageBundle}): one file, \`globalThis.RapierMath\` |

Types ship with every entry. The classic file is the one to copy or inline: ${resources.bytes.toLocaleString('en-US')} bytes, ${resources.gzipBytes.toLocaleString('en-US')} gzipped, font included. The ES modules import \`src/math/\`, so serve or bundle the whole package rather than copying \`dist/index.mjs\` alone.

[API](docs/api.md) · [MathML and accessibility](docs/semantics.md) · [Examples](examples/README.md) · [Font](docs/font-source.md) · [Changes](CHANGELOG.md)

## Build

\`node src/tools/build-math.mjs --package .\` regenerates \`dist/\` from \`src/math/\`.

## License

Code: MIT. Embedded Latin Modern outlines and metrics: GUST Font License. Both are in [LICENSE](LICENSE). [Components](docs/math-components.json) and [source hashes](docs/math-resources.json) ship with the package.
`;
}
