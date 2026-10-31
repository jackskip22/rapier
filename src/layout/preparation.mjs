// SPDX-License-Identifier: MIT
import {clearCache, setLocale} from '../agent/vendor/pretext/layout.js';
import {prepareRichInline} from '../agent/vendor/pretext/rich-inline.js';
import {prepareParagraphCandidateSteps, createParagraphObserver} from './prepared-paragraph.mjs';

const documents = new WeakMap(), faces = new WeakMap(), paragraphs = new WeakMap();
let faceId = 0, generation = 0, language;
const descriptors = ['family', 'style', 'weight', 'stretch', 'unicodeRange', 'status',
  'featureSettings', 'variationSettings', 'display', 'sizeAdjust', 'ascentOverride',
  'descentOverride', 'lineGapOverride'];
const finite = value => typeof value === 'number' && Number.isFinite(value);

function clearMetrics() { clearCache(); return ++generation; }

let turn = null;
export function captureFontAuthority(document = globalThis.document) {
  if (!document || typeof document !== 'object') return generation;
  if (turn?.document === document && turn.generation === generation) return generation;
  const previous = documents.get(document), declared = previous?.declared || new Set();
  const entries = [];
  try {
    for (const face of document.fonts || []) {
      if (!faces.has(face)) faces.set(face, ++faceId);
      declared.add(familyName(face.family));
      entries.push([faces.get(face), ...descriptors.map(name => String(face[name] ?? ''))]);
    }
  } catch (_) { entries.push(['unavailable']); }
  const ratio = document.defaultView?.devicePixelRatio ?? 1;
  const signature = JSON.stringify([document.fonts?.status ?? '', ratio, entries]);
  if (previous?.signature !== signature) {
    documents.set(document, {signature, declared});
    clearMetrics();
  }
  if (!turn) queueMicrotask(() => { turn = null; });
  turn = {document, generation};
  return generation;
}

export function invalidateRichMetrics(document = globalThis.document) {
  turn = null;
  return document ? captureFontAuthority(document) : clearMetrics();
}

function familyName(value) {
  const name = String(value).trim();
  return (/^(["']).*\1$/s.test(name) ? name.slice(1, -1) : name)
    .replace(/\\([\da-f]{1,6})[ \t\r\n\f]?|\\([^\r\n\f])/gi,
      (_, hex, char) => hex ? String.fromCodePoint(Math.min(0x10ffff, parseInt(hex, 16)) || 0xfffd) : char)
    .toLowerCase();
}

export function fontReady(document, font, text = ' ') {
  if (!document) return true;
  if (!document.fonts || document.fonts.status === 'loading') return false;
  try {
    const parts = /^(?:(normal|italic|oblique(?:\s+-?[\d.]+deg)?)\s+)?(?:(\d+)\s+)?(?:\d*\.)?\d+px(?:\s*\/\s*[^\s]+)?\s+(.+)$/.exec(font);
    if (!parts) return false;
    const style = parts[1] || 'normal', weight = Number(parts[2] || 400);
    const names = (parts[3].match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,]+/g) || []).map(familyName);
    const declared = documents.get(document)?.declared || new Set(), faces = [...document.fonts];
    for (const name of names) {
      const own = faces.filter(face => familyName(face.family) === name);
      if (!own.length) return !declared.has(name);
      const fitting = own.filter(face => {
        const [low, high = low] = String(face.weight).split(/\s+/).map(Number);
        return (face.style === 'normal') === (style === 'normal') && !(weight < low) && !(weight > high);
      });
      const pool = fitting.length ? fitting : own;
      if (pool.some(face => face.status === 'loading')) return false;
      if (pool.some(face => face.status === 'loaded')) return true;
      if (pool.some(face => face.status === 'unloaded')) { document.fonts.load(font, text || ' ').catch(() => {}); return false; }
    }
    return true;
  } catch (_) { return false; }
}

function validLanguage(value) {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  try { return Intl.getCanonicalLocales(value).length === 1; } catch (_) { return false; }
}

function supportedDocument(document) {
  if (!document) return true;
  const agent = document.defaultView?.navigator?.userAgent ?? globalThis.navigator?.userAgent ?? '';
  return /(?:^|\s)(?:HeadlessChrome|Chrome|Chromium)\/\d+/.test(agent) && !/\bCriOS\//.test(agent);
}

export function supportsRichStyle(style, contentLanguage = '') {
  if (!style || !validLanguage(contentLanguage)) return false;
  const oneOf = (key, values) => style[key] == null || style[key] === '' || values.includes(style[key]);
  if (!oneOf('writingMode', ['horizontal-tb']) || !oneOf('direction', ['ltr']) ||
      !oneOf('unicodeBidi', ['normal', 'isolate']) || !oneOf('textTransform', ['none']) ||
      !oneOf('fontKerning', ['auto']) || !oneOf('fontOpticalSizing', ['auto']) ||
      !oneOf('fontStretch', ['normal', '100%']) || !oneOf('fontSizeAdjust', ['none']) ||
      !oneOf('textRendering', ['auto']) || !oneOf('verticalAlign', ['baseline']) ||
      !oneOf('whiteSpace', ['normal', 'pre-wrap', 'nowrap']) || !oneOf('wordBreak', ['normal', 'keep-all']) ||
      !oneOf('hyphens', ['manual']) || !oneOf('lineBreak', ['auto', 'after-white-space']) || !oneOf('hangingPunctuation', ['none']) ||
      !oneOf('tabSize', ['8']) || !oneOf('textWrapStyle', ['auto', 'pretty'])) return false;
  for (const name of ['fontFeatureSettings', 'fontVariationSettings', 'fontVariant', 'fontVariantLigatures',
    'fontVariantCaps', 'fontVariantNumeric', 'fontVariantEastAsian', 'fontVariantPosition', 'fontVariantAlternates']) {
    if (!oneOf(name, ['normal'])) return false;
  }
  if (!oneOf('fontSynthesis', ['auto', 'weight style small-caps']) ||
      !oneOf('fontSynthesisWeight', ['auto']) || !oneOf('fontSynthesisStyle', ['auto']) ||
      !oneOf('fontSynthesisSmallCaps', ['auto'])) return false;
  const spacing = value => value == null || value === '' || value === 'normal' || /^[-+]?(?:\d*\.)?\d+px$/.test(value);
  if (!spacing(style.letterSpacing) || !spacing(style.wordSpacing)) return false;
  return !(parseFloat(style.wordSpacing) || 0);
}

function optionsFor(options, document) {
  const value = {whiteSpace: options?.whiteSpace ?? 'normal', wordBreak: options?.wordBreak ?? 'normal',
    language: options?.language ?? document?.documentElement?.lang ?? '', policy: options?.policy ?? 'wrap',
    hanging: options?.hanging === true, paragraphBreaks: options?.paragraphBreaks ? Object.freeze([...options.paragraphBreaks]) : null};
  if (!['wrap', 'paragraph'].includes(value.policy)) return null;
  return (value.whiteSpace === 'normal' || value.whiteSpace === 'pre-wrap') &&
    (value.wordBreak === 'normal' || value.wordBreak === 'keep-all') && validLanguage(value.language) ? value : null;
}

function copyItems(items) {
  if (!Array.isArray(items)) return null;
  const result = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') return null;
    if (item.text === undefined) {
      if (!finite(item.width) || item.width < 0) return null;
      result.push(Object.freeze({width: item.width}));
    } else {
      if (typeof item.text !== 'string' || typeof item.font !== 'string' || !item.font.trim() ||
          !finite(item.letterSpacing ?? 0) || !finite(item.extraWidth ?? 0) ||
          item.break != null && item.break !== 'normal' && item.break !== 'never') return null;
      result.push(Object.freeze({text: item.text, font: item.font, letterSpacing: item.letterSpacing ?? 0,
        extraWidth: item.extraWidth ?? 0, break: item.break ?? 'normal', hyphenate: item.hyphenate !== false}));
    }
  }
  return Object.freeze(result);
}

function sameItems(a, b) {
  return a.length === b.length && a.every((item, index) => {
    const other = b[index];
    return item.text === other.text && item.font === other.font && item.width === other.width &&
      item.letterSpacing === other.letterSpacing && item.extraWidth === other.extraWidth && item.break === other.break && item.hyphenate === other.hyphenate;
  });
}

function finish(work) {
  let step;
  do { step = work.next(); } while (!step.done);
  return step.value;
}

function* prepareSteps(items, options, document) {
  const usedFonts = new Map();
  for (const item of items) if (item.text !== undefined) usedFonts.set(item.font, (usedFonts.get(item.font) || '') + item.text);
  for (const [font, text] of usedFonts) {
    if (!fontReady(document, font, text)) return null;
    yield;
  }
  try {
    if (language !== options.language) { setLocale(options.language); language = options.language; }
    if (options.paragraphBreaks && (options.paragraphBreaks[0] !== 0 || options.paragraphBreaks.at(-1) !== items.length ||
        options.paragraphBreaks.some((value, index, all) => !Number.isInteger(value) || value < 0 || value > items.length || index > 0 && value < all[index - 1]))) return null;
    let handle;
    if (options.policy === 'paragraph') {
      const work = prepareParagraphCandidateSteps(items, {...options, document});
      try {
        for (;;) {
          if (language !== options.language) { setLocale(options.language); language = options.language; }
          const step = work.next();
          if (step.done) { handle = step.value; break; }
          yield;
        }
      } finally { work.return(); }
    } else handle = prepareRichInline(items, {whiteSpace: options.whiteSpace, wordBreak: options.wordBreak});
    if (!handle) return null;
    paragraphs.set(handle, {items, options, generation});
    return handle;
  } catch (_) { return null; }
}

export function prepareRichParagraph(items, options = {}) {
  const document = globalThis.document;
  if (!supportedDocument(document)) return null;
  captureFontAuthority(document);
  const source = copyItems(items), settings = optionsFor(options, document);
  return source && settings ? finish(prepareSteps(source, settings, document)) : null;
}

export function paragraphItems(handle) { return paragraphs.get(handle)?.items ?? null; }

export function createPreparationScope(document = globalThis.document) {
  let owners = new WeakMap(), tickets = new WeakMap();
  const handles = new WeakMap();
  const current = handle => {
    if (!supportedDocument(document)) return false;
    captureFontAuthority(document);
    const owner = handles.get(handle);
    return !!owner && owners.get(owner) === handle && paragraphs.get(handle)?.generation === generation;
  };
  function* steps(owner, items, options = {}) {
      if (!supportedDocument(document) || !owner || typeof owner !== 'object' && typeof owner !== 'function') return null;
      captureFontAuthority(document);
      tickets.delete(owner);
      const source = copyItems(items), settings = optionsFor(options, document);
      if (!source || !settings) { owners.delete(owner); return null; }
      const previous = owners.get(owner), prior = paragraphs.get(previous);
      if (prior?.generation === generation && prior.options.whiteSpace === settings.whiteSpace &&
          prior.options.wordBreak === settings.wordBreak && prior.options.language === settings.language &&
          prior.options.policy === settings.policy && prior.options.hanging === settings.hanging &&
          JSON.stringify(prior.options.paragraphBreaks) === JSON.stringify(settings.paragraphBreaks) &&
          sameItems(prior.items, source)) return previous;
      owners.delete(owner);
      const ticket = {}, birth = generation, work = prepareSteps(source, settings, document);
      tickets.set(owner, ticket);
      try {
        for (;;) {
          if (tickets.get(owner) !== ticket || captureFontAuthority(document) !== birth) return null;
          const step = work.next();
          if (step.done) {
            if (captureFontAuthority(document) !== birth) return null;
            const handle = step.value;
            if (handle) { owners.set(owner, handle); handles.set(handle, owner); }
            return handle;
          }
          yield;
        }
      } finally { work.return(); if (tickets.get(owner) === ticket) tickets.delete(owner); }
  }
  function* fitSteps(owner, handle, createWork) {
    let ticket = null, work = null, observe = null, facts = null;
    let slotFor = null, readKnown = null, staged = false, active = false;
    try {
      if (!supportedDocument(document) || !owner || typeof owner !== 'object' && typeof owner !== 'function') return null;
      tickets.delete(owner);
      const birth = captureFontAuthority(document), source = paragraphs.get(handle);
      if (owners.get(owner) !== handle || !source || source.generation !== birth ||
          source.options.policy !== 'paragraph' || typeof createWork !== 'function' ||
          !Number.isInteger(handle.cutCount) || handle.cutCount < 0) return null;
      ticket = {};
      tickets.set(owner, ticket);
      facts = source.edges;
      active = true;
      const currentFit = () => tickets.get(owner) === ticket && owners.get(owner) === handle &&
        source.generation === birth && captureFontAuthority(document) === birth;
      const selectLanguage = () => {
        if (language !== source.options.language) { setLocale(source.options.language); language = source.options.language; }
      };
      slotFor = (segment, word, from, to) => {
        if (!Number.isInteger(segment) || segment < 0 || !Number.isInteger(word) || word < 0 ||
            !Number.isInteger(from) || from < -1 || !Number.isInteger(to) || to < -1) return -2;
        const cuts = handle.segments[segment]?.words[word]?.breaks;
        if (!cuts || from >= cuts.length || to >= cuts.length || from < 0 && to < 0 || from >= 0 && to >= 0 && from >= to) return -2;
        if (from >= 0 && to >= 0) return -1;
        const cut = cuts[from < 0 ? to : from];
        if (!Number.isInteger(cut.slot) || cut.slot < 0 || cut.slot >= handle.cutCount) return -2;
        return cut.slot * 2 + (from < 0 ? 0 : 1);
      };
      readKnown = request => {
        if (!active || tickets.get(owner) !== ticket || generation !== birth) return undefined;
        const slot = slotFor(request?.segment, request?.word, request?.from, request?.to);
        if (slot < 0 || tickets.get(owner) !== ticket || generation !== birth) return undefined;
        const value = facts?.[slot];
        return Number.isNaN(value) ? undefined : value;
      };
      selectLanguage();
      work = createWork(readKnown);
      createWork = null;
      if (typeof work?.next !== 'function') return null;
      let answer, requests = 0;
      for (;;) {
        if (!currentFit()) return null;
        selectLanguage();
        const step = work.next(answer);
        answer = undefined;
        if (step.done) {
          if (!currentFit()) return null;
          const plan = step.value;
          if (!plan || !Array.isArray(plan.lines)) return null;
          for (const line of plan.lines) Object.freeze(line);
          Object.freeze(plan.lines);
          Object.freeze(plan);
          if (!currentFit()) return null;
          if (staged) source.edges = facts;
          return plan;
        }
        if (step.value === null) { yield; continue; }
        const request = step.value;
        const segment = request?.segment, word = request?.word, from = request?.from, to = request?.to;
        const slot = slotFor(segment, word, from, to);
        if (slot === -2) return null;
        if (slot >= 0) {
          answer = facts?.[slot];
          if (answer !== undefined && !Number.isNaN(answer)) continue;
        }
        selectLanguage();
        observe ??= createParagraphObserver(source.items, handle, source.options.language);
        answer = observe({segment, word, from, to});
        if (!finite(answer) || answer < 0) return null;
        if (slot >= 0) {
          if (!staged) {
            facts = facts ? facts.slice() : new Float64Array(handle.cutCount * 2).fill(NaN);
            staged = true;
          }
          facts[slot] = answer;
        }
        if (++requests % 8 === 0) yield;
      }
    } catch (_) { return null; }
    finally {
      active = false;
      observe = null;
      facts = null;
      slotFor = null;
      readKnown = null;
      createWork = null;
      try { work?.return?.(); } catch (_) {}
      work = null;
      if (ticket && tickets.get(owner) === ticket) tickets.delete(owner);
    }
  }
  return {
    prepare: (owner, items, options) => finish(steps(owner, items, options)),
    prepareSteps: steps,
    fit: (owner, handle, createWork) => finish(fitSteps(owner, handle, createWork)),
    fitSteps,
    current,
    invalidateFonts: () => invalidateRichMetrics(document),
    forget: owner => { owners.delete(owner); tickets.delete(owner); },
    retire({documentChanged = false} = {}) {
      owners = new WeakMap();
      tickets = new WeakMap();
      if (documentChanged && document) documents.delete(document);
      const before = generation;
      captureFontAuthority(document);
      if (generation === before) clearMetrics();
    },
  };
}
