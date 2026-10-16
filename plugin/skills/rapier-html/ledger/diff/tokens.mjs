// SPDX-License-Identifier: MIT
// Space-free scripts (Thai, Lao, Myanmar, Khmer, kana, Han) have no word separator; the platform dictionary finds words.
export const SPACELESS = /[\u0e00-\u0eff\u1000-\u109f\u1780-\u17ff\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
export const words = (segmenter, text) => [...text.matchAll(/[\p{L}\p{N}\p{M}_]+/gu)].flatMap(word => SPACELESS.test(word[0])
  ? [...segmenter().segment(word[0])].map(s => [word.index + s.index, word.index + s.index + s.segment.length])
  : [[word.index, word.index + word[0].length]]);
export const wordSegmenter = () => { let segmenter; return () => segmenter ||= new Intl.Segmenter('en', {granularity: 'word'}); };

// Segment only requested non-ASCII boundaries; observations never share a global document cache.
export function boundaries() {
  const segments = Object.create(null);
  let segmenter, last = [];
  return function safe(text, at) {
    if (!at || at === text.length) return true;
    const a = text.charCodeAt(at - 1), b = text.charCodeAt(at);
    if ((a & 0xfc00) === 0xd800 && (b & 0xfc00) === 0xdc00 || a === 13 && b === 10) return false;
    if (a < 0x300 && b < 0x300) return true;
    // Retreats probe one long cluster many times; answer inside the last cluster without the segmenter.
    if (last[0] === text && at > last[1] && at < last[2]) return false;
    const found = (segments[text] ||= (segmenter ||= new Intl.Segmenter('en', {granularity: 'grapheme'})).segment(text)).containing(at);
    last = [text, found.index, found.index + found.segment.length];
    return found.index === at;
  }
}

// Letters are code points: an astral letter is one letter, never two lone surrogates.
const pair = (text, at) => (text.charCodeAt(at - 1) & 0xfc00) === 0xd800 && (text.charCodeAt(at) & 0xfc00) === 0xdc00;
export const prev = (text, at) => text.slice(Math.max(0, at - 1 - pair(text, at - 1)), at), next = (text, at) => text.slice(at, at + 1 + pair(text, at + 1));
export const letter = c => c && /[\p{L}\p{M}\p{N}_]/u.test(c), within = (text, at) => letter(prev(text, at)) && letter(next(text, at));

// Tokens at a level: 0 parts, 1 lines, 2 words, spaces and marks, 3 characters.
export function tokenizer(c) {
  const {spend, safe, segmenter, raw, aliases} = c;
  return function tokens(text, start, end, level, parts) {
    // Each source boundary is stored once, alongside comparison keys and optional owners.
    const keys = [], at = [start], owners = [];
    const out = [keys, at, owners];
    const add = (a, b, part, value) => {
      if (b <= a) return;
      if (!part && owners[keys.length - 1]?.name && !/\S/.test(text.slice(a, b))) at[at.length - 1] = b;
      else {
        at.push(b); if (part) owners[keys.length] = part;
        const key = part?.name ? '\0' + part.kind + '\0' + (aliases?.get(part)?.name || part.name) : value ?? text.slice(a, b);
        keys.push(level === 1 && !raw ? key.trimEnd() : key);
      }
    };
    if (parts?.length && level === 0) {
      let at = start;
      for (const part of parts) {
        if (!spend()) return null;
        if (part.start < at || part.end <= part.start || part.end > end) continue;
        if (at < part.start) add(at, part.start);
        add(part.start, part.end, part); at = part.end;
      }
      add(at, end); return out;
    }
    const pattern = level === 1 ? raw ? /[^\n]*\n|[^\n]+$/g : /[^\n]*\n(?:\r?\n)*|[^\n]+$/g : level === 2 ? /[\p{L}\p{M}\p{N}_]+|[^\S\r\n]+|\r\n|[^]/gu : /[^]/gu;
    pattern.lastIndex = start;
    let match;
    while (pattern.lastIndex < end && (match = pattern.exec(text))) {
      if (!spend()) return null;
      const a = match.index, b = Math.min(end, pattern.lastIndex);
      if (keys.length && !safe(text, a)) {
        at[at.length - 1] = b; keys[keys.length - 1] = text.slice(at[at.length - 2], b);
      } else if (level === 2 && b - a > 1 && SPACELESS.test(match[0])) {
        for (const [c, d] of words(segmenter, text.slice(a, b))) { if (!spend()) return null; add(a + c, a + d); }
      } else add(a, b, undefined, b === pattern.lastIndex ? match[0] : undefined);
      if (b === end) break;
    }
    return out;
  };
}
