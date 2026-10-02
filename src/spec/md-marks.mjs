// SPDX-License-Identifier: MIT
// The one place these literal grammars are written (docs/markdown-standard.md, "Text colour", "Page break").

// The exported page retains this reader alone. The editor uses the same closure, then adds its writers and scans.
const inkReader = () => {
	// SPDX-License-Identifier: MIT
	const TEXT_COLOR_NAMES = Object.freeze({ green: '#1c7547', red: '#b32034', blue: '#175dc4', gold: '#865818', purple: '#7924d7' });

	const COLOR_NAME_ALT = Object.keys(TEXT_COLOR_NAMES).join('|');
	const COLOR_VALUE = '(?:#[0-9a-f]{6}|' + COLOR_NAME_ALT + ')';

	// Ink (docs/markdown-standard.md, "Ink"; the design docs/briefs/ink.md): a pen stroke that stays with the words it
	// marks, a paired comment with the colour span's shape. The opener holds the stroke:
	//   <!--ink KIND [NUMBER] [COLOUR] [box=W,H] [at=X,Y] [PATH]-->words<!--/ink-->
	// KIND is the stroke's kind, decided once when it was lifted; COLOUR is exactly the colour span's value, red when
	// absent; box is the frame's size when the stroke was drawn and at the frame's offset from the words' box, both in
	// hundredths of an em; PATH is the stroke, its first point absolute in the frame and the rest as moves, hundredths of an
	// em. One spelling: the fields in this order, one space between, integers only. A comment that does not read this way
	// is ordinary comment text and marks nothing. Ink pairs do not nest in each other. Arrow/end alone take a pairing
	// number, an end takes no other data; under, strike and arrow may omit a path for a line derived from their words.
	const INK_KINDS = Object.freeze(['under', 'strike', 'ring', 'bracket', 'free', 'arrow', 'end']);

	const INK_PATH_MAX = 160;
	const INK_INT_MAX = 999999;
	const INK_INT = '-?\\d{1,6}';
	const INK_OPEN_BODY = '(' + INK_KINDS.join('|') + ')(?: ([1-9]\\d{0,5}))?(?: (' + COLOR_VALUE + '))?(?: box=(\\d{1,6}),(\\d{1,6}))?(?: at=(' + INK_INT + '),(' + INK_INT + '))?'
		+ '(?: (' + INK_INT + ',' + INK_INT + '(?: ' + INK_INT + ',' + INK_INT + ')*))?';
	const INK_OPEN_PATTERN = '<!--ink ' + INK_OPEN_BODY + '-->';

	// Relocated into the parse Worker by .toString() with parseInkOpen and isInkClose (engine.js _buildParseWorkerSource):
	// reads only its parameter and the planted INK_PATH_MAX, INK_INT_MAX and TEXT_COLOR_NAMES; parseInkOpen reads
	// INK_OPEN_PATTERN and this function; isInkClose reads INK_CLOSE.
	function readInkMatch(match) {
		const linked = match[1] === 'arrow' || match[1] === 'end';
		if (linked !== (match[2] != null) || (!linked && match[1] !== 'under' && match[1] !== 'strike' && match[8] == null)) return null;
		if (match[1] === 'end' && match.slice(3, 9).some(value => value != null)) return null;
		const moves = match[8] == null ? [] : match[8].split(' ').map(pair => pair.split(',').map(Number));
		if (moves.length > INK_PATH_MAX) return null;
		const path = moves.length ? [moves[0]] : [];
		for (let i = 1; i < moves.length; i++) {
			const point = [path[i - 1][0] + moves[i][0], path[i - 1][1] + moves[i][1]];
			if (Math.abs(point[0]) > INK_INT_MAX || Math.abs(point[1]) > INK_INT_MAX) return null;
			path.push(point);
		}
		const colour = match[3] || null;
		return Object.freeze({
			kind: match[1],
			...(linked ? { id: Number(match[2]) } : {}),
			hex: colour == null ? null : (colour.charCodeAt(0) === 0x23 ? colour : TEXT_COLOR_NAMES[colour]),
			box: match[4] == null ? null : [Number(match[4]), Number(match[5])],
			at: match[6] == null ? null : [Number(match[6]), Number(match[7])],
			path,
		});
	}

	function parseInkOpen(comment) {
		if (typeof comment !== 'string') return null;
		const match = new RegExp('^' + INK_OPEN_PATTERN + '$').exec(comment);
		return match && readInkMatch(match);
	}

	function parseInkBody(body) {
		return typeof body === 'string' ? parseInkOpen('<!--ink ' + body + '-->') : null;
	}
	return { TEXT_COLOR_NAMES, COLOR_NAME_ALT, COLOR_VALUE, INK_KINDS, INK_PATH_MAX, INK_INT_MAX, INK_OPEN_PATTERN, readInkMatch, parseInkOpen, parseInkBody };
};
const { TEXT_COLOR_NAMES, COLOR_NAME_ALT, COLOR_VALUE, INK_KINDS, INK_PATH_MAX, INK_INT_MAX, INK_OPEN_PATTERN, readInkMatch, parseInkOpen, parseInkBody } = inkReader();
export { readInkMatch, parseInkOpen, parseInkBody };

const TEXT_COLOR_HEX_TO_NAME = Object.freeze(
	Object.fromEntries(Object.entries(TEXT_COLOR_NAMES).map(([name, hex]) => [hex, name]))
);
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

export function pairColorMarkers(source) {
	return pairMarkers(source, 'color');
}

export function stripColorMarkers(text) {
	return String(text == null ? '' : text).replace(new RegExp('<!--(?:c ' + COLOR_VALUE + '|/c)-->', 'g'), '');
}

export function hasColorMarker(text) {
	return new RegExp('<!--(?:c ' + COLOR_VALUE + '|/c)-->').test(String(text == null ? '' : text));
}

const INK_CLOSE = '<!--/ink-->';
export { INK_KINDS, INK_CLOSE, INK_PATH_MAX, INK_INT_MAX, INK_OPEN_PATTERN };

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

// {kind, id?, hex?, box?, at?, path?} to the opener; the path's points are absolute in the frame and become moves after the
// first. Refuses with a TypeError rather than writing a spelling the reader would not read.
export function formatInkOpen(mark) {
	if (!mark || typeof mark !== 'object') throw new TypeError('ink: a mark is an object');
	if (!INK_KINDS.includes(mark.kind)) throw new TypeError('ink: the kind is one of ' + INK_KINDS.join(', '));
	const linked = mark.kind === 'arrow' || mark.kind === 'end';
	if (linked ? !Number.isInteger(mark.id) || mark.id <= 0 || mark.id > INK_INT_MAX : mark.id != null) throw new TypeError('ink: only an arrow or its end has a positive pairing number');
	const id = linked ? ' ' + mark.id : '';
	if (mark.kind === 'end') {
		if (mark.hex != null || mark.box != null || mark.at != null || (mark.path != null && (!Array.isArray(mark.path) || mark.path.length))) throw new TypeError('ink: an arrow end holds only its pairing number');
		return '<!--ink end' + id + '-->';
	}
	let colour = '';
	if (mark.hex != null) {
		const value = TEXT_COLOR_HEX_TO_NAME[mark.hex] || mark.hex;
		if (!new RegExp('^' + COLOR_VALUE + '$').test(value)) throw new TypeError('ink: the colour is the colour span\'s value');
		colour = ' ' + value;
	}
	const box = mark.box == null ? '' : ' box=' + inkPair(mark.box, 'box', true).join(',');
	const at = mark.at == null ? '' : ' at=' + inkPair(mark.at, 'at').join(',');
	const optionalPath = linked || mark.kind === 'under' || mark.kind === 'strike';
	const path = mark.path == null && optionalPath ? [] : mark.path;
	if (!Array.isArray(path) || (!path.length && !optionalPath) || path.length > INK_PATH_MAX) throw new TypeError('ink: the path holds 1 to ' + INK_PATH_MAX + ' points, or is absent on an arrow, underline or strike');
	const points = path.map(point => inkPair(point, 'path'));
	const moves = points.length ? [points[0].join(',')] : [];
	for (let i = 1; i < points.length; i++) moves.push([inkInt(points[i][0] - points[i - 1][0], 'path move'), inkInt(points[i][1] - points[i - 1][1], 'path move')].join(','));
	return '<!--ink ' + mark.kind + id + colour + box + at + (moves.length ? ' ' + moves.join(' ') : '') + '-->';
}

export function formatInkRun(mark, content) {
	return formatInkOpen(mark) + content + INK_CLOSE;
}

// Returns {mark, length in UTF-16 units} or null; not end-anchored.
export function matchInkOpen(text) {
	if (typeof text !== 'string') return null;
	const match = new RegExp('^' + INK_OPEN_PATTERN).exec(text);
	if (!match) return null;
	const mark = readInkMatch(match);
	return mark && { mark, length: match[0].length };
}

// The opener's body is what a rendered span carries (a renderer's sanitizer drops an attribute whose value holds the
// comment's own close): the opener after `<!--ink ` and before `-->`, so the attribute reads `under red box=… 0,95 …`,
// and only a body that reads as a mark goes back. Read and write through the same grammar, so an invalid body cannot
// invent a mark. Relocated into the parse Worker with the three above: reads INK_OPEN_PATTERN and readInkMatch alone.
export function inkOpenBody(opener) {
	if (typeof opener !== 'string') return null;
	const match = new RegExp('^' + INK_OPEN_PATTERN + '$').exec(opener);
	return match && readInkMatch(match) ? opener.slice(8, -3) : null;
}
export function formatInkOpenFromBody(body) {
	return parseInkBody(body) ? '<!--ink ' + body + '-->' : null;
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

// Ink nests so independent strokes can share the same words. A marker that pairs with nothing is text
// (it shows nothing and marks nothing) and is listed under strays.
export function pairInkMarkers(source, markers = null) {
	return pairMarkers(source, 'ink', markers);
}

// A document parser may supply its semantic markers, leaving literal code comments untouched.
// Local inline parsing and source planners need an endpoint's span even when its mate is in another block.
export function pairInkSpans(source, markers = null) {
	return pairSpanMarkers(source, 'ink', markers);
}

// Colour keeps its first opener; ink pairs each closer with the innermost opener. The shared range
// shape lets custody owners keep every independent stroke, including strokes on identical words.
export function pairMarkers(source, kind, markers = null) {
	const paired = pairSpanMarkers(source, kind, markers);
	if (kind !== 'ink') return paired;
	const groups = new Map();
	const groupFor = id => {
		if (!groups.has(id)) groups.set(id, { id, tail: null, head: null, count: 0 });
		return groups.get(id);
	};
	for (const run of paired.runs) if (run.mark.id != null) {
		const group = groupFor(run.mark.id);
		group.count++;
		group[run.mark.kind === 'arrow' ? 'tail' : 'head'] = run;
	}
	for (const marker of paired.strays) if (marker.mark?.id != null) groupFor(marker.mark.id).count++;
	const arrows = [...groups.values()].filter(group => group.count === 2 && group.tail && group.head)
		.map(({id, tail, head}) => ({id, tail, head}));
	const complete = new Set(arrows.map(arrow => arrow.id)), runs = [], strays = paired.strays.slice();
	for (const run of paired.runs) {
		if (run.mark.id == null || complete.has(run.mark.id)) { runs.push(run); continue; }
		strays.push({ start: run.start, end: run.innerStart, mark: run.mark, close: false },
			{ start: run.innerEnd, end: run.end, mark: null, close: true, arrowId: run.mark.id });
	}
	strays.sort((a, b) => a.start - b.start);
	return { runs, strays, arrows };
}

function pairSpanMarkers(source, kind, markers = null) {
	if (kind !== 'ink' && kind !== 'color') throw new TypeError('Unknown paired marker kind');
	const color = kind === 'color';
	const runs = [], strays = [], stack = [];
	for (const marker of markers || (color ? scanColorMarkers(source) : scanInkMarkers(source))) {
		if (color ? marker.hex !== null : !marker.close) {
			if (color && stack.length) { strays.push(marker); continue; }
			stack.push(marker);
			continue;
		}
		const open = stack.pop();
		if (!open) { strays.push(marker); continue; }
		runs.push({ start: open.start, end: marker.end, innerStart: open.end, innerEnd: marker.start,
			...(color ? { hex: open.hex } : { mark: open.mark }) });
	}
	strays.push(...stack);
	runs.sort((a, b) => a.start - b.start);
	strays.sort((a, b) => a.start - b.start);
	return { runs, strays };
}

// Copy carries an arrow only when both complete anchor words are selected. A partial selection removes just
// its endpoint comments from the copied slice, including a comment clipped at the selection's boundary.
export function sliceInkArrows(source, start = 0, end = String(source ?? '').length, markers = null) {
	const text = String(source ?? '');
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > text.length) throw new RangeError('ink: invalid source slice');
	const kept = new Set();
	for (const arrow of pairInkMarkers(text, markers).arrows) {
		if (![arrow.tail, arrow.head].every(run => run.innerStart >= start && run.innerEnd <= end && run.innerStart < run.innerEnd)) continue;
		kept.add(arrow.id);
		start = Math.min(start, arrow.tail.start, arrow.head.start);
		end = Math.max(end, arrow.tail.end, arrow.head.end);
	}
	const spans = pairInkSpans(text, markers), cuts = [];
	for (const run of spans.runs) if (run.mark.id != null && !kept.has(run.mark.id)) cuts.push(
		{ start: run.start, end: run.innerStart }, { start: run.innerEnd, end: run.end });
	for (const marker of spans.strays) if (marker.mark?.id != null) cuts.push(marker);
	let result = '', at = start;
	for (const cut of cuts.sort((a, b) => a.start - b.start)) {
		if (cut.end <= at || cut.start >= end) continue;
		result += text.slice(at, Math.max(at, cut.start));
		at = Math.min(end, cut.end);
	}
	return result + text.slice(at, end);
}

// The paste owns only its incoming markers: an orphan cannot adopt an existing document's endpoint, and a
// complete pair with an occupied number gets a new number in both openers without rewriting its stroke bytes.
export function prepareInkPaste(source, existing = '', markers = null) {
	const text = String(source ?? ''), paired = pairInkMarkers(text, markers), edits = [];
	for (const marker of paired.strays) if (marker.mark?.id != null || marker.arrowId != null) edits.push({ start: marker.start, end: marker.end, text: '' });
	const occupied = new Set(scanInkMarkers(existing).filter(marker => marker.mark?.id != null).map(marker => marker.mark.id));
	const reserved = new Set([...occupied, ...paired.arrows.map(arrow => arrow.id)]);
	let next = 1;
	for (const arrow of paired.arrows) {
		const runs = [arrow.tail, arrow.head];
		if (runs.some(run => run.innerStart === run.innerEnd)) {
			for (const run of runs) edits.push({ start: run.start, end: run.innerStart, text: '' }, { start: run.innerEnd, end: run.end, text: '' });
			continue;
		}
		if (!occupied.has(arrow.id)) continue;
		while (reserved.has(next) && next <= INK_INT_MAX) next++;
		if (next > INK_INT_MAX) throw new RangeError('ink: no unused arrow pairing number');
		reserved.add(next);
		for (const run of runs) {
			const prefix = '<!--ink ' + run.mark.kind + ' ';
			edits.push({ start: run.start + prefix.length, end: run.start + prefix.length + String(arrow.id).length, text: String(next) });
		}
	}
	let result = text;
	for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
	return result;
}

export function stripInkMarkers(text) {
	const source = String(text == null ? '' : text);
	let result = '', at = 0;
	for (const marker of scanInkMarkers(source)) { result += source.slice(at, marker.start); at = marker.end; }
	return result + source.slice(at);
}

export function hasInkMarker(text) {
	return scanInkMarkers(text).length > 0;
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
