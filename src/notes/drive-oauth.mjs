import {tokenAuthorizeParams, readTokenRedirect, oauthIO, refreshValue} from './provider-oauth.mjs';
import {refuse} from './provider-http.mjs';
export const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
export const SCOPES = 'https://www.googleapis.com/auth/drive.file';
export const RETURNS_TOKEN = true;
export function authorizeUrl(options = {}) {
	return AUTHORIZE_ENDPOINT + '?' + tokenAuthorizeParams(options, SCOPES);
}
export const readReturn = (fragment, state, onToken) => readTokenRedirect(fragment, state, 'drive', SCOPES, onToken);
export function createOAuthClient(options = {}) {
	const io = oauthIO(options, 'Google Drive');
	options = Object.freeze({...options});
	return Object.freeze({pause: io.pause,
		async exchange() { refuse('unsupported', 'google drive returns its token to the page: there is no code to exchange'); },
		async refresh() { refuse('auth', 'your google drive sign-in expired: sign in again.'); },
		async revoke({token}) {
			refreshValue(token);
			return io.post(REVOKE_ENDPOINT, {token}, {empty: true});
		},
	});
}
