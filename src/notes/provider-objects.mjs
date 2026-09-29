import {asBytes, byteCount, refuse} from './provider-http.mjs';
const OBJECT = /^(?:objects|keys)\/[a-f0-9]{64}$|^heads\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/[1-9][0-9]*-[a-f0-9]{64}$/;
const PREFIX = /^(?:objects\/|keys\/|heads\/(?:[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/)?)/;
export function objectKey(key) {
	if (typeof key !== 'string' || !OBJECT.test(key) || (key.startsWith('heads/') && !Number.isSafeInteger(Number(key.split('/')[2].split('-')[0])))) refuse('authority', 'only opaque immutable sync object keys are allowed');
	return key;
}
export function objectPrefix(prefix) {
	if (typeof prefix !== 'string' || !(OBJECT.test(prefix) || (PREFIX.test(prefix) && PREFIX.exec(prefix)[0] === prefix))) refuse('authority', 'list only an opaque object family in this vault');
	return prefix;
}
export function vaultName(value) {
	if (!/^[a-f0-9]{32}$/.test(value || '')) refuse('config', 'an opaque vault id is required');
	return value;
}
export function providerId(value) {
	if (typeof value !== 'string' || !/^[A-Za-z0-9_.!:-]{1,256}$/.test(value)) refuse('config', 'a provider-issued folder or file id is required');
	return value;
}
// OneDrive and Dropbox are case-insensitive. Hex only the device component, not the whole key:
// Aa and aa stay different, and even a 64-character device id fits the 255-character name limit.
export function objectName(key) {
	objectKey(key); const parts = key.split('/');
	if (parts[0] === 'heads') parts[1] = [...parts[1]].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
	return parts.join('~');
}
export function nameKey(name) {
	if (typeof name !== 'string') return null;
	const parts = name.split('~');
	if (parts[0] === 'heads') {
		if (parts.length !== 3 || !/^(?:[a-f0-9]{2}){1,64}$/.test(parts[1])) return null;
		parts[1] = parts[1].replace(/../g, pair => String.fromCharCode(parseInt(pair, 16)));
	}
	const key = parts.join('/');
	try { return objectName(key) === name ? key : null; } catch { return null; }
}
export function tokenFor(token, provider) {
	if (!token || token.provider !== provider || token.tokenType !== 'Bearer' || typeof token.accessToken !== 'string' || !token.accessToken || /[\x00-\x20\x7f]/.test(token.accessToken)) refuse('auth', `a ${provider} OAuth bearer record is required, not an S3 credential or another provider's token`);
	return 'Bearer ' + token.accessToken;
}
export async function verifyBytes(key, value) {
	objectKey(key); const bytes = asBytes(value);
	const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
	if (hash !== key.slice(-64)) refuse('ciphertext', 'the immutable object address contains different bytes; nothing was overwritten');
	return bytes;
}
export async function writeBytes(key, value, condition, max) {
	objectKey(key);
	if (condition && Object.keys(condition).length) refuse('conditional', 'caller-supplied conditional writes are unsupported; no request was sent');
	const bytes = asBytes(value).slice();
	if (bytes.length > max) refuse('too_large', 'this provider transfer exceeds the complete-object budget; the original remains local');
	return verifyBytes(key, bytes);
}
export function readBudget(options, max) {
	const n = options.maxReadBytes ?? max;
	if (!Number.isSafeInteger(n) || n < 1 || n > max) refuse('config', 'invalid complete-object read budget');
	return n;
}
export function capabilities(max, resumable = false) {
	return Object.freeze({supportsConditionalWrite: false, supportsETag: true, supportsResumableUpload: resumable,
		supportsMultipart: false, supportsDeltaFeed: false, supportsServerSideCopy: false, supportsNativeVersioning: false,
		maxSingleUploadBytes: max});
}
export function keepRemote() { refuse('keep', 'sync never deletes remote objects; vault retirement requires a separate reviewed operation'); }
export function pageResult(keys, next, previous = null) {
	if (next != null && (typeof next !== 'string' || !next || next.length > 32768 || next === previous)) refuse('cursor', 'the listing did not advance its cursor');
	return {keys, truncated: next != null, cursor: next ?? null};
}
export function metadata(key, size, etag = '') { return {key, size: byteCount(size), etag: String(etag || '')}; }
