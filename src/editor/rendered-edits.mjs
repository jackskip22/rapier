// SPDX-License-Identifier: AGPL-3.0-only
import {diff} from '../packages/rapier-diff/index.mjs';

const _RAPIER_RENDERED_SPAN_LIMIT = 16;

const _RAPIER_RENDERED_DIFF_TOKEN_LIMIT = 4096;
const _RAPIER_RENDERED_DIFF_WORK_LIMIT = 65536;
const _RAPIER_RENDERED_DIFF_DISTANCE_LIMIT = 64;
const _RAPIER_RENDERED_DIFF_TOKEN = /\s+|\S+/g;

function _rapierCommonEdges(before, after) {
	const limit = Math.min(before.length, after.length);
	let head = 0;
	while (head < limit && before.charCodeAt(head) === after.charCodeAt(head)) head += 1;
	let tail = 0;
	while (tail < limit - head &&
			before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail += 1;
	return { head, tail };
}

function _rapierRenderedDiffTokens(text) {
	const parts = text.match(_RAPIER_RENDERED_DIFF_TOKEN) || [];
	if (parts.length > _RAPIER_RENDERED_DIFF_TOKEN_LIMIT) return null;
	const starts = [0];
	for (const part of parts) starts.push(starts[starts.length - 1] + part.length);
	return {parts, starts};
}

function _rapierRenderedDiffSpans(beforeMid, afterMid) {
	const before = _rapierRenderedDiffTokens(beforeMid), after = before && _rapierRenderedDiffTokens(afterMid);
	if (!before || !after) return null;
	const maximum = Math.max(2, Math.min(_RAPIER_RENDERED_DIFF_DISTANCE_LIMIT,
		Math.floor(_RAPIER_RENDERED_DIFF_WORK_LIMIT / (before.parts.length + after.parts.length + 1))));
	const {edits} = diff(beforeMid, afterMid, {_unit: 'word', limit: _RAPIER_RENDERED_DIFF_WORK_LIMIT});
	if (edits.some(edit => edit.coarse)) return null;
	const extent = (tokens, range) => {
		const indices = range.map(at => {
			let low = 0, high = tokens.starts.length;
			while (low + 1 < high) {
				const middle = (low + high) >>> 1;
				if (tokens.starts[middle] <= at) low = middle; else high = middle;
			}
			return low;
		});
		if (tokens.starts[indices[1]] < range[1]) indices[1]++;
		return indices;
	};
	const groups = [];
	for (const change of edits) {
		const a = extent(before, change.before), b = extent(after, change.after), prior = groups[groups.length - 1];
		if (prior && (a[0] <= prior.a[1] || b[0] <= prior.b[1])) {
			prior.before[1] = change.before[1]; prior.after[1] = change.after[1];
			prior.a[1] = Math.max(prior.a[1], a[1]); prior.b[1] = Math.max(prior.b[1], b[1]);
		} else groups.push({before: [...change.before], after: [...change.after], a, b});
	}
	const windows = [];
	for (const group of groups) {
		const head = Math.max(group.before[0] - before.starts[group.a[0]], group.after[0] - after.starts[group.b[0]]);
		const tail = Math.max(before.starts[group.a[1]] - group.before[1], after.starts[group.b[1]] - group.after[1]);
		const a = [group.before[0] - head, group.before[1] + tail], b = [group.after[0] - head, group.after[1] + tail];
		if (a[0] < 0 || b[0] < 0 || a[1] > beforeMid.length || b[1] > afterMid.length) return null;
		const x = extent(before, a), y = extent(after, b);
		if (a.some((at, edge) => before.starts[x[edge]] !== at) || b.some((at, edge) => after.starts[y[edge]] !== at)) return null;
		const prior = windows[windows.length - 1];
		if (prior && (x[0] <= prior.a[1] || y[0] <= prior.b[1])) {
			prior.a[1] = Math.max(prior.a[1], x[1]); prior.b[1] = Math.max(prior.b[1], y[1]);
		} else windows.push({a: x, b: y});
	}
	let oldAt = 0, newAt = 0, distance = 0;
	for (const {a, b} of windows) {
		if (beforeMid.slice(oldAt, before.starts[a[0]]) !== afterMid.slice(newAt, after.starts[b[0]])) return null;
		distance += a[1] - a[0] + b[1] - b[0];
		if (distance > maximum) return null;
		oldAt = before.starts[a[1]]; newAt = after.starts[b[1]];
	}
	if (beforeMid.slice(oldAt) !== afterMid.slice(newAt)) return null;
	return edits.map(change => ({start: change.before[0], end: change.before[1], insert: afterMid.slice(...change.after)}));
}

function _rapierCoalesceRenderedSpans(before, spans, limit) {
	if (spans.length <= limit) return spans;
	const gaps = [];
	for (let index = 1; index < spans.length; index++) {
		gaps.push({ index, width: spans[index].start - spans[index - 1].end });
	}
	gaps.sort((left, right) => left.width - right.width || left.index - right.index);
	const bridged = new Set(gaps.slice(0, spans.length - limit).map(gap => gap.index));
	const merged = [];
	for (let index = 0; index < spans.length; index++) {
		const span = spans[index];
		const previous = merged[merged.length - 1];
		if (previous && bridged.has(index)) {
			previous.insert += before.slice(previous.end, span.start) + span.insert;
			previous.end = span.end;
		} else {
			merged.push({ start: span.start, end: span.end, insert: span.insert });
		}
	}
	return merged;
}

function _rapierNarrowRenderedEdit(before, after) {
	const outer = _rapierCommonEdges(before, after);
	const from = outer.head;
	const to = before.length - outer.tail;
	const until = after.length - outer.tail;

	if (from === to && from === until) return [];
	const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(before);
	const align = span => {
		const first = graphemes.containing(span.start);
		if (first && first.index < span.start) {
			span.insert = before.slice(first.index, span.start) + span.insert;
			span.start = first.index;
		}
		const last = graphemes.containing(span.end);
		if (last && last.index < span.end) {
			const end = last.index + last.segment.length;
			span.insert += before.slice(span.end, end);
			span.end = end;
		}
		return span;
	};
	const whole = () => [align({ start: from, end: to, insert: after.slice(from, until) })];
	let spans;
	if (from < to && from < until) {
		const inner = _rapierRenderedDiffSpans(before.slice(from, to), after.slice(from, until));
		if (inner) spans = inner.map(span => ({ start: from + span.start, end: from + span.end, insert: span.insert }));
	}
	const narrowed = [];
	for (const span of spans || whole()) {
		const edges = _rapierCommonEdges(before.slice(span.start, span.end), span.insert);
		const { start, end, insert } = align({
			start: span.start + edges.head,
			end: span.end - edges.tail,
			insert: span.insert.slice(edges.head, span.insert.length - edges.tail),
		});
		if (start === end && !insert) continue;
		const previous = narrowed[narrowed.length - 1];

		if (previous && previous.end > start) return whole();
		if (previous && previous.end === start) {
			previous.insert += insert;
			previous.end = end;
		} else {
			narrowed.push({ start, end, insert });
		}
	}
	return _rapierCoalesceRenderedSpans(before, narrowed, _RAPIER_RENDERED_SPAN_LIMIT);
}

export { _RAPIER_RENDERED_SPAN_LIMIT, _RAPIER_RENDERED_DIFF_TOKEN_LIMIT, _RAPIER_RENDERED_DIFF_WORK_LIMIT, _RAPIER_RENDERED_DIFF_DISTANCE_LIMIT, _RAPIER_RENDERED_DIFF_TOKEN, _rapierCommonEdges, _rapierRenderedDiffTokens, _rapierRenderedDiffSpans, _rapierCoalesceRenderedSpans, _rapierNarrowRenderedEdit };
