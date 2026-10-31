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
	if (!FOLDERS.has(prefix)) throw Object.assign(new Error('This folder is not part of Notes.'), {code: 'name'});
	const wanted = names ? new Set(names) : null, active = new Set(), stats = [];
	let failure;
	try {
		let dir = directory;
		for (const part of prefix ? prefix.split('/') : []) dir = await dir.getDirectoryHandle(part);
		for await (const [name, handle] of dir) {
			if (failure) throw failure;
			if (handle.kind !== 'file' || wanted && !wanted.has(name)) continue;
			const at = stats.length; stats.push(null);
			const work = Promise.resolve().then(() => handle.getFile()).then(
				file => { stats[at] = [name, stampFor(file)]; }
			).catch(error => { failure ||= error; }).finally(() => active.delete(work));
			active.add(work);
			if (active.size === 64) await Promise.race(active);
		}
	} catch (error) { failure ||= error; }
	await Promise.all(active);
	if (failure) { if (prefix && failure.name === 'NotFoundError') return new Map(); throw failure; }
	return new Map(stats);
}
