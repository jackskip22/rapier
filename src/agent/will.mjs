// Rapier Will/1 grammar and range laws. SPDX-License-Identifier: MIT.
const _RAPIER_WILL_INTENT_LIMIT = 512;

const _RAPIER_WILL_LAWS = Object.freeze({ edit: true, append: true, keep: true });
const _RAPIER_WILL_OPENER_PREFIX = '<!-- will/';
const _RAPIER_WILL_CLOSER_PREFIX = '<!-- /will';
const _RAPIER_WILL_CLOSER_EXACT = '<!-- /will -->';
const _RAPIER_WILL_CLOSE_SUFFIX = ' -->';
const _RAPIER_WILL_UNSPACED_OPENER = '<!--will/';
const _RAPIER_WILL_UNSPACED_CLOSER = '<!--/will';

function hasWillMarkers(text) {
	return /(?:^|[\r\n])<!-- ?(?:will\/|\/will)/.test(String(text == null ? '' : text));
}

function _rapierWillMarkerOf(content) {
	const line = String(content == null ? '' : content);
	if (line.startsWith(_RAPIER_WILL_CLOSER_PREFIX)) {
		if (line !== _RAPIER_WILL_CLOSER_EXACT) {
			return { kind: 'near', fault: 'malformed_marker', law: '', intent: null, content: line };
		}
		return { kind: 'close', law: '', intent: null, content: line };
	}
	if (!line.startsWith(_RAPIER_WILL_OPENER_PREFIX)) {
		if (line.startsWith(_RAPIER_WILL_UNSPACED_OPENER) || line.startsWith(_RAPIER_WILL_UNSPACED_CLOSER)) {
			return { kind: 'near', fault: 'malformed_marker', law: '', intent: null, content: line };
		}
		return null;
	}
	const near = fault => ({ kind: 'near', fault, law: '', intent: null, content: line });
	const afterPrefix = line.slice(_RAPIER_WILL_OPENER_PREFIX.length);
	const versionGap = afterPrefix.indexOf(' ');
	if ((versionGap < 0 ? afterPrefix : afterPrefix.slice(0, versionGap)) !== '1') return near('unknown_version');
	if (!line.endsWith(_RAPIER_WILL_CLOSE_SUFFIX)) return near('malformed_marker');
	const middle = line.slice(_RAPIER_WILL_OPENER_PREFIX.length,
		line.length - _RAPIER_WILL_CLOSE_SUFFIX.length);
	const gap = middle.indexOf(' ');
	if (gap < 0) return near('malformed_marker');
	const rest = middle.slice(gap + 1);
	const word = (/^[^:\s]*/.exec(rest))[0];
	if (!word) return near('malformed_marker');
	let intent;
	if (rest === word) intent = null;
	else if (rest.startsWith(word + ': ')) intent = rest.slice(word.length + 2);
	else return near('malformed_marker');
	if (!Object.prototype.hasOwnProperty.call(_RAPIER_WILL_LAWS, word)) return near('unknown_law');
	if (intent !== null) {
		if (!intent.length || intent.indexOf('--') >= 0) return near('malformed_marker');
		if ([...intent].length > _RAPIER_WILL_INTENT_LIMIT) return near('intent_over_bound');
	}
	return { kind: 'open', law: word, intent, content: line };
}

function _rapierWillParse(text) {
	const source = String(text == null ? '' : text);
	const will = {
		present: false, fault: '', faults: [], blocks: [], markers: [], regions: [], text: source,
	};
	if (!hasWillMarkers(source)) return will;
	let open = null;
	for (let index = 0, start = 0; start <= source.length; index++) {
		let contentEnd = start;
		while (contentEnd < source.length && source.charCodeAt(contentEnd) !== 13 && source.charCodeAt(contentEnd) !== 10) contentEnd++;
		let lineEnd = contentEnd;
		if (lineEnd < source.length) {
			lineEnd++;
			if (source.charCodeAt(contentEnd) === 13 && source.charCodeAt(lineEnd) === 10) lineEnd++;
		}
		const row = { start, contentEnd, lineEnd };
		start = contentEnd < source.length ? lineEnd : source.length + 1;
		const marker = _rapierWillMarkerOf(source.slice(row.start, row.contentEnd));
		if (!marker) continue;
		will.present = true;
		will.blocks.push({ start: row.start, end: row.lineEnd });
		const stamped = {
			...marker, line: index, start: row.start, end: row.lineEnd, contentEnd: row.contentEnd,
		};
		if (marker.kind === 'near') {
			will.faults.push({ mode: marker.fault, line: index, start: row.start, end: row.lineEnd });
			continue;
		}
		if (marker.kind === 'close') {
			if (!open) {
				will.faults.push({ mode: 'unpaired_marker', line: index, start: row.start, end: row.lineEnd });
				continue;
			}
			will.markers.push(open, stamped);
			will.regions.push({
				index: will.regions.length, law: open.law, intent: open.intent,
				openerLine: open.line, openerStart: open.start, openerEnd: open.end,
				openerContentEnd: open.contentEnd,
				closerLine: index, closerStart: stamped.start, closerEnd: stamped.end,
				start: open.end, end: stamped.start,
			});
			open = null;
			continue;
		}
		if (open) {
			will.faults.push({ mode: 'unpaired_marker', line: index, start: row.start, end: row.lineEnd });
			continue;
		}
		open = stamped;
	}
	if (open) will.faults.push({ mode: 'unpaired_marker', line: open.line, start: open.start, end: open.end });
	will.faults.sort((a, b) => a.start - b.start);
	will.fault = will.faults.length ? will.faults[0].mode : '';
	return will;
}

function _rapierWillRegionsIn(will, start, end) {
	const found = [];
	for (const region of will.regions) {
		const touches = start === end
			? start >= region.start && start <= region.end
			: start < region.end && region.start < end;
		if (touches) found.push(region);
	}
	return found;
}

function _rapierWillTouchesMarker(will, start, end) {
	const touches = (from, to) => start === end
		? start > from && start < to
		: start < to && from < end;
	for (const region of will.regions) {
		if (touches(region.openerStart, region.openerEnd) ||
				touches(region.closerStart, region.closerEnd)) return region;
	}
	for (const block of will.blocks) if (touches(block.start, block.end)) return { law: 'keep' };
	return null;
}

function _rapierWillGovern(will, start, end) {
	if (will.faults.length) return 'keep';
	if (_rapierWillTouchesMarker(will, start, end)) return 'keep';
	let law = 'edit';
	for (const region of _rapierWillRegionsIn(will, start, end)) {
		if (region.law === 'keep') return 'keep';
		if (region.law === 'append') law = 'append';
	}
	return law;
}

function _rapierWillIntentOf(will, start, end) {
	if (!will.present || will.faults.length) return '';
	const found = _rapierWillRegionsIn(will, start, end);
	if (found.length !== 1) return '';
	const region = found[0];
	return region.intent && start >= region.start && end <= region.end ? region.intent : '';
}


function _rapierWillTerminatorWidth(last, prior) {
	if (last === 10) return prior === 13 ? 2 : 1;
	if (last === 13) return 1;
	return 0;
}

function _rapierWillStripOneTerminator(text) {
	const end = text.length;
	return end ? text.slice(0, end - _rapierWillTerminatorWidth(
		text.charCodeAt(end - 1), end >= 2 ? text.charCodeAt(end - 2) : -1)) : text;
}

export function willOffsetBefore(rows, offset) {
	for (let index = rows.length - 1; index >= 0 && offset >= 0; index--) {
		const {pos, removed, inserted} = rows[index];
		if (offset >= pos) offset = offset >= pos + inserted.length ? offset - inserted.length + removed.length : -1;
	}
	return offset;
}

function _rapierWillRestores(restores, region, splices, text) {
	if (!Array.isArray(restores) || region.law !== 'append') return null;
	const reaching = splices.filter(row => row.pos <= region.end && row.pos + row.removed.length >= region.start &&
		(row.removed || row.inserted)).toSorted((a, b) => a.pos - b.pos);
	if (!reaching.length || reaching.some((row, index) => row.pos < region.start || row.pos + row.removed.length > region.end ||
		(index && row.pos !== reaching[index - 1].pos + reaching[index - 1].removed.length) || !restores.includes(row)) ||
		!/^(?:\r\n|\r|\n)?$/.test(text.slice(reaching.at(-1).pos + reaching.at(-1).removed.length - region.start))) return null;
	return reaching;
}

export function willTransition(beforeText, afterText, splices, markerSplices = splices, {restores = null, restored = null} = {}) {
	const before = _rapierWillParse(beforeText), after = _rapierWillParse(afterText);
	if (!before.present && !after.present) return null;
	const bounds = region => ({start: region.start, end: region.end});
	const faults = will => will.faults.slice(0, 4).map(({mode, line}) => ({mode, line}));
	if (before.faults.length) return {law: 'keep', rule: 'before_faulted', faults: faults(before), start: 0, end: beforeText.length};
	for (const region of before.regions) {
		const markers = [[region.openerStart, region.openerEnd], [region.closerStart, region.closerEnd]];
		for (let index = 0; index < splices.length; index++) {
			const row = splices[index], end = row.pos + row.removed.length;
			for (const marker of markers) {
				if (row.removed.length ? row.pos < marker[1] && marker[0] < end : row.pos > marker[0] && row.pos < marker[1])
					return {law: region.law, rule: 'marker_span_touched', editIndex: index, region: region.index, ...bounds(region)};
				if (end <= marker[0]) { const shift = row.inserted.length - row.removed.length; marker[0] += shift; marker[1] += shift; }
			}
		}
	}
	if (after.faults.length) return {law: 'keep', rule: 'result_faulted', faults: faults(after), start: 0, end: beforeText.length};
	if (before.markers.length !== after.markers.length || before.markers.some((marker, index) => {
		const next = after.markers[index];
		return marker.kind !== next.kind || beforeText.slice(marker.start, marker.end) !== afterText.slice(next.start, next.end) ||
			willOffsetBefore(markerSplices, next.start) !== marker.start || willOffsetBefore(markerSplices, next.end - 1) !== marker.end - 1;
	})) return {law: 'keep', rule: 'marker_sequence_mismatch', start: 0, end: beforeText.length};
	for (const region of before.regions) {
		const was = beforeText.slice(region.start, region.end), next = after.regions[region.index], now = afterText.slice(next.start, next.end);
		if (region.law === 'keep' && was !== now)
			return {law: region.law, rule: 'law_violated', region: region.index, ...bounds(region)};
		if (region.law !== 'append' || _rapierWillStripOneTerminator(now).startsWith(_rapierWillStripOneTerminator(was))) continue;
		const reaching = _rapierWillRestores(restores, region, splices, was);
		if (!reaching) return {law: region.law, rule: 'law_violated', region: region.index, ...bounds(region)};
		restored?.set(region.index, reaching);
	}
	return null;
}

export function evaluateWill(beforeText, splices, {restores = null} = {}) {
	const invalid = rule => ({outcome: 'invalid', reason: 'precondition', rule});
	if (typeof beforeText !== 'string' || !beforeText.isWellFormed()) return invalid('invalid_unicode');
	if (!Array.isArray(splices)) return invalid('malformed_splice');
	const boundary = (text, at) => !(at > 0 && at < text.length &&
		(text.charCodeAt(at - 1) & 0xfc00) === 0xd800 && (text.charCodeAt(at) & 0xfc00) === 0xdc00);
	let afterText = beforeText;
	for (const row of splices) {
		if (!row || !Number.isSafeInteger(row.pos) || row.pos < 0 || Object.is(row.pos, -0) ||
			typeof row.removed !== 'string' || typeof row.inserted !== 'string' ||
			!row.removed.isWellFormed() || !row.inserted.isWellFormed()) return invalid('malformed_splice');
		const end = row.pos + row.removed.length;
		if (end > afterText.length || !boundary(afterText, row.pos) || !boundary(afterText, end)) return invalid('out_of_range_splice');
		if (afterText.slice(row.pos, end) !== row.removed) return invalid('source_mismatch');
		afterText = afterText.slice(0, row.pos) + row.inserted + afterText.slice(end);
	}
	const refusal = splices.length && willTransition(beforeText, afterText, splices, splices, {restores});
	return refusal ? {outcome: 'refused', reason: 'document_law', ...refusal} : {outcome: 'applied'};
}


export { hasWillMarkers, _rapierWillParse as parseWill, _rapierWillMarkerOf as willMarkerOf, _rapierWillRegionsIn as willRegionsIn, _rapierWillTouchesMarker as willTouchesMarker, _rapierWillGovern as willGovern, _rapierWillIntentOf as willIntentOf, _rapierWillStripOneTerminator as stripOneTerminator, _rapierWillTerminatorWidth as terminatorWidth };
