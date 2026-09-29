// Endpoints: login.microsoftonline.com/common/v2.0/.well-known/openid-configuration. No RFC 7009 revocation; logout is not revocation. No success receipt for either.
import {authorizeParams, oauthIO, grantCode, refreshValue, readToken, pendingSignIn} from './provider-oauth.mjs';
import {fail} from './provider-http.mjs';
export const AUTHORIZE_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
export const TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
export const REVOKE_ENDPOINT = null;
export const LOGOUT_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/logout';
export const SCOPES = 'https://graph.microsoft.com/Files.ReadWrite.AppFolder offline_access';
export const REVOCATION = Object.freeze({revoked: false, actionRequired: true,
	personal: 'https://account.live.com/consent/Manage', organization: 'https://myapps.microsoft.com',
	message: 'Pause sync, then remove Rapier Sync’s access in Microsoft’s app-permissions page. Signing out only ends the browser session; it does not revoke refresh tokens. Administrator-granted access may require your administrator.'});
export function authorizeUrl(options = {}) {
	const params = authorizeParams(options, SCOPES);
	params.set('response_mode', 'query');
	return AUTHORIZE_ENDPOINT + '?' + params;
}
export function createOAuthClient(options = {}) {
	const io = oauthIO(options, 'OneDrive');
	options = Object.freeze({...options});
	const exchange = async ({code, verifier}) => readToken(await io.post(TOKEN_ENDPOINT, {...grantCode(code, verifier), client_id: options.clientId, redirect_uri: options.redirectUri, scope: SCOPES}), 'onedrive', SCOPES);
	return Object.freeze({pause: io.pause, exchange,
		begin: () => pendingSignIn(options, authorizeUrl, exchange),
		async refresh({refreshToken}) {
			refreshValue(refreshToken);
			return readToken(await io.post(TOKEN_ENDPOINT, {grant_type: 'refresh_token', refresh_token: refreshToken, client_id: options.clientId, scope: SCOPES}), 'onedrive', SCOPES, refreshToken);
		},
		async revoke() {
			io.pause();
			throw fail('revoke_required', REVOCATION.message, {revoked: false, action: REVOCATION});
		},
	});
}
