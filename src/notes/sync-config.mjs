export const CLOUDFLARE_SYNC = Object.freeze({
	clientId: '',
	redirectUri: 'https://rapier.website/notes',
	scopes: Object.freeze([]),
	browserRoundTripVerified: false,
});
export const OTHER_SYNC = Object.freeze({
	drive: Object.freeze({clientId: '', redirectUri: 'https://rapier.website/notes', pickerKey: '', appId: ''}),
	onedrive: Object.freeze({clientId: '', redirectUri: 'https://rapier.website/notes'}),
	dropbox: Object.freeze({clientId: '', redirectUri: 'https://rapier.website/notes'}),
});
export const clientRegistered = registration => typeof registration?.clientId === 'string' && !!registration.clientId && !/^PENDING/i.test(registration.clientId);
export const SYNC_UNAVAILABLE = 'sign in with cloudflare will be available soon.';
export const SYNC_CONSENT = 'cloudflare grants rapier access to storage across the account you choose. your notes are kept there as plain markdown files.';
export function registrationReady(config = CLOUDFLARE_SYNC) {
	return typeof config.clientId === 'string' && !!config.clientId && !/^PENDING/i.test(config.clientId) &&
		Array.isArray(config.scopes) && config.scopes.some(scope => scope !== 'openid' && scope !== 'offline_access') &&
		config.scopes.every(scope => typeof scope === 'string' && /^[A-Za-z0-9_.-]+$/.test(scope));
}
export function syncVerified(config = CLOUDFLARE_SYNC) { return config.browserRoundTripVerified === true; }
const VERIFY_DOOR = '#sync-verify';
const SITE_PAGE = /^\/(?:rapier\.html|notes\/?|draw\/?)?$/;
export function syncAvailability({url, native = false, framed = false} = {}, config = CLOUDFLARE_SYNC) {
	if (native) return {ready: false, reason: 'this app does not connect to cloudflare: on android, open rapier sync; on a computer, use rapier in a browser.'};
	if (!registrationReady(config)) return {ready: false, reason: SYNC_UNAVAILABLE};
	try {
		const here = new URL(url), redirect = new URL(config.redirectUri);
		if (!syncVerified(config) && here.hash !== VERIFY_DOOR) return {ready: false, reason: SYNC_UNAVAILABLE};
		if (framed || here.protocol !== 'https:' || redirect.protocol !== 'https:' || here.origin !== redirect.origin || !SITE_PAGE.test(here.pathname) || !SITE_PAGE.test(redirect.pathname) || here.username || here.password || redirect.search || redirect.hash || redirect.username || redirect.password) throw new Error();
	} catch { return {ready: false, reason: 'sign in from https://rapier.website/: this copy cannot receive the cloudflare sign-in.'}; }
	return {ready: true, reason: ''};
}

export function r2KeyAvailability({url, native = false, framed = false} = {}) {
	if (native) return {ready: false, reason: 'this app does not connect to cloudflare: on android, open rapier sync; on a computer, use rapier in a browser.'};
	try {
		const here = new URL(url);
		if (framed || here.origin !== 'https://rapier.website' || !SITE_PAGE.test(here.pathname) || here.username || here.password) throw new Error();
	} catch { return {ready: false, reason: 'open https://rapier.website/ to connect your r2 bucket.'}; }
	return {ready: true, reason: ''};
}
