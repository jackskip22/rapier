// SPDX-License-Identifier: AGPL-3.0-only

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

function _rapierRenderedDiffTokens(text, vocabulary) {
	const parts = text.match(_RAPIER_RENDERED_DIFF_TOKEN) || [];
	if (parts.length > _RAPIER_RENDERED_DIFF_TOKEN_LIMIT) return null;
	const starts = new Array(parts.length + 1);
	const ids = new Array(parts.length);
	let at = 0;
	for (let index = 0; index < parts.length; index++) {
		starts[index] = at;
		at += parts[index].length;
		let id = vocabulary.get(parts[index]);
		if (id === undefined) { id = vocabulary.size; vocabulary.set(parts[index], id); }
		ids[index] = id;
	}
	starts[parts.length] = at;
	return { parts, starts, ids };
}

function _rapierTokenDiffPath(trace, distance, offset) {
	const ops = [];
	let x = trace.x;
	let y = trace.y;
	for (let d = distance; d > 0; d--) {
		const v = trace.rounds[d];
		const k = x - y;
		const previousK = (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) ? k + 1 : k - 1;
		const previousX = v[offset + previousK];
		const previousY = previousX - previousK;
		while (x > previousX && y > previousY) { x -= 1; y -= 1; }
		ops.push(x === previousX
			? { at: previousX, remove: false, insert: previousY }
			: { at: previousX, remove: true, insert: -1 });
		x = previousX;
		y = previousY;
	}
	ops.reverse();
	return ops;
}

function _rapierBoundedTokenDiff(beforeIds, afterIds, maxDistance) {
	const n = beforeIds.length;
	const m = afterIds.length;
	const offset = maxDistance + 1;
	const rounds = [];
	const v = new Int32Array(2 * maxDistance + 3);
	for (let d = 0; d <= maxDistance; d++) {
		rounds.push(v.slice());
		for (let k = -d; k <= d; k += 2) {
			let x = (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]))
				? v[offset + k + 1]
				: v[offset + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && beforeIds[x] === afterIds[y]) { x += 1; y += 1; }
			v[offset + k] = x;
			if (x >= n && y >= m) return _rapierTokenDiffPath({ rounds, x: n, y: m }, d, offset);
		}
	}
	return null;
}

function _rapierRenderedDiffSpans(beforeMid, afterMid) {
	const vocabulary = new Map();
	const before = _rapierRenderedDiffTokens(beforeMid, vocabulary);
	const after = before && _rapierRenderedDiffTokens(afterMid, vocabulary);
	if (!before || !after) return null;
	const maxDistance = Math.max(2, Math.min(_RAPIER_RENDERED_DIFF_DISTANCE_LIMIT,
		Math.floor(_RAPIER_RENDERED_DIFF_WORK_LIMIT / (before.ids.length + after.ids.length + 1))));
	const ops = _rapierBoundedTokenDiff(before.ids, after.ids, maxDistance);
	if (!ops) return null;

	const spans = [];
	for (const op of ops) {
		let span = spans[spans.length - 1];
		if (!span || span.endToken < op.at) {
			span = { startToken: op.at, endToken: op.at, insert: '' };
			spans.push(span);
		}
		if (op.remove) span.endToken = op.at + 1;
		else span.insert += after.parts[op.insert];
	}
	return spans.map(span => ({
		start: before.starts[span.startToken],
		end: before.starts[span.endToken],
		insert: span.insert,
	}));
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

export { _RAPIER_RENDERED_SPAN_LIMIT, _RAPIER_RENDERED_DIFF_TOKEN_LIMIT, _RAPIER_RENDERED_DIFF_WORK_LIMIT, _RAPIER_RENDERED_DIFF_DISTANCE_LIMIT, _RAPIER_RENDERED_DIFF_TOKEN, _rapierCommonEdges, _rapierRenderedDiffTokens, _rapierTokenDiffPath, _rapierBoundedTokenDiff, _rapierRenderedDiffSpans, _rapierCoalesceRenderedSpans, _rapierNarrowRenderedEdit };
