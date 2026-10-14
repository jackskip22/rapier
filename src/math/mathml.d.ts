// SPDX-License-Identifier: MIT
import type {MathMLOptions, MathMLResult} from './index.js';
export {parse} from './index.js';
export type {MathNode, MathError, MathMLOptions, MathMLResult} from './index.js';
export function toMathML(source: unknown, options?: MathMLOptions): MathMLResult;
