// SPDX-License-Identifier: MIT
// Node/SSR/worker use: this entry does not load or decode the SVG font.
import {parse, toMathML} from '../dist/mathml.mjs';

const source = String.raw`\frac{12.5}{\sqrt[3]{x^2+1}}`;
const result = toMathML(source, {displayMode: true});
if (result.status === 'refused') throw new Error(result.errors.map(error => error.message).join('; '));
console.log(result.mathml);
console.log(JSON.stringify({status: result.status, metrics: result.metrics, tree: parse(source)}));
// Retain source separately for edits. SSR can emit result.mathml visibly without CSS
// or client-side hydration; speech and navigation still depend on the actual AT stack.
