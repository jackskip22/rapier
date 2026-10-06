import {createHTTP, asBytes, byteCount as size, fail, refuse, jsonBody} from './provider-http.mjs';
import {objectKey, objectPrefix, listOptions} from './provider-objects.mjs';
// Cloudflare REST, exclusively inside the network-enabled companion. No ambient fetch, no endpoint
// override, no VDK, no mutable head, no implicit DELETE. Application scope is NOT a narrower
// provider grant.
export const R2_API_ORIGIN = 'https://api.cloudflare.com';
export const R2_API_PREFIX = '/client/v4';
export const PUT_MAX_BYTES = 300000000; // Conservative decimal interpretation of the REST 300 MB limit.
export const RETRY_CAP = 4;
export const RETRY_BASE_MS = 200;
export const RETRY_MAX_MS = 2000;
export const SEAMS = Object.freeze({
	s3SigV4: 'not implemented; this adapter accepts REST bearer credentials, not S3 access keys',
	workerOnlyIf: 'not implemented; immutable names do not require a Worker or conditional PUT',
});
export function encodeObjectKey(key) { return String(key).split('/').map(encodeURIComponent).join('/'); }
export function objectUrl(accountId, bucket, key) {
	return `${R2_API_ORIGIN}${R2_API_PREFIX}/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucket)}/objects${key ? '/' + encodeObjectKey(key) : ''}`;
}
export function createR2Transport(options = {}) {
	const {fetch: fetchFn, accountId, bucket, token, vaultId, signal} = options;
	if (typeof fetchFn !== 'function') refuse('fetch', 'an injected companion fetch is required');
	if (Object.hasOwn(options, 'origin')) refuse('authority', 'the provider endpoint cannot be overridden');
	if (!/^[a-f0-9]{32}$/.test(accountId || '') || !/^[a-f0-9]{32}$/.test(vaultId || '') ||
		!(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/).test(bucket || '')) refuse('config', 'a Cloudflare account, private bucket, and opaque vault id are required');
	if (typeof token !== 'string' || !token || /[\x00-\x20\x7f]/.test(token)) refuse('auth', 'a nonempty REST bearer credential is required');
	const timeoutMs = options.timeoutMs ?? 30000;
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) refuse('config', 'the request deadline must be between 1 and 300000 milliseconds');
	const jurisdiction = options.jurisdiction ?? 'default';
	if (!['default', 'eu', 'us', 'fedramp', 'fedramp-high'].includes(jurisdiction)) refuse('config', 'unknown bucket jurisdiction');
	const root = `rapier/${vaultId}/`;
	const maxReadBytes = options.maxReadBytes ?? PUT_MAX_BYTES;
	if (!Number.isSafeInteger(maxReadBytes) || maxReadBytes < 1 || maxReadBytes > PUT_MAX_BYTES) refuse('config', 'invalid complete-object read budget');
	const wait = options.wait;
	const http = createHTTP({fetch: fetchFn, signal, timeoutMs, wait}), check = http.check;
	const keyCheck = objectKey;
	function noConditional(condition) { if (condition && Object.keys(condition).length) refuse('conditional', 'REST conditional writes are not supported; no request was sent'); }
	async function request(method, key, {body, query, json = false} = {}) {
		const base = objectUrl(accountId, bucket, key ? root + key : null), url = base + (query ? '?' + query : '');
		const res = await http.retry(() => http.request(url, {origin: R2_API_ORIGIN, method, body,
			headers: {Authorization: 'Bearer ' + token, 'cf-r2-jurisdiction': jurisdiction, ...(body ? {'Content-Type': 'application/octet-stream'} : {})},
			maxBytes: json ? 4 * 1024 * 1024 : maxReadBytes,
			inspect: response => {
				if (response.status === 401) refuse('auth', 'the credential was refused; reconnect in Rapier Sync');
				if (response.status === 403) refuse('permission', 'the selected account or bucket did not grant this operation');
				if (response.status === 404 || response.status === 429 || response.status >= 500) return false;
				if (response.status < 200 || response.status >= 300) refuse('http', 'the provider refused the operation (HTTP ' + response.status + ')');
			},
		}), response => response.status === 429 || response.status >= 500
			? {error: fail(response.status === 429 ? 'rate' : 'server', 'the provider is temporarily refusing requests; work is kept')} : null,
		true, attempt => Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt));
		if (res.status === 404) return null;
		if (!json) return {bytes: res.bytes, etag: res.headers?.get('etag') || '', size: res.bytes.length};
		const parsed = jsonBody(res);
		if (parsed?.success !== true) refuse('response', 'the provider did not acknowledge success');
		return parsed;
	}
	const capabilities = Object.freeze({supportsConditionalWrite: false, supportsETag: true,
		supportsResumableUpload: false, supportsMultipart: false, supportsDeltaFeed: false,
		supportsServerSideCopy: false, supportsNativeVersioning: false,
		maxSingleUploadBytes: PUT_MAX_BYTES, listsFrom: true, seams: SEAMS});
	const transport = {
		capabilities,
		pause: http.pause,
		async put(key, value, condition) {
			keyCheck(key); noConditional(condition);
			const body = asBytes(value).slice();
			if (body.length > PUT_MAX_BYTES) refuse('too_large', 'REST cannot keep an object above 300 MB; the original remains local');
			const json = await request('PUT', key, {body, json: true});
			if (!json || !json.result || (json.result.key !== undefined && json.result.key !== root + key)) refuse('response', 'the upload receipt names a different object');
			if (json.result.size !== undefined && size(json.result.size) !== body.length) refuse('response', 'the upload receipt has a different byte count');
			return {key, etag: String(json.result.etag || ''), size: body.length};
		},
		async get(key) { keyCheck(key); const value = await request('GET', key); return value ? {key, ...value} : null; },
		async list(prefix, cursor = null, options = {}) {
			objectPrefix(prefix);
			if (cursor !== null && (typeof cursor !== 'string' || !cursor || cursor.length > 8192)) refuse('cursor', 'invalid provider cursor');
			const {startAfter, delimiter} = listOptions(prefix, options);
			const query = new URLSearchParams({prefix: root + prefix, per_page: '1000'});
			if (startAfter !== null) query.set('start_after', root + startAfter);
			if (delimiter !== null) query.set('delimiter', delimiter);
			if (cursor !== null) query.set('cursor', cursor);
			const json = await request('GET', null, {query: query.toString(), json: true});
			if (!json || !Array.isArray(json.result)) refuse('response', 'the object listing is not readable');
			const keys = json.result.map(row => {
				if (typeof row?.key !== 'string' || !row.key.startsWith(root + prefix)) refuse('authority', 'the provider returned an object outside the requested scope');
				const key = row.key.slice(root.length); keyCheck(key);
				return {key, etag: String(row.etag || ''), size: row.size === undefined ? null : size(row.size)};
			});
			const info = json.result_info;
			if (!info || typeof info.is_truncated !== 'boolean') refuse('response', 'the listing does not say whether it is complete');
			if (info.is_truncated && (typeof info.cursor !== 'string' || !info.cursor || info.cursor === cursor)) refuse('cursor', 'the listing did not advance its cursor');
			// A grouped listing names each device's heads as one prefix (result_info.delimited).
			const groups = info.delimited ?? [];
			if (!Array.isArray(groups) || delimiter === null && groups.length) refuse('response', 'the listing grouped objects it was not asked to group');
			const prefixes = delimiter === null ? null : groups.map(group => {
				if (typeof group !== 'string' || !group.startsWith(root + prefix) || !/^heads\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/$/.test(group.slice(root.length))) refuse('authority', 'the provider returned a grouping outside the requested scope');
				return group.slice(root.length);
			});
			return {keys, ...(prefixes ? {prefixes} : {}), truncated: info.is_truncated, cursor: info.is_truncated ? info.cursor : null};
		},
		async stat(key) {
			keyCheck(key);
			// The documented list operation supplies metadata. No undocumented HEAD request.
			const page = await transport.list(key);
			return page.keys.find(row => row.key === key) || null;
		},
		async delete() { refuse('keep', 'automatic remote deletion is not part of sync; use an explicit reviewed vault-retirement operation'); },
	};
	return Object.freeze(transport);
}
