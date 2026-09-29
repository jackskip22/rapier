// SPDX-License-Identifier: AGPL-3.0-only
function _rapierBodySegmentSpans(rows, prefix) {
	const spans = [];
	const list = Array.isArray(rows) ? rows : [];
	let cursor = String(prefix == null ? '' : prefix).length;
	for (let index = 0; index < list.length; index++) {
		const row = list[index];
		if (index > 0) cursor += String(row.leading == null ? '\n\n' : row.leading).length;
		const start = cursor;
		const end = start + String(row.raw || '').length;
		spans.push({ id: row.id, start, end });
		cursor = end;
	}
	return spans;
}

// A block's identity is where it stands and what it says: its span and its raw. Its type is the
// parser's reading of that raw, carried for the projection and never evidence: a block born in the
// editor has no type until a parse names it, and an edited block keeps the type it was parsed with.
// The founder's phone, 24 September: every return from Notes over a block just typed refused the
// document's whole history ("the document history could not be restored"), because the record said
// '' where the parse said 'paragraph'.
function _rapierStableBlockIdentityKey(block) {
	return String(block && block.raw || '');
}

function _rapierProvenSegmentMatches(beforeBlocks, afterBlocks) {
	const before = Array.isArray(beforeBlocks) ? beforeBlocks : [];
	const after = Array.isArray(afterBlocks) ? afterBlocks : [];
	const beforeByKey = new Map();
	const afterCount = new Map();
	before.forEach((block, index) => {
		const key = _rapierStableBlockIdentityKey(block);
		const prior = beforeByKey.get(key);
		beforeByKey.set(key, prior == null ? index : -1);
	});
	after.forEach(block => {
		const key = _rapierStableBlockIdentityKey(block);
		afterCount.set(key, (afterCount.get(key) || 0) + 1);
	});

	const candidates = [];
	after.forEach((block, newIndex) => {
		const key = _rapierStableBlockIdentityKey(block);
		const oldIndex = beforeByKey.get(key);
		if (oldIndex == null || oldIndex < 0 || afterCount.get(key) !== 1) return;
		candidates.push({ oldIndex, newIndex });
	});

	const tails = [];
	const tailIndices = [];
	const previous = new Array(candidates.length).fill(-1);
	candidates.forEach((candidate, index) => {
		let lo = 0, hi = tails.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (tails[mid] < candidate.oldIndex) lo = mid + 1;
			else hi = mid;
		}
		if (lo > 0) previous[index] = tailIndices[lo - 1];
		tails[lo] = candidate.oldIndex;
		tailIndices[lo] = index;
	});
	const keep = [];
	let cursor = tailIndices.length ? tailIndices[tailIndices.length - 1] : -1;
	while (cursor >= 0) {
		keep.push(candidates[cursor]);
		cursor = previous[cursor];
	}
	keep.reverse();
	const proven = new Map();
	keep.forEach(match => {
		const oldBlock = before[match.oldIndex];
		if (!oldBlock || !after[match.newIndex] || !Number.isSafeInteger(Number(oldBlock.id))) return;
		proven.set(match.newIndex, Number(oldBlock.id));
	});
	return proven;
}

function _rapierSplicedSegmentMatches(priorBlocks, spans, priorPrefix, splices, sourceOffsets = null) {
	const prior = Array.isArray(priorBlocks) ? priorBlocks : [];
	const rows = Array.isArray(spans) ? spans : [];
	const edits = splices.filter(row => row.removed !== row.inserted).map(row => ({
		pos: Number(row.pos), removed: String(row.removed || '').length,
		inserted: String(row.inserted || '').length,
	}));
	if (edits.some(row => !Number.isSafeInteger(row.pos) || row.pos < 0)) return null;
	const before = _rapierBodySegmentSpans(prior, priorPrefix);
	const after = _rapierBodySegmentSpans(rows, rows._rapierPrefix);
	const beforeOffset = sourceOffsets?.before || 0, afterOffset = sourceOffsets?.after || 0;
	const proven = new Map();
	let cursor = 0;
	for (let index = 0; index < before.length; index++) {
		const span = before[index];
		const source = prior[index];
		if (!Number.isSafeInteger(source && source.id)) continue;
		let start = span.start + beforeOffset, end = span.end + beforeOffset, cut = false;
		for (const edit of edits) {
			if (end <= edit.pos) continue;
			if (start < edit.pos + edit.removed) { cut = true; break; }
			const shift = edit.inserted - edit.removed;
			start += shift;
			end += shift;
		}
		if (cut) continue;
		start -= afterOffset;
		end -= afterOffset;
		while (cursor < after.length && after[cursor].start < start) cursor++;
		const candidate = after[cursor];
		if (!candidate || candidate.start !== start || candidate.end !== end) continue;
		if (String(rows[cursor].raw || '') !== String(source.raw || '')) continue;
		proven.set(cursor, source.id);
		cursor++;
	}
	return proven;
}

export { _rapierBodySegmentSpans, _rapierStableBlockIdentityKey, _rapierProvenSegmentMatches, _rapierSplicedSegmentMatches };
