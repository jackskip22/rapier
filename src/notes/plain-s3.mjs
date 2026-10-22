// SPDX-License-Identifier: AGPL-3.0-only
import {createHTTP, refuse} from './provider-http.mjs';
import {s3Bucket, signV4, encodeObjectKey, canonicalQuery, readS3XML, s3XMLScalar, EMPTY_SHA256} from './s3-wire.mjs';
import {plainConflict, plainName, plainBytes, plainFolder, PLAIN_MAX_BYTES} from './plain-store.mjs';

const td = new TextDecoder('utf-8', {fatal: true});
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
const CHECK = '.rapier-plain-check';
const ETAG = /^(?:W\/)?"[^"\x00-\x1f]{1,200}"$/;

export function createS3PlainStore(options = {}) {
	const {fetch: fetchFn, accessKeyId, secretAccessKey, sessionToken, region, signal, clock = () => new Date()} = options;
	if (typeof fetchFn !== 'function') refuse('fetch', 'an injected fetch is required');
	if (typeof accessKeyId !== 'string' || !accessKeyId || typeof secretAccessKey !== 'string' || !secretAccessKey) refuse('auth', 'a bucket key and its secret are required');
	if (!/^[a-z0-9-]{1,63}$/.test(region || '')) refuse('config', 'enter the bucket\'s region (auto for Cloudflare R2)');
	const place = s3Bucket(options), prefix = plainFolder(options.folder).join('/') + '/';
	const http = createHTTP({fetch: fetchFn, signal, timeoutMs: options.timeoutMs ?? 30000});
	async function request(method, name, {body, query = [], headers: extra = {}, read = method === 'GET', max = PLAIN_MAX_BYTES} = {}) {
		const path = place.path + (name === null ? '' : prefix + name), qs = canonicalQuery(query);
		const url = place.origin + encodeObjectKey(path) + (qs ? '?' + qs : '');
		const hash = body ? await sha256(body) : EMPTY_SHA256;
		return http.retry(() => http.request(url, {origin: place.origin, method, body, allowHTTP: place.origin.startsWith('http:'), exactTarget: true, maxBytes: max,
			prepare: async () => {
				const date = clock().toISOString().replace(/[:-]|\.\d{3}/g, '');
				const headers = {host: new URL(place.origin).host, 'x-amz-date': date, 'x-amz-content-sha256': hash, ...extra,
					...(body ? {'content-type': 'text/markdown; charset=utf-8'} : {}), ...(sessionToken ? {'x-amz-security-token': sessionToken} : {})};
				const signed = await signV4({method, path, query, headers, payloadHash: hash, region, accessKeyId, secretAccessKey});
				delete headers.host;
				headers.authorization = signed.authorization;
				return headers;
			},
			inspect: response => {
				if (response.status === 401 || response.status === 403) refuse(response.status === 401 ? 'auth' : 'permission', 'the bucket refused this key; give it read and write access to the folder');
				return read && response.status === 200;
			}}), response => response.status === 429 || response.status === 503 || response.status >= 500
			? {error: Object.assign(new Error('the bucket is refusing requests for now; notes are kept'), {code: 'server'})} : null, method === 'GET' || method === 'HEAD');
	}
	const unconfirmed = status => refuse('http', `the bucket did not confirm the change (HTTP ${status}); the note is kept`);
	const tagOf = response => { const tag = response.headers.get('etag')?.trim(); if (!ETAG.test(tag || '')) refuse('etag', 'the bucket gave no ETag; the file cannot be changed safely'); return tag; };
	let ready = null;
	function connect() {
		ready ??= (async () => {
			const probe = CHECK + '-' + crypto.randomUUID();
			const first = await request('PUT', probe, {body: new Uint8Array(), headers: {'if-none-match': '*'}});
			if (first.status === 412) throw plainConflict();
			if (![200, 201].includes(first.status)) unconfirmed(first.status);
			for (const headers of [{'if-none-match': '*'}, {'if-match': '"rapier-check-' + crypto.randomUUID() + '"'}]) {
				const again = await request('PUT', probe, {body: new Uint8Array(), headers});
				if (again.status !== 412) refuse('conditional', 'this bucket does not enforce conditional writes; plain files would overwrite other apps\' changes, so nothing was written');
			}
			const denied = await request('DELETE', probe, {headers: {'if-match': '"rapier-check-' + crypto.randomUUID() + '"'}});
			if (denied.status !== 412) refuse('conditional', 'this bucket does not enforce conditional writes; plain files would overwrite other apps\' changes, so nothing was written');
			const proof = await request('HEAD', probe);
			if (proof.status !== 200 || tagOf(proof) !== tagOf(first)) refuse('conditional', 'the bucket did not preserve its check file');
			const removed = await request('DELETE', probe, {headers: {'if-match': tagOf(proof)}});
			if (![200, 204].includes(removed.status)) unconfirmed(removed.status);
			return true;
		})();
		ready.catch(() => { ready = null; });
		return ready;
	}
	return Object.freeze({
		pause: http.pause, connect, prefix,
		area: name => createS3PlainStore({...options, folder: prefix + name}),
		async list() {
			const out = [], seen = new Set();
			let cursor = null;
			for (let pages = 0; pages < 1000; pages++) {
				const query = [['list-type', '2'], ['encoding-type', 'url'], ['max-keys', '1000'], ['prefix', prefix], ['delimiter', '/']];
				if (cursor) query.push(['continuation-token', cursor]);
				const res = await request('GET', null, {query, max: 4 * 1024 * 1024});
				if (res.status === 404) refuse('bucket', 'the bucket was not found');
				if (res.status !== 200) unconfirmed(res.status);
				let xml; try { xml = readS3XML(td.decode(res.bytes)); } catch (error) { if (error?.code) throw error; refuse('response', 'the bucket listing is not valid XML'); }
				const encoded = s3XMLScalar(xml, 'EncodingType') === 'url', decode = value => { try { return encoded ? decodeURIComponent(value.replace(/\+/g, '%20')) : value; } catch { refuse('response', 'the bucket listing has invalid keys'); } };
				if (s3XMLScalar(xml, 'Name', true) !== place.bucket || decode(s3XMLScalar(xml, 'Prefix', true)) !== prefix) refuse('authority', 'the listing is not this bucket\'s folder');
				for (const row of xml.children.filter(child => child.name === 'Contents')) {
					const key = decode(s3XMLScalar(row, 'Key', true));
					if (!key.startsWith(prefix)) refuse('authority', 'the listing names a file outside the folder');
					const name = key.slice(prefix.length);
					if (!name || name.includes('/') || (name === CHECK || /^\.rapier-plain-check-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(name))) continue;
					if (seen.has(name)) refuse('listing', 'the listing names one file twice'); seen.add(name);
					const size = Number(s3XMLScalar(row, 'Size', true)), rev = s3XMLScalar(row, 'ETag', true);
					if (!Number.isSafeInteger(size) || size < 0 || !ETAG.test(rev)) refuse('response', 'the listing has no size or ETag for ' + name);
					out.push({name: plainName(name), rev, size});
				}
				const more = s3XMLScalar(xml, 'IsTruncated', true);
				if (more === 'false') return out;
				const next = s3XMLScalar(xml, 'NextContinuationToken');
				if (more !== 'true' || !next || next === cursor) refuse('cursor', 'the bucket did not supply an advancing listing');
				cursor = next;
			}
			refuse('too_large', 'the folder has too many files to list in one sync');
		},
		async get(file) {
			const res = await request('GET', plainName(file));
			if (res.status === 404) return null;
			if (res.status !== 200) unconfirmed(res.status);
			return {bytes: res.bytes, rev: tagOf(res)};
		},
		async put(file, bytes, condition = {}) {
			plainName(file); plainBytes(bytes); await connect();
			const headers = condition.ifAbsent === true ? {'if-none-match': '*'} : ETAG.test(condition.ifRev || '') ? {'if-match': condition.ifRev} : refuse('conditional', 'a plain file is written only as new or over the ETag last read');
			const res = await request('PUT', file, {body: bytes, headers});
			if ([404, 409, 412].includes(res.status)) throw plainConflict();
			if (![200, 201].includes(res.status)) unconfirmed(res.status);
			return {rev: tagOf(res)};
		},
		async remove(file, {ifRev} = {}) {
			await connect();
			if (!ETAG.test(ifRev || '')) refuse('conditional', 'a plain file is removed only at the ETag last read');
			const head = await request('HEAD', plainName(file));
			if (head.status === 404) return false;
			if (head.status !== 200) unconfirmed(head.status);
			if (tagOf(head) !== ifRev) throw plainConflict();
			const res = await request('DELETE', file, {headers: {'if-match': ifRev}});
			if (res.status === 412) throw plainConflict();
			if (![200, 204].includes(res.status)) unconfirmed(res.status);
			return true;
		},
	});
}
