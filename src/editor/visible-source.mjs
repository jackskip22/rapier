// SPDX-License-Identifier: AGPL-3.0-only
import {splitOpeningFrontmatter as _rapierSplitOpeningFrontmatter, pairMarkers as _rapierPairMarkers, RAPIER_HIGHLIGHT_COLORS} from '../agent/markdown-spec.mjs';
// What a person does not see. Find and Replace All work on the words on screen (docs/open-work.md,
// section 3 item 1; survey-writing.md G1, D1, D2; R85b: no path that means keep may destroy): the Markdown
// that carries a document's hidden parts is never a place a replacement lands and never counts as a hit.
// Hidden: the front matter; a reference definition line (a picture's data lives there); an HTML comment
// (a Will's markers, the colour and layout comments); an HTML tag, never an autolink; a link's or a
// picture's destination and title; a reference label; a picture's alt. Code shows exactly what it holds,
// so only their delimiters and fence info are hidden. The live Markdown parser owns block and
// inline-mark boundaries; this satellite observes its rules without changing the parser. The two
// comments of colour and ink pairs are hidden and are the one exception: they stand between the words of a mark
// and are no character of them, so a hit may run across one (docs/briefs/ink.md, section 1).
function _rapierHiddenSourceRanges(sourceText, parser = null) {
	const source = String(sourceText == null ? '' : sourceText);
	const ranges = [];
	if (!parser) throw new Error('Visible replacement requires the document parser');
	const environment = {}, tokens = parser.parse(source, environment);
	const lines = [0];
	for (const row of source.matchAll(/\r\n?|\n/g)) lines.push(row.index + row[0].length);
	const lineAt = line => lines[line] ?? source.length;
	const push = (start, end, kind) => { if (end > start) ranges.push({ start, end, kind }); };
	// The standard's framing owner includes a BOM and every admitted line ending.
	const front = _rapierSplitOpeningFrontmatter(source);
	if (front.bodyOffset) push(0, front.bodyOffset, 'frontmatter');
	// Fenced code and code spans: shown as written, so no rule below starts inside one.
	const code = [];
	let m;
	// The grammar owner supplies source lines, including list/quote-contained fences and CRLF.
	for (const token of tokens) {
		if (!token.map) continue;
		const start = lineAt(token.map[0]), end = lineAt(token.map[1]);
		if (token.type === 'reference_definition') push(start, end, 'definition');
		if (token.type !== 'fence' && token.type !== 'code_block') continue;
		code.push([start, end]);
		if (token.type === 'fence') {
			push(start, lineAt(token.map[0] + 1), 'fence');
			const last = lineAt(token.map[1] - 1);
			const closing = source.slice(last, end).trim().replace(/^(?:>\s*)+/, '');
			if (last > start && new RegExp('^' + token.markup[0] + '{' + token.markup.length + ',}\\s*$').test(closing)) push(last, end, 'fence');
		}
	}
	const inline = _rapierInlineSourceRanges(source, parser, environment, tokens, lines);
	for (const range of inline) {
		if (range.kind === 'literal') code.push([range.start, range.end]);
		else push(range.start, range.end, range.kind);
	}
	const inCode = at => code.some(([a, b]) => at >= a && at < b);
	// HTML comments, to their close or the end of the text.
	const comment = /<!--[\s\S]*?(?:-->|(?![\s\S]))/g;
	while ((m = comment.exec(source)) !== null) if (!inCode(m.index)) push(m.index, m.index + m[0].length, 'comment');
	// Reference definitions: the whole line, label, destination and title (a picture's base64 among them).
	const definition = /^[ \t]{0,3}\[[^\]\n]+\]:[^\n]*(?:\r?\n[ \t]+\S[^\n]*)*/gm;
	while ((m = definition.exec(source)) !== null) if (!inCode(m.index)) push(m.index, m.index + m[0].length, 'definition');
	// HTML tags (an autolink <https://…> or <me@here> has no tag name before its first : or @, so it is not one).
	const tag = /<\/?[A-Za-z][A-Za-z0-9-]*(?:[ \t\n][^<>]*)?\/?>/g;
	while ((m = tag.exec(source)) !== null) if (!inCode(m.index)) push(m.index, m.index + m[0].length, 'tag');
	const data = /\bdata:[^\s<>"']+/gi;
	while ((m = data.exec(source)) !== null) if (!inCode(m.index)) push(m.index, m.index + m[0].length, 'data');
	ranges.sort((a, b) => a.start - b.start || b.end - a.end);
	const merged = [];
	for (const range of ranges) {
		const last = merged[merged.length - 1];
		if (last && range.start < last.end) { if (range.end > last.end) last.end = range.end; continue; }
		merged.push({ start: range.start, end: range.end, kind: range.kind });
	}
	return merged;
}

// Observe a parser view, never replace a rule on the live parser. Rule calls retain the token
// objects that the shared delimiter pass turns into marks; source positions remain UTF-16.
function _rapierInlineSourceRanges(source, parser, environment, tokens, lineStarts) {
	if (!parser) throw new Error('Visible replacement requires the document parser');
	const owner = Object.create(parser), inline = Object.create(parser.inline), ruler = Object.create(parser.inline.ruler);
	owner.inline = inline; inline.ruler = ruler;
	let records = [], depth = 0;
	inline.parse = function (...args) {
		depth++;
		try { return parser.inline.parse.apply(this, args); } finally { depth--; }
	};
	ruler.getRules = chain => parser.inline.ruler.getRules(chain).map(rule => (state, silent) => {
		const start = state.pos, first = state.tokens.length;
		const matched = rule(state, silent);
		if (matched && !silent && depth === 1) records.push({ start, end: state.pos, tokens: state.tokens.slice(first) });
		return matched;
	});
	const ranges = [], jobs = [], tableLines = new Set();
	for (const token of tokens) {
		if (token.type === 'tr_open' && token.map) tableLines.add(token.map[0]);
		if (token.type !== 'inline' || !token.map || !token.content) continue;
		const rawLines = token.content.split('\n'), offsets = [], localStarts = [0];
		let valid = true;
		for (let i = 0; i < rawLines.length; i++) {
			const start = lineStarts[token.map[0] + i] ?? source.length;
			const end = lineStarts[token.map[0] + i + 1] ?? source.length;
			const at = source.slice(start, end).indexOf(rawLines[i]);
			if (at < 0) { valid = false; break; }
			offsets.push(start + at);
			localStarts.push(localStarts[i] + rawLines[i].length + 1);
		}
		if (valid) jobs.push({ content: token.content, offsets, localStarts });
		else for (let line = token.map[0]; line < token.map[1]; line++) tableLines.add(line);
	}
	// Table inline tokens have no source map; their complete row has exact source spelling,
	// so the same inline grammar can locate the marks without reconstructing its cells.
	for (const line of tableLines) {
		const start = lineStarts[line], end = lineStarts[line + 1] ?? source.length;
		jobs.push({ content: source.slice(start, end).replace(/\r?\n$/, ''), offsets: [start], localStarts: [0] });
	}
	for (const job of jobs) {
		records = [];
		inline.parse(job.content, owner, { ...environment }, []);
		const rawOffset = pos => {
			let row = job.localStarts.length - 1;
			while (row > 0 && (row >= job.offsets.length || job.localStarts[row] > pos)) row--;
			return job.offsets[row] + pos - job.localStarts[row];
		};
		for (const record of records) {
			const add = (a, b, kind) => { if (b > a) ranges.push({ start: rawOffset(a), end: rawOffset(b), kind }); };
			const emitted = record.tokens;
			if (emitted.some(token => token.type === 'image')) { add(record.start, record.end, 'alt'); continue; }
			const code = emitted.find(token => token.type === 'code_inline');
			if (code) {
				add(record.start, record.end, 'literal');
				add(record.start, record.start + code.markup.length, 'code');
				add(record.end - code.markup.length, record.end, 'code');
				continue;
			}
			if (emitted.some(token => token.type === 'link_open')) {
				if (job.content[record.start] !== '[') {
					const at = emitted.findIndex(token => token.type === 'link_open');
					const label = emitted.slice(at + 1).find(token => token.type === 'text')?.content || '';
					const from = record.end - label.length;
					add(from >= 0 && job.content.slice(from, record.end) === label ? Math.min(from, record.start) : record.start, record.end, 'destination');
					continue;
				}
				const state = new parser.inline.State(job.content, parser, environment, []);
				const labelEnd = parser.helpers.parseLinkLabel(state, record.start, false);
				const tail = job.content.slice(labelEnd + 1, record.end);
				if (!tail || tail === '[]') add(record.start, record.end, 'label');
				else {
					add(record.start, record.start + 1, 'mark');
					add(labelEnd, labelEnd + 1, 'mark');
					add(labelEnd + 1, record.end, tail[0] === '(' ? 'destination' : 'label');
				}
				continue;
			}
			const marks = emitted.filter(token => /^(?:em|strong|s|ins|mark|sub|sup)_(?:open|close)$/.test(token.type));
			if (!marks.length) continue;
			if (marks.some(token => token.type === 'mark_open')) {
				const colour = Object.values(RAPIER_HIGHLIGHT_COLORS).find(marker => job.content.startsWith(marker, record.end));
				if (colour) add(record.end, record.end + colour.length, 'mark');
			}
			if (marks.some(token => token.nesting === 1) && marks.some(token => token.nesting === -1)) {
				add(record.start, record.start + marks[0].markup.length, 'mark');
				add(record.end - marks.at(-1).markup.length, record.end, 'mark');
			} else add(record.start, record.end, 'mark');
		}
		// Core linkification also recognises www/mail forms that do not invoke the colon rule.
		// Ask its own matcher, excluding code and explicit links already owned above.
		if (parser.options.linkify) for (const link of parser.linkify.match(job.content) || []) {
			if (!parser.validateLink(link.url) || records.some(record => link.index < record.end && link.lastIndex > record.start &&
				record.tokens.some(token => /^(?:code_inline|image|link_open)$/.test(token.type)))) continue;
			ranges.push({ start: rawOffset(link.index), end: rawOffset(link.lastIndex), kind: 'destination' });
		}
	}
	return ranges;
}

// The hits that stand wholly in what the person sees: a hit touching a hidden range is dropped.
function _rapierVisibleHits(hits, hidden) {
	const list = Array.isArray(hits) ? hits : [];
	const ranges = Array.isArray(hidden) ? hidden : [];
	if (!ranges.length) return list;
	let cursor = 0;
	return list.filter(hit => {
		while (cursor < ranges.length && ranges[cursor].end <= hit.start) cursor++;
		return !(cursor < ranges.length && ranges[cursor].start < hit.end);
	});
}

// The colour and ink pairs whose two comments the page hides: the shared grammar pairs each kind, and both must be
// hidden comments here (a marker in code is literal there, and one inside a wider hidden range is not a comment of its own).
function _rapierHiddenMarkPairs(source, hidden) {
	const comments = new Map();
	for (const range of hidden) if (range.kind === 'comment') comments.set(range.start, range.end);
	return ['ink', 'color'].flatMap(kind => _rapierPairMarkers(source, kind).runs).filter(pair =>
		comments.get(pair.start) === pair.innerStart && comments.get(pair.innerEnd) === pair.end)
		.sort((a, b) => a.start - b.start);
}

// Every marker of the pairs in source order, each with its pair.
function _rapierPairMarks(pairs) {
	const marks = [];
	for (const pair of pairs) marks.push({ start: pair.start, end: pair.innerStart, pair, opener: true },
		{ start: pair.innerEnd, end: pair.end, pair, opener: false });
	return marks.sort((a, b) => a.start - b.start);
}

// The source as it is read: without the markers of its colour and ink pairs, with the hidden ranges that remain and the way back for
// a hit found in it. A hit comes back in the source's own offsets, from its first character to the end of its last, so a
// marker between them lies inside it and one at an edge does not. Null when no pair is hidden, and then a document's
// Find and Replace All read the source as they always did.
function _rapierVisibleMarkText(source, hidden) {
	const pairs = _rapierHiddenMarkPairs(source, hidden);
	if (!pairs.length) return null;
	const marks = _rapierPairMarks(pairs), cuts = [], starts = new Set(marks.map(mark => mark.start));
	let text = '', at = 0, total = 0;
	for (const { start, end } of marks) {
		text += source.slice(at, start); at = end; total += end - start;
		cuts.push({ end, shown: text.length, total });
	}
	text += source.slice(at);
	const back = shown => {
		let low = 0, high = cuts.length;
		while (low < high) { const mid = (low + high) >> 1; if (cuts[mid].shown <= shown) low = mid + 1; else high = mid; }
		return shown + (low ? cuts[low - 1].total : 0);
	};
	const rest = [];
	let seen = 0;
	for (const range of hidden) {
		if (range.kind === 'comment' && starts.has(range.start)) continue;
		while (seen < cuts.length && cuts[seen].end <= range.start) seen++;
		const cut = seen ? cuts[seen - 1].total : 0;
		rest.push({ start: range.start - cut, end: range.end - cut, kind: range.kind });
	}
	return { text, hidden: rest, hit: hit => ({ start: back(hit.start), end: back(hit.end - 1) + 1, shown: text.slice(hit.start, hit.end) }) };
}

// The splices of a replacement across paired marks, one for each hit. A marker between a hit's words stays, in its order, after
// the replacement, which is the mark of the hit's first character. A pair whose words all go with no replacement among them
// goes with them, and so does the marker that stands at the edge of the hit that took the last of them. A pair that was
// empty before is no replacement's to clear.
function _rapierPairSplices(source, accepted, replacement, pairs) {
	const marks = _rapierPairMarks(pairs), gone = new Set();
	// Other paired comments are no words of an enclosing pair. Cover the original inner
	// range with hits and paired markers, then retire every pair whose last words went.
	const coverage = [...accepted.map(({ match }) => ({ ...match, hit: true })), ...marks]
		.sort((a, b) => a.start - b.start || b.end - a.end);
	let first = 0;
	for (const pair of pairs) {
		if (pair.innerEnd === pair.innerStart) continue;
		while (first < coverage.length && coverage[first].end <= pair.innerStart) first++;
		let reach = pair.innerStart, lands = false, touched = false;
		for (let next = first; next < coverage.length; next++) {
			const span = coverage[next];
			if (span.end <= pair.innerStart) continue;
			if (span.start >= pair.innerEnd || span.start > reach) break;
			if (span.hit) {
				touched = true;
				if (replacement && span.start >= pair.innerStart) lands = true;
			}
			reach = Math.max(reach, span.end);
			if (reach >= pair.innerEnd) break;
		}
		if (touched && reach >= pair.innerEnd && !lands) gone.add(pair);
	}
	const byStart = new Map(marks.map(mark => [mark.start, mark])), byEnd = new Map(marks.map(mark => [mark.end, mark]));
	let from = 0;
	return accepted.map(({ match }) => {
		let start = match.start, end = match.end, kept = '';
		let edge;
		while ((edge = byEnd.get(start)) && edge.opener && gone.has(edge.pair)) start = edge.start;
		while ((edge = byStart.get(end)) && !edge.opener && gone.has(edge.pair)) end = edge.end;
		while (from < marks.length && marks[from].start < match.start) from++;
		for (let next = from; next < marks.length && marks[next].end <= match.end; next++) {
			if (!gone.has(marks[next].pair)) kept += source.slice(marks[next].start, marks[next].end);
		}
		return { pos: start, removed: source.slice(start, end), inserted: replacement + kept };
	});
}

// Plan before touching the canonical source. Original match identity and one-word reasons let
// callers explain a refusal without keeping another source or silently re-targeting a stale match.
function _rapierPlanVisibleReplacement(sourceText, matches, replacement, markdown = true, parser = null) {
	const source = String(sourceText == null ? '' : sourceText);
	const hidden = markdown ? _rapierHiddenSourceRanges(source, parser) : [];
	const pairs = markdown ? _rapierHiddenMarkPairs(source, hidden) : [];
	const markers = new Map(_rapierPairMarks(pairs).map(mark => [mark.start, mark]));
	const accepted = [], refused = [];
	const ordered = (Array.isArray(matches) ? matches : []).map((match, index) => ({ match, index }))
		.sort((a, b) => a.match.start - b.match.start || a.match.end - b.match.end);
	let end = 0, cursor = 0;
	for (const { match, index } of ordered) {
		let reason = '';
		if (!Number.isSafeInteger(match.start) || !Number.isSafeInteger(match.end) ||
				match.start < 0 || match.end <= match.start || match.end > source.length) reason = 'range';
		else if (match.start < end) reason = 'overlap';
		else {
			while (cursor < hidden.length && hidden[cursor].end <= match.start) cursor++;
			// A paired marker between the hit's characters is none of them; at either edge it is hidden, as every comment is.
			for (let next = cursor; next < hidden.length && hidden[next].start < match.end; next++) {
				const range = hidden[next], marker = markers.get(range.start);
				if (marker && marker.end === range.end && range.start > match.start && range.end < match.end) continue;
				reason = range.kind;
				break;
			}
		}
		if (reason) { refused.push({ match, index, reason }); continue; }
		accepted.push({ match, index });
		end = match.end;
	}
	const inserted = String(replacement);
	const splices = pairs.length ? _rapierPairSplices(source, accepted, inserted, pairs)
		: accepted.map(({ match }) => ({ pos: match.start, removed: source.slice(match.start, match.end), inserted }));
	return { splices, refused };
}

export { _rapierHiddenSourceRanges, _rapierVisibleHits, _rapierPlanVisibleReplacement, _rapierVisibleMarkText };
