// SPDX-License-Identifier: AGPL-3.0-only

const integer = n => Number.isSafeInteger(n) && n >= 0;
export function stampsMatch(a, b) {
	return !!a && !!b && integer(a.size) && integer(b.size) && integer(a.modified) && integer(b.modified) &&
		a.size === b.size && a.modified === b.modified;
}
export function stampFor(file) {
	const size = file?.size, modified = file?.lastModified ?? file?.modified;
	return integer(size) && integer(modified) ? {size, modified} : null;
}
export function stampDurable(stamp, observedAt) {
	return !!stamp && integer(stamp.size) && integer(stamp.modified) && integer(observedAt) && stamp.modified < observedAt;
}

export function planIndexReuse(folder, stored) {
	if (!Array.isArray(folder)) throw new TypeError('planIndexReuse needs the folder walk as an array');
	const rows = stored instanceof Map ? stored : new Map(stored || []);
	const reuse = [], reread = [], seen = new Set();
	for (const entry of folder) {
		const file = entry?.file;
		if (typeof file !== 'string' || !file) throw new TypeError('every folder row needs its file name');
		if (seen.has(file)) throw new TypeError('the folder walk repeats a file: ' + file);
		seen.add(file);
		const row = rows.get(file);
		if (row && row.projection && stampsMatch(entry, row)) reuse.push({file, projection: row.projection, size: row.size, modified: row.modified});
		else reread.push(file);
	}
	const drop = [];
	for (const file of rows.keys()) if (!seen.has(file)) drop.push(file);
	return {reuse, reread, drop, total: folder.length, reused: reuse.length};
}

export function verifyOrder(reuse, limit = 0) {
	if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError('verify limit must be a nonnegative safe integer');
	if (!limit) return [];
	return reuse.slice().sort((a, b) => a.modified - b.modified || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
		.slice(0, limit).map(row => row.file);
}
