// Dropbox PKCE (docs.dropboxapi.com/dropbox-api/docs/oauth). App Folder is a console setting, not a scope.
import {authorizeParams, oauthIO, grantCode, refreshValue, readToken, pendingSignIn} from './provider-oauth.mjs';
export const AUTHORIZE_ENDPOINT = 'https://www.dropbox.com/oauth2/authorize';
export const TOKEN_ENDPOINT = 'https://api.dropboxapi.com/oauth2/token';
export const REVOKE_ENDPOINT = 'https://api.dropboxapi.com/2/auth/token/revoke';
export const SCOPES = 'files.metadata.read files.content.read files.content.write';
export function authorizeUrl(options = {}) {
	const params = authorizeParams(options, SCOPES);
	params.set('token_access_type', 'offline');
	return AUTHORIZE_ENDPOINT + '?' + params;
}
export function createOAuthClient(options = {}) {
	const io = oauthIO(options, 'Dropbox');
	options = Object.freeze({...options});
	const exchange = async ({code, verifier}) => readToken(await io.post(TOKEN_ENDPOINT, {...grantCode(code, verifier), client_id: options.clientId, redirect_uri: options.redirectUri}), 'dropbox', SCOPES);
	const refresh = async ({refreshToken}) => {
		refreshValue(refreshToken);
		return readToken(await io.post(TOKEN_ENDPOINT, {grant_type: 'refresh_token', refresh_token: refreshToken, client_id: options.clientId}), 'dropbox', SCOPES, refreshToken);
	};
	return Object.freeze({pause: io.pause, exchange, refresh,
		begin: () => pendingSignIn(options, authorizeUrl, exchange),
		async revoke({accessToken, refreshToken}) {
			// Revoke authenticates with ACCESS, not refresh. Mint a live access token when an
			// offline grant is available; its revocation also invalidates that refresh-token family.
			const token = refreshToken ? (await refresh({refreshToken})).accessToken : refreshValue(accessToken);
			return io.post(REVOKE_ENDPOINT, null, {authorization: 'Bearer ' + token, empty: true});
		},
	});
}
