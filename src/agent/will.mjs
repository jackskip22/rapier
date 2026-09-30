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
	return /^<!-- ?(?:will\/|\/will)/m.test(String(text == null ? '' : text));
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
	// The words after the colon are document data, never permission (R85b); willGovern alone decides.
	return { kind: 'open', law: word, intent, content: line };
}

// Scan CR, CRLF and LF lines directly into Will's reducer, including a trailing empty line.
// Offsets remain authored UTF-16 coordinates; no editor helper or whole-document line tables.
function _rapierWillParse(text) {
	const source = String(text == null ? '' : text);
	const will = {
		present: false, fault: '', faults: [], blocks: [], markers: [], regions: [], text: source,
	};
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
	// Disclosed with the region's law, never in place of it: under keep and append the words widen nothing.
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


export { hasWillMarkers, _rapierWillParse as parseWill, _rapierWillMarkerOf as willMarkerOf, _rapierWillRegionsIn as willRegionsIn, _rapierWillTouchesMarker as willTouchesMarker, _rapierWillGovern as willGovern, _rapierWillIntentOf as willIntentOf, _rapierWillStripOneTerminator as stripOneTerminator, _rapierWillTerminatorWidth as terminatorWidth };
