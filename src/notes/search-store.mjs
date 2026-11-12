// SPDX-License-Identifier: AGPL-3.0-only

const integer = n => Number.isSafeInteger(n) && n >= 0;
export function stampsMatch(a, b) {
	return !!a && !!b && integer(a.size) && integer(b.size) && integer(a.modified) && integer(b.modified) &&
		a.size === b.size && a.modified === b.modified;
}
export function stampFor(file) {
	const size = file?.size, modified = file?.lastModified ?? file?.modified;
	return integer(size) && integer(modified) ? {size, modified, ...(contentIdFor(file) ? {contentId: file.contentId} : {})} : null;
}
export function contentIdFor(row) { return /^sha256:[a-f0-9]{64}$/.test(row?.contentId || '') ? row.contentId : null; }
export function stampDurable(stamp, observedAt) {
	return !!stamp && integer(stamp.size) && integer(stamp.modified) && integer(observedAt) && stamp.modified < observedAt;
}

function admitFolderEntry(entry, rows, seen, reuse, reread) {
	const file = entry?.file;
	if (typeof file !== 'string' || !file) throw new TypeError('every folder row needs its file name');
	if (seen.has(file)) throw new TypeError('the folder walk repeats a file: ' + file);
	seen.add(file);
	const row = rows.get(file);
	if (row && row.projection && contentIdFor(entry) && entry.contentId === contentIdFor(row) && stampsMatch(entry, row))
		reuse.push({file, projection: row.projection, size: row.size, modified: row.modified, contentId: row.contentId});
	else reread.push(file);
}
export async function planIndexReuse(folder, stored, {slice = 32, pause} = {}) {
	if (!Array.isArray(folder)) throw new TypeError('planIndexReuse needs the folder walk as an array');
	if (!(stored instanceof Map)) throw new TypeError('planIndexReuse needs the stored rows as a Map');
	const reuse = [], reread = [], seen = new Set();
	for (let i = 0; i < folder.length; i++) {
		if (typeof pause === 'function' && i && i % slice === 0) await pause();
		admitFolderEntry(folder[i], stored, seen, reuse, reread);
	}
	const drop = [], keys = [...stored.keys()];
	for (let i = 0; i < keys.length; i++) {
		if (typeof pause === 'function' && i && i % slice === 0) await pause();
		if (!seen.has(keys[i])) drop.push(keys[i]);
	}
	return {reuse, reread, drop, total: folder.length, reused: reuse.length};
}
