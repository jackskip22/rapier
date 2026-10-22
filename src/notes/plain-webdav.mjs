// SPDX-License-Identifier: AGPL-3.0-only
import {createHTTP, refuse} from './provider-http.mjs';
import {parseWebDAVMultistatus, isStrongWebDAVETag, checkedWebDAVURL, webDAVLanHost} from './webdav-wire.mjs';
import {plainConflict, plainName, plainBytes, PLAIN_MAX_BYTES} from './plain-store.mjs';

const te = new TextEncoder();
const PROP = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/><d:getcontentlength/></d:prop></d:propfind>';
const CHECK = '.rapier-plain-check';

export function createWebDAVPlainStore(options = {}) {
	const {fetch: fetchFn, endpoint, username, password, authorizeEndpoint, signal} = options;
	if (typeof fetchFn !== 'function' || typeof authorizeEndpoint !== 'function') refuse('config', 'an injected HTTP client and an endpoint authorization check are required');
	if (typeof endpoint !== 'string' || !/^https?:\/\//i.test(endpoint)) refuse('config', 'enter the WebDAV folder that keeps the plain files');
	const configured = checkedWebDAVURL(endpoint.endsWith('/') ? endpoint : endpoint + '/'), origin = configured.url.origin, folder = configured.parts;
	if (!folder.length) refuse('config', 'choose a folder inside the WebDAV server, not its root');
	if (typeof username !== 'string' || !username || /[:\x00-\x1f\x7f]/.test(username) || typeof password !== 'string' || !password || /[\x00-\x1f\x7f]/.test(password)) refuse('auth', 'a WebDAV username and app password are required');
	const network = options.network ?? 'public', cleartext = configured.url.protocol === 'http:';
	if (!['public', 'lan'].includes(network) || webDAVLanHost(configured.url.hostname) && network !== 'lan') refuse('network_scope', 'a local server must be chosen as LAN storage');
	if (cleartext && !(network === 'lan' && options.allowInsecureLan === true)) refuse('tls', 'use HTTPS; cleartext is only for an accepted LAN server');
	let binary = ''; for (const b of te.encode(username + ':' + password)) binary += String.fromCharCode(b);
	const authorization = 'Basic ' + btoa(binary), http = createHTTP({fetch: fetchFn, signal, timeoutMs: options.timeoutMs ?? 30000});
	const urlFor = (parts, collection = false) => origin + '/' + parts.map(encodeURIComponent).join('/') + (collection ? '/' : '');
	const classify = response => response.status === 429 || response.status >= 500 && ![501, 507].includes(response.status)
		? {error: Object.assign(new Error('the WebDAV server is refusing requests for now; notes are kept'), {code: response.status === 429 ? 'rate' : 'server'})} : null;
	async function request(method, parts, {collection = false, headers = {}, body, read = false, max = PLAIN_MAX_BYTES} = {}) {
		const url = urlFor(parts, collection);
		return http.retry(() => http.request(url, {origin, method, body, allowHTTP: cleartext, maxBytes: max,
			headers: {Authorization: authorization, ...headers},
			prepare: async requestSignal => {
				if (await authorizeEndpoint(Object.freeze({url, origin, network, cleartext, signal: requestSignal})) !== true) refuse('network_scope', 'this server is not allowed on the current network; no credential was sent');
				return {};
			},
			inspect: response => {
				if (response.status === 401) refuse('auth', 'the WebDAV server refused the username or app password');
				if (response.status === 403) refuse('permission', 'the WebDAV server does not allow this folder');
				return read && response.status >= 200 && response.status < 300;
			}}), classify, method === 'GET' || method === 'PROPFIND');
	}
	const unconfirmed = status => refuse(status === 507 ? 'quota' : 'http', `the WebDAV server did not confirm the change (HTTP ${status}); the note is kept`);
	async function listing(parts, depth) {
		const res = await request('PROPFIND', parts, {collection: depth === 1, headers: {Depth: String(depth), 'Content-Type': 'application/xml; charset=utf-8'}, body: PROP, read: true, max: 8 * 1024 * 1024});
		if (res.status === 404) return null;
		if (res.status !== 207) unconfirmed(res.status);
		const rows = parseWebDAVMultistatus(res.bytes), seen = new Set();
		for (const row of rows) {
			const href = checkedWebDAVURL(row.href, origin);
			if (href.parts.length < parts.length || href.parts.length > parts.length + depth || parts.some((part, i) => href.parts[i] !== part)) refuse('authority', 'the WebDAV listing names a file outside the plain-files folder');
			const id = href.parts.join('/');
			if (seen.has(id)) refuse('listing', 'the WebDAV listing names one file twice'); seen.add(id);
			if (row.status < 200 || row.status >= 300) refuse('listing', 'part of the WebDAV listing failed; it was not read as complete');
			row.parts = href.parts;
		}
		return rows;
	}
	const at = file => [...folder, plainName(file)];
	let ready = null;
	function connect() {
		ready ??= (async () => {
			const self = await listing(folder, 0);
			if (!self) {
				const made = await request('MKCOL', folder, {collection: true});
				if (made.status !== 201) refuse('collection', 'the WebDAV folder could not be made; choose an existing folder');
			} else if (self[0].collection !== true) refuse('collection', 'the WebDAV folder is a file');
			const probe = [...folder, CHECK], wrong = '"rapier-check-' + crypto.randomUUID() + '"';
			let first = await request('PUT', probe, {headers: {'If-None-Match': '*', 'Content-Type': 'application/octet-stream'}, body: new Uint8Array()});
			if (![201, 204, 412].includes(first.status)) unconfirmed(first.status);
			for (const headers of [{'If-None-Match': '*'}, {'If-Match': wrong}]) {
				const result = await request('PUT', probe, {headers: {...headers, 'Content-Type': 'application/octet-stream'}, body: new Uint8Array()});
				if (result.status !== 412) refuse('conditional', 'this WebDAV server does not enforce conditional writes; plain files would overwrite other apps\' changes, so nothing was written');
			}
			const del = await request('DELETE', probe, {headers: {'If-Match': wrong}});
			if (del.status !== 412) refuse('conditional', 'this WebDAV server does not enforce conditional deletion; nothing was written');
			let current = (await read(CHECK))?.rev, stale = null;
			for (const text of ['rapier check one', 'rapier check two']) {
				const res = await request('PUT', probe, {headers: {'If-Match': current, 'Content-Type': 'application/octet-stream'}, body: te.encode(text)});
				if (![200, 201, 204].includes(res.status)) unconfirmed(res.status);
				const next = isStrongWebDAVETag(res.headers.get('etag')?.trim()) ? res.headers.get('etag').trim() : (await read(CHECK))?.rev;
				if (!next || next === current) refuse('conditional', 'this WebDAV server gives one ETag to different contents, so plain files could overwrite another app\'s change; nothing was written');
				stale = current; current = next;
			}
			const late = await request('PUT', probe, {headers: {'If-Match': stale, 'Content-Type': 'application/octet-stream'}, body: te.encode('rapier check old')});
			if (late.status !== 412) refuse('conditional', 'this WebDAV server accepted a write over an older ETag; nothing was written');
			return true;
		})();
		ready.catch(() => { ready = null; });
		return ready;
	}
	async function read(file) {
		const res = await request('GET', at(file), {read: true});
		if (res.status === 404) return null;
		if (res.status !== 200) unconfirmed(res.status);
		const etag = res.headers.get('etag')?.trim();
		if (!isStrongWebDAVETag(etag)) refuse('etag', 'the WebDAV server gave no strong ETag for this file; it cannot be changed safely');
		return {bytes: res.bytes, rev: etag};
	}
	return Object.freeze({
		pause: http.pause, connect,
		area: name => createWebDAVPlainStore({...options, endpoint: urlFor([...folder, name], true)}),
		async list() {
			const rows = await listing(folder, 1);
			if (!rows) return [];
			const out = [];
			for (const row of rows) {
				if (row.parts.length !== folder.length + 1 || row.collection !== false) continue;
				const name = row.parts.at(-1);
				if (name === CHECK) continue;
				const etag = /^[\x21\x23-\x7e\x80-\xff]+$/.test(row.etag || '') ? '"' + row.etag + '"' : row.etag;
				if (!isStrongWebDAVETag(etag)) refuse('etag', 'the WebDAV listing gave no strong ETag for ' + name + '; it cannot be synced safely');
				out.push({name: plainName(name), rev: etag, ...(Number.isSafeInteger(row.size) ? {size: row.size} : {})});
			}
			return out;
		},
		get: read,
		async put(file, bytes, condition = {}) {
			plainBytes(bytes); await connect();
			const precondition = condition.ifAbsent === true ? {'If-None-Match': '*'} : isStrongWebDAVETag(condition.ifRev) ? {'If-Match': condition.ifRev} : refuse('conditional', 'a plain file is written only as new or over the ETag last read');
			const res = await request('PUT', at(file), {headers: {...precondition, 'Content-Type': 'text/markdown; charset=utf-8'}, body: bytes});
			if (res.status === 412) throw plainConflict();
			if (![200, 201, 204].includes(res.status)) unconfirmed(res.status);
			const tag = res.headers.get('etag')?.trim();
			if (isStrongWebDAVETag(tag)) return {rev: tag};
			const back = await read(file);
			if (!back || back.bytes.length !== bytes.length || !back.bytes.every((b, i) => b === bytes[i])) throw plainConflict();
			return {rev: back.rev};
		},
		async remove(file, {ifRev} = {}) {
			if (!isStrongWebDAVETag(ifRev)) refuse('conditional', 'a plain file is removed only at the ETag last read');
			await connect();
			const res = await request('DELETE', at(file), {headers: {'If-Match': ifRev}});
			if (res.status === 404) return false;
			if (res.status === 412) throw plainConflict();
			if (![200, 204].includes(res.status)) unconfirmed(res.status);
			return true;
		},
	});
}
