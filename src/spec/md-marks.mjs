// SPDX-License-Identifier: MIT
// The one place these literal grammars are written (docs/markdown-standard.md, "Text colour", "Page break").

const TEXT_COLOR_NAMES = Object.freeze({ green: '#1c7547', red: '#b32034', blue: '#175dc4', gold: '#865818', purple: '#7924d7' });
const TEXT_COLOR_HEX_TO_NAME = Object.freeze(
	Object.fromEntries(Object.entries(TEXT_COLOR_NAMES).map(([name, hex]) => [hex, name]))
);
const COLOR_NAME_ALT = Object.keys(TEXT_COLOR_NAMES).join('|');
const COLOR_VALUE = '(?:#[0-9a-f]{6}|' + COLOR_NAME_ALT + ')';
const COLOR_CLOSE = '<!--/c-->';
const PAGE_BREAK_MARKER = '<!--md-break:v1 page-->';

export { TEXT_COLOR_NAMES, TEXT_COLOR_HEX_TO_NAME, COLOR_CLOSE, PAGE_BREAK_MARKER };

export function formatColorOpen(hex) {
	return '<!--c ' + (TEXT_COLOR_HEX_TO_NAME[hex] || hex) + '-->';
}

export function formatColorRun(hex, content) {
	return formatColorOpen(hex) + content + COLOR_CLOSE;
}

// Relocated into the parse Worker by .toString() (engine.js _buildParseWorkerSource): read only parameters, TEXT_COLOR_NAMES and COLOR_CLOSE.

// Returns {hex, length in UTF-16 units} or null; not end-anchored.
export function matchColorOpen(text) {
	if (typeof text !== 'string') return null;
	const match = new RegExp('^<!--c (#[0-9a-f]{6}|' + Object.keys(TEXT_COLOR_NAMES).join('|') + ')-->').exec(text);
	if (!match) return null;
	const value = match[1];
	return { hex: value.charCodeAt(0) === 0x23 /* '#' */ ? value : TEXT_COLOR_NAMES[value], length: match[0].length };
}

export function parseColorOpen(comment) {
	if (typeof comment !== 'string') return null;
	const match = new RegExp('^<!--c (#[0-9a-f]{6}|' + Object.keys(TEXT_COLOR_NAMES).join('|') + ')-->$').exec(comment);
	if (!match) return null;
	const value = match[1];
	return value.charCodeAt(0) === 0x23 /* '#' */ ? value : TEXT_COLOR_NAMES[value];
}

export function isColorClose(comment) {
	return comment === COLOR_CLOSE;
}

export function scanColorMarkers(source) {
	const text = String(source == null ? '' : source);
	const scan = new RegExp('<!--c (?:(#[0-9a-f]{6})|(' + COLOR_NAME_ALT + '))-->|<!--/c-->', 'g');
	const markers = [];
	let match;
	while ((match = scan.exec(text))) {
		const hex = match[1] || (match[2] ? TEXT_COLOR_NAMES[match[2]] : null) || null;
		markers.push({ start: match.index, end: match.index + match[0].length, hex });
	}
	return markers;
}

export function stripColorMarkers(text) {
	return String(text == null ? '' : text).replace(new RegExp('<!--(?:c ' + COLOR_VALUE + '|/c)-->', 'g'), '');
}

export function hasColorMarker(text) {
	return new RegExp('<!--(?:c ' + COLOR_VALUE + '|/c)-->').test(String(text == null ? '' : text));
}

// The only spelling.
export function formatPageBreak() {
	return PAGE_BREAK_MARKER;
}

export function isPageBreakLine(text) {
	return typeof text === 'string' && /^<!--md-break:v1 page-->\r?$/.test(text);
}

// Also relocated by .toString(); reads only its own regex.
export function isPageBreakBlock(text) {
	return typeof text === 'string' && /^<!--md-break:v1 page-->\r?\n?$/.test(text);
}
