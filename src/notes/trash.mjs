import {expiredTrash, trashEvidence, isNoteFile, serializeIndex, parseIndex} from './model.mjs';
import {exactBytes, sha256} from './integrity.mjs';
import {manifestName} from './history.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const fail = (code, message) => Object.assign(new Error(message), {code});
const hex = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const validTime = value => Number.isSafeInteger(value) && value >= 0;
const blankResult = index => ({index, deleted: [], revived: [], missing: [], deferred: [], erased: []});
export function deletionFailure(error) {
	return {name: typeof error?.name === 'string' && error.name ? error.name : 'Error', message: String(error?.message || error),
		...(typeof error?.code === 'string' || typeof error?.code === 'number' && Number.isFinite(error.code) ? {code: error.code} : {})};
}
export function deletionRefusal(error, {pending = false} = {}) {
	const cause = deletionFailure(error), full = cause.name === 'QuotaExceededError' || cause.code === 'storage-full';
	if (!full && !pending) return error;
	const refused = fail(full ? 'storage-full' : 'delete-pending', full
		? 'Storage is full. Free some space, then try again.'
		: 'A previous deletion still needs recovery. No new deletion was started.');
	if (full) refused.name = 'QuotaExceededError';
	refused.cause = cause;
	for (const key of ['index', 'partial']) if (error?.[key] !== undefined) refused[key] = error[key];
	return refused;
}
function active(entry, digest) {
	const out = {...entry, trashed: false, archived: false};
	delete out.trashedAt; delete out.trashDigest; delete out.trashRevision;
	if (digest) out.revision = 'sha256:' + digest;
	return out;
}
function nextID(index, deviceId) {
	if (typeof deviceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(deviceId)) throw fail('identity', 'A durable device namespace is needed before deleting a note.');
	const used = new Set([...Object.values(index.notes).map(entry => entry.id), ...Object.keys(index.tombstones || {}), ...Object.values(index.tombstones || {}).flat().map(row => row.opId)]);
	let n = index.noteCounters?.[deviceId] ?? 1;
	if (!Number.isSafeInteger(n) || n < 1) throw fail('corrupt', 'The note identity counter is not readable.');
	while (used.has(deviceId + ':' + n)) n++;
	if (!Number.isSafeInteger(n + 1)) throw fail('identity', 'The note identity counter is exhausted.');
	index.noteCounters = {...index.noteCounters, [deviceId]: n + 1};
	return deviceId + ':' + n;
}
export function markTrashed(index, file, {digest, now} = {}) {
	if (!index.notes[file] || !hex(digest) || !validTime(now)) throw fail('trash', 'Trash needs the note and its verified content digest.');
	const revision = 'sha256:' + digest;
	return {...index, notes: {...index.notes, [file]: {...index.notes[file], trashed: true, archived: false, trashedAt: now, revision, trashRevision: revision, trashDigest: digest}}};
}
export function reviveTrashed(index, file, digest) {
	if (!index.notes[file] || digest !== undefined && !hex(digest)) throw fail('trash', 'A revived note needs a valid digest.');
	return {...index, notes: {...index.notes, [file]: active(index.notes[file], digest)}};
}

function committer(commitIndex) {
	if (typeof commitIndex !== 'function') throw fail('owner', 'Trash removal needs the notes folder owner.');
	return async (index, options) => {
		const result = await commitIndex(index, {...options, reconcileFiles: true});
		if (!result?.index) throw fail('owner', 'The notes owner did not return the committed sidecar.');
		return result.index;
	};
}
function verifyPending(index, opId, row) {
	if (!row || !isNoteFile(row.file) || !hex(row.digest) || typeof row.id !== 'string' || typeof row.revision !== 'string' || !row.entry || row.entry.id !== row.id || row.history !== undefined && row.history !== 'erase' || row.sync !== undefined && row.sync !== true) throw fail('corrupt', 'A pending trash operation is unreadable; its files have been kept.');
	const proof = index.tombstones?.[row.id]?.find(record => record.opId === opId);
	if (!proof || proof.file !== row.file || proof.revision !== row.revision || proof.digest !== row.digest || proof.pending !== true) throw fail('corrupt', 'The pending trash operation has no matching tombstone; its files have been kept.');
}
function alterProof(index, id, opId, change) {
	index.tombstones[id] = index.tombstones[id].map(row => row.opId === opId ? change({...row}) : row).filter(Boolean);
	if (!index.tombstones[id].length) delete index.tombstones[id];
}
const settle = (row, change) => proof => row.sync ? null : change(proof);
const HEX_NAMES = /[0-9a-f]{64}/g;
const textOf = bytes => new TextDecoder('utf-8', {fatal: false}).decode(bytes);
async function listed(store, folder) {
	try { return (await store.list(folder)).filter(name => !/^\..*\.tmp$/.test(name)); }
	catch (error) { if (error?.code === 'name') return []; throw error; }
}
async function eraseNoteHistory({store, index, noteId} = {}) {
	let own;
	try { own = 'history/' + manifestName(noteId); } catch (_) { return {erased: true, removed: []}; }
	if (Object.values(index?.notes || {}).some(entry => entry?.id === noteId)) return {erased: false, kept: 'identity', removed: []};
	const raw = await store.read(own);
	if (raw == null) return {erased: true, removed: []};
	const named = new Set(textOf(exactBytes(raw)).match(HEX_NAMES) || []), shared = new Set();
	for (const leaf of await listed(store, 'history/manifests')) {
		const path = 'history/manifests/' + leaf;
		if (path === own) continue;
		const other = await store.read(path);
		if (other == null) continue;
		for (const hash of textOf(exactBytes(other)).match(HEX_NAMES) || []) shared.add(hash);
	}
	const removed = [];
	for (const hash of [...named].filter(hash => !shared.has(hash)).sort()) {
		for (const path of ['history/texts/' + hash, 'history/blobs/' + hash]) {
			if (await store.read(path) == null) continue;
			await store.remove(path);
			if (await store.read(path) != null) throw fail('verify', 'The notes folder did not remove a history object of the deleted note. The rest of its history was kept for the next try.');
			removed.push(path);
		}
	}
	await store.remove(own);
	if (await store.read(own) != null) throw fail('verify', 'The notes folder did not remove the deleted note\'s history. It is removed on the next try.');
	removed.push(own);
	return {erased: true, removed};
}
function discardPending(index, opId) { delete index.deletions[opId]; if (!Object.keys(index.deletions).length) delete index.deletions; }
function appendOutcome(target, source) { for (const key of ['deleted', 'revived', 'missing', 'deferred', 'erased']) target[key].push(...source[key]); target.index = source.index; return target; }

export async function recoverTrash({store, index, commitIndex, clock = Date.now, keep = null} = {}) {
	const commit = committer(commitIndex), result = blankResult(index);
	try {
		for (const [opId, pending] of Object.entries(index.deletions || {})) {
			verifyPending(result.index, opId, pending);
			if (keep && keep(pending.file)) continue;
			const row = clone(pending), value = await store.read(row.file), bytes = value == null ? null : exactBytes(value);
			let next = clone(result.index);
			const current = next.notes[row.file];
			const sameEntry = current && current.id === row.id && current.revision === row.revision && current.trashed === row.entry.trashed && current.trashedAt === row.entry.trashedAt;
			const digest = bytes == null ? null : await sha256(bytes);
			if (keep && keep(row.file)) continue;
			if (bytes != null && (!sameEntry || digest !== row.digest)) {
				const entry = next.notes[row.file] || row.entry;
				next.notes[row.file] = active(entry, digest);
				alterProof(next, row.id, opId, settle(row, proof => { delete proof.pending; proof.revivedAt = clock(); return proof; }));
				discardPending(next, opId);
				result.index = await commit(next, {changed: [row.file], kind: 'trash-revive'});
				result.revived.push(row.file); continue;
			}
			if (bytes != null) await store.remove(row.file);
			if (await store.read(row.file) != null) throw fail('verify', 'The notes folder did not remove ' + row.file + '.');
			if (typeof store.removeThumbnails !== 'function') throw fail('thumbnails', 'The notes store must finish thumbnail cleanup before completing a deletion.');
			await store.removeThumbnails(row.file);
			if (row.history === 'erase') {
				const erased = await eraseNoteHistory({store, index: {notes: Object.fromEntries(Object.entries(next.notes).filter(([file]) => file !== row.file))}, noteId: row.id});
				if (erased.erased) result.erased.push(row.file);
			}
			const completedAt = clock();
			if (!validTime(completedAt)) throw fail('time', 'The deletion completion time is not readable.');
			if (current && current.id !== row.id) { next.missingFiles = {...next.missingFiles, [row.file]: {entry: current, noticedAt: completedAt}}; result.missing.push(row.file); }
			delete next.notes[row.file];
			alterProof(next, row.id, opId, settle(row, proof => { delete proof.pending; proof.deletedAt = completedAt; return proof; }));
			discardPending(next, opId);
			result.index = await commit(next, {changed: [row.file], kind: 'trash-delete'});
			result.deleted.push(row.file);
		}
		return result;
	} catch (error) { error.index = result.index; error.partial = result; throw error; }
}

export async function runTrash({store, index, files, now, deviceId, mode = 'expiry', commitIndex, clock = Date.now, keep = null, expected = null, checkpoint = null, sync = false, pressureDelete = null} = {}) {
	if (now === undefined) now = clock();
	if (!validTime(now) || !['expiry', 'confirmed'].includes(mode)) throw fail('trash', 'Trash needs a valid time and removal choice.');
	if (mode === 'confirmed' && !Array.isArray(files)) throw fail('trash', 'Confirmed deletion must name the chosen files.');
	if (pressureDelete) {
		if (Object.keys(index.deletions || {}).length) throw fail('pending', 'Finish the previous Trash operation before low-space deletion.');
		const result = blankResult(index);
		try { for (const file of [...new Set(files || Object.keys(index.notes).filter(name => index.notes[name].trashed))]) {
			let completed = null;
			const part = await runTrash({store, index: result.index, files: [file], now, deviceId, mode, clock, keep, expected, checkpoint, sync, commitIndex: async (next, options) => {
				const pending = Object.entries(next.deletions || {});
				if (options.kind === 'trash-prepare' && pending.length === 1) { completed = await pressureDelete({index: result.index, prepared: next, opId: pending[0][0], row: pending[0][1]}); return {index: completed.index}; }
				return commitIndex(next, options);
			}});
			appendOutcome(result, part); if (completed) appendOutcome(result, completed);
		}
		return result; } catch (error) { error.index = result.index; error.partial = result; throw error; }
	}
	const commit = committer(commitIndex), result = blankResult(index);
	try {
		appendOutcome(result, await recoverTrash({store, index, commitIndex, clock, keep}));
		let next = clone(result.index);
		const candidates = [...new Set(files || Object.keys(next.notes).filter(file => next.notes[file].trashed))];
		for (const file of candidates) {
			if (!isNoteFile(file)) throw fail('name', 'Trash may remove only a note in this folder.');
			let entry = next.notes[file];
			if (!entry || mode === 'expiry' && !entry.trashed) continue;
			if (keep && keep(file)) continue;
			const value = await store.read(file), bytes = value == null ? null : exactBytes(value);
			if (keep && keep(file)) continue;
			if (bytes == null) {
				next.missingFiles = {...next.missingFiles, [file]: {entry, noticedAt: now}}; delete next.notes[file]; result.missing.push(file); continue;
			}
			const digest = await sha256(bytes), evidence = trashEvidence(entry);
			const proof = expected?.get(file);
			if (expected && (!proof || entry.id !== proof.id || digest !== proof.content)) {
				next = reviveTrashed(next, file, digest); result.revived.push(file); continue;
			}
			if (mode === 'expiry' && (!evidence || !validTime(entry.trashedAt))) {
				next = markTrashed(next, file, {digest, now}); result.deferred.push({file, reason: 'A previous Trash action kept no content proof; seven days now starts from verified bytes.'}); continue;
			}
			if (mode === 'expiry' && (digest !== evidence.digest || entry.revision !== evidence.revision)) {
				next = reviveTrashed(next, file, digest); result.revived.push(file); continue;
			}
			if (mode === 'expiry' && !expiredTrash({notes: {[file]: entry}}, now).includes(file)) continue;
			if (store.assertRemovable) await store.assertRemovable(file);
			entry = {...entry, id: entry.id || nextID(next, deviceId), revision: 'sha256:' + digest};
			next.notes[file] = entry;
			const opId = nextID(next, deviceId);
			const row = {opId, file, revision: entry.revision, digest, device: deviceId, at: now, ...(checkpoint ? {checkpoint} : {}), pending: true};
			next.tombstones = {...next.tombstones, [entry.id]: [...(next.tombstones?.[entry.id] || []), row]};
			next.deletions = {...next.deletions, [opId]: {id: entry.id, file, revision: entry.revision, digest, entry: clone(entry), startedAt: now, history: 'erase', ...(sync ? {sync: true} : {})}};
		}
		if (serializeIndex(next) !== serializeIndex(result.index)) result.index = await commit(next, {changed: candidates, kind: 'trash-prepare'});
		appendOutcome(result, await recoverTrash({store, index: result.index, commitIndex, clock, keep}));
		return result;
	} catch (error) {
		if (error.partial && error.partial !== result) appendOutcome(result, error.partial);
		error.index = result.index; error.partial = result; throw error;
	}
}


export async function recoverPressureTrash({store, index, intent, commit, keep = null, live = null, admission = null} = {}) {
 const result = blankResult(index); let state = await intent.read(index);
 if (!state.record || state.record.phase === 'idle') return result;
 let row = state.record;
 if (index.deleteCheckpoint?.opId === row.opId && index.deleteCheckpoint?.baseDigest === row.baseDigest && index.deleteCheckpoint?.token === row.token) {
  await intent.retire(index, state); return result;
 }
 const base = await store.read('notes.json');
 if (base == null || await sha256(exactBytes(base)) !== row.baseDigest) throw fail('delete-pending', 'The deletion’s base metadata changed. Its record and remaining bytes were kept.');
 const matches = [];
 for (const [file, entry] of Object.entries(index.notes)) if (entry.id === row.id && await sha256(exactBytes(file)) === row.fileDigest) matches.push(file);
 if (matches.length !== 1) throw fail('delete-pending', 'The deletion identity cannot be resolved from its exact metadata.');
 const file = matches[0], held = intent.heldName(row);
 const finish = async () => {
 const checkKeep = () => { if (keep && keep(file)) throw fail('delete-pending', 'This note is open or opening. Its deletion is still pending.'); };
 checkKeep();
 let heldBytes = await intent.api.read(held);
 if (heldBytes != null && await sha256(heldBytes) !== row.digest) throw fail('delete-custody', 'The quarantined note changed. Every remaining byte was kept.');
 if (row.phase === 'admitted') {
  await intent.releaseReserve(row);
  checkKeep();
  if (heldBytes == null && live?.token === row.token) {
   const outcome = await intent.api.detach(file, {held, digest: row.digest, identity: live.identity});
   if (outcome === 'detached') heldBytes = await intent.api.read(held);
   if (heldBytes != null && await sha256(heldBytes) !== row.digest) throw fail('delete-custody', 'The detached note did not keep its admitted bytes.');
  }
  state = await intent.transition(index, state, {...row, phase: heldBytes == null ? 'cancelled' : 'detached'}); row = state.record;
 }
 let next = clone(index);
 next.noteCounters = {...next.noteCounters, [row.device]: Math.max(next.noteCounters?.[row.device] || 1, row.counter)};
 if (row.phase === 'detached') {
  checkKeep();
  if (heldBytes != null && !await intent.api.removeOwned(held, row.digest)) throw fail('delete-pending', 'The quarantined note could not be removed.');
  if (await intent.api.read(held) != null) throw fail('delete-pending', 'The quarantined note remains pending.');
  delete next.notes[file];
  const guardedHistory = {...store, remove: async path => {
   const bytes = await store.read(path); if (bytes == null) return;
   const digest = await sha256(exactBytes(bytes)); checkKeep();
   if (!await intent.api.removeOwned(path, digest)) throw fail('delete-pending', 'A history object changed. It was kept.');
  }};
  checkKeep();
  const erased = await eraseNoteHistory({store: guardedHistory, index: next, noteId: row.id});
  if (erased.erased) result.erased.push(file);
  if (!row.sync) next.tombstones = {...next.tombstones, [row.id]: [...(next.tombstones?.[row.id] || []), {opId: row.opId, file, revision: 'sha256:' + row.digest, digest: row.digest, device: row.device, at: row.at, deletedAt: row.at, ...(row.checkpoint ? {checkpoint: row.checkpoint} : {})}]};
  result.deleted.push(file);
 } else {
  next.notes[file] = active(next.notes[file]);
  result.revived.push(file);
  result.deferred.push({file, reason: 'The interrupted selection was kept. Review it before deleting again.'});
 }
 next.deleteCheckpoint = {opId: row.opId, baseDigest: row.baseDigest, token: row.token};
 const committed = await commit(next, {file, baseDigest: row.baseDigest, kind: row.phase === 'detached' ? 'trash-delete' : 'trash-defer'});
 result.index = committed.index;
 await intent.retire(result.index, state);
 return result;
 };
 return admission ? admission(file, finish) : finish();
}

export async function admitPressureTrash({store, index, prepared, opId, row, intent, commit, keep = null, baseReceipt = null, admission = null} = {}) {
 if (admission) return admission(row.file, () => admitPressureTrash({store, index, prepared, opId, row, intent, commit, keep, baseReceipt}), () => blankResult(index));
 if (keep && keep(row.file)) return blankResult(index);
 const bytes = await store.read('notes.json');
 if (bytes == null || baseReceipt == null) throw fail('delete-unarmed', 'Low-space deletion needs the existing durable index receipt.');
 if (await sha256(exactBytes(bytes)) !== await sha256(exactBytes(baseReceipt)) || serializeIndex(parseIndex(new TextDecoder('utf-8', {fatal: true}).decode(baseReceipt))) !== serializeIndex(index)) throw fail('changed', 'The folder metadata changed after the deletion was selected. Nothing was removed.');
 const observation = await intent.api.observe(row.file);
 if (keep && keep(row.file)) return blankResult(index);
 if (!observation || observation.digest !== row.digest) throw fail('changed', 'The selected note changed. Its bytes were kept.');
 const baseDigest = await sha256(exactBytes(bytes));
 const token = (await sha256(exactBytes(baseDigest + '\n' + opId))).slice(0, 32);
 if (await intent.api.read('.rapier-delete-' + token + '.held') != null) throw fail('delete-custody', 'The deletion quarantine name is already occupied. Its bytes were kept.');
 const proof = prepared.tombstones[row.id].find(value => value.opId === opId);
 const record = {baseDigest, digest: row.digest, fileDigest: await sha256(exactBytes(row.file)), id: row.id, opId, token, device: proof.device, counter: prepared.noteCounters[proof.device], at: proof.at, ...(proof.checkpoint ? {checkpoint: proof.checkpoint} : {}), ...(row.sync ? {sync: true} : {})};
 const preview = clone(index);
 preview.noteCounters = {...preview.noteCounters, [record.device]: record.counter};
 preview.folderGeneration = (index.folderGeneration || 0) + 1;
 preview.deleteCheckpoint = {opId, baseDigest, token};
 preview.ownerNotice = {generation: preview.folderGeneration, changed: [row.file], kind: 'trash-defer'};
 preview.notes[row.file] = active(preview.notes[row.file]);
 const cancelledBytes = exactBytes(serializeIndex(preview)).length;
 delete preview.notes[row.file]; preview.ownerNotice.kind = 'trash-delete';
 if (!row.sync) { const completed = {...proof, deletedAt: record.at}; delete completed.pending; preview.tombstones = {...preview.tombstones, [row.id]: [...(preview.tombstones?.[row.id] || []), completed]}; }
 const required = Math.max(cancelledBytes, exactBytes(serializeIndex(preview)).length);
 if (await sha256(exactBytes(await store.read('notes.json'))) !== baseDigest) throw fail('changed', 'The folder metadata changed before deletion admission. Nothing was removed.');
 if (keep && keep(row.file)) return blankResult(index);
 await intent.admit(index, record, required);
 return recoverPressureTrash({store, index, intent, commit, keep, live: {token, identity: observation.identity}});
}
