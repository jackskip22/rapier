// SPDX-License-Identifier: AGPL-3.0-only
// One reading of foreign HTML (#337). Two walkers turn HTML into Markdown: the paste door's Turndown
// (createTurndown in editor/engine.js, which is also the save serializer) and Notes import
// (notes/html-md.mjs, no DOM). Each shape below has one spelling, the standard's
// (docs/formatting-algebra.md section 1, docs/markdown-standard.md), and both walkers take it from here.

// A thematic break is `---` (CommonMark's own first example). Both walkers put a blank line before
// it, so it never reads as a setext underline.
export const THEMATIC_BREAK = '---';

// A line break (<br>) is a hard break spelled as Rapier's writers already spell one: two spaces
// before the new line (the save serializer, Keep's checklists, Notion's properties). Two in a
// row leave a line of spaces, which CommonMark reads as a paragraph break.
// A GFM table cell has one line, so a hard break inside a cell is written as <br>.
export const HARD_BREAK = '  ';
export function cellBreaks(markdown) { return String(markdown).replace(/ {2}\n/g, '<br>'); }

// Words holding a mark's characters stay words, one spelling through both readers. The reader's
// extended marks are ==highlight==, ++underline++, ~subscript~, ~~strike~~ and ^superscript^, so:
// - a run of two or more = or + that touches a word (or a text's edge, where a neighbour's words may
//   follow) could open or close a highlight or an underline, and each of its characters is written \=
//   or \+; a run standing between spaces cannot, and neither can a single = or + inside a line, so
//   those are written bare;
// - a ~ or ^ opens or closes its mark alone, so each one that touches a word or an edge is written \~ or
//   \^, and one standing between spaces is bare;
// - at a text's or a line's start, a single = is still \= (a setext underline) and a single + before a
//   space or the end is still \+ (a list's marker).
// `markdown` is a text already escaped by its walker: a backslash before a character is an escape pair,
// read as that character, so the answer depends only on the words and not on how either walker's own
// escape spelled these four (Turndown escapes almost none of them, the importers' escape every one).
const MARK_CHARACTERS = '=+~^';
export function markRuns(markdown) {
	const source = String(markdown);
	const markAt = i => MARK_CHARACTERS.includes(source[i]) ? source[i]
		: source[i] === '\\' && MARK_CHARACTERS.includes(source[i + 1] || '\n') ? source[i + 1] : '';
	let out = '', i = 0;
	while (i < source.length) {
		const mark = markAt(i);
		if (!mark) { const step = source[i] === '\\' && i + 1 < source.length ? 2 : 1; out += source.slice(i, i + step); i += step; continue; }
		const start = i;
		let count = 0;
		while (i < source.length && markAt(i) === mark) { i += source[i] === '\\' ? 2 : 1; count++; }
		const before = source[start - 1], after = source[i];
		const lineStart = before === undefined || before === '\n';
		const spaced = before !== undefined && /\s/.test(before) && after !== undefined && /\s/.test(after);
		const paired = mark === '=' || mark === '+';
		let escaped = !spaced && (!paired || count >= 2);
		if (!escaped && lineStart && count === 1)
			escaped = mark === '=' || (mark === '+' && (after === undefined || /\s/.test(after)));
		out += (escaped ? '\\' + mark : mark).repeat(count);
	}
	return out;
}

// A pasted or imported background colour becomes one of the highlight picker's colours by its hue;
// a pale, grey or transparent background is no highlight. Only an inline run's own background counts
// (a paragraph's background is layout, not a mark).
const HIGHLIGHT_HUES = Object.freeze({
	red: 0,
	yellow: 48,
	green: 142,
	blue: 214,
	purple: 274,
});

export function parseCssColor(value) {
	const source = String(value || '').trim().toLowerCase();
	if (!source || source === 'transparent') return null;
	let match = /^#([0-9a-f]{3,8})$/i.exec(source);
	if (match) {
		let hex = match[1];
		if (hex.length === 3 || hex.length === 4) hex = [...hex].map(char => char + char).join('');
		if (hex.length !== 6 && hex.length !== 8) return null;
		const rgb = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16));
		const alpha = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
		return { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha };
	}
	match = /^rgba?\(\s*([+-]?(?:\d+\.?\d*|\.\d+)%?)\s*[, ]\s*([+-]?(?:\d+\.?\d*|\.\d+)%?)\s*[, ]\s*([+-]?(?:\d+\.?\d*|\.\d+)%?)(?:\s*[,/]\s*([+-]?(?:\d+\.?\d*|\.\d+)%?))?\s*\)$/i.exec(source);
	if (!match) return null;
	const channel = token => token.endsWith('%')
		? Math.round(Math.max(0, Math.min(100, parseFloat(token))) * 2.55)
		: Math.round(Math.max(0, Math.min(255, parseFloat(token))));
	const alpha = token => !token ? 1 : token.endsWith('%')
		? Math.max(0, Math.min(100, parseFloat(token))) / 100
		: Math.max(0, Math.min(1, parseFloat(token)));
	return { r: channel(match[1]), g: channel(match[2]), b: channel(match[3]), a: alpha(match[4]) };
}

export function highlightOfStyle(style, tagName) {
	if (!/^(?:SPAN|FONT|MARK|B|I|U|S|STRONG|EM|DEL|INS)$/.test(String(tagName || '').toUpperCase())) return '';
	const source = String(style || '');
	const match = /(?:^|;)\s*background-color\s*:\s*([^;]+)/i.exec(source) ||
		/(?:^|;)\s*background\s*:\s*([^;]+)/i.exec(source);
	if (!match) return '';
	const colorToken = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i.exec(match[1]);
	const rgb = parseCssColor(colorToken ? colorToken[0] : match[1]);
	if (!rgb || rgb.a < 0.18) return '';
	const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
	const lightness = (max + min) / 2;
	const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
	if (lightness < 0.12 || lightness > 0.985 || saturation < 0.16 || delta < 0.08) return '';
	let hue = 0;
	if (delta) {
		if (max === r) hue = 60 * (((g - b) / delta) % 6);
		else if (max === g) hue = 60 * ((b - r) / delta + 2);
		else hue = 60 * ((r - g) / delta + 4);
		if (hue < 0) hue += 360;
	}
	let best = '', bestDistance = Infinity;
	for (const [name, target] of Object.entries(HIGHLIGHT_HUES)) {
		const distance = Math.abs(hue - target);
		const circular = Math.min(distance, 360 - distance);
		if (circular < bestDistance) { best = name; bestDistance = circular; }
	}
	return best;
}

// The == fence reads a single = inside a run (RAPIER_PANDOC_MARK_RE); what it cannot fence is a run
// holding ==, or one that starts or ends with a space or =, or a plain run that would read back as a
// colour marker. Those keep their highlight as inline HTML (null here; the caller writes <mark>),
// rather than losing it: `<mark>` is CommonMark, readable by every other Markdown app, and the reader
// admits it. Every other run is Bear's own spelling, `==x==` or `==🟡x==`. `content` is the run's
// Markdown, `visible` its words, `colours` the picker's name-to-marker table (RAPIER_HIGHLIGHT_COLORS).
export function highlightRun(content, visible, colour, colours) {
	const markers = Object.values(colours);
	const plainReadsAsColour = !colours[colour] && markers.some(marker => visible.startsWith(marker));
	const fenceable = visible.length > 0 && visible.indexOf('==') < 0 && content.indexOf('==') < 0 && !/^[\s=]|[\s=]$/.test(visible) && !plainReadsAsColour;
	return fenceable ? '==' + (colours[colour] || '') + content + '==' : null;
}

// A table's alignment is its header cells' own (`style="text-align:…"`, else the `align` attribute),
// written in GFM's delimiter row; a body cell's alignment has no place in GFM.
export function cellAlignment(style, align) {
	const declared = /text-align:\s*(left|center|right)/i.exec(String(style || ''));
	const value = (declared ? declared[1] : String(align || '')).toLowerCase();
	return value === 'left' || value === 'center' || value === 'right' ? value : '';
}
export function alignmentDelimiter(alignment) {
	return alignment === 'center' ? ':---:' : alignment === 'right' ? '---:' : alignment === 'left' ? ':---' : '---';
}

// A code block's language is its `language-…` class (the HTML standard's own convention), written as
// the fence's info string; a class some exporters write as the literal word `undefined` is none.
export function codeLanguage(className) {
	const language = (String(className || '').match(/language-(\S+)/) || [null, ''])[1];
	return language === 'undefined' ? '' : language;
}

// A picture's or a link's title is written after its destination in double quotes: line breaks as
// spaces, a backslash and a quote escaped. Empty is no title.
export function linkTitle(title) {
	return title ? ' "' + String(title).replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : '';
}

// A table kept as HTML (a spanning cell, a block in a cell) is one CommonMark HTML block, which a
// blank line ends. Its line breaks are written as character references, &#10; and &#13;, so none
// can end it: the paste door's table writer has done so since Astra's R2, and Notes import, which
// keeps the source's own markup, does the same. A break between a tag's attributes is whitespace
// there (one space, none beside other whitespace); inside a quoted value it is the reference too.
export function htmlBlockLines(html) {
	const source = String(html);
	let out = '', tag = false, quote = '';
	for (let i = 0; i < source.length; i++) {
		const c = source[i];
		if (c === '\n' || c === '\r') {
			if (tag && !quote) { if (!/\s/.test(out.slice(-1)) && !/\s/.test(source[i + 1] || '')) out += ' '; }
			else out += c === '\n' ? '&#10;' : '&#13;';
			continue;
		}
		if (tag) { if (quote) { if (c === quote) quote = ''; } else if (c === '"' || c === "'") quote = c; else if (c === '>') tag = false; }
		else if (c === '<') tag = true;
		out += c;
	}
	return out;
}

// A word processor wraps each item of a tight list in one paragraph. The list is loose only when
// an item holds more than one block, or when the editor rendered it loose and marked the list
// (data-rapier-list-loose). One paragraph per item is the tight list the person pasted.
const LIST_BLOCKS = new Set(['P', 'DIV', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'DL', 'DETAILS', 'TABLE', 'HR', 'FIGURE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
function listTag(node) {
	return String(node && (node.nodeName || node.tag) || '').toUpperCase();
}
function listElements(node) {
	const kids = node && node.children;
	if (!kids || typeof kids.length !== 'number') return [];
	const out = [];
	for (let i = 0; i < kids.length; i++) {
		const child = kids[i];
		if (child && typeof child === 'object') out.push(child);
	}
	return out;
}
function listMarkedLoose(node) {
	if (!node) return false;
	if (typeof node.hasAttribute === 'function' && node.hasAttribute('data-rapier-list-loose')) return true;
	return !!(node.attrs && Object.prototype.hasOwnProperty.call(node.attrs, 'data-rapier-list-loose'));
}
export function listIsLoose(node) {
	if (!node || typeof node !== 'object') return false;
	const tag = listTag(node);
	const list = tag === 'LI' ? (node.parentNode || node.parent || node) : node;
	if (listMarkedLoose(list)) return true;
	const items = listTag(list) === 'LI' ? [list] : listElements(list).filter(child => listTag(child) === 'LI');
	return items.some(item => listElements(item).filter(child => LIST_BLOCKS.has(listTag(child))).length > 1);
}
