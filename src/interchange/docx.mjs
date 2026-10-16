// SPDX-License-Identifier: AGPL-3.0-only
import {openArchive, createImportWork, ARCHIVE_LIMITS, crc32} from '../images/archive.mjs';
import {zipStored, zipStoredAsync} from '../notes/zip-records.mjs';
import {finish, finishAsync, cloneTree, encodeUtf8Steps, pause, check} from '../kit/render-work.mjs';
import {formatLayout, parseLayout, decodeLayoutAttribute, indentLevel, textStyle as indentStyle, textLayout, wrapColumnFloor} from '../spec/md-layout.mjs';
import {parseInkBody, normalizeFontFamily, fontFamilyCss, FONT_STACKS, typography} from '../spec/md-marks.mjs';
import {readDocumentSettings, DOCUMENT_LEADING, documentLanguage, languageTag} from '../spec/document-settings.mjs';
import {writeFontAssets, documentFontUsage} from '../spec/document-fonts.mjs';
import {DOCX_FONT_TYPE, writeDocxFonts, readDocxFontPart, obfuscateDocxFont} from './docx-fonts.mjs';
import {frontMatterFrame} from '../spec/frontmatter.mjs';
import {initialRange, firstLineEnd, protectInitial, apply as applyTypography} from '../layout/typography.mjs';
import {willMarkerOf} from '../agent/will.mjs';
import {IMAGE_LIMITS, inspectRaster, inspectSVG, inspectJPEGXL, isJxl, dataImage, sanitizeSvgText, svgElements, validAssetDimensions} from '../images/assets.mjs';
import {markdownParser, markdownBodyOffset, documentAssets} from '../spec/md-assets.mjs';
import {parseComments, commentThreads, commentAnchor, writeComments, validCommentDate, validCommentTimestamp} from '../agent/comments.mjs';
import {DOCX_FONTS} from '../shell/fonts/docx-fonts.mjs';

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
  mc: ['http://schemas.openxmlformats.org/markup-compatibility/2006'],
  w14: ['http://schemas.microsoft.com/office/word/2010/wordml'],
  w15: ['http://schemas.microsoft.com/office/word/2012/wordml'],
  w16cid: ['http://schemas.microsoft.com/office/word/2016/wordml/cid'],
  w16cex: ['http://schemas.microsoft.com/office/word/2018/wordml/cex'],
  v: ['urn:schemas-microsoft-com:vml'], o: ['urn:schemas-microsoft-com:office:office']
});
const utf8 = new TextEncoder();
const MARKERS = ['bookmarkStart','bookmarkEnd','proofErr','permStart','permEnd','moveFromRangeStart','moveFromRangeEnd','moveToRangeStart','moveToRangeEnd','customXmlPr','smartTagPr'];
const FONT_KINDS = 'Fonts the Word file names but does not contain became Rapier’s fonts of the same kind.';
const STRUCTURAL_EMPHASIS = 'RapierStructuralEmphasis';
const STRUCTURAL_EMPHASIS_NAME = 'Rapier structural emphasis';
const DOCX_SOURCE = Object.freeze({path: 'rapier/source.json',
  type: 'application/vnd.rapier.markdown-source+json',
  relationship: 'https://rapier.website/relationships/markdown-source'});
const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  byte => byte.toString(16).padStart(2, '0')).join('');

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
      if (Array.isArray(pair) && typeof pair[0] === 'string' && typeof pair[1] === 'string' && SINGLE_EQUATION.test(pair[1]) && record.source.includes(pair[1])) equations.set(pair[0], pair[1]);
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
  if (!Number.isFinite(number) || number < 0 || number >= 1) return fail('DOCX pictures with an outset or empty crop are not supported.');
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

export async function prepareDocxTypography(root, canonical, {work, willTokens = []} = {}) {
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
  const settings = readDocumentSettings(canonical), type = referenceType(settings);
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
  if (!/^[0-9a-f]{2}$/i.test(amount)) return fail('DOCX contains an invalid theme colour adjustment.', 'docx_theme_color');
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
    if (!DOCX_HIGHLIGHT_HEX[highlight]) return fail('DOCX contains an invalid highlight colour.', 'docx_highlight_color');
    out.highlight = highlight === 'yellow' ? 'default' : DOCX_HIGHLIGHT_TO_RAPIER[highlight] || highlight;
  }
  else if (highlight === 'none') out.highlight = null;
  const shading = child(node, 'w', 'shd'), fill = '#' + String(attr(shading, 'w', 'fill')).toLowerCase();
  if (out.highlight === undefined && val(shading) === 'clear' && fill === HIGHLIGHT_HEX.yellow) out.highlight = 'yellow';
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
    else html = sourceToken('<mark style="background-color:' + DOCX_HIGHLIGHT_HEX[style.highlight] + '">') + html + sourceToken('</mark>');
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

const ommlSource = node => (is(node, 'm', 'oMathPara') ? '$$' : '$') + mathTex(node).trim() + (is(node, 'm', 'oMathPara') ? '$$' : '$');
const SINGLE_EQUATION = /^(?:\$\$(?:(?!\$\$)[\s\S])+\$\$|\$[^$]+\$)$/;
function mathTex(node) {
  const text = value => String(value).replace(/[\\{}$%#&_^~]/g, c => ({'\\':'\\backslash{}',
    '^':'\\text{\\textasciicircum}', '~':'\\text{\\textasciitilde}'}[c] || '\\' + c));
  const property = (name, key, fallback = null) => attr(child(child(node, 'm', name + 'Pr'), 'm', key), 'm', 'val') ?? fallback;
  const hidden = (name, key) => {
    const bit = child(child(node, 'm', name + 'Pr'), 'm', key);
    return bit ? !['0', 'false', 'off'].includes(attr(bit, 'm', 'val')) : false;
  };
  const contents = parent => Array.from(parent?.children || []).filter(n =>
    !(is(n, 'm') && n.localName.endsWith('Pr')) && !(is(n, 'w') && (n.localName === 'rPr' || MARKERS.includes(n.localName)))).map(mathTex).join('');
  const part = name => contents(child(node, 'm', name));
  if (is(node, 'm', 't') || is(node, 'w', 't')) return text(node.textContent);
  if (!is(node, 'm')) return fail('DOCX contains unsupported equation content: ' + node.localName, 'docx_math_unsupported');
  const name = node.localName;
  if (['oMath', 'oMathPara', 'e', 'num', 'den', 'sub', 'sup', 'deg', 'lim', 'fName', 'box'].includes(name)) return contents(node);
  if (name === 'r') {
    const word = child(node, 'w', 'rPr');
    if (['vanish', 'strike', 'dstrike'].some(key => on(child(word, 'w', key))) || child(word, 'w', 'rStyle'))
      return fail('DOCX contains unsupported equation run formatting.', 'docx_math_unsupported');
    let value = contents(node);
    if (hidden(name, 'nor')) return '\\text{' + value + '}';
    const script = property(name, 'scr', 'roman'), scripts = {roman:'', 'double-struck':'mathbb', script:'mathcal',
      fraktur:'mathfrak', 'sans-serif':'mathsf', monospace:'mathtt'};
    if (!Object.hasOwn(scripts, script)) return fail('DOCX contains an unsupported equation alphabet.', 'docx_math_unsupported');
    const style = property(name, 'sty') || (on(child(word, 'w', 'b')) ? (on(child(word, 'w', 'i')) ? 'bi' : 'b') : 'i');
    if (!['p', 'b', 'i', 'bi'].includes(style)) return fail('DOCX contains unsupported equation run formatting.', 'docx_math_unsupported');
    if (scripts[script]) value = '\\' + scripts[script] + '{' + value + '}';
    const command = style === 'bi' ? 'boldsymbol' : style === 'b' ? 'mathbf' : style === 'p' && !scripts[script] ? 'mathrm' : '';
    return command ? '\\' + command + '{' + value + '}' : value;
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
    return '\\left' + delimiter(property(name, 'begChr', '(')) +
      children(node, 'm', 'e').map(mathTex).join('\\middle' + delimiter(property(name, 'sepChr', '|'))) +
      '\\right' + delimiter(property(name, 'endChr', ')'));
  }
  if (name === 'm') return '\\begin{matrix}' + children(node, 'm', 'mr')
    .map(row => children(row, 'm', 'e').map(mathTex).join(' & ')).join(' \\\\ ') + '\\end{matrix}';
  if (name === 'eqArr') return '\\begin{aligned}' + children(node, 'm', 'e').map(mathTex).join(' \\\\ ') + '\\end{aligned}';
  if (name === 'func') return '\\operatorname{' + part('fName') + '}{' + part('e') + '}';
  if (name === 'limLow' || name === 'limUpp') return (name === 'limLow' ? '\\underset' : '\\overset') +
    '{' + part('lim') + '}{' + part('e') + '}';
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
    return (symbol === '⏟' || symbol === '⏞' ? (below ? '\\underbrace' : '\\overbrace') :
      (below ? '\\underset' : '\\overset') + '{' + text(symbol) + '}') + '{' + part('e') + '}';
  }
  if (name === 'borderBox') {
    if (['strikeH', 'strikeV', 'strikeBLTR', 'strikeTLBR', 'hideTop', 'hideBot', 'hideLeft', 'hideRight'].some(key => hidden(name, key)))
      return fail('DOCX contains an unsupported equation border or strike.', 'docx_math_unsupported');
    return '\\boxed{' + part('e') + '}';
  }
  return fail('DOCX contains an unsupported equation structure: ' + name, 'docx_math_unsupported');
}

export async function readDocx(blob, {embedImage, checkCurrent, signal, onProgress, work} = {}) {
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
  const warnings = new Set(), xmlCache = new Map(), relationCache = new Map(), converted = new Map(), naturalWidths = new Map(), imageRequests = [], rawTables = [];
  const stats = {paragraphs: 0, images: 0, uniqueImages: 0, tables: 0, footnotes: 0, endnotes: 0, comments: 0};
  let xmlBytes = 0, elements = 0, outputBytes = 0;
  const warn = text => warnings.add(text);
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
      const nested = node.children;
      if (nested.length) stack.push({nodes: nested, at: 0});
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
  if (contentType(mainPath) !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')
    return fail('Only ordinary DOCX documents can be imported.');
  const sourceParts = [...(await relationships('')).values()].filter(row => row.type === DOCX_SOURCE.relationship);
  let canonical = null, base = null, equations = new Map();
  if (sourceParts.length) {
    const sourcePart = sourceParts[0];
    const stored = sourceParts.length === 1 && !sourcePart.external && contentType(sourcePart.path) === DOCX_SOURCE.type ? await readDocxSource(files, sourcePart.path, work) : null;
    if (stored?.exact) canonical = stored.source; else { base = stored?.source ?? null; equations = stored?.equations ?? equations; }
    if (canonical === null) warn('The stored Markdown does not match this Word file. Current Word content was imported.');
  }
  const project = canonical === null;
  progress(.2, 'native');
  const main = await readXml(mainPath, 'w', 'document'), body = child(main, 'w', 'body');
  if (!body) return fail('DOCX has no document body.');
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
        familyParts.push({name: part.path, family, bytes, key: fontKey, type});
      }
      const kind = val(child(font, 'w', 'family'));
      if (!familyParts.length) fontKinds.set(family, val(child(font, 'w', 'pitch')) === 'fixed' || kind === 'modern' ? 'mono' : kind === 'roman' ? 'serif' : kind === 'script' ? 'hand' : null);
      else if (builtin) builtinFontFamilies.add(family);
      else for (const part of familyParts) {
        const asset = await readDocxFontPart(part, {asset: project, checkCurrent: work.check});
        if (asset) fontAssets.push(asset);
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
      if (restart !== 0 && (restart === null || restart === index + 1)) counts.delete(abstractId + ':' + deeper);
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
  const paragraphLayout = (properties, heading, list, base) => {
    const layout = {}, align = alignment(properties);
    if (align) layout.align = align;
    const step = referenceType(null).body * 40;
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
  const sequence = async container => {
    const blocks = [], stack = [{nodes: container?.children || [], at: 0}];
    let visited = 0;
    while (stack.length) {
      const frame = stack.at(-1), node = frame.nodes[frame.at++];
      if (!node) { stack.pop(); continue; }
      if ((visited++ & 127) === 0) await work.checkpoint();
      if (is(node, 'w', 'p') || is(node, 'w', 'tbl')) blocks.push(node);
      else if (is(node, 'w', 'sdt')) stack.push({nodes: child(node, 'w', 'sdtContent')?.children || [], at: 0});
      else if (is(node, 'mc', 'AlternateContent')) stack.push({nodes: chooseAlternate(node).children, at: 0});
      else if (is(node, 'w') && ['customXml','ins','moveTo'].includes(node.localName)) {
        if (node.localName !== 'customXml') warn('Revision history was removed; current text was retained.');
        stack.push({nodes: node.children, at: 0});
      } else if (is(node, 'w') && ['del','moveFrom'].includes(node.localName)) warn('Revision history was removed; current text was retained.');
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
    let id, alt = '', extent = null, extentHeight = null, align = null, opacity = 100;
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
      alt = properties?.getAttribute('descr') || properties?.getAttribute('title') || nonVisual?.getAttribute('descr') || nonVisual?.getAttribute('title') || '';
      const display = /^\$\$[\s\S]+\$\$$/.test(alt);
      if (plain && vectors.length === 1 && (display || /^\$[^$]+\$$/.test(alt))) {
        const relation = (await relationships(context.path)).get(attr(vectors[0], 'r', 'embed'));
        if (relation?.kind === 'image' && !relation.external && entries.has(relation.path) && contentType(relation.path) === 'image/svg+xml' &&
            new RegExp('^<svg\\b[^>]*\\sdata-rapier-math="' + (display ? 'display' : 'inline') + '"').test(new TextDecoder().decode((await files.read(relation.path)).subarray(0, 4096))))
          return {html: project ? account('<span class="math-rendered" data-math-src="' + escape(encodeURIComponent(alt)) + '">' + escape(alt) + '</span>') : 'x', semantic: true, displayMath: display};
      }
      extent = integer(child(drawing, 'wp', 'extent')?.getAttribute('cx'), null, 1, 27273042316900);
      extentHeight = integer(child(drawing, 'wp', 'extent')?.getAttribute('cy'), null, 1, 27273042316900);
      if (is(drawing, 'wp', 'anchor')) {
        warn('Floating pictures became normal-flow images in source order.');
        const position = child(drawing, 'wp', 'positionH'), value = child(position, 'wp', 'align')?.textContent;
        if (['left','center','right'].includes(value)) align = value;
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
      id = attr(image, 'r', 'id'); alt = attr(image, 'o', 'title') || '';
      warn('Legacy picture positioning became normal document flow.');
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
    alt = alt.trim() || name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
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
    return {image: project ? account('<img data-rapier-asset="' + converted.get(key) + '" alt="' + escape(alt) + '">') : '<img>', width, align, rotate, opacity};
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
    if (root.starts.length !== 1 || root.ends.length !== 1 || root.starts[0] >= root.ends[0]) continue;
    let group = groupsById.get(root.id);
    if (!group) { group = {id: root.id, resolved: root.resolved, records: [root]}; commentGroups.push(group); groupsById.set(root.id, group); }
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
  let inlineSteps = 0;
  const baseFamily = mergeRunStyle(defaultRun, style(defaultStyle).r).family;
  const mainfont = baseFamily && !fontAssets.some(font => font.family === baseFamily) && !builtinFontFamilies.has(baseFamily) ? fontKinds.get(baseFamily) : null;
  const inline = async (container, context, inherited = {}, pieces = []) => {
    for (const node of container.children) {
      if ((inlineSteps++ & 127) === 0) await work.checkpoint();
      if (is(node, 'w', 'r')) {
        const properties = child(node, 'w', 'rPr'), named = style(val(child(properties, 'w', 'rStyle')));
        const direct = propertiesOf(properties), formatting = {...mergeRunStyle(inherited, named.r), ...direct};
        if (formatting.hidden) { warn('Hidden text was not imported.'); continue; }
        let text = '';
        const projected = {...formatting}, styleName = val(child(styles.get(val(child(properties, 'w', 'rStyle'))), 'w', 'name'));
        if (project && (styleName === 'Verbatim Char' || formatting.family === 'Geist Mono' && builtinFontFamilies.has('Geist Mono')) &&
            Array.from(node.children).every(part => is(part, 'w') && ['rPr','t','tab'].includes(part.localName))) {
          let code = Array.from(node.children, part => is(part, 'w', 't') ? part.textContent : is(part, 'w', 'tab') ? '\t' : '').join('');
          const last = pieces.at(-1), href = context.fields?.findLast(field => field.href)?.href || '';
          const marks = [['bold','strong'], ['italic','em'], ['strike','s']].filter(([key]) => formatting[key]).map(([, tag]) => tag), key = marks.join();
          if (last?.code != null && last.href === href && last.marks === key) { pieces.pop(); code = last.code + code; }
          const fence = '`'.repeat(Math.max(0, ...(code.match(/`+/g) || []).map(ticks => ticks.length)) + 1), pad = /^`|`$|^ (?=.*[^ ]).* $/s.test(code) ? ' ' : '';
          const span = sourceToken(fence + pad + code + pad + fence, (fence + pad + code + pad + fence).replace(/[ \t]/g, '\u00a0'));
          const marked = marks.reduceRight((html, tag) => '<' + tag + '>' + html + '</' + tag + '>', span);
          if (code) pieces.push({html: href ? '<a href="' + escape(href) + '">' + marked + '</a>' : marked, code, href, marks: key});
          continue;
        }
        if (direct.halfPoints == null && named.r.halfPoints == null || context.initial || context.rapierTable && formatting.halfPoints === 21) projected.halfPoints = null;
        if (formatting.family === defaultRun.family && builtinFontFamilies.has(defaultRun.family)) projected.family = null;
        else if (projected.family && !fontAssets.some(font => font.family === projected.family) && !builtinFontFamilies.has(projected.family)) {
          const kind = projected.family === baseFamily ? null : fontKinds.get(projected.family) || null;
          projected.family = kind === mainfont ? null : kind;
          warn(FONT_KINDS);
        }
        if ((context.structuralBold || context.tableHeader && named.structuralBold) &&
            (!Object.hasOwn(named.r, 'bold') || named.structuralBold) && !Object.hasOwn(direct, 'bold')) projected.bold = false;
        const href = context.fields?.findLast(field => field.href)?.href;
        const runKey = JSON.stringify([projected, href || '']), last = pieces.at(-1);
        const wrap = words => (href ? '<a href="' + escape(href) + '">' : '') + textStyle(words, projected) + (href ? '</a>' : '');
        const flush = () => { if (!text) return;
          if (project && last?.runKey === runKey && last === pieces.at(-1)) { last.words += text; last.html = wrap(last.words); }
          else pieces.push(project ? {html: wrap(text), words: text, runKey} : {html:
            projected.smallCaps || projected.highlight && projected.highlight !== 'default' && !Object.values(DOCX_HIGHLIGHT_TO_RAPIER).includes(projected.highlight) ? 'x' : text});
          text = ''; };
        for (const piece of await inline(node, context, formatting)) {
          if (piece.image || piece.semantic) { flush(); pieces.push(piece); }
          else text += piece.html;
        }
        flush();
      } else if (is(node, 'w', 't')) pieces.push({html: await imported(node.textContent)});
      else if (is(node, 'w', 'tab') || is(node, 'w', 'ptab')) { pieces.push({html: project ? sourceToken('&#9;') : 'x'}); warn('Tab characters were retained; custom tab stops became ordinary text flow.'); }
      else if (is(node, 'w', 'sym')) {
        const encoded = attr(node, 'w', 'char'), code = /^[0-9a-f]{1,4}$/i.test(encoded || '') ? parseInt(encoded, 16) : -1;
        if (code < 0x100 || code >= 0xd800 && code <= 0xf8ff || code >= 0xfffe)
          return fail('DOCX contains a symbol that requires its original font mapping.', 'docx_symbol_font');
        pieces.push({html: await imported(String.fromCodePoint(code))});
      }
      else if (is(node, 'm', 'oMath') || is(node, 'm', 'oMathPara')) {
        const displayMath = is(node, 'm', 'oMathPara'), projected = ommlSource(node);
        const source = equations.get(projected) ?? projected;
        pieces.push({html: project ? account('<span class="math-rendered" data-math-src="' + escape(encodeURIComponent(source)) + '">' +
          escape(source) + '</span>') : 'x', semantic: true, displayMath});
      }
      else if (is(node, 'w', 'br') || is(node, 'w', 'cr')) {
        const type = attr(node, 'w', 'type') || node.getAttribute?.('type');
        if (type === 'page') pieces.push({pageBreak: true, semantic: true});
        else {
          pieces.push({html: '<br>'});
          if (type === 'column') warn('Column breaks became line breaks.');
        }
      } else if (is(node, 'w', 'noBreakHyphen')) pieces.push({html: '\u2011'});
      else if (is(node, 'w', 'softHyphen')) pieces.push({html: '\u00ad'});
      else if (is(node, 'w', 'drawing') || is(node, 'w', 'pict') || is(node, 'w', 'object')) pieces.push(await picture(node, context));
      else if (is(node, 'w', 'hyperlink')) {
        const relation = (await relationships(context.path)).get(attr(node, 'r', 'id'));
        const href = relation?.kind === 'hyperlink' && relation.external && LINK_SCHEMES.test(relation.target) && !/[\u0000-\u0020\u007f]/.test(relation.target) ? relation.target : null;
        if (!href) warn('Internal document links became plain text.');
        for (const piece of await inline(node, context, inherited)) {
          if (project && href && !piece.semantic) { if (piece.image) piece.image = '<a href="' + escape(href) + '">' + piece.image + '</a>'; else piece.html = '<a href="' + escape(href) + '">' + piece.html + '</a>'; }
          pieces.push(piece);
        }
      } else if (is(node, 'w', 'sdt')) {
        const checkbox = child(child(node, 'w', 'sdtPr'), 'w14', 'checkbox');
        if (checkbox) {
          const checked = attr(child(checkbox, 'w14', 'checked'), 'w14', 'val');
          if (checked != null && !['0','1','true','false','on','off'].includes(checked)) return fail('DOCX has an invalid checkbox value.');
          pieces.push({html: '<input type="checkbox" disabled' + (['1','true','on'].includes(checked) ? ' checked' : '') + '>', semantic: true});
        } else await inline(child(node, 'w', 'sdtContent') || node, context, inherited, pieces);
      }
      else if (is(node, 'mc', 'AlternateContent')) await inline(chooseAlternate(node), context, inherited, pieces);
      else if (is(node, 'w') && ['smartTag','customXml','fldSimple','ins','moveTo'].includes(node.localName)) {
        if (['ins','moveTo'].includes(node.localName)) warn('Revision history was removed; current text was retained.');
        if (node.localName === 'fldSimple') warn('Fields became their stored displayed text.');
        await inline(node, context, inherited, pieces);
      } else if (is(node, 'w') && ['del','moveFrom'].includes(node.localName)) warn('Revision history was removed; current text was retained.');
      else if (is(node, 'w', 'commentReference') && activeComments.has(integer(attr(node, 'w', 'id')))) continue;
      else if (is(node, 'w') && ['footnoteReference','endnoteReference','commentReference'].includes(node.localName)) pieces.push({html: await noteReference(node, context), semantic: true});
      else if (is(node, 'w') && ['instrText','fldChar'].includes(node.localName)) {
        const fields = context.fields || [], type = attr(node, 'w', 'fldCharType'), field = fields.at(-1);
        if (type === 'begin') fields.push({instruction: ''});
        else if (type === 'end') fields.pop();
        else if (field && type === 'separate') {
          const target = /^\s*HYPERLINK\s+"([^"]+)"/.exec(field.instruction), anchor = /\\l\s+"([^"]+)"/.exec(field.instruction);
          const href = target && target[1] + (anchor ? '#' + anchor[1] : '');
          if (href && LINK_SCHEMES.test(href) && !/[\u0000-\u0020\u007f]/.test(href)) field.href = href;
        } else if (field && !type) field.instruction += node.textContent;
        if (!type && !/^\s*HYPERLINK\s+"/.test(field?.instruction || '')) warn('Fields became their stored displayed text.');
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
    if (id === 'RapierBlockSpacing' && val(child(styles.get(id), 'w', 'name')) === 'Rapier Block Spacing' &&
        Array.from(node.children).every(part => is(part, 'w', 'pPr')))
      return {html: () => '', list: null};
    const definition = !context.tableCell && !context.note && Object.hasOwn(DEFINITION_NAMES, id || '') && val(child(styles.get(id), 'w', 'name')) === DEFINITION_NAMES[id] ? id : null;
    const named = style(id), direct = paragraphProperties(properties), base = mergeParagraphProperties(defaultParagraph, context.p, named.p, direct);
    const list = numbering(base, id), effective = mergeParagraphProperties(defaultParagraph, context.p, list?.p, named.p, direct);
    const indents = child(properties, 'w', 'numPr') ? mergeParagraphProperties(defaultParagraph, context.p, named.p, list?.p, direct) : effective;
    for (const key of ['leftIndent', 'firstIndent', 'tabs']) if (Object.hasOwn(indents, key)) effective[key] = indents[key];
    if (definition === 'RapierDefinition' && effective.leftIndent === DEFINITION_INDENT && !Object.hasOwn(direct, 'leftIndent')) delete effective.leftIndent;
    if (!context.tableCell && !effective.bidi && ['left', 'start'].includes(effective.align)) delete effective.align;
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
    const pieces = await inline(node, {...context, fields: [], initial: !!effective.dropLines, structuralBold: !!named.structuralBold && !!inherited.bold &&
      !!(inferredHeading || context.tableHeader)}, inherited), output = [];
    const bottom = val(child(child(properties, 'w', 'pBdr'), 'w', 'bottom') || child(child(child(styles.get(id), 'w', 'pPr'), 'w', 'pBdr'), 'w', 'bottom'));
    if (!pieces.length && !list && bottom && !['nil','none'].includes(bottom)) return {html: () => project ? '<hr>' : '', list: null};
    const codeStyle = /^(?:Source Code|HTML Preformatted|Plain Text)$|^Source Code \(([^()\s]+)\)$/.exec(val(child(styles.get(id), 'w', 'name')) || '');
    if (!list && !context.tableCell && !inferredHeading && pieces.every(piece => !piece.image && !piece.semantic) && codeStyle) {
      let code = '';
      const words = parent => { for (const part of parent.children) {
        if (is(part, 'w') && ['pPr','rPr','del','moveFrom','instrText'].includes(part.localName)) continue;
        if (is(part, 'w', 't')) code += part.textContent;
        else if (is(part, 'w', 'tab')) code += '\t';
        else if (is(part, 'w', 'br') || is(part, 'w', 'cr')) code += '\n';
        else words(part);
      } };
      words(node);
      return {html: () => '', code, language: codeStyle[1] || '', list: null};
    }
    if (list?.unmarked) for (const item of descendants(node)) {
      if (is(item, 'w14', 'checkbox')) { list.task = true; break; }
      await work.checkpoint();
    }
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
    for (const piece of pieces) {
      if (piece.displayMath) { flush(); output.push('<p>' + piece.html + '</p>'); continue; }
      if (piece.rule) { flush(); output.push('<hr>'); continue; }
      if (piece.pageBreak) {
        flush();
        output.push('<div class="rapier-page-break" data-md-break="page" contenteditable="false" role="separator" aria-label="Page break"><br></div>');
        continue;
      }
      if (!piece.image) { text += piece.html; continue; }
      flush();
      const layout = {}, imageAlign = piece.align || align;
      if (imageAlign && imageAlign !== 'justify') layout.align = imageAlign;
      if (piece.width !== null) layout.width = piece.width;
      if (piece.rotate) layout.rotate = piece.rotate;
      if (piece.opacity < 100) layout.opacity = piece.opacity;
      if (context.figure) Object.assign(layout, context.figure);
      output.push('<p' + annotation(layout) + '>' + piece.image + '</p>');
    }
    flush();
    if (!output.length) output.push('<p><br></p>');
    if (pieces.some(piece => piece.image) && pieces.some(piece => piece.html?.trim())) warn('Pictures within text became separate source-order paragraphs.');
    const prose = tag === 'p' && !context.tableCell && output.length === 1 && pieces.every(piece => !piece.image && !piece.pageBreak && !piece.displayMath && !piece.rule);
    const initial = prose && effective.dropLines ? pieces.map(piece => piece.html || '').join('') : null;
    const spacing = side => on(child(properties, 'w', 'contextualSpacing')) ? 0 : Number(/^\d+$/.exec(attr(child(properties, 'w', 'spacing'), 'w', side) || '')?.[0] || 0);
    return {html: base => output.map(piece => typeof piece === 'function' ? piece(base) : piece).join(''),
      layout: base => paragraphLayout(effective, inferredHeading, list, base), list, tableCell: context.tableCell,
      before: spacing('before'), after: spacing('after'),
      prose, initial, dropLines: effective.dropLines, definition, quote: !inferredHeading && (id === 'Quote' || ['Intense Quote','Block Text'].includes(val(child(styles.get(id), 'w', 'name'))))};
  };
  const groupLists = async blocks => {
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
    let code = null, language = '', definitions = false;
    const closeDefinitions = () => { if (definitions) { definitions = false; if (project) emit('</dl>'); } };
    const flushCode = () => { if (code != null) { while (stack.length) close();
      emit(project ? account('<pre><code' + (language ? ' class="language-' + escape(language) + '"' : '') + '>' + escape(code) + '</code></pre>') : 'x'); code = null; } };
    for await (const block of blocks) {
      if ((visited++ & 127) === 0) await work.checkpoint();
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
      const content = base => block.quote ? '<blockquote>' + block.html(base) + '</blockquote>' : block.html(base);
      if (!block.list) { while (stack.length) close(); emit(content(0)); continue; }
      const list = block.list;
      const same = prior => prior.tag === list.tag && (prior.id === list.id || list.tag === 'ul' && (prior.task || list.task) || list.tag === 'ol' && prior.delimiter === list.delimiter);
      while (stack.length && (stack.at(-1).level > list.level || stack.at(-1).level === list.level && !same(stack.at(-1)))) close();
      if (stack.length && stack.at(-1).level === list.level) { if (project) emit('</li>'); stack.at(-1).loose ||= stack.at(-1).after + block.before >= 240; }
      else {
        const parentMarker = block.tableCell && stack.at(-1)?.marker;
        const start = '<' + list.tag + (list.tag === 'ol' ? ' start="' + list.ordinal + '" data-rapier-list-numbering="authored" data-rapier-list-delimiter="' + list.delimiter + '"' : '') +
          (parentMarker ? ' style="' + indentStyle({indent: -parentMarker}, {portable: true, pointSize: referenceType(null).body}) + '"' : '') + '>';
        if (project) emit(start);
        stack.push({...list, base: (stack.at(-1)?.base || 0) + (list.tag === 'ol' ? 660 : 300), open: parts.length - 1, items: [], loose: false, tableCell: block.tableCell});
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
    flushCode();
    closeDefinitions();
    while (stack.length) close();
    return project ? parts.join('') : (hasImage ? '<img>' : '') + (hasText ? 'x' : '');
  };
  const renderBlocks = async (nodes, context, sectionContexts = null) => {
    const blocks = async function* () {
    let previous = null;
    for (let index = 0; index < nodes.length; index++) {
      await work.checkpoint();
      const node = nodes[index], active = sectionContexts ? {...context, ...sectionContexts[index]} : context;
      const kind = !context.tableCell && is(node, 'w', 'p') && calloutKind(node);
      if (kind) {
        let end = index + 1;
        while (end < nodes.length && is(nodes[end], 'w', 'p') && calloutRule(nodes[end]) === calloutRule(node)) end++;
        const html = await callout(kind, nodes.slice(index + 1, end), active);
        if (previous) yield previous;
        previous = {html: () => html, list: null};
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
        previous = {html: () => html, list: null};
      }
    }
    if (previous) yield previous;
    };
    return groupLists(blocks());
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
      } else if (is(node, 'w') && ['customXml','ins','moveTo'].includes(node.localName)) {
        if (node.localName !== 'customXml') warn('Revision history was removed; current text was retained.');
        stack.push({nodes: node.children, at: 0});
      } else if (is(node, 'mc', 'AlternateContent')) stack.push({nodes: chooseAlternate(node).children, at: 0});
      else if (is(node, 'w') && ['del','moveFrom'].includes(node.localName)) warn('Revision history was removed; current text was retained.');
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
      return renderBlocks(inner, {...context, figure: {wrap: 'around', x: percent((integer(attr(float, 'w', 'tblpX'), 0) + cellWidth / 2) * 635), width: percent(cellWidth * 635)}});
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
        const html = await renderBlocks(cellBlocks, {...context, tableCell: true, tableHeader: on(child(child(row, 'w', 'trPr'), 'w', 'tblHeader')) === true, rapierTable,
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
    rawTables.push({placeholder, html});
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
  const unplaced = [];
  for (const id of commentPart?.records.keys() || []) if (!activeComments.has(id) && !notes.has('docx-comment-' + id))
    unplaced.push(await registerNote('comment', id, {path: mainPath, p: {}, ...currentSection}));
  if (unplaced.length) html += '<p>' + unplaced.join(' ') + '</p>';
  if (notes.size) {
    const items = [];
    for (const note of notes.values()) {
      await work.checkpoint();
      items.push('<li id="fn-' + note.label + '" data-footnote-label="' + note.label + '">' +
        note.metadata + await renderBlocks(await sequence(note.content), note.context) + '</li>');
    }
    html += '<section class="footnotes"><ol>' + items.join('') + '</ol></section>';
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
    comments.threads.push({id: 'word-thread-' + group.id, wordId: group.id, resolved: group.resolved, messages});
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
  if (rawTables.length) {
    const urls = new Map(imageResults.map((image, index) => ['docx-pending-' + index, image.url])), replacements = new Map();
    for (const table of rawTables) {
      await work.checkpoint();
      replacements.set(table.placeholder, '<p>' + sourceToken(docxPortableHtml(table.html, urls)) + '</p>');
    }
    const replaceTables = value => value.replace(/<p><span class="rapier-source-token" data-rapier-source="[^"]*" data-rapier-visible="[^"]*">[^<]*<\/span><\/p>/g,
      token => replacements.get(token) || token);
    html = replaceTables(html);
    for (const thread of comments.threads) for (const message of thread.messages) {
      await work.checkpoint(); message.html = replaceTables(message.html);
    }
    rawTables.length = 0;
  }
  html = html.replace(/data-rapier-asset="(docx-pending-\d+)"/g, (_, key) => 'data-rapier-asset="' + references.get(key) + '"');
  if (html.length > ARCHIVE_LIMITS.bytes || new Blob([html]).size > ARCHIVE_LIMITS.bytes) return fail('Converted DOCX exceeds the 25 MB document limit.');
  for (const thread of comments.threads) for (const message of thread.messages)
    message.html = message.html.replace(/data-rapier-asset="(docx-pending-\d+)"/g, (_, key) => 'data-rapier-asset="' + references.get(key) + '"');
  progress(1, 'complete');
  return {html, warnings: [...warnings], stats, ...(comments.threads.length ? {comments} : {}),
    ...(fontAssets.length ? {fontAssets} : {}),
    ...(nativeLanguage ? {language: nativeLanguage} : {}), ...(mainfont ? {mainfont} : {}), ...(base !== null ? {base} : {})};
  } finally { files.close(); }
}

function mergeDocxBase(edited, base) {
  let parser;
  try { parser = markdownParser(); } catch (_) { return edited; }
  if (base.includes('\r')) return edited;
  const blocks = text => {
    const offset = frontMatterFrame(text).closing?.next ?? 0, body = text.slice(offset), starts = [0];
    for (const line of body.split('\n')) starts.push(starts.at(-1) + line.length + 1);
    const tokens = parser.parse(body, {}), result = [];
    for (let at = 0; at < tokens.length; at++) {
      const open = tokens[at];
      if (open.level !== 0 || !open.map) continue;
      let end = at;
      for (let depth = 0; end < tokens.length; end++) if ((depth += tokens[end].nesting) <= 0) break;
      const parts = [], words = [];
      const flush = () => { if (words.length) parts.push(words.join('').replace(/\s+/g, ' ').trim()); words.length = 0; };
      const visit = token => {
        // An escaped character is the character (markdown-it's text_special, Rapier's own rapier_escape).
        if (['text', 'text_special', 'rapier_escape', 'softbreak'].includes(token.type)) { words.push(token.type === 'softbreak' ? ' ' : token.content); return; }
        flush();
        if (token.children) { parts.push(token.type); token.children.forEach(visit); flush(); return; }
        parts.push([token.type, token.tag, token.hidden, token.info, token.attrGet?.('href'), token.attrGet?.('src'), token.type === 'inline' ? '' : token.content].join('\u0000'));
      };
      tokens.slice(at, end + 1).forEach(visit); flush();
      const start = offset + starts[open.map[0]], stop = offset + Math.min(body.length, starts[open.map[1]] - 1), raw = text.slice(start, stop);
      const links = tokens.slice(at, end + 1).flatMap(token => token.children || [token]).filter(token => token.type === 'link_open' || token.type === 'image').length;
      result.push({start, stop, key: parts.join('\u0001'), inline: links <= raw.split('](').length - 1});
      at = end;
    }
    return result;
  };
  const kept = blocks(base).filter(block => block.inline), byKey = new Map();
  kept.forEach((block, index) => { if (!byKey.has(block.key)) byKey.set(block.key, []); byKey.get(block.key).push(index); });
  let merged = '', cursor = 0, floor = 0;
  for (const block of blocks(edited)) {
    const index = byKey.get(block.key)?.find(candidate => candidate >= floor);
    if (index === undefined) continue;
    merged += edited.slice(cursor, block.start) + base.slice(kept[index].start, kept[index].stop);
    cursor = block.stop; floor = index + 1;
  }
  return merged + edited.slice(cursor);
}

export function finishDocxMarkdown(source, result, {convertHtml} = {}) {
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
    if (!range.invalid && range.end > range.start) attached.push({id: thread.id, resolved: thread.resolved, messages,
      anchor: commentAnchor('text', range.start, range.end, body, parseComments(body))});
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

export function docxPortableHtml(html, imageUrls = new Map()) {
  html = html.replace(/<span class="math-rendered" data-math-src="([^"]*)">([\s\S]*?)<\/span>/g, (_, encoded, visible) => {
    const source = decodeURIComponent(encoded);
    if (escape(source) !== visible) return fail('DOCX equation source proof does not match.', 'docx_source_token');
    return escape(source);
  });
  html = html.replace(/<span class="rapier-source-token" data-rapier-source="([^"]*)" data-rapier-visible="\1">([\s\S]*?)<\/span>/g,
    (whole, encoded, visible) => {
      const source = decodeURIComponent(encoded);
      if (escape(source) !== visible) return fail('DOCX source token proof does not match.', 'docx_source_token');
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

const DOCX_HEADING_SCALE = Object.freeze([2.6, 1.9, 1.5, 1.25, 1.1, 1]);
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
  if (node.hasAttribute('data-math-src')) {
    const encoded = node.getAttribute('data-math-src');
    try { source = decodeURIComponent(encoded); } catch (_) { source = encoded; }
  }
  const display = source.startsWith('$$') && source.endsWith('$$');
  const run = {...style, type: 'math', source, display};
  const tex = /^\$\$([\s\S]+)\$\$$|^\$([^$]+)\$$/.exec(source), toMathML = globalThis.RapierMath?.toMathML;
  if (tex && typeof toMathML === 'function') {
    try {
      const {mathml, status} = toMathML(tex[1] ?? tex[2], {displayMode: display});
      if (status === 'complete') return {...run, omml: nativeEquationXml(mathmlRecord(new DOMParser().parseFromString(mathml, 'application/xml').documentElement, style))};
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
function nearestHighlight(value) {
  const hex = cssColorHex(value);
  if (!hex) return 'default';
  const exact = Object.keys(DOCX_HIGHLIGHT_HEX).find(name => DOCX_HIGHLIGHT_HEX[name] === hex);
  if (exact) return DOCX_HIGHLIGHT_TO_RAPIER[exact] || exact;
  const rgb = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16));
  let best = 'yellow', bestD = Infinity;
  for (const [name, ref] of Object.entries(HIGHLIGHT_RGB)) {
    const d = ref.reduce((sum, c, i) => sum + (c - rgb[i]) ** 2, 0);
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
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
    for (const part of text.split('\u2029')) { parts.push({part, at}); at += part.length + 1; }
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
const LINK_SCHEMES = /^(?:https?:\/\/|ftps?:\/\/|mailto:|tel:|callto:|sms:|xmpp:|matrix:)/i;
const DEFINITION_STYLES = {term: 'RapierTerm', detail: 'RapierDefinition'}, DEFINITION_INDENT = 720,
  DEFINITION_NAMES = {RapierTerm: 'Rapier Definition Term', RapierDefinition: 'Rapier Definition'};

function mathmlRecord(root, style = {}) {
  const namespace = 'http://www.w3.org/1998/Math/MathML', words = [];
  const variants = {normal: ['p', 'roman'], bold: ['b', 'roman'], italic: ['i', 'roman'], 'bold-italic': ['bi', 'roman'],
    'double-struck': ['p', 'double-struck'], script: ['p', 'script'], 'bold-script': ['b', 'script'],
    fraktur: ['p', 'fraktur'], 'bold-fraktur': ['b', 'fraktur'], 'sans-serif': ['p', 'sans-serif'],
    'bold-sans-serif': ['b', 'sans-serif'], 'sans-serif-italic': ['i', 'sans-serif'],
    'sans-serif-bold-italic': ['bi', 'sans-serif'], monospace: ['p', 'monospace']};
  let count = 0;
  const refuse = reason => fail('DOCX cannot represent this MathML faithfully: ' + reason + '. The original equation remains in the document source.', 'docx_mathml_unsupported');
  const textRun = (text, props = '<m:sty m:val="p"/>') => '<m:r><m:rPr>' + props + '</m:rPr><m:t xml:space="preserve">' + escape(text) + '</m:t></m:r>';
  const convert = (node, inherited = null, depth = 0) => {
    if (++count > DOCX_LIMITS.elements || depth > DOCX_LIMITS.depth) return refuse('equation limit');
    if (node.namespaceURI !== namespace) return refuse('MathML namespace is required');
    const name = node.localName.toLowerCase(), elements = Array.from(node.children), own = node.getAttribute('mathvariant');
    const variant = own || inherited;
    if (variant && !Object.hasOwn(variants, variant)) return refuse('mathvariant=' + variant);
    const specific = {math: ['display'], mfrac: ['linethickness', 'bevelled'], mfenced: ['open', 'close', 'separators'],
      mo: ['form', 'stretchy', 'fence', 'separator', 'symmetric', 'largeop', 'movablelimits', 'lspace', 'rspace', 'minsize', 'maxsize', 'accent'],
      mover: ['accent'], munder: ['accentunder'], munderover: ['accent', 'accentunder'], mspace: ['width', 'height', 'depth'],
      mstyle: ['displaystyle'], mtable: ['columnalign', 'rowalign', 'columnspacing', 'rowspacing', 'displaystyle', 'width', 'equalrows', 'equalcolumns'],
      mtr: ['columnalign', 'rowalign'], mtd: ['columnalign', 'rowalign', 'style']}[name] || [];
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:') || attribute.name.startsWith('data-') || ['id', 'title', 'mathvariant'].includes(attribute.name) || specific.includes(attribute.name) ||
        attribute.name === 'scriptlevel' && attribute.value === '0') continue;
      return refuse('<' + name + '> attribute ' + attribute.name);
    }
    const arity = n => { if (elements.length !== n) refuse('<' + name + '> needs ' + n + ' arguments'); };
    const childrenXml = () => elements.map(element => convert(element, variant, depth + 1)).join('');
    const argument = (tag, element) => '<m:' + tag + '>' + convert(element, variant, depth + 1) + '</m:' + tag + '>';
    if (['mi', 'mn', 'mo', 'mtext'].includes(name)) {
      if (elements.length) return refuse('<' + name + '> contains elements');
      const text = node.textContent.replace(/[\t\r\n ]+/g, ' ').trim(); words.push(text);
      let [shape, script] = variant ? variants[variant] : [name === 'mi' && Array.from(text).length === 1 ? 'i' : 'p', 'roman'];
      if (!variant && style.bold) shape = shape === 'i' ? 'bi' : 'b';
      return textRun(text, (name === 'mtext' ? '<m:nor/>' : '') + '<m:scr m:val="' + script + '"/><m:sty m:val="' + shape + '"/>');
    }
    if (Array.from(node.childNodes).some(child => child.nodeType === 3 && child.nodeValue.trim())) return refuse('text outside a MathML token');
    if (name === 'math') {
      if (node.hasAttribute('display') && !['inline', 'block'].includes(node.getAttribute('display'))) return refuse('display value');
      return childrenXml();
    }
    if (name === 'mrow' || name === 'mstyle') return childrenXml();
    if (name === 'mspace') return '';
    if (name === 'munder' || name === 'mover' || name === 'munderover') {
      arity(name === 'munderover' ? 3 : 2);
      const accent = name === 'mover' && node.getAttribute('accent') === 'true' && elements[1].localName === 'mo' && Array.from(elements[1].textContent.trim()).length === 1;
      if (accent) return '<m:acc><m:accPr><m:chr m:val="' + escape(elements[1].textContent.trim()) + '"/></m:accPr>' + argument('e', elements[0]) + '</m:acc>';
      const lower = name === 'mover' ? convert(elements[0], variant, depth + 1) : '<m:limLow>' + argument('e', elements[0]) + argument('lim', elements[1]) + '</m:limLow>';
      return name === 'munder' ? lower : '<m:limUpp><m:e>' + lower + '</m:e>' + argument('lim', elements[name === 'mover' ? 1 : 2]) + '</m:limUpp>';
    }
    if (name === 'semantics') {
      if (!elements.length || elements.slice(1).some(element => !['annotation', 'annotation-xml'].includes(element.localName))) return refuse('semantics alternatives');
      return convert(elements[0], variant, depth + 1);
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
      const base = name === 'msqrt' ? childrenXml() : convert(elements[0], variant, depth + 1);
      const degree = name === 'msqrt' ? '' : convert(elements[1], variant, depth + 1);
      return '<m:rad><m:radPr><m:degHide m:val="' + (name === 'msqrt' ? '1' : '0') + '"/></m:radPr>' +
        '<m:deg>' + degree + '</m:deg><m:e>' + base + '</m:e></m:rad>';
    }
    if (name === 'mfenced') {
      const open = node.getAttribute('open') ?? '(', close = node.getAttribute('close') ?? ')';
      if (Array.from(open).length > 1 || Array.from(close).length > 1) return refuse('multi-character fence');
      const separators = Array.from((node.getAttribute('separators') ?? ',').replace(/\s/g, ''));
      const body = elements.map((element, index) => (index && separators.length ? textRun(separators[Math.min(index - 1, separators.length - 1)]) : '') +
        convert(element, variant, depth + 1)).join('');
      return '<m:d><m:dPr><m:begChr m:val="' + escape(open) + '"/><m:endChr m:val="' + escape(close) + '"/></m:dPr><m:e>' + body + '</m:e></m:d>';
    }
    if (name === 'mtable') {
      const columns = elements[0]?.children.length;
      if (!columns || columns > DOCX_LIMITS.tableColumns || elements.some(row => row.localName !== 'mtr' || row.children.length !== columns ||
          Array.from(row.children).some(cell => cell.localName !== 'mtd'))) return refuse('nonrectangular matrix');
      return '<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="' + columns + '"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>' + childrenXml() + '</m:m>';
    }
    if (name === 'mtr' && node.parentNode?.localName === 'mtable') return '<m:mr>' + childrenXml() + '</m:mr>';
    if (name === 'mtd' && node.parentNode?.localName === 'mtr') return '<m:e>' + childrenXml() + '</m:e>';
    return refuse('<' + name + '>');
  };
  if (root.localName?.toLowerCase() !== 'math') return refuse('math root is required');
  const xml = '<m:oMath xmlns:m="' + NS.m[0] + '">' + convert(root) + '</m:oMath>';
  const record = {...style, type: 'mathml', text: words.join(''), display: root.getAttribute('display') === 'block'};
  docxEquations.set(record, record.display ? '<m:oMathPara xmlns:m="' + NS.m[0] + '"><m:oMathParaPr><m:jc m:val="center"/></m:oMathParaPr>' + xml + '</m:oMathPara>' : xml);
  return record;
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

function projectDocxComments(root, model, canonical) {
  const parsed = parseComments(canonical), threads = commentThreads(canonical, parsed);
  if (!threads.length) return model;
  const parser = markdownParser(), references = documentAssets(canonical).references, render = (source, env = {}) => {
    const template = root.ownerDocument.createElement('template');
    env.references = {...references};
    template.innerHTML = parser.render(source.slice(markdownBodyOffset(source)), env);
    return docxBlocksFromDom(template.content);
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
        if (/^data:image\//i.test(src)) out.push({...style, type: 'image', alt: child.getAttribute('alt') || '', src, ref: null,
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
      else if (tag === 'SUB') next.sub = true;
      else if (tag === 'SUP') next.sup = true;
      else if (tag === 'MARK') next.highlight = HIGHLIGHT_TO_DOCX[child.getAttribute('data-rapier-highlight')] ? child.getAttribute('data-rapier-highlight') :
        cssColorHex(child.style?.backgroundColor) === HIGHLIGHT_HEX.yellow ? 'default' : nearestHighlight(child.style?.backgroundColor || child.getAttribute('style'));
      else if (tag === 'SPAN' && child.hasAttribute('data-md-color')) next.color = child.getAttribute('data-md-color');
      else if (tag === 'SPAN' && cssColorHex(child.style?.color)) next.color = cssColorHex(child.style.color);
      else if (tag === 'A') {
        const href = child.getAttribute('href') || '';
        if (href.startsWith('#') || LINK_SCHEMES.test(href)) next.href = href;
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
            if (image.caption) content.unshift({type: 'paragraph', runs: [{type: 'text', text: 'Figure: ' + image.caption}], layout: {align: 'center'}});
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
      const label = element.querySelector('p > strong:first-child');
      const kind = label && /^(Note|Tip|Important|Warning|Caution|Danger|Info): $/.test(label.textContent) ? label.textContent.slice(0, -2).toUpperCase() : null;
      const color = cssColorHex(element.style?.borderInlineStartColor);
      const decoration = {...(kind ? {kind} : {}), ...(color ? {color} : {})};
      const clone = (yield* cloneTree(element));
      if (kind) clone.querySelector('p > strong:first-child').remove();
      const content = yield* nestedBlocks(clone);
      const nativeQuote = !kind;
      if (content.length === 1 && content[0].type === 'paragraph') {
        blocks.push({...content[0], type: kind ? 'callout' : 'quote', ...decoration,
          ...(nativeQuote ? {nativeQuote: true} : {}), direction: directionOf(element)});
      } else blocks.push({type: kind ? 'callout' : 'quote', ...decoration,
        blocks: nativeQuote ? content.map(block => block.type === 'paragraph' ? {...block, type: 'quote', nativeQuote: true} : block) : content,
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
      if (images.length === 1 && !element.textContent.trim() && !images[0].closest('a')) {
        const image = images[0];
        blocks.push({type: 'image', alt: image.getAttribute('alt') || '', src: image.getAttribute('src') || '', ref: null, layout: layoutOf(image) || layoutOf(element), original: animationOf(image),
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
  if (style.highlight === 'yellow') bits.push('<w:shd w:val="clear" w:color="auto" w:fill="' + HIGHLIGHT_HEX.yellow.slice(1).toUpperCase() + '"/>');
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

function referenceSpacing(settings) {
  const unit = referenceType(settings).body / 13.2 * 15, measure = value => integer(Math.round(value * unit));
  return {paragraph: measure(8), block: measure(12), heading: [measure(20), measure(4)]};
}

function documentDefaultsXml(settings, hyphens) {
  if (!settings && !hyphens) return '';
  const type = referenceType(settings), half = integer(Math.max(1, Math.round(type.body * 2)));
  const run = [];
  const family = settings?.mainfont?.word || settings?.sansfont?.word || 'Geist';
  if (family) run.push(fontFamilyXml(family));
  run.push('<w:sz w:val="' + half + '"/><w:szCs w:val="' + half + '"/>');
  if (languageTag(settings?.lang)) run.push('<w:lang w:val="' + documentLanguage(settings) + '"/>');
  const line = Math.max(1, Math.round(type.line * 20));
  const spacing = spacingXml({line, lineRule: 'atLeast',
    before: 0, after: referenceSpacing(settings).paragraph});
  return '<w:docDefaults>' +
    (run.length ? '<w:rPrDefault><w:rPr>' + run.join('') + '</w:rPr></w:rPrDefault>' : '') +
    '<w:pPrDefault><w:pPr>' + (hyphens ? '<w:suppressAutoHyphens/>' : '') + spacing + '</w:pPr></w:pPrDefault>' +
    '</w:docDefaults>';
}

function sectionPropertiesXml(settings, footerId) {
  const base = !settings || (!settings.papersize && !settings.geometry && !footerId);
  if (base) return '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
  const width = settings.papersize ? settings.papersize.width : 12240;
  const height = settings.papersize ? settings.papersize.height : 15840;
  const margin = settings.geometry ? settings.geometry.twips : 1440;
  const footer = footerId ? '<w:footerReference w:type="default" r:id="' + footerId + '"/>' : '';
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

export async function writeDocx(input, {convertImage, rewriteDocument, canonical, bom = false, work} = {}) {
  check(work);
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
  const settings = typeof canonical === 'string' ? readDocumentSettings(canonical) : null;
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
  let hyphenation = false, quotations = false, definitions = false, tableHeaderStyle = false, sourceCode = false, tableStyle = false;
  const codeLanguages = new Map();
  const bodyPointSize = referenceType(settings).body;
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
  const pictureXml = (asset, alt, layout, availableWidth = contentWidthEmu, baseline = 0, cap = null) => {
    const {cx, cy} = pictureSize(asset, layout, availableWidth, cap);
    const pr = docPr++;
    const description = escape(alt || '').replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
    const rot = layout?.rotate ? Math.round(((layout.rotate * 60000) % 21600000 + 21600000) % 21600000) : 0;
    const effects = (layout?.opacity < 100 ? '<a:alphaModFix amt="' + layout.opacity * 1000 + '"/>' : '') +
      (asset.svgId ? '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="' + NS.svg[0] +
        '" r:embed="' + asset.svgId + '"/></a:ext></a:extLst>' : '') +
      (asset.originalId ? '<a:extLst><a:ext uri="' + NS.rapier[0] + '/original"><rapier:original xmlns:rapier="' + NS.rapier[0] +
        '" r:embed="' + asset.originalId + '"/></a:ext></a:extLst>' : '');
    const graphic = '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + pr + '" name="Picture ' + pr + '" descr="' + description + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + asset.id + (effects ? '">' + effects + '</a:blip>' : '"/>') +
      '<a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm' + (rot ? ' rot="' + rot + '"' : '') + '><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>';
    const floating = layout?.wrap;
    const left = Math.round(Math.max(0, Math.min(availableWidth - cx, availableWidth * (layout?.x ?? 0) / 100 - cx / 2)));
    const top = Math.round((layout?.y || 0) * bodyPointSize * 12700);
    const distance = ['around', 'box'].includes(floating) ? wrapDistances(availableWidth, left, cx) : {left: 91440, right: 91440};
    const placement = cap ? '<wp:anchor distT="0" distB="0" distL="0" distR="50800" simplePos="0" relativeHeight="0" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="0">' +
      '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="character"><wp:posOffset>0</wp:posOffset></wp:positionH>' +
      '<wp:positionV relativeFrom="line"><wp:posOffset>' + Math.round(cap.top || 0) + '</wp:posOffset></wp:positionV>' : floating ? '<wp:anchor distT="0" distB="0" distL="' + distance.left + '" distR="' + distance.right + '" simplePos="0" relativeHeight="' + pr +
      '" behindDoc="' + (floating === 'behind' ? '1' : '0') + '" locked="0" layoutInCell="1" allowOverlap="1">' +
      '<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>' + left + '</wp:posOffset></wp:positionH>' +
      '<wp:positionV relativeFrom="paragraph"><wp:posOffset>' + top + '</wp:posOffset></wp:positionV>' :
      '<wp:inline distT="0" distB="0" distL="0" distR="0">';
    const wrapping = cap ? '<wp:wrapSquare wrapText="right"/>' : !floating ? '' : ['behind', 'front'].includes(floating) ? '<wp:wrapNone/>' : '<wp:wrapSquare wrapText="bothSides"/>';
    return '<w:r>' + (baseline ? '<w:rPr><w:position w:val="' + Math.round(baseline * 2) + '"/></w:rPr>' : '') + '<w:drawing>' + placement +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      wrapping +
      '<wp:docPr id="' + pr + '" name="Picture ' + pr + '" descr="' + description + '"/><wp:cNvGraphicFramePr/>' +
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

  const emitRuns = async (runList, targets = navigation, availableWidth = contentWidthEmu, runDefaults = null) => {
    let xml = '';
    for (const authored of runList) {
      await tick();
      const run = runDefaults ? {...runDefaults, ...authored} : authored;
      if (run.type === 'bookmarkStart' || run.type === 'bookmarkEnd') {
        const mark = targets.bookmarks.get(run.bookmark);
        xml += run.type === 'bookmarkStart'
          ? '<w:bookmarkStart w:id="' + mark.id + '" w:name="' + mark.name + '"/>'
          : '<w:bookmarkEnd w:id="' + mark.id + '"/>';
        continue;
      }
      const internal = run.href?.startsWith('#');
      const target = internal && targets.resolve(run.href);
      const link = inner => {
        if (target) return '<w:hyperlink w:anchor="' + target.name + '">' + inner + '</w:hyperlink>';
        if (run.type === 'image' && run.href && !internal) {
          const id = nextRid(); rels.push({id, type: 'hyperlink', target: run.href, external: true});
          return '<w:hyperlink r:id="' + id + '">' + inner + '</w:hyperlink>';
        }
        return inner;
      };
      if (run.type === 'image') {
        const src = resolveSrc(run);
        if (!src) continue;
        xml += commentObjectXml(link(pictureXml(await assetFor(src, run.alt, false, run.original), run.alt, run.layout || null, availableWidth)), run);
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
          xml += link(events.filter(event => event.start).map(commentEventXml).join('') + run.omml + events.filter(event => !event.start).map(commentEventXml).join(''));
          equations.push([ommlSource(new DOMParser().parseFromString(run.omml, 'application/xml').documentElement), source]);
        }
        else if (run.svg) {
          const picture = pictureXml(await mathAssetFor(run), run.alternative || source, null, availableWidth, run.display ? 0 : -(run.depth || 0));
          xml += link(events.filter(event => event.start).map(commentEventXml).join('') + picture + events.filter(event => !event.start).map(commentEventXml).join(''));
        } else xml += link(commentedTextXml(source, run));
        continue;
      }
      if (run.type === 'mathml') {
        xml += commentObjectXml(link(nativeEquationXml(authored)), authored);
        continue;
      }
      const text = run.text ?? '';
      if (!text) continue;
      if (internal) xml += link(commentedTextXml(text, target ? {...run, underline: true} : run));
      else if (run.href) {
        const id = nextRid();
        rels.push({id, type: 'hyperlink', target: run.href, external: true});
        xml += '<w:hyperlink r:id="' + id + '">' + commentedTextXml(text, {...run, underline: true}) + '</w:hyperlink>';
      } else xml += commentedTextXml(text, run);
    }
    return xml;
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
  const writeBlocks = (parts, inCell = false) => {
    if (!settings) return parts.map(part => part.xml ?? paragraphXml(part)).join('');
    const visible = parts.filter(part => !part.transparent);
    let index = 0, xml = '';
    for (const part of parts) {
      if (part.transparent) {
        xml += paragraphXml(part, {...part.props, before: 0, after: 0, line: 0, lineRule: 'exact'});
        continue;
      }
      const previous = visible[index - 1], next = visible[++index];
      const before = previous ? boundary(previous, part) : 0;
      const after = next?.xml ? boundary(part, next) : next || inCell ? 0 : part.after || 0;
      if (part.xml) {
        if (previous?.xml) xml += tableSpacing(before);
        xml += part.xml;
        if (!next && !inCell && after) xml += tableSpacing(after);
        continue;
      }
      const level = /^Heading([1-6])$/.exec(part.props.styleId || '');
      xml += paragraphXml(part, {...part.props, before, after, keepNext: !!level || !!part.props.keepNext});
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
      bodyParts.push(paragraphPart(commentObjectXml(nativeEquationXml(block), block), {ind: paragraphInd(null)}));
      continue;
    }
    if (block.type === 'image') {
      const src = block.src || (block.ref ? refs.get(String(block.ref).toLowerCase()) : null);
      if (!src) continue;
      const drawing = /^data:image\/svg\+xml/i.test(src);
      const asset = await assetFor(src, block.alt, drawing, block.original), width = Math.max(1, availableWidth - inset * 635);
      const next = blocks[index + 1];
      if (!tableCell && !block.caption && pictureInitialLayout(block.layout) && next?.type === 'paragraph' &&
          !next.rule && !next.layout?.lines && next.runs?.some(run => run.type === 'text' && run.text.trim())) {
        const type = referenceType(settings), cap = {height: integer(block.capHeight, null, 1) || linesEmu(block.layout.lines),
          top: integer(block.capTop, null) ?? Math.round(Math.max(0, (type.line - type.body) / 2 + type.body * .1) * 12700)};
        const prefix = commentObjectXml(pictureXml(asset, block.alt, block.layout, width, 0, cap), block);
        bodyParts.push(await prose(next, {align: jcOf(next.layout), ind: paragraphInd(next.layout), direction: next.direction, ...typography(next.layout)}, true, prefix));
        groups.at(-1).block = next;
        index++; emitted++; continue;
      }
      if (block.caption && ['around', 'box'].includes(block.layout?.wrap)) {
        const {cx} = pictureSize(asset, block.layout, width), cellWidth = Math.max(1, Math.round(cx / 635));
        const left = Math.round(Math.max(0, Math.min(width - cx, width * (block.layout.x ?? 0) / 100 - cx / 2)) / 635);
        const top = Math.round((block.layout.y || 0) * bodyPointSize * 20);
        const distance = wrapDistances(width, left * 635, cellWidth * 635);
        const inlineLayout = {...block.layout, width: 100};
        for (const key of ['wrap', 'x', 'y', 'lines', 'align']) delete inlineLayout[key];
        const image = commentObjectXml(pictureXml(asset, block.alt, inlineLayout, cellWidth * 635), block);
        bodyParts.push({xml: '<w:tbl><w:tblPr><w:tblpPr w:horzAnchor="text" w:vertAnchor="text" w:tblpX="' + left + '" w:tblpY="' + top +
          '" w:leftFromText="' + Math.round(distance.left / 635) + '" w:rightFromText="' + Math.round(distance.right / 635) + '" w:topFromText="0" w:bottomFromText="120"/>' +
          '<w:tblW w:w="' + cellWidth + '" w:type="dxa"/><w:tblLayout w:type="fixed"/>' +
          '<w:tblCellMar>' + ['top', 'left', 'bottom', 'right'].map(edge => '<w:' + edge + ' w:w="0" w:type="dxa"/>').join('') + '</w:tblCellMar>' +
          '</w:tblPr><w:tblGrid><w:gridCol w:w="' + cellWidth + '"/></w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc>' +
          '<w:tcPr><w:tcW w:w="' + cellWidth + '" w:type="dxa"/></w:tcPr>' +
          pXml(image, {after: 60, keepNext: true}) + pXml(tXml('Figure: ' + block.caption, {italic: true, size: 21}), {after: 0}) +
          '</w:tc></w:tr></w:tbl>'});
        continue;
      }
      bodyParts.push(paragraphPart(commentObjectXml(pictureXml(asset, block.alt, block.layout, width), block),
        {align: jcOf(block.layout), ind: paragraphInd(null), ...(block.caption ? {after: 60, keepNext: true} : {})}));
      if (block.caption) bodyParts.push(paragraphPart(tXml('Figure: ' + block.caption, {italic: true, size: 21}), {align: 'center', ind: paragraphInd(null)}));
      continue;
    }
    if (block.blocks && (block.type === 'quote' || block.type === 'callout')) {
      const color = cssColorHex(block.color) || '#0969da';
      const borders = block.type === 'callout' ? '<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="' + color.slice(1) + '"/></w:pBdr>' : quoteBorders(block.color);
      if (block.type === 'callout') bodyParts.push(paragraphPart(tXml(block.kind.charAt(0) + block.kind.slice(1).toLowerCase(), {bold: true, ...(block.color ? {color} : {})}), {borders, direction: block.direction}));
      bodyParts.push(...await emitBlocks(block.blocks, inset, targets, availableWidth, {...decoration, borders, direction: block.direction}, tableCell));
      continue;
    }
    if (block.type === 'callout') {
      const color = cssColorHex(block.color) || '#0969da';
      const label = tXml(block.kind.charAt(0) + block.kind.slice(1).toLowerCase(), {bold: true, ...(block.color ? {color} : {})});
      const body = await renderRuns(block.runs);
      const border = '<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="' + color.slice(1) + '"/></w:pBdr>';
      const parts = [paragraphPart(label, {borders: border, direction: block.direction}), paragraphPart(body || tXml(''), {borders: border, direction: block.direction})];
      bodyParts.push({xml: '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' + tableInd + '<w:tblBorders>' +
        (block.direction === 'rtl' ? '<w:left w:val="nil"/><w:right' : '<w:right w:val="nil"/><w:left') + ' w:val="single" w:sz="24" w:space="0" w:color="' + color.slice(1) + '"/>' +
        '<w:top w:val="nil"/><w:bottom w:val="nil"/>' +
        '</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="9000" w:type="dxa"/></w:tcPr>' +
        writeBlocks(parts, true) + '</w:tc></w:tr></w:tbl>'});
      continue;
    }
    if (block.type === 'quote') {
      if (block.nativeQuote) quotations = true;
      bodyParts.push(await prose(block, {
        styleId: block.nativeQuote ? 'Quote' : null,
        borders: block.color ? quoteBorders(block.color) : decoration?.borders || quoteBorders(),
        ind: paragraphInd(block.layout), align: jcOf(block.layout), direction: block.direction, ...typography(block.layout)
      }, !tableCell));
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
          after: item.loose || block.items.at(-1) === item ? lineTwips : Math.round(lineTwips / 4),
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
        if (value.header && baseFamilies.has(bodyFace)) { runs.characterStyle = 'RapierTableHeader'; tableHeaderStyle = true; }
        const cellWidth = width * span * 635;
        const parts = value.continuation ? [paragraphPart('')] : value.blocks ?
          await emitBlocks(value.blocks, 0, targets, cellWidth, {...decoration, runs, after: 0}, true) :
          [paragraphPart(await emitRuns(value.runs || [], targets, cellWidth, runs), {after: 0})];
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
      const line = after => paragraphPart(inner, {styleId, shading: codeShading, ind: paragraphInd(null), line: Math.round(lineTwips * .75), after});
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
      bodyParts.push(paragraphPart('', {borders: '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>', ind: paragraphInd(null)}));
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
     const heading = block.type === 'heading', body = block.type === 'paragraph' && !block.rule;
     const before = heading ? blockSpace.heading[0] : 0;
     const after = heading ? blockSpace.heading[1] : body ? blockSpace.paragraph : blockSpace.block;
     if (block.type === 'code') for (const part of parts) { part.before = 0; part.after = 0; }
     parts[0].before = before;
     parts.at(-1).after = after;
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
    const body = typeof note.content === 'string' ? writeBlocks([paragraph(tXml(note.content))]) : writeBlocks(await emitBlocks(note.content.blocks));
    const marked = body.replace(/<w:p>(<w:pPr>[\s\S]*?<\/w:pPr>)?/, (open) => open + '<w:r><w:' + note.kind + 'Ref/></w:r>');
    noteXml[note.kind].push('<w:' + note.kind + ' w:id="' + note.id + '">' + marked + '</w:' + note.kind + '>');
  }

  const footerId = settings && settings.pagestyle === 'plain' ? nextRid() : '';
  const sectPr = sectionPropertiesXml(settings, footerId);
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:document xmlns:w="' + NS.w[0] + '" xmlns:r="' + NS.r[0] + '" xmlns:a="' + NS.a[0] +
    '" xmlns:wp="' + NS.wp[0] + '" xmlns:pic="' + NS.pic[0] + '">\n<w:body>' +
    bodyXml + sectPr + '</w:body></w:document>';

  const type = settings ? referenceType(settings) : null;
  const headingFace = settings?.sansfont?.word || (bodyFace === 'Geist' ? bodyFace : null);
  const headingEmphasis = !!type && baseFamilies.has(headingFace);
  const headingStyles = [1, 2, 3, 4, 5, 6].map(level => {
    const size = type ? integer(Math.max(1, Math.round(type.body * DOCX_HEADING_SCALE[level - 1] * 2))) : 0;
    const line = type ? Math.max(1, Math.round(type.line * [2, 1.5, 1.5, 1, 1, 1][level - 1] * 20)) : 0;
    const face = headingFace;
    return '<w:style w:type="paragraph" w:styleId="Heading' + level + '"><w:name w:val="heading ' + level + '"/>' +
      '<w:basedOn w:val="' + (headingEmphasis ? STRUCTURAL_EMPHASIS : 'Normal') + '"/><w:pPr><w:keepNext/>' +
      (type ? spacingXml({line, lineRule: 'atLeast', before: blockSpace.heading[0], after: blockSpace.heading[1]}) : '') +
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
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>' +
    (quotations ? '<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/></w:style>' : '') +
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
    ...(footerId ? [{id: footerId, type: 'footer', target: 'footer1.xml'}] : []),
    ...(commentsXml ? [{id: nextRid(), type: 'comments', target: 'comments.xml'},
      {id: nextRid(), type: 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended', target: 'commentsExtended.xml'}] : []),
    ...rels
  ];
  const types = ['png', 'jpeg', 'svg', 'gif'].filter(ext => media.some(row => row.name.endsWith('.' + ext)));
  const defaults = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    (fonts.length ? '<Default Extension="odttf" ContentType="' + DOCX_FONT_TYPE + '"/>' : '') +
    (types.includes('png') ? '<Default Extension="png" ContentType="image/png"/>' : '') +
    (types.includes('jpeg') ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : '') +
    (types.includes('svg') ? '<Default Extension="svg" ContentType="image/svg+xml"/>' : '') +
    (types.includes('gif') ? '<Default Extension="gif" ContentType="image/gif"/>' : '');
  const overrides = [
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
  ];
  for (const [kind, xml] of [['footnotes', footnoteXml], ['endnotes', endnoteXml]])
    if (xml) overrides.push('<Override PartName="/word/' + kind + '.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.' + kind + '+xml"/>');
  if (fonts.length) overrides.push('<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>');
  if (fonts.length || hyphenation) overrides.push('<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>');
  if (footerId) overrides.push('<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>');
  if (commentsXml) overrides.push('<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>',
    '<Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/>');
  const coreXml = corePropertiesXml(settings);
  if (coreXml) overrides.push('<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>');
  if (carrySource) overrides.push('<Override PartName="/' + DOCX_SOURCE.path + '" ContentType="' + DOCX_SOURCE.type + '"/>');
  const contentTypesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="' + NS.ct[0] + '">' +
    defaults + overrides.join('') + '</Types>';

  const packageRels = relXml([{id: 'rIdDoc', type: 'officeDocument', target: 'word/document.xml'}])
    .replace('</Relationships>', (coreXml ? '<Relationship Id="rIdCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' : '') +
      (carrySource ? '<Relationship Id="rIdRapierSource" Type="' + DOCX_SOURCE.relationship + '" Target="' + DOCX_SOURCE.path + '"/>' : '') + '</Relationships>');
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
  if (footerId) entries.push({name: 'word/footer1.xml', bytes: await encodeXml(pageNumberFooterXml())});
  if (commentsXml) {
    entries.push({name: 'word/comments.xml', bytes: await encodeXml(commentsXml)}, {name: 'word/commentsExtended.xml', bytes: await encodeXml(commentsExtendedXml)});
    const used = new Set([...commentsXml.matchAll(/\br:(?:id|embed)="([^"]+)"/g)].map(match => match[1]));
    const commentRels = rels.filter(row => used.has(row.id));
    if (commentRels.length) entries.push({name: 'word/_rels/comments.xml.rels', bytes: await encodeXml(relXml(commentRels))});
  }
  if (coreXml) entries.push({name: 'docProps/core.xml', bytes: await encodeXml(coreXml)});
  for (const row of media) entries.push({name: 'word/media/' + row.name, bytes: row.bytes});
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
