// SPDX-License-Identifier: MIT
export interface MathError {
  code: string;
  message: string;
  /** Zero-based UTF-16 offset in the formula. */
  offset: number;
  command?: string;
  messageTruncated?: boolean;
  commandTruncated?: boolean;
  /** True only when refused oversized source is not embedded in diagnostic SVG. */
  sourceOmitted?: boolean;
  /** For an unknown command or environment: the known name one or two edits away, such as `\\frac` for `\\farc`. */
  suggestion?: string;
}
export interface RenderOptions {
  displayMode?: boolean;
  maxWidth?: number;
  screen?: {fontSize: number; pixelRatio: number; dark: boolean};
  /** Mend what is unfinished where a person is typing: at `caret`, or at the end. */
  preview?: boolean;
  /** With preview: the UTF-16 offset where the person is typing. */
  caret?: number;
  /** Mark each symbol with `data-math-at`, its UTF-16 offset in the source. */
  spans?: boolean;
}
export interface RenderResult {
  svg: string;
  width: number;
  height: number;
  depth: number;
  lines: number;
  fitted: boolean;
  errors: MathError[];
}
export interface MathMLOptions {displayMode?: boolean}
export interface MathMLResult {
  mathml: string;
  /** Complete mapping is presentation structure, not theorem or speech semantics. */
  status: 'complete' | 'presentation-fallback' | 'refused';
  /** Fallback notices or refusal diagnostics; an empty array for a complete mapping. */
  errors: MathError[];
  source: {encoding: 'application/x-tex' | 'application/x-rapier-tex-utf16' | null; omitted?: boolean};
  metrics: {nodes: number; depth: number; outputCodeUnits: number; links: number};
}
export interface SemanticRenderResult extends RenderResult {semantics: MathMLResult}
/** Parser nodes are inspectable; the internal node vocabulary can grow. */
export interface MathNode {type: string; [field: string]: unknown}
/** Browser nodes (including Element, Document and DocumentFragment) satisfy this
 * structural type without requiring the DOM type library in server projects. */
export interface MathContainer {readonly nodeType: number}
export const version: string;
/** Oversized source returns a bounded resource-limit diagnostic with sourceOmitted. */
export function render(source: unknown, options?: RenderOptions): RenderResult;
export function renderToString(source: unknown, options?: RenderOptions): string;
export function parse(source: string): MathNode;
export function fit(container: MathContainer): number;
export function observe(container: MathContainer): () => void;
declare const RapierMath: Readonly<{
  version: typeof version; render: typeof render; renderToString: typeof renderToString;
  parse: typeof parse; fit: typeof fit; observe: typeof observe;
}>;
export default RapierMath;
