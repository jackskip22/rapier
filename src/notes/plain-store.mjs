// SPDX-License-Identifier: AGPL-3.0-only
import {refuse} from './provider-http.mjs';

export const PLAIN_MAX_BYTES = 150000000;
export const plainConflict = () => Object.assign(new Error('the file changed since it was read; nothing was replaced'), {code: 'conflict'});
export function plainName(value) {
	if (typeof value !== 'string' || !value || value.length > 255 || /[/\\\x00-\x1f\x7f]/.test(value) || value === '.' || value === '..') refuse('authority', 'only a file at the top of the plain-files folder can be used');
	return value;
}
export function plainBytes(bytes, max = PLAIN_MAX_BYTES) {
	if (!(bytes instanceof Uint8Array) || bytes.length > max) refuse('too_large', 'the file exceeds this upload budget; the note is kept');
	return bytes;
}
export function plainFolder(value, what = 'choose the folder that keeps the plain files') {
	const parts = typeof value === 'string' ? value.replace(/^\/+|\/+$/g, '').split('/') : [];
	if (!parts.length || parts.some(part => !part || part === '.' || part === '..' || part.length > 255 || /[\\\x00-\x1f\x7f]/.test(part))) refuse('config', what);
	return parts;
}
export const sameBytes = (a, b) => a.length === b.length && a.every((byte, i) => byte === b[i]);
