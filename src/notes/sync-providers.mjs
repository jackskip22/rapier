import {createDriveTransport, allocateDriveVault, createDriveVault} from './transport-drive.mjs';
import {createOneDriveTransport, createOneDriveVault} from './transport-onedrive.mjs';
import {createDropboxTransport, createDropboxVault} from './transport-dropbox.mjs';
import {createOAuthClient as createDriveOAuthClient, authorizeUrl as driveAuthorizeUrl, readReturn as readDriveReturn} from './drive-oauth.mjs';
import {createOAuthClient as createOneDriveOAuthClient, authorizeUrl as oneDriveAuthorizeUrl, REVOCATION as ONEDRIVE_REVOCATION} from './onedrive-oauth.mjs';
import {createOAuthClient as createDropboxOAuthClient, authorizeUrl as dropboxAuthorizeUrl} from './dropbox-oauth.mjs';
import {createVerifier, challengeFor, readRedirect} from './provider-oauth.mjs';
import {fail} from './provider-http.mjs';
import {OTHER_SYNC, clientRegistered} from './sync-config.mjs';

export const PROVIDERS = Object.freeze({
	drive: Object.freeze({id: 'drive', label: 'Google Drive', oauth: true, soon: 'Sign in with Google Drive is coming soon.'}),
	onedrive: Object.freeze({id: 'onedrive', label: 'OneDrive', oauth: true, soon: 'Sign in with OneDrive is coming soon.'}),
	dropbox: Object.freeze({id: 'dropbox', label: 'Dropbox', oauth: true, soon: 'Sign in with Dropbox is coming soon.'}),
});
export const OTHER_PROVIDERS = Object.freeze(Object.keys(PROVIDERS));
export const isOtherProvider = id => typeof id === 'string' && Object.hasOwn(PROVIDERS, id);
export const providerUsesSignIn = id => isOtherProvider(id) && PROVIDERS[id].oauth;
export const providerSoon = id => isOtherProvider(id) ? PROVIDERS[id].soon : 'This is coming soon.';
export const SETTINGS_DOMAIN = vaultId => 'rapier-sync-provider/' + vaultId;

const ID = /^[A-Za-z0-9_.!:-]{1,256}$/;
const exactly = (value, names, what) => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('config', 'enter the ' + what + ' settings.');
	for (const name of Object.keys(value)) if (!names.includes(name)) throw fail('config', 'the ' + what + ' settings carry a field this sync does not use.');
};

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

export function providerTransport(provider, {settings, vaultId, token, fetch, signal}) {
	const common = {fetch, vaultId, ...(signal ? {signal} : {})};
	if (provider === 'drive') return createDriveTransport({...common, token, folderId: settings.folderId});
	if (provider === 'onedrive') return createOneDriveTransport({...common, token, appFolderId: settings.appFolderId, folderId: settings.folderId});
	if (provider === 'dropbox') return createDropboxTransport({...common, token, folderId: settings.folderId});
	throw fail('config', 'choose one of the storage services rapier carries.');
}

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
export function providerOAuth(provider, {fetch, clientId, redirectUri, signal, onToken}) {
	if (!providerUsesSignIn(provider)) throw fail('config', 'this service has no sign-in.');
	return CLIENTS[provider]({fetch, clientId, redirectUri, ...(signal ? {signal} : {}), ...(onToken ? {onToken} : {})});
}
export const providerReturnsToken = id => id === 'drive';
export function readProviderTokenReturn(provider, fragment, state, onToken) {
	if (!providerReturnsToken(provider)) throw fail('config', 'this service returns a code, not a token.');
	return readDriveReturn(fragment, state, onToken);
}
export async function beginProviderSignIn(provider, {clientId, redirectUri, random = n => crypto.getRandomValues(new Uint8Array(n))}) {
	if (!providerUsesSignIn(provider)) throw fail('config', 'this service has no sign-in.');
	if (providerReturnsToken(provider)) { const state = createVerifier(random); return {verifier: null, state, url: driveAuthorizeUrl({clientId, redirectUri, state})}; }
	const verifier = createVerifier(random), state = createVerifier(random);
	const challenge = await challengeFor(verifier);
	return {verifier, state, url: AUTHORIZE[provider]({clientId, redirectUri, state, challenge})};
}
export const readProviderRedirect = readRedirect;
export async function revokeProviderGrant(provider, {fetch, clientId, redirectUri, grant, signal}) {
	const client = providerOAuth(provider, {fetch, clientId, redirectUri, signal});
	if (provider === 'onedrive') { client.pause(); return {revoked: false, message: ONEDRIVE_REVOCATION.message}; }
	if (provider === 'drive') await client.revoke({token: grant.refreshToken || grant.accessToken});
	else await client.revoke({accessToken: grant.accessToken, refreshToken: grant.refreshToken});
	return {revoked: true, message: ''};
}

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
