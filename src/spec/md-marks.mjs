// SPDX-License-Identifier: MIT
// The one place these literal grammars are written (docs/markdown-standard.md, "Text colour", "Page break").

// The exported page retains this reader alone. The editor uses the same closure, then adds its writers and scans.
const inkReader = () => {
	// SPDX-License-Identifier: MIT
	const TEXT_COLOR_NAMES = Object.freeze({ green: '#1c7547', red: '#b32034', blue: '#175dc4', gold: '#865818', purple: '#7924d7' });

	const COLOR_NAME_ALT = Object.keys(TEXT_COLOR_NAMES).join('|');
	const COLOR_VALUE = '(?:#[0-9a-f]{6}|' + COLOR_NAME_ALT + ')';

	// Ink (docs/markdown-standard.md, "Ink"): a pen stroke that stays with the words it marks, a paired comment with the colour span's shape. The
	// opener holds the stroke:
	//   <!--ink KIND [NUMBER] [COLOUR] [w=N] [box=W,H] [at=X,Y] [PATH]-->words<!--/ink-->
	// KIND is the stroke's kind, decided once when it was lifted; COLOUR is exactly the colour span's value, red when absent; box is the frame's
	// size when the stroke was drawn and at the frame's offset from the words' box, both in hundredths of an em; w is the pen's width as Draw
	// counts a nib (2 to 24; 9 is the default and is never written): the stroke is drawn 0.11 em wide at 9 and in proportion to w otherwise; PATH
	// is the stroke, its first point absolute in the frame and the rest as moves, hundredths of an em. One spelling: the fields in this order,
	// one space between, integers only. A comment that does not read this way is ordinary comment text and marks nothing. Ink pairs do not nest
	// in each other. Arrow/end alone take a pairing number, an end takes no other data; under, strike and arrow may omit a path for a line
	// derived from their words.
	const INK_KINDS = Object.freeze(['under', 'strike', 'ring', 'bracket', 'free', 'arrow', 'end']);

	const INK_PATH_MAX = 160;
	const INK_INT_MAX = 999999;
	const INK_INT = '-?\\d{1,6}';
	const INK_OPEN_BODY = '(' + INK_KINDS.join('|') + ')(?: ([1-9]\\d{0,5}))?(?: (' + COLOR_VALUE + '))?(?: w=([1-9]\\d?))?(?: box=(\\d{1,6}),(\\d{1,6}))?(?: at=(' + INK_INT + '),(' + INK_INT + '))?'
		+ '(?: (' + INK_INT + ',' + INK_INT + '(?: ' + INK_INT + ',' + INK_INT + ')*))?';
	const INK_OPEN_PATTERN = '<!--ink ' + INK_OPEN_BODY + '-->';

	// Relocated into the parse Worker by .toString() with parseInkOpen and isInkClose (engine.js _buildParseWorkerSource):
	// reads only its parameter and the planted INK_PATH_MAX, INK_INT_MAX and TEXT_COLOR_NAMES; parseInkOpen reads
	// INK_OPEN_PATTERN and this function; isInkClose reads INK_CLOSE.
	function readInkMatch(match) {
		const linked = match[1] === 'arrow' || match[1] === 'end';
		if (linked !== (match[2] != null) || (!linked && match[1] !== 'under' && match[1] !== 'strike' && match[9] == null)) return null;
		if (match[1] === 'end' && match.slice(3, 10).some(value => value != null)) return null;
		const width = match[4] == null ? null : Number(match[4]);
		if (width != null && (width < 2 || width > 24 || width === 9)) return null;
		const moves = match[9] == null ? [] : match[9].split(' ').map(pair => pair.split(',').map(Number));
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
			...(width == null ? {} : { width }),
			box: match[5] == null ? null : [Number(match[5]), Number(match[6])],
			at: match[7] == null ? null : [Number(match[7]), Number(match[8])],
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

// {kind, id?, hex?, width?, box?, at?, path?} to the opener; the path's points are absolute in the frame and become moves after the
// first. Refuses with a TypeError rather than writing a spelling the reader would not read.
export function formatInkOpen(mark) {
	if (!mark || typeof mark !== 'object') throw new TypeError('ink: a mark is an object');
	if (!INK_KINDS.includes(mark.kind)) throw new TypeError('ink: the kind is one of ' + INK_KINDS.join(', '));
	const linked = mark.kind === 'arrow' || mark.kind === 'end';
	if (linked ? !Number.isInteger(mark.id) || mark.id <= 0 || mark.id > INK_INT_MAX : mark.id != null) throw new TypeError('ink: only an arrow or its end has a positive pairing number');
	const id = linked ? ' ' + mark.id : '';
	if (mark.kind === 'end') {
		if (mark.hex != null || mark.width != null || mark.box != null || mark.at != null || (mark.path != null && (!Array.isArray(mark.path) || mark.path.length))) throw new TypeError('ink: an arrow end holds only its pairing number');
		return '<!--ink end' + id + '-->';
	}
	let colour = '';
	if (mark.hex != null) {
		const value = TEXT_COLOR_HEX_TO_NAME[mark.hex] || mark.hex;
		if (!new RegExp('^' + COLOR_VALUE + '$').test(value)) throw new TypeError('ink: the colour is the colour span\'s value');
		colour = ' ' + value;
	}
	if (mark.width != null && (!Number.isInteger(mark.width) || mark.width < 2 || mark.width > 24)) throw new TypeError('ink: the width is an integer from 2 to 24, and 9 is spelled by leaving it out');
	const width = mark.width == null || mark.width === 9 ? '' : ' w=' + mark.width;
	const box = mark.box == null ? '' : ' box=' + inkPair(mark.box, 'box', true).join(',');
	const at = mark.at == null ? '' : ' at=' + inkPair(mark.at, 'at').join(',');
	const optionalPath = linked || mark.kind === 'under' || mark.kind === 'strike';
	const path = mark.path == null && optionalPath ? [] : mark.path;
	if (!Array.isArray(path) || (!path.length && !optionalPath) || path.length > INK_PATH_MAX) throw new TypeError('ink: the path holds 1 to ' + INK_PATH_MAX + ' points, or is absent on an arrow, underline or strike');
	const points = path.map(point => inkPair(point, 'path'));
	const moves = points.length ? [points[0].join(',')] : [];
	for (let i = 1; i < points.length; i++) moves.push([inkInt(points[i][0] - points[i - 1][0], 'path move'), inkInt(points[i][1] - points[i - 1][1], 'path move')].join(','));
	return '<!--ink ' + mark.kind + id + colour + width + box + at + (moves.length ? ' ' + moves.join(' ') : '') + '-->';
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

// Where a Will marker may stand (docs/will.md, Conversion). A pair inside a fence, a raw block
// (`<pre>`, `<div>`, a raw table cell) or the opening front matter is text: the line is quoted,
// and a Word or PDF writer that met it as a marker would govern the wrong region. The same frame
// as spec/frontmatter.mjs, copied here so this grammar stays inside the MIT kit's closure.
const WILL_BLOCK_TAGS = new Set('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul'.split(' '));
const WILL_VOID_TAGS = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));

function willLineAt(text, start) {
	let end = start;
	while (end < text.length && text.charCodeAt(end) !== 13 && text.charCodeAt(end) !== 10) end++;
	const eol = text.charCodeAt(end) === 13 && text.charCodeAt(end + 1) === 10 ? 2 : end < text.length ? 1 : 0;
	return {start, end, next: end + eol, text: text.slice(start, end)};
}

function willOpeningFrame(text) {
	const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0;
	const opening = willLineAt(text, bom);
	if (!/^--- *$/.test(opening.text) || opening.next === opening.end) return null;
	for (let at = opening.next; at < text.length;) {
		const line = willLineAt(text, at);
		if (/^(?:---|\.\.\.) *$/.test(line.text)) return {contentStart: opening.next, contentEnd: line.start, bodyStart: line.next};
		if (line.next <= at) break;
		at = line.next;
	}
	return null;
}

function willColumns(line) {
	let col = 0;
	for (let i = 0; i < line.length; i++) {
		const code = line.charCodeAt(i);
		if (code === 32) col++;
		else if (code === 9) col += 4 - (col % 4);
		else return {col, index: i};
	}
	return {col, index: line.length};
}

function willQuoteInner(line) {
	let i = 0, depth = 0;
	while (i < line.length) {
		let col = 0, j = i;
		while (j < line.length && col < 3) {
			const code = line.charCodeAt(j);
			if (code === 32) { col++; j++; }
			else if (code === 9) {
				const adv = 4 - (col % 4);
				if (col + adv > 3) break;
				col += adv; j++;
			} else break;
		}
		if (line.charCodeAt(j) !== 62) break;
		depth++;
		j++;
		if (line.charCodeAt(j) === 32 || line.charCodeAt(j) === 9) j++;
		i = j;
	}
	return depth ? line.slice(i) : null;
}

function willListItem(line) {
	const {col, index} = willColumns(line);
	if (col >= 4) return null;
	const rest = line.slice(index);
	const marked = /^([-*+]|\d{1,9}[.)])([ \t]*)/.exec(rest);
	if (!marked || (marked[2].length === 0 && index + marked[1].length < line.length)) return null;
	let content = col + marked[1].length, padding = 0;
	for (const ch of marked[2]) {
		if (padding >= 4) break;
		if (ch === ' ') { content++; padding++; }
		else { const adv = 4 - (content % 4); content += adv; padding += adv; }
	}
	if (marked[2].length === 0) content++;
	return {content};
}

function willFenceOpen(line) {
	const {col, index} = willColumns(line);
	if (col >= 4) return null;
	const match = /^(`{3,}|~{3,})(.*)$/.exec(line.slice(index));
	if (!match || (match[1].charCodeAt(0) === 96 && match[2].includes('`'))) return null;
	return {ch: match[1][0], len: match[1].length};
}

function willFenceCloses(line, fence) {
	const raw = fence.inQuote ? willQuoteInner(line) : line;
	if (raw == null) return false;
	const {col, index} = willColumns(raw);
	if (col >= 4) return false;
	const rest = raw.slice(index);
	let i = 0;
	while (i < rest.length && rest[i] === fence.ch) i++;
	if (i < fence.len) return false;
	for (let k = i; k < rest.length; k++) if (rest.charCodeAt(k) !== 32 && rest.charCodeAt(k) !== 9) return false;
	return true;
}

function willUpdateTags(item, line) {
	const re = /<!--[\s\S]*?-->|<\/?([A-Za-z][A-Za-z0-9]*)\b[^>]*?>/g;
	let match;
	while ((match = re.exec(line))) {
		if (match[0].charCodeAt(1) === 33) continue;
		const name = match[1].toLowerCase();
		const close = match[0].charCodeAt(1) === 47;
		if (WILL_VOID_TAGS.has(name) || /\/\s*>$/.test(match[0])) continue;
		if (close) {
			const at = item.tags.lastIndexOf(name);
			if (at >= 0) item.tags.splice(at, 1);
		} else item.tags.push(name);
	}
}

function willHtmlOpen(line) {
	const {col, index} = willColumns(line);
	if (col >= 4) return null;
	const rest = line.slice(index);
	const leaf = /^<(pre|script|style|textarea)(?:[ \t]|\/?>|$)/i.exec(rest);
	if (leaf) return {kind: leaf[1].toLowerCase() === 'pre' ? 'pre' : 'raw', tag: leaf[1].toLowerCase()};
	const block = /^<\/?([A-Za-z][A-Za-z0-9]*)(?:[ \t]|\/?>|$)/.exec(rest);
	if (!block || !WILL_BLOCK_TAGS.has(block[1].toLowerCase())) return null;
	const item = {kind: 'html', tags: []};
	willUpdateTags(item, rest);
	return item;
}

function willRawCloses(item, line) {
	const close = new RegExp('</' + item.tag + '(?:[\\t\\n\\f />]|$)', 'i');
	return close.test(line);
}

function willQuotedWhere(stack) {
	for (let i = stack.length - 1; i >= 0; i--) {
		const item = stack[i];
		if (item.kind === 'fence') return 'fence';
		if (item.kind === 'pre') return 'raw-pre';
		if (item.kind === 'html') {
			if (item.tags.includes('pre')) return 'raw-pre';
			if (item.tags.includes('td') || item.tags.includes('th')) return 'raw-table';
			if (item.tags.includes('div')) return 'raw-div';
			return null;
		}
	}
	return null;
}

function willLeaf(stack) {
	const kind = stack[stack.length - 1]?.kind;
	return kind === 'fence' || kind === 'pre' || kind === 'html' || kind === 'raw';
}

// `spans` are [start, end) of marker lines in `source` (the Will reader's own offsets).
// Returns the first quoted span, {start, end, where}, or null when every span may stand.
// `where` is `fence`, `raw-pre`, `raw-div`, `raw-table` or `frontmatter`.
export function quotedWillSpan(source, spans) {
	const text = String(source ?? '');
	const marks = Array.isArray(spans) ? spans : [];
	if (!marks.length) return null;
	const places = new Map();
	const frame = willOpeningFrame(text);
	if (frame) {
		for (const span of marks) {
			const start = span[0];
			if (start >= frame.contentStart && start < frame.contentEnd) places.set(start, 'frontmatter');
		}
	}
	const stack = [];
	for (let pos = frame ? frame.bodyStart : text.charCodeAt(0) === 0xfeff ? 1 : 0; pos < text.length;) {
		const line = willLineAt(text, pos);
		const blank = /^[ \t]*$/.test(line.text);
		let closedHere = false;
		while (stack.length) {
			const top = stack[stack.length - 1];
			if (top.kind === 'html' && blank) { stack.pop(); continue; }
			if (top.kind === 'fence' && willFenceCloses(line.text, top)) { stack.pop(); closedHere = true; continue; }
			break;
		}
		let cut = -1;
		for (let i = 0; i < stack.length; i++) {
			const item = stack[i];
			if (item.kind === 'list' && !blank && willColumns(line.text).col < item.content && !willListItem(line.text)) { cut = i; break; }
			if (item.kind === 'quote' && !blank && willQuoteInner(line.text) == null) { cut = i; break; }
		}
		if (cut >= 0) stack.length = cut;
		if (!places.has(line.start)) {
			const where = willQuotedWhere(stack);
			if (where) places.set(line.start, where);
		}
		const top = stack[stack.length - 1];
		if (top?.kind === 'pre' && willRawCloses({tag: 'pre'}, line.text)) stack.pop();
		else if (top?.kind === 'raw' && willRawCloses(top, line.text)) stack.pop();
		else if (top?.kind === 'html' && !blank) willUpdateTags(top, line.text);
		else if (!closedHere && !willLeaf(stack) && !blank) {
			const inner = willQuoteInner(line.text);
			const body = inner == null ? line.text : inner;
			const inQuote = inner != null;
			if (inQuote && stack[stack.length - 1]?.kind !== 'quote') stack.push({kind: 'quote'});
			const fence = willFenceOpen(body);
			if (fence) stack.push({kind: 'fence', ...fence, inQuote});
			else {
				const html = willHtmlOpen(body);
				if (html) stack.push({...html, inQuote});
				else if (!inQuote) {
					const item = willListItem(line.text);
					if (item && stack[stack.length - 1]?.kind !== 'list') stack.push({kind: 'list', content: item.content});
					else if (item && stack[stack.length - 1]?.kind === 'list' && item.content > stack[stack.length - 1].content) stack.push({kind: 'list', content: item.content});
				}
			}
		}
		if (line.next <= pos) break;
		pos = line.next;
	}
	for (const span of marks) {
		const where = places.get(span[0]);
		if (where) return {start: span[0], end: span[1], where};
	}
	return null;
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
