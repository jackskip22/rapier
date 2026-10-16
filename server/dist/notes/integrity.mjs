// SPDX-License-Identifier: AGPL-3.0-only
import {createWorkerExecution} from '../shell/worker-execution.mjs';
import {sha256State} from '../kit/ledger/hash.mjs';
export {sha256State};

export function exactBytes(value) {
	if (typeof value === 'string') {
		if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new Error('text contains an unpaired surrogate; exact UTF-8 is not possible');
		return new TextEncoder().encode(value);
	}
	if (value instanceof Uint8Array) return value.slice();
	if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
	throw new TypeError('exact bytes require a string, Uint8Array or ArrayBuffer');
}

const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

function softwareSHA256(bytes) { const hash = sha256State(); hash.update(bytes); return hash.finish(); }

export async function sha256(value, {subtle = globalThis.crypto?.subtle} = {}) {
	const bytes = exactBytes(value);
	return subtle ? hex(new Uint8Array(await subtle.digest('SHA-256', bytes))) : softwareSHA256(bytes);
}

const OFF_THREAD_BYTES = 256 * 1024;
let digestWorker = null;
function workerDigest(input) {
	if (typeof Worker !== 'function' || typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return null;
	if (digestWorker === false) return null;
	if (!digestWorker) {
		try {
			const source = "self.onmessage = async e => { let hex = null; try { const bytes = typeof e.data.text === 'string' ? new TextEncoder().encode(e.data.text) : e.data.bytes; hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join(''); } catch (_) {} self.postMessage({id: e.data.id, hex}); };";
			const worker = createWorkerExecution({source, name: 'rapier-digest'});
			const owner = digestWorker = {worker, serial: 0, pending: new Map()};
			worker.onmessage = event => { const done = owner.pending.get(event.data?.id); owner.pending.delete(event.data?.id); done?.(typeof event.data?.hex === 'string' ? event.data.hex : null); };
			worker.onerror = worker.onmessageerror = () => { digestWorker = false; for (const done of owner.pending.values()) done(null); owner.pending.clear(); try { worker.terminate(); } catch (_) {} };
		} catch (_) { digestWorker = false; return null; }
	}
	const owner = digestWorker, id = ++owner.serial, copy = typeof input === 'string' ? null : input.slice();
	return new Promise(done => {
		owner.pending.set(id, done);
		try { if (copy) owner.worker.postMessage({id, bytes: copy}, [copy.buffer]); else owner.worker.postMessage({id, text: input}); }
		catch (_) { owner.pending.delete(id); done(null); }
	});
}
export async function sha256TextOffThread(text) {
	if (typeof text !== 'string') throw new TypeError('A text digest needs a string.');
	return workerDigest(text);
}

export async function sha256Yielding(bytes, {signal, subtle = globalThis.crypto?.subtle} = {}) {
	if (!(bytes instanceof Uint8Array)) throw new TypeError('A digest needs a byte view.');
	checkByteAbort(signal);
	if (subtle?.digest && subtle === globalThis.crypto?.subtle && bytes.byteLength >= OFF_THREAD_BYTES) {
		const hex = await workerDigest(bytes);
		checkByteAbort(signal);
		if (hex) return hex;
	}
	if (subtle?.digest) {
		try {
			const digest = await subtle.digest('SHA-256', bytes);
			checkByteAbort(signal);
			return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
		} catch (error) { checkByteAbort(signal); }
	}
	const hash = sha256State(), now = () => globalThis.performance?.now() ?? Date.now();
	for (let at = 0, turn = now(); at < bytes.byteLength; at += 65536) {
		if (now() - turn >= 8) { await new Promise(resolve => setTimeout(resolve, 0)); checkByteAbort(signal); turn = now(); }
		hash.update(bytes.subarray(at, at + 65536));
	}
	checkByteAbort(signal);
	return hash.finish();
}

export const BYTE_CHUNK_BYTES = 1024 * 1024;
export function checkByteAbort(signal) {
	if (signal?.aborted) throw Object.assign(new Error('File copy canceled. No unfinished file was kept.'), {name: 'AbortError', code: 'cancelled'});
}
export async function* blobByteChunks(blob, {signal, chunkBytes = BYTE_CHUNK_BYTES} = {}) {
	if (!(blob instanceof Blob) || !Number.isSafeInteger(blob.size) || blob.size < 0) throw new TypeError('A file copy needs an original Blob with an exact size.');
	if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > BYTE_CHUNK_BYTES) throw new RangeError('File chunks must be between 1 byte and 1 MiB.');
	checkByteAbort(signal);
	for (let at = 0; at < blob.size; at += chunkBytes) {
		checkByteAbort(signal);
		const end = Math.min(blob.size, at + chunkBytes), bytes = new Uint8Array(await blob.slice(at, end).arrayBuffer());
		checkByteAbort(signal);
		if (bytes.length !== end - at) throw Object.assign(new Error('The selected file changed or could not be read completely. Keep the original file.'), {code: 'verify'});
		yield bytes;
	}
}
export async function digestByteChunks(chunks, {size, signal, onProgress} = {}) {
	const hash = sha256State(); let done = 0;
	checkByteAbort(signal);
	for await (const bytes of chunks) {
		checkByteAbort(signal);
		if (!(bytes instanceof Uint8Array)) throw new TypeError('A file digest needs byte chunks.');
		done += bytes.length;
		if (!Number.isSafeInteger(done) || size !== undefined && done > size) throw new Error('The file grew while it was being verified.');
		hash.update(bytes); onProgress?.(done);
	}
	checkByteAbort(signal);
	if (size !== undefined && done !== size) throw new Error('The file ended before its reported size.');
	return hash.finish();
}
export function byteCopyError(error) {
	if (error?.name === 'QuotaExceededError' || error?.code === 'ENOSPC') return Object.assign(new Error('Not enough storage to keep this file, so no link was added: free some space and try again.'), {code: 'quota', cause: error});
	return error;
}
export async function storedFileDigest(store, name, {signal, onProgress} = {}) {
	if (typeof store.readChunks !== 'function') {
		const bytes = await store.read(name); checkByteAbort(signal);
		return bytes == null ? null : sha256(bytes);
	}
	let opened;
	const chunks = store.readChunks(name, {signal, onOpen: info => { opened = info; }});
	const hash = sha256State(); let done = 0;
	for await (const bytes of chunks) { checkByteAbort(signal); hash.update(bytes); done += bytes.length; onProgress?.(done); }
	checkByteAbort(signal);
	if (opened === undefined) throw new Error('The file store did not report the file it read.');
	if (opened === null) { if (done) throw new Error('A missing file returned bytes.'); return null; }
	if (done !== opened.size) throw new Error('The file ended before its reported size.');
	return hash.finish();
}
