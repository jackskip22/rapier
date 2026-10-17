// SPDX-License-Identifier: AGPL-3.0-only
import {isNoteFile, parseIndex} from './model.mjs';
import {exactBytes} from './integrity.mjs';
import {isDeletePrivateName, deleteIdleScratch} from './delete-intent.mjs';
export const BACKUP_CHUNK_BYTES = 64 * 1024;
export const check = signal => { if (signal?.aborted) throw signal.reason || new Error('backup was canceled'); };
const temporary = name => /^\..*\.tmp$/.test(name);

export function backupLimitError(names, reason) {
	const notes = names.filter(name => !name.includes('/') && isNoteFile(name)).length;
	if (notes === 1) reason = reason.replace(/^need /, 'needs ').replace(/^have /, 'has ');
	return Object.assign(new Error('Your ' + notes.toLocaleString('en') + (notes === 1 ? ' note ' : ' notes ') + reason
		+ '. No backup was made, and your notes are unchanged.'), {name: 'BackupLimitError'});
}

async function recoveryBytes(store, name) {
	if (typeof store.readBytes === 'function') {
		const bytes = await store.readBytes(name);
		if (bytes != null && (!(bytes instanceof Uint8Array) || bytes.length > 64 * 1024 * 1024)) throw new Error('deletion scratch cannot be verified within its bounded capacity');
		return bytes;
	}
	const file = await store.backupFile(name, {stream: true}); if (!file) return null;
	if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > 64 * 1024 * 1024) throw new Error('deletion scratch cannot be verified within its bounded capacity');
	if (typeof file.arrayBuffer === 'function') {
		const bytes = exactBytes(await file.arrayBuffer());
		if (bytes.length !== file.size) throw new Error('deletion scratch changed while being read');
		return bytes;
	}
	const bytes = new Uint8Array(file.size); let offset = 0;
	for await (const chunk of file.chunks({chunkBytes: BACKUP_CHUNK_BYTES})) { const part = exactBytes(chunk); if (part.length > bytes.length - offset) throw new Error('deletion scratch changed while being read'); bytes.set(part, offset); offset += part.length; }
	if (offset !== bytes.length) throw new Error('deletion scratch ended before its reported size');
	return bytes;
}
async function* paths(store) {
	const top = await store.list(); let scratch = new Set();
	if (top.some(isDeletePrivateName)) {
		const bytes = await recoveryBytes(store, 'notes.json');
		if (bytes == null) throw new Error('deletion scratch has no owning notes index');
		scratch = await deleteIdleScratch(parseIndex(new TextDecoder('utf-8', {fatal: true}).decode(bytes)), top, name => recoveryBytes(store, name));
	}
	for (const name of top) if (!temporary(name) && !scratch.has(name)) yield name;
	for (const name of await store.attachmentNames()) if (!temporary(name)) yield 'attachments/' + name;
	for (const name of await store.audioNames()) if (!temporary(name)) yield 'audio/' + name;
	for (const sub of ['manifests', 'texts', 'blobs']) {
		for (const name of await store.historyNames(sub)) if (!temporary(name)) yield 'history/' + sub + '/' + name;
	}
	for (const name of await store.importReceiptNames()) if (!temporary(name)) yield 'imports/' + name;
	for (const name of await store.thumbNames()) if (!temporary(name)) yield 'thumbs/' + name;
}

export async function backupInventory(store, {signal, onProgress, concurrency = 1} = {}) {
	if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new RangeError('backup inventory concurrency must be within 1..4');
	check(signal);
	const names = await backupNames(store, {signal}), limit = 65534;
	if (names.length + 1 > limit) throw backupLimitError(names, 'need ' + (names.length + 1).toLocaleString('en')
		+ ' files counting history and saved files; one backup holds ' + limit.toLocaleString('en'));
	const rows = [];
	for (let at = 0; at < names.length; at += concurrency) {
		check(signal);
		const batch = await Promise.allSettled(names.slice(at, at + concurrency).map(async name => {
			check(signal);
			const file = await store.backupFile(name, {stream: true});
			if (!file || !Number.isSafeInteger(file.size) || file.size < 0) throw new Error('a backup file disappeared: ' + name);
			return {name, size: file.size, modified: file.lastModified || 0, file};
		}));
		check(signal);
		for (const result of batch) {
			if (result.status === 'rejected') throw result.reason;
			rows.push(result.value);
			onProgress?.({phase: 'Reading folder', files: rows.length});
		}
	}
	check(signal);
	return rows;
}
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
