// Graph AppFolder only. No replacement PUT, automatic folder recreation, or remote deletion.
import {createHTTP, jsonBody, providerError, retryAfter, pinnedURL, byteCount, refuse, fail} from './provider-http.mjs';
import {vaultName, providerId, tokenFor, objectKey, objectPrefix, objectName, nameKey, writeBytes, verifyBytes, readBudget, capabilities, keepRemote, pageResult, metadata} from './provider-objects.mjs';
export const ONEDRIVE_API_ORIGIN = 'https://graph.microsoft.com';
export const PUT_MAX_BYTES = 250000000;
const DRIVE = ONEDRIVE_API_ORIGIN + '/v1.0/me/drive';
const FIELDS = 'id,name,size,file,folder,parentReference,eTag,remoteItem,deleted';
function oneDriveIO(options) {
	const http = createHTTP(options), authorization = tokenFor(options.token, 'onedrive');
	const classify = response => response.status === 429 || response.status >= 500
		? {error: providerError('OneDrive', response, response.status === 429 ? 'rate' : 'server'), delay: retryAfter(response)} : null;
	async function request(url, init = {}) {
		const response = await http.retry(() => http.request(url, {...init, origin: ONEDRIVE_API_ORIGIN, headers: {Authorization: authorization, ...init.headers}}), classify);
		if (response.status >= 400 && ![404, 409, 412].includes(response.status)) throw providerError('OneDrive', response, response.status === 401 ? 'auth' : response.status === 403 ? 'permission' : 'provider');
		return response;
	}
	return {http, request};
}
function folderRow(row, id, parent = null, name = null) {
	if (!row || row.id !== id || !row.folder || row.remoteItem || row.deleted || (parent && row.parentReference?.id !== parent) || (name && row.name !== name)) refuse('authority', 'OneDrive returned a folder outside this enrolled app vault');
	providerId(row.id); return row;
}
const item = id => DRIVE + '/items/' + encodeURIComponent(id);
export async function createOneDriveVault(options = {}) {
	const vaultId = vaultName(options.vaultId), {request} = oneDriveIO(options);
	let response = await request(DRIVE + '/special/approot?$select=' + FIELDS);
	if (response.status !== 200) throw providerError('OneDrive', response);
	const app = jsonBody(response), appFolderId = providerId(app.id); folderRow(app, appFolderId);
	const address = item(appFolderId) + ':/' + vaultId + '?$select=' + FIELDS;
	response = await request(address);
	if (response.status === 404) {
		response = await request(item(appFolderId) + '/children', {method: 'POST', headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({name: vaultId, folder: {}, '@microsoft.graph.conflictBehavior': 'fail'})});
		if (response.status === 409) response = await request(address);
	}
	if (response.status !== 200 && response.status !== 201) throw providerError('OneDrive', response);
	const row = jsonBody(response), folderId = providerId(row.id); folderRow(row, folderId, appFolderId, vaultId);
	return {vaultId, appFolderId, folderId};
}
export function createOneDriveTransport(options = {}) {
	const vaultId = vaultName(options.vaultId), appFolderId = providerId(options.appFolderId), folderId = providerId(options.folderId), max = readBudget(options, PUT_MAX_BYTES);
	const {http, request} = oneDriveIO(options);
	async function checkFolder() {
		let response = await request(DRIVE + '/special/approot?$select=' + FIELDS);
		if (response.status === 404) refuse('missing_root', 'the OneDrive app folder is missing; local work is kept');
		if (response.status !== 200) throw providerError('OneDrive', response);
		folderRow(jsonBody(response), appFolderId);
		response = await request(item(folderId) + '?$select=' + FIELDS);
		if (response.status === 404) refuse('missing_root', 'the enrolled OneDrive vault is missing; no empty replacement was created');
		if (response.status !== 200) throw providerError('OneDrive', response);
		folderRow(jsonBody(response), folderId, appFolderId, vaultId);
	}
	function fileRow(row, key) {
		if (!row || !row.file || row.folder || row.remoteItem || row.deleted || row.name !== objectName(key) || row.parentReference?.id !== folderId) refuse('authority', 'OneDrive returned an object outside this enrolled vault');
		providerId(row.id); byteCount(row.size); return row;
	}
	const byName = key => item(folderId) + ':/' + encodeURIComponent(objectName(key));
	function downloadURL(value) {
		let url; try { url = new URL(value); } catch { refuse('authority', 'OneDrive returned no download capability'); }
		// URLs come ONLY from this authenticated, identity-checked driveItem. Never follow
		// /content's bearer-carrying 302. These global-cloud download hosts receive NO bearer.
		if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
			!(/^[a-z0-9.-]+\.files\.1drv\.com$/.test(url.hostname) || /^[a-z0-9-]+\.sharepoint\.com$/.test(url.hostname))) refuse('authority', 'OneDrive returned an unsupported download host; no credential or request was sent there');
		return url;
	}
	async function get(key) {
		objectKey(key); await checkFolder();
		const response = await request(byName(key) + '?$select=' + FIELDS + ',@microsoft.graph.downloadUrl');
		if (response.status === 404) return null;
		if (response.status !== 200) throw providerError('OneDrive', response);
		const row = fileRow(jsonBody(response), key);
		if (byteCount(row.size) > max) refuse('too_large', 'the complete OneDrive object exceeds the local read budget');
		const url = downloadURL(row['@microsoft.graph.downloadUrl']);
		const content = await http.retry(() => http.request(url.href, {origin: url.origin, maxBytes: max}), r => r.status === 429 || r.status >= 500
			? {error: fail(r.status === 429 ? 'rate' : 'server', 'OneDrive temporarily refused the download; local work is kept'), delay: retryAfter(r)} : null);
		if (content.status !== 200) throw fail('download_unconfirmed', 'OneDrive did not supply a complete download; request a fresh file capability on the next sync', {status: content.status});
		if (content.bytes.length !== byteCount(row.size)) refuse('response', 'OneDrive returned an incomplete or changed object');
		await verifyBytes(key, content.bytes);
		return {...metadata(key, content.bytes.length, row.eTag), bytes: content.bytes};
	}
	async function put(key, value, condition) {
		const bytes = await writeBytes(key, value, condition, Math.min(PUT_MAX_BYTES, max));
		const existing = await get(key);
		if (existing) return metadata(key, existing.size, existing.etag);
		// Graph's documented instance attribute belongs in the URL for content PUT. The default
		// is REPLACE, which would destroy a raced foreign write even after a correct preflight.
		const query = new URLSearchParams({'@microsoft.graph.conflictBehavior': 'fail'});
		const response = await request(byName(key) + ':/content?' + query, {method: 'PUT', headers: {'Content-Type': 'application/octet-stream'}, body: bytes});
		if (response.status === 409 || response.status === 412) {
			const raced = await get(key);
			if (raced) return metadata(key, raced.size, raced.etag);
			throw providerError('OneDrive', response, 'conflict');
		}
		if (![200, 201].includes(response.status)) throw providerError('OneDrive', response);
		const row = fileRow(jsonBody(response), key);
		if (byteCount(row.size) !== bytes.length) refuse('response', 'OneDrive’s upload receipt has a different byte count');
		const got = await get(key);
		if (!got) refuse('upload_unconfirmed', 'OneDrive did not confirm the upload by read-back; local work is kept');
		return metadata(key, got.size, got.etag);
	}
	const children = item(folderId) + '/children';
	function nextLink(cursor) {
		if (typeof cursor !== 'string' || !cursor || cursor.length > 32768) refuse('cursor', 'invalid OneDrive continuation link');
		const url = pinnedURL(cursor, ONEDRIVE_API_ORIGIN);
		if (url.pathname !== new URL(children).pathname || ![...url.searchParams.keys()].every(k => ['$select', '$top', '$skiptoken', '$skip'].includes(k)) || !(url.searchParams.has('$skiptoken') || url.searchParams.has('$skip'))) refuse('cursor', 'OneDrive’s next page left this vault’s children collection');
		return cursor; // preserve the complete issued link; never reconstruct the skip token
	}
	return Object.freeze({capabilities: capabilities(PUT_MAX_BYTES), pause: http.pause, put, get,
		async stat(key) { const got = await get(key); return got ? metadata(key, got.size, got.etag) : null; },
		async list(prefix, cursor = null) {
			objectPrefix(prefix); const address = cursor === null ? children + '?$top=200&$select=' + FIELDS : nextLink(cursor);
			await checkFolder(); const response = await request(address);
			if (response.status !== 200) throw providerError('OneDrive', response);
			const page = jsonBody(response);
			if (!Array.isArray(page.value)) refuse('listing', 'OneDrive returned no children collection');
			const keys = [];
			for (const row of page.value) { const key = nameKey(row.name); if (!key) continue; fileRow(row, key); if (key.startsWith(prefix)) keys.push(metadata(key, row.size, row.eTag)); }
			const next = page['@odata.nextLink']; if (next !== undefined) nextLink(next);
			return pageResult(keys, next ?? null, cursor);
		},
		delete: keepRemote,
	});
}
