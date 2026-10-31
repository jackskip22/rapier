// SPDX-License-Identifier: AGPL-3.0-only
import {createHTTP, jsonBody, providerError, retryAfter, pinnedURL, byteCount, refuse, tokenFor, providerId} from './provider-http.mjs';
import {plainConflict, plainName, plainBytes, plainFolder, sameBytes} from './plain-store.mjs';
import {plainPoll} from './plain-poll.mjs';

const DRIVE_API_ORIGIN = 'https://www.googleapis.com';
const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const FILES = DRIVE_API_ORIGIN + '/drive/v3/files';
const UPLOAD = DRIVE_API_ORIGIN + '/upload/drive/v3/files';
const CONDITIONAL_FILES = DRIVE_API_ORIGIN + '/drive/v2/files';
const CONDITIONAL_UPLOAD = DRIVE_API_ORIGIN + '/upload/drive/v2/files';
const FOLDER = 'application/vnd.google-apps.folder';
const MAX_BYTES = 150000000;
const FIELDS = 'id,name,mimeType,parents,size,trashed,headRevisionId,version,appProperties';
const CONDITIONAL_FIELDS = 'id,title,mimeType,parents(id),fileSize,labels(trashed),headRevisionId,version,etag';
const ETAG = /^"[^"\x00-\x20\x7f]{1,512}"$/;
const REVISION = /^(?=.{1,256}$)[A-Za-z0-9_-]{1,256}:(?:0|[1-9][0-9]{0,19})$/;
const REPLACEMENT_UNVERIFIED = 'Drive conditional replacement is unverified; the note is kept';
const TRASH_UNVERIFIED = 'Drive conditional trash is unverified; the file is kept';
const quote = value => "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const revision = row => {
	if (typeof row.version !== 'string' || !/^(?:0|[1-9][0-9]{0,19})$/.test(row.version)) refuse('response', 'Drive returned incomplete file metadata');
	const rev = providerId(row.id) + ':' + row.version;
	if (!REVISION.test(rev)) refuse('response', 'Drive returned incomplete file metadata');
	return rev;
};

export function createDrivePlainStore(options = {}) {
	return drivePlainStore(options);
}

function drivePlainStore(options, parentFolder = null, shared = null) {
	const path = plainFolder(options.folder, 'choose a folder name for the plain files');
	const http = createHTTP(options), authorization = tokenFor(options.token, 'drive');
	const classify = response => {
		let rate = response.status === 429;
		if (response.status === 403) { try { rate = jsonBody(response)?.error?.errors?.some(e => ['rateLimitExceeded', 'userRateLimitExceeded'].includes(e.reason)) === true; } catch {} }
		return rate || response.status >= 500 ? {error: providerError('Google Drive', response, rate ? 'rate' : 'server'), delay: retryAfter(response)} : null;
	};
	async function request(url, init = {}, safe = true) {
		const response = await http.retry(() => http.request(url, {...init, origin: DRIVE_API_ORIGIN, headers: {Authorization: authorization, ...init.headers}}), classify, safe);
		if (response.status >= 400 && ![400, 404, 409, 410, 412].includes(response.status)) throw providerError('Google Drive', response, response.status === 401 ? 'auth' : response.status === 403 ? 'permission' : 'provider');
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
	async function folder(create = true) {
		http.check();
		if (folderId) return folderId;
		let parent = parentFolder ? await parentFolder(create) : 'root';
		for (const name of path) {
			let found = await search(folderQuery(name, parent));
			if (!found.length) {
				if (!create) refuse('missing_root', 'the connected Drive folder is missing or not visible; nothing was created');
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
		return {id: providerId(row.id), name: plainName(row.name), rev: revision(row), size: byteCount(row.size)};
	}
	async function named(file, create = true) {
		const parent = await folder(create);
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
	function conditionalRow(value, parent, trashed = false) {
		if (!value || value.mimeType === FOLDER || value.labels?.trashed !== trashed || !Array.isArray(value.parents) ||
			!value.parents.some(row => row?.id === parent) || typeof value.headRevisionId !== 'string' || !value.headRevisionId)
			refuse('authority', 'Drive returned a file outside the plain-files folder');
		if (!ETAG.test(value.etag || '')) refuse('conditional_unverified', trashed ? TRASH_UNVERIFIED : REPLACEMENT_UNVERIFIED);
		return {id: providerId(value.id), name: plainName(value.title), rev: revision(value), size: byteCount(value.fileSize), etag: value.etag};
	}
	async function conditioned(row, parent) {
		const response = await request(CONDITIONAL_FILES + '/' + encodeURIComponent(row.id) + '?fields=' + encodeURIComponent(CONDITIONAL_FIELDS));
		if (response.status === 404) throw plainConflict();
		if (response.status !== 200) throw providerError('Google Drive', response);
		const current = conditionalRow(jsonBody(response), parent);
		if (current.id !== row.id || current.name !== row.name || current.rev !== row.rev || current.size !== row.size) throw plainConflict();
		return current;
	}
	async function replace(row, bytes, parent) {
		const response = await request(CONDITIONAL_UPLOAD + '/' + encodeURIComponent(row.id) + '?uploadType=media&fields=' + encodeURIComponent(CONDITIONAL_FIELDS),
			{method: 'PUT', headers: {'Content-Type': 'application/octet-stream', 'If-Match': row.etag}, body: bytes}, false);
		if ([404, 409, 412].includes(response.status)) throw plainConflict();
		if (response.status !== 200) throw providerError('Google Drive', response, 'upload_unconfirmed');
		const made = conditionalRow(jsonBody(response), parent);
		if (made.id !== row.id || made.name !== row.name || made.size !== bytes.length || made.rev === row.rev || made.etag === row.etag)
			refuse('response', 'Drive\'s receipt names another file or size');
		return made;
	}
	async function trash(row, parent) {
		const response = await request(CONDITIONAL_FILES + '/' + encodeURIComponent(row.id) + '?fields=' + encodeURIComponent(CONDITIONAL_FIELDS),
			{method: 'PUT', headers: {'Content-Type': 'application/json', 'If-Match': row.etag}, body: JSON.stringify({labels: {trashed: true}})}, false);
		if ([404, 409, 412].includes(response.status)) throw plainConflict();
		if (response.status !== 200) throw providerError('Google Drive', response, 'upload_unconfirmed');
		const removed = conditionalRow(jsonBody(response), parent, true);
		if (removed.id !== row.id || removed.name !== row.name || removed.size !== row.size || removed.rev === row.rev || removed.etag === row.etag)
			refuse('response', 'Drive\'s receipt names another file or size');
	}
	function sessionURL(value) {
		const url = pinnedURL(value, DRIVE_API_ORIGIN);
		if (!url.pathname.startsWith('/upload/drive/v3/files') || url.searchParams.get('uploadType') !== 'resumable' || !url.searchParams.get('upload_id')) refuse('authority', 'Drive returned an unexpected upload address');
		return url.href;
	}
	async function upload(entry, bytes) {
		const type = entry.mimeType;
		let response = await request(UPLOAD + '?uploadType=resumable&fields=' + encodeURIComponent(FIELDS), {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(bytes.length)}, body: JSON.stringify(entry)}, false);
		if (response.status === 409) throw plainConflict();
		if (response.status !== 200) throw providerError('Google Drive', response);
		const session = sessionURL(response.headers.get('location'));
		let offset = 0;
		do {
			const end = Math.min(offset + UPLOAD_CHUNK_BYTES, bytes.length);
			response = await request(session, {method: 'PUT', headers: {'Content-Type': type, 'Content-Range': bytes.length ? `bytes ${offset}-${end - 1}/${bytes.length}` : 'bytes */0'}, body: bytes.subarray(offset, end), resume308: true}, false);
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
	if (!shared) {
		let scopes = new Map(), token = null;
		const changes = DRIVE_API_ORIGIN + '/drive/v3/changes';
		const childFolders = rows => ['attachments', 'audio'].map(name => [...rows.values()]
			.filter(row => row.mimeType === FOLDER && !row.trashed && row.name === name && row.appProperties?.rapierPlain === '1')
			.sort((a, b) => a.id < b.id ? -1 : 1)[0]).filter(Boolean);
		const scan = async parent => new Map((await search(`${quote(parent)} in parents and trashed = false`)).map(row => {
			providerId(row.id);
			if (!Array.isArray(row.parents) || !row.parents.includes(parent)) refuse('authority', 'Drive returned a file outside the plain-files folder');
			if (row.mimeType !== FOLDER) fileRow(row, parent);
			return [row.id, row];
		}));
		const refresh = async () => {
			const root = await folder(); let cursor = token, staged = new Map([...scopes].map(([key, rows]) => [key, new Map(rows)])), reset = false;
			const seen = new Set();
			for (let pages = 0; pages <= 1000; pages++) {
				if (!cursor) {
					const response = await request(changes + '/startPageToken?fields=startPageToken');
					if (response.status !== 200) throw providerError('Google Drive', response);
					cursor = jsonBody(response).startPageToken;
					if (typeof cursor !== 'string' || !cursor) refuse('cursor', 'Drive returned no start page token');
					const identity = await request(FILES + '/' + encodeURIComponent(root) + '?fields=id,mimeType,trashed');
					if (identity.status === 404) refuse('missing_root', 'the connected Drive folder is missing');
					if (identity.status !== 200) throw providerError('Google Drive', identity);
					const bound = jsonBody(identity);
					if (bound.id !== root || bound.mimeType !== FOLDER || bound.trashed) refuse('missing_root', 'the connected Drive folder is missing');
					staged = new Map([[root, await scan(root)]]);
					for (const row of childFolders(staged.get(root))) staged.set(row.id, await scan(row.id));
				}
				if (seen.has(cursor)) refuse('cursor', 'Drive did not supply an advancing change token'); seen.add(cursor);
				const query = new URLSearchParams({pageToken: cursor, pageSize: '1000', spaces: 'drive', includeRemoved: 'true',
					fields: `nextPageToken,newStartPageToken,changes(fileId,removed,changeType,file(${FIELDS}))`});
				const response = await request(changes + '?' + query);
				let expired = response.status === 410;
				if (response.status === 400) { const errors = jsonBody(response)?.error?.errors; expired = Array.isArray(errors) && errors.some(e => e.location === 'pageToken' && ['invalid', 'invalidPageToken'].includes(e.reason)); }
				if (expired && token && !reset) { cursor = null; reset = true; seen.clear(); continue; }
				if (response.status !== 200) throw providerError('Google Drive', response);
				const page = jsonBody(response);
				if (!Array.isArray(page.changes) || !!page.nextPageToken === !!page.newStartPageToken) refuse('listing', 'Drive returned no complete changes page');
				for (const change of page.changes) {
					if (change.changeType && change.changeType !== 'file') continue;
					const id = providerId(change.fileId);
					if (typeof change.removed !== 'boolean') refuse('listing', 'Drive returned an incomplete change');
					const file = change.file;
					if (id === root) { if (change.removed || file?.trashed) refuse('missing_root', 'the connected Drive folder is missing'); continue; }
					if (!change.removed && (!file || file.id !== id || !Array.isArray(file.parents))) refuse('listing', 'Drive returned incomplete file metadata');
					for (const [parent, rows] of staged) {
						rows.delete(id);
						if (!change.removed && !file.trashed && file.parents.includes(parent)) { if (file.mimeType !== FOLDER) fileRow(file, parent); rows.set(id, file); }
					}
				}
				if (page.nextPageToken) { if (typeof page.nextPageToken !== 'string') refuse('cursor', 'Drive returned an invalid page token'); cursor = page.nextPageToken; continue; }
				if (typeof page.newStartPageToken !== 'string' || !page.newStartPageToken) refuse('cursor', 'Drive returned no saved page token');
				const children = childFolders(staged.get(root)), keep = new Set([root, ...children.map(row => row.id)]);
				for (const id of staged.keys()) if (!keep.has(id)) staged.delete(id);
				for (const row of children) if (!staged.has(row.id)) staged.set(row.id, await scan(row.id));
				http.check(); scopes = staged; token = page.newStartPageToken; return;
			}
			refuse('cursor', 'Drive did not finish listing changes');
		};
		let ready = null;
		const connect = () => {
			ready ??= (async () => {
				const parent = await folder(), id = await newId(), name = '.rapier-plain-check-' + crypto.randomUUID();
				const original = new Uint8Array([0, 13, 10]), changed = new Uint8Array([255, 10, 0]);
				const created = fileRow(await upload({id, name, mimeType: 'application/octet-stream', parents: [parent]}, original), parent);
				if (!created || created.id !== id || created.name !== name || created.size !== original.length) refuse('response', 'Drive\'s receipt names another file or size');
				const first = await conditioned(created, parent), second = await replace(first, changed, parent);
				for (const [url, body, type, why] of [
					[CONDITIONAL_UPLOAD + '/' + encodeURIComponent(id) + '?uploadType=media', original, 'application/octet-stream', REPLACEMENT_UNVERIFIED],
					[CONDITIONAL_FILES + '/' + encodeURIComponent(id), JSON.stringify({labels: {trashed: true}}), 'application/json', TRASH_UNVERIFIED],
				]) {
					const denied = await request(url, {method: 'PUT', headers: {'Content-Type': type, 'If-Match': first.etag}, body}, false);
					if (denied.status !== 412) refuse('conditional_unverified', why);
				}
				const proof = await conditioned(second, parent), kept = await content(second);
				if (proof.etag !== second.etag || !kept || !sameBytes(kept, changed)) refuse('conditional_unverified', REPLACEMENT_UNVERIFIED);
				await trash(proof, parent);
				return true;
			})();
			ready.catch(() => { ready = null; });
			return ready;
		};
		shared = {poll: plainPoll(refresh), scopes: () => scopes, childFolders, connect};
	}
	return Object.freeze({
		pause: http.pause, connect: shared.connect,
		beginPoll: shared.poll.begin, endPoll: shared.poll.end,
		folderId: ({create = false} = {}) => folder(create === true),
		area: name => drivePlainStore({...options, folder: plainName(name)}, folder, shared),
		async list() {
			http.check(); await shared.poll.read(); http.check();
			let parent;
			if (parentFolder) {
				const root = await parentFolder(false), children = shared.childFolders(shared.scopes().get(root) || new Map());
				folderId = children.find(row => row.name === path[0])?.id || null;
				if (!folderId) return [];
				parent = folderId;
			} else parent = await folder();
			const rows = [...(shared.scopes().get(parent)?.values() || [])].filter(row => row.mimeType !== FOLDER).map(row => fileRow(row, parent)).filter(Boolean);
			const count = new Map(); for (const row of rows) count.set(row.name, (count.get(row.name) || 0) + 1);
			if (rows.some(row => count.get(row.name) > 1)) refuse('listing', 'Drive has two files with one name; rename one to sync them');
			return rows.map(({name, rev, size}) => ({name, rev, size}));
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
			plainName(file); plainBytes(bytes, MAX_BYTES); http.check();
			if (condition.ifAbsent !== true) {
				if (typeof condition.ifRev !== 'string' || !REVISION.test(condition.ifRev)) refuse('conditional', 'a plain file is written only as new or over the revision last read');
				const parent = await folder(false), row = await named(file, false);
				if (!row || row.rev !== condition.ifRev) throw plainConflict();
				await shared.connect(); http.check();
				return {rev: (await replace(await conditioned(row, parent), bytes, parent)).rev};
			}
			await shared.connect(); http.check();
			const parent = await folder(), row = await named(file);
			if (row) throw plainConflict();
			const id = await newId();
			const made = await upload({id, name: file, mimeType: 'text/markdown', parents: [parent]}, bytes);
			const twins = (await search(`${quote(parent)} in parents and trashed = false and name = ${quote(file)}`)).filter(other => other.name === file);
			if (twins.length > 1) throw plainConflict();
			const mine = fileRow(made, parent);
			if (!mine || mine.id !== id || mine.size !== bytes.length) refuse('response', 'Drive\'s receipt names another file or size');
			return {rev: mine.rev};
		},
		async remove(file, {ifRev} = {}) {
			plainName(file); http.check();
			if (typeof ifRev !== 'string' || !REVISION.test(ifRev)) refuse('conditional', 'a plain file is removed only at the revision last read');
			const parent = await folder(false), row = await named(file, false);
			if (!row) return false;
			if (row.rev !== ifRev) throw plainConflict();
			await shared.connect(); http.check();
			await trash(await conditioned(row, parent), parent);
			return true;
		},
	});
}
