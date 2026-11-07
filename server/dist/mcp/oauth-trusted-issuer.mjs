// SPDX-License-Identifier: AGPL-3.0-only
import {base64url} from '../agent/door-identity.mjs';
import {editorSecretUsable, editorSecretKeyMaterial} from './editor-keys.mjs';

const ANTHROPIC = 'https://identity.anthropic.com';
export const CLAUDE_ISSUER = /^https:\/\/identity\.anthropic\.com\/issuers\/[A-Za-z0-9_-]{1,128}$/;
export const ASSERTION_ACCESS_SECONDS = 60 * 60;
export const ASSERTION_SKEW_SECONDS = 60;
const DOCUMENT_BYTES = 64 * 1024, FETCH_MS = 4000, DAY_SECONDS = 86400, DEFAULT_SECONDS = 300;
const REFUSED_MS = 60_000, FORCED_REFETCH_MS = 30_000, CACHE_ENTRIES = 512;
const SCOPES = ['rapier:read', 'rapier:write'];
const encoder = new TextEncoder();
const ok = value => ({ok: true, value}), refused = reason => ({ok: false, error: {reason}});

function freshSeconds(headers) {
  const control = (headers.get('Cache-Control') || '').toLowerCase();
  if (/(?:^|,)\s*(?:no-store|no-cache)\b/.test(control)) return 0;
  const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d{1,10})"?/.exec(control);
  const age = Number(/^\d{1,10}$/.test(headers.get('Age') || '') ? headers.get('Age') : 0);
  return Math.max(0, Math.min(DAY_SECONDS, maxAge ? Number(maxAge[1]) - age : DEFAULT_SECONDS));
}

async function fetchDocument(url) {
  const response = await fetch(url, {redirect: 'error', headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(FETCH_MS)});
  if (!response.ok || Number(response.headers.get('Content-Length')) > DOCUMENT_BYTES || !response.body) {
    await response.body?.cancel().catch(() => {});
    throw new Error('Issuer document unavailable');
  }
  const reader = response.body.getReader(), parts = [];
  let length = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > DOCUMENT_BYTES) { await reader.cancel().catch(() => {}); throw new Error('Issuer document too large'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const part of parts) { bytes.set(part, at); at += part.byteLength; }
  const value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Issuer document is not an object');
  return {value, seconds: freshSeconds(response.headers)};
}

function remember(cache, key, entry) {
  cache.delete(key);
  if (cache.size >= CACHE_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, entry);
}

export function claudeIssued({meter, discoveriesPerHour}) {
  const discoveries = new Map(), keySets = new Map();

  async function trustedIssuers({iss, env}) {
    if (typeof iss !== 'string' || !CLAUDE_ISSUER.test(iss)) return null;
    const cached = discoveries.get(iss), at = Date.now();
    if (cached && cached.until > at) return cached.jwksUri ? {issuer: iss, jwksUri: cached.jwksUri, algorithms: ['ES256', 'RS256']} : null;
    if (!await meter(env, 'issuer-discovery', discoveriesPerHour)) return null;
    let jwksUri = null, seconds = 0;
    try {
      const {value, seconds: fresh} = await fetchDocument(iss + '/.well-known/openid-configuration');
      const keys = typeof value.jwks_uri === 'string' ? new URL(value.jwks_uri) : null;
      if (value.issuer === iss && keys && keys.origin === ANTHROPIC && !keys.username && !keys.password) {
        jwksUri = keys.href; seconds = fresh;
      }
    } catch {}
    remember(discoveries, iss, {jwksUri, until: at + (jwksUri ? seconds * 1000 : REFUSED_MS)});
    return jwksUri ? {issuer: iss, jwksUri, algorithms: ['ES256', 'RS256']} : null;
  }

  const jwksProvider = {async fetch(issuer, {forceRefresh}) {
    const name = issuer.issuer + '\n' + issuer.jwksUri, cached = keySets.get(name), at = Date.now();
    if (cached && (forceRefresh ? cached.forcedUntil > at : cached.until > at)) return ok(cached.jwks);
    try {
      const {value, seconds} = await fetchDocument(issuer.jwksUri);
      if (!Array.isArray(value.keys)) return refused('jwks_fetch_failed');
      const jwks = {keys: value.keys.filter(key => key && typeof key === 'object' && !Array.isArray(key))};
      remember(keySets, name, {jwks, until: at + seconds * 1000, forcedUntil: forceRefresh ? at + FORCED_REFETCH_MS : 0});
      return ok(jwks);
    } catch { return refused('jwks_fetch_failed'); }
  }};

  const jtiStore = {async markUsed({issuer, jti, exp, env}) {
    try {
      if (typeof env?.OAUTH_KV?.claim !== 'function') return refused('replayed');
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(issuer + '\n' + jti)));
      const stored = await env.OAUTH_KV.claim('ema-jti:' + base64url(digest), '1', {expiration: exp + ASSERTION_SKEW_SECONDS + 1});
      return stored ? ok(undefined) : refused('replayed');
    } catch { return refused('replayed'); }
  }};

  async function mapClaims({claims, clientInfo, requestedScope, env}) {
    const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@\p{Cc}]+@[^\s@\p{Cc}]+$/u.test(email) || !editorSecretUsable(env.EDITOR_KEY_SECRET)) return null;
    const scope = requestedScope.length ? SCOPES.filter(name => requestedScope.includes(name)) : [...SCOPES];
    if (!scope.length) return null;
    const ownerId = 'owner_' + await tag(env, 'rapier-claude-owner-v1\0', claims.iss + '\0' + email);
    const connectionId = 'connection_' + await tag(env, 'rapier-claude-connection-v1\0', claims.iss + '\0' + email + '\0' + clientInfo.clientId);
    if (!await registered(env, claims.iss) || !await recordPerson(env, ownerId, claims.iss, claims.sub)) return null;
    return {userId: ownerId, scope, props: {ownerId, connectionId}, metadata: {connectionId}, accessTokenTTL: ASSERTION_ACCESS_SECONDS};
  }

  return {trustedIssuers, mapClaims, jwksProvider, jtiStore};
}

async function tag(env, domain, value) {
  const key = await crypto.subtle.importKey('raw', editorSecretKeyMaterial(env.EDITOR_KEY_SECRET, domain), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

const PERSON_SECONDS = 90 * DAY_SECONDS;
async function recordPerson(env, ownerId, issuer, sub) {
  const key = 'ema-person:' + ownerId, now = Math.floor(Date.now() / 1000);
  const held = await env.OAUTH_KV.get(key, 'json');
  if (held?.issuer === issuer && held.sub === sub && held.until - now > PERSON_SECONDS - DAY_SECONDS) return true;
  await env.OAUTH_KV.put(key, JSON.stringify({issuer, sub, until: now + PERSON_SECONDS}), {expiration: now + PERSON_SECONDS});
  return true;
}

async function registered(env, issuer) {
  const key = 'ema-issuer:' + issuer, now = Math.floor(Date.now() / 1000);
  if (typeof env.OAUTH_KV?.claim !== 'function') return false;
  if (await env.OAUTH_KV.claim(key, JSON.stringify({issuer, firstSeen: now, lastSeen: now}))) return true;
  const record = await env.OAUTH_KV.get(key, 'json');
  if (record?.issuer !== issuer || !Number.isSafeInteger(record.firstSeen)) return false;
  if (!(now - record.lastSeen < DAY_SECONDS)) await env.OAUTH_KV.put(key, JSON.stringify({issuer, firstSeen: record.firstSeen, lastSeen: now}));
  return true;
}
