// Endpoints: accounts.google.com/.well-known/openid-configuration. Wire-level public-client flow; Google's web client still needs a secret. Android uses Google's native handoff.
import {authorizeParams, oauthIO, grantCode, refreshValue, readToken, pendingSignIn} from './provider-oauth.mjs';
export const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
export const SCOPES = 'https://www.googleapis.com/auth/drive.file';
export const SETUP_NOTICE = 'Google Drive needs a registered Google app and a proved native authorization return. Google web code flow requires a backend; Rapier will not embed its secret or silently switch to implicit tokens.';
export function authorizeUrl(options = {}) {
	const params = authorizeParams(options, SCOPES);
	params.set('access_type', 'offline'); params.set('prompt', 'consent');
	return AUTHORIZE_ENDPOINT + '?' + params;
}
export function createOAuthClient(options = {}) {
	const io = oauthIO(options, 'Google Drive');
	options = Object.freeze({...options});
	const exchange = async ({code, verifier}) => readToken(await io.post(TOKEN_ENDPOINT, {...grantCode(code, verifier), client_id: options.clientId, redirect_uri: options.redirectUri}), 'drive', SCOPES);
	return Object.freeze({pause: io.pause, exchange,
		begin: () => pendingSignIn(options, authorizeUrl, exchange),
		async refresh({refreshToken}) {
			refreshValue(refreshToken);
			return readToken(await io.post(TOKEN_ENDPOINT, {grant_type: 'refresh_token', refresh_token: refreshToken, client_id: options.clientId}), 'drive', SCOPES, refreshToken);
		},
		async revoke({token}) {
			refreshValue(token);
			// Google takes the token alone. Revocation affects the project grant, not only this tab.
			return io.post(REVOKE_ENDPOINT, {token}, {empty: true});
		},
	});
}
