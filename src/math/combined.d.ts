// SPDX-License-Identifier: MIT
import type {RenderOptions, SemanticRenderResult} from './index.js';
/** Render SVG and MathML from one strict parse; incomplete source is not repaired. */
export function renderWithMathML(source: unknown, options?: Omit<RenderOptions, 'preview' | 'caret'>): SemanticRenderResult;
