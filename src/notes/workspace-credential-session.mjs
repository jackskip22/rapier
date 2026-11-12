// SPDX-License-Identifier: AGPL-3.0-only
import {createWorkspaceOAuth, workspaceOrigin, workspaceRedirect, workspaceProof, workspaceCallback,
	validateWorkspaceContext, workspaceSignInAvailability, WORKSPACE_SIGNIN_QUALIFICATION} from './workspace-oauth.mjs';
import {createWorkspacePlainStore} from './plain-workspace.mjs';
import {createPlainSession} from './sync-plain-session.mjs';
import {readSyncState, readSyncStateBytes} from './sync-state.mjs';
import {sha256} from './integrity.mjs';
import {untilAbort} from './provider-http.mjs';

const fail = (code, message) => Object.assign(new Error(message), {code});
const tokenString = value => typeof value === 'string' && value.length > 0 && value.length <= 16384 && !/[\x00-\x20\x7f]/.test(value);
const identity = value => JSON.stringify([value.resource, value.issuerOrigin, value.issuer, value.clientId]);
const sameConnection = (a, b) => !!a && !!b && ['provider', 'place', 'connectionId', 'destination'].every(key => a[key] === b[key]);
const publicConnection = value => value ? Object.freeze({provider: value.provider, place: value.place, connectionId: value.connectionId, destination: value.destination}) : null;
const REQUEST_HEADERS = new Set(['authorization', 'content-type', 'if-match', 'if-none-match', 'x-rapier-notes-lease']);

export function createWorkspaceSignInSession({folder = null, fetch: fetchFn, device,
	environment = () => ({url: globalThis.location?.href, native: ['android', 'windows'].includes(globalThis.RapierPlatform?.environment?.id),
		framed: typeof window !== 'undefined' && window.top !== window}), qualification = WORKSPACE_SIGNIN_QUALIFICATION, redirectUri = 'https://rapier.website/notes',
	now = Date.now, random = size => crypto.getRandomValues(new Uint8Array(size)),
	digest = bytes => crypto.subtle.digest('SHA-256', bytes), onChange = () => {}} = {}) {
	if (typeof fetchFn !== 'function') throw fail('config', 'The workspace needs its bounded network owner.');
	let selected = null, context = null, grant = null, pending = null, epoch = 0, stage = 'unselected', notice = '';
	let inspected = false, paused = false, uncertain = false, needsRevoke = false, bound = null;
	let work = null, stopping = null, revoking = null;
	const credentials = new Map(), transports = new Set(), plains = new Set();
	const env = () => typeof environment === 'function' ? environment() : environment;
	const gate = () => workspaceSignInAvailability({environment: env(), qualification});
	const custodyAvailable = () => device && device.available !== false && ['read', 'keep', 'keepRevocation', 'forget'].every(key => typeof device[key] === 'function');
	const busy = () => !!(work || stopping || revoking);
	const status = () => Object.freeze({stage, workspace: selected, issuer: context?.issuer || null,
		authorized: !!grant && !paused && !needsRevoke && !uncertain && (grant.expiresAt > now() + 30000 || !!grant.refreshToken),
		busy: busy(), paused, revocationPending: needsRevoke || uncertain, notice, gate: gate(),
		custodyAvailable: !!custodyAvailable(), connection: publicConnection(bound),
		capabilities: Object.freeze({authority: 'cloudflare-access-managed-oauth', resourceScope: 'workspace-application',
			conditionalDelete: true, requiresDistinctLocalFolder: true, fullHistoryMediaSettingsParity: false})});
	const announce = (next, message = '') => { stage = next; notice = message; onChange(status()); };
	const current = ticket => { if (ticket !== epoch || paused || needsRevoke) throw fail('cancelled', 'Workspace sync stopped. Local work is kept.'); };
	const active = ticket => { current(ticket); if (uncertain) throw fail('cancelled', 'Workspace sync stopped. Local work is kept.'); };
	const ready = () => {
		const facts = gate();
		if (!facts.ready) { announce('unavailable'); throw fail('unavailable', 'Workspace sign-in has not been qualified on this surface.'); }
		if (!custodyAvailable()) throw fail('custody', 'This device cannot safely keep workspace sign-in custody.');
		if (!selected) throw fail('workspace-address', 'Choose the workspace address first.');
		workspaceRedirect(redirectUri, facts.origin);
		return facts;
	};
	const binding = () => {
		let page; try { page = new URL(env().url).origin; } catch { throw fail('config', 'This page has no workspace sign-in origin.'); }
		return JSON.stringify(['cloudflare-access', page, selected]);
	};
	const rowKey = row => JSON.stringify([identity(row.context), row.family, row.hint, row.token]);
	function prune() {
		for (const [key, row] of credentials) if (row.hint === 'access_token' && Number.isSafeInteger(row.expiresAt) && row.expiresAt <= now()) credentials.delete(key);
	}
	function capture(value, owner, family) {
		for (const [token, hint] of [[value.accessToken, 'access_token'], [value.refreshToken, 'refresh_token']]) if (tokenString(token)) {
			const row = {token, hint, context: owner, family, expiresAt: hint === 'access_token' ? value.expiresAt : null};
			credentials.set(rowKey(row), row);
		}
		prune();
	}
	async function save() {
		if (!custodyAvailable()) throw fail('custody', 'This device cannot safely keep workspace sign-in custody.');
		prune();
		try {
			if (needsRevoke) await device.keepRevocation(binding(), [...credentials.values()], {persistCredentials: true, unresolved: uncertain});
			else await device.keep(binding(), {version: 1, context, grant, pending, credentials: [...credentials.values()], uncertain});
		} catch { throw fail('custody', 'Workspace sign-in custody could not be saved. Access was not enabled.'); }
	}
	async function inspectStored() {
		if (inspected || !selected) return;
		if (!custodyAvailable()) throw fail('custody', 'This device cannot safely keep workspace sign-in custody.');
		let restored;
		try { restored = await device.read(binding()); } catch { throw fail('custody', 'Saved workspace sign-in custody could not be read.'); }
		if (restored.enabled === false) throw fail('custody', 'Enable this device’s protected sign-in custody before signing in.');
		const data = restored.data, held = data || restored.retired;
		if (held) {
			if (!Array.isArray(held.credentials) || held.credentials.length > 128) throw fail('custody', 'Saved workspace credentials could not be read.');
			const rows = [];
			for (const row of held.credentials) {
				const owner = validateWorkspaceContext(row?.context);
				if (!owner.clientId || !tokenString(row.token) || !tokenString(row.family) ||
					!['access_token', 'refresh_token'].includes(row.hint) || row.expiresAt !== null && !Number.isSafeInteger(row.expiresAt))
					throw fail('custody', 'Saved workspace credentials could not be read.');
				rows.push({...row, context: owner});
			}
			for (const row of rows) credentials.set(rowKey(row), row);
		}
		inspected = true; prune();
		if (restored.revocationPending || restored.retired && (restored.retired.grant || credentials.size) || data?.uncertain) {
			needsRevoke = true; uncertain = !!(restored.revocationUnresolved || data?.uncertain || restored.revocationPending && !restored.revocationRecoverable);
			paused = true; announce('revocation-pending'); return;
		}
		if (!data) return;
		if (data.version !== 1 || data.context && validateWorkspaceContext(data.context).resource !== selected)
			throw fail('custody', 'The saved sign-in belongs to another workspace.');
		context = data.context && validateWorkspaceContext(data.context);
		if (data.pending) {
			if (!context || identity(data.pending.context) !== identity(context) || data.pending.redirectUri !== redirectUri)
				throw fail('custody', 'The saved sign-in return belongs to another workspace.');
			pending = data.pending; announce('authorizing');
		}
		if (data.grant) {
			if (!context || !tokenString(data.grant.accessToken) || !Number.isSafeInteger(data.grant.expiresAt) ||
				data.grant.resource !== selected || !tokenString(data.grant.family) ||
				data.grant.refreshToken !== null && !tokenString(data.grant.refreshToken))
				throw fail('custody', 'The saved workspace grant could not be read.');
			if (![...credentials.values()].some(row => row.token === data.grant.accessToken && row.family === data.grant.family &&
				row.hint === 'access_token' && identity(row.context) === identity(context)) && data.grant.expiresAt > now())
				throw fail('custody', 'The saved grant is missing its removal custody.');
			if (data.grant.refreshToken && ![...credentials.values()].some(row => row.token === data.grant.refreshToken &&
				row.family === data.grant.family && row.hint === 'refresh_token' && identity(row.context) === identity(context)))
				throw fail('custody', 'The saved refresh grant is missing its removal custody.');
			grant = {...data.grant}; announce('signed-in');
		}
	}
	async function inspect() {
		try { await inspectStored(); }
		catch (error) {
			grant = null; pending = null; paused = true; needsRevoke = true; uncertain = true;
			announce('revocation-pending', 'Saved workspace sign-in needs recovery.');
			throw error;
		}
	}
	function run(action, {network = true, restoreOnly = false} = {}) {
		if (network) ready();
		if (busy()) throw fail('busy', 'Let the workspace operation finish, or pause it.');
		if (needsRevoke || uncertain) throw fail('revoke', 'Remove the previous workspace access before signing in again.');
		const ticket = epoch;
		work = Promise.resolve().then(async () => {
			await inspect();
			if (restoreOnly) { if (ticket !== epoch) throw fail('cancelled', 'Workspace sign-in inspection stopped.'); }
			else active(ticket);
			return action(ticket);
		}).catch(error => {
			if (ticket === epoch && !needsRevoke && !uncertain && !paused) announce('refused', error?.code || 'workspace');
			throw error;
		}).finally(() => { work = null; onChange(status()); });
		onChange(status()); return work;
	}
	function interrupt() {
		epoch++;
		for (const plain of plains) plain.pause();
		for (const store of transports) store.pause();
	}
	async function issue(ticket, operation) {
		active(ticket);
		prune();
		if (credentials.size > 126) throw fail('revoke', 'Sign out to confirm removal of earlier workspace grants before continuing.');
		const previous = grant, owner = context, family = previous?.family || createFamily();
		let attempted = false, received;
		const client = createWorkspaceOAuth({fetch: (url, options) => {
			current(ticket); ready(); attempted = true; return fetchFn(url, options);
		}, now});
		try {
			uncertain = true; await save();
			current(ticket); ready();
			received = await operation(client, value => capture(value, owner, family));
			capture(received, owner, family);
			grant = {...received, family}; uncertain = false;
			await save();
		} catch (error) {
			if (!attempted) {
				uncertain = false; grant = previous;
			} else { grant = null; needsRevoke = credentials.size > 0 || uncertain; paused = needsRevoke; }
			try { await save(); } catch { paused = true; }
			announce(needsRevoke ? 'revocation-pending' : paused ? 'paused' : 'refused', error?.code || 'auth');
			if (!attempted && ticket !== epoch) throw fail('cancelled', 'Workspace sync stopped before new access was requested.');
			throw error;
		} finally { client.pause(); }
		active(ticket); return grant;
	}
	function createFamily() {
		return Array.from(random(16), byte => byte.toString(16).padStart(2, '0')).join('');
	}
	async function authority(ticket) {
		active(ticket); ready();
		if (!grant) throw fail('auth', 'Sign in to the workspace first.');
		if (grant.expiresAt <= now() + 30000) {
			const previous = grant;
			if (!previous.refreshToken) throw fail('auth', 'Workspace sign-in expired. Sign in again.');
			await issue(ticket, (client, capture) => client.refresh(context, previous, capture));
		}
		active(ticket); return grant.accessToken;
	}
	function dataFetch(ticket) {
		return async (value, options = {}) => {
			const target = new URL(value), headers = new Headers(options.headers), method = options.method || 'GET';
			let release = false;
			if (target.pathname === '/workspace/lease' && method === 'POST' && typeof options.body === 'string' && options.body.length <= 4096) {
				try { const body = JSON.parse(options.body); release = body.action === 'release' && body.name === 'rapier-notes:notes' &&
					typeof body.id === 'string' && body.id.length <= 256 && Object.keys(body).length === 3; } catch {}
			}
			if (!release) active(ticket);
			if (target.origin !== selected || target.username || target.password || target.hash ||
				!(target.pathname === '/workspace/files' && ['GET', 'HEAD', 'PUT', 'DELETE'].includes(method) ||
					target.pathname === '/workspace/lease' && method === 'POST') ||
				[...headers.keys()].some(key => !REQUEST_HEADERS.has(key) || key === 'authorization'))
				throw fail('connection', 'The request is outside this workspace plain-files connection.');
			const accessToken = release ? grant?.accessToken : await authority(ticket);
			if (!tokenString(accessToken)) throw fail('auth', 'Workspace access is no longer available.');
			headers.set('Authorization', 'Bearer ' + accessToken);
			if (!release) active(ticket);
			const send = async () => {
				let response;
				try { response = await fetchFn(target.href, {...options, method, headers, credentials: 'omit', redirect: 'error',
					cache: 'no-store', referrerPolicy: 'no-referrer'}); }
				catch { throw Object.assign(fail('network', 'The workspace request failed; its outcome is unconfirmed.'), {unconfirmed: true}); }
				if (options.signal?.aborted) { try { void response.body?.cancel().catch(() => {}); } catch {} }
				return response;
			};
			const response = options.signal ? await untilAbort(options.signal, send) : await send();
			try { if (!release) active(ticket); if (response.redirected || response.type === 'opaqueredirect' || response.url && response.url !== target.href) throw fail('connection', 'The workspace redirected the file request.'); }
			catch (error) { await response.body?.cancel().catch(() => {}); throw error; }
			return response;
		};
	}
	async function plainRun(ticket, action, connect = false) {
		if (!folder?.owner) throw fail('config', 'Choose a distinct local Notes folder first.');
		if (folder.store?.workspaceIdentity?.namespace === 'notes/' && folder.store.workspaceIdentity.origin === selected)
			throw fail('same-destination', 'These notes already use this workspace.');
		await authority(ticket); active(ticket);
		const store = createWorkspacePlainStore({endpoint: selected, fetch: dataFetch(ticket), authorizedFetch: true});
		transports.add(store); let plain;
		try {
			const destination = await sha256(JSON.stringify(['workspace', selected])); active(ticket);
			const kept = (await readSyncStateBytes(folder.store)).state.plain; active(ticket);
			if (kept && (kept.provider !== 'workspace' || kept.place !== selected || kept.destination !== destination || bound && !sameConnection(kept, bound)))
				throw fail('connection', 'This folder is connected to another destination.');
			if (!connect && !kept) throw fail('connection', 'Connect the local folder first.');
			plain = createPlainSession({folder, store, provider: 'workspace', place: selected, destination, cards: false,
				device: folder.deviceId && folder.deviceId !== 'files' ? folder.deviceId : 'rapier',
				connectionId: kept?.connectionId, now, guard: () => active(ticket)});
			plains.add(plain); announce('syncing');
			const result = await action(plain); active(ticket);
			bound = (await readSyncState(folder)).plain; active(ticket);
			announce('signed-in'); return result;
		} finally { plain?.pause(); plains.delete(plain); store.pause(); transports.delete(store); }
	}
	function pause() {
		interrupt(); paused = true;
		if (stopping) return stopping;
		stopping = (async () => { try { await work; } catch {} if (!needsRevoke && !revoking) announce('paused'); return status(); })()
			.finally(() => { stopping = null; onChange(status()); });
		return stopping;
	}
	function signOut() {
		if (!selected) return Promise.resolve({revoked: true});
		interrupt(); paused = true; needsRevoke = true;
		if (revoking) return revoking;
		announce('revoking');
		revoking = (async () => {
			try { await work; } catch {}
			try { await stopping; } catch {}
			await inspect(); pending = null; grant = null; await save();
			for (const [key, row] of [...credentials].sort((a, b) => (a[1].hint === 'refresh_token' ? -1 : 1) - (b[1].hint === 'refresh_token' ? -1 : 1))) {
				const client = createWorkspaceOAuth({fetch: fetchFn, now});
				try { await client.revoke(row.context, row); credentials.delete(key); await save(); } catch {} finally { client.pause(); }
			}
			if (credentials.size || uncertain) {
				await save(); announce('revocation-pending', 'Local sync stopped. Cloudflare access removal is not fully confirmed.');
				return {revoked: false, actionRequired: uncertain};
			}
			try { await device.forget(); } catch { announce('revocation-pending'); throw fail('custody', 'The local removal record could not be saved.'); }
			needsRevoke = false; paused = false;
			await save(); announce(selected ? 'selected' : 'unselected');
			return {revoked: true};
		})().finally(() => { revoking = null; onChange(status()); });
		return revoking;
	}
	return Object.freeze({
		status,
		async selectWorkspace(origin) {
			const next = workspaceOrigin(origin);
			if (next === selected) return status();
			if (busy()) throw fail('busy', 'Let the workspace operation finish, or pause it before changing the address.');
			if (grant || pending || credentials.size || needsRevoke || uncertain) throw fail('connection', 'Sign out of the selected workspace before changing its address.');
			interrupt(); selected = next; context = null; inspected = false; paused = false; bound = null;
			announce('selected');
			if (custodyAvailable()) return run(async () => status(), {network: false, restoreOnly: true});
			return status();
		},
		inspect: () => run(async () => status(), {network: false}),
		signIn: () => run(async ticket => {
			if (grant || pending) throw fail('auth', 'This device already has a workspace sign-in. Finish it or sign out.');
			announce('discovering'); const client = createWorkspaceOAuth({fetch: fetchFn, now});
			try {
				if (!context?.clientId) {
					context = await client.discover(selected); active(ticket);
					context = await client.register(context, redirectUri); active(ticket);
				}
				const proof = await workspaceProof(context, {redirectUri, random, digest, now}); active(ticket);
				pending = proof.pending; await save(); active(ticket);
				announce('authorizing'); return Object.freeze({url: proof.url, expiresAt: pending.at + 600000});
			} finally { client.pause(); }
		}),
		finishSignIn: callbackUrl => run(async ticket => {
			if (!pending || !context || identity(pending.context) !== identity(context)) throw fail('state', 'There is no pending workspace sign-in.');
			const proof = pending; let code;
			try { code = workspaceCallback(callbackUrl, proof, now()); }
			catch (error) { if (error?.code === 'denied') { pending = null; await save(); } throw error; }
			pending = null; await save(); active(ticket);
			await issue(ticket, (client, capture) => client.exchange(context, {code, verifier: proof.verifier, redirectUri, capture}));
			announce('signed-in'); return status();
		}),
		plainConnect: () => run(ticket => plainRun(ticket, async plain => { await plain.connect(); active(ticket); return plain.syncNow(); }, true)),
		plainSyncNow: () => run(ticket => plainRun(ticket, plain => plain.syncNow())),
		conflicts: () => run(ticket => plainRun(ticket, plain => plain.conflicts())),
		resolve: choice => run(ticket => plainRun(ticket, plain => plain.resolve(choice))),
		plainForget: () => run(ticket => plainRun(ticket, plain => plain.forget({connectionId: bound?.connectionId}))),
		pause,
		async resume() {
			if (busy()) throw fail('busy', 'Let the paused operation finish.');
			if (needsRevoke || uncertain) throw fail('revoke', 'Complete access removal first.');
			paused = false;
			return run(async ticket => {
				if (grant) { await authority(ticket); announce('signed-in'); }
				else announce(pending ? 'authorizing' : selected ? 'selected' : 'unselected');
				return status();
			});
		},
		signOut,
	});
}
