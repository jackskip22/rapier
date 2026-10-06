// SPDX-License-Identifier: AGPL-3.0-only
// One reading of foreign HTML. Two walkers turn HTML into Markdown: the paste door's Turndown
// (createTurndown in editor/engine.js, which is also the save serializer) and Notes import
// (notes/html-md.mjs, no DOM). Each shape below has one spelling, the standard's
// (docs/markdown-standard.md), and both walkers take it from here.

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
// can end it: the paste door's table writer does so, and Notes import, which keeps the source's
// own markup, does the same. A break between a tag's attributes is whitespace there (one space,
// none beside other whitespace); inside a quoted value it is the reference too.
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

// A list from Word. Word puts a list on the clipboard as ordinary paragraphs: the paragraph's style names its
// level (`mso-list:l0 level2 lfo1`) and its bullet or number is the text of a span whose style is `mso-list:Ignore`,
// at the paragraph's start. The paste's sanitizer empties a style of every property the browser does not know, so
// it carries both (editor/engine.js, the paste hook of _rapierInstallSanitizeHooks) for the conversion that reads
// them (_rapierPasteWordLists), which writes what a person would have: one list nested by level, an ordered item
// numbered as Word numbered it, the marker and Word's spacing after it gone. Notes import does not read it yet: it
// keeps a Word export's markup as literal source.

// The level of a list paragraph, 1 and up. A style without `mso-list` is no list paragraph's; `Ignore` marks the
// span that holds a marker and `none` a paragraph taken out of its list: 0 for all three.
export function wordListLevel(style) {
	const found = /(?:^|;)\s*mso-list\s*:\s*([^;]*)/i.exec(String(style || ''));
	const value = found ? found[1].trim() : '';
	if (!value || /^(?:ignore|none)$/i.test(value)) return 0;
	const level = /\blevel\s*(\d+)\b/i.exec(value);
	return level ? Math.min(Math.max(Number(level[1]), 1), 64) : 1;
}

// Whether a style is the one of the span that holds a list paragraph's marker.
export function wordListIsMarker(style) {
	return /(?:^|;)\s*mso-list\s*:\s*ignore\b/i.test(String(style || ''));
}

// What a marker's text says, its spacing and any direction marks dropped. A bullet has no letter or digit in it (a
// dot, a bullet sign, a section sign, the private glyphs of Symbol and Wingdings), is empty (a picture bullet), or is
// one letter alone (Courier's `o`, Wingdings' `l` `n` `v`: letters of a symbol font). An ordered item is digits (`1.`
// `1)` `(1)`, and Word's `1.1.`, whose own number is the last), letters or roman numerals (`a.` `(iv)` `I.`), each with
// its dot or bracket; a bracket, `)`, is the list's delimiter. Anything else (`Step 1:`, `Article I.`) is words Word
// generated, and stays words: `text`. `readings` are the numbers a marker can be, by alphabet: `i.` is roman 1 or the
// ninth letter.
const WORD_ROMAN = /^m{0,4}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/;
const WORD_ROMAN_VALUES = {i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000};
export function wordListMarker(text) {
	const marker = String(text == null ? '' : text).replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
	if (!/[\p{L}\p{N}]/u.test(marker)) return {kind: 'bullet'};
	const found = /^\(?(\d{1,9}(?:\.\d{1,9})*|[A-Za-z]+)([.)]?)$/.exec(marker);
	const digits = !!found && /^\d/.test(found[1]);
	if (!found || !digits && !found[2]) return Array.from(marker).length === 1 ? {kind: 'bullet'} : {kind: 'text', text: marker};
	const delimiter = found[2] === ')' ? ')' : '.';
	if (digits) return {kind: 'ordered', delimiter, readings: {decimal: Number(found[1].split('.').pop())}};
	const lower = found[1].toLowerCase(), readings = {};
	if (found[1] !== lower && found[1] !== found[1].toUpperCase()) return {kind: 'text', text: marker};
	if (WORD_ROMAN.test(lower)) readings.roman = Array.from(lower).reduce((sum, letter, at, all) => {
		const value = WORD_ROMAN_VALUES[letter], next = WORD_ROMAN_VALUES[all[at + 1]] || 0;
		return sum + (value < next ? -value : value);
	}, 0);
	// Word counts past z by doubling: aa, bb, cc.
	if (/^(.)\1*$/.test(lower)) readings.alpha = (lower.length - 1) * 26 + lower.charCodeAt(0) - 96;
	return readings.roman || readings.alpha ? {kind: 'ordered', delimiter, readings} : {kind: 'text', text: marker};
}

// The number an ordered list starts at: what its markers read as in the one alphabet that counts them one by one
// (decimal, roman or letters), the smaller start where two do (`i.` alone is 1; with `j.` after it, the ninth letter).
function wordListStart(markers) {
	let best = null;
	for (const alphabet of ['decimal', 'roman', 'alpha']) {
		const values = markers.map(marker => marker.readings[alphabet]);
		if (values[0] == null) continue;
		const rank = [values.every((value, at) => value === values[0] + at) ? 0 : 1, values[0]];
		if (!best || rank[0] < best[0] || rank[0] === best[0] && rank[1] < best[1]) best = rank;
	}
	return best ? best[1] : 1;
}

// The lists of a run of list paragraphs. `items` are `{level, marker}` in the order they stand (`marker` as
// wordListMarker read it). The answer is the top lists: a list is `{ordered, items}` (an ordered one also its
// `delimiter` and the `start` its first marker gives), each of its items `{item, lists}`, the place of the paragraph
// in `items` and the lists inside it. A deeper level opens a list inside the item above; a shallower one returns to
// the list it left; a level Word skipped (1, then 3) is one deeper only; a run that begins below level 1 has that
// level for its top; a change between bullets and numbers at one level is a new list beside the last.
export function wordListTree(items) {
	const roots = [], stack = [];
	const open = (siblings, marker) => {
		const list = marker.kind === 'ordered' ? {ordered: true, delimiter: marker.delimiter, start: 1, items: [], markers: []}
			: {ordered: false, items: []};
		siblings.push(list);
		return list;
	};
	items.forEach(({level, marker}, item) => {
		while (stack.length > 1 && level <= stack[stack.length - 2].level) stack.pop();
		let top = stack[stack.length - 1];
		if (!top || level > top.level) {
			const siblings = top ? top.list.items[top.list.items.length - 1].lists : roots;
			stack.push(top = {level, siblings, list: open(siblings, marker)});
		} else if (top.list.ordered !== (marker.kind === 'ordered')) {
			stack[stack.length - 1] = top = {level: top.level, siblings: top.siblings, list: open(top.siblings, marker)};
		}
		top.list.items.push({item, lists: []});
		if (top.list.ordered) top.list.markers.push(marker);
	});
	const finish = list => {
		if (list.ordered) { list.start = wordListStart(list.markers); delete list.markers; }
		for (const {lists} of list.items) lists.forEach(finish);
	};
	roots.forEach(finish);
	return roots;
}
