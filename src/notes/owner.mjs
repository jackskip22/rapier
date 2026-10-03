// Reads return the complete note listing, but only explicitly requested bodies. Transaction
// results are listing-only; admission and recovery read their own affected files afresh. No body
// cache survives a call, and a planner never owns the listing used to admit its operations.
// The lease excludes another Rapier window using this owner; a foreign filesystem writer is
// caught by the digest at the narrowest window storage gives, which only the storage's own
// conditional removal could close entirely.
import {NOTES_INDEX_FILE, emptyIndex, isNoteFile, validNoteId, noteFileName, attachmentFileName, parseIndex, reconcile, serializeIndex} from './model.mjs';
import {exactBytes, sha256, storedFileDigest} from './integrity.mjs';

// The sidecar only. A note's own bytes never pass through here -- the folder keeps a body's
// leading byte order mark exactly as it found it (notes-bom-through-the-platform). This index is
// JSON, and JSON.parse refuses a leading U+FEFF, so a notes.json some other tool wrote with a mark
// would make the whole folder unreadable and every note in it unreachable. ignoreBOM: false is the
// decoder dropping that one leading mark, which is what a JSON reader must do.
const decode = value => new TextDecoder('utf-8', {fatal: true, ignoreBOM: false}).decode(exactBytes(value));
const copy = value => JSON.parse(JSON.stringify(value));
export const OWNER_JOURNAL_FILE = '.rapier-owner.json';
const syncStateFile = file => file === '.rapier-sync.json';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const fail = (code, message) => Object.assign(new Error(message), {code});
const equal = (a, b) => {
	if (a == null || b == null) return a == null && b == null;
	if (a.length !== b.length) return false;
	// Dense byte arrays: every read-back byte still counts, without a callback per byte.
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
};
const digestOf = async bytes => bytes == null ? null : sha256(bytes);
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function pack(bytes) {
	let out = '';
	for (let i = 0; i < bytes.length; i += 3) {
		const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
		out += alphabet[n >>> 18] + alphabet[(n >>> 12) & 63] + (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : '=') + (i + 2 < bytes.length ? alphabet[n & 63] : '=');
	}
	return out;
}
function unpack(text) {
	// A linear check, then the decode and the canonical re-pack below prove the rest. The grouped
	// expression this replaced recursed once per four characters and overflowed the engine's stack
	// above about 4.4 million of them -- a note holding two photos -- and, because every read of the
	// folder replays the pending transaction, locked the whole folder after one such save (Lane S, D1).
	if (typeof text !== 'string' || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw fail('corrupt', 'The pending note bytes are not readable.');
	const out = new Uint8Array(text.length / 4 * 3 - (text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0));
	let at = 0;
	for (let i = 0; i < text.length; i += 4) {
		const n = (alphabet.indexOf(text[i]) << 18) | (alphabet.indexOf(text[i + 1]) << 12) | (Math.max(0, alphabet.indexOf(text[i + 2])) << 6) | Math.max(0, alphabet.indexOf(text[i + 3]));
		for (const shift of [16, 8, 0]) if (at < out.length) out[at++] = (n >>> shift) & 255;
	}
	if (pack(out) !== text) throw fail('corrupt', 'The pending note bytes are not canonical base64.');
	return out;
}
function fileName(file, snapshot = false) {
	const path = typeof file === 'string' ? file.split('/') : [];
	const supported = snapshot && path.length && !/[\\\0]/.test(file) && path.every(part => part && part !== '.' && part !== '..') && file !== NOTES_INDEX_FILE && file !== OWNER_JOURNAL_FILE
		&& (path.length === 1 || path.length === 2 && ['audio', 'attachments', 'thumbs'].includes(path[0]) || path.length === 3 && path[0] === 'history' && ['manifests', 'texts', 'blobs'].includes(path[1]));
	const history = typeof file === 'string' && /^history\/(?:manifests\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}![1-9][0-9]*\.json|(?:texts|blobs)\/[a-f0-9]{64})$/.test(file);
	if (snapshot ? !supported : !syncStateFile(file) && !history && !isNoteFile(file) && !(typeof file === 'string' && /^(?:audio|attachments|thumbs)\/[^/\\\0]+$/.test(file) && !['.', '..'].includes(file.split('/')[1]))) throw fail('name', 'A transaction cannot write this folder path: ' + file + '.');
	return file;
}
// Deltas retain extension keys literally. Traversal is through own JSON properties only;
// defineProperty keeps names such as __proto__ as data rather than prototype mutation.
const jsonObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const jsonSame = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonicalJSON = value => JSON.stringify(value, (_key, row) => jsonObject(row) ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : row);
const setOwn = (object, key, value) => Object.defineProperty(object, key, {value, enumerable: true, configurable: true, writable: true});
function indexDelta(before, after) {
	const notes = [], root = [];
	for (const file of new Set([...Object.keys(before.notes), ...Object.keys(after.notes)])) {
		const old = before.notes[file], next = after.notes[file];
		if (!jsonSame(old, next)) notes.push({file, id: (next || old)?.id ?? null, beforeId: old?.id ?? null, entry: next ?? null});
	}
	const walk = (old, next, path) => {
		if (jsonSame(old, next)) return;
		if (jsonObject(old) && jsonObject(next)) {
			for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) walk(own(old, key) ? old[key] : undefined, own(next, key) ? next[key] : undefined, [...path, key]);
		} else root.push(next === undefined ? {path, remove: true} : {path, value: next});
	};
	for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) if (!['notes', 'folderGeneration', 'ownerNotice', 'transaction'].includes(key))
		walk(own(before, key) ? before[key] : undefined, own(after, key) ? after[key] : undefined, [key]);
	return {notes, root};
}
function applyIndexDelta(base, journal) {
	const delta = journal.delta;
	if (!jsonObject(delta) || !Array.isArray(delta.notes) || !Array.isArray(delta.root)) throw fail('corrupt', 'The pending index change is unreadable.');
	const after = {...base, notes: {...base.notes}}, names = new Set(), paths = [];
	delete after.ownerNotice;
	for (const row of delta.notes) {
		if (!jsonObject(row) || !isNoteFile(row.file) || names.has(row.file) || row.beforeId !== (base.notes[row.file]?.id ?? null) ||
			!(row.id === null || validNoteId(row.id)) || !(row.entry === null || jsonObject(row.entry)) ||
			row.id !== (row.entry?.id ?? base.notes[row.file]?.id ?? null) || row.entry?.revision !== undefined && (typeof row.entry.revision !== 'string' || !row.entry.revision)) throw fail('corrupt', 'The pending note entry has no exact identity.');
		names.add(row.file);
		if (row.entry === null) delete after.notes[row.file]; else setOwn(after.notes, row.file, row.entry);
	}
	const ids = new Set();
	for (const entry of Object.values(after.notes)) if (entry.id !== undefined) {
		if (!validNoteId(entry.id) || ids.has(entry.id)) throw fail('corrupt', 'The pending sidecar contains a missing or duplicate note identity.');
		ids.add(entry.id);
	}
	for (const row of delta.root) {
		if (!jsonObject(row) || !Array.isArray(row.path) || !row.path.length || row.path.some(key => typeof key !== 'string') ||
			['notes', 'folderGeneration', 'ownerNotice', 'transaction'].includes(row.path[0]) ||
			(row.remove === true) === own(row, 'value') || row.remove !== undefined && row.remove !== true ||
			paths.some(path => path.every((key, i) => row.path[i] === key) || row.path.every((key, i) => path[i] === key))) throw fail('corrupt', 'The pending metadata path is unreadable.');
		paths.push(row.path);
		let target = after;
		for (const key of row.path.slice(0, -1)) {
			if (!own(target, key) || !jsonObject(target[key])) throw fail('corrupt', 'The pending metadata path has no base.');
			const next = {...target[key]}; setOwn(target, key, next); target = next;
		}
		const key = row.path.at(-1);
		if (row.remove) delete target[key]; else setOwn(target, key, row.value);
	}
	after.folderGeneration = journal.generation;
	return after;
}
function requestedBodies({bodies = []} = {}) {
	if (!Array.isArray(bodies)) throw fail('plan', 'A notes read needs a list of body filenames.');
	const files = [...new Set(bodies)];
	if (files.some(file => !isNoteFile(file))) throw fail('name', 'A body read may name only notes in this folder.');
	return files;
}
function repairListing(index, files, clock) {
	const fixed = reconcile(index, files), missing = {...index.missingFiles};
	for (const file of fixed.dropped) missing[file] = {entry: index.notes[file], noticedAt: clock()};
	for (const file of fixed.added) delete missing[file];
	if (Object.keys(missing).length) fixed.index.missingFiles = missing; else delete fixed.index.missingFiles;
	return fixed;
}
export function folderGeneration(index) {
	const value = index.folderGeneration ?? 0;
	if (!Number.isSafeInteger(value) || value < 0) throw fail('corrupt', 'The notes folder generation is not readable.');
	return value;
}

// Store.write atomically replaces ONE file. The journal makes a sequence repairable; it does
// not turn unowned filesystem reads into transactions. Every Rapier reader takes this owner too.
export function createOwner({store, locks, channel, shared = true, timeoutMs = 1500, clock = Date.now, onInvalidate = () => {}, recover: repair, timers = {setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id)}} = {}) {
	if (!store || !['read', 'write', 'remove', 'list'].every(name => typeof store[name] === 'function')) throw fail('store', 'The notes owner needs a complete file store.');
	if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw fail('timeout', 'The owner wait must be bounded.');
	// `shared` may be a question rather than a settled answer, and it is asked at the moment it
	// matters. The store below can be a rung that does not know whether its bytes are visible to
	// another page until it has asked the browser, which happens after the folder is built; a
	// boolean frozen at construction was how the IndexedDB rung came to be coordinated as if it
	// were this page's private memory (Astra R87i I01).
	const isShared = () => typeof shared === 'function' ? !!shared() : !!shared;
	let localTail = Promise.resolve(), closed = false;
	const receive = event => {
		const value = event?.data;
		if (value?.type !== 'rapier-notes-commit' || typeof value.scope !== 'string' || !Number.isSafeInteger(value.generation) || value.generation < 0) return;
		// A notice invalidates a view; it never supplies its contents. Exact restore can
		// restore a lower generation, and messages from different senders can arrive out
		// of order. Re-read current storage for every valid notice instead of suppressing
		// new work with a remembered generation from a superseded snapshot.
		onInvalidate({scope: value.scope, generation: value.generation, changed: Array.isArray(value.changed) ? value.changed.filter(isNoteFile) : []});
	};
	channel?.addEventListener?.('message', receive);
	const readBytes = async file => { const value = await store.read(file); return value == null ? null : exactBytes(value); };
	const removalDigest = file => file.startsWith('attachments/') ? storedFileDigest(store, file) : readBytes(file).then(digestOf);
	const snapshotFiles = async () => {
		const files = [];
		for (const prefix of ['', 'audio', 'attachments', 'thumbs', 'history/manifests', 'history/texts', 'history/blobs'])
			for (const name of await store.list(prefix)) files.push(prefix ? prefix + '/' + name : name);
		return files;
	};
	const emptyDestination = async () => {
		if ((await snapshotFiles()).some(file => file !== NOTES_INDEX_FILE)) throw fail('occupied', 'Exact restore needs an empty Notes folder. Existing files were kept; use Add backup.');
		const bytes = await readBytes(NOTES_INDEX_FILE);
		if (bytes != null) {
			const raw = JSON.parse(decode(bytes)), clean = copy(raw);
			// Only the owner's unused identity is incidental. Sections, root extensions, import
			// receipts and a consumed identity counter are somebody's work, even with no notes.
			delete clean.folderDeviceId; delete clean.folderGeneration;
			if (clean.ownerNotice?.kind === 'identity' && clean.ownerNotice.generation === folderGeneration(raw) && Array.isArray(clean.ownerNotice.changed) && clean.ownerNotice.changed.length === 0) delete clean.ownerNotice;
			if (clean.noteCounters && Object.keys(clean.noteCounters).length === 0) delete clean.noteCounters;
			const baseline = emptyIndex();
			if (Object.keys(clean).some(key => !own(baseline, key)) || Object.keys(baseline).some(key => JSON.stringify(clean[key] ?? baseline[key]) !== JSON.stringify(baseline[key])))
				throw fail('occupied', 'This Notes folder already has saved metadata. It was kept; use Add backup.');
		}
	};
	let indexReceipt = null;
	const readIndex = async () => { const bytes = await readBytes(NOTES_INDEX_FILE); indexReceipt = bytes; if (bytes == null && (await store.list()).includes(NOTES_INDEX_FILE)) throw fail('changed', 'The listed notes index could not be read. The folder changed or its handle is stale; nothing was rebuilt.'); let text = null; if (bytes != null) { try { text = decode(bytes); } catch (_) { throw fail('corrupt', 'The notes index is not UTF-8 text.'); } } return parseIndex(text); };
	const readBodies = async (files, requested) => {
		const present = new Set(files), bodies = new Map();
		for (const file of requested) {
			if (!present.has(file)) throw fail('changed', 'The requested note is no longer in the folder: ' + file + '.');
			const bytes = await readBytes(file);
			if (bytes == null) throw fail('changed', 'The notes folder changed while being read.');
			bodies.set(file, bytes);
		}
		return bodies;
	};
	const writeVerified = async (file, bytes, knownDigest = null) => {
		const digest = file === NOTES_INDEX_FILE ? knownDigest || await sha256(bytes) : null;
		await store.write(file, bytes);
		const actual = await readBytes(file);
		if (digest ? await digestOf(actual) !== digest : !equal(actual, bytes)) throw fail('verify', 'The notes folder did not keep the bytes written to ' + file + '.');
		if (file === NOTES_INDEX_FILE) indexReceipt = actual;
	};
	const readJournal = async () => {
		const bytes = await readBytes(OWNER_JOURNAL_FILE);
		if (bytes == null) return null;
		let journal;
		try { journal = JSON.parse(decode(bytes)); } catch (_) { throw fail('corrupt', 'The pending notes journal is unreadable; its files were kept.'); }
		if (!jsonObject(journal) || journal.version !== 2 || own(journal, 'after')) throw fail('corrupt', 'The pending notes journal has an unreadable version; its files were kept.');
		return journal;
	};
	const journalBytes = journal => { const saved = {...journal}; delete saved.after; return exactBytes(JSON.stringify(saved)); };
	const writeJournal = journal => writeVerified(OWNER_JOURNAL_FILE, journalBytes(journal));
	const clearJournal = async () => {
		await store.remove(OWNER_JOURNAL_FILE);
		if (await readBytes(OWNER_JOURNAL_FILE) != null) throw fail('verify', 'The completed notes journal could not be retired.');
	};
	const notice = (scope, index, changed, kind) => {
		const message = {type: 'rapier-notes-commit', scope, generation: folderGeneration(index), changed: [...new Set(changed)].sort(), kind};
		try { channel?.postMessage(message); return {sent: !!channel}; }
		catch (error) { return {sent: false, error: String(error?.message || error)}; }
	};
	async function acquire(scope) {
		if (closed) throw fail('closed', 'The notes owner is closed.');
		if (typeof scope !== 'string' || !scope) throw fail('scope', 'A notes folder needs a stable lock scope.');
		if (store.writable === false) throw fail('read-only', store.reason || 'These notes are read-only here.');
		if (isShared() && !channel?.postMessage) throw fail('read-only', 'Shared notes need their commit notification channel before this writer can open them.');
		if (isShared() && !locks?.request) throw fail('read-only', 'This browser cannot coordinate writes to shared notes. Open them in a browser with Web Locks; reading and backup remain available.');
		let unlock, settled, granted = false, releaseStarted = false, released = false;
		const held = new Promise(resolve => { unlock = resolve; });
		// The cross-page lock is for a store whose bytes another page can reach. A store that is this
		// page's own memory has exactly one owner and keeps its own queue below, even where the page
		// has a lock manager -- which it now always does, because the same `attach` wires one for the
		// IndexedDB rung. Taking a named Web Lock for a private library would be a claim about pages
		// that cannot see these bytes at all.
		if (isShared() && locks?.request) {
			// This page's own transactions queue here first, in order, without a clock: a pin pressed
			// while the unpin before it is still being written waits for it, however long the folder
			// takes on a slow phone. The bounded wait below is for the cross-page lock alone -- the
			// founder, 25 September, unpinned and repinned two notes on his phone and was told three
			// times that "Another Rapier is writing these notes": it was this page, waiting on itself
			// past 1.5 s, refused by the timer meant for another page.
			const previous = localTail;
			localTail = previous.catch(() => {}).then(() => held);
			await previous.catch(() => {});
			const abort = new AbortController();
			let ready, refuse;
			const admission = new Promise((resolve, reject) => { ready = resolve; refuse = reject; });
			const timer = timers.setTimeout(() => { if (!granted) abort.abort(); }, timeoutMs);
			settled = Promise.resolve().then(() => locks.request('rapier-notes:' + scope, {mode: 'exclusive', signal: abort.signal}, async lock => {
				if (!lock || abort.signal.aborted) throw fail('busy', 'Another Rapier is writing these notes. Try again when it has finished or closed.');
				granted = true; timers.clearTimeout(timer); ready(); await held;
			})).catch(error => {
				if (!granted) refuse(error?.name === 'AbortError' ? fail('busy', 'Another Rapier is writing these notes. Try again when it has finished or closed.') : error);
				else throw error;
			}).finally(() => timers.clearTimeout(timer));
			// A refusal lets the page's own queue move on: the next transaction is not held behind it.
			try { await admission; } catch (error) { unlock(); throw error; }
		} else {
			// The private memory store has exactly one owner; this queue is not a shared-folder lock.
			const previous = localTail;
			localTail = previous.catch(() => {}).then(() => held);
			await previous.catch(() => {}); granted = true; settled = localTail;
		}
		try { if (store.prepare && !await store.prepare()) throw fail('read-only', store.reason || 'These notes are read-only here.'); }
		catch (error) { unlock(); await settled; throw error; }
		const active = () => { if (!granted || released) throw fail('released', 'This notes transaction no longer owns the folder.'); };
		let dirty = null, lastDropped = [], lastKept = [];
		const flushNotice = async index => {
			const pending = index.ownerNotice;
			if (!pending) return {index, notice: null};
			if (pending.generation !== folderGeneration(index) || !Array.isArray(pending.changed)) throw fail('corrupt', 'The notes commit notice is not readable.');
			const sent = notice(scope, index, pending.changed, pending.kind);
			if (sent.sent || !isShared()) {
				const acknowledged = copy(index); delete acknowledged.ownerNotice;
				try { await writeVerified(NOTES_INDEX_FILE, exactBytes(serializeIndex(acknowledged))); index = acknowledged; }
				catch (error) {
					// A host may throw after the acknowledgement landed. Refresh the receipt before
					// another admitted transaction hashes its base; never cache the old outbox bytes.
					index = await readIndex();
					return {index, notice: {...sent, acknowledged: false, error: String(error?.message || error)}};
				}
			}
			return {index, notice: sent};
		};
		// Two orders, one rule: no commit becomes durable without its notice attempted or carried.
		//
		// A publication a READ makes -- a journal found pending on open, a reconcile, an identity stamp,
		// a trash phase -- is durable first and announced second, the outbox field kept until then.
		// Notices are what make windows read, so announcing such a publication before it lands would,
		// on storage that refuses writes, have every window that hears it fail the same way and
		// announce again (the A13 schedules did exactly that: 3,363 identity notices).
		//
		// Publishing the journal this transaction has just written (`ours`) finishes the person's own
		// save or tick, never a consequence of a notice: its notice is attempted FIRST, still under
		// this lease, and only a failed attempt rides into the commit for the next owned open
		// (flushNotice). Nobody reads the commit early for it, because a window reloads by taking this
		// same lock; a stop before the publication leaves the journal for recovery to publish and
		// announce. So the sidecar is written once, not twice (#304: the second write was the whole
		// index minus this one field).
		const publish = async (index, changed, kind, ours = false, journal = null) => {
			const publishBytes = async () => {
				const bytes = exactBytes(serializeIndex(index));
				if (journal) {
					journal.publicationDigest = await sha256(bytes); await writeJournal(journal);
					if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== journal.baseDigest) throw fail('changed', 'The folder metadata changed before publication. Its bytes and the pending save were kept.');
				}
				await writeVerified(NOTES_INDEX_FILE, bytes, journal?.publicationDigest);
				if (journal) await clearJournal();
			};
			const pending = {generation: folderGeneration(index), changed: [...new Set(changed)].sort(), kind};
			if (!ours) {
				index.ownerNotice = pending;
				await publishBytes();
				return flushNotice(index);
			}
			const sent = notice(scope, index, changed, kind);
			if (sent.sent || !isShared()) delete index.ownerNotice; else index.ownerNotice = pending;
			await publishBytes();
			return {index, notice: sent};
		};
		const commitIndex = async (next, {changed = [], kind = 'metadata', reconcileFiles = false} = {}) => {
			active();
			const before = await readIndex();
			if (before.transaction || await readJournal()) throw fail('pending', 'Repair the pending notes transaction before writing metadata.');
			if (folderGeneration(next) !== folderGeneration(before)) throw fail('stale', 'The notes folder changed; reload it before saving.');
			let index = copy(next); delete index.transaction;
			const present = (await store.list()).filter(isNoteFile);
			if (reconcileFiles) {
				const fixed = repairListing(index, present, clock);
				index = fixed.index; changed = [...changed, ...fixed.added, ...fixed.dropped];
			}
			if (!index.notes || Object.keys(index.notes).length !== present.length || present.some(file => !own(index.notes, file))) throw fail('plan', 'A metadata commit must describe every file currently in the folder.');
			index.folderGeneration = folderGeneration(before) + 1;
			if (!Number.isSafeInteger(index.folderGeneration)) throw fail('generation', 'The notes folder generation is exhausted.');
			return publish(index, changed, kind);
		};
		// `ours`: the just-verified journal and its admitted base. Same-call recovery uses
		// those private values; a fresh owner reads both files and verifies the base digest.
		const recover = async (ours = null) => {
			active();
			let index = ours ? ours.index : await readIndex(), journal = ours ? ours.journal : await readJournal();
			if (index.transaction) throw fail('corrupt', 'The notes index contains an unsupported pending journal; its files have been kept.');
			if (journal) {
				if (journal.version !== 2 || !Number.isSafeInteger(journal.baseGeneration) || journal.baseGeneration < 0 || journal.generation !== journal.baseGeneration + 1 || !Number.isSafeInteger(journal.generation) ||
					!(journal.baseDigest === null || /^[0-9a-f]{64}$/.test(journal.baseDigest)) || !Array.isArray(journal.writes) || !Array.isArray(journal.removes) ||
					journal.publicationDigest !== undefined && !/^[0-9a-f]{64}$/.test(journal.publicationDigest)) throw fail('corrupt', 'The pending notes transaction is not readable; its files have been kept.');
				const current = ours ? journal.baseDigest : await digestOf(indexReceipt);
				if (journal.publicationDigest && current === journal.publicationDigest) {
					if (journal.exactIndex ? current !== journal.exactIndex.digest : folderGeneration(index) !== journal.generation) throw fail('corrupt', 'The completed notes journal names a different generation.');
					// The final sidecar landed before journal retirement. Do not replay any body:
					// a later filesystem edit belongs to the person, even at the same generation.
					await clearJournal(); journal = null;
				} else if (journal.baseGeneration !== folderGeneration(index) || current !== journal.baseDigest) throw fail('changed', 'The folder metadata changed during its pending transaction. Both copies were kept.');
			}
			if (index.ownerNotice && !journal) { const flushed = await flushNotice(index); index = flushed.index; dirty = flushed.notice; }
			if (journal) {
				const dropped = [];
				journal.after = applyIndexDelta(index, journal);
				const exact = journal.kind === 'restore' && journal.exactIndex;
				let exactBytesAfter = null, exactIndexAfter = null;
				if (exact) {
					exactBytesAfter = unpack(exact.data);
					if (await sha256(exactBytesAfter) !== exact.digest || journal.removes.length) throw fail('corrupt', 'The pending exact restore failed verification; its files were kept.');
					exactIndexAfter = parseIndex(decode(exactBytesAfter));
					folderGeneration(exactIndexAfter);
					if (exactIndexAfter.transaction || exactIndexAfter.ownerNotice || Object.keys(exactIndexAfter.deletions || {}).length) throw fail('corrupt', 'The exact snapshot has an unfinished operation.');
					const check = copy(exactIndexAfter); check.folderGeneration = journal.generation;
					if (canonicalJSON(check) !== canonicalJSON(journal.after)) throw fail('corrupt', 'The pending restore sidecar does not match its exact bytes.');
					const base = parseIndex(exact.base == null ? null : decode(unpack(exact.base)));
					if (base.transaction || folderGeneration(base) !== journal.baseGeneration || await digestOf(await readBytes(NOTES_INDEX_FILE)) !== journal.baseDigest)
						throw fail('changed', 'The folder metadata changed during exact restore. It was kept; keep the source backup.');
				}
				const seen = new Set(), stages = new Set(), writes = [];
				const stagedBytes = async row => {
					const staged = await readBytes(row.stage), bytes = staged ?? await readBytes(row.file);
					if (bytes == null || bytes.length !== row.size || await sha256(bytes) !== row.digest) throw fail('corrupt', 'The staged restore file failed verification: ' + row.file + '. Keep the source backup.');
					return bytes;
				};
				if (exact && !['preparing', 'ready'].includes(exact.phase)) throw fail('corrupt', 'The pending restore phase is not readable.');
				for (const row of journal.writes) {
					fileName(row.file, !!exact); if (seen.has(row.file)) throw fail('corrupt', 'A pending transaction names one file twice.'); seen.add(row.file);
					if (exact) {
						if (!/^\.rapier-restore-[0-9a-f]{32}-[0-9]+$/.test(row.stage) || stages.has(row.stage) || !Number.isSafeInteger(row.size) || row.size < 0 || !/^[0-9a-f]{64}$/.test(row.digest) || row.data !== undefined) throw fail('corrupt', 'The pending restore file record is not readable.');
						stages.add(row.stage);
						if (exact.phase === 'ready') await stagedBytes(row);
						writes.push(row);
					} else if (row.caseSource !== undefined) {
						fileName(row.caseSource);
						if (journal.kind !== 'rename' || !isNoteFile(row.file) || row.caseSource === row.file || row.caseSource.normalize('NFC').toLowerCase() !== row.file.normalize('NFC').toLowerCase() ||
							!/^[a-f0-9]{64}$/.test(row.digest) || row.stage !== '.rapier-rename-stage-' + row.digest + '.tmp' || row.before !== null || row.data !== undefined || !Number.isSafeInteger(row.size) || row.size < 0 || !/^[a-f0-9]{64}$/.test(row.sourceDigest))
							throw fail('corrupt', 'The staged case-only rename is unreadable; its bytes were kept.');
						writes.push({...row, bytes: await stagedBytes(row)});
					} else if (syncStateFile(row.file)) {
						if (!/^\.rapier-sync-stage-[a-f0-9]{64}\.tmp$/.test(row.stage) || row.data !== undefined || !Number.isSafeInteger(row.size) || row.size < 0)
							throw fail('corrupt', 'The staged sync checkpoint is unreadable; no local work was replaced.');
						if (row.before != null && (!/^\.rapier-sync-stage-[a-f0-9]{64}\.tmp$/.test(row.priorStage) || row.priorStage !== '.rapier-sync-stage-' + row.before + '.tmp')) throw fail('corrupt', 'The previous sync checkpoint is unreadable.');
						writes.push({...row, bytes: await stagedBytes(row)});
					} else {
						const bytes = unpack(row.data);
						if (await sha256(bytes) !== row.digest) throw fail('corrupt', 'Pending note bytes failed verification.');
						writes.push({...row, bytes});
					}
					if (isNoteFile(row.file) && !own(journal.after.notes, row.file)) throw fail('corrupt', 'Pending note bytes failed verification.');
				}
				if (exact && (writes.some(row => row.before != null || row.requires !== undefined || seen.has(row.stage)) || (await snapshotFiles()).some(file => file !== NOTES_INDEX_FILE && file !== OWNER_JOURNAL_FILE && !seen.has(file) && !stages.has(file))))
					throw fail('changed', 'The folder changed during exact restore. Every existing file was kept; keep the source backup.');
				if (exact?.phase === 'preparing') {
					// Preparation has published no destination file. A stopped copy rolls back only
					// its explicitly journaled, verified stage files; the picked backups remain the
					// source. A ready copy instead replays below, without needing those picks again.
					for (const row of writes) {
						if (await readBytes(row.file) != null) throw fail('changed', 'The folder changed while preparing restore. Its files were kept; keep the source backup.');
						const bytes = await readBytes(row.stage);
						if (bytes != null && (bytes.length !== row.size || await sha256(bytes) !== row.digest)) throw fail('changed', 'A staged restore file changed. It was kept; keep the source backup.');
					}
					for (const row of writes) {
						const bytes = await readBytes(row.stage);
						if (bytes != null) {
							if (bytes.length !== row.size || await sha256(bytes) !== row.digest) throw fail('changed', 'A staged restore file changed. It was kept.');
							await store.remove(row.stage);
							if (await readBytes(row.stage) != null) throw fail('verify', 'The restore preparation could not be removed.');
						}
					}
					if ((await snapshotFiles()).some(file => file !== NOTES_INDEX_FILE && file !== OWNER_JOURNAL_FILE)) throw fail('changed', 'The folder changed while removing restore preparation. Its files were kept.');
					const base = parseIndex(exact.base == null ? null : decode(unpack(exact.base)));
					if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== journal.baseDigest) throw fail('changed', 'The folder sidecar changed during restore preparation. It was kept.');
					if (exact.base == null) { await store.remove(NOTES_INDEX_FILE); if (await readBytes(NOTES_INDEX_FILE) != null) throw fail('verify', 'The original empty sidecar could not be restored.'); }
					else await writeVerified(NOTES_INDEX_FILE, unpack(exact.base));
					await clearJournal();
					return base;
				}
				for (const row of journal.removes) { fileName(row.file); if (seen.has(row.file) || isNoteFile(row.file) && own(journal.after.notes, row.file) || !/^[0-9a-f]{64}$/.test(row.digest)) throw fail('corrupt', 'The pending removal is not readable.'); seen.add(row.file); }
				const byFile = new Map(writes.map(row => [row.file, row]));
				const caseMoves = writes.filter(row => row.caseSource !== undefined);
				for (const row of caseMoves) if (!journal.removes.some(remove => remove.file === row.caseSource && remove.digest === row.sourceDigest && remove.requires === row.file) ||
					index.notes[row.caseSource]?.id !== journal.after.notes[row.file]?.id || typeof index.notes[row.caseSource]?.id !== 'string')
					throw fail('corrupt', 'The staged rename does not prove the original note identity.');
				for (const row of [...writes, ...journal.removes]) if (row.requires !== undefined &&
					(!byFile.has(row.requires) || byFile.get(row.requires).requires !== undefined || row.requires === row.file)) throw fail('corrupt', 'A pending file operation has no independent prerequisite write.');
				// drop replaces entries; retain only written entries for a possible kept copy. The
				// verified journal is private here, so unrelated notes need no defensive deep copy.
				const planned = new Map(writes.map(row => [row.file, journal.after.notes[row.file]])), kept = [];
				const plannedFiles = new Set(Object.keys(index.notes));
				for (const row of writes) if (isNoteFile(row.file)) plannedFiles.add(row.file);
				for (const row of journal.removes) if (isNoteFile(row.file)) plannedFiles.delete(row.file);
				if (!journal.after.notes || Object.keys(journal.after.notes).length !== plannedFiles.size || [...plannedFiles].some(file => !own(journal.after.notes, file))) throw fail('corrupt', 'The pending sidecar does not account for its file operations.');
				// Recheck every affected body before the first write, and again right before its own: a
				// foreign edit is never mistaken for the old content because its filename stayed the same.
				// A file that changed under the pending work is the person's (R85b): its bytes stay, that
				// write or removal is dropped, its entry says what is there, and the read reports it.
				const drop = (file, digest) => {
					if (file.startsWith('history/')) throw fail('changed', 'The note history changed before replacement. Its words and pending history were kept.');
					if (exact) throw fail('changed', 'The file ' + file + ' changed during exact restore. Its newer bytes and the pending restore were kept; keep the source backup.');
					if (!dropped.includes(file)) dropped.push(file);
					if (!isNoteFile(file)) return;
					// A skipped write did not earn its planned metadata or identity. In particular,
					// a stranger occupying a rename destination is not the original note.
					if (digest == null) delete journal.after.notes[file];
					else journal.after.notes[file] = {...index.notes?.[file], revision: 'sha256:' + digest};
				};
				const ready = async row => {
					if (row.requires === undefined) return true;
					const prerequisite = byFile.get(row.requires), actual = await digestOf(await readBytes(row.requires));
					if (actual === prerequisite.digest && !dropped.includes(row.requires)) return true;
					drop(row.requires, actual);
					drop(row.file, await digestOf(await readBytes(row.file)));
					return false;
				};
				for (const row of writes) {
					if (row.caseSource !== undefined) continue;
					const digest = await digestOf(await readBytes(row.file));
					if (digest !== row.before && digest !== row.digest) drop(row.file, digest);
				}
				for (const row of journal.removes) { if (caseMoves.some(move => move.caseSource === row.file)) continue; const digest = await removalDigest(row.file); if (digest != null && digest !== row.digest) drop(row.file, digest); }
				for (const row of caseMoves) {
					// A case-insensitive store cannot hold both spellings. The verified stage is
					// custody before removing the old path; the same journal finishes the hop.
					const aliases = (await store.list()).filter(name => name.normalize('NFC').toLowerCase() === row.file.normalize('NFC').toLowerCase());
					if (aliases.length > 1 || aliases.length === 1 && ![row.caseSource, row.file].includes(aliases[0])) throw fail('changed', 'The rename destination changed. Its bytes and the staged note were kept.');
					if (aliases[0] === row.file) {
						if (await digestOf(await readBytes(row.file)) !== row.digest) throw fail('changed', 'The rename destination changed. Its bytes and the staged note were kept.');
						continue;
					}
					// Never remove a source unless the independent stage still proves all bytes.
					const stage = await readBytes(row.stage);
					if (await digestOf(stage) !== row.digest) throw fail('corrupt', 'The staged note could not be verified. The original note was kept.');
					if (aliases[0] === row.caseSource) {
						if (await digestOf(await readBytes(row.caseSource)) !== row.sourceDigest) throw fail('changed', 'The rename source changed. Its bytes and the staged note were kept.');
						await store.remove(row.caseSource);
						if ((await store.list()).some(name => name.normalize('NFC').toLowerCase() === row.file.normalize('NFC').toLowerCase())) throw fail('changed', 'The rename source could not be removed. The staged note was kept.');
					}
					if (await readBytes(row.file) !== null) throw fail('changed', 'The rename destination arrived during its move. Both copies were kept.');
					await writeVerified(row.file, stage, row.digest);
				}
				for (const row of writes) {
					// Exact restore has no removals: its prepared checkpoint is the final staged
					// member, before notes.json. Ordinary checkpoints follow removals below.
					if (!exact && syncStateFile(row.file) || row.caseSource !== undefined) continue;
					if (dropped.includes(row.file) || !await ready(row)) continue;
					const digest = await digestOf(await readBytes(row.file));
					if (digest !== row.digest) {
						if (digest !== row.before) { drop(row.file, digest); continue; }
						await writeVerified(row.file, exact ? await stagedBytes(row) : row.bytes);
					}
					if (exact) {
						// Retire each stage after its destination is verified, while the journal
						// still owns recovery. A retry can use that destination when the stage is
						// gone; keeping every stage until the end doubles the library's disk cost.
						const bytes = await readBytes(row.stage);
						if (bytes != null) {
							if (bytes.length !== row.size || await sha256(bytes) !== row.digest) throw fail('changed', 'A staged restore file changed. It was kept; keep the source backup.');
							await store.remove(row.stage);
							if (await readBytes(row.stage) != null) throw fail('verify', 'The restore stage could not be removed.');
						}
					}
				}
				if (exact) {
					// One journal, one terminal publication. No import receipt, identity allocation,
					// arrival-history event or notification bookkeeping may rewrite the snapshot.
					for (const row of writes) if (await digestOf(await readBytes(row.file)) !== row.digest) throw fail('changed', 'A restored file changed before publication. Keep the source backup.');
					const inventory = (await snapshotFiles()).filter(file => file !== NOTES_INDEX_FILE && file !== OWNER_JOURNAL_FILE);
					if (inventory.length !== seen.size || inventory.some(file => !seen.has(file))) throw fail('changed', 'The restored file inventory differs from the backup. Every file was kept; keep the source backup.');
					const base = parseIndex(exact.base == null ? null : decode(unpack(exact.base)));
					if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== journal.baseDigest) throw fail('changed', 'The folder sidecar changed during restore. It was kept; keep the source backup.');
					journal.publicationDigest = await sha256(exactBytesAfter); await writeJournal(journal);
					await writeVerified(NOTES_INDEX_FILE, exactBytesAfter, journal.publicationDigest);
					await clearJournal();
					dirty = notice(scope, exactIndexAfter, writes.map(row => row.file), 'restore');
					return exactIndexAfter;
				}
				for (const row of journal.removes) {
					if (caseMoves.some(move => move.caseSource === row.file)) continue;
					if (dropped.includes(row.file) || !await ready(row)) continue;
					const digest = await removalDigest(row.file);
					if (digest != null && digest !== row.digest) { drop(row.file, digest); continue; }
					if (digest != null) await store.remove(row.file);
					if (await removalDigest(row.file) != null) throw fail('verify', 'The notes folder did not remove ' + row.file + '.');
				}
				for (const row of writes.filter(row => syncStateFile(row.file))) {
					const actual = await digestOf(await readBytes(row.file));
					if (dropped.length) {
						// A replay can find the checkpoint already landed, then a later foreign note
						// edit. Restore its previous checkpoint before clearing the failed journal.
						if (actual === row.digest) {
							if (row.before == null) await store.remove(row.file);
							else { const prior = await readBytes(row.priorStage); if (await digestOf(prior) !== row.before) throw fail('corrupt', 'The prior sync checkpoint was kept but cannot be verified.'); await writeVerified(row.file, prior); }
						}
						drop(row.file, actual); continue;
					}
					if (actual !== row.digest) {
						if (actual !== row.before) { drop(row.file, actual); continue; }
						await writeVerified(row.file, row.bytes);
					}
				}
				// A rename whose source changed is now two notes, not two names for one identity.
				// The surviving source keeps its history/widget identity; the landed copy is admitted
				// independently by the folder's identity pass. Replay makes the same decision after
				// a stop anywhere between the destination write and this sidecar publication.
				if (journal.kind === 'rename') for (const row of journal.removes) {
					const source = journal.after.notes[row.file], target = journal.after.notes[row.requires];
					if (dropped.includes(row.file) && source?.id && target?.id === source.id) delete target.id;
				}
				// A dropped note write is not dropped on the floor (R85b; B01's open finding): its journaled
				// bytes are the last copy of words the person wrote, so they land beside the file as a kept
				// note, the way a live save that finds its note changed keeps both. Only a transaction that
				// carries the person's words (a save, a kept copy, a capture): a rename's rewritten links or
				// an import's bytes exist elsewhere by design, and the file that changed under them is the
				// person's already. Not when the file holds the bytes after all.
				const words = journal.kind === 'save' || journal.kind === 'keep-both' || journal.kind === 'create';
				for (const row of writes) {
					if (!words || !dropped.includes(row.file) || !isNoteFile(row.file)) continue;
					if (await digestOf(await readBytes(row.file)) === row.digest) continue;
					const names = [...new Set([...(await store.list()).filter(isNoteFile), ...Object.keys(journal.after.notes)])];
					const name = noteFileName(row.file.replace(/\.md$/i, '') + ' kept', names, {ascii: store.ascii});
					await writeVerified(name, row.bytes);
					const entry = {...(planned.get(row.file) || {}), revision: 'sha256:' + row.digest, modified: clock(), keptFrom: {file: row.file, ...(row.before == null ? {} : {digest: row.before})}};
					delete entry.id;
					journal.after.notes[name] = entry;
					kept.push({file: row.file, name});
				}
				// Asset creation publishes no links. A late competing writer keeps its file;
				// the journal's bytes earn a distinct sibling before that journal may be cleared.
				// This includes a whole-Blob recording: Keep can then release its last source.
				// A crash during rescue leaves the original journal replayable; a spare copy is
				// preferable to losing either person's bytes.
				const assetFolder = journal.kind === 'attachment' ? 'attachments' : journal.kind === 'recording' ? 'audio' : null;
				if (assetFolder) for (const row of writes) {
					const prefix = assetFolder + '/';
					if (!dropped.includes(row.file) || !row.file.startsWith(prefix)) continue;
					if (await digestOf(await readBytes(row.file)) === row.digest) continue;
					const name = prefix + attachmentFileName(row.file.slice(prefix.length), await store.list(assetFolder), {ascii: store.ascii});
					if (await readBytes(name) != null) throw fail('changed', 'A saved file changed during collision recovery. Both originals remain in the folder or its pending journal.');
					await writeVerified(name, row.bytes);
					kept.push({file: row.file, name});
				}
				const fixed = repairListing(journal.after, (await store.list()).filter(isNoteFile), clock);
				index = fixed.index;
				const published = await publish(index, [...[...journal.writes, ...journal.removes].map(row => row.file), ...kept.map(row => row.name), ...fixed.added, ...fixed.dropped], journal.kind || 'recovery', !!ours, journal);
				index = published.index; dirty = published.notice; lastDropped = dropped; lastKept = kept;
				for (const row of caseMoves) try { const bytes = await readBytes(row.stage); if (bytes && await digestOf(bytes) === row.digest) await store.remove(row.stage); } catch (_) {}
				for (const row of writes.filter(row => syncStateFile(row.file))) for (const stage of new Set([row.stage, row.priorStage].filter(Boolean))) {
					// Staging is inert and excluded from backups. Cleanup cannot undo a saved commit.
					try { const bytes = await readBytes(stage); if (bytes && await digestOf(bytes) === stage.slice('.rapier-sync-stage-'.length, -4)) await store.remove(stage); } catch (_) {}
				}
			}
			if (repair) {
				const result = await repair({store, index, commitIndex});
				if (result?.index) index = result.index;
			}
			return index;
		};
		const read = async options => {
			const requested = requestedBodies(options);
			let index = await recover();
			const files = (await store.list()).filter(isNoteFile).sort();
			const fixed = repairListing(index, files, clock);
			if (fixed.added.length || fixed.dropped.length) {
				const committed = await commitIndex(fixed.index, {changed: [...fixed.added, ...fixed.dropped], kind: 'reconcile'});
				index = committed.index; dirty = committed.notice;
			}
			const bodies = await readBodies(files, requested);
			const reported = lastDropped, keptReported = lastKept; lastDropped = []; lastKept = [];
			return {index, files, bodies, generation: folderGeneration(index), readOnly: false, notice: dirty, dropped: reported, kept: keptReported};
		};
		const rebuildIndex = async backup => {
			active();
			let damaged = null;
			// Re-ask under this lease: another window may already have repaired the index.
			// Only an unreadable sidecar is rebuilt. A readable sidecar with a broken pending
			// operation retains that journal, including words not yet in any note file.
			try { await readIndex(); }
			catch (error) {
				if (error.code !== 'corrupt') throw error;
				if (typeof backup !== 'string' || !/^notes\.damaged-[^/\\\0]+\.json$/.test(backup)) throw fail('name', 'An unreadable index needs its own backup filename.');
				if (await readBytes(backup) != null) throw fail('collision', 'The unreadable index backup name is occupied. Nothing was removed.');
				const bytes = await readBytes(NOTES_INDEX_FILE);
				if (bytes == null) throw fail('changed', 'The unreadable index disappeared before it could be kept.');
				await writeVerified(backup, bytes);
				await store.remove(NOTES_INDEX_FILE);
				if (await readBytes(NOTES_INDEX_FILE) != null) throw fail('verify', 'The unreadable index could not be removed after its backup.');
				damaged = backup;
			}
			return {...await read(), damaged};
		};
		const transact = async (planner, options) => {
			// Check the raw destination before the ordinary reader can add identities or
			// reconcile metadata. Exact restore may replace only an unused sidecar.
			const restoring = options?.exactRestore === true;
			if (restoring) await emptyDestination();
			const before = await read(options), baseBytes = indexReceipt, baseDigest = await digestOf(baseBytes), observed = new Map(before.bodies);
			// `readBodies` is for a planner that can only name its note after finding it in this fresh
			// index (the widget's tick: by stable id, and only once it is known not to be protected).
			// Same lease, same listing, same exact copies as `{bodies}`; nothing is read unasked.
			const plan = typeof planner === 'function' ? await planner({index: copy(before.index), files: before.files.slice(), bodies: new Map([...before.bodies].map(([file, bytes]) => [file, bytes.slice()])),
				readBodies: async names => {
					const bodies = await readBodies(before.files, requestedBodies({bodies: names}));
					for (const [file, bytes] of bodies) observed.set(file, bytes.slice());
					return bodies;
				}}) : planner;
			if (!plan?.index || plan.index.transaction) throw fail('plan', 'A notes transaction needs its complete resulting sidecar.');
			if (!restoring && folderGeneration(plan.index) !== before.generation) throw fail('stale', 'The notes folder changed; reload it before saving.');
			if (restoring && (plan.kind !== 'restore' || !plan.exactIndex || plan.removes?.length)) throw fail('plan', 'Exact restore needs the complete original sidecar and only new files.');
			const after = copy(plan.index), writes = [], removes = [], seen = new Set(), sources = new Map(), present = new Set(before.files);
			for (const row of plan.writes || []) {
				fileName(row.file, restoring); if (seen.has(row.file)) throw fail('plan', 'A transaction names one file twice.'); seen.add(row.file);
				if (restoring && store.ascii && /[^\x00-\x7f]/.test(row.file)) throw fail('name', 'This folder cannot keep the exact backup filename: ' + row.file + '. Nothing was restored.');
				const createOnly = restoring || row.createOnly || plan.kind === 'import' && row.replace !== true;
				const caseSource = row.caseSource, caseMove = caseSource !== undefined;
				if (caseMove && (plan.kind !== 'rename' || !isNoteFile(row.file) || !isNoteFile(caseSource) || caseSource === row.file ||
					caseSource.normalize('NFC').toLowerCase() !== row.file.normalize('NFC').toLowerCase() || !present.has(caseSource) || present.has(row.file)))
					throw fail('plan', 'A case-only rename needs the exact original spelling and a free destination.');
				if (createOnly && present.has(row.file)) throw fail('collision', 'The import name ' + row.file + ' is occupied. Allocate a new name while holding the folder owner.');
				const bytes = restoring ? null : exactBytes(row.bytes ?? row.text), previous = await readBytes(row.file);
				// The listing rules out existing notes without reading them. A fresh read also
				// catches an unlisted arrival or media collision, and supplies the journal proof.
				if (createOnly && previous != null && !caseMove) throw fail('collision', 'The import name ' + row.file + ' is occupied. Allocate a new name while holding the folder owner.');
				const previousDigest = await digestOf(previous);
				if (row.expectedDigest !== undefined && row.expectedDigest !== previousDigest) throw fail('changed', 'The note changed since this edit was prepared.');
				if (restoring) {
					if (!Number.isSafeInteger(row.size) || row.size < 0 || !/^[0-9a-f]{64}$/.test(row.digest) || typeof row.read !== 'function' || row.requires !== undefined) throw fail('plan', 'Exact restore needs a verified source for each whole file.');
					writes.push({file: row.file, size: row.size, digest: row.digest, before: null});
					sources.set(row.file, row.read);
				} else if (caseMove) {
					const sourceDigest = await digestOf(await readBytes(caseSource)), removal = (plan.removes || []).find(remove => remove.file === caseSource);
					if (sourceDigest === null || previousDigest !== null && previousDigest !== sourceDigest || removal?.expectedDigest !== sourceDigest || removal.requires !== row.file || before.index.notes[caseSource]?.id !== after.notes[row.file]?.id)
						throw fail('changed', 'The case-only rename no longer proves its source. Both copies were kept.');
					const digest = await sha256(bytes), stage = '.rapier-rename-stage-' + digest + '.tmp';
					await writeVerified(stage, bytes, digest);
					writes.push({file: row.file, caseSource, sourceDigest, stage, size: bytes.length, digest, before: null});
				} else if (syncStateFile(row.file)) {
					const digest = await sha256(bytes), stage = '.rapier-sync-stage-' + digest + '.tmp';
					// The checkpoint stays out of notes.json even while a transaction is pending.
					// A cut before the journal leaves only an unreferenced temporary copy.
					await writeVerified(stage, bytes);
					const priorStage = previous == null ? null : '.rapier-sync-stage-' + previousDigest + '.tmp';
					if (priorStage) await writeVerified(priorStage, previous);
					writes.push({file: row.file, stage, size: bytes.length, digest, before: previousDigest, priorStage});
				} else writes.push({file: row.file, data: pack(bytes), digest: await sha256(bytes), before: previousDigest, ...(row.requires === undefined ? {} : {requires: row.requires})});
				if (isNoteFile(row.file)) present.add(row.file);
			}
			for (const row of plan.removes || []) {
				const bare = typeof row === 'string', file = bare ? row : row?.file, expectedDigest = bare ? undefined : row?.expectedDigest;
				fileName(file); const digest = await removalDigest(file); if (seen.has(file) || digest == null) throw fail('plan', 'A transaction cannot remove an absent or duplicate file.'); seen.add(file);
				if (!bare && expectedDigest !== digest) throw fail('changed', 'The note changed since this removal was prepared.');
				removes.push({file, digest: bare ? digest : expectedDigest, ...(row.requires === undefined ? {} : {requires: row.requires})}); if (isNoteFile(file)) present.delete(file);
			}
			const byFile = new Map(writes.map(row => [row.file, row]));
			for (const row of [...writes, ...removes]) if (row.requires !== undefined &&
				(!byFile.has(row.requires) || byFile.get(row.requires).requires !== undefined || row.requires === row.file ||
				 writes.includes(row) && writes.indexOf(byFile.get(row.requires)) >= writes.indexOf(row))) throw fail('plan', 'A file operation must follow its independent prerequisite write.');
			if (Object.keys(after.notes).length !== present.size || [...present].some(file => !own(after.notes, file))) throw fail('plan', 'The resulting sidecar must describe every resulting note exactly once.');
			if (!restoring && !writes.length && !removes.length && jsonSame(before.index, after)) {
				// Redelivery earned no new transaction. Still check the admitted sidecar:
				// a foreign writer may have changed it while an async planner was reading.
				if (await readJournal()) throw fail('pending', 'A pending notes journal must finish before another starts.');
				// No write means no journal body proof. Recheck the planner's private receipts
				// so an intervening file edit cannot be acknowledged as an unchanged save.
				for (const [file, bytes] of observed) if (!equal(bytes, await readBytes(file))) throw fail('changed', 'The note changed before the transaction was admitted.');
				if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== baseDigest) throw fail('changed', 'The folder sidecar changed before the transaction was admitted.');
				return {...before, bodies: new Map()};
			}
			delete after.ownerNotice;
			after.folderGeneration = before.generation + 1;
			if (!Number.isSafeInteger(after.folderGeneration)) throw fail('generation', 'The notes folder generation is exhausted.');
			const journal = {version: 2, kind: plan.kind || 'write', baseGeneration: before.generation, generation: after.folderGeneration, baseDigest, delta: indexDelta(before.index, after), writes, removes};
			if (restoring) {
				const aliases = new Set();
				for (const file of [...seen, NOTES_INDEX_FILE]) {
					const folded = file.normalize('NFC').toLowerCase();
					if (aliases.has(folded)) throw fail('name', 'Backup filenames differ only by case or Unicode spelling. This folder cannot safely restore both: ' + file + '.');
					aliases.add(folded);
				}
				for (const file of [...seen, NOTES_INDEX_FILE]) {
					const parts = file.normalize('NFC').toLowerCase().split('/'), name = parts.pop();
					for (let i = 1; i <= parts.length; i++) if (aliases.has(parts.slice(0, i).join('/'))) throw fail('name', 'A backup filename is also needed as a folder: ' + file + '. Nothing was restored.');
					parts.push('.' + name + '.tmp');
					if (aliases.has(parts.join('/'))) throw fail('name', 'A backup filename conflicts with atomic file staging: ' + parts.join('/') + '. Nothing was restored.');
				}
				const bytes = exactBytes(plan.exactIndex), raw = parseIndex(decode(bytes));
				folderGeneration(raw);
				if (raw.transaction || raw.ownerNotice || Object.keys(raw.deletions || {}).length) throw fail('plan', 'The backup has an unfinished operation. Nothing was restored.');
				raw.folderGeneration = after.folderGeneration;
				if (serializeIndex(raw) !== serializeIndex(after)) throw fail('plan', 'Exact restore must use the original complete sidecar.');
				journal.exactIndex = {data: pack(bytes), digest: await sha256(bytes), base: baseBytes == null ? null : pack(baseBytes), phase: 'preparing'};
				// No body is encoded into this string. The small journal names separate byte files,
				// so a complete multi-part backup can exceed the engine's maximum string length.
				let prefix;
				do { prefix = '.rapier-restore-' + globalThis.crypto.randomUUID().replace(/-/g, '') + '-'; }
				while ([...aliases].some(name => name.startsWith(prefix) || name.startsWith('.' + prefix)));
				writes.forEach((row, number) => { row.stage = prefix + number; });
				await emptyDestination();
			}
			// The journal's read-back licenses body changes. The admitted after object is private
			// already: same-call replay uses it without serializing or parsing the full index again.
			// A fresh owner instead reconstructs it from the exact digest-proven base and delta.
			if (await readJournal()) throw fail('pending', 'A pending notes journal must finish before another starts.');
			if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== baseDigest) throw fail('changed', 'The folder sidecar changed before the transaction was admitted.');
			await writeJournal(journal);
			if (restoring) {
				for (const row of writes) {
					const bytes = exactBytes(await sources.get(row.file)());
					if (bytes.length !== row.size || await sha256(bytes) !== row.digest) throw fail('changed', 'The source backup changed during restore: ' + row.file + '. Nothing was published; keep the source backup.');
					if (await readBytes(row.stage) != null || await readBytes(row.file) != null || await digestOf(await readBytes(NOTES_INDEX_FILE)) !== baseDigest) throw fail('changed', 'The folder changed during restore preparation. Its files were kept.');
					await writeVerified(row.stage, bytes);
				}
				if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== baseDigest) throw fail('changed', 'The folder sidecar changed during restore preparation. It was kept.');
				journal.exactIndex.phase = 'ready';
				await writeJournal(journal);
			}
			const recovered = await recover({index: before.index, journal});
			// The committed bytes were read back and hashed. Return that admitted index and
			// listing without reparsing the whole sidecar; every fresh owned read still does.
			const dropped = lastDropped, kept = lastKept; lastDropped = []; lastKept = [];
			return {index: recovered, files: Object.keys(recovered.notes).sort(), bodies: new Map(), generation: folderGeneration(recovered), readOnly: false, notice: dirty, dropped, kept};
		};
		let jobs = Promise.resolve(), releasePromise;
		const serial = fn => (...args) => {
			if (releaseStarted) return Promise.reject(fail('released', 'This notes transaction no longer accepts work.'));
			const result = jobs.catch(() => {}).then(() => fn(...args));
			jobs = result; return result;
		};
		return {read: serial(read), rebuildIndex: serial(rebuildIndex), recover: serial(() => recover()), commitIndex: serial(commitIndex), transact: serial(transact), release: () => {
			if (releasePromise) return releasePromise;
			releaseStarted = true;
			releasePromise = (async () => { await jobs.catch(() => {}); released = true; unlock(); await settled; })();
			return releasePromise;
		}};
	}
	async function read(scope, options) {
		const requested = requestedBodies(options);
		if (store.writable === false || isShared() && (!locks?.request || !channel?.postMessage)) {
			// Two equal sidecars bracket the listing and requested body reads. A participating writer publishes its
			// pending journal before touching a body, so this is an honest read-only snapshot.
			const pending = await readBytes(OWNER_JOURNAL_FILE), first = await readBytes(NOTES_INDEX_FILE), index = parseIndex(first == null ? null : decode(first));
			if (pending != null || index.transaction || index.deletions && Object.keys(index.deletions).length) throw fail('read-only', 'This notes folder needs a browser with Web Locks to finish a pending operation.');
			const files = (await store.list()).filter(isNoteFile).sort(), bodies = await readBodies(files, requested);
			if (!equal(first, await readBytes(NOTES_INDEX_FILE)) || !equal(pending, await readBytes(OWNER_JOURNAL_FILE))) throw fail('busy', 'The notes folder is changing. Try opening it again.');
			return {index: reconcile(index, files).index, files, bodies, generation: folderGeneration(index), readOnly: true, notice: null};
		}
		let lease;
		try { lease = await acquire(scope); } catch (error) { if (error?.code === 'read-only' && store.writable === false) return read(scope, {bodies: requested}); throw error; }
		try { return await lease.read({bodies: requested}); } finally { await lease.release(); }
	}
	return {acquire, read, transact: async (scope, plan, options) => { const lease = await acquire(scope); try { return await lease.transact(plan, options); } finally { await lease.release(); } }, close: () => { closed = true; channel?.removeEventListener?.('message', receive); }};
}

