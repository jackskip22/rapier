// SPDX-License-Identifier: MIT
import type RapierMath from './index.js';
import type {toMathML} from './mathml.js';
import type {renderWithMathML} from './combined.js';
declare global {
  var RapierMath: typeof import('./index.js').default & Readonly<{
    toMathML: typeof toMathML; renderWithMathML: typeof renderWithMathML;
  }>;
}
export {};
