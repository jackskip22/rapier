import {createNativeByteStore as nativeByteStore, createNativeNotesLocks as nativeNotesLocks} from './native-store.mjs';
import {exactBytes, sha256State, blobByteChunks, digestByteChunks, checkByteAbort, byteCopyError} from './integrity.mjs';
import {stampFor} from './search-store.mjs';
import {isRecordingPartial, recordingStorageError} from './recording-files.mjs';

// The native store under this module's name; the bundler admits local named exports only.
export function createNativeByteStore(options) { return nativeByteStore(options); }
export function createNativeNotesLocks(options) { return nativeNotesLocks(options); }

const fail = (code, message) => Object.assign(new Error(message), {code});
const missing = error => error?.name === 'NotFoundError';
const same = (a, b) => a != null && b != null && a.length === b.length && a.every((n, i) => n === b[i]);
// Top-level file, the two asset folders, or history's three sub-folders; never deeper. Same space as native-store.mjs `prefixes`.
const HISTORY_SUBS = ['manifests', 'texts', 'blobs'];
// The same six folders as native-store.mjs and idb-store.mjs (notes-idb-store-admission).
const FOLDERS = new Set(['', 'audio', 'attachments', 'thumbs', ...HISTORY_SUBS.map(sub => 'history/' + sub)]);
const parts = name => {
	if (typeof name !== 'string' || !name || name.includes('\\') || name.includes('\0')) throw fail('name', 'This file does not belong to the notes folder.');
	const value = name.split('/');
	const admitted = value.length === 1
		|| value.length === 2 && ['audio', 'attachments', 'thumbs'].includes(value[0])
		|| value.length === 3 && value[0] === 'history' && HISTORY_SUBS.includes(value[1]);
	if (!admitted || value.some(p => !p || p === '.' || p === '..')) throw fail('name', 'This file does not belong to the notes folder.');
	return value;
};

// Only the folder owner calls this. `memory` here is a Node witness's stand-in, never a page's.
export function createByteStore({directory, memory = null, token = () => crypto.randomUUID(), beforeStep = async () => {}, afterStep = async () => {}} = {}) {
	let writable = memory ? true : undefined, ascii = false, reason = '';
	const locate = async (name, create = false) => {
		const path = parts(name); let dir = await directory();
		// One `getDirectoryHandle` per parent segment, so a two-part asset path and a three-part
		// history path (folder inside folder) share the same walk instead of a length check per case.
		for (let i = 0; i < path.length - 1; i++) dir = await dir.getDirectoryHandle(path[i], {create});
		return {dir, name: path.at(-1)};
	};
	// A temporary name is not ours merely because it looks private. Probe before creating it;
	// only a handle created by this attempt may enter its cleanup set. The folder lease owns
	// Rapier writers; a nonce also keeps an interrupted or foreign scratch file out of the way.
	const scratch = async (dir, name) => {
		try { await dir.getFileHandle(name); throw fail('collision', 'A temporary file already uses this name. It was kept; retry saving.'); }
		catch (error) { if (!missing(error)) throw error; }
		return dir.getFileHandle(name, {create: true});
	};
	const read = async name => {
		parts(name); await beforeStep('read', name);
		if (memory) { const value = memory.get(name); return value == null ? null : exactBytes(value instanceof Blob ? await value.arrayBuffer() : value); }
		try { const at = await locate(name); return new Uint8Array(await (await (await at.dir.getFileHandle(at.name)).getFile()).arrayBuffer()); }
		catch (error) { if (missing(error)) return null; throw error; }
	};
	const readBlob = async name => {
		parts(name); await beforeStep('read', name);
		if (memory) { const value = memory.get(name); return value == null ? null : value instanceof Blob ? value : new Blob([value]); }
		try { const at = await locate(name); return await (await at.dir.getFileHandle(at.name)).getFile(); }
		catch (error) { if (missing(error)) return null; throw error; }
	};
	async function* readChunks(name, {signal, chunkBytes, onOpen} = {}) {
		const file = await readBlob(name); checkByteAbort(signal);
		onOpen?.(file === null ? null : {size: file.size, modified: memory ? null : file.lastModified});
		if (file !== null) yield* blobByteChunks(file, {signal, chunkBytes});
	}
	// A new immutable sibling file is one atomic commit, not a payload in notes.json. The
	// folder lease owns the name throughout. Only our own unique temporary file is cleaned up.
	const writeBlob = async (name, blob, {signal, onProgress} = {}) => {
		parts(name);
		if (memory) throw fail('memory', 'This tab has only temporary storage. Keep the original file and open Notes with persistent storage.');
		if (!writable) throw fail('read-only', reason || 'These notes are read-only here.');
		if (!(blob instanceof Blob)) throw new TypeError('A file copy needs an original Blob.');
		checkByteAbort(signal); await beforeStep('write', name, blob);
		const at = await locate(name, true), tmp = '.rapier-attachment-' + token() + '.tmp';
		let stream, staged = false;
		try {
			if (await stat(name) !== null) throw fail('collision', 'Another file already uses ' + name + '. It was kept; retry adding the original.');
			const handle = await scratch(at.dir, tmp); staged = true;
			stream = await handle.createWritable(); const hash = sha256State(); let done = 0;
			onProgress?.({phase: 'writing', done, total: blob.size});
			for await (const bytes of blobByteChunks(blob, {signal})) {
				hash.update(bytes); await stream.write(bytes); done += bytes.length;
				onProgress?.({phase: 'writing', done, total: blob.size});
			}
			checkByteAbort(signal); await stream.close(); stream = null;
			const digest = hash.finish(), back = await handle.getFile();
			if (back.size !== blob.size) throw fail('verify', 'The file copy has a different size. Keep the original file.');
			onProgress?.({phase: 'verifying', done: 0, total: blob.size});
			const actual = await digestByteChunks(blobByteChunks(back, {signal}), {size: blob.size, signal,
				onProgress: done => onProgress?.({phase: 'verifying', done, total: blob.size})});
			if (actual !== digest) throw fail('verify', 'The file copy did not match the original. No link was added. Keep the original file.');
			checkByteAbort(signal);
			if (await stat(name) !== null) throw fail('collision', 'Another file arrived under ' + name + '. It was kept; retry adding the original.');
			checkByteAbort(signal);
			await handle.move(at.name); staged = false;
			return {size: blob.size, digest};
		} catch (error) { throw byteCopyError(error); }
		finally {
			try { await stream?.abort(); } finally {
				if (staged) try { await at.dir.removeEntry(tmp); } catch (error) {
					if (!missing(error)) throw fail('cleanup', 'The unfinished copy could not be removed: attachments/' + tmp + '. No link was added. Keep the original file and retry after storage is available.');
				}
			}
		}
	};

	// The one directory walk behind list() and statAll().
	const walk = async prefix => {
		let dir = await directory();
		for (const part of prefix ? prefix.split('/') : []) dir = await dir.getDirectoryHandle(part);
		const entries = [];
		for await (const [name, handle] of dir) if (handle.kind === 'file') entries.push([name, handle]);
		return entries;
	};
	const list = async (prefix = '') => {
		if (!FOLDERS.has(prefix)) throw fail('name', 'This folder is not part of Notes.');
		if (memory) return [...memory.keys()].filter(n => prefix ? n.startsWith(prefix + '/') : !n.includes('/')).map(n => prefix ? n.slice(prefix.length + 1) : n);
		try { return (await walk(prefix)).map(([name]) => name); }
		catch (error) { if (prefix && missing(error)) return []; throw error; }
	};
	// Stat without bytes; `read` alone calls arrayBuffer(). Memory mode has no mtime: null, always re-read.
	const stat = async name => {
		parts(name);
		if (memory) { const value = memory.get(name); if (value == null) return null; return {size: value instanceof Blob ? value.size : value.length, modified: null}; }
		try { const at = await locate(name); return stampFor(await (await at.dir.getFileHandle(at.name)).getFile()); }
		catch (error) { if (missing(error)) return null; throw error; }
	};
	// One walk per prefix, no bytes.
	const statAll = async (prefix = '') => {
		if (!FOLDERS.has(prefix)) throw fail('name', 'This folder is not part of Notes.');
		if (memory) {
			const out = new Map();
			for (const [name, value] of memory) if (prefix ? name.startsWith(prefix + '/') : !name.includes('/'))
				out.set(prefix ? name.slice(prefix.length + 1) : name, {size: value instanceof Blob ? value.size : value.length, modified: null});
			return out;
		}
		try {
			const entries = await walk(prefix);
			const stats = await Promise.all(entries.map(async ([name, handle]) => [name, stampFor(await handle.getFile())]));
			return new Map(stats);
		} catch (error) { if (prefix && missing(error)) return new Map(); throw error; }
	};
	const remove = async name => {
		parts(name); if (!writable) throw fail('read-only', reason || 'These notes are read-only here.');
		await beforeStep('remove', name);
		if (memory) memory.delete(name);
		else try { const at = await locate(name); await at.dir.removeEntry(at.name); } catch (error) { if (!missing(error)) throw error; }
		await afterStep('remove', name);
	};
	const write = async (name, value) => {
		parts(name); if (!writable) throw fail('read-only', reason || 'These notes are read-only here.');
		const bytes = exactBytes(value);
		await beforeStep('write', name, bytes);
		if (memory) memory.set(name, bytes);
		else {
			const at = await locate(name, true), tmp = '.rapier-write-' + token() + '.tmp';
			let stream, owned = false;
			try {
				const handle = await scratch(at.dir, tmp); owned = true;
				stream = await handle.createWritable(); await stream.write(bytes); await stream.close(); stream = null;
				// The bytes are read back before they take the name: a write the file system resolved with
				// other bytes never replaces the words under the name.
				if (!same(new Uint8Array(await (await handle.getFile()).arrayBuffer()), bytes)) throw fail('verify', 'The notes folder did not keep the bytes written to ' + name + '.');
				await handle.move(at.name); owned = false;
			} catch (error) { try { await stream?.abort(); } catch (_) {} throw error; }
			finally { if (owned) try { await at.dir.removeEntry(tmp); } catch (_) {} }
		}
		await afterStep('write', name, bytes);
	};
	const prepare = async () => {
		if (writable !== undefined) return writable;
		const dir = await directory(), stem = '.rapier-atomic-' + token(), a = stem + '.tmp', b = stem + '-target.tmp', u = stem + '-é.tmp';
		let stream; const owned = new Set();
		const create = async name => { const handle = await scratch(dir, name); owned.add(name); return handle; };
		try {
			const first = await create(a), target = await create(b);
			if (typeof first.createWritable !== 'function' || typeof first.move !== 'function') throw fail('atomic', 'This browser cannot safely replace a note. These notes are read-only here; opening, search and backup still work.');
			const old = new Uint8Array([239, 187, 191, 13, 10, 0, 255]), next = new Uint8Array([65, 13, 10]);
			stream = await target.createWritable(); await stream.write(old); await stream.close(); stream = null;
			stream = await target.createWritable(); await stream.write(next);
			if (!same(await read(b), old)) throw fail('atomic', 'The browser exposed an unfinished file write. These notes are read-only here.');
			await stream.abort(); stream = null;
			if (!same(await read(b), old)) throw fail('atomic', 'The browser did not keep the file after an abandoned write. These notes are read-only here.');
			stream = await first.createWritable(); await stream.write(next); await stream.close(); stream = null;
			await first.move(b); owned.delete(a);
			if (!same(await read(b), next) || await read(a) !== null) throw fail('atomic', 'The browser did not replace the whole file. These notes are read-only here.');
			const empty = await create(a);
			stream = await empty.createWritable(); await stream.close(); stream = null; await empty.move(b); owned.delete(a);
			if ((await read(b))?.length !== 0) throw fail('atomic', 'The browser did not keep an empty file. These notes are read-only here.');
			try { await create(u); }
			catch (error) { if (['TypeMismatchError', 'InvalidCharacterError', 'TypeError'].includes(error?.name)) ascii = true; else throw error; }
			writable = true;
		} catch (error) {
			if (error?.code !== 'atomic' && error?.name !== 'NotSupportedError') throw error;
			writable = false; reason = error.message;
		} finally {
			try { await stream?.abort(); } catch (_) {}
			for (const name of owned) try { await dir.removeEntry(name); } catch (_) {}
		}
		return writable;
	};
	// A closed writable is the browser's commit boundary. There is no fsync/flush method on
	// FileSystemWritableFileStream: keepExistingData + close, then exact tail read-back, is the
	// strongest acknowledgement this main-thread API supplies. Never keep one writer open for
	// the lifetime of the microphone; a killed page would lose that writer's whole staging file.
	const recording = memory ? null : {
		async begin(name) {
			if (!isRecordingPartial(name)) throw fail('name', 'This is not an unfinished recording.');
			if (!await prepare()) throw recordingStorageError();
			if (await stat(name) !== null) throw fail('collision', 'This unfinished recording already exists.');
			const bytes = new Uint8Array(); await beforeStep('write', name, bytes);
			const at = await locate(name, true), handle = await at.dir.getFileHandle(at.name, {create: true});
			let stream;
			try { stream = await handle.createWritable(); await stream.close(); stream = null; }
			catch (error) { try { await stream?.abort(); } catch (_) {} throw error; }
			if ((await handle.getFile()).size !== 0) throw fail('verify', 'The unfinished recording could not be started safely.');
			await afterStep('write', name, bytes);
		},
		async append(name, offset, value) {
			if (!isRecordingPartial(name)) throw fail('name', 'This is not an unfinished recording.');
			if (!writable) throw recordingStorageError();
			const bytes = exactBytes(value);
			if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(offset + bytes.length)) throw fail('recording-size', 'The recording byte count is not readable.');
			await beforeStep('write', name, bytes);
			const at = await locate(name), handle = await at.dir.getFileHandle(at.name);
			if ((await handle.getFile()).size !== offset) throw fail('changed', 'The unfinished recording changed; nothing was lost.');
			let stream;
			try {
				stream = await handle.createWritable({keepExistingData: true});
				await stream.seek(offset); await stream.write(bytes); await stream.close(); stream = null;
			} catch (error) { try { await stream?.abort(); } catch (_) {} throw error; }
			const back = await handle.getFile();
			if (back.size !== offset + bytes.length || !same(new Uint8Array(await back.slice(offset).arrayBuffer()), bytes))
				throw fail('verify', 'The last recording chunk could not be verified. Keep the audio captured so far.');
			await afterStep('write', name, bytes);
			return back.size;
		},
	};
	return {read, readBlob, readChunks, write, writeBlob, remove, list, stat, statAll, prepare, recording, get streamingAttachments() { return !memory && writable === true; }, get writable() { return writable; }, get ascii() { return ascii; }, get reason() { return reason; },
		// All covers are shared, content-addressed cache entries; no note owns one to remove.
		async removeThumbnails() {}};
}
