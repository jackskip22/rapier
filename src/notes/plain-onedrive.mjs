// SPDX-License-Identifier: AGPL-3.0-only
import {createHTTP, jsonBody, providerError, retryAfter, byteCount, refuse, fail} from './provider-http.mjs';
import {tokenFor, providerId} from './provider-objects.mjs';
import {ONEDRIVE_API_ORIGIN} from './transport-onedrive.mjs';
import {plainConflict, plainName, plainBytes, plainFolder} from './plain-store.mjs';

const DRIVE = ONEDRIVE_API_ORIGIN + '/v1.0/me/drive';
const MAX_BYTES = 250000000;
const FIELDS = 'id,name,size,file,folder,parentReference,eTag,remoteItem,deleted';
const item = id => DRIVE + '/items/' + encodeURIComponent(id);

export function createOneDrivePlainStore(options = {}) {
	const path = plainFolder(options.folder, 'choose a folder inside Apps/Rapier');
	const http = createHTTP(options), authorization = tokenFor(options.token, 'onedrive');
	const classify = response => response.status === 429 || response.status >= 500
		? {error: providerError('OneDrive', response, response.status === 429 ? 'rate' : 'server'), delay: retryAfter(response)} : null;
	async function request(url, init = {}, safe = true) {
		const response = await http.retry(() => http.request(url, {...init, origin: ONEDRIVE_API_ORIGIN, headers: {Authorization: authorization, ...init.headers}}), classify, safe);
		if (response.status >= 400 && ![404, 409, 412].includes(response.status)) throw providerError('OneDrive', response, response.status === 401 ? 'auth' : response.status === 403 ? 'permission' : 'provider');
		return response;
	}
	let folderId = null;
	async function folder() {
		if (folderId) return folderId;
		let response = await request(DRIVE + '/special/approot?$select=' + FIELDS);
		if (response.status !== 200) throw providerError('OneDrive', response);
		let parent = providerId(jsonBody(response).id);
		for (const name of path) {
			const address = item(parent) + ':/' + encodeURIComponent(name) + '?$select=' + FIELDS;
			response = await request(address);
			if (response.status === 404) {
				response = await request(item(parent) + '/children', {method: 'POST', headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail'})}, false);
				if (response.status === 409) response = await request(address);
			}
			if (![200, 201].includes(response.status)) throw providerError('OneDrive', response);
			const row = jsonBody(response);
			if (!row.folder || row.remoteItem || row.deleted || row.parentReference?.id !== parent || row.name !== name) refuse('authority', 'OneDrive returned a folder outside Apps/Rapier');
			parent = providerId(row.id);
		}
		return folderId = parent;
	}
	function fileRow(row, parent) {
		if (!row || !row.file || row.folder || row.remoteItem || row.deleted || row.parentReference?.id !== parent || typeof row.eTag !== 'string' || !row.eTag) refuse('authority', 'OneDrive returned a file outside the plain-files folder');
		return {name: plainName(row.name), rev: row.eTag, size: byteCount(row.size), id: providerId(row.id)};
	}
	const byName = (parent, file) => item(parent) + ':/' + encodeURIComponent(plainName(file));
	function downloadURL(value) {
		let url; try { url = new URL(value); } catch { refuse('authority', 'OneDrive returned no download address'); }
		if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
			!(/^[a-z0-9.-]+\.files\.1drv\.com$/.test(url.hostname) || /^[a-z0-9-]+\.sharepoint\.com$/.test(url.hostname))) refuse('authority', 'OneDrive returned an unknown download host; nothing was sent there');
		return url;
	}
	const children = parent => item(parent) + '/children?$top=200&$select=' + FIELDS;
	function nextLink(value, parent) {
		const url = new URL(value), expected = new URL(children(parent));
		if (url.origin !== ONEDRIVE_API_ORIGIN || url.pathname !== expected.pathname) refuse('cursor', 'OneDrive\'s next page left the plain-files folder');
		return url.href;
	}
	return Object.freeze({
		pause: http.pause,
		pictures: () => createOneDrivePlainStore({...options, folder: [...path, 'attachments'].join('/')}),
		async list() {
			const parent = await folder(), out = [], seen = new Set();
			let address = children(parent);
			for (let pages = 0; address; pages++) {
				if (pages > 1000) refuse('cursor', 'OneDrive did not finish listing the folder');
				const response = await request(address);
				if (response.status !== 200) throw providerError('OneDrive', response);
				const page = jsonBody(response);
				if (!Array.isArray(page.value)) refuse('listing', 'OneDrive returned no complete listing');
				for (const row of page.value) {
					if (row.folder) continue;
					const file = fileRow(row, parent);
					if (seen.has(file.name.toLowerCase())) refuse('listing', 'OneDrive listed one file twice'); seen.add(file.name.toLowerCase());
					out.push({name: file.name, rev: file.rev, size: file.size});
				}
				address = page['@odata.nextLink'] ? nextLink(page['@odata.nextLink'], parent) : null;
			}
			return out;
		},
		async get(file) {
			const parent = await folder();
			const response = await request(byName(parent, file) + '?$select=' + FIELDS + ',@microsoft.graph.downloadUrl');
			if (response.status === 404) return null;
			if (response.status !== 200) throw providerError('OneDrive', response);
			const meta = jsonBody(response), row = fileRow(meta, parent);
			if (row.name !== file || row.size > MAX_BYTES) refuse('response', 'OneDrive returned another file or one too large');
			const url = downloadURL(meta['@microsoft.graph.downloadUrl']);
			const content = await http.retry(() => http.request(url.href, {origin: url.origin, maxBytes: MAX_BYTES}), r => r.status === 429 || r.status >= 500
				? {error: fail(r.status === 429 ? 'rate' : 'server', 'OneDrive refused the download for now; notes are kept'), delay: retryAfter(r)} : null);
			if (content.status !== 200 || content.bytes.length !== row.size) throw fail('download_unconfirmed', 'OneDrive did not supply the whole file; the next sync asks again');
			return {bytes: content.bytes, rev: row.rev};
		},
		async put(file, bytes, condition = {}) {
			plainBytes(bytes, MAX_BYTES);
			const parent = await folder();
			let response;
			if (condition.ifAbsent === true) {
				response = await request(byName(parent, file) + ':/content?' + new URLSearchParams({'@microsoft.graph.conflictBehavior': 'fail'}), {method: 'PUT', headers: {'Content-Type': 'text/markdown'}, body: bytes}, false);
			} else if (typeof condition.ifRev === 'string' && condition.ifRev && !/[\x00-\x1f]/.test(condition.ifRev)) {
				response = await request(byName(parent, file) + ':/content', {method: 'PUT', headers: {'Content-Type': 'text/markdown', 'If-Match': condition.ifRev}, body: bytes}, false);
				if (response.status === 404) throw plainConflict();
			} else refuse('conditional', 'a plain file is written only as new or over the eTag last read');
			if (response.status === 409 || response.status === 412) throw plainConflict();
			if (![200, 201].includes(response.status)) throw providerError('OneDrive', response);
			const row = fileRow(jsonBody(response), parent);
			if (row.name !== file || row.size !== bytes.length) refuse('response', 'OneDrive\'s receipt names another file or size');
			return {rev: row.rev};
		},
		async remove(file, {ifRev} = {}) {
			if (typeof ifRev !== 'string' || !ifRev || /[\x00-\x1f]/.test(ifRev)) refuse('conditional', 'a plain file is removed only at the eTag last read');
			const parent = await folder();
			const response = await request(byName(parent, file), {method: 'DELETE', headers: {'If-Match': ifRev}}, false);
			if (response.status === 404) return false;
			if (response.status === 412 || response.status === 409) throw plainConflict();
			if (response.status !== 204 && response.status !== 200) throw providerError('OneDrive', response);
			return true;
		},
	});
}
