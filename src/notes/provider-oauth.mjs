import {createHTTP, publicOptions, jsonBody, providerError, refuse} from './provider-http.mjs';
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function createVerifier(random = n => crypto.getRandomValues(new Uint8Array(n))) {
	if (typeof random !== 'function') refuse('random', 'a secure random source is required');
	const bytes = random(32);
	if (!(bytes instanceof Uint8Array) || bytes.length !== 32) refuse('random', 'the random source must return 32 bytes');
	return b64url(bytes);
}
export function verifierCheck(verifier) {
	if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) refuse('verifier', 'the PKCE verifier must be 43 to 128 unreserved characters');
	return verifier;
}
export async function challengeFor(verifier, digest = bytes => crypto.subtle.digest('SHA-256', bytes)) {
	verifierCheck(verifier);
	const hash = new Uint8Array(await digest(new TextEncoder().encode(verifier)));
	if (hash.length !== 32) refuse('digest', 'SHA-256 must return 32 bytes');
	return b64url(hash);
}
export function redirectCheck(value) {
	let url; try { url = new URL(value); } catch { refuse('redirect', 'the exact registered redirect URI is required'); }
	const https = url.protocol === 'https:';
	const loopback = url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname);
	const native = /^[a-z][a-z0-9+.-]*\.[a-z0-9+.-]+:$/.test(url.protocol) || url.protocol === 'msauth:' || url.protocol === 'ms-app:';
	if ((!https && !loopback && !native) || url.username || url.password || url.hash || url.search) refuse('redirect', 'use an exact registered HTTPS, native-app, or desktop loopback redirect without query or fragment');
	return value;
}
export function clientCheck(options) {
	publicOptions(options);
	if (typeof options.clientId !== 'string' || !options.clientId || /[\x00-\x20\x7f]/.test(options.clientId)) refuse('client', 'a registered public client id is required');
	redirectCheck(options.redirectUri);
}
export function authorizeParams(options, scope) {
	clientCheck(options);
	if (options.scopes !== undefined || options.scope !== undefined) refuse('scopes', 'this provider requests only its fixed least-privilege scopes');
	if (typeof options.state !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(options.state)) refuse('state', 'use a fresh random state for this sign-in');
	if (typeof options.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(options.challenge)) refuse('challenge', 'a SHA-256 PKCE challenge is required');
	return new URLSearchParams({response_type: 'code', client_id: options.clientId, redirect_uri: options.redirectUri,
		scope, state: options.state, code_challenge: options.challenge, code_challenge_method: 'S256'});
}
export function readRedirect(search, expectedState) {
	if (typeof search !== 'string') refuse('redirect', 'a redirect query string is required');
	const params = new URLSearchParams(search.replace(/^\?/, ''));
	// Check state even on denial. Never let another attempt consume this one's pending record.
	if (!/^[A-Za-z0-9_-]{32,128}$/.test(expectedState || '') || params.getAll('state').length !== 1 || params.get('state') !== expectedState) refuse('state', "the redirect did not carry this sign-in's own state");
	for (const key of ['code', 'error', 'error_description', 'iss']) if (params.getAll(key).length > 1) refuse('redirect', 'the redirect repeated an authorization field');
	if (params.has('error') && params.has('code')) refuse('redirect', 'the redirect contains both a code and an error');
	if (params.has('error')) refuse('denied', params.get('error_description') || params.get('error'));
	const code = params.get('code');
	if (!code || /[\x00-\x1f\x7f]/.test(code)) refuse('code', 'the redirect carried no valid authorization code');
	return code;
}
export function readToken(body, provider, scope, previousRefresh = null) {
	if (!body || typeof body.access_token !== 'string' || !body.access_token || /[\x00-\x20\x7f]/.test(body.access_token)) refuse('response', 'the token endpoint returned no usable access token');
	if (typeof body.token_type !== 'string' || body.token_type.toLowerCase() !== 'bearer') refuse('response', 'the token endpoint did not return a bearer token');
	if (!Number.isFinite(body.expires_in) || body.expires_in <= 0) refuse('response', 'the token endpoint returned no usable expiry');
	if (body.refresh_token !== undefined && (typeof body.refresh_token !== 'string' || !body.refresh_token || /[\x00-\x20\x7f]/.test(body.refresh_token))) refuse('response', 'the token endpoint returned an unusable refresh token');
	if (body.scope !== undefined && typeof body.scope !== 'string') refuse('response', 'the token endpoint returned invalid scopes');
	const permitted = new Set(scope.split(' ').map(s => s.replace('https://graph.microsoft.com/', '')));
	if (body.scope && body.scope.split(/\s+/).some(s => !permitted.has(s.replace('https://graph.microsoft.com/', '')))) refuse('scopes', 'the provider returned a broader grant than this sign-in requested');
	return Object.freeze({provider, tokenType: 'Bearer', accessToken: body.access_token,
		refreshToken: body.refresh_token ?? previousRefresh, expiresIn: Math.floor(body.expires_in), scope: body.scope ?? scope});
}
// The one form-post path. Providers keep their registered redirects, token records and error
// vocabulary; all of them get complete bounded bytes, no automatic retries, and no redirects.
export async function postForm(http, endpoint, fields, {authorization, empty = false, exactTarget = false,
	headers = {'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json'},
	rejection = response => providerError('OAuth', response)} = {}) {
	const response = await http.request(endpoint, {origin: new URL(endpoint).origin, method: 'POST', exactTarget,
		headers: {...headers, ...(authorization ? {Authorization: authorization} : {})},
		body: fields === null ? undefined : new URLSearchParams(fields).toString(), maxBytes: 64 * 1024});
	if (response.status < 200 || response.status >= 300) throw rejection(response);
	return empty ? true : jsonBody(response);
}
export function oauthIO(options, provider) {
	clientCheck(options); const http = createHTTP(options);
	return Object.freeze({pause: http.pause, post: (endpoint, fields, settings = {}) =>
		postForm(http, endpoint, fields, {...settings, rejection: response => providerError(provider, response)})});
}
export function grantCode(code, verifier) {
	if (typeof code !== 'string' || !code || /[\x00-\x1f\x7f]/.test(code)) refuse('code', 'the authorization code is required');
	verifierCheck(verifier);
	return {grant_type: 'authorization_code', code, code_verifier: verifier};
}
export function refreshValue(value) {
	if (typeof value !== 'string' || !value || /[\x00-\x20\x7f]/.test(value)) refuse('refresh', 'a refresh token is required');
	return value;
}
// Provider wrappers expose this bound return leg as finish(). Wrong-state callbacks never reach
// exchange; one-shot redemption prevents replay. No localStorage/sessionStorage or navigation.
export async function pendingSignIn(options, authorize, exchange) {
	const verifier = createVerifier(options.random), state = createVerifier(options.random);
	const url = authorize({...options, state, challenge: await challengeFor(verifier, options.digest)});
	let consumed = false;
	return Object.freeze({url, async finish(callbackURL) {
		if (consumed) refuse('replay', 'this sign-in return has already been consumed');
		let callback; try { callback = new URL(callbackURL); } catch { refuse('redirect', 'the full callback URL is required'); }
		const expected = new URL(options.redirectUri);
		if (callback.protocol !== expected.protocol || callback.host !== expected.host || callback.pathname !== expected.pathname || callback.hash || callback.username || callback.password) refuse('redirect', 'the callback is not this sign-in\'s registered redirect');
		const code = readRedirect(callback.search, state);
		consumed = true;
		return exchange({code, verifier});
	}});
}
