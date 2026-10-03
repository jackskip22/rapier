// SPDX-License-Identifier: AGPL-3.0-only
// The notes folder's third byte store: OPFS -> IndexedDB -> memory. The order is ASKED once (ready()), never inferred from an error; a later fault
// is thrown and said. Never a fresh empty store over somebody's work (R85b): one library per (database, table) per page, never replaced.
// The database is the authority, not the Map (R87i I01): pages do not share module instances, and serialisation does not make stale evidence
// fresh, so every read goes to IndexedDB while one stands. BroadcastChannel is a hint only. A storage fault is never an empty answer (I02):
// a fault leaves the store unadmitted for writes and unopened databases refuse reads. Memory is the store only after an honest NO.
import {exactBytes, BYTE_CHUNK_BYTES, sha256State, blobByteChunks, digestByteChunks, checkByteAbort, byteCopyError} from './integrity.mjs';
import {isRecordingPartial, recordingStem, recordingStorageError} from './recording-files.mjs';
import {FOLDERS, parts} from './opfs-paths.mjs';

const fail = (code, message) => Object.assign(new Error(message), {code});

// A key no note can ever have: `parts` refuses a name containing NUL, so the probe can never
// collide with somebody's file and can never be listed as one.
const PROBE = '\u0000rapier-idb-probe';
const reserved = key => typeof key !== 'string' || key.startsWith('\u0000');

const same = (a, b) => a != null && b != null && a.length === b.length && a.every((n, i) => n === b[i]);

// ---- One library per database: created once, never replaced ----
const LIBRARIES = new Map();

function libraryFor(key) {
	let entry = LIBRARIES.get(key);
	if (!entry) { entry = {memory: new Map(), ready: null, db: null, durable: null, said: false, fault: null}; LIBRARIES.set(key, entry); }
	return entry;
}

// ---- IndexedDB, asked once ----------------------------------------------------------------------
function openDatabase(factory, database, table) {
	return new Promise((resolve, reject) => {
		let req;
		try { req = factory.open(database, 1); } catch (error) { reject(error); return; }
		req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(table)) db.createObjectStore(table); };
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error || fail('idb', 'the notes database could not be opened'));
		req.onblocked = () => reject(fail('idb', 'the notes database is held open by another tab'));
	});
}

// One transaction per act. `oncomplete` is what resolves a write: a request that succeeded inside a
// transaction that then aborted did NOT happen, and this must never tell the folder otherwise.
// A write is the person's work, never a cache: it asks strict durability, as recordings do.
function run(db, table, mode, act) {
	return new Promise((resolve, reject) => {
		let tx;
		try { tx = db.transaction(table, mode, mode === 'readwrite' ? {durability: 'strict'} : undefined); } catch (error) { reject(error); return; }
		let out, failed = null;
		try { out = act(tx.objectStore(table)); } catch (error) { failed = error; try { tx.abort(); } catch (_) {} }
		tx.onabort = () => reject(failed || tx.error || fail('idb', 'the notes database aborted'));
		tx.onerror = () => reject(failed || tx.error || fail('idb', 'the notes database refused'));
		tx.oncomplete = () => { if (failed) reject(failed); else resolve(out && typeof out === 'object' && 'result' in out ? out.result : out); };
	});
}

// Both requests on one transaction before either is awaited: names and bytes from one view (D07).
function readAll(db, table) {
	return new Promise((resolve, reject) => {
		let tx;
		try { tx = db.transaction(table, 'readonly'); } catch (error) { reject(error); return; }
		const os = tx.objectStore(table), keys = os.getAllKeys(); let names = [], values = [];
		// Keep the same transaction, but never getAll() the reserved payload chunks. A size
		// listing must not clone every large file into RAM just to discard it afterwards.
		keys.onsuccess = () => {
			names = (keys.result || []).filter(name => !reserved(name)); values = new Array(names.length);
			names.forEach((name, i) => { const r = os.get(name); r.onsuccess = () => { values[i] = r.result; }; });
		};
		tx.onabort = () => reject(tx.error);
		tx.onerror = () => reject(tx.error);
		tx.oncomplete = () => resolve([names, values]);
	});
}

// Names only: never pull every body to list a folder.
const readKeys = (db, table) => run(db, table, 'readonly', os => os.getAllKeys()).then(keys => keys || []);

// Whatever the database gave back, as bytes, or null when the name is simply not there. A record
// that is not bytes is not a note: it is passed over rather than guessed at.
const recordBytes = value => value instanceof Uint8Array ? value : null;

// A recording is one visible virtual file, with immutable chunks at NUL-prefixed private keys.
// No schema upgrade and no per-append whole-recording clone. Backup/read join exactly this file's
// rows in one transaction; the reserved chunk keys can never masquerade as notes or audio names.
const recordingKey = (name, n) => '\u0000rapier-recording:' + name + ':' + n;
const recordingHeader = value => {
	if (value?.kind !== 'rapier-recording-chunks') return null;
	if (value.version !== 1 || !Number.isSafeInteger(value.count) || value.count < 0 ||
		!Number.isSafeInteger(value.size) || value.size < value.count || (!value.count && value.size))
		throw fail('recording-corrupt', 'The unfinished recording could not be read; nothing was lost.');
	return value;
};
// Callback-issued requests remain inside the SAME IDB transaction. A request success is not an
// append acknowledgement: resolve only on transaction completion, requesting strict durability.
function recordingTransaction(db, table, mode, act) {
	return new Promise((resolve, reject) => {
		let tx, result, failed;
		try { tx = db.transaction(table, mode, mode === 'readwrite' ? {durability: 'strict'} : undefined); }
		catch (error) { reject(error); return; }
		const stop = error => { failed = error; try { tx.abort(); } catch (_) { reject(error); } };
		const take = (request, done) => { request.onsuccess = () => { try { done(request.result); } catch (error) { stop(error); } }; };
		tx.onabort = () => reject(failed || tx.error || fail('idb', 'The recording transaction was aborted.'));
		tx.onerror = () => reject(failed || tx.error || fail('idb', 'The recording transaction failed.'));
		tx.oncomplete = () => failed ? reject(failed) : resolve(result);
		try { act(tx.objectStore(table), take, value => { result = value; }); } catch (error) { stop(error); }
	});
}
function readRecording(db, table, name) {
	return recordingTransaction(db, table, 'readonly', (os, take, done) => take(os.get(name), value => {
		const header = recordingHeader(value);
		if (!header) { done(recordBytes(value)); return; }
		const chunks = new Array(header.count); let left = header.count;
		const join = () => {
			if (chunks.reduce((n, part) => n + part.length, 0) !== header.size) throw fail('recording-corrupt', 'The unfinished recording is incomplete; nothing was lost.');
			const bytes = new Uint8Array(header.size); let offset = 0;
			for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
			done(bytes);
		};
		if (!left) { join(); return; }
		for (let n = 0; n < header.count; n++) take(os.get(recordingKey(name, n)), part => {
			const bytes = recordBytes(part);
			if (!bytes?.length) throw fail('recording-corrupt', 'A recording chunk is missing. Its other chunks were kept.');
			chunks[n] = bytes; if (!--left) join();
		});
	}));
}

// A single public key names an immutable set of bounded rows. This is the byte adapter's
// storage layout, never Markdown syntax. Only the verified descriptor makes a file visible.
const chunkKey = (id, n) => '\u0000rapier-file:' + id + ':' + n;
function chunkRecord(value) {
	if (!value || value.type !== 'chunks') return null;
	if (typeof value.id !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(value.id) ||
		!Number.isSafeInteger(value.size) || value.size < 0 || value.chunkBytes !== BYTE_CHUNK_BYTES ||
		value.count !== Math.ceil(value.size / BYTE_CHUNK_BYTES) || !/^[0-9a-f]{64}$/.test(value.digest))
		throw fail('corrupt', 'A saved file could not be read; nothing was lost.');
	return value;
}

// @param {object} options @param {string} options.database default is the R87g preview mirror's, so an existing library is found.
// @param {string} options.table @param {object} options.factory default globalThis.indexedDB @param {Function} options.onFault
export function createIndexedDbByteStore({database = 'rapier-notes-preview', table = 'bytes', factory = undefined,
	beforeStep = async () => {}, afterStep = async () => {}, onFault = () => {}, token = () => crypto.randomUUID()} = {}) {
	const entry = libraryFor(database + '\u0000' + table);
	// Writable until prepare() finds a fault, for every store over this library.
	const say = (message, error) => {
		if (entry.said) return;
		entry.said = true;
		// A NEW error, never the caught one with its message rewritten: the fault that actually
		// happened keeps its own words, and rides along as the cause.
		try { onFault(Object.assign(new Error(message), {cause: error, code: 'preview'})); } catch (_) {}
	};
	// Stops admitting writes and says why; reads keep going to the database. `entry.said` is not consulted.
	const unadmit = (message, error) => {
		if (!entry.fault) {
			entry.fault = Object.assign(new Error(message), {cause: error, code: 'storage'});
			try { onFault(entry.fault); } catch (_) {}
		}
		return entry;
	};
	// The answer given once and never inferred from an error (the law at the head of this file), and
	// the one place it is decided. A page the browser gives no origin to, and a page with no
	// IndexedDB at all, CANNOT have this storage; everything else that goes wrong HAPPENED, and a
	// thing that happened is a fault, not a different store.
	const incapable = error => error?.name === 'SecurityError' || error?.code === 'no-idb';

	// THE ASK, once: `entry.ready` is the asking, so concurrent callers share one answer.
	const ready = () => entry.ready ||= (async () => {
		const idb = factory === undefined ? (typeof indexedDB === 'undefined' ? null : indexedDB) : factory;
		if (!idb) {
			entry.db = null; entry.durable = false;
			say('this page has no browser storage for notes, so they live in this page until it closes', fail('no-idb', 'no indexedDB on this page'));
			return entry;
		}
		let db = null;
		try {
			db = await openDatabase(idb, database, table);
			if (!db.objectStoreNames.contains(table)) throw fail('idb', 'the notes database has no place to keep the notes');
		} catch (error) {
			try { db?.close?.(); } catch (_) {}
			entry.db = null;
			// A database that could not be OPENED tells us nothing about what is inside it, so the
			// only safe reading of a fault here is "not this time" -- never "there is nothing there".
			if (!incapable(error)) return unadmit('this browser\'s own storage for notes could not be opened this time, so nothing new can be written until it can', error);
			entry.durable = false;
			say('the notes could not be kept in this browser\'s own storage, so they live in this page until it closes', error);
			return entry;
		}
		// Asked, not assumed: a database that opens but will not keep a byte is not a store.
		try {
			const probe = new Uint8Array([82, 97, 112, 105, 101, 114]);
			await run(db, table, 'readwrite', os => os.put(probe, PROBE));
			const back = await run(db, table, 'readonly', os => os.get(PROBE));
			if (!same(recordBytes(back), probe)) throw fail('idb', 'the notes database did not keep the bytes written to it');
			await run(db, table, 'readwrite', os => os.delete(PROBE));
		} catch (error) {
			// Opened: ask what it holds before calling it absent. A refused write over a standing library is a fault.
			let held = null;
			try { held = await readKeys(db, table); } catch (why) { entry.db = db; return unadmit('this browser\'s own storage for notes refused a write and could not be read either, so nothing new can be written until it can', why); }
			if (held.some(key => !reserved(key) || typeof key === 'string' && key.startsWith('\u0000rapier-recording:'))) { entry.db = db; return unadmit('this browser\'s own storage for notes refused a write while it still holds your notes, so nothing new can be written until it can', error); }
			// Nothing on the device to hide, and nothing durable on offer: memory is honestly the
			// last one standing, which is exactly what Notes did before this rung existed.
			try { db.close(); } catch (_) {}
			entry.db = null; entry.durable = false;
			say('the notes could not be kept in this browser\'s own storage, so they live in this page until it closes', error);
			return entry;
		}
		// Admitted. Nothing carried in at startup; absence is never written through (R87j N01).
		entry.db = db; entry.durable = true;
		return entry;
	})();
	// An unopened database answers no read; only true absence reads the Map (R85b).
	const readable = async () => {
		await ready();
		if (!entry.db && entry.fault) throw Object.assign(new Error(entry.fault.message), {code: 'storage', cause: entry.fault.cause});
	};

	// ---- Reading: the database whenever there is one, under the caller's lock ----
	const getRecord = async name => {
		parts(name); await beforeStep('read', name); await readable();
		if (!entry.db) return entry.memory.get(name);
		// Unfinished recordings (R5) and streamed files (R2) are descriptors over chunk rows.
		return isRecordingPartial(name) ? readRecording(entry.db, table, name) : run(entry.db, table, 'readonly', os => os.get(name));
	};
	async function* storedChunks(record, {signal, chunkBytes = BYTE_CHUNK_BYTES} = {}) {
		if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > BYTE_CHUNK_BYTES) throw fail('size', 'A file read needs a chunk size between 1 byte and 1 MiB.');
		for (let n = 0; n < record.count; n++) {
			checkByteAbort(signal);
			const bytes = recordBytes(await run(entry.db, table, 'readonly', os => os.get(chunkKey(record.id, n))));
			if (!bytes || bytes.length !== Math.min(BYTE_CHUNK_BYTES, record.size - n * BYTE_CHUNK_BYTES))
				throw fail('verify', 'A saved file chunk is missing or incomplete. Keep the original file or restore a backup.');
			for (let at = 0; at < bytes.length; at += chunkBytes) { checkByteAbort(signal); yield bytes.subarray(at, Math.min(bytes.length, at + chunkBytes)); }
		}
	}
	async function* readChunks(name, {signal, chunkBytes, onOpen} = {}) {
		const value = await getRecord(name); checkByteAbort(signal);
		const record = chunkRecord(value);
		if (record) {
			onOpen?.({size: record.size, modified: null, sha256: record.digest}); const hash = sha256State();
			for await (const bytes of storedChunks(record, {signal, chunkBytes})) { hash.update(bytes); yield bytes; }
			if (hash.finish() !== record.digest) throw fail('verify', 'The saved file no longer matches its verified bytes. Restore it from a backup.');
		} else {
			// The last-resort Map holds the exact bytes `write` gave it; the reader always gets its own
			// copy. A database record that is not bytes is passed over, never guessed at.
			const bytes = entry.db ? recordBytes(value) : value == null ? null : exactBytes(value);
			onOpen?.(bytes == null ? null : {size: bytes.length, modified: null});
			if (bytes != null) yield* blobByteChunks(new Blob([bytes]), {signal, chunkBytes});
		}
	}
	const read = async name => {
		let out = null, at = 0;
		for await (const bytes of readChunks(name, {onOpen: info => { if (info) out = new Uint8Array(info.size); }})) { out.set(bytes, at); at += bytes.length; }
		return out;
	};

	const within = (name, prefix) => !reserved(name) && (prefix ? name.startsWith(prefix + '/') : !name.includes('/'));
	const list = async (prefix = '') => {
		if (!FOLDERS.has(prefix)) throw fail('name', 'This folder is not part of Notes.');
		await readable();
		const names = entry.db ? await readKeys(entry.db, table) : [...entry.memory.keys()];
		return names.filter(n => typeof n === 'string' && within(n, prefix)).map(n => prefix ? n.slice(prefix.length + 1) : n);
	};
	// No invented mtime. A streamed file's immutable, write-verified chunk descriptor does
	// carry an exact SHA-256; sync may compare that current source proof instead of rereading
	// its chunks. Ordinary byte records and unfinished recordings provide no such proof.
	const stat = async name => {
		parts(name); await readable();
		if (!entry.db) { const value = entry.memory.get(name); return value == null ? null : {size: value.length, modified: null}; }
		const value = await run(entry.db, table, 'readonly', os => os.get(name)), header = isRecordingPartial(name) ? recordingHeader(value) : null;
		const record = header ? null : chunkRecord(value), bytes = recordBytes(value);
		return header ? {size: header.size, modified: null} : record ? {size: record.size, modified: null, sha256: record.digest} : bytes == null ? null : {size: bytes.length, modified: null};
	};
	const statAll = async (prefix = '') => {
		if (!FOLDERS.has(prefix)) throw fail('name', 'This folder is not part of Notes.');
		await readable();
		const out = new Map();
		// Names and bytes from one transaction. Streamed files need only the descriptor.
		const pairs = entry.db ? await readAll(entry.db, table) : [[...entry.memory.keys()], [...entry.memory.values()]];
		const [names, values] = pairs;
		for (let i = 0; i < names.length; i++) {
			const name = names[i];
			if (typeof name !== 'string' || !within(name, prefix)) continue;
			const header = entry.db && isRecordingPartial(name) ? recordingHeader(values[i]) : null;
			if (header) { out.set(name, {size: header.size, modified: null}); continue; }
			const record = entry.db ? chunkRecord(values[i]) : null, value = entry.db ? recordBytes(values[i]) : values[i];
			if (value == null && !record) continue;
			out.set(prefix ? name.slice(prefix.length + 1) : name, {size: record ? record.size : value.length, modified: null});
		}
		return out;
	};
	const admitted = () => { if (entry.fault) throw fail('read-only', entry.fault.message); };
	// Replacing/removing a chunked record removes its descriptor AND its own rows in one
	// transaction. No other file's rows are touched, and a failed commit keeps everything.
	const replaceRecord = (name, value, drop = false) => new Promise((resolve, reject) => {
		const tx = entry.db.transaction(table, 'readwrite', {durability: 'strict'}), os = tx.objectStore(table), get = os.get(name); let failed;
		get.onsuccess = () => {
			try {
				const old = chunkRecord(get.result);
				if (old) for (let n = 0; n < old.count; n++) os.delete(chunkKey(old.id, n));
				if (drop) os.delete(name); else os.put(value, name);
			} catch (error) { failed = error; tx.abort(); }
		};
		tx.oncomplete = () => resolve();
		tx.onabort = () => reject(failed || tx.error || fail('idb', 'The file transaction was aborted.'));
		tx.onerror = () => reject(failed || tx.error || fail('idb', 'The file transaction failed.'));
	});
	const writeBlob = async (name, blob, {signal, onProgress} = {}) => {
		parts(name); await ready(); admitted();
		if (!entry.db) throw fail('memory', 'This tab has only temporary storage. Keep the original file and open Notes with persistent storage.');
		if (!(blob instanceof Blob)) throw new TypeError('A file copy needs an original Blob.');
		checkByteAbort(signal); await beforeStep('write', name, blob);
		if (await stat(name) !== null) throw fail('collision', 'Another file already uses ' + name + '. It was kept; retry adding the original.');
		const id = token(), record = {type: 'chunks', id, size: blob.size, count: Math.ceil(blob.size / BYTE_CHUNK_BYTES), chunkBytes: BYTE_CHUNK_BYTES, digest: '0'.repeat(64)};
		chunkRecord(record); let staged = false, written = 0;
		try {
			await run(entry.db, table, 'readwrite', os => os.add({size: blob.size}, chunkKey(id, 'pending'))); staged = true;
			const hash = sha256State(); let done = 0;
			onProgress?.({phase: 'writing', done, total: blob.size});
			for await (const bytes of blobByteChunks(blob, {signal})) {
				hash.update(bytes);
				// Only committed rows belong to this intake. A rejected add may name another
				// file's row if a transfer identifier collides; never delete that row on cleanup.
				await run(entry.db, table, 'readwrite', os => os.add(bytes, chunkKey(id, written))); written++;
				done += bytes.length; onProgress?.({phase: 'writing', done, total: blob.size});
			}
			record.digest = hash.finish(); onProgress?.({phase: 'verifying', done: 0, total: blob.size});
			const back = await digestByteChunks(storedChunks(record, {signal}), {size: blob.size, signal,
				onProgress: done => onProgress?.({phase: 'verifying', done, total: blob.size})});
			if (back !== record.digest) throw fail('verify', 'The file copy did not match the original. No link was added. Keep the original file.');
			checkByteAbort(signal);
			// add(), not put(): collision admission and publication are the SAME IDB commit.
			await run(entry.db, table, 'readwrite', os => {
				checkByteAbort(signal); const added = os.add(record, name); os.delete(chunkKey(id, 'pending')); return added;
			});
			staged = false; return {size: record.size, digest: record.digest};
		} catch (error) {
			if (error?.name === 'ConstraintError') throw fail('collision', 'Another file arrived under ' + name + '. It was kept; retry adding the original.');
			throw byteCopyError(error);
		} finally {
			if (staged) try {
				await run(entry.db, table, 'readwrite', os => { for (let n = 0; n < written; n++) os.delete(chunkKey(id, n)); return os.delete(chunkKey(id, 'pending')); });
			} catch (error) { throw fail('cleanup', 'The unfinished file chunks could not be removed. No link was added. Keep the original file and retry after storage is available.'); }
		}
	};

	const write = async (name, value) => {
		parts(name); admitted();
		const bytes = exactBytes(value);
		await beforeStep('write', name, bytes);
		await ready(); admitted();
		// The database only: a refusal is a failed write. No page-memory copy.
		if (entry.db && recordingStem(name)) await recordingTransaction(entry.db, table, 'readwrite', os => os.put(bytes, name));
		else if (entry.db) await replaceRecord(name, bytes);
		else entry.memory.set(name, bytes);
		await afterStep('write', name, bytes);
	};
	const remove = async name => {
		parts(name); admitted();
		await beforeStep('remove', name);
		await ready(); admitted();
		if (entry.db && isRecordingPartial(name)) await recordingTransaction(entry.db, table, 'readwrite', (os, take) => take(os.get(name), value => {
			const header = recordingHeader(value);
			if (header) for (let n = 0; n < header.count; n++) os.delete(recordingKey(name, n));
			os.delete(name);
		}));
		else if (entry.db && recordingStem(name)) await recordingTransaction(entry.db, table, 'readwrite', os => os.delete(name));
		else if (entry.db) await replaceRecord(name, null, true);
		else entry.memory.delete(name);
		await afterStep('remove', name);
	};
	// The folder owner asks this before every transaction, so this is where a fault found at startup
	// reaches the writer. It THROWS rather than answering false: `false` is "these notes are
	// read-only here", a settled fact about a folder, and this is a fault with a cause and a retry.
	const prepare = async () => { await ready(); admitted(); return true; };

	const recording = {
		async begin(name) {
			if (!isRecordingPartial(name)) throw fail('name', 'This is not an unfinished recording.');
			await ready(); admitted(); if (!entry.db || !entry.durable) throw recordingStorageError();
			await beforeStep('write', name, new Uint8Array());
			await recordingTransaction(entry.db, table, 'readwrite', (os, take) => take(os.get(name), value => {
				if (value !== undefined) throw fail('collision', 'This unfinished recording already exists.');
				os.put({kind: 'rapier-recording-chunks', version: 1, count: 0, size: 0}, name);
			}));
			await afterStep('write', name, new Uint8Array());
		},
		async append(name, offset, value) {
			if (!isRecordingPartial(name)) throw fail('name', 'This is not an unfinished recording.');
			await ready(); admitted(); if (!entry.db || !entry.durable) throw recordingStorageError();
			const bytes = exactBytes(value);
			if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(offset + bytes.length)) throw fail('recording-size', 'The recording byte count is not readable.');
			await beforeStep('write', name, bytes);
			const count = await recordingTransaction(entry.db, table, 'readwrite', (os, take, done) => take(os.get(name), value => {
				const header = recordingHeader(value);
				if (!header || header.size !== offset) throw fail('changed', 'The unfinished recording changed; nothing was lost.');
				if (bytes.length) {
					os.put(bytes, recordingKey(name, header.count));
					os.put({...header, count: header.count + 1, size: offset + bytes.length}, name);
				}
				done(header.count);
			}));
			await recordingTransaction(entry.db, table, 'readonly', (os, take) => {
				take(os.get(name), value => { const h = recordingHeader(value);
					if (!h || h.count !== count + (bytes.length ? 1 : 0) || h.size !== offset + bytes.length) throw fail('verify', 'The recording byte count could not be verified. Its chunks were kept.'); });
				if (bytes.length) take(os.get(recordingKey(name, count)), value => {
					if (!same(recordBytes(value), bytes)) throw fail('verify', 'The last recording chunk could not be verified. Keep the audio captured so far.'); });
			});
			await afterStep('write', name, bytes);
			return offset + bytes.length;
		},
	};

	return {read, readChunks, write, writeBlob, remove, list, stat, statAll, prepare, recording,
		get streamingAttachments() { return !!entry.db && !entry.fault; },
		// False the moment a storage fault is found, for every store over this library at once. The
		// folder owner refuses to take the lock on a store that answers false and says the reason,
		// while its read-only path keeps reading -- which is the point: the notes are still there.
		get writable() { return !entry.fault; },
		// IndexedDB keys are strings; there is no file name the browser can refuse here.
		get ascii() { return false; },
		get reason() { return entry.fault ? entry.fault.message : ''; },
		// Covers are shared, content-addressed cache entries; no note owns one to remove.
		async removeThumbnails() {},
		// For a witness and the person's sentence: `durable` null until asked, then true (IndexedDB) or false (memory).
		get durable() { return entry.durable; },
		get kind() { return entry.fault ? 'fault' : entry.durable == null ? 'unasked' : entry.durable ? 'indexeddb' : 'memory'; },
	};
}
