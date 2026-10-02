// Body reads are explicit: read({bodies}) loads only those notes; read(), metadata and create
// load none. Save resolves its stable id in the index, then reads that one destination. Rename
// reads its source plus `linking`; omitting `linking` deliberately scans all notes to preserve
// backlink correctness, while [] is the caller's assertion that there are no other linkers.
// Mark reads its selection. Trash reads selected confirmation proofs, then trash.mjs owns its
// candidate/recovery reads. Import builders get the listing and an empty bodies map; admission
// and recovery read only their writes. Media creation/asset writes read no notes. DiscardAudio
// must inspect every note AND the retained past of every surviving note to prove the recording is
// unreachable (Astra R87j N02), so it also reads those notes' manifests and the history objects
// their events name, deduplicated by content hash. Capture reads each captured
// file; readFile reads just its target. Import Undo reads receipt notes and surviving references,
// then removes only unchanged, proved import-owned history/media. Deliberate Undo adds no new
// history for those removed arrivals. Other transaction results carry a listing, not a body cache.
import {createOwner, OWNER_JOURNAL_FILE} from './owner.mjs';
import {SYNC_STATE_FILE, readSyncStateBytes, syncStateWrite, decodeSyncState, encodeSyncState} from './sync-state.mjs';
import {createRecordings} from './recording.mjs';
import {planAttachment, rewriteAttachmentNames, attachmentIntake, attachmentsOf, attachmentLine} from './attachments.mjs';
import {exactBytes, sha256, storedFileDigest, checkByteAbort, blobByteChunks, digestByteChunks} from './integrity.mjs';
import {NOTES_INDEX_FILE, isNoteFile, isMarkdownNote, isCodeFile, codeFileName, isAttachmentName, attachmentFileName, reconcile, noteFileName, admitIdentities, parseIndex, serializeIndex, addSection, setCollapsed} from './model.mjs';
import {recoverTrash, runTrash, markTrashed, reviveTrashed} from './trash.mjs';
import {buildLinkIndex, resolveLinkIndex, renameLinks} from './links.mjs';
import {inspectTextConflicts, mapTextConflictVariants} from './merge.mjs';
import {importUndoReadiness, planImportUndo, recordImportUndo, importUndoSections} from './import-receipt.mjs';
import {validRecordingName, recordingName, audioMime, rewriteRecordingNames, recordingsOf} from './audio.mjs';
import {manifestName, parseManifest, materialize} from './history.mjs';
import {applyReminderActions} from './model.mjs';
import {restoreSnapshot as planSnapshot, restoreSnapshotStream as planSnapshotStream} from './restore.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (code, message) => Object.assign(new Error(message), {code});
const decode = bytes => new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
const digest = value => value == null ? null : sha256(value);
const reserved = new Set(['folderGeneration', 'folderDeviceId', 'ownerNotice', 'transaction', 'noteCounters', 'deletions', 'tombstones', 'assetTombstones', 'assetRevivals', 'missingFiles']);

// Rebase only requested fields. A stale whole sidecar is never a replacement plan.
export function applyMetadata(base, wanted, fresh) {
	const out = copy(fresh);
	const merge = (before, after, now, path = []) => {
		if (eq(before, after)) return now;
		if (path.length === 1 && reserved.has(path[0])) return now;
		if (path.length === 2 && path[0] === 'notes' && (!before || !after || !now || before.id !== now.id)) throw fail('changed', 'This note changed or moved. Open the cards again before changing it.');
		if (path.length === 1 && path[0] === 'sections' && Array.isArray(before) && Array.isArray(after) && before.every(row => after.some(n => eq(n, row)))) {
			const rows = copy(now || []);
			for (const row of after) if (!before.some(n => eq(n, row))) {
				const present = rows.find(n => n.name === row.name);
				if (present && !eq(row, present)) throw fail('changed', 'This section changed in another page. Open the cards again.');
				if (!present) rows.push(copy(row));
			}
			return rows;
		}
		if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
			const result = now && typeof now === 'object' ? copy(now) : {};
			for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
				if (['__proto__', 'constructor', 'prototype'].includes(key)) { if (!eq(before[key], after[key])) throw fail('plan', 'This metadata key cannot be changed here.'); continue; }
				const value = merge(before[key], after[key], now?.[key], [...path, key]);
				if (value === undefined) delete result[key]; else result[key] = value;
			}
			return result;
		}
		if (!eq(now, before) && !eq(now, after)) throw fail('changed', 'This choice changed in another page. Open the cards again before changing it.');
		return after === undefined ? undefined : copy(after);
	};
	return merge(base, wanted, out);
}

// Both local Rename and Sync use this owner plan: destination first, guarded links, source last.
export async function planFolderRename({index, files, bodies}, {file, id, expectedDigest, wanted, linking, ascii = false, now = Date.now()} = {}) {
	let dropped = 0, patched = 0;
	if (linking === undefined && files.some(name => !bodies.has(name))) throw fail('changed', 'The folder gained a note while its links were being checked. Try renaming again.');
	if (!bodies.has(file) || index.notes[file]?.id !== id || await digest(bodies.get(file)) !== expectedDigest) throw fail('changed', 'The note changed before it could be renamed. Its words and name were kept.');
	if (wanted === file) return {index, file, patched: 0, dropped: 0};
	const names = files;
	// A code file stays code under its new name (its extension kept unless another code type is named), and
	// its bytes are never a link source; a note stays Markdown.
	const code = isCodeFile(file), fits = code ? isCodeFile(wanted) : isMarkdownNote(wanted);
	const destination = fits && !names.some(name => name !== file && name.normalize('NFC').toLowerCase() === wanted.normalize('NFC').toLowerCase()) && !(ascii && /[^\x00-\x7f]/.test(wanted)) ? wanted
		: code ? codeFileName(wanted.replace(/\.[A-Za-z0-9]+$/, '') + file.slice(file.lastIndexOf('.')), names.filter(name => name !== file), {ascii}) : noteFileName(wanted.replace(/\.md$/i, ''), names, {ascii});
	if (!destination) throw fail('name', 'That name cannot hold this file. Its words and name were kept.');
	if (destination === file) return {index, file, patched: 0, dropped: 0};
	const texts = new Map();
	for (const [name, bytes] of bodies) if (isMarkdownNote(name)) try { texts.set(name, decode(bytes)); } catch (_) { dropped++; }
	const variantPatches = new Map();
	for (const [name, text] of texts) {
		const changed = mapTextConflictVariants(text, variant => {
			const source = new Map([[name, variant]]), links = buildLinkIndex(source);
			links.files = new Set(files); resolveLinkIndex(links);
			return renameLinks(links, source, file, destination)[0]?.text ?? variant;
		});
		if (changed === text) continue;
		texts.set(name, changed); variantPatches.set(name, {file: name, text: changed});
		// An unresolved choice keeps its custody while its links follow a rename.
		// Rebind only a descriptor that already proves the exact old alternatives.
		const before = inspectTextConflicts(text, {nested: true}), after = inspectTextConflicts(changed, {nested: true});
		for (let i = 0; i < before.length; i++) {
			const blockHash = await sha256(exactBytes(before[i].block));
			const variants = await Promise.all(before[i].variants.map(async value => ({device: value.device, content: await sha256(exactBytes(value.text))})));
			for (const record of index.conflicts || []) if (record.path?.[0] === 'notes' && record.path[1] === index.notes[name]?.id && record.path[2] === 'text' && record.blockHash === blockHash &&
				Array.isArray(record.variants) && record.variants.length === variants.length && record.variants.every((value, i) => value.device === variants[i].device && value.content === variants[i].content)) {
				record.blockHash = await sha256(exactBytes(after[i].block));
				record.variants = await Promise.all(after[i].variants.map(async value => ({device: value.device, content: await sha256(exactBytes(value.text))})));
			}
		}
	}
	// Unread names can still make a case-folded path ambiguous or shadow an alias.
	// Resolve the selected texts against the full listing, without loading its bodies.
	const links = buildLinkIndex(texts); links.files = new Set(files); resolveLinkIndex(links);
	// The words land under the new name first, then every note that links to the old one is
	// rewritten; a linking note that changed under its patch is kept as it is and reported.
	const patches = [...new Map([...variantPatches, ...renameLinks(links, texts, file, destination).map(patch => [patch.file, patch])]).values()];
	// The source moves too: its self-links belong in the verified destination bytes, not
	// in a second write to the old name that the same transaction is about to remove.
	const self = patches.find(patch => patch.file === file), body = self ? exactBytes(self.text) : bodies.get(file);
	const caseOnly = destination.normalize('NFC').toLowerCase() === file.normalize('NFC').toLowerCase();
	const writes = [{file: destination, bytes: body, createOnly: true, ...(caseOnly ? {caseSource: file} : {})}];
	for (const patch of patches) {
		if (patch.file === file) continue;
		const bytes = exactBytes(patch.text); writes.push({file: patch.file, bytes, expectedDigest: await sha256(bodies.get(patch.file)), requires: destination});
		index.notes[patch.file].revision = 'sha256:' + await sha256(bytes); index.notes[patch.file].modified = now;
	}
	patched = writes.length - 1;
	index.notes[destination] = {...index.notes[file], revision: 'sha256:' + await sha256(body)}; delete index.notes[file];
	return {kind: 'rename', index, file: destination, patched, dropped, writes, removes: [{file, expectedDigest, requires: destination}]};
}

// Operation planners for the existing owner, not another lock or journal.
export function createFolder({store, scope = 'notes', locks, channel, shared = true, timeoutMs = 1500, onInvalidate, keep = null, clock = Date.now, namespace = () => crypto.randomUUID().replace(/-/g, '')} = {}) {
	// Asked, not frozen: `shared` may be a function, for a byte store that only learns whether its
	// bytes reach another page once it has asked the browser (notes/owner.mjs's own note).
	const isShared = () => typeof shared === 'function' ? !!shared() : !!shared;
	let deviceId = '';
	const identify = index => {
		deviceId = index.folderDeviceId || namespace();
		index.folderDeviceId = deviceId;
		admitIdentities(index, deviceId);
		return index;
	};
	const owner = createOwner({store, locks, channel, shared, timeoutMs, clock, onInvalidate, recover: async args => {
		// The open-note guard belongs to the folder, including ordinary reads and crash recovery.
		const repaired = await recoverTrash({...args, clock, keep});
		const names = [...new Set([...Object.keys(repaired.index.notes), ...(await store.list()).filter(isNoteFile)])];
		const index = identify(reconcile(copy(repaired.index), names).index);
		if (serializeIndex(index) !== serializeIndex(repaired.index)) return args.commitIndex(index, {kind: 'identity', reconcileFiles: true});
		return {index};
	}});
	// Transactions in flight, for the shell's facts: a witness's settle() waits for zero.
	let pending = 0;
	const tracked = async job => { pending++; try { return await job(); } finally { pending--; } };
	const underLease = job => tracked(async () => {
		const lease = await owner.acquire(scope);
		try { return await job(lease); } finally { await lease.release(); }
	});
	const owned = job => underLease(async lease => job(lease, await lease.read()));
	const createEntry = (index, name, extra = {}) => {
		const next = reconcile(index, [...Object.keys(index.notes), name]).index;
		next.notes[name] = {...next.notes[name], ...extra};
		// Identities are the owner's to give -- except the one a restored note arrives with, which its
		// past is keyed by (notes/restore.mjs has already moved any that this folder holds).
		const arrived = typeof extra.id === 'string' && extra.id && !Object.entries(next.notes).some(([other, entry]) => other !== name && entry.id === extra.id);
		if (!arrived) delete next.notes[name].id;
		identify(next);
		return next;
	};
	const available = (wanted, text, names) => {
		const taken = new Set(names.map(n => n.toLowerCase()));
		if (isNoteFile(wanted) && !taken.has(wanted.toLowerCase()) && !(store.ascii && /[^\x00-\x7f]/.test(wanted))) return wanted;
		// A code file is named by the person, never by its first line: a taken name numbers the stem.
		if (isCodeFile(wanted)) { const name = codeFileName(wanted, names, {ascii: store.ascii}); if (name) return name; }
		return noteFileName(text, names, {ascii: store.ascii});
	};
	const read = async options => { const snapshot = await owner.read(scope, options); if (snapshot?.index) identify(snapshot.index);
		return {...snapshot, recordings: await recordingCustody.recover({snapshot})}; };
	const rebuildIndex = backup => tracked(async () => {
		const lease = await owner.acquire(scope);
		try { return await lease.rebuildIndex(backup); } finally { await lease.release(); }
	});
	// Renew the writer, not the notes: existing IDs still identify their history and peers.
	// A metadata-only transaction across both owner-managed files -- folderDeviceId lives in
	// notes.json, the checkpoint in .rapier-sync.json -- committed under the one lease so a
	// racing page can never observe one renewed without the other.
	const leaveVault = () => owned(async lease => {
		let renewed;
		const snapshot = await lease.transact(async ({index}) => {
			const {bytes} = await readSyncStateBytes(store);
			renewed = crypto.randomUUID().replace(/-/g, '');
			index.folderDeviceId = renewed;
			return {kind: 'sync-leave', index, writes: [await syncStateWrite({}, bytes)]};
		}, {brief: true});
		deviceId = renewed;
		return snapshot;
	});
	const metadata = (base, wanted) => tracked(() => owner.transact(scope, ({index}) => ({kind: 'metadata', index: applyMetadata(base, wanted, index)})));
	const reminderActions = actions => tracked(() => owner.transact(scope, ({index}) => ({kind: 'reminder-actions', index: applyReminderActions(index, actions)})));
	const createOwned = async (lease, text, wanted, extra = {}, request, media = null) => {
		let file;
		const snapshot = await lease.transact(({index, files}) => {
			if (request) { const kept = Object.keys(index.notes).find(name => index.notes[name].createdByRequest === request); if (kept) { file = kept; return {index}; } }
			file = available(wanted, text, files);
			const now = clock(), next = createEntry(media ? reviveMedia(index, media.path, media.digest) : index, file, {created: now, modified: now, ...extra, ...(request ? {createdByRequest: request} : {})});
			return {kind: 'create', index: next, writes: [{file, bytes: exactBytes(text), createOnly: true}]};
		});
		// Recovery may have put these new words beside a late competing file. A successful
		// create must open that kept note, never the stranger under the originally chosen name.
		file = snapshot.kept?.find(row => row.file === file)?.name || file;
		return {...snapshot, file};
	};
	const create = (text, wanted, extra = {}, request) => owned(lease => createOwned(lease, text, wanted, extra, request));
	// The native inbox keeps the original until this method returns. A renderer can stop after
	// the streamed attachment commits but before the note journal exists, so its name comes from
	// the immutable request, not the free-name allocator. Replay verifies and reuses that one copy.
	const createShared = (entry, blob) => underLease(async lease => {
		if (!entry || typeof entry.id !== 'string' || !/^[A-Za-z0-9:_-]{1,160}$/.test(entry.id) ||
			typeof entry.name !== 'string' || typeof entry.mime !== 'string' || entry.caption !== undefined && typeof entry.caption !== 'string' || !Number.isSafeInteger(entry.size) || entry.size < 0 ||
			!/^[a-f0-9]{64}$/.test(entry.digest) || !(blob instanceof Blob) || blob.size !== entry.size)
			throw fail('share', 'The shared file has no complete byte receipt. Its staged original was kept.');
		const textFile = entry.mime.startsWith('text/'), image = entry.mime.startsWith('image/'), caption = entry.caption || '';
		if (!textFile && !image && entry.mime !== 'application/pdf' && entry.mime !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
			throw fail('share', 'This shared file type cannot be opened as a note. Its staged original was kept.');
		const request = 'native-share:' + entry.id, before = await lease.read();
		const kept = Object.keys(before.index.notes).find(file => before.index.notes[file].createdByRequest === request);
		if (kept) {
			if (before.index.notes[kept].sharedDigest !== entry.digest) throw fail('share', 'This shared item changed after it was kept. Both copies were kept.');
			return {...before, file: kept};
		}
		const decision = attachmentIntake([{name: entry.name, size: entry.size}], {streaming: store.streamingAttachments === true});
		if (decision.refusal) throw fail('size', decision.refusal);
		if (await digestByteChunks(blobByteChunks(blob), {size: entry.size}) !== entry.digest)
			throw fail('verify', 'The shared file did not arrive whole. Its staged original was kept.');
		let text, media = null;
		// A caption accompanies the original rather than changing its authored text bytes.
		// Captioned text files therefore use the same original-file link as other attachments.
		if (textFile && !caption) text = decode(new Uint8Array(await blob.arrayBuffer()));
		else {
			if (!store.streamingAttachments || typeof store.writeBlob !== 'function') throw fail('storage', 'This folder cannot keep a shared file. Its staged original was kept.');
			const name = attachmentFileName('share-' + await sha256(request) + '-' + entry.name, [], {ascii: store.ascii});
			media = {path: 'attachments/' + name, digest: entry.digest};
			const existing = await storedFileDigest(store, media.path);
			if (existing !== null && existing !== entry.digest) throw fail('collision', 'The shared file destination changed. Both copies were kept.');
			if (existing === null) {
				const proof = await store.writeBlob(media.path, blob);
				if (proof.size !== entry.size || proof.digest !== entry.digest) throw fail('verify', 'The shared file copy could not be verified. Its staged original was kept.');
			}
			text = (caption ? caption + '\n\n' : '') + attachmentLine({name, label: entry.name}) + '\n';
		}
		const wanted = noteFileName(entry.name.replace(/\.[^.]*$/, ''), [], {ascii: store.ascii});
		return createOwned(lease, text, wanted, {sharedDigest: entry.digest}, request, media);
	});
	// A save reads the sidecar once, inside its own transaction (Lane F): the note is located by id in the
	// transaction's fresh index and its body read there, not in a whole read before the transaction.
	const save = ({file, id, expectedDigest, text, preserveConflict = true}) => underLease(async lease => {
		const bytes = exactBytes(text), nextDigest = await sha256(bytes);
		const locate = index => {
			const matches = id ? Object.keys(index.notes).filter(n => index.notes[n].id === id) : [];
			return matches.length === 1 ? matches[0] : !id && index.notes[file] ? file : null;
		};
		let destination = null, copied = false;
		const admitted = Array.isArray(expectedDigest) ? expectedDigest : [expectedDigest];
		const snapshot = await lease.transact(async ({index, files, readBodies}) => {
			destination = locate(index);
			const bodies = destination ? await readBodies([destination]) : new Map();
			const before = destination ? bodies.get(destination) : null, actual = await digest(before);
			const stale = !destination || !admitted.includes(actual);
			if (stale && !(destination && actual === nextDigest)) {
				if (!preserveConflict) throw fail('changed', 'The note changed since this edit was prepared. Its newer words were kept.');
				// A stale code file is kept beside the newer one as code: "script kept.py".
				const ext = isCodeFile(file) ? file.slice(file.lastIndexOf('.')) : '', stem = (ext ? file.slice(0, -ext.length) : file.replace(/\.md$/i, '')) + ' kept';
				destination = (ext && codeFileName(stem + ext, files, {ascii: store.ascii})) || noteFileName(stem, files, {ascii: store.ascii}); copied = true;
				index = createEntry(index, destination, {created: clock(), modified: clock(), keptFrom: {file, ...(id ? {id} : {}), digest: admitted[0]}});
			} else if (index.notes[destination].trashed) index = reviveTrashed(index, destination, nextDigest);
			index.notes[destination].revision = 'sha256:' + nextDigest; index.notes[destination].modified = clock();
			return {kind: copied ? 'keep-both' : 'save', index, writes: [{file: destination, bytes, ...(copied ? {createOnly: true} : {expectedDigest: actual})}]};
		}, {bodies: []});
		if (snapshot.dropped?.includes(destination)) throw fail('changed', 'The note changed while it was being saved. The other change was kept; this save did not finish.');
		return {...snapshot, file: destination, copied, digest: nextDigest, id: snapshot.index.notes[destination].id};
	});
	const rename = ({file, id, expectedDigest, wanted, linking}) => owned(async (lease, before) => {
		if (linking !== undefined && !Array.isArray(linking)) throw fail('plan', 'A rename needs a list of linking notes.');
		let destination, dropped = 0, patched = 0;
		const snapshot = await lease.transact(async ({index, files, bodies}) => {
			const plan = await planFolderRename({index, files, bodies}, {file, id, expectedDigest, wanted, linking, ascii: store.ascii, now: clock()});
			destination = plan.file; dropped = plan.dropped; patched = plan.patched;
			return plan;
		}, {bodies: linking === undefined ? before.files : [file, ...linking]});
		if ((snapshot.dropped || []).includes(destination) || (snapshot.dropped || []).includes(file)) throw fail('changed', 'The rename could not finish because a file changed. Open the cards again; no changed file was replaced.');
		const late = (snapshot.dropped || []).filter(name => name !== destination && name !== file).length;
		return {...snapshot, file: destination, written: patched - late, dropped: dropped + late};
	});
	const trash = ({files, mode = 'expiry', expected = null} = {}) => owned(async (lease, before) => {
		if (expected) {
			if (!Array.isArray(files)) throw fail('trash', 'Confirmed deletion must name the chosen files.');
			before = await lease.read({bodies: files});
			for (const file of files) {
				const proof = expected.get(file), entry = before.index.notes[file];
				if (!proof || !entry || entry.id !== proof.id || entry.trashed !== proof.trashed || await digest(before.bodies.get(file)) !== proof.digest) throw fail('changed', 'A selected note changed. It was kept; review it before deleting.');
			}
		}
		// Admission's proof must survive the later body read, not just the first validation.
		const admitted = expected && new Map([...expected].map(([file, proof]) => [file, {id: proof.id, content: proof.digest}]));
		const result = await runTrash({store, index: before.index, files, mode, expected: admitted, deviceId, commitIndex: lease.commitIndex, now: clock(), clock, keep, checkpoint: (await readSyncStateBytes(store)).state.head?._key || null});
		return {...await lease.read(), result};
	});
	const discardEmpty = ({file, id, expectedDigest}) => owned(async lease => {
		const snapshot = await lease.transact(async ({index, bodies}) => {
			const bytes = bodies.get(file);
			if (!bytes || index.notes[file]?.id !== id || await sha256(bytes) !== expectedDigest || decode(bytes).trim()) throw fail('changed', 'This note is no longer the empty note being discarded. Its words were kept.');
			delete index.notes[file];
			return {kind: 'discard-empty', index, removes: [{file, expectedDigest}]};
		}, {bodies: [file]});
		if (snapshot.files.includes(file)) throw fail('changed', 'This note changed while its empty copy was being discarded. Its words were kept.');
		return snapshot;
	});
	const mark = (files, expected) => owner.transact(scope, async ({index, bodies}) => {
		for (const file of files) { if (!bodies.has(file) || expected && expected.get(file) !== index.notes[file]?.id) throw fail('changed', 'A selected note moved. Open the cards again.'); index = markTrashed(index, file, {digest: await sha256(bodies.get(file)), now: clock()}); }
		return {kind: 'trash', index};
	}, {bodies: files});
	const audioName = (note, mime, wanted, names) => {
		const taken = new Set(names.map(n => n.toLowerCase()));
		if (validRecordingName(wanted) && !taken.has(wanted.toLowerCase()) && !(store.ascii && /[^\x00-\x7f]/.test(wanted))) return wanted;
		if (store.ascii) note = noteFileName(note.replace(/\.md$/i, ''), [], {ascii: true});
		if (!wanted || audioMime(mime, wanted)) return recordingName(note, names, mime);
		const dot = wanted.lastIndexOf('.'), stem = wanted.slice(0, dot > 0 ? dot : wanted.length).replace(/[^a-z0-9 ._-]/gi, '_') || 'recording', ext = dot > 0 ? wanted.slice(dot).replace(/[^a-z0-9.]/gi, '_') : '';
		let n = 1, name; do { name = stem + ' ' + n++ + ext; } while (taken.has(name.toLowerCase())); return name;
	};
	// The person's explicit recreation of a deleted file survives its earlier deletion. Keep
	// operation acknowledgements in the same transaction as the newly owned bytes.
	const reviveMedia = (index, file, content) => {
		const same = value => value.normalize('NFC').toLowerCase();
		const past = index.assetTombstones || {};
		const revivals = new Set(index.assetRevivals || []);
		for (const [id, row] of Object.entries(past)) if (row.content === content && (same(row.file) === same(file) || same(row.source) === same(file))) revivals.add(id);
		if (revivals.size) index.assetRevivals = [...revivals].sort();
		return index;
	};
	const createAudio = (note, mime, bytes, wanted = '', {exact = false} = {}) => owned(async lease => {
		const name = audioName(note, mime, wanted, await store.list('audio'));
		if (exact && name !== wanted) throw fail('collision', 'The planned recording name is not available in this folder: ' + wanted + '. This recording was not written. Keep the backup and retry Import.');
		const path = 'audio/' + name, content = await digest(bytes);
		const snapshot = await lease.transact(({index}) => ({kind: 'recording', index: reviveMedia(index, path, content), writes: [{file: path, bytes, createOnly: true}]}));
		const rescued = snapshot.kept?.find(row => row.file === path), landed = rescued?.name || path;
		if (snapshot.dropped?.includes(path) && !rescued || await digest(await store.read(landed)) !== content)
			throw fail('verify', 'The recording copy could not be verified. Keep the original and retry saving.');
		if (exact && rescued) throw fail('collision', 'Another recording arrived under ' + wanted + '. Your recording was kept as ' + landed.slice(6) + '; retry Import.');
		return {...snapshot, name: landed.slice(6)};
	});
	const keepAttachment = async (lease, wanted, bytes, {exact = false, signal, onProgress} = {}) => {
		if (bytes instanceof Blob) {
			const decision = attachmentIntake([{name: wanted, size: bytes.size}], {streaming: store.streamingAttachments === true});
			if (decision.refusal) throw fail('size', decision.refusal);
			if (!store.streamingAttachments || typeof store.writeBlob !== 'function') throw fail('storage', 'This store cannot keep a streamed file. Keep the original and open Notes with persistent storage.');
			checkByteAbort(signal);
			const name = attachmentFileName(wanted, await store.list('attachments'), {ascii: store.ascii});
			if (exact && name !== wanted) throw fail('collision', 'The attachment name is already in use: ' + wanted + '. Its file was kept.');
			const proof = await store.writeBlob('attachments/' + name, bytes, {signal, onProgress});
			// The complete, read-back-verified file now owns its name. Only metadata goes into
			// the journal; a failed note edit later keeps this complete file in Saved files.
			try {
				const snapshot = await lease.transact(({index}) => ({kind: 'attachment', index: reviveMedia(index, 'attachments/' + name, proof.digest)}));
				return {...snapshot, name, proof};
			} catch (error) { throw Object.assign(new Error(name + ' was completely copied and remains in Saved files, but the library could not be refreshed. No link was added.'), {cause: error, keptName: name}); }
		}
		const plan = planAttachment(wanted, exactBytes(bytes), await store.list('attachments'), {ascii: store.ascii});
		if (exact && plan.name !== wanted) throw fail('collision', 'The attachment name is already in use: ' + wanted + '. Nothing replaced it; keep the source and retry Import.');
		const snapshot = await lease.transact(async ({index}) => ({kind: 'attachment', index: reviveMedia(index, plan.path, await digest(plan.bytes)), writes: [{file: plan.path, bytes: plan.bytes, createOnly: true}]}));
		const rescued = snapshot.kept?.find(row => row.file === plan.path);
		const path = rescued?.name || plan.path;
		if (snapshot.dropped?.includes(plan.path) && !rescued || await digest(await store.read(path)) !== await digest(plan.bytes))
			throw fail('verify', 'The attachment copy could not be verified. Keep the original; check Saved files before trying again.');
		if (exact && rescued) throw fail('collision', 'Another file arrived under ' + wanted + '. Your copy was kept as ' + path.slice(12) + ' in Saved files. No note was linked to the competing file. Retry Import.');
		return {...snapshot, name: path.slice(12)};
	};
	const createAttachment = (wanted, bytes, options) => owned(lease => keepAttachment(lease, wanted, bytes, options));
	const emptyReferences = () => ({live: [], trash: [], history: []});
	// Every note -- live and in Trash -- and every retained version, read once for both kinds of
	// sibling file a note links: its attachments and its recordings. Saved files lists both from the
	// one pass; each deletion review takes its own kind. `lengths` is the length a line names for
	// each recording, the notes before their past: a recorder's WebM carries none of its own.
	const scanReferences = async (before, {signal} = {}) => {
		const refs = {attachments: new Map(), recordings: new Map(), lengths: new Map()}, add = (which, name, kind, row) => {
			const map = refs[which]; if (!map.has(name)) map.set(name, emptyReferences()); map.get(name)[kind].push(row);
		};
		const count = rows => { const names = new Map(); for (const row of rows) names.set(row.name, (names.get(row.name) || 0) + 1); return names; };
		const namesIn = text => { const recordings = recordingsOf(text); return {attachments: count(attachmentsOf(text)), recordings: count(recordings), lengths: recordings.filter(row => row.duration != null).map(row => [row.name, row.duration])}; };
		const measure = names => { for (const [name, seconds] of names.lengths) if (!refs.lengths.has(name)) refs.lengths.set(name, seconds); };
		for (const file of before.files.slice().sort()) {
			if (isCodeFile(file)) continue;
			checkByteAbort(signal); const bytes = await store.read(file);
			if (bytes === null) throw fail('changed', file + ' disappeared while file references were checked. No file was deleted.');
			let text;
			try { text = decode(bytes); } catch (_) { throw fail('unreadable', file + ' could not be read. File references are incomplete; no file was deleted.'); }
			const kind = before.index.notes[file]?.trashed === true ? 'trash' : 'live', names = namesIn(text);
			for (const which of ['attachments', 'recordings']) for (const [name, n] of names[which]) add(which, name, kind, {file, count: n});
			measure(names);
		}
		// Every surviving manifest counts, including the past of a note no longer in the
		// live index. Cache reference names, not reconstructed note bodies, by verified hash.
		const checked = new Map();
		for (const leaf of (await store.list('history/manifests')).filter(name => !/^\..*\.tmp$/.test(name)).sort()) {
			checkByteAbort(signal);
			const id = leaf.replace(/\.json$/, '').replace('!', ':'); let manifest;
			try {
				if (manifestName(id) !== 'manifests/' + leaf) throw new Error('unrecognised manifest name');
				const raw = await store.read('history/manifests/' + leaf); if (raw === null) throw new Error('missing manifest');
				manifest = parseManifest(raw, {noteId: id, now: clock()});
			} catch (error) { throw fail('unreadable', 'Retained history ' + leaf + ' could not be checked. No file was deleted.'); }
			for (const version of manifest.versions) {
				if (isCodeFile(version.file)) continue;
				checkByteAbort(signal);
				const key = version.hash + JSON.stringify(manifest.objects[version.hash]);
				let names = checked.get(key);
				if (!names) {
					try { const past = await materialize(manifest, version.id, path => store.read('history/' + path)); names = namesIn(past.text); }
					catch (error) { throw fail('unreadable', 'Retained version ' + version.id + ' of ' + version.file + ' could not be verified. No file was deleted.'); }
					checked.set(key, names);
				}
				for (const which of ['attachments', 'recordings']) for (const [name, n] of names[which]) add(which, name, 'history', {file: version.file, noteId: id, version: version.id, time: version.time, count: n});
				measure(names);
			}
		}
		return refs;
	};
	const attachmentReferences = options => owned(async (lease, before) => (await scanReferences(before, options)).attachments);
	const fileReferences = options => owned((lease, before) => scanReferences(before, options));
	const deletionReview = async (name, before, options = {}) => {
		if (!isAttachmentName(name)) throw fail('name', 'This is not a saved attachment name.');
		const stat = await store.stat('attachments/' + name);
		if (!stat) throw fail('missing', name + ' is no longer in Saved files.');
		const refs = (await scanReferences(before, options)).attachments.get(name) || emptyReferences();
		const digest = await storedFileDigest(store, 'attachments/' + name, options);
		if (digest === null || (await store.stat('attachments/' + name))?.size !== stat.size) throw fail('changed', 'The file changed while it was checked. Nothing was deleted.');
		return {name, size: stat.size, digest, ...refs};
	};
	const reviewAttachmentDeletion = (name, options) => owned((lease, before) => deletionReview(name, before, options));
	const forgetMedia = async (index, path, content) => {
		const previous = (await readSyncStateBytes(store)).state.head?.assets?.[path], source = previous?.content === content ? previous.source : path;
		const opId = deviceId + ':' + crypto.randomUUID();
		index.assetTombstones = {...index.assetTombstones, [opId]: {opId, file: path, source, content, device: deviceId, at: clock()}};
		return index;
	};

	const deleteAttachment = (reviewed, {confirmed = false, signal} = {}) => {
		if (confirmed !== true) return Promise.reject(fail('confirmation', 'Deleting a file forever needs its explicit confirmation. Nothing was deleted.'));
		return owned(async (lease, before) => {
			const current = await deletionReview(reviewed?.name, before, {signal});
			if (!eq(current, reviewed)) throw fail('changed', 'This file or the places that name it changed. Review Delete forever again; nothing was deleted.');
			checkByteAbort(signal);
			const snapshot = await lease.transact(async ({index}) => ({kind: 'attachment-delete', index: await forgetMedia(index, 'attachments/' + current.name, current.digest), removes: [{file: 'attachments/' + current.name, expectedDigest: current.digest}]}));
			if (snapshot.dropped?.includes('attachments/' + current.name) || await store.stat('attachments/' + current.name) !== null)
				throw fail('changed', 'The file changed, so it was not deleted.');
			return {...snapshot, name: current.name};
		});
	};

	// Saved files lists recordings too (task #366), so nothing under audio/ is hidden from the person,
	// and deletes one forever only as the person's explicit decision about that one file: its review
	// names every note and every retained version that plays it; it refuses while a note -- live or in
	// Trash -- still uses it (R85b, d03: a note's recording is never taken from under it); otherwise
	// it removes just the file, once the person has been shown which retained versions will lose it.
	// This is not a reachability sweep: discardAudio (below) stays the one owner of every implicit
	// discard, and still keeps whatever a retained version plays.
	const recordingReview = async (name, before, options = {}) => {
		if (!validRecordingName(name)) throw fail('name', 'This recording name is not a sibling file.');
		const path = 'audio/' + name, stat = await store.stat(path);
		if (!stat) throw fail('missing', name + ' is no longer in the notes folder.');
		const refs = (await scanReferences(before, options)).recordings.get(name) || emptyReferences();
		const digest = await storedFileDigest(store, path, options);
		if (digest === null || (await store.stat(path))?.size !== stat.size) throw fail('changed', 'The recording changed while it was checked. Nothing was deleted.');
		return {name, size: stat.size, digest, ...refs};
	};
	const reviewRecordingDeletion = (name, options) => owned((lease, before) => recordingReview(name, before, options));
	const deleteRecording = (reviewed, {confirmed = false, signal} = {}) => {
		if (confirmed !== true) return Promise.reject(fail('confirmation', 'Deleting a recording forever needs its explicit confirmation. Nothing was deleted.'));
		return owned(async (lease, before) => {
			const current = await recordingReview(reviewed?.name, before, {signal});
			if (current.live.length || current.trash.length) throw fail('referenced', 'A note still uses this recording. It was kept.');
			if (!eq(current, reviewed)) throw fail('changed', 'This recording or the places that play it changed. Review Delete forever again; nothing was deleted.');
			checkByteAbort(signal);
			const path = 'audio/' + current.name;
			const snapshot = await lease.transact(async ({index}) => ({kind: 'discard-recording', index: await forgetMedia(index, path, current.digest), removes: [{file: path, expectedDigest: current.digest}]}));
			if (snapshot.dropped?.includes(path) || await store.stat(path) !== null) throw fail('changed', 'The recording changed, so it was not deleted.');
			return {...snapshot, name: current.name};
		});
	};
	const asset = (file, bytes) => tracked(() => owner.transact(scope, async ({index}) => {
		if (!/^(?:audio|attachments|thumbs)\//.test(file)) throw fail('name', 'This is not a local media file.');
		const before = await store.read(file);
		if (before != null && await digest(before) !== await digest(bytes)) throw fail('collision', 'A file with this name is already here; it was kept.');
		return {kind: 'media', index: before == null ? reviveMedia(index, file, await digest(bytes)) : index, writes: before == null ? [{file, bytes, createOnly: true}] : []};
	}));
	// THE ONE RECORDING-REACHABILITY ADMISSION (Astra R87j N02, R85b).
	//
	// "No note names it any more" was only ever half the question. A surviving note's RETAINED PAST
	// names the recording too, and a person who deletes note A has authorised nothing whatever
	// against note B's history -- so deleting A must never take the bytes B's old version plays.
	// Astra reproduced exactly that: two notes named audio/Shared.webm, B was saved without the
	// link so the reference lived on only in B's first retained version, A went to Trash and then
	// Delete Forever, and the recording was gone. B still had two valid, materialisable versions and
	// its first one still said `[Recording 0:02](audio/Shared.webm)`; there was no longer any audio
	// at that path. D10's relocation makes a retained version name the RIGHT recording, and this
	// cleanup could then remove it.
	//
	// So the roots are every note that survives this folder AND every retained version of those
	// notes, read from the same immutable, verified history objects the version sheet materialises,
	// inside this same transaction under this same lock. Not an index and not a second owner:
	// nothing is stored, nothing is cached between calls, and there is no dependency overlay to fall
	// out of date. Content hashes are deduplicated as the scan runs, so two notes whose pasts share
	// one object -- and one note's many versions of the same words -- materialise once.
	//
	// A NOTE THAT IS GONE IS NOT A ROOT. Its past went with it, and treating it as one would mean
	// the ordinary case (delete the one note that ever named a recording) could never reclaim that
	// recording at all.
	//
	// AND A PAST THAT CANNOT BE READ OR VERIFIED KEEPS THE RECORDING, and says which note's past
	// could not be checked. An unreadable history is not evidence that nothing points at these
	// bytes; that is the conservative half of R85b, and it is the same answer this operation already
	// gives for a note whose bytes are not text.
	const retainedReference = async (name, index, files) => {
		const checked = new Set();
		for (const file of files) {
			if (!isNoteFile(file)) continue;
			const id = index.notes?.[file]?.id;
			if (typeof id !== 'string' || !id) continue;
			let path;
			// An identity this folder has not admitted yet has no manifest name and so no past.
			try { path = manifestName(id); } catch (_) { continue; }
			let manifest;
			try { manifest = parseManifest(await store.read('history/' + path), {noteId: id, now: clock()}); }
			catch (error) { throw fail('unreadable', 'The retained past of ' + file + ' could not be read, so this recording was kept in case one of its old versions plays it.'); }
			for (const version of manifest.versions) {
				if (checked.has(version.hash)) continue;
				checked.add(version.hash);
				let past;
				try { past = await materialize(manifest, version.id, object => store.read('history/' + object)); }
				catch (error) { throw fail('unreadable', 'A retained version of ' + file + ' could not be verified, so this recording was kept in case it plays it.'); }
				if (recordingsOf(past.text).some(row => row.name === name)) throw fail('referenced', 'A retained version of ' + file + ' still uses this recording. It was kept.');
			}
		}
	};
	const discardAudio = (name, {expectedDigest} = {}) => owned((lease, before) => lease.transact(async ({index, files, bodies}) => {
		if (!validRecordingName(name)) throw fail('name', 'This recording name is not a sibling file.');
		if (files.some(file => !bodies.has(file))) throw fail('changed', 'The folder gained a note while its recordings were being checked. The recording was kept.');
		for (const bytes of bodies.values()) {
			let text; try { text = decode(bytes); } catch (_) { throw fail('unreadable', 'A note could not be checked for recordings. The recording was kept.'); }
			if (recordingsOf(text).some(row => row.name === name)) throw fail('referenced', 'A note still uses this recording. It was kept.');
		}
		// `files` is the listing this transaction read under the lock, and the guard above has already
		// established that every one of them is a note this transaction holds the bytes of. So it is
		// the set of surviving notes, which is what the retained past is asked about.
		await retainedReference(name, index, files);
		const file = 'audio/' + name, bytes = await store.read(file);
		if (expectedDigest !== undefined && bytes != null && await digest(bytes) !== expectedDigest) throw fail('changed', 'This recording changed; nothing was lost.');
		const proof = bytes == null ? null : expectedDigest ?? await digest(bytes);
		return {kind: 'discard-recording', index: proof ? await forgetMedia(index, file, proof) : index, removes: bytes == null ? [] : [{file, expectedDigest: proof}]};
	}, {bodies: before.files}));
	const importBatch = build => owned(async (lease, before) => {
		const result = await build({index: copy(before.index), files: before.files.slice(), bodies: before.bodies, audioNames: await store.list('audio'), attachmentNames: await store.list('attachments'), ascii: store.ascii});
		// An exact repeated export is a read, including the generation and durable receipt.
		if ((result.alreadyImported || result.repeatConflict) && !result.notes?.length && !result.attachments?.length && !result.audio?.length && !result.backupFiles?.length && !result.sections?.length && !result.index) return {...before, result};
		const names = new Set(before.files.map(n => n.toLowerCase())), writes = new Map();
		for (const note of result.notes) {
			if (!isNoteFile(note.file) || names.has(note.file.toLowerCase())) throw fail('collision', 'An import name is occupied. The import was not renamed behind its links.');
			names.add(note.file.toLowerCase());
		}
		for (const row of result.backupFiles || []) {
			if (!isNoteFile(row.name) && !/^(?:audio|attachments|thumbs)\/[^/\\]+$/.test(row.name)) throw fail('name', 'This backup includes a file this Notes folder cannot safely restore: ' + row.name + '. Nothing from this pick was written.');
		}
		// Publish objects first under this same lease, then their Markdown links. A failed
		// later import keeps earlier copies in Saved files, never half-owned by a note.
		const attachmentMap = new Map();
		result.createdFiles = [];
		for (const row of result.attachments || []) {
			const kept = await keepAttachment(lease, row.name, row.bytes);
			attachmentMap.set(row.name, kept.name);
			result.createdFiles.push({file: 'attachments/' + kept.name, bytes: row.bytes});
		}
		for (const note of result.notes) if (!note.exactBackup && !isCodeFile(note.file)) note.text = rewriteAttachmentNames(note.text, attachmentMap);
		const audioMap = new Map(), takenAudio = await store.list('audio');
		for (const audio of result.audio || []) {
			const name = audioName(audio.note || 'Recording.md', audio.mime, audio.name, takenAudio); takenAudio.push(name); audioMap.set(audio.name, name);
			writes.set('audio/' + name, {file: 'audio/' + name, bytes: audio.bytes, createOnly: true});
		}
		for (const row of result.backupFiles || []) {
			// A backup's paths were allocated together with its Markdown. Never publish a
			// note after losing a create-only media race to different bytes at that path.
			if (row.name.startsWith('attachments/')) await keepAttachment(lease, row.name.slice(12), row.bytes, {exact: true});
			else writes.set(row.name, {file: row.name, bytes: row.bytes, createOnly: true});
		}
		const snapshot = await lease.transact(async ({index}) => {
			if (result.index) { const generation = index.folderGeneration; index = copy(result.index); if (result.attachments?.length || result.backupFiles?.some(row => row.name.startsWith('attachments/'))) index.folderGeneration = generation; }
			for (const section of result.sections || []) index = addSection(index, section);
			for (const note of result.notes) {
				if (note.entry?.category) index = addSection(index, note.entry.category);
				index = createEntry(index, note.file, note.entry || {});
				if (!note.exactBackup && !isCodeFile(note.file)) note.text = rewriteRecordingNames(note.text, audioMap);
				if (!note.exactBackup || !writes.has(note.file)) writes.set(note.file, {file: note.file, bytes: (note.exactBackup || isCodeFile(note.file)) && note.bytes ? note.bytes : exactBytes(note.text), createOnly: true});
			}
			for (const section of result.sectionsAdded || []) if (section?.collapsed === true && !before.index.sections.some(row => row.name === section.name)) index = setCollapsed(index, section.name, true);
			for (const row of writes.values()) if (/^(?:audio|attachments)\//.test(row.file)) index = reviveMedia(index, row.file, await digest(row.bytes));
			return {kind: 'import', index, writes: [...writes.values()]};
		});
		for (const row of writes.values()) if (/^audio\//.test(row.file) && !(snapshot.dropped || []).includes(row.file)) result.createdFiles.push({file: row.file, bytes: row.bytes});
		result.createdSections = snapshot.index.sections.filter(section => !before.index.sections.some(old => old.name === section.name));
		return {...snapshot, result};
	});
	const restoreSnapshot = async entries => {
		// Full source verification precedes the lease and every destination effect. The
		// owner stages one verified file at a time and publishes the original sidecar last.
		const plan = entries?.parts ? await planSnapshotStream(entries) : await planSnapshot(entries), sidecar = plan.files.find(row => row.name === NOTES_INDEX_FILE);
		let indexBytes = sidecar.bytes ?? await sidecar.read(), renewedState = null;
		const writes = [];
		for (const row of plan.files) {
			if (row === sidecar) continue;
			if (row.name === SYNC_STATE_FILE) {
				// The exact-restore journal is note/support bytes only (notes/owner.mjs's own
				// `restoring` write classification has no room for the checkpoint file); a carried
				// checkpoint is staged and installed as its own ordinary owner transaction right
				// after, below, never inside the exact-restore journal itself.
				const bytes = row.bytes ?? await row.read(), state = decodeSyncState(bytes);
				if (state.vault || state.head) {
					// A carried checkpoint is not a second writer for this folder's future notes
					// and publications. The identity renewal below happens once, before the journal
					// is prepared -- never again on replay -- so an interrupted restore resumes with
					// the same fresh identity instead of minting a new one every retry. Only the
					// local sync envelope changes: every note and support file still lands byte for
					// byte (docs/notes-restore.md).
					const raw = JSON.parse(decode(indexBytes).replace(/^﻿/, ''));
					raw.folderDeviceId = crypto.randomUUID().replace(/-/g, '');
					indexBytes = exactBytes(JSON.stringify(raw));
					plan.index = parseIndex(decode(indexBytes));
					renewedState = {rejoin: true, ...(state.vault ? {vault: {...state.vault, credential: null}} : {})};
				}
				continue;
			}
			writes.push({file: row.name, size: row.size ?? row.bytes.length, digest: row.sha256 ?? await sha256(row.bytes), read: row.read ?? (() => row.bytes), createOnly: true});
		}
		return tracked(async () => {
			const lease = await owner.acquire(scope);
			try {
				const snapshot = await lease.transact({kind: 'restore', index: plan.index, exactIndex: indexBytes, writes}, {exactRestore: true});
				deviceId = snapshot.index.folderDeviceId || '';
				if (renewedState) {
					const write = await syncStateWrite(renewedState, null);
					await lease.transact(({index}) => ({kind: 'sync-restore', index, writes: [write]}), {brief: true});
				}
				// The exact publication is the backup's own sidecar: ids and namespaces stay the backup's
				// bytes, for a later read to admit (docs/notes-restore.md), except a renewed writer above.
				return {...snapshot, verification: plan.verification};
			} finally { await lease.release(); }
		});
	};
	// Undo removes only proved import-owned history. Manifests settle before their objects and
	// media: a late-kept manifest must still be able to own every byte it names.
	const finishImportUndo = async (lease, before, record) => {
		if (record.undo.cleanup || !record.createdFiles?.length && !record.createdSections?.length && !record.createdHistory?.length) return before;
		const matches = async row => { const bytes = await store.read(row.file); return bytes != null && bytes.length === row.byteLength && await digest(bytes) === row.digest; };
		if (!record.undo.historyCleanup && record.createdHistory?.some(row => row.file.startsWith('history/manifests/'))) {
			const ids = new Set(record.written.filter(row => record.undo.requested.includes(row.file)).map(row => row.id)), live = new Set(Object.values(before.index.notes).map(row => row.id)), removes = [], kept = [];
			for (const row of record.createdHistory.filter(row => row.file.startsWith('history/manifests/'))) {
				const id = row.file.slice('history/manifests/'.length, -5).replace('!', ':');
				if (!ids.has(id) || live.has(id) || !await matches(row)) kept.push(row.file);
				else removes.push({file: row.file, expectedDigest: row.digest});
			}
			before = await lease.transact(({index}) => {
				index.imports = index.imports.map(row => row.id === record.id ? {...row, undo: {...row.undo, historyCleanup: {requested: removes.map(row => row.file), kept}}} : row);
				return {kind: 'import-undo-history', index, removes};
			});
			record = before.index.imports.find(row => row.id === record.id);
		}
		const refs = record.createdFiles?.length ? await scanReferences(before) : null, removes = [], kept = [], shared = new Set();
		for (const leaf of await store.list('history/manifests')) {
			const bytes = await store.read('history/manifests/' + leaf);
			if (bytes == null) throw fail('changed', 'Retained history changed during import undo. Its files were kept.');
			let manifest;
			try { manifest = parseManifest(bytes, {noteId: leaf.replace(/\.json$/, '').replace('!', ':'), now: clock()}); }
			catch (_) { throw fail('unreadable', 'Retained history could not be verified during import undo. Its files were kept.'); }
			for (const [hash, object] of Object.entries(manifest.objects)) { shared.add(hash); for (const blob of object.blobs) shared.add(blob.hash); }
		}
		for (const row of [...(record.createdFiles || []), ...(record.createdHistory || []).filter(row => !row.file.startsWith('history/manifests/'))]) {
			let why = !await matches(row) ? 'is absent or changed since this import' : '';
			if (!why && row.file.startsWith('history/')) { if (shared.has(row.file.split('/').at(-1))) why = 'is retained by note history'; }
			else if (!why) {
				const slash = row.file.indexOf('/'), kind = row.file.startsWith('audio/') ? 'recordings' : 'attachments', uses = refs[kind].get(row.file.slice(slash + 1));
				why = uses?.history.length ? 'is retained by note history' : uses?.live.length || uses?.trash.length ? 'is used by a remaining note' : '';
			}
			if (why) kept.push({file: row.file, why}); else removes.push({file: row.file, expectedDigest: row.digest});
		}
		return lease.transact(async ({index}) => {
			const sections = importUndoSections(record, index), removedSections = index.sections.filter(row => !sections.includes(row)).map(row => row.name);
			index.sections = sections;
			index.imports = index.imports.map(row => row.id === record.id ? {...row, undo: {...row.undo, cleanup: {requested: removes.map(row => row.file), kept, sections: removedSections}}} : row);
			for (const row of removes) if (/^(?:attachments|audio)\//.test(row.file)) index = await forgetMedia(index, row.file, row.expectedDigest);
			return {kind: 'import-undo-files', index, removes};
		});
	};
	// The stored receipt is authority, never the caller's copy or a list of filenames from the UI.
	// Reuse the owner's journal, not Trash's separate tombstone/thumbnail collection protocol.
	const importUndo = (receipt, {files, keep = []}, commit) => {
		const id = receipt?.id, options = {files: files?.slice(), keep: keep.slice()};
		return owned(async (lease, before) => {
			const recorded = index => {
				const found = (index.imports || []).filter(row => row?.id === id);
				if (typeof id !== 'string' || !id || found.length !== 1) throw fail('import-undo', 'This import record is no longer in the folder. Nothing was undone.');
				const row = found[0], why = importUndoReadiness(row);
				if (why && why !== 'this import was already undone') throw fail('import-undo', why);
				return row;
			};
			let record = recorded(before.index);
			if (record.undo) {
				const snapshot = commit ? await finishImportUndo(lease, before, record) : before;
				return {...snapshot, receipt: copy(snapshot.index.imports.find(row => row.id === id)), plan: planImportUndo(record, before.index, new Map()), result: {removed: [], kept: copy(record.undo.kept), alreadyUndone: true}, history: []};
			}
			const listed = new Set(before.files), names = record.written.map(row => row.file).filter(file => listed.has(file));
			if (!commit) {
				const snapshot = await lease.read({bodies: names}); record = recorded(snapshot.index);
				return {...snapshot, receipt: copy(record), plan: planImportUndo(record, snapshot.index, snapshot.bodies, options)};
			}
			let plan, history;
			let snapshot = await lease.transact(({index, bodies}) => {
				record = recorded(index);
				plan = planImportUndo(record, index, bodies, options);
				if (plan.refuse) throw fail('import-undo', plan.refuse);
				const proofs = new Map(record.written.map(row => [row.file, row]));
				history = []; // Explicit Undo discards unchanged arrivals; it creates no new retained version.
				index.notes = Object.fromEntries(plan.entries);
				index.imports = index.imports.map(row => row.id === id ? recordImportUndo(record, plan, {stamp: clock()}) : row);
				return {kind: 'import-undo', index, removes: plan.remove.map(file => ({file, expectedDigest: proofs.get(file).digest}))};
			}, {bodies: names});
			const present = new Set(snapshot.files), removed = plan.remove.filter(file => !present.has(file)), deleted = new Set(removed), kept = [...plan.kept,
				...plan.remove.filter(file => present.has(file)).map(file => ({file, why: 'changed while undo was being committed; its current words were kept'}))];
			history = history.filter(row => deleted.has(row.file));
			snapshot = await finishImportUndo(lease, snapshot, snapshot.index.imports.find(row => row.id === id), history);
			return {...snapshot, receipt: copy(snapshot.index.imports.find(row => row.id === id)), plan,
				result: {removed, kept, alreadyUndone: false}, history};
		});
	};
	const previewImportUndo = (receipt, options = {}) => importUndo(receipt, options, false);
	const undoImport = (receipt, options = {}) => importUndo(receipt, options, true);
	const captureFiles = async () => {
		const rows = [];
		for (const prefix of ['', 'audio', 'attachments']) for (const name of await store.list(prefix)) {
			if (name === OWNER_JOURNAL_FILE && !prefix) throw fail('pending', 'The notes folder has a pending save. Let it finish before making a backup.');
			if (/^\..*\.tmp$/.test(name)) continue;
			const path = prefix ? prefix + '/' + name : name, bytes = await store.read(path);
			if (bytes == null) throw fail('changed', 'The notes changed while the backup was collected. Try Backup again.');
			rows.push({name: path, bytes, modified: clock()});
		}
		return rows;
	};
	// One lease spans inventory, hashing and every source read. Read-only stores cannot take
	// a writer lease; their sidecar and pending journal bracket the read instead.
	const backupSnapshot = async () => {
		let lease;
		try {
			if (store.writable !== false && (!isShared() || locks?.request && channel?.postMessage)) lease = await owner.acquire(scope);
			const snapshot = lease ? await lease.read() : await owner.read(scope);
			const first = await store.read(NOTES_INDEX_FILE), pending = await store.read(OWNER_JOURNAL_FILE);
			if (pending != null) throw fail('pending', 'A note is still being saved. Try Backup again when it has finished.');
			let released = false;
			return {index: snapshot.index, generation: snapshot.generation,
				current: async () => !released && await digest(first) === await digest(await store.read(NOTES_INDEX_FILE)) && await store.read(OWNER_JOURNAL_FILE) == null,
				release: async () => { if (released) return; released = true; await lease?.release(); }};
		} catch (error) { await lease?.release(); throw error; }
	};
	const capture = async () => {
		if (store.writable === false || isShared() && (!locks?.request || !channel?.postMessage)) {
			const first = await store.read(NOTES_INDEX_FILE), pending = await store.read(OWNER_JOURNAL_FILE); await read(); const entries = await captureFiles();
			if (await digest(first) !== await digest(await store.read(NOTES_INDEX_FILE)) || await digest(pending) !== await digest(await store.read(OWNER_JOURNAL_FILE))) throw fail('busy', 'The folder changed while the backup was collected. Try Backup again.');
			return entries;
		}
		try { return await owned(async () => captureFiles()); }
		catch (error) { if (error.code === 'read-only' && store.writable === false) return capture(); throw error; }
	};
	const readFile = async file => {
		if (store.writable === false || isShared() && (!locks?.request || !channel?.postMessage)) {
			const first = await store.read(NOTES_INDEX_FILE), pending = await store.read(OWNER_JOURNAL_FILE), snapshot = await read();
			const listed = isNoteFile(file) && snapshot.files.includes(file);
			const bytes = isNoteFile(file) && !listed ? null : await store.read(file);
			if (listed && bytes == null) throw fail('changed', 'The note disappeared while it was read. Try opening it again.');
			if (await digest(first) !== await digest(await store.read(NOTES_INDEX_FILE)) || await digest(pending) !== await digest(await store.read(OWNER_JOURNAL_FILE))) throw fail('busy', 'The folder changed while the file was read. Try opening it again.');
			return bytes;
		}
		try { return await owned(async () => store.read(file)); }
		catch (error) { if (error.code === 'read-only' && store.writable === false) return readFile(file); throw error; }
	};
	const recordingCustody = createRecordings({store, owned, underLease, locks, scope, shared: isShared, clock, audioName, discardAudio,
		canOwn: () => store.writable !== false && (!isShared() || !!(locks?.request && channel?.postMessage)), readSnapshot: () => owner.read(scope)});
	return {beginRecording: recordingCustody.begin, recoverRecordings: recordingCustody.recover, openRecording: recordingCustody.open, readRecording: recordingCustody.preview, acknowledgeRecording: recordingCustody.acknowledge,
		owner, store, scope, read, rebuildIndex, metadata, reminderActions, leaveVault, create, createShared, save, rename, trash, discardEmpty, mark, createAudio, createAttachment, attachmentReferences, fileReferences, reviewAttachmentDeletion, deleteAttachment, reviewRecordingDeletion, deleteRecording, asset, discardAudio, importBatch, restoreSnapshot, previewImportUndo, undoImport, backupSnapshot, capture, readFile, get deviceId() { return deviceId; }, get pending() { return pending; }, close: () => { recordingCustody.close(); owner.close(); channel?.close?.(); }};
}
