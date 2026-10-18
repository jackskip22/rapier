// SPDX-License-Identifier: AGPL-3.0-only
import {createHTTP, jsonBody, providerError, retryAfter, refuse} from './provider-http.mjs';
import {tokenFor} from './provider-objects.mjs';
import {DROPBOX_API_ORIGIN, DROPBOX_CONTENT_ORIGIN} from './transport-dropbox.mjs';

const MAX_BYTES = 150000000;
const conflict = () => Object.assign(new Error('the file changed since it was read; nothing was replaced'), {code: 'conflict'});
const REV = /^[0-9a-f]{9,64}$/i;

export function createDropboxPlainStore(options = {}) {
	const folder = options.folder;
	if (typeof folder !== 'string' || !/^\/[^/\\\x00-\x1f\x7f]+(?:\/[^/\\\x00-\x1f\x7f]+)*$/.test(folder) || folder.split('/').some(part => part === '.' || part === '..')) refuse('config', 'choose the Dropbox folder that keeps the plain files');
	const http = createHTTP(options), authorization = tokenFor(options.token, 'dropbox'), lower = folder.toLowerCase();
	let rootId = options.rootId || null;
	const relative = options.relative || '';
	if (rootId !== null && !/^id:[A-Za-z0-9_-]{1,256}$/.test(rootId) || relative && !/^\/(?:[^/\\\x00-\x1f\x7f]+\/?)+$/.test(relative)) refuse('config', 'the Dropbox folder identity is not complete');
	const rootPath = () => rootId ? rootId + relative : folder;
	const classify = response => response.status === 429 || response.status >= 500
		? {error: providerError('Dropbox', response, response.status === 429 ? 'rate' : 'server'), delay: retryAfter(response)} : null;
	async function request(origin, path, args, {body, maxBytes = 4 * 1024 * 1024} = {}) {
		const content = origin === DROPBOX_CONTENT_ORIGIN;
		const response = await http.retry(() => http.request(origin + '/2/' + path, {origin, method: 'POST', maxBytes,
			headers: {Authorization: authorization, ...(content ? {'Dropbox-API-Arg': JSON.stringify(args), ...(body !== undefined ? {'Content-Type': 'application/octet-stream'} : {})} : {'Content-Type': 'application/json'})},
			body: content ? body : JSON.stringify(args)}), classify);
		if (response.status >= 400 && response.status !== 409) throw providerError('Dropbox', response, response.status === 401 ? 'auth' : response.status === 403 ? 'permission' : 'provider');
		return response;
	}
	const errorTag = response => { try { const error = jsonBody(response).error; return [error?.['.tag'], error?.[error?.['.tag']]?.['.tag']]; } catch { return []; } };
	const name = value => {
		if (typeof value !== 'string' || !value || value.length > 255 || /[/\\\x00-\x1f\x7f]/.test(value) || value === '.' || value === '..') refuse('authority', 'only a file at the top of the plain-files folder can be used');
		return value;
	};
	const pathOf = value => rootPath() + '/' + name(value);
	function fileRow(row) {
		if (!row || row['.tag'] !== undefined && row['.tag'] !== 'file' || typeof row.path_lower !== 'string' || row.path_lower !== lower + '/' + String(row.name).toLowerCase() || !REV.test(row.rev || '') || !Number.isSafeInteger(row.size) || row.size < 0) {
			refuse('authority', 'Dropbox returned a file outside the plain-files folder');
		}
		return {name: name(row.name), rev: row.rev, size: row.size};
	}
	return Object.freeze({
		pause: http.pause,
		async destinationIdentity({create = false} = {}) {
			let response = await request(DROPBOX_API_ORIGIN, 'files/get_metadata', {path: folder, include_deleted: false});
			if (create && response.status === 409 && errorTag(response).join('/') === 'path/not_found') {
				const made = await request(DROPBOX_API_ORIGIN, 'files/create_folder_v2', {path: folder, autorename: false});
				if (made.status !== 200 && !(made.status === 409 && errorTag(made).join('/') === 'path/conflict')) throw providerError('Dropbox', made);
				response = await request(DROPBOX_API_ORIGIN, 'files/get_metadata', {path: folder, include_deleted: false});
			}
			if (response.status !== 200) throw providerError('Dropbox', response, 'connection');
			const row = jsonBody(response);
			if (row['.tag'] !== 'folder' || row.path_lower !== lower || !/^id:[A-Za-z0-9_-]{1,256}$/.test(row.id || '')) refuse('authority', 'Dropbox returned a different plain-files folder');
			rootId = row.id;
			return Object.freeze({id: rootId});
		},
		pictures: () => createDropboxPlainStore({...options, folder: folder + '/attachments', rootId, relative: relative + '/attachments'}),
		async list() {
			const out = [], seen = new Set();
			let response = await request(DROPBOX_API_ORIGIN, 'files/list_folder', {path: rootPath(), recursive: false, include_deleted: false, limit: 2000});
			for (let pages = 0; ; pages++) {
				if (response.status === 409 && errorTag(response).join('/') === 'path/not_found') return [];
				if (response.status !== 200) throw providerError('Dropbox', response);
				const page = jsonBody(response);
				if (!Array.isArray(page.entries) || typeof page.has_more !== 'boolean') refuse('listing', 'Dropbox returned no complete listing');
				for (const row of page.entries) {
					if (row['.tag'] !== 'file' || String(row.path_lower).split('/').length !== lower.split('/').length + 1) continue;
					const file = fileRow(row);
					if (seen.has(file.name.toLowerCase())) refuse('listing', 'Dropbox listed one file twice');
					seen.add(file.name.toLowerCase()); out.push(file);
				}
				if (!page.has_more) return out;
				if (typeof page.cursor !== 'string' || !page.cursor || pages > 1000) refuse('cursor', 'Dropbox did not supply an advancing cursor');
				response = await request(DROPBOX_API_ORIGIN, 'files/list_folder/continue', {cursor: page.cursor});
			}
		},
		async get(file) {
			const response = await request(DROPBOX_CONTENT_ORIGIN, 'files/download', {path: pathOf(file)}, {maxBytes: MAX_BYTES});
			if (response.status === 409 && errorTag(response).join('/') === 'path/not_found') return null;
			if (response.status !== 200) throw providerError('Dropbox', response);
			let meta; try { meta = JSON.parse(response.headers.get('dropbox-api-result')); } catch { refuse('response', 'Dropbox returned no download metadata'); }
			const row = fileRow(meta);
			if (row.name.toLowerCase() !== file.toLowerCase() || row.size !== response.bytes.length) refuse('response', 'Dropbox returned a different or incomplete file');
			return {bytes: response.bytes, rev: row.rev};
		},
		async put(file, bytes, condition = {}) {
			if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES) refuse('too_large', 'the file exceeds this upload budget; the note is kept');
			const mode = condition.ifAbsent === true ? 'add' : REV.test(condition.ifRev || '') ? {'.tag': 'update', update: condition.ifRev} : refuse('conditional', 'a plain file is written only as new or over the revision last read');
			const response = await request(DROPBOX_CONTENT_ORIGIN, 'files/upload', {path: pathOf(file), mode, autorename: false, strict_conflict: true, mute: true}, {body: bytes});
			if (response.status === 409 && errorTag(response)[0] === 'path') throw conflict();
			if (response.status !== 200) throw providerError('Dropbox', response);
			const row = fileRow(jsonBody(response));
			if (row.name.toLowerCase() !== file.toLowerCase() || row.size !== bytes.length) refuse('response', 'Dropbox\'s receipt names another file or size');
			return {rev: row.rev};
		},
		async remove(file, {ifRev} = {}) {
			if (!REV.test(ifRev || '')) refuse('conditional', 'a plain file is removed only at the revision last read');
			const response = await request(DROPBOX_API_ORIGIN, 'files/delete_v2', {path: pathOf(file), parent_rev: ifRev});
			if (response.status === 409) { if (errorTag(response).join('/') === 'path_lookup/not_found') return false; throw conflict(); }
			if (response.status !== 200) throw providerError('Dropbox', response);
			return true;
		},
	});
}
