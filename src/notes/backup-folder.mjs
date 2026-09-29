// SPDX-License-Identifier: AGPL-3.0-only
import {isNoteFile} from './model.mjs';
export const BACKUP_CHUNK_BYTES = 64 * 1024;
export const check = signal => { if (signal?.aborted) throw signal.reason || new Error('backup was cancelled'); };
const temporary = name => /^\..*\.tmp$/.test(name);

export function backupLimitError(names, reason) {
	const notes = names.filter(name => !name.includes('/') && isNoteFile(name)).length;
	if (notes === 1) reason = reason.replace(/^need /, 'needs ').replace(/^have /, 'has ');
	return Object.assign(new Error('Your ' + notes.toLocaleString('en') + (notes === 1 ? ' note ' : ' notes ') + reason
		+ '. No backup was made, and your notes are unchanged.'), {name: 'BackupLimitError'});
}

async function* paths(store) {
	for (const name of await store.list()) if (!temporary(name)) yield name;
	// Required, not optional: a store without attachment enumeration cannot certify a backup.
	for (const name of await store.attachmentNames()) if (!temporary(name)) yield 'attachments/' + name;
	for (const name of await store.audioNames()) if (!temporary(name)) yield 'audio/' + name;
	for (const sub of ['manifests', 'texts', 'blobs']) {
		for (const name of await store.historyNames(sub)) if (!temporary(name)) yield 'history/' + sub + '/' + name;
	}
	for (const name of await store.thumbNames()) if (!temporary(name)) yield 'thumbs/' + name;
}

// The caller holds folder.backupSnapshot through inventory and all streamed passes.
// Only the store owns paths; global order comes from backupNames.
export async function backupInventory(store, {signal, onProgress} = {}) {
	check(signal);
	const names = await backupNames(store, {signal}), limit = 65534;
	// Count directory names before acquiring any File/native stat; reserve the generated manifest.
	// Do not lower this to an import UI budget: a complete ZIP is still a person's backup.
	if (names.length + 1 > limit) throw backupLimitError(names, 'need ' + (names.length + 1).toLocaleString('en')
		+ ' files counting history and saved files; one backup holds ' + limit.toLocaleString('en'));
	const rows = [];
	for (const name of names) {
		check(signal);
		const file = await store.backupFile(name, {stream: true});
		if (!file || !Number.isSafeInteger(file.size) || file.size < 0) throw new Error('a backup file disappeared: ' + name);
		rows.push({name, size: file.size, modified: file.lastModified || 0, file});
		onProgress?.({phase: 'Reading folder', files: rows.length});
	}
	return rows;
}
// Names additionally catch foreign filesystem changes outside Rapier's writer lease.
export async function backupNames(store, {signal} = {}) {
	const names = [];
	for await (const name of paths(store)) { check(signal); names.push(name); }
	return names.sort();
}

export async function* folderBackupSource(store, {inventory, stamp, signal, chunkBytes = BACKUP_CHUNK_BYTES} = {}) {
	if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > BACKUP_CHUNK_BYTES) throw new Error('backup chunk bound is outside 1..65536');
	for (const row of inventory || await backupInventory(store, {signal})) {
		check(signal);
		yield {
			name: row.name, size: row.size, modified: row.modified || stamp,
			async *chunks() {
				check(signal);
				const file = row.file || await store.backupFile(row.name, {stream: true});
				if (!file || file.size !== row.size || (file.lastModified || 0) !== row.modified) throw new Error('a backup file changed: ' + row.name);
				if (typeof file.chunks === 'function') {
					let size = 0;
					for await (const bytes of file.chunks({chunkBytes, signal})) { check(signal); size += bytes.length; yield bytes; }
					if (size !== row.size) throw new Error('a backup file was truncated: ' + row.name);
					return;
				}
				for (let at = 0; at < file.size; at += chunkBytes) {
					check(signal);
					const bytes = new Uint8Array(await file.slice(at, Math.min(file.size, at + chunkBytes)).arrayBuffer());
					if (bytes.length !== Math.min(chunkBytes, file.size - at)) throw new Error('a backup file was truncated: ' + row.name);
					yield bytes;
				}
			}
		};
	}
}
