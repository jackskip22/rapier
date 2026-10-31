// SPDX-License-Identifier: MIT
import {next, weight, exceptions, maximum} from '../agent/vendor/hyphen-en-us/patterns.js';

export const hyphenMinimums = {left: 2, right: 3, word: 5};

export function englishCuts(word) {
  if (!/^[A-Za-z]+$/.test(word)) return null;
  if (word.length < hyphenMinimums.word) return [];
  const cuts = [];
  let offset = 0, before = 0;
  for (const part of word.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+/g)) {
    if (before >= 3 && part.length >= 3) cuts.push(offset);
    for (const at of partCuts(part)) cuts.push(offset+at);
    offset += part.length; before = part.length;
  }
  return cuts.filter(at => at >= hyphenMinimums.left && at <= word.length-hyphenMinimums.right).sort((a, b) => a-b).filter((at, index, all) => at !== all[index-1]);
}

function partCuts(word) {
  if (word.length < hyphenMinimums.word) return [];
  const lower = word.toLowerCase(), known = exceptions[lower];
  if (Array.isArray(known)) return known;
  const source = '.'+lower+'.', weights = new Uint8Array(source.length+1);
  for (let start = 0; start < source.length; start++) {
    let node = 0;
    for (let end = start+1; end <= source.length && end <= start+maximum; end++) {
      node = next(node, source.charCodeAt(end-1));
      if (node < 0) break;
      let packed = weight(node);
      if (typeof packed !== 'number') continue;
      for (let at = start; packed; at++, packed = Math.floor(packed/16)) weights[at] = Math.max(weights[at],packed%16);
    }
  }
  const cuts = [];
  for (let at = hyphenMinimums.left; at <= word.length-hyphenMinimums.right; at++) if (weights[at+1]&1) cuts.push(at);
  return cuts;
}

export function paragraphHyphens(words, text, items, offsets, language, document) {
  const result = new Map();
  if (!language) return result;
  const exactEnglish = /^(?:en|en-US)(?:-u-.*)?$/i.test(language), unique = new Map(), english = new Map(), jobs = [];
  let segmenter, itemIndex = -1;
  for (const word of words) {
    if (word.protected) continue;
    const body = text.slice(word.start, word.end);
    const match = /^[-!"#%&'()*,.\/:;?@\[\]\\_{}]*([A-Za-z]+)[-!"#%&'()*,.\/:;?@\[\]\\_{}]*$/.exec(body) ||
      /^\p{P}*([\p{L}\p{M}]+)\p{P}*$/u.exec(body);
    if (!match || /[\u00a0\u00ad\u202f\u2060]/u.test(body)) continue;
    const start = word.start + body.indexOf(match[1]), end = start + match[1].length;
    if (itemIndex < 0) {
      let lo = 0, hi = items.length;
      while (lo < hi) {
        const middle = Math.floor((lo+hi)/2);
        if (offsets[middle+1] <= start) lo = middle+1; else hi = middle;
      }
      itemIndex = lo;
    } else while (itemIndex < items.length && offsets[itemIndex+1] <= start) itemIndex++;
    let disabled = false;
    for (let index = itemIndex; index < items.length && offsets[index] < end; index++) {
      if (items[index].hyphenate === false) {disabled = true;break;}
    }
    if (disabled) continue;
    if (exactEnglish) {
      if (!english.has(match[1])) english.set(match[1],englishCuts(match[1]));
      const local = english.get(match[1]);
      if (local) {result.set(word,local.map(offset => start+offset));continue;}
    }
    let entry = unique.get(match[1]);
    if (!entry) {
      if (match[1].length < 6) continue;
      segmenter ||= new Intl.Segmenter(language, {granularity:'grapheme'});
      const units = [...segmenter.segment(match[1])].map(part => part.index);
      if (units.length < 6) continue;
      units.push(match[1].length);
      entry = {text:match[1], units, cuts:[], minimum:3};
      unique.set(entry.text, entry);
    }
    jobs.push({word,start,entry});
  }
  if (!jobs.length) return result;
  if (!document?.body || !document.defaultView?.CSS.supports('hyphenate-limit-chars', '6 3 3')) return null;
  const host = document.createElement('span');
  host.setAttribute('aria-hidden','true'); host.inert = true;
  host.style.cssText = 'all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;overflow:hidden!important;contain:strict!important;visibility:hidden!important;pointer-events:none!important;';
  const shadow = host.attachShadow({mode:'closed'});
  let active = [...unique.values()];
  for (const entry of active) {
    const element = document.createElement('div'); element.lang = language;
    element.style.cssText = 'display:block;width:0;font:16px serif;line-height:20px;hyphens:auto;hyphenate-limit-chars:6 3 3;white-space:normal;word-break:normal;overflow-wrap:normal;text-wrap:wrap;';
    element.textContent = entry.text; shadow.append(element); entry.element = element;
  }
  document.body.append(host);
  const range = document.createRange();
  try {
    while (active.length) {
      const next = [];
      for (const entry of active) {
        const node = entry.element.firstChild, {units} = entry;
        const top = index => {
          range.setStart(node,units[index]); range.setEnd(node,units[index+1]);
          return [...range.getClientRects()].at(-1)?.top;
        };
        const first = top(0), last = top(units.length-2);
        if (first == null || last == null || first === last) continue;
        let lo = entry.minimum, hi = units.length-1;
        while (lo < hi) { const middle = lo+hi>>>1; if (top(middle) === first) lo=middle+1; else hi=middle; }
        if (lo < entry.minimum || lo > units.length-4) continue;
        entry.cuts.push(units[lo]); entry.minimum = lo+1;
        if (entry.minimum <= units.length-4) next.push(entry);
      }
      for (const entry of next) entry.element.style.hyphenateLimitChars = '6 '+entry.minimum+' 3';
      active = next;
    }
  } finally { host.remove(); }
  for (const {word,start,entry} of jobs) result.set(word, entry.cuts.map(offset => start+offset));
  return result;
}
