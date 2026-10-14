const RAPIER_NOTES_DIR = 'notes', RAPIER_NOTES_HOLD_MS = 500, RAPIER_NOTES_HOLD_SLOP = 8, RAPIER_NOTES_MOVED_PX = 8, RAPIER_NOTES_DWELL_MS = 120, RAPIER_NOTES_AUTOSAVE_MS = 700, RAPIER_NOTES_REMIND_MS = 30000;
const _rapierNotes = {
	surface: null, scroll: null, grids: {}, windows: {}, sheet: null, sheetRelease: null, open: false,
	index: null, texts: new Map(), titles: new Map(), hold: new Set(), sizes: new Map(), readFailed: new Map(), reading: null, reads: null, loadGen: 0, popup: null, sheetSwiped: false, fabDrag: null,
	backgroundTouches: new Set(), backgroundInput: false, backgroundComposing: false,
	query: '', current: null, currentProof: null, savedGen: -1, savedReceipt: null, savingGen: -1, savingText: null, savingDigest: null, autosave: 0, asciiNames: null, drag: null, selected: new Set(), snack: null, loading: null, indexing: null, persistAsked: false, persistReported: false, storageKnown: null, audioBytes: null, capturing: null, renderAfterDrag: false, saveFailed: false, attempted: new Map(), attemptedLedger: new Map(), sheetFocus: false, sheetOpener: null, sheetMode: 'actions', importsOpen: null, importUndoReview: null, importUndoBusy: false, historyRows: null, historyOne: null, pastBytes: null, pastVersions: 0, untitled: new Set(), renaming: null, swallowClick: 0, unfolded: new Set(), thumbs: new Map(), thumbNames: null, thumbQueue: [], thumbBusy: false, remindTimer: 0, remindQueue: [], mode: false, compose: false, opened: new Set(), retaking: null, readerSaid: false, captureToken: null, capturePreparing: false, captured: new Set(), captureChain: Promise.resolve(), unlocking: null, remindSyncedKey: undefined, remindChain: Promise.resolve(),
	head: {observer: null, scheduled: false, bound: null, slot: null, fresh: null, rows: null}
};
function _rapierNotesDocumentBound() {
	const state = _rapierNotes, proof = state.currentProof, store = _rapierNotesStore;
	return !!proof && !!state.current && (state.current === proof.file || state.index?.notes[state.current]?.id === proof.id) &&
		Object.values(state.index?.notes || {}).filter(entry => entry.id === proof.id).length === 1 &&
		proof.folder === store.folder && proof.bytes === store.bytes &&
		proof.authority === String(rapier.identity.authority) && proof.epoch === Number(rapier.identity.epoch || 0);
}
function _rapierNotesModel() { return globalThis.RapierNotesModel; }
function _rapierNotesNoticeModel() {
	return {
		occlusion: globalThis.RapierOcclusion,
		viewport: globalThis.RapierOcclusionViewport,
		life: globalThis.RapierTransientLifecycle,
		surfaces: globalThis.RapierBottomSurfaces,
	};
}
function _rapierNotesBody(text) { const F = globalThis.RapierNotesFrontMatter; return F ? F.stripFrontMatter(String(text || '')) : String(text || ''); }
async function _rapierNotesReady() {
	for (let i = 0; i < 100 && !globalThis.RapierNotesModel; i++) await new Promise(resolve => setTimeout(resolve, 50));
	if (!globalThis.RapierNotesModel) throw new Error('the Notes model did not load');
}

async function _rapierNotesUnlock() {
	if (!_rapierNotes.captureToken) return true;
	const unlock = globalThis.RapierPlatform?.host?.unlockNotes;
	if (!unlock) return false;
	if (!_rapierNotes.unlocking) _rapierNotes.unlocking = Promise.resolve().then(unlock).then(result => {
		if (result?.unlocked !== true) return false;
		_rapierNotes.captureToken = null; return true;
	}).catch(error => { showToast('Unlock could not be completed. Your capture remains open.', 'error'); console.warn('[rapier] notes', error); return false; })
		.finally(() => { _rapierNotes.unlocking = null; });
	return _rapierNotes.unlocking;
}
function _rapierNotesRemember() {
	const state = _rapierNotes;
	if (state.cameFrom !== undefined) return state.cameFrom;
	if (_rapierNotesOwnTheDocument()) return null;
	const snapshot = _rapierCreatePersistenceSnapshot(), history = _rapierCreateHostUndoCheckpoint();
	if (!snapshot.documentAuthority && snapshot.canonicalText === '' &&
			!history?.ledger?.length && !history?.branch?.length) return null;
	return Object.freeze({snapshot, history,
		view: _rapierCaptureViewContinuity(), bom: rapier.document.bom === true});
}
async function _rapierNotesEditor() {
	if (!await _rapierNotesUnlock()) {
		showToast('Unlock to return to Rapier. Your capture remains open.', 'info');
		return false;
	}
	const state = _rapierNotes;
	if (state.returning) return state.returning;
	state.returning = true;
	state.returning = (async () => {
		const from = state.cameFrom;
		try {
			const guard = state.current && !state.returnRefused && _rapierNotesOwnTheDocument() ? await _rapierNotesFlush() : _rapierMutationStamp();
			if (from !== undefined || state.current) {
				const saved = from?.snapshot;
				const loaded = await rapierLoad(saved ? saved.canonicalText : '', saved ? saved.filename : 'untitled.md', {
					expectedMutationStamp: guard, returnReceipt: true, restore: !!saved, deferFlush: true, notesReturn: true,
					...(saved ? {documentAuthority: saved.documentAuthority, documentKind: saved.docKind,
						virtualDocumentKind: saved.virtualDocumentKind, saveAsRequired: saved.saveAsRequired,
						restoredRevisionState: saved} : {}),
				});
				if (!loaded || !_rapierLoadReceiptIsCurrent(loaded)) {
					if (state.cameFrom === from && !_rapierMutationStampSharesDocument(guard)) state.returnRefused = true;
					throw new Error('the document changed or is busy. Try again.');
				}
				if (saved) {
					state.returnRefused = true;
					rapier.access.notesReadOnly = false; rapierSetReadOnly(false);
					_rapierResetSource(saved.canonicalText, saved.sourceRootId);
					if (!_rapierInstallRestoredHistory(from.history)) console.warn('[rapier] notes: the document is back without its undo history (' + String(rapier.undo.trimReason || '') + ')');
					rapier.document.bom = from.bom;
					if (from.view && !_rapierRestoreViewContinuity(from.view)) throw new Error('the reading point could not be restored');
					_notifyHistoryState(); _notifyDirtyState();
				}
			}
			state.returnRefused = false;
			_rapierNotesLeaveNote();
			state.cameFrom = undefined;
			_rapierNotesPopup(null); _rapierNotesClose(true);
			const source = document.getElementById('source-textarea');
			(source?.getClientRects().length ? source : document.getElementById('editor-blocks'))?.focus({ preventScroll: true });
			return true;
		} catch (error) {
			if (state.returnRefused) { rapier.access.notesReadOnly = true; rapierSetReadOnly(false); }
			showToast('Rapier could not be reopened: ' + String(error?.message || error), 'error');
			return false;
		}
	})().finally(() => { state.returning = null; });
	return state.returning;
}
function _rapierNotesIsApp() { return globalThis.RapierPlatform?.environment.android === true; }

const _rapierNotesPending = {
	prefix: 'rapier-notes-pending:', held: new Map(), replaying: null, live: null, claiming: null, queued: false,
	soon() {
		if (this.queued) return;
		this.queued = true;
		queueMicrotask(() => { this.queued = false; this.keep({settle: false}); });
	},
	async claim() {
		if (this.live) return true;
		if (this.claiming) return this.claiming;
		if (!navigator.locks?.request) return false;
		const id = crypto.randomUUID();
		this.claiming = new Promise(resolve => {
			Promise.resolve().then(() => navigator.locks.request('rapier-notes-pending-owner:' + id,
				{mode: 'exclusive', ifAvailable: true}, async lock => {
					if (!lock) { resolve(false); return; }
					await new Promise(done => {
						const live = {id, release: () => { if (this.live === live) this.live = null; done(); }};
						this.live = live; resolve(true);
					});
				})).catch(() => { if (this.live?.id === id) this.live.release(); resolve(false); });
		}).finally(() => { this.claiming = null; });
		return this.claiming;
	},
	kind() {
		const store = _rapierNotesStore;
		return store.native ? 'native' : store.durable ? 'opfs' : store.bytes?.kind;
	},
	digest(text) {
		const H = globalThis.RapierNotesIntegrity, hash = H.sha256State();
		hash.update(H.exactBytes(text)); return hash.finish();
	},
	known(proof, stamp, text) {
		if (!proof?.id) return null;
		if (proof.text === text) return proof.digest;
		const prior = this.held.get(proof.id + ':' + stamp.documentEpoch);
		if (prior?.text === text && !prior.paste && prior.stamp.documentAuthority === stamp.documentAuthority) return prior.digest;
		const state = _rapierNotes;
		return state.savingText === text ? state.savingDigest : null;
	},
	paste(fold) {
		if (!fold.context) return {text: _rapierSourceText(), paste: {route: 'unresolved', text: fold.text, payload: fold.payload, ...(fold.steps ? {steps: fold.steps} : {}), ...(fold.surfaces ? {surfaces: fold.surfaces} : {})}};
		const model = {blocks: rapier.document.blocks.map(_rapierHistoryBlock), nextBlockId: rapier.identity.nextBlockId,
			frontmatter: rapier.document.frontmatter, markdownPrefix: rapier.document.markdownPrefix,
			markdownTail: rapier.document.markdownTail, sourceNewline: rapier.document.sourceNewline};
		const {startIndex, replaceCount, prefixRaw, suffixRaw} = fold.context;
		if (typeof fold.raw === 'string') model.blocks[startIndex].raw = fold.raw;
		const context = {startIndex, replaceCount, prefixRaw, suffixRaw};
		const text = _rapierComposeMarkdownDocument(_rapierMarkdownBodyFromRows(model.blocks, model.markdownPrefix, model.markdownTail), model.frontmatter);
		return {text, paste: {model, context, text: fold.text, content: fold.content, route: fold.title && fold.route !== 'unresolved' ? 'title' : fold.route, ...(fold.replaceWithEmpty === true ? {replaceWithEmpty: true} : {}), ...(fold.title ? {title: fold.title} : {}), ...(fold.payload ? {payload: fold.payload} : {}), ...(fold.steps ? {steps: fold.steps} : {}), ...(fold.surfaces ? {surfaces: fold.surfaces} : {})}};
	},
	job(payload) {
		if (!_rapierNotesInANote() || !_rapierNotes.currentProof?.id || _rapierNotes.returnRefused) return null;
		const stamp = _rapierMutationStamp();
		try {
			const selection = window.getSelection(), range = selection?.rangeCount ? selection.getRangeAt(0) : null;
			const context = _rapierCapturePasteContext(range);
			if (!context) throw new Error('The paste has no complete insertion boundary.');
			const route = globalThis.RapierNotesFields?.selected()?.kind === 'title' ? 'title' : 'plan';
			return {...this.paste({context, text: String(payload.plain || ''), route, payload, ...(route === 'title' ? {title: globalThis.RapierNotesFields.titleParts(range)} : {})}), stamp};
		} catch (_) {
			return {text: _rapierSourceText(), paste: {text: String(payload.plain || ''), payload, route: 'unresolved'}, stamp};
		}
	},
	text() {
		const native = _rapierEditingRuntime.nativeInput;
		if (native) {
			if (native.fieldGuard) { const packet = _rapierNativeInputPacket(native); if (!packet) throw new Error('The native field input is still retained but its source changed.'); return this.paste(packet); }
			const fold = _rapierFoldCompositionClones(native.editDiv, '', true);
			if (!fold) throw new Error('The composing note has no complete insertion boundary.');
			if (native.blockId === _rapierNotes.head.slot || globalThis.RapierNotesFields?.nativeStamp(native)?.kind === 'title') fold.route = 'title';
			return this.paste(fold);
		}
		const job = _rapierEditingRuntime.pasteJob, held = job?.notes;
		if (held && !job.committed && !job.cancelled && _rapierMutationStampSharesDocument(held.stamp) && _rapierSourceText() === held.text) {
			try { return {text: held.text, paste: {...held.paste, content: _rapierResolvePastePayload(held.paste.payload)}}; }
			catch (_) { return {text: held.text, paste: {...held.paste, route: 'unresolved'}}; }
		}
		if (_rapierEditingRuntime.inputPending()) throw new Error('The composing note has no complete insertion boundary.');
		const idle = _rapierNotesHeadIdle();
		if (idle != null) return {text: idle};
		if (rapier.document.docKind !== 'markdown' || rapier.view.mode === 'source') return {text: _rapierSourceText()};
		const active = _activeBlockEditContext();
		if (!active) return {text: _rapierSourceText()};
		const edit = active.editDiv;
		if (active.wrapper.querySelectorAll(':scope > .block-edit').length > 1) {
			let fold;
			try { fold = _rapierFoldCompositionClones(edit, '', true); } catch (_) {}
			if (!fold) return {text: _rapierSourceText(), paste: {route: 'unresolved',
				surfaces: [...active.wrapper.querySelectorAll(':scope > .block-edit')].map(node => String(node.textContent || ''))}};
			if (active.block.id === _rapierNotes.head.slot) fold.route = 'title';
			return this.paste(fold);
		}
		let live = _rapierLiveEditRaw(edit, active.wrapper);
		const before = String(active.block.raw || '');
		if (live === before || edit._rapierEditOpenedAs != null &&
			live === edit._rapierEditOpenedAs && String(edit._rapierEditOpenedRaw ?? '') === before) return {text: _rapierSourceText()};
		if (active.block.id === _rapierNotes.head.slot && edit.textContent.trim() && !edit.querySelector('h1')) {
			const heading = _rapierApplyExactBlock('h1', {wrappers: [active.wrapper], blocksBefore: [{...active.block, raw: live}]}, {projectSource: true});
			if (typeof heading === 'string') live = heading;
		}
		const raw = new Map([[active.block.id, live]]);
		return {text: _rapierComposeMarkdownDocument(_rapierMarkdownBodyFromBlocks(rapier.document.blocks, raw), rapier.document.frontmatter)};
	},
	keep({settle = true} = {}) {
		const state = _rapierNotes, proof = state.currentProof, kind = this.kind();
		if (!proof?.id || state.returnRefused || !_rapierNotesInANote() || !['native', 'opfs', 'indexeddb'].includes(kind)) return false;
		try {
			const active = _activeBlockEditContext();
			if (settle && rapier.composition.block && active?.block.id === state.head.slot && active.wrapper.querySelectorAll(':scope > .block-edit').length === 1) {
				try { active.editDiv.blur(); } catch (_) {}
				if (rapier.composition.block) _rapierHandleEditCompositionEnd(active.editDiv);
				_rapierNotesHeadTurn();
			}
			const captured = this.text();
			return this.retain(proof, _rapierMutationStamp(), captured.text, false, captured.paste);
		} catch (error) {
			showToast('This note could not be kept for restart: ' + String(error?.message || error) + '. Keep this page open until the note is saved.', 'error', {outlive: 'save-failed'});
			return false;
		}
	},
	retain(proof, stamp, text, settled = false, paste = null) {
		if (!proof?.id) return false;
		const state = _rapierNotes, kind = this.kind(), file = proof.file || state.current;
		if (!['native', 'opfs', 'indexeddb'].includes(kind)) return false;
		try {
			const digest = !paste && this.known(proof, stamp, text) || this.digest(paste ? JSON.stringify({text, paste}) : text);
			const token = proof.id + ':' + stamp.documentEpoch, prior = this.held.get(token), key = prior?.key || this.prefix + crypto.randomUUID();
			if (!paste && state.savingText === text) state.savingDigest = digest;
			if (settled && prior && (prior.stamp.docGeneration > stamp.docGeneration ||
				prior.stamp.docGeneration === stamp.docGeneration && prior.digest !== digest)) return false;
			const expectedDigest = [...new Set([proof.digest, state.attempted.get(file),
				...(state.savingText == null ? [] : [state.savingDigest || this.digest(state.savingText)])].filter(value => typeof value === 'string'))];
			if (digest === proof.digest && expectedDigest.every(value => value === digest) && !prior) return true;
			if (!this.live) throw new Error('This page could not claim its unfinished note.');
			const same = prior && prior.digest === digest && prior.text === text && prior.paste === paste && prior.store === kind &&
				prior.owner === this.live.id && prior.file === file && prior.expectedDigest.length === expectedDigest.length &&
				prior.expectedDigest.every((value, i) => value === expectedDigest[i]);
			const serial = same ? prior.serial : JSON.stringify({version: 1, store: kind, owner: this.live.id, file, id: proof.id, expectedDigest, text, digest, ...(paste ? {paste} : {})});
			if (localStorage.getItem(key) !== serial) localStorage.setItem(key, serial);
			this.held.set(token, {key, serial, id: proof.id, stamp, digest, text, paste, store: kind, owner: this.live.id, file, expectedDigest});
			if (digest === proof.digest && expectedDigest.every(value => value === digest)) this.forget(proof, stamp, digest);
			return true;
		} catch (error) {
			showToast('This note could not be kept for restart: ' + String(error?.message || error) + '. Keep this page open until the note is saved.', 'error', {outlive: 'save-failed'});
			return false;
		}
	},
	forget(proof, stamp, digest) {
		if (!proof?.id || !stamp) return;
		for (const [token, record] of this.held) {
			if (record.id !== proof.id || record.stamp.documentEpoch !== stamp.documentEpoch ||
				record.stamp.documentAuthority !== stamp.documentAuthority || record.stamp.docGeneration > stamp.docGeneration ||
				record.stamp.docGeneration === stamp.docGeneration && record.digest !== digest) continue;
			try {
				if (localStorage.getItem(record.key) === record.serial) localStorage.removeItem(record.key);
				this.held.delete(token);
			} catch (_) {  }
		}
	},
	async resolve(record) {
		if (!record.paste) return record.text;
		const {model, context, content, route, text} = record.paste;
		if (!model || !Array.isArray(model.blocks) || model.blocks.some(row => !Number.isSafeInteger(row?.id) || typeof row.raw !== 'string' || row.leading != null && typeof row.leading !== 'string') ||
			!Number.isSafeInteger(model.nextBlockId) || !context || !Number.isSafeInteger(context.startIndex) || context.startIndex < 0 ||
			!Number.isSafeInteger(context.replaceCount) || context.replaceCount < 1 || context.startIndex + context.replaceCount > model.blocks.length ||
			typeof context.prefixRaw !== 'string' || typeof context.suffixRaw !== 'string' ||
			typeof text !== 'string' || (route !== 'title' && record.paste.replaceWithEmpty !== true && (!content || typeof content.markdown !== 'string' || typeof content.plainText !== 'boolean')) ||
			_rapierComposeMarkdownDocument(_rapierMarkdownBodyFromRows(model.blocks, model.markdownPrefix, model.markdownTail), model.frontmatter) !== record.text) throw new Error('The composing note has no complete source context.');
		if (route !== 'plan' && route !== 'title') throw new Error('The keyboard input is kept with its original note and insertion point, but could not be applied yet.');
		const held = {...context, startBlock: model.blocks[context.startIndex], endBlock: model.blocks[context.startIndex + context.replaceCount - 1]};
		let plan;
		if (route === 'title') {
			const title = record.paste.title, head = _rapierNotesModel().noteHead(model.blocks.map(row => row.raw));
			if (head.title !== context.startIndex && !(head.title < 0 && head.at === context.startIndex)) throw new Error('The kept title field is no longer identifiable.');
			const words = await globalThis.RapierNotesFields.titleText(record.paste.payload || {plain: text});
			plan = globalThis.RapierNotesFields.titlePlanFromParts(held, title, words, model, record.paste.replaceWithEmpty === true);
		} else {
			const parsed = record.paste.replaceWithEmpty === true ? [{raw: '', type: 'paragraph'}] : await splitPastedMarkdownBlocksAsync(content.markdown, {plainText: content.plainText});
			plan = _rapierBuildPastePlan(held, parsed, model);
		}
		if (!plan) throw new Error('The composing note could not be prepared.');
		const rows = model.blocks.slice(); rows.splice(context.startIndex, context.replaceCount, ...plan.blocks);
		return _rapierComposeMarkdownDocument(_rapierMarkdownBodyFromRows(rows, model.markdownPrefix, model.markdownTail), model.frontmatter);
	},
	async recover() {
		if (this.replaying) return this.replaying;
		this.replaying = (async () => {
			const kind = this.kind(), own = new Set([...this.held.values()].map(record => record.key));
			if (!['native', 'opfs', 'indexeddb'].includes(kind)) return false;
			let keys;
			try { keys = Array.from({length: localStorage.length}, (_, i) => localStorage.key(i)).filter(key => key?.startsWith(this.prefix) && !own.has(key)); }
			catch (_) { return false; }
			let changed = false;
			for (const key of keys) {
				try {
					const serial = localStorage.getItem(key); if (serial == null) continue;
					const record = JSON.parse(serial);
					if (record?.store !== kind) continue;
					if (record.version !== 1 || !_rapierNotesModel().isNoteFile(record.file) || typeof record.id !== 'string' || !record.id ||
						typeof record.text !== 'string' || !/^[a-f0-9]{64}$/.test(record.digest) || !Array.isArray(record.expectedDigest) ||
						!record.expectedDigest.length || record.expectedDigest.some(value => !/^[a-f0-9]{64}$/.test(value)) ||
						await globalThis.RapierNotesIntegrity.sha256(record.paste ? JSON.stringify({text: record.text, paste: record.paste}) : record.text) !== record.digest) throw new Error('The unfinished note has no complete byte proof.');
					const recover = async () => {
						if (localStorage.getItem(key) !== serial) return;
						const text = await this.resolve(record);
						const saved = await _rapierNotesStore.folder.save({...record, text});
						changed = true;
						if (!await _rapierNotesRecordVersion({file: saved.file, text, entry: saved.index.notes[saved.file]}))
							throw new Error('The note history is not ready to acknowledge these words.');
						if (localStorage.getItem(key) === serial) localStorage.removeItem(key);
						if (saved.copied) showToast('An unfinished edit of ' + record.file + ' met a changed note. Your words were kept as ' + saved.file + '.', 'info');
					};
					if (typeof record.owner !== 'string' || !/^[a-f0-9-]{36}$/.test(record.owner) || !navigator.locks?.request)
						throw new Error('The unfinished note\'s owner could not be checked.');
					await navigator.locks.request('rapier-notes-pending-owner:' + record.owner,
						{mode: 'exclusive', ifAvailable: true}, lock => lock ? recover() : undefined);
				} catch (error) { showToast('An unfinished note could not be recovered yet: ' + String(error?.message || error) + '. Its restart copy was kept.', 'error', {outlive: 'save-failed'}); }
			}
			return changed;
		})().finally(() => { this.replaying = null; });
		return this.replaying;
	},
};

async function _rapierNotesDir() {
	const root = await navigator.storage.getDirectory();
	return root.getDirectoryHandle(RAPIER_NOTES_DIR, { create: true });
}
const _rapierNotesStore = {
	chains: new Map(),
	reads: 0,
	durable: null, probe: null, storageFault: null, native: false,
	androidRestore: null,
	async restoreAndroid() {
		const call = globalThis.RapierPlatform?.host?.notesBackup;
		if (!this.native || typeof call !== 'function') return;
		if (!this.androidRestore) this.androidRestore = (async () => {
			try {
				const results = await globalThis.RapierNotesBackup.restoreAndroidBackups(this.folder, call);
				_rapierNotes.androidRestoreError = null;
				_rapierNotes.androidRestoreSessions = [];
				if (results.length) {
					const omitted = results.reduce((count, result) => count + result.omitted, 0);
					showToast('Android restored your notes and history.' + (omitted ? ' ' + omitted + ' media files exceeded the cloud limit; keep your full backup.' : ''), omitted ? 'info' : 'success');
				}
			} catch (error) {
				_rapierNotes.androidRestoreError = String(error?.message || error);
				_rapierNotes.androidRestoreSessions = (error.held || []).map(row => ({id: row.session}));
				showToast((error.restored?.length ? 'Other Android backups were restored. ' : '') + 'Android kept this backup: ' + _rapierNotes.androidRestoreError + ' Use Export restored backup in Notes settings.', 'error');
			}
		})().finally(() => { this.androidRestore = null; });
		return this.androidRestore;
	},
	bytes: null, folder: null,
	attach(durable) {
		if (this.folder) return;
		const OPFS = globalThis.RapierNotesOPFS, F = globalThis.RapierNotesFolder;
		this.bytes = (this.native ? OPFS.createNativeByteStore : durable ? OPFS.createByteStore : globalThis.RapierNotesIdbStore.createIndexedDbByteStore)({call: globalThis.RapierPlatform?.host?.notesStore, directory: _rapierNotesDir, onFault: error => { console.warn('[rapier] notes', error); }, beforeStep: async (kind, name, bytes) => {
			if (kind === 'read') { if (globalThis.__rapierNotesFailReads && String(globalThis.__rapierNotesFailReads) === name) throw Object.assign(new Error('the notes folder could not be read'), {name: 'UnknownError'}); return; }
			if (kind !== 'write') return;
			if (globalThis.__rapierNotesRefuseWrites) throw new Error('the notes folder refused the write');
			if (typeof globalThis.__rapierNotesHoldWrite === 'function') await globalThis.__rapierNotesHoldWrite(name, /\.md$/i.test(name) ? new TextDecoder().decode(bytes) : bytes);
		}});
		const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('rapier-notes') : null;
		const shared = () => this.native || durable ? true : ['indexeddb', 'fault', 'unasked'].includes(this.bytes?.kind);
		this.folder = F.createFolder({store: this.bytes, scope: RAPIER_NOTES_DIR, locks: this.native ? OPFS.createNativeNotesLocks({call: globalThis.RapierPlatform.host.notesStore}) : navigator.locks, channel, shared, keep: file => file === _rapierNotes.current, onInvalidate: () => { void _rapierNotesFolderChanged(); }, onPending: () => { if (typeof _rapierBackHold === 'function') _rapierBackHold(); }});
	},
	async kind() {
		if (this.durable != null) { this.attach(this.durable); return this.durable; }
		if (this.probe) return this.probe;
		this.probe = (async () => {
			await globalThis.RapierPlatform?.environment?.ready?.();
			if (globalThis.RapierPlatform?.environment.android) {
				try {
					if (typeof globalThis.RapierPlatform.host.notesStore !== 'function') throw new Error('The native Notes folder is unavailable.');
					this.native = true; this.attach(true); await this.bytes.prepare();
					await this.restoreAndroid();
					this.durable = true; this.storageFault = null; _rapierNotes.asciiNames = false;
					return true;
				} catch (error) { this.storageFault = error; this.probe = null; throw error; }
			}
			try {
				if (globalThis.__rapierNotesNoStorage) throw new DOMException('It was determined that certain files are unsafe for access within a Web application, or that too many calls are being made on file resources.', String(globalThis.__rapierNotesNoStorage));
				if (!navigator.storage?.getDirectory) throw new Error('this browser has no private file system');
				await _rapierNotesDir();
				this.durable = true;
				this.attach(true);
			} catch (error) {
				const absent = error?.name === 'SecurityError' || /has no private file system/.test(String(error?.message || ''));
				if (!absent) {
					this.storageFault = error; this.probe = null;
					console.warn('[rapier] notes: the notes folder could not be read this time', error);
					throw error;
				}
				this.storageFault = null;
				console.warn('[rapier] notes: no private file system for this page, the notes go to this browser\'s own storage', error);
				this.durable = false; _rapierNotes.asciiNames = false;
				this.attach(false);
				void _rapierNotesStorageAnswer(false);
			}
			return this.durable;
		})();
		return this.probe;
	},
	queue(name, job) {
		const prev = this.chains.get(name) || Promise.resolve();
		const next = prev.catch(() => {}).then(job);
		this.chains.set(name, next);
		next.catch(() => {}).finally(() => { if (this.chains.get(name) === next) this.chains.delete(name); });
		return next;
	},

	async settle() {
		let failed;
		while (this.chains.size || this.folder?.pending) {
			const work = [...this.chains.values()];
			if (this.folder?.pending) work.push(this.folder.settle());
			for (const result of await Promise.allSettled(work)) if (result.status === 'rejected') failed ||= result.reason;
		}
		if (failed) throw failed;
	},
	missing(error) { return error?.name === 'NotFoundError'; },
	async scratchFile(dir, name) {
		try { await dir.getFileHandle(name); throw Object.assign(new Error('A temporary file already uses this name. It was kept; retry saving.'), {code: 'collision'}); }
		catch (error) { if (!this.missing(error)) throw error; }
		return dir.getFileHandle(name, {create: true});
	},
	async namesBeyondAscii() {
		const state = _rapierNotes;
		if (!await this.kind()) return true;
		if (this.native) return true;
		if (state.asciiNames != null) return !state.asciiNames;
		const probe = '.rapier-name-probe-' + crypto.randomUUID() + '-\u00e9.tmp';
		const dir = await _rapierNotesDir();
		try {
			await this.scratchFile(dir, probe);
			try { await dir.removeEntry(probe); } catch (_) {}
			state.asciiNames = false;
		} catch (error) {
			if (error?.name !== 'TypeMismatchError') throw error;
			state.asciiNames = true;
		}
		return !state.asciiNames;
	},
	async port() { const durable = await this.kind(); return this.native || !durable; },
	async list() { await this.kind(); return this.bytes.list(); },
	async stamps(names) {
		if (this.native && names.length > 16 && await this.port()) {
			const all = await this.bytes.statAll(''), out = new Map();
			for (const name of names) {
				const info = name.includes('/') ? await this.bytes.stat(name) : all.get(name);
				if (!info) throw new Error('A listed note could not be read: ' + name + '.');
				out.set(name, {size: info.size, modified: Number.isSafeInteger(info.modified) ? info.modified : null});
			}
			return out;
		}
		if (await this.port()) {
			const out = new Map(), concurrency = _rapierNotesReadsModel().createCardReads().limits.concurrency;
			for (let at = 0; at < names.length; at += concurrency) {
				const rows = await Promise.all(names.slice(at, at + concurrency).map(async name => {
					const info = await this.bytes.stat(name);
					if (!info) throw new Error('A listed note could not be read: ' + name + '.');
					return [name, {size: info.size, modified: Number.isSafeInteger(info.modified) ? info.modified : null}];
				}));
				for (const [name, row] of rows) out.set(name, row);
			}
			return out;
		}
		const dir = await _rapierNotesDir();
		return new Map(await Promise.all(names.map(async name => {
			try {
				const file = await (await dir.getFileHandle(name)).getFile();
				return [name, {size: file.size, modified: Number.isSafeInteger(file.lastModified) ? file.lastModified : null}];
			} catch (error) {
				if (error?.name === 'NotFoundError') throw new Error('A listed note could not be read: ' + name + '. The folder changed or its handle is stale; no blank note was substituted. Try opening Notes again.');
				throw error;
			}
		})));
	},
	async read(name, {bytes: raw = false} = {}) {
		await this.kind();
		this.reads++;
		const bytes = await this.bytes.read(name); if (bytes == null) return null;
		if (raw) return bytes;
		const kept = globalThis.RapierNotesModel ? globalThis.RapierNotesModel.isNoteFile(name) : /\.md$/i.test(name);
		try { return new TextDecoder('utf-8', {fatal: true, ignoreBOM: kept}).decode(bytes); }
		catch (_) { throw Object.assign(new Error('this file is not UTF-8 text'), {name: 'EncodingError', code: 'unreadable'}); }
	},
	async verifyFile(handle, wanted) {
		const expected = wanted instanceof Blob ? wanted : new Blob([wanted]);
		const file = await handle.getFile();
		if (file.size !== expected.size) throw new Error('The notes folder readback has a different size; this write is not verified');
		for (let at = 0; at < expected.size; at += 65536) {
			const a = new Uint8Array(await expected.slice(at, at + 65536).arrayBuffer());
			const b = new Uint8Array(await file.slice(at, at + 65536).arrayBuffer());
			if (a.length !== b.length || a.some((byte, i) => byte !== b[i])) throw new Error('The notes folder readback has different bytes; this write is not verified');
		}
		return file;
	},
	async commitFile(dir, name, value, {immutable = false} = {}) {
		if (typeof value === 'string' && !value.isWellFormed()) throw new Error('The note contains an unpaired character; replacing it would change your work');
		const data = value instanceof Blob ? value : new Blob([value]);
		if (immutable) {
			let existing;
			try { existing = await dir.getFileHandle(name); } catch (error) { if (!this.missing(error)) throw error; }
			if (existing) { await this.verifyFile(existing, data); return false; }
		}
		const tmp = '.rapier-history-' + crypto.randomUUID() + '.tmp';
		const handle = await this.scratchFile(dir, tmp);
		let writer, staged = false;
		try {
			writer = await handle.createWritable(); await writer.write(data); await writer.close(); writer = null;
			await this.verifyFile(handle, data); staged = true;
			if (typeof handle.move === 'function') {
				await handle.move(dir, name);
				await this.verifyFile(await dir.getFileHandle(name), data);
			} else {
				const target = await dir.getFileHandle(name, {create: true});
				writer = await target.createWritable(); await writer.write(data); await writer.close(); writer = null;
				await this.verifyFile(target, data);
				try { await dir.removeEntry(tmp); } catch (_) {}
			}
		} catch (error) {
			try { await writer?.abort(); } catch (_) {}
			if (!staged) { try { await dir.removeEntry(tmp); } catch (_) {} }
			else {
				let retained = false;
				try { await this.verifyFile(await dir.getFileHandle(tmp), data); retained = true; } catch (_) {}
				if (retained) throw Object.assign(new Error(String(error?.message || error) + '. A verified temporary copy was kept as ' + tmp + '; keep this note open and retry saving.'), {name: error?.name || 'Error', cause: error, retainedCopy: tmp});
			}
			throw error;
		}
		return true;
	},
	async write(name, text) {
		await this.kind();
		if (_rapierNotes.index?.notes?.[name]) { await _rapierNotesSave(name, text); return; }
		_rapierNotesTake(await this.folder.create(text, name));
	},
	async thumbDir(create) { const dir = await _rapierNotesDir(); return dir.getDirectoryHandle('thumbs', { create: !!create }); },
	async thumbNames() { await this.kind(); return this.bytes.list('thumbs'); },
	async readThumb(name) {
		if (await this.port()) return this.portFile('thumbs/' + name);
		try { return await (await (await this.thumbDir(false)).getFileHandle(name)).getFile(); } catch (error) { if (this.missing(error)) return null; throw error; }
	},
	writeThumb(name, blob) {
		return this.queue('thumbs/' + name, async () => {
			await this.kind();
			const lease = await this.folder.owner.acquire(this.folder.scope);
			try { await this.bytes.write('thumbs/' + name, await blob.arrayBuffer()); }
			finally { await lease.release(); }
		});
	},

	async attachmentNames() { await this.kind(); return this.bytes.list('attachments'); },
	async attachmentStat(name) {
		await this.kind();
		if (!globalThis.RapierNotesModel.isAttachmentName(name)) throw new Error('This file name is not a portable attachment. Keep the original file.');
		return this.bytes.stat('attachments/' + name);
	},
	async readAttachment(name) { await this.attachmentStat(name); return this.backupFile('attachments/' + name); },
	async createAttachment(wanted, blob, options = {}) {
		const decision = globalThis.RapierNotesAttachments.attachmentIntake([{name: wanted, size: blob.size}], {streaming: true});
		if (decision.refusal) throw new Error(decision.refusal);
		await this.kind();
		const snapshot = await this.folder.createAttachment(wanted, blob, options);
		_rapierNotesTake(snapshot); return snapshot.name;
	},
	async attachmentReferences(options) { await this.kind(); return this.folder.attachmentReferences(options); },
	async reviewAttachmentDeletion(name, options) { await this.kind(); return this.folder.reviewAttachmentDeletion(name, options); },
	async deleteAttachment(review, options) {
		await this.kind();
		const snapshot = await this.folder.deleteAttachment(review, options);
		_rapierNotesTake(snapshot); return snapshot;
	},
	async fileReferences(options) { await this.kind(); return this.folder.fileReferences(options); },
	async reviewRecordingDeletion(name, options) { await this.kind(); return this.folder.reviewRecordingDeletion(name, options); },
	async deleteRecording(review, options) {
		await this.kind();
		const snapshot = await this.folder.deleteRecording(review, options);
		_rapierNotesTake(snapshot); return snapshot;
	},
	async audioDir(create) { return (await _rapierNotesDir()).getDirectoryHandle('audio', { create: !!create }); },
	audioName(name) { if (!globalThis.RapierNotesAudio.validRecordingName(name)) throw new Error('This recording name is not a sibling file'); return 'audio/' + name; },
	async importReceiptNames() { await this.kind(); return this.bytes.list('imports'); },
	async audioNames() { await this.kind(); return (await this.bytes.list('audio')).filter(n => globalThis.RapierNotesAudio.validRecordingName(n)); },
	async audioStat(name) { await this.kind(); return this.bytes.stat(this.audioName(name)); },
	async readAudio(name) {
		const key = this.audioName(name);
		const pending = this.chains.get(key); if (pending) await pending;
		if (await this.port()) return this.portFile(key);
		try { return await (await (await this.audioDir(false)).getFileHandle(name)).getFile(); }
		catch (error) { if (this.missing(error)) return null; throw error; }
	},
	removeAudio(name) {
		const key = this.audioName(name);
		return this.queue(key, async () => {
			await this.kind();
			_rapierNotesTake(await this.folder.discardAudio(name));
		});
	},
	async beginRecording(noteFile, mime) { await this.kind(); return this.folder.beginRecording(noteFile, mime); },
	async recoverRecordings() { await this.kind(); return this.folder.recoverRecordings(); },
	async openRecording(offer) { await this.kind(); return this.folder.openRecording(offer); },
	async readRecording(offer) { await this.kind(); return this.folder.readRecording(offer); },
	async acknowledgeRecording(entry, assignedNote = null) { await this.kind(); return this.folder.acknowledgeRecording(entry, assignedNote); },
	async createAudio(noteFile, mime, blob, wanted = '', options = {}) {
		await this.kind();
		const snapshot = await this.folder.createAudio(noteFile, mime, new Uint8Array(await blob.arrayBuffer()), wanted, options);
		_rapierNotesTake(snapshot);
		return snapshot.name;
	},
	historyCommit(job) {
		return this.queue('history transaction', async () => {
			await this.kind();
			const lease = await this.folder.owner.acquire(this.folder.scope);
			try { return await job(); }
			finally { await lease.release(); }
		});
	},
	async portFile(name) { const bytes = await this.bytes.read(name); return bytes == null ? null : new File([bytes], name.split('/').pop(), {lastModified: 0}); },
	async file(name) { if (await this.port()) { const file = await this.portFile(name); if (!file) throw Object.assign(new Error('no such note'), {name: 'NotFoundError'}); return file; } const dir = await _rapierNotesDir(); return (await dir.getFileHandle(name)).getFile(); },
	async backupFile(path, {stream = false} = {}) {
		if (typeof path !== 'string' || !path || /[\\\0]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('backup path is not relative');
		const ported = await this.port();
		if (ported && stream && typeof this.bytes.readChunks === 'function') {
			const opened = await this.bytes.stat(path), port = this.bytes;
			if (!opened) return null;
			return {size: opened.size, lastModified: opened.modified || 0,
				chunks: ({chunkBytes, signal}) => port.readChunks(path, {chunkBytes, signal, onOpen: actual => {
					if (!actual || actual.size !== opened.size || actual.modified !== opened.modified) throw new Error('a backup file changed: ' + path);
				}})};
		}
		if (ported) return this.portFile(path);
		const parts = path.split('/'), name = parts.pop(); let dir = await _rapierNotesDir();
		for (const part of parts) dir = await dir.getDirectoryHandle(part);
		try { return await (await dir.getFileHandle(name)).getFile(); }
		catch (error) { if (this.missing(error)) return null; throw error; }
	},
	async historyDir(create, sub) {
		const dir = await (await _rapierNotesDir()).getDirectoryHandle('history', { create: !!create });
		return sub ? dir.getDirectoryHandle(sub, { create: !!create }) : dir;
	},
	historyKey(path) {
		const clean = String(path || '');
		if (!/^(?:manifests|texts|blobs)\/[A-Za-z0-9][A-Za-z0-9._!-]{0,127}$/.test(clean)) throw new Error('this is not a path inside the note history');
		return 'history/' + clean;
	},
	async readHistory(path) {
		const key = this.historyKey(path), pending = this.chains.get(key);
		if (pending) await pending;
		await this.kind(); return this.bytes.read(key);
	},
	writeHistory(path, bytes, {immutable = false} = {}) {
		bytes = globalThis.RapierNotesIntegrity.exactBytes(bytes);
		const key = this.historyKey(path), [sub, name] = String(path).split('/');
		return this.queue(key, async () => {
			if (globalThis.__rapierNotesRefuseWrites) throw new Error('the notes folder refused the write');
			if (typeof globalThis.__rapierNotesHoldWrite === 'function') await globalThis.__rapierNotesHoldWrite(key, bytes);
			if (await this.port()) {
				const held = immutable ? await this.bytes.read(key) : null;
				if (held) { if (held.length !== bytes.length || held.some((b, i) => b !== bytes[i])) throw new Error('The retained history object has different bytes; this version is not verified'); return false; }
				await this.bytes.write(key, bytes); return true;
			} else return this.commitFile(await this.historyDir(true, sub), name, bytes, {immutable});
		});
	},
	removeHistory(path) {
		const key = this.historyKey(path), [sub, name] = String(path).split('/');
		return this.queue(key, async () => {
			if (await this.port()) { await this.bytes.remove(key); return; }
			try { await (await this.historyDir(false, sub)).removeEntry(name); }
			catch (error) { if (!this.missing(error)) throw error; }
		});
	},
	async historyNames(sub) {
		if (!/^(?:manifests|texts|blobs)$/.test(String(sub || ''))) throw new Error('this is not a part of the note history');
		await this.kind();
		return (await this.bytes.list('history/' + sub)).filter(n => !n.startsWith('.'));
	}
};
async function _rapierNotesWriteIndex(wanted = _rapierNotes.index, base = _rapierNotes.indexBase, touches = []) {
	const store = _rapierNotesStore;
	await store.kind();
	return _rapierNotesTake(await store.folder.metadata(base, wanted, {touches}));
}
function _rapierNotesMove(file, at) {
	const state = _rapierNotes, M = _rapierNotesModel(), index = state.index;
	if (!index.notes[file]) return null;
	try { if (!M.moveTo(index, file, at)) return null; }
	catch (error) { return Promise.reject(error); }
	const base = _rapierNotesCopyIndex(state.indexBase), previous = state.orderOperation;
	const orders = Object.entries(index.notes).map(([name, entry]) => ({name, id: entry.id, order: entry.order}));
	const operation = state.orderOperation = {orders, committed: new Map()};
	if (typeof _rapierBackHold === 'function') _rapierBackHold();
	operation.task = Promise.resolve(previous?.task).catch(() => {}).then(async () => {
		for (const [name, kept] of previous?.committed || []) {
			operation.committed.set(name, {...kept, values: new Set(kept.values)});
			const entry = base.notes[name];
			if (entry?.id === kept.id && kept.values.has(entry.order)) entry.order = kept.order;
		}
		const wanted = _rapierNotesCopyIndex(base);
		for (const row of orders) if (wanted.notes[row.name]?.id === row.id) wanted.notes[row.name].order = row.order;
		const saved = await _rapierNotesWriteIndex(wanted, base);
		for (const row of orders) {
			const before = base.notes[row.name];
			if (before?.id !== row.id || before.order === row.order) continue;
			const kept = operation.committed.get(row.name), values = kept?.id === row.id ? kept.values : new Set();
			values.add(before.order); values.add(row.order);
			operation.committed.set(row.name, {id: row.id, order: row.order, values});
		}
		if (state.orderOperation && state.orderOperation !== operation) for (const row of state.orderOperation.orders) {
			if (state.index.notes[row.name]?.id === row.id) state.index.notes[row.name].order = row.order;
		}
		return saved;
	}).catch(error => {
		if (state.orderOperation === operation) for (const [name, current] of Object.entries(state.index.notes)) {
			const saved = state.indexBase?.notes[name];
			if (saved?.id === current.id) current.order = saved.order;
		}
		throw error;
	}).finally(() => {
		if (state.orderOperation === operation) state.orderOperation = null;
		if (typeof _rapierBackHold === 'function') _rapierBackHold();
	});
	return operation.task;
}
function _rapierNotesCopyIndex(index) { return JSON.parse(JSON.stringify(index)); }
function _rapierNotesTake(snapshot, {readOnly = false} = {}) {
	const state = _rapierNotes;
	state.indexBase = snapshot.index; state.index = _rapierNotesCopyIndex(snapshot.index);
	if (readOnly) return snapshot;
	_rapierNotesRemindSync();
	if (typeof _rapierNotesSyncUi !== 'undefined') _rapierNotesSyncUi.changed();
	_rapierNotesAskPersistenceOnce();
	return snapshot;
}
function _rapierNotesAskPersistenceOnce() {
	const state = _rapierNotes;
	if (state.persistAsked) return false;
	state.persistAsked = true;
	let asked = false;
	try { asked = RapierPreferences.read('notesPersistAsked') === true; } catch (_) {}
	if (asked) return false;
	try { RapierPreferences.write('notesPersistAsked', true); } catch (_) {}
	void _rapierNotesStorageAnswer(true);
	return true;
}
async function _rapierNotesSave(file, text, ledger, {input = false, exact = false, reason} = {}) {
	const state = _rapierNotes, store = _rapierNotesStore, H = globalThis.RapierNotesIntegrity;
	const proof = state.current === file ? state.currentProof : null;
	const id = proof?.id || state.index.notes[file]?.id;
	let before = state.texts.get(file);
	await store.kind();
	if (!proof && before == null) before = await store.read(file);
	const expectedDigest = [proof ? proof.digest : before == null ? null : await H.sha256(before)];
	if (state.attempted.has(file)) expectedDigest.push(state.attempted.get(file));
	const folder = store.folder, bytes = store.bytes;
	const guard = () => {
		if (folder !== store.folder || bytes !== store.bytes || proof && (state.currentProof !== proof || !_rapierNotesDocumentBound())) throw Object.assign(new Error('The note owner changed before saving.'), {code: 'notes_changed', notesMutationStarted: false});
	};
	let snapshot;
	const restored = state.restoring?.id === id && state.restoring.text === text ? state.restoring : null;
	const expectedLedger = [proof?.ledger, state.attemptedLedger.get(file)].filter(value => typeof value === 'string');
	try {
		snapshot = await folder.save({file, id, expectedDigest, expectedLedger: expectedLedger.length ? expectedLedger : undefined, text, ledger}, {guard, input,
			...(exact ? {canonical: {}} : {}),
			...(restored ? {reason: 'restore', restoredFrom: restored.from} : state.captured?.has(id) ? {reason: 'capture'} : reason ? {reason} : {})});
		if (snapshot.text !== text || !snapshot.digest || !snapshot.ledger?.sha256)
			throw Object.assign(new Error('The saved note does not prove the captured words and history.'), {code: 'notes_changed'});
	} catch (error) {
		state.attempted.set(file, _rapierNotesPending.known(proof, _rapierMutationStamp(), text) || await H.sha256Yielding(H.exactBytes(text)));
		if (ledger?.sha256) state.attemptedLedger.set(file, ledger.sha256);
		throw error;
	}
	state.attempted.delete(file); state.attemptedLedger.delete(file);
	if (snapshot.copied) showToast(file + ' was changed elsewhere while you wrote. Its newer words stay; yours are kept as ' + snapshot.file + ', which this document now saves to.', 'info');
	if (state.current === file && state.currentProof === proof) {
		state.current = snapshot.file;
		state.currentProof = Object.freeze({...proof, file: snapshot.file, id: snapshot.id ?? state.index?.notes?.[snapshot.file]?.id, text, digest: snapshot.digest, ledger: snapshot.ledger.sha256});
		state.savedReceipt = null;
	}
	return _rapierNotesTake(snapshot);
}
async function _rapierNotesFolderChanged() {
	const state = _rapierNotes;
	if (state.reloading) return state.reloading;
	state.reloading = (async () => { try { await _rapierNotesLoad(); if (state.open) _rapierNotesRender(); _rapierNotesIndexingBegin(); } catch (error) { console.warn('[rapier] notes: the folder changed and could not be read again', error); } finally { state.reloading = null; } })();
	return state.reloading;
}
async function _rapierNotesStorageKind() {
	const store = _rapierNotesStore;
	try { await store.kind(); await store.bytes.prepare(); }
	catch (_) { return 'fault'; }
	if (store.storageFault || store.bytes.kind === 'fault') return 'fault';
	return store.native ? 'native' : store.bytes.kind || (store.durable ? 'opfs' : 'memory');
}
function _rapierNotesStorageKindSentence() {
	const kind = _rapierNotes.storageKnown;
	return kind === 'native' ? 'Saved in this app.'
		: kind === 'memory' ? 'Gone when this page closes. Back up.'
		: kind === 'fault' ? 'Saves unconfirmed. Save a copy.'
		: kind === 'indexeddb' ? 'The browser may delete these. Back up.'
		: kind === 'persistent' ? 'Protected from browser cleanup.'
		: kind === 'evictable' ? 'Low storage. Back up.'
		: kind === 'unknown' ? 'Storage protection unconfirmed.'
		: 'Open Notes to check storage.';
}
function _rapierNotesStorageLines() {
	const state = _rapierNotes, kind = state.storageKnown;
	const note = document.getElementById('notes-storage-note');
	if (note) { note.textContent = _rapierNotesStorageSentence(); note.dataset.notesStorage = kind; }
	const android = document.getElementById('notes-android-backup-status');
	if (android) android.textContent = _rapierNotesAndroidBackupSentence();
}
function _rapierNotesAndroidBackupSentence() {
	const android = _rapierNotes.androidBackup;
	return _rapierNotes.androidRestoreError ? 'Restored backup kept: ' + _rapierNotes.androidRestoreError
		: android?.unfinishedRestores ? 'Android kept an incomplete restored backup. Keep your original backup; the phone did not deliver a complete copy.'
		: android?.state === 'too-large' || android?.lastAttempt === 'quota-exceeded' ? 'Android cloud limit: 25 MB. Use Backup for this library; device transfer keeps everything.'
		: android?.state === 'limited' ? 'Android cloud: text and history first; ' + android.omittedCount + ' media files need your full backup. Device transfer keeps everything.'
		: android?.lastAttempt === 'encryption-required' ? 'Android cloud backup needs a screen lock.'
		: android?.state === 'pending-write' ? 'Android backup waits for your notes to finish saving.'
		: android?.state === 'unreadable' ? 'Android could not prepare a complete cloud backup. Keep a full Backup of your original files.'
		: 'Android backup follows your phone settings. Cloud limit: 25 MB; device transfer keeps everything.';
}
function _rapierNotesStorageSentence() {
	const kind = _rapierNotes.storageKnown;
	const sentence = _rapierNotesStorageKindSentence();
	const backup = _rapierNotes.lastBackup, prepared = _rapierNotes.preparedBackup;
	const pending = prepared?.sequence && prepared.sent.length < prepared.plan.parts.length
		? ' Backup incomplete: ' + prepared.sent.length + '/' + prepared.plan.parts.length + ' parts sent; next: ' + (prepared.sent.length + 1) + '. Keep every part.' : '';
	const action = backup?.confirmed ? 'saved' : backup?.route === 'share' ? 'sent to sharing' : backup?.route === 'mixed' ? 'sent to destinations' : 'download started';
	const space = [_rapierNotes.audioBytes == null ? '' : 'recordings ' + _rapierNotesBytesWords(_rapierNotes.audioBytes),
		_rapierNotes.attachmentBytes == null ? '' : 'attachments ' + _rapierNotesBytesWords(_rapierNotes.attachmentBytes),
		_rapierNotes.pastBytes == null ? '' : 'history ' + _rapierNotesBytesWords(_rapierNotes.pastBytes) + ' (' + _rapierNotes.pastVersions.toLocaleString('en') + (_rapierNotes.pastVersions === 1 ? ' version)' : ' versions)')].filter(Boolean);
	const systemBackup = kind === 'native' && globalThis.RapierPlatform?.host?.notesBackup ? ' ' + _rapierNotesAndroidBackupSentence() : '';
	return sentence + systemBackup + (kind === 'native' ? '' : ['memory', 'fault'].includes(kind) || kind == null ? '' : ' Clearing browser data or losing this device can delete them.')
		+ (space.length ? ' Space: ' + space.join(', ') + '.' : '') + pending
		+ (backup ? ' Last backup: ' + action + (backup.parts ? ', ' + backup.parts + (backup.parts === 1 ? ' part' : ' parts') + ', ' + _rapierNotesBytesWords(backup.bytes) : '') + (backup.omitted?.length ? '; missing: ' + backup.omitted.map(row => row.name).join(', ') : '') + ', ' + new Date(backup.stamp).toLocaleString('en') + '. Check every file arrived.' : ' Keep a backup elsewhere.');
}
async function _rapierNotesStorageAnswer(ask = false, {measure = true} = {}) {
	let admissionFault = null;
	try { await _rapierNotesStore.kind(); if (await _rapierNotesStore.bytes?.prepare() === false) throw new Error(_rapierNotesStore.bytes.reason || 'the notes store refused writes'); }
	catch (error) { admissionFault = error; }
	if (_rapierNotesStore.native && typeof globalThis.RapierPlatform?.host?.notesBackup === 'function') {
		try {
			_rapierNotes.androidBackup = await globalThis.RapierPlatform.host.notesBackup('notes.backup.status', {});
			_rapierNotes.androidRestoreSessions = (await globalThis.RapierPlatform.host.notesBackup('notes.backup.pending', {})).sessions.map(row => ({id: row.id, createdAt: row.manifest.createdAt}));
		}
		catch (_) { _rapierNotes.androidBackup = null; }
	}
	if (measure) {
		try {
			const files = [];
			for (const name of await _rapierNotesStore.audioNames()) { const file = await _rapierNotesStore.readAudio(name); if (!file) throw new Error('recording not found'); files.push(file); }
			_rapierNotes.audioBytes = globalThis.RapierNotesAudio.recordingBytes(files);
		} catch (_) { _rapierNotes.audioBytes = null; }
		try {
			let bytes = 0;
			for (const name of await _rapierNotesStore.attachmentNames()) {
				if (/^\..*\.tmp$/.test(name)) continue;
				const stat = await _rapierNotesStore.attachmentStat(name);
				if (!stat) throw new Error('attachment not found'); bytes += stat.size;
			}
			_rapierNotes.attachmentBytes = bytes;
		} catch (_) { _rapierNotes.attachmentBytes = null; }

		try {
			const H = globalThis.RapierNotesHistory;
			const {list, unreadable} = await _rapierNotesHistoryInventory();
			if (unreadable.length) throw new Error('history inventory is incomplete');
			const totals = H.storage(list);
			_rapierNotes.pastBytes = list.length ? totals.bytes : null;
			_rapierNotes.pastVersions = totals.versions;
		} catch (_) { _rapierNotes.pastBytes = null; _rapierNotes.pastVersions = 0; }
	}
	let granted = null;
	if (admissionFault || _rapierNotesStore.bytes?.kind === 'fault') _rapierNotes.storageKnown = 'fault';
	else if (_rapierNotesStore.native) _rapierNotes.storageKnown = 'native';
	else if (_rapierNotesStore.durable === false) _rapierNotes.storageKnown = _rapierNotesStore.bytes?.kind === 'indexeddb' ? 'indexeddb' : 'memory';
	else {
		try { if (ask && navigator.storage?.persist) granted = await navigator.storage.persist(); } catch (_) { granted = null; }
		try { if (granted !== true && navigator.storage?.persisted) granted = await navigator.storage.persisted(); } catch (_) {}
		_rapierNotes.storageKnown = granted === true ? 'persistent' : granted === false ? 'evictable' : 'unknown';
	}
	_rapierNotesStorageLines();
}
async function _rapierNotesOpenSearchCache() {
	const C = globalThis.RapierNotesSearchCache;
	if (!C || typeof C.openSearchCache !== 'function') return null;
	const store = _rapierNotesStore;
	let kind = null;
	try { kind = await store.kind(); } catch (_) { return null; }
	if (!kind) return null;
	try { return await C.openSearchCache({scope: 'notes:' + String(kind)}); }
	catch (_) { return null; }
}
async function _rapierNotesLoad() {
	const state = _rapierNotes, M = _rapierNotesModel(), store = _rapierNotesStore;
	const request = state.loadRequest = {};
	if (!state.persistReported) { state.persistReported = true; void _rapierNotesStorageAnswer(false); }
	await store.kind();
	await _rapierNotesPending.claim();
	let snapshot, damaged = null;
	const read = async () => { try { return await store.folder.read({syncState: true}); }
		catch (error) {
			if (error?.code === 'newer') throw new Error('This notes folder was written by a newer Rapier (index version ' + error.version + '). Open it with that Rapier, so nothing in it is lost.');
			throw error;
		} };
	try { snapshot = await read(); }
	catch (error) {
		if (error?.code !== 'corrupt') throw error;
		const backup = 'notes.damaged-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
		snapshot = await store.folder.rebuildIndex(backup, {syncState: true});
		damaged = snapshot.damaged;
	}
	if (await _rapierNotesPending.recover()) snapshot = await read();
	const syncState = snapshot.syncState ?? null;
	const index = snapshot.index, files = snapshot.files;
	state.recordingOffers = Array.isArray(snapshot.recordings) ? snapshot.recordings : [];
	for (const row of snapshot.kept || []) showToast('An interrupted save of ' + row.file + ' met a changed file. Your words were kept as ' + row.name + '.', 'info');
	const dropped = Object.keys(index.missingFiles || {}).filter(file => !(state.indexBase?.missingFiles || {})[file]);
	const stampsAt = Date.now();
	const stamps = await store.stamps(Object.keys(index.notes));
	if (state.loadRequest !== request) return;
	const sizes = new Map([...stamps].map(([name, row]) => [name, row.size]));
	state.syncState = syncState; state.indexBase = index; state.index = _rapierNotesCopyIndex(index); state.texts = new Map(); state.titles = new Map(); state.hold = new Set(); state.sizes = sizes; state.readFailed = new Map(); state.unreadable = new Set(); state.loadGen++; store.stale = false;
	state.lastBackup = index.lastBackup || null;
	_rapierNotesStorageLines();
	state.stamps = stamps; state.stampsAt = stampsAt; state.readBracket = new Map();
	_rapierNotesReadsReset();
	state.cachePlan = null;
	state.searchCache?.close(); state.searchCache = null;
	const cache = await _rapierNotesOpenSearchCache();
	if (state.loadRequest !== request) { cache?.close(); return; }
	state.searchCache = cache;
	if (cache) {
		try {
			const folder = [...stamps].map(([file, row]) => ({file, size: row.size, modified: row.modified}));
			const plan = await cache.plan(folder);
			if (state.loadRequest !== request) return;
			state.cachePlan = plan;
		} catch (_) { state.cachePlan = null; }
	}
	for (const row of state.cachePlan?.reuse || []) if (typeof row.projection?.title === 'string') state.titles.set(row.file, row.projection.title);
	if (state.current && index.notes[state.current]) await _rapierNotesTexts([state.current]);
	if (state.loadRequest !== request) return;
	state.indexing = async () => {
		if (state.loadRequest !== request) return;
		state.indexing = null;
		state.reading = {total: state.sizes.size, done: 0, complete: false};
		if (typeof _rapierNotesLibraryBegin === 'function' && await _rapierNotesLibraryBegin() === false) return;
		if (state.loadRequest !== request) return;
		return _rapierNotesReadRest();
	};
	if (damaged) showToast('Rapier couldn’t read its list of your notes, so it made a new one from the notes; pins, colours, sections and order start over. The unreadable copy is kept in the notes folder as ' + damaged + '.', 'error');
	if (dropped.length) showToast(dropped.length === 1 ? 'One note on Rapier’s list is not in the notes folder, so it was taken off the list.' : dropped.length + ' notes on Rapier’s list are not in the notes folder, so they were taken off the list.', 'info');
}

function _rapierNotesIndexingBegin() { const begin = _rapierNotes.indexing; if (begin) return begin(); }
function _rapierNotesBackgroundBlocked() {
	const state = _rapierNotes;
	return state.sizes.size > 200 && (state.backgroundTouches.size > 0 || state.backgroundInput || state.backgroundComposing ||
		!!navigator.scheduling?.isInputPending?.({includeContinuous: true}));
}
function _rapierNotesReadsModel() { return globalThis.RapierNotesLibraryReads; }
function _rapierNotesReadsReset() {
	const C = _rapierNotesReadsModel();
	for (const w of _rapierNotes.reads?.waiters || []) w.resolve();
	_rapierNotes.reads = {model: C.createCardReads(), read: C.createLibraryReadPass(_rapierNotesReadFile), waiters: [], deriving: new Set()};
}
function _rapierNotesHold(file, text) { const state = _rapierNotes; state.texts.set(file, text); state.titles.set(file, _rapierNotesModel().projectCard(file, text).title || ''); }
function _rapierNotesTitle(file) { const state = _rapierNotes, kept = state.titles.get(file); return kept ?? (state.texts.has(file) ? (_rapierNotesModel().projectCard(file, state.texts.get(file)).title || '') : ''); }
function _rapierNotesLetGo(file) {
	const state = _rapierNotes;
	if (file === state.current || state.selected.has(file) || state.hold.has(file) || !state.texts.has(file)) return;
	if (typeof _rapierNotesLibraryTaken !== 'function' || !_rapierNotesLibraryTaken(file)) return;
	if (state.reads && state.reads.deriving.has(file)) return;
	if (state.surface && state.surface.querySelector('[data-notes-file="' + CSS.escape(file) + '"]')) return;
	state.texts.delete(file);
}
function _rapierNotesReadHeld(file, text) {
	_rapierNotesHold(file, text); _rapierNotes.readFailed.delete(file);
	if (typeof _rapierNotesLibraryRead === 'function') _rapierNotesLibraryRead(file);
}
function _rapierNotesReadOne(file, {search = false} = {}) { return _rapierNotes.reads.read(_rapierNotesReadRow(file)).then(source => source?.take(search)); }
async function _rapierNotesReadFile(row) {
	const state = _rapierNotes, file = row.key, texts = state.texts, reads = state.reads, gen = state.loadGen;
	let held = texts.get(file);
	const live = () => state.loadGen === gen && state.texts === texts && state.reads === reads &&
		!!state.index?.notes[file] && _rapierNotesReadRow(file).revision === row.revision &&
		_rapierNotesReadRow(file).bytes === row.bytes && texts.get(file) === held;
	const failed = error => {
		if (!live()) return;
		if (error?.code === 'unreadable') { _rapierNotesHold(file, ''); state.unreadable.add(file); return; }
		if (!state.readFailed.has(file)) showToast('A note could not be read: ' + file + '. ' + String(error?.message || error), 'error');
		state.readFailed.set(file, 'could not be read');
	};
	try {
		const source = await _rapierNotesStore.read(file, {bytes: true});
		let bracket = null;
		if (state.readBracket && state.stamps?.has(file)) {
			try {
				const after = (await _rapierNotesStore.stamps([file])).get(file);
				if (after) bracket = {before: state.stamps.get(file), after, observedAt: state.stampsAt};
			} catch (_) { bracket = null; }
		}
		if (!live()) return;
		if (bracket && state.readBracket) state.readBracket.set(file, bracket);
		if (source === null) { if (!state.readFailed.has(file)) showToast('A note the folder listed is not there any more: ' + file + '. Nothing was rebuilt; open Notes again.', 'error'); state.readFailed.set(file, 'not in the folder any more'); return; }
		let exact = typeof source === 'string' ? source : undefined, published = false;
		const decode = bytes => {
			try { return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes); }
			catch (_) { throw Object.assign(new Error('this file is not UTF-8 text'), {name: 'EncodingError', code: 'unreadable'}); }
		};
		return {take(search) {
			if (!live()) return;
			try {
				const S = globalThis.RapierNotesSearch;
				if (search && exact === undefined && S && typeof _rapierNotesLibraryRead === 'function') {
					if (source.byteLength > S.SEARCH_WORKER_CHARS && _rapierNotesLibraryRead(file, {searchBytes: source instanceof Uint8Array ? source : new Uint8Array(source)})) return;
					const projected = S.projectSearchBytes(source, {decode, file});
					state.titles.set(file, _rapierNotesModel().projectCard(file, projected.searchText).title || '');
					state.readFailed.delete(file);
					if (_rapierNotesLibraryRead(file, projected)) return;
				}
				if (exact === undefined) exact = decode(source);
				if (!published) { _rapierNotesReadHeld(file, exact); held = texts.get(file); published = true; }
				return exact;
			} catch (error) { failed(error); }
		}};
	} catch (error) { failed(error); }
}
async function _rapierNotesTexts(files, {hold = true} = {}) {
	const state = _rapierNotes, texts = new Map();
	await Promise.all([...new Set(files)].map(async file => {
		if (hold) state.hold.add(file);
		const text = state.texts.has(file) ? state.texts.get(file) : !state.readFailed.has(file) || state.readFailed.get(file) === 'too large to preview' ? await _rapierNotesReadOne(file) : undefined;
		if (typeof text === 'string' && !state.unreadable?.has(file) && !state.readFailed.has(file)) texts.set(file, text);
		if (!hold) _rapierNotesLetGo(file);
	}));
	return texts;
}
function _rapierNotesTextsComplete() { return !!_rapierNotes.reading?.complete; }
function _rapierNotesReadRest() {
	const state = _rapierNotes, gen = state.loadGen, all = Object.keys(state.index?.notes || {});
	const plan = state.cachePlan;
	const files = plan ? all.filter(file => !plan.ready?.has(file)) : all, hydrated = all.length - files.length;
	state.cachePlan = null;
	const reading = state.reading = {total: all.length, done: hydrated, complete: false};
	let at = 0;
	const lane = async () => {
		while (at < files.length) {
			const file = files[at++];
			if (state.loadGen !== gen) return;
			while (state.loadGen === gen && (_rapierNotesBackgroundBlocked() ||
				typeof _rapierNotesLibraryBacklog === 'function' && _rapierNotesLibraryBacklog() > 64)) await new Promise(resolve => setTimeout(resolve, 16));
			if (state.loadGen !== gen) return;
			if (!state.texts.has(file) && (!state.readFailed.has(file) || state.readFailed.get(file) === 'too large to preview')) await _rapierNotesReadOne(file, {search: true});
			reading.done++;
		}
	};
	reading.promise = (async () => {
		await Promise.all([lane(), lane(), lane(), lane()]);
		if (state.loadGen !== gen) return;
		reading.complete = true;
		const bad = state.unreadable;
		if (bad.size) showToast((bad.size === 1 ? 'One file in the notes folder is not text' : bad.size + ' files in the notes folder are not text') + ' (' + [...bad].slice(0, 3).join(', ') + (bad.size > 3 ? ', \u2026' : '') + '): shown, not opened, and left as ' + (bad.size === 1 ? 'it is' : 'they are') + '.', 'error');
		if (typeof _rapierNotesLibraryTextsComplete === 'function') _rapierNotesLibraryTextsComplete();
		if (typeof _rapierOcrWalkAll === 'function') _rapierOcrWalkAll();
		if (state.open && state.query) _rapierNotesRender();
	})();
	return reading.promise;
}
function _rapierNotesWindowTexts(files) {
	const state = _rapierNotes, reads = state.reads;
	const wanted = [...new Set(files)].filter(f => !state.texts.has(f) && !state.readFailed.has(f));
	if (!wanted.length) return Promise.resolve();
	return new Promise(resolve => { reads.waiters.push({files: wanted, resolve}); _rapierNotesReadsWindow(); });
}
function _rapierNotesReadsWindow() {
	const reads = _rapierNotes.reads, C = _rapierNotesReadsModel();
	const wanted = [...new Set(reads.waiters.flatMap(w => w.files))].filter(f => !_rapierNotesReadsSettled(f));
	reads.model = C.cardReadWindow(reads.model, wanted.slice(0, reads.model.limits.maxWindowEntries).map(_rapierNotesReadRow));
	_rapierNotesReadsPump();
}
function _rapierNotesReadRow(file) {
	const state = _rapierNotes;
	const entry = state.index?.notes[file] || {};
	return {key: file, revision: JSON.stringify([entry.id || '', entry.revision || '', Number(entry.modified) || 0]), bytes: state.sizes.get(file) || 0};
}
function _rapierNotesReadsSettled(file) {
	const state = _rapierNotes;
	if (state.texts.has(file) || state.readFailed.has(file)) return true;
	const kind = _rapierNotesReadsModel().cardReadStatus(state.reads.model, _rapierNotesReadRow(file)).kind;
	return kind !== 'pending' && kind !== 'ready';
}
function _rapierNotesReadsPump() {
	const state = _rapierNotes, C = _rapierNotesReadsModel(), reads = state.reads;
	const plan = C.planCardReads(reads.model); reads.model = plan.state;
	for (const row of plan.state.settled) if (row.kind === 'preview-too-large' && !state.texts.has(row.key)) state.readFailed.set(row.key, 'too large to preview');
	for (const ticket of plan.start) {
		_rapierNotesReadOne(ticket.key).then(text => {
			reads.model = C.finishCardRead(reads.model, ticket.ticket, typeof text === 'string' ? {revision: ticket.revision, bytes: ticket.bytes, text} : {error: 'unread'}).state;
		}).then(() => { if (state.reads === reads) { _rapierNotesReadsSettle(); _rapierNotesReadsPump(); } });
	}
	_rapierNotesReadsSettle();
}
function _rapierNotesReadsSettle() {
	const reads = _rapierNotes.reads; if (!reads) return;
	reads.waiters = reads.waiters.filter(w => { if (w.files.every(_rapierNotesReadsSettled)) { w.resolve(); return false; } return true; });
	const open = reads.model.wanted.filter(row => !_rapierNotesReadsSettled(row.key)), inWindow = new Set(open.map(row => row.key));
	if (open.length < reads.model.limits.maxWindowEntries && reads.waiters.some(w => w.files.some(f => !inWindow.has(f) && !_rapierNotesReadsSettled(f)))) _rapierNotesReadsWindow();
}
function _rapierNotesBytesWords(n) { return n >= 1048576 ? (n / 1000000).toLocaleString('en', {maximumSignificantDigits: 4}) + ' MB' : (n / 1000).toLocaleString('en', {maximumSignificantDigits: 4}) + ' kB'; }

function _rapierNotesEl(tag, className, text) {
	const el = document.createElement(tag);
	if (className) el.className = className;
	if (text != null) el.textContent = text;
	return el;
}
function _rapierNotesKeepFocus(root) {
	const from = document.activeElement;
	if (!root?.contains(from)) return () => false;
	const before = _rapierModalFocusables(root), at = before.indexOf(from);
	const keys = [...from.attributes].filter(a => a.name === 'id' || a.name === 'name' || a.name.startsWith('data-notes-')).map(a => [a.name, a.value]);
	if (!keys.length && from.hasAttribute('aria-label')) keys.push(['aria-label', from.getAttribute('aria-label')]);
	return () => {
		if (document.activeElement !== from && root.contains(document.activeElement) && document.activeElement !== root) return true;
		if (from.isConnected || document.activeElement !== document.body) return false;
		const controls = _rapierModalFocusables(root);
		const match = keys.length && controls.find(el => el.tagName === from.tagName && keys.every(([name, value]) => el.getAttribute(name) === value));
		const target = match || controls[Math.max(0, Math.min(at, controls.length - 1))] || root;
		target.focus({preventScroll: true});
		return document.activeElement === target;
	};
}
function _rapierNotesRadioKey(event) {
	if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return false;
	const radio = event.target.closest?.('[role="radio"]'), group = radio?.closest('[role="radiogroup"]');
	if (!group || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return false;
	const rows = [...group.querySelectorAll('[role="radio"]:not([disabled])')], at = rows.indexOf(radio);
	if (at < 0 || !rows.length) return false;
	event.preventDefault();
	const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
		: (at + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + rows.length) % rows.length;
	rows.forEach((row, i) => { row.tabIndex = i === next ? 0 : -1; });
	rows[next].focus({preventScroll: true}); rows[next].click();
	return true;
}
function _rapierNotesIcon(...ds) {
	if (ds.length === 1 && typeof ds[0] === 'string' && (Object.hasOwn(RAPIER_NOTES_EDITOR_GLYPHS, ds[0]) || Object.hasOwn(RAPIER_NOTES_TABLE_GLYPHS, ds[0]) || Object.hasOwn(RAPIER_NOTES_ICONS, ds[0]))) return _rapierNotesGlyph(ds[0]);
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
	for (const d of ds.flat()) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); svg.appendChild(path); }
	return svg;
}
// A glyph only Notes draws is written once, in RAPIER_NOTES_ICONS. tools/check-icon-copies.mjs refuses
const RAPIER_NOTES_EDITOR_GLYPHS = {
	kebab: 'btn-overflow', search: 'btn-find', history: 'btn-undo', close: 'btn-embed-close',
	back: 'btn-notes-back', pin: 'btn-notes-pin', bell: 'btn-notes-remind', plus: 'btn-notes-plus', 'chevron-left': 'settings-open-chevron',
};
const RAPIER_NOTES_TABLE_GLYPHS = {tick: 'check-square', image: 'image', 'chevron-down': 'chevron-down', 'chevron-right': 'chevron-right'};
function _rapierNotesGlyph(name) {
	const NS = 'http://www.w3.org/2000/svg';
	if (Object.hasOwn(RAPIER_NOTES_TABLE_GLYPHS, name)) {
		const svg = document.createElementNS(NS, 'svg'), body = typeof _RAPIER_COMMAND_ICONS === 'object' ? _RAPIER_COMMAND_ICONS[RAPIER_NOTES_TABLE_GLYPHS[name]] || '' : '';
		svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
		for (const [, tag, attrs] of body.matchAll(/<(\w+)((?:\s+[\w-]+="[^"]*")*)\s*\/?>/g)) {
			const el = document.createElementNS(NS, tag);
			for (const [, key, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) el.setAttribute(key, value);
			svg.appendChild(el);
		}
		return svg;
	}
	const id = RAPIER_NOTES_EDITOR_GLYPHS[name];
	if (!id) return _rapierNotesIcon(RAPIER_NOTES_ICONS[name] || []);
	const source = document.getElementById(id)?.querySelector('svg');
	const svg = source ? source.cloneNode(true) : document.createElementNS(NS, 'svg');
	for (const attr of ['id', 'class', 'width', 'height', 'style', 'hidden']) svg.removeAttribute(attr);
	svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
	return svg;
}
// RAPIER_NOTES blocks: the note's kebab beside the editor's, the import sheet's close beside the
const RAPIER_NOTES_MARKUP_GLYPHS = [['btn-notes-kebab', 'btn-overflow'], ['[data-action="notes-import-close"]', 'navigator-close']];
function _rapierNotesMarkupGlyphs() {
	for (const [target, source] of RAPIER_NOTES_MARKUP_GLYPHS) {
		const el = target.startsWith('[') ? document.querySelector(target) : document.getElementById(target), svg = document.getElementById(source)?.querySelector('svg');
		if (el && svg && !el.querySelector('svg')) el.appendChild(svg.cloneNode(true));
	}
}
const RAPIER_NOTES_ICONS = {
	trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M10 11v6', 'M14 11v6'],
	copy: ['M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
	send: ['M22 2 11 13', 'M22 2 15 22 11 13 2 9z'],
	folder: ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'],
	palette: ['M12 21a9 9 0 0 1 0-18c4.97 0 9 3.582 9 8c0 1.06-.474 2.078-1.318 2.828c-.844.75-1.989 1.172-3.182 1.172h-2.5a2 2 0 0 0-1 3.75a1.3 1.3 0 0 1-1 2.25', 'M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0', 'M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0', 'M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0-2 0'],
	archive: ['M21 8v13H3V8', 'M1 3h22v5H1z', 'M10 12h4'],
	link: ['M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3', 'M8 12h8'],
	tag: ['M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z', 'M7 7h.01'],
	pen: ['M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z'],
	camera: ['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z', 'M12 9a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'],
	mic: ['M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z', 'M19 10v2a7 7 0 0 1-14 0v-2', 'M12 19v4', 'M8 23h8'],
	page: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8']
};
const RAPIER_NOTES_ROW_ICONS = {
	'trash': RAPIER_NOTES_ICONS.trash, 'delete-forever': RAPIER_NOTES_ICONS.trash, 'copy': RAPIER_NOTES_ICONS.copy,
	'open-document': RAPIER_NOTES_ICONS.page, 'share': RAPIER_NOTES_ICONS.send,
	'section-face': RAPIER_NOTES_ICONS.folder, 'colour': RAPIER_NOTES_ICONS.palette,
	'find-note': 'search', 'archive': RAPIER_NOTES_ICONS.archive, 'restore': 'history',
	'connections': RAPIER_NOTES_ICONS.link, 'tags-face': RAPIER_NOTES_ICONS.tag, 'history-face': 'history',
	'boxes': 'tick'
};
const RAPIER_NOTES_ADD_ICONS = {
	note: RAPIER_NOTES_ICONS.page, drawing: RAPIER_NOTES_ICONS.pen, picture: 'image',
	photo: RAPIER_NOTES_ICONS.camera, recording: RAPIER_NOTES_ICONS.mic, attachment: RAPIER_NOTES_ICONS.link, files: RAPIER_NOTES_ICONS.link
};
const RAPIER_NOTES_SECTIONS = [['skills', 'Skills'], ['pinned', 'Pinned'], ['others', 'Other'], ['archive', 'Archived']];
const RAPIER_NOTES_BIN = 'trash';
const RAPIER_NOTES_SECTION_WORDS = Object.fromEntries(RAPIER_NOTES_SECTIONS);
function _rapierNotesBuildSurface() {
	const state = _rapierNotes;
	const surface = _rapierNotesEl('div', 'rapier-notes-surface');
	surface.id = 'rapier-notes-surface'; surface.hidden = true; surface.tabIndex = -1;
	_rapierNotesMarkupGlyphs();
	const spring = _rapierNotesSpring(); if (spring) { surface.style.setProperty('--notes-spring', spring); surface.style.setProperty('--notes-spring-ms', RAPIER_NOTES_SPRING_MS + 'ms'); }
	surface.setAttribute('role', 'dialog'); surface.setAttribute('aria-label', 'Notes'); surface.setAttribute('aria-modal', 'true');
	const head = _rapierNotesEl('div', 'rapier-notes-head');
	const backBtn = _rapierNotesEl('button', 'rapier-notes-btn rapier-notes-back'); backBtn.type = 'button'; backBtn.dataset.notesAct = 'close'; backBtn.setAttribute('aria-label', 'back to the editor'); backBtn.appendChild(_rapierNotesGlyph('back'));
	const mark = _rapierNotesEl('button', 'rapier-notes-wordmark', 'rapier notes (beta)');
	mark.type = 'button'; mark.dataset.notesAct = 'close'; mark.setAttribute('aria-label', 'rapier notes: back to the editor');
	const searchBtn = _rapierNotesEl('button', 'rapier-notes-btn'); searchBtn.type = 'button'; searchBtn.dataset.notesAct = 'search'; searchBtn.setAttribute('aria-label', 'search notes'); searchBtn.setAttribute('aria-expanded', 'false'); searchBtn.appendChild(_rapierNotesGlyph('search'));
	const menuBtn = _rapierNotesEl('button', 'rapier-notes-btn'); menuBtn.type = 'button'; menuBtn.dataset.notesAct = 'menu'; menuBtn.setAttribute('aria-label', 'notes settings'); menuBtn.setAttribute('aria-haspopup', 'dialog'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.appendChild(_rapierNotesGlyph('kebab'));
	const addBtn = _rapierNotesEl('button', 'rapier-notes-btn rapier-notes-plus'); addBtn.type = 'button'; addBtn.dataset.notesAct = 'adds'; addBtn.setAttribute('aria-label', 'add a note'); addBtn.setAttribute('aria-expanded', 'false'); addBtn.appendChild(_rapierNotesGlyph('plus'));
	const headGap = _rapierNotesEl('div', 'rapier-notes-head__gap'); headGap.setAttribute('aria-hidden', 'true');
	head.append(backBtn, mark, headGap, addBtn, searchBtn, menuBtn);
	const find = _rapierNotesEl('div', 'find-bar rapier-notes-find'); find.id = 'rapier-notes-find'; searchBtn.setAttribute('aria-controls', find.id); find.setAttribute('role', 'search'); find.setAttribute('aria-label', 'search notes'); find.hidden = true;
	const search = _rapierNotesEl('input', 'find-input rapier-notes-search'); search.type = 'search'; search.placeholder = 'search…'; search.setAttribute('aria-label', 'Search notes'); search.autocomplete = 'off';
	find.appendChild(search);
	const addsBar = _rapierNotesEl('div', 'find-bar rapier-notes-addsbar'); addsBar.id = 'rapier-notes-addsbar'; addsBar.hidden = true; addsBar.setAttribute('role', 'group'); addsBar.setAttribute('aria-label', 'add a note'); addBtn.setAttribute('aria-controls', addsBar.id);
	for (const [kind, word] of [['note', 'Note'], ['recording', 'Record'], ['picture', 'Image'], ['drawing', 'Draw']]) {
		const b = _rapierNotesEl('button', 'rapier-notes-add'); b.type = 'button'; b.dataset.notesAct = 'add'; b.dataset.notesAdd = kind;
		b.append(_rapierNotesIcon(RAPIER_NOTES_ADD_ICONS[kind]), document.createTextNode(word));
		addsBar.appendChild(b);
	}
	const scroll = _rapierNotesEl('div', 'rapier-notes-scroll');
	for (const [id] of RAPIER_NOTES_SECTIONS) scroll.appendChild(_rapierNotesSectionEl(id));
	const scrollRoom = _rapierNotesEl('div', 'rapier-notes-scroll__room'); scrollRoom.setAttribute('aria-hidden', 'true');
	scroll.appendChild(scrollRoom);
	const fab = _rapierNotesEl('button', 'rapier-notes-fab'); fab.type = 'button'; fab.dataset.notesAct = 'fab'; fab.setAttribute('aria-label', 'jump to a section, or fast scroll'); fab.setAttribute('aria-haspopup', 'dialog'); fab.setAttribute('aria-expanded', 'false');
	const popup = _rapierNotesEl('div', 'rapier-notes-popup'); popup.hidden = true; popup.setAttribute('aria-hidden', 'true');
	const sheet = _rapierNotesEl('div', 'rapier-notes-sheet'); sheet.id = 'rapier-notes-sheet'; sheet.tabIndex = -1; sheet.inert = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Note actions');
	const status = _rapierNotesEl('p', 'sr-only'); status.id = 'rapier-notes-status'; status.setAttribute('data-rapier-announcer', ''); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
	const help = _rapierNotesEl('p', 'sr-only', 'Enter opens this note. Space selects it. Shift+F10 opens note actions. Arrow keys browse notes. Shift+J and Shift+K move it.'); help.id = 'rapier-notes-card-help';
	const selected = _rapierNotesEl('p', 'sr-only', 'Selected.'); selected.id = 'rapier-notes-selected';
	const settings = _rapierNotesSettingsEl();
	const jump = _rapierNotesJumpEl();
	const ask = _rapierNotesAskEl();
	const bin = _rapierNotesBinEl();
	surface.append(head, find, addsBar, scroll, fab, popup, sheet, status, help, selected, jump, ask, settings, bin);
	document.body.appendChild(surface);
	state.surface = surface; state.scroll = scroll; state.scrollRoom = scrollRoom; state.sheet = sheet; state.find = find; state.search = search; state.fab = fab; state.popupEl = popup;
	state.addsBar = addsBar; state.settingsEl = settings; state.jumpEl = jump; state.askEl = ask; state.binEl = bin; state.binPicked = new Set();
	_rapierNotesBind(surface, search);
	_rapierNotesFabBind(fab, scroll);
	_rapierNotesSheetSwipe(sheet);
	return surface;
}

const RAPIER_NOTES_SORT_ORDER = [['custom', 'Custom'], ['created', 'Created'], ['modified', 'Modified']];
function _rapierNotesInfoBtn(value) {
	const b = _rapierNotesEl('button', 'settings-info-btn settings-info-btn--hang');
	b.type = 'button'; b.dataset.action = 'information'; b.dataset.value = value;
	b.setAttribute('aria-label', 'what these words mean'); b.setAttribute('aria-haspopup', 'dialog');
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('class', 'icon'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
	const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
	ring.setAttribute('cx', '12'); ring.setAttribute('cy', '12'); ring.setAttribute('r', '10');
	const stem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
	stem.setAttribute('x1', '12'); stem.setAttribute('y1', '16'); stem.setAttribute('x2', '12'); stem.setAttribute('y2', '12');
	const dot = document.createElementNS('http://www.w3.org/2000/svg', 'line');
	dot.setAttribute('x1', '12'); dot.setAttribute('y1', '8'); dot.setAttribute('x2', '12.01'); dot.setAttribute('y2', '8');
	svg.append(ring, stem, dot); b.appendChild(svg);
	return b;
}
function _rapierNotesSettingsTitle(word, info) {
	const row = _rapierNotesEl('div', 'navigator-title-row');
	const title = _rapierNotesEl('div', 'settings-section__title', word);
	row.append(title);
	if (info) row.append(_rapierNotesInfoBtn(info));
	return row;
}
function _rapierNotesSettingsFirstRow() {
	const row = _rapierNotesEl('div', 'settings-stats-row rapier-notes-settings-first');
	row.appendChild(_rapierNotesColourModeBtn());
	const main = document.getElementById('switch-theme');
	if (main) {
		const copy = main.cloneNode(true);
		copy.removeAttribute('id'); copy.removeAttribute('style'); copy.classList.add('rapier-notes-theme');
		row.appendChild(copy);
		renderSwitch(copy, RapierPreferences.look('theme'));
	}
	return row;
}
function _rapierNotesColourMode() { return RapierPreferences.read('notesColour') === 'page' ? 'page' : 'bar'; }
// .rapier-notes-colour-mode__fill); the palette is RAPIER_NOTES_ICONS.palette, the colour act's one
function _rapierNotesColourModeBtn() {
	const b = _rapierNotesEl('button', 'rapier-notes-colour-mode'); b.type = 'button'; b.dataset.notesAct = 'colour-mode';
	b.setAttribute('aria-label', 'colour the whole page');
	const frame = _rapierNotesEl('span', 'rapier-notes-colour-mode__page'); frame.setAttribute('aria-hidden', 'true');
	const NS = 'http://www.w3.org/2000/svg', edge = document.createElementNS(NS, 'svg'), rect = document.createElementNS(NS, 'rect');
	edge.setAttribute('class', 'rapier-notes-colour-mode__edge'); edge.setAttribute('viewBox', '0 0 24 32');
	for (const [k, v] of Object.entries({x: 1, y: 1, width: 22, height: 30})) rect.setAttribute(k, String(v));
	edge.appendChild(rect);
	const palette = _rapierNotesIcon(RAPIER_NOTES_ICONS.palette); palette.setAttribute('class', 'rapier-notes-colour-mode__palette');
	frame.append(_rapierNotesEl('span', 'rapier-notes-colour-mode__fill'), edge, palette);
	b.appendChild(frame);
	_rapierNotesColourModeWear(b);
	return b;
}
function _rapierNotesColourModeWear(b) { b?.setAttribute('aria-pressed', String(_rapierNotesColourMode() === 'page')); }
function _rapierNotesSyncFacts() {
	const app = _rapierNotesIsApp();
	let live = null;
	try { live = typeof _rapierNotesSyncUi === 'object' ? _rapierNotesSyncUi.status() : null; } catch (_) {}
	const vault = _rapierNotes.syncState?.vault;
	const S = globalThis.RapierNotesSyncSession, other = live?.stage ? (live.mode === 'provider' ? live.provider : null) : vault?.mode === 'provider' ? vault.provider : null;
	const kept = live?.stage ? (live.mode === 'r2-key' || other && !S?.providerUsesSignIn(other)) : (vault?.mode === 'r2-key' || other && !S?.providerUsesSignIn(other));
	const connected = live?.stage ? (kept ? live.credentialStored === true : live.authorized === true)
		: app ? vault?.mode === 'companion' : kept && Array.isArray(vault.credential) && vault.credential.length > 0;
	const at = live?.stage ? live.backedUpAt : _rapierNotes.syncState?.backedUpAt;
	return {app, connected, service: other && S?.PROVIDERS?.[other]?.label.toLowerCase() || null, at: connected && Number.isSafeInteger(at) && at > 0 ? at : null};
}
function _rapierNotesBackupWhen(at) {
	const d = new Date(at);
	let day; try { day = d.toLocaleDateString(undefined, {day: 'numeric', month: 'short', year: 'numeric'}); } catch (_) { day = d.toDateString(); }
	return day + ', ' + _rapierNotesClockWords(at);
}
function _rapierNotesSyncBox() {
	const b = _rapierNotesEl('button', 'settings-action-btn rapier-notes-sync rapier-cloudflare'); b.type = 'button'; b.dataset.notesAct = 'sync';
	_rapierNotesSyncBoxWear(b);
	return b;
}
function _rapierNotesSyncBoxWear(b) {
	if (!b) { for (const button of document.querySelectorAll('.rapier-notes-sync')) _rapierNotesSyncBoxWear(button); return; }
	const facts = _rapierNotesSyncFacts();
	b.classList.add('rapier-cloudflare');
	b.replaceChildren(_rapierNotesEl('span', 'rapier-notes-sync__word', facts.app ? 'rapier sync (coming soon)' : !facts.connected ? 'sign in with cloudflare' : facts.at ? 'backed up to ' + (facts.service || 'cloudflare') : 'connected to ' + (facts.service || 'cloudflare')));
	if (facts.connected) b.appendChild(_rapierNotesEl('span', 'rapier-notes-sync__when', facts.at ? _rapierNotesBackupWhen(facts.at) : 'not backed up yet'));
	if (facts.connected) b.dataset.active = 'true'; else delete b.dataset.active;
}
function _rapierNotesSyncPress() {
	if (_rapierNotesIsApp()) {
		if (typeof _rapierRequireFeature === 'function' && !_rapierRequireFeature('sync', {source: 'notes-sync'})) return;
		if (typeof _rapierNotesSyncUi === 'object') _rapierNotesSyncUi.open();
		else if (typeof _rapierUiSyncOpen === 'function') _rapierUiSyncOpen();
		return;
	}
	if (navigator.onLine === false) { showToast('This device is not connected to the internet.', 'info'); return; }
	if (typeof _rapierCfToggle === 'function') _rapierCfToggle();
}
function _rapierNotesSettingsEl() {
	const overlay = _rapierNotesEl('div', 'settings-overlay rapier-notes-settings-overlay');
	overlay.id = 'rapier-notes-settings-overlay'; overlay.inert = true; overlay.setAttribute('aria-hidden', 'true');
	const panel = _rapierNotesEl('div', 'settings-panel'); panel.id = 'rapier-notes-settings-panel';
	panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'notes settings'); panel.tabIndex = -1;
	const header = _rapierNotesEl('div', 'settings-panel__header');
	const v = String(document.querySelector('meta[name="rapier-version"]')?.content || '').trim();
	header.appendChild(_rapierNotesEl('div', 'settings-panel__title', 'rapier notes' + (v ? ' v' + v : '')));
	const close = _rapierNotesEl('button', 'settings-close-btn'); close.type = 'button'; close.dataset.notesAct = 'settings-close'; close.setAttribute('aria-label', 'close settings');
	close.appendChild(_rapierNotesGlyph('close'));
	header.appendChild(close);
	const body = _rapierNotesEl('div', 'settings-panel__body'); body.id = 'rapier-notes-settings-body';
	panel.append(header, body); overlay.appendChild(panel);
	return overlay;
}
function _rapierNotesSettingsPaint() {
	const state = _rapierNotes, body = state.settingsEl?.querySelector('.settings-panel__body');
	if (!body) return;
	body.replaceChildren();
	const toggle = (label, values, act, key, small) => {
		const box = _rapierNotesEl('div', 'theme-switcher theme-switcher--joined theme-switcher--onoff' + (small ? ' rapier-notes-switch--four' : '') + ' rapier-notes-switch');
		box.setAttribute('role', 'group'); box.setAttribute('aria-label', label);
		for (const [value, word] of values) {
			const b = _rapierNotesEl('button', 'theme-switcher__btn onoff-btn', word);
			b.type = 'button'; b.dataset.notesAct = act; b.dataset.value = value;
			box.appendChild(b);
		}
		box.dataset.switch = key;
		renderSwitch(box, RapierPreferences.read(key));
		return box;
	};
	const action = (word, act, data = {}) => {
		const b = _rapierNotesEl('button', 'settings-action-btn', word); b.type = 'button'; b.dataset.notesAct = act;
		for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
		return b;
	};
	const row = (...buttons) => { const r = _rapierNotesEl('div', 'settings-action-row'); const pair = _rapierNotesEl('div', 'settings-action-pair'); pair.append(...buttons); r.appendChild(pair); return r; };
	body.appendChild(_rapierNotesSettingsFirstRow());
	body.appendChild(row(_rapierNotesSyncBox()));
	body.appendChild(_rapierNotesSettingsTitle('sort by'));
	body.appendChild(toggle('sort by', RAPIER_NOTES_SORT_ORDER, 'sort', 'notesSort'));
	body.appendChild(_rapierNotesSettingsTitle('layout'));
	body.appendChild(toggle('layout', [['half', 'Half'], ['full', 'Full']], 'layout', 'notesLayout'));
	body.appendChild(_rapierNotesSettingsTitle('sections', 'notes-sections'));
	body.appendChild(row(action('New', 'section-add-menu')));
	body.appendChild(row(action('Sections', 'section-reorder')));
	body.appendChild(_rapierNotesSettingsTitle('folder', 'notes-folder'));
	const imp = action('Import', 'menu-import'); imp.dataset.action = 'notes-import';
	const bak = action('Backup', 'menu-backup'); bak.dataset.action = 'notes-backup';
	body.appendChild(row(imp));
	body.appendChild(row(bak));
	if (_rapierNotesStore.native && globalThis.RapierPlatform?.host?.notesBackup) {
		const status = _rapierNotesEl('p', 'rapier-notes-storage', _rapierNotesAndroidBackupSentence());
		status.id = 'notes-android-backup-status'; body.appendChild(status);
	}
	body.appendChild(row(action('Saved files', 'menu-saved-files')));
	if (globalThis.RapierNotesHistory) body.appendChild(row(action('Tidy history', 'menu-history-tidy')));
	const extra = [];
	if (Array.isArray(state.index?.imports) && state.index.imports.length) extra.push(action('Imports', 'menu-imports'));
	if (state.backupBusy && state.backupController) extra.push(action('Cancel preparation', 'backup-cancel'));
	if (state.unfinishedBackup) extra.push(action('Discard unfinished backup', 'backup-discard-unfinished'));
	if (state.preparedBackup) { if (!state.preparedBackup.sequence || state.preparedBackup.sent.length < state.preparedBackup.plan.parts.length) extra.push(action(state.preparedBackup.sequence ? 'Continue backup' : 'Export backup copy', 'backup-export')); extra.push(action('Discard backup copy', 'backup-discard')); }
	for (const [i, restored] of (state.androidRestoreSessions || []).entries()) extra.push(action('Export restored backup' + (state.androidRestoreSessions.length > 1 ? ' ' + (i + 1) : ''), 'backup-export-android', {notesRestore: restored.id}));
	for (const b of extra) body.appendChild(row(b));
	body.appendChild(_rapierNotesSettingsTitle('skills'));
	body.appendChild(toggle('skills', [['false', 'Off'], ['true', 'On']], 'skills', 'notesSkills'));
	if (globalThis.RapierPlatform?.host?.requestNotesRole) body.appendChild(row(action('Set as notes app', 'role')));
	const bin = row(action('Recycle bin', 'bin-open'));
	bin.classList.add('rapier-notes-settings-foot');
	body.appendChild(bin);
	_rapierNotesSettingsBorrow(body);
	body.scrollTop = 0;
}
// The Notes panel shows the main panel's plug-ins and its About and Licenses by borrowing the main panel's own live nodes --
const _rapierNotesBorrowed = {nodes: null, marks: null};
function _rapierNotesSettingsBorrow(body) {
	const b = _rapierNotesBorrowed;
	if (!b.nodes) {
		const title = document.getElementById('settings-plugins-title'), about = document.getElementById('settings-about-section');
		if (!title || !about || title.parentNode !== about.parentNode) return;
		const nodes = [];
		for (let n = title; n && n !== about; n = n.nextElementSibling) nodes.push(n);
		b.marks = [document.createComment('the plugins, in the Notes panel'), document.createComment('About, in the Notes panel')];
		title.before(b.marks[0]); about.before(b.marks[1]);
		b.nodes = [...nodes, about];
	}
	body.append(...b.nodes);
}
function _rapierNotesSettingsGiveBack() {
	const b = _rapierNotesBorrowed;
	if (!b.nodes) return;
	b.marks[0].replaceWith(...b.nodes.slice(0, -1));
	b.marks[1].replaceWith(b.nodes[b.nodes.length - 1]);
	b.nodes = null; b.marks = null;
}
// While the Notes panel holds About, a door in it (the guide, the licences) knows it was opened from Notes.
function _rapierNotesSettingsBorrowing() { return !!_rapierNotesBorrowed.nodes; }
function _rapierNotesSettingsOpen(on) {
	const state = _rapierNotes, overlay = state.settingsEl; if (!overlay) return;
	const menuBtn = state.surface?.querySelector('[data-notes-act="menu"]');
	if (on) {
		_rapierNotesPopup(null); _rapierNotesSnackHide();
		_rapierNotesSettingsPaint();
		const beforeRestores = JSON.stringify(state.androidRestoreSessions || []);
		void _rapierNotesStorageAnswer(false, {measure: false}).then(() => { if (_rapierNotesSettingsIsOpen() && beforeRestores !== JSON.stringify(state.androidRestoreSessions || [])) _rapierNotesSettingsPaint(); });
		openDialog(overlay, {panel: '.settings-panel', onEscape: () => _rapierNotesSettingsOpen(false)});
		menuBtn?.setAttribute('aria-expanded', 'true');
	} else {
		closeDialog(overlay);
		setTimeout(() => { if (!_rapierNotesSettingsIsOpen()) _rapierNotesSettingsGiveBack(); }, 600);
		menuBtn?.setAttribute('aria-expanded', 'false');
	}
}
function _rapierNotesSettingsIsOpen() { return !!_rapierNotes.settingsEl?.classList.contains('open'); }

function _rapierNotesJumpEl() {
	const overlay = _rapierNotesEl('div', 'settings-overlay restore-modal-overlay rapier-notes-jump-overlay');
	overlay.id = 'rapier-notes-jump-overlay'; overlay.inert = true; overlay.setAttribute('aria-hidden', 'true');
	overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'jump to a section');
	const panel = _rapierNotesEl('div', 'settings-panel navigator-panel');
	const body = _rapierNotesEl('div', 'settings-panel__body');
	const head = _rapierNotesEl('div', 'navigator-title-row');
	head.appendChild(_rapierNotesEl('div', 'settings-section__title', 'jump to'));
	const close = _rapierNotesEl('button', 'navigator-close'); close.type = 'button'; close.dataset.notesAct = 'jump-close'; close.setAttribute('aria-label', 'close navigation');
	close.appendChild(_rapierNotesGlyph('close'));
	head.appendChild(close);
	const list = _rapierNotesEl('div', 'navigator-outline'); list.id = 'rapier-notes-jump-list';
	body.append(head, list); panel.appendChild(body); overlay.appendChild(panel);
	return overlay;
}
function _rapierNotesJumpOpen(on) {
	const state = _rapierNotes, overlay = state.jumpEl; if (!overlay) return;
	state.fab?.setAttribute('aria-expanded', String(!!on));
	const panel = overlay.querySelector('.navigator-panel');
	if (!on) {
		if (panel && typeof _rapierUiCircleGrowth === 'function') _rapierUiCircleGrowth(panel, false, state.fab);
		closeDialog(overlay);
		return;
	}
	const list = overlay.querySelector('#rapier-notes-jump-list');
	list.replaceChildren();
	const skills = _rapierNotesSkillsWanted();
	for (const id of _rapierNotesSectionIds()) {
		if (id === 'skills' && !skills) continue;
		const section = state.grids[id]?.parentElement; if (!section || section.hidden) continue;
		const count = _rapierNotesSorted(_rapierNotesModel().sortedSection(state.index, id)).filter(_rapierNotesMatches).length;
		const b = _rapierNotesEl('button', 'navigator-outline__item', RAPIER_NOTES_SECTION_WORDS[id] || id);
		b.type = 'button'; b.dataset.notesAct = 'jump'; b.dataset.notesJump = id;
		if (count) b.appendChild(_rapierNotesEl('span', 'rapier-notes-count', String(count)));
		list.appendChild(b);
	}
	openDialog(overlay, {panel: '.navigator-panel', onEscape: () => _rapierNotesJumpOpen(false)});
	if (panel && typeof _rapierUiCircleGrowth === 'function') _rapierUiCircleGrowth(panel, true, state.fab);
}

function _rapierNotesAskEl() {
	const overlay = _rapierNotesEl('div', 'settings-overlay restore-modal-overlay rapier-notes-jump-overlay rapier-notes-ask-overlay');
	overlay.id = 'rapier-notes-ask-overlay'; overlay.inert = true; overlay.setAttribute('aria-hidden', 'true');
	overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'go back to the rapier editor?');
	const panel = _rapierNotesEl('div', 'settings-panel navigator-panel');
	const body = _rapierNotesEl('div', 'settings-panel__body');
	const row = _rapierNotesEl('button', 'navigator-outline__item rapier-notes-ask', 'go back to the rapier editor?');
	row.type = 'button'; row.dataset.notesAct = 'ask-back';
	body.appendChild(row); panel.appendChild(body); overlay.appendChild(panel);
	return overlay;
}
function _rapierNotesAskOpen(on, from) {
	const state = _rapierNotes, overlay = state.askEl; if (!overlay) return;
	const panel = overlay.querySelector('.navigator-panel');
	if (on) state.askFrom = from || state.surface?.querySelector('.rapier-notes-head [data-notes-act="close"]') || null;
	const arrow = state.askFrom;
	if (!on) {
		if (panel && arrow && typeof _rapierUiCircleGrowth === 'function') _rapierUiCircleGrowth(panel, false, arrow);
		closeDialog(overlay); state.askFrom = null;
		return;
	}
	openDialog(overlay, {panel: '.navigator-panel', onEscape: () => _rapierNotesAskOpen(false)});
	if (panel && arrow && typeof _rapierUiCircleGrowth === 'function') _rapierUiCircleGrowth(panel, true, arrow);
}

function _rapierNotesBinEl() {
	const overlay = _rapierNotesEl('div', 'settings-overlay rapier-notes-settings-overlay');
	overlay.id = 'rapier-notes-bin-overlay'; overlay.inert = true; overlay.setAttribute('aria-hidden', 'true');
	const panel = _rapierNotesEl('div', 'settings-panel'); panel.id = 'rapier-notes-bin-panel';
	panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'recycle bin'); panel.tabIndex = -1;
	const header = _rapierNotesEl('div', 'settings-panel__header');
	header.appendChild(_rapierNotesEl('div', 'settings-panel__title', 'recycle bin'));
	const close = _rapierNotesEl('button', 'settings-close-btn'); close.type = 'button'; close.dataset.notesAct = 'bin-close'; close.setAttribute('aria-label', 'close the recycle bin');
	close.appendChild(_rapierNotesGlyph('close'));
	header.appendChild(close);
	const body = _rapierNotesEl('div', 'settings-panel__body'); body.id = 'rapier-notes-bin-body';
	panel.append(header, body); overlay.appendChild(panel);
	return overlay;
}
function _rapierNotesBinFiles() {
	const state = _rapierNotes; if (!state.index) return [];
	return _rapierNotesModel().sortedSection(state.index, RAPIER_NOTES_BIN);
}
function _rapierNotesBinPaint() {
	const state = _rapierNotes, body = state.binEl?.querySelector('.settings-panel__body');
	if (!body) return;
	const focused = body.contains(document.activeElement), keepFocus = _rapierNotesKeepFocus(body);
	body.replaceChildren();
	const files = _rapierNotesBinFiles();
	body.appendChild(_rapierNotesEl('p', 'rapier-notes-bin-note',
		'Notes and their unshared recordings are deleted from here after 7 days.'));
	if (!files.length) {
		body.appendChild(_rapierNotesEl('p', 'rapier-notes-empty', 'The recycle bin is empty.'));
		state.binPicked = new Set();
		if (focused) state.binEl.querySelector('[data-notes-act="bin-close"]')?.focus({preventScroll: true});
		return;
	}
	const here = new Set(files);
	state.binPicked = new Set([...(state.binPicked || [])].filter(file => here.has(file)));
	const picked = state.binPicked;
	const act = (word, name, disabled) => {
		const b = _rapierNotesEl('button', 'settings-action-btn', word);
		b.type = 'button'; b.dataset.notesAct = name; b.disabled = !!disabled;
		const r = _rapierNotesEl('div', 'settings-action-row'); const pair = _rapierNotesEl('div', 'settings-action-pair');
		pair.appendChild(b); r.appendChild(pair); return r;
	};
	body.appendChild(act('Empty the bin', 'bin-empty'));
	body.appendChild(act(picked.size ? 'Restore ' + picked.size : 'Restore', 'bin-restore', !picked.size));
	body.appendChild(act(picked.size ? 'Delete ' + picked.size + ' forever' : 'Delete forever', 'bin-forever', !picked.size));
	const list = _rapierNotesEl('div', 'rapier-notes-bin-list'); list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'notes in the recycle bin');
	for (const file of files) {
		const row = _rapierNotesEl('button', 'rapier-notes-bin-row');
		row.type = 'button'; row.dataset.notesAct = 'bin-pick'; row.dataset.notesBinFile = file;
		row.setAttribute('role', 'checkbox'); row.setAttribute('aria-checked', String(picked.has(file)));
		if (picked.has(file)) row.dataset.picked = 'true';
		row.appendChild(_rapierNotesEl('span', 'rapier-notes-bin-tick'));
		row.appendChild(_rapierNotesEl('span', 'rapier-notes-bin-name',
			_rapierNotesTitle(file) || file.replace(/\.md$/i, '')));
		list.appendChild(row);
	}
	body.appendChild(list);
	body.scrollTop = 0;
	keepFocus();
}
function _rapierNotesBinOpen(on) {
	const state = _rapierNotes, overlay = state.binEl; if (!overlay) return;
	if (on) {
		state.binPicked = new Set();
		_rapierNotesBinPaint();
		openDialog(overlay, {panel: '.settings-panel', onEscape: () => _rapierNotesBinOpen(false)});
	} else {
		closeDialog(overlay);
	}
}
function _rapierNotesBinIsOpen() { return !!_rapierNotes.binEl?.classList.contains('open'); }
async function _rapierNotesBinRun(act, files) {
	const state = _rapierNotes;
	if (!files.length) return;
	const held = state.selected;
	state.selected = new Set(files);
	try { await _rapierNotesAct(act); }
	finally { state.selected = held; }
	state.binPicked = new Set();
	_rapierNotesBinPaint();
}

function _rapierNotesReorderOn(on) {
	const state = _rapierNotes;
	if (!!on === !!state.reorder) return;
	state.reorder = !!on;
	if (on) {
		_rapierNotesSettingsOpen(false); _rapierNotesJumpOpen(false); _rapierNotesHideSheet();
		state.reorderWasClosed = {};
		const M = _rapierNotesModel();
		for (const id of _rapierNotesSectionIds()) {
			if (id === 'pinned') continue;
			state.reorderWasClosed[id] = _rapierNotesClosed(id);
			if (RAPIER_NOTES_SESSION_SECTIONS.includes(id)) state.opened.delete(id);
			else if (!_rapierNotesClosed(id)) state.index = M.setCollapsed(state.index, id, true);
		}
	} else {
		const M = _rapierNotesModel(), was = state.reorderWasClosed || {};
		for (const [id, closed] of Object.entries(was)) {
			if (RAPIER_NOTES_SESSION_SECTIONS.includes(id)) { if (!closed) state.opened.add(id); }
			else if (_rapierNotesClosed(id) !== closed) state.index = M.setCollapsed(state.index, id, closed);
		}
		state.reorderWasClosed = null;
	}
	state.surface?.classList.toggle('rapier-notes-surface--reorder', !!on);
	_rapierNotesRender();
	void _rapierNotesWriteIndex().catch(() => {});
}
function _rapierNotesReorderMovable(id) { return id !== 'pinned'; }
function _rapierNotesSectionOrder() {
	const want = _rapierNotes.index?.sectionOrder;
	return Array.isArray(want) ? want.filter(id => typeof id === 'string') : null;
}
function _rapierNotesReorderWrite(ids) {
	const state = _rapierNotes, was = state.index;
	state.index = {...state.index, sectionOrder: ids.slice()};
	_rapierNotesRender();
	void _rapierNotesWriteIndex().catch(error => { state.index = was; _rapierNotesRender(); showToast('The section order was not written to the notes folder: ' + String(error?.message || error), 'error'); });
}
function _rapierNotesReorderDown(evt) {
	const state = _rapierNotes;
	if (!state.reorder) return false;
	const head = evt.target.closest?.('.rapier-notes-section-head'); if (!head) return false;
	const id = head.dataset.notesSection;
	if (!_rapierNotesReorderMovable(id)) return false;
	const heads = [...state.scroll.querySelectorAll('.rapier-notes-section:not([hidden]) .rapier-notes-section-head')];
	const rects = heads.map(h => h.getBoundingClientRect());
	state.secDrag = {id, head, heads, rects, from: heads.indexOf(head), at: heads.indexOf(head), y: evt.clientY, pointer: evt.pointerId, moved: false};
	try { head.setPointerCapture(evt.pointerId); } catch (_) {}
	head.classList.add('rapier-notes-section-head--held');
	return true;
}
function _rapierNotesReorderMove(evt) {
	const drag = _rapierNotes.secDrag; if (!drag || drag.pointer !== evt.pointerId) return false;
	const dy = evt.clientY - drag.y;
	if (!drag.moved && Math.abs(dy) < 4) return true;
	drag.moved = true;
	drag.head.style.transform = 'translate3d(0,' + dy + 'px,0)';
	const centre = drag.rects[drag.from].top + drag.rects[drag.from].height / 2 + dy;
	let at = drag.from;
	for (let i = 0; i < drag.rects.length; i++) {
		const r = drag.rects[i];
		if (centre >= r.top && centre <= r.bottom) { at = i; break; }
	}
	if (!_rapierNotesReorderMovable(drag.heads[at]?.dataset.notesSection)) at = drag.at;
	drag.at = at;
	for (let i = 0; i < drag.heads.length; i++) {
		if (i === drag.from) continue;
		const h = drag.heads[i];
		let shift = 0;
		if (drag.from < at && i > drag.from && i <= at) shift = -drag.rects[drag.from].height;
		else if (drag.from > at && i >= at && i < drag.from) shift = drag.rects[drag.from].height;
		h.style.transform = shift ? 'translate3d(0,' + shift + 'px,0)' : '';
	}
	return true;
}
function _rapierNotesReorderUp(evt, cancelled) {
	const state = _rapierNotes, drag = state.secDrag; if (!drag || (evt && drag.pointer !== evt.pointerId)) return false;
	state.secDrag = null;
	try { drag.head.releasePointerCapture(drag.pointer); } catch (_) {}
	drag.head.classList.remove('rapier-notes-section-head--held');
	for (const h of drag.heads) h.style.transform = '';
	if (cancelled || !drag.moved || drag.at === drag.from) { if (drag.moved) _rapierNotesRender(); return drag.moved; }
	_rapierNotesSectionMove(drag.heads.map(h => h.dataset.notesSection), drag.from, drag.at);
	state.swallowClick = performance.now();
	return true;
}
function _rapierNotesSectionMove(ids, from, at) {
	const [moved] = ids.splice(from, 1); ids.splice(at, 0, moved);
	const all = _rapierNotesSectionIds(), shown = new Set(ids);
	let k = 0;
	_rapierNotesReorderWrite(all.map(id => shown.has(id) ? ids[k++] : id));
}
function _rapierNotesKeyMove(target, direction) {
	const state = _rapierNotes, head = state.reorder && target.closest?.('.rapier-notes-section-head'), card = !state.reorder && target.closest?.('.rapier-notes-card');
	if (head && target !== head || card && target !== card) return false;
	if (head) {
		const ids = [...state.scroll.querySelectorAll('.rapier-notes-section:not([hidden]) .rapier-notes-section-head')].map(h => h.dataset.notesSection);
		const id = head.dataset.notesSection, from = ids.indexOf(id), at = from + direction;
		if (from < 0 || at < 0 || at >= ids.length || !_rapierNotesReorderMovable(id) || !_rapierNotesReorderMovable(ids[at])) return !!head;
		_rapierNotesSectionMove(ids, from, at);
		state.scroll.querySelector('.rapier-notes-section-head[data-notes-section="' + CSS.escape(id) + '"]')?.focus({preventScroll: true});
		return true;
	}
	const file = card?.dataset.notesFile, entry = file && state.index?.notes[file];
	if (!entry) return false;
	const M = _rapierNotesModel(), from = M.sortedSection(state.index, M.sectionOf(entry, state.index.sections)).indexOf(file);
	if (from < 0 || from + direction < 0) return true;
	const written = _rapierNotesMove(file, from + direction); if (!written) return true;
	_rapierNotesRender();
	const keep = () => { const el = state.surface?.querySelector('.rapier-notes-card[data-notes-file="' + CSS.escape(file) + '"]'); if (el && document.activeElement !== el && (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected)) el.focus({preventScroll: true}); };
	state.surface.querySelector('.rapier-notes-card[data-notes-file="' + CSS.escape(file) + '"]')?.focus({preventScroll: true});
	requestAnimationFrame(() => requestAnimationFrame(keep));
	void written.then(() => requestAnimationFrame(keep), error => { _rapierNotesRender(); showToast('The new place was not written to the notes folder: ' + String(error?.message || error), 'error'); });
	return true;
}
function _rapierNotesReorderBarPaint() {
	const state = _rapierNotes; if (!state.surface) return;
	let bar = state.reorderBar;
	if (!bar) {
		bar = _rapierNotesEl('div', 'find-bar rapier-notes-reorderbar'); bar.id = 'rapier-notes-reorderbar'; bar.hidden = true;
		bar.appendChild(_rapierNotesEl('span', 'rapier-notes-reorderbar__word', 'drag to reorder, tap to edit'));
		const done = _rapierNotesEl('button', 'rapier-notes-add rapier-notes-reorderbar__done', 'Done'); done.type = 'button'; done.dataset.notesAct = 'reorder-done';
		bar.appendChild(done);
		state.surface.insertBefore(bar, state.scroll);
		state.reorderBar = bar;
	}
	bar.hidden = !state.reorder;
}
function _rapierNotesSectionEl(id) {
	const state = _rapierNotes;
	if (state.grids[id]) return state.grids[id].parentElement;
	const section = _rapierNotesEl('section', 'rapier-notes-section'); section.dataset.notesSection = id; section.hidden = true;
	const fixed = id === 'pinned';
	const headBtn = _rapierNotesEl(fixed ? 'div' : 'button', 'rapier-notes-section-head'); headBtn.dataset.notesSection = id;
	if (!fixed) { headBtn.type = 'button'; headBtn.dataset.notesAct = 'section'; }
	if (!fixed) headBtn.appendChild(_rapierNotesEl('span', 'rapier-notes-section-glyph'));
	const word = _rapierNotesEl('span', 'rapier-notes-section-word', RAPIER_NOTES_SECTION_WORDS[id] || id); word.dataset.word = word.textContent;
	headBtn.appendChild(word);
	const grip = _rapierNotesEl('span', 'rapier-notes-section-grip'); grip.setAttribute('aria-hidden', 'true');
	headBtn.appendChild(grip);
	section.appendChild(headBtn);
	const grid = _rapierNotesEl('div', 'rapier-notes-grid'); grid.setAttribute('role', 'list'); grid.setAttribute('aria-label', RAPIER_NOTES_SECTION_WORDS[id] || id);
	section.appendChild(grid);
	state.grids[id] = grid;
	return section;
}
function _rapierNotesSectionIds() {
	const own = (_rapierNotes.index?.sections || []).map(s => s.name);
	const natural = ['skills', 'pinned', ...own, 'others', 'archive'];
	const wanted = _rapierNotesSectionOrder();
	if (!wanted || !wanted.length) return natural;
	const rank = new Map(); wanted.forEach((id, i) => rank.set(id, i));
	return natural
		.map((id, i) => ({id, i, r: rank.has(id) ? rank.get(id) : natural.length + i}))
		.sort((a, b) => a.r - b.r || a.i - b.i)
		.map(x => x.id);
}
const RAPIER_NOTES_SESSION_SECTIONS = ['archive'];
function _rapierNotesClosed(id) {
	if (id === 'pinned') return false;
	const index = _rapierNotes.index; if (!index) return id === 'skills';
	if (RAPIER_NOTES_SESSION_SECTIONS.includes(id)) return !_rapierNotes.opened.has(id);
	const own = (index.sections || []).find(s => s.name === id);
	if (own) return !!own.collapsed;
	const collapsed = index.collapsed || {};
	return id in collapsed ? !!collapsed[id] : id === 'skills' || id === 'archive';
}
async function _rapierNotesToggleSection(id) {
	if (id === 'pinned') return;
	const state = _rapierNotes, M = _rapierNotesModel();
	if (RAPIER_NOTES_SESSION_SECTIONS.includes(id)) { if (state.opened.has(id)) state.opened.delete(id); else state.opened.add(id); _rapierNotesRender(); return; }
	const was = state.index;
	state.index = M.setCollapsed(state.index, id, !_rapierNotesClosed(id));
	_rapierNotesRender();
	try { await _rapierNotesWriteIndex(); }
	catch (error) { state.index = was; _rapierNotesRender(); showToast('The section\'s state was not written to the notes folder: ' + String(error?.message || error), 'error'); }
}
function _rapierNotesEnsure() { return _rapierNotes.surface || _rapierNotesBuildSurface(); }

function _rapierNotesSkillsWanted() { try { return RapierPreferences.read('notesSkills') === true; } catch (_) { return false; } }
function _rapierNotesMatches(file) { return typeof _rapierNotesLibraryMatches !== 'function' || _rapierNotesLibraryMatches(file); }
function _rapierNotesSnippet(file) { return typeof _rapierNotesLibrarySnippet === 'function' ? _rapierNotesLibrarySnippet(file) : null; }
function _rapierNotesAudio() { return globalThis.RapierNotesAudio; }
function _rapierNotesRecordings(file) {
	const A = _rapierNotesAudio(), text = _rapierNotes.texts.get(file) || '';
	if (typeof A?.recordingsOf !== 'function' || !text.includes('audio')) return [];
	try { return A.recordingsOf(text); } catch (_) { return []; }
}
function _rapierNotesRecordingOnly(line) {
	const A = _rapierNotesAudio(), F = globalThis.RapierNotesAttachments, s = String(line ?? '').trim();
	if (!s) return false;
	try { const rows = [...(A?.recordingsOf(s) || []), ...(F?.attachmentsOf(s) || [])]; return rows.length === 1 && rows[0].raw === s; } catch (_) { return false; }
}
function _rapierNotesDropRecordingLines(el) {
	const A = _rapierNotesAudio(), F = globalThis.RapierNotesAttachments;
	for (const a of [...el.querySelectorAll('a[href]')]) {
		const href = a.getAttribute('href');
		if (!A?.recordingFromHref(href) && !F?.attachmentFromHref(href)) continue;
		const block = a.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6') || a.parentElement;
		if (!block || block === el || block.textContent.trim() !== a.textContent.trim()) continue;
		const parent = block.parentElement;
		block.remove();
		if (parent && parent !== el && !parent.firstElementChild && !parent.textContent.trim()) parent.remove();
	}
}
function _rapierNotesCard(file) {
	const state = _rapierNotes, M = _rapierNotesModel(), entry = state.index.notes[file];
	const held = state.texts.get(file), unread = held == null ? state.readFailed.get(file) || null : null;
	const card = M.projectCard(file, held ?? '');
	const el = _rapierNotesEl('div', 'rapier-notes-card' + (entry.colour ? ' rapier-notes-tint-' + entry.colour : '') + (entry.pinned ? ' rapier-notes-card--pinned' : ''));
	const words = card.body.find(line => line !== '\u{1F5BC}' && !/^\[(?:\\.|[^\]\\])+\]:[ \t]*<?data:/i.test(line));
	el.dataset.notesFile = file; el.dir = 'auto'; el.setAttribute('role', 'listitem'); el.tabIndex = 0; el.setAttribute('aria-label', card.title || words || file.replace(/\.md$/i, ''));
	el.setAttribute('aria-describedby', 'rapier-notes-card-help' + (state.selected.has(file) ? ' rapier-notes-selected' : ''));
	el.setAttribute('aria-keyshortcuts', 'Enter Space Shift+F10 ArrowDown ArrowUp ArrowLeft ArrowRight Shift+J Shift+K');
	if (state.selected.has(file)) el.classList.add('rapier-notes-card--selected');
	el.addEventListener('click', event => {
		if (event.detail !== 0 || event.target.closest('button, a[href], input, select, textarea, [data-notes-act]')) return;
		event.stopPropagation(); _rapierNotesOpenCard(el);
	});
	const title = card.title ? _rapierNotesEl('h3', '', card.title) : null;
	if (title) el.appendChild(title);
	if (unread) { el.classList.add('rapier-notes-card--unread'); el.appendChild(_rapierNotesEl('p', 'rapier-notes-card-unread', unread + (state.sizes.get(file) ? ', ' + _rapierNotesBytesWords(state.sizes.get(file)) : ''))); }
	const link = card.title && !card.body.length && !card.checks.length && /^https?:\/\/\S+$/i.test(card.title);
	if (link) { el.classList.add('rapier-notes-card--link'); let host = ''; try { host = new URL(card.title).hostname.replace(/^www\./, ''); } catch (_) {} if (host) el.appendChild(_rapierNotesEl('div', 'rapier-notes-card-link', host)); }
	const takes = _rapierNotesRecordings(file);
	const snippet = _rapierNotesSnippet(file);
	const rich = !snippet || (title && held?.includes('<!--') && globalThis.RapierMarkdownSpec?.hasInkMarker(held)) ? _rapierNotesCardBody(file, card, title, !!snippet) : null;
	if (title && typeof _rapierNotesLibraryMarkTitle === 'function') _rapierNotesLibraryMarkTitle(title, file);
	if (snippet) el.appendChild(snippet);
	else if (rich) {
		const cover = rich.firstElementChild?.classList.contains('rapier-notes-card-cover') ? rich.firstElementChild : null;
		if (cover) el.insertBefore(cover, el.firstChild);
		if (!cover || rich.textContent.trim() || rich.querySelector('img, svg, video')) el.appendChild(rich);
		else if (!card.title && !takes.length) el.classList.add('rapier-notes-card--picture');
	}
	else {
		card.checks.slice(0, 6).forEach((check, n) => {
			const row = _rapierNotesEl('div', 'rapier-notes-check' + (check.done ? ' rapier-notes-check--done' : ''));
			const box = _rapierNotesEl('button', 'rapier-notes-check-box'); box.type = 'button'; box.dataset.notesCheck = String(n);
			box.setAttribute('aria-pressed', String(check.done)); box.setAttribute('aria-label', (check.done ? 'Untick ' : 'Tick ') + check.text);
			row.append(box, _rapierNotesEl('span', '', check.text)); el.appendChild(row);
		});
		for (const line of card.body) { if (takes.length && _rapierNotesRecordingOnly(line)) continue; el.appendChild(_rapierNotesEl('p', '', line)); }
	}
	if (card.title && !unread && !link && !card.empty && !snippet && !card.body.length && !card.checks.length) el.classList.add('rapier-notes-card--title');
	for (const take of takes) {
		const row = _rapierNotesEl('div', 'rapier-notes-recording');
		const play = _rapierNotesEl('button', 'rapier-notes-recording-play'); play.type = 'button'; play.dataset.notesPlay = take.name;
		play.setAttribute('aria-label', 'Play ' + take.label);
		if (typeof _rapierRecorderCardButton === 'function') _rapierRecorderCardButton(play, file, take);
		row.append(play, _rapierNotesEl('span', 'rapier-notes-recording-time', _rapierNotesAudio().durationWords(take.duration)));
		el.appendChild(row);
	}
	if (typeof _rapierAttachmentsCard === 'function') _rapierAttachmentsCard(el, file, state.texts.get(file) || '');
	if (_rapierNotesIsApp() && entry.remind) {
		const words = M.reminderCardWords(entry, Date.now());
		if (words) {
			const chip = _rapierNotesEl('div', 'rapier-notes-remind');
			chip.appendChild(_rapierNotesGlyph('bell'));
			chip.appendChild(document.createTextNode(words));
			const expected = [{file, id: entry.id, remind: JSON.stringify(M.cleanRemind(entry.remind))}];
			for (const [kind, word] of [['done', 'Done'], ['snooze', 'Snooze']]) {
				const action = _rapierNotesEl('button', 'rapier-notes-btn', word); action.type = 'button';
				action.addEventListener('pointerdown', event => event.stopPropagation());
				action.addEventListener('click', event => {
					event.stopPropagation();
					void _rapierNotesReminderChange([file], {kind}, Date.now(), expected).catch(error =>
						showToast('The reminder was not written to the notes folder: ' + String(error?.message || error), 'error'));
				});
				chip.appendChild(action);
			}
			el.appendChild(chip);
		}
	}
	for (const block of el.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote')) block.dir = 'auto';
	if (entry.pinned) { const pin = _rapierNotesGlyph('pin'); pin.setAttribute('class', 'rapier-notes-mark'); el.appendChild(pin); }
	if (entry.agent) el.appendChild(_rapierNotesEl('div', 'rapier-notes-agent', 'Made by ' + entry.agent.by));
	if (title?._rapierNotesInk || rich?._rapierNotesInk) el._rapierNotesInk = [...(title?._rapierNotesInk || []), ...(!snippet && rich?._rapierNotesInk || [])];
	return el;
}
// never `[image-…]: data:…` as prose. Bounded: the first RAPIER_NOTES_PREVIEW_CHARS after the
const RAPIER_NOTES_PREVIEW_CHARS = 2000, RAPIER_NOTES_TASK_MARK = /\u2063t(\d+):([01])\u2063/, RAPIER_NOTES_COVER_MIN = 160;
function _rapierNotesCoverSmall(img) {
	const w = Number(img.getAttribute('data-rapier-natural-width')) || img.naturalWidth || 0, h = Number(img.getAttribute('data-rapier-natural-height')) || img.naturalHeight || 0;
	return w > 0 && h > 0 && w < RAPIER_NOTES_COVER_MIN && h < RAPIER_NOTES_COVER_MIN;
}
const RAPIER_NOTES_SPRING_MS = 440;
function _rapierNotesSpring() {
	const state = _rapierNotes;
	if (state.spring !== undefined) return state.spring;
	let easing = null;
	try {
		if (globalThis.CSS?.supports?.('transition-timing-function', 'linear(0, 1)')) {
			const k = 180, c = 20, m = 1, steps = 44, pts = [];
			let x = 1, v = 0; const dt = (RAPIER_NOTES_SPRING_MS / 1000) / (steps * 8);
			for (let i = 0; i <= steps; i++) {
				pts.push((1 - x).toFixed(4) + ' ' + Math.round(i * 100 / steps) + '%');
				for (let j = 0; j < 8; j++) { const a = (-k * x - c * v) / m; v += a * dt; x += v * dt; }
			}
			pts[pts.length - 1] = '1 100%';
			easing = 'linear(' + pts.join(', ') + ')';
		}
	} catch (_) { easing = null; }
	state.spring = easing;
	return easing;
}
function _rapierNotesCardBody(file, card, title = null, titleOnly = false) {
	const render = globalThis.rapierRenderPreview, assets = globalThis.RapierImageAssets;
	if (typeof render !== 'function' || !assets || typeof assets.parseAssets !== 'function') return null;
	const text = _rapierNotes.texts.get(file) || '', M = _rapierNotesModel();
	const source = M.cardSource(text), lines = source.lines, at = M.cardHead(source.visible, lines).at;
	const heading = title && at >= 0 ? lines.slice(at, card.start).join('\n') : '';
	const markedTitle = heading.includes('<!--') && globalThis.RapierMarkdownSpec?.hasInkMarker(heading);
	let n = 0, used = 0, cutAt = lines.length; const out = markedTitle ? [heading, ''] : [];
	for (let i = card.lead >= 0 ? card.lead : card.start; !titleOnly && i < lines.length; i++) {
		if (card.lead >= 0 && card.title && i >= at && i < card.start) continue;
		const line = lines[i];
		const lead = card.lead >= 0 && (at < 0 || i < at);
		if (!lead && used + line.length > RAPIER_NOTES_PREVIEW_CHARS && out.length) { cutAt = i; break; }
		if (!lead) used += line.length + 1;
		const m = source.checkable && source.visible[i] ? /^(\s*[-*]\s+)\[( |x|X)\]((?:\s.*)?)$/.exec(line) : null;
		out.push(m ? m[1] + '\u2063t' + (n++) + ':' + (m[2] === ' ' ? '0' : '1') + '\u2063' + m[3] : line);
	}
	if (!out.some(l => l.trim())) return null;
	const body = _rapierNotesBody(text);
	let references = null; try { references = assets.parseAssets(body).references; } catch (_) { references = null; }
	const preview = out.join('\n'); let markdown = preview, boundary = '';
	if (cutAt < lines.length && preview.includes('<!--')) {
		const spec = globalThis.RapierMarkdownSpec;
		if (spec?.hasInkMarker(preview)) {
			const whole = preview + '\n' + lines.slice(cutAt).join('\n');
			const crossing = spec.pairInkSpans(whole).runs.find(run => run.innerStart < preview.length && run.innerEnd > preview.length);
			if (crossing) {
				boundary = '\u2063inkcut\u2063'; while (whole.includes(boundary)) boundary += '\u2063';
				markdown += boundary + whole.slice(preview.length, crossing.end);
			}
		}
	}
	const el = _rapierNotesEl('div', 'rapier-notes-card-body'); let html;
	try {
		for (;;) {
			html = render(markdown, references); if (html == null) return null;
			el.innerHTML = html;
			if (!boundary) break;
			const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let found = false;
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				const at = node.nodeValue.indexOf(boundary); if (at < 0) continue;
				const range = document.createRange(); range.setStart(node, at); range.setEnd(el, el.childNodes.length); range.deleteContents(); found = true; break;
			}
			if (found) break;
			markdown = preview; boundary = '';
		}
	} catch (_) { return null; }
	if (markedTitle && el.firstElementChild?.tagName === 'H1') {
		const head = el.firstElementChild, limit = M.cutText(head.textContent, 80, 80).length;
		if (limit < head.textContent.length) {
			const walker = document.createTreeWalker(head, NodeFilter.SHOW_TEXT); let offset = 0;
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				if (offset + node.nodeValue.length >= limit) { const range = document.createRange(); range.setStart(node, limit - offset); range.setEnd(head, head.childNodes.length); range.deleteContents(); break; }
				offset += node.nodeValue.length;
			}
		}
		for (const anchor of head.querySelectorAll('a')) { anchor.removeAttribute('href'); anchor.removeAttribute('target'); }
		title.replaceChildren(...head.childNodes); head.remove();
		const spans = [...title.querySelectorAll('span.rapier-ink-mark[data-rapier-ink]')];
		if (spans.length) title._rapierNotesInk = spans;
	}
	_rapierNotesDropRecordingLines(el);
	const anchors = [...el.querySelectorAll('a')], only = anchors.length === 1 && el.textContent.trim() === anchors[0].textContent.trim() ? anchors[0].getAttribute('href') : null;
	for (const a of anchors) { a.removeAttribute('href'); a.removeAttribute('target'); }
	if (only) { let host = ''; try { host = new URL(only, 'https://rapier.invalid/').hostname.replace(/^www\./, ''); } catch (_) {} if (host && host !== 'rapier.invalid') el.appendChild(_rapierNotesEl('div', 'rapier-notes-card-link', host)); }
	const lead = [];
	for (let node = el.firstElementChild; node && node.tagName === 'P' && node.children.length && !node.textContent.trim() && [...node.children].every(c => c.tagName === 'IMG'); node = node.nextElementSibling) lead.push(node);
	const pictures = lead.flatMap(p => [...p.children]);
	if (pictures.length && !pictures.some(_rapierNotesCoverSmall)) { for (const p of lead) p.remove(); el.prepend(_rapierNotesCollage(pictures)); }
	for (const img of el.querySelectorAll('img')) { img.setAttribute('draggable', 'false'); img.setAttribute('decoding', 'async'); img.addEventListener('load', () => { _rapierNotesCollageLoaded(img); _rapierNotesRepackSoon(); }); _rapierNotesCardPicture(img, body); }
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), marks = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) if (RAPIER_NOTES_TASK_MARK.test(node.nodeValue)) marks.push(node);
	for (const node of marks) {
		const m = RAPIER_NOTES_TASK_MARK.exec(node.nodeValue); if (!m) continue;
		node.nodeValue = node.nodeValue.replace(RAPIER_NOTES_TASK_MARK, '');
		const done = m[2] === '1', li = node.parentElement?.closest('li') || node.parentElement; if (!li) continue;
		const box = _rapierNotesEl('button', 'rapier-notes-check-box'); box.type = 'button'; box.dataset.notesCheck = m[1];
		box.setAttribute('aria-pressed', String(done)); box.setAttribute('aria-label', (done ? 'Untick ' : 'Tick ') + li.textContent.trim().slice(0, 120));
		li.classList.add('rapier-notes-check'); if (done) li.classList.add('rapier-notes-check--done');
		(node.parentElement === li ? li : node.parentElement).insertBefore(box, node);
	}
	const done = [...el.querySelectorAll('li.rapier-notes-check--done')].filter(li => !li.querySelector('li.rapier-notes-check:not(.rapier-notes-check--done)'));
	if (done.length) {
		const open = _rapierNotes.unfolded.has(file);
		if (!open) for (const li of done) li.classList.add('rapier-notes-check--folded');
		const fold = _rapierNotesEl('button', 'rapier-notes-fold', open ? 'hide checked items' : '+ ' + done.length + (done.length === 1 ? ' checked item' : ' checked items'));
		fold.type = 'button'; fold.dataset.notesFold = open ? 'hide' : 'show'; fold.setAttribute('aria-expanded', String(open));
		el.appendChild(fold);
	}
	if (html.includes('data-rapier-ink=')) {
		const spans = [...el.querySelectorAll('span.rapier-ink-mark[data-rapier-ink]')].filter(span => !span.closest('.rapier-notes-check--folded'));
		if (spans.length) el._rapierNotesInk = spans;
	}
	if (!el.firstElementChild && !el.textContent.trim()) return null;
	return el;
}

function _rapierNotesCardInk(card) {
	const draw = globalThis.RapierInkDraw, spec = globalThis.RapierMarkdownSpec, ink = globalThis.RapierInk;
	if (!draw || !spec || !ink || _rapierNotes.drag) return;
	const body = card.querySelector('.rapier-notes-card-body'), clip = body?.getBoundingClientRect();
	const fragments = new Map(), clipped = new Set();
	for (const span of card._rapierNotesInk) {
		if (!card.contains(span) || span.closest('.rapier-notes-check--folded')) continue;
		let boxes = draw.inkFragments(span);
		if (body?.contains(span)) {
			boxes = boxes.filter(box => box.y < clip.bottom && box.y + box.height > clip.top && box.x < clip.right && box.x + box.width > clip.left);
			clipped.add(span);
		}
		if (boxes.length) fragments.set(span, boxes);
	}
	if (!fragments.size) { card.querySelector('.rapier-ink-layer')?.remove(); return; }
	const pieces = draw.drawInk(card, {spec, ink, spans: fragments.keys(), fragments: span => fragments.get(span) || []});
	for (const piece of pieces) {
		if (!clipped.has(piece.span) || (piece.endSpan && !clipped.has(piece.endSpan))) continue;
		const pad = (piece.kind === 'free' ? 0.09 : 0.11) * piece.em + 1, box = piece.box;
		const edges = [clip.top - box.y + pad, box.x + box.width + pad - clip.right, box.y + box.height + pad - clip.bottom, clip.left - box.x + pad].map(value => Math.max(0, value));
		if (edges.some(value => value > 0)) piece.element.style.clipPath = 'inset(' + edges.map(value => value.toFixed(2) + 'px').join(' ') + ')';
	}
	if (!_rapierNotes.inkFonts) { _rapierNotes.inkFonts = true; document.fonts?.addEventListener?.('loadingdone', _rapierNotesRepackSoon); }
}
function _rapierNotesCollageRows(n) {
	const first = n <= 3 ? n : n % 3, rows = [];
	if (first) rows.push([0, first]);
	for (let i = first; i < n; i += 3) rows.push([i, Math.min(3, n - i)]);
	return rows;
}
function _rapierNotesCollageSize(img) {
	const w = Number(img.getAttribute('data-rapier-natural-width')) || img.naturalWidth || 0, h = Number(img.getAttribute('data-rapier-natural-height')) || img.naturalHeight || 0;
	return w > 0 && h > 0 ? {w, h} : null;
}
function _rapierNotesCollage(pictures) {
	const box = _rapierNotesEl('div', 'rapier-notes-card-cover rapier-notes-collage');
	for (const [start, len] of _rapierNotesCollageRows(pictures.length)) {
		const row = _rapierNotesEl('div', 'rapier-notes-collage-row');
		for (const img of pictures.slice(start, start + len)) { _rapierNotesCollageShape(img); row.appendChild(img); }
		box.appendChild(row);
	}
	return box;
}
function _rapierNotesCollageShape(img) {
	const size = _rapierNotesCollageSize(img);
	if (!size) { img.style.flexGrow = '1'; img.style.aspectRatio = ''; return false; }
	img.style.flexGrow = String(Math.round(1000 * size.w / size.h) / 10); img.style.aspectRatio = size.w + ' / ' + size.h; return true;
}
function _rapierNotesCollageLoaded(img) {
	const row = img.parentElement; if (!row?.classList.contains('rapier-notes-collage-row')) return;
	const box = row.parentElement;
	if (box.querySelectorAll('img').length === 1 && _rapierNotesCoverSmall(img)) { const p = _rapierNotesEl('p'); p.appendChild(img); box.replaceWith(p); return; }
	_rapierNotesCollageShape(img);
}
const RAPIER_NOTES_PIC_GAP = 2;
const _rapierNotesPics = {observer: null, scheduled: false, bound: null};
function _rapierNotesPicTile(el) {
	if (!el?.classList?.contains('block-wrapper--image')) return null;
	if (el.classList.contains('block-wrapper--editing') || el.classList.contains('block-wrapper--metadata') || el.hidden) return null;
	const read = el.querySelector('.block-read'); if (!read || read.textContent.trim()) return null;
	const imgs = read.querySelectorAll('img'); if (imgs.length !== 1) return null;
	return imgs[0];
}
function _rapierNotesPicClear(host) {
	for (const el of host.querySelectorAll('.rapier-notes-pic, .rapier-notes-pic-after')) {
		el.classList.remove('rapier-notes-pic', 'rapier-notes-pic-row', 'rapier-notes-pic-last', 'rapier-notes-pic-after');
		el.style.removeProperty('width'); el.style.removeProperty('margin-right');
	}
}
function _rapierNotesPicLay(tiles) {
	const rows = _rapierNotesCollageRows(tiles.length);
	for (const [start, len] of rows) {
		const row = tiles.slice(start, start + len);
		const ratios = row.map(t => { const size = _rapierNotesCollageSize(t.img); return size ? size.w / size.h : 1; });
		const sum = ratios.reduce((a, b) => a + b, 0) || row.length;
		const gaps = RAPIER_NOTES_PIC_GAP * (len - 1);
		row.forEach((tile, k) => {
			tile.el.classList.add('rapier-notes-pic');
			tile.el.classList.toggle('rapier-notes-pic-row', k === 0);
			tile.el.classList.toggle('rapier-notes-pic-last', start + len >= tiles.length);
			tile.el.style.width = len === 1 ? '100%' : 'calc((100% - ' + gaps + 'px) * ' + (ratios[k] / sum).toFixed(6) + ')';
			tile.el.style.marginRight = k === len - 1 ? '0px' : RAPIER_NOTES_PIC_GAP + 'px';
			const size = _rapierNotesCollageSize(tile.img);
			tile.img.style.aspectRatio = size ? size.w + ' / ' + size.h : '';
		});
	}
}
function _rapierNotesPicApply() {
	const host = document.getElementById('editor-blocks'); if (!host) return;
	_rapierNotesPicClear(host);
	if (!_rapierNotes.mode || !_rapierNotes.current) return;
	const blocks = [...host.children].filter(el => el.classList?.contains('block-wrapper') && !el.classList.contains('block-wrapper--metadata'));
	for (let i = 0; i < blocks.length;) {
		const tiles = [];
		for (let j = i; j < blocks.length; j++) { const img = _rapierNotesPicTile(blocks[j]); if (!img) break; tiles.push({el: blocks[j], img}); }
		if (tiles.length >= 2) {
			_rapierNotesPicLay(tiles);
			const after = blocks[i + tiles.length]; if (after) after.classList.add('rapier-notes-pic-after');
			i += tiles.length;
		} else i += Math.max(1, tiles.length);
	}
	if (typeof _rapierOcrMarkNote === 'function') _rapierOcrMarkNote(host);
}
function _rapierNotesPicSoon() {
	if (_rapierNotesPics.scheduled) return;
	_rapierNotesPics.scheduled = true;
	requestAnimationFrame(() => { _rapierNotesPics.scheduled = false; try { _rapierNotesPicApply(); } catch (error) { console.warn('[rapier] notes', error); } });
}
function _rapierNotesPicAttach(on) {
	const host = document.getElementById('editor-blocks');
	if (_rapierNotesPics.observer) { _rapierNotesPics.observer.disconnect(); _rapierNotesPics.observer = null; }
	if (!on) { if (host) _rapierNotesPicClear(host); return; }
	if (!host || typeof MutationObserver !== 'function') return;
	_rapierNotesPics.observer = new MutationObserver(() => _rapierNotesPicSoon());
	_rapierNotesPics.observer.observe(host, {childList: true, subtree: true});
	if (_rapierNotesPics.bound !== host) { _rapierNotesPics.bound = host; host.addEventListener('load', event => { if (event.target?.tagName === 'IMG' && _rapierNotes.mode) _rapierNotesPicSoon(); }, true); }
	_rapierNotesPicSoon();
}
// RAPIER_NOTES_THUMB_PX on the long side, JPEG XL at low quality where this browser can SHOW JPEG
const RAPIER_NOTES_THUMB_MIN = 48 * 1024;
function _rapierNotesThumbWidth() {
	const state = _rapierNotes;
	let card = 0;
	for (const grid of Object.values(state.grids || {})) card = Math.max(card, parseFloat(grid.style.getPropertyValue('--notes-card-w')) || 0);
	if (!card && state.surface) { const cols = Math.max(1, Number(getComputedStyle(state.surface).getPropertyValue('--notes-cols')) || 2); card = (state.surface.clientWidth - 8 * (cols - 1)) / cols; }
	const ratio = Math.min(3, Math.max(1, Number(globalThis.devicePixelRatio) || 1));
	return Math.min(1280, Math.max(320, Math.ceil((card || 320) * ratio)));
}
function _rapierNotesThumbKey(src, width) {
	let h = 0x811c9dc5; for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
	return h.toString(16).padStart(8, '0') + '-' + src.length.toString(36) + '-' + width;
}
function _rapierNotesCardPicture(img, text) {
	const id = img.getAttribute('data-rapier-asset'), direct = img.getAttribute('data-rapier-image-url');
	if (!id && !direct) { _rapierNotesThumbFor(img, img.getAttribute('src') || '', null, null); return; }
	const images = globalThis.RapierEmbeddedImages, assets = globalThis.RapierImageAssets;
	if (!images || typeof images.present !== 'function' || !assets) return;
	let url = direct, codec = null;
	try {
		if (id) { const row = assets.parseAssets(text).assets.get(assets.normalizeLabel(id)); if (!row) return; url = row.url; codec = row.codec; }
		else { const info = assets.dataImage(direct); if (!info) return; codec = info.codec; }
	} catch (_) { return; }
	if (codec !== 'image/svg+xml' && url.length >= RAPIER_NOTES_THUMB_MIN) { _rapierNotesThumbFor(img, url, text, id || direct); return; }
	images.present(text, id || direct).then(shown => { if (img.isConnected && shown && shown.url) _rapierNotesCardShow(img, shown.url); }, () => {});
}
function _rapierNotesCardShow(img, url) { if (img.src !== url) img.src = url; img.setAttribute('data-rapier-asset-state', 'ready'); }
function _rapierNotesThumbFor(img, src, text, ref) {
	const state = _rapierNotes;
	if (!/^data:image\/(?:png|jpeg|webp|jxl|gif)/i.test(src) || src.length < RAPIER_NOTES_THUMB_MIN) return;
	const width = _rapierNotesThumbWidth(), key = _rapierNotesThumbKey(src, width); img.dataset.notesThumb = key;
	const have = state.thumbs.get(key);
	if (have) { _rapierNotesCardShow(img, have); return; }
	if (!state.thumbQueue.some(q => q.key === key)) state.thumbQueue.push({ key, src, text, ref, width });
	_rapierNotesThumbPump();
}
function _rapierNotesThumbShow(key, url) {
	_rapierNotes.thumbs.set(key, url);
	for (const img of document.querySelectorAll('.rapier-notes-card img[data-notes-thumb="' + key + '"]')) _rapierNotesCardShow(img, url);
}
async function _rapierNotesThumbNames() {
	const state = _rapierNotes;
	if (!state.thumbNames) { try { state.thumbNames = new Set(await _rapierNotesStore.thumbNames()); } catch (_) { state.thumbNames = new Set(); } }
	return state.thumbNames;
}
function _rapierNotesThumbPump() {
	const state = _rapierNotes;
	if (state.thumbBusy || !state.thumbQueue.length) return;
	state.thumbBusy = true;
	const job = state.thumbQueue.shift();
	(async () => {
		try {
			const names = await _rapierNotesThumbNames(), kept = [...names].find(n => n.startsWith(job.key + '.'));
			let blob = kept ? await _rapierNotesStore.readThumb(kept) : null;
			if (!blob) {
				const made = await _rapierNotesThumbMake(job);
				if (made?.blob) { blob = made.blob; const name = job.key + (blob.type === 'image/jxl' ? '.jxl' : '.webp'); try { await _rapierNotesStore.writeThumb(name, blob); names.add(name); } catch (_) {} }
				else if (made?.url) _rapierNotesThumbShow(job.key, made.url);
			}
			if (blob) _rapierNotesThumbShow(job.key, URL.createObjectURL(blob));
		} catch (error) { console.warn('[rapier] notes thumbnail', error); }
		finally { state.thumbBusy = false; if (state.thumbQueue.length) setTimeout(_rapierNotesThumbPump, 0); }
	})();
}
async function _rapierNotesThumbMake(job) {
	let src = job.src;
	if (job.ref) {
		const images = globalThis.RapierEmbeddedImages;
		if (!images || typeof images.present !== 'function') return null;
		const shown = await images.present(job.text, job.ref);
		if (!shown || !shown.url) return null;
		if (shown.undisplayable || shown.damaged) return { url: shown.url };
		src = shown.url;
	}
	const image = new Image();
	await new Promise((ok, no) => { image.onload = ok; image.onerror = () => no(new Error('the picture could not be decoded here')); image.src = src; });
	const w = image.naturalWidth, h = image.naturalHeight; if (!(w > 0 && h > 0)) return null;
	const scale = Math.min(1, (job.width || 320) / w), tw = Math.max(1, Math.round(w * scale)), th = Math.max(1, Math.round(h * scale));
	const canvas = document.createElement('canvas'); canvas.width = tw; canvas.height = th;
	const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(image, 0, 0, tw, th);
	const images = globalThis.RapierEmbeddedImages;
	if (images && typeof images.jxlDisplayable === 'function' && images.jxlDisplayable() && typeof images.codec === 'function') {
		try {
			const rgba = ctx.getImageData(0, 0, tw, th);
			const encoded = await images.codec('encode', { width: tw, height: th, data: rgba.data, options: { quality: 72, effort: 3 } });
			if (encoded?.bytes) return { blob: new Blob([encoded.bytes], { type: 'image/jxl' }) };
		} catch (error) { console.warn('[rapier] notes thumbnail: JPEG XL not made here, WebP instead', error); }
	}
	return new Promise(ok => canvas.toBlob(b => ok(b ? { blob: b } : null), 'image/webp', 0.82));
}
function _rapierNotesRepackSoon() {
	const state = _rapierNotes;
	if (state.repack || !state.open) return;
	state.repack = requestAnimationFrame(() => { state.repack = 0; if (state.drag) { state.renderAfterDrag = true; return; } for (const grid of Object.values(state.grids)) _rapierNotesPack(grid); });
}
function _rapierNotesWindowModel() { return globalThis.RapierNotesLibraryWindow; }
const RAPIER_NOTES_WINDOW_ROUNDS = 64;
function _rapierNotesWindowItems(files) {
	const notes = _rapierNotes.index?.notes || {};
	return files.map(file => ({key: file, revision: 'm' + (Number(notes[file]?.modified) || 0)}));
}
function _rapierNotesGridViewport(grid) {
	const scroll = _rapierNotes.scroll;
	const gridTop = grid.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
	return {top: Math.max(0, scroll.scrollTop - gridTop), viewportHeight: Math.max(1, scroll.clientHeight)};
}
function _rapierNotesWindowStart(grid, id, files) {
	const L = _rapierNotesWindowModel(), state = _rapierNotes;
	const cols = Math.max(1, Number(getComputedStyle(state.surface).getPropertyValue('--notes-cols')) || 2);
	const gap = 8, width = grid.clientWidth;
	if (!L || !(width > gap * (cols - 1))) { delete state.windows[id]; return null; }
	grid.style.setProperty('--notes-card-w', (width - gap * (cols - 1)) / cols + 'px');
	const epoch = (state.windows[id]?.epoch || 0) + 1;
	const masonry = L.createMasonry({items: _rapierNotesWindowItems(files), width, columns: cols, gap, context: id + '@' + cols + 'x' + width, epoch});
	return (state.windows[id] = {epoch, masonry, files});
}
function _rapierNotesPlaceCard(card, row) {
	const land = _rapierNotes.landing;
	if (card.dataset.notesDragging) card.dataset.notesHome = row.x + ',' + row.y;
	else if (land && land.file === card.dataset.notesFile && performance.now() - land.at < 2000 && card.parentElement) {
		_rapierNotes.landing = null;
		const gr = card.parentElement.getBoundingClientRect();
		card.style.transition = 'none';
		card.style.setProperty('--x', Math.round(land.x - gr.left) + 'px'); card.style.setProperty('--y', Math.round(land.y - gr.top) + 'px');
		void card.offsetWidth;
		card.style.transition = '';
		card.style.setProperty('--x', row.x + 'px'); card.style.setProperty('--y', row.y + 'px');
		card.dataset.notesSettling = '1';
		setTimeout(() => { delete card.dataset.notesSettling; }, (_rapierNotesSpring() ? RAPIER_NOTES_SPRING_MS : 200) + 20);
	}
	else { card.style.setProperty('--x', row.x + 'px'); card.style.setProperty('--y', row.y + 'px'); }
	card.dataset.notesSlot = String(row.column); card.dataset.notesBox = row.x + ',' + row.y + ',' + Math.round(row.width) + ',' + row.height;
}
function _rapierNotesWindowCommit(grid, win, cards, items) {
	const L = _rapierNotesWindowModel(), m = win.masonry;
	const bodies = cards.map(card => card.querySelector('.rapier-notes-card-body'));
	const clamp = bodies.map(body => !!body && body.scrollHeight > body.clientHeight + 1);
	const heights = cards.map(card => card.offsetHeight);
	if (heights.some(h => !(h > 0))) { for (const card of cards) card.remove(); return false; }
	bodies.forEach((body, i) => { if (body) body.classList.toggle('rapier-notes-card-body--clamped', clamp[i]); });
	win.masonry = L.commitMasonry(m, items.map((item, i) => ({key: item.key, revision: item.revision, epoch: m.epoch, context: m.context, width: m.columnWidth, settled: true, height: heights[i]})));
	const rows = L.masonryRows(win.masonry), from = rows.length - cards.length;
	cards.forEach((card, i) => {
		_rapierNotesPlaceCard(card, rows[from + i]);
		card.setAttribute('aria-posinset', String(from + i + 1));
		card.setAttribute('aria-setsize', String(win.files.length));
	});
	for (const card of cards) if (card._rapierNotesInk) _rapierNotesCardInk(card);
	return true;
}
async function _rapierNotesWindowFill(grid, id, keyboard = null) {
	const L = _rapierNotesWindowModel(), state = _rapierNotes, win = state.windows[id]; if (!win || !L) return;
	if (keyboard) win.keyboard = keyboard;
	if (win.filling) { win.again = true; return; }
	win.filling = true;
	try {
		do {
			win.again = false;
			const view = _rapierNotesGridViewport(grid), batch = Math.min(32, win.masonry.columns * 8), made = [];
			for (let round = 0; round < RAPIER_NOTES_WINDOW_ROUNDS; round++) {
				const geometry = win.masonry, wanted = win.keyboard ? win.files.indexOf(win.keyboard.file) : -1;
				const top = wanted >= geometry.next ? Math.max(view.top, geometry.extent) : view.top;
				const plan = L.planMasonry(geometry, {top, viewportHeight: view.viewportHeight, batch});
				if (!plan.derive.length) break;
				const keys = plan.derive.map(item => item.key);
				for (const key of keys) state.reads.deriving.add(key);
				await _rapierNotesWindowTexts(keys);
				const gone = state.windows[id] !== win || state.drag || !state.open;
				const stale = !gone && win.masonry !== geometry;
				const cards = gone || stale ? null : plan.derive.map(item => { const card = _rapierNotesCard(item.key); card.style.transition = 'none'; grid.appendChild(card); return card; });
				for (const key of keys) state.reads.deriving.delete(key);
				if (gone) return;
				if (stale) continue;
				if (!_rapierNotesWindowCommit(grid, win, cards, plan.derive)) break;
				made.push(...cards);
				grid.style.height = Math.max(0, win.masonry.extent) + 'px';
			}
			grid.style.height = Math.max(0, win.masonry.extent) + 'px';
			if (made.length) requestAnimationFrame(() => { for (const card of made) card.style.transition = ''; });
		} while (win.again && state.windows[id] === win);
		if (win.keyboard && state.windows[id] === win) {
			const intent = win.keyboard;
			const target = [...grid.querySelectorAll('.rapier-notes-card')].find(card => card.dataset.notesFile === intent.file);
			delete win.keyboard;
			const current = document.activeElement === intent.from || intent.restore && !intent.from.isConnected && document.activeElement === document.body;
			if (target && state.open && current) {
				const control = intent.restore && intent.control >= 0 ? _rapierModalFocusables(target)[intent.control] : null;
				(control || target).focus({preventScroll: true});
				if (!intent.restore) target.scrollIntoView({block: 'nearest'});
			}
		}
	} finally { win.filling = false; }
}
function _rapierNotesWindowScrolled() {
	const state = _rapierNotes; if (!state.open || state.drag || !state.index) return;
	for (const [id, grid] of Object.entries(state.grids)) {
		const win = state.windows[id];
		if (!win || win.masonry.next === win.masonry.items.length || grid.parentElement.hidden) continue;
		void _rapierNotesWindowFill(grid, id);
	}
}
function _rapierNotesPack(grid) {
	_rapierNotesScrollQuiet();
	const L = _rapierNotesWindowModel(), state = _rapierNotes, id = grid.parentElement?.dataset.notesSection;
	if (grid.parentElement?.hidden) return;
	const cards = [...grid.children].filter(c => c.classList.contains('rapier-notes-card'));
	if (!cards.length) { grid.style.height = ''; return; }
	const win = id ? state.windows[id] : null; if (!win || !L) return;
	const shown = cards.map(c => c.dataset.notesFile), seen = new Set(shown), m = win.masonry;
	win.epoch++;
	win.masonry = L.createMasonry({items: _rapierNotesWindowItems([...shown, ...win.files.filter(f => !seen.has(f))]), width: m.width, columns: m.columns, gap: m.gap, context: m.context, epoch: win.epoch});
	for (let i = 0; i < cards.length; i += 32) {
		const batch = cards.slice(i, i + 32);
		if (!_rapierNotesWindowCommit(grid, win, batch, win.masonry.items.slice(i, i + batch.length))) return;
	}
	grid.style.height = Math.max(0, win.masonry.extent) + 'px';
}
function _rapierNotesRender() {
	_rapierNotesScrollQuiet();
	const state = _rapierNotes, M = _rapierNotesModel();
	if (!state.surface || !state.index) return;
	if (!state.open) return;
	if (state.drag || state.dropping) { state.renderAfterDrag = true; return; }
	const skills = _rapierNotesSkillsWanted(), ids = _rapierNotesSectionIds();
	const active = document.activeElement, card = active?.closest?.('.rapier-notes-card');
	let keyboard = null;
	if (card && state.scroll.contains(card)) {
		const candidates = [card.dataset.notesFile, card.nextElementSibling?.dataset.notesFile, card.previousElementSibling?.dataset.notesFile];
		const file = candidates.find(file => {
			const entry = file && state.index.notes[file], id = entry && M.sectionOf(entry, state.index.sections);
			return entry && !entry.trashed && ids.includes(id) && (id !== 'skills' || skills) && !_rapierNotesClosed(id) && !state.reorder && _rapierNotesMatches(file);
		});
		if (file) keyboard = {file, from: active, restore: true, control: file === card.dataset.notesFile ? _rapierModalFocusables(card).indexOf(active) : -1};
	}
	let matches = 0, othersEmpty = false;
	for (const id of ids) state.scroll.appendChild(_rapierNotesSectionEl(id));
	if (state.scrollRoom) state.scroll.appendChild(state.scrollRoom);
	for (const [id, grid] of Object.entries(state.grids)) if (!ids.includes(id)) { grid.parentElement.remove(); delete state.grids[id]; }
	for (const id of ids) {
		const grid = state.grids[id], section = grid.parentElement, head = section.querySelector('.rapier-notes-section-head');
		const word = head.querySelector('.rapier-notes-section-word'); word.textContent = word.dataset.word = RAPIER_NOTES_SECTION_WORDS[id] || id;
		const files = _rapierNotesSorted((typeof _rapierNotesLibrarySortedSection === 'function' ? _rapierNotesLibrarySortedSection(id) : M.sortedSection(state.index, id))).filter(_rapierNotesMatches);
		if (id === 'others') othersEmpty = !files.length;
		const own = !(id in RAPIER_NOTES_SECTION_WORDS);
		const wanted = id === 'skills' ? skills : id === 'archive' ? files.length > 0 : true;
		section.hidden = !wanted || (!files.length && (id === 'pinned' || (own && !!state.query)));
		head.classList.toggle('rapier-notes-section-head--fixed', state.reorder && !_rapierNotesReorderMovable(id));
		if (section.hidden) { grid.replaceChildren(); delete state.windows[id]; continue; }
		matches += files.length;
		const closed = _rapierNotesClosed(id) || (state.reorder === true && id === 'pinned');
		section.classList.toggle('rapier-notes-section--closed', closed);
		if (head.tagName === 'BUTTON') head.setAttribute('aria-expanded', String(!closed));
		grid.replaceChildren();
		if (!files.length) {
			const empty = _rapierNotesEl('div', 'rapier-notes-empty', id === 'skills' ? 'A note your agent can fetch. Write one here.' : id === 'others' ? (state.query ? (state.reading && !state.reading.complete ? 'Reading notes, ' + state.reading.done + ' of ' + state.reading.total + '.' : (typeof _rapierNotesLibraryNotice === 'function' && _rapierNotesLibraryNotice() && _rapierNotesLibraryNotice().stage !== 'complete') ? _rapierNotesLibraryNotice().message : (typeof _rapierNotesLibraryPartial === 'function' && _rapierNotesLibraryPartial()) ? (_rapierNotesLibraryPartial().unread ? 'Some notes unsearched. Open Notes again.' : 'Searching, ' + _rapierNotesLibraryPartial().done + ' of ' + _rapierNotesLibraryPartial().total + '.') : 'Nothing matches.') : 'Press + to add a note.') : own ? 'No notes yet.' : '');
			grid.appendChild(empty); grid.style.height = ''; delete state.windows[id]; continue;
		}
		if (closed) { delete state.windows[id]; continue; }
		if (_rapierNotesWindowStart(grid, id, files)) void _rapierNotesWindowFill(grid, id, keyboard && files.includes(keyboard.file) ? keyboard : null);
	}
	const othersSection = state.grids.others?.parentElement;
	if (othersSection) {
		if (state.query && matches && othersEmpty && !(state.reading && !state.reading.complete) &&
				!(typeof _rapierNotesLibraryPartial === 'function' && _rapierNotesLibraryPartial())) {
			const notice = typeof _rapierNotesLibraryNotice === 'function' ? _rapierNotesLibraryNotice() : null;
			if (!notice || notice.stage === 'complete') othersSection.hidden = true;
		}
		const alone = !ids.some(id => id !== 'others' && id !== 'skills' && !state.grids[id]?.parentElement?.hidden);
		const othersHead = othersSection.querySelector('.rapier-notes-section-head');
		if (othersHead) othersHead.hidden = alone && !state.reorder;
	}
	if (typeof _rapierNotesLibraryChips === 'function') _rapierNotesLibraryChips();
	if (typeof _rapierNotesLibraryBarPaint === 'function') _rapierNotesLibraryBarPaint();
	_rapierNotesReorderBarPaint();
	_rapierNotesBarRoom();
	_rapierNotesFabTrack();
	if (state.query) {
		const partial = _rapierNotesLibraryPartial();
		const reading = state.reading && !state.reading.complete;
		const notice = typeof _rapierNotesLibraryNotice === 'function' ? _rapierNotesLibraryNotice() : null;
		_rapierNotesStatus(matches + (matches === 1 ? ' matching note.' : ' matching notes.') +
			(reading ? ' Still reading notes.'
				: notice ? ' ' + notice.message
				: partial ? (partial.unread ? ' Some notes could not be searched.' : ' Still searching notes.') : ''));
	} else _rapierNotesStatus('');
	if (card && !keyboard && !active.isConnected && document.activeElement === document.body) state.surface.focus({preventScroll: true});
}
function _rapierNotesStatus(message) {
	const region = _rapierNotes.surface.querySelector('#rapier-notes-status');
	if (region.textContent !== message) region.textContent = message;
}
const RAPIER_NOTES_SORT_WORDS = {custom: 'hand', created: 'date created', modified: 'date modified'};
function _rapierNotesSorted(files) {
	const state = _rapierNotes, M = _rapierNotesModel(), sort = RapierPreferences.read('notesSort');
	if (typeof _rapierNotesLibraryRanked === 'function' && typeof _rapierNotesLibraryWordy === 'function' && _rapierNotesLibraryWordy()) return _rapierNotesLibraryRanked(files);
	if (sort === 'created' || sort === 'modified') {
		const stamp = f => Number(state.index.notes[f]?.[sort]) || 0;
		return files.slice().sort((a, b) => stamp(b) - stamp(a));
	}
	if (sort === 'remind') {
		const now = Date.now();
		const due = f => {
			const entry = state.index.notes[f];
			if (!entry?.remind || typeof M.nextReminderAt !== 'function') return null;
			try { const at = M.nextReminderAt(entry, now); return Number.isFinite(at) ? at : null; } catch (_) { return null; }
		};
		const order = new Map(files.map((f, i) => [f, i]));
		return files.slice().sort((a, b) => {
			const x = due(a), y = due(b);
			if (x == null && y == null) return order.get(a) - order.get(b);
			if (x == null) return 1;
			if (y == null) return -1;
			return x - y || order.get(a) - order.get(b);
		});
	}
	return files;
}

const RAPIER_NOTES_HEAD_BTNS = ['btn-notes-plus', 'btn-notes-remind', 'btn-notes-pin', 'btn-notes-kebab'];
function _rapierNotesMode(on) {
	const state = _rapierNotes;
	state.mode = !!on;
	if (!on) globalThis.RapierAgentBrowser?.notesDocumentClosed?.();
	if (!on && typeof _rapierRecorderClosePlayers === 'function') _rapierRecorderClosePlayers(); if (typeof _rapierAttachmentsClose === 'function') _rapierAttachmentsClose();
	document.body.classList.toggle('rapier-notes-mode', !!on);
	const back = document.getElementById('btn-notes-back'); if (back) back.hidden = !state.current;
	if (on) _rapierNotesMarkupGlyphs();
	for (const id of RAPIER_NOTES_HEAD_BTNS) { const el = document.getElementById(id); if (el) el.hidden = !on || (id === 'btn-notes-remind' && !_rapierNotesIsApp()); }
	_rapierNotesPicAttach(!!on);
	_rapierNotesHeadAttach(!!on);
	_rapierNotesHeadPaint();
}
function _rapierNotesHeadPaint() {
	const state = _rapierNotes, entry = state.current ? state.index?.notes[state.current] : null;
	state.surface?.classList.toggle('rapier-notes-surface--remind', state.sheetMode === 'remind' && !!state.sheet?.classList.contains('rapier-notes-sheet--open'));
	const wear = (el, on) => { if (!el) return; if (on) el.dataset.active = 'true'; else delete el.dataset.active; };
	const bar = document.querySelector('.top-bar');
	if (bar) {
		const colour = state.mode && state.current && !state.open && entry?.colour ? entry.colour : '';
		for (const name of Array.from(bar.classList)) if (name.startsWith('rapier-notes-tint-')) bar.classList.remove(name);
		if (colour) bar.classList.add('rapier-notes-tint-' + colour);
		bar.classList.toggle('top-bar--notes-colour', !!colour);
	}
	_rapierNotesGroundPaint();
	const pin = document.getElementById('btn-notes-pin');
	if (pin) {
		const on = !!entry?.pinned;
		wear(pin, on); pin.setAttribute('aria-pressed', String(on));
		pin.setAttribute('aria-label', on ? 'unpin note' : 'pin note'); pin.dataset.tip = on ? 'unpin' : 'pin';
	}
	const remind = document.getElementById('btn-notes-remind');
	wear(remind, !!entry?.remind);
	if (remind) {
		const up = !!(state.compose && state.sheetMode === 'remind' && state.sheet?.classList.contains('rapier-notes-sheet--open'));
		if (up) remind.dataset.notesFilled = 'true'; else delete remind.dataset.notesFilled;
		remind.setAttribute('aria-expanded', String(up));
		remind.setAttribute('aria-label', entry?.remind ? 'Reminder: ' + _rapierNotesModel().remindWords(entry.remind, Date.now()) : 'Set reminder');
	}
}
const RAPIER_NOTES_WASH_MS = 320;
function _rapierNotesGroundPaint() {
	const state = _rapierNotes, entry = state.current ? state.index?.notes[state.current] : null;
	const colour = state.mode && state.current && entry?.colour && _rapierNotesColourMode() === 'page' ? entry.colour : '';
	const old = state.groundEl?.isConnected ? state.groundEl : null;
	if (colour === (old?.dataset.notesGround || '')) return;
	const blocks = document.getElementById('editor-blocks');
	if (blocks) {
		for (const name of Array.from(blocks.classList)) if (name.startsWith('rapier-notes-tint-')) blocks.classList.remove(name);
		if (colour) blocks.classList.add('rapier-notes-tint-' + colour);
	}
	let ground = null;
	if (colour) {
		ground = _rapierNotesEl('div', 'rapier-notes-ground rapier-notes-tint-' + colour);
		ground.dataset.notesGround = colour; ground.setAttribute('aria-hidden', 'true');
		if (old) old.before(ground); else document.body.appendChild(ground);
	}
	state.groundEl = ground;
	const paged = () => document.body.classList.toggle('rapier-notes-paged', !!state.groundEl || !!document.querySelector('.rapier-notes-ground'));
	paged();
	const seen = !state.open && !state.liftOpen && !state.liftBack && !_rapierNotesStill();
	if (!seen) { old?.remove(); paged(); return; }
	if (!old) { ground?.animate([{opacity: 0}, {opacity: 1}], {duration: RAPIER_NOTES_WASH_MS, easing: 'linear'}); return; }
	const wash = old.animate([{opacity: Number(getComputedStyle(old).opacity)}, {opacity: 0}], {duration: RAPIER_NOTES_WASH_MS, easing: 'linear', fill: 'forwards'});
	const gone = () => { old.remove(); paged(); };
	wash.finished.then(gone, gone);
}
async function _rapierNotesHeadAct(act) {
	const state = _rapierNotes, file = state.current;
	if (!file || !state.index?.notes[file]) return;
	state.selected.clear(); state.selected.add(file);
	await _rapierNotesAct(act);
	state.selected.clear();
	_rapierNotesHeadPaint();
}
function _rapierNotesNoteSheet(mode) {
	const state = _rapierNotes, file = state.current;
	if (!file || !state.index?.notes[file]) return;
	if (mode === 'remind' && !_rapierNotesIsApp()) return;
	_rapierNotesEnsure();
	state.compose = true;
	state.surface.classList.add('rapier-notes-surface--over');
	state.surface.classList.remove('rapier-notes-surface--in');
	state.surface.hidden = false;
	if (!state.open) _rapierNotesFence(true);
	(state.sheetOpener = document.getElementById(mode === 'add' ? 'btn-notes-plus' : mode === 'remind' ? 'btn-notes-remind' : 'btn-notes-kebab'))?.setAttribute('aria-expanded', 'true');
	state.selected.clear(); state.selected.add(file);
	state.sheetMode = mode || 'actions';
	state.sheetFocus = true;
	_rapierNotesOpenSheet();
}
function _rapierNotesFindInNote() {
	const btn = document.getElementById('btn-find'); if (!btn) return;
	if (btn.getAttribute('aria-expanded') === 'true') return;
	btn.click();
}

const _rapierNotesFields = (() => {
	const targets = new WeakMap(), records = new WeakMap(), native = new WeakMap();
	let seating = false, cachedHead = null;
	function layout() {
		if (!_rapierNotesHeadOn()) return null;
		if (!_rapierNotesDocumentBound()) return {invalid: true};
		const blocks = rapier.document.blocks, root = rapier.document.source?.rootId;
		const slot = _rapierNotes.head.slot;
		if (!cachedHead || root == null || cachedHead.root !== root || cachedHead.blocks !== blocks || cachedHead.count !== blocks.length || cachedHead.slot !== slot) {
			cachedHead = {root, blocks, count: blocks.length, slot, head: _rapierNotesModel()?.noteHead(blocks.map(b => String(b.raw || '')))};
		}
		const head = cachedHead.head;
		if (!head) return {invalid: true};
		let title = head.title;
		if (title < 0 && _rapierNotes.head.slot != null) {
			const slot = blocks.findIndex(b => b.id === _rapierNotes.head.slot);
			if (slot === head.at) title = slot;
		}
		return {blocks, title, proof: _rapierNotes.currentProof};
	}
	function at(id, state = layout()) {
		if (!state || state.invalid) return state;
		const index = state.blocks.findIndex(b => b.id === Number(id));
		if (index < 0) return {invalid: true};
		const titleId = state.title < 0 ? null : state.blocks[state.title].id;
		return {proof: state.proof, titleId, kind: index === state.title ? 'title' : 'body',
			side: state.title < 0 ? 'all' : index < state.title ? 'before' : index > state.title ? 'after' : 'title',
			first: index === state.title ? index : index < state.title || state.title < 0 ? 0 : state.title + 1,
			last: index === state.title ? index : index < state.title ? state.title - 1 : state.blocks.length - 1};
	}
	function same(a, b) {
		return !!a && !!b && !a.invalid && !b.invalid && a.proof.id === b.proof.id && a.proof.authority === b.proof.authority && a.proof.epoch === b.proof.epoch &&
			a.proof.folder === b.proof.folder && a.proof.bytes === b.proof.bytes &&
			a.titleId === b.titleId && a.kind === b.kind && a.side === b.side;
	}
	function admits(start, end, stamp = null) {
		const state = layout();
		if (!state) return !stamp;
		const a = at(start, state), b = at(end, state);
		return same(a, b) && (!stamp || same(a, stamp));
	}
	function selected(selection = window.getSelection()) {
		const state = layout();
		if (!state || state.invalid || !selection?.rangeCount) return state;
		const host = _editorHostEl(), range = selection.getRangeAt(0);
		if (!host || !_rangeIntersectsEditor(range)) return null;
		let wrapper = _blockWrapperOf(selection.anchorNode);
		if (!wrapper && selection.anchorNode === host) wrapper = _activeBlockEditContext()?.wrapper ||
			_wrapperFromHostBoundary(host, selection.anchorOffset, false);
		return wrapper ? at(Number(wrapper.dataset.blockId), state) : null;
	}
	function bounds(field) {
		if (!field || field.invalid) return null;
		const host = _editorHostEl(), blocks = rapier.document.blocks;
		const live = index => {
			const wrapper = host?.querySelector(':scope > .block-wrapper[data-block-id="' + blocks[index]?.id + '"]');
			const surface = wrapper ? _liveBlockEl(wrapper) : null;
			return field.kind === 'title' ? surface?.querySelector('h1') || surface : surface;
		};
		const first = live(field.first), last = live(field.last);
		if (!first || !last) return null;
		const range = document.createRange();
		range.selectNodeContents(first);
		range.setEnd(last, last.childNodes.length);
		return range;
	}
	function normalize(selection = window.getSelection(), whole = false) {
		if (seating || !selection?.rangeCount) return false;
		const field = selected(selection), limit = bounds(field);
		if (!limit) return false;
		const current = selection.getRangeAt(0), range = whole ? limit : current.cloneRange();
		let changed = whole;
		if (!whole) for (const edge of ['Start', 'End']) {
			const node = range[edge.toLowerCase() + 'Container'], offset = range[edge.toLowerCase() + 'Offset'];
			const where = limit.comparePoint(node, offset);
			if (where < 0) { range['set' + edge](limit.startContainer, limit.startOffset); changed = true; }
			if (where > 0) { range['set' + edge](limit.endContainer, limit.endOffset); changed = true; }
		}
		if (changed) {
			seating = true;
			try { _rapierInstallSelectionRange(selection, range, !whole && _rapierSelectionIsBackward(selection)); }
			finally { seating = false; }
		}
		return changed;
	}
	function nativeCrosses(event) {
		if (!layout() || typeof event.getTargetRanges !== 'function') return false;
		return Array.from(event.getTargetRanges()).some(range => {
			const start = _blockWrapperOf(range.startContainer) || _rangeBoundaryWrapper(range, false);
			const end = _blockWrapperOf(range.endContainer) || _rangeBoundaryWrapper(range, true);
			return !!(start || end) && !admits(Number(start?.dataset.blockId), Number(end?.dataset.blockId));
		});
	}
	function event(event) {
		if (event.defaultPrevented || _rapierHostNativeField(event.target)) return;
		if (/^history/.test(event.inputType || '')) return;
		const input = event.type === 'beforeinput' && /^(?:insert|delete)/.test(event.inputType || '');
		const crossed = input && nativeCrosses(event), changed = normalize();
		if (input && (crossed || changed) && !event.cancelable) {
			if (_rapierCaptureScopedNativeInput(event, selected())) { event.stopImmediatePropagation(); return; }
		}
		if (input && (crossed || changed) && event.cancelable) {
			// Target ranges are immutable browser snapshots. Changing Selection cannot license
			event.preventDefault(); event.stopImmediatePropagation();
			const range = window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0) : null;
			if (!range || !rangeAllowed(range) || _rapierUserMutationBlocked(false)) return;
			if (!event.isComposing && !rapier.composition.block && typeof event.data === 'string' && event.data && /^insert(?:Text|ReplacementText)$/.test(event.inputType)) {
				const record = _rapierCaptureStableTargetRecord(_rapierCurrentSelectionTarget());
				if (record) { void _rapierRunLargePaste(record, {plain: event.data}); return; }
			} else if (!event.isComposing && !rapier.composition.block && /^delete/.test(event.inputType) && !range.collapsed) {
				if (_rapierCrossBlockReplace(event.inputType, '') || _rapierApplyExactCut()) return;
			}
			_rapierNotesPending.keep({settle: false});
			showToast('The selection stops at the field boundary. Try the edit again.', 'info');
			return;
		}
		if (event.type === 'keydown' && (event.ctrlKey || event.metaKey) && !event.altKey && String(event.key).toLowerCase() === 'a') {
			if (normalize(window.getSelection(), true)) { event.preventDefault(); event.stopImmediatePropagation(); }
		}
	}

	function remember(target) {
		if (target?.kind === 'block-range') {
			const field = at(target.startBlockId);
			if (field) targets.set(target, admits(target.startBlockId, target.endBlockId, field) ? field : {invalid: true});
		}
		return target;
	}
	function capture(record, target) {
		if (record && targets.has(target)) records.set(record, targets.get(target));
		return record;
	}
	function current(record) {
		const field = records.get(record);
		return !field || admits(record.target.startBlockId, record.target.endBlockId, field);
	}
	async function titleText(payload, job) {
		let value = String(payload.plain || '') ? payload : {...payload, markdown: ''};
		if (!String(payload.plain || '') && !String(payload.html || '') && String(payload.markdown || '')) {
			value = {html: renderBlock(payload.markdown), plain: '', markdown: ''};
		}
		return String(await _rapierResolveLargeFlatPastePayload(value, job, {visible: true})).replace(/\r\n|[\r\n\u2028\u2029]/g, ' ');
	}
	function titleParts(range) {
		if (!range) return null;
		const wrapper = _blockWrapperOf(range.startContainer), live = wrapper ? _liveBlockEl(wrapper) : null;
		const root = live?.querySelector('h1') || live;
		if (!root || !_nodeInside(root, range.startContainer) || !_nodeInside(root, range.endContainer)) return null;
		const words = fragment => _textWithBrLineBreaks(fragment).replace(/\r\n|[\r\n\u2028\u2029]/g, ' ');
		return {version: 1, blockId: Number(wrapper.dataset.blockId),
			prefix: words(_cloneRangeTo(root, range.startContainer, range.startOffset)),
			suffix: words(_cloneRangeFrom(root, range.endContainer, range.endOffset))};
	}
	function titlePlanFromParts(context, parts, text, model = null, allowEmpty = false) {
		if (!context || context.replaceCount !== 1 || parts?.version !== 1 || parts.blockId !== context.startBlock?.id ||
			typeof parts.prefix !== 'string' || typeof parts.suffix !== 'string' || /[\r\n\u2028\u2029]/.test(parts.prefix + parts.suffix) || (!allowEmpty && String(text) === '')) return null;
		const literal = value => String(value).split('\u00a0').map(part => turndown.escape(part)).join('\u00a0')
			.replace(/(\\*)#/g, (_all, slashes) => (slashes.length % 2 ? slashes.slice(0, -1) : slashes) + '&#35;');
		const before = '# ' + literal(parts.prefix + text);
		const raw = '# ' + literal(parts.prefix + text + parts.suffix);
		const plan = _rapierBuildPastePlan({...context, prefixRaw: '', suffixRaw: ''}, [{raw, type: 'heading'}], model);
		if (plan?.blocks.length !== 1) return null;
		plan.caretRaw = before;
		plan.titleCaretOffset = parts.prefix.length + text.length;
		return plan;
	}
	function titlePlan(context, range, text) { return titlePlanFromParts(context, titleParts(range), text); }

	function rangeAllowed(range) {
		const start = _rangeBoundaryWrapper(range, false), end = _rangeBoundaryWrapper(range, true);
		return admits(Number(start?.dataset.blockId), Number(end?.dataset.blockId));
	}
	return {normalize, event, nativeCrosses, rangeAllowed, selected, admits, remember, capture, current, titleText, titlePlan, titleParts, titlePlanFromParts,
		stamp: record => records.get(record) || null,
		captureNative(context, range) { const field = at(context?.startBlock?.id); if (field) native.set(context, {field, range: range.cloneRange(), parts: field.kind === 'title' ? titleParts(range) : null}); },
		nativeStamp: input => native.get(input?.context)?.field || null,
		nativeRange: input => native.get(input?.context)?.range || null,
		nativeParts: input => native.get(input?.context)?.parts || null,
		pasteCurrent(stamp, context) {
			if (!stamp) return true;
			const blocks = rapier.document.blocks, first = blocks[context?.startIndex], last = blocks[context?.startIndex + context?.replaceCount - 1];
			return !!first && !!last && admits(first.id, last.id, stamp);
		},
		titleCommitted(plan) {
			if (_rapierNotesModel().noteHead(rapier.document.blocks.map(b => String(b.raw || ''))).title < 0) _rapierNotes.head.slot = plan.blocks[0].id;
		}};
})();
globalThis.RapierNotesFields = _rapierNotesFields;

function _rapierNotesHeadOn() {
	const state = _rapierNotes;
	return !!(state.mode && state.current && rapier.document.docKind === 'markdown' && rapier.view.mode !== 'source' && !rapier.compare.active);
}
function _rapierNotesHeadWords(block, editing) {
	const edit = editing && Number(editing.dataset.blockId) === block?.id ? editing.querySelector(':scope > .block-edit') : null;
	return edit ? !!(edit.textContent.trim() || edit.querySelector('img,svg,video,audio,iframe,table,hr,input')) : !!String(block?.raw || '').trim();
}
function _rapierNotesHeadRow(kind) {
	const row = _rapierNotesEl('button', 'rapier-notes-slot rapier-notes-slot--' + kind);
	row.type = 'button'; row.contentEditable = 'false'; row.dataset.notesSlot = kind;
	row.setAttribute('aria-label', kind === 'title' ? 'Title' : 'Note');
	for (const type of ['pointerdown', 'mousedown']) row.addEventListener(type, event => { if (type === 'mousedown') event.preventDefault(); event.stopPropagation(); });
	row.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); _rapierNotesHeadTap(kind); });
	return row;
}
function _rapierNotesHeadLay(host) {
	const H = _rapierNotes.head, M = _rapierNotesModel();
	let title = null, note = null, titleAt, noteAt;
	if (_rapierNotesHeadOn() && typeof M?.noteHead === 'function') {
		const blocks = rapier.document.blocks, editing = host.querySelector(':scope > .block-wrapper--editing');
		const wrapper = i => blocks[i] ? host.querySelector(':scope > .block-wrapper[data-block-id="' + blocks[i].id + '"]') : null;
		const head = M.noteHead(blocks.map(b => String(b.raw || '')));
		let at = head.title;
		if (at < 0 && H.slot != null) {
			const k = blocks.findIndex(b => b.id === H.slot), w = k >= 0 ? wrapper(k) : null;
			if (w && k === head.at && (!_rapierNotesHeadWords(blocks[k], editing) || w === editing)) at = k;
			else H.slot = null;
		}
		title = at >= 0 ? wrapper(at) : null;
		const writable = !rapier.access.readOnly, from = at >= 0 ? at + 1 : head.at;
		if (writable && at < 0) titleAt = wrapper(head.at);
		let bodyEmpty = writable;
		for (let k = from; k < blocks.length && bodyEmpty; k++) bodyEmpty = !_rapierNotesHeadWords(blocks[k], editing);
		if (bodyEmpty) {
			if (from >= blocks.length) noteAt = null;
			else if (!String(blocks[from].raw || '').trim()) note = wrapper(from);
		}
	}
	for (const w of host.querySelectorAll(':scope > .rapier-notes-title, :scope > .rapier-notes-note')) { if (w !== title) w.classList.remove('rapier-notes-title'); if (w !== note) w.classList.remove('rapier-notes-note'); }
	title?.classList.add('rapier-notes-title'); note?.classList.add('rapier-notes-note');
	if (titleAt === undefined && noteAt === undefined) { for (const row of H.rows || []) row.remove(); return; }
	H.rows ||= [_rapierNotesHeadRow('title'), _rapierNotesHeadRow('note')];
	const next = row => { let el = row.nextElementSibling; while (el && !el.classList.contains('block-wrapper')) el = el.nextElementSibling; return el; };
	const [titleRow, noteRow] = H.rows;
	for (const [row, at] of [[titleRow, titleAt], [noteRow, noteAt]]) {
		if (at === undefined) { row.remove(); continue; }
		const placed = row.parentNode === host && next(row) === at && (row !== noteRow || titleAt !== noteAt || noteRow.previousElementSibling === titleRow);
		if (!placed) host.insertBefore(row, at);
	}
}
function _rapierNotesHeadScan() {
	const H = _rapierNotes.head, host = document.getElementById('editor-blocks'); if (!host) return;
	H.observer?.disconnect();
	try { _rapierNotesHeadLay(host); }
	finally { if (H.observer && _rapierNotes.mode) H.observer.observe(host, {childList: true, subtree: true}); }
}
function _rapierNotesHeadSoon() {
	const H = _rapierNotes.head;
	if (H.scheduled) return;
	H.scheduled = true;
	requestAnimationFrame(() => { H.scheduled = false; try { _rapierNotesHeadScan(); } catch (error) { console.warn('[rapier] notes', error); } });
}
function _rapierNotesHeadTap(kind) {
	const H = _rapierNotes.head, M = _rapierNotesModel();
	if (!_rapierNotesHeadOn() || rapier.access.readOnly) return;
	if (_rapierUserMutationBlocked(false)) {
		const editing = rapier.composition.block && !H.retap ? document.querySelector('#editor-blocks > .block-wrapper--editing .block-edit') : null;
		if (!editing) { _rapierUserMutationBlocked(); return; }
		H.retap = true;
		try { editing.blur(); } catch (_) {}
		if (rapier.composition.block) _rapierHandleEditCompositionEnd(editing);
		_rapierNotesHeadTurn();
		_rapierCheckpointEdit(editing);
		setTimeout(() => { H.retap = false; if (_rapierNotesHeadOn() && !_rapierUserMutationBlocked(false)) _rapierNotesHeadTap(kind); else _rapierUserMutationBlocked(); }, 0);
		return;
	}
	const typing = document.querySelector('#editor-blocks > .block-wrapper--editing .block-edit');
	if (typing) _rapierCheckpointEdit(typing);
	const blocks = rapier.document.blocks, head = M.noteHead(blocks.map(b => String(b.raw || '')));
	if (rapier.view.mode !== 'edit') rapierSetMode('edit', {announce: false});
	const before = kind === 'title' ? blocks[head.at] : null;
	const id = _insertBlockAfter(null, '', before ? {before: before.id, immediateFocus: true} : {immediateFocus: true});
	const block = id == null ? null : rapier.document.blocks.find(b => b.id === id);
	if (!block) return;
	block.dirty = true; H.fresh = id;
	if (kind === 'title') H.slot = id;
	_rapierNotesHeadScan();
}
function _rapierNotesSheetTap(x, y, press, near) {
	if (!press || press.toolsOpen || !_rapierNotesHeadOn() || rapier.access.readOnly || rapier.view.mode === 'source') return false;
	const host = document.getElementById('editor-blocks');
	if (!host) return false;
	const dx = x - press.x, dy = y - press.y;
	if (dx * dx + dy * dy > 25 || Math.abs(host.scrollTop - press.scrollTop) > 1) return false;
	const live = window.getSelection && window.getSelection();
	if (live && !live.isCollapsed && live.rangeCount && _rangeIntersectsEditor(live.getRangeAt(0))) return false;
	const last = _rapierShownWrappers(host).at(-1), title = host.querySelector(':scope > .block-wrapper.rapier-notes-title');
	if (!last) return false;
	if (title && y <= title.getBoundingClientRect().bottom) return false;
	if (near && near !== title && y <= last.getBoundingClientRect().bottom) return false;
	if (_rapierUserMutationBlocked(false)) {
		const editing = rapier.composition.block ? host.querySelector(':scope > .block-wrapper--editing > .block-edit') : null;
		if (!editing) { _rapierUserMutationBlocked(); return true; }
		try { editing.blur(); } catch (_) {}
		if (rapier.composition.block) _rapierHandleEditCompositionEnd(editing);
		_rapierNotesHeadTurn();
		_rapierCheckpointEdit(editing);
		setTimeout(() => { if (_rapierNotesHeadOn() && !_rapierUserMutationBlocked()) _rapierNotesBodyEnd(host); }, 0);
		return true;
	}
	return _rapierNotesBodyEnd(host);
}
function _rapierNotesBodyEnd(host) {
	const empty = host.querySelector(':scope > .block-wrapper.rapier-notes-note'), emptyBlock = empty && _rapierBoundBlock(empty);
	if (emptyBlock) return !!enterBlockEdit(emptyBlock, empty, {charOffset: 0, preserveScroll: true});
	if (host.querySelector(':scope > [data-notes-slot="note"]')) { _rapierNotesHeadTap('note'); return true; }
	const last = _rapierShownWrappers(host).at(-1), block = last && _rapierBoundBlock(last);
	if (!block || last.classList.contains('rapier-notes-title')) return false;
	if (_rapierBlockHoldsWords(block) && !_rapierLoneControlBlock(block)) return !!enterBlockEdit(block, last, {charOffset: Infinity, preserveScroll: true});
	return _rapierMakeEdgeParagraph(block, true);
}
function _rapierNotesHeadStart() {
	const H = _rapierNotes.head, block = rapier.document.blocks.length === 1 ? rapier.document.blocks[0] : null;
	if (!block || String(block.raw || '').trim()) return;
	block.dirty = true; H.slot = H.fresh = block.id;
	_rapierNotesHeadScan();
}
function _rapierNotesHeadClaim(id) {
	const H = _rapierNotes.head, M = _rapierNotesModel();
	if (!_rapierNotesHeadOn() || typeof M?.noteHead !== 'function') return false;
	const blocks = rapier.document.blocks, k = blocks.findIndex(b => b.id === id);
	if (k < 0 || String(blocks[k].raw || '').trim()) return false;
	const head = M.noteHead(blocks.map(b => String(b.raw || '')));
	if (head.title >= 0 || head.at !== k) return false;
	blocks[k].dirty = true; H.slot = H.fresh = id;
	_rapierNotesHeadScan();
	return true;
}
function _rapierNotesHeadTurn() {
	const H = _rapierNotes.head, host = document.getElementById('editor-blocks');
	if (!host || !_rapierNotesHeadOn() || rapier.composition.block) return;
	const wrapper = host.querySelector(':scope > .block-wrapper--editing.rapier-notes-title');
	const block = wrapper ? _rapierBoundBlock(wrapper) : null, edit = wrapper?.querySelector(':scope > .block-edit');
	if (!block || !edit) return;
	const heading = !!edit.querySelector('h1'), words = !!edit.textContent.trim();
	if (!heading && words && block.id === H.slot) { if (rapierFmt('h1') !== false) H.slot = null; }
	else if (heading && !words && rapierFmt('p') !== false) { const kept = rapier.document.blocks.find(b => b.id === block.id); if (kept) { kept.dirty = true; H.slot = H.fresh = kept.id; } }
}
function _rapierNotesBodyStart(host) {
	const blocks = rapier.document.blocks, head = _rapierNotesModel()?.noteHead(blocks.map(b => String(b.raw || '')));
	if (!host || !head || head.title < 0) return false;
	const body = blocks[head.title + 1];
	if (!body) { _rapierNotesHeadTap('note'); return true; }
	return !!_enterBlockEditAtOffset(body.id, 0);
}
function _rapierNotesHeadEnter(event) {
	const H = _rapierNotes.head;
	if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
	if (event.type === 'keydown' ? event.key !== 'Enter' : event.inputType !== 'insertParagraph') return;
	if (!_rapierNotesHeadOn() || rapier.composition.block || rapier.access.readOnly) return;
	const host = document.getElementById('editor-blocks');
	const wrapper = host?.querySelector(':scope > .block-wrapper--editing.rapier-notes-title');
	const block = wrapper ? _rapierBoundBlock(wrapper) : null, edit = wrapper?.querySelector(':scope > .block-edit');
	if (!block || !edit) return;
	if (edit.querySelector('h1')) {
		const head = _rapierNotesModel()?.noteHead(rapier.document.blocks.map(b => String(b.raw || '')));
		const selection = window.getSelection?.(), range = selection?.rangeCount ? selection.getRangeAt(0) : null;
		if (!_rapierNotesDocumentBound() || head?.title == null || head.title < 0 || rapier.document.blocks[head.title] !== block ||
			!range || !_nodeInside(edit, range.startContainer) || !_nodeInside(edit, range.endContainer)) return;
		const proof = _rapierNotes.currentProof;
		event.preventDefault();
		_rapierCheckpointEdit(edit);
		if (_rapierNotes.currentProof === proof && _rapierNotesDocumentBound()) _rapierNotesBodyStart(host);
		return;
	}
	if (H.slot == null || block.id !== H.slot) return;
	if (edit.textContent.trim()) {
		const proof = _rapierNotes.currentProof;
		event.preventDefault();
		if (rapierFmt('h1') !== false) {
			H.slot = null;
			if (_rapierNotes.currentProof === proof && _rapierNotesDocumentBound()) _rapierNotesBodyStart(host);
		}
		return;
	}
	event.preventDefault();
	H.slot = null;
	_rapierNotesHeadScan();
}

function _rapierNotesHeadIdle() {
	const H = _rapierNotes.head;
	if (H.fresh == null) return null;
	const host = document.getElementById('editor-blocks');
	if (!host) return null;
	const wrapper = host.querySelector(':scope > .block-wrapper--editing'), block = wrapper ? _rapierBoundBlock(wrapper) : null;
	if (!block || block.id !== H.fresh || String(block.raw || '').trim() || _rapierNotesHeadWords(block, wrapper)) return null;
	return _rapierComposeMarkdownDocument(_rapierMarkdownBodyFromBlocks(rapier.document.blocks.filter(b => b !== block)), rapier.document.frontmatter);
}
function _rapierNotesHeadSettle() {
	if (_rapierNotesHeadIdle() == null) return;
	try { _leaveOtherEditingBlocks(null); } catch (_) {}
}
function _rapierNotesHeadAttach(on) {
	const H = _rapierNotes.head, host = document.getElementById('editor-blocks');
	H.observer?.disconnect(); H.observer = null;
	H.slot = H.fresh = null;
	if (!host) return;
	if (!on) { _rapierNotesHeadLay(host); return; }
	if (H.bound !== host) {
		H.bound = host;
		document.addEventListener('selectionchange', () => _rapierNotesFields.normalize());
		for (const type of ['keydown', 'beforeinput', 'compositionstart', 'copy', 'cut', 'paste', 'pointerup']) window.addEventListener(type, _rapierNotesFields.event, true);
		host.addEventListener('input', event => { if (!event.isComposing && !/^(?:format|history)/.test(event.inputType || '')) _rapierNotesHeadTurn(); });
		host.addEventListener('compositionend', () => { setTimeout(_rapierNotesHeadTurn, 0); });
		for (const type of ['keydown', 'beforeinput']) window.addEventListener(type, _rapierNotesHeadEnter, true);
	}
	H.observer = new MutationObserver(_rapierNotesHeadSoon);
	_rapierNotesHeadScan();
}

function _rapierNotesPublishUrl(file) {
	const id = _rapierNotes.index?.notes[file]?.id;
	if (!id || typeof _rapierBootPathAndQuery !== 'function' || globalThis.RAPIER_APPS_HOST === true) return;
	if (typeof _rapierEmbed !== 'undefined' && (_rapierEmbed.active || _rapierEmbed.local)) return;
	try { history.replaceState(history.state, '', _rapierBootPathAndQuery() + '#n/' + encodeURIComponent(id)); } catch (_) {}
}
async function _rapierNotesOpenById(id) {
	const state = _rapierNotes;
	let opened = false;
	try {
		await _rapierNotesOpen();
		if (!state.open || !state.index) return false;
		if (state.current || state.mode || state.liftOpen || state.liftBack) return 'yielded';
		const file = Object.keys(state.index.notes).find(f => state.index.notes[f]?.id === id && !state.index.notes[f]?.trashed);
		if (!file) { showToast('That note is not in this notes folder.', 'info'); return 'missing'; }
		return opened = await _rapierNotesOpenNote(file, false, id, null, null, true) === true;
	} finally { _rapierLive.restored(id, opened); }
}
async function _rapierNotesOpenNote(...args) {
	const state = _rapierNotes;
	state.noteOpening = (state.noteOpening || 0) + 1;
	if (typeof _rapierBackHold === 'function') _rapierBackHold();
	const opening = state.noteOpeningTask = _rapierNotesOpenNoteNow(...args);
	try { return await opening; }
	finally { state.noteOpening--; if (typeof _rapierBackHold === 'function') _rapierBackHold(); }
}
async function _rapierNotesOpenNoteNow(file, capture = false, expectedId = null, under = null, access = null, throwReadError = false) {
	const state = _rapierNotes;
	let transitioned = false;
	const current = () => {
		if (transitioned && access?.signal?.aborted) return false;
		access?.signal?.throwIfAborted(); access?.guard?.();
		if (!transitioned && access?.stamp && !(_rapierMutationStampIsCurrent(access.stamp) && (!access.cards || state.open))) return false;
		if (!access) return true;
		const gate = transitioned ? access.presentationGuard : access.foregroundGuard;
		return typeof gate === 'function' ? gate() === true : !!access.stamp;
	};
	if (!current()) return false;
	if (_rapierNotes.trailKeep !== true) _rapierNotes.noteTrail = [];
	_rapierNotes.trailKeep = false;
	if (access ? _rapierNotesHostLocked() : !capture && !await _rapierNotesUnlock()) return false;
	if (!current()) { under?.drop(); return false; }
	const focusFrom = document.activeElement;
	if (state.returning) return false;
	if (state.returnRefused) { showToast('Return to Rapier again to finish restoring your document.', 'error'); return false; }
	if (typeof rapierLoad !== 'function') return;
	const from = state.openFrom && state.openFrom.file === file ? state.openFrom : null; state.openFrom = null;
	if (typeof _rapierNotesLiftCancel === 'function') _rapierNotesLiftCancel();
	let lift = from && state.open ? _rapierNotesLiftGrow(from) : under;
	let guard;
	try { guard = await _rapierNotesFlush(); } catch (_) { lift?.drop(); return; }
	const store = _rapierNotesStore, folder = store.folder, bytes = store.bytes;
	let opened;
	try { opened = await folder.readCanonical({file, id: expectedId || state.index.notes[file]?.id}); }
	catch (error) {
		lift?.drop(); showToast('This note could not be opened with its history: ' + String(error?.message || error), 'error');
		if (throwReadError) throw error;
		return false;
	}
	if (!current() || !_rapierMutationStampIsCurrent(guard) || store.folder !== folder || store.bytes !== bytes || opened.index.notes[file]?.trashed && expectedId) { lift?.drop(); return false; }
	_rapierNotesTake(opened, {readOnly: true});
	const text = opened.text;
	const proof = {file, id: opened.id, text, digest: opened.digest, ledger: opened.ledger.sha256, folder, bytes, authority: opened.documentAuthority};
	if (!state.current && typeof rapierFlushDirty === 'function') {
		let kept = false;
		try { kept = await rapierFlushDirty({ snapshot: true, durable: true }) === true; } catch (_) {}
		if (!kept && _rapierIsDirty()) {
			lift?.drop();
			showToast('Your document could not be kept. Save it, then open the note again.', 'error');
			return false;
		}
		if (!current() || !_rapierMutationStampIsCurrent(guard)) { lift?.drop(); showToast('The open document changed; open the note again when ready', 'info'); return; }
	}
	if (!state.current && typeof _rapierCommitPendingHistory === 'function') { try { _rapierCommitPendingHistory(); } catch (_) {} }
	let suspended;
	try { suspended = _rapierNotesRemember(); }
	catch (error) { lift?.drop(); showToast('The open document could not be kept for return: ' + String(error?.message || error), 'error'); return false; }
	const already = _rapierNotesDocumentBound() && state.current === file && state.currentProof.ledger === opened.ledger.sha256 && _rapierSourceText() === text;
	if (!current() || !_rapierMutationStampIsCurrent(guard)) { lift?.drop(); showToast('The open document changed; open the note again when ready', 'info'); return; }
	if (!already) {
		const checked = await folder.readCanonical({file, id: proof.id});
		if (!current() || !_rapierMutationStampIsCurrent(guard) || store.folder !== folder || store.bytes !== bytes || checked.ledger.sha256 !== proof.ledger) { lift?.drop(); return false; }
		const loaded = await rapierLoad(text, opened.metadata.filename, {expectedMutationStamp: guard, returnReceipt: true, deferFlush: true, restore: true, documentAuthority: opened.documentAuthority, carriedLedger: opened.ledger, documentKind: opened.metadata.docKind});
		if (!loaded || !_rapierLoadReceiptIsCurrent(loaded)) { lift?.drop(); showToast('This note could not be opened', 'error'); return; }
		transitioned = true;
		state.cameFrom = suspended;
		state.current = file; state.currentProof = Object.freeze({...proof, epoch: Number(rapier.identity.epoch || 0)}); state.savingGen = -1; state.savingText = state.savingDigest = null;
		_rapierNotesMarkClean({canonical: text, generation: Number(rapier.revision.generation || 0), stamp: Object.freeze(_rapierMutationStamp()), ledger: opened.ledger});
		_rapierNotesMode(true);
		if (!state.autosave) state.autosave = setInterval(_rapierNotesAutosave, RAPIER_NOTES_AUTOSAVE_MS);
		access?.onOpened?.({documentId: String(rapier.identity.authority), epoch: Number(rapier.identity.epoch || 0)});
		const landed = await folder.readCanonical({file, id: proof.id});
		if (!_rapierNotesDocumentBound()) { lift?.drop(); return false; }
		if (landed.ledger.sha256 !== proof.ledger) {
			state.saveFailed = true; lift?.drop();
			throw Object.assign(new Error('The note changed while it opened. Its loaded history and stored source were kept.'), {code: 'notes_changed'});
		}
		guard = _rapierMutationStamp();
	}
	transitioned = true;
	if (!current()) { lift?.drop(); return false; }
	if (already) {
		_rapierNotesMode(true);
		access?.onOpened?.({documentId: String(rapier.identity.authority), epoch: Number(rapier.identity.epoch || 0)});
	}
	lift?.bar?.();
	_rapierNotesHistory('note');
	_rapierNotesPublishUrl(file);
	if (lift) await lift.grown;
	if (!current() || !_rapierMutationStampIsCurrent(guard)) { lift?.drop(); if (!access) _rapierNotesMode(false); showToast('The open document changed; open the note again when ready', 'info'); return; }
	state.scrollKept = state.scroll ? state.scroll.scrollTop : 0;
	_rapierNotesClose(true, true);
	if (document.activeElement === focusFrom || document.activeElement === document.body) {
		const source = document.getElementById('source-textarea');
		(source?.getClientRects().length ? source : document.getElementById('editor-blocks'))?.focus({preventScroll: true});
	}
	lift?.fade();
	if (!state.autosave) state.autosave = setInterval(_rapierNotesAutosave, RAPIER_NOTES_AUTOSAVE_MS);
	if (typeof _rapierTodoInit === 'function') { try { _rapierTodoInit(); } catch (_) {} }
	if (typeof _rapierRecorderInit === 'function') _rapierRecorderInit(); if (typeof _rapierAttachmentsInit === 'function') _rapierAttachmentsInit();
	return true;
}
async function _rapierNotesOpenAsDocument(file) {
	if (typeof rapierOpenPlatformPayload !== 'function') return false;
	_rapierNotesCloseSheet();
	try { await _rapierNotesFlush(); } catch (_) { return false; }
	const text = (await _rapierNotesTexts([file], {hold: false})).get(file);
	if (typeof text !== 'string') { showToast('The note could not be read. Nothing was opened.', 'error'); return false; }
	if (!await _rapierNotesEditor()) return false;
	if (_rapierNotesKeptDocument(file)) return await rapierOpenPlatformPayload({text, name: file, rapierKept: await _rapierNotesKeptRecord(file, text)}) === true;
	return await rapierOpenPlatformPayload({text, name: file, transient: true}) === true;
}
function _rapierNotesKeptDocument(file) {
	const entry = _rapierNotes.index?.notes?.[file];
	return !!entry && (_rapierNotesModel().isCodeFile(file) || entry.kind === 'document');
}
async function _rapierNotesKeptRecord(file, text) {
	return {file, id: _rapierNotes.index.notes[file]?.id || null, digest: await globalThis.RapierNotesIntegrity.sha256(text)};
}
globalThis.RapierNotesKeep = Object.freeze({
	available() { return !!globalThis.RapierNotesModel && !!globalThis.RapierNotesIntegrity; },
	synced() {
		try {
			const s = typeof _rapierNotesSyncUi !== 'undefined' && _rapierNotesSyncUi.status();
			return !!(s && s.unlocked && s.authorized);
		} catch (_) { return false; }
	},
	ask(purpose) {
		return purpose === 'open'
			? rapierConfirm({title: 'open', message: 'Open a document from your cloud storage, or one from this device?', confirmLabel: 'cloud storage', secondaryLabel: 'this device'})
			: rapierConfirm({title: 'save', message: 'Save to your cloud storage, beside your notes, or on this device?', confirmLabel: 'cloud storage', secondaryLabel: 'this device'});
	},
	async keep(text, name) {
		await _rapierNotesReady();
		if (!_rapierNotes.indexBase) { await _rapierNotesLoad(); _rapierNotesIndexingBegin(); }
		const M = _rapierNotesModel(), code = M.isCodeFile(name);
		const wanted = code || M.isMarkdownNote(name) ? name : String(name || 'document').replace(/\.[^./\\]*$/, '') + '.md';
		const file = await _rapierNotesWriteNew(text, wanted, {..._rapierNotesPlaceFirst(), ...(code ? {} : {kind: 'document'})});
		_rapierNotesAdmit(file, text);
		return _rapierNotesKeptRecord(file, text);
	},
	async save(bound, text) {
		const store = _rapierNotesStore;
		await store.kind();
		const saved = _rapierNotesTake(await store.folder.save({file: bound.file, id: bound.id, expectedDigest: [bound.digest], text}));
		_rapierNotesHold(saved.file, text);
		if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(saved.file);
		if (saved.copied) showToast(bound.file + ' was changed elsewhere while you wrote. Its newer words stay; yours are kept as ' + saved.file + ', which this document now saves to.', 'info');
		return {file: saved.file, id: saved.id, digest: saved.digest};
	},
	async read(file) { await _rapierNotesStore.kind(); return _rapierNotesStore.read(file); },
	show() { return _rapierNotesOpen(); },
	saveCurrent(authority) { return String(rapier.identity.authority || '') === String(authority || '') && !!authority ? rapierSave({quiet: true}) : false; },
});
async function _rapierNotesShareAsDocument(file) {
	if (!await _rapierNotesOpenAsDocument(file)) return;
	if (typeof _rapierUiSetSettingsOpen === 'function') _rapierUiSetSettingsOpen(true);
	if (typeof _RAPIER_UI_ACTIONS === 'object') _RAPIER_UI_ACTIONS['open-share-menu']?.();
}
function _rapierNotesNameByWords(file, text) {
	const state = _rapierNotes, M = _rapierNotesModel();
	if (state.renaming) return state.renaming;
	if (!_rapierNotesDocumentBound() || state.current !== file || !_rapierNotesBody(text).trim()) return;
	state.renaming = (async () => {
		const wanted = M.noteFileName(text, Object.keys(state.index.notes).filter(name => name !== file));
		if (rapierRenameDocument(wanted) !== wanted) return;
		const capture = await _rapierCaptureSettledExternalDocument({quiet: true, carried: 'history'});
		if (!capture || !_rapierNotesDocumentBound() || state.current !== file) return;
		await _rapierNotesSave(file, capture.canonical, capture.ledger);
		state.untitled.delete(file);
		_rapierNotesMarkClean(capture);
	})().finally(() => { state.renaming = null; });
	return state.renaming;
}
function _rapierNotesMarkClean(capture, ledger = capture?.ledger?.sha256) {
	const state = _rapierNotes, proof = state.currentProof;
	if (!capture && !state.current) {
		try { rapier.revision.savedGeneration = Number(rapier.revision.generation || 0); rapier.identity.saveAsRequired = false; } catch (_) {}
		return true;
	}
	if (!capture || !proof || !_rapierNotesDocumentBound() || !_rapierMutationStampIsCurrent(capture.stamp)) return false;
	state.savedGen = -1; state.savedReceipt = null;
	if (ledger !== proof.ledger || capture.canonical !== proof.text || _rapierSourceText() !== capture.canonical) return false;
	state.savedGen = capture.generation;
	state.savedReceipt = Object.freeze({proof, stamp: capture.stamp, generation: capture.generation});
	try { rapier.revision.savedGeneration = capture.generation; rapier.identity.saveAsRequired = false; } catch (_) {}
	return true;
}
async function _rapierNotesHistoryOne(file, id) {
	const H = globalThis.RapierNotesHistory, state = _rapierNotes;
	const read = await _rapierNotesHistoryRead(file);
	if (read.kind !== 'read') return null;
	const row = read.versions.find(v => v.id === id);
	if (!row) return null;
	let target;
	try { target = await H.materialize(read.manifest, id, path => _rapierNotesStore.readHistory(path)); }
	catch (_) { return null; }
	const now = state.texts.get(file) ?? _rapierSourceText();
	const diff = H.diffLines(now, target.text);
	const lines = [];
	let added = 0, removed = 0;
	if (!diff.tooLarge) {
		for (const edit of diff.edits) {
			if (edit.op === 'equal') continue;
			if (edit.op === 'insert') added += edit.lines.length; else removed += edit.lines.length;
			for (const line of edit.lines) if (lines.length < RAPIER_NOTES_DIFF_LINES) lines.push({op: edit.op === 'insert' ? 'add' : 'cut', text: line.replace(/\r?\n$/, '') || ' '});
		}
	}
	const words = diff.tooLarge ? 'Too large to compare here.'
		: !added && !removed ? 'These are the words the note already has.'
		: 'Putting these back adds ' + added + (added === 1 ? ' line' : ' lines') + ' and takes away ' + removed + (removed === 1 ? ' line' : ' lines') + '.';
	const first = id === read.versions.reduce((low, v) => Math.min(low, v.id), Infinity);
	return {id, time: row.time, reason: row.reason, first, size: row.size, current: id === read.manifest.current, words, lines, more: added + removed - lines.length};
}
const RAPIER_NOTES_DIFF_LINES = 40;
async function _rapierNotesHistoryPreviews(read) {
	const H = globalThis.RapierNotesHistory, out = new Map();
	if (read?.kind !== 'read' || typeof H?.changePreview !== 'function') return out;
	const rows = read.versions.slice(0, 31), texts = await Promise.all(rows.map(async v => {
		try { return (await H.materialize(read.manifest, v.id, path => _rapierNotesStore.readHistory(path))).text; } catch (_) { return null; }
	}));
	for (let i = 0; i < Math.min(rows.length, 30); i++) {
		if (texts[i] == null) continue;
		const older = read.versions[i + 1], before = older ? texts[i + 1] : null;
		if (older && before == null) continue;
		out.set(rows[i].id, H.changePreview(before, texts[i]));
	}
	return out;
}
const _rapierNotesLocalDay = time => { const d = new Date(time), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
async function _rapierNotesHistoryInventory() {
	const H = globalThis.RapierNotesHistory;
	if (!H || typeof H.thin !== 'function') throw new Error('the history module did not load');
	const list = [], unreadable = [];
	for (const name of await _rapierNotesStore.historyNames('manifests')) {
		const path = 'manifests/' + name;
		const bytes = await _rapierNotesStore.readHistory(path);
		try {
			const noteId = name.replace(/\.json$/, '').replace('!', ':');
			if (bytes == null || H.manifestName(noteId) !== path) throw new Error('history manifest is missing or misnamed');
			list.push(H.parseManifest(bytes, {noteId, now: Date.now()}));
		} catch (_) { unreadable.push(path); }
	}
	return {list, unreadable};
}
async function _rapierNotesHistoryTidy() {
	const H = globalThis.RapierNotesHistory;
	let held;
	try { held = await _rapierNotesHistoryInventory(); }
	catch (error) { showToast('History could not be read: ' + String(error?.message || error), 'error'); return; }
	if (held.unreadable.length) {
		showToast('History cannot be tidied while ' + (held.unreadable.length === 1 ? 'one note\'s history cannot be read' : held.unreadable.length.toLocaleString('en') + ' notes\' histories cannot be read') + '. Nothing was removed.', 'error');
		return;
	}
	if (!held.list.length) { showToast('There are no earlier versions to tidy.', 'info'); return; }
	let plan, before;
	try {
		before = H.storage(held.list);
		plan = H.thin(held.list, H.DEFAULT_POLICY, {now: Date.now(), dayOf: _rapierNotesLocalDay, complete: true});
	} catch (error) { showToast('History could not be checked for tidying: ' + String(error?.message || error), 'error'); return; }
	if (!plan.removes.length) {
		showToast('Nothing is old enough to tidy. History holds ' + before.versions.toLocaleString('en') + (before.versions === 1 ? ' version' : ' versions') + ' in ' + _rapierNotesBytesWords(before.bytes) + '.', 'info');
		return;
	}
	const notes = new Set(plan.removes.map(row => row.noteId)).size, freed = Math.max(0, before.bytes - plan.storage.bytes);
	const P = H.DEFAULT_POLICY;
	const sure = typeof rapierConfirm === 'function' ? await rapierConfirm({
		title: 'tidy history?',
		message: '• Removes ' + plan.removes.length.toLocaleString('en') + (plan.removes.length === 1 ? ' old version' : ' old versions') + ' and frees ' + _rapierNotesBytesWords(freed) + '.\n• Keeps recent history.\n• No undo.',
		confirmLabel: 'Tidy', secondaryLabel: '', destructive: true}) : true;
	if (!sure) return;
	try { await _rapierNotesStore.historyCommit(async () => {
		const fresh = await _rapierNotesHistoryInventory();
		const ordered = rows => [...rows].sort((a, b) => a.noteId < b.noteId ? -1 : a.noteId > b.noteId ? 1 : 0);
		if (fresh.unreadable.length || JSON.stringify(ordered(fresh.list)) !== JSON.stringify(ordered(held.list))) {
			showToast('History changed while Tidy was open, so nothing was removed: open Tidy history again.', 'info');
			return;
		}
		try { for (const write of plan.writes) await _rapierNotesStore.writeHistory(write.name, write.bytes, {immutable: false}); }
		catch (error) { showToast('History was not tidied: ' + String(error?.message || error) + '. Nothing was removed.', 'error'); return; }
		let gone = 0, stuck = 0;
		for (const path of [...plan.textsFree.map(hash => 'texts/' + hash), ...plan.blobsFree.map(hash => 'blobs/' + hash)]) {
			try { await _rapierNotesStore.removeHistory(path); gone++; } catch (_) { stuck++; }
		}
		void _rapierNotesStorageAnswer(false);
		showToast('History tidied: ' + plan.removes.length.toLocaleString('en') + (plan.removes.length === 1 ? ' version' : ' versions') + ' removed from ' + notes.toLocaleString('en') + (notes === 1 ? ' note' : ' notes') + (stuck ? '; ' + stuck.toLocaleString('en') + (stuck === 1 ? ' file' : ' files') + ' could not be removed and stay in the folder' : '') + '.', 'info');
		if (_rapierNotes.sheetMode === 'history' || _rapierNotes.sheetMode === 'version') { _rapierNotes.historyRows = null; _rapierNotes.historyOne = null; _rapierNotesCloseSheet(); }
	}); } catch (error) { showToast('History could not be tidied: ' + String(error?.message || error), 'error'); }

}
async function _rapierNotesHistoryRead(file) {
	const H = globalThis.RapierNotesHistory, state = _rapierNotes, entry = state.index?.notes[file];
	if (!H || typeof H.versionsOf !== 'function') return {kind: 'absent', versions: []};
	if (!entry?.id) return {kind: 'new', versions: []};
	const bytes = await _rapierNotesStore.readHistory(H.manifestName(entry.id));
	if (bytes == null) return {kind: 'new', versions: []};
	try {
		const manifest = H.parseManifest(bytes, {noteId: entry.id, now: Date.now()});
		return {kind: 'read', manifest, versions: H.versionsOf(manifest, file).slice().reverse(), tidied: manifest.thinned.reduce((n, batch) => n + batch.removes.length, 0), tidiedAt: manifest.thinned.at(-1)?.time ?? null};
	} catch (_) { return {kind: 'unreadable', versions: []}; }
}
async function _rapierNotesHistoryRestore(file, id) {
	const H = globalThis.RapierNotesHistory, state = _rapierNotes;
	let guard;
	try { guard = await _rapierNotesFlush(); } catch (_) { return false; }
	if (state.current !== file || !_rapierNotesDocumentBound()) { showToast('This note is not the open one, so its history was not changed', 'error'); return false; }
	const read = await _rapierNotesHistoryRead(file);
	if (read.kind !== 'read') { showToast(read.kind === 'unreadable' ? 'This note\'s past could not be read, so nothing was changed' : 'This note has no past to go back to yet', 'error'); return false; }
	const entry = state.index?.notes[file], now = state.texts.get(file) ?? _rapierSourceText();
	try {
		const plan = await H.restorePlan(read.manifest, id, {file, text: now, entry}, path => _rapierNotesStore.readHistory(path));
		if (plan.recordFirst) await _rapierNotesRecordVersion({file, text: now, entry, reason: 'save'});
		if (state.current !== file || !_rapierNotesDocumentBound() || !_rapierMutationStampIsCurrent(guard)) {
			showToast('The open note changed while its history was read; nothing was restored', 'info');
			return false;
		}
		state.restoring = {id: entry?.id, from: id, text: plan.text};
		const ok = await _rapierNotesApplyText(plan.text, 'notes.history', 'Restore', {settle: true});
		if (!ok) {
			const inEditor = _rapierSourceText() === plan.text;
			showToast(inEditor
				? 'The words are back in the note, but the notes folder did not keep them'
				: 'The note could not be changed, so nothing was restored', 'error');
			return false;
		}
		if (state.restoring) { state.restoring = null; await _rapierNotesRecordVersion({file, text: plan.text, entry, reason: 'restore', restoredFrom: id}); }
		showToast('Put back the words from ' + _rapierNotesWhen(read.versions.find(v => v.id === id)?.time), 'info');
		return true;
	} catch (error) { showToast('Nothing was restored: ' + String(error?.message || error), 'error'); return false; }
	finally { state.restoring = null; }
}
const RAPIER_NOTES_REASON_WORDS = {save: 'edited', import: 'brought in', rename: 'named', restore: 'version put back', trash: 'moved to the recycle bin', untrash: 'taken out of the recycle bin', 'import-undo': 'import undone', merge: 'merged', capture: 'captured', 'edit-card': 'edited on the card'};
function _rapierNotesReasonWords(reason, first) {
	return first && reason === 'save' ? 'first saved' : (RAPIER_NOTES_REASON_WORDS[reason] || String(reason ?? ''));
}
function _rapierNotesWhen(time) {
	if (!Number.isFinite(time)) return 'an unknown time';
	const then = new Date(time), now = new Date();
	const sameDay = then.toDateString() === now.toDateString();
	try { return sameDay ? then.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) : then.toLocaleString([], {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}); }
	catch (_) { return then.toISOString(); }
}
async function _rapierNotesRecordVersion({file, text, entry, reason = 'save', restoredFrom, signal, guard} = {}, underLease = false) {
	const H = globalThis.RapierNotesHistory, state = _rapierNotes;
	if (!H || typeof H.recordVersion !== 'function') return null;
	const id = entry?.id;
	if (!id) return null;
	const record = async () => {
		const active = () => { if (signal?.aborted) throw new DOMException('The Notes request was cancelled.', 'AbortError'); guard?.(); }; active();
		const path = H.manifestName(id);
		let manifest;
		const held = await _rapierNotesStore.readHistory(path);
		if (held == null) manifest = H.emptyManifest(id);
		else {
			try { manifest = H.parseManifest(held, {noteId: id, now: Date.now()}); }
			catch (error) { throw Object.assign(new Error('this note\'s history could not be read, so this save was not recorded in it'), {cause: error}); }
		}
		const createdFiles = [], readBack = new Map();
		const result = await H.recordVersion(manifest, {file, text, entry, reason, now: Date.now(), ...(restoredFrom === undefined ? {} : {restoredFrom})});
		active();
		for (const write of result.writes) if (write.immutable) {
			const created = await _rapierNotesStore.writeHistory(write.name, write.bytes, {immutable: true});
			if (held == null && created) {
				const actual = await _rapierNotesStore.readHistory(write.name);
				createdFiles.push({file: 'history/' + write.name, bytes: write.bytes, actual});
				readBack.set(write.name, actual);
			}
		}
		await H.materialize(result.manifest, result.version.id, name => readBack.has(name) ? readBack.get(name) : _rapierNotesStore.readHistory(name));
		for (const write of result.writes) if (!write.immutable) {
			await _rapierNotesStore.writeHistory(write.name, write.bytes);
			if (held == null) createdFiles.push({file: 'history/' + write.name, bytes: write.bytes, actual: await _rapierNotesStore.readHistory(write.name)});
		}
		result.createdFiles = createdFiles;
		state.historyAt = result.version?.id ?? state.historyAt;
		return result;
	};
	return underLease ? record() : _rapierNotesStore.historyCommit(record);
}
function _rapierNotesInputCapture() {
	if (_rapierUserMutationBlocked(false)) return null;
	const captured = _rapierNotesPending.text();
	if (captured.paste) return null;
	const proof = _rapierNotes.currentProof, stamp = Object.freeze(_rapierMutationStamp());
	_rapierNotesPending.retain(proof, stamp, captured.text, false);
	if (_rapierNotes.currentProof !== proof || !_rapierMutationStampIsCurrent(stamp)) return null;
	const ledger = _rapierSourceText() === captured.text ? _rapierLedgerCapture() : null;
	return Object.freeze({canonical: captured.text, generation: stamp.docGeneration, stamp, ledger});
}
function _rapierNotesInputChanged(event) {
	const state = _rapierNotes, target = event.target;
	if (!state.current || event.isComposing || (target !== document.getElementById('source-textarea') &&
			!document.getElementById('editor-blocks')?.contains(target))) return;
	state.inputSaveWanted = Object.freeze(_rapierMutationStamp());
	if (state.inputSaveTask) return;
	state.inputSaveTask = Promise.resolve().then(async () => {
		try {
			while (state.inputSaveWanted) {
				const input = state.inputSaveWanted; state.inputSaveWanted = null;
				await _rapierNotesAutosave({input});
			}
		} catch (error) {
			if (!state.saveFailed) showToast('This note is not being saved to the notes folder: ' + String(error?.message || error), 'error', {outlive: 'save-failed'});
			state.saveFailed = true;
		} finally { state.inputSaveTask = null; }
	});
}
async function _rapierNotesAutosave({settle = false, input = null} = {}) {
	const state = _rapierNotes;
	while (state.saveTask) await state.saveTask;
	const task = _rapierNotesAutosaveNow({settle, input});
	state.saveTask = task;
	try { await task; }
	finally {
		if (state.saveTask === task) state.saveTask = null;
		if (typeof _rapierBackHold === 'function') _rapierBackHold();
	}
}
async function _rapierNotesAutosaveNow({settle = false, input = null} = {}) {
	const state = _rapierNotes;
	if (!state.current || state.renaming || state.returnRefused || (state.returning && !settle)) return;
	if (input && !_rapierMutationStampSharesDocument(input)) return;
	if (!settle && !input && globalThis.__rapierNotesHoldTick) return;
	if (!_rapierNotesDocumentBound()) { _rapierNotesLeaveNote(); return; }
	const file = state.current, requested = _rapierMutationStamp();
	const captured = input ? _rapierNotesInputCapture() : await _rapierCaptureSettledExternalDocument({quiet: true, passive: !settle, carried: 'history'});
	if (!captured || !_rapierMutationStampSharesDocument(requested) || state.current !== file ||
			!_rapierNotesDocumentBound()) return;
	const {generation: gen, canonical: text, stamp} = captured;
	const proof = state.currentProof, compared = _rapierNotesHeadIdle() ?? text;
	const sameWords = !!proof && compared === proof.text;
	const unchanged = sameWords && (captured.ledger ? captured.ledger.sha256 === proof.ledger : !!input);
	if (input && (!_rapierMutationStampSharesDocument(stamp) || state.current !== file || state.currentProof !== proof)) return;
	if (!settle && !state.saveFailed && unchanged) {
		const carried = captured.ledger?.sha256 || (state.savedReceipt?.proof === proof &&
			_rapierMutationStampIsCurrent(state.savedReceipt.stamp) ? proof.ledger : null);
		_rapierNotesMarkClean(captured, carried);
		_rapierNotesPending.retain(proof, stamp, compared, true);
		_rapierNotesPending.forget(proof, stamp, proof?.digest);
		if (!input && state.untitled.has(file) && state.current === file && !state.renaming) {
			try { await _rapierNotesNameByWords(file, text); }
			catch (error) {
				if (!state.saveFailed) showToast('This note is not being saved to the notes folder: ' + String(error?.message || error), 'error', {outlive: 'save-failed'});
				state.saveFailed = true;
			}
		}
		return;
	}
	state.savingGen = gen; state.savingText = text; state.savingDigest = null;
	_rapierNotesPending.retain(proof, stamp, text, true);
	try {
		const revived = !!state.index.notes[file]?.trashed;
		const saved = await _rapierNotesSave(file, text, captured.ledger, {input: !!input, exact: unchanged});
		if (saved.file !== file) {
			state.texts.delete(file); state.titles.delete(file);
			if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file);
			if (_rapierMutationStampSharesDocument(stamp) && state.current === file &&
					_rapierNotesDocumentBound()) {
				state.current = saved.file;
			}
		}
		const kept = saved.file, entry = state.index?.notes[kept];
		state.captured?.delete(entry?.id);
		if (state.restoring?.id === entry?.id && state.restoring.text === text) state.restoring = null;
		_rapierNotesMarkClean(captured); _rapierNotesHold(kept, text); state.saveFailed = false;
		_rapierNotesPending.forget(proof, stamp, saved.digest);
		if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(kept);
		if (revived && !saved.copied) showToast('This note was in the recycle bin; writing in it has put it back.', 'info');
		if (!input && state.untitled.has(kept) && state.current === kept && !state.renaming) await _rapierNotesNameByWords(kept, text);
	} catch (error) {
		if (!state.saveFailed) showToast('This note is not being saved to the notes folder: ' + String(error?.message || error), 'error', {outlive: 'save-failed'});
		state.saveFailed = true;
	} finally { state.savingGen = -1; state.savingText = state.savingDigest = null; }
}
async function _rapierNotesFlush() {
	const state = _rapierNotes;
	try {
		_rapierNotesHeadSettle();
		if (state.renaming) await state.renaming;
		if (state.current) {
			await _rapierNotesAutosave({settle: true});
			while (state.inputSaveTask || state.saveTask) await (state.inputSaveTask || state.saveTask);
		}
		while (state.orderOperation) await state.orderOperation.task;
		await _rapierNotesStore.settle();
		if (state.renaming) await state.renaming;
		if (state.current && _rapierNotesDocumentBound()) {
			const proof = state.currentProof, receipt = state.savedReceipt;
			if (state.saveFailed || state.saveTask || state.inputSaveTask || !receipt || receipt.proof !== proof ||
					state.savedGen !== receipt.generation || !_rapierMutationStampIsCurrent(receipt.stamp) ||
					_rapierSourceText() !== proof.text) throw new Error('This note still has unsaved changes. Keep it open and try again.');
			if (proof.id) globalThis.RapierPlatform?.host?.reviewSaved?.('note:' + proof.id);
			return receipt.stamp;
		}
		return Object.freeze(_rapierMutationStamp());
	} catch (error) {
		if (!state.saveFailed) showToast('The notes folder has not kept every change: ' + String(error?.message || error), 'error', {outlive: 'save-failed'});
		throw error;
	}
}
function _rapierNotesLeaveNote() {
	const state = _rapierNotes;
	state.current = null; state.currentProof = null; state.savedReceipt = null; state.savedGen = -1;
	if (state.autosave) { clearInterval(state.autosave); state.autosave = 0; }
	if (typeof rapierSetReadOnly === 'function' && rapier.access) { rapier.access.notesReadOnly = false; rapierSetReadOnly(false); }
	_rapierNotesMode(false);
}

async function _rapierNotesWriteNew(text, wanted, extra = {}, request, options) {
	const store = _rapierNotesStore;
	await store.kind();
	return _rapierNotesTake(await store.folder.create(text, wanted, extra, request, options)).file;
}

function _rapierNotesAdmit(file, text) {
	const state = _rapierNotes, M = _rapierNotesModel();
	const { index } = M.reconcile(state.index, [...Object.keys(state.index.notes), file]);
	state.index = index; _rapierNotesHold(file, text);
	if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file);
}
function _rapierNotesSelect(file, toggle = true) {
	const state = _rapierNotes; if (!state.index.notes[file]) return;
	if (toggle && state.selected.has(file)) state.selected.delete(file); else state.selected.add(file);
	for (const el of state.surface.querySelectorAll('.rapier-notes-card')) { const on = state.selected.has(el.dataset.notesFile); el.classList.toggle('rapier-notes-card--selected', on); el.setAttribute('aria-describedby', 'rapier-notes-card-help' + (on ? ' rapier-notes-selected' : '')); }
	if (!state.selected.size) { _rapierNotesCloseSheet(); return; }
	if (state.sheet?.classList.contains('rapier-notes-sheet--open')) _rapierNotesOpenSheet();
	else if (typeof _rapierNotesLibraryBarPaint === 'function') _rapierNotesLibraryBarPaint();
}

function _rapierNotesOpenCard(card) {
	const state = _rapierNotes, file = card.dataset.notesFile;
	if (state.selected.size) _rapierNotesSelect(file);
	else { state.openFrom = _rapierNotesLiftSnapshot(file, card); void _rapierNotesOpenNote(file); }
}
function _rapierNotesCardKey(evt) {
	const state = _rapierNotes;
	const field = element => element?.isContentEditable || element?.closest?.('input, textarea, select, [role="textbox"], [contenteditable="true"], [contenteditable="plaintext-only"]');
	if (!state.open || state.surface?.hidden || evt.defaultPrevented || evt.isComposing || evt.keyCode === 229 || evt.ctrlKey || evt.metaKey || evt.altKey || field(evt.target) || field(document.activeElement)) return false;
	if (state.keyBusy || state.popup || state.sheet?.classList.contains('rapier-notes-sheet--open') || _rapierNotesBinIsOpen() || _rapierNotesSettingsIsOpen() || state.askEl?.classList.contains('open') || state.jumpEl?.classList.contains('open')) return false;
	if (evt.shiftKey && /^[jk]$/i.test(evt.key || '') && _rapierNotesKeyMove(evt.target, evt.key.toLowerCase() === 'j' ? 1 : -1)) { evt.preventDefault(); return true; }
	if (state.reorder) return false;
	const key = String(evt.key || '').toLowerCase(), card = evt.target.closest?.('.rapier-notes-card');
	if (evt.target !== card && evt.target !== state.surface) return false;
	const next = ['j', 'arrowdown', 'arrowright'].includes(key), previous = ['k', 'arrowup', 'arrowleft'].includes(key);
	if (!next && !previous && !['c', '/', 'e', '#', 'f', 'x'].includes(key) || (!card && !['c', '/', 'j', 'k'].includes(key))) return false;
	evt.preventDefault();
	if (evt.repeat && !next && !previous) return true;
	if (key === 'c') { _rapierNotesAddsToggle(false); _rapierNotesPopup(null); void _rapierNotesNew('note'); }
	else if (key === '/') { _rapierNotesSearchToggle(true); state.search?.focus(); }
	else if (next || previous) _rapierNotesCardMove(card, next ? 1 : -1);
	else if (key === 'x') _rapierNotesSelect(card.dataset.notesFile);
	else void _rapierNotesCardAction(card, {e: 'archive', '#': 'trash', f: 'pin'}[key]);
	return true;
}
function _rapierNotesCardMove(card, direction) {
	const state = _rapierNotes, ordered = [];
	for (const id of _rapierNotesSectionIds()) {
		const grid = state.grids[id], win = state.windows[id];
		if (!grid || !win || grid.parentElement.hidden || _rapierNotesClosed(id)) continue;
		for (const file of win.files) ordered.push({file, id, grid});
	}
	if (!ordered.length) return;
	const at = ordered.findIndex(row => row.file === card?.dataset.notesFile);
	const next = ordered[at < 0 ? (direction > 0 ? 0 : ordered.length - 1) : Math.max(0, Math.min(ordered.length - 1, at + direction))];
	const target = [...next.grid.querySelectorAll('.rapier-notes-card')].find(el => el.dataset.notesFile === next.file);
	if (target) { target.focus({preventScroll: true}); target.scrollIntoView({block: 'nearest'}); }
	else void _rapierNotesWindowFill(next.grid, next.id, {file: next.file, from: document.activeElement});
}
async function _rapierNotesCardAction(card, act) {
	const state = _rapierNotes, file = card.dataset.notesFile;
	if (state.keyBusy || !state.index?.notes[file]) return;
	const cards = [...state.surface.querySelectorAll('.rapier-notes-card')], at = cards.indexOf(card), from = document.activeElement;
	const returnTo = [file, cards[at + 1]?.dataset.notesFile, cards[at - 1]?.dataset.notesFile];
	state.keyBusy = true;
	try {
		state.selected.clear(); _rapierNotesSelect(file, false);
		await _rapierNotesAct(act);
		if (!state.open || (document.activeElement !== from && document.activeElement !== document.body)) return;
		const available = [...state.surface.querySelectorAll('.rapier-notes-card')];
		const target = returnTo.map(name => available.find(el => el.dataset.notesFile === name)).find(Boolean);
		(target || state.surface).focus({preventScroll: true}); target?.scrollIntoView({block: 'nearest'});
	} catch (_) { showToast('The note could not be changed. Try again.', 'error'); }
	finally { state.keyBusy = false; }
}
function _rapierNotesClockWords(at) {
	const d = new Date(at), hour = d.getHours() % 12 || 12;
	return hour + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + (d.getHours() < 12 ? 'am' : 'pm');
}
function _rapierNotesLocalDateTimeValue(date) {
	const p = n => String(n).padStart(2, '0');
	return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate()) + 'T' + p(date.getHours()) + ':' + p(date.getMinutes());
}
function _rapierNotesParseLocalDateTime(value) {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''));
	return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN;
}
function _rapierNotesRemindStart(entry) {
	const at = entry?.remind?.at;
	if (Number.isFinite(at)) { const d = new Date(at); return {y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), hour: d.getHours(), minute: d.getMinutes()}; }
	const d = new Date(Date.now() + 60 * 60 * 1000);
	return {y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), hour: d.getHours(), minute: 0};
}
function _rapierNotesWeekStart() { try { const w = new Intl.Locale(navigator.language || 'en').weekInfo; return (w?.firstDay || 1) % 7; } catch (_) { return 1; } }
function _rapierNotesRemindPicker(entry, button) {
	const state = _rapierNotes;
	const draft = state.remindDraft || (state.remindDraft = _rapierNotesRemindStart(entry));
	if (!Number.isFinite(draft.sy)) { draft.sy = draft.y; draft.sm = draft.m; }
	const redraw = () => setTimeout(() => paint(), 0);
	const box = _rapierNotesEl('div', 'rapier-notes-cal');
	box.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', 'Choose a date and time'));
	const head = _rapierNotesEl('div', 'rapier-notes-cal-head');
	const title = _rapierNotesEl('div', 'rapier-notes-cal-title'); title.setAttribute('aria-live', 'polite'); title.setAttribute('aria-atomic', 'true');
	const step = (delta, glyph, label) => {
		const b = _rapierNotesEl('button', 'rapier-notes-cal-step'); b.type = 'button'; b.setAttribute('aria-label', label);
		b.appendChild(_rapierNotesGlyph(glyph)); b.dataset.notesStep = String(delta);
		b.addEventListener('click', () => { const t = new Date(draft.sy, draft.sm + delta, 1); draft.sy = t.getFullYear(); draft.sm = t.getMonth(); redraw(); });
		return b;
	};
	head.append(step(-1, 'chevron-left', 'the month before'), title, step(1, 'chevron-right', 'the month after'));
	const grid = _rapierNotesEl('div', 'rapier-notes-cal-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', 'choose a day');
	grid.addEventListener('keydown', event => {
		const day = event.target.closest?.('[data-notes-day]');
		if (!day || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return;
		const offsets = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7};
		if (!(event.key in offsets) && !['Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
		event.preventDefault(); event.stopPropagation();
		const parts = day.dataset.notesDay.split('-').map(Number), when = new Date(parts[0], parts[1] - 1, parts[2]);
		if (event.key in offsets) when.setDate(when.getDate() + offsets[event.key]);
		else if (event.key === 'Home' || event.key === 'End') {
			const offset = (when.getDay() - _rapierNotesWeekStart() + 7) % 7;
			when.setDate(when.getDate() + (event.key === 'Home' ? -offset : 6 - offset));
		} else {
			const wanted = when.getDate(), months = (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1);
			when.setDate(1); when.setMonth(when.getMonth() + months);
			when.setDate(Math.min(wanted, new Date(when.getFullYear(), when.getMonth() + 1, 0).getDate()));
		}
		const today = new Date(); today.setHours(0, 0, 0, 0);
		if (when < today) when.setTime(today.getTime());
		draft.sy = when.getFullYear(); draft.sm = when.getMonth();
		paint(draft.sy + '-' + String(draft.sm + 1).padStart(2, '0') + '-' + String(when.getDate()).padStart(2, '0'));
	});
	const clock = _rapierNotesEl('label', 'rapier-notes-cal-time');
	const time = _rapierNotesEl('input', 'rapier-notes-cal-clock'); time.type = 'time';
	const hhmm = () => String(draft.hour).padStart(2, '0') + ':' + String(draft.minute).padStart(2, '0');
	time.value = hhmm();
	const take = () => { const m = /^(\d{2}):(\d{2})/.exec(time.value); if (!m) return; draft.hour = Number(m[1]); draft.minute = Number(m[2]); say(); };
	time.addEventListener('input', take); time.addEventListener('change', take);
	time.addEventListener('blur', () => { if (!time.value) time.value = hhmm(); });
	clock.append(_rapierNotesEl('span', 'rapier-notes-remind-label', 'Time'), time);
	const set = _rapierNotesEl('button', 'rapier-notes-btn rapier-notes-cal-set'); set.type = 'button';
	set.addEventListener('click', () => { void _rapierNotesAct('remind-set', _rapierNotesLocalDateTimeValue(new Date(draft.y, draft.m, draft.d, draft.hour, draft.minute))); });
	box.append(head, grid, clock, set);
	function say() { set.textContent = 'Set  ·  ' + new Date(draft.y, draft.m, draft.d).toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short'}) + ', ' + _rapierNotesClockWords(new Date(draft.y, draft.m, draft.d, draft.hour, draft.minute).getTime()); }
	function paint(focusDay = null) {
		const keepFocus = _rapierNotesKeepFocus(grid), previous = document.activeElement?.dataset.notesDay;
		const first = _rapierNotesWeekStart();
		title.textContent = new Date(draft.sy, draft.sm, 1).toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
		grid.textContent = '';
		for (let i = 0; i < 7; i++) {
			const day = new Date(2024, 0, 7 + ((first + i) % 7));
			const name = _rapierNotesEl('div', 'rapier-notes-cal-name', day.toLocaleDateString(undefined, {weekday: 'narrow'})); name.setAttribute('aria-hidden', 'true'); grid.appendChild(name);
		}
		const start = new Date(draft.sy, draft.sm, 1), days = new Date(draft.sy, draft.sm + 1, 0).getDate();
		const today = new Date(); today.setHours(0, 0, 0, 0);
		for (let i = (start.getDay() - first + 7) % 7; i > 0; i--) grid.appendChild(_rapierNotesEl('div', 'rapier-notes-cal-day rapier-notes-cal-day--out'));
		for (let d = 1; d <= days; d++) {
			const when = new Date(draft.sy, draft.sm, d);
			const chosen = draft.y === draft.sy && draft.m === draft.sm && draft.d === d;
			const b = _rapierNotesEl('button', 'rapier-notes-cal-day' + (chosen ? ' rapier-notes-cal-day--on' : '') + (when.getTime() === today.getTime() ? ' rapier-notes-cal-day--today' : ''), String(d));
			b.type = 'button'; b.tabIndex = -1; b.setAttribute('aria-pressed', String(chosen)); b.setAttribute('aria-label', when.toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}));
			b.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Home End PageUp PageDown Shift+PageUp Shift+PageDown');
			if (when.getTime() === today.getTime()) b.setAttribute('aria-current', 'date');
			b.dataset.notesDay = draft.sy + '-' + String(draft.sm + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
			if (when < today) b.disabled = true;
			else b.addEventListener('click', () => { draft.y = draft.sy; draft.m = draft.sm; draft.d = d; redraw(); });
			grid.appendChild(b);
		}
		const daysInView = [...grid.querySelectorAll('button:not([disabled])')];
		const stop = daysInView.find(day => day.dataset.notesDay === (focusDay || previous)) || daysInView.find(day => day.getAttribute('aria-pressed') === 'true') || daysInView[0];
		if (stop) stop.tabIndex = 0;
		if (focusDay) stop?.focus({preventScroll: true}); else keepFocus();
		say();
	}
	paint();
	return box;
}
function _rapierNotesSheetClear() {
	const sheet = _rapierNotes.sheet, announcer = sheet.querySelector('[data-rapier-announcer]');
	sheet.replaceChildren(...(announcer ? [announcer] : []));
}
function _rapierNotesSheetShow(label, context = '') {
	const state = _rapierNotes, sheet = state.sheet;
	sheet.setAttribute('aria-label', label);
	if (context) {
		const description = _rapierNotesEl('p', 'sr-only', context); description.id = 'rapier-notes-sheet-context';
		sheet.appendChild(description); sheet.setAttribute('aria-describedby', description.id);
	} else sheet.removeAttribute('aria-describedby');
	sheet.classList.add('rapier-notes-sheet--open'); sheet.inert = false;
	if (!state.sheetRelease) state.sheetRelease = _rapierInstallModalIsolation(sheet);
	_rapierNotesScrim(true);
}
function _rapierNotesSheetRelease() {
	const state = _rapierNotes;
	state.sheetRelease?.(); state.sheetRelease = null;
	state.sheet?.removeAttribute('aria-busy');
	for (const opener of state.surface?.querySelectorAll('[aria-controls="rapier-notes-sheet"]') || []) opener.setAttribute('aria-expanded', 'false');
}
function _rapierNotesOpenSheet(file, mode) {
	const state = _rapierNotes, M = _rapierNotesModel(), previousMode = state.sheetMode;
	if (file) { if (!state.selected.has(file)) { state.selected.add(file); _rapierNotesSelect(file, false); return; } }
	const files = [...state.selected].filter(f => state.index.notes[f]);
	const aboutNoNote = ['section-edit', 'section-add'].includes(mode || state.sheetMode);
	if (!files.length && !aboutNoNote) { _rapierNotesCloseSheet(); return; }
	if (mode) {
		const at = document.activeElement;
		if (at && state.surface?.contains(at)) { state.sheetFocus = true; if (!state.sheet.classList.contains('rapier-notes-sheet--open')) state.sheetOpener = at; }
		state.sheetMode = mode;
	}
	_rapierNotesSnackHide();
	if (state.popup) { state.popup = null; state.fab?.setAttribute('aria-expanded', 'false'); state.surface.querySelector('[data-notes-act="menu"]')?.setAttribute('aria-expanded', 'false'); }
	const sheet = state.sheet, wasOpen = sheet.classList.contains('rapier-notes-sheet--open');
	const focused = sheet.contains(document.activeElement), keepFocus = _rapierNotesKeepFocus(sheet);
	_rapierNotesSheetClear();
	const entries = files.map(f => state.index.notes[f]), every = key => entries.every(e => e[key]);
	const button = (act, word, className = 'rapier-notes-btn', icon = RAPIER_NOTES_ROW_ICONS[act]) => {
		const b = _rapierNotesEl('button', className, word); b.type = 'button'; b.dataset.notesAct = act;
		if (icon && className === 'rapier-notes-btn') b.insertBefore(_rapierNotesIcon(icon), b.firstChild);
		return b;
	};
	const asDocument = [['open-document', 'Open as document'], ['share', 'Share']];
	if (state.sheetMode === 'colour') {
		const worn = entries.every(e => e.colour === entries[0].colour) ? entries[0].colour : null;
		const row = _rapierNotesEl('div', 'rapier-notes-swatches'); row.setAttribute('role', 'radiogroup'); row.setAttribute('aria-label', 'colour');
		for (const colour of M.NOTE_COLOURS) {
			const b = _rapierNotesEl('button', 'rapier-notes-swatch' + (colour ? ' rapier-notes-tint-' + colour : ' rapier-notes-swatch--none')); b.type = 'button'; b.dataset.notesAct = 'colour-pick'; b.dataset.notesColour = colour;
			b.setAttribute('role', 'radio'); b.setAttribute('aria-label', colour || 'no colour'); b.setAttribute('aria-checked', String(colour === worn));
			row.appendChild(b);
		}
		sheet.appendChild(row);
	} else if (state.sheetMode === 'section') {
		const own = (state.index.sections || []).map(x => x.name);
		const worn = entries.every(e => (e.category || '') === (entries[0].category || '')) ? (entries[0].category || '') : null;
		const rows = _rapierNotesEl('div', 'rapier-notes-section-rows'); rows.setAttribute('role', 'radiogroup'); rows.setAttribute('aria-label', 'section');
		const skills = _rapierNotesSkillsWanted(), allSkill = skills && entries.every(e => e.skill);
		const row = (act, word, on) => {
			const b = button(act, word, 'rapier-notes-btn', RAPIER_NOTES_ICONS.folder);
			b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(on)); rows.appendChild(b);
			return b;
		};
		for (const id of _rapierNotesSectionIds()) {
			if (id === 'skills') { if (skills) row('skill', 'Skills', !!allSkill); continue; }
			if (id !== 'others' && !own.includes(id)) continue;
			const name = id === 'others' ? '' : id;
			row('section-pick', name || 'Other', !allSkill && name === worn).dataset.notesSectionName = name;
		}
		const form = _rapierNotesEl('form', 'rapier-notes-label-form');
		const input = _rapierNotesEl('input', 'rapier-notes-search'); input.type = 'text'; input.placeholder = 'New section'; input.maxLength = 48; input.autocomplete = 'off'; input.setAttribute('aria-label', 'new section');
		const add = button('section-new', 'Add'); add.type = 'submit';
		form.append(input, add);
		form.addEventListener('submit', evt => { evt.preventDefault(); void _rapierNotesAct('section-new', input.value); });
		sheet.append(rows, form);
	} else if (state.sheetMode === 'section-add') {
		const form = _rapierNotesEl('form', 'rapier-notes-label-form');
		const input = _rapierNotesEl('input', 'rapier-notes-search'); input.type = 'text'; input.placeholder = 'New section'; input.maxLength = 48; input.autocomplete = 'off'; input.setAttribute('aria-label', 'new section');
		const add = button('section-add', 'Add'); add.type = 'submit';
		form.append(input, add);
		form.addEventListener('submit', evt => { evt.preventDefault(); void _rapierNotesAct('section-add', input.value); });
		sheet.appendChild(form);
	} else if (state.sheetMode === 'section-edit') {
		const form = _rapierNotesEl('form', 'rapier-notes-label-form');
		const input = _rapierNotesEl('input', 'rapier-notes-search'); input.type = 'text'; input.value = String(state.sheetSection || ''); input.maxLength = 48; input.autocomplete = 'off'; input.setAttribute('aria-label', 'section name');
		const rename = button('section-rename', 'Rename'); rename.type = 'submit';
		form.append(input, rename);
		form.addEventListener('submit', evt => { evt.preventDefault(); void _rapierNotesAct('section-rename', input.value); });
		sheet.append(form, button('section-delete', 'Delete section'));
	} else if (state.sheetMode === 'remind') {
		for (const choice of M.remindChoices(Date.now())) {
			const b = button('remind-pick', choice.label + ' ' + _rapierNotesClockWords(choice.at));
			b.dataset.notesRemindAt = String(choice.at);
			sheet.appendChild(b);
		}
		sheet.appendChild(_rapierNotesRemindPicker(entries[0], button));
		if (entries.some(e => e.remind)) {
			const worn = entries.every(e => (e.remind?.repeat || '') === (entries[0].remind?.repeat || '')) ? (entries[0].remind?.repeat || '') : null;
			const repeatLabel = _rapierNotesEl('div', 'rapier-notes-remind-label', 'Repeat');
			sheet.appendChild(repeatLabel);
			if (state.remindReveal) { state.remindReveal = false; requestAnimationFrame(() => requestAnimationFrame(() => { try { sheet.scrollTo({top: sheet.scrollHeight}); } catch (_) {} })); }
			const chips = _rapierNotesEl('div', 'rapier-notes-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'repeat');
			for (const [value, word] of [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]) {
				const b = button('remind-repeat', word, 'rapier-notes-chip' + (value === worn ? ' rapier-notes-chip--worn' : '')); b.dataset.notesRepeat = value;
				b.setAttribute('aria-pressed', String(value === worn));
				chips.appendChild(b);
			}
			sheet.append(chips);
			_rapierNotesReminderFields(sheet, entries);
			sheet.appendChild(button('remind-remove', 'Remove reminder'));
		}
	} else if (state.sheetMode === 'add') {
		sheet.appendChild(button('boxes', (typeof _rapierTodoBoxesWord === 'function' && _rapierTodoBoxesWord()) || 'Show tick boxes'));
		for (const [kind, word] of [['drawing', 'Drawing'], ['picture', 'Add image'], ['photo', 'Take photo'], ['recording', 'Recording'], ['attachment', 'Add file'], ['files', 'Saved files']]) {
			const b = button('add-kind', word, 'rapier-notes-btn', RAPIER_NOTES_ADD_ICONS[kind]); b.dataset.notesAdd = kind;
			sheet.appendChild(b);
		}
	} else if (state.sheetMode === 'history') {
		const rows = state.historyRows;
		if (!rows || !rows.length) sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', rows === null ? 'This note\'s past could not be read.' : 'Nothing in this note\'s past yet: each save adds to it.'));
		else for (const row of rows) {
			const b = button('history-put', _rapierNotesWhen(row.time) + (row.current ? '  ·  now' : '') + '  ·  ' + _rapierNotesReasonWords(row.reason, row.first) + '  ·  ' + _rapierNotesBytesWords(row.size) + (row.preview ? '  ·  ' + row.preview : ''));
			b.dataset.notesVersion = String(row.id);
			if (row.current) { b.disabled = true; b.setAttribute('aria-current', 'true'); }
			sheet.appendChild(b);
		}
		const tidied = state.historyTidied;
		if (tidied) sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', tidied.count.toLocaleString('en') + (tidied.count === 1 ? ' older version was' : ' older versions were') + ' tidied away' + (tidied.at ? ', last on ' + _rapierNotesWhen(tidied.at) : '') + '.'));
	} else if (state.sheetMode === 'version') {
		const one = state.historyOne;
		if (!one) sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', 'That version could not be read.'));
		else {
			sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', _rapierNotesWhen(one.time) + '  ·  ' + _rapierNotesReasonWords(one.reason, one.first) + '  ·  ' + _rapierNotesBytesWords(one.size)));
			sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', one.words));
			for (const line of one.lines) {
				const row = _rapierNotesEl('div', 'rapier-notes-diff-line', line.text);
				row.dataset.notesDiff = line.op;
				row.prepend(_rapierNotesEl('span', 'sr-only', line.op === 'add' ? 'Added: ' : 'Removed: '));
				sheet.appendChild(row);
			}
			if (one.more > 0) sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', 'and ' + one.more.toLocaleString('en') + (one.more === 1 ? ' more line' : ' more lines') + ' not shown here'));
			if (!one.current) { const b = button('history-restore', 'Put these words back'); b.dataset.notesVersion = String(one.id); sheet.appendChild(b); }
		}
	} else if (state.sheetMode === 'tags') {
		const tags = _rapierNotesTagsOf(files[0]);
		if (!tags.length) sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', 'This note has no tags. A tag is written into the note itself, so it travels with the file.'));
		else for (const tag of tags) { const b = button('tag-remove', '#' + tag); b.dataset.notesTag = tag; sheet.appendChild(b); }
		const form = _rapierNotesEl('form', 'rapier-notes-label-form');
		const input = _rapierNotesEl('input', 'rapier-notes-search'); input.type = 'text'; input.placeholder = 'Add a tag'; input.maxLength = 48; input.autocomplete = 'off'; input.setAttribute('aria-label', 'new tag');
		const add = button('tag-add', 'Add', 'rapier-notes-btn', null); add.type = 'submit';
		form.append(input, add);
		form.addEventListener('submit', evt => { evt.preventDefault(); void _rapierNotesAct('tag-add', input.value); });
		sheet.appendChild(form);
	} else if (state.sheetMode === 'connections') {
		if (typeof _rapierNotesLibraryConnectionsFace === 'function') _rapierNotesLibraryConnectionsFace(sheet, files[0]);
	} else if (state.compose) {
		for (const [act, word, icon] of [['copy', 'Duplicate'], ...asDocument, ['section-face', 'Section'], ['colour', 'Colour'], ['find-note', 'Find in note'], ['archive', every('archived') ? 'Unarchive' : 'Archive'], ['connections', 'Connections'], ['tags-face', 'Tags'], ['history-face', 'History']]) sheet.appendChild(button(act, word, undefined, icon));
		if (typeof _rapierTodoHasChecks === 'function' && _rapierTodoHasChecks()) {
			sheet.append(button('uncheck-all', 'Uncheck all'), button('delete-checked', 'Delete checked items'));
		}
		{ const del = button('trash', 'Delete', undefined, RAPIER_NOTES_ROW_ICONS.trash); del.dataset.pop = 'destructive'; del.dataset.popBottom = ''; sheet.appendChild(del); }
	} else {
		const acts = every('trashed') ? [['restore', 'Restore'], ['delete-forever', 'Delete forever']]
			: [['section-face', 'Section'], ['archive', every('archived') ? 'Unarchive' : 'Archive'], ['trash', 'Delete']];
		for (const [act, word] of acts) sheet.appendChild(button(act, word));
		if (files.length === 1 && !every('trashed')) for (const [act, word, icon] of [['copy', 'Duplicate'], ...asDocument]) sheet.appendChild(button(act, word, undefined, icon));
	}
	const names = {colour: 'Note colour', section: 'Note section', 'section-add': 'New section', 'section-edit': 'Edit section', remind: 'Reminder', add: 'Add to note', history: 'Note history', version: 'Earlier note version', tags: 'Note tags', connections: 'Note connections'};
	for (const group of sheet.querySelectorAll('[role="radiogroup"]')) {
		const rows = [...group.querySelectorAll('[role="radio"]')], chosen = rows.find(row => row.getAttribute('aria-checked') === 'true') || rows[0];
		for (const row of rows) row.tabIndex = row === chosen ? 0 : -1;
	}
	const context = aboutNoNote ? '' : files.length === 1 ? '1 note selected: ' + (_rapierNotesTitle(files[0]) || files[0]) : files.length + ' notes selected.';
	_rapierNotesSheetShow(names[state.sheetMode] || 'Note actions', context);
	sheet.scrollTop = 0;
	requestAnimationFrame(() => { if (sheet.classList.contains('rapier-notes-sheet--open')) sheet.scrollTop = 0; });
	if (typeof _rapierNotesLibraryBarPaint === 'function') _rapierNotesLibraryBarPaint();
	_rapierNotesHeadPaint();
	if (state.sheetMode === 'tags' && (!wasOpen || previousMode !== 'tags')) { state.sheetFocus = false; sheet.querySelector('input')?.focus({preventScroll: true}); }
	else if (state.sheetFocus || !wasOpen || focused) { state.sheetFocus = false; if (!keepFocus()) (_rapierModalFocusables(sheet)[0] || sheet).focus({preventScroll: true}); }
}
async function _rapierNotesImportsSheet(toggle) {
	const state = _rapierNotes, Receipt = globalThis.RapierNotesImportReceipt, sheet = state.sheet; if (!sheet) return;
	const wasOpen = sheet.classList.contains('rapier-notes-sheet--open'), keepFocus = _rapierNotesKeepFocus(sheet);
	if (!wasOpen) state.sheetOpener = document.activeElement;
	const receipts = Array.isArray(state.index?.imports) ? state.index.imports.slice().reverse() : [], readTurn = (state.importsReadTurn || 0) + 1;
	state.importsReadTurn = readTurn;
	state.importsOpen = toggle === undefined ? null : state.importsOpen === toggle ? null : toggle;
	state.selected.clear(); state.sheetMode = 'imports';
	_rapierNotesSnackHide(); _rapierNotesSheetClear();
	_rapierNotesSheetShow(state.importUndoReview ? 'Undo import' : 'Imports');
	sheet.setAttribute('aria-busy', 'true');
	if (!wasOpen) sheet.focus({preventScroll: true});
	const now = Date.now();
	if (state.importUndoReview) {
		const face = state.importUndoReview.face;
		sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-import-title', face.title));
		sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-import-when', face.summary));
		const rows = _rapierNotesEl('ul', 'rapier-notes-import-lines');
		for (const row of face.rows) rows.appendChild(_rapierNotesEl('li', '', row.text));
		for (const line of face.lines) rows.appendChild(_rapierNotesEl('li', '', line));
		sheet.appendChild(rows);
		const confirm = _rapierNotesEl('button', 'rapier-notes-btn', face.confirm); confirm.type = 'button'; confirm.dataset.notesAct = 'imports-undo-confirm'; confirm.disabled = state.importUndoBusy || !face.canConfirm; sheet.appendChild(confirm);
		const cancel = _rapierNotesEl('button', 'rapier-notes-btn', 'Cancel'); cancel.type = 'button'; cancel.dataset.notesAct = 'imports-undo-cancel'; cancel.disabled = state.importUndoBusy; sheet.appendChild(cancel);
		sheet.setAttribute('aria-busy', 'false'); sheet.scrollTop = 0;
		if (typeof _rapierNotesLibraryBarPaint === 'function') _rapierNotesLibraryBarPaint();
		if (!keepFocus()) (_rapierModalFocusables(sheet)[0] || sheet).focus({preventScroll: true});
		return;
	}
	for (const reference of receipts) {
		let receipt;
		try { receipt = await _rapierNotesStore.folder.readImportReceipt(reference.id); }
		catch (error) {
			if (state.sheetMode !== 'imports' || state.importsReadTurn !== readTurn) return;
			sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-import-row', String(error?.message || error))); continue;
		}
		if (state.sheetMode !== 'imports' || state.importsReadTurn !== readTurn) return;
		const face = Receipt.describeImportReceipt(receipt, { now }), id = String(receipt?.id ?? ''), more = face.lines.slice(1), shown = more.length > 0 && state.importsOpen === id;
		const el = _rapierNotesEl(more.length ? 'button' : 'div', (more.length ? 'rapier-notes-btn ' : '') + 'rapier-notes-import-row');
		if (more.length) { el.type = 'button'; el.dataset.notesAct = 'imports-open'; el.dataset.notesReceipt = id; el.setAttribute('aria-expanded', String(shown)); }
		el.append(_rapierNotesEl('span', 'rapier-notes-import-title', face.title), _rapierNotesEl('span', 'rapier-notes-import-when', face.when + ' · ' + face.lines[0]));
		sheet.appendChild(el);
		if (shown) { const list = _rapierNotesEl('ul', 'rapier-notes-import-lines'); for (const line of more) list.appendChild(_rapierNotesEl('li', '', line)); sheet.appendChild(list); }
		if (face.undo?.eligible || reference.journal && receipt.written?.length) { const undo = _rapierNotesEl('button', 'rapier-notes-btn', 'Undo import'); undo.type = 'button'; undo.dataset.notesAct = 'imports-undo-review'; undo.dataset.notesReceipt = id; undo.disabled = state.importUndoBusy; sheet.appendChild(undo); }
	}
	sheet.setAttribute('aria-busy', 'false');
	sheet.scrollTop = 0;
	requestAnimationFrame(() => { if (sheet.classList.contains('rapier-notes-sheet--open')) sheet.scrollTop = 0; });
	if (typeof _rapierNotesLibraryBarPaint === 'function') _rapierNotesLibraryBarPaint();
	if (!keepFocus() && (document.activeElement === sheet || document.activeElement === document.body)) (_rapierModalFocusables(sheet)[0] || sheet).focus({preventScroll: true});
}
async function _rapierNotesImportUndoReview(id) {
	const state = _rapierNotes;
	if (state.importUndoBusy) return;
	state.importUndoBusy = true;
	try {
		await _rapierNotesFlush();
		await _rapierNotesStore.kind();
		const receipt = (state.index.imports || []).find(row => row.id === id);
		if (!receipt) throw new Error('This import record is no longer in the folder.');
		const preview = await _rapierNotesStore.folder.previewImportUndo(receipt, {keep: state.current ? [state.current] : []});
		state.importUndoReview = {receipt: preview.receipt, files: preview.plan.remove.slice(), face: globalThis.RapierNotesImportUndoFace.describeImportUndo(preview.receipt, preview.plan)};
	} catch (error) {
		state.importUndoReview = null;
		showToast(String(error?.message || 'Import Undo could not be checked. Reopen Notes and try again.'), 'error');
	} finally { state.importUndoBusy = false; _rapierNotesImportsSheet(); }
}
async function _rapierNotesImportUndoConfirm() {
	const state = _rapierNotes, review = state.importUndoReview;
	if (state.importUndoBusy || !review?.face.canConfirm) return;
	state.importUndoBusy = true;
	let outcome = null;
	try {
		await _rapierNotesFlush();
		await _rapierNotesStore.kind();
		outcome = await _rapierNotesStore.folder.undoImport(review.receipt, {files: review.files, keep: state.current ? [state.current] : []});
		_rapierNotesTake(outcome);
	} catch (error) {
		showToast('Import Undo did not finish. Reopen Notes to check the folder before trying another action.', 'error');
	} finally { state.importUndoBusy = false; }
	if (!outcome) { state.importUndoReview = null; _rapierNotesImportsSheet(); return; }
	for (const file of outcome.result.removed) {
		state.texts.delete(file); state.titles.delete(file); state.sizes?.delete?.(file); state.readFailed.delete(file); state.attempted.delete(file); state.attemptedLedger.delete(file); state.hold.delete(file); state.opened.delete(file); state.untitled.delete(file);
		if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file, true);
	}
	let historyFailed = 0;
	for (const row of outcome.history || []) {
		try { const text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(row.bytes); if (!await _rapierNotesRecordVersion({file: row.file, text, entry: row.entry, reason: row.reason})) historyFailed++; }
		catch (error) { historyFailed++; console.warn('[rapier] import undo history', error); }
	}
	const r = outcome.result;
	showToast(r.alreadyUndone ? 'This import was already undone; nothing else was removed.' : r.removed.length ? (r.removed.length === 1 ? 'One note removed' : r.removed.length + ' notes removed') + (r.kept.length ? '; ' + r.kept.length + ' kept' : '') + '.' : 'Undo recorded; no notes removed.', 'info');
	if (historyFailed) showToast('Import Undo is recorded, but ' + historyFailed + (historyFailed === 1 ? ' history entry' : ' history entries') + ' could not be saved. Keep the source export.', 'error');
	state.importUndoReview = null;
	_rapierNotesRender(); _rapierNotesImportsSheet();
}
function _rapierNotesScrim(on) {
	const el = _rapierNotes.popupEl; if (!el) return;
	el.replaceChildren(); el.hidden = !on;
	if (!on) { el.classList.remove('rapier-notes-popup--up'); return; }
	requestAnimationFrame(() => { if (!el.hidden) el.classList.add('rapier-notes-popup--up'); });
}
function _rapierNotesHideSheet() {
	const state = _rapierNotes, sheet = state.sheet;
	if (!sheet || !sheet.classList.contains('rapier-notes-sheet--open')) return false;
	if (state.importUndoBusy) return false;
	if (state.popup) { _rapierNotesPopup(null); return true; }
	if (!state.selected.size || state.compose) { _rapierNotesCloseSheet(); return true; }
	const last = [...state.selected].pop(), focusWasInSheet = !!(document.activeElement && sheet.contains(document.activeElement));
	_rapierNotesSheetRelease(); sheet.classList.remove('rapier-notes-sheet--open'); sheet.inert = true; _rapierNotesScrim(false);
	const opener = state.sheetOpener?.isConnected && !state.sheetOpener.closest('[inert]') && state.sheetOpener.getClientRects().length ? state.sheetOpener : null; state.sheetOpener = null;
	if (focusWasInSheet) (opener || last && state.surface.querySelector('[data-notes-file="' + CSS.escape(last) + '"]') || state.surface)?.focus({ preventScroll: true });
	_rapierNotesHeadPaint();
	return true;
}
function _rapierNotesCloseSheet() {
	const state = _rapierNotes, last = [...state.selected].pop(), active = document.activeElement;
	const focusWasInSheet = !!(state.sheet && active && state.sheet.contains(active));
	const focusWasInSelection = !!active?.closest?.('.rapier-notes-selbar');
	if (state.importUndoBusy) return;
	state.importUndoReview = null;
	state.selected.clear(); state.sheetMode = 'actions'; state.remindDraft = null;
	_rapierNotesSheetRelease();
	if ((focusWasInSheet || focusWasInSelection) && state.open) {
		const card = last ? state.surface.querySelector('[data-notes-file="' + CSS.escape(last) + '"]') : null;
		const opener = state.sheetOpener?.isConnected && !state.sheetOpener.closest('[inert]') && state.sheetOpener.getClientRects().length && !state.sheetOpener.closest('.rapier-notes-selbar') ? state.sheetOpener : null;
		(opener || card || state.surface)?.focus({preventScroll: true});
	}
	for (const el of state.surface?.querySelectorAll('.rapier-notes-card--selected') || []) { el.classList.remove('rapier-notes-card--selected'); el.setAttribute('aria-describedby', 'rapier-notes-card-help'); }
	if (state.sheet) { state.sheet.inert = true; state.sheet.classList.remove('rapier-notes-sheet--open'); } _rapierNotesScrim(false);
	if (typeof _rapierNotesLibraryBarPaint === 'function') _rapierNotesLibraryBarPaint();
	if (state.compose) {
		state.compose = false;
		state.surface?.classList.remove('rapier-notes-surface--over');
		const kebab = document.getElementById('btn-notes-kebab');
		kebab?.setAttribute('aria-expanded', 'false');
		document.getElementById('btn-notes-plus')?.setAttribute('aria-expanded', 'false');
		document.getElementById('btn-notes-remind')?.setAttribute('aria-expanded', 'false');
		if (!state.open && state.surface) { state.surface.hidden = true; _rapierNotesFence(false); if (focusWasInSheet) (state.sheetOpener || kebab)?.focus({ preventScroll: true }); }
	}
	state.sheetOpener = null;
	_rapierNotesHeadPaint();
}
function _rapierNotesSnack(message, undo) {
	const state = _rapierNotes, model = _rapierNotesNoticeModel(), life = model.life;
	_rapierNotesSnackHide();
	const el = _rapierNotesEl('div', 'rapier-notes-snack'); el.setAttribute('role', 'status'); el.dataset.noticeView = 'notes';
	el.appendChild(_rapierNotesEl('span', '', message));
	const b = _rapierNotesEl('button', 'rapier-notes-btn', 'Undo'); b.type = 'button'; b.dataset.notesAct = 'undo'; el.appendChild(b);
	state.surface.appendChild(el); _rapierNotesSnackSwipe(el);
	const transient = life && life.createTransient({
		id: 'notes-snack-' + Date.now().toString(36),
		action: {label: 'Undo', operationId: 'notes-undo:' + String(message || 'undo')},
	});
	state.snack = {el, undo, message, transient, kind: 'undo'};
	requestAnimationFrame(() => { el.classList.add('rapier-notes-snack--open'); _rapierNotesSnackPlace(); });
}
function _rapierNotesSnackSwipe(el) {
	const state = _rapierNotes;
	_rapierNoticeSwipe(el, {
		ready: () => state.snack?.el === el && state.snack.transient?.phase !== 'running',
		lift: 'var(--rapier-notes-snack-lift, 0px)',
		dismiss: direction => {
			const snack = state.snack, life = _rapierNotesNoticeModel().life;
			if (snack?.el !== el) return false;
			if (snack.transient && life) {
				const result = life.stepTransient(snack.transient, {type:'dismiss', nowMs:performance.now()});
				if (result.error) return false;
				snack.transient = result.state;
			}
			_rapierNoticeExit(el, direction, () => { if (state.snack?.el === el) _rapierNotesSnackHide(); else el.remove(); });
		},
	});
}
function _rapierNotesSnackHide() {
	const state = _rapierNotes, snack = state.snack; if (!snack) return;
	const model = _rapierNotesNoticeModel();
	if (snack.transient && model.life) {
		snack.transient = model.life.stepTransient(snack.transient, {type: 'dismiss', nowMs: performance.now()}).state;
	}
	clearTimeout(snack.timer); snack.el.remove(); state.snack = null;
}
function _rapierNotesSnackPlace() {
	const state = _rapierNotes, snack = state.snack, model = _rapierNotesNoticeModel();
	if (!snack?.el || !state.surface || !model.occlusion || !model.surfaces?.inventory) return;
	const surfaceBox = state.surface.getBoundingClientRect();
	if (!(surfaceBox.width > 0 && surfaceBox.height > 0)) return;
	const el = snack.el;
	const height = el.offsetHeight, width = el.offsetWidth;
	if (!(height > 0 && width > 0)) return;
	const bottomCss = parseFloat(getComputedStyle(el).bottom) || 0;
	const natural = {
		left: surfaceBox.left + (parseFloat(getComputedStyle(el).left) || 0),
		right: surfaceBox.left + (parseFloat(getComputedStyle(el).left) || 0) + width,
		bottom: surfaceBox.bottom - bottomCss,
		top: surfaceBox.bottom - bottomCss - height,
	};
	natural.right = natural.left + width;
	const skip = new Set(['toast-container', 'notes-snack', 'notes-surface']);
	const surfaces = [];
	for (const decl of model.surfaces.inventory.surfaces) {
		if (skip.has(decl.id) || decl.file !== 'editor/styles/rapier-notes.css') continue;
		if (!decl.selector || decl.selector.includes('::')) continue;
		let matches;
		try { matches = state.surface.querySelectorAll(decl.selector); }
		catch (_) { continue; }
		for (const node of matches) {
			if (node === el || node.closest('[hidden]') || node === state.surface) continue;
			if (decl.id === 'notes-sheet' && !node.classList.contains('rapier-notes-sheet--open')) continue;
			const box = node.getBoundingClientRect();
			if (!(box.width > 0 && box.height > 0)) continue;
			const style = getComputedStyle(node);
			if (style.display === 'none' || style.visibility === 'hidden') continue;
			if (decl.interactive !== true) continue;
			if (style.pointerEvents === 'none' && (style.opacity === '0' || parseFloat(style.opacity) === 0)) continue;
			surfaces.push({id: decl.id + (matches.length > 1 ? ':' + surfaces.length : ''), role: decl.role, interactive: true, rect: {left: box.left, top: box.top, right: box.right, bottom: box.bottom}, ...(decl.on ? {on: decl.on} : {})});
		}
	}
	const viewport = {left: surfaceBox.left, top: surfaceBox.top, right: surfaceBox.right, bottom: surfaceBox.bottom};
	const result = model.occlusion.placeTransient({viewport, surfaces, transient: {rect: natural}});
	const waiting = result.status !== 'placed';
	if (waiting) {
		el.dataset.rapierTransientState = 'waiting';
		el.inert = true;
	} else {
		delete el.dataset.rapierTransientState;
		el.inert = false;
		const lift = Math.max(0, Math.round(natural.top - result.rect.top));
		if (el.style.getPropertyValue('--rapier-notes-snack-lift') !== lift + 'px') {
			el.style.setProperty('--rapier-notes-snack-lift', lift + 'px');
		}
	}
	if (snack.transient && model.life) {
		const box = el.getBoundingClientRect();
		const x = (box.left + box.right) / 2, y = (box.top + box.bottom) / 2;
		const hit = document.elementFromPoint(x, y);
		const reachable = !waiting && !!(hit && (hit === el || el.contains(hit)));
		snack.transient = model.life.stepTransient(snack.transient, {
			type: 'measure', nowMs: performance.now(),
			status: waiting ? 'wait' : 'placed', epoch: 0, measuredEpoch: 0, reachable,
		}).state;
	}
}
async function _rapierNotesSnackActivate(act) {
	const state = _rapierNotes, snack = state.snack, model = _rapierNotesNoticeModel();
	if (!snack) return;
	_rapierNotesSnackPlace();
	const btn = snack.el?.querySelector('[data-notes-act="' + act + '"]');
	if (btn) {
		const box = btn.getBoundingClientRect();
		const hit = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
		if (!(hit && (hit === btn || btn.contains(hit)))) return;
	}
	if (snack.kind === 'undo' && snack.transient && model.life && snack.transient.action) {
		const started = model.life.stepTransient(snack.transient, {
			type: 'activate', nowMs: performance.now(), epoch: 0, reachable: true,
		});
		snack.transient = started.state;
		if (!started.effect) return;
		const entries = Array.isArray(snack.undo) ? snack.undo : [];
		const kept = entries.map(was => [was.file, state.index.notes[was.file] ? {...state.index.notes[was.file]} : null]);
		let again = null;
		try {
			if (!snack.undo) throw new Error('nothing to undo');
			if (typeof snack.undo === 'function') again = snack.undo();
			else for (const was of entries) { const entry = state.index.notes[was.file]; if (entry) Object.assign(entry, was.fields); }
			await _rapierNotesWriteIndex();
			snack.transient = model.life.stepTransient(snack.transient, {type: 'settle', nowMs: performance.now(), ticket: started.effect.ticket, ok: true}).state;
			const el = snack.el;
			_rapierNotesSnackHide();
			if (typeof _rapierNotesLibraryTouch === 'function') for (const was of entries) _rapierNotesLibraryTouch(was.file);
			_rapierNotesRender();
			el?.remove();
			return;
		} catch (error) {
			for (const [f, e] of kept) if (e && state.index.notes[f]) Object.assign(state.index.notes[f], e);
			if (typeof again === 'function') { again(); _rapierNotesRender(); }
			snack.transient = model.life.stepTransient(snack.transient, {
				type: 'settle', nowMs: performance.now(), ticket: started.effect.ticket, ok: false, error: String(error?.message || error),
			}).state;
			const msg = snack.el?.querySelector('span');
			if (msg) msg.textContent = String(snack.message || 'Undo') + ' — ' + String(error?.message || error);
			showToast('The undo was not written to the notes folder: ' + String(error?.message || error), 'error');
			return;
		}
	}
}
function _rapierNotesRemindTick() {
	const state = _rapierNotes, M = _rapierNotesModel();
	if (!_rapierNotesIsApp() || !state.open || !state.index) return;
	const due = M.dueReminders(state.index, Date.now());
	const showing = state.snack?.kind === 'remind' ? state.snack.file : null;
	const waiting = new Set(state.remindQueue);
	for (const file of due) if (file !== showing && !waiting.has(file)) state.remindQueue.push(file);
	_rapierNotesRemindPump();
	_rapierNotesRemindSync();
}
function _rapierNotesRemindPump() {
	const state = _rapierNotes;
	if (state.snack || !state.remindQueue.length) return;
	const file = state.remindQueue.shift();
	if (!state.index.notes[file]) { _rapierNotesRemindPump(); return; }
	_rapierNotesRemindSnack(file);
}
function _rapierNotesRemindSnack(file) {
	const state = _rapierNotes, M = _rapierNotesModel(), model = _rapierNotesNoticeModel();
	_rapierNotesSnackHide();
	const title = _rapierNotesTitle(file) || file.replace(/\.md$/i, '');
	const el = _rapierNotesEl('div', 'rapier-notes-snack'); el.setAttribute('role', 'status'); el.dataset.noticeView = 'notes';
	el.appendChild(_rapierNotesEl('span', '', title));
	const open = _rapierNotesEl('button', 'rapier-notes-btn', 'Open'); open.type = 'button'; open.dataset.notesAct = 'remind-open';
	const done = _rapierNotesEl('button', 'rapier-notes-btn', 'Done'); done.type = 'button'; done.dataset.notesAct = 'remind-done';
	const snooze = _rapierNotesEl('button', 'rapier-notes-btn', 'Snooze'); snooze.type = 'button'; snooze.dataset.notesAct = 'remind-snooze';
	el.append(open, done, snooze);
	state.surface.appendChild(el);
	const transient = model.life ? model.life.createTransient({id: 'notes-remind-' + file, durationMs: null}) : null;
	state.snack = { el, kind: 'remind', file, transient, reminderTargets: [{file, id: state.index.notes[file]?.id, remind: JSON.stringify(M.cleanRemind(state.index.notes[file]?.remind))}] };
	_rapierNotesSnackSwipe(el);
	requestAnimationFrame(() => { el.classList.add('rapier-notes-snack--open'); _rapierNotesSnackPlace(); });
}
globalThis.__rapierNotesRemindTick = () => _rapierNotesRemindTick();
async function _rapierNotesSectionEdit(act, arg) {
	const state = _rapierNotes, M = _rapierNotesModel(), from = state.sheetSection; if (!from || !state.index) return;
	let undo, snack = '';
	if (act === 'section-rename') {
		const to = M.cutText(String(arg || '').trim().replace(/\s+/g, ' '), 48);
		if (!to || to === from) { _rapierNotesHideSheet(); return; }
		const renamed = M.renameSection(state.index, from, to);
		if (renamed === state.index) { showToast('That section name cannot be used: it is empty, taken, or one of the built-in words.', 'info'); return; }
		state.index = Array.isArray(renamed.sectionOrder) ? {...renamed, sectionOrder: renamed.sectionOrder.map(id => id === from ? to : id)} : renamed;
		if (state.reorderWasClosed && from in state.reorderWasClosed) { state.reorderWasClosed[to] = state.reorderWasClosed[from]; delete state.reorderWasClosed[from]; }
		undo = () => {
			state.index = M.renameSection(state.index, to, from);
			if (Array.isArray(state.index.sectionOrder)) state.index = {...state.index, sectionOrder: state.index.sectionOrder.map(id => id === to ? from : id)};
			if (state.reorderWasClosed && to in state.reorderWasClosed) { state.reorderWasClosed[from] = state.reorderWasClosed[to]; delete state.reorderWasClosed[to]; }
		};
	} else {
		const count = M.sortedSection(state.index, from).length;
		snack = 'Section "' + from + '" deleted' + (count ? '. ' + (count === 1 ? 'Its note is' : 'Its ' + count + ' notes are') + ' in Other.' : '');
		const at = state.index.sections.findIndex(s => s.name === from), after = state.index.sections[at + 1]?.name || null, row = {...state.index.sections[at]};
		const orderAt = Array.isArray(state.index.sectionOrder) ? state.index.sectionOrder.indexOf(from) : -1;
		const emptied = Object.keys(state.index.notes).filter(file => state.index.notes[file]?.category === from);
		const wasClosed = state.reorderWasClosed?.[from];
		state.index = M.removeSection(state.index, from);
		if (Array.isArray(state.index.sectionOrder)) state.index = {...state.index, sectionOrder: state.index.sectionOrder.filter(id => id !== from)};
		if (state.reorderWasClosed) delete state.reorderWasClosed[from];
		undo = () => {
			const had = state.index.sections.some(s => s.name === from);
			state.index = M.moveSection(M.addSection(state.index, from), from, after);
			if (!had) state.index = {...state.index, sections: state.index.sections.map(s => s.name === from ? {...row} : s)};
			for (const file of emptied) if (state.index.notes[file] && !state.index.notes[file].category) state.index = M.setCategory(state.index, file, from);
			if (orderAt >= 0 && Array.isArray(state.index.sectionOrder) && !state.index.sectionOrder.includes(from)) { const order = state.index.sectionOrder.slice(); order.splice(Math.min(orderAt, order.length), 0, from); state.index = {...state.index, sectionOrder: order}; }
			if (state.reorderWasClosed && wasClosed !== undefined) state.reorderWasClosed[from] = wasClosed;
			return () => {
				state.index = M.removeSection(state.index, from);
				if (Array.isArray(state.index.sectionOrder)) state.index = {...state.index, sectionOrder: state.index.sectionOrder.filter(id => id !== from)};
			};
		};
	}
	const grid = state.grids[from]; if (grid) { delete state.grids[from]; grid.parentElement?.remove(); }
	state.sheetSection = null; _rapierNotesHideSheet();
	_rapierNotesRender();
	try { await _rapierNotesWriteIndex(); }
	catch (error) { undo(); _rapierNotesRender(); showToast('The section change was not written to the notes folder: ' + String(error?.message || error), 'error'); return; }
	if (snack) _rapierNotesSnack(snack, undo);
}
async function _rapierNotesAct(act, arg) {
	if (_rapierNotes.captureToken && !_rapierNotes.capturePreparing && !await _rapierNotesUnlock()) return;
	if (act === 'backup-discard-unfinished') { await _rapierNotesDiscardUnfinishedBackup(); return; }
	if (act === 'backup-cancel') { _rapierNotes.backupController?.abort(new Error('cancelled by the person')); return; }
	if (act === 'backup-export') { await _rapierNotesExportPreparedBackup(); return; }
	if (act === 'backup-export-android') { await _rapierNotesExportAndroidBackup(arg); return; }
	if (act === 'backup-discard') { await _rapierNotesDiscardPreparedBackup(); return; }
	const state = _rapierNotes, M = _rapierNotesModel();
	if (act === 'section-rename' || act === 'section-delete') { await _rapierNotesSectionEdit(act, arg); return; }
	if (act === 'select-clear') { _rapierNotesCloseSheet(); return; }
	if (act === 'imports-open') { _rapierNotesImportsSheet(String(arg ?? '')); return; }
	if (act === 'imports-undo-review') { await _rapierNotesImportUndoReview(String(arg ?? '')); return; }
	if (act === 'imports-undo-confirm') { await _rapierNotesImportUndoConfirm(); return; }
	if (act === 'imports-undo-cancel') { if (!_rapierNotes.importUndoBusy) { _rapierNotes.importUndoReview = null; _rapierNotesImportsSheet(); } return; }
	if (act === 'sheet-actions') { _rapierNotesOpenSheet(null, 'actions'); return; }
	if (act === 'colour') { _rapierNotesOpenSheet(null, 'colour'); return; }
	if (act === 'section-face') { _rapierNotesOpenSheet(null, 'section'); return; }
	if (act === 'remind-face') { if (!_rapierNotesIsApp()) return; state.remindDraft = null; _rapierNotesOpenSheet(null, 'remind'); return; }
	if (act === 'connections') { _rapierNotesOpenSheet(null, 'connections'); return; }
	if (act === 'tags-face') { _rapierNotesOpenSheet(null, 'tags'); return; }
	if (act === 'tag-add') { if (_rapierNotes.current) await _rapierNotesTagAdd(_rapierNotes.current, String(arg ?? '')); return; }
	if (act === 'section-add') { await _rapierNotesSectionAdd(String(arg ?? '')); return; }
	if (act === 'tag-remove') { if (_rapierNotes.current && arg) await _rapierNotesTagRemove(_rapierNotes.current, String(arg)); return; }
	if (act === 'history-face') {
		const file = _rapierNotes.current;
		const read = file ? await _rapierNotesHistoryRead(file) : {kind: 'new', versions: []};
		const firstId = read.versions.reduce((low, v) => Math.min(low, v.id), Infinity);
		const previews = await _rapierNotesHistoryPreviews(read);
		_rapierNotes.historyRows = read.kind === 'unreadable' ? null
			: read.versions.map(v => ({id: v.id, time: v.time, reason: v.reason, size: v.size, current: v.id === read.manifest?.current, first: v.id === firstId, preview: previews.get(v.id) || ''}));
		_rapierNotes.historyTidied = read.tidied ? {count: read.tidied, at: read.tidiedAt} : null;
		_rapierNotesOpenSheet(null, 'history');
		return;
	}
	if (act === 'history-put') {
		const file = _rapierNotes.current, id = Number(arg);
		if (!file || !Number.isSafeInteger(id)) return;
		_rapierNotes.historyOne = await _rapierNotesHistoryOne(file, id);
		_rapierNotesOpenSheet(null, 'version');
		return;
	}
	if (act === 'history-restore') {
		const file = _rapierNotes.current, id = Number(arg);
		_rapierNotesCloseSheet();
		if (file && Number.isSafeInteger(id)) await _rapierNotesHistoryRestore(file, id);
		return;
	}
	if (act === 'add-kind') { const kind = String(arg || ''); _rapierNotesCloseSheet(); if (['drawing', 'picture', 'photo', 'recording', 'attachment', 'files'].includes(kind)) _rapierNotesTrigger(kind); return; }
	if (act === 'find-note') { _rapierNotesCloseSheet(); setTimeout(_rapierNotesFindInNote, 0); return; }
	if (act === 'boxes') { _rapierNotesCloseSheet(); if (typeof _rapierTodoBoxesFlip === 'function') await _rapierTodoBoxesFlip(); return; }
	if (act === 'uncheck-all' || act === 'delete-checked') { _rapierNotesCloseSheet(); if (typeof _rapierTodoBatch === 'function') await _rapierTodoBatch(act); return; }
	if (act === 'undo') {
		await _rapierNotesSnackActivate('undo'); return;
	}
	if (act === 'remind-open') {
		const file = state.snack?.file;
		if (state.snack?.el) {
			const btn = state.snack.el.querySelector('[data-notes-act="remind-open"]');
			if (btn) {
				const box = btn.getBoundingClientRect();
				const hit = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
				if (!(hit && (hit === btn || btn.contains(hit)))) return;
			}
		}
		_rapierNotesSnackHide();
		if (file) await _rapierNotesOpenNote(file);
		_rapierNotesRemindPump(); return;
	}
	if (act === 'remind-done' || act === 'remind-snooze') {
		const snack = state.snack, file = snack?.file;
		if (file && state.index.notes[file]) {
			try {
				await _rapierNotesReminderChange([file], {kind: act === 'remind-done' ? 'done' : 'snooze'}, Date.now(), snack.reminderTargets);
				_rapierNotesSnackHide();
			} catch (error) {
				showToast('The reminder was not written to the notes folder: ' + String(error?.message || error), 'error');
				return;
			}
		} else _rapierNotesSnackHide();
		_rapierNotesRemindPump(); return;
	}
	if ((act === 'trash' || act === 'archive') && state.current && !state.open) {
		const open = state.current;
		_rapierNotesCloseSheet();
		await _rapierNotesOpen();
		if (!state.open || !state.index.notes[open]) return;
		state.selected.clear(); state.selected.add(open);
	}
	const files = [...state.selected].filter(f => state.index.notes[f]); if (!files.length) return;
	if (['remind-pick', 'remind-set', 'remind-repeat', 'remind-remove', 'remind-custom', 'remind-snooze-interval'].includes(act)) {
		try {
			await _rapierNotesReminderEdit(files, act, arg);
			if (act === 'remind-pick' || act === 'remind-remove') _rapierNotesCloseSheet();
			else _rapierNotesOpenSheet(null, 'remind');
		} catch (error) { showToast('The reminder was not written to the notes folder: ' + String(error?.message || error), 'error'); }
		return;
	}
	const entries = files.map(f => state.index.notes[f]), every = key => entries.every(e => e[key]);
	if (act === 'open') { const file = files[0]; _rapierNotesCloseSheet(); await _rapierNotesOpenNote(file); return; }
	if (act === 'open-document') { if (files.length === 1) await _rapierNotesOpenAsDocument(files[0]); return; }
	if (act === 'share') { if (files.length === 1) await _rapierNotesShareAsDocument(files[0]); return; }
	const flight = act === 'pin' ? _rapierNotesPinFlightFrom(files, !every('pinned')) : null;
	const before = files.map(f => ({ file: f, fields: { pinned: state.index.notes[f].pinned, skill: state.index.notes[f].skill, archived: state.index.notes[f].archived, trashed: state.index.notes[f].trashed } }));
	const whole = files.map(f => [f, JSON.parse(JSON.stringify(state.index.notes[f]))]);
	const count = files.length === 1 ? '' : ' ' + files.length;
	let snack = null, reminderAt = null, reminderRemoved = false;
	if (act === 'pin') { const on = !every('pinned'); for (const e of entries) e.pinned = on; }
	else if (act === 'skill') { const on = !every('skill'); for (const e of entries) e.skill = on; if (on && _rapierNotesClosed('skills')) state.index = M.setCollapsed(state.index, 'skills', false); }
	else if (act === 'colour-pick') { const colour = M.NOTE_COLOURS.includes(arg) ? arg : ''; for (const e of entries) e.colour = colour; }
	else if (act === 'section-pick') { for (const f of files) state.index = M.setCategory(state.index, f, String(arg || '')); }
	else if (act === 'section-new') {
		const name = M.cutText(String(arg || '').trim().replace(/\s+/g, ' '), 48); if (!name) return;
		const grown = M.addSection(state.index, name);
		if (grown === state.index || !(grown.sections || []).some(x => x.name === name)) { showToast('That section name cannot be used: it is empty, taken, or one of the built-in words.', 'info'); return; }
		state.index = grown;
		for (const f of files) state.index = M.setCategory(state.index, f, name);
	}
	else if (act === 'remind-pick' || act === 'remind-set') {
		const at = act === 'remind-pick' ? Number(arg) : _rapierNotesParseLocalDateTime(arg);
		if (!Number.isFinite(at)) return;
		for (const f of files) state.index = M.setRemind(state.index, f, { at });
		reminderAt = at;
		if (act === 'remind-set') state.remindReveal = true;
	}
	else if (act === 'remind-repeat') {
		for (const f of files) {
			const cur = state.index.notes[f]?.remind; if (!cur) continue;
			state.index = M.setRemind(state.index, f, { at: cur.at, repeat: cur.repeat === arg ? undefined : arg });
		}
	}
	else if (act === 'remind-remove') { for (const f of files) state.index = M.setRemind(state.index, f, null); reminderRemoved = true; }
	else if (act === 'copy') {
		const file = files[0]; let text;
		if (file === state.current) {
			const captured = await _rapierWithSettledExternalDocument(() =>
				file === state.current && _rapierNotesDocumentBound() ? _rapierSourceText() : null);
			if (!captured.settled) return;
			text = captured.value;
		}
		if (text == null) text = (await _rapierNotesTexts([file])).get(file);
		if (typeof text !== 'string') { showToast('The note could not be read. No copy was made.', 'error'); return; }
		const names = Object.keys(state.index.notes), from = state.index.notes[file], place = {};
		for (const key of ['pinned', 'skill', 'colour', 'category']) if (from?.[key] !== undefined) place[key] = from[key];
		if (from) place.order = M.orderAfter(from.order);
		const made = await _rapierNotesWriteNew(text, M.noteFileName(text.trim() || 'Note', names), place);
		_rapierNotesAdmit(made, text);
	}
	else if (act === 'archive') { const on = !every('archived'); for (const e of entries) { e.archived = on; e.trashed = false; delete e.trashedAt; delete e.trashDigest; delete e.trashRevision; } snack = (on ? 'Archived' : 'Unarchived') + count; }
	else if (act === 'trash') {
		try {
			const T = globalThis.RapierNotesTrash, H = globalThis.RapierNotesIntegrity;
			if (!T || !H) throw new Error('the Trash model did not load');
			await _rapierNotesStore.settle();
			const proofs = [];
			for (const file of files) proofs.push([file, await H.sha256(new Uint8Array(await (await _rapierNotesStore.file(file)).arrayBuffer()))]);
			const now = Date.now();
			for (const [file, digest] of proofs) state.index = T.markTrashed(state.index, file, {digest, now});
			snack = 'Deleted' + count;
		} catch (error) { showToast('The notes could not be moved to the recycle bin: ' + String(error?.message || error), 'error'); return; }
	}
	else if (act === 'restore') { for (const e of entries) { e.trashed = false; delete e.trashedAt; delete e.trashDigest; delete e.trashRevision; } }
	else if (act === 'delete-forever') {
		try {
			if (typeof rapierConfirm !== 'function') throw new Error('The deletion question could not open. Nothing was removed.');
			const expected = await _rapierNotesDeletionProof(files);
			const sure = await rapierConfirm({ title: files.length === 1 ? 'Delete this note forever?' : 'Delete these ' + files.length + ' notes forever?', message: files.length === 1 ? '• The note and its own recordings are deleted.\n• No undo.' : '• The notes and their own recordings are deleted.\n• No undo.', confirmLabel: 'Delete', secondaryLabel: '', destructive: true });
			if (!sure) return;
			await _rapierNotesDeleteForeverFiles(files, 'confirmed', expected);
		}
		catch (error) { showToast('The change was not written to the notes folder: ' + String(error?.message || error), 'error'); _rapierNotesRender(); return; }
		_rapierNotesCloseSheet(); _rapierNotesRender();
		return;
	}
	const wash = act === 'colour-pick' ? _rapierNotesWashFrom(files) : null;
	if (!wash && !flight) _rapierNotesRender();
	const touchedGroup = ({pin: 'pinned', 'colour-pick': 'colour', 'section-pick': 'section', 'section-new': 'section', archive: 'archiveTrash', trash: 'archiveTrash', restore: 'archiveTrash'})[act];
	const touches = touchedGroup ? files.map(file => ({id: state.index.notes[file].id, groups: [touchedGroup]})) : [];
	try { await _rapierNotesWriteIndex(state.index, state.indexBase, touches); }
	catch (error) {
		for (const [f, e] of whole) if (state.index.notes[f]) state.index.notes[f] = e;
		showToast('The change was not written to the notes folder: ' + String(error?.message || error), 'error');
		_rapierNotesRender(); return;
	}
	if (typeof _rapierNotesLibraryTouch === 'function') for (const f of files) _rapierNotesLibraryTouch(f);
	if (act === 'trash' || act === 'restore') {
		for (const file of files) {
			try {
				const text = state.texts.get(file) ?? await _rapierNotesStore.read(file);
				await _rapierNotesRecordVersion({file, text, entry: state.index.notes[file], reason: act === 'trash' ? 'trash' : 'untrash'});
			} catch (error) { console.warn('[rapier] notes history', error); }
		}
	}
	const stays = act === 'colour-pick' || act === 'section-pick' || act === 'skill' || act === 'section-new' || act === 'remind-set' || act === 'remind-repeat';
	if (!stays) _rapierNotesCloseSheet();
	_rapierNotesRender();
	if (wash) _rapierNotesWash(wash);
	_rapierNotesHeadPaint();
	if (flight) _rapierNotesPinFlight(flight, new Set(files));
	else if ((act === 'pin' && every('pinned')) || act === 'remind-pick' || act === 'remind-set') _rapierNotesFlourish(act === 'pin' ? 'pin' : 'remind', new Set(files));
	if (stays) _rapierNotesOpenSheet();
	if (snack) _rapierNotesSnack(snack, before);
	if (reminderAt != null) await _rapierNotesRemindConfirm(reminderAt, files);
	else if (reminderRemoved) showToast('Reminder removed', 'info');
}
function _rapierNotesFlourish(kind, files, frames = 12) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	const head = frames === 12 && kind !== 'pin' ? [...document.querySelectorAll('#btn-notes-remind svg')] : [];
	const cards = frames > 10 ? [] : [...document.querySelectorAll('.rapier-notes-card')].filter(card => files.has(card.dataset.notesFile) && card.querySelector(kind === 'pin' ? '.rapier-notes-mark' : '.rapier-notes-remind svg'));
	const marks = cards.map(card => card.querySelector(kind === 'pin' ? '.rapier-notes-mark' : '.rapier-notes-remind svg'));
	for (const svg of [...head, ...marks]) {
		if (!svg.getClientRects().length) continue;
		if (kind === 'pin') svg.animate([{transform: 'translate(3px, -3px) scale(1.25)', opacity: 0}, {transform: 'translate(-1px, 1px) scale(.88)', opacity: 1, offset: .45}, {transform: 'translate(.5px, -.5px) scale(1.04)', offset: .75}, {transform: 'none', opacity: 1}], {duration: 420, easing: 'cubic-bezier(.3,0,.2,1)'});
		else svg.animate([0, 18, -14, 10, -6, 3, 0].map(deg => ({transform: 'rotate(' + deg + 'deg)', transformOrigin: '50% 12%'})), {duration: 760, easing: 'ease-out'});
	}
	for (const card of cards) files.delete(card.dataset.notesFile);
	if (files.size && frames > 0) requestAnimationFrame(() => _rapierNotesFlourish(kind, files, frames - 1));
}
function _rapierNotesPinFlightFrom(files, on) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches || !_rapierNotes.surface) return null;
	const places = new Map(), marks = new Map();
	for (const card of document.querySelectorAll('.rapier-notes-card')) {
		const box = card.getBoundingClientRect(); if (!box.width) continue;
		places.set(card.dataset.notesFile, {x: box.left, y: box.top, node: card});
		const mark = !on && files.includes(card.dataset.notesFile) && card.querySelector('.rapier-notes-mark')?.getBoundingClientRect();
		if (mark?.width) marks.set(card.dataset.notesFile, mark);
	}
	if (!places.size) return null;
	const button = on && document.querySelector('#rapier-notes-selbar [data-notes-act="pin"]')?.getBoundingClientRect();
	return {on, places, marks, from: button?.width ? {x: button.left + button.width / 2, y: button.top + button.height / 2} : null};
}
function _rapierNotesPinGlyph(size, opacity) {
	const g = _rapierNotesEl('div', 'rapier-notes-pin-flight'); g.style.width = g.style.height = size + 'px'; g.style.opacity = String(opacity);
	g.appendChild(_rapierNotesGlyph('pin')); _rapierNotes.surface.appendChild(g); return g;
}
const _rapierNotesGone = anim => anim.finished.then(() => anim.effect.target.remove(), () => anim.effect.target.remove());
function _rapierNotesPinFlight(flight, files, frames = 15) {
	const cards = [...document.querySelectorAll('.rapier-notes-card')];
	if (!cards.some(card => files.has(card.dataset.notesFile) && card !== flight.places.get(card.dataset.notesFile)?.node)) {
		if (frames > 0) requestAnimationFrame(() => _rapierNotesPinFlight(flight, files, frames - 1));
		return;
	}
	const targets = flight.on && flight.from ? cards.filter(card => files.has(card.dataset.notesFile)).map(card => card.querySelector('.rapier-notes-mark')).filter(Boolean).map(mark => ({mark, box: mark.getBoundingClientRect()})) : [];
	_rapierNotesMoves(flight.places, files, !flight.on);
	targets.forEach((target, i) => _rapierNotesPinFly(flight.from, target.mark, target.box, i * 90));
	for (const box of flight.marks.values()) {
		const size = box.width, x = box.left, y = box.top, drift = 70;
		const pop = _rapierNotesPinGlyph(size, 1); pop.style.zIndex = '6';
		_rapierNotesGone(pop.animate(Array.from({length: 25}, (_, i) => {
			const u = i / 24;
			return {transform: 'translate(' + (x + drift * u) + 'px,' + (y - 267 * u + 444 * u * u) + 'px) rotate(' + (360 * u + 90 * u * u) + 'deg) scale(' + (1 + .5 * Math.sin(Math.PI * Math.min(1, u * 1.4))) + ')', opacity: u < .6 ? 1 : 1 - (u - .6) / .4};
		}), {duration: 820, easing: 'linear'}));
	}
}
function _rapierNotesMoves(places, chosen, falling) {
	const seen = box => box.bottom > 0 && box.top < innerHeight;
	for (const card of document.querySelectorAll('.rapier-notes-card')) {
		const was = places.get(card.dataset.notesFile); if (!was || was.node === card) continue;
		const box = card.getBoundingClientRect(), dx = was.x - box.left, dy = was.y - box.top;
		if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
		if (!seen(box) && !seen({top: was.y, bottom: was.y + box.height})) continue;
		const grid = getComputedStyle(card).transform, base = grid === 'none' ? '' : ' ' + grid;
		const at = (x, y, turn = 0) => ({transform: 'translate(' + x + 'px,' + y + 'px)' + base + ' rotate(' + turn + 'deg)'});
		const lift = chosen.has(card.dataset.notesFile), done = () => { if (lift) card.style.zIndex = ''; };
		if (lift) card.style.zIndex = '3';
		if (lift && falling && dy < 0) {
			card.animate(Array.from({length: 31}, (_, i) => {
				const u = i / 30;
				if (u <= .78) {
					const v = u / .78, hop = v < .25 ? -9 * Math.sin(Math.PI * v / .25) : 0, x = v < .5 ? 2 * v * v : 1 - (-2 * v + 2) ** 2 / 2;
					return at(dx * (1 - x), dy * (1 - v * v) + hop, 5 * Math.sin(v * Math.PI * 2.5) * (1 - v * .6));
				}
				const w = (u - .78) / .22;
				return at(0, -8 * Math.sin(Math.PI * w) * (1 - .4 * w), -1.5 * Math.sin(Math.PI * w));
			}), {duration: 700, easing: 'linear'}).finished.then(done, done);
		} else card.animate([at(dx, dy), at(0, 0)], {duration: 440, easing: 'cubic-bezier(.2,.9,.25,1)'}).finished.then(done, done);
	}
}
function _rapierNotesPinFly(from, mark, to, delay) {
	const tx = to.left + to.width / 2, ty = to.top + to.height / 2;
	if (!to.width || ty < 0 || ty > innerHeight) return;
	const x0 = from.x, y0 = from.y, size = 24, end = to.width / size, reach = Math.hypot(tx - x0, ty - y0), k = Math.max(60, reach * .38);
	const swing = Math.min(Math.max(x0 - 130, 28), innerWidth - 28);
	const p = [[x0, y0], [swing, y0 + 90 + reach * .12], [tx + k, ty - k], [tx, ty]];
	const at = (t, i) => (1 - t) ** 3 * p[0][i] + 3 * (1 - t) ** 2 * t * p[1][i] + 3 * (1 - t) * t * t * p[2][i] + t ** 3 * p[3][i];
	const slope = (t, i) => 3 * (1 - t) ** 2 * (p[1][i] - p[0][i]) + 6 * (1 - t) * t * (p[2][i] - p[1][i]) + 3 * t * t * (p[3][i] - p[2][i]);
	const place = (x, y, turn, scale) => ({transform: 'translate(' + (x - size / 2) + 'px,' + (y - size / 2) + 'px) rotate(' + turn + 'deg) scale(' + scale + ')'});
	const keys = [{...place(x0, y0, 0, 1), offset: 0}, {...place(x0, y0 + 2, -22, .8), offset: .12}];
	let last = 0;
	for (let i = 1; i <= 36; i++) {
		const v = i / 36, t = 1 - (1 - v) ** 2.3;
		let turn = Math.atan2(slope(t, 1), slope(t, 0)) * 180 / Math.PI - 135;
		while (turn - last > 180) turn -= 360; while (turn - last < -180) turn += 360; last = turn;
		const steer = Math.min(1, v / .16);
		keys.push({...place(at(t, 0), at(t, 1), -22 * (1 - steer) + turn * steer, (1 + (end - 1) * t) * (1 + .18 * Math.sin(Math.PI * t))), offset: .12 + .88 * v});
	}
	mark.style.opacity = '0';
	const timing = {duration: 900, delay, easing: 'linear', fill: 'backwards'};
	for (const [i, opacity] of [.34, .15].entries()) _rapierNotesGone(_rapierNotesPinGlyph(size, opacity).animate(keys, {...timing, delay: delay + 40 * (i + 1)}));
	const pin = _rapierNotesPinGlyph(size, 1);
	pin.animate(keys, timing).finished.then(() => {
		pin.remove();
		mark.style.opacity = '';
		mark.animate([{transform: 'translate(-1px,1px) scale(.82)'}, {transform: 'translate(.5px,-.5px) scale(1.08)', offset: .55}, {transform: 'none'}], {duration: 240, easing: 'cubic-bezier(.3,0,.2,1)'});
		const here = 'translate(' + (tx - 11) + 'px,' + (ty - 11) + 'px)', puff = _rapierNotesEl('div', 'rapier-notes-pin-puff');
		_rapierNotes.surface.appendChild(puff);
		_rapierNotesGone(puff.animate([{transform: here + ' scale(.3)', opacity: .22}, {transform: here + ' scale(1.6)', opacity: 0}], {duration: 220, easing: 'cubic-bezier(.2,0,0,1)', fill: 'forwards'}));
	}, () => { pin.remove(); mark.style.opacity = ''; });
}
function _rapierNotesWashFrom(files) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
	const was = new Map();
	for (const card of document.querySelectorAll('.rapier-notes-card')) if (files.includes(card.dataset.notesFile)) was.set(card.dataset.notesFile, getComputedStyle(card).backgroundColor);
	return was.size ? was : null;
}
function _rapierNotesWash(was, frames = 12) {
	for (const card of document.querySelectorAll('.rapier-notes-card')) {
		const from = was.get(card.dataset.notesFile);
		if (!from || from === getComputedStyle(card).backgroundColor) continue;
		was.delete(card.dataset.notesFile);
		card.style.setProperty('--notes-wash-from', from);
		card.classList.add('rapier-notes-card--wash');
		setTimeout(() => { card.classList.remove('rapier-notes-card--wash'); card.style.removeProperty('--notes-wash-from'); }, 560);
	}
	if (was.size && frames > 0) requestAnimationFrame(() => _rapierNotesWash(was, frames - 1));
}

async function _rapierNotesBlankDocument() {
	_rapierNotesLeaveNote(); _rapierNotesMarkClean();
	try {
		if (typeof rapierLoad !== 'function') return;
		if (await rapierLoad('', 'untitled.md', {documentKind: 'markdown', deferFlush: true,
				documentAuthority: 'notes:' + _rapierCreateDocumentAuthority()})) _rapierNotesMarkClean();
	} catch (error) { console.warn('[rapier] notes', error); }
}
async function _rapierNotesDeletionProof(files) {
	await _rapierNotesFlush();
	const texts = await _rapierNotesTexts(files, {hold: false});
	const selected = files.map(file => {
		const entry = _rapierNotes.index.notes[file], text = texts.get(file);
		if (typeof text !== 'string' || !entry) throw new Error('A selected note could not be read. Nothing was removed.');
		return {file, text, id: entry.id, trashed: !!entry.trashed};
	});
	const expected = new Map();
	for (const {file, text, id, trashed} of selected) expected.set(file, {id, trashed, digest: await globalThis.RapierNotesIntegrity.sha256(text)});
	return expected;
}
async function _rapierNotesDeleteForeverFiles(files, mode = 'confirmed', expected = null) {
	const state = _rapierNotes, store = _rapierNotesStore, A = globalThis.RapierNotesAudio;
	if (mode === 'confirmed' && !expected) throw new Error('The selected notes have no deletion proof. Review them before deleting.');
	await _rapierNotesFlush();
	const targets = new Set(files), owned = new Set(), shared = new Set();
	let unreadable = 0;
	const census = async names => {
		for (const name of names) {
			let text = null;
			try { text = await store.read(name); }
			catch (error) { if (error?.code !== 'unreadable') throw error; unreadable++; continue; }
			for (const row of A.recordingsOf(text)) (targets.has(name) ? owned : shared).add(row.name);
		}
	};
	const listed = (await store.list()).filter(name => /\.md$/i.test(name));
	await census(listed.filter(name => targets.has(name)));
	if (owned.size) await census(listed.filter(name => !targets.has(name)));
	if (mode === 'confirmed' && files.includes(state.current)) await _rapierNotesBlankDocument();
	await store.kind();
	const outcome = _rapierNotesTake(await store.folder.trash({files, mode, expected}));
	const result = outcome.result, removed = result.deleted.filter(file => targets.has(file));
	if (mode === 'confirmed' && result.revived.length) showToast(result.revived.length === 1 ? 'A selected note changed and was kept. Review it before deleting.' : result.revived.length + ' selected notes changed and were kept. Review them before deleting.', 'info');
	for (const file of removed) { state.texts.delete(file); state.titles.delete(file); if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file, true); }
	if (typeof _rapierNotesLibraryTouch === 'function') for (const file of result.revived) _rapierNotesLibraryTouch(file);
	if (unreadable) showToast(unreadable === 1 ? 'A file in the notes folder could not be read as text, so every recording was kept in case it names one.' : unreadable + ' files in the notes folder could not be read as text, so every recording was kept in case one of them names it.', 'info');
	else for (const name of owned) if (!shared.has(name) && removed.length) {
		try { _rapierNotesTake(await store.folder.discardAudio(name)); }
		catch (error) {
			if (error.code === 'referenced') continue;
			if (!['unreadable', 'changed'].includes(error.code)) throw error;
			showToast('A recording was kept because the remaining notes could not all be checked: ' + name + '.', 'info');
		}
	}
	void _rapierNotesStorageAnswer(false);
	return {removed, revived: result.revived, deferred: result.deferred, missing: result.missing};
}
async function _rapierNotesSweepTrash() {
	const state = _rapierNotes, M = _rapierNotesModel();
	const candidates = Object.keys(state.index.notes).filter(file => state.index.notes[file].trashed && file !== state.current);
	if (!candidates.length) return;
	const expired = new Set(M.expiredTrash(state.index, Date.now()));
	let acts = Object.keys(state.index.deletions || {}).length > 0;
	if (!acts) for (const file of candidates) {
		const evidence = M.trashEvidence(state.index.notes[file]);
		if (expired.has(file) || !evidence) { acts = true; break; }
		let bytes = null;
		try { bytes = await _rapierNotesStore.read(file, {bytes: true}); } catch (_) { acts = true; break; }
		if (bytes == null || await globalThis.RapierNotesIntegrity.sha256(bytes) !== evidence.digest || state.index.notes[file].revision !== evidence.revision) { acts = true; break; }
	}
	if (!acts) return;
	let outcome;
	try { outcome = await _rapierNotesDeleteForeverFiles(candidates, 'expiry'); }
	catch (error) { showToast('Notes past seven days could not be removed from the recycle bin: ' + String(error?.message || error), 'error'); return; }
	const {removed, revived, missing} = outcome;
	if (revived.length) showToast(revived.length === 1 ? 'A note in the recycle bin had changed since it was thrown away, so it was put back instead of deleted.' : revived.length + ' notes in the recycle bin had changed since they were thrown away, so they were put back instead of deleted.', 'info');
	if (missing.length) showToast(missing.length === 1 ? 'A note in the recycle bin is no longer in the notes folder, so its entry was dropped.' : missing.length + ' notes in the recycle bin are no longer in the notes folder, so their entries were dropped.', 'info');
	if (removed.length) showToast(removed.length === 1 ? '1 note deleted from the recycle bin after 7 days' : removed.length + ' notes deleted from the recycle bin after 7 days', 'info');
	if (removed.length || revived.length || missing.length) _rapierNotesRender();
}

function _rapierNotesPointerDown(evt) {
	const state = _rapierNotes;
	if (state.drag && state.drag.id !== evt.pointerId) _rapierNotesAbortDrag();
	const card = evt.target.closest('.rapier-notes-card');
	if (!card || state.drag || (evt.pointerType === 'mouse' && evt.button !== 0)) return;
	const drag = state.drag = { card, file: card.dataset.notesFile, id: evt.pointerId, x0: evt.clientX, y0: evt.clientY, held: false, moved: false, ghost: null, timer: 0, cancelled: false, fold: evt.target.closest('[data-notes-fold]')?.dataset.notesFold || null, check: evt.target.closest('[data-notes-check]')?.dataset.notesCheck ?? null, play: evt.target.closest('[data-notes-play]')?.dataset.notesPlay ?? null };
	const r = card.getBoundingClientRect();
	card.style.setProperty('--px', Math.round(evt.clientX - r.left) + 'px'); card.style.setProperty('--py', Math.round(evt.clientY - r.top) + 'px');
	card.classList.add('rapier-notes-card--pending');
	drag.snap = _rapierNotesLiftSnapshot(drag.file, card);
	drag.timer = setTimeout(() => {
		if (state.drag !== drag || drag.cancelled) return;
		drag.held = true;
		try { card.setPointerCapture(evt.pointerId); } catch (_) {}
		try { navigator.vibrate?.(12); } catch (_) {}
		card.classList.remove('rapier-notes-card--pending');
		card.classList.add('rapier-notes-card--held');
		_rapierNotesAddsToggle(false);
		if (!state.selected.has(drag.file)) _rapierNotesSelect(drag.file, false);
	}, RAPIER_NOTES_HOLD_MS);
}
function _rapierNotesDragFollow(drag) {
	const gr = drag.grid.getBoundingClientRect();
	drag.card.style.setProperty('--x', (drag.lastX - gr.left - drag.grabX) + 'px'); drag.card.style.setProperty('--y', (drag.lastY - gr.top - drag.grabY) + 'px');
}
function _rapierNotesPointerMove(evt) {
	const state = _rapierNotes, drag = state.drag;
	if (!drag || evt.pointerId !== drag.id) return;
	const dx = evt.clientX - drag.x0, dy = evt.clientY - drag.y0, travel = Math.hypot(dx, dy);
	if (!drag.held) {
		if (travel > RAPIER_NOTES_HOLD_SLOP) { drag.cancelled = true; clearTimeout(drag.timer); state.drag = null; drag.card.classList.remove('rapier-notes-card--pending'); }
		return;
	}
	evt.preventDefault();
	if (!drag.moved) {
		if (travel < RAPIER_NOTES_MOVED_PX) return;
		drag.moved = true;
		if (state.selected.size) _rapierNotesCloseSheet();
		drag.grid = drag.card.parentElement; drag.home = drag.grid.parentElement?.dataset.notesSection || null;
		const gr = drag.grid.getBoundingClientRect(), hx = parseFloat(drag.card.style.getPropertyValue('--x')) || 0, hy = parseFloat(drag.card.style.getPropertyValue('--y')) || 0;
		drag.gx = gr.left + hx; drag.gy = gr.top + hy; drag.gw = drag.card.offsetWidth; drag.gh = drag.card.offsetHeight;
		drag.grabX = drag.x0 - drag.gx; drag.grabY = drag.y0 - drag.gy;
		drag.card.dataset.notesDragging = '1'; drag.card.dataset.notesHome = hx + ',' + hy;
		drag.card.classList.add('rapier-notes-card--dragging');
	}
	drag.dx = dx; drag.dy = dy; drag.lastX = evt.clientX; drag.lastY = evt.clientY;
	_rapierNotesDragFollow(drag);
	_rapierNotesEdgeScroll(drag);
	_rapierNotesDragSection(drag);
	_rapierNotesDragOver(drag);
}
const RAPIER_NOTES_SECTION_DWELL_MS = 400;
function _rapierNotesDragSection(drag) {
	const state = _rapierNotes;
	const cx = drag.gx + drag.dx + drag.gw / 2, cy = drag.gy + drag.dy + drag.gh / 2;
	let under = null, deep = false;
	for (const id of _rapierNotesSectionIds()) {
		if (id === 'trash' || id === 'pinned' || id === drag.home) continue;
		const section = state.grids[id]?.parentElement;
		if (!section || section.hidden) continue;
		const r = section.getBoundingClientRect();
		const inside = (x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && Math.min(y - r.top, r.bottom - y) >= Math.min(drag.gh / 4, r.height / 4);
		const finger = Number.isFinite(drag.lastX) && Number.isFinite(drag.lastY);
		if ((cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) || (finger && inside(drag.lastX, drag.lastY))) { under = id; deep = inside(cx, cy) || (finger && inside(drag.lastX, drag.lastY)); break; }
	}
	const want = deep ? under : null;
	if (want === (drag.over || drag.taking || null)) return;
	const mark = (id, cls, on) => state.grids[id]?.parentElement.classList.toggle(cls, on);
	if (drag.taking) { mark(drag.taking, 'rapier-notes-section--taking', false); clearTimeout(drag.takeTimer); drag.taking = null; }
	if (drag.over) {
		mark(drag.over, 'rapier-notes-section--over', false); drag.over = null;
		if (drag.hole) { _rapierNotesMakeWay(drag.hole.grid, -1, 0, true); drag.hole = null; }
		if (drag.grid?.isConnected) { _rapierNotesPack(drag.grid); _rapierNotesDragFollow(drag); }
		drag.dwell = null; clearTimeout(drag.dwellTimer);
	}
	if (!want) return;
	drag.taking = want;
	if (!_rapierNotesStill()) mark(want, 'rapier-notes-section--taking', true);
	drag.takeTimer = setTimeout(() => {
		if (_rapierNotes.drag !== drag || drag.taking !== want) return;
		mark(want, 'rapier-notes-section--taking', false); mark(want, 'rapier-notes-section--over', true);
		drag.taking = null; drag.over = want;
		try { navigator.vibrate?.(12); } catch (_) {}
		if (drag.grid?.isConnected) { _rapierNotesMakeWay(drag.grid, -1, 0); _rapierNotesDragFollow(drag); }
		_rapierNotesDragOver(drag);
	}, RAPIER_NOTES_SECTION_DWELL_MS);
}
function _rapierNotesDropPlace(id, x, y, file, height) {
	const state = _rapierNotes, grid = state.grids[id]; if (!grid) return {first: true};
	const gr = grid.getBoundingClientRect(), place = _rapierNotesPlace(grid, file, x - gr.left, y - gr.top, height);
	if (!place || !place.others.length || place.index === 0) return {first: true};
	return {file: place.others[place.index - 1].dataset.notesFile, after: true};
}
function _rapierNotesDropIndex(id, place, file) {
	const files = _rapierNotesModel().sortedSection(_rapierNotes.index, id).filter(f => f !== file);
	const i = place.first ? -1 : files.indexOf(place.file);
	return i < 0 ? 0 : i + (place.after ? 1 : 0);
}
async function _rapierNotesDropSection(file, id, x, y, height) {
	const state = _rapierNotes, M = _rapierNotesModel();
	const entry = state.index.notes[file]; if (!entry || id === 'pinned' || id === 'trash') { _rapierNotesRender(); return; }
	const place = _rapierNotesDropPlace(id, x, y, file, height);
	const flag = id === 'skills' ? 'skill' : id === 'archive' ? 'archived' : '';
	const act = id === 'skills' ? 'skill' : id === 'archive' ? 'archive' : '';
	const one = () => { state.selected.clear(); state.selected.add(file); };
	if (M.sectionOf(entry, state.index.sections) === 'pinned') {
		one(); await _rapierNotesAct('pin');
		if (state.index.notes[file]?.pinned) { _rapierNotesRender(); return; }
	}
	for (const [key, undo] of [['trashed', 'restore'], ['archived', 'archive'], ['skill', 'skill'], ['pinned', 'pin']]) {
		if (key === flag) break;
		if (!state.index.notes[file]?.[key]) continue;
		one(); await _rapierNotesAct(undo);
		if (state.index.notes[file]?.[key]) { _rapierNotesRender(); return; }
	}
	if (flag) { if (!state.index.notes[file]?.[flag]) { one(); await _rapierNotesAct(act); } }
	else {
		one(); state.dropping = true;
		try { await _rapierNotesAct('section-pick', id === 'others' ? '' : id); }
		catch (error) { state.dropping = false; throw error; }
	}
	if (!state.index.notes[file] || M.sectionOf(state.index.notes[file], state.index.sections) !== id) {
		state.dropping = false; state.renderAfterDrag = false; _rapierNotesRender(); return;
	}
	try {
		_rapierNotesCloseSheet();
		const at = _rapierNotesDropIndex(id, place, file);
		try { await _rapierNotesMove(file, at); }
		catch (error) { showToast('The new place was not written to the notes folder: ' + String(error?.message || error), 'error'); }
	} finally { state.dropping = false; state.renderAfterDrag = false; }
	if (Number.isFinite(x) && Number.isFinite(y)) state.landing = {file, x, y, at: performance.now()};
	_rapierNotesRender();
}
function _rapierNotesPlace(grid, file, x, y, height, keep = -1) {
	const L = _rapierNotesWindowModel(), state = _rapierNotes;
	if (!grid || !L?.nearestSlot || !Number.isFinite(x) || !Number.isFinite(y) || !(height > 0)) return null;
	const others = [...grid.children].filter(c => c.classList.contains('rapier-notes-card') && c.dataset.notesFile !== file);
	const heights = others.map(c => Number((c.dataset.notesBox || '').split(',')[3]));
	if (heights.some(h => !(h > 0))) return null;
	const columns = Math.max(1, Number(getComputedStyle(state.surface).getPropertyValue('--notes-cols')) || 2), gap = 8, width = grid.clientWidth;
	if (!(width > gap * (columns - 1))) return null;
	const place = L.nearestSlot({heights, height, columns, columnWidth: (width - gap * (columns - 1)) / columns, gap, x, y, keep, margin: RAPIER_NOTES_HOLD_SLOP});
	return {...place, others};
}
function _rapierNotesHeldAt(drag, grid = drag.grid) {
	const gr = grid.getBoundingClientRect();
	return {x: drag.gx + drag.dx - gr.left, y: drag.gy + drag.dy - gr.top};
}
function _rapierNotesMakeWay(grid, index, height, restore = false) {
	const cards = [...grid.children].filter(c => c.classList.contains('rapier-notes-card') && !c.dataset.notesDragging);
	if (!cards.length) return;
	const box = c => (c.dataset.notesBox || '').split(',').map(Number);
	if (restore) {
		for (const c of cards) { const [x, y] = box(c); if (Number.isFinite(y)) { c.style.setProperty('--x', x + 'px'); c.style.setProperty('--y', y + 'px'); } }
		const win = _rapierNotes.windows[grid.parentElement?.dataset.notesSection];
		if (win) grid.style.height = Math.max(0, win.masonry.extent) + 'px';
		return;
	}
	const columns = Math.max(1, Number(getComputedStyle(_rapierNotes.surface).getPropertyValue('--notes-cols')) || 2), gap = 8, width = grid.clientWidth;
	const pitch = (width - gap * (columns - 1)) / columns + gap, tops = Array(columns).fill(0);
	const put = h => { let c = 0; for (let i = 1; i < columns; i++) if (tops[i] < tops[c]) c = i; const at = {x: Math.round(c * pitch), y: Math.round(tops[c])}; tops[c] += h + gap; return at; };
	cards.forEach((card, i) => {
		if (i === index) put(height);
		const h = box(card)[3]; if (!(h > 0)) return;
		const at = put(h); card.style.setProperty('--x', at.x + 'px'); card.style.setProperty('--y', at.y + 'px');
	});
	if (index >= cards.length) put(height);
	grid.style.height = Math.max(parseFloat(grid.style.height) || 0, Math.max(...tops) - gap) + 'px';
}
function _rapierNotesDragOver(drag, final = false) {
	if (RapierPreferences.read('notesSort') !== 'custom') { drag.sortedStill = true; return; }
	if (drag.over) {
		const grid = _rapierNotes.grids[drag.over]; if (!grid || final) return;
		const kept = drag.hole?.grid === grid ? drag.hole.index : -1, held = _rapierNotesHeldAt(drag, grid), place = _rapierNotesPlace(grid, drag.file, held.x, held.y, drag.gh, kept);
		if (!place || place.index === kept) { drag.dwell = null; clearTimeout(drag.dwellTimer); return; }
		const key = drag.over + ':' + place.index;
		if (drag.dwell !== key) {
			drag.dwell = key; clearTimeout(drag.dwellTimer);
			drag.dwellTimer = setTimeout(() => { if (_rapierNotes.drag === drag && drag.moved && drag.dwell === key) { drag.dwellDue = key; _rapierNotesDragOver(drag); } }, RAPIER_NOTES_DWELL_MS);
			return;
		}
		if (drag.dwellDue !== key) return;
		drag.dwell = null; drag.dwellDue = null;
		_rapierNotesMakeWay(grid, place.index, drag.gh); drag.hole = {grid, index: place.index};
		_rapierNotesDragFollow(drag);
		return;
	}
	if (drag.taking && !final) { drag.dwell = null; clearTimeout(drag.dwellTimer); return; }
	const grid = drag.grid, cards = [...grid.children].filter(c => c.classList.contains('rapier-notes-card')), at = cards.indexOf(drag.card);
	const held = _rapierNotesHeldAt(drag), place = _rapierNotesPlace(grid, drag.file, held.x, held.y, drag.gh, final ? -1 : at);
	if (!place || at < 0) return;
	if (place.index === at) { drag.dwell = null; clearTimeout(drag.dwellTimer); return; }
	const key = place.index + '@' + (place.others[place.index]?.dataset.notesFile ?? '$');
	if (!final) {
		if (drag.dwell !== key) {
			drag.dwell = key; clearTimeout(drag.dwellTimer);
			drag.dwellTimer = setTimeout(() => { if (_rapierNotes.drag === drag && drag.moved && drag.dwell === key) { drag.dwellDue = key; _rapierNotesDragOver(drag); } }, RAPIER_NOTES_DWELL_MS);
			return;
		}
		if (drag.dwellDue !== key) return;
	}
	drag.dwell = null; drag.dwellDue = null;
	const before = place.others[place.index] || null;
	grid.insertBefore(drag.card, before || (place.others.length ? place.others[place.others.length - 1].nextSibling : null));
	_rapierNotesPack(grid);
	drag.reordered = true;
}
function _rapierNotesEdgeScroll(drag) {
	const state = _rapierNotes, scroll = state.scroll, r = scroll.getBoundingClientRect(), y = drag.lastY;
	const step = y < r.top + 56 ? -Math.ceil((r.top + 56 - y) / 4) : y > r.bottom - 56 ? Math.ceil((y - (r.bottom - 56)) / 4) : 0;
	if (!step) { drag.edgeFrame = 0; return; }
	const was = scroll.scrollTop; scroll.scrollTop += step;
	if (scroll.scrollTop !== was) { _rapierNotesDragFollow(drag); _rapierNotesDragSection(drag); _rapierNotesDragOver(drag); }
	if (!drag.edgeFrame) drag.edgeFrame = requestAnimationFrame(() => { drag.edgeFrame = 0; if (state.drag === drag && drag.held && drag.moved) _rapierNotesEdgeScroll(drag); });
}
function _rapierNotesDropDrag(drag, settle = false) {
	const state = _rapierNotes;
	clearTimeout(drag.timer); if (drag.edgeFrame) { cancelAnimationFrame(drag.edgeFrame); drag.edgeFrame = 0; } if (state.drag === drag) state.drag = null;
	if (drag.over) { state.grids[drag.over]?.parentElement.classList.remove('rapier-notes-section--over'); }
	if (drag.taking) { state.grids[drag.taking]?.parentElement.classList.remove('rapier-notes-section--taking'); drag.taking = null; }
	clearTimeout(drag.takeTimer);
	try { drag.card.releasePointerCapture(drag.id); } catch (_) {}
	clearTimeout(drag.dwellTimer);
	if (drag.hole) { _rapierNotesMakeWay(drag.hole.grid, -1, 0, true); drag.hole = null; if (drag.grid?.isConnected && drag.card.parentElement === drag.grid) _rapierNotesPack(drag.grid); }
	const card = drag.card;
	card.classList.remove('rapier-notes-card--held', 'rapier-notes-card--pending', 'rapier-notes-card--dragging');
	if (card.dataset.notesDragging) {
		delete card.dataset.notesDragging;
		const home = (card.dataset.notesHome || '').split(','); delete card.dataset.notesHome;
		if (home.length === 2 && card.isConnected) {
			card.style.setProperty('--x', home[0] + 'px'); card.style.setProperty('--y', home[1] + 'px');
			const spring = _rapierNotesSpring(), ms = spring ? RAPIER_NOTES_SPRING_MS : 200;
			card.dataset.notesSettling = '1';
			setTimeout(() => { delete card.dataset.notesSettling; }, ms + 20);
		}
	}
}
function _rapierNotesAbortDrag() {
	const state = _rapierNotes, drag = state.drag; if (!drag) return;
	_rapierNotesDropDrag(drag);
	if (drag.held || state.renderAfterDrag) { state.renderAfterDrag = false; _rapierNotesRender(); }
}
async function _rapierNotesPointerUp(evt, cancelled = false) {
	const state = _rapierNotes, drag = state.drag;
	if (!drag || evt.pointerId !== drag.id) return;
	const deferred = state.renderAfterDrag; state.renderAfterDrag = false;
	if (cancelled) { _rapierNotesDropDrag(drag); _rapierNotesRender(); return; }
	if (!drag.held) {
		_rapierNotesDropDrag(drag);
		if (deferred) _rapierNotesRender();
		if (drag.cancelled) return;
		if (drag.check != null) { await _rapierNotesToggleCheck(drag.file, Number(drag.check)); return; }
		if (drag.fold) { _rapierNotesFold(drag.file, drag.fold === 'show', false); return; }
		if (drag.play != null) { if (typeof _rapierRecorderCardToggle === 'function') _rapierRecorderCardToggle(drag.file, drag.play); return; }
		_rapierNotesAddsToggle(false); if (!state.query) _rapierNotesSearchToggle(false);
		if (state.selected.size) _rapierNotesSelect(drag.file); else { state.swallowClick = performance.now(); state.openFrom = drag.snap || _rapierNotesLiftSnapshot(drag.file, drag.card); await _rapierNotesOpenNote(drag.file); }
		return;
	}
	if (!drag.moved) { _rapierNotesDropDrag(drag); if (deferred) _rapierNotesRender(); if (!state.selected.has(drag.file)) _rapierNotesSelect(drag.file, false); return; }
	if (drag.over) {
		const id = drag.over, x = drag.gx + drag.dx, y = drag.gy + drag.dy, file = drag.file, height = drag.gh;
		delete drag.card.dataset.notesHome; drag.hole = null;
		_rapierNotesDropDrag(drag);
		try { await _rapierNotesDropSection(file, id, x, y, height); }
		finally { if (drag.card.isConnected && drag.card.parentElement === drag.grid) _rapierNotesRender(); }
		return;
	}
	if (drag.grid && drag.card.parentElement === drag.grid) _rapierNotesDragOver(drag, true);
	const grid = drag.card.parentElement;
	_rapierNotesDropDrag(drag, !!(drag.reordered && grid && !deferred));
	if (drag.sortedStill && !drag.reordered && !state.sortedStillSaid) {
		state.sortedStillSaid = true;
		const said = RAPIER_NOTES_SORT_WORDS[RapierPreferences.read('notesSort')] || 'this order';
		showToast('Sorted by ' + said + ', so the cards keep that order. Choose Custom in the menu to arrange them by hand.', 'info');
	}
	if (drag.reordered && grid) {
		const shown = [...grid.children].filter(c => c.classList.contains('rapier-notes-card')).map(c => c.dataset.notesFile);
		const at = _rapierNotesPlaceAmong(drag.file, shown);
		if (at >= 0) {
			try { await _rapierNotesMove(drag.file, at); }
			catch (error) { showToast('The new order was not written to the notes folder: ' + String(error?.message || error), 'error'); _rapierNotesRender(); return; }
		}
		if (!deferred) return;
	}
	_rapierNotesRender();
}
function _rapierNotesPlaceAmong(file, shown) {
	const state = _rapierNotes, M = _rapierNotesModel(), entry = state.index.notes[file];
	if (!entry) return -1;
	const section = M.sortedSection(state.index, M.sectionOf(entry, state.index.sections)).filter(f => f !== file);
	const i = shown.indexOf(file); if (i < 0) return -1;
	const prev = shown[i - 1], next = shown[i + 1];
	if (prev != null && section.includes(prev)) return section.indexOf(prev) + 1;
	if (next != null && section.includes(next)) return section.indexOf(next);
	return prev == null ? 0 : section.length;
}
async function _rapierNotesApplyText(next, operation, label, {settle = false} = {}) {
	const before = _rapierSourceText();
	if (before === next) return true;
	const settling = settle ? _rapierNotes.current : null;
	const row = _rapierPrefixSuffixDiff(before, next);
	const context = { actor: { kind: 'human', id: 'notes' }, transport: 'platform', operation };
	const drafts = [{ kind: 'document-range', startBlockId: null, endBlockId: null, beforeText: row.removed, afterText: row.inserted, anchorBefore: row.pos, anchorAfter: row.pos, replacementLength: row.inserted.length }];
	const changeSet = _rapierChangeSetMetadata(_rapierNormalizeTransactionContext(context), drafts, label, 'change');
	try {
		await _rapierWithCompoundTransaction(context, async compound => {
			const applied = await _rapierApplyCanonicalSplices([row], { keepSourceMode: rapier.view.mode === 'source', retiredImages: [] });
			if (!applied || _rapierSourceText() !== next) throw Object.assign(new Error('the change could not be placed in the open note'), { code: 'splice_integrity_failure' });
			const start = row.pos, end = row.pos + row.inserted.length;
			for (const [id, span] of _rapierExcerptCanonicalBlockSpans()) if (start === end ? span.start <= start && span.end >= end : span.start < end && span.end > start) compound.affectedBlockIds.add(id);
		}, { changeSet });
	} catch (error) { showToast('The note could not be changed right now: ' + String(error?.message || error), 'error'); return false; }
	if (settle) {
		try { await _rapierNotesAutosave(); } catch (_) {}
		return !!settling && _rapierNotes.texts.get(settling) === next;
	}
	void _rapierNotesAutosave().catch(() => {});
	return true;
}
function _rapierNotesTagsOf(file) {
	const F = globalThis.RapierNotesFrontMatter, text = _rapierNotes.texts.get(file);
	if (!F || typeof F.tagsOf !== 'function' || text == null) return [];
	try { return F.tagsOf(text); } catch (_) { return []; }
}
async function _rapierNotesWriteTags(file, tags) {
	const state = _rapierNotes, F = globalThis.RapierNotesFrontMatter;
	if (!F || typeof F.setTags !== 'function') { showToast('This build cannot write a note\'s tags.', 'error'); return false; }
	if (_rapierNotesModel().isCodeFile(file)) { showToast('A code file keeps no tags: its words are left as they are.', 'info'); return false; }
	if (state.current === file) { try { await _rapierNotesFlush(); } catch (_) { return false; } }
	await _rapierNotesTexts([file]);
	const text = state.texts.get(file); if (text == null) return false;
	let next;
	try { next = F.setTags(text, tags); }
	catch (error) { showToast('That tag could not be written into the note: ' + String(error?.message || error), 'error'); return false; }
	if (next === text) return true;
	if (state.current === file) { if (!await _rapierNotesApplyText(next, 'notes.tags', 'Tags', {settle: true})) return false; }
	else {
		let saved;
		try { saved = await _rapierNotesSave(file, next, undefined, {reason: 'edit-card'}); }
		catch (error) { showToast('The tag could not be written to the notes folder: ' + String(error?.message || error), 'error'); return false; }
		await _rapierNotesHoldCardSave(file, saved.file, next);
		return true;
	}
	_rapierNotesHold(file, next);
	if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file);
	return true;
}
async function _rapierNotesHoldCardSave(file, kept, text) {
	const touch = name => { if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(name); };
	_rapierNotesHold(kept, text); touch(kept);
	if (kept === file) return;
	const theirs = await _rapierNotesStore.read(file);
	if (typeof theirs === 'string') _rapierNotesHold(file, theirs); else _rapierNotes.texts.delete(file);
	touch(file);
}
async function _rapierNotesTagAdd(file, given) {
	const name = String(given || '').trim().replace(/^#+/, '').trim();
	if (!name) return;
	const held = _rapierNotesTagsOf(file);
	if (held.some(tag => tag.toLowerCase() === name.toLowerCase())) { showToast('This note already has that tag.', 'info'); return; }
	if (await _rapierNotesWriteTags(file, [...held, name])) _rapierNotesOpenSheet(null, 'tags');
}
async function _rapierNotesTagRemove(file, name) {
	const kept = _rapierNotesTagsOf(file).filter(tag => tag !== name);
	if (await _rapierNotesWriteTags(file, kept)) _rapierNotesOpenSheet(null, 'tags');
}
async function _rapierNotesToggleCheck(file, n) {
	const state = _rapierNotes, M = _rapierNotesModel(), ink = _rapierNotesInk(file, n);
	if (M.isCodeFile(file)) return;
	if (state.current === file) { try { await _rapierNotesFlush(); } catch (_) { return; } }
	await _rapierNotesTexts([file]);
	const text = state.texts.get(file); if (text == null) return;
	const next = M.toggleCheck(text, n); if (next == null) return;
	if (state.current === file) {
		if (!await _rapierNotesApplyText(next, 'notes.tick', 'Tick', {settle: true})) return;
		_rapierNotesHold(file, next);
		if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file);
	} else {
		let saved;
		try { saved = await _rapierNotesSave(file, next, undefined, {reason: 'edit-card'}); }
		catch (error) { showToast('The box could not be ticked in the notes folder: ' + String(error?.message || error), 'error'); return; }
		await _rapierNotesHoldCardSave(file, saved.file, next);
		if (saved.file !== file) { _rapierNotesRender(); return; }
	}
	if (ink) await ink();
	_rapierNotesRender();
}
function _rapierNotesInk(file, n) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
	const card = [...document.querySelectorAll('.rapier-notes-card')].find(c => c.dataset.notesFile === file);
	const box = card?.querySelector('[data-notes-check="' + n + '"]'), row = box?.closest('.rapier-notes-check');
	if (!row || box.getAttribute('aria-pressed') !== 'false') return null;
	const fold = row.tagName === 'LI' && !_rapierNotes.unfolded.has(file) && !row.querySelector('li.rapier-notes-check:not(.rapier-notes-check--done)');
	return async () => {
		if (!row.isConnected) return;
		box.setAttribute('aria-pressed', 'true');
		row.classList.add('rapier-notes-check--done', 'rapier-notes-check--inking');
		await new Promise(done => setTimeout(done, 440));
		if (!fold || !row.isConnected) return;
		row.style.height = row.offsetHeight + 'px'; void row.offsetHeight;
		row.classList.add('rapier-notes-check--leaving');
		await new Promise(done => setTimeout(done, 280));
	};
}

const RAPIER_NOTES_RESTORE_ACCEPT = '.zip,application/zip';
const RAPIER_NOTES_IMPORT_SOURCE_WORDS = { rapier: 'a rapier backup', keep: 'a takeout export', markdown: 'markdown files', notion: 'notion', evernote: 'evernote', html: 'web pages', zoho: 'zoho notebook', joplin: 'joplin', simplenote: 'simplenote', standardnotes: 'standard notes',
	textbundle: 'textbundle', dayone: 'day one', roam: 'roam research', logseq: 'logseq', paper: 'dropbox paper' };
async function _rapierNotesImport() {
	try { await _rapierNotesReady(); } catch (error) { showToast('Notes could not open for import. Reopen Notes and try again.', 'error'); return; }
	const overlay = document.getElementById('notes-import-overlay');
	if (!overlay) { void _rapierNotesImportPick('any'); return; }
	_rapierNotesMarkupGlyphs();
	if (typeof _rapierUiOpenInterchange === 'function') _rapierUiOpenInterchange(overlay);
	else openDialog(overlay, { panel: '.settings-panel' });
}
function _rapierNotesImportClose() { const overlay = document.getElementById('notes-import-overlay'); if (overlay) closeDialog(overlay); }
async function _rapierNotesImportPick(source) {
	const state = _rapierNotes;
	_rapierNotesImportClose();
	if (typeof _rapierPrepareFileChooser === 'function') await _rapierPrepareFileChooser('notes-import');
	const input = document.createElement('input');
	input.type = 'file'; input.multiple = true; input.accept = source === 'restore' ? RAPIER_NOTES_RESTORE_ACCEPT : '';  input.hidden = true;
	document.body.appendChild(input);
	input.addEventListener('cancel', () => input.remove(), { once: true });
	input.addEventListener('change', () => {
		const files = [...(input.files || [])]; input.remove();
		if (!files.length) return;
		state.capturing = (state.capturing || Promise.resolve()).then(async () => {
			const popup = _rapierProgressOpen({label: source === 'restore' ? 'Restoring notes' : 'Importing notes', after: 500});
			try { await _rapierNotesImportFiles(files, source); } finally { popup.end(); }
		}).catch(error => { console.warn('[rapier] notes import', error); showToast('The import did not finish. Keep the source export and check Notes before trying again.', 'error'); });
	});
	input.click();
}
function _rapierNotesImporters() {
	const g = globalThis, pick = (mod, fn) => (mod && typeof mod[fn] === 'function' ? mod[fn] : null);
	const table = {
		keep: pick(g.RapierNotesTakeout, 'importTakeout'), markdown: pick(g.RapierNotesImportMarkdown, 'importMarkdown'),
		notion: pick(g.RapierNotesImportNotion, 'importNotion'), evernote: pick(g.RapierNotesImportEnex, 'importEnex'),
		html: pick(g.RapierNotesImportHtml, 'importHtml'), joplin: pick(g.RapierNotesImportJoplin, 'importJoplin'),
		simplenote: pick(g.RapierNotesImportSimplenote, 'importSimplenote'), standardnotes: pick(g.RapierNotesImportStandardNotes, 'importStandardNotes'),
		textbundle: pick(g.RapierNotesImportTextBundle, 'importTextBundle'), dayone: pick(g.RapierNotesImportDayOne, 'importDayOne'),
		roam: pick(g.RapierNotesImportRoam, 'importRoam'), logseq: pick(g.RapierNotesImportLogseq, 'importLogseq'),
		paper: pick(g.RapierNotesImportMarkdown, 'importMarkdown'),
	};
	for (const k of Object.keys(table)) if (!table[k]) delete table[k];
	return table;
}
async function _rapierNotesDocxEntry(file) {
	const A = globalThis.RapierNotesAttachments, decision = A.attachmentIntake([file]);
	if (decision.refusal) return {name: file.name, oversize: true, size: file.size, unreadable: decision.refusal};
	const name = file.webkitRelativePath || file.name, bytes = new Uint8Array(await file.arrayBuffer());
	const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
	const href = encodeURIComponent(file.name).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16));
	let body = '<p>The Word document could not be converted. Its original file is attached.</p>';
	try {
		const D = globalThis.RapierDocxImport;
		if (typeof D?.readDocx === 'function') {
			const pictures = new Map();
			const result = await D.readDocx(new File([bytes], file.name, {type: file.type}), {embedImage: async image => {
				const reference = 'word-picture-' + pictures.size;
				const url = await _rapierNotesDataUrl(new Blob([image.bytes], {type: image.type || 'application/octet-stream'}));
				pictures.set(reference, url);
				return {reference, url};
			}});
			if (typeof result?.canonical === 'string') return {name: name.replace(/\.docx$/i, '') + '.md',
				text: result.canonical, attachmentEntry: {name, bytes}};
			if (typeof result?.html === 'string') {
				let text = turndown.turndown(result.html).trim();
				for (const [reference, url] of pictures) text += '\n\n[' + reference + ']: ' + url;
				text += '\n\n[Original Word file](' + href + ')\n';
				text = D.finishDocxMarkdown(text, result, {convertHtml: html => turndown.turndown(html)});
				return {name: name.replace(/\.docx$/i, '') + '.md', text, attachmentEntry: {name, bytes}};
			}
		}
	} catch (_) {  }
	const html = '<html><head><title>' + escape(file.name.replace(/\.docx$/i, '')) + '</title></head><body>' + body + '<p><a href="' + href + '">Original Word file</a></p></body></html>';
	return {name: name.replace(/\.docx$/i, '') + '.html', text: html, attachmentEntry: {name, bytes}};
}

async function _rapierNotesImportFiles(files, source) {
	const state = _rapierNotes;
	const D = globalThis.RapierNotesImport;
	if (!D || typeof D.importAny !== 'function') throw new Error('the importer did not load');
	if (source === 'restore') {
		const parts = await D.openBackupFiles(files);
		if (state.loading) await state.loading;
		await _rapierNotesStore.kind();
		const snapshot = await _rapierNotesStore.folder.restoreSnapshot({parts});
		_rapierNotesTake(snapshot);
		await _rapierNotesLoad(); _rapierNotesIndexingBegin();
		showToast('Restored ' + snapshot.files.length + (snapshot.files.length === 1 ? ' note' : ' notes') + (snapshot.verification.status === 'verified' ? ' and every file in the backup, exactly, each checked against it.' : ' and the archive’s other files; the backup could not be verified. Keep the archive.'), 'info');
		if (state.open) _rapierNotesRender();
		return;
	}
	const backupParts = source === 'rapier' && files.length && files.every(file => /\.zip$/i.test(file.name)) ? await D.openBackupSetForImport(files) : null;
	const entries = [];
	const pictureCopies = new Map();
	for (const file of backupParts ? [] : files) {
		const name = file.webkitRelativePath || file.name;
		if (/\.docx$/i.test(file.name)) { const entry = await _rapierNotesDocxEntry(file); entries.push(entry); if (entry.attachmentEntry) entries.push(entry.attachmentEntry); continue; }
		if (file.size > globalThis.RapierNotesAttachments.ATTACHMENT_MAX_BYTES && !/\.(?:zip|textpack|jex|enex|md|markdown|txt|text|html?|mht|mhtml|json|csv)$/i.test(file.name)) { entries.push({name, oversize: true, size: file.size}); continue; }
		if (/^image\//.test(file.type) || /\.(?:jpe?g|png|gif|webp|bmp|svg|heic|heif|avif)$/i.test(file.name)) {
			const bytes = new Uint8Array(await file.arrayBuffer());
			let digest = null;
			try { digest = await globalThis.RapierNotesIntegrity?.sha256(bytes); } catch (_) { digest = null; }
			const copies = pictureCopies.get(name);
			if (digest && copies?.has(digest)) continue;
			if (digest) { if (copies) copies.add(digest); else pictureCopies.set(name, new Set([digest])); }
			entries.push({ name, bytes });
			continue;
		}
		entries.push({ name, bytes: new Uint8Array(await file.arrayBuffer()) });
	}
	const opened = backupParts || await D.openContainers(entries);
	if (state.loading) await state.loading;

	await _rapierNotesLoad(); _rapierNotesIndexingBegin();
	const M = _rapierNotesModel();
	const A = globalThis.RapierNotesAudio;
	const recordings = await _rapierNotesStore.audioNames();
	const thumbnails = await _rapierNotesStore.thumbNames();
	const attachmentNames = await _rapierNotesStore.attachmentNames();
	const importFiles = await _rapierNotesStore.importReceiptNames();
	const existing = [...Object.keys(state.index.notes), ...recordings.map(name => 'audio/' + name), ...thumbnails.map(name => 'thumbs/' + name), ...attachmentNames.map(name => 'attachments/' + name), ...importFiles.map(name => 'imports/' + name)];
	const lastOrder = Object.values(state.index.notes).map(e => e.order).filter(Boolean).sort().at(-1) || '';
	const ascii = !await _rapierNotesStore.namesBeyondAscii();
	const P = globalThis.RapierNotesImportPictures;
	const flavour = ['bear', 'obsidian', 'logseq', 'paper', 'textbundle', 'dayone', 'roam'].includes(String(source || '')) ? String(source) : undefined;
	const result = await D.importAny(opened, { existing, index: state.index, ascii, lastOrder, sections: (state.index.sections || []).map(s => s.name), audioExisting: recordings, attachmentExisting: attachmentNames,
		...(flavour ? {flavour} : {}),
		...(typeof P?.importPictures === 'function' ? {pictureImporter: P.importPictures} : {}) }, _rapierNotesImporters());
	const { notes, skipped, sections, sources, unoffered } = result;
	if (result.alreadyImported) { showToast('This export is already in Notes. Nothing changed.', 'info'); return; }
	if (result.repeatConflict) { showToast(result.skipped.map(row => row.name + ': ' + row.why).join('\n'), 'error'); return; }
	const Landing = globalThis.RapierNotesImportPlan, Receipt = globalThis.RapierNotesImportReceipt;
	if (!Landing || typeof Landing.planImportLanding !== 'function' || !Receipt?.createImportReceipt) throw new Error('The import landing and its record must load before any files can be written.');
	let receiptError = null, importVerified = false, record = null, receiptCheckpoint = null;
	const saveReceipt = async () => {
		const saved = await _rapierNotesStore.folder.checkpointImportReceipt(record, receiptCheckpoint);
		receiptCheckpoint = saved.receiptCheckpoint; _rapierNotesTake(saved);
	};
	if (notes.length || result.attachments?.length || result.audio?.length || result.backupFiles?.length) {
		const stamp = Date.now(), key = await globalThis.RapierNotesIntegrity.sha256(new TextEncoder().encode(stamp + '\n' + notes.map(note => note.file).join('\n')));
		record = Receipt.createImportReceipt(result, {stamp, id: 'import-' + stamp + '-' + key.slice(0, 12)});
		record.publication = {phase: 'media', plannedFiles: [...(result.attachments || []).map(row => 'attachments/' + row.name), ...(result.audio || []).map(row => 'audio/' + row.name), ...(result.backupFiles || []).filter(row => !M.isNoteFile(row.name)).map(row => row.name)]};
		await saveReceipt();
	}
	const audioNames = new Map();
	const recordingMap = rootId => {
		if (!audioNames.has(rootId)) audioNames.set(rootId, new Map());
		return audioNames.get(rootId);
	};
	let pastKept = 0, pastFailed = 0, unplaced = 0, pastWhy = '', pastObjectsFailed = 0, backupSavedFiles = 0;
	try {
	const recordFile = async (file, bytes) => {
		if (!record) return;
		record = await Receipt.verifyImportFile(record, file, bytes, await _rapierNotesStore.bytes.read(file));
		await saveReceipt();
	};
	for (const file of result.attachments || []) {
		const name = await _rapierNotesStore.createAttachment(file.name, new Blob([file.bytes]), {exact: true});
		await recordFile('attachments/' + name, file.bytes);
	}
	for (const audio of result.audio || []) {
		const name = await _rapierNotesStore.createAudio(audio.note || 'Recording.md', audio.mime, new Blob([audio.bytes], {type: audio.mime || 'application/octet-stream'}), audio.name);
		recordingMap(audio.rootId).set(audio.name, name);
		await recordFile('audio/' + name, audio.bytes);
	}

	const backupFiles = [...(result.backupFiles || [])].sort((a, b) => Number(/^history\/manifests\//.test(a.name)) - Number(/^history\/manifests\//.test(b.name)));
	for (const file of backupFiles) {
		if (/^imports\/[^/\\]+\.json$/.test(file?.name || '') && file.bytes) {
			await _rapierNotesStore.folder.asset(file.name, file.bytes); backupSavedFiles++; continue;
		}
		if (/^attachments\/[^/\\]+$/.test(file?.name || '') && file.bytes) {
			await _rapierNotesStore.createAttachment(file.name.slice(12), new Blob([file.bytes]), {exact: true});
			await recordFile(file.name, file.bytes);
			backupSavedFiles++;
			continue;
		}
		if (/^thumbs\/[^/\\]+$/.test(file?.name || '') && file.bytes) {
			await _rapierNotesStore.folder.asset(file.name, file.bytes);
			continue;
		}
		const landed = /^audio\/(.+)$/.exec(file?.name || '')?.[1];
		if (!landed || !file.bytes || !A.validRecordingName(landed)) continue;
		const mime = A.audioMime('', landed) || 'application/octet-stream';
		await _rapierNotesStore.createAudio('Recording.md', mime, new Blob([file.bytes], {type: mime}), landed, {exact: true});
		await recordFile(file.name, file.bytes);
		backupSavedFiles++;
	}
	await _rapierNotesStore.historyCommit(async () => {
	const keepHistoryProof = async (past, bytes) => {
		const created = await _rapierNotesStore.writeHistory(past, bytes, {immutable: true});
		if (created && record) record = await Receipt.verifyImportHistory(record,
			[{file: 'history/' + past, bytes, actual: await _rapierNotesStore.readHistory(past)}]);
	};
	for (const file of backupFiles) {
		if (/^imports\/[^/\\]+\.json$/.test(file?.name || '') && file.bytes) continue;
		if (/^attachments\/[^/\\]+$/.test(file?.name || '') && file.bytes) continue;
		if (/^audio\/(.+)$/.exec(file?.name || '')?.[1] && file.bytes) continue;
		if (/^thumbs\/[^/\\]+$/.test(file?.name || '') && file.bytes) continue;
		const past = /^history\/((?:texts|blobs|manifests)\/[^/]+)$/.exec(file?.name || '')?.[1];
		if (M.isNoteFile(file.sourcePath)) continue;
		if (!past || !file.bytes) { if (file?.name) unplaced++; continue; }
		try {
			if (past.startsWith('manifests/')) {
				const H = globalThis.RapierNotesHistory;
				const noteId = /^manifests\/(.+)\.json$/.exec(past)?.[1]?.replace('!', ':');
				if (await _rapierNotesStore.readHistory(past) != null) { pastKept++; continue; }
				if (!H?.materialize) throw new Error('the module that verifies a restored past did not load');
				const restored = H.parseManifest(file.bytes, {noteId, now: Date.now()});
				const checked = new Set();
				for (const version of restored.versions) if (!checked.has(version.hash)) {
					await H.materialize(restored, version.id, name => _rapierNotesStore.readHistory(name));
					checked.add(version.hash);
				}
				await keepHistoryProof(past, file.bytes);
				continue;
			}
			await keepHistoryProof(past, file.bytes);
		} catch (error) {
			if (past.startsWith('manifests/')) {
				pastFailed++;
			} else pastObjectsFailed++;
			pastWhy = pastWhy || String(error?.message || error);
		}
	}
	});
	if (record && backupFiles.some(file => /^history\//.test(file.name))) await saveReceipt();
	for (const note of notes) {
		if (note.exactBackup || M.isCodeFile(note.file)) continue;
		const text = A.rewriteRecordingNames(note.text, recordingMap(note.rootId));
		if (text !== note.text) { note.text = text; note.bytes = new TextEncoder().encode(text); }
	}
	} catch (error) {
		if (record) {
			record = Receipt.finishImportReceipt(record, {status: 'failed', why: 'Adding the files stopped: ' + String(error?.message || error) + '. Some may already be in the notes folder; keep your export.'});
			try { await saveReceipt(); } catch (receiptFault) { console.warn('[rapier] attachment failure record', receiptFault); }
		}
		throw error;
	}
	if (record) record.publication = {...record.publication, phase: 'notes'};
	const added = new Map((result.sectionsAdded || []).map(section => [section?.name, section?.collapsed === true]));
	const sectionsToMake = (sections || []).filter(name => !(state.index.sections || []).some(s => s.name === name));
	let missing = 0, ambiguous = 0, refusedPictures = 0;
	for (const note of notes) for (const warning of note.warnings || []) {
		const code = String(warning?.code || '');
		if (!code.startsWith('picture_')) continue;
		if (code === 'picture_missing') missing++;
		else if (code === 'picture_ambiguous') ambiguous++;
		else refusedPictures++;
	}
	const landed = [], landedNames = new Map(), landedEntries = new Map();
	const turn = () => typeof globalThis.scheduler?.yield === 'function' ? globalThis.scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));
	let landing = Landing.createImportLanding(Landing.planImportLanding({notes: notes.map(note => ({file: note.file, text: note.text, ...(M.isCodeFile(note.file) ? {bytes: note.bytes} : {}), entry: note.entry})), receipts: record ? notes.map(note => ({file: note.file})) : []},
		{batchCount: Landing.importBatchCount(Object.keys(state.index?.notes || {}).length, notes.length)}));
	const checkpoint = () => { if (!record) return; record = {...record, landing: {nextBatch: landing.cursor, status: landing.status, done: landing.done, ...(landing.stop ? {stop: landing.stop} : {}), ...(landing.position ? {position: landing.position} : {})}}; };
	if (landing.batch) await turn();
	while (landing.batch) {
		const batch = landing.batch; let outcome;
		if (batch.kind === 'write') {
			let written = 0, completed = 0, uncertain = false, why = '';
			try {
				const items = batch.items, want = sectionsToMake.splice(0), receipt = record;
				const snapshot = await _rapierNotesStore.folder.importBatch(({index, files}) => {
					const taken = new Set(files.map(n => n.toLowerCase())), rows = [];
					for (const item of items) {
						const file = item.file;
						if (notes[item.ordinal]?.exactBackup && taken.has(file.toLowerCase())) throw new Error('The planned backup note name is occupied: ' + file + '. The backup note was not renamed behind its references. Keep the backup and retry Import.');
						rows.push({ordinal: item.ordinal, file, text: item.text, ...(item.bytes ? {bytes: item.bytes} : {}), entry: item.entry});
					}
					return {notes: rows, sections: want, sectionsAdded: want.map(name => ({name, collapsed: added.get(name) === true})), index, ...(receipt ? {importReceipt: receipt, receiptCheckpoint} : {})};
				});
				_rapierNotesTake(snapshot);
				if (snapshot.receiptCheckpoint) { receiptCheckpoint = snapshot.receiptCheckpoint; record = receiptCheckpoint.receipt; }
				if (record) {
					record = Receipt.recordImportSections(record, snapshot.result.createdSections || []);
				}
				for (const row of snapshot.result.notes) {
					landedNames.set(row.ordinal, row.file); landedEntries.set(row.ordinal, JSON.parse(JSON.stringify(snapshot.index.notes[row.file])));
					try { _rapierNotesHold(row.file, row.bytes ? new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(row.bytes) : row.text); } catch (_) {}
					landed.push({file: row.file, text: row.text, note: notes[row.ordinal]});
					if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(row.file);
					written++;
				}
				completed = written;
			} catch (error) { uncertain = true; why = String(error?.message || error); }
			outcome = {batch: batch.index, status: completed === batch.count && !uncertain ? 'complete' : 'failed', completed, written, uncertain, ...(why ? {why} : {})};
		} else {
			let completed = 0, why = '';
			const receiptWriter = Receipt.createImportReceiptWriter(record);
			try {
				for (const item of batch.items) {
					const file = landedNames.get(item.ordinal);
					if (file !== item.file) throw new Error('a note landed under another name than the one planned, so its record could not be verified');
					const back = await _rapierNotesStore.read(file, {bytes: true});
					if (!(back instanceof Uint8Array)) throw new Error('the imported note is missing during read-back: ' + file);
					const entry = landedEntries.get(item.ordinal);
					if (!entry || state.index.notes[file]?.id !== entry.id) throw new Error('the imported note identity changed before verification');
					const method = record.written.some(row => row.file === file) ? 'recheckWrite' : 'verifyWrite';
					await receiptWriter[method]({...notes[item.ordinal], file, text: item.text}, {bytes: back, entry, created: true});
					completed++;
				}
			} catch (error) { why = String(error?.message || error); receiptError = error; }
			finally { record = receiptWriter.finish(); }
			outcome = {batch: batch.index, status: completed === batch.count ? 'complete' : 'failed', completed, ...(why ? {why} : {})};
		}
		landing = Landing.advanceImportLanding(landing, outcome);
		checkpoint();
		if (landing.batch) await turn();
	}
	if (!notes.length && sectionsToMake.length) {
		const snapshot = await _rapierNotesStore.folder.importBatch(() => ({notes: [], sections: sectionsToMake,
			sectionsAdded: sectionsToMake.map(name => ({name, collapsed: added.get(name) === true})),
			...(record ? {importReceipt: record, receiptCheckpoint} : {})}));
		if (record) {
			receiptCheckpoint = snapshot.receiptCheckpoint;
			record = Receipt.recordImportSections(receiptCheckpoint.receipt, snapshot.result.createdSections || []);
		}
		_rapierNotesTake(snapshot);
	}
	const stopped = landing.status !== 'complete';
	if (record) {
		try {
			const sectionsMade = (record.createdSections || []).map(section => section.name);
			if (!stopped && record.written.length === record.notes.length) { importVerified = true; record = Receipt.finishImportReceipt(record, {status: 'complete', sections: sectionsMade}); }
			else record = Receipt.finishImportReceipt(record, {status: landing.status === 'cancelled' ? 'cancelled' : 'failed', why: landing.stop?.why || String(receiptError?.message || receiptError || 'the landing stopped'), sections: sectionsMade});
			await saveReceipt();
		} catch (error) {
			console.warn('[rapier] notes import receipt', error);
			receiptError = receiptError || error;
			showToast(importVerified ? 'Imported notes were read back, but their record could not be saved. Keep the export and reopen Notes to check the folder.' : 'The imported notes could not all be verified. Keep the export and reopen Notes to check the folder before closing.', 'error');
		}
	} else if (landed.length || (sections && sections.length)) await _rapierNotesWriteIndex();
	void _rapierNotesStorageAnswer(false);
	const from = Object.keys(sources || {}).filter(k => sources[k] > 0).map(k => RAPIER_NOTES_IMPORT_SOURCE_WORDS[k] || k);
	const noted = notes.filter(note => (note.warnings || []).some(warning => !String(warning?.code || '').startsWith('picture_') && warning?.code !== 'backup-paths-renamed')).length;
	const pathsRenamed = notes.some(note => (note.warnings || []).some(warning => warning?.code === 'backup-paths-renamed'));
	const count = notes.length === 1 ? '1 note' : notes.length + ' notes';
	const keptFiles = (result.attachments || []).length + backupSavedFiles;
	const said = from.length ? ' from ' + (from.length === 1 ? from[0] : from.length + ' sources') : '';
	const short = [skipped.length ? skipped.length + ' skipped' : '',
		missing ? missing + (missing === 1 ? ' picture' : ' pictures') + ' not among the picked files' : '',
		ambiguous ? ambiguous + (ambiguous === 1 ? ' picture' : ' pictures') + ' left out (two picked files share a name)' : '',
		refusedPictures ? refusedPictures + (refusedPictures === 1 ? ' picture' : ' pictures') + ' not brought in' : '',
		pastKept ? pastKept + (pastKept === 1 ? ' existing note history kept' : ' existing note histories kept') : '',
		pastFailed ? pastFailed + (pastFailed === 1 ? ' note history' : ' note histories') + ' not saved' : '',
		unplaced ? unplaced + (unplaced === 1 ? ' file' : ' files') + ' left in the backup' : '',
		pathsRenamed ? 'some files renamed; check their links' : ''].filter(Boolean);
	if (pastObjectsFailed) showToast(pastObjectsFailed + (pastObjectsFailed === 1 ? ' history file' : ' history files') + ' could not be verified. Keep the original backup.', 'error');
	if (stopped) {
		const verified = landing.position?.landedVerified.length || 0;
		const where = landing.stop?.kind === 'verify' ? 'The imported notes could not all be verified.' : 'The import stopped; ' + verified + (verified === 1 ? ' note was verified.' : ' notes were verified.');
		showToast(where + ' Keep the export and check Imports in Notes settings before closing.', 'error');
	} else if (!receiptError) {
		let message;
		if (notes.length) {
			const lead = 'Imported ' + count + (short.length || noted ? '' : said) + (keptFiles ? ' and ' + keptFiles + (keptFiles === 1 ? ' saved file' : ' saved files') : '') + '.';
			const detail = short.length ? short.join('; ').replace(/^./, c => c.toUpperCase()) + '; keep the export and see Imports in Notes settings.' : noted ? 'Check Imports in Notes settings for details; keep the export.' : '';
			message = lead + (detail ? ' ' + detail : '');
			if (message.length > 150) message = lead + ' Some items need checking; keep the export and see Imports in Notes settings.';
		} else if (keptFiles) {
			message = 'Kept ' + keptFiles + (keptFiles === 1 ? ' file' : ' files') + ' in Saved files.' + (skipped.length ? ' Keep the export and check skipped files in Imports in Notes settings.' : '');
		} else if (unoffered?.length) {
			message = 'Nothing imported; a selected format could not be read. Keep the export and choose another export format.';
		} else if (skipped.length) {
			message = 'Nothing imported; ' + skipped.length + (skipped.length === 1 ? ' selected file' : ' selected files') + ' could not be read. Keep the export and try the files separately.';
		} else message = 'Nothing imported; no notes were found. Pick a notes export or Markdown files.';
		showToast(message, notes.length || keptFiles ? 'info' : 'error');
	}
	for (const backup of result.backups || []) if (backup.verification?.complete === false) {
		const missing = backup.verification.missingParts || [], omitted = backup.verification.omitted || [];
		let detail = missing.length ? 'Missing parts: ' + missing.slice(0, 3).join(', ') + (missing.length > 3 ? ' and ' + (missing.length - 3) + ' more' : '') : '';
		if (omitted.length) detail += (detail ? '; ' : '') + omitted.length + (omitted.length === 1 ? ' file was' : ' files were') + ' not included in this backup';
		if (!detail) detail = 'This is not a full restore';
		const next = (omitted.length ? ' Keep the original files and backup' : ' Keep every part of the source backup') + (record ? '; check Imports in Notes settings.' : '.');
		if (detail.length + next.length + 1 > 150) detail = (missing.length ? missing.length + (missing.length === 1 ? ' backup part missing' : ' backup parts missing') : '') + (missing.length && omitted.length ? '; ' : '') + (omitted.length ? omitted.length + (omitted.length === 1 ? ' file omitted' : ' files omitted') : '');
		showToast(detail + '.' + next, 'info');
	}
	if (state.open) _rapierNotesRender(); else if (!state.mode) { try { const overlay = _rapierUi?.refs?.settingsOverlay; if (overlay && typeof closeDialog === 'function') closeDialog(overlay); } catch (_) {} await _rapierNotesOpen(); }
}
function _rapierNotesDataUrl(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(file); }); }

async function _rapierNotesExportBackup(file, name) {
	const files = globalThis.RapierPlatform?.files;
	const exportFile = typeof files?.exportArtifact === 'function' ? files.exportArtifact : typeof files?.saveAs === 'function' ? files.saveAs : null;
	if (exportFile) {
		try {
			const raw = await exportFile.call(files, file, name);
			if (raw === false || raw?.status === 'cancelled' || raw?.status === 'denied') return {status: 'cancelled'};
			if (_rapierExportOutcome(raw) !== true || raw?.status === 'failed') throw new Error(raw?.error || 'the destination did not accept the file');
			return {status: raw?.confirmed === true ? 'confirmed' : 'dispatched', name: raw?.destinationName || name};
		} catch (error) {
			if (error?.name === 'AbortError' || error?.name === 'NotAllowedError') return {status: 'cancelled'};
			if (error?.name !== 'SecurityError') throw error;
			console.warn('[rapier] notes export: this browser would not open a destination chooser here; the ordinary route instead', error);
		}
	}
	try {
		if (typeof navigator.share === 'function' && navigator.canShare?.({files: [file]})) {
			await navigator.share({files: [file], title: name});
			return {status: 'dispatched', route: 'share', name};
		}
	} catch (error) {
		if (error?.name === 'AbortError' || error?.name === 'NotAllowedError') return {status: 'cancelled'};
		throw error;
	}
	const url = URL.createObjectURL(file), a = document.createElement('a');
	try { a.href = url; a.download = name; a.hidden = true; document.body.appendChild(a); a.click(); }
	finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
	return {status: 'dispatched', name};
}
async function _rapierNotesBackupLease() {
	if (!await _rapierNotesStore.kind()) return () => {};
	if (typeof navigator.locks?.request !== 'function') throw new Error('This browser cannot make a backup safely.');
	return globalThis.RapierNotesBackup.acquireBackupLease(callback => navigator.locks.request('rapier-notes-backup-staging', {ifAvailable:true}, callback));
}
async function _rapierNotesExportPreparedBackup() {
	const state = _rapierNotes;
	if (state.backupBusy) return;
	state.backupBusy = true; let release;
	try { release = await _rapierNotesBackupLease(); await _rapierNotesSendPreparedBackup(); }
	catch (error) { showToast('The export did not complete. The backup copy was not discarded: ' + String(error?.message || error), 'error'); }
	finally { await release?.(); state.backupBusy = false; }
}
async function _rapierNotesExportAndroidBackup(session) {
	const state = _rapierNotes, B = globalThis.RapierNotesBackup, call = globalThis.RapierPlatform?.host?.notesBackup;
	if (state.backupBusy || typeof call !== 'function') return;
	state.backupBusy = true;
	let release, progress;
	const stages = [], outcomes = [], controller = new AbortController();
	try {
		state.backupController = controller; progress = _rapierNotesBackupProgress(controller);
		release = await _rapierNotesBackupLease();
		const stamp = new Date(), name = _rapierNotesBackupName(stamp).replace('rapier-notes-', 'rapier-android-restored-');
		const result = await B.exportAndroidBackup(call, session, async partName => {
			if (!progress) progress = _rapierNotesBackupProgress(controller);
			const stage = await _rapierNotesCreateBackupStage(partName, []); stages.push(stage); return stage.sink;
		}, {name, stamp: stamp.getTime(), appVersion: document.querySelector('meta[name="rapier-version"]')?.content || 'unknown', signal: controller.signal,
			onProgress: value => progress?.update(value), onPart: async part => {
				const file = await B.detachBackupFile(part.file, {name: part.name, bytes: part.bytes, digest: part.sink.digest}, {signal: controller.signal, onProgress: value => progress?.update(value)});
				progress?.close(); progress = null;
				const outcome = await _rapierNotesExportBackup(file, part.name);
				if (outcome.status === 'cancelled') return false;
				outcomes.push(outcome); await part.sink.discard(); return true;
			}});
		if (result.completed) showToast((outcomes.every(row => row.status === 'confirmed') ? 'Exported' : 'Sent') + ' the restored ' + (result.recovery ? 'recovery files' : 'backup') + '. The original Android snapshot is still kept.' + (result.recovery ? ' The ZIP contains the original files; this reader cannot merge their history.' : ''), 'info');
	} catch (error) { showToast('The restored backup is still kept: ' + String(error?.message || error), 'error'); }
	finally {
		for (const stage of stages) if (stage.sink.state === 'sealed') try { await stage.sink.discard(); } catch (_) {}
		progress?.close(); await release?.(); state.backupBusy = false; state.backupController = null;
	}
}
async function _rapierNotesBackupWorkerStart() {
	const W = globalThis.RapierNotesBackupWorker;
	if (!W || typeof Worker !== 'function') return null;
	if (!await _rapierNotesStore.kind() || _rapierNotesStore.native) return null;
	const url = URL.createObjectURL(new Blob([W.workerSource()], {type: 'text/javascript'}));
	try { return {worker: new Worker(url), url}; }
	catch (_) { URL.revokeObjectURL(url); return null; }
}
async function _rapierNotesBackupStageHandles() {
	const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle('rapier-backup-staging', {create: true});
	const id = crypto.randomUUID(), attempt = await dir.getDirectoryHandle(id, {create: true});
	const archive = await attempt.getFileHandle('archive.partial', {create: true});
	return {attempt, archive, location: 'rapier-backup-staging/' + id, remove: () => dir.removeEntry(id, {recursive: true})};
}
async function _rapierNotesCreateBackupStage(name, names, group, number = 1) {
	const B = globalThis.RapierNotesBackup;
	if (!await _rapierNotesStore.kind()) return {sink: B.createBackupSink(B.memoryBackupTarget({names, makeFile: chunks => new File(chunks, name, {type: 'application/zip'})})), location: 'this page'};
	const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle('rapier-backup-staging', {create: true});
	const id = group?.id || crypto.randomUUID(), attempt = group?.directory || await dir.getDirectoryHandle(id, {create: true});
	const partial = group ? 'part-' + number + '.partial' : 'archive.partial';
	let writable;
	try { writable = await (await attempt.getFileHandle(partial, {create: true})).createWritable(); }
	catch (error) { try { if (group) await attempt.removeEntry(partial); else await dir.removeEntry(id, {recursive: true}); } catch (cleanup) { throw new AggregateError([error, cleanup], 'backup staging could not be opened or removed'); } throw error; }
	let held = [], heldBytes = 0;
	const flush = async () => { if (!held.length) return; const parts = held; held = []; heldBytes = 0; await writable.write(new Blob(parts)); };
	const sink = B.createBackupSink({
		write: async bytes => { held.push(bytes.slice()); heldBytes += bytes.length; if (heldBytes >= 1048576) await flush(); },
		close: async () => { await flush(); await writable.close(); }, abort: reason => writable.abort(reason),
		file: async () => new File([await (await attempt.getFileHandle(partial)).getFile()], name, {type: 'application/zip'}),
		remove: () => group ? attempt.removeEntry(partial) : dir.removeEntry(id, {recursive: true})
	});
	return {sink, location: 'rapier-backup-staging/' + id, directory: attempt};
}
async function _rapierNotesRecoverBackupStage() {
	const state = _rapierNotes, B = globalThis.RapierNotesBackup;
	if (state.preparedBackup || state.unfinishedBackup || !await _rapierNotesStore.kind()) return;
	let dir;
	try { dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('rapier-backup-staging'); }
	catch (error) { if (_rapierNotesStore.missing(error)) return; throw error; }
	const found = [];
	for await (const [id, attempt] of dir) {
		if (attempt.kind !== 'directory') continue;
		const location = 'rapier-backup-staging/' + id, remove = () => dir.removeEntry(id, {recursive: true});
		try {
			const marker = await (await attempt.getFileHandle('ready.json')).getFile();
			if (marker.size > B.BACKUP_STAGE_MAX_BYTES) throw new Error('private backup completion record is too large');
			const record = B.backupStageRecord(JSON.parse(await marker.text()));
			const sink = record.sequence ? {discard:remove} : B.retainedBackupSink({file: async () => new File([await (await attempt.getFileHandle('archive.partial')).getFile()], record.name, {type:'application/zip'}), remove}, record);
			found.push({...record, sink, location, directory:attempt, id});
		} catch (error) { state.unfinishedBackup ||= {location, remove, reason:String(error?.message || error)}; }
	}
	if (!found.length) return;
	found.sort((a, b) => Date.parse(b.stamp) - Date.parse(a.stamp));
	const [newest, ...older] = found;
	state.preparedBackup = newest;
	if (!newest.sequence || newest.sent.length === newest.plan.parts.length) for (const copy of older) await _rapierNotesRetireBackup(copy);
}
async function _rapierNotesSealBackupStage(prepared) {
	if (!prepared.directory) return;
	const record = globalThis.RapierNotesBackup.backupStageRecord(prepared.sequence ? prepared : {...prepared, digest:prepared.sink.digest});
	const text = JSON.stringify(record);
	if (new TextEncoder().encode(text).length > globalThis.RapierNotesBackup.BACKUP_STAGE_MAX_BYTES) throw new Error('private backup completion record is too large');
	const handle = await prepared.directory.getFileHandle('ready.json', {create:true});
	const writer = await handle.createWritable();
	try { await writer.write(text); await writer.close(); await _rapierNotesStore.verifyFile(handle, text); }
	catch (error) { try { await writer.abort(); } catch (_) {} throw error; }
}
async function _rapierNotesDiscardUnfinishedBackup() {
	const state = _rapierNotes, unfinished = state.unfinishedBackup;
	if (!unfinished || state.backupBusy) return;
	state.backupBusy = true; let release;
	try { release = await _rapierNotesBackupLease(); if (!await rapierConfirm({title:'Discard unfinished backup?', message:'• Discards the unfinished backup.\n• Parts already sent stay.\n• Your notes are unchanged.', confirmLabel:'Discard', cancelLabel:'Keep', destructive: true})) return;
	await unfinished.remove(); state.unfinishedBackup = null; showToast('The unfinished backup was discarded. The notes are unchanged.', 'info'); }
	catch (error) { showToast('The unfinished backup was kept: ' + String(error?.message || error), 'error'); }
	finally { await release?.(); state.backupBusy = false; }
}
async function _rapierNotesContinueBackupSet(prepared, {again = false, inventory, assertCurrent, onProgress, signal, snapshot} = {}) {
	try {
	const state = _rapierNotes, B = globalThis.RapierNotesBackup, count = prepared.plan.parts.length;
	const early = again ? 'This is the earlier copy, not a new backup. ' : '';
	if (again && prepared.sent.length < count) showToast(early + 'Part ' + (prepared.sent.length + 1) + ' of ' + count + ' is next; keep the parts already sent.', 'info');
	const persist = candidate => _rapierNotesSealBackupStage(candidate);
	const pendingSink = () => { const pending = prepared.pending; return prepared.pendingSink || B.retainedBackupSink({
		file: async () => new File([await (await prepared.directory.getFileHandle('part-' + pending.number + '.partial')).getFile()], pending.name, {type:'application/zip'}),
		remove: () => prepared.directory.removeEntry('part-' + pending.number + '.partial')
	}, pending); };
	const send = async (file, sink, current) => {
		if (signal?.aborted) return false;
		const detached = await B.detachBackupFile(file, prepared.pending, {onProgress, signal});
		if (signal?.aborted) return false;
		if (current && !await current()) throw new Error('the backup snapshot changed before export');
		const outcome = await _rapierNotesExportBackup(detached, prepared.pending.name);
		if (outcome.status === 'cancelled') return false;
		const candidate = {...prepared, sent:[...prepared.sent, outcome], pending:null};
		await persist(candidate);
		prepared.sent = candidate.sent; prepared.pending = null;
		await sink.discard(); prepared.pendingSink = null;
		return true;
	};
	if (prepared.directory) for await (const [name, handle] of prepared.directory) {
		if (handle.kind === 'file' && /^part-[1-9][0-9]*\.partial$/.test(name) && Number(name.slice(5, -8)) <= prepared.sent.length) await prepared.directory.removeEntry(name);
	}
	if (prepared.pending) {
		const sink = pendingSink();
		if (!await send(await sink.file({onProgress}), sink)) { showToast(early + 'Stopped after ' + prepared.sent.length + ' of ' + count + ' backup parts: part ' + (prepared.sent.length + 1) + ' is kept here; keep the parts already sent.', 'info'); return; }
	}
	if (prepared.sent.length < count) {
		if (typeof navigator.storage?.estimate === 'function') {
			const estimate = await navigator.storage.estimate(), largest = Math.max(...prepared.plan.parts.slice(prepared.sent.length).map(part => part.bytes));
			const metadata = new TextEncoder().encode(JSON.stringify({plan:prepared.plan, options:prepared.options})).length * 2 + 4096;
			let reclaimed = 0;
			if (prepared.directory) { try { reclaimed = (await (await prepared.directory.getFileHandle('part-' + (prepared.sent.length + 1) + '.partial')).getFile()).size; } catch (error) { if (!_rapierNotesStore.missing(error)) throw error; } }
			if (Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage) && estimate.quota - estimate.usage + reclaimed < largest + metadata) throw new Error('Not enough space for one backup part beside your notes; free space and try again');
		}
		if (!inventory) {
			await _rapierNotesFlush(); await _rapierNotesStore.settle();
			snapshot = await _rapierNotesStore.folder.backupSnapshot();
			inventory = await B.backupInventory(_rapierNotesStore, {signal, onProgress, concurrency: (await _rapierNotesStore.port()) ? 1 : 4});
			const names = inventory.map(row => row.name).join('\n');
			assertCurrent = async () => await snapshot.current() && names === (await B.backupNames(_rapierNotesStore)).join('\n');
			const declared = new Map([...prepared.plan.manifest.files, ...prepared.plan.omitted].map(row => [row.name, row.bytes]));
			if (inventory.length !== declared.size || inventory.some(row => declared.get(row.name) !== row.size)) throw new Error('The notes changed since this earlier backup; discard this backup copy to start a new complete set');
		}
		const byName = new Map(inventory.map(row => [row.name, row]));
		await B.writeBackupSet(selected => B.folderBackupSource(_rapierNotesStore, {inventory:selected.map(name => byName.get(name)), stamp:prepared.options.stamp, signal}), async (partName, number) => {
			const stage = await _rapierNotesCreateBackupStage(partName, prepared.plan.parts[number - 1].names, prepared.directory ? prepared : null, number);
			prepared.pendingSink = stage.sink; return stage.sink;
		}, {...prepared.options, plan:prepared.plan, name:prepared.name, startPart:prepared.sent.length + 1,
			preparedManifest:state.preparedBackup === prepared ? prepared.plan.manifest : null, assertCurrent, signal, onProgress,
			onPrepared:async manifest => {
				if (state.preparedBackup === prepared) {
					if (prepared.directory) for await (const [name, handle] of prepared.directory) if (handle.kind === 'file' && name === 'part-' + (prepared.sent.length + 1) + '.partial') await prepared.directory.removeEntry(name);
					return;
				}
				prepared.plan = {...prepared.plan, manifest};
				if (await _rapierNotesStore.kind()) {
					const parent = await (await navigator.storage.getDirectory()).getDirectoryHandle('rapier-backup-staging', {create:true});
					prepared.id = crypto.randomUUID(); prepared.directory = await parent.getDirectoryHandle(prepared.id, {create:true});
					prepared.sink = {discard:() => parent.removeEntry(prepared.id, {recursive:true})};
				} else prepared.sink = {discard:async () => { if (prepared.pendingSink?.state === 'sealed') await prepared.pendingSink.discard(); }};
				prepared.location = prepared.directory ? 'rapier-backup-staging/' + prepared.id : 'this page';
				Object.assign(prepared, B.backupStageRecord(prepared));
				state.preparedBackup = prepared; await persist(prepared);
			},
			onPart:async part => {
				prepared.pending = {number:part.number, name:part.name, bytes:part.bytes, files:part.files, stamp:prepared.stamp, digest:part.sink.digest};
				await persist(prepared);
				return await send(part.file, part.sink, assertCurrent) && !signal?.aborted;
			}
		});
	}
	if (prepared.sent.length !== count) { showToast(early + 'Stopped after ' + prepared.sent.length + ' of ' + count + ' backup parts: part ' + (prepared.sent.length + 1) + ' is next; keep the parts already sent.', 'info'); return; }
	await snapshot?.release();
	const outcomes = prepared.sent, confirmed = outcomes.every(outcome => outcome.status === 'confirmed');
	const route = outcomes.every(outcome => (outcome.route || 'file') === (outcomes[0].route || 'file')) ? outcomes[0].route || 'file' : 'mixed';
	await _rapierNotesRememberBackup({name:prepared.name, names:outcomes.map(outcome => outcome.name), setId:prepared.setId, parts:count, files:prepared.files, bytes:prepared.bytes, stamp:prepared.stamp, confirmed, route, omitted:prepared.omitted});
	const omitted = prepared.omitted.length ? ' Not included: ' + prepared.omitted.map(row => row.name).join(', ') + '; keep their originals, and restore this copy with Add backup.' : ' Keep the parts together to restore.';
	showToast((confirmed ? 'Backed up ' : 'Backup sent to destinations: ') + count + (count === 1 ? ' part' : ' parts') + ', ' + _rapierNotesBytesWords(prepared.bytes) + '.' + omitted + (again ? ' This is the earlier copy, not a new backup.' : ''), confirmed && !prepared.omitted.length ? 'success' : 'info');
	_rapierNotesStorageLines();
	} finally { await snapshot?.release(); }
}
async function _rapierNotesRememberBackup(backup) {
	const state = _rapierNotes, store = _rapierNotesStore;
	try {
		if (!await store.kind()) { state.lastBackup = backup; return true; }
		const snapshot = await store.folder.owner.transact(store.folder.scope, ({index}) =>
			Date.parse(index.lastBackup?.stamp) > Date.parse(backup.stamp) ? {index}
			: {kind: 'backup-export', index: {...index, lastBackup: backup}, writes: []});
		state.lastBackup = snapshot.index.lastBackup;
		state.indexBase = {...state.indexBase, lastBackup: state.lastBackup};
		state.index = {...state.index, lastBackup: state.lastBackup};
		return true;
	} catch (_) {
		showToast('The backup was sent, but its date could not be kept. Check the file on your device.', 'info');
		return false;
	}
}
async function _rapierNotesSendPreparedBackup({again = false, verifiedFile, onProgress, signal} = {}) {
	const state = _rapierNotes, prepared = state.preparedBackup;
	if (!prepared) return;
	if (prepared.sequence) return _rapierNotesContinueBackupSet(prepared, {again, onProgress, signal});
	const file = verifiedFile && verifiedFile instanceof File ? verifiedFile : await prepared.sink.file({onProgress});
	if (signal?.aborted) return;
	const outcome = await _rapierNotesExportBackup(file, prepared.name);
	if (outcome.status === 'cancelled') return;
	await _rapierNotesRememberBackup({name: outcome.name, files: prepared.files, bytes: prepared.bytes, stamp: prepared.stamp, confirmed: outcome.status === 'confirmed', route: outcome.route || 'file'});
	const word = prepared.files === 1 ? '1 file' : prepared.files.toLocaleString('en') + ' files';
	const message = outcome.status === 'confirmed' ? 'Backed up ' + word + ' as ' + outcome.name
		: outcome.route === 'share' ? 'Backup sent to share destination: ' + outcome.name : 'Backup download started: ' + outcome.name;
	showToast(message + '.' + (again ? ' This is the earlier copy, prepared ' + new Date(prepared.stamp).toLocaleString('en') + ', not a new backup.' : ''), outcome.status === 'confirmed' ? 'success' : 'info');
	_rapierNotesStorageLines();
}
async function _rapierNotesDiscardPreparedBackup() {
	const state = _rapierNotes, prepared = state.preparedBackup;
	if (!prepared || state.backupBusy) return;
	state.backupBusy = true; let release;
	try { release = await _rapierNotesBackupLease(); const yes = await rapierConfirm({title: 'Discard backup copy?', message: 'Discard only the backup copy prepared here on ' + new Date(prepared.stamp).toLocaleString('en') + '? Your notes and any exported copy are unchanged.', confirmLabel: 'Discard', cancelLabel: 'Keep', destructive: true});
	if (!yes) return;
	await prepared.sink.discard(); state.preparedBackup = null; showToast('The backup copy was discarded. The notes are unchanged.', 'info'); }
	catch (error) { showToast('The backup copy could not be removed: ' + String(error?.message || error), 'error'); }
	finally { await release?.(); state.backupBusy = false; }
}
function _rapierNotesBackupProgress(controller) {
	const popup = _rapierProgressOpen({label: 'Backing up', cancel: () => controller.abort(new Error('Backup preparation cancelled'))});
	return {
		update({phase, files, totalFiles, bytes, totalBytes}) {
			popup.set(bytes != null && totalBytes > 0 ? bytes / totalBytes : files != null && totalFiles > 0 ? files / totalFiles : null,
				/verif|check/i.test(phase || '') ? 'Checking backup' : 'Backing up');
		},
		close: popup.end,
	};
}
function _rapierNotesBackupName(stamp, before = []) {
	const pad = (n, width = 2) => String(n).padStart(width, '0'), second = Math.floor(stamp.getTime() / 1000);
	const base = 'rapier-notes-' + stamp.getFullYear() + '-' + pad(stamp.getMonth() + 1) + '-' + pad(stamp.getDate())
		+ '-' + pad(stamp.getHours()) + '-' + pad(stamp.getMinutes()) + '-' + pad(stamp.getSeconds());
	return before.some(at => Math.floor(Date.parse(at) / 1000) === second) ? base + '-' + pad(stamp.getMilliseconds(), 3) + '.zip' : base + '.zip';
}
async function _rapierNotesRetireBackup(earlier) {
	if (!earlier || _rapierNotes.preparedBackup === earlier) return;
	try { await earlier.sink.discard(); }
	catch (error) { console.warn('[rapier] notes backup: the earlier prepared copy stays until the next open', error); }
}
async function _rapierNotesBackup() {
	const state = _rapierNotes;
	if (state.backupBusy) return;
	state.backupBusy = true;
	let stage, release, progress, snapshot, earlier = null;
	try {
		const signal = (state.backupController = new AbortController()).signal;
		progress = _rapierNotesBackupProgress(state.backupController);
		await _rapierNotesReady();
		const B = globalThis.RapierNotesBackup;
		if (!B) throw new Error('the backup writer did not load');
		release = await _rapierNotesBackupLease();
		await _rapierNotesRecoverBackupStage();
		if (state.unfinishedBackup) { showToast('An unfinished backup is kept here: discard it in Notes settings, then try again.', 'error'); return; }
		const prepared = state.preparedBackup;
		if (prepared?.sequence && prepared.sent.length < prepared.plan.parts.length) { await _rapierNotesSendPreparedBackup({again: true, onProgress: progress.update, signal}); return; }
		earlier = prepared || null;
		await _rapierNotesFlush(); await _rapierNotesStore.settle();
		snapshot = await _rapierNotesStore.folder.backupSnapshot();
		const indexText = _rapierNotesModel().serializeIndex(snapshot.index);
		progress.update({phase: 'Reading folder', files: 0});
		const inventory = await B.backupInventory(_rapierNotesStore, {signal, onProgress: progress.update, concurrency: (await _rapierNotesStore.port()) ? 1 : 4});
		if (!inventory.length) { showToast('The notes folder is empty; nothing to back up', 'info'); return; }
		const stamp = new Date(), name = _rapierNotesBackupName(stamp, [earlier?.stamp, state.lastBackup?.stamp]);
		const backupOptions = {appVersion: document.querySelector('meta[name="rapier-version"]')?.content || 'unknown', stamp: stamp.getTime(),
			comment: 'Rapier notes backup, ' + inventory.length + ' files, ' + stamp.toISOString()};
		const plan = B.preflightBackup(inventory, {...backupOptions, indexText});
		const names = inventory.map(row => row.name).join('\n');
		const payloadBytes = inventory.reduce((sum, row) => sum + row.size, 0);
		const onProgress = value => progress.update({totalFiles: inventory.length, totalBytes: payloadBytes, ...value});
		const assertCurrent = async () => await snapshot.current() && names === (await B.backupNames(_rapierNotesStore)).join('\n');
		state.backupPath = 'main-thread';
		if (plan.parts.length > 1 || plan.omitted.length) {
			state.backupPath = 'main-thread-set';
			const set = {sequence:true, name, stamp:stamp.toISOString(), plan, options:backupOptions, sent:[], pending:null};
			await _rapierNotesContinueBackupSet(set, {inventory, assertCurrent, signal, onProgress, snapshot});
			if (state.preparedBackup === set && set.sent.length === set.plan.parts.length) await _rapierNotesRetireBackup(earlier);
			return;
		}
		const started = await _rapierNotesBackupWorkerStart();
		let handles = null;
		if (started) {
			try { handles = await _rapierNotesBackupStageHandles(); }
			catch (error) {
				started.worker.terminate(); URL.revokeObjectURL(started.url);
				console.warn('[rapier] notes backup: the worker could not take its private staging', error);
			}
		}
		if (handles) {
			const client = globalThis.RapierNotesBackupWorker.createBackupWorkerClient({postMessage: message => started.worker.postMessage(message), assertCurrent, onProgress});
			started.worker.onmessage = event => { void client.receive(event.data); };
			started.worker.onerror = event => { client.fail(new Error(event?.message || 'the backup worker failed')); };
			started.worker.onmessageerror = () => { client.fail(new Error('a backup worker message could not be read')); };
			let outcome;
			try {
				outcome = await client.prepare({directory: await _rapierNotesDir(), names: inventory.map(row => row.name), archive: handles.archive, staging: handles.attempt, name, options: backupOptions}, {signal});
			} catch (error) {
				if (error?.disposition === 'removed' || error?.disposition === 'untouched') { try { await handles.remove(); } catch (_) {} }
				throw error;
			} finally { started.worker.terminate(); URL.revokeObjectURL(started.url); }
			if (outcome.status === 'unavailable') { try { await handles.remove(); } catch (_) {} }
			else {
				state.backupPath = 'worker';
				const sink = B.retainedBackupSink({file: async () => new File([await (await handles.attempt.getFileHandle('archive.partial')).getFile()], name, {type: 'application/zip'}), remove: handles.remove}, outcome.record);
				stage = {sink, location: handles.location, directory: handles.attempt};
				state.preparedBackup = {...stage, name, files: inventory.length, bytes: outcome.record.bytes, stamp: stamp.toISOString()};
				await _rapierNotesSealBackupStage(state.preparedBackup);
				await _rapierNotesRetireBackup(earlier);
				if (outcome.status === 'cancelled' || signal.aborted) { showToast('Backup cancelled; nothing was sent. The backup copy is kept: export it from Notes settings.', 'info'); return; }
				state.backupController = null;
				progress.close();
				await snapshot.release();
				await _rapierNotesSendPreparedBackup({verifiedFile: outcome.file});
				return;
			}
		}
		stage = await _rapierNotesCreateBackupStage(name, inventory.map(row => row.name));
		const result = await B.writeBackupStream(B.folderBackupSource(_rapierNotesStore, {inventory, stamp: stamp.getTime(), signal}), stage.sink, {
			...backupOptions, signal, assertCurrent, onProgress
		});
		state.preparedBackup = {...stage, name, files: inventory.length, bytes: result.bytes, stamp: stamp.toISOString()};
		await _rapierNotesSealBackupStage(state.preparedBackup);
		await _rapierNotesRetireBackup(earlier);
		if (signal.aborted) { showToast('Backup cancelled; nothing was sent. The backup copy is kept: export it from Notes settings.', 'info'); return; }
		state.backupController = null;
		progress.close();
		await snapshot.release();
		await _rapierNotesSendPreparedBackup({verifiedFile: result.file});
	} catch (error) {
		console.warn('[rapier] notes backup', error);
		if (error?.name === 'BackupLimitError') {
			progress?.close();
			await rapierConfirm({title: 'Too much for one backup', message: error.message, confirmLabel: 'OK'});
			return;
		}
		const made = state.preparedBackup === earlier ? null : state.preparedBackup;
		const full = error?.name === 'QuotaExceededError' ? 'the browser\'s storage for this site is full; free some space (the backup copies in Notes settings, other sites\' data) and press Backup again' : '';
		showToast('The backup did not complete: ' + (full || String(error?.message || error).replace(/[.\s]+$/, '')) + (made?.sequence ? (made.sent.length === made.plan.parts.length ? '. All parts were sent: press Backup again to finish.' : '. Part ' + (made.sent.length + 1) + ' is next; keep the parts already sent.') : stage?.sink.state === 'sealed' ? '. The completed backup copy was kept.' : '. The notes are unchanged.'), 'error');
	} finally { progress?.close(); await snapshot?.release(); await release?.(); state.backupBusy = false; state.backupController = null; }
}

function _rapierNotesBarRoom() {
	const state = _rapierNotes, scroll = state.scroll; if (!scroll) return;
	const box = el => (el && !el.hidden ? el.getBoundingClientRect().height : 0);
	const want = Math.round(box(state.find) + box(document.getElementById('rapier-notes-filters')) + box(state.addsBar));
	const was = state.barRoom || 0;
	if (want === was) return;
	const at = scroll.scrollTop;
	state.barRoom = want;
	scroll.style.setProperty('--notes-bar-room', want + 'px');
	const target = Math.max(0, at + (want - was));
	if (state.scrollRoom && !want) scroll.style.setProperty('--notes-scroll-room', '0px');
	else if (state.scrollRoom) {
		scroll.appendChild(state.scrollRoom);
		scroll.style.setProperty('--notes-scroll-room', '0px');
		const box = scroll.getBoundingClientRect();
		let last = scroll.lastElementChild;
		while (last && (last === state.scrollRoom || last.getClientRects().length === 0)) last = last.previousElementSibling;
		const bottom = last ? (last.getBoundingClientRect().bottom - box.top) + scroll.scrollTop : 0;
		const foot = parseFloat(getComputedStyle(scroll).paddingBottom) || 0;
		const missing = Math.ceil(scroll.clientHeight + want - (bottom + foot));
		if (missing > 0) scroll.style.setProperty('--notes-scroll-room', missing + 'px');
	}
	_rapierNotesScrollQuiet();
	scroll.scrollTop = target;
	_rapierNotesFabTrack();
}
function _rapierNotesSearchToggle(want) {
	const state = _rapierNotes, btn = state.surface.querySelector('[data-notes-act="search"]');
	const open = want == null ? state.find.hidden : !!want;
	if (open === !state.find.hidden) return;
	if (open) _rapierNotesAddsToggle(false);
	state.find.hidden = !open; btn.setAttribute('aria-expanded', String(open));
	if (open) { btn.dataset.active = 'true'; state.search.focus(); if (typeof _rapierNotesLibraryChips === 'function') _rapierNotesLibraryChips(); _rapierNotesBarRoom(); }
	else { const back = !!(document.activeElement && state.find.contains(document.activeElement)); delete btn.dataset.active; state.search.value = ''; state.query = ''; if (typeof _rapierNotesLibraryChips === 'function') _rapierNotesLibraryChips(); _rapierNotesBarRoom(); _rapierNotesRender(); if (back) btn.focus({ preventScroll: true }); }
}
function _rapierNotesAddsToggle(want) {
	const state = _rapierNotes, bar = state.addsBar; if (!bar) return;
	const btn = state.surface.querySelector('[data-notes-act="adds"]');
	const open = want == null ? bar.hidden : !!want;
	if (open === !bar.hidden) return;
	if (open) _rapierNotesSearchToggle(false);
	bar.hidden = !open;
	if (btn) {
		btn.setAttribute('aria-expanded', String(open));
		if (open) btn.dataset.active = 'true'; else delete btn.dataset.active;
		if (!open && document.activeElement && bar.contains(document.activeElement)) btn.focus({preventScroll: true});
	}
	_rapierNotesBarRoom();
}
function _rapierNotesPopup(which) {
	const state = _rapierNotes, panel = state.popupEl; if (!panel) return;
	state.popup = null;
	panel.replaceChildren(); panel.hidden = true;
	const sheet = state.sheet; if (!sheet) return;
	if (which === 'menu') { _rapierNotesSettingsOpen(true); return; }
	if (which === 'add') { _rapierNotesAddsToggle(true); return; }
	if (state.sheetMode === 'menu' || state.sheetMode === 'add') {
		const opener = document.activeElement && sheet.contains(document.activeElement) ? state.surface.querySelector('[data-notes-act="menu"]') : null;
		state.sheetMode = 'actions'; _rapierNotesSheetRelease(); sheet.classList.remove('rapier-notes-sheet--open'); sheet.inert = true;
		opener?.focus({ preventScroll: true });
	}
}
function _rapierNotesSectionFromMenu() { _rapierNotesOpenSheet(null, 'section-add'); }
async function _rapierNotesSectionAdd(given) {
	const state = _rapierNotes, M = _rapierNotesModel();
	const name = M.cutText(String(given || '').trim().replace(/\s+/g, ' '), 48); if (!name) return;
	const grown = M.addSection(state.index, name);
	if (grown === state.index) { showToast('That section name cannot be used: it is taken, or one of the built-in words.', 'info'); return; }
	_rapierNotesCloseSheet();
	const was = state.index; state.index = grown; _rapierNotesRender();
	try { await _rapierNotesWriteIndex(); } catch (error) { state.index = was; _rapierNotesRender(); showToast('The section was not written to the notes folder: ' + String(error?.message || error), 'error'); }
}
function _rapierNotesPlaceFirst() {
	const state = _rapierNotes, M = _rapierNotesModel();
	const first = M.sortedSection(state.index, 'others')[0];
	return { order: first ? M.orderBefore(state.index.notes[first].order) : M.orderFirst() };
}
function _rapierNotesDrawLift(el) {
	const r = el?.isConnected ? el.getBoundingClientRect() : null;
	if (!r || !(r.width > 0 && r.height > 0)) return null;
	return _rapierNotesLiftGrow({rect: {left: r.left, top: r.top, width: r.width, height: r.height}, face: _rapierNotesEl('div'), bg: getComputedStyle(document.body).backgroundColor}, {draw: true});
}
function _rapierNotesDrawOver(lift, open) {
	try { open(); } finally { setTimeout(() => lift.drop(), 260); }
}
function _rapierNotesNoteLift(el) {
	const r = el?.isConnected ? el.getBoundingClientRect() : null;
	if (!r || !(r.width > 0 && r.height > 0)) return null;
	return _rapierNotesLiftGrow({rect: {left: r.left, top: r.top, width: r.width, height: r.height}, face: _rapierNotesEl('div'), bg: getComputedStyle(document.body).backgroundColor});
}
async function _rapierNotesNewDrawing(lift) {
	const state = _rapierNotes, M = _rapierNotesModel();
	const names = Object.keys(state.index.notes);
	let file = null, outcome = null, gone = false;
	const ready = (async () => {
		try { file = await _rapierNotesWriteNew('', M.noteFileName('Note', names), _rapierNotesPlaceFirst()); }
		catch (error) { outcome = false; showToast('The note could not be written: ' + String(error?.message || error), 'error'); return false; }
		if (gone) { outcome = false; await _rapierNotesDiscardUnseen(file); return false; }
		_rapierNotesAdmit(file, ''); state.untitled.add(file);
		const opened = await _rapierNotesOpenNote(file, false, null, null);
		outcome = !!opened && state.current === file;
		if (outcome && gone) { await _rapierNotesDrewNothing(file); outcome = false; return false; }
		return outcome;
	})();
	if (lift) await lift.grown;
	if (outcome === false) { lift?.drop(); return false; }
	const notes = {label: 'New note', fresh: true, alt: 'Drawing', ready, closed: () => { gone = true; return outcome === true ? _rapierNotesDrewNothing(file) : null; }};
	const open = () => void _rapierPartReady('drawing').then(ok => { if (ok) rapierOpenDraw(notes); else void notes.closed(); });
	if (lift) _rapierNotesDrawOver(lift, open); else open();
	return ready;
}
async function _rapierNotesDiscardUnseen(file) {
	const state = _rapierNotes;
	try {
		const snapshot = await _rapierNotesStore.folder.discardEmpty({file, id: state.indexBase?.notes?.[file]?.id, expectedDigest: await globalThis.RapierNotesIntegrity.sha256('')});
		_rapierNotesTake(snapshot);
	} catch (error) { showToast('The empty note could not be removed: ' + String(error?.message || error), 'error'); }
}
let _rapierNotesCatcher = null;
const RAPIER_NOTES_OPENING_PREFIX = 'rapier-notes-opening:';
function _rapierNotesCatchKeep(held) {
	const record = held.record;
	record.text = held.box.value + held.late;
	try {
		if (localStorage.getItem(held.key) !== held.serial) {
			held.stale = true; throw new Error('The opening input changed in another page.');
		}
		if (!record.text && !record.delivered) {
			if (held.serial && localStorage.getItem(held.key) === held.serial) localStorage.removeItem(held.key);
			held.serial = null; return true;
		}
		if (!_rapierNotesPending.live) throw new Error('This page could not claim its opening input.');
		record.owner = _rapierNotesPending.live.id;
		record.digest = _rapierNotesPending.digest(record.text);
		const serial = JSON.stringify(record);
		localStorage.setItem(held.key, serial); held.serial = serial;
		return true;
	} catch (error) {
		showToast('Your opening note is still in this page. Keep it open until the note can be saved: ' + String(error?.message || error), 'error', {outlive: 'save-failed'});
		return false;
	}
}
function _rapierNotesCatchRelease(held, acknowledged = false) {
	document.removeEventListener('focusin', held.focus, true); document.removeEventListener('beforeinput', held.input, true);
	held.box.remove();
	if (acknowledged && held.serial) {
		try { if (localStorage.getItem(held.key) === held.serial) localStorage.removeItem(held.key); } catch (_) {}
	}
	if (_rapierNotesCatcher === held) _rapierNotesCatcher = null;
}
function _rapierNotesCatchBegin(record = null, serial = null) {
	if (_rapierNotesCatcher && !_rapierNotesCatcher.arrived) return _rapierNotesCatcher;
	const box = document.createElement('textarea');
	box.className = 'sr-only'; box.tabIndex = -1; box.setAttribute('aria-hidden', 'true'); box.setAttribute('autocomplete', 'off');
	record ||= {version: 1, request: crypto.randomUUID(), store: _rapierNotesPending.kind(), text: ''};
	box.value = record.text;
	document.body.appendChild(box);
	try { box.focus({preventScroll: true}); } catch (_) {}
	const held = {box, record, key: RAPIER_NOTES_OPENING_PREFIX + record.request, serial, late: '', arrived: false};
	held.keep = () => _rapierNotesCatchKeep(held); box.addEventListener('input', held.keep);
	const owns = () => _rapierNotes.current === record.file && _rapierNotes.currentProof?.id === record.id;
	held.focus = event => { if (!held.arrived && owns() && event.target instanceof Element && event.target.closest('#editor-blocks')) _rapierNotesCatchEnd(true); };
	held.input = event => { if (held.arrived && !held.delivering && owns() && event.inputType === 'insertText' && typeof event.data === 'string' && event.target instanceof Element && event.target.closest('#editor-blocks')) { event.preventDefault(); event.stopImmediatePropagation(); held.late += event.data; held.keep(); } };
	document.addEventListener('focusin', held.focus, true);
	document.addEventListener('beforeinput', held.input, true);
	_rapierNotesCatcher = held;
	held.kept = held.keep(); return held;
}
function _rapierNotesCatchEnd(deliver) {
	const held = _rapierNotesCatcher; if (!held || held.arrived) return;
	held.keep();
	if (held.stale) return;
	const text = held.box.value;
	if (!text) { _rapierNotesCatchRelease(held, true); return; }
	if (!deliver) return;
	if (_rapierNotes.current !== held.record.file || _rapierNotes.currentProof?.id !== held.record.id) return;
	document.removeEventListener('focusin', held.focus, true); held.box.remove();
	held.arrived = true;
	setTimeout(async () => {
		if (_rapierNotes.current !== held.record.file || _rapierNotes.currentProof?.id !== held.record.id) { _rapierNotesCatchRelease(held); return; }
		held.delivering = true;
		try {
			const lines = (text + held.late).replace(/\r\n?/g, '\n').split('\n');
			lines.forEach((line, i) => {
				if (i && !document.execCommand('insertParagraph') || line && !document.execCommand('insertText', false, line)) throw new Error('The editor could not receive all the opening words yet.');
			});
			_rapierNotesPending.keep();
			held.record.delivered = _rapierNotesPending.text();
			held.record.deliveredDigest = _rapierNotesPending.digest(JSON.stringify(held.record.delivered)); held.keep();
			const delivered = _rapierMutationStamp();
			if (!globalThis.RapierNotesHistory?.recordVersion) throw new Error('The note history is not ready to acknowledge these words.');
			const saved = await _rapierNotesFlush();
			if (_rapierMutationStampSharesDocument(delivered) && _rapierMutationStampIsCurrent(saved)) _rapierNotesCatchRelease(held, true);
		} catch (error) { showToast('Your opening words are kept for retry: ' + String(error?.message || error), 'error', {outlive: 'save-failed'}); }
		finally { _rapierNotesCatchRelease(held); }
	}, 0);
}
async function _rapierNotesCatchResume() {
	const state = _rapierNotes;
	if (!state.open || state.opening || state.loading || _rapierNotesCatcher || state.catchingUp) return;
	state.catchingUp = true;
	try {
		const keys = Array.from({length: localStorage.length}, (_, i) => localStorage.key(i)).filter(key => key?.startsWith(RAPIER_NOTES_OPENING_PREFIX));
		for (const key of keys) {
			const serial = localStorage.getItem(key); if (serial == null) continue;
			try {
				const record = JSON.parse(serial);
				if (record.store !== _rapierNotesPending.kind()) continue;
				if (record.version !== 1 || typeof record.request !== 'string' || key !== RAPIER_NOTES_OPENING_PREFIX + record.request ||
					typeof record.text !== 'string' || _rapierNotesPending.digest(record.text) !== record.digest) throw new Error('The opening input has no complete byte proof.');
				if (typeof record.owner !== 'string' || !/^[a-f0-9-]{36}$/.test(record.owner) || !navigator.locks?.request)
					throw new Error('The opening input\'s owner could not be checked.');
				const resume = async () => {
					if (localStorage.getItem(key) !== serial || !state.open || state.opening || state.loading || _rapierNotesCatcher) return;
					if (record.delivered) {
						if (_rapierNotesPending.digest(JSON.stringify(record.delivered)) !== record.deliveredDigest) throw new Error('The delivered opening input has no complete byte proof.');
						const text = await _rapierNotesPending.resolve(record.delivered);
						const file = Object.keys(state.index.notes).find(name => state.index.notes[name].id === record.id);
						if (!file) throw new Error('The note that received these opening words could not be found.');
						const snapshot = await _rapierNotesStore.folder.read({bodies: [file]}), entry = snapshot.index.notes[file], bytes = snapshot.bodies.get(file);
						if (entry?.id !== record.id || !bytes || await globalThis.RapierNotesIntegrity.sha256(bytes) !== await globalThis.RapierNotesIntegrity.sha256(text)) throw new Error('The note changed after these opening words were delivered.');
						if (!await _rapierNotesRecordVersion({file, text, entry})) throw new Error('The note history is not ready to acknowledge these words.');
						if (localStorage.getItem(key) === serial) localStorage.removeItem(key);
					} else {
						if (state.current || state.mode || state.noteOpening || state.liftOpen || state.liftBack) return;
						if (!_rapierNotesPending.live) throw new Error('This page could not claim the opening input.');
						await _rapierNotesNew('note', false, null, false, {record, serial});
					}
				};
				if (record.owner === _rapierNotesPending.live?.id) await resume();
				else await navigator.locks.request('rapier-notes-pending-owner:' + record.owner,
					{mode: 'exclusive', ifAvailable: true}, lock => lock ? resume() : undefined);
				if (_rapierNotesCatcher) return;
			} catch (error) { showToast('Your opening words are kept: ' + String(error?.message || error), 'error', {outlive: 'save-failed'}); }
		}
	} catch (_) {  }
	finally { state.catchingUp = false; }
}
async function _rapierNotesNew(kind, capture = false, lift = null, captured = false, opening = null) {
	const foreignOpening = opening && opening.record.owner !== _rapierNotesPending.live?.id;
	const held = kind === 'note' && !capture ? _rapierNotesCatchBegin(opening?.record, opening?.serial) : null;
	if (foreignOpening && (!held?.kept || !held.serial || held.record.owner !== _rapierNotesPending.live?.id)) {
		if (held) _rapierNotesCatchRelease(held);
		lift?.drop(); return false;
	}
	if (held?.busy) { lift?.drop(); return false; }
	if (held) { held.busy = true; held.guard = _rapierMutationStamp(); held.fromCards = _rapierNotes.open; }
	const admit = () => {
		if (held && (held.stale || !_rapierMutationStampIsCurrent(held.guard) || held.fromCards && !_rapierNotes.open)) throw new Error('The open document changed. Open Note again when ready.');
	};
	try {
	if (!capture && !await _rapierNotesUnlock()) { _rapierNotesCatchEnd(false); lift?.drop(); return; }
	const state = _rapierNotes, M = _rapierNotesModel();
	if (kind === 'recording') { _rapierRecorderOpen(true); return; }
	if (kind === 'drawing' && !capture) return _rapierNotesNewDrawing(lift);
	const text = '';
	const names = Object.keys(state.index.notes);
	let file;
	try {
		file = await _rapierNotesWriteNew(text, M.noteFileName('Note', names), _rapierNotesPlaceFirst(), held?.record.request, held ? {guard: admit} : undefined);
		if (held) {
			held.record.file = file; held.record.id = state.index.notes[file]?.id; held.keep();
			admit();
			if (await _rapierNotesStore.read(file) !== '') throw new Error('This opening note already has saved words. Its retained typing has been kept separately.');
			admit();
		}
	}
	catch (error) { _rapierNotesCatchEnd(false); lift?.drop(); showToast('The note could not be written: ' + String(error?.message || error), 'error'); return; }
	_rapierNotesAdmit(file, text); state.untitled.add(file);
	const id = state.index.notes[file]?.id; if (captured && id) (state.captured ||= new Set()).add(id);
	if (!await _rapierNotesOpenNote(file, capture, null, lift, held ? {stamp: held.guard, cards: held.fromCards} : null) || state.current !== file) { _rapierNotesCatchEnd(false); lift?.drop(); return false; }
	if (lift && kind !== 'note') { await lift.grown; if (state.current === file) _rapierNotesDrawOver(lift, () => _rapierNotesTrigger(kind, true)); else lift.drop(); return true; }
	if (kind === 'note' && typeof rapierInsertBlock === 'function') { try { if (rapier.view.mode !== 'edit' && typeof rapierSetMode === 'function') rapierSetMode('edit', { announce: false }); if (!rapier.document.blocks.length) rapierInsertBlock('paragraph', { immediateFocus: true }); } catch (_) {} }
	if (kind === 'note') _rapierNotesHeadStart();
	if (kind === 'drawing' || kind === 'picture') {
		requestAnimationFrame(() => requestAnimationFrame(() => { if (state.current === file) _rapierNotesTrigger(kind, true); }));
	}
	return true;
	} finally { if (held) held.busy = false; }
}
function _rapierNotesDrawFor(fresh) {
	const state = _rapierNotes, file = state.current;
	if (fresh) return {label: 'New note', fresh: true, alt: 'Drawing', closed: () => _rapierNotesDrewNothing(file)};
	if (!_rapierNotesInANote()) return null;
	const label = _rapierNotesModel().projectCard(file, _rapierSourceText()).title || file.replace(/\.md$/i, '');
	return {label, fresh: false, alt: label};
}
function _rapierNotesInANote() {
	return !!_rapierNotes.mode && _rapierNotesDocumentBound();
}
function _rapierNotesDrewNothing(file) {
	const state = _rapierNotes;
	if (!file || state.open || state.current !== file || !state.untitled.has(file) || _rapierNotesBody(_rapierSourceText()).trim()) return null;
	return _rapierNotesOpen(false, {unseen: true});
}
function _rapierNotesTrigger(kind, fresh = false) {
	if (kind === 'recording') { _rapierRecorderOpen(false); return; }
	if (kind === 'attachment') { void _rapierAttachmentsPick(); return; }
	if (kind === 'files') { void _rapierAttachmentsShelf(); return; }
	if (kind === 'photo') { if (typeof rapierInsertPhoto === 'function') { rapierInsertPhoto(); return; } kind = 'picture'; }
	if (kind === 'drawing' && _rapierDrawOffered()) { const target = _rapierNotesDrawFor(fresh); void _rapierPartReady('drawing').then(ok => { if (ok) rapierOpenDraw(target); }); return; }
	if (kind === 'picture' && typeof rapierInsertImage === 'function') { rapierInsertImage(); return; }
	const el = document.querySelector(kind === 'drawing' ? '[data-command="insert.draw"]' : '[data-command="insert.image"]');
	if (el && !el.disabled) { el.click(); return; }
	showToast(kind === 'drawing' ? 'The note is open: tap Draw in the toolbar to draw in it.' : 'The note is open: tap Image in the toolbar to add one.', 'info');
}
function _rapierNotesJump(id) {
	const state = _rapierNotes, section = state.grids[id]?.parentElement; if (!section) return;
	if (_rapierNotesClosed(id)) {
		if (RAPIER_NOTES_SESSION_SECTIONS.includes(id)) { state.opened.add(id); _rapierNotesRender(); }
		else { const M = _rapierNotesModel(); state.index = M.setCollapsed(state.index, id, false); _rapierNotesRender(); void _rapierNotesWriteIndex().catch(() => {}); }
	}
	const under = state.surface.querySelector('.rapier-notes-head')?.getBoundingClientRect().bottom ?? state.scroll.getBoundingClientRect().top;
	const top = state.scroll.scrollTop + section.getBoundingClientRect().top - under - 8;
	state.scroll.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
	const head = section.querySelector('.rapier-notes-section-head');
	const target = head && head.tagName === 'BUTTON' && !head.hidden ? head : section.querySelector('.rapier-notes-card') || state.surface;
	target.focus({preventScroll: true});
}
function _rapierNotesFabTrack() {
	const state = _rapierNotes, fab = state.fab, scroll = state.scroll; if (!fab || !scroll || !state.open) return;
	const surface = state.surface.getBoundingClientRect(), head = state.surface.querySelector('.rapier-notes-head').getBoundingClientRect();
	const filters = document.getElementById('rapier-notes-filters');
	const barH = (state.find?.hidden ? 0 : state.find.getBoundingClientRect().height) + (state.addsBar?.hidden ? 0 : state.addsBar.getBoundingClientRect().height) + (filters && !filters.hidden ? filters.getBoundingClientRect().height : 0) + (state.reorderBar && !state.reorderBar.hidden ? state.reorderBar.getBoundingClientRect().height : 0);
	const trackTop = head.height + barH + 16, trackBottom = surface.height - 60 - 16;
	const range = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
	const fraction = range ? Math.min(1, Math.max(0, scroll.scrollTop / range)) : 0;
	fab.style.top = Math.round(trackTop + fraction * Math.max(0, trackBottom - trackTop)) + 'px';
	fab.dataset.notesTrack = trackTop + ',' + trackBottom;
}
function _rapierNotesFabDwell() { return matchMedia('(hover: hover) and (pointer: fine)').matches ? 2400 : 900; }
function _rapierNotesScrollQuiet() { _rapierNotes.scrollQuietUntil = performance.now() + 400; }
function _rapierNotesFabShow() {
	const state = _rapierNotes, fab = state.fab, scroll = state.scroll; if (!fab || !scroll || !state.open) return;
	if (scroll.scrollHeight < 2 * scroll.clientHeight) { fab.classList.remove('rapier-notes-fab--visible'); return; }
	if (state.scrollQuietUntil && performance.now() < state.scrollQuietUntil) { _rapierNotesFabTrack(); return; }
	_rapierNotesFabTrack();
	fab.classList.add('rapier-notes-fab--visible');
	clearTimeout(state.fabHide);
	if (!state.fabDrag && !state.jumpEl?.classList.contains('open')) state.fabHide = setTimeout(() => fab.classList.remove('rapier-notes-fab--visible'), _rapierNotesFabDwell());
}
function _rapierNotesFabBind(fab, scroll) {
	const state = _rapierNotes;
	let raf = 0;
	scroll.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; _rapierNotesFabShow(); _rapierNotesWindowScrolled(); }); }, { passive: true });
	window.addEventListener('resize', () => { if (state.open) _rapierNotesFabTrack(); });
	fab.addEventListener('pointerdown', evt => {
		clearTimeout(state.fabHide);
		if (evt.button !== 0 && evt.pointerType === 'mouse') return;
		state.fabDrag = { id: evt.pointerId, y: evt.clientY, moved: false };
		try { fab.setPointerCapture(evt.pointerId); } catch (_) {}
	});
	fab.addEventListener('pointermove', evt => {
		const d = state.fabDrag; if (!d || d.id !== evt.pointerId) return;
		if (!d.moved && Math.abs(evt.clientY - d.y) < 8) return;
		d.moved = true; fab.classList.add('rapier-notes-fab--tracking');
		const [top, bottom] = (fab.dataset.notesTrack || '0,0').split(',').map(Number), surface = state.surface.getBoundingClientRect();
		const y = evt.clientY - surface.top - 30, fraction = Math.min(1, Math.max(0, (y - top) / Math.max(1, bottom - top)));
		scroll.scrollTop = fraction * Math.max(0, scroll.scrollHeight - scroll.clientHeight);
	});
	const end = evt => { const d = state.fabDrag; if (!d || d.id !== evt.pointerId) return; fab.classList.remove('rapier-notes-fab--tracking'); try { fab.releasePointerCapture(evt.pointerId); } catch (_) {} setTimeout(() => { state.fabDrag = null; }, 0); _rapierNotesFabShow(); };
	fab.addEventListener('pointerup', end); fab.addEventListener('pointercancel', end);
}
function _rapierNotesSheetSwipe(sheet) {
	const state = _rapierNotes;
	let g = null;
	const clear = () => { sheet.style.transition = ''; sheet.style.transform = ''; };
	const settle = (offset, ms, then) => { sheet.style.transition = 'transform ' + ms + 'ms var(--ease-out)'; sheet.style.transform = offset ? 'translateY(' + offset + 'px)' : ''; setTimeout(then, ms + 10); };
	sheet.addEventListener('touchstart', evt => {
		const t = evt.touches[0];
		if (!t || sheet.scrollTop > 0 || evt.target.closest('input,textarea,select,[type=range]')) { g = null; return; }
		g = {x: t.clientX, y: t.clientY, t0: performance.now(), off: 0, active: false};
	}, {passive: true});
	sheet.addEventListener('touchmove', evt => {
		if (!g) return;
		const t = evt.touches[0]; if (!t) return;
		if (sheet.scrollTop > 0) { g = null; return; }
		const dx = t.clientX - g.x, dy = t.clientY - g.y;
		if (!g.active && Math.abs(dx) >= Math.abs(dy) * 1.12) { g = null; return; }
		const down = Math.max(0, dy);
		if (down < 7 && !g.active) return;
		g.active = true; g.off = down;
		if (evt.cancelable) evt.preventDefault();
		sheet.style.transition = 'none'; sheet.style.transform = 'translateY(' + down + 'px)';
	}, {passive: false});
	const end = () => {
		if (!g) return;
		const d = g; g = null;
		if (!d.active) return;
		state.sheetSwiped = true; setTimeout(() => { state.sheetSwiped = false; }, 280);
		const elapsed = Math.max(1, performance.now() - d.t0), close = d.off >= 88 || (d.off >= 42 && d.off / elapsed >= 0.52);
		if (close) settle(Math.max(360, window.innerHeight * 0.72), 170, () => { _rapierNotesHideSheet(); clear(); });
		else settle(0, 150, clear);
	};
	sheet.addEventListener('touchend', end);
	sheet.addEventListener('touchcancel', () => { if (!g) return; const d = g; g = null; if (d.active) settle(0, 150, clear); });
	let drag = null;
	sheet.addEventListener('pointerdown', evt => { if (evt.pointerType === 'touch' || (evt.pointerType === 'mouse' && evt.button !== 0)) return; drag = { id: evt.pointerId, y: evt.clientY, dy: 0, moving: false }; });
	sheet.addEventListener('pointermove', evt => {
		if (!drag || drag.id !== evt.pointerId) return;
		const dy = evt.clientY - drag.y;
		if (!drag.moving) { if (dy < 10) return; drag.moving = true; try { sheet.setPointerCapture(evt.pointerId); } catch (_) {} sheet.style.transition = 'none'; }
		drag.dy = Math.max(0, dy); sheet.style.transform = 'translateY(' + drag.dy + 'px)';
	});
	const pend = evt => {
		if (!drag || drag.id !== evt.pointerId) return;
		const d = drag; drag = null;
		if (!d.moving) return;
		clear();
		try { sheet.releasePointerCapture(evt.pointerId); } catch (_) {}
		state.sheetSwiped = true; setTimeout(() => { state.sheetSwiped = false; }, 350);
		if (d.dy > 60) _rapierNotesHideSheet();
	};
	sheet.addEventListener('pointerup', pend); sheet.addEventListener('pointercancel', pend);
}
function _rapierNotesFold(file, show, focus) {
	const state = _rapierNotes, card = state.surface.querySelector('[data-notes-file="' + CSS.escape(file) + '"]');
	if (show) state.unfolded.add(file); else state.unfolded.delete(file);
	const next = _rapierNotesCard(file), grid = card.parentElement;
	card.replaceWith(next); _rapierNotesPack(grid);
	if (focus) next.querySelector('[data-notes-fold]')?.focus({ preventScroll: true });
}
function _rapierNotesBind(surface, search) {
	const state = _rapierNotes;
	surface.addEventListener('click', evt => {
		if (state.sheetSwiped) { state.sheetSwiped = false; evt.preventDefault(); return; }
		if (evt.detail === 0) {
			const card = evt.target.closest('.rapier-notes-card'), box = evt.target.closest('[data-notes-check]'), fold = evt.target.closest('[data-notes-fold]'), play = evt.target.closest('[data-notes-play]');
			if (card && box) { void _rapierNotesToggleCheck(card.dataset.notesFile, Number(box.dataset.notesCheck)); return; }
			if (card && play) { if (typeof _rapierRecorderCardToggle === 'function') _rapierRecorderCardToggle(card.dataset.notesFile, play.dataset.notesPlay); return; }
			if (card && fold) { _rapierNotesFold(card.dataset.notesFile, fold.dataset.notesFold === 'show', true); return; }
		}
		const el = evt.target.closest('[data-notes-act]'), act = el?.dataset.notesAct;
		if (act !== 'adds' && act !== 'add' && !evt.target.closest('.rapier-notes-addsbar')) _rapierNotesAddsToggle(false);
		if (act !== 'search' && !state.query && !evt.target.closest('.rapier-notes-find, #rapier-notes-filters')) _rapierNotesSearchToggle(false);
		if (evt.target === state.askEl) { _rapierNotesAskOpen(false); return; }
		if (evt.target === state.jumpEl) { _rapierNotesJumpOpen(false); return; }
		if (evt.target === state.settingsEl) { _rapierNotesSettingsOpen(false); return; }
		if (!act) {
			if (state.compose && !evt.target.closest('.rapier-notes-sheet')) { _rapierNotesCloseSheet(); return; }
			if (state.sheet?.classList.contains('rapier-notes-sheet--open') && !evt.target.closest('.rapier-notes-sheet') && !evt.target.closest('.rapier-notes-selbar')) { _rapierNotesHideSheet(); return; }
			if (state.popup && !evt.target.closest('.rapier-notes-sheet')) _rapierNotesPopup(null);
			return;
		}
		if (act === 'editor') { void _rapierNotesEditor(); return; }
		if (act === 'close') { _rapierNotesAskOpen(true, el); return; }
		if (act === 'ask-back') { _rapierNotesAskOpen(false); void _rapierNotesEditor(); return; }
		if (act === 'search') { _rapierNotesSearchToggle(); return; }
		if (act === 'adds') { _rapierNotesAddsToggle(); return; }
		if (act === 'menu') { _rapierNotesSettingsOpen(!_rapierNotesSettingsIsOpen()); return; }
		if (act === 'settings-close') { _rapierNotesSettingsOpen(false); return; }
		if (act === 'section-reorder') { _rapierNotesReorderOn(true); return; }
		if (act === 'reorder-done') { _rapierNotesReorderOn(false); return; }
		if (act === 'jump-close') { _rapierNotesJumpOpen(false); return; }
		if (act === 'menu-history-tidy') { _rapierNotesSettingsOpen(false); void _rapierNotesHistoryTidy(); return; }
		if (act === 'fab') { if (!state.fabDrag?.moved) _rapierNotesJumpOpen(!state.jumpEl?.classList.contains('open')); return; }
		if (act === 'popup-close') { _rapierNotesPopup(null); return; }
		if (act === 'menu-import' || act === 'menu-backup') { _rapierNotesSettingsOpen(false); return; }
		if (act === 'menu-saved-files') { _rapierNotesSettingsOpen(false); void _rapierAttachmentsShelf(); return; }
		if (act === 'sync') { _rapierNotesSyncPress(); return; }
		if (act === 'role') { void _rapierNotesRequestRole(); return; }
		if (act === 'menu-imports') { _rapierNotesSettingsOpen(false); _rapierNotesImportsSheet(); return; }
		if (act === 'add') { const lift = el.dataset.notesAdd === 'drawing' ? _rapierNotesDrawLift(el) : el.dataset.notesAdd === 'note' ? _rapierNotesNoteLift(el) : null; _rapierNotesAddsToggle(false); _rapierNotesPopup(null); void _rapierNotesNew(el.dataset.notesAdd, false, lift); return; }
		if (act === 'jump') { _rapierNotesJumpOpen(false); _rapierNotesJump(el.dataset.notesJump); return; }
		if (act === 'sort') { RapierPreferences.write('notesSort', _rapierSwitchValue(el)); return; }
		if (act === 'skills') { RapierPreferences.write('notesSkills', _rapierSwitchValue(el) === 'true'); return; }
		if (act === 'colour-mode') { RapierPreferences.write('notesColour', _rapierNotesColourMode() === 'page' ? 'bar' : 'page'); _rapierNotesColourModeWear(el); return; }
		if (act === 'bin-open') { _rapierNotesSettingsOpen(false); _rapierNotesBinOpen(true); return; }
		if (act === 'bin-close') { _rapierNotesBinOpen(false); return; }
		if (act === 'bin-pick') {
			const file = el.dataset.notesBinFile;
			if (state.binPicked?.has(file)) state.binPicked.delete(file); else state.binPicked?.add(file);
			_rapierNotesBinPaint(); return;
		}
		if (act === 'bin-restore') { void _rapierNotesBinRun('restore', [...(state.binPicked || [])]); return; }
		if (act === 'bin-forever') { void _rapierNotesBinRun('delete-forever', [...(state.binPicked || [])]); return; }
		if (act === 'bin-empty') { void _rapierNotesBinRun('delete-forever', _rapierNotesBinFiles()); return; }
		if (act === 'layout') { RapierPreferences.write('notesLayout', _rapierSwitchValue(el)); return; }
		if (act === 'section-add-menu') { _rapierNotesSettingsOpen(false); void _rapierNotesSectionFromMenu(); return; }
		if (act === 'section' && el.classList.contains('rapier-notes-section-head')) {
			if (state.reorder) { const id = el.dataset.notesSection; if ((state.index?.sections || []).some(s => s.name === id)) { state.sheetSection = id; _rapierNotesOpenSheet(null, 'section-edit'); } return; }
			void _rapierNotesToggleSection(el.dataset.notesSection); return;
		}
		if (act === 'section-new' || act === 'section-rename' || act === 'remind-set') return;
		void _rapierNotesAct(act, el.dataset.notesColour ?? el.dataset.notesSectionName ?? el.dataset.notesRemindAt ?? el.dataset.notesRepeat ?? el.dataset.notesVersion ?? el.dataset.notesTag ?? el.dataset.notesAdd ?? el.dataset.notesReceipt ?? el.dataset.notesRestore);
	});
	let searchFrame = null, searchComposing = false, searchPainted = null;
	const paintSearch = () => {
		if (searchFrame !== null) return;
		searchFrame = requestAnimationFrame(() => {
			searchFrame = null;
			if (searchComposing) return;
			searchPainted = state.query;
			_rapierNotesRender(); _rapierNotesBarRoom(); _rapierNotesScrollQuiet(); state.scroll.scrollTop = 0;
		});
	};
	search.addEventListener('compositionstart', () => { searchComposing = true; });
	search.addEventListener('input', evt => {
		const changed = state.query !== search.value;
		state.query = search.value;
		if (evt.isComposing) searchComposing = true;
		if (!searchComposing && (changed || state.query !== searchPainted)) paintSearch();
	});
	search.addEventListener('compositionend', () => { state.query = search.value; searchComposing = false; paintSearch(); });
	document.addEventListener('beforeinput', () => {
		if (state.sizes.size <= 200 || state.backgroundInput) return;
		state.backgroundInput = true;
		requestAnimationFrame(() => { state.backgroundInput = false; });
	}, true);
	document.addEventListener('compositionstart', () => { state.backgroundComposing = true; }, true);
	document.addEventListener('compositionend', () => { state.backgroundComposing = false; }, true);
	document.addEventListener('touchstart', evt => {
		if ((!state.mode && !state.open) || state.sizes.size <= 200) return;
		for (const touch of evt.changedTouches) state.backgroundTouches.add(touch.identifier);
	}, {capture: true, passive: true});
	const released = evt => { for (const touch of evt.changedTouches) state.backgroundTouches.delete(touch.identifier); };
	document.addEventListener('touchend', released, {capture: true, passive: true});
	document.addEventListener('touchcancel', released, {capture: true, passive: true});
	const interrupted = () => { state.backgroundTouches.clear(); state.backgroundInput = false; state.backgroundComposing = false; };
	window.addEventListener('blur', interrupted);
	document.addEventListener('visibilitychange', () => { if (document.hidden) interrupted(); });
	document.addEventListener('pointerdown', evt => {
		if (evt.isPrimary !== false && evt.button === 0) state.swallowClick = 0;
	}, {capture: true, passive: true});
	document.addEventListener('click', evt => { const at = state.swallowClick; if (!at) return; state.swallowClick = 0; if (performance.now() - at < 700) { evt.stopPropagation(); evt.preventDefault(); } }, true);
	surface.addEventListener('pointerdown', evt => { if (_rapierNotesReorderDown(evt)) return; _rapierNotesPointerDown(evt); });
	surface.addEventListener('pointermove', evt => { if (_rapierNotesReorderMove(evt)) return; _rapierNotesPointerMove(evt); });
	surface.addEventListener('touchmove', evt => { if ((state.drag?.held || state.secDrag?.moved) && evt.cancelable) evt.preventDefault(); }, { passive: false });
	document.addEventListener('pointerup', evt => { if (_rapierNotesReorderUp(evt, false)) return; void _rapierNotesPointerUp(evt); }, true);
	document.addEventListener('pointercancel', evt => { if (_rapierNotesReorderUp(evt, true)) return; void _rapierNotesPointerUp(evt, true); }, true);
	surface.addEventListener('keydown', evt => {
		evt.stopPropagation();
		if (evt.isComposing || evt.keyCode === 229) return;
		if (_rapierNotesRadioKey(evt) || _rapierNotesCardKey(evt)) return;
		const card = evt.target.closest?.('.rapier-notes-card'); if (!card) return;
		const box = evt.target.closest?.('[data-notes-check]');
		if (box && (evt.key === 'Enter' || evt.key === ' ')) { evt.preventDefault(); void _rapierNotesToggleCheck(card.dataset.notesFile, Number(box.dataset.notesCheck)); return; }
		if (evt.target !== card) return;
		if (evt.key === 'Enter') { evt.preventDefault(); if (!evt.repeat) _rapierNotesOpenCard(card); }
		else if (evt.key === ' ') { evt.preventDefault(); if (!evt.repeat) _rapierNotesSelect(card.dataset.notesFile); }
		else if (evt.key === 'ContextMenu' || (evt.shiftKey && evt.key === 'F10')) { evt.preventDefault(); _rapierNotesSelect(card.dataset.notesFile, false); _rapierNotesOpenSheet(null, 'actions'); }
	});
	surface.addEventListener('keydown', evt => {
		if (_rapierTrapModalTab(evt, state.sheet?.classList.contains('rapier-notes-sheet--open') ? state.sheet : surface)) return;
		if (evt.key !== 'Escape' || evt.isComposing || evt.keyCode === 229) return;
		evt.preventDefault();
		if (_rapierNotesBinIsOpen()) _rapierNotesBinOpen(false);
		else if (_rapierNotesSettingsIsOpen()) _rapierNotesSettingsOpen(false);
		else if (state.askEl?.classList.contains('open')) _rapierNotesAskOpen(false);
		else if (state.jumpEl?.classList.contains('open')) _rapierNotesJumpOpen(false);
		else if (state.sheet?.classList.contains('rapier-notes-sheet--open')) _rapierNotesHideSheet();
		else if (state.reorder) _rapierNotesReorderOn(false);
		else if (state.popup) _rapierNotesPopup(null);
		else if (state.selected.size || state.sheetMode === 'imports') _rapierNotesCloseSheet();
		else if (!state.addsBar.hidden) _rapierNotesAddsToggle(false);
		else if (!state.find.hidden) _rapierNotesSearchToggle();
		else void _rapierNotesEditor();
	});
	surface.addEventListener('contextmenu', evt => { if (evt.target.closest('.rapier-notes-card')) evt.preventDefault(); });
	window.addEventListener('resize', () => { if (state.open) _rapierNotesRender(); });
	document.addEventListener('input', _rapierNotesInputChanged);
	document.addEventListener('compositionend', _rapierNotesInputChanged);
	const departure = event => {
		_rapierNotesAbortDrag();
		if (!_rapierNotes.current) return;
		_rapierNotesPending.keep();
		const completion = _rapierNotesFlush().then(stamp => _rapierMutationStampIsCurrent(stamp), () => false);
		if (typeof event?.detail?.waitUntil === 'function') event.detail.waitUntil(completion);
	};
	document.addEventListener('visibilitychange', () => { if (document.hidden) departure(); });
	window.addEventListener('pagehide', departure);
	document.addEventListener('freeze', departure, {capture: true});
	window.addEventListener('rapier:checkpoint-requested', departure);
	try { RapierPreferences.subscribe('notesSkills', () => { if (state.open) _rapierNotesRender(); }); } catch (_) {}
	try { RapierPreferences.subscribe('notesSort', () => { if (state.open) _rapierNotesRender(); }); } catch (_) {}
	try { RapierPreferences.subscribe('notesLayout', () => { if (state.open) { _rapierNotesLayout(); _rapierNotesRender(); } }); } catch (_) {}
	try { RapierPreferences.subscribe('notesColour', () => { if (state.open) _rapierNotesHeadPaint(); }); } catch (_) {}
}
const RAPIER_NOTES_LIFT_MS = 400;
const RAPIER_NOTES_LIFT_EASE = 'cubic-bezier(.4,0,.2,1)';
const RAPIER_NOTES_LIFT_AT = {
	faceOut: .3,
	headOut: .2,
	cardsOut: [.15, .45],
	pageIn: .55,
	ownIn: .55,
	noteOut: .25,
	cardsIn: .6,
	headIn: .55,
	faceIn: .6,
};
function _rapierNotesStill() { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
function _rapierNotesLiftSnapshot(file, card) {
	if (!card?.isConnected) return {file};
	const r = card.getBoundingClientRect();
	const face = card.cloneNode(true); face.className = 'rapier-notes-lift-face ' + card.className.replace(/\brapier-notes-card--(?:held|dragging|selected|pending|lifted)\b/g, '').replace(/\s+/g, ' ').trim();
	face.removeAttribute('style'); face.removeAttribute('tabindex'); face.removeAttribute('role'); face.removeAttribute('data-notes-file');
	return {file, rect: {left: r.left, top: r.top, width: r.width, height: r.height}, face, bg: getComputedStyle(card).backgroundColor, colour: /\brapier-notes-tint-/.test(card.className)};
}
function _rapierNotesLiftRect(el) {
	if (!el?.getClientRects().length) return null;
	const r = el.getBoundingClientRect();
	return r.width > 0 && r.height > 0 ? {left: r.left, top: r.top, width: r.width, height: r.height} : null;
}
function _rapierNotesLiftNow() { return Number(document.timeline?.currentTime) || performance.now(); }
function _rapierNotesLiftPlay(el, frames, t0, at = 0, to = 1, easing = RAPIER_NOTES_LIFT_EASE, fill = 'both') {
	const D = RAPIER_NOTES_LIFT_MS, now = _rapierNotesLiftNow();
	let begin = t0 + at * D, end = t0 + to * D;
	if (begin < now - 1) { begin = now; end = Math.max(end, now + .2 * D); }
	const a = el.animate(frames, {duration: Math.max(1, end - begin), easing, fill});
	a.startTime = begin;
	return a;
}
function _rapierNotesLiftStep(el, t0, at, a, b) {
	const x = el.animate([{opacity: a}, {opacity: a, offset: at}, {opacity: b, offset: at}, {opacity: b}], {duration: RAPIER_NOTES_LIFT_MS, easing: 'linear', fill: 'both'});
	x.startTime = t0;
	return x;
}
function _rapierNotesLiftPlateAt(b, W, H) { return 'translate(' + b.left + 'px,' + b.top + 'px) scale(' + b.width / W + ',' + b.height / H + ')'; }
function _rapierNotesLiftClipAt(b, card) { return 'translate(' + b.left + 'px,' + (b.top + Math.min(0, b.height - card.height)) + 'px)'; }
function _rapierNotesLiftFaceAt(b, card) { return 'translate(0px,' + Math.max(0, card.height - b.height) + 'px)'; }
function _rapierNotesLiftLayers(bg) {
	const lift = _rapierNotesEl('div', 'rapier-notes-lift'); lift.setAttribute('aria-hidden', 'true');
	const page = _rapierNotesEl('div', 'rapier-notes-lift-page'), rise = _rapierNotesEl('div');
	page.appendChild(rise);
	const plate = _rapierNotesEl('div', 'rapier-notes-lift-ground');
	if (bg) { plate.style.backgroundImage = 'linear-gradient(' + bg + ',' + bg + ')'; plate.style.backgroundColor = 'var(--color-bg)'; }
	const clip = _rapierNotesEl('div', 'rapier-notes-lift-clip');
	lift.append(page, plate, clip);
	document.body.appendChild(lift);
	const box = lift.getBoundingClientRect();
	return {lift, page, rise, plate, clip, W: box.width || window.innerWidth, H: box.height || window.innerHeight};
}
function _rapierNotesLiftWords(clip, snap, a, b, play) {
	const card = snap.rect, face = snap.face;
	face.style.setProperty('--lift-face-w', card.width + 'px');
	clip.style.width = card.width + 'px'; clip.style.height = card.height + 'px'; clip.appendChild(face);
	play(clip, [{transform: _rapierNotesLiftClipAt(a, card)}, {transform: _rapierNotesLiftClipAt(b, card)}]);
	play(face, [{transform: _rapierNotesLiftFaceAt(a, card)}, {transform: _rapierNotesLiftFaceAt(b, card)}]);
	return face;
}
const RAPIER_NOTES_SHARED_CONTROLS = [['[data-notes-act="close"]', 'btn-notes-back'], ['[data-notes-act="adds"]', 'btn-notes-plus'], ['[data-notes-act="menu"]', 'btn-notes-kebab']];
function _rapierNotesLiftCopy(control) {
	const glyph = control?.querySelector('svg'), box = _rapierNotesLiftRect(glyph); if (!box) return null;
	const cs = getComputedStyle(glyph), copy = _rapierNotesEl('div', 'rapier-notes-lift-glide'); copy.setAttribute('aria-hidden', 'true');
	const svg = glyph.cloneNode(true); svg.removeAttribute('id'); svg.removeAttribute('class');
	Object.assign(svg.style, {fill: cs.fill, stroke: cs.stroke, strokeWidth: cs.strokeWidth});
	copy.style.color = cs.color;
	copy.appendChild(svg);
	_rapierNotesLiftPlace(copy, box);
	document.body.appendChild(copy);
	return {copy, box, control};
}
function _rapierNotesLiftPlace(copy, box) {
	Object.assign(copy.style, {left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px'});
	Object.assign(copy.firstElementChild.style, {width: box.width + 'px', height: box.height + 'px'});
}
function _rapierNotesLiftGlide(g, to, t0) {
	const from = g.box, box = _rapierNotesLiftRect(to?.querySelector('svg')); if (!box) return null;
	_rapierNotesLiftPlace(g.copy, box);
	const dx = from.left + from.width / 2 - box.left - box.width / 2, dy = from.top + from.height / 2 - box.top - box.height / 2;
	g.box = box;
	const D = RAPIER_NOTES_LIFT_MS, begin = Math.max(t0, _rapierNotesLiftNow());
	const a = g.copy.animate([{transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + from.width / box.width + ')'}, {transform: 'none'}], {duration: Math.max(t0 + D - begin, .5 * D), easing: RAPIER_NOTES_LIFT_EASE, fill: 'both'});
	a.startTime = begin;
	return a;
}
function _rapierNotesLiftGrow(snap, {draw = false} = {}) {
	if (_rapierNotesStill()) return null;
	const card = snap?.rect; if (!card || !(card.width > 0 && card.height > 0) || !snap.face) return null;
	const state = _rapierNotes, AT = RAPIER_NOTES_LIFT_AT, bar = draw ? null : document.querySelector('.top-bar');
	if (!draw) state.liftOpen?.drop();
	const {lift, page, rise, plate, clip, W, H} = _rapierNotesLiftLayers(snap.bg);
	const paged = !draw && !!snap.colour && _rapierNotesColourMode() === 'page';
	const to = !draw && snap.colour && !paged ? _rapierNotesLiftRect(bar) || {left: 0, top: 0, width: W, height: 0} : {left: 0, top: 0, width: W, height: H};
	const t0 = _rapierNotesLiftNow(), parts = [], touched = [], copies = [], glides = [];
	const play = (el, frames, at, until, easing, fill) => { const a = _rapierNotesLiftPlay(el, frames, t0, at, until, easing, fill); parts.push(a); return a; };
	const travel = play(plate, [{transform: _rapierNotesLiftPlateAt(card, W, H)}, {transform: _rapierNotesLiftPlateAt(to, W, H)}]);
	const face = _rapierNotesLiftWords(clip, snap, card, to, play);
	if (draw) play(face, [{opacity: 1}, {opacity: 0}], 0, AT.faceOut, 'linear');
	const cardsOut = play(rise, [{opacity: 0}, {opacity: 1}], AT.cardsOut[0], AT.cardsOut[1], 'linear');
	const home = state.surface?.querySelector('.rapier-notes-card[data-notes-file="' + CSS.escape(String(snap.file || '')) + '"]');
	home?.classList.add('rapier-notes-card--lifted');
	const head = draw ? null : state.surface?.querySelector('.rapier-notes-head');
	if (head) {
		for (const [sel, id] of RAPIER_NOTES_SHARED_CONTROLS) {
			const from = head.querySelector(sel), c = _rapierNotesLiftCopy(from); if (!c) continue;
			from.classList.add('rapier-notes-glided'); copies.push(c); glides.push({...c, to: document.getElementById(id), anim: null});
		}
		for (const el of head.children) if (!el.classList.contains('rapier-notes-head__gap') && !glides.some(g => g.control === el)) touched.push(_rapierNotesLiftPlay(el, [{opacity: 1}, {opacity: 0}], t0, 0, AT.headOut, 'linear'));
	}
	bar?.classList.add('top-bar--notes-lifting');
	const setOff = () => { for (const g of glides) if (!g.anim) { g.anim = _rapierNotesLiftGlide(g, g.to, t0); if (g.anim) parts.push(g.anim); } };
	if (document.body.classList.contains('rapier-notes-mode')) setOff();
	let done = false, owned = false, shown = false, faded = false, away = null;
	const show = () => {
		if (shown || done || draw) return; shown = true;
		const at = Math.max(AT.cardsOut[1], (_rapierNotesLiftNow() - t0) / RAPIER_NOTES_LIFT_MS);
		play(face, [{opacity: 1}, {opacity: 0}], 0, AT.faceOut, 'linear');
		if (state.surface && !state.surface.hidden) away = _rapierNotesLiftStep(state.surface, t0, Math.min(1, at), 1, 0);
		if (paged) {
			parts.push(_rapierNotesLiftStep(page, t0, 1, 1, 0));
			const whole = Math.max(1, at);
			play(plate, [{opacity: 1}, {opacity: 0}], whole, whole + AT.pageIn, 'linear');
		} else {
			if (!snap.colour) parts.push(_rapierNotesLiftStep(plate, t0, Math.min(1, at), 1, 0));
			play(page, [{opacity: 1}, {opacity: 0}], at, at + AT.pageIn, 'linear');
		}
		settle();
	};
	const settle = () => { if (shown && faded && !done) Promise.all(parts.filter(a => a.effect?.target?.isConnected).map(a => a.finished)).then(end, () => {}); };
	const handle = {
		grown: (cardsOut || travel).finished.then(() => {}, () => {}),
		bar() {
			if (done || draw) return;
			setOff();
			if (!owned) {
				owned = true;
				for (const el of bar?.querySelectorAll('.icon-btn') || []) {
					if (glides.some(g => g.to === el)) continue;
					const c = _rapierNotesLiftCopy(el); if (!c) continue;
					copies.push(c); play(c.copy, [{opacity: 0}, {opacity: 1}], AT.ownIn, 1, 'linear');
				}
			}
			show();
		},
		fade() {
			if (done || draw) return;
			handle.bar();
			faded = true;
			lift.classList.add('rapier-notes-lift--past');
			settle();
		},
		drop() { end(); },
	};
	const end = () => {
		if (done) return; done = true;
		bar?.classList.remove('top-bar--notes-lifting');
		for (const g of glides) g.control.classList.remove('rapier-notes-glided');
		for (const a of touched) a.cancel();
		away?.cancel();
		home?.classList.remove('rapier-notes-card--lifted');
		for (const c of copies) c.copy.remove();
		lift.remove();
		if (state.liftOpen === handle) state.liftOpen = null;
	};
	if (!draw) state.liftOpen = handle;
	return handle;
}
function _rapierNotesLiftBack() {
	if (_rapierNotesStill()) return null;
	const state = _rapierNotes, AT = RAPIER_NOTES_LIFT_AT, bar = document.querySelector('.top-bar');
	state.liftOpen?.drop();
	_rapierNotesLiftCancel();
	const colour = !!bar?.classList.contains('top-bar--notes-colour');
	const ground = colour && document.body.classList.contains('rapier-notes-paged') && state.groundEl?.isConnected ? state.groundEl : null;
	const {lift, page, rise, plate, clip, W, H} = _rapierNotesLiftLayers(colour ? getComputedStyle(ground || bar).backgroundColor : null);
	lift.classList.add('rapier-notes-lift--past');
	const from = colour && !ground ? _rapierNotesLiftRect(bar) || {left: 0, top: 0, width: W, height: 0} : {left: 0, top: 0, width: W, height: H};
	plate.style.transform = _rapierNotesLiftPlateAt(from, W, H);
	if (!colour || ground) plate.style.opacity = '0';
	let t0 = _rapierNotesLiftNow() + 1e6, going = false;
	const copies = [], glides = [], touched = [], heads = [];
	const shared = RAPIER_NOTES_SHARED_CONTROLS.map(([, id]) => document.getElementById(id));
	for (const el of bar?.querySelectorAll('.icon-btn') || []) {
		const c = _rapierNotesLiftCopy(el); if (!c) continue;
		copies.push(c);
		const i = shared.indexOf(el);
		if (i >= 0) glides.push({...c, sel: RAPIER_NOTES_SHARED_CONTROLS[i][0]});
		else _rapierNotesLiftPlay(c.copy, [{opacity: 1}, {opacity: 0}], t0, 0, AT.noteOut, 'linear');
	}
	bar?.classList.add('top-bar--notes-lifting');
	const noteOut = _rapierNotesLiftPlay(ground ? plate : rise, [{opacity: 0}, {opacity: 1}], t0, 0, AT.noteOut, 'linear');
	if (ground) _rapierNotesLiftStep(rise, t0, AT.noteOut, 0, 1);
	let done = false, left = false, home = null, surface = null, under = null, taps = null;
	const free = () => { if (taps == null || !going) return; const wait = taps - _rapierNotesLiftNow(); setTimeout(() => { if (surface && !done) surface.style.pointerEvents = ''; }, Math.max(0, wait)); };
	const second = (c0) => {
		const run = [];
		const play = (el, frames, at, until, easing, fill) => { const a = _rapierNotesLiftPlay(el, frames, c0, at, until, easing, fill); run.push(a); return a; };
		play.c0 = c0;
		play.hold = a => { if (a) run.push(a); return a; };
		play.land = () => Promise.all(run.map(a => a.finished)).then(() => back.end(), () => {});
		return play;
	};
	const arrive = (warm, shift, play) => {
		surface = state.surface;
		if (warm && surface) {
			under = play.hold(_rapierNotesLiftStep(surface, play.c0, shift, 0, 1));
			surface.style.pointerEvents = 'none';
			taps = play.c0 + shift * RAPIER_NOTES_LIFT_MS; free();
		}
		play(page, [{opacity: 1}, {opacity: 0}], shift, shift + AT.cardsIn - AT.noteOut, 'linear');
		const head = surface?.querySelector('.rapier-notes-head'); if (!head) return;
		for (const g of glides) {
			const to = head.querySelector(g.sel), anim = to && _rapierNotesLiftGlide(g, to, play.c0); if (!anim) continue;
			to.classList.add('rapier-notes-glided'); heads.push(to); play.hold(anim);
		}
		for (const el of head.children) if (!el.classList.contains('rapier-notes-head__gap') && !heads.includes(el)) touched.push(_rapierNotesLiftPlay(el, [{opacity: 0}, {opacity: 1}], play.c0, AT.headIn - AT.noteOut + shift, 1, 'linear'));
	};
	const back = {
		covered: noteOut.finished.then(() => {}, () => {}),
		to(snap, {warm = false} = {}) {
			if (done) return;
			const card = snap?.rect;
			if (!card || !(card.width > 0 && card.height > 0) || !snap.face) { back.away({warm}); return; }
			const shift = warm ? AT.noteOut : 0, play = second(warm ? t0 : _rapierNotesLiftNow());
			home = state.surface?.querySelector('.rapier-notes-card[data-notes-file="' + CSS.escape(String(snap.file || '')) + '"]');
			home?.classList.add('rapier-notes-card--lifted');
			const move = ground ? (el, frames) => play(el, frames, shift, 1) : play;
			move(plate, [{transform: _rapierNotesLiftPlateAt(from, W, H)}, {transform: _rapierNotesLiftPlateAt(card, W, H)}]);
			if (!colour) { if (warm) play.hold(_rapierNotesLiftStep(plate, play.c0, shift, 0, 1)); else plate.style.opacity = ''; }
			const face = _rapierNotesLiftWords(clip, snap, from, card, move);
			play(face, [{opacity: 0}, {opacity: 1}], AT.faceIn, 1, 'linear');
			arrive(warm, shift, play);
			play.land();
		},
		away({warm = false} = {}) {
			if (done) return;
			const shift = warm ? AT.noteOut : 0, play = second(warm ? t0 : _rapierNotesLiftNow());
			play(plate, [{opacity: colour ? 1 : 0}, {opacity: 0}], shift, shift + AT.cardsIn - AT.noteOut, 'linear', 'forwards');
			arrive(warm, shift, play);
			play.land();
		},
		leave(ms) {
			if (done) return;
			if (!(ms > 0)) { back.end(); return; }
			left = true;
			bar?.classList.remove('top-bar--notes-lifting');
			const out = (el, from) => el.animate([{opacity: from}, {opacity: 0}], {duration: ms, easing: 'linear', fill: 'forwards'});
			const now = performance.now(), k = going ? (now - t0) / RAPIER_NOTES_LIFT_MS : 0;
			if (surface?.isConnected) { const o = under ? (going && taps != null && now >= taps ? 1 : 0) : Number(getComputedStyle(surface).opacity); under?.cancel(); under = out(surface, o); surface.style.pointerEvents = 'none'; }
			const gone = out(lift, 1);
			for (const c of copies) if (c.copy.isConnected) out(c.copy, glides.some(g => g.copy === c.copy) ? 1 : Math.max(0, Math.min(1, 1 - k / AT.noteOut)));
			return gone.finished.then(() => back.end(), () => back.end());
		},
		end() {
			if (done) return; done = true;
			bar?.classList.remove('top-bar--notes-lifting');
			for (const el of heads) el.classList.remove('rapier-notes-glided');
			for (const a of touched) a.cancel();
			home?.classList.remove('rapier-notes-card--lifted');
			under?.cancel(); if (surface) surface.style.pointerEvents = '';
			for (const c of copies) c.copy.remove();
			lift.remove();
			if (state.liftBack === back) state.liftBack = null;
		},
	};
	requestAnimationFrame(() => requestAnimationFrame(() => {
		if (done || left) return;
		const by = t0 - _rapierNotesLiftNow();
		t0 -= by; going = true;
		for (const a of [...lift.getAnimations({subtree: true}), ...copies.flatMap(c => c.copy.getAnimations()), ...touched, under]) if (a && a.startTime != null) a.startTime -= by;
		if (taps != null) { taps -= by; free(); }
	}));
	state.liftBack = back;
	return back;
}
function _rapierNotesLiftCancel() { _rapierNotes.liftBack?.end(); }
async function _rapierNotesLiftShrink(back, file) {
	let card = null;
	for (let i = 0; i < 80 && !card && file; i++) { card = _rapierNotes.open ? document.querySelector('.rapier-notes-card[data-notes-file="' + CSS.escape(file) + '"]') : null; if (!card) await new Promise(resolve => setTimeout(resolve, 16)); }
	if (card) { try { card.scrollIntoView({block: 'center'}); } catch (_) {} await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
	if (_rapierNotes.liftBack !== back) return;
	if (card) back.to(_rapierNotesLiftSnapshot(file, card)); else back.away();
}
function _rapierNotesBackOver(observe = false) {
	const state = _rapierNotes;
	const dismiss = close => { if (!observe) close(); return true; };
	if (state.open && state.surface && !state.surface.hidden) {
		if (_rapierNotesBinIsOpen()) return dismiss(() => _rapierNotesBinOpen(false));
		if (_rapierNotesSettingsIsOpen()) return dismiss(() => _rapierNotesSettingsOpen(false));
		if (state.askEl?.classList.contains('open')) return dismiss(() => _rapierNotesAskOpen(false));
		if (state.jumpEl?.classList.contains('open')) return dismiss(() => _rapierNotesJumpOpen(false));
		if (state.sheet?.classList.contains('rapier-notes-sheet--open')) return dismiss(() => _rapierNotesHideSheet());
		if (state.reorder) return dismiss(() => _rapierNotesReorderOn(false));
		if (state.popup) return dismiss(() => _rapierNotesPopup(null));
		if (state.selected.size || state.sheetMode === 'imports') return dismiss(() => _rapierNotesCloseSheet());
		if (state.addsBar && !state.addsBar.hidden) return dismiss(() => _rapierNotesAddsToggle(false));
		if (state.find && !state.find.hidden) return dismiss(() => _rapierNotesSearchToggle());
		return false;
	}
	if (state.compose) return dismiss(() => _rapierNotesCloseSheet());
	return false;
}
async function _rapierNotesBackFromNote(keep) {
	const state = _rapierNotes, trail = state.noteTrail || [];
	if (keep == null) keep = trail.length - 1;
	const file = keep >= 0 ? trail[keep] : null, entry = file && state.index?.notes[file];
	if (!file || !entry || entry.trashed) return _rapierNotesOpen();
	state.noteTrail = trail.slice(0, keep); state.trailKeep = true;
	let opened;
	try { opened = await _rapierNotesOpenNote(file); } finally { state.trailKeep = false; }
	if (opened !== true && state.current !== file) state.noteTrail = trail;
	return opened === true;
}
function _rapierNotesHandleBack(overEditorOnly = false) {
	const state = _rapierNotes;
	if (_rapierNotesBackOver()) return true;
	if (state.open && state.surface && !state.surface.hidden) {
		if (_rapierNotesIsApp()) return false;
		_rapierNotesAskOpen(true); return true;
	}
	if (!overEditorOnly && state.mode && state.current) {
		if (_rapierNotesIsApp()) return state.captureToken ? false : _rapierLeaveAsk(true);
		void _rapierNotesBackFromNote(); return true;
	}
	return false;
}
const RAPIER_NOTES_HISTORY = {editor: 0, cards: 1, note: 2};
function _rapierNotesEntryState(state) { return typeof _rapierBackState === 'function' ? _rapierBackState(state) : state; }
function _rapierNotesHistory(where) {
	const state = _rapierNotes;
	if (where !== 'note') state.noteTrail = [];
	const want = where === 'note' ? RAPIER_NOTES_HISTORY.note + (state.noteTrail?.length || 0) : RAPIER_NOTES_HISTORY[where], depth = state.historyDepth || 0;
	if (want === depth || _rapierNotesIsApp() || typeof history !== 'object' || !history || typeof history.pushState !== 'function') return;
	try {
		if (want > depth) {
			if (depth === 0 && typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('notes', false);
			for (let i = depth; i < want; i++) history.pushState(_rapierNotesEntryState({rapierNotes: i + 1}), '');
			if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('notes', true);
		}
		else history.go(want - depth);
		state.historyDepth = want;
	} catch (_) {}
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('popstate', () => {
	const state = _rapierNotes;
	const depth = state.historyDepth || 0, to = Number(history.state?.rapierNotes) || 0;
	if (!depth || to >= depth) { if (typeof _rapierPublishDocumentUrl === 'function') _rapierPublishDocumentUrl(); return; }
	const answered = (typeof _rapierDialogsHandleBack === 'function' && _rapierDialogsHandleBack()) ||
		(typeof _rapierDrawHandleBack === 'function' && _rapierDrawHandleBack()) || _rapierNotesBackOver() ||
		(!state.open && state.mode && state.current && typeof _rapierUiHandleBack === 'function' && _rapierUiHandleBack()) ||
		(to === 0 && state.open && (_rapierNotesAskOpen(true), true));
	if (answered) { _rapierNotesHistoryAgain(to, depth); return; }
	state.historyDepth = to;
	if (to >= 2 && state.mode && state.current && !state.open && state.noteTrail?.length) void _rapierNotesBackFromNote(to - 2).then(ok => { if (!ok && (state.historyDepth || 0) === to) _rapierNotesHistoryAgain(to, depth); });
	else if (to === 1 && state.mode && state.current && !state.open) void _rapierNotesOpen().then(() => { if (!state.open && state.mode && state.current && (state.historyDepth || 0) === 1) _rapierNotesHistoryAgain(1, depth); });
	else if (to === 0 && state.mode && state.current) { state.historyDepth = 0; void _rapierNotesOpen(); }
});
function _rapierNotesHistoryAgain(from, depth) {
	const state = _rapierNotes;
	try {
		for (let i = from + 1; i <= depth; i++) {
			history.pushState(_rapierNotesEntryState({rapierNotes: i}), '');
			if (i === 1 && typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('notes', true);
			if (i >= 2 && state.current) _rapierNotesPublishUrl(state.current);
		}
		state.historyDepth = depth;
	} catch (_) {}
}
function _rapierNotesSectionOf(file) {
	const M = _rapierNotesModel(), state = _rapierNotes;
	for (const id of _rapierNotesSectionIds()) if (M.sortedSection(state.index, id).includes(file)) return id;
	return null;
}
function _rapierNotesReturnToCards() {
	const state = _rapierNotes, file = state.current, surface = state.surface;
	if (!state.mode || !file || state.open || !surface || !state.index?.notes[file] || !state.grids) return false;
	if (state.untitled.has(file) && !_rapierNotesBody(state.texts.get(file) || '').trim()) return false;
	if (!_rapierNotesDocumentBound()) return false;
	const old = surface.querySelector('.rapier-notes-card[data-notes-file="' + CSS.escape(file) + '"]');
	if (!old || !old.parentElement) return false;
	const grid = old.parentElement, id = grid.parentElement?.dataset.notesSection;
	if (!id || _rapierNotesSectionOf(file) !== id) return false;
	for (const section of _rapierNotesSectionIds()) {
		if (section === 'skills' && !_rapierNotesSkillsWanted() || _rapierNotesClosed(section)) continue;
		const held = state.windows[section]?.files || [];
		const files = _rapierNotesSorted(_rapierNotesModel().sortedSection(state.index, section)).filter(_rapierNotesMatches);
		if (held.length !== files.length || held.some((name, at) => name !== files[at])) return false;
	}
	const fresh = _rapierNotesCard(file);
	fresh.style.setProperty('--x', old.style.getPropertyValue('--x')); fresh.style.setProperty('--y', old.style.getPropertyValue('--y'));
	fresh.dataset.notesSlot = old.dataset.notesSlot || ''; fresh.dataset.notesBox = old.dataset.notesBox || '';
	fresh.style.transition = 'none';
	old.replaceWith(fresh);
	const back = _rapierNotesLiftBack();
	surface.classList.remove('rapier-notes-surface--in');
	surface.hidden = false; state.open = true; document.body.classList.add('rapier-notes-open');
	document.getElementById('toast-root')?._rapierDismissNoticeView?.('editor');
	_rapierNotesStartClass(false);
	_rapierNotesHeadPaint();
	_rapierNotesFence(true);
	if (state.scroll && Number.isFinite(state.scrollKept)) { _rapierNotesScrollQuiet(); state.scroll.scrollTop = state.scrollKept; }
	_rapierNotesPack(grid);
	requestAnimationFrame(() => { fresh.style.transition = ''; });
	_rapierNotesHistory('cards');
	if (back) {
		try { fresh.scrollIntoView({block: 'nearest'}); } catch (_) {}
		back.to(_rapierNotesLiftSnapshot(file, fresh), {warm: true});
	}
	fresh.focus({preventScroll: true});
	if (_rapierNotesIsApp()) {
		if (!state.remindTimer) state.remindTimer = setInterval(_rapierNotesRemindTick, RAPIER_NOTES_REMIND_MS);
		_rapierNotesRemindTick();
	}
	return true;
}
async function _rapierNotesOpen(capture = false, {unseen = false, guard, departure} = {}) {
	if (guard && !guard()) return false;
	if (!_rapierEmbedFeatureAllowed('notes')) return false;
	if (!capture && !await _rapierNotesUnlock()) return;
	if (guard && !guard()) return false;
	if (typeof _rapierRecorderClosePlayers === 'function') _rapierRecorderClosePlayers(); if (typeof _rapierAttachmentsClose === 'function') _rapierAttachmentsClose();
	const state = _rapierNotes;
	const kept = departure && _rapierMutationStampIsCurrent(departure.stamp);
	state.opening = true;
	let lift = null, presented = false;
	try {
	if (!kept && state.mode && state.current && !state.open) { try { await _rapierNotesFlush(); } catch (_) { return; } }
	if (guard && !guard()) return false;
	if (_rapierNotesReturnToCards()) {
		if (!unseen) queueMicrotask(() => globalThis.RapierPlatform?.host?.reviewFinished?.('saved-document-left'));
		return;
	}
	const back = state.mode && state.current && !state.open;
	lift = back && !unseen ? _rapierNotesLiftBack() : null;
	await _rapierNotesStore.kind();
	if (guard && !guard()) return false;
	const surface = _rapierNotesEnsure();
	try { await _rapierNotesReady(); } catch (error) { lift?.end(); _rapierNotesStartClass(false); showToast(String(error.message || error), 'error'); return; }
	if (guard && !guard()) return false;
	if (!kept) { try { await _rapierNotesFlush(); } catch (_) { lift?.end(); _rapierNotesStartClass(false); return; } }
	if (state.loading) await state.loading;
	if (guard && !guard()) return false;
	const warm = back && !!state.index && state.loadGen > 0 && !state.reloading;
	if (warm) { state.loading = null; _rapierNotesReadsReset(); }
	else {
		state.loading = _rapierNotesLoad().then(() => true).catch(error => { console.warn('[rapier] notes', error); showToast('The notes folder could not be read: ' + String(error?.message || error), 'error'); return false; });
		const loaded = await state.loading; state.loading = null;
		if (!loaded || !state.index) { lift?.end(); _rapierNotesIndexingBegin(); return; }
	}
	if (guard && !guard()) return false;
	await _rapierNotesSweepTrash();
	if (guard && !guard()) return false;
	await _rapierNotesDiscardEmpty(unseen);
	if (guard && !guard()) return false;
	if (lift) await lift.covered;
	if (guard && !guard()) return false;
	if (surface.hidden) surface.classList.toggle('rapier-notes-surface--in', !unseen && !lift && !_rapierNotesStill() && !document.documentElement.classList.contains('rapier-notes-start'));
	surface.hidden = false; state.open = true; presented = true; document.body.classList.add('rapier-notes-open');
	document.getElementById('toast-root')?._rapierDismissNoticeView?.('editor');
	_rapierNotesStartClass(false);
	_rapierNotesHeadPaint();
	_rapierNotesFence(true);
	_rapierNotesLayout();
	_rapierNotesRender();
	_rapierNotesIndexingBegin();
	_rapierNotesHistory('cards');
	if (!warm && typeof _rapierRecorderOfferRecovery === 'function') _rapierRecorderOfferRecovery();
	if (lift) void _rapierNotesLiftShrink(lift, state.current);
	surface.focus({ preventScroll: true });
	if (back && !unseen) queueMicrotask(() => globalThis.RapierPlatform?.host?.reviewFinished?.('saved-document-left'));
	if (_rapierNotesIsApp()) {
		if (!state.remindTimer) state.remindTimer = setInterval(_rapierNotesRemindTick, RAPIER_NOTES_REMIND_MS);
		_rapierNotesRemindTick();
	}
	} finally {
		if (!presented) lift?.end(); state.opening = false;
		if (typeof _rapierBackHold === 'function') _rapierBackHold();
		if (presented) queueMicrotask(() => { void _rapierNotesCatchResume(); });
	}
}
async function _rapierNotesDiscardEmpty(unseen = false) {
	const state = _rapierNotes, file = state.current;
	if (!file || !state.untitled.has(file) || !state.index?.notes[file]) return;
	const text = state.texts.get(file);
	if (text == null || text.trim()) return;
	if (_rapierSourceText() !== text) return;
	const id = state.currentProof?.id || state.index.notes[file].id;
	try {
		await _rapierNotesStore.kind();
		const snapshot = await _rapierNotesStore.folder.discardEmpty({file, id, expectedDigest: await globalThis.RapierNotesIntegrity.sha256(text)});
		_rapierNotesTake(snapshot);
		if (state.current === file && _rapierSourceText() !== text) {
			state.savedGen = -1; await _rapierNotesAutosave(); return;
		}
		if (state.current === file) { _rapierNotesLeaveNote(); _rapierNotesMarkClean(); }
		state.untitled.delete(file); state.texts.delete(file); state.titles.delete(file);
		if (!unseen) showToast('Empty note discarded', 'info');
	} catch (error) { showToast('The empty note could not be removed: ' + String(error?.message || error), 'error'); }
}
function _rapierNotesLayout() {
	const state = _rapierNotes; if (!state.surface) return;
	if (RapierPreferences.read('notesLayout') === 'full') state.surface.style.setProperty('--notes-cols', '1'); else state.surface.style.removeProperty('--notes-cols');
}
function _rapierNotesClose(authorized = false, toNote = false) {
	if (!authorized && _rapierNotes.captureToken) { void _rapierNotesUnlock().then(ok => { if (ok) _rapierNotesClose(true); }); return; }
	const state = _rapierNotes;
	if (!state.surface) return;
	if (!toNote) { _rapierNotesMode(false); _rapierNotesSettingsOpen(false); _rapierNotesJumpOpen(false); if (state.reorder) _rapierNotesReorderOn(false); _rapierNotesAddsToggle(false); }
	_rapierNotesCloseSheet(); _rapierNotesSnackHide();
	const fade = !toNote && !state.surface.hidden && !_rapierNotesStill();
	const after = toNote ? null : state.liftBack?.leave(fade ? 150 : 0);
	if (fade) {
		const s = state.surface, away = () => { s.classList.remove('rapier-notes-surface--closing'); if (!state.open) s.hidden = true; };
		s.classList.add('rapier-notes-surface--closing');
		if (after) void after.then(away); else setTimeout(away, 150);
	}
	else state.surface.hidden = true;
	state.open = false; document.body.classList.remove('rapier-notes-open');
	document.getElementById('toast-root')?._rapierDismissNoticeView?.('notes');
	if (!toNote && typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('notes', false);
	_rapierNotesHeadPaint();
	_rapierNotesFence(false);
	if (!toNote) _rapierNotesHistory('editor');
	if (state.remindTimer) { clearInterval(state.remindTimer); state.remindTimer = 0; }
	state.remindQueue = []; state.opened.clear();
	_rapierNotesRemindSync();
}
function _rapierNotesFence(on) {
	const state = _rapierNotes;
	_rapierNotesToastHome(on);
	if (on) {
		if (state.fenced?.length) return;
		const holds = typeof _rapierIsolationHolds === 'function' ? _rapierIsolationHolds : () => false;
		state.fenced = [...document.body.children].filter(el => el !== state.surface && !['toast-root', 'confirm-overlay', 'sr-live'].includes(el.id) &&
			!/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName) && (!el.hasAttribute('inert') || holds(el)));
		for (const el of state.fenced) el.setAttribute('inert', '');
		if (typeof _rapierIsolationFence === 'function') _rapierIsolationFence(state.fenced, true);
	} else {
		const fenced = state.fenced || [];
		state.fenced = [];
		for (const el of fenced) el.removeAttribute('inert');
		if (typeof _rapierIsolationFence === 'function') _rapierIsolationFence(fenced, false);
	}
}
function _rapierNotesToastHome(inNotes) {
	const state = _rapierNotes, root = document.getElementById('toast-root');
	if (!root || document.body.classList.contains('rapier-draw-open')) return;
	const home = inNotes && state.surface ? state.surface : document.body;
	if (root.parentElement !== home) home.appendChild(root);
}
function _rapierNotesCurrentFile() {
	try {
		const current = _rapierNotes.current;
		if (!current) return null;
		if (!_rapierNotesDocumentBound()) return null;
		return current;
	} catch (_) { return null; }
}

function _rapierNotesFacts() {
	const state = _rapierNotes;
	const root = typeof document === 'undefined' ? null : document.getElementById('toast-root');
	if (root && !root._rapierShowToast && typeof showToast === 'function') root._rapierShowToast = showToast;
	return { open: state.open, popup: state.popup, pictures: typeof _rapierOcrFacts === 'function' ? _rapierOcrFacts() : null, reading: state.reading ? {total: state.reading.total, done: state.reading.done, complete: state.reading.complete} : null, unread: [...state.readFailed.keys()], windows: Object.fromEntries(Object.entries(state.windows).map(([id, w]) => [id, {derived: w.masonry.next, total: w.masonry.items.length, complete: w.masonry.next === w.masonry.items.length, extent: w.masonry.extent}])), fabTop: state.fab ? parseFloat(state.fab.style.top) || 0 : null, sections: state.index ? _rapierNotesSectionIds() : null, collapsed: state.index ? Object.fromEntries(_rapierNotesSectionIds().map(id => [id, _rapierNotesClosed(id)])) : null, files: state.index ? Object.keys(state.index.notes) : null, current: state.current, index: state.index ? JSON.parse(JSON.stringify(state.index)) : null, drag: !!state.drag, held: !!state.drag?.held, selected: [...state.selected], snack: state.snack ? state.snack.message : null, dirty: typeof _rapierIsDirty === 'function' ? !!_rapierIsDirty() : null, asks: typeof _rapierConfirmDirtyTransition === 'function', lastBackup: state.lastBackup || null , backupPath: state.backupPath || null, savedGen: state.savedGen, savingGen: state.savingGen, generation: Number(rapier?.revision?.generation || 0), sheetMode: state.sheetMode, writes: _rapierNotesStore.chains.size + (_rapierNotesStore.folder?.pending || 0), store: {bytes: _rapierNotesStore.bytes?.kind ?? null, durable: _rapierNotesStore.durable ?? null, reads: _rapierNotesStore.reads}, asciiNames: state.asciiNames, storageKnown: state.storageKnown, thumbs: {known: state.thumbs.size, queue: state.thumbQueue.length, busy: state.thumbBusy, names: state.thumbNames ? [...state.thumbNames] : null}, mode: !!state.mode, compose: !!state.compose, library: typeof _rapierNotesLibraryFacts === 'function' ? _rapierNotesLibraryFacts() : null};
}
Object.defineProperty(globalThis, 'rapierNotesFacts', { enumerable: false, get: _rapierNotesFacts });
Object.defineProperty(globalThis, 'rapierNotesStanding', { enumerable: false, get: () => ({ open: !!_rapierNotes.open, current: _rapierNotes.current || null,
	busy: !!(_rapierNotes.noteOpening || _rapierNotes.opening || _rapierNotes.returning || _rapierNotes.renaming) }) });
async function _rapierNotesHostIndex(signal) {
	const store = _rapierNotesStore;
	await store.kind();
	const snapshot = await store.folder.read();
	return signal?.aborted ? null : snapshot.index;
}
function _rapierNotesHostRefusal(error) {
	if (error?.name === 'AbortError') return {refused: 'cancelled'};
	if (error?.code === 'notes_document_law') return {refused: 'document_law'};
	if (error?.code === 'notes_locked') return {availability: 'locked', reason: 'notes_locked', hint: 'Unlock the enrolled Notes endpoint and reconnect.'};
	return {refused: String(error?.code || '').startsWith('notes_') ? error.code : error?.code === 'changed' ? 'notes_changed' : 'notes_folder_unreadable'};
}
function _rapierNotesHostLocked() {
	return _rapierNotes.captureToken ? {availability: 'locked', reason: 'notes_locked', hint: 'Unlock the app to use Notes.'} : null;
}
async function _rapierNotesAgentChange(file, next, base, signal, guard, expectedId, writeOpenNote, canonical) {
	const state = _rapierNotes, store = _rapierNotesStore, sha = globalThis.RapierNotesIntegrity.sha256;
	if (!base) return {reason: 'notes_not_read'};
	if (state.current === file) {
		const binding = _rapierNotesHostDocument();
		if (!binding || typeof writeOpenNote !== 'function') return {reason: 'notes_live_owner_unavailable'};
		const liveGuard = () => {
			signal?.throwIfAborted(); guard?.();
			const current = _rapierNotesHostDocument();
			if (state.current !== file || state.index?.notes[file]?.id !== expectedId ||
				current?.documentId !== binding.documentId || current?.epoch !== binding.epoch)
				throw Object.assign(new Error('The open note changed.'), {code: 'notes_changed', notesMutationStarted: false});
		};
		liveGuard();
		try { return await writeOpenNote({file, noteId: expectedId, text: next, base, binding}, {signal, guard: liveGuard}); }
		catch (error) { return error?.notesMutationStarted === false ? _rapierNotesHostRefusal(error) : {outcome: 'uncertain', reason: 'notes_write_unconfirmed'}; }
	}
	await store.kind();
	const folder = store.folder, bytes = store.bytes;
	const active = () => {
		signal?.throwIfAborted(); guard?.();
		if (state.current === file || folder !== store.folder || bytes !== store.bytes) throw Object.assign(new Error('The note binding changed.'), {code: 'notes_changed', notesMutationStarted: false});
	};
	let opened;
	try { opened = await folder.readCanonical({file, id: expectedId}); active(); }
	catch (error) { return _rapierNotesHostRefusal(error); }
	const kernel = globalThis.RapierKernel;
	if (!kernel?.enforceWill || !kernel?.minimalSplice) return {reason: 'notes_law_unavailable'};
	const sourceGuard = (before, after, metadata) => {
		if (kernel.enforceWill(before, after, [kernel.minimalSplice(before, after)], {docKind: metadata?.docKind || 'markdown'})) throw Object.assign(new Error('The document instruction refused this change.'), {code: 'notes_document_law', notesMutationStarted: false});
	};
	let saved;
	try { saved = await folder.save({file, id: expectedId, expectedDigest: [base], text: next}, {signal, guard: active, canonical, sourceGuard}); }
	catch (error) { return error?.notesMutationStarted === false ? _rapierNotesHostRefusal(error) : {outcome: 'uncertain', reason: 'notes_write_unconfirmed'}; }
	try { _rapierNotesTake(saved); _rapierNotesHold(saved.file, saved.text); if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(saved.file); }
	catch (error) { console.warn('[rapier] notes: the saved change could not be presented', error); }
	return {file: saved.file, changed: !saved.unchanged, act: saved.act, saved: saved.text};
}
const _rapierNotesHostRefs = new Map();
function _rapierNotesHostRef(file, index = _rapierNotes.index) {
	const store = _rapierNotesStore, id = index?.notes[file]?.id;
	if (!id || !store.folder || !store.bytes) return null;
	for (const [ref, held] of _rapierNotesHostRefs) {
		if (held.folder !== store.folder || held.bytes !== store.bytes || held.ownerEpoch !== store.folder?.owner.incarnation) { _rapierNotesHostRefs.delete(ref); continue; }
		if (held.id === id) return ref;
	}
	const ref = 'note_' + crypto.randomUUID();
	_rapierNotesHostRefs.set(ref, {id, folder: store.folder, bytes: store.bytes, ownerEpoch: store.folder.owner.incarnation});
	return ref;
}
function _rapierNotesHostResolve(ref, index) {
	const held = _rapierNotesHostRefs.get(ref), store = _rapierNotesStore;
	if (!held || held.folder !== store.folder || held.bytes !== store.bytes || held.ownerEpoch !== store.folder?.owner.incarnation) return null;
	const file = Object.keys(index.notes).find(file => index.notes[file]?.id === held.id);
	return file ? {file, id: held.id, entry: index.notes[file]} : null;
}
function _rapierNotesHostDocument() {
	if (_rapierNotesHostLocked() || !_rapierNotes.mode || !_rapierNotes.current ||
		!_rapierNotesDocumentBound() ||
		typeof _rapierNotesOwnTheDocument !== 'function' || !_rapierNotesOwnTheDocument()) return null;
	return {documentId: String(rapier.identity.authority), epoch: Number(rapier.identity.epoch || 0)};
}
globalThis.rapierNotesHost = Object.freeze({
	async write({text, title = '', target, by, base, author, actor, principal, transport, requestId, turn_id, label}, {signal, guard: endpointGuard, writeOpenNote} = {}) {
		let submitted = false;
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			if (!target ||
				!['create', 'note'].includes(target.kind) || target.kind === 'note' && typeof target.note_ref !== 'string' ||
				Object.keys(target).some(key => !(target.kind === 'create' ? ['kind'] : ['kind', 'note_ref']).includes(key))) return {refused: 'notes_write_invalid'};
			const bytes = _rapierNotesStore.bytes;
			const guard = () => {
				endpointGuard?.();
				if (_rapierNotesHostLocked() || bytes && _rapierNotesStore.bytes !== bytes) throw Object.assign(new Error('Notes is locked.'), {code: 'notes_locked'});
			};
			await _rapierNotesReady();
			const M = _rapierNotesModel(), index = await _rapierNotesHostIndex(signal);
			if (!index || signal?.aborted || bytes && _rapierNotesStore.bytes !== bytes || typeof text !== 'string') return null;
			const resolved = target.kind === 'note' ? _rapierNotesHostResolve(target.note_ref, index) : null;
			if (target.kind === 'note' && (!resolved || resolved.entry.trashed)) return {refused: 'notes_target_missing'};
			const of = resolved?.file || '';
			guard();
			if (!author || author.kind !== 'agent' || typeof author.id !== 'string' || !author.id) return {refused: 'notes_author_unavailable'};
			const canonical = {author, transport, requestId, principal, turn_id, ...(label !== undefined ? {label} : {}), operation: 'notes.write'};
			const at = Date.now(), body = title && !/^#\s/.test(text) ? '# ' + title + '\n\n' + text : text;
			if (of) {
				const change = await _rapierNotesAgentChange(of, text, base, signal, guard, resolved.id, writeOpenNote, canonical);
				if (change?.file) {
					try { if (_rapierNotes.open) _rapierNotesRender(); } catch (_) {}
					return {file: change.file, note_ref: _rapierNotesHostRef(change.file), applied: true, original_changed: change.changed !== false,
						created: false, saved: change.saved ?? text, ...(Object.hasOwn(change, 'act') ? {act: change.act} : {})};
				}
				if (!change) return null;
				return change.outcome || change.refused || change.availability ? change : {refused: change.reason || 'notes_write_unconfirmed'};
			}
			const mark = {agent: M.cleanAgent({by, at})};
			if (!mark.agent) return {refused: 'notes_write_invalid'};
			submitted = true;
			const request = requestId ? await globalThis.RapierNotesIntegrity.sha256(JSON.stringify([principal || '', transport || 'platform', requestId])) : undefined;
			const saved = await _rapierNotesStore.folder.create(body, title || '', mark, request, {signal, guard, canonical});
			_rapierNotesTake(saved); const file = saved.file;
			try { if (_rapierNotes.open) _rapierNotesRender(); } catch (_) {}
			return {file, note_ref: _rapierNotesHostRef(file), applied: true, original_changed: false, created: true, saved: saved.text, act: saved.act};
		} catch (error) { console.warn('[rapier] notes: the agent\'s write did not finish', error); return submitted && error?.notesMutationStarted !== false ? {outcome: 'uncertain', reason: 'notes_write_unconfirmed'} : _rapierNotesHostRefusal(error); }
	},
	async find({query = '', signal} = {}) {
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			const bytes = _rapierNotesStore.bytes;
			const denied = () => _rapierNotesHostLocked() || bytes && _rapierNotesStore.bytes !== bytes;
			if (denied()) return null;
			await _rapierNotesReady();
			const M = _rapierNotesModel(), index = await _rapierNotesHostIndex(signal);
			if (!index || signal?.aborted || denied()) return null;
			const rows = [], texts = new Map();
			for (const [file, entry] of Object.entries(index.notes)) {
				if (entry.trashed && !query) continue;
				let text = null;
				try { text = (_rapierNotes.index === index ? _rapierNotes.texts.get(file) : undefined) ?? await _rapierNotesStore.read(file); }
				catch (error) { if (error?.code !== 'unreadable') throw error; }
				if (signal?.aborted || denied()) return null;
				if (query && typeof text !== 'string') return {refused: 'notes_search_incomplete'};
				if (query) texts.set(file, text);
				const card = M.projectCard(file, typeof text === 'string' ? text : '');
				rows.push({file, note_ref: _rapierNotesHostRef(file, index), title: card.title || '', section: M.sectionOf(entry, index.sections), skill: entry.skill === true, ...(Number.isFinite(entry.modified) ? {modified: entry.modified} : {})});
			}
			if (denied()) return null;
			if (!query) return rows;
			const found = typeof _rapierNotesLibrarySearchList === 'function' ? _rapierNotesLibrarySearchList(texts, index, query) : null;
			return found ? rows.filter(row => found.has(row.file)) : {refused: 'notes_search_incomplete'};
		} catch (error) { console.warn('[rapier] notes: the agent\'s find was refused', error); return _rapierNotesHostRefusal(error); }
	},
	async read(note_ref, {version, signal, readOpenNote} = {}) {
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			const bytes = _rapierNotesStore.bytes;
			const ownerEpoch = _rapierNotesStore.folder?.owner.incarnation;
			const denied = () => _rapierNotesHostLocked() || bytes && _rapierNotesStore.bytes !== bytes || ownerEpoch !== _rapierNotesStore.folder?.owner.incarnation;
			if (denied()) return null;
			await _rapierNotesReady();
			const M = _rapierNotesModel(), index = await _rapierNotesHostIndex(signal);
			if (!index || signal?.aborted || denied()) return null;
			const resolved = _rapierNotesHostResolve(note_ref, index);
			if (!resolved) return {refused: 'notes_reference_invalid'};
			const {file: name, entry} = resolved;
			if (version !== undefined) {
				if (!entry.id) return null;
				const H = globalThis.RapierNotesHistory;
				if (!H) return {refused: 'notes_history_unavailable'};
				const manifest = H.parseManifest(await _rapierNotesStore.readHistory(H.manifestName(entry.id)), {noteId: entry.id, now: Date.now()});
				if (!manifest.versions.some(row => row.id === version)) return null;
				const held = await H.materialize(manifest, version, path => _rapierNotesStore.readHistory(path));
				return signal?.aborted || denied() ? null : {file: name, note_ref, text: held.text, version};
			}
			if (_rapierNotes.current === name) {
				const binding = _rapierNotesHostDocument();
				if (!binding || typeof readOpenNote !== 'function') return {refused: 'notes_live_owner_unavailable'};
				const guard = () => {
					signal?.throwIfAborted();
					if (denied()) throw Object.assign(new Error('Notes is locked.'), {code: 'notes_locked'});
					const current = _rapierNotesHostDocument();
					if (_rapierNotes.current !== name || _rapierNotes.index?.notes[name]?.id !== resolved.id ||
						current?.documentId !== binding.documentId || current?.epoch !== binding.epoch)
						throw Object.assign(new Error('The open note changed.'), {code: 'notes_changed'});
				};
				guard();
				const live = await readOpenNote({file: name, noteId: resolved.id, binding}, {signal, guard});
				guard();
				if (typeof live?.text !== 'string') return live?.refused || live?.outcome || live?.availability ? live : {refused: live?.reason || 'notes_live_owner_unavailable'};
				return {file: name, note_ref, text: live.text, controls: {...M.noteControlsSnapshot(index, name, live.text), ownerEpoch: _rapierNotesStore.folder.owner.incarnation}, section: M.sectionOf(entry, index.sections), ...(Number.isFinite(entry.modified) ? {modified: entry.modified} : {})};
			}
			const snapshot = await _rapierNotesStore.queue(name, () => _rapierNotesStore.folder.read({bodies: [name]}));
			if (snapshot.index.notes[name]?.id !== resolved.id || _rapierNotes.current === name) return {refused: 'notes_changed'};
			const body = snapshot.bodies.get(name);
			const text = body ? new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(body) : null;
			if (typeof text !== 'string' || signal?.aborted || denied()) return null;
			return {file: name, note_ref, text, controls: {...M.noteControlsSnapshot(snapshot.index, name, text), ownerEpoch: _rapierNotesStore.folder.owner.incarnation}, section: M.sectionOf(snapshot.index.notes[name], snapshot.index.sections), ...(Number.isFinite(entry.modified) ? {modified: entry.modified} : {})};
		} catch (error) { console.warn('[rapier] notes: the agent\'s read was refused', error); return _rapierNotesHostRefusal(error); }
	},
	async history(note_ref, {signal} = {}) {
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			await _rapierNotesReady();
			const store = _rapierNotesStore; await store.kind(); const bytes = store.bytes;
			const index = await _rapierNotesHostIndex(signal), resolved = index && _rapierNotesHostResolve(note_ref, index);
			if (!resolved) return {refused: 'notes_reference_invalid'};
			const {file, entry} = resolved;
			if (!entry.id) return {file, note_ref, found: true, versions: [], tidied: 0, tidiedAt: null};
			const H = globalThis.RapierNotesHistory;
			if (!H) return {refused: 'notes_history_unavailable'};
			const manifest = H.parseManifest(await store.readHistory(H.manifestName(entry.id)), {noteId: entry.id, now: Date.now()});
			if (signal?.aborted || _rapierNotesHostLocked() || store.bytes !== bytes) return {refused: 'cancelled'};
			return {file, note_ref, found: true, versions: H.versionsOf(manifest, file).reverse().map(row => ({version: row.id, time: row.time, reason: row.reason, size: row.size, current: row.id === manifest.current})),
				tidied: manifest.thinned.reduce((sum, batch) => sum + batch.removes.length, 0), tidiedAt: manifest.thinned.at(-1)?.time ?? null};
		} catch (error) { return _rapierNotesHostRefusal(error); }
	},
	async set({note_ref, expected, author, actor, principal, transport, requestId, turn_id, label, ...input}, {signal, guard: endpointGuard} = {}) {
		let submitted = false;
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			await _rapierNotesReady();
			const M = _rapierNotesModel(), fields = Object.fromEntries(M.NOTE_CONTROL_FIELDS.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
			const index = await _rapierNotesHostIndex(signal), resolved = index && _rapierNotesHostResolve(note_ref, index);
			if (!resolved) return {refused: 'notes_reference_invalid'};
			const {file} = resolved;
			const app = _rapierNotesIsApp();
			if (Object.hasOwn(fields, 'reminder') && (!app || typeof globalThis.RapierPlatform?.host?.scheduleReminder !== 'function')) return {refused: 'notes_reminder_app_only'};
			const store = _rapierNotesStore; await store.kind(); const bytes = store.bytes;
			const guard = () => {
				endpointGuard?.();
				if (_rapierNotesHostLocked() || store.bytes !== bytes) throw Object.assign(new Error('Notes is locked.'), {code: 'notes_locked'});
				if (Object.hasOwn(fields, 'tags') && _rapierNotes.current === file) throw Object.assign(new Error('The person has this note open.'), {code: 'notes_open'});
			};
			guard();
			const fresh = await store.folder.read(), id = fresh.index.notes[file]?.id;
			if (!id || id !== resolved.id) return {refused: 'notes_target_missing'};
			submitted = true;
			if (Object.hasOwn(fields, 'tags') && (!author || author.kind !== 'agent' || !author.id)) return {refused: 'notes_author_unavailable'};
			const canonical = {author, principal, transport, requestId, turn_id, ...(label !== undefined ? {label} : {})};
			const sourceGuard = (before, after) => {
				const kernel = globalThis.RapierKernel;
				if (!kernel?.enforceWill || !kernel?.minimalSplice || kernel.enforceWill(before, after, [kernel.minimalSplice(before, after)])) throw Object.assign(new Error('The document instruction refused this change.'), {code: 'notes_document_law', notesMutationStarted: false});
			};
			const saved = await store.folder.controls({file, id, fields, expected}, {signal, app, guard, canonical, sourceGuard});
			_rapierNotesTake(saved); _rapierNotesHold(file, saved.text);
			try {
				if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file);
				if (_rapierNotes.open) _rapierNotesRender();
				_rapierNotesHeadPaint();
			} catch (_) {}
			const result = {file, note_ref, changed: saved.changed, previous: saved.previous, act: saved.act, replayed: saved.replayed, controls: saved.controls, revision: await globalThis.RapierNotesIntegrity.sha256(saved.text)};
			if (Object.hasOwn(fields, 'reminder')) result.reminder = {device: 'app', saved: true, delivery: 'device_managed'};
			return result;
		} catch (error) { return submitted && error?.notesMutationStarted !== false ? {outcome: 'uncertain', reason: 'notes_set_unconfirmed'} : _rapierNotesHostRefusal(error); }
	},
	async undo({act, note_ref, expected, author, principal, transport, requestId, turn_id, label}, {signal, guard: endpointGuard} = {}) {
		let submitted = false;
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			await _rapierNotesReady();
			const match = /^notes-controls:([A-Za-z0-9][A-Za-z0-9._-]{0,63}:[1-9][0-9]*):[0-9a-f-]{36}$/.exec(act || '');
			if (!match) return {refused: 'notes_act_unavailable'};
			const store = _rapierNotesStore; await store.kind(); const bytes = store.bytes, folder = store.folder; let sourceBearing = false, targetFile = null;
			const guard = () => {
				signal?.throwIfAborted(); endpointGuard?.();
				if (!expected || expected.ownerEpoch !== folder.owner.incarnation) throw Object.assign(new Error('Read this note in the current store.'), {code: 'notes_read_required'});
				if (_rapierNotesHostLocked() || store.bytes !== bytes || store.folder !== folder) throw Object.assign(new Error('Notes is locked.'), {code: 'notes_locked'});
				if (sourceBearing && _rapierNotes.current === targetFile) throw Object.assign(new Error('Close this note before undoing its source controls.'), {code: 'notes_open'});
			};
			guard(); const fresh = await folder.read(); guard();
			const resolved = _rapierNotesHostResolve(note_ref, fresh.index);
			if (!resolved || resolved.id !== match[1] || expected.id !== resolved.id) return {refused: 'notes_reference_invalid'};
			const {file} = resolved; targetFile = file;
			const sourceInverseGuard = () => {
				sourceBearing = true; guard();
			};
			const sourceGuard = (before, after) => {
				sourceInverseGuard();
				const kernel = globalThis.RapierKernel;
				if (!kernel?.enforceWill || !kernel?.minimalSplice || kernel.enforceWill(before, after, [kernel.minimalSplice(before, after)])) throw Object.assign(new Error('The document instruction refused this change.'), {code: 'notes_document_law', notesMutationStarted: false});
			};
			const inverseGuard = target => {
				guard(); if (Object.hasOwn(target.groups, 'reminder') && (!_rapierNotesIsApp() || typeof globalThis.RapierPlatform?.host?.scheduleReminder !== 'function')) throw Object.assign(new Error('Reminders are device-owned.'), {code: 'notes_reminder_app_only'});
			};
			const canonical = {author, principal, transport, requestId, turn_id, ...(label !== undefined ? {label} : {})};
			submitted = true;
			const saved = await folder.controlsUndo({file, id: match[1], undo: act, expected}, {signal, guard, canonical, sourceGuard, sourceInverseGuard, inverseGuard});
			_rapierNotesTake(saved); _rapierNotesHold(file, saved.text);
			try { if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file); if (_rapierNotes.open) _rapierNotesRender(); _rapierNotesHeadPaint(); } catch (_) {}
			return {file, note_ref: _rapierNotesHostRef(file, saved.index), changed: saved.changed, previous: saved.previous, act: saved.act, replayed: saved.replayed,
				revision: await globalThis.RapierNotesIntegrity.sha256(saved.text)};
		} catch (error) { return submitted && error?.notesMutationStarted !== false ? {outcome: 'uncertain', reason: 'notes_undo_unconfirmed'} : _rapierNotesHostRefusal(error); }
	},
	activeDocument: _rapierNotesHostDocument,
	async open({note_ref}, {signal, guard: endpointGuard, foregroundGuard, presentationGuard} = {}) {
		let submitted = false;
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			const store = _rapierNotesStore, bytes = store.bytes, folder = store.folder;
			if (!bytes || !folder) return {availability: 'unavailable', reason: 'notes_not_configured'};
			if (typeof foregroundGuard !== 'function' || typeof presentationGuard !== 'function') return {refused: 'notes_foreground_required'};
			const guard = () => {
				signal?.throwIfAborted(); endpointGuard?.();
				if (_rapierNotesHostLocked() || store.bytes !== bytes || store.folder !== folder) throw Object.assign(new Error('Notes is locked.'), {code: 'notes_locked'});
			};
			guard();
			if (!foregroundGuard() || _rapierNotes.noteOpening || _rapierNotes.opening || _rapierNotes.returning || _rapierNotes.renaming) return {refused: 'notes_foreground_changed'};
			const fresh = await folder.read(); guard();
			const resolved = _rapierNotesHostResolve(note_ref, fresh.index);
			if (!resolved || resolved.entry.trashed) return {refused: 'notes_target_missing'};
			if (!foregroundGuard()) return {refused: 'notes_foreground_changed'};
			_rapierNotesTake(fresh, {readOnly: true});
			submitted = true;
			let openedBinding = null;
			const opened = await _rapierNotesOpenNote(resolved.file, false, resolved.id, null, {signal, guard, foregroundGuard, presentationGuard, onOpened: binding => {openedBinding = binding;}});
			endpointGuard?.();
			if (_rapierNotesHostLocked() || store.bytes !== bytes || store.folder !== folder) return {availability: 'locked', reason: 'notes_locked'};
			const binding = _rapierNotesHostDocument();
			const current = binding && _rapierNotes.current === resolved.file && _rapierNotes.currentProof?.id === resolved.id;
			if (!current) return {opened: !!openedBinding, presented: false, note_ref, file: resolved.file,
				...(openedBinding ? {document_binding: openedBinding} : {}), document_access: 'unavailable', reason: openedBinding ? 'notes_foreground_changed' : 'notes_open_refused'};
			return {opened: true, presented: opened === true && !signal?.aborted && presentationGuard() === true && !_rapierNotes.open,
				note_ref, file: resolved.file, document_binding: binding, document_access: 'local'};
		} catch (error) { return submitted ? {outcome: 'uncertain', reason: 'notes_open_unconfirmed'} : _rapierNotesHostRefusal(error); }
	},
	async sync({action, signal, guard} = {}) {
		let submitted = false;
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			guard?.();
			if (action !== 'now') return {refused: 'notes_sync_action_invalid'};
			if (typeof _rapierNotesSyncUi === 'undefined' || typeof _rapierNotesSyncUi.syncNow !== 'function') return {action, synced: false, reason: 'notes_sync_not_configured'};
			submitted = true;
			return await _rapierNotesSyncUi.syncNow({signal, guard});
		} catch (error) { return submitted && error?.notesSyncStarted !== false ? {outcome: 'uncertain', reason: 'notes_sync_unconfirmed'} : _rapierNotesHostRefusal(error); }
	},
});
async function _rapierNotesRequestRole() {
	try {
		const result = await RapierPlatform.host.requestNotesRole();
		if (result?.held) showToast('Rapier is your notes app. Add the Note-taking shortcut in your lock screen settings', 'info');
		else if (result?.settings) showToast('Choose Rapier under Default notes app', 'info');
		else if (!result?.available) showToast('This phone does not offer a notes app setting', 'info');
		else showToast('Open Android Settings, then Apps, Default apps, and choose Rapier as the notes app', 'info');
	} catch (error) { showToast('The notes app request could not be sent: ' + String(error?.message || error), 'error'); }
}
function _rapierNotesInstall() {
	if (globalThis.RapierBenchSession?.active === true) return;
	for (const id of ['notes-open-btn', 'switch-notes-start', 'notes-sync-btn']) { const el = document.getElementById(id); if (el) el.hidden = false; }
	_rapierNotesSyncBoxWear();
	document.getElementById('notes-import-overlay')?.addEventListener('keydown', evt => { if (evt.key !== 'Escape' || evt.isComposing) return; evt.preventDefault(); evt.stopPropagation(); _rapierNotesImportClose(); });
	document.addEventListener('click', evt => {
		if (evt.target.closest?.('[data-action="notes-pin"]')) { void _rapierNotesHeadAct('pin'); return; }
		if (evt.target.closest?.('[data-action="notes-plus"]')) { if (_rapierNotes.compose && _rapierNotes.sheetMode === 'add') _rapierNotesCloseSheet(); else _rapierNotesNoteSheet('add'); return; }
		if (evt.target.closest?.('[data-action="notes-remind"]')) { _rapierNotesNoteSheet('remind'); return; }
		if (evt.target.closest?.('[data-action="notes-kebab"]')) { if (_rapierNotes.compose) _rapierNotesCloseSheet(); else _rapierNotesNoteSheet('actions'); return; }
		if (evt.target.closest?.('[data-action="notes-import"]')) { void _rapierNotesImport(); return; }
		const pick = evt.target.closest?.('[data-action="notes-import-pick"]'); if (pick) { void _rapierNotesImportPick(pick.dataset.value || 'any'); return; }
		if (evt.target.closest?.('[data-action="notes-import-close"]')) { _rapierNotesImportClose(); return; }
		if (evt.target?.id === 'notes-import-overlay') { _rapierNotesImportClose(); return; }
		if (evt.target.closest?.('[data-action="notes-sync"]')) { _rapierNotesSyncPress(); return; }
		if (evt.target.closest?.('[data-action="notes-backup"]')) { void _rapierNotesBackup(); return; }
		if (!evt.target.closest?.('[data-action="notes-open"]')) return;
		try { const overlay = _rapierUi?.refs?.settingsOverlay; if (overlay && typeof closeDialog === 'function') closeDialog(overlay); } catch (_) {}
		void (evt.target.closest?.('#btn-notes-back') ? _rapierNotesBackFromNote() : _rapierNotesOpen());
	});
	try {
		const born = /^#n\/([^/]+)/.exec(RAPIER_NOTES_URL_AT_BIRTH);
		const booted = typeof _rapierBootFactsPublished !== 'undefined' ? _rapierBootFactsPublished : Promise.resolve();
		const first = () => !_rapierNotes.open && !_rapierNotes.mode;
		const settleNote = async (refusal = null) => {
			for (;;) {
				const task = _rapierNotes.noteOpeningTask; if (!task) return;
				let result, error;
				try { result = await task; } catch (failure) { error = failure; }
				if (task !== _rapierNotes.noteOpeningTask) continue;
				if (refusal && error === refusal) return;
				if (error) throw error;
				if (result !== true) throw new Error('The requested note could not be opened.');
				return;
			}
		};
		const openAtBoot = (open, addressed = false) => {
			const opening = booted.then(async () => {
				if (!first()) { await settleNote(); _rapierNotesStartClass(false); return; }
				if (typeof _rapierBootstrapRuntime !== 'undefined' && _rapierBootstrapRuntime.failed) return;
				let result, refusal = null;
				try { result = await open(); }
				catch (error) {
					if (!addressed || error?.code !== 'notes_history_unavailable' ||
						error.message !== 'The note and its canonical history do not agree' ||
						!_rapierNotes.open || _rapierNotes.mode || _rapierNotes.current || !_rapierNotes.index) throw error;
					refusal = error;
				}
				await settleNote(refusal);
				if (addressed && !refusal && result !== true && result !== 'missing' && result !== 'yielded') throw new Error('The requested note could not be opened.');
				if (!_rapierNotes.index || !_rapierNotes.open && !_rapierNotes.mode) throw new Error('The notes folder could not be opened.');
			});
			_rapierNotes.bootOpening = opening;
			opening.catch(() => _rapierNotesStartClass(false));
		};
		if (born) { let id = born[1]; try { id = decodeURIComponent(id); } catch (_) {} openAtBoot(() => _rapierNotesOpenById(id), true); }
		else if ((RapierPreferences.read('notesStart') === 'notes' || RAPIER_NOTES_DOOR_AT_BIRTH) && !RAPIER_NOTES_URL_AT_BIRTH.startsWith('#d/')) {
			_rapierNotesStartClass(first());
			openAtBoot(() => _rapierNotesOpen());
		} else _rapierNotesStartClass(false);
	} catch (_) { _rapierNotesStartClass(false); }
}
_rapierBootFactsPublished.then(_rapierNotesInstall);

globalThis.rapierNotesStart = function rapierNotesStart(kind, captureToken = null) {
	const run = _rapierNotes.captureChain.catch(() => {}).then(() => _rapierNotesCapture(kind, captureToken));
	_rapierNotes.captureChain = run;
	return run;
};
globalThis.rapierNotesWidgetOpen = function rapierNotesWidgetOpen(file, id = null) {
	const run = _rapierNotes.captureChain.catch(() => {}).then(async () => {
		try {
			if (file === 'note' && id == null) return await _rapierNotesStartCapture('note', false);
			await _rapierNotesOpen();
			if (!_rapierNotes.open || !_rapierNotes.index) return false;
			if (file === '' && id == null) return true;
			if (!_rapierNotesModel().isNoteFile(file) || typeof id !== 'string') return false;
			const fresh = await _rapierNotesStore.folder.read();
			const matches = Object.keys(fresh.index.notes).filter(name => fresh.index.notes[name].id === id && !fresh.index.notes[name].trashed);
			if (matches.length !== 1) { showToast('This note moved or was removed. Refresh the widget.', 'info'); return false; }
			if (_rapierNotes.index.notes[matches[0]]?.id !== id) { await _rapierNotesLoad(); _rapierNotesIndexingBegin(); }
			return await _rapierNotesOpenNote(matches[0], false, id);
		} catch (error) { showToast('This note could not be opened. Your current work was kept.', 'error'); return false; }
	});
	_rapierNotes.captureChain = run; return run;
};
globalThis.rapierNotesReceiveShares = function rapierNotesReceiveShares() {
	const run = _rapierNotes.captureChain.catch(() => {}).then(async () => {
		const host = globalThis.RapierPlatform?.host;
		if (!host?.shareInbox || !host.readShared) return false;
		try {
			const inbox = await host.shareInbox('list', {});
			if (!Array.isArray(inbox?.items)) throw new Error('The shared items could not be read.');
			if (!inbox.items.length) return true;
			if (!await _rapierNotesUnlock()) return false;
			await _rapierNotesFlush();
			await _rapierNotesOpen();
			if (!_rapierNotes.open || !_rapierNotes.index) return false;
			const standing = {current: _rapierNotes.current, stamp: _rapierMutationStamp()};
			let last, adopted = true;
			for (const entry of inbox.items) {
				const blob = await host.readShared(entry);
				const base = _rapierNotes.indexBase;
				last = await _rapierNotesStore.folder.createShared(entry, blob);
				if (_rapierNotes.indexBase === base && JSON.stringify(_rapierNotes.index) === JSON.stringify(base)) _rapierNotesTake(last);
				else { _rapierNotesStore.stale = true; adopted = false; }
				const ack = await host.shareInbox('ack', {id: entry.id, digest: entry.digest});
				if (ack?.acknowledged !== true) throw new Error('The shared note was kept but its receipt was not acknowledged.');
			}
			if (adopted && _rapierNotes.open && _rapierNotes.current === standing.current && _rapierMutationStampIsCurrent(standing.stamp)) {
				_rapierNotesRender();
				if (last) await _rapierNotesOpenNote(last.file, false, last.index.notes[last.file]?.id);
			}
			return true;
		} catch (error) {
			showToast('The share could not finish. Its original is kept for another try.', 'error');
			console.warn('[rapier] share', error); return false;
		}
	});
	_rapierNotes.captureChain = run; return run;
};
async function _rapierNotesCapture(kind, captureToken) {
	if (captureToken) { _rapierNotes.captureToken = captureToken; _rapierNotes.capturePreparing = true; }
	let ready = false;
	try {
		if (captureToken && !_rapierNotes.current && typeof _rapierIsDirty === 'function' && _rapierIsDirty()) return;
		ready = await _rapierNotesStartCapture(kind, !!captureToken, true) === true;
	} finally {
		if (captureToken && _rapierNotes.captureToken === captureToken) {
			_rapierNotes.capturePreparing = false;
			await globalThis.RapierPlatform?.host?.captureReady?.(captureToken, ready);
		}
	}
}
async function _rapierNotesStartCapture(kind, capture, captured = false) {
	try { await _rapierNotesOpen(capture); } catch (error) { console.warn('[rapier] notes', error); return; }
	const state = _rapierNotes;
	if (!state.open || !state.index) return;
	if (kind !== 'note' && kind !== 'draw') {
		const M = _rapierNotesModel(), name = String(kind || '');
		if (!M.isNoteFile(name) || !Object.hasOwn(state.index.notes, name)) return;
		if (!state.index.notes[name].trashed) await _rapierNotesOpenNote(name);
		return;
	}
	const noteKind = kind === 'draw' ? 'drawing' : 'note';
	return _rapierNotesNew(noteKind, capture, null, captured);
}

function _rapierNotesRemindSync() {
	const schedule = globalThis.RapierPlatform?.host?.scheduleReminder;
	if (typeof schedule !== 'function' || !_rapierNotes.index || _rapierNotes.remindApplying) return;
	const rows = _rapierNotesModel().nativeReminderRows(_rapierNotes.indexBase || _rapierNotes.index, file => _rapierNotesTitle(file) || file.replace(/\.md$/i, ''));
	let key = JSON.stringify(rows);
	if (key === _rapierNotes.remindSyncedKey) return;
	_rapierNotes.remindSyncedKey = key;
	_rapierNotes.remindChain = _rapierNotes.remindChain.catch(() => {}).then(async () => {
		if (_rapierNotes.remindSyncedKey !== key) return;
		await _rapierNotesDrainReminderActions();
		await _rapierNotesStore.kind();
		const snapshot = await _rapierNotesStore.folder.read();
		if (_rapierNotes.remindSyncedKey !== key) return;
		const current = _rapierNotesModel().nativeReminderRows(snapshot.index, file => _rapierNotesTitle(file) || file.replace(/\.md$/i, ''));
		key = JSON.stringify(current); _rapierNotes.remindSyncedKey = key;
		await schedule(current);
	}).catch(error => {
		if (_rapierNotes.remindSyncedKey === key) {
			_rapierNotes.remindSyncedKey = undefined;
			showToast('The device could not update these reminders. Rapier will retry while Notes is open.', 'error');
		}
		console.warn('[rapier] notes', error);
	});
}

function _rapierNotesReminderFields(sheet, entries) {
	const current = entries[0]?.remind;
	const form = _rapierNotesEl('form', 'rapier-notes-label-form');
	function number(word, value, min, max, step = '1') {
		const field = _rapierNotesEl('input', 'rapier-notes-search'); field.type = 'number'; field.value = String(value);
		field.min = String(min); field.max = String(max); field.step = step; field.required = true; field.setAttribute('aria-label', word);
		const label = _rapierNotesEl('label', 'rapier-notes-remind-label', word); label.appendChild(field); form.appendChild(label); return field;
	}
	function choices(word, options, value) {
		const field = _rapierNotesEl('select', 'rapier-notes-search'); field.setAttribute('aria-label', word);
		for (const [key, text] of options) { const option = _rapierNotesEl('option', '', text); option.value = key; field.appendChild(option); }
		field.value = value; form.appendChild(field); return field;
	}
	function submit(word, act, value) {
		const button = _rapierNotesEl('button', 'rapier-notes-btn', word); button.type = 'submit'; form.appendChild(button);
		form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) void _rapierNotesAct(act, value()); });
	}
	const every = number('Every', current?.every ?? 1, 1, 2147483647);
	const unit = choices('Repeat interval', [['days', 'Days'], ['weeks', 'Weeks'], ['months', 'Months'], ['years', 'Years']], current?.unit || 'days');
	submit('Set custom repeat', 'remind-custom', () => ({every: every.valueAsNumber, unit: unit.value}));
	sheet.appendChild(form);
	const snoozeForm = _rapierNotesEl('form', 'rapier-notes-label-form');
	const snooze = _rapierNotesEl('input', 'rapier-notes-search'); snooze.type = 'number'; snooze.min = '1'; snooze.max = '2147483647'; snooze.step = '1'; snooze.required = true;
	snooze.value = String(current?.snoozeMinutes ?? 10); snooze.setAttribute('aria-label', 'Snooze minutes');
	const save = _rapierNotesEl('button', 'rapier-notes-btn', 'Set snooze'); save.type = 'submit'; snoozeForm.append(snooze, save);
	snoozeForm.addEventListener('submit', event => { event.preventDefault(); if (snoozeForm.reportValidity()) void _rapierNotesAct('remind-snooze-interval', snooze.valueAsNumber); });
	sheet.appendChild(snoozeForm);
}
async function _rapierNotesReminderEdit(files, act, arg) {
	const now = Date.now();
	let change;
	if (act === 'remind-remove') change = {kind: 'remove'};
	else if (act === 'remind-snooze-interval') change = {kind: 'snooze-interval', minutes: arg};
	else if (act === 'remind-pick' || act === 'remind-set') {
		const at = act === 'remind-pick' ? Number(arg) : _rapierNotesParseLocalDateTime(arg);
		if (!Number.isSafeInteger(at) || at < 1) throw new TypeError('Invalid reminder time');
		change = {kind: 'set', remind: {at}};
	} else if (act === 'remind-custom') change = {kind: 'repeat', repeat: 'custom', every: arg.every, unit: arg.unit};
	else if (act === 'remind-repeat') change = {kind: 'repeat', repeat: arg, toggle: true};
	else throw new TypeError('Invalid reminder action');
	await _rapierNotesReminderChange(files, change, now);
	if (change.kind === 'set') {
		if (act === 'remind-set') _rapierNotes.remindReveal = true;
		await _rapierNotesRemindConfirm(change.remind.at, files);
	} else if (change.kind === 'remove') showToast('Reminder removed', 'info');
}

async function _rapierNotesReminderChange(files, change, now = Date.now(), expected = null) {
	if (!_rapierNotesIsApp()) return;
	await _rapierNotesReady(); await _rapierNotesStore.kind();
	await _rapierNotesDrainReminderActions();
	const state = _rapierNotes, M = _rapierNotesModel(), base = state.indexBase;
	const before = JSON.stringify(state.index);
	const targets = expected || files.map(file => ({file, id: state.index.notes[file]?.id,
		remind: JSON.stringify(M.cleanRemind(state.index.notes[file]?.remind))}));
	const snapshot = await _rapierNotesStore.folder.reminderChange(targets, change, now);
	if (state.indexBase !== base || JSON.stringify(state.index) !== before) {
		_rapierNotesStore.stale = true;
		state.remindSyncedKey = undefined; _rapierNotesRemindSync();
		await state.remindChain;
		return snapshot;
	}
	state.remindApplying = true;
	try { _rapierNotesTake(snapshot); } finally { state.remindApplying = false; }
	state.remindSyncedKey = undefined; _rapierNotesRemindSync();
	await state.remindChain;
	for (const file of files) _rapierNotesLibraryTouch(file);
	_rapierNotesRender(); _rapierNotesHeadPaint();
	return snapshot;
}

async function _rapierNotesDrainReminderActions() {
	const host = globalThis.RapierPlatform?.host;
	if (typeof host?.reminderActions !== 'function') return;
	for (;;) {
		const {actions} = await host.reminderActions();
		if (!Array.isArray(actions)) throw new Error('Invalid reminder actions');
		if (!actions.length) return;
		await _rapierNotesReady(); await _rapierNotesStore.kind();
		const base = _rapierNotes.indexBase;
		const snapshot = await _rapierNotesStore.folder.reminderActions(actions);
		if (_rapierNotes.indexBase === base && JSON.stringify(_rapierNotes.index) === JSON.stringify(base)) {
			_rapierNotes.remindApplying = true;
			try { _rapierNotesTake(snapshot); } finally { _rapierNotes.remindApplying = false; }
		} else _rapierNotesStore.stale = true;
		await host.acknowledgeReminderActions(actions.map(action => action.token));
	}
}
globalThis.rapierNotesReceiveReminderActions = function rapierNotesReceiveReminderActions() {
	const state = _rapierNotes;
	state.remindChain = state.remindChain.catch(() => {}).then(_rapierNotesDrainReminderActions).then(() => {
		state.remindSyncedKey = undefined; _rapierNotesRemindSync();
	}).catch(error => { console.warn('[rapier] reminder actions remain pending', error); });
	return state.remindChain;
};

async function _rapierNotesRemindConfirm(at, files) {
    const wanted = files.map(file => { const entry = _rapierNotes.index?.notes[file]; return {file, id:entry?.id, rule:JSON.stringify(entry?.remind)}; });
    const current = () => wanted.every(({file, id, rule}) => {
        const entry = _rapierNotes.index?.notes[file];
        return entry?.id === id && entry?.remind?.at === at && JSON.stringify(entry.remind) === rule;
    });
    if (!current()) return;
    const host = globalThis.RapierPlatform?.host;
    const set = 'Reminder set for ' + _rapierNotesModel().remindWords({at}, Date.now());
    if (typeof host?.scheduleReminder !== 'function') { showToast(set, 'info', null); return; }
    const key = _rapierNotes.remindSyncedKey;
    const live = () => key !== undefined && key === _rapierNotes.remindSyncedKey && current();
    await _rapierNotes.remindChain;
    if (!live()) return;
    try {
        if (typeof host.requestReminderPermission === 'function') await host.requestReminderPermission();
        if (!live()) return;
        const answer = await host.reminderState();
        if (!live()) return;
        if (typeof answer?.notificationsAllowed !== 'boolean' || typeof answer?.exact !== 'boolean') throw new Error('Reminder permission state is unavailable');
        const kind = !answer.notificationsAllowed || answer.blocked ? 'notifications' : !answer.exact ? 'exact' : null;
        const message = kind === 'notifications' ? 'Reminder saved, but notifications are off. Allow Rapier notifications in Settings.'
            : kind === 'exact' ? 'Reminder saved, but it may be delayed. Allow alarms for Rapier in Settings.' : set;
        const open = host.openReminderSettings;
        const action = kind && typeof open === 'function' ? {label:'Settings', fn:async () => {
            try { await open(kind); }
            catch (_) { showToast(kind === 'notifications' ? 'Open Android Settings, then Rapier’s notifications.' : 'Open Android Settings, then Rapier’s alarms and reminders.', 'error'); }
        }} : null;
        showToast(message, 'info', action);
    } catch (_) {
        if (!live()) return;
        showToast('Reminder saved, but Android could not check its alerts. Check Rapier’s notification and alarm settings.', 'info');
    }
}
