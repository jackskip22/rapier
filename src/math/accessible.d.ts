// SPDX-License-Identifier: MIT
import type {RenderOptions, SemanticRenderResult} from './index.js';
export interface AccessibleResult extends SemanticRenderResult {
  /** Empty on refusal; retain original input for the host's escaped fallback. */
  html: string;
  /** Authored links use visible native MathML, with standalone SVG still returned. */
  presentation: 'svg-mathml' | 'mathml' | 'refused';
}
/** Include accessible.css when inserting the composition. Incomplete source is not repaired. */
export function renderAccessible(source: unknown, options?: Omit<RenderOptions, 'preview' | 'caret'>): AccessibleResult;
