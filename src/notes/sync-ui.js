const _rapierNotesSyncUi = (() => {
	let session = null, initializing = null, overlay = null, body = null, visible = false, view = 0;
	let automatic = false, timer = null, syncing = false;
	let message = '', conflicts = null, acting = false;
	let heldFiles = [], heldChoices = null;
	let others = false, providerId = null;
	let keyId = null, keySession = null, keyState = null, keyDraft = {};
	let plainKept = null, plainPlace = 'Rapier Notes';
	const api = () => globalThis.RapierNotesSyncSession;
	const platformId = () => globalThis.RapierPlatform?.environment.id;
	const environment = () => ({url: location.href, native: ['android', 'windows'].includes(platformId()), framed: window.top !== window});
	const oauthGate = () => api()?.syncAvailability(environment()) || {ready: false, reason: 'Sync didn’t load. Use Backup for now.'};
	const keyGate = () => api()?.r2KeyAvailability(environment()) || {ready: false, reason: oauthGate().reason};
	const providerGate = () => api()?.providerGate(providerId, environment()) || {ready: false, reason: oauthGate().reason};
	const signsIn = id => !!api()?.providerUsesSignIn(id);
	const keyProvider = id => (api()?.KEY_PLAIN_PROVIDERS || []).includes(id);
	const labelOf = id => api()?.PROVIDERS?.[id]?.label || api()?.KEY_PLAIN_LABELS?.[id] || String(id);
	const providerPendingKey = () => 'rapier:provider:pending' + RapierStorage.scope;
	const COMPANION_ABSENT = Object.freeze({
		absent: 'Rapier Sync is coming soon. Use Backup for now.',
		impostor: 'This Rapier Sync isn’t ours. Not opened.',
		unsigned: 'Can’t verify this Rapier Sync. Not opened.'});
	const COMPANION_ABSENT_LISTED = Object.freeze({
		absent: 'Get Rapier Sync on Google Play. Until then, use Backup.',
		impostor: COMPANION_ABSENT.impostor + ' Remove it and install ours from Google Play.',
		unsigned: COMPANION_ABSENT.unsigned});
	const PRO_REQUIRED = 'Rapier Pro is required to sync your notes.';
	const proRefusal = error => error?.code === 'pro_required' || /\(PRO_REQUIRED\)$/.test(String(error?.message || ''));
	let companion = null, plainCompanion = null, companionPlaces = null;
	const companionSeam = () => { try { const host = globalThis.RapierPlatform?.host; return typeof host?.syncTransport === 'function' ? host : null; } catch (_) { return null; } };
	const plainThroughCompanion = () => plainCompanion ||= api().createPlainCompanionSession({folder: _rapierNotesStore.folder, call: (operation, args) => companionSeam().syncTransport(operation, args)});
	const companionGate = () => companion?.state === 'ready' && companionSeam() ? {ready: true, reason: ''}
		: {ready: false, reason: (companion?.listing ? COMPANION_ABSENT_LISTED : COMPANION_ABSENT)[companion?.state] || (companion?.listing ? COMPANION_ABSENT_LISTED : COMPANION_ABSENT).absent};
	async function askCompanion() {
		let answer = null;
		try { answer = await companionSeam()?.syncTransport('status', {}); }
		catch (error) { if (proRefusal(error)) message = PRO_REQUIRED; }
		const read = !!answer && typeof answer === 'object' && (answer.state === 'ready' || Object.hasOwn(COMPANION_ABSENT, answer.state)) &&
			typeof answer.listing === 'boolean' ? answer : null;
		companion = read ? {state: read.state, listing: read.listing} : {state: 'absent', listing: false};
		companionPlaces = null;
		if (companion.state === 'ready') { try { await _rapierNotesReady(); companionPlaces = await plainThroughCompanion().places(); } catch (_) {} }
	}
	function openCompanion() { if (typeof _rapierUiSyncOpen === 'function') _rapierUiSyncOpen(null); }
	const mode = () => platformId() === 'android' ? 'companion' : keyId ? 'key' : providerId ? 'provider' : 'start';
	const status = () => session?.status() || {authorized: false, busy: false, gate: providerId ? providerGate() : oauthGate()};
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
		return el;
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
	function loading() { const p = node('p', 'export-choice__description', 'Opening sync settings.'); p.setAttribute('role', 'status'); body.append(p); }
	const WAITS = {'sync now': 'Syncing notes', 'connect plain files': 'Connecting', 'sign out and revoke': 'Signing out', 'keep this version': 'Saving',
		'review conflicts': 'Reading notes', 'keep this device’s copy': 'Saving', 'keep the other copy': 'Saving'};
	let progress = null;
	function choice(label, description, action, {enabled = !status().busy && !acting, cloudflare = false, key = null} = {}) {
		const button = node('button', 'export-choice' + (cloudflare ? ' rapier-cloudflare' : '')); button.type = 'button'; button.disabled = !enabled;
		if (key) button.dataset.syncKey = key;
		button.append(node('span', 'export-choice__label', label)); if (description) button.append(node('span', 'export-choice__description', description));
		button.addEventListener('click', () => { button.disabled = true; void perform(action, true, WAITS[label]); }); body.append(button);
	}
	const wearBox = () => { if (typeof _rapierNotesSyncBoxWear === 'function') _rapierNotesSyncBoxWear(); };
	const said = (error, otherwise) => proRefusal(error) ? PRO_REQUIRED : String(error?.message || otherwise);
	async function perform(action, clear = true, words = '') {
		if (clear) message = ''; acting = true;
		const popup = words && overlay ? (progress ||= _rapierProgressOver(overlay)).open({label: words, after: 500}) : null;
		try { const result = action(); paint(); await result; }
		catch (error) { if (visible) message = said(error, 'that did not finish; your notes are unchanged.'); }
		finally { popup?.end(); acting = false; paint(); renderSettings(); wearBox(); }
	}
	async function readSaved() {
		await _rapierNotesReady(); await _rapierNotesStore.kind();
		const kept = (await api().readSyncState(_rapierNotesStore.folder)).plain;
		plainKept = kept ? {provider: kept.provider, place: kept.place} : null;
		if (plainKept && plainKept.provider !== 'companion' && signsIn(plainKept.provider) && providerId !== plainKept.provider) { providerId = plainKept.provider; session = null; }
		return plainKept;
	}
	async function owner() {
		if (session) return session;
		if (initializing) return initializing;
		initializing = (async () => {
			await _rapierNotesReady(); await _rapierNotesStore.kind();
			const gate = providerGate(); if (!gate.ready) throw new Error(gate.reason);
			const opened = api().createProviderSession({folder: _rapierNotesStore.folder, fetch: window.fetch.bind(window), pendingStorage: sessionStorage,
				device: api().createRememberedDevice({storage: api().createDeviceStorage({scope: RapierStorage.scope})}),
				pendingKey: providerPendingKey(), environment: environment(), provider: providerId,
				onChange: () => { paint(); renderSettings(); wearBox(); }});
			await opened.inspect(); session = opened;
			if (!syncBlocked()) { automatic = true; schedule(1600); }
			return opened;
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
		if (session && !status().hasConnection) {
			void session.cancelSetup().then(state => { if (state.revocationPending) showToast(state.notice, 'error'); })
				.catch(error => showToast('Couldn’t cancel sign-in.', 'error', null, error));
		}
		visible = false; conflicts = null; heldChoices = null; message = '';
		if (providerId && plainKept?.provider !== providerId && !status().authorized) { providerId = null; session = null; }
		others = false; keyDraft = {};
		if (!keyState?.connection) keyId = null;
		progress?.release(); clearBody(); if (overlay) closeDialog(overlay); wearBox();
	}
	function paint() {
		if (!visible || !body) return;
		clearBody(); title();
		if (message) { const p = node('p', 'export-choice__description', message); p.setAttribute('role', 'alert'); body.append(p); }
		if (mode() === 'companion') { paintCompanion(); return; }
		if (mode() === 'key') { paintKeyPlain(); return; }
		if (mode() === 'provider') { paintProvider(); return; }
		if (others) { paintOtherList(); return; }
		paintStart();
	}
	function title() {
		const heading = overlay?.querySelector('.settings-section__title');
		if (heading) heading.textContent = mode() === 'start' && !others || mode() === 'key' && keyId === 'r2' ? 'cloudflare' : 'sync';
	}
	const comingSoon = gate => { showToast(gate.reason, 'info'); };
	function paintStart() {
		const gate = oauthGate();
		choice('sign in with cloudflare', 'available soon', () => comingSoon(gate.ready ? {reason: 'Cloudflare sign-in isn’t ready. Use a storage key.'} : gate),
			{enabled: !acting, cloudflare: true, key: 'cloudflare'});
		paragraph('your notes stay on this device.');
		if (keyGate().ready && keyReachable('r2'))
			choice('advanced: use a storage key', 'plain files in an r2 bucket you choose', async () => { await readKeyPlain(); keyId = 'r2'; keyDraft = {}; }, {enabled: !acting, key: 'plain-key:r2'});
	}
	function paintBack() {
		choice('back', '', () => { providerId = null; session = null; keyId = null; others = true; }, {enabled: !acting, key: 'back'});
	}
	function paintOtherList() {
		for (const id of api().OTHER_PROVIDERS) choice(labelOf(id), '', () => pickProvider(id), {enabled: !acting && !status().busy, key: 'provider:' + id});
		for (const id of (api().KEY_PLAIN_PROVIDERS || []).filter(id => id !== 'r2' && keyReachable(id))) choice(api().KEY_PLAIN_LABELS[id].toLowerCase(), 'plain files, not private', async () => { await readKeyPlain(); keyId = id; keyDraft = {}; }, {enabled: !acting && !status().busy, key: 'plain-key:' + id});
	}
	const plainWords = run => {
		heldFrom(run);
		const waiting = (run?.held?.length || 0) + (run?.media?.held?.length || 0);
		return (run?.conflicts ? run.conflicts + (run.conflicts === 1 ? ' note has' : ' notes have') + ' both versions to review. ' : '')
			+ (waiting ? waiting + (waiting === 1 ? ' file waits' : ' files wait') + ' for the next sync: it changed in two places at once.' : 'notes and files match.');
	};
	const notPrivate = (place, label) => paragraph('plain files in ' + String(place).replace(/^\//, '') + ' on ' + label + '. not private: any app or person with access to that folder can read them.');
	const heldFrom = run => { if (run?.media) heldFiles = (run.media.held || []).map(row => row.name).filter(name => typeof name === 'string'); };
	async function readHeldChoices(own) {
		if (!heldFiles.length || typeof own.mediaChoice !== 'function') return [];
		const refs = await _rapierNotesStore.fileReferences(), out = [];
		for (const path of heldFiles) {
			const [dir, name] = path.split('/'), rows = (dir === 'audio' ? refs.recordings : refs.attachments).get(name)?.live || [];
			for (const {file} of rows) {
				const id = _rapierNotes.index?.notes[file]?.id;
				if (!id) continue;
				try { out.push({choice: await own.mediaChoice({file, id, path}), name, note: _rapierNotes.titles?.get(file) || file.replace(/\.md$/i, '')}); }
				catch (error) { if (error?.code !== 'media_stale') throw error; }
			}
		}
		return out;
	}
	async function settled(stamp, receipt) {
		if (receipt?.file && receipt.id) await _rapierNotesAdoptStored(receipt.file, receipt.id, stamp);
		await _rapierNotesFolderChanged();
	}
	function paintConflicts(own) {
		choice('review conflicts', 'read both versions and choose one', async () => { conflicts = await own.conflicts(); heldChoices = await readHeldChoices(own); }, {key: 'conflicts'});
		if (!conflicts) return;
		paragraph(conflicts.length ? 'read both before you choose; the note’s history keeps the other.' : heldChoices?.length ? 'both copies stay in the folder; choose the one the note shows.' : 'nothing to choose. open the note to fix it by hand.');
		for (const row of conflicts) {
			paragraph(row.file);
			const versions = row.conflict.variants;
			for (const [index, variant] of versions.entries()) {
				value('version ' + (index + 1) + ' of ' + versions.length, variant.text);
				choice('keep this version', 'replaces only these words, unless the note has changed', async () => {
					const stamp = await flush(), receipt = await own.resolve({...row, variant: index});
					await settled(stamp, {...receipt, file: receipt?.file || row.file, id: receipt?.id || _rapierNotes.index?.notes[row.file]?.id});
					conflicts = await own.conflicts();
				});
			}
		}
		for (const row of heldChoices || []) {
			paragraph(row.name + ' in ' + row.note);
			for (const [version, label] of [['local', 'keep this device’s copy'], ['remote', 'keep the other copy']]) {
				choice(label, _rapierNotesBytesWords(row.choice[version].size) + '. the note shows this one.', async () => {
					const stamp = await flush(), receipt = await own.resolve({...row.choice, version});
					await settled(stamp, receipt);
					heldChoices = await readHeldChoices(own);
				});
			}
		}
	}
	async function pickProvider(id) {
		const gate = api().providerGate(id, environment());
		if (!gate.ready) { comingSoon(gate); return; }
		if (providerId !== id) session = null;
		providerId = id; keyId = null; others = true;
		await owner();
		if (!status().authorized) await startSignIn();
	}
	function paintProvider() {
		const id = providerId, state = status(), label = labelOf(id).toLowerCase();
		if (!session && acting) { loading(); return; }
		if (state.notice) { const p = node('p', 'export-choice__description', state.notice); p.setAttribute('role', 'status'); body.append(p); }
		if (state.revocationPending) {
			choice('retry removing access', 'sync stays stopped until ' + label + ' confirms', () => session.signOut());
			return;
		}
		if (!state.authorized) {
			if (plainKept?.provider === id) notPrivate(plainKept.place, label);
			choice('sign in with ' + labelOf(id), plainKept?.provider === id ? 'then sync these files' : '', () => pickProvider(id), {key: 'provider:' + id});
			if (plainKept?.provider !== id) paintBack();
			return;
		}
		if (state.rememberAvailable) {
			const row = node('label', 'export-choice'), field = node('input');
			field.type = 'checkbox'; field.checked = state.rememberDevice; field.disabled = state.busy || acting;
			field.addEventListener('change', () => { const checked = field.checked; void perform(() => session.setRememberDevice(checked)); });
			row.append(field, node('span', 'export-choice__label', 'remember this device')); body.append(row);
		}
		if (plainKept?.provider === id && state.hasConnection) {
			notPrivate(plainKept.place, label);
			choice('sync now', '', async () => { const run = await runSync(); automatic = true; schedule(60000); if (visible) message = plainWords(run); }, {key: 'sync'});
			if (id === 'drive' && api().pickerRegistered(api().DRIVE_PICKER)) choice('choose files other apps made', 'in google drive; they sync from then on', async () => {
				const picked = await api().openDrivePicker({facts: await session.plainDrivePicker(), registration: api().DRIVE_PICKER, origin: location.origin,
					open: (url, name, features) => window.open(url, name, features), listen: fn => { addEventListener('message', fn); return () => removeEventListener('message', fn); }});
				if (!picked) return;
				const run = await runSync(); if (visible) message = plainWords(run);
			}, {key: 'plain-picker'});
			paintConflicts(session);
			choice('stop syncing plain files', 'your notes and the files stay', async () => { await session.plainForget(); plainKept = null; conflicts = null; automatic = false; await _rapierNotesFolderChanged(); }, {key: 'plain-forget'});
		} else {
			paragraph('not private: anyone with access to this folder can read and change your notes.');
			const place = input('folder name', {value: plainPlace});
			place.addEventListener('input', () => { plainPlace = place.value; });
			choice('connect plain files', '', async () => {
				const run = await session.plainConnect({place: place.value});
				await readSaved(); await _rapierNotesFolderChanged(); automatic = true; schedule(60000);
				if (visible) message = plainWords(run);
			}, {key: 'plain-connect'});
		}
		choice('sign out and revoke', 'stops sync and revokes this page’s access; your notes and the files stay', async () => { conflicts = null; automatic = false; await session.signOut(); }, {enabled: true});
		if (!plainKept) paintBack();
	}
	async function startSignIn() {
		const screen = view, current = () => visible && screen === view;
		if (!current()) return;
		await flush(true); if (!current()) return;
		const own = await owner(); if (!current()) return;
		const url = await own.beginSignIn();
		await flush(true); if (current()) location.assign(url);
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
			notPrivate(kept.place, label);
			const fields = keyState.keyHeld ? null : keyFields(id);
			if (fields) paragraph('type the key again: this page does not keep it.');
			keyRemember();
			choice('sync now', '', async () => {
				const settings = fields?.values(); fields?.clear();
				const run = await keySession.syncNow(settings ? {settings} : {});
				keyState = await keySession.status(); await _rapierNotesFolderChanged(); automatic = true; schedule(60000);
				if (visible) message = plainWords(run);
			}, {key: 'sync'});
			paintConflicts(keySession);
			choice('stop syncing plain files', 'your notes and the files stay; this device forgets the key', async () => {
				await keySession.forget(); keyState = await keySession.status(); keyId = null; plainKept = null; conflicts = null; automatic = false; await _rapierNotesFolderChanged();
			}, {key: 'plain-forget'});
			return;
		}
		paragraph(api().PLAIN_DETAIL);
		const fields = keyFields(id), place = input('folder name', {value: plainPlace});
		place.addEventListener('input', () => { plainPlace = place.value; });
		keyAccess(id);
		keyRemember();
		choice('connect plain files', 'checks the storage first; then your notes become files there', async () => {
			const settings = fields.values(); fields.clear();
			const run = await keySession.connect({provider: id, place: place.value, settings});
			keyState = await keySession.status(); keyDraft = {}; await readSaved(); await _rapierNotesFolderChanged(); automatic = true; schedule(60000);
			if (visible) message = plainWords(run);
		}, {key: 'plain-connect'});
		choice('back', '', () => { others = keyId !== 'r2'; keyId = null; }, {enabled: !acting, key: 'back'});
	}
	function paintCompanion() {
		if (!companion) { loading(); return; }
		const gate = companionGate();
		if (!gate.ready) {
			paragraph(gate.reason);
			if (companion.listing) choice('rapier sync', 'get it from google play', openCompanion, {enabled: !acting});
			return;
		}
		if (plainKept?.provider === 'companion') {
			paragraph('plain files in the folder rapier sync chose. anyone with access to it can read them.');
			choice('sync now', '', async () => { const run = await runSync(); automatic = true; schedule(60000); if (visible) message = plainWords(run); }, {key: 'sync'});
			paintConflicts(plainThroughCompanion());
			choice('rapier sync', 'opens rapier sync; it holds the folder and its sign-in or key', openCompanion, {enabled: true});
			choice('stop syncing plain files', 'your notes and the files stay', async () => { await plainThroughCompanion().forget(); plainKept = null; conflicts = null; automatic = false; await _rapierNotesFolderChanged(); }, {key: 'plain-forget'});
			return;
		}
		paragraph(api().PLAIN_DETAIL);
		const places = companionPlaces?.places || [];
		if (!places.length) paragraph('choose a folder for plain files in rapier sync first.');
		const serviceLabel = id => (api().PROVIDERS?.[id]?.label || api().KEY_PLAIN_LABELS?.[id] || id).toLowerCase();
		for (const place of places) choice(serviceLabel(place.service), 'plain files in the folder rapier sync chose', async () => {
			const run = await plainThroughCompanion().connect(place.id);
			await readSaved(); await _rapierNotesFolderChanged(); automatic = true; schedule(60000);
			if (visible) message = plainWords(run);
		}, {key: 'plain-place:' + place.id});
		choice('rapier sync', 'opens rapier sync: choose a folder for plain files there', openCompanion, {enabled: true});
	}
	function syncBlocked() {
		if (_rapierNotesIsLocked()) return 'notes_locked';
		if (!plainKept) return 'notes_sync_not_configured';
		if (plainKept.provider === 'companion') return companionSeam() ? '' : 'notes_sync_not_configured';
		if (keyProvider(plainKept.provider)) return keyState?.connection && keyState.keyHeld ? '' : 'notes_sync_locked';
		return session?.status().authorized && session.status().hasConnection ? '' : 'notes_sync_sign_in_required';
	}
	async function runSync(guard = () => {}) {
		if (_rapierNotesIsLocked()) throw Object.assign(new Error('Locked notes cannot sync.'), {code: 'notes_locked', notesSyncStarted: false});
		syncing = true;
		try {
			await flush();
			try { guard(); } catch (error) { throw Object.assign(new Error(error?.message || 'Sync was not admitted.'),
				{name: error?.name || 'Error', code: error?.code, cause: error, notesSyncStarted: false}); }
			const provider = plainKept?.provider;
			const result = provider === 'companion' ? await plainThroughCompanion().syncNow()
				: keyProvider(provider) ? await keySession.syncNow() : await session.plainSyncNow();
			if (keyProvider(provider)) keyState = await keySession.status();
			heldFrom(result);
			await _rapierNotesFolderChanged(); return result;
		}
		finally { syncing = false; wearBox(); }
	}
	async function syncNow({signal, guard} = {}) {
		if (_rapierNotesIsLocked()) return {action: 'now', synced: false, reason: 'notes_locked', message: 'Locked notes cannot sync.'};
		let submitted = false;
		const stopped = () => { if (signal?.aborted) throw new DOMException('The sync request was canceled.', 'AbortError'); guard?.(); };
		const refused = reason => ({action: 'now', synced: false, reason});
		try {
			stopped();
			if (!api()) return refused('notes_sync_not_configured');
			await readSaved(); stopped();
			if (!plainKept) return refused('notes_sync_not_configured');
			if (keyProvider(plainKept.provider)) { await readKeyPlain(); stopped(); }
			else if (plainKept.provider !== 'companion' && !session) { await owner(); stopped(); }
			const blocked = syncBlocked(); if (blocked) return refused(blocked);
			if (acting || syncing || session?.status().busy) return refused('notes_sync_busy');
			submitted = true;
			const result = await runSync(stopped);
			const held = (result?.held?.length || 0) + (result?.media?.held?.length || 0), both = result?.conflicts || 0;
			return {action: 'now', synced: true, complete: !held, held, conflicts: both};
		} catch (error) {
			if (submitted && error?.notesSyncStarted !== false) return {outcome: 'uncertain', reason: 'notes_sync_unconfirmed'};
			if (error?.code === 'notes_locked') throw Object.assign(new Error(error.message), {code: error.code, cause: error, notesSyncStarted: false});
			if (error?.name === 'AbortError') return {refused: 'cancelled'};
			return refused(error?.code === 'auth' ? 'notes_sync_sign_in_required' : 'notes_sync_failed');
		}
	}
	let dueAt = 0, settingsQuiet = false;
	function schedule(delay) {
		clearTimeout(timer); dueAt = 0; settingsQuiet = false;
		if (!automatic) return;
		dueAt = Date.now() + delay;
		timer = setTimeout(async () => {
			dueAt = 0;
			if (syncBlocked()) { automatic = false; return; }
			if (visible || document.hidden || navigator.onLine === false || acting || syncing || session?.status().busy) { schedule(10000); return; }
			try { await runSync(); }
			catch (error) { message = said(error, 'sync is waiting for a connection.'); }
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
		if (!document.hidden && visible && mode() === 'companion' && companion) void perform(askCompanion, false);
	});
	function open({initialize = true, others: atOthers = false} = {}) {
		if (_rapierNotesIsLocked()) return;
		if (!overlay) {
			overlay = document.getElementById('notes-sync-overlay');
			if (!overlay) return;
			body = overlay.querySelector('.notes-sync-body');
			overlay.querySelector('.notes-sync-close').addEventListener('click', close);
			overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
		}
		visible = true; const screen = ++view;
		if (atOthers && !environment().native) others = true;
		if (mode() === 'companion') companion = null;
		if (initialize) void perform(async () => {
			await readSaved();
			if (mode() === 'companion') { await askCompanion(); if (plainKept?.provider === 'companion' && !syncBlocked()) { automatic = true; schedule(1600); } return; }
			if (!environment().native) await readKeyPlain();
			if (!visible || screen !== view) return;
			if (keyId && !syncBlocked()) { automatic = true; schedule(1600); }
			if (providerId && !keyId) { const prior = session; await owner(); if (prior === session && !status().busy) await session.inspect(); }
		}, false);
		paint(); openDialog(overlay, {panel: '.settings-panel', onEscape: close});
	}
	function consume(context) {
		const hash = context.hash || location.hash || '';
		const fragment = /(?:^#|&)(?:access_token|error)=/.test(hash) && /(?:^#|&)state=/.test(hash) ? hash : '';
		if (!fragment && !context.params.has('code') && !context.params.has('error')) return;
		const returnedState = fragment ? new URLSearchParams(fragment.slice(1)).get('state') : context.params.get('state');
		let sent = null;
		try { sent = JSON.parse(sessionStorage.getItem(providerPendingKey())); } catch (_) {}
		const at = new URL(location.href), search = fragment || context.params.toString(), callback = at.origin + at.pathname;
		history.replaceState(null, '', _rapierBootPathAndQuery());
		if (!sent || !api().isOtherProvider(sent.provider) || sent.state !== returnedState) return;
		session = null; keyId = null; providerId = sent.provider; others = true;
		open({initialize: false});
		const screen = view;
		if (providerGate().ready) void perform(async () => {
			await readSaved();
			const own = await owner(); if (!visible || screen !== view) return;
			await own.finishSignIn(search, callback);
		});
	}
	const facts = () => Object.freeze({connected: !!plainKept, provider: plainKept?.provider || null, ready: !!plainKept && !syncBlocked(),
		busy: acting || syncing || !!session?.status().busy});
	return Object.freeze({open, consume, status: facts, changed, syncNow});
})();
