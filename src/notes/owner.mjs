import {isImportReceiptFile, readImportReceiptFile, assertImportReferences} from './import-storage.mjs';
import {NOTES_INDEX_FILE, emptyIndex, isNoteFile, isCodeFile, codeFileName, validNoteId, noteFileName, attachmentFileName, parseIndex, reconcile, serializeIndex, stampNoteControls, NOTE_CONTROL_GROUPS, admitIdentities} from './model.mjs';
import {exactBytes, sha256, sha256State, sha256Yielding, storedFileDigest} from './integrity.mjs';
import {manifestName, createHistoryPreparation, resolveHistoryPreparation} from './history.mjs';
import {notesHostWords} from './host-words.mjs';

const decode = value => new TextDecoder('utf-8', {fatal: true, ignoreBOM: false}).decode(exactBytes(value));
const copy = value => JSON.parse(JSON.stringify(value));
export const OWNER_JOURNAL_FILE = '.rapier-owner.json';
const syncStateFile = file => file === '.rapier-sync.json';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const fail = (code, message) => Object.assign(new Error(message), {code});
const equal = (a, b) => {
	if (a == null || b == null) return a == null && b == null;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
};
const digestOf = async bytes => bytes == null ? null : sha256Yielding(bytes);
const SAVE_STAGE_BYTES = 256 * 1024;
const saveStageName = digest => '.rapier-save-stage-' + digest + '.tmp';
const ownedDigest = bytes => {
	if (bytes == null) return null;
	if (bytes.length >= SAVE_STAGE_BYTES) return sha256Yielding(bytes);
	const hash = sha256State(); hash.update(bytes); return hash.finish();
};
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
		&& (path.length === 1 || path.length === 2 && ['audio', 'attachments', 'thumbs', 'imports'].includes(path[0]) || path.length === 3 && path[0] === 'history' && ['manifests', 'texts', 'blobs'].includes(path[1]));
	const history = typeof file === 'string' && /^history\/(?:manifests\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}![1-9][0-9]*\.json|(?:texts|blobs)\/[a-f0-9]{64})$/.test(file);
	if (snapshot ? !supported : !syncStateFile(file) && !isImportReceiptFile(file) && !history && !isNoteFile(file) && !(typeof file === 'string' && /^(?:audio|attachments|thumbs)\/[^/\\\0]+$/.test(file) && !['.', '..'].includes(file.split('/')[1]))) throw fail('name', 'A transaction cannot write this folder path: ' + file + '.');
	return file;
}
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

export function createOwner({store, locks, channel, shared = true, timeoutMs = 1500, clock = Date.now, onInvalidate = () => {}, recover: repair, timers = {setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id)}} = {}) {
	if (!store || !['read', 'write', 'remove', 'list'].every(name => typeof store[name] === 'function')) throw fail('store', 'The notes owner needs a complete file store.');
	if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw fail('timeout', 'The owner wait must be bounded.');
	const isShared = () => typeof shared === 'function' ? !!shared() : !!shared;
	let localTail = Promise.resolve(), closed = false, incarnation = crypto.randomUUID();
	const receive = event => {
		const value = event?.data;
		if (value?.type !== 'rapier-notes-commit' || typeof value.scope !== 'string' || !Number.isSafeInteger(value.generation) || value.generation < 0) return;
		if (value.kind === 'restore') incarnation = crypto.randomUUID();
		onInvalidate({scope: value.scope, generation: value.generation, changed: Array.isArray(value.changed) ? value.changed.filter(isNoteFile) : []});
	};
	channel?.addEventListener?.('message', receive);
	const readBytes = async file => { const value = await store.read(file); return value == null ? null : exactBytes(value); };
	const receiptFrom = async (index, id) => {
		const rows = assertImportReferences(index).filter(row => row.id === id);
		if (typeof id !== 'string' || rows.length !== 1) throw fail('import-undo', 'This import record is absent or duplicated: ' + String(id) + '. Nothing was undone.');
		return readImportReceiptFile(rows[0], readBytes);
	};
	const removalDigest = file => file.startsWith('attachments/') ? storedFileDigest(store, file) : readBytes(file).then(digestOf);
	const snapshotFiles = async () => {
		const files = [];
		for (const prefix of ['', 'audio', 'attachments', 'thumbs', 'imports', 'history/manifests', 'history/texts', 'history/blobs'])
			for (const name of await store.list(prefix)) files.push(prefix ? prefix + '/' + name : name);
		return files;
	};
	const emptyDestination = async () => {
		if ((await snapshotFiles()).some(file => file !== NOTES_INDEX_FILE)) throw fail('occupied', 'Exact restore needs an empty Notes folder. Existing files were kept; use Add backup.');
		const bytes = await readBytes(NOTES_INDEX_FILE);
		if (bytes != null) {
			const raw = JSON.parse(decode(bytes)), clean = copy(raw);
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
		if (kind === 'restore') incarnation = crypto.randomUUID();
		const message = {type: 'rapier-notes-commit', scope, generation: folderGeneration(index), changed: [...new Set(changed)].sort(), kind};
		try { channel?.postMessage(message); return {sent: !!channel}; }
		catch (error) { return {sent: false, error: String(error?.message || error)}; }
	};
	async function acquire(scope) {
		if (closed) throw fail('closed', 'The notes owner is closed.');
		if (typeof scope !== 'string' || !scope) throw fail('scope', 'A notes folder needs a stable lock scope.');
		if (store.writable === false && !store.reclaimable) throw fail('read-only', store.reason || 'These notes are read-only here.');
		if (isShared() && !channel?.postMessage) throw fail('read-only', 'Shared notes need their commit notification channel before this writer can open them.');
		if (isShared() && !locks?.request) throw fail('read-only', notesHostWords().native ? 'This device cannot coordinate writes to shared notes. Reading and backup remain available.' : 'This browser cannot coordinate writes to shared notes. Open them in a browser with Web Locks; reading and backup remain available.');
		let unlock, settled, granted = false, releaseStarted = false, released = false;
		const held = new Promise(resolve => { unlock = resolve; });
		if (isShared() && locks?.request) {
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
			try { await admission; } catch (error) { unlock(); throw error; }
		} else {
			const previous = localTail;
			localTail = previous.catch(() => {}).then(() => held);
			await previous.catch(() => {}); granted = true; settled = localTail;
		}
		try {
			await store.recoverIntakes?.();
			if (store.prepare && !await store.prepare()) throw fail('read-only', store.reason || 'These notes are read-only here.');
		}
		catch (error) { unlock(); await settled; throw error; }
		const active = () => { if (!granted || released) throw fail('released', 'This notes transaction no longer owns the folder.'); };
		let dirty = null, lastDropped = [], lastKept = [];
		const canonicalRows = journal => {
			if (journal.canonical === undefined) return [];
			if (!Array.isArray(journal.canonical) || !journal.canonical.length) throw fail('corrupt', 'The canonical publication is unreadable.');
			const seen = new Set();
			for (const row of journal.canonical) {
				if (!row || !isNoteFile(row.file) || !validNoteId(row.id) || seen.has(row.id) ||
					row.history !== 'history/' + manifestName(row.id) || !/^[a-f0-9]{64}$/.test(row.ledger)) throw fail('corrupt', 'The canonical publication has no exact identity.');
				seen.add(row.id);
			}
			return journal.canonical;
		};
		const verifyCanonical = async (journal, index, preparation) => {
			for (const row of canonicalRows(journal)) {
				if (index.notes[row.file]?.id !== row.id || index.notes[row.file]?.canonicalHistory !== row.ledger) throw fail('changed', 'The note identity changed during canonical publication. Its pending save was kept.');
				const body = await readBytes(row.file), history = await readBytes(row.history);
				if (!body || !history) throw fail('changed', 'The note and its history have not both landed. The pending save was kept.');
				// exact bytes. Neither its lease nor its remembered ledger licenses reuse.
				const proved = preparation.parseCanonical(history, {noteId: row.id, now: clock(), text: new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(body)});
				if (proved.ledger.sha256 !== row.ledger) throw fail('changed', 'The canonical history changed during publication. Its pending save was kept.');
			}
		};
		const saveStages = journal => {
			if (journal.staging === undefined) return [];
			const stages = new Map();
			for (const row of journal.writes) {
				if (!jsonObject(row)) throw fail('corrupt', 'The pending save file record is unreadable.');
				if (row.stage === undefined) continue;
				fileName(row.file);
				if (!(isNoteFile(row.file) || row.file.startsWith('history/')) || !/^[a-f0-9]{64}$/.test(row.digest) || (row.stage !== saveStageName(row.digest) && !(journal.kind === 'canonical-recovery' && row.stage === '.rapier-rename-stage-' + row.digest + '.tmp')) ||
					row.data !== undefined || !Number.isSafeInteger(row.size) || row.size < 0 || stages.has(row.stage) && stages.get(row.stage).size !== row.size)
					throw fail('corrupt', 'The pending save stage has no exact byte identity.');
				stages.set(row.stage, row);
			}
			if (!stages.size) throw fail('corrupt', 'The pending save has no staged bytes.');
			return [...stages.values()];
		};
		const retireSaveStages = async journal => {
			for (const row of saveStages(journal)) {
				const bytes = await readBytes(row.stage);
				if (bytes == null) continue;
				if (bytes.length !== row.size || await digestOf(bytes) !== row.digest) throw fail('changed', 'A staged save changed. Its bytes and the pending journal were kept.');
				await store.remove(row.stage);
				if (await readBytes(row.stage) != null) throw fail('verify', 'The saved note stage could not be retired.');
			}
		};
		const flushNotice = async index => {
			const pending = index.ownerNotice;
			if (!pending) return {index, notice: null};
			if (pending.generation !== folderGeneration(index) || !Array.isArray(pending.changed)) throw fail('corrupt', 'The notes commit notice is not readable.');
			const sent = notice(scope, index, pending.changed, pending.kind);
			if (sent.sent || !isShared()) {
				const acknowledged = copy(index); delete acknowledged.ownerNotice;
				try { await writeVerified(NOTES_INDEX_FILE, exactBytes(serializeIndex(acknowledged))); index = acknowledged; }
				catch (error) {
					index = await readIndex();
					return {index, notice: {...sent, acknowledged: false, error: String(error?.message || error)}};
				}
			}
			return {index, notice: sent};
		};
		const publish = async (index, changed, kind, ours = false, journal = null, preparation = null) => {
			const publishBytes = async () => {
				const bytes = exactBytes(serializeIndex(index));
				if (journal) {
					journal.publicationDigest = await sha256(bytes); await writeJournal(journal);
					if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== journal.baseDigest) throw fail('changed', 'The folder metadata changed before publication. Its bytes and the pending save were kept.');
				}
				if (journal) await verifyCanonical(journal, index, preparation);
				await writeVerified(NOTES_INDEX_FILE, bytes, journal?.publicationDigest);
				if (journal) {
					await verifyCanonical(journal, index, preparation);
					await retireSaveStages(journal);
					await clearJournal();
				}
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
		const rescueCanonical = async (index, journal, current, preparation) => {
			const published = !!journal.publicationDigest && journal.publicationDigest === current;
			if (journal.exactIndex || journal.staging === 'preparing' || !published && (!['save', 'canonical-save', 'create', 'canonical-create', 'keep-both', 'canonical-recovery'].includes(journal.kind) || journal.removes.length)) return null;
			const conflicts = [];
			for (const proof of canonicalRows(journal)) {
				let row = journal.writes.find(row => row.file === proof.file);
				if (!row) {
					if (!published) continue;
					const proved = preparation.parseCanonical(await readBytes(proof.history), {noteId: proof.id, now: clock()});
					if (proved.ledger.sha256 !== proof.ledger) throw fail('changed', 'The published canonical history changed. Its files were kept.');
					const intended = exactBytes(proved.text);
					row = {file: proof.file, before: null, digest: await digestOf(intended), data: pack(intended)};
				}
				const bytes = await readBytes(row.file), digest = await digestOf(bytes);
				if (digest !== row.digest && (published || digest !== row.before)) conflicts.push({proof, row, bytes, digest});
			}
			if (!conflicts.length) return null;
			if (!published && (journal.baseGeneration !== folderGeneration(index) || current !== journal.baseDigest)) throw fail('changed', 'The folder metadata changed during recovery. Its pending words were kept.');
			if (published && folderGeneration(index) !== journal.generation) throw fail('corrupt', 'The published save names a different generation.');
			const payloads = new Map();
			const payload = async row => {
				if (!row) throw fail('corrupt', 'The pending canonical save has no history bytes.');
				if (payloads.has(row.file)) return payloads.get(row.file);
				let bytes = row.stage ? await readBytes(row.stage) : unpack(row.data);
				if (row.stage && bytes === null) bytes = await readBytes(row.file);
				if (bytes === null || row.stage && bytes.length !== row.size || await digestOf(bytes) !== row.digest) throw fail('corrupt', 'The pending recovery bytes failed verification: ' + row.file + '.');
				payloads.set(row.file, bytes); return bytes;
			};
			for (const conflict of conflicts) {
				const {proof, row} = conflict, history = journal.writes.find(write => write.file === proof.history);
				const bytes = history ? await payload(history) : await readBytes(proof.history);
				if (published && history && await digestOf(await readBytes(proof.history)) !== history.digest) throw fail('changed', 'The published canonical history changed. Its files were kept.');
				const proved = preparation.parseCanonical(bytes, {noteId: proof.id, now: clock()});
				const intended = exactBytes(proved.text);
				if (proved.ledger.sha256 !== proof.ledger || await digestOf(intended) !== row.digest) throw fail('corrupt', 'The saved words do not match their canonical history.');
				if (row.stage && await readBytes(row.stage) === null) payloads.set(row.file, intended);
				else await payload(row);
			}
			for (const row of journal.writes) { fileName(row.file); await payload(row); }
			const after = published ? copy(index) : applyIndexDelta(index, journal), names = new Set([...(await store.list()).filter(isNoteFile), ...Object.keys(after.notes)]), now = clock();
			for (const conflict of conflicts) {
				const {proof, row, digest} = conflict, entry = after.notes[proof.file];
				if (entry?.id !== proof.id || entry.canonicalHistory !== proof.ledger) throw fail('corrupt', 'The saved note identity does not match its pending history.');
				conflict.name = isCodeFile(proof.file) ? codeFileName(proof.file.replace(/(\.[^.]+)$/, ' kept$1'), [...names], {ascii: store.ascii})
					: noteFileName(proof.file.replace(/\.md$/i, '') + ' kept', [...names], {ascii: store.ascii}); names.add(conflict.name);
				after.notes[conflict.name] = {...entry, keptFrom: {file: proof.file, ...(row.before === null ? {} : {digest: row.before})}};
				try { conflict.text = conflict.bytes === null ? null : new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(conflict.bytes); }
				catch (_) { conflict.text = null; }
				if (conflict.text === null) delete after.notes[proof.file];
				else after.notes[proof.file] = {created: now, modified: now, revision: 'sha256:' + digest};
			}
			admitIdentities(after, after.folderDeviceId);
			const next = {...journal, kind: 'canonical-recovery', baseGeneration: folderGeneration(index), generation: folderGeneration(index) + 1, baseDigest: current,
				writes: journal.writes.map(row => {
					const next = {...row};
					if (published) { next.before = next.digest; delete next.requires; }
					delete next.caseSource;
					return next;
				}), removes: published ? [] : journal.removes, canonical: canonicalRows(journal).map(row => ({...row}))};
			delete next.publicationDigest; delete next.after;
			if (journal.writes.some(row => row.caseSource !== undefined)) next.staging = 'ready';
			for (const {proof, row, bytes, digest, name, text} of conflicts) {
				let saved = next.writes.find(write => write.file === proof.file);
				if (!saved) { saved = {...row}; next.writes.push(saved); }
				Object.assign(saved, {file: name, before: null});
				if (saved.stage && await readBytes(saved.stage) === null) { delete saved.stage; delete saved.size; saved.data = pack(payloads.get(row.file)); }
				next.canonical.find(item => item.id === proof.id).file = name;
				if (text === null) continue;
				const entry = after.notes[proof.file], id = entry.id;
				const manifest = preparation.freshCanonical(preparation.parseManifest(null, {noteId: id, now}), {filename: proof.file, docKind: isCodeFile(proof.file) ? 'code' : 'markdown'});
				const appended = await preparation.appendCanonical(manifest, {text, author: {kind: 'system', id: 'notes-recovery'}, operation: 'notes.admit', now});
				entry.canonicalHistory = appended.ledger.sha256;
				const recorded = await preparation.recordVersion(appended.manifest, {file: proof.file, text, entry, reason: 'save', now});
				next.writes.push({file: proof.file, before: digest, digest, data: pack(bytes)});
				for (const write of recorded.writes) {
					const file = 'history/' + write.name, held = await readBytes(file), digest = await digestOf(write.bytes), existing = next.writes.find(row => row.file === file);
					if (existing) { if (existing.digest !== digest) throw fail('corrupt', 'Recovered history objects disagree.'); continue; }
					if (held !== null) { if (!write.immutable || !equal(held, write.bytes)) throw fail('changed', 'The recovery history destination is occupied.'); continue; }
					next.writes.push({file, before: null, digest, data: pack(write.bytes)});
				}
				await preparation.materialize(recorded.manifest, recorded.version.id, name => {
					const row = next.writes.find(row => row.file === 'history/' + name);
					return row ? payloads.get(row.file) || unpack(row.data) : readBytes('history/' + name);
				});
				next.canonical.push({file: proof.file, id, history: 'history/' + manifestName(id), ledger: appended.ledger.sha256});
			}
			if (next.staging && !next.writes.some(row => row.stage)) delete next.staging;
			after.folderGeneration = next.generation; next.delta = indexDelta(index, after);
			if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== current) throw fail('changed', 'The folder metadata changed before recovery publication.');
			for (const {proof, digest, name} of conflicts) if (await digestOf(await readBytes(proof.file)) !== digest || await readBytes(name) !== null) throw fail('changed', 'The recovery destination changed. Both bodies remain in their original custody.');
			await writeJournal(next);
			return next;
		};
		const recover = async (ours = null) => {
			active();
			const preparation = resolveHistoryPreparation(ours?.historyPreparation) || createHistoryPreparation();
			let index = ours ? ours.index : await readIndex(), journal = ours ? ours.journal : await readJournal();
			if (journal?.kind === 'restore') incarnation = crypto.randomUUID();
			if (index.transaction) throw fail('corrupt', 'The notes index contains an unsupported pending journal; its files have been kept.');
			if (journal) {
				if (journal.version !== 2 || !Number.isSafeInteger(journal.baseGeneration) || journal.baseGeneration < 0 || journal.generation !== journal.baseGeneration + 1 || !Number.isSafeInteger(journal.generation) ||
					!(journal.baseDigest === null || /^[0-9a-f]{64}$/.test(journal.baseDigest)) || !Array.isArray(journal.writes) || !Array.isArray(journal.removes) ||
					journal.publicationDigest !== undefined && !/^[0-9a-f]{64}$/.test(journal.publicationDigest) ||
					journal.staging !== undefined && (!['save', 'canonical-save', 'canonical-recovery'].includes(journal.kind) || !['preparing', 'ready'].includes(journal.staging) || journal.removes.length || journal.staging === 'preparing' && journal.publicationDigest !== undefined)) throw fail('corrupt', 'The pending notes transaction is not readable; its files have been kept.');
				canonicalRows(journal);
				saveStages(journal);
				const current = ours ? journal.baseDigest : await digestOf(indexReceipt);
				const rescued = await rescueCanonical(index, journal, current, preparation);
				if (rescued) { journal = rescued; ours = null; }
				if (journal.publicationDigest && current === journal.publicationDigest) {
					if (journal.exactIndex ? current !== journal.exactIndex.digest : folderGeneration(index) !== journal.generation) throw fail('corrupt', 'The completed notes journal names a different generation.');
					await verifyCanonical(journal, index, preparation);
					await retireSaveStages(journal);
					if (journal.kind === 'restore') {
						dirty = notice(scope, index, journal.writes.map(row => row.file), 'restore');
						if (isShared() && !dirty.sent) throw fail('notify', 'The restored folder must notify its other owners before another edit.');
					}
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
					if (await sha256(exactBytesAfter) !== exact.digest || !exact.original && journal.removes.length) throw fail('corrupt', 'The pending exact restore failed verification; its files were kept.');
					exactIndexAfter = parseIndex(decode(exactBytesAfter));
					folderGeneration(exactIndexAfter);
					if (exactIndexAfter.transaction || exactIndexAfter.ownerNotice || Object.keys(exactIndexAfter.deletions || {}).length) throw fail('corrupt', 'The exact snapshot has an unfinished operation.');
					const check = copy(exactIndexAfter); check.folderGeneration = journal.generation;
					if (canonicalJSON(check) !== canonicalJSON(journal.after)) throw fail('corrupt', 'The pending restore sidecar does not match its exact bytes.');
					const base = parseIndex(exact.base == null ? null : decode(unpack(exact.base)));
					if (base.transaction || folderGeneration(base) !== journal.baseGeneration || await digestOf(await readBytes(NOTES_INDEX_FILE)) !== journal.baseDigest)
						throw fail('changed', 'The folder metadata changed during exact restore. It was kept; keep the source backup.');
				}
				const original = new Map();
				if (exact?.original !== undefined) {
					if (!Array.isArray(exact.original)) throw fail('corrupt', 'The restore base inventory is unreadable.');
					for (const row of exact.original) {
						fileName(row.file, true);
						if (original.has(row.file) || !/^[0-9a-f]{64}$/.test(row.digest)) throw fail('corrupt', 'The restore base inventory is unreadable.');
						original.set(row.file, row.digest);
					}
				}
				const seen = new Set(), stages = new Set(), writes = [];
				const stagedBytes = async row => {
					const staged = await readBytes(row.stage), bytes = staged ?? await readBytes(row.file);
					const owned = ours?.payloads?.get(row.file);
					if (bytes == null || bytes.length !== row.size || (owned ? !equal(bytes, owned) : await digestOf(bytes) !== row.digest)) throw fail('corrupt', 'The staged transaction file failed verification: ' + row.file + '. Its files were kept.');
					return owned || bytes;
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
					} else if (isImportReceiptFile(row.file)) {
						if (!/^[a-f0-9]{64}$/.test(row.digest) || row.stage !== '.rapier-import-stage-' + row.digest + '.tmp' || row.data !== undefined || !Number.isSafeInteger(row.size) || row.size < 0) throw fail('corrupt', 'The staged import receipt is unreadable: ' + row.file + '.');
						writes.push({...row, bytes: await stagedBytes(row)});
					} else if (syncStateFile(row.file)) {
						if (!/^\.rapier-sync-stage-[a-f0-9]{64}\.tmp$/.test(row.stage) || row.data !== undefined || !Number.isSafeInteger(row.size) || row.size < 0)
							throw fail('corrupt', 'The staged sync checkpoint is unreadable; no local work was replaced.');
						if (row.before != null && (!/^\.rapier-sync-stage-[a-f0-9]{64}\.tmp$/.test(row.priorStage) || row.priorStage !== '.rapier-sync-stage-' + row.before + '.tmp')) throw fail('corrupt', 'The previous sync checkpoint is unreadable.');
						writes.push({...row, bytes: await stagedBytes(row)});
					} else if (journal.staging && row.stage !== undefined) {
						writes.push(journal.staging === 'ready' ? {...row, bytes: await stagedBytes(row)} : row);
					} else {
						const owned = ours?.payloads?.get(row.file), bytes = owned || unpack(row.data);
						if (!owned && await digestOf(bytes) !== row.digest) throw fail('corrupt', 'Pending note bytes failed verification.');
						writes.push({...row, bytes});
					}
					if (isNoteFile(row.file) && !own(journal.after.notes, row.file)) throw fail('corrupt', 'Pending note bytes failed verification.');
				}
				if (exact && (writes.some(row => row.before !== (original.get(row.file) ?? null) || row.requires !== undefined || seen.has(row.stage) || original.has(row.stage)) || (await snapshotFiles()).some(file => file !== NOTES_INDEX_FILE && file !== OWNER_JOURNAL_FILE && !seen.has(file) && !stages.has(file) && !original.has(file))))
					throw fail('changed', 'The folder changed during exact restore. Every existing file was kept; keep the source backup.');
				if (exact) {
					const removed = new Map(journal.removes.map(row => [row.file, row.digest]));
					if (removed.size !== journal.removes.length || [...original].some(([file, digest]) => !seen.has(file) && removed.get(file) !== digest) || [...removed].some(([file, digest]) => seen.has(file) || original.get(file) !== digest)) throw fail('corrupt', 'The restore removals do not match its original library.');
				}
				if (exact?.phase === 'preparing') {
					for (const [file, digest] of original) if (await storedFileDigest(store, file) !== digest) throw fail('changed', 'The library changed during restore preparation. Its bytes were kept.');
					for (const row of writes) {
						if (await digestOf(await readBytes(row.file)) !== row.before) throw fail('changed', 'The folder changed while preparing restore. Its files were kept; keep the source backup.');
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
					if ((await snapshotFiles()).some(file => file !== NOTES_INDEX_FILE && file !== OWNER_JOURNAL_FILE && !original.has(file))) throw fail('changed', 'The folder changed while removing restore preparation. Its files were kept.');
					const base = parseIndex(exact.base == null ? null : decode(unpack(exact.base)));
					if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== journal.baseDigest) throw fail('changed', 'The folder sidecar changed during restore preparation. It was kept.');
					if (exact.base == null) { await store.remove(NOTES_INDEX_FILE); if (await readBytes(NOTES_INDEX_FILE) != null) throw fail('verify', 'The original empty sidecar could not be restored.'); }
					else await writeVerified(NOTES_INDEX_FILE, unpack(exact.base));
					await clearJournal();
					return {index: base};
				}
				for (const row of journal.removes) { fileName(row.file, !!exact); if (seen.has(row.file) || isNoteFile(row.file) && own(journal.after.notes, row.file) || !/^[0-9a-f]{64}$/.test(row.digest)) throw fail('corrupt', 'The pending removal is not readable.'); seen.add(row.file); }
				const byFile = new Map(writes.map(row => [row.file, row]));
				const caseMoves = writes.filter(row => row.caseSource !== undefined);
				for (const row of caseMoves) if (!journal.removes.some(remove => remove.file === row.caseSource && remove.digest === row.sourceDigest && remove.requires === row.file) ||
					index.notes[row.caseSource]?.id !== journal.after.notes[row.file]?.id || typeof index.notes[row.caseSource]?.id !== 'string')
					throw fail('corrupt', 'The staged rename does not prove the original note identity.');
				for (const row of [...writes, ...journal.removes]) if (row.requires !== undefined &&
					(!byFile.has(row.requires) || byFile.get(row.requires).requires !== undefined || row.requires === row.file)) throw fail('corrupt', 'A pending file operation has no independent prerequisite write.');
				const planned = new Map(writes.map(row => [row.file, journal.after.notes[row.file]])), kept = [];
				const plannedFiles = new Set(Object.keys(index.notes));
				for (const row of writes) if (isNoteFile(row.file)) plannedFiles.add(row.file);
				for (const row of journal.removes) if (isNoteFile(row.file)) plannedFiles.delete(row.file);
				if (journal.kind === 'canonical-recovery') for (const row of journal.delta.notes) if (row.entry === null &&
					journal.canonical?.some(proof => proof.id === row.beforeId && journal.after.notes[proof.file]?.keptFrom?.file === row.file)) plannedFiles.delete(row.file);
				if (!journal.after.notes || Object.keys(journal.after.notes).length !== plannedFiles.size || [...plannedFiles].some(file => !own(journal.after.notes, file))) throw fail('corrupt', 'The pending sidecar does not account for its file operations.');
				if (journal.staging === 'preparing') {
					for (const row of writes) if (await digestOf(await readBytes(row.file)) !== row.before) throw fail('changed', 'A note changed during save preparation. Its bytes and the unfinished save were kept.');
					for (const row of saveStages(journal)) {
						const bytes = await readBytes(row.stage);
						if (bytes != null && (bytes.length !== row.size || await digestOf(bytes) !== row.digest)) throw fail('changed', 'A staged save changed. Its bytes and the unfinished save were kept.');
					}
					await retireSaveStages(journal);
					if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== journal.baseDigest) throw fail('changed', 'The folder sidecar changed during save preparation. Its bytes were kept.');
					await clearJournal();
					return {index};
				}
				const drop = (file, digest) => {
					if (journal.canonical?.some(row => row.file === file || row.history === file)) throw fail('changed', 'The note changed during canonical publication. Both originals and the pending save were kept.');
					if (isImportReceiptFile(file)) throw fail('changed', 'Import receipt ' + file + ' changed during publication. Its bytes and the pending transaction were kept.');
					if (file.startsWith('history/')) throw fail('changed', 'The note history changed before replacement. Its words and pending history were kept.');
					if (exact) throw fail('changed', 'The file ' + file + ' changed during exact restore. Its newer bytes and the pending restore were kept; keep the source backup.');
					if (!dropped.includes(file)) dropped.push(file);
					if (!isNoteFile(file)) return;
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
					const aliases = (await store.list()).filter(name => name.normalize('NFC').toLowerCase() === row.file.normalize('NFC').toLowerCase());
					if (aliases.length > 1 || aliases.length === 1 && ![row.caseSource, row.file].includes(aliases[0])) throw fail('changed', 'The rename destination changed. Its bytes and the staged note were kept.');
					if (aliases[0] === row.file) {
						if (await digestOf(await readBytes(row.file)) !== row.digest) throw fail('changed', 'The rename destination changed. Its bytes and the staged note were kept.');
						continue;
					}
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
					if (!exact && syncStateFile(row.file) || row.caseSource !== undefined) continue;
					if (dropped.includes(row.file) || !await ready(row)) continue;
					const digest = await digestOf(await readBytes(row.file));
					if (digest !== row.digest) {
						if (digest !== row.before) { drop(row.file, digest); continue; }
						await writeVerified(row.file, exact ? await stagedBytes(row) : row.bytes);
					}
					if (exact) {
						const bytes = await readBytes(row.stage);
						if (bytes != null) {
							if (bytes.length !== row.size || await sha256(bytes) !== row.digest) throw fail('changed', 'A staged restore file changed. It was kept; keep the source backup.');
							await store.remove(row.stage);
							if (await readBytes(row.stage) != null) throw fail('verify', 'The restore stage could not be removed.');
						}
					}
				}
				if (exact) {
					for (const row of journal.removes) {
						const digest = await digestOf(await readBytes(row.file));
						if (digest != null && digest !== row.digest) throw fail('changed', 'An old library file changed during restore. Its bytes were kept.');
						if (digest != null) { await store.remove(row.file); if (await readBytes(row.file) != null) throw fail('verify', 'An old library file could not be retired.'); }
						seen.delete(row.file);
					}
					for (const row of writes) if (await digestOf(await readBytes(row.file)) !== row.digest) throw fail('changed', 'A restored file changed before publication. Keep the source backup.');
					const inventory = (await snapshotFiles()).filter(file => file !== NOTES_INDEX_FILE && file !== OWNER_JOURNAL_FILE);
					if (inventory.length !== seen.size || inventory.some(file => !seen.has(file))) throw fail('changed', 'The restored file inventory differs from the backup. Every file was kept; keep the source backup.');
					const base = parseIndex(exact.base == null ? null : decode(unpack(exact.base)));
					if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== journal.baseDigest) throw fail('changed', 'The folder sidecar changed during restore. It was kept; keep the source backup.');
					journal.publicationDigest = await sha256(exactBytesAfter); await writeJournal(journal);
					await writeVerified(NOTES_INDEX_FILE, exactBytesAfter, journal.publicationDigest);
					dirty = notice(scope, exactIndexAfter, writes.map(row => row.file), 'restore');
					if (isShared() && !dirty.sent) throw fail('notify', 'The restored folder must notify its other owners before another edit.');
					await clearJournal();
					return {index: exactIndexAfter};
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
				if (journal.kind === 'rename') for (const row of journal.removes) {
					const source = journal.after.notes[row.file], target = journal.after.notes[row.requires];
					if (dropped.includes(row.file) && source?.id && target?.id === source.id) delete target.id;
				}
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
				const published = await publish(index, [...[...journal.writes, ...journal.removes].map(row => row.file), ...kept.map(row => row.name), ...fixed.added, ...fixed.dropped], journal.kind || 'recovery', !!ours, journal, preparation);
				index = published.index; dirty = published.notice; lastDropped = dropped; lastKept = kept;
				for (const row of writes.filter(row => isImportReceiptFile(row.file))) try { const bytes = await readBytes(row.stage); if (bytes != null && await digestOf(bytes) === row.digest) await store.remove(row.stage); } catch (_) {}
				for (const row of caseMoves) try { const bytes = await readBytes(row.stage); if (bytes && await digestOf(bytes) === row.digest) await store.remove(row.stage); } catch (_) {}
				for (const row of writes.filter(row => syncStateFile(row.file))) for (const stage of new Set([row.stage, row.priorStage].filter(Boolean))) {
					try { const bytes = await readBytes(stage); if (bytes && await digestOf(bytes) === stage.slice('.rapier-sync-stage-'.length, -4)) await store.remove(stage); } catch (_) {}
				}
			}
			if (repair) {
				const result = await repair({store, index, commitIndex});
				if (result?.index) index = result.index;
				return {index, listing: result?.listing};
			}
			return {index};
		};
		const read = async options => {
			const requested = requestedBodies(options);
			const recovered = await recover(), listing = recovered.listing || await store.list();
			let index = recovered.index;
			const files = listing.filter(isNoteFile).sort();
			const fixed = repairListing(index, files, clock);
			if (fixed.added.length || fixed.dropped.length) {
				const committed = await commitIndex(fixed.index, {changed: [...fixed.added, ...fixed.dropped], kind: 'reconcile'});
				index = committed.index; dirty = committed.notice;
			}
			const bodies = await readBodies(files, requested);
			const reported = lastDropped, keptReported = lastKept; lastDropped = []; lastKept = [];
			return {index, files, listing, bodies, generation: folderGeneration(index), readOnly: false, notice: dirty, dropped: reported, kept: keptReported};
		};
		const rebuildIndex = async backup => {
			active();
			let damaged = null;
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
			const restoring = options?.exactRestore === true, replacing = restoring && options?.replace === true;
			if (restoring) incarnation = crypto.randomUUID();
			if (restoring && !replacing) await emptyDestination();
			const ordinary = options?.ordinarySave;
			let direct = null;
			if (!restoring && typeof planner === 'function' && typeof store.compareWrite === 'function' &&
					isNoteFile(ordinary?.file) && validNoteId(ordinary?.id) && Array.isArray(ordinary?.expectedDigest)) {
				const [base, body, pending] = await Promise.all([readBytes(NOTES_INDEX_FILE), readBytes(ordinary.file), readBytes(OWNER_JOURNAL_FILE)]);
				if (base != null && body != null && pending == null) {
					let text;
					try { text = decode(base); } catch (_) { throw fail('corrupt', 'The notes index is not UTF-8 text.'); }
					const index = parseIndex(text), entries = Object.values(index.notes), ids = entries.map(entry => entry.id);
					let bodyDigest;
					if (!index.transaction && !index.ownerNotice && !Object.keys(index.deletions || {}).length && index.folderDeviceId &&
							index.notes[ordinary.file]?.id === ordinary.id && !index.notes[ordinary.file].trashed &&
							ids.every(validNoteId) && new Set(ids).size === ids.length && ordinary.expectedDigest.includes(bodyDigest = await ownedDigest(body))) {
						direct = {file: ordinary.file, base, body, bodyDigest, index, expected: new Map([[NOTES_INDEX_FILE, base], [ordinary.file, body], [OWNER_JOURNAL_FILE, null]])};
					}
				}
			}
			const before = direct ? {index: direct.index, files: Object.keys(direct.index.notes).sort(), bodies: new Map(), generation: folderGeneration(direct.index), readOnly: false}
				: await read(options);
			const baseBytes = direct ? direct.base : indexReceipt, digestBytes = direct ? ownedDigest : digestOf;
			const baseDigest = await digestBytes(baseBytes), observed = new Map(before.bodies);
			if (direct) observed.set(direct.file, direct.body);
			const ordinaryAgain = () => transact(planner, {...options, ordinarySave: null});
			const admit = () => { active(); options?.admit?.(); };
			const original = [];
			if (replacing) for (const file of await snapshotFiles()) if (file !== NOTES_INDEX_FILE) {
				fileName(file, true);
				const digest = await storedFileDigest(store, file);
				if (!digest) throw fail('changed', 'The restore destination changed before preparation.');
				original.push({file, digest});
			}
			const plan = typeof planner === 'function' ? await planner({index: copy(before.index), files: before.files.slice(), bodies: new Map([...before.bodies].map(([file, bytes]) => [file, bytes.slice()])),
				readImportReceipt: id => receiptFrom(before.index, id), digestBytes,
				readBodies: async names => {
					const requested = requestedBodies({bodies: names});
					if (direct && requested.some(file => file !== direct.file)) throw fail('plan', 'An ordinary save may prepare only its admitted note.');
					const bodies = direct ? new Map(requested.map(file => [file, direct.body.slice()])) : await readBodies(before.files, requested);
					for (const [file, bytes] of bodies) observed.set(file, bytes.slice());
					return bodies;
				}}) : planner;
			if (!plan?.index || plan.index.transaction) throw fail('plan', 'A notes transaction needs its complete resulting sidecar.');
			if (!restoring && folderGeneration(plan.index) !== before.generation) throw fail('stale', 'The notes folder changed; reload it before saving.');
			if (restoring && (plan.kind !== 'restore' || !plan.exactIndex || plan.removes?.length)) throw fail('plan', 'Exact restore needs the complete original sidecar and only new files.');
			const directDelta = direct && indexDelta(before.index, plan.index);
			const directUnchanged = direct && !plan.writes?.length && !plan.removes?.length && !directDelta.root.length && !directDelta.notes.length;
			const historyRow = row => typeof row.file === 'string' && row.file.startsWith('history/');
			if (direct && !directUnchanged && (!['save', 'canonical-save'].includes(plan.kind) || plan.writes?.[0]?.file !== direct.file || plan.removes?.length || directDelta.root.length ||
					directDelta.notes.some(row => row.file !== direct.file || row.id !== ordinary.id || row.beforeId !== ordinary.id) ||
					(plan.writes || []).some(row => row.createOnly || row.requires !== undefined || row.caseSource !== undefined || row.file !== direct.file && !historyRow(row)) ||
					(plan.kind === 'save') !== (plan.writes.length === 1))) return ordinaryAgain();
			const after = copy(plan.index), writes = [], removes = [], seen = new Set(), sources = new Map(), payloads = new Map(), present = new Set(before.files);
			const inputs = new Map(), digests = new Map();
			const plannedWrites = (plan.writes || []).map(row => {
				if (restoring) return {...row};
				const input = row.bytes ?? row.text;
				if (!inputs.has(input)) inputs.set(input, exactBytes(input));
				return {...row, bytes: inputs.get(input)};
			});
			const stageSave = !restoring && ['save', 'canonical-save'].includes(plan.kind) && !plan.removes?.length && plannedWrites.every(row => isNoteFile(row.file) || historyRow(row));
			for (const row of plannedWrites) {
				fileName(row.file, restoring); if (seen.has(row.file)) throw fail('plan', 'A transaction names one file twice.'); seen.add(row.file);
				if (restoring && store.ascii && /[^\x00-\x7f]/.test(row.file)) throw fail('name', 'This folder cannot keep the exact backup filename: ' + row.file + '. Nothing was restored.');
				const createOnly = restoring ? !replacing : row.createOnly || plan.kind === 'import' && row.replace !== true;
				const caseSource = row.caseSource, caseMove = caseSource !== undefined;
				if (caseMove && (plan.kind !== 'rename' || !isNoteFile(row.file) || !isNoteFile(caseSource) || caseSource === row.file ||
					caseSource.normalize('NFC').toLowerCase() !== row.file.normalize('NFC').toLowerCase() || !present.has(caseSource) || present.has(row.file)))
					throw fail('plan', 'A case-only rename needs the exact original spelling and a free destination.');
				if (createOnly && present.has(row.file)) throw fail('collision', 'The import name ' + row.file + ' is occupied. Allocate a new name while holding the folder owner.');
				const bytes = restoring ? null : row.bytes, previous = direct && row.file === direct.file ? direct.body : await readBytes(row.file);
				if (bytes) payloads.set(row.file, bytes);
				if (createOnly && previous != null && !caseMove) throw fail('collision', 'The import name ' + row.file + ' is occupied. Allocate a new name while holding the folder owner.');
				const previousDigest = direct && row.file === direct.file ? direct.bodyDigest : await digestBytes(previous);
				if (row.expectedDigest !== undefined && row.expectedDigest !== previousDigest) throw fail('changed', 'The note changed since this edit was prepared.');
				if (restoring) {
					if (!Number.isSafeInteger(row.size) || row.size < 0 || !/^[0-9a-f]{64}$/.test(row.digest) || typeof row.read !== 'function' || row.requires !== undefined) throw fail('plan', 'Exact restore needs a verified source for each whole file.');
					writes.push({file: row.file, size: row.size, digest: row.digest, before: previousDigest});
					sources.set(row.file, row.read);
				} else if (caseMove) {
					const sourceDigest = await digestOf(await readBytes(caseSource)), removal = (plan.removes || []).find(remove => remove.file === caseSource);
					if (sourceDigest === null || previousDigest !== null && previousDigest !== sourceDigest || removal?.expectedDigest !== sourceDigest || removal.requires !== row.file || before.index.notes[caseSource]?.id !== after.notes[row.file]?.id)
						throw fail('changed', 'The case-only rename no longer proves its source. Both copies were kept.');
					const digest = await sha256(bytes), stage = '.rapier-rename-stage-' + digest + '.tmp';
					await writeVerified(stage, bytes, digest);
					writes.push({file: row.file, caseSource, sourceDigest, stage, size: bytes.length, digest, before: null});
				} else if (isImportReceiptFile(row.file)) {
					const digest = await sha256(bytes), stage = '.rapier-import-stage-' + digest + '.tmp';
					const held = await readBytes(stage);
					if (held != null && await sha256(held) !== digest) throw fail('changed', 'The import receipt stage changed. Its bytes were kept.');
					if (held == null) await writeVerified(stage, bytes);
					writes.push({file: row.file, stage, size: bytes.length, digest, before: previousDigest});
				} else if (syncStateFile(row.file)) {
					const digest = await sha256(bytes), stage = '.rapier-sync-stage-' + digest + '.tmp';
					await writeVerified(stage, bytes);
					const priorStage = previous == null ? null : '.rapier-sync-stage-' + previousDigest + '.tmp';
					if (priorStage) await writeVerified(priorStage, previous);
					writes.push({file: row.file, stage, size: bytes.length, digest, before: previousDigest, priorStage});
				} else {
					if (!digests.has(bytes)) digests.set(bytes, digestBytes(bytes));
					const digest = await digests.get(bytes), staged = stageSave && bytes.length >= SAVE_STAGE_BYTES && (isNoteFile(row.file) || historyRow(row));
					writes.push({file: row.file, ...(staged ? {stage: saveStageName(digest), size: bytes.length} : {data: pack(bytes)}), digest,
						before: previousDigest, ...(row.requires === undefined ? {} : {requires: row.requires})});
				}
				if (isNoteFile(row.file)) present.add(row.file);
			}
			if (replacing) for (const row of original) if (!seen.has(row.file)) {
				removes.push({...row}); seen.add(row.file); if (isNoteFile(row.file)) present.delete(row.file);
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
			if (!restoring) {
				if (plan.canonical !== undefined && (!Array.isArray(plan.canonical) || !plan.canonical.length)) throw fail('plan', 'Canonical publication needs exact note proofs.');
				const byId = new Map(Object.entries(before.index.notes).map(([file, entry]) => [entry.id, {file, entry}]));
				const proofs = new Map();
				for (const proof of plan.canonical || []) {
					if (!proof || !isNoteFile(proof.file) || !validNoteId(proof.id) || proofs.has(proof.id) || proof.history !== 'history/' + manifestName(proof.id) ||
						!/^[a-f0-9]{64}$/.test(proof.ledger) || after.notes[proof.file]?.id !== proof.id || after.notes[proof.file]?.canonicalHistory !== proof.ledger)
						throw fail('plan', 'The canonical publication does not describe its exact note.');
					proofs.set(proof.id, proof);
				}
				for (const [file, entry] of Object.entries(after.notes)) {
					const previous = byId.get(entry.id), written = byFile.get(file);
					if (previous?.entry.canonicalHistory && !entry.canonicalHistory) throw fail('notes_history_unavailable', 'A transaction cannot detach canonical note history.');
					if (entry.canonicalHistory && (written || previous?.file !== file || previous?.entry.canonicalHistory !== entry.canonicalHistory) && !proofs.has(entry.id))
						throw fail('notes_history_unavailable', 'A note body and its canonical history must be published together.');
				}
			}
			if (Object.keys(after.notes).length !== present.size || [...present].some(file => !own(after.notes, file))) throw fail('plan', 'The resulting sidecar must describe every resulting note exactly once.');
			if (!restoring) {
				const prior = new Map(Object.values(before.index.notes).map(entry => [entry.id, entry]));
				const touches = new Map();
				for (const row of plan.controlTouches || []) {
					if (!row || !prior.has(row.id) || !Array.isArray(row.groups) || row.groups.some(group => !Object.hasOwn(NOTE_CONTROL_GROUPS, group))) throw fail('plan', 'Invalid control intent.');
					touches.set(row.id, [...(touches.get(row.id) || []), ...row.groups]);
				}
				for (const entry of Object.values(after.notes)) stampNoteControls(prior.get(entry.id), entry, before.generation + 1, touches.get(entry.id));
			}
			if (!restoring && !writes.length && !removes.length && jsonSame(before.index, after)) {
				if (await readJournal()) throw fail('pending', 'A pending notes journal must finish before another starts.');
				for (const [file, bytes] of observed) if (!equal(bytes, await readBytes(file))) throw fail('changed', 'The note changed before the transaction was admitted.');
				if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== baseDigest) throw fail('changed', 'The folder sidecar changed before the transaction was admitted.');
				await options?.admissionGuard?.();
				return {...before, bodies: new Map()};
			}
			delete after.ownerNotice;
			after.folderGeneration = before.generation + 1;
			if (!Number.isSafeInteger(after.folderGeneration)) throw fail('generation', 'The notes folder generation is exhausted.');
			const journal = {version: 2, kind: plan.kind || 'write', baseGeneration: before.generation, generation: after.folderGeneration, baseDigest, delta: indexDelta(before.index, after), writes, removes, ...(plan.canonical ? {canonical: copy(plan.canonical)} : {})};
			if (stageSave && writes.some(row => row.stage !== undefined)) journal.staging = 'preparing';
			if (restoring) {
				const aliases = new Set();
				for (const file of [...writes.map(row => row.file), NOTES_INDEX_FILE]) {
					const folded = file.normalize('NFC').toLowerCase();
					if (aliases.has(folded)) throw fail('name', 'Backup filenames differ only by case or Unicode spelling. This folder cannot safely restore both: ' + file + '.');
					aliases.add(folded);
				}
				for (const file of [...writes.map(row => row.file), NOTES_INDEX_FILE]) {
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
				journal.exactIndex = {data: pack(bytes), digest: await sha256(bytes), base: baseBytes == null ? null : pack(baseBytes), phase: 'preparing', ...(replacing ? {original} : {})};
				for (const old of original) for (const next of writes) {
					const a = old.file.normalize('NFC').toLowerCase(), b = next.file.normalize('NFC').toLowerCase();
					if (a === b && old.file !== next.file || a.startsWith(b + '/') || b.startsWith(a + '/')) throw fail('name', 'The restore paths conflict with existing files. Existing files were kept.');
				}
				let prefix;
				do { prefix = '.rapier-restore-' + globalThis.crypto.randomUUID().replace(/-/g, '') + '-'; }
				while ([...aliases, ...original.map(row => row.file.normalize('NFC').toLowerCase())].some(name => name.startsWith(prefix) || name.startsWith('.' + prefix)));
				writes.forEach((row, number) => { row.stage = prefix + number; });
				if (!replacing) await emptyDestination();
			}
			// The journal's read-back licenses body changes. The admitted after object is private
			const admissionBytes = journalBytes(journal);
			if (direct) {
				admit();
				await options?.admissionGuard?.();
				if (!await store.compareWrite(direct.expected, new Map([[OWNER_JOURNAL_FILE, admissionBytes]]), {guard: admit})) return ordinaryAgain();
				if (!equal(await readBytes(OWNER_JOURNAL_FILE), admissionBytes)) throw fail('verify', 'The notes folder did not keep its admitted journal.');
				indexReceipt = baseBytes;
			} else {
				if (await readJournal()) throw fail('pending', 'A pending notes journal must finish before another starts.');
				if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== baseDigest) throw fail('changed', 'The folder sidecar changed before the transaction was admitted.');
				await options?.admissionGuard?.();
				admit(); await writeVerified(OWNER_JOURNAL_FILE, admissionBytes);
			}
			if (journal.staging === 'preparing') {
				for (const row of saveStages(journal)) {
					const bytes = payloads.get(row.file), held = await readBytes(row.stage);
					if (held != null && !equal(held, bytes)) throw fail('changed', 'The save stage changed. Its bytes and the pending journal were kept.');
					if (held == null) await writeVerified(row.stage, bytes);
				}
				for (const row of writes) if (await digestOf(await readBytes(row.file)) !== row.before) throw fail('changed', 'A note changed during save preparation. Its bytes and the unfinished save were kept.');
				if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== baseDigest || !equal(await readBytes(OWNER_JOURNAL_FILE), admissionBytes)) throw fail('changed', 'The folder changed during save preparation. Its bytes and the unfinished save were kept.');
				await options?.admissionGuard?.();
				admit();
				journal.staging = 'ready';
				await writeJournal(journal);
			}
			if (restoring) {
				for (const row of writes) {
					const bytes = exactBytes(await sources.get(row.file)());
					if (bytes.length !== row.size || await sha256(bytes) !== row.digest) throw fail('changed', 'The source backup changed during restore: ' + row.file + '. Nothing was published; keep the source backup.');
					if (await readBytes(row.stage) != null || await digestOf(await readBytes(row.file)) !== row.before || await digestOf(await readBytes(NOTES_INDEX_FILE)) !== baseDigest) throw fail('changed', 'The folder changed during restore preparation. Its files were kept.');
					await writeVerified(row.stage, bytes);
				}
				if (await digestOf(await readBytes(NOTES_INDEX_FILE)) !== baseDigest) throw fail('changed', 'The folder sidecar changed during restore preparation. It was kept.');
				if (replacing) {
					const staging = new Set(writes.map(row => row.stage)), prior = new Set(original.map(row => row.file));
					const held = (await snapshotFiles()).filter(file => file !== NOTES_INDEX_FILE && file !== OWNER_JOURNAL_FILE && !staging.has(file));
					if (held.length !== original.length || held.some(file => !prior.has(file))) throw fail('changed', 'The library changed while preparing restore.');
					for (const row of original) if (await storedFileDigest(store, row.file) !== row.digest) throw fail('changed', 'The library changed while preparing restore.');
				}
				journal.exactIndex.phase = 'ready';
				await writeJournal(journal);
			}
			const {index: recovered} = await recover({index: before.index, journal, payloads, historyPreparation: plan.historyPreparation});
			const dropped = lastDropped, kept = lastKept; lastDropped = []; lastKept = [];
			return {index: recovered, files: Object.keys(recovered.notes).sort(), bodies: new Map(), generation: folderGeneration(recovered), readOnly: false, notice: dirty, dropped, kept};
		};
		let jobs = Promise.resolve(), releasePromise;
		const serial = fn => (...args) => {
			if (releaseStarted) return Promise.reject(fail('released', 'This notes transaction no longer accepts work.'));
			const result = jobs.catch(() => {}).then(() => fn(...args));
			jobs = result; return result;
		};
		return {read: serial(read), readImportReceipt: serial(async id => receiptFrom((await read()).index, id)), rebuildIndex: serial(rebuildIndex), recover: serial(async () => (await recover()).index), commitIndex: serial(commitIndex), transact: serial(transact), release: () => {
			if (releasePromise) return releasePromise;
			releaseStarted = true;
			releasePromise = (async () => { await jobs.catch(() => {}); released = true; unlock(); await settled; })();
			return releasePromise;
		}};
	}
	async function read(scope, options) {
		const requested = requestedBodies(options);
		if (store.writable === false || isShared() && (!locks?.request || !channel?.postMessage)) {
			const pending = await readBytes(OWNER_JOURNAL_FILE), first = await readBytes(NOTES_INDEX_FILE), index = parseIndex(first == null ? null : decode(first));
			if (pending != null || index.transaction || index.deletions && Object.keys(index.deletions).length) throw fail('read-only', 'This notes folder needs ' + (notesHostWords().native ? 'Web Locks' : 'a browser with Web Locks') + ' to finish a pending operation.');
			const listing = await store.list(), files = listing.filter(isNoteFile).sort(), bodies = await readBodies(files, requested);
			if (!equal(first, await readBytes(NOTES_INDEX_FILE)) || !equal(pending, await readBytes(OWNER_JOURNAL_FILE))) throw fail('busy', 'The notes folder is changing. Try opening it again.');
			return {index: reconcile(index, files).index, files, listing, bodies, generation: folderGeneration(index), readOnly: true, notice: null};
		}
		let lease;
		try { lease = await acquire(scope); } catch (error) { if (error?.code === 'read-only' && store.writable === false) return read(scope, {bodies: requested}); throw error; }
		try { return await lease.read({bodies: requested}); } finally { await lease.release(); }
	}
	async function readImportReceipt(scope, id) {
		if (store.writable === false || isShared() && (!locks?.request || !channel?.postMessage)) {
			const first = await readBytes(NOTES_INDEX_FILE), pending = await readBytes(OWNER_JOURNAL_FILE);
			const snapshot = await read(scope), held = await receiptFrom(snapshot.index, id);
			if (!equal(first, await readBytes(NOTES_INDEX_FILE)) || !equal(pending, await readBytes(OWNER_JOURNAL_FILE)))
				throw fail('busy', 'The folder changed while its import receipt was read. Try again.');
			return held;
		}
		let lease;
		try { lease = await acquire(scope); } catch (error) { if (error?.code === 'read-only' && store.writable === false) return readImportReceipt(scope, id); throw error; }
		try { return await lease.readImportReceipt(id); } finally { await lease.release(); }
	}
	return {get incarnation() { return incarnation; }, acquire, read, readImportReceipt, transact: async (scope, plan, options) => { const lease = await acquire(scope); try { return await lease.transact(plan, options); } finally { await lease.release(); } }, close: () => { closed = true; channel?.removeEventListener?.('message', receive); }};
}

