// SPDX-License-Identifier: AGPL-3.0-only
import {FOLDERS} from './opfs-paths.mjs';
import {stampFor} from './search-store.mjs';

export async function directoryEntries(directory, prefix = '') {
	if (!FOLDERS.has(prefix)) throw Object.assign(new Error('This folder is not part of Notes.'), {code: 'name'});
	let dir = directory;
	for (const part of prefix ? prefix.split('/') : []) dir = await dir.getDirectoryHandle(part);
	const entries = [];
	for await (const [name, handle] of dir) if (handle.kind === 'file') entries.push([name, handle]);
	return entries;
}

export async function directoryStamps(directory, prefix = '', names) {
	const wanted = names ? new Set(names) : null;
	try {
		const entries = (await directoryEntries(directory, prefix)).filter(([name]) => !wanted || wanted.has(name)), stats = [];
		for (let at = 0; at < entries.length; at += 64) {
			const settled = await Promise.allSettled(entries.slice(at, at + 64).map(async ([name, handle]) => [name, stampFor(await handle.getFile())]));
			const failed = settled.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
			stats.push(...settled.map(result => result.value));
		}
		return new Map(stats);
	} catch (error) { if (prefix && error?.name === 'NotFoundError') return new Map(); throw error; }
}
