// SPDX-License-Identifier: AGPL-3.0-only
import {unpackFiles, ARCHIVE_LIMITS, crc32} from '../images/archive.mjs';
import {zipStored, zipStoredAsync} from '../notes/zip-records.mjs';
import {finish, finishAsync, cloneTree, encodeUtf8Steps, pause, check} from '../kit/render-work.mjs';
import {formatLayout, parseLayout, decodeLayoutAttribute, indentLevel, textStyle as indentStyle, textLayout} from '../spec/md-layout.mjs';
import {parseInkBody} from '../spec/md-marks.mjs';
import {readDocumentSettings} from '../spec/document-settings.mjs';
import {willMarkerOf} from '../agent/will.mjs';
import {inspectRaster, isJxl, dataImage, sanitizeSvgText, validAssetDimensions} from '../images/assets.mjs';
import {markdownParser, markdownBodyOffset, documentAssets} from '../spec/md-assets.mjs';
import {parseComments, commentThreads, commentAnchor, writeComments, validCommentDate, validCommentTimestamp} from '../agent/comments.mjs';

export const DOCX_LIMITS = Object.freeze({xmlBytes: 8 * 1024 * 1024, totalXmlBytes: 12 * 1024 * 1024,
  elements: 200000, depth: 96, styles: 2048, paragraphs: 50000, images: 1024, tableColumns: 64});

const NS = Object.freeze({
  w: ['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main'],
  m: ['http://schemas.openxmlformats.org/officeDocument/2006/math', 'http://purl.oclc.org/ooxml/officeDocument/math'],
  r: ['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships'],
  a: ['http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main'],
  wp: ['http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'http://purl.oclc.org/ooxml/drawingml/wordprocessingDrawing'],
  pic: ['http://schemas.openxmlformats.org/drawingml/2006/picture', 'http://purl.oclc.org/ooxml/drawingml/picture'],
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
const DOCX_SOURCE = Object.freeze({path: 'rapier/source.json',
  type: 'application/vnd.rapier.markdown-source+json',
  relationship: 'https://rapier.website/relationships/markdown-source'});
const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  byte => byte.toString(16).padStart(2, '0')).join('');

async function docxSourceRecord(entries, source, work = null) {
  const bytes = work ? await finishAsync(encodeUtf8Steps(source), work) : utf8.encode(source);
  if (bytes.length > ARCHIVE_LIMITS.bytes || source.includes('\u0000') || new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes) !== source)
    return fail('DOCX source is not an admitted UTF-8 document.', 'docx_source_invalid');
  const parts = [];
  for (const entry of [...entries].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    parts.push({name: entry.name, bytes: entry.bytes.length, sha256: await sha256(entry.bytes)});
  const record = JSON.stringify({format: 'md-source:v1', source, sha256: await sha256(bytes), parts});
  return work ? finishAsync(encodeUtf8Steps(record), work) : utf8.encode(record);
}

// The source is used only while every native part still has the exported bytes.
// This is a consistency check, not an authorship signature or a trust boundary.
async function readDocxSource(files, path, checkCurrent) {
  const bytes = files.get(path);
  if (!bytes || bytes.length > ARCHIVE_LIMITS.bytes) return null;
  let record;
  try { record = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch (_) { return null; }
  if (!record || record.format !== 'md-source:v1' || typeof record.source !== 'string' ||
      record.source.length > ARCHIVE_LIMITS.bytes || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.sha256) ||
      !Array.isArray(record.parts) || record.parts.length !== files.size - 1) return null;
  const source = utf8.encode(record.source);
  if (source.length > ARCHIVE_LIMITS.bytes || record.source.includes('\u0000') || new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(source) !== record.source ||
      await sha256(source) !== record.sha256) return null;
  const native = [...files].filter(([name]) => name !== path).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  for (let index = 0; index < native.length; index++) {
    checkCurrent();
    const [name, content] = native[index], part = record.parts[index];
    if (!part || part.name !== name || part.bytes !== content.length || typeof part.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(part.sha256) ||
        await sha256(content) !== part.sha256) return null;
  }
  checkCurrent();
  return record.source;
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
// Inverse of writeDocx's rotate fold: Word's [0,360) into md-layout's (-180, 180] at one decimal; 0 stays 0.
const foldRotationDegrees = degrees => {
  let folded = degrees > 180 ? degrees - 360 : degrees;
  folded = Math.round(folded * 10) / 10;
  if (folded <= -180) folded += 360;
  else if (folded > 180) folded -= 360;
  return folded === 0 ? 0 : folded;
};
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[character]));
const fail = (message, code = 'docx_invalid') => { const error = new Error(message); error.code = code; throw error; };
// A picture's fade: alphaModFix's amount (thousandths of a percent, or a percentage in strict OOXML) as md-layout's
// whole-percent `opacity`, never under 5% so the picture is never lost; absent means 100%.
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

function xmlText(bytes) {
  const utf16le = bytes[0] === 255 && bytes[1] === 254 || bytes[0] === 60 && bytes[1] === 0;
  const utf16be = bytes[0] === 254 && bytes[1] === 255 || bytes[0] === 0 && bytes[1] === 60;
  try { return new TextDecoder(utf16le ? 'utf-16le' : utf16be ? 'utf-16be' : 'utf-8', {fatal: true}).decode(bytes); }
  catch (_) { return fail('DOCX XML is not valid UTF-8 or UTF-16.'); }
}

function paragraphProperties(node) {
  const out = {}, number = child(node, 'w', 'numPr');
  const indent = child(node, 'w', 'ind');
  const left = attr(indent, 'w', 'start') ?? attr(indent, 'w', 'left');
  if (left != null) out.leftIndent = integer(left, null, -2147483648);
  // Either first-line form replaces the inherited form, including an explicit zero.
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
  for (const [name, key] of [['numId', 'numId'], ['ilvl', 'level']]) {
    const value = val(child(number, 'w', name));
    if (value != null) out[key] = integer(value, null, 0, name === 'ilvl' ? 8 : 2147483647);
  }
  return out;
}

// Tab declarations inherit by position; a clear remains in the cascade so later layers cannot revive it.
function mergeParagraphProperties(...layers) {
  const result = Object.assign({}, ...layers), tabs = new Map(layers.flatMap(layer => [...(layer?.tabs || [])]));
  if (tabs.size) result.tabs = tabs;
  return result;
}

const DOCX_HIGHLIGHT_TO_RAPIER = Object.freeze({yellow:'yellow', green:'green', red:'red', blue:'blue', magenta:'purple'});
const DOCX_HIGHLIGHT_HEX = Object.freeze({black:'#000000', blue:'#0000ff', cyan:'#00ffff', green:'#00ff00',
  magenta:'#ff00ff', red:'#ff0000', yellow:'#ffff00', white:'#ffffff', darkBlue:'#000080', darkCyan:'#008080',
  darkGreen:'#008000', darkMagenta:'#800080', darkRed:'#800000', darkYellow:'#808000', darkGray:'#808080', lightGray:'#c0c0c0'});

// Word applies tint in preference to shade, changing HSL luminance while holding hue and
// saturation (MS-OI29500 2.1.72). Rescaling chroma avoids a second colour-space owner.
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

function runProperties(node, themeColors = new Map()) {
  const out = {};
  for (const [name, key] of [['b', 'bold'], ['i', 'italic'], ['strike', 'strike'], ['vanish', 'hidden']]) {
    const value = on(child(node, 'w', name));
    if (value !== undefined) out[key] = value;
  }
  const underline = child(node, 'w', 'u'), vertical = val(child(node, 'w', 'vertAlign'));
  if (underline) out.underline = val(underline) !== 'none';
  if (vertical != null) out.vertical = vertical;
  // Explicit automatic/none resets must override inherited colour.
  const color = themeColor(child(node, 'w', 'color'), themeColors);
  if (color && /^[0-9a-f]{6}$/i.test(color)) out.color = '#' + color.toLowerCase();
  else if (color === 'auto') out.color = null;
  const highlight = val(child(node, 'w', 'highlight'));
  if (highlight != null && highlight !== 'none') {
    if (!DOCX_HIGHLIGHT_HEX[highlight]) return fail('DOCX contains an invalid highlight colour.', 'docx_highlight_color');
    out.highlight = DOCX_HIGHLIGHT_TO_RAPIER[highlight] || highlight;
  }
  else if (highlight === 'none') out.highlight = null;
  return out;
}

function mergeRunStyle(base, own) {
  const result = {...base, ...own};
  for (const key of ['bold', 'italic', 'strike', 'hidden']) if (Object.hasOwn(own, key)) result[key] = own[key] ? !base[key] : !!base[key];
  return result;
}

function textStyle(html, style) {
  if (!html) return html;
  for (const [key, tag] of [['bold','strong'], ['italic','em'], ['strike','s'], ['underline','u']]) if (style[key]) html = '<' + tag + '>' + html + '</' + tag + '>';
  if (style.vertical === 'superscript') html = '<sup>' + html + '</sup>';
  if (style.vertical === 'subscript') html = '<sub>' + html + '</sub>';
  // Never spell the colour marker here: emit the editor's DOM (data-md-color) and let turndown's rapierColor rule own its bytes.
  if (style.color) html = '<span data-md-color="' + style.color + '">' + html + '</span>';
  if (style.highlight) {
    if (Object.values(DOCX_HIGHLIGHT_TO_RAPIER).includes(style.highlight)) html = '<mark data-rapier-highlight="' + style.highlight + '">' + html + '</mark>';
    else html = sourceToken('<mark style="background-color:' + DOCX_HIGHLIGHT_HEX[style.highlight] + '">') + html + sourceToken('</mark>');
  }
  return html;
}

// The import DOM is inert. These already-supported source tokens carry ordinary character
// references through the Markdown writer's HTML whitespace folding; no private markup is saved.
function sourceToken(source) {
  const encoded = escape(encodeURIComponent(source));
  return '<span class="rapier-source-token" data-rapier-source="' + encoded +
    '" data-rapier-visible="' + encoded + '">' + escape(source) + '</span>';
}
function importedText(text) {
  return String(text).split(/([\t\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff])/u)
    .map(part => /^[\t\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/u.test(part)
      ? sourceToken('&#' + part.codePointAt(0) + ';') : escape(part)).join('');
}

// Preserve Office Math's expression tree in the existing TeX source syntax. Flattening
// XML text would turn a fraction into multiplication and discard roots and exponents.
function mathTex(node) {
  const text = value => String(value).replace(/[\\{}$%#&_^~]/g, c => ({'\\':'\\backslash{}',
    '^':'\\text{\\textasciicircum}', '~':'\\text{\\textasciitilde}'}[c] || '\\' + c));
  const property = (name, key, fallback = null) => attr(child(child(node, 'm', name + 'Pr'), 'm', key), 'm', 'val') ?? fallback;
  const hidden = (name, key) => {
    const bit = child(child(node, 'm', name + 'Pr'), 'm', key);
    return bit ? !['0', 'false', 'off'].includes(attr(bit, 'm', 'val')) : false;
  };
  const contents = parent => Array.from(parent?.children || []).filter(n =>
    !(is(n, 'm') && n.localName.endsWith('Pr')) && !is(n, 'w', 'rPr')).map(mathTex).join('');
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

/** Only declared OOXML parts are read. The caller owns image conversion and the eventual document transaction. */
export async function readDocx(blob, {embedImage, checkCurrent = () => {}} = {}) {
  if (!(blob instanceof Blob) || blob.size > ARCHIVE_LIMITS.bytes) return fail('DOCX exceeds the 25 MB import limit.');
  if (typeof DOMParser !== 'function') return fail('DOCX import requires an XML parser.');
  checkCurrent();
  const files = await unpackFiles(blob);
  checkCurrent();
  const warnings = new Set(), xmlCache = new Map(), relationCache = new Map(), converted = new Map(), imageRequests = [], rawTables = [];
  const stats = {paragraphs: 0, images: 0, uniqueImages: 0, tables: 0, footnotes: 0, endnotes: 0, comments: 0};
  let xmlBytes = 0, elements = 0, outputBytes = 0;
  const warn = text => warnings.add(text);
  const account = html => {
    if (html.length > ARCHIVE_LIMITS.bytes - outputBytes) return fail('Converted DOCX exceeds the 25 MB document limit.');
    outputBytes += utf8.encode(html).length;
    if (outputBytes > ARCHIVE_LIMITS.bytes) return fail('Converted DOCX exceeds the 25 MB document limit.');
    return html;
  };
  const readXml = (path, family, rootName) => {
    if (xmlCache.has(path)) return xmlCache.get(path);
    const bytes = files.get(path);
    if (!bytes) return fail('DOCX is missing a required part: ' + path);
    xmlBytes += bytes.length;
    if (bytes.length > DOCX_LIMITS.xmlBytes || xmlBytes > DOCX_LIMITS.totalXmlBytes) return fail('DOCX XML exceeds the import limit.');
    const source = xmlText(bytes);
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) return fail('DOCX XML declarations are not supported.', 'docx_xml_declaration');
    let document;
    try { document = new DOMParser().parseFromString(source, 'application/xml'); }
    catch (_) { return fail('DOCX contains invalid XML: ' + path, 'docx_xml_invalid'); }
    if (document.getElementsByTagNameNS('*', 'parsererror').length || !is(document.documentElement, family, rootName))
      return fail('DOCX contains invalid XML: ' + path, 'docx_xml_invalid');
    const pending = [[document.documentElement, 1]];
    while (pending.length) {
      const [node, depth] = pending.pop();
      if (++elements > DOCX_LIMITS.elements || depth > DOCX_LIMITS.depth) return fail('DOCX XML structure exceeds the import limit.');
      for (const descendant of node.children) pending.push([descendant, depth + 1]);
    }
    xmlCache.set(path, document.documentElement);
    return document.documentElement;
  };
  const relationships = source => {
    if (relationCache.has(source)) return relationCache.get(source);
    const at = source.lastIndexOf('/'), path = source ? source.slice(0, at + 1) + '_rels/' + source.slice(at + 1) + '.rels' : '_rels/.rels';
    const result = new Map();
    if (files.has(path)) for (const node of children(readXml(path, 'rel', 'Relationships'), 'rel', 'Relationship')) {
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
  const related = (source, kind, required = false) => {
    const matches = [...relationships(source).values()].filter(row => row.kind === kind);
    if (matches.length > 1 || required && !matches.length) return fail('DOCX has a missing or ambiguous ' + kind + ' part.');
    if (matches[0]?.external) return fail('DOCX requires an external ' + kind + ' part.');
    return matches[0]?.path || null;
  };
  const mainPath = related('', 'officeDocument', true);
  const types = readXml('[Content_Types].xml', 'ct', 'Types'), overrides = new Map(), defaults = new Map();
  for (const node of children(types, 'ct')) {
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
  const contentType = path => overrides.get(path) || defaults.get(path.slice(path.lastIndexOf('.') + 1).toLowerCase()) || '';
  if (contentType(mainPath) !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')
    return fail('Only ordinary DOCX documents can be imported.');
  const sourceParts = [...relationships('').values()].filter(row => row.type === DOCX_SOURCE.relationship);
  let canonical = null;
  if (sourceParts.length) {
    const sourcePart = sourceParts[0];
    if (sourceParts.length === 1 && !sourcePart.external && contentType(sourcePart.path) === DOCX_SOURCE.type)
      canonical = await readDocxSource(files, sourcePart.path, checkCurrent);
    if (canonical === null) warn('The stored Markdown does not match this Word file. Current Word content was imported.');
  }
  const main = readXml(mainPath, 'w', 'document'), body = child(main, 'w', 'body');
  if (!body) return fail('DOCX has no document body.');
  const stylesPath = related(mainPath, 'styles'), numberingPath = related(mainPath, 'numbering');
  const stylesRoot = stylesPath ? readXml(stylesPath, 'w', 'styles') : null;
  const themePath = related(mainPath, 'theme'), themeColors = new Map();
  if (themePath) {
    const themeRoot = readXml(themePath, 'a', 'theme'), scheme = child(child(themeRoot, 'a', 'themeElements'), 'a', 'clrScheme');
    for (const entry of children(scheme, 'a')) {
      const rgb = child(entry, 'a', 'srgbClr')?.getAttribute('val') || child(entry, 'a', 'sysClr')?.getAttribute('lastClr');
      if (rgb && /^[0-9a-f]{6}$/i.test(rgb)) themeColors.set(entry.localName, rgb);
    }
    for (const [name, key] of [['dark1','dk1'], ['dark2','dk2'], ['light1','lt1'], ['light2','lt2'], ['text1','dk1'], ['text2','dk2'], ['background1','lt1'], ['background2','lt2'], ['hyperlink','hlink'], ['followedHyperlink','folHlink']])
      if (themeColors.has(key)) themeColors.set(name, themeColors.get(key));
  }
  const propertiesOf = node => runProperties(node, themeColors);
  const docDefaults = child(stylesRoot, 'w', 'docDefaults');
  const defaultParagraph = paragraphProperties(child(child(docDefaults, 'w', 'pPrDefault'), 'w', 'pPr'));
  const defaultRun = propertiesOf(child(child(docDefaults, 'w', 'rPrDefault'), 'w', 'rPr'));
  const styles = new Map(), styleCache = new Map();
  let defaultStyle = null;
  for (const node of children(stylesRoot, 'w', 'style')) {
    const id = attr(node, 'w', 'styleId');
    if (!id || styles.has(id) || styles.size >= DOCX_LIMITS.styles) return fail('DOCX style definitions exceed the import limit or are ambiguous.');
    styles.set(id, node);
    if (attr(node, 'w', 'type') === 'paragraph' && ['1','true','on'].includes(attr(node, 'w', 'default'))) defaultStyle = id;
  }
  const style = (id, chain = []) => {
    if (!id) return {p: {}, r: {}};
    if (styleCache.has(id)) return styleCache.get(id);
    if (chain.includes(id) || chain.length >= 32) return fail('DOCX contains a circular or excessive style hierarchy.');
    const node = styles.get(id);
    if (!node) { warn('Some referenced styles were missing; their text was retained.'); return {p: {}, r: {}}; }
    const parent = val(child(node, 'w', 'basedOn')), parentNode = styles.get(parent);
    const base = parentNode && attr(parentNode, 'w', 'type') === attr(node, 'w', 'type') ? style(parent, [...chain, id]) : {p: {}, r: {}};
    const result = {p: mergeParagraphProperties(base.p, paragraphProperties(child(node, 'w', 'pPr'))), r: mergeRunStyle(base.r, propertiesOf(child(node, 'w', 'rPr')))};
    styleCache.set(id, result);
    return result;
  };
  const abstracts = new Map(), numbers = new Map(), counts = new Map(), levelCache = new Map();
  if (numberingPath) {
    const root = readXml(numberingPath, 'w', 'numbering');
    for (const node of children(root, 'w', 'abstractNum')) {
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
    const levels = numberingLevels(integer(val(child(instance, 'w', 'abstractNumId'))));
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
    const key = properties.numId + ':' + index, ordinal = counts.get(key) ?? start;
    if (ordinal > 999999999) return fail('DOCX list numbering exceeds Markdown\u2019s nine-digit limit.');
    counts.set(key, ordinal + 1);
    for (const [deeper, candidate] of levels) if (deeper > index) {
      const restart = integer(val(child(candidate, 'w', 'lvlRestart')), null, 0, 9);
      if (restart !== 0 && (restart === null || restart === index + 1)) counts.delete(properties.numId + ':' + deeper);
    }
    return {id: properties.numId, level: index, tag: format === 'bullet' ? 'ul' : 'ol', ordinal,
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
    // Headings keep the list text base but only carry their admitted whole-block indent.
    if (list && !heading) {
      const hanging = list.tag === 'ol' ? 660 : 240;
      const numberTab = [...(properties.tabs || [])].filter(([, kind]) => kind === 'num' || kind === 'left').sort(([a], [b]) => a - b)[0]?.[0];
      const first = measuredLevel(((numberTab ?? left) - left) / step);
      const marker = measuredLevel((left + (properties.firstIndent ?? -hanging) - (base - hanging)) / step);
      if (first) layout.first = first;
      if (marker) layout.marker = marker;
    } else if (!heading && properties.firstIndent) layout.first = measuredLevel(properties.firstIndent / step);
    return layout;
  };
  const chooseAlternate = node => {
    for (const choice of children(node, 'mc', 'Choice')) {
      const required = (choice.getAttribute('Requires') || '').trim().split(/\s+/);
      if (required.length && required.every(prefix => ['w','a','wp','pic'].some(family => NS[family].includes(choice.lookupNamespaceURI(prefix))))) return choice;
    }
    return child(node, 'mc', 'Fallback') || fail('DOCX contains unsupported alternate content.');
  };
  const sequence = container => {
    const blocks = [];
    for (const node of container?.children || []) {
      if (is(node, 'w', 'p') || is(node, 'w', 'tbl')) blocks.push(node);
      else if (is(node, 'w', 'sdt')) blocks.push(...sequence(child(node, 'w', 'sdtContent')));
      else if (is(node, 'mc', 'AlternateContent')) blocks.push(...sequence(chooseAlternate(node)));
      else if (is(node, 'w') && ['customXml','ins','moveTo'].includes(node.localName)) {
        if (node.localName !== 'customXml') warn('Revision history was removed; current text was retained.');
        blocks.push(...sequence(node));
      } else if (is(node, 'w') && ['del','moveFrom'].includes(node.localName)) warn('Revision history was removed; current text was retained.');
      else if (is(node, 'w') && ['commentRangeStart','commentRangeEnd'].includes(node.localName)) blocks.push(node);
      else if (is(node, 'w') && ['sectPr','tcPr','tblPr','tblGrid','trPr','bookmarkStart','bookmarkEnd','proofErr','permStart','permEnd'].includes(node.localName)) continue;
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
      id = attr(blip, 'r', 'embed');
      if (!id || attr(blip, 'r', 'link')) return fail('DOCX contains a linked picture without self-contained image bytes.');
      const properties = child(drawing, 'wp', 'docPr'), nonVisual = child(child(image, 'pic', 'nvPicPr'), 'pic', 'cNvPr');
      alt = properties?.getAttribute('descr') || properties?.getAttribute('title') || nonVisual?.getAttribute('descr') || nonVisual?.getAttribute('title') || '';
      extent = integer(child(drawing, 'wp', 'extent')?.getAttribute('cx'), null, 1, 27273042316900);
      extentHeight = integer(child(drawing, 'wp', 'extent')?.getAttribute('cy'), null, 1, 27273042316900);
      if (is(drawing, 'wp', 'anchor')) {
        warn('Floating pictures became normal-flow images in source order.');
        const position = child(drawing, 'wp', 'positionH'), value = child(position, 'wp', 'align')?.textContent;
        if (['left','center','right'].includes(value)) align = value;
      }
    } else {
      const shape = child(node, 'v', 'shape'), image = child(shape, 'v', 'imagedata');
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
    // Fold rotation into md-layout before the transform bakes crop/flip: a raster's turn is a layout fact, and placements share one asset.
    const rotate = transform.rotation ? foldRotationDegrees(transform.rotation) : 0;
    transform.rotation = 0;
    if (extent !== null && (!Number.isFinite(extent) || extent <= 0 || extent > 27273042316900) ||
        extentHeight !== null && (!Number.isFinite(extentHeight) || extentHeight <= 0 || extentHeight > 27273042316900)) return fail('DOCX picture dimensions are invalid.');
    if (++stats.images > DOCX_LIMITS.images) return fail('DOCX contains too many pictures.');
    const relation = relationships(context.path).get(id);
    if (!relation || relation.kind !== 'image' || relation.external || !files.has(relation.path))
      return fail('DOCX is missing the embedded bytes for a picture.');
    if (typeof embedImage !== 'function') return fail('DOCX image conversion is unavailable.');
    const path = relation.path, name = path.slice(path.lastIndexOf('/') + 1), bytes = files.get(path);
    if (!bytes.length) return fail('DOCX contains an empty picture.');
    alt = alt.trim() || name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    const width = extent ? Math.max(0.01, Math.min(100, Math.round(extent / context.width * 10000) / 100)) : null;
    if (extent > context.width) warn('Oversized pictures were fitted to the text width.');
    if (context.assumed && extent) warn('Missing page dimensions used a standard text width for picture sizing.');
    const key = path + '\n' + JSON.stringify(transform) + '\n' + (extent && extentHeight ? Math.round(extent / extentHeight * 1000000) : '');
    if (!converted.has(key)) {
      // No caller-owned image work until every later paragraph, table and note has admitted.
      const reference = 'docx-pending-' + imageRequests.length;
      imageRequests.push({reference, image: {bytes, name, path, alt, width, type: contentType(path), transform,
        displayWidth: extent, displayHeight: extentHeight}});
      converted.set(key, reference); stats.uniqueImages++;
    }
    return {image: account('<img data-rapier-asset="' + converted.get(key) + '" alt="' + escape(alt) + '">'), width, align, rotate, opacity};
  };
  const noteParts = new Map(), notes = new Map();
  const notePart = (kind, required = true) => {
    if (!noteParts.has(kind)) {
      const path = related(mainPath, kind + 's', required);
      if (!path) return null;
      const root = readXml(path, 'w', kind + 's'), records = new Map();
      for (const record of children(root, 'w', kind)) {
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
  const registerNote = (kind, id, context) => {
    const part = notePart(kind), content = part.records.get(id), label = 'docx-' + ({footnote:'fn-', endnote:'en-', comment:'comment-'}[kind]) + id;
    if (!content) return fail('DOCX is missing the text of a referenced note.');
    if (!notes.has(label)) {
      const ordinal = notes.size + 1;
      const review = kind === 'comment' ? commentInfo.get(id) : null;
      const author = kind === 'comment' ? attr(content, 'w', 'author') || '' : '', date = review?.date || '';
      const metadata = (author || date ? '<p>' + importedText(author) + (author && date ? '<br>' : '') + importedText(date) + '</p>' : '') +
        (review?.resolved ? '<p>Resolved</p>' : '') + (review?.parent != null ? '<p>Reply to Word comment ' + review.parent + '</p>' : '');
      notes.set(label, {label, ordinal, content, metadata, context: {...context, path: part.path, p: {}, note: true, tableCell: false, width: context.sectionWidth || context.width}});
      if (kind !== 'comment') stats[kind + 's']++;
    }
    return '<sup class="footnote-ref"><a href="#fn-' + label + '" data-footnote-label="' + label + '">' + notes.get(label).ordinal + '</a></sup>';
  };
  const noteReference = (node, context) => {
    if (context.note) return fail('DOCX contains a note reference inside another note.');
    const kind = node.localName === 'footnoteReference' ? 'footnote' : node.localName === 'endnoteReference' ? 'endnote' : 'comment';
    const id = integer(attr(node, 'w', 'id'));
    if (id === null) return fail('DOCX contains an invalid note reference.');
    if (['1','true','on'].includes(attr(node, 'w', 'customMarkFollows'))) warn('Custom note marks became automatic Markdown note numbers.');
    return registerNote(kind, id, context);
  };
  const commentPart = notePart('comment', false);
  const commentInfo = new Map(), commentByParagraph = new Map(), activeComments = new Set(), commentGroups = [];
  const descendants = (node, family, name) => {
    const found = [], pending = [...node.children].reverse();
    while (pending.length) {
      const item = pending.pop();
      if (!family || is(item, family, name)) found.push(item);
      pending.push(...[...item.children].reverse());
    }
    return found;
  };
  for (const [id, node] of commentPart?.records || []) {
    const paragraph = descendants(node, 'w', 'p').at(-1), paraId = attr(paragraph, 'w14', 'paraId');
    if (paraId && (!/^[\da-f]{8}$/i.test(paraId) || commentByParagraph.has(paraId.toUpperCase())))
      return fail('DOCX comments have ambiguous paragraph identifiers.', 'docx_comments_invalid');
    if (paraId) commentByParagraph.set(paraId.toUpperCase(), id);
    commentInfo.set(id, {id, node, parent: null, resolved: false, date: attr(node, 'w', 'date'), starts: [], ends: []});
  }
  stats.comments = commentInfo.size;
  const extendedPath = related(mainPath, 'commentsExtended');
  if (extendedPath) {
    const seen = new Set();
    for (const node of children(readXml(extendedPath, 'w15', 'commentsEx'), 'w15', 'commentEx')) {
      const key = attr(node, 'w15', 'paraId')?.toUpperCase(), parent = attr(node, 'w15', 'paraIdParent')?.toUpperCase();
      const info = commentInfo.get(commentByParagraph.get(key)), done = attr(node, 'w15', 'done');
      if (!info || seen.has(key) || parent && !commentByParagraph.has(parent) || done != null && !['0','1','true','false','on','off'].includes(done))
        return fail('DOCX comment threads have invalid links or state.', 'docx_comments_invalid');
      seen.add(key); info.parent = parent ? commentByParagraph.get(parent) : null; info.resolved = ['1','true','on'].includes(done);
    }
  }
  const commentIdsPath = related(mainPath, 'commentsIds'), extensiblePath = related(mainPath, 'commentsExtensible');
  if (commentIdsPath || extensiblePath) {
    const durable = new Map();
    if (commentIdsPath) for (const node of children(readXml(commentIdsPath, 'w16cid', 'commentsIds'), 'w16cid', 'commentId')) {
      const key = attr(node, 'w16cid', 'durableId')?.toUpperCase(), paragraph = attr(node, 'w16cid', 'paraId')?.toUpperCase();
      if (!/^[\da-f]{8}$/i.test(key || '') || durable.has(key) || !commentByParagraph.has(paragraph))
        return fail('DOCX comment identifiers are invalid.', 'docx_comments_invalid');
      durable.set(key, commentInfo.get(commentByParagraph.get(paragraph)));
    }
    if (extensiblePath) {
      const seen = new Set();
      for (const node of children(readXml(extensiblePath, 'w16cex', 'commentsExtensible'), 'w16cex', 'commentExtensible')) {
        const key = attr(node, 'w16cex', 'durableId')?.toUpperCase(), info = durable.get(key);
        if (!info || seen.has(key)) return fail('DOCX extended comments have invalid identifiers.', 'docx_comments_invalid');
        seen.add(key);
        const date = attr(node, 'w16cex', 'dateUtc');
        if (date != null) info.date = date;
      }
    }
  }
  let reviewOrder = 0;
  for (const node of descendants(body, 'w')) {
    if (!['commentRangeStart','commentRangeEnd','commentReference'].includes(node.localName)) continue;
    const id = integer(attr(node, 'w', 'id')), info = commentInfo.get(id);
    if (!info) return fail('DOCX is missing the text of a referenced comment.', 'docx_comments_invalid');
    if (node.localName !== 'commentReference') info[node.localName === 'commentRangeStart' ? 'starts' : 'ends'].push(reviewOrder++);
  }
  for (const info of commentInfo.values()) {
    let root = info, chain = new Set();
    while (root.parent != null && !chain.has(root.id)) { chain.add(root.id); root = commentInfo.get(root.parent); }
    if (chain.has(root.id)) { warn('A comment thread with circular replies became Markdown notes.'); continue; }
    if (root.starts.length !== 1 || root.ends.length !== 1 || root.starts[0] >= root.ends[0]) continue;
    let group = commentGroups.find(group => group.id === root.id);
    if (!group) { group = {id: root.id, resolved: root.resolved, records: [root]}; commentGroups.push(group); }
    if (info !== root) group.records.push(info);
    activeComments.add(info.id); activeComments.add(root.id);
  }
  const commentMarker = '\uFDD0RapierWordComment0\uFDD1';
  const commentBoundary = node => {
    const id = integer(attr(node, 'w', 'id'));
    return commentGroups.some(group => group.id === id) ? sourceToken(commentMarker + id + (node.localName === 'commentRangeStart' ? 'S' : 'E') + commentMarker) : '';
  };
  if ([...commentInfo.keys()].some(id => !activeComments.has(id))) warn('Comments without an attached range became Markdown notes.');
  const inline = async (container, context, inherited = {}) => {
    const pieces = [];
    for (const node of container.children) {
      if (is(node, 'w', 'r')) {
        const properties = child(node, 'w', 'rPr'), named = style(val(child(properties, 'w', 'rStyle')));
        const formatting = {...mergeRunStyle(inherited, named.r), ...propertiesOf(properties)};
        if (formatting.hidden) { warn('Hidden text was not imported.'); continue; }
        let text = '';
        const flush = () => { if (text) { pieces.push({html: textStyle(text, formatting)}); text = ''; } };
        for (const piece of await inline(node, context, formatting)) {
          if (piece.image || piece.semantic) { flush(); pieces.push(piece); }
          else text += piece.html;
        }
        flush();
      } else if (is(node, 'w', 't')) pieces.push({html: account(importedText(node.textContent))});
      else if (is(node, 'w', 'tab') || is(node, 'w', 'ptab')) { pieces.push({html: sourceToken('&#9;')}); warn('Tab characters were retained; custom tab stops became ordinary text flow.'); }
      else if (is(node, 'w', 'sym')) {
        const encoded = attr(node, 'w', 'char'), code = /^[0-9a-f]{1,4}$/i.test(encoded || '') ? parseInt(encoded, 16) : -1;
        // Legacy symbol fonts assign private or Latin code points to unrelated glyphs.
        // Without that font's mapping, inventing a Unicode character would change the text.
        if (code < 0x100 || code >= 0xd800 && code <= 0xf8ff || code >= 0xfffe)
          return fail('DOCX contains a symbol that requires its original font mapping.', 'docx_symbol_font');
        pieces.push({html: account(importedText(String.fromCodePoint(code)))});
      }
      else if (is(node, 'm', 'oMath') || is(node, 'm', 'oMathPara')) {
        const displayMath = is(node, 'm', 'oMathPara'), delimiter = displayMath ? '$$' : '$';
        const source = delimiter + mathTex(node) + delimiter;
        pieces.push({html: account('<span class="math-rendered" data-math-src="' + escape(encodeURIComponent(source)) + '">' +
          escape(source) + '</span>'), semantic: true, displayMath});
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
      else if (is(node, 'w', 'drawing') || is(node, 'w', 'pict')) pieces.push(await picture(node, context));
      else if (is(node, 'w', 'hyperlink')) {
        const relation = relationships(context.path).get(attr(node, 'r', 'id'));
        const href = relation?.kind === 'hyperlink' && relation.external && /^(?:https?:\/\/|mailto:|tel:)/i.test(relation.target) && !/[\u0000-\u0020\u007f]/.test(relation.target) ? relation.target : null;
        if (!href) warn('Internal document links became plain text.');
        for (const piece of await inline(node, context, inherited)) {
          if (href && !piece.semantic) { if (piece.image) piece.image = '<a href="' + escape(href) + '">' + piece.image + '</a>'; else piece.html = '<a href="' + escape(href) + '">' + piece.html + '</a>'; }
          pieces.push(piece);
        }
      } else if (is(node, 'w', 'sdt')) pieces.push(...await inline(child(node, 'w', 'sdtContent') || node, context, inherited));
      else if (is(node, 'mc', 'AlternateContent')) pieces.push(...await inline(chooseAlternate(node), context, inherited));
      else if (is(node, 'w') && ['smartTag','customXml','fldSimple','ins','moveTo'].includes(node.localName)) {
        if (['ins','moveTo'].includes(node.localName)) warn('Revision history was removed; current text was retained.');
        if (node.localName === 'fldSimple') warn('Fields became their stored displayed text.');
        pieces.push(...await inline(node, context, inherited));
      } else if (is(node, 'w') && ['del','moveFrom'].includes(node.localName)) warn('Revision history was removed; current text was retained.');
      else if (is(node, 'w', 'commentReference') && activeComments.has(integer(attr(node, 'w', 'id')))) continue;
      else if (is(node, 'w') && ['footnoteReference','endnoteReference','commentReference'].includes(node.localName)) pieces.push({html: noteReference(node, context), semantic: true});
      else if (is(node, 'w') && ['instrText','fldChar'].includes(node.localName)) warn('Fields became their stored displayed text.');
      else if (is(node, 'w') && ['commentRangeStart','commentRangeEnd'].includes(node.localName)) pieces.push({html: commentBoundary(node), semantic: true});
      else if (is(node, 'w') && ['pPr','rPr','bookmarkStart','bookmarkEnd','proofErr','lastRenderedPageBreak','permStart','permEnd','footnoteRef','endnoteRef'].includes(node.localName)) continue;
      else return fail('DOCX contains unsupported inline content: ' + node.localName);
    }
    return pieces;
  };
  const paragraph = async (node, context) => {
    if (++stats.paragraphs > DOCX_LIMITS.paragraphs) return fail('DOCX contains too many paragraphs.');
    const properties = child(node, 'w', 'pPr'), id = val(child(properties, 'w', 'pStyle')) || defaultStyle;
    const named = style(id), direct = paragraphProperties(properties), base = mergeParagraphProperties(defaultParagraph, context.p, named.p, direct);
    const list = numbering(base, id), effective = mergeParagraphProperties(defaultParagraph, context.p, list?.p, named.p, direct);
    // A directly applied list level outranks the style's indent; style-owned numbering instead fills only omissions.
    const indents = child(properties, 'w', 'numPr') ? mergeParagraphProperties(defaultParagraph, context.p, named.p, list?.p, direct) : effective;
    for (const key of ['leftIndent', 'firstIndent', 'tabs']) if (Object.hasOwn(indents, key)) effective[key] = indents[key];
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
        return {html: () => account('<p>' + sourceToken(marker) + '</p>'), list: null};
      }
    }
    const pieces = await inline(node, context, mergeRunStyle(defaultRun, named.r)), output = [];
    if (effective.pageBreakBefore) pieces.unshift({pageBreak: true, semantic: true});
    const annotation = layout => {
      if (!context.tableCell) return layoutAttribute(layout);
      if (['first', 'indent', 'marker'].some(key => Object.hasOwn(layout, key))) {
        const {marker, ...paragraph} = layout;
        const css = indentStyle(paragraph, {portable: true, pointSize: referenceType(null).body, indentOffset: -(marker || 0)}) +
          (layout.align ? ';text-align:' + layout.align : '');
        return layoutAttribute(layout) + ' style="' + escape(css) + '"';
      }
      if (Object.keys(layout).length) warn('Individual paragraph alignment and picture sizing inside table cells were not retained; Markdown column alignment remains.');
      return '';
    };
    let text = '';
    const flush = () => { if (text) {
      const body = text;
      output.push(base => '<' + tag + annotation(paragraphLayout(effective, inferredHeading, list, base)) + '>' + body + '</' + tag + '>');
      text = '';
    } };
    for (const piece of pieces) {
      if (piece.displayMath) { flush(); output.push('<p>' + piece.html + '</p>'); continue; }
      if (piece.pageBreak) {
        flush();
        // A <br> child keeps this div non-blank so turndown's rapierPageBreak rule fires
        // (blank block nodes hit blankReplacement and would drop the marker).
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
      output.push('<p' + annotation(layout) + '>' + piece.image + '</p>');
    }
    flush();
    if (!output.length) output.push('<p><br></p>');
    if (pieces.some(piece => piece.image) && pieces.some(piece => piece.html?.trim())) warn('Pictures within text became separate source-order paragraphs.');
    return {html: base => output.map(piece => typeof piece === 'function' ? piece(base) : piece).join(''),
      layout: base => paragraphLayout(effective, inferredHeading, list, base), list, tableCell: context.tableCell};
  };
  const groupLists = blocks => {
    let html = ''; const stack = [];
    const close = () => { const level = stack.pop(); html += '</li></' + level.tag + '>'; };
    for (const block of blocks) {
      if (!block.list) { while (stack.length) close(); html += block.html(0); continue; }
      const list = block.list;
      while (stack.length && (stack.at(-1).level > list.level || stack.at(-1).level === list.level && (stack.at(-1).id !== list.id || stack.at(-1).tag !== list.tag))) close();
      if (stack.length && stack.at(-1).level === list.level) html += '</li>';
      else {
        const parentMarker = block.tableCell && stack.at(-1)?.marker;
        html += '<' + list.tag + (list.tag === 'ol' ? ' start="' + list.ordinal + '" data-rapier-list-numbering="authored" data-rapier-list-delimiter="' + list.delimiter + '"' : '') +
          (parentMarker ? ' style="' + indentStyle({indent: -parentMarker}, {portable: true, pointSize: referenceType(null).body}) + '"' : '') + '>';
        stack.push({...list, base: (stack.at(-1)?.base || 0) + (list.tag === 'ol' ? 660 : 300)});
      }
      const base = stack.at(-1).base, marker = block.layout(base).marker;
      stack.at(-1).marker = marker;
      html += '<li' + (list.tag === 'ol' ? ' data-rapier-list-ordinal="' + list.ordinal + '"' : '') +
        (marker ? ' style="' + (block.tableCell ? indentStyle({indent: marker}, {portable: true, pointSize: referenceType(null).body}) :
          indentStyle({marker})) + '"' : '') + '>' + block.html(base);
    }
    while (stack.length) close();
    return html;
  };
  const renderBlocks = async (nodes, context, sectionContexts = null) => {
    const blocks = [];
    for (let index = 0; index < nodes.length; index++) {
      checkCurrent();
      const node = nodes[index], active = sectionContexts ? {...context, ...sectionContexts[index]} : context;
      if (is(node, 'w', 'p')) blocks.push(await paragraph(node, active));
      else {
        const html = is(node, 'w', 'tbl') ? await table(node, active) : commentBoundary(node);
        blocks.push({html: () => html, list: null});
      }
    }
    return groupLists(blocks);
  };
  const tableParts = (container, name, ignored) => {
    const result = [];
    for (const node of container.children) {
      if (is(node, 'w', name)) result.push(node);
      else if (is(node, 'w') && ignored.includes(node.localName)) continue;
      else if (is(node, 'w', 'sdt')) {
        const content = child(node, 'w', 'sdtContent');
        if (!content) return fail('DOCX table content control has no content.');
        result.push(...tableParts(content, name, ignored));
      } else if (is(node, 'w') && ['customXml','ins','moveTo'].includes(node.localName)) {
        if (node.localName !== 'customXml') warn('Revision history was removed; current text was retained.');
        result.push(...tableParts(node, name, ignored));
      } else if (is(node, 'mc', 'AlternateContent')) result.push(...tableParts(chooseAlternate(node), name, ignored));
      else if (is(node, 'w') && ['del','moveFrom'].includes(node.localName)) warn('Revision history was removed; current text was retained.');
      else if (is(node, 'w') && ['commentRangeStart','commentRangeEnd'].includes(node.localName)) continue;
      else return fail('DOCX contains unsupported table content: ' + node.localName);
    }
    return result;
  };
  const table = async (node, context) => {
    stats.tables++;
    const properties = child(node, 'w', 'tblPr'), styleId = val(child(properties, 'w', 'tblStyle')), named = style(styleId);
    if (children(styles.get(styleId), 'w', 'tblStylePr').length) warn('Conditional table styling was not imported.');
    const rows = tableParts(node, 'tr', ['tblPr','tblGrid','bookmarkStart','bookmarkEnd']), output = [], spanning = new Map();
    for (const row of rows) {
      if (child(child(row, 'w', 'trPr'), 'w', 'del')) { warn('Revision history was removed; current text was retained.'); continue; }
      const cells = tableParts(row, 'tc', ['trPr','tblPrEx','bookmarkStart','bookmarkEnd']), rendered = []; let column = 0;
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
        const cellBlocks = sequence(cell);
        const html = await renderBlocks(cellBlocks, {...context, tableCell: true, width: Math.min(context.width, width), p: mergeParagraphProperties(context.p, named.p)});
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
    const html = '<table><tbody>' + output.map(row => '<tr>' + row.cells.map(cell => {
      const tag = row.header ? 'th' : 'td';
      return '<' + tag + (cell.span > 1 ? ' colspan="' + cell.span + '"' : '') + (cell.rows > 1 ? ' rowspan="' + cell.rows + '"' : '') +
        (cell.align && cell.align !== 'justify' ? ' style="text-align:' + cell.align + '"' : '') + '>' + cell.html + '</' + tag + '>';
    }).join('') + '</tr>').join('') + '</tbody></table>';
    const complex = !output[0]?.header || output.slice(1).some(row => row.header) || output.some(row => row.cells.some(cell =>
      cell.span > 1 || cell.rows > 1 || cell.html.includes(' data-md-layout=') ||
      (cell.html.match(/<p(?: |>)/g) || []).length > 1 || /<(?:table|[ou]l|h[1-6])(?: |>)/.test(cell.html)));
    if (!complex || context.tableCell) return html;
    const placeholder = '<p>' + sourceToken(html) + '</p>';
    rawTables.push({placeholder, html});
    return placeholder;
  };
  const nodes = sequence(body), contexts = new Array(nodes.length);
  let currentSection = sectionWidth(child(body, 'w', 'sectPr'));
  // A paragraph's sectPr closes the section before it; the body's sectPr closes the final section.
  for (let index = nodes.length - 1; index >= 0; index--) {
    const section = is(nodes[index], 'w', 'p') ? child(child(nodes[index], 'w', 'pPr'), 'w', 'sectPr') : null;
    if (section) currentSection = sectionWidth(section);
    contexts[index] = currentSection;
  }
  let html = await renderBlocks(nodes, {path: mainPath, p: {}}, contexts);
  const unplaced = [];
  for (const id of commentPart?.records.keys() || []) if (!activeComments.has(id) && !notes.has('docx-comment-' + id))
    unplaced.push(registerNote('comment', id, {path: mainPath, p: {}, ...currentSection}));
  if (unplaced.length) html += '<p>' + unplaced.join(' ') + '</p>';
  if (notes.size) {
    const items = [];
    for (const note of notes.values()) {
      checkCurrent();
      items.push('<li id="fn-' + note.label + '" data-footnote-label="' + note.label + '">' +
        note.metadata + await renderBlocks(sequence(note.content), note.context) + '</li>');
    }
    html += '<section class="footnotes"><ol>' + items.join('') + '</ol></section>';
  }
  const comments = {marker: commentMarker, threads: []};
  for (const group of commentGroups) {
    const messages = [];
    for (const info of group.records) {
      const date = info.date;
      if (date != null && !validCommentDate(date))
        return fail('DOCX contains an invalid comment date.', 'docx_comments_invalid');
      const instant = date && /(?:Z|[+-]\d{2}:\d{2})$/.test(date) ? Date.parse(date) : null;
      const createdAt = validCommentTimestamp(instant) ? instant : null;
      messages.push({id: 'word-message-' + info.id, author: {kind: 'human', name: attr(info.node, 'w', 'author') || ''},
        createdAt, ...(date != null ? {date} : {}), ...(info.parent != null ? {replyTo: 'word-message-' + info.parent} : {}),
        html: await renderBlocks(sequence(info.node),
          {path: commentPart.path, p: {}, note: true, ...currentSection})});
    }
    comments.threads.push({id: 'word-thread-' + group.id, wordId: group.id, resolved: group.resolved, messages});
  }
  if (comments.threads.length) {
    // Wait until actual note and message conversion has read all emitted source parts. Authored
    // text and attributes are escaped; only our exact staging spans may receive a new marker.
    const inputs = [];
    for (const root of xmlCache.values()) {
      inputs.push(root.textContent);
      for (const node of [root, ...descendants(root)]) for (const attribute of node.attributes) inputs.push(attribute.value);
    }
    for (let counter = 1; inputs.some(value => value.includes(comments.marker)); counter++)
      comments.marker = '\uFDD0RapierWordComment' + counter + '\uFDD1';
    if (comments.marker !== commentMarker) {
      const spans = new Map(comments.threads.flatMap(thread => ['S', 'E'].map(edge => {
        const boundary = thread.wordId + edge;
        return [sourceToken(commentMarker + boundary + commentMarker), sourceToken(comments.marker + boundary + comments.marker)];
      })));
      const restage = value => value.replace(/<span class="rapier-source-token" data-rapier-source="[^"]*" data-rapier-visible="[^"]*">[^<]*<\/span>/g,
        span => spans.get(span) || span);
      html = restage(html);
      for (const table of rawTables) table.html = restage(table.html);
      for (const thread of comments.threads) for (const message of thread.messages) message.html = restage(message.html);
    }
  }
  checkCurrent();
  if (html.length > ARCHIVE_LIMITS.bytes || new Blob([html]).size > ARCHIVE_LIMITS.bytes) return fail('Converted DOCX exceeds the 25 MB document limit.');
  const references = new Map(), imageResults = [];
  for (const request of imageRequests) {
    checkCurrent();
    const result = await embedImage(request.image), reference = result?.reference;
    checkCurrent();
    if (typeof reference !== 'string' || !/^[a-z0-9-]+$/i.test(reference))
      return fail('DOCX picture conversion did not return an image reference.');
    references.set(request.reference, reference);
    const url = result?.url;
    if (!dataImage(url))
      return fail('DOCX picture conversion did not return embedded image bytes.', 'docx_image_conversion');
    imageResults.push({reference, url});
  }
  for (const table of rawTables) {
    const replacement = '<p>' + sourceToken(docxPortableHtml(table.html, new Map(imageResults.map((image, index) => ['docx-pending-' + index, image.url])))) + '</p>';
    html = html.replaceAll(table.placeholder, () => replacement);
    for (const thread of comments.threads) for (const message of thread.messages) message.html = message.html.replaceAll(table.placeholder, () => replacement);
  }
  html = html.replace(/data-rapier-asset="(docx-pending-\d+)"/g, (_, key) => 'data-rapier-asset="' + references.get(key) + '"');
  if (html.length > ARCHIVE_LIMITS.bytes || new Blob([html]).size > ARCHIVE_LIMITS.bytes) return fail('Converted DOCX exceeds the 25 MB document limit.');
  for (const thread of comments.threads) for (const message of thread.messages)
    message.html = message.html.replace(/data-rapier-asset="(docx-pending-\d+)"/g, (_, key) => 'data-rapier-asset="' + references.get(key) + '"');
  return {html, warnings: [...warnings], stats, ...(comments.threads.length ? {comments} : {}),
    ...(canonical === null ? {} : {canonical})};
}

// Conversion changes Markdown delimiters and paragraph prefixes. Resolve Word's boundaries only
// after that one writer has produced its final source; no quote search can disambiguate repeats.
export function finishDocxMarkdown(source, result, {convertHtml} = {}) {
  if (typeof result?.canonical === 'string') return result.canonical;
  const review = result?.comments;
  if (!review?.threads.length) return source;
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
  if (!attached.length) return body;
  const parsed = parseComments(body), splice = writeComments(body, [...commentThreads(body, parsed), ...attached], parsed, {notes: true});
  return body.slice(0, splice.pos) + splice.inserted + body.slice(splice.pos + splice.removed.length);
}

// Convert trusted import staging to ordinary HTML for raw tables and the Notes HTML importer.
export function docxPortableHtml(html, imageUrls = new Map()) {
  // TeX is text here. Unlike an intentional raw-HTML source token, comparison signs
  // and ampersands in a formula must not be reinterpreted as HTML by the Notes door.
  html = html.replace(/<span class="math-rendered" data-math-src="([^"]*)">([\s\S]*?)<\/span>/g, (_, encoded, visible) => {
    const source = decodeURIComponent(encoded);
    if (escape(source) !== visible) return fail('DOCX equation source proof does not match.', 'docx_source_token');
    return escape(source);
  });
  // Source tokens must prove their visible source before becoming ordinary markup or entities.
  html = html.replace(/<span class="rapier-source-token" data-rapier-source="([^"]*)" data-rapier-visible="\1">([\s\S]*?)<\/span>/g,
    (whole, encoded, visible) => {
      const source = decodeURIComponent(encoded);
      if (escape(source) !== visible) return fail('DOCX source token proof does not match.', 'docx_source_token');
      return source;
    });
  html = html.replace(/<span data-md-color="(#[0-9a-f]{6})">/g, '<span style="color:$1">');
  html = html.replace(/<mark data-rapier-highlight="([a-z]+)">/g, (_, name) =>
    '<mark style="background-color:#' + HIGHLIGHT_RGB[name].map(n => n.toString(16).padStart(2, '0')).join('') + '">');
  html = html.replace(/data-rapier-asset="([^"]+)"/g, (_, reference) => {
    const url = imageUrls.get(reference);
    if (!dataImage(url)) return fail('DOCX picture conversion did not supply an embedded image.', 'docx_image_conversion');
    return 'src="' + escape(url) + '"';
  });
  return html.replace(/ data-(?:rapier|md)-[a-z-]+="[^"]*"/g, '');
}

// ── writeDocx: Markdown → OOXML. Drawings rasterise to PNG, not EMF. Math keeps its SVG and a PNG fallback.
export const DOCX_EXPORT = Object.freeze({drawingCodec: 'png', pictureCodec: 'png'});

const CONTENT_WIDTH_EMU = (12240 - 1440 - 1440) * 635;
const DOCX_HEADING_SCALE = Object.freeze([2.6, 1.9, 1.5, 1.25, 1.1, 1]);
const PNG_SIG = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);
const HIGHLIGHT_TO_DOCX = Object.freeze({...Object.fromEntries(Object.keys(DOCX_HIGHLIGHT_HEX).map(name => [name,name])), purple:'magenta'});

// mtime 0 and utf8Flag false keep the export's bytes: the DOS floor, no UTF-8 name flag.
const packDocx = entries => zipStored(entries.map(entry => ({...entry, modified: 0})), {utf8Flag: false});

function xmlBytes(text) { return utf8.encode(text); }
function isPng(bytes) { return bytes.length >= 8 && PNG_SIG.every((value, index) => bytes[index] === value); }
function isJpeg(bytes) { return bytes.length >= 2 && bytes[0] === 255 && bytes[1] === 216; }
function pngSize(bytes) {
  if (bytes.length < 24) return {width: 1, height: 1};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {width: view.getUint32(16) || 1, height: view.getUint32(20) || 1};
}
// JPEG size from images/raster.mjs (EXIF-oriented display size); an unreadable frame falls back to 1x1 like pngSize.
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
function decodeDataUrl(url) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+=*)$/i.exec(String(url || '').trim());
  if (!match) return null;
  return {type: match[1].toLowerCase(), bytes: fromBase64(match[2])};
}
// Walks the rendered export root, never a second Markdown grammar.
const INLINE_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'INS', 'DEL', 'S', 'STRIKE', 'MARK', 'CODE', 'A', 'SPAN', 'SUB', 'SUP', 'ABBR', 'IMG', 'INPUT', 'BR', 'KBD', 'SMALL']);
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
  const rendered = node.querySelector('svg');
  if (!rendered) return run;
  // The renderer's em dimensions are relative to this document's body size. The
  // fallback gets two raster pixels per CSS pixel; Word's extent keeps the same size.
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
  // HTML serialization writes literal whitespace in attributes. This file is XML,
  // whose reader would normalize those characters and corrupt a multiline TeX alt.
  // The alternative is plain text: a literal "url(...)" in TeX has no CSS authority.
  const label = escape(alternative).replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
  const text = sanitizeSvgText(mathSvgXml(svg)).replace(/^<svg(?=[\s>])/, '<svg aria-label="' + label + '"');
  if (utf8.encode(text).length > 8 * 1024 * 1024) return fail('This equation produces too much SVG to embed in Word.', 'docx_math_size');
  return {...run, svg: text, width, height, depth: depth ? Number(depth[1]) * pointSize : 0,
    ...(svg.hasAttribute('data-tex-utf16') ? {alternative: (display ? '$$' : '$') + alternative + (display ? '$$' : '$')} : {})};
}
const HIGHLIGHT_RGB = Object.freeze({green: [53, 197, 122], red: [240, 90, 98], blue: [79, 145, 247], yellow: [230, 185, 30], purple: [155, 109, 234]});
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
  if (!hex) return 'yellow';
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
// Footnote ids as the semantic renderer writes them (`fn-1`, `fnref-1`) and as the portable
// projection prefixes them (`<doc>-fn-1`): the trailing token after the last `fn`/`fnref`.
function footnoteTail(value) { const m = /fn(?:ref)?[-:]?([A-Za-z0-9_.]+)$/.exec(String(value || '')); return m ? m[1] : null; }

// Register only destinations actually carried by the writer. Word bookmark names are short,
// ASCII identifiers; a document-local ordinal distinguishes Unicode, punctuation and truncation
// collisions. Duplicate HTML ids resolve to the first target, as they do in the document.
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

// Each slot is an actual writer leaf. Paragraph boundaries are separate from its text, so a
// range across paragraphs cannot accidentally attach to identical words in another block.
function commentProjection(blocks) {
  let text = ''; const slots = [];
  const leaf = (value, valueText) => {
    const start = text.length; text += valueText;
    slots.push({value, start, end: text.length});
  };
  const runs = list => {
    for (const run of list || []) {
      if (run.type === 'text') leaf(run, run.text);
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
      else if (block.type === 'image') { leaf(block, '\uFFFC'); text += '\u2029'; }
      else if (block.type === 'code') { leaf(block, block.text); text += '\u2029'; }
      else if (block.type === 'math') { leaf(block, mathSourceOf({...block, display: true})); text += '\u2029'; }
      else if (block.type !== 'will') paragraph(block.runs);
    }
  };
  visit(blocks);
  return {text, slots};
}

const docxRoots = new WeakMap();
function commentMessageBlocks(model) {
  const blocks = [...model.blocks];
  // Word comments cannot contain footnote references. Keep each local note with its
  // matching label and rich content inside the message, without touching document notes.
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
  // This parser is the same source owner used by the editor. Sentinels never enter the
  // exported document: the two unmarked text streams must agree before any range is placed.
  const parser = markdownParser(), references = documentAssets(canonical).references, render = (source, env = {}) => {
    const template = root.ownerDocument.createElement('template');
    env.references = {...references};
    template.innerHTML = parser.render(source.slice(markdownBodyOffset(source)), env);
    return docxBlocksFromDom(template.content);
  };
  const source = parsed.body, original = commentProjection(render(source).blocks);
  if (parsed.notes && parsed.current) {
    const env = {}, full = render(canonical, env), fullProjection = commentProjection(full.blocks), actualProjection = commentProjection(model.blocks);
    const labels = new Set(parsed.noteLabels), ids = new Set((env.footnotes?.list || []).flatMap((note, index) => labels.has(note.label) ? [String(index + 1)] : []));
    const referencesOf = projection => projection.slots.filter(slot => slot.value.type === 'footnote').map(slot => slot.value.id);
    const noteProof = note => JSON.stringify(note, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
    // Only a byte-verified source appendix and its exact parser-owned references may be
    // omitted from native Word. A different portable model keeps all of its visible notes.
    if (ids.size === labels.size && fullProjection.text === actualProjection.text &&
        JSON.stringify(referencesOf(fullProjection)) === JSON.stringify(referencesOf(actualProjection)) &&
        [...ids].every(id => full.notes.has(id) && model.notes.has(id) && noteProof(full.notes.get(id)) === noteProof(model.notes.get(id)))) {
      const blocks = model.blocks.filter(block => !(block.type === 'paragraph' && block.runs.some(run => run.type === 'footnote' && ids.has(run.id)) &&
        block.runs.every(run => run.type === 'footnote' && ids.has(run.id) || run.type === 'text' && !run.text.trim() || ['bookmarkStart', 'bookmarkEnd'].includes(run.type))));
      const remaining = commentProjection(blocks);
      const survivingNotes = [...model.notes].filter(([id]) => !ids.has(id));
      if (remaining.text === original.text && !referencesOf(remaining).some(id => ids.has(id)) &&
          !survivingNotes.some(([, note]) => referencesOf(commentProjection(note.blocks)).some(id => ids.has(id)))) {
        model.blocks = blocks;
        for (const id of ids) model.notes.delete(id);
      }
    }
  }
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
  if (!candidates.size || original.text !== actual.text) return model;
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
    const start = actual.slots.find(slot => slot.start <= range.startAt && range.startAt < slot.end),
      end = [...actual.slots].reverse().find(slot => slot.start < range.endAt && range.endAt <= slot.end);
    if (!start || !end) continue;
    (start.value.commentEvents ||= []).push({at: range.startAt - start.start, id: review.id, start: true});
    (end.value.commentEvents ||= []).push({at: range.endAt - end.start, id: review.id, start: false});
    review.attached = true;
  }
  return model;
}

// The DOM may be the semantic render (data attributes) or the portable projection the exports
// share (inline styles, prefixed ids): both are read.
export function docxBlocksFromDom(root, options = {}) { return finish(docxBlocksFromDomSteps(root, options)); }
export async function docxBlocksFromDomAsync(root, options = {}) { return finishAsync(docxBlocksFromDomSteps(root, options), options.work); }
function* docxBlocksFromDomSteps(root, {canonical, pointSize = referenceType(typeof canonical === 'string' ? readDocumentSettings(canonical) : null).body, indentOffset = 0} = {}) {
  const blocks = [], refs = new Map(), notes = new Map();
  // Layout via spec/md-layout.mjs, never an ad hoc parse.
  const layoutOf = element => {
    const raw = element.tagName === 'IMG' ? element.getAttribute?.('data-rapier-image-layout') : null;
    if (raw) {
      const parsed = parseLayout(decodeLayoutAttribute(raw));
      // A drawing never carries rotate: its turn is baked into the rasterised bytes.
      if (parsed) return parsed;
    }
    const marker = element.getAttribute?.('data-md-layout');
    if (marker) {
      const parsed = parseLayout(decodeLayoutAttribute(marker));
      if (parsed) return parsed;
    }
    const align = element.getAttribute?.('data-md-align');
    const layout = /^(?:P|H[1-6])$/.test(element.tagName) ? textLayout(element.style, {pointSize, offset: indentOffset}) : {};
    if (align) layout.align = align;
    return Object.keys(layout).length ? layout : null;
  };
  const runsOf = function* (node, style = {}, out = [], mathPointSize = pointSize) {
    const anchor = node.getAttribute?.('id') || (node.tagName === 'A' && node.getAttribute('name'));
    const bookmark = anchor ? {anchor} : null;
    if (bookmark) out.push({type: 'bookmarkStart', bookmark});
    for (const child of Array.from(node.childNodes)) {
      yield;
      if (child.nodeType === 3) {
        // The semantic renderer puts one formatting newline after <br>. Unicode spaces and
        // authored tab characters are data, unlike HTML's collapsible CR/LF/ordinary space.
        const value = child.previousSibling?.nodeName === 'BR' ? child.nodeValue.replace(/^\n/, '') : child.nodeValue;
        if (/^[ \r\n]*$/.test(value) && Array.from(node.children).some(part => !INLINE_TAGS.has(part.tagName))) continue;
        if (value) out.push({...style, type: 'text', text: value.replace(/[ \r\n]+/g, ' ')});
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName;
      if (tag === 'BR') { out.push({...style, type: 'text', text: '\n'}); continue; }
      if (tag === 'IMG') {
        const src = child.getAttribute('src') || '';
        // An image in a quote or list carries its layout comment like a top-level image.
        if (/^data:image\//i.test(src)) out.push({...style, type: 'image', alt: child.getAttribute('alt') || '', src, ref: null, layout: layoutOf(child)});
        continue;
      }
      if (tag === 'SUP' && (child.classList.contains('footnote-ref') || /fn(?:ref)?[-:]?[A-Za-z0-9_.]+$/.test(child.querySelector('a')?.getAttribute('href') || ''))) {
        const id = footnoteTail(child.querySelector('a')?.getAttribute('href')) || child.textContent.trim();
        out.push({...style, type: 'footnote', id});
        continue;
      }
      if (tag === 'SPAN' && (child.classList.contains('math-rendered') || child.classList.contains('math-placeholder') || child.hasAttribute('data-rapier-math-source'))) {
        out.push(mathRunFromDom(child, style, mathPointSize));
        continue;
      }
      const next = {...style};
      // Word can carry these two stroke meanings as native run properties. Other ink
      // keeps its words and existing formatting; a stroke colour is not a text colour.
      const ink = tag === 'SPAN' ? parseInkBody(child.getAttribute('data-rapier-ink')) : null;
      if (ink?.kind === 'under') next.underline = true;
      else if (ink?.kind === 'strike') next.strike = true;
      if (tag === 'STRONG' || tag === 'B') next.bold = true;
      else if (tag === 'EM' || tag === 'I') next.italic = true;
      else if (tag === 'U' || tag === 'INS') next.underline = true;
      else if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') next.strike = true;
      else if (tag === 'CODE' || tag === 'KBD') next.code = true;
      else if (tag === 'SUB') next.sub = true;
      else if (tag === 'SUP') next.sup = true;
      else if (tag === 'MARK') next.highlight = HIGHLIGHT_TO_DOCX[child.getAttribute('data-rapier-highlight')] ? child.getAttribute('data-rapier-highlight') : nearestHighlight(child.style?.backgroundColor || child.getAttribute('style'));
      else if (tag === 'SPAN' && child.hasAttribute('data-md-color')) next.color = child.getAttribute('data-md-color');
      else if (tag === 'SPAN' && cssColorHex(child.style?.color)) next.color = cssColorHex(child.style.color);
      else if (tag === 'A') {
        const href = child.getAttribute('href') || '';
        if (/^(?:https?:\/\/|mailto:|tel:|#)/i.test(href)) next.href = href;
      }
      if (INLINE_TAGS.has(tag)) yield* runsOf(child, next, out, mathPointSize);
      else yield* runsOf(child, style, out, mathPointSize);
    }
    if (bookmark) out.push({type: 'bookmarkEnd', bookmark});
    return out;
  };
  const listItems = function* (list, level, items, inheritedOffset = indentOffset) {
    const ordered = list.tagName === 'OL';
    const listOffset = textLayout(list.style, {pointSize, offset: inheritedOffset}).indent || 0;
    let start = ordered ? parseInt(list.getAttribute('start') || '1', 10) : null;
    for (const li of Array.from(list.children)) {
      yield;
      if (li.tagName !== 'LI') continue;
      const own = (yield* cloneTree(li));
      const itemOffset = textLayout(own.style, {listMarker: true, pointSize, offset: listOffset}).marker || 0;
      const isList = child => /^(UL|OL)$/.test(child.tagName);
      const text = Array.from(own.childNodes).filter(child => !isList(child)).map(child => child.textContent || '').join('');
      const task = /^\s*[☐☒]/.test(text) ? text.trim().startsWith('☒') : null;
      if (task != null) {
        const walker = own.childNodes;
        for (const child of Array.from(walker)) {
          if (child.nodeType === 3 && /[☐☒]/.test(child.nodeValue)) { child.nodeValue = child.nodeValue.replace(/^\s*[☐☒]\s?/, ''); break; }
          if (child.nodeType === 1 && !isList(child) && /[☐☒]/.test(child.textContent)) { child.textContent = child.textContent.replace(/^\s*[☐☒]\s?/, ''); break; }
        }
      }
      // Loose items own paragraphs before and after their nested lists. Keep these blocks
      // in source order; only the first paragraph consumes this item's list marker.
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
        items.push({level, ordered, task, start, runs, layout: Object.keys(layout).length ? layout : null,
          heading: paragraph?.type === 'heading' ? paragraph.level : null,
          quote: paragraph?.type === 'quote', code: paragraph?.type === 'code'});
        first = false;
      };
      const flush = function* () {
        // Rendered block boundaries add ASCII whitespace nodes. Keep authored inline
        // separators, tabs and Unicode spaces, but not those boundary-only nodes.
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
            const lines = content.shift().text.split('\n');
            begin({type: 'code', runs: [{type: 'text', text: lines.shift(), code: true}]});
            if (lines.length) content.unshift({type: 'code', text: lines.join('\n')});
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
    if (Array.from(node.children).some(child => !INLINE_TAGS.has(child.tagName))) return (yield* docxBlocksFromDomSteps(node, {pointSize, indentOffset: offset})).blocks;
    return [{type: 'paragraph', runs: yield* runsOf(node), layout: offset ? {indent: offset} : null}];
  };
  const cellText = function* (cell) { return {blocks: yield* nestedBlocks(cell),
    colspan: integer(cell.getAttribute('colspan'), 1, 1, DOCX_LIMITS.tableColumns),
    rowspan: integer(cell.getAttribute('rowspan'), 1, 1), header: cell.tagName === 'TH'}; };
  for (const element of Array.from(root.children)) {
      yield;
    const tag = element.tagName;
    if (tag === 'SECTION' && (element.classList.contains('footnotes') || Array.from(element.querySelectorAll('li[id]')).some(li => footnoteTail(li.id)))) {
      for (const li of element.querySelectorAll('li[id]')) {
      yield;
        const clone = (yield* cloneTree(li));
        clone.querySelectorAll('a.footnote-backref, a[href*="fnref"]').forEach(a => {
          // The Markdown footnote renderer adds one separator before its return link.
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
      blocks.push({type: 'heading', level, runs: yield* runsOf(element, {}, [], size), layout: layoutOf(element)}); continue;
    }
    if (tag === 'HR') { blocks.push({type: 'paragraph', runs: [], layout: null, rule: true}); continue; }
    if (tag === 'PRE') { blocks.push({type: 'code', text: element.textContent.replace(/\n$/, '')}); continue; }
    if (tag === 'BLOCKQUOTE') {
      const label = element.querySelector('p > strong:first-child');
      const kind = label && /^(Note|Tip|Important|Warning|Caution|Danger|Info): $/.test(label.textContent) ? label.textContent.slice(0, -2).toUpperCase() : null;
      const clone = (yield* cloneTree(element));
      if (kind) clone.querySelector('p > strong:first-child').remove();
      const runs = [];
      for (const [index, child] of Array.from(clone.children).entries()) { if (index) runs.push({type: 'text', text: '\n'}); yield* runsOf(child, {}, runs); }
      blocks.push(kind ? {type: 'callout', kind, runs} : {type: 'quote', runs});
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
    if (tag === 'P' || tag === 'DIV' || tag === 'FIGURE' || tag === 'DETAILS') {
      const images = element.querySelectorAll('img');
      if (images.length === 1 && !element.textContent.trim()) {
        const image = images[0];
        blocks.push({type: 'image', alt: image.getAttribute('alt') || '', src: image.getAttribute('src') || '', ref: null, layout: layoutOf(image) || layoutOf(element)});
        continue;
      }
      // A blank line is a paragraph with no run. The Markdown renderer gives it a
      // no-break space; readDocx gives it a lone BR. Neither becomes a run on the next save.
      const runs = yield* runsOf(element);
      const blank = runs.length === 1 && runs[0].type === 'text' && /^(?:\u00a0+|\n)$/.test(runs[0].text);
      blocks.push({type: 'paragraph', runs: blank ? [] : runs, layout: layoutOf(element)});
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
  if (style.bold) bits.push('<w:b/>');
  if (style.italic) bits.push('<w:i/>');
  if (style.underline) bits.push('<w:u w:val="single"/>');
  if (style.strike) bits.push('<w:strike/>');
  if (style.code) bits.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>');
  if (style.color && /^#[0-9a-f]{6}$/i.test(style.color)) bits.push('<w:color w:val="' + style.color.slice(1).toLowerCase() + '"/>');
  if (style.highlight && HIGHLIGHT_TO_DOCX[style.highlight]) bits.push('<w:highlight w:val="' + HIGHLIGHT_TO_DOCX[style.highlight] + '"/>');
  if (style.sub) bits.push('<w:vertAlign w:val="subscript"/>');
  else if (style.sup) bits.push('<w:vertAlign w:val="superscript"/>');
  if (style.vanish) bits.push('<w:vanish/>');
  return bits.length ? '<w:rPr>' + bits.join('') + '</w:rPr>' : '';
}

function tXml(text, style = {}) {
  return '<w:r>' + rPrXml(style) + String(text).split(/([\n\t])/).map(part => part === '\n' ? '<w:br/>' :
    part === '\t' ? '<w:tab/>' : '<w:t xml:space="preserve">' + escape(part).replace(/\r/g, '&#13;') + '</w:t>').join('') + '</w:r>';
}

function pPrXml({styleId, outline, align, numId, ilvl, vanish, borders, shading, ind, numTab} = {}) {
  const bits = [];
  if (styleId) bits.push('<w:pStyle w:val="' + escape(styleId) + '"/>');
  if (numId != null) bits.push('<w:numPr><w:ilvl w:val="' + (ilvl || 0) + '"/><w:numId w:val="' + numId + '"/></w:numPr>');
  if (numTab != null) bits.push('<w:tabs><w:tab w:val="num" w:pos="' + integer(numTab, null, -2147483648) + '"/></w:tabs>');
  if (align && ['left', 'right', 'center', 'both'].includes(align)) bits.push('<w:jc w:val="' + align + '"/>');
  if (ind) bits.push(ind);
  if (outline != null) bits.push('<w:outlineLvl w:val="' + outline + '"/>');
  if (vanish) bits.push('<w:rPr><w:vanish/></w:rPr>');
  if (borders) bits.push(borders);
  if (shading) bits.push(shading);
  return bits.length ? '<w:pPr>' + bits.join('') + '</w:pPr>' : '';
}

function pXml(inner, props) { return '<w:p>' + pPrXml(props) + inner + '</w:p>'; }

function jcOf(layout) {
  const value = layout?.align;
  return value === 'justify' ? 'both' : ['left', 'right', 'center'].includes(value) ? value : null;
}

// One step of `indent` or `first` is 2em of the document's body type. A point is 20 twips.
// A heading ignores `first`. `w:left` is the start edge of a left-to-right paragraph, the edge the key indents from.
function indOf(layout, {first = true, base = 0, pointSize = referenceType(null).body, hanging = null} = {}) {
  const step = pointSize * 40;
  const left = Math.round(base + (layout?.indent || 0) * step);
  const firstLine = first && layout?.first ? Math.round(layout.first * step) : -Math.round(hanging);
  // Compensated public CSS must finish in the same native integer domain the reader admits.
  integer(left, null, -2147483648);
  integer(Math.abs(firstLine));
  if (!left && !firstLine && hanging == null) return '';
  return '<w:ind' + (left ? ' w:left="' + left + '"' : '') +
    (firstLine > 0 ? ' w:firstLine="' + firstLine + '"' : firstLine < 0 ? ' w:hanging="' + -firstLine + '"' :
      hanging != null ? ' w:hanging="0"' : '') + '/>';
}

// `rewriteDocument` writes the Will markers into word/document.xml in the one pass.
// The reference scale (docs/markdown-standard.md, "The reference scale"), in Word's units: a unit is 12 pt, the body 1.1
// units (13.2 pt, written on Word's half-point grid as 13) unless `fontsize` says, and the line at least 1.75 units (21 pt, so an inline picture is never clipped)
// unless `linestretch` makes it the body times its factor. Every Markdown document Word gets is set so.
function referenceType(settings) {
  const body = settings?.fontsize ? settings.fontsize.unit * 12 : 13.2;
  return {body, line: settings?.linestretch ? body * settings.linestretch.factor : 21};
}

function documentDefaultsXml(settings) {
  if (!settings) return '';
  const type = referenceType(settings), half = Math.round(type.body * 2);
  const run = [];
  if (settings.mainfont && settings.mainfont.word) {
    const face = escape(settings.mainfont.word);
    run.push('<w:rFonts w:ascii="' + face + '" w:hAnsi="' + face + '" w:cs="' + face + '"/>');
  }
  run.push('<w:sz w:val="' + half + '"/><w:szCs w:val="' + half + '"/>');
  const spacing = '<w:spacing w:line="' + Math.round(type.line * 20) + '" w:lineRule="atLeast"/>';
  return '<w:docDefaults>' +
    (run.length ? '<w:rPrDefault><w:rPr>' + run.join('') + '</w:rPr></w:rPrDefault>' : '') +
    (spacing ? '<w:pPrDefault><w:pPr>' + spacing + '</w:pPr></w:pPrDefault>' : '') +
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
  const carrySource = typeof canonical === 'string';
  const bodyPointSize = referenceType(settings).body;
  const navigation = await finishAsync(docxNavigationSteps([...blocks, ...Array.from(notes.values()).flatMap(note => note.blocks || [])]), work);
  const rels = [], media = [];
  let rid = 1, docPr = 1;
  const nextRid = () => 'rId' + (rid++);
  const noteMap = new Map();
  const stylesRid = nextRid(), numberingRid = nextRid(), footnotesRid = nextRid();
  const numbering = {abstracts: [
    {id: 1, format: 'bullet', text: '•'},
    {id: 2, format: 'decimal', text: null}
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
    let {bytes, type} = decoded, width, height;
    const foreign = type !== 'image/png' && type !== 'image/jpeg';
    if (foreign || isJxl(bytes)) {
      if (typeof convertImage !== 'function')
        return fail('DOCX export converts JPEG XL, WebP and SVG pictures to PNG; pass convertImage.');
      const converted = await convertImage({bytes, type, alt: alt || '', drawing: drawing || type === 'image/svg+xml'});
      bytes = converted.bytes instanceof Uint8Array ? converted.bytes : new Uint8Array(converted.bytes);
      type = converted.type || 'image/png';
      width = converted.width; height = converted.height;
    }
    if (isJxl(bytes) || type === 'image/jxl')
      return fail('JPEG XL must arrive as PNG in the DOCX (picture format law).');
    if (type === 'image/svg+xml')
      return fail('Drawings must arrive as PNG in the DOCX (DOCX_EXPORT.drawingCodec).');
    const png = isPng(bytes);
    if (!png && !isJpeg(bytes)) return fail('DOCX pictures must be PNG or JPEG.');
    const size = png ? pngSize(bytes) : jpegSize(bytes);
    return {bytes, type: png ? 'image/png' : 'image/jpeg', width: width || size.width, height: height || size.height};
  };

  // One media part per exact bytes+type. The cache holds a promise set before any await, so racing occurrences share one registration.
  const assetCache = new Map(), mediaByBytes = new Map();
  const registerImage = image => {
    // Source spelling and conversion inputs can differ while the final picture bytes match.
    // The checksum only narrows the bucket; exact equality owns media identity.
    const key = image.type + ':' + image.bytes.length + ':' + crc32(image.bytes);
    const bucket = mediaByBytes.get(key) || [];
    let part = bucket.find(row => row.bytes.every((byte, at) => byte === image.bytes[at]));
    if (!part) {
      const extension = image.type === 'image/svg+xml' ? '.svg' : image.type === 'image/jpeg' ? '.jpeg' : '.png';
      const id = nextRid(), name = 'image' + media.length + extension;
      part = {id, name, bytes: image.bytes, type: image.type};
      media.push(part); bucket.push(part); mediaByBytes.set(key, bucket);
      rels.push({id, type: 'image', target: 'media/' + name});
    }
    return part;
  };
  const assetFor = (src, alt, drawing) => {
    const key = src + '|' + (drawing ? '1' : '0');
    let promise = assetCache.get(key);
    if (!promise) {
      promise = rasterise(decodeDataUrl(src), alt, drawing).then(image => {
        const part = registerImage(image);
        return {id: part.id, width: image.width, height: image.height};
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
        // Models supplied directly to this writer get the same resource boundary as
        // DOM-prepared maths. A text alternative cannot be an active SVG resource.
        const resources = run.svg.replace(/\saria-label="[^"]*"/g, '');
        if (sanitizeSvgText(resources) !== resources)
          return fail('This equation contains an unsafe SVG resource.', 'docx_math_svg_unsafe');
        const bytes = utf8.encode(run.svg);
        if (bytes.length > 8 * 1024 * 1024) return fail('This equation produces too much SVG to embed in Word.', 'docx_math_size');
        const fallback = await rasterise({bytes, type: 'image/svg+xml'}, run.alternative || mathSourceOf(run), true);
        const raster = registerImage(fallback), vector = registerImage({bytes, type: 'image/svg+xml'});
        return {id: raster.id, svgId: vector.id, width: run.width, height: run.height};
      })();
      mathAssetCache.set(run.svg, promise);
    }
    return promise;
  };

  // A picture sized in lines (`lines`) takes the reference scale's line and body (referenceType); the cap height about 0.7 of
  // the body. 12,700 EMU to the point.
  const linesEmu = lines => {
    const {body, line} = referenceType(settings);
    return ((lines - 1) * line + body * .7) * 12700;
  };
  const pictureXml = (asset, alt, layout, baseline = 0) => {
    const fraction = layout?.width > 0 ? Math.min(100, layout.width) / 100 : null;
    const tall = layout?.lines > 0 ? linesEmu(layout.lines) : null;
    const cx = Math.max(1, Math.round(tall ? Math.min(CONTENT_WIDTH_EMU, tall * (asset.width || 1) / (asset.height || 1))
      : fraction ? CONTENT_WIDTH_EMU * fraction : Math.min(CONTENT_WIDTH_EMU, (asset.width || 1) * 9525)));
    const cy = Math.max(1, Math.round(cx * ((asset.height || 1) / (asset.width || 1))));
    const pr = docPr++;
    const description = escape(alt || '').replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
    // rot in 60000ths of a degree, folded into [0, 21600000); cx/cy stay the unturned extents (Word rotates about the centre).
    const rot = layout?.rotate ? Math.round(((layout.rotate * 60000) % 21600000 + 21600000) % 21600000) : 0;
    // Microsoft Office's SVG extension points at the original vector, while a:blip
    // retains the ordinary raster image for readers without SVG support (MS-ODRAWXML).
    const effects = (layout?.opacity < 100 ? '<a:alphaModFix amt="' + layout.opacity * 1000 + '"/>' : '') +
      (asset.svgId ? '<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">' +
        '<asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="' + asset.svgId + '"/></a:ext></a:extLst>' : '');
    const graphic = '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + pr + '" name="Picture ' + pr + '" descr="' + description + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      // The fade is the blip's alphaModFix, in thousandths of a percent as OOXML writes it.
      '<pic:blipFill><a:blip r:embed="' + asset.id + (effects ? '">' + effects + '</a:blip>' : '"/>') +
      '<a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm' + (rot ? ' rot="' + rot + '"' : '') + '><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>';
    return '<w:r>' + (baseline ? '<w:rPr><w:position w:val="' + Math.round(baseline * 2) + '"/></w:rPr>' : '') + '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + pr + '" name="Picture ' + pr + '" descr="' + description + '"/><wp:cNvGraphicFramePr/>' +
      graphic + '</wp:inline></w:drawing></w:r>';
  };

  const resolveSrc = run => run.src || (run.ref ? refs.get(String(run.ref).toLowerCase()) : null);

  const commentEventXml = event => event.start ? '<w:commentRangeStart w:id="' + event.id + '"/>' :
    '<w:commentRangeEnd w:id="' + event.id + '"/><w:r><w:commentReference w:id="' + event.id + '"/></w:r>';
  const commentedTextXml = (text, style, start = 0, end = text.length) => {
    const events = (style.commentEvents || []).filter(event => event.at >= start && event.at <= end)
      .sort((a, b) => a.at - b.at || Number(a.start) - Number(b.start) || a.id - b.id);
    let xml = '', at = start;
    for (const event of events) { if (event.at > at) xml += tXml(text.slice(at, event.at), style); xml += commentEventXml(event); at = event.at; }
    if (at < end) xml += tXml(text.slice(at, end), style);
    return xml;
  };
  const commentObjectXml = (inner, value) => (value.commentEvents || []).filter(event => event.at === 0).map(commentEventXml).join('') +
    inner + (value.commentEvents || []).filter(event => event.at === 1).map(commentEventXml).join('');

  const emitRuns = async (runList, targets = navigation) => {
    let xml = '';
    for (const run of runList) {
      await tick();
      if (run.type === 'bookmarkStart' || run.type === 'bookmarkEnd') {
        const mark = targets.bookmarks.get(run.bookmark);
        xml += run.type === 'bookmarkStart'
          ? '<w:bookmarkStart w:id="' + mark.id + '" w:name="' + mark.name + '"/>'
          : '<w:bookmarkEnd w:id="' + mark.id + '"/>';
        continue;
      }
      const internal = run.href?.startsWith('#');
      const target = internal && targets.resolve(run.href);
      const link = inner => target ? '<w:hyperlink w:anchor="' + target.name + '">' + inner + '</w:hyperlink>' : inner;
      if (run.type === 'image') {
        const src = resolveSrc(run);
        if (!src) continue;
        xml += commentObjectXml(link(pictureXml(await assetFor(src, run.alt, false), run.alt, run.layout || null)), run);
        continue;
      }
      if (run.type === 'footnote') {
        if (!noteMap.has(run.id)) noteMap.set(run.id, {id: noteMap.size + 1, content: notes.get(run.id) || ''});
        xml += commentObjectXml('<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="' + noteMap.get(run.id).id + '"/></w:r>', run);
        continue;
      }
      if (run.type === 'math') {
        const source = mathSourceOf(run);
        if (run.svg) {
          const picture = pictureXml(await mathAssetFor(run), run.alternative || source, null, run.display ? 0 : -(run.depth || 0));
          // A math source is a single visual object. Source-owned comments that touch
          // it enclose the whole picture; their text offsets do not cut an SVG apart.
          const events = run.commentEvents || [];
          xml += link(events.filter(event => event.start).map(commentEventXml).join('') + picture + events.filter(event => !event.start).map(commentEventXml).join(''));
        } else xml += link(commentedTextXml(source, run));
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

  const quoteBorders = '<w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="777777"/></w:pBdr>';
  const codeShading = '<w:shd w:val="clear" w:color="auto" w:fill="F4F4F4"/>';
  const emitBlocks = async (blocks, inset = 0, targets = navigation) => {
   const bodyParts = [];
   const paragraphInd = layout => indOf(layout, {base: inset, pointSize: bodyPointSize});
   const tableInd = inset ? '<w:tblInd w:w="' + Math.round(inset) + '" w:type="dxa"/>' : '';
   for (const block of blocks) {
      if (blocks === model.blocks) work?.onProgress?.(.72 + .13 * (++emitted / Math.max(1, blocks.length)));
      await tick();
    if (block.type === 'break') {
      bodyParts.push(pXml('<w:r><w:br w:type="page"/></w:r>'));
      continue;
    }
    if (block.type === 'will') {
      bodyParts.push(pXml(tXml(block.text, {vanish: true}), {vanish: true}));
      continue;
    }
    if (block.type === 'heading') {
      const inner = await emitRuns(block.runs, targets);
      bodyParts.push(pXml(inner, {styleId: 'Heading' + block.level, outline: block.level - 1, align: jcOf(block.layout), ind: indOf(block.layout, {first: false, base: inset, pointSize: bodyPointSize})}));
      continue;
    }
    if (block.type === 'math') {
      bodyParts.push(pXml(await emitRuns([{...block, display: true}], targets), {align: 'center', ind: paragraphInd(null)}));
      continue;
    }
    if (block.type === 'image') {
      const src = block.src || (block.ref ? refs.get(String(block.ref).toLowerCase()) : null);
      if (!src) continue;
      const drawing = /^data:image\/svg\+xml/i.test(src);
      bodyParts.push(pXml(commentObjectXml(pictureXml(await assetFor(src, block.alt, drawing), block.alt, block.layout), block), {align: jcOf(block.layout), ind: paragraphInd(null)}));
      if (block.caption) bodyParts.push(pXml(tXml('Figure: ' + block.caption), {align: 'center', ind: paragraphInd(null)}));
      continue;
    }
    if (block.type === 'callout') {
      const label = tXml('[!' + block.kind + ']', {bold: true});
      const body = await emitRuns(block.runs, targets);
      const border = '<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="0969DA"/></w:pBdr>';
      bodyParts.push('<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' + tableInd + '<w:tblBorders>' +
        '<w:left w:val="single" w:sz="24" w:space="0" w:color="0969DA"/>' +
        '<w:top w:val="nil"/><w:right w:val="nil"/><w:bottom w:val="nil"/>' +
        '</w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="9000" w:type="dxa"/></w:tcPr>' +
        pXml(label, {borders: border}) + pXml(body || tXml(''), {borders: border}) +
        '</w:tc></w:tr></w:tbl>');
      continue;
    }
    if (block.type === 'quote') {
      bodyParts.push(pXml(await emitRuns(block.runs, targets), {
        borders: quoteBorders, ind: paragraphInd(null)
      }));
      continue;
    }
    if (block.type === 'list') {
      const idAt = [], leftAt = [];
      let lastNumberedLevel = -1;
      for (const item of block.items) {
      await tick();
        if (item.continuation) {
          while (idAt.length && idAt[idAt.length - 1].level > item.level) idAt.pop();
          bodyParts.push(await emitBlocks(item.blocks, leftAt[item.level] ?? inset, targets));
          continue;
        }
        // The reference column advances 2.75 units for numbers and 1.25 for bullets.
        // Each unit is 12 points at M; mixed nesting adds each ancestor's own advance.
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
        if (top && top.level === item.level && top.ordered === item.ordered) numId = top.numId;
        else if (top && !!top.ordered === !!item.ordered && item.level > top.level) numId = top.numId;
        else numId = allocNum(item.ordered ? 2 : 1);
        const freshLevel = !top || top.level !== item.level || top.numId !== numId;
        if (freshLevel && item.ordered) {
          const start = item.start ?? 1, prior = numEntries.get(numId).starts.get(item.level);
          // A new branch needs its own start when no numbered ancestor intervened to
          // restart this level, or when its authored start differs from the prior branch.
          if (prior != null && (prior !== start || lastNumberedLevel >= item.level)) numId = allocNum(2);
          numEntries.get(numId).starts.set(item.level, start);
        }
        if (freshLevel) idAt.push({level: item.level, ordered: item.ordered, numId});
        const prefix = item.task == null ? '' : (item.task ? '[x] ' : '[ ] ');
        const inner = (prefix ? tXml(prefix) : '') + await emitRuns(item.runs, targets);
        bodyParts.push(pXml(inner, {styleId: item.heading ? 'Heading' + item.heading : 'ListParagraph',
          outline: item.heading ? item.heading - 1 : null, numId, ilvl: item.level, align: jcOf(item.layout), ind, numTab,
          borders: item.quote ? quoteBorders : null, shading: item.code ? codeShading : null}));
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
      const width = Math.max(1, Math.floor(9000 / cols));
      const cell = async value => {
        const span = value.colspan || 1;
        const inner = value.continuation ? pXml('') : value.blocks ? await emitBlocks(value.blocks, 0, targets) : pXml(await emitRuns(value.runs || [], targets));
        return '<w:tc><w:tcPr><w:tcW w:w="' + width * span + '" w:type="dxa"/>' +
          (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') +
          (value.continuation ? '<w:vMerge/>' : value.rowspan > 1 ? '<w:vMerge w:val="restart"/>' : '') + '</w:tcPr>' +
          (inner || pXml('')) + (value.blocks?.at(-1)?.type === 'table' ? pXml('') : '') + '</w:tc>';
      };
      let tbl = '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' + tableInd + '</w:tblPr><w:tblGrid>' +
        Array.from({length: cols}, () => '<w:gridCol w:w="' + width + '"/>').join('') + '</w:tblGrid>';
      for (const row of grid) {
        tbl += '<w:tr>' + (row.header ? '<w:trPr><w:tblHeader/></w:trPr>' : '');
        let end = 0;
        for (const value of row.cells) { tbl += await cell(value); end = value.column + value.colspan; }
        for (; end < cols; end++) tbl += await cell({});
        tbl += '</w:tr>';
      }
      tbl += '</w:tbl>';
      bodyParts.push(tbl);
      if (block.caption) bodyParts.push(pXml(tXml('Table: ' + block.caption), {align: 'center', ind: paragraphInd(null)}));
      continue;
    }
    if (block.type === 'code') {
      const text = String(block.text || ''); let at = 0;
      for (const line of text.split('\n')) {
      await tick();
        bodyParts.push(pXml(commentedTextXml(text, {...block, code: true}, at, at + line.length), {shading: codeShading, ind: paragraphInd(null)}));
        at += line.length + 1;
      }
      continue;
    }
    if (block.rule) {
      bodyParts.push(pXml('', {borders: '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>', ind: paragraphInd(null)}));
      continue;
    }
    bodyParts.push(pXml(await emitRuns(block.runs, targets), {align: jcOf(block.layout), ind: paragraphInd(block.layout)}));
   }
   return bodyParts.join('') || pXml('');
  };
  const bodyXml = await emitBlocks(blocks) + comments.filter(comment => !comment.attached)
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
      let body = message.blocks ? await emitBlocks(message.blocks, 0, targets) : pXml(tXml(message.text));
      // Word's thread key is the last paragraph of the comment, including a last paragraph
      // inside a table. Each message gets its own key; replies point at their actual parent.
      const paragraphs = [...body.matchAll(/<w:p(?=>)/g)], last = paragraphs.at(-1)?.index;
      if (last == null) body += '<w:p w14:paraId="' + paraId + '"/>';
      else body = body.slice(0, last) + '<w:p w14:paraId="' + paraId + '"' + body.slice(last + 4);
      commentXml.push('<w:comment w:id="' + id + '" w:author="' + escape(message.author.name) + '"' +
        (date ? ' w:date="' + escape(date) + '"' : '') + '>' + body + '</w:comment>');
      commentExXml.push('<w15:commentEx w15:paraId="' + paraId + '" w15:done="' + (comment.resolved ? 1 : 0) + '"' +
        (parent != null ? ' w15:paraIdParent="' + (parent + 1).toString(16).toUpperCase().padStart(8, '0') + '"' : '') + '/>');
    }
  }
  const noteXml = [];
  for (const note of noteMap.values()) {
    const body = typeof note.content === 'string' ? pXml(tXml(note.content)) : await emitBlocks(note.content.blocks);
    const marked = body.replace(/<w:p>(<w:pPr>[\s\S]*?<\/w:pPr>)?/, (open) => open + '<w:r><w:footnoteRef/></w:r>');
    noteXml.push('<w:footnote w:id="' + note.id + '">' + marked + '</w:footnote>');
  }

  const footerId = settings && settings.pagestyle === 'plain' ? nextRid() : '';
  const sectPr = sectionPropertiesXml(settings, footerId);
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:document xmlns:w="' + NS.w[0] + '" xmlns:r="' + NS.r[0] + '" xmlns:a="' + NS.a[0] +
    '" xmlns:wp="' + NS.wp[0] + '" xmlns:pic="' + NS.pic[0] + '">\n<w:body>' +
    bodyXml + sectPr + '</w:body></w:document>';

  // Headings on the reference scale, as spec/markdown-style.css sets them: h1 to h6 at 2.6, 1.9, 1.5, 1.25, 1.1 and 1 of the
  // body, on two, one and a half, one and a half, then one line.
  const type = settings ? referenceType(settings) : null;
  const headingStyles = [1, 2, 3, 4, 5, 6].map(level => {
    const size = type ? Math.round(type.body * DOCX_HEADING_SCALE[level - 1] * 2) : 0;
    const line = type ? Math.round(type.line * [2, 1.5, 1.5, 1, 1, 1][level - 1] * 20) : 0;
    return '<w:style w:type="paragraph" w:styleId="Heading' + level + '"><w:name w:val="heading ' + level + '"/>' +
      '<w:basedOn w:val="Normal"/><w:pPr>' + (type ? '<w:spacing w:line="' + line + '" w:lineRule="atLeast"/>' : '') +
      '<w:outlineLvl w:val="' + (level - 1) + '"/></w:pPr>' +
      (type ? '<w:rPr><w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/></w:rPr>' : '') + '</w:style>';
  }).join('');
  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="' + NS.w[0] + '">' +
    documentDefaultsXml(settings) +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' + headingStyles +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>' +
    '</w:styles>';

  const lvl = (ilvl, format, text) => '<w:lvl w:ilvl="' + ilvl + '"><w:start w:val="1"/><w:numFmt w:val="' + format + '"/>' +
    '<w:lvlText w:val="' + (format === 'bullet' ? '•' : '%' + (ilvl + 1) + '.') + '"/><w:lvlJc w:val="left"/></w:lvl>';
  const abstracts = numbering.abstracts.map(row => '<w:abstractNum w:abstractNumId="' + row.id + '">' +
    Array.from({length: 9}, (_, ilvl) => lvl(ilvl, row.format)).join('') + '</w:abstractNum>').join('');
  // Word defaults every level to 1; the starts map already owns each level's first authored start.
  const overrideXml = ([ilvl, start]) => '<w:lvlOverride w:ilvl="' + ilvl + '"><w:startOverride w:val="' + start + '"/></w:lvlOverride>';
  const nums = numbering.nums.map(row => '<w:num w:numId="' + row.id + '"><w:abstractNumId w:val="' + row.abstract + '"/>' +
    [...row.starts].filter(([, start]) => start !== 1).sort((a, b) => a[0] - b[0]).map(overrideXml).join('') + '</w:num>').join('');
  const numberingXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="' + NS.w[0] + '">' +
    abstracts + nums + '</w:numbering>';

  const footnoteXml = noteMap.size ? '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:footnotes xmlns:w="' + NS.w[0] +
    '" xmlns:r="' + NS.r[0] + '" xmlns:a="' + NS.a[0] + '" xmlns:wp="' + NS.wp[0] + '" xmlns:pic="' + NS.pic[0] + '">' +
    noteXml.join('') + '</w:footnotes>' : null;
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
    ...(footnoteXml ? [{id: footnotesRid, type: 'footnotes', target: 'footnotes.xml'}] : []),
    ...(footerId ? [{id: footerId, type: 'footer', target: 'footer1.xml'}] : []),
    ...(commentsXml ? [{id: nextRid(), type: 'comments', target: 'comments.xml'},
      {id: nextRid(), type: 'http://schemas.microsoft.com/office/2011/relationships/commentsExtended', target: 'commentsExtended.xml'}] : []),
    ...rels
  ];
  const types = ['png', 'jpeg', 'svg'].filter(ext => media.some(row => row.name.endsWith('.' + ext)));
  const defaults = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    (types.includes('png') ? '<Default Extension="png" ContentType="image/png"/>' : '') +
    (types.includes('jpeg') ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : '') +
    (types.includes('svg') ? '<Default Extension="svg" ContentType="image/svg+xml"/>' : '');
  const overrides = [
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
  ];
  if (footnoteXml) overrides.push('<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>');
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
  if (footnoteXml) {
    entries.push({name: 'word/footnotes.xml', bytes: await encodeXml(footnoteXml)});
    const used = new Set([...footnoteXml.matchAll(/\br:(?:id|embed)="([^"]+)"/g)].map(match => match[1]));
    const noteRels = rels.filter(row => used.has(row.id));
    if (noteRels.length) entries.push({name: 'word/_rels/footnotes.xml.rels', bytes: await encodeXml(relXml(noteRels))});
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
  // The limit is the plain package's, decided before the markers are asked for.
  if (typeof rewriteDocument === 'function') {
    const at = entries.findIndex(entry => entry.name === 'word/document.xml');
    entries[at] = {name: entries[at].name, bytes: await encodeXml(rewriteDocument(new TextDecoder('utf-8').decode(entries[at].bytes)))};
  }
  if (carrySource) entries.push({name: DOCX_SOURCE.path, bytes: await docxSourceRecord(entries, (bom === true ? '\uFEFF' : '') + canonical, work)});
  await pause(work, .94);
  const complete = work ? await zipStoredAsync(entries.map(entry => ({...entry, modified: 0})), {utf8Flag: false, work}) : packDocx(entries);
  if (complete.length > ARCHIVE_LIMITS.bytes) return fail('DOCX exceeds the 25 MB document limit.');
  return complete;
}
