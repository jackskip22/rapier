// The web sync owner. OAuth owns provider authority; vault.mjs owns the key; the folder owner
// owns every local publication. Neither a folder, a filename nor a vault key is a transport argument.
import {CLOUDFLARE_SYNC, SYNC_UNAVAILABLE, SYNC_CONSENT, syncAvailability, r2KeyAvailability} from './sync-config.mjs';
import {createVerifier, challengeFor, authorizeUrl, readRedirect, createOAuthClient} from './cloudflare-oauth.mjs';
import {createVault, unlockVault, unlockVaultWithRecovery, vaultId, headerObject, headerDigest, decodeHeader, HEADER_MAX_BYTES, seal, open, decodeRecovery} from './vault.mjs';
import {createR2Transport} from './transport-r2.mjs';
import {createCloudflareSetup, storageDashboard} from './cloudflare-setup.mjs';
export {storageDashboard};
import {createS3Transport} from './transport-s3.mjs';
import {createCompanionTransport} from './transport-companion.mjs';
import {synchronize, createOwnerSyncStore, putVerified, contentHash} from './sync.mjs';
import {readSyncState, updateSyncState} from './sync-state.mjs';
export {readSyncState};
import {createDeviceStorage, createRememberedDevice} from './sync-device.mjs';
export {createDeviceStorage, createRememberedDevice};
import {resolveTextConflict, inspectTextConflicts} from './merge.mjs';
export {CLOUDFLARE_SYNC, SYNC_UNAVAILABLE, SYNC_CONSENT, syncAvailability, r2KeyAvailability};

const td = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const te = new TextEncoder();
const fail = (code, message) => Object.assign(new Error(message), {code});
// Persisted canonical JSON sorts keys; a reconstructed digest record may insert them differently.
const same = (a, b) => a === b || !!a && !!b && typeof a === 'object' && typeof b === 'object' &&
	Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length &&
	Object.keys(a).every(name => Object.hasOwn(b, name) && same(a[name], b[name]));
const PENDING_MS = 10 * 60 * 1000;
// The deliberate verification door must survive Cloudflare's exact redirect, which has no hash.
// Only this tab's fresh, matching PKCE state can restore it; ordinary visitors remain gated.
export function verificationReturn(url, proof, search, config = CLOUDFLARE_SYNC, now = Date.now()) {
	try {
		const pending = JSON.parse(proof), callback = new URL(url), params = new URLSearchParams(search);
		return pending.verification === true && pending.clientId === config.clientId && pending.redirectUri === config.redirectUri &&
			callback.origin + callback.pathname === config.redirectUri && pending.at <= now && now - pending.at <= PENDING_MS &&
			params.getAll('state').length === 1 && params.get('state') === pending.state && typeof pending.state === 'string' && pending.state.length >= 16;
	} catch { return false; }
}
const MAX_CODE_BYTES = 24 * 1024;
const LOCATOR = /^([a-f0-9]{32}):([a-z0-9][a-z0-9-]{1,61}[a-z0-9]):(default|eu|us|fedramp|fedramp-high):([a-f0-9]{32}):([a-f0-9]{64})$/;
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unb64(value) {
	if (typeof value !== 'string' || !value || value.length > MAX_CODE_BYTES || !/^[A-Za-z0-9_-]+$/.test(value)) throw fail('connection', 'the device code is not complete.');
	let bytes;
	try { bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); } catch { throw fail('connection', 'the device code is not complete.'); }
	if (b64(bytes) !== value) throw fail('connection', 'the device code is not complete.');
	return bytes;
}
function locator(target) {
	const value = `${target.accountId}:${target.bucket}:${target.jurisdiction}:${target.vaultId}:${target.headerHash}`;
	if (!LOCATOR.test(value)) throw fail('connection', 'the vault address is not complete.');
	return value;
}
function readLocator(value) {
	const m = typeof value === 'string' && LOCATOR.exec(value);
	if (!m) throw fail('connection', 'the vault address is not complete.');
	return {accountId: m[1], bucket: m[2], jurisdiction: m[3], vaultId: m[4], headerHash: m[5]};
}
// A vault reached through Rapier Sync (Android) is named by its public id and header digest alone: the companion
// keeps where it is stored and the key that reaches it, so neither is in the page, its record or its device code.
const COMPANION_LOCATOR = /^([a-f0-9]{32}):([a-f0-9]{64})$/;
function companionLocator(target) {
	const value = `${target.vaultId}:${target.headerHash}`;
	if (!COMPANION_LOCATOR.test(value)) throw fail('connection', 'the vault address is not complete.');
	return value;
}
function readCompanionLocator(value) {
	const m = typeof value === 'string' && COMPANION_LOCATOR.exec(value);
	if (!m) throw fail('connection', 'the vault address is not complete.');
	return {vaultId: m[1], headerHash: m[2]};
}
const addressOf = (mode, target) => mode === 'companion' ? companionLocator(target) : locator(target);
// One format, two authority routes. Key-route destination fields are inside the seal, so a
// pasted code cannot substitute a bucket or endpoint before the passphrase opens it.
export function connectionCode(target, {mode = 'oauth', header, credential} = {}) {
	if (mode === 'companion') return 'rapier-vault:' + b64(te.encode(JSON.stringify({mode, address: companionLocator(target)})));
	locator(target);
	const body = mode === 'r2-key' ? {mode, vaultId: target.vaultId, header: b64(header), credential: b64(credential)} : {mode: 'oauth', address: locator(target)};
	return 'rapier-vault:' + b64(te.encode(JSON.stringify(body)));
}
export function readConnectionCode(value) {
	let body;
	try {
		if (typeof value !== 'string' || !value.trim().startsWith('rapier-vault:') || value.length > MAX_CODE_BYTES) throw new Error();
		body = JSON.parse(td.decode(unb64(value.trim().slice(13))));
	} catch { throw fail('connection', 'paste the whole device code from your other device.'); }
	if (body?.mode === 'oauth' && Object.keys(body).sort().join() === 'address,mode') return {mode: 'oauth', ...readLocator(body.address)};
	if (body?.mode === 'companion' && Object.keys(body).sort().join() === 'address,mode') return {mode: 'companion', ...readCompanionLocator(body.address)};
	if (body?.mode !== 'r2-key' || Object.keys(body).sort().join() !== 'credential,header,mode,vaultId' || !/^[a-f0-9]{32}$/.test(body.vaultId || '')) throw fail('connection', 'paste the whole device code from your other device.');
	const header = unb64(body.header), credential = unb64(body.credential);
	decodeHeader(header);
	if (credential.length < 30 || credential.length > 8192) throw fail('connection', 'the bucket key in this code is not complete.');
	return {mode: 'r2-key', vaultId: body.vaultId, header, credential};
}
async function conflictDigests(conflict) {
	return {blockHash: await contentHash(conflict.block), variants: await Promise.all(conflict.variants.map(async value => ({device: value.device, content: await contentHash(value.text)})))};
}
const credentialDomain = id => 'rapier-sync-r2-key/' + id;
function keySettings(target, pair) {
	locator(target);
	if (!['default', 'eu', 'us', 'fedramp'].includes(target.jurisdiction)) throw fail('connection', 'choose the jurisdiction cloudflare shows for your r2 bucket.');
	const {accessKeyId, secretAccessKey} = pair || {};
	if (typeof accessKeyId !== 'string' || !/^[A-Za-z0-9]{16,128}$/.test(accessKeyId) || typeof secretAccessKey !== 'string' || !/^[A-Za-z0-9/+_-]{32,256}$/.test(secretAccessKey)) throw fail('credential', 'enter your r2 access key id and secret access key from cloudflare.');
	return {accountId: target.accountId, bucket: target.bucket, jurisdiction: target.jurisdiction, accessKeyId, secretAccessKey};
}
async function sealCredential(target, pair, vdk) {
	const bytes = te.encode(JSON.stringify(keySettings(target, pair)));
	try { return await seal(vdk, credentialDomain(target.vaultId), bytes); } finally { bytes.fill(0); }
}
async function openCredential(id, sealed, vdk) {
	const bytes = await open(vdk, credentialDomain(id), sealed);
	try {
		const value = JSON.parse(td.decode(bytes));
		if (Object.keys(value).sort().join() !== 'accessKeyId,accountId,bucket,jurisdiction,secretAccessKey') throw new Error();
		return keySettings({...value, vaultId: id, headerHash: '0'.repeat(64)}, value);
	} catch { throw fail('credential', 'the bucket key cannot be read. nothing was sent.'); }
	finally { bytes.fill(0); }
}
async function checkedRecord(record) {
	if (!record) return null;
	if (!['oauth', 'r2-key', 'companion'].includes(record.mode)) throw fail('connection', 'this folder’s sync connection cannot be read.');
	const target = record.mode === 'companion' ? readCompanionLocator(record.address) : readLocator(record.address);
	if (!Array.isArray(record.header) || record.header.length > HEADER_MAX_BYTES || record.header.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw fail('header', 'the saved vault header cannot be read. your notes are unchanged.');
	const bytes = Uint8Array.from(record.header);
	decodeHeader(bytes);
	if (await headerDigest(bytes) !== target.headerHash) throw fail('header', 'the saved vault header did not verify. your notes are unchanged.');
	const kept = record.credential;
	if (kept != null && (record.mode !== 'r2-key' || !Array.isArray(kept) || kept.length < 30 || kept.length > 8192 || kept.some(n => !Number.isInteger(n) || n < 0 || n > 255))) throw fail('credential', 'the saved bucket key cannot be read.');
	return {mode: record.mode, target, bytes, address: record.address, credential: kept == null ? null : Uint8Array.from(kept)};
}

export function createSyncSession({folder, fetch: fetchFn, pendingStorage, pendingKey = 'rapier:cloudflare:pending',
	config = CLOUDFLARE_SYNC, environment = {}, mode = 'oauth', personal = null, device = null, now = Date.now, onChange = () => {}, companion = null, label = null} = {}) {
	// Through Rapier Sync the page has no network of its own: companion.call is the app's seam (host.syncTransport).
	if (!folder?.owner || mode !== 'companion' && typeof fetchFn !== 'function') throw fail('config', 'sync needs the notes folder and the network.');
	// A private copy prevents a caller mutating registration or host facts after admission.
	config = Object.freeze({...config, scopes: Object.freeze([...(config.scopes || [])])});
	environment = Object.freeze({...environment});
	if (!['oauth', 'r2-key', 'companion'].includes(mode)) throw fail('config', 'choose the cloudflare sign-in or an r2 bucket key.');
	const gate = mode === 'companion' ? (typeof companion?.call === 'function' ? {ready: true, reason: ''} : {ready: false, reason: 'rapier sync is not connected on this device; open it from notes settings.'})
		: mode === 'r2-key' ? r2KeyAvailability(environment) : syncAvailability(environment, config);
	const oauth = (clientId = config.clientId) => createOAuthClient({fetch: fetchFn, clientId, redirectUri: config.redirectUri});
	let grant = null, key = null, connection = null, work = null, epoch = 0, revoking = null, locking = null, stopping = null, leaving = null, cancelling = null;
	let staged = null, rememberDevice = !!device && device.available !== false, deviceInspected = false, folderIdentity = null;
	let accounts = null, storage = null;
	let stage = 'signed-out', notice = '', needsRevoke = false, backedUpAt = null, rejoinRequired = false;
	// The vault's devices as the last run read their newest heads: each device id with its label and shelf writer.
	let devices = Object.freeze([]);
	const transports = new Set(), credentials = new Map();
	const status = () => Object.freeze({stage, mode, authorized: mode === 'companion' ? !!connection : mode === 'r2-key' ? !!key && !!connection?.credential : !!grant && !needsRevoke, unlocked: !!key,
		rememberDevice, rememberAvailable: !!device && device.available !== false, hasConnection: !!connection, credentialStored: !!connection?.credential, rejoinRequired,
		busy: !!work || !!revoking || !!locking || !!stopping || !!leaving || !!cancelling, revocationPending: needsRevoke,
		address: connection && (mode !== 'r2-key' || connection.credential) ? connectionCode(connection.target, {mode, header: connection.bytes, credential: connection.credential}) : '', notice, gate, backedUpAt, devices});
	const announce = (next, text = '') => { stage = next; notice = text; onChange(status()); };
	const ready = () => { if (!gate.ready) throw fail('unavailable', gate.reason); };
	const pruneCredentials = () => {
		for (const [token, record] of credentials) if (record.hint === 'access_token' && record.expiresAt != null && record.expiresAt <= now()) credentials.delete(token);
	};
	const remember = token => {
		pruneCredentials();
		grant = {...token, expiresAt: token.expiresAt ?? (token.expiresIn ? now() + token.expiresIn * 1000 : null)};
		credentials.set(token.accessToken, {hint:'access_token', clientId:config.clientId, expiresAt:grant.expiresAt});
		if (token.refreshToken) credentials.set(token.refreshToken, {hint:'refresh_token', clientId:config.clientId});
	};
	const deviceBinding = () => JSON.stringify({folder: folderIdentity, mode, address: connection?.address || null,
		registration: mode === 'oauth' ? [config.clientId, config.redirectUri, config.scopes] : null, origin: new URL(environment.url).origin});
	async function keepDevice(ticket) {
		if (!device || !rememberDevice) return;
		active(ticket);
		pruneCredentials();
		const saved = {grant, credentials: [...credentials].map(([token, record]) => [token, record.hint, record]), key: key ? Array.from(key) : null};
		try { await device.keep(deviceBinding(), saved); }
		catch { throw fail('device', 'this device could not remember the changed sync. your notes are kept; try again or turn off remember this device.'); }
		finally { saved.key?.fill(0); }
		active(ticket);
	}
	async function restoreDevice(ticket, custodyOnly = false) {
		if (!device || deviceInspected && !custodyOnly) return;
		let savedKey, authorityCaptured = false;
		try {
			const restored = await device.read(deviceBinding()); rememberDevice = restored.enabled;
			const value = restored.data, custody = value || restored.retired;
			savedKey = value?.key;
			const registration = restored.binding ? JSON.parse(restored.binding).registration : null;
			const clientId = registration?.[0] || config.clientId;
			if (custody && (!Array.isArray(custody.credentials) || custody.credentials.some(row => !Array.isArray(row) || row.length < 2 || row.length > 3 || typeof row[0] !== 'string' || !row[0] || !['access_token', 'refresh_token'].includes(row[1])))) throw fail('device', 'the saved sign-in cannot be read.');
			for (const [token, hint, details] of custody?.credentials || []) {
				if (details != null && (details.hint !== hint || typeof details.clientId !== 'string' || !details.clientId || details.expiresAt != null && !Number.isFinite(details.expiresAt))) throw fail('device', 'the saved sign-in cannot be read.');
				credentials.set(token, {hint, clientId, ...details});
			}
			const saved = custody?.grant;
			if (saved) {
				if (typeof saved.accessToken !== 'string' || !saved.accessToken || saved.expiresAt != null && !Number.isFinite(saved.expiresAt) ||
					(saved.refreshToken != null && typeof saved.refreshToken !== 'string') || typeof saved.scope !== 'string') throw fail('device', 'the saved sign-in cannot be read.');
				// Capture under the original registration even when this folder no longer matches it.
				credentials.set(saved.accessToken, {hint:'access_token', clientId, expiresAt:saved.expiresAt});
				if (saved.refreshToken) credentials.set(saved.refreshToken, {hint:'refresh_token', clientId});
			}
			authorityCaptured = true; deviceInspected = true; pruneCredentials();
			if (custodyOnly) return;
			active(ticket);
			if (!value) return;
			if (saved) { if (mode !== 'oauth') throw fail('device', 'the saved sign-in cannot be read.'); remember(saved); checkScopes(); }
			if (value.key) {
				if (rejoinRequired || !connection || !Array.isArray(value.key) || value.key.length !== 32 || value.key.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw fail('device', 'the saved unlock cannot be read.');
				const restoredKey = Uint8Array.from(value.key);
				try { if (await vaultId(restoredKey) !== connection.target.vaultId) throw fail('device', 'the saved unlock names another vault.'); active(ticket); key = restoredKey; }
				finally { if (key !== restoredKey) restoredKey.fill(0); value.key.fill(0); }
			}
			stage = key ? 'ready' : grant ? 'locked' : 'signed-out';
		} catch (error) {
			if (!custodyOnly) { key?.fill(0); key = null; grant = null; }
			if (error.code !== 'cancelled') notice = 'this device could not restore sync. sign in and unlock again.';
			// A failed read is retryable; never erase a record whose authority is still unknown.
			if (!authorityCaptured) throw fail('device', 'this device could not read its saved sign-in. try again before removing access.');
		} finally { if (Array.isArray(savedKey)) savedKey.fill(0); }
	}
	const checkScopes = () => {
		// OAuth permits omission of scope when it is unchanged. An explicit narrowed grant is not.
		if (grant.scope && config.scopes.some(scope => !grant.scope.split(/\s+/).includes(scope))) throw fail('permission', 'cloudflare did not grant storage access: sign out and try again.');
	};
	const active = ticket => { if (ticket !== epoch || needsRevoke) throw fail('cancelled', 'sync stopped. your notes, and what waits to upload, are kept.'); };
	function run(fn) {
		ready();
		if (work || revoking || locking || stopping || leaving || cancelling) throw fail('busy', 'let the current sync finish, or lock the vault to stop it.');
		if (needsRevoke) throw fail('revoke', 'sync stays stopped until cloudflare confirms: retry removing access.');
		const ticket = epoch;
		work = Promise.resolve().then(async () => { active(ticket); if (device && !deviceInspected) { await readLocal(); await restoreDevice(ticket); active(ticket); } return fn(ticket); }).finally(() => { work = null; onChange(status()); });
		onChange(status());
		return work;
	}
	async function authority(ticket) {
		active(ticket);
		if (!grant) throw fail('auth', 'sign in with cloudflare first.');
		if (grant.expiresAt != null && grant.expiresAt <= now() + 30000) {
			if (!grant.refreshToken) throw fail('auth', 'your cloudflare sign-in expired: sign out, then sign in again.');
			const previous = grant;
			const refreshed = await oauth().refresh({refreshToken: previous.refreshToken});
			// RFC 6749 section 6 replaces a rotated refresh token. Still-live access tokens
			// remain in custody until their provider lifetime ends or revocation is confirmed.
			if (refreshed.refreshToken && refreshed.refreshToken !== previous.refreshToken) credentials.delete(previous.refreshToken);
			remember({...refreshed, refreshToken: refreshed.refreshToken || previous.refreshToken, scope: refreshed.scope || previous.scope});
			active(ticket); await keepDevice(ticket);
		}
		checkScopes();
		return grant.accessToken;
	}
	async function transport(target, ticket, pair = null) {
		if (mode === 'companion') {
			active(ticket);
			const result = createCompanionTransport({call: companion.call, vaultId: target.vaultId});
			transports.add(result);
			return result;
		}
		if (mode === 'r2-key') {
			active(ticket);
			if (!pair) {
				if (!key || !connection?.credential) throw fail('credential', 'connect and unlock your bucket key before syncing.');
				pair = await openCredential(target.vaultId, connection.credential, key);
			}
			active(ticket);
			if (pair.accountId !== target.accountId || pair.bucket !== target.bucket || pair.jurisdiction !== target.jurisdiction) throw fail('credential', 'the vault address and bucket key do not match. nothing was sent.');
			const result = createS3Transport({fetch: fetchFn, endpoint: `https://${target.accountId}.${target.jurisdiction === 'default' ? '' : target.jurisdiction + '.'}r2.cloudflarestorage.com`,
				bucket: target.bucket, vaultId: target.vaultId, addressingStyle: 'path', region: 'auto', accessKeyId: pair.accessKeyId, secretAccessKey: pair.secretAccessKey});
			transports.add(result);
			return result;
		}
		const token = await authority(ticket); active(ticket);
		const result = createR2Transport({fetch: fetchFn, accountId: target.accountId, bucket: target.bucket,
			jurisdiction: target.jurisdiction, vaultId: target.vaultId, token});
		transports.add(result);
		return result;
	}
	async function withTransport(target, ticket, fn, pair = null) {
		const tr = await transport(target, ticket, pair);
		try { return await fn(tr); } finally { tr.pause(); transports.delete(tr); }
	}
	async function withSetup(ticket, fn) {
		if (mode !== 'oauth') throw fail('config', 'automatic setup uses cloudflare sign-in.');
		const token = await authority(ticket); active(ticket);
		const setup = createCloudflareSetup({fetch: fetchFn, token});
		transports.add(setup);
		try { const result = await fn(setup); active(ticket); return result; }
		finally { setup.pause(); transports.delete(setup); }
	}
	async function readLocal() {
		const snapshot = await folder.read();
		const state = await readSyncState(folder);
		const kept = await checkedRecord(state.vault);
		if (kept && kept.mode !== mode) throw fail('connection', 'this folder syncs another way: open its saved connection.');
		if (state.head && !kept) throw fail('connection', 'this folder has synced before, but its vault address is missing: restore it before syncing. nothing was reset.');
		if (key && connection && (!kept || connection.address !== kept.address)) throw fail('connection', 'this folder now names another vault: lock it before going on.');
		connection = kept; folderIdentity = snapshot.index.folderDeviceId;
		rejoinRequired = state.rejoin === true;
		if (rejoinRequired) { key?.fill(0); key = null; notice = 'this restored folder must join its vault again; paste a device code from another device.'; }
		backedUpAt = Number.isSafeInteger(state.backedUpAt) && state.backedUpAt > 0 ? state.backedUpAt : null;
		return {...state, folderDeviceId: snapshot.index.folderDeviceId};
	}
	async function keepConnection(target, bytes, ticket, credential, before, identity, committed = () => {}) {
		const address = addressOf(mode, target), header = Array.from(bytes);
		const record = {mode, address, header, ...(mode === 'r2-key' ? {credential: credential ? Array.from(credential) : null} : {})};
		await updateSyncState(folder, (state, index) => {
			active(ticket);
			if (index.folderDeviceId !== identity || !same(state.vault || null, before)) throw fail('connection', 'the saved connection changed during the check; its newer settings were kept.');
			if (state.head && !state.vault) throw fail('connection', 'this folder’s sync record was kept, but its vault address is missing.');
			const next = {...state, vault: record};
			delete next.rejoin;
			return next;
		});
		committed();
		active(ticket);
		const refreshed = await folder.read(), state = await readSyncState(folder);
		connection = await checkedRecord(state.vault);
		rejoinRequired = state.rejoin === true;
		if (refreshed.index.folderDeviceId !== identity || rejoinRequired || connection?.address !== address || !same(connection.credential && Array.from(connection.credential), record.credential || null))
			throw fail('connection', 'the vault address did not read back. your notes are unchanged.');
	}

	function stop() {
		if (!stopping) {
			epoch++;
			for (const tr of transports) tr.pause();
			const held = key; key = null; staged?.vdk?.fill(0); staged = null;
			stopping = (async () => {
				try { await work; } catch {} finally { held?.fill(0); }
				if (device) {
					// A damaged/moved folder must not prevent revoking the device record's own grant.
					if (!deviceInspected) { try { await readLocal(); } catch {} }
					// Inspection can be stale across tabs. Read again, then remove only that revision.
					try { await restoreDevice(epoch, true); }
					catch { throw fail('revoke', 'this device could not read its saved sign-in. retry here, or revoke rapier in cloudflare.'); }
					try { await device.forget(); }
					catch (error) {
						if (error.code === 'device_stale') throw fail('revoke', 'another tab changed this device’s saved sign-in. retry to remove its access.');
						throw fail('device', 'this device could not forget its saved sync. clear this site’s storage before leaving a shared device.');
					}
				}
			})().finally(() => { stopping = null; });
		}
		// Share the cancellation/custody drain, not the result of distinct user intentions.
		return stopping;
	}
	function readPending() {
		let row;
		try { row = JSON.parse(pendingStorage.getItem(pendingKey)); } catch { throw fail('state', 'this sign-in cannot be checked: sign in again.'); }
		if (!row || row.redirectUri !== config.redirectUri || row.clientId !== config.clientId || !Number.isFinite(row.at) || row.at > now() || now() - row.at > PENDING_MS) throw fail('state', 'this sign-in expired or belongs to another copy of rapier: sign in again.');
		return row;
	}
	async function removeGrantAuthority() {
		let removalError; try { await stop(); } catch (error) { removalError = error; }
		pruneCredentials();
		for (const [token, record] of [...credentials].sort((a, b) => (a[1].hint === 'refresh_token' ? -1 : 1) - (b[1].hint === 'refresh_token' ? -1 : 1))) {
			try { await oauth(record.clientId).revoke({token, hint:record.hint}); credentials.delete(token); } catch {}
		}
		if (credentials.size || removalError?.code === 'revoke') {
			announce('revocation-pending', removalError?.code === 'revoke' ? removalError.message : 'sync stopped, but cloudflare has not confirmed revocation. retry here, or revoke rapier in cloudflare before you close this page.');
			throw fail('revoke', notice);
		}
		grant = null; accounts = null; storage = null; needsRevoke = false;
		return removalError;
	}
	function revokeGrant() {
		if (revoking) return revoking;
		ready(); needsRevoke = true;
		announce('revoking', 'sync stopped. revoking cloudflare access…');
		try { pendingStorage.removeItem(pendingKey); } catch {}
		revoking = (async () => {
			const removalError = await removeGrantAuthority();
			announce('signed-out', removalError ? removalError.message : 'signed out, and cloudflare confirmed revocation. your notes and the vault stay.');
			if (removalError) throw removalError;
			return {revoked: true};
		})().finally(() => { revoking = null; onChange(status()); });
		return revoking;
	}
	function forgetKey() {
		ready();
		if (mode !== 'r2-key') throw fail('config', 'sign out to remove your cloudflare sign-in.');
		if (revoking) return revoking;
		needsRevoke = true;
		revoking = (async () => {
			// A mode change can leave an OAuth grant in the device record. Its original
			// registration still owns revocation even when this session uses a bucket key.
			const removalError = await removeGrantAuthority(); if (removalError) throw removalError;
			await updateSyncState(folder, state => {
				if (!state.vault || state.vault.mode !== mode) return null;
				return {...state, vault: {...state.vault, credential: null}};
			});
			connection = await checkedRecord((await readSyncState(folder)).vault);
			announce('signed-out', 'bucket key forgotten here. other devices and copied codes keep access until you delete the key in cloudflare.');
			return {forgotten: true, revoked: false};
		})().finally(() => { revoking = null; onChange(status()); });
		return revoking;
	}

	function confirmRecovery(code) {
		let typed;
		try {
			typed = decodeRecovery(code);
			if (!staged || !typed.every((byte, i) => byte === staged.vdk[i])) throw new Error();
			return true;
		} catch { throw fail('recovery', 'type the recovery code you just saved before connecting your bucket.'); }
		finally { typed?.fill(0); }
	}
	function lockVault() {
		if (locking) return locking;
		locking = (async () => { await stop(); if (!revoking && !needsRevoke && !leaving) announce(grant || mode === 'r2-key' && connection?.credential || mode === 'companion' && connection ? 'locked' : 'signed-out', 'vault locked and sync stopped. your notes are kept.'); return status(); })()
			.finally(() => { locking = null; onChange(status()); });
		return locking;
	}
	function leave() {
		if (leaving) return leaving;
		leaving = (async () => {
			await stop();
			await folder.leaveVault();
			connection = null; rejoinRequired = false; backedUpAt = null; devices = Object.freeze([]);
			if (!revoking) announce(grant ? 'locked' : 'signed-out', 'this folder left the vault; every note stays here. other devices and the online vault are unchanged.');
			return {left: true, revoked: false};
		})().finally(() => { leaving = null; onChange(status()); });
		return leaving;
	}

	return Object.freeze({
		status, confirmRecovery, leave,
		setRememberDevice(enabled) { return run(async ticket => {
			if (!device || device.available === false || typeof enabled !== 'boolean') throw fail('device', 'this device cannot remember sync.');
			await readLocal(); active(ticket); await restoreDevice(ticket, true); active(ticket);
			await device.forget(enabled); active(ticket); rememberDevice = enabled; if (enabled) await keepDevice(ticket);
			return status();
		}); },
		cloudflareAccounts() { return run(async ticket => {
			accounts = await withSetup(ticket, setup => setup.accounts());
			return accounts.map(account => ({...account}));
		}); },
		cloudflareStorage(accountId) { return run(async ticket => {
			if (!accounts?.some(account => account.id === accountId)) throw fail('account', 'choose one of your cloudflare accounts.');
			storage = null;
			storage = await withSetup(ticket, setup => setup.storage(accountId));
			return {...storage, vaults: storage.vaults.map(target => ({address: connectionCode(target)}))};
		}); },
		inspect() { return run(async ticket => {
			await readLocal(); active(ticket);
			if (mode === 'r2-key' && !key) stage = connection?.credential ? 'locked' : 'signed-out';
			if (mode === 'companion' && !key) stage = connection ? 'locked' : 'signed-out';
			return status();
		}); },
		prepare({passphrase} = {}) { return run(async ticket => {
			if (mode !== 'r2-key') throw fail('config', 'the recovery check belongs to bucket key setup.');
			await readLocal(); active(ticket);
			if (rejoinRequired) throw fail('connection', 'this restored folder must join its vault again, or leave it before starting a new vault.');
			if (connection) throw fail('connection', 'this folder already has a vault: unlock it instead.');
			if (typeof passphrase !== 'string' || [...passphrase].length < 16) throw fail('passphrase', 'use at least 16 characters for your sync passphrase.');
			staged?.vdk?.fill(0); staged = null;
			const made = await createVault(passphrase);
			try { active(ticket); staged = made; return {recovery: made.recovery}; }
			catch (error) { made.vdk.fill(0); throw error; }
		}); },
		cancelSetup() {
			// Closing setup cancels uncommitted setup, not an already remembered sign-in.
			if (cancelling) return cancelling;
			const ticket = ++epoch; for (const tr of transports) tr.pause();
			staged?.vdk?.fill(0); staged = null;
			cancelling = (async () => {
				try { await work; } catch {}
				// An exchange or rotation can finish after cancellation. Persist its authority
				// before closing, unless Lock/Leave/Sign out has taken over the same drain.
				if (ticket === epoch && !needsRevoke && !locking && !stopping && !leaving) {
					try { await keepDevice(ticket); }
					catch {
						if (ticket === epoch && !needsRevoke && !locking && !stopping && !leaving) {
							// A late exchange must not become an orphan merely because storage failed.
							// The same revocation owner coalesces with a simultaneous Sign out.
							try { await revokeGrant(); }
							catch { /* The owner has announced the storage failure or pending revocation. */ }
						}
					}
				}
				return status();
			})().finally(() => { cancelling = null; onChange(status()); });
			return cancelling;
		},
		beginSignIn() { return run(async ticket => {
			if (mode !== 'oauth') throw fail('unavailable', 'a bucket key does not use the cloudflare sign-in.');
			if (grant) throw fail('auth', 'this page is already signed in.');
			await readLocal(); await restoreDevice(ticket); active(ticket);
			if (grant) throw fail('auth', 'this device is already signed in.');
			const random = n => crypto.getRandomValues(new Uint8Array(n));
			const verifier = createVerifier(random), state = createVerifier(random);
			const challenge = await challengeFor(verifier, bytes => crypto.subtle.digest('SHA-256', bytes));
			active(ticket);
			const url = authorizeUrl({...config, state, challenge});
			const proof = JSON.stringify({verifier, state, at: now(), redirectUri: config.redirectUri, clientId: config.clientId,
				verification: !config.browserRoundTripVerified && new URL(environment.url).hash === '#sync-verify'});
			try { pendingStorage.setItem(pendingKey, proof); if (pendingStorage.getItem(pendingKey) !== proof) throw new Error(); }
			catch { throw fail('storage', 'this page cannot keep a sign-in: stay here and back up your notes.'); }
			announce('signing-in'); return url;
		}); },
		finishSignIn(search, callbackUrl) { return run(async ticket => {
			if (mode !== 'oauth') throw fail('unavailable', 'a bucket key does not use the cloudflare sign-in.');
			const returned = new URL(callbackUrl);
			if (returned.origin + returned.pathname !== config.redirectUri) throw fail('redirect', 'this is not where the cloudflare sign-in returns.');
			const pending = readPending(), code = readRedirect(search, pending.state);
			pendingStorage.removeItem(pendingKey); // one use, before the exchange
			announce('signing-in');
			remember(await oauth().exchange({code, verifier: pending.verifier}));
			active(ticket); checkScopes();
			await readLocal(); active(ticket); await keepDevice(ticket);
			announce('locked');
			return status();
		}); },
		create({accountId, bucket, jurisdiction = 'default', accessKeyId, secretAccessKey, passphrase, recoveryCode} = {}) { return run(async ticket => {
			if (mode === 'oauth') await authority(ticket);
			if (mode === 'oauth' && !accountId && !bucket && storage) ({accountId, bucket, jurisdiction} = storage);
			const local = await readLocal(); active(ticket);
			if (rejoinRequired) throw fail('connection', 'this restored folder must join its vault again, or leave it before starting a new vault.');
			if (connection) throw fail('connection', 'this folder already has a vault: unlock it instead.');
			let made;
			try {
				if (mode === 'r2-key' && staged) {
					confirmRecovery(recoveryCode);
					made = staged;
				} else {
					if (typeof passphrase !== 'string' || [...passphrase].length < 16) throw fail('passphrase', 'use at least 16 characters for your sync passphrase.');
					made = await createVault(passphrase);
				}
				active(ticket);
				const header = await headerObject(made.headerBytes);
				const target = mode === 'companion' ? {vaultId: made.vaultId, headerHash: header.key.slice(5)}
					: {accountId, bucket, jurisdiction, vaultId: made.vaultId, headerHash: header.key.slice(5)};
				addressOf(mode, target);
				let credential = null;
				if (mode === 'r2-key') {
					const pair = keySettings(target, {accessKeyId, secretAccessKey});
					await withTransport(target, ticket, tr => tr.connect(), pair); active(ticket);
					credential = await sealCredential(target, pair, made.vdk); active(ticket);
				}
				let committed = false, verified = true;
				try { await keepConnection(target, made.headerBytes, ticket, credential, null, local.folderDeviceId, () => { committed = true; }); }
				catch (error) {
					// The owner may already have committed when Lock, or a read-back failure, arrives.
					// Returning its recovery code is then part of completing that commit, not new work.
					if (!committed) {
						const kept = await checkedRecord((await readSyncState(folder)).vault);
						if (kept?.address !== addressOf(mode, target)) throw error;
					}
					verified = false;
				}
				if (staged === made) staged = null;
				if (verified && ticket === epoch && !needsRevoke) {
					key = made.vdk; made.vdk = null;
					let remembered = true;
					try { await keepDevice(ticket); } catch { remembered = false; }
					if (ticket === epoch && !needsRevoke) announce('ready', remembered
						? mode === 'r2-key' ? 'bucket checked, and its key locked with your vault. no notes sent yet: press sync now.' : 'save the recovery code somewhere safe. nothing is uploaded yet.'
						: 'vault created. save its recovery code now. this device could not remember the unlock; use your passphrase next time.');
				}
				else if (ticket === epoch && !needsRevoke) announce('locked', 'vault created. save its recovery code now, then reopen sync to check the saved connection.');
				return {address: connectionCode(target, {mode, header: made.headerBytes, credential}), recovery: made.recovery};
			} finally { if (made !== staged) made?.vdk?.fill(0); }
		}); },
		join({address, secret, recovery = false} = {}) { return run(async ticket => {
			const local = await readLocal(), before = local.vault || null; active(ticket);
			if (connection && mode !== 'r2-key' && !rejoinRequired) throw fail('connection', 'this folder already has a vault: unlock it instead.');
			const code = readConnectionCode(address);
			// Through Rapier Sync any device code joins: the page takes the vault's id and header from it, nothing more;
			// the companion reaches the storage with the key typed into it, never a key or address from the code.
			if (code.mode !== mode && mode !== 'companion') throw fail('connection', 'this device code syncs another way.');
			let opened;
			try {
				if (mode === 'companion') {
					const target = {vaultId: code.vaultId, headerHash: code.mode === 'r2-key' ? await headerDigest(code.header) : code.headerHash};
					if (connection && companionLocator(target) !== connection.address) throw fail('connection', 'this folder belongs to another vault; its connection was not replaced.');
					const header = code.mode === 'r2-key' ? code.header : await withTransport(target, ticket, async tr => (await tr.get('keys/' + target.headerHash))?.bytes);
					active(ticket);
					if (!header || header.length > HEADER_MAX_BYTES || await headerDigest(header) !== target.headerHash) throw fail('header', 'the vault header is missing or did not verify. nothing was imported.');
					opened = await (recovery ? unlockVaultWithRecovery(header, secret) : unlockVault(header, secret)); active(ticket);
					if (await vaultId(opened) !== target.vaultId) throw fail('connection', 'this key does not open that vault.');
					await keepConnection(target, header, ticket, null, before, local.folderDeviceId); active(ticket);
				} else if (mode === 'r2-key') {
					opened = await (recovery ? unlockVaultWithRecovery(code.header, secret) : unlockVault(code.header, secret)); active(ticket);
					if (await vaultId(opened) !== code.vaultId) throw fail('connection', 'this key does not open that vault.');
					const pair = await openCredential(code.vaultId, code.credential, opened); active(ticket);
					const target = {...pair, vaultId: code.vaultId, headerHash: await headerDigest(code.header)};
					if (connection && locator(target) !== connection.address) throw fail('connection', 'this folder belongs to another vault; its connection was not replaced.');
					await withTransport(target, ticket, tr => tr.connect(), pair); active(ticket);
					await keepConnection(target, code.header, ticket, code.credential, before, local.folderDeviceId); active(ticket);
				} else {
					if (connection && locator(code) !== connection.address) throw fail('connection', 'this folder belongs to another vault; its connection was not replaced.');
					await withTransport(code, ticket, async tr => {
						const got = await tr.get('keys/' + code.headerHash); active(ticket);
						if (!got || got.bytes.length > HEADER_MAX_BYTES || await headerDigest(got.bytes) !== code.headerHash) throw fail('header', 'the vault header is missing or did not verify. nothing was imported.');
						opened = await (recovery ? unlockVaultWithRecovery(got.bytes, secret) : unlockVault(got.bytes, secret)); active(ticket);
						if (await vaultId(opened) !== code.vaultId) throw fail('connection', 'this key does not open that vault.');
						await keepConnection(code, got.bytes, ticket, null, before, local.folderDeviceId); active(ticket);
					});
				}
				key?.fill(0); key = opened; opened = null; await keepDevice(ticket);
				announce('ready', 'vault unlocked. sync keeps both devices’ notes and replaces nothing; a name already taken gets a new one.');
				return status();
			} finally { opened?.fill(0); }
		}); },
		replaceKey({accessKeyId, secretAccessKey, secret, recovery = false} = {}) { return run(async ticket => {
			if (mode !== 'r2-key') throw fail('config', 'this vault uses cloudflare sign-in, not a bucket key.');
			const local = await readLocal(), before = local.vault || null; active(ticket);
			if (!connection) throw fail('connection', 'join a vault before replacing its bucket key.');
			let opened;
			try {
				// A forgotten or deleted provider key must not prevent a local vault unlock.
				opened = key ? key.slice() : await (recovery ? unlockVaultWithRecovery(connection.bytes, secret) : unlockVault(connection.bytes, secret));
				active(ticket);
				const {target, bytes} = connection;
				if (await vaultId(opened) !== target.vaultId) throw fail('connection', 'this key does not open that vault.');
				const pair = keySettings(target, {accessKeyId, secretAccessKey});
				await withTransport(target, ticket, tr => tr.connect(), pair); active(ticket);
				const credential = await sealCredential(target, pair, opened); active(ticket);
				await keepConnection(target, bytes, ticket, credential, before, local.folderDeviceId); active(ticket);
				key?.fill(0); key = opened; opened = null; await keepDevice(ticket);
				announce('ready', 'new bucket key checked and saved; give the new device code to your other devices.');
				return status();
			} finally { opened?.fill(0); }
		}); },
		unlock(secret, {recovery = false} = {}) { return run(async ticket => {
			await readLocal(); active(ticket);
			if (rejoinRequired) throw fail('connection', 'this restored folder must join its vault again; paste a device code from another device.');
			if (!connection) throw fail('connection', 'create a vault, or connect the one from your other device, first.');
			if (mode === 'r2-key' && !connection.credential) throw fail('credential', 'this device forgot its bucket key: add it again with a code from another device.');
			let opened;
			try {
				opened = await (recovery ? unlockVaultWithRecovery(connection.bytes, secret) : unlockVault(connection.bytes, secret)); active(ticket);
				if (await vaultId(opened) !== connection.target.vaultId) throw fail('connection', 'this key does not open that vault.');
				if (mode === 'r2-key') {
					const pair = await openCredential(connection.target.vaultId, connection.credential, opened);
					if (pair.accountId !== connection.target.accountId || pair.bucket !== connection.target.bucket || pair.jurisdiction !== connection.target.jurisdiction) throw fail('credential', 'the vault address and bucket key do not match. nothing was sent.');
				}
				active(ticket); key?.fill(0); key = opened; opened = null; await keepDevice(ticket);
				announce('ready'); return status();
			} finally { opened?.fill(0); }
		}); },
		syncNow() { return run(async ticket => {
			if (!key) throw fail('locked', 'unlock your vault before syncing.');
			const local = await readLocal(); active(ticket);
			if (rejoinRequired) throw fail('connection', 'this restored folder must join its vault again; paste a device code from another device.');
			if (!connection) throw fail('connection', 'this folder has no vault address.');
			// Law 54's time: every note as it stands at this moment is in the vault once the run below
			// returns -- the owner's commit refuses a folder that changed after the engine's snapshot, and
			// the published head is read back before synchronize resolves -- so the backup is dated here,
			// never at the run's end, which would claim the edits made while it ran.
			const held = key, since = now();
			announce('syncing', 'syncing both devices’ changes…');
			try {
				const result = await withTransport(connection.target, ticket, async tr => {
					// Header custody is also immutable and read back before the first head can exist.
					await putVerified(tr, 'keys/' + connection.target.headerHash, connection.bytes); active(ticket);
					// The adapter asks after every owner lease it waited for and at each write-plan handoff,
					// so a Lock that lands while this sync is queued refuses the unhanded work.
					const store = createOwnerSyncStore({folder, personal, label, deviceId: local.deviceId || folder.deviceId,
						assertActive: () => active(ticket)});
					return synchronize(tr, store, {vdk: held});
				});
				active(ticket);
				if (Array.isArray(result.devices)) devices = Object.freeze(result.devices.map(row => Object.freeze({device: row.device, writer: row.writer ?? null, label: row.label ?? null})));
				// Kept in the folder's own sync state, beside the checkpoint it dates. A record that fails
				// leaves the last time that was kept: it can understate the backup, never claim one.
				try {
					if (result.caughtUp !== false && !result.skipped?.length) {
						await updateSyncState(folder, current => current.head && !(current.backedUpAt >= since) ? {...current, backedUpAt: since} : null);
						backedUpAt = Math.max(backedUpAt || 0, since);
					}
				} catch {}
				announce('ready', result.skipped?.length ? 'Too large to sync: ' + result.skipped.join(', ') + '; these files and their linked notes stay here while the rest syncs.' : (result.caughtUp !== false && (result.caughtUp || result.unchanged)) ? 'sync complete. back up too: sync is not a backup.' : 'changes synced. edits made since go with the next sync.');
				return result;
			} catch (error) { if (ticket === epoch) announce('ready', 'sync did not finish. your notes, and what waits to upload, are kept.'); throw error; }
		}); },
		async conflicts() {
			const snapshot = await folder.read();
			const entries = [];
			for (const conflict of snapshot.index.conflicts || []) {
				if (conflict.path?.[0] !== 'notes' || conflict.path[2] !== 'text' || typeof conflict.blockHash !== 'string' || !Array.isArray(conflict.variants)) continue;
				const id = conflict.path[1], file = Object.keys(snapshot.index.notes).find(name => snapshot.index.notes[name].id === id);
				if (!file) continue;
				const read = await folder.read({bodies: [file]}), bytes = read.bodies.get(file);
				if (!bytes) continue;
				const text = td.decode(bytes);
				for (const inspected of inspectTextConflicts(text)) {
					if (text.indexOf(inspected.block) !== text.lastIndexOf(inspected.block)) continue;
					const compact = await conflictDigests(inspected);
					if (compact.blockHash !== conflict.blockHash || !same(compact.variants, conflict.variants)) continue;
					entries.push({file, id, digest: await contentHash(text), conflict: {...inspected, path: conflict.path, blockHash: compact.blockHash}});
				}
			}
			return entries;
		},
		resolve({file, id, digest, conflict, device, variant}) { return run(async ticket => {
			// Choices come from a just-inspected durable ledger, never from parsing a Markdown marker.
			const lease = await folder.owner.acquire(folder.scope);
			try {
				const result = await lease.transact(async ({index, bodies}) => {
					active(ticket);
					const bytes = bodies.get(file), text = bytes && td.decode(bytes);
					if (text == null || index.notes[file]?.id !== id || await contentHash(text) !== digest) throw fail('merge_stale', 'this note changed: read both versions again before choosing.');
					const inspected = inspectTextConflicts(text).find(row => row.start === conflict.start && row.end === conflict.end && row.block === conflict.block);
					if (!inspected || text.indexOf(inspected.block) !== text.lastIndexOf(inspected.block) || !same(inspected.variants, conflict.variants)) throw fail('merge_stale', 'read the current versions again before choosing.');
					const compact = await conflictDigests(inspected);
					const kept = (index.conflicts || []).find(row => row.path?.[0] === 'notes' && row.path[1] === id && row.path[2] === 'text' && row.blockHash === compact.blockHash && same(row.variants, compact.variants));
					if (!kept) throw fail('merge_stale', 'this conflict is no longer in the folder.');
					const next = resolveTextConflict(text, inspected, variant ?? device);
					active(ticket);
					index.notes[file] = {...index.notes[file], revision: 'sha256:' + await contentHash(next), modified: now()};
					index.conflicts = index.conflicts.filter(row => row !== kept);
					// The digest above awaited: a Lock during it must still keep the inspected conflict.
					active(ticket);
					return {kind: 'sync-choice', index, writes: [{file, bytes: te.encode(next), expectedDigest: digest}]};
				}, {bodies: [file]});
				if (result.dropped?.includes(file)) throw fail('merge_stale', 'this note changed while your choice was saved: read both versions again.');
				announce(stage, 'your choice is saved. if the note is open, reopen it to read the choice.');
				return result;
			} finally { await lease.release(); }
		}); },
		lock() { return lockVault(); },
		forgetKey() { return forgetKey(); },
		signOut() {
			if (mode === 'r2-key') return forgetKey();
			// The companion holds the storage's authority; the page has none to revoke, and locks.
			if (mode === 'companion') return lockVault();
			return revokeGrant();
		},
	});
}
