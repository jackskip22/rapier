const _rapierNotesSyncUi = (() => {
	let session = null, initializing = null, overlay = null, body = null, visible = false, view = 0;
	let accounts = null, selectedAccount = null, cloudStorage = null, activation = false, newVault = false;
	let automatic = false, timer = null, syncing = false;
	let message = '', recovery = null, conflicts = null, joined = false, setup = null, route = null, acting = false, joinCode = '', replacing = false, rekeying = false;
	let intakeJoin = false, drawnCode = null;
	let others = false, providerId = null, providerDraft = {};
	let layout = null, plainKept = null, plainPlace = 'Rapier Notes';
	let keyId = null, keySession = null, keyState = null, keyDraft = {};
	const joinReturnKey = () => 'rapier:sync:join-return' + RapierStorage.scope;
	const api = () => globalThis.RapierNotesSyncSession;
	const platformId = () => globalThis.RapierPlatform?.environment.id;
	const environment = () => ({url: location.href, native: ['android', 'windows'].includes(platformId()), framed: window.top !== window});
	const oauthGate = () => api()?.syncAvailability(environment()) || {ready: false, reason: 'cloudflare sync did not load. backup saves your notes to a file.'};
	const keyGate = () => api()?.r2KeyAvailability(environment()) || {ready: false, reason: oauthGate().reason};
	const providerGate = () => api()?.providerGate(providerId, environment()) || {ready: false, reason: oauthGate().reason};
	const signsIn = id => !!api()?.providerUsesSignIn(id);
	const labelOf = id => api()?.PROVIDERS?.[id]?.label || String(id);
	const providerPendingKey = () => 'rapier:provider:pending' + RapierStorage.scope;
	const COMPANION_ABSENT = Object.freeze({
		absent: 'Rapier Sync is coming soon. Use BACKUP for now.',
		impostor: 'An app using Rapier Sync\'s name is installed, but it is not signed by Rapier\'s certificate. Rapier will not open it.',
		unsigned: 'The Rapier Sync on this phone has no readable signature, so Rapier cannot tell whether it is the real one. It was not opened.'});
	const COMPANION_ABSENT_LISTED = Object.freeze({
		absent: 'Rapier Sync is not installed. Get it on Google Play. Until then, use BACKUP.',
		impostor: COMPANION_ABSENT.impostor + ' Remove that app, then install Rapier Sync from Google Play.',
		unsigned: COMPANION_ABSENT.unsigned});
	const COMPANION_UNAPPROVED = 'open rapier sync and approve this vault’s storage; nothing was sent.';
	const PRO_REQUIRED = 'Rapier Pro is required to sync your notes.';
	const proRefusal = error => error?.code === 'pro_required' || /\(PRO_REQUIRED\)$/.test(String(error?.message || ''));
	let companion = null;
	let plainCompanion = null, companionPlaces = null;
	const plainThroughCompanion = () => plainCompanion ||= api().createPlainCompanionSession({folder: _rapierNotesStore.folder, call: (operation, args) => companionSeam().syncTransport(operation, args)});
	const companionSeam = () => { try { const host = globalThis.RapierPlatform?.host; return typeof host?.syncTransport === 'function' ? host : null; } catch (_) { return null; } };
	const companionGate = () => companion?.state === 'ready' && companionSeam() ? {ready: true, reason: ''}
		: {ready: false, reason: (companion?.listing ? COMPANION_ABSENT_LISTED : COMPANION_ABSENT)[companion?.state] || (companion?.listing ? COMPANION_ABSENT_LISTED : COMPANION_ABSENT).absent};
	const companionVaultId = state => { try { return state?.address ? api().readConnectionCode(state.address).vaultId || null : null; } catch (_) { return null; } };
	async function askCompanion(vault = null) {
		let answer = null;
		try { answer = await companionSeam()?.syncTransport('status', vault ? {vault} : {}); }
		catch (error) { if (proRefusal(error)) message = PRO_REQUIRED; }
		const read = !!answer && typeof answer === 'object' && (answer.state === 'ready' || Object.hasOwn(COMPANION_ABSENT, answer.state)) &&
			typeof answer.listing === 'boolean' && typeof answer.ready === 'boolean' ? answer : null;
		if (!vault) companion = read ? {state: read.state, listing: read.listing, approved: null} : {state: 'absent', listing: false, approved: null};
		if (!vault && companion.state === 'ready') { try { await _rapierNotesReady(); companionPlaces = await plainThroughCompanion().places(); } catch (_) { companionPlaces = null; } }
		else if (companion) companion = {...companion, approved: read?.state === 'ready' ? read.ready : null};
	}
	async function askCompanionVault() {
		const address = session?.status().address;
		let vault = null;
		try { vault = address ? api().readConnectionCode(address).vaultId : null; } catch (_) {}
		if (vault && companion?.state === 'ready') await askCompanion(vault);
	}
	function openCompanion() { if (typeof _rapierUiSyncOpen === 'function') _rapierUiSyncOpen(companionVaultId(session?.status()) || null); }
	function deviceLabel() {
		const agent = String(navigator.userAgent || '');
		if (platformId() === 'android') return /Mobile/.test(agent) ? 'Android phone' : 'Android tablet';
		if (platformId() === 'windows') return 'Windows';
		const system = /iPhone/.test(agent) ? 'iPhone' : /iPad/.test(agent) || /Macintosh/.test(agent) && navigator.maxTouchPoints > 1 ? 'iPad'
			: /Android/.test(agent) ? 'Android' : /CrOS/.test(agent) ? 'ChromeOS' : /Windows/.test(agent) ? 'Windows' : /Mac OS X|Macintosh/.test(agent) ? 'Mac' : /Linux/.test(agent) ? 'Linux' : '';
		const browser = /Edg(?:e|A|iOS)?\//.test(agent) ? 'Edge' : /OPR\/|Opera/.test(agent) ? 'Opera' : /Firefox\/|FxiOS\//.test(agent) ? 'Firefox'
			: /Chrome\/|CriOS\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : '';
		return [system, browser].filter(Boolean).join(', ') || null;
	}
	const deviceNamed = device => status().devices?.find(row => row.device === device)?.label || device;
	const writerNamed = writer => status().devices?.find(row => row.writer === writer)?.label || null;
	const mode = () => session?.status().mode || route || (platformId() === 'android' ? 'companion' : 'oauth');
	const availability = () => mode() === 'companion' ? companionGate() : mode() === 'r2-key' ? keyGate() : mode() === 'provider' ? providerGate() : oauthGate();
	const status = () => session?.status() || {authorized: false, unlocked: false, busy: false, gate: availability()};
	function pendingWords(pending) {
		if (!pending) return 'sends and receives changes; a conflict holds both versions for you';
		const describe = counts => {
			const parts = [['notes', 'note'], ['pictures', 'picture'], ['recordings', 'recording'], ['files', 'file']]
				.filter(([name]) => counts[name]).map(([name, word]) => counts[name] + ' ' + word + (counts[name] === 1 ? '' : 's'));
			return parts.length ? parts.join(', ') + ' (' + (counts.bytes === null ? 'size unavailable' : api().attachmentSizeWords(counts.bytes)) + ')' : 'no new content';
		};
		return 'send ' + describe(pending.upload) + '; receive ' + describe(pending.download) + '. a conflict holds both versions for you';
	}
	function node(tag, className, text) {
		const el = document.createElement(tag);
		if (className) el.className = className;
		if (text != null) el.textContent = text;
		return el;
	}
	function paragraph(text) { if (text && text === message) return; body.append(node('p', 'export-choice__description', text)); }
	function value(label, text) {
		paragraph(label);
		const el = node('textarea', 'navigator-outline-filter');
		el.value = text; el.readOnly = true; el.rows = 3; el.setAttribute('aria-label', label);
		body.append(el);
		if (typeof text === 'string' && text.startsWith('rapier-vault:')) deviceQR(text);
		return el;
	}
	function deviceQR(address) {
		try {
			if (drawnCode?.address !== address) drawnCode = {address, ...api().qrDrawing(api().encodeQR(api().connectionLink(address)))};
			const {size, path} = drawnCode, ns = 'http://www.w3.org/2000/svg';
			const svg = document.createElementNS(ns, 'svg'), paper = document.createElementNS(ns, 'rect'), ink = document.createElementNS(ns, 'path');
			svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'device code');
			svg.setAttribute('width', size * 4); svg.setAttribute('height', size * 4); svg.setAttribute('shape-rendering', 'crispEdges');
			svg.style.maxWidth = '100%'; svg.style.height = 'auto'; svg.style.display = 'block';
			paper.setAttribute('width', size); paper.setAttribute('height', size); paper.setAttribute('fill', '#fff');
			ink.setAttribute('d', path); ink.setAttribute('fill', '#000'); svg.append(paper, ink); body.append(svg);
		} catch (error) { paragraph(error?.code === 'qr-capacity' ? error.message : 'the qr code could not be made; select and copy the device code above.'); }
	}
	function input(label, {secret = false, value: initial = ''} = {}) {
		const row = node('label', 'export-choice');
		row.append(node('span', 'export-choice__label', label));
		const field = node('input', 'navigator-outline-filter');
		field.type = secret ? 'password' : 'text'; field.value = initial;
		field.autocomplete = 'off'; field.spellcheck = false;
		field.setAttribute('autocapitalize', 'none'); row.append(field); body.append(row);
		return field;
	}
	function jurisdiction(initial = 'default') {
		const row = node('label', 'export-choice');
		row.append(node('span', 'export-choice__label', 'jurisdiction'));
		const field = node('select', 'navigator-outline-filter');
		for (const [value, label] of [['default', 'default'], ['eu', 'EU'], ['us', 'US'], ['fedramp', 'FedRAMP']]) {
			const option = node('option', '', label); option.value = value; field.append(option);
		}
		field.value = initial; row.append(field); body.append(row); return field;
	}
	const WAITS = {'sync now': 'Syncing notes', 'connect existing vault': 'Unlocking notes', 'use recovery code': 'Unlocking notes',
		'use a recovery code instead': 'Unlocking notes', 'protect my notes': 'Protecting notes', 'check and connect': 'Connecting', 'sign out and revoke': 'Signing out',
		'connect plain files': 'Connecting', 'save new passphrase': 'Protecting notes'};
	let progress = null;
	function choice(label, description, action, {enabled = !status().busy && !acting, cloudflare = false, key = null} = {}) {
		const button = node('button', 'export-choice' + (cloudflare ? ' rapier-cloudflare' : '')); button.type = 'button'; button.disabled = !enabled;
		if (key) button.dataset.syncKey = key;
		button.append(node('span', 'export-choice__label', label)); if (description) button.append(node('span', 'export-choice__description', description));
		button.addEventListener('click', () => { button.disabled = true; void perform(action, true, WAITS[label]); }); body.append(button);
	}
	const wearBox = () => { if (typeof _rapierNotesSyncBoxWear === 'function') _rapierNotesSyncBoxWear(); };
	const NEWER = 'update Rapier to sync this folder.';
	const said = (error, otherwise) => proRefusal(error) ? PRO_REQUIRED : error?.code === 'newer' ? NEWER : String(error?.message || otherwise);
	async function perform(action, clear = true, words = '') {
		if (clear) message = ''; acting = true;
		const popup = words && overlay ? (progress ||= _rapierProgressOver(overlay)).open({label: words, after: 500}) : null;
		try { const result = action(); paint(); await result; }
		catch (error) { if (visible) message = said(error, 'that did not finish; your notes are unchanged.'); }
		finally { popup?.end(); acting = false; paint(); renderSettings(); wearBox(); }
	}
	async function owner() {
		if (session) return session;
		if (initializing) return initializing;
		initializing = (async () => {
			await _rapierNotesReady(); await _rapierNotesStore.kind();
			const kept = await api().readSyncState(_rapierNotesStore.folder), saved = kept.vault;
			if (saved?.mode) route = saved.mode;
			if (saved?.mode === 'provider') providerId = saved.provider;
			plainKept = kept.plain ? {provider: kept.plain.provider, place: kept.plain.place} : null;
			if (plainKept && !saved && plainKept.provider !== 'companion' && !(api().KEY_PLAIN_PROVIDERS || []).includes(plainKept.provider)) { route = 'provider'; providerId = plainKept.provider; }
			const gate = availability(); if (!gate.ready) throw new Error(gate.reason);
			const opened = api().createSyncSession({folder: _rapierNotesStore.folder, personal: _rapierPersonal, mode: mode(),
				fetch: window.fetch.bind(window), pendingStorage: sessionStorage,
				device: api().createRememberedDevice({storage: api().createDeviceStorage({scope: RapierStorage.scope})}),
				pendingKey: mode() === 'provider' ? providerPendingKey() : 'rapier:cloudflare:pending' + RapierStorage.scope, environment: environment(), label: deviceLabel(),
				...(mode() === 'provider' ? {provider: providerId} : {}),
				...(mode() === 'companion' ? {companion: {call: (operation, args) => companionSeam().syncTransport(operation, args)}} : {}),
				onChange: () => { paint(); renderSettings(); wearBox(); if (session && !status().unlocked) { automatic = false; clearTimeout(timer); } }});
			await opened.inspect(); session = opened; if (!intakeJoin && status().backedUpAt && status().authorized && status().unlocked) { automatic = true; schedule(1600); } return opened;
		})().finally(() => { initializing = null; });
		return initializing;
	}
	async function flush(leaving = false) {
		const stamp = await _rapierNotesFlush();
		if (leaving) {
			if (['memory', 'fault'].includes(await _rapierNotesStorageKind())) throw new Error('this page cannot hold your notes through a sign-in: use backup first.');
			if (!(_rapierNotes.current && _rapierNotes.current === rapier.document.filename) && _rapierIsDirty()) throw new Error('save the document you are editing before you sign in.');
		}
		if (!_rapierMutationStampIsCurrent(stamp)) throw new Error('your document changed meanwhile, so nothing was replaced: try again.');
		return stamp;
	}
	function clearBody() {
		if (!body) return;
		for (const field of body.querySelectorAll('input[type="password"], textarea')) field.value = '';
		body.replaceChildren();
	}
	function close() {
		view++;
		if (setup || !status().hasConnection || mode() === 'r2-key' && !status().credentialStored) {
			void session?.cancelSetup?.().then(state => { if (state.revocationPending) showToast(state.notice, 'error'); })
				.catch(error => showToast(String(error?.message || error), 'error'));
		}
		visible = false; recovery = null; conflicts = null; setup = null; joinCode = ''; replacing = false; rekeying = false; message = ''; intakeJoin = false; drawnCode = null;
		if (mode() === 'provider' && !status().hasConnection && !status().authorized) { route = null; providerId = null; session = null; }
		others = false; providerDraft = {}; layout = null; keyDraft = {};
		if (!keyState?.connection) keyId = null;
		progress?.release(); clearBody(); if (overlay) closeDialog(overlay); wearBox();
	}
	function paint() {
		if (!visible || !body) return;
		clearBody();
		const gate = availability(), state = status();
		if (message) { const p = node('p', 'export-choice__description', message); p.setAttribute('role', 'alert'); body.append(p); }
		if (intakeJoin) {
			if (!gate.ready && (mode() !== 'companion' || platformId() !== 'android' || companion)) paragraph(gate.reason);
			paintKeySetup(state);
			if (mode() === 'oauth' && !state.authorized) choice('sign in with cloudflare', 'then unlock the device code here', startSignIn, {enabled: gate.ready && !acting && !state.busy, cloudflare: true});
			if (mode() === 'provider' && signsIn(providerId) && !state.authorized) choice('sign in with ' + labelOf(providerId), 'then unlock the device code here', startSignIn, {enabled: gate.ready && !acting && !state.busy, key: 'provider:' + providerId});
			return;
		}
		if (mode() === 'companion' && !companion) {
			const loading = node('p', 'export-choice__description', 'Opening sync settings.');
			loading.setAttribute('role', 'status'); body.append(loading); return;
		}
		if (keyId && mode() !== 'companion') { paintKeyPlain(); return; }
		if (others && !providerId && mode() !== 'companion') { paintOtherList(); return; }
		if (mode() === 'provider' && !recovery && providerSetupView(state)) return;
		if (!gate.ready) {
			paragraph(gate.reason);
			if (mode() === 'companion') {
				if (companion.listing) choice('rapier sync', 'get it from google play', openCompanion, {enabled: !acting});
				choice('backup', 'save all your notes to one file', async () => { close(); await _rapierNotesBackup(); }, {enabled: true});
				return;
			}
			if (mode() === 'oauth') { choice('sign in with cloudflare', 'available soon', () => { showToast(gate.reason, 'info'); }, {enabled: !acting, cloudflare: true, key: 'cloudflare'}); paintOtherButton(state); }
			paragraph('your notes stay on this device.');
			if (mode() === 'oauth' && keyGate().ready) {
				choice('advanced: use a storage key', 'connect an existing r2 bucket yourself', async () => { session = null; route = 'r2-key'; await owner(); }, {enabled: !acting});
				return;
			}
			choice('backup', 'save all your notes to one file', async () => { close(); await _rapierNotesBackup(); }, {enabled: true});
			return;
		}
		if (!session && acting) {
			const loading = node('p', 'export-choice__description', 'Opening sync settings.');
			loading.setAttribute('role', 'status'); body.append(loading); return;
		}
		if (state.notice) { const p = node('p', 'export-choice__description', state.notice); p.setAttribute('role', 'status'); body.append(p); }
		const limits = node('details', 'export-choice__description');
		limits.append(node('summary', '', 'storage and backups'),
			node('p', '', 'rapier keeps every encrypted version in your storage. deleting a note here does not erase those online copies; your provider can remove them.'),
			node('p', '', 'sync can only check the versions your storage returns. it cannot detect newer work it has never seen. keep a separate backup.'));
		body.append(limits);
		if (mode() === 'companion' && state.hasConnection && companion.approved === false && message !== COMPANION_UNAPPROVED) paragraph(COMPANION_UNAPPROVED);
		if (state.revocationPending) {
			choice('retry removing access', 'sync stays stopped until cloudflare confirms', () => session.signOut());
			paragraph('closing this page does not remove rapier’s access: first remove it under manage oauth authorizations in cloudflare.');
			return;
		}
		if (state.rememberAvailable) {
			const row = node('label', 'export-choice'), field = node('input');
			field.type = 'checkbox'; field.checked = state.rememberDevice; field.disabled = state.busy || acting;
			field.addEventListener('change', () => { const checked = field.checked; void perform(() => session.setRememberDevice(checked)); });
			row.append(field, node('span', 'export-choice__label', 'remember this device')); body.append(row);
		}
		if (mode() === 'oauth' && !state.authorized) {
			paragraph(api().SYNC_CONSENT);
			paragraph('rapier sets up private storage for your notes. you choose a passphrase to keep the online copy encrypted.');
			choice('sign in with cloudflare', 'continue to cloudflare', startSignIn, {cloudflare: true, key: 'cloudflare'});
			paintOtherButton(state);
			if (keyGate().ready && !state.hasConnection && !state.rejoinRequired) choice('advanced: use a storage key', 'connects only the r2 bucket you choose', async () => { session = null; route = 'r2-key'; await owner(); });
			paintVaultChoices(state);
			return;
		}
		if (rekeying && state.unlocked && state.hasConnection) { paintRekey(); paintVaultChoices(state); return; }
		if (mode() === 'provider' && replacing) { paintProviderForm(providerId, {replace: true}); paintVaultChoices(state); return; }
		if (mode() === 'r2-key' && replacing) {
			paintKeyReplacement(state); paintVaultChoices(state);
			return;
		}
		if (mode() === 'r2-key' && (!state.credentialStored || joined || state.rejoinRequired)) {
			paintKeySetup(state); paintVaultChoices(state);
			return;
		}
		if (mode() === 'companion' && !state.hasConnection && !state.rejoinRequired && !joined && paintCompanionPlain()) return;
		if (mode() === 'companion' && (!state.hasConnection || state.rejoinRequired)) {
			paintCompanionSetup(state); paintVaultChoices(state);
			choice('rapier sync', 'opens rapier sync; it holds your storage and its status', openCompanion, {enabled: true});
			return;
		}
		if (recovery) {
			paragraph('this code unlocks the vault: save it outside rapier, never in a note, and share it with no one.');
			value('recovery code', recovery.recovery); value('vault address — for your other device', recovery.address);
			choice('sync now', pendingWords(state.pending) + '; i have saved the recovery code outside rapier', async () => { recovery = null; await connectAndSync(); }, {key: 'sync'});
		} else if (!state.hasConnection && !state.address || state.rejoinRequired) {
			if (joined || state.rejoinRequired) {
				const address = input('vault address from your other device'), secret = input('vault passphrase', {secret: true});
				choice('connect existing vault', 'it unlocks here, never at cloudflare', async () => {
					const parameters = {address: address.value, secret: secret.value}; secret.value = '';
					try { await session.join(parameters); joined = false; } finally { parameters.secret = ''; }
				});
				choice('use a recovery code instead', 'the recovery code stays in this page', async () => {
					const parameters = {address: address.value, secret: secret.value, recovery: true}; secret.value = '';
					try { await session.join(parameters); joined = false; } finally { parameters.secret = ''; }
				});
				choice('create a new vault instead', 'in an r2 bucket of your own', () => { joined = false; });
			} else {
				paintCloudflareSetup();
			}
		} else if (!state.unlocked) {
			const secret = input('vault passphrase or recovery code', {secret: true});
			for (const recover of [false, true]) choice(recover ? 'unlock with recovery code' : 'unlock vault', 'the key never leaves this page', async () => {
				let value = secret.value; secret.value = '';
				try { await session.unlock(value, {recovery: recover}); } finally { value = ''; }
			}, {key: recover ? 'unlock-recovery' : 'unlock'});
		} else {
			paragraph(automatic ? 'sync is on while this page is open and the vault is unlocked.' : 'sync is paused. your notes stay here.');
			value('device code — for your other device', state.address);
			choice('copy device code', 'paste it on your other device, then type the vault passphrase', async () => {
				if (!navigator.clipboard?.writeText) throw new Error('select the device code above and copy it.');
				await navigator.clipboard.writeText(state.address); message = 'device code copied.';
			});
			if (mode() === 'companion' && companion?.approved !== true)
				choice('choose storage', 'opens rapier sync for this vault', openCompanion, {enabled: !acting});
			choice('sync now', pendingWords(state.pending), async () => {
				await connectAndSync(); conflicts = await session.conflicts();
			}, {key: 'sync'});
			choice('review conflicts', 'read both versions and choose one', async () => { conflicts = await session.conflicts(); });
			choice('change passphrase', 'the same vault and notes; your other devices need the new device code', () => { rekeying = true; joined = false; replacing = false; }, {key: 'rekey'});
			if (conflicts) {
				paragraph(conflicts.length ? 'read both before you choose; the vault still holds the originals.' : 'nothing to choose here. conflicts edited by hand, or in a note’s details, stay in the note: open it in the editor.');
				for (const row of conflicts) {
					paragraph(row.file);
					for (const [index, variant] of row.conflict.variants.entries()) {
						paragraph('version from ' + deviceNamed(variant.device));
						value('version text', variant.text);
						choice('keep this version', 'replaces only these words, unless the note has changed', async () => {
							await flush(); await session.resolve({...row, variant: index});
							await _rapierNotesFolderChanged(); conflicts = await session.conflicts();
						});
					}
				}
			}
			if (replaced.length) {
				paragraph('chosen here, then replaced by another device’s later choice:');
				for (const entry of replaced) choice(entry.key.slice(entry.key.indexOf('/') + 1).replace(/^own\//, '') + (entry.value !== null && typeof entry.value !== 'object' ? ': ' + String(entry.value) : '') +
					(writerNamed(entry.over?.by) ? ' — ' + writerNamed(entry.over.by) : ''),
					'keep mine: it becomes the choice on every device', async () => { await _rapierPersonal.restore(entry); await keptChoices(); });
			}
		}
		paintVaultChoices(state);
		choice('lock vault', 'stops sync here; your notes stay readable', async () => { recovery = null; conflicts = null; await session.lock(); }, {enabled: true});
		if (mode() === 'provider' && !signsIn(providerId)) {
			paragraph('forgetting the settings here does not end their access: change them at your storage. device codes you copied still hold them, encrypted.');
			choice('forget storage settings', 'stops sync here and forgets them; your notes stay', async () => { setup = null; conflicts = null; await session.forgetKey(); }, {enabled: true});
		} else if (mode() === 'r2-key') {
			paragraph('forgetting the key here does not end its access: delete the key in cloudflare. device codes you copied still hold it, encrypted.');
			choice('forget bucket key', 'stops sync here and forgets the key; your notes stay', async () => { setup = null; conflicts = null; await session.forgetKey(); }, {enabled: true});
		} else if (mode() === 'companion') {
			choice('rapier sync', 'opens rapier sync: approve storage, see its status, remove this vault’s storage there', openCompanion, {enabled: true});
			paragraph('leaving this vault here does not remove its storage from rapier sync; do that in the app.');
		}
		else choice('sign out and revoke', 'stops sync and revokes this page’s access; your notes stay', async () => { recovery = null; conflicts = null; await session.signOut(); }, {enabled: true});
	}
	const serviceLabel = id => (api().PROVIDERS?.[id]?.label || api().KEY_PLAIN_LABELS?.[id] || id).toLowerCase();
	function paintCompanionPlain() {
		if (plainKept?.provider === 'companion') {
			paragraph('plain files in the folder rapier sync chose. not private: any app or person with access to that folder can read them.');
			choice('sync now', '', async () => { const run = await plainThroughCompanion().syncNow(); await _rapierNotesFolderChanged(); if (visible) message = plainWords(run); }, {key: 'sync'});
			choice('rapier sync', 'opens rapier sync; it holds the folder and its sign-in or key', openCompanion, {enabled: true});
			choice('stop syncing plain files', 'your notes and the files stay', async () => { await plainThroughCompanion().forget(); plainKept = null; await _rapierNotesFolderChanged(); }, {key: 'plain-forget'});
			return true;
		}
		if (!companionPlaces?.offered) return false;
		if (!layout) { paintLayoutChoice(); return true; }
		if (layout !== 'plain') return false;
		paragraph(api().PLAIN_CHOICES.find(row => row.id === 'plain').detail);
		if (!companionPlaces.places.length) paragraph('choose a folder for plain files in rapier sync first.');
		for (const place of companionPlaces.places) choice(serviceLabel(place.service), 'plain files in the folder rapier sync chose', async () => {
			const run = await plainThroughCompanion().connect(place.id);
			plainKept = {provider: 'companion', place: place.id}; layout = null;
			await _rapierNotesFolderChanged();
			if (visible) message = plainWords(run);
		}, {key: 'plain-place:' + place.id});
		choice('rapier sync', 'opens rapier sync: choose a folder for plain files there', openCompanion, {enabled: true});
		choice('back', '', () => { layout = null; }, {enabled: !acting, key: 'back'});
		return true;
	}
	function paintCompanionSetup(state) {
		if (joined || state.rejoinRequired) {
			paragraph('paste the device code from your other device and unlock it here. nothing here is replaced: sync now keeps both.');
			const address = input('device code from your other device', {value: joinCode}), secret = input('vault passphrase or recovery code', {secret: true});
			for (const recover of [false, true]) choice(recover ? 'connect with recovery code' : 'connect existing vault', 'nothing syncs until you press sync now', async () => {
				const parameters = {address: address.value, secret: secret.value, recovery: recover}; joinCode = address.value; secret.value = '';
				try { await (await owner()).join(parameters); joined = false; joinCode = ''; await askCompanionVault(); } finally { parameters.secret = ''; }
			});
			if (!state.rejoinRequired) choice('create a new vault instead', 'choose a passphrase for a new vault', () => { joined = false; });
			return;
		}
		paragraph('choose a sync passphrase.');
		paragraph('it locks the online copy of your notes, and rapier cannot reset it. use at least 16 characters.');
		const secret = input('new vault passphrase', {secret: true}), repeat = input('repeat passphrase', {secret: true});
		choice('continue', 'next, your recovery code, then your bucket', async () => {
			const parameters = {passphrase: secret.value}, matches = secret.value === repeat.value; secret.value = ''; repeat.value = '';
			try {
				if (!matches) throw new Error('the passphrases do not match.');
				if ([...parameters.passphrase].length < 16) throw new Error('use at least 16 characters.');
				const made = await (await owner()).create(parameters);
				if (visible) recovery = made;
				await askCompanionVault();
			} finally { parameters.passphrase = ''; }
		});
		choice('connect another device’s vault', 'paste its device code and type the passphrase', () => { joined = true; });
	}
	const comingSoon = gate => { showToast(gate.reason, 'info'); };
	function paintOtherButton(state) {
		if (state?.hasConnection || state?.rejoinRequired || mode() === 'companion' || environment().native) return;
		choice('other sync options', '', () => { others = true; }, {enabled: !acting && !status().busy, key: 'other'});
	}
	function paintBack() {
		choice('back', '', () => { providerId = null; route = null; session = null; joined = false; replacing = false; providerDraft = {}; others = true; }, {enabled: !acting, key: 'back'});
	}
	function paintOtherList() {
		for (const id of api().OTHER_PROVIDERS) choice(labelOf(id), '', () => pickProvider(id), {enabled: !acting && !status().busy, key: 'provider:' + id});
		for (const id of (api().KEY_PLAIN_PROVIDERS || []).filter(keyReachable)) choice(api().KEY_PLAIN_LABELS[id].toLowerCase(), 'plain files, not private', async () => { await readKeyPlain(); keyId = id; keyDraft = {}; }, {enabled: !acting && !status().busy, key: 'plain-key:' + id});
		choice('back', '', () => { others = false; }, {enabled: !acting, key: 'back'});
	}
	const relayPossible = () => location.protocol === 'https:' && !environment().native && typeof api().createPlainRelay === 'function';
	function keyReachable(id) {
		if (id === 'r2' || relayPossible()) return true;
		const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '';
		const connect = /(?:^|;)\s*connect-src([^;]*)/.exec(policy)?.[1].trim().split(/\s+/) || [];
		return !policy || connect.includes('https:');
	}
	let relay = null;
	const plainFetch = (url, init) => {
		if (/\.r2\.cloudflarestorage\.com$/.test(new URL(String(url)).hostname) || !relayPossible()) return window.fetch(url, init);
		relay ||= api().createPlainRelay({document, window, origin: location.origin});
		return relay(url, init);
	};
	async function readKeyPlain() {
		await _rapierNotesReady(); await _rapierNotesStore.kind();
		keySession ||= api().createPlainKeySession({folder: _rapierNotesStore.folder, fetch: plainFetch, origin: location.origin,
			device: api().createRememberedDevice({storage: api().createDeviceStorage({scope: RapierStorage.scope + '/plain-keys'})})});
		keyState = await keySession.status();
		if (keyState.connection) keyId = keyState.connection.provider;
		return keyState;
	}
	const KEY_FIELDS = {
		webdav: [['endpoint', 'webdav address'], ['username', 'user name'], ['password', 'app password', true]],
		s3: [['endpoint', 'endpoint'], ['bucket', 'bucket'], ['region', 'region'], ['accessKeyId', 'access key id'], ['secretAccessKey', 'secret access key', true]],
		r2: [['accountId', 'cloudflare account id'], ['bucket', 'r2 bucket'], ['accessKeyId', 'access key id'], ['secretAccessKey', 'secret access key', true]],
	};
	function keyFields(id) {
		const read = {};
		for (const [name, label, secret] of KEY_FIELDS[id]) {
			const el = input(label, {secret: !!secret, value: secret ? '' : keyDraft[name] || ''});
			if (!secret) el.addEventListener('input', () => { keyDraft[name] = el.value; });
			read[name] = el;
		}
		if (id === 'r2') { const el = jurisdiction(keyDraft.jurisdiction || 'default'); el.addEventListener('change', () => { keyDraft.jurisdiction = el.value; }); read.jurisdiction = el; }
		return {values: () => Object.fromEntries(Object.entries(read).map(([name, el]) => [name, el.value])),
			clear: () => { for (const el of Object.values(read)) if (el.type === 'password') el.value = ''; }};
	}
	function keyRemember() {
		if (!keyState?.rememberAvailable) return;
		const row = node('label', 'export-choice'), field = node('input');
		field.type = 'checkbox'; field.checked = keyState.rememberDevice; field.disabled = acting;
		field.addEventListener('change', () => { const checked = field.checked; void perform(async () => { await keySession.setRememberDevice(checked); keyState = await keySession.status(); }); });
		row.append(field, node('span', 'export-choice__label', 'remember this device')); body.append(row);
	}
	function keyAccess(id) {
		if (id === 'webdav') { paragraph('your webdav server must allow requests from ' + location.origin + ' and expose the etag header.'); return; }
		paragraph('add this cors rule in the bucket’s settings, so rapier can reach the files.');
		value('bucket cors rule', JSON.stringify(api().plainCorsRule(location.origin), null, 2));
	}
	function paintKeyPlain() {
		const id = keyId, label = api().KEY_PLAIN_LABELS[id].toLowerCase(), kept = keyState?.connection;
		if (kept && kept.provider === id) {
			paragraph('plain files in ' + kept.place + ' on ' + label + '. not private: any app or person with access to that folder can read them.');
			const fields = keyState.keyHeld ? null : keyFields(id);
			if (fields) paragraph('type the key again: this page does not keep it.');
			keyRemember();
			choice('sync now', '', async () => {
				const settings = fields?.values(); fields?.clear();
				const run = await keySession.syncNow(settings ? {settings} : {});
				keyState = await keySession.status(); await _rapierNotesFolderChanged();
				if (visible) message = plainWords(run);
			}, {key: 'sync'});
			choice('stop syncing plain files', 'your notes and the files stay; this device forgets the key', async () => {
				await keySession.forget(); keyState = await keySession.status(); keyId = null; plainKept = null; await _rapierNotesFolderChanged();
			}, {key: 'plain-forget'});
			return;
		}
		paragraph(api().PLAIN_CHOICES.find(row => row.id === 'plain').detail);
		const fields = keyFields(id), place = input('folder name', {value: plainPlace});
		place.addEventListener('input', () => { plainPlace = place.value; });
		keyAccess(id);
		keyRemember();
		choice('connect plain files', 'checks the storage first; then your notes become files there', async () => {
			const settings = fields.values(); fields.clear();
			const run = await keySession.connect({provider: id, place: place.value, settings});
			keyState = await keySession.status(); keyDraft = {}; await _rapierNotesFolderChanged();
			if (visible) message = plainWords(run);
		}, {key: 'plain-connect'});
		choice('back', '', () => { keyId = null; others = true; }, {enabled: !acting, key: 'back'});
	}
	async function chooseProvider(id) {
		if (providerId !== id || mode() !== 'provider') { session = null; accounts = null; selectedAccount = null; cloudStorage = null; }
		route = 'provider'; providerId = id; others = true; joined = false; replacing = false; setup = null; recovery = null; conflicts = null; providerDraft = {};
	}
	async function pickProvider(id) {
		const gate = api().providerGate(id, environment());
		if (signsIn(id)) {
			if (!gate.ready) { comingSoon(gate); return; }
			await chooseProvider(id); await owner();
			if (!status().authorized) await startSignIn();
			return;
		}
		await chooseProvider(id);
	}
	function providerSetupView(state) {
		const id = providerId, gate = availability();
		if (!id || replacing) return false;
		if (!session && acting && gate.ready) return false;
		const connected = state.hasConnection && state.credentialStored && !state.rejoinRequired;
		if (signsIn(id) && !state.authorized) {
			choice('sign in with ' + labelOf(id), '', () => pickProvider(id), {key: 'provider:' + id});
			if (state.hasConnection) paintVaultChoices(state); else paintBack();
			return true;
		}
		if (connected) return false;
		if (plainKept?.provider === id && !state.hasConnection) { paintPlainKept(id); return true; }
		if (!state.hasConnection && !joined && !state.rejoinRequired && signsIn(id)) {
			if (!layout) { paintLayoutChoice(); paintBack(); return true; }
			if (layout === 'plain') { paintPlainSetup(); return true; }
		}
		if (state.hasConnection && signsIn(id)) return false;
		if (joined || state.rejoinRequired || state.hasConnection) { paintProviderJoin(); if (!state.hasConnection && !state.rejoinRequired) paintBack(); return true; }
		paragraph('choose a sync passphrase.');
		paragraph('it locks the online copy of your notes, and rapier cannot reset it. use at least 16 characters.');
		paintProviderForm(id, {replace: false});
		if (!state.hasConnection) paintBack();
		return true;
	}
	function paintLayoutChoice() {
		paragraph('how should your notes be kept there?');
		for (const row of api().PLAIN_CHOICES) choice(row.label, row.detail, () => { layout = row.id; }, {key: 'layout:' + row.id});
	}
	const plainWords = run => {
		const waiting = (run?.held?.length || 0) + (run?.pictures?.held?.length || 0);
		return (run?.conflicts ? run.conflicts + (run.conflicts === 1 ? ' note has' : ' notes have') + ' both versions to review. ' : '')
			+ (waiting ? waiting + (waiting === 1 ? ' file waits' : ' files wait') + ' for the next sync: it changed in two places at once.' : 'notes and files match.');
	};
	function paintPlainSetup() {
		paragraph('not private: one markdown file per note in this folder. any app or person with access to the folder can read and change them.');
		const place = input('folder name', {value: plainPlace});
		place.addEventListener('input', () => { plainPlace = place.value; });
		choice('connect plain files', '', async () => {
			const run = await (await owner()).plainConnect({place: place.value});
			plainKept = await session.plainConnection(); layout = null;
			await _rapierNotesFolderChanged();
			if (visible) message = plainWords(run);
		}, {key: 'plain-connect'});
		choice('back', '', () => { layout = null; }, {enabled: !acting, key: 'back'});
	}
	function paintPlainKept(id) {
		paragraph('plain files in ' + plainKept.place.replace(/^\//, '') + ' on ' + labelOf(id) + '. not private: any app or person with access to that folder can read them.');
		choice('sync now', '', async () => { const run = await session.plainSyncNow(); await _rapierNotesFolderChanged(); if (visible) message = plainWords(run); }, {key: 'sync'});
		if (id === 'drive' && api().pickerRegistered(api().DRIVE_PICKER)) choice('choose files other apps made', 'in google drive; they sync from then on', async () => {
			const picked = await api().openDrivePicker({facts: session.plainDrivePicker(), registration: api().DRIVE_PICKER, origin: location.origin,
				open: (url, name, features) => window.open(url, name, features), listen: fn => { addEventListener('message', fn); return () => removeEventListener('message', fn); }});
			if (!picked) return;
			const run = await session.plainSyncNow(); await _rapierNotesFolderChanged();
			if (visible) message = plainWords(run);
		}, {key: 'plain-picker'});
		choice('stop syncing plain files', 'your notes and the files stay', async () => { await session.plainForget(); plainKept = null; await _rapierNotesFolderChanged(); }, {key: 'plain-forget'});
	}
	function paintProviderForm(id, {replace}) {
		const draft = providerDraft, read = {};
		const field = (name, label, options) => { const el = input(label, options); el.addEventListener('input', () => { if (!options?.secret) draft[name] = el.value; }); read[name] = el; return el; };
		const secret = replace ? null : input('new vault passphrase', {secret: true}), repeat = replace ? null : input('repeat passphrase', {secret: true});
		const settingsOf = () => undefined;
		const clear = () => { for (const el of Object.values(read)) if (el.type === 'password') el.value = ''; if (secret) { secret.value = ''; repeat.value = ''; } };
		if (replace) {
			const own = input('vault passphrase or recovery code', {secret: true});
			for (const recovering of status().unlocked ? [false] : [false, true]) choice(recovering ? 'replace with recovery code' : 'check and replace', 'checks the new settings before saving them', async () => {
				const parameters = {settings: settingsOf(), secret: own.value, recovery: recovering}; clear(); own.value = '';
				try { await session.replaceKey(parameters); replacing = false; } finally { parameters.secret = ''; delete parameters.settings; }
			}, {key: 'replace'});
			choice('back to vault', 'keeps the saved connection', () => { replacing = false; });
			return;
		}
		choice(signsIn(id) ? 'protect my notes' : 'connect', '', async () => {
			const parameters = {passphrase: secret.value}, settings = settingsOf(), matches = secret.value === repeat.value; clear();
			const gate = availability();
			if (!gate.ready) { comingSoon(gate); return; }
			try {
				if (!matches) throw new Error('the passphrases do not match.');
				if ([...parameters.passphrase].length < 16) throw new Error('use at least 16 characters.');
				const made = await (await owner()).create({...parameters, ...(settings ? {settings} : {})});
				if (visible) recovery = made;
			} finally { parameters.passphrase = ''; if (settings) for (const name of Object.keys(settings)) settings[name] = ''; }
		}, {key: 'connect'});
		choice('connect another device’s vault', 'paste its device code and type the passphrase', () => { joined = true; }, {key: 'to-join'});
	}
	function paintProviderJoin() {
		paragraph('paste the device code from your other device and unlock it here. nothing here is replaced: sync now keeps both.');
		const address = input('device code from your other device', {value: joinCode}), secret = input('vault passphrase or recovery code', {secret: true});
		address.addEventListener('input', () => { joinCode = address.value; });
		for (const recover of [false, true]) choice(recover ? 'connect with recovery code' : 'connect existing vault', 'nothing syncs until you press sync now', async () => {
			const parameters = {address: address.value, secret: secret.value, recovery: recover}; joinCode = address.value; secret.value = '';
			const gate = availability();
			if (!gate.ready) { comingSoon(gate); return; }
			try { await (await owner()).join(parameters); joined = false; joinCode = ''; } finally { parameters.secret = ''; }
		}, {key: recover ? 'join-recovery' : 'join'});
	}
	async function startSignIn() {
		const screen = view, current = () => visible && screen === view;
		if (!current()) return;
		await flush(true); if (!current()) return;
		const own = await owner(); if (!current()) return;
		const url = await own.beginSignIn();
		if (intakeJoin) {
			api().readConnectionCode(joinCode);
			sessionStorage.setItem(joinReturnKey(), JSON.stringify({address: joinCode, state: new URL(url).searchParams.get('state'), at: Date.now()}));
		}
		await flush(true); if (current()) location.assign(url);
	}
	async function loadAccounts() {
		accounts = await session.cloudflareAccounts();
		if (accounts.length === 1) await chooseAccount(accounts[0]);
	}
	async function chooseAccount(account) {
		selectedAccount = account; cloudStorage = null; activation = false; newVault = false;
		try { cloudStorage = await session.cloudflareStorage(account.id); }
		catch (error) { activation = error?.code === 'r2_activation'; throw error; }
	}
	function dashboardLink() {
		const link = node('a', 'export-choice', activation ? 'open cloudflare to enable storage' : 'open cloudflare storage settings');
		link.href = api().storageDashboard(selectedAccount.id); link.target = '_blank'; link.rel = 'noopener noreferrer'; body.append(link);
	}
	function paintCloudflareSetup() {
		if (!accounts) { choice('continue setup', 'find your cloudflare account', loadAccounts); return; }
		if (!accounts.length) {
			paragraph('cloudflare did not grant access to an account. sign out, then choose an account when you sign in again.'); return;
		}
		if (!selectedAccount) {
			paragraph('where would you like to keep your notes?');
			for (const account of accounts) choice(account.name, 'use this cloudflare account', () => chooseAccount(account));
			return;
		}
		paragraph('your cloudflare account: ' + selectedAccount.name);
		if (!cloudStorage) {
			if (activation) {
				paragraph('cloudflare calls its storage “r2”. enable it in the page below, then come back here.');
				paragraph('cloudflare includes free usage and asks you to accept its billing terms. rapier cannot accept those for you.');
			}
			dashboardLink();
			choice('continue setup', 'rapier will check again and finish setting up your storage', () => chooseAccount(selectedAccount));
		} else if (cloudStorage.vaults.length && !newVault) {
			paragraph('found your encrypted notes. use your sync passphrase to connect this device.');
			let selected = null;
			if (cloudStorage.vaults.length > 1) {
				selected = node('select', 'navigator-outline-filter'); selected.setAttribute('aria-label', 'saved notes');
				cloudStorage.vaults.forEach((vault, index) => { const option = node('option', '', 'notes ' + (index + 1)); option.value = String(index); selected.append(option); });
				body.append(selected);
			}
			const secret = input('sync passphrase or recovery code', {secret: true});
			for (const recover of [false, true]) choice(recover ? 'use recovery code' : 'connect existing vault', 'keeps the notes already on this device too', async () => {
				const parameters = {address: cloudStorage.vaults[Number(selected?.value || 0)].address, secret: secret.value, recovery: recover}; secret.value = '';
				try { await session.join(parameters); joined = false; } finally { parameters.secret = ''; }
			});
			choice('start a separate collection', 'keeps your existing online notes untouched', () => { newVault = true; });
		} else {
			paragraph('choose a sync passphrase of at least 16 characters. it encrypts your online notes, and rapier cannot reset it.');
			const secret = input('new sync passphrase', {secret: true}), repeat = input('repeat passphrase', {secret: true});
			choice('protect my notes', 'rapier has prepared your private storage', async () => {
				const parameters = {passphrase: secret.value}, matches = secret.value === repeat.value; secret.value = ''; repeat.value = '';
				try { if (!matches) throw new Error('the passphrases do not match.'); const made = await session.create(parameters); if (visible) recovery = made; }
				finally { parameters.passphrase = ''; }
			});
		}
		if (accounts.length > 1) choice('choose another account', 'keep notes in a different cloudflare account', () => { selectedAccount = null; cloudStorage = null; });
		choice('use a device code', 'connect a collection shared from your other device', () => { joined = true; });
	}
	let replaced = [];
	async function keptChoices() { if (typeof _rapierPersonal === 'undefined') return; try { replaced = await _rapierPersonal.ledger(); } catch (_) { replaced = []; } }
	async function syncOnce(guard = () => {}) {
		syncing = true;
		try {
			await flush();
			try { guard(); } catch (error) { throw Object.assign(new Error(error?.message || 'Sync was not admitted.'),
				{name: error?.name || 'Error', code: error?.code, cause: error, notesSyncStarted: false}); }
			const result = await session.syncNow(); await _rapierNotesFolderChanged(); await keptChoices(); return result;
		}
		finally { syncing = false; wearBox(); }
	}
	async function syncNow({signal, guard} = {}) {
		let submitted = false;
		const stopped = () => { if (signal?.aborted) throw new DOMException('The sync request was canceled.', 'AbortError'); guard?.(); };
		const refused = reason => ({action: 'now', synced: false, reason});
		try {
			stopped();
			if (!session) {
				if (!api()) return refused('notes_sync_not_configured');
				await _rapierNotesReady(); await _rapierNotesStore.kind(); stopped();
				const saved = await api().readSyncState(_rapierNotesStore.folder); stopped();
				if (!saved.vault) return refused('notes_sync_not_configured');
				await owner(); stopped();
			}
			const current = status();
			if (!current.hasConnection || current.rejoinRequired) return refused('notes_sync_not_configured');
			if (!current.unlocked) return refused('notes_sync_locked');
			if (!current.authorized) return refused('notes_sync_sign_in_required');
			if (acting || syncing || current.busy) return refused('notes_sync_busy');
			submitted = true;
			const result = await syncOnce(stopped);
			const skipped = Array.isArray(result.skipped) ? result.skipped.length : 0, missing = Array.isArray(result.missing) ? result.missing.length : 0;
			return {action: 'now', synced: true, complete: result.caughtUp !== false && !skipped && !missing,
				unchanged: result.unchanged === true, skipped, missing, backedUpAt: status().backedUpAt ?? null};
		} catch (error) {
			if (submitted && error?.notesSyncStarted !== false) return {outcome: 'uncertain', reason: 'notes_sync_unconfirmed'};
			if (error?.code === 'notes_locked') throw Object.assign(new Error(error.message), {code: error.code, cause: error, notesSyncStarted: false});
			if (error?.name === 'AbortError') return {refused: 'cancelled'};
			return refused(error?.code === 'locked' ? 'notes_sync_locked' : error?.code === 'auth' ? 'notes_sync_sign_in_required' : 'notes_sync_failed');
		}
	}
	async function connectAndSync() {
		await syncOnce(); automatic = status().unlocked && status().authorized; schedule(60000);
	}
	let dueAt = 0, settingsQuiet = false;
	function schedule(delay) {
		clearTimeout(timer); dueAt = 0; settingsQuiet = false;
		if (!automatic) return;
		dueAt = Date.now() + delay;
		timer = setTimeout(async () => {
			dueAt = 0;
			const current = status();
			if (!current.unlocked || !current.authorized) { automatic = false; return; }
			if (visible || document.hidden || navigator.onLine === false || acting || syncing || current.busy) { schedule(10000); return; }
			try { await syncOnce(); }
			catch (error) {
				message = said(error, 'sync is waiting for a connection.');
				if (error?.code === 'newer') automatic = false;
			}
			schedule(60000);
		}, delay);
	}
	function changed(kind) {
		if (syncing) return;
		if (kind !== 'settings') { schedule(1600); return; }
		if (dueAt && !settingsQuiet && dueAt - Date.now() <= 15000) return;
		schedule(15000); settingsQuiet = true;
	}
	addEventListener('online', changed);
	document.addEventListener('visibilitychange', () => { if (!document.hidden) changed(); });
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden && visible && mode() === 'companion' && companion) void perform(async () => { await askCompanion(); await askCompanionVault(); }, false);
	});
	async function leaveVaultChoice() {
		await flush();
		await (await owner()).leave();
		recovery = null; conflicts = null; setup = null; joined = false; joinCode = ''; replacing = false; rekeying = false;
		await _rapierNotesFolderChanged();
	}
	function paintVaultChoices(state) {
		if (!state.hasConnection && !state.rejoinRequired) return;
		if (mode() === 'provider' && !signsIn(providerId) && state.hasConnection && !replacing) choice('replace storage settings', 'checks the new settings, then locks them with your vault', () => { replacing = true; joined = false; });
		if (mode() === 'r2-key' && state.hasConnection) {
			if (!replacing) choice('replace bucket key', 'checks a new key for this same bucket, then locks it with your vault', () => { replacing = true; joined = false; });
			if (!joined && !replacing) choice('join with a new device code', 'updates the key from another device without losing this folder’s notes', () => { joined = true; });
		}
		choice('leave this vault', 'forgets this folder’s connection, not its notes; the online vault and other devices stay', leaveVaultChoice);
		choice('start a new vault', 'leaves this vault, keeps every note and seals them again under a new key', leaveVaultChoice);
	}
	function paintRekey() {
		paragraph('choose a new passphrase of at least 16 characters. the old one still opens device codes you made before.');
		const secret = input('new vault passphrase', {secret: true}), repeat = input('repeat passphrase', {secret: true});
		choice('save new passphrase', 'then give your other devices the new device code', async () => {
			let words = secret.value; const matches = words === repeat.value; secret.value = ''; repeat.value = '';
			try {
				if (!matches) throw new Error('the passphrases do not match.');
				if ([...words].length < 16) throw new Error('use at least 16 characters.');
				await session.rekeyVault({passphrase: words}); rekeying = false;
			} finally { words = ''; }
		}, {key: 'rekey-confirm'});
		choice('back to vault', 'keeps the passphrase you have', () => { rekeying = false; });
	}
	function paintKeyReplacement(state) {
		if (state.address) value('device code — for your other device', state.address);
		paragraph('use a new object read and write key for this same bucket; the old key is not used for this check.');
		const id = input('new access key id', {secret: true}), access = input('new secret access key', {secret: true});
		const secret = state.unlocked ? null : input('vault passphrase or recovery code', {secret: true});
		for (const recover of (secret ? [false, true] : [false])) choice(recover ? 'replace with recovery code' : 'check and replace key',
			'checks the bucket before saving; give the new device code to your other devices', async () => {
				const parameters = {accessKeyId: id.value.trim(), secretAccessKey: access.value, secret: secret?.value, recovery: recover};
				id.value = ''; access.value = ''; if (secret) secret.value = '';
				try { await session.replaceKey(parameters); replacing = false; joinCode = ''; }
				finally { parameters.accessKeyId = ''; parameters.secretAccessKey = ''; parameters.secret = ''; }
			});
		choice('back to vault', 'keeps the saved connection', () => { replacing = false; });
	}
	function paintKeySetup(state) {
		if (state.hasConnection || joined || state.rejoinRequired) {
			if (state.hasConnection && !state.credentialStored && !state.rejoinRequired) paragraph('this device forgot its bucket key. to cut rapier off, delete the key in cloudflare; to reconnect, paste a device code you saved.');
			paragraph('paste the device code from your other device and unlock it here. nothing here is replaced: sync now keeps both.');
			const address = input('device code from your other device', {value: joinCode}), secret = input('vault passphrase or recovery code', {secret: true});
			address.addEventListener('input', () => { if (intakeJoin) joinCode = address.value; });
			const canJoin = !state.busy && !acting && (!intakeJoin || mode() === 'companion' && platformId() === 'android' || availability().ready && ((mode() !== 'oauth' && !(mode() === 'provider' && signsIn(providerId))) || state.authorized));
			for (const recover of [false, true]) choice(recover ? 'connect with recovery code' : 'connect existing vault', 'nothing syncs until you press sync now', async () => {
				const parameters = {address: address.value, secret: secret.value, recovery: recover}; joinCode = address.value; secret.value = '';
				try {
					if (intakeJoin && mode() === 'companion') { await askCompanion(); if (!companionGate().ready) throw new Error(companionGate().reason); }
					await (await owner()).join(parameters); joined = false; joinCode = ''; intakeJoin = false;
				} finally { parameters.secret = ''; }
			}, {enabled: canJoin, key: recover ? 'join-recovery' : 'join'});
			if (state.hasConnection && state.credentialStored && !state.rejoinRequired) choice('back to vault', 'keeps the saved connection', () => { joined = false; joinCode = ''; intakeJoin = false; });
			if (!state.hasConnection && !state.rejoinRequired) choice('create a new vault instead', 'choose a passphrase for a new vault', () => { joined = false; intakeJoin = false; });
			return;
		}
		if (setup?.stage === 'recovery') {
			paragraph('save your recovery code.');
			paragraph('it opens your vault if you forget the passphrase, and anyone who has it can read your notes. rapier cannot show it again.');
			value('recovery code', setup.recovery);
			choice('i have kept it', 'in a password manager or on paper; then type it back', () => { setup.stage = 'confirm'; });
		} else if (setup?.stage === 'confirm') {
			paragraph('type your recovery code.');
			const field = input('recovery code', {secret: true});
			choice('continue', 'checks the code you saved, then on to your bucket', () => {
				const entered = field.value; field.value = '';
				session.confirmRecovery(entered);
				setup = {stage: 'bucket', recoveryCode: entered};
			});
		} else if (setup?.stage === 'bucket') {
			paragraph('connect your bucket.');
			paragraph('in cloudflare, make an r2 bucket, then under manage api tokens an object read & write key for that bucket alone.');
			paragraph('rapier locks the key with your vault and never stores it readable. to cut rapier off, delete the key in cloudflare.');
			const saved = setup.details || {};
			const account = input('cloudflare account id', {value: saved.accountId}), bucket = input('r2 bucket', {value: saved.bucket}), region = jurisdiction(saved.jurisdiction), keyId = input('access key id', {value: saved.accessKeyId}), secret = input('secret access key', {secret: true});
			paragraph('add this cors rule in the bucket’s settings, so rapier can check the connection.');
			value('bucket cors rule', JSON.stringify([{AllowedOrigins: ['https://rapier.website'], AllowedMethods: ['GET', 'PUT', 'HEAD'], AllowedHeaders: ['authorization', 'content-type', 'x-amz-content-sha256', 'x-amz-date'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 3600}], null, 2));
			choice('check and connect', 'writes and reads a test file first; your notes wait for sync now', async () => {
				const parameters = {accountId: account.value.trim(), bucket: bucket.value.trim(), jurisdiction: region.value, accessKeyId: keyId.value.trim(), secretAccessKey: secret.value, recoveryCode: setup.recoveryCode};
				setup.details = {accountId: parameters.accountId, bucket: parameters.bucket, jurisdiction: parameters.jurisdiction, accessKeyId: parameters.accessKeyId};
				secret.value = ''; keyId.value = '';
				try { await (await owner()).create(parameters); setup = null; } finally { parameters.secretAccessKey = ''; parameters.recoveryCode = ''; }
			});
		} else {
			paragraph('choose a sync passphrase.');
			paragraph('it locks the online copy of your notes, and rapier cannot reset it. use at least 16 characters.');
			const secret = input('new vault passphrase', {secret: true}), repeat = input('repeat passphrase', {secret: true});
			choice('continue', 'next, your recovery code, then your bucket', async () => {
				const parameters = {passphrase: secret.value}, matches = secret.value === repeat.value; secret.value = ''; repeat.value = '';
				try {
					if (!matches) throw new Error('the passphrases do not match.');
					if ([...parameters.passphrase].length < 16) throw new Error('use at least 16 characters.');
					const made = await (await owner()).prepare(parameters);
					if (visible) setup = {stage: 'recovery', recovery: made.recovery};
				} finally { parameters.passphrase = ''; }
			});
			choice('connect another device’s vault', 'paste its device code and type the passphrase', () => { joined = true; });
			if (oauthGate().ready) choice('use cloudflare sign-in', 'account-wide access instead of one bucket', async () => { await session?.lock(); session = null; route = 'oauth'; await owner(); });
		}
		if (setup) choice('start setup again', 'clears this setup for a new passphrase', async () => { setup = null; await session.cancelSetup(); });
	}
	function open({initialize = true} = {}) {
		if (!overlay) {
			overlay = document.getElementById('notes-sync-overlay');
			if (!overlay) return;
			body = overlay.querySelector('.notes-sync-body');
			overlay.querySelector('.notes-sync-close').addEventListener('click', close);
			overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
		}
		visible = true; const screen = ++view;
		if (mode() === 'companion') companion = null;
		if (initialize) void perform(async () => {
			if (mode() === 'companion') { await askCompanion(); if (!visible || screen !== view || !companionGate().ready) return; }
			if (mode() !== 'companion' && !environment().native) { await readKeyPlain(); if (keyState?.connection) return; }
			const prior = session; await owner();
			if (prior === session && !status().busy) await session.inspect();
			await keptChoices();
			if (!visible || screen !== view) return;
			if (mode() === 'companion') await askCompanionVault();
			else if (mode() === 'oauth' && status().authorized && !status().hasConnection && !accounts) await loadAccounts();
		}, false);
		paint(); openDialog(overlay, {panel: '.settings-panel', onEscape: close});
	}
	function consume(context) {
		const hash = context.hash || location.hash || '';
		if (hash.startsWith('#join=')) {
			history.replaceState(null, '', _rapierBootPathAndQuery());
			automatic = false; clearTimeout(timer); intakeJoin = true; joined = true; joinCode = ''; message = '';
			try {
				const landing = api().readJoinFragment(hash); joinCode = landing.address;
				if (!session) { route = platformId() === 'android' ? 'companion' : landing.mode; if (landing.provider) providerId = landing.provider; }
			} catch (error) { message = said(error); if (!session) route = platformId() === 'android' ? 'companion' : 'r2-key'; }
			open({initialize: false}); return;
		}
		const fragment = /(?:^#|&)(?:access_token|error)=/.test(hash) && /(?:^#|&)state=/.test(hash) ? hash : '';
		if (!fragment && !context.params.has('code') && !context.params.has('error')) return;
		const returnedState = fragment ? new URLSearchParams(fragment.slice(1)).get('state') : context.params.get('state');
		let sent = null;
		try { sent = JSON.parse(sessionStorage.getItem(providerPendingKey())); } catch (_) {}
		if (sent && api().isOtherProvider(sent.provider) && sent.state === returnedState) {
			const at = new URL(location.href), search = fragment || context.params.toString(), callback = at.origin + at.pathname;
			history.replaceState(null, '', _rapierBootPathAndQuery());
			session = null; route = 'provider'; providerId = sent.provider; others = true;
			open({initialize: false});
			const screen = view;
			if (availability().ready) void perform(async () => {
				const own = await owner(); if (!visible || screen !== view) return;
				await own.finishSignIn(search, callback);
				let saved;
				try { saved = JSON.parse(sessionStorage.getItem(joinReturnKey())); } catch (_) {}
				sessionStorage.removeItem(joinReturnKey());
				if (saved && saved.state === returnedState && saved.at <= Date.now() && Date.now() - saved.at <= 600000) {
					const landing = api().readJoinFragment('#join=' + saved.address);
					if (landing?.mode === 'provider') { joinCode = landing.address; intakeJoin = true; joined = true; }
				}
			});
			return;
		}
		if (fragment) return;
		const search = context.params.toString(), callback = location.href;
		let verification = false;
		try { verification = api().verificationReturn(callback, sessionStorage.getItem('rapier:cloudflare:pending' + RapierStorage.scope), search); } catch (_) {}
		history.replaceState(null, '', _rapierBootPathAndQuery() + (verification ? '#sync-verify' : ''));
		if (mode() !== 'oauth') { session = null; route = 'oauth'; }
		open({initialize: false});
		const screen = view;
		if (availability().ready) void perform(async () => {
			const own = await owner(); if (!visible || screen !== view) return;
			await own.finishSignIn(search, callback);
			let saved;
			try { saved = JSON.parse(sessionStorage.getItem(joinReturnKey())); } catch (_) {}
			sessionStorage.removeItem(joinReturnKey());
			if (saved && saved.state === context.params.get('state') && saved.at <= Date.now() && Date.now() - saved.at <= 600000) {
				const landing = api().readJoinFragment('#join=' + saved.address);
				if (landing?.mode === 'oauth') { joinCode = landing.address; intakeJoin = true; joined = true; }
			}
			if (!intakeJoin && visible && screen === view && !status().hasConnection && !status().rejoinRequired) await loadAccounts();
		});
	}
	return Object.freeze({open, consume, status, changed, syncNow});
})();
