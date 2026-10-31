// SPDX-License-Identifier: MIT
import {render, renderToString} from 'rapier-math';

// Works in Node/SSR: the result needs no browser JavaScript or remote font.
const source = String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`;
const result = render(source, {displayMode: true});
if (result.errors.length) throw new Error(JSON.stringify(result.errors));
console.log(result.svg);
console.log(renderToString('E=mc^2'));
const failure = render(String.raw`\unsupported{x}`);
console.error({source: String.raw`\unsupported{x}`, errors: failure.errors});
// Retain the original source for editing/copying, even if admission throws.
