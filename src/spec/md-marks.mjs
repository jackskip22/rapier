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

// Ink (docs/markdown-standard.md, "Ink"; the design docs/briefs/ink.md): a pen stroke that stays with the words it
// marks, a paired comment with the colour span's shape. The opener holds the stroke:
//   <!--ink KIND [COLOUR] [box=W,H] [at=X,Y] PATH-->words<!--/ink-->
// KIND is the stroke's kind, decided once when it was lifted; COLOUR is exactly the colour span's value, red when
// absent; box is the frame's size when the stroke was drawn and at the frame's offset from the words' box, both in
// hundredths of an em; PATH is the stroke, its first point absolute in the frame and the rest as moves, hundredths of an
// em. One spelling: the fields in this order, one space between, integers only. A comment that does not read this way
// is ordinary comment text and marks nothing. Ink pairs do not nest in each other.
const INK_KINDS = Object.freeze(['under', 'strike', 'ring', 'bracket', 'free']);
const INK_CLOSE = '<!--/ink-->';
const INK_PATH_MAX = 160;
const INK_INT_MAX = 999999;
const INK_INT = '-?\\d{1,6}';
const INK_OPEN_BODY = '(' + INK_KINDS.join('|') + ')(?: (' + COLOR_VALUE + '))?(?: box=(\\d{1,6}),(\\d{1,6}))?(?: at=(' + INK_INT + '),(' + INK_INT + '))?'
	+ ' (' + INK_INT + ',' + INK_INT + '(?: ' + INK_INT + ',' + INK_INT + ')*)';
const INK_OPEN_PATTERN = '<!--ink ' + INK_OPEN_BODY + '-->';

export { INK_KINDS, INK_CLOSE, INK_PATH_MAX, INK_INT_MAX };

const inkInt = (value, name) => {
	if (!Number.isInteger(value) || Math.abs(value) > INK_INT_MAX) throw new TypeError('ink: ' + name + ' must be an integer within ' + INK_INT_MAX);
	return value;
};
const inkPair = (value, name, nonNegative = false) => {
	if (!Array.isArray(value) || value.length !== 2) throw new TypeError('ink: ' + name + ' must be a pair of integers');
	const pair = [inkInt(value[0], name), inkInt(value[1], name)];
	if (nonNegative && (pair[0] < 0 || pair[1] < 0)) throw new TypeError('ink: ' + name + ' must not be negative');
	return pair;
};

// {kind, hex?, box?, at?, path} to the opener; the path's points are absolute in the frame and become moves after the
// first. Refuses with a TypeError rather than writing a spelling the reader would not read.
export function formatInkOpen(mark) {
	if (!mark || typeof mark !== 'object') throw new TypeError('ink: a mark is an object');
	if (!INK_KINDS.includes(mark.kind)) throw new TypeError('ink: the kind is one of ' + INK_KINDS.join(', '));
	let colour = '';
	if (mark.hex != null) {
		const value = TEXT_COLOR_HEX_TO_NAME[mark.hex] || mark.hex;
		if (!new RegExp('^' + COLOR_VALUE + '$').test(value)) throw new TypeError('ink: the colour is the colour span\'s value');
		colour = ' ' + value;
	}
	const box = mark.box == null ? '' : ' box=' + inkPair(mark.box, 'box', true).join(',');
	const at = mark.at == null ? '' : ' at=' + inkPair(mark.at, 'at').join(',');
	if (!Array.isArray(mark.path) || !mark.path.length || mark.path.length > INK_PATH_MAX) throw new TypeError('ink: the path holds 1 to ' + INK_PATH_MAX + ' points');
	const points = mark.path.map(point => inkPair(point, 'path'));
	const moves = [points[0].join(',')];
	for (let i = 1; i < points.length; i++) moves.push([inkInt(points[i][0] - points[i - 1][0], 'path move'), inkInt(points[i][1] - points[i - 1][1], 'path move')].join(','));
	return '<!--ink ' + mark.kind + colour + box + at + ' ' + moves.join(' ') + '-->';
}

export function formatInkRun(mark, content) {
	return formatInkOpen(mark) + content + INK_CLOSE;
}

function readInkMatch(match) {
	const moves = match[7].split(' ').map(pair => pair.split(',').map(Number));
	if (moves.length > INK_PATH_MAX) return null;
	const path = [moves[0]];
	for (let i = 1; i < moves.length; i++) {
		const point = [path[i - 1][0] + moves[i][0], path[i - 1][1] + moves[i][1]];
		if (Math.abs(point[0]) > INK_INT_MAX || Math.abs(point[1]) > INK_INT_MAX) return null;
		path.push(point);
	}
	const colour = match[2] || null;
	return Object.freeze({
		kind: match[1],
		hex: colour == null ? null : (colour.charCodeAt(0) === 0x23 ? colour : TEXT_COLOR_NAMES[colour]),
		box: match[3] == null ? null : [Number(match[3]), Number(match[4])],
		at: match[5] == null ? null : [Number(match[5]), Number(match[6])],
		path,
	});
}

// Returns {mark, length in UTF-16 units} or null; not end-anchored.
export function matchInkOpen(text) {
	if (typeof text !== 'string') return null;
	const match = new RegExp('^' + INK_OPEN_PATTERN).exec(text);
	if (!match) return null;
	const mark = readInkMatch(match);
	return mark && { mark, length: match[0].length };
}

export function parseInkOpen(comment) {
	if (typeof comment !== 'string') return null;
	const match = new RegExp('^' + INK_OPEN_PATTERN + '$').exec(comment);
	return match && readInkMatch(match);
}

export function isInkClose(comment) {
	return comment === INK_CLOSE;
}

// Every ink marker in order: {start, end, mark} for an opener (mark null for a closer, and an opener whose path
// overflows is not a marker at all).
export function scanInkMarkers(source) {
	const text = String(source == null ? '' : source);
	const scan = new RegExp(INK_OPEN_PATTERN + '|' + INK_CLOSE.replace(/[-]/g, '\\-'), 'g');
	const markers = [];
	let match;
	while ((match = scan.exec(text))) {
		if (match[0] === INK_CLOSE) { markers.push({ start: match.index, end: match.index + match[0].length, mark: null, close: true }); continue; }
		const mark = readInkMatch(match);
		if (mark) markers.push({ start: match.index, end: match.index + match[0].length, mark, close: false });
	}
	return markers;
}

// The runs: an opener and the next closer with no opener between them. A marker that pairs with nothing is text
// (it shows nothing and marks nothing) and is listed under strays.
export function pairInkMarkers(source) {
	const runs = [], strays = [];
	let open = null;
	for (const marker of scanInkMarkers(source)) {
		if (!marker.close) { if (open) strays.push(open); open = marker; continue; }
		if (!open) { strays.push(marker); continue; }
		runs.push({ start: open.start, end: marker.end, innerStart: open.end, innerEnd: marker.start, mark: open.mark });
		open = null;
	}
	if (open) strays.push(open);
	return { runs, strays };
}

export function stripInkMarkers(text) {
	return String(text == null ? '' : text).replace(new RegExp(INK_OPEN_PATTERN + '|' + INK_CLOSE.replace(/[-]/g, '\\-'), 'g'), '');
}

export function hasInkMarker(text) {
	return new RegExp(INK_OPEN_PATTERN + '|' + INK_CLOSE.replace(/[-]/g, '\\-')).test(String(text == null ? '' : text));
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
