// SPDX-License-Identifier: AGPL-3.0-only
import {splitOpeningFrontmatter as _rapierSplitOpeningFrontmatter, pairMarkers as _rapierPairMarkers, RAPIER_HIGHLIGHT_COLORS} from '../agent/markdown-spec.mjs';
import {markdownTableSources} from '../spec/md-source.mjs';
function _rapierHiddenSourceRanges(sourceText, parser = null) {
	const source = String(sourceText == null ? '' : sourceText);
	const ranges = [];
	if (!parser) throw new Error('Visible replacement requires the document parser');
	const environment = {};
	const lines = [0];
	for (const row of source.matchAll(/\r\n?|\n/g)) lines.push(row.index + row[0].length);
	const {tokens, cells} = markdownTableSources(source, parser, environment, lines);
	const lineAt = line => lines[line] ?? source.length;
	const push = (start, end, kind) => { if (end > start) ranges.push({ start, end, kind }); };
	const front = _rapierSplitOpeningFrontmatter(source);
	if (front.bodyOffset) push(0, front.bodyOffset, 'frontmatter');
	const code = [];
	let m;
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
	const inline = _rapierInlineSourceRanges(source, parser, environment, tokens, lines, cells);
	for (const range of inline) {
		if (range.kind === 'literal') code.push([range.start, range.end]);
		else push(range.start, range.end, range.kind);
	}
	const inCode = at => code.some(([a, b]) => at >= a && at < b);
	const comment = /<!--[\s\S]*?(?:-->|(?![\s\S]))/g;
	while ((m = comment.exec(source)) !== null) if (!inCode(m.index)) push(m.index, m.index + m[0].length, 'comment');
	const definition = /^[ \t]{0,3}\[[^\]\n]+\]:[^\n]*(?:\r?\n[ \t]+\S[^\n]*)*/gm;
	while ((m = definition.exec(source)) !== null) if (!inCode(m.index)) push(m.index, m.index + m[0].length, 'definition');
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

function _rapierInlineSourceRanges(source, parser, environment, tokens, lineStarts, cells) {
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
	const ranges = [], jobs = [], fallbackLines = new Set();
	for (const token of tokens) {
		if (token.type !== 'inline' || !token.content) continue;
		if (!token.map) {
			if (cells?.has(token)) jobs.push({content: token.content, rawOffset: cells.get(token)});
			continue;
		}
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
		else for (let line = token.map[0]; line < token.map[1]; line++) fallbackLines.add(line);
	}
	for (const line of fallbackLines) {
		const start = lineStarts[line], end = lineStarts[line + 1] ?? source.length;
		jobs.push({ content: source.slice(start, end).replace(/\r?\n$/, ''), offsets: [start], localStarts: [0] });
	}
	for (const job of jobs) {
		records = [];
		inline.parse(job.content, owner, { ...environment }, []);
		const rawOffset = job.rawOffset || (pos => {
			let row = job.localStarts.length - 1;
			while (row > 0 && (row >= job.offsets.length || job.localStarts[row] > pos)) row--;
			return job.offsets[row] + pos - job.localStarts[row];
		});
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
		if (parser.options.linkify) for (const link of parser.linkify.match(job.content) || []) {
			if (!parser.validateLink(link.url) || records.some(record => link.index < record.end && link.lastIndex > record.start &&
				record.tokens.some(token => /^(?:code_inline|image|link_open)$/.test(token.type)))) continue;
			ranges.push({ start: rawOffset(link.index), end: rawOffset(link.lastIndex), kind: 'destination' });
		}
	}
	return ranges;
}

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

const _RAPIER_FIND_MATCH_LIMIT = 2048;

function _rapierFindPatternHits(text, pattern, limit, hidden = null) {
	const hits = [];
	let match, cursor = 0, characters = null;
	const whole = at => at <= 0 || at >= text.length || text.charCodeAt(at) < 0x80 && text.charCodeAt(at - 1) < 0x80
		|| (characters ||= new Intl.Segmenter(undefined, { granularity: 'grapheme' })).segment(text.slice(Math.max(0, at - 64), at + 64)).containing(Math.min(at, 64)).index === Math.min(at, 64);
	while (hits.length <= limit && (match = pattern.exec(text)) !== null) {
		const length = String(match[0] || '').length;
		if (!length) { pattern.lastIndex++; continue; }
		if (!whole(match.index) || !whole(match.index + length)) continue;
		if (hidden) {
			while (cursor < hidden.length && hidden[cursor].end <= match.index) cursor++;
			if (cursor < hidden.length && hidden[cursor].start < match.index + length) {
				pattern.lastIndex = Math.max(pattern.lastIndex, hidden[cursor].end);
				continue;
			}
		}
		hits.push({ start: match.index, end: match.index + length });
	}
	const overflow = hits.length > limit;
	if (overflow) hits.length = limit;
	return { hits, overflow };
}

function _rapierFindLiteralHits(textValue, queryValue, limit = _RAPIER_FIND_MATCH_LIMIT, hidden = null) {
	const text = String(textValue == null ? '' : textValue);
	const query = String(queryValue == null ? '' : queryValue);
	if (!query) return { hits: [], overflow: false };
	let pattern;
	try { pattern = new RegExp(_rapierEscapeRegExp(query), 'giu'); }
	catch (_) { pattern = new RegExp(_rapierEscapeRegExp(query), 'gi'); }
	return _rapierFindPatternHits(text, pattern, limit, hidden);
}

function _rapierFindFlexibleSeparatorHits(textValue, queryValue, limit = _RAPIER_FIND_MATCH_LIMIT, hidden = null) {
	const exact = _rapierFindLiteralHits(textValue, queryValue, limit, hidden);
	if (exact.hits.length || exact.overflow) return { ...exact, flexible: false };
	const query = String(queryValue == null ? '' : queryValue).trim();
	const separatorSource = String.raw`[\t \u00a0_.:/\\\-\u2010-\u2015]+`;
	const parts = query.split(new RegExp(separatorSource, 'u')).filter(Boolean);
	if (parts.length < 2) return { ...exact, flexible: false };
	const source = parts.map(_rapierEscapeRegExp).join(separatorSource);
	let pattern;
	try { pattern = new RegExp(source, 'giu'); }
	catch (_) { pattern = new RegExp(source, 'gi'); }
	const text = String(textValue == null ? '' : textValue);
	const { hits, overflow } = _rapierFindPatternHits(text, pattern, limit, hidden);
	return { hits, overflow, flexible: hits.length > 0 };
}

function _rapierEscapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _rapierHiddenMarkPairs(source, hidden) {
	const comments = new Map();
	for (const range of hidden) if (range.kind === 'comment') comments.set(range.start, range.end);
	return _rapierPairMarkers(source, 'ink').runs.filter(pair =>
		comments.get(pair.start) === pair.innerStart && comments.get(pair.innerEnd) === pair.end)
		.sort((a, b) => a.start - b.start);
}

function _rapierPairMarks(pairs) {
	const marks = [];
	for (const pair of pairs) marks.push({ start: pair.start, end: pair.innerStart, pair, opener: true },
		{ start: pair.innerEnd, end: pair.end, pair, opener: false });
	return marks.sort((a, b) => a.start - b.start);
}

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

function _rapierPairSplices(source, accepted, replacement, pairs) {
	const marks = _rapierPairMarks(pairs), gone = new Set();
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

function _rapierVisibleSourceProjection(sourceText, parser, prior = null) {
	const source = String(sourceText == null ? '' : sourceText);
	if (prior && prior.source === source && prior.parser === parser) return prior;
	const hidden = _rapierHiddenSourceRanges(source, parser);
	return { source, parser, hidden, read: _rapierVisibleMarkText(source, hidden) };
}

function _rapierPlanVisibleReplacement(sourceText, matches, replacement, markdown = true, parser = null, projection = null) {
	const source = String(sourceText == null ? '' : sourceText);
	const hidden = markdown ? (projection && projection.source === source && projection.parser === parser
		? projection.hidden : _rapierHiddenSourceRanges(source, parser)) : [];
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

export { _rapierHiddenSourceRanges, _rapierInlineSourceRanges, _rapierVisibleHits, _RAPIER_FIND_MATCH_LIMIT, _rapierFindPatternHits,
	_rapierFindLiteralHits, _rapierFindFlexibleSeparatorHits, _rapierEscapeRegExp, _rapierHiddenMarkPairs,
	_rapierPairMarks, _rapierVisibleMarkText, _rapierVisibleSourceProjection, _rapierPairSplices, _rapierPlanVisibleReplacement };
