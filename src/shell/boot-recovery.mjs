// SPDX-License-Identifier: AGPL-3.0-only
import {_rapierSelectRestoreCandidate, _rapierRecoveryBomManifest, _rapierRecoveryStateFields} from '../editor/recovery-policy.mjs';
import {crc32} from '../images/crc32.mjs';
import {sha256State} from '../notes/integrity.mjs';
import {dosDateTime, localHeader, centralHeader, dataDescriptor, endRecord, commentBytes} from '../notes/zip-records.mjs';
import {BACKUP_MANIFEST_FILE, backupHeader, backupManifestBytes} from '../notes/backup-format.mjs';

export const scope = (() => {
	try { if (!/^https?:$/.test(location.protocol)) return ''; const dir = new URL('.', location.href).pathname; return dir === '/' ? '' : '@' + dir; }
	catch (_) { return ''; }
})();
const encoder = new TextEncoder();
const message = error => String(error?.message || error);
const missing = error => error?.name === 'NotFoundError';
const heldSlot = slot => slot === 'current:held' || String(slot || '').startsWith('current:held:');
const folders = ['', 'attachments', 'audio', 'history/manifests', 'history/texts', 'history/blobs', 'imports', 'thumbs'];
const admittedPath = name => typeof name === 'string' && !/[\\\0]/.test(name) && !name.startsWith('/') && !/^[a-z]:/i.test(name)
	&& name.split('/').every(part => part && part !== '.' && part !== '..');
const retainedPath = name => {
	if (!admittedPath(name)) return false;
	const slash = name.lastIndexOf('/'), folder = slash < 0 ? '' : name.slice(0, slash), base = name.slice(slash + 1);
	return folders.includes(folder) && !/^\..*\.tmp$/.test(base) && (folder !== 'audio' || !/^[.]|[\u0000-\u001f\u007f]/.test(base));
};

function matches(expected, text) {
	if (!expected || typeof text !== 'string' || Number(expected.chars) !== text.length) return false;
	let fnv = 0x811c9dc5, a = 1, b = 0;
	for (let at = 0; at < text.length;) {
		const end = Math.min(at + 4096, text.length);
		for (; at < end; at++) { const code = text.charCodeAt(at); fnv = Math.imul(fnv ^ code, 16777619); a += code; b += a; }
		a %= 65521; b %= 65521;
	}
	return String(expected.fnv) === (fnv >>> 0).toString(36) && String(expected.adler) === (((b << 16) | a) >>> 0).toString(36);
}
function stateMatches(row) {
	if (!Number.isSafeInteger(row.generation) || row.generation < 0 || !Number.isSafeInteger(row.documentRevision)
		|| row.documentRevision < 0 || !Number.isSafeInteger(row.nextBlockId) || row.nextBlockId < 1
		|| !(row.savedGeneration === null || Number.isSafeInteger(row.savedGeneration) && row.savedGeneration >= -1)) return false;
	return matches(row.stateIntegrity, _rapierRecoveryStateFields(row));
}
function candidate(row, kind) {
	if (!row || row.docId !== 'current' || String(row.documentAuthority || '').startsWith('notes:')) return null;
	const held = heldSlot(row.slot);
	if (row.integritySchema !== (kind === 'local' || held ? 5 : 4)) return null;
	const text = kind === 'local' ? row.markdown : row.canonicalText;
	if (typeof text !== 'string' || /[\uD800-\uDFFF]/u.test(text)) return null;
	if (kind === 'local' && row.charCount !== text?.length) return null;
	if (!matches(kind === 'idb' ? row.canonicalIntegrity : row.integrity, text)) return null;
	if (!held && !stateMatches(row)) return null;
	if ((row.bom !== undefined || row.bomIntegrity !== undefined)
		&& (typeof row.bom !== 'boolean' || !matches(row.bomIntegrity, _rapierRecoveryBomManifest(row)))) return null;
	return {...row, kind, text, filename: String(row.filename || 'recovered.md'), verified: true, metadataVerified: true,
		documentAuthority: matches(row.authorityIntegrity, String(row.documentAuthority || '')) ? row.documentAuthority : '',
		generation: Number(row.generation || 0), ts: Number(row.updatedAt || row.ts || 0)};
}

async function openDatabase(name) {
	const factory = globalThis.indexedDB;
	if (!factory) throw new Error('This browser does not allow saved storage to be read.');
	return new Promise((resolve, reject) => {
		let request, settled = false, absent = false;
		const done = (error, db) => { if (settled) { db?.close(); return; } settled = true; clearTimeout(timer); error ? reject(error) : resolve(db); };
		const timer = setTimeout(() => done(new Error('Saved storage did not answer. Close other Rapier tabs and try again.')), 5000);
		(async () => {
			if (typeof factory.databases === 'function' && !(await factory.databases()).some(row => row.name === name)) return done(null, null);
			request = factory.open(name);
			request.onupgradeneeded = () => { absent = true; request.transaction.abort(); };
			request.onsuccess = () => done(null, request.result);
			request.onerror = () => absent ? done(null, null) : done(request.error || new Error('Saved storage could not be read.'));
			request.onblocked = () => done(new Error('Saved storage is held by another tab. Close it and try again.'));
		})().catch(done);
	});
}
function readRecords(db, tables) {
	return new Promise((resolve, reject) => {
		const result = {}, names = Object.keys(tables), tx = db.transaction(names.length === 1 ? names[0] : names, 'readonly');
		for (const name of names) {
			const store = tx.objectStore(name), keys = tables[name];
			if (keys === null) {
				const list = store.getAllKeys();
				list.onsuccess = () => { result[name] = new Map(); for (const key of list.result) {
					if (key === 'current:seen' || typeof key === 'string' && key.startsWith('\0')) continue;
					const request = store.get(key); request.onsuccess = () => result[name].set(key, request.result);
				} };
			} else {
				result[name] = new Map();
				for (const key of keys) { const request = store.get(key); request.onsuccess = () => result[name].set(key, request.result); }
			}
		}
		tx.oncomplete = () => resolve(result);
		tx.onerror = tx.onabort = () => reject(tx.error || new Error('Saved storage could not be read.'));
	});
}
function downloadName(value, occupied) {
	let name = String(value || 'recovered.md').replace(/[\\/<>:"|?*\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '_')
		.replace(/^\.+|[ .]+$/g, '').slice(0, 240);
	if (!name.trim() || /^\.+$/.test(name)) name = 'recovered.md';
	if (!/\.md$/i.test(name)) name += '.md';
	let numbered = name, number = 2;
	while (occupied.has(numbered.toLowerCase())) numbered = name.slice(0, -3) + '-' + number++ + '.md';
	occupied.add(numbered.toLowerCase()); return numbered;
}
async function drafts(errors, publish) {
	const values = [], embedded = [], artifacts = new Map();
	try {
		const raw = localStorage.getItem('rapier:recovery:snapshot' + scope);
		if (raw) { const row = candidate(JSON.parse(raw), 'local'); if (row) values.push(row); else errors.push('The safety draft failed its stored integrity check.'); }
	} catch (error) { errors.push('Safety draft: ' + message(error)); }
	try {
		const storage = globalThis.sessionStorage, prefix = 'rapier:embed:draft' + scope + ':';
		for (let at = 0; at < (storage?.length || 0); at++) {
			const key = storage.key(at); if (!key?.startsWith(prefix)) continue;
			try {
				const row = JSON.parse(storage.getItem(key));
				const manifest = JSON.stringify([row.integritySchema, row.baseRevision, row.content, row.filename, row.docKind,
					row.generation, row.savedGeneration, row.nextBlockId, row.segmentIdentity, row.timestamp, row.ledger?.sha256]);
				if (row.integritySchema !== 2 || typeof row.content !== 'string' || /[\uD800-\uDFFF]/u.test(row.content) || !matches(row.integrity, manifest)) {
					throw new Error('The embedded draft failed its stored integrity check.');
				}
				embedded.push({key, filename: row.filename, text: row.content});
			} catch (error) { errors.push('Embedded draft: ' + message(error)); }
		}
	} catch (error) { errors.push('Embedded drafts: ' + message(error)); }
	const files = () => {
		const groups = new Map(), held = [];
		for (const row of values) {
			if (heldSlot(row.slot)) { held.push(row); continue; }
			const key = row.documentAuthority || row.slot || 'current';
			if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row);
		}
		const selected = [...groups.values()].flatMap(candidates => {
			const {candidate: selected} = _rapierSelectRestoreCandidate({candidates, idb: {valid: true}, idbEvidence: false});
			return [selected, ...candidates.filter(row => row !== selected && row.generation === selected.generation)];
		});
		selected.push(...held); selected.sort((a, b) => b.ts - a.ts);
		const occupied = new Set(), seen = new Set(), result = [];
		for (const row of [...selected, ...embedded]) {
			const identity = (row.key || '') + '\0' + row.filename + '\0' + (row.bom === true ? '\ufeff' : '') + row.text;
			if (seen.has(identity)) continue; seen.add(identity);
			const name = downloadName(row.filename, occupied);
			if (artifacts.get(identity)?.name !== name) artifacts.set(identity, {name,
				blob: new Blob([row.bom === true ? '\ufeff' : '', row.text], {type: 'text/markdown;charset=utf-8'})});
			result.push(artifacts.get(identity));
		}
		return result;
	};
	publish(files());
	let db;
	try {
		db = await openDatabase('rapier:recovery' + scope);
		if (db) {
			const saved = await readRecords(db, {meta: ['current'], checkpoints: null});
			for (const [kind, rows] of [['idb', saved.meta], ['checkpoint', saved.checkpoints]]) for (const record of rows.values()) {
				if (!record) continue;
				if (record.canonicalText instanceof Blob) try {
					record.canonicalText = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(await record.canonicalText.arrayBuffer());
				} catch (_) { errors.push('A saved draft failed its stored integrity check: ' + String(record.filename || 'recovered.md')); continue; }
				const row = candidate(record, kind);
				if (row) values.push(row);
				else if (typeof record.canonicalText === 'string') errors.push('A saved draft failed its stored integrity check: ' + String(record.filename || 'recovered.md'));
			}
		}
	} catch (error) { errors.push('Drafts: ' + message(error)); }
	finally { db?.close(); }
	const result = files(); publish(result); return result;
}

async function directoryFiles(publish) {
	if (!navigator.storage?.getDirectory) return null;
	let directory;
	try { directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('notes', {create: false}); }
	catch (error) { if (missing(error)) return null; throw error; }
	const files = [];
	for (const folder of folders) {
		let dir = directory;
		try { for (const part of folder.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(part, {create: false}); }
		catch (error) { if (missing(error)) continue; throw error; }
		for await (const [base, handle] of dir) {
			const name = (folder ? folder + '/' : '') + base;
			if (handle.kind !== 'file' || !retainedPath(name)) continue;
			const file = {name, read: () => handle.getFile()}; files.push(file); publish?.(file);
		}
	}
	return files;
}
async function databaseFiles(publish) {
	const db = await openDatabase('rapier-notes-preview');
	if (!db) return [];
	try {
		const names = await new Promise((resolve, reject) => {
			const tx = db.transaction('bytes', 'readonly'), request = tx.objectStore('bytes').getAllKeys();
			tx.oncomplete = () => resolve(request.result);
			tx.onerror = tx.onabort = () => reject(tx.error || new Error('Saved Notes could not be listed.'));
		});
		return names.filter(retainedPath).map(name => {
			const file = {name, read: () => databaseFile(name)}; publish?.(file); return file;
		});
	} finally { db.close(); }
}
async function databaseFile(name) {
	const db = await openDatabase('rapier-notes-preview');
	if (!db) throw new Error('The saved Notes file is unavailable: ' + name);
	try {
		const value = (await readRecords(db, {bytes: [name]})).bytes.get(name);
		if (value instanceof Uint8Array) return new Blob([value]);
		const chunked = value?.type === 'chunks', recording = value?.kind === 'rapier-recording-chunks';
		if (!chunked && !recording) throw new Error('A saved Notes file has an unreadable record: ' + name);
		if (!Number.isSafeInteger(value.size) || value.size < 0 || !Number.isSafeInteger(value.count) || value.count < 0
			|| (chunked && (value.chunkBytes !== 1048576 || value.count !== Math.ceil(value.size / 1048576) || !/^[A-Za-z0-9-]{1,80}$/.test(value.id) || !/^[a-f0-9]{64}$/.test(value.digest)))
			|| (recording && (value.version !== 1 || value.size < value.count))) throw new Error('A saved Notes file is incomplete: ' + name);
		const prefix = chunked ? '\0rapier-file:' + value.id + ':' : '\0rapier-recording:' + name + ':';
		const chunks = [], hash = sha256State(); let size = 0;
		for (let at = 0; at < value.count; at++) {
			const bytes = (await readRecords(db, {bytes: [prefix + at]})).bytes.get(prefix + at);
			if (!(bytes instanceof Uint8Array) || !bytes.length || (chunked && bytes.length !== Math.min(1048576, value.size - size))) throw new Error('A saved Notes chunk is missing: ' + name);
			hash.update(bytes); chunks.push(bytes); size += bytes.length;
		}
		if (size !== value.size) throw new Error('A saved Notes file is incomplete: ' + name);
		if (chunked && hash.finish() !== value.digest) throw new Error('A saved Notes file failed integrity verification: ' + name);
		return new Blob(chunks);
	} finally { db.close(); }
}
async function notesArchive(files, {appVersion, stamp}, errors) {
	if (!files.length) return null;
	files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	if (files.length >= 65534) throw new Error('The saved Notes folder exceeds the file count of one ZIP.');
	let header;
	try {
		const file = files.find(row => row.name === 'notes.json');
		if (!file) throw new Error('Notes has no saved index.');
		if (files.some(row => row.name === BACKUP_MANIFEST_FILE)) throw new Error('The folder already contains a backup manifest.');
		const index = JSON.parse(new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(await file.blob.arrayBuffer()).replace(/^\ufeff/, ''));
		if (index?.version !== 1 || !index.notes || typeof index.notes !== 'object' || Array.isArray(index.notes)) throw new Error('The Notes index could not be read.');
		if (index.transaction || Object.keys(index.deletions || {}).length) throw new Error('Notes has an unfinished folder transaction.');
		if (Object.keys(index.notes).some(name => !files.some(file => file.name === name))) throw new Error('The Notes index names an unavailable file.');
		header = backupHeader(index, {appVersion, stamp});
	} catch (error) { errors.push(message(error) + ' The export keeps the raw folder files.'); }
	const parts = [], central = [], digests = [], comment = commentBytes('Rapier notes backup, ' + files.length + ' files, ' + new Date(stamp).toISOString(), encoder);
	let offset = 0;
	const put = part => { offset += part.size ?? part.length; if (offset > 0xffffffff) throw new Error('The saved Notes folder exceeds the size of one ZIP.'); parts.push(part); };
	for (const file of files) {
		const nameBytes = encoder.encode(file.name);
		if (nameBytes.length > 65535) throw new Error('A saved Notes filename exceeds the ZIP limit.');
		const f = {nameBytes, size: file.blob.size, crc: 0, descriptor: true, ...dosDateTime(file.modified || stamp)}, at = offset;
		const hash = sha256State();
		put(localHeader(f)); put(nameBytes);
		for (let start = 0; start < file.blob.size; start += 65536) {
			const bytes = new Uint8Array(await file.blob.slice(start, Math.min(file.blob.size, start + 65536)).arrayBuffer());
			if (bytes.length !== Math.min(65536, file.blob.size - start)) throw new Error('A saved Notes file changed during export: ' + file.name);
			f.crc = crc32(bytes, f.crc); hash.update(bytes); put(bytes);
		}
		put(dataDescriptor(f)); central.push(centralHeader(f, at), nameBytes);
		digests.push({name: file.name, bytes: file.blob.size, sha256: hash.finish()});
	}
	if (header) {
		const bytes = backupManifestBytes({...header, files: digests}), nameBytes = encoder.encode(BACKUP_MANIFEST_FILE);
		const f = {nameBytes, size: bytes.length, crc: crc32(bytes), ...dosDateTime(stamp)}, at = offset;
		put(localHeader(f)); put(nameBytes); put(bytes); central.push(centralHeader(f, at), nameBytes);
	}
	const start = offset; for (const part of central) put(part);
	put(endRecord(files.length + (header ? 1 : 0), offset - start, start, comment.length)); put(comment);
	return {name: 'rapier-notes-' + new Date(stamp).toISOString().replace(/[:.]/g, '-') + '.zip', blob: new Blob(parts, {type: 'application/zip'})};
}
function notesRead(read) {
	if (navigator.locks?.request) return navigator.locks.request('rapier-notes:notes', {mode: 'shared', ifAvailable: true}, lock => {
		if (!lock) throw new Error('Notes is open in another tab. Close it and try again.'); return read();
	});
	return read();
}
async function notes(options, errors, publish) {
	const backends = [directoryFiles, databaseFiles].map(load => ({load, notes: [], archives: []})), occupied = new Set();
	let archiveNumber = 0;
	const result = () => ({notes: backends.flatMap(row => row.notes), archives: backends.flatMap(row => row.archives)});
	await Promise.allSettled(backends.map(async backend => {
		try { await notesRead(async () => {
			const {load} = backend, listed = new Set();
			const expose = (file, index = null) => {
				const name = file.name;
				if (listed.has(name) || name.includes('/') || !(name.toLowerCase().endsWith('.md') || !name.startsWith('.') &&
					name !== 'notes.json' && name !== BACKUP_MANIFEST_FILE && Object.hasOwn(index?.notes || {}, name))) return;
				listed.add(name); backend.notes.push({name: downloadName(name, occupied), read: () => notesRead(file.read)});
				publish(result());
			};
			const files = await load(expose);
			if (!files?.length) return;
			const number = ++archiveNumber;
			backend.archives.push({
				name: 'rapier-notes-' + new Date(options.stamp).toISOString().replace(/[:.]/g, '-') + (number > 1 ? '-' + number : '') + '.zip',
				read: () => notesRead(async () => {
					const entries = [];
					for (const file of await load() || []) {
						const blob = await file.read();
						entries.push({name: file.name, blob, modified: blob.lastModified || 0});
					}
					if (!entries.length) throw new Error('The Notes folder changed. Read saved work again.');
					return (await notesArchive(entries, options, errors)).blob;
				}),
			});
			publish(result());
			const sidecar = files.find(file => file.name === 'notes.json');
			if (sidecar) {
				try {
					const index = JSON.parse(await (await sidecar.read()).text());
					if (index?.version !== 1 || !index.notes || typeof index.notes !== 'object' || Array.isArray(index.notes)) {
						throw new Error('The Notes index could not be read.');
					}
					for (const file of files) expose(file, index);
				} catch (error) { errors.push('Notes: ' + message(error)); }
			}
		}); } catch (error) { errors.push('Notes: ' + message(error)); }
		finally { publish(result()); }
	}));
	return result();
}
export async function collect({stamp = Date.now(), appVersion = globalThis.document?.querySelector('meta[name="rapier-version"]')?.content || 'unknown', onUpdate} = {}) {
	const errors = [], result = {drafts: [], notes: [], archives: [], errors, pending: true};
	const publish = () => { if (typeof onUpdate === 'function') onUpdate({...result}); };
	let native = false;
	try {
		native = typeof window !== 'undefined' && !!window.RapierHost;
		if (globalThis.RapierPlatform?.recovery?.ownsStore === true || native && typeof globalThis.RapierPlatform?.files?.exportArtifact !== 'function') {
			result.kept = 'Your saved work stays in this app. Restart Rapier to try again.'; result.pending = false; publish(); return result;
		}
		if (globalThis.RAPIER_APPS_HOST === true || globalThis.__rapierServerRenderHost === true || typeof window !== 'undefined' && window.top !== window) {
			errors.push('Open Rapier directly in this browser to recover its saved work.'); result.pending = false; publish(); return result;
		}
	} catch (_) { errors.push('Saved work cannot be read in this host.'); result.pending = false; publish(); return result; }
	const outcomes = await Promise.allSettled([
		drafts(errors, rows => { result.drafts = rows; publish(); }),
		native ? Promise.resolve({notes: [], archives: []}) : notes({stamp, appVersion}, errors, rows => { Object.assign(result, rows); publish(); }),
	]);
	for (let index = 0; index < outcomes.length; index++) {
		const outcome = outcomes[index];
		if (outcome.status === 'fulfilled') {
			if (index) Object.assign(result, outcome.value); else result.drafts = outcome.value;
		}
		else errors.push((index ? 'Notes: ' : 'Drafts: ') + message(outcome.reason));
	}
	if (native) result.kept = result.drafts.length ? 'Your notes stay in this app. Save your unsaved drafts, then restart Rapier.'
		: 'Your saved work stays in this app. Restart Rapier to try again.';
	result.pending = false; publish(); return result;
}
