// Notes: the card surface over the notes folder.
//
// The rules live in notes/model.mjs (RapierNotesModel), pure and tested in Node; this file draws what
// the model says and talks to the folder.
//
// The folder on the web is a directory in the origin private file system: real files, one `.md` per
// note, `notes.json` beside them. Android binds the same owner to its native files/notes folder;
// native faults never switch a person's library to an empty browser store. This file builds every
// element with createElement/textContent except the card body, which receives rapierRenderPreview's
// already-sanitized export HTML (security/html-sinks.json names that sink).
// The address the page was born with, read before the boot's own document restore can publish over
// it: a `#n/<id>` opens that note the moment the boot completes.
const RAPIER_NOTES_URL_AT_BIRTH = (() => { try { return String(location.hash || ''); } catch (_) { return ''; } })();
// The site's /notes opens straight into the cards: read at birth, as the hash is. `#v/notes` is the same door by
// fragment for a copy of the page with no path of its own (docs/agents.md "The address of a document"), read once
// and taken off.
const RAPIER_NOTES_DOOR_AT_BIRTH = (() => { try {
	// The carried view (`rapier-html --view notes`) is the same door.
	if (document.getElementById('rapier-document')?.dataset.view === 'notes') return true;
	if (/^#v\/notes\/?$/.test(RAPIER_NOTES_URL_AT_BIRTH)) { history.replaceState(history.state, '', location.pathname + location.search); return true; }
	return /^\/notes\/?$/.test(String(location.pathname || ''));
} catch (_) { return false; } })();
const RAPIER_NOTES_DIR = 'notes', RAPIER_NOTES_HOLD_MS = 500, RAPIER_NOTES_HOLD_SLOP = 8, RAPIER_NOTES_MOVED_PX = 8, RAPIER_NOTES_DWELL_MS = 120, RAPIER_NOTES_AUTOSAVE_MS = 700, RAPIER_NOTES_REMIND_MS = 30000;
const _rapierNotes = {
	surface: null, scroll: null, grids: {}, windows: {}, sheet: null, open: false,
	index: null, texts: new Map(), titles: new Map(), hold: new Set(), sizes: new Map(), readFailed: new Map(), reading: null, reads: null, loadGen: 0, popup: null, sheetSwiped: false, fabDrag: null,
	backgroundTouches: new Set(), backgroundInput: false, backgroundComposing: false,
	query: '', current: null, currentProof: null, savedGen: -1, savingGen: -1, savingText: null, autosave: 0, asciiNames: null, drag: null, selected: new Set(), snack: null, loading: null, indexing: null, persistAsked: false, persistReported: false, storageKnown: null, audioBytes: null, capturing: null, renderAfterDrag: false, saveFailed: false, attempted: new Map(), sheetFocus: false, sheetOpener: null, sheetMode: 'actions', importsOpen: null, importUndoReview: null, importUndoBusy: false, historyRows: null, historyOne: null, pastBytes: null, pastVersions: 0, untitled: new Set(), renaming: null, swallowClick: 0, unfolded: new Set(), thumbs: new Map(), thumbNames: null, thumbQueue: [], thumbBusy: false, remindTimer: 0, remindQueue: [], mode: false, compose: false, opened: new Set(), retaking: null, readerSaid: false, captureToken: null, capturePreparing: false, captured: new Set(), captureChain: Promise.resolve(), unlocking: null, remindSyncedKey: undefined, remindChain: Promise.resolve(),
	// The Title field: the empty paragraph standing for it (`slot`), the empty paragraph this shell last
	// made for a field (`fresh`), the two rows a note without a title or a body shows.
	head: {observer: null, scheduled: false, bound: null, slot: null, fresh: null, rows: null}
};
function _rapierNotesModel() { return globalThis.RapierNotesModel; }
function _rapierNotesNoticeModel() {
	return {
		occlusion: globalThis.RapierOcclusion,
		viewport: globalThis.RapierOcclusionViewport,
		life: globalThis.RapierTransientLifecycle,
		surfaces: globalThis.RapierBottomSurfaces,
	};
}
// A note's own words, with the metadata block the person's other apps write taken off the front.
// One reader owns that block (notes/frontmatter.mjs); the shell only ever asks it.
function _rapierNotesBody(text) { const F = globalThis.RapierNotesFrontMatter; return F ? F.stripFrontMatter(String(text || '')) : String(text || ''); }
// The model arrives with the agent bundle, which the shell unpacks beside this script; a tap that
// lands in the first moments after boot waits for it rather than failing.
async function _rapierNotesReady() {
	for (let i = 0; i < 100 && !globalThis.RapierNotesModel; i++) await new Promise(resolve => setTimeout(resolve, 50));
	if (!globalThis.RapierNotesModel) throw new Error('the Notes model did not load');
}

// Native owns the authentication decision. Rejection/cancellation leaves the current capture
// untouched; the ordinary destination is not even opened while the keyguard is deciding.
// A note started over the lock screen must not open the rest of the app until the device itself is
// unlocked, so the way out of that capture asks the host to dismiss the keyguard. Nothing else is
// asked here. An ordinary leave from Notes to the editor is not a device authentication, so it
// never asks the host and is never refused.
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
// Opening a note replaces the editor's document with that note, so Notes remembers what it was
// entered from and leaving restores it. Entered from nothing (the app launched straight into
// Notes), leaving gives the empty editor Rapier starts with rather than the last note read.
function _rapierNotesRemember() {
	const state = _rapierNotes;
	// Capture only after the dirty transition settles. A failed open never publishes this record,
	// and later note visits reuse it rather than retaining another body or another history.
	if (state.cameFrom !== undefined) return state.cameFrom;
	if (_rapierNotesOwnTheDocument()) return null;
	const snapshot = _rapierCreatePersistenceSnapshot(), history = _rapierCreateHostUndoCheckpoint();
	// A direct Notes launch can precede any editor load. There is no document identity (or undo
	// history) to restore yet; loading the empty editor must mint its first ordinary authority.
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
			// Keep the note and the return record until the replacement is admitted. A refusal
			// leaves the same chrome and record available for another attempt.
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
					// A load may have committed before its receipt went stale. Keep that partial return
					// out of the note's autosave, including when both documents have the same filename.
					if (state.cameFrom === from && !_rapierMutationStampSharesDocument(guard)) state.returnRefused = true;
					throw new Error('the document changed or is busy. Try again.');
				}
				if (saved) {
					// No user event can interleave this synchronous install. If an owner refuses,
					// the catch locks this partial view and retains the only admitted return record.
					state.returnRefused = true;
					rapier.access.notesReadOnly = false; rapierSetReadOnly(false);
					_rapierResetSource(saved.canonicalText, saved.sourceRootId);
					// The words, the identity and the reading point are the return; the undo history is installed
					// when the record it was taken from still proves itself, and dropped when it does not,
					// exactly as a reload drops one -- never a refusal. The installer names its refusal in the
					// ledger's trim reason (editor/engine.js _rapierInstallRestoredHistory) for the console.
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
			// View continuity is restored while Notes still fences the editor. Give its surviving
			// input the focus only after that fence is down; otherwise leaving Notes strands it on body.
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
function _rapierNotesIsApp() { try { return String(globalThis.RapierPlatform?.environment?.id || '').toLowerCase() === 'android'; } catch (_) { return false; } }

// ---- The folder --------------------------------------------------------------------------------
async function _rapierNotesDir() {
	const root = await navigator.storage.getDirectory();
	return root.getDirectoryHandle(RAPIER_NOTES_DIR, { create: true });
}
// The one owner of the notes folder: every write to a name goes through that name's own queue, so
// two writes of one file land in the order they were asked and a slow older write can never
// overtake a newer one; `settle` awaits every queue. Only `NotFoundError` means a file is not
// there -- any other fault (quota, a broken store, a browser's own trouble) is thrown and SAID,
// never read as a blank note, a lost sidecar, a free name or a delete that happened. A refused
// file NAME is asked of the folder once, up front (the probe below), never inferred from whatever
// error a write happened to throw.
const _rapierNotesStore = {
	chains: new Map(),
	// How many bodies this window has asked the folder for (rapierNotesFacts.store.reads): a witness's
	// count of what an open or a sweep actually read, never a budget.
	reads: 0,
	// Where the folder is, decided once by asking. The native folder in the Android app; the
	// browser's private file system where there is one; a page opened as a FILE (file://, Android's
	// content:// through a browser) has no origin the browser gives one to -- getDirectory() throws a
	// SecurityError there -- so the folder is then IndexedDB through notes/idb-store.mjs, which such
	// a page does get, and only a page with neither keeps its notes in that store's own memory, said
	// as such. `durable` is null until asked.
	durable: null, probe: null, storageFault: null, native: false,
	// ---- The folder's one owner
	// ---------------------------------------------------------------------
	// notes/folder.mjs on notes/owner.mjs: every write to the folder is a transaction under the
	// owner's own short lock -- the index read fresh, the bodies the plan names read fresh, each write
	// admitted against the digest the writer believed and read back after -- so a second Rapier window
	// on the same folder is another writer whose work survives beside this one's, never a reader and
	// never a clobber. There is no session to hold and nothing to take over.
	bytes: null, folder: null,
	attach(durable) {
		if (this.folder) return;
		const OPFS = globalThis.RapierNotesOPFS, F = globalThis.RapierNotesFolder;
		// OPFS -> IndexedDB -> memory. The rung below the private file system is notes/idb-store.mjs,
		// which every build that carries Notes carries (tools/build.mjs bundles it beside notes/opfs.mjs
		// and notes/folder.mjs): a file page gets no private file system but it does get IndexedDB. That
		// store opens the byte records for itself and owns the last-resort memory library; memory is
		// what it falls to, and only then.
		this.bytes = (this.native ? OPFS.createNativeByteStore : durable ? OPFS.createByteStore : globalThis.RapierNotesIdbStore.createIndexedDbByteStore)({call: globalThis.RapierPlatform?.host?.notesStore, directory: _rapierNotesDir, onFault: error => { console.warn('[rapier] notes', error); }, beforeStep: async (kind, name, bytes) => {
			if (kind === 'read') { if (globalThis.__rapierNotesFailReads && String(globalThis.__rapierNotesFailReads) === name) throw Object.assign(new Error('the notes folder could not be read'), {name: 'UnknownError'}); return; } // witness seam (notes-storage-errors)
			if (kind !== 'write') return;
			if (globalThis.__rapierNotesRefuseWrites) throw new Error('the notes folder refused the write'); // witness seam (notes-keeps-work)
			// A witness can hold one name's write until it says so (notes-autosave-ordering).
			if (typeof globalThis.__rapierNotesHoldWrite === 'function') await globalThis.__rapierNotesHoldWrite(name, /\.md$/i.test(name) ? new TextDecoder().decode(bytes) : bytes);
		}});
		// `shared` is not read off `durable`, which is the OPFS question: the IndexedDB rung takes the
		// same lock and channel the OPFS path uses. IndexedDB is shared with every page of this origin
		// exactly as OPFS is -- and the two scopes are the same one, because pages that do not share an
		// origin do not share the database either. The native folder shares the notification channel
		// too; its mutex lives in Kotlin so renderer death cannot release it ahead of native I/O.
		const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('rapier-notes') : null;
		// Asked when it is needed, not fixed at attach: the rung below OPFS cannot know whether its
		// bytes are shared until it has asked IndexedDB, and `attach` runs before that. Until it has
		// answered the assumption is YES -- the first transaction is the one that asks, and it must
		// not be the one that runs uncoordinated. `memory` is the only answer that means this page
		// alone.
		const shared = () => this.native || durable ? true : ['indexeddb', 'fault', 'unasked'].includes(this.bytes?.kind);
		this.folder = F.createFolder({store: this.bytes, scope: RAPIER_NOTES_DIR, locks: this.native ? OPFS.createNativeNotesLocks({call: globalThis.RapierPlatform.host.notesStore}) : navigator.locks, channel, shared, keep: file => file === _rapierNotes.current, onInvalidate: () => { void _rapierNotesFolderChanged(); }});
	},
	// ONE probe, ever. The promise memoises the asking, not only the answer, so two callers are never
	// both inside getDirectory() at once and a second failure can never make a fresh page-memory
	// library over notes already written to the first: deciding where notes live must never destroy
	// what the person made.
	async kind() {
		if (this.durable != null) { this.attach(this.durable); return this.durable; }
		if (this.probe) return this.probe;
		this.probe = (async () => {
			await globalThis.RapierPlatform?.environment?.ready?.();
			if (String(globalThis.RapierPlatform?.environment?.id || '').toLowerCase() === 'android') {
				// This is the selected store, not a capability fallback. A missing/failed bridge is
				// a visible fault; it must not turn a native library into empty preview Notes.
				try {
					if (typeof globalThis.RapierPlatform.host.notesStore !== 'function') throw new Error('The native Notes folder is unavailable.');
					this.native = true; this.attach(true); await this.bytes.prepare();
					this.durable = true; this.storageFault = null; _rapierNotes.asciiNames = false;
					return true;
				} catch (error) { this.storageFault = error; this.probe = null; throw error; }
			}
			try {
				if (globalThis.__rapierNotesNoStorage) throw new DOMException('It was determined that certain files are unsafe for access within a Web application, or that too many calls are being made on file resources.', String(globalThis.__rapierNotesNoStorage)); // witness seam (notes-file-origin)
				if (!navigator.storage?.getDirectory) throw new Error('this browser has no private file system');
				await _rapierNotesDir();
				this.durable = true;
				this.attach(true);
			} catch (error) {
				// A page that can NEVER have a private file system is one fact; a file system that
				// FAILED this time is a different one, and only the first is preview mode.
				//
				// This module's own law is at the top of the file: any fault that is not "the file is
				// not there" is thrown and SAID, never read as a blank. kind() was the one place that
				// broke it -- it caught everything and answered "no private file system", so a quota
				// error or a browser's own trouble presented somebody's 400-note library as EMPTY and
				// then took their new writing into a store that closes with the tab. Preview mode is
				// right for a phone opening a file:// page. It is a lie about a device that has a
				// folder and could not reach it this once.
				const absent = error?.name === 'SecurityError' || /has no private file system/.test(String(error?.message || ''));
				if (!absent) {
					// Said, not swallowed. The probe is cleared so a retry can genuinely re-ask rather
					// than being handed this failure for the life of the page, and no memory store is
					// created: an empty library is never shown in place of one that exists.
					this.storageFault = error; this.probe = null;
					console.warn('[rapier] notes: the notes folder could not be read this time', error);
					throw error;
				}
				this.storageFault = null;
				console.warn('[rapier] notes: no private file system for this page, the notes go to this browser\'s own storage', error);
				// The fallback rung: OPFS, then IndexedDB, then memory. A file page has no private file system
				// but does get IndexedDB -- it is where a document's own recovery lives. notes/idb-store.mjs
				// opens those byte records itself, once, and nothing here reads them first: a snapshot of that
				// database taken into page memory could be republished over another page's Delete Forever, so
				// no snapshot is taken. Memory is that store's own last resort, created once and never
				// replaced.
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
		while (this.chains.size) {
			for (const result of await Promise.allSettled([...this.chains.values()])) if (result.status === 'rejected') failed ||= result.reason;
		}
		if (failed) throw failed;
	},
	missing(error) { return error?.name === 'NotFoundError'; },
	async scratchFile(dir, name) {
		try { await dir.getFileHandle(name); throw Object.assign(new Error('A temporary file already uses this name. It was kept; retry saving.'), {code: 'collision'}); }
		catch (error) { if (!this.missing(error)) throw error; }
		return dir.getFileHandle(name, {create: true});
	},
	// Whether this browser's private file system takes a name beyond ASCII (some Chromium builds
	// refuse one with TypeMismatchError). Asked once, by trying.
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
			// Only a refused NAME answers this question. Quota and read faults must remain
			// retryable faults, not a cached claim that this device cannot name someone's note.
			if (error?.name !== 'TypeMismatchError') throw error;
			state.asciiNames = true;
		}
		return !state.asciiNames;
	},
	// Where the BYTE STORE answers without a File to hand back: the native folder and IndexedDB (and
	// that store's own memory under it). Listings, a note's bytes and the past are READ through the
	// byte store on EVERY rung -- one reader, never a page cache: a listing or a note's bytes taken
	// from a page's own Map would certify only what THIS page last saw, and a write admitted on it
	// could land on another page's note. What stays per rung is what OPFS does itself: hand out a
	// File without reading its bytes (a stamp, a thumbnail, a recording, a backup stream), and the
	// verified history and recording writes below.
	async port() { const durable = await this.kind(); return this.native || !durable; },
	async list() { await this.kind(); return this.bytes.list(); },
	// The names' sizes AND their modified times, for the bounded reader and for the search index's
	// memory: one handle each, no bytes read. The modified time is a property of the very File this
	// already opens to ask its size, so it costs nothing extra.
	// A listed name the folder no longer answers for is the load's refusal: the folder changed under
	// the listing, and nothing is published on it. Any other fault is thrown and said. A source that
	// cannot give a modified time returns null for it, which the stamp rule reads as "no stamp",
	// which means "always re-read" -- never "close enough".
	async stamps(names) {
		// The native folder answers every name's size and modified time in one call; a call per note would be a hop
		// through the app's UI thread and its one I/O thread each (5,000 notes: 5,000 hops). A few names are asked
		// one by one (the folder's whole listing for one note's check would cost more than it saves).
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
			// IndexedDB has no size without its value. Ask only for the requested keys, through
			// the existing two-read budget, and release each batch's values before the next. A
			// whole-table stat would also clone unrelated audio and history into this page.
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
		// The same physical read can serve exact text and the search owner's byte projection. The
		// byte store's `beforeStep` carries the read-fault witness seam, on every rung.
		await this.kind();
		// A failed byte read says nothing about the file's encoding: it stays the store's own fault,
		// outside the decoder's catch, or a transient notes.json read could reset its metadata.
		this.reads++;
		const bytes = await this.bytes.read(name); if (bytes == null) return null;
		if (raw) return bytes;
		// Strict, not lossy: `.text()` would quietly turn bytes that are not UTF-8 into question
		// marks and a save would then write those marks over the person's file. A refusal here
		// keeps the bytes exactly as they are; the caller decides what to say about one file.
		// A note or code file keeps a byte-order mark as the first character of its words (its bytes are the person's).
		const kept = globalThis.RapierNotesModel ? globalThis.RapierNotesModel.isNoteFile(name) : /\.md$/i.test(name);
		try { return new TextDecoder('utf-8', {fatal: true, ignoreBOM: kept}).decode(bytes); }
		catch (_) { throw Object.assign(new Error('this file is not UTF-8 text'), {name: 'EncodingError', code: 'unreadable'}); }
	},
	// Compare the bytes actually readable from the handle, in bounded chunks. A resolved close is
	// not evidence that those bytes match. Blob snapshots mutable input buffers at admission.
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
	// Temp-file-then-rename, with the bytes read back. The note on disk is never a half-written file,
	// and a close that RESOLVES is not evidence that the bytes are there: a provider can resolve a
	// close having written something else. A history object on OPFS comes through here (bodies,
	// recordings and the sidecar go through the folder owner's byte store, which reads back too), is
	// compared after its close and again after its publication, and is only then called written.
	//
	// `createWritable` does not truncate the destination at open: the standard stages writes and
	// commits them at close. The temp file is still right, for the reason above and because creating
	// a previously absent name can leave an empty real file.
	async commitFile(dir, name, value, {immutable = false} = {}) {
		if (typeof value === 'string' && !value.isWellFormed()) throw new Error('The note contains an unpaired character; replacing it would change your work');
		const data = value instanceof Blob ? value : new Blob([value]);
		if (immutable) {
			let existing;
			try { existing = await dir.getFileHandle(name); } catch (error) { if (!this.missing(error)) throw error; }
			// An existing name is not proof of its content. A read failure here is not absence.
			if (existing) { await this.verifyFile(existing, data); return false; }
		}
		const tmp = '.rapier-history-' + crypto.randomUUID() + '.tmp';
		const handle = await this.scratchFile(dir, tmp);
		let writer, staged = false;
		try {
			writer = await handle.createWritable(); await writer.write(data); await writer.close(); writer = null;
			await this.verifyFile(handle, data); staged = true;
			if (typeof handle.move === 'function') {
				await handle.move(name);
				await this.verifyFile(await dir.getFileHandle(name), data);
			} else {
				const target = await dir.getFileHandle(name, {create: true});
				writer = await target.createWritable(); await writer.write(data); await writer.close(); writer = null;
				await this.verifyFile(target, data);
				try { await dir.removeEntry(tmp); } catch (_) {}
			}
		} catch (error) {
			try { await writer?.abort(); } catch (_) {}
			// A verified staging copy survives an uncertain publication. Never call it saved, and
			// never delete the only known complete copy as part of failure cleanup.
			if (!staged) { try { await dir.removeEntry(tmp); } catch (_) {} }
			else {
				// A move may already have consumed the temp name. Name a recovery copy only after
				// finding and verifying that exact name; an uncertain move must not invent one.
				let retained = false;
				try { await this.verifyFile(await dir.getFileHandle(tmp), data); retained = true; } catch (_) {}
				if (retained) throw Object.assign(new Error(String(error?.message || error) + '. A verified temporary copy was kept as ' + tmp + '; keep this note open and retry saving.'), {name: error?.name || 'Error', cause: error, retainedCopy: tmp});
			}
			throw error;
		}
		return true; // The name was published here, not an existing immutable object.
	},
	// A note's words into the folder, through the owner: a note the index knows is saved against the
	// words this window holds (a kept copy if another window wrote first); a name it does not know is
	// a new note under that name. The harness's door and the recorder's; the shell's own paths call
	// _rapierNotesSave and _rapierNotesWriteNew directly.
	async write(name, text) {
		await this.kind();
		if (_rapierNotes.index?.notes?.[name]) { await _rapierNotesSave(name, text); return; }
		_rapierNotesTake(await this.folder.create(text, name));
	},
	// Thumbnails: derived pictures for the cards, kept beside the notes in `thumbs/` (a sub-folder of
	// the notes folder, or a name prefix in the byte store). Never listed as notes; included in a
	// folder backup. Sync carries audio/ and attachments/ only; cards derive these pictures again
	// from the received note instead of transferring a second copy.
	async thumbDir(create) { const dir = await _rapierNotesDir(); return dir.getDirectoryHandle('thumbs', { create: !!create }); },
	async thumbNames() { await this.kind(); return this.bytes.list('thumbs'); },
	async readThumb(name) {
		if (await this.port()) return this.portFile('thumbs/' + name);
		try { return await (await (await this.thumbDir(false)).getFileHandle(name)).getFile(); } catch (error) { if (this.missing(error)) return null; throw error; }
	},
	writeThumb(name, blob) {
		return this.queue('thumbs/' + name, async () => {
			await this.kind();
			// Derived cache has no sidecar transaction, but still obeys the folder's writer admission.
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
		// Pass the original File. The folder admits the durable byte port under its lease,
		// and publishes metadata only after the streamed file's read-back has agreed.
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
	// Saved files' two kinds, from one pass over the notes and their retained past; a recording's own
	// review and delete forever (the folder owner's, notes/folder.mjs deleteRecording).
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
			// A recording staged by this page may now be referenced by another window's note.
			_rapierNotesTake(await this.folder.discardAudio(name));
		});
	},
	// The recorder shell must await append before acknowledging a chunk, and await finish before
	// linking the returned entry. A receipt remains until acknowledgeRecording verifies that ordinary
	// Markdown link. Native/memory rungs without append custody refuse at begin.
	async beginRecording(noteFile, mime) { await this.kind(); return this.folder.beginRecording(noteFile, mime); },
	async recoverRecordings() { await this.kind(); return this.folder.recoverRecordings(); },
	async openRecording(offer) { await this.kind(); return this.folder.openRecording(offer); },
	async readRecording(offer) { await this.kind(); return this.folder.readRecording(offer); },
	async acknowledgeRecording(entry, assignedNote = null) { await this.kind(); return this.folder.acknowledgeRecording(entry, assignedNote); },
	// The folder owner reserves and writes together across windows, not merely this page's queue.
	async createAudio(noteFile, mime, blob, wanted = '', options = {}) {
		await this.kind();
		const snapshot = await this.folder.createAudio(noteFile, mime, new Uint8Array(await blob.arrayBuffer()), wanted, options);
		_rapierNotesTake(snapshot);
		return snapshot.name;
	},
	// History has several immutable writes and one mutable publication. Hold the SAME
	// folder lease through the complete read/plan/publish (and any reviewed reclamation).
	// Its existing queue also makes settle wait for the whole job, not just its last file.
	historyCommit(job) {
		return this.queue('history transaction', async () => {
			await this.kind();
			// The lease alone serialises the publication; no folder read (a listing of every note)
			// is needed for objects that live beside the notes.
			const lease = await this.folder.owner.acquire(this.folder.scope);
			try { return await job(); }
			finally { await lease.release(); }
		});
	},
	// One file out of the byte port, for every rung the port owns. `lastModified: 0` because there
	// is no file system stamp here to tell the truth with, and an invented one is a lie the stamp
	// cache would believe.
	async portFile(name) { const bytes = await this.bytes.read(name); return bytes == null ? null : new File([bytes], name.split('/').pop(), {lastModified: 0}); },
	async file(name) { if (await this.port()) { const file = await this.portFile(name); if (!file) throw Object.assign(new Error('no such note'), {name: 'NotFoundError'}); return file; } const dir = await _rapierNotesDir(); return (await dir.getFileHandle(name)).getFile(); },
	async backupFile(path, {stream = false} = {}) {
		if (typeof path !== 'string' || !path || /[\\\0]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('backup path is not relative');
		// The port is asked FIRST: `native` is only known once the store has been chosen, and a cold
		// first call here used to decide the streaming branch before anything had asked.
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
	// ---- The note's own past (notes/history.mjs) ------------------------------------------------
	// Three kinds of file under one folder beside the notes: a manifest per note identity, a text
	// recipe per version, and the blobs a recipe names. A recipe and a blob are written once and
	// never replaced. A repeat verifies the bytes; an existing name alone is not completion proof.
	// A manifest is the only mutable one, and it goes through the note's own queue like every other
	// write in this file.
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
	// An immutable write answers true for a new object, false for an existing verified one.
	// Under the folder lease this is creation evidence, without a separate absence read.
	writeHistory(path, bytes, {immutable = false} = {}) {
		bytes = globalThis.RapierNotesIntegrity.exactBytes(bytes);
		const key = this.historyKey(path), [sub, name] = String(path).split('/');
		return this.queue(key, async () => {
			if (globalThis.__rapierNotesRefuseWrites) throw new Error('the notes folder refused the write');
			if (typeof globalThis.__rapierNotesHoldWrite === 'function') await globalThis.__rapierNotesHoldWrite(key, bytes);
			// An existing immutable object must match exactly on every rung, so history can never sit in a
			// page-memory Map without reaching the durable store.
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
			// Same owner as the write above: a Tidy pruning a retained event must drop it from the
			// durable store too, or a reload would bring back an object Tidy already reclaimed.
			if (await this.port()) { await this.bytes.remove(key); return; }
			try { await (await this.historyDir(false, sub)).removeEntry(name); }
			catch (error) { if (!this.missing(error)) throw error; }
		});
	},
	async historyNames(sub) {
		if (!/^(?:manifests|texts|blobs)$/.test(String(sub || ''))) throw new Error('this is not a part of the note history');
		await this.kind();
		// A dot name is a write that did not finish (see `writeHistory`), never a part of anyone's past:
		// listing one would make `readHistory` refuse the path and take the whole inventory, backup or
		// storage figure down with it.
		return (await this.bytes.list('history/' + sub)).filter(n => !n.startsWith('.'));
	}
};
async function _rapierNotesWriteIndex(wanted = _rapierNotes.index, base = _rapierNotes.indexBase) {
	// The one chokepoint for the sidecar: what this window changed since it last read or committed
	// (`indexBase` → `index`) is rebased onto the folder's current index inside the owner's
	// transaction (notes/folder.mjs applyMetadata), so a pin set here and a note captured in another
	// window both survive. Identities are the owner's to give. On success both point at the result.
	const store = _rapierNotesStore;
	await store.kind();
	_rapierNotesTake(await store.folder.metadata(base, wanted));
}
function _rapierNotesCopyIndex(index) { return JSON.parse(JSON.stringify(index)); }
// Every transaction's result is the folder's index now: both pictures point at it.
function _rapierNotesTake(snapshot) {
	const state = _rapierNotes;
	state.indexBase = snapshot.index; state.index = _rapierNotesCopyIndex(snapshot.index);
	_rapierNotesRemindSync();
	if (typeof _rapierNotesSyncUi !== 'undefined') _rapierNotesSyncUi.changed();
	// Persistence is asked for after the first write is in the folder: a browser asked with a real
	// write behind the question answers it better.
	_rapierNotesAskPersistenceOnce();
	return snapshot;
}
// Persistent storage is asked for once per folder, never once per session: the preference owner remembers the ask (a
// browser profile is the folder on the web), and a later session opens straight onto the cards. The quiet line under
// the head says what the storage is for as long as it matters.
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
// A note's words into the folder through the owner: the digest of the words this window last read
// or wrote is what the owner admits the write against, so a competing edit from another window is
// never written over -- it becomes the kept conflict copy (`copied`), and the caller says so.
async function _rapierNotesSave(file, text) {
	const state = _rapierNotes, store = _rapierNotesStore, H = globalThis.RapierNotesIntegrity;
	// The editor edits the bytes it opened, not the library's most recent refresh. Keep only
	// that admission token (identity + digest); the folder/card text cache stays independent.
	const proof = state.current === file ? state.currentProof : null;
	const id = proof?.id || state.index.notes[file]?.id;
	let before = state.texts.get(file);
	await store.kind();
	if (!proof && before == null) before = await store.read(file);
	const expectedDigest = [proof ? proof.digest : before == null ? null : await H.sha256(before)];
	// A refused save may have left a journal which recovery will finish on the next attempt.
	if (state.attempted.has(file)) expectedDigest.push(state.attempted.get(file));
	let snapshot;
	try { snapshot = await store.folder.save({file, id, expectedDigest, text}); }
	catch (error) { state.attempted.set(file, await H.sha256(text)); throw error; }
	state.attempted.delete(file);
	if (state.current === file && state.currentProof === proof) state.currentProof = {file: snapshot.file, id: snapshot.id ?? state.index?.notes?.[snapshot.file]?.id, digest: snapshot.digest || await H.sha256(text)};
	return _rapierNotesTake(snapshot);
}
// Another window committed to this folder (the owner's commit notice): this window's picture of the
// folder is read again -- names, sizes and the index; the words already held stay held, the open
// note is read again for its card, without rebasing the editor's admission token.
async function _rapierNotesFolderChanged() {
	const state = _rapierNotes;
	if (state.reloading) return state.reloading;
	state.reloading = (async () => { try { await _rapierNotesLoad(); if (state.open) _rapierNotesRender(); _rapierNotesIndexingBegin(); } catch (error) { console.warn('[rapier] notes: the folder changed and could not be read again', error); } finally { state.reloading = null; } })();
	return state.reloading;
}
// Persistence is asked for once, and the answer is shown plainly in the notes information pop-up: a
// person should know whether the browser may evict their notes. The browser that grants it says so;
// one that declines is not argued with, only reported.
// The sentence lives on state, not only in the DOM: the pop-up (editor/info.js) reads it the
// instant it opens, from whatever was last learned, even if that was long before this sheet
// existed.
async function _rapierNotesStorageKind() {
	const store = _rapierNotesStore;
	try { await store.kind(); await store.bytes.prepare(); }
	catch (_) { return 'fault'; }
	if (store.storageFault || store.bytes.kind === 'fault') return 'fault';
	return store.native ? 'native' : store.bytes.kind || (store.durable ? 'opfs' : 'memory');
}
// What the storage is, in one sentence: the quiet line under the head, and the first sentence of the settings' own.
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
// The two places the storage answer is written: the settings panel's sentence (whole: space, backups), and the quiet
// line under the cards' head, which says what the storage is until a backup exists and never for the app's own folder.
function _rapierNotesStorageLines() {
	const state = _rapierNotes, kind = state.storageKnown;
	const note = document.getElementById('notes-storage-note');
	if (note) { note.textContent = _rapierNotesStorageSentence(); note.dataset.notesStorage = kind; }
	const line = document.getElementById('notes-storage-line');
	if (!line) return;
	const quiet = !kind || kind === 'native' || !!state.lastBackup;
	line.hidden = quiet;
	line.textContent = quiet ? '' : _rapierNotesStorageKindSentence();
	line.dataset.notesStorage = kind || '';
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
	return sentence + (kind === 'native' ? ' Clearing app data, uninstalling or losing this device can delete them.' : ['memory', 'fault'].includes(kind) || kind == null ? '' : ' Clearing browser data or losing this device can delete them.')
		+ (space.length ? ' Space: ' + space.join(', ') + '.' : '') + pending
		+ (backup ? ' Last backup: ' + action + (backup.parts ? ', ' + backup.parts + (backup.parts === 1 ? ' part' : ' parts') + ', ' + _rapierNotesBytesWords(backup.bytes) : '') + (backup.omitted?.length ? '; missing: ' + backup.omitted.map(row => row.name).join(', ') : '') + ', ' + new Date(backup.stamp).toLocaleString('en') + '. Check every file arrived.' : ' Keep a backup elsewhere.');
}
async function _rapierNotesStorageAnswer(ask = false, {measure = true} = {}) {
	// OPFS absence is not an admission of IndexedDB: ask the byte store before promising
	// persistence. A refused store stays a fault, never page-only memory or a confirmed save.
	let admissionFault = null;
	try { await _rapierNotesStore.kind(); if (await _rapierNotesStore.bytes?.prepare() === false) throw new Error(_rapierNotesStore.bytes.reason || 'the notes store refused writes'); }
	catch (error) { admissionFault = error; }
	// First-open copy needs admission alone; it must not walk an entire library to say where it lives.
	if (measure) {
		// What the recordings weigh is read from the files themselves, never remembered as a running
		// total: a folder the person edited from outside would make a remembered number a lie.
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

		// And what the past weighs, read the same way -- from the manifests themselves, never remembered as
		// a running total, because a folder edited from outside would make a remembered number a lie. This
		// reads every manifest.
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
	// Best-effort: the pop-up may be closed right now, in which case there is nothing to write yet.
	_rapierNotesStorageLines();
}
// The folder is the truth: list it, read the sidecar, reconcile, then read every note's bytes.
// Atomic: everything is read into locals and published to the state only once every read has
// succeeded, so a fault half way never leaves half-new cards on screen (a fault is thrown and said
// by the caller). The sidecar fails closed (notes/model.mjs parseIndex): bytes that cannot be read
// are kept aside under a dated name and the index rebuilt from the files, said once; a sidecar
// written by a NEWER Rapier refuses to open at all rather than be silently downgraded.
// The index's memory. Absent in the document profile, absent where there is no IndexedDB, and
// absent in memory mode -- each of which simply means every note is read.
//
// SCOPE is the folder's identity, not a display name: two different folders with equal filenames
// and stamps must never share rows. There is exactly one notes folder per KIND per origin -- the
// origin private file system's own directory on the web, the app's private folder on Android (a
// person-selected folder is not bound) -- and IndexedDB is already origin-scoped, so the kind IS
// the folder here. If that ever stops being true, this is the line that has to change.
async function _rapierNotesOpenSearchCache() {
	const C = globalThis.RapierNotesSearchCache;
	if (!C || typeof C.openSearchCache !== 'function') return null;
	const store = _rapierNotesStore;
	let kind = null;
	try { kind = await store.kind(); } catch (_) { return null; }
	// Memory mode has nothing durable to be a memory OF, and its stamps carry no modified time, so
	// every row would be refused anyway. Do not open a database for it.
	if (!kind) return null;
	try { return await C.openSearchCache({scope: 'notes:' + String(kind)}); }
	catch (_) { return null; }
}
async function _rapierNotesLoad() {
	const state = _rapierNotes, M = _rapierNotesModel(), store = _rapierNotesStore;
	// Every entry point shares this request identity, and each await below checks it: a load that
	// started earlier must never publish its folder, its cache plan or its coverage over a newer
	// one's. This is NOT the body reader's generation -- that counts reads, this owns the whole load.
	// The failure it prevents is silent and permanent: an old plan installed over newer text, so a
	// search misses words that are on the disk.
	const request = state.loadRequest = {};
	if (!state.persistReported) { state.persistReported = true; void _rapierNotesStorageAnswer(false); }
	await store.kind();
	// The folder is read through its owner (notes/folder.mjs): an unfinished transaction is repaired
	// first, the index reconciled with the files, every note given its identity, and this window's
	// picture of the folder is exactly what the owner would admit a write against.
	let snapshot, damaged = null;
	const read = async () => { try { return await store.folder.read({syncState: true}); }
		catch (error) {
			if (error?.code === 'newer') throw new Error('This notes folder was written by a newer Rapier (index version ' + error.version + '). Open it with that Rapier, so nothing in it is lost.');
			throw error;
		} };
	try { snapshot = await read(); }
	catch (error) {
		if (error?.code !== 'corrupt') throw error;
		// The sidecar fails closed (notes/model.mjs parseIndex): bytes that cannot be read are kept
		// aside under a dated name, said once, and the owner rebuilds the index from the notes.
		const backup = 'notes.damaged-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
		snapshot = await store.folder.rebuildIndex(backup, {syncState: true});
		damaged = snapshot.damaged;
	}
	const syncState = snapshot.syncState ?? null;
	const index = snapshot.index, files = snapshot.files;
	// The recordings the folder kept when a page went away, read here, shown by the recorder
	// (notes/recorder.js _rapierRecorderOfferRecovery) once the cards are up. Reading is not
	// offering.
	state.recordingOffers = Array.isArray(snapshot.recordings) ? snapshot.recordings : [];
	// Recovery kept an interrupted save's words beside a file that changed under it: said once.
	for (const row of snapshot.kept || []) showToast('An interrupted save of ' + row.file + ' met a changed file. Your words were kept as ' + row.name + '.', 'info');
	const dropped = Object.keys(index.missingFiles || {}).filter(file => !(state.indexBase?.missingFiles || {})[file]);
	// The first cards wait for the folder's names and sizes, not for every note's bytes. A note's
	// text is read when a card, an index or an action needs it (_rapierNotesTexts; the window's reads
	// go through notes/library-reads.mjs), and the rest of the folder is read behind the first cards
	// (_rapierNotesReadRest) for the indexes that need every note. `state.texts` holds only what has
	// been read: a note not in it is unread, never empty.
	// Cards reread the actual folder. The open editor retains its original id/digest in currentProof:
	// a refresh is not permission to overwrite someone else's newer words.
	// One walk, both answers: the sizes the bounded reader needs and the stamps the index's memory
	// needs. No extra I/O -- the modified time was already on the File this opens to ask its size.
	// The observation clock is taken BEFORE the stamps it will judge, never after and never at the
	// moment a row is written. A clock read later could certify bytes whose millisecond was still
	// live when they were projected.
	const stampsAt = Date.now();
	const stamps = await store.stamps(Object.keys(index.notes));
	if (state.loadRequest !== request) return;
	const sizes = new Map([...stamps].map(([name, row]) => [name, row.size]));
	// This window's picture of the folder is now the folder's. Everything above could throw; only
	// getting here means what this window would write is founded on what is actually there.
	state.syncState = syncState; state.indexBase = index; state.index = _rapierNotesCopyIndex(index); state.texts = new Map(); state.titles = new Map(); state.hold = new Set(); state.sizes = sizes; state.readFailed = new Map(); state.unreadable = new Set(); state.loadGen++; store.stale = false;
	state.lastBackup = index.lastBackup || null;
	_rapierNotesStorageLines();
	state.stamps = stamps; state.stampsAt = stampsAt; state.readBracket = new Map();
	_rapierNotesReadsReset();
	// The index's memory, before either index is begun: what did not change since last time does not
	// need its body read at all. The plan is the folder's own answer -- a projection is reused only
	// where size AND modified time both match what was stored beside it, so this can never make a
	// search miss a note; its worst case is the whole folder re-read, which is what Rapier did
	// before it had a memory. A cache that cannot open, or refuses, simply plans nothing.
	state.cachePlan = null;
	// The old cache is closed before a new one opens, and the new one is published only if this load
	// still owns the state -- otherwise it is closed rather than leaked or installed late.
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
	// A warm note's card title returns with its cached projections, before any card is drawn, so a title
	// order holds from the first render; the indexes themselves begin behind the first cards.
	for (const row of state.cachePlan?.reuse || []) if (typeof row.projection?.title === 'string') state.titles.set(row.file, row.projection.title);
	if (state.current && index.notes[state.current]) await _rapierNotesTexts([state.current]);
	if (state.loadRequest !== request) return;
	// The indexes' begin (the cache's hydrate, then the idle slices) and the rest of the folder's reads
	// come AFTER the first cards: begun earlier, on a warm 5,000-note folder the slices stand between the
	// opener and its surface for seconds on a phone's CPU. The opener fires this once the surface is up and
	// drawn; every other load fires it at once (_rapierNotesIndexingBegin). A load that was overtaken never
	// fires: the newer load's own closure stands in its place.
	state.indexing = async () => {
		if (state.loadRequest !== request) return;
		state.indexing = null;
		// Deferred cache candidates are not yet coverage; an early search must stay partial.
		state.reading = {total: state.sizes.size, done: 0, complete: false};
		if (typeof _rapierNotesLibraryBegin === 'function' && await _rapierNotesLibraryBegin() === false) return;
		if (state.loadRequest !== request) return;
		return _rapierNotesReadRest();
	};
	// Title order is the one order that needs every note's words before the first card.
	// Said, never silent (keep-references.md, the data-loss class): an entry whose file is gone is
	// dropped because the folder is the truth, and the person hears that it happened.
	if (damaged) showToast('Rapier couldn’t read its list of your notes, so it made a new one from the notes; pins, colours, sections and order start over. The unreadable copy is kept in the notes folder as ' + damaged + '.', 'error');
	if (dropped.length) showToast(dropped.length === 1 ? 'One note on Rapier’s list is not in the notes folder, so it was taken off the list.' : dropped.length + ' notes on Rapier’s list are not in the notes folder, so they were taken off the list.', 'info');
}

function _rapierNotesIndexingBegin() { const begin = _rapierNotes.indexing; if (begin) return begin(); }
// Large folders yield derivation and background reads to the same live input boundary. Touch
// lifetime is separate from pointercancel: native scrolling cancels the pointer before release.
function _rapierNotesBackgroundBlocked() {
	const state = _rapierNotes;
	return state.sizes.size > 200 && (state.backgroundTouches.size > 0 || state.backgroundInput || state.backgroundComposing ||
		!!navigator.scheduling?.isInputPending?.({includeContinuous: true}));
}
// ---- The reads ----------------------------------------------------------------------------------
// notes/library-reads.mjs schedules the reads of the cards about to be drawn: two at a time, bytes
// reserved, a window that moved on no longer waited for, a note over the preview bound left unread
// and drawn as its name. Every other consumer that needs a note's text asks for it here and waits
// for the bytes. Nothing reads a missing entry as '': a note the folder holds and this window has
// not read is unread, and its card says so.
function _rapierNotesReadsModel() { return globalThis.RapierNotesLibraryReads; }
function _rapierNotesReadsReset() {
	const C = _rapierNotesReadsModel();
	for (const w of _rapierNotes.reads?.waiters || []) w.resolve();
	_rapierNotes.reads = {model: C.createCardReads(), read: C.createLibraryReadPass(_rapierNotesReadFile), waiters: [], deriving: new Set()};
}
// The memory step: a note's words are held while something reads them -- the card on screen, the
// open note, the selection, an action that asked (`hold`) -- and once both indexes have taken them
// the rest are let go; a card scrolled to later reads them again through library-reads.mjs. `titles`
// keeps every title, so a title order, a reminder, the picker and the sheet's name never need the
// words back. The folder is the truth; the words are always there.
function _rapierNotesHold(file, text) { const state = _rapierNotes; state.texts.set(file, text); state.titles.set(file, _rapierNotesModel().projectCard(file, text).title || ''); }
function _rapierNotesTitle(file) { const state = _rapierNotes, kept = state.titles.get(file); return kept ?? (state.texts.has(file) ? (_rapierNotesModel().projectCard(file, state.texts.get(file)).title || '') : ''); }
function _rapierNotesLetGo(file) {
	const state = _rapierNotes;
	if (file === state.current || state.selected.has(file) || state.hold.has(file) || !state.texts.has(file)) return;
	if (typeof _rapierNotesLibraryTaken !== 'function' || !_rapierNotesLibraryTaken(file)) return;
	// A batch the window is deriving holds its words from the plan to the card: a text that was
	// already here at the plan is not among the reads the fill waits on, and a slice could otherwise
	// take it during that wait and the card come out unread.
	if (state.reads && state.reads.deriving.has(file)) return;
	if (state.surface && state.surface.querySelector('[data-notes-file="' + CSS.escape(file) + '"]')) return;
	state.texts.delete(file);
}
// Publish a successful read alike, without changing the caller's scheduling or failure policy.
function _rapierNotesReadHeld(file, text) {
	_rapierNotesHold(file, text); _rapierNotes.readFailed.delete(file);
	if (typeof _rapierNotesLibraryRead === 'function') _rapierNotesLibraryRead(file);
}
// Exact consumers publish original source. Background indexing consumes a transient byte-derived
// input through the same pending operation; that input never enters exact held text or actions.
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
		// The bracket's far side, taken the moment the bytes are back. Its near side is the load's
		// own stamp walk, which happened before any read at all, so the pair genuinely brackets this
		// read -- and the only extra work is one stat for a note actually read, none at all for a
		// note the memory already held. If the two disagree the file moved under us and no row is
		// earned; that is the cache declining, not an error, and the note is simply read as ever.
		let bracket = null;
		if (state.readBracket && state.stamps?.has(file)) {
			try {
				const after = (await _rapierNotesStore.stamps([file])).get(file);
				if (after) bracket = {before: state.stamps.get(file), after, observedAt: state.stampsAt};
			} catch (_) { bracket = null; }
		}
		// A read is useful only to the generation, revision and held source that asked for it.
		if (!live()) return;
		if (bracket && state.readBracket) state.readBracket.set(file, bracket);
		// Listed, then gone: unread and said, never a blank in its place (the folder is the truth).
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
					// The source stays in the existing pending queue. Large UTF-8 decode, image-byte
					// projection, card title and both indexes run in its generation's worker.
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
// Every file named is read when this resolves, or unreadable, or failed and said.
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
// The rest of the folder, in its order, one note at a time behind whatever the cards ask for: the
// search and link indexes, a title order and a rename need every note, and say so until they have it.
function _rapierNotesReadRest() {
	const state = _rapierNotes, gen = state.loadGen, all = Object.keys(state.index?.notes || {});
	// A note both indexes already hold, from a row the folder's own stamp vouched for, does not need
	// its body read at all. `reread` is what the plan says is genuinely unknown -- everything the
	// cache missed, everything that moved, and everything on a page with no cache, which is all of
	// them. Coverage stays whole-folder honest: `total` is still every note, and the hydrated ones
	// are counted as done because they ARE done.
	const plan = state.cachePlan;
	// The sidecar may have changed during hydration: removed names leave the queue and new
	// names join it. The plan retains only admitted names, never decoded projections.
	const files = plan ? all.filter(file => !plan.ready?.has(file)) : all, hydrated = all.length - files.length;
	state.cachePlan = null;
	const reading = state.reading = {total: all.length, done: hydrated, complete: false};
	// Four reads in flight: a note's read is five awaits of the folder's own latency, and one at a
	// time that latency was the wall on five thousand notes (33 a second under the 4x throttle, the
	// indexes idle behind it). The words still arrive one at a time on the one thread.
	let at = 0;
	const lane = async () => {
		while (at < files.length) {
			const file = files[at++];
			if (state.loadGen !== gen) return;
			// The slices take the words in idle time; the read waits for them rather than running ahead.
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
		// The text-in-pictures plug-in reads the folder's pictures once the folder is read (notes/ocr.js).
		if (typeof _rapierOcrWalkAll === 'function') _rapierOcrWalkAll();
		if (state.open && state.query) _rapierNotesRender();
	})();
	return reading.promise;
}
// The cards about to be drawn: their texts through the model, and a promise for when they are here.
// Every open section fills at once -- Pinned's cards and Other's on the same open -- so the read
// window is what all the waiting fills still want, the earliest first, as far as the model's bound.
// It used to be the latest batch alone, releasing the others: Pinned's cards came up as their names
// over "not read yet" whenever Other had cards too. A fill whose window was replaced meanwhile finds
// that when its wait ends and draws nothing.
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
		// The card's read is the one shared read pass (its bytes held, said or marked by
		// _rapierNotesReadFile itself), and a pump of an older reads generation is left alone.
		_rapierNotesReadOne(ticket.key).then(text => {
			reads.model = C.finishCardRead(reads.model, ticket.ticket, typeof text === 'string' ? {revision: ticket.revision, bytes: ticket.bytes, text} : {error: 'unread'}).state;
		}).then(() => { if (state.reads === reads) { _rapierNotesReadsSettle(); _rapierNotesReadsPump(); } });
	}
	_rapierNotesReadsSettle();
}
function _rapierNotesReadsSettle() {
	const reads = _rapierNotes.reads; if (!reads) return;
	reads.waiters = reads.waiters.filter(w => { if (w.files.every(_rapierNotesReadsSettled)) { w.resolve(); return false; } return true; });
	// Fills past the window's bound come in as it empties: a window with room and a waiter outside it
	// is drawn again (a full window is not, so this never goes round).
	const open = reads.model.wanted.filter(row => !_rapierNotesReadsSettled(row.key)), inWindow = new Set(open.map(row => row.key));
	if (open.length < reads.model.limits.maxWindowEntries && reads.waiters.some(w => w.files.some(f => !inWindow.has(f) && !_rapierNotesReadsSettled(f)))) _rapierNotesReadsWindow();
}
function _rapierNotesBytesWords(n) { return n >= 1048576 ? (n / 1000000).toLocaleString('en', {maximumSignificantDigits: 4}) + ' MB' : (n / 1000).toLocaleString('en', {maximumSignificantDigits: 4}) + ' kB'; }

// ---- The surface -------------------------------------------------------------------------------
function _rapierNotesEl(tag, className, text) {
	const el = document.createElement(tag);
	if (className) el.className = className;
	if (text != null) el.textContent = text;
	return el;
}
function _rapierNotesIcon(...ds) {
	// A glyph's NAME is read from its one source (_rapierNotesGlyph, below); path data is drawn as given.
	if (ds.length === 1 && typeof ds[0] === 'string' && (Object.hasOwn(RAPIER_NOTES_EDITOR_GLYPHS, ds[0]) || Object.hasOwn(RAPIER_NOTES_TABLE_GLYPHS, ds[0]) || Object.hasOwn(RAPIER_NOTES_ICONS, ds[0]))) return _rapierNotesGlyph(ds[0]);
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
	for (const d of ds.flat()) { const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', d); svg.appendChild(path); }
	return svg;
}
// One glyph, one definition: identical icons have one copy of the SVG, so they cannot drift. A glyph
// the editor draws is the editor's own element in editor/ui.html, cloned here when Notes paints it: a
// clone writes no geometry of its own, so there is nothing to drift, and Notes' stylesheet gives it the
// place's size and ink (the source's id, class and size attributes are its button's, not the glyph's).
// A glyph only Notes draws is written once, in RAPIER_NOTES_ICONS. tools/check-icon-copies.mjs refuses
// a second copy of any geometry anywhere in the shipped sources.
const RAPIER_NOTES_EDITOR_GLYPHS = {
	kebab: 'btn-overflow', search: 'btn-find', history: 'btn-undo', close: 'btn-embed-close',
	back: 'btn-notes-back', pin: 'btn-notes-pin', bell: 'btn-notes-remind', plus: 'btn-notes-plus', 'chevron-left': 'settings-open-chevron',
};
// A glyph the editor writes only in its command table (editor/engine.js _RAPIER_COMMAND_ICONS -- the
// tick box, the picture, the chevron) is built from that one string element by element: read, never
// handed to the page as markup, and never copied.
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
// Notes' own controls in the editor's markup that draw what the editor already draws (editor/ui.html's
// RAPIER_NOTES blocks: the note's kebab beside the editor's, the import sheet's close beside the
// navigator's) carry no glyph of their own there; each takes its source's svg, as that source wears it.
const RAPIER_NOTES_MARKUP_GLYPHS = [['btn-notes-kebab', 'btn-overflow'], ['[data-action="notes-import-close"]', 'navigator-close']];
function _rapierNotesMarkupGlyphs() {
	for (const [target, source] of RAPIER_NOTES_MARKUP_GLYPHS) {
		const el = target.startsWith('[') ? document.querySelector(target) : document.getElementById(target), svg = document.getElementById(source)?.querySelector('svg');
		if (el && svg && !el.querySelector('svg')) el.appendChild(svg.cloneNode(true));
	}
}
// The kebab and the search are not copied at all: they are the editor's #btn-overflow and #btn-find
// themselves (_rapierNotesGlyph), so their dots and strokes match the main view's exactly.
// Every row of a sheet is a button, all caps in Geist Mono, with its icon at the LEFT -- Feather first
// (https://feathericons.com), Tabler where Feather has nothing suitable, bespoke otherwise. Every glyph
// below is Feather's own, at Feather's own 24x24 with its own geometry; a circle or a rect Feather draws
// as an element is written here as the same outline in path form, because one helper draws them all and
// nothing is redesigned. The colour act's glyph is Tabler's palette (Feather has no palette), the wells
// as paths for the same reason.
// Only the glyphs the editor does not draw are here: the search, the close, the back arrow, the undo
// (history), the tick box and the picture are the editor's own (_rapierNotesGlyph), and Draw's trash and
// copy are these (draw/draw.js reads them).
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
// A row's icon is a property of the ACT, so the same act wears the same glyph wherever it is shown
// -- the note's own sheet and the cards' selection sheet included. A name is a glyph read from its one
// source; an array is Notes' own geometry.
const RAPIER_NOTES_ROW_ICONS = {
	'trash': RAPIER_NOTES_ICONS.trash, 'delete-forever': RAPIER_NOTES_ICONS.trash, 'copy': RAPIER_NOTES_ICONS.copy,
	// OPEN AS DOCUMENT wears a document's own glyph; SHARE keeps the glyph Send wore.
	'open-document': RAPIER_NOTES_ICONS.page, 'share': RAPIER_NOTES_ICONS.send,
	'section-face': RAPIER_NOTES_ICONS.folder, 'colour': RAPIER_NOTES_ICONS.palette,
	'find-note': 'search', 'archive': RAPIER_NOTES_ICONS.archive, 'restore': 'history',
	'connections': RAPIER_NOTES_ICONS.link, 'tags-face': RAPIER_NOTES_ICONS.tag, 'history-face': 'history',
	'boxes': 'tick'
};
// The four doors of the main surface's plus and the five rows of a note's own plus: one kind, one
// glyph, wherever the kind is offered.
const RAPIER_NOTES_ADD_ICONS = {
	note: RAPIER_NOTES_ICONS.page, drawing: RAPIER_NOTES_ICONS.pen, picture: 'image',
	photo: RAPIER_NOTES_ICONS.camera, recording: RAPIER_NOTES_ICONS.mic, attachment: RAPIER_NOTES_ICONS.link, files: RAPIER_NOTES_ICONS.link
};
// The built-in sections and their words; the person's own sections sit between Pinned and Other,
// in their order, and every section is collapsible, Skills closed by default, the rest open, the
// choice remembered in the sidecar (`index.collapsed`, `index.sections[].collapsed`).
// Trash is NOT a section of the cards: deleting a note grows no Trash heading and no notice on the
// main screen. Its notes live in the Recycle Bin, reached from the last row of the notes settings
// panel, and the seven-day sentence lives there.
const RAPIER_NOTES_SECTIONS = [['skills', 'Skills'], ['pinned', 'Pinned'], ['others', 'Other'], ['archive', 'Archived']];
// Still a real bucket everywhere else -- the model, the sidecar, restore and expiry all know it.
const RAPIER_NOTES_BIN = 'trash';
const RAPIER_NOTES_SECTION_WORDS = Object.fromEntries(RAPIER_NOTES_SECTIONS);
function _rapierNotesBuildSurface() {
	const state = _rapierNotes;
	const surface = _rapierNotesEl('div', 'rapier-notes-surface');
	surface.id = 'rapier-notes-surface'; surface.hidden = true; surface.tabIndex = -1;
	_rapierNotesMarkupGlyphs();
	const spring = _rapierNotesSpring(); if (spring) { surface.style.setProperty('--notes-spring', spring); surface.style.setProperty('--notes-spring-ms', RAPIER_NOTES_SPRING_MS + 'ms'); }
	surface.setAttribute('role', 'dialog'); surface.setAttribute('aria-label', 'Notes'); surface.setAttribute('aria-modal', 'true');
	// The head: at the left a left-facing arrow and then the wordmark, `rapier notes` in lowercase
	// mono -- the screen is labelled, and the label is the way back: a tap on either closes Notes to
	// the main Rapier. Then the search and the kebab at the right. The phone's Back and Escape close
	// it too; the kebab's Editor row stays.
	const head = _rapierNotesEl('div', 'rapier-notes-head');
	const backBtn = _rapierNotesEl('button', 'rapier-notes-btn rapier-notes-back'); backBtn.type = 'button'; backBtn.dataset.notesAct = 'close'; backBtn.setAttribute('aria-label', 'back to the editor'); backBtn.appendChild(_rapierNotesGlyph('back'));
	// The top left is an arrow and one word, balanced by the buttons opposite. The name and version
	// live in the notes settings panel's header, where main Rapier puts its own.
	const mark = _rapierNotesEl('button', 'rapier-notes-wordmark', 'rapier notes');
	mark.type = 'button'; mark.dataset.notesAct = 'close'; mark.setAttribute('aria-label', 'rapier notes: back to the editor');
	const searchBtn = _rapierNotesEl('button', 'rapier-notes-btn'); searchBtn.type = 'button'; searchBtn.dataset.notesAct = 'search'; searchBtn.setAttribute('aria-label', 'search notes'); searchBtn.setAttribute('aria-expanded', 'false'); searchBtn.appendChild(_rapierNotesGlyph('search'));
	const menuBtn = _rapierNotesEl('button', 'rapier-notes-btn'); menuBtn.type = 'button'; menuBtn.dataset.notesAct = 'menu'; menuBtn.setAttribute('aria-label', 'notes settings'); menuBtn.setAttribute('aria-haspopup', 'dialog'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.appendChild(_rapierNotesGlyph('kebab'));
	// The plus sits in the EXACT CENTRE of the head: the screen's own midline, not "between the
	// wordmark and the search", so the control is taken out of the row's flow and placed on that line
	// (the stylesheet: left:50%, translateX(-50%)). It behaves exactly as the search icon does -- the
	// glyph inverts and a full-width bar opens joined under it -- and that bar carries the four doors
	// rather than a field.
	const addBtn = _rapierNotesEl('button', 'rapier-notes-btn rapier-notes-plus'); addBtn.type = 'button'; addBtn.dataset.notesAct = 'adds'; addBtn.setAttribute('aria-label', 'add a note'); addBtn.setAttribute('aria-expanded', 'false'); addBtn.appendChild(_rapierNotesGlyph('plus'));
	// The room between the wordmark and the search icon is a SPACER, not a stretched wordmark: a
	// press there does nothing at all. The plus is absolutely placed on the screen's midline and sits
	// over it.
	const headGap = _rapierNotesEl('div', 'rapier-notes-head__gap'); headGap.setAttribute('aria-hidden', 'true');
	head.append(backBtn, mark, headGap, addBtn, searchBtn, menuBtn);
	// The search, exactly as the main view's find bar: the pressed icon inverts into a box, and a
	// joined box opens under it. It OVERLAYS -- the notes stay where they are and the search appears
	// on top, as the document does in the main view -- so neither this nor the plus's own bar is a
	// flex child of the column any more; both are placed over the scroller.
	const find = _rapierNotesEl('div', 'find-bar rapier-notes-find'); find.setAttribute('role', 'search'); find.setAttribute('aria-label', 'search notes'); find.hidden = true;
	const search = _rapierNotesEl('input', 'find-input rapier-notes-search'); search.type = 'search'; search.placeholder = 'search…'; search.setAttribute('aria-label', 'Search notes'); search.autocomplete = 'off';
	find.appendChild(search);
	// The plus's own bar: the same box the find bar is, full width and joined to the inverted glyph
	// above it, carrying exactly four doors (NOTE, RECORD, IMAGE, DRAW) evenly split rather than a
	// field. A file is added to the note that is open, from the note's own sheet ("Add file"), where
	// it belongs to that note.
	const addsBar = _rapierNotesEl('div', 'find-bar rapier-notes-addsbar'); addsBar.id = 'rapier-notes-addsbar'; addsBar.hidden = true; addsBar.setAttribute('role', 'group'); addsBar.setAttribute('aria-label', 'add a note');
	for (const [kind, word] of [['note', 'Note'], ['recording', 'Record'], ['picture', 'Image'], ['drawing', 'Draw']]) {
		// Each door wears its kind's own glyph at the left of its word.
		const b = _rapierNotesEl('button', 'rapier-notes-add'); b.type = 'button'; b.dataset.notesAct = 'add'; b.dataset.notesAdd = kind;
		b.append(_rapierNotesIcon(RAPIER_NOTES_ADD_ICONS[kind]), document.createTextNode(word));
		addsBar.appendChild(b);
	}
	// The scroller: the sections, nothing above them (the capture bar is gone: the circle adds).
	const scroll = _rapierNotesEl('div', 'rapier-notes-scroll');
	for (const [id] of RAPIER_NOTES_SECTIONS) scroll.appendChild(_rapierNotesSectionEl(id));
	// The travel the overlaying bars need (see _rapierNotesBarRoom). Zero high until one is open, and
	// it carries nothing, so it is invisible to a reader and to the reorder drag alike.
	const scrollRoom = _rapierNotesEl('div', 'rapier-notes-scroll__room'); scrollRoom.setAttribute('aria-hidden', 'true');
	scroll.appendChild(scrollRoom);
	// The circle: the main view's fast-scroll indicator, and nothing else. The adding lives in the
	// nav bar's own plus; the circle is the plain accent disc `.scroll-fab` is, shown by scrolling
	// and hidden again on the same dwell the main one keeps (editor/engine.js `_rapierFabDwell`).
	const fab = _rapierNotesEl('button', 'rapier-notes-fab'); fab.type = 'button'; fab.dataset.notesAct = 'fab'; fab.setAttribute('aria-label', 'jump to a section, or fast scroll'); fab.setAttribute('aria-haspopup', 'dialog'); fab.setAttribute('aria-expanded', 'false');
	// The pop-up the circle and the kebab open: one panel, two faces (add + jump, and the menu).
	const popup = _rapierNotesEl('div', 'rapier-notes-popup'); popup.hidden = true; popup.setAttribute('aria-hidden', 'true');
	const sheet = _rapierNotesEl('div', 'rapier-notes-sheet'); sheet.inert = true; sheet.setAttribute('role', 'group'); sheet.setAttribute('aria-label', 'Note actions');
	const status = _rapierNotesEl('p', 'sr-only'); status.id = 'rapier-notes-status'; status.setAttribute('data-rapier-announcer', ''); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
	const help = _rapierNotesEl('p', 'sr-only', 'Enter opens this note. Space opens note actions.'); help.id = 'rapier-notes-card-help';
	const selected = _rapierNotesEl('p', 'sr-only', 'Selected.'); selected.id = 'rapier-notes-selected';
	// The kebab's own surface is the MAIN RAPIER SETTINGS PANEL, sliding in from the right. Every
	// class on it is the main panel's own, from editor/ui.html -- .settings-overlay/.settings-panel
	// and its header, .settings-section__title for the lowercase sans titles, .theme-switcher--joined
	// / .onoff-btn for the toggle boxes, .settings-action-btn for the individual buttons, and the
	// panel's own (i) control. Nothing about its look is written twice.
	const settings = _rapierNotesSettingsEl();
	// The fast-scroll toggle's jump panel: the main view's document navigator, by its own classes,
	// so it grows out of the circle and shrinks back into it (editor/engine.js _rapierUiCircleGrowth).
	const jump = _rapierNotesJumpEl();
	// The arrow's question: the same panel, grown out of the arrow (_rapierNotesAskOpen).
	const ask = _rapierNotesAskEl();
	const bin = _rapierNotesBinEl();
	// The quiet line under the head: what the storage is, until a backup exists (_rapierNotesStorageLines).
	const storageLine = _rapierNotesEl('p', 'rapier-notes-storage'); storageLine.id = 'notes-storage-line'; storageLine.hidden = true;
	surface.append(head, storageLine, find, addsBar, scroll, fab, popup, sheet, status, help, selected, jump, ask, settings, bin);
	document.body.appendChild(surface);
	state.surface = surface; state.scroll = scroll; state.scrollRoom = scrollRoom; state.sheet = sheet; state.find = find; state.search = search; state.fab = fab; state.popupEl = popup;
	state.addsBar = addsBar; state.settingsEl = settings; state.jumpEl = jump; state.askEl = ask; state.binEl = bin; state.binPicked = new Set();
	_rapierNotesBind(surface, search);
	_rapierNotesFabBind(fab, scroll);
	_rapierNotesSheetSwipe(sheet);
	return surface;
}

// ---- The kebab's settings panel ----------------------------------------------------------------
// Every class below is the main panel's own -- there is no notes-only look here, only notes-only
// CONTENT -- so the two panels cannot drift apart:
//   .settings-overlay / .settings-panel        the slide from the right and its scrim
//   .settings-panel__header / __title / body   the head and the scrolling body
//   .settings-section__title                   the lowercase Geist Sans title
//   .theme-switcher--joined .onoff-btn         the joined, evenly split toggle box
//   .settings-action-btn                       an individual button
//   .settings-info-btn + data-action=information  the (i) and its pop-up, the main panel's own
// The way back to the editor is the head's title and back arrow. Sort by has three orders (custom,
// created, modified), which lets the words sit at the panel's own button size.
const RAPIER_NOTES_SORT_ORDER = [['custom', 'Custom'], ['created', 'Created'], ['modified', 'Modified']];
function _rapierNotesSortMode() { return _rapierNotesPref('notesSort', 'custom'); }
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
// A title and its (i), the main panel's own row for exactly that pair (editor/ui.html, layout).
// The (i) is optional: a control that explains itself does not need a second control explaining it.
function _rapierNotesSettingsTitle(word, info) {
	const row = _rapierNotesEl('div', 'navigator-title-row');
	const title = _rapierNotesEl('div', 'settings-section__title', word);
	row.append(title);
	if (info) row.append(_rapierNotesInfoBtn(info));
	return row;
}
// The panel's first row is the main panel's own first row (.settings-stats-row): the colour-mode icon
// where it keeps its counts, the theme selector where it keeps its view toggle. The selector is the
// main panel's #switch-theme (editor/ui.html), cloned from the page each time the panel is painted,
// so its markup and its three glyphs have one source; a press on the copy is the engine's own
// delegated `data-action="switch"` (editor/engine.js _RAPIER_UI_ACTIONS, the theme flood included),
// so both panels apply a theme one way and can never disagree. The copy wears the preference through
// the engine's own renderSwitch whenever it is painted and whenever the preference changes, whichever
// panel or host changed it (_rapierNotesThemeMark, subscribed in _rapierNotesBind).
function _rapierNotesSettingsFirstRow() {
	const row = _rapierNotesEl('div', 'settings-stats-row rapier-notes-settings-first');
	row.appendChild(_rapierNotesColourModeBtn());
	const main = document.getElementById('switch-theme');
	if (main) {
		// Its own place in this row: no id (the main panel's is the one #switch-theme) and not the main
		// panel's full-width inline box; every button inside is the main panel's, attribute for attribute.
		const copy = main.cloneNode(true);
		copy.removeAttribute('id'); copy.removeAttribute('style'); copy.classList.add('rapier-notes-theme');
		row.appendChild(copy);
		_rapierNotesThemeMark(copy);
	}
	return row;
}
function _rapierNotesThemeMark(copy = _rapierNotes.settingsEl?.querySelector('.rapier-notes-theme')) {
	if (!copy || typeof renderSwitch !== 'function') return;
	try { renderSwitch(copy, RapierPreferences.read('theme')); } catch (_) {}
}
// The colour mode: how an open coloured note wears its colour -- the bar alone ('bar', the
// default) or the whole page ('page').
function _rapierNotesColourMode() { return _rapierNotesPref('notesColour', 'bar') === 'page' ? 'page' : 'bar'; }
// The icon: an upright outlined rectangle, white in dark mode and black in light mode, whose upper
// part is filled with the accent colour; a tap expands the fill to the whole rectangle and a second
// tap contracts it again. The palette glyph sits at its centre in the outline's colour. No label.
// The rectangle is a small svg drawn at the pixel size it is shown at; the fill is a box of its own
// under it, so its growth is a transform the compositor runs (rapier-notes.css
// .rapier-notes-colour-mode__fill); the palette is RAPIER_NOTES_ICONS.palette, the colour act's one
// glyph. The state is worn on the button in place, so a press moves the band.
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
// Pressed is the whole page: the fill has grown to the rectangle, and a reader hears "colour the whole
// page, pressed" (or not pressed: the bar alone).
function _rapierNotesColourModeWear(b) { b?.setAttribute('aria-pressed', String(_rapierNotesColourMode() === 'page')); }
// The sync box, directly under the first row: a box like the other buttons that offers Sync with Cloudflare
// and, when active, says in small mono capitals when the notes were last backed up. On the page and on the
// HTML file alike, online or not; in the Android app it is RAPIER SYNC, the app's own companion, never the
// website's sign-in. What the box may say is the sync's own state: it never says "backed up" unless a run
// finished with its bytes read back (notes/sync-session.mjs syncNow dates it).
function _rapierNotesSyncFacts() {
	const app = _rapierNotesIsApp();
	// A session open on this page is the truth (a vault just made, a run just finished, a key forgotten);
	// without one, the folder's sidecar as Notes last read it. The Cloudflare sign-in is held by the page
	// alone, so without a session only a kept bucket key is a connection. In the app the storage is Rapier
	// Sync's, so a vault joined through it is the connection.
	let live = null;
	try { live = typeof _rapierNotesSyncUi === 'object' ? _rapierNotesSyncUi.status() : null; } catch (_) {}
	const vault = _rapierNotes.syncState?.vault;
	// Another storage service (notes/sync-providers.mjs): its settings are kept like a bucket key where it has no sign-in, and
	// the page holds its sign-in as it holds Cloudflare's; the box then names the service instead of Cloudflare.
	const S = globalThis.RapierNotesSyncSession, other = live?.stage ? (live.mode === 'provider' ? live.provider : null) : vault?.mode === 'provider' ? vault.provider : null;
	const kept = live?.stage ? (live.mode === 'r2-key' || other && !S?.providerUsesSignIn(other)) : (vault?.mode === 'r2-key' || other && !S?.providerUsesSignIn(other));
	const connected = live?.stage ? (kept ? live.credentialStored === true : live.authorized === true)
		: app ? vault?.mode === 'companion' : kept && Array.isArray(vault.credential) && vault.credential.length > 0;
	const at = live?.stage ? live.backedUpAt : _rapierNotes.syncState?.backedUpAt;
	return {app, connected, service: other && S?.PROVIDERS?.[other]?.label.toLowerCase() || null, at: connected && Number.isSafeInteger(at) && at > 0 ? at : null};
}
// The date and the clock, both, whatever day it is: a person reading it should never have to work out
// which "yesterday" is meant.
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
// Both settings panels wear the same live status and last verified backup time.
function _rapierNotesSyncBoxWear(b) {
	if (!b) { for (const button of document.querySelectorAll('.rapier-notes-sync')) _rapierNotesSyncBoxWear(button); return; }
	const facts = _rapierNotesSyncFacts();
	// In the app the Rapier Sync box wears the same orange as the Cloudflare box it replaces.
	b.classList.add('rapier-cloudflare');
	b.replaceChildren(_rapierNotesEl('span', 'rapier-notes-sync__word', facts.app ? 'rapier sync (coming soon)' : !facts.connected ? 'sign in with cloudflare' : facts.at ? 'backed up to ' + (facts.service || 'cloudflare') : 'connected to ' + (facts.service || 'cloudflare')));
	if (facts.connected) b.appendChild(_rapierNotesEl('span', 'rapier-notes-sync__when', facts.at ? _rapierNotesBackupWhen(facts.at) : 'not backed up yet'));
	if (facts.connected) b.dataset.active = 'true'; else delete b.dataset.active;
}
// Both boxes and the storage warning enter here. The website starts the registered OAuth flow through the
// shared sheet, after local work is safely flushed; in the app the same sheet runs through Rapier Sync
// (notes/sync-ui.js, the companion's branch), which asks the app and opens nothing until a row is pressed.
function _rapierNotesSyncPress() {
	if (_rapierNotesIsApp()) {
		// Rapier Sync is Pro: without it the press opens the Pro sheet, nothing else.
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
	// Main Rapier's panel header reads "rapier v1.32.0"; this one says which part of it you are in,
	// and takes the version from the page's own canonical meta so the two can never disagree.
	const v = String(document.querySelector('meta[name="rapier-version"]')?.content || '').trim();
	header.appendChild(_rapierNotesEl('div', 'settings-panel__title', 'rapier notes' + (v ? ' v' + v : '')));
	const close = _rapierNotesEl('button', 'settings-close-btn'); close.type = 'button'; close.dataset.notesAct = 'settings-close'; close.setAttribute('aria-label', 'close settings');
	close.appendChild(_rapierNotesGlyph('close'));
	header.appendChild(close);
	const body = _rapierNotesEl('div', 'settings-panel__body'); body.id = 'rapier-notes-settings-body';
	panel.append(header, body); overlay.appendChild(panel);
	return overlay;
}
// The panel's content, drawn fresh each open: the state of a toggle is the preference's, and the
// folder's own rows come and go with what the folder is holding.
function _rapierNotesSettingsPaint() {
	const state = _rapierNotes, body = state.settingsEl?.querySelector('.settings-panel__body');
	if (!body) return;
	body.replaceChildren();
	const toggle = (label, values, chosen, act, key, small) => {
		const box = _rapierNotesEl('div', 'theme-switcher theme-switcher--joined theme-switcher--onoff' + (small ? ' rapier-notes-switch--four' : '') + ' rapier-notes-switch');
		box.setAttribute('role', 'group'); box.setAttribute('aria-label', label);
		for (const [value, word] of values) {
			const b = _rapierNotesEl('button', 'theme-switcher__btn onoff-btn', word);
			b.type = 'button'; b.dataset.notesAct = act; b.dataset.value = value;
			box.appendChild(b);
		}
		renderSwitch(box, chosen);
		return box;
	};
	const action = (word, act, data = {}) => {
		const b = _rapierNotesEl('button', 'settings-action-btn', word); b.type = 'button'; b.dataset.notesAct = act;
		for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
		return b;
	};
	const row = (...buttons) => { const r = _rapierNotesEl('div', 'settings-action-row'); const pair = _rapierNotesEl('div', 'settings-action-pair'); pair.append(...buttons); r.appendChild(pair); return r; };
	// The first row: the colour-mode icon and the main panel's theme selector. Every option below
	// keeps its order and its look.
	body.appendChild(_rapierNotesSettingsFirstRow());
	// The sync box, directly under it, a row of this panel as Import and Backup are.
	body.appendChild(row(_rapierNotesSyncBox()));
	// sort by -- three, and no (i): they explain themselves.
	body.appendChild(_rapierNotesSettingsTitle('sort by'));
	body.appendChild(toggle('sort by', RAPIER_NOTES_SORT_ORDER, _rapierNotesSortMode(), 'sort', 'notesSort'));
	// layout -- likewise: "Half and Full are self-explanatory."
	body.appendChild(_rapierNotesSettingsTitle('layout'));
	body.appendChild(toggle('layout', [['half', 'Half'], ['full', 'Full']], _rapierNotesPref('notesLayout', 'half'), 'layout', 'notesLayout'));
	// sections -- individual buttons, not a toggle: they are acts, not a state. New and Reorder each
	// take a row of their own.
	body.appendChild(_rapierNotesSettingsTitle('sections', 'notes-sections'));
	body.appendChild(row(action('New', 'section-add-menu')));
	body.appendChild(row(action('Sections', 'section-reorder')));
	// folder. The (i) explains the word. Import and Backup each take their own line too.
	body.appendChild(_rapierNotesSettingsTitle('folder', 'notes-folder'));
	const imp = action('Import', 'menu-import'); imp.dataset.action = 'notes-import';
	const bak = action('Backup', 'menu-backup'); bak.dataset.action = 'notes-backup';
	body.appendChild(row(imp));
	body.appendChild(row(bak));
	body.appendChild(row(action('Saved files', 'menu-saved-files')));
	if (globalThis.RapierNotesHistory) body.appendChild(row(action('Tidy history', 'menu-history-tidy')));
	// What the folder is holding right now: a receipt to read, a backup half made. Each is a real
	// act that would otherwise be unreachable, and each shows only while it exists.
	const extra = [];
	if (Array.isArray(state.index?.imports) && state.index.imports.length) extra.push(action('Imports', 'menu-imports'));
	if (state.backupBusy && state.backupController) extra.push(action('Cancel preparation', 'backup-cancel'));
	if (state.unfinishedBackup) extra.push(action('Discard unfinished backup', 'backup-discard-unfinished'));
	if (state.preparedBackup) { if (!state.preparedBackup.sequence || state.preparedBackup.sent.length < state.preparedBackup.plan.parts.length) extra.push(action(state.preparedBackup.sequence ? 'Continue backup' : 'Export backup copy', 'backup-export')); extra.push(action('Discard backup copy', 'backup-discard')); }
	for (const b of extra) body.appendChild(row(b));
	// Skills: its own title, OFF on the left, in the toggle box this panel already uses.
	body.appendChild(_rapierNotesSettingsTitle('skills'));
	body.appendChild(toggle('skills', [['false', 'Off'], ['true', 'On']],
		String(_rapierNotesPref('notesSkills', false) === true), 'skills', 'notesSkills'));
	// The notes-app role. It exists only where the host offers it -- Android 14 and later (asked once,
	// never nagged; never on the web) -- and the panel is painted afresh at each open, long after the
	// host has said what it can do.
	if (globalThis.RapierPlatform?.host?.requestNotesRole) body.appendChild(row(action('Set as notes app', 'role')));
	// The last row, after a gap. Trash is not a category on the cards; this is where a person goes to
	// find what they deleted, and the seven-day sentence lives in there with it.
	const bin = row(action('Recycle bin', 'bin-open'));
	bin.classList.add('rapier-notes-settings-foot');
	body.appendChild(bin);
	// The main panel's bottom, whole, under the panel's own rows: its plugins and its About.
	_rapierNotesSettingsBorrow(body);
	body.scrollTop = 0;
}
// The Notes panel shows the main panel's plug-ins and its About and Licenses by borrowing the main panel's own live nodes --
// the plugins title and its rows, and #settings-about-section -- while it is open, and gives them back when it closes, each
// to a marker left where it stood. One set of nodes: every id, every data-action, the engine's refs (renderSettings paints
// the same rows), the plug-ins' own painters and About's review door keep working wherever the nodes stand, and neither
// panel can show a copy that has drifted from the other.
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
		openDialog(overlay, {panel: '.settings-panel', onEscape: () => _rapierNotesSettingsOpen(false)});
		menuBtn?.setAttribute('aria-expanded', 'true');
	} else {
		closeDialog(overlay);
		// Given back once the panel has slid away (never mid-slide, which would empty its foot), or at once if the main panel
		// opens first (editor/engine.js _rapierUiSetSettingsOpen).
		setTimeout(() => { if (!_rapierNotesSettingsIsOpen()) _rapierNotesSettingsGiveBack(); }, 600);
		menuBtn?.setAttribute('aria-expanded', 'false');
	}
}
function _rapierNotesSettingsIsOpen() { return !!_rapierNotes.settingsEl?.classList.contains('open'); }

// ---- The fast-scroll toggle's jump panel
// ---------------------------------------------------------
// Not a bottom sheet: it grows out of the toggle and shrinks back into it. So this IS the main
// view's document navigator, by its own classes (.settings-overlay.restore-modal-overlay >
// .settings-panel.navigator-panel), opened and closed through the same openDialog/closeDialog, and
// grown and shrunk by the same `_rapierUiCircleGrowth` the navigator uses -- given this circle to
// grow from.
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
	openDialog(overlay, {panel: '.navigator-panel', noreturn: true, noautofocus: true, onEscape: () => _rapierNotesJumpOpen(false)});
	if (panel && typeof _rapierUiCircleGrowth === 'function') _rapierUiCircleGrowth(panel, true, state.fab);
}

// The back arrow asks "go back to the rapier editor?" in place, in lowercase Geist Mono. The question is
// the jump panel's own shape -- the main view's navigator by its classes, opened and closed through
// openDialog/closeDialog, grown out of the arrow and shrunk back into it by the same
// _rapierUiCircleGrowth -- with one row, the question itself: a tap on it goes back to the editor; the
// ground, Escape or the phone's Back put it away and Notes stays. Inside a note the arrow returns to the
// cards. The phone's Back on the cards raises this same question, grown out of the arrow, and never
// leaves Notes at once (_rapierNotesHandleBack, the popstate listener).
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

// ---- The Recycle Bin
// ----------------------------------------------------------------------------
// Deleted notes are not a category on the cards. The Recycle Bin is reached from the settings
// panel: a dedicated view of the deleted notes, with a button to clear them, a selection to
// restore several, and a notice that they are deleted after seven days.
//
// It is the notes settings panel's own shape -- the main Rapier panel's classes -- so it slides in
// from the right exactly as that does, and nothing about its look is written twice. The acts are
// NOT reimplemented: a tick builds a selection and the existing 'restore' and 'delete-forever' run
// over it, so history recording, the sidecar write, the confirm and the undo snack all come with
// them rather than being rebuilt slightly differently here.
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
	body.replaceChildren();
	const files = _rapierNotesBinFiles();
	// The promise Trash used to make on the main screen, made here instead -- where a person has
	// come looking for what they deleted, which is the only place it is any use to them.
	body.appendChild(_rapierNotesEl('p', 'rapier-notes-bin-note',
		'Notes and their unshared recordings are deleted from here after 7 days.'));
	if (!files.length) {
		body.appendChild(_rapierNotesEl('p', 'rapier-notes-empty', 'The recycle bin is empty.'));
		state.binPicked = new Set();
		return;
	}
	// A pick that names a note no longer here is dropped, so a restore cannot act on a stale name.
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
// The bin's own acts, each running the existing one over the ticked files rather than a second
// implementation of it. state.selected is the selection every act already reads.
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

// ---- Reorder mode
// -------------------------------------------------------------------------------
// Reorder closes the settings panel, collapses every section and shows drag handles that reorder
// sections up and down; Pinned collapses too but cannot be moved.
//
// While reorder is on every section is a single 44px head, so the list is a plain vertical
// reorder: the finger picks a head up, the heads below and above slide out of its way, and the
// lift writes the person's order into the sidecar. The order is one sparse field at the sidecar's
// root (`sectionOrder`, a list of ids), which notes/model.mjs round-trips untouched by design --
// "sparse version-1 fields round-trip even when this reader has no UI for them".
function _rapierNotesReorderOn(on) {
	const state = _rapierNotes;
	if (!!on === !!state.reorder) return;
	state.reorder = !!on;
	if (on) {
		_rapierNotesSettingsOpen(false); _rapierNotesJumpOpen(false); _rapierNotesHideSheet();
		// Every section collapses, pinned included. Pinned's is the mode's own (the render hides its
		// cards while the mode is on) and never the sidecar's: Pinned never folds, so no fold of it is
		// ever written.
		state.reorderWasClosed = {};
		const M = _rapierNotesModel();
		for (const id of _rapierNotesSectionIds()) {
			if (id === 'pinned') continue;
			state.reorderWasClosed[id] = _rapierNotesClosed(id);
			if (RAPIER_NOTES_SESSION_SECTIONS.includes(id)) state.opened.delete(id);
			else if (!_rapierNotesClosed(id)) state.index = M.setCollapsed(state.index, id, true);
		}
	} else {
		// Putting the sections back the way they were found: a collapse asked for by reorder is
		// reorder's, not the person's, so it is undone when reorder ends.
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
// Pinned is the one section a finger cannot pick up. Everything else moves.
function _rapierNotesReorderMovable(id) { return id !== 'pinned'; }
// The order the person has put the sections in, applied over the natural one. An id the stored
// order does not name keeps its natural seat, so a section made after the last reorder still shows.
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
// The drag itself. The heads are the only things on screen, so their rectangles are the whole
// model: the held head follows the finger, every other head steps one slot out of its way, and the
// drop writes the order the eye was already shown.
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
	// Which slot the head's own centre is over now, among the slots a head may take.
	const centre = drag.rects[drag.from].top + drag.rects[drag.from].height / 2 + dy;
	let at = drag.from;
	for (let i = 0; i < drag.rects.length; i++) {
		const r = drag.rects[i];
		if (centre >= r.top && centre <= r.bottom) { at = i; break; }
	}
	// Pinned never yields its slot, because a drop into it would move pinned.
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
	// A press that moved nothing draws nothing again: the draw replaces the head under the pointer, and the click that follows a mouse press (the tap
	// that opens the section's face) then has no head to land on.
	if (cancelled || !drag.moved || drag.at === drag.from) { if (drag.moved) _rapierNotesRender(); return drag.moved; }
	_rapierNotesSectionMove(drag.heads.map(h => h.dataset.notesSection), drag.from, drag.at);
	state.swallowClick = performance.now();
	return true;
}
// One shown section moved from one slot to another; the hidden sections keep their places, as only the ones on screen moved.
function _rapierNotesSectionMove(ids, from, at) {
	const [moved] = ids.splice(from, 1); ids.splice(at, 0, moved);
	const all = _rapierNotesSectionIds(), shown = new Set(ids);
	let k = 0;
	_rapierNotesReorderWrite(all.map(id => shown.has(id) ? ids[k++] : id));
}
// Keep's keys for moving (the twenty decisions, 15): Shift+J and Shift+K move the focused card one place later or earlier in its
// own section through moveTo, the order a drop writes; in Sections mode they move the focused section head, Pinned's never.
function _rapierNotesKeyMove(target, direction) {
	const state = _rapierNotes, head = state.reorder && target.closest?.('.rapier-notes-section-head'), card = !state.reorder && target.closest?.('.rapier-notes-card');
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
	if (from < 0 || from + direction < 0 || !M.moveTo(state.index, file, from + direction)) return true;
	_rapierNotesRender();
	// The card is drawn again after the move (and after the write): the keyboard stays on it for the next press.
	const keep = () => { const el = state.surface?.querySelector('.rapier-notes-card[data-notes-file="' + CSS.escape(file) + '"]'); if (el && document.activeElement !== el && (!document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected)) el.focus({preventScroll: true}); };
	state.surface.querySelector('.rapier-notes-card[data-notes-file="' + CSS.escape(file) + '"]')?.focus({preventScroll: true});
	requestAnimationFrame(() => requestAnimationFrame(keep));
	void _rapierNotesWriteIndex().then(() => requestAnimationFrame(keep), error => showToast('The new place was not written to the notes folder: ' + String(error?.message || error), 'error'));
	return true;
}
// Reorder says it is on where the person is looking, and offers the one way out -- the same
// full-width bar joined under the head that search and the plus use, so the mode is never a state
// with no visible door.
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
// One section's element: the chevron head and its grid. Made on demand (the person's own sections
// come and go) and kept in `state.grids` by id, so a re-render keeps the elements it has.
function _rapierNotesSectionEl(id) {
	const state = _rapierNotes;
	if (state.grids[id]) return state.grids[id].parentElement;
	const section = _rapierNotesEl('section', 'rapier-notes-section'); section.dataset.notesSection = id; section.hidden = true;
	// Pinned never folds: it is the exceptional section, and a section that only wants to stand first is
	// any section moved to the top. Its head is the word alone: no fold sign, no button, no act -- a
	// control that does nothing is not drawn.
	const fixed = id === 'pinned';
	const headBtn = _rapierNotesEl(fixed ? 'div' : 'button', 'rapier-notes-section-head'); headBtn.dataset.notesSection = id;
	if (!fixed) { headBtn.type = 'button'; headBtn.dataset.notesAct = 'section'; }
	// The fold sign is the settings panel's own typographic pair -- plus while the section is closed,
	// minus while it is open (rapier-source.css .settings-disclosure-title__glyph), not a rotating
	// arrow. A head is two centred lines: the sign, then the name; no count anywhere. The layout is
	// in rapier-notes.css.
	if (!fixed) headBtn.appendChild(_rapierNotesEl('span', 'rapier-notes-section-glyph'));
	const word = _rapierNotesEl('span', 'rapier-notes-section-word', RAPIER_NOTES_SECTION_WORDS[id] || id); word.dataset.word = word.textContent;
	headBtn.appendChild(word);
	// The drag handle reorder shows. It is drawn once and hidden until reorder is on (the
	// stylesheet), so a head never rebuilds to grow one; Pinned's is absent, because Pinned is the
	// one section a finger cannot pick up. It is DRAWN, not an icon: the head's own language is
	// typographic (the plus and the minus above are ::before/::after glyphs, not SVG), and no chevron
	// -- no svg at all -- stands in a section head.
	const grip = _rapierNotesEl('span', 'rapier-notes-section-grip'); grip.setAttribute('aria-hidden', 'true');
	headBtn.appendChild(grip);
	section.appendChild(headBtn);
	const grid = _rapierNotesEl('div', 'rapier-notes-grid'); grid.setAttribute('role', 'list'); grid.setAttribute('aria-label', RAPIER_NOTES_SECTION_WORDS[id] || id);
	section.appendChild(grid);
	state.grids[id] = grid;
	return section;
}
// The sections in the order they are shown: Skills, Pinned, the person's own in their order, Other,
// Archived, Trash (the jump pop-up lists the same, without the last two unless they hold notes).
function _rapierNotesSectionIds() {
	const own = (_rapierNotes.index?.sections || []).map(s => s.name);
	const natural = ['skills', 'pinned', ...own, 'others', 'archive'];
	// The person's own order, where reorder has written one. A section the stored order does not name
	// keeps its natural seat, so a section added since the last reorder is never lost.
	const wanted = _rapierNotesSectionOrder();
	if (!wanted || !wanted.length) return natural;
	const rank = new Map(); wanted.forEach((id, i) => rank.set(id, i));
	return natural
		.map((id, i) => ({id, i, r: rank.has(id) ? rank.get(id) : natural.length + i}))
		.sort((a, b) => a.r - b.r || a.i - b.i)
		.map(x => x.id);
}
// Archive comes up closed on EVERY open of Notes. A person may open it for the session; the
// collapse memory the other sections keep does not apply. (Deleted notes are not a card section at
// all -- the Recycle Bin is their home.)
const RAPIER_NOTES_SESSION_SECTIONS = ['archive'];
function _rapierNotesClosed(id) {
	if (id === 'pinned') return false; // Pinned never folds, whatever a sidecar says
	const index = _rapierNotes.index; if (!index) return id === 'skills';
	if (RAPIER_NOTES_SESSION_SECTIONS.includes(id)) return !_rapierNotes.opened.has(id);
	const own = (index.sections || []).find(s => s.name === id);
	if (own) return !!own.collapsed;
	const collapsed = index.collapsed || {};
	return id in collapsed ? !!collapsed[id] : id === 'skills' || id === 'archive';
}
// A section's chevron: the choice is the sidecar's, so Notes opens the same way next time.
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

// ---- Rendering ---------------------------------------------------------------------------------
// Skills is off by default (shell/platform.js's own fallback), so this trusts the registry's read
// exactly rather than inverting it -- unset and false must read the same way.
function _rapierNotesSkillsWanted() { try { return RapierPreferences.read('notesSkills') === true; } catch (_) { return false; } }
// The search is notes/search.mjs's, wired in notes/library.js -- one ranked index over the folder,
// the module's own query syntax and its own snippets. There is no substring fallback.
function _rapierNotesMatches(file) { return typeof _rapierNotesLibraryMatches !== 'function' || _rapierNotesLibraryMatches(file); }
function _rapierNotesSnippet(file) { return typeof _rapierNotesLibrarySnippet === 'function' ? _rapierNotesLibrarySnippet(file) : null; }
// ---- A note's recordings on its card
// -------------------------------------------------------------
// One reader of notes/audio.mjs for the cards, the way the recorder and the delete both ask it:
// the note's own recording lines, in the note's own order, each with the duration its line names.
function _rapierNotesAudio() { return globalThis.RapierNotesAudio; }
function _rapierNotesRecordings(file) {
	const A = _rapierNotesAudio(), text = _rapierNotes.texts.get(file) || '';
	// Every card asks this on every render, a whole library of them at once: a recording's own
	// destination is `audio/...` (recordingFromHref's one rule), so a note whose bytes never say
	// `audio` carries none and is answered without scanning its links at all. The word, not the
	// word and its slash: a destination is unescaped before it is read, so `audio\/x.webm` in the
	// source is `audio/x.webm` by the time recordingFromHref sees it.
	if (typeof A?.recordingsOf !== 'function' || !text.includes('audio')) return [];
	try { return A.recordingsOf(text); } catch (_) { return []; }
}
// A line that is nothing but one recording: the row replaces it. A recording linked inside a
// sentence is the person's own words and stays as written -- the card shows the note as it is.
function _rapierNotesRecordingOnly(line) {
	const A = _rapierNotesAudio(), F = globalThis.RapierNotesAttachments, s = String(line ?? '').trim();
	if (!s) return false;
	try { const rows = [...(A?.recordingsOf(s) || []), ...(F?.attachmentsOf(s) || [])]; return rows.length === 1 && rows[0].raw === s; } catch (_) { return false; }
}
// The same line, once the renderer has drawn it: the block it made goes, exactly as the picture
// line's paragraph goes when the pictures become the card's cover.
function _rapierNotesDropRecordingLines(el) {
	const A = _rapierNotesAudio(), F = globalThis.RapierNotesAttachments;
	for (const a of [...el.querySelectorAll('a[href]')]) {
		const href = a.getAttribute('href');
		if (!A?.recordingFromHref(href) && !F?.attachmentFromHref(href)) continue;
		const block = a.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6') || a.parentElement;
		if (!block || block === el || block.textContent.trim() !== a.textContent.trim()) continue;
		const parent = block.parentElement;
		block.remove();
		// The list a lone recording item stood in goes with it, rather than an empty pair of bullets.
		if (parent && parent !== el && !parent.firstElementChild && !parent.textContent.trim()) parent.remove();
	}
}
function _rapierNotesCard(file) {
	const state = _rapierNotes, M = _rapierNotesModel(), entry = state.index.notes[file];
	const held = state.texts.get(file), unread = held == null ? state.readFailed.get(file) || null : null;
	const card = M.projectCard(file, held ?? '');
	const el = _rapierNotesEl('div', 'rapier-notes-card' + (entry.colour ? ' rapier-notes-tint-' + entry.colour : '') + (entry.pinned ? ' rapier-notes-card--pinned' : ''));
	// A card is called what its note is: its title, else its first words. A note that is only a
	// picture has no words and is called by its name ("Drawing"): a screen reader read out the
	// picture's glyph, or the line that keeps its bytes (`[image-…]: data:…`, never words, as
	// notes/model.mjs noteFileName reads it), as the note's name.
	const words = card.body.find(line => line !== '\u{1F5BC}' && !/^\[(?:\\.|[^\]\\])+\]:[ \t]*<?data:/i.test(line));
	el.dataset.notesFile = file; el.dir = 'auto'; el.setAttribute('role', 'listitem'); el.tabIndex = 0; el.setAttribute('aria-label', card.title || words || file.replace(/\.md$/i, ''));
	el.setAttribute('aria-describedby', 'rapier-notes-card-help' + (state.selected.has(file) ? ' rapier-notes-selected' : ''));
	if (state.selected.has(file)) el.classList.add('rapier-notes-card--selected');
	// A search whose match is in the title marks it there, and the card keeps its own body.
	const title = card.title ? _rapierNotesEl('h3', '', card.title) : null;
	if (title) el.appendChild(title);
	// An unread note (over the preview bound, or its read failed) is its name -- the title above, which
	// the projection of no words is -- and the reason, and opens whole. One whose read is still on its
	// way is only its name: the card flashed "not read yet, 1 KB" under its name written twice.
	if (unread) { el.classList.add('rapier-notes-card--unread'); el.appendChild(_rapierNotesEl('p', 'rapier-notes-card-unread', unread + (state.sizes.get(file) ? ', ' + _rapierNotesBytesWords(state.sizes.get(file)) : ''))); }
	// A note that is only a link: its one line is the title (cardHead's rule), so the card names the
	// link's domain under it here (a link in a body is handled by the renderer below).
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
		// A body the cover leaves empty is not drawn, and a card with nothing but its pictures ends at
		// the picture (the stylesheet's rapier-notes-card--picture): no title, no words, no recording.
		if (!cover || rich.textContent.trim() || rich.querySelector('img, svg, video')) el.appendChild(rich);
		else if (!card.title && !takes.length) el.classList.add('rapier-notes-card--picture');
	}
	else {
		// Checkboxes are live on the cards: each box is a control; a tap flips that one line in the file
		// (the hold still lifts the card).
		card.checks.slice(0, 6).forEach((check, n) => {
			const row = _rapierNotesEl('div', 'rapier-notes-check' + (check.done ? ' rapier-notes-check--done' : ''));
			const box = _rapierNotesEl('button', 'rapier-notes-check-box'); box.type = 'button'; box.dataset.notesCheck = String(n);
			box.setAttribute('aria-pressed', String(check.done)); box.setAttribute('aria-label', (check.done ? 'Untick ' : 'Tick ') + check.text);
			row.append(box, _rapierNotesEl('span', '', check.text)); el.appendChild(row);
		});
		// A recording's own line is not words here either: the row below is what the card says for it.
		for (const line of card.body) { if (takes.length && _rapierNotesRecordingOnly(line)) continue; el.appendChild(_rapierNotesEl('p', '', line)); }
	}
	// A note that is only its title shows that title big (the stylesheet's rapier-notes-card--title).
	// Not a link, not an empty file's name.
	if (card.title && !unread && !link && !card.empty && !snippet && !card.body.length && !card.checks.length) el.classList.add('rapier-notes-card--title');
	// On a card a recording is not words. The note's own line for it -- `[Recording 0:42](audio/…)` --
	// reads as underlined words wherever a card draws it (the renderer's link with its href stripped,
	// or the plain projection's raw line), so the body drops that line and the card says the recording
	// itself here: one row for each one the note carries, in the note's own order, the way the note's
	// player draws one row per link -- a play button and the duration in the player's own words
	// (`--:--` where the line names none, exactly as the player says it). Under the body rather than
	// inside it, so a long note's clamp never cuts a recording off. The ▶ is the one control in the
	// row: it plays the recording from the card, the note closed, and pauses it (notes/recorder.js
	// paints it and plays it); a tap anywhere else on the card is the card's, and opens the note.
	for (const take of takes) {
		const row = _rapierNotesEl('div', 'rapier-notes-recording');
		const play = _rapierNotesEl('button', 'rapier-notes-recording-play'); play.type = 'button'; play.dataset.notesPlay = take.name;
		play.setAttribute('aria-label', 'Play ' + take.label);
		if (typeof _rapierRecorderCardButton === 'function') _rapierRecorderCardButton(play, file, take);
		row.append(play, _rapierNotesEl('span', 'rapier-notes-recording-time', _rapierNotesAudio().durationWords(take.duration)));
		el.appendChild(row);
	}
	if (typeof _rapierAttachmentsCard === 'function') _rapierAttachmentsCard(el, file, state.texts.get(file) || '');
	// The reminder chip, a bell and the model's own words -- "(missed)" included, since remindWords
	// already says it. Nothing when there is no reminder.
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
	// A note an agent made says so: who, from the index, never from the person's words.
	if (entry.agent) el.appendChild(_rapierNotesEl('div', 'rapier-notes-proposal', 'Made by ' + entry.agent.by));
	// A change an agent proposed is the person's to keep or drop: who proposed it, and the two answers.
	if (entry.proposed) {
		el.classList.add('rapier-notes-card--proposed');
		const row = _rapierNotesEl('div', 'rapier-notes-proposal', 'Change proposed by ' + entry.proposed.by);
		for (const [act, word] of [['proposal-keep', 'Keep'], ['proposal-drop', 'Drop']]) {
			const b = _rapierNotesEl('button', 'rapier-notes-proposal-btn', word); b.type = 'button'; b.dataset.notesAct = act; row.appendChild(b);
		}
		el.appendChild(row);
	}
	if (title?._rapierNotesInk || rich?._rapierNotesInk) el._rapierNotesInk = [...(title?._rapierNotesInk || []), ...(!snippet && rich?._rapierNotesInk || [])];
	return el;
}
// The card's body is the note rendered as rich Markdown by the document's own renderer
// (globalThis.rapierRenderPreview, editor/engine.js) over the note's own reference definitions, so
// a heading is a heading, emphasis is emphasis, a list is a list and a picture is the picture --
// never `[image-…]: data:…` as prose. Bounded: the first RAPIER_NOTES_PREVIEW_CHARS after the
// title (the stylesheet clamps the height and fades the cut). Task lines become the card's own
// boxes through a sentinel the renderer carries as text, numbered from the same line toggleCheck
// counts (notes/model.mjs), so a tap flips the line the card drew. Null when the renderer is not
// up, and the plain projection stands in.
const RAPIER_NOTES_PREVIEW_CHARS = 2000, RAPIER_NOTES_TASK_MARK = /\u2063t(\d+):([01])\u2063/, RAPIER_NOTES_COVER_MIN = 160;
function _rapierNotesCoverSmall(img) {
	const w = Number(img.getAttribute('data-rapier-natural-width')) || img.naturalWidth || 0, h = Number(img.getAttribute('data-rapier-natural-height')) || img.naturalHeight || 0;
	return w > 0 && h > 0 && w < RAPIER_NOTES_COVER_MIN && h < RAPIER_NOTES_COVER_MIN;
}
// Every card that slides -- the ones that make way during a drag, and the card in hand dropping into
// its slot -- moves on one damped spring, not an ease-out curve. The spring is sampled once into a
// CSS `linear()` timing function (stiffness 180, damping 20, unit mass: a small overshoot past the
// slot, then the settle) and handed to the stylesheet as `--notes-spring`; a browser without
// `linear()` keeps the house ease-out. Reduced motion places directly (the pack).
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
	// The model's own view of the lines: a task line inside a fence, an indented block, a comment or
	// raw HTML is text, never a box, and a note the card may not tick gets none.
	const source = M.cardSource(text), lines = source.lines, at = M.cardHead(source.visible, lines).at;
	const heading = title && at >= 0 ? lines.slice(at, card.start).join('\n') : '';
	const markedTitle = heading.includes('<!--') && globalThis.RapierMarkdownSpec?.hasInkMarker(heading);
	let n = 0, used = 0, cutAt = lines.length; const out = markedTitle ? [heading, ''] : [];
	// The pictures a note opens with come first, the title's lines (already the card's h3; a `===`
	// rule under it too) left out.
	for (let i = card.lead >= 0 ? card.lead : card.start; !titleOnly && i < lines.length; i++) {
		if (card.lead >= 0 && card.title && i >= at && i < card.start) continue;
		const line = lines[i];
		// The pictures the note opens with are not preview words: a picture written inline is its whole
		// data URL on one line, and counted, it spent the budget and left the card no words under it.
		const lead = card.lead >= 0 && (at < 0 || i < at);
		if (!lead && used + line.length > RAPIER_NOTES_PREVIEW_CHARS && out.length) { cutAt = i; break; }
		if (!lead) used += line.length + 1;
		// An item with NO words yet is still an item. Demanding a non-space after the box (`\s+\S`)
		// would let a brand new "- [ ] " fall through to the renderer, and the card would draw the
		// renderer's own unstyled <input type=checkbox>. The same test appears in notes/model.mjs twice
		// (projectCard and toggleCheck) and the THREE must stay identical: the card numbers its boxes in
		// this order and toggleCheck counts the same lines to find the one a tap flips.
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
				// Let the shared parser see the real close, then keep only the original excerpt's
				// DOM. A synthetic close could turn an invalid paragraph-straddling mark into ink.
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
			// An opaque comment or attribute can swallow the boundary; the original excerpt is
			// still the fallback, never the extra source read only to finish a visible span.
			markdown = preview; boundary = '';
		}
	} catch (_) { return null; }
	// The same sanitized renderer supplies a marked title, including its span attributes. Move
	// its inline children into the existing title; a second HTML sink or marker parser is unnecessary.
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
	// A recording's own line is not words: the renderer draws it as a link, the card strips its href
	// below, and the person would be left with underlined words where a recording belongs. The line
	// goes here; the card says the recording itself in a row under this body.
	_rapierNotesDropRecordingLines(el);
	// A link in a card is words: the card opens the note, never the link. A note that is only a link
	// shows the link as its card with the domain under it (Keep's link card, without a fetch).
	const anchors = [...el.querySelectorAll('a')], only = anchors.length === 1 && el.textContent.trim() === anchors[0].textContent.trim() ? anchors[0].getAttribute('href') : null;
	for (const a of anchors) { a.removeAttribute('href'); a.removeAttribute('target'); }
	if (only) { let host = ''; try { host = new URL(only, 'https://rapier.invalid/').hostname.replace(/^www\./, ''); } catch (_) {} if (host && host !== 'rapier.invalid') el.appendChild(_rapierNotesEl('div', 'rapier-notes-card-link', host)); }
	// Images size themselves: the pictures a note opens with are the card's head, edge to edge, laid
	// as Keep lays them (_rapierNotesCollage). A small picture (an icon, a one-pixel mark) is never
	// blown up: its size is read from the definition where the renderer wrote it, else when it has
	// loaded, and a lone small one goes back to the body.
	const lead = [];
	for (let node = el.firstElementChild; node && node.tagName === 'P' && node.children.length && !node.textContent.trim() && [...node.children].every(c => c.tagName === 'IMG'); node = node.nextElementSibling) lead.push(node);
	const pictures = lead.flatMap(p => [...p.children]);
	if (pictures.length && !pictures.some(_rapierNotesCoverSmall)) { for (const p of lead) p.remove(); el.prepend(_rapierNotesCollage(pictures)); }
	for (const img of el.querySelectorAll('img')) { img.setAttribute('draggable', 'false'); img.setAttribute('decoding', 'async'); img.addEventListener('load', () => { _rapierNotesCollageLoaded(img); _rapierNotesRepackSoon(); }); _rapierNotesCardPicture(img, body); }
	// The task sentinels become boxes: the list item that carries one is a check row.
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
	// Ticked items fold into one line, "+ N checked items" (Keep's card); a tap on the line shows them
	// on this card until Notes closes, so an item can be unticked from the card too.
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

// Only materialized cards with marked words enter the drawing closure. The card is its root
// so a title and body can share an arrow; fragments outside the body's preview are not anchors.
// Repacking already follows resize, image loading and task folds, so cards need no watchers.
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
	// Keep the same body clip even though its marks live at the card root. This clips geometry,
	// not source: a partially shown line keeps its actual baseline instead of being fitted again.
	for (const piece of pieces) {
		if (!clipped.has(piece.span) || (piece.endSpan && !clipped.has(piece.endSpan))) continue;
		const pad = (piece.kind === 'free' ? 0.09 : 0.11) * piece.em + 1, box = piece.box;
		const edges = [clip.top - box.y + pad, box.x + box.width + pad - clip.right, box.y + box.height + pad - clip.bottom, clip.left - box.x + pad].map(value => Math.max(0, value));
		if (edges.some(value => value > 0)) piece.element.style.clipPath = 'inset(' + edges.map(value => value.toFixed(2) + 'px').join(' ') + ')';
	}
	if (!_rapierNotes.inkFonts) { _rapierNotes.inkFonts = true; document.fonts?.addEventListener?.('loadingdone', _rapierNotesRepackSoon); }
}
// ---- The collage ------------------------------------------------------------------------------
// Square corners, no link previews. The pictures a note opens with are laid as Keep lays them: the
// remainder row of one or two first, then rows of three (six is 3+3, four is 1+3, two is 2), each
// row filling the card's width exactly, the pictures in a row sharing one height with widths of
// their own shapes -- flex-grow is the picture's own ratio and its box has that ratio, so the row
// height is (width - gaps) / sum of ratios, with no fixed height and nothing cut. The box is
// reserved from the size the renderer wrote, so the grid packs the right height before the
// thumbnail arrives; a picture whose size is not known takes its shape when it has loaded and the
// grid re-packs once.
// The rows themselves, and a picture's own shape, are the two things the card's cover and the
// collage INSIDE the note must agree on exactly, so they are one owner each and neither surface
// carries a copy. Rows: the remainder row of one or two first, then rows of three.
function _rapierNotesCollageRows(n) {
	const first = n <= 3 ? n : n % 3, rows = [];
	if (first) rows.push([0, first]);
	for (let i = first; i < n; i += 3) rows.push([i, Math.min(3, n - i)]);
	return rows;
}
// A picture's shape as the renderer wrote it, else as the browser found it when it loaded; 0 when
// neither is known yet (the caller shares the row equally until the load says otherwise).
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
	// The grow factors of a row must sum to one or more, or a lone picture takes only that fraction
	// of the row (the flex law); scaled, the widths stay in proportion.
	img.style.flexGrow = String(Math.round(1000 * size.w / size.h) / 10); img.style.aspectRatio = size.w + ' / ' + size.h; return true;
}
function _rapierNotesCollageLoaded(img) {
	const row = img.parentElement; if (!row?.classList.contains('rapier-notes-collage-row')) return;
	const box = row.parentElement;
	// A lone small picture is not a head: back to the body as the paragraph it was.
	if (box.querySelectorAll('img').length === 1 && _rapierNotesCoverSmall(img)) { const p = _rapierNotesEl('p'); p.appendChild(img); box.replaceWith(p); return; }
	_rapierNotesCollageShape(img);
}
// ---- The collage INSIDE the note ----------------------------------------------------------------
// As pictures are added to a note they lay themselves out as an adaptive collage, the way the card
// thumbnails do -- not a stack.
//
// The card's cover is a collage Notes BUILDS: it owns those elements and may move them. A note's
// pictures are the person's own blocks, each one the editor's own `.block-wrapper` over one line of
// their Markdown, and nothing here restructures them -- moving a block out of `#editor-blocks`
// would take it out of every `#editor-blocks > .block-wrapper` the editor reaches for, and
// rewriting the note's lines to join the pictures would change the person's file for a look. So a
// RUN of consecutive picture blocks is laid out where it stands: each block floated to its own
// share of the row, the shares taken from the pictures' own shapes so a row's pictures share one
// height with nothing cut, by the same rows and the same shapes the card uses
// (_rapierNotesCollageRows, _rapierNotesCollageSize). A lone picture is not a collage and is left
// exactly as it was.
//
// Re-applied after every re-render of the blocks, the way notes/todo.js decorates a note's lists:
// one MutationObserver on #editor-blocks, childList only, so this module's own class and style
// writes (attributes) cannot feed it back. Everything it writes it can take off again, and does,
// the moment the note closes.
const RAPIER_NOTES_PIC_GAP = 2;
const _rapierNotesPics = {observer: null, scheduled: false, bound: null};
// A tile is a block that is ONE picture and nothing else: the editor's own `--image` mark, no words
// beside it, exactly one picture, and not the block the person is editing.
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
		// An unknown shape shares the row equally until its load says otherwise (the load re-lays).
		const ratios = row.map(t => { const size = _rapierNotesCollageSize(t.img); return size ? size.w / size.h : 1; });
		const sum = ratios.reduce((a, b) => a + b, 0) || row.length;
		const gaps = RAPIER_NOTES_PIC_GAP * (len - 1);
		row.forEach((tile, k) => {
			tile.el.classList.add('rapier-notes-pic');
			tile.el.classList.toggle('rapier-notes-pic-row', k === 0);
			tile.el.classList.toggle('rapier-notes-pic-last', start + len >= tiles.length);
			// The row fills the note's own width exactly: the shares are of the width less the gaps.
			tile.el.style.width = len === 1 ? '100%' : 'calc((100% - ' + gaps + 'px) * ' + (ratios[k] / sum).toFixed(6) + ')';
			tile.el.style.marginRight = k === len - 1 ? '0px' : RAPIER_NOTES_PIC_GAP + 'px';
			const size = _rapierNotesCollageSize(tile.img);
			// The box is reserved from the shape the renderer wrote, so the note's flow is right
			// before the picture's bytes have arrived.
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
			// The block after a run stands below the floats, not beside the last of them.
			const after = blocks[i + tiles.length]; if (after) after.classList.add('rapier-notes-pic-after');
			i += tiles.length;
		} else i += Math.max(1, tiles.length);
	}
	// A note opened from a search whose words are in its pictures shows them marked there (notes/ocr.js).
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
	// childList only: the classes and widths this module writes are attributes, so it never wakes
	// itself, and a picture arriving late re-lays the row it landed in through its own load.
	_rapierNotesPics.observer = new MutationObserver(() => _rapierNotesPicSoon());
	_rapierNotesPics.observer.observe(host, {childList: true, subtree: true});
	// One capture listener for the life of the page, never a second: a picture that arrives after
	// the row was laid out re-lays it with its own shape.
	if (_rapierNotesPics.bound !== host) { _rapierNotesPics.bound = host; host.addEventListener('load', event => { if (event.target?.tagName === 'IMG' && _rapierNotes.mode) _rapierNotesPicSoon(); }, true); }
	_rapierNotesPicSoon();
}
// ---- Thumbnails ---------------------------------------------------------------------------------
// A card's picture that is a large data URL is shown through a thumbnail: at most
// RAPIER_NOTES_THUMB_PX on the long side, JPEG XL at low quality where this browser can SHOW JPEG
// XL (the picture profile's own rule: never a thumbnail the browser cannot display), else WebP;
// written once to `thumbs/` beside the notes (and synced with them) and read back on later opens,
// so the grid never decodes a painting at full size. Made one at a time after the cards are on
// screen, never on the render path. A small picture, or an SVG drawing, is shown as itself.
const RAPIER_NOTES_THUMB_MIN = 48 * 1024;
// A thumbnail is as wide as the card that shows it, in the screen's own pixels: the card draws a
// picture at its full width, so a thumbnail narrower than that is stretched and reads as a blur. At
// the card's width the thumbnail is the picture as the card can show it, at a fraction of the bytes
// a decode of the original would cost every open; a picture narrower than that is kept at its own
// size.
function _rapierNotesThumbWidth() {
	const state = _rapierNotes;
	let card = 0;
	for (const grid of Object.values(state.grids || {})) card = Math.max(card, parseFloat(grid.style.getPropertyValue('--notes-card-w')) || 0);
	if (!card && state.surface) { const cols = Math.max(1, Number(getComputedStyle(state.surface).getPropertyValue('--notes-cols')) || 2); card = (state.surface.clientWidth - 8 * (cols - 1)) / cols; }
	const ratio = Math.min(3, Math.max(1, Number(globalThis.devicePixelRatio) || 1));
	return Math.min(1280, Math.max(320, Math.ceil((card || 320) * ratio)));
}
function _rapierNotesThumbKey(src, width) {
	// FNV-1a over the data URL, plus its length and the width it was made for: the same picture at
	// the same card width makes the same name on every open.
	let h = 0x811c9dc5; for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
	return h.toString(16).padStart(8, '0') + '-' + src.length.toString(36) + '-' + width;
}
// A referenced picture (`![alt][label]` over a `[label]: data:…` definition), and an inline JPEG XL,
// come out of the renderer as the editor's own placeholder: a 1x1 in the picture's shape, the
// definition named on `data-rapier-asset` (or the URL on `data-rapier-image-url`), which the editor
// reveals later through its picture module. The card reveals it here: through a thumbnail when the
// picture is large (below), else as the presentation the editor would show -- the picture; an SVG
// re-inked for dark paper; the notice where this browser cannot show JPEG XL. A picture written
// inline is already its own src. A reference without a definition stays the placeholder.
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
// The reveal itself: the src, and the editor's own mark that the picture is shown -- the paper's
// stylesheet keeps a placeholder minimum (96 x 32) on an asset picture until it wears that mark,
// which blew a revealed icon up to 96 px and held every collage tile at 96.
function _rapierNotesCardShow(img, url) { if (img.src !== url) img.src = url; img.setAttribute('data-rapier-asset-state', 'ready'); }
// `src` is the picture's own data URL (the definition's, for a referenced one: the same picture
// makes the same thumbnail name on every open); `text` and `ref` name the note and the reference
// the maker presents it through when the thumbnail has to be made.
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
			// Read back what an earlier open made; else make it now and keep it.
			let blob = kept ? await _rapierNotesStore.readThumb(kept) : null;
			if (!blob) {
				const made = await _rapierNotesThumbMake(job);
				if (made?.blob) { blob = made.blob; const name = job.key + (blob.type === 'image/jxl' ? '.jxl' : '.webp'); try { await _rapierNotesStore.writeThumb(name, blob); names.add(name); } catch (_) {} }
				// A picture this browser cannot show is shown as the editor's notice, this open only:
				// never kept as its thumbnail (a later browser, or an updated one, shows the picture).
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
		// The referenced picture as the editor presents it: the picture's own bytes verified and
		// shown (JPEG XL where this browser shows it natively), or the notice where it cannot.
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
// A picture decoded after the pack changes its card's height: one re-pack per frame, never mid-drag
// (the drag's own re-render runs when the finger lifts).
function _rapierNotesRepackSoon() {
	const state = _rapierNotes;
	if (state.repack || !state.open) return;
	state.repack = requestAnimationFrame(() => { state.repack = 0; if (state.drag) { state.renderAfterDrag = true; return; } for (const grid of Object.values(state.grids)) _rapierNotesPack(grid); });
}
// ---- The window: a library's cards are derived, never all drawn ----------------------------------
// notes/library-window.mjs: exact-prefix masonry. A section's cards are made in bounded batches
// until the shortest column covers the viewport and one viewport of overscan below it; the rest are
// made as the person scrolls. A card's box is committed from its own settled height at the exact
// column width -- never estimated, so adding the tail can never move a card already placed -- and
// the DOM holds only the derived prefix: a five-thousand-note folder opens on its first cards
// instead of on five thousand (notes-library-scale-budget is the measurement;
// notes-library-window-model is the model's own proof). The placement arithmetic is the model's
// (shortest column, first tie, gap 8, rounded), so a re-pack of the cards on screen -- a picture
// decoded, a drag's crossing -- goes through the same model over the cards the DOM holds, in the
// order it holds them, with the undrived tail behind. Its explicit cost, in the model's own words:
// before the tail is derived there is no exact whole-library scroll extent; the known extent grows
// as the person scrolls.
function _rapierNotesWindowModel() { return globalThis.RapierNotesLibraryWindow; }
const RAPIER_NOTES_WINDOW_ROUNDS = 64;
function _rapierNotesWindowItems(files) {
	const notes = _rapierNotes.index?.notes || {};
	return files.map(file => ({key: file, revision: 'm' + (Number(notes[file]?.modified) || 0)}));
}
// The grid's own top inside the scroller, so the viewport the model is asked about is the grid's.
function _rapierNotesGridViewport(grid) {
	const scroll = _rapierNotes.scroll;
	const gridTop = grid.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
	return {top: Math.max(0, scroll.scrollTop - gridTop), viewportHeight: Math.max(1, scroll.clientHeight)};
}
// A new window over the section's files, in their order: made whenever the section is drawn.
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
// The cards' boxes, written on each card the way the drag and the drop read them.
function _rapierNotesPlaceCard(card, row) {
	// The card in the finger's hand is where the finger is; its slot is kept for the drop.
	const land = _rapierNotes.landing;
	if (card.dataset.notesDragging) card.dataset.notesHome = row.x + ',' + row.y;
	else if (land && land.file === card.dataset.notesFile && performance.now() - land.at < 2000 && card.parentElement) {
		// A card dropped into another section is made afresh there; it starts where the finger let it go and
		// rides the spring into its slot, as a card dropped in its own section does (reduced motion: no
		// transition, so it is placed directly).
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
// One batch: read every card, THEN write every card (reading and writing one card at a time forces
// a reflow per card). A rendered body taller than its clamp is faded at the cut; measured here,
// once. A card with no height is not laid out (its grid is not on screen): nothing is committed and
// the batch is taken back out, honestly.
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
// Derive until the model says the viewport is covered, or the section is complete: each round asks
// for the batch's texts (the reads model, two at a time), makes the cards, commits their measured
// heights and places them. A fill already running for this window is asked to go round again
// rather than doubled; a window replaced by a newer render is abandoned where it stands.
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
				// A keyboard can reach the first card beyond the viewport. Ask the same window
				// owner for its next batch; never make a second card or bypass its measured layout.
				const top = wanted >= geometry.next ? Math.max(view.top, geometry.extent) : view.top;
				const plan = L.planMasonry(geometry, {top, viewportHeight: view.viewportHeight, batch});
				if (!plan.derive.length) break;
				const keys = plan.derive.map(item => item.key);
				for (const key of keys) state.reads.deriving.add(key);
				await _rapierNotesWindowTexts(keys);
				const gone = state.windows[id] !== win || state.drag || !state.open;
				// A pack replaced the window's geometry while the texts were read (a picture decoded, a fold, a
				// drop): the plan was made over the old one, and a batch committed against the new would be
				// refused by the model as stale or out of order (seen: the first open after a reload that brought
				// new files and a picture card, the model's own exception, the batch's cards left unplaced at the
				// grid's top). Nothing is committed from a plan the geometry has left behind; the round goes again.
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
			if (target && state.open && document.activeElement === intent.from) { target.focus({preventScroll: true}); target.scrollIntoView({block: 'nearest'}); }
		}
	} finally { win.filling = false; }
}
// The person scrolls: every open section whose window is not complete is asked again, and derives
// what the new viewport needs. Never mid-drag (the render after the drag draws the whole surface).
function _rapierNotesWindowScrolled() {
	const state = _rapierNotes; if (!state.open || state.drag || !state.index) return;
	for (const [id, grid] of Object.entries(state.grids)) {
		const win = state.windows[id];
		if (!win || win.masonry.next === win.masonry.items.length || grid.parentElement.hidden) continue;
		void _rapierNotesWindowFill(grid, id);
	}
}
// Shortest-column packing: one pass per render or reorder, never per move. Cards are absolutely
// placed by transform; a later re-pack animates through the card's own transform transition, which
// is the FLIP without a library. The pack is the window model's, over the cards the DOM holds in
// the order it holds them (a drag may have moved one), with the section's undrived files behind
// them so a scroll that follows derives the right card next.
function _rapierNotesPack(grid) {
	_rapierNotesScrollQuiet();
	const L = _rapierNotesWindowModel(), state = _rapierNotes, id = grid.parentElement?.dataset.notesSection;
	// A folded section's cards have no height to measure: they keep the boxes they were laid with, and the
	// section is drawn again when it opens. (A pack here measured nothing, took the first batch's cards out of
	// the grid and left the rest standing uncommitted.)
	if (grid.parentElement?.hidden) return;
	const cards = [...grid.children].filter(c => c.classList.contains('rapier-notes-card'));
	if (!cards.length) { grid.style.height = ''; return; }
	const win = id ? state.windows[id] : null; if (!win || !L) return;
	const shown = cards.map(c => c.dataset.notesFile), seen = new Set(shown), m = win.masonry;
	win.epoch++;
	win.masonry = L.createMasonry({items: _rapierNotesWindowItems([...shown, ...win.files.filter(f => !seen.has(f))]), width: m.width, columns: m.columns, gap: m.gap, context: m.context, epoch: win.epoch});
	// Each batch commits exactly the cards it measured: the items behind the last batch are the section's
	// undrived tail, and a slice of thirty-two items against fewer cards was refused by the model as a
	// measurement without a height -- seen on the first open after a reload, a picture decoding while the fill
	// had laid its first sixteen: the pack threw, the fill went on over a geometry the pack had reset, and the
	// same cards were made twice.
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
	// The cards are not on screen (a note is open, or Notes is closed): a pack would measure cards
	// of no height. The next open draws them, as it always does.
	if (!state.open) return;
	// A card in hand keeps its grid: the surface is drawn again when the finger lifts (a resize
	// mid-drag would otherwise rebuild every card under the drag and lose the reorder).
	// A card let go in another section is drawn once, in its place: the section act and the place's write are
	// one landing (`_rapierNotesDropSection`), and a drawing between them would show the card at its section's
	// head for as long as the write takes.
	if (state.drag || state.dropping) { state.renderAfterDrag = true; return; }
	const skills = _rapierNotesSkillsWanted(), ids = _rapierNotesSectionIds();
	let matches = 0;
	for (const id of ids) state.scroll.appendChild(_rapierNotesSectionEl(id));
	// The bars' travel spacer stays LAST. appendChild above moves each section past whatever is
	// already there, so a spacer left in place ends up above the cards and pushes them down by
	// its own height -- measured at 712px, cards at 688 instead of 60 (_rapierNotesBarRoom).
	if (state.scrollRoom) state.scroll.appendChild(state.scrollRoom);
	for (const [id, grid] of Object.entries(state.grids)) if (!ids.includes(id)) { grid.parentElement.remove(); delete state.grids[id]; }
	for (const id of ids) {
		const grid = state.grids[id], section = grid.parentElement, head = section.querySelector('.rapier-notes-section-head');
		const word = head.querySelector('.rapier-notes-section-word'); word.textContent = word.dataset.word = RAPIER_NOTES_SECTION_WORDS[id] || id;
		// library.js caches this per paint of a search's own progress (_rapierNotesLibrarySortedSection);
		// every other build of Notes still asks the model directly.
		const files = _rapierNotesSorted((typeof _rapierNotesLibrarySortedSection === 'function' ? _rapierNotesLibrarySortedSection(id) : M.sortedSection(state.index, id))).filter(_rapierNotesMatches);
		const own = !(id in RAPIER_NOTES_SECTION_WORDS);
		const wanted = id === 'skills' ? skills : id === 'archive' ? files.length > 0 : true;
		// A search shows where its matches are: a section of the person's own with none is left out, as
		// an empty Pinned always was, not drawn saying "No notes in this section yet." over notes it holds.
		section.hidden = !wanted || (!files.length && (id === 'pinned' || (own && !!state.query)));
		head.classList.toggle('rapier-notes-section-head--fixed', state.reorder && !_rapierNotesReorderMovable(id));
		if (section.hidden) { grid.replaceChildren(); delete state.windows[id]; continue; }
		matches += files.length;
		// A boolean, always: classList.toggle's force argument left undefined toggles instead of setting.
		const closed = _rapierNotesClosed(id) || (state.reorder === true && id === 'pinned');
		section.classList.toggle('rapier-notes-section--closed', closed);
		if (head.tagName === 'BUTTON') head.setAttribute('aria-expanded', String(!closed));
		grid.replaceChildren();
		if (!files.length) {
			// The system lines are centred like the section titles and say the least.
			const empty = _rapierNotesEl('div', 'rapier-notes-empty', id === 'skills' ? 'A note your agent can fetch. Write one here.' : id === 'others' ? (state.query ? (state.reading && !state.reading.complete ? 'Reading notes, ' + state.reading.done + ' of ' + state.reading.total + '.' : (typeof _rapierNotesLibraryNotice === 'function' && _rapierNotesLibraryNotice() && _rapierNotesLibraryNotice().stage !== 'complete') ? _rapierNotesLibraryNotice().message : (typeof _rapierNotesLibraryPartial === 'function' && _rapierNotesLibraryPartial()) ? (_rapierNotesLibraryPartial().unread ? 'Some notes unsearched. Open Notes again.' : 'Searching, ' + _rapierNotesLibraryPartial().done + ' of ' + _rapierNotesLibraryPartial().total + '.') : 'Nothing matches.') : 'Press + to add a note.') : own ? 'No notes yet.' : '');
			grid.appendChild(empty); grid.style.height = ''; delete state.windows[id]; continue;
		}
		// A closed section draws nothing: its cards are derived when it opens (the toggle draws again).
		if (closed) { delete state.windows[id]; continue; }
		if (_rapierNotesWindowStart(grid, id, files)) void _rapierNotesWindowFill(grid, id);
	}
	// The OTHER label is hidden exactly while Other is the only section on screen: with only
	// uncategorised notes it names nothing. The cards stay, only the word goes. While reorder is on
	// it shows again, because a section with no head is a section a finger cannot move.
	const othersSection = state.grids.others?.parentElement;
	if (othersSection) {
		// `skills` is on whenever the skills door is on and says nothing about whether a note has been
		// filed, so it is excluded here by name: the label appears only once a note is pinned or filed
		// in another section.
		const alone = !ids.some(id => id !== 'others' && id !== 'skills' && !state.grids[id]?.parentElement?.hidden);
		const othersHead = othersSection.querySelector('.rapier-notes-section-head');
		if (othersHead) othersHead.hidden = alone && !state.reorder;
	}
	if (typeof _rapierNotesLibraryChips === 'function') _rapierNotesLibraryChips();
	if (typeof _rapierNotesLibraryBarPaint === 'function') _rapierNotesLibraryBarPaint();
	_rapierNotesReorderBarPaint();
	// The chips can change height as the person's own sections come and go, so the room the bars
	// hold above the cards is settled after they are drawn, never guessed at before.
	_rapierNotesBarRoom();
	_rapierNotesFabTrack();
	if (state.query) {
		const partial = _rapierNotesLibraryPartial();
		const reading = state.reading && !state.reading.complete;
		// The four frozen stages and their words come from layout/transient-lifecycle.mjs's notice
		// owner, so the count in the sentence is one the owner validated against its own facts. When it
		// cannot describe the run truthfully it says nothing, and the line below is the sentence this
		// surface has always said.
		const notice = typeof _rapierNotesLibraryNotice === 'function' ? _rapierNotesLibraryNotice() : null;
		_rapierNotesStatus(matches + (matches === 1 ? ' matching note.' : ' matching notes.') +
			(reading ? ' Still reading notes.'
				: notice ? ' ' + notice.message
				: partial ? (partial.unread ? ' Some notes could not be searched.' : ' Still searching notes.') : ''));
	} else _rapierNotesStatus('');
}
function _rapierNotesStatus(message) {
	const region = _rapierNotes.surface.querySelector('#rapier-notes-status');
	if (region.textContent !== message) region.textContent = message;
}
// Sort by (the kebab): Custom is the person's own order, the default; the two date sorts read the
// entry's stamps (created at capture or import, modified at every save) and never rewrite the keys.
// The five orders, in the words the menu uses, so anything that has to NAME the order a person
// chose says the same thing the menu said.
const RAPIER_NOTES_SORT_WORDS = {custom: 'hand', created: 'date created', modified: 'date modified'};
function _rapierNotesSorted(files) {
	const state = _rapierNotes, M = _rapierNotesModel(), sort = _rapierNotesSortMode();
	// A search with words in it is answered in the module's ranked order; a chip alone is a browse.
	if (typeof _rapierNotesLibraryRanked === 'function' && typeof _rapierNotesLibraryWordy === 'function' && _rapierNotesLibraryWordy()) return _rapierNotesLibraryRanked(files);
	if (sort === 'created' || sort === 'modified') {
		const stamp = f => Number(state.index.notes[f]?.[sort]) || 0;
		return files.slice().sort((a, b) => stamp(b) - stamp(a));
	}
	// By when the note is next due. A note with no reminder is not "due at the beginning of time":
	// it has no place in this order at all, so the reminded ones come first, soonest first, and the
	// rest keep the order they were already in behind them.
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
function _rapierNotesPref(field, fallback) { try { const v = RapierPreferences.read(field); return v == null ? fallback : v; } catch (_) { return fallback; } }
function _rapierNotesSetPref(field, value) { try { RapierPreferences.write(field, value); } catch (_) {} }

// ---- Notes' own chrome while a note is open -----------------------------------------------------
// A note is composed INSIDE Notes. The editor is the one editor -- same engine, same toolbar, undo
// and redo where they always are -- and the page wears Notes' chrome while a note is open: the way
// back is a plain left arrow at the left, the note's own controls sit at the right, and the
// document's filename control, its find and its settings kebab are not offered
// (editor/styles/rapier-notes.css). The one deliberate way out is the cards' kebab Editor row, which
// asks for the document itself and turns the mode off.
// Archive is a row in the kebab sheet; the head's order is the markup's (editor/ui.html): plus (the
// attach menu), bell, pin, kebab. The bell shows only in the Android app.
const RAPIER_NOTES_HEAD_BTNS = ['btn-notes-plus', 'btn-notes-remind', 'btn-notes-pin', 'btn-notes-kebab'];
function _rapierNotesMode(on) {
	const state = _rapierNotes;
	state.mode = !!on;
	if (!on && typeof _rapierRecorderClosePlayers === 'function') _rapierRecorderClosePlayers(); if (typeof _rapierAttachmentsClose === 'function') _rapierAttachmentsClose();
	document.body.classList.toggle('rapier-notes-mode', !!on);
	const back = document.getElementById('btn-notes-back'); if (back) back.hidden = !state.current;
	if (on) _rapierNotesMarkupGlyphs();
	for (const id of RAPIER_NOTES_HEAD_BTNS) { const el = document.getElementById(id); if (el) el.hidden = !on || (id === 'btn-notes-remind' && !_rapierNotesIsApp()); }
	// While a note is open its pictures lay themselves out as a collage; when it closes, every mark
	// this put on the editor's own blocks comes off again.
	_rapierNotesPicAttach(!!on);
	// Task #369: the note's first line reads and edits as its Title field while the note is in Notes.
	_rapierNotesHeadAttach(!!on);
	_rapierNotesHeadPaint();
}
// The head says what the note's entry says -- a worn pin, a set reminder, the archive's own word --
// so the chrome and the sheet can never say the opposite of each other.
function _rapierNotesHeadPaint() {
	const state = _rapierNotes, entry = state.current ? state.index?.notes[state.current] : null;
	// The same for the bell the CARDS' selection bar carries: the same face, the same fill. The
	// surface wears the state so one rule in the stylesheet can answer for both bells.
	state.surface?.classList.toggle('rapier-notes-surface--remind', state.sheetMode === 'remind' && !!state.sheet?.classList.contains('rapier-notes-sheet--open'));
	const wear = (el, on) => { if (!el) return; if (on) el.dataset.active = 'true'; else delete el.dataset.active; };
	// An open coloured note's colour is applied to the bar at the top, while the editor below keeps
	// its own ground and ink for contrast. The bar wears the note's mate for the theme (the cards'
	// own pairs, editor/styles/rapier-notes.css). It comes with the note and goes with it, and
	// follows a colour picked from inside the note, because this painter runs after every act on the
	// open note.
	const bar = document.querySelector('.top-bar');
	if (bar) {
		// Only while the note is the surface on screen: under the cards the bar is bare again, so the
		// colour arrives with every lift and leaves with every Back.
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
	// While the reminder's face is up -- and the date picker lives inside that face, so the two are
	// one condition -- the bell SHAPE fills, pure white in the dark and pure black in the light
	// (--color-icon), never an accent tint. A reminder that is SET keeps the worn mark the head has
	// always given it.
	const remind = document.getElementById('btn-notes-remind');
	wear(remind, !!entry?.remind);
	if (remind) {
		const up = !!(state.compose && state.sheetMode === 'remind' && state.sheet?.classList.contains('rapier-notes-sheet--open'));
		if (up) remind.dataset.notesFilled = 'true'; else delete remind.dataset.notesFilled;
	}
}
// The whole page. With the colour mode on 'page', an open coloured note's ground is its colour too:
// one layer under the whole screen (.rapier-notes-ground, the note's mate for the theme) over which
// the bar and the editor stand transparent, so one colour runs from the top of the screen to its foot,
// and the editor wears the tint's tokens so the note's words are the pure ink
// (editor/styles/rapier-notes.css). The layer is there while the note is the one open, under the cards
// too -- out of sight there, and already in place for the lift's way back and the next open -- and
// goes with the mode, the colour or the note. A colour picked from inside the note washes the old
// ground away over the new: the old layer's opacity alone, on the compositor, under the words, which
// do not change; a colour given to a note that had none comes in over the page's own ground the same
// way, and one taken off goes out to it.
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
		// The new ground goes under the old one, which is the one that leaves.
		if (old) old.before(ground); else document.body.appendChild(ground);
	}
	state.groundEl = ground;
	// The bar stands clear over the ground while any ground is on the screen, the leaving one included.
	const paged = () => document.body.classList.toggle('rapier-notes-paged', !!state.groundEl || !!document.querySelector('.rapier-notes-ground'));
	paged();
	// Seen: the note is the surface on the screen, with no lift over it and nothing to hold still for.
	// Anywhere else the change is made at once, out of sight.
	const seen = !state.open && !state.liftOpen && !state.liftBack && !_rapierNotesStill();
	if (!seen) { old?.remove(); paged(); return; }
	if (!old) { ground?.animate([{opacity: 0}, {opacity: 1}], {duration: RAPIER_NOTES_WASH_MS, easing: 'linear'}); return; }
	// From the strength it stands at: a ground still coming in when the colour changed again leaves
	// from there, never from whole.
	const wash = old.animate([{opacity: Number(getComputedStyle(old).opacity)}, {opacity: 0}], {duration: RAPIER_NOTES_WASH_MS, easing: 'linear', fill: 'forwards'});
	const gone = () => { old.remove(); paged(); };
	wash.finished.then(gone, gone);
}
// The head's own controls act on the open note through the cards' own acts: the selection is the
// one note for the length of the act, and nothing here is a second implementation.
async function _rapierNotesHeadAct(act) {
	const state = _rapierNotes, file = state.current;
	if (!file || !state.index?.notes[file]) return;
	state.selected.clear(); state.selected.add(file);
	await _rapierNotesAct(act);
	state.selected.clear();
	_rapierNotesHeadPaint();
}
// The kebab at the top right while a note is open: the house bottom sheet, up from the foot over
// the note itself, holding the note's own options. The sheet is the cards' own sheet and every row
// is an act that already exists; the surface behind it is only the scrim.
function _rapierNotesNoteSheet(mode) {
	const state = _rapierNotes, file = state.current;
	if (!file || !state.index?.notes[file]) return;
	// The note's bell is the Android app's alone, and so is its face.
	if (mode === 'remind' && !_rapierNotesIsApp()) return;
	_rapierNotesEnsure();
	state.compose = true;
	state.surface.classList.add('rapier-notes-surface--over');
	state.surface.classList.remove('rapier-notes-surface--in');
	state.surface.hidden = false;
	if (!state.open) _rapierNotesFence(true);
	// The control that opened this face is the one that says it is open: the kebab for the note's own
	// rows, the plus for the attach sheet.
	(state.sheetOpener = document.getElementById(mode === 'add' ? 'btn-notes-plus' : 'btn-notes-kebab'))?.setAttribute('aria-expanded', 'true');
	state.selected.clear(); state.selected.add(file);
	state.sheetMode = mode || 'actions';
	// The focus goes into the sheet (the sheet's own rule): the editor behind it is inert while it
	// is up, so a keyboard that stayed on the kebab would have nowhere to go and no Escape.
	state.sheetFocus = true;
	_rapierNotesOpenSheet();
}
// Keep's "Find in note": the editor's own find, pressed for the person -- Notes' chrome does not
// offer the find button itself, and there is no second finder.
function _rapierNotesFindInNote() {
	const btn = document.getElementById('btn-find'); if (!btn) return;
	if (btn.getAttribute('aria-expanded') === 'true') return;
	btn.click();
}

// ---- The Title field ----------------------------------------------------------------------------
// The title is shown as an input separate from the body, as Keep shows Title and Note. A Rapier note
// is one plain Markdown file, so the two fields are that file's own first line and the rest, read by
// the model's one rule (notes/model.mjs cardHead and noteHead): the title is the first line of words
// when it is a level-one heading. While a note is open in Notes the title block wears the card's own
// big title, and an empty field shows its word -- Title, and Note under it -- drawn by the
// stylesheet (editor/styles/rapier-notes.css), never a byte in the file.
//
// The editor stays the one editor: every word is typed into its own blocks, with its own caret, IME
// and Undo. An empty Title field is an empty paragraph made where the title goes, holding no bytes;
// the first words typed into it make it the heading they are, through the editor's own heading
// command (the one its heading picker runs), and a title emptied again goes back to that empty
// paragraph, so an emptied title never leaves a lone `#` in the file. The empty paragraph this
// module makes (for the Title field, or for the Note field under a title) is `dirty`, so when the
// person leaves it empty the editor takes it away as it takes away any empty block a person left,
// and until then the autosave compares the note without it: tapping a field and going back writes
// nothing.
function _rapierNotesHeadOn() {
	const state = _rapierNotes;
	return !!(state.mode && state.current && rapier.document.docKind === 'markdown' && rapier.view.mode !== 'source' && !rapier.compare.active);
}
// A block holds words when its Markdown does, or -- for the block being typed in, `editing` -- when its
// live surface does (the Markdown catches up at the typing burst's checkpoint). A picture is words.
function _rapierNotesHeadWords(block, editing) {
	const edit = editing && Number(editing.dataset.blockId) === block?.id ? editing.querySelector(':scope > .block-edit') : null;
	return edit ? !!(edit.textContent.trim() || edit.querySelector('img,svg,video,audio,iframe,table,hr,input')) : !!String(block?.raw || '').trim();
}
function _rapierNotesHeadRow(kind) {
	// A button, sealed out of the blocks' editable host like the to-do handle, its word the
	// stylesheet's; a press is the row's alone, so the editor's own tap never also lands under it.
	const row = _rapierNotesEl('button', 'rapier-notes-slot rapier-notes-slot--' + kind);
	row.type = 'button'; row.contentEditable = 'false'; row.dataset.notesSlot = kind;
	row.setAttribute('aria-label', kind === 'title' ? 'Title' : 'Note');
	for (const type of ['pointerdown', 'mousedown']) row.addEventListener(type, event => { event.preventDefault(); event.stopPropagation(); });
	row.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); _rapierNotesHeadTap(kind); });
	return row;
}
function _rapierNotesHeadLay(host) {
	const H = _rapierNotes.head, M = _rapierNotesModel();
	let title = null, note = null, titleAt, noteAt; // a row's place: the wrapper it stands before, null for the end
	if (_rapierNotesHeadOn() && typeof M?.noteHead === 'function') {
		// Wrappers are looked up only where the head is, never the whole note: this runs as the note changes.
		const blocks = rapier.document.blocks, editing = host.querySelector(':scope > .block-wrapper--editing');
		const wrapper = i => blocks[i] ? host.querySelector(':scope > .block-wrapper[data-block-id="' + blocks[i].id + '"]') : null;
		const head = M.noteHead(blocks.map(b => String(b.raw || '')));
		let at = head.title;
		// The empty Title field: the paragraph made for it, while it stands where the title goes and
		// holds no words -- or while the person is still typing its first word, which a keyboard's
		// composition makes the heading only when the word is done (_rapierNotesHeadTurn).
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
		// Only a row out of place moves: a row the editor's host already holds where it belongs is
		// left alone, so a scan with nothing to change writes nothing.
		const placed = row.parentNode === host && next(row) === at && (row !== noteRow || titleAt !== noteAt || noteRow.previousElementSibling === titleRow);
		if (!placed) host.insertBefore(row, at);
	}
}
function _rapierNotesHeadScan() {
	const H = _rapierNotes.head, host = document.getElementById('editor-blocks'); if (!host) return;
	// The scan's own writes (a row placed) must not wake it again; the classes are attributes.
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
// The empty paragraph a field is typed into, made through the editor's own insertion and entered
// with its own caret: the Title field where the title goes (after the pictures the note opens with,
// before everything else), the Note field at the end, under the title.
function _rapierNotesHeadTap(kind) {
	const H = _rapierNotes.head, M = _rapierNotesModel();
	if (!_rapierNotesHeadOn() || rapier.access.readOnly) return;
	// A tap from the title into the body must always land. A phone keyboard keeps the last word typed
	// in composition until a space, and the row's own press keeps the focus in the Title (so the
	// editor's tap never lands under it) -- so the keyboard never ends its word, and the editor would
	// refuse the row's insertion as a mutation during a composition. The word is ended here first:
	// the field is left, which ends the word where the browser says so, and where it has not said so
	// by then (Chromium under a set composition; a phone keyboard some of the time -- and the editor
	// holds a field's blur open while a composition stands, so nothing would ever end it) the
	// editor's own end is called for it, the word being on the page already. Then the tap is taken; a
	// tap the editor still refuses after that is refused as before.
	if (_rapierUserMutationBlocked(false)) {
		const editing = rapier.composition.block && !H.retap ? document.querySelector('#editor-blocks > .block-wrapper--editing .block-edit') : null;
		if (!editing) { _rapierUserMutationBlocked(); return; }
		H.retap = true;
		try { editing.blur(); } catch (_) {}
		if (rapier.composition.block) _rapierHandleEditCompositionEnd(editing);
		// A word ended by the editor's hand fires no compositionend, so the head's own act on that event -- the
		// Title's first word made its heading (_rapierNotesHeadTurn) -- is taken here as well; where the browser
		// ended the word itself the heading is made already, and the turn asks nothing twice.
		_rapierNotesHeadTurn();
		// The word is in the field and not yet in the note (its checkpoint waits for the burst's end), so the
		// head would read a Title with nothing in it and put the new line above the word: the checkpoint the
		// field takes on its own press is taken here (editor/engine.js _rapierCheckpointEdit), and the head
		// reads the title with the word in it.
		_rapierCheckpointEdit(editing);
		setTimeout(() => { H.retap = false; if (_rapierNotesHeadOn() && !_rapierUserMutationBlocked(false)) _rapierNotesHeadTap(kind); else _rapierUserMutationBlocked(); }, 0);
		return;
	}
	// A field still being typed in is checkpointed before the head is read, for the same reason.
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
// A note's sheet is its body's tap target, as a notes app's is: a tap on the bare sheet under the title, under the body's last line and down to the
// sheet's foot, puts the caret at the end of the body with the keyboard up. A tap on the title still edits the title, and a tap in a
// gap between two of the body's blocks keeps the editor's nearest line (editor/engine.js, the host's click, which calls this first).
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
	// A word still composing in the title is ended first, as the Note row's tap ends it (_rapierNotesHeadTap), and the tap then taken.
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
// The caret at the end of the body: in the empty Note line where one stands, made where the Note row stands, else after the last
// block's words (or on a new line after a block that holds none: a picture, a table, a fence, a recording).
function _rapierNotesBodyEnd(host) {
	const empty = host.querySelector(':scope > .block-wrapper.rapier-notes-note'), emptyBlock = empty && _rapierBoundBlock(empty);
	if (emptyBlock) return !!enterBlockEdit(emptyBlock, empty, {charOffset: 0, preserveScroll: true});
	if (host.querySelector(':scope > [data-notes-slot="note"]')) { _rapierNotesHeadTap('note'); return true; }
	const last = _rapierShownWrappers(host).at(-1), block = last && _rapierBoundBlock(last);
	if (!block || last.classList.contains('rapier-notes-title')) return false;
	if (_rapierBlockHoldsWords(block) && !_rapierLoneControlBlock(block)) return !!enterBlockEdit(block, last, {charOffset: Infinity, preserveScroll: true});
	return _rapierMakeEdgeParagraph(block, true);
}
// A note made at the NOTE door opens on its one empty paragraph with the caret in it
// (_rapierNotesNew): that paragraph is the Title field.
function _rapierNotesHeadStart() {
	const H = _rapierNotes.head, block = rapier.document.blocks.length === 1 ? rapier.document.blocks[0] : null;
	if (!block || String(block.raw || '').trim()) return;
	block.dirty = true; H.slot = H.fresh = block.id;
	_rapierNotesHeadScan();
}
// A new drawing that lands at the head of a note with no title leaves the caret on an empty line under
// it (draw/draw.js _rapierDrawReadyForWords). That line stands where the Title field stands, so it is
// the Title field: the words typed next are the note's title, as the NOTE door's are, and the Title
// word shows until they come. A line anywhere else under a drawing is body, and is left alone.
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
// The words typed into the Title field are its heading; a title emptied is the empty field again.
// Never inside a keyboard's composition (a word in progress is the IME's, and the editor's own Enter
// owner waits for it the same way): the heading is made when the word is done. Made once: from then
// on the heading is the title by the model's rule, and the field lets go of the block (`slot`), so a
// title the person turns into body text with the style picker stays body text as they type on.
function _rapierNotesHeadTurn() {
	const H = _rapierNotes.head, host = document.getElementById('editor-blocks');
	if (!host || !_rapierNotesHeadOn() || rapier.composition.block) return;
	const wrapper = host.querySelector(':scope > .block-wrapper--editing.rapier-notes-title');
	const block = wrapper ? _rapierBoundBlock(wrapper) : null, edit = wrapper?.querySelector(':scope > .block-edit');
	if (!block || !edit) return;
	const heading = !!edit.querySelector('h1'), words = !!edit.textContent.trim();
	// Either act re-renders the block, which the scan's own observer sees.
	if (!heading && words && block.id === H.slot) { if (rapierFmt('h1') !== false) H.slot = null; }
	else if (heading && !words && rapierFmt('p') !== false) { const kept = rapier.document.blocks.find(b => b.id === block.id); if (kept) { kept.dirty = true; H.slot = H.fresh = kept.id; } }
}
// Enter in the Title field, ahead of the editor's own Enter owner (a document capture listener, so
// this listens on the window). Words not yet made the heading are made it first, so the editor's
// split then parts a title from the body under it however the keyboard delivered the word (a phone
// keyboard ends its composition only as its Enter arrives); in an empty field nothing is split or
// made -- the same empty line is the Note field from then on, Keep's own Enter from Title to Note.
function _rapierNotesHeadEnter(event) {
	const H = _rapierNotes.head;
	if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.shiftKey || H.slot == null) return;
	if (event.type === 'keydown' ? event.key !== 'Enter' : event.inputType !== 'insertParagraph') return;
	if (!_rapierNotesHeadOn() || rapier.composition.block) return;
	const wrapper = document.querySelector('#editor-blocks > .block-wrapper--editing.rapier-notes-title');
	const block = wrapper ? _rapierBoundBlock(wrapper) : null, edit = wrapper?.querySelector(':scope > .block-edit');
	if (!block || !edit || block.id !== H.slot || edit.querySelector('h1')) return;
	if (edit.textContent.trim()) { if (rapierFmt('h1') !== false) H.slot = null; return; }
	event.preventDefault();
	H.slot = null;
	_rapierNotesHeadScan();
}
// The note's text without the empty field the caret stands in, when it does; null otherwise. The
// autosave compares this with the file, so an empty field is never written; the flush leaves it
// first (_rapierNotesHeadSettle), and then the note is exactly its own words again.
function _rapierNotesHeadIdle() {
	// The autosave asks on every tick, and almost always no field was made: that answer reads no DOM.
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
	// A note opening (Notes keeps its mode on while the cards are over the last note) and Notes closing
	// both start with no field made: block ids from another note mean nothing in this one.
	H.slot = H.fresh = null;
	if (!host) return;
	if (!on) { _rapierNotesHeadLay(host); return; }
	if (H.bound !== host) {
		H.bound = host;
		host.addEventListener('input', event => { if (!event.isComposing && !/^(?:format|history)/.test(event.inputType || '')) _rapierNotesHeadTurn(); });
		host.addEventListener('compositionend', () => { setTimeout(_rapierNotesHeadTurn, 0); });
		for (const type of ['keydown', 'beforeinput']) window.addEventListener(type, _rapierNotesHeadEnter, true);
	}
	H.observer = new MutationObserver(_rapierNotesHeadSoon);
	_rapierNotesHeadScan();
}

// ---- Opening a note in the editor, and saving it back --------------------------------------------
// The note's address (editor/engine.js _rapierPublishDocumentUrl owns the document's): `#n/<the
// sidecar's id>`, written over the note's own history entry, so Back pops to the cards' entry, which
// keeps the document's address under them. The id is the folder's, stable across the devices Sync will
// carry the folder to; a note's document authority is minted per open and would not be.
function _rapierNotesPublishUrl(file) {
	const id = _rapierNotes.index?.notes[file]?.id;
	if (!id || typeof _rapierBootPathAndQuery !== 'function' || globalThis.RAPIER_APPS_HOST === true) return;
	if (typeof _rapierEmbed !== 'undefined' && (_rapierEmbed.active || _rapierEmbed.local)) return;
	try { history.replaceState(history.state, '', _rapierBootPathAndQuery() + '#n/' + encodeURIComponent(id)); } catch (_) {}
}
// A note's own address opened: the cards come up and that note opens over them, so Back is the
// cards, as ever. A note the folder does not hold is said so; nothing is made in its place.
async function _rapierNotesOpenById(id) {
	const state = _rapierNotes;
	await _rapierNotesOpen();
	if (!state.open || !state.index) return false;
	// The address's note is a convenience scheduled at start-up, and it yields to a person who opened
	// a note while it waited -- on the folder's read, or on the storage question their own open of
	// Notes answered. Opening over them anyway would end their way back from that note in one frame,
	// the open's first act.
	if (state.current || state.mode || state.liftOpen || state.liftBack) return false;
	const file = Object.keys(state.index.notes).find(f => state.index.notes[f]?.id === id && !state.index.notes[f]?.trashed);
	if (!file) { showToast('That note is not in this notes folder.', 'info'); return false; }
	return await _rapierNotesOpenNote(file, false, id) === true;
}
// `under`: a lift already standing for this open (the + bar's DRAW door's), which the cards close
// under once it covers them, as they do under a card's own.
// While a note opens, the cards' fence stays up for agents (rapierNotesStanding's busy): the open certifies the
// document under the cards and refuses itself if that document moves.
async function _rapierNotesOpenNote(...args) {
	const state = _rapierNotes;
	state.noteOpening = (state.noteOpening || 0) + 1;
	try { return await _rapierNotesOpenNoteNow(...args); } finally { state.noteOpening--; }
}
async function _rapierNotesOpenNoteNow(file, capture = false, expectedId = null, under = null) {
	// A note opened by anything but a followed link, or the way back along one, starts a trail of its own (_rapierNotesBackFromNote).
	if (_rapierNotes.trailKeep !== true) _rapierNotes.noteTrail = [];
	_rapierNotes.trailKeep = false;
	if (!capture && !await _rapierNotesUnlock()) return;
	const state = _rapierNotes;
	if (state.returning) return false;
	if (state.returnRefused) { showToast('Return to Rapier again to finish restoring your document.', 'error'); return false; }
	if (typeof rapierLoad !== 'function') return;
	// Keep's opening: the card the person tapped travels into the note's bar (or grows into its page)
	// from the moment of the tap, while the note's bytes are read under it; the note comes in once it
	// is loaded. Dropped if the open is refused or a question has to be asked first.
	const from = state.openFrom && state.openFrom.file === file ? state.openFrom : null; state.openFrom = null;
	if (typeof _rapierNotesLiftCancel === 'function') _rapierNotesLiftCancel();
	let lift = from && state.open ? _rapierNotesLiftGrow(from) : under;
	let guard;
	try { guard = await _rapierNotesFlush(); } catch (_) { lift?.drop(); return; }
	let widgetRead = null;
	if (expectedId) {
		widgetRead = await _rapierNotesStore.folder.read({bodies: [file]});
		if (widgetRead.index.notes[file]?.id !== expectedId || widgetRead.index.notes[file]?.trashed) {
			lift?.drop(); showToast('This note moved or was removed. Refresh the widget.', 'info'); return false;
		}
	} else await _rapierNotesTexts([file]);
	if (!_rapierMutationStampIsCurrent(guard)) { lift?.drop(); showToast('The open document changed; open the note again when ready', 'info'); return; }
	if (!widgetRead && state.unreadable?.has(file)) { lift?.drop(); showToast('This file is not text Rapier can read, so it was not opened; it is left as it is.', 'error'); return; }
	let text = state.texts.get(file);
	if (widgetRead) {
		try { const bytes = widgetRead.bodies.get(file); if (!bytes) throw new Error('missing'); text = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes); }
		catch (_) { lift?.drop(); showToast('This note could not be read. Its file is left as it is.', 'error'); return false; }
	}
	if (text == null) { lift?.drop(); return; }
	const proof = {file, id: widgetRead ? expectedId : state.index.notes[file]?.id, digest: await globalThis.RapierNotesIntegrity.sha256(text)};
	// The document underneath is never asked about: a document in the main view can stay there while
	// a note is created and is recovered separately from the notes. It is kept twice instead: the
	// return record below brings it back, words, history and reading point, when the person leaves
	// Notes; and its own recovery record is written durably here first, so a page that dies inside a
	// note still opens on it -- a note is never journaled in its place (editor/engine.js, the notes:
	// authority rule).
	if (!state.current && typeof rapierFlushDirty === 'function') {
		let kept = false;
		try { kept = await rapierFlushDirty({ snapshot: true, durable: true }) === true; } catch (_) {}
		// The return record below lives in memory. A dirty document needs a kept copy before
		// Notes takes the editor and recovery stops following the document underneath it.
		if (!kept && _rapierIsDirty()) {
			lift?.drop();
			showToast('Your document could not be kept. Save it, then open the note again.', 'error');
			return false;
		}
		if (!_rapierMutationStampIsCurrent(guard)) { lift?.drop(); showToast('The open document changed; open the note again when ready', 'info'); return; }
	}
	// What the person came from, read BEFORE anything replaces it. This used to be called after
	// the load below, where `rapier.document.filename` is already the NOTE's name -- which is in
	// `state.index.notes`, so `_rapierNotesRemember` took its "a note is not something to come
	// back to" branch and set `cameFrom = null` on every single open. The feature has never once
	// worked: leaving Notes always handed back the empty document Rapier starts with, whatever
	// the person had been writing. The guard inside it ("only the FIRST entry is remembered")
	// could not help, because the first call was already too late.
	// The last words typed into the editor's document are still in the block being edited until
	// the block is left; the return record must hold them, so the pending edit is settled first
	// (a load would settle it too, but only after the record below has been taken).
	if (!state.current && typeof _rapierCommitPendingHistory === 'function') { try { _rapierCommitPendingHistory(); } catch (_) {} }
	let suspended;
	try { suspended = _rapierNotesRemember(); }
	catch (error) { lift?.drop(); showToast('The open document could not be kept for return: ' + String(error?.message || error), 'error'); return false; }
	// The note that is already the open document beneath the cards (flushed above, so the folder
	// and the editor agree) is shown again as it stands -- its undo ledger, its caret -- never
	// reloaded: one owner (a reload would drop the history the card's own tick just wrote to).
	const already = _rapierNotesOwnTheDocument() && state.current === file && String(rapier.document.filename || '') === file && _rapierSourceText() === text;
	// The note is loaded WHILE the card grows, not after it: awaiting `lift.grown` first would leave
	// the plate at full screen, blank, until rapierLoad finished. The plate covers the editor for the
	// whole of both either way, so this only moves the work UNDER the animation instead of queueing
	// it behind. Nothing else moves: the cards still report open across the load (the agent's fence),
	// and the close and the fade still come after.
	if (!_rapierMutationStampIsCurrent(guard)) { lift?.drop(); showToast('The open document changed; open the note again when ready', 'info'); return; }
	// Load the note while the cards still report open, so the agent's notes_library_open fence covers
	// the whole lift: closing first would drop the fence while rapierLoad was still in flight, and a
	// handle minted against the hidden document could still write it. If the load is refused, the
	// cards stay -- the person is not dumped onto a half-mutated letter.
	if (!already) {
		const loaded = await rapierLoad(text, file, {expectedMutationStamp: guard, returnReceipt: true, deferFlush: true, documentAuthority: 'notes:' + _rapierCreateDocumentAuthority()});
		if (!loaded || !_rapierLoadReceiptIsCurrent(loaded)) { lift?.drop(); showToast('This note could not be opened', 'error'); return; }
		state.cameFrom = suspended;
		state.current = file; state.currentProof = proof; state.savedGen = Number(rapier.revision.generation || 0); state.savingGen = -1; state.savingText = null;
		_rapierNotesMarkClean();
		// The load just replaced the document's own identity (a new epoch, at least): the guard
		// taken before it can never read as current again and would refuse every ordinary open of
		// a different note. What the wait below must catch is a change DURING the animation, so the
		// guard is retaken here, the moment the load itself is done.
		guard = _rapierMutationStamp();
	}
	// The head swap and the editor's first layout run BEFORE the wait: the cards' own surface is over
	// the app's top bar and over the editor, so a head swapped and a page laid out underneath it
	// cannot be seen, and doing them after the wait leaves the full-screen plate showing nothing for
	// a visible moment. The CLOSE stays after the wait: the cards stay under the plate for the whole
	// grow, and when the plate lands there is only the close and the fade left. (Closing earlier
	// makes the cards vanish to black the moment the plate starts growing.)
	// The page is in Notes from here: the head is the note's own.
	_rapierNotesMode(true);
	// The note's bar is laid out now: the lift's controls land on it.
	lift?.bar?.();
	_rapierNotesHistory('note');
	_rapierNotesPublishUrl(file);
	// Now whatever is left of the motion: the cards must be fully under the page's ground before they
	// close. A load that outran it waits here for a few frames; a load that took longer has spent them.
	if (lift) await lift.grown;
	if (!_rapierMutationStampIsCurrent(guard)) { lift?.drop(); _rapierNotesMode(false); showToast('The open document changed; open the note again when ready', 'info'); return; }
	// The cards' scroll is kept for the way back (a hidden scroller forgets its offset).
	state.scrollKept = state.scroll ? state.scroll.scrollTop : 0;
	// A window that does not own the notes folder cannot keep a change to this note, so it does not
	// offer to take one. The editor's own read-only is the mechanism -- rapierSetReadOnly composes
	// the document's lease, the host's own read-only and this -- and it is the same thing a person
	// already sees when another tab holds the document. Set after the load, because a load decides
	// the view mode for itself.
	_rapierNotesClose(true, true);
	lift?.fade();
	if (!state.autosave) state.autosave = setInterval(_rapierNotesAutosave, RAPIER_NOTES_AUTOSAVE_MS);
	// The to-do interface (notes/todo.js) decorates the note's checklists from here on.
	if (typeof _rapierTodoInit === 'function') { try { _rapierTodoInit(); } catch (_) {} }
	if (typeof _rapierRecorderInit === 'function') _rapierRecorderInit(); if (typeof _rapierAttachmentsInit === 'function') _rapierAttachmentsInit();
	return true;
}
// OPEN AS DOCUMENT, from both kebab sheets: the note opens in the main editor as a copy, where it can
// be exported to other formats. The note's words, read as the note's own open reads them (its last
// typing settled into the folder first), leave Notes the way the arrow does -- the document the person
// came from back in the editor -- and then come in through the editor's own door for a file, as a
// document of its own under the note's name with no file behind it (Save As or an export makes one) and
// no notes authority, so nothing done to it in the editor reaches the note. That door asks nothing over
// unsaved changes, as for any file: the document it replaces is set aside in the held slot and offered
// as a file until the person has it. The note in the folder is untouched.
async function _rapierNotesOpenAsDocument(file) {
	if (typeof rapierOpenPlatformPayload !== 'function') return false;
	_rapierNotesCloseSheet();
	try { await _rapierNotesFlush(); } catch (_) { return false; }
	const text = (await _rapierNotesTexts([file], {hold: false})).get(file);
	if (typeof text !== 'string') { showToast('The note could not be read. Nothing was opened.', 'error'); return false; }
	if (!await _rapierNotesEditor()) return false;
	// A document or code file kept in Rapier is not copied: it opens bound to its kept file, so Save and AutoSave
	// write it there (shell/platform.js). A note opens as the copy described above.
	if (_rapierNotesKeptDocument(file)) return await rapierOpenPlatformPayload({text, name: file, rapierKept: await _rapierNotesKeptRecord(file, text)}) === true;
	return await rapierOpenPlatformPayload({text, name: file, transient: true}) === true;
}
// KEEP IN RAPIER: the notes folder is a place the editor saves to and opens from, beside the device.
// shell/platform.js owns the destination and the binding and asks here for the folder's own operations: a Markdown
// document is kept as a note marked a document, a code file as its exact bytes, and every write is the owner's
// guarded save, so a kept file changed elsewhere is never written over (the newer words stay, this save is kept
// beside them as "<name> kept").
function _rapierNotesKeptDocument(file) {
	const entry = _rapierNotes.index?.notes?.[file];
	return !!entry && (_rapierNotesModel().isCodeFile(file) || entry.kind === 'document');
}
async function _rapierNotesKeptRecord(file, text) {
	return {file, id: _rapierNotes.index.notes[file]?.id || null, digest: await globalThis.RapierNotesIntegrity.sha256(text)};
}
globalThis.RapierNotesKeep = Object.freeze({
	available() { return !!globalThis.RapierNotesModel && !!globalThis.RapierNotesIntegrity; },
	// The question is asked only where syncing is on, and it names what is true, the person's own cloud storage,
	// never "Rapier"; without sync, Save and Open are the device's, no question.
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
	// A kept file's words as the folder holds them now, byte-order mark and all (null when absent).
	async read(file) { await _rapierNotesStore.kind(); return _rapierNotesStore.read(file); },
	show() { return _rapierNotesOpen(); },
	// AutoSave's beat: the editor's own Save, for the document the platform found kept, and no other.
	saveCurrent(authority) { return String(rapier.identity.authority || '') === String(authority || '') && !!authority ? rapierSave({quiet: true}) : false; },
});
// SHARE: OPEN AS DOCUMENT, then the editor's own settings panel and, over it, its own Share dialog (the
// panel's SHARE action, called, not copied), so the dialog, its choices and what they do where the
// platform cannot share are the editor's, and a person who leaves the dialog is in the panel with DOCX
// and every other door. Only once the copy is the document: if the person kept the one it would have
// replaced, the dialog would share that one instead.
async function _rapierNotesShareAsDocument(file) {
	if (!await _rapierNotesOpenAsDocument(file)) return;
	if (typeof _rapierUiSetSettingsOpen === 'function') _rapierUiSetSettingsOpen(true);
	if (typeof _RAPIER_UI_ACTIONS === 'object') _RAPIER_UI_ACTIONS['open-share-menu']?.();
}
// A note the circle made is note.md until it has a word; then, once, it takes the name its words
// give it (the same rule the capture bar used: notes/model.mjs noteFileName), so the folder reads
// as the person's notes do. The order never risks the work: the new file is written first, the
// editor is asked to take the new name (a refusal leaves everything as it was, tried again next
// tick), the index follows, and the old file goes last. A failure after the editor has the new
// name is said, and nothing is lost: the words are in the folder under the new name either way.
function _rapierNotesNameByWords(file, text) {
	const state = _rapierNotes, M = _rapierNotesModel();
	if (state.renaming) return state.renaming;
	if (!_rapierNotesBody(text).trim()) return;
	const names = Object.keys(state.index.notes), others = names.filter(n => n !== file);
	if (M.noteFileName(text, others).toLowerCase() === file.toLowerCase()) { state.untitled.delete(file); return; }
	state.renaming = (async () => {
		// A newer autosave may already be in flight on the old name. Let it land before the words are
		// captured, so the rename moves the newest durable words and never an older copy.
		await _rapierNotesStore.settle();
		if (state.current !== file || String(rapier.document.filename || '') !== file) return;
		text = _rapierSourceText(); if (!_rapierNotesBody(text).trim()) return;
		// The owner renames in one transaction (notes/folder.mjs rename): the words under the new name,
		// every note that links to the old name rewritten, the old name removed against the digest of
		// the words this window last wrote there. The linking notes are named from the link index when
		// it covers the folder; until then the owner reads them all.
		await _rapierNotesStore.kind();
		const H = globalThis.RapierNotesIntegrity, held = state.texts.get(file);
		if (held == null || held !== text) { try { await _rapierNotesSave(file, text); } catch (error) { if (!state.saveFailed) { state.saveFailed = true; showToast('The note kept its plain name: the notes folder refused ' + String(error?.message || error), 'error', {outlive: 'save-failed'}); } return; } }
		const complete = _rapierNotesTextsComplete() && typeof _rapierNotesLibraryRenameWho === 'function', wanted = M.noteFileName(text, others);
		// The editor answers to the new name first: a rename it refuses is no rename, and the folder is
		// not touched; a folder that then refuses gives the editor its old name back.
		if (state.current !== file || typeof rapierRenameDocument !== 'function') return;
		// The picker and every other reader of "the current note" compare the editor's name with the
		// folder's: while this rename is in flight they differ by design, so the wanted name is on
		// record and _rapierNotesCurrentFile accepts either (so typing during the first autosave's
		// rename does not close the [[ picker on a keystroke that lands inside the transaction).
		state.renameWanted = wanted;
		if (rapierRenameDocument(wanted) !== wanted) { state.renameWanted = null; return; }
		const linking = complete ? _rapierNotesLibraryRenameWho(file) : undefined;
		let result;
		try { result = _rapierNotesTake(await _rapierNotesStore.folder.rename({file, id: state.index.notes[file]?.id, expectedDigest: await H.sha256(text), wanted, linking})); }
		catch (error) { rapierRenameDocument(file); if (!state.saveFailed) { state.saveFailed = true; showToast('The note kept its plain name: the notes folder refused ' + String(error?.message || error), 'error', {outlive: 'save-failed'}); } return; }
		const next = result.file;
		if (next === file) { rapierRenameDocument(file); state.untitled.delete(file); return; }
		if (next !== wanted) rapierRenameDocument(next);
		if (result.dropped) showToast(result.dropped === 1 ? 'One note still points at the old name: it changed while the link was being rewritten.' : result.dropped + ' notes still point at the old name: they changed while the links were being rewritten.', 'info');
		// The editor answers to the new name from here: every bookkeeping line below is synchronous.
		_rapierNotesHold(next, text); state.texts.delete(file); state.titles.delete(file);
		// The linking notes were rewritten in the folder; what this window held of them is stale.
		for (const name of Object.keys(state.index.notes)) if (name !== next && state.texts.has(name) && name !== state.current) { state.texts.delete(name); }
		if (typeof _rapierNotesLibraryTouch === 'function') { _rapierNotesLibraryTouch(file, true); _rapierNotesLibraryTouch(next); }
		state.current = next; state.currentProof = {file: next, id: (result.index || state.index)?.notes?.[next]?.id, digest: await globalThis.RapierNotesIntegrity.sha256(text)}; state.untitled.delete(file);
		if (typeof _rapierNotesLibraryRenamed === 'function') await _rapierNotesLibraryRenamed({from: file, to: next, linking, written: result.written, dropped: result.dropped});
		// The rename wrote the captured bytes, not words typed while it waited. Only those exact
		// bytes can cover the generation introduced by the editor's own rename.
		const renamed = await _rapierCaptureSettledExternalDocument({quiet: true, passive: true});
		const renameGeneration = renamed && state.current === next && renamed.metadata.filename === next &&
			renamed.canonical === text ? renamed.generation : -1;
		state.savedGen = -1; state.savingGen = -1; state.savingText = null;
		try { await _rapierNotesRecordVersion({file: next, text, entry: state.index.notes[next], reason: 'rename'}); }
		catch (error) { state.saveFailed = true; showToast('The rename is saved; its history is not: ' + String(error?.message || error), 'error', {outlive: 'save-failed'}); return; }
		state.saveFailed = false; state.savedGen = renameGeneration;
		if (renameGeneration !== -1 && state.current === next && _rapierMutationStampIsCurrent(renamed.stamp)) _rapierNotesMarkClean();
	})().finally(() => { state.renaming = null; state.renameWanted = null; });
	return state.renaming;
}
// A note's persistence is Notes' own: its save owner marks it clean after the required writes verify,
// and the editor's Save/Save As are never required of a person for a note.
function _rapierNotesMarkClean() {
	try { rapier.revision.savedGeneration = Number(rapier.revision.generation || 0); rapier.identity.saveAsRequired = false; } catch (_) {}
}
// One version, read for the face that shows it: what it was, and what it would change. The
// comparison is the module's own line diff, which refuses rather than grinding on a note too big to
// compare -- and a refusal says so in its own words, because "too large to compare here" and "no
// differences" are opposite things to tell a person.
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
	// The lines past the cap are said, never silently left off: how many there are.
	return {id, time: row.time, reason: row.reason, first, size: row.size, current: id === read.manifest.current, words, lines, more: added + removed - lines.length};
}
const RAPIER_NOTES_DIFF_LINES = 40;
// What each of the newest rows changed (notes/history.mjs changePreview), read from the version before it: a Map of version id to a few
// words. A version whose words cannot be read says nothing; the rest of the face does not wait on it. Older rows than the newest thirty
// keep the time, the reason and the size alone: each preview is two reads of the folder's own objects.
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
// ---- The History face's own two questions: what is in this note's past, and put that back
// -------
// Reading is cheap and says what it does not know: a folder with no history for this note answers
// with an empty list, and a manifest that cannot be read says so rather than being replaced.
// ---- Retention: the past's own tidy, and never on its own
// ---------------------------------------
// The module refuses to plan without `complete: true` -- a complete, locked folder inventory --
// and maintenance needs prior explicit authorisation and a visible removal record. So tidying is a
// thing a person does, with the whole plan in front of them before a byte moves, and each note
// keeps the record of what went. Nothing here ever runs by itself, on a timer, or because a
// setting changed.
const _rapierNotesLocalDay = time => { const d = new Date(time), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
async function _rapierNotesHistoryInventory() {
	const H = globalThis.RapierNotesHistory;
	if (!H || typeof H.thin !== 'function') throw new Error('the history module did not load');
	const list = [], unreadable = [];
	for (const name of await _rapierNotesStore.historyNames('manifests')) {
		const path = 'manifests/' + name;
		const bytes = await _rapierNotesStore.readHistory(path);
		try {
			// The filename is the root Tidy will replace. Bind the claimed identity to that
			// exact root before allowing it to authorize removal of any history object.
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
	// The whole inventory or nothing. A plan made over part of a folder would free words a manifest
	// it could not read still points at -- the one way tidying could destroy what the person made.
	// This is what the module's `complete: true` means, so it is honoured rather than worked around.
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
	// What goes, what stays, and that there is no undo -- the plan's own numbers, in three short sentences.
	const sure = typeof rapierConfirm === 'function' ? await rapierConfirm({
		title: 'tidy history?',
		message: '• Removes ' + plan.removes.length.toLocaleString('en') + (plan.removes.length === 1 ? ' old version' : ' old versions') + ' and frees ' + _rapierNotesBytesWords(freed) + '.\n• Keeps recent history.\n• No undo.',
		confirmLabel: 'Tidy', secondaryLabel: '', destructive: true}) : true;
	if (!sure) return;
	try { await _rapierNotesStore.historyCommit(async () => {
		// Confirmation is deliberately outside the lease. Its reviewed inventory must still
		// be current when the lock is granted, or the question described a different deletion.
		const fresh = await _rapierNotesHistoryInventory();
		const ordered = rows => [...rows].sort((a, b) => a.noteId < b.noteId ? -1 : a.noteId > b.noteId ? 1 : 0);
		if (fresh.unreadable.length || JSON.stringify(ordered(fresh.list)) !== JSON.stringify(ordered(held.list))) {
			showToast('History changed while Tidy was open, so nothing was removed: open Tidy history again.', 'info');
			return;
		}
		// The manifests first, then the words. A manifest that has landed no longer points at what it
		// gave up, so freeing it afterwards is safe; the other order leaves a version naming words that
		// are gone, which is the difference between a tidy and a loss. If any manifest write fails,
		// nothing is freed at all -- the folder simply still holds a past slightly larger than planned.
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
// Putting a version back is not a rewind: the words as they stand are recorded first if they are
// not in the past already (nothing the person made is lost by asking for something older), the
// older words go in through the editor's own transaction so Undo steps back over them like any
// other edit, and the event recorded afterwards says WHICH version it came from.
async function _rapierNotesHistoryRestore(file, id) {
	const H = globalThis.RapierNotesHistory, state = _rapierNotes;
	let guard;
	try { guard = await _rapierNotesFlush(); } catch (_) { return false; }
	if (state.current !== file || String(rapier.document.filename || '') !== file) { showToast('This note is not the open one, so its history was not changed', 'error'); return false; }
	const read = await _rapierNotesHistoryRead(file);
	if (read.kind !== 'read') { showToast(read.kind === 'unreadable' ? 'This note\'s past could not be read, so nothing was changed' : 'This note has no past to go back to yet', 'error'); return false; }
	const entry = state.index?.notes[file], now = state.texts.get(file) ?? _rapierSourceText();
	try {
		const plan = await H.restorePlan(read.manifest, id, {file, text: now, entry}, path => _rapierNotesStore.readHistory(path));
		// The present first, if the past does not already hold it.
		if (plan.recordFirst) await _rapierNotesRecordVersion({file, text: now, entry, reason: 'save'});
		// The folder first, then the record. A 'restore' event is a claim that the note was put back;
		// recording one over a write that did not land would put a lie in the note's own past, which is
		// the one place that must never hold one. Nothing writes `state.texts` here: the autosave owns
		// that copy and sets it when the bytes are in the folder.
		if (state.current !== file || String(rapier.document.filename || '') !== file || !_rapierMutationStampIsCurrent(guard)) {
			showToast('The open note changed while its history was read; nothing was restored', 'info');
			return false;
		}
		// The save these words cause records them as the restore itself, or, where it does not (the words were already the folder's),
		// the record is made below.
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
// A time a person reads, not a stamp: today\'s times are times, older ones carry their day.
// A history row is read by a person, so it says what happened in their words, not the machine's:
// 'untrash' is a word nobody says out loud. A note's oldest save is its first, and saying so is
// truer than 'edited' for words that were never anything else. A reason this build does not know
// is shown as it stands rather than dropped -- a past that quietly hides an event it cannot name
// is worse than one showing a word you have to look up. `rename` is only ever the note's first naming from its own words
// (_rapierNotesNameByWords, once), which the person never asked for, so it reads "named", not "renamed".
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
// ---- The note's own past: one version per certified save (notes/history.mjs) --------------------
// The module is pure and does the thinking; this is the seam that gives it the folder. It runs only
// after a write has LANDED, on the bytes that landed, with the sidecar entry captured beside them --
// a version that described words the folder never kept would be worse than no version at all.
//
// The writes come back in the order a crash must survive: every immutable object first (a recipe or
// a blob is named by its own content; an existing object is verified, not trusted by name), the
// manifest last. Applied in that order, an interruption anywhere leaves objects nothing points at
// yet -- never a manifest pointing at bytes that are not there.
async function _rapierNotesRecordVersion({file, text, entry, reason = 'save', restoredFrom, signal, guard} = {}, underLease = false) {
	const H = globalThis.RapierNotesHistory, state = _rapierNotes;
	if (!H || typeof H.recordVersion !== 'function') return null;
	const id = entry?.id;
	// No identity yet means the sidecar has not been written since this note appeared. The next save
	// carries it: admission happens at the index write, and a version keyed on a name rather than an
	// identity would be lost by the first rename, which is the whole point of having an identity.
	if (!id) return null;
	// manifestName already names its own part of the folder ('manifests/<id>.json').
	// The import holds the folder lease for its whole landed batch; ordinary saves acquire it.
	const record = async () => {
		const active = () => { if (signal?.aborted) throw new DOMException('The Notes request was cancelled.', 'AbortError'); guard?.(); }; active();
		const path = H.manifestName(id);
		let manifest;
		const held = await _rapierNotesStore.readHistory(path);
		if (held == null) manifest = H.emptyManifest(id);
		else {
			// A manifest that cannot be read is not overwritten: this note's past is kept as it is and this
			// save simply does not record one, rather than starting a new history over the top of one
			// somebody may still be able to recover.
			try { manifest = H.parseManifest(held, {noteId: id, now: Date.now()}); }
			catch (error) { throw Object.assign(new Error('this note\'s history could not be read, so this save was not recorded in it'), {cause: error}); }
		}
		const createdFiles = [], readBack = new Map();
		const result = await H.recordVersion(manifest, {file, text, entry, reason, now: Date.now(), ...(restoredFrom === undefined ? {} : {restoredFrom})});
		active();
		for (const write of result.writes) if (write.immutable) {
			// The immutable writer checks absence or verifies equality under this same lease. Its
			// result, not a second absence read, distinguishes new files from shared retained objects.
			const created = await _rapierNotesStore.writeHistory(write.name, write.bytes, {immutable: true});
			if (held == null && created) {
				const actual = await _rapierNotesStore.readHistory(write.name);
				createdFiles.push({file: 'history/' + write.name, bytes: write.bytes, actual});
				readBack.set(write.name, actual);
			}
		}
		// A manifest can remember an object that has since disappeared or changed. Verify even an
		// unchanged event before acknowledging it; publish the manifest only after its new event reads.
		// Reuse only actual read-back bytes, never planned bytes. The lease still excludes Tidy
		// and other writers; shared/previous objects not read back here are read from the store.
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
// A complete save owns body, sidecar, and history together. Re-entry cannot take the same-text
// shortcut while a preceding save is still recording its version.
async function _rapierNotesAutosave({settle = false} = {}) {
	const state = _rapierNotes;
	while (state.saveTask) await state.saveTask;
	const task = _rapierNotesAutosaveNow({settle});
	state.saveTask = task;
	try { await task; } finally { if (state.saveTask === task) state.saveTask = null; }
}
async function _rapierNotesAutosaveNow({settle = false} = {}) {
	const state = _rapierNotes;
	if (!state.current || state.renaming || state.returnRefused || (state.returning && !settle)) return;
	if (!settle && globalThis.__rapierNotesHoldTick) return; // witness seam (notes-keeps-work): the tick stands down, a flush does not
	// The editor's active filename is the true test of "did the person leave this note": it changes
	// only when a document actually replaces this one (rapierLoad/_rapierCommitDocumentIdentity), and
	// notes:-provenance changes alongside it, never on its own. Gating on
	// _rapierNotesOwnTheDocument() as well would be redundant with the filename check and, when
	// something installs a non-notes: authority without the filename moving, would evict a note
	// nobody left.
	if (String(rapier.document.filename || '') !== state.current) { _rapierNotesLeaveNote(); return; }
	const file = state.current, requested = _rapierMutationStamp();
	// A timer leaves the typing burst whole; an explicit Flush settles it before certifying bytes.
	const captured = await _rapierCaptureSettledExternalDocument({quiet: true, passive: !settle});
	if (!captured || !_rapierMutationStampSharesDocument(requested) || state.current !== file ||
			String(rapier.document.filename || '') !== file) return;
	const {generation: gen, canonical: text, stamp} = captured;
	// The editor's own admission token says whether these are the words it opened or last saved. An
	// empty Title or Note field the caret stands in is not the person's work: the note is compared
	// without it, so a field tapped and left writes nothing.
	const proof = state.currentProof, compared = _rapierNotesHeadIdle() ?? text;
	const unchanged = proof ? await globalThis.RapierNotesIntegrity.sha256(compared) === proof.digest : compared === state.texts.get(file);
	if (!state.saveFailed && unchanged) {
		state.savedGen = gen;
		if (_rapierMutationStampIsCurrent(stamp)) _rapierNotesMarkClean();
		return;
	}
	let certifiedGen = gen;
	state.savingGen = gen; state.savingText = text;
	try {
		// Writing into a note that is in Trash takes it OUT of Trash (the owner's save revives it,
		// notes/folder.mjs): a person who opens a trashed note and types has said, as plainly as anyone
		// can, that they want it. Said once, because a note coming back out of Trash is not a silent
		// event.
		const revived = !!state.index.notes[file]?.trashed;
		const saved = await _rapierNotesSave(file, text);
		if (saved.file !== file) {
			// The folder gave the words another name: another window wrote this note first and this
			// window's words are the kept copy (nothing anyone made is written over), or the note was
			// renamed in the folder (a rename this window's own refused transaction finished on the owner's
			// next read) and was found by its id. The editor answers to the folder's name.
			state.texts.delete(file); state.titles.delete(file);
			if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file);
			if (_rapierMutationStampSharesDocument(stamp) && state.current === file &&
					String(rapier.document.filename || '') === file) {
				if (typeof rapierRenameDocument === 'function') rapierRenameDocument(saved.file);
				state.current = saved.file;
				// The rename's own generation covers these words only while the editor still holds exactly them.
				if (_rapierSourceText() === text) certifiedGen = Number(rapier.revision.generation || 0);
			}
			if (saved.copied) showToast('This note was changed in another window while you wrote. Your words are kept as ' + saved.file + '; the other window\'s stay under the old name.', 'info');
		}
		const kept = saved.file;
		// The version is recorded before the note is called clean, so "saved" never means less than
		// "saved and recoverable". A history that refuses is a save that is not finished.
		// A captured note's first landed words are its capture; every later change is a save. The mark
		// is the note's identity, so the rename its first words ask for does not lose it.
		const entry = state.index?.notes[kept], putBack = state.restoring && state.restoring.id === entry?.id && state.restoring.text === text ? state.restoring : null;
		const reason = putBack ? 'restore' : state.captured?.has(entry?.id) ? 'capture' : 'save';
		// The save that carries words a restore put back is that restore's own record: one act, one row (_rapierNotesHistoryRestore).
		if (await _rapierNotesRecordVersion({file: kept, text, entry, reason, ...(putBack ? {restoredFrom: putBack.from} : {})}) && reason === 'capture') state.captured?.delete(entry.id);
		if (putBack && state.restoring === putBack) state.restoring = null;
		// Only the entire certified operation advances these marks. A failed history/sidecar
		// must leave the exact-text shortcut ineligible on the next tick, and Flush must refuse.
		state.savedGen = certifiedGen; _rapierNotesHold(kept, text); state.saveFailed = false;
		if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(kept);
		if (state.current === kept && _rapierMutationStampIsCurrent(stamp)) _rapierNotesMarkClean();
		if (revived && !saved.copied) showToast('This note was in the recycle bin; writing in it has put it back.', 'info');
		if (state.untitled.has(kept) && state.current === kept && !state.renaming) await _rapierNotesNameByWords(kept, text);
	} catch (error) {
		if (!state.saveFailed) showToast('This note is not being saved to the notes folder: ' + String(error?.message || error), 'error', {outlive: 'save-failed'});
		state.saveFailed = true;
	} finally { state.savingGen = -1; state.savingText = null; }
}
// Flush means flushed: the current generation is written if it is not yet, and every write in
// flight -- this note's and any other file's -- has landed before this resolves.
async function _rapierNotesFlush() {
	const state = _rapierNotes;
	try {
		// An empty Title or Note field the caret still stands in is left first, and the editor takes it
		// away: what a flush certifies is the note's own words and nothing else.
		_rapierNotesHeadSettle();
		if (state.renaming) await state.renaming;
		// Every save queued behind the one this waited for must land too (a typing tick's own
		// autosave can be queued beside this one); flushed means nothing is in flight.
		if (state.current) { await _rapierNotesAutosave({settle: true}); while (state.saveTask) await state.saveTask; }
		await _rapierNotesStore.settle();
		if (state.renaming) await state.renaming;
		// A save can fail, or the person can type while it waits. Neither permits a caller to
		// replace the editor or certify a backup of the old bytes as the current note.
		if (state.current && String(rapier.document.filename || '') === state.current) {
			const text = _rapierSourceText(), proof = state.currentProof;
			const exact = proof ? await globalThis.RapierNotesIntegrity.sha256(text) === proof.digest : state.texts.get(state.current) === text;
			if (state.saveFailed || state.saveTask || state.savedGen !== Number(rapier.revision.generation || 0) || !exact || _rapierSourceText() !== text || state.currentProof !== proof) throw new Error('This note still has unsaved changes. Keep it open and try again.');
		}
		return Object.freeze(_rapierMutationStamp());
	} catch (error) {
		if (!state.saveFailed) showToast('The notes folder has not kept every change: ' + String(error?.message || error), 'error', {outlive: 'save-failed'});
		throw error;
	}
}
function _rapierNotesLeaveNote() {
	const state = _rapierNotes;
	state.current = null; state.currentProof = null;
	if (state.autosave) { clearInterval(state.autosave); state.autosave = 0; }
	if (typeof rapierSetReadOnly === 'function' && rapier.access) { rapier.access.notesReadOnly = false; rapierSetReadOnly(false); }
	_rapierNotesMode(false);
}
// The editor is read-only for a note this window cannot write. Recomputed, never assumed: a window
// that takes the folder over clears it, and the document's own lease and the host's own read-only
// still decide for themselves (rapierSetReadOnly composes all three).

// A new file under the name the note's words give it, allocated and written under the owner's own
// lock (notes/folder.mjs create): a NEW note never overwrites a file, a taken name counts up, and a
// name this folder cannot hold (some private file systems take ASCII only) gets the plain name of
// the same words. The note's text is never changed to fit its name. Returns the name the folder
// took.
// `extra` rides in the create itself (notes/folder.mjs createEntry): a new note's place in the
// index arrives with its file, one transaction of the owner, never a second one to place it.
// `request` names the one note a caller means to make, across its retries: a create whose files
// landed but whose call was refused is finished by the owner's recovery, and the retry is given
// that note back (notes/folder.mjs create, `createdByRequest`) instead of a second one beside it.
async function _rapierNotesWriteNew(text, wanted, extra = {}, request, options) {
	const store = _rapierNotesStore;
	await store.kind();
	return _rapierNotesTake(await store.folder.create(text, wanted, extra, request, options)).file;
}

// ---- Capture, actions, the sheet -----------------------------------------------------------------
// A file just written joins the live index and the texts, through the same reconcile the load
// uses (the entry objects already in the index are kept, so a sheet action holding one keeps it).
function _rapierNotesAdmit(file, text) {
	const state = _rapierNotes, M = _rapierNotesModel();
	const { index } = M.reconcile(state.index, [...Object.keys(state.index.notes), file]);
	state.index = index; _rapierNotesHold(file, text);
	if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file);
}
// A hold then a lift SELECTS the card; the sheet at the foot acts on the whole selection, and a tap
// on another card while it is open adds that card. The selection clears after an action, as Keep's
// does, except COLOUR, which keeps it so a second tap can try the next colour.
function _rapierNotesSelect(file, toggle = true) {
	const state = _rapierNotes; if (!state.index.notes[file]) return;
	if (toggle && state.selected.has(file)) state.selected.delete(file); else state.selected.add(file);
	for (const el of state.surface.querySelectorAll('.rapier-notes-card')) { const on = state.selected.has(el.dataset.notesFile); el.classList.toggle('rapier-notes-card--selected', on); if (on) el.setAttribute('aria-selected', 'true'); else el.removeAttribute('aria-selected'); }
	if (!state.selected.size) { _rapierNotesCloseSheet(); return; }
	// The selection lives in the head (the X, the count, pin, remind, colour, section, more); the
	// sheet comes up only when asked for, and refreshes here if it is already up.
	if (state.sheet?.classList.contains('rapier-notes-sheet--open')) _rapierNotesOpenSheet();
	else if (typeof _rapierNotesLibraryBarPaint === 'function') _rapierNotesLibraryBarPaint();
}

// Cards own these keys only while the cards are the active surface. Text fields and IME
// composition retain every character; mutations enter the very same selection/action owners
// as a tap, so their save, Undo and error paths cannot diverge.
function _rapierNotesCardKey(evt) {
	const state = _rapierNotes;
	const field = element => element?.isContentEditable || element?.closest?.('input, textarea, select, [role="textbox"], [contenteditable="true"], [contenteditable="plaintext-only"]');
	if (!state.open || state.surface?.hidden || evt.defaultPrevented || evt.isComposing || evt.keyCode === 229 || evt.ctrlKey || evt.metaKey || evt.altKey || field(evt.target) || field(document.activeElement)) return false;
	if (state.keyBusy || state.popup || state.sheet?.classList.contains('rapier-notes-sheet--open') || _rapierNotesBinIsOpen() || _rapierNotesSettingsIsOpen() || state.askEl?.classList.contains('open') || state.jumpEl?.classList.contains('open')) return false;
	if (evt.shiftKey && /^[jk]$/i.test(evt.key || '') && _rapierNotesKeyMove(evt.target, evt.key.toLowerCase() === 'j' ? 1 : -1)) { evt.preventDefault(); return true; }
	if (state.reorder) return false;
	const key = String(evt.key || '').toLowerCase(), card = evt.target.closest?.('.rapier-notes-card');
	if (!['c', '/', 'j', 'k', 'e', '#', 'f', 'x'].includes(key) || (!card && !['c', '/', 'j', 'k'].includes(key))) return false;
	evt.preventDefault();
	if (evt.repeat && !['j', 'k'].includes(key)) return true;
	if (key === 'c') { _rapierNotesAddsToggle(false); _rapierNotesPopup(null); void _rapierNotesNew('note'); }
	else if (key === '/') { _rapierNotesSearchToggle(true); state.search?.focus(); }
	else if (key === 'j' || key === 'k') _rapierNotesCardMove(card, key === 'j' ? 1 : -1);
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
// The Remind face's own small formatting: the house 12-hour clock ("6:00 pm", model.mjs's own
// private clockWords, not exported -- a row's label needs only the time, never a full sentence),
// and the datetime-local input's value, both read and written in LOCAL time, never UTC (the
// model's own rule for every reminder computation).
function _rapierNotesClockWords(at) {
	const d = new Date(at), hour = d.getHours() % 12 || 12;
	return hour + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + (d.getHours() < 12 ? 'am' : 'pm');
}
function _rapierNotesLocalDateTimeValue(date) {
	const p = n => String(n).padStart(2, '0');
	return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate()) + 'T' + p(date.getHours()) + ':' + p(date.getMinutes());
}
// A datetime-local input's value carries no timezone; read by hand against LOCAL fields (never
// Date's own string parser, which the spec leaves free to read a bare "T" string as UTC) so a
// chosen wall-clock time lands on the same minute nextOccurrence/remindWords would compute for it.
function _rapierNotesParseLocalDateTime(value) {
	const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ''));
	return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN;
}
// ---- The Remind face's date and time -------------------------------------------------------------
// The browser's own `<input type="datetime-local">` brings a locale placeholder and a native
// calendar glyph into the sheet, and on a phone the operating system's own wheel. The sheet draws
// every control it offers, so Notes draws this one too: a month on a grid with the house's own 44 px
// targets, every word in the sheet's own caps mono -- and the chosen day FILLS pure white or pure
// black, the same rule the bell and the pin obey.
// The time is one box labelled TIME, the browser's own time field -- on the phone the system's clock
// -- dressed as a row of the sheet.
function _rapierNotesRemindStart(entry) {
	const at = entry?.remind?.at;
	if (Number.isFinite(at)) { const d = new Date(at); return {y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), hour: d.getHours(), minute: d.getMinutes()}; }
	// No reminder yet: an hour from now, on the hour, which is a sane first guess and never the past.
	const d = new Date(Date.now() + 60 * 60 * 1000);
	return {y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), hour: d.getHours(), minute: 0};
}
// The week as this person's own locale starts it, named by its narrow initials, derived rather than
// written down: a list of English initials would be wrong everywhere else.
function _rapierNotesWeekStart() { try { const w = new Intl.Locale(navigator.language || 'en').weekInfo; return (w?.firstDay || 1) % 7; } catch (_) { return 1; } }
function _rapierNotesRemindPicker(entry, button) {
	const state = _rapierNotes;
	const draft = state.remindDraft || (state.remindDraft = _rapierNotesRemindStart(entry));
	if (!Number.isFinite(draft.sy)) { draft.sy = draft.y; draft.sm = draft.m; }
	// Every press here redraws the face, and the redraw must NOT happen inside the press's own click:
	// the button being pressed is one of the elements the redraw replaces, and a node detached
	// half-way through its own dispatch has no ancestors left -- so the page's "a click outside the
	// sheet puts the sheet down" rule (it asks evt.target.closest('.rapier-notes-sheet')) reads the
	// press as a press on the scrim and closes the face. Photographed: the first chip answered and
	// the second did nothing, because the sheet had already gone. The redraw waits for the click to
	// finish instead, which is the same thing every other row here does by going through the async
	// _rapierNotesAct.
	const redraw = () => setTimeout(() => paint(), 0);
	const box = _rapierNotesEl('div', 'rapier-notes-cal');
	box.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', 'Choose a date and time'));
	const head = _rapierNotesEl('div', 'rapier-notes-cal-head');
	const title = _rapierNotesEl('div', 'rapier-notes-cal-title');
	const step = (delta, glyph, label) => {
		const b = _rapierNotesEl('button', 'rapier-notes-cal-step'); b.type = 'button'; b.setAttribute('aria-label', label);
		b.appendChild(_rapierNotesGlyph(glyph)); b.dataset.notesStep = String(delta);
		b.addEventListener('click', () => { const t = new Date(draft.sy, draft.sm + delta, 1); draft.sy = t.getFullYear(); draft.sm = t.getMonth(); redraw(); });
		return b;
	};
	head.append(step(-1, 'chevron-left', 'the month before'), title, step(1, 'chevron-right', 'the month after'));
	const grid = _rapierNotesEl('div', 'rapier-notes-cal-grid'); grid.setAttribute('role', 'grid'); grid.setAttribute('aria-label', 'choose a day');
	// The time: one field under its own word, a clear gap under the month. What it holds goes into the
	// draft at once and Set says so, without a redraw (a redraw would take the field from under the
	// person's finger). A time half typed on a desktop is no value yet -- the field is empty until it
	// is whole -- so it changes nothing, and a field left empty shows the draft's time again.
	const clock = _rapierNotesEl('label', 'rapier-notes-cal-time');
	const time = _rapierNotesEl('input', 'rapier-notes-cal-clock'); time.type = 'time';
	const hhmm = () => String(draft.hour).padStart(2, '0') + ':' + String(draft.minute).padStart(2, '0');
	time.value = hhmm();
	const take = () => { const m = /^(\d{2}):(\d{2})/.exec(time.value); if (!m) return; draft.hour = Number(m[1]); draft.minute = Number(m[2]); say(); };
	time.addEventListener('input', take); time.addEventListener('change', take);
	time.addEventListener('blur', () => { if (!time.value) time.value = hhmm(); });
	clock.append(_rapierNotesEl('span', 'rapier-notes-remind-label', 'Time'), time);
	// Its own button, not a `data-notes-act` row: the sheet's delegated handler carries one value
	// per act and this one's value is a moment assembled here, so it is dispatched by hand.
	const set = _rapierNotesEl('button', 'rapier-notes-btn rapier-notes-cal-set'); set.type = 'button';
	set.addEventListener('click', () => { void _rapierNotesAct('remind-set', _rapierNotesLocalDateTimeValue(new Date(draft.y, draft.m, draft.d, draft.hour, draft.minute))); });
	box.append(head, grid, clock, set);
	// Set says exactly what it will set: the day and the time as they stand in the draft.
	function say() { set.textContent = 'Set  ·  ' + new Date(draft.y, draft.m, draft.d).toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short'}) + ', ' + _rapierNotesClockWords(new Date(draft.y, draft.m, draft.d, draft.hour, draft.minute).getTime()); }
	function paint() {
		const first = _rapierNotesWeekStart();
		title.textContent = new Date(draft.sy, draft.sm, 1).toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
		grid.textContent = '';
		for (let i = 0; i < 7; i++) {
			const day = new Date(2024, 0, 7 + ((first + i) % 7)); // 7 Jan 2024 is a Sunday
			grid.appendChild(_rapierNotesEl('div', 'rapier-notes-cal-name', day.toLocaleDateString(undefined, {weekday: 'narrow'})));
		}
		const start = new Date(draft.sy, draft.sm, 1), days = new Date(draft.sy, draft.sm + 1, 0).getDate();
		const today = new Date(); today.setHours(0, 0, 0, 0);
		for (let i = (start.getDay() - first + 7) % 7; i > 0; i--) grid.appendChild(_rapierNotesEl('div', 'rapier-notes-cal-day rapier-notes-cal-day--out'));
		for (let d = 1; d <= days; d++) {
			const when = new Date(draft.sy, draft.sm, d);
			const chosen = draft.y === draft.sy && draft.m === draft.sm && draft.d === d;
			const b = _rapierNotesEl('button', 'rapier-notes-cal-day' + (chosen ? ' rapier-notes-cal-day--on' : '') + (when.getTime() === today.getTime() ? ' rapier-notes-cal-day--today' : ''), String(d));
			b.type = 'button'; b.setAttribute('aria-pressed', String(chosen)); b.setAttribute('aria-label', when.toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long'}));
			b.dataset.notesDay = draft.sy + '-' + String(draft.sm + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
			// A reminder in the past has already happened: a day before today is shown and not offered.
			if (when < today) b.disabled = true;
			else b.addEventListener('click', () => { draft.y = draft.sy; draft.m = draft.sm; draft.d = d; redraw(); });
			grid.appendChild(b);
		}
		say();
	}
	paint();
	return box;
}
function _rapierNotesOpenSheet(file, mode) {
	const state = _rapierNotes, M = _rapierNotesModel();
	if (file) { if (!state.selected.has(file)) { state.selected.add(file); _rapierNotesSelect(file, false); return; } }
	const files = [...state.selected].filter(f => state.index.notes[f]);
	// A section's own face (the Sections mode) is about no note at all.
	const aboutNoNote = ['section-edit', 'section-add'].includes(mode || state.sheetMode);
	if (!files.length && !aboutNoNote) { _rapierNotesCloseSheet(); return; }
	if (mode) {
		// A sheet raised from inside Notes takes the focus (the selection bar's rows would leave it behind
		// the scrim), and the control that raised it gets it back when the sheet goes down.
		const at = document.activeElement;
		if (at && state.surface?.contains(at)) { state.sheetFocus = true; if (!state.sheet.classList.contains('rapier-notes-sheet--open')) state.sheetOpener = at; }
		state.sheetMode = mode;
	}
	_rapierNotesSnackHide();
	if (state.popup) { state.popup = null; state.fab?.setAttribute('aria-expanded', 'false'); state.surface.querySelector('[data-notes-act="menu"]')?.setAttribute('aria-expanded', 'false'); }
	const sheet = state.sheet; sheet.replaceChildren();
	// No face carries a title or a Back row: the selection bar says the count. A face goes down by
	// the scrim, the swipe, Escape or the phone's Back, and lands where it was raised: the cards with
	// the selection kept, the Sections mode, the open note.
	const entries = files.map(f => state.index.notes[f]), every = key => entries.every(e => e[key]);
	// The house row (.track-action-button): a BUTTON, its icon at the left, its word in all caps --
	// the caps and the mono are the sheet's own rule in editor/styles/rapier-notes.css, so one owner
	// sets them for every row here.
	const button = (act, word, className = 'rapier-notes-btn', icon = RAPIER_NOTES_ROW_ICONS[act]) => {
		const b = _rapierNotesEl('button', className, word); b.type = 'button'; b.dataset.notesAct = act;
		if (icon && className === 'rapier-notes-btn') b.insertBefore(_rapierNotesIcon(icon), b.firstChild);
		return b;
	};
	// OPEN AS DOCUMENT and SHARE, one pair for both kebab faces, after DUPLICATE: each makes a copy.
	// Their glyphs are the row table's, like every row's.
	const asDocument = [['open-document', 'Open as document'], ['share', 'Share']];
	if (state.sheetMode === 'colour') {
		// Ten swatches, two rows of five: the first is no colour; the one the selection wears is ticked
		// (a mixed selection ticks none); a tap applies and stays here.
		const worn = entries.every(e => e.colour === entries[0].colour) ? entries[0].colour : null;
		const row = _rapierNotesEl('div', 'rapier-notes-swatches'); row.setAttribute('role', 'radiogroup'); row.setAttribute('aria-label', 'colour');
		for (const colour of M.NOTE_COLOURS) {
			const b = _rapierNotesEl('button', 'rapier-notes-swatch' + (colour ? ' rapier-notes-tint-' + colour : ' rapier-notes-swatch--none')); b.type = 'button'; b.dataset.notesAct = 'colour-pick'; b.dataset.notesColour = colour;
			b.setAttribute('role', 'radio'); b.setAttribute('aria-label', colour || 'no colour'); b.setAttribute('aria-checked', String(colour === worn));
			row.appendChild(b);
		}
		sheet.appendChild(row);
	} else if (state.sheetMode === 'section') {
		// A note is in one section: Other, or one of the person's own; a field makes a new section and
		// moves the notes there. The house rows: a full-width row to a section with the folder at its
		// left, in the order the cards show the sections; the one the selection is in is filled with the
		// ink (a mixed selection fills none).
		const own = (state.index.sections || []).map(x => x.name);
		const worn = entries.every(e => (e.category || '') === (entries[0].category || '')) ? (entries[0].category || '') : null;
		const rows = _rapierNotesEl('div', 'rapier-notes-section-rows'); rows.setAttribute('role', 'radiogroup'); rows.setAttribute('aria-label', 'section');
		// Skills, when the person keeps it, is a section a note is moved to like any other.
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
		// ADD is a row's own box in the pure ink, as every row here is (it was the accent's red).
		const add = button('section-new', 'Add'); add.type = 'submit';
		form.append(input, add);
		form.addEventListener('submit', evt => { evt.preventDefault(); void _rapierNotesAct('section-new', input.value); });
		sheet.append(rows, form);
	} else if (state.sheetMode === 'section-add') {
		// A new section from the kebab's settings panel: the field alone (no title, no Back), and the
		// section added empty, between Pinned and Other, for the person to move notes into from their
		// sheets. The house asks in its own face, never in a browser prompt: a frame that blocks dialogs
		// answers one with nothing, and its words are the browser's.
		const form = _rapierNotesEl('form', 'rapier-notes-label-form');
		const input = _rapierNotesEl('input', 'rapier-notes-search'); input.type = 'text'; input.placeholder = 'New section'; input.maxLength = 48; input.autocomplete = 'off'; input.setAttribute('aria-label', 'new section');
		const add = button('section-add', 'Add'); add.type = 'submit';
		form.append(input, add);
		form.addEventListener('submit', evt => { evt.preventDefault(); void _rapierNotesAct('section-add', input.value); });
		sheet.appendChild(form);
	} else if (state.sheetMode === 'section-edit') {
		// The Sections mode's face for one of the person's own sections: its name in a field to rename,
		// and Delete section, which sends its notes to Other and deletes nothing.
		const form = _rapierNotesEl('form', 'rapier-notes-label-form');
		const input = _rapierNotesEl('input', 'rapier-notes-search'); input.type = 'text'; input.value = String(state.sheetSection || ''); input.maxLength = 48; input.autocomplete = 'off'; input.setAttribute('aria-label', 'section name');
		const rename = button('section-rename', 'Rename'); rename.type = 'submit';
		form.append(input, rename);
		form.addEventListener('submit', evt => { evt.preventDefault(); void _rapierNotesAct('section-rename', input.value); });
		sheet.append(form, button('section-delete', 'Delete section'));
	} else if (state.sheetMode === 'remind') {
		// Keep's reminder sheet. A quick choice is fast and final -- the face closes, below, the same as
		// a plain action. The custom time and the repeat/remove rows stay open instead (the sheet's own
		// "stays" list), so a time and a repeat can be set in the one visit, and Remove is there the
		// moment there is something to remove.
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
			// The reveal waits a frame beyond the open's own "a sheet opens at its top" reset (below), then
			// scrolls the sheet to its end: the Repeat and Remove rows, all in view.
			if (state.remindReveal) { state.remindReveal = false; requestAnimationFrame(() => requestAnimationFrame(() => { try { sheet.scrollTo({top: sheet.scrollHeight}); } catch (_) {} })); }
			const chips = _rapierNotesEl('div', 'rapier-notes-chips'); chips.setAttribute('role', 'radiogroup'); chips.setAttribute('aria-label', 'repeat');
			for (const [value, word] of [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]) {
				const b = button('remind-repeat', word, 'rapier-notes-chip' + (value === worn ? ' rapier-notes-chip--worn' : '')); b.dataset.notesRepeat = value;
				b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(value === worn));
				chips.appendChild(b);
			}
			sheet.append(chips);
			_rapierNotesReminderFields(sheet, entries);
			sheet.appendChild(button('remind-remove', 'Remove reminder'));
		}
	} else if (state.sheetMode === 'add') {
		// The attach sheet, opened by the top bar's plus. No title, no drag handle. The tick-box row's
		// label follows the state, so it reads as what the press will do; the four under it press the
		// editor's own controls for the person, into the note that is open.
		sheet.appendChild(button('boxes', (typeof _rapierTodoBoxesWord === 'function' && _rapierTodoBoxesWord()) || 'Show tick boxes'));
		for (const [kind, word] of [['drawing', 'Drawing'], ['picture', 'Add image'], ['photo', 'Take photo'], ['recording', 'Recording'], ['attachment', 'Add file'], ['files', 'Saved files']]) {
			const b = button('add-kind', word, 'rapier-notes-btn', RAPIER_NOTES_ADD_ICONS[kind]); b.dataset.notesAdd = kind;
			sheet.appendChild(b);
		}
		// No CLOSE row: the sheet is dismissed by its scrim, by the swipe down, and by Escape -- a row
		// that only undoes the press that opened it says nothing.
	} else if (state.sheetMode === 'history') {
		// The note's own past, newest first, each row the time a person reads with what made it and
		// how big the note was then. The current one is marked and does nothing; every other row puts
		// those words back. Nothing here is a control except the rows.
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
		// One version: when it was, what made it, and what putting it back would change against the
		// words as they stand now. A comparison the module refuses is said in its own words -- "too
		// large to compare here" is not "no differences", and the row still offers to put it back.
		const one = state.historyOne;
		if (!one) sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', 'That version could not be read.'));
		else {
			sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', _rapierNotesWhen(one.time) + '  ·  ' + _rapierNotesReasonWords(one.reason, one.first) + '  ·  ' + _rapierNotesBytesWords(one.size)));
			sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', one.words));
			for (const line of one.lines) {
				const row = _rapierNotesEl('div', 'rapier-notes-diff-line', line.text);
				row.dataset.notesDiff = line.op;
				sheet.appendChild(row);
			}
			if (one.more > 0) sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', 'and ' + one.more.toLocaleString('en') + (one.more === 1 ? ' more line' : ' more lines') + ' not shown here'));
			if (!one.current) { const b = button('history-restore', 'Put these words back'); b.dataset.notesVersion = String(one.id); sheet.appendChild(b); }
		}
	} else if (state.sheetMode === 'tags') {
		// The note's tags, each one a row that takes it off, and a row that adds one. A tag is one
		// field in the note's own metadata block, not a thing of Rapier's, so taking one off is not
		// the sort of act that needs to be asked about: it goes straight back on, and the note's own
		// History has the save either way. A note with none says so rather than showing an empty
		// sheet, and says where a tag lives, because a tag written into the file is the whole point.
		const tags = _rapierNotesTagsOf(files[0]);
		if (!tags.length) sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', 'This note has no tags. A tag is written into the note itself, so it travels with the file.'));
		else for (const tag of tags) { const b = button('tag-remove', '#' + tag); b.dataset.notesTag = tag; sheet.appendChild(b); }
		// Adding one is a field in the face itself, Add a row's own box beside it as the section face's
		// is; never a browser prompt.
		const form = _rapierNotesEl('form', 'rapier-notes-label-form');
		const input = _rapierNotesEl('input', 'rapier-notes-search'); input.type = 'text'; input.placeholder = 'Add a tag'; input.maxLength = 48; input.autocomplete = 'off'; input.setAttribute('aria-label', 'new tag');
		const add = button('tag-add', 'Add', 'rapier-notes-btn', null); add.type = 'submit';
		form.append(input, add);
		form.addEventListener('submit', evt => { evt.preventDefault(); void _rapierNotesAct('tag-add', input.value); });
		sheet.appendChild(form);
	} else if (state.sheetMode === 'connections') {
		// What this note links to, what links to it, and the mentions nobody has linked yet --
		// notes/links.mjs's own lists, drawn by notes/library.js.
		if (typeof _rapierNotesLibraryConnectionsFace === 'function') _rapierNotesLibraryConnectionsFace(sheet, files[0]);
	} else if (state.compose) {
		// The note's own kebab sheet, in its own order. No title, no drag handle, no note text as a
		// panel title, and no REMIND: the bell is in the top bar. Adding lives in the top bar's plus.
		// "Make a copy" is DUPLICATE. ARCHIVE's word follows the note. Every row is an act Notes already
		// has, plus OPEN AS DOCUMENT and SHARE.
		for (const [act, word, icon] of [['copy', 'Duplicate'], ...asDocument, ['section-face', 'Section'], ['colour', 'Colour'], ['find-note', 'Find in note'], ['archive', every('archived') ? 'Unarchive' : 'Archive'], ['connections', 'Connections'], ['tags-face', 'Tags'], ['history-face', 'History']]) sheet.appendChild(button(act, word, undefined, icon));
		if (typeof _rapierTodoHasChecks === 'function' && _rapierTodoHasChecks()) {
			sheet.append(button('uncheck-all', 'Uncheck all'), button('delete-checked', 'Delete checked items'));
		}
		// Delete is the last row, a flat red box with white text (the one pop-up standard, editor/pop.js): what
		// discards stands at the bottom, away from the rows a thumb reaches for.
		{ const del = button('trash', 'Delete', undefined, RAPIER_NOTES_ROW_ICONS.trash); del.dataset.pop = 'destructive'; del.dataset.popBottom = ''; sheet.appendChild(del); }
		// No Settings row: Notes is its own surface, and the cards' kebab Editor row goes back to the
		// editor, where Settings is.
		// No CLOSE row: the sheet is dismissed by its scrim, by the swipe down, and by Escape -- a row
		// that only undoes the press that opened it says nothing.
	} else {
		const acts = every('trashed') ? [['restore', 'Restore'], ['delete-forever', 'Delete forever']]
			// A tap opens a note, so no Open; pin, remind and colour are fixed in the head; a skill is a
			// note moved to Skills. What is left is what a person selects notes FOR: a section, the
			// archive, the bin, a copy, a send.
			: [['section-face', 'Section'], ['archive', every('archived') ? 'Unarchive' : 'Archive'], ['trash', 'Delete']];
		for (const [act, word] of acts) sheet.appendChild(button(act, word));
		// One word for one act across the product: DUPLICATE in the note's own sheet, and the selection
		// sheet's row is the same act on the same note. The rows the note's own sheet has for a copy,
		// the same ones in the same order.
		if (files.length === 1 && !every('trashed')) for (const [act, word, icon] of [['copy', 'Duplicate'], ...asDocument]) sheet.appendChild(button(act, word, undefined, icon));
		// No CLOSE row: the sheet is dismissed by its scrim, by the swipe down, and by Escape -- a row
		// that only undoes the press that opened it says nothing.
	}
	sheet.classList.add('rapier-notes-sheet--open'); sheet.inert = false; _rapierNotesScrim(true);
	// A sheet opens at ITS TOP. The note's own sheet is taller than a phone screen (eleven rows and
	// the pair), so it scrolls -- and a kept scroll would put the first row above the sheet's own top
	// edge and out of reach, where a press lands on the scrim and closes the sheet. A person cannot
	// be asked to know their sheet is scrolled. `notes-compose-kebab`.
	// Once now and once on the next frame: the rows are in, but the sheet has only just been told to
	// open, so at this instant it may not overflow yet -- and a browser that restores a scroll offset
	// when the content grows would put the old one straight back.
	sheet.scrollTop = 0;
	requestAnimationFrame(() => { if (sheet.classList.contains('rapier-notes-sheet--open')) sheet.scrollTop = 0; });
	if (typeof _rapierNotesLibraryBarPaint === 'function') _rapierNotesLibraryBarPaint();
	_rapierNotesHeadPaint();
	// The focus goes to the face's first live control, else to the surface that owns Escape: History's
	// first row is its current version, disabled, and focus given to it fell to the page, where Escape
	// reaches nothing -- and with no Back row, Escape is the keyboard's way out of a face.
	if (state.sheetFocus) { state.sheetFocus = false; (sheet.querySelector('button:not([disabled])') || state.surface)?.focus({ preventScroll: true }); }
}
// What an import did, in the person's hands: the folder's own record, read from the sidecar (the
// last five, newest first), each receipt a title over when it happened and where the notes came
// from, and a tap on a row opens the rest of its facts -- what was skipped and why, a picture not
// brought in -- in the receipt's own words. The sheet is the house bottom sheet with no note
// selected, so it branches before the selection guard in _rapierNotesOpenSheet rather than
// inventing a selected note. Undo: the owner's proof-bound removal of exactly what a receipt proves
// the import wrote; a note edited since is a changed survivor, shown before confirming and kept;
// the review face is the pure module's.
async function _rapierNotesImportsSheet(toggle) {
	const state = _rapierNotes, Receipt = globalThis.RapierNotesImportReceipt, sheet = state.sheet; if (!sheet) return;
	const receipts = Array.isArray(state.index?.imports) ? state.index.imports.slice().reverse() : [], readTurn = (state.importsReadTurn || 0) + 1;
	state.importsReadTurn = readTurn;
	state.importsOpen = toggle === undefined ? null : state.importsOpen === toggle ? null : toggle;
	state.selected.clear(); state.sheetMode = 'imports';
	_rapierNotesSnackHide(); sheet.replaceChildren();
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
		sheet.classList.add('rapier-notes-sheet--open'); sheet.inert = false; _rapierNotesScrim(true); sheet.scrollTop = 0;
		if (typeof _rapierNotesLibraryBarPaint === 'function') _rapierNotesLibraryBarPaint();
		(sheet.querySelector('button:not([disabled])') || sheet.querySelector('button'))?.focus({ preventScroll: true });
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
		// A row with nothing more to show is a plain row, not a button that does nothing.
		const el = _rapierNotesEl(more.length ? 'button' : 'div', (more.length ? 'rapier-notes-btn ' : '') + 'rapier-notes-import-row');
		if (more.length) { el.type = 'button'; el.dataset.notesAct = 'imports-open'; el.dataset.notesReceipt = id; el.setAttribute('aria-expanded', String(shown)); }
		el.append(_rapierNotesEl('span', 'rapier-notes-import-title', face.title), _rapierNotesEl('span', 'rapier-notes-import-when', face.when + ' · ' + face.lines[0]));
		sheet.appendChild(el);
		if (shown) { const list = _rapierNotesEl('ul', 'rapier-notes-import-lines'); for (const line of more) list.appendChild(_rapierNotesEl('li', '', line)); sheet.appendChild(list); }
		if (face.undo?.eligible || reference.journal && receipt.written?.length) { const undo = _rapierNotesEl('button', 'rapier-notes-btn', 'Undo import'); undo.type = 'button'; undo.dataset.notesAct = 'imports-undo-review'; undo.dataset.notesReceipt = id; undo.disabled = state.importUndoBusy; sheet.appendChild(undo); }
	}
	// No CLOSE row here either. The scrim, the swipe and Escape close it.
	sheet.classList.add('rapier-notes-sheet--open'); sheet.inert = false; _rapierNotesScrim(true);
	sheet.scrollTop = 0;
	requestAnimationFrame(() => { if (sheet.classList.contains('rapier-notes-sheet--open')) sheet.scrollTop = 0; });
	if (typeof _rapierNotesLibraryBarPaint === 'function') _rapierNotesLibraryBarPaint();
	// The sheet keeps the focus it was given: a repaint after a tap on a row would otherwise drop it on
	// the body, where Escape reaches nothing (the surface owns Escape, and the sheet is inside it).
	if (toggle === undefined) sheet.querySelector('button')?.focus({ preventScroll: true });
	else (sheet.querySelector('[data-notes-receipt="' + CSS.escape(toggle) + '"]') || sheet.querySelector('button'))?.focus({ preventScroll: true });
}
// Undo, reviewed: the owner previews what the receipt proves and what changed since (kept), the
// pure face says it, and nothing is removed until the person confirms against a fresh check.
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
		// A durable journal may exist: the next read finishes or repairs it; nothing is claimed either way.
		showToast('Import Undo did not finish. Reopen Notes to check the folder before trying another action.', 'error');
	} finally { state.importUndoBusy = false; }
	if (!outcome) { state.importUndoReview = null; _rapierNotesImportsSheet(); return; }
	for (const file of outcome.result.removed) {
		state.texts.delete(file); state.titles.delete(file); state.sizes?.delete?.(file); state.readFailed.delete(file); state.attempted.delete(file); state.hold.delete(file); state.opened.delete(file); state.untitled.delete(file);
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
// The sheet down, the selection kept: a swipe, the scrim, Escape, the phone's Back. The head's X
// (and Back once the sheet is down) clears the selection: _rapierNotesCloseSheet.
// The sheet's scrim: the old pop-up's own element, empty, over the cards and the head while any
// sheet is up, so a tap outside the sheet closes it and reaches nothing under it (without it a card
// under the sheet would open).
function _rapierNotesScrim(on) {
	const el = _rapierNotes.popupEl; if (!el) return;
	el.replaceChildren(); el.hidden = !on;
	// The overlay does not blink on: it fades over --dur-enter on --ease-out while its sheet rides up
	// (.track-action-overlay). One frame with the scrim mounted but still transparent is what makes
	// the transition run at all.
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
	sheet.classList.remove('rapier-notes-sheet--open'); sheet.inert = true; _rapierNotesScrim(false);
	const opener = state.sheetOpener?.isConnected && state.sheetOpener.getClientRects().length ? state.sheetOpener : null; state.sheetOpener = null;
	if (focusWasInSheet) (opener || last && state.surface.querySelector('[data-notes-file="' + CSS.escape(last) + '"]'))?.focus({ preventScroll: true });
	_rapierNotesHeadPaint();
	return true;
}
function _rapierNotesCloseSheet() {
	const state = _rapierNotes, last = [...state.selected].pop(), focusWasInSheet = !!(state.sheet && document.activeElement && state.sheet.contains(document.activeElement));
	if (state.importUndoBusy) return;
	state.importUndoReview = null;
	state.selected.clear(); state.sheetMode = 'actions'; state.remindDraft = null;
	if (focusWasInSheet && state.open) {
		// The focus goes back to the card, or to the head's menu when the card is no longer in the window.
		const card = last ? state.surface.querySelector('[data-notes-file="' + CSS.escape(last) + '"]') : null;
		(card || state.surface.querySelector('[data-notes-act="menu"]'))?.focus({ preventScroll: true });
	}
	for (const el of state.surface?.querySelectorAll('.rapier-notes-card--selected') || []) { el.classList.remove('rapier-notes-card--selected'); el.removeAttribute('aria-selected'); }
	if (state.sheet) { state.sheet.inert = true; state.sheet.classList.remove('rapier-notes-sheet--open'); } _rapierNotesScrim(false);
	if (typeof _rapierNotesLibraryBarPaint === 'function') _rapierNotesLibraryBarPaint();
	// The note's own sheet was up over the open note; closing it gives the note back, and the scrim
	// with it (the surface is only the scrim there, never the cards).
	if (state.compose) {
		state.compose = false;
		state.surface?.classList.remove('rapier-notes-surface--over');
		const kebab = document.getElementById('btn-notes-kebab');
		kebab?.setAttribute('aria-expanded', 'false');
		document.getElementById('btn-notes-plus')?.setAttribute('aria-expanded', 'false');
		if (!state.open && state.surface) { state.surface.hidden = true; _rapierNotesFence(false); if (focusWasInSheet) (state.sheetOpener || kebab)?.focus({ preventScroll: true }); }
	}
	state.sheetOpener = null;
	_rapierNotesHeadPaint();
}
// The snackbar: one line at the foot with UNDO, after an archive or a delete (of a note, or of a
// section). A new one replaces the last; the undo puts the entries back exactly as they were, order
// untouched. An Undo is a KEEP THIS path: the snack stays until the person answers it; it does not
// expire on a timer.
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
// The same swipe as the editor's notices. Dismissal leaves the note and any due reminder intact.
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
			// A deleted section's Undo is a function (_rapierNotesSectionEdit): it puts the section back and answers what takes it out again.
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
// ---- The due-reminder timer ---------------------------------------------------------------------
// While Notes is open: a 30 s poll, plus one check at open. Due files queue and are answered one at
// a time; the model's own remindDone (dueReminders/acknowledgeRemind, notes/model.mjs) is what
// stops an occurrence being queued again once DONE has handled it -- this file only avoids queuing
// a file that is already showing or already waiting, between two polls of the same still-unhandled
// one. No Notification API, no permission asked, no sound: the Android app owns the alarm and its
// notification; this while-open check belongs to the app too.
function _rapierNotesRemindTick() {
	const state = _rapierNotes, M = _rapierNotesModel();
	if (!_rapierNotesIsApp() || !state.open || !state.index) return;
	const due = M.dueReminders(state.index, Date.now());
	const showing = state.snack?.kind === 'remind' ? state.snack.file : null;
	const waiting = new Set(state.remindQueue);
	for (const file of due) if (file !== showing && !waiting.has(file)) state.remindQueue.push(file);
	_rapierNotesRemindPump();
	_rapierNotesRemindSync(); // the app's own alarm door, defined at the end of this file.
}
// The archive/trash undo and a due reminder share the one foot-of-screen slot: an undo in progress
// is never displaced, so this waits for the slot to free (the next tick, or the next remind-open/
// remind-done) rather than showing on top of it.
function _rapierNotesRemindPump() {
	const state = _rapierNotes;
	if (state.snack || !state.remindQueue.length) return;
	const file = state.remindQueue.shift();
	if (!state.index.notes[file]) { _rapierNotesRemindPump(); return; } // gone since it was queued
	_rapierNotesRemindSnack(file);
}
// The due-reminder snackbar: the undo snack's own element and style, OPEN and DONE in place of UNDO,
// and no six-second timer -- a reminder waits to be answered rather than vanishing unread.
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
// A witness seam (notes-remind-due): forces one poll at once, without a real 30 s wait.
globalThis.__rapierNotesRemindTick = () => _rapierNotesRemindTick();
// The Sections mode's rename and delete, over the model's own renameSection and removeSection: a
// rename carries every note in the section and the person's own order (the order names sections by
// name); a delete sends the section's notes to Other -- the model clears their category -- and
// deletes no note. Nothing is asked: the snack says where the notes are, and its Undo puts the
// section back as it stood (its place, its order, its notes). The section's element is keyed by
// its name, so it is let go for the render to rebuild.
async function _rapierNotesSectionEdit(act, arg) {
	const state = _rapierNotes, M = _rapierNotesModel(), from = state.sheetSection; if (!from || !state.index) return;
	// When the folder refuses the write, this one change is undone on whatever the index is by then:
	// a colour, a pin or a tick the person set while the write was in flight is not this edit's to
	// throw away, and putting the whole earlier picture back would throw it away. The drag's failure path already undoes only its own key.
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
			// The section that stood, not a fresh one: its fold (the Sections mode had folded it) comes back with it.
			if (!had) state.index = {...state.index, sections: state.index.sections.map(s => s.name === from ? {...row} : s)};
			for (const file of emptied) if (state.index.notes[file] && !state.index.notes[file].category) state.index = M.setCategory(state.index, file, from);
			if (orderAt >= 0 && Array.isArray(state.index.sectionOrder) && !state.index.sectionOrder.includes(from)) { const order = state.index.sectionOrder.slice(); order.splice(Math.min(orderAt, order.length), 0, from); state.index = {...state.index, sectionOrder: order}; }
			if (state.reorderWasClosed && wasClosed !== undefined) state.reorderWasClosed[from] = wasClosed;
			// What takes the section out again, for an Undo the folder refuses (_rapierNotesSnackActivate).
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
// Keep or Drop on a change an agent proposed (notes.propose). Keep writes its words into the note it changes through that note's own
// save (its history keeps what was there) and puts the proposal in Trash. Drop puts the proposal in Trash, where it can still be restored.
async function _rapierNotesProposal(file, keep) {
	const state = _rapierNotes, entry = state.index?.notes[file], proposal = entry?.proposed;
	// Answered once: a pointer-up and its click (or a second tap) find nothing left to answer.
	if (!proposal || entry.trashed || state.keyBusy) return;
	state.keyBusy = true;
	try {
		if (keep) {
			const target = state.index.notes[proposal.of];
			if (!target || target.trashed) { showToast('The note this change was for is no longer in your notes', 'info'); return; }
			const text = state.texts.get(file) ?? await _rapierNotesStore.read(file);
			// A certified save records its version, and the owner's save writes bytes only: the editor's
			// flush and a card tick record theirs beside it, so Keep does too. A note with no past yet
			// (written outside this editor, or before history existed) has its words as they stood recorded
			// first, so "what was there" is in the past beside what Keep put in.
			const H = globalThis.RapierNotesHistory;
			if (H?.manifestName && target.id && await _rapierNotesStore.readHistory(H.manifestName(target.id)) == null) {
				const was = state.texts.get(proposal.of) ?? await _rapierNotesStore.read(proposal.of);
				if (was != null) await _rapierNotesRecordVersion({file: proposal.of, text: was, entry: target, reason: 'save'});
			}
			const saved = await _rapierNotesSave(proposal.of, text), kept = saved?.file || proposal.of;
			await _rapierNotesRecordVersion({file: kept, text, entry: state.index?.notes[kept], reason: 'save'});
			_rapierNotesHold(kept, text);
		}
		state.selected.clear(); state.selected.add(file);
		await _rapierNotesAct('trash');
	} catch (error) { showToast('The proposal was not answered: ' + String(error?.message || error), 'error'); }
	finally { state.keyBusy = false; _rapierNotesRender(); }
}
async function _rapierNotesAct(act, arg) {
	if (_rapierNotes.captureToken && !_rapierNotes.capturePreparing && !await _rapierNotesUnlock()) return;
	if (act === 'backup-discard-unfinished') { await _rapierNotesDiscardUnfinishedBackup(); return; }
	if (act === 'backup-cancel') { _rapierNotes.backupController?.abort(new Error('cancelled by the person')); return; }
	if (act === 'backup-export') { await _rapierNotesExportPreparedBackup(); return; }
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
	// A fresh open of the Remind face starts its date and time from the note's own reminder; the
	// draft only survives while the face stays up (a Set, a repeat: the sheet's "stays" list).
	// Reminders are the Android app's alone: on the page no bell raises the face, whichever bar draws
	// one.
	if (act === 'remind-face') { if (!_rapierNotesIsApp()) return; state.remindDraft = null; _rapierNotesOpenSheet(null, 'remind'); return; }
	if (act === 'connections') { _rapierNotesOpenSheet(null, 'connections'); return; }
	if (act === 'tags-face') { _rapierNotesOpenSheet(null, 'tags'); return; }
	if (act === 'tag-add') { if (_rapierNotes.current) await _rapierNotesTagAdd(_rapierNotes.current, String(arg ?? '')); return; }
	if (act === 'section-add') { await _rapierNotesSectionAdd(String(arg ?? '')); return; }
	if (act === 'tag-remove') { if (_rapierNotes.current && arg) await _rapierNotesTagRemove(_rapierNotes.current, String(arg)); return; }
	// The note's own past. The list is read before the face is drawn, so a person never watches an
	// empty sheet fill in; `historyRows` is null when the past is there but could not be read, which
	// the face says in as many words rather than showing an empty list and implying there is nothing.
	if (act === 'history-face') {
		const file = _rapierNotes.current;
		const read = file ? await _rapierNotesHistoryRead(file) : {kind: 'new', versions: []};
		const firstId = read.versions.reduce((low, v) => Math.min(low, v.id), Infinity);
		const previews = await _rapierNotesHistoryPreviews(read);
		_rapierNotes.historyRows = read.kind === 'unreadable' ? null
			: read.versions.map(v => ({id: v.id, time: v.time, reason: v.reason, size: v.size, current: v.id === read.manifest?.current, first: v.id === firstId, preview: previews.get(v.id) || ''}));
		// The visible removal record: a note that has been tidied says so on its own face, with how many
		// versions went and when, rather than simply having fewer rows than the person remembers putting
		// there.
		_rapierNotes.historyTidied = read.tidied ? {count: read.tidied, at: read.tidiedAt} : null;
		_rapierNotesOpenSheet(null, 'history');
		return;
	}
	// A row opens the version rather than restoring it. Putting words back is not a thing to do on a
	// tap that could have been a scroll, and a person deciding should see what would change first: a
	// restore shows its target and what it would do.
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
	// The open note's attach rows: each presses the editor's own control for what it names. There is one door
	// to this face -- the top bar's plus.
	// Every row of the plus sheet is an act the trigger knows -- Add file and Saved files included -- so no
	// row closes the sheet and does nothing.
	if (act === 'add-kind') { const kind = String(arg || ''); _rapierNotesCloseSheet(); if (['drawing', 'picture', 'photo', 'recording', 'attachment', 'files'].includes(kind)) _rapierNotesTrigger(kind); return; }
	// The find opens on the next tick: the tap that asked for it is still bubbling, and the editor
	// closes its own find on a click that lands outside the bar (this row is outside it).
	if (act === 'find-note') { _rapierNotesCloseSheet(); setTimeout(_rapierNotesFindInNote, 0); return; }
	if (act === 'boxes') { _rapierNotesCloseSheet(); if (typeof _rapierTodoBoxesFlip === 'function') await _rapierTodoBoxesFlip(); return; }
	if (act === 'uncheck-all' || act === 'delete-checked') { _rapierNotesCloseSheet(); if (typeof _rapierTodoBatch === 'function') await _rapierTodoBatch(act); return; }
	if (act === 'undo') {
		await _rapierNotesSnackActivate('undo'); return;
	}
	// The due-reminder snackbar's own two acts: they answer the file the snack named, never the card
	// selection, and always pump the next queued one.
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
	// A Delete or an Archive of the note that is OPEN puts the person back at the cards first, where
	// Keep leaves them and where the snackbar's undo is under the thumb; the act itself is the cards'
	// own, unchanged, on the same note.
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
	// Every entry as it was, so a write the folder refuses leaves the cards showing what the folder
	// holds.
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
	// A quick choice or a custom Set always starts a plain one-off (Keep's own way: a repeat is a
	// separate, deliberate step through the chips below, never silently carried over from before).
	else if (act === 'remind-pick' || act === 'remind-set') {
		const at = act === 'remind-pick' ? Number(arg) : _rapierNotesParseLocalDateTime(arg);
		if (!Number.isFinite(at)) return;
		for (const f of files) state.index = M.setRemind(state.index, f, { at });
		// Said, not only worn by the bell: the words the card will carry. A custom Set keeps the sheet,
		// which grows its Repeat and Remove rows below the calendar; the sheet scrolls to show them.
		reminderAt = at;
		if (act === 'remind-set') state.remindReveal = true;
	}
	else if (act === 'remind-repeat') {
		for (const f of files) {
			const cur = state.index.notes[f]?.remind; if (!cur) continue;
			state.index = M.setRemind(state.index, f, { at: cur.at, repeat: cur.repeat === arg ? undefined : arg });
		}
	}
	// The removal is not said until the sidecar actually holds it (the same rule remind-pick and
	// remind-set follow through reminderAt/_rapierNotesRemindConfirm below); a refused write falls to
	// the ordinary error toast just past the write, never this deferred success.
	else if (act === 'remind-remove') { for (const f of files) state.index = M.setRemind(state.index, f, null); reminderRemoved = true; }
	else if (act === 'copy') {
		// Keep's "Make a copy": the same words in a new file, right after the original.
		const file = files[0]; let text;
		if (file === state.current) {
			const captured = await _rapierWithSettledExternalDocument(() =>
				file === state.current && rapier.document.filename === file ? _rapierSourceText() : null);
			if (!captured.settled) return;
			text = captured.value;
		}
		if (text == null) text = (await _rapierNotesTexts([file])).get(file);
		if (typeof text !== 'string') { showToast('The note could not be read. No copy was made.', 'error'); return; }
		const names = Object.keys(state.index.notes);
		const made = await _rapierNotesWriteNew(text, M.noteFileName(text.trim() || 'Note', names));
		_rapierNotesAdmit(made, text);
		const copy = state.index.notes[made], from = state.index.notes[file];
		if (copy && from) { Object.assign(copy, { pinned: from.pinned, skill: from.skill, colour: from.colour, category: from.category, created: Date.now(), modified: Date.now() }); copy.order = M.orderAfter(from.order); }
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
	// The person's change is shown at once; the folder's refusal below restores what was.
	// A colour is washed in, and a pin flown in, once the folder has it (_rapierNotesWash,
	// _rapierNotesPinFlight), so the cards keep what they wore until then rather than showing it twice.
	const wash = act === 'colour-pick' ? _rapierNotesWashFrom(files) : null;
	if (!wash && !flight) _rapierNotesRender();
	try { await _rapierNotesWriteIndex(); }
	catch (error) {
		// delete-forever never reaches here (its own removals already returned above), so every act
		// left is a field-only change and every entry goes back exactly as it was.
		for (const [f, e] of whole) if (state.index.notes[f]) state.index.notes[f] = e;
		showToast('The change was not written to the notes folder: ' + String(error?.message || error), 'error');
		_rapierNotesRender(); return;
	}
	// A pin, a colour, a section, a reminder or a trashing changes what the library sees of a note
	// (the entry is part of its projection), so the index follows the entry.
	if (typeof _rapierNotesLibraryTouch === 'function') for (const f of files) _rapierNotesLibraryTouch(f);
	// Trashing a note and bringing it back are events in its own past, recorded after the sidecar is
	// written because that is where the identity and the entry they describe now live. The words do
	// not change, and that is the point: the version says WHAT HAPPENED to the note, so a history
	// read later is a record of a life rather than a list of edits with holes in it. A note whose
	// text is not in hand (the cards, not the composer) is read from the folder for the snapshot.
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
	// The open note's head wears what its entry says, whichever face changed it.
	_rapierNotesHeadPaint();
	if (flight) _rapierNotesPinFlight(flight, new Set(files));
	else if ((act === 'pin' && every('pinned')) || act === 'remind-pick' || act === 'remind-set') _rapierNotesFlourish(act === 'pin' ? 'pin' : 'remind', new Set(files));
	if (stays) _rapierNotesOpenSheet();
	if (snack) _rapierNotesSnack(snack, before);
	if (reminderAt != null) await _rapierNotesRemindConfirm(reminderAt, files);
	// A success belongs to the written sidecar, never the act that only staged the change.
	else if (reminderRemoved) showToast('Reminder removed', 'info');
}
// Two small flourishes, once a write has landed: a pin pinned is pushed in along its needle and
// settles, the way a pin goes into a board; a reminder set rings its bell, a swing that dies away.
// They play on the glyphs that say so -- the bell in the open note's head, and the pin mark and the
// bell chip the note's card now wears -- so nothing is drawn that was not already there. The head's
// own pin plays nothing: _rapierNotesHeadPaint fills it, and that is all.
// The cards render on a later frame; the flourish waits a few frames for them.
function _rapierNotesFlourish(kind, files, frames = 12) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
	const head = frames === 12 && kind !== 'pin' ? [...document.querySelectorAll('#btn-notes-remind svg')] : [];
	// The card as it was is still up for a frame or two; only a card drawn since the write is played on.
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
// The pin's flight.
// Pinned from the selection bar: the card glides up into Pinned while a pin leaves the bar's own pin
// button -- a crouch, then away -- swings out and down on an S, needle first like a dart, trailing two
// fading ghosts, and drives into the very spot on the card where its mark lives; a small puff, the
// mark settles, and it is the mark. Several notes pinned at once each get their own pin, one after
// another. Unpinned: the pin pops off the card and tumbles away, and the card, let go, drops into its
// place below with a wobble and a bounce. Every other card that moved glides to its new place instead
// of jumping. One absolutely placed glyph per pin (and its two ghosts) on the Notes surface and the
// cards' own transforms, through the Web Animations API; nothing is written and nothing waits on it.
function _rapierNotesPinFlightFrom(files, on) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches || !_rapierNotes.surface) return null;
	const places = new Map(), marks = new Map();
	for (const card of document.querySelectorAll('.rapier-notes-card')) {
		const box = card.getBoundingClientRect(); if (!box.width) continue;
		places.set(card.dataset.notesFile, {x: box.left, y: box.top, node: card});
		const mark = !on && files.includes(card.dataset.notesFile) && card.querySelector('.rapier-notes-mark')?.getBoundingClientRect();
		if (mark?.width) marks.set(card.dataset.notesFile, mark);
	}
	// No cards on screen (a note pinned from its own head): the head's flourish answers instead.
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
	// The cards are drawn again on a later frame: everything waits for the new cards, then is measured,
	// then moves, all in that one frame.
	const cards = [...document.querySelectorAll('.rapier-notes-card')];
	if (!cards.some(card => files.has(card.dataset.notesFile) && card !== flight.places.get(card.dataset.notesFile)?.node)) {
		if (frames > 0) requestAnimationFrame(() => _rapierNotesPinFlight(flight, files, frames - 1));
		return;
	}
	const targets = flight.on && flight.from ? cards.filter(card => files.has(card.dataset.notesFile)).map(card => card.querySelector('.rapier-notes-mark')).filter(Boolean).map(mark => ({mark, box: mark.getBoundingClientRect()})) : [];
	_rapierNotesMoves(flight.places, files, !flight.on);
	targets.forEach((target, i) => _rapierNotesPinFly(flight.from, target.mark, target.box, i * 90));
	for (const box of flight.marks.values()) {
		// Off it comes, the other way from the card: it springs up and out (40px up at the top of its
		// arc, 70px across), spinning, while the card drops away below it; then it falls and fades.
		const size = box.width, x = box.left, y = box.top, drift = 70;
		const pop = _rapierNotesPinGlyph(size, 1); pop.style.zIndex = '6';
		_rapierNotesGone(pop.animate(Array.from({length: 25}, (_, i) => {
			const u = i / 24;
			return {transform: 'translate(' + (x + drift * u) + 'px,' + (y - 267 * u + 444 * u * u) + 'px) rotate(' + (360 * u + 90 * u * u) + 'deg) scale(' + (1 + .5 * Math.sin(Math.PI * Math.min(1, u * 1.4))) + ')', opacity: u < .6 ? 1 : 1 - (u - .6) / .4};
		}), {duration: 820, easing: 'linear'}));
	}
}
// The cards that moved go from where they were to where they are (their old place is laid over the
// transform the grid gives them, and taken away). A card let go by its pin falls instead: a little
// hop as the pin lets go, a fall that gathers speed with a wobble, and a bounce where it lands.
function _rapierNotesMoves(places, chosen, falling) {
	// Low-end phones first: animate only what is visible -- a card whose old place and new place are
	// both off the screen simply appears there.
	const seen = box => box.bottom > 0 && box.top < innerHeight;
	for (const card of document.querySelectorAll('.rapier-notes-card')) {
		const was = places.get(card.dataset.notesFile); if (!was || was.node === card) continue;
		const box = card.getBoundingClientRect(), dx = was.x - box.left, dy = was.y - box.top;
		if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
		if (!seen(box) && !seen({top: was.y, bottom: was.y + box.height})) continue;
		const grid = getComputedStyle(card).transform, base = grid === 'none' ? '' : ' ' + grid;
		const at = (x, y, turn = 0) => ({transform: 'translate(' + x + 'px,' + y + 'px)' + base + ' rotate(' + turn + 'deg)'});
		// The card that was pinned or let go travels over the others, not under them.
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
	// The path is an S: out and down into the open page below the head (never along it, where the
	// head's own icons are), then swinging back across to come in over the mark's upper right, down
	// along the needle's own line (down and to the left), so it lands straight and needle first.
	const swing = Math.min(Math.max(x0 - 130, 28), innerWidth - 28);
	const p = [[x0, y0], [swing, y0 + 90 + reach * .12], [tx + k, ty - k], [tx, ty]];
	const at = (t, i) => (1 - t) ** 3 * p[0][i] + 3 * (1 - t) ** 2 * t * p[1][i] + 3 * (1 - t) * t * t * p[2][i] + t ** 3 * p[3][i];
	const slope = (t, i) => 3 * (1 - t) ** 2 * (p[1][i] - p[0][i]) + 6 * (1 - t) * t * (p[2][i] - p[1][i]) + 3 * t * t * (p[3][i] - p[2][i]);
	const place = (x, y, turn, scale) => ({transform: 'translate(' + (x - size / 2) + 'px,' + (y - size / 2) + 'px) rotate(' + turn + 'deg) scale(' + scale + ')'});
	// A wind-up first: the pin crouches and leans back where the button was (the first eighth).
	const keys = [{...place(x0, y0, 0, 1), offset: 0}, {...place(x0, y0 + 2, -22, .8), offset: .12}];
	let last = 0;
	for (let i = 1; i <= 36; i++) {
		// Then away: quick off the mark, slowing as it steers itself onto the card.
		const v = i / 36, t = 1 - (1 - v) ** 2.3;
		// The needle points down and to the left (135 degrees); it turns to face the way it is going,
		// out of the wind-up's lean. The curve ends on the needle's own line, so the turn ends at 0.
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
// The colour wash (rapier-notes.css): a card given a new colour takes it the way paper takes ink,
// from the middle outwards -- its old ground drawn over the new one with a hole that grows until
// nothing of it is left. Read before the render, played after it, on the cards that changed.
function _rapierNotesWashFrom(files) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
	const was = new Map();
	for (const card of document.querySelectorAll('.rapier-notes-card')) if (files.includes(card.dataset.notesFile)) was.set(card.dataset.notesFile, getComputedStyle(card).backgroundColor);
	return was.size ? was : null;
}
function _rapierNotesWash(was, frames = 12) {
	// The render lands on a later frame; the wash waits for the card that wears the new colour.
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

// The open document was the note just deleted forever: the editor lets go of it, so nothing typed
// afterwards can write the file back (it is gone, as the person was told). The person deleted a note,
// not the document the note was opened over: the page under the cards becomes an empty one under a
// notes authority, loaded without a flush, so the journal keeps the document the note-open wrote there
// and the return record (cameFrom) stays whole; leaving Notes brings that document back through the one
// way back (_rapierNotesEditor), its words, history and reading point, as from any note.
async function _rapierNotesBlankDocument() {
	_rapierNotesLeaveNote(); _rapierNotesMarkClean();
	try {
		if (typeof rapierLoad !== 'function') return;
		if (await rapierLoad('', 'untitled.md', {documentKind: 'markdown', deferFlush: true,
				documentAuthority: 'notes:' + _rapierCreateDocumentAuthority()})) _rapierNotesMarkClean();
	} catch (error) { console.warn('[rapier] notes', error); }
}
// The one door a note leaves the folder for good: the only deletion Rapier performs is one the
// person asked for by name, and it says so. DELETE FOREVER and the Trash sweep both come through the
// owner's own protocol (notes/trash.mjs through notes/folder.mjs trash): a tombstone is written and
// verified before a file is removed, so an interrupted removal is repaired on the next open rather
// than half-happening; a confirmed removal is bound to the note as the person saw it (its id, its
// Trash state, the digest of its words), and expiry weighs each note against the proof it carries --
// bytes that no longer match come BACK, a note without proof gets its seven days from verified
// bytes, a file that cannot be read is kept. Recordings only the removed notes named go with them.
async function _rapierNotesDeletionProof(files) {
	await _rapierNotesFlush();
	const texts = await _rapierNotesTexts(files, {hold: false});
	// Freeze every selected identity and body before hashing yields, and before the question opens.
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
	// The editor lets go of the open note FIRST: an autosave tick during the removal below would
	// otherwise write the file back after the person was told it was gone.
	await _rapierNotesFlush();
	const targets = new Set(files), owned = new Set(), shared = new Set();
	// A file nobody can read as text may still name a recording. Rather than guess, the recordings
	// all stay: a note is deleted because the person asked, a recording is not swept up on a guess.
	let unreadable = 0;
	const census = async names => {
		for (const name of names) {
			let text = null;
			try { text = await store.read(name); }
			catch (error) { if (error?.code !== 'unreadable') throw error; unreadable++; continue; }
			for (const row of A.recordingsOf(text)) (targets.has(name) ? owned : shared).add(row.name);
		}
	};
	// The targets' own words first: they name every recording the targets could own. The rest of the
	// folder is read only when there is one, to tell a recording shared with a surviving note from
	// one owned outright; a bin that names no recording costs no other body a read (reading every
	// note before the first card takes over a minute at 5,000 notes on a phone's CPU).
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
		// A selected note may have been revived or deferred, and another window may have acquired this
		// recording since the scan. The folder proves it unreferenced now.
		//
		// This scan is a FILTER, not the admission. It reads the current bodies only, and current bodies
		// were never the whole of the question: a surviving note's RETAINED PAST plays a recording too.
		// The one owner that answers "is this recording still reachable from anything retained" is
		// folder.discardAudio, under its own lock, over the verified history objects -- and it refuses
		// with `referenced` when it is. Do not grow a second copy of that question here; a filter that
		// guesses wrong costs nothing, and this one only ever guesses towards asking.
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
// Trash keeps a note seven days, then it is gone. Runs on every open, after the load. Seven days
// having passed is not on its own permission to destroy a file; the protocol above weighs each
// note against its proof. The note the person is looking at is never swept out from under them.
async function _rapierNotesSweepTrash() {
	const state = _rapierNotes, M = _rapierNotesModel();
	const candidates = Object.keys(state.index.notes).filter(file => state.index.notes[file].trashed && file !== state.current);
	if (!candidates.length) return;
	// Whether the owner could act at all, read from this window's own fresh picture of the folder and
	// the bin's own bytes: a note past seven days, one with no proof (its clock restarts), one the
	// folder no longer answers for, one whose bytes changed (it comes back). None of those: nothing to
	// found a transaction on, and the folder is not taken under its lease (two folder reads and the
	// trash run cost seconds before the first card at 5,000 notes on a phone's CPU). The decision itself
	// is still the owner's, under the lease, from its own fresh read, whenever this says it could act; a
	// stale view here can only delay a sweep to the next open, never make one.
	const expired = new Set(M.expiredTrash(state.index, Date.now()));
	// An unfinished removal on the index is the owner's to finish (trash.mjs recoverTrash): always act.
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

// ---- The pickup ---------------------------------------------------------------------------------
// 500 ms, not Draw's 260: a hold in a SCROLLING surface competes with the person scrolling
// (layout/browser.js, HOLD_TO_MOVE). While the timer is pending nothing is captured and nothing is
// prevented, so a move before it fires is the page scrolling and cancels the hold. Lift before the
// timer opens the note; lift after it, without moving, opens the card's actions; move after it drags.
function _rapierNotesPointerDown(evt) {
	const state = _rapierNotes;
	// A drag whose finger the page never saw lift (a card dragged up into the head, after which every
	// later touch would be refused) ends at the next touch, wherever it lands: the card goes home and
	// the surface answers again. A pointer still in hand keeps its own id, so this never ends a drag
	// that is really in progress.
	if (state.drag && state.drag.id !== evt.pointerId) _rapierNotesAbortDrag();
	const card = evt.target.closest('.rapier-notes-card');
	if (!card || state.drag || (evt.pointerType === 'mouse' && evt.button !== 0)) return;
	const drag = state.drag = { card, file: card.dataset.notesFile, id: evt.pointerId, x0: evt.clientX, y0: evt.clientY, held: false, moved: false, ghost: null, timer: 0, cancelled: false, fold: evt.target.closest('[data-notes-fold]')?.dataset.notesFold || null, check: evt.target.closest('[data-notes-check]')?.dataset.notesCheck ?? null, play: evt.target.closest('[data-notes-play]')?.dataset.notesPlay ?? null, act: evt.target.closest('.rapier-notes-card [data-notes-act]')?.dataset.notesAct || null };
	// The press ring (Draw's own idea): the hold shows itself filling from where the finger is, so a
	// person knows a lift is coming and a scroll is not one.
	const r = card.getBoundingClientRect();
	card.style.setProperty('--px', Math.round(evt.clientX - r.left) + 'px'); card.style.setProperty('--py', Math.round(evt.clientY - r.top) + 'px');
	card.classList.add('rapier-notes-card--pending');
	// The card's box and face are taken now, at the touch: a render deferred behind this finger (a
	// read landing, a resize) rebuilds the cards before the finger lifts, and the lift must still
	// grow from where the person's finger was.
	drag.snap = _rapierNotesLiftSnapshot(drag.file, card);
	drag.timer = setTimeout(() => {
		if (state.drag !== drag || drag.cancelled) return;
		drag.held = true;
		try { card.setPointerCapture(evt.pointerId); } catch (_) {}
		try { navigator.vibrate?.(12); } catch (_) {}
		card.classList.remove('rapier-notes-card--pending');
		// The held card grows a little and lifts in the hand, dragged freely; there is no copy of it.
		card.classList.add('rapier-notes-card--held');
		// Keep's hold: after the slight delay the card is selected and the head becomes the selection's
		// -- an X, the count, the acts -- with no sheet raised. A finger that then moves cancels the
		// selection and carries the card (_rapierNotesPointerMove).
		_rapierNotesAddsToggle(false);
		if (!state.selected.has(drag.file)) _rapierNotesSelect(drag.file, false);
	}, RAPIER_NOTES_HOLD_MS);
}
// The card follows the finger: its translate inside its grid is the finger less where the finger
// took hold of it, read against the grid's box now (an edge scroll moves the grid under the finger).
function _rapierNotesDragFollow(drag) {
	const gr = drag.grid.getBoundingClientRect();
	drag.card.style.setProperty('--x', (drag.lastX - gr.left - drag.grabX) + 'px'); drag.card.style.setProperty('--y', (drag.lastY - gr.top - drag.grabY) + 'px');
}
function _rapierNotesPointerMove(evt) {
	const state = _rapierNotes, drag = state.drag;
	if (!drag || evt.pointerId !== drag.id) return;
	const dx = evt.clientX - drag.x0, dy = evt.clientY - drag.y0, travel = Math.hypot(dx, dy);
	if (!drag.held) {
		// The page is scrolling: the hold is off, the card stays where it is.
		if (travel > RAPIER_NOTES_HOLD_SLOP) { drag.cancelled = true; clearTimeout(drag.timer); state.drag = null; drag.card.classList.remove('rapier-notes-card--pending'); }
		return;
	}
	evt.preventDefault();
	if (!drag.moved) {
		if (travel < RAPIER_NOTES_MOVED_PX) return;
		drag.moved = true;
		// A carried card is not a selected one: the selection is cancelled, the sheet with it, and the
		// person is simply moving notes around.
		if (state.selected.size) _rapierNotesCloseSheet();
		// The card's own box at pickup, unscaled (the hold's lift is a transform: the layout box is
		// the card's), and where in it the finger holds; the finger carries the card from there.
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
// A card carried into ANOTHER section -- its head or its grid, a collapsed one included -- lands
// there when the finger lifts. Trash is never a drop: a delete is a deliberate act with its own
// snackbar. Pinned is never a drop either: notes are pinned only by the pin icon (a card FROM Pinned
// still leaves it by a drag: the drop's own undo loop unpins it). A section is earned, with visible
// feedback:
//   - the carried card's centre must be well inside the section, a quarter of the card's own height
// from its nearest edge (or the middle of a section shorter than that): the carried card is about a
// quarter of a card off its own centre line when a person is merely passing a section's edge on the
// way to a place in their own grid, and a collapsed section is only its head;
//   - and it must stay there for 400 ms: longer than the 120 ms the cards of a grid wait before they
// make way (a place among cards is cheap to change back, a section is not), and about the time a
// finger takes to settle and a person to see the section answer before they let go;
//   - the section says it is taking the card while it waits: its word's worn mark -- the head's own
// mark, nothing new drawn -- fills from the left over those 400 ms, the word inverting as it is
// covered, so a person sees it coming and can pull back; leaving before it is full takes the mark
// away and nothing else happens. Full, it is the solid mark it has always been, and the hold's own 12
// ms pulse says the card is now going there. Under reduced motion there is no fill: the mark is
// placed at once when the 400 ms are up.
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
		// Well inside: a quarter of the carried card's height from the section's nearest edge, or a quarter
		// of the section's own height where the section is the shorter -- so a section of one short card
		// still has a middle half to be dropped into. And the FINGER counts as well as the card's centre: a
		// tall card carried by its top has its centre a screen's third below the finger, and the person is
		// pointing with the finger.
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
		// The finger took the card back out: that section's cards close the place, and the card's own grid
		// opens its place again (the pack keeps the carried card's slot) for the drag to read afresh.
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
		// The section has the card: its own grid closes the place the card left, and the dwell on the place
		// in the new section starts now, so a finger already still there is answered without another move.
		if (drag.grid?.isConnected) { _rapierNotesMakeWay(drag.grid, -1, 0); _rapierNotesDragFollow(drag); }
		_rapierNotesDragOver(drag);
	}, RAPIER_NOTES_SECTION_DWELL_MS);
}
// Where in the target section the card lands: the same owner as the drag's (`_rapierNotesPlace`), asked with
// the carried card's top left (x, y, on screen) and its height against the target grid's own boxes, so a card
// carried into the other column of another section lands in that column, where it was held. The place is read
// before anything changes and named by its neighbour, then turned into the section's own index, so a window
// that shows only some of the section's cards still gives the section's place.
function _rapierNotesDropPlace(id, x, y, file, height) {
	const state = _rapierNotes, grid = state.grids[id]; if (!grid) return {first: true};
	const gr = grid.getBoundingClientRect(), place = _rapierNotesPlace(grid, file, x - gr.left, y - gr.top, height);
	if (!place || !place.others.length || place.index === 0) return {first: true};
	return {file: place.others[place.index - 1].dataset.notesFile, after: true};
}
// The place as the section's own index, once the card is in the section.
function _rapierNotesDropIndex(id, place, file) {
	const files = _rapierNotesModel().sortedSection(_rapierNotes.index, id).filter(f => f !== file);
	const i = place.first ? -1 : files.indexOf(place.file);
	return i < 0 ? 0 : i + (place.after ? 1 : 0);
}
// The acts Notes already has, never a second path: Pinned, Skills and Archive are the sheet's own
// pin/skill/archive; a person's own section and Other are the sheet's own section-pick. A flag that
// outranks the category (notes/model.mjs sectionOf) is cleared by its own act first, or the card
// would not land where the finger left it.
async function _rapierNotesDropSection(file, id, x, y, height) {
	const state = _rapierNotes, M = _rapierNotesModel();
	const entry = state.index.notes[file]; if (!entry) { _rapierNotesRender(); return; }
	const place = _rapierNotesDropPlace(id, x, y, file, height);
	const flag = id === 'pinned' ? 'pinned' : id === 'skills' ? 'skill' : id === 'archive' ? 'archived' : '';
	const act = id === 'pinned' ? 'pin' : id === 'skills' ? 'skill' : id === 'archive' ? 'archive' : '';
	const one = () => { state.selected.clear(); state.selected.add(file); };
	if (flag) { if (entry[flag]) { _rapierNotesRender(); return; } one(); await _rapierNotesAct(act); }
	else {
		for (const [key, undo] of [['trashed', 'restore'], ['archived', 'archive'], ['skill', 'skill'], ['pinned', 'pin']]) {
			if (!state.index.notes[file]?.[key]) continue;
			one(); await _rapierNotesAct(undo);
		}
		one(); state.dropping = true;
		try { await _rapierNotesAct('section-pick', id === 'others' ? '' : id); }
		catch (error) { state.dropping = false; throw error; }
	}
	try {
		_rapierNotesCloseSheet();
		const at = _rapierNotesDropIndex(id, place, file);
		if (state.index.notes[file] && M.moveTo(state.index, file, at)) {
			try { await _rapierNotesWriteIndex(); }
			catch (error) { showToast('The new place was not written to the notes folder: ' + String(error?.message || error), 'error'); }
		}
	} finally { state.dropping = false; state.renderAfterDrag = false; }
	// The card lands from where the finger let it go: the drawing below makes it afresh in its new section,
	// and its first placement rides the spring from that point into its slot (`_rapierNotesPlaceCard`).
	if (Number.isFinite(x) && Number.isFinite(y)) state.landing = {file, x, y, at: performance.now()};
	_rapierNotesRender();
}
// Where a carried card goes: ONE owner for the drag and the drop, so a card dragged anywhere, across columns
// included, takes the closest place and the others rearrange after a delay. `x`, `y` are the carried card's
// top left in `grid`; the answer is the index among the grid's other cards whose slot is closest to it, read
// across every column: in the column the card's centre is over, the slot whose top is nearest the card's top,
// unless another column has a slot nearer by plain distance from that column's line (notes/library-window.mjs
// nearestSlot, packed by the page's own shortest-column rule, so the slot answered is the slot the pack will
// give). The boxes read are the pack's own (`data-notes-box`), so a move lays nothing out. `keep` is the index
// the cards are making now, for the drag alone: it holds while it is within a finger's tremor (the hold's 8 px
// slop) as near as the nearest, so a finger resting on the line between two places never swaps the cards back
// and forth. The drop passes -1: the lift writes the nearest place, and the keep and the delay never decide
// where a card lands.
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
// The carried card's top left in its own grid: the finger less where the finger holds the card (the pickup's
// grab), read against the grid's box now (an edge scroll moves the grid under the finger).
function _rapierNotesHeldAt(drag, grid = drag.grid) {
	const gr = grid.getBoundingClientRect();
	return {x: drag.gx + drag.dx - gr.left, y: drag.gy + drag.dy - gr.top};
}
// The cards of a grid the carried card is not in make its place by their transforms alone: laid by the pack's
// own shortest-column rule over their own boxes' heights, with a hole of the carried card's height at `index`
// (-1: no hole, the cards as they would stand without the carried card). `restore` puts every card back on
// the box the pack gave it. The grid grows to hold the hole but never shrinks under the finger, so the
// sections below never jump up into it. The drop draws the surface again with the card in its place, which
// is where this laid the others, so nothing moves twice.
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
// The cards make the place: the finger holds a position, and after a slight delay the other notes animate
// smoothly into new positions. The delay is a dwell on the place, 120 ms: it stops the cards thrashing while
// the finger passes through, and it never decides where a card lands -- the lift (`final`) reads the place
// once more from where the finger is, from the same owner, and writes that. The place is a pure function of
// where the card is held (the other cards keep their order through a drag; only the carried card moves among
// them), so a still finger asks the same place again and nothing flickers.
// While another section is taking the card (its mark filling) its own grid's cards are left as they stand,
// and once that section has earned it the place is made there and written by the drop
// (`_rapierNotesDropSection`), read by the same owner. Anywhere else, over another section included, the
// place is the card's own section's.
function _rapierNotesDragOver(drag, final = false) {
	// Sorting and dragging must not disagree: under a date sort a place among the cards is not a
	// place in the person's own order, so the cards do not make way and the drop says so once; a drag
	// into another section still lands there.
	if (_rapierNotesSortMode() !== 'custom') { drag.sortedStill = true; return; }
	// Earned by another section, the card's place is made THERE, by the same owner and the same dwell: that
	// section's cards slide apart to open the place (their transforms only; the card joins them at the drop).
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
		// A section above the card's own grows to hold the place and carries the card's grid down with it: the
		// card is placed again under the finger (measured: 51 px off the finger until the next move, without).
		_rapierNotesDragFollow(drag);
		return;
	}
	// Over another section that has not taken the card (Pinned, which never does; the band just past the card's
	// own section, too near the next one's edge for it to take the card; one passed on the way), the card is still
	// its own section's, and its place there is read as anywhere else: the place nearest where it is held, from
	// the whole grid, so a card let go just past either end of its section lands at that end, where the cards
	// opened it. Only while another section's mark is filling do its own cards stand still (one thing answers the
	// finger at a time); the lift reads the place once more even then. Above every section (the head, #363) the
	// nearest place is the first.
	if (drag.taking && !final) { drag.dwell = null; clearTimeout(drag.dwellTimer); return; }
	const grid = drag.grid, cards = [...grid.children].filter(c => c.classList.contains('rapier-notes-card')), at = cards.indexOf(drag.card);
	// The lift (`final`) reads the nearest place with no keep: the keep, like the delay, is the preview's alone.
	const held = _rapierNotesHeldAt(drag), place = _rapierNotesPlace(grid, drag.file, held.x, held.y, drag.gh, final ? -1 : at);
	if (!place || at < 0) return;
	if (place.index === at) { drag.dwell = null; clearTimeout(drag.dwellTimer); return; }
	const key = place.index + '@' + (place.others[place.index]?.dataset.notesFile ?? '$');
	if (!final) {
		// The card in hand sits over a place for a moment before the others make way -- a slight delay,
		// then they slide. The moment is a timer of its own, so a finger that stops dead over a place is
		// answered without another move.
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
// A card held at the top or bottom edge scrolls the surface, and keeps scrolling while the finger
// holds still there (a frame loop, not one step per pointer move): the cards slide under the ghost
// and the card takes its place among them as they pass.
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
	// Keep's own drop: the card in hand slides into its slot rather than blinking there -- the card's
	// own transform transition, from the finger's place to the slot the pack kept for it; nothing
	// under it is rebuilt, so the cards that slid aside keep their places.
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
// The page going away mid-hold (a call, a switch of app): the drag ends here rather than waiting for
// a pointercancel the platform may never send, so no later touch is refused by a hold nobody holds.
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
		// A control of the card's own (a proposal's Keep or Drop) answers here, as a tick box does: a touch on a card makes
		// no click. The card does not open.
		if (drag.act) { if (drag.act === 'proposal-keep' || drag.act === 'proposal-drop') void _rapierNotesProposal(drag.file, drag.act === 'proposal-keep'); return; }
		if (drag.fold) { _rapierNotesFold(drag.file, drag.fold === 'show', false); return; }
		if (drag.play != null) { if (typeof _rapierRecorderCardToggle === 'function') _rapierRecorderCardToggle(drag.file, drag.play); return; }
		// The tap's own click follows this pointer-up. By then Notes is closing, so it would land on
		// whatever is under the finger next -- the editor's page, or the unsaved-changes question, which
		// it would cancel -- so the one click is swallowed (the sheet swipe's own rule).
		// A tap on a card is a tap elsewhere for the bars: the plus's bar goes down, and an empty search
		// with it; the note then opens over a surface that is at rest.
		_rapierNotesAddsToggle(false); if (!state.query) _rapierNotesSearchToggle(false);
		if (state.selected.size) _rapierNotesSelect(drag.file); else { state.swallowClick = performance.now(); state.openFrom = drag.snap || _rapierNotesLiftSnapshot(drag.file, drag.card); await _rapierNotesOpenNote(drag.file); }
		return;
	}
	if (!drag.moved) { _rapierNotesDropDrag(drag); if (deferred) _rapierNotesRender(); if (!state.selected.has(drag.file)) _rapierNotesSelect(drag.file, false); return; }
	// One key: the card's new place among its section's cards, read off the cards ON SCREEN. Under a
	// search the grid shows a few of the section's cards, so the card's index there is not its index
	// in the section: the place written is after the card seen to its left, else before the one seen
	// to its right, in the section's own order. A card rebuilt out from under the drag (a resize is
	// deferred, a load is not) has no parent: then nothing is written and the surface is drawn again.
	// Carried into another section, the card lands there rather than reordering its own.
	if (drag.over) {
		// The place is read at the lift with no keep (the place the cards opened is the preview's; the nearest is the drop's).
		const id = drag.over, x = drag.gx + drag.dx, y = drag.gy + drag.dy, file = drag.file, height = drag.gh;
		// The card stays where the finger let it go (not back to its old slot) until it is made again in
		// its new section, and the cards there keep the place they opened.
		delete drag.card.dataset.notesHome; drag.hole = null;
		_rapierNotesDropDrag(drag);
		try { await _rapierNotesDropSection(file, id, x, y, height); }
		finally { if (drag.card.isConnected && drag.card.parentElement === drag.grid) _rapierNotesRender(); }
		return;
	}
	if (drag.grid && drag.card.parentElement === drag.grid) _rapierNotesDragOver(drag, true);
	const grid = drag.card.parentElement;
	_rapierNotesDropDrag(drag, !!(drag.reordered && grid && !deferred));
	// The words name the order the person actually chose, not "date": being told the cards are sorted
	// by date while they are sorted by title is the kind of small lie that makes a person stop
	// believing the rest of the sentence.
	if (drag.sortedStill && !drag.reordered && !state.sortedStillSaid) {
		state.sortedStillSaid = true;
		const said = RAPIER_NOTES_SORT_WORDS[_rapierNotesSortMode()] || 'this order';
		showToast('Sorted by ' + said + ', so the cards keep that order. Choose Custom in the menu to arrange them by hand.', 'info');
	}
	if (drag.reordered && grid) {
		const M = _rapierNotesModel(), shown = [...grid.children].filter(c => c.classList.contains('rapier-notes-card')).map(c => c.dataset.notesFile);
		const at = _rapierNotesPlaceAmong(drag.file, shown), entry = state.index.notes[drag.file], was = entry?.order;
		if (at >= 0 && entry && M.moveTo(state.index, drag.file, at)) {
			try { await _rapierNotesWriteIndex(); }
			catch (error) { entry.order = was; showToast('The new order was not written to the notes folder: ' + String(error?.message || error), 'error'); _rapierNotesRender(); return; }
		}
		if (!deferred) return; // the cards already stand where the pack put them; nothing to rebuild
	}
	_rapierNotesRender();
}
// Where `file` now sits in its section, given the order of the cards on screen (which may be a
// search's few): the index `moveTo` takes, over the section's files without `file`.
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
// A tap on a card's box: that one task line flips in the file. The note open in the editor is the
// editor's to change: its pending edits reach the folder first, and the editor is handed the changed
// note back, so what the card shows and what the editor holds never disagree.
// One owner of the open note's source: while a note is open the editor owns its text, so a change
// made outside the editor -- a card's box, the to-do module's rows -- goes through the editor's own
// transaction (history, generation, the same load-preserving splice the agent's edits take), never a
// file write and a reload around it; the file follows through the note's own autosave, asked for at
// once. Undo reverts the tick. False, said, when the editor is mid-mutation (a paste, an undo) and
// the change could not be placed.
// `settle`: wait for the folder and say whether it kept the change. A keystroke must never wait on a
// write, so the default stays fire-and-forget -- but a CARD ACTION is not a keystroke. A tick or a
// tag is one discrete thing a person did, and its caller goes on to tell the card it happened.
// Saying so before the folder has the bytes would let the caller write the new words into
// `state.texts`, the next tick read them back, find them equal and mark the note clean over a write
// that had thrown. `state.texts` is the folder's own copy and has exactly one writer, the autosave,
// when a write LANDS; this returns whether it did.
async function _rapierNotesApplyText(next, operation, label, {settle = false} = {}) {
	const before = _rapierSourceText();
	if (before === next) return true;
	// The file these words belong to, taken now: `state.current` can move while the transaction and
	// the write are awaited (a note opened from a card, the editor let go of this one), and asking
	// afterwards whether "the current note" has these bytes would answer about a different file.
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
		// The autosave says what went wrong itself; what this needs to know is only whether the folder
		// has these bytes now, which is exactly what its own copy says -- about the file the words were
		// for, not whichever note happens to be open when the write comes back.
		try { await _rapierNotesAutosave(); } catch (_) {}
		return !!settling && _rapierNotes.texts.get(settling) === next;
	}
	void _rapierNotesAutosave().catch(() => {});
	return true;
}
// ---- Tags: the note's own, in its own words ------------------------------------------------------
// notes/frontmatter.mjs owns a note's tags -- reading them, writing them, keeping every byte around
// them exactly as it was -- and the search indexes them. This is the face that shows them, and
// nothing more: the module decides what a tag is and how the block is written, and this asks it.
//
// Writing follows the checkbox tap exactly: the open note goes through the editor's own transaction
// owner, so the change is undoable there and the autosave carries it to the file; a note that is not
// open is written to the folder directly. Never a second implementation of either.
function _rapierNotesTagsOf(file) {
	const F = globalThis.RapierNotesFrontMatter, text = _rapierNotes.texts.get(file);
	if (!F || typeof F.tagsOf !== 'function' || text == null) return [];
	try { return F.tagsOf(text); } catch (_) { return []; }
}
async function _rapierNotesWriteTags(file, tags) {
	const state = _rapierNotes, F = globalThis.RapierNotesFrontMatter;
	if (!F || typeof F.setTags !== 'function') { showToast('This build cannot write a note\'s tags.', 'error'); return false; }
	// Tags live in a note's Markdown; a code file's words are its own and are never written into.
	if (_rapierNotesModel().isCodeFile(file)) { showToast('A code file keeps no tags: its words are left as they are.', 'info'); return false; }
	if (state.current === file) { try { await _rapierNotesFlush(); } catch (_) { return false; } }
	await _rapierNotesTexts([file]);
	const text = state.texts.get(file); if (text == null) return false;
	let next;
	// The module refuses a tag it cannot write rather than mangling the block, and what it says is
	// what the person is told: this is one field in a metadata block, and the rest of the file is
	// not touched to make room for it.
	try { next = F.setTags(text, tags); }
	catch (error) { showToast('That tag could not be written into the note: ' + String(error?.message || error), 'error'); return false; }
	if (next === text) return true;
	if (state.current === file) { if (!await _rapierNotesApplyText(next, 'notes.tags', 'Tags', {settle: true})) return false; }
	else {
		try { await _rapierNotesSave(file, next); }
		catch (error) { showToast('The tag could not be written to the notes folder: ' + String(error?.message || error), 'error'); return false; }
	}
	_rapierNotesHold(file, next);
	if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file);
	return true;
}
async function _rapierNotesTagAdd(file, given) {
	// A leading hash is how a person says "tag" out loud, and is not part of the name.
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
	if (M.isCodeFile(file)) return; // a code file's "- [ ]" is code, not a box
	if (state.current === file) { try { await _rapierNotesFlush(); } catch (_) { return; } }
	await _rapierNotesTexts([file]);
	const text = state.texts.get(file); if (text == null) return;
	const next = M.toggleCheck(text, n); if (next == null) return;
	if (state.current === file) {
		// The open note: the editor's own transaction, the file through the autosave -- and the card is
		// not told the box is ticked until the folder has the line that says so.
		if (!await _rapierNotesApplyText(next, 'notes.tick', 'Tick', {settle: true})) return;
	} else {
		// A tick on the card of a note that is not open is a card edit in the note's own past, recorded
		// on the words that landed under the name the folder kept (`edit-card`).
		let saved;
		try { saved = await _rapierNotesSave(file, next); }
		catch (error) { showToast('The box could not be ticked in the notes folder: ' + String(error?.message || error), 'error'); return; }
		const kept = saved?.file || file;
		try { await _rapierNotesRecordVersion({file: kept, text: next, entry: state.index?.notes[kept], reason: 'edit-card'}); }
		catch (error) { console.warn('[rapier] notes history', error); showToast('The box is ticked, but this note\'s history could not record it.', 'error'); }
	}
	_rapierNotesHold(file, next);
	if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file);
	if (ink) await ink();
	_rapierNotesRender();
}
// The ink tick on a card (rapier-notes.css). The row is found when the finger lands, but inked only
// once the folder has the line (the law above: no card shows a tick the folder did not keep): the
// box gives, the tick is drawn out through its corner, the words are struck; then a row that is
// about to fold into "+ N checked items" shuts where it stands, so the render finds it already gone
// and the cards below ride the spring up into the room it left.
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

// ---- Import: every app whose export can be read
// --------------------------------------------------
// IMPORT opens a sheet naming every app; a row opens the file chooser, which lists every file (only
// the restore row narrows it, to zips). The files decide, not the row: every picked file is opened
// once and sent to the importer whose format it is (notes/import.mjs, the one door -- by name and
// first bytes), so a Takeout zip under the wrong row still lands. Each pure importer turns its files
// into Markdown text and a sidecar entry; a picture that was picked, or that an export carried, rides
// inside its note as a data URL, because a note is one file, and one that was not is named in the
// note so it can be fetched later. Nothing already in the folder is touched: a name that collides
// counts up, keys land after everything, the sections a batch needs are made first, and the import
// is one write of the sidecar. The sheet is the one place in Rapier that names Google Keep.
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
		// Its turn in the same queue as captures: neither reads the folder half-written by the other.
		state.capturing = (state.capturing || Promise.resolve()).then(() => _rapierNotesImportFiles(files, source)).catch(error => { console.warn('[rapier] notes import', error); showToast('The import did not finish. Keep the source export and check Notes before trying again.', 'error'); });
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
// A Word file (OneNote's or Samsung's own export, or anyone's) goes through the DOCX reader the
// editor already has, and arrives at the door as a web page with its pictures inside it.
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
			if (typeof result?.html === 'string') body = D.docxPortableHtml(result.html, pictures);
		}
	} catch (_) { /* The complete original, including embedded objects, remains an ordinary file. */ }
	const html = '<html><head><title>' + escape(file.name.replace(/\.docx$/i, '')) + '</title></head><body>' + body + '<p><a href="' + href + '">Original Word file</a></p></body></html>';
	return {name: name.replace(/\.docx$/i, '') + '.html', text: html, attachmentEntry: {name, bytes}};
}

async function _rapierNotesImportFiles(files, source) {
	const state = _rapierNotes;
	const D = globalThis.RapierNotesImport;
	if (!D || typeof D.importAny !== 'function') throw new Error('the importer did not load');
	if (source === 'restore') {
		// File-backed part directories keep a library-sized pick out of one ArrayBuffer.
		// The owner verifies the complete set before it can touch the destination.
		const parts = await D.openBackupFiles(files);
		if (state.loading) await state.loading;
		await _rapierNotesStore.kind();
		const snapshot = await _rapierNotesStore.folder.restoreSnapshot({parts});
		_rapierNotesTake(snapshot);
		// Rebuild projections from the restored folder, including its sync rejoin checkpoint.
		// The previous library's cached words are never evidence for this one.
		await _rapierNotesLoad(); _rapierNotesIndexingBegin();
		// What came back, and that it was checked -- the unverified case in the restore's own words.
		showToast('Restored ' + snapshot.files.length + (snapshot.files.length === 1 ? ' note' : ' notes') + (snapshot.verification.status === 'verified' ? ' and every file in the backup, exactly, each checked against it.' : ' and the archive’s other files; the backup could not be verified. Keep the archive.'), 'info');
		if (state.open) _rapierNotesRender();
		return;
	}
	const backupParts = source === 'rapier' && files.length && files.every(file => /\.zip$/i.test(file.name)) ? await D.openBackupSetForImport(files) : null;
	const entries = [];
	// The picker hands flat files, so picking two folders can offer the same picture name twice. The
	// same name with the same bytes is ONE picture, not something to refuse to choose between: it is
	// a file and its own copy. Offering both would make the importer call it ambiguous and land
	// neither. The same name with DIFFERENT bytes still goes in twice and is still refused, because
	// guessing which one a note meant would put the wrong picture in it, and the wrong picture is
	// worse than none.
	const pictureCopies = new Map();
	for (const file of backupParts ? [] : files) {
		const name = file.webkitRelativePath || file.name;
		if (/\.docx$/i.test(file.name)) { const entry = await _rapierNotesDocxEntry(file); entries.push(entry); if (entry.attachmentEntry) entries.push(entry.attachmentEntry); continue; }
		if (file.size > globalThis.RapierNotesAttachments.ATTACHMENT_MAX_BYTES && !/\.(?:zip|textpack|jex|enex|md|markdown|txt|text|html?|mht|mhtml|json|csv)$/i.test(file.name)) { entries.push({name, oversize: true, size: file.size}); continue; }
		if (/^image\//.test(file.type) || /\.(?:jpe?g|png|gif|webp|bmp|svg|heic|heif|avif)$/i.test(file.name)) {
			// A picked picture goes in as its own bytes and nothing more. Which note it belongs to is
			// notes/import-pictures.mjs's question, answered against the note's own path inside its own
			// picked root -- never a flat table of base names, which is what this used to be.
			const bytes = new Uint8Array(await file.arrayBuffer());
			let digest = null;
			try { digest = await globalThis.RapierNotesIntegrity?.sha256(bytes); } catch (_) { digest = null; }
			const copies = pictureCopies.get(name);
			// Without a digest nothing is dropped: an unreadable duplicate is admitted and left to the
			// importer, which refuses rather than guesses. Never the other way round.
			if (digest && copies?.has(digest)) continue;
			if (digest) { if (copies) copies.add(digest); else pictureCopies.set(name, new Set([digest])); }
			entries.push({ name, bytes });
			continue;
		}
		// The dispatcher owns text admission for loose files and archive members alike:
		// retain exact input bytes, including BOMs, and let readImportText report and
		// preserve damaged character sequences instead of refusing a readable note here.
		entries.push({ name, bytes: new Uint8Array(await file.arrayBuffer()) });
	}
	// A picture inside a picked archive is found by the importer that opened it, in that archive's own
	// root, with the same rule.
	const opened = backupParts || await D.openContainers(entries);
	if (state.loading) await state.loading;

	await _rapierNotesLoad(); _rapierNotesIndexingBegin();
	const M = _rapierNotesModel();
	const A = globalThis.RapierNotesAudio;
	// What the folder already holds, under the names a backup of it would use: the notes by their
	// own names, recordings under `audio/`, thumbnails under `thumbs/`. Backup names are allocated
	// against this set before a byte is written (notes/restore.mjs allocateFile), so a restored
	// recording can never land on one that is already here -- the one way this path could have
	// destroyed what the person made while doing the thing that means keep it.
	const recordings = await _rapierNotesStore.audioNames();
	const thumbnails = await _rapierNotesStore.thumbNames();
	const attachmentNames = await _rapierNotesStore.attachmentNames();
	const importFiles = await _rapierNotesStore.importReceiptNames();
	const existing = [...Object.keys(state.index.notes), ...recordings.map(name => 'audio/' + name), ...thumbnails.map(name => 'thumbs/' + name), ...attachmentNames.map(name => 'attachments/' + name), ...importFiles.map(name => 'imports/' + name)];
	const lastOrder = Object.values(state.index.notes).map(e => e.order).filter(Boolean).sort().at(-1) || '';
	// The folder's own sidecar goes in with the pick, not just its file names. A Rapier backup
	// carries the identity each note was written under, and without knowing which identities this
	// folder has already given out, a restore hands an arriving note one that is already in use --
	// two notes with one identity, whose pasts, syncs and merges then speak over each other.
	// notes/restore.mjs needs the index to see that and give the arriving note a new identity.
	// And what names this folder can actually hold, asked ONCE and before anything is planned. The
	// import works out every note's name and then rewrites every other imported note's links to point
	// at it, so a name decided here and changed at the write would leave those links pointing at
	// nothing (probe before planning, then write without a second allocation). The probe is cached on
	// the folder; asking it costs one temporary file, once.
	const ascii = !await _rapierNotesStore.namesBeyondAscii();
	// Pictures go through notes/import-pictures.mjs, which reads each note with the real Markdown
	// parser and lands what it finds through the editor's own asset owner: one asset per picture with
	// a reference beside the note's words, whatever shape the reference took -- inline, reference
	// style, a wiki embed, an image inside a link, one sharing its line with prose, an alt with a
	// bracket in it. The line regex this replaces matched only a whole line of exactly `![alt](path)`,
	// so every other shape was passed over in silence, a fenced example was rewritten as if it were
	// real, and what it could not find it wrote INTO the person's note as prose. Nothing is written
	// into a note now: what could not come is reported, and the note's own bytes are left alone.
	const P = globalThis.RapierNotesImportPictures;
	// The row the person pressed says which app's Markdown this is: `flavour` is what turns Bear's
	// and Obsidian's and Logseq's own spans into ordinary Markdown. Only the ROW decides: a flavour
	// is never inferred from a file, because guessing one wrong would rewrite spans that were not
	// that app's to begin with.
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
		// The record is durable BEFORE media or history publication. It is a plan, never a
		// claim that these files landed; a later refusal can leave earlier attachments here.
		record.publication = {phase: 'media', plannedFiles: [...(result.attachments || []).map(row => 'attachments/' + row.name), ...(result.audio || []).map(row => 'audio/' + row.name), ...(result.backupFiles || []).filter(row => !M.isNoteFile(row.name)).map(row => row.name)]};
		await saveReceipt();
	}
	const audioNames = new Map();
	const recordingMap = rootId => {
		if (!audioNames.has(rootId)) audioNames.set(rootId, new Map());
		return audioNames.get(rootId);
	};
	let pastKept = 0, pastFailed = 0, unplaced = 0, pastWhy = '', pastObjectsFailed = 0, arrivalFailed = 0, backupSavedFiles = 0;
	const failedPastIds = new Set();
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
	// A Rapier backup carries the folder's own siblings beside its notes -- the recordings under
	// `audio/` -- and hands them back as `backupFiles` under the names allocated above. They land
	// before the notes do, because a note restored without its recording is a note whose words point
	// at nothing; and where a name had to move to keep an existing recording, the note's own line
	// moves with it rather than being left pointing at the name that was taken.
	// A restored note whose identity was already taken here was given a new one (notes/restore.mjs
	// reports every move as `identityMap`), and its past already carries that new identity in the
	// plan. Never re-key or rewrite it a second time in this publication loop.
	// Three separate counts, because they are three separate things and saying one with another's
	// words would be a fabricated reason: `pastKept` is the deliberate keep (this folder already holds
	// a past for that note, so the arriving one stays where it came from), `pastFailed` is a write
	// this folder REFUSED (quota, a fault, a manifest that would not re-key) and `unplaced` is a file
	// in the backup that nothing here knows where to put. Each has its own sentence below.

	// Archive order is not commit order. All immutable objects precede every referring manifest.
	const backupFiles = [...(result.backupFiles || [])].sort((a, b) => Number(/^history\/manifests\//.test(a.name)) - Number(/^history\/manifests\//.test(b.name)));
	// The recordings land first, through the folder's own operation (its lease); then the notes' past
	// lands under the history lease: the owner is never asked for twice at once.
	for (const file of backupFiles) {
		// A source device's receipt remains byte-exact backup evidence. Add backup never
		// adopts its old identity/path proofs as this device's Undo authority.
		if (/^imports\/[^/\\]+\.json$/.test(file?.name || '') && file.bytes) {
			await _rapierNotesStore.folder.asset(file.name, file.bytes); backupSavedFiles++; continue;
		}
		if (/^attachments\/[^/\\]+$/.test(file?.name || '') && file.bytes) {
			await _rapierNotesStore.createAttachment(file.name.slice(12), new Blob([file.bytes]), {exact: true});
			await recordFile(file.name, file.bytes);
			backupSavedFiles++;
			continue;
		}
		// Backup exports the derived cache too. Publish its planned bytes through the existing
		// media owner; a late collision refuses instead of overwriting another file or renaming
		// behind references already bound by restore.mjs.
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
	for (const file of backupFiles) {
		if (/^imports\/[^/\\]+\.json$/.test(file?.name || '') && file.bytes) continue;
		if (/^attachments\/[^/\\]+$/.test(file?.name || '') && file.bytes) continue;
		if (/^audio\/(.+)$/.exec(file?.name || '')?.[1] && file.bytes) continue;
		if (/^thumbs\/[^/\\]+$/.test(file?.name || '') && file.bytes) continue;
		// The notes' own past. A recipe and a blob are named by their content, so merging two folders'
		// pasts is simply writing them: the same bytes have the same name, and an immutable write that
		// finds its name taken is already done. A manifest is not content-addressed -- it is keyed on
		// the note's identity -- so one whose name is already here is NOT written over: this folder's
		// own past wins, the arriving one stays in the backup it came from, and the person is told how
		// many. Guessing which of two histories for one identity is the right one is not this path's to
		// make.
		// restore.mjs has already re-keyed manifests and assigned new content addresses to rewritten
		// recipes. Their planned names, not their original paths, are authoritative.
		const past = /^history\/((?:texts|blobs|manifests)\/[^/]+)$/.exec(file?.name || '')?.[1];
		if (M.isNoteFile(file.sourcePath)) continue; // these bytes land in the note batches below
		// A file the backup carried that is neither a recording this folder will take nor an object of
		// a note's past. Nothing here knows where it goes, so it stays in the backup -- but it is
		// COUNTED and said, because a backup quietly losing a file on the way in is the fault this
		// whole path exists to avoid.
		if (!past || !file.bytes) { if (file?.name) unplaced++; continue; }
		try {
			if (past.startsWith('manifests/')) {
				const H = globalThis.RapierNotesHistory;
				// One plan, one publication. A pre-existing manifest remains this folder's past.
				const noteId = /^manifests\/(.+)\.json$/.exec(past)?.[1]?.replace('!', ':');
				if (await _rapierNotesStore.readHistory(past) != null) { pastKept++; continue; }
				if (!H?.materialize) throw new Error('the module that verifies a restored past did not load');
				const restored = H.parseManifest(file.bytes, {noteId, now: Date.now()});
				const checked = new Set();
				for (const version of restored.versions) if (!checked.has(version.hash)) {
					await H.materialize(restored, version.id, name => _rapierNotesStore.readHistory(name));
					checked.add(version.hash);
				}
				await _rapierNotesStore.writeHistory(past, file.bytes, {immutable: false});
				continue;
			}
			await _rapierNotesStore.writeHistory(past, file.bytes, {immutable: true});
		} catch (error) {
			if (past.startsWith('manifests/')) {
				pastFailed++;
				const came = /^manifests\/(.+)\.json$/.exec(past)?.[1]?.replace('!', ':');
				if (came) failedPastIds.add(came);
			} else pastObjectsFailed++;
			pastWhy = pastWhy || String(error?.message || error);
		}
	}
	});
	// Exact backup references (current AND historical) are already bound by restore.mjs.
	// Reapplying the old-name map would chain A→B→C when B was also an incoming filename.
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
	// The sections a batch needs exist before its notes land, so a category always names a section.
	// A section arrives with the state it had where it came from: one that was collapsed on the
	// other device opens collapsed here. `sections` is names alone; `sectionsAdded` is the objects,
	// and the collapse each one carries is a thing the person set, not a default to throw away.
	const added = new Map((result.sectionsAdded || []).map(section => [section?.name, section?.collapsed === true]));
	// Made in the first landing batch, in the same transaction as the notes that name them; the
	// collapse a section arrives with is set after the landing.
	const sectionsToMake = (sections || []).filter(name => !(state.index.sections || []).some(s => s.name === name));
	// What the picture importer could not bring, counted by what it said rather than guessed. A
	// picture it could not find and one it refused to guess between are the two a person can do
	// something about, so they are named; the rest are one honest number.
	let moved = 0, missing = 0, ambiguous = 0, refusedPictures = 0;
	for (const note of notes) for (const warning of note.warnings || []) {
		const code = String(warning?.code || '');
		if (!code.startsWith('picture_')) continue;
		if (code === 'picture_missing') missing++;
		else if (code === 'picture_ambiguous') ambiguous++;
		else refusedPictures++;
	}
	// The landing, in slices: eight notes or 65,536 bytes of text a group -- the bodies, then the
	// sidecar commit, then the arrival history, then the read-back that puts each in the receipt -- and
	// a turn given back to the person between every batch, so a keystroke in a composer opened over a
	// two-hundred-note import waits for one batch, not for the whole of it (notes-typing-budget's import
	// row). The receipt exists BEFORE the first write, so a landing that stops leaves a record at its
	// exact position: a body that landed before the sidecar refused is a landed body (`written` ahead of
	// `completed`), and a write that threw without a read-back is `uncertain`, never assumed absent.
	// History is not receipt evidence: the arrival event is the shell's own step after each committed
	// group, counted and said when it fails, and it never stops the landing. A verification that refuses
	// does stop it, because the folder has changed under the import and what was not yet written is
	// safest still in the export.
	const landed = [], landedNames = new Map(), landedEntries = new Map();
	const turn = () => typeof globalThis.scheduler?.yield === 'function' ? globalThis.scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));
	let landing = Landing.createImportLanding(Landing.planImportLanding({notes: notes.map(note => ({file: note.file, text: note.text, ...(M.isCodeFile(note.file) ? {bytes: note.bytes} : {}), entry: note.entry})), receipts: record ? notes.map(note => ({file: note.file})) : []},
		{batchCount: Landing.importBatchCount(Object.keys(state.index?.notes || {}).length, notes.length)}));
	// The journal checkpoint follows the next batch transaction; only a compact reference enters
	// the sidecar. The complete file publishes after the final verification and arrival history.
	const checkpoint = () => { if (!record) return; record = {...record, landing: {nextBatch: landing.cursor, status: landing.status, done: landing.done, ...(landing.stop ? {stop: landing.stop} : {}), ...(landing.position ? {position: landing.position} : {})}}; };
	if (landing.batch) await turn();
	while (landing.batch) {
		const batch = landing.batch; let outcome;
		if (batch.kind === 'write') {
			let written = 0, completed = 0, uncertain = false, why = '';
			// One transaction lands the batch (notes/folder.mjs importBatch): the bodies, their entries with
			// the metadata they came with, the sections they name, and the receipt as it stood before this
			// batch, so a landing that stops leaves its record at the previous batch's exact position.
			try {
				const items = batch.items, want = sectionsToMake.splice(0), receipt = record;
				const snapshot = await _rapierNotesStore.folder.importBatch(({index, files}) => {
					const names = files.slice(), taken = new Set(names.map(n => n.toLowerCase())), rows = [];
					for (const item of items) {
						let file = item.file;
						if (notes[item.ordinal]?.exactBackup && taken.has(file.toLowerCase())) throw new Error('The planned backup note name is occupied: ' + file + '. The backup note was not renamed behind its references. Keep the backup and retry Import.');
						// The name was planned before the links were bound to it, so a name a file from outside took
						// between the plan and this write moves here for an ordinary conversion, and its links point
						// at a name nothing has. That is rare and it is not silent: the person is told how many.
						if (taken.has(file.toLowerCase())) { file = M.isCodeFile(file) ? M.codeFileName(file, names, {ascii}) : M.noteFileName(file.replace(/\.md$/i, ''), names, {ascii}); moved++; }
						taken.add(file.toLowerCase()); names.push(file);
						rows.push({ordinal: item.ordinal, file, text: item.text, ...(item.bytes ? {bytes: item.bytes} : {}), entry: item.entry});
					}
					return {notes: rows, sections: want, sectionsAdded: want.map(name => ({name, collapsed: added.get(name) === true})), index, ...(receipt ? {importReceipt: receipt, receiptCheckpoint} : {})};
				});
				_rapierNotesTake(snapshot);
				if (snapshot.receiptCheckpoint) receiptCheckpoint = snapshot.receiptCheckpoint;
				if (record) record = Receipt.recordImportSections(record, snapshot.result.createdSections || []);
				for (const row of snapshot.result.notes) {
					landedNames.set(row.ordinal, row.file); landedEntries.set(row.ordinal, JSON.parse(JSON.stringify(snapshot.index.notes[row.file])));
					// An unreadable code file stays bytes, never a replacement-character cache to save later.
					try { _rapierNotesHold(row.file, row.bytes ? new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(row.bytes) : row.text); } catch (_) {}
					landed.push({file: row.file, text: row.text, note: notes[row.ordinal]});
					if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(row.file);
					written++;
				}
				completed = written;
			} catch (error) { uncertain = true; why = String(error?.message || error); }
			outcome = {batch: batch.index, status: completed === batch.count && !uncertain ? 'complete' : 'failed', completed, written, uncertain, ...(why ? {why} : {})};
		} else { // verify: the planner is asked for no history batches; the arrival event is the shell's own step below
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
					// The arrival owns its committed metadata, never a later pin, move or colour edit.
					await receiptWriter.verifyWrite({...notes[item.ordinal], file, text: item.text}, {bytes: back, entry, created: true});
					completed++;
				}
			} catch (error) { why = String(error?.message || error); receiptError = error; }
			finally { record = receiptWriter.finish(); }
			outcome = {batch: batch.index, status: completed === batch.count ? 'complete' : 'failed', completed, ...(why ? {why} : {})};
		}
		landing = Landing.advanceImportLanding(landing, outcome);
		checkpoint();
		if (batch.kind === 'write' && outcome.completed) {
			// A note that came from somewhere else says so in its own past: its first event is `import`, not
			// a `save` it never had. This is after the index write because that is where identities are
			// admitted, and a version keyed on a name rather than an identity would be lost by the first
			// rename. A note restored with its whole past gets this event on the end of it, which is true --
			// arriving here is a thing that happened to it. A failed incoming past is not replaced with a
			// brand-new history: that would conceal the missing versions. Arrival failures are said too.
			await turn();
			const arrivals = batch.items.slice(0, outcome.completed).filter(item => !failedPastIds.has(landedEntries.get(item.ordinal)?.id));
			let remaining = arrivals.length;
			const historyReceipt = remaining && record ? Receipt.createImportReceiptWriter(record) : null;
			if (remaining) try {
				await _rapierNotesStore.historyCommit(async () => {
					for (const item of arrivals) {
						const file = landedNames.get(item.ordinal);
						try {
							const text = item.bytes ? new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(item.bytes) : item.text;
							const arrival = await _rapierNotesRecordVersion({file, text, entry: landedEntries.get(item.ordinal), reason: 'import'}, true);
							if (!arrival) throw new Error('The imported note could not be recorded in History');
							if (historyReceipt && arrival.createdFiles?.length) await historyReceipt.verifyHistory(arrival.createdFiles);
						}
						catch (error) { arrivalFailed++; console.warn('[rapier] notes history', error); }
						finally { remaining--; }
					}
				});
			} catch (error) {
				// An unavailable lease fails the still-unattempted arrivals, never the note landing.
				arrivalFailed += remaining; console.warn('[rapier] notes history', error);
			} finally { if (historyReceipt) record = historyReceipt.finish(); }
		}
		if (landing.batch) await turn();
	}
	if (!notes.length && sectionsToMake.length) {
		// A section-only import has no body batch to carry its metadata. Commit it before
		// checkpointing the receipt; changing the shell's cached index is not publication.
		const snapshot = await _rapierNotesStore.folder.importBatch(() => ({notes: [], sections: sectionsToMake,
			sectionsAdded: sectionsToMake.map(name => ({name, collapsed: added.get(name) === true})),
			...(record ? {importReceipt: record, receiptCheckpoint} : {})}));
		if (record) {
			receiptCheckpoint = snapshot.receiptCheckpoint;
			record = Receipt.recordImportSections(record, snapshot.result.createdSections || []);
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
	// A note can arrive whole and still have something the import could not bring with it -- a tag it
	// would have had to guess at a metadata block to write, an attachment no Markdown can hold. The
	// import says so rather than counting the note as lost: the note is here, with a note on it.
	// A note "carries a line" only for what the import wrote into it. A picture it could not bring
	// writes nothing into the note any more, so counting those here too would say a note carries a
	// line it does not have. They are counted on their own, below.
	const noted = notes.filter(note => (note.warnings || []).some(warning => !String(warning?.code || '').startsWith('picture_') && warning?.code !== 'backup-paths-renamed')).length;
	const pathsRenamed = notes.some(note => (note.warnings || []).some(warning => warning?.code === 'backup-paths-renamed'));
	const count = notes.length === 1 ? '1 note' : notes.length + ' notes';
	const keptFiles = (result.attachments || []).length + backupSavedFiles;
	const said = from.length ? ' from ' + (from.length === 1 ? from[0] : from.length + ' sources') : '';
	// What came in, then what needs checking and where to go. Keep the export when anything was left
	// out; long names or underlying errors never turn the toast into a report.
	const short = [skipped.length ? skipped.length + ' skipped' : '',
		missing ? missing + (missing === 1 ? ' picture' : ' pictures') + ' not among the picked files' : '',
		ambiguous ? ambiguous + (ambiguous === 1 ? ' picture' : ' pictures') + ' left out (two picked files share a name)' : '',
		refusedPictures ? refusedPictures + (refusedPictures === 1 ? ' picture' : ' pictures') + ' not brought in' : '',
		pastKept ? pastKept + (pastKept === 1 ? ' existing note history kept' : ' existing note histories kept') : '',
		pastFailed ? pastFailed + (pastFailed === 1 ? ' note history' : ' note histories') + ' not saved' : '',
		unplaced ? unplaced + (unplaced === 1 ? ' file' : ' files') + ' left in the backup' : '',
		moved ? moved + (moved === 1 ? ' note renamed; check its links' : ' notes renamed; check their links') : '',
		pathsRenamed ? 'some files renamed; check their links' : ''].filter(Boolean);
	if (pastObjectsFailed) showToast(pastObjectsFailed + (pastObjectsFailed === 1 ? ' history file' : ' history files') + ' could not be verified. Keep the original backup.', 'error');
	if (arrivalFailed) showToast('The arrival of ' + arrivalFailed + (arrivalFailed === 1 ? ' imported note' : ' imported notes') + ' could not be saved in History. Keep the source export.', 'error');
	if (stopped) {
		// A failed read-back is never called a successful import. The durable receipt retains
		// each verified, unverified, unwritten or uncertain note and the underlying refusal.
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
	// A note's own composer, opened since the import began, owns the view now; landing behind it must
	// never pull the cards back over a person who has since navigated on (notes-typing-budget).
	// state.mode, not state.current: the Editor row leaves a note current but deliberately off
	// notes-mode chrome, and an import started from there still opens Notes as it always has
	// (notes-import-from-keep).
	if (state.open) _rapierNotesRender(); else if (!state.mode) { try { const overlay = _rapierUi?.refs?.settingsOverlay; if (overlay && typeof closeDialog === 'function') closeDialog(overlay); } catch (_) {} await _rapierNotesOpen(); }
}
function _rapierNotesDataUrl(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(file); }); }

// ---- Backup: the folder as a zip ---------------------------------------------------------------
// Every retained file in the notes folder as stored ZIP parts (notes/backup-stream.mjs), through the share sheet
// where the browser has one (a phone), else as a download: a backup readable by anything, which is the point of notes
// being files. Making one changes no note; the exported outcome is kept in the folder's sidecar, through its owner,
// so the date survives a reload.
// The prepared copy is kept; Export prepared backup sends it on a new press.
async function _rapierNotesExportBackup(file, name) {
	const files = globalThis.RapierPlatform?.files;
	const exportFile = typeof files?.exportArtifact === 'function' ? files.exportArtifact : typeof files?.saveAs === 'function' ? files.saveAs : null;
	// The platform's export owner first, so a confirmed destination can be SAID as one ("download
	// started" is not "backed up"). The person's own cancel or denial ends it there, in silence, and
	// a destination that FAILED is reported rather than worked around. One refusal is neither: a
	// browser that will not open a chooser at all (Chromium's SecurityError when the tap's transient
	// activation was spent collecting the folder, which a large folder always does). Nobody chose
	// that and nothing failed, so the ordinary routes below still carry the backup, in their own
	// honest words.
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
	// The callers add what is unchanged ("The notes are unchanged.", "The backup copy was not discarded"), so
	// this says only why, once.
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
// ---- The backup worker --------------------------------------------------------------------------
// The sync access handles live in a dedicated worker: it reads the sources, writes the archive and
// certifies every staged byte off the main thread; the page keeps the lease, the snapshot check,
// ready.json, recovery and the offer (the storage round trips on a throttled main thread are what made
// a backup slow). Where the browser has no sync handles, or the folder is native or in memory, the
// main-thread path runs as before.
async function _rapierNotesBackupWorkerStart() {
	const W = globalThis.RapierNotesBackupWorker;
	// createSyncAccessHandle belongs to the dedicated-worker realm, never Window. The worker's
	// early `unavailable` answer owns that capability check before it reads or writes anything.
	if (!W || typeof Worker !== 'function') return null;
	if (!await _rapierNotesStore.kind() || _rapierNotesStore.native) return null;
	// The worker's text is written from the shared bundle's own backup modules (tools/build.mjs).
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
	// Staging takes the stream a megabyte at a time: the writer's own cost is per call, not per byte
	// (28,030 writes of 64 KB were 25 of the 5,000-note backup's 90 s), and a partial buffer is
	// flushed before close so the sealed bytes are the whole archive.
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
	// Every press makes a new copy and retires the one before only once the new one is sealed, so a page
	// closed between the two can leave both: the newest is the prepared copy, and an older one is retired
	// only beside a successor that is whole (a set, once every part was sent). Staging without its
	// record is the unfinished backup the press stops on, as it always was.
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
// Sets retain only one staged part. Their durable cursor keeps the original declaration and
// accepted destinations, so a reload resumes that exact set or refuses changed source bytes.
async function _rapierNotesContinueBackupSet(prepared, {again = false, inventory, assertCurrent, onProgress, signal, snapshot} = {}) {
	try {
	const state = _rapierNotes, B = globalThis.RapierNotesBackup, count = prepared.plan.parts.length;
	const early = again ? 'This is the earlier copy, not a new backup. ' : '';
	// Sent again, each of these is two sentences at most -- which copy this is, then what is next.
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
		// Do not advance the in-memory cursor or unlink until the accepted cursor is read back.
		// A lost completion write may cause an explicitly repeated offer; it never loses this part.
		await persist(candidate);
		prepared.sent = candidate.sent; prepared.pending = null;
		await sink.discard(); prepared.pendingSink = null;
		return true;
	};
	// A saved accepted cursor can precede unlink. Remove those sent files before estimating
	// space; an unrecorded next part stays until its original sources have all been rechecked.
	if (prepared.directory) for await (const [name, handle] of prepared.directory) {
		if (handle.kind === 'file' && /^part-[1-9][0-9]*\.partial$/.test(name) && Number(name.slice(5, -8)) <= prepared.sent.length) await prepared.directory.removeEntry(name);
	}
	if (prepared.pending) {
		const sink = pendingSink();
		if (!await send(await sink.file({onProgress}), sink)) { showToast(early + 'Stopped after ' + prepared.sent.length + ' of ' + count + ' backup parts: part ' + (prepared.sent.length + 1) + ' is kept here; keep the parts already sent.', 'info'); return; }
	}
	if (prepared.sent.length < count) {
		// An advisory estimate before any new stage; account for the current and replacement
		// cursor as well as the largest remaining archive. Quota can still change during work.
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
					// A close can finish before its pending marker. Only after the exact original
					// sources are proved available may we recreate that unrecorded part.
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
	// What happened, what to hold on to, and what to do next -- the backup's own words for what happened (backed
	// up, or sent), no more.
	const omitted = prepared.omitted.length ? ' Not included: ' + prepared.omitted.map(row => row.name).join(', ') + '; keep their originals, and restore this copy with Add backup.' : ' Keep the parts together to restore.';
	// Sent again, the last sentence says it is the earlier copy, as the one-file toast does -- not a fourth sentence.
	showToast((confirmed ? 'Backed up ' : 'Backup sent to destinations: ') + count + (count === 1 ? ' part' : ' parts') + ', ' + _rapierNotesBytesWords(prepared.bytes) + '.' + omitted + (again ? ' This is the earlier copy, not a new backup.' : ''), confirmed && !prepared.omitted.length ? 'success' : 'info');
	_rapierNotesStorageLines();
	} finally { await snapshot?.release(); }
}
// An export outcome is not the prepared copy: only an actual send reaches this owner. The date is
// the copy's stamp, never the date it was sent again. A late outcome cannot replace a newer copy.
async function _rapierNotesRememberBackup(backup) {
	const state = _rapierNotes, store = _rapierNotesStore;
	try {
		if (!await store.kind()) { state.lastBackup = backup; return true; }
		const snapshot = await store.folder.owner.transact(store.folder.scope, ({index}) =>
			Date.parse(index.lastBackup?.stamp) > Date.parse(backup.stamp) ? {index}
			: {kind: 'backup-export', index: {...index, lastBackup: backup}, writes: []});
		state.lastBackup = snapshot.index.lastBackup;
		// Update only this key: a colour or section changed while the destination was answering
		// still belongs to its own pending edit, not to the backup's receipt.
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
	// Fresh preparation carries the immutable File just read back at close. Later/recovered offers
	// acquire and verify staging again; no mutable-folder digest or cached receipt replaces that read.
	const file = verifiedFile && verifiedFile instanceof File ? verifiedFile : await prepared.sink.file({onProgress});
	if (signal?.aborted) return;
	const outcome = await _rapierNotesExportBackup(file, prepared.name);
	if (outcome.status === 'cancelled') return;
	await _rapierNotesRememberBackup({name: outcome.name, files: prepared.files, bytes: prepared.bytes, stamp: prepared.stamp, confirmed: outcome.status === 'confirmed', route: outcome.route || 'file'});
	const word = prepared.files === 1 ? '1 file' : prepared.files.toLocaleString('en') + ' files';
	const message = outcome.status === 'confirmed' ? 'Backed up ' + word + ' as ' + outcome.name
		: outcome.route === 'share' ? 'Backup sent to share destination: ' + outcome.name : 'Backup download started: ' + outcome.name;
	// The ZIP proves the bytes it contains, not a simultaneous view of the mutable folder. `stamp` dates the
	// backup; it is taken after inventory, not a start-of-backup cut-off.
	// What happened, in plain words, not how its files were copied. The next press makes a new copy of its
	// own, so there is nothing to discard and nothing more to say; a copy sent again from Notes settings is
	// named as the earlier one, with the time it was prepared.
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
// One action-bearing toast uses the existing reachability/lifecycle owner. Updating its words
// never rerenders Notes, never recreates a dismissed notice, and never touches a later toast.
function _rapierNotesBackupProgress(controller) {
	const root = document.getElementById('toast-root'), previous = root?.lastElementChild;
	showToast('Preparing backup', 'info', {label: 'Cancel', fn: () => controller.abort(new Error('Backup preparation cancelled'))});
	const toast = root?.lastElementChild !== previous ? root?.lastElementChild : null;
	const message = toast?.querySelector('.toast__msg');
	let lastAt = -Infinity, lastPhase = '';
	return {
		update({phase, files, totalFiles, bytes, totalBytes}) {
			if (!toast?.isConnected || !message || toast._rapierLife?.state?.phase === 'closed') return;
			const now = performance.now();
			if (phase === lastPhase && now - lastAt < 250) return;
			let text = phase;
			if (files != null) text += ' · ' + files.toLocaleString('en') + (totalFiles == null ? ' files' : ' / ' + totalFiles.toLocaleString('en') + ' files');
			if (bytes != null && totalBytes > 0) text += ' · ' + Math.min(100, Math.floor(bytes * 100 / totalBytes)) + '%';
			message.textContent = text; lastAt = now; lastPhase = phase;
			_rapierScheduleToastLift();
		},
		close() { if (toast?.isConnected) toast.querySelector('.toast__close')?.click(); }
	};
}
// The zip's name is its own date and time, so a second backup never takes the first one's name: the
// seconds make it unique in practice, and a press within the same second as the copy before it adds
// the milliseconds rather than reuse a name.
function _rapierNotesBackupName(stamp, before = []) {
	const pad = (n, width = 2) => String(n).padStart(width, '0'), second = Math.floor(stamp.getTime() / 1000);
	const base = 'rapier-notes-' + stamp.getFullYear() + '-' + pad(stamp.getMonth() + 1) + '-' + pad(stamp.getDate())
		+ '-' + pad(stamp.getHours()) + '-' + pad(stamp.getMinutes()) + '-' + pad(stamp.getSeconds());
	return before.some(at => Math.floor(Date.parse(at) / 1000) === second) ? base + '-' + pad(stamp.getMilliseconds(), 3) + '.zip' : base + '.zip';
}
// The earlier prepared copy leaves only once its successor is sealed (the callers' order). A copy that
// cannot be removed stays on the disk as it was, and the next open's recovery retires it beside its
// newer successor; nothing about the new backup waits on it.
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
		// Every press makes a new zip named with its own date and time; nothing is replaced, nothing is
		// asked. A set still being sent is that earlier press's backup, not a copy of it: the press
		// sends its next part. Any other prepared copy stays exactly where it is until its successor is
		// sealed (no path that means keep may destroy), and only then is it retired.
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
		// WHICH PATH RAN. A backup measured without this is uninterpretable: the worker start returns
		// null on any of six conditions, so a row that saw no gain may simply never have been in the
		// worker at all. The first measurement of this wiring (95,656 ms against 94,854 on the main
		// thread) is exactly that shape, and it is why this fact exists.
		state.backupPath = 'main-thread';
		if (plan.parts.length > 1 || plan.omitted.length) {
			state.backupPath = 'main-thread-set';
			const set = {sequence:true, name, stamp:stamp.toISOString(), plan, options:backupOptions, sent:[], pending:null};
			await _rapierNotesContinueBackupSet(set, {inventory, assertCurrent, signal, onProgress, snapshot});
			// A set is a successor once every part of it has been handed off.
			if (state.preparedBackup === set && set.sent.length === set.plan.parts.length) await _rapierNotesRetireBackup(earlier);
			return;
		}
		const started = await _rapierNotesBackupWorkerStart();
		// A worker that started is not a worker that ran. It can still fail to take its own staging
		// directory, and it can answer `unavailable`; either way the main-thread path below is the one
		// that makes the copy, and `backupPath` must say so or the next measurement is unreadable
		// again. Nothing here is destructive: a refusal costs a retry, never a byte.
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
				// A removed attempt leaves nothing; a retained one is the unfinished staging the next
				// open reports and the person discards by name.
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
		// A full storage is said as that, with what the person can do (main-thread writes throw it too).
		const full = error?.name === 'QuotaExceededError' ? 'the browser\'s storage for this site is full; free some space (the backup copies in Notes settings, other sites\' data) and press Backup again' : '';
		showToast('The backup did not complete: ' + (full || String(error?.message || error).replace(/[.\s]+$/, '')) + (made?.sequence ? (made.sent.length === made.plan.parts.length ? '. All parts were sent: press Backup again to finish.' : '. Part ' + (made.sent.length + 1) + ' is next; keep the parts already sent.') : stage?.sink.state === 'sealed' ? '. The completed backup copy was kept.' : '. The notes are unchanged.'), 'error');
	} finally { progress?.close(); await snapshot?.release(); await release?.(); state.backupBusy = false; state.backupController = null; }
}

// ---- Binding, opening, closing, boot ---------------------------------------------------------------
// The search: the pressed icon inverts, the joined bar opens under the head (the main view's own find
// bar, its classes and so its styles); closing it clears the query.
// The search bar and the plus's bar OVERLAY the cards (rapier-notes.css: position:absolute, top:44px),
// so the cards stay exactly where they were. That is only half an answer on its own, because the cards
// the bar stands over cannot be reached. So the bar's height is added as padding at the top of the
// scroller, and the SAME number is taken back out of the scroll offset in the same frame: nothing on
// screen moves, and the list can be scrolled far enough to bring every card out from under the bar.
//
// That only works if the scroller has somewhere to take it from. Before: scrollTop S, scrollHeight C,
// clientHeight H. After the room W, the largest reachable scrollTop is max(0, C + W - H); the line
// below wants S + W, which is reachable iff S <= C - H -- false for a list shorter than the screen (C
// < H, S = 0). The assignment would clamp back to 0, the padding would stay, and every card would drop
// by the bar's whole height.
//
// Neither guard nor padding can fix that: scrollHeight reports max(content, clientHeight), so a short
// list reads unscrollable both before and after; declining the room leaves the top card under the bar
// with no way to scroll it out (notes-reorder-under-search); and padding cannot extend scrollHeight
// below clientHeight. The scroller's CONTENT must reach clientHeight + W, so there is exactly the
// bar's height of travel: then the offset lands (no card moves) and every card can still be brought
// out from under the bar. A real child can express that; so the scroller carries one empty spacer as
// its last element and this function measures how much of the travel is missing and gives the spacer
// exactly that.
function _rapierNotesBarRoom() {
	const state = _rapierNotes, scroll = state.scroll; if (!scroll) return;
	const box = el => (el && !el.hidden ? el.getBoundingClientRect().height : 0);
	const want = Math.round(box(state.find) + box(document.getElementById('rapier-notes-filters')) + box(state.addsBar));
	const was = state.barRoom || 0;
	if (want === was) return;
	// Where the person is, read BEFORE the padding changes and the browser clamps it for us.
	const at = scroll.scrollTop;
	state.barRoom = want;
	scroll.style.setProperty('--notes-bar-room', want + 'px');
	const target = Math.max(0, at + (want - was));
	// _rapierNotesRender appends its sections every paint, which moves them past anything already
	// there, so the spacer is put back at the end here rather than trusting where it was left.
	// No bar, no spacer. Asked with want=0 the arithmetic below still finds a shortfall -- a short
	// list is always shorter than its box -- and would leave a 400-odd px spacer under the cards
	// with nothing to compensate. Measured that way before this guard: --notes-bar-room 0px and
	// --notes-scroll-room 712px at rest.
	if (state.scrollRoom && !want) scroll.style.setProperty('--notes-scroll-room', '0px');
	else if (state.scrollRoom) {
		scroll.appendChild(state.scrollRoom);
		// Cleared first: the content's real extent has to be read without the last answer in it.
		scroll.style.setProperty('--notes-scroll-room', '0px');
		// NOT scrollHeight. It reports max(content, clientHeight), so on the very list this exists
		// for it answers 800 of an 800-high box whatever the content is, and the first cut of this
		// sized the spacer at `target - (scrollHeight - clientHeight)` = 48 and changed nothing:
		// content 380 + 48 is still under 800, so the travel stayed 0 and every card still dropped
		// by the bar's height. Measured, after that fix, on three notes at 390x844:
		//   padTop 8 -> 56, --notes-bar-room 48px, --notes-scroll-room 48px, spacer 48px and last
		//   child -- and scrollHeight 800 -> 800, travel 0 -> 0, cards 60,60,116 -> 108,108,164.
		// So the extent is read from the last real child's own rect instead, in the scroller's own
		// coordinates, and the spacer is whatever is left over to reach clientHeight + the room.
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
// The nav bar's plus does exactly what the search icon does: the same inversion (`data-active`),
// the same joined full-width box carrying the four doors (NOTE, RECORD, IMAGE, DRAW) evenly
// spaced, and only one of the two bars is ever down.
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
// The kebab opens the settings panel from the right (_rapierNotesSettingsOpen); the circle opens
// the jump panel out of itself (_rapierNotesJumpOpen); the adding lives in the nav bar's own plus
// and its bar. What is left here is the ONE owner of taking a face down, so every
// `_rapierNotesPopup(null)` -- each meaning "whatever is up, close it" -- means what it says.
function _rapierNotesPopup(which) {
	const state = _rapierNotes, panel = state.popupEl; if (!panel) return;
	state.popup = null;
	panel.replaceChildren(); panel.hidden = true;
	const sheet = state.sheet; if (!sheet) return;
	if (which === 'menu') { _rapierNotesSettingsOpen(true); return; }
	if (which === 'add') { _rapierNotesAddsToggle(true); return; }
	if (state.sheetMode === 'menu' || state.sheetMode === 'add') {
		// The face went down under the keyboard, so the focus goes back to what opened it.
		const opener = document.activeElement && sheet.contains(document.activeElement) ? state.surface.querySelector('[data-notes-act="menu"]') : null;
		state.sheetMode = 'actions'; sheet.classList.remove('rapier-notes-sheet--open'); sheet.inert = true;
		opener?.focus({ preventScroll: true });
	}
}
// A new section from the kebab: its own face, the field alone (the sheet's 'section-add'); the
// section is added empty and the person moves notes into it from their sheets.
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
// A new note's place: the head of Others. Given to the create as the entry's own metadata (the owner
// stamps created and modified), so the file and its place are one transaction of the folder.
function _rapierNotesPlaceFirst() {
	const state = _rapierNotes, M = _rapierNotesModel();
	const first = M.sortedSection(state.index, 'others')[0];
	return { order: first ? M.orderBefore(state.index.notes[first].order) : M.orderFirst() };
}
// The + bar's canvas arrives the way a note does from its card: the lift, a plate of the page's
// ground growing from DRAW to the whole screen, taken at the press before the bar leaves; the new
// note is made and opened under it, so an empty note is never on the screen, and the canvas then
// comes up over it on its own short fade (draw/draw.js) before the plate goes. Inside a note the
// canvas fades in over the note at once: a plate of the page's own ground over the page is seen as
// nothing but a wait. Null under reduced motion, as the lift is.
function _rapierNotesDrawLift(el) {
	const r = el?.isConnected ? el.getBoundingClientRect() : null;
	if (!r || !(r.width > 0 && r.height > 0)) return null;
	// The plate alone: the canvas brings its own head, not the note's.
	return _rapierNotesLiftGrow({rect: {left: r.left, top: r.top, width: r.width, height: r.height}, face: _rapierNotesEl('div'), bg: getComputedStyle(document.body).backgroundColor}, {draw: true});
}
function _rapierNotesDrawOver(lift, open) {
	try { open(); } finally { setTimeout(() => lift.drop(), 260); }
}
// NOTE on the + bar grows a plate of the page's ground from its box to the whole screen, as a plain card grows into
// its note, and the new note is made and opened under it; the plate gives way to the note. Nothing stands still after
// the tap. Null under reduced motion, as the lift is.
function _rapierNotesNoteLift(el) {
	const r = el?.isConnected ? el.getBoundingClientRect() : null;
	if (!r || !(r.width > 0 && r.height > 0)) return null;
	return _rapierNotesLiftGrow({rect: {left: r.left, top: r.top, width: r.width, height: r.height}, face: _rapierNotesEl('div'), bg: getComputedStyle(document.body).backgroundColor});
}
// The canvas comes up the moment the plate is whole, and the note is made and opened UNDER it (the folder's write
// would otherwise be a visible wait on a bare plate). The write starts at the tap and the canvas waits for the plate
// alone; DONE waits for the note (draw/draw.js _rapierDrawFinish, `ready`, and picks its place in the note then); Back
// or DONE with nothing drawn lets the empty note go once it exists (`closed`); a note that could not be written after
// the canvas is up hands the drawing to a Download, never to the document under the cards and never to nothing. A
// write that fails before the plate is whole raises no canvas. The widget's capture keeps the old order (the note
// first): it has no plate.
async function _rapierNotesNewDrawing(lift) {
	const state = _rapierNotes, M = _rapierNotesModel();
	const names = Object.keys(state.index.notes);
	let file = null, outcome = null, gone = false;
	const ready = (async () => {
		try { file = await _rapierNotesWriteNew('', M.noteFileName('Note', names), _rapierNotesPlaceFirst()); }
		catch (error) { outcome = false; showToast('The note could not be written: ' + String(error?.message || error), 'error'); return false; }
		// The canvas closed with nothing drawn before its note was even written: the note goes without
		// ever being opened (no editor flashes under the cards), through the folder's own discard.
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
	const open = () => { if (typeof rapierOpenDraw === 'function') rapierOpenDraw(notes); };
	if (lift) _rapierNotesDrawOver(lift, open); else open();
	return ready;
}
// A note written for a canvas that closed before the note was ready: never opened, never held, removed by the
// folder's own discard of an empty note, and nothing said, for a note nobody saw.
async function _rapierNotesDiscardUnseen(file) {
	const state = _rapierNotes;
	try {
		const snapshot = await _rapierNotesStore.folder.discardEmpty({file, id: state.indexBase?.notes?.[file]?.id, expectedDigest: await globalThis.RapierNotesIntegrity.sha256('')});
		_rapierNotesTake(snapshot);
	} catch (error) { showToast('The empty note could not be removed: ' + String(error?.message || error), 'error'); }
}
// What the circle adds: a note opens in the editor at once, empty, and is kept the moment it has a word (or
// discarded when the person comes back without one); a list starts with its first box; a drawing or a picture
// opens the note and the editor's own control.
// Words typed while a new note is still opening. The note is written, then opened, then its first line takes
// the caret; a keyboard that is already up delivers letters long before that, to nothing. The tap that chose
// Note takes the focus for a hidden field that keeps them, and the words go into the note, in order, the moment
// the caret is in it. Nothing is held past the open: the field goes when the caret arrives, or when the open
// ends.
let _rapierNotesCatcher = null;
function _rapierNotesCatchBegin() {
	_rapierNotesCatchEnd(false);
	const box = document.createElement('textarea');
	box.className = 'sr-only'; box.tabIndex = -1; box.setAttribute('aria-hidden', 'true'); box.setAttribute('autocomplete', 'off');
	document.body.appendChild(box);
	try { box.focus({preventScroll: true}); } catch (_) {}
	const held = {box, late: '', arrived: false, timer: setTimeout(() => _rapierNotesCatchEnd(false), 8000)};
	// Once the caret is in the note the words wait one turn for the editor to place it; letters that arrive in that
	// turn join the end of them, so the order is the person's.
	held.focus = event => { if (!held.arrived && event.target instanceof Element && event.target.closest('#editor-blocks')) _rapierNotesCatchEnd(true); };
	held.input = event => { if (held.arrived && !held.delivering && event.inputType === 'insertText' && typeof event.data === 'string' && event.target instanceof Element && event.target.closest('#editor-blocks')) { event.preventDefault(); event.stopImmediatePropagation(); held.late += event.data; } };
	document.addEventListener('focusin', held.focus, true);
	document.addEventListener('beforeinput', held.input, true);
	_rapierNotesCatcher = held;
}
function _rapierNotesCatchEnd(deliver) {
	const held = _rapierNotesCatcher; if (!held || held.arrived) return;
	clearTimeout(held.timer); document.removeEventListener('focusin', held.focus, true);
	const text = held.box.value; held.box.remove();
	if (!deliver || !text) { document.removeEventListener('beforeinput', held.input, true); _rapierNotesCatcher = null; return; }
	// Focus has arrived, the caret has not yet: the editor places it in its own handlers, so the words follow them.
	held.arrived = true;
	setTimeout(() => {
		held.delivering = true;
		try {
			// The way a keyboard's own commit arrives, so the editor's own input owners see ordinary typing.
			const lines = (text + held.late).replace(/\r\n?/g, '\n').split('\n');
			lines.forEach((line, i) => { if (i) document.execCommand('insertParagraph'); if (line) document.execCommand('insertText', false, line); });
		} finally { document.removeEventListener('beforeinput', held.input, true); if (_rapierNotesCatcher === held) _rapierNotesCatcher = null; }
	}, 0);
}
async function _rapierNotesNew(kind, capture = false, lift = null, captured = false) {
	if (kind === 'note' && !capture) _rapierNotesCatchBegin();
	if (!capture && !await _rapierNotesUnlock()) { _rapierNotesCatchEnd(false); lift?.drop(); return; }
	const state = _rapierNotes, M = _rapierNotesModel();
	if (kind === 'recording') { _rapierRecorderOpen(true); return; }
	// The + bar's canvas comes up the moment its plate is whole, the note made under it (above).
	if (kind === 'drawing' && !capture) return _rapierNotesNewDrawing(lift);
	const text = '';
	const names = Object.keys(state.index.notes);
	let file;
	// The file and its place at the head of Others in one transaction (at 4x CPU the DRAW door's plate
	// would otherwise stand bare 900 ms, the two writes half of it).
	try { file = await _rapierNotesWriteNew(text, M.noteFileName('Note', names), _rapierNotesPlaceFirst()); }
	catch (error) { _rapierNotesCatchEnd(false); lift?.drop(); showToast('The note could not be written: ' + String(error?.message || error), 'error'); return; }
	_rapierNotesAdmit(file, text); state.untitled.add(file);
	const id = state.index.notes[file]?.id; if (captured && id) (state.captured ||= new Set()).add(id);
	if (!await _rapierNotesOpenNote(file, capture, null, lift) || state.current !== file) { _rapierNotesCatchEnd(false); lift?.drop(); return false; }
	// A NOTE's plate is the open's own, as a card's is: it has given way to the note by here.
	if (lift && kind !== 'note') { await lift.grown; if (state.current === file) _rapierNotesDrawOver(lift, () => _rapierNotesTrigger(kind, true)); else lift.drop(); return true; }
	// The caret is ready at once (Keep's own feel): the empty document's first paragraph is laid
	// and focused, the same as its "tap to begin" does.
	// A load lands in read mode; the caret needs edit mode, and a laid block is only entered there.
	if (kind === 'note' && typeof rapierInsertBlock === 'function') { try { if (rapier.view.mode !== 'edit' && typeof rapierSetMode === 'function') rapierSetMode('edit', { announce: false }); if (!rapier.document.blocks.length) rapierInsertBlock('paragraph', { immediateFocus: true }); } catch (_) {} }
	// Task #369: and that paragraph is the note's Title field, the caret in it (Keep's own start).
	if (kind === 'note') _rapierNotesHeadStart();
	// On the next frame, not on a timer. The note is already open and its head is already the note's
	// own by here, so a timed wait would only guess at when the editor had painted and show an empty
	// note before the picker or the canvas arrived. Two frames is the same guarantee without the
	// flash: the first lets the open paint, the second runs after it.
	if (kind === 'drawing' || kind === 'picture') {
		requestAnimationFrame(() => requestAnimationFrame(() => { if (state.current === file) _rapierNotesTrigger(kind, true); }));
	}
	return true;
}
// What a canvas opened in Notes is for (draw/draw.js, _rapierDrawState.notes): the open note, by
// the name its card shows -- its title, or its file's name where the card has none -- or, from the
// + bar, a new note. `alt` is the drawing's caption: the note's name, or "Drawing" for a new note,
// which then takes its name from it ("Drawing.md", "Drawing 2.md"), as a photo's note does. Null
// when no note is open in Notes: the canvas is then the editor's own.
function _rapierNotesDrawFor(fresh) {
	const state = _rapierNotes, file = state.current;
	if (fresh) return {label: 'New note', fresh: true, alt: 'Drawing', closed: () => _rapierNotesDrewNothing(file)};
	if (!_rapierNotesInANote()) return null;
	const label = _rapierNotesModel().projectCard(file, _rapierSourceText()).title || file.replace(/\.md$/i, '');
	return {label, fresh: false, alt: label};
}
// A note is open in Notes and the editor holds it (under its new name too, while the rename its
// first words asked for is in flight).
function _rapierNotesInANote() {
	const state = _rapierNotes, name = String(rapier.document.filename || '');
	return !!state.mode && !!state.current && (name === state.current || name === state.renameWanted);
}
// The + bar's canvas closed with nothing kept -- Back or DONE on a canvas never drawn on -- leaves
// nothing behind: the empty note made for it goes without a word, since the person never saw it,
// and the cards come back under the canvas, which then leaves over them (draw/draw.js
// _rapierDrawLeave waits for this), as if DRAW had not been pressed. A note that has words stays.
function _rapierNotesDrewNothing(file) {
	const state = _rapierNotes;
	if (!file || state.open || state.current !== file || !state.untitled.has(file) || _rapierNotesBody(_rapierSourceText()).trim()) return null;
	return _rapierNotesOpen(false, {unseen: true});
}
// The editor's own control for a drawing or a picture, pressed for the person: the floating
// toolbar's Draw, or the overflow's picture action; where neither is on the page the note is open
// and a toast names the control. `fresh`: the note was made by the + bar for this.
function _rapierNotesTrigger(kind, fresh = false) {
	if (kind === 'recording') { _rapierRecorderOpen(false); return; }
	if (kind === 'attachment') { void _rapierAttachmentsPick(); return; }
	if (kind === 'files') { void _rapierAttachmentsShelf(); return; }
	// Take photo (§5) is the same picture path with the camera asked for by name: the platform's own
	// capture attribute, which a phone answers with its camera and a desktop with the same chooser
	// the row beside it opens. No second insertion path, no second decoder.
	if (kind === 'photo') { if (typeof rapierInsertPhoto === 'function') { rapierInsertPhoto(); return; } kind = 'picture'; }
	// The editor's own command, run the way its own button runs it (rapierOpenDraw picks the
	// insertion target itself, so a note just opened in read mode needs no caret first); the
	// toolbar's button is the fallback where the function is not in this build. The Add rows of the
	// note's own sheet and the circle's press the same real control.
	if (kind === 'drawing' && typeof rapierOpenDraw === 'function') { rapierOpenDraw(_rapierNotesDrawFor(fresh)); return; }
	if (kind === 'picture' && typeof rapierInsertImage === 'function') { rapierInsertImage(); return; }
	const el = document.querySelector(kind === 'drawing' ? '[data-command="insert.draw"]' : '[data-command="insert.image"]');
	if (el && !el.disabled) { el.click(); return; }
	showToast(kind === 'drawing' ? 'The note is open: tap Draw in the toolbar to draw in it.' : 'The note is open: tap Image in the toolbar to add one.', 'info');
}
// Jump to a section: it opens if it was closed (the choice is not remembered for a jump) and the
// scroller lands on its head.
function _rapierNotesJump(id) {
	const state = _rapierNotes, section = state.grids[id]?.parentElement; if (!section) return;
	if (_rapierNotesClosed(id)) {
		if (RAPIER_NOTES_SESSION_SECTIONS.includes(id)) { state.opened.add(id); _rapierNotesRender(); }
		else { const M = _rapierNotesModel(); state.index = M.setCollapsed(state.index, id, false); _rapierNotesRender(); void _rapierNotesWriteIndex().catch(() => {}); }
	}
	// The cards scroll under the Notes head, so the section's own head lands just below it: measured
	// from the scroller's top, a jump to Home put the word HOME behind the head bar.
	const under = state.surface.querySelector('.rapier-notes-head')?.getBoundingClientRect().bottom ?? state.scroll.getBoundingClientRect().top;
	const top = state.scroll.scrollTop + section.getBoundingClientRect().top - under - 8;
	state.scroll.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
	section.querySelector('.rapier-notes-section-head')?.focus({ preventScroll: true });
}
// The circle rides the scroller as the main view's does: its top follows the scroll fraction along
// the track from under the head to the foot; a drag on it scrolls; a press (no travel) opens.
function _rapierNotesFabTrack() {
	const state = _rapierNotes, fab = state.fab, scroll = state.scroll; if (!fab || !scroll || !state.open) return;
	const surface = state.surface.getBoundingClientRect(), head = state.surface.querySelector('.rapier-notes-head').getBoundingClientRect();
	// The search and the plus's bars OVERLAY the cards rather than push them, so they are not part of
	// the scroller's own box -- but the circle still may not stand under one, so the track still
	// begins below whichever of them is down.
	const filters = document.getElementById('rapier-notes-filters');
	const barH = (state.find?.hidden ? 0 : state.find.getBoundingClientRect().height) + (state.addsBar?.hidden ? 0 : state.addsBar.getBoundingClientRect().height) + (filters && !filters.hidden ? filters.getBoundingClientRect().height : 0) + (state.reorderBar && !state.reorderBar.hidden ? state.reorderBar.getBoundingClientRect().height : 0);
	const trackTop = head.height + barH + 16, trackBottom = surface.height - 60 - 16;
	const range = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
	const fraction = range ? Math.min(1, Math.max(0, scroll.scrollTop / range)) : 0;
	fab.style.top = Math.round(trackTop + fraction * Math.max(0, trackBottom - trackTop)) + 'px';
	fab.dataset.notesTrack = trackTop + ',' + trackBottom;
}
// The circle appears only while scrolling, by the main view's own rule and numbers
// (editor/engine.js `showFab` and `_rapierFabDwell`): shown on a scroll, hidden again after 900 ms
// on a phone and 2400 ms where there is a mouse, never hidden while a finger is on it, and never
// shown at all where there is nothing to scroll.
function _rapierNotesFabDwell() { return matchMedia('(hover: hover) and (pointer: fine)').matches ? 2400 : 900; }
// The circle appears only where it is useful -- never on a short list, and never raised by a move the
// person did not make: the plus's bar and the search slide OVER the cards, and a render, a reorder or a
// fold changes the scroller's own extent, and each of those can fire a scroll event of the page's own
// (the bar room's offset, a clamp). Those writes declare a quiet moment first
// (_rapierNotesScrollQuiet), and a scroll event inside it tracks the circle but never shows it.
function _rapierNotesScrollQuiet() { _rapierNotes.scrollQuietUntil = performance.now() + 400; }
function _rapierNotesFabShow() {
	const state = _rapierNotes, fab = state.fab, scroll = state.scroll; if (!fab || !scroll || !state.open) return;
	// Two screens of cards before the circle shows at all: a short scroll needs no indicator.
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
// The bottom sheet swipes down to close, even from a finger that lands on one of its rows (the
// house sheet's own rule, the info pop-ups): a travel past 60 px closes, less snaps back, and the
// tap that would follow a swipe is swallowed.
function _rapierNotesSheetSwipe(sheet) {
	// The house bottom sheet: a swipe down dismisses it even when it starts over an interactive
	// element. A touch that starts anywhere on the sheet but a text field, with the sheet scrolled to
	// its top, follows the finger down from 7 px; it commits at 88 px, or at 42 px when the finger is
	// moving faster than 0.52 px/ms; a sideways finger is not a swipe; a commit rides out in 170 ms, a
	// release before it settles back in 150 ms; the row under the finger is not tapped by a swipe.
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
	// A mouse has no swipe of its own; the wheel and the scrim do its dismissing. The pointer path
	// stays for a pen or a mouse drag that reaches 60 px.
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
		// A swipe on the sheet that closed it is not a tap on the row it started on.
		if (state.sheetSwiped) { state.sheetSwiped = false; evt.preventDefault(); return; }
		// Keyboard and assistive activation have no pointer-up. Pointer taps already landed there.
		if (evt.detail === 0) {
			const card = evt.target.closest('.rapier-notes-card'), box = evt.target.closest('[data-notes-check]'), fold = evt.target.closest('[data-notes-fold]'), play = evt.target.closest('[data-notes-play]');
			if (card && box) { void _rapierNotesToggleCheck(card.dataset.notesFile, Number(box.dataset.notesCheck)); return; }
			if (card && play) { if (typeof _rapierRecorderCardToggle === 'function') _rapierRecorderCardToggle(card.dataset.notesFile, play.dataset.notesPlay); return; }
			if (card && fold) { _rapierNotesFold(card.dataset.notesFile, fold.dataset.notesFold === 'show', true); return; }
			if (card && evt.target === card) {
				if (state.selected.size) _rapierNotesSelect(card.dataset.notesFile);
				else { state.openFrom = _rapierNotesLiftSnapshot(card.dataset.notesFile, card); void _rapierNotesOpenNote(card.dataset.notesFile); }
				return;
			}
		}
		const el = evt.target.closest('[data-notes-act]'), act = el?.dataset.notesAct;
		// A tap elsewhere collapses the bars: the plus's bar and the search go down on a tap on anything
		// but themselves, and their icon lets go. A search with words in it is a browse in progress and
		// stays.
		if (act !== 'adds' && act !== 'add' && !evt.target.closest('.rapier-notes-addsbar')) _rapierNotesAddsToggle(false);
		if (act !== 'search' && !state.query && !evt.target.closest('.rapier-notes-find, #rapier-notes-filters')) _rapierNotesSearchToggle(false);
		// The ground around either panel closes it, exactly as the main view's own overlays do
		// (editor/engine.js registers the same for the settings and the navigator).
		if (evt.target === state.askEl) { _rapierNotesAskOpen(false); return; }
		if (evt.target === state.jumpEl) { _rapierNotesJumpOpen(false); return; }
		if (evt.target === state.settingsEl) { _rapierNotesSettingsOpen(false); return; }
		// The scrim under the note's own sheet closes it, as every house sheet's does.
		if (!act) {
			if (state.compose && !evt.target.closest('.rapier-notes-sheet')) { _rapierNotesCloseSheet(); return; }
			if (state.sheet?.classList.contains('rapier-notes-sheet--open') && !evt.target.closest('.rapier-notes-sheet') && !evt.target.closest('.rapier-notes-selbar')) { _rapierNotesHideSheet(); return; }
			if (state.popup && !evt.target.closest('.rapier-notes-sheet')) _rapierNotesPopup(null);
			return;
		}
		// The one door out of the mode: the person asked for the document itself, so the document's
		// own head comes back (the note stays open and saving, and the arrow back to the cards with it).
		if (act === 'editor') { void _rapierNotesEditor(); return; }
		if (act === 'proposal-keep' || act === 'proposal-drop') { const file = el.closest('.rapier-notes-card')?.dataset.notesFile; if (file) void _rapierNotesProposal(file, act === 'proposal-keep'); return; }
		// The head's arrow and wordmark go back to the editor. Hiding the cards alone would leave Notes'
		// own mode on, so the page underneath would be the note wearing Notes' chrome -- its back arrow
		// one press back into the cards, round again. The way out is the door the kebab's Editor row
		// already is: one implementation, and the document's own head comes back.
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
		// Import and Backup run through the door's own data-action listener; left unclosed here, the
		// pop-up outlives them and swallows the person's next tap as a dismiss (measured:
		// notes-typing-budget's import load -- a card tapped right after Import opened nothing).
		if (act === 'menu-import' || act === 'menu-backup') { _rapierNotesSettingsOpen(false); return; }
		if (act === 'menu-saved-files') { _rapierNotesSettingsOpen(false); void _rapierAttachmentsShelf(); return; }
		// The sync sheet opens over this panel, as Share opens over the main one, and the box says what
		// changed when the sheet goes down.
		if (act === 'sync') { _rapierNotesSyncPress(); return; }
		if (act === 'role') { void _rapierNotesRequestRole(); return; }
		if (act === 'menu-imports') { _rapierNotesSettingsOpen(false); _rapierNotesImportsSheet(); return; }
		if (act === 'add') { const lift = el.dataset.notesAdd === 'drawing' ? _rapierNotesDrawLift(el) : el.dataset.notesAdd === 'note' ? _rapierNotesNoteLift(el) : null; _rapierNotesAddsToggle(false); _rapierNotesPopup(null); void _rapierNotesNew(el.dataset.notesAdd, false, lift); return; }
		if (act === 'jump') { _rapierNotesJumpOpen(false); _rapierNotesJump(el.dataset.notesJump); return; }
		// A sort or layout pick is a TOGGLE in the settings panel, not a row that dismisses it -- the
		// panel stays open with the new state worn, exactly as the main panel's switches do. Custom,
		// created and modified are all answerable from the index, so no sort needs a whole-folder read.
		// The surface follows the preference through its subscriber (below), whoever wrote it: this switch, or an agent at the door.
		if (act === 'sort') { const value = _rapierSwitchValue(el); _rapierNotesSetPref('notesSort', value); renderSwitch(el.parentElement, value); return; }
		// Skills lives in this panel. The section appears and goes on the cards, so the surface is
		// redrawn with the preference.
		if (act === 'skills') { const value = _rapierSwitchValue(el); _rapierNotesSetPref('notesSkills', value === 'true'); renderSwitch(el.parentElement, value); return; }
		// The colour mode: the bar alone or the whole page. The icon turns in place, so its band grows or
		// shrinks rather than being redrawn; the settings panel stands over the cards, so a note open
		// under them wears the new mode the next time it comes in (the head is painted for it now).
		if (act === 'colour-mode') { _rapierNotesSetPref('notesColour', _rapierNotesColourMode() === 'page' ? 'bar' : 'page'); _rapierNotesColourModeWear(el); return; }
		if (act === 'bin-open') { _rapierNotesSettingsOpen(false); _rapierNotesBinOpen(true); return; }
		if (act === 'bin-close') { _rapierNotesBinOpen(false); return; }
		if (act === 'bin-pick') {
			const file = el.dataset.notesBinFile;
			if (state.binPicked?.has(file)) state.binPicked.delete(file); else state.binPicked?.add(file);
			_rapierNotesBinPaint(); return;
		}
		if (act === 'bin-restore') { void _rapierNotesBinRun('restore', [...(state.binPicked || [])]); return; }
		if (act === 'bin-forever') { void _rapierNotesBinRun('delete-forever', [...(state.binPicked || [])]); return; }
		// Empty the bin is delete-forever over everything in it -- same act, same confirm, same
		// "there is no undo after this", rather than a quieter second way to destroy the same files.
		if (act === 'bin-empty') { void _rapierNotesBinRun('delete-forever', _rapierNotesBinFiles()); return; }
		if (act === 'layout') { const value = _rapierSwitchValue(el); _rapierNotesSetPref('notesLayout', value); renderSwitch(el.parentElement, value); return; }
		if (act === 'section-add-menu') { _rapierNotesSettingsOpen(false); void _rapierNotesSectionFromMenu(); return; }
		if (act === 'section' && el.classList.contains('rapier-notes-section-head')) {
			// In the Sections mode a tap on one of the person's own heads opens that section's face --
			// rename, delete; a built-in head does nothing there, and outside the mode a tap folds the
			// section as ever.
			if (state.reorder) { const id = el.dataset.notesSection; if ((state.index?.sections || []).some(s => s.name === id)) { state.sheetSection = id; _rapierNotesOpenSheet(null, 'section-edit'); } return; }
			void _rapierNotesToggleSection(el.dataset.notesSection); return;
		}
		if (act === 'section-new' || act === 'section-rename' || act === 'remind-set') return; // the form's submit carries the field's value
		void _rapierNotesAct(act, el.dataset.notesColour ?? el.dataset.notesSectionName ?? el.dataset.notesRemindAt ?? el.dataset.notesRepeat ?? el.dataset.notesVersion ?? el.dataset.notesTag ?? el.dataset.notesAdd ?? el.dataset.notesReceipt);
	});
	// A new query is a new list: it is read from its top, so the first match sits right under the
	// bar rather than behind it (the room the bar took above the cards is what makes that possible).
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
		// Keep the live query, but never paint an IME candidate or repeat the final input
		// some keyboards send after compositionend has already painted this same value. A close
		// or chip can change query outside this listener; retyping the old query is then new work.
		if (!searchComposing && (changed || state.query !== searchPainted)) paintSearch();
	});
	search.addEventListener('compositionend', () => { state.query = search.value; searchComposing = false; paintSearch(); });
	// A typed mutation gets its next frame before background projection resumes. IME composition
	// and a finger scrolling either Notes surface keep the gate until their own end event.
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
	document.addEventListener('click', evt => { const at = state.swallowClick; if (!at) return; state.swallowClick = 0; if (performance.now() - at < 700) { evt.stopPropagation(); evt.preventDefault(); } }, true);
	// While reorder is on, a finger on a section head is the reorder's, not a card's.
	surface.addEventListener('pointerdown', evt => { if (_rapierNotesReorderDown(evt)) return; _rapierNotesPointerDown(evt); });
	surface.addEventListener('pointermove', evt => { if (_rapierNotesReorderMove(evt)) return; _rapierNotesPointerMove(evt); });
	// Once the card is held the touch is the drag's: a mostly-vertical move would otherwise start
	// the browser's own pan and cancel the pointer (the cards allow pan-y so a scroll stays a scroll
	// BEFORE the hold). While the timer is pending nothing is refused here.
	surface.addEventListener('touchmove', evt => { if ((state.drag?.held || state.secDrag?.moved) && evt.cancelable) evt.preventDefault(); }, { passive: false });
	// On the document, capturing, not on the surface: a lift over a toast, a dialog or the page's own
	// chrome outside the surface must still end the drag; the handlers refuse any pointer that is not
	// the drag's own.
	document.addEventListener('pointerup', evt => { if (_rapierNotesReorderUp(evt, false)) return; void _rapierNotesPointerUp(evt); }, true);
	document.addEventListener('pointercancel', evt => { if (_rapierNotesReorderUp(evt, true)) return; void _rapierNotesPointerUp(evt, true); }, true);
	surface.addEventListener('keydown', evt => {
		// A key inside Notes is Notes' own; none reaches the editor's document-level handlers behind it.
		evt.stopPropagation();
		if (evt.isComposing || evt.keyCode === 229) return;
		if (_rapierNotesCardKey(evt)) return;
		const card = evt.target.closest?.('.rapier-notes-card'); if (!card) return;
		const box = evt.target.closest?.('[data-notes-check]');
		if (box && (evt.key === 'Enter' || evt.key === ' ')) { evt.preventDefault(); void _rapierNotesToggleCheck(card.dataset.notesFile, Number(box.dataset.notesCheck)); return; }
		// A native child control (a fold button) activates itself; only the card's own key opens or selects.
		if (evt.target !== card) return;
		if (evt.key === 'Enter') { evt.preventDefault(); if (state.selected.size) _rapierNotesSelect(card.dataset.notesFile); else { state.openFrom = _rapierNotesLiftSnapshot(card.dataset.notesFile, card); void _rapierNotesOpenNote(card.dataset.notesFile); } }
		else if (evt.key === ' ' || evt.key === 'ContextMenu' || (evt.shiftKey && evt.key === 'F10')) { evt.preventDefault(); _rapierNotesSelect(card.dataset.notesFile); }
	});
	surface.addEventListener('keydown', evt => {
		// Tab stays inside the topmost surface (a sheet's scrim, else Notes); Escape resolves the
		// topmost thing first -- the kebab or circle sheet, an open face, the selection, the search --
		// and only then leaves Notes.
		if (_rapierTrapModalTab(evt, state.sheet?.classList.contains('rapier-notes-sheet--open') ? state.sheet : surface)) return;
		if (evt.key !== 'Escape' || evt.isComposing || evt.keyCode === 229) return;
		evt.preventDefault();
		if (_rapierNotesBinIsOpen()) _rapierNotesBinOpen(false);
		else if (_rapierNotesSettingsIsOpen()) _rapierNotesSettingsOpen(false);
		else if (state.askEl?.classList.contains('open')) _rapierNotesAskOpen(false);
		else if (state.jumpEl?.classList.contains('open')) _rapierNotesJumpOpen(false);
		// The sheet before the Sections mode, as the phone's Back takes them (_rapierNotesHandleBack):
		// a section's face is raised over the mode, so it goes down first and leaves the person in it.
		else if (state.sheet?.classList.contains('rapier-notes-sheet--open')) _rapierNotesHideSheet();
		else if (state.reorder) _rapierNotesReorderOn(false);
		else if (state.popup) _rapierNotesPopup(null);
		else if (state.selected.size || state.sheetMode === 'imports') _rapierNotesCloseSheet();
		else if (!state.addsBar.hidden) _rapierNotesAddsToggle(false);
		else if (!state.find.hidden) _rapierNotesSearchToggle();
		// Leaving Notes is leaving Notes, whichever control says so: the same door the head's arrow
		// and wordmark take, so a keyboard is not left in the loop a finger was.
		else void _rapierNotesEditor();
	});
	// The phone's long press raises the context menu at the same half second as the hold: the menu is
	// refused and nothing else happens here -- the hold timer is the one owner of what a hold does
	// (otherwise a phone selects the card and raises the sheet under a drag).
	surface.addEventListener('contextmenu', evt => { if (evt.target.closest('.rapier-notes-card')) evt.preventDefault(); });
	window.addEventListener('resize', () => { if (state.open) _rapierNotesRender(); });
	// A note is the editor's document while it is open, and the editor's own departure flush stands
	// down for a `notes:` document on purpose (engine.js _rapierPersistenceCaptureBlocked: a note
	// never enters the editor's recovery store). What answers the departure instead is the folder:
	// the last typing burst is settled and written the moment the page hides, freezes, is about to
	// unload, or the Android host asks for its checkpoint before it may pause the WebView. Otherwise
	// the burst waits for the 700 ms tick, and a process killed inside the tick loses it.
	const departure = event => {
		_rapierNotesAbortDrag();
		if (!_rapierNotes.current) return;
		const completion = _rapierNotesFlush().then(stamp => _rapierMutationStampIsCurrent(stamp), () => false);
		if (typeof event?.detail?.waitUntil === 'function') event.detail.waitUntil(completion);
	};
	document.addEventListener('visibilitychange', () => { if (document.hidden) departure(); });
	window.addEventListener('pagehide', departure);
	window.addEventListener('freeze', departure);
	window.addEventListener('rapier:checkpoint-requested', departure);
	// The view preferences have one owner each: whoever writes one (the settings switch, an agent through the door), the open
	// surface follows at once.
	try { RapierPreferences.subscribe('notesSkills', () => { if (state.open) _rapierNotesRender(); }); } catch (_) {}
	try { RapierPreferences.subscribe('notesSort', () => { if (state.open) _rapierNotesRender(); }); } catch (_) {}
	try { RapierPreferences.subscribe('notesLayout', () => { if (state.open) { _rapierNotesLayout(); _rapierNotesRender(); } }); } catch (_) {}
	try { RapierPreferences.subscribe('notesColour', () => { if (state.open) _rapierNotesHeadPaint(); }); } catch (_) {}
	// The settings panel's copy of the theme selector follows the theme wherever it was chosen: the
	// main panel, this panel's copy, or the host.
	try { RapierPreferences.subscribe('theme', () => _rapierNotesThemeMark()); } catch (_) {}
}
// ---- The lift: a card into its note, and back -----------------------------------------------------
// Keep's motion, as one motion on one clock: a coloured card flattens into the top bar as it moves,
// never growing to full size first and shrinking after. The lift is a layer over the whole screen
// holding, bottom to top: the page's own ground, which dissolves what is leaving and gives way to
// what arrives; the plate, a box of the card's colour that only transforms -- from the card's box to
// the bar's (or to the whole screen, for a plain note, whose colour is the page's) and back; and the
// card's words on the plate, riding its corner and cut off by its foot. Above it stand copies of the
// heads' controls: the three both heads have glide from one head to the other, the ones only one head
// has fade where they stand. Every part is a Web Animation of transform or opacity on the lift's own
// clock, so the compositor runs it while the main thread loads the note. The main thread does three
// things only: it shows the note once it has been painted, closes the cards, and lands the lift when
// every part has finished -- by then each part stands exactly where the real thing is, so a landing a
// frame or a stall late changes nothing on screen. The snapshot of the card (its box, its face, its
// ground) is taken at the tap, before any read or render can replace the card's element. Under
// reduced motion there is no lift at all.
const RAPIER_NOTES_LIFT_MS = 400;
const RAPIER_NOTES_LIFT_EASE = 'cubic-bezier(.4,0,.2,1)';
// The parts of the clock, as fractions of it.
const RAPIER_NOTES_LIFT_AT = {
	faceOut: .3,          // the open: the card's words gone
	headOut: .2,          // the open: the cards' wordmark and search gone, before the plus passes the search
	cardsOut: [.15, .45], // the open: the cards dissolve into the page's ground
	pageIn: .55,          // the open: the note's words come in over this much of the clock, once loaded
	ownIn: .55,           // the open: undo, redo and the pin fade in from here
	noteOut: .25,         // the close: the note's words and its own controls gone; the cards come under the ground
	cardsIn: .6,          // the close: the ground gone from over the cards
	headIn: .55,          // the close: the cards' wordmark and search fade in from here
	faceIn: .6,           // the close: the card's words fade in from here
};
function _rapierNotesStill() { return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; }
// The card at the tap. Its face keeps the card's own look -- a title-only card's big title, a
// picture card's foot -- and drops only what the finger put on it (held, dragging, the press ring).
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
// The page's animation clock now, in ms (the document timeline, whose origin is performance.now's).
function _rapierNotesLiftNow() { return Number(document.timeline?.currentTime) || performance.now(); }
// One part of a lift, on the lift's own clock begun at `t0`: from `at` to `to` in fractions of it, a
// motion on the curve or a fade linear, held at both ends by default (a part that takes over from
// another is held only at its end). Every part is given its start outright rather than left to find
// one: an animation left to start itself is "pending" on the main thread until the compositor says
// when it began, and on a phone busy with a note that word waited a fifth of a second -- long enough
// for Chrome to restart the part from nothing at the next change to the page (at 4x CPU with a long
// note, the note's words, half in, went back to black and came in again). A part set going after its
// moment starts now over what is left of its span, never less than a fifth of the clock, rather than
// jumping into its middle.
function _rapierNotesLiftPlay(el, frames, t0, at = 0, to = 1, easing = RAPIER_NOTES_LIFT_EASE, fill = 'both') {
	const D = RAPIER_NOTES_LIFT_MS, now = _rapierNotesLiftNow();
	let begin = t0 + at * D, end = t0 + to * D;
	if (begin < now - 1) { begin = now; end = Math.max(end, now + .2 * D); }
	const a = el.animate(frames, {duration: Math.max(1, end - begin), easing, fill});
	a.startTime = begin;
	return a;
}
// A step on the lift's clock: `el`'s opacity is `a` until `at`, then `b`, held -- for a layer that must
// go or come at an exact moment whatever the main thread is doing then.
function _rapierNotesLiftStep(el, t0, at, a, b) {
	const x = el.animate([{opacity: a}, {opacity: a, offset: at}, {opacity: b, offset: at}, {opacity: b}], {duration: RAPIER_NOTES_LIFT_MS, easing: 'linear', fill: 'both'});
	x.startTime = t0;
	return x;
}
// The plate, the clip and the words at a box. The plate is a layer the lift's size scaled to the box
// (a flat colour, so a scale is invisible in it); the clip is the card's own size with its foot on the
// plate's foot, and the words stand at the plate's corner inside it. Each is linear in the box, so the
// three, interpolated on one curve, stay together at every frame.
function _rapierNotesLiftPlateAt(b, W, H) { return 'translate(' + b.left + 'px,' + b.top + 'px) scale(' + b.width / W + ',' + b.height / H + ')'; }
function _rapierNotesLiftClipAt(b, card) { return 'translate(' + b.left + 'px,' + (b.top + Math.min(0, b.height - card.height)) + 'px)'; }
function _rapierNotesLiftFaceAt(b, card) { return 'translate(0px,' + Math.max(0, card.height - b.height) + 'px)'; }
// The lift's own layers: the page's ground, the plate of `bg`, and the clip for the card's words. The
// page's ground is two layers, each with one fade of its own: `rise`, inside, comes up over what is
// leaving; `page`, around it, gives way to what arrives. Chrome runs one animation per property of an
// element on the compositor and cancels the older there when a newer one starts, so two fades on one
// layer, the second set going while a phone was busy with the note, left the ground to the stalled
// main thread: the note flashed in at full strength for a frame and went faint again.
function _rapierNotesLiftLayers(bg) {
	const lift = _rapierNotesEl('div', 'rapier-notes-lift'); lift.setAttribute('aria-hidden', 'true');
	const page = _rapierNotesEl('div', 'rapier-notes-lift-page'), rise = _rapierNotesEl('div');
	page.appendChild(rise);
	const plate = _rapierNotesEl('div', 'rapier-notes-lift-ground');
	// The card's colour carries alpha (a tint mixed over the surface); the plate paints it over the
	// page's own ground so nothing shows through as it moves.
	if (bg) { plate.style.backgroundImage = 'linear-gradient(' + bg + ',' + bg + ')'; plate.style.backgroundColor = 'var(--color-bg)'; }
	const clip = _rapierNotesEl('div', 'rapier-notes-lift-clip');
	lift.append(page, plate, clip);
	document.body.appendChild(lift);
	const box = lift.getBoundingClientRect();
	return {lift, page, rise, plate, clip, W: box.width || window.innerWidth, H: box.height || window.innerHeight};
}
// The card's words on the plate, the card's own size, with their two motions from box `a` to box `b`.
function _rapierNotesLiftWords(clip, snap, a, b, play) {
	const card = snap.rect, face = snap.face;
	face.style.setProperty('--lift-face-w', card.width + 'px');
	clip.style.width = card.width + 'px'; clip.style.height = card.height + 'px'; clip.appendChild(face);
	play(clip, [{transform: _rapierNotesLiftClipAt(a, card)}, {transform: _rapierNotesLiftClipAt(b, card)}]);
	play(face, [{transform: _rapierNotesLiftFaceAt(a, card)}, {transform: _rapierNotesLiftFaceAt(b, card)}]);
	return face;
}
// The controls through the lift. A copy is the control's glyph -- the svg itself, in its own ink and
// fill (a worn pin is filled) -- standing where the glyph stands, above the lift. The control is kept
// transparent while its copy stands in -- never hidden, so it keeps its place and its tap -- and the
// two change places in the landing frame, when they coincide.
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
// A shared control's copy set going to its partner's place, landing with the plate at the end of the
// clock begun at `t0` (or, set going late, over at least half a clock from now). The copy is put where
// it lands and starts from where it stands, so it is drawn at the size it ends at: nothing is left
// scaled when it lands.
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
// The open: the card's plate travels into the bar -- or grows to the whole screen, for a plain note
// -- while the cards dissolve into the page's ground under it and the shared controls glide; the note
// is loaded under it all. `grown`: the cards are fully under the page's ground, so they can be closed
// unseen. `bar()`: the note is loaded and its bar laid out (on the first open of a session only now),
// so the shared controls set off if they have not, the note's own controls are copied to fade in, and
// the note is set to come in. `fade()`: the cards are closed; the lift lands when the note has come
// in and every part has finished. `drop()`: the open was refused; everything is as it was. `draw`:
// the + bar's DRAW door -- a plate of the page's ground growing to the whole screen as the cards
// dissolve under it (the note is opened under it, the canvas comes up over it), no controls and
// nothing shown.
function _rapierNotesLiftGrow(snap, {draw = false} = {}) {
	if (_rapierNotesStill()) return null;
	const card = snap?.rect; if (!card || !(card.width > 0 && card.height > 0) || !snap.face) return null;
	const state = _rapierNotes, AT = RAPIER_NOTES_LIFT_AT, bar = draw ? null : document.querySelector('.top-bar');
	if (!draw) state.liftOpen?.drop();
	const {lift, page, rise, plate, clip, W, H} = _rapierNotesLiftLayers(snap.bg);
	// A coloured card becomes the bar; a plain one becomes the page -- and so does a coloured one whose
	// colour is to be the whole page: its plate grows to the screen and stays there, the note's ground,
	// until the note's words have come in on it.
	const paged = !draw && !!snap.colour && _rapierNotesColourMode() === 'page';
	const to = !draw && snap.colour && !paged ? _rapierNotesLiftRect(bar) || {left: 0, top: 0, width: W, height: 0} : {left: 0, top: 0, width: W, height: H};
	const t0 = _rapierNotesLiftNow(), parts = [], touched = [], copies = [], glides = [];
	const play = (el, frames, at, until, easing, fill) => { const a = _rapierNotesLiftPlay(el, frames, t0, at, until, easing, fill); parts.push(a); return a; };
	const travel = play(plate, [{transform: _rapierNotesLiftPlateAt(card, W, H)}, {transform: _rapierNotesLiftPlateAt(to, W, H)}]);
	const face = _rapierNotesLiftWords(clip, snap, card, to, play);
	// The card's words go once the note has loaded (show, below), never before it: on a fast phone that
	// is the first frames of the travel, as it always was; on a slow one they stay on the plate until the
	// note is ready to come in under them, so the plate never stands blank between them and the note
	// (the frame probe's `flat`, seen at 4x CPU: the words gone by 120 ms, the note not laid out until
	// 300). A canvas's plate carries no words and has no show: its face goes on the clock.
	if (draw) play(face, [{opacity: 1}, {opacity: 0}], 0, AT.faceOut, 'linear');
	const cardsOut = play(rise, [{opacity: 0}, {opacity: 1}], AT.cardsOut[0], AT.cardsOut[1], 'linear');
	// The card itself leaves its slot: the plate is the card now.
	const home = state.surface?.querySelector('.rapier-notes-card[data-notes-file="' + CSS.escape(String(snap.file || '')) + '"]');
	home?.classList.add('rapier-notes-card--lifted');
	const head = draw ? null : state.surface?.querySelector('.rapier-notes-head');
	if (head) {
		for (const [sel, id] of RAPIER_NOTES_SHARED_CONTROLS) {
			const from = head.querySelector(sel), c = _rapierNotesLiftCopy(from); if (!c) continue;
			from.classList.add('rapier-notes-glided'); copies.push(c); glides.push({...c, to: document.getElementById(id), anim: null});
		}
		// The cards' own controls (the wordmark, the search) go where they stand, before the plus passes.
		for (const el of head.children) if (!el.classList.contains('rapier-notes-head__gap') && !glides.some(g => g.control === el)) touched.push(_rapierNotesLiftPlay(el, [{opacity: 1}, {opacity: 0}], t0, 0, AT.headOut, 'linear'));
	}
	// The bar wears no colour and shows no control while the plate travels into it: the plate is its
	// colour, the copies are its controls.
	bar?.classList.add('top-bar--notes-lifting');
	// The shared controls land with the plate: set off at the tap when the note's bar is already laid
	// out (a note was open before these cards), else when it is.
	const setOff = () => { for (const g of glides) if (!g.anim) { g.anim = _rapierNotesLiftGlide(g, g.to, t0); if (g.anim) parts.push(g.anim); } };
	if (document.body.classList.contains('rapier-notes-mode')) setOff();
	let done = false, owned = false, shown = false, faded = false, away = null;
	// The note comes in at the moment the cards are fully under the page's ground (or at once, after
	// it): the cards step out under the ground, a plain plate with them (its ground is the page's), and
	// the ground gives way to the note -- all on the compositor, so a main thread still busy with the note
	// cannot hold the page's ground alone on the screen (it did, for a quarter of a second, at 4x CPU with
	// a long note). It is set going once the note is loaded (bar): these animations reach the compositor
	// in the same commit as the paint of the loaded note, so the ground never fades onto the page the
	// editor showed before.
	const show = () => {
		if (shown || done || draw) return; shown = true;
		const at = Math.max(AT.cardsOut[1], (_rapierNotesLiftNow() - t0) / RAPIER_NOTES_LIFT_MS);
		play(face, [{opacity: 1}, {opacity: 0}], 0, AT.faceOut, 'linear');
		if (state.surface && !state.surface.hidden) away = _rapierNotesLiftStep(state.surface, t0, Math.min(1, at), 1, 0);
		if (paged) {
			// The whole page: the plate covers the screen from the end of its travel, and the note's
			// ground under it is its colour already (_rapierNotesGroundPaint, painted with the note's
			// head), so the page's ground goes under the plate then and the plate gives way to the note
			// -- the colour stays and the words come in on it. Never before the plate is whole: the
			// page's ground would show through it.
			parts.push(_rapierNotesLiftStep(page, t0, 1, 1, 0));
			const whole = Math.max(1, at);
			play(plate, [{opacity: 1}, {opacity: 0}], whole, whole + AT.pageIn, 'linear');
		} else {
			if (!snap.colour) parts.push(_rapierNotesLiftStep(plate, t0, Math.min(1, at), 1, 0));
			play(page, [{opacity: 1}, {opacity: 0}], at, at + AT.pageIn, 'linear');
		}
		settle();
	};
	// The lift lands when the note has come in, the cards are closed and every part has finished.
	const settle = () => { if (shown && faded && !done) Promise.all(parts.filter(a => a.effect?.target?.isConnected).map(a => a.finished)).then(end, () => {}); };
	const handle = {
		grown: (cardsOut || travel).finished.then(() => {}, () => {}),
		bar() {
			if (done || draw) return;
			setOff();
			if (!owned) {
				owned = true;
				// The note's own controls come in where they stand, over the end of the travel.
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
		// The cards are closed by now (or the open was refused, and they come back as they were).
		away?.cancel();
		home?.classList.remove('rapier-notes-card--lifted');
		for (const c of copies) c.copy.remove();
		lift.remove();
		if (state.liftOpen === handle) state.liftOpen = null;
	};
	if (!draw) state.liftOpen = handle;
	return handle;
}
// The way back, taken at the press while the note is on the screen and the bar still wears its
// colour. The plate is the bar -- the bar's colour at the bar's place, or for a plain note the page's
// own ground over the whole screen, transparent until the note's words have gone (over the note it
// could only hide them) -- with copies of the bar's controls over it; the bar goes bare and its
// controls go under their copies in the same frame, so nothing changes on screen. The note's words
// and its own controls go at once. `to(snap, {warm})` sends the plate to the card: on the lift's own
// clock on the warm way back, where the cards are already up (they come in under the page's ground
// when the note's words have gone), or on a clock of its own once the card is there on the cold one.
// `away()`: no card to land on (an empty note discarded). `leave(ms)`: the cards are leaving for the
// editor, and the way back goes with them. `end()`: over now, everything shown as it stands. The
// clock is set going on the frame after the press (go, below); until then every part stands at its
// start, which is the screen as it was.
function _rapierNotesLiftBack() {
	if (_rapierNotesStill()) return null;
	const state = _rapierNotes, AT = RAPIER_NOTES_LIFT_AT, bar = document.querySelector('.top-bar');
	state.liftOpen?.drop();
	_rapierNotesLiftCancel();
	const colour = !!bar?.classList.contains('top-bar--notes-colour');
	// The whole page: the plate is the page, its colour the note's ground. It comes up over the note's
	// words, so they go into the colour while the ground stays as it is, and only then contracts into
	// the card, the same motion as the open reversed.
	const ground = colour && document.body.classList.contains('rapier-notes-paged') && state.groundEl?.isConnected ? state.groundEl : null;
	const {lift, page, rise, plate, clip, W, H} = _rapierNotesLiftLayers(colour ? getComputedStyle(ground || bar).backgroundColor : null);
	lift.classList.add('rapier-notes-lift--past');
	const from = colour && !ground ? _rapierNotesLiftRect(bar) || {left: 0, top: 0, width: W, height: 0} : {left: 0, top: 0, width: W, height: H};
	plate.style.transform = _rapierNotesLiftPlateAt(from, W, H);
	if (!colour || ground) plate.style.opacity = '0';
	// The clock stands far ahead until go sets it going; every part set on it stands at its start.
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
	// The note's words go: into the page's ground, or on the whole page into its colour -- the plate,
	// with the page's ground stepping in under it once it is whole (a ground rising under a plate still
	// coming up would darken or lighten the colour on the way).
	const noteOut = _rapierNotesLiftPlay(ground ? plate : rise, [{opacity: 0}, {opacity: 1}], t0, 0, AT.noteOut, 'linear');
	if (ground) _rapierNotesLiftStep(rise, t0, AT.noteOut, 0, 1);
	let done = false, left = false, home = null, surface = null, under = null, taps = null;
	// The cards take taps again when they step in under the ground (`taps`, on the clock).
	const free = () => { if (taps == null || !going) return; const wait = taps - _rapierNotesLiftNow(); setTimeout(() => { if (surface && !done) surface.style.pointerEvents = ''; }, Math.max(0, wait)); };
	// The second half on its clock `c0`: every part on one list, and the lift lands when they have all
	// finished. `shift`: when, on that clock, the note's words are gone (on the warm way back the lift's
	// own clock runs on; on the cold one they went before the card was there).
	const second = (c0) => {
		const run = [];
		const play = (el, frames, at, until, easing, fill) => { const a = _rapierNotesLiftPlay(el, frames, c0, at, until, easing, fill); run.push(a); return a; };
		play.c0 = c0;
		play.hold = a => { if (a) run.push(a); return a; };
		play.land = () => Promise.all(run.map(a => a.finished)).then(() => back.end(), () => {});
		return play;
	};
	// The cards come in: under the page's ground as it goes, the shared controls gliding home, the cards'
	// own controls fading in where they stand.
	const arrive = (warm, shift, play) => {
		surface = state.surface;
		// On the warm way back the cards are up already, out of sight until the note's words have gone;
		// they step in under the ground at that moment, on the compositor, and take no tap before it.
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
			// The card waits out of sight under the plate, which becomes it.
			home = state.surface?.querySelector('.rapier-notes-card[data-notes-file="' + CSS.escape(String(snap.file || '')) + '"]');
			home?.classList.add('rapier-notes-card--lifted');
			// The whole page holds the screen until the note's words have gone into it, then travels; the
			// card's words ride its corner on the same span, so the two stay together at every frame.
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
		// The cards leave for the editor while the way back is still landing (the phone's Back pressed
		// twice): the plate, the copies and the cards go together, on the cards' own fade. The step that
		// brings the cards in would otherwise hold them at full strength over that fade until the
		// landing, and the editor came in in one frame. The fade starts when its first frame reaches the
		// screen, as the cards' own fade (a transition) does: the leave lays the editor out again in the
		// same task, and a fade timed from the call had run two thirds of its course before it was seen.
		leave(ms) {
			if (done) return;
			if (!(ms > 0)) { back.end(); return; }
			left = true;
			bar?.classList.remove('top-bar--notes-lifting');
			const out = (el, from) => el.animate([{opacity: from}, {opacity: 0}], {duration: ms, easing: 'linear', fill: 'forwards'});
			// Each part fades from what the screen shows now, worked out from the clock: the main thread's
			// own view of a running part stands still while it is busy, and the leave has just reloaded the
			// editor -- read then, the cards read as not yet in, and they vanished in one frame.
			const now = performance.now(), k = going ? (now - t0) / RAPIER_NOTES_LIFT_MS : 0;
			if (surface?.isConnected) { const o = under ? (going && taps != null && now >= taps ? 1 : 0) : Number(getComputedStyle(surface).opacity); under?.cancel(); under = out(surface, o); surface.style.pointerEvents = 'none'; }
			const gone = out(lift, 1);
			for (const c of copies) if (c.copy.isConnected) out(c.copy, glides.some(g => g.copy === c.copy) ? 1 : Math.max(0, Math.min(1, 1 - k / AT.noteOut)));
			// Settled when the fade has run and the way back has ended: the cards are put away then.
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
	// The clock is set going on the frame after the one that brings the cards up. That frame lays out
	// and paints the whole surface -- at 4x CPU it held the main thread for 150 ms -- and a clock set
	// going at the press had run half its course before the first frame of it reached the screen: the
	// plate appeared half-way down.
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
// A note opened while the way back from the last one is still running (a quick tap on the card that
// just landed, the lock-screen door) ends it: its plate and copies go, and every control, card and
// bar it had out of sight is shown, so nothing of the note now opening is left under a copy.
function _rapierNotesLiftCancel() { _rapierNotes.liftBack?.end(); }
// The cold way back: the card comes up with its window (its text is read first, and a card past the
// first screen is derived as the list scrolls to it), so the plate waits at the bar for it, up to a
// second and a quarter, then travels.
async function _rapierNotesLiftShrink(back, file) {
	let card = null;
	// No note left to land on (an empty one discarded on the way back): the cards come in at once.
	for (let i = 0; i < 80 && !card && file; i++) { card = _rapierNotes.open ? document.querySelector('.rapier-notes-card[data-notes-file="' + CSS.escape(file) + '"]') : null; if (!card) await new Promise(resolve => setTimeout(resolve, 16)); }
	// The plate sets off on the frame after the one that lays the card out and paints it, as the warm
	// way back does (go, in _rapierNotesLiftBack).
	if (card) { try { card.scrollIntoView({block: 'center'}); } catch (_) {} await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
	if (_rapierNotes.liftBack !== back) return; // ended by a note opening meanwhile (_rapierNotesLiftCancel)
	if (card) back.to(_rapierNotesLiftSnapshot(file, card)); else back.away();
}
// The phone's Back (Rapier.shell.handleBack from the app; the harness) answered inside Notes: the pop-up, the
// sheet and the search close first; then on the cards the arrow's question comes up, whose row goes to the
// editor; a note composed inside Notes goes back to the cards, saved first. Never out of the app from inside
// Notes.
// What stands over the cards takes a Back before Notes itself does -- the bin, the settings panel, the arrow's
// question, the jump panel, a sheet's face, the Sections mode, the pop-up, a selection, the + bar, the search
// -- and over a note, its sheet: the same answer for the app's Back (_rapierNotesHandleBack) and the browser's
// (the popstate listener below; a phone browser's Back gesture is the browser's). True when one of them
// answered; false when Notes itself is what Back would leave.
function _rapierNotesBackOver() {
	const state = _rapierNotes;
	if (state.open && state.surface && !state.surface.hidden) {
		// The kebab's settings panel and the circle's jump panel stand where a pop-up does, and reorder
		// is a mode Back should leave rather than leaving Notes from inside it.
		if (_rapierNotesBinIsOpen()) { _rapierNotesBinOpen(false); return true; }
		if (_rapierNotesSettingsIsOpen()) { _rapierNotesSettingsOpen(false); return true; }
		if (state.askEl?.classList.contains('open')) { _rapierNotesAskOpen(false); return true; }
		if (state.jumpEl?.classList.contains('open')) { _rapierNotesJumpOpen(false); return true; }
		if (state.sheet?.classList.contains('rapier-notes-sheet--open')) { _rapierNotesHideSheet(); return true; }
		if (state.reorder) { _rapierNotesReorderOn(false); return true; }
		if (state.popup) { _rapierNotesPopup(null); return true; }
		if (state.selected.size || state.sheetMode === 'imports') { _rapierNotesCloseSheet(); return true; }
		if (state.addsBar && !state.addsBar.hidden) { _rapierNotesAddsToggle(false); return true; }
		if (state.find && !state.find.hidden) { _rapierNotesSearchToggle(); return true; }
		return false;
	}
	if (state.compose) { _rapierNotesCloseSheet(); return true; }
	return false;
}
// Back from a note: the note it was reached from by a followed link, as a browser's Back goes link by link, and from the first note
// the cards. One door for the head's arrow, the phone's Back and the browser's (the popstate listener below, which has already been
// popped to the entry `keep` + 2). A note gone or in the bin since is not somewhere to go back to: the cards.
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
		// Back on the cards asks the arrow's question and never leaves Notes at once. Its row is the door
		// the head's arrow and wordmark take (_rapierNotesEditor), and a second Back puts the question
		// away (_rapierNotesBackOver above). Never out of the app from inside Notes.
		_rapierNotesAskOpen(true); return true;
	}
	if (!overEditorOnly && state.mode && state.current) { void _rapierNotesBackFromNote(); return true; }
	return false;
}
// The browser's Back on the web: the cards are one history entry and a note inside them a second, so Back closes the note to the cards, on the
// cards asks the arrow's question, and never leaves the page. The app asks handleBack instead and pushes nothing. `historyDepth` is the entries
// Notes holds; a leave by the arrow or the wordmark pops them. Every entry carries its depth, and Notes sets its own depth before the browser
// answers a pop it made, so a popstate that lands at or above that depth is Notes' own and is ignored -- never a count of pops owed. A count
// would swallow the person's Back: a browser does not answer every go() (two in quick succession are coalesced; one past the entries the
// document has is nothing), and each unanswered one would eat a real Back.
const RAPIER_NOTES_HISTORY = {editor: 0, cards: 1, note: 2};
function _rapierNotesHistory(where) {
	const state = _rapierNotes;
	// A note reached by a followed link is one entry deeper than the note it came from (_rapierNotesBackFromNote); the cards and the editor
	// are reached from any depth and end every chain.
	if (where !== 'note') state.noteTrail = [];
	const want = where === 'note' ? RAPIER_NOTES_HISTORY.note + (state.noteTrail?.length || 0) : RAPIER_NOTES_HISTORY[where], depth = state.historyDepth || 0;
	if (want === depth || _rapierNotesIsApp() || typeof history !== 'object' || !history || typeof history.pushState !== 'function') return;
	try {
		if (want > depth) {
			// The door's mark is the entries': the editor's entry, the one under the cards', reads / before the
			// cards' entry is pushed over it, and the entry pushed reads /notes -- so the pop a leave makes lands
			// on /, whatever the page was served at. A mark written to the entry being left would go with it: the
			// pop restores the address written when the entry under it was made.
			if (depth === 0 && typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('notes', false);
			for (let i = depth; i < want; i++) history.pushState({rapierNotes: i + 1}, '');
			if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('notes', true);
		}
		else history.go(want - depth);
		state.historyDepth = want;
	} catch (_) {}
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('popstate', () => {
	const state = _rapierNotes;
	const depth = state.historyDepth || 0, to = Number(history.state?.rapierNotes) || 0;
	// A pop Notes made itself lands on an entry that still carries the address written when it was
	// pushed; the document that is open now may be another (the return from Notes restored it onto
	// the cards' entry, then popped, with Notes' own depth already set to nothing). So the entry now
	// current takes the open document's address (editor/engine.js _rapierPublishDocumentUrl, a no-op
	// for a note's own authority). The editor's guard under the cards and a canvas's entry over the
	// editor are shell/platform.js's (_rapierBackEntriesHold), which answers their pops: a pop with
	// no Notes depth is theirs, or Notes' own last one.
	if (!depth || to >= depth) { if (typeof _rapierPublishDocumentUrl === 'function') _rapierPublishDocumentUrl(); return; }
	// What stands on top answers the Back first, as the app's Back is answered (editor/engine.js
	// rapierHandleBack): a dialog -- a confirmation over the cards, Draw's question over a canvas --
	// then a canvas open over a note (draw/draw.js _rapierDrawHandleBack), then what stands over the
	// cards or the note -- a face, a panel, a mode, a selection, the + bar, the search
	// (_rapierNotesBackOver) -- and on the cards themselves the arrow's question (Back on the cards
	// never leaves Notes at once). In the note, the editor's picker, toolbar and image tools get
	// their turn before its return. Each asks, closes or is cancelled, and Notes takes its entries
	// back. The cards never come up under a canvas their fence would leave dead, and never close
	// under an open confirmation (which would leave the question standing over a dead editor).
	const answered = (typeof _rapierDialogsHandleBack === 'function' && _rapierDialogsHandleBack()) ||
		(typeof _rapierDrawHandleBack === 'function' && _rapierDrawHandleBack()) || _rapierNotesBackOver() ||
		(!state.open && state.mode && state.current && typeof _rapierUiHandleBack === 'function' && _rapierUiHandleBack()) ||
		(to === 0 && state.open && (_rapierNotesAskOpen(true), true));
	if (answered) { _rapierNotesHistoryAgain(to, depth); return; }
	state.historyDepth = to;
	// Inside a note Back returns to the cards at once, the note saved first (_rapierNotesOpen flushes
	// before the cards come up). A way back the folder refuses keeps the note open with its words,
	// and the note takes its entry back: the next Back is the note's again, never the cards'.
	if (to >= 2 && state.mode && state.current && !state.open && state.noteTrail?.length) void _rapierNotesBackFromNote(to - 2).then(ok => { if (!ok && (state.historyDepth || 0) === to) _rapierNotesHistoryAgain(to, depth); });
	else if (to === 1 && state.mode && state.current && !state.open) void _rapierNotesOpen().then(() => { if (!state.open && state.mode && state.current && (state.historyDepth || 0) === 1) _rapierNotesHistoryAgain(1, depth); });
	else if (to === 0 && state.mode && state.current) { state.historyDepth = 0; void _rapierNotesOpen(); }
});
// Notes' entries taken back over the one a Back landed on, each with the address it was pushed
// with: the cards' reads /notes (_rapierNotesHistory), a note's its own #n/<id>.
function _rapierNotesHistoryAgain(from, depth) {
	const state = _rapierNotes;
	try {
		for (let i = from + 1; i <= depth; i++) {
			history.pushState({rapierNotes: i}, '');
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
	if (String(rapier.document.filename || '') !== file) return false;
	const old = surface.querySelector('.rapier-notes-card[data-notes-file="' + CSS.escape(file) + '"]');
	if (!old || !old.parentElement) return false;
	const grid = old.parentElement, id = grid.parentElement?.dataset.notesSection;
	if (!id || _rapierNotesSectionOf(file) !== id) return false;
	// The note's card, as the note stands now, in the old card's slot.
	const fresh = _rapierNotesCard(file);
	fresh.style.setProperty('--x', old.style.getPropertyValue('--x')); fresh.style.setProperty('--y', old.style.getPropertyValue('--y'));
	fresh.dataset.notesSlot = old.dataset.notesSlot || ''; fresh.dataset.notesBox = old.dataset.notesBox || '';
	fresh.style.transition = 'none';
	old.replaceWith(fresh);
	// The way back is taken first, while the note is on the screen and the bar still wears its
	// colour: taken after the head is repainted for the cards, the bar would be bare and the colour
	// would leave it in one frame. The cards then come up out of sight in this same task, and the
	// lift's own clock brings them in once the note's words have gone.
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
	surface.focus({ preventScroll: true });
	if (_rapierNotesIsApp()) {
		if (!state.remindTimer) state.remindTimer = setInterval(_rapierNotesRemindTick, RAPIER_NOTES_REMIND_MS);
		_rapierNotesRemindTick();
	}
	return true;
}
// `unseen`: the note being left was never on the screen (_rapierNotesDrewNothing); nothing stands
// over it on the way back, and its going is not announced.
async function _rapierNotesOpen(capture = false, {unseen = false, guard} = {}) {
	if (guard && !guard()) return false;
	if (!_rapierEmbedFeatureAllowed('notes')) return false;
	if (!capture && !await _rapierNotesUnlock()) return;
	if (guard && !guard()) return false;
	if (typeof _rapierRecorderClosePlayers === 'function') _rapierRecorderClosePlayers(); if (typeof _rapierAttachmentsClose === 'function') _rapierAttachmentsClose();
	const state = _rapierNotes;
	state.opening = true;
	let lift = null, presented = false;
	try {
	// Back from a note composed inside Notes: the bar travels back into the note's card. Where the
	// card is not on the cards yet, the note's words go under the page's ground at once, the cards
	// come up under it, and the plate travels once the card is there; nothing is tapped through it.
	// Back from a note composed inside Notes: the cards come back exactly as they were left (the
	// surface's own elements, its scroll), the note's card refreshed in place with what was written,
	// and the note shrinks onto that card. Nothing is re-read or re-derived for the way back; the full
	// path below is for the first open and for a note whose card must move (a new note, one archived
	// or renamed from its own head, an empty one to discard).
	// The note's last change lands in the folder before its card is drawn from it (the autosave tick
	// may still be held: notes-autosave-ordering, notes-lockscreen-start).
	if (state.mode && state.current && !state.open) { try { await _rapierNotesFlush(); } catch (_) { return; } }
	if (guard && !guard()) return false;
	if (_rapierNotesReturnToCards()) return;
	const back = state.mode && state.current && !state.open;
	lift = back && !unseen ? _rapierNotesLiftBack() : null;
	await _rapierNotesStore.kind();
	if (guard && !guard()) return false;
	const surface = _rapierNotesEnsure();
	try { await _rapierNotesReady(); } catch (error) { lift?.end(); _rapierNotesStartClass(false); showToast(String(error.message || error), 'error'); return; }
	if (guard && !guard()) return false;
	try { await _rapierNotesFlush(); } catch (_) { lift?.end(); _rapierNotesStartClass(false); return; }
	if (state.loading) await state.loading;
	if (guard && !guard()) return false;
	// The way back from a note THIS window opened does not read the folder again. A read would
	// replace state.texts and state.titles, so notes/library.js would throw away both of its indexes
	// and every card's title with them, and nothing could be drawn until the whole folder had been
	// read a second time -- a blank cover plate for that whole time. Nothing about the folder has
	// changed: every write this window makes goes through _rapierNotesTake, and another window's
	// commit invalidates this one through _rapierNotesFolderChanged on its own. So a warm return
	// draws what is already held; a first open, or a reload already in flight, still reads.
	const warm = back && !!state.index && state.loadGen > 0 && !state.reloading;
	// The reads pass is the one thing the load owned that a warm return still needs new. It
	// remembers, per load, which rows it has already settled; the words of a note whose card left
	// the screen have since been let go (#257, _rapierNotesLetGo), so those rows say "read" while
	// state.texts says nothing -- and the window would then draw cards with no words and no height,
	// take them straight back out, and leave the grid empty for good. Begin the pass again: it
	// carries no words of its own, so nothing is thrown away by doing it.
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
	// On the way back the cards come up only under the page's ground, once the note's words have gone.
	if (lift) await lift.covered;
	if (guard && !guard()) return false;
	// The cards come in on the same short fade they leave on -- or stand at once under a canvas that
	// fades off them (`unseen`), or under the way back's ground, so nothing under them shows through
	// two fades. The fade is the stylesheet's (@starting-style, rapier-notes.css): it begins in the
	// first frame the cards are shown.
	if (surface.hidden) surface.classList.toggle('rapier-notes-surface--in', !unseen && !lift && !_rapierNotesStill());
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
	// One check now, then every 30 s while Notes stays open.
	if (_rapierNotesIsApp()) {
		if (!state.remindTimer) state.remindTimer = setInterval(_rapierNotesRemindTick, RAPIER_NOTES_REMIND_MS);
		_rapierNotesRemindTick();
	}
	} finally { if (!presented) lift?.end(); state.opening = false; }
}
// Keep's rule: a new note left empty is not kept. The note the circle made and the editor never
// gave a word is removed when the person comes back to Notes, and said once -- unless they never saw
// it (`unseen`: the + bar's canvas closed with nothing kept, _rapierNotesDrewNothing).
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
			// The empty file is gone but its editor acquired words during the await. The
			// ordinary save keeps them under a new identity; never detach or mark them clean.
			state.savedGen = -1; await _rapierNotesAutosave(); return;
		}
		if (state.current === file) { _rapierNotesLeaveNote(); _rapierNotesMarkClean(); }
		state.untitled.delete(file); state.texts.delete(file); state.titles.delete(file);
		if (!unseen) showToast('Empty note discarded', 'info');
	} catch (error) { showToast('The empty note could not be removed: ' + String(error?.message || error), 'error'); }
}
// Half-width cards (the default) or full width (the kebab): one variable the packer reads.
function _rapierNotesLayout() {
	const state = _rapierNotes; if (!state.surface) return;
	if (_rapierNotesPref('notesLayout', 'half') === 'full') state.surface.style.setProperty('--notes-cols', '1'); else state.surface.style.removeProperty('--notes-cols');
}
function _rapierNotesClose(authorized = false, toNote = false) {
	if (!authorized && _rapierNotes.captureToken) { void _rapierNotesUnlock().then(ok => { if (ok) _rapierNotesClose(true); }); return; }
	const state = _rapierNotes;
	if (!state.surface) return;
	// The head's arrow and wordmark are the ONLY way back to the editor. So leaving the cards is a
	// full leave: Notes' chrome comes off the app's head and the note stops being the thing Notes is
	// showing. Left set, `mode` would make the next open of Notes return to the last note rather than
	// the cards.
	if (!toNote) { _rapierNotesMode(false); _rapierNotesSettingsOpen(false); _rapierNotesJumpOpen(false); if (state.reorder) _rapierNotesReorderOn(false); _rapierNotesAddsToggle(false); }
	_rapierNotesCloseSheet(); _rapierNotesSnackHide();
	// The cards leave on a short fade (the arrow, the wordmark, the phone's Back); a note opening
	// under its lift needs none, the plate covers the cards.
	const fade = !toNote && !state.surface.hidden && !_rapierNotesStill();
	// A way back still landing goes with the cards, on their fade, and the cards are put away when
	// that fade has run.
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
	// A set/change/completion inside the last 30 s tick's own window would otherwise wait for the
	// next open to reach the app -- one last sync as the person leaves.
	_rapierNotesRemindSync();
}
// Notes says aria-modal and means it: while it is open the editor, the top bar and the format
// toolbar are inert, so Tab and a screen reader cannot wander behind it; the overlays (a confirm
// on top of Notes, the settings panel) are their own surfaces and stay as they are.
function _rapierNotesFence(on) {
	const state = _rapierNotes;
	_rapierNotesToastHome(on);
	if (on) {
		// A fence that already stands stays: _rapierNotesOpen can be called while Notes is open
		// (the lock-screen door reopening today's note), and a second pass would record only what
		// the first had not yet marked, so the close that followed left the editor inert for good
		// (found by notes-lockscreen-start).
		if (state.fenced?.length) return;
		// Everything on the page except Notes itself, the toasts and the confirm: what was already inert
		// (a hidden overlay that manages its own) is left to itself, so opening one over Notes and
		// closing it again is nobody's business but its own -- unless a dialog's isolation is what holds
		// it (OPEN NOTES is pressed inside the settings panel): that fence must outlive the panel, so
		// the node is taken. The engine's dialog baseline is told what the fence holds either way
		// (editor/engine.js _rapierIsolationFence), so a dialog released after the fence has moved
		// restores the page as Notes has it, not as the dialog found it.
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
// The toasts live where the person is looking. The Notes surface stacks over the whole page, so a
// notice raised while the cards are up -- "Nothing is old enough to tidy", a backup's progress and
// its cancel, "Imported 3 notes", a refusal -- would sit under it, and its placer, which counts a
// surface covering the viewport as an obstacle, would hold it back until Notes closed. While the
// cards are up the toast root is a child of the surface: it stacks inside it, above the cards and
// the foot, under the scrim and the sheets (a notice under a sheet is visibly under it), and the
// placer takes the surface a notice stands inside as its ground, not its obstacle. Back to the
// body when the cards go, so the editor's own notices are the editor's again. A canvas that is up
// over the cards (the + bar's DRAW) holds the root while it is (draw/draw.js _rapierDrawToastHome,
// which asks here where to put it back), so the cards opening or closing under it move nothing.
function _rapierNotesToastHome(inNotes) {
	const state = _rapierNotes, root = document.getElementById('toast-root');
	if (!root || document.body.classList.contains('rapier-draw-open')) return;
	const home = inNotes && state.surface ? state.surface : document.body;
	if (root.parentElement !== home) home.appendChild(root);
}
// Read-only facts for witnesses (like surface.rapierDrawPerf and rapierPaintFacts in Draw).
function _rapierNotesCurrentFile() {
	try {
		// The owner already holds this identity; the diagnostic facts getter deep-copies the whole index, and
		// this runs on every input event in the page (library.js's picker listener).
		const current = _rapierNotes.current;
		if (!current) return null;
		const filename = typeof rapier !== 'undefined' ? String((rapier && rapier.document && rapier.document.filename) || '') : current;
		if (filename !== current && filename !== _rapierNotes.renameWanted) return null;
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
// The agent's fence asks three things only -- are the cards over the document, which note is open, and is Notes
// swapping or certifying the document under them (a note opening, the cards opening, the way back, a rename), when an
// edit landing would make the person's own step refuse. This is the owner's own standing, and costs nothing (the
// diagnostic getter above copies the whole index).
Object.defineProperty(globalThis, 'rapierNotesStanding', { enumerable: false, get: () => ({ open: !!_rapierNotes.open, current: _rapierNotes.current || null,
	busy: !!(_rapierNotes.noteOpening || _rapierNotes.opening || _rapierNotes.returning || _rapierNotes.renaming) }) });
// ---- The agent's door
// ---------------------------------------------------------------------------
// Every agent connection uses this Notes owner. A query reaches the card search; writes reach
// the folder transaction. Trash stays readable and can be restored; only an explicit is:trash
// query includes it in a list. No tool changes Skills, credentials or permanent deletion.
async function _rapierNotesHostIndex(signal) {
	const state = _rapierNotes;
	if (state.index) return state.index;
	const M = _rapierNotesModel(), store = _rapierNotesStore;
	const files = await store.list();
	if (signal?.aborted) return null;
	let parsed;
	try { parsed = M.parseIndex(await store.read(M.NOTES_INDEX_FILE)); }
	catch (error) { if (error?.code !== 'corrupt') throw error; parsed = M.emptyIndex(); }
	return M.reconcile(parsed, files).index;
}
function _rapierNotesHostRefusal(error) {
	if (error?.name === 'AbortError') return {refused: 'cancelled'};
	if (error?.code === 'notes_locked') return {availability: 'locked', reason: 'notes_locked', hint: 'Unlock the enrolled Notes endpoint and reconnect.'};
	return {refused: String(error?.code || '').startsWith('notes_') ? error.code : error?.code === 'changed' ? 'notes_changed' : 'notes_folder_unreadable'};
}
function _rapierNotesHostLocked() {
	return _rapierNotes.captureToken ? {availability: 'locked', reason: 'notes_locked', hint: 'Unlock the app to use Notes.'} : null;
}
// A change an agent wrote over a note, with nothing of the person's lost. It is written only when the note is not open in the editor,
// still holds the words the agent read whole (`base`, their SHA-256), the shared Will admits the change and History took the person's words first; the owner's save
// refuses the write if the note moved after that. Otherwise `{reason}` says why it was not written; null when the call was withdrawn.
async function _rapierNotesAgentChange(file, next, base, signal, guard) {
	const state = _rapierNotes, store = _rapierNotesStore, sha = globalThis.RapierNotesIntegrity.sha256;
	if (!base) return {reason: 'notes_not_read'};
	if (state.current === file) return {reason: 'notes_open'};
	await store.kind();
	if (!state.index) _rapierNotesTake(await store.folder.read());
	const entry = state.index.notes[file], was = await store.queue(file, () => store.read(file));
	if (typeof was !== 'string' || await sha(was) !== base) return {reason: 'notes_changed'};
	const kernel = globalThis.RapierKernel;
	if (!kernel?.enforceWill || !kernel?.minimalSplice) return {reason: 'notes_law_unavailable'};
	// The digest binds this exact before-text through the folder save. A governed change remains a proposal until the person keeps it.
	if (kernel.enforceWill(was, next, [kernel.minimalSplice(was, next)])) return {reason: 'document_law'};
	let past = null;
	if (entry?.id) { try { past = await _rapierNotesRecordVersion({file, text: was, entry, reason: 'save', signal, guard}); } catch (error) { if (signal?.aborted || error?.code === 'notes_locked') throw error; console.warn('[rapier] notes history', error); } }
	if (!past) return {reason: 'notes_history_unavailable'};
	if (signal?.aborted) return null;
	if (state.current === file) return {reason: 'notes_open'};
	let saved;
	try { saved = await store.folder.save({file, id: entry.id, expectedDigest: [base], text: next, preserveConflict: false}, {signal, guard: () => {
		guard?.(); if (state.current === file) throw Object.assign(new Error('The person has this note open.'), {code: 'notes_open'});
	}}); }
	catch (error) { if (error?.code === 'changed') return {reason: 'notes_changed'}; throw error; }
	_rapierNotesTake(saved);
	const kept = saved.file;
	try { await _rapierNotesRecordVersion({file: kept, text: next, entry: state.index.notes[kept], reason: 'save'}); }
	catch (error) { console.warn('[rapier] notes history', error); }
	_rapierNotesHold(kept, next);
	if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(kept);
	return {file: kept};
}
globalThis.rapierNotesHost = Object.freeze({
	// notes.propose: a new note lands at once as the person's own, marked in the index as the agent's. A change is written at once over a
	// note the agent read whole and the person has not touched (their words go into History first); any other change is left as a card
	// to keep or drop, and `reason` says why. `saved` is the words as stored, for the kernel's next base.
	async propose({text, title = '', of = '', by, base}, {signal, guard: endpointGuard} = {}) {
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			const bytes = _rapierNotesStore.bytes;
			const guard = () => {
				endpointGuard?.();
				if (_rapierNotesHostLocked() || bytes && _rapierNotesStore.bytes !== bytes) throw Object.assign(new Error('Notes is locked.'), {code: 'notes_locked'});
			};
			await _rapierNotesReady();
			const M = _rapierNotesModel(), index = await _rapierNotesHostIndex(signal);
			if (!index || signal?.aborted || bytes && _rapierNotesStore.bytes !== bytes || typeof text !== 'string') return null;
			if (of && (!M.isNoteFile(of) || !index.notes[of] || index.notes[of].trashed)) return {refused: 'notes_target_missing'};
			const at = Date.now(), body = title && !/^#\s/.test(text) ? '# ' + title + '\n\n' + text : text;
			let waiting = null;
			if (of) {
				const change = await _rapierNotesAgentChange(of, text, base, signal, guard);
				if (change?.file) { if (_rapierNotes.open) _rapierNotesRender(); return {file: change.file, applied: true, saved: text}; }
				if (!change || signal?.aborted) return null;
				waiting = change.reason;
			}
			const mark = of ? {proposed: M.cleanProposed({by, at, of})} : {agent: M.cleanAgent({by, at})};
			if (!Object.values(mark)[0]) return null;
			const file = await _rapierNotesWriteNew(body, title || '', mark, undefined, {signal, guard});
			if (_rapierNotes.open) _rapierNotesRender();
			return {file, applied: !of, ...(waiting ? {reason: waiting} : {saved: body})};
		} catch (error) { console.warn('[rapier] notes: the agent\'s proposal was refused', error); return _rapierNotesHostRefusal(error); }
	},
	async list({query = '', signal} = {}) {
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
				rows.push({file, title: card.title || '', section: M.sectionOf(entry, index.sections), skill: entry.skill === true, ...(Number.isFinite(entry.modified) ? {modified: entry.modified} : {})});
			}
			if (denied()) return null;
			if (!query) return rows;
			const found = typeof _rapierNotesLibrarySearchList === 'function' ? _rapierNotesLibrarySearchList(texts, index, query) : null;
			return found ? rows.filter(row => found.has(row.file)) : {refused: 'notes_search_incomplete'};
		} catch (error) { console.warn('[rapier] notes: the agent\'s list was refused', error); return null; }
	},
	async read(file, {version, signal} = {}) {
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			const bytes = _rapierNotesStore.bytes;
			const denied = () => _rapierNotesHostLocked() || bytes && _rapierNotesStore.bytes !== bytes;
			if (denied()) return null;
			await _rapierNotesReady();
			const M = _rapierNotesModel(), name = String(file || '');
			if (!M.isNoteFile(name)) return null;
			const index = await _rapierNotesHostIndex(signal);
			if (!index || signal?.aborted || denied()) return null;
			const entry = index.notes[name];
			if (!entry) return null;
			if (version !== undefined) {
				if (!entry.id) return null;
				const H = globalThis.RapierNotesHistory;
				if (!H) return {refused: 'notes_history_unavailable'};
				const manifest = H.parseManifest(await _rapierNotesStore.readHistory(H.manifestName(entry.id)), {noteId: entry.id, now: Date.now()});
				if (!manifest.versions.some(row => row.id === version)) return null;
				const held = await H.materialize(manifest, version, path => _rapierNotesStore.readHistory(path));
				return signal?.aborted || denied() ? null : {file: name, text: held.text, version};
			}
			// Behind the note's own queue, so a save in flight lands before the agent reads.
			const text = await _rapierNotesStore.queue(name, () => _rapierNotesStore.read(name));
			if (typeof text !== 'string' || signal?.aborted || denied()) return null;
			return {file: name, text, section: M.sectionOf(entry, index.sections), ...(Number.isFinite(entry.modified) ? {modified: entry.modified} : {})};
		} catch (error) { console.warn('[rapier] notes: the agent\'s read was refused', error); return _rapierNotesHostRefusal(error); }
	},
	async history(file, {signal} = {}) {
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			await _rapierNotesReady();
			const store = _rapierNotesStore; await store.kind(); const bytes = store.bytes;
			if (!_rapierNotesModel().isNoteFile(file)) return {file, found: false, versions: []};
			const index = await _rapierNotesHostIndex(signal), entry = index?.notes[file];
			if (!entry) return {file, found: false, versions: []};
			if (!entry.id) return {file, found: true, versions: [], tidied: 0, tidiedAt: null};
			const H = globalThis.RapierNotesHistory;
			if (!H) return {refused: 'notes_history_unavailable'};
			const manifest = H.parseManifest(await store.readHistory(H.manifestName(entry.id)), {noteId: entry.id, now: Date.now()});
			if (signal?.aborted || _rapierNotesHostLocked() || store.bytes !== bytes) return {refused: 'cancelled'};
			return {file, found: true, versions: H.versionsOf(manifest, file).reverse().map(row => ({version: row.id, time: row.time, reason: row.reason, size: row.size, current: row.id === manifest.current})),
				tidied: manifest.thinned.reduce((sum, batch) => sum + batch.removes.length, 0), tidiedAt: manifest.thinned.at(-1)?.time ?? null};
		} catch (error) { return _rapierNotesHostRefusal(error); }
	},
	async set({file, ...input}, {signal, guard: endpointGuard} = {}) {
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			await _rapierNotesReady();
			const M = _rapierNotesModel(), fields = Object.fromEntries(M.NOTE_CONTROL_FIELDS.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]));
			if (!M.isNoteFile(file)) return {refused: 'notes_target_missing'};
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
			if (!id) return {refused: 'notes_target_missing'};
			const saved = await store.folder.controls({file, id, fields}, {signal, app, guard});
			_rapierNotesTake(saved); _rapierNotesHold(file, saved.text);
			if (typeof _rapierNotesLibraryTouch === 'function') _rapierNotesLibraryTouch(file);
			if (_rapierNotes.open) _rapierNotesRender();
			_rapierNotesHeadPaint();
			const result = {file, changed: saved.changed, previous: saved.previous};
			if (Object.hasOwn(fields, 'reminder')) result.reminder = {device: 'app', saved: true, delivery: 'device_managed'};
			return result;
		} catch (error) { return _rapierNotesHostRefusal(error); }
	},
	async sync({action, signal, guard} = {}) {
		try {
			const locked = _rapierNotesHostLocked(); if (locked) return locked;
			guard?.();
			if (action !== 'now') return {refused: 'notes_sync_action_invalid'};
			return typeof _rapierNotesSyncUi !== 'undefined' && typeof _rapierNotesSyncUi.syncNow === 'function'
				? await _rapierNotesSyncUi.syncNow({signal, guard}) : {action, synced: false, reason: 'notes_sync_not_configured'};
		} catch (error) { return _rapierNotesHostRefusal(error); }
	},
});
// The engine carries nothing for Notes (its top level is a ratchet that only shrinks: tools/
// engine-ownership.json). The controls in settings and the top bar ship hidden in ui.html; this
// file shows them, answers their taps, and paints its own two switches, so a build without this
// file (the document profile) shows none of them and the engine is byte-for-byte unchanged.
function _rapierNotesPaintSwitches() {
	for (const [id, field] of [['switch-notes-start', 'notesStart']]) {
		const group = document.getElementById(id); if (!group) continue;
		let value; try { value = String(RapierPreferences.read(field)); } catch (_) { continue; }
		renderSwitch(group, value);
	}
}
// The Notes settings panel's row asks for the role once, never nagged (RapierPlatform.host is the one
// door, absent on the web and below API 34 alike, and the panel paints the row only where it is).
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
	for (const id of ['notes-open-btn', 'switch-notes-start', 'notes-sync-btn']) { const el = document.getElementById(id); if (el) el.hidden = false; }
	_rapierNotesPaintSwitches();
	_rapierNotesSyncBoxWear();
	// notesSkills' control moved into the Notes settings panel and paints itself there;
	// notesLockScreen is gone with its toggle. Subscribing to a field with no spec threw, and the
	// outer catch swallowed it silently, once per install.
	try { RapierPreferences.subscribe('notesStart', _rapierNotesPaintSwitches); } catch (_) {}
	// The Import sheet goes down by Escape too -- the sheet's own key, wherever the focus stands in it.
	document.getElementById('notes-import-overlay')?.addEventListener('keydown', evt => { if (evt.key !== 'Escape' || evt.isComposing) return; evt.preventDefault(); evt.stopPropagation(); _rapierNotesImportClose(); });
	document.addEventListener('click', evt => {
		// The note's own head controls, answered only while a note is open inside Notes.
		if (evt.target.closest?.('[data-action="notes-pin"]')) { void _rapierNotesHeadAct('pin'); return; }
		// The plus opens the attach sheet; a second press puts it down, the way the kebab beside it
		// already works.
		if (evt.target.closest?.('[data-action="notes-plus"]')) { if (_rapierNotes.compose && _rapierNotes.sheetMode === 'add') _rapierNotesCloseSheet(); else _rapierNotesNoteSheet('add'); return; }
		if (evt.target.closest?.('[data-action="notes-remind"]')) { _rapierNotesNoteSheet('remind'); return; }
		if (evt.target.closest?.('[data-action="notes-kebab"]')) { if (_rapierNotes.compose) _rapierNotesCloseSheet(); else _rapierNotesNoteSheet('actions'); return; }
		if (evt.target.closest?.('[data-action="notes-import"]')) { void _rapierNotesImport(); return; }
		const pick = evt.target.closest?.('[data-action="notes-import-pick"]'); if (pick) { void _rapierNotesImportPick(pick.dataset.value || 'any'); return; }
		if (evt.target.closest?.('[data-action="notes-import-close"]')) { _rapierNotesImportClose(); return; }
		// The scrim round the Import sheet puts it away, as the house's other sheets' scrims do.
		if (evt.target?.id === 'notes-import-overlay') { _rapierNotesImportClose(); return; }
		if (evt.target.closest?.('[data-action="notes-sync"]')) { _rapierNotesSyncPress(); return; }
		if (evt.target.closest?.('[data-action="notes-backup"]')) { void _rapierNotesBackup(); return; }
		if (!evt.target.closest?.('[data-action="notes-open"]')) return;
		try { const overlay = _rapierUi?.refs?.settingsOverlay; if (overlay && typeof closeDialog === 'function') closeDialog(overlay); } catch (_) {}
		void (evt.target.closest?.('#btn-notes-back') ? _rapierNotesBackFromNote() : _rapierNotesOpen());
	});
	// Start in Notes when the person asked to (the settings switch): the moment the boot completes
	// (shell/platform.js _rapierBootFactsPublished, resolved after the boot's own document restore
	// has settled), not a guessed 400 ms after load. The editor is kept unpainted until then by the
	// html class set at this file's evaluation (below), so the first thing seen is Notes' ground,
	// never the editor first.
	try {
		// A note's own address opens that note, whatever the start switch says; a document's address is
		// the editor's business, and Notes does not start over it.
		const born = /^#n\/([^/]+)/.exec(RAPIER_NOTES_URL_AT_BIRTH);
		const booted = typeof _rapierBootFactsPublished !== 'undefined' ? _rapierBootFactsPublished : Promise.resolve();
		// Both are conveniences scheduled at start-up, and they yield to a person who got there first:
		// once Notes or a note has been opened by hand, the boot opens nothing over it, and never over a
		// way back already running.
		const first = () => !_rapierNotes.open && !_rapierNotes.mode;
		if (born) { let id = born[1]; try { id = decodeURIComponent(id); } catch (_) {} booted.then(() => { if (first()) void _rapierNotesOpenById(id); else _rapierNotesStartClass(false); }, () => _rapierNotesStartClass(false)); }
		else if ((RapierPreferences.read('notesStart') === 'notes' || RAPIER_NOTES_DOOR_AT_BIRTH) && !RAPIER_NOTES_URL_AT_BIRTH.startsWith('#d/')) {
			booted.then(() => { if (first()) void _rapierNotesOpen(); else _rapierNotesStartClass(false); }, () => _rapierNotesStartClass(false));
		} else _rapierNotesStartClass(false);
	} catch (_) { _rapierNotesStartClass(false); }
}
// The html class that keeps the editor's chrome unpainted until Notes opens on a START IN NOTES
// launch (editor/styles/rapier-notes.css): set at this file's evaluation, before the first paint,
// and taken off the moment Notes is up, declined, or cannot open.
function _rapierNotesStartClass(on) {
	try { document.documentElement.classList.toggle('rapier-notes-start', on === true); } catch (_) {}
}
try { if (RAPIER_NOTES_URL_AT_BIRTH.startsWith('#n/') || ((RAPIER_NOTES_DOOR_AT_BIRTH || (typeof RapierPreferences !== 'undefined' && RapierPreferences.read('notesStart') === 'notes')) && !RAPIER_NOTES_URL_AT_BIRTH.startsWith('#d/'))) _rapierNotesStartClass(true); } catch (_) {}
if (document.readyState === 'complete') _rapierNotesInstall(); else window.addEventListener('load', _rapierNotesInstall, { once: true });

// The Android app's one door from the lock screen or a stylus shortcut. MainActivity calls this
// through evaluateJavascript once the page can hear it, queuing the kind itself where it cannot
// yet -- this file only ever answers, never asks Android anything. 'note' or 'draw'; opens Notes
// and starts the note per notesLockScreen, through the same _rapierNotesOpen/_rapierNotesNew every
// other door already uses. `new` (the default) is a fresh note or drawing, exactly the circle's
// own act; `day` finds or starts one note named "Lock screen <date>" for today and lands the caret
// ready at its end, so several lock-screen jottings in one day gather in the same note.
globalThis.rapierNotesStart = function rapierNotesStart(kind, captureToken = null) {
	const run = _rapierNotes.captureChain.catch(() => {}).then(() => _rapierNotesCapture(kind, captureToken));
	_rapierNotes.captureChain = run;
	return run;
};
// Home-screen launches use regular Notes authentication and the existing capture queue. An id
// survives a filename change; the final open rereads both that identity and its bytes together.
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
// The native inbox is durable until the folder has kept the note and every linked byte.
// Share, widget and lock-screen launches enter one queue; a failed receipt is safe to redeliver.
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
				// Durable arrival does not own metadata changed while this write awaited.
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
		// A concealed capture cannot ask a question above a dirty ordinary document. Keep it
		// untouched, and let native authentication reveal that document before any transition.
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
	if (!state.open || !state.index) return; // the cache warning was declined, or the folder could not be read
	// Task #225: a reminder notification names its own note's file, never 'note'/'draw' -- opens
	// straight into it (or does nothing once the note is gone), never _rapierNotesNew.
	// The name arrives from outside the page, so it is admitted as a note file name and looked up
	// as the folder's own key, never as whatever an object happens to inherit.
	if (kind !== 'note' && kind !== 'draw') {
		const M = _rapierNotesModel(), name = String(kind || '');
		if (!M.isNoteFile(name) || !Object.hasOwn(state.index.notes, name)) return;
		if (!state.index.notes[name].trashed) await _rapierNotesOpenNote(name);
		return;
	}
	const noteKind = kind === 'draw' ? 'drawing' : 'note';
	// The lock-screen shortcut opens a brand new note. One path, no preference, and no today's-note
	// lookup -- so a lock-screen tap never reads every note in the folder looking for a title before
	// it can show anything.
	// A note begun at the capture door records its first landed words as `capture` in its own past,
	// never as a borrowed `save`; the widget's plus is an ordinary new note.
	return _rapierNotesNew(noteKind, capture, null, captured);
}

// ---- The app's persisted reminder table ---------------------------------------------------------
// model.mjs owns repeat rules. The native executor retains every row and its delivered cursor;
// nothing is capped at the first note, the next page open, or an arbitrary future horizon.
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
		// Timers may run during optimistic page edits. The native table is always a
		// projection of the fresh committed sidecar, never of those uncommitted fields.
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

// These are the custom recurrence and snooze fields named by the reminder plan.
// They reuse the reminder sheet and the same input/button classes; no second settings surface.
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

// Page controls and inline actions share the folder owner's admission and commit boundary.
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
		// Schedule the committed folder without replacing concurrent page metadata.
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

// Notification actions are durable native receipts, consumed only after the existing folder
// owner has committed them. Replays are idempotent by the action token stored in note data.
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
		// A human choice or another completed transaction may have arrived during the
		// owner write. Keep it in the page; the next owner read settles the fresh index.
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

// A setting is acknowledged after folder and native table custody. Ask permission only for this
// deliberate act, then read live app/channel and alarm state instead of the earlier upload reply.
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
