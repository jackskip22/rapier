// SPDX-License-Identifier: MIT
let graphemes;
export const segment = text => (graphemes ||= new Intl.Segmenter(undefined, {granularity: 'grapheme'})).segment(text);
export const opening = /^[\p{Ps}\p{Pi}\p{Pf}"']+$/u;

export function initialRange(input) {
  const text = typeof input === 'string' ? input : input?.textContent;
  if (typeof text !== 'string') return null;
  const start = /^\s*/u.exec(text)[0].length;
  if (start === text.length) return null;
  let end = start;
  for (const part of segment(text.slice(start))) {
    if (/^\s/u.test(part.segment)) break;
    end = start + part.index + part.segment.length;
    if (!opening.test(part.segment)) break;
  }
  return end > start ? {start, end, text: text.slice(start, end)} : null;
}
