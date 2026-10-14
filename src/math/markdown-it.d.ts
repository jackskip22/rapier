// SPDX-License-Identifier: MIT
import type MarkdownIt from 'markdown-it';
import type {DelimiterOptions} from './delimiters.js';
import type {IntegrationOptions} from './integration.js';
import type {MathError} from './index.js';
import type {MathSession} from './stream.js';
export interface MarkdownMathOptions extends DelimiterOptions, IntegrationOptions {}
export interface MarkdownMathEnv {
  /** Optional formula reuse for one message; each render still owns fresh budgets. */
  rapierMathSession?: MathSession;
  rapierMathErrors?: {source: string; errors: MathError[]}[];
}
export default function rapierMath(md: InstanceType<typeof MarkdownIt>, options?: MarkdownMathOptions): void;
