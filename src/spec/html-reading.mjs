// SPDX-License-Identifier: AGPL-3.0-only

export const THEMATIC_BREAK = '---';

export const HARD_BREAK = '  ';
export function cellBreaks(markdown) { return String(markdown).replace(/ {2}\n/g, '<br>'); }

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

const HIGHLIGHT_HUES = Object.freeze({
	red: 0,
	yellow: 48,
	green: 142,
	blue: 214,
	purple: 274,
});

const CSS_BASIC_COLORS = new Map('maroon:800000 red:f00 purple:800080 fuchsia:f0f magenta:f0f green:008000 lime:0f0 olive:808000 yellow:ff0 navy:000080 blue:00f teal:008080 aqua:0ff cyan:0ff'
	.split(' ').map(pair => pair.split(':')));

export function parseCssColor(value) {
	const source = String(value || '').trim().toLowerCase();
	if (!source || source === 'transparent') return null;
	let match = /^#([0-9a-f]{3,8})$/i.exec(CSS_BASIC_COLORS.has(source) ? '#' + CSS_BASIC_COLORS.get(source) : source);
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

export const HIGHLIGHT_HEX = Object.freeze({
	green: '#35c57a', red: '#f05a62', blue: '#4f91f7', yellow: '#e6b91e', purple: '#9b6dea',
});
export const highlightOpen = colour => '<mark style="background-color:' + HIGHLIGHT_HEX[colour] + '">';

// single = inside a run (RAPIER_PANDOC_MARK_RE); what it cannot fence is a run holding ==, or one that starts
// marker table, RAPIER_HIGHLIGHT_COLORS). Those keep their highlight as `<mark>` (null here; the caller
export function highlightRun(content, visible, colour, colours) {
	if (HIGHLIGHT_HEX[colour]) return highlightOpen(colour) + content + '</mark>';
	const fenceable = visible.length > 0 && visible.indexOf('==') < 0 && content.indexOf('==') < 0 && !/^[\s=]|[\s=]$/.test(visible) &&
		!Object.values(colours).some(marker => visible.startsWith(marker));
	return fenceable ? '==' + content + '==' : null;
}

export function cellAlignment(style, align) {
	const declared = /text-align:\s*(left|center|right)/i.exec(String(style || ''));
	const value = (declared ? declared[1] : String(align || '')).toLowerCase();
	return value === 'left' || value === 'center' || value === 'right' ? value : '';
}
function alignmentDelimiter(alignment) {
	return alignment === 'center' ? ':---:' : alignment === 'right' ? '---:' : alignment === 'left' ? ':---' : '---';
}
export function delimiterRow(alignments) { return '| ' + alignments.map(alignmentDelimiter).join(' | ') + ' |'; }

export function codeLanguage(className) {
	const language = (String(className || '').match(/language-(\S+)/) || [null, ''])[1];
	return language === 'undefined' ? '' : language;
}
export function codeBlock(fence, language, body) {
	return fence + language + '\n' + body + (body && !body.endsWith('\n') ? '\n' : '') + fence;
}

export function scriptRun(text, mark) {
	return new RegExp('^[^\\s' + (mark === '~' ? '~' : '\\^') + ']+$').test(text) ? mark + text + mark : null;
}

export function definitionList(parts) {
	const groups = [];
	let terms = [];
	for (const {term, definition} of parts) {
		if (term != null) { if (term) terms.push(term); continue; }
		const head = terms.length ? terms.join('\n') + '\n' : '';
		groups.push(head + definition.split('\n').map((line, index) => (index ? '  ' : ': ') + line).join('\n'));
		terms = [];
	}
	if (terms.length) groups.push(terms.join('\n'));
	return groups.join('\n\n');
}

export function detailsBlock(summary, body) {
	return '<details>\n<summary>' + String(summary).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
		'</summary>\n\n' + (body ? body + '\n\n' : '') + '</details>';
}

export function linkTitle(title) {
	return title ? ' "' + String(title).replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : '';
}

export function orderedListExpressible({reversed, typed, start, values}) {
	return !reversed && !typed && Number.isInteger(start) && start >= 0 && start + values.length - 1 <= 999999999 &&
		values.every((value, index) => value == null || Number(value) === start + index);
}

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


export function wordListLevel(style) {
	const found = /(?:^|;)\s*mso-list\s*:\s*([^;]*)/i.exec(String(style || ''));
	const value = found ? found[1].trim() : '';
	if (!value || /^(?:ignore|none)$/i.test(value)) return 0;
	const level = /\blevel\s*(\d+)\b/i.exec(value);
	return level ? Math.min(Math.max(Number(level[1]), 1), 64) : 1;
}

export function wordListIsMarker(style) {
	return /(?:^|;)\s*mso-list\s*:\s*ignore\b/i.test(String(style || ''));
}

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
	if (/^(.)\1*$/.test(lower)) readings.alpha = (lower.length - 1) * 26 + lower.charCodeAt(0) - 96;
	return readings.roman || readings.alpha ? {kind: 'ordered', delimiter, readings} : {kind: 'text', text: marker};
}

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
