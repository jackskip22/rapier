// SPDX-License-Identifier: AGPL-3.0-only
import {authorizeParams, createVerifier, challengeFor, readRedirect, oauthIO, grantCode, refreshValue, readToken} from './provider-oauth.mjs';
import {createOAuthClient as dropboxClient, authorizeUrl as dropboxAuthorize, SCOPES as DROPBOX_SCOPES} from './dropbox-oauth.mjs';
import {createOAuthClient as oneDriveClient, authorizeUrl as oneDriveAuthorize, SCOPES as ONEDRIVE_SCOPES, REVOCATION} from './onedrive-oauth.mjs';
import {SCOPES as DRIVE_SCOPES, TOKEN_ENDPOINT as GOOGLE_TOKEN, REVOKE_ENDPOINT as GOOGLE_REVOKE, AUTHORIZE_ENDPOINT as GOOGLE_AUTHORIZE} from './drive-oauth.mjs';
import {fail, refuse, asBytes} from './provider-http.mjs';

export const WINDOWS_REDIRECTS = Object.freeze({
	drive: 'http://127.0.0.1:53682/sync/drive',
	dropbox: 'http://127.0.0.1:53682/sync/dropbox',
	onedrive: 'http://127.0.0.1:53682/sync/onedrive',
});
export const WINDOWS_MESSAGES = Object.freeze({
	cancelled: 'Sign-in canceled', busy: 'Finish the other sign-in first', browser: "Couldn't open your browser",
	unconfirmed: 'Not synced. Your work is kept.', provider: "Couldn't reach {provider}",
	permission: "{provider} didn't allow access", reauthenticate: 'Sign in to {provider} again', fault: 'Sync failed. Try again.',
});
const PROVIDER_NAMES = Object.freeze({drive: 'Drive', dropbox: 'Dropbox', onedrive: 'OneDrive', webdav: 'WebDAV'});
export function windowsFailure(error, service, context = 'sign-in') {
	if (error?.windowsFailure) return error;
	const diagnostic = String(error?.message || ''), native = /^sync:(cancelled|busy|browser|unconfirmed|provider|permission|reauthenticate|fault)$/.exec(diagnostic)?.[1];
	const code = error?.code || ({cancelled: 'cancelled', busy: 'busy', browser: 'unavailable', unconfirmed: 'network', provider: 'network', permission: 'permission', reauthenticate: 'credential', fault: 'config'}[native] || 'config');
	const kind = native || (context === 'transfer' && code === 'cancelled' ? 'unconfirmed' : code === 'cancelled' || code === 'timeout' && diagnostic.includes('sign-in') ? 'cancelled' : code === 'busy' ? 'busy' :
		['permission', 'scopes', 'denied'].includes(code) ? 'permission' : ['credential', 'device', 'refresh'].includes(code) ? 'reauthenticate' :
		['timeout', 'network'].includes(code) ? 'unconfirmed' : ['response', 'redirect'].includes(code) ? 'provider' : code === 'unavailable' && diagnostic.includes('browser') ? 'browser' : 'fault');
	const message = WINDOWS_MESSAGES[kind].replace('{provider}', PROVIDER_NAMES[service] || 'Drive');
	const mapped = fail(code, message);
	Object.defineProperties(mapped, {windowsFailure: {value: true}, nativeClass: {value: kind}, diagnostic: {value: diagnostic}});
	return mapped;
}
const SCOPES = Object.freeze({drive: DRIVE_SCOPES, dropbox: DROPBOX_SCOPES, onedrive: ONEDRIVE_SCOPES});
const CHUNK = 128 * 1024, MAX_BYTES = 150000000, ID = /^[a-f0-9]{32}$/;
const HEX = /^[a-f0-9]{64}$/;
const utf8 = new TextEncoder();
const digest = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
const to64 = bytes => { let out = ''; for (let at = 0; at < bytes.length; at += 8192) out += String.fromCharCode(...bytes.subarray(at, at + 8192)); return btoa(out); };
function from64(text, expected) {
	if (typeof text !== 'string' || text.length !== Math.ceil(expected / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) refuse('response', 'the native transfer did not return complete bytes');
	const raw = atob(text), bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
	if (bytes.length !== expected || to64(bytes) !== text) refuse('response', 'the native transfer did not return complete bytes');
	return bytes;
}
function serviceCheck(service) { if (!Object.hasOwn(WINDOWS_REDIRECTS, service)) refuse('config', WINDOWS_MESSAGES.fault); }
function headerObject(value) {
	const source = new Headers(value), result = {};
	for (const [name, content] of source) {
		if (content.length > 16384 || ['cookie', 'cookie2', 'host', 'connection', 'content-length', 'proxy-authorization', 'referer', 'origin', 'transfer-encoding', 'upgrade', 'te'].includes(name)) refuse('authority', 'the native request contains a browser-owned header');
		result[name] = content;
	}
	if (Object.keys(result).length > 64) refuse('authority', 'the native request contains too many headers');
	return result;
}
function responseHeaders(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 64) refuse('response', 'the native response headers are invalid');
	let total = 0;
	for (const [name, content] of Object.entries(value)) {
		if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) || typeof content !== 'string' || content.length > 16384 || /[\x00-\x08\x0a-\x1f\x7f]/.test(content) || (total += name.length + content.length) > 128 * 1024) refuse('response', 'the native response headers are invalid');
	}
	return new Headers(value);
}
export function windowsRequestAllowed(service, value, method, headers = {}) {
	try {
		serviceCheck(service);
		const url = new URL(value);
		if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.href.length > 16384 || !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;
		const host = url.hostname;
		const rawPath = String(value).replace(/^https:\/\/[^/]+/, '').split('?')[0];
		if (/(?:\/\/|\/\.\.?\/|\/\.\.?$|%2e|%2f|%5c)/i.test(rawPath)) return false;
		if (service === 'drive') return host === 'www.googleapis.com' && (/^\/(?:upload\/)?drive\/v3\//.test(url.pathname) || ['GET', 'PUT'].includes(method) && /^\/(?:upload\/)?drive\/v2\/files(?:\/|$)/.test(url.pathname)) ||
			method === 'POST' && [GOOGLE_TOKEN, GOOGLE_REVOKE].includes(String(value));
		if (service === 'dropbox') return ['api.dropboxapi.com', 'content.dropboxapi.com'].includes(host) && url.pathname.startsWith('/2/files/') ||
			method === 'POST' && ['https://api.dropboxapi.com/oauth2/token', 'https://api.dropboxapi.com/2/auth/token/revoke'].includes(String(value));
		if (host === 'graph.microsoft.com') return url.pathname.startsWith('/v1.0/');
		if (host === 'login.microsoftonline.com') return method === 'POST' && String(value) === 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
		return method === 'GET' && !new Headers(headers).has('authorization') &&
			(/^[a-z0-9.-]+\.files\.1drv\.com$/.test(host) || /^[a-z0-9-]+\.sharepoint\.com$/.test(host));
	} catch { return false; }
}
function exactId(value) { if (!ID.test(value || '')) refuse('response', 'the native host returned no transfer identity'); return value; }
const stopped = () => fail('cancelled', 'the native request was canceled; local work is kept');
async function boundedClose(action) {
	let timer;
	try { return await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => { timer = setTimeout(() => reject(fail('timeout', 'the native cleanup was not acknowledged')), 1000); })]); }
	finally { clearTimeout(timer); }
}

export function createWindowsFetch({call, service, timeoutMs = 30000, purpose = 'access', sourceReceipt = null, onCredentialReceipt} = {}) {
	serviceCheck(service);
	if (typeof call !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 || !['access', 'revoke'].includes(purpose) || sourceReceipt !== null && !HEX.test(sourceReceipt)) refuse('config', WINDOWS_MESSAGES.fault);
	const perform = async (url, options = {}) => {
		const method = String(options.method || 'GET').toUpperCase(), headers = headerObject(options.headers);
		if (!windowsRequestAllowed(service, url, method, headers)) refuse('authority', 'the native request left its provider');
		const credentialRoute = [GOOGLE_TOKEN, GOOGLE_REVOKE, 'https://api.dropboxapi.com/oauth2/token', 'https://api.dropboxapi.com/2/auth/token/revoke', 'https://login.microsoftonline.com/common/oauth2/v2.0/token'].includes(String(url));
		if (!credentialRoute && (purpose !== 'access' || !sourceReceipt)) refuse('credential', 'the file request has no active native custody receipt');
		if (options.redirect && !['error', 'manual'].includes(options.redirect) || options.credentials && options.credentials !== 'omit') refuse('authority', 'native requests neither follow redirects nor carry browser credentials');
		const body = options.body == null ? new Uint8Array() : typeof options.body === 'string' ? utf8.encode(options.body) : asBytes(options.body).slice();
		if (body.length > MAX_BYTES || ['GET', 'HEAD'].includes(method) && body.length) refuse('too_large', 'the native request body is invalid');
		let transfer = null, cancelled = false, timedOut = false, timer, rejectStop;
		const stop = new Promise((_, reject) => { rejectStop = reject; });
		const cancel = () => { cancelled = true; rejectStop(stopped()); if (transfer) void Promise.resolve().then(() => call('sync.http.cancel', {transfer})).catch(() => {}); };
		const signal = options.signal;
		if (signal?.aborted) throw stopped();
		signal?.addEventListener('abort', cancel, {once: true});
		timer = setTimeout(() => { timedOut = true; cancel(); }, timeoutMs);
		const check = () => { if (cancelled) throw stopped(); };
		const ask = (operation, args) => Promise.race([Promise.resolve().then(() => { check(); return call(operation, args); }), stop]);
		try {
			const sha256 = await Promise.race([digest(body), stop]); check();
			const begun = Promise.resolve().then(() => { check(); return call('sync.http.begin', {service, purpose, sourceReceipt, url: String(url), method, headers, size: body.length, sha256, maxBytes: MAX_BYTES, timeoutMs}); });
			begun.then(answer => { if (cancelled && ID.test(answer?.transfer || '')) void Promise.resolve().then(() => call('sync.http.cancel', {transfer: answer.transfer})).catch(() => {}); }, () => {});
			transfer = exactId((await Promise.race([begun, stop]))?.transfer);
			for (let offset = 0; offset < body.length; offset += CHUNK) {
				const bytes = body.subarray(offset, Math.min(body.length, offset + CHUNK));
				const answer = await ask('sync.http.write', {transfer, offset, bytes: to64(bytes)});
				if (answer?.offset !== offset + bytes.length) refuse('response', 'the native host did not receive the whole request');
			}
			const answer = await ask('sync.http.send', {transfer});
			if (!answer || answer.url !== String(url) || answer.redirected !== false || !Number.isInteger(answer.status) || answer.status < 200 || answer.status > 599 ||
				!Number.isSafeInteger(answer.size) || answer.size < 0 || answer.size > MAX_BYTES || !HEX.test(answer.sha256 || '')) refuse('response', 'the native host did not return a complete response');
			if (answer.status >= 300 && answer.status < 400 && options.redirect !== 'manual' && answer.status !== 308) refuse('redirect', 'the native provider redirected; credentials were not forwarded');
			const receivedHeaders = responseHeaders(answer.headers);
			if (([204, 205, 304].includes(answer.status) || method === 'HEAD') && answer.size) refuse('response', 'the native provider returned an unexpected response body');
			const received = new Uint8Array(answer.size);
			for (let offset = 0; offset < received.length; offset += CHUNK) {
				const size = Math.min(CHUNK, received.length - offset), part = await ask('sync.http.read', {transfer, offset, size});
				if (part?.offset !== offset) refuse('response', 'the native response changed its byte position');
				received.set(from64(part.bytes, size), offset);
			}
			if (await Promise.race([digest(received), stop]) !== answer.sha256) refuse('response', 'the native response did not arrive whole');
			check();
			if (answer.credentialReceipt !== undefined) {
				if (!HEX.test(answer.credentialReceipt)) refuse('response', 'the native credential receipt was not confirmed');
				onCredentialReceipt?.(answer.credentialReceipt);
			}
			const response = new Response([204, 205, 304].includes(answer.status) || method === 'HEAD' ? null : received, {status: answer.status, headers: receivedHeaders});
			Object.defineProperty(response, 'url', {value: answer.url});
			return response;
		} catch (error) {
			if (timedOut) throw fail('timeout', 'the native request timed out; a remote change is unconfirmed');
			throw error;
		} finally {
			clearTimeout(timer); signal?.removeEventListener('abort', cancel);
			if (transfer) { try { await boundedClose(() => call('sync.http.close', {transfer})); } catch {} }
		}
	};
	return async (...args) => { try { return await perform(...args); } catch (error) { throw windowsFailure(error, service, 'transfer'); } };
}

function desktopGoogle(options) {
	const io = oauthIO(options, 'Google Drive');
	const exchange = async ({code, verifier}) => readToken(await io.post(GOOGLE_TOKEN, {...grantCode(code, verifier), client_id: options.clientId, redirect_uri: options.redirectUri}), 'drive', DRIVE_SCOPES, null, options.onToken);
	return {exchange, async refresh({refreshToken}) {
		refreshValue(refreshToken);
		return readToken(await io.post(GOOGLE_TOKEN, {grant_type: 'refresh_token', refresh_token: refreshToken, client_id: options.clientId}), 'drive', DRIVE_SCOPES, refreshToken, options.onToken);
	}, async revoke({token}) { refreshValue(token); return io.post(GOOGLE_REVOKE, {token}, {empty: true}); }};
}
function desktopGoogleAuthorize(options) {
	const params = authorizeParams(options, DRIVE_SCOPES);
	params.set('access_type', 'offline');
	return GOOGLE_AUTHORIZE + '?' + params;
}
const CLIENTS = {drive: desktopGoogle, dropbox: dropboxClient, onedrive: oneDriveClient};
const AUTHORIZE = {drive: desktopGoogleAuthorize, dropbox: dropboxAuthorize, onedrive: oneDriveAuthorize};

export function createWindowsCustody({call} = {}) {
	if (typeof call !== 'function') refuse('config', WINDOWS_MESSAGES.fault);
	return async record => {
		try {
			const answer = await call('sync.credentials.capture', record);
			if (answer?.sealed !== true || answer.accepted !== record.accepted || !HEX.test(answer.receipt || '') || answer.receipt !== record.receipt) refuse('device', 'the native credential receipt was not confirmed');
			return Object.freeze({...answer});
		} catch (error) { throw windowsFailure(error, record?.binding?.service); }
	};
}

export function createWindowsSignIn({call, service, clientId, custody, random, timeoutMs = 600000} = {}) {
	serviceCheck(service);
	if (typeof call !== 'function' || typeof custody !== 'function' || typeof clientId !== 'string' || !clientId || /^PENDING/i.test(clientId) || /[\x00-\x20\x7f]/.test(clientId)) refuse('config', WINDOWS_MESSAGES.fault);
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) refuse('config', WINDOWS_MESSAGES.fault);
	const redirectUri = WINDOWS_REDIRECTS[service];
	const binding = Object.freeze({service, clientId, redirectUri, scopes: SCOPES[service]});
	let work = null, listener = null, epoch = 0, cancelWait = null;
	const active = ticket => { if (ticket !== epoch) throw stopped(); };
	const close = async () => { const id = listener; listener = null; if (id) await boundedClose(() => call('sync.authorize.close', {listener: id})); };
	async function capture(action, ticket, revocation = false, sourceReceipt = null) {
		let receipt = null;
		const issued = [], fetch = createWindowsFetch({call, service, sourceReceipt, purpose: revocation ? 'revoke' : 'access', onCredentialReceipt: value => { receipt = value; }});
		const client = CLIENTS[service]({fetch, clientId, redirectUri, onToken: token => issued.push({token, receipt})});
		let token, failure;
		try {
			token = await action(client); active(ticket);
			if (token) {
				const normalize = value => value.replace('https://graph.microsoft.com/', '');
				const wanted = SCOPES[service].split(' ').filter(value => value !== 'offline_access').map(normalize);
				const received = String(token.scope || '').split(/\s+/).map(normalize);
				if (wanted.some(value => !received.includes(value))) refuse('permission', 'the native provider did not grant the requested file access');
			}
		} catch (error) { failure = error; }
		for (const {token: issuedToken, receipt: issuedReceipt} of issued) {
			if (!HEX.test(issuedReceipt || '')) refuse('response', 'the native credential receipt was not confirmed');
			const accepted = !failure && ticket === epoch && issuedToken === token && !revocation;
			await custody(Object.freeze({binding, token: issuedToken, receipt: issuedReceipt, accepted}));
			if (accepted && ticket !== epoch) await custody(Object.freeze({binding, token: issuedToken, receipt: issuedReceipt, accepted: false}));
		}
		active(ticket); if (failure) throw failure;
		return token ? Object.freeze({...token, receipt: issued.find(row => row.token === token)?.receipt}) : token;
	}
	function once(action) {
		if (work) throw windowsFailure(fail('busy', 'the native sign-in is already running'), service);
		const ticket = epoch;
		work = Promise.resolve().then(() => { active(ticket); return action(ticket); }).catch(error => { throw windowsFailure(error, service); }).finally(() => { work = null; });
		return work;
	}
	return Object.freeze({binding,
		begin: () => once(async ticket => {
			const verifier = createVerifier(random), state = createVerifier(random), challenge = await challengeFor(verifier);
			active(ticket);
			let timer;
			const expiry = new Promise((_, reject) => {
				cancelWait = () => reject(stopped());
				timer = setTimeout(() => { epoch++; void close().catch(() => {}); reject(fail('timeout', 'the native sign-in expired')); }, timeoutMs);
			});
			try {
				const opened = Promise.resolve(call('sync.authorize.listen', {service, redirectUri, state, timeoutMs}));
				opened.then(answer => { if (ticket !== epoch && ID.test(answer?.listener || '')) void Promise.resolve().then(() => call('sync.authorize.close', {listener: answer.listener})).catch(() => {}); }, () => {});
				listener = exactId((await Promise.race([opened, expiry]))?.listener); active(ticket);
				const url = AUTHORIZE[service]({clientId, redirectUri, state, challenge});
				const launched = await Promise.race([call('sync.authorize.open', {listener, url}), expiry]);
				active(ticket); if (launched?.opened !== true) refuse('unavailable', 'Windows could not open the system browser');
				const returned = await Promise.race([call('sync.authorize.wait', {listener}), expiry]); active(ticket);
				let callback; try { callback = new URL(returned?.url); } catch { refuse('redirect', 'the native sign-in returned no callback'); }
				const expected = new URL(redirectUri);
				if (callback.origin !== expected.origin || callback.pathname !== expected.pathname || callback.username || callback.password || callback.hash) refuse('redirect', 'the native sign-in returned to another address');
				if (callback.searchParams.has('access_token') || callback.searchParams.has('id_token') || callback.searchParams.has('refresh_token')) refuse('redirect', 'the native sign-in returned an unrequested credential');
				if (callback.searchParams.has('iss') && service === 'drive' && callback.searchParams.get('iss') !== 'https://accounts.google.com') refuse('redirect', 'the native sign-in returned from another issuer');
				const code = readRedirect(callback.search, state);
				await close(); active(ticket);
				clearTimeout(timer); cancelWait = null;
				return await capture(client => client.exchange({code, verifier}), ticket);
			} finally { clearTimeout(timer); cancelWait = null; await close(); }
		}),
		refresh: grant => once(ticket => { if (!HEX.test(grant?.receipt || '')) refuse('credential', 'the issued grant has no native custody receipt'); return capture(client => client.refresh({refreshToken: grant.refreshToken}), ticket, false, grant.receipt); }),
		async cancel() { epoch++; cancelWait?.(); const running = work; let failure; try { await close(); } catch (error) { failure = error; } if (running) await running.catch(() => {}); if (failure) throw windowsFailure(failure, service); },
		async revoke(grant) {
			if (work) throw windowsFailure(fail('busy', 'let the native sign-in drain before revoking it'), service);
			if (service === 'onedrive') return Object.freeze({...REVOCATION});
			return once(async ticket => {
				if (!HEX.test(grant?.receipt || '')) refuse('credential', 'the issued grant has no native custody receipt');
				const revocationFetch = createWindowsFetch({call, service, sourceReceipt: grant.receipt, purpose: 'revoke'});
				const client = CLIENTS[service]({fetch: revocationFetch, clientId, redirectUri, onToken: token => { void token; }});
				if (service === 'drive') await client.revoke({token: grant?.refreshToken || grant?.accessToken});
				else await capture(async capturedClient => { await capturedClient.revoke(grant); return null; }, ticket, true, grant.receipt);
				active(ticket); return {revoked: true};
			});
		},
	});
}
