// SPDX-License-Identifier: AGPL-3.0-only
import {folderBackupSource, check} from './backup-folder.mjs';
import {writeBackupStream} from './backup-stream.mjs';
import {createBackupSink} from './backup-sink.mjs';
import {backupStageRecord} from './backup-lifecycle.mjs';

// One extra source-sized window, independent of archive/member size.
const STAGING_WRITE_BYTES = 64 * 1024;

const failure = error => ({name: String(error?.name || 'Error'), message: String(error?.message || error).slice(0, 1024),
	...(error instanceof AggregateError ? {causes: error.errors.map(failure)} : {})});
const cancelled = () => new Error('backup was cancelled');
// Past the quota a browser's staging write may write nothing (and its estimate still report room), so a write that makes
// no progress and a thrown QuotaExceededError are the same fact for the person: the storage is full.
const FULL = 'the browser\'s storage for this site is full';
const storageFull = cause => Object.assign(new Error(FULL), {name: 'QuotaExceededError', ...(cause ? {cause} : {})});
const synchronous = (value, method) => { if (value !== undefined) throw new Error('backup needs synchronous ' + method); };

// A File-shaped range adapter, not another verifier. Positive short reads are completed;
// zero progress and impossible counts refuse instead of certifying a zero-filled tail.
function syncFile(handle, modified, pause) {
	const size = handle.getSize();
	if (!Number.isSafeInteger(size) || size < 0) throw new Error('backup sync handle returned an invalid size');
	return {size, lastModified: modified, slice(start, end) { return {async arrayBuffer() {
		const bytes = new Uint8Array(Math.max(0, Math.min(size, end) - start));
		for (let at = 0; at < bytes.length;) {
			await pause();
			const count = handle.read(bytes.subarray(at), {at: start + at});
			if (!Number.isSafeInteger(count) || count <= 0 || count > bytes.length - at) throw new Error('backup sync read did not complete');
			at += count;
		}
		return bytes.buffer;
	}}; }};
}

// Only the dedicated worker opens access handles. The page keeps the folder/staging lease,
// the completion record and every destination interaction. Handles are cloned, not transferred.
export function createBackupWorker({postMessage, now = () => performance.now(), yieldTask = () => new Promise(resolve => setTimeout(resolve, 0))}) {
	let active = null, lastId = 0;
	const run = async (request, job) => {
		const {id, directory, archive, staging, names, options} = request, signal = job.controller.signal;
		let access, sink, snapshot, removed = false, closed = false, lastYield = now(), lastProgress = -Infinity, phase;
		const send = (operation, value = {}) => postMessage({id, operation, ...value});
		const pause = async () => {
			if (now() - lastYield >= 50) { await yieldTask(); lastYield = now(); }
			check(signal);
		};
		const progress = value => {
			const time = now();
			if (value.phase !== phase || time - lastProgress >= 250) {
				phase = value.phase; lastProgress = time; send('progress', {value});
			}
		};
		const close = () => { if (access && !closed) { synchronous(access.close(), 'close'); closed = true; } };
		try {
			if (typeof archive?.createSyncAccessHandle !== 'function') { send('unavailable'); return; }
			if (!Array.isArray(names) || !names.length || names.length > 65533) throw new Error('backup worker needs the complete bounded folder inventory');
			const path = await staging.resolve(archive);
			if (path?.length !== 1 || path[0] !== archive.name || await directory.resolve(archive) !== null) throw new Error('backup staging must be its own entry outside the source folder');
			access = await archive.createSyncAccessHandle();
			const buffer = new Uint8Array(STAGING_WRITE_BYTES);
			let buffered = 0, written = 0;
			const flush = async () => {
				for (let at = 0; at < buffered;) {
					await pause();
					let count;
					try { count = access.write(buffer.subarray(at, buffered), {at: written}); }
					catch (error) { throw error?.name === 'QuotaExceededError' ? storageFull(error) : error; }
					if (count === 0) throw storageFull();
					if (!Number.isSafeInteger(count) || count < 0 || count > buffered - at) throw new Error('backup sync write did not complete');
					at += count; written += count;
				}
				buffered = 0;
			};
			sink = createBackupSink({
				async write(bytes) {
					for (let at = 0; at < bytes.length;) {
						const count = Math.min(buffer.length - buffered, bytes.length - at);
						buffer.set(bytes.subarray(at, at + count), buffered);
						buffered += count; at += count;
						if (buffered === buffer.length) await flush();
					}
				},
				async endMember(size) { if (size >= buffer.length) await flush(); },
				async close() {
					await flush();
					synchronous(access.truncate(sink.bytes), 'truncate'); synchronous(access.flush(), 'flush');
					// Capture under the SAME exclusive lock as the verification. Never acquire a new
					// post-close File and give it the certificate of this earlier snapshot.
					snapshot = new File([await archive.getFile()], request.name, {type: 'application/zip'});
					if (snapshot.size !== sink.bytes) throw new Error('backup snapshot size differs from staging');
				},
				async file() { return syncFile(access, 0, pause); },
				// A failed/partial write is never replayed by cleanup. Only close drains the tail.
				async abort() { buffered = 0; close(); },
				async remove() { close(); await staging.removeEntry(archive.name); removed = true; }
			});
			async function* source() {
				// Keep the next source handles ready while this member streams. Only metadata is
				// prefetched: at most four locked sources, one payload chunk, and original order.
				// A failed/cancelled consumer drains every admitted acquisition before the page
				// can release its folder lease. No source handle outlives this generator.
				const acquire = async name => {
					check(signal);
					if (typeof name !== 'string' || !name || /[\\\0]/.test(name) || name.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('backup path is not relative');
					const parts = name.split('/'), leaf = parts.pop(); let dir = directory;
					for (const part of parts) dir = await dir.getDirectoryHandle(part);
					const fileHandle = await dir.getFileHandle(leaf), handle = await fileHandle.createSyncAccessHandle();
					try {
						const file = await fileHandle.getFile(), view = syncFile(handle, file.lastModified || 0, pause);
						if (view.size !== file.size) throw new Error('a backup source changed size: ' + name);
						return {name, file, view, handle};
					} catch (error) {
						try { synchronous(handle.close(), 'close'); }
						catch (cleanup) { throw new AggregateError([error, cleanup], 'backup source release failed'); }
						throw error;
					}
				};
				const pending = []; let next = 0, failure;
				// Rejections become outcomes immediately, including a later member that fails
				// while an earlier member is still being read. Cleanup owns those outcomes too.
				const admit = () => pending.push(acquire(names[next++]).then(value => ({value}), error => ({error})));
				try {
					while (next < Math.min(4, names.length)) admit();
					while (pending.length) {
						const result = await pending.shift();
						if (result.error) throw result.error;
						const {name, file, view, handle} = result.value;
						try {
							await pause();
							yield* folderBackupSource(null, {inventory: [{name, size: view.size, modified: view.lastModified, file: view}], stamp: options.stamp, signal});
							if (handle.getSize() !== file.size) throw new Error('a backup source changed size: ' + name);
						} finally { synchronous(handle.close(), 'close'); }
						if (next < names.length) admit();
					}
				} catch (error) { failure = error; }
				finally {
					const errors = failure ? [failure] : [];
					for (const result of await Promise.all(pending)) {
						if (result.error) errors.push(result.error);
						else try { synchronous(result.value.handle.close(), 'close'); } catch (error) { errors.push(error); }
					}
					if (errors.length > 1) throw new AggregateError(errors, 'backup source preparation or release failed');
					if (errors.length) throw errors[0];
				}
			}
			const result = await writeBackupStream(source(), sink, {...options, signal, onProgress: progress, assertCurrent: () => new Promise(resolve => {
				job.current = resolve; send('check');
			})});
			close();
			send('prepared', {file: snapshot, bytes: result.bytes, files: result.files, payloadBytes: result.payloadBytes, digest: sink.digest});
		} catch (error) {
			// writeBackupStream already owns ordinary abort. Failures before it starts and
			// failures after sealing still owe handle release; a sealed archive is retained.
			try { close(); } catch (cleanup) { error = new AggregateError([error, cleanup], 'backup handle release failed'); }
			send('failed', {error: failure(error), disposition: removed ? 'removed' : 'retain'});
		}
	};
	return async request => {
		const id = request?.id;
		if (!Number.isSafeInteger(id) || id < 1) return;
		if (request.operation === 'cancel' && active?.id === id) {
			active.controller.abort(cancelled()); active.current?.(false); active.current = null; return;
		}
		if (request.operation === 'current' && active?.id === id && active.current) {
			active.current(request.current === true); active.current = null; return;
		}
		if (request.operation !== 'prepare' || id <= lastId) return;
		lastId = id;
		if (active) { postMessage({id, operation: 'failed', error: failure(new Error('backup worker is busy')), disposition: 'untouched'}); return; }
		const job = active = {id, controller: new AbortController(), current: null};
		try { await run(request, job); } finally { active = null; }
	};
}

// The page accepts one current response chain, never a File attached to a stale job. This
// owner does not write ready.json or call an exporter: the shell keeps those existing owners.
export function createBackupWorkerClient({postMessage, assertCurrent, onProgress}) {
	let active = null, nextId = 0, retired = false;
	const finish = (job, value, error) => {
		job.signal?.removeEventListener('abort', job.cancel); active = null;
		if (error) job.reject(error); else job.resolve(value);
	};
	const stop = (job, error) => {
		retired = true;
		try { postMessage({id: job.id, operation: 'cancel'}); }
		catch (cleanup) { error = new AggregateError([error, cleanup], 'backup cancellation could not reach the worker'); }
		error.disposition = 'retain'; finish(job, null, error);
	};
	return {
		prepare(request, {signal} = {}) {
			if (retired) return Promise.reject(new Error('backup worker client is retired'));
			if (active) return Promise.reject(new Error('backup worker client is busy'));
			if (signal?.aborted) return Promise.reject(signal.reason || cancelled());
			request = {...request, names: [...request.names], options: {...request.options}};
			return new Promise((resolve, reject) => {
				const job = active = {id: ++nextId, request, resolve, reject, signal, phase: 'starting'};
				job.cancel = () => {
					try { postMessage({id: job.id, operation: 'cancel'}); }
					catch (error) { retired = true; error.disposition = 'retain'; finish(job, null, error); }
				};
				signal?.addEventListener('abort', job.cancel, {once: true});
				try { postMessage({...request, id: job.id, operation: 'prepare'}); }
				catch (error) { finish(job, null, error); }
			});
		},
		fail(error) {
			retired = true;
			if (active) stop(active, error);
		},
		async receive(message) {
			const job = active;
			if (!job || message?.id !== job.id) return false;
			try {
				if (message.operation === 'progress') { if (job.phase === 'starting') job.phase = 'preparing'; onProgress?.(message.value); return true; }
				if (message.operation === 'check') {
					if (job.phase !== 'starting' && job.phase !== 'preparing') return false;
					job.phase = 'checking';
					const current = await assertCurrent();
					if (active !== job) return false;
					const accepted = current === true && !job.signal?.aborted;
					job.phase = accepted ? 'certifying' : 'refused';
					postMessage({id: job.id, operation: 'current', current: accepted}); return true;
				}
				if (message.operation === 'unavailable') {
					if (job.phase !== 'starting') throw new Error('backup capability absence arrived after work started');
					// Cancellation before work owns no completion record and must never enter the fallback.
					if (job.signal?.aborted) finish(job, null, Object.assign(cancelled(), {cause: job.signal.reason, disposition: 'untouched'}));
					else finish(job, {status: 'unavailable'});
					return true;
				}
				if (message.operation === 'failed') {
					const error = Object.assign(new Error(message.error?.message || 'backup worker failed'), {...(message.error?.name === 'QuotaExceededError' ? {name: 'QuotaExceededError'} : {}), disposition: message.disposition === 'removed' || message.disposition === 'untouched' ? message.disposition : 'retain'});
					finish(job, null, error); return true;
				}
				if (message.operation !== 'prepared') return false;
				if (job.phase !== 'certifying') throw new Error('backup worker completed without the current snapshot acknowledgement');
				const {request} = job, record = backupStageRecord({name: request.name, stamp: new Date(request.options.stamp).toISOString(), files: request.names.length, bytes: message.bytes, digest: message.digest});
				if (!(message.file instanceof File) || message.file.size !== record.bytes || message.file.name !== record.name || message.file.type !== 'application/zip' || message.files !== record.files + 1) throw new Error('backup worker completion does not identify its exact File');
				finish(job, {status: job.signal?.aborted ? 'cancelled' : 'prepared', record, file: job.signal?.aborted ? null : message.file}); return true;
			} catch (error) {
				if (active === job) stop(job, error);
				return false;
			}
		}
	};
}

export function installBackupWorker(scope = globalThis) {
	if (typeof scope.document !== 'undefined') throw new Error('backup sync storage needs a dedicated worker');
	const receive = createBackupWorker({postMessage: message => scope.postMessage(message)});
	scope.onmessage = ({data}) => receive(data).catch(error => scope.setTimeout(() => { throw error; }, 0));
}
