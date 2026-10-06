// Visible app-created Rapier folder, drive.file only. No PATCH, replace, trash, or DELETE.
// Folder identity is an enrollment receipt, never a name guessed afresh during sync.
import {createHTTP, jsonBody, providerError, retryAfter, pinnedURL, byteCount, refuse, fail} from './provider-http.mjs';
import {vaultName, providerId, tokenFor, objectKey, objectPrefix, objectName, nameKey, writeBytes, verifyBytes, readBudget, capabilities, keepRemote, pageResult, metadata} from './provider-objects.mjs';
export const DRIVE_API_ORIGIN = 'https://www.googleapis.com';
export const PUT_MAX_BYTES = 300000000;
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024; // multiple of Drive's 256 KiB unit
const FILES = DRIVE_API_ORIGIN + '/drive/v3/files';
const UPLOAD = DRIVE_API_ORIGIN + '/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,mimeType,parents,size,trashed,appProperties';
function driveIO(options) {
	const http = createHTTP(options), authorization = tokenFor(options.token, 'drive');
	const classify = response => {
		let rate = response.status === 429;
		if (response.status === 403) {
			let data; try { data = jsonBody(response); } catch {}
			rate = data?.error?.errors?.some(e => ['rateLimitExceeded', 'userRateLimitExceeded'].includes(e.reason)) === true;
		}
		return rate || response.status >= 500 ? {error: providerError('Google Drive', response, rate ? 'rate' : 'server'), delay: retryAfter(response)} : null;
	};
	async function request(url, init = {}, safe = true) {
		const response = await http.retry(() => http.request(url, {...init, origin: DRIVE_API_ORIGIN, headers: {Authorization: authorization, ...init.headers}}), classify, safe);
		if (response.status >= 400 && ![404, 409].includes(response.status)) throw providerError('Google Drive', response, response.status === 401 ? 'auth' : response.status === 403 ? 'permission' : 'provider');
		return response;
	}
	async function newId() {
		const response = await request(FILES + '/generateIds?count=1&space=drive&type=files');
		if (response.status !== 200) throw providerError('Google Drive', response);
		const ids = jsonBody(response).ids;
		if (!Array.isArray(ids) || ids.length !== 1) refuse('response', 'Drive did not allocate one immutable file id');
		return providerId(ids[0]);
	}
	return {http, request, newId};
}
function folderReceipt(row, id, vaultId) {
	if (!row || row.id !== id || row.mimeType !== FOLDER || row.trashed === true || row.appProperties?.rapierVault !== vaultId) refuse('authority', 'the selected Drive folder is not this vault’s app-created folder');
	return {folderId: id, vaultId};
}
// Persist this id in the companion's enrollment journal BEFORE createDriveVault. Retrying the
// same allocated id cannot create another folder after a lost response. Other devices use the
// same receipt; independently making a same-named folder is not pairing.
export async function allocateDriveVault(options = {}) {
	vaultName(options.vaultId);
	return {vaultId: options.vaultId, folderId: await driveIO(options).newId()};
}
export async function createDriveVault(options = {}) {
	const vaultId = vaultName(options.vaultId), id = providerId(options.folderId), io = driveIO(options);
	const address = FILES + '/' + encodeURIComponent(id) + '?fields=' + encodeURIComponent(FIELDS);
	let response = await io.request(address);
	if (response.status === 404) {
		response = await io.request(FILES + '?fields=' + encodeURIComponent(FIELDS), {method: 'POST', headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({id, name: 'Rapier', mimeType: FOLDER, parents: ['root'], appProperties: {rapierVault: vaultId}})});
		if (response.status === 409) response = await io.request(address);
	}
	if (response.status < 200 || response.status >= 300) throw providerError('Google Drive', response);
	return folderReceipt(jsonBody(response), id, vaultId);
}
export function createDriveTransport(options = {}) {
	const vaultId = vaultName(options.vaultId), folderId = providerId(options.folderId), max = readBudget(options, PUT_MAX_BYTES);
	const {http, request, newId} = driveIO(options);
	const folderAddress = FILES + '/' + encodeURIComponent(folderId) + '?fields=' + encodeURIComponent(FIELDS);
	async function checkFolder() {
		const response = await request(folderAddress);
		if (response.status === 404) refuse('missing_root', 'the enrolled Drive folder is missing; it was not replaced with an empty vault');
		if (response.status !== 200) throw providerError('Google Drive', response);
		folderReceipt(jsonBody(response), folderId, vaultId);
	}
	function fileRow(row, key) {
		if (!row || row.name !== objectName(key) || row.mimeType !== 'application/octet-stream' || row.trashed === true || !Array.isArray(row.parents) || row.parents.length !== 1 || row.parents[0] !== folderId) refuse('authority', 'Drive returned an object outside the enrolled vault');
		providerId(row.id); byteCount(row.size);
		return row;
	}
	async function files(cursor = null, key = null) {
		if (cursor !== null && (typeof cursor !== 'string' || !cursor || cursor.length > 8192)) refuse('cursor', 'invalid Drive page token');
		const query = new URLSearchParams({q: `'${folderId}' in parents and trashed = false${key ? " and name = '" + objectName(key) + "'" : ''}`,
			spaces: 'drive', corpora: 'user', pageSize: '1000', fields: `nextPageToken,incompleteSearch,files(${FIELDS})`});
		if (cursor !== null) query.set('pageToken', cursor);
		const response = await request(FILES + '?' + query);
		if (response.status !== 200) throw providerError('Google Drive', response);
		const page = jsonBody(response);
		if (!Array.isArray(page.files) || (page.incompleteSearch !== undefined && page.incompleteSearch !== false)) refuse('listing', 'Drive did not finish searching this vault; no empty-vault result was invented');
		pageResult([], page.nextPageToken ?? null, cursor);
		return page;
	}
	async function matches(key) {
		const found = [], seen = new Set(); let cursor = null;
		do {
			const page = await files(cursor, key);
			for (const row of page.files) { fileRow(row, key); if (!found.some(old => old.id === row.id)) found.push(row); }
			cursor = page.nextPageToken ?? null;
			if (cursor && seen.has(cursor)) refuse('cursor', 'Drive repeated a page token');
			if (cursor) seen.add(cursor);
		} while (cursor);
		return found;
	}
	async function readRow(key, row) {
		fileRow(row, key);
		if (byteCount(row.size) > max) refuse('too_large', 'this complete object exceeds the local read budget');
		const response = await request(FILES + '/' + encodeURIComponent(row.id) + '?alt=media', {maxBytes: max});
		if (response.status !== 200) {
			if (response.status === 404) refuse('incomplete', 'a listed Drive object disappeared; local work is kept');
			throw providerError('Google Drive', response);
		}
		if (response.bytes.length !== byteCount(row.size)) refuse('response', 'Drive returned an incomplete or changed object');
		await verifyBytes(key, response.bytes);
		return {...metadata(key, response.bytes.length, response.headers.get('etag')), bytes: response.bytes};
	}
	async function get(key) {
		objectKey(key); await checkFolder();
		const rows = await matches(key); let got = null;
		// Drive permits duplicate names. Check EVERY copy, including later pages, rather than
		// select the first and let a corrupted sibling stay hidden. Equal immutable copies are OK.
		for (const row of rows) { const value = await readRow(key, row); if (!got) got = value; }
		return got;
	}
	function sessionURL(value) {
		const url = pinnedURL(value, DRIVE_API_ORIGIN);
		if (url.pathname !== '/upload/drive/v3/files' || url.searchParams.get('uploadType') !== 'resumable' || !url.searchParams.get('upload_id')) refuse('authority', 'Drive returned an unexpected upload-session endpoint');
		return url.href;
	}
	function acknowledged(response, limit) {
		const range = response.headers.get('range');
		if (range == null) return 0;
		const match = /^bytes=0-(\d+)$/.exec(range), n = match ? Number(match[1]) + 1 : NaN;
		if (!Number.isSafeInteger(n) || n < 1 || n > limit) refuse('response', 'Drive acknowledged bytes outside this upload');
		return n;
	}
	async function put(key, value, condition) {
		const bytes = await writeBytes(key, value, condition, Math.min(PUT_MAX_BYTES, max));
		const existing = await get(key);
		if (existing) return metadata(key, existing.size, existing.etag);
		const id = await newId(), entry = {id, name: objectName(key), mimeType: 'application/octet-stream', parents: [folderId]};
		let response;
		if (bytes.length === 0) {
			response = await request(FILES + '?fields=' + encodeURIComponent(FIELDS), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(entry)});
		} else {
			response = await request(UPLOAD + '?uploadType=resumable&fields=' + encodeURIComponent(FIELDS), {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Upload-Content-Type': 'application/octet-stream', 'X-Upload-Content-Length': String(bytes.length)}, body: JSON.stringify(entry)});
			if (response.status === 409) refuse('conflict', 'the allocated Drive id already exists; no replacement was sent');
			if (response.status !== 200) throw providerError('Google Drive', response);
			const session = sessionURL(response.headers.get('location'));
			let offset = 0, failures = 0;
			while (offset < bytes.length) {
				const end = Math.min(offset + UPLOAD_CHUNK_BYTES, bytes.length);
				try {
					response = await request(session, {method: 'PUT', headers: {'Content-Type': 'application/octet-stream', 'Content-Range': `bytes ${offset}-${end - 1}/${bytes.length}`}, body: bytes.subarray(offset, end), resume308: true}, false);
				} catch (error) {
					if (!['network', 'timeout', 'rate', 'server'].includes(error.code) || ++failures > 4 || error.retryAfterMs > 60000) throw error;
					await http.wait(Math.max(error.retryAfterMs || 0, 1000 * 2 ** (failures - 1)));
					// Ask what arrived, instead of guessing from the failed request's body length.
					response = await request(session, {method: 'PUT', headers: {'Content-Range': `bytes */${bytes.length}`}, body: new Uint8Array(0), resume308: true});
				}
				if (response.status === 308) {
					const next = acknowledged(response, end);
					if (next < offset || (next === offset && ++failures > 4)) refuse('upload_unconfirmed', 'Drive did not advance the upload; the complete local object is kept');
					offset = next;
				} else if (response.status === 200 || response.status === 201) { offset = bytes.length; break; }
				else throw providerError('Google Drive', response, response.status === 404 ? 'upload_unconfirmed' : 'provider');
			}
		}
		if (![200, 201].includes(response.status)) refuse('upload_unconfirmed', 'Drive has not confirmed the completed upload');
		const row = fileRow(jsonBody(response), key);
		if (row.id !== id || byteCount(row.size) !== bytes.length) refuse('response', 'Drive’s upload receipt names different bytes or a different file');
		await readRow(key, row);
		const checked = await get(key); // include a duplicate name created concurrently, not just our new id
		if (!checked) refuse('upload_unconfirmed', 'Drive did not retain the completed object; local work is kept');
		return metadata(key, checked.size, checked.etag);
	}
	return Object.freeze({capabilities: capabilities(PUT_MAX_BYTES, true), pause: http.pause, put, get,
		async stat(key) { const got = await get(key); return got ? metadata(key, got.size, got.etag) : null; },
		async list(prefix, cursor = null) {
			objectPrefix(prefix); await checkFolder(); const page = await files(cursor), keys = [], seen = new Set();
			for (const row of page.files) {
				const key = nameKey(row.name); if (!key) continue;
				fileRow(row, key);
				if (key.startsWith(prefix) && !seen.has(key)) { keys.push(metadata(key, row.size)); seen.add(key); }
			}
			return pageResult(keys, page.nextPageToken ?? null, cursor);
		},
		delete: keepRemote,
	});
}
