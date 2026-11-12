// SPDX-License-Identifier: AGPL-3.0-only
import {createHTTP, refuse} from './provider-http.mjs';
import {workspaceOrigin} from './workspace-oauth.mjs';
import {plainConflict, plainName, plainBytes, PLAIN_MAX_BYTES} from './plain-store.mjs';
import {plainPoll} from './plain-poll.mjs';

const td = new TextDecoder('utf-8', {fatal: true});
const ETAG = /^"[^"\x00-\x1f]{1,200}"$/;
const AREAS = new Set(['attachments', 'audio']);

export {workspaceOrigin};

export function createWorkspacePlainStore(options = {}) { return workspacePlainStore(options); }

function workspacePlainStore(options, shared = null, area = null) {
	const {fetch: fetchFn, token, signal} = options;
	if (typeof fetchFn !== 'function') refuse('fetch', 'an injected fetch is required');
	const bearer = options.authorizedFetch === true ? null : typeof token === 'string' ? token : token?.accessToken;
	if (options.authorizedFetch !== true && (typeof bearer !== 'string' || !bearer || /[\x00-\x20\x7f]/.test(bearer))) refuse('auth', 'sign in to your workspace again');
	const origin = workspaceOrigin(options.endpoint), prefix = 'notes/' + (area ? area + '/' : '');
	const http = shared?.http || createHTTP({fetch: fetchFn, signal, timeoutMs: options.timeoutMs ?? 30000});
	const request = (method, query, {body, headers = {}, read = method === 'GET', max = PLAIN_MAX_BYTES} = {}) =>
		http.retry(() => http.request(origin + '/workspace/files?' + new URLSearchParams(query), {origin, method, body, exactTarget: true, maxBytes: max,
			headers: {...(bearer ? {authorization: 'Bearer ' + bearer} : {}), ...headers, ...(body ? {'content-type': area ? 'application/octet-stream' : 'text/markdown; charset=utf-8'} : {})},
			inspect: response => {
				if (response.status === 401) refuse('auth', 'sign in to your workspace again');
				if (response.status === 403) refuse('permission', 'your workspace refused this sign-in');
				return read && response.status === 200;
			}}), response => response.status === 429 ? {error: Object.assign(new Error('your workspace reached today\'s allowance; notes are kept'), {code: 'server'})}
			: response.status >= 500 ? {error: Object.assign(new Error('your workspace is not answering for now; notes are kept'), {code: 'server'})} : null,
			method === 'GET' || method === 'HEAD');
	const unconfirmed = status => refuse('http', `your workspace did not confirm the change (HTTP ${status}); the note is kept`);
	const tagOf = response => { const tag = response.headers.get('etag')?.trim(); if (!ETAG.test(tag || '')) refuse('etag', 'your workspace gave no ETag; the file cannot be changed safely'); return tag; };
	const pathOf = file => prefix + plainName(file);
	if (!shared) {
		let rows = [];
		const scan = async () => {
			const out = [], seen = new Set();
			let cursor = null;
			for (let pages = 0; pages < 1000; pages++) {
				const res = await request('GET', {prefix: 'notes/', ...(cursor ? {cursor} : {})}, {max: 4 * 1024 * 1024});
				if (res.status !== 200) unconfirmed(res.status);
				let page; try { page = JSON.parse(td.decode(res.bytes)); } catch { refuse('response', 'your workspace listing is not readable'); }
				if (!Array.isArray(page?.files)) refuse('response', 'your workspace listing is not readable');
				for (const row of page.files) {
					if (typeof row?.path !== 'string' || !row.path.startsWith('notes/')) refuse('authority', 'the listing names a file outside notes');
					const name = row.path.slice('notes/'.length);
					if (seen.has(name)) refuse('listing', 'the listing names one file twice'); seen.add(name);
					const rev = '"' + row.etag + '"';
					if (!Number.isSafeInteger(row.bytes) || row.bytes < 0 || !ETAG.test(rev)) refuse('response', 'the listing has no size or ETag for ' + name);
					for (const part of name.split('/')) plainName(part);
					out.push({path: name, rev, size: row.bytes});
				}
				if (page.complete === true) return out;
				if (typeof page.cursor !== 'string' || !page.cursor || page.cursor === cursor) refuse('cursor', 'your workspace did not supply an advancing listing');
				cursor = page.cursor;
			}
			refuse('too_large', 'the folder has too many files to list in one sync');
		};
		shared = {http, poll: plainPoll(async () => { const next = await scan(); http.check(); rows = next; }), rows: () => rows};
	}
	const areas = new Map();
	return Object.freeze({
		pause: http.pause, prefix,
		async connect() { await shared.poll.begin(); shared.poll.end(); return true; },
		beginPoll: shared.poll.begin, endPoll: shared.poll.end,
		area: name => {
			if (area || !AREAS.has(plainName(name))) refuse('authority', 'your workspace keeps only attachments and audio beside notes');
			if (!areas.has(name)) areas.set(name, workspacePlainStore(options, shared, name));
			return areas.get(name);
		},
		async list() {
			http.check(); await shared.poll.read(); http.check();
			const relative = prefix.slice('notes/'.length);
			return shared.rows().filter(row => row.path.startsWith(relative) && !row.path.slice(relative.length).includes('/'))
				.map(({path, rev, size}) => ({name: path.slice(relative.length), rev, size}));
		},
		async get(file) {
			const res = await request('GET', {path: pathOf(file)});
			if (res.status === 404) return null;
			if (res.status !== 200) unconfirmed(res.status);
			return {bytes: res.bytes, rev: tagOf(res)};
		},
		async put(file, bytes, condition = {}) {
			plainBytes(bytes);
			const headers = condition.ifAbsent === true ? {'if-none-match': '*'} : ETAG.test(condition.ifRev || '') ? {'if-match': condition.ifRev}
				: refuse('conditional', 'a plain file is written only as new or over the ETag last read');
			const res = await request('PUT', {path: pathOf(file)}, {body: bytes, headers});
			if ([409, 412].includes(res.status)) throw plainConflict();
			if (res.status !== 200) unconfirmed(res.status);
			return {rev: tagOf(res)};
		},
		async remove(file, {ifRev} = {}) {
			if (area) refuse('conditional', 'your workspace keeps attachments and audio; remove them in your account');
			if (!ETAG.test(ifRev || '')) refuse('conditional', 'a plain file is removed only at the ETag last read');
			const res = await request('DELETE', {path: pathOf(file)}, {headers: {'if-match': ifRev}});
			if (res.status === 404) return false;
			if (res.status === 412) throw plainConflict();
			if (res.status !== 204) unconfirmed(res.status);
			return true;
		},
	});
}
