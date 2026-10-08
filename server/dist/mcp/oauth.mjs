// SPDX-License-Identifier: AGPL-3.0-only
// The provider owns OAuth. This module owns the anonymous browser identity and explicit consent.
import {base64url, fromBase64url} from '../agent/door-identity.mjs';
import {editorSecretUsable, editorSecretKeyMaterial} from './editor-keys.mjs';
import {DOOR_LIMITS} from './limits.mjs';

export const OAUTH_SCOPES = Object.freeze(['rapier:read', 'rapier:write', 'offline_access']);
export const OAUTH_ACCESS_SECONDS = 15 * 60;
export const OAUTH_OWNER_SECONDS = 90 * 24 * 60 * 60;
const OWNER_COOKIE = '__Host-rapier-owner';
const OWNER_PATTERN = /^owner_[A-Za-z0-9_-]{43}$/;
const CONNECTION_PATTERN = /^connection_[A-Za-z0-9_-]{43}$/;
const servers = new Map();
const encoder = new TextEncoder();
const REFRESH_DIGEST = Symbol('rapier-refresh-digest');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

// /mcp and /muse are two protected resources of one authorization server. A client that names no resource is a
// /muse client: the hosts that call /mcp without a connection never start this flow.
export const oauthResource = (env, path) => oauthOrigin(env) + (path === '/mcp' ? '/mcp' : '/muse');
const metadataPath = path => '/.well-known/oauth-protected-resource' + (path === '/mcp' ? '/mcp' : '/muse');

export function oauthOrigin(env = {}) {
  const origin = env.OAUTH_ORIGIN || 'https://mcp.rapier.website';
  const url = new URL(origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.origin !== origin || url.username || url.password || url.hostname.includes('*') ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('OAUTH_ORIGIN must be one canonical HTTPS origin, or a local HTTP origin.');
  }
  return origin;
}

async function authorizationServer(env) {
  const OAuthAuthorizationServer = env.OAUTH_AUTHORIZATION_SERVER, OAuthError = env.OAUTH_ERROR;
  if (typeof OAuthAuthorizationServer !== 'function' || typeof OAuthError !== 'function') throw new Error('OAuth provider is unavailable.');
  const issuer = oauthOrigin(env);
  // The hosted deployment supplies the real provider; the shared local-server import tree stays self-contained.
  if (!servers.has(issuer)) servers.set(issuer, new OAuthAuthorizationServer({issuer, resources: [issuer + '/mcp', issuer + '/muse'], defaultResource: issuer + '/muse',
      authorizeEndpoint: '/authorize', tokenEndpoint: '/oauth/token',
      clientRegistrationEndpoint: '/oauth/register', scopesSupported: [...OAUTH_SCOPES],
      accessTokenTTL: OAUTH_ACCESS_SECONDS, refreshTokenTTL: OAUTH_OWNER_SECONDS,
      refreshTokenIdleTTL: OAUTH_OWNER_SECONDS, clientRegistrationTTL: OAUTH_OWNER_SECONDS,
      clientIdMetadataDocumentEnabled: true,
      tokenExchangeCallback({grantType, scope, props, env: requestEnv}) {
        if (grantType === 'refresh_token') {
          const digest = requestEnv[REFRESH_DIGEST], {usedRefreshDigest, ...accessTokenProps} = props;
          // The provider retains the previous refresh token for retries. A spent token must instead
          // revoke this public client's grant. Keep the consumed digest in its encrypted grant props,
          // never the access token. The provider owns storage and revokes on invalid_grant.
          if (!digest || digest === usedRefreshDigest) throw new OAuthError('invalid_grant', {description: 'The refresh token was already used.'});
          return {newProps: {...accessTokenProps, usedRefreshDigest: digest}, accessTokenProps};
        }
        return scope.includes('offline_access') ? undefined : {refreshTokenTTL: 0};
      },
      // Provider errors become protocol responses; credentials and request bodies are never logged.
      onError() {},
    }));
  return servers.get(issuer);
}

export function validGrantReference(value) {
  return value !== null && typeof value === 'object' && OWNER_PATTERN.test(value.ownerId || '') &&
    CONNECTION_PATTERN.test(value.connectionId || '') && /^[A-Za-z0-9_-]{1,128}$/.test(value.grantId || '') &&
    typeof value.clientId === 'string' && value.clientId.length > 0 && typeof value.audience === 'string' &&
    Array.isArray(value.scopes) && value.scopes.every(scope => OAUTH_SCOPES.includes(scope));
}

// Suspended work retains this verified reference, never the bearer. The provider remains
// the permission owner; a missing grant or an unavailable lookup cannot authorize publication.
export async function oauthGrantCurrent(reference, env) {
  if (!validGrantReference(reference)) return false;
  const origin = oauthOrigin(env);
  if (![origin + '/mcp', origin + '/muse'].includes(reference.audience)) return false;
  const api = (await authorizationServer(env)).getOAuthApi(env);
  let cursor;
  do {
    const page = await api.listUserGrants(reference.ownerId, cursor ? {cursor} : {});
    const grant = page.items.find(row => row.id === reference.grantId);
    if (grant) return grant.userId === reference.ownerId && grant.clientId === reference.clientId &&
      grant.metadata?.connectionId === reference.connectionId &&
      (grant.expiresAt === undefined || Number.isSafeInteger(grant.expiresAt) && grant.expiresAt > Math.floor(Date.now() / 1000)) &&
      [grant.resource].flat().includes(reference.audience) &&
      Array.isArray(grant.scope) && reference.scopes.every(scope => grant.scope.includes(scope));
    if (page.cursor && page.cursor === cursor) return false;
    cursor = page.cursor;
  } while (cursor);
  return false;
}

function headers(extra) {
  const result = new Headers(extra);
  result.set('Cache-Control', 'no-store');
  result.set('Referrer-Policy', 'no-referrer');
  result.set('X-Content-Type-Options', 'nosniff');
  return result;
}
function json(status, value, extra) {
  const out = headers(extra);
  out.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), {status, headers: out});
}
// The house dialog, phone first, the theme following the browser: the title, the words, full-width buttons and the
// negative one red at the bottom. The faces come from the door's own stylesheet; nothing else loads.
export const HOUSE_STYLE = ':root{color-scheme:light dark;--bg:#fff;--surface:#f7f6f3;--surface-2:#f1f0ee;--hover:#e6e4e0;--text:#121212;--muted:#606060;--negative:color-mix(in srgb,#c00 80%,#000)}'
  + '@media (prefers-color-scheme:dark){:root{--bg:#000;--surface:#0d0d0d;--surface-2:#121212;--hover:#1a1a1a;--text:#fafafa;--muted:#878787;--negative:color-mix(in srgb,#ec5156 80%,#000)}}'
  + '*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text)}'
  + 'body{display:flex;align-items:center;justify-content:center;min-height:100dvh;padding:20px;font:400 1rem/1.5 Geist,system-ui,sans-serif}'
  + 'main{display:flex;flex-direction:column;width:100%;max-width:420px;min-height:min(72dvh,32rem);padding:20px;background:var(--surface)}'
  + 'h1{margin:0 0 12px;font:400 3.5rem/1 Geist,system-ui,sans-serif;letter-spacing:-.03em;overflow-wrap:anywhere}'
  + 'p{margin:0 0 16px;overflow-wrap:anywhere}.where{color:var(--muted);font:400 .75rem/1.5 "Geist Mono",monospace}a{color:inherit}'
  + 'ul{margin:0 0 16px;padding:0;list-style:none}li{margin:0 0 12px}li p{margin:0 0 8px;font:400 .75rem/1.5 "Geist Mono",monospace}'
  + 'pre{margin:0 0 16px;padding:12px;max-height:18rem;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--surface-2);font:400 .75rem/1.5 "Geist Mono",monospace}'
  + 'form{display:flex;flex-direction:column;gap:8px;margin:0}main>form{flex:1 1 auto;padding-top:24px}'
  + 'button{display:flex;align-items:center;justify-content:flex-start;width:100%;height:48px;padding:0 16px;border:0;border-radius:0;background:var(--surface-2);color:var(--text);font:500 .875rem "Geist Mono",monospace;letter-spacing:.055em;text-transform:uppercase;cursor:pointer;touch-action:manipulation}'
  + 'button:enabled:hover,button:focus-visible{outline:none;background:var(--hover)}button:disabled{cursor:default;opacity:.5}'
  + 'button.negative{background:var(--negative);color:#fff}button.negative:enabled:hover,button.negative:focus-visible{background:color-mix(in srgb,var(--negative) 88%,#000)}'
  + 'main>form>button.negative{margin-top:auto}';
function html(status, title, body, extra, formAction = "'self'") {
  const out = headers(extra);
  const nonce = crypto.randomUUID();
  out.set('Content-Type', 'text/html; charset=utf-8');
  // no-referrer makes a browser's navigation POST carry Origin:null. Keep its origin,
  // without referring the authorization URL or its query to either endpoint.
  out.set('Referrer-Policy', 'strict-origin');
  out.set('Content-Security-Policy', `default-src 'none'; style-src 'self' 'nonce-${nonce}'; font-src data:; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`);
  out.set('X-Frame-Options', 'DENY');
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title><link rel="stylesheet" href="/fonts.css"><style nonce="${nonce}">${HOUSE_STYLE}</style><main><h1>${escapeHTML(title)}</h1>${body}</main></html>`, {status, headers: out});
}
const requiredScopes = scopes => [...new Set(scopes || [])].filter(scope => OAUTH_SCOPES.includes(scope));
// A client that names no scope asks for what the door's tools use.
const askedScopes = scope => scope.length ? scope : ['rapier:read', 'rapier:write'];
export function oauthChallenge(request, env, scopes = ['rapier:read']) {
  const metadata = oauthOrigin(env) + metadataPath(new URL(request.url).pathname);
  const scope = requiredScopes(scopes).join(' ');
  return json(401, {error: 'authentication_required', message: 'Connect Rapier to use this private workspace.'}, {
    'WWW-Authenticate': `Bearer resource_metadata="${metadata}"${scope ? `, scope="${scope}"` : ''}`,
  });
}
export function oauthForbidden(request, env, scopes = ['rapier:write']) {
  const scope = requiredScopes(scopes).join(' ');
  return json(403, {error: 'insufficient_scope', message: 'This connection has not been granted the required permission.'}, {
    'WWW-Authenticate': `Bearer error="insufficient_scope", resource_metadata="${oauthOrigin(env)}${metadataPath(new URL(request.url).pathname)}"${scope ? `, scope="${scope}"` : ''}`,
  });
}

async function ownerKey(env, usages) {
  return crypto.subtle.importKey('raw', editorSecretKeyMaterial(env.EDITOR_KEY_SECRET, 'rapier-anonymous-owner-v1\0'),
    {name: 'HMAC', hash: 'SHA-256'}, false, usages);
}
async function browserOwner(request, env) {
  if (!editorSecretUsable(env.EDITOR_KEY_SECRET)) return null;
  const matches = (request.headers.get('Cookie') || '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(OWNER_COOKIE + '='));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(OWNER_COOKIE.length + 1);
  const [version, ownerId, issued, signature, surplus] = value.split('.');
  if (surplus !== undefined || version !== 'ro1' || !OWNER_PATTERN.test(ownerId) ||
      !/^\d{10,16}$/.test(issued) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const age = Date.now() - Number(issued);
  if (age < -60_000 || age > OAUTH_OWNER_SECONDS * 1000) return null;
  const bytes = fromBase64url(signature);
  if (base64url(bytes) !== signature) return null;
  const verified = await crypto.subtle.verify('HMAC', await ownerKey(env, ['verify']), bytes,
    encoder.encode(`${version}.${ownerId}.${issued}`));
  return verified ? ownerId : null;
}
async function ownerCookie(ownerId, env) {
  const body = `ro1.${ownerId}.${Date.now()}`;
  const tag = base64url(new Uint8Array(await crypto.subtle.sign('HMAC', await ownerKey(env, ['sign']), encoder.encode(body))));
  return `${OWNER_COOKIE}=${body}.${tag}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${OAUTH_OWNER_SECONDS}`;
}
function browserAuthority(ownerId) {
  return Object.freeze({ownerId, connectionId: 'browser', scopes: Object.freeze(['rapier:read', 'rapier:write']), source: 'browser'});
}

// Public authorization traffic shares the deployment's hourly meter. Without the meter only development proceeds.
const PUBLIC_AUTHORIZATION_PER_HOUR = 5000;
async function metered(env, key, limit = PUBLIC_AUTHORIZATION_PER_HOUR) {
  if (!env.BUDGET?.get || !env.BUDGET?.idFromName) return env.ALLOW_UNMETERED_CREATE === 'true';
  try {
    const response = await env.BUDGET.get(env.BUDGET.idFromName('oauth:' + key)).fetch(new Request('https://rapier.internal/take', {method: 'POST',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({limit, windowMs: DOOR_LIMITS.hourMs})}));
    return response.ok && (await response.json()).allowed === true;
  } catch { return false; }
}
async function registrationAllowed(request, env) {
  // Cloudflare supplies this address. Missing edge metadata shares one conservative allowance.
  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode('rapier-registration-address-v1\0' + address))));
  return await metered(env, 'registration-address:' + key, DOOR_LIMITS.registrationsPerHour) && await metered(env, 'registrations');
}

async function boundedRequest(request, limit = 64 * 1024) {
  if (!request.body) return request;
  if (Number(request.headers.get('Content-Length')) > limit) return null;
  const reader = request.body.getReader(), parts = [];
  let length = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); return null; }
    parts.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
  return new Request(request, {body});
}
function sameOriginForm(request, env) {
  return request.headers.get('Origin') === oauthOrigin(env) &&
    request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() === 'application/x-www-form-urlencoded';
}
function formHandle(form) {
  const handles = form.getAll('handle');
  return handles.length === 1 && typeof handles[0] === 'string' && handles[0].length < 256 ? handles[0] : '';
}
function repeatedParameter(parameters) {
  const seen = new Set();
  for (const name of parameters.keys()) {
    // RFC 8707 permits repeated resource indicators; the provider admits their meaning.
    if (name === 'resource') continue;
    if (seen.has(name)) return true;
    seen.add(name);
  }
  return false;
}
function validChallenge(challenge) {
  return typeof challenge === 'string' && /^[A-Za-z0-9_-]{43}$/.test(challenge) &&
    base64url(fromBase64url(challenge)) === challenge;
}
async function publicRegistration(request) {
  let metadata;
  try { metadata = await request.clone().json(); } catch { return request; }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return request;
  const method = Object.hasOwn(metadata, 'token_endpoint_auth_method') ? metadata.token_endpoint_auth_method : 'none';
  if (method !== 'none' || Object.hasOwn(metadata, 'client_secret') ||
      Array.isArray(metadata.token_endpoint_auth_methods_supported) && metadata.token_endpoint_auth_methods_supported.some(method => typeof method === 'string' && method.startsWith('client_secret')))
    return json(400, {error: 'invalid_client_metadata', error_description: 'Rapier uses public clients with no client secret.'});
  const out = new Headers(request.headers); out.delete('Content-Length');
  return new Request(request, {headers: out, body: JSON.stringify({...metadata, token_endpoint_auth_method: 'none'})});
}

async function consent(request, env, api) {
  if (!editorSecretUsable(env.EDITOR_KEY_SECRET)) return json(503, {error: 'authentication_unavailable'});
  if (request.method === 'GET') {
    if (!await metered(env, 'consents')) return json(429, {error: 'temporarily_unavailable'}, {'Retry-After': '600'});
    if (repeatedParameter(new URL(request.url).searchParams)) return json(400, {error: 'invalid_request', message: 'Authorization parameters must not be repeated.'});
    const parsed = await api.parseAuthRequest(request);
    if (!validChallenge(parsed.codeChallenge) || parsed.codeChallengeMethod !== 'S256') return json(400, {error: 'invalid_request', message: 'A valid S256 PKCE challenge is required.'});
    if (parsed.scope.some(scope => !OAUTH_SCOPES.includes(scope))) return json(400, {error: 'invalid_scope'});
    const redirect = new URL(parsed.redirectUri);
    if (redirect.hostname.includes('*')) return json(400, {error: 'invalid_request'});
    const description = await api.describeConsent(parsed);
    const transaction = await api.beginConsent(parsed);
    const write = askedScopes(parsed.scope).includes('rapier:write'), offline = parsed.scope.includes('offline_access');
    const callbackSource = ['https:', 'http:'].includes(redirect.protocol) ? redirect.origin : redirect.protocol;
    return html(200, 'Connect Rapier',
      `<p><strong><bdi>${escapeHTML(description.clientName)}</bdi></strong> asks to ${write ? 'read and edit' : 'read'} your Rapier documents${write ? '' : '. It cannot change them'}.</p>` +
      '<p>No account is needed. To open a document in a browser, open the link your assistant gives you; the page shows a four-letter code to tell your assistant.</p>' +
      (offline ? '<p>The connection stays between chats until you revoke it on the <a href="/oauth/disconnect" target="_blank" rel="noopener noreferrer">connections page</a>.</p>' : '') +
      `<p class="where">Returns to <bdi>${escapeHTML(description.redirectHost)}</bdi>${description.clientDomain ? '<br>Client domain <bdi>' + escapeHTML(description.clientDomain) + '</bdi>' : ''}` +
      (description.redirectIsLoopback ? '<br>An app on this computer: any local process could be listening at that address.' : '') + '</p>' +
      `<form method="post" action="/authorize"><input type="hidden" name="handle" value="${escapeHTML(transaction.handle)}">` +
      `<button type="submit" name="decision" value="allow">${write ? 'Allow' : 'Allow reading'}</button>` +
      (write ? '<button type="submit" name="decision" value="read">Allow reading only</button>' : '') +
      '<button type="submit" name="decision" value="deny" class="negative">Cancel</button></form>',
      transaction.headers, `'self' ${callbackSource}`);
  }
  if (request.method !== 'POST') return json(405, {error: 'method_not_allowed'}, {Allow: 'GET, POST'});
  if (!sameOriginForm(request, env)) return json(403, {error: 'invalid_consent_origin'});
  const limited = await boundedRequest(request);
  if (!limited) return json(413, {error: 'request_too_large'});
  const form = new URLSearchParams(await limited.text());
  if (form.getAll('decision').length !== 1) return json(400, {error: 'invalid_request'});
  if (form.get('decision') === 'deny') {
    const denied = await api.denyConsent(request, formHandle(form));
    return new Response(null, {status: 303, headers: headers(denied.headers)});
  }
  if (!['allow', 'read'].includes(form.get('decision'))) return json(400, {error: 'invalid_request'});
  const approved = await api.approveConsent(request, formHandle(form));
  // The person grants what the client asked for, or reading alone.
  const scope = ['rapier:read'];
  if (form.get('decision') === 'allow' && askedScopes(approved.request.scope).includes('rapier:write')) scope.push('rapier:write');
  if (approved.request.scope.includes('offline_access')) scope.push('offline_access');
  // The private browser cookie is a credential. Its owner identifier alone is public data.
  const ownerId = await browserOwner(request, env) || 'owner_' + random();
  const connectionId = 'connection_' + random();
  const completed = await api.completeAuthorization({request: approved.request, userId: ownerId,
    scope, metadata: {connectionId}, props: {ownerId, connectionId}});
  const out = headers(approved.headers);
  out.append('Set-Cookie', await ownerCookie(ownerId, env));
  out.set('Location', completed.redirectTo);
  return new Response(null, {status: 303, headers: out});
}

async function disconnect(request, env, api) {
  const ownerId = await browserOwner(request, env);
  if (!ownerId) return html(401, 'Rapier connections', '<p>Open this page in the browser where you approved your connection.</p>');
  if (request.method === 'POST') {
    if (!sameOriginForm(request, env)) return json(403, {error: 'invalid_consent_origin'});
    const limited = await boundedRequest(request);
    if (!limited) return json(413, {error: 'request_too_large'});
    const form = new URLSearchParams(await limited.text());
    const grantId = form.get('grant');
    if (form.getAll('grant').length !== 1 || !/^[A-Za-z0-9_-]{1,128}$/.test(grantId || '')) return json(400, {error: 'invalid_request'});
    // The provider scopes this grant lookup to the verified owner, never the form's claim.
    await api.revokeGrant(grantId, ownerId);
    return html(200, 'Connection revoked', '<p>The revocation was recorded. Access tokens expire within 15 minutes; distributed storage may take time to apply the revocation everywhere.</p><p><a href="/oauth/disconnect">View connections</a></p>');
  }
  if (request.method !== 'GET') return json(405, {error: 'method_not_allowed'}, {Allow: 'GET, POST'});
  const query = new URL(request.url).searchParams;
  const cursor = query.get('cursor') || undefined;
  if (cursor && cursor.length > 4096) return json(400, {error: 'invalid_request'});
  const grants = await api.listUserGrants(ownerId, {limit: 30, cursor});
  // A connection is named by the app the person approved; an expired registration keeps its client ID.
  const names = await Promise.all(grants.items.map(grant => api.lookupClient(grant.clientId).then(client => client?.clientName || grant.clientId, () => grant.clientId)));
  const rows = grants.items.map((grant, index) => `<li><p><bdi>${escapeHTML(names[index])}</bdi> — ${escapeHTML(grant.scope.join(', '))}</p><form method="post" action="/oauth/disconnect"><input type="hidden" name="grant" value="${escapeHTML(grant.id)}"><button type="submit" class="negative">Revoke connection</button></form></li>`).join('');
  return html(200, 'Rapier connections', `<p>Connections approved by this browser:</p>${rows ? `<ul>${rows}</ul>` : '<p>No active connections.</p>'}` +
    (grants.cursor ? `<p><a href="/oauth/disconnect?cursor=${encodeURIComponent(grants.cursor)}">More connections</a></p>` : ''));
}

/** Resolve authority from an independently verified credential. MCP never accepts a browser cookie. */
export async function handleOAuth(request, env, ctx, next) {
  const url = new URL(request.url);
  let origin;
  try { origin = oauthOrigin(env); } catch {
    // Health must remain readable so deployment validation can name the invalid binding.
    return url.pathname === '/health' ? next(request, null) : json(503, {error: 'authentication_configuration_invalid'});
  }
  const protocolRoute = url.pathname === '/authorize' || url.pathname.startsWith('/oauth/') ||
    url.pathname.startsWith('/.well-known/oauth-') || url.pathname === '/.well-known/openid-configuration';
  const bearer = request.headers.get('Authorization');
  const humanRoute = /^\/(?:export|return|d)(?:\/|$)/.test(url.pathname);
  if ((protocolRoute || bearer || humanRoute) && url.origin !== origin) return json(421, {error: 'wrong_origin'});
  let authority = null;
  try {
    const described = {'/.well-known/oauth-protected-resource/mcp': '/mcp', '/.well-known/oauth-protected-resource/muse': '/muse', '/.well-known/oauth-protected-resource': '/muse'}[url.pathname];
    if (described) {
      if (request.method !== 'GET') return json(405, {error: 'method_not_allowed'}, {Allow: 'GET'});
      return json(200, {resource: origin + described, authorization_servers: [origin],
        scopes_supported: ['rapier:read'], bearer_methods_supported: ['header'], resource_name: 'Rapier'});
    }
    if (protocolRoute) {
      if (!env.OAUTH_KV) return json(503, {error: 'authentication_unavailable'});
      const server = await authorizationServer(env), api = server.getOAuthApi(env);
      if (url.pathname === '/authorize') return await consent(request, env, api);
      if (url.pathname === '/oauth/disconnect') return await disconnect(request, env, api);
      // Registration shares the deployment meter and also preserves an allowance for each address.
      if (url.pathname === '/oauth/register' && request.method === 'POST' && !await registrationAllowed(request, env))
        return json(429, {error: 'temporarily_unavailable', error_description: 'Too many registrations this hour. Try again later.'}, {'Retry-After': '600'});
      let limited = await boundedRequest(request);
      if (!limited) return json(413, {error: 'request_too_large'});
      let providerEnv = env;
      if (url.pathname === '/oauth/register' && request.method === 'POST') {
        limited = await publicRegistration(limited);
        if (limited instanceof Response) return limited;
      }
      if (url.pathname === '/oauth/token' && request.method === 'POST' &&
          limited.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() === 'application/x-www-form-urlencoded') {
        const form = new URLSearchParams(await limited.clone().text());
        if (repeatedParameter(new URLSearchParams([...url.searchParams, ...form]))) return json(400, {error: 'invalid_request', error_description: 'Token parameters must not be repeated.'});
        if (request.headers.has('Authorization') || form.has('client_secret') || form.has('client_assertion') || form.has('client_assertion_type'))
          return json(400, {error: 'invalid_client', error_description: 'Rapier uses public clients with no client secret.'});
        if (form.get('grant_type') === 'authorization_code' && !/^[A-Za-z0-9._~-]{43,128}$/.test(form.get('code_verifier') || ''))
          return json(400, {error: 'invalid_request', error_description: 'A valid PKCE verifier is required.'});
        if (form.get('grant_type') === 'refresh_token') providerEnv = {...env,
          [REFRESH_DIGEST]: base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(form.get('refresh_token') || ''))))};
      }
      const response = await server.fetch(limited, providerEnv, ctx);
      if (url.pathname === '/.well-known/oauth-authorization-server' && request.method !== 'HEAD' && response.ok) {
        const metadata = await response.json();
        metadata.token_endpoint_auth_methods_supported = ['none'];
        delete metadata.token_endpoint_auth_signing_alg_values_supported;
        return json(response.status, metadata, response.headers);
      }
      return new Response(response.body, {status: response.status, statusText: response.statusText, headers: headers(response.headers)});
    }
    if (bearer !== null) {
      const match = /^Bearer ([^\s,]{1,4096})$/i.exec(bearer);
      if (!match) return oauthChallenge(request, env);
      // Each door accepts its own resource's tokens; the file and page routes serve both doors' connections.
      const server = await authorizationServer(env), resources = humanRoute ? [origin + '/mcp', origin + '/muse'] : [oauthResource(env, url.pathname)];
      let verified = null;
      for (const resource of resources) if (!verified) verified = await server.validateToken(resource, match[1], env);
      if (!verified || !resources.includes(verified.audience) || !Number.isSafeInteger(verified.expiresAt) ||
          verified.expiresAt <= Math.floor(Date.now() / 1000) || !OWNER_PATTERN.test(verified.userId) || verified.props?.ownerId !== verified.userId ||
          !CONNECTION_PATTERN.test(verified.props?.connectionId) || !Array.isArray(verified.scope) ||
          verified.scope.some(scope => !OAUTH_SCOPES.includes(scope))) return oauthChallenge(request, env);
      const token = await server.getOAuthApi(env).unwrapToken(match[1]);
      const grant = {ownerId: verified.userId, connectionId: verified.props.connectionId, grantId: token?.grantId,
        clientId: verified.clientId, audience: verified.audience, scopes: [...verified.scope]};
      if (!validGrantReference(grant) || token?.userId !== verified.userId || token.grant?.clientId !== verified.clientId ||
          token.grant?.props?.connectionId !== verified.props.connectionId) return oauthChallenge(request, env);
      authority = Object.freeze({ownerId: verified.userId, connectionId: verified.props.connectionId,
        scopes: Object.freeze([...verified.scope]), source: 'oauth', grant: Object.freeze(grant)});
    } else if (humanRoute) {
      const ownerId = await browserOwner(request, env);
      if (ownerId) authority = browserAuthority(ownerId);
    }
  } catch (error) {
    // Expected authorization errors may redirect only after the provider validates the callback.
    if (error?.name === 'AuthorizationError' && typeof error.redirectTo === 'string') {
      return new Response(null, {status: 303, headers: headers({Location: error.redirectTo})});
    }
    if (error?.name === 'AuthorizationError' || error?.name === 'OAuthError') return json(400, {error: 'invalid_request', message: 'The authorization request is invalid or has expired.'});
    return json(503, {error: 'authentication_unavailable'});
  }
  return next(request, authority);
}
