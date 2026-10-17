// SPDX-License-Identifier: AGPL-3.0-only
export const EDIT_PASSAGE_BYTES = 4096;
const encoder = new TextEncoder();

export function editPassage(text, written, limit = EDIT_PASSAGE_BYTES) {
  if (typeof text !== 'string' || !Array.isArray(written) || !written.length) return null;
  const spans = written.filter(row => Array.isArray(row) && row.length === 2 && row.every(Number.isSafeInteger) && row[0] >= 1 && row[1] >= row[0])
    .map(([first, last]) => [first, last]).sort((a, b) => a[0] - b[0]);
  if (spans.length !== written.length) return null;
  const merged = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span[0] <= last[1] + 1) last[1] = Math.max(last[1], span[1]); else merged.push(span);
  }
  const lines = text.split(/\r\n|\r|\n/), rows = [];
  let bytes = 0;
  for (const [first, last] of merged) for (let line = first; line <= Math.min(last, lines.length); line++) {
    const row = line + ': ' + lines[line - 1];
    bytes += encoder.encode(row).byteLength + 1;
    if (bytes > limit) return null;
    rows.push(row);
  }
  return rows.length ? rows.join('\n') : null;
}
