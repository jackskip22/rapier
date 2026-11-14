// SPDX-License-Identifier: AGPL-3.0-only
import {createHTTP, jsonBody, fail, refuse} from './provider-http.mjs';
import {createVerifier, challengeFor} from './provider-oauth.mjs';

const SUFFIX = '/cdn-cgi/access/oauth/';
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 16384 && !/[\x00-\x20\x7f]/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export const WORKSPACE_SIGNIN_QUALIFICATION = Object.freeze({browser: false});
export function workspaceOrigin(value) {
	let url;
	try { if (typeof value !== 'string' || value !== value.trim()) throw 0; url = new URL(value); } catch { refuse('workspace-address', 'Enter the HTTPS origin of your workspace.'); }
	if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash)
		refuse('workspace-address', 'Enter the HTTPS origin of your workspace.');
	return url.origin;
}
function accessOrigin(value) {
	const origin = workspaceOrigin(value);
	if (!/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(new URL(origin).hostname)) refuse('issuer', 'The workspace did not name a Cloudflare Access issuer.');
	return origin;
}
export function workspaceSignInAvailability({environment = {}, qualification = WORKSPACE_SIGNIN_QUALIFICATION} = {}) {
	const denied = reason => Object.freeze({ready: false, reason, authority: 'cloudflare-access-managed-oauth'});
	if (environment.native) return denied('native-companion');
	if (environment.framed) return denied('framed');
	let here;
	try { here = new URL(environment.url); } catch { return denied('page-origin'); }
	const loopback = here.protocol === 'http:' && here.hostname === '127.0.0.1' && !!here.port &&
		qualification.loopbackOrigin === here.origin;
	if (here.username || here.password || !(here.origin === 'https://rapier.website' || loopback)) return denied('page-origin');
	if (qualification.browser !== true) return denied('workspace_public_signin_unqualified');
	return Object.freeze({ready: true, reason: null, authority: 'cloudflare-access-managed-oauth', origin: here.origin});
}
export function workspaceRedirect(value, pageOrigin) {
	let url;
	try { url = new URL(value); } catch { refuse('redirect', 'The registered sign-in return is missing.'); }
	if (url.origin !== pageOrigin || url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol))
		refuse('redirect', 'The sign-in return does not belong to this page.');
	return url.href;
}
function endpoint(value, origin, action) {
	if (value !== origin + SUFFIX + action) refuse('issuer', 'The workspace changed an authorization endpoint.');
	return value;
}
export function workspaceMetadata(resource, authorization, selected) {
	const origin = workspaceOrigin(selected);
	if (!object(resource) || resource.protected !== true || workspaceOrigin(resource.resource) !== origin ||
		!Array.isArray(resource.authorization_servers) || resource.authorization_servers.length !== 1)
		refuse('discovery', 'The workspace did not provide its protected-resource identity.');
	const issuerOrigin = accessOrigin(resource.authorization_servers[0]), hostname = new URL(issuerOrigin).hostname;
	if (resource.team_domain !== undefined && resource.team_domain !== hostname) refuse('issuer', 'The workspace changed its Access team.');
	if (!object(authorization) || ![issuerOrigin, issuerOrigin + '/', hostname].includes(authorization.issuer))
		refuse('issuer', 'The authorization metadata names another issuer.');
	const includes = (key, item) => Array.isArray(authorization[key]) && authorization[key].includes(item);
	if (!includes('token_endpoint_auth_methods_supported', 'none') || !includes('response_types_supported', 'code') ||
		!includes('grant_types_supported', 'authorization_code') || !includes('code_challenge_methods_supported', 'S256'))
		refuse('permission', 'This workspace has no public PKCE sign-in.');
	if (authorization.authorization_response_iss_parameter_supported === false)
		refuse('issuer', 'This workspace cannot bind the sign-in return to its issuer.');
	return Object.freeze({resource: origin, issuerOrigin, issuer: authorization.issuer,
		authorizationEndpoint: endpoint(authorization.authorization_endpoint, issuerOrigin, 'authorization'),
		tokenEndpoint: endpoint(authorization.token_endpoint, issuerOrigin, 'token'),
		revokeEndpoint: endpoint(authorization.revocation_endpoint, issuerOrigin, 'revoke'),
		registrationEndpoint: endpoint(authorization.registration_endpoint, issuerOrigin, 'registration'),
		refresh: includes('grant_types_supported', 'refresh_token')});
}
export function validateWorkspaceContext(context) {
	if (!object(context)) refuse('custody', 'The saved workspace sign-in could not be read.');
	const resource = workspaceOrigin(context.resource), issuerOrigin = accessOrigin(context.issuerOrigin);
	if (![issuerOrigin, issuerOrigin + '/', new URL(issuerOrigin).hostname].includes(context.issuer) ||
		typeof context.refresh !== 'boolean') refuse('custody', 'The saved workspace issuer could not be read.');
	for (const [key, action] of [['authorizationEndpoint', 'authorization'], ['tokenEndpoint', 'token'], ['revokeEndpoint', 'revoke'], ['registrationEndpoint', 'registration']])
		endpoint(context[key], issuerOrigin, action);
	if (context.clientId !== undefined && (!text(context.clientId) || context.clientId.length > 512)) refuse('custody', 'The saved workspace client could not be read.');
	return Object.freeze({...context, resource, issuerOrigin});
}
export async function workspaceProof(context, {redirectUri, random, digest, now = Date.now} = {}) {
	const verified = validateWorkspaceContext(context);
	if (!verified.clientId) refuse('config', 'Register the public workspace client first.');
	let verifier, challenge;
	for (let attempt = 0; attempt < 16; attempt++) {
		verifier = createVerifier(random); challenge = await challengeFor(verifier, digest);
		if (/^[A-Za-z0-9]/.test(challenge)) break;
		if (attempt === 15) refuse('pkce', 'A supported workspace sign-in proof could not be created.');
	}
	const state = createVerifier(random);
	const url = new URL(verified.authorizationEndpoint);
	for (const [key, value] of Object.entries({client_id: verified.clientId, redirect_uri: redirectUri, response_type: 'code',
		state, code_challenge: challenge, code_challenge_method: 'S256', resource: verified.resource})) url.searchParams.set(key, value);
	return Object.freeze({url: url.href, pending: Object.freeze({verifier, state, redirectUri, at: now(), context: verified})});
}
export function workspaceCallback(value, pending, now = Date.now()) {
	let url;
	try { url = new URL(value); } catch { refuse('redirect', 'The full sign-in return address is required.'); }
	if (!pending || !Number.isSafeInteger(pending.at) || pending.at > now || now - pending.at > 600000 ||
		!text(pending.state) || !/^[A-Za-z0-9._~-]{43,128}$/.test(pending.verifier || '')) refuse('state', 'This sign-in expired or was already used.');
	const context = validateWorkspaceContext(pending.context);
	if (url.origin + url.pathname !== pending.redirectUri || url.username || url.password || url.hash)
		refuse('redirect', 'This is not the registered sign-in return.');
	const params = url.searchParams;
	if ([...new Set(params.keys())].some(key => params.getAll(key).length !== 1)) refuse('state', 'The sign-in return repeated a field.');
	if (params.get('state') !== pending.state) refuse('state', 'This return belongs to another sign-in.');
	if (params.get('iss') !== context.issuer) refuse('issuer', 'This return belongs to another workspace issuer.');
	if (params.has('access_token') || params.has('refresh_token') || params.has('id_token') || params.has('error') && params.has('code'))
		refuse('redirect', 'The sign-in return contained an unexpected grant.');
	if (params.has('error')) refuse('denied', 'Workspace sign-in was not approved.');
	const code = params.get('code');
	if (!text(code)) refuse('auth', 'The sign-in return contained no usable code.');
	return code;
}
export function readWorkspaceGrant(body, context, {now = Date.now(), previous = null, capture = () => {}} = {}) {
	const held = {accessToken: text(body?.access_token) ? body.access_token : null,
		refreshToken: text(body?.refresh_token) ? body.refresh_token : null,
		expiresAt: Number.isSafeInteger(body?.expires_in) && body.expires_in > 0 && body.expires_in <= 86400 ? now + body.expires_in * 1000 : null};
	capture(held);
	if (!object(body) || !held.accessToken || String(body.token_type).toLowerCase() !== 'bearer' || !held.expiresAt ||
		body.refresh_token !== undefined && !held.refreshToken || body.scope !== undefined && body.scope !== '')
		refuse('auth', 'The workspace returned an unsupported resource grant.');
	if (workspaceOrigin(body.resource) !== context.resource) refuse('permission', 'The grant belongs to another workspace.');
	if (!context.refresh && held.refreshToken) refuse('permission', 'The workspace returned an unrequested refresh grant.');
	return Object.freeze({...held, refreshToken: held.refreshToken || previous?.refreshToken || null, resource: context.resource});
}
export function createWorkspaceOAuth({fetch, now = Date.now, timeoutMs = 30000} = {}) {
	const http = createHTTP({fetch, timeoutMs});
	const json = async (url, options = {}) => {
		const response = await http.request(url, {origin: new URL(url).origin, exactTarget: true, maxBytes: 65536, ...options});
		if (response.status !== 200 && response.status !== 201)
			throw fail(response.status === 401 || response.status === 403 ? 'auth' : 'provider', 'Cloudflare Access refused the request.', {status: response.status, unconfirmed: response.status >= 500});
		return jsonBody(response);
	};
	const post = async (context, action, fields) => json(context[action], {method: 'POST',
		headers: {'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json'}, body: new URLSearchParams(fields).toString()});
	return Object.freeze({
		pause: http.pause,
		async discover(selected) {
			const origin = workspaceOrigin(selected), resource = await json(origin + '/.well-known/cloudflare-access-protected-resource/');
			if (!object(resource) || !Array.isArray(resource.authorization_servers) || resource.authorization_servers.length !== 1 ||
				resource.protected !== true || workspaceOrigin(resource.resource) !== origin) refuse('discovery', 'The workspace did not provide protected-resource metadata.');
			const issuer = accessOrigin(resource.authorization_servers[0]);
			return workspaceMetadata(resource, await json(issuer + '/.well-known/oauth-authorization-server'), origin);
		},
		async register(context, redirectUri) {
			context = validateWorkspaceContext(context);
			const grants = ['authorization_code', ...(context.refresh ? ['refresh_token'] : [])];
			const body = await json(context.registrationEndpoint, {method: 'POST', headers: {'Content-Type': 'application/json', Accept: 'application/json'},
				body: JSON.stringify({redirect_uris: [redirectUri], token_endpoint_auth_method: 'none', grant_types: grants, response_types: ['code'], resource: context.resource})});
			if (!object(body) || !text(body.client_id) || body.client_id.length > 512 || body.client_secret !== undefined || body.registration_access_token !== undefined ||
				body.token_endpoint_auth_method !== 'none' || !Array.isArray(body.response_types) || body.response_types.length !== 1 || body.response_types[0] !== 'code' || !Array.isArray(body.redirect_uris) || body.redirect_uris.length !== 1 || body.redirect_uris[0] !== redirectUri ||
				!Array.isArray(body.grant_types) || body.grant_types.length !== grants.length || grants.some(value => !body.grant_types.includes(value)) ||
				body.resource !== undefined && workspaceOrigin(body.resource) !== context.resource)
				refuse('permission', 'Cloudflare Access did not register the requested public client.');
			return Object.freeze({...context, clientId: body.client_id});
		},
		async exchange(context, {code, verifier, redirectUri, capture}) {
			context = validateWorkspaceContext(context);
			const body = await post(context, 'tokenEndpoint', {grant_type: 'authorization_code', client_id: context.clientId,
				code, code_verifier: verifier, redirect_uri: redirectUri, resource: context.resource});
			return readWorkspaceGrant(body, context, {now: now(), capture});
		},
		async refresh(context, previous, capture) {
			context = validateWorkspaceContext(context);
			if (!context.refresh || !text(previous?.refreshToken)) refuse('auth', 'Sign in to the workspace again.');
			return readWorkspaceGrant(await post(context, 'tokenEndpoint', {grant_type: 'refresh_token',
				client_id: context.clientId, refresh_token: previous.refreshToken, resource: context.resource}), context, {now: now(), previous, capture});
		},
		async revoke(context, row) {
			context = validateWorkspaceContext(context);
			if (!text(row?.token) || !['access_token', 'refresh_token'].includes(row.hint)) refuse('custody', 'The removal credential could not be read.');
			const response = await http.request(context.revokeEndpoint, {origin: context.issuerOrigin, exactTarget: true, method: 'POST', maxBytes: 65536,
				headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id: context.clientId, token: row.token, token_type_hint: row.hint}).toString()});
			if (response.status !== 200 && response.status !== 204) throw fail('revoke', 'Cloudflare Access has not confirmed removal.', {status: response.status});
		},
	});
}
