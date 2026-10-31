// SPDX-License-Identifier: AGPL-3.0-only
import {textTargets} from './text-surface.mjs';

export const EDIT_PASSAGE_BYTES = 4096;
const encoder = new TextEncoder();

function packRows(lineAt, merged, limit) {
  const rows = [];
  let bytes = 0;
  for (const [first, last] of merged) for (let line = first; line <= last; line++) {
    const source = lineAt(line);
    if (source === undefined) break;
    const row = line + ': ' + source;
    bytes += encoder.encode(row).byteLength + 1;
    if (bytes > limit) return null;
    rows.push(row);
  }
  return rows.length ? rows.join('\n') : null;
}

function passageFromIndex(text, merged, limit) {
  const index = textTargets(text).lines, total = index.number(text.length);
  let at = 0, atLine = 1;
  return packRows(line => {
    if (line > total) return undefined;
    while (atLine < line) {
      const nl = text.indexOf('\n', at);
      at = nl < 0 ? text.length : nl + 1;
      atLine++;
    }
    const nl = text.indexOf('\n', at);
    const end = nl < 0 ? text.length : nl > at && text.charCodeAt(nl - 1) === 13 ? nl - 1 : nl;
    const source = text.slice(at, end);
    at = nl < 0 ? text.length : nl + 1;
    atLine = line + 1;
    return source;
  }, merged, limit);
}

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
  if (!text.includes('\r') || !/\r(?!\n)/.test(text)) return passageFromIndex(text, merged, limit);
  const lines = text.split(/\r\n|\r|\n/);
  return packRows(line => line <= lines.length ? lines[line - 1] : undefined, merged, limit);
}
