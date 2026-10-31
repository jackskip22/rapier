// SPDX-License-Identifier: AGPL-3.0-only
import {createDropboxPlainStore} from './plain-dropbox.mjs';
import {createDrivePlainStore} from './plain-drive.mjs';
import {createOneDrivePlainStore} from './plain-onedrive.mjs';
import {createWebDAVPlainStore} from './plain-webdav.mjs';
import {createS3PlainStore} from './plain-s3.mjs';

const fail = (code, message) => Object.assign(new Error(message), {code});
export function plainPlace(provider, value) {
	const name = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
	if (!name || name.length > 255 || /[\\\x00-\x1f\x7f]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) throw fail('connection', 'type a folder name.');
	return provider === 'dropbox' ? '/' + name : name;
}
export function plainStore(provider, {place, token, settings, fetch, authorizeEndpoint} = {}) {
	if (provider === 'dropbox') return createDropboxPlainStore({fetch, token, folder: place});
	if (provider === 'drive') return createDrivePlainStore({fetch, token, folder: place});
	if (provider === 'onedrive') return createOneDrivePlainStore({fetch, token, folder: place});
	if (provider === 'webdav') return createWebDAVPlainStore({fetch, authorizeEndpoint, ...settings, endpoint: String(settings?.endpoint || '').replace(/\/?$/, '/') + encodeURIComponent(place) + '/'});
	if (provider === 's3' || provider === 'r2') return createS3PlainStore({fetch, ...settings, folder: place});
	throw fail('config', 'plain files are not kept on this storage.');
}
