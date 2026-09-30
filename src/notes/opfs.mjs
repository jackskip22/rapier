import {createNativeByteStore as nativeByteStore, createNativeNotesLocks as nativeNotesLocks} from './native-store.mjs';
import {exactBytes, blobByteChunks, checkByteAbort} from './integrity.mjs';
import {parts, FOLDERS} from './opfs-paths.mjs';
import {stampFor} from './search-store.mjs';
import {isRecordingPartial, recordingStorageError} from './recording-files.mjs';

// The native store under this module's name; the bundler admits local named exports only.
export function createNativeByteStore(options) { return nativeByteStore(options); }
export function createNativeNotesLocks(options) { return nativeNotesLocks(options); }

const fail = (code, message) => Object.assign(new Error(message), {code});
const missing = error => error?.name === 'NotFoundError';
// The built page carries the worker through the same retained module factories as backup.
function fileWorker() {
 const source = globalThis.RapierNotesOPFSWorker?.workerSource;
 if (typeof source !== 'function' || typeof Worker !== 'function') throw fail('atomic', 'This browser cannot safely replace a note. These notes are read-only here; opening, search and backup still work.');
 const url = URL.createObjectURL(new Blob([source()], {type: 'text/javascript'}));
 try { return new Worker(url, {name: 'rapier-notes-files'}); }
 finally { URL.revokeObjectURL(url); }
}
const errorRecord = error => ({name: String(error?.name || 'Error'), message: String(error?.message || error), ...(error?.code !== undefined ? {code: error.code} : {})});
// One request/reply per ordinary file write. The owner retains its bytes; no transfer detaches
// the array it needs for its independent readback. A port fault retires the client, never retries.
function workerPort(directory, createWorker) {
 let worker, fault, sequence = 0; const pending = new Map();
 const finish = (id, error, value) => {
  const job = pending.get(id); if (!job) return;
  pending.delete(id); job.signal?.removeEventListener('abort', job.cancel);
  error ? job.reject(error) : job.resolve(value);
 };
 const stop = error => {
  fault ||= error instanceof Error ? error : new Error(String(error));
  for (const id of pending.keys()) finish(id, fault);
  worker?.terminate();
 };
 const open = () => {
  if (fault) throw fault;
  if (worker) return worker;
  worker = createWorker();
  worker.onerror = event => { event.preventDefault?.(); stop(event.error || Object.assign(new Error(event.message || 'The notes file worker stopped before it answered.'), {name: 'Error'})); };
  worker.onmessageerror = () => stop(new Error('The notes file worker could not read its answer.'));
  worker.onmessage = ({data}) => {
   const job = pending.get(data?.id); if (!job) return;
   if (data.progress) {
    let error;
    try { job.onProgress?.(data.progress); } catch (caught) { error = errorRecord(caught); }
    try { worker.postMessage({id: data.id, operation: 'progress', ...(error ? {error} : {})}); }
    catch (caught) { stop(caught); }
   } else finish(data.id, data.error ? Object.assign(new Error(data.error.message), data.error) : null, data.value);
  };
  return worker;
 };
 return async (operation, value = {}, {signal, onProgress} = {}) => {
  checkByteAbort(signal); const port = open(), dir = await directory();
  // Directory discovery yields. A worker fault there must not strand a new job on its dead port.
  if (fault) throw fault; checkByteAbort(signal);
  return new Promise((resolve, reject) => {
   const id = ++sequence, cancel = () => { try { port.postMessage({id, operation: 'cancel'}); } catch (error) { stop(error); } };
   pending.set(id, {resolve, reject, signal, cancel, onProgress});
   signal?.addEventListener('abort', cancel, {once: true});
   try { port.postMessage({id, operation, directory: dir, ...value, ...(onProgress ? {progress: true} : {})}); }
   catch (error) { finish(id, error); }
  });
 };
}

// Only the folder owner calls this. `memory` here is a Node witness's stand-in, never a page's.
export function createByteStore({directory, memory = null, token = () => crypto.randomUUID(), beforeStep = async () => {}, afterStep = async () => {}, createWorker = fileWorker} = {}) {
	let writable = memory ? true : undefined, ascii = false, reason = '';
	const request = memory ? null : workerPort(directory, createWorker);
	const locate = async (name, create = false) => {
		const path = parts(name); let dir = await directory();
		// One `getDirectoryHandle` per parent segment, so a two-part asset path and a three-part
		// history path (folder inside folder) share the same walk instead of a length check per case.
		for (let i = 0; i < path.length - 1; i++) dir = await dir.getDirectoryHandle(path[i], {create});
		return {dir, name: path.at(-1)};
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
		return request('writeBlob', {name, blob, token: token()}, {signal, onProgress});
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
		else await request('write', {name, bytes, token: token()});
		await afterStep('write', name, bytes);
	};
	const prepare = async () => {
		if (writable !== undefined) return writable;
		try { const result = await request('prepare', {token: token()}); ascii = result.ascii; writable = true; }
		catch (error) {
			if (error?.code !== 'atomic' && error?.name !== 'NotSupportedError') throw error;
			writable = false; reason = error.message;
		}
		return writable;
	};
	// Sync access changes its file immediately. The worker replaces a verified sibling, preserving
	// the last acknowledged recording until the copied prefix and new tail both match.
	const recording = memory ? null : {
		async begin(name) {
			if (!isRecordingPartial(name)) throw fail('name', 'This is not an unfinished recording.');
			if (!await prepare()) throw recordingStorageError();
			if (await stat(name) !== null) throw fail('collision', 'This unfinished recording already exists.');
			const bytes = new Uint8Array(); await beforeStep('write', name, bytes);
			await request('begin', {name, token: token()});
			await afterStep('write', name, bytes);
		},
		async append(name, offset, value) {
			if (!isRecordingPartial(name)) throw fail('name', 'This is not an unfinished recording.');
			if (!writable) throw recordingStorageError();
			const bytes = exactBytes(value);
			if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(offset + bytes.length)) throw fail('recording-size', 'The recording byte count is not readable.');
			await beforeStep('write', name, bytes);
			const size = await request('append', {name, offset, bytes, token: token()});
			await afterStep('write', name, bytes); return size;
		},
	};
	return {read, readBlob, readChunks, write, writeBlob, remove, list, stat, statAll, prepare, recording, get streamingAttachments() { return !memory && writable === true; }, get writable() { return writable; }, get ascii() { return ascii; }, get reason() { return reason; },
		// All covers are shared, content-addressed cache entries; no note owns one to remove.
		async removeThumbnails() {}};
}
