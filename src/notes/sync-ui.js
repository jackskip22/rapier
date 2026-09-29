// One sheet, one session owner. This is editor glue, not another sync implementation.
// The bucket-key route and the registered sign-in each have their own admission gate.
const _rapierNotesSyncUi = (() => {
	let session = null, initializing = null, overlay = null, body = null, visible = false;
	let message = '', recovery = null, conflicts = null, joined = false, setup = null, route = null, acting = false, joinCode = '', replacing = false;
	const api = () => globalThis.RapierNotesSyncSession;
	const environment = () => ({url: location.href,
		native: ['android', 'windows'].includes(String(globalThis.RapierPlatform?.environment?.id || '').toLowerCase()),
		framed: window.top !== window});
	const oauthGate = () => api()?.syncAvailability(environment()) || {ready: false, reason: 'cloudflare sync did not load. backup saves your notes to a file.'};
	const keyGate = () => api()?.r2KeyAvailability(environment()) || {ready: false, reason: oauthGate().reason};
	const mode = () => session?.status().mode || route || (keyGate().ready || !oauthGate().ready ? 'r2-key' : 'oauth');
	const availability = () => mode() === 'r2-key' ? keyGate() : oauthGate();
	const status = () => session?.status() || {authorized: false, unlocked: false, busy: false, gate: availability()};
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
		body.append(el); return el;
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
	function choice(label, description, action, {enabled = !status().busy && !acting} = {}) {
		const button = node('button', 'export-choice'); button.type = 'button'; button.disabled = !enabled;
		button.append(node('span', 'export-choice__label', label), node('span', 'export-choice__description', description));
		button.addEventListener('click', () => { button.disabled = true; void perform(action); }); body.append(button);
	}
	// The Notes settings panel's box (law 54, notes/notes.js _rapierNotesSyncBoxWear) says what the sync is
	// now: connected or not, and the last finished run's time. It is worn again whenever that can change.
	const wearBox = () => { if (typeof _rapierNotesSyncBoxWear === 'function') _rapierNotesSyncBoxWear(); };
	async function perform(action) {
		message = ''; acting = true;
		try { await action(); }
		catch (error) { if (visible) message = String(error?.message || 'that did not finish; your notes are unchanged.'); }
		finally { acting = false; paint(); renderSettings(); wearBox(); }
	}
	async function owner() {
		if (session) return session;
		if (initializing) return initializing;
		const gate = availability(); if (!gate.ready) throw new Error(gate.reason);
		initializing = (async () => {
			await _rapierNotesReady(); await _rapierNotesStore.kind();
			const saved = (await api().readSyncState(_rapierNotesStore.folder)).vault;
			if (saved?.mode) route = saved.mode;
			const opened = api().createSyncSession({folder: _rapierNotesStore.folder, mode: mode(),
				fetch: window.fetch.bind(window), pendingStorage: sessionStorage,
				pendingKey: 'rapier:cloudflare:pending' + RapierStorage.scope, environment: environment(),
				onChange: () => { paint(); renderSettings(); wearBox(); }});
			await opened.inspect(); session = opened; return opened;
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
		if (setup || !status().hasConnection || mode() === 'r2-key' && !status().credentialStored) void session?.cancelSetup?.();
		visible = false; recovery = null; conflicts = null; setup = null; joinCode = ''; replacing = false; message = '';
		clearBody(); if (overlay) closeDialog(overlay); wearBox();
	}
	function paint() {
		if (!visible || !body) return;
		clearBody();
		const gate = availability(), state = status();
		if (message) { const p = node('p', 'export-choice__description', message); p.setAttribute('role', 'alert'); body.append(p); }
		if (!gate.ready) {
			paragraph(gate.reason);
			paragraph('this copy cannot sync, and nothing has been uploaded.');
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
		if (state.revocationPending) {
			choice('retry removing access', 'sync stays stopped until cloudflare confirms', () => session.signOut());
			paragraph('closing this page does not remove rapier’s access: first remove it under manage oauth authorizations in cloudflare.');
			return;
		}
		if (mode() === 'oauth' && !state.authorized) {
			paragraph(api().SYNC_CONSENT);
			paragraph('the sign-in lasts only while this page is open, and syncs nothing until you unlock a vault and press sync now.');
			choice('sign in with cloudflare', 'grants the account-wide access above', async () => {
				await flush(true); const own = await owner(); const url = await own.beginSignIn();
				// PKCE hashing may yield; flush once more before leaving the current document.
				const stamp = await flush(true);
				if (!_rapierMutationStampIsCurrent(stamp)) throw new Error('your document changed before sign-in: save it first.');
				location.assign(url);
			});
			if (keyGate().ready && !state.hasConnection && !state.rejoinRequired) choice('use a bucket key', 'connects only the r2 bucket you choose', async () => { session = null; route = 'r2-key'; await owner(); });
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
		if (recovery) {
			paragraph('this code unlocks the vault: save it outside rapier, never in a note, and share it with no one.');
			value('recovery code', recovery.recovery); value('vault address — for your other device', recovery.address);
			choice('i have kept it', 'hides the code', () => { recovery = null; });
		} else if (!state.hasConnection && !state.address || state.rejoinRequired) {
			if (joined || state.rejoinRequired) {
				const address = input('vault address from your other device'), secret = input('vault passphrase', {secret: true});
				choice('connect existing vault', 'it unlocks here, never at cloudflare', async () => {
					const parameters = {address: address.value, secret: secret.value}; secret.value = '';
					try { await session.join(parameters); } finally { parameters.secret = ''; }
				});
				choice('use a recovery code instead', 'the recovery code stays in this page', async () => {
					const parameters = {address: address.value, secret: secret.value, recovery: true}; secret.value = '';
					try { await session.join(parameters); } finally { parameters.secret = ''; }
				});
				choice('create a new vault instead', 'in an r2 bucket of your own', () => { joined = false; });
			} else {
				paragraph('make an r2 bucket in your cloudflare account, then name it here.');
				const account = input('cloudflare account id'), bucket = input('r2 bucket'), region = jurisdiction();
				const secret = input('new vault passphrase', {secret: true}), repeat = input('repeat passphrase', {secret: true});
				choice('create vault', 'nothing uploads until you press sync now', async () => {
					const parameters = {accountId: account.value.trim(), bucket: bucket.value.trim(), jurisdiction: region.value, passphrase: secret.value};
					const matches = secret.value === repeat.value; secret.value = ''; repeat.value = '';
					try { if (!matches) throw new Error('the passphrases do not match.'); const made = await session.create(parameters); if (visible) recovery = made; }
					finally { parameters.passphrase = ''; }
				});
				choice('connect another device’s vault', 'paste its vault address and unlock it here', () => { joined = true; });
			}
		} else if (!state.unlocked) {
			const secret = input('vault passphrase or recovery code', {secret: true});
			for (const recover of [false, true]) choice(recover ? 'unlock with recovery code' : 'unlock vault', 'the key never leaves this page', async () => {
				let value = secret.value; secret.value = '';
				try { await session.unlock(value, {recovery: recover}); } finally { value = ''; }
			});
		} else {
			value('device code — for your other device', state.address);
			choice('copy device code', 'paste it on your other device, then type the vault passphrase', async () => {
				if (!navigator.clipboard?.writeText) throw new Error('select the device code above and copy it.');
				await navigator.clipboard.writeText(state.address); message = 'device code copied.';
			});
			choice('sync now', 'sends and receives changes; a conflict holds both versions for you', async () => {
				await flush(); await session.syncNow(); await _rapierNotesFolderChanged(); conflicts = await session.conflicts();
			});
			choice('review conflicts', 'read both versions and choose one', async () => { conflicts = await session.conflicts(); });
			if (conflicts) {
				paragraph(conflicts.length ? 'read both before you choose; the vault still holds the originals.' : 'nothing to choose here. conflicts edited by hand, or in a note’s details, stay in the note: open it in the editor.');
				for (const row of conflicts) {
					paragraph(row.file);
					for (const [index, variant] of row.conflict.variants.entries()) {
						paragraph('version from ' + variant.device);
						value('version text', variant.text);
						choice('keep this version', 'replaces only these words, unless the note has changed', async () => {
							await flush(); await session.resolve({...row, variant: index});
							await _rapierNotesFolderChanged(); conflicts = await session.conflicts();
						});
					}
				}
			}
		}
		paintVaultChoices(state);
		choice('lock vault', 'stops sync here; your notes stay readable', async () => { recovery = null; conflicts = null; await session.lock(); }, {enabled: true});
		if (mode() === 'r2-key') {
			paragraph('forgetting the key here does not end its access: delete the key in cloudflare. device codes you copied still hold it, encrypted.');
			choice('forget bucket key', 'stops sync here and forgets the key; your notes stay', async () => { setup = null; conflicts = null; await session.forgetKey(); }, {enabled: true});
		} else choice('sign out and revoke', 'stops sync and revokes this page’s access; your notes stay', async () => { recovery = null; conflicts = null; await session.signOut(); }, {enabled: true});
	}
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
		choice('start a new vault', 'leaves this vault and keeps every note, then asks for a new passphrase', leaveVaultChoice);
	}
	function paintKeyReplacement(state) {
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
			for (const recover of [false, true]) choice(recover ? 'connect with recovery code' : 'connect existing vault', 'nothing syncs until you press sync now', async () => {
				const parameters = {address: address.value, secret: secret.value, recovery: recover}; joinCode = address.value; secret.value = '';
				try { await (await owner()).join(parameters); joined = false; joinCode = ''; } finally { parameters.secret = ''; }
			});
			if (state.hasConnection && state.credentialStored && !state.rejoinRequired) choice('back to vault', 'keeps the saved connection', () => { joined = false; joinCode = ''; });
			if (!state.hasConnection && !state.rejoinRequired) choice('create a new vault instead', 'choose a passphrase for a new vault', () => { joined = false; });
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
	function open() {
		if (!overlay) {
			overlay = document.getElementById('notes-sync-overlay');
			if (!overlay) return;
			body = overlay.querySelector('.notes-sync-body');
			overlay.querySelector('.notes-sync-close').addEventListener('click', close);
			overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
		}
		visible = true;
		if (availability().ready) void perform(async () => { await owner(); });
		paint(); openDialog(overlay, {panel: '.settings-panel', onEscape: close});
	}
	function consume(context) {
		if (!context.params.has('code') && !context.params.has('error')) return;
		const search = context.params.toString(), callback = location.href;
		history.replaceState(null, '', _rapierBootPathAfterIntake());
		if (mode() !== 'oauth') { session = null; route = 'oauth'; }
		open();
		if (availability().ready) void perform(async () => { await (await owner()).finishSignIn(search, callback); });
	}
	return Object.freeze({open, consume, status});
})();
