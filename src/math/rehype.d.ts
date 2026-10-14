// SPDX-License-Identifier: MIT
import type {Root} from 'hast';
import type {VFile} from 'vfile';
import type {IntegrationOptions} from './integration.js';
import type {MathSession} from './stream.js';
declare module 'vfile' {
  interface DataMap {
    /** Explicit reuse for one message; each transformed tree has fresh budgets. */
    rapierMathSession?: MathSession;
  }
}
/** Install after sanitization. Recognizes remark-rehype math code nodes. */
export default function rehypeRapierMath(options?: IntegrationOptions): (tree: Root, file: VFile) => void;
