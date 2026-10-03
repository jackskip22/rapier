import {exactBytes, sha256, blobByteChunks, digestByteChunks, checkByteAbort, byteCopyError} from './integrity.mjs';
import {isRecordingPartial, recordingStorageError, recordingStem} from './recording-files.mjs';
import {FOLDERS, parts} from './opfs-paths.mjs';

const CHUNK = 48 * 1024;
const fail = (code, message) => Object.assign(new Error(message), {code});
// Bytes cross as args.bytes and result.bytes; the platform's transport seam carries them.
const received = value => ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : null;

// The owner owns transactions. This is only bounded byte transport; no recovery, note naming,
// second queue, or fallback to an empty browser folder belongs at this boundary.
export function createNativeByteStore({call, token = () => crypto.randomUUID(), beforeStep = async () => {}, afterStep = async () => {}}) {
	let writable, preparing, reason = '';
	const request = (operation, args = {}) => call('notes.store.' + operation, args);
	const prepare = () => {
		if (writable !== undefined) return Promise.resolve(writable);
		if (!preparing) preparing = Promise.resolve().then(() => request('prepare')).then(result => {
			if (typeof result?.writable !== 'boolean') throw fail('protocol', 'The native folder did not report its write capability.');
			writable = result.writable; reason = result.reason || ''; return writable;
		}).finally(() => { preparing = null; });
		return preparing;
	};
	// One native read-transfer owner serves both whole-file readers and the backup stream.
	async function* readChunks(name, {chunkBytes = CHUNK, signal, onOpen} = {}) {
		parts(name);
		if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1) throw fail('protocol', 'The native read chunk needs a positive exact size.');
		const step = Math.min(chunkBytes, CHUNK);
		await beforeStep('read', name);
		const id = token();
		try {
			if (signal?.aborted) throw signal.reason;
			const result = await request('read.begin', {name, id});
			if (result?.missing === true) { onOpen?.(null); return; }
			if (!Number.isSafeInteger(result?.size) || result.size < 0) throw fail('protocol', 'The native folder returned an invalid byte count.');
			onOpen?.(result);
			for (let offset = 0; offset < result.size;) {
				if (signal?.aborted) throw signal.reason;
				const size = Math.min(step, result.size - offset), part = await request('read.chunk', {id, offset, size});
				const chunk = received(part?.bytes);
				if (!chunk || part.offset !== offset || chunk.length !== size) throw fail('protocol', 'The native folder returned an incomplete byte range.');
				offset += chunk.length; yield chunk;
			}
		} finally { await request('read.close', {id}); }
	}
	const read = async name => {
		let bytes = null, offset = 0;
		for await (const chunk of readChunks(name, {onOpen: opened => { if (opened) bytes = new Uint8Array(opened.size); }})) {
			bytes.set(chunk, offset); offset += chunk.length;
		}
		return bytes;
	};
	const write = async (name, value) => {
		parts(name); if (!writable) throw fail('read-only', reason || 'These notes are read-only here.');
		const bytes = exactBytes(value), id = token();
		await beforeStep('write', name, bytes);
		try {
			await request('write.begin', {name, id, size: bytes.length, digest: await sha256(bytes)});
			for (let offset = 0; offset < bytes.length; offset += CHUNK) {
				const end = Math.min(bytes.length, offset + CHUNK), result = await request('write.chunk', {id, offset, bytes: bytes.subarray(offset, end)});
				if (result.offset !== end) throw fail('protocol', 'The native folder did not accept the complete byte range.');
			}
			const result = await request('write.commit', {id});
			if (result?.written !== true) throw fail('verify', 'The native folder did not verify this write.');
		} finally { await request('write.abort', {id}); }
		await afterStep('write', name, bytes);
	};
	// The existing native protocol asks for its digest at begin; compute it from bounded
	// slices first, then send bounded slices. NativeNotesStore owns temporary-file readback.
	const writeBlob = async (name, blob, {signal, onProgress} = {}) => {
		parts(name); if (!writable) throw fail('read-only', reason || 'These notes are read-only here.');
		if (!(blob instanceof Blob)) throw new TypeError('A file copy needs an original Blob.');
		checkByteAbort(signal); await beforeStep('write', name, blob);
		if (await stat(name) !== null) throw fail('collision', 'Another file already uses ' + name + '. It was kept.');
		const id = token(); let begun = false;
		try {
			onProgress?.({phase: 'hashing', done: 0, total: blob.size});
			const digest = await digestByteChunks(blobByteChunks(blob, {signal}), {size: blob.size, signal,
				onProgress: done => onProgress?.({phase: 'hashing', done, total: blob.size})});
			checkByteAbort(signal);
			begun = true; // A lost begin acknowledgement still owns a native temporary file.
			await request('write.begin', {name, id, size: blob.size, digest});
			let offset = 0; onProgress?.({phase: 'writing', done: 0, total: blob.size});
			for await (const bytes of blobByteChunks(blob, {signal, chunkBytes: CHUNK})) {
				const result = await request('write.chunk', {id, offset, bytes}); offset += bytes.length;
				if (result.offset !== offset) throw fail('protocol', 'The native folder did not accept the complete byte range.');
				onProgress?.({phase: 'writing', done: offset, total: blob.size});
			}
			checkByteAbort(signal);
			if (await stat(name) !== null) throw fail('collision', 'Another file arrived under ' + name + '. It was kept.');
			onProgress?.({phase: 'verifying', done: 0, total: blob.size}); checkByteAbort(signal);
			const result = await request('write.commit', {id});
			if (result?.written !== true) throw fail('verify', 'The native folder did not verify this file copy.');
			return {size: blob.size, digest};
		} catch (error) { throw byteCopyError(error); }
		finally { if (begun) await request('write.abort', {id}); }
	};

	const remove = async name => {
		parts(name); if (!writable) throw fail('read-only', reason || 'These notes are read-only here.');
		await beforeStep('remove', name); await request('remove', {name}); await afterStep('remove', name);
	};
	const list = async (prefix = '') => {
		if (!FOLDERS.has(prefix)) throw fail('name', 'This folder is not part of Notes.');
		const result = await request('list', {prefix});
		if (!Array.isArray(result.names)) throw fail('protocol', 'The native folder did not return a file listing.');
		for (const name of result.names) { if (typeof name !== 'string' || name.includes('/')) throw fail('protocol', 'The native folder returned a non-sibling name.'); parts(prefix ? prefix + '/' + name : name); }
		return result.names;
	};
	// Stat without bytes; null means absent. No mtime gives `modified: null`: "no stamp", always re-read.
	const stat = async name => {
		parts(name); const result = await request('stat', {name});
		if (result?.missing === true) return null;
		if (!Number.isSafeInteger(result?.size) || result.size < 0) throw fail('protocol', 'The native folder returned an invalid file size.');
		return {size: result.size, modified: Number.isSafeInteger(result.modified) ? result.modified : null};
	};
	// list() plus one stat per name; no bytes.
	const statAll = async (prefix = '') => {
		const names = await list(prefix), out = new Map();
		await Promise.all(names.map(async leaf => {
			const info = await stat(prefix ? prefix + '/' + leaf : leaf);
			if (info) out.set(leaf, info);
		}));
		return out;
	};
	const recording = {
		async begin(name) {
			if (!isRecordingPartial(name)) throw fail('name', 'This is not an unfinished recording.');
			if (!await prepare()) throw recordingStorageError();
			const bytes = new Uint8Array(); await beforeStep('write', name, bytes);
			const result = await request('recording.begin', {name});
			if (result?.size !== 0) throw fail('protocol', 'The native folder did not verify the empty recording.');
			await afterStep('write', name, bytes);
		},
		async append(name, offset, value) {
			if (!isRecordingPartial(name)) throw fail('name', 'This is not an unfinished recording.');
			if (!writable) throw recordingStorageError();
			const bytes = exactBytes(value);
			if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(offset + bytes.length)) throw fail('recording-size', 'The recording byte count is not readable.');
			await beforeStep('write', name, bytes);
			// Every native range is fsynced and read back before acknowledgement. A lost response
			// leaves a durable prefix for recovery; never replay an uncertain append automatically.
			for (let at = 0; at < bytes.length || at === 0; at += CHUNK) {
				const part = bytes.subarray(at, at + CHUNK), end = offset + part.length;
				const result = await request('recording.append', {name, offset, bytes: part});
				if (result?.offset !== end) throw fail('protocol', 'The native folder did not verify the recording byte range.');
				offset = end;
			}
			await afterStep('write', name, bytes); return offset;
		}
	};
	return {read, readChunks, write, writeBlob, remove, list, stat, statAll, prepare, recording, get streamingAttachments() { return writable === true; }, get writable() { return writable; }, get ascii() { return false; }, get reason() { return reason; }, async removeThumbnails() {}};
}

// Native mutex adapter for the existing owner's locks.request seam. Android holds the lease
// through renderer death until its accepted I/O is drained; a browser lock cannot promise that.
export function createNativeNotesLocks({call, token = () => crypto.randomUUID()}) {
	return {async request(name, {signal, mode, ifAvailable = false} = {}, run) {
		const prefix = 'rapier-notes-recording:notes:', stem = name.startsWith(prefix) ? name.slice(prefix.length) : '';
		if ((name !== 'rapier-notes:notes' && recordingStem(stem + '.partial') !== stem) || mode !== 'exclusive' || typeof ifAvailable !== 'boolean') throw fail('scope', 'Unknown native Notes lock.');
		if (signal?.aborted) throw new DOMException('Notes lease cancelled', 'AbortError');
		const id = token();
		const cancel = () => { void call('notes.store.lock.cancel', {id}).catch(() => {}); };
		signal?.addEventListener('abort', cancel, {once: true});
		try {
			const result = await call('notes.store.lock.acquire', {id, name, ifAvailable});
			if (signal?.aborted) throw new DOMException('Notes lease cancelled', 'AbortError');
			if (result?.acquired === false && ifAvailable) return await run(null);
			if (result?.acquired !== true) throw fail('protocol', 'The native folder did not grant its lease.');
			return await run({name, mode: 'exclusive'});
		} catch (error) {
			if (signal?.aborted) throw new DOMException('Notes lease cancelled', 'AbortError');
			throw error;
		} finally {
			signal?.removeEventListener('abort', cancel);
			await call('notes.store.lock.release', {id});
		}
	}};
}
