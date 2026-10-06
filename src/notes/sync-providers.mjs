// The other storage services on rapier.website: Google Drive, OneDrive, Dropbox (a public-client PKCE sign-in in this page,
// returning to rapier.website). S3-compatible storage and WebDAV are any server a person types in, which no fixed list of
// addresses can name: they stay with the Android app and are not offered on the web. This module owns nothing the sync engine
// owns: it names the services, checks their settings, builds the SAME shared transports the Android side carries
// (notes/transport-*.mjs) and the SAME OAuth clients (notes/*-oauth.mjs), and says whether a service may be used yet. The
// vault, the key and every transfer stay in notes/sync-session.mjs, vault.mjs and sync.mjs: this is not a second sync engine.
// Importing it neither fetches nor starts a sign-in.
import {createDriveTransport, allocateDriveVault, createDriveVault} from './transport-drive.mjs';
import {createOneDriveTransport, createOneDriveVault} from './transport-onedrive.mjs';
import {createDropboxTransport, createDropboxVault} from './transport-dropbox.mjs';
import {createOAuthClient as createDriveOAuthClient, authorizeUrl as driveAuthorizeUrl} from './drive-oauth.mjs';
import {createOAuthClient as createOneDriveOAuthClient, authorizeUrl as oneDriveAuthorizeUrl, REVOCATION as ONEDRIVE_REVOCATION} from './onedrive-oauth.mjs';
import {createOAuthClient as createDropboxOAuthClient, authorizeUrl as dropboxAuthorizeUrl} from './dropbox-oauth.mjs';
import {createVerifier, challengeFor, readRedirect} from './provider-oauth.mjs';
import {fail} from './provider-http.mjs';
import {OTHER_SYNC, clientRegistered} from './sync-config.mjs';

// Order is the order the sheet lists them. `soon` is the one sentence a person reads while the service is locked.
export const PROVIDERS = Object.freeze({
	drive: Object.freeze({id: 'drive', label: 'Google Drive', oauth: true, soon: 'Sign in with Google Drive is coming soon.'}),
	onedrive: Object.freeze({id: 'onedrive', label: 'OneDrive', oauth: true, soon: 'Sign in with OneDrive is coming soon.'}),
	dropbox: Object.freeze({id: 'dropbox', label: 'Dropbox', oauth: true, soon: 'Sign in with Dropbox is coming soon.'}),
});
export const OTHER_PROVIDERS = Object.freeze(Object.keys(PROVIDERS));
export const isOtherProvider = id => typeof id === 'string' && Object.hasOwn(PROVIDERS, id);
export const providerUsesSignIn = id => isOtherProvider(id) && PROVIDERS[id].oauth;
// The sentence a person reads where a locked service's sign-in was pressed.
export const providerSoon = id => isOtherProvider(id) ? PROVIDERS[id].soon : 'This is coming soon.';
export const SETTINGS_DOMAIN = vaultId => 'rapier-sync-provider/' + vaultId;

const ID = /^[A-Za-z0-9_.!:-]{1,256}$/;
const exactly = (value, names, what) => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('config', 'enter the ' + what + ' settings.');
	for (const name of Object.keys(value)) if (!names.includes(name)) throw fail('config', 'the ' + what + ' settings carry a field this sync does not use.');
};

// What a saved connection keeps for a service, sealed under the vault key: where this vault lives (a Drive folder, the
// OneDrive app folder and its vault folder, a Dropbox folder). The grammar is checked by the shared transport's own constructor; nothing here is a second parser.
export function providerSettings(provider, input) {
	if (!isOtherProvider(provider)) throw fail('config', 'choose one of the storage services rapier carries.');
	if (provider === 'drive' || provider === 'dropbox') {
		exactly(input, ['folderId'], PROVIDERS[provider].label);
		if (typeof input.folderId !== 'string' || !ID.test(input.folderId)) throw fail('config', 'the ' + PROVIDERS[provider].label + ' folder is not complete.');
		return Object.freeze({folderId: input.folderId});
	}
	if (provider === 'onedrive') {
		exactly(input, ['appFolderId', 'folderId'], PROVIDERS[provider].label);
		if ([input.appFolderId, input.folderId].some(id => typeof id !== 'string' || !ID.test(id))) throw fail('config', 'the OneDrive folder is not complete.');
		return Object.freeze({appFolderId: input.appFolderId, folderId: input.folderId});
	}
	throw fail('config', 'choose one of the storage services rapier carries.');
}

// The shared transport for a vault, built the way the Android side builds it. A sign-in service takes the bearer record
// the OAuth client issued ({provider, tokenType, accessToken}).
export function providerTransport(provider, {settings, vaultId, token, fetch, signal}) {
	const common = {fetch, vaultId, ...(signal ? {signal} : {})};
	if (provider === 'drive') return createDriveTransport({...common, token, folderId: settings.folderId});
	if (provider === 'onedrive') return createOneDriveTransport({...common, token, appFolderId: settings.appFolderId, folderId: settings.folderId});
	if (provider === 'dropbox') return createDropboxTransport({...common, token, folderId: settings.folderId});
	throw fail('config', 'choose one of the storage services rapier carries.');
}

// A sign-in service creates this vault's folder in the person's own account once, the first time the vault is made.
export async function createProviderLocation(provider, {fetch, token, vaultId, signal}) {
	const common = {fetch, token, vaultId, ...(signal ? {signal} : {})};
	if (provider === 'drive') {
		const {folderId} = await allocateDriveVault(common);
		await createDriveVault({...common, folderId});
		return providerSettings('drive', {folderId});
	}
	if (provider === 'onedrive') {
		const {appFolderId, folderId} = await createOneDriveVault(common);
		return providerSettings('onedrive', {appFolderId, folderId});
	}
	if (provider === 'dropbox') return providerSettings('dropbox', {folderId: (await createDropboxVault(common)).folderId});
	throw fail('config', 'this service has no sign-in.');
}

const CLIENTS = {drive: createDriveOAuthClient, onedrive: createOneDriveOAuthClient, dropbox: createDropboxOAuthClient};
const AUTHORIZE = {drive: driveAuthorizeUrl, onedrive: oneDriveAuthorizeUrl, dropbox: dropboxAuthorizeUrl};
export function providerOAuth(provider, {fetch, clientId, redirectUri, signal}) {
	if (!providerUsesSignIn(provider)) throw fail('config', 'this service has no sign-in.');
	return CLIENTS[provider]({fetch, clientId, redirectUri, ...(signal ? {signal} : {})});
}
// The page's half of the PKCE return: a fresh verifier and state (kept in this tab until the redirect comes back) and
// the address the person is sent to. The code is exchanged only by finishProviderSignIn, against the same state.
export async function beginProviderSignIn(provider, {clientId, redirectUri, random = n => crypto.getRandomValues(new Uint8Array(n))}) {
	if (!providerUsesSignIn(provider)) throw fail('config', 'this service has no sign-in.');
	const verifier = createVerifier(random), state = createVerifier(random);
	const challenge = await challengeFor(verifier);
	return {verifier, state, url: AUTHORIZE[provider]({clientId, redirectUri, state, challenge})};
}
export const readProviderRedirect = readRedirect;
// Signing out: Google and Dropbox revoke the grant at the provider; Microsoft has no revocation endpoint, so the
// person is told where to remove Rapier's access (notes/onedrive-oauth.mjs REVOCATION) and nothing is claimed.
export async function revokeProviderGrant(provider, {fetch, clientId, redirectUri, grant, signal}) {
	const client = providerOAuth(provider, {fetch, clientId, redirectUri, signal});
	if (provider === 'onedrive') { client.pause(); return {revoked: false, message: ONEDRIVE_REVOCATION.message}; }
	if (provider === 'drive') await client.revoke({token: grant.refreshToken || grant.accessToken});
	else await client.revoke({accessToken: grant.accessToken, refreshToken: grant.refreshToken});
	return {revoked: true, message: ''};
}

// The page's CSP names the origins it may reach (security/csp.mjs, the sole owner). A service's are admitted only once it is
// switched on (its `ready`, and where it signs in its client id), so a locked service widens nothing. Only fixed, named hosts
// are ever listed: no switch can admit a bare https: or a wildcard beyond a service's own hosts.
export const PROVIDER_ORIGINS = Object.freeze({
	drive: Object.freeze(['https://oauth2.googleapis.com', 'https://www.googleapis.com']),
	onedrive: Object.freeze(['https://login.microsoftonline.com', 'https://graph.microsoft.com', 'https://*.files.1drv.com', 'https://*.sharepoint.com']),
	dropbox: Object.freeze(['https://api.dropboxapi.com', 'https://content.dropboxapi.com']),
});
export function providerConnectOrigins({registrations = OTHER_SYNC, listed = []} = {}) {
	const origins = [];
	for (const id of OTHER_PROVIDERS) {
		if (!listed.some(row => row.id === id && row.ready === true)) continue;
		if (PROVIDERS[id].oauth && !clientRegistered(registrations[id])) continue;
		for (const origin of PROVIDER_ORIGINS[id]) if (!origins.includes(origin)) origins.push(origin);
	}
	return origins;
}

// May this service be used on this page yet? Three locks, in this order: the service's own `ready` gate in
// notes/cloud-providers.mjs (its registration and its live test), the registration's client id where it signs in, and the
// page itself (https at rapier.website, not framed, not the Android or Windows app, which have Rapier Sync).
// `soon` marks the first two: the sheet answers a press with the one short pop-up and sends nothing.
export function providerAvailability(provider, {environment = {}, registration = OTHER_SYNC[provider], listed = []} = {}) {
	if (!isOtherProvider(provider)) return {ready: false, soon: false, reason: 'choose one of the storage services rapier carries.'};
	const row = listed.find(entry => entry.id === provider), signs = PROVIDERS[provider].oauth;
	const registered = !signs || clientRegistered(registration);
	if (!row || row.ready !== true || !registered) return {ready: false, soon: true, reason: PROVIDERS[provider].soon};
	if (environment.native) return {ready: false, soon: false, reason: 'this app does not connect to ' + PROVIDERS[provider].label + ': on android, open rapier sync; on a computer, use rapier in a browser.'};
	try {
		const here = new URL(environment.url), site = new URL(signs ? registration.redirectUri : 'https://rapier.website/');
		if (environment.framed || here.protocol !== 'https:' || here.origin !== site.origin || here.username || here.password) throw new Error();
	} catch { return {ready: false, soon: false, reason: 'sign in from https://rapier.website/: this copy cannot connect ' + PROVIDERS[provider].label + '.'}; }
	return {ready: true, soon: false, reason: ''};
}
