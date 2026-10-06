// App Folder access is selected in the Dropbox console. API paths are already relative to that
// root: never prepend /Apps/Rapier or send Dropbox-API-Path-Root/Select-User overrides.
import {createHTTP, jsonBody, providerError, retryAfter, byteCount, refuse} from './provider-http.mjs';
import {vaultName, providerId, tokenFor, objectKey, objectPrefix, objectName, nameKey, writeBytes, verifyBytes, readBudget, capabilities, keepRemote, pageResult, metadata} from './provider-objects.mjs';
export const DROPBOX_API_ORIGIN = 'https://api.dropboxapi.com';
export const DROPBOX_CONTENT_ORIGIN = 'https://content.dropboxapi.com';
export const PUT_MAX_BYTES = 150000000;
function dropboxIO(options) {
	const http = createHTTP(options), authorization = tokenFor(options.token, 'dropbox');
	const classify = response => {
		if (response.status !== 429 && response.status < 500) return null;
		let data; try { data = jsonBody(response); } catch {}
		return {error: providerError('Dropbox', response, response.status === 429 ? 'rate' : 'server'), delay: retryAfter(response, data?.error?.retry_after ?? data?.retry_after)};
	};
	async function request(origin, path, args, {body, maxBytes} = {}) {
		const content = origin === DROPBOX_CONTENT_ORIGIN;
		const response = await http.retry(() => http.request(origin + '/2/' + path, {origin, method: 'POST', maxBytes,
			headers: {Authorization: authorization, ...(content ? {'Dropbox-API-Arg': JSON.stringify(args), ...(body !== undefined ? {'Content-Type': 'application/octet-stream'} : {})} : {'Content-Type': 'application/json'})},
			body: content ? body : JSON.stringify(args)}), classify);
		if (response.status >= 400 && response.status !== 409) throw providerError('Dropbox', response, response.status === 401 ? 'auth' : response.status === 403 ? 'permission' : 'provider');
		return response;
	}
	return {http, request, rpc: (path, args) => request(DROPBOX_API_ORIGIN, path, args)};
}
// An HTTP 409 is NOT absence. Only the documented path/not_found union member is.
function pathError(response, kind) {
	if (response.status !== 409) return false;
	const error = jsonBody(response).error;
	return error?.['.tag'] === 'path' && error.path?.['.tag'] === kind;
}
function folderRow(row, path, id = null, untagged = false) {
	if (!row || (row['.tag'] !== 'folder' && !(untagged && row['.tag'] === undefined)) || row.path_lower !== path || (id && row.id !== id)) refuse('authority', 'Dropbox returned a different app vault folder');
	providerId(row.id); return row;
}
export async function createDropboxVault(options = {}) {
	const vaultId = vaultName(options.vaultId), path = '/' + vaultId, {rpc} = dropboxIO(options);
	let response = await rpc('files/get_metadata', {path, include_deleted: false});
	if (pathError(response, 'not_found')) {
		response = await rpc('files/create_folder_v2', {path, autorename: false});
		if (response.status === 200) {
			const row = folderRow(jsonBody(response).metadata, path, null, true);
			return {vaultId, folderId: row.id};
		}
		if (pathError(response, 'conflict')) response = await rpc('files/get_metadata', {path, include_deleted: false});
	}
	if (response.status !== 200) throw providerError('Dropbox', response);
	return {vaultId, folderId: folderRow(jsonBody(response), path).id};
}
export function createDropboxTransport(options = {}) {
	const vaultId = vaultName(options.vaultId), folderId = providerId(options.folderId), max = readBudget(options, PUT_MAX_BYTES), root = '/' + vaultId;
	const {http, request, rpc} = dropboxIO(options);
	async function checkFolder() {
		const response = await rpc('files/get_metadata', {path: root, include_deleted: false});
		if (pathError(response, 'not_found')) refuse('missing_root', 'the enrolled Dropbox folder is missing; no empty replacement was created');
		if (response.status !== 200) throw providerError('Dropbox', response);
		folderRow(jsonBody(response), root, folderId);
	}
	function fileRow(row, key, untagged = false) {
		if (!row || (row['.tag'] !== 'file' && !(untagged && row['.tag'] === undefined)) || row.name !== objectName(key) || row.path_lower !== root + '/' + objectName(key)) refuse('authority', 'Dropbox returned an object outside this app vault');
		providerId(row.id); byteCount(row.size); return row;
	}
	async function get(key) {
		objectKey(key); await checkFolder();
		const path = root + '/' + objectName(key), response = await request(DROPBOX_CONTENT_ORIGIN, 'files/download', {path}, {maxBytes: max});
		if (pathError(response, 'not_found')) return null;
		if (response.status !== 200) throw providerError('Dropbox', response);
		let row; try { row = JSON.parse(response.headers.get('dropbox-api-result')); } catch { refuse('response', 'Dropbox returned unreadable download metadata'); }
		fileRow(row, key, true);
		if (byteCount(row.size) !== response.bytes.length) refuse('response', 'Dropbox returned an incomplete or changed object');
		await verifyBytes(key, response.bytes);
		return {...metadata(key, response.bytes.length, row.rev), bytes: response.bytes};
	}
	async function put(key, value, condition) {
		const bytes = await writeBytes(key, value, condition, Math.min(PUT_MAX_BYTES, max));
		const existing = await get(key);
		if (existing) return metadata(key, existing.size, existing.etag);
		const response = await request(DROPBOX_CONTENT_ORIGIN, 'files/upload', {path: root + '/' + objectName(key), mode: 'add', autorename: false, strict_conflict: true, mute: true}, {body: bytes});
		if (pathError(response, 'conflict')) {
			const raced = await get(key);
			if (raced) return metadata(key, raced.size, raced.etag);
			throw providerError('Dropbox', response, 'conflict');
		}
		if (response.status !== 200) throw providerError('Dropbox', response);
		const row = fileRow(jsonBody(response), key, true);
		if (byteCount(row.size) !== bytes.length) refuse('response', 'Dropbox’s upload receipt has a different byte count');
		const got = await get(key);
		if (!got) refuse('upload_unconfirmed', 'Dropbox did not confirm the upload by read-back; local work is kept');
		return metadata(key, got.size, got.etag);
	}
	return Object.freeze({capabilities: capabilities(PUT_MAX_BYTES), pause: http.pause, put, get,
		async stat(key) { const got = await get(key); return got ? metadata(key, got.size, got.etag) : null; },
		async list(prefix, cursor = null) {
			objectPrefix(prefix);
			if (cursor !== null && (typeof cursor !== 'string' || !cursor || cursor.length > 8192)) refuse('cursor', 'invalid Dropbox continuation cursor');
			await checkFolder();
			const response = cursor === null
				? await rpc('files/list_folder', {path: root, recursive: false, include_deleted: false, limit: 2000})
				: await rpc('files/list_folder/continue', {cursor});
			if (response.status !== 200) throw providerError('Dropbox', response);
			const page = jsonBody(response);
			if (!Array.isArray(page.entries) || typeof page.has_more !== 'boolean' || typeof page.cursor !== 'string' || !page.cursor) refuse('listing', 'Dropbox did not say whether this listing is complete');
			const keys = [];
			for (const row of page.entries) { const key = nameKey(row.name); if (!key) continue; fileRow(row, key); if (key.startsWith(prefix)) keys.push(metadata(key, row.size, row.rev)); }
			return pageResult(keys, page.has_more ? page.cursor : null, cursor);
		},
		delete: keepRemote,
	});
}
