// SPDX-License-Identifier: AGPL-3.0-only
export const WRITE_PACE = Object.freeze({perHour: 100, coalesceMs: 60 * 1000, hourMs: 60 * 60 * 1000});
export const PACED_OPERATIONS = Object.freeze(new Set(['edit', 'undo', 'document.commit', 'comments.write']));
export const PACE_WORDS = Object.freeze({
  editor: 'This document is changing fast, so it saves once a minute. Your edits stay in this file and go with the next save.',
  agent: 'This document is changing fast, so it accepts one change a minute for now. Retry after the wait.',
});

export class WritePace {
  constructor() { this.times = []; }
  check(now = Date.now()) {
    this.times = this.times.filter(at => now - at < WRITE_PACE.hourMs);
    const last = this.times.at(-1) ?? -Infinity;
    if (this.times.length < WRITE_PACE.perHour || now - last >= WRITE_PACE.coalesceMs) return null;
    return {code: 'SAVES_COALESCED', retryAfter: Math.max(1, Math.ceil((last + WRITE_PACE.coalesceMs - now) / 1000))};
  }
  admit(now = Date.now()) { this.times.push(now); }
}
