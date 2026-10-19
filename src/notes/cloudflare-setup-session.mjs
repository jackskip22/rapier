// SPDX-License-Identifier: AGPL-3.0-only
import {CLOUDFLARE_SETUP} from './sync-config.mjs';
import {createVerifier, challengeFor, authorizeUrl, readRedirect, ISSUER} from './cloudflare-oauth.mjs';
import {createWorkspaceSetup, SETUP_SCOPES} from '../workspace/setup.mjs';

export const SETUP_SESSION_LIMITS = Object.freeze({pendingMs: 600000, sessionMs: 600000, requestMs: 30000, callbackBytes: 16384, tokenBytes: 8192});
const PENDING_KEY = 'rapier:workspace-setup:pkce';
const CALLBACK = 'https://rapier.website/';
const pendingKeys = ['at', 'clientId', 'redirectUri', 'state', 'verifier'];
const sameScopes = value => Array.isArray(value) && value.length === SETUP_SCOPES.length && SETUP_SCOPES.every(s => value.includes(s));
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= SETUP_SESSION_LIMITS.tokenBytes && !/[\x00-\x20\x7f]/.test(value);
const problem = code => Object.assign(new Error('Workspace setup is held.'), {code});
function requireThat(ok, code) { if (!ok) throw problem(code); }
function responseSnapshot(response, accessToken, limit) {
  let remaining = limit;
  function text(value) {
    requireThat(value.length <= remaining && !value.includes(accessToken), 'response');
    remaining -= new TextEncoder().encode(value).byteLength + 2;
    requireThat(remaining >= 0, 'response'); return value;
  }
  function copy(value, depth = 0) {
    requireThat(depth <= 32 && --remaining >= 0, 'response');
    if (typeof value === 'string') return text(value);
    if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
    requireThat(value && typeof value === 'object', 'response');
    const array = Array.isArray(value), result = array ? [] : Object.create(null);
    requireThat((array ? [Array.prototype] : [Object.prototype, null]).includes(Object.getPrototypeOf(value)), 'response');
    let entries = 0;
    if (array) requireThat(value.length <= remaining, 'response');
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      if (array) requireThat(key === String(entries++), 'response');
      text(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      requireThat(descriptor && Object.hasOwn(descriptor, 'value'), 'response');
      result[key] = copy(descriptor.value, depth + 1);
    }
    if (array) requireThat(entries === value.length, 'response');
    return result;
  }
  const json = JSON.stringify(copy(response));
  requireThat(json.length <= limit && new TextEncoder().encode(json).byteLength <= limit &&
    !json.includes(JSON.stringify(accessToken).slice(1, -1)), 'response');
  return JSON.parse(json);
}

export function createCloudflareSetupSession({config = CLOUDFLARE_SETUP, environment = {}, pendingStorage,
  oauth, transport, workspace = {}, clearCallback, random, digest, now = Date.now, clock = {setTimeout, clearTimeout}} = {}) {
  config = {...config, scopes: [...(config.scopes || [])]};
  const enabled = config.enabled === true && config.browserRoundTripVerified === true && opaque(config.clientId) && !/^PENDING/i.test(config.clientId) &&
    config.redirectUri === CALLBACK && sameScopes(config.scopes);
  const controller = new AbortController();
  let phase = 'idle', ownedPending = null, setup = null, expiresAt = 0, exchanged = false, terminal = null;
  let grant = null, cleanup = null, cleanupState = 'not-needed', cleanupCount = 0;
  function current() { return !controller.signal.aborted && (!expiresAt || now() < expiresAt); }
  function clearPending() {
    if (ownedPending !== null && pendingStorage.getItem(PENDING_KEY) === ownedPending) {
      pendingStorage.removeItem(PENDING_KEY);
      requireThat(pendingStorage.getItem(PENDING_KEY) === null, 'pending-clear');
    }
    ownedPending = null;
  }
  function admit() {
    requireThat(enabled, 'disabled');
    const here = new URL(environment.url);
    requireThat(!environment.native && !environment.framed && here.origin + here.pathname === CALLBACK && !here.username && !here.password, 'environment');
    requireThat(['getItem', 'setItem', 'removeItem'].every(k => typeof pendingStorage?.[k] === 'function') &&
      typeof oauth?.exchange === 'function' && typeof oauth?.revoke === 'function' && typeof transport?.request === 'function' && typeof clearCallback === 'function', 'dependencies');
  }
  async function bounded(run, signal, milliseconds) {
    requireThat(!signal.aborted && milliseconds > 0, 'canceled');
    let timer, stop;
    const ended = new Promise((_, reject) => {
      stop = () => reject(problem('canceled'));
      signal.addEventListener('abort', stop, {once: true});
      timer = clock.setTimeout(() => reject(problem('timeout')), milliseconds);
    });
    try { return await Promise.race([Promise.resolve().then(() => { requireThat(!signal.aborted, 'canceled'); return run(); }), ended]); }
    finally { clock.clearTimeout(timer); signal.removeEventListener('abort', stop); }
  }
  async function revoke() {
    if (cleanup) return cleanup;
    if (!grant) { cleanupState = exchanged ? 'unknown' : 'not-needed'; return; }
    const held = grant; grant = null;
    cleanupState = 'unknown';
    cleanup = (async () => {
      const tokens = [['access_token', held.accessToken], ['refresh_token', held.refreshToken]].filter(([, value]) => value);
      let outcome = 'confirmed';
      for (const [hint, token] of tokens) {
        if (++cleanupCount > 2) { outcome = 'unknown'; break; }
        const fresh = new AbortController();
        let result = 'unknown';
        try {
          const reply = await bounded(() => oauth.revoke({token, hint, clientId: config.clientId, signal: fresh.signal,
            timeoutMs: SETUP_SESSION_LIMITS.requestMs}), fresh.signal, SETUP_SESSION_LIMITS.requestMs);
          if (oauth.qualified === true && ['confirmed', 'failed'].includes(reply?.status)) result = reply.status;
        } catch {} finally { fresh.abort(); }
        if (result === 'unknown' || outcome === 'unknown') outcome = 'unknown';
        else if (result === 'failed') outcome = 'failed';
      }
      cleanupState = outcome;
    })();
    return cleanup;
  }
  function capture(value) {
    if (grant || cleanup || !value || typeof value !== 'object') return;
    const accessToken = opaque(value.accessToken) ? value.accessToken : null;
    const refreshToken = opaque(value.refreshToken) ? value.refreshToken : null;
    if (!accessToken && !refreshToken) return;
    grant = {accessToken, refreshToken};
    if (terminal || controller.signal.aborted) void revoke();
  }
  const status = () => Object.freeze({phase, revocation: cleanupState, setupAuthorityReleased: controller.signal.aborted && grant === null});
  async function end(result) {
    terminal = result; phase = 'finished'; controller.abort(); setup?.cancel();
    try { clearPending(); } catch { terminal = {status: 'held', reason: 'pending-clear'}; }
    await revoke();
    return Object.freeze({...terminal, revocation: cleanupState, setupAuthorityReleased: controller.signal.aborted && grant === null});
  }
  async function begin() {
    if (!enabled) return {status: 'disabled'};
    if (phase !== 'idle') return {status: 'held', reason: 'used'};
    phase = 'starting';
    try {
      admit();
      const previous = pendingStorage.getItem(PENDING_KEY);
      const verifier = createVerifier(random), state = createVerifier(random);
      const challenge = await bounded(() => challengeFor(verifier, digest), controller.signal, SETUP_SESSION_LIMITS.requestMs);
      requireThat(current() && pendingStorage.getItem(PENDING_KEY) === previous, 'superseded');
      ownedPending = JSON.stringify({at: now(), clientId: config.clientId, redirectUri: CALLBACK, state, verifier});
      pendingStorage.setItem(PENDING_KEY, ownedPending);
      requireThat(pendingStorage.getItem(PENDING_KEY) === ownedPending, 'pending-write');
      phase = 'pending';
      return {status: 'authorize', url: authorizeUrl({...config, state, challenge})};
    } catch (error) { return end({status: controller.signal.aborted ? 'canceled' : 'held', reason: ['superseded', 'pending-write'].includes(error?.code) ? error.code : 'start'}); }
  }
  async function finish(callbackURL, plan, packageInput) {
    if (!enabled) return {status: 'disabled'};
    if (!['idle', 'pending'].includes(phase)) return {status: 'held', reason: 'used'};
    phase = 'returning';
    try {
      admit();
      requireThat(typeof callbackURL === 'string' && callbackURL.length <= SETUP_SESSION_LIMITS.callbackBytes, 'callback');
      const callback = new URL(callbackURL), params = callback.searchParams;
      requireThat(callbackURL.startsWith(CALLBACK + '?') && callback.origin + callback.pathname === CALLBACK && !callback.username && !callback.password, 'callback');
      let callbackCleared = false;
      try { callbackCleared = clearCallback(CALLBACK) === true; } catch {}
      requireThat(!callback.hash, 'callback');
      const raw = pendingStorage.getItem(PENDING_KEY);
      ownedPending = typeof raw === 'string' ? raw : null;
      requireThat(typeof raw === 'string' && raw.length <= 2048, 'pending');
      const pending = JSON.parse(raw);
      if (params.getAll('state').length !== 1 || params.get('state') !== pending?.state) { ownedPending = null; throw problem('state'); }
      requireThat(pending && Object.keys(pending).sort().join() === pendingKeys.join() &&
        pending.clientId === config.clientId && pending.redirectUri === CALLBACK &&
        /^[A-Za-z0-9_-]{43}$/.test(pending.state) && /^[A-Za-z0-9_-]{43}$/.test(pending.verifier) &&
        Number.isSafeInteger(pending.at) && pending.at >= 0 && pending.at <= now() && now() - pending.at < SETUP_SESSION_LIMITS.pendingMs, 'pending');
      requireThat(callbackCleared, 'callback-clear');
      requireThat([...params.keys()].every(k => ['code', 'state', 'error', 'error_description', 'iss'].includes(k)) &&
        params.getAll('iss').length <= 1 && (!params.has('iss') || params.get('iss') === ISSUER), 'callback');
      const code = readRedirect(callback.search, pending.state);
      requireThat(opaque(code) && params.getAll('code').length === 1 && !params.has('error'), 'callback');
      clearPending();
      requireThat(current(), 'canceled');
      exchanged = true; phase = 'exchanging';
      const exchangedAt = now();
      const token = await bounded(() => Promise.resolve(oauth.exchange({code, verifier: pending.verifier, clientId: config.clientId,
        redirectUri: CALLBACK, signal: controller.signal, timeoutMs: SETUP_SESSION_LIMITS.requestMs, onToken: capture})).then(value => { capture(value); return value; }),
        controller.signal, SETUP_SESSION_LIMITS.requestMs);
      requireThat(current() && grant && opaque(token?.accessToken) && token.accessToken === grant.accessToken && !token.refreshToken &&
        Number.isSafeInteger(token.expiresIn) && token.expiresIn > 0 && typeof token.scope === 'string' && sameScopes(token.scope.split(' ')), 'grant');
      expiresAt = Math.min(exchangedAt + token.expiresIn * 1000, exchangedAt + SETUP_SESSION_LIMITS.sessionMs);
      requireThat(current(), 'expired'); phase = 'setup';
      setup = createWorkspaceSetup({...workspace, isCurrent: context => current() && workspace.isCurrent?.(context) === true,
        transport: {request: async request => {
          requireThat(current() && grant?.accessToken, 'expired');
          const accessToken = grant.accessToken;
          const response = await bounded(() => transport.request({...request, accessToken, signal: controller.signal}),
            controller.signal, Math.min(request.timeoutMs, expiresAt - now()));
          requireThat(current(), 'expired');
          return responseSnapshot(response, accessToken, request.responseBytes);
        }}});
      const result = await bounded(() => setup.run(plan, packageInput), controller.signal, expiresAt - now());
      requireThat(current(), 'expired');
      return end(result);
    } catch (error) {
      return end({status: controller.signal.aborted ? 'canceled' : 'held', reason: ['state', 'pending', 'callback', 'grant', 'expired', 'timeout', 'pending-clear', 'callback-clear'].includes(error?.code) ? error.code : 'unconfirmed'});
    }
  }
  async function cancel() { return end({status: 'canceled'}); }
  return Object.freeze({begin, finish, cancel, status});
}
