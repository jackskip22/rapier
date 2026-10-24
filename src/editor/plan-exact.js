const RAPIER_HIGHLIGHT_COLOR_BY_MARKER = Object.freeze(
	Object.fromEntries(Object.entries(RAPIER_HIGHLIGHT_COLORS).map(([color, marker]) => [marker, color]))
);
function _rapierOverlayHighlightRuns(existing, start, end, color) {
	const runs = [];
	(existing || []).forEach(run => {
		if (run.end <= start || run.start >= end) {
			runs.push({ ...run });
			return;
		}
		if (run.start < start) runs.push({ ...run, end: start });
		if (run.end > end) runs.push({ ...run, start: end });
	});
	if (color !== 'none') runs.push({ start, end, color });
	runs.sort((a, b) => a.start - b.start || a.end - b.end);

	const normalized = [];
	runs.forEach(run => {
		if (run.end <= run.start) return;
		const previous = normalized[normalized.length - 1];
		if (!previous) { normalized.push({ ...run }); return; }
		if (run.start <= previous.end && run.color === previous.color) {
			previous.end = Math.max(previous.end, run.end);
			return;
		}
		const clipped = run.start < previous.end ? { ...run, start: previous.end } : { ...run };
		if (clipped.end > clipped.start) normalized.push(clipped);
	});
	return normalized;
}
function _rapierHighlightRange(root, start, end) {
	const first = _rapierPointForTextOffset(root, start, true);
	const last = _rapierPointForTextOffset(root, end);
	if (!first || !last) return null;
	const range = document.createRange();
	range.setStart(first.node, first.offset);
	range.setEnd(last.node, last.offset);
	return range;
}
function _rapierAllIndicesOf(haystack, needle) {
	const indices = [];
	if (!needle) return indices;
	let from = 0;
	while (from <= haystack.length - needle.length) {
		const index = haystack.indexOf(needle, from);
		if (index < 0) break;
		indices.push(index);
		from = index + Math.max(1, needle.length);
	}
	return indices;
}
function _rapierExactHighlightWrappers(raw, selectedText) {
	const source = String(raw || '');
	const selected = String(selectedText || '');
	if (!selected) return [];
	const matches = [];
	[...['', ...Object.values(RAPIER_HIGHLIGHT_COLORS)].map(marker => ['==' + marker, '==']), ['<mark>', '</mark>'],
		...Object.keys(globalThis.RapierMarkdownSpec.RAPIER_HIGHLIGHT_HEX).map(colour => [globalThis.RapierMarkdownSpec.highlightOpen(colour), '</mark>'])].forEach(([open, close]) => {
		const token = open + selected + close;
		_rapierAllIndicesOf(source, token).forEach(index => matches.push({ index, token, inner: selected }));
		for (const index of _rapierAllIndicesOf(source, open)) {
			const from = index + open.length;
			let at = from, words = '';
			while (at < source.length) {
				if (words === selected && source.startsWith(close, at)) {
					matches.push({ index, token: source.slice(index, at + close.length), inner: source.slice(from, at) });
					break;
				}
				const skip = _rapierZeroWidthTokenAt(source, at);
				if (skip) { at += skip; continue; }
				if (words.length >= selected.length || source[at] !== selected[words.length]) break;
				words += source[at++];
			}
		}
	});
	return matches.sort((a, b) => a.index - b.index || a.token.length - b.token.length);
}
function _rapierPlanExactSourceHighlight(raw, selectedText, color, targetStart, targetEnd) {
	const source = String(raw || '');

	const selected = String(selectedText || '').replace(/\u2060/g, '\n');
	if (!selected || targetEnd <= targetStart) return null;
	if (color === 'default' && (selected.indexOf('==') >= 0 || /^[\s=]|[\s=]$/.test(selected) ||
			Object.keys(RAPIER_HIGHLIGHT_COLOR_BY_MARKER).some(marker => selected.startsWith(marker)))) return null;

	const existing = _rapierExactHighlightWrappers(source, selected);
	const wrap = inner => color === 'none' ? inner : color === 'default' ? '==' + inner + '==' :
		globalThis.RapierMarkdownSpec.highlightOpen(color) + inner + '</mark>';
	const candidates = new Map();
	const offer = (next, width) => candidates.set(next, Math.max(candidates.get(next) || 0, width));
	const highlightToken = (text, at) => text.startsWith('==', at) || RAPIER_HTML_MARK_TAG.test(text.slice(at, at + 40)) ? _rapierZeroWidthTokenAt(text, at) : 0;
	const opens = new Set();
	for (let at = 0; at < source.length; at++) {
		const size = highlightToken(source, at);
		if (size && source[at + 1] !== '/') opens.add(source.slice(at, at + size));
	}
	const candidate = (from, to, inner) => {
		offer(source.slice(0, from) + wrap(inner) + source.slice(to), to - from);
		const tokens = [];
		let plain = '';
		for (let at = 0; at < inner.length;) {
			const size = highlightToken(inner, at);
			if (size) { tokens.push(inner.slice(at, at + size)); at += size; } else plain += inner[at++];
		}
		if (tokens.length > 3) return;
		if (tokens.length) for (let code = 0; code < 3 ** tokens.length; code++) {
			const side = place => tokens.filter((_, index) => Math.floor(code / 3 ** index) % 3 === place).join('');
			offer(source.slice(0, from) + side(0) + wrap(plain) + side(1) + source.slice(to), to - from);
		}
		else for (const open of opens) {
			offer(source.slice(0, from) + (open.startsWith('==') ? '==' : '</mark>') + wrap(inner) + open + source.slice(to), to - from);
		}
	};

	existing.forEach(match => {
		candidate(match.index, match.index + match.token.length, match.inner);
	});
	{
		_rapierAllIndicesOf(source, selected).forEach(index => candidate(index, index + selected.length, selected));
		for (let from = 0; from < source.length; from++) {
			if (source[from] !== selected[0] && !_rapierZeroWidthTokenAt(source, from)) continue;
			let at = from, words = '';
			while (at <= source.length) {
				if (words === selected) candidate(from, at, source.slice(from, at));
				const skip = _rapierZeroWidthTokenAt(source, at);
				if (skip) { at += skip; continue; }
				if (words.length >= selected.length || source[at] !== selected[words.length]) break;
				words += source[at++];
			}
		}
	}

	const before = _rapierRenderedHighlightProbe(source);
	const otherBefore = _rapierOtherSemanticsFingerprint(source, 'highlight');
	if (!before || otherBefore == null || before.text.slice(targetStart, targetEnd) !== selected) return null;
	const wanted = JSON.stringify(_rapierOverlayHighlightRuns(before.runs, targetStart, targetEnd, color));
	const valid = Array.from(candidates.keys()).filter(next => {
		if (!next || next === source) return false;
		const after = _rapierRenderedHighlightProbe(next);
		if (!after || after.nestedMarks || before.text !== after.text) return false;
		return JSON.stringify(after.runs) === wanted && _rapierOtherSemanticsFingerprint(next, 'highlight') === otherBefore;
	});
	if (valid.length <= 1) return valid[0] ?? null;
	valid.sort((a, b) => candidates.get(b) - candidates.get(a));
	return candidates.get(valid[0]) > candidates.get(valid[1]) ? valid[0] : null;
}
const _rapierRunsOutsideTarget = (runs, start, end) => runs.filter(run => run.end <= start || run.start >= end);
const _rapierOutsideRunsPreserved = (beforeOutside, afterRuns, start, end) => {
	const afterOutside = _rapierRunsOutsideTarget(afterRuns, start, end);
	return beforeOutside.every(run => afterOutside.some(a => a.start === run.start && a.end === run.end));
};
function _rapierPlanExactMark(raw, selectedText, mark, targetStart, targetEnd, options = null) {
	const source = String(raw || ''), spec = RAPIER_EXACT_MARKS[mark];
	const selected = String(selectedText || '').replace(/\u2060/g, '\n');
	if (!spec || !selected || targetEnd <= targetStart || source.length > RAPIER_EXACT_MARK_RAW_LIMIT) return null;
	const before = _rapierRenderedMarkProbe(source, mark);
	if (!before || before.text.slice(targetStart, targetEnd) !== selected) return null;
	const on = (options && options.forceOff) ? false : !_rapierMarkCovers(before.runs, targetStart, targetEnd);
	let coverStart = targetStart, coverEnd = targetEnd;
	if (on) for (const run of before.runs) {
		if (run.start < targetEnd && run.end > targetStart) {
			coverStart = Math.min(coverStart, run.start); coverEnd = Math.max(coverEnd, run.end);
		}
	}
	const [[open, close]] = spec.pairs, tokens = spec.pairs.flat(), candidates = new Set();
	const tokenAt = at => tokens.find(token => source.startsWith(token, at)) || null;
	const tokenEndingAt = at => tokens.find(token => at - token.length >= 0 && source.startsWith(token, at - token.length)) || null;
	if (on) {
		const starts = _rapierRawOffsetsForTextOffset(source, coverStart);
		const ends = _rapierRawOffsetsForTextOffset(source, coverEnd);
		if (starts && ends) for (const from of starts) for (const to of ends) {
			if (to <= from) continue;
			let inner = '';
			for (let at = from; at < to;) {
				const size = _rapierZeroWidthTokenAt(source, at);
				if (size) {
					const token = source.slice(at, at + size);
					if (!tokens.includes(token)) inner += token;
					at += size;
				} else inner += source[at++];
			}
			candidates.add(source.slice(0, from) + open + inner + close + source.slice(to));
		}
		_rapierAllIndicesOf(source, selected).forEach(index => {
			candidates.add(source.slice(0, index) + open + selected + close + source.slice(index + selected.length));
		});
		for (let start = 0; start < source.length; start++) {
			if (source[start] !== selected[0] && !tokenAt(start)) continue;
			let at = start, acc = '';
			while (at < source.length && acc.length < selected.length) {
				const token = tokenAt(at);
				if (token) { at += token.length; continue; }
				acc += source[at]; at++;
			}
			if (acc !== selected || at - start === selected.length) continue;
			const left = tokenEndingAt(start), right = tokenAt(at);
			const froms = [start, ...(left ? [start - left.length] : [])], tos = [at, ...(right ? [at + right.length] : [])];
			for (const from of froms) for (const to of tos) candidates.add(source.slice(0, from) + open + selected + close + source.slice(to));
		}
	} else {
		for (const [left, right] of spec.pairs) {
			_rapierAllIndicesOf(source, left + selected + right).forEach(index => {
				candidates.add(source.slice(0, index) + selected + source.slice(index + left.length + right.length + selected.length));
			});
		}
		_rapierAllIndicesOf(source, selected).forEach(index => {
			for (const [left, right] of spec.pairs) {
				const open = source.lastIndexOf(left, index - 1);
				const close = source.indexOf(right, index + selected.length);
				if (open < 0 || close < 0) continue;
				const pre = source.slice(open + left.length, index), post = source.slice(index + selected.length, close);
				if ([left, right].some(token => pre.includes(token) || post.includes(token))) continue;
				const shoulder = part => {
					const lead = /^\s*/.exec(part)[0], trail = /\s*$/.exec(part)[0];
					const core = part.slice(lead.length, part.length - trail.length);
					return core ? lead + left + core + right + trail : part;
				};
				candidates.add(source.slice(0, open) + shoulder(pre) + selected + shoulder(post) + source.slice(close + right.length));
			}
		});
		for (const [left, right] of spec.pairs) {
			for (let start = 0; start < source.length; start++) {
				if (!source.startsWith(left, start)) continue;
				let at = start + left.length, acc = '';
				while (at < source.length && acc.length < selected.length) {
					const skip = _rapierZeroWidthTokenAt(source, at);
					if (skip) { at += skip; continue; }
					acc += source[at]; at++;
				}
				if (acc !== selected || !source.startsWith(right, at)) continue;
				candidates.add(source.slice(0, start) + source.slice(start + left.length, at) + source.slice(at + right.length));
			}
		}
		if (options && options.forceOff) {
			const startOffsets = _rapierRawOffsetsForTextOffset(source, targetStart);
			const endOffsets = _rapierRawOffsetsForTextOffset(source, targetEnd);
			if (startOffsets && endOffsets) for (const rawStart of startOffsets) for (const rawEnd of endOffsets) {
				if (rawEnd < rawStart || source.slice(rawStart, rawEnd).includes('`')) continue;
				let at = rawStart, acc = '', out = '';
				while (at < rawEnd) {
					const own = tokens.find(token => source.startsWith(token, at));
					if (own) { at += own.length; continue; }
					const skip = _rapierZeroWidthTokenAt(source, at);
					if (skip) { out += source.slice(at, at + skip); at += skip; continue; }
					acc += source[at]; out += source[at]; at++;
				}
				if (acc === selected) candidates.add(source.slice(0, rawStart) + out + source.slice(rawEnd));
			}
		}
	}
	const otherBefore = _rapierOtherSemanticsFingerprint(source, mark);
	const targetMarkOutsideBefore = _rapierRunsOutsideTarget(before.runs, targetStart, targetEnd);
	const valid = Array.from(candidates).filter(next => {
		if (next === source) return false;
		const after = _rapierRenderedMarkProbe(next, mark);
		if (!after || after.text !== before.text || after.nested) return false;
		if (!_rapierOutsideRunsPreserved(targetMarkOutsideBefore, after.runs, targetStart, targetEnd)) return false;
		if (_rapierOtherSemanticsFingerprint(next, mark) !== otherBefore) return false;
		return on ? after.runs.some(run => run.start === coverStart && run.end === coverEnd)
			: !_rapierMarkTouches(after.runs, targetStart, targetEnd);
	});
	if (valid.length <= 1) return valid[0] ?? null;
	const window = next => {
		let head = 0;
		while (head < source.length && head < next.length && source[head] === next[head]) head++;
		let tail = 0;
		while (tail < source.length - head && tail < next.length - head && source[source.length - 1 - tail] === next[next.length - 1 - tail]) tail++;
		return next.length - head - tail;
	};
	const sized = valid.map(next => [window(next), next]).sort((a, b) => a[0] - b[0]);
	return sized[0][0] < sized[1][0] ? sized[0][1] : null;
}
function _rapierPlanExactClear(raw, selectedText, targetStart, targetEnd, options = null) {
	const source = String(raw || ''), none = {family: null, color: null, size: null};
	const selected = String(selectedText || '').replace(/\u2060/g, '\n');
	const touched = (source, mark) => {
		const probe = _rapierRenderedMarkProbe(source, mark);
		return probe && probe.runs.filter(run => run.start < targetEnd && run.end > targetStart);
	};
	const runByRun = (source, mark) => {
		for (let runs = touched(source, mark), guard = 0; runs && runs.length && guard < 64; runs = touched(source, mark), guard++) {
			const from = Math.max(runs[0].start, targetStart), to = Math.min(runs[0].end, targetEnd);
			const words = _rapierRenderedMarkProbe(source, mark).text.slice(from, to);
			source = _rapierPlanExactMark(source, words, mark, from, to, { forceOff: true });
			if (source == null) return null;
		}
		return source;
	};
	const marks = Object.keys(RAPIER_EXACT_MARKS);
	const clearMarks = start => {
		if (start == null) return null;
		for (let first = 0; first < marks.length; first++) {
			const order = [...marks.slice(first), ...marks.slice(0, first)];
			let current = start;
			for (let round = 0; round < 8; round++) {
				let changed = false;
				for (const mark of order) {
					const runs = touched(current, mark);
					if (!runs || !runs.length) continue;
					const next = _rapierPlanExactMark(current, selected, mark, targetStart, targetEnd, { forceOff: true }) ?? runByRun(current, mark);
					if (next == null) continue;
					current = next; changed = true;
				}
				const highlight = _rapierRenderedHighlightProbe(current);
				if (highlight && highlight.runs.some(run => run.start === targetStart && run.end === targetEnd)) {
					const next = _rapierPlanExactSourceHighlight(current, selected, 'none', targetStart, targetEnd);
					if (next == null) return null;
					current = next; changed = true;
				}
				if (!changed) break;
			}
			if (marks.every(mark => touched(current, mark)?.length === 0)) return current;
		}
		return null;
	};
	const done = next => next == null || next === source ? null : next;
	const typed = _rapierTypographyRuns(source, options);
	if (!typed) return null;
	const painted = style => !!(style.family || style.color || style.size);
	if (!typed.paint.slice(targetStart, targetEnd).some(painted)) return done(clearMarks(source));
	const typography = value => value == null ? null : _rapierPlanTypography(value, none, targetStart, targetEnd, options);
	const plain = clearMarks(typography(source)) ?? typography(clearMarks(source));
	if (plain != null) return done(plain);
	let from = targetStart, to = targetEnd;
	while (from > 0 && painted(typed.paint[from - 1])) from--;
	while (to < typed.paint.length && painted(typed.paint[to])) to++;
	let next = clearMarks(_rapierPlanTypography(source, none, from, to, options));
	const key = style => JSON.stringify([style.family?.css || null, style.color || null, style.size ? globalThis.RapierMarkdownSpec.typography.size(style.size).points : null]);
	for (let at = from; next != null && at < to;) {
		if (at >= targetStart && at < targetEnd || !painted(typed.paint[at])) { at++; continue; }
		let stop = at + 1;
		while (stop < to && !(stop >= targetStart && stop < targetEnd) && key(typed.paint[stop]) === key(typed.paint[at])) stop++;
		next = _rapierPlanTypography(next, typed.paint[at], at, stop, options);
		at = stop;
	}
	const after = next == null ? null : _rapierTypographyRuns(next, options);
	return after && after.paint.every((style, at) => key(style) === (at >= targetStart && at < targetEnd ? key({}) : key(typed.paint[at]))) ? done(next) : null;
}
function _rapierPlanExactSourceColor(raw, selectedText, hex, targetStart, targetEnd, options = null) {
	const probe = _rapierTypographyRuns(raw, options);
	if (!probe || probe.text.slice(targetStart, targetEnd) !== String(selectedText || '').replace(/\u2060/g, '\n')) return null;
	return _rapierPlanTypography(raw, {color: hex === 'none' ? null : hex}, targetStart, targetEnd, options);
}
function _rapierPlanExactSourceInk(raw, selectedText, opener, targetStart, targetEnd) {
	const source = String(raw || ''), spec = globalThis.RapierMarkdownSpec;
	let selected = String(selectedText || '').replace(/\u2060/g, '\n');
	const leading = /^\n+/.exec(selected);
	if (leading) { selected = selected.slice(leading[0].length); targetStart += leading[0].length; }
	const trailing = /\n+$/.exec(selected);
	if (trailing) { selected = selected.slice(0, -trailing[0].length); targetEnd -= trailing[0].length; }
	if (!selected || targetEnd <= targetStart || !spec.parseInkOpen(opener)) return null;
	if (spec.hasInkMarker(selected)) return null;
	const markers = spec.scanInkMarkers(source);
	const map = [];
	let stripped = '', cursor = 0;
	const take = (from, to) => { for (let index = from; index < to; index++) { map.push(index); stripped += source[index]; } };
	for (const marker of markers) { if (marker.start < cursor) continue; take(cursor, marker.start); cursor = marker.end; }
	take(cursor, source.length);
	map.push(source.length);
	const runs = spec.pairInkSpans(source).runs;
	const before = _rapierRenderedInkProbe(source);
	const semantics = _rapierOtherSemanticsFingerprint(source, 'ink');
	if (!before || before.text.slice(targetStart, targetEnd) !== selected || semantics == null) return null;
	const fingerprint = rows => JSON.stringify(rows.map(run => [run.start, run.end, run.body]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2])));
	const wanted = fingerprint([...before.runs, {start: targetStart, end: targetEnd, body: spec.inkOpenBody(opener)}]);
	const visibleAt = at => {
		let low = 0, high = map.length;
		while (low < high) { const mid = (low + high) >> 1; if (map[mid] < at) low = mid + 1; else high = mid; }
		return low;
	};
	const valid = [];
	for (const index of _rapierAllIndicesOf(stripped, selected)) {
		const end = index + selected.length;
		let sourceStart = map[index], sourceEnd = map[end - 1] + 1, crossing = false;
		for (const run of runs) {
			const a = visibleAt(run.innerStart), b = visibleAt(run.innerEnd);
			if (end <= a || index >= b || index >= a && end <= b) continue;
			if (index <= a && end >= b) { sourceStart = Math.min(sourceStart, run.start); sourceEnd = Math.max(sourceEnd, run.end); }
			else { crossing = true; break; }
		}
		if (crossing) continue;
		const next = source.slice(0, sourceStart) + opener + source.slice(sourceStart, sourceEnd) + spec.INK_CLOSE + source.slice(sourceEnd);
		const after = _rapierRenderedInkProbe(next);
		if (!after || after.text !== before.text || fingerprint(after.runs) !== wanted ||
			_rapierOtherSemanticsFingerprint(next, 'ink') !== semantics) continue;
		valid.push(next);
	}
	return valid.length === 1 ? valid[0] : null;
}
function _rapierPlanExactSourceInkRemoval(raw, jobs, hits) {
	const source = String(raw || ''), spec = globalThis.RapierMarkdownSpec;
	const before = _rapierRenderedMarkProbe(source, 'bold'), semantics = _rapierCutSemantics(source);
	if (!spec || !before || !semantics) return null;
	const map = _rapierCutSourceMap(source, before.text, semantics.formulas) || _rapierCutSourceMap(source, before.text, semantics.formulas, true);
	if (!map) return null;
	const rendered = _rapierInkRuns(before.root), paint = rendered.paint, kept = [], splices = [];
	const indexAt = (positions, at, after) => {
		let low = 0, high = positions.length;
		while (low < high) { const mid = (low + high) >> 1; if (after ? positions[mid] <= at : positions[mid] < at) low = mid + 1; else high = mid; }
		return low;
	};
	const sourceRuns = spec.pairInkSpans(source, _rapierInkSourceMarkers(source)).runs.map(run => ({...run,
		from: indexAt(map.from, run.innerStart, false), to: indexAt(map.to, run.innerEnd, true),
		body: spec.inkOpenBody(source.slice(run.start, run.innerStart)),
	}));
	const fingerprint = runs => JSON.stringify(runs.map(run => [run.start, run.end, run.body]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2])));
	if (fingerprint(sourceRuns.map(run => ({start: run.from, end: run.to, body: run.body}))) !== fingerprint(rendered.runs)) return null;
	const selected = new Set(jobs.map(job => job.start));
	const wanted = sourceRuns.filter(run => !selected.has(run.start)).map(run => ({start: run.from, end: run.to, body: run.body}));
	const erased = new Array(before.text.length).fill(false);
	for (const word of before.text.matchAll(/\S+/g)) {
		const end = word.index + word[0].length;
		if (!hits.some(hit => map.from[word.index] < hit.end && map.to[end - 1] > hit.start)) continue;
		for (let i = word.index; i < end; i++) erased[i] = true;
	}
	let changed = false;
	for (const job of jobs) {
		const opener = source.slice(job.start, job.innerStart);
		splices.push({ pos: job.start, removed: opener, inserted: '' },
			{ pos: job.innerEnd, removed: source.slice(job.innerEnd, job.end), inserted: '' });
		let start = -1;
		for (let i = 0; i <= before.text.length; i++) {
			const inside = i < before.text.length && map.from[i] >= job.innerStart && map.to[i] <= job.innerEnd;
			const keep = inside && !job.whole && !erased[i];
			if (inside && !keep && paint[i] && /\S/.test(before.text[i])) changed = true;
			if (keep && start < 0) start = i;
			else if (!keep && start >= 0) { kept.push({ start, end: i, opener }); start = -1; }
		}
	}
	if (!changed) return null;
	const boundaries = new Set();
	for (const runs of Object.values(semantics.runs)) for (const run of runs) { boundaries.add(run.start); boundaries.add(run.end); }
	for (const run of wanted) { boundaries.add(run.start); boundaries.add(run.end); }
	for (const run of kept) {
		const cuts = [run.start, ...Array.from(boundaries).filter(at => at > run.start && at < run.end).sort((a, b) => a - b), run.end];
		for (let i = 1; i < cuts.length; i++) {
			let start = cuts[i - 1], end = cuts[i];
			while (start < end && /\s/.test(before.text[start])) start++;
			while (end > start && /\s/.test(before.text[end - 1])) end--;
			if (start >= end) continue;
			wanted.push({start, end, body: spec.inkOpenBody(run.opener)});
			splices.push({ pos: map.from[start], removed: '', inserted: run.opener },
				{ pos: map.to[end - 1], removed: '', inserted: spec.INK_CLOSE });
		}
	}
	splices.sort((a, b) => b.pos - a.pos || b.removed.length - a.removed.length);
	const next = _rapierTransformSplices(source, splices);
	if (next == null || next === source) return null;
	const after = _rapierRenderedMarkProbe(next, 'bold');
	if (!after || after.text !== before.text || JSON.stringify(_rapierCutSemantics(next)) !== JSON.stringify(semantics)) return null;
	if (fingerprint(_rapierInkRuns(after.root).runs) !== fingerprint(wanted)) return null;
	return { raw: next, splices };
}
const RAPIER_LINK_WRAP_UNSAFE_SELECTOR =
	'a,img,svg,math,[data-math-src],.rapier-source-token,.footnote-ref,' +
	'[contenteditable="false"],br';
function _rapierLinkRangeIntersectsUnsafe(range, root) {
	if (!range || !root) return true;
	return Array.from(root.querySelectorAll(RAPIER_LINK_WRAP_UNSAFE_SELECTOR))
		.some(node => _rapierRangeStrictlyIntersectsNode(range, node));
}
function _rapierMarkdownLinkShell(url) {
	const sentinel = 'RAPIERLINKPROBE7Q9';
	const root = document.createElement('div');
	const anchor = document.createElement('a');
	anchor.setAttribute('href', String(url || ''));
	anchor.textContent = sentinel;
	root.appendChild(anchor);
	const raw = _markdownFromEditHTML(root.innerHTML);
	const offset = raw.indexOf(sentinel);
	if (offset < 0 || raw.indexOf(sentinel, offset + sentinel.length) >= 0) return null;
	const prefix = raw.slice(0, offset);
	const suffix = raw.slice(offset + sentinel.length);
	return prefix && suffix ? { prefix, suffix } : null;
}
function _rapierExactLinkEnvelope(beforeRaw, afterRaw, shell) {
	const before = String(beforeRaw || '');
	const after = String(afterRaw || '');
	const prefix = String(shell?.prefix || '');
	const suffix = String(shell?.suffix || '');
	if (!prefix || !suffix || after.length !== before.length + prefix.length + suffix.length) return null;

	let attempts = 0;
	for (let open = after.indexOf(prefix); open >= 0 && open <= before.length;
			 open = after.indexOf(prefix, open + 1)) {
		if (++attempts > 256) return null;
		if (after.slice(0, open) !== before.slice(0, open)) continue;
		for (let close = after.indexOf(suffix, open + prefix.length); close >= 0;
				 close = after.indexOf(suffix, close + 1)) {
			if (++attempts > 256) return null;
			const end = close - prefix.length;
			if (end <= open || end > before.length) continue;
			if (after.slice(open + prefix.length, close) !== before.slice(open, end)) continue;
			if (after.slice(close + suffix.length) !== before.slice(end)) continue;
			return { start: open, end };
		}
	}
	return null;
}
function _rapierPlanExactNestedLink(live, range, beforeRaw, url) {
	if (!live || !range || range.collapsed ||
			!_nodeInside(live, range.startContainer) || !_nodeInside(live, range.endContainer) ||
			_rapierLinkRangeIntersectsUnsafe(range, live)) return null;
	const selectedText = String(range.cloneContents().textContent || '');
	if (!selectedText) return null;

	const start = _charOffsetForRangePoint(
		live, range.startContainer, range.startOffset);
	const end = _charOffsetForRangePoint(
		live, range.endContainer, range.endOffset);
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) return null;

	const clone = live.cloneNode(true);
	const plannedRange = _rapierHighlightRange(clone, start, end);
	if (!plannedRange || plannedRange.collapsed ||
			String(plannedRange.cloneContents().textContent || '') !== selectedText) return null;
	const anchor = document.createElement('a');
	anchor.setAttribute('href', String(url || ''));
	anchor.appendChild(plannedRange.extractContents());
	plannedRange.insertNode(anchor);
	clone.normalize();

	const afterRaw = _markdownFromEditHTML(clone.innerHTML);
	const shell = _rapierMarkdownLinkShell(url);
	if (!shell || !_rapierExactLinkEnvelope(beforeRaw, afterRaw, shell)) return null;

	const beforeRendered = document.createElement('div');
	const afterRendered = document.createElement('div');
	beforeRendered.innerHTML = renderBlock(beforeRaw);
	afterRendered.innerHTML = renderBlock(afterRaw);
	if (beforeRendered.textContent !== afterRendered.textContent ||
			afterRendered.querySelectorAll('a[href]').length !==
				beforeRendered.querySelectorAll('a[href]').length + 1 ||
			_markdownFromEditHTML(afterRendered.innerHTML) !== afterRaw) return null;
	const expected = document.createElement('a');
	expected.setAttribute('href', String(url || ''));
	const linked = Array.from(afterRendered.querySelectorAll('a[href]')).some(candidate =>
		candidate.textContent === selectedText && candidate.href === expected.href);
	return linked ? {
		html: afterRendered.innerHTML, raw: afterRaw,
		selectionStart: start, selectionEnd: end,
	} : null;
}
function _rapierPlanExactUnlink(raw, visibleText, start, end, href, options = null) {
	const source = String(raw || '');
	if (typeof visibleText !== 'string' || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
			start < 0 || start > end || end > visibleText.length || source.length > RAPIER_EXACT_MARK_RAW_LIMIT) return null;
	const text = visibleText.slice(start, end);

	const base = _rapierCutSemantics(source, options);
	if (!base || base.text !== visibleText) return null;
	const key = runs => runs.map(run => run.start + ':' + run.end + ':' + (run.attr ?? '')).sort().join(' ');
	const root = _rapierRenderedMarkProbe(source, 'bold', !!options?.tableCell)?.root;
	if (!root || Array.from(root.querySelectorAll('a[href]')).filter(anchor =>
		_rapierTextBefore(root, anchor) === start && start + String(anchor.textContent || '').length === end &&
		anchor.getAttribute('href') === href).length !== 1) return null;
	const links = base.runs.link.filter(run => !(run.start === start && run.end === end && run.attr === href));
	const count = raw => { try { return _rapierRenderedMarkProbe(raw, 'bold', !!options?.tableCell).root.querySelectorAll('a[href]').length; } catch (_) { return -1; } };
	const anchors = count(source);
	const proves = next => {
		const after = next !== source && _rapierCutSemantics(next, options);
		return !!after && after.text === base.text && count(next) === anchors - 1 && key(after.runs.link) === key(links) &&
			Object.keys(base.runs).every(name => name === 'link' || key(after.runs[name]) === key(base.runs[name])) &&
			JSON.stringify(after.pictures) === JSON.stringify(base.pictures) && JSON.stringify(after.breaks) === JSON.stringify(base.breaks);
	};
	const shell = /\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\](?:\((?:[^()\s]|\([^()\s]*\))*(?:\s+"[^"\n]*")?\)|\[[^\]\n]*\])?|<([A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*|[^\s<>@]+@[^\s<>]+)>/g;
	const escaped = (raw, at) => {
		for (let k = 0; k < text.length; k++) {
			const next = /[!-/:-@[-`{-~]/.test(text[k]) ? raw.slice(0, at + k) + '\\' + raw.slice(at + k) : null;
			if (next && proves(next)) return next;
		}
		return null;
	};
	const valid = new Set();
	for (const match of source.matchAll(shell)) {
		const label = match[1] ?? match[2], next = source.slice(0, match.index) + label + source.slice(match.index + match[0].length);
		const kept = proves(next) ? next : label === text ? escaped(next, match.index) : null;
		if (kept) valid.add(kept);
	}
	if (!valid.size && text) {
		const map = _rapierCutSourceMap(source, base.text, base.formulas, false, base.tokens), at = map && map.from[start];
		const kept = at != null && source.startsWith(text, at) ? escaped(source, at) : null;
		if (kept) valid.add(kept);
	}
	if (valid.size !== 1) return null;
	return Array.from(valid)[0];
}
// underline (RAPIER_EXACT_MARKS), highlight in every spelling (`==`, Bear's `==🟢`, `<mark>`), and a backslash escape -- the same tokens _rapierPlanExactMark's (d) loop treats as
const RAPIER_ZERO_WIDTH_MARK_TOKENS = Object.freeze(Array.from(new Set(
	Object.values(RAPIER_EXACT_MARKS).flatMap(spec => spec.pairs.flat())
)).sort((a, b) => b.length - a.length));
function _rapierZeroWidthTokenAt(source, at) {
	if (source.startsWith('==', at)) {
		for (const marker of Object.values(RAPIER_HIGHLIGHT_COLORS)) {
			if (marker && source.startsWith(marker, at + 2)) return 2 + marker.length;
		}
		return 2;
	}
	const mark = source[at] === '<' && RAPIER_HTML_MARK_TAG.exec(source.slice(at, at + 40));
	if (mark) return mark[0].length;
	for (const token of RAPIER_ZERO_WIDTH_MARK_TOKENS) {
		if (source.startsWith(token, at)) return token.length;
	}
	if (source[at] === '\\' && /[!-/:-@[-`{-~]/.test(source[at + 1] || '')) return 1;
	return 0;
}
function _rapierRawOffsetsForTextOffset(source, target, limit = 4) {
	let rawPos = 0, textPos = 0;
	while (rawPos < source.length && textPos < target) {
		const skip = _rapierZeroWidthTokenAt(source, rawPos);
		if (skip) { rawPos += skip; continue; }
		rawPos += 1; textPos += 1;
	}
	if (textPos !== target) return null;
	const offsets = [rawPos];
	let at = rawPos;
	for (let i = 0; i < limit; i++) {
		const skip = _rapierZeroWidthTokenAt(source, at);
		if (!skip) break;
		at += skip;
		offsets.push(at);
	}
	return offsets;
}
function _rapierCutSourceMap(source, text, atoms = [], structural = false, sourceTokens = [], codeAtoms = false) {
	const from = [], to = [], bounds = new Set([0, source.length]);
	const whole = [
		/!\[[^\]\n]*\](?:\((?:[^()\s]|\([^()\s]*\))*(?:\s+"[^"\n]*")?\)|\[[^\]\n]*\])/y,
		/\](?:\((?:[^()\s]|\([^()\s]*\))*(?:\s+"[^"\n]*")?\)|\[[^\]\n]*\])/y,
		/<!--[\s\S]*?-->|<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>\n]*)?\/?>/y,
	];
	const formula = /\$\$[^$]+\$\$|\$[^\s$](?:[^$\n]*[^\s$\\])?\$(?!\d)/y;
	let at = 0, t = 0, atom = 0;
	const token = size => { bounds.add(at); at += size; bounds.add(at); };
	while (at < source.length) {
		if (codeAtoms && source[at] === '`') {
			const state = new md.inline.State(source, md, {}, []); state.pos = at;
			const rule = md.inline.ruler.__rules__.find(rule => rule.name === 'backticks');
			if (rule?.fn(state, false) && state.tokens.at(-1)?.type === 'code_inline') {
				const code = state.tokens.at(-1).content;
				if (!text.startsWith(code, t)) return null;
				bounds.add(at);
				for (let k = 0; k < code.length; k++) { from.push(k ? state.pos : at); to.push(state.pos); }
				t += code.length; at = state.pos; bounds.add(at); continue;
			}
		}
		const kept = sourceTokens.find(token => token.start === t && token.raw && source.startsWith(token.raw, at));
		const escaped = !kept && /^\\[!-/:-@[-`{-~]/.exec(source.slice(at));
		const entity = !kept && /^&(?:#x[\da-f]+|#\d+|[a-z][a-z\d]+);/i.exec(source.slice(at));
		const decoded = entity && md.utils.unescapeAll(entity[0]);
		const value = kept ? { raw: kept.raw, length: kept.length } : escaped && text.startsWith(escaped[0][1], t) ? {raw: escaped[0], length: 1} : decoded && decoded !== entity[0] && text.startsWith(decoded, t)
			? { raw: entity[0], length: decoded.length } : null;
		if (value) {
			const end = at + value.raw.length;
			bounds.add(at);
			for (let k = 0; k < value.length; k++) { from.push(k ? end : at); to.push(end); }
			t += value.length; at = end; bounds.add(at); continue;
		}
		let size = 0;
		for (const re of whole) { re.lastIndex = at; if (re.test(source)) { size = re.lastIndex - at; break; } }
		if (size) { token(size); continue; }
		formula.lastIndex = at;
		if (atom < atoms.length && formula.test(source)) {
			const end = formula.lastIndex;
			bounds.add(at);
			for (let k = 0; k < atoms[atom]; k++) { from.push(k ? end : at); to.push(end); }
			t += atoms[atom++]; at = end; bounds.add(at);
			continue;
		}
		if (t < text.length && (source[at] === text[t] || (source[at] === '\u2060' && text[t] === '\n'))) { from.push(at); to.push(at + 1); at++; t++; continue; }
		if (structural && t < text.length && text[t] === '\n' && source[at] !== '\n' && source[at] !== '\u2060') {
			let ahead = at, skip;
			while (ahead < source.length && (skip = _rapierZeroWidthTokenAt(source, ahead))) ahead += skip;
			if (source[ahead] !== '\n') { from.push(at); to.push(at); t++; continue; }
		}
		token(_rapierZeroWidthTokenAt(source, at) || 1);
	}
	return t === text.length && from.length === text.length ? { from, to, bounds } : null;
}
function _rapierCutSemantics(raw, options = null) {
	const probe = _rapierRenderedMarkProbe(raw, 'bold', !!options?.tableCell);
	if (!probe) return null;
	const root = probe.root, runs = {}, empty = [];
	for (const [mark, spec] of Object.entries(RAPIER_EXACT_MARKS)) runs[mark] = _rapierMarkRuns(root, spec.selector);
	runs.code = _rapierMarkRuns(root, 'code');
	runs.link = _rapierMarkRuns(root, 'a[href]', 'href');
	runs.highlight = _rapierHighlightRuns(root).map(run => ({ start: run.start, end: run.end, attr: run.color }));
	runs.colour = _rapierColorRuns(root).runs.map(run => ({ start: run.start, end: run.end, attr: run.hex }));
	runs.font = _rapierMarkRuns(root, '[data-md-font]', 'data-md-font');
	runs.size = _rapierMarkRuns(root, '[data-md-size]', 'data-md-size');
	runs.formula = _rapierMarkRuns(root, '.math-rendered', 'data-math-src');
	for (const [name, selector] of [['a', 'a[href]'], ['code', 'code'], ['mark', 'mark'], ['formula', '.math-rendered'],
			...Object.entries(RAPIER_EXACT_MARKS).map(([mark, spec]) => [mark, spec.selector])]) {
		empty.push(name + ':' + Array.from(root.querySelectorAll(selector)).filter(element => !element.textContent && !element.querySelector('img')).length);
	}
	const pictures = Array.from(root.querySelectorAll('img')).map(img => ({
		at: _rapierTextBefore(root, img),
		src: img.getAttribute('src') || '',
	}));
	const breaks = Array.from(root.querySelectorAll('br')).map(node => _rapierTextBefore(root, node));
	const tokens = Array.from(root.querySelectorAll('.rapier-source-token[data-rapier-source]')).map(node => ({
		start: _rapierTextBefore(root, node), length: String(node.textContent || '').length,
		raw: _rapierRenderModule('render-markdown')._rapierSourceTokenValue(node),
	}));
	return { text: probe.text, runs, empty: empty.join(' '), pictures, breaks, tokens, formulas: Array.from(root.querySelectorAll('.math-rendered')).map(node => String(node.textContent || '').length) };
}
function _rapierCutProves(before, after, start, end, pictures, breaks = null) {
	if (!before || !after) return false;
	const length = end - start, untrimmed = before.text.slice(0, start) + before.text.slice(end);
	const lead = /^\n*/.exec(untrimmed)[0].length, expected = untrimmed.slice(lead).replace(/\n+$/, '');
	if (after.text !== expected || after.empty !== before.empty) return false;
	const mapRun = run => {
		const from = (run.start < start ? run.start : (run.start >= end ? run.start - length : start)) - lead;
		const to = (run.end <= start ? run.end : (run.end >= end ? run.end - length : start)) - lead;
		return to > from ? from + ':' + to + ':' + (run.attr ?? '') : null;
	};
	const key = runs => runs.map(run => run.start + ':' + run.end + ':' + (run.attr ?? '')).sort().join(' ');
	for (const name of Object.keys(before.runs)) {
		if (key(after.runs[name]) !== before.runs[name].map(mapRun).filter(Boolean).sort().join(' ')) return false;
	}
	const keepsAtoms = (beforeAtoms, afterAtoms, selected, position, identity) => {
		const inside = beforeAtoms.filter(atom => position(atom) > start && position(atom) < end);
		const edges = beforeAtoms.filter(atom => position(atom) === start || position(atom) === end);
		const edgesGo = (selected == null ? inside.length : selected) - inside.length;
		if (edgesGo !== 0 && edgesGo !== edges.length) return false;
		const kept = beforeAtoms.filter(atom => !inside.includes(atom) && !(edgesGo && edges.includes(atom)))
			.map(atom => ((position(atom) > start ? Math.max(start, position(atom) - length) : position(atom)) - lead) + ':' + identity(atom));
		return JSON.stringify(afterAtoms.map(atom => position(atom) + ':' + identity(atom))) === JSON.stringify(kept);
	};
	return keepsAtoms(before.pictures, after.pictures, pictures, atom => atom.at, atom => atom.src) &&
		keepsAtoms(before.breaks, after.breaks, breaks, at => at, () => 'br');
}
function _rapierPlanExactCut(raw, text, start, end, pictures = 0, options = null) {
	const source = String(raw || ''), before = _rapierCutSemantics(source, options);
	const boundary = at => !(at > 0 && at < text.length && /[\ud800-\udbff]/.test(text[at - 1]) && /[\udc00-\udfff]/.test(text[at]));
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || end > text.length || !boundary(start) || !boundary(end)) return null;
	if (!before || before.text !== text) return null;
	const map = _rapierCutSourceMap(source, text, before.formulas, false, before.tokens) || _rapierCutSourceMap(source, text, before.formulas, true, before.tokens);
	if (!map) return null;
	const marker = /^(?:[ \t]*>[ \t]?)*[ \t]*(?:(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?|#{1,6}[ \t]+)?/;
	const offsets = (at, opening) => {
		const lo = at > 0 ? map.to[at - 1] : 0, hi = at < map.from.length ? map.from[at] : source.length;
		const floor = !options?.tableCell && opening && (at === 0 || text[at - 1] === '\n') ? Math.min(hi, lo + marker.exec(source.slice(lo))[0].length) : lo;
		return Array.from(new Set([floor, hi, ...Array.from(map.bounds).filter(p => p > lo && p < hi && p >= floor)])).sort((a, b) => a - b);
	};
	const visible = new Set();
	map.from.forEach((p, i) => { for (let q = p; q < map.to[i]; q++) visible.add(q); });
	const pairs = { ']': '[', '</': '<' };
	const candidates = new Set();
	for (const s of offsets(start, true)) for (const e of offsets(end, false)) {
		if (e < s) continue;
		const tokens = [];
		for (let p = s; p < e; p++) {
			if (visible.has(p)) continue;
			if (!tokens.length || map.bounds.has(p) || visible.has(p - 1)) tokens.push({ at: p, text: '' });
			tokens[tokens.length - 1].text += source[p];
		}
		const open = [];
		for (const item of tokens) {
			if (/^(?:!\[|<!--)/.test(item.text) || /\/>$/.test(item.text)) { item.drop = true; continue; }
			const closer = item.text[0] === ']' ? '[' : /^<\//.test(item.text) ? item.text.replace(/^<\/([A-Za-z0-9-]+).*$/, '<$1') : null;
			const top = open[open.length - 1];
			if (top && (closer ? top.text === closer || top.text.startsWith(closer + ' ') || top.text.startsWith(closer + '>') : top.text === item.text)) {
				top.drop = item.drop = true; open.pop();
			} else if (!closer) open.push(item);
		}
		const keptAll = tokens.map(item => item.text).join(''), keptOpen = tokens.filter(item => !item.drop).map(item => item.text).join('');
		for (const middle of ['', keptOpen, keptAll]) candidates.add(source.slice(0, s) + middle + source.slice(e));
	}
	candidates.delete(source);
	const valid = Array.from(candidates).filter(next => _rapierCutProves(before, _rapierCutSemantics(next, options), start, end, pictures, options?.breaks));
	return valid.length ? valid.sort((a, b) => a.length - b.length)[0] : null;
}
