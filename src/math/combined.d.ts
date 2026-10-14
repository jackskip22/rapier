// SPDX-License-Identifier: MIT
import type {RenderOptions, SemanticRenderResult} from './index.js';
/** Render SVG and MathML from one admitted parse; check each result independently. */
export function renderWithMathML(source: unknown, options?: RenderOptions): SemanticRenderResult;
