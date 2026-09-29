// SPDX-License-Identifier: AGPL-3.0-only
// Pure. THE INVARIANT: a projection is reused only if size and modified both equal the recorded stamp; anything else is read afresh.
// A cache, never a second index. Stamps collide within one clock tick (D07), so a row is EARNED only once the observer's clock has
// passed `modified` (stampDurable). A backwards clock or a future mtime never earns a row.

const integer = n => Number.isSafeInteger(n) && n >= 0;
// One place, and one place only, where "the folder still agrees about this file" is decided.
// Both halves must be present and identical. A row without a usable stamp is not a row.
export function stampsMatch(a, b) {
	return !!a && !!b && integer(a.size) && integer(b.size) && integer(a.modified) && integer(b.modified) &&
		a.size === b.size && a.modified === b.modified;
}
// null when either half is missing: "no stamp", always re-read.
export function stampFor(file) {
	const size = file?.size, modified = file?.lastModified ?? file?.modified;
	return integer(size) && integer(modified) ? {size, modified} : null;
}
// observedAt is REQUIRED (D09): a Date.now() default launders early bytes. Integer, non-negative.
export function stampDurable(stamp, observedAt) {
	return !!stamp && integer(stamp.size) && integer(stamp.modified) && integer(observedAt) && stamp.modified < observedAt;
}

// `folder`: [{file, size, modified}]. `stored`: Map or pairs of file -> {size, modified, projection}.
export function planIndexReuse(folder, stored) {
	if (!Array.isArray(folder)) throw new TypeError('planIndexReuse needs the folder walk as an array');
	const rows = stored instanceof Map ? stored : new Map(stored || []);
	const reuse = [], reread = [], seen = new Set();
	for (const entry of folder) {
		const file = entry?.file;
		if (typeof file !== 'string' || !file) throw new TypeError('every folder row needs its file name');
		// A folder that lists one name twice is not a folder this can reason about; refuse rather
		// than pick one, because picking one silently decides which bytes a person searches.
		if (seen.has(file)) throw new TypeError('the folder walk repeats a file: ' + file);
		seen.add(file);
		const row = rows.get(file);
		// The projection must actually be there. A row that remembers a stamp but not what was under
		// it would reuse nothing and claim it had.
		if (row && row.projection && stampsMatch(entry, row)) reuse.push({file, projection: row.projection, size: row.size, modified: row.modified});
		else reread.push(file);
	}
	// Anything the folder no longer lists leaves, and its postings leave with it -- a dropped note
	// that stays in the postings is a search hit on a note that is not there.
	const drop = [];
	for (const file of rows.keys()) if (!seen.has(file)) drop.push(file);
	return {reuse, reread, drop, total: folder.length, reused: reuse.length};
}

// Oldest modified first, bounded by `limit`. Advisory only.
export function verifyOrder(reuse, limit = 0) {
	if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError('verify limit must be a nonnegative safe integer');
	if (!limit) return [];
	return reuse.slice().sort((a, b) => a.modified - b.modified || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
		.slice(0, limit).map(row => row.file);
}
