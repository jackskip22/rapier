// SPDX-License-Identifier: AGPL-3.0-only
// Shared by the writer and carried-page boot: a file can only return to this worker's one-use route.
export const RETURN_ORIGIN = 'https://mcp.rapier.website';
export function returnAddress(value) {
	if (typeof value !== 'string' || /[\s\u0000-\u001f\u007f-\u009f\\@?#]/u.test(value))
		throw new Error('the return address must be an HTTPS return URL on ' + RETURN_ORIGIN);
	let url;
	try { url = new URL(value); } catch { throw new Error('the return address must be an HTTPS return URL on ' + RETURN_ORIGIN); }
	if (url.origin !== RETURN_ORIGIN || !/^\/return\/[A-Za-z0-9._-]{1,256}$/.test(url.pathname))
		throw new Error('the return address must be an HTTPS return URL on ' + RETURN_ORIGIN);
	return url.href;
}
export function returnExpiresAt(value) {
	if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
		throw new Error('the return expiry must be the ISO timestamp from document.create_return');
	return value;
}
