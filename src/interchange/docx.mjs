// SPDX-License-Identifier: AGPL-3.0-only
import {isTemplatePage, isPageBorderLayout} from '../spec/template-page.mjs';
import {openArchive, createImportWork, ARCHIVE_LIMITS, crc32} from '../images/archive.mjs';
import {zipStored, zipStoredAsync} from '../notes/zip-records.mjs';
import {finish, finishAsync, cloneTree, encodeUtf8Steps, pause, check} from '../kit/render-work.mjs';
import {formatLayout, parseLayout, decodeLayoutAttribute, indentLevel, textStyle as indentStyle, textLayout, wrapColumnFloor} from '../spec/md-layout.mjs';
import {parseInkBody, normalizeFontFamily, fontFamilyCss, FONT_STACKS, typography} from '../spec/md-marks.mjs';
import {readDocumentSettings, documentSpacing, wordDocumentSettings, documentHeadingSize, DOCUMENT_LEADING, documentLanguage, languageTag} from '../spec/document-settings.mjs';
import {writeFontAssets, documentFontUsage} from '../spec/document-fonts.mjs';
import {DOCX_FONT_TYPE, writeDocxFonts, readDocxFontPart, obfuscateDocxFont} from './docx-fonts.mjs';
import {frontMatterFrame} from '../spec/frontmatter.mjs';
import {WORD_SIDECAR_OPEN} from '../spec/word-sidecar.mjs';
import {initialRange, firstLineEnd, protectInitial, apply as applyTypography} from '../layout/typography.mjs';
import {willMarkerOf} from '../agent/will.mjs';
import {IMAGE_LIMITS, inspectRaster, inspectSVG, inspectJPEGXL, isJxl, dataImage, sanitizeSvgText, svgElements, validAssetDimensions} from '../images/assets.mjs';
import {markdownParser, markdownBodyOffset, documentAssets, normalizeLabel} from '../spec/md-assets.mjs';
import {parseComments, commentThreads, commentAnchor, writeComments, commentSplices, validCommentDate, validCommentTimestamp} from '../agent/comments.mjs';
import {DOCX_FONTS} from '../shell/fonts/docx-fonts.mjs';
import {_rapierHeadingSlugBase, _rapierNextHeadingSlug} from '../editor/source-facts.mjs';

const DOCX_LIMITS = Object.freeze({xmlBytes: 8 * 1024 * 1024, totalXmlBytes: 12 * 1024 * 1024,
  elements: 200000, depth: 96, styles: 2048, paragraphs: 50000, images: 1024, tableColumns: 64});

const NS = Object.freeze({
  w: ['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main'],
  m: ['http://schemas.openxmlformats.org/officeDocument/2006/math', 'http://purl.oclc.org/ooxml/officeDocument/math'],
  r: ['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships'],
  a: ['http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main'],
  wp: ['http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing'],
  pic: ['http://schemas.openxmlformats.org/drawingml/2006/picture', 'http://purl.oclc.org/ooxml/drawingml/picture'],
  svg: ['http://schemas.microsoft.com/office/drawing/2016/SVG/main'],
  rapier: ['https://rapier.website/ns/docx'],
  rel: ['http://schemas.openxmlformats.org/package/2006/relationships'],
  ct: ['http://schemas.openxmlformats.org/package/2006/content-types'],
  custom: ['http://schemas.openxmlformats.org/officeDocument/2006/custom-properties'],
  vt: ['http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes'],
  mc: ['http://schemas.openxmlformats.org/markup-compatibility/2006'],
  w14: ['http://schemas.microsoft.com/office/word/2010/wordml'],
  w15: ['http://schemas.microsoft.com/office/word/2012/wordml'],
  thm15: ['http://schemas.microsoft.com/office/thememl/2012/main'],
  w16cid: ['http://schemas.microsoft.com/office/word/2016/wordml/cid'],
  w16cex: ['http://schemas.microsoft.com/office/word/2018/wordml/cex'],
  v: ['urn:schemas-microsoft-com:vml'], o: ['urn:schemas-microsoft-com:office:office']
});
const utf8 = new TextEncoder();
const descendants = function* (node, family, name) {
  const stack = [{nodes: node.children, at: 0}];
  while (stack.length) {
    const frame = stack.at(-1), item = frame.nodes[frame.at++];
    if (!item) { stack.pop(); continue; }
    if (!family || is(item, family, name)) yield item;
    const nested = item.children;
    if (nested.length) stack.push({nodes: nested, at: 0});
  }
};
const MARKERS = ['bookmarkStart','bookmarkEnd','proofErr','permStart','permEnd','moveFromRangeStart','moveFromRangeEnd','moveToRangeStart','moveToRangeEnd','customXmlPr','smartTagPr'];
const SYMBOL_GREEK = 'ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖαβχδεφγηιϕκλμνοπθρστυϖωξψζ';
const SYMBOL_SIGNS = {32:' ',34:'∀',36:'∃',39:'∋',42:'∗',45:'−',64:'≅',92:'∴',94:'⊥',96:'‾',126:'∼',163:'≤',165:'∞',171:'↔',172:'←',173:'↑',174:'→',175:'↓',176:'°',177:'±',179:'≥',180:'×',181:'∝',182:'∂',183:'•',184:'÷',185:'≠',186:'≡',187:'≈',188:'…',192:'ℵ',193:'ℑ',194:'ℜ',195:'℘',196:'⊗',197:'⊕',198:'∅',199:'∩',200:'∪',201:'⊃',202:'⊇',203:'⊄',204:'⊂',205:'⊆',206:'∈',207:'∉',209:'∇',213:'∏',214:'√',215:'⋅',216:'¬',217:'∧',218:'∨',219:'⇔',220:'⇐',221:'⇑',222:'⇒',223:'⇓',229:'∑',242:'∫'};
const WINGDINGS_SIGNS = {33:'✏',34:'✂',40:'☎',41:'✆',42:'✉',54:'⌛',55:'⌨',74:'☺',75:'😐',76:'☹',108:'●',110:'■',111:'□',112:'□',113:'❑',114:'❒',116:'◆',117:'❖',118:'⬥',119:'⌖',128:'⓪',159:'•',160:'▪',161:'○',162:'◉',163:'◎',164:'◈',165:'✦',166:'★',167:'✧',168:'✴',216:'➢',217:'➣',218:'➤',231:'←',232:'→',233:'↑',234:'↓',251:'✗',252:'✓',253:'☒',254:'☑'};
const FONT_KINDS = 'Fonts the Word file names but does not contain became Rapier’s fonts of the same kind.';
const STRUCTURAL_EMPHASIS = 'RapierStructuralEmphasis';
const STRUCTURAL_EMPHASIS_NAME = 'Rapier structural emphasis';
const DOCX_SOURCE = Object.freeze({path: 'rapier/source.json',
  type: 'application/vnd.rapier.markdown-source+json',
  relationship: 'https://rapier.website/relationships/markdown-source'});
const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  byte => byte.toString(16).padStart(2, '0')).join('');

async function wordRecoveryBytes(stream, limit, work) {
  const reader = stream.getReader(), chunks = []; let length = 0;
  try {
    for (;;) {
      await pause(work);
      const {value, done} = await reader.read();
      if (done) break;
      if (value.length > limit - length) return fail('Word recovery exceeds its limit.', 'docx_recovery_limit');
      chunks.push(value); length += value.length;
    }
    const bytes = new Uint8Array(length); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    return bytes;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

async function wordRecoveryRecord(source, work, equations = []) {
  const bytes = utf8.encode(source);
  const packed = await wordRecoveryBytes(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),
    Math.floor((DOCX_LIMITS.xmlBytes - 512) * .75), work);
  const parts = [];
  for (let at = 0; at < packed.length; at += 49152) parts.push(btoa(String.fromCharCode(...packed.subarray(at, at + 49152))));
  return JSON.stringify({gzip: parts.join(''), sha256: await sha256(bytes), ...(equations.length ? {equations} : {})});
}

async function readWordRecovery(text, work) {
  const record = JSON.parse(text);
  if (JSON.stringify(record) !== text || !/^[a-f0-9]{64}$/.test(record?.sha256)) return null;
  let source = record.source;
  if (typeof record.gzip === 'string' && source === undefined) {
    if (record.gzip.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(record.gzip)) return null;
    const packed = Uint8Array.from(atob(record.gzip), c => c.charCodeAt(0));
    const bytes = await wordRecoveryBytes(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')), ARCHIVE_LIMITS.bytes, work);
    source = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
  } else if (record.gzip !== undefined) return null;
  if (typeof source !== 'string' || source.length > ARCHIVE_LIMITS.bytes || source.includes('\u0000')) return null;
  const bytes = utf8.encode(source);
  if (bytes.length > ARCHIVE_LIMITS.bytes || new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(bytes) !== source || await sha256(bytes) !== record.sha256) return null;
  return source;
}

async function docxSourceRecord(entries, source, work = null, equations = []) {
  const bytes = work ? await finishAsync(encodeUtf8Steps(source), work) : utf8.encode(source);
  if (bytes.length > ARCHIVE_LIMITS.bytes || source.includes('\u0000') || new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes) !== source)
    return fail('DOCX source is not an admitted UTF-8 document.', 'docx_source_invalid');
  const parts = [];
  for (const entry of [...entries].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    parts.push({name: entry.name, bytes: entry.bytes.length, sha256: await sha256(entry.bytes)});
  const record = JSON.stringify({format: 'md-source:v1', source, sha256: await sha256(bytes), parts, ...(equations.length ? {equations} : {})});
  return work ? finishAsync(encodeUtf8Steps(record), work) : utf8.encode(record);
}

async function readDocxSource(files, path, work) {
  if (!files.has(path)) return null;
  let bytes = await files.read(path);
  if (bytes.length > ARCHIVE_LIMITS.bytes) return null;
  work.check();
  let record;
  try { record = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch (_) { return null; }
  bytes = null;
  await work.checkpoint();
  if (!record || record.format !== 'md-source:v1' || typeof record.source !== 'string' ||
      record.source.length > ARCHIVE_LIMITS.bytes || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256) ||
      !Array.isArray(record.parts)) return null;
  const native = files.entries.filter(entry => !entry.directory && entry.name !== path)
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  let exact = record.parts.length === native.length;
  let size = 0, nextCheck = 0;
  for (let at = 0; at < record.source.length; at++) {
    const code = record.source.charCodeAt(at);
    if (!code) return null;
    if (code >= 0xd800 && code <= 0xdbff) {
      const tail = record.source.charCodeAt(++at);
      if (!(tail >= 0xdc00 && tail <= 0xdfff)) return null;
      size += 4;
    } else {
      if (code >= 0xdc00 && code <= 0xdfff) return null;
      size += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
    }
    if (size > ARCHIVE_LIMITS.bytes) return null;
    if (at >= nextCheck) { nextCheck = at + 4096; await work.checkpoint(); }
  }
  let source = new Uint8Array(size), offset = 0;
  for (let at = 0; at < record.source.length;) {
    let end = Math.min(record.source.length, at + 65536);
    if (end < record.source.length && record.source.charCodeAt(end - 1) >= 0xd800 && record.source.charCodeAt(end - 1) <= 0xdbff) end--;
    offset += utf8.encodeInto(record.source.slice(at, end), source.subarray(offset)).written;
    at = end; await work.checkpoint();
  }
  if (await sha256(source) !== record.sha256) return null;
  source = null;
  for (let index = 0; exact && index < native.length; index++) {
    await work.checkpoint();
    const entry = native[index], part = record.parts[index];
    if (!part || part.name !== entry.name || part.bytes !== entry.size || typeof part.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(part.sha256)) { exact = false; break; }
    if (await sha256(await files.read(entry.name)) !== part.sha256) exact = false;
  }
  work.check();
  const equations = new Map();
  if (Array.isArray(record.equations) && record.equations.length <= DOCX_LIMITS.elements)
    for (const pair of record.equations)
      if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string' && mathSourceParts(pair[1]) && record.source.includes(pair[1])) equations.set(pair[0], pair[1]);
  return {source: record.source, exact, equations};
}
const is = (node, family, name) => node?.nodeType === 1 && NS[family].includes(node.namespaceURI) && (!name || node.localName === name);
const children = (node, family, name) => Array.from(node?.children || []).filter(child => is(child, family, name));
const child = (node, family, name) => {
  for (const item of node?.children || []) if (is(item, family, name)) return item;
  return null;
};
const attr = (node, family, name) => {
  if (!node) return null;
  for (const namespace of NS[family]) if (node.hasAttributeNS(namespace, name)) return node.getAttributeNS(namespace, name);
  return null;
};
const val = node => attr(node, 'w', 'val');
const foldRotationDegrees = degrees => {
  let folded = degrees > 180 ? degrees - 360 : degrees;
  folded = Math.round(folded * 10) / 10;
  if (folded <= -180) folded += 360;
  else if (folded > 180) folded -= 360;
  return folded === 0 ? 0 : folded;
};
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
const attributeText = value => escape(value).replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
const fail = (message, code = 'docx_invalid') => { const error = new Error(message); error.code = code; throw error; };
const alphaOpacity = value => {
  if (value == null) return 100;
  const amount = /^(\d{1,6}(?:\.\d+)?)(%?)$/.exec(value), percent = amount && (amount[2] ? Number(amount[1]) : Number(amount[1]) / 1000);
  if (!amount || percent > 100) return fail('DOCX contains an invalid picture transparency.');
  return Math.max(5, Math.round(percent));
};
const integer = (value, fallback = null, min = 0, max = 2147483647) => {
  if (value == null) return fallback;
  if (!/^-?\d+$/.test(value)) return fail('DOCX contains an invalid number.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) return fail('DOCX contains an out-of-range number.');
  return number;
};
const on = node => node ? !['0', 'false', 'off'].includes(val(node)) : undefined;
const cropFraction = (value, legacy = false) => {
  if (value == null) return 0;
  const pattern = legacy ? /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:%|f)?$/ : /^(?:-?\d+|-?\d+(?:\.\d+)?%)$/;
  if (!pattern.test(value)) return fail('DOCX contains an invalid picture crop.');
  const number = value.endsWith('%') ? Number(value.slice(0, -1)) / 100 :
    value.endsWith('f') ? Number(value.slice(0, -1)) / 65536 : Number(value) / (legacy ? 1 : 100000);
  if (!Number.isFinite(number) || number >= 1) return fail('DOCX pictures with an empty crop are not supported.');
  return number;
};

function wordFont(value) {
  const match = /^\s*(?:"([^"]+)"|'([^']+)'|([^,]+))/.exec(value || ''), name = (match?.[1] || match?.[2] || match?.[3] || '').trim();
  if (!name || name.length > 256 || /[\u0000-\u001f]/.test(name)) return null;
  return ({serif: 'Georgia', 'sans-serif': 'Calibri', 'system-ui': 'Calibri', 'ui-monospace': 'Courier New', monospace: 'Courier New'})[name] || name;
}

function pictureInitialLayout(layout) {
  return !!layout?.lines && layout.wrap === 'around' && !layout.x && !layout.y && !layout.rotate &&
    (!layout.align || layout.align === 'left');
}

function proseInitial(runs) {
  const initial = initialRange(runs.filter(run => run.type === 'text').map(run => run.text || '').join(''));
  if (!initial) return null;
  const letterAt = initial.start + Math.max(0, initial.text.search(/[\p{L}\p{N}]/u));
  let offset = 0;
  for (const run of runs) {
    if (run.type === 'text') {
      const end = offset + (run.text || '').length;
      if (letterAt < end) return run.code ? null : initial;
      offset = end;
    } else if (!['bookmarkStart', 'bookmarkEnd'].includes(run.type)) return null;
  }
  return null;
}

function splitTextRuns(runs, boundary) {
  const before = [], after = [];
  let offset = 0;
  for (const run of runs) {
    const length = run.type === 'text' ? (run.text || '').length : 0;
    if (offset + length <= boundary) before.push(run);
    else if (offset >= boundary) after.push(run);
    else {
      const at = boundary - offset;
      const events = run.commentEvents || [];
      before.push({...run, text: run.text.slice(0, at), commentEvents: events.filter(event => event.at < at || event.at === at && !event.start)});
      after.push({...run, text: run.text.slice(at), commentEvents: events.filter(event => event.at > at || event.at === at && event.start)
        .map(event => ({...event, at: event.at - at}))});
    }
    offset += length;
  }
  return [before, after];
}

export async function prepareDocxTypography(root, canonical, {work, willTokens = [], wordLayout = false} = {}) {
  const carriers = new Set(willTokens);
  const pictureCaps = new Map();
  for (const paragraph of root.querySelectorAll('p')) {
    if (paragraph.closest('table,pre') || paragraph.textContent.trim()) continue;
    const images = paragraph.querySelectorAll('img'), next = paragraph.nextElementSibling;
    if (images.length !== 1 || next?.tagName !== 'P' || !next.textContent.trim() ||
        !next.children.length && carriers.has(next.textContent)) continue;
    const image = images[0], layout = parseLayout(decodeLayoutAttribute(image.getAttribute('data-rapier-image-layout') || paragraph.getAttribute('data-md-layout')));
    const textLayout = parseLayout(decodeLayoutAttribute(next.getAttribute('data-md-layout')));
    if (pictureInitialLayout(layout) && !textLayout?.lines) pictureCaps.set(next, {paragraph, image, layout});
  }
  const paragraphs = Array.from(root.querySelectorAll('p')).filter(node => {
    const layout = parseLayout(decodeLayoutAttribute(node.getAttribute('data-md-layout')));
    return !node.closest('table,pre') && (layout?.lines || layout?.caps || pictureCaps.has(node));
  });
  const document = root.ownerDocument, view = document?.defaultView;
  if (!paragraphs.length || !document?.body || !view?.getComputedStyle) return;
  const authored = readDocumentSettings(canonical), settings = wordLayout ? wordDocumentSettings(authored) : authored, type = referenceType(settings);
  const width = ((settings.papersize?.width || 12240) - 2 * (settings.geometry?.twips ?? 1440)) / 15;
  const measure = root.cloneNode(true);
  measure.classList.add('md-render');
  measure.setAttribute('aria-hidden', 'true'); measure.setAttribute('inert', '');
  measure.setAttribute('lang', documentLanguage(settings, view.navigator?.language));
  Object.assign(measure.style, {position: 'fixed', left: '-100000px', top: '0', width: Math.max(1, width) + 'px',
    maxWidth: 'none', margin: '0', padding: '0', visibility: 'hidden', pointerEvents: 'none', contentVisibility: 'visible'});
  measure.style.setProperty('--md-unit', '16px');
  measure.style.setProperty('--md-text-body', type.body * 4 / 3 + 'px');
  measure.style.setProperty('--md-line', type.line * 4 / 3 + 'px');
  const bodyFont = settings.mainfont?.css || settings.sansfont?.css;
  if (bodyFont) measure.style.setProperty('--md-font-sans', bodyFont);
  const measured = Array.from(measure.querySelectorAll('p'));
  const originals = Array.from(root.querySelectorAll('p'));
  const context = document.createElement('canvas').getContext('2d');
  document.body.appendChild(measure);
  try {
    measure.getBoundingClientRect();
    if (document.fonts) await document.fonts.ready;
    for (const paragraph of paragraphs) {
      check(work);
      const target = measured[originals.indexOf(paragraph)], layout = parseLayout(decodeLayoutAttribute(paragraph.getAttribute('data-md-layout'))) || {};
      protectInitial(target);
      const initial = initialRange(target), sourceText = target.textContent || '';
      let initialNode = target;
      if (initial) {
        const walker = document.createTreeWalker(target, 4);
        const letterAt = initial.start + Math.max(0, initial.text.search(/[\p{L}\p{N}]/u));
        let offset = 0, text;
        while ((text = walker.nextNode())) {
          if (offset + text.length > letterAt) { initialNode = text.parentElement || target; break; }
          offset += text.length;
        }
      }
      const face = view.getComputedStyle(initialNode).fontFamily;
      const picture = pictureCaps.get(paragraph);
      if (picture) {
        const pictureParagraph = measured[originals.indexOf(picture.paragraph)], image = pictureParagraph.querySelector('img');
        if (typeof image.decode === 'function') await image.decode().catch(() => {});
        const style = view.getComputedStyle(initialNode);
        let cap = .7, ascent = .8, descent = .2;
        if (context) {
          context.font = style.fontStyle + ' ' + style.fontWeight + ' 100px ' + style.fontFamily;
          const metrics = context.measureText('H');
          cap = metrics.actualBoundingBoxAscent / 100 || cap;
          ascent = metrics.fontBoundingBoxAscent / 100 || ascent;
          descent = metrics.fontBoundingBoxDescent / 100 || descent;
        }
        const height = (picture.layout.lines - 1) * type.line + type.body * cap;
        const top = Math.max(0, (type.line - type.body * (ascent + descent)) / 2 + type.body * (ascent - cap));
        picture.image.setAttribute('data-md-picture-cap-height', String(Math.max(1, Math.round(height * 12700))));
        picture.image.setAttribute('data-md-picture-cap-top', String(Math.round(top * 12700)));
        const ratio = (image.naturalWidth || Number(image.getAttribute('width')) || 1) / (image.naturalHeight || Number(image.getAttribute('height')) || 1);
        const pictureWidth = Math.min(width, height * ratio * 4 / 3);
        const float = document.createElement('span');
        Object.assign(float.style, {float: 'left', width: pictureWidth + 'px',
          height: pictureWidth / ratio + 'px', marginTop: top * 4 / 3 + 'px', marginRight: '5.333333px'});
        pictureParagraph.style.display = 'none'; target.insertBefore(float, target.firstChild);
      }
      if (layout.lines && face && !target.hasAttribute('data-rapier-typography-protected-initial')) {
        target.style.setProperty('--md-drop-cap-font', face);
        paragraph.setAttribute('data-md-initial-font', face);
        if (context && initial) {
          const bodyStyle = view.getComputedStyle(target), initialStyle = view.getComputedStyle(initialNode);
          context.font = bodyStyle.fontStyle + ' ' + bodyStyle.fontWeight + ' 100px ' + bodyStyle.fontFamily;
          const cap = context.measureText('H').actualBoundingBoxAscent / 100;
          context.font = initialStyle.fontStyle + ' ' + initialStyle.fontWeight + ' 100px ' + face;
          const glyph = context.measureText(initial.text), ink = (glyph.actualBoundingBoxAscent + glyph.actualBoundingBoxDescent) / 100;
          if (cap > 0 && ink > 0) paragraph.setAttribute('data-md-initial-size', String(Math.min(3276,
            Math.max(1, Math.round(((layout.lines - 1) * type.line + type.body * cap) / ink * 2)))));
        }
      }
      applyTypography(target, {all: true});
      if (layout.caps === 'small') {
        const end = firstLineEnd(target);
        if (Number.isSafeInteger(end) && end >= 0 && end <= sourceText.length) {
          const range = document.createRange(), walker = document.createTreeWalker(target, 4);
          range.setStart(target, 0); range.setEnd(target, 0);
          let offset = 0, text;
          while ((text = walker.nextNode())) {
            if (offset + text.length >= end) { range.setEnd(text, end - offset); break; }
            offset += text.length;
          }
          const prefix = target.cloneNode(false), holder = document.createElement('div');
          prefix.append(range.cloneContents()); holder.append(prefix);
          const runs = docxBlocksFromDom(holder).blocks[0]?.runs || [];
          paragraph.setAttribute('data-md-first-line-end', String(runs.reduce((length, run) => length + (run.type === 'text' ? run.text.length : 0), 0)));
        }
      }
      await pause(work);
    }
  } finally { measure.remove(); }
}

function partPath(source, target) {
  if (!target || /[\\\u0000-\u0020\u007f?#]/.test(target) || /%(?:00|2f|5c)/i.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//'))
    return fail('DOCX contains an invalid internal relationship.');
  let decoded;
  try { decoded = decodeURIComponent(target); } catch (_) { return fail('DOCX contains an invalid part name.'); }
  if (/[\\\u0000-\u001f\u007f?#]/.test(decoded) || /%(?:2e|2f|5c)/i.test(decoded)) return fail('DOCX contains an invalid part name.');
  const parts = target.startsWith('/') ? [] : source.split('/').slice(0, -1);
  for (const component of decoded.split('/')) {
    if (!component || component === '.') continue;
    if (component === '..') { if (!parts.length) return fail('DOCX relationship escapes its package.', 'docx_relationship_escape'); parts.pop(); }
    else parts.push(component);
  }
  if (!parts.length) return fail('DOCX contains an empty part name.');
  return parts.join('/');
}

async function xmlText(bytes, work) {
  const utf16le = bytes[0] === 255 && bytes[1] === 254 || bytes[0] === 60 && bytes[1] === 0;
  const utf16be = bytes[0] === 254 && bytes[1] === 255 || bytes[0] === 0 && bytes[1] === 60;
  const decoder = new TextDecoder(utf16le ? 'utf-16le' : utf16be ? 'utf-16be' : 'utf-8', {fatal: true}), parts = [];
  for (let at = 0; at < bytes.length; at += 65536) {
    try { parts.push(decoder.decode(bytes.subarray(at, at + 65536), {stream: true})); }
    catch (_) { return fail('DOCX XML is not valid UTF-8 or UTF-16.'); }
    await work.checkpoint();
  }
  try { parts.push(decoder.decode()); }
  catch (_) { return fail('DOCX XML is not valid UTF-8 or UTF-16.'); }
  return parts.join('');
}

function paragraphProperties(node) {
  const out = {}, number = child(node, 'w', 'numPr');
  const indent = child(node, 'w', 'ind');
  const left = attr(indent, 'w', 'start') ?? attr(indent, 'w', 'left');
  if (left != null) out.leftIndent = integer(left, null, -2147483648);
  const hanging = attr(indent, 'w', 'hanging'), first = attr(indent, 'w', 'firstLine');
  if (hanging != null) out.firstIndent = -integer(hanging);
  else if (first != null) out.firstIndent = integer(first);
  for (const tab of children(child(node, 'w', 'tabs'), 'w', 'tab')) {
    const position = integer(attr(tab, 'w', 'pos'), null, -2147483648);
    if (position == null) return fail('DOCX tab stop has no position.');
    (out.tabs ||= new Map()).set(position, attr(tab, 'w', 'val'));
  }
  for (const [name, key] of [['jc', 'align'], ['outlineLvl', 'outline']]) {
    const value = val(child(node, 'w', name));
    if (value != null) out[key] = value;
  }
  const bidi = on(child(node, 'w', 'bidi'));
  if (bidi !== undefined) out.bidi = bidi;
  const pageBreakBefore = on(child(node, 'w', 'pageBreakBefore'));
  if (pageBreakBefore !== undefined) out.pageBreakBefore = pageBreakBefore;
  for (const [name, key] of [['suppressAutoHyphens', 'suppressHyphens'], ['overflowPunct', 'hangingPunctuation']]) {
    const value = on(child(node, 'w', name));
    if (value !== undefined) out[key] = value;
  }
  const frame = child(node, 'w', 'framePr');
  if (['drop', 'margin'].includes(attr(frame, 'w', 'dropCap'))) out.dropLines = integer(attr(frame, 'w', 'lines'), 3, 1, 12);
  for (const [name, key] of [['numId', 'numId'], ['ilvl', 'level']]) {
    const value = val(child(number, 'w', name));
    if (value != null) out[key] = integer(value, null, 0, name === 'ilvl' ? 8 : 2147483647);
  }
  return out;
}

function mergeParagraphProperties(...layers) {
  const result = Object.assign({}, ...layers), tabs = new Map(layers.flatMap(layer => [...(layer?.tabs || [])]));
  if (tabs.size) result.tabs = tabs;
  return result;
}

const DOCX_HIGHLIGHT_TO_RAPIER = Object.freeze({yellow:'yellow', green:'green', red:'red', blue:'blue', magenta:'purple'});
const DOCX_HIGHLIGHT_HEX = Object.freeze({black:'#000000', blue:'#0000ff', cyan:'#00ffff', green:'#00ff00',
  magenta:'#ff00ff', red:'#ff0000', yellow:'#ffff00', white:'#ffffff', darkBlue:'#000080', darkCyan:'#008080',
  darkGreen:'#008000', darkMagenta:'#800080', darkRed:'#800000', darkYellow:'#808000', darkGray:'#808080', lightGray:'#c0c0c0'});

function themeColor(node, colors) {
  const rgb = colors.get(attr(node, 'w', 'themeColor'));
  if (!rgb) return val(node);
  const tint = attr(node, 'w', 'themeTint'), shade = attr(node, 'w', 'themeShade'), amount = tint ?? shade;
  if (amount == null) return rgb;
  if (!/^[0-9a-f]{2}$/i.test(amount)) return fail('DOCX contains an invalid theme color adjustment.', 'docx_theme_color');
  const channels = [0,2,4].map(at => parseInt(rgb.slice(at,at + 2),16) / 255);
  const low = Math.min(...channels), high = Math.max(...channels), delta = high - low, light = (high + low) / 2;
  const ratio = parseInt(amount,16) / 255, nextLight = tint != null ? light * ratio + 1 - ratio : light * ratio;
  const saturation = delta ? delta / (1 - Math.abs(2 * light - 1)) : 0;
  const chroma = (1 - Math.abs(2 * nextLight - 1)) * saturation, minimum = nextLight - chroma / 2;
  return channels.map(channel => Math.round(255 * (minimum + (delta ? (channel - low) / delta * chroma : 0))).toString(16).padStart(2,'0')).join('');
}

function runProperties(node, theme = new Map(), inlineSize = true) {
  const out = {};
  const size = child(node, 'w', 'sz'), complexSize = child(node, 'w', 'szCs');
  if (inlineSize && (size || complexSize)) {
    out.halfPoints = integer(val(size || complexSize), null, 1, 3276);
    if (out.halfPoints === null) return fail('DOCX run sizes must have one supported half-point value.', 'docx_run_size');
  }
  const fonts = child(node, 'w', 'rFonts'), font = (name, themed = name + 'Theme') => attr(fonts, 'w', name) || theme.get(attr(fonts, 'w', themed));
  const letter = is(node?.parentNode, 'w', 'r') && /\p{L}/u.exec(children(node.parentNode, 'w', 't').map(text => text.textContent).join(''))?.[0];
  const slot = letter && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u.test(letter) ? font('eastAsia') :
    letter && !/[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u.test(letter) ? font('cs', 'cstheme') : null;
  const family = normalizeFontFamily(slot || font('ascii') || font('hAnsi') || font('eastAsia') || font('cs', 'cstheme'));
  if (family) out.family = family;
  for (const [name, key] of [['b', 'bold'], ['i', 'italic'], ['strike', 'strike'], ['vanish', 'hidden'], ['smallCaps', 'smallCaps']]) {
    const value = on(child(node, 'w', name));
    if (value !== undefined) out[key] = value;
  }
  const underline = child(node, 'w', 'u'), vertical = val(child(node, 'w', 'vertAlign'));
  if (underline) out.underline = val(underline) !== 'none';
  if (vertical != null) out.vertical = vertical;
  const color = themeColor(child(node, 'w', 'color'), theme);
  if (color && /^[0-9a-f]{6}$/i.test(color)) out.color = '#' + color.toLowerCase();
  else if (color === 'auto') out.color = null;
  const highlight = val(child(node, 'w', 'highlight'));
  if (highlight != null && highlight !== 'none') {
    if (!DOCX_HIGHLIGHT_HEX[highlight]) return fail('DOCX contains an invalid highlight color.', 'docx_highlight_color');
    out.highlight = highlight === 'yellow' ? 'default' : DOCX_HIGHLIGHT_TO_RAPIER[highlight] || highlight;
  }
  else if (highlight === 'none') out.highlight = null;
  const shading = child(node, 'w', 'shd'), fill = '#' + String(attr(shading, 'w', 'fill')).toLowerCase();
  if (out.highlight === undefined && val(shading) === 'clear' && /^#[0-9a-f]{6}$/.test(fill)) out.highlight = fill === HIGHLIGHT_HEX.yellow ? 'yellow' : fill;
  const language = languageTag(attr(child(node, 'w', 'lang'), 'w', 'val'));
  if (language) out.language = language;
  return out;
}

function mergeRunStyle(base, own) {
  const result = {...base, ...own};
  for (const key of ['bold', 'italic', 'strike', 'hidden', 'smallCaps']) if (Object.hasOwn(own, key)) result[key] = own[key] ? !base[key] : !!base[key];
  return result;
}

function textStyle(html, style) {
  if (!html) return html;
  for (const [key, tag] of [['bold','strong'], ['italic','em'], ['strike','s'], ['underline','u']]) if (style[key]) html = '<' + tag + '>' + html + '</' + tag + '>';
  if (style.vertical === 'superscript') html = '<sup>' + html + '</sup>';
  if (style.vertical === 'subscript') html = '<sub>' + html + '</sub>';
  if (style.smallCaps) html = sourceToken('<span style="font-variant-caps:small-caps">') + html + sourceToken('</span>');
  const typed = {};
  if (style.halfPoints != null) typed.size = style.halfPoints / 2 + 'pt';
  if (style.color) typed.color = style.color;
  if (style.family) typed.family = style.family;
  html = typography.wrap(typed, html);
  if (style.highlight === 'default') html = '<mark>' + html + '</mark>';
  else if (style.highlight) {
    if (Object.values(DOCX_HIGHLIGHT_TO_RAPIER).includes(style.highlight)) html = '<mark data-rapier-highlight="' + style.highlight + '">' + html + '</mark>';
    else html = sourceToken('<mark style="background-color:' + (DOCX_HIGHLIGHT_HEX[style.highlight] || style.highlight) + '">') + html + sourceToken('</mark>');
  }
  return html;
}

function sourceToken(source, visible = source) {
  return '<span class="rapier-source-token" data-rapier-source="' + escape(encodeURIComponent(source)) +
    '" data-rapier-visible="' + escape(encodeURIComponent(visible)) + '">' + escape(visible) + '</span>';
}
function importedText(text) {
  return String(text).split(/([\t\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff])/u)
    .map(part => /^[\t\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/u.test(part)
      ? sourceToken('&#' + part.codePointAt(0) + ';') : escape(part)).join('');
}

let mathTexHalfPoints = 26;
const MATH_BORDER_EDGES = [['top', 'hideTop'], ['bottom', 'hideBot'], ['left', 'hideLeft'], ['right', 'hideRight']];
const MATH_BORDER_STRIKES = [['horizontalstrike', 'strikeH'], ['verticalstrike', 'strikeV'], ['updiagonalstrike', 'strikeBLTR'], ['downdiagonalstrike', 'strikeTLBR']];
const ommlSource = (node, halfPoints = 26) => {
  const saved = mathTexHalfPoints;
  mathTexHalfPoints = halfPoints;
  try { return (is(node, 'm', 'oMathPara') ? '$$' : '$') + mathTex(node).trim() + (is(node, 'm', 'oMathPara') ? '$$' : '$'); }
  finally { mathTexHalfPoints = saved; }
};
const MATH_TEX_SIZES = [['tiny', .5], ['scriptsize', .7], ['footnotesize', .8], ['small', .9], ['normalsize', 1], ['large', 1.2], ['Large', 1.44], ['LARGE', 1.728], ['huge', 2.074], ['Huge', 2.488]];
function mathSourceParts(source) {
  const dollars = /^(?:\$\$((?:(?!\$\$)[\s\S])+)\$\$|\$([^$]+)\$)$/.exec(source);
  if (dollars) return {tex: dollars[1] ?? dollars[2], display: dollars[1] !== undefined};
  if (!/[\r\n]/.test(source)) return null;
  try {
    const tokens = markdownParser().parse(source, {}), token = tokens[0];
    if (tokens.length === 1 && token.type === 'fence' && String(token.info || '').trim().split(/\s+/)[0].toLowerCase() === 'math' &&
        token.meta?.rapierFenceClosed === true && token.meta.mathSource === source) return {tex: token.content, display: true};
  } catch (_) {}
  return null;
}
function groupCommand(node) {
  const property = key => attr(child(child(node, 'm', 'groupChrPr'), 'm', key), 'm', 'val');
  const symbol = property('chr') ?? '⏟', below = (property('pos') ?? 'bot') === 'bot';
  if (symbol === '⏟' || symbol === '⏞') return below ? '\\underbrace' : '\\overbrace';
  const command = {__proto__: null, '⏜': 'overparen', '⏝': 'underparen', '⎴': 'overbracket', '⎵': 'underbracket'}[symbol];
  if (command) return '\\' + command;
  const arrow = {__proto__: null, '→': 'rightarrow', '←': 'leftarrow', '↔': 'leftrightarrow'}[symbol];
  if (arrow) return '\\' + (below ? 'under' : 'over') + arrow;
  const harpoon = {__proto__: null, '⇀': 'overrightharpoon', '↼': 'overleftharpoon'}[symbol];
  return harpoon && !below ? '\\' + harpoon : null;
}
function mathTex(node) {
  const text = value => String(value).replace(/[\\{}$%#&_^~\u2002\u2003\u2005\u205f\u2009]/g, c => ({'\\':'\\backslash{}',
    '^':'\\text{\\textasciicircum}', '~':'\\text{\\textasciitilde}', '\u2003':'\\quad ', '\u2002':'\\enspace ', '\u2005':'\\;',
    '\u205f':'\\:', '\u2009':'\\,'}[c] || '\\' + c));
  const property = (name, key, fallback = null) => attr(child(child(node, 'm', name + 'Pr'), 'm', key), 'm', 'val') ?? fallback;
  const hidden = (name, key) => {
    const bit = child(child(node, 'm', name + 'Pr'), 'm', key);
    return bit ? !['0', 'false', 'off'].includes(attr(bit, 'm', 'val')) : false;
  };
  const contents = parent => Array.from(parent?.children || []).filter(n =>
    !(is(n, 'm') && n.localName.endsWith('Pr')) && !(is(n, 'w') && (n.localName === 'rPr' || MARKERS.includes(n.localName)))).map(mathTex).join('');
  const part = name => contents(child(node, 'm', name));
  if (is(node, 'm', 't') || is(node, 'w', 't')) return text(node.textContent);
  if (is(node, 'w', 'br') || is(node, 'w', 'cr')) return '\\\\';
  if (!is(node, 'm')) return fail('DOCX contains unsupported equation content: ' + node.localName, 'docx_math_unsupported');
  const name = node.localName;
  if (['oMath', 'oMathPara', 'e', 'num', 'den', 'sub', 'sup', 'deg', 'lim', 'fName', 'box'].includes(name)) return contents(node);
  if (name === 'r') {
    const word = child(node, 'w', 'rPr');
    if (['vanish', 'strike', 'dstrike'].some(key => on(child(word, 'w', key))) || child(word, 'w', 'rStyle'))
      return fail('DOCX contains unsupported equation run formatting.', 'docx_math_unsupported');
    let value = contents(node);
    const paint = attr(child(word, 'w', 'color'), 'w', 'val'), colored = tex => /^[0-9A-Fa-f]{6}$/.test(paint || '') ? '\\textcolor[HTML]{' + paint.toUpperCase() + '}{' + tex + '}' : tex;
    const half = Number(val(child(word, 'w', 'sz'))), ratio = half > 0 ? half / mathTexHalfPoints : 1,
      size = Math.abs(ratio - 1) < 0.04 ? null : MATH_TEX_SIZES.reduce((best, row) => Math.abs(Math.log(row[1] / ratio)) < Math.abs(Math.log(best[1] / ratio)) ? row : best)[0],
      painted = tex => size && size !== 'normalsize' ? '{\\' + size + ' ' + colored(tex) + '}' : colored(tex);
    if (hidden(name, 'nor')) {
      const shape = property(name, 'sty', ''), bold = /b/.test(shape) || on(child(word, 'w', 'b')), italic = /i/.test(shape) || on(child(word, 'w', 'i'));
      const inner = bold && italic ? '\\textbf{\\textit{' + value + '}}' : bold ? '\\textbf{' + value + '}' : italic ? '\\textit{' + value + '}' : '\\text{' + value + '}';
      return painted(inner);
    }
    const script = property(name, 'scr', 'roman'), scripts = {roman:'', 'double-struck':'mathbb', script:'mathcal',
      fraktur:'mathfrak', 'sans-serif':'mathsf', monospace:'mathtt'};
    if (!Object.hasOwn(scripts, script)) return fail('DOCX contains an unsupported equation alphabet.', 'docx_math_unsupported');
    const style = property(name, 'sty') || (on(child(word, 'w', 'b')) ? (on(child(word, 'w', 'i')) ? 'bi' : 'b') : 'i');
    if (!['p', 'b', 'i', 'bi'].includes(style)) return fail('DOCX contains unsupported equation run formatting.', 'docx_math_unsupported');
    if (scripts[script]) value = '\\' + scripts[script] + '{' + value + '}';
    const command = style === 'bi' ? 'boldsymbol' : style === 'b' ? 'mathbf' : style === 'p' && !scripts[script] ? 'mathrm' : '';
    return painted(command ? '\\' + command + '{' + value + '}' : value);
  }
  if (name === 'phant') {
    const value = part('e'), show = hidden(name, 'show'), zeroWidth = hidden(name, 'zeroWid');
    if (show) return zeroWidth ? '\\rlap{' + value + '}' : value;
    return (zeroWidth ? '\\vphantom' : hidden(name, 'zeroAsc') && hidden(name, 'zeroDesc') ? '\\hphantom' : '\\phantom') + '{' + value + '}';
  }
  if (name === 'f') return property('f', 'type') === 'noBar'
    ? '\\genfrac{}{}{0pt}{}{' + part('num') + '}{' + part('den') + '}'
    : '\\frac{' + part('num') + '}{' + part('den') + '}';
  if (name === 'rad') {
    const degree = hidden('rad', 'degHide') ? '' : part('deg');
    return '\\sqrt' + (degree ? '[{' + degree + '}]' : '') + '{' + part('e') + '}';
  }
  if (['sSub', 'sSup', 'sSubSup', 'sPre'].includes(name)) {
    const base = '{' + part('e') + '}', sub = name !== 'sSup' ? '_{' + part('sub') + '}' : '',
      sup = name !== 'sSub' ? '^{' + part('sup') + '}' : '';
    return name === 'sPre' ? '{}' + sub + sup + base : base + sub + sup;
  }
  if (name === 'nary') {
    const symbol = property(name, 'chr', '∫');
    if (Array.from(symbol).length !== 1) return fail('DOCX contains an invalid equation operator.', 'docx_math_unsupported');
    const sub = hidden(name, 'subHide') ? '' : part('sub'), sup = hidden(name, 'supHide') ? '' : part('sup');
    const operator = {__proto__:null, '∑':'sum', '∏':'prod', '∐':'coprod', '∫':'int', '∬':'iint', '∭':'iiint',
      '∮':'oint', '⋃':'bigcup', '⋂':'bigcap', '⋁':'bigvee', '⋀':'bigwedge', '⨁':'bigoplus', '⨂':'bigotimes'}[symbol];
    return (operator ? '\\' + operator : '\\mathop{' + text(symbol) + '}') +
      (sub ? '_{' + sub + '}' : '') + (sup ? '^{' + sup + '}' : '') + '{' + part('e') + '}';
  }
  if (name === 'd') {
    const delimiter = value => {
      if (!value) return '.';
      if (/^[()[\]|/.]$/.test(value)) return value;
      const command = {__proto__:null, '{':'\\{', '}':'\\}', '‖':'\\|', '⟨':'\\langle ', '⟩':'\\rangle ',
        '⌊':'\\lfloor ', '⌋':'\\rfloor ', '⌈':'\\lceil ', '⌉':'\\rceil ', '\\':'\\backslash '}[value];
      return command || fail('DOCX contains an unsupported equation delimiter.', 'docx_math_unsupported');
    };
    const items = children(node, 'm', 'e'), only = items.length === 1 ? Array.from(items[0].children).filter(n => !(is(n, 'm') && n.localName.endsWith('Pr'))) : [];
    if (property(name, 'begChr', '(') === '(' && property(name, 'endChr', ')') === ')' && only.length === 1 && is(only[0], 'm', 'f') &&
        attr(child(child(only[0], 'm', 'fPr'), 'm', 'type'), 'm', 'val') === 'noBar')
      return '\\binom{' + contents(child(only[0], 'm', 'num')) + '}{' + contents(child(only[0], 'm', 'den')) + '}';
    return '\\left' + delimiter(property(name, 'begChr', '(')) +
      children(node, 'm', 'e').map(mathTex).join('\\middle' + delimiter(property(name, 'sepChr', '|'))) +
      '\\right' + delimiter(property(name, 'endChr', ')'));
  }
  if (name === 'm') return '\\begin{matrix}' + children(node, 'm', 'mr')
    .map(row => children(row, 'm', 'e').map(mathTex).join(' & ')).join(' \\\\ ') + '\\end{matrix}';
  if (name === 'eqArr') return '\\begin{aligned}' + children(node, 'm', 'e').map(mathTex).join(' \\\\ ') + '\\end{aligned}';
  if (name === 'func') return '\\operatorname{' + part('fName') + '}{' + part('e') + '}';
  if (name === 'limLow' || name === 'limUpp') {
    const base = Array.from(child(node, 'm', 'e')?.children || []).filter(n => !(is(n, 'm') && n.localName.endsWith('Pr')));
    if (base.length === 1 && is(base[0], 'm', 'groupChr') && /^\\(?:over|under)(?:brace|paren|bracket)$/.test(groupCommand(base[0]) || '') &&
        (groupCommand(base[0]).startsWith('\\over') === (name === 'limUpp')))
      return mathTex(base[0]) + (name === 'limLow' ? '_' : '^') + '{' + part('lim') + '}';
    return (name === 'limLow' ? '\\underset' : '\\overset') + '{' + part('lim') + '}{' + part('e') + '}';
  }
  if (name === 'bar') return (property(name, 'pos', 'bot') === 'bot' ? '\\underline' : '\\overline') + '{' + part('e') + '}';
  if (name === 'acc') {
    const symbol = property(name, 'chr', '\u0302');
    if (Array.from(symbol).length !== 1) return fail('DOCX contains an invalid equation accent.', 'docx_math_unsupported');
    const accent = {__proto__:null, '\u0302':'hat', '\u0303':'tilde', '\u0304':'bar', '\u0305':'overline', '\u0306':'breve',
      '\u0307':'dot', '\u0308':'ddot', '\u030c':'check', '\u20d7':'vec', '→':'vec'}[symbol];
    return (accent ? '\\' + accent : '\\overset{' + text(symbol) + '}') + '{' + part('e') + '}';
  }
  if (name === 'groupChr') {
    const symbol = property(name, 'chr', '⏟'), below = property(name, 'pos', 'bot') === 'bot';
    return (groupCommand(node) || (below ? '\\underset' : '\\overset') + '{' + text(symbol) + '}') + '{' + part('e') + '}';
  }
  if (name === 'borderBox') {
    const edges = MATH_BORDER_EDGES.filter(([, key]) => !hidden(name, key)).map(([notation]) => notation),
      strikes = MATH_BORDER_STRIKES.filter(([, key]) => hidden(name, key)).map(([notation]) => notation),
      word = child(child(child(node, 'm', 'borderBoxPr'), 'm', 'ctrlPr'), 'w', 'rPr'), options = [];
    for (const [tag, attribute, option] of [['color', 'val', 'mathcolor'], ['shd', 'fill', 'mathbackground']]) {
      const value = attr(child(word, 'w', tag), 'w', attribute);
      if (/^[\da-f]{6}$/i.test(value || '')) options.push(option + '=#' + value.toUpperCase());
    }
    if (edges.length === 4 && !strikes.length && !options.length) return '\\boxed{' + part('e') + '}';
    const notation = [...(edges.length === 4 ? ['box'] : edges), ...strikes];
    return notation.length ? '\\enclose{' + notation.join(' ') + '}' + (options.length ? '[' + options.join(',') + ']' : '') + '{' + part('e') + '}' : part('e');
  }
  return fail('DOCX contains an unsupported equation structure: ' + name, 'docx_math_unsupported');
}

export async function readDocx(blob, {embedImage, checkCurrent, signal, onProgress, work, name = 'Word.dotx'} = {}) {
  if (!(blob instanceof Blob) || blob.size > ARCHIVE_LIMITS.bytes) return fail('DOCX exceeds the 25 MB import limit.');
  if (typeof DOMParser !== 'function') return fail('DOCX import requires an XML parser.');
  work ||= createImportWork({signal, checkCurrent, onProgress});
  work.check();
  const progress = (fraction, stage) => { work.check(); (onProgress || work.onProgress)?.({fraction, stage}); work.check(); };
  progress(0, 'archive');
  const files = await openArchive(blob, {work});
  try {
  work.check();
  const entries = new Map(files.entries.filter(entry => !entry.directory).map(entry => [entry.name, entry]));
  const warnings = new Set(), xmlCache = new Map(), relationCache = new Map(), converted = new Map(), naturalWidths = new Map(), imageRequests = [], rawBlocks = [];
  const stats = {paragraphs: 0, images: 0, uniqueImages: 0, tables: 0, footnotes: 0, endnotes: 0, comments: 0};
  let xmlBytes = 0, elements = 0, outputBytes = 0;
  const warn = text => warnings.add(text);
  let revisionMode = 'accepted';
  const revisionNodes = new WeakMap(), revisionMarkers = new WeakMap(), revisions = [], reviewMarker = '\uFFFERapierWordRevision\uFFFF';
  const revision = node => {
    let row = revisionNodes.get(node);
    if (!row) {
      const author = attr(node, 'w', 'author') || 'Word', date = attr(node, 'w', 'date') || null;
      if (author.length > 256 || /[\u0000-\u001f]/.test(author) || date && !validCommentDate(date))
        return fail('DOCX contains invalid revision metadata.', 'docx_revision_invalid');
      row = {id: String(revisions.length), author, date};
      revisionNodes.set(node, row); revisions.push(row);
    }
    return row;
  };
  const account = html => {
    if (html.length > ARCHIVE_LIMITS.bytes - outputBytes) return fail('Converted DOCX exceeds the 25 MB document limit.');
    outputBytes += utf8.encode(html).length;
    if (outputBytes > ARCHIVE_LIMITS.bytes) return fail('Converted DOCX exceeds the 25 MB document limit.');
    return html;
  };
  const readXml = async (path, family, rootName) => {
    if (xmlCache.has(path)) {
      const root = xmlCache.get(path);
      if (!is(root, family, rootName)) return fail('DOCX contains invalid XML: ' + path, 'docx_xml_invalid');
      return root;
    }
    const entry = entries.get(path);
    if (!entry) return fail('DOCX is missing a required part: ' + path);
    xmlBytes += entry.size;
    if (entry.size > DOCX_LIMITS.xmlBytes || xmlBytes > DOCX_LIMITS.totalXmlBytes) return fail('DOCX XML exceeds the import limit.');
    let source = await xmlText(await files.read(path), work);
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) return fail('DOCX XML declarations are not supported.', 'docx_xml_declaration');
    await work.checkpoint();
    let document;
    try { document = new DOMParser().parseFromString(source, 'application/xml'); }
    catch (_) { return fail('DOCX contains invalid XML: ' + path, 'docx_xml_invalid'); }
    source = null;
    work.check();
    if (!is(document.documentElement, family, rootName))
      return fail('DOCX contains invalid XML: ' + path, 'docx_xml_invalid');
    const stack = [{nodes: [document.documentElement], at: 0}];
    while (stack.length) {
      const frame = stack.at(-1), node = frame.nodes[frame.at++];
      if (!node) { stack.pop(); continue; }
      if (++elements > DOCX_LIMITS.elements || stack.length > DOCX_LIMITS.depth) return fail('DOCX XML structure exceeds the import limit.');
      if (node.localName === 'parsererror') return fail('DOCX contains invalid XML: ' + path, 'docx_xml_invalid');
      const historical = frame.historical || is(node, 'w') && /^(?:(?:pPr|rPr|sectPr|tblPr|tblGrid|trPr|tcPr)Change|numberingChange)$/.test(node.localName);
      if (historical && !frame.historical) {
        warn('Revision history was removed; current text was retained.');
      }
      if (!historical && is(node, 'w') && /^(?:cellIns|cellDel|cellMerge)$/.test(node.localName))
        return fail('Decide formatting and structural revisions before importing this Word file.', 'docx_revision_structure');
      if (!historical && is(node, 'w') && ['ins','del','moveTo','moveFrom'].includes(node.localName) &&
          (['comments','footnotes','endnotes'].includes(rootName) || is(node.parentNode, 'w') && ['trPr','tcPr'].includes(node.parentNode.localName)))
        return fail('Decide revisions in notes, comments or table structure before importing this Word file.', 'docx_revision_structure');
      const nested = node.children;
      if (nested.length) stack.push({nodes: nested, at: 0, historical});
      if ((elements & 127) === 0) await work.checkpoint();
    }
    xmlCache.set(path, document.documentElement);
    return document.documentElement;
  };
  const relationships = async source => {
    if (relationCache.has(source)) return relationCache.get(source);
    const at = source.lastIndexOf('/'), path = source ? source.slice(0, at + 1) + '_rels/' + source.slice(at + 1) + '.rels' : '_rels/.rels';
    const result = new Map();
    if (entries.has(path)) for (const node of children(await readXml(path, 'rel', 'Relationships'), 'rel', 'Relationship')) {
      if ((result.size & 127) === 0) await work.checkpoint();
      const id = node.getAttribute('Id'), type = node.getAttribute('Type'), target = node.getAttribute('Target'), mode = node.getAttribute('TargetMode');
      if (!id || !type || !target || result.has(id) || mode && mode !== 'Internal' && mode !== 'External') return fail('DOCX relationships are invalid.');
      const kind = NS.r.flatMap(namespace => type.startsWith(namespace + '/') ? [type.slice(namespace.length + 1)] : [])[0] ||
        ({'http://schemas.microsoft.com/office/2011/relationships/commentsExtended': 'commentsExtended',
          'http://schemas.microsoft.com/office/2016/09/relationships/commentsIds': 'commentsIds',
          'http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible': 'commentsExtensible'}[type] || '');
      result.set(id, {kind, type, target, external: mode === 'External', path: mode === 'External' ? null : partPath(source, target)});
    }
    relationCache.set(source, result);
    return result;
  };
  const related = async (source, kind, required = false) => {
    const matches = [...(await relationships(source)).values()].filter(row => row.kind === kind);
    if (matches.length > 1 || required && !matches.length) return fail('DOCX has a missing or ambiguous ' + kind + ' part.');
    if (matches[0]?.external) return fail('DOCX requires an external ' + kind + ' part.');
    return matches[0]?.path || null;
  };
  const mainPath = await related('', 'officeDocument', true);
  const types = await readXml('[Content_Types].xml', 'ct', 'Types'), overrides = new Map(), defaults = new Map();
  for (const node of children(types, 'ct')) {
    if (((overrides.size + defaults.size) & 127) === 0) await work.checkpoint();
    const type = node.getAttribute('ContentType');
    if (node.localName === 'Override') {
      const path = partPath('', node.getAttribute('PartName'));
      if (overrides.has(path)) return fail('DOCX content types are ambiguous.');
      overrides.set(path, type);
    } else if (node.localName === 'Default') {
      const extension = (node.getAttribute('Extension') || '').toLowerCase();
      if (!extension || defaults.has(extension)) return fail('DOCX content types are ambiguous.');
      defaults.set(extension, type);
    }
  }
  const contentType = path => (type => type === 'image/svg' ? 'image/svg+xml' : type)(overrides.get(path) || defaults.get(path.slice(path.lastIndexOf('.') + 1).toLowerCase()) || '');
  if (!['document', 'template'].some(kind => contentType(mainPath) === 'application/vnd.openxmlformats-officedocument.wordprocessingml.' + kind + '.main+xml'))
    return fail('Only ordinary DOCX documents and DOTX templates can be imported.');
  const sourceParts = [...(await relationships('')).values()].filter(row => row.type === DOCX_SOURCE.relationship);
  let canonical = null, base = null, equations = new Map(), recoveryConflict = false;
  const recover = (source, record = {}) => {
    if (recoveryConflict) return;
    if (canonical !== null && source !== canonical || base !== null && source !== base) {
      canonical = base = null; equations.clear(); recoveryConflict = true;
      warn('Conflicting Word recovery metadata was ignored. Current Word content was imported.');
    } else {
      if (canonical === null && base === null) base = source;
      if (Array.isArray(record.equations) && record.equations.length <= DOCX_LIMITS.elements)
        for (const pair of record.equations) if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string' && mathSourceParts(pair[1]) && source.includes(pair[1])) equations.set(pair[0], pair[1]);
    }
  };
  if (sourceParts.length) {
    const sourcePart = sourceParts[0];
    const stored = sourceParts.length === 1 && !sourcePart.external && contentType(sourcePart.path) === DOCX_SOURCE.type ? await readDocxSource(files, sourcePart.path, work) : null;
    if (stored?.exact) canonical = stored.source; else { base = stored?.source ?? null; equations = stored?.equations ?? equations; }
    if (canonical === null) warn('The stored Markdown does not match this Word file. Current Word content was imported.');
  }
  const customPath = await related('', 'custom-properties');
  if (customPath) {
    const priorBytes = xmlBytes, priorElements = elements;
    let properties;
    try { properties = await readXml(customPath, 'custom', 'Properties'); }
    catch (error) {
      if (!['docx_invalid','docx_xml_invalid'].includes(error.code)) throw error;
      work.check(); xmlBytes = priorBytes; elements = priorElements;
      warn('Invalid Word recovery metadata was ignored. Current Word content was imported.');
    }
    const saved = children(properties, 'custom', 'property').filter(node => node.getAttribute('name') === 'RapierMarkdown');
    if (saved.length) {
      let source = null;
      if (saved.length === 1) try { source = await readWordRecovery(child(saved[0], 'vt', 'lpwstr')?.textContent || '', work); }
      catch (_) { work.check(); }
      if (source === null) {
        xmlBytes = priorBytes; elements = priorElements; xmlCache.delete(customPath);
        warn('Invalid Word recovery metadata was ignored. Current Word content was imported.');
      }
      else recover(source, JSON.parse(child(saved[0], 'vt', 'lpwstr').textContent));
    }
  }
  for (const relation of (await relationships(mainPath)).values()) {
    if (relation.kind !== 'customXml' || relation.external || !entries.has(relation.path)) continue;
    try {
      const root = await readXml(relation.path, 'rapier', 'recovery');
      let source;
      try { source = await readWordRecovery(root.textContent, work); }
      catch (_) { work.check(); source = null; }
      if (source === null) throw Object.assign(new Error('Invalid recovery'), {code: 'docx_invalid'});
      recover(source, JSON.parse(root.textContent));
    } catch (error) {
      work.check();
      if (!['docx_invalid', 'docx_xml_invalid'].includes(error.code)) throw error;
      xmlCache.delete(relation.path);
    }
  }
  progress(.2, 'native');
  const main = await readXml(mainPath, 'w', 'document'), body = child(main, 'w', 'body');
  if (!body) return fail('DOCX has no document body.');
  if (canonical !== null && Array.from(descendants(body, 'w')).some(node => ['ins','del','moveFrom','moveTo'].includes(node.localName)) &&
      !wordReview(canonical).changes.length) { base = canonical; canonical = null; }
  const project = canonical === null;
  const stylesPath = await related(mainPath, 'styles'), numberingPath = await related(mainPath, 'numbering');
  const settingsPath = await related(mainPath, 'settings');
  const nativeSettings = settingsPath ? await readXml(settingsPath, 'w', 'settings') : null;
  const autoHyphens = on(child(nativeSettings, 'w', 'autoHyphenation')) === true;
  const stylesRoot = stylesPath ? await readXml(stylesPath, 'w', 'styles') : null;
  const styles = new Map(), styleCache = new Map();
  let defaultStyle = null;
  for (const node of children(stylesRoot, 'w', 'style')) {
    if ((styles.size & 127) === 0) await work.checkpoint();
    const id = attr(node, 'w', 'styleId');
    if (!id || styles.has(id) || styles.size >= DOCX_LIMITS.styles) return fail('DOCX style definitions exceed the import limit or are ambiguous.');
    styles.set(id, node);
    if (attr(node, 'w', 'type') === 'paragraph' && ['1','true','on'].includes(attr(node, 'w', 'default'))) defaultStyle = id;
  }
  const fontsPath = await related(mainPath, 'fontTable'), fontAssets = [], seenFonts = new Set(), builtinFontFamilies = new Set(), fontKinds = new Map();
  if (fontsPath) {
    const fontRelations = await relationships(fontsPath);
    for (const font of children(await readXml(fontsPath, 'w', 'fonts'), 'w', 'font')) {
      await work.checkpoint();
      const family = attr(font, 'w', 'name'), familyParts = [];
      let builtin = true;
      for (const kind of ['embedRegular', 'embedBold', 'embedItalic', 'embedBoldItalic']) {
        const embedded = child(font, 'w', kind);
        if (!embedded) continue;
        await work.checkpoint();
        const part = fontRelations.get(attr(embedded, 'r', 'id'));
        if (!part || part.kind !== 'font' || part.external || !entries.has(part.path))
          return fail('DOCX is missing an embedded font: ' + family, 'docx_font_invalid');
        const key = family + '\u0000' + part.path;
        if (seenFonts.has(key)) continue;
        seenFonts.add(key);
        const bytes = await files.read(part.path), fontKey = attr(embedded, 'w', 'fontKey'), type = contentType(part.path);
        const bundled = DOCX_FONTS.find(face => face.family === family && 'embed' + face.style === kind);
        const sameBuiltin = !!bundled && type === DOCX_FONT_TYPE && /^\{?[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\}?$/i.test(fontKey || '') &&
          await sha256(obfuscateDocxFont(bytes, fontKey)) === bundled.sha256;
        builtin &&= sameBuiltin;
        familyParts.push({name: part.path, family, bytes, key: fontKey, type, subsetted: ['1', 'true', 'on'].includes(attr(embedded, 'w', 'subsetted'))});
      }
      const kind = val(child(font, 'w', 'family'));
      if (!familyParts.length || !builtin) fontKinds.set(family, val(child(font, 'w', 'pitch')) === 'fixed' || kind === 'modern' ? 'mono' : kind === 'roman' ? 'serif' : kind === 'script' ? 'hand' : null);
      if (familyParts.length && builtin) builtinFontFamilies.add(family);
      else for (const part of familyParts) {
        try {
          const asset = await readDocxFontPart(part, {asset: project, checkCurrent: work.check});
          if (asset) fontAssets.push(asset);
        } catch (error) {
          work.check();
          if (!part.subsetted || error.code !== 'docx_font_invalid') throw error;
          warn(FONT_KINDS);
        }
        await work.checkpoint();
      }
    }
  }
  const themePath = await related(mainPath, 'theme'), theme = new Map();
  if (themePath) {
    const themeRoot = await readXml(themePath, 'a', 'theme'), scheme = child(child(themeRoot, 'a', 'themeElements'), 'a', 'clrScheme');
    for (const entry of children(scheme, 'a')) {
      const rgb = child(entry, 'a', 'srgbClr')?.getAttribute('val') || child(entry, 'a', 'sysClr')?.getAttribute('lastClr');
      if (rgb && /^[0-9a-f]{6}$/i.test(rgb)) theme.set(entry.localName, rgb);
    }
    for (const [name, key] of [['dark1','dk1'], ['dark2','dk2'], ['light1','lt1'], ['light2','lt2'], ['text1','dk1'], ['text2','dk2'], ['background1','lt1'], ['background2','lt2'], ['hyperlink','hlink'], ['followedHyperlink','folHlink']])
      if (theme.has(key)) theme.set(name, theme.get(key));
    const fontScheme = child(child(themeRoot, 'a', 'themeElements'), 'a', 'fontScheme');
    for (const level of ['major', 'minor']) for (const [script, names] of [['latin', ['Ascii', 'HAnsi']], ['ea', ['EastAsia']], ['cs', ['Bidi']]]) {
      const typeface = child(child(fontScheme, 'a', level + 'Font'), 'a', script)?.getAttribute('typeface');
      if (typeface) for (const name of names) theme.set(level + name, typeface);
    }
  }
  const propertiesOf = (node, inlineSize = true) => runProperties(node, theme, inlineSize);
  const docDefaults = child(stylesRoot, 'w', 'docDefaults');
  const defaultParagraph = paragraphProperties(child(child(docDefaults, 'w', 'pPrDefault'), 'w', 'pPr'));
  const defaultRun = propertiesOf(child(child(docDefaults, 'w', 'rPrDefault'), 'w', 'rPr'), false);
  const defaultHalfPoints = integer(val(child(child(styles.get('Normal'), 'w', 'rPr'), 'w', 'sz')) ??
    val(child(child(child(docDefaults, 'w', 'rPrDefault'), 'w', 'rPr'), 'w', 'sz')), 26, 1, 3276);
  const defaultLineSpacing = child(child(child(docDefaults, 'w', 'pPrDefault'), 'w', 'pPr'), 'w', 'spacing');
  const defaultLineTwips = integer(attr(defaultLineSpacing, 'w', 'line'), null, 1, 31680);
  const pictureMeasure = {em: defaultHalfPoints / 2 * 12700, body: defaultHalfPoints / 2,
    line: !defaultLineTwips ? defaultHalfPoints / 2 * 1.2 : ['auto', null].includes(attr(defaultLineSpacing, 'w', 'lineRule')) ?
      defaultHalfPoints / 2 * 1.2 * defaultLineTwips / 240 : defaultLineTwips / 20};
  const runSetting = (properties, name) => {
    let found = child(properties, 'w', name);
    for (let id = val(child(properties, 'w', 'rStyle')), depth = 0; !found && id && depth < 32; depth++) {
      const node = styles.get(id); found = child(child(node, 'w', 'rPr'), 'w', name); id = val(child(node, 'w', 'basedOn'));
    }
    return found;
  };
  const importedSettings = readDocumentSettings(base ?? ''), indentPoints = referenceType(importedSettings).body;
  const itemSpace = nativeDocumentSpacing(importedSettings, 'item');
  const listSpace = child(child([...styles].find(([id]) => id.toLowerCase() === 'listparagraph')?.[1], 'w', 'pPr'), 'w', 'spacing');
  const looseGap = Math.max(240, ...['before', 'after'].map(side => Math.max(itemSpace[side] || 0, integer(attr(listSpace, 'w', side), 0, 0)) + 240));
  const style = (id, chain = []) => {
    if (!id) return {p: {}, r: {}};
    if (styleCache.has(id)) return styleCache.get(id);
    if (chain.includes(id) || chain.length >= 32) return fail('DOCX contains a circular or excessive style hierarchy.');
    const node = styles.get(id);
    if (!node) { warn('Some referenced styles were missing; their text was retained.'); return {p: {}, r: {}}; }
    const parent = val(child(node, 'w', 'basedOn')), parentNode = styles.get(parent);
    const base = parentNode && attr(parentNode, 'w', 'type') === attr(node, 'w', 'type') ? style(parent, [...chain, id]) : {p: {}, r: {}};
    const own = propertiesOf(child(node, 'w', 'rPr'), attr(node, 'w', 'type') === 'character');
    const structuralStyle = id.toLowerCase() === STRUCTURAL_EMPHASIS.toLowerCase() && attr(node, 'w', 'type') === 'paragraph' &&
      val(child(node, 'w', 'name')) === STRUCTURAL_EMPHASIS_NAME && parent === 'Normal' ||
      id.toLowerCase() === 'rapiertableheader' && attr(node, 'w', 'type') === 'character' && val(child(node, 'w', 'name')) === 'Rapier table header' && !parent;
    const structuralBold = structuralStyle && own.bold === true && Object.keys(own).length === 1 && !child(node, 'w', 'pPr')?.children.length;
    const result = {p: mergeParagraphProperties(base.p, paragraphProperties(child(node, 'w', 'pPr'))), r: mergeRunStyle(base.r, own),
      structuralBold: structuralBold || base.structuralBold && !Object.hasOwn(own, 'bold')};
    styleCache.set(id, result);
    return result;
  };
  const abstracts = new Map(), numbers = new Map(), counts = new Map(), restarted = new Set(), levelCache = new Map();
  if (numberingPath) {
    const root = await readXml(numberingPath, 'w', 'numbering');
    for (const node of children(root, 'w', 'abstractNum')) {
      if ((abstracts.size & 127) === 0) await work.checkpoint();
      const id = integer(attr(node, 'w', 'abstractNumId'));
      if (id === null || abstracts.has(id)) return fail('DOCX numbering definitions are ambiguous.');
      const levels = new Map();
      for (const level of children(node, 'w', 'lvl')) {
        const index = integer(attr(level, 'w', 'ilvl'), null, 0, 8);
        if (index === null || levels.has(index)) return fail('DOCX numbering levels are invalid.');
        levels.set(index, level);
      }
      abstracts.set(id, {levels, link: val(child(node, 'w', 'numStyleLink'))});
    }
    for (const node of children(root, 'w', 'num')) {
      if ((numbers.size & 127) === 0) await work.checkpoint();
      const id = integer(attr(node, 'w', 'numId'));
      if (id === null || numbers.has(id)) return fail('DOCX numbering instances are ambiguous.');
      numbers.set(id, node);
    }
  }
  const numberingLevels = (id, chain = []) => {
    if (levelCache.has(id)) return levelCache.get(id);
    const definition = abstracts.get(id);
    if (!definition) return fail('DOCX references a missing numbering definition.');
    if (!definition.link) return definition.levels;
    if (chain.includes(id) || chain.length >= 32) return fail('DOCX contains a circular or excessive numbering style reference.');
    if (!styles.has(definition.link)) return fail('DOCX references a missing numbering style.');
    const instance = numbers.get(style(definition.link).p.numId);
    if (!instance) return fail('DOCX numbering style references a missing instance.');
    const levels = numberingLevels(integer(val(child(instance, 'w', 'abstractNumId'))), [...chain, id]);
    levelCache.set(id, levels);
    return levels;
  };
  const numbering = (properties, styleId) => {
    if (!properties.numId) return null;
    const instance = numbers.get(properties.numId);
    if (!instance) return fail('DOCX references a missing numbering definition.');
    const abstractId = integer(val(child(instance, 'w', 'abstractNumId'))), levels = numberingLevels(abstractId);
    let index = properties.level ?? 0;
    if (properties.level == null) for (const [level, node] of levels) if (val(child(node, 'w', 'pStyle')) === styleId) index = level;
    const override = children(instance, 'w', 'lvlOverride').find(node => integer(attr(node, 'w', 'ilvl'), null, 0, 8) === index);
    const level = child(override, 'w', 'lvl') || levels.get(index);
    if (!level) return fail('DOCX references a missing numbering level.');
    const format = val(child(level, 'w', 'numFmt')) || 'decimal';
    if (format === 'none') return null;
    if (!['decimal','bullet'].includes(format)) warn('Custom list markers became ordinary numbered or bulleted lists.');
    const template = val(child(level, 'w', 'lvlText')) || '';
    if (format !== 'bullet' && template && template !== '%' + (index + 1) + '.' && template !== '%' + (index + 1) + ')')
      warn('Custom list markers became ordinary numbered or bulleted lists.');
    const start = integer(val(child(override, 'w', 'startOverride')), integer(val(child(level, 'w', 'start')), 1, 0, 999999999), 0, 999999999);
    const key = abstractId + ':' + index, first = child(override, 'w', 'startOverride') && !restarted.has(properties.numId + ':' + index);
    if (first) restarted.add(properties.numId + ':' + index);
    const ordinal = first ? start : counts.get(key) ?? start;
    if (ordinal > 999999999) return fail('DOCX list numbering exceeds Markdown\u2019s nine-digit limit.');
    counts.set(key, ordinal + 1);
    for (const [deeper, candidate] of levels) if (deeper > index) {
      const restart = integer(val(child(candidate, 'w', 'lvlRestart')), null, 0, 9);
      if (restart !== 0 && (restart === null || index < restart)) {
        counts.delete(abstractId + ':' + deeper);
        for (const [numId, number] of numbers) if (integer(val(child(number, 'w', 'abstractNumId'))) === abstractId) restarted.delete(numId + ':' + deeper);
      }
    }
    return {id: properties.numId, level: index, tag: format === 'bullet' ? 'ul' : 'ol', ordinal, unmarked: format === 'bullet' && !template,
      delimiter: template.endsWith(')') ? ')' : '.', p: paragraphProperties(child(level, 'w', 'pPr'))};
  };
  const alignment = properties => {
    const value = properties.align;
    if (!value) return null;
    if (['left','right','center'].includes(value)) return value;
    if (value === 'start') return properties.bidi ? 'right' : 'left';
    if (value === 'end') return properties.bidi ? 'left' : 'right';
    if (value === 'both') return 'justify';
    warn('Distributed paragraph alignment became justified text.');
    return 'justify';
  };
  const layoutAttribute = layout => {
    const marker = formatLayout(layout);
    return marker ? ' data-md-layout="' + escape(encodeURIComponent(marker)) + '"' : '';
  };
  const measuredLevel = levels => {
    const value = Number(levels.toFixed(6));
    if (value && !indentLevel(value)) return fail('DOCX paragraph indentation exceeds the Markdown limit. Open the original in Word to keep its measurements.', 'docx_indent_limit');
    return value;
  };
  const quoteDepthOf = id => {
    const node = styles.get(id), name = val(child(node, 'w', 'name')), deeper = /^Quote([2-9]|[1-9]\d)$/i.exec(id || '');
    if (/^quote$/i.test(id || '') || /^(?:intense quote|block text)$/i.test(name || '')) return 1;
    return deeper && name?.toLowerCase() === 'quote ' + deeper[1] && /^quote$/i.test(val(child(node, 'w', 'basedOn')) || '') ? Number(deeper[1]) : 0;
  };
  const quoteRule = properties => {
    const borders = child(properties, 'w', 'pBdr');
    const edge = child(borders, 'w', on(child(properties, 'w', 'bidi')) ? 'right' : 'left');
    return val(edge) === 'single' && attr(edge, 'w', 'sz') === '12' && attr(edge, 'w', 'space') === '8';
  };
  const paragraphLayout = (properties, heading, list, base) => {
    const layout = {}, align = alignment(properties);
    if (align) layout.align = align;
    const step = indentPoints * 40;
    const left = properties.leftIndent ?? base;
    const indent = measuredLevel((left - base) / step);
    if (indent) layout.indent = indent;
    if (list && !heading) {
      const hanging = list.tag === 'ol' ? 660 : 240;
      const numberTab = [...(properties.tabs || [])].filter(([, kind]) => kind === 'num' || kind === 'left').sort(([a], [b]) => a - b)[0]?.[0];
      const first = measuredLevel(((numberTab ?? left) - left) / step);
      const marker = measuredLevel((left + (properties.firstIndent ?? -hanging) - (base - hanging)) / step);
      if (first) layout.first = first;
      if (marker) layout.marker = marker;
    } else if (!heading && properties.firstIndent) layout.first = measuredLevel(properties.firstIndent / step);
    if (!heading) {
      if (properties.dropLines) layout.lines = properties.dropLines;
      if (autoHyphens && properties.suppressHyphens !== true) layout.hyphens = 'auto';
      if (properties.hangingPunctuation) layout.hanging = 'on';
    }
    return layout;
  };
  const chooseAlternate = node => {
    for (const choice of children(node, 'mc', 'Choice')) {
      const required = (choice.getAttribute('Requires') || '').trim().split(/\s+/);
      if (required.length && required.every(prefix => ['w','a','wp','pic'].some(family => NS[family].includes(choice.lookupNamespaceURI(prefix))))) return choice;
    }
    return child(node, 'mc', 'Fallback') || fail('DOCX contains unsupported alternate content.');
  };
  const detailsControl = node => is(node, 'w', 'sdt') && val(child(child(node, 'w', 'sdtPr'), 'w', 'tag')) === 'rapier:details';
  const quoteControl = node => is(node, 'w', 'sdt') && val(child(child(node, 'w', 'sdtPr'), 'w', 'tag')) === 'rapier:quote';
  const sequence = async container => {
    const blocks = [], stack = [{nodes: container?.children || [], at: 0}];
    let visited = 0;
    while (stack.length) {
      const frame = stack.at(-1), node = frame.nodes[frame.at++];
      if (!node) { stack.pop(); continue; }
      if ((visited++ & 127) === 0) await work.checkpoint();
      if (is(node, 'w', 'p') || is(node, 'w', 'tbl') || quoteControl(node) || detailsControl(node)) blocks.push(node);
      else if (is(node, 'w', 'sdt')) stack.push({nodes: child(node, 'w', 'sdtContent')?.children || [], at: 0});
      else if (is(node, 'mc', 'AlternateContent')) stack.push({nodes: chooseAlternate(node).children, at: 0});
      else if (is(node, 'w', 'customXml')) {
        stack.push({nodes: node.children, at: 0});
      } else if (is(node, 'w') && ['ins','del','moveTo','moveFrom'].includes(node.localName))
        return fail('Decide structural revisions before importing this Word file.', 'docx_revision_structure');
      else if (is(node, 'w') && ['commentRangeStart','commentRangeEnd'].includes(node.localName)) blocks.push(node);
      else if (is(node, 'w') && ['sectPr','tcPr','tblPr','tblGrid','trPr',...MARKERS].includes(node.localName)) continue;
      else return fail('DOCX contains an unsupported document block: ' + node.localName);
    }
    return blocks;
  };
  const sectionWidth = section => {
    const size = child(section, 'w', 'pgSz'), margins = child(section, 'w', 'pgMar');
    const width = integer(attr(size, 'w', 'w'), 12240, 1, 31680);
    const left = integer(attr(margins, 'w', 'left'), 1440, 0, 31680), right = integer(attr(margins, 'w', 'right'), 1440, 0, 31680);
    const gutter = integer(attr(margins, 'w', 'gutter'), 0, 0, 31680);
    if (width <= left + right + gutter) return fail('DOCX section has no usable text width.');
    if (children(section, 'w', 'headerReference').length || children(section, 'w', 'footerReference').length)
      warn('Headers and footers were not imported.');
    if (integer(attr(child(section, 'w', 'cols'), 'w', 'num'), 1, 1, 64) > 1) warn('Multiple columns became one continuous text flow.');
    const contentWidth = (width - left - right - gutter) * 635;
    return {width: contentWidth, sectionWidth: contentWidth, assumed: !size || !margins};
  };
  const picture = async (node, context) => {
    const boxes = [...descendants(node, 'w', 'txbxContent')].filter(box => {
      for (let parent = box.parentNode; parent && parent !== node; parent = parent.parentNode)
        if (is(parent, 'w', 'txbxContent')) return false;
      return true;
    });
    if (boxes.length) {
      warn('Text boxes became normal-flow content in source order.');
      const parts = [];
      for (const box of boxes) parts.push(await renderBlocks(await sequence(box), context));
      return {html: parts.join(''), block: true, semantic: true};
    }
    let id, alt = null, title = null, extent = null, extentHeight = null, align = null, opacity = 100, wrap = null, x = null, y = null, lines = null;
    const transform = {crop: {left:0, top:0, right:0, bottom:0}, rotation:0, flipH:false, flipV:false};
    if (is(node, 'w', 'drawing')) {
      const drawing = child(node, 'wp', 'inline') || child(node, 'wp', 'anchor');
      const graphic = child(drawing, 'a', 'graphic'), data = child(graphic, 'a', 'graphicData'), image = child(data, 'pic', 'pic');
      if (!drawing || !image) return fail('DOCX contains a drawing that is not an embedded raster picture.');
      const fill = child(image, 'pic', 'blipFill'), blip = child(fill, 'a', 'blip'), crop = child(fill, 'a', 'srcRect');
      const shape = child(image, 'pic', 'spPr'), drawingTransform = child(shape, 'a', 'xfrm');
      for (const [source, target] of [['l','left'], ['t','top'], ['r','right'], ['b','bottom']]) transform.crop[target] = cropFraction(crop?.getAttribute(source));
      transform.rotation = ((integer(drawingTransform?.getAttribute('rot'), 0, -2147483647) / 60000) % 360 + 360) % 360;
      for (const name of ['flipH','flipV']) transform[name] = ['1','true','on'].includes(drawingTransform?.getAttribute(name));
      const fix = child(blip, 'a', 'alphaModFix');
      if (children(blip, 'a').some(effect => effect.localName !== 'extLst' && effect !== fix))
        return fail('DOCX picture color or transparency effects are not supported.');
      if (fix) opacity = alphaOpacity(fix.getAttribute('amt'));
      if (child(fill, 'a', 'tile')) return fail('DOCX tiled picture fills are not supported.');
      const fillRect = child(child(fill, 'a', 'stretch'), 'a', 'fillRect');
      if (fillRect && ['l','t','r','b'].some(key => cropFraction(fillRect.getAttribute(key)) !== 0)) return fail('DOCX inset picture fills are not supported.');
      const geometry = child(shape, 'a', 'prstGeom');
      if (child(shape, 'a', 'custGeom') || geometry && geometry.getAttribute('prst') !== 'rect') return fail('DOCX shaped picture masks are not supported.');
      if (child(shape, 'a', 'effectDag')) return fail('DOCX picture effect diagrams are not supported.');
      const line = child(shape, 'a', 'ln');
      if (child(shape, 'a', 'effectLst')?.children.length || line && !child(line, 'a', 'noFill')) warn('Picture borders and shadows were not imported.');
      const extensions = children(child(blip, 'a', 'extLst'), 'a', 'ext');
      const vectors = extensions.flatMap(extension => children(extension, 'svg', 'svgBlip'));
      if (vectors.length > 1 || vectors.some(vector => attr(vector, 'r', 'link'))) return fail('DOCX contains ambiguous or linked SVG artwork.');
      const plain = !Object.values(transform.crop).some(Boolean) && !transform.flipH && !transform.flipV;
      const originals = extensions.flatMap(extension => children(extension, 'rapier', 'original')), original = originals.length === 1 && attr(originals[0], 'r', 'embed');
      const kept = original && (await relationships(context.path)).get(original);
      id = plain && attr(vectors[0], 'r', 'embed') || plain && kept?.kind === 'image' && !kept.external && entries.has(kept.path) && original || attr(blip, 'r', 'embed');
      if (!id && attr(blip, 'r', 'link')) { warn('Linked pictures were not imported; their files are not inside the document.'); return {html: ''}; }
      if (!id || attr(blip, 'r', 'link')) return fail('DOCX contains a linked picture without self-contained image bytes.');
      const properties = child(drawing, 'wp', 'docPr'), nonVisual = child(child(image, 'pic', 'nvPicPr'), 'pic', 'cNvPr');
      alt = properties?.getAttribute('descr') ?? nonVisual?.getAttribute('descr') ?? properties?.getAttribute('title') ?? nonVisual?.getAttribute('title') ?? null;
      title = properties?.getAttribute('title') ?? nonVisual?.getAttribute('title') ?? null;
      const equation = mathSourceParts(alt || ''), display = equation?.display;
      if (plain && vectors.length === 1 && equation) {
        const relation = (await relationships(context.path)).get(attr(vectors[0], 'r', 'embed'));
        if (relation?.kind === 'image' && !relation.external && entries.has(relation.path) && contentType(relation.path) === 'image/svg+xml' &&
            new RegExp('^<svg\\b[^>]*\\sdata-rapier-math="' + (display ? 'display' : 'inline') + '"').test(new TextDecoder().decode((await files.read(relation.path)).subarray(0, 4096))))
          return {html: project ? account('<span class="math-rendered" data-math-src="' + escape(encodeURIComponent(alt)) + '">' + escape(alt) + '</span>') : 'x', semantic: true, displayMath: display};
      }
      extent = integer(child(drawing, 'wp', 'extent')?.getAttribute('cx'), null, 1, 27273042316900);
      extentHeight = integer(child(drawing, 'wp', 'extent')?.getAttribute('cy'), null, 1, 27273042316900);
      if (is(drawing, 'wp', 'anchor')) {
        const position = child(drawing, 'wp', 'positionH'), value = child(position, 'wp', 'align')?.textContent;
        if (['left','center','right'].includes(value)) align = value;
        const vertical = child(drawing, 'wp', 'positionV'), square = child(drawing, 'wp', 'wrapSquare');
        if (square) wrap = 'box';
        else if (['wrapTight', 'wrapThrough'].some(name => child(drawing, 'wp', name))) wrap = 'around';
        else if (child(drawing, 'wp', 'wrapNone')) wrap = ['1', 'true', 'on'].includes(drawing.getAttribute('behindDoc')) ? 'behind' : 'front';
        else warn('Floating pictures became normal-flow images in source order.');
        const left = integer(child(position, 'wp', 'posOffset')?.textContent?.trim(), null, -27273042316900, 27273042316900);
        if (wrap && left > 0 && position?.getAttribute('relativeFrom') === 'column' && extent && left + extent <= context.width)
          x = Math.round((left + extent / 2) / context.width * 10000) / 100;
        const top = integer(child(vertical, 'wp', 'posOffset')?.textContent?.trim(), null, -27273042316900, 27273042316900);
        if (wrap && top && vertical?.getAttribute('relativeFrom') === 'paragraph' && !child(vertical, 'wp', 'align'))
          y = Math.max(-50, Math.round(top / pictureMeasure.em * 100) / 100) || null;
        if (square && square.getAttribute('wrapText') === 'right' && position?.getAttribute('relativeFrom') === 'character' &&
            vertical?.getAttribute('relativeFrom') === 'line' && extentHeight && !context.tableCell) {
          const count = Math.round((extentHeight / 12700 - pictureMeasure.body * .7) / pictureMeasure.line) + 1;
          if (count >= 1 && count <= 12) { lines = count; wrap = 'around'; x = null; y = null; }
        }
      }
    } else {
      const shape = child(node, 'v', 'shape') || child(node, 'v', 'rect'), image = child(shape, 'v', 'imagedata');
      if (!image && ['t','true'].includes(attr(shape, 'o', 'hr'))) return {rule: true, semantic: true};
      if (!image) return fail('DOCX contains an unsupported legacy drawing.');
      for (const key of ['left','top','right','bottom']) transform.crop[key] = cropFraction(image.getAttribute('crop' + key), true);
      const styleText = shape.getAttribute('style') || '';
      const rotation = /(?:^|;)\s*rotation\s*:\s*(-?\d+(?:\.\d+)?)\s*(?:;|$)/i.exec(styleText);
      if (!rotation && /(?:^|;)\s*rotation\s*:/i.test(styleText)) return fail('DOCX contains an unsupported legacy picture rotation.');
      if (rotation) transform.rotation = ((Number(rotation[1]) % 360) + 360) % 360;
      const flip = /(?:^|;)\s*flip\s*:\s*(x|y|xy|yx)\s*(?:;|$)/i.exec(styleText);
      if (!flip && /(?:^|;)\s*flip\s*:/i.test(styleText)) return fail('DOCX contains an unsupported legacy picture flip.');
      if (flip) { transform.flipH = flip[1].toLowerCase().includes('x'); transform.flipV = flip[1].toLowerCase().includes('y'); }
      if (['gain','blacklevel','gamma','chromakey','bilevel','grayscale'].some(key => image.hasAttribute(key))) return fail('DOCX legacy picture color effects are not supported.');
      const width = /(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)(pt|in|cm|mm|px)\s*(?:;|$)/i.exec(styleText);
      if (width) extent = Number(width[1]) * ({pt:12700, in:914400, cm:360000, mm:36000, px:9525}[width[2].toLowerCase()]);
      const height = /(?:^|;)\s*height\s*:\s*(\d+(?:\.\d+)?)(pt|in|cm|mm|px)\s*(?:;|$)/i.exec(styleText);
      if (height) extentHeight = Number(height[1]) * ({pt:12700, in:914400, cm:360000, mm:36000, px:9525}[height[2].toLowerCase()]);
      id = attr(image, 'r', 'id'); alt = attr(image, 'o', 'title');
      warn('Legacy picture positioning became normal document flow.');
    }
    if (Object.values(transform.crop).some(value => value < 0)) {
      warn('Padding around pictures was not kept.');
      for (const side in transform.crop) transform.crop[side] = Math.max(0, transform.crop[side]);
    }
    if (transform.crop.left + transform.crop.right >= 1 || transform.crop.top + transform.crop.bottom >= 1 || !Number.isFinite(transform.rotation))
      return fail('DOCX picture crop leaves no usable image.');
    const rotate = transform.rotation ? foldRotationDegrees(transform.rotation) : 0;
    transform.rotation = 0;
    if (extent !== null && (!Number.isFinite(extent) || extent <= 0 || extent > 27273042316900) ||
        extentHeight !== null && (!Number.isFinite(extentHeight) || extentHeight <= 0 || extentHeight > 27273042316900)) return fail('DOCX picture dimensions are invalid.');
    if (++stats.images > DOCX_LIMITS.images) return fail('DOCX contains too many pictures.');
    const relation = (await relationships(context.path)).get(id);
    if (!relation || relation.kind !== 'image' || relation.external || !entries.has(relation.path))
      return fail('DOCX is missing the embedded bytes for a picture.');
    if (project && typeof embedImage !== 'function') return fail('DOCX image conversion is unavailable.');
    const path = relation.path, name = path.slice(path.lastIndexOf('/') + 1);
    if (/^image\/(?:x-)?(?:emf|wmf|bmp|tiff)$/.test(contentType(path)) || contentType(path) === 'image/gif' && (Object.values(transform.crop).some(Boolean) || transform.flipH || transform.flipV)) {
      warn('Pictures in formats Rapier cannot keep (such as EMF, WMF or a cropped GIF) were not imported.');
      return {html: ''};
    }
    if (!entries.get(path).size) return fail('DOCX contains an empty picture.');
    alt ??= name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    let width = extent ? Math.max(0.01, Math.min(100, Math.round(extent / context.width * 10000) / 100)) : null;
    if (width !== null && !Object.values(transform.crop).some(Boolean)) {
      if (!naturalWidths.has(path)) {
        let natural = 0;
        try { const bytes = await files.read(path), info = contentType(path) === 'image/svg+xml' ? inspectSVG(bytes) : inspectRaster(bytes); natural = info.orientation >= 5 ? info.height : info.width; }
        catch (_) { natural = 0; }
        naturalWidths.set(path, natural);
      }
      const natural = naturalWidths.get(path);
      if (natural > 0 && Math.abs(extent - Math.min(context.width, natural * 9525)) <= 1) width = null;
    }
    if (extent > context.width) warn('Oversized pictures were fitted to the text width.');
    if (context.assumed && extent) warn('Missing page dimensions used a standard text width for picture sizing.');
    const key = path + '\n' + JSON.stringify(transform) + '\n' + (extent && extentHeight ? Math.round(extent / extentHeight * 1000000) : '');
    if (!converted.has(key)) {
      const reference = 'docx-pending-' + imageRequests.length;
      imageRequests.push({reference, image: {name, path, alt, width, type: contentType(path), transform,
        displayWidth: extent, displayHeight: extentHeight}});
      converted.set(key, reference); stats.uniqueImages++;
    }
    return {image: project ? account('<img data-rapier-asset="' + converted.get(key) + '" alt="' + attributeText(alt) + '"' + (title === null ? '' : ' title="' + attributeText(title) + '"') + '>') : '<img>', width: lines ? null : width, align, rotate, opacity, wrap, x, y, lines};
  };
  const noteParts = new Map(), notes = new Map();
  const notePart = async (kind, required = true) => {
    if (!noteParts.has(kind)) {
      const path = await related(mainPath, kind + 's', required);
      if (!path) return null;
      const root = await readXml(path, 'w', kind + 's'), records = new Map();
      for (const record of children(root, 'w', kind)) {
        if ((records.size & 127) === 0) await work.checkpoint();
        const type = attr(record, 'w', 'type');
        if (type && type !== 'normal') continue;
        const key = integer(attr(record, 'w', 'id'));
        if (key === null || records.has(key)) return fail('DOCX notes have missing or duplicate identifiers.');
        records.set(key, record);
      }
      noteParts.set(kind, {path, records});
    }
    return noteParts.get(kind);
  };
  const registerNote = async (kind, id, context) => {
    const part = await notePart(kind), content = part.records.get(id), label = 'docx-' + ({footnote:'fn-', endnote:'en-', comment:'comment-'}[kind]) + id;
    if (!content) return fail('DOCX is missing the text of a referenced note.');
    if (!notes.has(label)) {
      const ordinal = notes.size + 1;
      const review = kind === 'comment' ? commentInfo.get(id) : null;
      const author = kind === 'comment' ? attr(content, 'w', 'author') || '' : '', date = review?.date || '';
      const metadata = !project ? '' : (author || date ? '<p>' + importedText(author) + (author && date ? '<br>' : '') + importedText(date) + '</p>' : '') +
        (review?.resolved ? '<p>Resolved</p>' : '') + (review?.parent != null ? '<p>Reply to Word comment ' + review.parent + '</p>' : '');
      notes.set(label, {label, ordinal, content, metadata, context: {...context, path: part.path, p: {}, note: true, tableCell: false, width: context.sectionWidth || context.width}});
      if (kind !== 'comment') stats[kind + 's']++;
    }
    return project ? '<sup class="footnote-ref"><a href="#fn-' + label + '" data-footnote-label="' + label + '">' + notes.get(label).ordinal + '</a></sup>' : 'x';
  };
  const noteReference = async (node, context) => {
    if (context.note) return fail('DOCX contains a note reference inside another note.');
    const kind = node.localName === 'footnoteReference' ? 'footnote' : node.localName === 'endnoteReference' ? 'endnote' : 'comment';
    const id = integer(attr(node, 'w', 'id'));
    if (id === null) return fail('DOCX contains an invalid note reference.');
    if (['1','true','on'].includes(attr(node, 'w', 'customMarkFollows'))) warn('Custom note marks became automatic Markdown note numbers.');
    return registerNote(kind, id, context);
  };
  const commentPart = await notePart('comment', false);
  const commentInfo = new Map(), commentByParagraph = new Map(), activeComments = new Set(), commentGroups = [];

  for (const [id, node] of commentPart?.records || []) {
    let paragraph;
    for (const item of descendants(node)) { if (is(item, 'w', 'p')) paragraph = item; await work.checkpoint(); }
    const paraId = attr(paragraph, 'w14', 'paraId');
    if (paraId && (!/^[\da-f]{8}$/i.test(paraId) || commentByParagraph.has(paraId.toUpperCase())))
      return fail('DOCX comments have ambiguous paragraph identifiers.', 'docx_comments_invalid');
    if (paraId) commentByParagraph.set(paraId.toUpperCase(), id);
    commentInfo.set(id, {id, node, parent: null, resolved: false, date: attr(node, 'w', 'date'), starts: [], ends: []});
  }
  stats.comments = commentInfo.size;
  const extendedPath = await related(mainPath, 'commentsExtended');
  if (extendedPath) {
    const seen = new Set();
    for (const node of children(await readXml(extendedPath, 'w15', 'commentsEx'), 'w15', 'commentEx')) {
      if ((seen.size & 127) === 0) await work.checkpoint();
      const key = attr(node, 'w15', 'paraId')?.toUpperCase(), parent = attr(node, 'w15', 'paraIdParent')?.toUpperCase();
      const info = commentInfo.get(commentByParagraph.get(key)), done = attr(node, 'w15', 'done');
      if (!info || seen.has(key) || parent && !commentByParagraph.has(parent) || done != null && !['0','1','true','false','on','off'].includes(done))
        return fail('DOCX comment threads have invalid links or state.', 'docx_comments_invalid');
      seen.add(key); info.parent = parent ? commentByParagraph.get(parent) : null; info.resolved = ['1','true','on'].includes(done);
    }
  }
  const commentIdsPath = await related(mainPath, 'commentsIds'), extensiblePath = await related(mainPath, 'commentsExtensible');
  if (commentIdsPath || extensiblePath) {
    const durable = new Map();
    if (commentIdsPath) for (const node of children(await readXml(commentIdsPath, 'w16cid', 'commentsIds'), 'w16cid', 'commentId')) {
      if ((durable.size & 127) === 0) await work.checkpoint();
      const key = attr(node, 'w16cid', 'durableId')?.toUpperCase(), paragraph = attr(node, 'w16cid', 'paraId')?.toUpperCase();
      if (!/^[\da-f]{8}$/i.test(key || '') || durable.has(key) || !commentByParagraph.has(paragraph))
        return fail('DOCX comment identifiers are invalid.', 'docx_comments_invalid');
      durable.set(key, commentInfo.get(commentByParagraph.get(paragraph)));
    }
    if (extensiblePath) {
      const seen = new Set();
      for (const node of children(await readXml(extensiblePath, 'w16cex', 'commentsExtensible'), 'w16cex', 'commentExtensible')) {
        if ((seen.size & 127) === 0) await work.checkpoint();
        const key = attr(node, 'w16cex', 'durableId')?.toUpperCase(), info = durable.get(key);
        if (!info || seen.has(key)) return fail('DOCX extended comments have invalid identifiers.', 'docx_comments_invalid');
        seen.add(key);
        const date = attr(node, 'w16cex', 'dateUtc');
        if (date != null) info.date = date;
      }
    }
  }
  let reviewOrder = 0;
  let visitedComments = 0;
  for (const node of descendants(body)) {
    if ((visitedComments++ & 127) === 0) await work.checkpoint();
    if (!is(node, 'w')) continue;
    if (!['commentRangeStart','commentRangeEnd','commentReference'].includes(node.localName)) continue;
    const id = integer(attr(node, 'w', 'id')), info = commentInfo.get(id);
    if (!info) return fail('DOCX is missing the text of a referenced comment.', 'docx_comments_invalid');
    if (node.localName !== 'commentReference') info[node.localName === 'commentRangeStart' ? 'starts' : 'ends'].push(reviewOrder++);
  }
  const commentRoots = new Map(), groupsById = new Map();
  for (const info of commentInfo.values()) {
    await work.checkpoint();
    let root = info, chain = new Set();
    while (root?.parent != null && !chain.has(root.id)) {
      if (commentRoots.has(root.id)) { root = commentRoots.get(root.id); break; }
      chain.add(root.id); root = commentInfo.get(root.parent);
      if ((chain.size & 127) === 0) await work.checkpoint();
    }
    if (root && chain.has(root.id)) root = null;
    let linked = 0;
    for (const id of chain) { commentRoots.set(id, root); if ((linked++ & 127) === 0) await work.checkpoint(); }
    commentRoots.set(info.id, root);
    if (!root) { warn('A comment thread with circular replies became Markdown notes.'); continue; }
    const document = !root.starts.length && !root.ends.length;
    if (!document && (root.starts.length !== 1 || root.ends.length !== 1 || root.starts[0] >= root.ends[0])) continue;
    let group = groupsById.get(root.id);
    if (!group) { group = {id: root.id, document, resolved: root.resolved, records: [root]}; commentGroups.push(group); groupsById.set(root.id, group); }
    if (info !== root) group.records.push(info);
    activeComments.add(info.id); activeComments.add(root.id);
  }
  const commentMarker = '\uFFFERapierWordComment\uFFFF';
  const commentBoundary = node => {
    const id = integer(attr(node, 'w', 'id'));
    return groupsById.has(id) ? project ? sourceToken(commentMarker + id + (node.localName === 'commentRangeStart' ? 'S' : 'E') + commentMarker) : 'x' : '';
  };
  if ([...commentInfo.keys()].some(id => !activeComments.has(id))) warn('Comments without an attached range became Markdown notes.');
  const imported = async text => {
    const parts = [];
    for (let at = 0; at < text.length;) {
      let end = Math.min(text.length, at + 65536);
      if (end < text.length && text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) end--;
      const part = text.slice(at, end);
      if (project) parts.push(account(importedText(part)));
      else if (/[^\r\n ]/.test(part)) return 'x';
      at = end; await work.checkpoint();
    }
    return project ? parts.join('') : text ? ' ' : '';
  };
  const bookmarkTargets = new Map(), bookmarkSpans = new WeakMap(), headingSlugs = Object.create(null), headingTargets = new WeakMap();
  for (const node of descendants(body, 'w', 'p')) {
    const properties = child(node, 'w', 'pPr'), id = val(child(properties, 'w', 'pStyle')) || defaultStyle;
    const outline = integer(paragraphProperties(properties).outline ?? style(id).p.outline, null, 0, 9);
    if (!(outline !== null && outline < 6 || outline === null && /^Heading[1-6]$/i.test(id || ''))) continue;
    const words = [...descendants(node, 'w', 't')].map(part => part.textContent).join('');
    headingTargets.set(node, _rapierNextHeadingSlug(_rapierHeadingSlugBase(words), headingSlugs));
  }
  for (const mark of descendants(body, 'w', 'bookmarkStart')) {
    const name = attr(mark, 'w', 'name');
    if (!name || name === '_GoBack' || /[\u0000-\u0020\u007f]/.test(name) || bookmarkTargets.has(name)) continue;
    let paragraph = mark.parentNode;
    while (paragraph && !is(paragraph, 'w', 'p')) paragraph = paragraph.parentNode;
    const heading = headingTargets.get(paragraph), target = heading || _rapierNextHeadingSlug(name, headingSlugs);
    bookmarkTargets.set(name, '#' + encodeURIComponent(target));
    if (!heading) bookmarkSpans.set(mark, target);
  }
  const fieldLink = instruction => {
    const field = wordHyperlink(instruction);
    if (field?.href.startsWith('#')) return {...field, href: bookmarkTargets.get(field.href.slice(1)), internal: true};
    return field;
  };
  let inlineSteps = 0;
  const foreignPresentation = canonical === null && base === null;
  const baseFamily = mergeRunStyle(defaultRun, style(defaultStyle).r).family;
  const mainfont = baseFamily && !fontAssets.some(font => font.family === baseFamily) && !builtinFontFamilies.has(baseFamily) ? fontKinds.get(baseFamily) : null;
  const inline = async (container, context, inherited = {}, pieces = []) => {
    const fieldText = html => {
      const field = context.fields?.findLast(field => field.href);
      return {html, href: field?.href, title: field?.title};
    };
    for (const node of container.children) {
      if ((inlineSteps++ & 127) === 0) await work.checkpoint();
      if (context.omitRevision && !(is(node, 'w') && ['ins','del','moveTo','moveFrom'].includes(node.localName))) {
        if (node.children.length) await inline(node, context, inherited, pieces);
        continue;
      }
      if (revisionMarkers.has(node)) { if (project) pieces.push({html: sourceToken(revisionMarkers.get(node)), semantic: true}); continue; }
      if (is(node, 'w', 'r')) {
        const properties = child(node, 'w', 'rPr'), named = style(val(child(properties, 'w', 'rStyle')));
        const direct = propertiesOf(properties), formatting = {...mergeRunStyle(inherited, named.r), ...direct};
        if (formatting.hidden) { warn('Hidden text was not imported.'); continue; }
        let text = '';
        const projected = {...formatting}, styleName = val(child(styles.get(val(child(properties, 'w', 'rStyle'))), 'w', 'name'));
        if (project && !context.fields?.some(field => field.inInstruction) && (styleName === 'Verbatim Char' || formatting.family === 'Geist Mono' && builtinFontFamilies.has('Geist Mono')) &&
            Array.from(node.children).every(part => is(part, 'w') && ['rPr','t','tab'].includes(part.localName))) {
          let code = Array.from(node.children, part => is(part, 'w', 't') ? part.textContent : is(part, 'w', 'tab') ? '\t' : '').join('');
          const last = pieces.at(-1), field = context.fields?.findLast(field => field.href), href = field?.href || '', title = field?.title;
          const marks = [['bold','strong'], ['italic','em'], ['strike','s']].filter(([key]) => formatting[key]).map(([, tag]) => tag), key = [...marks, formatting.color || ''].join();
          if (last?.code != null && last.href === href && last.title === title && last.marks === key) { pieces.pop(); code = last.code + code; }
          const fence = '`'.repeat(Math.max(0, ...(code.match(/`+/g) || []).map(ticks => ticks.length)) + 1), pad = /^`|`$|^ (?=.*[^ ]).* $/s.test(code) ? ' ' : '';
          const span = sourceToken(fence + pad + code + pad + fence, (fence + pad + code + pad + fence).replace(/[ \t]/g, '\u00a0'));
          const marked = typography.wrap(formatting.color ? {color: formatting.color} : {}, marks.reduceRight((html, tag) => '<' + tag + '>' + html + '</' + tag + '>', span));
          if (code) pieces.push({html: href ? linkOpen(href, false, title) + marked + '</a>' : marked, code, href, title, marks: key});
          continue;
        }
        if (direct.halfPoints == null && named.r.halfPoints == null || context.initial || context.rapierTable && formatting.halfPoints === 21) projected.halfPoints = null;
        if (formatting.family === defaultRun.family && builtinFontFamilies.has(defaultRun.family)) projected.family = null;
        else if (projected.family && !fontAssets.some(font => font.family === projected.family) && !builtinFontFamilies.has(projected.family)) {
          const kind = projected.family === baseFamily ? null : fontKinds.get(projected.family) || null;
          projected.family = kind === mainfont ? null : kind;
          warn(FONT_KINDS);
        }
        if ((context.structuralBold || context.wordHeading || context.tableHeader && named.structuralBold) &&
            (!Object.hasOwn(named.r, 'bold') || named.structuralBold) && !Object.hasOwn(direct, 'bold')) projected.bold = false;
        if (context.wordHeadingTheme && !Object.hasOwn(named.r, 'color') && !Object.hasOwn(direct, 'color')) projected.color = null;
        let field = context.fields?.findLast(field => field.href), href = field?.href, title = field?.title;
        const linkFormatting = href => {
          const result = {...projected};
          if (project && (context.link || href || context.fields?.some(field => field.internal)) && canonical === null && base === null) {
            const underline = runSetting(properties, 'u'), color = runSetting(properties, 'color');
            if (result.underline && [null, 'single'].includes(val(underline))) result.underline = false;
            if (result.color && (['hyperlink', 'followedHyperlink'].includes(attr(color, 'w', 'themeColor')) || DOCX_LINK_COLORS.has(result.color) ||
                !child(properties, 'w', 'color') && /^(?:hyperlink|followedhyperlink|internet ?link|visited internet ?link)$/i.test(styleName || ''))) result.color = null;
          }
          return result;
        };
        let currentFormatting = linkFormatting(href), runKey = JSON.stringify([currentFormatting, href || '', title ?? null]), last = pieces.at(-1);
        const wrap = words => (href ? linkOpen(href, false, title) : '') + textStyle(words, currentFormatting) + (href ? '</a>' : '');
        const flush = () => { if (!text) return;
          if (project && last?.runKey === runKey && last === pieces.at(-1)) { last.words += text; last.html = wrap(last.words); }
          else pieces.push(project ? {html: wrap(text), words: text, runKey, formatting: currentFormatting, href, title} : {html:
            projected.smallCaps || projected.highlight && projected.highlight !== 'default' && !Object.values(DOCX_HIGHLIGHT_TO_RAPIER).includes(projected.highlight) ? 'x' : text});
          text = ''; };
        for (const piece of await inline(node, context, formatting)) {
          if (piece.image || piece.semantic) { flush(); pieces.push(piece); }
          else {
            if (piece.href !== href || piece.title !== title) {
              flush(); href = piece.href; title = piece.title;
              currentFormatting = linkFormatting(href);
              runKey = JSON.stringify([currentFormatting, href || '', title ?? null]); last = pieces.at(-1);
            }
            text += piece.html;
          }
        }
        flush();
      } else if (is(node, 'w', 'bookmarkStart') && bookmarkSpans.has(node)) {
        if (project) pieces.push({html: sourceToken('<span id="' + attributeText(bookmarkSpans.get(node)) + '"></span>'), semantic: true});
      } else if (is(node, 'w', 't') || is(node, 'w', 'delText')) {
        if (context.fields?.some(field => field.inInstruction)) { context.fields.at(-1).instruction += node.textContent; continue; }
        pieces.push(fieldText(await imported(node.textContent)));
      }
      else if (is(node, 'w', 'tab') || is(node, 'w', 'ptab')) {
        pieces.push(fieldText(project ? sourceToken('&#9;') : 'x')); warn('Tab characters were retained; custom tab stops became ordinary text flow.');
      }
      else if (is(node, 'w', 'sym')) {
        const encoded = attr(node, 'w', 'char'), code = /^[0-9a-f]{1,4}$/i.test(encoded || '') ? parseInt(encoded, 16) : -1;
        if (code < 0 || code >= 0xd800 && code <= 0xdfff || code >= 0xfffe) return fail('DOCX contains an invalid symbol character.');
        const font = attr(node, 'w', 'font')?.toLowerCase(), legacy = code >= 0xf000 && code <= 0xf0ff ? code - 0xf000 : code;
        let glyph = font === 'symbol' ? legacy >= 65 && legacy <= 90 ? SYMBOL_GREEK[legacy - 65] : legacy >= 97 && legacy <= 122 ? SYMBOL_GREEK[26 + legacy - 97] : SYMBOL_SIGNS[legacy] || (legacy >= 48 && legacy <= 57 ? String.fromCharCode(legacy) : null) : font === 'wingdings' ? WINGDINGS_SIGNS[legacy] : null;
        if (!glyph && code >= 0x100 && !(code >= 0xd800 && code <= 0xf8ff) && code < 0xfffe) glyph = String.fromCodePoint(code);
        if (!glyph) { glyph = '•'; warn('Some symbols became bullets because their original font mapping is unavailable.'); }
        pieces.push(fieldText(await imported(glyph)));
      }
      else if (is(node, 'm', 'oMath') || is(node, 'm', 'oMathPara')) {
        const displayMath = is(node, 'm', 'oMathPara'), projected = ommlSource(node, defaultHalfPoints);
        const source = equations.get(projected) ?? projected;
        pieces.push({html: project ? account('<span class="math-rendered" data-math-src="' + escape(encodeURIComponent(source)) + '">' +
          escape(source) + '</span>') : 'x', semantic: true, displayMath});
      }
      else if (is(node, 'w', 'br') || is(node, 'w', 'cr')) {
        const type = attr(node, 'w', 'type') || node.getAttribute?.('type');
        if (type === 'page') pieces.push({pageBreak: true, semantic: true});
        else {
          pieces.push(fieldText('<br>'));
          if (type === 'column') warn('Column breaks became line breaks.');
        }
      } else if (is(node, 'w', 'noBreakHyphen')) pieces.push(fieldText('\u2011'));
      else if (is(node, 'w', 'softHyphen')) pieces.push(fieldText('\u00ad'));
      else if (is(node, 'w', 'drawing') || is(node, 'w', 'pict') || is(node, 'w', 'object')) pieces.push(await picture(node, context));
      else if (is(node, 'w', 'hyperlink')) {
        const relation = (await relationships(context.path)).get(attr(node, 'r', 'id'));
        const anchor = attr(node, 'w', 'anchor');
        const href = relation?.kind === 'hyperlink' && relation.external && LINK_SCHEMES.test(relation.target) && !/[\u0000-\u0020\u007f]/.test(relation.target) ? relation.target : bookmarkTargets.get(anchor) || null;
        if (!href) warn('Internal document links became plain text.');
        const title = attr(node, 'w', 'tooltip');
        const linked = await inline(node, href || anchor ? {...context, link: true} : context, inherited), only = linked.length === 1 && linked[0];
        const auto = !!(project && href && title === null && canonical === null && base === null && only?.formatting && textStyle(only.words, only.formatting) === only.words &&
          (only.words === href && /^[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>]*$/.test(href) || href === 'mailto:' + only.words && DOCX_AUTOLINK_EMAIL.test(only.words)));
        for (const piece of linked) {
          if (project && href && !piece.semantic) {
            if (piece.image) piece.image = linkOpen(href, false, title) + piece.image + '</a>';
            else { piece.html = linkOpen(href, auto, title) + piece.html + '</a>'; piece.href = href; piece.title = title; piece.autolink = auto; }
          }
          pieces.push(piece);
        }
      } else if (is(node, 'w', 'sdt')) {
        const properties = child(node, 'w', 'sdtPr'), checkbox = child(properties, 'w14', 'checkbox');
        if (checkbox) {
          const checked = attr(child(checkbox, 'w14', 'checked'), 'w14', 'val');
          if (checked != null && !['0','1','true','false','on','off'].includes(checked)) return fail('DOCX has an invalid checkbox value.');
          pieces.push({html: '<input type="checkbox" disabled' + (['1','true','on'].includes(checked) ? ' checked' : '') + '>', semantic: true});
        } else if (val(child(properties, 'w', 'tag')) === 'rapier-abbreviation') {
          const title = val(child(properties, 'w', 'alias')) ?? '';
          if (project) pieces.push({html: sourceToken('<abbr title="' + attributeText(title) + '">'), semantic: true});
          await inline(child(node, 'w', 'sdtContent') || node, context, inherited, pieces);
          if (project) pieces.push({html: sourceToken('</abbr>'), semantic: true});
        } else await inline(child(node, 'w', 'sdtContent') || node, context, inherited, pieces);
      }
      else if (is(node, 'mc', 'AlternateContent')) await inline(chooseAlternate(node), context, inherited, pieces);
      else if (is(node, 'w') && ['ins','del','moveTo','moveFrom'].includes(node.localName)) {
        const row = revision(node), included = ['ins','moveTo'].includes(node.localName) === (revisionMode === 'accepted');
        if (project) pieces.push({html: sourceToken(reviewMarker + row.id + 'S' + reviewMarker), semantic: true});
        await inline(node, {...context, omitRevision: context.omitRevision || !included}, inherited, pieces);
        if (project) pieces.push({html: sourceToken(reviewMarker + row.id + 'E' + reviewMarker), semantic: true});
      }
      else if (is(node, 'w', 'fldSimple')) {
        const field = fieldLink(attr(node, 'w', 'instr'));
        if (!field) warn('Fields became their stored displayed text.');
        await inline(node, field ? {...context, fields: [...(context.fields || []), field]} : context, inherited, pieces);
      }
      else if (is(node, 'w') && ['smartTag','customXml'].includes(node.localName)) {
        await inline(node, context, inherited, pieces);
      }
      else if (is(node, 'w') && ['dir','bdo'].includes(node.localName)) {
        if (node.localName === 'bdo') warn('Forced text direction was not kept.');
        await inline(node, context, inherited, pieces);
      }
      else if (is(node, 'w', 'ruby')) {
        await inline(child(node, 'w', 'rubyBase') || node, context, inherited, pieces);
        const reading = child(node, 'w', 'rt');
        if (reading) { pieces.push({html: '('}); await inline(reading, context, inherited, pieces); pieces.push({html: ')'}); }
        warn('Phonetic guides became readings in parentheses.');
      }
      else if (is(node, 'w', 'commentReference') && activeComments.has(integer(attr(node, 'w', 'id')))) continue;
      else if (is(node, 'w') && ['footnoteReference','endnoteReference','commentReference'].includes(node.localName)) pieces.push({html: await noteReference(node, context), semantic: true});
      else if (is(node, 'w') && ['instrText','delInstrText','fldChar'].includes(node.localName)) {
        const fields = context.fields || [], type = attr(node, 'w', 'fldCharType'), field = fields.at(-1);
        if (type === 'begin') fields.push({instruction: '', inInstruction: true});
        else if (type === 'end') { if (field?.inInstruction) warn('Fields became their stored displayed text.'); fields.pop(); }
        else if (field && type === 'separate') {
          field.inInstruction = false;
          const link = fieldLink(field.instruction);
          if (link) Object.assign(field, link);
          else warn('Fields became their stored displayed text.');
        } else if (field && !type) field.instruction += node.textContent;
      }
      else if (is(node, 'w') && ['commentRangeStart','commentRangeEnd'].includes(node.localName)) pieces.push({html: commentBoundary(node), semantic: true});
      else if (is(node, 'w') && ['pPr','rPr','lastRenderedPageBreak','footnoteRef','endnoteRef','annotationRef',...MARKERS].includes(node.localName)) continue;
      else return fail('DOCX contains unsupported inline content: ' + node.localName);
    }
    return pieces;
  };
  const paragraph = async (node, context) => {
    if (++stats.paragraphs > DOCX_LIMITS.paragraphs) return fail('DOCX contains too many paragraphs.');
    const properties = child(node, 'w', 'pPr'), id = val(child(properties, 'w', 'pStyle')) || defaultStyle;
    if (/^RapierBlockSpacing$/i.test(id || '') && /^Rapier Block Spacing$/i.test(val(child(styles.get(id), 'w', 'name')) || '') &&
        Array.from(node.children).every(part => is(part, 'w', 'pPr') || is(part, 'w', 'r') &&
          Array.from(part.children).every(run => is(run, 'w', 'rPr') || is(run, 'w', 't') && !run.textContent)))
      return {html: () => '', list: null, transparent: true};
    const definition = !context.tableCell && !context.note && Object.hasOwn(DEFINITION_NAMES, id || '') && val(child(styles.get(id), 'w', 'name')) === DEFINITION_NAMES[id] ? id : null;
    const named = style(id), direct = paragraphProperties(properties), base = mergeParagraphProperties(defaultParagraph, context.p, named.p, direct);
    const list = numbering(base, id), effective = mergeParagraphProperties(defaultParagraph, context.p, list?.p, named.p, direct);
    const indents = child(properties, 'w', 'numPr') ? mergeParagraphProperties(defaultParagraph, context.p, named.p, list?.p, direct) : effective;
    for (const key of ['leftIndent', 'firstIndent', 'tabs']) if (Object.hasOwn(indents, key)) effective[key] = indents[key];
    if (definition === 'RapierDefinition' && effective.leftIndent === DEFINITION_INDENT && !Object.hasOwn(direct, 'leftIndent')) delete effective.leftIndent;
    if (!context.tableCell && !effective.bidi && ['left', 'start'].includes(effective.align)) delete effective.align;
    const quoteDepth = quoteDepthOf(id) || (!context.tableCell && (quoteRule(properties) || quoteRule(child(styles.get(id), 'w', 'pPr'))) ?
      1 + Math.max(0, Math.floor(((effective.leftIndent || 0) - (list ? (list.level + 1) * (list.tag === 'ol' ? 660 : 300) : 0)) / QUOTE_STEP)) : 0);
    const quote = Math.max(0, quoteDepth - (context.quoteDepth || 0));
    const align = alignment(effective), outline = integer(effective.outline, null, 0, 9);
    if (outline !== null && outline >= 6 && outline < 9) warn('Headings deeper than level six became ordinary paragraphs.');
    const heading = outline !== null && outline < 6 ? outline + 1 : null;
    const inferredHeading = !heading && outline === null && /^Heading[1-6]$/i.test(id || '') ? Number(id.slice(-1)) : heading;
    if (inferredHeading && effective.firstIndent) warn('First-line indentation on headings was not retained; the Markdown standard ignores it.');
    const tag = inferredHeading ? 'h' + inferredHeading : 'p';
    const runs = children(node, 'w', 'r');
    if (runs.length && runs.every(run => {
      const properties = child(run, 'w', 'rPr'), namedRun = style(val(child(properties, 'w', 'rStyle')));
      return {...mergeRunStyle(mergeRunStyle(defaultRun, named.r), namedRun.r), ...propertiesOf(properties)}.hidden;
    })) {
      const marker = runs.map(run => children(run, 'w', 't').map(text => text.textContent).join('')).join('');
      if (willMarkerOf(marker)) {
        if (context.tableCell || context.note || list ||
            Array.from(node.children).some(part => !is(part, 'w') || !['pPr','r','bookmarkStart','bookmarkEnd','proofErr'].includes(part.localName)) ||
            runs.some(run => Array.from(run.children).some(part => !is(part, 'w') || !['rPr','t'].includes(part.localName))))
          return fail('The document’s Will cannot be preserved at this position.');
        return {html: () => project ? account('<p>' + sourceToken(marker) + '</p>') : 'x', list: null};
      }
    }
    const inherited = mergeRunStyle(defaultRun, named.r);
    const wordHeading = foreignPresentation && /^Heading[1-6]$/i.test(id || '') && !['1', 'true', 'on'].includes(attr(styles.get(id), 'w', 'customStyle'));
    const wordHeadingTheme = wordHeading && !!attr(child(child(styles.get(id), 'w', 'rPr'), 'w', 'color'), 'w', 'themeColor');
    const pieces = await inline(node, {...context, fields: [], initial: !!effective.dropLines, wordHeading, wordHeadingTheme,
      structuralBold: !!named.structuralBold && !!inherited.bold && !!(inferredHeading || context.tableHeader)}, inherited), output = [];
    const marks = [['bold','strong'], ['italic','em'], ['strike','s']];
    const formatted = runs => {
      let html = '';
      for (let at = 0; at < runs.length;) {
        let length = 1, shared = null;
        for (const [key, tag] of marks) {
          let end = at; while (end < runs.length && runs[end].formatting[key] && runs[end].href === runs[at].href && runs[end].title === runs[at].title) end++;
          if (end - at > length) { length = end - at; shared = [key, tag]; }
        }
        if (shared) {
          const [key, tag] = shared;
          html += '<' + tag + '>' + formatted(runs.slice(at, at + length).map(run => ({...run, formatting: {...run.formatting, [key]: false}}))) + '</' + tag + '>';
        } else {
          const run = runs[at], value = textStyle(run.words, run.formatting);
          const auto = run.autolink || run.title == null && canonical === null && base === null && value === run.words &&
            (run.words === run.href && /^[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>]*$/.test(run.href) || run.href === 'mailto:' + run.words && DOCX_AUTOLINK_EMAIL.test(run.words));
          html += run.href ? linkOpen(run.href, auto, run.title) + value + '</a>' : value;
        }
        at += length;
      }
      return html;
    };
    for (let at = 0; at < pieces.length;) {
      let end = at; while (end < pieces.length && pieces[end].formatting) end++;
      if (end > at) {
        pieces[at].html = formatted(pieces.slice(at, end));
        for (let i = at + 1; i < end; i++) pieces[i].html = '';
      }
      at = Math.max(at + 1, end);
    }
    const bottom = val(child(child(properties, 'w', 'pBdr'), 'w', 'bottom') || child(child(child(styles.get(id), 'w', 'pPr'), 'w', 'pBdr'), 'w', 'bottom'));
    if (!pieces.length && !list && bottom && !['nil','none'].includes(bottom)) return {html: () => project ? '<hr>' : '', list: null};
    const codeStyle = /^(?:Source Code|HTML Preformatted|Plain Text)$|^Source Code \(([^()\s]+)\)$/i.exec(val(child(styles.get(id), 'w', 'name')) || '');
    if (!list && !context.tableCell && !inferredHeading && pieces.every(piece => !piece.image && !piece.semantic) && codeStyle) {
      let code = '';
      const words = parent => { for (const part of parent.children) {
        if (is(part, 'w') && ['pPr','rPr','instrText'].includes(part.localName)) continue;
        if (is(part, 'w') && ['ins','del','moveTo','moveFrom'].includes(part.localName)) {
          const row = revision(part);
          code += reviewMarker + row.id + 'S' + reviewMarker;
          if (['ins','moveTo'].includes(part.localName) === (revisionMode === 'accepted')) words(part);
          code += reviewMarker + row.id + 'E' + reviewMarker;
        } else if (revisionMarkers.has(part)) code += revisionMarkers.get(part);
        else if (is(part, 'w', 't') || is(part, 'w', 'delText')) code += part.textContent;
        else if (is(part, 'w', 'tab')) code += '\t';
        else if (is(part, 'w', 'br') || is(part, 'w', 'cr')) code += '\n';
        else words(part);
      } };
      words(node);
      return {html: () => '', code, language: codeStyle[1] || '', list: null, quote};
    }
    if (list?.unmarked) for (const item of descendants(node)) {
      if (is(item, 'w14', 'checkbox')) { list.task = true; break; }
      await work.checkpoint();
    }
    const section = child(properties, 'w', 'sectPr');
    if (section && !['continuous', 'nextColumn'].includes(val(child(section, 'w', 'type')))) pieces.push({pageBreak: true, semantic: true});
    if (effective.pageBreakBefore) pieces.unshift({pageBreak: true, semantic: true});
    const annotation = layout => {
      if (!context.tableCell) return layoutAttribute(layout);
      if (['first', 'indent', 'marker', 'hyphens'].some(key => Object.hasOwn(layout, key))) {
        const {marker, ...paragraph} = layout;
        const css = indentStyle(paragraph, {portable: true, pointSize: referenceType(null).body, indentOffset: -(marker || 0)}) +
          (layout.align ? ';text-align:' + layout.align : '');
        return layoutAttribute(layout) + ' style="' + escape(css) + '"';
      }
      if (Object.keys(layout).length) warn('Individual paragraph alignment and picture sizing inside table cells were not retained; Markdown column alignment remains.');
      return '';
    };
    if (!project) {
      const value = pieces.map(piece => piece.image || piece.html || '').join('');
      const hasProse = pieces.some(piece => piece.html && !piece.displayMath);
      return {html: base => { if (hasProse) annotation(paragraphLayout(effective, inferredHeading, list, base)); return value; },
        layout: base => paragraphLayout(effective, inferredHeading, list, base), list, tableCell: context.tableCell};
    }
    let text = '';
    const flush = () => { if (text) {
      const body = text;
      output.push(base => '<' + tag + annotation(paragraphLayout(effective, inferredHeading, list, base)) + '>' + body + '</' + tag + '>');
      text = '';
    } };
    const padding = html => typeof html === 'string' && html.replace(/<span class="rapier-source-token" data-rapier-source="[^"]*" data-rapier-visible="[^"]*">[^<]*<\/span>/g, '') === '';
    for (let index = 0; index < pieces.length; index++) {
      const piece = pieces[index];
      if (piece.block) { flush(); output.push(piece.html); continue; }
      if (piece.displayMath) { flush(); output.push('<p>' + piece.html + '</p>'); continue; }
      if (piece.rule) { flush(); output.push('<hr>'); continue; }
      if (piece.pageBreak) {
        flush();
        output.push('<div class="rapier-page-break" data-md-break="page" contenteditable="false" role="separator" aria-label="Page break"><br></div>');
        continue;
      }
      if (!piece.image) { text += piece.html; continue; }
      const lead = padding(text) ? text : '';
      if (lead) text = ''; else flush();
      let tail = '';
      while (padding(pieces[index + 1]?.html)) tail += pieces[++index].html;
      const layout = {}, imageAlign = piece.align || align;
      if (imageAlign && imageAlign !== 'justify') layout.align = imageAlign;
      if (piece.width !== null) layout.width = piece.width;
      if (piece.rotate) layout.rotate = piece.rotate;
      if (piece.opacity < 100) layout.opacity = piece.opacity;
      if (piece.wrap) {
        layout.wrap = piece.wrap;
        const x = piece.x ?? {center: 50, right: 100}[piece.align];
        if (x != null) layout.x = x;
        if (piece.y) layout.y = piece.y;
        if (piece.lines) layout.lines = piece.lines;
        delete layout.align;
      }
      if (context.figure) Object.assign(layout, context.figure);
      output.push('<p' + annotation(layout) + '>' + lead + piece.image + tail + '</p>');
    }
    flush();
    if (!output.length && !section) output.push('<p><br></p>');
    if (pieces.some(piece => piece.image && !piece.lines) && pieces.some(piece => piece.html?.trim() && !padding(piece.html))) warn('Pictures within text became separate source-order paragraphs.');
    const prose = tag === 'p' && !context.tableCell && output.length === 1 && pieces.every(piece => !piece.image && !piece.pageBreak && !piece.displayMath && !piece.rule);
    const initial = prose && effective.dropLines ? pieces.map(piece => piece.html || '').join('') : null;
    const spacing = side => on(child(properties, 'w', 'contextualSpacing')) ? 0 : Number(/^\d+$/.exec(attr(child(properties, 'w', 'spacing'), 'w', side) || '')?.[0] || 0);
    return {html: base => output.map(piece => typeof piece === 'function' ? piece(base) : piece).join(''),
      layout: base => paragraphLayout(effective, inferredHeading, list, base), list, tableCell: context.tableCell,
      before: spacing('before'), after: spacing('after'),
      prose, initial, dropLines: effective.dropLines, definition, quote: inferredHeading ? 0 : quote};
  };
  const groupLists = async (blocks, enclosingQuoteDepth = 0) => {
    const inset = Math.max(0, enclosingQuoteDepth - 1) * QUOTE_STEP;
    const parts = [], stack = []; let hasText = false, hasImage = false, visited = 0;
    const emit = value => {
      if (project) parts.push(value);
      else { hasImage ||= /<img\b/.test(value); hasText ||= !!value.replace(/<[^>]*>/g, '').trim(); }
    };
    const close = () => {
      const level = stack.pop();
      if (!project) return;
      if (level.loose && !level.tableCell) parts[level.open] = parts[level.open].replace(/>$/, ' data-rapier-list-loose>');
      else if (!level.tableCell) for (const at of level.items) if (!/^<ol start="(?!1")/.test(parts[at + 1] || ''))
        parts[at] = parts[at].replace(/^<p>((?:(?!<\/?p\b)[\s\S])*)<\/p>$/, '$1')
          .replace(/^(<p data-md-layout="[^"]*")(>(?:(?!<\/?p\b)[\s\S])*<\/p>)$/, '$1 data-md-layout-tight$2');
      emit('</li></' + level.tag + '>');
    };
    let code = null, language = '', definitions = false, quoted = [];
    const flushQuote = async () => {
      if (!quoted.length) return;
      const html = await groupLists(quoted, enclosingQuoteDepth + 1); quoted = [];
      emit(project ? '<blockquote>' + html + '</blockquote>' : html);
    };
    const closeDefinitions = () => { if (definitions) { definitions = false; if (project) emit('</dl>'); } };
    const flushCode = () => { if (code != null) { while (stack.length) close();
      emit(project ? account('<pre><code' + (language ? ' class="language-' + escape(language) + '"' : '') + '>' + escape(code) + '</code></pre>') : 'x'); code = null; } };
    for await (const block of blocks) {
      if ((visited++ & 127) === 0) await work.checkpoint();
      if (block.transparent) continue;
      if (block.quote > 0) {
        flushCode(); closeDefinitions(); while (stack.length) close();
        quoted.push({...block, quote: block.quote - 1}); continue;
      }
      await flushQuote();
      if (block.code != null && code != null && block.language !== language) flushCode();
      if (block.code != null) { code = code == null ? block.code : code + '\n' + block.code; language = block.language; continue; }
      flushCode();
      if (block.definition && !block.list) {
        while (stack.length) close();
        if (!definitions && project) emit('<dl>');
        definitions = true;
        const html = block.html(0);
        emit(block.definition === 'RapierTerm' ? '<dt>' + html.replace(/^<p(?: [^>]*)?>([\s\S]*)<\/p>$/, '$1') + '</dt>' : '<dd>' + html + '</dd>');
        continue;
      }
      closeDefinitions();
      const content = base => block.html(base);
      if (!block.list) {
        while (stack.length) close();
        emit(block.html(inset));
        continue;
      }
      const list = block.list;
      const same = prior => prior.tag === list.tag && (prior.id === list.id || list.tag === 'ul' && (prior.task || list.task) || list.tag === 'ol' && prior.delimiter === list.delimiter);
      while (stack.length && (stack.at(-1).level > list.level || stack.at(-1).level === list.level && !same(stack.at(-1)))) close();
      if (stack.length && stack.at(-1).level === list.level) { if (project) emit('</li>'); stack.at(-1).loose ||= Math.max(stack.at(-1).after, block.before) >= looseGap; }
      else {
        if (stack.length) stack.at(-1).loose ||= Math.max(stack.at(-1).after, block.before) >= looseGap;
        const parentMarker = block.tableCell && stack.at(-1)?.marker;
        const start = '<' + list.tag + (list.tag === 'ol' ? ' start="' + list.ordinal + '" data-rapier-list-numbering="authored" data-rapier-list-delimiter="' + list.delimiter + '"' : '') +
          (parentMarker ? ' style="' + indentStyle({indent: -parentMarker}, {portable: true, pointSize: referenceType(null).body}) + '"' : '') + '>';
        if (project) emit(start);
        stack.push({...list, base: (stack.at(-1)?.base ?? inset) + (list.tag === 'ol' ? 660 : 300), open: parts.length - 1, items: [], loose: false, tableCell: block.tableCell});
      }
      const base = stack.at(-1).base, marker = block.layout(base).marker;
      stack.at(-1).id = list.id; stack.at(-1).task = list.task;
      stack.at(-1).marker = marker;
      const item = '<li' + (list.tag === 'ol' ? ' data-rapier-list-ordinal="' + list.ordinal + '"' : '') +
        (marker ? ' style="' + (block.tableCell ? indentStyle({indent: marker}, {portable: true, pointSize: referenceType(null).body}) :
          indentStyle({marker})) + '"' : '') + '>';
      if (project) emit(item);
      emit(content(base));
      stack.at(-1).after = block.after;
      if (project) stack.at(-1).items.push(parts.length - 1);
    }
    await flushQuote();
    flushCode();
    closeDefinitions();
    while (stack.length) close();
    return project ? parts.join('') : (hasImage ? '<img>' : '') + (hasText ? 'x' : '');
  };
  const renderBlocks = async (nodes, context, sectionContexts = null) => {
    nodes = nodes.slice(); sectionContexts = sectionContexts?.slice();
    const copy = node => {
      const cloned = node.cloneNode(true), pair = (a, b) => {
        if (revisionMarkers.has(a)) revisionMarkers.set(b, revisionMarkers.get(a));
        if (is(a, 'w') && ['ins','del','moveTo','moveFrom'].includes(a.localName)) revisionNodes.set(b, revision(a));
        Array.from(a.children).forEach((n, i) => pair(n, b.children[i]));
      };
      pair(node, cloned); return cloned;
    };
    const marker = (row, edge) => {
      const node = new DOMParser().parseFromString('<w:r xmlns:w="' + NS.w[0] + '"/>', 'application/xml').documentElement;
      revisionMarkers.set(node, reviewMarker + row.id + edge + reviewMarker); return node;
    };
    for (let i = 0; i < nodes.length; i++) {
      const p = nodes[i], properties = child(child(p, 'w', 'pPr'), 'w', 'rPr');
      const mark = child(properties, 'w', 'ins') || child(properties, 'w', 'del');
      if (!is(p, 'w', 'p') || !mark) continue;
      const row = revision(mark), keepBreak = is(mark, 'w', 'ins') === (revisionMode === 'accepted');
      const next = nodes[i + 1] || new DOMParser().parseFromString('<w:p xmlns:w="' + NS.w[0] + '"/>', 'application/xml').documentElement;
      if (!is(next, 'w', 'p')) return fail('A tracked paragraph break crosses a table boundary.', 'docx_revision_structure');
      const left = copy(p), right = copy(next), pr = child(left, 'w', 'pPr'), rPr = child(pr, 'w', 'rPr');
      (child(rPr, 'w', 'ins') || child(rPr, 'w', 'del')).remove();
      left.appendChild(marker(row, 'S'));
      if (right.firstChild) right.insertBefore(marker(row, 'E'), right.firstChild); else right.appendChild(marker(row, 'E'));
      if (keepBreak) { nodes[i] = left; nodes[i + 1] = right; }
      else {
        for (const node of Array.from(right.children)) if (!is(node, 'w', 'pPr')) left.appendChild(node);
        const nextMark = child(child(right, 'w', 'pPr'), 'w', 'rPr');
        const nextRevision = child(nextMark, 'w', 'ins') || child(nextMark, 'w', 'del');
        if (nextRevision) {
          let ownPr = child(left, 'w', 'pPr');
          if (!ownPr) { ownPr = child(copy(right), 'w', 'pPr'); left.insertBefore(ownPr, left.firstChild); }
          else { let ownRun = child(ownPr, 'w', 'rPr'); if (!ownRun) { ownRun = copy(nextMark); ownPr.appendChild(ownRun); } else ownRun.appendChild(copy(nextRevision)); }
        }
        nodes.splice(i, 2, left); sectionContexts?.splice(i + 1, 1); i--;
      }
    }
    const blocks = async function* () {
    let previous = null;
    for (let index = 0; index < nodes.length; index++) {
      await work.checkpoint();
      const node = nodes[index], active = sectionContexts ? {...context, ...sectionContexts[index]} : context;
      if (detailsControl(node)) {
        const content = await sequence(child(node, 'w', 'sdtContent')), summary = content.shift();
        if (!is(summary, 'w', 'p')) return fail('DOCX details has no summary paragraph.');
        const label = (await paragraph(summary, active)).html(0).replace(/^<p(?: [^>]*)?>([\s\S]*)<\/p>$/, '$1');
        const html = await renderBlocks(content, active);
        if (previous) yield previous;
        previous = {html: () => project ? '<details><summary>' + label + '</summary>' + html + '</details>' : label + html, list: null};
        continue;
      }
      if (quoteControl(node)) {
        const content = child(node, 'w', 'sdtContent');
        if (!content) return fail('DOCX contains an unsupported document block: ' + node.localName);
        const html = await renderBlocks(await sequence(content), {...active, quoteDepth: (active.quoteDepth || 0) + 1});
        if (previous) yield previous;
        previous = {html: () => html, list: null, quote: 1};
        continue;
      }
      const kind = !context.tableCell && is(node, 'w', 'p') && calloutKind(node);
      if (kind) {
        let end = index + 1;
        while (end < nodes.length && is(nodes[end], 'w', 'p') && calloutRule(nodes[end]) === calloutRule(node)) end++;
        const html = await callout(kind, nodes.slice(index + 1, end), active);
        if (previous) yield previous;
        previous = {html: () => html, list: null, quote: (await paragraph(node, active)).quote};
        index = end - 1;
        continue;
      }
      const caption = is(node, 'w', 'p') && captionOf(node, nodes[index - 1]);
      if (caption) {
        if (previous) yield previous;
        const text = await imported(caption);
        previous = {html: () => project ? '<p>' + text + '</p>' : text, list: null};
        continue;
      }
      if (is(node, 'w', 'p')) {
        const block = await paragraph(node, active), initial = previous;
        if (initial?.initial && !initial.list && block.prose && !block.dropLines) {
          previous = null;
          const html = block.html, layout = block.layout;
          block.layout = base => ({...layout(base), lines: initial.dropLines});
          block.html = base => html(base).replace(/^<p(?: [^>]*)?>((?:<(?:span|strong|em|s|u|sup|sub)\b[^>]*>)*)(\[(?:x| )\] )?/, (_, wrappers, task = '') =>
            '<p' + layoutAttribute(block.layout(base)) + '>' +
            (task && block.list ? '<input type="checkbox" disabled' + (task[1] === 'x' ? ' checked' : '') + '> ' : task) + initial.initial + wrappers);
        }
        if (previous) yield previous;
        previous = block;
      }
      else {
        const html = is(node, 'w', 'tbl') ? await table(node, active) : commentBoundary(node);
        if (previous) yield previous;
        const tableQuote = is(node, 'w', 'tbl') && [...descendants(node, 'w', 'p')].length > 0 && [...descendants(node, 'w', 'p')].every(paragraph => quoteRule(child(paragraph, 'w', 'pPr')));
        const inset = integer(attr(child(child(node, 'w', 'tblPr'), 'w', 'tblInd'), 'w', 'w'), 0, 0);
        const title = is(node, 'w', 'tbl') && descendants(node, 'w', 'p').next().value;
        const depth = title && calloutKind(title) ? quoteDepthOf(val(child(child(title, 'w', 'pPr'), 'w', 'pStyle'))) : tableQuote ? 1 + Math.floor(inset / QUOTE_STEP) : 0;
        previous = {html: () => html, list: null, quote: Math.max(0, depth - (active.quoteDepth || 0))};
      }
    }
    if (previous) yield previous;
    };
    return groupLists(blocks(), context.quoteDepth || 0);
  };
  const tableParts = async (container, name, ignored) => {
    const result = [], stack = [{nodes: container.children, at: 0}]; let visited = 0;
    while (stack.length) {
      const frame = stack.at(-1), node = frame.nodes[frame.at++];
      if (!node) { stack.pop(); continue; }
      if ((visited++ & 127) === 0) await work.checkpoint();
      if (is(node, 'w', name)) result.push(node);
      else if (is(node, 'w') && ignored.includes(node.localName)) continue;
      else if (is(node, 'w', 'sdt')) {
        const content = child(node, 'w', 'sdtContent');
        if (!content) return fail('DOCX table content control has no content.');
        stack.push({nodes: content.children, at: 0});
      } else if (is(node, 'w', 'customXml')) {
        stack.push({nodes: node.children, at: 0});
      } else if (is(node, 'mc', 'AlternateContent')) stack.push({nodes: chooseAlternate(node).children, at: 0});
      else if (is(node, 'w') && ['ins','del','moveTo','moveFrom'].includes(node.localName))
        return fail('Decide table structure revisions before importing this Word file.', 'docx_revision_structure');
      else if (is(node, 'w') && ['commentRangeStart','commentRangeEnd'].includes(node.localName)) continue;
      else return fail('DOCX contains unsupported table content: ' + node.localName);
    }
    return result;
  };
  const calloutRule = node => {
    const properties = child(node, 'w', 'pPr'), left = child(child(properties, 'w', 'pBdr'), 'w', on(child(properties, 'w', 'bidi')) ? 'right' : 'left');
    return left && val(left) === 'single' && attr(left, 'w', 'sz') === '24' && attr(left, 'w', 'space') === '8' ? attr(left, 'w', 'color') || '' : null;
  };
  const calloutKind = node => {
    const runs = children(node, 'w', 'r'), label = runs.length === 1 && on(child(child(runs[0], 'w', 'rPr'), 'w', 'b')) &&
      children(runs[0], 'w', 't').map(text => text.textContent).join('');
    return calloutRule(node) != null && /^(?:Note|Tip|Important|Warning|Caution|Danger|Info)$/.test(label || '') ? label.toLowerCase() : null;
  };
  const captionOf = (node, prior) => {
    const kind = is(prior, 'w', 'tbl') ? 'Table: ' : is(prior, 'w', 'p') && !descendants(prior, 'w', 'drawing').next().done ? 'Figure: ' : null;
    const parts = Array.from(node.children).filter(part => !is(part, 'w', 'pPr')), run = kind && parts.length === 1 && is(parts[0], 'w', 'r') && parts[0];
    if (!run || !Array.from(run.children).every(part => is(part, 'w', 'rPr') || is(part, 'w', 't'))) return null;
    const format = child(run, 'w', 'rPr'), text = children(run, 'w', 't').map(part => part.textContent).join('');
    return on(child(format, 'w', 'i')) && val(child(format, 'w', 'sz')) === '21' && text.startsWith(kind) ? text : null;
  };
  const callout = async (kind, nodes, context) => project
    ? '<blockquote class="callout callout-' + kind + '"><div class="callout__label">' + kind + '</div>' + await renderBlocks(nodes, context) + '</blockquote>' : renderBlocks(nodes, context);
  const table = async (node, context) => {
    stats.tables++;
    const properties = child(node, 'w', 'tblPr'), styleId = val(child(properties, 'w', 'tblStyle')), named = style(styleId);
    const rapierTable = val(child(styles.get(styleId), 'w', 'name')) === 'Rapier table' && val(child(child(styles.get(styleId), 'w', 'rPr'), 'w', 'sz')) === '21';
    const only = children(node, 'w', 'tr'), cell = only.length === 1 && children(only[0], 'w', 'tc').length === 1 && child(only[0], 'w', 'tc');
    const inner = cell && children(cell, 'w').filter(part => part.localName !== 'tcPr');
    if (inner.length > 1 && inner.every(part => is(part, 'w', 'p')) && calloutKind(inner[0])) return callout(calloutKind(inner[0]), inner.slice(1), context);
    const float = child(properties, 'w', 'tblpPr'), cellWidth = float && integer(attr(child(properties, 'w', 'tblW'), 'w', 'w'), 0);
    if (float && cellWidth && inner.length === 2 && inner.every(part => is(part, 'w', 'p')) && !descendants(inner[0], 'w', 'drawing').next().done && captionOf(inner[1], inner[0])) {
      const percent = value => Math.max(0, Math.min(100, Math.round(value / context.width * 10000) / 100));
      const wrap = val(child(properties, 'w', 'tblOverlap')) === 'never' ? 'box' : 'around';
      const top = integer(attr(float, 'w', 'tblpY'), 0, -31680, 31680), y = top ? Math.max(-50, Math.round(top * 635 / pictureMeasure.em * 100) / 100) : null;
      return renderBlocks(inner, {...context, figure: {wrap, x: percent((integer(attr(float, 'w', 'tblpX'), 0) + cellWidth / 2) * 635), ...(y ? {y} : {}), width: percent(cellWidth * 635)}});
    }
    if (children(styles.get(styleId), 'w', 'tblStylePr').length) warn('Conditional table styling was not imported.');
    const rows = await tableParts(node, 'tr', ['tblPr','tblGrid',...MARKERS]), output = [], spanning = new Map();
    for (const row of rows) {
      await work.checkpoint();
      if (child(child(row, 'w', 'trPr'), 'w', 'del')) { warn('Revision history was removed; current text was retained.'); continue; }
      const cells = await tableParts(row, 'tc', ['trPr','tblPrEx',...MARKERS]), rendered = []; let column = 0;
      const before = integer(val(child(child(row, 'w', 'trPr'), 'w', 'gridBefore')), 0, 0, DOCX_LIMITS.tableColumns);
      for (; column < before; column++) { rendered.push({html:'', span:1, rows:1}); spanning.delete(column); }
      for (const cell of cells) {
        const p = child(cell, 'w', 'tcPr'), span = integer(val(child(p, 'w', 'gridSpan')), 1, 1, DOCX_LIMITS.tableColumns);
        if (child(p, 'w', 'cellDel') || child(p, 'w', 'cellMerge')) return fail('DOCX tracked table-cell changes must be resolved before importing.');
        if (child(p, 'w', 'hMerge')) return fail('DOCX legacy horizontal cell merges must be converted to grid spans before importing.');
        if (column + span > DOCX_LIMITS.tableColumns) return fail('DOCX table exceeds the column limit.');
        const vertical = child(p, 'w', 'vMerge'), continuation = vertical && val(vertical) !== 'restart';
        const cellWidth = child(p, 'w', 'tcW'), widthType = attr(cellWidth, 'w', 'type'), widthValue = integer(attr(cellWidth, 'w', 'w'), null, 0, 3168000);
        const width = widthValue && widthType === 'dxa' ? widthValue * 635 : widthValue && widthType === 'pct' ? context.width * widthValue / 5000 : context.width / Math.max(1, cells.length);
        const cellBlocks = await sequence(cell);
        const html = await renderBlocks(cellBlocks, {...context, quoteDepth: 0, tableCell: true, tableHeader: on(child(child(row, 'w', 'trPr'), 'w', 'tblHeader')) === true, rapierTable,
          width: Math.min(context.width, width), p: mergeParagraphProperties(context.p, named.p)});
        const previous = spanning.get(column);
        if (continuation) {
          if (!previous || previous.span !== span) return fail('DOCX contains an invalid merged table cell.');
          if (html.replace(/<[^>]*>/g, '').trim() || /<img\b/.test(html)) return fail('DOCX contains content inside a continued merged cell.');
          previous.rows++;
        } else {
          const firstParagraph = cellBlocks.find(candidate => is(candidate, 'w', 'p'));
          const firstProperties = child(firstParagraph, 'w', 'pPr'), paragraphStyle = style(val(child(firstProperties, 'w', 'pStyle')) || defaultStyle);
          const align = alignment({...defaultParagraph, ...named.p, ...paragraphStyle.p, ...paragraphProperties(firstProperties)});
          const result = {html, span, rows:1, align}; rendered.push(result);
          for (let offset = 0; offset < span; offset++) spanning.delete(column + offset);
          if (vertical) spanning.set(column, result);
        }
        if (span > 1 || vertical) warn('Merged table cells were kept as an HTML table.');
        column += span;
      }
      for (const key of [...spanning.keys()]) if (key >= column) spanning.delete(key);
      output.push({cells: rendered, header: on(child(child(row, 'w', 'trPr'), 'w', 'tblHeader'))});
    }
    let content = '', picture = '', complex = !output[0]?.header;
    const parts = project ? ['<table><tbody>'] : [];
    for (let index = 0; index < output.length; index++) {
      if ((index & 127) === 0) await work.checkpoint();
      const row = output[index];
      if (project) { parts.push('<tr>'); complex ||= index > 0 && row.header; }
      for (const cell of row.cells) {
        if (!project) {
          if (cell.html.replace(/<[^>]*>/g, '').trim()) content = 'x';
          if (/<img\b/.test(cell.html)) picture = '<img>';
          continue;
        }
        const tag = row.header ? 'th' : 'td';
        parts.push('<' + tag + (cell.span > 1 ? ' colspan="' + cell.span + '"' : '') + (cell.rows > 1 ? ' rowspan="' + cell.rows + '"' : '') +
          (cell.align && cell.align !== 'justify' ? ' style="text-align:' + cell.align + '"' : '') + '>' + cell.html + '</' + tag + '>');
        const paragraphs = /<p(?: |>)/g;
        complex ||= cell.span > 1 || cell.rows > 1 || cell.html.includes(' data-md-layout=') ||
          paragraphs.test(cell.html) && paragraphs.test(cell.html) || /<(?:table|[ou]l|h[1-6])(?: |>)/.test(cell.html);
      }
      if (project) parts.push('</tr>');
    }
    if (!project) return picture + content;
    parts.push('</tbody></table>');
    const html = parts.join('');
    if (!complex || context.tableCell) return html;
    const placeholder = '<p>' + sourceToken(html) + '</p>';
    rawBlocks.push({placeholder, html});
    return placeholder;
  };
  const nodes = await sequence(body), contexts = new Array(nodes.length);
  let currentSection = sectionWidth(child(body, 'w', 'sectPr'));
  for (let index = nodes.length - 1; index >= 0; index--) {
    if ((index & 127) === 0) await work.checkpoint();
    const section = is(nodes[index], 'w', 'p') ? child(child(nodes[index], 'w', 'pPr'), 'w', 'sectPr') : null;
    if (section) currentSection = sectionWidth(section);
    contexts[index] = currentSection;
  }
  progress(.4, 'content');
  let html = await renderBlocks(nodes, {path: mainPath, p: {}}, contexts);
  let rejectedHtml = null;
  if (revisions.length) {
    revisionMode = 'rejected';
    rejectedHtml = await renderBlocks(nodes, {path: mainPath, p: {}}, contexts);
    revisionMode = 'accepted';
  }
  const unplaced = [];
  for (const id of commentPart?.records.keys() || []) if (!activeComments.has(id) && !notes.has('docx-comment-' + id))
    unplaced.push(await registerNote('comment', id, {path: mainPath, p: {}, ...currentSection}));
  if (unplaced.length) html += '<p>' + unplaced.join(' ') + '</p>';
  if (notes.size) {
    const rawLabels = new Set(rawBlocks.flatMap(block => [...block.html.matchAll(/data-footnote-label="([^"]+)"/g)].map(match => match[1])));
    const items = [];
    for (const note of notes.values()) {
      await work.checkpoint();
      items.push('<li id="fn-' + note.label + '" data-footnote-label="' + note.label + '">' +
        note.metadata + await renderBlocks(await sequence(note.content), note.context) + '</li>');
    }
    const content = '<section class="footnotes"><ol>' + items.join('') + '</ol></section>';
    if (rawLabels.size) {
      const preserve = value => value.replace(/<sup class="footnote-ref"><a href="#fn-([^"]+)" data-footnote-label="\1">\d+<\/a><\/sup>/g,
        reference => sourceToken(reference));
      html = preserve(html);
      if (rejectedHtml !== null) rejectedHtml = preserve(rejectedHtml);
      const placeholder = '<p>' + sourceToken(content) + '</p>';
      rawBlocks.push({placeholder, html: content});
      html += placeholder;
      if (rejectedHtml !== null) rejectedHtml += placeholder;
    } else { html += content; if (rejectedHtml !== null) rejectedHtml += content; }
  }
  const comments = {marker: commentMarker, threads: []};
  for (const group of commentGroups) {
    await work.checkpoint();
    const messages = [];
    for (const info of group.records) {
      const date = info.date;
      if (date != null && !validCommentDate(date))
        return fail('DOCX contains an invalid comment date.', 'docx_comments_invalid');
      const instant = date && /(?:Z|[+-]\d{2}:\d{2})$/.test(date) ? Date.parse(date) : null;
      const createdAt = validCommentTimestamp(instant) ? instant : null;
      messages.push({id: 'word-message-' + info.id, author: {kind: 'human', name: attr(info.node, 'w', 'author') || ''},
        createdAt, ...(date != null ? {date} : {}), ...(info.parent != null ? {replyTo: 'word-message-' + info.parent} : {}),
        html: await renderBlocks(await sequence(info.node),
          {path: commentPart.path, p: {}, note: true, ...currentSection})});
    }
    comments.threads.push({id: 'word-thread-' + group.id, wordId: group.id, document: group.document, resolved: group.resolved, messages});
  }
  work.check();
  if (html.length > ARCHIVE_LIMITS.bytes || new Blob([html]).size > ARCHIVE_LIMITS.bytes) return fail('Converted DOCX exceeds the 25 MB document limit.');
  progress(.75, 'integrity');
  const admittedImages = new Map();
  for (const request of imageRequests) {
    const {path, type} = request.image;
    if (admittedImages.has(path)) { request.image.mime = admittedImages.get(path).type; continue; }
    await work.checkpoint();
    const bytes = await files.read(path);
    if (!bytes.length || bytes.length > IMAGE_LIMITS.bytes) return fail('DOCX picture exceeds the 16 MiB image limit.', 'docx_image_invalid');
    let info;
    if (isJxl(bytes)) info = {...inspectJPEGXL(bytes), type: 'image/jxl'};
    else {
      try { info = inspectRaster(bytes); }
      catch (error) {
        if (type !== 'image/svg+xml') throw error;
        info = inspectSVG(bytes);
        const source = await xmlText(bytes, work);
        if (!sanitizeSvgText(source)) return fail('DOCX contains an invalid SVG picture.', 'docx_image_invalid');
      }
    }
    request.image.mime = info.type;
    admittedImages.set(path, info);
  }
  await files.verify();
  work.check();
  const nativeLanguage = defaultRun.language;
  if (!project) {
    progress(1, 'complete');
    return {html: '', warnings: [], stats, canonical, ...(nativeLanguage ? {language: nativeLanguage} : {})};
  }
  const wordStyle = stylesPath ? {name: String(name).replace(/\.(?:docx|dotx)$/i, '') + '.dotx',
    styles: await xmlText(await files.read(stylesPath), work),
    paragraphs: Array.from(descendants(body)).filter(node => is(node, 'w', 'p')).map(wordParagraph)} : null;
  const wordTheme = await related(mainPath, 'theme');
  if (wordStyle && wordTheme) wordStyle.theme = await xmlText(await files.read(wordTheme), work);
  if (wordStyle && numberingPath) wordStyle.numbering = await xmlText(await files.read(numberingPath), work);
  if (wordStyle) admitWordStyle(wordStyle);
  xmlCache.clear(); relationCache.clear(); styles.clear(); styleCache.clear();
  notes.clear(); noteParts.clear(); commentInfo.clear(); commentRoots.clear(); groupsById.clear();
  commentGroups.length = 0; commentByParagraph.clear(); activeComments.clear();
  nodes.length = 0; contexts.length = 0;
  progress(.8, 'images');
  const references = new Map(), imageResults = [];
  for (const request of imageRequests) {
    await work.checkpoint();
    const image = {...request.image, bytes: await files.read(request.image.path)};
    const result = await embedImage(image), reference = result?.reference;
    work.check();
    if (typeof reference !== 'string' || !/^[a-z0-9-]+$/i.test(reference))
      return fail('DOCX picture conversion did not return an image reference.');
    references.set(request.reference, reference);
    const url = result?.url;
    if (!dataImage(url))
      return fail('DOCX picture conversion did not return embedded image bytes.', 'docx_image_conversion');
    imageResults.push({reference, url});
    progress(.8 + .15 * imageResults.length / imageRequests.length, 'images');
  }
  if (rawBlocks.length) {
    const urls = new Map(imageResults.map((image, index) => ['docx-pending-' + index, image.url])), portableBlocks = new Map();
    const replaceRawBlocks = (value, asToken = true) => value.replace(/<p><span class="rapier-source-token" data-rapier-source="[^"]*" data-rapier-visible="[^"]*">[^<]*<\/span><\/p>/g,
      token => {
        const portable = portableBlocks.get(token);
        return portable === undefined ? token : asToken ? '<p>' + sourceToken(portable) + '</p>' : portable;
      });
    for (const block of rawBlocks) {
      await work.checkpoint();
      portableBlocks.set(block.placeholder, docxPortableHtml(replaceRawBlocks(block.html, false), urls));
    }
    html = replaceRawBlocks(html);
    if (rejectedHtml !== null) rejectedHtml = replaceRawBlocks(rejectedHtml);
    for (const thread of comments.threads) for (const message of thread.messages) {
      await work.checkpoint(); message.html = replaceRawBlocks(message.html);
    }
    rawBlocks.length = 0;
  }
  const urls = new Map(imageResults.map((image, index) => ['docx-pending-' + index, image.url]));
  const replaceImages = value => value.replace(/<img\b[^>]*\bdata-rapier-asset="(docx-pending-\d+)"[^>]*>/g, (tag, key) =>
    tag.replace('data-rapier-asset="' + key + '"', /\btitle="/.test(tag) ? 'src="' + attributeText(urls.get(key)) + '"' :
      'data-rapier-asset="' + references.get(key) + '"'));
  html = replaceImages(html);
  if (rejectedHtml !== null) rejectedHtml = replaceImages(rejectedHtml);
  if (html.length > ARCHIVE_LIMITS.bytes || new Blob([html]).size > ARCHIVE_LIMITS.bytes) return fail('Converted DOCX exceeds the 25 MB document limit.');
  for (const thread of comments.threads) for (const message of thread.messages)
    message.html = replaceImages(message.html);
  const mathFences = {marker: '\uFFFERapierWordMathFence\uFFFF', tails: []};
  while ([html, rejectedHtml, base].some(value => typeof value === 'string' && value.includes(mathFences.marker))) mathFences.marker += 'x';
  const guardMathFences = value => value.replace(/<span class="math-rendered" data-math-src="([^"]*)">[\s\S]*?<\/span>/g, (whole, encoded) => {
    const source = decodeURIComponent(encoded);
    const tail = /[ \t]+$/.exec(source)?.[0];
    if (!tail || !mathSourceParts(source)) return whole;
    if (mathFences.tails.length >= DOCX_LIMITS.elements) return fail('DOCX contains too many fenced equations.');
    const marker = mathFences.marker + mathFences.tails.length + mathFences.marker;
    mathFences.tails.push(tail);
    return whole + sourceToken('\n' + marker, marker);
  });
  html = guardMathFences(html);
  if (rejectedHtml !== null) rejectedHtml = guardMathFences(rejectedHtml);
  if (mathFences.tails.length && (html.length > ARCHIVE_LIMITS.bytes || new Blob([html]).size > ARCHIVE_LIMITS.bytes)) return fail('Converted DOCX exceeds the 25 MB document limit.');
  const acceptedHtml = html;
  for (const row of revisions) for (const edge of ['S', 'E']) html = html.split(sourceToken(reviewMarker + row.id + edge + reviewMarker)).join('');
  progress(1, 'complete');
  return {html, warnings: [...warnings], stats, ...(comments.threads.length ? {comments} : {}),
    ...(wordStyle ? {wordStyle} : {}), ...(revisions.length ? {review: {marker: reviewMarker, changes: revisions, html: rejectedHtml, acceptedHtml}} : {}),
    ...(mathFences.tails.length ? {mathFences} : {}),
    ...(fontAssets.length ? {fontAssets} : {}),
    ...(nativeLanguage ? {language: nativeLanguage} : {}), ...(mainfont ? {mainfont} : {}), ...(base !== null ? {base} : {})};
  } finally { files.close(); }
}

function docxSourceBlocks(text, env = {}) {
  let parser;
  try { parser = markdownParser(); } catch (_) { return null; }
  const offset = frontMatterFrame(text).closing?.next ?? 0, body = text.slice(offset), starts = [0], ends = [];
  for (const end of body.matchAll(/\r\n|\r|\n/g)) { starts.push(end.index + end[0].length); ends.push(end.index); }
  starts.push(body.length + 1);
  const tokens = parser.parse(body, env), result = [], recordAbbreviations = !!env.abbreviations || /<abbr\b/i.test(body);
  for (let at = 0; at < tokens.length; at++) {
    const open = tokens[at];
    if (open.level !== 0 || !open.map) continue;
    let end = at;
    for (let depth = 0; end < tokens.length; end++) if ((depth += tokens[end].nesting) <= 0) break;
    const parts = [], words = [], references = [], abbreviations = [], abbreviationText = [], abbreviationStack = []; let linkDepth = 0;
    const flush = () => { if (words.length) parts.push(words.join('').replace(/\s+/g, ' ').trim()); words.length = 0; };
    const visit = token => {
      if (token.type === 'link_open') linkDepth++;
      else if (token.type === 'link_close') linkDepth--;
      if (linkDepth && token.type === 'html_inline' && /^<\/?u>$/.test(token.content)) return;
      const abbreviation = token.type === 'html_inline' && /^<abbr\s+title=(?:"([^"]*)"|'([^']*)')\s*>$/i.exec(token.content);
      if (token.type === 'abbr_open' || abbreviation) {
        flush();
        const title = abbreviation ? (abbreviation[1] ?? abbreviation[2]).replace(/&(?:#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]+);/gi,
          entity => parser.utils.unescapeAll(entity)) : token.attrGet('title');
        parts.push('abbr_open\u0000' + title);
        abbreviationStack.push({title, text: '', definition: !abbreviation});
        return;
      }
      if (token.type === 'abbr_close' || token.type === 'html_inline' && /^<\/abbr\s*>$/i.test(token.content)) {
        flush(); parts.push('abbr_close');
        const opened = abbreviationStack.pop();
        if (opened?.definition) abbreviations.push({label: opened.text, title: opened.title});
        return;
      }
      // An escaped character is the character (markdown-it's text_special, Rapier's own rapier_escape).
      if (['text', 'text_special', 'rapier_escape', 'softbreak'].includes(token.type)) {
        const text = token.type === 'softbreak' ? ' ' : token.content;
        words.push(text);
        if (recordAbbreviations) abbreviationText.push({text, title: abbreviationStack.at(-1)?.title ?? null});
        for (const opened of abbreviationStack) opened.text += text;
        return;
      }
      flush();
      const definition = token.type === 'reference_definition' ? token.meta?.mdImageDefinition : null;
      if (['image', 'link_open'].includes(token.type) && token.meta?.label) references.push(token.meta.label);
      parts.push([token.type, token.tag, token.hidden, token.info, token.attrGet?.('href'), token.attrGet?.('src'), token.attrGet?.('title'),
        definition ? token.meta.label : '', definition?.href, definition?.title, token.children ? '' : token.content].join('\u0000'));
      if (token.children) { token.children.forEach(visit); flush(); }
    };
    tokens.slice(at, end + 1).forEach(visit); flush();
    const start = offset + starts[open.map[0]], stop = offset + (ends[open.map[1] - 1] ?? body.length), raw = text.slice(start, stop);
    const inlineTokens = tokens.slice(at, end + 1).flatMap(token => token.children || [token]);
    const links = inlineTokens.filter(token => token.type === 'image' || token.type === 'link_open' && !['autolink', 'linkify'].includes(token.markup)).length;
    let inline = links <= raw.split('](').length - 1;
    if (!inline) {
      const pictures = tokens => tokens.filter(token => token.type === 'image').length;
      inline = pictures(parser.parseInline(raw, {}).flatMap(token => token.children || [token])) === pictures(inlineTokens);
    }
    result.push({start, stop, key: parts.join('\u0001'), inline, type: open.type, references, abbreviations, abbreviationText});
    at = end;
  }
  return result;
}
function docxSourceDefinitions(text, blocks) {
  return blocks.filter(block => block.type === 'reference_definition').map(block => {
    const raw = text.slice(block.start, block.stop), label = /^ {0,3}\[((?:\\.|[^[\]\\])+)\]:/.exec(raw);
    return label && {label: label[1], text: raw.trimEnd()};
  }).filter(Boolean);
}
function docxAbbreviationDefinitions(text, blocks, env) {
  const rows = new Map(), offset = frontMatterFrame(text).closing?.next ?? 0;
  if (!env.abbreviations) return rows;
  let at = 0;
  for (const match of text.matchAll(/(^|\r\n|\r|\n)( {0,3}\*\[((?:\\.|[^\[\]\\\r\n])+)\]:([^\r\n]*))/g)) {
    const start = match.index + match[1].length;
    if (start < offset) continue;
    while (at < blocks.length && blocks[at].stop <= start) at++;
    if (at < blocks.length && blocks[at].start <= start) continue;
    const label = match[3].replace(/\\(.)/g, '$1'), title = match[4].trim();
    if (title && env.abbreviations?.[':' + label] === title && !rows.has(label)) rows.set(label, {label, title, text: match[2]});
  }
  return rows;
}
function respellDocxLinks(edited, base, baseBlocks, baseEnv, parser) {
  const editedEnv = {};
  const editedTokens = parser.parse(edited.slice(frontMatterFrame(edited).closing?.next ?? 0), editedEnv);
  const references = baseEnv.references || {}, defined = editedEnv.references || {}, key = label => parser.utils.normalizeReference(label);
  const labels = docxSourceDefinitions(base, baseBlocks).map(row => row.label).filter(label => references[key(label)] && !defined[key(label)]);
  const brackets = new Set(), inline = new Set(), full = new Set(), collapsed = new Set(), uses = new Set();
  for (const hit of base.matchAll(/\[((?:\\.|[^[\]\\\n])*)\](\(((?:\\.|[^\s()<>\\])+)|\[((?:\\.|[^[\]\\\n])*)\])?/g)) {
    const [, text, after, destination, label] = hit, next = base[hit.index + hit[0].length];
    brackets.add(text);
    if (destination !== undefined) inline.add(text + '\u0000' + destination);
    else if (label === '') { collapsed.add(text); uses.add(key(text)); }
    else if (label !== undefined) { full.add(text + '\u0000' + label); uses.add(key(label)); }
    else if (next !== ':' && !after) uses.add(key(text));
  }
  const unescape = value => value.replace(/\\([!-/:-@[-`{-~])/g, '$1');
  const offset = frontMatterFrame(edited).closing?.next ?? 0, skip = new Set(), lineOf = offset ? edited.slice(0, offset).split('\n').length - 1 : 0;
  for (const token of editedTokens) if (['fence', 'code_block', 'html_block'].includes(token.type) && token.map)
    for (let line = token.map[0]; line < token.map[1]; line++) skip.add(line + lineOf);
  const link = /(!?)\[((?:\\.|[^[\]\\\n])*)\]\(((?:\\.|[^\s()<>\\])+)(?: "((?:\\.|[^"\\\n])*)")?\)/g;
  return edited.split('\n').map((line, index) => skip.has(index) ? line : line.replace(link, (whole, bang, text, destination, title = '', at, all) => {
    if (bang || (all.slice(0, at).match(/`/g) || []).length % 2) return whole;
    const href = unescape(destination), label = title === '' ? '' : unescape(title);
    const underline = /^<u>((?:(?!<\/?u>)[\s\S])*)<\/u>$/.exec(text);
    if (underline && !brackets.has(text)) text = underline[1];
    if (inline.has(text + '\u0000' + destination)) return '[' + text + '](' + destination + (title === '' ? '' : ' "' + title + '"') + ')';
    const plain = unescape(text);
    if (!title && plain === href && /^[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>\u0000-\u001f]*$/.test(href)) return '<' + href + '>';
    if (!title && href === 'mailto:' + plain && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(plain)) return '<' + plain + '>';
    const target = parser.normalizeLink(href), matches = labels.filter(name => references[key(name)].href === target && (references[key(name)].title || '') === label && uses.has(key(name)));
    const name = matches.find(name => full.has(text + '\u0000' + name)) || matches[0];
    if (!name) return '[' + text + '](' + destination + (title === '' ? '' : ' "' + title + '"') + ')';
    const next = all[at + whole.length];
    if (key(text) === key(name) && collapsed.has(text)) return '[' + text + '][]';
    if (key(text) === key(name) && next !== '(' && next !== '[' && !full.has(text + '\u0000' + name)) return '[' + text + ']';
    return '[' + text + '][' + name + ']';
  })).join('\n');
}
function carryDocxDefinitions(merged, base, baseBlocks, env, parser, usage = merged) {
  const lower = usage.toLowerCase(), carried = new Set();
  const rows = docxSourceDefinitions(base, baseBlocks).filter(row => {
    const name = parser.utils.normalizeReference(row.label);
    if (env.references?.[name] || carried.has(name)) return false;
    const label = row.label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (!new RegExp('\\[' + label + '\\](?!:)').test(lower)) return false;
    carried.add(name); return true;
  });
  if (!rows.length) return merged;
  const tail = /\s*$/.exec(merged)[0];
  return merged.slice(0, merged.length - tail.length) + '\n\n' + rows.map(row => row.text).join('\n') + (tail.includes('\n') ? '\n' : '');
}
function docxBlockPairs(base, edited) {
  const head = [], tail = [];
  let first = 0, lastBase = base.length, lastEdited = edited.length;
  while (first < lastBase && first < lastEdited && base[first].key === edited[first].key) {
    head.push({index: first, at: first}); first++;
  }
  while (lastBase > first && lastEdited > first && base[lastBase - 1].key === edited[lastEdited - 1].key)
    tail.push({index: --lastBase, at: --lastEdited});
  const byKey = new Map(), counts = new Map();
  for (let index = first; index < lastBase; index++) {
    const key = base[index].key;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(index);
  }
  let matches = 0;
  for (let at = first; at < lastEdited; at++) {
    const key = edited[at].key;
    counts.set(key, (counts.get(key) || 0) + 1);
    matches += byKey.get(key)?.length || 0;
  }
  if (matches > 262144) {
    const n = lastBase - first, m = lastEdited - first;
    const pairs = editPairs(base.slice(first, lastBase).map(block => block.key), edited.slice(first, lastEdited).map(block => block.key),
      Math.min(512, Math.floor(1048576 / (n + m))));
    if (pairs.length) return head.concat(pairs.reverse().map(([index, at]) => ({index: index + first, at: at + first})), tail.reverse());
    for (const [key, indices] of byKey) if (indices.length !== 1 || counts.get(key) !== 1) byKey.delete(key);
  }
  const tails = [];
  for (let at = first; at < lastEdited; at++) {
    const indices = byKey.get(edited[at].key) || [];
    for (let i = indices.length - 1; i >= 0; i--) {
      const index = indices[i];
      let low = 0, high = tails.length;
      while (low < high) { const mid = (low + high) >> 1; if (tails[mid].index < index) low = mid + 1; else high = mid; }
      tails[low] = {index, at, previous: low ? tails[low - 1] : null};
    }
  }
  const middle = [];
  for (let link = tails.at(-1); link; link = link.previous) middle.push(link);
  return head.concat(middle.reverse(), tail.reverse());
}
function mergeDocxBase(edited, base) {
  let parser;
  try { parser = markdownParser(); } catch (_) { return edited; }
  const baseEnv = {}, editedEnv = {}, baseBlocks = docxSourceBlocks(base, baseEnv);
  if (!baseBlocks) return edited;
  if (edited.includes('](')) edited = respellDocxLinks(edited, base, baseBlocks, baseEnv, parser);
  const editedBlocks = docxSourceBlocks(edited, editedEnv);
  if (!editedBlocks) return edited;
  const abbreviationDefinitions = docxAbbreviationDefinitions(base, baseBlocks, baseEnv);
  for (const [label, row] of abbreviationDefinitions) if (editedEnv.abbreviations?.[':' + label] != null && editedEnv.abbreviations[':' + label] !== row.title ||
      editedBlocks.some(block => block.abbreviationText.some(run => run.text.includes(label) && run.title !== row.title))) abbreviationDefinitions.delete(label);
  const kept = baseBlocks.filter(block => block.inline && block.references.every(name => !editedEnv.references?.[name] ||
    editedEnv.references[name].href === baseEnv.references?.[name]?.href && (editedEnv.references[name].title || '') === (baseEnv.references?.[name]?.title || '')) &&
    block.abbreviations.every(row => editedEnv.abbreviations?.[':' + row.label] === row.title || abbreviationDefinitions.get(row.label)?.title === row.title));
  const pairs = docxBlockPairs(kept, editedBlocks);
  let merged = '', cursor = 0;
  const carriedAbbreviations = new Map();
  for (const {index, at} of pairs) {
    const block = editedBlocks[at], eol = /^(?:\r\n|\r|\n)/.exec(base.slice(kept[index].stop))?.[0];
    for (const row of kept[index].abbreviations) if (editedEnv.abbreviations?.[':' + row.label] == null)
      carriedAbbreviations.set(row.label, abbreviationDefinitions.get(row.label));
    merged += edited.slice(cursor, block.start) + base.slice(kept[index].start, kept[index].stop);
    cursor = block.stop;
    if (eol && edited[cursor] === '\n') { merged += eol; cursor++; }
  }
  merged = carryDocxFrontMatter(pruneDocxImageDefinitions(carryDocxDefinitions(merged + edited.slice(cursor), base, baseBlocks, editedEnv, parser), base), base);
  if (carriedAbbreviations.size) {
    const tail = /\s*$/.exec(merged)[0];
    merged = merged.slice(0, merged.length - tail.length) + '\n\n' + [...carriedAbbreviations.values()].map(row => row.text).join('\n') + (tail.includes('\n') ? '\n' : '');
  }
  merged = carryDocxSourceComments(merged, base, baseBlocks);
  return /\r\n/.test(base) && !/\r(?!\n)|(?<!\r)\n/.test(base) ? merged.replace(/\r\n|\r|\n/g, '\r\n') : merged;
}
function carryDocxFrontMatter(merged, base) {
  const saved = frontMatterFrame(base);
  if (!saved.closing) return merged;
  const own = frontMatterFrame(merged), name = line => /^([^\s:#][^:]*):/.exec(line)?.[1];
  const fields = base.slice(saved.opening.next, saved.closing.start), names = new Set(fields.split(/\r?\n|\r/).map(name).filter(Boolean));
  const added = own.closing ? merged.slice(own.opening.next, own.closing.start).split(/\r?\n|\r/).filter(line => name(line) && !names.has(name(line))) : [];
  return base.slice(0, saved.opening.next) + fields + added.map(line => line + saved.opening.eol).join('') + base.slice(saved.closing.start, saved.closing.next) +
    (own.closing ? merged.slice(own.closing.next) : saved.closing.eol + merged);
}
function pruneDocxImageDefinitions(text, base) {
  let index;
  try { index = documentAssets(text); } catch (_) { return text; }
  if (!index.blocks.length) return text;
  let remaining = '', at = 0;
  for (const row of index.blocks) { remaining += text.slice(at, row.start); at = row.end; }
  remaining = normalizeLabel(remaining + text.slice(at)).replace(/\[\s+/g, '[');
  const unused = index.blocks.filter(row => row.topLevel && !index.duplicateLabels.has(row.id) && !base.includes(row.source) &&
    !remaining.includes('[' + row.id + ']'));
  for (const row of unused.sort((a, b) => b.start - a.start)) {
    let start = row.start, end = row.end;
    while (start > 0 && /[\r\n]/.test(text[start - 1])) start--;
    if (!start) while (end < text.length && /[\r\n]/.test(text[end])) end++;
    text = text.slice(0, start) + text.slice(end);
  }
  return text;
}
function docxSourceComment(text, block) {
  if (block.type !== 'html_block') return null;
  const raw = text.slice(block.start, block.stop);
  return /<!--[\s\S]*?-->/.test(raw) && !raw.replace(/<!--[\s\S]*?-->/g, '').trim() ? raw : null;
}
function carryDocxSourceComments(merged, base, baseBlocks) {
  if (!baseBlocks.some(block => docxSourceComment(base, block))) return merged;
  const current = docxSourceBlocks(merged);
  if (!current) return merged;
  const matches = new Map(docxBlockPairs(baseBlocks, current).map(({index, at}) => [baseBlocks[index], at]));
  const reading = block => block.type !== 'reference_definition' && !docxSourceComment(base, block);
  const placed = new Map();
  for (let i = 0; i < baseBlocks.length; i++) {
    const block = baseBlocks[i], raw = docxSourceComment(base, block);
    if (!raw || matches.has(block)) continue;
    let prior = i - 1, next = i + 1;
    while (prior >= 0 && !reading(baseBlocks[prior])) prior--;
    while (next < baseBlocks.length && !reading(baseBlocks[next])) next++;
    const before = matches.get(baseBlocks[prior]), after = matches.get(baseBlocks[next]);
    const at = before != null ? current[before + 1]?.start ?? merged.length : after != null ? current[after].start : null;
    if (at == null) continue;
    const start = before != null ? current[before].stop : current[after - 1]?.stop ?? (frontMatterFrame(merged).closing?.next ?? 0);
    if (merged.slice(start, at).trim()) continue;
    let gap = base.slice(block.stop, baseBlocks[i + 1]?.start ?? base.length);
    if (gap.trim()) continue;
    if (at < merged.length && !/[\r\n]/.test(gap)) gap += '\n\n';
    if (placed.has(at)) placed.get(at).text += raw + gap;
    else {
      const prefix = before != null ? base.slice(baseBlocks[prior].stop, block.start) : null;
      const savedGap = prefix != null && !prefix.trim();
      placed.set(at, {start: savedGap ? start : at, text: (savedGap ? prefix : '') + raw + gap});
    }
  }
  for (const at of [...placed.keys()].sort((a, b) => b - a)) {
    const row = placed.get(at);
    merged = merged.slice(0, row.start) + row.text + merged.slice(at);
  }
  return merged;
}
function scopeReviewCustody(merged, plain, changes) {
  const mergedEnv = {}, plainEnv = {}, nativeBlocks = docxSourceBlocks(plain, plainEnv), savedBlocks = docxSourceBlocks(merged, mergedEnv);
  if (!nativeBlocks || !savedBlocks) return null;
  const plainBlocks = nativeBlocks.filter(block => block.type !== 'reference_definition' && !docxSourceComment(plain, block));
  const mergedBlocks = savedBlocks.filter(block => block.type !== 'reference_definition' && !docxSourceComment(merged, block));
  if (plainBlocks.length !== mergedBlocks.length) return null;
  const touches = block => changes.some(change => change.from === change.to
    ? change.from >= block.start && change.from <= block.stop
    : change.from < block.stop && change.to > block.start);
  let out = '', cursor = 0;
  const nativeUsage = changes.map(change => change.before);
  for (let i = 0; i < plainBlocks.length; i++) {
    const current = plainBlocks[i], prior = mergedBlocks[i];
    if (current.key !== prior.key) return null;
    const changed = touches(current);
    const body = changed ? plain.slice(current.start, current.stop) : merged.slice(prior.start, prior.stop);
    if (changed) nativeUsage.push(body);
    out += merged.slice(cursor, prior.start);
    out += body;
    cursor = prior.stop;
  }
  out += merged.slice(cursor);
  const usage = nativeUsage.join('\n'), normalizedUsage = normalizeLabel(usage), parser = markdownParser();
  for (const row of docxSourceDefinitions(plain, nativeBlocks)) {
    const name = parser.utils.normalizeReference(row.label), current = mergedEnv.references?.[name], native = plainEnv.references?.[name];
    if (current && native && (current.href !== native.href || (current.title || '') !== (native.title || '')) &&
        normalizedUsage.includes('[' + normalizeLabel(row.label) + ']')) return null;
  }
  return carryDocxDefinitions(out, plain, nativeBlocks, mergedEnv, parser, usage);
}

function finishDocxText(source, result, {convertHtml} = {}) {
  if (typeof result?.canonical === 'string') return result.canonical;
  const finishFonts = value => {
    if (!result?.fontAssets?.length) return value;
    const usage = new Set([...documentFontUsage(value).keys()].map(name => name.toLowerCase()));
    return writeFontAssets(value, result.fontAssets.filter(font => usage.has(font.family.toLowerCase())));
  };
  const language = languageTag(result?.language), settings = readDocumentSettings(source);
  const fields = (language && !settings.lang ? 'lang: ' + language + '\n' : '') + (result?.mainfont && !settings.mainfont ? 'mainfont: ' + result.mainfont + '\n' : '');
  if (fields && typeof source === 'string') {
    const frame = frontMatterFrame(source);
    source = frame.closing ? source.slice(0, frame.closing.start) + fields + source.slice(frame.closing.start) : '---\n' + fields + '---\n\n' + source;
  }
  if (typeof result?.base === 'string' && typeof source === 'string') source = mergeDocxBase(source, result.base);
  const review = result?.comments;
  if (!review?.threads.length) return finishFonts(source);
  if (typeof source !== 'string' || typeof convertHtml !== 'function') throw new TypeError('docx_comments_writer_required');
  const events = [], ranges = new Map();
  for (const thread of review.threads) {
    const range = {};
    if (thread.document) { ranges.set(thread, range); continue; }
    for (const [edge, suffix] of [['start','S'], ['end','E']]) {
      const token = review.marker + thread.wordId + suffix + review.marker;
      let at = source.indexOf(token), count = 0;
      while (at !== -1) { events.push({at, token, range, edge}); count++; at = source.indexOf(token, at + token.length); }
      if (count !== 1) range.invalid = true;
    }
    ranges.set(thread, range);
  }
  events.sort((a, b) => a.at - b.at);
  let body = '', cursor = 0;
  for (const event of events) {
    if (event.at < cursor) return fail('DOCX comment boundaries overlap.', 'docx_comments_invalid');
    body += source.slice(cursor, event.at); event.range[event.edge] = body.length; cursor = event.at + event.token.length;
  }
  body += source.slice(cursor);
  const attached = [], fallback = [];
  for (const thread of review.threads) {
    const range = ranges.get(thread);
    const messages = thread.messages.map(({html, ...message}) => ({...message, text: convertHtml(html).trim()}));
    if (thread.document || !range.invalid && range.end > range.start) attached.push({id: thread.id, resolved: thread.resolved, messages,
      anchor: commentAnchor(thread.document ? 'document' : 'text', range.start, range.end, body, parseComments(body))});
    else fallback.push({thread, messages});
  }
  for (const {thread, messages} of fallback) {
    const label = 'docx-comment-' + thread.wordId;
    const content = messages.map(message => [message.id, convertHtml('<p>' + importedText(message.author.name) + '</p>').trim(),
      message.date || '', thread.resolved ? 'Resolved' : '', message.replyTo ? 'Reply to ' + message.replyTo : '',
      message.text].filter(Boolean).join('\n\n')).join('\n\n');
    body += (body.endsWith('\n\n') ? '' : body.endsWith('\n') ? '\n' : '\n\n') + '[^' + label + ']\n\n[^' + label + ']: ' + content.replace(/\n/g, '\n    ') + '\n';
  }
  if (fallback.length && !result.warnings.includes('Comments without an attached range became Markdown notes.'))
    result.warnings.push('Comments without an attached range became Markdown notes.');
  if (!attached.length) return finishFonts(body);
  const parsed = parseComments(body), splice = writeComments(body, [...commentThreads(body, parsed), ...attached], parsed);
  return finishFonts(body.slice(0, splice.pos) + splice.inserted + body.slice(splice.pos + splice.removed.length));
}

const WORD_SIDECAR = '\n\n' + WORD_SIDECAR_OPEN;
const wordXml = node => node ? '<' + node.nodeName + Array.from(node.attributes || [], a => ' ' + a.name + '="' + escape(a.value) + '"').join('') + '>' +
  Array.from(node.childNodes || [], n => n.nodeType === 1 ? wordXml(n) : n.nodeType === 3 ? escape(n.nodeValue ?? n.textContent) : '').join('') + '</' + node.nodeName + '>' : '';
function wordText(node) {
  if (is(node, 'w') && ['pPr','rPr','del','moveFrom'].includes(node.localName)) return '';
  if (is(node, 'w', 't') || is(node, 'w', 'delText')) return node.textContent;
  if (is(node, 'w', 'tab')) return '\t';
  if (is(node, 'w', 'br') || is(node, 'w', 'cr')) return '\n';
  if (is(node, 'w') && ['drawing','pict','object','footnoteReference','endnoteReference'].includes(node.localName) || is(node, 'm', 'oMath')) return '\uFFFC';
  return Array.from(node.children || [], wordText).join('');
}
function wordParagraph(node) {
  const runs = []; let text = '';
  const properties = node => {
    if (!node) return '';
    const copy = node.cloneNode(true);
    for (const part of Array.from(descendants(copy))) if (is(part, 'w') && ['sectPr','pPrChange','rPrChange','ins','del','moveFrom','moveTo'].includes(part.localName)) part.remove();
    return wordXml(copy);
  };
  const walk = parent => {
    for (const n of parent.children) {
      if (is(n, 'w') && ['del','moveFrom','pPr'].includes(n.localName)) continue;
      if (is(n, 'w', 'r')) {
        const value = wordText(n); runs.push({from: text.length, to: text.length + value.length, pr: properties(child(n, 'w', 'rPr'))}); text += value;
      } else walk(n);
    }
  };
  walk(node);
  return {text, pr: properties(child(node, 'w', 'pPr')), runs};
}
function wordPart(source, kind) {
  if (typeof source !== 'string' || source.length > DOCX_LIMITS.xmlBytes || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source))
    return fail('The carried Word template contains invalid XML.', 'docx_template_invalid');
  const xml = new DOMParser().parseFromString(source, 'application/xml'), root = xml.documentElement;
  if (!is(root, kind === 'theme' ? 'a' : 'w', kind)) return fail('The carried Word template has an invalid part.', 'docx_template_invalid');
  let count = 0;
  const walk = (node, depth) => {
    if (++count > DOCX_LIMITS.elements || depth > DOCX_LIMITS.depth || node.localName === 'parsererror' ||
        !['w','a','w14','w15','w16cid','w16cex','mc','thm15'].flatMap(key => NS[key]).includes(node.namespaceURI) ||
        /^(?:object|OLEObject|altChunk|pict|drawing|hyperlink|subDoc|attachedTemplate|control|fldSimple|fldChar|instrText|delInstrText)$/.test(node.localName) ||
        Array.from(node.attributes).some(a => NS.r.includes(a.namespaceURI) || /^(?:href|src)$/i.test(a.localName)))
      return fail('The carried Word template contains active or unsupported content.', 'docx_template_invalid');
    for (const n of node.children) walk(n, depth + 1);
  };
  walk(root, 1); return root;
}
function admitWordStyle(style) {
  wordPart(style.styles, 'styles');
  if (style.theme) wordPart(style.theme, 'theme');
  if (style.numbering) wordPart(style.numbering, 'numbering');
  if (!Array.isArray(style.paragraphs) || style.paragraphs.length > DOCX_LIMITS.paragraphs)
    return fail('The carried Word template exceeds the paragraph limit.', 'docx_template_invalid');
  let runs = 0;
  for (const p of style.paragraphs) {
    if (typeof p.text !== 'string' || !Array.isArray(p.runs)) return fail('Invalid Word style binding.', 'docx_template_invalid');
    let end = 0;
    for (const r of p.runs) {
      if (++runs > DOCX_LIMITS.elements || !Number.isSafeInteger(r.from) || !Number.isSafeInteger(r.to) ||
          r.from < end || r.to < r.from || r.to > p.text.length || typeof r.pr !== 'string')
        return fail('Invalid Word character style binding.', 'docx_template_invalid');
      end = r.to;
    }
    for (const [kind, value] of [['pPr', p.pr], ...p.runs.map(r => ['rPr', r.pr])])
      if (value) wordPart('<w:' + kind + ' xmlns:w="' + NS.w[0] + '" xmlns:w14="' + NS.w14[0] + '">' + value + '</w:' + kind + '>', kind);
  }
  return style;
}
function readWordSidecar(source) {
  const at = source.lastIndexOf(WORD_SIDECAR);
  if (at < 0) return {body: source, record: null};
  const offset = markdownBodyOffset(source), line = source.slice(offset, at + 2).split('\n').length - 1;
  if (at < offset || !markdownParser().parse(source.slice(offset), {}).some(token =>
      token.type === 'html_block' && token.level === 0 && token.map?.[0] === line)) return {body: source, record: null};
  const tail = source.slice(at + WORD_SIDECAR.length);
  if (!tail.endsWith('\n-->\n') || tail.length > ARCHIVE_LIMITS.bytes) return fail('The Word sidecar is incomplete.', 'docx_sidecar_invalid');
  let record;
  try { record = JSON.parse(tail.slice(0, -5)); } catch (_) { return fail('The Word sidecar is invalid.', 'docx_sidecar_invalid'); }
  if (!record || typeof record !== 'object' || Array.isArray(record)) return fail('The Word sidecar is invalid.', 'docx_sidecar_invalid');
  return {body: wordSplice(source, at, source.slice(at), ''), record};
}
function wordSplice(source, pos, removed, inserted) {
  const derived = commentSplices(source, [{pos, removed, inserted}]);
  let next = source.slice(0, pos) + inserted + source.slice(pos + removed.length);
  for (const row of derived) next = next.slice(0, row.pos) + row.inserted + next.slice(row.pos + row.removed.length);
  return next;
}
function writeWordSidecar(body, record) {
  const suffix = WORD_SIDECAR + JSON.stringify(record).replace(/[<>&-]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n-->\n';
  const source = wordSplice(body, body.length, '', suffix);
  if (source.length > ARCHIVE_LIMITS.bytes || utf8.encode(source).length > ARCHIVE_LIMITS.bytes) return fail('The Word sidecar exceeds the document limit.');
  return source;
}
function wordRange(from, to, map, length) {
  const start = from === map.length ? length : map[from], end = to === 0 ? 0 : map[to - 1] + 1;
  if (from === to) {
    if (start >= 0 && (from === 0 || end === start)) return [start, start];
    return null;
  }
  if (start < 0 || end - start !== to - from) return null;
  for (let i = from; i < to; i++) if (map[i] !== start + i - from) return null;
  return [start, end];
}
export function wordReview(source) {
  const {body, record} = readWordSidecar(String(source)), pending = record?.review;
  if (!pending) return {body, base: body, changes: []};
  if (typeof pending.source !== 'string' || !Array.isArray(pending.changes) || pending.changes.length > DOCX_LIMITS.elements)
    return fail('The Word review is invalid.', 'docx_revision_invalid');
  const map = alignedText(pending.source, body), ids = new Set(); let end = 0;
  const changes = pending.changes.map(row => {
    if (!row || typeof row.id !== 'string' || ids.has(row.id) || !Number.isSafeInteger(row.from) || !Number.isSafeInteger(row.to) ||
        row.from < end || row.to < row.from || row.to > pending.source.length || typeof row.before !== 'string' ||
        typeof row.author !== 'string' || row.author.length > 256 || row.date && !validCommentDate(row.date))
      return fail('The Word review contains an invalid range.', 'docx_revision_invalid');
    end = row.to; ids.add(row.id);
    const range = wordRange(row.from, row.to, map, body.length);
    return {...row, from: range?.[0] ?? row.from, to: range?.[1] ?? row.to, conflict: !range};
  });
  let base = body;
  for (const row of changes.slice().reverse()) if (!row.conflict) base = wordSplice(base, row.from, base.slice(row.from, row.to), row.before);
  return {body, base, changes};
}
export function decideWordChange(source, id, accept) {
  const {record} = readWordSidecar(source), review = wordReview(source), row = review.changes.find(row => row.id === id);
  if (!row || review.changes.some(row => row.conflict)) return fail('This Word change overlaps a later edit. Undo that edit before deciding it.', 'docx_revision_conflict');
  const body = accept ? review.body : wordSplice(review.body, row.from, review.body.slice(row.from, row.to), row.before);
  const shift = accept ? 0 : row.before.length - (row.to - row.from);
  const selected = review.changes.indexOf(row);
  const changes = review.changes.flatMap(({conflict, ...other}, index) => index === selected ? [] :
    [other.from > row.to || other.from === row.to && (row.from !== row.to || index > selected)
      ? {...other, from: other.from + shift, to: other.to + shift} : other]);
  return writeWordSidecar(body, {...record, review: {source: body, changes}});
}
function stripDecorativeLinkUnderline(record) {
  const hits = [...record.text.matchAll(/\[<u>((?:(?!<\/u>)[\s\S])*?)<\/u>\]\(/g)];
  for (const hit of hits.reverse()) {
    const openAt = hit.index + 1, closeAt = openAt + 3 + hit[1].length;
    record.text = record.text.slice(0, openAt) + hit[1] + record.text.slice(closeAt + 4);
    for (const edge of record.edges.values()) for (const key of ['S', 'E']) {
      const pos = edge[key];
      edge[key] = pos > closeAt ? pos - 7 : pos > openAt ? pos - 3 : pos;
    }
  }
}
export function finishDocxMarkdown(source, result, options = {}) {
  if (typeof result?.canonical === 'string') return result.canonical;
  const fences = result?.mathFences, unguard = text => fences && /^\uFFFERapierWordMathFence\uFFFFx*$/.test(fences.marker) &&
    Array.isArray(fences.tails) && fences.tails.length > 0 && fences.tails.length <= DOCX_LIMITS.elements && fences.tails.every(tail => typeof tail === 'string' && /^[ \t]+$/.test(tail))
    ? text.replace(new RegExp('[ \\t]*\\n[ \\t>]*' + fences.marker + '(\\d+)' + fences.marker, 'g'), (whole, index) => fences.tails[Number(index)] ?? whole) : text;
  source = unguard(source);
  if (typeof options.convertHtml === 'function') {
    const convert = options.convertHtml;
    options = {...options, convertHtml: html => unguard(convert(html))};
  }
  const strip = text => {
    const edges = new Map(), marker = result.review?.marker;
    if (!marker) return {text, edges};
    let clean = '', cursor = 0;
    const pattern = new RegExp(marker + '(\\d+)([SE])' + marker, 'g');
    for (const hit of text.matchAll(pattern)) {
      clean += text.slice(cursor, hit.index);
      const range = edges.get(hit[1]) || {}; if (range[hit[2]] != null) return fail('Repeated Word revision boundary.', 'docx_revision_invalid');
      range[hit[2]] = clean.length; edges.set(hit[1], range); cursor = hit.index + hit[0].length;
    }
    return {text: clean + text.slice(cursor), edges};
  };
  if (result.review && typeof options.convertHtml !== 'function') throw new TypeError('docx_review_writer_required');
  const accepted = strip(result.review ? options.convertHtml(result.review.acceptedHtml) + '\n' : source), finish = text => finishDocxText(text, result, options);
  const project = text => {
    let body = text;
    if (result.wordStyle) {
      const frame = frontMatterFrame(body), field = 'word-template: ' + JSON.stringify(result.wordStyle.name.replace(/[\r\n]/g, ' ')) + '\n';
      if (!/^word-template:/m.test(frame.closing ? body.slice(0, frame.closing.start) : ''))
        body = frame.closing ? body.slice(0, frame.closing.start) + field + body.slice(frame.closing.start) : '---\n' + field + '---\n\n' + body;
    }
    return finish(body);
  };
  let body = project(source);
  const record = result.wordStyle ? {style: {...result.wordStyle, source: body}} : {};
  if (result.review) {
    if (typeof options.convertHtml !== 'function') throw new TypeError('docx_review_writer_required');
    const rejected = strip(options.convertHtml(result.review.html) + '\n');
    const clone = record => ({text: record.text, edges: new Map([...record.edges].map(([id, edge]) => [id, {S: edge.S, E: edge.E}]))});
    const acceptedOriginal = clone(accepted), rejectedOriginal = clone(rejected);
    const emptyParagraphs = (one, other) => {
      for (const [id, edge] of one.edges) {
        if (edge.S !== edge.E) continue;
        const peer = other.edges.get(id); if (!peer) continue;
        let at = -1;
        if ((edge.S === 0 || one.text.slice(edge.S - 2, edge.S) === '\n\n') &&
            one.text.slice(edge.E, edge.E + 2) === '\n\n' && other.text.slice(peer.E, peer.E + 2) === '\n\n') {
          at = edge.E; peer.E += 2;
        } else if (one.text.slice(edge.S - 2, edge.S) === '\n\n' && /^\n?$/.test(one.text.slice(edge.E)) &&
            other.text.slice(peer.S - 2, peer.S) === '\n\n') { at = edge.S - 2; peer.S -= 2; }
        if (at < 0) continue;
        one.text = one.text.slice(0, at) + one.text.slice(at + 2);
        for (const row of one.edges.values()) for (const key of ['S','E']) if (row[key] > at) row[key] -= Math.min(2, row[key] - at);
      }
    };
    const place = text => {
      const accepted = clone(acceptedOriginal), rejected = clone(rejectedOriginal);
      emptyParagraphs(accepted, rejected); emptyParagraphs(rejected, accepted);
      if (!text.includes('<u>')) { stripDecorativeLinkUnderline(accepted); stripDecorativeLinkUnderline(rejected); }
      const map = alignedText(accepted.text, text);
      const changes = [];
      for (const row of result.review.changes) {
        const a = accepted.edges.get(row.id), b = rejected.edges.get(row.id), range = a && wordRange(a.S, a.E, map, text.length);
        if (!range || !b || b.E < b.S) return null;
        changes.push({...row, from: range[0], to: range[1], before: rejected.text.slice(b.S, b.E)});
      }
      return changes.sort((a, b) => a.from - b.from || a.to - b.to);
    };
    let changes = place(body);
    if (!changes && typeof result.base === 'string') {
      const saved = result.base;
      result.base = undefined;
      let plain = null, retry = null;
      try { plain = project(source); retry = place(plain); }
      finally { result.base = saved; }
      const hybrid = retry && scopeReviewCustody(body, plain, retry);
      const scoped = hybrid && place(hybrid);
      if (scoped) { body = hybrid; changes = scoped; if (record.style) record.style.source = body; }
    }
    if (!changes) return fail('Word revision boundaries could not be preserved.', 'docx_revision_invalid');
    record.review = {source: body, changes};
  }
  return Object.keys(record).length ? writeWordSidecar(body, record) : body;
}

function nativeWordDocument(source) {
  const root = new DOMParser().parseFromString(source, 'application/xml').documentElement;
  if (!is(root, 'w', 'document')) return fail('Invalid native Word projection.', 'docx_review_projection');
  return root;
}
const wordParagraphs = root => Array.from(descendants(root, 'w', 'p'));
const wordOpen = node => '<' + node.nodeName + Array.from(node.attributes, a => ' ' + a.name + '="' + escape(a.value) + '"').join('') + '>';
const wordParagraphNode = inner => new DOMParser().parseFromString('<w:p ' + ['w','r','a','wp','pic','m','w14','mc'].map(key => 'xmlns:' + key + '="' + NS[key][0] + '"').join(' ') + '>' + inner + '</w:p>', 'application/xml').documentElement;
const wordStream = rows => rows.map(row => typeof row.text === 'string' ? row.text : wordText(row)).join('\u2029');
function wordMatches(before, after) {
  const a = wordStream(before), b = wordStream(after), map = alignedText(a, b), targets = [];
  let offset = 0;
  for (let index = 0; index < after.length; index++) {
    const size = (after[index].text ?? wordText(after[index])).length;
    targets.push({from: offset, to: offset + size, index}); offset += size + 1;
  }
  const matches = new Map(), quality = new Map(); offset = 0;
  for (let index = 0; index < before.length; index++) {
    const size = (before[index].text ?? wordText(before[index])).length, scores = new Map();
    for (let i = offset; i <= offset + size; i++) if (map[i] >= 0) {
      let lo = 0, hi = targets.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (targets[mid].to < map[i]) lo = mid + 1; else hi = mid; }
      const target = targets[lo];
      if (target) scores.set(target.index, (scores.get(target.index) || 0) + 1);
    }
    const best = [...scores].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > (quality.get(best[0]) || 0)) { matches.set(best[0], index); quality.set(best[0], best[1]); }
    offset += size + 1;
  }
  if (before.length === after.length) for (let i = 0; i < before.length; i++) if (!matches.has(i) && ![...matches.values()].includes(i)) matches.set(i, i);
  return matches;
}
function propertyDelta(original, before, after, kind) {
  const read = source => source ? wordPart('<w:' + kind + ' xmlns:w="' + NS.w[0] + '" xmlns:w14="' + NS.w14[0] + '">' + source + '</w:' + kind + '>', kind).firstElementChild : null;
  const key = node => node.namespaceURI + ':' + node.localName;
  const entries = node => new Map(Array.from(node?.children || [], child => [key(child), wordXml(child)]));
  const old = entries(read(original)), base = entries(read(before)), now = entries(read(after));
  const attributes = xml => new Map(Array.from(read(xml)?.attributes || [], a => [a.name, a.value]).filter(([name]) => !name.startsWith("xmlns")));
  const spacing = (name, original, before, after) => {
    const merged = attributes(original), was = attributes(before), next = attributes(after);
    for (const key of new Set([...was.keys(), ...next.keys()])) {
      if (was.get(key) === next.get(key)) continue;
      if (next.has(key)) merged.set(key, next.get(key)); else merged.delete(key);
    }
    return merged.size ? '<' + name + [...merged].map(([key, value]) => ' ' + key + '="' + escape(value) + '"').join('') + '/>' : null;
  };
  for (const name of new Set([...base.keys(), ...now.keys()])) {
    if (base.get(name) === now.get(name)) continue;
    if (name === NS.w[0] + ':spacing' && old.has(name) && base.has(name) && now.has(name)) {
      const merged = spacing('w:spacing', old.get(name), base.get(name), now.get(name));
      if (merged) old.set(name, merged); else old.delete(name);
      continue;
    }
    if (now.has(name)) old.set(name, now.get(name));
    else if (kind === 'rPr' && /:(?:b|i|strike|smallCaps|caps|vanish)$/.test(name)) old.set(name, '<w:' + name.slice(name.lastIndexOf(':') + 1) + ' w:val="0"/>');
    else old.delete(name);
  }
  return old.size ? '<w:' + kind + '>' + [...old.values()].join('') + '</w:' + kind + '>' : '';
}
function restoreWordStyle(currentXml, baselineXml, house) {
  const current = nativeWordDocument(currentXml), after = wordParagraphs(current), baseline = wordParagraphs(nativeWordDocument(baselineXml));
  const original = house.paragraphs, nativeMatches = wordMatches(original, after), baselineMatches = wordMatches(baseline, after);
  for (let index = 0; index < after.length; index++) {
    const prior = original[nativeMatches.get(index)], baselineNode = baseline[baselineMatches.get(index)], node = after[index];
    if (!prior || !baselineNode) continue;
    const actual = wordParagraph(node), projected = wordParagraph(baselineNode), originalMap = alignedText(actual.text, prior.text), baselineMap = alignedText(actual.text, projected.text);
    let at = 0, previous = prior.runs[0]; const properties = new Map();
    const runAt = (rows, pos) => rows.find(row => row.from <= pos && pos < row.to);
    const walk = parent => {
      let xml = '';
      for (const n of parent.children) {
        if (is(n, 'w', 'pPr')) continue;
        if (is(n, 'w', 'r')) {
          const text = wordText(n), start = at; at += text.length;
          if (Array.from(n.children).some(child => !is(child, 'w') || !['rPr','t','tab','br','cr'].includes(child.localName) ||
              is(child, 'w', 'br') && (attr(child, 'w', 'type') || attr(child, 'w', 'clear')))) { xml += wordXml(n); continue; }
          let buffer = '', props = null;
          const flush = () => { if (buffer) xml += '<w:r>' + props + tXml(buffer).replace(/^<w:r>|<\/w:r>$/g, ''); buffer = ''; if (props !== null) xml += '</w:r>'; };
          for (let i = 0; i < text.length; i++) {
            const origin = runAt(prior.runs, originalMap[start + i]) || previous, base = runAt(projected.runs, baselineMap[start + i]);
            const values = [origin?.pr || '', base?.pr ?? projected.runs.at(-1)?.pr ?? '', wordXml(child(n, 'w', 'rPr'))], key = JSON.stringify(values);
            if (!properties.has(key)) properties.set(key, propertyDelta(...values, 'rPr'));
            const pr = properties.get(key);
            if (pr !== props) { if (props !== null) flush(); props = pr; }
            buffer += text[i]; previous = origin;
          }
          if (props !== null) flush();
          if (!text) xml += wordXml(n);
        } else if (n.children.length && !is(n, 'm')) xml += wordOpen(n) + walk(n) + '</' + n.nodeName + '>';
        else xml += wordXml(n);
      }
      return xml;
    };
    const inner = propertyDelta(prior.pr, projected.pr, actual.pr, 'pPr') + walk(node);
    const replacement = wordParagraphNode(inner);
    node.parentNode.replaceChild(replacement, node);
  }
  return wordXml(current);
}
function wordTemplateProjection(xml, source) {
  if (readDocumentSettings(source).mainfont || [...documentFontUsage(source).keys()].some(name => name.toLowerCase() === 'geist')) return xml;
  return xml.replace(/<w:rFonts\b[^>]*\/>/g, tag =>
    ['ascii','hAnsi','eastAsia','cs'].every(name => tag.includes('w:' + name + '="Geist"')) ? '' : tag);
}
function appendWordNumbering(existing, generated) {
  const root = wordPart(existing, 'numbering'), extra = wordPart(generated, 'numbering'), maps = new Map();
  for (const [kind, attribute] of [['abstractNum','abstractNumId'], ['num','numId']]) {
    const used = new Set(children(root, 'w', kind).map(n => attr(n, 'w', attribute))), ids = new Map();
    let next = 1;
    for (const n of children(extra, 'w', kind)) {
      while (used.has(String(next))) next++;
      const id = String(next++); ids.set(attr(n, 'w', attribute), id); used.add(id);
      n.setAttributeNS(NS.w[0], 'w:' + attribute, id);
    }
    maps.set(kind, ids);
  }
  for (const n of descendants(extra, 'w', 'abstractNumId')) {
    const id = maps.get('abstractNum').get(val(n));
    if (id) n.setAttributeNS(NS.w[0], 'w:val', id);
  }
  for (const n of Array.from(extra.children)) root.appendChild(n);
  return {xml: wordXml(root), added: [...maps].flatMap(([kind, ids]) => [...ids.values()].map(id => [kind, id])),
    remap: xml => xml.replace(/(<w:numId\b[^>]*\bw:val=")([^"]+)(")/g,
    (whole, before, id, after) => before + (maps.get('num').get(id) || id) + after)};
}
function wordInlineSlice(paragraph, from, to, deleted = false) {
  if (from === to) return '';
  let at = 0;
  const walk = node => {
    if (is(node, 'w', 'pPr')) return '';
    if (is(node, 'w', 'rPr') || is(node, 'w', 'sdtPr')) return wordXml(node);
    const atom = is(node, 'w') && ['t','delText','tab','br','cr','drawing','pict','object','footnoteReference','endnoteReference'].includes(node.localName) || is(node, 'm', 'oMath');
    if (atom) {
      const text = wordText(node), start = at; at += text.length;
      if (at <= from || start >= to) return '';
      if (is(node, 'w', 't') || is(node, 'w', 'delText')) return '<w:' + (deleted ? 'delText' : 't') + ' xml:space="preserve">' + escape(text.slice(Math.max(0, from - start), to - start)) + '</w:' + (deleted ? 'delText' : 't') + '>';
      if (deleted && (is(node, 'w', 'footnoteReference') || is(node, 'w', 'endnoteReference'))) return fail('Decide changes to note references before exporting Word review.', 'docx_review_note');
      return wordXml(node);
    }
    if (!node.children.length) return !deleted && is(node, 'w') &&
      ['bookmarkStart','bookmarkEnd','commentRangeStart','commentRangeEnd','commentReference'].includes(node.localName) &&
      at >= from && (at < to || to === wordText(paragraph).length && at === to) ? wordXml(node) : '';
    const start = at, value = Array.from(node.children, walk).join('');
    if (at <= from || start >= to) return at === start && value.includes('<w:commentReference') && at === to ? wordOpen(node) + value + '</' + node.nodeName + '>' : '';
    return wordOpen(node) + value + '</' + node.nodeName + '>';
  };
  return Array.from(paragraph.children, walk).join('');
}
async function reviewRelationKeys(relsXml, entries) {
  const keys = new Map();
  if (!relsXml) return keys;
  const root = new DOMParser().parseFromString(relsXml, 'application/xml').documentElement;
  for (const relation of root.children) {
    const id = relation.getAttribute('Id'), type = relation.getAttribute('Type') || '', target = relation.getAttribute('Target') || '';
    let key = type + '\n' + target;
    if (relation.getAttribute('TargetMode') !== 'External' && type.endsWith('/image')) {
      const path = target.replace(/^\//, '');
      const file = entries.find(row => row.name === 'word/' + path);
      key = type + '\n' + (file ? await sha256(file.bytes) : 'missing');
    }
    keys.set(id, key);
  }
  return keys;
}
function reviewParagraphMarkup(node, spacing = true) {
  return Array.from(child(node, 'w', 'pPr')?.children || [])
    .filter(n => !(is(n, 'w') && ['numPr','sectPr','pStyle','outlineLvl','pageBreakBefore'].includes(n.localName)))
    .filter(n => spacing || !is(n, 'w', 'spacing'))
    .map(wordXml).join('');
}
function paragraphLineMetrics(node) {
  const spacing = child(child(node, 'w', 'pPr'), 'w', 'spacing');
  if (!spacing) return null;
  const line = attr(spacing, 'w', 'line'), rule = attr(spacing, 'w', 'lineRule');
  return line || rule ? (line || '') + '\n' + (rule || '') : null;
}
function reviewAtom(node, relKey) {
  return wordXml(node).replace(/\br:(?:embed|link|id)="([^"]*)"/g, (_, id) => 'r:ref="' + relKey(id) + '"')
    .replace(/ (?:id|name)="[^"]*"/g, '');
}
function wordReviewSigs(paragraph, relKey) {
  const sigs = [];
  const add = (text, sig) => { for (let i = 0; i < text.length; i++) sigs.push(sig); };
  const walk = (node, link, props, meaning = '') => {
    if (is(node, 'w') && ['pPr','rPr','del','moveFrom'].includes(node.localName)) return;
    if (is(node, 'w', 'hyperlink')) {
      const next = [relKey(attr(node, 'r', 'id')), attr(node, 'w', 'anchor') || '', attr(node, 'w', 'tooltip') || ''].join('\n');
      for (const childNode of node.children) walk(childNode, next, props, meaning);
      return;
    }
    if (is(node, 'w', 'sdt') && val(child(child(node, 'w', 'sdtPr'), 'w', 'tag')) === 'rapier-abbreviation') {
      const title = val(child(child(node, 'w', 'sdtPr'), 'w', 'alias')) ?? '';
      for (const childNode of child(node, 'w', 'sdtContent')?.children || []) walk(childNode, link, props, JSON.stringify([meaning, title]));
      return;
    }
    if (is(node, 'w', 'r')) {
      const pr = wordXml(child(node, 'w', 'rPr'));
      for (const childNode of node.children) walk(childNode, link, pr, meaning);
      return;
    }
    if (is(node, 'w', 't') || is(node, 'w', 'delText') || is(node, 'w', 'tab') || is(node, 'w', 'br') || is(node, 'w', 'cr')) {
      add(wordText(node), (props || '') + '\n' + (link || '') + '\n' + meaning);
      return;
    }
    if (is(node, 'w') && ['drawing','pict','object','footnoteReference','endnoteReference'].includes(node.localName) || is(node, 'm', 'oMath') || is(node, 'm', 'oMathPara')) {
      add(wordText(node), (props || '') + '\n' + (link || '') + '\n' + meaning + '\n' + reviewAtom(node, relKey));
      return;
    }
    for (const childNode of node.children || []) walk(childNode, link, props, meaning);
  };
  for (const childNode of paragraph.children) walk(childNode, '', '');
  return sigs;
}
function trackedWordXml(currentXml, beforeXml, options, review, source, projectSource, numberingXml = '', relKeys = new Map()) {
  const current = nativeWordDocument(currentXml), before = nativeWordDocument(beforeXml), a = wordParagraphs(before), b = wordParagraphs(current);
  const refuseStructure = () => fail('Decide structural changes before exporting Word review.', 'docx_review_structure');
  const numbering = numberingXml ? new DOMParser().parseFromString(numberingXml, 'application/xml').documentElement : null;
  const nativeShape = node => {
    if (!node) return null;
    if (is(node, 'w', 'numId')) {
      const num = children(numbering, 'w', 'num').find(row => attr(row, 'w', 'numId') === val(node));
      const abstract = children(numbering, 'w', 'abstractNum').find(row => attr(row, 'w', 'abstractNumId') === val(child(num, 'w', 'abstractNumId')));
      if (!num || !abstract) return refuseStructure();
      return ['numbering', Array.from(num.children).filter(row => !is(row, 'w', 'abstractNumId')).map(nativeShape),
        Array.from(abstract.children, nativeShape)];
    }
    return [node.namespaceURI, node.localName,
      Array.from(node.attributes || []).filter(a => !a.name.startsWith('xmlns')).map(a => [a.namespaceURI, a.localName, a.value]).sort(),
      Array.from(node.children || [], nativeShape), Array.from(node.childNodes || []).filter(n => n.nodeType === 3).map(n => n.textContent).join('')];
  };
  const properties = node => Array.from(child(node, 'w', 'pPr')?.children || [])
    .filter(n => is(n, 'w') && ['numPr','sectPr','pStyle','outlineLvl','pageBreakBefore'].includes(n.localName)).map(nativeShape);
  const topology = node => is(node, 'w', 'p') ? is(node.parentNode, 'w', 'body') ? null : ['p', properties(node)] :
    is(node, 'w') && ['document','body','tbl','tr','tc'].includes(node.localName)
      ? [node.localName, Array.from(node.children, topology).filter(row => row !== null)] : nativeShape(node);
  const context = node => {
    const path = [];
    for (let at = node; at.parentNode && !is(at, 'w', 'body'); at = at.parentNode) {
      if (is(at, 'w', 'p') && is(at.parentNode, 'w', 'body')) continue;
      path.push([at.localName, Array.from(at.parentNode.children).filter(n => n.localName === at.localName).indexOf(at)]);
    }
    return path;
  };
  if (JSON.stringify(topology(before)) !== JSON.stringify(topology(current)) ||
      a.length !== b.length && wordStream(a).replace(/\s/g, '') === wordStream(b).replace(/\s/g, '')) refuseStructure();
  const authors = [], stream = wordStream(b);
  const ranges = [...review.changes, ...(options.authors || [])];
  for (const row of ranges) {
    let marker = '\uFFFERapierWordAuthor\uFFFF'; while (source.includes(marker)) marker += 'x';
    const marked = source.slice(0, row.from) + marker + source.slice(row.from, row.to) + marker + source.slice(row.to);
    const projected = commentProjection(projectSource(marked).blocks).text, first = projected.indexOf(marker), last = projected.lastIndexOf(marker);
    if (first < 0 || first === last) continue;
    const clean = projected.slice(0, first) + projected.slice(first + marker.length, last) + projected.slice(last + marker.length);
    const range = wordRange(first, last - marker.length, alignedText(clean, stream), stream.length);
    if (range) authors.push({...row, from: range[0], to: range[1]});
  }
  let id = 0, offset = 0;
  const attributes = (start, end) => {
    const row = authors.find(row => row.from <= start && row.to >= end) || options;
    const author = row.author || 'Unattributed', date = row.date;
    if (typeof author !== 'string' || author.length > 256 || date && !validCommentDate(date)) return fail('Invalid Word review author.', 'docx_revision_invalid');
    return ' w:id="' + id++ + '" w:author="' + escape(author) + '"' + (date ? ' w:date="' + escape(date) + '"' : '');
  };
  const revision = (kind, value, start, end) => value ? '<w:' + kind + attributes(start, end) + '>' + value + '</w:' + kind + '>' : '';
  const pairs = []; let ai = 0, bi = 0;
  while (ai < a.length || bi < b.length) {
    if (ai < a.length && bi < b.length && wordText(a[ai]) === wordText(b[bi])) { pairs.push([ai++, bi++]); continue; }
    let anchor = null;
    for (let span = 1; span <= 32 && !anchor; span++) for (let x = 0; x <= span && !anchor; x++) {
      const y = span - x;
      if (ai + x < a.length && bi + y < b.length && wordText(a[ai + x]) === wordText(b[bi + y])) anchor = [ai + x, bi + y];
    }
    const [ae, be] = anchor || [a.length, b.length];
    while (ai < ae || bi < be) pairs.push([ai < ae ? ai++ : null, bi < be ? bi++ : null]);
  }
  for (const [oldIndex, index] of pairs) if (oldIndex !== null && index !== null &&
      (JSON.stringify(context(a[oldIndex])) !== JSON.stringify(context(b[index])) ||
       JSON.stringify(properties(a[oldIndex])) !== JSON.stringify(properties(b[index])))) refuseStructure();
  const relKey = id => relKeys.get(id) || '';
  const refuseFormat = () => fail('Decide formatting changes before exporting Word review.', 'docx_review_format');
  for (const [oldIndex, index] of pairs) if (oldIndex !== null && index !== null &&
      reviewParagraphMarkup(a[oldIndex]) !== reviewParagraphMarkup(b[index])) {
    const oldNode = a[oldIndex], newNode = b[index];
    const oldLine = paragraphLineMetrics(oldNode), newLine = paragraphLineMetrics(newNode);
    const sameWords = wordText(oldNode) === wordText(newNode);
    const spacingOnly = sameWords && reviewParagraphMarkup(oldNode, false) === reviewParagraphMarkup(newNode, false);
    if (!spacingOnly || (oldLine && newLine && oldLine !== newLine)) refuseFormat();
  }
  const paragraphMark = (node, kind, at) => {
    let props = wordXml(child(node, 'w', 'pPr')) || '<w:pPr></w:pPr>';
    const mark = '<w:' + kind + attributes(at, at) + '/>';
    return props.includes('</w:rPr>') ? props.replace('</w:rPr>', mark + '</w:rPr>') : props.replace('</w:pPr>', '<w:rPr>' + mark + '</w:rPr></w:pPr>');
  };
  const markExisting = (node, kind, at) => {
    if (!is(node, 'w', 'p')) return fail('A tracked paragraph has no preceding paragraph.', 'docx_review_structure');
    const inner = paragraphMark(node, kind, at) + Array.from(node.children).filter(n => !is(n, 'w', 'pPr')).map(wordXml).join('');
    node.parentNode.replaceChild(wordParagraphNode(inner), node);
  };
  for (let pair = 0; pair < pairs.length; pair++) {
    const [oldIndex, index] = pairs[pair], old = a[oldIndex], next = b[index];
    if (oldIndex === null || index === null) {
      const node = oldIndex === null ? next : old, kind = oldIndex === null ? 'ins' : 'del', length = wordText(node).length;
      if (!is(node.parentNode, 'w', 'body')) return fail('Decide table structure changes before exporting Word review.', 'docx_review_structure');
      const tail = pairs.slice(pair).every(row => row[kind === 'ins' ? 0 : 1] === null);
      if (tail && (!pair || pairs[pair - 1][kind === 'ins' ? 0 : 1] !== null)) {
        const preceding = next ? next.previousElementSibling : wordParagraphs(current).at(-1);
        markExisting(preceding, kind, Math.max(0, offset - 1));
      }
      const props = tail && pair === pairs.length - 1 ? wordXml(child(node, 'w', 'pPr')) : paragraphMark(node, kind, offset + (kind === 'ins' ? length : 0));
      const inner = props + revision(kind, wordInlineSlice(node, 0, length, kind === 'del'), offset, offset + (kind === 'ins' ? length : 0));
      const replacement = wordParagraphNode(inner);
      if (next) { next.parentNode.replaceChild(replacement, next); offset += length + 1; }
      else {
        const after = pairs.slice(pair + 1).find(row => row[1] !== null), following = after ? b[after[1]] : null, body = child(current, 'w', 'body');
        if (following && following.parentNode !== body) return fail('A deleted paragraph crosses a table boundary.', 'docx_review_structure');
        body.insertBefore(replacement, following || child(body, 'w', 'sectPr'));
      }
      continue;
    }
    const left = wordText(old), right = wordText(next), map = alignedText(left, right);
    const leftSig = wordReviewSigs(old, relKey), rightSig = wordReviewSigs(next, relKey);
    if (leftSig.length !== left.length || rightSig.length !== right.length) refuseFormat();
    if (!is(next.parentNode, 'w', 'body')) for (let i = 0; i < left.length; i++) if (map[i] >= 0 && leftSig[i] !== rightSig[map[i]]) refuseFormat();
    if (left === right && leftSig.every((sig, i) => sig === rightSig[i])) { offset += right.length + 1; continue; }
    let x = 0, y = 0, inner = wordXml(child(next, 'w', 'pPr'));
    const change = (toX, toY) => {
      inner += revision('del', wordInlineSlice(old, x, toX, true), offset + y, offset + y);
      const edges = [...new Set([y, toY, ...authors.flatMap(row => [row.from - offset, row.to - offset]).filter(at => at > y && at < toY)])].sort((a,b) => a-b);
      for (let i = 1; i < edges.length; i++) inner += revision('ins', wordInlineSlice(next, edges[i-1], edges[i]), offset + edges[i-1], offset + edges[i]);
    };
    while (x < left.length || y < right.length) {
      const startX = x, startY = y;
      let keep = x; while (keep < left.length && map[keep] < 0) keep++;
      let target = keep < left.length ? map[keep] : right.length;
      while (keep < left.length && target < right.length && map[keep] === target && leftSig[keep] !== rightSig[target]) { keep++; target++; }
      change(keep, target); x = keep; y = target;
      let end = x; while (end < left.length && map[end] === y + end - x && leftSig[end] === rightSig[y + end - x]) end++;
      inner += wordInlineSlice(next, y, y + end - x); y += end - x; x = end;
      if (x === startX && y === startY) refuseFormat();
    }
    change(left.length, right.length);
    const replacement = wordParagraphNode(inner);
    next.parentNode.replaceChild(replacement, next); offset += right.length + 1;
  }
  return wordXml(current);
}

export function docxPortableHtml(html, imageUrls = new Map()) {
  html = html.replace(/<span class="math-rendered" data-math-src="([^"]*)">([\s\S]*?)<\/span>/g, (_, encoded, visible) => {
    const source = decodeURIComponent(encoded);
    if (escape(source) !== visible) return fail('DOCX equation source proof does not match.', 'docx_source_token');
    return escape(source);
  });
  html = html.replace(/<span class="rapier-source-token" data-rapier-source="([^"]*)" data-rapier-visible="([^"]*)">([\s\S]*?)<\/span>/g,
    (whole, encoded, visibleEncoded, visible) => {
      const source = decodeURIComponent(encoded), shown = decodeURIComponent(visibleEncoded);
      if (escape(shown) !== visible) return fail('DOCX source token proof does not match.', 'docx_source_token');
      if (source.startsWith('`')) {
        const tokens = markdownParser().parseInline(source, {})[0]?.children;
        if (tokens?.length !== 1 || tokens[0].type !== 'code_inline' || shown !== source.replace(/[ \t]/g, '\u00a0'))
          return fail('DOCX code source proof does not match.', 'docx_source_token');
        return '<code>' + escape(tokens[0].content) + '</code>';
      }
      if (source === '\n' + shown && /^(\uFFFERapierWordMathFence\uFFFFx*)\d+\1$/.test(shown)) return '';
      if (source !== shown) return fail('DOCX source token proof does not match.', 'docx_source_token');
      return source;
    });
  html = html.replace(/<span data-md-color="(#[0-9a-f]{6})">/g, '<span style="color:$1">');
  html = html.replace(/<mark data-rapier-highlight="([a-z]+)">/g, (_, name) => '<mark style="background-color:' + HIGHLIGHT_HEX[name] + '">');
  html = html.replace(/data-rapier-asset="([^"]+)"/g, (_, reference) => {
    const url = imageUrls.get(reference);
    if (!dataImage(url)) return fail('DOCX picture conversion did not supply an embedded image.', 'docx_image_conversion');
    return 'src="' + escape(url) + '"';
  });
  return html.replace(/ data-(?:rapier|md)-[a-z-]+="[^"]*"/g, '');
}

const DOCX_HEADING_SCALE = Object.freeze([2.2, 1.75, 1.5, 1.25, 1.1, 1]);
const PNG_SIG = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);
const HIGHLIGHT_TO_DOCX = Object.freeze({...Object.fromEntries(Object.keys(DOCX_HIGHLIGHT_HEX).map(name => [name,name])), purple:'magenta', default:'yellow'});

const packDocx = entries => zipStored(entries.map(entry => ({...entry, modified: 0})), {utf8Flag: false});

function xmlBytes(text) { return utf8.encode(text); }
function isPng(bytes) { return bytes.length >= 8 && PNG_SIG.every((value, index) => bytes[index] === value); }
function isJpeg(bytes) { return bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 216; }
function pngSize(bytes) {
  if (bytes.length < 24) return {width: 1, height: 1};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {width: view.getUint32(16) || 1, height: view.getUint32(20) || 1};
}
function jpegSize(bytes) {
  try {
    const info = inspectRaster(bytes);
    return {width: info.displayWidth, height: info.displayHeight};
  } catch (_) { return {width: 1, height: 1}; }
}
function fromBase64(ascii) {
  const bin = atob(ascii), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
const animationOf = image => /^data:image\/gif;base64,/i.test(image.getAttribute('data-rapier-animation') || '') ? image.getAttribute('data-rapier-animation') : null;
function decodeDataUrl(url) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+=*)$/i.exec(String(url || '').trim());
  if (!match) return null;
  return {type: match[1].toLowerCase(), bytes: fromBase64(match[2])};
}
const INLINE_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'INS', 'DEL', 'S', 'STRIKE', 'MARK', 'CODE', 'A', 'SPAN', 'SUB', 'SUP', 'ABBR', 'IMG', 'INPUT', 'BR', 'KBD', 'SAMP', 'SMALL', 'MATH', 'math']);
const wordFamily = value => {
  const family = normalizeFontFamily(value);
  if (!family) return null;
  const stack = Object.hasOwn(FONT_STACKS, family.toLowerCase()) ? FONT_STACKS[family.toLowerCase()] : null;
  return stack ? stack.word || 'Calibri' : family;
};
const domFontFamily = node => {
  const typed = typography.nodeStyle(node).family;
  if (typed) return wordFamily(typed.name);
  const authored = normalizeFontFamily(node.getAttribute?.('data-md-font'));
  if (authored) return wordFamily(authored);
  const css = /^\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^,]*))/.exec(node.style?.fontFamily || '');
  if (!css) return null;
  const value = (css[1] ?? css[2] ?? css[3]).replace(/\\(?:([\da-f]{1,6})\s?|([^\r\n\f]))/gi,
    (_, hex, character) => hex ? String.fromCodePoint(Math.max(1, Math.min(0x10ffff, parseInt(hex, 16)))) : character);
  return wordFamily(value);
};
const mathSourceOf = value => typeof value.source === 'string' ? value.source : (value.display ? '$$' : '$') + value.tex + (value.display ? '$$' : '$');
function mathSvgXml(node) {
  if (node.nodeType === 3) return escape(node.nodeValue).replace(/\r/g, '&#13;');
  if (node.nodeType !== 1) return '';
  const attrs = Array.from(node.attributes, attribute => ' ' + attribute.name + '="' + escape(attribute.value)
    .replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;') + '"').join('');
  return '<' + node.localName + attrs + '>' + Array.from(node.childNodes, mathSvgXml).join('') + '</' + node.localName + '>';
}
function mathRunFromDom(node, style, pointSize) {
  let source = node.textContent || '';
  const encoded = node.getAttribute('data-math-src') ?? node.getAttribute('data-rapier-math-source');
  if (encoded !== null) {
    try { source = decodeURIComponent(encoded); } catch (_) { source = encoded; }
  }
  const equation = mathSourceParts(source), display = equation?.display || false;
  const run = {...style, type: 'math', source, display};
  const toMathML = globalThis.RapierMath?.toMathML;
  if (equation && typeof toMathML === 'function') {
    try {
      const {mathml, status, errors} = toMathML(equation.tex, {displayMode: display});
      if (status === 'complete' || status === 'presentation-fallback' && errors?.every(error => ['semantic-overlay', 'semantic-table-spacing'].includes(error.code)))
        return {...run, omml: nativeEquationXml(mathmlRecord(new DOMParser().parseFromString(mathml, 'application/xml').documentElement, style))};
    } catch (_) {}
  }
  const rendered = node.querySelector('svg');
  if (!rendered) return run;
  const em = name => {
    const value = /^((?:\d+(?:\.\d*)?|\.\d+))em$/.exec(rendered.getAttribute(name) || '');
    return value ? Number(value[1]) : NaN;
  };
  const width = em('width') * pointSize * 4 / 3, height = em('height') * pointSize * 4 / 3;
  if (!validAssetDimensions(Math.ceil(width * 2), Math.ceil(height * 2)))
    return fail('This equation is too large to embed in Word.', 'docx_math_dimensions');
  const svg = rendered.cloneNode(true);
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(width * 2)); svg.setAttribute('height', String(height * 2));
  svg.setAttribute('color', style.color || '#000000');
  const depth = /^-((?:\d+(?:\.\d*)?|\.\d+))em$/.exec(svg.style?.verticalAlign || '');
  svg.removeAttribute('style');
  const alternative = svg.getAttribute('aria-label');
  svg.removeAttribute('aria-label');
  const label = escape(alternative).replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
  const text = sanitizeSvgText(mathSvgXml(svg)).replace(/^<svg(?=[\s>])/, '<svg aria-label="' + label + '"');
  if (utf8.encode(text).length > 8 * 1024 * 1024) return fail('This equation produces too much SVG to embed in Word.', 'docx_math_size');
  return {...run, svg: text, width, height, depth: depth ? Number(depth[1]) * pointSize : 0,
    ...(svg.hasAttribute('data-tex-utf16') ? {alternative: (display ? '$$' : '$') + alternative + (display ? '$$' : '$')} : {})};
}
const HIGHLIGHT_RGB = Object.freeze({green: [53, 197, 122], red: [240, 90, 98], blue: [79, 145, 247], yellow: [230, 185, 30], purple: [155, 109, 234]});
const HIGHLIGHT_HEX = Object.freeze(Object.fromEntries(Object.entries(HIGHLIGHT_RGB).map(([name, rgb]) => [name, '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('')])));
function cssColorHex(value) {
  const text = String(value || '').trim().toLowerCase();
  let m = /^#([0-9a-f]{6})$/.exec(text);
  if (m) return '#' + m[1];
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (m) return '#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(text);
  if (m) return '#' + [m[1], m[2], m[3]].map(n => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0')).join('');
  return null;
}
const FOOTNOTE_ID = /^#?(?:.*?-)??fn(?:ref)?[-:]?(.+)$/;
function footnoteTail(value) { const m = FOOTNOTE_ID.exec(String(value || '')); return m ? m[1] : null; }

function docxNavigation(blocks, firstId = 0, parent) { return finish(docxNavigationSteps(blocks, firstId, parent)); }
function* docxNavigationSteps(blocks, firstId = 0, parent) {
  const bookmarks = new Map(), targets = new Map(), links = new Set();
  const visit = function* (value) {
    yield;
    if (Array.isArray(value)) { for (const item of value) yield* visit(item); return; }
    if (!value || typeof value !== 'object') return;
    if (value.type === 'bookmarkStart') {
      const id = firstId + bookmarks.size, anchor = value.bookmark.anchor;
      const name = 'b_' + anchor.replace(/[^a-z0-9_]/gi, '_').slice(0, 28) + '_' + id;
      const mark = {id, name};
      bookmarks.set(value.bookmark, mark);
      if (!targets.has(anchor)) targets.set(anchor, mark);
    }
    if (typeof value.href === 'string' && value.href.startsWith('#')) links.add(value.href);
    for (const key of ['runs', 'items', 'header', 'rows', 'blocks']) if (value[key]) yield* visit(value[key]);
  };
  yield* visit(blocks);
  const resolve = href => {
    let anchor = href.slice(1);
    try { anchor = decodeURIComponent(anchor); } catch (_) {}
    return targets.get(anchor) || parent?.resolve(href);
  };
  return {bookmarks, resolve, unresolvedLinks: [...links].filter(href => !resolve(href)).length};
}

function commentProjection(blocks) {
  let text = ''; const slots = [];
  const leaf = (value, valueText) => {
    const start = text.length; text += valueText;
    slots.push({value, start, end: text.length});
  };
  const runs = list => {
    for (const run of list || []) {
      if (run.type === 'text') leaf(run, run.text);
      else if (run.type === 'mathml') leaf(run, run.text);
      else if (run.type === 'image') leaf(run, '\uFFFC');
      else if (run.type === 'math') leaf(run, mathSourceOf(run));
      else if (run.type === 'footnote') leaf(run, '\uFFFC');
    }
  };
  const paragraph = runList => { runs(runList); text += '\u2029'; };
  const visit = list => {
    for (const block of list || []) {
      if (block.type === 'list') for (const item of block.items) item.continuation ? visit(item.blocks) : paragraph(item.runs);
      else if (block.type === 'table') for (const row of [block.header, ...block.rows]) for (const value of row) {
        const cell = Array.isArray(value) ? {runs: value} : value;
        if (cell.blocks) visit(cell.blocks); else paragraph(cell.runs);
      }
      else if (block.blocks) visit(block.blocks);
      else if (block.type === 'image') { leaf(block, '\uFFFC'); text += '\u2029'; }
      else if (block.type === 'code') { if (block.runs) runs(block.runs); else leaf(block, block.text); text += '\u2029'; }
      else if (block.type === 'mathml') { leaf(block, block.text); text += '\u2029'; }
      else if (block.type === 'math') { leaf(block, mathSourceOf({...block, display: true})); text += '\u2029'; }
      else if (block.type !== 'will') paragraph(block.runs);
    }
  };
  visit(blocks);
  return {text, slots};
}

function alignedText(a, b) {
  const kept = new Int32Array(a.length).fill(-1), split = text => {
    const parts = []; let at = 0;
    for (const part of text.split(/[\u2029\n]/)) { parts.push({part, at}); at += part.length + 1; }
    return parts;
  };
  const pa = split(a), pb = split(b);
  const pair = (from, to, start, end) => {
    const x = a.slice(from, to), y = b.slice(start, end);
    let head = 0, tail = 0;
    while (head < x.length && head < y.length && x[head] === y[head]) kept[from + head] = start + head++;
    while (tail < x.length - head && tail < y.length - head && x[x.length - 1 - tail] === y[y.length - 1 - tail]) { tail++; kept[to - tail] = end - tail; }
    for (const [i, j] of editPairs(x.slice(head, x.length - tail), y.slice(head, y.length - tail), 512)) kept[from + head + i] = start + head + j;
  };
  let i = 0, j = 0;
  while (i < pa.length || j < pb.length) {
    if (i < pa.length && j < pb.length && pa[i].part === pb[j].part) { pair(pa[i].at, pa[i].at + pa[i].part.length + 1, pb[j].at, pb[j].at + pb[j].part.length + 1); i++; j++; continue; }
    let next = null;
    for (let span = 1; span <= 32 && !next; span++) for (let p = 0; p <= span && !next; p++) {
      const q = span - p;
      if (i + p < pa.length && j + q < pb.length && pa[i + p].part && pa[i + p].part === pb[j + q].part) next = [i + p, j + q];
    }
    next ||= [pa.length, pb.length];
    pair(pa[i]?.at ?? a.length, next[0] < pa.length ? pa[next[0]].at : a.length, pb[j]?.at ?? b.length, next[1] < pb.length ? pb[next[1]].at : b.length);
    [i, j] = next;
  }
  return kept;
}

function editPairs(a, b, limit) {
  const n = a.length, m = b.length, max = Math.min(n + m, limit), off = max + 1, trace = [], v = new Int32Array(2 * max + 3);
  if (!n || !m) return [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || k !== d && v[off + k - 1] < v[off + k + 1] ? v[off + k + 1] : v[off + k - 1] + 1, y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x < n || y < m) continue;
      const pairs = [];
      for (let step = d; step >= 0; step--) {
        const w = trace[step], at = x - y;
        const back = at === -step || at !== step && w[off + at - 1] < w[off + at + 1] ? at + 1 : at - 1;
        const px = w[off + back], py = px - back;
        while (x > px && y > py) pairs.push([--x, --y]);
        x = px; y = py;
      }
      return pairs;
    }
  }
  return [];
}

const docxRoots = new WeakMap(), docxEquations = new WeakMap();
const DOCX_LINK_COLORS = new Set(['#0563c1', '#0000ff', '#1155cc', '#000080', '#954f72', '#800080']);
const DOCX_AUTOLINK_EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const linkOpen = (href, auto, title) => '<a href="' + attributeText(href) + '"' + (title == null ? '' : ' title="' + attributeText(title) + '"') + (auto ? ' data-rapier-auto-link="autolink"' : '') + '>';
const LINK_SCHEMES = /^(?:https?:\/\/|ftps?:\/\/|mailto:|tel:|callto:|sms:|xmpp:|matrix:)/i;
function wordHyperlink(instruction) {
  const text = String(instruction || ''), tokens = [];
  for (let at = 0; at < text.length;) {
    if (/\s/.test(text[at])) { at++; continue; }
    let value = '';
    if (text[at] === '"') {
      at++;
      while (at < text.length && text[at] !== '"') {
        if (text[at] === '\\' && /["\\]/.test(text[at + 1] || '')) at++;
        value += text[at++];
      }
      if (text[at++] !== '"' || at < text.length && !/\s/.test(text[at])) return null;
    } else {
      while (at < text.length && !/\s/.test(text[at])) value += text[at++];
      if (value.includes('"')) return null;
    }
    tokens.push(value);
  }
  if (tokens.shift()?.toUpperCase() !== 'HYPERLINK') return null;
  let href = null, anchor = null, title;
  for (let at = 0; at < tokens.length; at++) {
    const token = tokens[at];
    if (/^\\[lot*]$/i.test(token)) {
      const value = tokens[++at];
      if (value == null || value.startsWith('\\')) return null;
      if (token.toLowerCase() === '\\l') anchor = value;
      if (token.toLowerCase() === '\\o') title = value;
    } else if (!/^\\[mn]$/i.test(token)) {
      if (href !== null || token.startsWith('\\')) return null;
      href = token;
    }
  }
  if (!href && anchor) return /[\u0000-\u0020\u007f]/.test(anchor) ? null : {href: '#' + anchor, title};
  if (!href || !LINK_SCHEMES.test(href)) return null;
  if (anchor) href += '#' + anchor;
  return /[\u0000-\u0020\u007f]/.test(href) ? null : {href, title};
}
const QUOTE_STEP = 528;
const DEFINITION_STYLES = {term: 'RapierTerm', detail: 'RapierDefinition'}, DEFINITION_INDENT = 720,
  DEFINITION_NAMES = {RapierTerm: 'Rapier Definition Term', RapierDefinition: 'Rapier Definition'};

function mathmlRecord(root, style = {}) {
  const namespace = 'http://www.w3.org/1998/Math/MathML', words = [];
  const variants = {normal: ['p', 'roman'], bold: ['b', 'roman'], italic: ['i', 'roman'], 'bold-italic': ['bi', 'roman'],
    'double-struck': ['p', 'double-struck'], script: ['p', 'script'], 'bold-script': ['b', 'script'],
    fraktur: ['p', 'fraktur'], 'bold-fraktur': ['b', 'fraktur'], 'sans-serif': ['p', 'sans-serif'],
    'bold-sans-serif': ['b', 'sans-serif'], 'sans-serif-italic': ['i', 'sans-serif'],
    'sans-serif-bold-italic': ['bi', 'sans-serif'], monospace: ['p', 'monospace']};
  let count = 0, scale = 1;
  const sizeRun = () => Math.abs(scale - 1) > 1e-6 ? '<w:sz w:val="@' + +scale.toFixed(4) + '"/><w:szCs w:val="@' + +scale.toFixed(4) + '"/>' : '';
  const SCRIPT_SIZES = [1, 0.7, 0.5];
  const structuralLevel = node => {
    let level = 0;
    for (let child = node, parent = node.parentNode; parent && parent.nodeType === 1; child = parent, parent = parent.parentNode) {
      if (parent.hasAttribute('scriptlevel')) return level + Number(parent.getAttribute('scriptlevel'));
      const index = Array.prototype.indexOf.call(parent.children, child);
      if (['msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover'].includes(parent.localName) && index > 0) level++;
      if (parent.localName === 'mroot' && index === 1) level += 2;
    }
    return level;
  };
  const levelScale = node => {
    const own = node.getAttribute('scriptlevel');
    if (own === null) return 1;
    if (!/^\d+$/.test(own)) return refuse('<' + node.localName + '> scriptlevel ' + own);
    return SCRIPT_SIZES[Math.min(2, Number(own))] / SCRIPT_SIZES[Math.min(2, structuralLevel(node))];
  };
  const refuse = reason => fail('DOCX cannot represent this MathML faithfully: ' + reason + '. The original equation remains in the document source.', 'docx_mathml_unsupported');
  const textRun = (text, props = '<m:sty m:val="p"/>', word = '') => '<m:r>' + (props ? '<m:rPr>' + props + '</m:rPr>' : '') + (word ? '<w:rPr>' + word + '</w:rPr>' : '') +
    '<m:t xml:space="preserve">' + escape(text) + '</m:t></m:r>';
  const named = {black: '000000', blue: '0000FF', brown: 'A52A2A', cyan: '00FFFF', darkgray: 'A9A9A9', gray: '808080', green: '008000', lightgray: 'D3D3D3',
    lime: '00FF00', magenta: 'FF00FF', olive: '808000', orange: 'FFA500', pink: 'FFC0CB', purple: '800080', red: 'FF0000', teal: '008080',
    violet: 'EE82EE', white: 'FFFFFF', yellow: 'FFFF00'};
  const color = value => {
    const v = value.trim().toLowerCase(), short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
    const hex = short ? short.slice(1).map(c => c + c).join('') : /^#[0-9a-f]{6}$/.test(v) ? v.slice(1) : Object.hasOwn(named, v) ? named[v] : null;
    return hex ? hex.toUpperCase() : refuse('color ' + value);
  };
  const declarations = (node, allowed) => {
    const out = {};
    for (const declaration of (node.getAttribute('style') || '').split(';').map(d => d.trim()).filter(Boolean)) {
      const [key, ...rest] = declaration.split(':'), property = key.trim().toLowerCase(), value = rest.join(':').trim();
      if (!allowed.includes(property)) return refuse('<' + node.localName + '> style ' + property);
      if (property === 'font-weight' && !/^(?:700|bold)$/.test(value) || property === 'font-style' && value !== 'italic' ||
        property === 'font-size' && !(/^\d*\.?\d+em$/.test(value) && parseFloat(value) > 0 && parseFloat(value) <= 10)) return refuse('<' + node.localName + '> style ' + declaration);
      out[property] = property === 'color' ? color(value) : value;
    }
    return out;
  };
  const spaces = width => {
    const em = /^(-?\d*\.?\d+)em$/.exec(width || '0em');
    if (!em) return refuse('space width ' + width);
    let w = Number(em[1]), out = '';
    if (!(w > 0)) return '';
    while (w >= 0.99) { out += '\u2003'; w -= 1; }
    return out + (w >= 0.45 ? '\u2002' : w >= 0.25 ? '\u2005' : w >= 0.2 ? '\u205f' : w >= 0.1 ? '\u2009' : '');
  };
  const NARY = /^[∑∏∐∫∬∭∮∯∰∱∲∳⋃⋂⋁⋀⨀⨁⨂⨄⨆⨌]$/u, STOP = /^[=<>≤≥≠≈≡≢∼≃≅≆∝∈∉∋⊂⊃⊆⊇⊊⊋≺≻⪯⪰∣∥⊥→←↔⇒⇐⇔⟶⟵⟹⟸⟺↦⟼,;:]$/u;
  const largeOp = node => node?.localName === 'mo' && node.getAttribute('largeop') === 'true' && NARY.test(node.textContent.trim()) ? node.textContent.trim() : null;
  const naryOf = node => ['msub', 'msup', 'msubsup', 'munder', 'mover', 'munderover'].includes(node.localName) ? largeOp(node.children[0]) : largeOp(node);
  const sequence = (elements, variant, depth, paint) => {
    let out = '';
    for (let i = 0; i < elements.length; i++) {
      const node = elements[i], chr = naryOf(node);
      if (!chr) { out += convert(node, variant, depth + 1, paint); continue; }
      let j = i + 1;
      while (j < elements.length && !(elements[j].localName === 'mo' && STOP.test(elements[j].textContent.trim()))) j++;
      const kind = node.localName, parts = Array.from(node.children), sub = {msub: 1, msubsup: 1, munder: 1, munderover: 1}[kind] ? parts[1] : null,
        sup = kind === 'msup' || kind === 'mover' ? parts[1] : kind === 'msubsup' || kind === 'munderover' ? parts[2] : null;
      if (kind !== 'mo' && parts.length !== (kind === 'msubsup' || kind === 'munderover' ? 3 : 2)) return refuse('<' + kind + '> arguments');
      out += '<m:nary><m:naryPr><m:chr m:val="' + escape(chr) + '"/><m:limLoc m:val="' + (/^mu/.test(kind) ? 'undOvr' : 'subSup') + '"/>' +
        (sub ? '' : '<m:subHide m:val="1"/>') + (sup ? '' : '<m:supHide m:val="1"/>') + '</m:naryPr>' +
        '<m:sub>' + (sub ? convert(sub, variant, depth + 1, paint) : '') + '</m:sub><m:sup>' + (sup ? convert(sup, variant, depth + 1, paint) : '') + '</m:sup>' +
        '<m:e>' + sequence(elements.slice(i + 1, j), variant, depth + 1, paint) + '</m:e></m:nary>';
      i = j - 1;
    }
    return out;
  };
  const BARS = {mover: /^[¯‾̅]$/u, munder: /^[_̲‾]$/u}, GROUPS = /^[⏞⏟⏜⏝⎴⎵→←↔⇀↼]$/u;
  const fence = (element, form) => element?.localName === 'mo' && element.getAttribute('fence') === 'true' && element.getAttribute('stretchy') === 'true' &&
    element.getAttribute('form') === form && Array.from(element.textContent.trim()).length === 1 ? element.textContent.trim() : null;
  const convert = (node, inherited = null, depth = 0, paint = null) => {
    if (++count > DOCX_LIMITS.elements || depth > DOCX_LIMITS.depth) return refuse('equation limit');
    if (node.namespaceURI !== namespace) return refuse('MathML namespace is required');
    const name = node.localName.toLowerCase(), elements = Array.from(node.children), own = node.getAttribute('mathvariant');
    const variant = own || inherited;
    if (variant && !Object.hasOwn(variants, variant)) return refuse('mathvariant=' + variant);
    const specific = {math: ['display'], mfrac: ['linethickness', 'bevelled'], mfenced: ['open', 'close', 'separators'],
      mo: ['form', 'stretchy', 'fence', 'separator', 'symmetric', 'largeop', 'movablelimits', 'lspace', 'rspace', 'minsize', 'maxsize', 'accent', 'style'],
      mi: ['style'], mn: ['style'], mtext: ['style'],
      mover: ['accent'], munder: ['accentunder'], munderover: ['accent', 'accentunder'], mspace: ['width', 'height', 'depth', 'style'],
      menclose: ['notation', 'style'],
      mstyle: ['displaystyle', 'scriptlevel', 'style'], mtable: ['columnalign', 'rowalign', 'columnspacing', 'rowspacing', 'displaystyle', 'scriptlevel', 'width', 'equalrows', 'equalcolumns'],
      mtr: ['columnalign', 'rowalign'], mtd: ['columnalign', 'rowalign', 'columnspan', 'style']}[name] || [];
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:') || attribute.name.startsWith('data-') || ['id', 'title', 'mathvariant'].includes(attribute.name) || specific.includes(attribute.name) ||
        attribute.name === 'scriptlevel' && attribute.value === '0') continue;
      return refuse('<' + name + '> attribute ' + attribute.name);
    }
    const arity = n => { if (elements.length !== n) refuse('<' + name + '> needs ' + n + ' arguments'); };
    const childrenXml = () => sequence(elements, variant, depth, paint);
    const argument = (tag, element) => '<m:' + tag + '>' + convert(element, variant, depth + 1, paint) + '</m:' + tag + '>';
    const colorRun = (paint ? '<w:color w:val="' + paint + '"/>' : '') + sizeRun();
    if (['mi', 'mn', 'mo', 'mtext'].includes(name)) {
      if (elements.length) return refuse('<' + name + '> contains elements');
      const text = node.textContent.replace(/[\t\r\n ]+/g, ' ').trim(); words.push(text);
      const own = declarations(node, ['font-weight', 'font-style']), bold = !!own['font-weight'], italic = !!own['font-style'];
      if (!variant && !style.bold && !bold && !italic && (name === 'mn' || name === 'mo') && !/\p{L}/u.test(text)) return textRun(text, '', colorRun);
      let [shape, script] = variant ? variants[variant] : [name === 'mi' && Array.from(text).length === 1 ? 'i' : 'p', 'roman'];
      if (!variant && (style.bold || bold)) shape = shape === 'i' ? 'bi' : 'b';
      if (italic) shape = shape === 'b' || shape === 'bi' ? 'bi' : 'i';
      const word = (name === 'mtext' ? (bold ? '<w:b/>' : '') + (italic ? '<w:i/>' : '') : '') + colorRun;
      return textRun(text, (name === 'mtext' ? '<m:nor/>' : '') + '<m:scr m:val="' + script + '"/><m:sty m:val="' + shape + '"/>', word);
    }
    if (Array.from(node.childNodes).some(child => child.nodeType === 3 && child.nodeValue.trim())) return refuse('text outside a MathML token');
    if (name === 'math') {
      if (node.hasAttribute('display') && !['inline', 'block'].includes(node.getAttribute('display'))) return refuse('display value');
      return childrenXml();
    }
    if (name === 'mrow') {
      const open = fence(elements[0], 'prefix'), close = fence(elements.at(-1), 'postfix');
      if (open !== null || close !== null) {
        const body = sequence(elements.slice(open === null ? 0 : 1, close === null ? elements.length : -1), variant, depth, paint);
        return '<m:d><m:dPr><m:begChr m:val="' + escape(open ?? '') + '"/><m:endChr m:val="' + escape(close ?? '') + '"/></m:dPr><m:e>' + body + '</m:e></m:d>';
      }
    }
    if (name === 'mstyle') {
      const own = declarations(node, ['color', 'font-size']), saved = scale;
      scale *= levelScale(node) * (own['font-size'] ? parseFloat(own['font-size']) : 1);
      try { return sequence(elements, variant, depth, own.color || paint); }
      finally { scale = saved; }
    }
    if (name === 'mrow') return childrenXml();
    if (name === 'menclose') {
      const notation = new Set((node.getAttribute('notation') || 'longdiv').trim().split(/\s+/)),
        known = new Set(['box', 'actuarial', 'madruwb', ...MATH_BORDER_EDGES.map(([name]) => name), ...MATH_BORDER_STRIKES.map(([name]) => name)]);
      for (const name of notation) if (!known.has(name)) return refuse('enclosure ' + name);
      if (notation.has('box')) for (const [name] of MATH_BORDER_EDGES) notation.add(name);
      if (notation.has('actuarial')) { notation.add('top'); notation.add('right'); }
      if (notation.has('madruwb')) { notation.add('bottom'); notation.add('right'); }
      const own = declarations(node, ['color', 'background']), ink = own.color || paint,
        word = (ink ? '<w:color w:val="' + ink + '"/>' : '') + (own.background ? '<w:shd w:val="clear" w:fill="' + color(own.background) + '"/>' : '') + sizeRun(),
        properties = MATH_BORDER_EDGES.filter(([name]) => !notation.has(name)).map(([, key]) => '<m:' + key + ' m:val="1"/>').join('') +
          MATH_BORDER_STRIKES.filter(([name]) => notation.has(name)).map(([, key]) => '<m:' + key + ' m:val="1"/>').join('');
      return '<m:borderBox><m:borderBoxPr>' + properties + (word ? '<m:ctrlPr><w:rPr>' + word + '</w:rPr></m:ctrlPr>' : '') +
        '</m:borderBoxPr><m:e>' + sequence(elements, variant, depth, ink) + '</m:e></m:borderBox>';
    }
    if (name === 'mspace') {
      const style = node.getAttribute('style');
      if (style && !/^margin-left:\s*-[\d.]+em;?$/.test(style.trim())) return refuse('<mspace> style');
      const text = style ? '' : spaces(node.getAttribute('width'));
      return text ? textRun(text, '', colorRun) : '';
    }
    if (name === 'munder' || name === 'mover' || name === 'munderover') {
      arity(name === 'munderover' ? 3 : 2);
      const mark = elements[1]?.localName === 'mo' ? elements[1].textContent.trim() : '';
      if (name !== 'munderover' && BARS[name].test(mark))
        return '<m:bar><m:barPr><m:pos m:val="' + (name === 'mover' ? 'top' : 'bot') + '"/></m:barPr>' + argument('e', elements[0]) + '</m:bar>';
      if (name !== 'munderover' && GROUPS.test(mark) && (elements[1].getAttribute('stretchy') === 'true' || /^[⏞⏟⏜⏝⎴⎵]$/u.test(mark)))
        return '<m:groupChr><m:groupChrPr><m:chr m:val="' + escape(mark) + '"/><m:pos m:val="' + (name === 'mover' ? 'top' : 'bot') + '"/><m:vertJc m:val="' +
          (name === 'mover' ? 'bot' : 'top') + '"/></m:groupChrPr>' + argument('e', elements[0]) + '</m:groupChr>';
      const accent = name === 'mover' && node.getAttribute('accent') === 'true' && elements[1].localName === 'mo' && Array.from(elements[1].textContent.trim()).length === 1;
      if (accent) return '<m:acc><m:accPr><m:chr m:val="' + escape(elements[1].textContent.trim()) + '"/></m:accPr>' + argument('e', elements[0]) + '</m:acc>';
      const lower = name === 'mover' ? convert(elements[0], variant, depth + 1, paint) : '<m:limLow>' + argument('e', elements[0]) + argument('lim', elements[1]) + '</m:limLow>';
      return name === 'munder' ? lower : '<m:limUpp><m:e>' + lower + '</m:e>' + argument('lim', elements[name === 'mover' ? 1 : 2]) + '</m:limUpp>';
    }
    if (name === 'semantics') {
      if (!elements.length || elements.slice(1).some(element => !['annotation', 'annotation-xml'].includes(element.localName))) return refuse('semantics alternatives');
      return convert(elements[0], variant, depth + 1, paint);
    }
    if (name === 'mfrac') {
      arity(2);
      const thickness = node.getAttribute('linethickness'), bevelled = node.getAttribute('bevelled');
      if (thickness != null && !/^(?:0(?:\.0*)?(?:px|pt|em|ex|%)?|1|medium)$/.test(thickness)) return refuse('fraction line thickness');
      if (bevelled != null && !['true', 'false'].includes(bevelled)) return refuse('bevelled value');
      const type = thickness?.startsWith('0') ? 'noBar' : bevelled === 'true' ? 'skw' : 'bar';
      if (type === 'noBar' && bevelled === 'true') return refuse('bevelled fraction without a bar');
      return '<m:f><m:fPr><m:type m:val="' + type + '"/></m:fPr>' + argument('num', elements[0]) + argument('den', elements[1]) + '</m:f>';
    }
    if (['msub', 'msup', 'msubsup'].includes(name)) {
      arity(name === 'msubsup' ? 3 : 2);
      const type = {msub: 'sSub', msup: 'sSup', msubsup: 'sSubSup'}[name];
      return '<m:' + type + '>' + argument('e', elements[0]) + (name !== 'msup' ? argument('sub', elements[1]) : '') +
        (name !== 'msub' ? argument('sup', elements[name === 'msubsup' ? 2 : 1]) : '') + '</m:' + type + '>';
    }
    if (name === 'msqrt' || name === 'mroot') {
      if (name === 'mroot') arity(2);
      const base = name === 'msqrt' ? childrenXml() : convert(elements[0], variant, depth + 1, paint);
      const degree = name === 'msqrt' ? '' : convert(elements[1], variant, depth + 1, paint);
      return '<m:rad><m:radPr><m:degHide m:val="' + (name === 'msqrt' ? '1' : '0') + '"/></m:radPr>' +
        '<m:deg>' + degree + '</m:deg><m:e>' + base + '</m:e></m:rad>';
    }
    if (name === 'mfenced') {
      const open = node.getAttribute('open') ?? '(', close = node.getAttribute('close') ?? ')';
      if (Array.from(open).length > 1 || Array.from(close).length > 1) return refuse('multi-character fence');
      const separators = Array.from((node.getAttribute('separators') ?? ',').replace(/\s/g, ''));
      const body = elements.map((element, index) => (index && separators.length ? textRun(separators[Math.min(index - 1, separators.length - 1)]) : '') +
        convert(element, variant, depth + 1, paint)).join('');
      return '<m:d><m:dPr><m:begChr m:val="' + escape(open) + '"/><m:endChr m:val="' + escape(close) + '"/></m:dPr><m:e>' + body + '</m:e></m:d>';
    }
    if (name === 'mtable') {
      const rows = elements.map(row => {
        if (row.localName !== 'mtr' || !row.children.length) return refuse('matrix row');
        const spans = Array.from(row.children, cell => {
          const value = cell.getAttribute('columnspan') ?? '1';
          if (cell.localName !== 'mtd' || !/^[1-9]\d*$/.test(value) || Number(value) > DOCX_LIMITS.tableColumns) return refuse('matrix cell span');
          return Number(value);
        });
        return {node: row, columns: spans.reduce((sum, value) => sum + value, 0), wide: spans.length === 1 && spans[0] > 1,
          partial: spans.length > 1 && spans.some(value => value > 1)};
      });
      const columns = rows[0]?.columns;
      if (!columns || columns > DOCX_LIMITS.tableColumns || rows.some(row => row.columns !== columns)) return refuse('nonrectangular matrix');
      if (rows.some(row => row.partial)) return refuse('partial matrix cell span');
      const matrix = rows => '<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="' + columns + '"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>' +
        sequence(rows.map(row => row.node), variant, depth, paint) + '</m:m>';
      const saved = scale;
      scale *= levelScale(node);
      try {
        if (!rows.some(row => row.wide)) return matrix(rows);
        let band = [], body = '';
        const flush = () => { if (band.length) { body += '<m:e>' + matrix(band) + '</m:e>'; band = []; } };
        for (const row of rows) {
          if (row.wide) { flush(); body += convert(row.node, variant, depth + 1, paint); }
          else band.push(row);
        }
        flush();
        return '<m:eqArr>' + body + '</m:eqArr>';
      }
      finally { scale = saved; }
    }
    if (name === 'mtr' && node.parentNode?.localName === 'mtable')
      return elements.length === 1 && Number(elements[0].getAttribute('columnspan')) > 1 ? childrenXml() : '<m:mr>' + childrenXml() + '</m:mr>';
    if (name === 'mtd' && node.parentNode?.localName === 'mtr') return '<m:e>' + childrenXml() + '</m:e>';
    return refuse('<' + name + '>');
  };
  if (root.localName?.toLowerCase() !== 'math') return refuse('math root is required');
  const body = convert(root), xml = '<m:oMath xmlns:m="' + NS.m[0] + '"' + (body.includes('<w:') ? ' xmlns:w="' + NS.w[0] + '"' : '') + '>' + body + '</m:oMath>';
  const record = {...style, type: 'mathml', text: words.join(''), display: root.getAttribute('display') === 'block'};
  docxEquations.set(record, record.display ? '<m:oMathPara xmlns:m="' + NS.m[0] + '"><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>' + xml + '</m:oMathPara>' : xml);
  return record;
}

function sizedEquationXml(xml, halfPoints) {
  return xml.replace(/ w:val="@([\d.]+)"/g, (_, factor) => ' w:val="' + Math.max(1, Math.min(3276, Math.round(halfPoints * Number(factor)))) + '"');
}

function nativeEquationXml(record) {
  return docxEquations.get(record) || fail('DOCX equation has no admitted MathML tree.', 'docx_mathml_unsupported');
}

function commentMessageBlocks(model) {
  const blocks = [...model.blocks];
  for (const [id, note] of model.notes) {
    const label = {type: 'text', text: '[' + id + '] ', sup: true}, content = note.blocks;
    if (content[0]?.runs) content[0].runs.unshift(label);
    else blocks.push({type: 'paragraph', runs: [label]});
    blocks.push(...content);
  }
  const flatten = value => {
    if (Array.isArray(value)) { value.forEach(flatten); return; }
    if (!value || typeof value !== 'object') return;
    if (value.type === 'footnote') Object.assign(value, {type: 'text', text: '[' + value.id + ']', sup: true});
    for (const key of ['runs', 'items', 'header', 'rows', 'blocks']) if (value[key]) flatten(value[key]);
  };
  flatten(blocks);
  return blocks;
}

function docxSourceModel(root, source, options = {}, env = {}) {
  const template = root.ownerDocument.createElement('template');
  template.innerHTML = markdownParser().render(source.slice(markdownBodyOffset(source)), env);
  for (const image of template.content.querySelectorAll('img')) {
    const id = image.getAttribute('data-rapier-asset');
    const url = id ? env.references?.[normalizeLabel(id)]?.href : image.getAttribute('data-rapier-image-url');
    if (dataImage(url)) image.setAttribute('src', url);
  }
  for (const token of template.content.querySelectorAll('.rapier-source-token--softbreak'))
    if (token.getAttribute('data-rapier-source') === '%0A') token.textContent = ' ';
  return docxBlocksFromDom(template.content, options);
}
function projectDocxComments(root, model, canonical) {
  const parsed = parseComments(canonical), threads = commentThreads(canonical, parsed);
  if (!threads.length) return model;
  const references = documentAssets(canonical).references, render = (source, env = {}) => {
    env.references = {...references};
    return docxSourceModel(root, source, {}, env);
  };
  const source = parsed.body, original = commentProjection(render(source).blocks);
  const actual = commentProjection(model.blocks);
  let marker = '\uFDD0RapierWordRange0\uFDD1';
  for (let counter = 1; source.includes(marker) || actual.text.includes(marker); counter++) marker = '\uFDD0RapierWordRange' + counter + '\uFDD1';
  const insertions = [], candidates = new Map();
  model.comments = threads.map((thread, index) => {
    const messages = thread.messages.map(message => ({...message, blocks: commentMessageBlocks(render(message.text))}));
    const review = {id: index, resolved: thread.resolved, messages, attached: false};
    const anchor = thread.anchor;
    if (anchor.status === 'attached' && anchor.kind !== 'document') {
      const start = marker + index + 'S' + marker, end = marker + index + 'E' + marker;
      candidates.set(review, {start, end});
      insertions.push({at: anchor.start, token: start}, {at: anchor.end, token: end});
    }
    return review;
  });
  if (!candidates.size) return model;
  const kept = original.text === actual.text ? null : alignedText(original.text, actual.text);
  insertions.sort((a, b) => b.at - a.at);
  let marked = source;
  for (const entry of insertions) marked = marked.slice(0, entry.at) + entry.token + marked.slice(entry.at);
  const projected = commentProjection(render(marked).blocks).text, removals = [];
  for (const [review, range] of candidates) for (const edge of ['start','end']) {
    const token = range[edge], at = projected.indexOf(token);
    if (at < 0 || projected.indexOf(token, at + token.length) !== -1) range.invalid = true;
    else removals.push({at, token, range, edge, review});
  }
  removals.sort((a, b) => a.at - b.at);
  let clean = '', cursor = 0;
  for (const entry of removals) {
    clean += projected.slice(cursor, entry.at); entry.range[entry.edge + 'At'] = clean.length; cursor = entry.at + entry.token.length;
  }
  clean += projected.slice(cursor);
  if (clean !== original.text) return model;
  for (const [review, range] of candidates) {
    if (range.invalid || range.endAt <= range.startAt) continue;
    if (kept) {
      let first = range.startAt, last = range.endAt - 1;
      while (first <= last && kept[first] < 0) first++;
      while (last >= first && kept[last] < 0) last--;
      if (first > last) continue;
      range.startAt = kept[first]; range.endAt = kept[last] + 1;
    }
    const start = actual.slots.find(slot => slot.start <= range.startAt && range.startAt < slot.end),
      end = [...actual.slots].reverse().find(slot => slot.start < range.endAt && range.endAt <= slot.end);
    if (!start || !end) continue;
    (start.value.commentEvents ||= []).push({at: range.startAt - start.start, id: review.id, start: true});
    (end.value.commentEvents ||= []).push({at: range.endAt - end.start, id: review.id, start: false});
    review.attached = true;
  }
  return model;
}

const RTL = String.raw`\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}`, RTL_LETTER = new RegExp('[' + RTL + ']', 'u');
const DIRECTION_RUNS = new RegExp(String.raw`\P{L}*(?:[R](?:[R]|\P{L})*|(?![R])\p{L}(?:(?![R])\p{L}|\P{L})*)|\P{L}+`.replaceAll('R', RTL), 'gu');
const directionRuns = text => RTL_LETTER.test(text) ? text.match(DIRECTION_RUNS) : [text];
export function docxBlocksFromDom(root, options = {}) { return finish(docxBlocksFromDomSteps(root, options)); }
export async function docxBlocksFromDomAsync(root, options = {}) { return finishAsync(docxBlocksFromDomSteps(root, options), options.work); }
function* docxBlocksFromDomSteps(root, {canonical, willTokens = [], pointSize = referenceType(typeof canonical === 'string' ? readDocumentSettings(canonical) : null).body, indentOffset = 0} = {}) {
  const blocks = [], refs = new Map(), notes = new Map();
  const directionOf = element => {
    for (let node = element; node; node = node.parentNode) {
      const value = node.getAttribute?.('dir') || node.style?.direction;
      if (value === 'rtl' || value === 'ltr') return value;
      if (value === 'auto') {
        const first = String(element.textContent || '').match(/\p{Letter}/u)?.[0];
        return first && RTL_LETTER.test(first) ? 'rtl' : 'ltr';
      }
    }
    return null;
  };
  const carriers = new Set(willTokens);
  const layoutOf = element => {
    const raw = element.tagName === 'IMG' ? element.getAttribute?.('data-rapier-image-layout') : null;
    if (raw) {
      const parsed = parseLayout(decodeLayoutAttribute(raw));
      if (parsed) return parsed;
    }
    const marker = element.getAttribute?.('data-md-layout');
    if (marker) {
      const parsed = parseLayout(decodeLayoutAttribute(marker));
      if (parsed) return parsed;
    }
    const align = element.getAttribute?.('data-md-align') || element.style?.textAlign || element.getAttribute?.('align');
    const layout = /^(?:P|H[1-6])$/.test(element.tagName) ? textLayout(element.style, {pointSize, offset: indentOffset}) : {};
    const width = element.tagName === 'IMG' ? element.getAttribute?.('width')?.trim() : null;
    if (/^\d+$/.test(width || '') && Number.isSafeInteger(+width) && +width > 0) layout.pixelWidth = +width;
    if (['left', 'center', 'right', 'justify'].includes(align)) layout.align = align;
    return Object.keys(layout).length ? layout : null;
  };
  const runsOf = function* (node, style = {}, out = [], mathPointSize = pointSize) {
    const direction = directionOf(node);
    if (direction) style = {...style, rtl: direction === 'rtl'};
    const ownFamily = domFontFamily(node);
    if (ownFamily) style = {...style, family: ownFamily};
    const typed = typography.nodeStyle(node);
    if (typed.size) style = {...style, halfPoints: typography.size(typed.size).halfPoints};
    if (typed.color) style = {...style, color: typed.color};
    const anchor = node.getAttribute?.('id') || (node.tagName === 'A' && node.getAttribute('name'));
    const bookmark = anchor ? {anchor} : null;
    if (bookmark) out.push({type: 'bookmarkStart', bookmark});
    for (const child of Array.from(node.childNodes)) {
      yield;
      if (child.nodeType === 3) {
        const value = child.previousSibling?.nodeName === 'BR' ? child.nodeValue.replace(/^\n/, '') : child.nodeValue;
        if (/^[ \r\n]*$/.test(value) && Array.from(node.children).some(part => !INLINE_TAGS.has(part.tagName))) continue;
        if (value) for (const text of directionRuns(style.code ? value.replace(/\r\n?|\n/g, ' ') : value.replace(/[ \r\n]+/g, ' '))) {
          const rtl = RTL_LETTER.test(text) ? true : style.rtl && /\p{L}/u.test(text) ? false : style.rtl;
          out.push({...style, type: 'text', text, ...(rtl == null ? {} : {rtl})});
        }
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName;
      if (child.localName?.toLowerCase() === 'math') { out.push(mathmlRecord(child, style)); continue; }
      if (tag === 'BR') { out.push({...style, type: 'text', text: '\n'}); continue; }
      if (tag === 'IMG') {
        const src = child.getAttribute('src') || '';
        if (/^data:image\//i.test(src)) out.push({...style, type: 'image', alt: child.getAttribute('alt') || '', title: child.getAttribute('title'), src, ref: null,
          layout: layoutOf(child), original: animationOf(child)});
        continue;
      }
      if (tag === 'SUP' && (child.classList.contains('footnote-ref') || FOOTNOTE_ID.test(child.querySelector('a')?.getAttribute('href') || ''))) {
        const id = footnoteTail(child.querySelector('a')?.getAttribute('href')) || child.textContent.trim();
        out.push({...style, type: 'footnote', id});
        continue;
      }
      if (tag === 'SPAN' && (child.classList.contains('math-rendered') || child.classList.contains('math-placeholder') || child.hasAttribute('data-rapier-math-source'))) {
        out.push(mathRunFromDom(child, style, mathPointSize));
        continue;
      }
      const next = {...style};
      if (child.style?.fontVariantCaps === 'small-caps' || child.style?.fontVariant === 'small-caps') next.smallCaps = true;
      if (child.hasAttribute('lang')) next.language = languageTag(child.getAttribute('lang'));
      const ink = tag === 'SPAN' ? parseInkBody(child.getAttribute('data-rapier-ink')) : null;
      if (ink?.kind === 'under') next.underline = true;
      else if (ink?.kind === 'strike') next.strike = true;
      if (tag === 'STRONG' || tag === 'B') next.bold = true;
      else if (tag === 'EM' || tag === 'I') next.italic = true;
      else if (tag === 'U' || tag === 'INS') next.underline = true;
      else if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') next.strike = true;
      else if (tag === 'CODE' || tag === 'KBD' || tag === 'SAMP') { next.code = true; next.family = null; }
      else if (tag === 'ABBR') next.abbreviation = {title: child.getAttribute('title') || ''};
      else if (tag === 'SUB') next.sub = true;
      else if (tag === 'SUP') next.sup = true;
      else if (tag === 'MARK') next.highlight = HIGHLIGHT_TO_DOCX[child.getAttribute('data-rapier-highlight')] ? child.getAttribute('data-rapier-highlight') :
        cssColorHex(child.style?.backgroundColor) || 'default';
      else if (tag === 'SPAN' && child.hasAttribute('data-md-color')) next.color = child.getAttribute('data-md-color');
      else if (tag === 'SPAN' && cssColorHex(child.style?.color)) next.color = cssColorHex(child.style.color);
      else if (tag === 'A') {
        const href = child.getAttribute('href') || '';
        if (href.startsWith('#') || LINK_SCHEMES.test(href)) { next.href = href; next.linkTitle = child.getAttribute('title'); }
      }
      if (INLINE_TAGS.has(tag)) yield* runsOf(child, next, out, mathPointSize);
      else yield* runsOf(child, style, out, mathPointSize);
    }
    if (bookmark) out.push({type: 'bookmarkEnd', bookmark});
    return out;
  };
  const codeRunsOf = node => {
    const runs = [];
    const visit = (part, inherited = {}) => {
      if (part.nodeType === 3) { if (part.nodeValue) runs.push({...inherited, type: 'text', text: part.nodeValue, code: true}); return; }
      if (part.nodeType !== 1) return;
      const style = {...inherited}, color = cssColorHex(part.style?.color), weight = part.style?.fontWeight, italic = part.style?.fontStyle;
      if (color) style.color = color;
      if (weight) style.bold = weight === 'bold' || Number(weight) >= 600;
      if (italic) style.italic = /^(?:italic|oblique)/.test(italic);
      if (/^(?:STRONG|B)$/.test(part.tagName)) style.bold = true;
      if (/^(?:EM|I)$/.test(part.tagName)) style.italic = true;
      for (const child of Array.from(part.childNodes)) visit(child, style);
    };
    visit(node);
    if (runs.length) runs.at(-1).text = runs.at(-1).text.replace(/\n$/, '');
    return runs.some(run => run.color || run.bold || run.italic) ? runs : null;
  };
  const listItems = function* (list, level, items, inheritedOffset = indentOffset) {
    const ordered = list.tagName === 'OL';
    const listOffset = textLayout(list.style, {pointSize, offset: inheritedOffset}).indent || 0;
    let start = ordered ? parseInt(list.getAttribute('start') || '1', 10) : null;
    const loose = Array.from(list.children).some(li => Array.from(li.children).some(child => child.tagName === 'P' && !child.hasAttribute('data-md-layout-tight')));
    const delimiter = list.getAttribute('data-rapier-list-delimiter') === ')' ? ')' : '.';
    for (const li of Array.from(list.children)) {
      yield;
      if (li.tagName !== 'LI') continue;
      const authored = ordered && /^\d{1,9}$/.exec(li.getAttribute('data-rapier-list-ordinal') || '');
      if (authored) start = Number(authored[0]);
      const own = (yield* cloneTree(li));
      const itemOffset = textLayout(own.style, {listMarker: true, pointSize, offset: listOffset}).marker || 0;
      const isList = child => /^(UL|OL)$/.test(child.tagName);
      const text = Array.from(own.childNodes).filter(child => !isList(child)).map(child => child.textContent || '').join('');
      const checkbox = own.querySelector('input[type="checkbox"]');
      const task = checkbox ? checkbox.checked || checkbox.hasAttribute('checked') : /^\s*[☐☒]/.test(text) ? text.trim().startsWith('☒') : null;
      let taskLength = 0;
      if (checkbox) checkbox.remove();
      else if (task != null) {
        const removeGlyph = node => {
          if (node.nodeType === 3 && /[☐☒]/.test(node.nodeValue)) {
            node.nodeValue = node.nodeValue.replace(/^\s*[☐☒]\s?/, prefix => { taskLength = prefix.length; return ''; }); return true;
          }
          return !isList(node) && Array.from(node.childNodes || []).some(removeGlyph);
        };
        Array.from(own.childNodes).some(removeGlyph);
      }
      const anchor = own.getAttribute('id');
      own.removeAttribute('id');
      let group = own.cloneNode(false), first = true;
      const begin = paragraph => {
        const runs = paragraph?.runs || [];
        if (anchor) {
          const bookmark = {anchor};
          runs.unshift({type: 'bookmarkStart', bookmark});
          runs.push({type: 'bookmarkEnd', bookmark});
        }
        const layout = {...paragraph?.layout};
        if (paragraph?.type === 'paragraph' && itemOffset && !Object.hasOwn(layout, 'marker')) layout.marker = itemOffset;
        items.push({level, ordered, task, start, ...(ordered ? {delimiter} : {}), runs, loose, layout: Object.keys(layout).length ? layout : null,
          heading: paragraph?.type === 'heading' ? paragraph.level : null,
          quote: paragraph?.type === 'quote', ...(paragraph?.type === 'quote' && paragraph.color ? {quoteColor: paragraph.color} : {}),
          direction: directionOf(li), nativeQuote: paragraph?.nativeQuote, code: paragraph?.type === 'code',
          firstLineEnd: paragraph?.firstLineEnd == null ? null : Math.max(0, paragraph.firstLineEnd - taskLength),
          initialFont: paragraph?.initialFont, initialHalfPoints: paragraph?.initialHalfPoints});
        first = false;
      };
      const flush = function* () {
        for (const fromStart of [true, false]) {
          let edge;
          while ((edge = group.childNodes[fromStart ? 0 : group.childNodes.length - 1])?.nodeType === 3 && /^[ \r\n]*$/.test(edge.nodeValue)) edge.remove();
        }
        if (!group.childNodes.length) return;
        const content = yield* nestedBlocks(group, itemOffset);
        if (first) {
          if (content[0]?.type === 'image') {
            const image = content.shift();
            begin({runs: [image]});
            if (image.caption) content.unshift({type: 'paragraph', runs: [{type: 'text', text: 'Figure: ' + image.caption, italic: true, size: 21}], layout: {align: 'center'}});
          } else if (content[0]?.type === 'code') {
            const code = content.shift(), lines = code.text.split('\n'), firstLine = lines.shift();
            const slice = (from, to) => {
              let at = 0;
              return (code.runs || [{type: 'text', text: code.text, code: true}]).flatMap(run => {
                const start = at; at += run.text.length;
                return start < to && at > from ? [{...run, text: run.text.slice(Math.max(0, from - start), to - start)}] : [];
              });
            };
            begin({type: 'code', runs: slice(0, firstLine.length)});
            if (lines.length) content.unshift({type: 'code', text: lines.join('\n'), ...(code.runs ? {runs: slice(firstLine.length + 1, code.text.length)} : {})});
          } else begin((content[0]?.type === 'paragraph' && !content[0].rule || ['heading', 'quote'].includes(content[0]?.type)) ? content.shift() : null);
        }
        if (content.length) items.push({level, continuation: true, blocks: content});
        group = own.cloneNode(false);
      };
      for (const child of Array.from(own.childNodes)) {
        if (isList(child)) {
          yield* flush();
          if (first) begin(null);
          yield* listItems(child, Math.min(8, level + 1), items, itemOffset);
        } else if (child.nodeType === 1 && !INLINE_TAGS.has(child.tagName)) {
          yield* flush(); group.appendChild(child); yield* flush();
        } else group.appendChild(child);
      }
      yield* flush();
      if (first) begin(null);
      if (ordered) start++;
    }
  };
  const nestedBlocks = function* (node, offset = indentOffset) {
    if (Array.from(node.children).some(child => !INLINE_TAGS.has(child.tagName))) {
      const nested = yield* docxBlocksFromDomSteps(node, {pointSize, indentOffset: offset});
      for (const [id, note] of nested.notes) notes.set(id, note);
      return nested.blocks;
    }
    return [{type: 'paragraph', runs: yield* runsOf(node), layout: {...layoutOf(node), ...(offset ? {indent: offset} : {})}, direction: directionOf(node)}];
  };
  const cellText = function* (cell) {
    const blocks = yield* nestedBlocks(cell), layout = layoutOf(cell);
    for (const block of blocks) if (layout?.align && !block.layout?.align) block.layout = {...block.layout, align: layout.align};
    return {blocks, colspan: integer(cell.getAttribute('colspan'), 1, 1, DOCX_LIMITS.tableColumns),
      rowspan: integer(cell.getAttribute('rowspan'), 1, 1), header: cell.tagName === 'TH'};
  };
  const elements = [];
  let inlineGroup = null;
  for (const node of Array.from(root.childNodes)) {
    yield;
    if (node.nodeType === 1 && !INLINE_TAGS.has(node.tagName)) {
      inlineGroup = null; elements.push(node);
    } else if (node.nodeType === 1 || node.nodeType === 3 && (!/^[ \r\n]*$/.test(node.nodeValue) || inlineGroup)) {
      if (!inlineGroup) {
        inlineGroup = root.ownerDocument.createElement('p');
        const direction = directionOf(root);
        if (direction) inlineGroup.setAttribute('dir', direction);
        elements.push(inlineGroup);
      }
      inlineGroup.appendChild(yield* cloneTree(node));
    }
  }
  for (const element of elements) {
      yield;
    const tag = element.tagName;
    if (element.localName?.toLowerCase() === 'math') { blocks.push(mathmlRecord(element)); continue; }
    if (tag === 'P' && !element.children.length && carriers.has(element.textContent)) {
      blocks.push({type: 'will', text: element.textContent});
      continue;
    }
    if (tag === 'SECTION' && (element.classList.contains('footnotes') || Array.from(element.querySelectorAll('li[id]')).some(li => footnoteTail(li.id)))) {
      for (const li of element.querySelectorAll('li[id]')) {
      yield;
        const clone = (yield* cloneTree(li));
        clone.querySelectorAll('a.footnote-backref, a[href*="fnref"]').forEach(a => {
          if (a.classList.contains('footnote-backref') && a.previousSibling?.nodeType === 3)
            a.previousSibling.nodeValue = a.previousSibling.nodeValue.replace(/ $/, '');
          a.remove();
        });
        notes.set(footnoteTail(li.id) || li.id, {blocks: yield* nestedBlocks(clone)});
      }
      continue;
    }
    if (tag === 'DETAILS') {
      const clone = yield* cloneTree(element), summary = Array.from(clone.children).find(node => node.tagName === 'SUMMARY');
      const runs = summary ? yield* runsOf(summary) : [];
      summary?.remove();
      blocks.push({type: 'details', runs, blocks: yield* nestedBlocks(clone)}); continue;
    }
    if (tag === 'HR' && element.classList.contains('footnotes-sep')) continue;
    if ((tag === 'DIV' || tag === 'P') && (element.getAttribute('data-md-break') === 'page' || /page-break-before\s*:\s*always/i.test(element.getAttribute('style') || '')) && !element.textContent.trim()) { blocks.push({type: 'break'}); continue; }
    if (/^H[1-6]$/.test(tag)) {
      const level = Number(tag[1]), size = Math.round(pointSize * DOCX_HEADING_SCALE[level - 1] * 2) / 2;
      blocks.push({type: 'heading', level, runs: yield* runsOf(element, {}, [], size), layout: layoutOf(element), direction: directionOf(element)}); continue;
    }
    if (tag === 'HR') { blocks.push({type: 'paragraph', runs: [], layout: null, rule: true}); continue; }
    if (tag === 'PRE') {
      const runs = codeRunsOf(element), language = (element.querySelector('code')?.getAttribute('class') || '').split(/\s+/).find(name => /^language-[^()]+$/.test(name))?.slice(9);
      blocks.push({type: 'code', text: element.textContent.replace(/\n$/, ''), ...(runs ? {runs} : {}), ...(language ? {language} : {})}); continue;
    }
    if (tag === 'BLOCKQUOTE') {
      const label = element.querySelector(':scope > p:first-child > strong:first-child');
      const kind = label && /^(Note|Tip|Important|Warning|Caution|Danger|Info): $/.test(label.textContent) ? label.textContent.slice(0, -2).toUpperCase() : null;
      const color = cssColorHex(element.style?.borderInlineStartColor);
      const decoration = {...(kind ? {kind} : {}), ...(color ? {color} : {})};
      const clone = (yield* cloneTree(element));
      if (kind) clone.querySelector(':scope > p:first-child > strong:first-child').remove();
      const content = yield* nestedBlocks(clone);
      const nativeQuote = !kind;
      if (content.length === 1 && content[0].type === 'paragraph') {
        blocks.push({...content[0], type: kind ? 'callout' : 'quote', ...decoration,
          ...(nativeQuote ? {nativeQuote: true} : {}), direction: directionOf(element)});
      } else blocks.push({type: kind ? 'callout' : 'quote', ...decoration,
        blocks: nativeQuote ? content.map(block => block.type === 'paragraph' ? {...block, type: 'quote', nativeQuote: true, quoteMember: true} : block) : content,
        direction: directionOf(element)});
      continue;
    }
    if (tag === 'DL') {
      for (const child of Array.from(element.children)) {
        yield;
        if (child.tagName === 'DT') blocks.push({type: 'paragraph', runs: yield* runsOf(child), layout: null, direction: directionOf(child), definition: 'term'});
        else if (child.tagName === 'DD') for (const block of yield* nestedBlocks(child)) blocks.push(block.type === 'paragraph' && !block.rule ? {...block, definition: 'detail'} : block);
      }
      continue;
    }
    if (tag === 'UL' || tag === 'OL') { const items = []; yield* listItems(element, 0, items); if (items.length) blocks.push({type: 'list', items}); continue; }
    if (tag === 'TABLE' || (tag === 'DIV' && element.querySelector(':scope > table'))) {
      const table = tag === 'TABLE' ? element : element.querySelector(':scope > table');
      const rows = Array.from(table.querySelectorAll('tr')).filter(row => row.closest('table') === table);
      const header = [];
      if (rows.length && Array.from(rows[0].children).some(cell => cell.tagName === 'TH'))
        for (const cell of rows[0].children) header.push(yield* cellText(cell));
      const body = [];
      for (const row of rows.slice(header.length ? 1 : 0)) {
        const cells = [];
        for (const cell of row.children) cells.push(yield* cellText(cell));
        body.push(cells); yield;
      }
      blocks.push({type: 'table', header, rows: body, caption: null});
      continue;
    }
    if (tag === 'P' && element.classList.contains('rapier-table-caption') && blocks.length && blocks[blocks.length - 1].type === 'table') {
      blocks[blocks.length - 1].caption = element.textContent.replace(/^Table:\s*/, '').trim();
      continue;
    }
    if (tag === 'P' && element.classList.contains('rapier-figure-caption') && blocks.length && blocks[blocks.length - 1].type === 'image') {
      blocks[blocks.length - 1].caption = element.textContent.replace(/^Figure:\s*/, '').trim();
      continue;
    }
    if (['P', 'DIV', 'FIGURE', 'DETAILS', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'HEADER', 'FOOTER'].includes(tag)) {
      if (tag !== 'P' && Array.from(element.children).some(child => !INLINE_TAGS.has(child.tagName))) {
        blocks.push(...(yield* nestedBlocks(element)));
        continue;
      }
      const images = element.querySelectorAll('img');
      if (images.length === 1 && !element.textContent.trim()) {
        const image = images[0], link = image.closest('a'), href = link?.getAttribute('href') || '';
        const linked = href.startsWith('#') || LINK_SCHEMES.test(href) ? {href, linkTitle: link.getAttribute('title')} : {};
        blocks.push({type: 'image', ...linked, alt: image.getAttribute('alt') || '', title: image.getAttribute('title'), src: image.getAttribute('src') || '', ref: null, layout: layoutOf(image) || layoutOf(element), original: animationOf(image),
          capHeight: integer(image.getAttribute('data-md-picture-cap-height'), null, 1),
          capTop: integer(image.getAttribute('data-md-picture-cap-top'), null)});
        continue;
      }
      const runs = yield* runsOf(element);
      const blank = runs.length === 1 && runs[0].type === 'text' && /^(?:\u00a0+|\n)$/.test(runs[0].text);
      blocks.push({type: 'paragraph', runs: blank ? [] : runs, layout: layoutOf(element), direction: directionOf(element),
        firstLineEnd: integer(element.getAttribute('data-md-first-line-end'), null),
        initialFont: wordFont(element.getAttribute('data-md-initial-font')),
        initialHalfPoints: integer(element.getAttribute('data-md-initial-size'), null, 1, 3276)});
      continue;
    }
    blocks.push({type: 'paragraph', runs: yield* runsOf(element), layout: null});
  }
  const model = {blocks, refs, notes, unresolvedLinks: (yield* docxNavigationSteps([...blocks, ...Array.from(notes.values()).flatMap(note => note.blocks || [])])).unresolvedLinks};
  docxRoots.set(model, {root, canonical});
  return typeof canonical === 'string' ? projectDocxComments(root, model, canonical) : model;
}

function rPrXml(style) {
  const bits = [];
  if (style.characterStyle) bits.push('<w:rStyle w:val="' + escape(style.characterStyle) + '"/>');
  const family = wordFamily(style.family) || style.font || (style.code ? 'Geist Mono' : '');
  if (family) bits.push(fontFamilyXml(family));
  if (style.bold) bits.push('<w:b/>');
  if (style.italic) bits.push('<w:i/>');
  if (style.underline) bits.push('<w:u w:val="single"/>');
  if (style.strike) bits.push('<w:strike/>');
  if (style.smallCaps) bits.push('<w:smallCaps/>');
  const halfPoints = style.halfPoints ?? style.size;
  if (halfPoints != null) {
    const size = Math.round(Number(halfPoints));
    if (!Number.isFinite(Number(halfPoints)) || size < 1 || size > 3276)
      return fail('DOCX cannot represent this run size in half-points.', 'docx_run_size');
    bits.push('<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/>');
  }
  if (languageTag(style.language)) bits.push('<w:lang w:val="' + languageTag(style.language) + '"/>');
  if (style.color && /^#[0-9a-f]{6}$/i.test(style.color)) bits.push('<w:color w:val="' + style.color.slice(1).toLowerCase() + '"/>');
  if (style.highlight && /^#[0-9a-f]{6}$/i.test(style.highlight)) bits.push('<w:shd w:val="clear" w:color="auto" w:fill="' + style.highlight.slice(1).toUpperCase() + '"/>');
  else if (style.highlight === 'yellow') bits.push('<w:shd w:val="clear" w:color="auto" w:fill="' + HIGHLIGHT_HEX.yellow.slice(1).toUpperCase() + '"/>');
  else if (style.highlight && HIGHLIGHT_TO_DOCX[style.highlight]) bits.push('<w:highlight w:val="' + HIGHLIGHT_TO_DOCX[style.highlight] + '"/>');
  if (style.sub) bits.push('<w:vertAlign w:val="subscript"/>');
  else if (style.sup) bits.push('<w:vertAlign w:val="superscript"/>');
  if (style.vanish) bits.push('<w:vanish/>');
  if (style.rtl != null) bits.push('<w:rtl w:val="' + (style.rtl ? '1' : '0') + '"/>');
  return bits.length ? '<w:rPr>' + bits.join('') + '</w:rPr>' : '';
}

function fontFamilyXml(family) {
  const face = escape(family);
  return '<w:rFonts w:ascii="' + face + '" w:hAnsi="' + face + '" w:eastAsia="' + face + '" w:cs="' + face + '"/>';
}

function tXml(text, style = {}) {
  return '<w:r>' + rPrXml(style) + String(text).split(/([\n\t])/).map(part => part === '\n' ? '<w:br/>' :
    part === '\t' ? '<w:tab/>' : '<w:t xml:space="preserve">' + escape(part).replace(/\r/g, '&#13;') + '</w:t>').join('') + '</w:r>';
}

function pPrXml({styleId, outline, align, numId, ilvl, vanish, borders, shading, ind, numTab, leftTab, direction, before, after, line, lineRule = 'atLeast', keepNext, hyphens, hanging, frame} = {}) {
  const bits = [];
  if (styleId) bits.push('<w:pStyle w:val="' + escape(styleId) + '"/>');
  if (keepNext) bits.push('<w:keepNext/>');
  if (frame) bits.push('<w:framePr w:dropCap="drop" w:lines="' + integer(frame, null, 1, 12) + '" w:hSpace="80" w:wrap="around" w:vAnchor="text" w:hAnchor="text"/>');
  if (numId != null) bits.push('<w:numPr><w:ilvl w:val="' + (ilvl || 0) + '"/><w:numId w:val="' + numId + '"/></w:numPr>');
  if (numTab != null) bits.push('<w:tabs><w:tab w:val="num" w:pos="' + integer(numTab, null, -2147483648) + '"/></w:tabs>');
  else if (leftTab != null) bits.push('<w:tabs><w:tab w:val="left" w:pos="' + integer(leftTab, null, -2147483648) + '"/></w:tabs>');
  if (hyphens === 'auto') bits.push('<w:suppressAutoHyphens w:val="0"/>');
  if (hanging === 'on') bits.push('<w:overflowPunct/>');
  else if (hanging === 'off') bits.push('<w:overflowPunct w:val="0"/>');
  if (align && ['left', 'right', 'center', 'both'].includes(align)) bits.push('<w:jc w:val="' + align + '"/>');
  if (direction) bits.push('<w:bidi w:val="' + (direction === 'rtl' ? '1' : '0') + '"/>');
  if (before != null || after != null || line != null) bits.push(spacingXml({before, after, line, lineRule}));
  if (ind) bits.push(ind);
  if (outline != null) bits.push('<w:outlineLvl w:val="' + outline + '"/>');
  if (vanish) bits.push('<w:rPr><w:vanish/></w:rPr>');
  if (borders) bits.push(direction === 'rtl' ? borders.replace('<w:left ', '<w:right ') : borders);
  if (shading) bits.push(shading);
  return bits.length ? '<w:pPr>' + bits.join('') + '</w:pPr>' : '';
}

function pXml(inner, props) { return '<w:p>' + pPrXml(props) + inner + '</w:p>'; }

function spacingXml({before, after, line, lineRule = 'atLeast'}) {
  const measure = value => integer(Math.round(value));
  return '<w:spacing' + (before != null ? ' w:before="' + measure(before) + '"' : '') +
    (after != null ? ' w:after="' + measure(after) + '"' : '') +
    (line != null ? ' w:line="' + measure(line) + '" w:lineRule="' + lineRule + '"' : '') + '/>';
}

function jcOf(layout) {
  const value = layout?.align;
  return value === 'justify' ? 'both' : ['left', 'right', 'center'].includes(value) ? value : null;
}

function indOf(layout, {first = true, base = 0, pointSize = referenceType(null).body, hanging = null} = {}) {
  const step = pointSize * 40;
  const left = Math.round(base + (layout?.indent || 0) * step);
  const firstLine = first && layout?.first ? Math.round(layout.first * step) : -Math.round(hanging);
  integer(left, null, -2147483648);
  integer(Math.abs(firstLine));
  if (!left && !firstLine && hanging == null) return '';
  return '<w:ind' + (left ? ' w:left="' + left + '"' : '') +
    (firstLine > 0 ? ' w:firstLine="' + firstLine + '"' : firstLine < 0 ? ' w:hanging="' + -firstLine + '"' :
      hanging != null ? ' w:hanging="0"' : '') + '/>';
}

function referenceType(settings) {
  const body = settings?.fontsize ? settings.fontsize.unit * 12 : 13.2;
  return {body, line: settings?.linestretch ? body * settings.linestretch.factor : settings?.fontsize ? body * DOCUMENT_LEADING : 21};
}

function nativeDocumentSpacing(settings, kind = 'paragraph', size = referenceType(settings).body) {
  const row = documentSpacing(settings, kind);
  return {before: Math.round(row.before * 20), after: Math.round(row.after * 20), line: Math.round(size * row.line * 20),
    lineRule: settings?.spacing?.[kind]?.line != null ? 'exact' : 'atLeast'};
}
function referenceSpacing(settings) {
  return {paragraph: nativeDocumentSpacing(settings).after, block: nativeDocumentSpacing(settings, 'list').after,
    heading: [nativeDocumentSpacing(settings, 'h1').before, nativeDocumentSpacing(settings, 'h1').after]};
}

function documentDefaultsXml(settings, hyphens) {
  if (!settings && !hyphens) return '';
  const type = referenceType(settings), half = integer(Math.max(1, Math.round(type.body * 2)));
  const run = [];
  const family = settings?.mainfont?.word || settings?.sansfont?.word || 'Geist';
  if (family) run.push(fontFamilyXml(family));
  run.push('<w:sz w:val="' + half + '"/><w:szCs w:val="' + half + '"/>');
  if (languageTag(settings?.lang)) run.push('<w:lang w:val="' + documentLanguage(settings) + '"/>');
  const spacing = spacingXml(nativeDocumentSpacing(settings));
  return '<w:docDefaults>' +
    (run.length ? '<w:rPrDefault><w:rPr>' + run.join('') + '</w:rPr></w:rPrDefault>' : '') +
    '<w:pPrDefault><w:pPr>' + (hyphens ? '<w:suppressAutoHyphens/>' : '') + spacing + '</w:pPr></w:pPrDefault>' +
    '</w:docDefaults>';
}

function sectionPropertiesXml(settings, footerId, headerId = '') {
  const base = !settings || (!settings.papersize && !settings.geometry && !footerId && !headerId);
  if (base) return '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
  const width = settings.papersize ? settings.papersize.width : 12240;
  const height = settings.papersize ? settings.papersize.height : 15840;
  const margin = settings.geometry ? settings.geometry.twips : 1440;
  const footer = (headerId ? '<w:headerReference w:type="default" r:id="' + headerId + '"/>' : '') + (footerId ? '<w:footerReference w:type="default" r:id="' + footerId + '"/>' : '');
  return '<w:sectPr>' + footer + '<w:pgSz w:w="' + width + '" w:h="' + height + '"/>' +
    '<w:pgMar w:top="' + margin + '" w:right="' + margin + '" w:bottom="' + margin + '" w:left="' + margin + '" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
}

function pageNumberFooterXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:ftr xmlns:w="' + NS.w[0] + '" xmlns:xml="http://www.w3.org/XML/1998/namespace"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>' +
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>' +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
}

function corePropertiesXml(settings) {
  if (!settings || (!settings.title && !settings.subtitle)) return null;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    (settings.title ? '<dc:title>' + escape(settings.title) + '</dc:title>' : '') +
    (settings.subtitle ? '<dc:subject>' + escape(settings.subtitle) + '</dc:subject>' : '') +
    '</cp:coreProperties>';
}

export function writeDocx(input, options = {}) { return buildDocx(input, options); }

async function buildDocx(input, {convertImage, rewriteDocument, canonical, comparison, bom = false, work, wordLayout = false} = {}, native = false) {
  check(work);
  const carriedWord = typeof canonical === 'string' ? readWordSidecar(canonical) : null;
  if (carriedWord?.record?.style) admitWordStyle(carriedWord.record.style);
  const equations = [];
  const encodeXml = text => work ? finishAsync(encodeUtf8Steps(text), work) : xmlBytes(text);
  let yieldedAt = performance.now(), emitted = 0;
  const tick = async () => {
    check(work);
    if (performance.now() - yieldedAt < 8) return;
    await pause(work); yieldedAt = performance.now();
  };
  const model = input && typeof input === 'object' && Array.isArray(input.blocks) ? input : docxBlocksFromDom(input);
  const projection = docxRoots.get(model);
  if (typeof canonical === 'string' && projection && projection.canonical !== canonical) {
    for (const {value} of commentProjection(model.blocks).slots) delete value.commentEvents;
    delete model.comments; projectDocxComments(projection.root, model, canonical); projection.canonical = canonical;
  }
  const {blocks, refs, notes} = model;
  const comments = model.comments || (typeof canonical === 'string' ? commentThreads(canonical).map((thread, id) =>
    ({id, resolved: thread.resolved, messages: thread.messages, attached: false})) : []);
  const authored = typeof canonical === 'string' ? readDocumentSettings(canonical) : null;
  const settings = wordLayout ? wordDocumentSettings(authored) : authored;
  const fonts = await writeDocxFonts(canonical, {check: () => check(work)});
  const authoredFamilies = new Set(fonts.map(font => font.family.toLowerCase()));
  const baseFamilies = new Map();
  for (const [index, font] of DOCX_FONTS.entries()) {
    if (authoredFamilies.has(font.family.toLowerCase())) continue;
    const digits = font.sha256.slice(0, 32).toUpperCase();
    const key = '{' + digits.slice(0, 8) + '-' + digits.slice(8, 12) + '-' + digits.slice(12, 16) + '-' + digits.slice(16, 20) + '-' + digits.slice(20) + '}';
    const bytes = font.read();
    const resource = {id: 'rIdBaseFont' + index, name: 'base-font' + index + '.odttf', key,
      bytes: obfuscateDocxFont(bytes, key), subsetted: false};
    const family = baseFamilies.get(font.family) || {family: font.family, embeddings: []};
    family.embeddings.push({slot: font.style, resource}); baseFamilies.set(font.family, family);
  }
  fonts.push(...baseFamilies.values());
  const carrySource = typeof canonical === 'string';
  const templatePage = carrySource && !!settings?.papersize && isTemplatePage(canonical);
  let pageBorder = null;
  const quoteDepths = new Set();
  let hyphenation = false, quotations = false, definitions = false, tableHeaderStyle = false, sourceCode = false, tableStyle = false;
  const codeLanguages = new Map();
  const bodyPointSize = referenceType(settings).body;
  const emPoints = Math.max(1, Math.round(bodyPointSize * 2)) / 2;
  const bodyFace = settings?.mainfont?.word || settings?.sansfont?.word || 'Geist';
  const lineTwips = integer(Math.max(1, Math.round(referenceType(settings).line * 20)));
  const blockSpace = referenceSpacing(settings);
  const contentWidth = (settings?.papersize?.width || 12240) - 2 * (settings?.geometry?.twips ?? 1440);
  if (contentWidth <= 0) return fail('DOCX page margins leave no text width.');
  const contentWidthEmu = contentWidth * 635;
  const navigation = await finishAsync(docxNavigationSteps([...blocks, ...Array.from(notes.values()).flatMap(note => note.blocks || [])]), work);
  const rels = [], media = [];
  let rid = 1, docPr = 1;
  const nextRid = () => 'rId' + (rid++);
  const noteMap = new Map();
  const wordNote = label => /^docx-(fn|en)-([1-9]\d{0,8})$/.exec(label), noteKind = label => wordNote(label)?.[1] === 'en' ? 'endnote' : 'footnote';
  const reservedNotes = new Set([...notes.keys()].flatMap(label => wordNote(label) ? [noteKind(label) + wordNote(label)[2]] : []));
  const usedNotes = new Set(), noteId = label => {
    const kind = noteKind(label);
    let id = wordNote(label) ? Number(wordNote(label)[2]) : 0;
    if (!id || usedNotes.has(kind + id)) for (id = 1; reservedNotes.has(kind + id) || usedNotes.has(kind + id);) id++;
    usedNotes.add(kind + id);
    return id;
  };
  const stylesRid = nextRid(), numberingRid = nextRid(), footnotesRid = nextRid();
  const fontTableRid = fonts.length ? nextRid() : '', settingsRid = fonts.length ? nextRid() : '';
  const numbering = {abstracts: [
    {id: 1, format: 'bullet', text: '•'},
    {id: 2, format: 'decimal', text: null},
    {id: 3, format: 'bullet', text: ''},
    {id: 4, format: 'decimal', text: ')'}
  ], nums: []};
  let nextNum = 1;
  const numEntries = new Map();
  const allocNum = abstract => {
    const id = nextNum++;
    const entry = {id, abstract, starts: new Map()};
    numbering.nums.push(entry);
    numEntries.set(id, entry);
    return id;
  };

  const rasterise = async (decoded, alt, drawing) => {
    if (!decoded) return fail('DOCX export needs embedded image bytes (a data URL).');
    let {bytes, type} = decoded, width, height, vector = null;
    if (type === 'image/svg+xml') {
      const source = new TextDecoder('utf-8', {fatal: true}).decode(bytes), safe = sanitizeSvgText(source);
      if (safe !== source) bytes = new TextEncoder().encode(safe);
      vector = {bytes, type, preferred: true};
      svgElements(safe, {inspect: false, visit: node => {
        if ((!node.ns || node.ns === 'http://www.w3.org/2000/svg') && ['feTurbulence', 'feDisplacementMap'].includes(node.local))
          vector.preferred = false;
      }});
    }
    const foreign = type !== 'image/png' && type !== 'image/jpeg';
    if (foreign || isJxl(bytes)) {
      if (typeof convertImage !== 'function')
        return fail('DOCX export needs a PNG preview for JPEG XL, WebP and SVG; pass convertImage.');
      const converted = await convertImage({bytes, type, alt: alt || '', drawing: drawing || type === 'image/svg+xml'});
      bytes = converted.bytes instanceof Uint8Array ? converted.bytes : new Uint8Array(converted.bytes);
      type = converted.type || 'image/png';
      width = converted.width; height = converted.height;
    }
    if (isJxl(bytes) || type === 'image/jxl')
      return fail('JPEG XL must arrive as PNG in the DOCX (picture format law).');
    const png = isPng(bytes);
    if (!png && !isJpeg(bytes)) return fail('DOCX pictures must be PNG or JPEG.');
    const size = png ? pngSize(bytes) : jpegSize(bytes);
    return {bytes, type: png ? 'image/png' : 'image/jpeg', width: width || size.width, height: height || size.height, vector};
  };

  const assetCache = new Map(), mediaByBytes = new Map();
  const registerMedia = image => {
    const key = image.type + ':' + image.bytes.length + ':' + crc32(image.bytes);
    const bucket = mediaByBytes.get(key) || [];
    let part = bucket.find(row => row.bytes.every((byte, at) => byte === image.bytes[at]));
    if (!part) {
      const id = nextRid(), extension = image.type === 'image/svg+xml' ? '.svg' : image.type === 'image/jpeg' ? '.jpeg' : image.type === 'image/gif' ? '.gif' : '.png';
      const name = 'image' + media.length + extension;
      part = {id, name, bytes: image.bytes, type: image.type};
      media.push(part); bucket.push(part); mediaByBytes.set(key, bucket);
      rels.push({id, type: 'image', target: 'media/' + name});
    }
    return part;
  };
  const assetFor = (src, alt, drawing, animation = null) => {
    const original = animation || (/^data:image\/gif;/i.test(src) ? src : null), key = src + '|' + (drawing ? '1' : '0') + '|' + (original || '');
    let promise = assetCache.get(key);
    if (!promise) {
      promise = rasterise(decodeDataUrl(src), alt, drawing).then(image => {
        const part = registerMedia(image), vector = image.vector && registerMedia(image.vector), kept = original && registerMedia(decodeDataUrl(original));
        return {id: part.id, svgId: image.vector?.preferred ? vector?.id : null, originalId: kept?.id || null, width: image.width, height: image.height};
      });
      assetCache.set(key, promise);
    }
    return promise;
  };
  const mathAssetCache = new Map();
  const mathAssetFor = run => {
    let promise = mathAssetCache.get(run.svg);
    if (!promise) {
      promise = (async () => {
        if (typeof run.svg !== 'string' || run.svg.length > 8 * 1024 * 1024 ||
            !validAssetDimensions(Math.ceil(run.width * 2), Math.ceil(run.height * 2)))
          return fail('This equation cannot be embedded in Word safely.', 'docx_math_dimensions');
        const resources = run.svg.replace(/\saria-label="[^"]*"/g, '');
        if (sanitizeSvgText(resources) !== resources)
          return fail('This equation contains an unsafe SVG resource.', 'docx_math_svg_unsafe');
        const bytes = utf8.encode(run.svg);
        if (bytes.length > 8 * 1024 * 1024) return fail('This equation produces too much SVG to embed in Word.', 'docx_math_size');
        const fallback = await rasterise({bytes, type: 'image/svg+xml'}, run.alternative || mathSourceOf(run), true);
        const raster = registerMedia(fallback), vector = registerMedia({bytes, type: 'image/svg+xml'});
        return {id: raster.id, svgId: vector.id, width: run.width, height: run.height};
      })();
      mathAssetCache.set(run.svg, promise);
    }
    return promise;
  };

  const linesEmu = lines => {
    const {body, line} = referenceType(settings);
    return ((lines - 1) * line + body * .7) * 12700;
  };
  const pictureSize = (asset, layout, availableWidth, cap = null) => {
    const fraction = layout?.width > 0 ? Math.min(100, layout.width) / 100 : null;
    const tall = cap?.height || (layout?.lines > 0 ? linesEmu(layout.lines) : null);
    const cx = Math.max(1, Math.round(tall ? Math.min(availableWidth, tall * (asset.width || 1) / (asset.height || 1))
      : fraction ? availableWidth * fraction : Math.min(availableWidth, (layout?.pixelWidth || asset.width || 1) * 9525)));
    const cy = Math.max(1, Math.round(cx * ((asset.height || 1) / (asset.width || 1))));
    return {cx, cy};
  };
  const wrapDistances = (width, left, cx) => {
    const minimum = wrapColumnFloor(bodyPointSize * 4 / 3) * 9525, spacing = 91440;
    const distance = gap => gap > spacing && gap - spacing < minimum ? Math.round(gap) : spacing;
    return {left: distance(left), right: distance(width - left - cx)};
  };
  const pictureXml = (asset, alt, layout, availableWidth = contentWidthEmu, baseline = 0, cap = null, title = null) => {
    const {cx, cy} = pictureSize(asset, layout, availableWidth, cap);
    const pr = docPr++;
    const description = attributeText(alt || ''), tip = title == null ? '' : ' title="' + attributeText(title) + '"';
    const rot = layout?.rotate ? Math.round(((layout.rotate * 60000) % 21600000 + 21600000) % 21600000) : 0;
    const effects = (layout?.opacity < 100 ? '<a:alphaModFix amt="' + layout.opacity * 1000 + '"/>' : '') +
      (asset.svgId ? '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="' + NS.svg[0] +
        '" r:embed="' + asset.svgId + '"/></a:ext></a:extLst>' : '') +
      (asset.originalId ? '<a:extLst><a:ext uri="' + NS.rapier[0] + '/original"><rapier:original xmlns:rapier="' + NS.rapier[0] +
        '" r:embed="' + asset.originalId + '"/></a:ext></a:extLst>' : '');
    const graphic = '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + pr + '" name="Picture ' + pr + '" descr="' + description + '"' + tip + '/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + asset.id + (effects ? '">' + effects + '</a:blip>' : '"/>') +
      '<a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm' + (rot ? ' rot="' + rot + '"' : '') + '><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>';
    const floating = layout?.wrap;
    const left = Math.round(Math.max(0, Math.min(availableWidth - cx, availableWidth * (layout?.x ?? 0) / 100 - cx / 2)));
    const top = Math.round((layout?.y || 0) * emPoints * 12700);
    const distance = ['around', 'box'].includes(floating) ? wrapDistances(availableWidth, left, cx) : {left: 91440, right: 91440};
    const placement = cap ? '<wp:anchor distT="0" distB="0" distL="0" distR="50800" simplePos="0" relativeHeight="0" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="0">' +
      '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="character"><wp:posOffset>0</wp:posOffset></wp:positionH>' +
      '<wp:positionV relativeFrom="line"><wp:posOffset>' + Math.round(cap.top || 0) + '</wp:posOffset></wp:positionV>' : floating ? '<wp:anchor distT="0" distB="0" distL="' + distance.left + '" distR="' + distance.right + '" simplePos="0" relativeHeight="' + pr +
      '" behindDoc="' + (floating === 'behind' ? '1' : '0') + '" locked="0" layoutInCell="1" allowOverlap="1">' +
      '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>' + left + '</wp:posOffset></wp:positionH>' +
      '<wp:positionV relativeFrom="paragraph"><wp:posOffset>' + top + '</wp:posOffset></wp:positionV>' :
      '<wp:inline distT="0" distB="0" distL="0" distR="0">';
    const wrapping = cap ? '<wp:wrapSquare wrapText="right"/>' : !floating ? '' : ['behind', 'front'].includes(floating) ? '<wp:wrapNone/>' :
      floating === 'box' ? '<wp:wrapSquare wrapText="bothSides"/>' : '<wp:wrapTight wrapText="bothSides"><wp:wrapPolygon edited="0"><wp:start x="0" y="0"/>' +
        '<wp:lineTo x="0" y="21600"/><wp:lineTo x="21600" y="21600"/><wp:lineTo x="21600" y="0"/><wp:lineTo x="0" y="0"/></wp:wrapPolygon></wp:wrapTight>';
    return '<w:r>' + (baseline ? '<w:rPr><w:position w:val="' + Math.round(baseline * 2) + '"/></w:rPr>' : '') + '<w:drawing>' + placement +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      wrapping +
      '<wp:docPr id="' + pr + '" name="Picture ' + pr + '" descr="' + description + '"' + tip + '/><wp:cNvGraphicFramePr/>' +
      graphic + (cap || floating ? '</wp:anchor>' : '</wp:inline>') + '</w:drawing></w:r>';
  };

  const resolveSrc = run => run.src || (run.ref ? refs.get(String(run.ref).toLowerCase()) : null);

  const commentEventXml = event => event.start ? '<w:commentRangeStart w:id="' + event.id + '"/>' :
    '<w:commentRangeEnd w:id="' + event.id + '"/><w:r><w:commentReference w:id="' + event.id + '"/></w:r>';
  const commentedTextXml = (text, style, start = 0, end = text.length) => {
    if (style.bold && !style.family && !style.font) style = {...style, font: bodyFace};
    if (style.code && !style.family) style = {...style, family: settings?.monofont?.word || 'Geist Mono'};
    if (style.code && !style.size && !style.halfPoints) style = {...style, size: style.tableText ? 21 : Math.round(bodyPointSize * .85 * 2)};
    const events = (style.commentEvents || []).filter(event => event.at >= start && event.at <= end)
      .sort((a, b) => a.at - b.at || Number(a.start) - Number(b.start) || a.id - b.id);
    let xml = '', at = start;
    for (const event of events) { if (event.at > at) xml += tXml(text.slice(at, event.at), style); xml += commentEventXml(event); at = event.at; }
    if (at < end) xml += tXml(text.slice(at, end), style);
    return xml;
  };
  const commentObjectXml = (inner, value) => (value.commentEvents || []).filter(event => event.start).map(commentEventXml).join('') +
    inner + (value.commentEvents || []).filter(event => !event.start).map(commentEventXml).join('');

  const linkObject = (item, targets, inner) => {
    const internal = item.href?.startsWith('#'), target = internal && targets.resolve(item.href);
    const tooltip = item.linkTitle == null ? '' : ' w:tooltip="' + attributeText(item.linkTitle) + '"';
    if (target) return '<w:hyperlink w:anchor="' + target.name + '"' + tooltip + '>' + inner + '</w:hyperlink>';
    if (item.href && !internal) {
      const id = nextRid(); rels.push({id, type: 'hyperlink', target: item.href, external: true});
      return '<w:hyperlink r:id="' + id + '"' + tooltip + '>' + inner + '</w:hyperlink>';
    }
    return inner;
  };
  const emitRuns = async (runList, targets = navigation, availableWidth = contentWidthEmu, runDefaults = null) => {
    let xml = '', abbreviation = null;
    for (const authored of runList) {
      await tick();
      const run = runDefaults ? {...runDefaults, ...authored} : authored;
      if ((run.abbreviation || null) !== abbreviation) {
        if (abbreviation) xml += '</w:sdtContent></w:sdt>';
        abbreviation = run.abbreviation || null;
        if (abbreviation) xml += '<w:sdt><w:sdtPr><w:alias w:val="' + attributeText(abbreviation.title) + '"/><w:tag w:val="rapier-abbreviation"/></w:sdtPr><w:sdtContent>';
      }
      if (run.type === 'bookmarkStart' || run.type === 'bookmarkEnd') {
        const mark = targets.bookmarks.get(run.bookmark);
        xml += run.type === 'bookmarkStart'
          ? '<w:bookmarkStart w:id="' + mark.id + '" w:name="' + mark.name + '"/>'
          : '<w:bookmarkEnd w:id="' + mark.id + '"/>';
        continue;
      }
      const link = inner => linkObject(run, targets, inner);
      if (run.type === 'image') {
        const src = resolveSrc(run);
        if (!src) continue;
        xml += commentObjectXml(link(pictureXml(await assetFor(src, run.alt, false, run.original), run.alt, run.layout || null, availableWidth, 0, null, run.title)), run);
        continue;
      }
      if (run.type === 'footnote') {
        if (!noteMap.has(run.id)) noteMap.set(run.id, {id: noteId(run.id), kind: noteKind(run.id), content: notes.get(run.id) || ''});
        const note = noteMap.get(run.id);
        xml += commentObjectXml('<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:' + note.kind + 'Reference w:id="' + note.id + '"/></w:r>', run);
        continue;
      }
      if (run.type === 'math') {
        const source = mathSourceOf(run), events = run.commentEvents || [];
        if (run.omml) {
          xml += link(events.filter(event => event.start).map(commentEventXml).join('') + sizedEquationXml(run.omml, emPoints * 2) + events.filter(event => !event.start).map(commentEventXml).join(''));
          equations.push([ommlSource(new DOMParser().parseFromString(sizedEquationXml(run.omml, emPoints * 2), 'application/xml').documentElement, emPoints * 2), source]);
        }
        else if (run.svg) {
          const picture = pictureXml(await mathAssetFor(run), run.alternative || source, null, availableWidth, run.display ? 0 : -(run.depth || 0));
          xml += link(events.filter(event => event.start).map(commentEventXml).join('') + picture + events.filter(event => !event.start).map(commentEventXml).join(''));
        } else xml += link(commentedTextXml(source, run));
        continue;
      }
      if (run.type === 'mathml') {
        xml += commentObjectXml(link(sizedEquationXml(nativeEquationXml(authored), Number(run.halfPoints ?? run.size) || emPoints * 2)), authored);
        continue;
      }
      const text = run.text ?? '';
      if (!text) continue;
      const resolved = run.href && (!run.href.startsWith('#') || targets.resolve(run.href));
      xml += link(commentedTextXml(text, resolved ? {...run, underline: true} : run));
    }
    return xml + (abbreviation ? '</w:sdtContent></w:sdt>' : '');
  };

  const prosePart = async (block, props, targets, typography = true, prefix = '', availableWidth = contentWidthEmu, runDefaults = null) => {
    let runs = block.runs || [];
    const nativeInitial = typography && (block.layout?.lines || block.layout?.hanging === 'on') ? proseInitial(runs) : null;
    if (typography && block.layout?.hanging === 'on' && !nativeInitial) props = {...props, hanging: 'off'};
    if (typography && block.layout?.caps === 'small' && block.firstLineEnd > 0) {
      const [line, rest] = splitTextRuns(runs, block.firstLineEnd);
      runs = [...line.map(run => run.type === 'text' && !run.code ? {...run, smallCaps: true} : run), ...rest];
    }
    const initial = typography && block.layout?.lines ? nativeInitial : null;
    if (!initial) return paragraph(prefix + await emitRuns(runs, targets, availableWidth, runDefaults), props);
    const [letter, rest] = splitTextRuns(runs, initial.end), type = referenceType(settings);
    const halfPoints = block.initialHalfPoints || Math.min(3276, Math.max(1, Math.round(((block.layout.lines - 1) * type.line / .7 + type.body) * 2)));
    const enlarged = letter.map(run => run.type === 'text' ? {...run, smallCaps: false, halfPoints,
      family: block.initialFont || run.family || settings?.mainfont?.word || settings?.sansfont?.word || null} : run);
    const initialInner = await emitRuns(enlarged, targets, availableWidth, runDefaults);
    return {...paragraph(prefix + await emitRuns(rest, targets, availableWidth, runDefaults), props),
      initial: {inner: initialInner, props: {frame: block.layout.lines, ind: props.ind, direction: props.direction}}};
  };

  const quoteBorders = color => '<w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="' +
    (cssColorHex(color) || '#777777').slice(1) + '"/></w:pBdr>';
  const codeShading = '<w:shd w:val="clear" w:color="auto" w:fill="F4F4F4"/>';
  const paragraph = (inner, props = {}) => ({inner, props, before: props.before || 0, after: props.after ?? blockSpace.paragraph});
  const paragraphXml = (part, props = part.props) =>
    (part.initial ? pXml(part.initial.inner, {...part.initial.props,
      ...(settings ? {before: 0, after: 0, line: lineTwips, lineRule: 'atLeast'} : {})}) : '') + pXml(part.inner, props);
  let nativeSpacing = false;
  const tableSpacing = line => {
    nativeSpacing = true;
    return pXml('', {styleId: 'RapierBlockSpacing', before: 0, after: 0, line, lineRule: 'exact'});
  };
  const boundary = (previous, next) => Math.max(previous.after || 0, next.before || 0);
  const quoteParts = parts => {
    parts[0].open = '<w:sdt><w:sdtPr><w:tag w:val="rapier:quote"/></w:sdtPr><w:sdtContent>' + (parts[0].open || '');
    parts.at(-1).close = (parts.at(-1).close || '') + '</w:sdtContent></w:sdt>';
    return parts;
  };
  const writeBlocks = (parts, inCell = false, firstGap = false) => {
    const wrapped = (part, inner) => (part.open || '') + inner + (part.close || '');
    if (!settings) return parts.map(part => wrapped(part, part.xml ?? paragraphXml(part))).join('');
    const visible = parts.filter(part => !part.transparent);
    let index = 0, xml = '';
    for (const part of parts) {
      if (part.transparent) {
        xml += wrapped(part, paragraphXml(part, {...part.props, before: 0, after: 0, line: 0, lineRule: 'exact'}));
        continue;
      }
      const previous = visible[index - 1], next = visible[++index];
      const before = previous ? boundary(previous, part) : firstGap ? part.before || 0 : 0;
      const after = next?.xml ? boundary(part, next) : next || inCell ? 0 : part.after || 0;
      if (part.xml) {
        if (previous?.xml) xml += tableSpacing(before);
        xml += wrapped(part, part.xml);
        if (!next && !inCell && after) xml += tableSpacing(after);
        continue;
      }
      const level = /^Heading([1-6])$/.exec(part.props.styleId || '');
      xml += wrapped(part, paragraphXml(part, {...part.props, before, after, keepNext: !!level || !!part.props.keepNext}));
    }
    return xml;
  };
  const emitBlocks = async (blocks, inset = 0, targets = navigation, availableWidth = contentWidthEmu, decoration = null, tableCell = false) => {
   const bodyParts = [], groups = [];
   const inheritedProps = props => ({...decoration, ...props,
     borders: props?.borders || decoration?.borders, direction: props?.direction || decoration?.direction});
   const paragraphPart = (inner, props) => paragraph(inner, inheritedProps(props));
   const renderRuns = (runs, defaults = decoration?.runs) => emitRuns(runs, targets, Math.max(1, availableWidth - inset * 635), defaults);
   const prose = (block, props, typography = true, prefix = '') => prosePart(block, inheritedProps(props), targets,
     typography, prefix, Math.max(1, availableWidth - inset * 635),
     block.heading ? {...decoration?.runs, characterStyle: undefined} : decoration?.runs);
   const paragraphInd = layout => indOf(layout, {base: inset, pointSize: bodyPointSize});
   const calloutTitleProps = (borders, direction) => {
     const depth = decoration?.quoteDepth || 0;
     if (depth) quotations = true;
     if (depth > 1) quoteDepths.add(depth);
     return {borders, direction, ind: paragraphInd(null), styleId: depth ? depth > 1 ? 'Quote' + depth : 'Quote' : null};
   };
   const tableInd = inset ? '<w:tblInd w:w="' + Math.round(inset) + '" w:type="dxa"/>' : '';
   const typography = layout => {
     if (layout?.hyphens === 'auto') hyphenation = true;
     return {hyphens: layout?.hyphens, hanging: tableCell ? undefined : layout?.hanging};
   };
   for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      groups.push({block, start: bodyParts.length});
      if (blocks === model.blocks) work?.onProgress?.(.72 + .13 * (++emitted / Math.max(1, blocks.length)));
      await tick();
    if (block.type === 'details') {
      const summary = paragraphPart(await renderRuns(block.runs));
      const parts = [summary, ...await emitBlocks(block.blocks, inset, targets, availableWidth, decoration, tableCell)];
      bodyParts.push({xml: '<w:sdt><w:sdtPr><w:tag w:val="rapier:details"/></w:sdtPr><w:sdtContent>' + writeBlocks(parts, tableCell) + '</w:sdtContent></w:sdt>'}); continue;
    }
    if (block.type === 'break') {
      bodyParts.push(paragraphPart('<w:r><w:br w:type="page"/></w:r>'));
      continue;
    }
    if (block.type === 'will') {
      bodyParts.push(paragraphPart(tXml(block.text, {vanish: true}), {vanish: true}));
      continue;
    }
    if (block.type === 'heading') {
      const inner = await renderRuns(block.runs, {...decoration?.runs, characterStyle: undefined});
      bodyParts.push(paragraphPart(inner, {direction: block.direction, styleId: 'Heading' + block.level, outline: block.level - 1, align: jcOf(block.layout), ind: indOf(block.layout, {first: false, base: inset, pointSize: bodyPointSize})}));
      continue;
    }
    if (block.type === 'math') {
      bodyParts.push(paragraphPart(await renderRuns([{...block, display: true}]), {align: 'center', ind: paragraphInd(null)}));
      continue;
    }
    if (block.type === 'mathml') {
      bodyParts.push(paragraphPart(commentObjectXml(sizedEquationXml(nativeEquationXml(block), emPoints * 2), block), {ind: paragraphInd(null)}));
      continue;
    }
    if (block.type === 'image') {
      const src = block.src || (block.ref ? refs.get(String(block.ref).toLowerCase()) : null);
      if (!src) continue;
      if (templatePage && !pageBorder && !tableCell && isPageBorderLayout(block.layout) && /^data:image\/svg\+xml/i.test(src)) { pageBorder = {src, alt: block.alt || ''}; continue; }
      const drawing = /^data:image\/svg\+xml/i.test(src);
      const asset = await assetFor(src, block.alt, drawing, block.original), width = Math.max(1, availableWidth - inset * 635);
      const draw = (layout, width, cap = null) => commentObjectXml(linkObject(block, targets, pictureXml(asset, block.alt, layout, width, 0, cap, block.title)), block);
      const next = blocks[index + 1];
      if (!tableCell && !block.caption && pictureInitialLayout(block.layout) && next?.type === 'paragraph' &&
          !next.rule && !next.layout?.lines && next.runs?.some(run => run.type === 'text' && run.text.trim())) {
        const type = referenceType(settings), cap = {height: integer(block.capHeight, null, 1) || linesEmu(block.layout.lines),
          top: integer(block.capTop, null) ?? Math.round(Math.max(0, (type.line - type.body) / 2 + type.body * .1) * 12700)};
        const prefix = draw(block.layout, width, cap);
        bodyParts.push(await prose(next, {align: jcOf(next.layout), ind: paragraphInd(next.layout), direction: next.direction, ...typography(next.layout)}, true, prefix));
        groups.at(-1).block = next;
        index++; emitted++; continue;
      }
      if (block.caption && ['around', 'box'].includes(block.layout?.wrap)) {
        const {cx} = pictureSize(asset, block.layout, width), cellWidth = Math.max(1, Math.round(cx / 635));
        const left = Math.round(Math.max(0, Math.min(width - cx, width * (block.layout.x ?? 0) / 100 - cx / 2)) / 635);
        const top = Math.round((block.layout.y || 0) * emPoints * 20);
        const distance = wrapDistances(width, left * 635, cellWidth * 635);
        const inlineLayout = {...block.layout, width: 100};
        for (const key of ['wrap', 'x', 'y', 'lines', 'align']) delete inlineLayout[key];
        const image = draw(inlineLayout, cellWidth * 635);
        bodyParts.push({xml: '<w:tbl><w:tblPr><w:tblpPr w:horzAnchor="text" w:vertAnchor="text" w:tblpX="' + left + '" w:tblpY="' + top +
          '" w:leftFromText="' + Math.round(distance.left / 635) + '" w:rightFromText="' + Math.round(distance.right / 635) + '" w:topFromText="0" w:bottomFromText="120"/>' +
          (block.layout.wrap === 'box' ? '<w:tblOverlap w:val="never"/>' : '') + '<w:tblW w:w="' + cellWidth + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>' +
          '<w:tblCellMar>' + ['top', 'left', 'bottom', 'right'].map(edge => '<w:' + edge + ' w:w="0" w:type="dxa"/>').join('') + '</w:tblCellMar>' +
          '</w:tblPr><w:tblGrid><w:gridCol w:w="' + cellWidth + '"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc>' +
          '<w:tcPr><w:tcW w:w="' + cellWidth + '" w:type="dxa"/></w:tcPr>' +
          pXml(image, {after: 60, keepNext: true}) + pXml(tXml('Figure: ' + block.caption, {italic: true, size: 21}), {align: 'center', after: 0}) +
          '</w:tc></w:tr></w:tbl>'});
        continue;
      }
      bodyParts.push(paragraphPart(draw(block.layout, width),
        {align: jcOf(block.layout), ind: paragraphInd(null), ...(block.caption ? {after: 60, keepNext: true} : {})}));
      if (block.caption) bodyParts.push(paragraphPart(tXml('Figure: ' + block.caption, {italic: true, size: 21}), {align: 'center', ind: paragraphInd(null)}));
      continue;
    }
    if (block.blocks && (block.type === 'quote' || block.type === 'callout')) {
      const color = cssColorHex(block.color) || '#0969da';
      const borders = block.type === 'callout' ? '<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="' + color.slice(1) + '"/></w:pBdr>' : quoteBorders(block.color);
      if (block.type === 'callout') bodyParts.push(paragraphPart(tXml(block.kind.charAt(0) + block.kind.slice(1).toLowerCase(), {bold: true, ...(block.color ? {color} : {})}), calloutTitleProps(borders, block.direction)));
      const quoteDepth = block.type === 'quote' ? (decoration?.quoteDepth || 0) + 1 : decoration?.quoteDepth;
      const step = block.type === 'quote' && quoteDepth > 1 ? QUOTE_STEP : 0;
      const parts = await emitBlocks(block.blocks, inset + step, targets, availableWidth, {...decoration, borders, direction: block.direction, quoteDepth}, tableCell);
      bodyParts.push(...(block.type === 'quote' ? quoteParts(parts) : parts));
      continue;
    }
    if (block.type === 'callout') {
      const color = cssColorHex(block.color) || '#0969da';
      const label = tXml(block.kind.charAt(0) + block.kind.slice(1).toLowerCase(), {bold: true, ...(block.color ? {color} : {})});
      const body = await renderRuns(block.runs);
      const border = '<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="' + color.slice(1) + '"/></w:pBdr>';
      const parts = [paragraphPart(label, calloutTitleProps(border, block.direction)), paragraphPart(body || tXml(''), {borders: border, direction: block.direction})];
      bodyParts.push({xml: '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' + tableInd + '<w:tblBorders>' +
        (block.direction === 'rtl' ? '<w:left w:val="nil"/><w:right' : '<w:right w:val="nil"/><w:left') + ' w:val="single" w:sz="24" w:space="0" w:color="' + color.slice(1) + '"/>' +
        '<w:top w:val="nil"/><w:bottom w:val="nil"/>' +
        '</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="9000" w:type="dxa"/></w:tcPr>' +
        writeBlocks(parts, true) + '</w:tc></w:tr></w:tbl>'});
      continue;
    }
    if (block.type === 'quote') {
      if (block.nativeQuote) quotations = true;
      const depth = (decoration?.quoteDepth || 0) + (block.quoteMember ? 0 : 1);
      if (block.nativeQuote && depth > 1) quoteDepths.add(depth);
      const part = await prose(block, {
        styleId: block.nativeQuote ? depth > 1 ? 'Quote' + depth : 'Quote' : null,
        borders: block.color ? quoteBorders(block.color) : decoration?.borders || quoteBorders(),
        ind: block.nativeQuote && depth > 1 ? indOf(block.layout, {base: inset + (depth - Math.max(1, decoration?.quoteDepth || 0)) * QUOTE_STEP, pointSize: bodyPointSize}) : paragraphInd(block.layout), align: jcOf(block.layout), direction: block.direction, ...typography(block.layout)
      }, !tableCell);
      bodyParts.push(...(block.quoteMember ? [part] : quoteParts([part])));
      continue;
    }
    if (block.type === 'list') {
      const idAt = [], leftAt = [];
      let lastNumberedLevel = -1;
      for (const item of block.items) {
      await tick();
        if (item.continuation) {
          while (idAt.length && idAt[idAt.length - 1].level > item.level) idAt.pop();
          bodyParts.push(...await emitBlocks(item.blocks, leftAt[item.level] ?? inset, targets, availableWidth, decoration, tableCell));
          continue;
        }
        const advance = item.ordered ? 660 : 300;
        const left = (leftAt[item.level - 1] ?? inset + item.level * advance) + advance;
        leftAt.length = item.level + 1; leftAt[item.level] = left;
        const pointSize = bodyPointSize;
        const authoredIndent = (item.layout?.indent || 0) * pointSize * 40;
        const numTab = Math.round(left + authoredIndent + (item.heading ? 0 : item.layout?.first || 0) * pointSize * 40);
        const ind = indOf(item.layout, {first: false, base: left, pointSize,
          hanging: (item.ordered ? 660 : 240) + authoredIndent - (item.layout?.marker || 0) * pointSize * 40});
        while (idAt.length && idAt[idAt.length - 1].level > item.level) idAt.pop();
        const top = idAt[idAt.length - 1];
        let numId;
        const task = item.task != null;
        const abstract = item.ordered ? item.delimiter === ')' ? 4 : 2 : task ? 3 : 1;
        if (top && top.level === item.level && top.abstract === abstract) numId = top.numId;
        else if (top && top.abstract === abstract && item.level > top.level) numId = top.numId;
        else numId = allocNum(abstract);
        const freshLevel = !top || top.level !== item.level || top.numId !== numId;
        if (freshLevel && item.ordered) {
          const start = item.start ?? 1, prior = numEntries.get(numId).starts.get(item.level);
          if (prior != null && (prior !== start || lastNumberedLevel >= item.level)) numId = allocNum(abstract);
          numEntries.get(numId).starts.set(item.level, start);
        } else if (item.ordered && top.next !== item.start) {
          numId = top.numId = allocNum(abstract);
          numEntries.get(numId).starts.set(item.level, item.start);
        }
        if (freshLevel) idAt.push({level: item.level, ordered: item.ordered, abstract, numId});
        if (item.ordered) idAt.at(-1).next = item.start + 1;
        const firstRun = item.runs.find(run => !['bookmarkStart', 'bookmarkEnd'].includes(run.type));
        const prefix = !task ? '' : '<w:sdt><w:sdtPr><w14:checkbox xmlns:w14="' + NS.w14[0] + '">' +
          '<w14:checked w14:val="' + (item.task ? '1' : '0') + '"/>' +
          '<w14:checkedState w14:font="Segoe UI Symbol" w14:val="2612"/><w14:uncheckedState w14:font="Segoe UI Symbol" w14:val="2610"/>' +
          '</w14:checkbox></w:sdtPr><w:sdtContent>' + tXml(item.task ? '☒' : '☐') + '</w:sdtContent></w:sdt>' +
          (firstRun?.type === 'text' && /^\s/.test(firstRun.text) ? '' : tXml(' '));
        if (item.nativeQuote) quotations = true;
        bodyParts.push(await prose(item, {styleId: item.heading ? 'Heading' + item.heading : item.nativeQuote ? 'Quote' : 'ListParagraph',
          outline: item.heading ? item.heading - 1 : null, numId, ilvl: item.level, align: jcOf(item.layout), ind, numTab, direction: item.direction,
          ...nativeDocumentSpacing(settings, item.heading ? 'h' + item.heading : 'item'),
          ...(item.loose && !item.heading ? {after: Math.max(lineTwips, 240, (nativeDocumentSpacing(settings, 'item').before || 0) + 240, (nativeDocumentSpacing(settings, 'item').after || 0) + 240)} : {}),
          ...(!item.heading && !item.code ? typography(item.layout) : {}),
          borders: item.quote ? quoteBorders(item.quoteColor) : null, shading: item.code ? codeShading : null},
          !tableCell && !item.heading && !item.code, prefix));
        lastNumberedLevel = item.level;
      }
      continue;
    }
    if (block.type === 'table') {
      const authored = [...(block.header.length ? [{cells:block.header, header:true}] : []),
        ...block.rows.map(cells => ({cells, header:cells.length > 0 && cells.every(cell => cell.header)}))];
      const grid = [], spanning = new Map(); let cols = 1;
      for (const [rowIndex, row] of authored.entries()) {
      await tick();
        const cells = []; let column = 0;
        const continuation = () => {
          const active = spanning.get(column);
          if (!active || active.end <= rowIndex) return false;
          cells.push({column, colspan:active.colspan, continuation:true}); column += active.colspan;
          return true;
        };
        for (const source of row.cells) {
          while (continuation()) {}
          const cell = Array.isArray(source) ? {runs:source} : source;
          const colspan = cell.colspan || 1, rowspan = cell.rowspan || 1;
          if (column + colspan > DOCX_LIMITS.tableColumns) return fail('DOCX table exceeds the column limit.');
          for (let offset = 1; offset < colspan; offset++) if ((spanning.get(column + offset)?.end || 0) > rowIndex)
            return fail('DOCX table has overlapping merged cells.');
          cells.push({...cell, column, colspan, rowspan});
          if (rowspan > 1) spanning.set(column, {colspan, end:rowIndex + rowspan});
          column += colspan;
        }
        while (continuation()) {}
        cols = Math.max(cols, column); grid.push({cells, header:row.header});
      }
      if ([...spanning.values()].some(cell => cell.end > authored.length)) return fail('DOCX table has a merged cell beyond its last row.');
      const width = Math.max(1, Math.floor(Math.max(1, availableWidth / 635 - inset) / cols));
      const cell = async value => {
        const span = value.colspan || 1;
        const runs = {tableText: true}; tableStyle = true;
        if (value.header) { runs.characterStyle = 'RapierTableHeader'; tableHeaderStyle = true; }
        const cellWidth = width * span * 635;
        const parts = value.continuation ? [paragraphPart('')] : value.blocks ?
          await emitBlocks(value.blocks, 0, targets, cellWidth, {...decoration, quoteDepth: 0, runs, after: 0}, true) :
          [paragraphPart(await emitRuns(value.runs || [], targets, cellWidth, runs), {after: 0})];
        for (const part of parts) if (part.props && !part.props.styleId?.startsWith('Heading'))
          part.props = {...part.props, line: nativeDocumentSpacing(settings, 'table', 10.5).line, lineRule: nativeDocumentSpacing(settings, 'table', 10.5).lineRule};
        const inner = writeBlocks(parts, true);
        const tailParagraph = value.blocks?.at(-1)?.type === 'table' ? writeBlocks([paragraph('')], true) : '';
        return '<w:tc><w:tcPr><w:tcW w:w="' + width * span + '" w:type="dxa"/>' +
          (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') +
          (value.continuation ? '<w:vMerge/>' : value.rowspan > 1 ? '<w:vMerge w:val="restart"/>' : '') +
          '</w:tcPr>' +
          (inner || writeBlocks([paragraph('')], true)) + tailParagraph + '</w:tc>';
      };
      let tbl = '<w:tbl><w:tblPr><w:tblStyle w:val="RapierTable"/><w:tblW w:w="0" w:type="auto"/>' + tableInd + '<w:tblBorders>' +
        ['top', 'left', 'bottom', 'right'].map(edge => '<w:' + edge + ' w:val="single" w:sz="12" w:color="000000"/>').join('') +
        '<w:insideH w:val="single" w:sz="6" w:color="424242"/><w:insideV w:val="single" w:sz="6" w:color="424242"/>' +
        '</w:tblBorders><w:tblCellMar><w:top w:w="' + 120 + '" w:type="dxa"/>' +
        '<w:left w:w="180" w:type="dxa"/><w:bottom w:w="' + 120 + '" w:type="dxa"/>' +
        '<w:right w:w="180" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
        Array.from({length: cols}, () => '<w:gridCol w:w="' + width + '"/>').join('') + '</w:tblGrid>';
      for (const row of grid) {
        tbl += '<w:tr>' + (row.header ? '<w:trPr><w:tblHeader/></w:trPr>' : '');
        let end = 0;
        for (const value of row.cells) { tbl += await cell(value); end = value.column + value.colspan; }
        for (; end < cols; end++) tbl += await cell({});
        tbl += '</w:tr>';
      }
      tbl += '</w:tbl>';
      bodyParts.push({xml: tbl});
      if (block.caption) bodyParts.push(paragraphPart(tXml('Table: ' + block.caption, {italic: true, size: 21}), {align: 'center', ind: paragraphInd(null), before: 60}));
      continue;
    }
    if (block.type === 'code') {
      let inner = '';
      if (block.language && !codeLanguages.has(block.language)) codeLanguages.set(block.language, 'SourceCode' + (codeLanguages.size + 1));
      const styleId = block.language ? codeLanguages.get(block.language) : 'SourceCode';
      const line = after => paragraphPart(inner, {styleId, shading: codeShading, ind: paragraphInd(null), ...nativeDocumentSpacing(settings, 'code', bodyPointSize * .7386), after});
      sourceCode = true;
      for (const run of block.runs || [{...block, text: String(block.text || '')}]) {
        let at = 0;
        const parts = run.text.split('\n');
        for (const [index, part] of parts.entries()) {
          await tick();
          inner += commentedTextXml(run.text, {...run, code: true, size: Math.round(bodyPointSize * .7386 * 2)}, at, at + part.length);
          at += part.length + 1;
          if (index < parts.length - 1) { bodyParts.push(line(0)); inner = ''; }
        }
      }
      bodyParts.push(line(lineTwips));
      continue;
    }
    if (block.rule) {
      bodyParts.push(paragraphPart('', {borders: '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>', ind: paragraphInd(null), line: 1, lineRule: 'exact'}));
      continue;
    }
    if (block.definition) definitions = true;
    bodyParts.push(await prose(block, {...(block.definition ? {styleId: DEFINITION_STYLES[block.definition]} : {}),
      align: jcOf(block.layout), ind: paragraphInd(block.layout), direction: block.direction, ...typography(block.layout)}, !tableCell));
   }
   if (settings) for (let index = 0; index < groups.length; index++) {
     const {block, start} = groups[index], end = groups[index + 1]?.start ?? bodyParts.length;
     const parts = bodyParts.slice(start, end);
     if (!parts.length) continue;
     if (block.type === 'will' || block.type === 'break') {
       for (const part of parts) part.transparent = true;
       continue;
     }
     const kind = block.type === 'heading' ? 'h' + block.level : block.rule ? 'rule' : block.type === 'image'
       ? /^data:image\/svg\+xml/i.test(block.src || '') ? 'drawing' : 'picture'
       : block.type === 'list' && block.items.every(item => item.runs.some(run => run.href?.startsWith('#'))) ? 'toc'
       : ['list', 'table', 'quote', 'code'].includes(block.type) ? block.type : 'paragraph';
     const space = nativeDocumentSpacing(settings, kind);
     if (block.type === 'code') for (const part of parts) { part.before = 0; part.after = 0; }
     if (!['list', 'table', 'code', 'rule'].includes(kind) && !kind.startsWith('h'))
       for (const part of parts) if (part.props) part.props = {...part.props, line: space.line, lineRule: space.lineRule};
     parts[0].before = space.before;
     parts.at(-1).after = space.after;
   }
   return bodyParts.length ? bodyParts : [paragraphPart('')];
  };
  const bodyXml = writeBlocks(await emitBlocks(blocks)) + comments.filter(comment => !comment.attached)
    .map(comment => pXml('<w:r><w:commentReference w:id="' + comment.id + '"/></w:r>')).join('');
  const commentXml = [], commentExXml = [];
  let nextComment = comments.length, nextBookmark = navigation.bookmarks.size;
  for (const comment of comments) {
    const identifiers = new Map(comment.messages.map((message, index) => [message.id, index ? nextComment++ : comment.id]));
    for (let index = 0; index < comment.messages.length; index++) {
      const message = comment.messages[index], id = identifiers.get(message.id), paraId = (id + 1).toString(16).toUpperCase().padStart(8, '0');
      const parent = index ? identifiers.get(message.replyTo) ?? comment.id : null;
      const date = message.date ?? (message.createdAt === null ? null : new Date(message.createdAt).toISOString());
      const targets = docxNavigation(message.blocks || [], nextBookmark, navigation);
      nextBookmark += targets.bookmarks.size;
      let body = message.blocks ? writeBlocks(await emitBlocks(message.blocks, 0, targets)) : writeBlocks([paragraph(tXml(message.text))]);
      const paragraphs = [...body.matchAll(/<w:p(?=>)/g)], last = paragraphs.at(-1)?.index;
      if (last == null) body += '<w:p w14:paraId="' + paraId + '"/>';
      else body = body.slice(0, last) + '<w:p w14:paraId="' + paraId + '"' + body.slice(last + 4);
      commentXml.push('<w:comment w:id="' + id + '" w:author="' + escape(message.author.name) + '"' +
        (date ? ' w:date="' + escape(date) + '"' : '') + '>' + body + '</w:comment>');
      commentExXml.push('<w15:commentEx w15:paraId="' + paraId + '" w15:done="' + (comment.resolved ? 1 : 0) + '"' +
        (parent != null ? ' w15:paraIdParent="' + (parent + 1).toString(16).toUpperCase().padStart(8, '0') + '"' : '') + '/>');
    }
  }
  const noteXml = {footnote: [], endnote: []};
  for (const note of noteMap.values()) {
    const parts = typeof note.content === 'string' ? [paragraph(tXml(note.content))] : await emitBlocks(note.content.blocks);
    for (const part of parts) if (part.props) { const space = nativeDocumentSpacing(settings, 'footnote'); part.props = {...part.props, line: space.line, lineRule: space.lineRule}; part.before = space.before; part.after = space.after; }
    const body = writeBlocks(parts, false, true);
    const marked = body.replace(/<w:p>(<w:pPr>[\s\S]*?<\/w:pPr>)?/, (open) => open + '<w:r><w:' + note.kind + 'Ref/></w:r>');
    noteXml[note.kind].push('<w:' + note.kind + ' w:id="' + note.id + '">' + marked + '</w:' + note.kind + '>');
  }

  const footerId = settings && settings.pagestyle === 'plain' ? nextRid() : '';
  let headerId = '', headerXml = '';
  if (pageBorder) {
    const asset = await assetFor(pageBorder.src, pageBorder.alt, true, null);
    headerId = nextRid();
    const cx = settings.papersize.width * 635, cy = settings.papersize.height * 635, pr = docPr++, description = attributeText(pageBorder.alt);
    const blip = '<a:blip r:embed="' + asset.id + (asset.svgId ? '"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="' + NS.svg[0] + '" r:embed="' + asset.svgId + '"/></a:ext></a:extLst></a:blip>' : '"/>');
    headerXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:hdr xmlns:w="' + NS.w[0] + '" xmlns:r="' + NS.r[0] + '" xmlns:a="' + NS.a[0] + '" xmlns:wp="' + NS.wp[0] + '" xmlns:pic="' + NS.pic[0] + '"><w:p><w:r><w:drawing>' +
      '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>' +
      '<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="' + pr + '" name="Page border" descr="' + description + '"/><wp:cNvGraphicFramePr/>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + pr + '" name="Page border" descr="' + description + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill>' + blip + '<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>' +
      '</wp:anchor></w:drawing></w:r></w:p></w:hdr>';
  }
  const sectPr = sectionPropertiesXml(settings, footerId, headerId);
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:document xmlns:w="' + NS.w[0] + '" xmlns:r="' + NS.r[0] + '" xmlns:a="' + NS.a[0] +
    '" xmlns:wp="' + NS.wp[0] + '" xmlns:pic="' + NS.pic[0] + '">\n<w:body>' +
    bodyXml + sectPr + '</w:body></w:document>';

  const type = referenceType(settings);
  const headingFace = settings?.sansfont?.word || (bodyFace === 'Geist' ? bodyFace : null);
  const headingEmphasis = true;
  const headingStyles = [1, 2, 3, 4, 5, 6].map(level => {
    const size = type ? integer(Math.max(1, Math.round(documentHeadingSize(settings, level) * 2))) : 0;
    const space = nativeDocumentSpacing(settings, 'h' + level, type ? documentHeadingSize(settings, level) : 13.2);
    const face = headingFace;
    return '<w:style w:type="paragraph" w:styleId="Heading' + level + '"><w:name w:val="heading ' + level + '"/>' +
      '<w:basedOn w:val="' + (headingEmphasis ? STRUCTURAL_EMPHASIS : 'Normal') + '"/><w:pPr><w:keepNext/>' +
      (type ? spacingXml(space) : '') +
      '<w:outlineLvl w:val="' + (level - 1) + '"/></w:pPr>' +
      (type ? '<w:rPr>' + (face ? fontFamilyXml(face) : '') +
        '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/></w:rPr>' : '') + '</w:style>';
  }).join('');
  const emphasisStyles = (headingEmphasis ?
    '<w:style w:type="paragraph" w:styleId="' + STRUCTURAL_EMPHASIS + '"><w:name w:val="' + STRUCTURAL_EMPHASIS_NAME + '"/>' +
    '<w:basedOn w:val="Normal"/><w:rPr><w:b/></w:rPr></w:style>' : '') +
    (tableHeaderStyle ? '<w:style w:type="character" w:styleId="RapierTableHeader"><w:name w:val="Rapier table header"/>' +
      '<w:rPr><w:b/></w:rPr></w:style>' : '') +
    (tableStyle ? '<w:style w:type="table" w:customStyle="1" w:styleId="RapierTable"><w:name w:val="Rapier table"/>' +
      '<w:rPr><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>' : '');
  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="' + NS.w[0] + '">' +
    documentDefaultsXml(settings, hyphenation) +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
    (settings && !languageTag(settings.lang) ? '<w:rPr><w:lang w:val="' + documentLanguage(settings) + '"/></w:rPr>' : '') + '</w:style>' + emphasisStyles + headingStyles +
    (nativeSpacing ? '<w:style w:type="paragraph" w:customStyle="1" w:styleId="RapierBlockSpacing"><w:name w:val="Rapier Block Spacing"/><w:basedOn w:val="Normal"/></w:style>' : '') +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr>' + spacingXml(nativeDocumentSpacing(settings, 'item')) + '</w:pPr></w:style>' +
    (quotations ? '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/></w:style>' : '') +
    [...quoteDepths].sort((a, b) => a - b).map(depth => '<w:style w:type="paragraph" w:customStyle="1" w:styleId="Quote' + depth + '"><w:name w:val="Quote ' + depth +
      '"/><w:basedOn w:val="Quote"/><w:pPr><w:ind w:left="' + (depth - 1) * QUOTE_STEP + '"/></w:pPr></w:style>').join('') +
    (definitions ? '<w:style w:type="paragraph" w:customStyle="1" w:styleId="RapierTerm"><w:name w:val="' + DEFINITION_NAMES.RapierTerm + '"/><w:basedOn w:val="Normal"/><w:next w:val="RapierDefinition"/><w:pPr><w:keepNext/></w:pPr></w:style>' +
      '<w:style w:type="paragraph" w:customStyle="1" w:styleId="RapierDefinition"><w:name w:val="' + DEFINITION_NAMES.RapierDefinition + '"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="' + DEFINITION_INDENT + '"/></w:pPr></w:style>' : '') +
    (sourceCode ? '<w:style w:type="paragraph" w:styleId="SourceCode"><w:name w:val="Source Code"/><w:basedOn w:val="Normal"/></w:style>' : '') +
    [...codeLanguages].map(([language, id]) => '<w:style w:type="paragraph" w:customStyle="1" w:styleId="' + id + '"><w:name w:val="Source Code (' + escape(language) + ')"/>' +
      '<w:basedOn w:val="SourceCode"/></w:style>').join('') +
    '</w:styles>';

  const lvl = (ilvl, format, text) => '<w:lvl w:ilvl="' + ilvl + '"><w:start w:val="1"/><w:numFmt w:val="' + format + '"/>' +
    '<w:lvlText w:val="' + (format === 'bullet' ? escape(text ?? '•') : '%' + (ilvl + 1) + (text || '.')) + '"/><w:lvlJc w:val="left"/></w:lvl>';
  const abstracts = numbering.abstracts.map(row => '<w:abstractNum w:abstractNumId="' + row.id + '">' +
    Array.from({length: 9}, (_, ilvl) => lvl(ilvl, row.format, row.text)).join('') + '</w:abstractNum>').join('');
  const overrideXml = ([ilvl, start]) => '<w:lvlOverride w:ilvl="' + ilvl + '"><w:startOverride w:val="' + start + '"/></w:lvlOverride>';
  const nums = numbering.nums.map(row => '<w:num w:numId="' + row.id + '"><w:abstractNumId w:val="' + row.abstract + '"/>' +
    [...row.starts].sort((a, b) => a[0] - b[0]).map(overrideXml).join('') + '</w:num>').join('');
  const numberingXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="' + NS.w[0] + '">' +
    abstracts + nums + '</w:numbering>';

  const notesXml = kind => noteXml[kind].length ? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:' + kind + 's xmlns:w="' + NS.w[0] +
    '" xmlns:r="' + NS.r[0] + '" xmlns:a="' + NS.a[0] + '" xmlns:wp="' + NS.wp[0] + '" xmlns:pic="' + NS.pic[0] + '">' +
    noteXml[kind].join('') + '</w:' + kind + 's>' : null;
  const footnoteXml = notesXml('footnote'), endnoteXml = notesXml('endnote');
  const commentsXml = commentXml.length ? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments xmlns:w="' + NS.w[0] +
    '" xmlns:r="' + NS.r[0] + '" xmlns:a="' + NS.a[0] + '" xmlns:wp="' + NS.wp[0] + '" xmlns:pic="' + NS.pic[0] +
    '" xmlns:w14="' + NS.w14[0] + '" xmlns:mc="' + NS.mc[0] + '" mc:Ignorable="w14">' + commentXml.join('') + '</w:comments>' : null;
  const commentsExtendedXml = commentsXml ? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w15:commentsEx xmlns:w15="' +
    NS.w15[0] + '">' + commentExXml.join('') + '</w15:commentsEx>' : null;

  const relXml = list => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="' + NS.rel[0] + '">' +
    list.map(row => '<Relationship Id="' + escape(row.id) + '" Type="' + (row.type.startsWith('http:') ? row.type : NS.r[0] + '/' + row.type) +
      '" Target="' + escape(row.target) + '"' + (row.external ? ' TargetMode="External"' : '') + '/>').join('') +
    '</Relationships>';

  const mainRels = [
    {id: stylesRid, type: 'styles', target: 'styles.xml'},
    {id: numberingRid, type: 'numbering', target: 'numbering.xml'},
    ...(fonts.length ? [{id: fontTableRid, type: 'fontTable', target: 'fontTable.xml'}] : []),
    ...(fonts.length || hyphenation ? [{id: settingsRid || nextRid(), type: 'settings', target: 'settings.xml'}] : []),
    ...(footnoteXml ? [{id: footnotesRid, type: 'footnotes', target: 'footnotes.xml'}] : []),
    ...(endnoteXml ? [{id: nextRid(), type: 'endnotes', target: 'endnotes.xml'}] : []),
    ...(headerId ? [{id: headerId, type: 'header', target: 'header1.xml'}] : []),
    ...(footerId ? [{id: footerId, type: 'footer', target: 'footer1.xml'}] : []),
    ...(commentsXml ? [{id: nextRid(), type: 'comments', target: 'comments.xml'},
      {id: nextRid(), type: 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended', target: 'commentsExtended.xml'}] : []),
    ...(carrySource ? [{id: nextRid(), type: 'customXml', target: '../customXml/item1.xml'}] : []),
    ...rels
  ];
  const types = ['png', 'jpeg', 'svg', 'gif'].filter(ext => media.some(row => row.name.endsWith('.' + ext)));
  const defaultType = (extension, type) => '<Default Extension="' + extension + '" ContentType="' + type + '"/>';
  const defaults = defaultType('rels', 'application/vnd.openxmlformats-package.relationships+xml') +
    defaultType('xml', 'application/xml') + (fonts.length ? defaultType('odttf', DOCX_FONT_TYPE) : '') +
    types.map(type => defaultType(type, 'image/' + (type === 'svg' ? 'svg+xml' : type))).join('');
  const wordOverride = (name, kind = name) => '<Override PartName="/word/' + name + '.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.' + kind + '+xml"/>';
  const overrides = [wordOverride('document', 'document.main'), wordOverride('styles'), wordOverride('numbering')];
  for (const [kind, xml] of [['footnotes', footnoteXml], ['endnotes', endnoteXml]])
    if (xml) overrides.push(wordOverride(kind));
  if (fonts.length) overrides.push(wordOverride('fontTable'));
  if (fonts.length || hyphenation) overrides.push(wordOverride('settings'));
  if (headerId) overrides.push(wordOverride('header1', 'header'));
  if (footerId) overrides.push(wordOverride('footer1', 'footer'));
  if (commentsXml) overrides.push(wordOverride('comments'), wordOverride('commentsExtended'));
  const coreXml = corePropertiesXml(settings);
  if (coreXml) overrides.push('<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>');
  overrides.push('<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>');
  if (carrySource) overrides.push('<Override PartName="/' + DOCX_SOURCE.path + '" ContentType="' + DOCX_SOURCE.type + '"/>');
  const contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="' + NS.ct[0] + '">' +
    defaults + overrides.join('') + '</Types>';

  const packageRels = relXml([{id: 'rIdDoc', type: 'officeDocument', target: 'word/document.xml'}])
    .replace('</Relationships>', (coreXml ? '<Relationship Id="rIdCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' : '') +
      '<Relationship Id="rIdApp" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      (carrySource ? '<Relationship Id="rIdRapierSource" Type="' + DOCX_SOURCE.relationship + '" Target="' + DOCX_SOURCE.path + '"/>' +
        '<Relationship Id="rIdRapierMarkdown" Type="' + NS.r[0] + '/custom-properties" Target="docProps/custom.xml"/>' : '') + '</Relationships>');
  const entries = [
    {name: '[Content_Types].xml', bytes: await encodeXml(contentTypesXml)},
    {name: '_rels/.rels', bytes: await encodeXml(packageRels)},
    {name: 'word/document.xml', bytes: await encodeXml(documentXml)},
    {name: 'word/_rels/document.xml.rels', bytes: await encodeXml(relXml(mainRels))},
    {name: 'word/styles.xml', bytes: await encodeXml(stylesXml)},
    {name: 'word/numbering.xml', bytes: await encodeXml(numberingXml)}
  ];
  if (fonts.length) {
    const resources = new Map(fonts.flatMap(font => font.embeddings.map(({resource}) => [resource.id, resource])));
    const named = [documentXml, stylesXml, footnoteXml || '', endnoteXml || ''].join('');
    const portable = [['Georgia', 'roman', 'variable'], ['Courier New', 'modern', 'fixed'], ['Segoe Print', 'script', 'variable']]
      .filter(([family]) => named.includes(' w:ascii="' + family + '"') && !fonts.some(font => font.family === family));
    const fontTableXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:fonts xmlns:w="' + NS.w[0] + '" xmlns:r="' + NS.r[0] + '">' +
      fonts.map(font => '<w:font w:name="' + escape(font.family) + '">' + font.embeddings.map(({slot, resource}) =>
        '<w:embed' + slot + ' r:id="' + resource.id + '" w:fontKey="' + resource.key + '"' + (resource.subsetted ? ' w:subsetted="true"' : '') + '/>').join('') + '</w:font>').join('') +
      portable.map(([family, kind, pitch]) => '<w:font w:name="' + family + '"><w:family w:val="' + kind + '"/><w:pitch w:val="' + pitch + '"/></w:font>').join('') + '</w:fonts>';
    entries.push({name: 'word/fontTable.xml', bytes: await encodeXml(fontTableXml)},
      {name: 'word/_rels/fontTable.xml.rels', bytes: await encodeXml(relXml([...resources.values()].map(resource =>
        ({id: resource.id, type: 'font', target: 'fonts/' + resource.name}))))});
    for (const resource of resources.values()) entries.push({name: 'word/fonts/' + resource.name, bytes: resource.bytes});
  }
  if (fonts.length || hyphenation) entries.push({name: 'word/settings.xml', bytes: await encodeXml(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="' + NS.w[0] + '">' +
    (fonts.length ? '<w:embedTrueTypeFonts/><w:saveSubsetFonts/>' : '') +
    (hyphenation ? '<w:autoHyphenation/><w:consecutiveHyphenLimit w:val="2"/><w:hyphenationZone w:val="0"/><w:doNotHyphenateCaps/>' : '') +
    '</w:settings>')});
  for (const [kind, xml] of [['footnotes', footnoteXml], ['endnotes', endnoteXml]]) {
    if (!xml) continue;
    entries.push({name: 'word/' + kind + '.xml', bytes: await encodeXml(xml)});
    const used = new Set([...xml.matchAll(/\br:(?:id|embed)="([^"]+)"/g)].map(match => match[1]));
    const noteRels = rels.filter(row => used.has(row.id));
    if (noteRels.length) entries.push({name: 'word/_rels/' + kind + '.xml.rels', bytes: await encodeXml(relXml(noteRels))});
  }
  if (headerId) {
    entries.push({name: 'word/header1.xml', bytes: await encodeXml(headerXml)});
    const used = new Set([...headerXml.matchAll(/\br:(?:id|embed)="([^"]+)"/g)].map(match => match[1]));
    entries.push({name: 'word/_rels/header1.xml.rels', bytes: await encodeXml(relXml(rels.filter(row => used.has(row.id))))});
  }
  if (footerId) entries.push({name: 'word/footer1.xml', bytes: await encodeXml(pageNumberFooterXml())});
  if (commentsXml) {
    entries.push({name: 'word/comments.xml', bytes: await encodeXml(commentsXml)}, {name: 'word/commentsExtended.xml', bytes: await encodeXml(commentsExtendedXml)});
    const used = new Set([...commentsXml.matchAll(/\br:(?:id|embed)="([^"]+)"/g)].map(match => match[1]));
    const commentRels = rels.filter(row => used.has(row.id));
    if (commentRels.length) entries.push({name: 'word/_rels/comments.xml.rels', bytes: await encodeXml(relXml(commentRels))});
  }
  if (coreXml) entries.push({name: 'docProps/core.xml', bytes: await encodeXml(coreXml)});
  entries.push({name: 'docProps/app.xml', bytes: await encodeXml('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Rapier</Application></Properties>')});
  if (carrySource && !native) {
    const source = (bom ? '\uFEFF' : '') + canonical;
    const recovery = await wordRecoveryRecord(source, work, equations);
    entries.push({name: 'customXml/item1.xml', bytes: await encodeXml('<?xml version="1.0" encoding="UTF-8"?><rapier:recovery xmlns:rapier="' + NS.rapier[0] + '">' + escape(recovery) + '</rapier:recovery>')});
    entries.push({name: 'customXml/itemProps1.xml', bytes: await encodeXml('<?xml version="1.0" encoding="UTF-8"?><ds:datastoreItem ds:itemID="{269337D1-9D12-4B7F-AD04-DDBBD639D277}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="' + NS.rapier[0] + '"/></ds:schemaRefs></ds:datastoreItem>')});
    entries.push({name: 'customXml/_rels/item1.xml.rels', bytes: await encodeXml(relXml([{id: 'rIdProps', type: 'customXmlProps', target: 'itemProps1.xml'}]))});
    entries.push({name: 'docProps/custom.xml', bytes: await encodeXml('<?xml version="1.0" encoding="UTF-8"?>' +
      '<Properties xmlns="' + NS.custom[0] + '" xmlns:vt="' + NS.vt[0] + '"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="RapierMarkdown"><vt:lpwstr>' +
      escape(recovery) + '</vt:lpwstr></property></Properties>')});
    entries[0].bytes = await encodeXml(contentTypesXml.replace('</Types>', '<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/><Override PartName="/customXml/itemProps1.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/></Types>'));
  }
  for (const row of media) entries.push({name: 'word/media/' + row.name, bytes: row.bytes});
  if (native) return entries;
  if (typeof canonical === 'string') {
    const carried = carriedWord, review = wordReview(canonical);
    const projectSource = source => {
      if (!projection?.root?.ownerDocument) return fail('Word review export requires the document’s semantic root.', 'docx_review_projection');
      return docxSourceModel(projection.root, source, {canonical: source});
    };
    const get = (rows, path) => new TextDecoder().decode(rows.find(row => row.name === path)?.bytes || new Uint8Array());
    const set = (path, value) => {
      const row = entries.find(row => row.name === path);
      if (row) row.bytes = utf8.encode(value); else entries.push({name: path, bytes: utf8.encode(value)});
    };
    let house = null, originalXml = null;
    const addedNumbering = [];
    if (carried.record?.style) {
      house = admitWordStyle(carried.record.style);
      if (typeof house.source !== 'string') return fail('The Word template has no source binding.', 'docx_template_invalid');
      const original = await buildDocx(projectSource(house.source), {canonical: house.source, convertImage, work, wordLayout}, true);
      originalXml = wordTemplateProjection(get(original, 'word/document.xml'), house.source);
      let documentXml = wordTemplateProjection(get(entries, 'word/document.xml'), canonical), baselineXml = originalXml;
      if (house.numbering) {
        const numbering = appendWordNumbering(house.numbering, get(entries, 'word/numbering.xml'));
        addedNumbering.push(...numbering.added);
        set('word/numbering.xml', numbering.xml);
        documentXml = numbering.remap(documentXml); baselineXml = numbering.remap(originalXml);
      }
      set('word/document.xml', restoreWordStyle(documentXml, baselineXml, house));
      const generated = wordPart(get(entries, 'word/styles.xml'), 'styles'), template = wordPart(house.styles, 'styles');
      const known = new Set(children(template, 'w', 'style').map(node => attr(node, 'w', 'styleId')));
      const extras = children(generated, 'w', 'style').filter(node => !known.has(attr(node, 'w', 'styleId'))).map(wordXml).join('');
      set('word/styles.xml', wordXml(template).replace(/<\/[^>]+>$/, extras + '</' + template.nodeName + '>'));
      if (house.theme) {
        set('word/theme/theme1.xml', house.theme);
        set('word/_rels/document.xml.rels', get(entries, 'word/_rels/document.xml.rels').replace('</Relationships>',
          '<Relationship Id="rIdWordTheme" Type="' + NS.r[0] + '/theme" Target="theme/theme1.xml"/></Relationships>'));
        set('[Content_Types].xml', get(entries, '[Content_Types].xml').replace('</Types>',
          '<Override PartName="/word/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/></Types>'));
      }
    }
    if (comparison || review.changes.length) {
      if (review.changes.some(row => row.conflict)) return fail('A Word change overlaps a later edit. Decide it before exporting.', 'docx_revision_conflict');
      const beforeSource = comparison?.source ?? review.base, beforeModel = comparison?.model || projectSource(beforeSource);
      const before = await buildDocx(beforeModel, {canonical: beforeSource, convertImage, work, wordLayout}, true);
      let beforeXml = get(before, 'word/document.xml'), reviewRelations = '', mediaId = 0;
      const noteIdentity = async (rows, part) => {
        let xml = get(rows, 'word/' + part + '.xml');
        const rels = get(rows, 'word/_rels/' + part + '.xml.rels');
        if (rels) for (const r of new DOMParser().parseFromString(rels, 'application/xml').documentElement.children) {
          const target = r.getAttribute('Target'), file = rows.find(row => row.name === 'word/' + target);
          const value = r.getAttribute('TargetMode') === 'External' ? target : file ? await sha256(file.bytes) : '';
          if (!value) return fail('A Word note has an unresolved asset.', 'docx_review_note');
          const key = await sha256(utf8.encode(r.getAttribute('Type') + ':' + value));
          xml = xml.replace(new RegExp('(r:(?:id|embed|link)=")' + r.getAttribute('Id') + '"', 'g'), '$1' + key + '"');
        }
        return xml.replace(/<(?:wp:docPr|pic:cNvPr)\b[^>]*>/g, tag => tag.replace(/\b(?:id|name)="[^"]*"/g, ''));
      };
      for (const part of ['footnotes','endnotes','comments']) if (await noteIdentity(before, part) !== await noteIdentity(entries, part))
        return fail('Decide changes in notes and comments before exporting Word review.', 'docx_review_note');
      const numbering = appendWordNumbering(get(entries, 'word/numbering.xml'), get(before, 'word/numbering.xml'));
      addedNumbering.push(...numbering.added);
      set('word/numbering.xml', numbering.xml); beforeXml = numbering.remap(beforeXml);
      if (house) beforeXml = restoreWordStyle(wordTemplateProjection(beforeXml, beforeSource), numbering.remap(originalXml), house);
      const relationships = new DOMParser().parseFromString(get(before, 'word/_rels/document.xml.rels'), 'application/xml').documentElement;
      for (const relation of relationships.children) {
        const type = relation.getAttribute('Type'), oldId = relation.getAttribute('Id');
        if (!['hyperlink','image'].some(kind => type === NS.r[0] + '/' + kind)) continue;
        const id = 'rIdWordReview' + mediaId++, target = relation.getAttribute('Target'), external = relation.getAttribute('TargetMode') === 'External';
        beforeXml = beforeXml.replace(new RegExp('(r:(?:id|embed|link)=")' + oldId + '"', 'g'), '$1' + id + '"');
        if (!external) {
          const file = before.find(row => row.name === 'word/' + target);
          if (!file) return fail('A deleted picture has no embedded bytes.', 'docx_review_image');
          entries.push({name: 'word/review/' + target, bytes: file.bytes});
        }
        reviewRelations += '<Relationship Id="' + id + '" Type="' + type + '" Target="' + escape(external ? target : 'review/' + target) + '"' + (external ? ' TargetMode="External"' : '') + '/>';
      }
      if (reviewRelations) {
        set('word/_rels/document.xml.rels', get(entries, 'word/_rels/document.xml.rels').replace('</Relationships>', reviewRelations + '</Relationships>'));
        const oldTypes = new DOMParser().parseFromString(get(before, '[Content_Types].xml'), 'application/xml').documentElement;
        const newTypes = new DOMParser().parseFromString(get(entries, '[Content_Types].xml'), 'application/xml').documentElement;
        const extensions = new Set(Array.from(newTypes.children, row => row.getAttribute('Extension')));
        const extra = Array.from(oldTypes.children).filter(row => row.localName === 'Default' && !extensions.has(row.getAttribute('Extension'))).map(wordXml).join('');
        set('[Content_Types].xml', get(entries, '[Content_Types].xml').replace('</Types>', extra + '</Types>'));
      }
      set('word/document.xml', trackedWordXml(get(entries, 'word/document.xml'), beforeXml,
        comparison || {}, review, canonical, projectSource, get(entries, 'word/numbering.xml'),
        await reviewRelationKeys(get(entries, 'word/_rels/document.xml.rels'), entries)));
    }
    if (addedNumbering.length) {
      const root = wordPart(get(entries, 'word/numbering.xml'), 'numbering'), used = new Set();
      for (const row of entries) if (/^word\/.*\.xml$/.test(row.name) && row.name !== 'word/numbering.xml')
        for (const hit of new TextDecoder().decode(row.bytes).matchAll(/<w:numId\b[^>]*\bw:val="([^"]+)"/g)) used.add(hit[1]);
      const added = new Set(addedNumbering.map(([kind,id]) => kind + ':' + id));
      for (const n of children(root, 'w', 'num')) if (added.has('num:' + attr(n, 'w', 'numId')) && !used.has(attr(n, 'w', 'numId'))) n.remove();
      const abstracts = new Set(children(root, 'w', 'num').map(n => val(child(n, 'w', 'abstractNumId'))));
      for (const n of children(root, 'w', 'abstractNum')) if (added.has('abstractNum:' + attr(n, 'w', 'abstractNumId')) && !abstracts.has(attr(n, 'w', 'abstractNumId'))) n.remove();
      set('word/numbering.xml', wordXml(root));
    }
  }
  let nativeXmlBytes = 0;
  for (const entry of entries) if (/\.(?:xml|rels)$/.test(entry.name)) {
    nativeXmlBytes += entry.bytes.length;
    if (entry.bytes.length > DOCX_LIMITS.xmlBytes || nativeXmlBytes > DOCX_LIMITS.totalXmlBytes)
      return fail('DOCX XML exceeds the import limit.');
  }
  await pause(work, .87);
  const packed = work ? await zipStoredAsync(entries.map(entry => ({...entry, modified: 0})), {utf8Flag: false, work}) : packDocx(entries);
  if (packed.length > ARCHIVE_LIMITS.bytes) return fail('DOCX exceeds the 25 MB document limit.');
  if (typeof rewriteDocument !== 'function' && !carrySource) return packed;
  if (typeof rewriteDocument === 'function') {
    const at = entries.findIndex(entry => entry.name === 'word/document.xml');
    entries[at] = {name: entries[at].name, bytes: await encodeXml(rewriteDocument(new TextDecoder('utf-8').decode(entries[at].bytes)))};
  }
  if (carrySource) entries.push({name: DOCX_SOURCE.path, bytes: await docxSourceRecord(entries, (bom === true ? '\uFEFF' : '') + canonical, work, equations)});
  await pause(work, .94);
  const complete = work ? await zipStoredAsync(entries.map(entry => ({...entry, modified: 0})), {utf8Flag: false, work}) : packDocx(entries);
  if (complete.length > ARCHIVE_LIMITS.bytes) return fail('DOCX exceeds the 25 MB document limit.');
  return complete;
}

