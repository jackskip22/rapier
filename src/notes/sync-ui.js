// One sheet, one session owner. This is editor glue, not another sync implementation.
// The bucket-key route and the registered sign-in each have their own admission gate.
const _rapierNotesSyncUi = (() => {
	let session = null, initializing = null, overlay = null, body = null, visible = false, view = 0;
	let accounts = null, selectedAccount = null, cloudStorage = null, activation = false, newVault = false;
	let automatic = false, timer = null, syncing = false;
	let message = '', recovery = null, conflicts = null, joined = false, setup = null, route = null, acting = false, joinCode = '', replacing = false;
	let intakeJoin = false, drawnCode = null;
	const joinReturnKey = () => 'rapier:sync:join-return' + RapierStorage.scope;
	const api = () => globalThis.RapierNotesSyncSession;
	const platformId = () => String(globalThis.RapierPlatform?.environment?.id || '').toLowerCase();
	const environment = () => ({url: location.href, native: ['android', 'windows'].includes(platformId()), framed: window.top !== window});
	const oauthGate = () => api()?.syncAvailability(environment()) || {ready: false, reason: 'cloudflare sync did not load. backup saves your notes to a file.'};
	const keyGate = () => api()?.r2KeyAvailability(environment()) || {ready: false, reason: oauthGate().reason};
	// THE COMPANION'S BRANCH. In the Android app, where Rapier has no network, the same sheet runs through Rapier
	// Sync (notes/sync-session.mjs's companion mode): the same rows and words, with the companion's answer where the
	// provider's would be. The app answers the sheet's question (android/.../RapierSyncCourier.kt status) from its
	// package manager: whether Rapier's own Rapier Sync is installed, whether its store listing would open, and for a
	// vault, whether Rapier Sync approved that vault's storage. Asking opens nothing; an app is opened only from the
	// row that says rapier sync, through the editor's own door (_rapierUiSyncOpen), and the store's listing only
	// where the app says it is live. What the sheet says when the companion is not there is the editor's own
	// sentence for each answer (_rapierUiSyncOpen's, the same words).
	const COMPANION_ABSENT = Object.freeze({
		absent: 'Rapier Sync is coming soon. Your notes are not synced. Use Notes BACKUP to keep a separate copy.',
		impostor: 'An app using Rapier Sync\'s name is installed, but it is not signed by Rapier\'s certificate. Rapier will not open it.',
		unsigned: 'The Rapier Sync on this phone has no readable signature, so Rapier cannot tell whether it is the real one. It was not opened.'});
	// Once the app says the store listing is live, the absent sentence sends the person there, and an impostor is told to go first.
	const COMPANION_ABSENT_LISTED = Object.freeze({
		absent: 'Rapier Sync is not installed. Get it from Google Play to sync your notes. Until then, use Notes BACKUP to keep a separate copy.',
		impostor: COMPANION_ABSENT.impostor + ' Remove that app, then install Rapier Sync from Google Play.',
		unsigned: COMPANION_ABSENT.unsigned});
	const COMPANION_UNAPPROVED = 'open rapier sync and approve this vault’s storage; nothing was sent.';
	let companion = null;
	const companionSeam = () => { try { const host = globalThis.RapierPlatform?.host; return typeof host?.syncTransport === 'function' ? host : null; } catch (_) { return null; } };
	const companionGate = () => companion?.state === 'ready' && companionSeam() ? {ready: true, reason: ''}
		: {ready: false, reason: (companion?.listing ? COMPANION_ABSENT_LISTED : COMPANION_ABSENT)[companion?.state] || (companion?.listing ? COMPANION_ABSENT_LISTED : COMPANION_ABSENT).absent};
	// The vault's public identifier (32 hexadecimal characters, never a key): Rapier Sync's storage screen asks for it
	// when the person approves this vault's storage, so the sheet shows it beside the device code.
	const companionVaultId = state => { try { return state?.address ? api().readConnectionCode(state.address).vaultId || null : null; } catch (_) { return null; } };
	async function askCompanion(vault = null) {
		let answer = null;
		try { answer = await companionSeam()?.syncTransport('status', vault ? {vault} : {}); } catch (_) {}
		const read = !!answer && typeof answer === 'object' && (answer.state === 'ready' || Object.hasOwn(COMPANION_ABSENT, answer.state)) &&
			typeof answer.listing === 'boolean' && typeof answer.ready === 'boolean' ? answer : null;
		if (!vault) companion = read ? {state: read.state, listing: read.listing, approved: null} : {state: 'absent', listing: false, approved: null};
		else if (companion) companion = {...companion, approved: read?.state === 'ready' ? read.ready : null};
	}
	// This vault's approval, once the folder has one: asked again whenever the sheet opens or the person comes back to it.
	async function askCompanionVault() {
		const address = session?.status().address;
		let vault = null;
		try { vault = address ? api().readConnectionCode(address).vaultId : null; } catch (_) {}
		if (vault && companion?.state === 'ready') await askCompanion(vault);
	}
	function openCompanion() { if (typeof _rapierUiSyncOpen === 'function') _rapierUiSyncOpen(); }
	// PROVENANCE (docs/sync-design.md §1.2). Each head this device publishes carries a coarse label for it, from the
	// platform and the browser and never an identifier, sealed with the head; the sheet names another device by the
	// label its newest head carries, and a choice another device replaced by the device whose shelf wrote it.
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
	const availability = () => mode() === 'companion' ? companionGate() : mode() === 'r2-key' ? keyGate() : oauthGate();
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
	function paragraph(text) { body.append(node('p', 'export-choice__description', text)); }
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
	function choice(label, description, action, {enabled = !status().busy && !acting, cloudflare = false} = {}) {
		const button = node('button', 'export-choice' + (cloudflare ? ' rapier-cloudflare' : '')); button.type = 'button'; button.disabled = !enabled;
		button.append(node('span', 'export-choice__label', label), node('span', 'export-choice__description', description));
		button.addEventListener('click', () => { button.disabled = true; void perform(action); }); body.append(button);
	}
	// The Notes settings panel's box (law 54, notes/notes.js _rapierNotesSyncBoxWear) says what the sync is
	// now: connected or not, and the last finished run's time. It is worn again whenever that can change.
	const wearBox = () => { if (typeof _rapierNotesSyncBoxWear === 'function') _rapierNotesSyncBoxWear(); };
	// A head in the vault that this Rapier cannot read was written by a newer one (notes/sync.mjs refuses it, 'newer',
	// and replaces nothing): the sheet says what to do instead of the refusal's own sentence.
	const NEWER = 'update Rapier to sync this folder.';
	const said = (error, otherwise) => error?.code === 'newer' ? NEWER : String(error?.message || otherwise);
	async function perform(action, clear = true) {
		if (clear) message = ''; acting = true;
		try { const result = action(); paint(); await result; }
		catch (error) { if (visible) message = said(error, 'that did not finish; your notes are unchanged.'); }
		finally { acting = false; paint(); renderSettings(); wearBox(); }
	}
	async function owner() {
		if (session) return session;
		if (initializing) return initializing;
		initializing = (async () => {
			await _rapierNotesReady(); await _rapierNotesStore.kind();
			const saved = (await api().readSyncState(_rapierNotesStore.folder)).vault;
			if (saved?.mode) route = saved.mode;
			const gate = availability(); if (!gate.ready) throw new Error(gate.reason);
			const opened = api().createSyncSession({folder: _rapierNotesStore.folder, personal: _rapierPersonal, mode: mode(),
				fetch: window.fetch.bind(window), pendingStorage: sessionStorage,
				device: api().createRememberedDevice({storage: api().createDeviceStorage({scope: RapierStorage.scope})}),
				pendingKey: 'rapier:cloudflare:pending' + RapierStorage.scope, environment: environment(), label: deviceLabel(),
				// Through Rapier Sync the engine's objects cross the app's seam, sealed; the page has no network of its own.
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
		visible = false; recovery = null; conflicts = null; setup = null; joinCode = ''; replacing = false; message = ''; intakeJoin = false; drawnCode = null;
		clearBody(); if (overlay) closeDialog(overlay); wearBox();
	}
	function paint() {
		if (!visible || !body) return;
		clearBody();
		const gate = availability(), state = status();
		if (message) { const p = node('p', 'export-choice__description', message); p.setAttribute('role', 'alert'); body.append(p); }
		// A camera link is a local landing, even while this route is unavailable. It does not
		// inspect a saved folder, request sign-in or fetch the destination merely by opening.
		if (intakeJoin) {
			if (!gate.ready && (mode() !== 'companion' || platformId() !== 'android' || companion)) paragraph(gate.reason);
			paintKeySetup(state);
			if (mode() === 'oauth' && !state.authorized) choice('sign in with cloudflare', 'then unlock the device code here', startSignIn, {enabled: gate.ready && !acting && !state.busy, cloudflare: true});
			return;
		}
		// Nothing is said about Rapier Sync before the app has answered.
		if (mode() === 'companion' && !companion) {
			const loading = node('p', 'export-choice__description', 'Opening sync settings.');
			loading.setAttribute('role', 'status'); body.append(loading); return;
		}
		if (!gate.ready) {
			paragraph(gate.reason);
			if (mode() === 'companion') {
				// Rapier Sync is not here, or not Rapier's: its store listing, only where the app says the listing is live.
				if (companion.listing) choice('rapier sync', 'get it from google play', openCompanion, {enabled: !acting});
				choice('backup', 'save all your notes to one file', async () => { close(); await _rapierNotesBackup(); }, {enabled: true});
				return;
			}
			// The sign-in stands where it will be, said plainly (the founder, 1 October): a button that does nothing yet,
			// so nobody has to guess whether it was left out or is not switched on.
			if (mode() === 'oauth') choice('sign in with cloudflare', 'available soon', () => {}, {enabled: false, cloudflare: true});
			paragraph('your notes stay on this device.');
			if (mode() === 'oauth' && keyGate().ready) {
				choice('advanced: use a storage key', 'connect an existing r2 bucket yourself', async () => { session = null; route = 'r2-key'; await owner(); }, {enabled: !acting});
				return;
			}
			// Every provider Rapier carries, named, with what each one is still waiting for. Both halves
			// of this existed and nobody joined them: notes/cloud-providers.mjs has published
			// {id, label, ready, notice} for six providers since R87N, and this sheet was the only place
			// a person looks. Without the join, five of the six were in the download with nothing on any
			// screen saying so -- a person cannot tell "we did not build it" from "it is here and not
			// switched on yet", which is exactly what they must never have to guess.
			//
			// Read off the published object rather than a list typed here, so a provider cannot be added
			// to the build and left off this sheet, and cannot be named here after being taken out.
			const carried = globalThis.RapierCloudProviders?.availability;
			if (Array.isArray(carried) && carried.length) {
				paragraph('what rapier can sync to:');
				for (const provider of carried) {
					const row = node('p', 'export-choice__description',
						String(provider.label || provider.id) + ' \u2014 ' + String(provider.ready ? 'ready' : provider.notice || 'not connected'));
					row.dataset.syncProvider = String(provider.id);
					row.dataset.syncReady = provider.ready ? 'yes' : 'no';
					body.append(row);
				}
			}
			choice('backup', 'save all your notes to one file', async () => { close(); await _rapierNotesBackup(); }, {enabled: true});
			return;
		}
		// Inspect the saved connection before offering fields. The first session paint replaces this
		// body; accepting a passphrase while that read is pending would throw away the person's input.
		if (!session && acting) {
			const loading = node('p', 'export-choice__description', 'Opening sync settings.');
			loading.setAttribute('role', 'status'); body.append(loading); return;
		}
		if (state.notice) { const p = node('p', 'export-choice__description', state.notice); p.setAttribute('role', 'status'); body.append(p); }
		// Where the provider's state would be: whether Rapier Sync approved this vault's storage (its transport's words,
		// said once when a sync just said them).
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
			choice('sign in with cloudflare', 'continue to cloudflare', startSignIn, {cloudflare: true});
			if (keyGate().ready && !state.hasConnection && !state.rejoinRequired) choice('advanced: use a storage key', 'connects only the r2 bucket you choose', async () => { session = null; route = 'r2-key'; await owner(); });
			paintVaultChoices(state);
			return;
		}
		if (mode() === 'r2-key' && replacing) {
			paintKeyReplacement(state); paintVaultChoices(state);
			return;
		}
		if (mode() === 'r2-key' && (!state.credentialStored || joined || state.rejoinRequired)) {
			paintKeySetup(state); paintVaultChoices(state);
			return;
		}
		if (mode() === 'companion' && (!state.hasConnection || state.rejoinRequired)) {
			paintCompanionSetup(state); paintVaultChoices(state);
			choice('rapier sync', 'opens rapier sync; it holds your storage and its status', openCompanion, {enabled: true});
			return;
		}
		if (recovery) {
			paragraph('this code unlocks the vault: save it outside rapier, never in a note, and share it with no one.');
			value('recovery code', recovery.recovery); value('vault address — for your other device', recovery.address);
			choice('sync now', pendingWords(state.pending) + '; i have saved the recovery code outside rapier', async () => { recovery = null; await connectAndSync(); });
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
			});
		} else {
			paragraph(automatic ? 'sync is on while this page is open and the vault is unlocked.' : 'sync is paused. your notes stay here.');
			value('device code — for your other device', state.address);
			choice('copy device code', 'paste it on your other device, then type the vault passphrase', async () => {
				if (!navigator.clipboard?.writeText) throw new Error('select the device code above and copy it.');
				await navigator.clipboard.writeText(state.address); message = 'device code copied.';
			});
			// Through Rapier Sync the vault's public identifier is what its storage screen asks for; it is not a key.
			if (mode() === 'companion' && companionVaultId(state)) {
				const vaultId = companionVaultId(state);
				value('vault id — rapier sync asks for it when you approve this vault’s storage', vaultId);
				choice('copy vault id', 'then approve storage for it in rapier sync', async () => {
					if (!navigator.clipboard?.writeText) throw new Error('select the vault id above and copy it.');
					await navigator.clipboard.writeText(vaultId); message = 'vault id copied.';
				});
			}
			choice('sync now', pendingWords(state.pending), async () => {
				await connectAndSync(); conflicts = await session.conflicts();
			});
			choice('review conflicts', 'read both versions and choose one', async () => { conflicts = await session.conflicts(); });
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
		if (mode() === 'r2-key') {
			paragraph('forgetting the key here does not end its access: delete the key in cloudflare. device codes you copied still hold it, encrypted.');
			choice('forget bucket key', 'stops sync here and forgets the key; your notes stay', async () => { setup = null; conflicts = null; await session.forgetKey(); }, {enabled: true});
		// Through Rapier Sync this page holds no access to revoke: the storage and its sign-in are Rapier Sync's. Leaving the
		// vault here (paintVaultChoices) forgets this folder's connection and nothing in the app.
		} else if (mode() === 'companion') {
			choice('rapier sync', 'opens rapier sync: approve storage, see its status, remove this vault’s storage there', openCompanion, {enabled: true});
			paragraph('leaving this vault here does not remove its storage from rapier sync; do that in the app.');
		}
		else choice('sign out and revoke', 'stops sync and revokes this page’s access; your notes stay', async () => { recovery = null; conflicts = null; await session.signOut(); }, {enabled: true});
	}
	// The companion's connect rows, in the bucket-key route's words: a passphrase, then the recovery code, then the
	// bucket, which here is Rapier Sync's to set up; or another device's code. Nothing in them names a provider.
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
	// Choices this device made that another device's later choice replaced (notes/personal.mjs's ledger).
	let replaced = [];
	async function keptChoices() { if (typeof _rapierPersonal === 'undefined') return; try { replaced = await _rapierPersonal.ledger(); } catch (_) { replaced = []; } }
	async function syncOnce() {
		syncing = true;
		try { await flush(); await session.syncNow(); await _rapierNotesFolderChanged(); await keptChoices(); }
		finally { syncing = false; wearBox(); }
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
				// Until Rapier is updated the same head refuses every run: the automatic ones stop, and nothing is replaced.
				if (error?.code === 'newer') automatic = false;
			}
			schedule(60000);
		}, delay);
	}
	// A saved edit syncs after 1.6 s of quiet. A settings change waits 15 s of quiet, so a run of tries
	// publishes one head, and it never pushes back a run that is already due sooner.
	function changed(kind) {
		if (syncing) return;
		if (kind !== 'settings') { schedule(1600); return; }
		if (dueAt && !settingsQuiet && dueAt - Date.now() <= 15000) return;
		schedule(15000); settingsQuiet = true;
	}
	addEventListener('online', changed);
	document.addEventListener('visibilitychange', () => { if (!document.hidden) changed(); });
	// Back from Rapier Sync, the sheet asks again what it holds (an approval made there shows here).
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden && visible && mode() === 'companion' && companion) void perform(async () => { await askCompanion(); await askCompanionVault(); }, false);
	});
	async function leaveVaultChoice() {
		await flush();
		await (await owner()).leave();
		recovery = null; conflicts = null; setup = null; joined = false; joinCode = ''; replacing = false;
		await _rapierNotesFolderChanged();
	}
	function paintVaultChoices(state) {
		if (!state.hasConnection && !state.rejoinRequired) return;
		if (mode() === 'r2-key' && state.hasConnection) {
			if (!replacing) choice('replace bucket key', 'checks a new key for this same bucket, then locks it with your vault', () => { replacing = true; joined = false; });
			if (!joined && !replacing) choice('join with a new device code', 'updates the key from another device without losing this folder’s notes', () => { joined = true; });
		}
		choice('leave this vault', 'forgets this folder’s connection, not its notes; the online vault and other devices stay', leaveVaultChoice);
		choice('start a new vault', 'the way to change your passphrase: leaves this vault, keeps every note and seals them again under a new key', leaveVaultChoice);
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
			const canJoin = !state.busy && !acting && (!intakeJoin || mode() === 'companion' && platformId() === 'android' || availability().ready && (mode() !== 'oauth' || state.authorized));
			for (const recover of [false, true]) choice(recover ? 'connect with recovery code' : 'connect existing vault', 'nothing syncs until you press sync now', async () => {
				const parameters = {address: address.value, secret: secret.value, recovery: recover}; joinCode = address.value; secret.value = '';
				try {
					if (intakeJoin && mode() === 'companion') { await askCompanion(); if (!companionGate().ready) throw new Error(companionGate().reason); }
					await (await owner()).join(parameters); joined = false; joinCode = ''; intakeJoin = false;
				} finally { parameters.secret = ''; }
			}, {enabled: canJoin});
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
		// Rapier Sync is asked each time the sheet opens: it may have been installed, or this vault approved, since.
		if (mode() === 'companion') companion = null;
		if (initialize) void perform(async () => {
			if (mode() === 'companion') { await askCompanion(); if (!visible || screen !== view || !companionGate().ready) return; }
			const prior = session; await owner();
			if (prior === session && !status().busy) await session.inspect();
			await keptChoices();
			if (!visible || screen !== view) return;
			if (mode() === 'companion') await askCompanionVault();
			else if (mode() === 'oauth' && !status().authorized) await startSignIn();
			else if (mode() === 'oauth' && !status().hasConnection && !accounts) await loadAccounts();
		}, false);
		paint(); openDialog(overlay, {panel: '.settings-panel', onEscape: close});
	}
	function consume(context) {
		const hash = context.hash || location.hash || '';
		if (hash.startsWith('#join=')) {
			// Remove the capability before even parsing it. The page's own camera is never opened.
			history.replaceState(null, '', _rapierBootPathAndQuery());
			automatic = false; clearTimeout(timer); intakeJoin = true; joined = true; joinCode = ''; message = '';
			try {
				const landing = api().readJoinFragment(hash); joinCode = landing.address;
				if (!session) route = platformId() === 'android' ? 'companion' : landing.mode;
			} catch (error) { message = said(error); if (!session) route = platformId() === 'android' ? 'companion' : 'r2-key'; }
			open({initialize: false}); return;
		}
		if (!context.params.has('code') && !context.params.has('error')) return;
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
	return Object.freeze({open, consume, status, changed});
})();

