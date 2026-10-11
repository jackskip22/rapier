// SPDX-License-Identifier: AGPL-3.0-only
// Hash the bytes that will be kept, never a cleaned or re-encoded projection.
export function exactBytes(value) {
	if (typeof value === 'string') {
		if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new Error('text contains an unpaired surrogate; exact UTF-8 is not possible');
		return new TextEncoder().encode(value);
	}
	if (value instanceof Uint8Array) return value.slice();
	if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
	throw new TypeError('exact bytes require a string, Uint8Array or ArrayBuffer');
}

const K = new Int32Array([
	0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
	0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
	0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
	0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
	0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
	0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
	0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
	0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

// FIPS 180-4 SHA-256, block by block: file: and older hosts can lack SubtleCrypto.
// The fallback has the same digest, a fixed 64-word workspace and no weaker checksum.
export function sha256State() {
	const state = new Int32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
	const w = new Int32Array(64), tail = new Uint8Array(128);
	// One block: the schedule read straight from the bytes, the eight working words held in locals.
	const process = (b, o) => {
		for (let i = 0; i < 16; i++, o += 4) w[i] = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
		for (let i = 16; i < 64; i++) {
			const x = w[i - 15], y = w[i - 2];
			w[i] = (w[i - 16] + (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + w[i - 7] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) | 0;
		}
		let a = state[0], b2 = state[1], c = state[2], d = state[3], e = state[4], f = state[5], g = state[6], h = state[7];
		for (let i = 0; i < 64; i++) {
			const t = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
			const u = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b2) ^ (a & c) ^ (b2 & c))) | 0;
			h = g; g = f; f = e; e = (d + t) | 0; d = c; c = b2; b2 = a; a = (t + u) | 0;
		}
		state[0] += a; state[1] += b2; state[2] += c; state[3] += d; state[4] += e; state[5] += f; state[6] += g; state[7] += h;
	};
	let length = 0, pending = 0, done = false;
	return {
		update(bytes) {
			if (done || !(bytes instanceof Uint8Array)) throw new TypeError('SHA-256 needs bytes before finish');
			if (!Number.isSafeInteger(length + bytes.length)) throw new Error('SHA-256 input length is not exact');
			length += bytes.length;
			let at = 0;
			if (pending) {
				const take = Math.min(64 - pending, bytes.length);
				tail.set(bytes.subarray(0, take), pending); pending += take; at += take;
				if (pending === 64) { process(tail, 0); pending = 0; }
			}
			for (; at + 64 <= bytes.length; at += 64) process(bytes, at);
			if (at < bytes.length) { tail.set(bytes.subarray(at), pending); pending += bytes.length - at; }
		},
		finish() {
			if (done) throw new Error('SHA-256 is already finished');
			done = true;
			tail.fill(0, pending); tail[pending] = 0x80;
			const end = pending < 56 ? 64 : 128, view = new DataView(tail.buffer);
			view.setUint32(end - 8, Math.floor(length / 0x20000000)); view.setUint32(end - 4, (length * 8) >>> 0);
			process(tail, 0); if (end === 128) process(tail, 64);
			return [...state].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
		}
	};
}
function softwareSHA256(bytes) { const hash = sha256State(); hash.update(bytes); return hash.finish(); }

export async function sha256(value, {subtle = globalThis.crypto?.subtle} = {}) {
	const bytes = exactBytes(value);
	return subtle ? hex(new Uint8Array(await subtle.digest('SHA-256', bytes))) : softwareSHA256(bytes);
}

// One worker per page hashes large views and texts with the native digest. Null when a page cannot start it or it fails; the caller then
// hashes in place. Node and workers have no document and hash in place.
const OFF_THREAD_BYTES = 256 * 1024;
let digestWorker = null;
function workerDigest(input) {
	if (typeof Worker !== 'function' || typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return null;
	if (digestWorker === false) return null;
	if (!digestWorker) {
		try {
			const source = "self.onmessage = async e => { let hex = null; try { const bytes = typeof e.data.text === 'string' ? new TextEncoder().encode(e.data.text) : e.data.bytes; hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join(''); } catch (_) {} self.postMessage({id: e.data.id, hex}); };";
			const worker = new Worker(URL.createObjectURL(new Blob([source], {type: 'text/javascript'})));
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
// The SHA-256 of a text's TextEncoder bytes, encoded and hashed by the page's digest worker. Null where there is none.
export async function sha256TextOffThread(text) {
	if (typeof text !== 'string') throw new TypeError('A text digest needs a string.');
	return workerDigest(text);
}

// Bounded file intake and read-back share this iterator. Never ask a large Blob for its
// whole ArrayBuffer; a source that cannot return the exact requested slice is not published.
// Hash a privately owned byte view without a whole-view clone or a long portable task. Native
// crypto is asynchronous; a host without it still verifies, yielding between bounded turns.
// Callers retain custody of the view until this resolves (paint readouts are transferred copies).
export async function sha256Yielding(bytes, {signal, subtle = globalThis.crypto?.subtle} = {}) {
	if (!(bytes instanceof Uint8Array)) throw new TypeError('A digest needs a byte view.');
	checkByteAbort(signal);
	// A page's native digest runs on its main thread: megabytes at a slow phone's pace are a 100 ms task. A worker hashes a copy.
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
	// 64 KiB slices, yielding once a turn has spent about 8 ms (a timer per slice would cost a browser's 4 ms clamp each).
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
	if (signal?.aborted) throw Object.assign(new Error('File copy cancelled. No unfinished file was kept.'), {name: 'AbortError', code: 'cancelled'});
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
// A missing file and a failed read are different facts. Digest without whole-file allocation
// when a byte port supplies chunks (also used by the existing deletion journal).
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
