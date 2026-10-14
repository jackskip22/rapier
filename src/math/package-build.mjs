// SPDX-License-Identifier: MIT
// Native entries execute the carried source modules directly. The complete
// classic distribution concatenates these same owners without module syntax.
export function mathClassicSource(text) {
  return text.replace(/^import \{[^\n]+\} from '\.\/[\w-]+\.js';\n/gm, '')
    .replace(/^export \{[^\n]+\};\n/gm, '').trimEnd();
}

export function mathModules(version) {
  return new Map([
    ['dist/index.mjs', `// SPDX-License-Identifier: MIT
import {parseMathTex as parse} from '../src/math/parser.js';
import {renderMath as render, mathRenderToString as renderToString} from '../src/math/api.js';
import {mathFit as fit, mathObserve as observe} from '../src/math/browser.js';
const version = ${JSON.stringify(version)};
export {version, parse, render, renderToString, fit, observe};
export default Object.freeze({version, parse, render, renderToString, fit, observe});
`],
    ['dist/mathml.mjs', `// SPDX-License-Identifier: MIT
export {parseMathTex as parse} from '../src/math/parser.js';
export {mathToMathML as toMathML} from '../src/math/semantic-api.js';
`],
    ['dist/combined.mjs', `// SPDX-License-Identifier: MIT
export {mathRenderWithMathML as renderWithMathML} from '../src/math/combined.js';
`],
  ]);
}
