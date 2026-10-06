import {createHTTP, publicOptions, fail, refuse, isProviderRefusal} from './provider-http.mjs';
import {createVerifier as publicVerifier, challengeFor as publicChallenge, postForm} from './provider-oauth.mjs';
// Authorization Code + PKCE, public client, no secret (https://dash.cloudflare.com/.well-known/openid-configuration).
// Produces a REST bearer for api.cloudflare.com only (notes/transport-r2.mjs); never an S3 credential.
export const AUTHORIZE_ENDPOINT = 'https://dash.cloudflare.com/oauth2/auth';
export const TOKEN_ENDPOINT = 'https://dash.cloudflare.com/oauth2/token';
export const REVOKE_ENDPOINT = 'https://dash.cloudflare.com/oauth2/revoke';
export const ISSUER = 'https://dash.cloudflare.com';
export const CODE_CHALLENGE_METHOD = 'S256';
// Implicit, client_credentials and device_code are unreachable on purpose.
export const SEAMS = Object.freeze({
	clientSecret: 'never; a secret shipped in an HTML file is a published secret',
	implicitGrant: 'never; it returns the token in the URL, where history and referrers keep it',
	clientCredentials: 'never; it authenticates an application, and this authenticates a person',
	deviceCode: 'not implemented; the person is already at a browser',
	plainChallenge: 'refused; S256 only, even though Cloudflare would accept plain',
	s3SigV4: 'not implemented here; see notes/transport-r2.mjs SEAMS -- a bearer is not an access key',
});

export const isOAuthRefusal = isProviderRefusal;

// RFC 7636: 32 random bytes base64url is 43 characters, the floor.
export function createVerifier(random) {
	if (typeof random !== 'function') refuse('random', 'an injected random source is required');
	return publicVerifier(random);
}
export async function challengeFor(verifier, digest) {
	if (typeof digest !== 'function') refuse('digest', 'an injected SHA-256 is required');
	return publicChallenge(verifier, digest);
}

// Scope ids come from the caller; offline_access so one sign-in lasts.
export function authorizeUrl(options = {}) {
	publicOptions(options);
	const {clientId, redirectUri, scopes, state, challenge} = options;
	if (!clientId || typeof clientId !== 'string') refuse('client', 'a client id is required');
	if (typeof redirectUri !== 'string' || !redirectUri.startsWith('https://')) {
		refuse('redirect', 'the redirect must be an exact https URI registered with the client');
	}
	if (!Array.isArray(scopes) || !scopes.length || scopes.some(scope => typeof scope !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(scope))) refuse('scopes', 'registered Cloudflare scope names are required; colon-delimited scopes are not accepted');
	if (typeof state !== 'string' || state.length < 16) refuse('state', 'a state of at least 16 characters is required');
	if (typeof challenge !== 'string' || !challenge) refuse('challenge', 'a PKCE challenge is required');
	const url = new URL(AUTHORIZE_ENDPOINT);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('client_id', clientId);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('scope', scopes.join(' '));
	url.searchParams.set('state', state);
	url.searchParams.set('code_challenge', challenge);
	url.searchParams.set('code_challenge_method', CODE_CHALLENGE_METHOD);
	return url.toString();
}

// `state` is compared here, never by the caller.
export function readRedirect(search, expectedState) {
	const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
	for (const name of ['code', 'state', 'error', 'error_description']) if (params.getAll(name).length > 1) refuse('response', 'the redirect repeated an authorization field');
	const code = params.get('code'), state = params.get('state'), error = params.get('error');
	if (!state || !expectedState || state !== expectedState) refuse('state', 'the redirect did not carry this sign-in\'s own state');
	if (code && error) refuse('response', 'the redirect carried both a code and an error');
	if (error) refuse('denied', 'cloudflare sign-in was not completed. try signing in again.');
	if (!code) refuse('code', 'the redirect carried no authorization code');
	return code;
}

function readToken(body) {
	if (!body || typeof body !== 'object') refuse('response', 'the token endpoint returned no object');
	const access = body.access_token, type = String(body.token_type || '').toLowerCase();
	if (typeof access !== 'string' || !access) refuse('response', 'the token endpoint returned no access token');
	if (type !== 'bearer') refuse('response', 'the token endpoint did not return a bearer token');
	const seconds = Number(body.expires_in);
	return Object.freeze({
		accessToken: access,
		refreshToken: typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : null,
		expiresIn: Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : null,
		scope: typeof body.scope === 'string' ? body.scope : '',
	});
}

export function createOAuthClient(options = {}) {
	publicOptions(options);
	const {fetch: fetchFn, clientId, redirectUri, timeoutMs = 30000} = options;
	if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) refuse('timeout', 'the credential request needs a bounded timeout');
	if (typeof fetchFn !== 'function') refuse('fetch', 'an injected fetch is required; this module never reaches for an ambient one');
	if (!clientId || typeof clientId !== 'string') refuse('client', 'a client id is required');

	const http = createHTTP({fetch: fetchFn, signal: options.signal, timeoutMs});
	const post = async (endpoint, fields, empty = false) => {
		try {
			return await postForm(http, endpoint, {...fields, client_id: clientId}, {empty, exactTarget: true,
				headers: {'content-type': 'application/x-www-form-urlencoded', accept: 'application/json'},
				rejection: response => fail('provider', 'cloudflare refused the request (http ' + response.status + '). check your cloudflare access and try again.')});
		} catch (error) {
			// Cloudflare's caller contract names any unconfirmed credential request "network".
			// Body deadlines now cover non-cooperative streams as well as cooperative fetches.
			if (['network', 'timeout', 'cancelled'].includes(error?.code)) refuse('network', 'cloudflare could not be reached; the request is not confirmed. check your connection and try again.');
			throw error;
		}
	};

	return Object.freeze({
		pause: http.pause,
		async exchange({code, verifier}) {
			if (!code || typeof code !== 'string') refuse('code', 'an authorization code is required');
			if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) refuse('verifier', 'the PKCE verifier from this sign-in is required');
			if (typeof redirectUri !== 'string' || !redirectUri) refuse('redirect', 'the same redirect URI is required for the exchange');
			return readToken(await post(TOKEN_ENDPOINT, {
				grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier,
			}));
		},
		async refresh({refreshToken}) {
			if (!refreshToken || typeof refreshToken !== 'string') refuse('refresh', 'a refresh token is required');
			return readToken(await post(TOKEN_ENDPOINT, {grant_type: 'refresh_token', refresh_token: refreshToken}));
		},
		// Sign-out revokes at Cloudflare: a forgotten token still works.
		async revoke({token, hint}) {
			if (!token || typeof token !== 'string') refuse('token', 'a token is required to revoke');
			const fields = {token};
			if (hint === 'refresh_token' || hint === 'access_token') fields.token_type_hint = hint;
			await post(REVOKE_ENDPOINT, fields, true);
			return true;
		},
	});
}
