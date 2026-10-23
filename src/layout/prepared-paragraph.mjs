// SPDX-License-Identifier: MIT
import {paragraphHyphens} from './hyphenation.mjs';
import {prepareRichInlineSegments} from '../agent/vendor/pretext/rich-inline.js';
import {getEngineProfile, getPreparationLanguage, getFontMeasurement, parseFontSize,
  getTextWidth, getEmojiCorrection, textMayContainEmoji, measureWithLetterSpacing} from '../agent/vendor/pretext/measurement.js';
import {KIND_BITS, TEXT, SPACE, SOFT_HYPHEN, ZERO_WIDTH_BREAK, ZERO_WIDTH_GLUE, OBJECT, SPACED, UNBROKEN} from '../agent/vendor/pretext/analysis.js';

const opening = /^[\p{Ps}\p{Pi}\p{Pf}"']+/u;
const closing = /[\p{Pe}\p{Pi}\p{Pf}"'.,;:!?]+$/u;
const empty = values => values == null || !values.some(value => value !== null && value !== 0);
const finite = value => Number.isFinite(value) && value >= 0;
const noContexts = Object.freeze([]);

function lowerBound(values, offset) {
  let lo = 0, hi = values.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    if (values[mid] < offset) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function sourceMeasurer(items, text, offsets, language) {
  const metrics = [];
  return (start, end, suffix = '') => {
    if (start >= end) return 0;
    let lo = 0, hi = items.length;
    while (lo < hi) {
      const mid = lo + hi >>> 1;
      if (offsets[mid + 1] <= start) lo = mid + 1; else hi = mid;
    }
    const last = lowerBound(offsets, end) - 1;
    let width = 0;
    for (let index = lo; index <= last; index++) {
      const a = Math.max(start, offsets[index]), b = Math.min(end, offsets[index + 1]);
      if (a >= b) continue;
      const item = items[index];
      let metric = metrics[index];
      if (!metric) {
        const font = getFontMeasurement(item.font, language, item.letterSpacing !== 0);
        metric = metrics[index] = {font, emoji: textMayContainEmoji(item.text) ? getEmojiCorrection(item.font, font) : 0};
      }
      const body = text.slice(a, b).replace(/[\t\r\n\f ]+/g, ' ').replace(/\u00ad/g, '') + (index === last ? suffix : '');
      const measured = item.letterSpacing
        ? measureWithLetterSpacing(body, item.letterSpacing, metric.emoji, metric.font)
        : getTextWidth(body, metric.font, metric.emoji);
      if (measured === null) return NaN;
      width += measured + (item.break === 'never' ? item.extraWidth : 0);
    }
    return width;
  };
}

export function createParagraphObserver(items, geometry) {
  const measure = sourceMeasurer(items, geometry.text, geometry.offsets, geometry.language);
  const rows = new Map();
  return ({segment, word: index, from, to}) => {
    const word = geometry.segments[segment].words[index], contexts = word.contexts;
    const start = from < 0 ? null : word.breaks[from], end = to < 0 ? null : word.breaks[to];
    if (!start) return measure(word.start, end.offset, end.glyph || '') + end.prefixContext - end.prefixTrim;
    if (!end) {
      let correction = 0;
      for (let at = start.contextAfter; at < contexts.length; at++) correction += contexts[at].delta;
      return measure(start.offset, word.end) + correction + start.startExtra;
    }
    let row = rows.get(start);
    if (!row || end.offset < row.end) rows.set(start, row = {at: start.contextInside, sum: 0, end: start.offset});
    while (row.at < contexts.length && contexts[row.at].end <= end.offset) row.sum += contexts[row.at++].delta;
    row.end = end.offset;
    return measure(start.offset, end.offset, end.glyph || '') + start.startExtra - (end.glyph ? 0 : end.endTrim) + row.sum;
  };
}

export function* prepareParagraphCandidateSteps(items, options) {
  const profile = getEngineProfile();
  if (profile.lineBreakScan !== 'blink' || options.whiteSpace !== 'normal' || items.some(item => item.text === undefined)) return null;
  const language = getPreparationLanguage(profile), offsets = [0], chunks = [];
  let cutCount = 0;
  for (const item of items) offsets.push(offsets.at(-1) + item.text.length);
  const text = items.map(item => item.text).join('');
  const measure = sourceMeasurer(items, text, offsets, language);
  const boundaries = options.paragraphBreaks || [0, items.length];
  for (let chunkIndex = 0; chunkIndex < boundaries.length - 1; chunkIndex++) {
    const from = boundaries[chunkIndex], to = boundaries[chunkIndex + 1], source = items.slice(from, to);
    const chunk = {start: offsets[from], end: offsets[to], words: []};
    chunks.push(chunk);
    if (!source.some(item => item.text)) continue;
    const flow = prepareRichInlineSegments(source, {whiteSpace: 'normal', wordBreak: options.wordBreak});
    const data = flow.data, flags = data.segmentFlags, units = [];
    if (!empty(data.items?.insideExtras) || !empty(data.items?.fillExtras) || !empty(data.items?.openingEdges)) return null;
    for (let index = 0; index < flags.length; index++) {
      const kind = flags[index] & KIND_BITS;
      if (![TEXT, SPACE, SOFT_HYPHEN, ZERO_WIDTH_BREAK, ZERO_WIDTH_GLUE, OBJECT].includes(kind)) return null;
      const itemIndex = from + (flow.segmentItems ? flow.segmentItems[index] : flow.onlyItem);
      const item = items[itemIndex], start = offsets[itemIndex] + flow.sourceStarts[index];
      const end = kind === OBJECT ? offsets[itemIndex + 1] : offsets[itemIndex] + flow.sourceEnds[index];
      const width = data.widths[index] + ((flags[index] & SPACED) ? data.letterSpacing : 0);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < chunk.start || end > chunk.end || end < start || !finite(width)) return null;
      units.push({index, kind, itemIndex, start, end, width,
        startExtra: data.lineStartExtras?.[index] || 0,
        endTrim: data.lineEndTrims?.[index] || 0});
    }
    let word = null, gapWidth = 0;
    const finish = () => { if (word) { chunk.words.push(word); word = null; } };
    for (let at = 0; at < units.length; at++) {
      const unit = units[at], next = units[at + 1];
      if (unit.kind === SPACE && (!next || !(flags[next.index] & UNBROKEN))) {
        finish(); gapWidth += unit.width; continue;
      }
      if (!word) {
        const previous = chunk.words.at(-1);
        if (previous) previous.gap = {start: previous.end, end: unit.start, width: gapWidth};
        word = {start: unit.start, end: unit.end, width: 0, first: at, last: at, breaks: [],
          protected: false, startExtra: unit.startExtra, endTrim: 0, opening: 0, closing: 0};
        gapWidth = 0;
      }
      word.end = unit.end; word.width += unit.width; word.last = at; word.endTrim = unit.endTrim;
      word.protected ||= unit.kind === OBJECT || unit.kind === SPACE;
      if (next && next.kind !== SPACE && !(flags[next.index] & UNBROKEN)) {
        const kind = unit.kind === SOFT_HYPHEN ? 'soft' : text[unit.end - 1] === '-' ? 'hyphen' : 'break';
        word.breaks.push({offset: unit.end, kind, at});
      }
    }
    finish();
    yield;

    const automatic = paragraphHyphens(chunk.words, text, items, offsets, options.language, options.document);
    if (!automatic) return null;
    for (const word of chunk.words) for (const offset of automatic.get(word) || []) {
      if (!word.breaks.some(cut => cut.offset === offset)) word.breaks.push({offset, kind:'auto', at:word.first});
    }
    yield;

    let measuredWords = 0;
    for (const word of chunk.words) {
      if (word.protected) word.breaks = [];
      word.breaks.sort((a,b) => a.offset-b.offset);
      const joined = word.breaks.length || /\u00ad/.test(text.slice(word.start, word.end));
      const contexts = [];
      let measuredEdges = 0;
      if (joined) {
        for (let at = word.first; at <= word.last; at++) {
          const unit = units[at];
          if (unit.kind !== TEXT || /^\p{M}+$/u.test(text.slice(unit.start, unit.end))) continue;
          const delta = unit.width - measure(unit.start, unit.end);
          if (delta !== 0) contexts.push(Object.freeze({start: unit.start, end: unit.end, delta}));
          if (++measuredEdges % 8 === 0) yield;
        }
        word.width = measure(word.start, word.end) + contexts.reduce((sum, item) => sum + item.delta, 0);
      }
      let autoBefore = word.first - 1, autoAfter = word.first, contextAfter = 0, contextInside = 0, prefixContext = 0;
      for (const cut of word.breaks) {
        if (cut.kind === 'soft' || cut.kind === 'auto') {
          cut.glyph = '-';
          if (options.hanging && !word.protected) cut.protrude = parseFontSize(items[units[word.first].itemIndex].font) * .25;
        }
        let before = cut.at, after = cut.at + 1;
        if (cut.kind === 'auto') {
          while (autoBefore < word.last && units[autoBefore + 1].start < cut.offset) autoBefore++;
          while (autoAfter <= word.last && units[autoAfter].end <= cut.offset) autoAfter++;
          before = autoBefore; after = autoAfter;
        }
        while (before >= word.first && units[before].kind !== TEXT) before--;
        while (after <= word.last && units[after].kind !== TEXT) after++;
        const last = before >= word.first ? units[before] : null, first = after <= word.last ? units[after] : null;
        cut.startExtra = first?.start === cut.offset ? first.startExtra : 0;
        cut.endTrim = last?.end === cut.offset ? last.endTrim : 0;
        cut.prefixTrim = cut.glyph ? 0 : last?.endTrim || 0;
        while (contextAfter < contexts.length && contexts[contextAfter].end <= cut.offset) prefixContext += contexts[contextAfter++].delta;
        while (contextInside < contexts.length && contexts[contextInside].start < cut.offset) contextInside++;
        cut.prefixContext = prefixContext;
        cut.contextAfter = contextAfter; cut.contextInside = contextInside;
        delete cut.at;
      }
      word.breaks = word.breaks.filter(cut => cut.offset > word.start && cut.offset < word.end);
      for (const cut of word.breaks) cut.slot = cutCount++;
      word.contexts = contexts.length ? Object.freeze(contexts) : noContexts;
      if (options.hanging && !word.protected) {
        const body = text.slice(word.start, word.end), head = opening.exec(body), tail = closing.exec(body);
        if (head && head[0].length < body.length && !/^\p{M}/u.test(body.slice(head[0].length))) {
          word.openEnd = word.start + head[0].length;
          word.opening = Math.min(parseFontSize(items[units[word.first].itemIndex].font)*.5, Math.max(0, measure(word.start, word.openEnd)) * .7);
        }
        if (tail && tail.index > 0) {
          word.closeStart = word.start + tail.index;
          word.closing = Math.min(parseFontSize(items[units[word.last].itemIndex].font)*.5, Math.max(0, measure(word.closeStart, word.end)) * .7);
        }
      }
      if (!finite(word.width) || !finite(word.opening) || !finite(word.closing)) return null;
      delete word.first; delete word.last;
      if (word.gap) Object.freeze(word.gap);
      word.breaks.forEach(Object.freeze); Object.freeze(word.breaks); Object.freeze(word);
      if (++measuredWords % 8 === 0) yield;
    }
    Object.freeze(chunk.words); Object.freeze(chunk);
  }
  for (const chunk of chunks) { Object.freeze(chunk.words); Object.freeze(chunk); }
  return Object.freeze({text, language, cutCount, offsets: Object.freeze(offsets), segments: Object.freeze(chunks)});
}
