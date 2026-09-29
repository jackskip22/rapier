// SPDX-License-Identifier: AGPL-3.0-only
import {zipEntries, ZIP_READ_MAX_BYTES, ZIP_MAX_ENTRIES, zipAdmissionError} from './zip.mjs';
export const ZIP_NESTING_LIMIT = 2;

// Root + delivery/workspace + per-note. A fourth archive is named, never silently skipped.
export async function* walkZipEntries(source, options = {}) {
	const {name = '(picked archive)', maxDepth = ZIP_NESTING_LIMIT, maxBytes = ZIP_READ_MAX_BYTES, maxEntries = ZIP_MAX_ENTRIES} = options;
	if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > ZIP_NESTING_LIMIT) throw new RangeError('readZip: nesting limit must be an integer from 0 to 2');
	if (![maxBytes, maxEntries].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('readZip: admission bounds must be nonnegative safe integers');
	if (typeof name !== 'string' || !name || name.length > 1024) throw new TypeError('readZip: archive provenance needs a bounded name');
	const byteLimit = Math.min(maxBytes, ZIP_READ_MAX_BYTES), entryLimit = Math.min(maxEntries, ZIP_MAX_ENTRIES);
	let bytes = 0, entries = 0;
	async function* visit(value, chain, depth) {
		const directory = [];
		for await (const entry of zipEntries(value, {...options, maxBytes:byteLimit - bytes, maxEntries:entryLimit - entries})) directory.push(entry);
		// A claimed snapshot keeps its members opaque, including archive attachments. A marker is
		// not authentication: it never raises admission budgets; verifyBackup must still check all bytes.
		const whole = options.wholeArchiveMarker && directory.some(entry => entry.name === options.wholeArchiveMarker);
		for (const entry of directory) {
			const path = [...chain, entry.name], label = path.join('!');
			if (++entries > entryLimit) throw zipAdmissionError('entries', `readZip: "${label}" exceeds the ${entryLimit}-entry nested admission bound`);
			if (entry.size > byteLimit - bytes) throw zipAdmissionError('bytes', `readZip: "${label}" exceeds the ${byteLimit}-byte nested inflated-size bound`);
			bytes += entry.size;
			if (!whole && /\.(?:zip|textpack)$/i.test(entry.name) && typeof entry.source === 'function') {
				if (depth >= maxDepth) throw new Error(`readZip: nesting limit ${maxDepth} exceeded at "${label}"`);
				yield* visit(await entry.source(), path, depth + 1);
			} else if (whole && entry.oversize && typeof entry.source === 'function') {
				// Stored bytes are a view through the source already held, not another inflated allocation.
				yield {name:entry.name, archivePath:chain.slice(), bytes:await (await entry.source()).read(0, entry.size)};
			} else if (entry.oversize) yield {name:entry.name, size:entry.size, oversize:true, archivePath:chain.slice()};
			else yield {name:entry.name, archivePath:chain.slice(), bytes:await entry.read()};
		}
	}
	yield* visit(source, [name], 0);
	return {entries, inflatedBytes:bytes, maxDepth};
}
