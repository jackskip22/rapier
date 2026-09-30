// SPDX-License-Identifier: AGPL-3.0-only
const fail = (code, message) => Object.assign(new Error(message), {code});
// Top-level file, the two asset folders, or history's three sub-folders; never deeper. Same space as native-store.mjs `prefixes`.
const HISTORY_SUBS = ['manifests', 'texts', 'blobs'];
// The same six folders as native-store.mjs and idb-store.mjs (notes-idb-store-admission).
export const FOLDERS = new Set(['', 'audio', 'attachments', 'thumbs', ...HISTORY_SUBS.map(sub => 'history/' + sub)]);
export const parts = name => {
	if (typeof name !== 'string' || !name || name.includes('\\') || name.includes('\0')) throw fail('name', 'This file does not belong to the notes folder.');
	const value = name.split('/');
	const admitted = value.length === 1
		|| value.length === 2 && ['audio', 'attachments', 'thumbs'].includes(value[0])
		|| value.length === 3 && value[0] === 'history' && HISTORY_SUBS.includes(value[1]);
	if (!admitted || value.some(p => !p || p === '.' || p === '..')) throw fail('name', 'This file does not belong to the notes folder.');
	return value;
};
