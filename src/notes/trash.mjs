import {expiredTrash, trashEvidence, isNoteFile, serializeIndex} from './model.mjs';
import {exactBytes, sha256} from './integrity.mjs';
import {manifestName} from './history.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const fail = (code, message) => Object.assign(new Error(message), {code});
const hex = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const validTime = value => Number.isSafeInteger(value) && value >= 0;
const blankResult = index => ({index, deleted: [], revived: [], missing: [], deferred: [], erased: []});
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

// This is only a clock query. Sync ancestry must separately prove collection safe; age alone
// never erases a tombstone or a referenced version somebody may still need to merge.
export function retentionCandidates(index, now, days = 30) {
	if (!validTime(now) || !Number.isFinite(days) || days < 0) throw fail('time', 'A retention query needs a valid time.');
	return Object.entries(index.tombstones || {}).flatMap(([id, rows]) => rows.filter(row => !row.pending && validTime(row.deletedAt) && row.deletedAt <= now - days * 86400000).map(row => ({id, opId: row.opId})));
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
	if (!row || !isNoteFile(row.file) || !hex(row.digest) || typeof row.id !== 'string' || typeof row.revision !== 'string' || !row.entry || row.entry.id !== row.id || row.history !== undefined && row.history !== 'erase') throw fail('corrupt', 'A pending trash operation is unreadable; its files have been kept.');
	const proof = index.tombstones?.[row.id]?.find(record => record.opId === opId);
	if (!proof || proof.file !== row.file || proof.revision !== row.revision || proof.digest !== row.digest || proof.pending !== true) throw fail('corrupt', 'The pending trash operation has no matching tombstone; its files have been kept.');
}
function alterProof(index, id, opId, change) {
	index.tombstones[id] = index.tombstones[id].map(row => row.opId === opId ? change({...row}) : row);
}
// Delete forever erases the note's history too. The deletion record names the note's identity and carries the erasure
// (`history: 'erase'`); a missing file or a revival never does. Under the same lease as the removal, before the
// tombstone completes: the note's own manifest goes, and with it every history object it names that no other retained
// manifest names. Another manifest is read as bytes, not parsed, so one that cannot be read still keeps every object
// whose address it spells (another note's past is never taken on a guess). Objects go first and the manifest last, so a
// stop at any point leaves the manifest naming what is still to go and the pending record resumes from it; a manifest
// already gone means the history is already erased.
const HEX_NAMES = /[0-9a-f]{64}/g;
const textOf = bytes => new TextDecoder('utf-8', {fatal: false}).decode(bytes);
async function listed(store, folder) {
	try { return (await store.list(folder)).filter(name => !/^\..*\.tmp$/.test(name)); }
	catch (error) { if (error?.code === 'name') return []; throw error; }
}
export async function eraseNoteHistory({store, index, noteId} = {}) {
	// An identity with no manifest name was never admitted, so it has no past to erase.
	let own;
	try { own = 'history/' + manifestName(noteId); } catch (_) { return {erased: true, removed: []}; }
	// A surviving note with this identity owns this past: nothing is erased.
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

// Call before folder reconciliation, while the same lease excludes every other Rapier writer.
export async function recoverTrash({store, index, commitIndex, clock = Date.now, keep = null} = {}) {
	const commit = committer(commitIndex), result = blankResult(index);
	try {
		for (const [opId, pending] of Object.entries(index.deletions || {})) {
			verifyPending(result.index, opId, pending);
			// The note open in front of the person is never removed under them: its tombstone stays pending
			// for a later open, when its bytes are weighed again.
			if (keep && keep(pending.file)) continue;
			const row = clone(pending), value = await store.read(row.file), bytes = value == null ? null : exactBytes(value);
			let next = clone(result.index);
			const current = next.notes[row.file];
			const sameEntry = current && current.id === row.id && current.revision === row.revision && current.trashed === row.entry.trashed && current.trashedAt === row.entry.trashedAt;
			const digest = bytes == null ? null : await sha256(bytes);
			// Reading and hashing can yield to an opened note. The earlier check is not authority to remove it now.
			if (keep && keep(row.file)) continue;
			if (bytes != null && (!sameEntry || digest !== row.digest)) {
				// Changed work is a revival, including a reused filename with a new identity.
				const entry = next.notes[row.file] || row.entry;
				next.notes[row.file] = active(entry, digest);
				alterProof(next, row.id, opId, proof => { delete proof.pending; proof.revivedAt = clock(); return proof; });
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
			alterProof(next, row.id, opId, proof => { delete proof.pending; proof.deletedAt = completedAt; return proof; });
			discardPending(next, opId);
			result.index = await commit(next, {changed: [row.file], kind: 'trash-delete'});
			result.deleted.push(row.file);
		}
		return result;
	} catch (error) { error.index = result.index; error.partial = result; throw error; }
}

export async function runTrash({store, index, files, now, deviceId, mode = 'expiry', commitIndex, clock = Date.now, keep = null, expected = null, checkpoint = null} = {}) {
	if (now === undefined) now = clock();
	if (!validTime(now) || !['expiry', 'confirmed'].includes(mode)) throw fail('trash', 'Trash needs a valid time and removal choice.');
	if (mode === 'confirmed' && !Array.isArray(files)) throw fail('trash', 'Confirmed deletion must name the chosen files.');
	const commit = committer(commitIndex), result = blankResult(index);
	try {
		appendOutcome(result, await recoverTrash({store, index, commitIndex, clock, keep}));
		let next = clone(result.index);
		const candidates = [...new Set(files || Object.keys(next.notes).filter(file => next.notes[file].trashed))];
		for (const file of candidates) {
			if (!isNoteFile(file)) throw fail('name', 'Trash may remove only a note in this folder.');
			let entry = next.notes[file];
			if (!entry || mode === 'expiry' && !entry.trashed) continue;
			// Do not transfer an open note, but keep the post-read check: storage can yield to a new selection.
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
			entry = {...entry, id: entry.id || nextID(next, deviceId), revision: 'sha256:' + digest};
			next.notes[file] = entry;
			const opId = nextID(next, deviceId);
			const row = {opId, file, revision: entry.revision, digest, device: deviceId, at: now, ...(checkpoint ? {checkpoint} : {}), pending: true};
			next.tombstones = {...next.tombstones, [entry.id]: [...(next.tombstones?.[entry.id] || []), row]};
			next.deletions = {...next.deletions, [opId]: {id: entry.id, file, revision: entry.revision, digest, entry: clone(entry), startedAt: now, history: 'erase'}};
		}
		if (serializeIndex(next) !== serializeIndex(result.index)) result.index = await commit(next, {changed: candidates, kind: 'trash-prepare'});
		appendOutcome(result, await recoverTrash({store, index: result.index, commitIndex, clock, keep}));
		return result;
	} catch (error) {
		if (error.partial && error.partial !== result) appendOutcome(result, error.partial);
		error.index = result.index; error.partial = result; throw error;
	}
}
