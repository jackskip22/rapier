// SPDX-License-Identifier: AGPL-3.0-only
import {CLOUDFLARE_SYNC, OTHER_SYNC, syncAvailability} from './sync-config.mjs';
import {PROVIDERS, OTHER_PROVIDERS, providerAvailability, providerSoon, isOtherProvider, providerUsesSignIn,
 providerOAuth, beginProviderSignIn, readProviderRedirect, readProviderTokenReturn, providerReturnsToken,
 revokeProviderGrant} from './sync-providers.mjs';
import {availability as listedProviders} from './cloud-providers.mjs';
import {createVerifier, challengeFor, authorizeUrl, readRedirect, createOAuthClient} from './cloudflare-oauth.mjs';
import {SCOPES as DRIVE_SCOPES} from './drive-oauth.mjs';
import {SCOPES as DROPBOX_SCOPES} from './dropbox-oauth.mjs';
import {SCOPES as ONEDRIVE_SCOPES} from './onedrive-oauth.mjs';
import {createPlainSession} from './sync-plain-session.mjs';
import {plainStore, plainPlace} from './plain-stores.mjs';
import {readSyncState, readSyncStateBytes} from './sync-state.mjs';
import {sha256} from './integrity.mjs';
export {readSyncState, PROVIDERS, OTHER_PROVIDERS, providerAvailability, providerSoon, isOtherProvider, providerUsesSignIn};
import {createDeviceStorage, createRememberedDevice} from './sync-device.mjs';
import {openDrivePicker, pickerRegistered} from './drive-picker.mjs';
import {PLAIN_DETAIL} from './sync-plain.mjs';
export {createDeviceStorage, createRememberedDevice, openDrivePicker, pickerRegistered, PLAIN_DETAIL};
export const DRIVE_PICKER = OTHER_SYNC.drive;
export function providerGate(provider, environment = {}) {
 return providerAvailability(provider, {environment, registration: OTHER_SYNC[provider], listed: listedProviders});
}
const fail = (code, message) => Object.assign(new Error(message), {code});
const PENDING_MS = 10 * 60 * 1000;
const scopes = {drive: DRIVE_SCOPES, dropbox: DROPBOX_SCOPES, onedrive: ONEDRIVE_SCOPES};
const tokenString = value => typeof value === 'string' && value.length > 0 && !/[\x00-\x20\x7f]/.test(value);
const sameConnection = (a, b) => !!a && !!b && ['provider', 'place', 'device', 'connectionId', 'destination'].every(key => a[key] === b[key]);
const publicConnection = value => value ? Object.freeze({provider: value.provider, place: value.place, connectionId: value.connectionId, destination: value.destination}) : null;
export function verificationReturn(url, proof, search, config = CLOUDFLARE_SYNC, now = Date.now()) {
 try {
  const pending = JSON.parse(proof), callback = new URL(url), params = new URLSearchParams(search);
  return pending.verification === true && pending.clientId === config.clientId && pending.redirectUri === config.redirectUri &&
   callback.origin + callback.pathname === config.redirectUri && !callback.username && !callback.password &&
   pending.at <= now && now - pending.at <= PENDING_MS && params.getAll('state').length === 1 &&
   params.get('state') === pending.state && typeof pending.state === 'string' && pending.state.length >= 16;
 } catch { return false; }
}

export function createProviderSession({folder, fetch: fetchFn, pendingStorage, pendingKey = 'rapier:provider:pending',
 provider = null, mode = provider ? 'provider' : 'oauth', config = CLOUDFLARE_SYNC, registrations = OTHER_SYNC,
 listed = listedProviders, environment = {}, device = null, now = Date.now, onChange = () => {}} = {}) {
 if (!folder?.owner || typeof fetchFn !== 'function') throw fail('config', 'sync needs the notes folder and the network.');
 if (!['provider', 'oauth'].includes(mode) || mode === 'provider' && !providerUsesSignIn(provider)) throw fail('config', 'choose a storage service you sign in to.');
 const other = mode === 'provider', service = other ? provider : 'cloudflare';
 provider = other ? provider : null;
 config = Object.freeze({...config, scopes: Object.freeze([...(config.scopes || [])])});
 environment = Object.freeze({...environment});
 const registration = Object.freeze({...other ? registrations[provider] : config});
 const gate = Object.freeze(other ? providerAvailability(provider, {environment, registration, listed}) : syncAvailability(environment, config));
 const who = other ? PROVIDERS[provider].label : 'Cloudflare';
 let grant = null, grantValid = false, connection = null, bound = null, folderIdentity = null, epoch = 0, work = null;
 let stopping = null, locking = null, revoking = null, cancelling = null, forgetting = null;
 let locked = false, needsRevoke = false, rememberDevice = !!device && device.available !== false, deviceInspected = false;
 let explicitLock = false, unresolvedRevocation = false, coveredMarkerRevision = null;
 let stage = 'signed-out', notice = '';
 const credentials = new Map(), transports = new Set(), plains = new Set();
 const busy = () => !!(work || stopping || locking || revoking || cancelling || forgetting);
 const lapsed = () => !!grant && !grant.refreshToken && grant.expiresAt <= now() + 30000;
 const status = () => Object.freeze({stage, mode, provider, authorized: !!grant && grantValid && !locked && !needsRevoke && !lapsed(),
  locked, hasConnection: !!connection, connection: publicConnection(connection), rememberDevice,
  rememberAvailable: !!device && device.available !== false, busy: busy(), revocationPending: needsRevoke,
  notice, gate, backedUpAt: connection?.syncedAt || null, plainAvailable: other,
  ...(!other ? {plainUnavailable: 'Cloudflare sign-in has no conditional plain-files transport. Use an R2 bucket key.'} : {})});
 const announce = (next, text = '') => { stage = next; notice = text; onChange(status()); };
 const active = ticket => { if (ticket !== epoch || needsRevoke) throw fail('cancelled', 'sync stopped. your notes are kept.'); };
 const ready = () => { if (!gate.ready) throw fail('unavailable', gate.reason); };
 const custodyKey = row => JSON.stringify([row.provider, row.clientId, row.token]);
 function prune() { for (const [key, row] of credentials) if (row.hint === 'access_token' && Number.isFinite(row.expiresAt) && row.expiresAt <= now()) credentials.delete(key); }
 function capture(token, registrationFacts = registration, grantProvider = service, family = crypto.randomUUID()) {
  const expiresAt = token.expiresAt ?? (Number.isFinite(token.expiresIn) ? now() + token.expiresIn * 1000 : null);
  const held = {...token, provider: grantProvider, family, expiresAt};
  for (const [value, hint] of [[held.accessToken, 'access_token'], [held.refreshToken, 'refresh_token']]) if (tokenString(value)) {
   const row = {token: value, hint, provider: grantProvider, clientId: registrationFacts.clientId,
    redirectUri: registrationFacts.redirectUri, family, expiresAt: hint === 'access_token' ? expiresAt : null};
   credentials.set(custodyKey(row), row);
  }
  prune(); return held;
 }
 function checkScopes(value = grant) {
  if (!value || !tokenString(value.accessToken) || !Number.isFinite(value.expiresAt) || value.expiresAt <= 0 ||
   value.refreshToken != null && !tokenString(value.refreshToken)) throw fail('auth', 'the provider returned no usable sign-in expiry.');
  const normalize = value => value.replace('https://graph.microsoft.com/', '');
  const wanted = (other ? scopes[provider].split(' ') : config.scopes).map(normalize);
  const got = value.scope ? value.scope.split(/\s+/).map(normalize) : wanted;
  if (wanted.some(scope => scope !== 'offline_access' && !got.includes(scope)) || got.some(scope => !wanted.includes(scope)))
   throw fail('permission', who + ' did not grant the requested storage access. sign out and try again.');
 }
 async function readLocal() {
  const snapshot = await folder.read();
  folderIdentity = snapshot.index.folderDeviceId;
  connection = (await readSyncState(folder)).plain || null;
  if (connection?.provider === provider) bound ||= {...connection};
  return connection;
 }
 function binding() {
  return JSON.stringify({folder: folderIdentity, provider: service, connection: publicConnection(connection),
   registration: [registration.clientId, registration.redirectUri, other ? scopes[provider] : config.scopes], origin: new URL(environment.url).origin});
 }
 async function restoreDevice(ticket, custodyOnly = false) {
  if (!device || deviceInspected && !custodyOnly) return;
  const restored = await device.read(binding()), data = restored.data, custody = data || restored.retired;
  const rows = custody?.credentials || [];
  if (!Array.isArray(rows) || rows.some(row => !row || !tokenString(row.token) || !['access_token', 'refresh_token'].includes(row.hint) ||
   !['cloudflare', ...OTHER_PROVIDERS].includes(row.provider) || !tokenString(row.clientId) || typeof row.redirectUri !== 'string' ||
   typeof row.family !== 'string' || !row.family || row.expiresAt !== null && !Number.isFinite(row.expiresAt))) throw fail('device', 'this device could not read its saved sign-in.');
  for (const row of rows) credentials.set(custodyKey(row), {...row});
  deviceInspected = true; prune(); rememberDevice = restored.enabled;
  if (restored.revocationPending && (needsRevoke || restored.revision !== coveredMarkerRevision)) {
   needsRevoke = true; locked = true; grantValid = false;
   if (restored.revocationUnresolved || !restored.revocationRecoverable && restored.revision !== coveredMarkerRevision) unresolvedRevocation = true;
   stage = 'revocation-pending';
   notice = 'provider access still needs removal. retry removing access; a record without credentials needs action at the provider.';
  }
  if (custodyOnly) return;
  if (ticket !== epoch) throw fail('cancelled', 'sync stopped. your notes are kept.');
  if (needsRevoke) return;
  if (!data?.grant || locked) return;
  if (data.grant.provider !== service || typeof data.grant.family !== 'string') throw fail('device', 'this device remembered another storage service.');
  checkScopes(data.grant);
  grant = capture(data.grant, registration, service, data.grant.family); grantValid = true;
  if (connection) bound = {...connection};
  stage = connection ? 'ready' : 'signed-in';
 }
 async function keepDevice(ticket) {
  active(ticket);
  if (!device || !rememberDevice || locked) return;
  prune();
  try { await device.keep(binding(), {grant, credentials: [...credentials.values()].map(row => ({...row}))}); }
  catch { throw fail('device', 'this device could not remember the changed sign-in. try again or turn off remember this device.'); }
  active(ticket);
 }
 async function validateHeld(ticket) {
  try { checkScopes(); }
  catch (error) { active(ticket); await keepDevice(ticket); throw error; }
 }
 function run(fn, {network = false, allowRevocation = false} = {}) {
  if (network) ready();
  if (busy()) throw fail('busy', 'let the current sync finish, or lock sync to stop it.');
  if (needsRevoke && !allowRevocation) throw fail('revoke', 'retry removing provider access before syncing.');
  const ticket = epoch;
  work = Promise.resolve().then(async () => {
   const check = () => { if (ticket !== epoch || needsRevoke && !allowRevocation) throw fail(needsRevoke ? 'revoke' : 'cancelled', 'retry removing provider access before syncing.'); };
   check();
   if (!deviceInspected) { await readLocal(); check(); await restoreDevice(ticket); check(); }
   return fn(ticket);
  }).finally(() => { work = null; onChange(status()); });
  onChange(status()); return work;
 }
 const oauth = (record = {provider: service, ...registration}, onToken) => record.provider === 'cloudflare'
  ? createOAuthClient({fetch: fetchFn, clientId: record.clientId, redirectUri: record.redirectUri, onToken})
  : providerOAuth(record.provider, {fetch: fetchFn, clientId: record.clientId, redirectUri: record.redirectUri, onToken});
 async function authority(ticket) {
  active(ticket);
  if (!grant || locked) throw fail('auth', 'sign in with ' + who + ' first.');
  if (grant.expiresAt <= now() + 30000) {
   if (!grant.refreshToken) throw fail('auth', 'your ' + who + ' sign-in lapsed. sign in again.');
   const previous = grant, client = oauth(undefined, token => capture(token, registration, service, previous.family)); let refreshed;
   grantValid = false;
   try { refreshed = await client.refresh({refreshToken: previous.refreshToken}); }
   catch (error) { active(ticket); await keepDevice(ticket); throw error; }
   finally { client.pause(); }
   grantValid = false; grant = capture({...refreshed, refreshToken: refreshed.refreshToken || previous.refreshToken, scope: refreshed.scope || previous.scope}, registration, service, previous.family);
   if (refreshed.refreshToken && refreshed.refreshToken !== previous.refreshToken)
    for (const [key, row] of credentials) if (row.family === previous.family && row.token === previous.refreshToken) credentials.delete(key);
   active(ticket); await validateHeld(ticket); grantValid = true; await keepDevice(ticket);
  }
  checkScopes(); return Object.freeze({provider, tokenType: 'Bearer', accessToken: grant.accessToken});
 }
 function assertBound(value) {
  if (!value || value.provider !== provider || !value.connectionId || !value.destination || bound && !sameConnection(bound, value))
   throw fail('connection', 'the plain-files connection changed. open its current connection before syncing.');
 }
 async function current(ticket) {
  const value = (await readSyncStateBytes(folder.store)).state.plain; active(ticket); assertBound(value);
  bound ||= {...value}; connection = value; return value;
 }
 function localPlain(value, ticket, store = {}) {
  const plain = createPlainSession({folder, store, provider: value.provider, place: value.place, device: value.device,
   connectionId: value.connectionId, destination: value.destination, now, guard: () => active(ticket)});
  plains.add(plain); return plain;
 }
 async function plainRun(ticket, place, fn, {connect = false} = {}) {
  if (!other) throw fail('unavailable', 'Cloudflare sign-in has no conditional plain-files transport. Use an R2 bucket key.');
  const kept = connect ? (await readSyncStateBytes(folder.store)).state.plain : await current(ticket);
  active(ticket);
  if (kept) assertBound(kept);
  const where = plainPlace(provider, place), token = await authority(ticket);
  active(ticket);
  const store = plainStore(provider, {place: where, token, fetch: fetchFn}); transports.add(store);
  let plain;
  try {
   const identity = provider === 'drive' ? {id: await store.folderId({create: connect && !kept})} : await store.destinationIdentity({create: connect && !kept});
   active(ticket);
   const destination = await sha256(JSON.stringify([provider, identity])); active(ticket);
   if (kept && (kept.place !== where || kept.destination !== destination)) throw fail('connection', 'this sign-in names another plain-files folder. your notes were not sent.');
   const value = kept || {provider, place: where, destination, device: folder.deviceId && folder.deviceId !== 'files' ? folder.deviceId : 'rapier'};
   plain = localPlain(value, ticket, store);
   const result = await fn(plain, store); active(ticket);
   await readLocal(); active(ticket); assertBound(connection); bound = {...connection};
   await keepDevice(ticket); announce('ready'); return result;
  } finally { plain?.pause(); plains.delete(plain); store.pause(); transports.delete(store); }
 }
 function clearPending() {
  if (!pendingStorage) return;
  pendingStorage.removeItem(pendingKey);
  if (pendingStorage.getItem(pendingKey) !== null) throw fail('storage', 'this page could not remove its sign-in proof.');
 }
 function interrupt() {
  epoch++;
  for (const plain of plains) plain.pause();
  for (const store of transports) store.pause();
 }
 async function keepRevocation() {
  if (!device) return;
  prune();
  const saved = await device.keepRevocation(binding(), [...credentials.values()].map(row => ({...row})),
   {persistCredentials: rememberDevice && !explicitLock && credentials.size > 0, unresolved: unresolvedRevocation});
  coveredMarkerRevision = saved?.revision;
 }
 async function eraseRemembered(value) {
  if (!device) return;
  const saved = await device.forget(value, {revocationPending: !!(credentials.size || needsRevoke || unresolvedRevocation), unresolved: unresolvedRevocation});
  coveredMarkerRevision = saved?.revision;
 }
 function stop({forRevocation = false} = {}) {
  if (stopping) return stopping;
  interrupt(); locked = true;
  let pendingError; try { clearPending(); } catch (error) { pendingError = error; }
  stopping = (async () => {
   try { await work; } catch {}
   if (device) {
    try { await readLocal(); } catch {}
    try { await restoreDevice(epoch, true); }
    catch { throw fail('revoke', 'this device could not read its saved sign-in. retry before removing access.'); }
    try { if (forRevocation) await keepRevocation(); else await eraseRemembered(); }
    catch (error) {
     if (forRevocation) { try { await eraseRemembered(); } catch {} }
     throw fail(error.code === 'device_stale' ? 'revoke' : 'device', 'this device could not preserve revocation custody. retry before leaving this page.');
    }
   }
   if (pendingError) throw pendingError;
  })().finally(() => { stopping = null; });
  return stopping;
 }
 function signOut() {
  if (revoking) return revoking;
  needsRevoke = true; announce('revoking');
  revoking = (async () => {
   let removalError; try { await stop({forRevocation: true}); await keepRevocation(); } catch (error) { removalError = error; }
   prune(); let unrevoked = ''; const hadCredentials = credentials.size > 0;
   const families = new Map();
   for (const row of credentials.values()) {
    const key = JSON.stringify([row.provider, row.clientId, row.redirectUri, row.family]);
    const family = families.get(key) || {record: row, rows: []}; family.rows.push(row); families.set(key, family);
   }
   for (const {record, rows} of families.values()) {
    if (record.provider === 'cloudflare') {
     for (const row of rows.sort((a, b) => (a.hint === 'refresh_token' ? -1 : 1) - (b.hint === 'refresh_token' ? -1 : 1))) {
      const client = oauth(row);
      try { await client.revoke({token: row.token, hint: row.hint}); credentials.delete(custodyKey(row)); await keepRevocation(); } catch {} finally { client.pause(); }
     }
    } else {
     const held = hint => rows.findLast(row => row.hint === hint)?.token;
     try {
      let accessToken = held('access_token'), refreshToken = held('refresh_token');
      if (record.provider === 'dropbox') {
       if (!accessToken && refreshToken) {
        const client = oauth(record, token => capture(token, record, record.provider, record.family)); let token;
        try { token = await client.refresh({refreshToken}); } finally { client.pause(); }
        const minted = capture(token, record, record.provider, record.family); accessToken = minted.accessToken;
        if (minted.refreshToken && minted.refreshToken !== refreshToken)
         for (const [key, row] of credentials) if (row.family === record.family && row.token === refreshToken) credentials.delete(key);
        await keepRevocation();
       }
       refreshToken = null;
      }
      const done = await revokeProviderGrant(record.provider, {fetch: fetchFn, clientId: record.clientId, redirectUri: record.redirectUri,
       grant: {accessToken, refreshToken}});
      if (!done.revoked) { unrevoked = done.message; unresolvedRevocation = true; }
      for (const [key, row] of credentials) if (row.provider === record.provider && row.clientId === record.clientId && row.family === record.family) credentials.delete(key);
      await keepRevocation();
     } catch {}
    }
   }
   try {
    if (credentials.size || unresolvedRevocation || removalError) await keepRevocation();
    else if (device) await device.forget();
   } catch (error) { removalError = error; }
   if (credentials.size || removalError) {
    announce('revocation-pending', removalError?.message || 'sync stopped, but the provider has not confirmed revocation. retry removing access.');
    throw fail('revoke', notice);
   }
   grant = null; grantValid = false;
   if (unresolvedRevocation) {
    needsRevoke = true; announce('revocation-pending', unrevoked || 'sync is stopped. remove this app\'s access at the provider; this device no longer has every credential needed to confirm revocation.');
    return {revoked: false, actionRequired: true, message: notice};
   }
   needsRevoke = false; announce('signed-out', hadCredentials ? 'signed out. provider access was removed; your notes and files are kept.' : 'signed out. this device held no provider credentials to revoke.');
   return {revoked: hadCredentials, ...(!hadCredentials ? {noLocalCredentials: true} : {})};
  })().finally(() => { revoking = null; onChange(status()); });
  return revoking;
 }
 return Object.freeze({
  status,
  inspect() { return run(async ticket => { await readLocal(); if (ticket !== epoch) throw fail('cancelled', 'sync stopped.'); return status(); }, {allowRevocation: true}); },
  async plainConnection() { return publicConnection((await readSyncState(folder)).plain); },
  beginSignIn() { return run(async ticket => {
   if (grant && !locked && !lapsed()) throw fail('auth', 'this page is already signed in.');
   let begun;
   if (other) begun = await beginProviderSignIn(provider, registration);
   else {
    const random = n => crypto.getRandomValues(new Uint8Array(n)), verifier = createVerifier(random), state = createVerifier(random);
    const challenge = await challengeFor(verifier, bytes => crypto.subtle.digest('SHA-256', bytes));
    begun = {verifier, state, url: authorizeUrl({...config, state, challenge})};
   }
   active(ticket);
   const proof = JSON.stringify({provider: service, verifier: begun.verifier, state: begun.state, at: now(),
    redirectUri: registration.redirectUri, clientId: registration.clientId,
    verification: !other && !config.browserRoundTripVerified && new URL(environment.url).hash === '#sync-verify'});
   try { pendingStorage.setItem(pendingKey, proof); if (pendingStorage.getItem(pendingKey) !== proof) throw new Error(); }
   catch { throw fail('storage', 'this page cannot keep a sign-in proof. stay here and try again.'); }
   announce('signing-in'); return begun.url;
  }, {network: true}); },
  finishSignIn(search, callbackUrl) { return run(async ticket => {
   let returned, pending;
   try { returned = new URL(callbackUrl); } catch { throw fail('redirect', 'the full sign-in return address is required.'); }
   if (returned.origin + returned.pathname !== registration.redirectUri || returned.username || returned.password ||
    (other && providerReturnsToken(provider) ? returned.search : returned.hash)) throw fail('redirect', 'this is not the registered sign-in return.');
   try { pending = JSON.parse(pendingStorage.getItem(pendingKey)); } catch { throw fail('state', 'this sign-in cannot be checked. sign in again.'); }
   if (!pending || pending.provider !== service || pending.clientId !== registration.clientId || pending.redirectUri !== registration.redirectUri ||
    !Number.isFinite(pending.at) || pending.at > now() || now() - pending.at > PENDING_MS) throw fail('state', 'this sign-in expired or belongs to another copy. sign in again.');
   const family = crypto.randomUUID(); let issued = false, token;
   const custody = value => { capture(value, registration, service, family); issued = true; };
   try {
    token = other && providerReturnsToken(provider) ? readProviderTokenReturn(provider, search, pending.state, value => { custody(value); clearPending(); }) : null;
   } catch (error) { if (issued) { active(ticket); await keepDevice(ticket); } throw error; }
   const code = token ? null : (other ? readProviderRedirect : readRedirect)(search, pending.state);
   clearPending();
   announce('signing-in');
   const client = token ? null : oauth(undefined, custody); let received;
   try { received = token || await client.exchange({code, verifier: pending.verifier}); }
   catch (error) { if (issued) { active(ticket); await keepDevice(ticket); } throw error; }
   finally { client?.pause(); }
   grantValid = false; grant = capture(received, registration, service, family);
   active(ticket); await validateHeld(ticket); grantValid = true; locked = false; explicitLock = false;
   await readLocal(); active(ticket); await keepDevice(ticket);
   announce(connection ? 'ready' : 'signed-in'); return status();
  }, {network: true}); },
  plainConnect({place} = {}) { return run(ticket => plainRun(ticket, place, async plain => {
   const connected = await plain.connect(); active(ticket);
   await readLocal(); active(ticket);
   if (!sameConnection(connected, connection)) throw fail('connection', 'the plain-files connection changed.');
   bound = {...connection}; await keepDevice(ticket);
   return plain.syncNow();
  }, {connect: true}), {network: true}); },
  plainSyncNow() { return run(async ticket => {
   const kept = await current(ticket); return plainRun(ticket, kept.place, plain => plain.syncNow());
  }, {network: true}); },
  plainDrivePicker() { return run(async ticket => {
   const kept = await current(ticket);
   if (provider !== 'drive') throw fail('connection', 'connect plain files on Google Drive first.');
   return plainRun(ticket, kept.place, async (_plain, store) => {
    const folderId = await store.folderId(); active(ticket);
    return Object.freeze({folderId, accessToken: grant.accessToken});
   });
  }, {network: true}); },
  conflicts() { return run(async ticket => {
   const value = await current(ticket), plain = localPlain(value, ticket);
   try { return await plain.conflicts(); } finally { plains.delete(plain); }
  }); },
  resolve(choice) { return run(async ticket => {
   if (locked) throw fail('auth', 'sign in before choosing a synced version.');
   const value = await current(ticket), plain = localPlain(value, ticket);
   try { return await plain.resolve(choice); } finally { plains.delete(plain); }
  }); },
  setRememberDevice(enabled) { return run(async ticket => {
   if (!device || device.available === false || typeof enabled !== 'boolean') throw fail('device', 'this device cannot remember sync.');
   await readLocal(); if (ticket !== epoch) throw fail('cancelled', 'sync stopped.'); await restoreDevice(ticket, true);
   if (ticket !== epoch) throw fail('cancelled', 'sync stopped.');
   await eraseRemembered(enabled); rememberDevice = enabled;
   if (enabled) { if (needsRevoke) await keepRevocation(); else await keepDevice(ticket); }
   return status();
  }, {allowRevocation: true}); },
  lock() {
   if (locking) { interrupt(); return locking; }
   explicitLock = true;
   locking = (async () => { await stop(); await eraseRemembered(); if (!revoking && !needsRevoke) announce('locked', 'sync is locked. your notes are kept.'); return status(); })()
    .finally(() => { locking = null; onChange(status()); });
   return locking;
  },
  cancelSetup() {
   if (cancelling) return cancelling;
   interrupt(); const ticket = epoch;
   let pendingError; try { clearPending(); } catch (error) { pendingError = error; }
   cancelling = (async () => {
    try { await work; } catch {}
    if (ticket === epoch && !needsRevoke && !locking && !stopping) {
     try { await keepDevice(ticket); }
     catch { if (ticket === epoch && !needsRevoke && !locking && !stopping) await signOut(); }
    }
    if (pendingError) throw pendingError;
    return status();
   })().finally(() => { cancelling = null; onChange(status()); });
   return cancelling;
  },
  plainForget() {
   if (forgetting) return forgetting;
   let expected = bound && {...bound}; interrupt(); const ticket = epoch;
   forgetting = (async () => {
    try { await work; } catch {}
    active(ticket);
    expected ||= bound && {...bound};
    await readLocal(); active(ticket);
    if (!deviceInspected) { await restoreDevice(ticket); active(ticket); }
    const value = (await readSyncStateBytes(folder.store)).state.plain;
    active(ticket);
    if (!value) return null;
    if (value.provider !== provider || expected && !sameConnection(expected, value)) throw fail('connection', 'the plain-files connection changed.');
    const plain = localPlain(value, ticket);
    try { await plain.forget({connectionId: value.connectionId}); active(ticket); connection = bound = null; await keepDevice(ticket); announce(grant && !locked ? 'signed-in' : 'signed-out'); return null; }
    finally { plains.delete(plain); }
   })().finally(() => { forgetting = null; onChange(status()); });
   return forgetting;
  },
  signOut,
 });
}
