// SPDX-License-Identifier: MIT
export interface DelimiterOptions {singleDollar?: boolean; brackets?: boolean}
export interface MathSpan {
  start: number; end: number; bodyStart: number; bodyEnd: number;
  open: string; close: string; displayMode: boolean;
}
/** Index a raw, host-owned text region. Does not parse Markdown or unescape source. */
export function createMathMatcher(source: string, options?: DelimiterOptions): (start: number, limit?: number) => MathSpan | null;
