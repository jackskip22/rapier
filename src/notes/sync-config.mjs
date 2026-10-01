// Public registration facts, never credentials. Fill these from Rapier's registered client.
// docs/cloudflare-registration.md owns the registration and live OAuth/storage/refresh/revoke checklist.
export const CLOUDFLARE_SYNC = Object.freeze({
	clientId: '',
	redirectUri: 'https://rapier.website/notes',
	scopes: Object.freeze([]),
	browserRoundTripVerified: false,
});
export const SYNC_UNAVAILABLE = 'sign in with cloudflare will be available soon.';
export const SYNC_CONSENT = 'cloudflare grants rapier access to storage across the account you choose. your notes are encrypted before they leave this device.';
// The registration facts alone: a client id and a scope beyond identity.
export function registrationReady(config = CLOUDFLARE_SYNC) {
	return typeof config.clientId === 'string' && !!config.clientId && !/^PENDING/i.test(config.clientId) &&
		Array.isArray(config.scopes) && config.scopes.some(scope => scope !== 'openid' && scope !== 'offline_access') &&
		config.scopes.every(scope => typeof scope === 'string' && /^[A-Za-z0-9_.-]+$/.test(scope));
}
// The sign-in is offered to people only once its live round trip has been run and recorded here. That run
// happens on the site itself, so it needs a door before the switch is on: a page opened at `#sync-verify`
// (typed on purpose; no link leads there) offers a registered, unverified sign-in for exactly that run
// (docs/open-work.md item 20, F6). Everyone else reads SYNC_UNAVAILABLE until the switch is thrown.
export function syncVerified(config = CLOUDFLARE_SYNC) { return config.browserRoundTripVerified === true; }
const VERIFY_DOOR = '#sync-verify';
// The page's own addresses on the site (repo/_redirects): its root, the file itself (the installed app's
// start_url, manifest.json) and the doors /notes and /draw (docs/intent.md laws 41 and 42), with the trailing
// slash the door mark admits (shell/platform.js _rapierDoorPathMark). Both settings panels enter
// sync; OAuth returns to /notes. Nothing else the site serves is Rapier.
const SITE_PAGE = /^\/(?:rapier\.html|notes\/?|draw\/?)?$/;
export function syncAvailability({url, native = false, framed = false} = {}, config = CLOUDFLARE_SYNC) {
	if (native) return {ready: false, reason: 'this app does not connect to cloudflare: on android, open rapier sync; on a computer, use rapier in a browser.'};
	if (!registrationReady(config)) return {ready: false, reason: SYNC_UNAVAILABLE};
	try {
		const here = new URL(url), redirect = new URL(config.redirectUri);
		if (!syncVerified(config) && here.hash !== VERIFY_DOOR) return {ready: false, reason: SYNC_UNAVAILABLE};
		// The sign-in starts from any of the page's addresses and returns to the registered one, on the same origin.
		if (framed || here.protocol !== 'https:' || redirect.protocol !== 'https:' || here.origin !== redirect.origin || !SITE_PAGE.test(here.pathname) || !SITE_PAGE.test(redirect.pathname) || here.username || here.password || redirect.search || redirect.hash || redirect.username || redirect.password) throw new Error();
	} catch { return {ready: false, reason: 'sign in from https://rapier.website/: this copy cannot receive the cloudflare sign-in.'}; }
	return {ready: true, reason: ''};
}

// Bucket keys have their own website gate; no OAuth registration grants this authority.
export function r2KeyAvailability({url, native = false, framed = false} = {}) {
	if (native) return {ready: false, reason: 'this app does not connect to cloudflare: on android, open rapier sync; on a computer, use rapier in a browser.'};
	try {
		const here = new URL(url);
		if (framed || here.origin !== 'https://rapier.website' || !SITE_PAGE.test(here.pathname) || here.username || here.password) throw new Error();
	} catch { return {ready: false, reason: 'open https://rapier.website/ to connect your r2 bucket.'}; }
	return {ready: true, reason: ''};
}
