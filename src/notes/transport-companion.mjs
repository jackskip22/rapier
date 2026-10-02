// SPDX-License-Identifier: AGPL-3.0-only
// The page's transport where Rapier has no network (Android): the engine's three verbs over the app's seam
// (shell/platform.js host.syncTransport) to Rapier Sync, which holds the destination and its credential. What
// crosses is the public vault id, an object's address, its size and digest, and the sealed bytes themselves: never
// a URL, a bucket, a credential, a note, a name or the vault key. Objects move in the seam's 128 KiB frames; the
// app checks each one against its address in both directions, and so does this file.
import {asBytes, byteCount, fail, isProviderRefusal, refuse} from './provider-http.mjs';
import {objectKey, objectPrefix, listOptions, vaultName, verifyBytes, capabilities} from './provider-objects.mjs';

export const COMPANION_CHUNK = 128 * 1024;
export const COMPANION_MAX_BYTES = 300000000;
// Rapier Sync's refusal codes, as the engine's provider codes. The companion's own words never reach the page.
const CODES = Object.freeze({NOT_CONFIGURED: 'config', PRO_REQUIRED: 'pro_required', AUTH: 'auth', PERMISSION: 'permission', RATE: 'rate', SERVER: 'server',
	NETWORK: 'network', UNCONFIRMED: 'network', PAUSED: 'cancelled', BUSY: 'rate', TOO_LARGE: 'too_large', BUCKET: 'bucket',
	REDIRECT: 'redirect', DIGEST: 'ciphertext', ABSENT: 'response', PROTOCOL: 'protocol', CAPABILITY: 'protocol', AUTHORITY: 'authority'});

export function createCompanionTransport({call, vaultId} = {}) {
	if (typeof call !== 'function') refuse('config', 'this device has no rapier sync seam');
	vaultName(vaultId);
	let paused = false;
	const check = () => { if (paused) refuse('cancelled', 'sync is paused; local work is kept'); };
	// A refusal names its code; anything else the seam threw is an unconfirmed outcome, and the work stays queued.
	function translate(error) {
		if (isProviderRefusal(error)) return error;
		const code = /\(([A-Z_]{1,32})\)$/.exec(String(error?.message || ''))?.[1] || error?.refused;
		if (code === 'NOT_CONFIGURED') return fail('config', 'open rapier sync and approve this vault’s storage; nothing was sent.');
		return fail(CODES[code] || 'network', 'rapier sync did not finish this transfer; your notes, and what waits to upload, are kept.');
	}
	async function ask(operation, args) {
		check();
		try { return await call(operation, args); } catch (error) { throw translate(error); }
	}
	const answered = value => value && typeof value === 'object' && !Array.isArray(value) ? value : refuse('response', 'rapier sync answered in an unreadable form');
	const transport = {
		capabilities: Object.freeze({...capabilities(COMPANION_MAX_BYTES), listsFrom: true}),
		pause() { paused = true; },
		async put(key, value, condition) {
			objectKey(key);
			if (condition && Object.keys(condition).length) refuse('conditional', 'conditional writes are not part of this transport; nothing was sent');
			const source = asBytes(value);
			if (source.byteLength > COMPANION_MAX_BYTES) refuse('too_large', 'this complete object exceeds the transport budget; the original remains local');
			const bytes = await verifyBytes(key, source.slice());
			const {transfer} = answered(await ask('put.begin', {vault: vaultId, key, size: bytes.length, sha256: key.slice(-64)}));
			if (typeof transfer !== 'string' || !/^[a-f0-9]{32}$/.test(transfer)) refuse('response', 'rapier sync answered in an unreadable form');
			try {
				for (let at = 0; at < bytes.length; at += COMPANION_CHUNK) {
					const chunk = bytes.subarray(at, Math.min(bytes.length, at + COMPANION_CHUNK));
					const got = answered(await ask('put.chunk', {transfer, offset: at, bytes: chunk}));
					if (got.offset !== at + chunk.length) refuse('response', 'rapier sync did not receive this object whole');
				}
				const done = answered(await ask('put.end', {transfer}));
				if (done.sha256 !== key.slice(-64) || done.size !== bytes.length) refuse('response', 'rapier sync confirmed another object');
			} catch (error) {
				try { await call('cancel', {transfer}); } catch {}
				throw error;
			}
			return {key, etag: '', size: bytes.length};
		},
		async get(key) {
			objectKey(key);
			const begun = answered(await ask('get.begin', {vault: vaultId, key}));
			if (begun.missing === true) return null;
			const {transfer} = begun, size = byteCount(begun.size);
			if (typeof transfer !== 'string' || !/^[a-f0-9]{32}$/.test(transfer) || begun.sha256 !== key.slice(-64)) refuse('response', 'rapier sync answered in an unreadable form');
			try {
				if (size > COMPANION_MAX_BYTES) refuse('too_large', 'this complete object exceeds the transport budget');
				const bytes = new Uint8Array(size);
				for (let at = 0; at < size; at += COMPANION_CHUNK) {
					const count = Math.min(COMPANION_CHUNK, size - at);
					const got = answered(await ask('get.chunk', {transfer, offset: at, size: count}));
					if (got.offset !== at || !(got.bytes instanceof Uint8Array) || got.bytes.length !== count) refuse('response', 'rapier sync did not return this object whole');
					bytes.set(got.bytes, at);
				}
				await verifyBytes(key, bytes);
				return {key, bytes, etag: '', size};
			} finally { try { await call('get.end', {transfer}); } catch {} }
		},
		async list(prefix, cursor = null, options = {}) {
			objectPrefix(prefix);
			if (cursor !== null && (typeof cursor !== 'string' || !cursor || cursor.length > 8192)) refuse('cursor', 'invalid provider cursor');
			const {startAfter, delimiter} = listOptions(prefix, options);
			const page = answered(await ask('list', {vault: vaultId, prefix, cursor, startAfter, grouped: delimiter !== null}));
			if (!Array.isArray(page.keys) || !Array.isArray(page.prefixes) || typeof page.truncated !== 'boolean' ||
				page.keys.length + page.prefixes.length > 1000 || delimiter === null && page.prefixes.length) refuse('response', 'the listing is not readable');
			const seen = new Set();
			const keys = page.keys.map(row => {
				if (!row || typeof row.key !== 'string' || !row.key.startsWith(prefix) || seen.has(row.key)) refuse('authority', 'the listing named an object outside the requested scope');
				objectKey(row.key); seen.add(row.key);
				return {key: row.key, etag: typeof row.etag === 'string' ? row.etag : '', size: row.size == null ? null : byteCount(row.size)};
			});
			const prefixes = page.prefixes.map(group => {
				if (typeof group !== 'string' || !group.startsWith(prefix) || !/^heads\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/$/.test(group) || seen.has(group)) refuse('authority', 'the listing grouped outside the requested scope');
				seen.add(group); return group;
			});
			const next = page.cursor ?? null;
			if (page.truncated !== (next !== null) || next !== null && (typeof next !== 'string' || !next || next.length > 8192 || next === cursor)) refuse('cursor', 'the listing did not advance its cursor');
			return {keys, ...(delimiter === null ? {} : {prefixes}), truncated: page.truncated, cursor: next};
		},
		async stat(key) {
			objectKey(key);
			const page = await transport.list(key);
			return page.keys.find(row => row.key === key) || null;
		},
		async delete() { refuse('keep', 'sync never deletes remote objects; vault retirement requires a separate reviewed operation'); },
	};
	return Object.freeze(transport);
}
