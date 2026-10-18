// SPDX-License-Identifier: AGPL-3.0-only
import {exactBytes, blobByteChunks, digestByteChunks, checkByteAbort} from './integrity.mjs';
import {FOLDERS, parts} from './opfs-paths.mjs';
import {recordingStem} from './recording-files.mjs';

const SCOPE = 'rapier-notes:notes', RECORDING_SCOPE = 'rapier-notes-recording:notes:', PRIVATE = '.rapier/notes/', PUBLIC = 'notes/';
const FILE_BYTES = 16 * 1024 * 1024, SOURCE_BYTES = 2 * 1024 * 1024, PAGE_BYTES = 1024 * 1024, FILES = 1024;
const fail = (code, message) => Object.assign(new Error(message), {code});
const abortError = () => Object.assign(new DOMException('', 'AbortError'), {name: 'AbortError', code: 'cancelled'});
const strongEtag = value => {
	if (typeof value !== 'string' || !/^"[\x21\x23-\x7e]+"$/.test(value)) throw fail('protocol', 'A saved file could not be read; nothing was lost.');
	return value;
};
const physical = name => {
	const path = parts(name);
	if (/[\u0000-\u001f\u007f]/.test(name) || name.length > 1000 || path.some(part => [...part].length > 255)) throw fail('name', 'This file does not belong to the notes folder.');
	return (path.length === 1 ? name === 'notes.json' || name.startsWith('.') : !['audio', 'attachments'].includes(path[0])) ? PRIVATE + name : PUBLIC + name;
};
const limitFor = name => physical(name).startsWith(PUBLIC) && !name.includes('/') ? SOURCE_BYTES : FILE_BYTES;
const metadata = response => {
	const value = response.headers.get('Content-Length'), size = value !== null && /^\d+$/.test(value) ? Number(value) : NaN;
	if (!Number.isSafeInteger(size) || size < 0 || size > FILE_BYTES) throw fail('protocol', 'A saved file could not be read; nothing was lost.');
	return {size, modified: null, etag: strongEtag(response.headers.get('ETag'))};
};

export function createWorkspaceNotes({url = globalThis.location?.href, fetch: send = globalThis.fetch?.bind(globalThis),
	channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('rapier-notes') : null,
	token = () => crypto.randomUUID(), clock = () => Date.now(), timers = globalThis,
	beforeStep = async () => {}, afterStep = async () => {}} = {}) {
	const origin = new URL(url);
	if (!/^https?:$/.test(origin.protocol) || typeof send !== 'function') throw fail('workspace', 'the notes folder could not be read');
	const leases = new Map(); let prepared = false;
	const check = lease => {
		if (lease && (!lease.active || lease.error || clock() >= lease.expiresAt)) throw lease.error || fail('released', 'This notes transaction no longer owns the folder.');
	};
	const held = () => { const lease = leases.get(SCOPE); check(lease); return lease; };
	const writer = () => { const lease = held(); if (!lease) throw fail('ownership', 'This notes transaction no longer owns the folder.'); return lease; };
	const recordingFor = name => { const stem = recordingStem(name), lease = stem ? leases.get(RECORDING_SCOPE + stem) : null; check(lease); return lease; };
	const endpoint = (name, query = {}) => {
		const value = new URL('/workspace/' + name, origin);
		for (const [key, item] of Object.entries(query)) value.searchParams.set(key, item);
		return value.href;
	};
	const request = async (name, {query, method = 'GET', headers = {}, body, signal, lease, recording} = {}) => {
		check(lease); check(recording); if (signal?.aborted) throw abortError();
		const abort = new AbortController(), signals = [signal, lease?.abort.signal, recording?.abort.signal].filter(Boolean);
		const cancel = () => abort.abort(), timer = timers.setTimeout(cancel, 30000);
		for (const source of signals) { if (source.aborted) cancel(); else source.addEventListener('abort', cancel, {once: true}); }
		try {
			const response = await send(endpoint(name, query), {method, headers: {...headers, ...(lease ? {'X-Rapier-Notes-Lease': lease.id} : {}),
				...(recording ? {'X-Rapier-Recording-Lease': recording.id} : {})},
				body, signal: abort.signal, credentials: 'same-origin', cache: 'no-store', redirect: 'error'});
			check(lease); check(recording); if (signal?.aborted) throw abortError();
			return response;
		} finally { timers.clearTimeout(timer); for (const source of signals) source.removeEventListener('abort', cancel); }
	};
	async function* responseChunks(response, {limit, chunkBytes = 1024 * 1024, signal, lease, recording} = {}) {
		const reader = response.body?.getReader(); let size = 0, complete = false;
		if (!reader) return;
		let stopped;
		const cancel = () => { stopped = abortError(); void reader.cancel().catch(() => {}); };
		const signals = [signal, lease?.abort.signal, recording?.abort.signal].filter(Boolean), timer = timers.setTimeout(cancel, 30000);
		for (const source of signals) { if (source.aborted) cancel(); else source.addEventListener('abort', cancel, {once: true}); }
		try {
			for (;;) {
				check(lease); check(recording); checkByteAbort(signal);
				const {done, value} = await reader.read(); if (stopped) throw stopped; if (done) { complete = true; break; }
				check(lease); check(recording); checkByteAbort(signal);
				if (!(value instanceof Uint8Array)) throw fail('protocol', 'A saved file could not be read; nothing was lost.');
				size += value.length;
				if (!Number.isSafeInteger(size) || size > limit) throw fail('protocol', 'A saved file could not be read; nothing was lost.');
				for (let at = 0; at < value.length; at += chunkBytes) yield value.subarray(at, at + chunkBytes);
			}
		} finally {
			timers.clearTimeout(timer); for (const source of signals) source.removeEventListener('abort', cancel);
			if (!complete) await reader.cancel().catch(() => {}); reader.releaseLock();
		}
	}
	const readJSON = async (response, limit, lease) => {
		const chunks = []; let size = 0;
		for await (const chunk of responseChunks(response, {limit, lease})) { chunks.push(chunk); size += chunk.length; }
		const bytes = new Uint8Array(size); let at = 0;
		for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
		try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
		catch (_) { throw fail('protocol', 'A saved file could not be read; nothing was lost.'); }
	};
	const accepted = async response => {
		if (response.ok) return;
		await response.body?.cancel();
		if (response.status === 404) throw fail('missing', 'no such note');
		if (response.status === 412) throw fail('changed', 'The notes folder changed while being read.');
		if (response.status === 401 || response.status === 403) throw fail('sign-in', 'the notes folder could not be read');
		if (response.status === 409 || response.status === 423) throw fail('busy', 'This notes transaction no longer owns the folder.');
		if ([413, 429, 507].includes(response.status)) throw fail('workspace-limit', 'The note could not be changed. Try again.');
		throw fail('workspace', 'the notes folder could not be read');
	};
	const observe = (lease, name, info) => {
		check(lease); if (!lease) return;
		const etag = info?.etag ?? null;
		if (lease.revisions.has(name) && lease.revisions.get(name) !== etag) throw fail('changed', 'The notes folder changed while being read.');
		lease.revisions.set(name, etag);
	};
	const revisionHeaders = (lease, name) => lease?.revisions.get(name) ? {'If-Match': lease.revisions.get(name)} : {};
	const stat = async name => {
		const path = physical(name), lease = held(), recording = recordingFor(name);
		await beforeStep('read', name);
		const response = await request('files', {query: {path}, method: 'HEAD', headers: revisionHeaders(lease, name), lease, recording});
		if (response.status === 404) { observe(lease, name, null); return null; }
		await accepted(response); const info = metadata(response); observe(lease, name, info); return info;
	};
	async function* readChunks(name, {chunkBytes = 1024 * 1024, signal, onOpen} = {}) {
		const path = physical(name), lease = held(), recording = recordingFor(name);
		if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > 1024 * 1024) throw fail('protocol', 'File chunks must be between 1 byte and 1 MiB.');
		await beforeStep('read', name);
		const response = await request('files', {query: {path}, headers: revisionHeaders(lease, name), signal, lease, recording});
		if (response.status === 404) { await response.body?.cancel(); observe(lease, name, null); onOpen?.(null); return; }
		await accepted(response); let size = 0;
		try {
			const info = metadata(response); observe(lease, name, info); onOpen?.(info);
			for await (const chunk of responseChunks(response, {limit: info.size, chunkBytes, signal, lease, recording})) { size += chunk.length; yield chunk; }
			if (size !== info.size) throw fail('verify', 'The file ended before its reported size.');
		} finally { if (!response.body?.locked) await response.body?.cancel().catch(() => {}); }
	}
	const read = async name => {
		let bytes = null, offset = 0;
		for await (const chunk of readChunks(name, {onOpen: info => { if (info) bytes = new Uint8Array(info.size); }})) { bytes.set(chunk, offset); offset += chunk.length; }
		return bytes;
	};
	const expected = async (lease, name) => {
		if (!lease.revisions.has(name) && await stat(name) !== null) throw fail('unread-write', 'The notes folder changed; reload it before saving.');
		check(lease); return lease.revisions.get(name);
	};
	const put = async (lease, name, body, size, signal) => {
		if (size > limitFor(name)) throw fail('workspace-limit', 'The note could not be changed. Try again.');
		const recording = recordingFor(name), before = await expected(lease, name);
		const response = await request('files', {query: {path: physical(name)}, method: 'PUT', body, signal, lease, recording,
			headers: {'Content-Type': /\.md$/i.test(name) ? 'text/markdown; charset=utf-8' : 'application/octet-stream',
				...(before === null ? {'If-None-Match': '*'} : {'If-Match': before})}});
		await accepted(response);
		try { lease.revisions.set(name, strongEtag(response.headers.get('ETag'))); }
		finally { await response.body?.cancel(); }
	};
	const write = async (name, value) => {
		physical(name); const bytes = exactBytes(value), lease = writer(), recording = recordingFor(name);
		await beforeStep('write', name, bytes); await put(lease, name, bytes, bytes.length);
		let offset = 0;
		for await (const chunk of readChunks(name, {onOpen: info => { if (info?.size !== bytes.length) throw fail('verify', 'The notes folder readback has a different size; this write is not verified'); }})) {
			if (chunk.some((byte, at) => byte !== bytes[offset + at])) throw fail('verify', 'The notes folder readback has different bytes; this write is not verified');
			offset += chunk.length;
		}
		check(lease); check(recording); await afterStep('write', name, bytes);
	};
	const writeBlob = async (name, blob, {signal, onProgress} = {}) => {
		physical(name); const lease = writer(), recording = recordingFor(name);
		if (!(blob instanceof Blob)) throw new TypeError('A file copy needs an original Blob.');
		if (blob.size > limitFor(name)) throw fail('workspace-limit', 'The note could not be changed. Try again.');
		checkByteAbort(signal); await beforeStep('write', name, blob);
		if (await stat(name) !== null) throw fail('collision', 'Another file already uses ' + name + '. It was kept.');
		const digest = await digestByteChunks(blobByteChunks(blob, {signal}), {size: blob.size, signal,
			onProgress: done => onProgress?.({phase: 'hashing', done, total: blob.size})});
		onProgress?.({phase: 'writing', done: 0, total: blob.size}); await put(lease, name, blob, blob.size, signal);
		const actual = await digestByteChunks(readChunks(name, {signal, onOpen: info => {
			if (info?.size !== blob.size) throw fail('verify', 'The notes folder readback has a different size; this write is not verified');
		}}), {size: blob.size, signal, onProgress: done => onProgress?.({phase: 'verifying', done, total: blob.size})});
		if (actual !== digest) throw fail('verify', 'The notes folder readback has different bytes; this write is not verified');
		check(lease); check(recording); await afterStep('write', name, blob); return {size: blob.size, digest};
	};
	const assertRemovable = name => {
		const path = physical(name);
		if (!path.startsWith(PRIVATE)) throw fail('delete-unavailable', 'The notes folder did not remove ' + name + '.');
	};
	const remove = async name => {
		assertRemovable(name); const path = physical(name), lease = writer(), recording = recordingFor(name);
		await beforeStep('remove', name); const before = await expected(lease, name);
		if (before !== null) {
			await accepted(await request('files', {query: {path}, method: 'DELETE', headers: {'If-Match': before}, lease, recording}));
			lease.revisions.set(name, null);
		}
		if (await stat(name) !== null) throw fail('verify', 'The notes folder did not remove ' + name + '.');
		await afterStep('remove', name);
	};
	const statAll = async (prefix = '') => {
		if (!FOLDERS.has(prefix)) throw fail('name', 'This folder is not part of Notes.');
		const lease = held(), out = new Map(), roots = prefix ? [physical(prefix + '/_').slice(0, -1)] : [PUBLIC, PRIVATE];
		let count = 0;
		for (const root of roots) {
			const cursors = new Set(); let cursor;
			do {
				const response = await request('files', {query: {prefix: root, ...(cursor ? {cursor} : {})}, lease});
				await accepted(response); const page = await readJSON(response, PAGE_BYTES, lease);
				if (!Array.isArray(page?.files) || page.files.length > 1000 || !Number.isSafeInteger(count += page.files.length) || count > FILES)
					throw fail('protocol', 'A saved file could not be read; nothing was lost.');
				for (const row of page.files) {
					if (typeof row?.path !== 'string' || !row.path.startsWith(root)) throw fail('protocol', 'This file does not belong to the notes folder.');
					const leaf = row.path.slice(root.length); if (leaf.includes('/')) continue;
					const name = prefix ? prefix + '/' + leaf : leaf;
					if (physical(name) !== row.path) continue;
					if (!Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > FILE_BYTES || out.has(leaf)) throw fail('protocol', 'A saved file could not be read; nothing was lost.');
					const info = {size: row.bytes, modified: null, etag: strongEtag('"' + row.etag + '"')};
					observe(lease, name, info); out.set(leaf, info);
				}
				cursor = page.cursor;
				if (cursor !== undefined && (typeof cursor !== 'string' || !cursor || cursor.length > 4096 || cursors.has(cursor)) || page.complete === false && !cursor)
					throw fail('protocol', 'A saved file could not be read; nothing was lost.');
				if (cursor) cursors.add(cursor);
			} while (cursor);
		}
		return out;
	};
	const leaseCall = async (action, lease, signal, ifAvailable = false) => {
		const response = await request('lease', {method: 'POST', headers: {'Content-Type': 'application/json'}, signal,
			body: JSON.stringify({action, id: lease.id, name: lease.name, ...(ifAvailable ? {ifAvailable: true} : {})})});
		if ((response.status === 409 || response.status === 423) && action === 'acquire') { await response.body?.cancel(); return {acquired: false}; }
		await accepted(response); return readJSON(response, 4096);
	};
	const locks = {async request(name, options, run) {
		const stem = typeof name === 'string' && name.startsWith(RECORDING_SCOPE) ? name.slice(RECORDING_SCOPE.length) : null;
		if (!(name === SCOPE || stem && recordingStem(stem + '.json') === stem) || options?.mode !== 'exclusive' || typeof run !== 'function')
			throw fail('ownership', 'A notes folder needs a stable lock scope.');
		const lease = {name, id: token(), revisions: new Map(), active: false, abort: new AbortController()};
		let renewal, timer, result, error, acquired = false, attempted = false;
		const install = answer => {
			if (answer?.acquired !== true || !Number.isSafeInteger(answer.expiresAt) || answer.expiresAt <= clock()) throw fail('busy', 'Another Rapier is writing these notes. Try again when it has finished or closed.');
			lease.expiresAt = answer.expiresAt; lease.active = true;
		};
		const renew = () => { timer = timers.setTimeout(() => {
			renewal = leaseCall('renew', lease).then(answer => { install(answer); renew(); }).catch(why => { lease.error = why; lease.active = false; lease.abort.abort(); });
		}, 10000); };
		try {
			for (;;) {
				if (options.signal?.aborted) throw abortError();
				attempted = true; const answer = await leaseCall('acquire', lease, options.signal, options.ifAvailable);
				if (answer?.acquired === true) { install(answer); acquired = true; leases.set(name, lease); renew(); break; }
				if (answer?.acquired !== false) throw fail('protocol', 'A notes folder needs a stable lock scope.');
				if (options.ifAvailable) return await run(null);
				await new Promise(resolve => timers.setTimeout(resolve, 100));
			}
			result = await run({name, mode: 'exclusive'}); check(lease);
		} catch (why) { error = why; }
		finally {
			timers.clearTimeout(timer); await renewal; timers.clearTimeout(timer);
			lease.active = false; lease.abort.abort(); if (leases.get(name) === lease) leases.delete(name);
			if (attempted) {
				try { const answer = await leaseCall('release', lease); if (acquired && answer?.released !== true && !error) throw fail('released', 'This notes transaction no longer owns the folder.'); }
				catch (why) { error ||= why; }
			}
		}
		if (error) throw error; return result;
	}};
	const store = {read, readChunks, stat, statAll, write, writeBlob, remove, assertRemovable, list: async prefix => [...(await statAll(prefix)).keys()],
		async prepare() { if (!prepared) { await statAll(); prepared = true; } return true; },
		get writable() { return true; }, durable: true, ascii: false, streamingAttachments: true};
	return {store, locks, channel, scope: 'notes'};
}
