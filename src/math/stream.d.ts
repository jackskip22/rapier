// SPDX-License-Identifier: MIT
export interface MathReuseLimits {
  /** Maximum retained successful artifacts, including each source/configuration key. Default 128. */
  maxEntries?: number;
  /** Accounted UTF-16 string bytes + scalar/entry allowance, not physical heap. Default 2 MiB. */
  maxRetainedBytes?: number;
  /** Maximum accounted bytes for one entry, capped by maxRetainedBytes. Default 256 KiB. */
  maxEntryBytes?: number;
}
export interface MathReuseStats {
  readonly entries: number;
  readonly retainedBytes: number;
  readonly keyBytes: number;
  readonly artifactBytes: number;
  readonly peakRetainedBytes: number;
  readonly hits: number;
  readonly evaluations: number;
  readonly bypasses: number;
  readonly evictions: number;
  readonly disposed: boolean;
}
export interface MathSession {
  /** Release all artifacts. Lifetime counters remain; this session stays open. */
  clear(): void;
  /** Release artifacts and permanently close this message owner. Idempotent. */
  dispose(): void;
  /** Fresh immutable counters; no source, options, or rendered objects are exposed. */
  readonly stats: MathReuseStats;
}
/** One explicit message lifetime for supported adapter renders, independent of document budgets. */
export function createMathSession(limits?: MathReuseLimits): MathSession;
export interface MarkdownSnapshot {source: string; html: string; revision: number; final: boolean}
export interface MarkdownStream {
  /** null means keep the previous preview; the chunk was still accepted. */
  write(chunk: string): MarkdownSnapshot | null;
  /** Always run a complete batch render. A failure preserves accepted source for retry. */
  finish(): MarkdownSnapshot;
  abort(): void;
  /** Close this handle and return a fresh replacement. Old producers remain closed. */
  reset(): MarkdownStream;
  readonly revision: number;
}
export function createMarkdownStream(renderMarkdown: (source: string, session: MathSession) => string, options?: {
  maxSourceLength?: number; previewEvery?: number;
  /** Bounded per-message formula reuse by default. false disables retention. */
  reuse?: MathReuseLimits | false;
}): MarkdownStream;
