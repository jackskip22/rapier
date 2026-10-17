// SPDX-License-Identifier: AGPL-3.0-only
import {createHTTP, jsonBody, providerError, retryAfter, pinnedURL, byteCount, refuse} from './provider-http.mjs';
import {tokenFor, providerId} from './provider-objects.mjs';
import {DRIVE_API_ORIGIN, UPLOAD_CHUNK_BYTES} from './transport-drive.mjs';
import {plainConflict, plainName, plainBytes, plainFolder} from './plain-store.mjs';

const FILES = DRIVE_API_ORIGIN + '/drive/v3/files';
const UPLOAD = DRIVE_API_ORIGIN + '/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
const MAX_BYTES = 150000000;
const FIELDS = 'id,name,mimeType,parents,size,trashed,headRevisionId,appProperties';
const quote = value => "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

export function createDrivePlainStore(options = {}) {
	const path = plainFolder(options.folder, 'choose a folder name for the plain files');
	const http = createHTTP(options), authorization = tokenFor(options.token, 'drive');
	const classify = response => {
		let rate = response.status === 429;
		if (response.status === 403) { try { rate = jsonBody(response)?.error?.errors?.some(e => ['rateLimitExceeded', 'userRateLimitExceeded'].includes(e.reason)) === true; } catch {} }
		return rate || response.status >= 500 ? {error: providerError('Google Drive', response, rate ? 'rate' : 'server'), delay: retryAfter(response)} : null;
	};
	async function request(url, init = {}, safe = true) {
		const response = await http.retry(() => http.request(url, {...init, origin: DRIVE_API_ORIGIN, headers: {Authorization: authorization, ...init.headers}}), classify, safe);
		if (response.status >= 400 && ![404, 409].includes(response.status)) throw providerError('Google Drive', response, response.status === 401 ? 'auth' : response.status === 403 ? 'permission' : 'provider');
		return response;
	}
	async function search(q) {
		const out = []; let token = null;
		for (let pages = 0; ; pages++) {
			const query = new URLSearchParams({q, spaces: 'drive', corpora: 'user', pageSize: '1000', fields: `nextPageToken,incompleteSearch,files(${FIELDS})`});
			if (token) query.set('pageToken', token);
			const response = await request(FILES + '?' + query);
			if (response.status !== 200) throw providerError('Google Drive', response);
			const page = jsonBody(response);
			if (!Array.isArray(page.files) || page.incompleteSearch === true) refuse('listing', 'Drive did not finish searching the folder');
			out.push(...page.files);
			if (!page.nextPageToken) return out;
			if (page.nextPageToken === token || pages > 1000) refuse('cursor', 'Drive did not supply an advancing page');
			token = page.nextPageToken;
		}
	}
	async function newId() {
		const response = await request(FILES + '/generateIds?count=1&space=drive&type=files');
		const ids = response.status === 200 ? jsonBody(response).ids : null;
		if (!Array.isArray(ids) || ids.length !== 1) refuse('response', 'Drive did not allocate a file id');
		return providerId(ids[0]);
	}
	let folderId = null;
	const folderQuery = (name, parent) => `name = ${quote(name)} and ${quote(parent)} in parents and appProperties has { key='rapierPlain' and value='1' } and mimeType = '${FOLDER}' and trashed = false`;
	async function folder() {
		if (folderId) return folderId;
		let parent = 'root';
		for (const name of path) {
			let found = await search(folderQuery(name, parent));
			if (!found.length) {
				const id = await newId();
				const response = await request(FILES + '?fields=' + encodeURIComponent(FIELDS), {method: 'POST', headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({id, name, mimeType: FOLDER, parents: [parent], appProperties: {rapierPlain: '1'}})}, false);
				if (![200, 409].includes(response.status)) throw providerError('Google Drive', response);
				found = await search(folderQuery(name, parent));
			}
			const row = found.filter(row => row.mimeType === FOLDER && row.trashed !== true).sort((a, b) => a.id < b.id ? -1 : 1)[0];
			if (!row) refuse('missing_root', 'Drive did not keep the plain-files folder');
			parent = providerId(row.id);
		}
		return folderId = parent;
	}
	function fileRow(row, parent) {
		if (!row || row.mimeType === FOLDER || row.trashed === true || !Array.isArray(row.parents) || !row.parents.includes(parent)) refuse('authority', 'Drive returned a file outside the plain-files folder');
		if (typeof row.headRevisionId !== 'string' || !row.headRevisionId) return null;
		return {id: providerId(row.id), name: plainName(row.name), rev: row.headRevisionId, size: byteCount(row.size)};
	}
	async function named(file) {
		const parent = await folder();
		const rows = (await search(`${quote(parent)} in parents and trashed = false and name = ${quote(plainName(file))}`)).map(row => fileRow(row, parent)).filter(Boolean).filter(row => row.name === file);
		if (rows.length > 1) refuse('listing', 'Drive has two files named ' + file + '; rename one to sync it');
		return rows[0] || null;
	}
	async function content(row) {
		if (row.size > MAX_BYTES) refuse('too_large', 'the file is larger than this sync reads');
		const response = await request(FILES + '/' + encodeURIComponent(row.id) + '?alt=media', {maxBytes: MAX_BYTES});
		if (response.status === 404) return null;
		if (response.status !== 200) throw providerError('Google Drive', response);
		return response.bytes;
	}
	function sessionURL(value) {
		const url = pinnedURL(value, DRIVE_API_ORIGIN);
		if (!url.pathname.startsWith('/upload/drive/v3/files') || url.searchParams.get('uploadType') !== 'resumable' || !url.searchParams.get('upload_id')) refuse('authority', 'Drive returned an unexpected upload address');
		return url.href;
	}
	async function upload(method, address, entry, bytes) {
		let response = await request(address, {method, headers: {'Content-Type': 'application/json', 'X-Upload-Content-Type': 'text/markdown', 'X-Upload-Content-Length': String(bytes.length)}, body: JSON.stringify(entry)}, false);
		if (response.status === 409) throw plainConflict();
		if (response.status !== 200) throw providerError('Google Drive', response);
		const session = sessionURL(response.headers.get('location'));
		let offset = 0;
		do {
			const end = Math.min(offset + UPLOAD_CHUNK_BYTES, bytes.length);
			response = await request(session, {method: 'PUT', headers: {'Content-Type': 'text/markdown', 'Content-Range': bytes.length ? `bytes ${offset}-${end - 1}/${bytes.length}` : 'bytes */0'}, body: bytes.subarray(offset, end), resume308: true}, false);
			if (response.status === 308) {
				const match = /^bytes=0-(\d+)$/.exec(response.headers.get('range') || ''), next = match ? Number(match[1]) + 1 : 0;
				if (next <= offset) refuse('upload_unconfirmed', 'Drive did not advance the upload; the note is kept');
				offset = next;
			} else if (response.status === 200 || response.status === 201) offset = bytes.length;
			else throw providerError('Google Drive', response, 'upload_unconfirmed');
		} while (offset < bytes.length);
		if (![200, 201].includes(response.status)) refuse('upload_unconfirmed', 'Drive did not confirm the upload');
		return jsonBody(response);
	}
	async function trash(id) {
		const response = await request(FILES + '/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent(FIELDS), {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({trashed: true})}, false);
		if (response.status !== 200) throw providerError('Google Drive', response);
	}
	return Object.freeze({
		pause: http.pause,
		pictures: () => createDrivePlainStore({...options, folder: [...path, 'attachments'].join('/')}),
		async list() {
			const parent = await folder(), rows = (await search(`${quote(parent)} in parents and trashed = false`)).filter(row => row.mimeType !== FOLDER).map(row => fileRow(row, parent)).filter(Boolean);
			const count = new Map(); for (const row of rows) count.set(row.name, (count.get(row.name) || 0) + 1);
			return rows.filter(row => count.get(row.name) === 1).map(({name, rev, size}) => ({name, rev, size}));
		},
		async get(file) {
			for (let attempt = 0; attempt < 3; attempt++) {
				const row = await named(file);
				if (!row) return null;
				const bytes = await content(row), after = await named(file);
				if (bytes && after?.id === row.id && after.rev === row.rev && bytes.length === row.size) return {bytes, rev: row.rev};
			}
			refuse('busy', 'the file kept changing while it was read; the next sync reads it again');
		},
		async put(file, bytes, condition = {}) {
			plainBytes(bytes, MAX_BYTES);
			const parent = await folder(), row = await named(file);
			if (condition.ifAbsent === true) {
				if (row) throw plainConflict();
				const id = await newId();
				const made = await upload('POST', UPLOAD + '?uploadType=resumable&fields=' + encodeURIComponent(FIELDS), {id, name: file, mimeType: 'text/markdown', parents: [parent]}, bytes);
				const twins = (await search(`${quote(parent)} in parents and trashed = false and name = ${quote(file)}`)).filter(other => other.name === file);
				if (twins.length > 1) { await trash(id); throw plainConflict(); }
				const mine = fileRow(made, parent);
				if (!mine || mine.id !== id || mine.size !== bytes.length) refuse('response', 'Drive\'s receipt names another file or size');
				return {rev: mine.rev};
			}
			if (typeof condition.ifRev !== 'string' || !condition.ifRev) refuse('conditional', 'a plain file is written only as new or over the revision last read');
			if (!row || row.rev !== condition.ifRev) throw plainConflict();
			const made = fileRow(await upload('PATCH', UPLOAD + '/' + encodeURIComponent(row.id) + '?uploadType=resumable&fields=' + encodeURIComponent(FIELDS), {}, bytes), parent);
			if (!made || made.id !== row.id || made.size !== bytes.length) refuse('response', 'Drive\'s receipt names another file or size');
			return {rev: made.rev};
		},
		async remove(file, {ifRev} = {}) {
			if (typeof ifRev !== 'string' || !ifRev) refuse('conditional', 'a plain file is removed only at the revision last read');
			const row = await named(file);
			if (!row) return false;
			if (row.rev !== ifRev) throw plainConflict();
			await trash(row.id);
			return true;
		},
	});
}
