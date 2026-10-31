// SPDX-License-Identifier: MIT
import type {RenderOptions, RenderResult, MathError} from './index.js';
import type {MathSession} from './stream.js';
export interface IntegrationOptions {
  /** Insert SVG with assistive MathML. Include accessible.css. */
  accessible?: boolean;
  /** With a session, plain-data options are captured once per render. preview/caret apply only without accessible output. */
  renderOptions?: RenderOptions;
  /** Per document. Default 1024. Exhaustion leaves subsequent math as source. */
  maxFormulas?: number;
  /** Combined successful insertion markup code units per document. Default 16 Mi. */
  maxOutputLength?: number;
}
export type FormulaResult = (RenderResult & {markup: string}) | {errors: MathError[]};
/** Internal adapter owner; every call creates a fresh document admission budget. */
export function createFormulaRenderer(options?: IntegrationOptions, session?: MathSession):
  (source: string, displayMode: boolean, inLink?: boolean) => FormulaResult;
export function escapeText(text: string): string;
